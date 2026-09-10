-- C-12 (auditoría 2026-09-09): los eventos HUÉRFANOS de `integration_events`.
--
-- EL FALLO QUE ESTA MIGRACIÓN EXISTE PARA IMPEDIR. Un webhook tiene que responder 2xx antes de
-- trabajar (WHOOP reintenta cinco veces en una hora si tardamos; Withings cancela la
-- suscripción tras 20 días de entregas fallidas), así que la fila se inserta como `received` y
-- el sync va detrás, bajo `EdgeRuntime.waitUntil`. Ese `waitUntil` PUEDE MORIR: un deploy a
-- mitad, un OOM, el límite de vida del isolate. Cuando muere, la fila se queda en `received`
-- para siempre y pasan dos cosas, las dos silenciosas:
--
--   1. El proveedor reintenta y el alta choca con el índice único `(provider, trace_id)`. Con
--      `ignoreDuplicates` el webhook responde 200 y NO HACE NADA: el reintento, que era la
--      segunda oportunidad, se convierte en la garantía de que el dato no entre nunca.
--   2. El GC semanal la borra a los 60 días sin haberla procesado. Nadie mira
--      `integration_events`, así que nadie se entera de que faltó una noche o una pesada.
--
-- EL ARREGLO TIENE DOS MITADES Y LAS DOS HACEN FALTA:
--   · Aquí: un job cada 30 minutos marca como `error` todo `received` de más de 30 minutos.
--     Eso los saca del limbo y los hace visibles (`select ... where status = 'error'`).
--   · En las funciones (`_shared/events.ts`, `openEvent`): cuando el alta choca con un
--     duplicado cuya fila está en `error`, se REABRE a `received` y se procesa. El reintento
--     del proveedor vuelve a servir para algo.
--
-- POR QUÉ 30 MINUTOS. Es holgado: el sync más largo (`syncWithings` de 90 días) no pasa de
-- decenas de segundos, y el límite de un isolate está muy por debajo de la media hora. Nada
-- vivo puede quedar dentro de la ventana, así que el job no puede pisar un trabajo en curso.
-- Y por debajo queda la red del cron de sync (`whoop-sync-30m`, `withings-sync-daily`), que
-- vuelve a traer el rango aunque el evento no se recupere.
--
-- POR QUÉ `error` Y NO `received` OTRA VEZ. `received` significa "alguien está en ello": si el
-- job lo dejara ahí, no habría forma de distinguir un huérfano de un evento vivo, ni en la
-- consulta ni en `openEvent`. `error` con el motivo escrito es un estado terminal y auditable
-- del que sólo se sale por un reintento del proveedor.
--
-- Aplicar en el proyecto ycfodifvpvosukepcxie. Idempotente: se puede reaplicar.

-- ── 1. La función ──────────────────────────────────────────────────────────────────────────
-- `security definer` como `cron_call_fn`: el job corre como el dueño y la tabla tiene RLS con
-- todo revocado a anon/authenticated. Devuelve cuántas filas tocó para que
-- `cron.job_run_details` no sea sólo un "succeeded" sin contenido.
create or replace function public.integration_events_requeue_orphans()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  update public.integration_events
     set status       = 'error',
         error        = 'orphan: processing never finished',
         processed_at = now()
   where status = 'received'
     and received_at < now() - interval '30 minutes';
  get diagnostics v_count = row_count;
  if v_count > 0 then
    raise log 'integration_events_requeue_orphans: % evento(s) huérfano(s) marcados', v_count;
  end if;
  return v_count;
end;
$$;

-- Nadie más que el dueño la ejecuta: con `security definer` y sin esto, cualquier cliente con
-- la clave anon podría escribir en la bitácora de webhooks.
revoke execute on function public.integration_events_requeue_orphans() from public, anon, authenticated;

-- ── 2. El job ──────────────────────────────────────────────────────────────────────────────
-- Idempotente: se desprograma por nombre antes de volver a programar (reaplicar la migración
-- no puede dejar dos jobs iguales disparando a la vez).
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'integration-events-orphans' loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

-- Cada 30 minutos, todo el día: los webhooks llegan a cualquier hora (WHOOP puntúa la noche por
-- la mañana, la báscula se usa cuando se usa), así que la franja horaria del cron de sync no
-- sirve aquí.
select cron.schedule('integration-events-orphans', '*/30 * * * *',
  $job$select public.integration_events_requeue_orphans()$job$);
