// ============================================================
// WHOOP Integration Module — Training App v3.3
// ============================================================

const WHOOP_CLIENT_ID = '2bc89171-9bab-46ec-94d2-0bb8d015f9c3';
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const WHOOP_REDIRECT_URI = 'https://juliangarmendia.github.io/training-system/app/whoop-callback.html';
const WHOOP_TOKEN_PROXY = 'https://ycfodifvpvosukepcxie.supabase.co/functions/v1/whoop-auth';
const WHOOP_SCOPES = 'read:recovery read:sleep read:workout read:body_measurement read:profile';

// ==================== AUTH ====================
function whoopIsConnected() {
  return !!localStorage.getItem('whoop_access_token');
}

function whoopConnect() {
  const params = new URLSearchParams({
    client_id: WHOOP_CLIENT_ID,
    redirect_uri: WHOOP_REDIRECT_URI,
    response_type: 'code',
    scope: WHOOP_SCOPES,
    state: Math.random().toString(36).slice(2),
  });
  window.location.href = `${WHOOP_AUTH_URL}?${params.toString()}`;
}

function whoopDisconnect() {
  localStorage.removeItem('whoop_access_token');
  localStorage.removeItem('whoop_refresh_token');
  localStorage.removeItem('whoop_token_expiry');
  localStorage.removeItem('whoop_last_sync');
}

async function whoopGetToken() {
  const expiry = parseInt(localStorage.getItem('whoop_token_expiry') || '0');
  const token = localStorage.getItem('whoop_access_token');
  const refresh = localStorage.getItem('whoop_refresh_token');

  if (!token) return null;

  // If token is still valid (with 5 min buffer)
  if (Date.now() < expiry - 300000) return token;

  // Try to refresh
  if (!refresh) return null;

  try {
    const res = await fetch(WHOOP_TOKEN_PROXY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'refresh', refresh_token: refresh }),
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      whoopDisconnect();
      return null;
    }

    localStorage.setItem('whoop_access_token', data.access_token);
    localStorage.setItem('whoop_refresh_token', data.refresh_token);
    localStorage.setItem('whoop_token_expiry', String(Date.now() + data.expires_in * 1000));
    return data.access_token;
  } catch {
    return token; // Use existing token, may still work
  }
}

// ==================== API CALLS ====================
async function whoopFetch(endpoint) {
  const token = await whoopGetToken();
  if (!token) return null;

  try {
    const res = await fetch(`${WHOOP_API_BASE}${endpoint}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 401) whoopDisconnect();
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

async function whoopGetProfile() {
  return await whoopFetch('/v1/user/profile/basic');
}

async function whoopGetRecovery(startDate, endDate) {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
  });
  return await whoopFetch(`/v1/recovery?${params}`);
}

async function whoopGetSleep(startDate, endDate) {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
  });
  return await whoopFetch(`/v1/activity/sleep?${params}`);
}

async function whoopGetWorkouts(startDate, endDate) {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
  });
  return await whoopFetch(`/v1/activity/workout?${params}`);
}

async function whoopGetBodyMeasurement() {
  return await whoopFetch('/v1/body_measurement');
}

// ==================== SYNC DATA ====================
async function whoopSyncData() {
  if (!whoopIsConnected()) return null;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const [recovery, sleep, body] = await Promise.all([
    whoopGetRecovery(weekAgo, today),
    whoopGetSleep(weekAgo, today),
    whoopGetBodyMeasurement(),
  ]);

  const result = {
    synced: true,
    syncDate: today,
    recovery: [],
    sleep: [],
    bodyWeight: null,
  };

  // Parse recovery data
  if (recovery && recovery.records) {
    result.recovery = recovery.records.map(r => ({
      date: r.cycle?.days?.[0] || r.created_at?.split('T')[0],
      score: r.score?.recovery_score,
      hrv: r.score?.hrv_rmssd_milli,
      restingHR: r.score?.resting_heart_rate,
    })).filter(r => r.score != null);
  }

  // Parse sleep data
  if (sleep && sleep.records) {
    result.sleep = sleep.records.map(s => ({
      date: s.start?.split('T')[0],
      score: s.score?.stage_summary ? Math.round(
        (s.score.stage_summary.total_in_bed_time_milli > 0
          ? (s.score.stage_summary.total_slow_wave_sleep_time_milli + s.score.stage_summary.total_rem_sleep_time_milli)
            / s.score.stage_summary.total_in_bed_time_milli * 100
          : 0)
      ) : null,
      durationHrs: s.score?.stage_summary?.total_in_bed_time_milli
        ? Math.round(s.score.stage_summary.total_in_bed_time_milli / 3600000 * 10) / 10
        : null,
    })).filter(s => s.durationHrs != null);
  }

  // Body measurement (weight)
  if (body && body.height_meter) {
    // Whoop returns weight in kilograms
    result.bodyWeight = body.weight_kilogram || null;
  }

  localStorage.setItem('whoop_last_sync', today);
  return result;
}

// ==================== UI ====================
function renderWhoopUI() {
  const container = document.getElementById('whoop-section');
  if (!container) return;

  if (whoopIsConnected()) {
    const lastSync = localStorage.getItem('whoop_last_sync') || 'Never';
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--accent)">WHOOP Connected</label>
        <button id="btn-whoop-disconnect" class="btn-secondary" style="width:auto;padding:8px 16px">Disconnect</button>
      </div>
      <div class="muted" style="font-size:11px;margin-top:6px">Last sync: ${lastSync}</div>
      <button id="btn-whoop-sync" class="btn-secondary" style="margin-top:8px;width:100%;text-align:center">Sync Now</button>
    `;
    document.getElementById('btn-whoop-disconnect').addEventListener('click', () => {
      whoopDisconnect();
      renderWhoopUI();
      if (typeof toast === 'function') toast('WHOOP disconnected');
    });
    document.getElementById('btn-whoop-sync').addEventListener('click', async () => {
      const data = await whoopSyncData();
      if (data) {
        if (typeof toast === 'function') toast(`Synced: ${data.recovery.length} recovery, ${data.sleep.length} sleep`);
        renderWhoopUI();
      } else {
        if (typeof toast === 'function') toast('Sync failed');
      }
    });
  } else {
    container.innerHTML = `
      <button id="btn-whoop-connect" class="btn-secondary" style="width:100%;text-align:center;border-color:var(--teal);color:var(--teal)">
        Connect WHOOP
      </button>
      <p class="muted" style="font-size:11px;margin-top:6px">Pull recovery, HRV, sleep, and strain data from your WHOOP band.</p>
    `;
    document.getElementById('btn-whoop-connect').addEventListener('click', whoopConnect);
  }
}

// ==================== WHOOP RECOVERY CARD ====================
async function renderWhoopRecoveryCard() {
  const container = document.getElementById('whoop-recovery');
  if (!container || !whoopIsConnected()) {
    if (container) container.classList.add('hidden');
    return;
  }

  const data = await whoopSyncData();
  if (!data || data.recovery.length === 0) {
    container.classList.add('hidden');
    return;
  }

  container.classList.remove('hidden');

  // Latest recovery
  const latest = data.recovery[data.recovery.length - 1];
  const score = latest.score;
  let color, label;
  if (score >= 67) { color = 'var(--accent)'; label = 'Green'; }
  else if (score >= 34) { color = 'var(--yellow)'; label = 'Yellow'; }
  else { color = 'var(--red)'; label = 'Red'; }

  // Sleep data
  const latestSleep = data.sleep.length > 0 ? data.sleep[data.sleep.length - 1] : null;

  container.innerHTML = `
    <div class="whoop-header">
      <span class="whoop-logo">WHOOP</span>
      <span class="whoop-score" style="color:${color}">${score}%</span>
    </div>
    <div class="whoop-label" style="color:${color}">${label} Recovery</div>
    <div class="whoop-metrics">
      <div class="whoop-metric">
        <span class="wm-val">${latest.hrv ? Math.round(latest.hrv) : '--'}</span>
        <span class="wm-label">HRV (ms)</span>
      </div>
      <div class="whoop-metric">
        <span class="wm-val">${latest.restingHR || '--'}</span>
        <span class="wm-label">Resting HR</span>
      </div>
      <div class="whoop-metric">
        <span class="wm-val">${latestSleep ? latestSleep.durationHrs + 'h' : '--'}</span>
        <span class="wm-label">Sleep</span>
      </div>
    </div>
  `;
}

// Expose globally
window.whoopIsConnected = whoopIsConnected;
window.whoopSyncData = whoopSyncData;
window.renderWhoopUI = renderWhoopUI;
window.renderWhoopRecoveryCard = renderWhoopRecoveryCard;
