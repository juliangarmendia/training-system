// ============================================================
// WHOOP Integration Module — Training App v10.27
// Primary path: intervals.icu wellness (no OAuth, no token refresh).
// Fallback path: direct WHOOP OAuth (kept for rollback; deleted Phase 3).
// ============================================================

const WHOOP_CLIENT_ID = '2bc89171-9bab-46ec-94d2-0bb8d015f9c3';
const WHOOP_AUTH_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_API_BASE = 'https://api.prod.whoop.com/developer';
const WHOOP_REDIRECT_URI = 'https://juliangarmendia.github.io/training-system/whoop-callback.html';
const WHOOP_TOKEN_PROXY = 'https://ycfodifvpvosukepcxie.supabase.co/functions/v1/whoop-auth';
const WHOOP_SCOPES = 'read:recovery read:sleep read:workout read:body_measurement read:profile';

// ==================== CONNECTION STATE ====================
function intervalsWellnessConfigured() {
  return !!(typeof state !== 'undefined' && state.settings
    && state.settings.intervalsIcuApiKey
    && state.settings.intervalsIcuAthleteId);
}

function whoopOAuthConnected() {
  return !!(localStorage.getItem('whoop_access_token') || localStorage.getItem('whoop_refresh_token'));
}

function whoopIsConnected() {
  // Connected if EITHER intervals.icu (primary) OR OAuth (fallback) is set up
  return intervalsWellnessConfigured() || whoopOAuthConnected();
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

// Errors that mean the refresh token itself is dead — no point retrying.
// Be conservative here: only mark reconnect needed when WHOOP explicitly says
// the grant/token is invalid. Generic 400/403 (rate limit, malformed cursor,
// brief proxy hiccup) are transient and should NOT throw away the session.
function isFatalAuthError(status, errStr) {
  const s = String(errStr || '').toLowerCase();
  if (s.includes('invalid_grant') || s.includes('invalid_token') || s.includes('unauthorized') || s.includes('expired')) return true;
  // 401 from the refresh endpoint = refresh token rejected → fatal.
  // 400/403 = treat as transient unless paired with one of the strings above.
  return status === 401;
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

// ==================== INTERVALS.ICU WELLNESS (primary path) ====================
// Reads daily wellness rows that intervals.icu auto-syncs from WHOOP. Returns
// the same shape as whoopSyncData() so renderWhoopRecoveryCard() doesn't care
// about the source. Logs unknown keys once per session for safety against
// silent field-name drift.
let _wellnessKeyLoggingDone = false;

async function intervalsFetchWellness() {
  if (!intervalsWellnessConfigured()) return null;
  const apiKey = state.settings.intervalsIcuApiKey;
  const athleteId = state.settings.intervalsIcuAthleteId;

  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}/wellness`
    + `?oldest=${weekAgo}&newest=${today}`;
  const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);

  let rows;
  try {
    const res = await fetch(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      console.warn('[wellness] intervals.icu fetch failed:', res.status);
      return null;
    }
    rows = await res.json();
  } catch (e) {
    console.warn('[wellness] network error:', e);
    return null;
  }

  if (!Array.isArray(rows)) {
    console.warn('[wellness] unexpected response shape:', rows);
    return null;
  }

  // Surface unknown keys once per session — guards against field-name drift.
  // Updated v10.27 with the full set discovered in production.
  if (!_wellnessKeyLoggingDone && rows.length > 0) {
    const known = new Set([
      // Core wellness (mapped to recovery/sleep card)
      'id', 'readiness', 'hrv', 'restingHR', 'sleepSecs', 'sleepScore', 'spO2',
      'respiration', 'updated', 'sportInfo', 'avgSleepingHR', 'sleepQuality',
      // Subjective wellness (not surfaced yet — could be added later)
      'fatigue', 'soreness', 'stress', 'mood', 'motivation', 'injury', 'sick',
      'menstrualPhase', 'menstrualPhasePredicted', 'comments',
      // Body comp + activity
      'weight', 'bodyFat', 'abdomen', 'steps',
      // Lab values
      'baevskySI', 'bloodGlucose', 'lactate', 'vo2max',
      // Training load (huge for periodization)
      'ctl', 'atl', 'rampRate', 'ctlLoad', 'atlLoad', 'hrvSDNN',
      // Vitals
      'systolic', 'diastolic',
      // Hydration + nutrition
      'hydration', 'hydrationVolume', 'kcalConsumed',
      'carbohydrates', 'protein', 'fatTotal',
      // Internal
      'locked', 'tempWeight', 'tempRestingHR',
    ]);
    const seen = new Set();
    rows.forEach(r => Object.keys(r || {}).forEach(k => seen.add(k)));
    const unknown = [...seen].filter(k => !known.has(k));
    if (unknown.length) console.info('[wellness] unknown keys (review):', unknown);
    _wellnessKeyLoggingDone = true;
  }

  const recovery = [];
  const sleep = [];
  let latestWeight = null;
  let weightWrites = 0;
  let stepsWrites = 0;
  let wellnessWrites = 0;

  for (const r of rows) {
    if (!r || !r.id) continue;
    if (r.readiness != null || r.hrv != null || r.restingHR != null) {
      recovery.push({
        date: r.id,
        score: r.readiness != null ? Math.round(r.readiness) : null,
        hrv: r.hrv != null ? Number(r.hrv) : null,
        restingHR: r.restingHR != null ? Number(r.restingHR) : null,
        spo2: r.spO2 != null ? Number(r.spO2) : null,
        skinTemp: null,
      });
    }
    if (r.sleepSecs != null && r.sleepSecs > 0) {
      sleep.push({
        date: r.id,
        durationHrs: Math.round(r.sleepSecs / 3600 * 10) / 10,
        qualityPct: r.sleepScore != null ? Math.round(r.sleepScore) : null,
        remMs: 0,
        deepMs: 0,
      });
    }

    // Body weight — upsert to bodyweight store (legacy, used by calorie estimates).
    // intervals.icu wins over manual entry for the same date.
    if (typeof r.weight === 'number' && r.weight > 20 && r.weight < 300) {
      try {
        if (typeof smartPut === 'function') {
          await smartPut('bodyweight', {
            date: r.id,
            weight: Math.round(r.weight * 10) / 10,
            timestamp: Date.now(),
            source: 'intervals.icu',
          });
          weightWrites++;
          latestWeight = Math.round(r.weight * 10) / 10;
        }
      } catch (e) { console.warn('[wellness] weight upsert failed for', r.id, e); }
    }

    // Daily steps — upsert to steps store. smartPut so it goes to Supabase too
    // (was dbPut before — IDB only). Replaces iOS Shortcut → steps-ingest path.
    if (typeof r.steps === 'number' && r.steps >= 0 && r.steps < 200000) {
      try {
        if (typeof smartPut === 'function') {
          await smartPut('steps', {
            date: r.id,
            steps: Math.round(r.steps),
            source: 'intervals.icu',
            ts: Date.now(),
          });
          stepsWrites++;
        }
      } catch (e) { console.warn('[wellness] steps upsert failed for', r.id, e); }
    }

    // Full wellness row — upserted to dedicated wellness store. This is what the
    // weekly cron reads from Supabase to make periodization decisions (CTL/ATL/
    // rampRate trends, recovery + sleep + macros consolidated per day).
    try {
      if (typeof smartPut === 'function') {
        const wellnessRow = {
          date: r.id,
          // Recovery + sleep (canonical names matching what the cron expects)
          readiness: r.readiness != null ? Math.round(r.readiness) : null,
          hrv: r.hrv != null ? Number(r.hrv) : null,
          hrvSDNN: r.hrvSDNN != null ? Number(r.hrvSDNN) : null,
          restingHR: r.restingHR != null ? Number(r.restingHR) : null,
          avgSleepingHR: r.avgSleepingHR != null ? Number(r.avgSleepingHR) : null,
          sleepSecs: r.sleepSecs != null ? Number(r.sleepSecs) : null,
          sleepScore: r.sleepScore != null ? Math.round(r.sleepScore) : null,
          spO2: r.spO2 != null ? Number(r.spO2) : null,
          respiration: r.respiration != null ? Number(r.respiration) : null,
          // Body comp
          weight: r.weight != null ? Math.round(r.weight * 10) / 10 : null,
          bodyFat: r.bodyFat != null ? Number(r.bodyFat) : null,
          // Activity
          steps: r.steps != null ? Math.round(r.steps) : null,
          // Training load (Fitness/Fatigue/Form — periodization fuel)
          ctl: r.ctl != null ? Number(r.ctl) : null,
          atl: r.atl != null ? Number(r.atl) : null,
          rampRate: r.rampRate != null ? Number(r.rampRate) : null,
          ctlLoad: r.ctlLoad != null ? Number(r.ctlLoad) : null,
          atlLoad: r.atlLoad != null ? Number(r.atlLoad) : null,
          // Nutrition
          kcalConsumed: r.kcalConsumed != null ? Number(r.kcalConsumed) : null,
          carbs: r.carbohydrates != null ? Number(r.carbohydrates) : null,
          protein: r.protein != null ? Number(r.protein) : null,
          fat: r.fatTotal != null ? Number(r.fatTotal) : null,
          // Subjective (if filled in intervals.icu)
          fatigue: r.fatigue != null ? Number(r.fatigue) : null,
          soreness: r.soreness != null ? Number(r.soreness) : null,
          stress: r.stress != null ? Number(r.stress) : null,
          mood: r.mood != null ? Number(r.mood) : null,
          motivation: r.motivation != null ? Number(r.motivation) : null,
          source: 'intervals.icu',
          ts: Date.now(),
        };
        // Drop nulls to keep rows compact in Supabase jsonb
        const compact = {};
        for (const [k, v] of Object.entries(wellnessRow)) {
          if (v !== null && v !== undefined) compact[k] = v;
        }
        // Always keep date + source + ts (smartPut needs date as the keyPath)
        compact.date = r.id;
        compact.source = 'intervals.icu';
        compact.ts = Date.now();

        // Only write if there's at least one signal beyond the metadata
        const signalCount = Object.keys(compact).length - 3;
        if (signalCount > 0) {
          await smartPut('wellness', compact);
          wellnessWrites++;
        }
      }
    } catch (e) { console.warn('[wellness] wellness upsert failed for', r.id, e); }
  }

  if (weightWrites || stepsWrites || wellnessWrites) {
    console.info(`[wellness] sync: ${wellnessWrites} wellness rows, ${weightWrites} weight, ${stepsWrites} steps`);
  }

  // Sort by date ascending so renderWhoopRecoveryCard's slice(-7) gets latest.
  recovery.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  sleep.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return {
    synced: true,
    syncDate: new Date().toISOString().split('T')[0],
    source: 'intervals.icu',
    recovery,
    sleep,
    bodyWeight: latestWeight,
  };
}

// ==================== SYNC DATA ====================
async function whoopSyncData() {
  if (!whoopIsConnected()) return null;

  // Cache: 10 min (upstream intervals.icu already caches; no need for 30 min)
  const cache = localStorage.getItem('whoop_cache');
  if (cache) {
    try {
      const cached = JSON.parse(cache);
      if (cached.timestamp && Date.now() - cached.timestamp < 10 * 60 * 1000) {
        return cached.data;
      }
    } catch { /* ignore */ }
  }

  // Primary path: intervals.icu wellness (no OAuth, no disconnects)
  if (intervalsWellnessConfigured()) {
    const data = await intervalsFetchWellness();
    if (data) {
      localStorage.setItem('whoop_cache', JSON.stringify({ timestamp: Date.now(), data }));
      localStorage.setItem('whoop_last_sync', data.syncDate);
      return data;
    }
    // If intervals path fails AND OAuth is also not configured, give up
    if (!whoopOAuthConnected()) return null;
    // Otherwise fall through to OAuth fallback
    console.warn('[wellness] intervals.icu path returned null, falling back to OAuth');
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

  const lastSync = localStorage.getItem('whoop_last_sync') || 'Never';

  // PRIMARY PATH: intervals.icu wellness (no OAuth, no disconnects)
  if (intervalsWellnessConfigured()) {
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--accent)">WHOOP via intervals.icu ✓</label>
      </div>
      <p class="muted" style="font-size:11px;margin-top:4px;margin-bottom:8px">Wellness (recovery, HRV, RHR, sleep) syncs through intervals.icu — no OAuth needed. Manage WHOOP connection at <a href="https://intervals.icu/settings" target="_blank" rel="noopener">intervals.icu/settings</a> → Whoop.</p>
      <div class="muted" style="font-size:11px;margin-bottom:8px">Last sync: ${lastSync}</div>
      <button id="btn-whoop-sync" class="btn-secondary" style="width:100%;text-align:center">Sync Now</button>
    `;
    document.getElementById('btn-whoop-sync').addEventListener('click', async () => {
      localStorage.removeItem('whoop_cache');
      const btn = document.getElementById('btn-whoop-sync');
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      const data = await whoopSyncData();
      if (data) {
        if (typeof toast === 'function') toast(`Synced: ${data.recovery.length} recovery, ${data.sleep.length} sleep`);
        renderWhoopUI();
        await renderWhoopRecoveryCard();
      } else {
        if (typeof toast === 'function') toast('Sync failed — check intervals.icu API key + WHOOP connection there');
        btn.textContent = 'Sync Now';
        btn.disabled = false;
      }
    });
    return;
  }

  // FALLBACK PATH: legacy OAuth (kept for rollback; deleted in Phase 3)
  if (whoopNeedsReconnect()) {
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--red)">WHOOP OAuth session expired</label>
      </div>
      <p class="muted" style="font-size:11px;margin-top:4px;margin-bottom:8px">Better path: configure intervals.icu API key (Settings → intervals.icu) and connect WHOOP there — no more OAuth refreshes.</p>
      <button id="btn-whoop-reconnect" class="btn-secondary" style="width:100%;text-align:center;border-color:var(--red);color:var(--red)">Reconnect WHOOP (legacy OAuth)</button>
    `;
    document.getElementById('btn-whoop-reconnect').addEventListener('click', whoopConnect);
    return;
  }

  if (whoopOAuthConnected()) {
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--accent)">WHOOP Connected (legacy OAuth)</label>
        <button id="btn-whoop-disconnect" class="btn-secondary" style="width:auto;padding:8px 16px">Disconnect</button>
      </div>
      <p class="muted" style="font-size:11px;margin-top:4px;margin-bottom:8px">Recommended: connect WHOOP via intervals.icu instead — no token refresh issues.</p>
      <div class="muted" style="font-size:11px;margin-top:6px">Last sync: ${lastSync}</div>
      <button id="btn-whoop-sync" class="btn-secondary" style="margin-top:8px;width:100%;text-align:center">Sync Now</button>
    `;
    document.getElementById('btn-whoop-disconnect').addEventListener('click', () => {
      whoopDisconnect();
      renderWhoopUI();
      if (typeof toast === 'function') toast('WHOOP disconnected');
    });
    document.getElementById('btn-whoop-sync').addEventListener('click', async () => {
      localStorage.removeItem('whoop_cache');
      const btn = document.getElementById('btn-whoop-sync');
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      const data = await whoopSyncData();
      if (data) {
        if (typeof toast === 'function') toast(`Synced: ${data.recovery.length} recovery, ${data.sleep.length} sleep`);
        renderWhoopUI();
        await renderWhoopRecoveryCard();
      } else {
        if (typeof toast === 'function') toast('Sync failed — check connection');
        btn.textContent = 'Sync Now';
        btn.disabled = false;
      }
    });
    return;
  }

  // Not configured at all — promote intervals.icu path, keep OAuth as escape hatch
  container.innerHTML = `
    <p class="muted" style="font-size:12px;margin-top:0;margin-bottom:8px">Pull recovery, HRV, RHR, and sleep from WHOOP via intervals.icu (recommended — no OAuth refreshes):</p>
    <ol class="muted" style="font-size:11px;margin:0 0 10px 16px;padding:0">
      <li>Settings → intervals.icu → enter API key + athlete ID</li>
      <li>Go to <a href="https://intervals.icu/settings" target="_blank" rel="noopener">intervals.icu/settings</a> → Whoop → Connect</li>
    </ol>
    <button id="btn-whoop-connect" class="btn-secondary" style="width:100%;text-align:center">Use legacy OAuth instead</button>
  `;
  document.getElementById('btn-whoop-connect').addEventListener('click', whoopConnect);
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

  // Sleep breakdown — only shown when stage data is available (legacy OAuth path).
  // intervals.icu wellness doesn't surface REM/deep stages, so the breakdown is hidden.
  let sleepHTML = '';
  if (latestSleep && (latestSleep.deepMs > 0 || latestSleep.remMs > 0)) {
    const deepH = (latestSleep.deepMs / 3600000).toFixed(1);
    const remH = (latestSleep.remMs / 3600000).toFixed(1);
    sleepHTML = `
      <div class="whoop-sleep-breakdown">
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:#6366f1"></span> Deep ${deepH}h</div>
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:#8b5cf6"></span> REM ${remH}h</div>
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:var(--text3)"></span> Total ${latestSleep.durationHrs}h</div>
      </div>`;
  } else if (latestSleep && latestSleep.qualityPct != null) {
    // intervals.icu path: show quality score instead of stage breakdown
    sleepHTML = `
      <div class="whoop-sleep-breakdown">
        <div class="whoop-sleep-stat"><span class="whoop-sleep-dot" style="background:var(--text3)"></span> ${latestSleep.durationHrs}h slept · ${latestSleep.qualityPct}% quality</div>
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
