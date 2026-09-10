// ====================================================================
// Strava — envoltorios finos sobre `integrations.js` (A-7, 2026-09-10)
// ====================================================================
//
// QUÉ ERA ESTE FICHERO Y POR QUÉ YA NO LO ES. Hasta v11.72 este módulo hacía el OAuth de Strava
// él mismo: abría el authorize con su propio client_id, mandaba el código a un proxy sin estado
// (`strava-sync {action:'exchange'}`), guardaba el par de tokens en `localStorage` y los volvía
// a mandar en cada sincronización. Tres fallos, los mismos que ya se pagaron con WHOOP (A-3):
//
//   · Strava **rota** el refresh token en cada uso. La PWA instalada y Safari en iOS son dos
//     almacenamientos distintos: el segundo refrescaba con el valor ya quemado y recibía
//     `{field:"refresh_token", code:"invalid"}` → "Strava se ha desconectado sola".
//   · El access token viajaba en el CUERPO de cada llamada. Cualquier XSS, cualquier extensión
//     y cualquier copia de seguridad del teléfono se llevaban una credencial de larga vida.
//   · iOS desaloja el almacenamiento local de una PWA que no se abre en unos días.
//
// Ahora los tokens viven en `integration_tokens` (sólo service role), el refresco se serializa
// en el servidor con el lease-lock de `_shared/tokens.ts` y el volcado lo hace el cron
// `strava-sync-daily` sin que nadie abra la app. **Por aquí no pasa un token jamás.**
//
// SE MOVIÓ ENTERO, NO A MEDIAS, y eso fue una decisión: Strava no había importado ni una fila
// (sus upserts fallaban contra un índice único parcial, arreglado el 2026-09-10), así que no
// había pipeline vivo que arriesgar. intervals.icu sí lo tiene, y por eso conserva su import de
// cliente un incremento más (ver el punto de retirada en `intervalsIcuSync`, app.js).
//
// Lo que queda aquí son cinco envoltorios de una línea sobre `integrations.js`. Existen para no
// tocar a los llamadores (`renderStravaUI` en app.js) y para que el nombre siga significando lo
// mismo; el día que la tarjeta legacy de Ajustes se retire, este fichero se borra con ella.
// Se carga DESPUÉS de `integrations.js`, que es de quien depende todo lo de abajo.

// ==================== LIMPIEZA DE CREDENCIALES MUERTAS ====================
//
// Las siete claves que el OAuth de cliente dejaba en el dispositivo. Ya no las lee nadie, pero
// un access token y un refresh token de Strava siguen siendo credenciales: seguir ahí es una
// fuga esperando a un XSS o a una copia del teléfono, no un residuo inofensivo.
//
// Se borran al EVALUAR el script (una vez por arranque) y no con un marcador de "ya hecho":
// siete `removeItem` cuestan microsegundos y así la limpieza se cura sola si algo vuelve a
// escribirlas alguna vez. Sólo se BORRA: este fichero no lee ni escribe una credencial.
const STRAVA_DEAD_LS_KEYS = [
  'strava_access_token', 'strava_refresh_token', 'strava_token_expiry',
  'strava_athlete_id', 'strava_athlete_name', 'strava_last_sync', 'strava_needs_reconnect',
];

function stravaPurgeDeviceCredentials() {
  let borradas = 0;
  for (const k of STRAVA_DEAD_LS_KEYS) {
    try { localStorage.removeItem(k); borradas++; }
    catch (e) { /* modo privado o sin almacenamiento: no hay nada que borrar */ }
  }
  return borradas;
}

stravaPurgeDeviceCredentials();

// ==================== ESTADO ====================
// Las dos son SÍNCRONAS porque `renderStravaUI()` las llama desde un render. Leen la caché de
// 60 s de `integrations.js` (`integration_status`), que `integrationsHandleReturn()` ceba en
// `init()` y `visibilitychange` refresca al volver a primer plano.
function stravaIsConnected() {
  return typeof integrationsIsActive === 'function' && integrationsIsActive('strava');
}

function stravaNeedsReconnect() {
  const row = (typeof integrationsStatusOf === 'function') ? integrationsStatusOf('strava') : null;
  return !!(row && row.status === 'needs_reconnect');
}

// ==================== CONECTAR / DESCONECTAR ====================
// El authorize lo construye el servidor (`integrations-oauth`) y la vuelta la atiende
// `integrations-callback`, igual que WHOOP y Withings: en iPhone esa vuelta cae en Safari, donde
// no hay sesión de Supabase, así que el canje NO puede vivir en una página de la app.
function stravaConnect() {
  if (typeof integrationsConnect !== 'function') {
    if (typeof toast === 'function') toast('Integrations not loaded');
    return Promise.resolve({ ok: false, status: 'error' });
  }
  return integrationsConnect('strava');
}

function stravaDisconnect() {
  if (typeof integrationsDisconnect !== 'function') return Promise.resolve({ ok: false, status: 'error' });
  return integrationsDisconnect('strava');
}

// ==================== SYNC ====================
// C-28: la razón del último fallo, para que el toast diga algo. `stravaSync()` sigue devolviendo
// `null` cuando falla (su llamador comprueba truthiness) y el detalle se queda aquí.
let _stravaLastError = null;
function stravaLastError() {
  if (_stravaLastError) return _stravaLastError;
  // Sin fallo en esta sesión, la causa que valga es la del servidor: el cron sincroniza sin que
  // nadie abra la app, así que el último error puede ser de esta madrugada.
  const row = (typeof integrationsStatusOf === 'function') ? integrationsStatusOf('strava') : null;
  return (row && row.last_error) ? String(row.last_error) : null;
}

/** Ventana por defecto: 7 días. El cron diario cubre el resto; esto es el "ahora mismo". */
const STRAVA_SYNC_DAYS = 7;

async function stravaSync() {
  _stravaLastError = null;
  if (typeof integrationsSync !== 'function') { _stravaLastError = 'Integrations not loaded'; return null; }
  const r = await integrationsSync('strava', { days: STRAVA_SYNC_DAYS });
  if (!r || !r.ok) {
    _stravaLastError = (r && (r.error || r.status)) ? String(r.error || r.status) : 'sync failed';
    return null;
  }
  return r;
}

// ==================== EXPORTS ====================
window.stravaConnect = stravaConnect;
window.stravaDisconnect = stravaDisconnect;
window.stravaIsConnected = stravaIsConnected;
window.stravaNeedsReconnect = stravaNeedsReconnect;
window.stravaSync = stravaSync;
window.stravaLastError = stravaLastError;
window.stravaPurgeDeviceCredentials = stravaPurgeDeviceCredentials;
