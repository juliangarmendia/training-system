# Integraciones de servidor — WHOOP y Withings

> Estado: **en producción** (2026-09-08, Coach v2.1 · A-1 a A-5). A-6 (borrar `whoop-auth`) pendiente.
> Plan completo: [`coach-v2.1-implementation-plan.md`](coach-v2.1-implementation-plan.md) § Parte A.

## Por qué existe

La integración anterior guardaba los tokens de WHOOP en `localStorage` de la PWA. WHOOP **rota** el
token de refresco en cada uso, así que dos almacenamientos —la PWA instalada y Safari, que en iOS
están separados— refrescaban con el mismo valor viejo y el segundo recibía `invalid_grant`. Además,
el authorize no pedía el permiso `offline` (podía no llegar nunca un token de refresco) e iOS
desaloja el almacenamiento de una PWA que no se abre en unos días. Resultado observado durante
meses: *"WHOOP se ha vuelto a desconectar"*.

**Principio 4 del plan:** los tokens viven en el servidor. La PWA lee filas (`wellness`,
`bodyweight`), nunca tokens.

## Arquitectura

```
                 ┌─ webhook (recovery/sleep) ─┐
   WHOOP ────────┤                            ├──▶ whoop-webhook ──┐
                 └─ pull cada 30 min (cron) ──┴──▶ whoop-sync ─────┤
                                                                   ├─▶ merge_generic_row
   Withings ─────┬─ notify (appli=1) ─────────────▶ withings-webhook┤   (wellness / bodyweight)
                 └─ pull diario (cron) ────────────▶ withings-sync ─┘            │
                                                                                 ▼
   PWA ── integrations-oauth ──▶ authorize URL ──▶ (Safari) ──▶ integrations-callback
   PWA ── integration_status ◀── trigger espejo ◀── integration_tokens
   PWA ── pullStore('wellness'|'bodyweight') ◀────────────────── Supabase
```

La PWA hace exactamente cuatro cosas (`app/integrations.js`):

1. **Lee** `integration_status` (caché 60 s en memoria).
2. **Pide** la URL del authorize a `integrations-oauth` y navega a ella.
3. **Pide** "sincroniza ahora" a `whoop-sync` / `withings-sync`.
4. **Baja** las filas resultantes con `pullStore(store)` (`app/supabase-sync.js`).

## Tablas (`supabase/migrations/20260908_integrations_tokens.sql`)

| Tabla | Qué guarda | Acceso |
|---|---|---|
| `integration_tokens` | `(user_id, provider)` → access/refresh token, `expires_at`, `scope`, `external_user_id`, `status`, `refresh_lock_until` | **Sólo service role**: RLS activado *sin políticas* + `revoke all` a anon/authenticated |
| `integration_status` | Espejo legible: `status`, `expires_at`, `last_refresh_at`, `last_sync_at`, `last_sync_summary`, `last_event_at`, `last_error` | `select` del propio usuario. **Sin columnas de token.** Mantenida por trigger sobre `integration_tokens` |
| `oauth_states` | `state` uuid de un solo uso (10 min) que liga el callback con el usuario | Sólo service role |
| `integration_events` | Todo webhook recibido, con `(provider, trace_id)` único para deduplicar reintentos | Sólo service role |

`integration_status` **no** entra en la lista de stores de `syncAll` (no es una tabla genérica: no
tiene `record_id`/`data`). La PWA la lee directa. La lista sigue en **15 stores**; lo verifica
`tests/verify-sync-writes.mjs`.

`merge_generic_row(p_table, p_user, p_record_id, p_patch)` hace
`insert … on conflict do update set data = data || excluded.data` sobre `wellness`/`bodyweight`:
merge atómico para que cron y webhook no se pisen.

## Ciclo de vida del token

1. **Alta.** `integrations-oauth {action:'authorize'}` inserta un `oauth_states` y devuelve la URL.
   WHOOP pide `offline read:recovery read:cycles read:sleep read:workout read:body_measurement
   read:profile`; Withings, `user.metrics`.
2. **Callback.** El proveedor redirige a `integrations-callback/{provider}` (`verify_jwt = false`;
   la autenticación es la fila `state`, consumida en una sola sentencia `delete … returning`). El
   servidor canja el código, **rechaza el alta si no llega token de refresco** (`offline` no
   concedido → `connect_error=no_refresh_token`), guarda y hace 302 a
   `index.html#settings?connected=<provider>`.
3. **Refresco.** `_shared/tokens.ts`: lease-lock de 30 s reclamado con un `UPDATE` atómico
   (`claim_refresh_lock`). Refresco preventivo a 5 min de la caducidad. El par rotado se persiste en
   **un único UPDATE** (`access_token, refresh_token, expires_at, status, last_refresh_at,
   last_error, refresh_lock_until`): nunca un access token nuevo con un refresh token viejo. Si otro
   proceso acaba de refrescar, se reutiliza su token sin quemar otra rotación.
4. **401.** Un refresco + **un** reintento. Si vuelve 401 → `needs_reconnect`.
5. **Reconexión obligatoria sólo si es real:** `invalid_grant` (WHOOP) o `status 401` en el refresh
   (Withings). `invalid_client`, 5xx, 429 y los errores de red **no** marcan `needs_reconnect`: el
   problema no es del usuario y reconectar no lo arregla.

## Precedencia de datos (plan A.4)

Quién manda sobre cada campo, cuando hay más de una fuente:

| Campo | Gana | Nota |
|---|---|---|
| `readiness`, `hrv`, `restingHR`, `spO2`, `skinTemp` | **WHOOP** (`readinessSource:'whoop'`) | intervals.icu llega horas más tarde con una copia degradada |
| `sleepSecs`, `sleep*Secs`, `sleepScore`, `sleepEfficiency`, `sleepConsistency`, `respiration`, `sleepNeedSecs` | **WHOOP** | `sleepSecs` = en cama − despierto (dormido) |
| `whoopStrain`, `whoopKcal`, `whoop*` | **WHOOP** | sólo de un ciclo cerrado y `SCORED` |
| `ctl`, `atl`, `rampRate`, `steps`, `weight` (suavizado) | **intervals.icu** | el servidor nunca los escribe |
| `weightMeasured`, `bodyFat`, `bodyweight[date]` | **Withings** > `tempWeight` de intervals > forward-fill | el `fatPct` del dispositivo sustituye al `bfPct` Navy del día |
| Peso **manual** del mismo día | **el manual** | Withings conserva `weight` y añade `weightWithings` + composición |
| `subjective`, `waist`, `neck`, `heightCm` | **la app** | |

En el cliente, `intervalsFetchWellness()` (`app/whoop.js`) implementa su mitad: si la fila del día
lleva `readinessSource === 'whoop'`, no toca ninguna clave de `WHOOP_OWNED_KEYS` ni ninguna `whoop*`,
y nunca escribe un `bodyweight` sobre una fila con `source:'withings'`. Además no reescribe una fila
idéntica a la guardada (mataba `updated_at` en cada render).

## Superficie en la PWA

| Fichero | Qué aporta |
|---|---|
| `app/integrations.js` | `integrationsGetStatus({force})`, `integrationsIsActive(p)` (síncrona, lee la caché), `integrationsStatusOf(p)`, `integrationsConnect(p)`, `integrationsDisconnect(p)`, `integrationsSync(p,{days})`, `renderIntegrationsCard()`, `integrationsHandleReturn()` |
| `app/supabase-sync.js` | `pullStore(store, {since, user})` — el bucle de bajada de `syncAll` para un store. Siempre `dbPut`, nunca `smartPut` |
| `app/whoop.js` | Ya no hace OAuth. `whoopSyncData()` = caché 10 min → `pullStore('wellness')` → `intervalsFetchWellness()` → si falta el readiness de hoy con origen WHOOP y la integración está activa, `integrationsSync('whoop',{days:2})` → construye `recovery[]`/`sleep[]` desde los últimos 7 días de `wellness` |
| Ajustes › **Integraciones** | Dos filas (WHOOP, Withings): pill `Conectado`/`Reconectar`/`No conectado`, "último sync 07:42 · evento 07:41", `last_error`, y los botones Conectar / Sincronizar ahora / Desconectar |

Orden de carga en `index.html`: `supabase-sync.js` → **`integrations.js`** → `whoop.js`. Está en
`APP_SHELL` de `sw.js`. `whoop-callback.html` **se borró**: el callback aterriza en el servidor.

Al volver a primer plano (`visibilitychange`) la PWA relee `integration_status` y vuelve a
sincronizar: en iPhone la vuelta del OAuth cae en Safari, así que la app se entera al reabrirse.

## Cómo depurar

Con service role en el SQL editor de Supabase:

```sql
-- ¿En qué estado está cada integración?
select provider, status, last_sync_at, last_event_at, last_error, expires_at
from integration_status;

-- ¿Qué eventos han llegado y cómo acabaron?
select received_at, provider, type, status, error
from integration_events order by received_at desc limit 20;

-- ¿Hay un lease de refresco colgado? (debería ser null casi siempre)
select provider, status, expires_at, last_refresh_at, refresh_lock_until, last_error
from integration_tokens;

-- ¿Está el cron corriendo?
select jobname, status, return_message, start_time
from cron.job_run_details order by start_time desc limit 10;
```

Logs de las funciones: `supabase functions logs whoop-sync` (o `whoop-webhook`,
`integrations-callback`, `withings-sync`, `withings-webhook`). Ningún log interpola un token.

Síntomas frecuentes:

- **La tarjeta dice "Reconectar".** Mirar `last_error`. Si dice `invalid_grant`, el token de
  refresco murió de verdad y hay que reconectar. Cualquier otra cosa es un bug: `invalid_client`,
  5xx y timeouts no deberían llegar a marcar `needs_reconnect`.
- **"WHOOP aún no puntuó la noche" a media mañana.** Comprobar `integration_events`: si no hay
  `recovery.updated`, el webhook no está registrado en el panel de WHOOP o la firma no cuadra
  (401 sin fila). El cron de las :00/:30 lo recoge igual como red.
- **Sale el dato de ayer.** No debería: si no hay fila de hoy con score, la app dice `missing` con
  su motivo. Si aparece, el fallo está en `_whoopBuildFromWellness` (`app/whoop.js`) —
  lo cubre `tests/verify-whoop-context.mjs`.

## Tests

- `tests/verify-integrations-wiring.mjs` — cableado (texto): `config.toml` y sus `verify_jwt`,
  scopes, lease-lock, clasificación de errores, SQL, webhooks, cron, Withings **y la PWA** (§19-24:
  `whoop.js` sin tokens, `whoop-callback.html` borrado, orden de los `<script>`, `pullStore`, 15
  stores, `integrations.js` sin credenciales).
- `tests/verify-integrations-pure.mjs` — lógica pura ejecutada en Node (`dayOf` en los cambios de
  hora, `pickNight`, `decodeMeasure`, `groupByDay`, `mergeBodyweight`).
- `tests/verify-whoop-context.mjs` — el dato de hoy es de hoy, o no hay dato.
- `tests/verify-sync-writes.mjs` — 15 stores y ninguna escritura cruda nueva.
