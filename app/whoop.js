// ============================================================
// WHOOP / wellness — lector, no cliente OAuth (Coach v2.1 · A-3)
// ============================================================
//
// QUÉ HACE ESTE FICHERO AHORA. Consolida el estado de recuperación y sueño del store
// `wellness` y lo entrega en la forma que consumen `renderWhoopRecoveryCard`,
// `getWhoopContext`, `runFullSync` e `init`. Dos escritores alimentan ese store:
//
//   · **El servidor** (edge functions `whoop-sync` / `whoop-webhook`, A-1/A-2) escribe el
//     readiness, HRV, FC en reposo y el desglose del sueño de WHOOP, marcados con
//     `readinessSource:'whoop'`. Es EL DATO DE HOY: llega por webhook a los pocos minutos de
//     que WHOOP puntúe la noche.
//   · **intervals.icu** (`intervalsFetchWellness`, aquí abajo) escribe el HISTÓRICO y lo que
//     WHOOP no da: CTL/ATL/rampRate, pasos, peso suavizado, macros. Tarda horas en reflejar el
//     readiness del día, así que NO puede pisar las claves del servidor.
//
// LO QUE SE FUE EN A-3 y por qué. Hasta v11.63 este fichero hacía el OAuth de WHOOP: guardaba
// los tokens en `localStorage` del navegador y los refrescaba contra un proxy sin estado (esa
// función se borra en A-6). WHOOP **rota** el refresh token en cada refresco, así que dos almacenamientos
// (la PWA instalada y Safari, que en iOS están separados) se pisaban y el segundo recibía
// `invalid_grant`; el authorize además no pedía `offline`, e iOS desaloja `localStorage` de una
// PWA que no se abre en unos días. Las tres causas de "WHOOP se ha vuelto a desconectar".
// Ahora los tokens viven en el servidor y aquí no hay ni uno: la conexión se gestiona en
// `app/integrations.js` (tarjeta de Ajustes) y el dato se pide con `integrationsSync('whoop')`.

// ==================== FECHAS (F-14) ====================
// Todo "hoy" de este fichero es LOCAL. Usaba `new Date().toISOString().split('T')[0]`, que es UTC:
// entre las 00:00 y las 02:00 de Madrid pedía la ventana de "hoy" UTC (= ayer local) y etiquetaba
// las filas con un día de menos. El resto de la app ya usa `dateStr()` local a propósito (el
// proyecto pagó una migración por esto, tz_date_migration_v2). whoop.js se carga ANTES de app.js,
// así que se define aquí su propio helper en vez de depender del orden de los <script>.
function _whoopLocalDateStr(d) {
  const dt = d instanceof Date ? d : (d != null ? new Date(d) : new Date());
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ==================== CONNECTION STATE ====================
function intervalsWellnessConfigured() {
  return !!(typeof state !== 'undefined' && state.settings
    && state.settings.intervalsIcuApiKey
    && state.settings.intervalsIcuAthleteId);
}

// Hay wellness si CUALQUIERA de las dos vías está viva: intervals.icu (histórico) o la
// integración de servidor de WHOOP (hoy). `integrationsIsActive` es síncrona a propósito: esto
// se llama desde renders y no puede devolver una promesa.
function whoopIsConnected() {
  if (intervalsWellnessConfigured()) return true;
  try {
    return (typeof integrationsIsActive === 'function') && integrationsIsActive('whoop');
  } catch (e) { return false; }
}

// ==================== CLAVES QUE SON DE WHOOP ====================
// Precedencia explícita (plan A.4). Si la fila de un día ya la escribió el servidor
// (`readinessSource === 'whoop'`), intervals.icu NO puede tocar estas claves: su readiness llega
// horas más tarde y es una copia degradada del mismo número, sin desglose de fases ni SpO2.
// Lo que intervals.icu SÍ sigue mandando en esa misma fila: `ctl`, `atl`, `rampRate`, `steps`,
// `weight` suavizado y las macros.
const WHOOP_OWNED_KEYS = [
  'readiness', 'hrv', 'restingHR', 'spO2', 'skinTemp',
  'sleepSecs', 'sleepInBedSecs', 'sleepAwakeSecs', 'sleepRemSecs', 'sleepDeepSecs',
  'sleepLightSecs', 'sleepScore', 'sleepEfficiency', 'sleepConsistency', 'respiration',
  'sleepNeedSecs',
];

function _whoopIsOwnedKey(k) {
  return WHOOP_OWNED_KEYS.indexOf(k) >= 0 || /^whoop/.test(k) || k === 'readinessSource';
}

// Igualdad profunda "de datos" entre la fila compactada y la guardada, ignorando la marca de
// tiempo. Sin esto, cada apertura de la app reescribía las siete filas de wellness con el mismo
// contenido y un `ts` nuevo: siete `smartPut` → siete filas en la cola → siete `updated_at`
// nuevos en Supabase por render. Churn puro.
function _whoopRowsEqual(a, b) {
  if (!a || !b) return false;
  const strip = (o) => {
    const c = {};
    for (const k of Object.keys(o)) {
      if (k === 'ts' || k === '_updated_at') continue;
      const v = o[k];
      if (v === null || v === undefined) continue;
      c[k] = v;
    }
    return c;
  };
  const A = strip(a), B = strip(b);
  const ka = Object.keys(A).sort(), kb = Object.keys(B).sort();
  if (ka.length !== kb.length) return false;
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return false;
    const va = A[ka[i]], vb = B[ka[i]];
    if (va && typeof va === 'object') {
      if (JSON.stringify(va) !== JSON.stringify(vb)) return false;
    } else if (va !== vb) return false;
  }
  return true;
}

// ==================== INTERVALS.ICU WELLNESS (histórico) ====================
// Lee las filas diarias de wellness que intervals.icu sincroniza desde WHOOP y las vuelca a los
// stores `wellness`, `bodyweight` y `steps`. Logea las claves desconocidas una vez por sesión
// como red contra un cambio silencioso de nombres.
let _wellnessKeyLoggingDone = false;

async function intervalsFetchWellness() {
  if (!intervalsWellnessConfigured()) return null;
  const apiKey = state.settings.intervalsIcuApiKey;
  const athleteId = state.settings.intervalsIcuAthleteId;

  const today = _whoopLocalDateStr();
  const weekAgo = _whoopLocalDateStr(new Date(Date.now() - 7 * 86400000));
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

  let latestWeight = null;
  let weightWrites = 0;
  let stepsWrites = 0;
  let wellnessWrites = 0;

  for (const r of rows) {
    if (!r || !r.id) continue;

    // Body weight — only persist days with a REAL measurement (tempWeight is the
    // raw value entered that day; weight is the smoothed/forward-filled current
    // value that intervals.icu projects forward when you don't weigh in. Using
    // weight directly produces fake "stable" sequences like 3 identical days
    // in a row that are actually 1 measurement repeated). Falling back to
    // weight only if it differs materially from the previous day's stored value
    // (heuristic: if intervals.icu reports a NEW value, it's a real change).
    const measuredW = (typeof r.tempWeight === 'number' && r.tempWeight > 20 && r.tempWeight < 300)
      ? Math.round(r.tempWeight * 10) / 10
      : null;
    const projectedW = (typeof r.weight === 'number' && r.weight > 20 && r.weight < 300)
      ? Math.round(r.weight * 10) / 10
      : null;

    // La pesada de la báscula Withings (A-5) gana SIEMPRE sobre el eco de intervals.icu: trae
    // hora, composición y viene del dispositivo. Sobrescribirla con el número redondeado que
    // intervals devuelve al día siguiente sería perder la medida buena.
    let bwExisting = null;
    if (typeof dbGet === 'function' && (measuredW !== null || projectedW !== null)) {
      try { bwExisting = await dbGet('bodyweight', r.id); } catch { /* fila nueva */ }
    }
    const bwIsWithings = !!(bwExisting && bwExisting.source === 'withings');

    if (measuredW !== null) {
      // Real measurement → always persist (salvo que ya haya una pesada de la báscula)
      try {
        if (typeof smartPut === 'function' && !bwIsWithings) {
          await smartPut('bodyweight', {
            date: r.id,
            weight: measuredW,
            timestamp: Date.now(),
            source: 'intervals.icu',
            measured: true,
          });
          weightWrites++;
        }
        latestWeight = bwIsWithings ? (bwExisting.weight != null ? bwExisting.weight : measuredW) : measuredW;
      } catch (e) { console.warn('[wellness] weight upsert failed for', r.id, e); }
    } else if (projectedW !== null) {
      // No raw measurement that day → only persist if it differs from the most
      // recent stored value (i.e., intervals reports a step change, likely a
      // real measurement that arrived without tempWeight populated).
      try {
        if (typeof dbGet === 'function') {
          const existing = bwExisting;
          const prevDate = (() => {
            // Mediodía local − 1 día, en local: la misma cuenta de siempre, sin pasar por UTC.
            const d = new Date(r.id + 'T12:00:00');
            d.setDate(d.getDate() - 1);
            return _whoopLocalDateStr(d);
          })();
          const prev = await dbGet('bodyweight', prevDate);
          const prevWeight = prev && typeof prev.weight === 'number' ? prev.weight : null;
          const isNewSignal = prevWeight === null || Math.abs(projectedW - prevWeight) >= 0.05;
          // Skip if the value matches the previous day's value AND we don't already
          // have a measured entry for this date (don't overwrite manual logs).
          if (isNewSignal && !(existing && existing.measured) && !bwIsWithings) {
            await smartPut('bodyweight', {
              date: r.id,
              weight: projectedW,
              timestamp: Date.now(),
              source: 'intervals.icu',
              measured: false,
            });
            weightWrites++;
            latestWeight = projectedW;
          } else if (existing == null) {
            // Even forward-fills are useful as the "last known weight" for
            // calorie estimates on days with no other data — but only if the
            // store has nothing for this date yet.
            latestWeight = projectedW;
          }
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
    //
    // Naming convention for measurement vs projection:
    //   weight / restingHR     → intervals.icu's smoothed/forward-filled value
    //   weightMeasured / restingHRMeasured → raw measurement that day (null if not measured)
    // Cron should prefer the *Measured fields when computing trends.
    try {
      if (typeof smartPut === 'function') {
        const wellnessRow = {
          date: r.id,
          // Recovery + sleep
          readiness: r.readiness != null ? Math.round(r.readiness) : null,
          hrv: r.hrv != null ? Number(r.hrv) : null,
          hrvSDNN: r.hrvSDNN != null ? Number(r.hrvSDNN) : null,
          restingHR: r.restingHR != null ? Number(r.restingHR) : null,
          restingHRMeasured: r.tempRestingHR != null ? Number(r.tempRestingHR) : null,
          avgSleepingHR: r.avgSleepingHR != null ? Number(r.avgSleepingHR) : null,
          sleepSecs: r.sleepSecs != null ? Number(r.sleepSecs) : null,
          sleepScore: r.sleepScore != null ? Math.round(r.sleepScore) : null,
          spO2: r.spO2 != null ? Number(r.spO2) : null,
          respiration: r.respiration != null ? Number(r.respiration) : null,
          // Body comp
          weight: projectedW,
          weightMeasured: measuredW,
          bodyFat: r.bodyFat != null ? Number(r.bodyFat) : null,
          abdomen: r.abdomen != null ? Number(r.abdomen) : null,
          // Activity
          steps: r.steps != null ? Math.round(r.steps) : null,
          // Training load (Fitness/Fatigue/Form — periodization fuel)
          ctl: r.ctl != null ? Number(r.ctl) : null,
          atl: r.atl != null ? Number(r.atl) : null,
          rampRate: r.rampRate != null ? Number(r.rampRate) : null,
          ctlLoad: r.ctlLoad != null ? Number(r.ctlLoad) : null,
          atlLoad: r.atlLoad != null ? Number(r.atlLoad) : null,
          // Vitals (only present if user logs them in intervals.icu)
          systolic: r.systolic != null ? Number(r.systolic) : null,
          diastolic: r.diastolic != null ? Number(r.diastolic) : null,
          bloodGlucose: r.bloodGlucose != null ? Number(r.bloodGlucose) : null,
          lactate: r.lactate != null ? Number(r.lactate) : null,
          vo2max: r.vo2max != null ? Number(r.vo2max) : null,
          // Hydration
          hydration: r.hydration != null ? Number(r.hydration) : null,
          hydrationVolume: r.hydrationVolume != null ? Number(r.hydrationVolume) : null,
          // Nutrition (typically null — Julian doesn't log macros in intervals.icu;
          // the PWA's nutrition store is the source of truth for that)
          kcalConsumed: r.kcalConsumed != null ? Number(r.kcalConsumed) : null,
          carbs: r.carbohydrates != null ? Number(r.carbohydrates) : null,
          protein: r.protein != null ? Number(r.protein) : null,
          fat: r.fatTotal != null ? Number(r.fatTotal) : null,
          // Subjective (only if filled in intervals.icu — Julian doesn't currently)
          fatigue: r.fatigue != null ? Number(r.fatigue) : null,
          soreness: r.soreness != null ? Number(r.soreness) : null,
          stress: r.stress != null ? Number(r.stress) : null,
          mood: r.mood != null ? Number(r.mood) : null,
          motivation: r.motivation != null ? Number(r.motivation) : null,
          comments: typeof r.comments === 'string' && r.comments.trim() ? r.comments.trim() : null,
          source: 'intervals.icu',
        };
        // Drop nulls to keep rows compact in Supabase jsonb
        const compact = {};
        for (const [k, v] of Object.entries(wellnessRow)) {
          if (v !== null && v !== undefined) compact[k] = v;
        }
        // Always keep date + source (smartPut needs date as the keyPath)
        compact.date = r.id;
        compact.source = 'intervals.icu';

        // v11.59: el check-in subjetivo de la app vive en la MISMA fila (`subjective`) y esta
        // escritura es un `put`, no un merge — sin esto, la primera sincronización de wellness
        // se llevaría por delante lo que la app haya escrito en la fila del día.
        //
        // A-3: y lo mismo, con más motivo, para lo que escribió el SERVIDOR. Si la fila lleva
        // `readinessSource === 'whoop'`, todas las claves de WHOOP se conservan tal cual y la
        // versión de intervals.icu se descarta: llega horas tarde, sin fases de sueño ni SpO2.
        let prev = null;
        if (typeof dbGet === 'function') {
          try { prev = await dbGet('wellness', r.id); } catch { /* fila nueva */ }
        }
        if (prev) {
          if (prev.subjective) compact.subjective = prev.subjective;
          const whoopOwns = prev.readinessSource === 'whoop';
          for (const k of Object.keys(prev)) {
            if (k === '_updated_at' || k === 'ts') continue;
            const v = prev[k];
            if (v === null || v === undefined) continue;
            // Las claves de contabilidad de WHOOP (`whoop*`) no las escribe nadie más: se
            // conservan siempre. Las fisiológicas, sólo cuando la fila es suya — y sólo las que
            // el servidor realmente escribió: donde WHOOP no dio nada, el valor de intervals.icu
            // sigue siendo mejor que un hueco.
            if (/^whoop/.test(k)) { compact[k] = v; continue; }
            if (whoopOwns && _whoopIsOwnedKey(k)) compact[k] = v;
          }
          if (!whoopOwns && prev.readinessSource && compact.readiness == null) {
            compact.readinessSource = prev.readinessSource;
          }
        }

        // Only write if there's at least one signal beyond the metadata (date + source)
        const signalCount = Object.keys(compact).length - 2;
        if (signalCount > 0) {
          if (prev && _whoopRowsEqual(compact, prev)) {
            // Idéntica a la guardada: no se escribe. Un `smartPut` aquí encolaría una fila sin
            // un solo dato nuevo y movería `updated_at` en Supabase en cada render.
          } else {
            compact.ts = Date.now();
            await smartPut('wellness', compact);
            wellnessWrites++;
          }
        }
      }
    } catch (e) { console.warn('[wellness] wellness upsert failed for', r.id, e); }
  }

  if (weightWrites || stepsWrites || wellnessWrites) {
    console.info(`[wellness] sync: ${wellnessWrites} wellness rows, ${weightWrites} weight, ${stepsWrites} steps`);
  }

  return {
    synced: true,
    syncDate: _whoopLocalDateStr(),
    source: 'intervals.icu',
    rows: rows.length,
    bodyWeight: latestWeight,
  };
}

// ==================== EL DATO DE HOY (§B.2.b, reescrito en A-3) ====================
// Dos fuentes con roles distintos, no una principal y una de repuesto:
//   · intervals.icu = HISTÓRICO. A la mañana está completo hasta ayer, que es justo lo que
//     necesitan las tendencias 7d/28d. Tarda horas en reflejar el readiness del día.
//   · WHOOP por servidor = EL DATO DE HOY. Llega solo por webhook; y si no ha llegado y la
//     integración está activa, se pide "sincroniza ahora" como mucho una vez cada 10 min.
// Si el dato de hoy no está, el sistema lo DICE (`todaySource:'missing'` + motivo); no rellena
// el hueco con el de ayer (F-6).
const WHOOP_CACHE_MS = 10 * 60 * 1000;
let _whoopCache = null;         // { ts, data } — en memoria, no en localStorage
let _whoopServerSyncAt = 0;     // último `integrationsSync('whoop')` disparado desde aquí

/** Fuerza que la próxima llamada rehaga el payload y vuelva a pedir el dato de hoy. */
function whoopResetCache() {
  _whoopCache = null;
  _whoopServerSyncAt = 0;
}

// La llama `integrationsSync('whoop')` cuando el servidor acaba de traer datos: invalida el
// payload (para que la siguiente pintada lea las filas nuevas) y CONSUME la ventana de 10 min,
// para que el render siguiente no dispare una segunda sincronización idéntica.
function whoopNoteServerSync() {
  _whoopCache = null;
  _whoopServerSyncAt = Date.now();
}

async function _whoopTodayIsFromWhoop(todayStr) {
  try {
    if (typeof dbGet !== 'function') return false;
    const row = await dbGet('wellness', todayStr);
    return !!(row && row.readiness != null && row.readinessSource === 'whoop');
  } catch (e) { return false; }
}

// Por qué falta el dato de hoy, en castellano y distinguiendo los tres casos reales, ahora
// leídos de `integration_status` (la verdad del servidor) y no de una bandera local. Decir "aún
// no puntuó" cuando en realidad hay que reconectar sería mentir.
async function _whoopTodayMissingReason() {
  let st = null;
  try {
    if (typeof integrationsGetStatus === 'function') st = await integrationsGetStatus();
  } catch (e) { /* sin red: se decide con lo que haya */ }
  const w = st && st.whoop;
  if (w && w.status === 'needs_reconnect') return 'WHOOP needs reconnecting in Settings';
  if (!w || w.status !== 'active') return 'WHOOP not connected';
  return "WHOOP hasn't scored the night yet";
}

function _whoopMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v));
  return isNaN(t) ? null : t;
}

// Construye `recovery[]` y `sleep[]` desde los últimos 7 días del store `wellness`. Una sola
// fuente de verdad: da igual quién escribió la fila, la app lee siempre de aquí.
async function _whoopBuildFromWellness(todayStr, intervalsResult) {
  let all = [];
  try { if (typeof dbGetAll === 'function') all = (await dbGetAll('wellness')) || []; }
  catch (e) { console.warn('[wellness] lectura local:', e); }

  const from = _whoopLocalDateStr(new Date(Date.now() - 6 * 86400000));
  const rows = all
    .filter(r => r && r.date && r.date >= from && r.date <= todayStr)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const recovery = [];
  const sleep = [];
  let bodyWeight = (intervalsResult && intervalsResult.bodyWeight != null) ? intervalsResult.bodyWeight : null;

  for (const r of rows) {
    const direct = r.readinessSource === 'whoop';
    const fetchedAt = direct ? _whoopMs(r.whoopSyncedAt) : null;
    if (r.readiness != null || r.hrv != null || r.restingHR != null) {
      recovery.push({
        date: r.date,
        score: r.readiness != null ? Math.round(r.readiness) : null,
        hrv: r.hrv != null ? Number(r.hrv) : null,
        restingHR: r.restingHR != null ? Number(r.restingHR) : null,
        spo2: r.spO2 != null ? Number(r.spO2) : null,
        skinTemp: r.skinTemp != null ? Number(r.skinTemp) : null,
        source: direct ? 'whoop-direct' : 'intervals',
        fetchedAt,
      });
    }
    if (r.sleepSecs != null && r.sleepSecs > 0) {
      sleep.push({
        date: r.date,
        durationHrs: Math.round(Number(r.sleepSecs) / 3600 * 10) / 10,
        qualityPct: r.sleepScore != null ? Math.round(r.sleepScore) : null,
        remMs: r.sleepRemSecs != null ? Math.round(Number(r.sleepRemSecs) * 1000) : 0,
        deepMs: r.sleepDeepSecs != null ? Math.round(Number(r.sleepDeepSecs) * 1000) : 0,
        source: direct ? 'whoop-direct' : 'intervals',
      });
    }
    if (bodyWeight == null && r.weightMeasured != null) bodyWeight = Number(r.weightMeasured);
  }

  const data = {
    synced: true,
    syncDate: todayStr,
    source: 'wellness',
    recovery,
    sleep,
    bodyWeight,
  };

  // El dato de hoy es de HOY, o no hay dato (F-6). Nunca se hereda el de ayer.
  const todayRec = recovery.find(r => r && r.date === todayStr && r.score != null) || null;
  if (todayRec) {
    data.todaySource = todayRec.source === 'whoop-direct' ? 'whoop-direct' : 'intervals';
    data.todayFetchedAt = todayRec.fetchedAt || null;
  } else {
    data.todaySource = 'missing';
    data.todayMissingReason = await _whoopTodayMissingReason();
  }
  return data;
}

// ==================== SYNC DATA ====================
// Conserva su forma de retorno (la consumen `renderWhoopRecoveryCard`, `getWhoopContext`,
// `runFullSync` e `init`): `{synced, syncDate, source, recovery[], sleep[], bodyWeight,
// todaySource, todayMissingReason, todayFetchedAt}`.
async function whoopSyncData() {
  if (!whoopIsConnected()) {
    // Puede que el estado de las integraciones aún no se haya leído nunca (la caché se llena en
    // `init()`, pero de forma asíncrona). Se prima una vez antes de dar la conexión por muerta.
    try { if (typeof integrationsGetStatus === 'function') await integrationsGetStatus(); } catch (e) {}
    if (!whoopIsConnected()) return null;
  }
  const todayStr = _whoopLocalDateStr();

  // Caché de 10 min que NO puede tapar la falta del dato de hoy: si el payload guardado no trae
  // hoy y la ventana para volver a pedírselo al servidor ya venció, se rehace igualmente.
  if (_whoopCache && _whoopCache.data && (Date.now() - _whoopCache.ts) < WHOOP_CACHE_MS) {
    const hasToday = Array.isArray(_whoopCache.data.recovery)
      && _whoopCache.data.recovery.some(r => r && r.date === todayStr && r.score != null);
    if (hasToday || (Date.now() - _whoopServerSyncAt) < WHOOP_CACHE_MS) return _whoopCache.data;
  }

  // 1. Lo que el servidor ya escribió (webhook de WHOOP + cron). Sin OAuth y sin tokens aquí.
  try { if (typeof pullStore === 'function') await pullStore('wellness'); }
  catch (e) { console.warn('[wellness] pull de wellness:', e); }

  // 2. El histórico de intervals.icu. Respeta las claves de WHOOP (ver WHOOP_OWNED_KEYS).
  let intervalsResult = null;
  try { intervalsResult = await intervalsFetchWellness(); }
  catch (e) { console.warn('[wellness] intervals.icu:', e); }

  // 3. ¿Falta el readiness de HOY con origen WHOOP? Que lo traiga el servidor — como mucho una
  //    vez cada 10 min, y sólo si la integración está activa (si hay que reconectar, pedirlo
  //    sería quemar una llamada para recibir el mismo `needs_reconnect`).
  let whoopActive = false;
  try {
    if (typeof integrationsGetStatus === 'function') await integrationsGetStatus();
    whoopActive = (typeof integrationsIsActive === 'function') && integrationsIsActive('whoop');
  } catch (e) { /* estado desconocido → no se pide nada */ }

  const faltaHoy = !(await _whoopTodayIsFromWhoop(todayStr));
  if (faltaHoy) {
    // La marca se pone SIEMPRE, haya o no a quién pedírselo, y ANTES del await: sin ella, un día
    // sin dato de WHOOP haría que cada render rehiciera el fetch a intervals.icu, y dos renders
    // simultáneos pedirían dos veces lo mismo al servidor.
    _whoopServerSyncAt = Date.now();
    if (whoopActive) {
      try {
        if (typeof integrationsSync === 'function') await integrationsSync('whoop', { days: 2 });
      } catch (e) { console.warn('[wellness] whoop-sync:', e); }
    }
  }

  // 4. El payload se construye SIEMPRE desde IndexedDB: una sola fuente de verdad.
  const data = await _whoopBuildFromWellness(todayStr, intervalsResult);
  _whoopCache = { ts: Date.now(), data };
  return data;
}

// ==================== WHOOP RECOVERY CARD ====================
function getRecoveryColor(score) {
  if (score >= 67) return { color: '#68e371', label: 'Green' };
  if (score >= 34) return { color: '#fdd506', label: 'Yellow' };
  return { color: '#ee343b', label: 'Red' };
}

// "hoy" / "ayer" / "hace 3 días" para una fecha YYYY-MM-DD, en local. La regla del proyecto:
// un dato que no es de hoy se pinta CON SU FECHA, nunca como si fuera de hoy (F-6).
function whoopDayLabel(dateStrIn, todayStr) {
  if (!dateStrIn) return '';
  const t = todayStr || _whoopLocalDateStr();
  if (dateStrIn === t) return 'today';
  const a = new Date(dateStrIn + 'T12:00:00');
  const b = new Date(t + 'T12:00:00');
  const days = Math.round((b - a) / 86400000);
  if (days === 1) return 'yesterday';
  if (days > 1) return `${days} days ago`;
  return dateStrIn;
}

// "07:42" local desde un timestamp (la hora a la que WHOOP dio el dato).
function whoopClock(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function renderWhoopRecoveryCard() {
  const container = document.getElementById('whoop-recovery');
  if (!container || !whoopIsConnected()) {
    if (container) container.classList.add('hidden');
    return;
  }

  const data = await whoopSyncData();
  if (!data || data.recovery.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:16px">WHOOP connected but no recovery data yet. Try "Sync now" in Settings › Integrations.</div>';
    container.classList.remove('hidden');
    return;
  }

  container.classList.remove('hidden');

  // El número grande: el de HOY si existe, y si no el último disponible pero ETIQUETADO con su
  // día (F-6). Antes cogía `recovery[length - 1]` y lo pintaba como si fuera de hoy.
  const _today = _whoopLocalDateStr();
  const todayRec = data.recovery.find(r => r && r.date === _today && r.score != null) || null;
  // Para el respaldo se coge el último día CON score: una fila de intervals con HRV pero sin
  // readiness pintaría el anillo en rojo al 0 %.
  const _scored = data.recovery.filter(r => r && r.score != null);
  const latest = todayRec || _scored[_scored.length - 1] || data.recovery[data.recovery.length - 1];
  const score = latest.score;
  const { color, label } = getRecoveryColor(score);
  const whenTxt = (() => {
    const when = whoopDayLabel(latest.date, _today);
    if (latest.date !== _today) return when;
    const hhmm = latest.source === 'whoop-direct' ? whoopClock(latest.fetchedAt || data.todayFetchedAt) : '';
    return hhmm ? `today · WHOOP ${hhmm}` : 'today';
  })();
  const missingTxt = (!todayRec && data.todayMissingReason) ? `No data for today: ${data.todayMissingReason}` : '';

  // Sueño del mismo día que el score que se está pintando (no "el último que haya").
  const latestSleep = (latest.date && data.sleep.find(s => s && s.date === latest.date))
    || (data.sleep.length > 0 ? data.sleep[data.sleep.length - 1] : null);

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

  // Sleep breakdown — only shown when stage data is available (WHOOP direct writes the stages;
  // intervals.icu wellness doesn't surface REM/deep, so there the breakdown is hidden).
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
          <span class="whoop-when" style="font-size:11px;color:var(--text3)">${whenTxt}</span>
        </div>
        ${missingTxt ? `<div class="whoop-when-missing" style="font-size:11px;color:var(--text3);margin:2px 0 4px">${missingTxt}</div>` : ''}
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
window.whoopResetCache = whoopResetCache;
window.whoopNoteServerSync = whoopNoteServerSync;
window.renderWhoopRecoveryCard = renderWhoopRecoveryCard;
window.whoopDayLabel = whoopDayLabel;
window.whoopClock = whoopClock;
window.intervalsFetchWellness = intervalsFetchWellness;

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    whoopIsConnected, whoopSyncData, whoopResetCache, whoopNoteServerSync, intervalsFetchWellness,
    getRecoveryColor, whoopDayLabel, whoopClock, renderWhoopRecoveryCard,
    WHOOP_OWNED_KEYS, _whoopLocalDateStr, _whoopRowsEqual,
  };
}
