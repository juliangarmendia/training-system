-- Coach v2.1 · A-4 (2026-09-08): los datos entran solos. pg_cron + pg_net llaman a las edge
-- functions de sync sin que nadie abra la app.
-- Aplicada en el proyecto ycfodifvpvosukepcxie vía MCP (migración "integrations_cron").
--
-- POR QUÉ UN CRON Y NO SÓLO WEBHOOKS. El webhook de WHOOP es la vía rápida, pero se pierde:
-- WHOOP reintenta cinco veces en una hora y luego se rinde, y Withings cancela la suscripción
-- tras 20 días de fallos. El cron es la red debajo del trapecio: aunque no llegue un solo
-- evento, cada mañana los datos acaban en `wellness` y `bodyweight`.
--
-- POR QUÉ LOS SECRETOS ESTÁN EN VAULT Y NO EN EL FICHERO. El job vive dentro de la base y
-- necesita el JWT anon (para pasar el `verify_jwt` del gateway) y el `x-cron-secret` (la auth
-- de verdad). Escribirlos aquí los metería en el repo y en `cron.job.command`, visible en
-- cualquier `select`. `vault.decrypted_secrets` los descifra sólo para quien ejecuta la
-- función, y la función tiene EXECUTE revocado a todo el mundo salvo el dueño.
--
-- LOS TRES SECRETOS SE CREAN A MANO ANTES (A-2 los sembró): `project_url`, `anon_key`
-- (JWT legacy `eyJ…`, no una clave `sb_publishable_*`) y `CRON_SECRET` (el MISMO valor que el
-- secreto de función que comprueba `whoop-sync`). Esta migración ABORTA si falta alguno: es
-- preferible no instalar nada a dejar cuatro jobs fallando en silencio cada media hora.

-- `pg_cron` va a `pg_catalog` (donde lo pone Supabase) y `pg_net` a `extensions`: crearlo sin
-- esquema lo deja en `public` y el linter avisa (0014, extension_in_public). Los objetos de
-- pg_net viven en el esquema `net` en cualquier caso, así que `net.http_post` no cambia.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ── 0. Portazo temprano si Vault no está sembrado ──────────────────────────────────────────
do $$
declare missing text[];
begin
  select array_agg(n) into missing
  from unnest(array['project_url','anon_key','CRON_SECRET']) as n
  where not exists (select 1 from vault.decrypted_secrets s where s.name = n);
  if missing is not null then
    raise exception 'Faltan secretos en Vault: %. Créalos antes de aplicar esta migración.', array_to_string(missing, ', ');
  end if;
end;
$$;

-- ── 1. cron_call_fn ────────────────────────────────────────────────────────────────────────
-- Una sola puerta desde la base hacia las edge functions. `net.http_post` es ASÍNCRONA:
-- devuelve el id de la petición y la respuesta aterriza en `net._http_response`. Por eso las
-- funciones de sync responden 202 y trabajan bajo `waitUntil` — con `timeout_milliseconds` de
-- 5 s, esperar el resultado marcaría el job como fallido en cada ejecución correcta.
create or replace function public.cron_call_fn(p_fn text, p_body jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, net, vault, extensions
as $$
declare
  v_url  text;
  v_anon text;
  v_cron text;
  v_req  bigint;
begin
  select decrypted_secret into v_url  from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_anon from vault.decrypted_secrets where name = 'anon_key';
  select decrypted_secret into v_cron from vault.decrypted_secrets where name = 'CRON_SECRET';

  if v_url is null or v_anon is null or v_cron is null then
    raise exception 'cron_call_fn: faltan secretos en Vault (project_url / anon_key / CRON_SECRET)';
  end if;
  if p_fn !~ '^[a-z0-9-]{1,60}$' then
    raise exception 'cron_call_fn: nombre de función inválido %', p_fn;
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || p_fn,
    headers := jsonb_build_object(
      'Content-Type',   'application/json',
      'Authorization',  'Bearer ' || v_anon,
      'x-cron-secret',  v_cron
    ),
    body := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 5000
  ) into v_req;

  return v_req;
end;
$$;

revoke execute on function public.cron_call_fn(text, jsonb) from public, anon, authenticated;

-- ── 2. Jobs ────────────────────────────────────────────────────────────────────────────────
-- Idempotente: se desprograma por nombre antes de volver a programar, para que reaplicar la
-- migración no deje dos jobs iguales disparando a la vez.
do $$
declare j record;
begin
  for j in
    select jobid from cron.job
    where jobname in ('whoop-sync-30m','whoop-sync-daily','withings-sync-daily','integration-events-gc')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

-- HORARIOS EN UTC. `*/30 3-12` = 03:00-12:30 UTC, que en Madrid son las 04:00-13:30 en
-- invierno (UTC+1) y las 05:00-14:30 en verano (UTC+2). La franja cubre la mañana entera todo
-- el año, que es cuando WHOOP puntúa la noche; fuera de ella no hay nada nuevo que traer.
select cron.schedule('whoop-sync-30m', '*/30 3-12 * * *',
  $job$select public.cron_call_fn('whoop-sync', '{"days":2}'::jsonb)$job$);

-- Una pasada ancha al mediodía: recoge lo que WHOOP puntuó tarde y, de paso, mantiene el
-- refresh token en uso a diario (su vida no está documentada; con ejercicio diario nunca
-- queda ocioso más de 24 h).
select cron.schedule('whoop-sync-daily', '0 12 * * *',
  $job$select public.cron_call_fn('whoop-sync', '{"days":7}'::jsonb)$job$);

-- Withings: tres días de margen y `resubscribe` idempotente — Withings cancela la suscripción
-- de notificaciones tras 20 días de entregas fallidas, y renovarla a diario sale gratis.
select cron.schedule('withings-sync-daily', '15 12 * * *',
  $job$select public.cron_call_fn('withings-sync', '{"days":3,"resubscribe":true}'::jsonb)$job$);

-- La bitácora de webhooks no es histórico útil pasados dos meses.
select cron.schedule('integration-events-gc', '30 4 * * 1',
  $job$delete from public.integration_events where received_at < now() - interval '60 days'$job$);
