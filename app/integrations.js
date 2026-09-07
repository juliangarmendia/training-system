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
  { id: 'whoop', label: 'WHOOP', hint: 'Recuperación, HRV, FC en reposo y sueño.' },
  { id: 'withings', label: 'Withings', hint: 'Peso y composición corporal de la báscula.' },
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
  if (!supa) { _integToast('Inicia sesión para conectar'); return { ok: false, status: 'offline' }; }
  try {
    const user = await _integUser();
    if (!user) { _integToast('Inicia sesión para conectar'); return { ok: false, status: 'offline' }; }
    const { data, error } = await supa.functions.invoke('integrations-oauth', {
      body: { action: 'authorize', provider },
    });
    if (error) throw new Error(error.message || 'El servidor no pudo iniciar la conexión');
    if (data && data.error) throw new Error(data.error);
    if (!data || !data.url) throw new Error('El servidor no devolvió la URL de autorización');
    // El proveedor redirige a la edge function `integrations-callback`, no a esta página: en
    // iOS la vuelta cae en Safari y allí no hay sesión de Supabase. El servidor canjea, guarda
    // y redirige a `#settings?connected=<provider>`; la PWA relee el estado al volver a primer
    // plano (ver el listener de `visibilitychange` al final de este fichero).
    window.location.href = data.url;
    return { ok: true, status: 'redirecting' };
  } catch (e) {
    console.warn('[integraciones] connect:', e);
    _integToast('No se pudo abrir la conexión: ' + ((e && e.message) || e));
    return { ok: false, status: 'error', error: String((e && e.message) || e) };
  }
}

async function integrationsDisconnect(provider) {
  const label = provider === 'withings' ? 'Withings' : 'WHOOP';
  try {
    if (typeof confirm === 'function' && !confirm(`¿Desconectar ${label}? Dejarán de entrar datos nuevos.`)) {
      return { ok: false, status: 'cancelled' };
    }
  } catch (e) { /* sin confirm (tests): se sigue */ }
  const supa = _integSupa();
  if (!supa) { _integToast('Inicia sesión para conectar'); return { ok: false, status: 'offline' }; }
  try {
    const { data, error } = await supa.functions.invoke('integrations-oauth', {
      body: { action: 'disconnect', provider },
    });
    if (error) throw new Error(error.message || 'No se pudo desconectar');
    if (data && data.error) throw new Error(data.error);
    await integrationsGetStatus({ force: true });
    try { await renderIntegrationsCard(); } catch (e) { /* la tarjeta no bloquea */ }
    _integToast(`${label} desconectado`);
    return data || { ok: true, status: 'disconnected' };
  } catch (e) {
    console.warn('[integraciones] disconnect:', e);
    _integToast('No se pudo desconectar: ' + ((e && e.message) || e));
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
const INTEG_PILL_ES = {
  active: { txt: 'Conectado', cls: 'ok' },
  needs_reconnect: { txt: 'Reconectar', cls: 'warn' },
  disconnected: { txt: 'No conectado', cls: 'off' },
};

// "07:42" si es de hoy; "6 sep 07:42" si no. Un "07:42" a secas de hace tres días miente.
function _integWhen(iso) {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'nunca';
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (same(d, new Date())) return hhmm;
  const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][d.getMonth()];
  return `${d.getDate()} ${mes} ${hhmm}`;
}

async function renderIntegrationsCard() {
  const host = document.getElementById('integrations-card');
  if (!host) return;

  const st = await integrationsGetStatus();
  if (!st || st.offline) {
    host.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Inicia sesión para conectar</p>';
    return;
  }

  const rows = INTEG_PROVIDERS.map(({ id, label, hint }) => {
    const row = st[id];
    const status = (row && row.status) || 'disconnected';
    const pill = INTEG_PILL_ES[status] || INTEG_PILL_ES.disconnected;
    const meta = `último sync ${_integWhen(row && row.last_sync_at)} · evento ${_integWhen(row && row.last_event_at)}`;
    const err = (row && row.last_error)
      ? `<div class="integ-err">${_integEsc(String(row.last_error).slice(0, 160))}</div>` : '';
    let botones;
    if (status === 'active') {
      botones = `<button class="btn-secondary integ-btn" data-integ-act="sync" data-integ="${id}">Sincronizar ahora</button>`
        + `<button class="btn-secondary integ-btn" data-integ-act="disconnect" data-integ="${id}">Desconectar</button>`;
    } else if (status === 'needs_reconnect') {
      botones = `<button class="btn-secondary integ-btn" data-integ-act="connect" data-integ="${id}">Reconectar</button>`;
    } else {
      botones = `<button class="btn-secondary integ-btn" data-integ-act="connect" data-integ="${id}">Conectar</button>`;
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
          btn.textContent = 'Abriendo…';
          await integrationsConnect(provider);
        } else if (act === 'disconnect') {
          await integrationsDisconnect(provider);
        } else if (act === 'sync') {
          btn.textContent = 'Sincronizando…';
          const r = await integrationsSync(provider, { days: 2 });
          if (r && r.ok) {
            const n = Array.isArray(r.dates) ? r.dates.length : null;
            _integToast(n != null ? `Sincronizado: ${n} día${n === 1 ? '' : 's'}` : 'Sincronizado');
            if (provider === 'whoop' && typeof renderWhoopRecoveryCard === 'function') {
              try { await renderWhoopRecoveryCard(); } catch (e) {}
            }
          } else if (r && r.status === 'needs_reconnect') {
            _integToast('WHOOP necesita reconectarse');
          } else if (r && r.status === 'offline') {
            _integToast('Inicia sesión para conectar');
          } else {
            _integToast('La sincronización falló');
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
const INTEG_CONNECT_ERROR_ES = {
  state: 'La conexión caducó, vuelve a intentarlo',
  no_refresh_token: 'WHOOP no concedió acceso persistente (offline)',
  denied: 'Cancelaste la autorización en el proveedor',
  provider: 'Proveedor no reconocido en la vuelta de la autorización',
  code: 'El proveedor no devolvió el código de autorización',
  exchange: 'El canje del código falló en el servidor',
  config: 'Falta configuración en el servidor (secretos)',
  method: 'El proveedor volvió con un método inesperado',
  server: 'Error del servidor al conectar',
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
    _integToast(`${label} conectado`);
  } else {
    _integToast(INTEG_CONNECT_ERROR_ES[err] || `No se pudo conectar (${err})`);
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
    INTEG_PROVIDERS, INTEG_PILL_ES, INTEG_CONNECT_ERROR_ES, _integWhen,
  };
}
