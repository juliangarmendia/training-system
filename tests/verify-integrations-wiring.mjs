// Coach v2.1 · Parte A — cableado de las integraciones de servidor (texto, sin ejecutar Deno).
//
// Cubre A-1 (migración + `_shared` + `integrations-oauth` + `integrations-callback`) y A-2
// (`whoop-sync.ts`, `whoop-sync`, `whoop-webhook`). A-3 añadirá la PWA y A-5 Withings; cada
// incremento amplía este fichero, no lo sustituye.
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
// Ejecutar desde la raíz del repo: node tests/verify-integrations-wiring.mjs

import { readFileSync, existsSync } from 'node:fs';

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
eq(verifyJwtOf('strava-sync'), 'true', 'strava-sync = true (sesión de la PWA)');
eq(verifyJwtOf('whoop-sync'), 'true', 'whoop-sync = true (JWT del usuario, o anon + x-cron-secret)');
eq(verifyJwtOf('whoop-webhook'), 'false', 'whoop-webhook = false (la auth es la firma HMAC)');
yes(/oauth_states/.test(fnBlock('integrations-callback') || ''),
    'el bloque del callback explica en un comentario por qué va sin JWT');
yes(/HMAC/i.test(fnBlock('whoop-webhook') || ''),
    'el bloque del webhook explica en un comentario que la auth es la firma');
yes(/x-cron-secret/.test(fnBlock('whoop-sync') || ''),
    'el bloque de whoop-sync explica el doble modo');
for (const fn of ['integrations-oauth', 'integrations-callback', 'whoop-sync', 'whoop-webhook']) {
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
const FATAL_MARKERS = /ProviderFatalAuthError|invalid_grant|tras refresh|sin refresh_token/;
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
yes(/TODO\(A-5\)/.test(CALLBACK), 'el stub que queda (Withings) está marcado como TODO de A-5');
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
yes(/x-cron-secret/.test(SYNCFN), 'modo cron por la cabecera x-cron-secret');
yes(/timingSafeEqual\(cronHeader, expected\)/.test(SYNCFN), 'comparado en tiempo constante');
yes(/EdgeRuntime\.waitUntil\(runForAll/.test(SYNCFN) && /\}, 202\)/.test(SYNCFN),
    'el cron responde 202 y trabaja bajo waitUntil (pg_net corta a los 5 s)');
yes(/\.eq\("provider", "whoop"\)[\s\S]{0,80}\.eq\("status", "active"\)/.test(SYNCFN),
    'el cron recorre sólo los tokens activos de whoop');
yes(/auth\.getUser\(\)/.test(SYNCFN), 'el modo usuario saca el usuario del JWT');
yes(/status: "needs_reconnect"/.test(SYNCFN) && /ReconnectRequired/.test(SYNCFN),
    'ReconnectRequired → 200 {ok:false, status:needs_reconnect}, no un 500');
yes(/status: "refresh_in_progress" \}, 503\)/.test(SYNCFN), 'RefreshInProgress → 503');
yes(/MAX_DAYS = 30/.test(SYNCFN), 'days con tope de 30');
yes(/for \(const userId of userIds\)[\s\S]{0,400}catch/.test(SYNCFN),
    'un usuario que falla no tumba el sync de los demás');

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
yes(/integration_events/.test(HOOKFN), 'todo evento queda en integration_events');
yes(/onConflict: "provider,trace_id", ignoreDuplicates: true/.test(HOOKFN),
    'deduplicación por (provider, trace_id): WHOOP reintenta cinco veces');
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
yes(/TODO\(A-5\)/.test(CALLBACK), 'y el de Withings sigue marcado como TODO de A-5');

console.log(failed === 0 ? '\nTODO OK' : `\n${failed} FALLOS`);
process.exit(failed === 0 ? 0 : 1);
