# Plan: Coach v2.1 — el coach semanal manda, la app no toca el día; integraciones de servidor (WHOOP, Withings)

> Estado: **listo para aprobar** (2026-09-07). Contexto, decisiones, Parte A (integraciones), Parte B (coach +
> Home), incrementos en dos carriles y verificación.
> Sustituye al plan Coach v2 (implementado hoy en v11.55-v11.61; copia en
> `docs/architecture/coach-v2-implementation-plan.md`). Este plan corrige la dirección tras el uso real y
> añade la capa de integraciones.

## Context

**Qué pasó.** Coach v2 se desplegó completo el 2026-09-07 (v11.55 → v11.61): kg objetivo por set, bloque por
fecha, recovery de hoy o `unknown`, readiness unificado **con ajuste diario de la sesión**, carrera por fases,
facts pack + validador, edge function `coach-weekly-review` (Opus 5) y vista Coach con aprobación. Julian lo
revisó y corrigió la dirección en siete puntos (2026-09-07):

1. **Nada de ajustar el entrenamiento del día por WHOOP** ("eso es muy subjetivo; voy a ser yo y mi cuerpo el
   que decida skipear un ejercicio o bajar los pesos"). → Se retira el ajuste diario (sesión ajustada, botones,
   check-in de 2 toques, banner de deload reactivo). La recuperación queda como **información**.
2. **El trabajo del coach es semanal**: tras entrenar una semana, interpretar todo, dar feedback y **crear la
   semana siguiente** con todo el recorrido (mejores prácticas, cómo viene entrenando, progreso hacia el
   objetivo, lo que hizo y lo que no). "Cuando uno va al gimnasio el coach no cambia la rutina todos los días."
3. **Home**: feedback de la semana pasada, qué etapa es esta semana, cómo viene el objetivo y cuál es el
   enfoque — **por qué cambia o por qué sigue igual**.
4. **La recuperación se mira sobre todo en los entrenamientos** (pesos, métricas de cardio); la tendencia de
   WHOOP es contexto.
5. La tarea del domingo de Claude Code no funcionaba (confirmado; ya retirada a `/coach-deep-dive` manual).
6. **WHOOP por API con OAuth persistente en servidor**: scope `offline`, tokens en servidor, refresco
   automático con **rotación** persistida atómicamente, **lock** por usuario contra refrescos concurrentes,
   401 → un refresco + un reintento, reconexión sólo si el refresh token es realmente inválido. "La
   integración anterior se desconectaba con frecuencia."
7. **Conectar la báscula Withings** y buscar la mejor forma de conectar todo.

**Decisiones del usuario (2026-09-07, AskUserQuestion):** báscula **Body+ / Body Smart** · Withings por **API
oficial** (él crea la app en developer.withings.com y pasa client id/secret como secretos) · WHOOP con
**webhook + OAuth en servidor** (él añade la URL del webhook y la redirect URI en el panel de WHOOP) ·
recuperación visible como **una línea informativa en Home** + la lista de señales en Stats, sin acciones.

**Resultado esperado.** Cada semana: el coach lee todo el recorrido, escribe el feedback de la semana pasada y
la semana siguiente completa con "qué cambia y por qué / qué sigue y por qué", Julian aprueba con un toque, y
la Home muestra exactamente eso más el objetivo y la sesión de hoy. Cada día: la app prescribe el kg del set
(doble progresión) y no cambia nada por WHOOP. Los datos de WHOOP y Withings llegan solos al servidor (webhooks
+ pull programado), con tokens que no se pierden ni se pisan entre dispositivos.

## Principios (añadidos a los de v2)

1. **El coach cambia la rutina una vez por semana, con motivo.** Estabilidad por defecto: cada sesión que se
   mantiene lleva su razón ("por qué sigue igual"), igual que cada cambio.
2. **Rendimiento primero.** Señal de fuerza = top set, e1RM, reps a carga, RPE, sesión completa; señal de
   cardio = ritmo a Z2, deriva de FC, km cumplidos. WHOOP = tendencia 7d como contexto, nunca dosis, nunca un
   día suelto.
3. **La app no decide por el usuario en el gimnasio.** Objetivo de kg sí (dato propio); recortes, saltos o
   sustituciones por recuperación, no.
4. **Los tokens viven en el servidor.** La PWA lee filas (`wellness`, `bodyweight`), nunca tokens. Refresco
   con rotación bajo lease-lock; reconexión sólo por `invalid_grant` real.
5. **Los datos entran solos.** Webhooks (WHOOP recovery/sleep; Withings notify) + pull programado (pg_cron +
   pg_net) como red; la app sólo pide "sincronizar ahora".

## Estado verificado (2026-09-07)

- **WHOOP hoy (legacy, cliente):** `whoop-auth` = proxy sin estado (exchange/refresh/api), `CLIENT_ID` y
  `REDIRECT_URI` hardcodeados, secreto `WHOOP_CLIENT_SECRET`; `app/whoop.js` guarda tokens en **localStorage**,
  **sin `offline`**, sin lock, 401 → refresh → reintento; intervals.icu es la vía primaria de wellness (con
  horas de retraso) y `whoopFetchTodayRecovery` (v11.58) parchea "hoy". Causas probables de las desconexiones:
  rotación del refresh token entre dos dispositivos sin lock, ausencia de `offline`, evicción de localStorage
  en iOS.
- **Supabase:** `pg_cron` 1.6.4 y `pg_net` 0.20 disponibles (no instalados); `supabase_vault` instalado;
  funciones desplegadas: `whoop-auth`, `steps-ingest` (secreto compartido + service role: patrón reutilizable),
  `strava-sync`, `parse-meal-photo`, `coach-weekly-review`. CLI enlazado. Un solo usuario.
- **Ajuste diario (a retirar):** bloque limpio en `coach-engine.js` 1197-1504 (`adjustSessionForReadiness`,
  `_coachTrimAccessories`); `computeTrainingAdvisory` / `renderTrainingAdvisory` (botones, check-in, `saveCheckin`,
  `_coachAdjustCtx`, `getReplacementOptions`, `t3LogAlternative`); plumbing de `adjustments` en `startWorkout`,
  `buildExerciseCard`, capture/restore, `finishWorkout` (`adjusted/adjustments`); banner `renderDeloadReminder`.
  Tests: `verify-session-adjust.mjs` (borrar), `verify-advisory-matrix.mjs` (borrar o reducir a la honestidad
  de fecha de `getWhoopContext`), `verify-coach-wiring.mjs` §13 a/c/d/e/f/i. **Se conserva:** `computeReadinessFrom`
  (868-1196), `renderReadinessSignals` (Stats), `getWhoopContext`.
- **Home hoy:** `#recovery-hero` → `#training-advisory` → `#hard-day-budget` → `#plan-selector` → `#week-calendar`
  → `#coach-readout` → `#coach-week-card` → `#todays-plan-card` → `#home-stat-trio` → `#home-queue`. La tarjeta del
  coach en estado `applied` sólo dice "Plan W37 activo (v14) · N avisos · Deshacer"; sin revisión no pinta nada;
  el briefing sólo se ve en la vista Coach.
- **Contrato del coach hoy:** facts pack a 4 semanas (28 d de baselines, ≤4 sesiones/lift, ≤3 revisiones), **sin
  resumen desde el inicio del programa**; `proposal.sessions` = sólo las que cambian (diff); `briefing =
  {lastWeek, nextWeek, priorities[3]}`; `phase` binario; nada estructurado para lo que se **mantiene**; el
  prompt aún autoriza cambios del día por una señal (READ-007, líneas 124/158) y cuenta señales de wearable
  al mismo nivel que el rendimiento.

## Parte A · Integraciones de servidor (WHOOP → Withings)

### A.0 Dos correcciones de diseño (sobre lo que pedí inicialmente)

1. **El callback OAuth aterriza en el servidor, no en una página de la PWA.** En iPhone la PWA instalada y
   Safari tienen almacenamiento separado: la redirección de WHOOP abre Safari, donde no hay sesión de
   Supabase (y hoy, donde los tokens que escribe `whoop-callback.html` son invisibles para la PWA — causa
   probable de desconexiones históricas). Withings además da **30 s** para canjear el código. → El proveedor
   redirige a la edge function `integrations-callback` (`verify_jwt=false`), que se autentica por la fila
   `oauth_states` de un solo uso (creada por un `authorize` autenticado y ligada al usuario), canjea el código
   en servidor, guarda tokens y hace 302 a `index.html#settings?connected=whoop`. `whoop-callback.html` se borra.
2. **La fecha del dato se atribuye con el `timezone_offset` de WHOOP**, no con una constante: día del
   recovery = fecha local del `end` del sueño asociado (despertar) con ese offset; fallback
   `INTEGRATION_TZ=Europe/Madrid` vía `Intl` sólo si falta. Cubre DST y viajes sin configuración. (El cliente
   actual usa `recovery.created_at` — hora de puntuación — que falla cuando la correa sincroniza tarde.)

### A.1 Almacén de tokens (`supabase/migrations/20260908_integrations_tokens.sql`)

- **`integration_tokens`** `(user_id, provider ∈ {whoop,withings}, access_token, refresh_token, expires_at, scope,
  external_user_id, status ∈ {active, needs_reconnect}, last_refresh_at, last_error, refresh_lock_until,
  created_at, updated_at; PK (user_id, provider); índice único (provider, external_user_id) para el webhook)`.
  RLS **activado sin políticas** + `revoke all … from anon, authenticated`: sólo service role. Sin `pgsodium`
  (Supabase lo está retirando); cifrado en reposo de Supabase + RLS es proporcionado para un usuario; Vault
  para el refresh token queda como opción documentada.
- **`integration_status`** (tabla, no vista): `(user_id, provider, status ∈ {disconnected, active,
  needs_reconnect}, external_user_id, expires_at, last_refresh_at, last_sync_at, last_sync_summary jsonb,
  last_event_at, last_error, updated_at)`, RLS `select` propio. Mantenida por un **trigger** sobre
  `integration_tokens` (insert/update/delete → mirror) para que nunca diverja. **No** es tabla genérica y **no**
  entra en `stores` de `syncAll` (la PWA la lee directo; `verify-sync-writes` sigue en 15).
- **`oauth_states`** `(state uuid pk, user_id, provider, created_at, redirect_to)` — CSRF + vínculo de usuario,
  un solo uso, 10 min. **`integration_events`** `(id, provider, type, external_user_id, external_id, trace_id,
  received_at, processed_at, status ∈ {received, processed, ignored, error}, error, payload)` con índice único
  `(provider, trace_id)` para deduplicar reintentos. Ambas service-only.
- **`merge_generic_row(p_table, p_user, p_record_id, p_patch)`** (plpgsql `security definer`, sólo
  `wellness`/`bodyweight`): `insert … on conflict do update set data = data || excluded.data` — merge atómico
  para que cron y webhook no se pisen. EXECUTE revocado a anon/authenticated.

### A.2 Mutex de refresco por lease — `supabase/functions/_shared/tokens.ts`

Una sola sentencia atómica: `UPDATE integration_tokens SET refresh_lock_until = now()+30s WHERE user_id AND
provider AND (refresh_lock_until IS NULL OR refresh_lock_until < now()) RETURNING …`. Si devuelve fila →
somos dueños del refresco: si `status='needs_reconnect'` → `ReconnectRequired`; si otro acaba de refrescar
(`expires_at > now+2 min` y `access_token ≠ el que rechazó la API`) → usar ese y soltar el lock **sin quemar
otra rotación**; si no → `adapter.refresh(refresh_token)` → **commit atómico del par rotado** en un único
UPDATE (`access_token, refresh_token, expires_at = now + expires_in − 60 s, status active, last_refresh_at,
last_error null, refresh_lock_until null`). Error **fatal** (WHOOP `invalid_grant`; Withings JSON `status 401`
en el refresh) → `status='needs_reconnect'` + `last_error`; **`invalid_client` NO es fatal** (secreto nuestro
mal; reconectar no lo arregla); 5xx/red/429 → transitorio: soltar lock, conservar tokens. Si no devuelve
fila → otro tiene el lease: poll cada 300 ms hasta 5 s; al liberarse, usar el token nuevo (o reintentar una vez
si el dueño falló); si no → `RefreshInProgress` (503).

`getValidToken` refresca preventivamente si `expires_at < now + 5 min`. `withProviderFetch(provider, userId,
url, init)`: token → fetch → si 401 (WHOOP HTTP 401; Withings JSON 401) y no reintentado → refresco con lock
(`staleAccessToken`) → **un** reintento → si vuelve 401 → `needs_reconnect` "API 401 tras refresh". 429 →
transitorio con `X-RateLimit-Reset`. Cuerpos verificados: WHOOP `grant_type=refresh_token&…&scope=offline`
(el `scope=offline` en el refresh lo exige la doc; el `whoop-auth` actual lo omite); Withings `POST
wbsapi.withings.net/v2/oauth2 action=requesttoken&grant_type=refresh_token…`. Adaptadores en
`_shared/whoop.ts` y `_shared/withings.ts`.

### A.3 Flujo OAuth en servidor

- **`integrations-oauth`** (`verify_jwt=true`, usuario por `asUser.auth.getUser()`): `{action:'authorize',
  provider}` → inserta `oauth_states` (y purga >1 h) y devuelve la URL: WHOOP
  `…/oauth/oauth2/auth?…&scope=offline read:recovery read:cycles read:sleep read:workout read:body_measurement
  read:profile` (**`read:cycles` falta hoy** y `/v2/cycle*` lo necesita); Withings
  `account.withings.com/oauth2_user/authorize2?…&scope=user.metrics`. `{action:'disconnect', provider}` →
  revocación best-effort (WHOOP `DELETE /developer/v2/user/access`; Withings `notify revoke`) + `delete
  integration_tokens` (el trigger deja `disconnected`).
- **`integrations-callback`** (`verify_jwt=false`, GET `/integrations-callback/{provider}?code&state`):
  (1) `delete from oauth_states where state=$1 and provider=$2 and created_at > now()-10 min returning user_id`
  (una sentencia = un solo uso; si no hay fila → `#settings?connect_error=state`); (2) canje en servidor
  (WHOOP → rechazar si no viene `refresh_token` = `offline` no concedido → `connect_error=no_refresh_token`;
  Withings `{status:0, body:{userid, access_token, refresh_token, expires_in…}}`); (3) `external_user_id`
  (WHOOP `GET /developer/v2/user/profile/basic` → `user_id`; Withings `body.userid`); (4) upsert tokens; (5)
  Withings: `notify subscribe`; (6) `waitUntil(sync 30 días)`; (7) 302 a
  `${APP_URL}/index.html#settings?connected=${provider}`. En iPhone la redirección cae en Safari: el usuario
  lo cierra y la PWA relee `integration_status` al abrir Ajustes o en `visibilitychange`.
- **URLs que registra Julian** (VERIFY que cada panel acepte la ruta con segmento): WHOOP redirect
  `https://ycfodifvpvosukepcxie.supabase.co/functions/v1/integrations-callback/whoop`; WHOOP webhook
  `…/functions/v1/whoop-webhook`; Withings callback `…/functions/v1/integrations-callback/withings`; el callback
  de notificaciones Withings lo fija el código: `…/functions/v1/withings-webhook?t=<WITHINGS_WEBHOOK_TOKEN>`.

### A.4 WHOOP: sync + webhook + programación

- **`_shared/whoop-sync.ts`**: `syncWhoop(userId, {days|start,end})` pagina (`limit=25`, `next_token`) sleep,
  recovery y cycle (ventana `[now−days−1d, now]`); `syncWhoopSleep(userId, sleepId)` para el webhook. Día =
  `dayOf(sleep.end, sleep.timezone_offset)` (no siesta; si dos noches acaban el mismo día, la más larga);
  recovery se une a su sueño por `sleep_id` (o al cycle por `cycle_id` → `dayOf(cycle.start)`); strain/kJ del
  cycle sólo si completo y SCORED. Sin `body measurement` (el peso es de Withings).
- **Merge en `wellness[date]`** (sólo estas claves; lo demás se conserva): `readiness, hrv, restingHR, spO2,
  skinTemp, whoopCalibrating, sleepSecs (dormido = in_bed − awake), sleepInBedSecs, sleepAwakeSecs,
  sleepRemSecs, sleepDeepSecs, sleepLightSecs, sleepScore, sleepEfficiency, sleepConsistency, respiration,
  sleepNeedSecs, whoopStrain, whoopKcal, readinessSource:'whoop', whoopCycleId, whoopSleepId,
  whoopRecoveryUpdatedAt, whoopSyncedAt`. **VERIFY** que el `sleepSecs` de intervals.icu sea tiempo dormido
  (mezcla de fuentes una semana en la media 7d).
- **Precedencia explícita:** recovery/HRV/RHR/sueño → WHOOP directo (la PWA `intervalsFetchWellness` salta
  esas claves si `prev.readinessSource==='whoop'`); `ctl, atl, rampRate, steps, weight suavizado` →
  intervals.icu (el servidor nunca los escribe); `weightMeasured/bodyFat` y `bodyweight[date]` → Withings >
  intervals `tempWeight` > forward-fill; **peso manual** (fila sin `source`) gana: Withings conserva `weight`
  y añade `weightWithings` + composición; `subjective`, `waist/neck/heightCm` → la app.
- **`whoop-sync`** (`verify_jwt=true`): `POST {days=2, mode}`. Con cabecera `x-cron-secret` válida (comparación
  constante) → recorre `integration_tokens` activos, responde **202** y trabaja bajo `waitUntil` (pg_net corta
  a 5 s); si no → usuario del JWT, síncrono → `{ok, dates, recoveries, sleeps, cycles, status}`;
  `ReconnectRequired` → `{ok:false, status:'needs_reconnect'}`; `RefreshInProgress` → 503. Actualiza
  `integration_status.last_sync_at/summary`.
- **`whoop-webhook`** (`verify_jwt=false`, POST): cuerpo crudo ≤16 KB; `sig = base64(HMAC_SHA256(client_secret,
  X-WHOOP-Signature-Timestamp + body))` (timestamp en **milisegundos**), comparación constante, tolerancia 5 min
  → si no, 401. Payload `{user_id, id, type, trace_id}` → `integration_events` (`on conflict (provider, trace_id)
  do nothing` → duplicado → 200 y fin). **200 inmediato** + `waitUntil`: `recovery.updated`/`sleep.updated` →
  **`id` es el UUID del sueño en v2** → `GET /v2/activity/sleep/{id}` → `GET /v2/cycle/{cycle_id}/recovery`
  (puede ser `PENDING_SCORE`: escribir sólo sueño) → merge → `last_event_at`. `workout.*` y `*.deleted` →
  `ignored` (las carreras vienen por intervals.icu; importarlas aquí duplicaría `runs`).
- **Programación** (`20260908_integrations_cron.sql`): `create extension pg_cron` + `pg_net`; secretos en
  **Vault a mano** (`project_url`, `anon_key`, `CRON_SECRET` — mismo valor que el secreto de la función; la
  migración aborta si faltan); `cron_call_fn(fn, body)` (`security definer`, EXECUTE revocado) hace
  `net.http_post` con `Authorization: Bearer <anon JWT legacy>` (satisface `verify_jwt=true`; si el proyecto
  pasara a claves `sb_publishable_*` habría que cambiarlo) + `x-cron-secret`; jobs en UTC: `whoop-sync-30m`
  `*/30 3-12 * * *` (05:00-13:30 Madrid todo el año), `whoop-sync-daily` `0 12 * * *` `{days:7}` (datos tardíos
  + ejercicio diario del token), `withings-sync-daily` `15 12 * * *` `{days:3, resubscribe:true}`,
  `integration-events-gc` semanal. Inspección: `cron.job_run_details`, `net._http_response`. Vida del refresh
  token de WHOOP no documentada (**VERIFY**); con ejercicio diario nunca queda ocioso >24 h.

### A.5 Withings (Body+): sync + webhook

- **`_shared/withings-sync.ts`**: `POST wbsapi.withings.net/measure` `action=getmeas&meastypes=1,5,6,8,76,77,88&
  category=1` + `startdate/enddate` (webhook, backfill) o `lastupdate=last_sync−2 d` (cron; **VERIFY**
  exclusividad); seguir `more/offset`. Decodificación pura en `_shared/measures.ts`: `value×10^unit`; tipos 1
  peso, 5 masa libre de grasa, 6 % grasa, 8 masa grasa, 76 músculo, 77 agua, 88 hueso (**VERIFY** códigos y
  `attrib`: conservar `attrib ∈ {0,2,4,7}`, descartar `attrib=1` = medida no atribuida, en una Body+ compartida
  es otra persona). Día local con `body.timezone` (IANA del usuario) y fallback `INTEGRATION_TZ`. Varias
  pesadas el mismo día → **la más temprana (ayunas)** para todos los valores; `withingsN` cuenta.
- **`bodyweight[date]`** ← `{ date, weight, measured:true, source:'withings', timestamp, fatPct, bfPct(=fatPct,
  alimenta nutFfmKg y la cintura), fatMassKg, ffmKg, muscleKg, waterKg, boneKg, withingsGrpId, withingsN }`;
  fila manual el mismo día → conserva `weight` manual y añade `weightWithings` + composición; el `fatPct` del
  dispositivo sustituye al `bfPct` Navy del día (las medidas de cinta se conservan). Espejo en
  `wellness[date]`: `weightMeasured, bodyFat, weightSource:'withings'`. `renderBodyWeightInsights`,
  `nutRollingWeight`, la pendiente del facts pack y `verify-waist-persistence` siguen funcionando.
- **`withings-sync`** (`verify_jwt=true`, doble modo como WHOOP; `resubscribe:true` re-suscribe idempotente:
  Withings cancela la suscripción tras 20 días de fallos). **`withings-webhook`** (`verify_jwt=false`):
  `HEAD/GET → 200` (comprobación de la suscripción); `POST` form `userid, startdate, enddate, appli`; Withings
  **no firma** → exigir `?t=WITHINGS_WEBHOOK_TOKEN` (401 si no) y `userid` = `external_user_id` (si no, 200 +
  `ignored`); sólo `appli=1`; `integration_events` (`trace_id = userid:startdate:enddate:appli`); 200 +
  `waitUntil(syncWithings(rango))`. Suscripción: `POST /notify action=subscribe&callbackurl&appli=1&comment`
  (HTTPS, 443, ≤255 chars); firma `signature/nonce` sólo si el intento sin firma devuelve status 342
  (**VERIFY** una vez en producción).

### A.6 Cambios en la PWA

- Nuevo **`app/integrations.js`** (tras `supabase-sync.js`, antes de `whoop.js`; en `APP_SHELL`):
  `integrationsGetStatus({force})` (lee `integration_status`, caché 60 s), `integrationsIsActive(provider)`,
  `integrationsConnect(provider)` (→ `integrations-oauth authorize` → `location.href`),
  `integrationsDisconnect`, `integrationsSync(provider,{days})` (→ `whoop-sync`/`withings-sync` `mode:'sync'` →
  `pullStore('wellness'|'bodyweight')` → `invalidateReadiness()`), `renderIntegrationsCard()` en Ajustes
  (**"Integraciones"**: WHOOP · Withings con pill Conectado/Reconectar/No conectado, "último sync 07:42 ·
  evento 07:41", `last_error`, botones Conectar / Sincronizar ahora / Desconectar). El `<details>` legacy de
  WHOOP y `renderWhoopUI` desaparecen; Strava y el atajo de pasos siguen en `<details>`. `init()` parsea
  `#settings?connected=…|connect_error=…` → toast + abrir Ajustes.
- **`app/supabase-sync.js`**: `pullStore(store)` (el bucle de pull de `syncAll` para un store), en `window`.
- **`app/whoop.js` adelgazado**: fuera `WHOOP_*` constantes, `whoopOAuthConnected`, `whoopNeedsReconnect`,
  `whoopConnect/Disconnect`, `whoopMarkReconnectNeeded`, `isFatalAuthError`, `whoopRefreshToken`, `whoopGetToken`,
  `whoopFetch`, `whoopGet*`, `whoopFetchTodayRecovery`, `_whoopPersistTodayWellness`, `_whoopEnsureTodayFresh`,
  la mitad OAuth de `whoopSyncData`, `renderWhoopUI`; ninguna referencia a `whoop_access_token|whoop_refresh_token|
  whoop_token_expiry|whoop_needs_reconnect`. `whoopIsConnected()` = intervals configurado ∨
  `integrationsIsActive('whoop')`. **`whoopSyncData()` conserva su forma de retorno** (la consumen
  `renderWhoopRecoveryCard`, `getWhoopContext`, `runFullSync`, `init`) y pasa a: caché 10 min →
  `pullStore('wellness')` → `intervalsFetchWellness()` (respetando WHOOP) → si la fila de hoy no tiene
  `readiness` con `readinessSource:'whoop'`, WHOOP activo y ventana de 10 min vencida → `integrationsSync('whoop',
  {days:2})` → construir `recovery[]/sleep[]` desde los últimos 7 `wellness` de IDB (`source:'whoop-direct'` si
  `readinessSource==='whoop'`, `fetchedAt: whoopSyncedAt`) → `todaySource/todayMissingReason` desde
  `integration_status` (`needs_reconnect` → "WHOOP necesita reconectarse en Ajustes"; `disconnected` → "WHOOP no
  conectado"; activo → "WHOOP aún no puntuó la noche"). `intervalsFetchWellness`: no `smartPut` si la fila
  compactada es idéntica (mata el churn de `updated_at`); salta claves WHOOP y filas `bodyweight` Withings.
  `visibilitychange` → `whoopSyncData()`. `whoop-callback.html` se borra.

### A.7 Seguridad y configuración

Tokens sólo con service role; la PWA nunca los recibe. `config.toml` con **todas** las funciones (incluidas las
dos que faltan hoy): `steps-ingest` `verify_jwt=false` (atajo iOS), `strava-sync` true, `integrations-oauth`
true, `integrations-callback` **false** (auth = fila `state` de un uso), `whoop-sync`/`withings-sync` true (JWT
del usuario, o anon JWT + `x-cron-secret`), `whoop-webhook` false (HMAC), `withings-webhook` false (token +
`userid`). Secretos (dashboard/CLI, nunca en el repo): `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` (existe),
`WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET`, `WITHINGS_WEBHOOK_TOKEN`, `CRON_SECRET` (mismo valor en Vault),
`APP_URL`, `INTEGRATION_TZ`. Comparaciones en tiempo constante; usuarios desconocidos reciben 200 + `ignored`
(sin oráculo); cuerpos con tope; todo evento queda en `integration_events`. Tras el corte, `whoop-auth` se
elimina (proxy abierto con la clave anon que relaya con nuestro secreto).

### A.8 Tests (parte A)

- **`tests/verify-integrations-wiring.mjs`** (texto): los 8 bloques de `config.toml` con sus `verify_jwt`;
  `whoop.js` sin claves de token ni `api.prod.whoop.com` ni `whoop-auth`; `whoop-callback.html` inexistente;
  `sw.js` con `integrations.js`; `_shared/whoop.ts` con `offline` y `read:cycles` en el authorize y `scope`
  `offline` en el refresh; `_shared/tokens.ts` con el UPDATE de `refresh_lock_until` (`is.null`/`lt.`), el
  commit conjunto `access_token, refresh_token, expires_at, refresh_lock_until: null`, `needs_reconnect` sólo
  junto a `fatal`/`invalid_grant`/"tras refresh", guard de un reintento; `whoop-webhook` con `X-WHOOP-Signature`,
  `X-WHOOP-Signature-Timestamp`, HMAC SHA-256 base64, comparación constante, `5 * 60`, `waitUntil`,
  `integration_events`; `withings-webhook` con `HEAD`, `WITHINGS_WEBHOOK_TOKEN`, `appli`, `external_user_id`;
  SQL: `integration_status` sin `access_token|refresh_token`, `integration_tokens` con RLS y cero `create
  policy`, `oauth_states`, `integration_events`, `merge_generic_row`, cron sin secreto literal (`eyJ`) y con
  `vault.decrypted_secrets`; `supabase-sync.js` sigue con 15 stores y sin `integration_status`.
- **`tests/verify-integrations-pure.mjs`**: Node 25 ejecuta TypeScript sin build (`await import('…/_shared/
  dates.ts')`; sintaxis borrable, imports relativos `.ts`, sin `jsr:/npm:`, sin globals Deno): `dayOf` en los
  cambios de hora 2026-03-29 y 2026-10-25 y con `'Z'`; `pickNight` ignora `nap:true` y elige la más larga;
  `decodeMeasure({value:84350, unit:-3}) → 84.35`; `groupByDay` toma la de las 07:05 y cuenta 2; `attrib:1`
  excluido; `mergeBodyweight(manual, withings)` conserva el peso manual y añade `weightWithings`.

### A.9 Lo que hace Julian (una vez)

1. Panel de WHOOP: añadir la redirect URI y la URL del webhook (A.3), confirmar scopes con `offline` y
   `read:cycles`. 2. Crear la app de Withings (developer.withings.com, Public API) con la callback
   `/integrations-callback/withings`. 3. Secretos: `supabase secrets set WHOOP_CLIENT_ID=… WITHINGS_CLIENT_ID=…
   WITHINGS_CLIENT_SECRET=…` (o en el dashboard); `WITHINGS_WEBHOOK_TOKEN`, `CRON_SECRET`, `APP_URL`,
   `INTEGRATION_TZ` los genero/fijo yo (valores internos). 4. Vault: los tres secretos del cron los creo yo por
   SQL (la clave anon ya es pública; `CRON_SECRET` lo genero). 5. Conectar WHOOP una vez desde el teléfono
   (nuevo flujo) y Withings una vez. 6. Si el panel de WHOOP ofrece "enviar webhook de prueba", pulsarlo.

### A.10 Puntos a VERIFICAR contra los paneles/docs en vivo (marcados en el diseño)

Aceptación de la redirect URI con segmento de ruta en WHOOP y Withings · enrutado de sub-ruta
`/integrations-callback/{provider}` en el gateway de Supabase (fallback `?provider=`) · vida del refresh token
de WHOOP · definición de `sleepSecs` en intervals.icu · códigos de tipo y `attrib` de `getmeas` y exclusividad
de `lastupdate` · código de estado Withings para refresh token muerto · si `notify subscribe` exige
`signature/nonce` para esta app.

## Parte B · Contrato del coach semanal v2 + Home + retirada del ajuste diario

### B.1 Retirada del ajuste diario (quirúrgica)

**Se borra:** en `coach-engine.js` la sección "EL AJUSTE DE LA SESIÓN (READ-007)" (1197-1504: `_readRound5`,
`_readCopySession`, `_coachTrimAccessories`, `adjustSessionForReadiness`) y sus exports; en
`computeReadinessFrom` el bloque del check-in (`sleepSelf`/`feelSelf`, 1136-1162 y su etiqueta) — nada lo
escribirá ya. En `app.js`: `computeTrainingAdvisory`, `renderTrainingAdvisory` (botones, check-in),
`saveCheckin`, `_coachCheckinHtml`/`_coachBindCheckin`, `state._checkinDismissed`, `_coachAdjustCtx`,
`_coachAdjustmentsPayload`, `getReplacementOptions`, `detectInterference` (verificar que no tenga otro
llamador), `t3LogAlternative` y helpers `_t3*` salvo `_t3WeightWord` (lo usa el budget), `_readinessLine`;
`checkDeloadNeeded`/`renderDeloadReminder` + `#deload-reminder` (**decisión:** fuera — era el último sitio
donde la recuperación empujaba una acción; `deloadHint` viaja en los facts y el calendario ya se ve). Plumbing
de `adjustments` en `startWorkout` (filtro `dropIds`, `state.activeAdjustments`, sufijo del header),
`buildExerciseCard` (param y bloque setDelta/rpeCap; la tarjeta dorada del test sigue byte a byte),
`captureWorkoutState`, `restoreActiveWorkout`, `clearActiveWorkout`, quick-mode toggle, `finishWorkout`
(`adjusted`, `adjustments`). CSS `.coach-checkin*`, `.coach-proposal*`, `.coach-changes*`, `.t3-rec/.t3-alt*/
.t3-reasons/.t3-rules/.t3-warn/.t3-stress/.t3-title/.t3-foot`, `.deload-*`, `.recovery-hero*/.rh-*`.

**Se conserva:** `computeReadinessFrom` (6 señales: whoop, hrv7v28, rhr7v28, sleep7, rpe2, quality2),
`computeReadiness`/`invalidateReadiness`, `renderReadinessSignals` (Stats), `getWhoopContext` (sólo hoy),
`readinessAtStart` en el registro del entreno (log puro, 4 campos), `ALT_LIBRARY` (lo lee
`renderIdealPreview`), `computeHardDayBudget`/`renderHardDayBudget` (**se mueve a Stats**), etiquetas
históricas `readiness-adjust`/`deload-request` en `COACH_DECISION_ES` ("históricos: ya no se escriben").
`renderCardioLibrary` pasa a leer `getPlannedSessionForDate` (pierna hoy) + `getWhoopContext().color==='red'`
como aviso informativo (sin `computeTrainingAdvisory`).

**Tests:** borrar `verify-session-adjust.mjs`; `verify-advisory-matrix.mjs` → **`verify-whoop-context.mjs`**
(sólo la honestidad de fecha §1/2/7/8 + `renderCardioLibrary` sin advisory); `verify-readiness-trend.mjs`
quita §9 y afirma "exactamente 6 señales, sin `sleepSelf`/`feelSelf`"; `verify-coach-wiring.mjs` §9.c/d
(firmas), §12 (sin CTA/hero), §13 a (negativos) / b (invalidación → `renderRecoveryLine`) / c-d-e-f (fuera) /
g (queda) / h (banner fuera) / i (CSS), nuevo **§16 "el coach no ajusta el día"**: no `adjustSessionForReadiness`
en ningún fichero, no "Hacer la ajustada/planificada/Registrar la alternativa", no ids de check-in, no
`opts.adjustments`/`activeAdjustments`/`saveCheckin`, `startWorkout` con `opts.targets` y
`_coachReadinessStamp` pero sin `adjustments`, `finishWorkout` con `readinessAtStart` y sin `adjusted`,
`renderHomeView` sin advisory/budget/hero y con `renderRecoveryLine`/`renderCoachGoalLine`, `renderStats` con
`renderHardDayBudget`, tarjeta dorada intacta.

### B.2 Facts pack: `trajectory` (todo el recorrido) — `app/coach-facts.js`, `FACTS_SCHEMA = 2`

```js
trajectory: {
  program: { firstWorkoutDate, weeksSince, totalStrengthSessions, sessionsPerWeekAvg, anchorDate,
             blocks: [{ index:0, label:'pre-bloque', from, to, weeks, strengthSessions, runs, km },
                      { index:1, label:'B1', from:'2026-09-07', to, weeks, strengthSessions, runs, km, isCurrent:true }] },
  weight: { startKg (goals.primary.startWeightKg), startDate, firstMeasured:{kg,date}, nMeasuredSinceStart,
            latest7dMean, deltaKg, slopeSinceStartKgPerWeek (mínimos cuadrados sobre pesadas MEDIDAS; null si <6),
            slopeUsedForEta:'28d'|'sinceStart'|null, weeksToMilestoneAtCurrentSlope, weeksToTargetAtCurrentSlope, note },
  anchors: [{ id, name, kind:'load'|'bw', first:{date,kg,reps,e1rm}, best:{…}, latest:{…, outcome}, exposures,
              exposures12w, daysSinceLast, trendSinceStartPct }],          // goals.preserve.anchorLifts
  running: { weeklyKm:[12], weekKeys:[12], longestRunEver:{km,date,avgHR}, z2ComplianceByWeek:[8],
             phaseHistory:[{weekKey, phase}] (de decisiones running-week, ≤8) },
  adherenceByWeek: [{ weekKey, planned, done, kmDone, runs }] (12; planned = template actual → declarado aprox.),
  skippedPatterns: [{ id, name, skips, exposures, lastSkipped }]   // saltado ≥3 de las últimas ≤6 exposiciones (12 sem)
  decisionsFollowUp: [{ id, weekKey, type, what≤120, reviewOn, dueForReview, outcome, source }] (6, sólo coach/plan-*)
}
```
Además: `_factsReadiness` añade `deloadHint` y `firedSignals` (llamando a `computeReadinessFrom`, puro);
`priorReviews` 3 → **6** (las 4-6 compactas, sin extracto; `coach.js` y `index.ts MAX_PRIOR_REVIEWS=6`);
`dataGaps`: programa <8 semanas ("trayectoria corta, pendientes orientativas"), un solo bloque desde el ancla,
anclas con 0 exposiciones. Tamaño: +≈6-7 KB → pack ≈31-43 KB; techo del test 40 → **50 KB**, `trajectory`
< 12.000 chars; el tope del servidor (200 KB) no se toca.

### B.3 Contrato de salida v2 (edge function)

**`schema.ts`:** `PHASES = ['base','build','intensify','deload','maintenance']`; `proposal.phase ∈ PHASES`
(deload obligatorio si `facts.block.isDeload`; igual a `briefing.phase`); **`proposal.weekSummary`**:
`[{ sessionId ∈ enum, status:'kept'|'changed'|'new'|'removed', line ≤160 con el número }]` **una fila por CADA
sesión del plan activo, también las que no cambian**; `briefing` gana `focus` (≤160), `phase`, `whyChanged`
(markdown ≤600; vacío si nada cambia), **`whyKept`** (≤600, **nunca vacío**: mantener también se justifica),
`lastWeekSummary` (≤3 líneas: hecho vs planificado + el número que importa). `lastWeek`, `nextWeek`,
`priorities[3]` se conservan; `nextWeek` pasa a 5 secciones: *Qué cambio · Por qué cambia · Por qué se mantiene
· Qué vigilo esta semana · Qué necesito de ti*. `proposal.sessions` **sigue siendo diff** (la estabilidad es el
punto).

**`index.ts` saneado:** `MAX_FOCUS 160`, `MAX_WHY 600`, `MAX_LASTWEEK_BULLETS 3`, `MAX_WEEK_SUMMARY 12`,
`MAX_SUMMARY_LINE 160`, `PROMPT_VERSION 2`, `MAX_PRIOR_REVIEWS 6`. `phase` fuera del enum → 'build' + nota;
`isDeload` sin 'deload' → forzado + nota; **cobertura** de `weekSummary`: sesión del plan sin fila → se añade
`kept` "(sin motivo — el coach no lo dio)" + nota; **consistencia**: sesión en `proposal.sessions` marcada
`kept` → `changed`; marcada `changed` sin estar en `sessions` → `kept`; `whyKept` vacío → nota.

**`prompt.ts`:** (1) "Qué señal mide qué" reescrito **rendimiento primero**: top set/e1RM por sesión, reps a la
misma carga, RPE y su tendencia, series completadas, saltos; cardio = ritmo a FC de Z2 y deriva/decoupling;
"el wearable es contexto en tendencia 7d vs 28d propia; nunca un día suelto, nunca un valor absoluto, **nunca
dosifica**". (2) Se **tachan** las líneas READ-007 ("una señal cambia el objetivo del día" / "una noche de 5 h
cambia el día") → "una señal o un día suelto no cambia nada: se anota y se mira la semana que viene". (3)
Paso 2 → "Rendimiento y recuperación (en ese orden)"; la recuperación sola nunca baja un kg. (4) Nuevo paso
**2b "El recorrido"**: leer `facts.trajectory` antes de decidir; citar ≥1 número since-start en `lastWeek` y en
`whyKept`/`whyChanged`; "lo que no se hizo tres veces no se recuerda: se reordena o se quita". (5) Regla de
honestidad 11: **"No cambies por variedad."** (6) NUNCA: cambiar una sesión sin dato; dejar una sesión sin
fila en `weekSummary`. (7) ANCLAS: "La recuperación es información, no dosis (decisión del usuario 2026-09-07)".
(8) CONTRATO nuevo en castellano para `focus`, `phase` (base semanas 1-2 tras deload; build 3-4; intensify sólo
con adherencia ≥75 % y rendimiento verde 2 semanas; maintenance cuando la grasa manda y la fuerza aguanta),
`lastWeekSummary`, `whyChanged`, `whyKept`, `weekSummary`.

### B.4 Aplicar, disparo y semántica de semana

- `applyCoachProposal` estampa en la versión nueva **`coachBrief`** = `{ reviewId, weekKey, appliedAt, focus,
  phase, whyChanged, whyKept, priorities[3], lastWeekSummary[3], weekSummary[≤12] }` (fallback para revisiones
  v1: `weekSummary` derivado de `diffPlanVersions`). `_applyVariantOverCoachPlan` y `rollbackPlanVersion`
  **arrastran** `coachBrief`. Validador: aviso blando `WEEK-SUMMARY` si falta alguna sesión. Se reutiliza la
  decisión `plan-apply` enriquecida con `{focus, phase, kept, changed}`.
- `coachTargetWeekKey(todayStr)`: **domingo → semana ISO siguiente; lunes-sábado → la actual**. La revisión es
  PARA `weekKey` y SOBRE lo anterior. `maybeRunWeeklyCoach` sigue (primera apertura de semana nueva; cualquier
  fila de la semana bloquea el auto-run). Botón **"Cerrar semana y pedir la próxima"** (`#coach-close-week`) en
  la vista Coach y en la tarjeta de Home (estados none/expired/rejected) → `runWeeklyCoach({weekKey:
  coachTargetWeekKey(today())})`; las filas `failed` no bloquean el manual; `cached:true` es gratis.
  `coachAutoApply` sigue en `ask`.

### B.5 Home nueva

Orden en `index.html`: banners · `#home-topbar` · `#plan-selector` · `#week-calendar` · **`#coach-week-card`**
(siempre presente con revisión) · **`#coach-goal-line`** (nuevo) · "Today's session" · `#coach-readout` ·
`#todays-plan-card` · **`#coach-recovery-line`** (nuevo) · `#home-stat-trio` · "This week" · `#home-queue`.
Fuera de Home: `#training-advisory`, `#recovery-hero` (sus mensajes "Your body is ready for high strain" son
exactamente el consejo diario rechazado; WHOOP sigue en Stats), `#hard-day-budget` (→ Stats › Today tras las
señales), `#deload-reminder`.

**`renderCoachWeekCard`** (lee `activePlan.coachBrief` si `activePlan.reviewId === review.id`, si no
`review.output.briefing` con fallback para v1):
```
none      → COACH · W37 · "Primera semana con el coach. El domingo cierra la semana, interpreta el recorrido y
            propone la siguiente. Hasta entonces la rutina no cambia." [Cerrar semana ahora]
proposed  → como hoy (prioridades, nextWeek plegado, diff, chips, Aplicar/Rechazar/Regenerar con nota)
            + "Foco: …" y <details> "Por qué cambia · por qué se mantiene"
applied   → COACH · W38 · plan v15                                   Ver todo ›
            SEMANA PASADA   • 3 de 4 sesiones · banca 95×8 ↑   • 12,1 km en 2 carreras, ambas en Z2
            ESTA SEMANA · Semana 2/5 · B1 · fase construcción · Foco: mantener los 6 anclas y sumar el largo a 6,5 km
            POR QUÉ SE MANTIENE   Upper A igual: 8/8/7 @7,5 el 1-sep, un dato más antes de subir…
            (si hay whyChanged: POR QUÉ CAMBIA primero, whyKept plegado)
            ▸ Qué cambia (2 sesiones)   ▸ Todas las sesiones (6)   [Deshacer]
running / failed / expired / rejected → como hoy (+ botón Cerrar semana en expired/rejected)
```
`PHASE_ES = {base:'base', build:'construcción', intensify:'intensificación', deload:'descarga',
maintenance:'mantenimiento'}`; `B{n}` desde `deloadAnchorDate`. Vista Coach: `_coachRenderBriefing` añade
Foco / Por qué cambia / Por qué se mantiene / tabla `weekSummary`; el teaser de Stats usa `focus`.

**`renderCoachGoalLine()`** (nuevo; refactor `_coachGoalProgressFromStores()` compartido con `renderGoalsCard`):
`Peso 85,9 · −0,42 kg/sem · hito 82 kg en ~9 sem · 10k: fase base · 12,1 km/sem · Z2 3/4 · Fuerza 5/6 anclas`,
una o dos líneas apagadas, tap → vista Coach; fallbacks "sin señal (3 pesadas en 14 d)".

**`renderRecoveryLine()`** (nuevo) + **`performanceLine(workouts, runs, opts)`** puro en `coach-engine.js`:
línea 1 = tendencias 7d con `status:'ok'` ("HRV estable (−3 %) · RHR 44 · sueño 7,4 h") + "WHOOP hoy 71 %" o
"sin dato de hoy (último: 68 % ayer)"; línea 2 = "Rendimiento: banca 95×8 ↑ · sentadilla 105×8 → · Z2 5,1 km
@141" (últimos readouts por ancla ≤3 + última carrera; `↑ → ↓ ○`). Sin color por estado, sin botones, texto
apagado. Funciona con las filas actuales; la nueva ruta WHOOP/Withings debe seguir escribiendo los mismos
nombres (`hrv, restingHR, sleepSecs, readiness, readinessSource, weightMeasured`; `bodyweight.measured:true`).

### B.6 Tests y docs (parte B)

Nuevos: `verify-whoop-context.mjs`, `verify-performance-line.mjs` (fixture 2 entrenos con readouts + 1 carrera →
línea exacta; @151 → "carrera"; sin readouts → ''), `verify-coach-wiring.mjs` §16 (retirada) y **§17** (Home:
orden de ids, sin advisory/hero/deload, budget en Stats, estado `none` con "Primera semana con el coach" y
`coach-close-week`, `coachBrief:` en apply y arrastrado en variante/rollback, `coachTargetWeekKey('2026-09-13')
=== '2026-W38'` y `('2026-09-09') === '2026-W37'`, `runWeeklyCoach` sin gate por filas existentes,
`COACH_GUARD_ES['WEEK-SUMMARY']`, `PHASE_ES` 5 claves, CSS nuevas). Cambian: `verify-coach-facts.mjs`
(trajectory: `firstWorkoutDate`, `weeksSince`, bloques pre-bloque/B1, `weight.deltaKg` sólo medidas,
anclas first/best/latest con lb→kg, `sumo-dl` 0 exposiciones + dataGap, `weeklyKm.length 12`,
`skippedPatterns` umbral ≥3, `decisionsFollowUp` con `dueForReview`, `priorReviews ≤6` compactas,
`deloadHint`, kb<50), `verify-coach-fn-wiring.mjs` (PHASES 5, `weekSummary`, `whyKept`, `focus`, marcadores
"Primero el rendimiento"/"nunca dosifica"/"facts.trajectory"/"No cambies por variedad", negativos READ-007,
`MAX_WHY 600`, `PROMPT_VERSION 2`), `verify-plan-v2-compat.mjs` (`coachBrief` sobrevive a
`createNewPlanVersion`), `verify-plan-validator.mjs` (`WEEK-SUMMARY`). Docs: `training-advisory-v1.md` ("v11.62
— retirado: el coach no ajusta el día"), `readiness-rules.md` (todo informativo; sin READ-007 aplicado),
`plan-v2-schema.md` (`coachBrief`, campos nuevos, semántica de "Cerrar semana"), `coach-facts-schema.md`
(`FACTS_SCHEMA 2`, `trajectory`, 50 KB), `engines.md`, addendum v2.1 en la copia del plan, `pendientes.md`.

### B.7 Desvíos declarados respecto a la literalidad

La recuperación no desaparece: queda como información (decisión tomada con Julian). El feedback de la semana
pasada en Home se acota a ≤3 líneas + "Ver todo" (el texto completo, en la vista Coach). Se va un paso más
allá de "no cambiar la rutina cada día": el coach debe **justificar lo que mantiene** (`whyKept`, filas `kept`).
Quitar el banner de deload y el hero de WHOOP de Home excede la petición literal; ambos eran los últimos
sitios donde la recuperación se convertía en consejo, y son reversibles en un incremento.

## Incrementos y orden

Dos carriles en paralelo con subagentes Opus (ficheros casi disjuntos: **B** = `coach-engine.js`,
`coach-facts.js`, `coach.js`, `app.js`, Home en `index.html`, `style.css`, edge fn `coach-weekly-review`;
**A** = `supabase/migrations`, `supabase/functions/_shared` + 6 funciones nuevas, `config.toml`,
`app/integrations.js`, `app/whoop.js`, `supabase-sync.js`, Ajustes en `index.html`). Los puntos de contacto
(`index.html`, `sw.js`, `init()` en `app.js`) los integro yo: **un bump de caché + versión por push**, nunca dos
agentes empujando a la vez. Cada incremento = tests primero (con el fallo que impide) → código → bump → push. Los
números de versión se asignan al subir; los de abajo son el orden previsto.

| Paso | Carril B (coach + Home) | Carril A (integraciones) | Julian |
|---|---|---|---|
| 1 | **B-1 · v11.62** Retirada del ajuste diario (B.1) + `renderRecoveryLine`/`performanceLine` + budget → Stats + §16 | **A-1** Migración tokens/status/states/events/`merge_generic_row` + `_shared/{tokens,whoop,withings,dates,measures}.ts` + `integrations-oauth` + `integrations-callback` + `verify-integrations-pure` · deploy | **A-0**: URLs en el panel de WHOOP, app Withings, secretos (A.9) · desprogramar la tarea del domingo |
| 2 | **B-2 · v11.63** `trajectory` en el facts pack (B.2), `FACTS_SCHEMA 2`, `priorReviews 6`, tests | **A-2** `_shared/whoop-sync.ts` + `whoop-sync` + `whoop-webhook` + `config.toml` completo · deploy | — |
| 3 | **B-3 · fn v3** Contrato v2: `schema.ts`, `prompt.ts`, saneado (B.3) + `verify-coach-fn-wiring` · deploy · primera ejecución con el pack real (Regenerar) y lectura de `coach_reviews` + logs; iterar prompt | **A-3 · v11.64** PWA: `integrations.js`, `whoop.js` adelgazado, `pullStore`, tarjeta Integraciones, borrar `whoop-callback.html`, `verify-integrations-wiring` | Conectar WHOOP desde el iPhone (flujo nuevo) · webhook de prueba si el panel lo ofrece |
| 4 | **B-4 · v11.65** `coachBrief` en apply/variante/rollback, `coachTargetWeekKey`, "Cerrar semana y pedir la próxima", Home nueva (B.5), vista Coach con Foco/Por qué, §17, docs (B.6) | **A-4** Migración pg_cron + pg_net + Vault + `cron_call_fn` + jobs · comprobar `cron.job_run_details` | — |
| 5 | **B-5** Primera semana cerrada (domingo 2026-09-13): revisar la propuesta real, ajustar prompt si hace falta (sin código nuevo salvo prompt) | **A-5 · v11.66** Withings: `_shared/withings-sync.ts`, `withings-sync`, `withings-webhook`, suscripción en el callback; PWA: pill "Withings" y composición en `renderBodyWeightInsights` | Conectar Withings · pesarse una mañana |
| 6 | — | **A-6** Limpieza: borrar `whoop-auth` (función + bloque), restos legacy, `docs/architecture/integrations.md`, memoria | — |

Dependencias duras: A-3 necesita A-0 (redirect URI registrada) para probarse; A-4 necesita los tres secretos
en Vault antes de aplicar la migración; A-5 necesita la app de Withings. B-4 se integra **después** de A-3
(ambos tocan `index.html` e `init()`). Si A-0 se retrasa, el carril A sigue hasta A-2 (todo servidor) sin
bloquear a B. Ventana de corte A-3: entre el push y la reconexión, WHOOP directo no escribe; intervals.icu
sigue alimentando `wellness`, así que no se pierde ningún día (sólo el "hoy" fresco hasta reconectar).

Estimación: B ≈ 1 sesión larga (B-1 y B-2 son grandes pero mecánicos; B-3 depende de iterar con el pack real);
A ≈ 2 sesiones (A-1/A-2 son lo nuevo de verdad; A-3 es cirugía en `whoop.js`; A-5 es un segundo proveedor
sobre la misma base). En paralelo: ≈ 2 sesiones de trabajo en total.

## Verificación

**Automática (cada push):** `for f in tests/verify-*.mjs; do node "$f"; done` en verde (25 hoy − 1 borrado + 4
nuevos). Tarjeta dorada byte a byte intacta tras B-1. `verify-sync-writes` sigue en 15 stores tras A-3.

**B-1 (retirada):** `grep -rn "adjustSessionForReadiness\|activeAdjustments\|saveCheckin\|renderTrainingAdvisory\|
renderDeloadReminder" app/` → 0. iPhone: Home sin advisory/hero/banner; línea de recuperación con tendencias +
"Rendimiento: …"; empezar un entreno de pierna con WHOOP rojo → sesión íntegra, kg objetivo presentes; terminar
→ registro con `readinessAtStart` y sin `adjusted`; Stats › Today muestra señales + budget.

**B-3 (contrato v2):** tras Regenerar, en Supabase `select output->'briefing'->>'whyKept',
jsonb_array_length(output->'proposal'->'weekSummary') from coach_reviews order by created_at desc limit 1` →
`whyKept` no vacío, `weekSummary` cubre todas las sesiones del plan activo; logs de la función sin notas de
saneado por cobertura; ninguna sesión cambiada sin dato citado; coste en `usage` ≈ el actual (+10-15 % por el
pack mayor).

**B-4 (Home):** estado `applied` muestra SEMANA PASADA / ESTA SEMANA (semana n/5 · B1 · fase) / POR QUÉ SE
MANTIENE (o CAMBIA) / desplegables; `#coach-goal-line` con peso, pendiente, hito y km; tap → vista Coach.
Domingo 2026-09-13: "Cerrar semana" → revisión `2026-W38` que cita ≥1 número since-start; Aplicar → plan nuevo
con `coachBrief` y decisión `plan-apply` con `{focus, phase, kept, changed}`; Deshacer arrastra `coachBrief`.

**A-1/A-3 (tokens, en SQL con service role):**
1. Conectar → fila `integration_tokens` con `refresh_token` no nulo (= `offline` concedido), `scope` con
   `read:cycles`, `integration_status.status='active'`; `oauth_states` vacía (consumido).
2. **Rotación:** `update integration_tokens set expires_at = now()` → "Sincronizar ahora" → `refresh_token` cambia,
   `last_refresh_at` avanza, `refresh_lock_until` null, `status='active'`, y la sync devuelve datos.
3. **Lock:** dos `curl` simultáneos a `whoop-sync` con `expires_at` forzado → ambos 200, **un solo** cambio de
   `last_refresh_at`/`refresh_token` (la segunda instancia reutiliza el par nuevo).
4. **401 → refresh → retry:** `update … set access_token='bad'` → sync OK con un refresco (logs: "401 → refresh →
   retry", una sola línea) y sin `needs_reconnect`.
5. **Reconexión sólo por `invalid_grant`** (opcional, obliga a reconectar): `refresh_token='bad'` → sync →
   `status='needs_reconnect'`, `last_error` con `invalid_grant`, la PWA muestra "Reconectar", y tras reconectar
   vuelve a `active`. Secreto de cliente incorrecto (`invalid_client`) **no** marca `needs_reconnect`.
6. iPhone: el flujo completo abre WHOOP, vuelve por Safari a `#settings?connected=whoop`, y la PWA (al volver a
   primer plano) muestra "Conectado · último sync hh:mm"; cerrar y reabrir la PWA no pierde la conexión;
   `localStorage` sin ninguna clave `whoop_*`.

**A-2 (webhook):** la mañana siguiente, `integration_events` con `recovery.updated` `processed` y
`wellness[hoy]` con `readinessSource='whoop'` antes de que intervals.icu tenga el día (comparar
`whoopSyncedAt` con la hora de la primera apertura de la app). Firma inválida → 401 y sin fila; `trace_id`
repetido → 200 sin trabajo. Home muestra "WHOOP hoy N %" sin abrir Ajustes.

**A-4 (cron):** `select jobname, status, return_message from cron.job_run_details order by start_time desc
limit 10` → `succeeded`; `net._http_response` con 202; `integration_status.last_sync_at` avanza cada 30 min
entre 05:00 y 13:30 Madrid; `refresh_token` cambia ≥1 vez al día (ejercicio diario).

**A-5 (Withings):** pesarse → en ≤5 min `bodyweight[hoy]` con `source:'withings'`, `weight`, `fatPct`, `ffmKg`;
`wellness[hoy].weightMeasured` igual; Stats › peso muestra la pesada con pill "Withings"; una pesada manual
del mismo día conserva su `weight` y añade `weightWithings`; `nutRollingWeight` y la pendiente del facts pack
usan el dato; `HEAD` al webhook → 200 y `notify list` muestra la suscripción.

**A-6:** `supabase functions list` sin `whoop-auth`; `grep -rn "whoop-auth\|whoop-callback" app/ supabase/` → 0.

## Lo que necesito de Julian (resumen)

1. **Ahora** (desbloquea A-3): en el panel de WHOOP añadir redirect URI `…/functions/v1/integrations-callback/whoop`
   y webhook `…/functions/v1/whoop-webhook`; confirmar que la app tiene `offline` y `read:cycles`.
2. **Antes de A-5:** crear la app en developer.withings.com con callback `…/integrations-callback/withings` y
   pasarme (o cargar en Supabase) `WITHINGS_CLIENT_ID` / `WITHINGS_CLIENT_SECRET`; `WHOOP_CLIENT_ID` también si
   prefiere que no vaya hardcodeado (hoy lo está en `whoop-auth`).
3. Desprogramar la tarea del domingo de Claude Code (pendiente de v2).
4. Conectar WHOOP (tras A-3) y Withings (tras A-5) una vez desde el iPhone; pesarse una mañana.
5. Domingo 2026-09-13: "Cerrar semana y pedir la próxima" (o esperar al lunes: se dispara solo).
