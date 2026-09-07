-- Coach v2.1 · A-1 (2026-09-08): almacén de tokens OAuth en SERVIDOR para WHOOP y Withings.
-- Aplicada en el proyecto ycfodifvpvosukepcxie vía MCP (migración "integrations_tokens").
--
-- POR QUÉ ESTA MIGRACIÓN EXISTE. La integración anterior guardaba los tokens de WHOOP en
-- `localStorage` de la PWA. WHOOP **rota** el refresh token en cada refresco: dos dispositivos
-- (o la PWA instalada y Safari, que en iOS tienen almacenamiento separado) refrescaban con el
-- mismo token viejo y el segundo recibía `invalid_grant` → desconexión. Aquí los tokens viven
-- en una sola fila por (usuario, proveedor), el refresco se serializa con un lease-lock
-- (`refresh_lock_until`) y la rotación se persiste en un único UPDATE atómico.
--
-- MODELO DE ACCESO. `integration_tokens` es SÓLO service role: RLS activado **sin políticas**
-- (deniega a cualquier rol que respete RLS) + `revoke all` a anon/authenticated (deniega a
-- nivel de GRANT, por si algún día alguien añade una política por error). La PWA nunca ve un
-- token: lee `integration_status`, que un trigger mantiene como espejo. Sin `pgsodium`
-- (Supabase lo está retirando); el cifrado en reposo del proyecto + este doble candado es
-- proporcionado para un solo usuario. Vault para el refresh token queda documentado como opción.

-- ── 1. integration_tokens ───────────────────────────────────────────────────────────────────
create table if not exists public.integration_tokens (
  user_id            uuid        not null references auth.users(id) on delete cascade,
  provider           text        not null check (provider in ('whoop','withings')),
  access_token       text        not null,
  refresh_token      text,
  expires_at         timestamptz,
  scope              text,
  external_user_id   text,
  status             text        not null default 'active' check (status in ('active','needs_reconnect')),
  last_refresh_at    timestamptz,
  last_error         text,
  refresh_lock_until timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, provider)
);

-- Único (provider, external_user_id): el webhook llega identificado por el id del proveedor,
-- no por el nuestro. Parcial porque `external_user_id` es null entre el upsert y el perfil.
create unique index if not exists integration_tokens_provider_external_idx
  on public.integration_tokens (provider, external_user_id)
  where external_user_id is not null;

alter table public.integration_tokens enable row level security;
revoke all on table public.integration_tokens from anon, authenticated;

-- ── 2. integration_status (espejo legible por la PWA) ───────────────────────────────────────
-- Tabla, no vista: guarda además `last_sync_at/last_sync_summary/last_event_at`, que no salen
-- de `integration_tokens` sino de las funciones de sync y de los webhooks. No es una tabla
-- genérica y NO entra en la lista de stores de `syncAll` (la PWA la lee directa).
create table if not exists public.integration_status (
  user_id           uuid        not null references auth.users(id) on delete cascade,
  provider          text        not null check (provider in ('whoop','withings')),
  status            text        not null default 'disconnected'
                                check (status in ('disconnected','active','needs_reconnect')),
  external_user_id  text,
  expires_at        timestamptz,
  last_refresh_at   timestamptz,
  last_sync_at      timestamptz,
  last_sync_summary jsonb,
  last_event_at     timestamptz,
  last_error        text,
  updated_at        timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.integration_status enable row level security;
revoke all on table public.integration_status from anon, authenticated;
grant select on table public.integration_status to authenticated;

drop policy if exists "Users see own integration_status" on public.integration_status;
create policy "Users see own integration_status" on public.integration_status
  for select using (auth.uid() = user_id);

-- ── 3. Trigger espejo ───────────────────────────────────────────────────────────────────────
-- El estado se deriva de los tokens, así que se mantiene en la base y no en el código: si un
-- día una función se olvida de actualizar el estado tras marcar `needs_reconnect`, la PWA
-- seguiría diciendo "Conectado". Aquí no puede divergir.
create or replace function public.integration_tokens_mirror_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.integration_status
      (user_id, provider, status, external_user_id, expires_at, last_refresh_at, last_error, updated_at)
    values (old.user_id, old.provider, 'disconnected', null, null, null, null, now())
    on conflict (user_id, provider) do update set
      status           = 'disconnected',
      external_user_id = null,
      expires_at       = null,
      last_refresh_at  = null,
      last_error       = null,
      updated_at       = now();
    return old;
  end if;

  insert into public.integration_status
    (user_id, provider, status, external_user_id, expires_at, last_refresh_at, last_error, updated_at)
  values (new.user_id, new.provider, new.status, new.external_user_id, new.expires_at,
          new.last_refresh_at, new.last_error, now())
  on conflict (user_id, provider) do update set
    status           = excluded.status,
    external_user_id = excluded.external_user_id,
    expires_at       = excluded.expires_at,
    last_refresh_at  = excluded.last_refresh_at,
    last_error       = excluded.last_error,
    updated_at       = now();
  return new;
end;
$$;

revoke execute on function public.integration_tokens_mirror_status() from public, anon, authenticated;

drop trigger if exists integration_tokens_mirror on public.integration_tokens;
create trigger integration_tokens_mirror
  after insert or update or delete on public.integration_tokens
  for each row execute function public.integration_tokens_mirror_status();

-- `updated_at` de los tokens al día sin depender de que cada UPDATE lo recuerde (el UPDATE del
-- lease-lock, por ejemplo, sólo toca `refresh_lock_until`).
create or replace function public.integration_tokens_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.integration_tokens_touch() from public, anon, authenticated;

drop trigger if exists integration_tokens_touch_trg on public.integration_tokens;
create trigger integration_tokens_touch_trg
  before update on public.integration_tokens
  for each row execute function public.integration_tokens_touch();

-- ── 4. claim_refresh_lock: el mutex de refresco, en una sola sentencia ──────────────────────
-- PostgREST no sabe expresar `(refresh_lock_until is null or refresh_lock_until < now())` en un
-- solo UPDATE (`.is()` y `.lt()` sobre la misma columna se combinan con AND). Partirlo en dos
-- llamadas abriría exactamente la ventana de carrera que el lock existe para cerrar, así que la
-- condición vive aquí: un UPDATE atómico que devuelve la fila SI Y SÓLO SI hemos ganado el lease.
-- Sin fila = otro proceso está refrescando (el llamador espera y reutiliza su token nuevo).
create or replace function public.claim_refresh_lock(p_user uuid, p_provider text)
returns setof public.integration_tokens
language sql
security definer
set search_path = public
as $$
  update public.integration_tokens
     set refresh_lock_until = now() + interval '30 seconds'
   where user_id = p_user
     and provider = p_provider
     and (refresh_lock_until is null or refresh_lock_until < now())
  returning *;
$$;

revoke execute on function public.claim_refresh_lock(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_refresh_lock(uuid, text) to service_role;

-- ── 5. oauth_states ─────────────────────────────────────────────────────────────────────────
-- CSRF + vínculo con el usuario. `integrations-callback` corre con verify_jwt=false (el
-- proveedor redirige a Safari, donde no hay sesión de Supabase): esta fila ES la autenticación.
-- De un solo uso (se borra al canjear) y con ventana de 10 minutos, comprobada en el DELETE.
create table if not exists public.oauth_states (
  state       uuid        primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  provider    text        not null check (provider in ('whoop','withings')),
  redirect_to text,
  created_at  timestamptz not null default now()
);
create index if not exists oauth_states_created_idx on public.oauth_states (created_at);
alter table public.oauth_states enable row level security;
revoke all on table public.oauth_states from anon, authenticated;

-- ── 6. integration_events ───────────────────────────────────────────────────────────────────
-- Bitácora de webhooks. El único índice que importa es (provider, trace_id): los proveedores
-- reintentan, y sin deduplicar el mismo evento se procesaría dos veces.
create table if not exists public.integration_events (
  id               bigint generated by default as identity primary key,
  provider         text        not null,
  type             text        not null,
  external_user_id text,
  external_id      text,
  trace_id         text,
  received_at      timestamptz not null default now(),
  processed_at     timestamptz,
  status           text        not null default 'received'
                               check (status in ('received','processed','ignored','error')),
  error            text,
  payload          jsonb
);
-- NO parcial a propósito: un índice único parcial no sirve como árbitro de
-- `insert … on conflict (provider, trace_id) do nothing` (Postgres sólo infiere un índice
-- parcial si la sentencia repite su predicado, y PostgREST no sabe expresarlo). Con el índice
-- completo el árbitro funciona, y los `trace_id` nulos siguen siendo distintos entre sí.
create unique index if not exists integration_events_provider_trace_idx
  on public.integration_events (provider, trace_id);
create index if not exists integration_events_received_idx
  on public.integration_events (received_at desc);
alter table public.integration_events enable row level security;
revoke all on table public.integration_events from anon, authenticated;

-- ── 7. merge_generic_row ────────────────────────────────────────────────────────────────────
-- Merge atómico sobre las tablas genéricas `(user_id, record_id, data jsonb, updated_at)`.
-- El cron, el webhook y la PWA escriben el MISMO día de `wellness`: un read-modify-write desde
-- la función perdería el escrito por el otro entre la lectura y la escritura. `data || excluded.data`
-- lo resuelve dentro de la sentencia. Lista blanca de tablas y EXECUTE revocado: `security
-- definer` + `p_table` dinámico sin filtro sería un escritor universal.
-- (`bodyweight.id` es `generated always as identity` y `wellness` no tiene `id`: por eso el
-- insert nombra sólo user_id/record_id/data/updated_at, que existen en ambas.)
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
  if p_table not in ('wellness','bodyweight') then
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
