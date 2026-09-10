// ============================================================
// Integraciones de servidor — WHOOP, Withings, Strava e intervals.icu (A-3 + A-7)
// ============================================================
//
// QUÉ CAMBIA Y POR QUÉ. Hasta v11.63 la PWA hacía el OAuth de WHOOP ella misma: abría el
// authorize, canjeaba el código contra un proxy sin estado y guardaba los dos tokens en el
// almacenamiento del navegador. Tres cosas lo hacían frágil de una forma que sólo se ve
// semanas después:
//
//   · WHOOP **rota** el token de refresco en cada uso. Dos almacenamientos distintos (la PWA
//     instalada y Safari en iOS lo son) refrescaban con el mismo valor viejo y el segundo
//     recibía `invalid_grant` → desconexión.
//   · El authorize no pedía `offline`, así que el permiso persistente podía no llegar nunca.
//   · iOS desaloja el almacenamiento local de una PWA que no se abre en unos días.
//
// Ahora los tokens viven en `integration_tokens` (sólo service role) y el refresco se serializa
// en el servidor con un lease-lock. **Este fichero no ve ni guarda un token jamás.** Sólo:
//   1. lee `integration_status` (tabla espejo, RLS de sólo lectura del propio usuario),
//   2. le pide al servidor la URL del authorize y navega a ella,
//   3. le pide "sincroniza ahora",
//   4. baja las filas que el servidor haya escrito (`pullStore`).
//
// Se carga DESPUÉS de `supabase-sync.js` (necesita `getSupaClient`/`getSupaUser`/`pullStore`) y
// ANTES de `whoop.js` y `strava.js` (que usan `integrationsIsActive` y `integrationsSync`).
//
// A-7 (2026-09-10) añade los otros dos proveedores. Strava entra igual que WHOOP (OAuth entero
// en el servidor). intervals.icu NO tiene OAuth: su credencial es una API key personal, así que
// tiene su propio camino —`intervals-sync {action:'set_key'}`— y `integrationsConnect` la
// rechaza a propósito con `code:'apikey_provider'` en vez de abrir un authorize que no existe.

const INTEG_PROVIDERS = [
  { id: 'whoop', label: 'WHOOP', hint: 'Recovery, HRV, resting HR and sleep.' },
  { id: 'withings', label: 'Withings', hint: 'Weight and body composition from the scale.' },
  { id: 'strava', label: 'Strava', hint: 'Runs and cardio from COROS' },
  // El único proveedor con clave en vez de OAuth: la tarjeta le pinta un formulario.
  { id: 'intervals', label: 'intervals.icu', hint: 'Training load, steps and history', apiKey: true },
];

/** Nombres válidos de proveedor, derivados de la lista (no una segunda lista a mano). */
const INTEG_PROVIDER_IDS = INTEG_PROVIDERS.map((p) => p.id);
const INTEG_LABELS = INTEG_PROVIDERS.reduce((acc, p) => { acc[p.id] = p.label; return acc; }, {});

/** El estado vacío. Se construye desde `INTEG_PROVIDERS` para que añadir uno no requiera tocar
 *  tres literales: hasta A-7 el hueco se declaraba a mano y el filtro de filas era un
 *  `hasOwnProperty` sobre ese objeto, así que una fila de `strava` o `intervals` se DESCARTABA
 *  en silencio y la tarjeta pintaba "Not connected" sobre una integración activa. */
function _integEmptyStatus(offline) {
  const base = { offline: !!offline };
  for (const id of INTEG_PROVIDER_IDS) base[id] = null;
  return base;
}

// Caché en memoria de 60 s. La lee `integrationsIsActive()`, que es SÍNCRONA a propósito:
// `whoopIsConnected()` (whoop.js) y `stravaIsConnected()` (strava.js) se llaman desde renders y
// no pueden ser una promesa.
const INTEG_STATUS_TTL_MS = 60 * 1000;
let _integStatus = _integEmptyStatus(true);
let _integStatusAt = 0;

function _integSupa() {
  try { return (typeof getSupaClient === 'function') ? getSupaClient() : null; } catch (e) { return null; }
}

async function _integUser() {
  try { return (typeof getSupaUser === 'function') ? await getSupaUser() : null; } catch (e) { return null; }
}

function _integToast(msg) {
  if (typeof toast === 'function') toast(msg);
  else console.info('[integraciones]', msg);
}

function _integEsc(s) {
  if (typeof escapeHtml === 'function') return escapeHtml(String(s == null ? '' : s));
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ==================== ESTADO ====================
// Nunca devuelve una excepción hacia arriba: sin sesión o sin red, `offline: true` y lo último
// que se supo. Un fallo de red NO puede pintar "No conectado" sobre una integración que sí lo
// está — eso invitaría a reconectar y a quemar una rotación sin motivo.
async function integrationsGetStatus({ force = false } = {}) {
  if (!force && _integStatusAt && (Date.now() - _integStatusAt) < INTEG_STATUS_TTL_MS) {
    return _integStatus;
  }
  const supa = _integSupa();
  if (!supa) {
    _integStatus = _integEmptyStatus(true);
    _integStatusAt = Date.now();
    return _integStatus;
  }
  try {
    const user = await _integUser();
    if (!user) {
      _integStatus = _integEmptyStatus(true);
      _integStatusAt = Date.now();
      return _integStatus;
    }
    const { data, error } = await supa
      .from('integration_status')
      .select('provider,status,external_user_id,expires_at,last_refresh_at,last_sync_at,last_sync_summary,last_event_at,last_error,updated_at')
      .eq('user_id', user.id);
    if (error) throw error;
    const next = _integEmptyStatus(false);
    for (const row of (data || [])) {
      if (row && row.provider && INTEG_PROVIDER_IDS.indexOf(row.provider) >= 0) {
        next[row.provider] = row;
      }
    }
    _integStatus = next;
    _integStatusAt = Date.now();
    return next;
  } catch (e) {
    console.warn('[integraciones] no se pudo leer integration_status:', e);
    _integStatusAt = Date.now();   // no martillear la tabla en cada render
    return _integStatus;
  }
}

/** Síncrona: lee la caché. `false` mientras no se haya leído el estado nunca. */
function integrationsIsActive(provider) {
  const row = _integStatus && _integStatus[provider];
  return !!(row && row.status === 'active');
}

/** Síncrona: la fila cacheada de `integration_status`, o null. */
function integrationsStatusOf(provider) {
  return (_integStatus && _integStatus[provider]) || null;
}

// ==================== CONECTAR / DESCONECTAR ====================
/** ¿Este proveedor se conecta con una API key en vez de con OAuth? */
function integrationsIsApiKeyProvider(provider) {
  const p = INTEG_PROVIDERS.find((x) => x.id === provider);
  return !!(p && p.apiKey);
}

async function integrationsConnect(provider) {
  // intervals.icu no ofrece OAuth para esto: la credencial es una API key personal que se pega
  // en un formulario y sube por `intervals-sync {action:'set_key'}`. Se corta AQUÍ y no en el
  // servidor (que también responde `apikey_provider`) para no gastar un viaje de red en algo
  // que se sabe de antemano, y para que la tarjeta pueda abrir el formulario sin esperar.
  if (integrationsIsApiKeyProvider(provider)) {
    return { ok: false, status: 'apikey_provider', code: 'apikey_provider' };
  }
  const supa = _integSupa();
  if (!supa) { _integToast('Sign in to connect'); return { ok: false, status: 'offline' }; }
  try {
    const user = await _integUser();
    if (!user) { _integToast('Sign in to connect'); return { ok: false, status: 'offline' }; }
    const { data, error } = await supa.functions.invoke('integrations-oauth', {
      body: { action: 'authorize', provider },
    });
    if (error) throw new Error(error.message || 'The server could not start the connection');
    if (data && data.error) throw new Error(data.error);
    if (!data || !data.url) throw new Error('The server did not return an authorization URL');
    // El proveedor redirige a la edge function `integrations-callback`, no a esta página: en
    // iOS la vuelta cae en Safari y allí no hay sesión de Supabase. El servidor canjea, guarda
    // y redirige a `#settings?connected=<provider>`; la PWA relee el estado al volver a primer
    // plano (ver el listener de `visibilitychange` al final de este fichero).
    window.location.href = data.url;
    return { ok: true, status: 'redirecting' };
  } catch (e) {
    console.warn('[integraciones] connect:', e);
    _integToast('Could not open the connection: ' + ((e && e.message) || e));
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

async function integrationsDisconnect(provider) {
  const label = INTEG_LABELS[provider] || provider;
  try {
    if (typeof confirm === 'function' && !confirm(`Disconnect ${label}? New data will stop coming in.`)) {
      return { ok: false, status: 'cancelled' };
    }
  } catch (e) { /* sin confirm (tests): se sigue */ }
  const supa = _integSupa();
  if (!supa) { _integToast('Sign in to connect'); return { ok: false, status: 'offline' }; }
  try {
    const { data, error } = await supa.functions.invoke('integrations-oauth', {
      body: { action: 'disconnect', provider },
    });
    if (error) throw new Error(error.message || 'Could not disconnect');
    if (data && data.error) throw new Error(data.error);
    await integrationsGetStatus({ force: true });
    try { await renderIntegrationsCard(); } catch (e) { /* la tarjeta no bloquea */ }
    _integToast(`${label} disconnected`);
    return data || { ok: true, status: 'disconnected' };
  } catch (e) {
    console.warn('[integraciones] disconnect:', e);
    _integToast('Could not disconnect: ' + ((e && e.message) || e));
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

// ==================== SINCRONIZAR AHORA ====================
// Pide al servidor que traiga los últimos `days` días y BAJA lo que haya escrito. Sin el
// `pullStore` de después, el servidor tendría el dato y la app seguiría pintando el de ayer
// hasta el siguiente `syncAll`.
// La función de servidor de cada proveedor. Era un ternario `withings ? … : whoop-sync`, así que
// con cuatro proveedores `strava` e `intervals` habrían acabado los dos en `whoop-sync`: un 200
// que no sincroniza nada y no se queja. Un mapa falla en el sitio correcto (proveedor
// desconocido → no se llama a nadie).
const INTEG_SYNC_FN = {
  whoop: 'whoop-sync', withings: 'withings-sync', strava: 'strava-sync', intervals: 'intervals-sync',
};

// Los stores que ESCRIBE cada proveedor en el servidor, y que por tanto hay que BAJAR después.
// Sin esto el servidor tiene el dato y la app sigue pintando el de ayer hasta el siguiente
// `syncAll`. Cada lista es exactamente lo que su volcado toca:
//   · whoop     → `wellness` (recuperación, HRV, RHR, sueño)
//   · withings  → `wellness` + `bodyweight` (la pesada de la báscula)
//   · strava    → `runs` + `sessions` (`_shared/activity-import.ts`)
//   · intervals → los cinco (`_shared/intervals-sync.ts`: wellness, peso, pasos y actividades)
const INTEG_SYNC_STORES = {
  whoop: ['wellness'],
  withings: ['wellness', 'bodyweight'],
  strava: ['runs', 'sessions'],
  intervals: ['wellness', 'bodyweight', 'steps', 'runs', 'sessions'],
};

async function integrationsSync(provider, { days = 2 } = {}) {
  const supa = _integSupa();
  if (!supa) return { ok: false, status: 'offline' };
  const fn = INTEG_SYNC_FN[provider];
  if (!fn) return { ok: false, status: 'error', error: `unknown provider: ${provider}` };
  try {
    const user = await _integUser();
    if (!user) return { ok: false, status: 'offline' };
    const { data, error } = await supa.functions.invoke(fn, { body: { days, mode: 'sync' } });

    // `needs_reconnect` llega con 200 y `ok:false` a propósito: no es una caída del servidor,
    // es un estado que la tarjeta tiene que pintar como "Reconectar".
    if (data && data.status === 'needs_reconnect') {
      await integrationsGetStatus({ force: true });
      try { await renderIntegrationsCard(); } catch (e) {}
      return { ok: false, status: 'needs_reconnect' };
    }
    // Un 503 (`refresh_in_progress`) llega como `error`: otro cliente está refrescando el token
    // ahora mismo. No es un fallo; se reintenta en la siguiente pasada.
    if (error) {
      console.warn(`[integraciones] ${fn}:`, error);
      return { ok: false, status: 'error', error: error.message || String(error) };
    }
    if (data && data.error) return { ok: false, status: 'error', error: String(data.error) };

    if (data && data.ok) {
      for (const store of (INTEG_SYNC_STORES[provider] || [])) {
        try { if (typeof pullStore === 'function') await pullStore(store); }
        catch (e) { console.warn(`[integraciones] pull ${store}:`, e); }
      }
      if (typeof invalidateReadiness === 'function') invalidateReadiness();
      // whoop.js consume aquí su ventana de 10 min: el render que venga detrás leerá las filas
      // nuevas sin disparar una segunda sincronización idéntica.
      if (provider === 'whoop' && typeof whoopNoteServerSync === 'function') whoopNoteServerSync();
      await integrationsGetStatus({ force: true });
    }
    return data || { ok: false, status: 'error' };
  } catch (e) {
    console.warn(`[integraciones] ${fn}:`, e);
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

// ==================== LA API KEY DE INTERVALS.ICU (A-7) ====================
//
// EL CONTRATO, y es lo único que hay que respetar aquí: la clave SUBE una vez, por TLS, con el
// JWT del usuario, y **no baja nunca**. Lo único que vuelve es un indicio enmascarado
// (`••••1234`) para que Ajustes pueda decir "hay una clave guardada, y es ésta y no otra".
//
// Por eso estas dos funciones no registran, no muestran y no devuelven la clave: la reciben, la
// pasan al `body` y se olvidan. Ni un `console.log` con el argumento dentro, ni un toast con el
// valor, ni un mensaje de error que repita lo que se ha teclado. Lo mismo vale para el `catch`:
// el mensaje que sale es el del servidor, que está escrito para no repetirla.
//
// La clave sigue viviendo TAMBIÉN en `localStorage` (accesor `intervalsApiKey()` en app.js, C-8)
// porque el import de cliente de intervals.icu es lo que alimenta hoy `wellness`, `steps`,
// `bodyweight` y la mayoría de `runs`. Ese es el punto de retirada, comentado en app.js.

/** Sube la clave y devuelve `{ok, athleteId, keyHint, code, error}`. NUNCA devuelve la clave. */
async function integrationsSetIntervalsKey(apiKey, athleteId) {
  const supa = _integSupa();
  if (!supa) return { ok: false, status: 'offline' };
  try {
    const user = await _integUser();
    if (!user) return { ok: false, status: 'offline' };
    const body = { action: 'set_key', apiKey: String(apiKey || '') };
    if (athleteId) body.athleteId = String(athleteId);
    const { data, error } = await supa.functions.invoke('intervals-sync', { body });
    if (error) {
      // Un 400 de forma/clave inválida llega como `error` con el cuerpo dentro del contexto.
      let detalle = error.message || 'The server rejected the key';
      let code = null;
      try {
        const j = (error.context && typeof error.context.json === 'function') ? await error.context.json() : null;
        if (j && j.error) detalle = String(j.error);
        if (j && j.code) code = String(j.code);
      } catch (e) { /* cuerpo no JSON: se queda el mensaje genérico */ }
      return { ok: false, status: 'error', code, error: detalle };
    }
    if (data && data.ok === false) {
      return { ok: false, status: 'error', code: data.code || null, error: String(data.error || 'The server rejected the key') };
    }
    await integrationsGetStatus({ force: true });
    return { ok: true, athleteId: (data && data.athleteId) || null, keyHint: (data && data.keyHint) || '' };
  } catch (e) {
    console.warn('[integraciones] set_key falló');   // sin el argumento: podría llevar la clave
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

/**
 * El punto de entrada de los DOS formularios (esta tarjeta y la tarjeta Sync de app.js).
 *
 * Prefiere `saveIntervalsCredentials()` (app.js) porque el guardado tiene dos mitades y la otra
 * es de app.js: la copia local en `localStorage` que sigue alimentando el import de cliente, más
 * el id de atleta en `state.settings`. Sin app.js cargado (los tests cargan este fichero solo)
 * se hace sólo la mitad del servidor. Una función, dos formularios: dos caminos de guardado
 * distintos acabarían con una clave en el servidor y otra en el dispositivo.
 */
async function integrationsSaveIntervalsKey(apiKey, athleteId) {
  if (typeof saveIntervalsCredentials === 'function') return await saveIntervalsCredentials(apiKey, athleteId);
  return await integrationsSetIntervalsKey(apiKey, athleteId);
}

/** `{status, athleteId, keyHint, lastError}` de la credencial guardada en el servidor. */
async function integrationsIntervalsStatus() {
  const supa = _integSupa();
  if (!supa) return { ok: false, status: 'offline' };
  try {
    const user = await _integUser();
    if (!user) return { ok: false, status: 'offline' };
    const { data, error } = await supa.functions.invoke('intervals-sync', { body: { action: 'status' } });
    if (error) return { ok: false, status: 'error', error: error.message || String(error) };
    return data || { ok: false, status: 'error' };
  } catch (e) {
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

/**
 * Empuja al calendario de intervals.icu (y de ahí al COROS) eventos YA CONSTRUIDOS por el
 * cliente. Es un proxy a propósito: la semana se arma en app.js con el plan activo, el cardio
 * del coach y la regla de fase, y el DSL va verbatim. Reconstruirla en el servidor sería una
 * segunda implementación de la semana de carrera — el fallo de L-1.
 *
 * Devuelve `{ok, pushed, dropped}` o `{ok:false, …}`. `null` de `_integSupa()` significa "no hay
 * a quién llamar", y el llamador (`_icuUpsertEvents`) cae al camino directo.
 */
async function integrationsPushIntervalsEvents(events) {
  const supa = _integSupa();
  if (!supa) return { ok: false, status: 'offline' };
  try {
    const { data, error } = await supa.functions.invoke('intervals-sync', {
      body: { action: 'push_events', events },
    });
    if (error) {
      let detalle = error.message || 'The push failed';
      try {
        const j = (error.context && typeof error.context.json === 'function') ? await error.context.json() : null;
        if (j && j.error) detalle = String(j.error);
      } catch (e) { /* cuerpo no JSON */ }
      return { ok: false, status: 'error', error: detalle };
    }
    if (data && data.ok === false) return { ok: false, status: data.status || 'error', error: String(data.error || 'The push failed') };
    return data || { ok: false, status: 'error' };
  } catch (e) {
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

/** Los campos crudos de FC del atleta (`{lthr, maxHr, hrZones, sportSettings}`) vía servidor. */
async function integrationsIntervalsAthlete() {
  const supa = _integSupa();
  if (!supa) return null;
  try {
    const { data, error } = await supa.functions.invoke('intervals-sync', { body: { action: 'athlete' } });
    if (error || !data || data.ok === false) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ==================== TARJETA DE AJUSTES ====================
const INTEG_PILL_EN = {
  active: { txt: 'Connected', cls: 'ok' },
  needs_reconnect: { txt: 'Reconnect', cls: 'warn' },
  disconnected: { txt: 'Not connected', cls: 'off' },
};

// "07:42" si es de hoy; "6 sep 07:42" si no. Un "07:42" a secas de hace tres días miente.
function _integWhen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'never';
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, new Date())) return hhmm;
  const mes = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${mes} ${d.getDate()} ${hhmm}`;
}

// El indicio de la clave de intervals.icu (`••••1234`) y su id de atleta, tal como los devuelve
// `{action:'status'}`. Se guarda en memoria porque la tarjeta se repinta en cada
// `visibilitychange` y no hace falta un viaje a la función para volver a pintar cuatro asteriscos.
let _integIntervalsInfo = null;

/** ¿Hay credencial de intervals.icu EN EL SERVIDOR? Síncrona: la lee del espejo cacheado. */
function integrationsIntervalsHasServerKey() {
  return integrationsIsActive('intervals');
}

// El formulario de clave abierto ahora mismo (id de proveedor) o null. Es estado de UI, no de
// datos: se pierde al recargar y da igual.
let _integKeyFormFor = null;

/** El formulario de una credencial por API key. El `value` del campo de clave va SIEMPRE vacío:
 *  la clave no baja del servidor, y rellenarlo con la copia local invitaría a leerla de la
 *  pantalla. Quien quiera cambiarla, la vuelve a pegar. */
function _integKeyForm(id, info) {
  const ath = _integEsc((info && info.athleteId) || '');
  return `<div class="integ-keyform">
    <div class="form-row"><label style="font-size:12px">Athlete ID</label>
      <input type="text" class="text-input" id="integ-key-athlete" placeholder="i12345" value="${ath}" autocomplete="off"></div>
    <div class="form-row"><label style="font-size:12px">API key</label>
      <input type="password" class="text-input" id="integ-key-value" placeholder="paste API key" autocomplete="off"></div>
    <div class="integ-actions">
      <button class="btn-secondary integ-btn" data-integ-act="savekey" data-integ="${id}">Save key</button>
      <button class="btn-secondary integ-btn" data-integ-act="cancelkey" data-integ="${id}">Cancel</button>
    </div>
    <div class="integ-meta">Get it at intervals.icu/settings → API. It is stored on the server and never sent back.</div>
  </div>`;
}

async function renderIntegrationsCard() {
  const host = document.getElementById('integrations-card');
  if (!host) return;

  const st = await integrationsGetStatus();
  if (!st || st.offline) {
    host.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Sign in to connect</p>';
    return;
  }

  // `{action:'status'}` en el render, y sólo cuando hay credencial: es la ÚNICA vía para el
  // indicio de la clave (`integration_status` no lo guarda, y hace bien: es dato del token).
  if (integrationsIsActive('intervals') && !_integIntervalsInfo) {
    const info = await integrationsIntervalsStatus();
    if (info && info.ok !== false) _integIntervalsInfo = info;
  } else if (!integrationsIsActive('intervals')) {
    _integIntervalsInfo = null;
  }

  const rows = INTEG_PROVIDERS.map(({ id, label, hint, apiKey }) => {
    const row = st[id];
    const status = (row && row.status) || 'disconnected';
    const pill = INTEG_PILL_EN[status] || INTEG_PILL_EN.disconnected;
    const meta = `last sync ${_integWhen(row && row.last_sync_at)} · event ${_integWhen(row && row.last_event_at)}`;
    const err = (row && row.last_error)
      ? `<div class="integ-err">${_integEsc(String(row.last_error).slice(0, 160))}</div>` : '';
    // Qué credencial hay guardada, sin decir cuál: `atleta i12345 · key ••••1234`.
    const keyLine = (apiKey && status === 'active' && _integIntervalsInfo)
      ? `<div class="integ-meta">${_integEsc(`athlete ${_integIntervalsInfo.athleteId || '—'} · key ${_integIntervalsInfo.keyHint || '••••'}`)}</div>`
      : '';
    let cuerpo;
    if (apiKey && _integKeyFormFor === id) {
      // Un proveedor de API key no tiene authorize al que navegar: en vez del botón "Connect"
      // se pinta el formulario aquí mismo.
      cuerpo = _integKeyForm(id, _integIntervalsInfo);
    } else if (status === 'active') {
      cuerpo = `<div class="integ-actions">`
        + `<button class="btn-secondary integ-btn" data-integ-act="sync" data-integ="${id}">Sync now</button>`
        + (apiKey ? `<button class="btn-secondary integ-btn" data-integ-act="editkey" data-integ="${id}">Replace key</button>` : '')
        + `<button class="btn-secondary integ-btn" data-integ-act="disconnect" data-integ="${id}">Disconnect</button>`
        + `</div>`;
    } else if (apiKey) {
      cuerpo = `<div class="integ-actions">`
        + `<button class="btn-secondary integ-btn" data-integ-act="editkey" data-integ="${id}">Add API key</button>`
        + `</div>`;
    } else {
      cuerpo = `<div class="integ-actions">`
        + `<button class="btn-secondary integ-btn" data-integ-act="connect" data-integ="${id}">`
        + (status === 'needs_reconnect' ? 'Reconnect' : 'Connect') + `</button></div>`;
    }
    return `<div class="integ-row">
      <div class="integ-head">
        <span class="integ-name">${_integEsc(label)}</span>
        <span class="integ-pill ${pill.cls}">${pill.txt}</span>
      </div>
      <div class="integ-meta">${_integEsc(meta)}</div>
      ${status === 'disconnected' ? `<div class="integ-meta">${_integEsc(hint)}</div>` : ''}
      ${keyLine}
      ${err}
      ${cuerpo}
    </div>`;
  }).join('');

  host.innerHTML = rows;

  host.querySelectorAll('[data-integ-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const provider = btn.getAttribute('data-integ');
      const act = btn.getAttribute('data-integ-act');
      const txt = btn.textContent;
      btn.disabled = true;
      try {
        if (act === 'connect') {
          btn.textContent = 'Opening…';
          await integrationsConnect(provider);
        } else if (act === 'disconnect') {
          await integrationsDisconnect(provider);
          if (provider === 'intervals') {
            _integIntervalsInfo = null;
            // La copia local de la clave se va con la del servidor: un "Disconnect" que deja la
            // credencial en el dispositivo y el import de cliente vivo sería mentira.
            if (typeof setIntervalsApiKey === 'function') { try { setIntervalsApiKey(''); } catch (e) {} }
            try { await renderIntegrationsCard(); } catch (e) {}
            return;
          }
        } else if (act === 'editkey') {
          _integKeyFormFor = provider;
          await renderIntegrationsCard();
          return;
        } else if (act === 'cancelkey') {
          _integKeyFormFor = null;
          await renderIntegrationsCard();
          return;
        } else if (act === 'savekey') {
          const athEl = document.getElementById('integ-key-athlete');
          const keyEl = document.getElementById('integ-key-value');
          const ath = (athEl && athEl.value || '').trim();
          const key = (keyEl && keyEl.value || '').trim();
          if (!key) { _integToast('Paste the API key first'); return; }
          btn.textContent = 'Saving…';
          const r = await integrationsSaveIntervalsKey(key, ath);
          if (keyEl) keyEl.value = '';        // fuera del DOM en cuanto ha viajado
          if (r && r.ok) {
            _integKeyFormFor = null;
            // `serverOk === false` es el caso "sin red": app.js guardó la copia del dispositivo
            // para que el import de cliente siga vivo, pero el servidor NO tiene la clave. No se
            // pinta un indicio que haría creer lo contrario.
            const enServidor = (r.serverOk !== false) && !!r.keyHint;
            _integIntervalsInfo = enServidor
              ? { status: 'active', athleteId: r.athleteId, keyHint: r.keyHint, lastError: null }
              : null;
            _integToast(enServidor ? `Key saved (${r.keyHint})` : 'Key saved on this device only — no connection to the server');
          } else {
            _integToast((r && r.error) ? String(r.error) : 'The key could not be saved');
          }
          await renderIntegrationsCard();
          return;
        } else if (act === 'sync') {
          btn.textContent = 'Syncing…';
          const r = await integrationsSync(provider, { days: provider === 'whoop' || provider === 'withings' ? 2 : 7 });
          if (r && r.ok) {
            const n = Array.isArray(r.dates) ? r.dates.length : null;
            _integToast(n != null ? `Synced: ${n} day${n === 1 ? '' : 's'}` : 'Synced');
            if (provider === 'whoop' && typeof renderWhoopRecoveryCard === 'function') {
              try { await renderWhoopRecoveryCard(); } catch (e) {}
            }
          } else if (r && r.status === 'needs_reconnect') {
            _integToast(`${INTEG_LABELS[provider] || provider} needs reconnecting`);
          } else if (r && r.status === 'offline') {
            _integToast('Sign in to connect');
          } else {
            _integToast('Sync failed');
          }
          await renderIntegrationsCard();
          return;   // la tarjeta se ha repintado entera
        }
      } finally {
        if (btn.isConnected) { btn.disabled = false; btn.textContent = txt; }
      }
    });
  });
}

// ==================== VUELTA DEL OAUTH ====================
// El callback del servidor redirige a `index.html#settings?connected=whoop` o
// `#settings?connect_error=<código>`. En iPhone esa vuelta cae en **Safari**, no en la PWA: el
// usuario cierra Safari y vuelve a la app, y el estado se relee en `visibilitychange`. Este
// parseo cubre el caso escritorio (misma pestaña) y el de quien abre el enlace en la PWA.
const INTEG_CONNECT_ERROR_EN = {
  state: 'The connection expired, try again',
  no_refresh_token: 'WHOOP did not grant persistent access (offline)',
  denied: 'You cancelled the authorization at the provider',
  provider: 'Provider not recognized on the authorization return',
  code: 'The provider did not return an authorization code',
  // Strava concede los permisos de UNO EN UNO con casillas: si la de "actividades" se queda sin
  // marcar, el OAuth vuelve con éxito y sin `activity:read`, y el sync responde 401 al día
  // siguiente. El callback lo detecta y manda este código, que es lo único accionable.
  scope: 'Strava did not grant access to your activities',
  exchange: 'The code exchange failed on the server',
  config: 'Missing server configuration (secrets)',
  method: 'The provider came back with an unexpected method',
  server: 'Server error while connecting',
};

function _integCleanHash() {
  try {
    const base = window.location.pathname + window.location.search;
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', base);
    else window.location.hash = '';
  } catch (e) { /* sin history: el hash se queda, no rompe nada */ }
}

async function integrationsHandleReturn() {
  // Primar la caché de estado en segundo plano: `whoopIsConnected()` la lee de forma síncrona
  // y sin esto devolvería `false` hasta la primera sincronización.
  integrationsGetStatus().catch(() => {});

  let hash = '';
  try { hash = String(window.location.hash || ''); } catch (e) { return; }
  const q = hash.indexOf('?');
  if (q < 0) return;
  let params;
  try { params = new URLSearchParams(hash.slice(q + 1)); } catch (e) { return; }
  const connected = params.get('connected');
  const err = params.get('connect_error');
  if (!connected && !err) return;

  _integCleanHash();

  if (connected) {
    const label = INTEG_LABELS[connected] || connected;
    _integToast(`${label} connected`);
  } else {
    _integToast(INTEG_CONNECT_ERROR_EN[err] || `Could not connect (${err})`);
  }
  try { if (typeof switchTab === 'function') switchTab('settings'); } catch (e) {}
  await integrationsGetStatus({ force: true });
  try { await renderIntegrationsCard(); } catch (e) {}
}

// ==================== VOLVER A PRIMER PLANO ====================
// El único momento en que el estado puede haber cambiado sin que la app se entere: el usuario
// acaba de autorizar en Safari (o en el navegador del proveedor) y vuelve a la PWA.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    (async () => {
      try { await integrationsGetStatus({ force: true }); } catch (e) {}
      try { if (document.getElementById('integrations-card')) await renderIntegrationsCard(); } catch (e) {}
      try { if (typeof whoopSyncData === 'function') await whoopSyncData(); } catch (e) {}
      try { if (typeof invalidateReadiness === 'function') invalidateReadiness(); } catch (e) {}
      try {
        if (typeof state !== 'undefined' && state && state.currentTab === 'home') {
          if (typeof renderWhoopRecoveryCard === 'function') await renderWhoopRecoveryCard();
          if (typeof renderRecoveryLine === 'function') await renderRecoveryLine();
        }
      } catch (e) {}
    })();
  });
}

// Expose globally
window.integrationsGetStatus = integrationsGetStatus;
window.integrationsIsActive = integrationsIsActive;
window.integrationsStatusOf = integrationsStatusOf;
window.integrationsConnect = integrationsConnect;
window.integrationsDisconnect = integrationsDisconnect;
window.integrationsSync = integrationsSync;
window.renderIntegrationsCard = renderIntegrationsCard;
window.integrationsHandleReturn = integrationsHandleReturn;
window.integrationsIsApiKeyProvider = integrationsIsApiKeyProvider;
window.integrationsSetIntervalsKey = integrationsSetIntervalsKey;
window.integrationsSaveIntervalsKey = integrationsSaveIntervalsKey;
window.integrationsIntervalsStatus = integrationsIntervalsStatus;
window.integrationsIntervalsHasServerKey = integrationsIntervalsHasServerKey;
window.integrationsPushIntervalsEvents = integrationsPushIntervalsEvents;
window.integrationsIntervalsAthlete = integrationsIntervalsAthlete;

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    integrationsGetStatus, integrationsIsActive, integrationsStatusOf,
    integrationsConnect, integrationsDisconnect, integrationsSync,
    renderIntegrationsCard, integrationsHandleReturn,
    integrationsIsApiKeyProvider, integrationsSetIntervalsKey, integrationsSaveIntervalsKey,
    integrationsIntervalsStatus, integrationsIntervalsHasServerKey,
    integrationsPushIntervalsEvents, integrationsIntervalsAthlete,
    INTEG_PROVIDERS, INTEG_PROVIDER_IDS, INTEG_LABELS, INTEG_SYNC_FN, INTEG_SYNC_STORES,
    INTEG_PILL_EN, INTEG_CONNECT_ERROR_EN, _integWhen, _integEmptyStatus,
  };
}
