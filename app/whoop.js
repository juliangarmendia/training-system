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
  // Need either a live access token or a refresh token to be truly "connected"
  return !!(localStorage.getItem('whoop_access_token') || localStorage.getItem('whoop_refresh_token'));
}

function whoopNeedsReconnect() {
  // Explicit flag set when refresh fails irrecoverably
  return localStorage.getItem('whoop_needs_reconnect') === '1';
}

function whoopConnect() {
  localStorage.removeItem('whoop_needs_reconnect');
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
  localStorage.removeItem('whoop_needs_reconnect');
}

function whoopMarkReconnectNeeded(reason) {
  console.warn('[WHOOP] Marking reconnect needed:', reason);
  localStorage.setItem('whoop_needs_reconnect', '1');
  localStorage.removeItem('whoop_access_token');
  localStorage.removeItem('whoop_token_expiry');
  // Keep refresh_token around in case user retries, but the flag drives UI
}

// Errors that mean the refresh token itself is dead — no point retrying
function isFatalAuthError(status, errStr) {
  if (status === 400 || status === 401 || status === 403) return true;
  const s = String(errStr || '').toLowerCase();
  return s.includes('invalid_grant') || s.includes('invalid_token') || s.includes('unauthorized') || s.includes('expired');
}

async function whoopRefreshToken() {
  const refresh = localStorage.getItem('whoop_refresh_token');
  if (!refresh) {
    whoopMarkReconnectNeeded('no refresh token');
    return null;
  }

  try {
    const res = await fetch(WHOOP_TOKEN_PROXY, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action: 'refresh', refresh_token: refresh }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      if (isFatalAuthError(res.status, data.error)) {
        whoopMarkReconnectNeeded(`refresh failed: ${res.status} ${data.error || ''}`);
        return null;
      }
      // Transient network/proxy error — keep state, retry later
      console.warn('[WHOOP] Transient refresh failure, will retry later:', res.status, data.error);
      return null;
    }

    localStorage.setItem('whoop_access_token', data.access_token);
    localStorage.setItem('whoop_refresh_token', data.refresh_token);
    localStorage.setItem('whoop_token_expiry', String(Date.now() + data.expires_in * 1000));
    localStorage.removeItem('whoop_needs_reconnect');
    return data.access_token;
  } catch (e) {
    // Network error — don't mark as needing reconnect, this is likely offline
    console.warn('[WHOOP] Network error during refresh:', e);
    return null;
  }
}

async function whoopGetToken() {
  if (whoopNeedsReconnect()) return null;

  const expiry = parseInt(localStorage.getItem('whoop_token_expiry') || '0');
  const token = localStorage.getItem('whoop_access_token');

  // If token is still valid (with 5 min buffer), use it
  if (token && Date.now() < expiry - 300000) return token;

  // Otherwise refresh
  return await whoopRefreshToken();
}

// ==================== API CALLS (via proxy) ====================
async function whoopFetch(endpoint, _retried = false) {
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

    const data = await res.json().catch(() => ({}));
    console.log(`[WHOOP] ${endpoint} →`, res.status);

    if (res.status === 401 && !_retried) {
      // Stale access token — force a refresh and retry exactly once
      console.warn('[WHOOP] 401, forcing refresh + retry:', endpoint);
      localStorage.setItem('whoop_token_expiry', '0'); // invalidate
      const newToken = await whoopRefreshToken();
      if (!newToken) return null;
      return await whoopFetch(endpoint, true);
    }

    if (!res.ok) {
      if (res.status === 401) {
        // Retry already failed → refresh token is dead
        whoopMarkReconnectNeeded('API 401 after refresh retry');
      }
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
  // Try multiple paths — v2 moved this endpoint
  const result = await whoopFetch(`/v2/body_measurement`);
  if (result) return result;
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

  if (whoopNeedsReconnect()) {
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--red)">WHOOP session expired</label>
      </div>
      <p class="muted" style="font-size:11px;margin-top:4px;margin-bottom:8px">Your WHOOP login expired. Reconnect to resume syncing recovery, HRV, and sleep.</p>
      <button id="btn-whoop-reconnect" class="btn-secondary" style="width:100%;text-align:center;border-color:var(--red);color:var(--red)">Reconnect WHOOP</button>
    `;
    document.getElementById('btn-whoop-reconnect').addEventListener('click', whoopConnect);
    return;
  }

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
function getRecoveryColor(score) {
  if (score >= 67) return { color: '#4ade80', label: 'Green' };
  if (score >= 34) return { color: '#facc15', label: 'Yellow' };
  return { color: '#f87171', label: 'Red' };
}

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
  const { color, label } = getRecoveryColor(score);

  // Latest sleep
  const latestSleep = data.sleep.length > 0 ? data.sleep[data.sleep.length - 1] : null;

  // 7-day recovery trend table
  const last7 = data.recovery.slice(-7);
  const sleepByDate = {};
  data.sleep.forEach(s => { if (s.date) sleepByDate[s.date] = s; });

  const trendRows = last7.map(r => {
    const rc = getRecoveryColor(r.score);
    const day = r.date ? new Date(r.date + 'T12:00:00').toLocaleDateString('en', { weekday: 'short', month: 'numeric', day: 'numeric' }) : '?';
    const sl = r.date ? sleepByDate[r.date] : null;
    const sleepTxt = sl ? sl.durationHrs + 'h' : '--';
    return `<tr class="whoop-trend-row">
      <td class="wt-day">${day}</td>
      <td class="wt-score" style="color:${rc.color}">${r.score}%</td>
      <td class="wt-val">${r.hrv ? Math.round(r.hrv) : '--'}</td>
      <td class="wt-val">${r.restingHR || '--'}</td>
      <td class="wt-val">${sleepTxt}</td>
    </tr>`;
  }).reverse().join('');

  // Sleep breakdown
  let sleepHTML = '';
  if (latestSleep) {
    const deepH = latestSleep.deepMs ? (latestSleep.deepMs / 3600000).toFixed(1) : '0';
    const remH = latestSleep.remMs ? (latestSleep.remMs / 3600000).toFixed(1) : '0';
    sleepHTML = `
      <div class="whoop-sleep-breakdown">
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:#6366f1"></span> Deep ${deepH}h</div>
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:#8b5cf6"></span> REM ${remH}h</div>
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:var(--text3)"></span> Total ${latestSleep.durationHrs}h</div>
      </div>`;
  }

  // Recovery ring (SVG arc)
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  container.innerHTML = `
    <div class="whoop-card-top">
      <div class="whoop-ring-wrap">
        <svg width="88" height="88" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r="${radius}" fill="none" stroke="var(--bg2)" stroke-width="6"/>
          <circle cx="44" cy="44" r="${radius}" fill="none" stroke="${color}" stroke-width="6"
            stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
            stroke-linecap="round" transform="rotate(-90 44 44)"
            style="transition:stroke-dashoffset 0.8s ease"/>
        </svg>
        <div class="whoop-ring-text">
          <span class="whoop-ring-score" style="color:${color}">${score}</span>
          <span class="whoop-ring-pct">%</span>
        </div>
      </div>
      <div class="whoop-card-info">
        <div class="whoop-card-title">
          <span class="whoop-logo-text">WHOOP</span>
          <span class="whoop-recovery-label" style="color:${color}">${label}</span>
        </div>
        <div class="whoop-metrics-row">
          <div class="whoop-metric-sm">
            <span class="wm-val-sm">${latest.hrv ? Math.round(latest.hrv) : '--'}</span>
            <span class="wm-label-sm">HRV</span>
          </div>
          <div class="whoop-metric-sm">
            <span class="wm-val-sm">${latest.restingHR || '--'}</span>
            <span class="wm-label-sm">RHR</span>
          </div>
          <div class="whoop-metric-sm">
            <span class="wm-val-sm">${latest.spo2 ? Math.round(latest.spo2) + '%' : '--'}</span>
            <span class="wm-label-sm">SpO2</span>
          </div>
          <div class="whoop-metric-sm">
            <span class="wm-val-sm">${latestSleep ? latestSleep.durationHrs + 'h' : '--'}</span>
            <span class="wm-label-sm">Sleep</span>
          </div>
        </div>
      </div>
    </div>
    ${sleepHTML}
    <div class="whoop-trend">
      <div class="whoop-trend-label">7-day Trend</div>
      <table class="whoop-trend-table">
        <thead><tr><th></th><th>Rec</th><th>HRV</th><th>RHR</th><th>Sleep</th></tr></thead>
        <tbody>${trendRows}</tbody>
      </table>
    </div>
  `;
}

// Expose globally
window.whoopIsConnected = whoopIsConnected;
window.whoopSyncData = whoopSyncData;
window.renderWhoopUI = renderWhoopUI;
window.renderWhoopRecoveryCard = renderWhoopRecoveryCard;
