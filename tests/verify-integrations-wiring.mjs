// Coach v2.1 · Parte A — cableado de las integraciones de servidor (texto, sin ejecutar Deno).
//
// Cubre A-1 (migración de tokens + `_shared` + `integrations-oauth` + `integrations-callback`),
// A-2 (`whoop-sync.ts`, `whoop-sync`, `whoop-webhook`), A-4 (pg_cron + pg_net) y A-5 (Withings).
// A-3 añadirá la PWA; cada incremento amplía este fichero, no lo sustituye.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Nada de lo que hay aquí falla en desarrollo:
// falla semanas después, de noche, y se manifiesta como "WHOOP se ha vuelto a desconectar".
//
//   · `verify_jwt` mal en `config.toml`: `integrations-callback` con true rechaza al navegador
//     de WHOOP (que llega sin JWT) y conectar es imposible; `integrations-oauth` con false
//     dejaría a cualquiera crear filas `oauth_states` a nombre de otro. Y una función que
//     falta en el fichero se despliega con el valor por defecto, no con el que se pensó.
//   · El authorize de WHOOP sin `offline`: el proveedor NO devuelve refresh token, todo
//     funciona una hora y luego se cae. Es la causa raíz de la integración anterior.
//   · Sin `read:cycles`: `/v2/cycle` responde 403 y el strain/kJ del día desaparecen sin ruido.
//   · El refresh sin `scope=offline`: la doc de WHOOP lo exige y sin él la respuesta puede
//     venir sin refresh token nuevo — la siguiente rotación se queda sin par válido.
//   · El lease-lock partido en dos sentencias (leer y luego actualizar): dos instancias
//     refrescan a la vez, WHOOP rota el token dos veces y el segundo par pisa al primero.
//   · El par rotado guardado en dos updates: un fallo entre ambos deja el access token nuevo
//     con el refresh token viejo, ya invalidado. Al día siguiente, `invalid_grant` sin causa.
//   · `needs_reconnect` por un 5xx, un timeout o un `invalid_client`: obliga a Julian a
//     reconectar por un problema que no es suyo y que reconectar no arregla.
//   · Reintentar el 401 en bucle: cada vuelta quema una rotación más.
//   · Una `create policy` sobre `integration_tokens`: la tabla deja de ser sólo-service-role y
//     los tokens quedan al alcance de la clave anon.
//   · Una columna de token en `integration_status`: esa tabla SÍ la lee la PWA.
//
// A-2 añade su propia lista de silencios:
//
//   · `whoop-webhook` con `verify_jwt = true`: el gateway rechaza TODOS los eventos de WHOOP
//     antes de que la función los vea. La integración parece conectada y no llega nada.
//   · La firma calculada sobre el JSON reserializado en vez del cuerpo crudo: no cuadra nunca.
//   · Sin ventana de 5 minutos: quien capture un evento válido puede repetirlo mañana.
//   · Sin deduplicar por `trace_id`: WHOOP reintenta cinco veces en una hora y cada reintento
//     dispara otro sync del mismo sueño.
//   · Un webhook que trabaja ANTES de responder: WHOOP corta, lo da por fallido y reintenta.
//   · El cron esperando el resultado: pg_net corta a los 5 s y el job sale "fallido" siempre.
//   · Paginar con `next_token` como parámetro de PETICIÓN (es `nextToken`): se recibe una y
//     otra vez la primera página, y los días viejos no entran nunca.
//   · Escribir `ctl`/`atl`/`steps`/`weight` desde WHOOP: pisa lo de intervals.icu y Withings.
//
// A-4 y A-5, otras tantas:
//
//   · Un JWT literal en la migración del cron: queda en el repo Y en `cron.job.command`, que
//     cualquiera con acceso a la base puede leer con un `select`.
//   · `cron.schedule` sin desprogramar antes: reaplicar la migración deja dos jobs iguales
//     disparando a la vez, y el segundo refresca el token que el primero acaba de rotar.
//   · Un job que no aborta cuando faltan los secretos de Vault: cuatro fallos silenciosos cada
//     media hora, y nadie mira `cron.job_run_details`.
//   · `withings-webhook` devolviendo 401 a un `HEAD`: Withings comprueba la URL así y
//     `notify subscribe` falla con un error que no explica nada.
//   · La báscula pisando un peso escrito a mano: el número que Julian tecleó cambia solo.
//   · El forward-fill de intervals tratado como "manual": entonces la báscula NO entra nunca y
//     la composición no aparece jamás.
//
// A-7 (Strava e intervals.icu al servidor) cierra la lista, y sus silencios están en la
// cabecera de la sección 22: un token de vuelta en una respuesta, la API key en un log, un
// proveedor de API key mandado por el camino OAuth, el `check (provider in …)` sin los
// proveedores nuevos, y un upsert que reemplaza `runs`/`sessions` en vez de fundirlos.
//
// Ejecutar desde la raíz del repo: node tests/verify-integrations-wiring.mjs

import { readFileSync, existsSync, readdirSync } from 'node:fs';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const CONFIG = read('supabase/config.toml');
const SQL = read('supabase/migrations/20260908_integrations_tokens.sql');
const TOKENS = read('supabase/functions/_shared/tokens.ts');
const WHOOP = read('supabase/functions/_shared/whoop.ts');
const WITHINGS = read('supabase/functions/_shared/withings.ts');
const HTTP = read('supabase/functions/_shared/http.ts');
const DATES = read('supabase/functions/_shared/dates.ts');
const MEASURES = read('supabase/functions/_shared/measures.ts');
const OAUTH = read('supabase/functions/integrations-oauth/index.ts');
const CALLBACK = read('supabase/functions/integrations-callback/index.ts');
const WSYNC = read('supabase/functions/_shared/whoop-sync.ts');
const WWELL = read('supabase/functions/_shared/whoop-wellness.ts');
const SYNCFN = read('supabase/functions/whoop-sync/index.ts');
const HOOKFN = read('supabase/functions/whoop-webhook/index.ts');
const CRONSQL = read('supabase/migrations/20260908_integrations_cron.sql');
const WISYNC = read('supabase/functions/_shared/withings-sync.ts');
const WISYNCFN = read('supabase/functions/withings-sync/index.ts');
const WIHOOKFN = read('supabase/functions/withings-webhook/index.ts');
const EVENTS = read('supabase/functions/_shared/events.ts');
const CRON = read('supabase/functions/_shared/cron.ts');
const ORPHANSQL = read('supabase/migrations/20260910_integration_events_orphans.sql');

// A-7 · Strava e intervals.icu al servidor
const STRAVA_AD = read('supabase/functions/_shared/strava.ts');
const STRAVA_SH = read('supabase/functions/_shared/strava-sync.ts');
const STRAVAFN = read('supabase/functions/strava-sync/index.ts');
const INTERVALS_AD = read('supabase/functions/_shared/intervals.ts');
const INTERVALS_SH = read('supabase/functions/_shared/intervals-sync.ts');
const INTERVALS_WELL = read('supabase/functions/_shared/intervals-wellness.ts');
const INTERVALSFN = read('supabase/functions/intervals-sync/index.ts');
const ACT_IMPORT = read('supabase/functions/_shared/activity-import.ts');
const CARDIO_TYPES = read('supabase/functions/_shared/cardio-types.ts');
const A7SQL = read('supabase/migrations/20260911_a7_strava_intervals_tokens.sql');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

/** Bloque `[functions.<name>]` de config.toml hasta el siguiente `[`. */
function fnBlock(name) {
  const i = CONFIG.indexOf(`[functions.${name}]`);
  if (i < 0) return null;
  const rest = CONFIG.slice(i + 1);
  const j = rest.indexOf('\n[');
  return j < 0 ? CONFIG.slice(i) : CONFIG.slice(i, i + 1 + j);
}
function verifyJwtOf(name) {
  const b = fnBlock(name);
  if (!b) return 'AUSENTE';
  const m = /^\s*verify_jwt\s*=\s*(true|false)\s*$/m.exec(b);
  return m ? m[1] : 'SIN DECLARAR';
}

// ── 1. config.toml ─────────────────────────────────────────────────────────────────────────
console.log('1. config.toml: cada función con su verify_jwt declarado');
eq(verifyJwtOf('integrations-oauth'), 'true',
   'integrations-oauth = true (crea el oauth_states del usuario autenticado)');
eq(verifyJwtOf('integrations-callback'), 'false',
   'integrations-callback = false (llega el navegador del proveedor; la auth es la fila state)');
eq(verifyJwtOf('steps-ingest'), 'false', 'steps-ingest = false (Atajo de iOS con secreto compartido)');
eq(verifyJwtOf('strava-sync'), 'true', 'strava-sync = true (sesión de la PWA, o anon + x-cron-secret)');
// A-7: y aquí importa más que en ninguna. `set_key` es el ÚNICO punto por el que sube una
// credencial de usuario (la API key de intervals.icu): sin JWT no se sabe de quién es.
eq(verifyJwtOf('intervals-sync'), 'true', 'intervals-sync = true (set_key sube una credencial)');
yes(/set_key/.test(fnBlock('intervals-sync') || ''),
    'y su bloque explica en un comentario que por ahí sube la clave');
eq(verifyJwtOf('whoop-sync'), 'true', 'whoop-sync = true (JWT del usuario, o anon + x-cron-secret)');
eq(verifyJwtOf('whoop-webhook'), 'false', 'whoop-webhook = false (la auth es la firma HMAC)');
eq(verifyJwtOf('withings-sync'), 'true', 'withings-sync = true (mismos dos modos que whoop-sync)');
eq(verifyJwtOf('withings-webhook'), 'false', 'withings-webhook = false (token en la URL + userid)');
// La invariante real no es un número: es que NINGUNA carpeta de función se quede sin bloque
// (una función que falta en config.toml se despliega con el verify_jwt por defecto).
const fnDirs = readdirSync('supabase/functions', { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith('_'))
  .map((d) => d.name)
  .sort();
for (const d of fnDirs) yes(!!fnBlock(d), `config.toml declara [functions.${d}]`);
eq((CONFIG.match(/^\[functions\./gm) || []).length, fnDirs.length,
   `hay un bloque por carpeta de función y ninguno de más (${fnDirs.length})`);
yes(/oauth_states/.test(fnBlock('integrations-callback') || ''),
    'el bloque del callback explica en un comentario por qué va sin JWT');
yes(/HMAC/i.test(fnBlock('whoop-webhook') || ''),
    'el bloque del webhook explica en un comentario que la auth es la firma');
yes(/x-cron-secret/.test(fnBlock('whoop-sync') || ''),
    'el bloque de whoop-sync explica el doble modo');
yes(/WITHINGS_WEBHOOK_TOKEN/.test(fnBlock('withings-webhook') || ''),
    'el bloque del webhook de Withings explica que la auth es el token de la URL');
for (const fn of ['integrations-oauth', 'integrations-callback', 'whoop-sync', 'whoop-webhook',
                  'withings-sync', 'withings-webhook', 'strava-sync', 'intervals-sync']) {
  yes(existsSync(`supabase/functions/${fn}/deno.json`), `${fn}/deno.json existe`);
  yes(new RegExp(`entrypoint = "\\./functions/${fn}/index\\.ts"`).test(CONFIG),
      `${fn} declara su entrypoint`);
}

// ── 2. Scopes de WHOOP ─────────────────────────────────────────────────────────────────────
console.log('2. _shared/whoop.ts: offline y read:cycles');
const authorizeScopes = /WHOOP_SCOPES\s*=\s*\[([\s\S]*?)\]\.join/.exec(WHOOP)?.[1] || '';
yes(/"offline"/.test(authorizeScopes), 'el authorize pide `offline` (sin él no hay refresh token)');
yes(/"read:cycles"/.test(authorizeScopes), 'el authorize pide `read:cycles` (lo exige /v2/cycle)');
for (const s of ['read:recovery', 'read:sleep', 'read:workout', 'read:body_measurement', 'read:profile']) {
  yes(authorizeScopes.includes(`"${s}"`), `el authorize pide \`${s}\``);
}
const refreshBody = /grant_type: "refresh_token"[\s\S]{0,320}?\)/.exec(WHOOP)?.[0] || '';
yes(/scope:\s*"offline"/.test(refreshBody), 'el refresh manda `scope=offline` en el cuerpo');
yes(/refresh_token: refreshToken/.test(refreshBody), 'el refresh manda el refresh token vigente');
yes(/api\.prod\.whoop\.com\/developer/.test(WHOOP), 'API base v2 de WHOOP');
yes(/\/v2\/user\/profile\/basic/.test(WHOOP), 'perfil por /v2/user/profile/basic (external_user_id)');
yes(/method: "DELETE"[\s\S]{0,120}|\/v2\/user\/access/.test(WHOOP), 'revoke por DELETE /v2/user/access');

// ── 3. Clasificación de errores: qué obliga a reconectar y qué no ──────────────────────────
console.log('3. invalid_grant es fatal; invalid_client NO');
const grantLine = WHOOP.split('\n').find((l) => l.includes('code === "invalid_grant"'));
yes(!!grantLine, 'whoop.ts distingue `invalid_grant`');
const grantIdx = WHOOP.indexOf('code === "invalid_grant"');
yes(/ProviderFatalAuthError/.test(WHOOP.slice(grantIdx, grantIdx + 260)),
    'invalid_grant → ProviderFatalAuthError (el refresh token está muerto de verdad)');
const clientIdx = WHOOP.indexOf('invalid_client');
yes(clientIdx > 0 && /ConfigError/.test(WHOOP.slice(clientIdx, clientIdx + 260)),
    'invalid_client → ConfigError, NO fatal: el secreto es nuestro y reconectar no lo arregla');
yes(/429|>= 500/.test(WHOOP) && /ProviderTransientError/.test(WHOOP),
    '5xx/429/red → ProviderTransientError (se conservan los tokens)');
yes(/phase === "refresh"[\s\S]{0,160}ProviderFatalAuthError/.test(WITHINGS),
    'withings.ts: `status: 401` en el refresh → fatal (y en el exchange no)');
yes(/action=requesttoken|action: "requesttoken"/.test(WITHINGS), 'withings usa action=requesttoken');
yes(/wbsapi\.withings\.net\/v2\/oauth2/.test(WITHINGS), 'endpoint de token de Withings');
yes(/account\.withings\.com\/oauth2_user\/authorize2/.test(WITHINGS), 'authorize de Withings');
yes(/user\.metrics/.test(WITHINGS), 'scope user.metrics');
yes(/WITHINGS_CLIENT_ID[\s\S]{0,400}ConfigError|ConfigError[\s\S]{0,400}WITHINGS_CLIENT_ID/.test(WITHINGS),
    'sin WITHINGS_CLIENT_ID/SECRET lanza un error de configuración claro, no un crash al importar');
yes(!/^\s*const\s+\w+\s*=\s*readEnv\(/m.test(WITHINGS),
    'withings.ts no lee el entorno en el top level (no puede tumbar el flujo de WHOOP)');

// ── 4. tokens.ts: el mutex de refresco ─────────────────────────────────────────────────────
console.log('4. _shared/tokens.ts: lease-lock, rotación y reintento');
yes(/refresh_lock_until/.test(TOKENS), 'tokens.ts trabaja con refresh_lock_until');
yes(/rpc\("claim_refresh_lock"/.test(TOKENS),
    'el lease se reclama con la función SQL claim_refresh_lock (UPDATE atómico con la condición OR)');
yes(/claim_refresh_lock/.test(SQL) && /refresh_lock_until is null or refresh_lock_until < now\(\)/.test(SQL),
    'la condición del lock (null OR vencido) vive en SQL, en una sola sentencia');
yes(/interval '30 seconds'/.test(SQL), 'el lease dura 30 s (se libera solo si la función muere)');

const commitIdx = TOKENS.indexOf('COMMIT ATÓMICO');
const commit = commitIdx < 0 ? '' : TOKENS.slice(commitIdx, commitIdx + 900);
yes(commitIdx > 0, 'tokens.ts marca el commit atómico del par rotado');
for (const key of ['access_token:', 'refresh_token:', 'expires_at:', 'status: "active"',
                   'last_refresh_at:', 'last_error: null', 'refresh_lock_until: null']) {
  yes(commit.includes(key), `el commit del par rotado incluye \`${key}\` en el MISMO update`);
}
yes((TOKENS.match(/\.from\(TABLE_TOKENS\)\.update\(patch\)/g) || []).length === 1,
    'un solo update para el par rotado: nunca access token nuevo con refresh token viejo');
yes(/tokens\.refresh_token \|\| row\.refresh_token/.test(TOKENS),
    'si el proveedor no rota, se conserva el refresh token anterior (no se borra)');
yes(/FRESH_ENOUGH_MS[\s\S]{0,200}staleAccessToken/.test(TOKENS),
    'si otro acabó de refrescar se reutiliza su token sin quemar otra rotación');
yes(/PREEMPTIVE_MS = 5 \* 60_000/.test(TOKENS), 'refresco preventivo a 5 minutos de la caducidad');
yes(/EXPIRY_MARGIN_S = 60/.test(TOKENS), 'expires_at = now + expires_in − 60 s');
yes(/POLL_MS = 300/.test(TOKENS) && /POLL_MAX_MS = 5_000/.test(TOKENS),
    'sin lease: poll cada 300 ms hasta 5 s');
yes(/RefreshInProgress/.test(TOKENS), 'si nadie libera a tiempo → RefreshInProgress (503), no un refresco paralelo');
yes(/MAX_AUTH_RETRIES = 1/.test(TOKENS) && /authRetries >= MAX_AUTH_RETRIES/.test(TOKENS),
    'guard de UN solo reintento tras el 401');
yes(/401 → refresh → retry/.test(TOKENS), 'la traza del 401 → refresco → reintento queda en el log');
yes(/attempt === 0/.test(TOKENS), 'un solo reintento también cuando el dueño del lease falla');

// `needs_reconnect` sólo se ESCRIBE en un sitio, y sólo se llama por causas fatales.
console.log('5. needs_reconnect sólo por causas fatales');
const writes = (TOKENS.match(/status: "needs_reconnect"/g) || []).length;
eq(writes, 1, 'un único punto de escritura de needs_reconnect (markNeedsReconnect)');
const lines = TOKENS.split('\n');
const callSites = [];
lines.forEach((l, i) => {
  if (/await markNeedsReconnect\(/.test(l)) callSites.push(i);
});
yes(callSites.length >= 3, `hay ${callSites.length} llamadas a markNeedsReconnect`);
// A-7 suma un cuarto marcador fatal: `credencial fue rechazada`, el 401/403 de un proveedor de
// API KEY (intervals.icu). No pasa por el refresco — no hay nada que refrescar — pero es igual
// de terminal: la clave está revocada y sólo se arregla pegando una nueva.
const FATAL_MARKERS = /ProviderFatalAuthError|invalid_grant|tras refresh|sin refresh_token|credencial fue rechazada/;
for (const i of callSites) {
  const around = lines.slice(Math.max(0, i - 6), i + 3).join('\n');
  yes(FATAL_MARKERS.test(around),
      `la llamada de la línea ${i + 1} está junto a una causa fatal (invalid_grant / 401 tras refresh / sin refresh_token)`);
}
yes(/instanceof ProviderFatalAuthError[\s\S]{0,400}releaseLock/.test(TOKENS),
    'el camino NO fatal suelta el lock y conserva los tokens');
yes(/API 401 tras refresh/.test(TOKENS), 'el 401 que sobrevive al refresco sí marca needs_reconnect');

// ── 6. SQL ─────────────────────────────────────────────────────────────────────────────────
console.log('6. La migración 20260908_integrations_tokens.sql');
yes(/create table if not exists public\.integration_tokens/.test(SQL), 'integration_tokens');
yes(/alter table public\.integration_tokens enable row level security/.test(SQL),
    'integration_tokens con RLS activado');
const policiesOnTokens = (SQL.match(/create policy[^;]*on public\.integration_tokens/g) || []).length;
eq(policiesOnTokens, 0, 'CERO políticas sobre integration_tokens: RLS activo sin políticas = sólo service role');
yes(/revoke all on table public\.integration_tokens from anon, authenticated/.test(SQL),
    'y además revoke all a anon/authenticated (doble candado)');
yes(/primary key \(user_id, provider\)/.test(SQL), 'PK (user_id, provider)');
yes(/create unique index[\s\S]{0,160}integration_tokens \(provider, external_user_id\)/.test(SQL),
    'único (provider, external_user_id) para resolver el webhook');

const statusBlock = /create table if not exists public\.integration_status \(([\s\S]*?)\);/.exec(SQL)?.[1] || '';
yes(!!statusBlock, 'integration_status');
yes(!/access_token|refresh_token/.test(statusBlock),
    'integration_status NO tiene columnas de token (esa tabla sí la lee la PWA)');
for (const col of ['last_sync_at', 'last_sync_summary', 'last_event_at', 'last_error', 'external_user_id']) {
  yes(statusBlock.includes(col), `integration_status conserva \`${col}\``);
}
yes(/create policy "Users see own integration_status"[\s\S]{0,120}for select/.test(SQL),
    'integration_status con política de SELECT propio (la PWA lee su estado, nada más)');
yes(/create trigger integration_tokens_mirror[\s\S]{0,200}after insert or update or delete/.test(SQL),
    'trigger espejo en insert/update/delete');
yes(/tg_op = 'DELETE'[\s\S]{0,300}'disconnected'/.test(SQL), 'al borrar los tokens el estado queda disconnected');

yes(/create table if not exists public\.oauth_states/.test(SQL), 'oauth_states');
yes(/state\s+uuid\s+primary key/.test(SQL), 'oauth_states con el state como PK (un solo uso)');
yes(/create table if not exists public\.integration_events/.test(SQL), 'integration_events');
yes(/integration_events \(provider, trace_id\)/.test(SQL), 'único (provider, trace_id) para deduplicar reintentos');
yes(/create or replace function public\.merge_generic_row/.test(SQL), 'merge_generic_row');
yes(/p_table not in \('wellness','bodyweight'\)/.test(SQL), 'merge_generic_row sólo sobre wellness/bodyweight');
yes(/data = %1\$I\.data \|\| excluded\.data/.test(SQL), 'el merge es `data || excluded.data` dentro de la sentencia');
yes(/revoke execute on function public\.merge_generic_row[\s\S]{0,80}from public, anon, authenticated/.test(SQL),
    'EXECUTE de merge_generic_row revocado a public/anon/authenticated');
for (const t of ['oauth_states', 'integration_events']) {
  yes(new RegExp(`alter table public\\.${t} enable row level security`).test(SQL), `${t} con RLS`);
  yes(new RegExp(`revoke all on table public\\.${t} from anon, authenticated`).test(SQL), `${t} sólo service role`);
}

// ── 7. integrations-oauth ──────────────────────────────────────────────────────────────────
console.log('7. integrations-oauth');
yes(/auth\.getUser\(\)/.test(OAUTH), 'el usuario sale del JWT del llamante');
yes(/SUPABASE_ANON_KEY/.test(OAUTH), 'cliente "as user" con la anon key + Authorization del llamante');
yes(/from\("oauth_states"\)[\s\S]{0,200}\.insert\(/.test(OAUTH), 'authorize inserta la fila oauth_states');
yes(/crypto\.randomUUID\(\)/.test(OAUTH), 'state aleatorio');
yes(/\.from\("oauth_states"\)[\s\S]{0,200}\.delete\(\)[\s\S]{0,200}STATE_PURGE_MS/.test(OAUTH),
    'authorize purga los states de más de 1 h antes de insertar');
yes(/adapter\.revoke\(/.test(OAUTH) && /\.from\(TABLE_TOKENS\)[\s\S]{0,120}\.delete\(\)/.test(OAUTH),
    'disconnect revoca best-effort y borra la fila de tokens');
yes(/integrations-callback\/\$\{provider\}/.test(TOKENS),
    'la redirect URI se construye en un solo sitio: /integrations-callback/{provider}');

// ── 8. integrations-callback ───────────────────────────────────────────────────────────────
console.log('8. integrations-callback');
yes(/indexOf\("integrations-callback"\)/.test(CALLBACK), 'proveedor por segmento de ruta');
yes(/searchParams\.get\("provider"\)/.test(CALLBACK), 'con `?provider=` de respaldo');
yes(/\.delete\(\)[\s\S]{0,320}\.eq\("state"[\s\S]{0,320}\.select\("user_id"\)/.test(CALLBACK),
    'el state se lee y se consume en la MISMA sentencia (delete … returning)');
yes(/STATE_TTL_MS = 10 \* 60 \* 1000/.test(CALLBACK), 'ventana de 10 minutos para el state');
yes(/connect_error=state/.test(CALLBACK) || /fail\("state"\)/.test(CALLBACK),
    'sin state válido → connect_error=state');
yes(/fail\("no_refresh_token"\)/.test(CALLBACK) && /!tokens\.refresh_token/.test(CALLBACK),
    'un canje sin refresh_token se rechaza (connect_error=no_refresh_token)');
yes(/upsertTokens\(/.test(CALLBACK), 'alta de tokens por upsertTokens (status active, sin lock)');
yes(/EdgeRuntime\.waitUntil\(initialSync\(/.test(CALLBACK), 'el primer volcado va bajo waitUntil');
yes(/subscribeWithingsNotify/.test(CALLBACK), 'la suscripción de Withings está cableada (stub de A-5)');
yes(!/TODO\(A-[0-9]\)/.test(CALLBACK), 'ya no queda ningún stub pendiente en el callback');
yes(/#settings\?connected=\$\{provider\}/.test(CALLBACK), '302 a #settings?connected=<provider>');
// Ni un token interpolado en un log ni en una respuesta: el callback sólo redirige.
yes(!/console\.[a-z]+\([^;]*\$\{[^}]*(access_token|refresh_token)[^}]*\}/.test(CALLBACK),
    'ningún log del callback interpola un token');
yes(!/return json\(/.test(CALLBACK) && !/JSON\.stringify/.test(CALLBACK),
    'el callback no devuelve JSON: todas sus salidas son un 302 a la app');
yes(!/redirect\(`[^`]*\$\{[^}]*token[^}]*\}/.test(CALLBACK),
    'ninguna URL de redirección lleva un token');

// ── 9. Los módulos puros siguen siendo importables por Node ────────────────────────────────
console.log('9. dates.ts y measures.ts: sintaxis borrable y sin Deno al importar');
for (const [name, src] of [['dates.ts', DATES], ['measures.ts', MEASURES]]) {
  yes(!/^\s*(export\s+)?enum\s/m.test(src), `${name} sin enum`);
  yes(!/^\s*(export\s+)?namespace\s/m.test(src), `${name} sin namespace`);
  yes(!/from ["'](jsr|npm):/.test(src), `${name} sin imports jsr:/npm:`);
  yes(!/^import .*from "\.\/[^"]*[^s]";$/m.test(src), `${name} importa con extensión .ts`);
  const topLevelDeno = src
    .split('\n')
    .some((l, i) => /\bDeno\./.test(l) && !/^\s*(\/\/|\*)/.test(l) && src.split('\n').slice(0, i).join('\n').split('{').length <= 1);
  yes(!topLevelDeno, `${name} no toca Deno en el top level`);
}
yes(/typeof g\.Deno !== "undefined"/.test(DATES), 'dates.ts lee INTEGRATION_TZ con guard y en perezoso');

// ── 10. http.ts ────────────────────────────────────────────────────────────────────────────
console.log('10. _shared/http.ts');
yes(/export function timingSafeEqual/.test(HTTP), 'comparación en tiempo constante para secretos');
yes(/diff \|=/.test(HTTP), 'timingSafeEqual acumula con XOR y recorre siempre la longitud máxima');
for (const cls of ['ConfigError', 'ProviderFatalAuthError', 'ProviderTransientError',
                   'ReconnectRequired', 'RefreshInProgress']) {
  yes(new RegExp(`export class ${cls}`).test(HTTP), `taxonomía de errores: ${cls}`);
}
yes(/export \{ ConfigError, ProviderFatalAuthError, ProviderTransientError, ReconnectRequired, RefreshInProgress \}/.test(TOKENS),
    'tokens.ts reexporta la taxonomía (las funciones importan de un solo sitio)');

// ── 11. _shared/whoop-sync.ts ──────────────────────────────────────────────────────────────
console.log('11. _shared/whoop-sync.ts: paginación, precedencia y merge');
yes(/searchParams\.set\("nextToken"/.test(WSYNC),
    'el parámetro de PETICIÓN es `nextToken` (camelCase)');
yes(/body\.next_token/.test(WSYNC),
    'y el de la RESPUESTA es `next_token` (snake_case) — confundirlos devuelve siempre la 1ª página');
yes(/PAGE_LIMIT = 25/.test(WSYNC), 'limit 25 (el máximo que acepta la v2)');
yes(/MAX_PAGES/.test(WSYNC), 'tope de páginas: un next_token infinito es un bug, no un dataset');
for (const p of ['/v2/activity/sleep', '/v2/recovery', '/v2/cycle']) {
  yes(WSYNC.includes(`"${p}"`) || WSYNC.includes(`${p}/`), `pagina ${p}`);
}
yes(/\/v2\/cycle\/\$\{encodeURIComponent\(String\(cycleId\)\)\}\/recovery/.test(WSYNC),
    'la recuperación del webhook sale de /v2/cycle/{id}/recovery (no existe /v2/recovery/{id})');
yes(/sleep\.cycle_id/.test(WSYNC), 'y el cycle_id sale del propio sueño (v2 lo trae)');
yes(/withProviderFetch\(/.test(WSYNC), 'todas las llamadas pasan por withProviderFetch (token + 401 + reintento)');
yes(/rpc\("merge_generic_row"/.test(WSYNC) && /p_table: "wellness"/.test(WSYNC),
    'el merge es la función SQL atómica sobre wellness');
yes(/pickNightsByDay/.test(WSYNC), 'las noches se eligen con pickNightsByDay (siestas fuera, la más larga)');
yes(/dayOfSleep\(/.test(WSYNC), 'la recuperación se ancla al DÍA DE SU SUEÑO');
yes(/markSynced\(/.test(WSYNC), 'actualiza integration_status.last_sync_at');
yes(/Math\.min\(60, Number\(win\.days\)/.test(WSYNC), 'la ventana tiene tope');
yes(/isoDaysAgo\(days \+ 1/.test(WSYNC), 'ventana [now − days − 1d, now]: el día extra recoge lo tardío');

console.log('12. Precedencia de claves: WHOOP no escribe lo que no es suyo');
yes(/readinessSource/.test(WWELL) && /"whoop"/.test(WWELL), 'whoop-wellness.ts marca readinessSource whoop');
yes(/sleepSecs/.test(WWELL), 'y escribe sleepSecs');
yes(/inBed - \(awake \|\| 0\)/.test(WWELL), 'sleepSecs = en cama − despierto (DORMIDO, no en cama)');
const patchSrc = WWELL.split('export function buildWellnessPatch')[1] || '';
for (const k of ['ctl', 'atl', 'rampRate', 'steps', 'weight', 'bodyFat']) {
  yes(!new RegExp(`put\\(patch, "${k}"`).test(patchSrc), `buildWellnessPatch no escribe \`${k}\``);
}
yes(!/put\(patch, "source"/.test(patchSrc), 'ni `source` (esa clave es de intervals.icu)');
yes(/FORBIDDEN_KEYS/.test(WWELL), 'la lista de claves prohibidas está declarada y es testeable');
yes(/score_state === "SCORED"/.test(WWELL), 'sólo se leen puntuaciones SCORED');
yes(/cycle\.end && cycle\.score_state === "SCORED"/.test(WWELL),
    'strain y kcal sólo de un ciclo CERRADO y puntuado');
yes(/Math\.abs\(need\.need_from_recent_nap_milli/.test(WWELL),
    'la siesta siempre RESTA necesidad de sueño, venga con el signo que venga');

// ── 13. whoop-sync (la función) ────────────────────────────────────────────────────────────
console.log('13. whoop-sync: dos modos');
// C-22 (2026-09-10): el bloque del cron es idéntico en las dos funciones y vive en
// `_shared/cron.ts`. Aquí se comprueba que la función lo USE con su proveedor; el bloque en sí
// se comprueba una vez, en la sección 13b.
yes(/handleCronMode\(req, "whoop", supa, \(userIds\) => runForAll\(userIds, days\)/.test(SYNCFN),
    'modo cron delegado en handleCronMode con provider "whoop" y su runForAll');
yes(/from "\.\.\/_shared\/cron\.ts"/.test(SYNCFN), 'importado de _shared/cron.ts');
yes(/auth\.getUser\(\)/.test(SYNCFN), 'el modo usuario saca el usuario del JWT');
yes(/status: "needs_reconnect"/.test(SYNCFN) && /ReconnectRequired/.test(SYNCFN),
    'ReconnectRequired → 200 {ok:false, status:needs_reconnect}, no un 500');
yes(/status: "refresh_in_progress" \}, 503\)/.test(SYNCFN), 'RefreshInProgress → 503');
yes(/MAX_DAYS = 30/.test(SYNCFN), 'days con tope de 30');
yes(/for \(const userId of userIds\)[\s\S]{0,400}catch/.test(SYNCFN),
    'un usuario que falla no tumba el sync de los demás');

// ── 13b. _shared/cron.ts (C-22) ────────────────────────────────────────────────────────────
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR: que el arreglo se aplique a una sola de las
// dos copias. `whoop-sync` y `withings-sync` son gemelas a propósito (la PWA las llama igual y
// espera lo mismo), así que una divergencia aquí se convierte en un `if (provider === ...)` en
// el cliente — o, peor, en un secreto comparado en tiempo constante en una y con `===` en la otra.
console.log('13b. _shared/cron.ts: el modo cron, una sola vez');
yes(/x-cron-secret/.test(CRON), 'lee la cabecera x-cron-secret');
yes(/timingSafeEqual\(cronHeader, expected\)/.test(CRON), 'comparado en tiempo constante');
yes(/EdgeRuntime\.waitUntil\(run\(userIds\)\)/.test(CRON) && /\}, 202\)/.test(CRON),
    'responde 202 y trabaja bajo waitUntil (pg_net corta a los 5 s)');
yes(/\.eq\("provider", provider\)[\s\S]{0,80}\.eq\("status", "active"\)/.test(CRON),
    'y recorre sólo los tokens ACTIVOS del proveedor que se le pasa');
yes(/if \(!cronHeader\) return null/.test(CRON),
    'sin la cabecera devuelve null: el llamador sigue con el modo usuario');
yes(/CRON_SECRET/.test(CRON) && /\}, 500\)/.test(CRON), 'sin CRON_SECRET configurado, 500 explícito');

// ── 14. whoop-webhook ──────────────────────────────────────────────────────────────────────
console.log('14. whoop-webhook: firma, deduplicación y 200 inmediato');
yes(/"X-WHOOP-Signature"/.test(HOOKFN), 'lee X-WHOOP-Signature');
yes(/"X-WHOOP-Signature-Timestamp"/.test(HOOKFN), 'lee X-WHOOP-Signature-Timestamp');
yes(/hmacBase64\(secret, ts \+ raw\)/.test(HOOKFN),
    'firma = HMAC(secreto, timestamp + cuerpo CRUDO), en ese orden');
yes(/hash: "SHA-256"/.test(HTTP) && /btoa\(/.test(HTTP), 'HMAC SHA-256 en base64');
yes(/await req\.text\(\)/.test(HOOKFN) && HOOKFN.indexOf('await req.text()') < HOOKFN.indexOf('JSON.parse(raw)'),
    'el cuerpo se lee crudo ANTES de parsearlo (reserializar cambiaría la firma)');
yes(/timingSafeEqual\(expected, sig\)/.test(HOOKFN), 'comparación en tiempo constante');
yes(/TOLERANCE_MS = 5 \* 60 \* 1000/.test(HOOKFN), 'ventana de 5 minutos');
yes(/MILISEGUNDOS/.test(HOOKFN), 'el timestamp está documentado como milisegundos');
yes(/MAX_BODY_BYTES = 16 \* 1024/.test(HOOKFN) && /413/.test(HOOKFN), 'tope de 16 KB → 413');
// C-22: el alta y el cierre del evento viven en `_shared/events.ts` (eran byte a byte iguales
// en los dos webhooks). Sección 14b para el módulo.
yes(/openEvent\(supa, "whoop-webhook"/.test(HOOKFN), 'todo evento queda en integration_events (openEvent)');
yes(/provider: "whoop"/.test(HOOKFN) && /trace_id: traceId/.test(HOOKFN),
    'con su provider y su trace_id sintético');
yes(/duplicate: true/.test(HOOKFN), 'un duplicado responde 200 y no trabaja');
yes(/EdgeRuntime\.waitUntil\(process\(/.test(HOOKFN), 'el sync va bajo waitUntil');
const idx200 = HOOKFN.indexOf('EdgeRuntime.waitUntil(process(');
yes(idx200 > 0 && HOOKFN.slice(idx200, idx200 + 200).includes('return json({ ok: true, queued'),
    'y el 200 se devuelve JUSTO DESPUÉS, sin esperar al sync');
yes(/ignored: "unknown_user"/.test(HOOKFN) && /json\(\{ ok: true, ignored: "unknown_user" \}\)/.test(HOOKFN),
    'usuario desconocido → 200 + ignored (un 404 sería un oráculo de qué cuentas hay conectadas)');
yes(/HANDLED = new Set\(\["sleep\.updated", "recovery\.updated"\]\)/.test(HOOKFN),
    'sólo sleep.updated y recovery.updated; workout.* y *.deleted se ignoran');
yes(/UUID del SUEÑO/.test(HOOKFN), 'documenta que en v2 el id de recovery.updated es el del sueño');
yes(/syncWhoopSleep\(/.test(HOOKFN), 'procesa con syncWhoopSleep');
yes(/last_event_at/.test(HOOKFN), 'y adelanta integration_status.last_event_at');
yes(/status: "error"|"error",/.test(HOOKFN), 'un fallo deja el evento en estado error, no en received');

// ── 15. El callback ya hace el primer volcado ──────────────────────────────────────────────
console.log('15. integrations-callback → primer volcado real');
yes(/syncWhoop\(userId, \{ days: 30 \}\)/.test(CALLBACK), 'initialSync vuelca 30 días de WHOOP');
yes(/syncWithings\(userId, \{ days: 90 \}\)/.test(CALLBACK), 'y el de Withings vuelca 90 días');

// ── 16. A-4 · pg_cron + pg_net ─────────────────────────────────────────────────────────────
console.log('16. La migración del cron');
yes(!!CRONSQL, '20260908_integrations_cron.sql existe');
yes(/create extension if not exists pg_cron/.test(CRONSQL), 'instala pg_cron');
yes(/create extension if not exists pg_net with schema extensions/.test(CRONSQL),
    'instala pg_net en `extensions` (en `public` dispara el lint 0014)');
yes(!/eyJ[A-Za-z0-9_-]{20,}/.test(CRONSQL),
    'NINGÚN JWT literal en el fichero: el anon_key sale de Vault, no del repo ni de cron.job.command');
yes(!/[0-9a-f]{48,}/.test(CRONSQL), 'ni ningún secreto hexadecimal pegado');
yes((CRONSQL.match(/vault\.decrypted_secrets/g) || []).length >= 3,
    'los tres secretos se leen de vault.decrypted_secrets');
for (const s of ['project_url', 'anon_key', 'CRON_SECRET']) {
  yes(CRONSQL.includes(`'${s}'`), `cron_call_fn lee ${s}`);
}
yes(/raise exception 'Faltan secretos en Vault/.test(CRONSQL),
    'la migración ABORTA si Vault no está sembrado (mejor no instalar nada que 4 jobs fallando)');
yes(/net\.http_post\(/.test(CRONSQL) && /timeout_milliseconds := 5000/.test(CRONSQL),
    'net.http_post con timeout de 5 s');
yes(/'x-cron-secret',\s*v_cron/.test(CRONSQL), 'manda la cabecera x-cron-secret');
yes(/'Authorization',\s*'Bearer ' \|\| v_anon/.test(CRONSQL), 'y el JWT anon para pasar el verify_jwt');
yes(/security definer/.test(CRONSQL) &&
    /revoke execute on function public\.cron_call_fn\(text, jsonb\) from public, anon, authenticated/.test(CRONSQL),
    'cron_call_fn es security definer con EXECUTE revocado a public/anon/authenticated');
yes(/perform cron\.unschedule/.test(CRONSQL),
    'desprograma por nombre antes de programar: reaplicar no duplica jobs');
const JOBS = [
  ['whoop-sync-30m', '*/30 3-12 * * *', 'whoop-sync', '{"days":2}'],
  ['whoop-sync-daily', '0 12 * * *', 'whoop-sync', '{"days":7}'],
  ['withings-sync-daily', '15 12 * * *', 'withings-sync', '{"days":3,"resubscribe":true}'],
];
for (const [name, sched, fn, body] of JOBS) {
  const m = new RegExp(`cron\\.schedule\\('${name.replace(/[*]/g, '\\*')}',\\s*'${sched.replace(/[*]/g, '\\*')}'`);
  yes(m.test(CRONSQL), `job ${name} con schedule ${sched}`);
  const idx = CRONSQL.indexOf(`cron.schedule('${name}'`);
  const near = idx >= 0 ? CRONSQL.slice(idx, idx + 220) : '';
  yes(near.includes(`'${fn}'`) && near.includes(body), `  → llama a ${fn} con ${body}`);
}
yes(/cron\.schedule\('integration-events-gc', '30 4 \* \* 1'/.test(CRONSQL), 'job integration-events-gc semanal');
yes(/delete from public\.integration_events where received_at < now\(\) - interval '60 days'/.test(CRONSQL),
    '  → purga los eventos de más de 60 días');

// ── 17. A-5 · _shared/withings-sync.ts ─────────────────────────────────────────────────────
console.log('17. _shared/withings-sync.ts');
yes(/action: "getmeas"/.test(WISYNC), 'action=getmeas');
yes(/MEASTYPES = Object\.keys\(MEAS_TYPES\)/.test(WISYNC), 'los meastypes se derivan de MEAS_TYPES (Body Smart: 11, 170, 226, 227 incluidos)');
yes(/CATEGORY = "1"/.test(WISYNC), 'category=1 (medidas reales, no objetivos)');
yes(/body\.more === 1/.test(WISYNC) && /form\.set\("offset"/.test(WISYNC), 'sigue more/offset');
yes(/lastupdate/.test(WISYNC), 'admite la ventana barata `lastupdate` para el cron');
yes(/groupByDay\(groups, timezone\)/.test(WISYNC),
    'el día local sale del `timezone` que devuelve Withings (con INTEGRATION_TZ de respaldo)');
yes(/buildBodyweightPatch\(/.test(WISYNC), 'el parche lo calcula el módulo puro (peso manual respetado)');
yes(/\.from\("bodyweight"\)[\s\S]{0,200}\.select\("data"\)/.test(WISYNC),
    'lee la fila previa antes de escribir');
yes(/p_table: "bodyweight"/.test(WISYNC) && /p_table: "wellness"/.test(WISYNC),
    'escribe bodyweight y su espejo en wellness, ambos por merge_generic_row');
yes(/weightMeasured/.test(WISYNC) && /weightSource/.test(WISYNC) && /bodyFat/.test(WISYNC),
    'el espejo lleva weightMeasured / bodyFat / weightSource');
yes(/built\.manualKept \? "manual" : "withings"/.test(WISYNC),
    'weightSource dice de quién es el NÚMERO, no quién escribió');
yes(/markSynced\(supa, userId, "withings"/.test(WISYNC), 'actualiza integration_status');
yes(!/"weight":/.test(WISYNC) && !/patch\.weight =/.test(WISYNC),
    'withings-sync.ts nunca fija `weight` a mano: eso lo decide buildBodyweightPatch');
yes(/source: "withings"/.test(MEASURES) && /measured: true/.test(MEASURES),
    'la fila de la báscula lleva source withings y measured true (en measures.ts)');
yes(/status === 342/.test(WISYNC) && /signature_required/.test(WISYNC),
    'notify subscribe documenta el 342 (signature/nonce) sin implementarlo aún');
yes(/action: "subscribe"/.test(WISYNC) && /appli: "1"/.test(WISYNC), 'notify subscribe con appli=1');

// ── 18. A-5 · withings-sync y withings-webhook ─────────────────────────────────────────────
console.log('18. Las funciones de Withings');
yes(/handleCronMode\(\s*req,\s*"withings"/.test(WISYNCFN), 'withings-sync: modo cron por handleCronMode');
yes(/runForAll\(userIds, days, resubscribe\)/.test(WISYNCFN), 'con su propio runForAll (resubscribe incluido)');
yes(/status: "needs_reconnect"/.test(WISYNCFN) && /status: "refresh_in_progress" \}, 503\)/.test(WISYNCFN),
    'mismas respuestas de estado que whoop-sync (la PWA no necesita un if por proveedor)');
yes(/resubscribe/.test(WISYNCFN) && /subscribeWithingsNotify\(/.test(WISYNCFN),
    'resubscribe renueva la suscripción antes de sincronizar');

yes(/"HEAD"/.test(WIHOOKFN) && /req\.method === "HEAD"/.test(WIHOOKFN),
    'HEAD responde 200: Withings comprueba la URL así antes de aceptar la suscripción');
yes(/WITHINGS_WEBHOOK_TOKEN/.test(WIHOOKFN), 'exige WITHINGS_WEBHOOK_TOKEN');
yes(/timingSafeEqual\(t, expected\)/.test(WIHOOKFN), 'comparado en tiempo constante');
yes(/appli/.test(WIHOOKFN) && /TOLERATED_APPLI = "1"/.test(WIHOOKFN), 'sólo appli=1 (pesadas)');
yes(/external_user_id/.test(WIHOOKFN) && /ignored: "unknown_user"/.test(WIHOOKFN),
    'el userid tiene que existir como external_user_id; si no, 200 + ignored');
yes(/openEvent\(supa, "withings-webhook"/.test(WIHOOKFN), 'evento registrado y deduplicado (openEvent)');
yes(/trace_id: traceId/.test(WIHOOKFN) &&
    /\$\{externalUserId\}:\$\{startdate\}:\$\{enddate\}:\$\{appli\}/.test(WIHOOKFN),
    'trace_id = userid:startdate:enddate:appli');
yes(/EdgeRuntime\.waitUntil\(process\(/.test(WIHOOKFN), 'el volcado va bajo waitUntil');
yes(/last_event_at/.test(WIHOOKFN), 'y adelanta last_event_at');
yes(/syncWithings\(userId, win, supa\)/.test(WIHOOKFN), 'sincroniza el rango del aviso');

yes(/subscribeWithingsNotify\(userId, supa\)/.test(CALLBACK),
    'el callback suscribe las notificaciones al conectar Withings');
yes(/syncWithings\(userId, \{ days: 90 \}\)/.test(CALLBACK), 'y vuelca 90 días de pesadas');

// ═══════════════════════════════════════════════════════════════════════════════════════════
// A-3 · LA PWA. Los silencios de este lado son distintos y todos acaban en la misma frase:
// "WHOOP se ha vuelto a desconectar".
//
//   · Un solo `localStorage.setItem('whoop_refresh_token', …)` que sobreviva y volvemos al
//     punto de partida: dos almacenamientos rotando el mismo token, `invalid_grant` al segundo.
//   · `whoop-callback.html` en el repo (o en `APP_SHELL`) y la redirect URI vieja sigue
//     resolviendo: el usuario "conecta" y los tokens acaban en un origen que la PWA instalada
//     no ve — en iOS Safari y la PWA tienen almacenamiento separado.
//   · `integrations.js` fuera de `APP_SHELL`: sin red la app carga sin `integrationsIsActive`,
//     y entonces `whoopIsConnected()` miente.
//   · El `<script>` en el orden equivocado: `whoop.js` se evalúa antes e `integrationsIsActive`
//     no existe cuando `whoopIsConnected()` la necesita.
//   · `integration_status` colado en la lista de stores de `syncAll`: no es una tabla genérica
//     (no tiene `record_id`/`data`), así que la cola de salida se congelaría — el mismo bug que
//     dejó `plans` parado siete semanas en v11.28.
//   · `pullStore` escribiendo con `smartPut`: cada fila bajada de la nube se volvería a subir,
//     y una copia vieja del cliente podría pisar lo que acaba de escribir el webhook.
//   · `intervalsFetchWellness` sin el guard de precedencia: el readiness de intervals.icu llega
//     horas más tarde y pisa el de WHOOP, que es justo el que la app dice tener "de hoy".
// ═══════════════════════════════════════════════════════════════════════════════════════════

const WHOOPJS = read('app/whoop.js');
const INTEGJS = read('app/integrations.js');
const SYNCJS = read('app/supabase-sync.js');
const APPJS = read('app/app.js');
const INDEX = read('app/index.html');
const SW = read('app/sw.js');

console.log('19. app/whoop.js: ni un token, ni una llamada directa a la API');
yes(!!WHOOPJS, 'app/whoop.js existe');
for (const marca of ['whoop_access_token', 'whoop_refresh_token', 'whoop_token_expiry',
                     'whoop_needs_reconnect', 'api.prod.whoop.com', 'whoop-auth']) {
  yes(!WHOOPJS.includes(marca), `whoop.js sin \`${marca}\``);
}
yes(!/localStorage\.(set|get|remove)Item\(\s*['"]whoop/.test(WHOOPJS),
    'whoop.js no guarda nada de WHOOP en localStorage');
yes(/integrationsIsActive\('whoop'\)/.test(WHOOPJS),
    "whoopIsConnected() = intervals configurado ∨ integrationsIsActive('whoop')");
yes(/integrationsSync\('whoop'/.test(WHOOPJS), 'y el dato de hoy se pide con integrationsSync');
yes(/pullStore\('wellness'\)/.test(WHOOPJS), 'las filas se bajan con pullStore(wellness)');
const IFW = WHOOPJS.slice(WHOOPJS.indexOf('async function intervalsFetchWellness()'),
                          WHOOPJS.indexOf('// ==================== EL DATO DE HOY'));
yes(IFW.length > 500, 'se localiza intervalsFetchWellness');
yes(/readinessSource === 'whoop'/.test(IFW),
    "intervalsFetchWellness guarda la precedencia: `readinessSource === 'whoop'` manda");
yes(/WHOOP_OWNED_KEYS/.test(WHOOPJS) && /'sleepRemSecs'/.test(WHOOPJS),
    'con la lista de claves de WHOOP declarada y testeable');
yes(/_whoopRowsEqual\((compact|merged), prev\)/.test(IFW),
    'y no reescribe una fila idéntica (mata el churn de updated_at en cada render)');
yes(/source === 'withings'/.test(IFW),
    'ni escribe un bodyweight sobre una pesada de la báscula Withings');

console.log('20. whoop-callback.html borrado');
yes(!existsSync('app/whoop-callback.html'), 'app/whoop-callback.html ya no existe');
yes(!/whoop-callback/.test(SW), 'y no queda en sw.js');
yes(!/whoop-callback/.test(INDEX), 'ni en index.html');

console.log('21. sw.js e index.html: integrations.js cargado y cacheado');
// v11.66 (V-6): `APP_SHELL` pasó de array plano a `{ critical, optional }` — la tanda
// crítica aborta el install si falla, la opcional no. La extracción acepta las dos formas.
const shell = /const APP_SHELL = [[{]([\s\S]*?)\n[\]}];/.exec(SW)?.[1] || '';
yes(/'\.\/integrations\.js'/.test(shell), "APP_SHELL incluye './integrations.js'");
yes(/'\.\/whoop\.js'/.test(shell), "y sigue incluyendo './whoop.js'");
const iSync = INDEX.indexOf('src="supabase-sync.js"');
const iInteg = INDEX.indexOf('src="integrations.js"');
const iWhoop = INDEX.indexOf('src="whoop.js"');
yes(iInteg > 0, 'index.html carga integrations.js');
yes(iSync > 0 && iInteg > iSync, 'después de supabase-sync.js (necesita getSupaClient/pullStore)');
yes(iWhoop > 0 && iInteg < iWhoop, 'y antes de whoop.js (que usa integrationsIsActive)');
yes(/id="integrations-card"/.test(INDEX), 'existe el contenedor #integrations-card en Ajustes');
yes(!/id="whoop-section"/.test(INDEX), 'y el bloque legacy de WHOOP en Ajustes ya no está');
yes(!/renderWhoopUI/.test(INDEX) && !/renderWhoopUI/.test(APPJS),
    'nadie llama a renderWhoopUI (la pintaba el <details> legacy)');
// v11.68 (V-9): las dos llamadas pasan por `safeCall` — integrations.js es otro <script> y
// desde v11.68 hay UNA sola forma de llamar a otro modulo. Lo que se vigila sigue siendo que
// init() haga las dos cosas.
yes(/safeCall\('integrationsHandleReturn'\)/.test(APPJS), 'init() atiende la vuelta del OAuth');
yes(/safeCall\('renderIntegrationsCard'\)/.test(APPJS), 'y pinta la tarjeta de Integraciones');

console.log('22. supabase-sync.js: pullStore extraído, 15 stores intactos');
yes(/async function pullStore\(store/.test(SYNCJS), 'pullStore(store, {since, user}) existe');
yes(/window\.pullStore = pullStore/.test(SYNCJS), 'y está expuesto en window');
yes(/await pullStore\(store, \{ since, user \}\)/.test(SYNCJS), 'syncAll lo usa para cada store');
const pullBody = SYNCJS.slice(SYNCJS.indexOf('async function pullStore(store'),
                              SYNCJS.indexOf('// ==================== FULL SYNC'));
yes(/await dbPut\(store, merged\)/.test(pullBody), 'pullStore escribe con dbPut');
yes(!/smartPut/.test(pullBody),
    'y NUNCA con smartPut: estas filas vienen de la nube, encolarlas las devolvería');
const storesM = /const stores = \[([^\]]*)\]/.exec(SYNCJS);
const syncStores = storesM ? [...storesM[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
eq(syncStores.length, 15, `${syncStores.length} stores sincronizados (sigue en 15 tras A-3)`);
yes(!syncStores.includes('integration_status'),
    'integration_status NO entra en la lista (no es tabla genérica; la PWA la lee directa)');
yes(syncStores.includes('wellness') && syncStores.includes('bodyweight'),
    'wellness y bodyweight sí (son las que escriben las integraciones)');

console.log('23. app/integrations.js: llama a las funciones y no guarda un solo token');
yes(!!INTEGJS, 'app/integrations.js existe');
yes(/functions\.invoke\('integrations-oauth'/.test(INTEGJS), "invoca 'integrations-oauth'");
yes(/action: 'authorize'/.test(INTEGJS) && /action: 'disconnect'/.test(INTEGJS),
    'con las dos acciones del contrato');
yes(/'whoop-sync'/.test(INTEGJS) && /'withings-sync'/.test(INTEGJS),
    "invoca 'whoop-sync' y 'withings-sync'");
yes(/body: \{ days, mode: 'sync' \}/.test(INTEGJS), "con el cuerpo { days, mode:'sync' }");
yes(/window\.location\.href = data\.url/.test(INTEGJS),
    'el authorize navega a la URL que da el servidor (la PWA no construye ninguna)');
// C-8: la invariante es que integrations.js no ACCEDA a localStorage. Se comprueba sobre los
// accesos (`getItem`/`setItem`/`removeItem`/indexado), no sobre la palabra: los comentarios de
// A-7 explican POR QUÉ la clave de intervals.icu sigue en localStorage (en app.js) y esa
// explicación tiene que poder estar escrita al lado.
yes(!/localStorage\s*(\.\s*(get|set|remove)Item|\[)/.test(INTEGJS),
    'integrations.js no accede a localStorage (ni get/set/removeItem ni indexado)');
// `no_refresh_token` es un CÓDIGO DE ERROR del callback (el proveedor no concedió `offline`),
// no un token: se neutraliza antes de buscar nombres de credencial.
const INTEG_SIN_CODIGOS = INTEGJS.replace(/no_refresh_token/g, 'sin_permiso_persistente');
for (const marca of ['access_token', 'refresh_token', 'client_secret']) {
  yes(!INTEG_SIN_CODIGOS.includes(marca), `integrations.js sin \`${marca}\``);
}
yes(/from\('integration_status'\)/.test(INTEGJS), 'lee integration_status (el espejo, sin tokens)');
yes(!/from\('integration_tokens'\)/.test(INTEGJS), 'y jamás integration_tokens');
yes(/INTEG_STATUS_TTL_MS = 60 \* 1000/.test(INTEGJS), 'caché de estado de 60 s');
yes(/pullStore\(store\)/.test(INTEGJS) && /INTEG_SYNC_STORES\[provider\]/.test(INTEGJS),
    'tras sincronizar baja los stores del proveedor (mapa, no un if por proveedor)');
yes(/invalidateReadiness\(\)/.test(INTEGJS), 'e invalida el readiness cacheado');
yes(/status: 'needs_reconnect'/.test(INTEGJS),
    'trata needs_reconnect como un estado que se pinta, no como una caída');
yes(/Connected/.test(INTEGJS) && /Reconnect/.test(INTEGJS) && /Not connected/.test(INTEGJS),
    'la pill tiene los tres estados (en inglés: la UI es toda en inglés desde v11.67)');
yes(/integ-pill/.test(INTEGJS) && /\.ok|'ok'/.test(INTEGJS), 'con sus clases CSS');
yes(/>Sync now</.test(INTEGJS) && /Disconnect</.test(INTEGJS)
    && /'Reconnect' : 'Connect'/.test(INTEGJS),
    'y los tres botones (Connect/Reconnect comparten uno: el texto lo decide el estado)');
yes(/last sync \$\{/.test(INTEGJS) && /event \$\{/.test(INTEGJS),
    'la segunda línea dice último sync y último evento');
yes(/'never'/.test(INTEGJS), 'con "never" cuando no hay marca');
yes(/integ-err/.test(INTEGJS) && /last_error/.test(INTEGJS), 'y `last_error` tiene su hueco');
yes(/Sign in to connect/.test(INTEGJS), 'sin sesión la tarjeta lo dice');
yes(/status: 'offline'/.test(INTEGJS), "y las funciones devuelven { ok:false, status:'offline' }");
yes(/connect_error/.test(INTEGJS) && /no_refresh_token/.test(INTEGJS),
    'la vuelta del OAuth traduce los códigos de error a prosa legible');
yes(/params\.get\('connected'\)/.test(INTEGJS) && /switchTab\('settings'\)/.test(INTEGJS),
    'y al volver conectado abre Ajustes');
yes(/visibilitychange/.test(INTEGJS),
    'al volver a primer plano relee el estado (en iPhone la vuelta cae en Safari)');
yes(/confirm\(/.test(INTEGJS), 'desconectar pide confirmación');
const tryCount = (INTEGJS.match(/try \{/g) || []).length;
const catchCount = (INTEGJS.match(/catch/g) || []).length;
yes(tryCount >= 8 && catchCount >= tryCount,
    `cada llamada a Supabase va envuelta (${tryCount} try / ${catchCount} catch)`);
yes(/module\.exports/.test(INTEGJS), 'exporta para los tests como el resto de módulos');

console.log('24. La pesada de Withings se distingue en pantalla');
yes(/_bwSourcePill/.test(APPJS), 'hay una pill de origen para la fila de bodyweight');
yes(/e\.source !== 'withings'/.test(APPJS), 'que sólo se pinta cuando la fila es de la báscula');
yes(/fatPct/.test(APPJS), 'y añade el % de grasa del dispositivo cuando viene');
yes(/\.bw-source-pill/.test(read('app/style.css')), 'con su CSS');


// ── v11.70 · S-1 strava-sync: el usuario del JWT, nunca del cuerpo · C-9 trace_id sintético ──
console.log('');
console.log('v11.70 · strava-sync no confía en body.user_id; strava.js llama con la sesión; WHOOP dedupe sin trace_id');
{
  const STRAVA_FN = read('supabase/functions/strava-sync/index.ts');
  const STRAVAJS = read('app/strava.js');
  // A-7 reescribió la función: ya no hay bloque `if (action === "sync")` porque el volcado es la
  // acción por defecto y vive en `_shared/strava-sync.ts`. Lo que se comprueba es la misma
  // invariante: el usuario del JWT y la escritura con el userId resuelto, nunca con uno del cuerpo.
  yes(/asUser\.auth\.getUser\(\)/.test(STRAVA_FN), 'sync: el usuario sale de asUser.auth.getUser() (patrón de whoop-sync)');
  yes(!/user_id\s*\}\s*=\s*body/.test(STRAVA_FN) && !/body\.user_id/.test(STRAVA_FN), 'sync: body.user_id no se lee en ningún sitio');
  yes(/p_user: userId/.test(read('supabase/functions/_shared/activity-import.ts')),
      'y los dos merges (runs, sessions) escriben el userId resuelto en el servidor');
  yes(!/text\.substring\(0, 500\) \}/.test(STRAVA_FN) && !/\$\{text\.substring\(0, 200\)\}/.test(STRAVA_FN), 'los textos crudos de Strava/PostgREST ya no van al cliente');
  yes(/import \{ createClient \} from "npm:@supabase\/supabase-js@2"/.test(STRAVA_FN), 'importa createClient para resolver la sesión');
  yes(!/Bearer \$\{SUPABASE_ANON_KEY\}/.test(STRAVAJS), 'strava.js ya no manda la anon key como Authorization');
  // A-7: strava.js ya no invoca nada por su cuenta. La invocación (con el JWT de la sesión) es de
  // integrations.js, que es quien tiene el mapa proveedor → función.
  yes(!/functions\.invoke/.test(STRAVAJS) && /integrationsSync\('strava'/.test(STRAVAJS),
      "strava.js delega en integrationsSync('strava') (la invocación con JWT vive en integrations.js)");
  yes(/'strava-sync'/.test(INTEGJS), "y integrations.js sí invoca 'strava-sync'");
  yes(!/user_id: user\.id/.test(STRAVAJS), 'y no manda user_id en el cuerpo');
  yes(/payload\.trace_id\s*\?\s*String\(payload\.trace_id\)\s*:\s*`\$\{type\}:\$\{externalUserId\}:/.test(HOOKFN),
    'whoop-webhook: sin trace_id, clave sintética type:user:id (cinco reintentos = una fila)');
}

// ── fn v5 · C-11 timeouts · C-12 huérfanos · C-22 events.ts ───────────────────────────────
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR. Tres, y los tres son de los que no fallan hoy:
//
//   · **Un `fetch` sin tope** (C-11). Un proveedor que acepta la conexión y luego no contesta
//     deja la promesa colgada hasta que el runtime mata el isolate: en modo usuario es un
//     spinner eterno; bajo `waitUntil` la instancia se queda ocupada, el cron siguiente entra
//     encima y el evento del webhook se queda en `received` para siempre.
//   · **Un timeout tratado como fallo de auth**. Si el abort escapara de la clasificación y
//     acabara en `markNeedsReconnect`, una red lenta obligaría a Julian a rehacer el OAuth —
//     que es justo lo que no lo arregla. Un timeout es SIEMPRE `ProviderTransientError`.
//   · **El evento huérfano** (C-12). El evento se inserta `received` antes de procesar porque
//     hay que responder 2xx ya. Si el `waitUntil` muere, la fila se queda ahí para siempre: el
//     reintento del proveedor cae en `ignoreDuplicates` y responde 200 sin hacer nada, y el GC
//     la borra a los 60 días sin procesarla. El reintento, que era la segunda oportunidad, se
//     convierte en la garantía de que el dato no entra nunca.
console.log('');
console.log('19. C-11 · ningún fetch de servidor sin timeout');
yes(/export function fetchWithTimeout/.test(HTTP), '_shared/http.ts exporta fetchWithTimeout');
yes(/AbortSignal\.timeout\(ms\)/.test(HTTP), 'con AbortSignal.timeout (aborta también el cuerpo, no sólo el handshake)');
yes(/new AbortController\(\)/.test(HTTP), 'y un respaldo con AbortController donde el helper no exista');
yes(/TOKEN_TIMEOUT_MS = 12_000/.test(HTTP), 'refresco/canje de token: 12 s');
yes(/PROVIDER_TIMEOUT_MS = 15_000/.test(HTTP), 'API del proveedor: 15 s');
yes(/export function isTimeoutError/.test(HTTP) && /export function netErrorText/.test(HTTP),
    'y un par de ayudas para decir en el log que fue un timeout');
// Ni un solo `fetch(` crudo en el servidor: el grep es la comprobación, no la lista de sitios.
for (const [name, src] of [
  ['_shared/whoop.ts', WHOOP], ['_shared/withings.ts', WITHINGS], ['_shared/tokens.ts', TOKENS],
  ['strava-sync/index.ts', read('supabase/functions/strava-sync/index.ts')],
]) {
  const crudos = (src.match(/(?<!WithTimeout)(?<![A-Za-z])fetch\(/g) || []).length;
  eq(crudos, 0, `${name}: cero fetch() sin tope`);
}
// El timeout tiene que aterrizar en la rama TRANSITORIA, nunca en needs_reconnect.
yes(/ProviderTransientError\([\s\S]{0,120}netErrorText\(err/.test(TOKENS),
    'tokens.ts: el fallo de red (timeout incluido) se lanza como ProviderTransientError');
yes(/ProviderTransientError\([\s\S]{0,140}netErrorText\(err, TOKEN_TIMEOUT_MS\)/.test(WHOOP),
    'whoop.ts: igual en el endpoint de token — un timeout no quema el refresh token');
yes(/ProviderTransientError\([\s\S]{0,140}netErrorText\(err, TOKEN_TIMEOUT_MS\)/.test(WITHINGS),
    'withings.ts: igual');
yes(!/markNeedsReconnect/.test(WHOOP) && !/markNeedsReconnect/.test(WITHINGS),
    'y ningún adaptador marca needs_reconnect por su cuenta (eso es de tokens.ts)');

console.log('');
console.log('20. C-22 · _shared/events.ts: el alta y el cierre del evento, una sola vez');
yes(/export async function openEvent/.test(EVENTS) && /export async function closeEvent/.test(EVENTS),
    'openEvent y closeEvent exportados');
yes(/onConflict: "provider,trace_id", ignoreDuplicates: true/.test(EVENTS),
    'deduplicación por (provider, trace_id): los proveedores reintentan');
yes(/from "\.\.\/_shared\/events\.ts"/.test(HOOKFN) && /from "\.\.\/_shared\/events\.ts"/.test(WIHOOKFN),
    'los dos webhooks lo importan');
yes(!/async function closeEvent\(/.test(HOOKFN) && !/async function closeEvent\(/.test(WIHOOKFN),
    'y ninguno conserva su copia local (eran byte a byte iguales)');
yes(/opened\.failed/.test(HOOKFN) && /opened\.failed/.test(WIHOOKFN),
    'un fallo del alta sigue siendo un 500, no un 200 silencioso');

console.log('');
console.log('21. C-12 · los eventos huérfanos se reencolan');
yes(/status: "received", error: null, processed_at: null/.test(EVENTS),
    'un duplicado en `error` se REABRE a received (el reintento vuelve a servir para algo)');
yes(/\.eq\("id", prev\.id\)[\s\S]{0,80}\.eq\("status", "error"\)/.test(EVENTS),
    'con un reclamo atómico condicionado a status=error: dos reintentos a la vez no sincronizan dos veces');
yes(/prev\.status !== "error"/.test(EVENTS),
    'y `processed`/`ignored`/`received` NO se tocan (ya se hizo, o hay otra instancia dentro)');
yes(ORPHANSQL.length > 0, 'existe la migración 20260910_integration_events_orphans.sql');
yes(/create or replace function public\.integration_events_requeue_orphans/.test(ORPHANSQL),
    'define integration_events_requeue_orphans()');
yes(/status = 'received'[\s\S]{0,200}interval '30 minutes'/.test(ORPHANSQL),
    'marca los `received` de más de 30 minutos');
yes(/'orphan: processing never finished'/.test(ORPHANSQL), 'con el motivo escrito en la fila');
yes(/security definer/.test(ORPHANSQL) && /revoke execute on function public\.integration_events_requeue_orphans/.test(ORPHANSQL),
    'security definer con EXECUTE revocado (la bitácora no la escribe un cliente anon)');
yes(/cron\.schedule\('integration-events-orphans', '\*\/30 \* \* \* \*'/.test(ORPHANSQL),
    'programado cada 30 minutos');
yes(/cron\.unschedule/.test(ORPHANSQL),
    'y desprogramado antes por nombre: reaplicar la migración no puede dejar dos jobs iguales');

// ── A-7 · Strava e intervals.icu al servidor (cierra C-8) ─────────────────────────────────
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR. Estas dos credenciales vivían en el teléfono y
// A-7 las mueve a `integration_tokens`. Todo lo que puede deshacer ese trabajo es de una línea
// y ninguna de esas líneas falla en desarrollo:
//
//   · **Un token de vuelta en una respuesta.** `strava-sync` era un proxy sin estado:
//     `exchange` devolvía el par access/refresh al navegador y `refresh` lo recibía en el
//     cuerpo. Un solo `access_token:` en un `json(...)` y la credencial vuelve al
//     `localStorage`, con la PWA instalada y Safari pisándose la rotación otra vez.
//   · **La API key de intervals.icu de vuelta a la app.** Es una credencial con permiso de
//     ESCRITURA (la app empuja semanas de entreno al COROS con ella). Devolverla en `status`
//     "para poder mostrarla" la reintroduce en el store `settings`, que se sincroniza Y entra en
//     el JSON de la copia de seguridad exportable. Sólo puede salir `maskSecret(...)`.
//   · **La clave en un `console.log`.** Los logs de las edge functions se leen desde el panel y
//     se quedan días. Un `console.log(body)` en la acción `set_key` publica la credencial.
//   · **`intervals` por el camino OAuth.** Su `expires_at` es null: `getValidToken` lo tomaría
//     por caducado, iría a `refreshWithLock`, no encontraría refresh token y marcaría
//     `needs_reconnect`. La integración se apagaría sola con una clave perfectamente válida
//     guardada. Las dos guardas por `kind` son lo que lo impide.
//   · **El check de `provider` sin los proveedores nuevos.** Todo el código se despliega, la
//     PWA pinta el flujo entero, y el insert muere con un 23514 al final.
//   · **`intervals` en el check de `oauth_states`.** Permitiría crear un `state` que nunca
//     podrá canjearse: un camino muerto con aspecto de camino vivo.
//   · **Un upsert que REEMPLAZA `runs`/`sessions`.** Borraría la sensación (`feel`) que el
//     usuario escribió sobre una carrera importada y lo que aportó el otro importador (la misma
//     carrera de un COROS llega por Strava Y por intervals.icu).
//   · **El scope de Strava sin `activity:read`.** En su pantalla de consentimiento las casillas
//     son independientes: el canje sale bien, la tarjeta dice "Conectado" y cada listado
//     responde 403 para siempre.
console.log('');
console.log('22. A-7 · registro de proveedores: uno solo, derivado de los adaptadores');
yes(/kind: "oauth" as const/.test(WHOOP) && /kind: "oauth" as const/.test(WITHINGS) &&
    /kind: "oauth" as const/.test(STRAVA_AD) && /kind: "apikey" as const/.test(INTERVALS_AD),
    'los cuatro adaptadores declaran su `kind` (oauth ×3, apikey ×1)');
yes(/ProviderId = "whoop" \| "withings" \| "strava" \| "intervals"/.test(TOKENS),
    'ProviderId incluye los cuatro');
// `isProvider` DERIVADO del registro y no una cadena de `||`: en A-7 había que tocarlo en dos
// sitios y olvidarse de uno significa "provider inválido" para un adaptador que sí existe.
yes(/hasOwnProperty\.call\(ADAPTERS, p\)/.test(TOKENS),
    'isProvider se deriva de ADAPTERS, no de una lista escrita a mano');
yes(/export const PROVIDERS = Object\.keys\(ADAPTERS\)/.test(TOKENS),
    'y PROVIDERS también (la lista que valida `integrations-oauth`)');
for (const p of ['whoop', 'withings', 'strava', 'intervals']) {
  yes(new RegExp(`^\\s{2}${p}: \\w+Adapter as unknown as ProviderAdapter,$`, 'm').test(TOKENS),
      `ADAPTERS registra ${p}`);
}

console.log('');
console.log('23. A-7 · ni un token en un cuerpo, ni en una respuesta, ni en un log');
for (const [nombre, src] of [
  ['strava-sync/index.ts', STRAVAFN],
  ['_shared/strava-sync.ts', STRAVA_SH],
  ['intervals-sync/index.ts', INTERVALSFN],
  ['_shared/intervals-sync.ts', INTERVALS_SH],
  ['_shared/activity-import.ts', ACT_IMPORT],
]) {
  yes(!/body[.?]{1,2}access_token/.test(src) && !/body[.?]{1,2}refresh_token/.test(src),
      `${nombre}: no lee tokens del cuerpo`);
  yes(!/\baccess_token:/.test(src) && !/\brefresh_token:/.test(src),
      `${nombre}: ninguna respuesta lleva un token dentro`);
}
// La API key SÍ sube una vez (es la única forma: intervals.icu no tiene OAuth) y NO baja nunca.
yes(/body\?\.apiKey/.test(INTERVALSFN), 'intervals-sync: la clave sube en `set_key` (única vía)');
yes(/keyHint: maskSecret\(apiKey\)/.test(INTERVALSFN),
    'y lo único que se devuelve de ella es maskSecret(apiKey)');
yes(!/console\.(log|warn|error)\([^)]*apiKey/.test(INTERVALSFN),
    'la clave NO aparece en ningún console.* (los logs del panel se quedan días)');
yes(!/console\.(log|warn|error)\([^)]*access_token/.test(INTERVALS_SH) &&
    !/console\.(log|warn|error)\([^)]*access_token/.test(STRAVA_SH),
    'ni el access token en los logs de los módulos de sync');
yes(/keyHint: maskSecret\(row\.access_token\)/.test(INTERVALS_SH),
    'credentialStatus devuelve el indicio enmascarado, no la clave');
yes(/export function maskSecret/.test(HTTP) && /if \(s\.length <= keep \* 2\) return "••••"/.test(HTTP),
    'maskSecret no revela nada de un secreto corto');
yes(/return `••••\$\{s\.slice\(-keep\)\}`/.test(HTTP),
    'y el número de puntos es fijo: no publica la longitud de la clave');

console.log('');
console.log('24. A-7 · el usuario, del JWT; el token, de la base');
for (const [nombre, src] of [['strava-sync', STRAVAFN], ['intervals-sync', INTERVALSFN]]) {
  yes(/asUser\.auth\.getUser\(\)/.test(src), `${nombre}: el usuario sale del JWT`);
  yes(/return json\(\{ error: "Token inválido" \}, 401\)/.test(src),
      `${nombre}: una sesión inválida es un 401, no un fallback`);
  yes(!/body\.user_id/.test(src) && !/body\?\.user_id/.test(src),
      `${nombre}: body.user_id no se lee en ningún sitio`);
  yes(/handleCronMode\(req, "(strava|intervals)"/.test(src),
      `${nombre}: modo cron por el bloque compartido (C-22)`);
  yes(/x-cron-secret/.test(CRON), `${nombre}: y ese bloque compara el secreto en tiempo constante`);
}
// El cron se comprueba ANTES de resolver el JWT: manda el JWT anon, que no identifica a nadie.
yes(INTERVALSFN.indexOf('handleCronMode') < INTERVALSFN.indexOf('asUser.auth.getUser'),
    'intervals-sync: el modo cron se atiende antes de resolver el JWT (el anon no identifica a nadie)');
yes(STRAVAFN.indexOf('handleCronMode') < STRAVAFN.indexOf('asUser.auth.getUser'),
    'strava-sync: igual');
yes(/getApiKey\(supa, provider, userId\)/.test(TOKENS),
    'la API key se lee de la base (getApiKey), nunca de la petición');

console.log('');
console.log('25. A-7 · las dos guardas por `kind` (una clave válida no puede apagar la integración)');
yes(/getValidToken: \$\{provider\} usa API key/.test(TOKENS),
    'getValidToken rechaza un proveedor de API key (si no, iría a refrescar lo que no existe)');
yes(/getApiKey: \$\{provider\} usa OAuth/.test(TOKENS), 'y getApiKey rechaza uno de OAuth');
yes(/if \(adapter\.kind === "apikey"\) return await withApiKeyFetch/.test(TOKENS),
    'withProviderFetch desvía las API keys a su propio camino (sin bucle de refresco)');
yes(/refresh_token: null/.test(TOKENS) && /upsertApiKey/.test(TOKENS),
    'upsertApiKey guarda refresh_token a NULL: un refresco es imposible por construcción');
yes(/expires_at: null/.test(TOKENS), 'y expires_at a NULL: la clave no caduca');
yes(/authHeader\(credential: string\)/.test(TOKENS) || /adapter\.authHeader \?/.test(TOKENS),
    'la cabecera la decide el adaptador (Bearer por defecto, Basic en intervals.icu)');
yes(/return `Basic \$\{btoa\(`API_KEY:\$\{apiKey\}`\)\}`/.test(INTERVALS_AD),
    'intervals.icu usa HTTP Basic con el usuario literal API_KEY');
yes(/authorizeUrl[\s\S]{0,200}throw new Error/.test(INTERVALS_AD),
    'y sus métodos de OAuth lanzan: nadie debe llegar a ellos, y si llega se ve');
yes(/code: "apikey_provider"/.test(OAUTH),
    'integrations-oauth rechaza `authorize` para intervals con un código que dice dónde ir');
yes(/getAdapter\(candidate\)\.kind !== "oauth"/.test(CALLBACK),
    'y el callback no acepta un código para un proveedor sin OAuth');

console.log('');
console.log('26. A-7 · timeouts y clasificación de errores en los proveedores nuevos');
for (const [nombre, src] of [
  ['_shared/strava.ts', STRAVA_AD], ['_shared/intervals.ts', INTERVALS_AD],
  ['_shared/strava-sync.ts', STRAVA_SH], ['_shared/intervals-sync.ts', INTERVALS_SH],
  ['_shared/activity-import.ts', ACT_IMPORT], ['_shared/cardio-types.ts', CARDIO_TYPES],
  ['_shared/intervals-wellness.ts', INTERVALS_WELL],
]) {
  const crudos = (src.match(/(?<!WithTimeout)(?<![A-Za-z])fetch\(/g) || []).length;
  eq(crudos, 0, `${nombre}: cero fetch() sin tope`);
}
yes(/fetchWithTimeout\([\s\S]{0,300}TOKEN_TIMEOUT_MS\)/.test(STRAVA_AD),
    'strava.ts: el endpoint de token con 12 s');
yes(/fetchWithTimeout\([\s\S]{0,300}PROVIDER_TIMEOUT_MS\)/.test(STRAVA_AD),
    'strava.ts: perfil y deauthorize con 15 s');
yes(/fetchWithTimeout\([\s\S]{0,200}PROVIDER_TIMEOUT_MS\)/.test(INTERVALS_AD),
    'intervals.ts: la validación de la clave con 15 s');
yes(/ProviderTransientError\([\s\S]{0,140}netErrorText\(err, TOKEN_TIMEOUT_MS\)/.test(STRAVA_AD),
    'strava.ts: un timeout del token es TRANSITORIO (no quema el refresh token)');
yes(/ProviderTransientError\([\s\S]{0,140}netErrorText\(err, PROVIDER_TIMEOUT_MS\)/.test(INTERVALS_AD),
    'intervals.ts: igual con la API');
yes(!/markNeedsReconnect/.test(STRAVA_AD) && !/markNeedsReconnect/.test(INTERVALS_AD),
    'y ningún adaptador nuevo marca needs_reconnect por su cuenta (eso es de tokens.ts)');
// La TRAMPA de Strava: el mismo 400 significa tres cosas según `errors[].resource`/`field`.
const refreshIdx = STRAVA_AD.indexOf('e.resource === "refreshtoken"');
const appIdx = STRAVA_AD.indexOf('e.resource === "application"');
const codeIdx = STRAVA_AD.indexOf('e.resource === "authorizationcode"');
const rateIdx = STRAVA_AD.indexOf('res.status === 429 || res.status >= 500');
yes(refreshIdx > 0 && /ProviderFatalAuthError/.test(STRAVA_AD.slice(refreshIdx, refreshIdx + 260)),
    'strava.ts: refresh_token inválido EN EL REFRESCO → fatal (el único caso que obliga a reconectar)');
yes(/phase === "refresh" && \(e\.resource === "refreshtoken"/.test(STRAVA_AD),
    'y sólo en el refresco: en el canje ese error no existe');
yes(appIdx > 0 && /ConfigError/.test(STRAVA_AD.slice(appIdx, appIdx + 240)),
    'strava.ts: client_id/secret mal → ConfigError (reconectar no lo arregla)');
yes(codeIdx > 0 && !/ProviderFatalAuthError/.test(STRAVA_AD.slice(codeIdx, codeIdx + 200)),
    'strava.ts: un código de autorización caducado NO marca la integración como rota');
yes(rateIdx > 0 && rateIdx < refreshIdx,
    'strava.ts: el 429/5xx se clasifica ANTES que los `errors[]` (un 500 con cuerpo raro no es fatal)');
yes(/status === 401 \|\| status === 403/.test(INTERVALS_AD),
    'intervals.ts: 401 y 403 son fallo de credencial (403 = la clave no cubre a ese atleta)');
yes(/ATHLETE_ID_RE = \/\^\[A-Za-z0-9_-\]\{1,40\}\$\//.test(INTERVALS_AD),
    'y el id de atleta se valida: va dentro de la RUTA de la API');

console.log('');
console.log('27. A-7 · Strava: scope, ventana y espejo de estado');
yes(/STRAVA_SCOPES = "read,activity:read_all"/.test(STRAVA_AD),
    'scope con activity:read_all (con activity:read Strava OCULTA las actividades privadas, sin avisar)');
yes(/activity:read/.test(CALLBACK) && /return fail\("scope"\)/.test(CALLBACK),
    'el callback comprueba el scope CONCEDIDO (las casillas de Strava son independientes)');
yes(/if \(!tokens\.scope\) tokens\.scope = granted/.test(CALLBACK),
    'y lo guarda: la respuesta del token de Strava no trae scope, la redirección sí');
yes(/expires_at/.test(STRAVA_AD) && /expAt - nowSecs/.test(STRAVA_AD),
    'la caducidad se toma del `expires_at` absoluto, no del `expires_in` relativo (latencia)');
yes(/markSynced\(supa, userId, "strava"/.test(STRAVA_SH), 'strava-sync escribe el espejo de estado');
yes(/markSynced\(supa, userId, "intervals"/.test(INTERVALS_SH), 'intervals-sync también');
yes(/MAX_PAGES/.test(STRAVA_SH) && /records\.length < PAGE_LIMIT/.test(STRAVA_SH),
    'la paginación de Strava tiene tope y final (page/per_page, no cursor)');
yes(/syncStrava\(userId, \{ days: 90 \}\)/.test(CALLBACK),
    'y al conectar se hace el primer volcado de 90 días (sin histórico, el presupuesto arranca ciego)');

console.log('');
console.log('28. A-7 · intervals.icu: merge aditivo y precedencia de claves');
// El merge tiene que ser `merge_generic_row`. Un `.upsert()` de PostgREST reemplaza `data`.
for (const [nombre, src] of [['_shared/intervals-sync.ts', INTERVALS_SH], ['_shared/activity-import.ts', ACT_IMPORT]]) {
  yes(/rpc\("merge_generic_row"/.test(src), `${nombre}: escribe con merge_generic_row`);
  yes(!/\.upsert\(/.test(src), `${nombre}: y NO con un upsert que reemplaza la fila entera`);
}
// La lista de claves que son de WHOOP tiene que estar COMPLETA: si al servidor se le queda una
// fuera, la copia degradada de intervals.icu (horas más tarde, sin fases de sueño ni SpO2) pisa
// el readiness bueno. La lista mínima se declara aquí, y MIENTRAS el cliente conserve su copia
// (`app/whoop.js`, hasta que se reescriba para A-7) las dos tienen que coincidir exactamente.
const OWNED_MIN = [
  'readiness', 'hrv', 'restingHR', 'spO2', 'skinTemp',
  'sleepSecs', 'sleepInBedSecs', 'sleepAwakeSecs', 'sleepRemSecs', 'sleepDeepSecs',
  'sleepLightSecs', 'sleepScore', 'sleepEfficiency', 'sleepConsistency', 'respiration',
  'sleepNeedSecs',
].sort();
const ownedFn = (/export const WHOOP_OWNED_KEYS = \[([\s\S]*?)\];/.exec(INTERVALS_WELL)?.[1] || '')
  .match(/"([a-zA-Z0-9]+)"/g)?.map((s) => s.replace(/"/g, '')).sort() || [];
eq(ownedFn.join(','), OWNED_MIN.join(','),
   'WHOOP_OWNED_KEYS del servidor: las 16 claves de recuperación y sueño, ni una menos');
const ownedApp = (/const WHOOP_OWNED_KEYS = \[([\s\S]*?)\];/.exec(WHOOPJS)?.[1] || '')
  .match(/'([a-zA-Z0-9]+)'/g)?.map((s) => s.replace(/'/g, '')).sort() || [];
if (ownedApp.length) {
  eq(ownedApp.join(','), ownedFn.join(','), 'y coincide con la copia que aún tiene app/whoop.js');
} else {
  ok('app/whoop.js ya no tiene su copia (A-7 cliente hecho): la del servidor es la única');
}
yes(/prev\.readinessSource === "whoop"/.test(INTERVALS_WELL),
    'si el día lo escribió WHOOP, sus claves se quitan del parche de intervals.icu');
yes(/prev\.weightSource === "withings"/.test(INTERVALS_WELL),
    'si el peso es de la báscula, el eco redondeado de intervals.icu no lo pisa (D-1)');
yes(/WITHINGS_OWNED_KEYS = \["weight", "weightMeasured", "bodyFat", "weightSource"\]/.test(INTERVALS_WELL),
    'y la lista de lo que es de la báscula está escrita, no adivinada');
yes(/existing\.source === "withings"/.test(INTERVALS_WELL),
    'en `bodyweight`, la pesada de Withings manda siempre');
yes(/existing && !existing\.source && existingWeight !== null/.test(INTERVALS_WELL),
    'y un peso escrito a mano en la app tampoco se pisa (más estricto que el cliente)');
yes(/Math\.abs\(\(projected as number\) - prevDayWeight\) >= 0\.05/.test(INTERVALS_WELL),
    'el forward-fill sólo se guarda si CAMBIA (si no, inventa días de "peso estable")');
yes(/tempWeight/.test(INTERVALS_WELL) && /suavizado/.test(INTERVALS_WELL),
    'tempWeight (medida) y weight (proyección) siguen siendo cosas distintas');
// Sin webhook: intervals.icu no notifica, así que no se abre una fila que nadie va a cerrar.
// El grep es sobre el CÓDIGO, no sobre los comentarios: la cabecera del módulo explica
// justamente por qué no se abre una fila de eventos.
yes(!/_shared\/events\.ts/.test(INTERVALS_SH) && !/openEvent|closeEvent|TABLE_EVENTS/.test(INTERVALS_SH) &&
    !/openEvent|closeEvent|TABLE_EVENTS/.test(INTERVALSFN),
    'intervals-sync NO abre filas en integration_events (sin webhook, serían huérfanas permanentes de C-12)');
yes(!existsSync('supabase/functions/intervals-webhook'),
    'y no hay función de webhook para un proveedor que no notifica');
// La derivación de zonas de FC se queda en el cliente; lo que se mueve es la LLAMADA.
yes(/action === "athlete"/.test(INTERVALSFN) && /export async function athleteZones/.test(INTERVALS_SH),
    'hay una acción `athlete` que devuelve los campos de FC (el cliente sigue derivando sus zonas)');
yes(/sportSettings: settings\.map/.test(INTERVALS_SH),
    'y devuelve una forma RECORTADA, no el JSON entero del atleta (nombre y correo no hacen falta)');
// EL FALLO QUE ESTO IMPIDE. Mover la clave al servidor deja sin credencial al botón que manda la
// semana de carrera al calendario de intervals.icu (y de ahí al COROS), que Julian usa cada
// semana. La salida NO es reconstruir la semana en el servidor: se arma con el plan activo, el
// cardio del coach y la regla de fase, y el DSL va verbatim porque un bloque de trote/caminata no
// se puede aplanar a "35m Z2". Lo que se mueve es la LLAMADA, igual que con las zonas.
yes(/action === "push_events"/.test(INTERVALSFN) && /export async function pushEvents/.test(INTERVALS_SH),
    'hay una acción `push_events`: el cliente sigue armando la semana, el servidor sólo pone la credencial');
yes(/events\/bulk\?upsert=true/.test(INTERVALS_SH),
    'y empuja por el endpoint bulk con upsert: la misma semana dos veces actualiza, no duplica');
yes(/PUSH_EXTERNAL_ID = \/\^pwa-/.test(INTERVALS_SH),
    "el `external_id` tiene que empezar por `pwa-`: sin eso el proxy podría pisar un evento que Julian creó a mano");
yes(/PUSH_MAX_EVENTS/.test(INTERVALS_SH) && /PUSH_CATEGORIES/.test(INTERVALS_SH) && /PUSH_LOCAL_DATE/.test(INTERVALS_SH),
    'y valida cuántos, de qué categoría y con qué fecha local (un proxy sin cotas es un proxy abierto)');
{
  const src = INTERVALS_SH.slice(INTERVALS_SH.indexOf('export async function pushEvents'));
  const cuerpo = src.slice(0, src.indexOf('export ', 10) === -1 ? src.length : src.indexOf('export ', 10));
  yes(/console\.error\(/.test(cuerpo) && !/error: [^}]*res\.text/.test(cuerpo),
      'el cuerpo crudo de intervals.icu va al log, no al cliente (C-29)');
  yes(/PushBadRequest/.test(cuerpo),
      'y una forma inválida es 400 con su propio tipo de error, no un 500 que parece caída del proveedor');
}
yes(/code: "invalid_events"/.test(INTERVALSFN) && /, 400\)/.test(INTERVALSFN),
    'la función traduce ese error a 400 con un código estable');

console.log('');
console.log('29. A-7 · la migración 20260911_a7_strava_intervals_tokens.sql');
yes(A7SQL.length > 0, 'existe');
for (const t of ['integration_tokens', 'integration_status']) {
  yes(new RegExp(`alter table public\\.${t}[\\s\\S]{0,200}check \\(provider in \\('whoop','withings','strava','intervals'\\)\\)`).test(A7SQL),
      `${t}: el check acepta los cuatro proveedores`);
}
// El check de la base y el registro del código tienen que decir lo MISMO.
const checkList = (/integration_tokens_provider_check\s*\n\s*check \(provider in \(([^)]*)\)\)/.exec(A7SQL)?.[1] || '')
  .split(',').map((s) => s.trim().replace(/'/g, '')).filter(Boolean).sort();
const adapterList = [...(TOKENS.match(/^\s{2}(\w+): \w+Adapter as unknown as ProviderAdapter,$/gm) || [])]
  .map((l) => /^\s{2}(\w+):/.exec(l)[1]).sort();
eq(checkList.join(','), adapterList.join(','),
   'y coincide EXACTAMENTE con ADAPTERS (un adaptador sin su check muere con un 23514 al guardar)');
yes(/oauth_states_provider_check\s*\n\s*check \(provider in \('whoop','withings','strava'\)\)/.test(A7SQL),
    "oauth_states NO acepta 'intervals': no tiene OAuth, y un state que no se puede canjear es un camino muerto");
yes(/not valid;\n\s*alter table public\.integration_tokens validate constraint/.test(A7SQL),
    'los checks se añaden `not valid` y se validan aparte (sin lock largo de escritura)');
yes(/p_table not in \('wellness','bodyweight','steps','runs','sessions'\)/.test(A7SQL),
    'merge_generic_row acepta las cinco tablas y sigue siendo una LISTA BLANCA');
yes(/revoke execute on function public\.merge_generic_row/.test(A7SQL) &&
    /grant execute on function public\.merge_generic_row\(text, uuid, text, jsonb\) to service_role/.test(A7SQL),
    'con EXECUTE revocado a todos menos service_role (security definer + p_table dinámico = escritor universal)');
yes(/data \|\| excluded\.data/.test(A7SQL), 'y el merge sigue siendo aditivo dentro de una sola sentencia');
for (const job of ['intervals-sync-daily', 'strava-sync-daily']) {
  yes(new RegExp(`cron\\.schedule\\('${job}'`).test(A7SQL), `programa ${job}`);
  yes(new RegExp(`jobname in \\([^)]*'${job}'`).test(A7SQL), `y lo desprograma antes por nombre (idempotente)`);
}
yes(/cron_call_fn\('intervals-sync'/.test(A7SQL) && /cron_call_fn\('strava-sync'/.test(A7SQL),
    'los dos jobs llaman por cron_call_fn (secretos de Vault, no literales en el repo)');
yes(!/eyJ[A-Za-z0-9_-]{10,}/.test(A7SQL),
    'y no hay un JWT escrito en la migración (quedaría en el repo Y en cron.job.command)');
yes(/proname = 'cron_call_fn'/.test(A7SQL),
    'aborta si falta cron_call_fn en vez de programar dos jobs que fallan en silencio');


// ═══════════════════════════════════════════════════════════════════════════════════════════
// 30. A-7 · LA MITAD CLIENTE: Strava entera al servidor, intervals.icu con la clave arriba
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR. Ninguno se ve el día que se escribe:
//
//   · **Un token de Strava que sobreviva en `app/*.js`.** Cualquier lectura o escritura de
//     `strava_access_token` / `strava_refresh_token` que quede viva devuelve el problema entero:
//     la PWA instalada y Safari rotando el mismo refresh token, el segundo con `invalid`, y
//     "Strava se ha desconectado sola" cada pocos días. El fichero sólo puede BORRAR esas claves.
//   · **La API key de intervals.icu volviendo a la fila sincronizada.** C-8 la sacó de
//     `settings/userSettings` (que viaja a Supabase Y al JSON del backup exportable) y la puso en
//     `localStorage`. Un `smartPut` sin el filtro, o un `saveIntervalsCredentials` que escriba la
//     clave en `state.settings`, la devuelve al adjunto — y es una credencial con permiso de
//     ESCRITURA (la app empuja semanas de entreno al COROS con ella).
//   · **El mapa de proveedores incompleto.** `_integStatus` se declaraba con dos huecos a mano y
//     el filtro de filas era un `hasOwnProperty` sobre ese objeto: una fila de `strava` o de
//     `intervals` se descartaba en SILENCIO y la tarjeta pintaba "Not connected" sobre una
//     integración activa, invitando a reconectar y a quemar una rotación sin motivo.
//   · **`integrationsSync` con el ternario de dos proveedores.** `strava` e `intervals` habrían
//     acabado los dos en `whoop-sync`: un 200 que no sincroniza nada y no se queja.
//   · **La clave en un log o en un toast.** Sube una vez y no baja nunca; lo único que puede
//     salir es el indicio enmascarado (`••••1234`).
console.log('');
console.log('30. A-7 · la mitad cliente (Strava al servidor, intervals.icu con clave en el servidor)');
{
  const STRAVAJS = read('app/strava.js');

  // -- 30.1 · ni un token de Strava en NINGÚN fichero de la app -------------------------------
  yes(!!STRAVAJS, 'app/strava.js existe');
  for (const marca of ['STRAVA_CLIENT_ID', 'STRAVA_REDIRECT_URI', 'STRAVA_AUTH_URL', 'STRAVA_SCOPE',
                       'www.strava.com/oauth', '_stravaCall', 'stravaRefreshToken', 'stravaGetToken',
                       'stravaMarkReconnect', "action: 'refresh'", "action: 'exchange'"]) {
    yes(!STRAVAJS.includes(marca), `strava.js sin \`${marca}\``);
  }
  // Lo ÚNICO que strava.js puede hacer con localStorage es BORRAR: las siete claves del OAuth de
  // cliente son credenciales muertas y siguen en el dispositivo hasta que alguien las quite.
  const lsVerbos = [...STRAVAJS.matchAll(/localStorage\s*\.\s*(\w+)/g)].map((m) => m[1]);
  yes(lsVerbos.length > 0 && lsVerbos.every((v) => v === 'removeItem'),
      `strava.js sólo BORRA de localStorage (${[...new Set(lsVerbos)].join(', ') || 'nada'})`);
  yes(/STRAVA_DEAD_LS_KEYS/.test(STRAVAJS) && /^stravaPurgeDeviceCredentials\(\);$/m.test(STRAVAJS),
      'y la limpieza se ejecuta al cargar el script (una vez por arranque)');
  for (const k of ['strava_access_token', 'strava_refresh_token', 'strava_token_expiry',
                   'strava_athlete_id', 'strava_athlete_name', 'strava_last_sync', 'strava_needs_reconnect']) {
    yes(STRAVAJS.includes(`'${k}'`), `la limpieza incluye ${k}`);
  }
  // Y en el RESTO de la app tampoco queda una lectura de credencial de Strava.
  for (const [name, src] of [['app/app.js', APPJS], ['app/whoop.js', WHOOPJS], ['app/integrations.js', INTEGJS]]) {
    yes(!/localStorage\.(get|set)Item\(\s*['"]strava_/.test(src), `${name} no lee ni escribe credenciales de Strava`);
    yes(!/strava_(access|refresh)_token/.test(src), `${name} no nombra un token de Strava`);
  }

  // -- 30.2 · los cinco envoltorios apuntan a integrations.js --------------------------------
  yes(/integrationsConnect\('strava'\)/.test(STRAVAJS), "stravaConnect() -> integrationsConnect('strava')");
  yes(/integrationsIsActive\('strava'\)/.test(STRAVAJS), "stravaIsConnected() -> integrationsIsActive('strava')");
  yes(/integrationsStatusOf\('strava'\)/.test(STRAVAJS) && /'needs_reconnect'/.test(STRAVAJS),
      "stravaNeedsReconnect() -> la fila de estado con status 'needs_reconnect'");
  yes(/integrationsSync\('strava', \{ days: STRAVA_SYNC_DAYS \}\)/.test(STRAVAJS)
      && /STRAVA_SYNC_DAYS = 7/.test(STRAVAJS), "stravaSync() -> integrationsSync('strava', {days: 7})");
  yes(/integrationsDisconnect\('strava'\)/.test(STRAVAJS), "stravaDisconnect() -> integrationsDisconnect('strava')");
  // C-28: el toast sigue pudiendo decir la causa, y sin fallo local usa el `last_error` del espejo.
  yes(/function stravaLastError\(\)/.test(STRAVAJS) && /row\.last_error/.test(STRAVAJS),
      'stravaLastError() sigue existiendo y cae al last_error de integration_status');
  yes(/errText\(safeCall\('stravaLastError'\)/.test(APPJS), 'y el toast de Ajustes lo usa (C-28)');
  // La página de vuelta del OAuth de cliente ya no existe.
  yes(!existsSync('app/strava-callback.html'), 'app/strava-callback.html borrado');
  yes(!/strava-callback\.html/.test(SW.slice(SW.indexOf('const APP_SHELL'), SW.indexOf('const SHELL_URLS'))),
      'y fuera del APP_SHELL (precachear un 404 tira la tanda opcional sin ruido)');
  yes(!/strava-callback/.test(INDEX), 'ni referenciado en index.html');

  // -- 30.3 · el registro de proveedores: los CUATRO, y derivado -----------------------------
  for (const id of ['whoop', 'withings', 'strava', 'intervals']) {
    yes(new RegExp(`id: '${id}'`).test(INTEGJS), `INTEG_PROVIDERS incluye ${id}`);
    yes(new RegExp(`${id}: '${id}-sync'`).test(INTEGJS), `INTEG_SYNC_FN mapea ${id} -> ${id}-sync`);
  }
  yes(/Runs and cardio from COROS/.test(INTEGJS), 'Strava se describe como "Runs and cardio from COROS"');
  yes(/Training load, steps and history/.test(INTEGJS), 'e intervals.icu como "Training load, steps and history"');
  yes(/INTEG_PROVIDER_IDS = INTEG_PROVIDERS\.map/.test(INTEGJS),
      'la lista de ids se DERIVA de INTEG_PROVIDERS (no una segunda lista a mano)');
  yes(/function _integEmptyStatus/.test(INTEGJS) && /for \(const id of INTEG_PROVIDER_IDS\) base\[id\] = null/.test(INTEGJS),
      'y el estado vacío también: _integStatus tiene hueco para los cuatro');
  yes(!/\{ whoop: null, withings: null, offline: true \}/.test(INTEGJS),
      'ya no queda el objeto de dos proveedores escrito a mano');
  yes(/INTEG_PROVIDER_IDS\.indexOf\(row\.provider\) >= 0/.test(INTEGJS),
      'el filtro de filas usa la lista derivada (el hasOwnProperty descartaba strava e intervals)');
  yes(!/hasOwnProperty\.call\(next/.test(INTEGJS), 'y el hasOwnProperty ya no está');

  // -- 30.4 · el sync elige función y stores por mapa ----------------------------------------
  yes(/const fn = INTEG_SYNC_FN\[provider\];/.test(INTEGJS), 'integrationsSync saca la función del mapa');
  yes(/if \(!fn\) return \{ ok: false, status: 'error'/.test(INTEGJS),
      'y un proveedor desconocido no llama a nadie (antes caía en whoop-sync)');
  yes(!/provider === 'withings' \? 'withings-sync' : 'whoop-sync'/.test(INTEGJS), 'el ternario de dos proveedores se fue');
  const storesBlock = INTEGJS.slice(INTEGJS.indexOf('const INTEG_SYNC_STORES'), INTEGJS.indexOf('async function integrationsSync'));
  yes(/strava: \['runs', 'sessions'\]/.test(storesBlock), 'strava baja runs + sessions');
  yes(/intervals: \['wellness', 'bodyweight', 'steps', 'runs', 'sessions'\]/.test(storesBlock),
      'intervals baja wellness + bodyweight + steps + runs + sessions');
  yes(/whoop: \['wellness'\]/.test(storesBlock) && /withings: \['wellness', 'bodyweight'\]/.test(storesBlock),
      'y WHOOP / Withings siguen bajando lo mismo que antes');

  // -- 30.5 · intervals.icu: proveedor de API key, no de OAuth ------------------------------
  yes(/apiKey: true/.test(INTEGJS), 'intervals.icu está marcado como proveedor de API key');
  yes(/function integrationsIsApiKeyProvider/.test(INTEGJS), 'con un predicado, no un igual-a-intervals repartido');
  const connectBlock = INTEGJS.slice(INTEGJS.indexOf('async function integrationsConnect'),
                                     INTEGJS.indexOf('async function integrationsDisconnect'));
  yes(/integrationsIsApiKeyProvider\(provider\)/.test(connectBlock)
      && /code: 'apikey_provider'/.test(connectBlock),
      "integrationsConnect('intervals') corta con code:'apikey_provider' (no hay authorize que abrir)");
  yes(/data-integ-act="savekey"/.test(INTEGJS) && /function _integKeyForm/.test(INTEGJS),
      'y la tarjeta pinta un formulario de clave en vez del botón Connect');
  yes(/id="integ-key-value"/.test(INTEGJS) && /type="password"/.test(INTEGJS), 'con el campo de clave en type=password');
  yes(!/id="integ-key-value"[^>]*value="/.test(INTEGJS),
      'y SIN `value=`: la clave no baja del servidor, así que el campo nace vacío');
  yes(/keyEl\.value = ''/.test(INTEGJS), 'tras guardar, el campo se vacía (fuera del DOM en cuanto ha viajado)');
  yes(/action: 'set_key'/.test(INTEGJS) && /action: 'status'/.test(INTEGJS),
      "invoca 'intervals-sync' con set_key y con status");
  yes(/action: 'push_events'/.test(INTEGJS) && /action: 'athlete'/.test(INTEGJS), 'y con push_events y athlete');
  yes(/scope: 'Strava did not grant access to your activities'/.test(INTEGJS),
      'INTEG_CONNECT_ERROR_EN traduce el código `scope` de Strava');

  // -- 30.6 · LA CLAVE NO SALE: ni por smartPut, ni por el backup, ni por un log ------------
  yes(/async function saveIntervalsCredentials/.test(APPJS), 'app.js tiene UN camino de guardado');
  const saveBlock = APPJS.slice(APPJS.indexOf('async function saveIntervalsCredentials'),
                                APPJS.indexOf('// ==================== UNIFIED SYNC CARD'));
  yes(/integrationsSetIntervalsKey\(clave, atleta\)/.test(saveBlock), 'que sube la clave al servidor');
  yes(/setIntervalsApiKey\(clave\)/.test(saveBlock), 'y la guarda con el accesor de C-8 (localStorage)');
  yes(!/state\.settings\.intervalsIcuApiKey/.test(saveBlock),
      'y NUNCA en state.settings (eso la devolvería a la fila sincronizada y al backup)');
  yes(/intervalsIcuAthleteId = resuelto/.test(saveBlock),
      'el id de atleta sí va a settings (no es secreto: es i12345)');
  yes(/integrationsSaveIntervalsKey/.test(INTEGJS) && /typeof saveIntervalsCredentials === 'function'/.test(INTEGJS),
      'y los DOS formularios entran por la misma función (dos caminos = una clave vieja en un lado)');
  // El filtro de smartPut y el redactado del backup siguen en pie: son la mitad de C-8.
  yes(/const LOCAL_ONLY_KEYS = \['intervalsIcuApiKey', 'stepsSecret'\]/.test(APPJS),
      'LOCAL_ONLY_KEYS sigue listando la API key');
  yes(/if \(store === 'settings' && data && data\.key === 'userSettings'\)/.test(APPJS)
      && /_stripLocalOnly/.test(APPJS), 'smartPut sigue filtrándola de userSettings');
  yes(/BACKUP_REDACT_KEYS = \['stepsSecret', 'intervalsIcuApiKey'\]/.test(APPJS),
      'y el backup exportable sigue redactándola');
  // Ni un log, ni un toast, con el valor dentro.
  for (const [name, src] of [['app/integrations.js', INTEGJS], ['app/app.js', APPJS]]) {
    yes(!/console\.(log|warn|info|error)\([^)]*\b(apiKey|clave|newKey)\b/.test(src),
        `${name} no registra la clave en consola`);
    yes(!/toast\([^)]*\b(apiKey|clave|newKey)\b/.test(src), `${name} no la muestra en un toast`);
  }
  yes(/keyHint/.test(INTEGJS) && /keyHint/.test(APPJS),
      'lo único que se pinta de la clave es el indicio enmascarado que devuelve el servidor');

  // -- 30.7 · el empuje al COROS y las zonas, por servidor cuando hay credencial ------------
  const pushBlock = APPJS.slice(APPJS.indexOf('async function _icuUpsertEvents'),
                                APPJS.indexOf('// Subtipo del plan v2'));
  yes(/integrationsIntervalsHasServerKey/.test(pushBlock) && /integrationsPushIntervalsEvents\(events\)/.test(pushBlock),
      '_icuUpsertEvents empuja por el servidor cuando hay credencial');
  yes(/fetchWithTimeout\(`https:\/\/intervals\.icu\/api\/v1\/athlete\//.test(pushBlock),
      'y conserva el camino directo como respaldo (el import de cliente sigue vivo)');
  yes(/external_id: `pwa-/.test(APPJS), 'los external_id siguen empezando por pwa- (el servidor lo exige)');
  const zonesBlock = APPJS.slice(APPJS.indexOf('async function fetchIntervalsIcuZones'),
                                 APPJS.indexOf('// Return a bpm-range string'));
  yes(/integrationsIntervalsAthlete\(\)/.test(zonesBlock), 'fetchIntervalsIcuZones pide athlete al servidor');
  yes(/icu_lthr: srv\.lthr/.test(zonesBlock),
      'y re-mapea a los nombres crudos para que la heurística de zonas sea LA MISMA función');
  yes(/bpmLooking/.test(zonesBlock) && /z\.long_easy = z\.zone2/.test(zonesBlock),
      'el algoritmo de zonas no se ha tocado');
  // El punto de retirada, escrito donde se va a leer.
  yes(/PUNTO DE RETIRADA · A-7/.test(APPJS),
      'el import de cliente de intervals.icu lleva su punto de retirada comentado');
  yes(/Sync from the server/.test(APPJS) && /integrationsSync\('intervals', \{ days: 7 \}\)/.test(APPJS),
      'y Ajustes tiene el botón que ejercita el camino de servidor a demanda');
}

console.log(failed === 0 ? '\nTODO OK' : `\n${failed} FALLOS`);
process.exit(failed === 0 ? 0 : 1);
