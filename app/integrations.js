// ============================================================
// Integraciones de servidor — WHOOP y Withings (Coach v2.1 · A-3)
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
// ANTES de `whoop.js` (que usa `integrationsIsActive` y `integrationsSync`).

const INTEG_PROVIDERS = [
  { id: 'whoop', label: 'WHOOP', hint: 'Recovery, HRV, resting HR and sleep.' },
  { id: 'withings', label: 'Withings', hint: 'Weight and body composition from the scale.' },
];

// Caché en memoria de 60 s. La lee `integrationsIsActive()`, que es SÍNCRONA a propósito:
// `whoopIsConnected()` (whoop.js) se llama desde renders y no puede ser una promesa.
const INTEG_STATUS_TTL_MS = 60 * 1000;
let _integStatus = { whoop: null, withings: null, offline: true };
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
    _integStatus = { whoop: null, withings: null, offline: true };
    _integStatusAt = Date.now();
    return _integStatus;
  }
  try {
    const user = await _integUser();
    if (!user) {
      _integStatus = { whoop: null, withings: null, offline: true };
      _integStatusAt = Date.now();
      return _integStatus;
    }
    const { data, error } = await supa
      .from('integration_status')
      .select('provider,status,external_user_id,expires_at,last_refresh_at,last_sync_at,last_sync_summary,last_event_at,last_error,updated_at')
      .eq('user_id', user.id);
    if (error) throw error;
    const next = { whoop: null, withings: null, offline: false };
    for (const row of (data || [])) {
      if (row && row.provider && Object.prototype.hasOwnProperty.call(next, row.provider)) {
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
async function integrationsConnect(provider) {
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
  const label = provider === 'withings' ? 'Withings' : 'WHOOP';
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
async function integrationsSync(provider, { days = 2 } = {}) {
  const supa = _integSupa();
  if (!supa) return { ok: false, status: 'offline' };
  const fn = provider === 'withings' ? 'withings-sync' : 'whoop-sync';
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
      try { if (typeof pullStore === 'function') await pullStore('wellness'); } catch (e) { console.warn('[integraciones] pull wellness:', e); }
      if (provider === 'withings') {
        try { if (typeof pullStore === 'function') await pullStore('bodyweight'); } catch (e) { console.warn('[integraciones] pull bodyweight:', e); }
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

async function renderIntegrationsCard() {
  const host = document.getElementById('integrations-card');
  if (!host) return;

  const st = await integrationsGetStatus();
  if (!st || st.offline) {
    host.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Sign in to connect</p>';
    return;
  }

  const rows = INTEG_PROVIDERS.map(({ id, label, hint }) => {
    const row = st[id];
    const status = (row && row.status) || 'disconnected';
    const pill = INTEG_PILL_EN[status] || INTEG_PILL_EN.disconnected;
    const meta = `last sync ${_integWhen(row && row.last_sync_at)} · event ${_integWhen(row && row.last_event_at)}`;
    const err = (row && row.last_error)
      ? `<div class="integ-err">${_integEsc(String(row.last_error).slice(0, 160))}</div>` : '';
    let botones;
    if (status === 'active') {
      botones = `<button class="btn-secondary integ-btn" data-integ-act="sync" data-integ="${id}">Sync now</button>`
        + `<button class="btn-secondary integ-btn" data-integ-act="disconnect" data-integ="${id}">Disconnect</button>`;
    } else if (status === 'needs_reconnect') {
      botones = `<button class="btn-secondary integ-btn" data-integ-act="connect" data-integ="${id}">Reconnect</button>`;
    } else {
      botones = `<button class="btn-secondary integ-btn" data-integ-act="connect" data-integ="${id}">Connect</button>`;
    }
    return `<div class="integ-row">
      <div class="integ-head">
        <span class="integ-name">${_integEsc(label)}</span>
        <span class="integ-pill ${pill.cls}">${pill.txt}</span>
      </div>
      <div class="integ-meta">${_integEsc(meta)}</div>
      ${status === 'disconnected' ? `<div class="integ-meta">${_integEsc(hint)}</div>` : ''}
      ${err}
      <div class="integ-actions">${botones}</div>
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
        } else if (act === 'sync') {
          btn.textContent = 'Syncing…';
          const r = await integrationsSync(provider, { days: 2 });
          if (r && r.ok) {
            const n = Array.isArray(r.dates) ? r.dates.length : null;
            _integToast(n != null ? `Synced: ${n} day${n === 1 ? '' : 's'}` : 'Synced');
            if (provider === 'whoop' && typeof renderWhoopRecoveryCard === 'function') {
              try { await renderWhoopRecoveryCard(); } catch (e) {}
            }
          } else if (r && r.status === 'needs_reconnect') {
            _integToast('WHOOP needs reconnecting');
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
    const label = connected === 'withings' ? 'Withings' : 'WHOOP';
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

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    integrationsGetStatus, integrationsIsActive, integrationsStatusOf,
    integrationsConnect, integrationsDisconnect, integrationsSync,
    renderIntegrationsCard, integrationsHandleReturn,
    INTEG_PROVIDERS, INTEG_PILL_EN, INTEG_CONNECT_ERROR_EN, _integWhen,
  };
}
