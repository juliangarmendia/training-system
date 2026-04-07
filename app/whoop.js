// ============================================================
// WHOOP Integration Module — Training App v3.4
// ============================================================

const WHOOP_CLIENT_ID = '2bc89171-9bab-46ec-94d2-0bb8d015f9c3';
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const WHOOP_REDIRECT_URI = 'https://juliangarmendia.github.io/training-system/whoop-callback.html';
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
  localStorage.removeItem('whoop_cache');
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
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
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
    return token;
  }
}

// ==================== API CALLS (via proxy) ====================
async function whoopFetch(endpoint) {
  const token = await whoopGetToken();
  if (!token) return null;

  try {
    console.log(`[WHOOP] Proxy call: ${endpoint}`);
    const res = await fetch(WHOOP_TOKEN_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: 'api', endpoint, access_token: token }),
    });

    const data = await res.json();
    console.log(`[WHOOP] ${endpoint} →`, res.status, data);

    if (!res.ok) {
      if (res.status === 401) whoopDisconnect();
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[WHOOP] Proxy error:', e);
    return null;
  }
}

async function whoopGetCycles(startDate, endDate) {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
    limit: '25',
  });
  return await whoopFetch(`/v2/cycle?${params}`);
}

async function whoopGetRecoveryCollection(startDate, endDate) {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
    limit: '25',
  });
  return await whoopFetch(`/v2/recovery?${params}`);
}

async function whoopGetRecoveryForCycle(cycleId) {
  return await whoopFetch(`/v2/cycle/${cycleId}/recovery`);
}

async function whoopGetSleep(startDate, endDate) {
  const params = new URLSearchParams({
    start: `${startDate}T00:00:00.000Z`,
    end: `${endDate}T23:59:59.999Z`,
    limit: '25',
  });
  return await whoopFetch(`/v2/activity/sleep?${params}`);
}

async function whoopGetBodyMeasurement() {
  return await whoopFetch(`/v2/user/body_measurement`);
}

async function whoopGetProfile() {
  return await whoopFetch(`/v2/user/profile/basic`);
}

// ==================== SYNC DATA ====================
async function whoopSyncData() {
  if (!whoopIsConnected()) return null;

  // Cache: don't re-fetch if synced in the last 30 minutes
  const cache = localStorage.getItem('whoop_cache');
  if (cache) {
    try {
      const cached = JSON.parse(cache);
      if (cached.timestamp && Date.now() - cached.timestamp < 30 * 60 * 1000) {
        return cached.data;
      }
    } catch { /* ignore */ }
  }

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

  const result = {
    synced: true,
    syncDate: today,
    recovery: [],
    sleep: [],
    bodyWeight: null,
  };

  // Fetch cycles, recovery collection, sleep, body in parallel
  const [cycles, recoveryCollection, sleep, body] = await Promise.all([
    whoopGetCycles(weekAgo, today),
    whoopGetRecoveryCollection(weekAgo, today),
    whoopGetSleep(weekAgo, today),
    whoopGetBodyMeasurement(),
  ]);

  console.log('[WHOOP] Cycles:', cycles);
  console.log('[WHOOP] Recovery collection:', recoveryCollection);
  console.log('[WHOOP] Sleep:', sleep);
  console.log('[WHOOP] Body:', body);

  // Strategy 1: Use recovery collection endpoint directly
  if (recoveryCollection && recoveryCollection.records && recoveryCollection.records.length > 0) {
    for (const rec of recoveryCollection.records) {
      if (rec.score_state === 'SCORED' && rec.score) {
        result.recovery.push({
          date: rec.created_at ? rec.created_at.split('T')[0] : today,
          score: rec.score.recovery_score,
          hrv: rec.score.hrv_rmssd_milli,
          restingHR: rec.score.resting_heart_rate,
          spo2: rec.score.spo2_percentage,
          skinTemp: rec.score.skin_temp_celsius,
        });
      }
    }
  }

  // Strategy 2: If collection didn't work, try per-cycle recovery
  if (result.recovery.length === 0 && cycles && cycles.records) {
    for (const cycle of cycles.records) {
      if (cycle.score_state === 'SCORED' && cycle.id) {
        const rec = await whoopGetRecoveryForCycle(cycle.id);
        if (rec && rec.score) {
          result.recovery.push({
            date: cycle.start ? cycle.start.split('T')[0] : today,
            score: rec.score.recovery_score,
            hrv: rec.score.hrv_rmssd_milli,
            restingHR: rec.score.resting_heart_rate,
            spo2: rec.score.spo2_percentage,
            skinTemp: rec.score.skin_temp_celsius,
          });
        }
      }
    }
  }

  // Parse sleep data
  if (sleep && sleep.records) {
    result.sleep = sleep.records.map(s => {
      const summary = s.score?.stage_summary;
      if (!summary) return null;
      const totalMs = summary.total_in_bed_time_milli || 0;
      const durationHrs = totalMs > 0 ? Math.round(totalMs / 3600000 * 10) / 10 : null;
      const qualityPct = totalMs > 0
        ? Math.round(((summary.total_slow_wave_sleep_time_milli || 0) + (summary.total_rem_sleep_time_milli || 0)) / totalMs * 100)
        : null;
      return {
        date: s.start ? s.start.split('T')[0] : null,
        durationHrs,
        qualityPct,
        remMs: summary.total_rem_sleep_time_milli || 0,
        deepMs: summary.total_slow_wave_sleep_time_milli || 0,
      };
    }).filter(s => s && s.durationHrs != null);
  }

  // Body measurement
  if (body) {
    result.bodyWeight = body.weight_kilogram || null;
  }

  // Cache result
  localStorage.setItem('whoop_cache', JSON.stringify({ timestamp: Date.now(), data: result }));
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
      // Clear cache to force fresh fetch
      localStorage.removeItem('whoop_cache');
      const btn = document.getElementById('btn-whoop-sync');
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      const data = await whoopSyncData();
      if (data) {
        if (typeof toast === 'function') toast(`Synced: ${data.recovery.length} recovery, ${data.sleep.length} sleep`);
        renderWhoopUI();
      } else {
        if (typeof toast === 'function') toast('Sync failed — check connection');
        btn.textContent = 'Sync Now';
        btn.disabled = false;
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
    container.innerHTML = '<div class="empty-state" style="padding:16px">WHOOP connected but no recovery data found. Try Sync Now in Settings.</div>';
    container.classList.remove('hidden');
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
