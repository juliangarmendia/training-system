-- A-7 (2026-09-10/11): Strava e intervals.icu al servidor. Cierra C-8 de la auditoría 2026-09-09.
--
-- EL FALLO QUE ESTA MIGRACIÓN EXISTE PARA IMPEDIR. Dos credenciales de larga vida seguían en el
-- teléfono, y las dos por la misma razón: nunca hubo sitio para ellas en la base.
--
--   · **Strava** guardaba `strava_access_token` y `strava_refresh_token` en `localStorage`.
--     Strava ROTA el refresh token en cada refresco, igual que WHOOP: la PWA instalada y Safari
--     (almacenamientos separados en iOS) refrescaban con el mismo valor viejo y el segundo
--     recibía `{field:"refresh_token", code:"invalid"}` → "Strava se ha desconectado sola". Es
--     exactamente el fallo que A-1 arregló para WHOOP, esperando su turno.
--   · **intervals.icu** guardaba la API key en `state.settings.intervalsIcuApiKey`, que
--     `smartPut` SINCRONIZABA a la tabla `settings` y metía dentro del JSON de "exportar copia
--     de seguridad" — un fichero compartible. Esa clave tiene permiso de ESCRITURA: la app
--     empuja semanas de entrenamiento al COROS por la misma API. El 09-sep se filtró del push
--     como parche (`LOCAL_ONLY_KEYS`); esto la saca del teléfono.
--
-- EL BLOQUEO REAL ERA UNA LÍNEA DE SQL. `integration_tokens.provider` tiene
-- `check (provider in ('whoop','withings'))`, así que insertar `'strava'` o `'intervals'` falla
-- con un 23514 — y lo mismo en `integration_status` (donde escribe el trigger espejo, así que
-- un check desalineado haría fallar el INSERT de tokens por debajo) y en `oauth_states`. Sin
-- esta migración, todo el código de A-7 se despliega y no puede guardar una sola credencial.
--
-- POR QUÉ CADA COSA ESTÁ COMO ESTÁ:
--
--   1. **Los tres checks se recrean, no se "amplían".** Postgres no sabe modificar un CHECK: se
--      borra y se vuelve a crear. Se hace con `not valid` + `validate constraint` para que la
--      validación no tome un lock de escritura largo sobre la tabla; con 4 filas es irrelevante,
--      pero el patrón correcto no cuesta nada y esta tabla la escribe el cron.
--   2. **`oauth_states` NO recibe `intervals`.** Esa tabla es el CSRF del flujo OAuth, e
--      intervals.icu no tiene OAuth: su credencial se guarda con `intervals-sync set_key`, con
--      el JWT del usuario. Dejar `'intervals'` en el check permitiría insertar un `state` que
--      nunca podría canjearse — un camino muerto que parece vivo. `integrations-oauth` ya
--      rechaza `authorize` para él (`code: 'apikey_provider'`), y esto lo respalda en la base.
--   3. **`merge_generic_row` suma `steps`, `runs` y `sessions` a la lista blanca.** Los dos
--      importadores de actividad (Strava e intervals.icu) escriben las MISMAS filas de `runs` y
--      `sessions` — la misma carrera de un COROS llega por los dos caminos — y el usuario puede
--      haber escrito una sensación (`feel`) sobre una carrera importada. Un upsert de PostgREST
--      REEMPLAZA la columna `data` entera, así que borraría lo que aportó el otro escritor. Con
--      `data || excluded.data` cada uno aporta sus claves y no pisa las demás; es la misma regla
--      que ya protege `wellness` y `bodyweight` del cron, del webhook y de la PWA a la vez.
--      La lista blanca sigue siendo una lista blanca: `security definer` + `p_table` dinámico
--      sin filtro sería un escritor universal.
--   4. **`runs`/`sessions` NO ganan un índice nuevo.** `strava-sync` hacía el upsert con
--      `on_conflict=user_id,source,source_id`, que apunta a `runs_source_id_idx` — un índice
--      único PARCIAL (`where source is not null`). Postgres no infiere un índice parcial desde
--      un `ON CONFLICT (cols)` que no repite su predicado, así que TODOS esos upserts fallaban
--      con `42P10: there is no unique or exclusion constraint matching the ON CONFLICT
--      specification`: la función respondía 200, metía el error en un `errors[]` que nadie mira
--      y contaba `synced: 0`. Comprobado contra esta base el 2026-09-10 — no hay una sola fila
--      de `runs` con `source = 'strava'` desde que existe la función. El arreglo es en el
--      código (conflicto por `(user_id, record_id)`, que sí es una clave real), no aquí:
--      añadir un índice total sobre `(user_id, source, source_id)` sólo taparía el síntoma.
--   5. **Los jobs leen sus secretos de Vault** vía `cron_call_fn`, como los de A-4: un JWT
--      literal aquí quedaría en el repo Y en `cron.job.command`, visible con un `select`.
--
-- Aplicar en el proyecto ycfodifvpvosukepcxie. Idempotente: se puede reaplicar.

-- ── 0. Portazo temprano si falta lo que hace falta ─────────────────────────────────────────
-- `cron_call_fn` la creó A-4 y lee `project_url` / `anon_key` / `CRON_SECRET` de Vault. Si no
-- existe, los `cron.schedule` de abajo programarían un job que falla cada día en silencio.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'cron_call_fn'
  ) then
    raise exception 'Falta public.cron_call_fn: aplicar primero 20260908_integrations_cron.sql';
  end if;
end;
$$;

-- ── 1. Los proveedores nuevos en los tres checks ───────────────────────────────────────────
alter table public.integration_tokens drop constraint if exists integration_tokens_provider_check;
alter table public.integration_tokens
  add constraint integration_tokens_provider_check
  check (provider in ('whoop','withings','strava','intervals')) not valid;
alter table public.integration_tokens validate constraint integration_tokens_provider_check;

alter table public.integration_status drop constraint if exists integration_status_provider_check;
alter table public.integration_status
  add constraint integration_status_provider_check
  check (provider in ('whoop','withings','strava','intervals')) not valid;
alter table public.integration_status validate constraint integration_status_provider_check;

-- Sólo los proveedores OAuth: ver el punto 2 de la cabecera.
alter table public.oauth_states drop constraint if exists oauth_states_provider_check;
alter table public.oauth_states
  add constraint oauth_states_provider_check
  check (provider in ('whoop','withings','strava')) not valid;
alter table public.oauth_states validate constraint oauth_states_provider_check;

-- ── 2. merge_generic_row: `steps`, `runs` y `sessions` ─────────────────────────────────────
-- Se reescribe entera (no hay forma de "añadir" a la lista blanca) conservando el resto tal
-- cual. El insert nombra sólo user_id/record_id/data/updated_at porque son las cuatro columnas
-- que existen en las CINCO tablas: `runs.id` y `bodyweight.id` son `generated always as
-- identity` (la base los pone) y `runs.source`/`source_id` se dejan a null a propósito —
-- ninguna fila escrita por la app las ha rellenado nunca y el único índice que las usa no es
-- inferible en un ON CONFLICT (punto 4 de la cabecera).
create or replace function public.merge_generic_row(
  p_table     text,
  p_user      uuid,
  p_record_id text,
  p_patch     jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_table not in ('wellness','bodyweight','steps','runs','sessions') then
    raise exception 'merge_generic_row: tabla no permitida %', p_table using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'merge_generic_row: p_patch debe ser un objeto jsonb';
  end if;
  if p_user is null or p_record_id is null or p_record_id = '' then
    raise exception 'merge_generic_row: faltan p_user o p_record_id';
  end if;

  execute format(
    'insert into public.%1$I (user_id, record_id, data, updated_at)
       values ($1, $2, $3, now())
     on conflict (user_id, record_id) do update
        set data = %1$I.data || excluded.data, updated_at = now()',
    p_table
  ) using p_user, p_record_id, p_patch;
end;
$$;

revoke execute on function public.merge_generic_row(text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.merge_generic_row(text, uuid, text, jsonb) to service_role;

-- ── 3. Los dos jobs ────────────────────────────────────────────────────────────────────────
-- Idempotente: se desprograma por nombre antes de volver a programar, para que reaplicar la
-- migración no deje dos jobs iguales disparando a la vez (y con Strava eso sería peor que
-- ruido: el segundo refrescaría el token que el primero acaba de rotar).
do $$
declare j record;
begin
  for j in
    select jobid from cron.job where jobname in ('strava-sync-daily','intervals-sync-daily')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end;
$$;

-- HORARIOS EN UTC, escalonados respecto a los de A-4 (`whoop-sync-daily` 12:00,
-- `withings-sync-daily` 12:15). Cada job tarda segundos, pero solaparlos hace que los tres
-- compitan por el mismo isolate y por el mismo rate limit del proveedor.
--
-- intervals.icu a las 12:30: 7 días de ventana. Es el HISTÓRICO — CTL/ATL/rampRate, pasos, peso
-- suavizado y macros — y se rellena con retraso, así que una ventana de una semana recoge lo
-- que el proveedor haya recalculado y no sólo lo de ayer. `activities: true` es el defecto de la
-- función; se escribe explícito para que el job diga lo que hace.
select cron.schedule('intervals-sync-daily', '30 12 * * *',
  $job$select public.cron_call_fn('intervals-sync', '{"days":7,"activities":true}'::jsonb)$job$);

-- Strava a las 12:45, y con 7 días también: un COROS puede tardar en subir una actividad, y la
-- ventana ancha es barata (una sola página de la API cubre una semana de sobra). De paso
-- mantiene el refresh token EN USO a diario — su vida no está documentada, y un token ocioso es
-- la forma en que estas integraciones mueren sin que nadie toque nada.
select cron.schedule('strava-sync-daily', '45 12 * * *',
  $job$select public.cron_call_fn('strava-sync', '{"days":7}'::jsonb)$job$);
