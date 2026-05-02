// ====================================================================
// Strava integration — pulls runs from Strava (which auto-syncs from
// COROS PACE 4) into Supabase via the strava-sync Edge Function.
// Mirrors the WHOOP integration pattern. Storage in localStorage.
// ====================================================================

const STRAVA_PROXY = 'https://ycfodifvpvosukepcxie.supabase.co/functions/v1/strava-sync';
// IMPORTANT: replace STRAVA_CLIENT_ID with the public client_id of the Strava
// app you registered at https://www.strava.com/settings/api. Authorization
// Callback Domain must be `juliangarmendia.github.io`.
const STRAVA_CLIENT_ID = '234456';
const STRAVA_REDIRECT_URI = 'https://juliangarmendia.github.io/training-system/app/strava-callback.html';
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize';
// Scopes: read activities only — no write/upload (we only pull runs).
const STRAVA_SCOPE = 'read,activity:read';

// ==================== STATE ====================
function stravaIsConnected() {
  return !!localStorage.getItem('strava_access_token') && !stravaNeedsReconnect();
}
function stravaNeedsReconnect() {
  return localStorage.getItem('strava_needs_reconnect') === '1';
}
function stravaDisconnect() {
  localStorage.removeItem('strava_access_token');
  localStorage.removeItem('strava_refresh_token');
  localStorage.removeItem('strava_token_expiry');
  localStorage.removeItem('strava_athlete_id');
  localStorage.removeItem('strava_athlete_name');
  localStorage.removeItem('strava_last_sync');
  localStorage.removeItem('strava_needs_reconnect');
}
function stravaMarkReconnect(reason) {
  console.warn('[Strava] reconnect needed:', reason);
  localStorage.setItem('strava_needs_reconnect', '1');
  localStorage.removeItem('strava_access_token');
  localStorage.removeItem('strava_token_expiry');
}

// ==================== OAUTH ====================
function stravaConnect() {
  if (STRAVA_CLIENT_ID === 'TODO_PASTE_CLIENT_ID_HERE') {
    if (typeof toast === 'function') toast('Strava client_id no configurado — editar app/strava.js');
    return;
  }
  const params = new URLSearchParams({
    client_id: STRAVA_CLIENT_ID,
    redirect_uri: STRAVA_REDIRECT_URI,
    response_type: 'code',
    approval_prompt: 'auto',
    scope: STRAVA_SCOPE,
  });
  window.location.href = `${STRAVA_AUTH_URL}?${params}`;
}

async function stravaRefreshToken() {
  const refresh = localStorage.getItem('strava_refresh_token');
  if (!refresh) {
    stravaMarkReconnect('no refresh token');
    return null;
  }
  try {
    const res = await fetch(STRAVA_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: 'refresh', refresh_token: refresh }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      // Only mark reconnect on 401 (refresh token rejected). 400/403 transient.
      if (res.status === 401) {
        stravaMarkReconnect(`refresh failed: ${data.error || res.status}`);
      } else {
        console.warn('[Strava] transient refresh failure:', res.status, data.error);
      }
      return null;
    }
    localStorage.setItem('strava_access_token', data.access_token);
    localStorage.setItem('strava_refresh_token', data.refresh_token);
    localStorage.setItem('strava_token_expiry', String(data.expires_at * 1000));
    localStorage.removeItem('strava_needs_reconnect');
    return data.access_token;
  } catch (e) {
    console.warn('[Strava] network error during refresh:', e);
    return null;
  }
}

async function stravaGetToken() {
  if (stravaNeedsReconnect()) return null;
  const expiry = parseInt(localStorage.getItem('strava_token_expiry') || '0');
  const token = localStorage.getItem('strava_access_token');
  // 5-min buffer — refresh if within 5 min of expiry.
  if (token && Date.now() < expiry - 300000) return token;
  return await stravaRefreshToken();
}

// ==================== SYNC ====================
async function stravaSync() {
  if (!stravaIsConnected()) return null;
  // Need user_id from Supabase session (the runs table is per-user).
  if (typeof getUser !== 'function') return null;
  const user = await getUser();
  if (!user) return null;

  const token = await stravaGetToken();
  if (!token) return null;

  // Sync window: 30 days back by default; or since the last successful sync
  // minus 1 day for safety overlap.
  const lastSync = parseInt(localStorage.getItem('strava_last_sync') || '0');
  const sinceMs = lastSync ? lastSync - 86400000 : Date.now() - 30 * 86400000;
  const sinceEpoch = Math.floor(sinceMs / 1000);

  try {
    const res = await fetch(STRAVA_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        action: 'sync',
        access_token: token,
        since_epoch: sinceEpoch,
        user_id: user.id,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.warn('[Strava] sync failed:', res.status, data.error);
      return null;
    }
    localStorage.setItem('strava_last_sync', String(Date.now()));
    console.log(`[Strava] synced ${data.synced || 0} runs (of ${data.total_runs || 0} activities in window)`);
    return data;
  } catch (e) {
    console.warn('[Strava] sync network error:', e);
    return null;
  }
}

// ==================== EXPORTS ====================
window.stravaConnect = stravaConnect;
window.stravaDisconnect = stravaDisconnect;
window.stravaIsConnected = stravaIsConnected;
window.stravaNeedsReconnect = stravaNeedsReconnect;
window.stravaSync = stravaSync;
