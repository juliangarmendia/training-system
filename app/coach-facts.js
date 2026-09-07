// ============================================================
// Coach v2 — facts pack, validador y diff de planes (app/coach-facts.js)
// ============================================================
//
// QUÉ ES. La mitad determinista del coach semanal. `buildCoachFacts()` convierte los stores
// de IndexedDB en un documento de HECHOS ya calculados (tendencias, e1RM, pendiente de peso,
// cumplimiento Z2, baselines HRV/RHR, adherencia, huecos de datos) que el LLM sólo tiene que
// leer y juzgar. `validatePlanVersion()` audita la propuesta que vuelve. Ninguna de las dos
// toca DOM, IndexedDB, red ni `localStorage`: entra dato, sale dato.
//
// POR QUÉ EXISTE (docs/architecture/coach-v2-implementation-plan.md §Principios 1). El
// playbook actual del cron le pide aritmética al modelo sobre filas crudas y falla de las
// tres maneras que el audit del 2026-09-05 documentó:
//   · F-2  confunde `rampRate` (ΔCTL/semana, rango real ±2) con la forma (`ctl − atl`), así
//          que sus cuatro umbrales de TSB no pueden dispararse jamás. Aquí `form` se calcula
//          y se etiqueta.
//   · F-3  trata CTL/ATL como carga TOTAL cuando sólo ven el cardio (CTL medio 2,4 en alguien
//          que hace 4 sesiones de fuerza por semana). Aquí van con su nota "sólo cardio" y al
//          lado va una carga interna propia que sí suma la fuerza.
//   · F-10 lee `runs` sin dedupear en 23 sitios: el día que Strava se reconecte, los km se
//          duplican en silencio. Aquí las carreras entran por `deps.dedupeRuns`, siempre.
//   · F-12 juzga la disponibilidad energética intradía (a las 9:00 siempre "crítica"). Aquí
//          la EA sólo se calcula sobre días CERRADOS (`date < todayStr`).
//
// Y la regla que gobierna todo lo demás: **no se inventa un número**. Cuando el dato no está,
// el campo va a `null` y el hueco se declara en `dataGaps` con una frase que el modelo tiene
// obligación de repetir. Un pack que rellena huecos con supuestos produce un coach que suena
// seguro y está adivinando.
//
// SE CARGA DESPUÉS DE `coach-engine.js` y antes de `app.js` (index.html), y entra en el
// `APP_SHELL` del service worker. `isoWeekKey`/`mondayOf` se usan como globales del motor:
// dos aritméticas de semana ISO en el mismo repo es cómo la frontera domingo/lunes acaba
// contradiciéndose. El espejo local de más abajo sólo actúa si el motor no cargó.
//
// Lo que NO hace este fichero: leer stores (los recibe en `input.stores`), conocer helpers de
// `app.js` (los recibe en `deps`), escribir nada, ni decidir. Decide el modelo; aprueba Julian.

// ==================== UTILIDADES ====================
//
// Aritmética de fechas en UTC a propósito, igual que `nutShiftDate` y `isoWeekKey`: la app ya
// pagó una migración por fechas desplazadas (`tz_date_migration_v2`) y aquí un día de
// desplazamiento mueve la frontera domingo/lunes, o sea la semana ISO entera.

/** Timestamp UTC de medianoche de 'YYYY-MM-DD', o null si no es una fecha. */
function _cfMs(dateStr) {
  const s = String(dateStr == null ? '' : dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return isFinite(t) ? t : null;
}

/** 'YYYY-MM-DD' desde un timestamp UTC. */
function _cfDay(ms) {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

/** Los 10 primeros caracteres de una fecha, o null si no es una fecha. */
function _cfDate(v) {
  const s = String(v == null ? '' : v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** 'YYYY-MM-DD' + n días. */
function _cfShift(dateStr, n) {
  const t = _cfMs(dateStr);
  return t == null ? null : _cfDay(t + Math.round(Number(n) || 0) * 86400000);
}

/** Días enteros de `a` a `b` (b − a). null si falta cualquiera. */
function _cfDiff(a, b) {
  const ta = _cfMs(a), tb = _cfMs(b);
  if (ta == null || tb == null) return null;
  return Math.round((tb - ta) / 86400000);
}

/** Día de la semana JS (0 = domingo) de una fecha, en UTC. */
function _cfDow(dateStr) {
  const t = _cfMs(dateStr);
  return t == null ? null : new Date(t).getUTCDay();
}

// Semana ISO y lunes ISO: los del motor. El espejo local es un seguro para el caso en que
// `coach-engine.js` no haya cargado (un test que cargue sólo este fichero, un orden de
// scripts roto). No es una segunda implementación de referencia: si divergen, manda el motor.
function _cfIsoWeek(dateStr) {
  if (typeof isoWeekKey === 'function') return isoWeekKey(dateStr);
  const t = _cfMs(dateStr);
  if (t == null) return null;
  const dow = new Date(t).getUTCDay() || 7;
  const monday = t - (dow - 1) * 86400000;
  const isoYear = new Date(monday + 3 * 86400000).getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const w1 = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * 86400000;
  return `${isoYear}-W${String(Math.round((monday - w1) / 604800000) + 1).padStart(2, '0')}`;
}

function _cfMonday(dateStr) {
  if (typeof mondayOf === 'function') return mondayOf(dateStr);
  const t = _cfMs(dateStr);
  if (t == null) return null;
  const dow = new Date(t).getUTCDay() || 7;
  return _cfDay(t - (dow - 1) * 86400000);
}

/** Número finito, o null. Nunca NaN: un NaN en el pack es un número inventado con otro nombre. */
function _n(v) {
  if (v == null || v === '') return null;
  const x = Number(v);
  return isFinite(x) ? x : null;
}

/** Redondeo al paso indicado (0,5 kg, 0,1 km, 1 min…). null pasa como null. */
function _round(v, step) {
  const x = _n(v);
  if (x == null) return null;
  const s = Number(step) > 0 ? Number(step) : 1;
  const r = Math.round(x / s) * s;
  // El *1e6 evita que 0,1+0,2 devuelva 0,30000000000000004 en el JSON.
  return Math.round(r * 1e6) / 1e6;
}

// Redondeos del pack (§A.4). Cargas y e1RM a 0,5 kg porque el gimnasio va de 1,25 en 1,25 y
// media placa es la resolución de una decisión. El PESO CORPORAL y la FFM van a 0,1 kg: a 0,5
// kg la pendiente de un cut (~0,45 kg/semana) desaparecería dentro del redondeo. Y las
// pendientes en sí a 0,01 kg/semana, que es la magnitud con la que se pilota el déficit.
const _rKg = (v) => _round(v, 0.5);        // cargas, e1RM
const _rBw = (v) => _round(v, 0.1);        // peso corporal, FFM, cintura
const _rSlope = (v) => _round(v, 0.01);    // kg/semana
const _rKm = (v) => _round(v, 0.1);
const _rMin = (v) => _round(v, 1);
const _rPct = (v) => _round(v, 1);
const _rMs = (v) => _round(v, 1);          // milisegundos (HRV, latencias)
const _rHrs = (v) => _round(v, 0.1);

function _mean(arr) {
  const v = (arr || []).map(_n).filter(x => x != null);
  if (!v.length) return null;
  return v.reduce((a, b) => a + b, 0) / v.length;
}

function _sum(arr) {
  const v = (arr || []).map(_n).filter(x => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : 0;
}

/** Recorta un texto a n caracteres con elipsis. Los extractos del coach no pueden crecer sin techo. */
function _trunc(s, n) {
  const t = String(s == null ? '' : s).trim();
  if (!t) return null;
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

/** "MM:SS" → minutos decimales (mismo cálculo que `durationToMinutes` en app.js). */
function _durMin(v) {
  if (v == null || v === '') return null;
  const x = Number(v);
  if (isFinite(x)) return x;                      // ya venía en minutos
  const parts = String(v).split(':').map(p => parseInt(p, 10) || 0);
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  return parts[0] * 60 + parts[1] + parts[2] / 60;  // "H:MM:SS"
}

/** "5:30" → 330 segundos por km. */
function _paceSec(v) {
  if (v == null || v === '') return null;
  const parts = String(v).split(':').map(p => parseInt(p, 10));
  if (parts.length !== 2 || !isFinite(parts[0]) || !isFinite(parts[1])) return null;
  return parts[0] * 60 + parts[1];
}

/** 330 → "5:30". */
function _fmtPace(sec) {
  const s = _n(sec);
  if (s == null || s <= 0) return null;
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s - m * 60)).padStart(2, '0')}`;
}

/**
 * Pasada final de saneado: `undefined`, `NaN` e `Infinity` → `null`.
 *
 * No es paranoia decorativa. `JSON.stringify` convierte NaN en `null` sin avisar, así que un
 * NaN nacido de un `0/0` viaja al modelo disfrazado de "sin dato" y la respuesta lo cita como
 * si fuera un hecho. Mejor que sea `null` de verdad, y que el test lo pueda comprobar sobre
 * el objeto y no sobre el string.
 */
function _sanitize(v) {
  if (v === undefined) return null;
  if (v === null) return null;
  const t = typeof v;
  if (t === 'number') return isFinite(v) ? v : null;
  if (t === 'function') return null;
  if (Array.isArray(v)) return v.map(_sanitize);
  if (t === 'object') {
    const out = {};
    for (const k of Object.keys(v)) {
      if (typeof v[k] === 'function') continue;
      out[k] = _sanitize(v[k]);
    }
    return out;
  }
  return v;
}

/**
 * Serialización determinista: claves ordenadas, arrays en su orden.
 *
 * EL FALLO QUE IMPIDE: `factsHash` es la clave de idempotencia de la edge function ("si ya
 * existe una fila con este hash, devuelve la cacheada"). Con `JSON.stringify` el hash depende
 * del orden en que se construyó el objeto, así que dos packs con los MISMOS hechos producirían
 * hashes distintos y cada apertura de la app pagaría otra revisión de $0,50-0,70.
 */
function stableStringify(value) {
  return _ss(value);
}

function _ss(v) {
  if (v === null || v === undefined) return 'null';
  const t = typeof v;
  if (t === 'number') return isFinite(v) ? JSON.stringify(v) : 'null';
  if (t === 'boolean') return v ? 'true' : 'false';
  if (t === 'string') return JSON.stringify(v);
  if (t === 'function') return 'null';
  if (v instanceof Date) return JSON.stringify(isFinite(v.getTime()) ? v.toISOString() : null);
  if (Array.isArray(v)) return '[' + v.map(_ss).join(',') + ']';
  const keys = Object.keys(v).filter(k => typeof v[k] !== 'function' && typeof v[k] !== 'undefined').sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + _ss(v[k])).join(',') + '}';
}

// ==================== CONSTANTES DEL PACK ====================

const FACTS_SCHEMA = 1;                 // versión del esquema del pack (viaja en `meta`)
const FACTS_WEEKS = 4;                  // ventana de semanas ISO (§A.4)
const FACTS_LONG_WINDOW_DAYS = 28;      // ventana larga para baselines y nutrición
const FACTS_MAX_LIFT_SESSIONS = 4;      // ≤4 sesiones por ejercicio
const FACTS_MAX_RUNS = 10;              // ≤10 carreras
const FACTS_MAX_REVIEWS = 3;            // ≤3 revisiones previas
const FACTS_MAX_DECISIONS = 30;         // ≤30 decisiones
const FACTS_MAX_ANOMALIES = 5;
const FACTS_EXCERPT_CHARS = 1200;       // extracto de una revisión previa
const FACTS_NOTE_CHARS = 240;

// Techo de Z2. 143 bpm es el número que el sistema viene usando; se DECLARA como tal cuando
// no hay zonas de intervals.icu, porque no es una medida: es una convención heredada.
const FACTS_Z2_CEILING_DEFAULT = 143;
// Tolerancia de la comparación: una FC media de 144 en una carrera de 45' no es "haber fallado
// la Z2", es ruido del sensor y del semáforo. El umbral sin tolerancia convierte cualquier
// carrera en un incumplimiento y la señal se vuelve inútil.
const FACTS_Z2_TOLERANCE = 2;

// Gates de suficiencia de datos (§C.2 paso 1). Por debajo de estos números el pack no calla
// el dato: lo publica y añade la frase a `dataGaps`.
const FACTS_MIN_WORKOUTS = 8;
const FACTS_MIN_WELLNESS_DAYS_7 = 5;
const FACTS_MIN_NUTRITION_DAYS_28 = 14;
const FACTS_MIN_NUTRITION_DAYS_14 = 10;
const FACTS_MIN_MEASURED_WEIGHTS = 7;
const FACTS_MIN_MEASURED_WEIGHTS_7 = 4;
const FACTS_STALE_DAYS = 2;             // >2 días sin dato de una fuente → "dato viejo"
const FACTS_PAUSE_DAYS = 21;            // reentrada (LOAD-004)
const FACTS_SLEEP_FLOOR_SECS = 23400;   // 6,5 h
const FACTS_SLEEP_SHORT_SECS = 21600;   // 6 h

// Semáforo de readiness: los mismos cortes que la app pinta en Home (67/34).
const FACTS_GREEN = 67;
const FACTS_YELLOW = 34;

// Deload / diet break: la semana de descarga y los 5 días siguientes NO cuentan para la
// pendiente de peso (C.1: "esa semana + 5 días no cuentan"). El agua del refeed es un cambio
// de peso que no es un cambio de grasa, y meterlo en la regresión hace que el piloto del
// déficit recorte calorías justo después de un diet break.
const FACTS_DELOAD_WASHOUT_DAYS = 5;

// Tendencia por e1RM: ±2 % sobre 4 sesiones. Por debajo de eso es la fórmula de Epley
// respondiendo a una rep de diferencia, no la fuerza moviéndose.
const FACTS_TREND_PCT = 2;

// Patrones de EMPUJE, para contar exposiciones de press por semana (STR-002). El dato bueno
// es `exercisesLibrary[id].movementPattern`; la lista de ids es el fallback para cuando la
// librería no viaja en el pack.
const FACTS_PRESS_PATTERNS = { 'horizontal-press': 1, 'vertical-press': 1 };
const FACTS_PRESS_IDS = {
  'bench-press': 1, 'incline-db-press': 1, 'incline-press': 1, 'db-bench': 1,
  'machine-chest-press': 1, 'hammer-chest-press': 1, 'pec-deck': 1, 'cable-fly': 1,
  'cable-crossover': 1, 'floor-press': 1, 'close-grip-bench': 1, 'dips': 1, 'pushup': 1,
  'ohp': 1, 'db-shoulder-press': 1, 'machine-shoulder-press': 1, 'arnold-press': 1,
  'pike-pushup': 1, 'landmine-press': 1,
};

// Pesos de presupuesto por subtipo de cardio. Espejo de `SESSION_TYPES` (app.js): se usa sólo
// cuando el llamador no pasa `deps.toSession`, que es la fuente buena.
const FACTS_CARDIO_BW = {
  zone2: 0.5, recovery: 0, zone3: 1, long_easy: 1, threshold: 2, intervals: 2,
};
const FACTS_HARD_SUBTYPES = { threshold: 1, intervals: 1, benchmark: 1, strength_endurance: 1 };

// ==================== FACTS PACK ====================

/**
 * Construye el documento de hechos para la revisión semanal del coach.
 *
 * @param {object} input
 *   `todayStr`      'YYYY-MM-DD' — el hoy del llamador (pureza: aquí no se llama a Date.now).
 *   `weekKey`       '2026-W37'; si falta se deriva de `todayStr`.
 *   `generatedAt`   ISO string opcional, sólo para `meta`.
 *   `appVersion`    'v11.61' · `seedRev` PLAN_REV.
 *   `block`         salida de `blockWeekFromDates()`.
 *   `legacyLatest`  el `latest.json` de W36, si es la primera revisión (entra en priorReviews).
 *   `stores`        { workouts, runs, sessions, mobility, wellness, steps, bodyweight,
 *                     nutrition, decisions, coachReviews,
 *                     settings: { userSettings, exerciseOverrides, weekSchedule },
 *                     activePlan, exercisesLibrary }
 * @param {object} deps
 *   `convertWeight(v, from, to)` · `estimate1RM(kg, reps)` · `measureUnitFor(exId)`
 *   `dedupeRuns(runs)` · `dedupeSessions(sessions)`
 *   `toSession(record, store)` (opcional) · `nutRollingWeight(rows, date, win)` (opcional)
 *   `weeklyDeficits(days)` (opcional) · `z2Ceiling` (número, 143 por defecto)
 * @returns {object} facts (ver docs/architecture/coach-facts-schema.md)
 */
function buildCoachFacts(input, deps) {
  const inp = input || {};
  const d = _mkDeps(deps);
  const st = inp.stores || {};
  // El "hoy" lo pone el llamador (`today()` en app.js, en local). El `new Date()` es el único
  // punto no determinista del fichero y es un salvavidas: si el wrapper olvida `todayStr`, el
  // pack sale con la fecha UTC de hoy en vez de vacío. Los tests siempre lo pasan.
  const todayStr = _cfDate(inp.todayStr) || _cfDate(new Date().toISOString());
  const weekKey = inp.weekKey || _cfIsoWeek(todayStr);
  const gaps = [];

  // Ventana canónica: 4 semanas ISO que terminan en la semana en curso.
  const mondayNow = _cfMonday(todayStr);
  const weeks = [];
  for (let i = FACTS_WEEKS - 1; i >= 0; i--) {
    const mon = _cfShift(mondayNow, -7 * i);
    weeks.push({ weekKey: _cfIsoWeek(mon), monday: mon, sunday: _cfShift(mon, 6) });
  }
  const from4w = weeks[0].monday;
  const from28 = _cfShift(todayStr, -(FACTS_LONG_WINDOW_DAYS - 1));

  const ctx = {
    inp, d, st, todayStr, weekKey, weeks, from4w, from28, gaps,
    settings: (st.settings && st.settings.userSettings) || {},
    plan: st.activePlan || null,
    library: _libraryMap(st.exercisesLibrary),
    // Las carreras y las sesiones entran DEDUPEADAS siempre (F-10). Una carrera de COROS que
    // llega por Strava y por intervals.icu son dos filas del mismo esfuerzo.
    runs: _byDateDesc(d.dedupeRuns(st.runs || [])),
    sessions: _byDateDesc(d.dedupeSessions(st.sessions || [])),
    workouts: _byDateDesc(st.workouts || []),
    wellness: _byDateDesc(st.wellness || []),
    bodyweight: _byDateDesc(st.bodyweight || []),
    nutrition: _byDateDesc(st.nutrition || []),
    steps: _byDateDesc(st.steps || []),
    mobility: _byDateDesc(st.mobility || []),
    decisions: (st.decisions || []).slice().sort((a, b) => (_n(b.ts) || 0) - (_n(a.ts) || 0) || String(b.date || '').localeCompare(String(a.date || ''))),
  };
  ctx.z2Ceiling = _z2Ceiling(ctx, d, gaps);

  const facts = {
    meta: _factsMeta(ctx),
    goals: _factsGoals(ctx),
    progress: _factsProgress(ctx),
    block: _factsBlock(ctx),
    plan: _factsPlan(ctx),
    adherence: _factsAdherence(ctx),
    lifts: _factsLifts(ctx),
    skipped: _factsSkipped(ctx),
    cardio: _factsCardio(ctx),
    readiness: _factsReadiness(ctx),
    nutrition: _factsNutrition(ctx),
    steps: _factsSteps(ctx),
    mobility: _factsMobility(ctx),
    decisions: _factsDecisions(ctx),
    priorReviews: _factsPriorReviews(ctx),
    staleness: _factsStaleness(ctx),
  };
  facts.dataGaps = _factsGaps(ctx, facts);
  facts.confidence = _factsConfidence(ctx, facts);
  return _sanitize(facts);
}

/** Deps con valores por defecto honestos: si falta un helper, se degrada, no se adivina. */
function _mkDeps(deps) {
  const p = deps || {};
  return {
    // Sin `convertWeight` los kg de una sesión en lb entrarían como kg. Mejor identidad
    // explícita que una conversión inventada: el gap se declara desde `lifts`.
    convertWeight: typeof p.convertWeight === 'function' ? p.convertWeight : (v) => v,
    estimate1RM: typeof p.estimate1RM === 'function' ? p.estimate1RM : () => null,
    measureUnitFor: typeof p.measureUnitFor === 'function' ? p.measureUnitFor : () => null,
    dedupeRuns: typeof p.dedupeRuns === 'function' ? p.dedupeRuns : (r) => (r || []).slice(),
    dedupeSessions: typeof p.dedupeSessions === 'function' ? p.dedupeSessions : (s) => (s || []).slice(),
    toSession: typeof p.toSession === 'function' ? p.toSession : null,
    nutRollingWeight: typeof p.nutRollingWeight === 'function' ? p.nutRollingWeight : null,
    weeklyDeficits: typeof p.weeklyDeficits === 'function' ? p.weeklyDeficits : null,
    z2Ceiling: _n(p.z2Ceiling),
    hasConvert: typeof p.convertWeight === 'function',
  };
}

function _byDateDesc(rows) {
  return (rows || [])
    .filter(r => r && _cfDate(r.date))
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

function _libraryMap(lib) {
  const map = {};
  if (!lib) return map;
  const list = Array.isArray(lib) ? lib : Object.values(lib);
  for (const ex of list) if (ex && ex.id) map[ex.id] = ex;
  return map;
}

function _inWindow(dateStr, from, to) {
  const s = _cfDate(dateStr);
  return !!s && s >= from && s <= to;
}

/** Techo de Z2: de `icuZones` si las hay, declarado si no. */
function _z2Ceiling(ctx, d, gaps) {
  const z = ctx.settings && ctx.settings.icuZones;
  const band = z && z.z && (z.z.zone2 || z.z.long_easy);
  if (Array.isArray(band) && band.length === 2 && _n(band[1]) != null) {
    return { bpm: _rMin(band[1]), source: 'icuZones', lthr: _n(z.lthr), maxHr: _n(z.maxHr) };
  }
  gaps.push(`Sin zonas de FC de intervals.icu (\`icuZones\`): el techo de Z2 usado es ${d.z2Ceiling != null ? d.z2Ceiling : FACTS_Z2_CEILING_DEFAULT} bpm DECLARADO, no medido.`);
  return { bpm: d.z2Ceiling != null ? _rMin(d.z2Ceiling) : FACTS_Z2_CEILING_DEFAULT, source: 'declarado', lthr: null, maxHr: null };
}

// ---------- meta ----------

function _factsMeta(ctx) {
  return {
    factsSchema: FACTS_SCHEMA,
    weekKey: ctx.weekKey,
    todayStr: ctx.todayStr,
    generatedAt: ctx.inp.generatedAt || null,
    window: { from: ctx.from4w, to: ctx.todayStr, weeks: ctx.weeks.map(w => w.weekKey) },
    window28: { from: ctx.from28, to: ctx.todayStr },
    appVersion: ctx.inp.appVersion || null,
    seedRev: _n(ctx.inp.seedRev),
    unit: 'kg',
    rounding: { kg: 0.5, bodyweightKg: 0.1, slopeKgWeek: 0.01, km: 0.1, min: 1, pct: 1, ms: 1 },
    caps: {
      liftSessions: FACTS_MAX_LIFT_SESSIONS, runs: FACTS_MAX_RUNS,
      priorReviews: FACTS_MAX_REVIEWS, decisions: FACTS_MAX_DECISIONS,
    },
  };
}

// ---------- goals ----------

function _factsGoals(ctx) {
  const g = ctx.settings && ctx.settings.goals;
  if (!g) {
    ctx.gaps.push('No hay `settings.goals`: los objetivos no están sembrados, así que no hay contra qué medir el progreso.');
    return null;
  }
  return {
    version: _n(g.version),
    source: g.source || null,
    primary: g.primary ? {
      type: g.primary.type || null,
      targetWeightKg: Array.isArray(g.primary.targetWeightKg) ? g.primary.targetWeightKg.map(_rBw) : _rBw(g.primary.targetWeightKg),
      rateKgPerWeek: _rSlope(g.primary.rateKgPerWeek),
      milestoneKg: _rBw(g.primary.milestoneKg),
      milestoneLabel: g.primary.milestoneLabel || null,
      waistCm: _rBw(g.primary.waistCm),
      startWeightKg: _rBw(g.primary.startWeightKg),
      startDate: _cfDate(g.primary.startDate),
    } : null,
    preserve: g.preserve ? {
      ffmKg: _rBw(g.preserve.ffmKg),
      anchorLifts: Array.isArray(g.preserve.anchorLifts) ? g.preserve.anchorLifts.slice() : [],
    } : null,
    secondary: g.secondary || null,
    constraints: g.constraints || null,
    updatedAt: g.updatedAt || null,
  };
}

// ---------- block ----------

function _factsBlock(ctx) {
  const b = ctx.inp.block || {};
  const anchor = _cfDate(ctx.settings.deloadAnchorDate);
  return {
    index: _n(b.index),
    weeksTotal: _n(b.weeksTotal) || (b.index != null ? 5 : null),
    phase: b.label || null,
    isDeload: !!b.isDeload,
    weeksIntoBlock: _n(b.weeksIntoBlock),
    blockStartMonday: _cfDate(b.blockStartMonday),
    deloadMonday: _cfDate(b.deloadMonday),
    deloadAnchorDate: anchor,
    weekNumber: _n(ctx.inp.weekNumber),
  };
}

/**
 * Semanas de descarga que caen dentro de una ventana, y su washout de 5 días.
 * Devuelve intervalos `{from, to, reason}` que la pendiente de peso debe excluir.
 */
function _deloadIntervals(ctx, from, to) {
  const out = [];
  const anchor = _cfDate(ctx.settings.deloadAnchorDate);
  const blockWeeks = _n(ctx.settings.deloadBlockWeeks) || (_n((ctx.inp.block || {}).weeksTotal)) || 5;
  if (!anchor || typeof blockWeekFromDates !== 'function') {
    // Sin ancla no se puede saber qué semana fue descarga: se declara y la ventana queda entera.
    return { intervals: out, known: false };
  }
  let mon = _cfMonday(from);
  const stop = _cfMonday(to);
  let guard = 0;
  while (mon && stop && mon <= stop && guard++ < 60) {
    const blk = blockWeekFromDates(mon, anchor, blockWeeks);
    if (blk && blk.isDeload) {
      out.push({ from: mon, to: _cfShift(mon, 6 + FACTS_DELOAD_WASHOUT_DAYS), reason: 'deload / diet break + 5 días' });
    }
    mon = _cfShift(mon, 7);
  }
  return { intervals: out, known: true };
}

// ---------- progress ----------

function _factsProgress(ctx) {
  return {
    weight: _factsWeight(ctx),
    waist: _factsWaist(ctx),
    running: _factsRunProgress(ctx),
  };
}

/**
 * Peso: media móvil de 7 días y pendientes de 14/28 días, **sólo sobre filas MEDIDAS**.
 *
 * EL FALLO QUE IMPIDE. `bodyweight` y `wellness` guardan dos cosas con el mismo nombre: la
 * pesada real (`measured: true` / `weightMeasured`) y el valor suavizado que intervals.icu
 * arrastra hacia delante cuando no te pesas (`measured: false` / `weight`). Ese forward-fill
 * es una línea recta: mete pendiente 0 en la regresión los días que no hubo báscula y hace
 * que el piloto del déficit lea "el peso no baja" cuando lo que pasó es que no te pesaste.
 */
function _factsWeight(ctx) {
  // Una fila por día, preferiendo la pesada medida. `wellness.weightMeasured` es la misma
  // medida vista desde el otro store: si el store `bodyweight` no la tiene, cuenta igual.
  const byDate = new Map();
  for (const r of ctx.bodyweight) {
    const date = _cfDate(r.date), kg = _n(r.weight);
    if (!date || kg == null || kg <= 0) continue;
    const measured = r.measured === true;
    const prev = byDate.get(date);
    if (!prev || (measured && !prev.measured)) byDate.set(date, { date, kg, measured, source: r.source || 'manual' });
  }
  for (const w of ctx.wellness) {
    const date = _cfDate(w.date), kg = _n(w.weightMeasured);
    if (!date || kg == null || kg <= 0) continue;
    const prev = byDate.get(date);
    if (!prev || !prev.measured) byDate.set(date, { date, kg, measured: true, source: 'intervals.icu' });
  }
  const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const measured = all.filter(r => r.measured);
  const inLast = (rows, days) => rows.filter(r => _cfDiff(r.date, ctx.todayStr) < days && _cfDiff(r.date, ctx.todayStr) >= 0);

  const m7 = inLast(measured, 7), m14 = inLast(measured, 14), m28 = inLast(measured, 28);
  const prev7 = measured.filter(r => {
    const dd = _cfDiff(r.date, ctx.todayStr);
    return dd != null && dd >= 7 && dd < 14;
  });

  const win = _weightValidWindow(ctx, measured);
  const usable = win.ok ? measured : measured.filter(r => !win.excluded.some(x => r.date >= x.from && r.date <= x.to));

  return {
    mean7: _rBw(_mean(m7.map(r => r.kg))),
    mean7Prev: _rBw(_mean(prev7.map(r => r.kg))),
    mean7Delta: _rSlope(_mean(m7.map(r => r.kg)) != null && _mean(prev7.map(r => r.kg)) != null
      ? _mean(m7.map(r => r.kg)) - _mean(prev7.map(r => r.kg)) : null),
    slope14KgPerWeek: _rSlope(_slopePerWeek(inLast(usable, 14))),
    slope28KgPerWeek: _rSlope(_slopePerWeek(inLast(usable, 28))),
    nMeasured7: m7.length,
    nMeasured14: m14.length,
    nMeasured28: m28.length,
    nForwardFilled28: inLast(all, 28).length - m28.length,
    last: all.length ? { date: all[all.length - 1].date, kg: _rBw(all[all.length - 1].kg), measured: all[all.length - 1].measured } : null,
    lastMeasured: measured.length ? { date: measured[measured.length - 1].date, kg: _rBw(measured[measured.length - 1].kg) } : null,
    daysSinceMeasured: measured.length ? _cfDiff(measured[measured.length - 1].date, ctx.todayStr) : null,
    validWindow: win,
    note: 'La media y las pendientes usan SÓLO pesadas medidas (`measured: true` / `weightMeasured`). Los valores suavizados de intervals.icu (forward-fill) quedan fuera: meterían pendiente 0 los días sin báscula.',
  };
}

/** Pendiente por mínimos cuadrados en kg/semana. null con menos de 3 puntos. */
function _slopePerWeek(rows) {
  const pts = (rows || []).map(r => ({ x: _cfMs(r.date) / 86400000, y: r.kg })).filter(p => isFinite(p.x) && isFinite(p.y));
  if (pts.length < 3) return null;
  const mx = _mean(pts.map(p => p.x)), my = _mean(pts.map(p => p.y));
  let num = 0, den = 0;
  for (const p of pts) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) * (p.x - mx); }
  if (den === 0) return null;
  return (num / den) * 7;
}

/**
 * ¿Es esta ventana válida para leer la pendiente? (§C.2 paso 6, C.1 diet break)
 * Gates: ≥10 pesadas de 14 días, ninguna semana de descarga dentro, ≥14 días desde el último
 * ajuste de calorías y no antes de la primera fecha elegible.
 */
function _weightValidWindow(ctx, measured) {
  const reasons = [];
  const dl = _deloadIntervals(ctx, _cfShift(ctx.todayStr, -27), ctx.todayStr);
  const excluded = dl.intervals.filter(iv => iv.to >= _cfShift(ctx.todayStr, -27));
  if (!dl.known) reasons.push('sin `deloadAnchorDate`: no se puede saber qué semanas fueron descarga');
  const n14 = measured.filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < 14; }).length;
  if (n14 < FACTS_MIN_NUTRITION_DAYS_14) reasons.push(`sólo ${n14} pesadas medidas en 14 días (gate: ${FACTS_MIN_NUTRITION_DAYS_14})`);
  if (excluded.length) reasons.push(`la ventana contiene ${excluded.length} semana(s) de descarga / diet break + 5 días`);

  const firstAdjust = _cfDate(ctx.settings.kcalFirstAdjustDate)
    || _cfDate((ctx.settings.goals && ctx.settings.goals.constraints && ctx.settings.goals.constraints.firstAdjustDate));
  const lastAdjust = _cfDate(ctx.settings.kcalLastAdjustDate);
  const daysSinceAdjust = lastAdjust ? _cfDiff(lastAdjust, ctx.todayStr) : null;
  if (firstAdjust && ctx.todayStr < firstAdjust) reasons.push(`antes de la primera fecha de ajuste elegible (${firstAdjust})`);
  if (daysSinceAdjust != null && daysSinceAdjust < 14) reasons.push(`sólo ${daysSinceAdjust} días desde el último ajuste de kcal (gate: 14)`);
  if (!firstAdjust && !lastAdjust) reasons.push('no hay fecha de primer ajuste ni de último ajuste en `settings`: el gate de 14 días no se puede comprobar');

  const nextEligible = lastAdjust ? _cfShift(lastAdjust, 14) : (firstAdjust || null);
  return {
    ok: reasons.length === 0,
    from: _cfShift(ctx.todayStr, -27), to: ctx.todayStr,
    excluded, reasons,
    firstAdjustDate: firstAdjust, lastAdjustDate: lastAdjust,
    daysSinceLastAdjust: daysSinceAdjust, nextEligibleAdjustDate: nextEligible,
  };
}

function _factsWaist(ctx) {
  const rows = ctx.bodyweight
    .filter(r => _n(r.waist) != null && _n(r.waist) > 0)
    .map(r => ({ date: _cfDate(r.date), cm: _rBw(r.waist) }))
    .filter(r => r.date)
    .slice(0, 3);
  if (!rows.length) return { last3: [], delta2w: null, daysSinceLast: null, n: 0 };
  const newest = rows[0];
  const twoWeeksAgo = rows.find(r => { const dd = _cfDiff(r.date, newest.date); return dd != null && dd >= 12; });
  return {
    last3: rows,
    delta2w: twoWeeksAgo ? _rBw(newest.cm - twoWeeksAgo.cm) : null,
    delta2wFrom: twoWeeksAgo ? twoWeeksAgo.date : null,
    daysSinceLast: _cfDiff(newest.date, ctx.todayStr),
    n: rows.length,
  };
}

function _factsRunProgress(ctx) {
  const runs = ctx.runs.filter(r => _inWindow(r.date, ctx.from4w, ctx.todayStr));
  const km = runs.map(r => _n(r.distance)).filter(x => x != null && x > 0);
  const longest = runs.reduce((best, r) => (_n(r.distance) || 0) > (_n(best && best.distance) || 0) ? r : best, null);
  const z2Runs = runs.filter(r => _z2Compliant(r, ctx.z2Ceiling.bpm) === true);
  const paces = z2Runs.map(r => _paceSec(r.avgPace)).filter(x => x != null);
  const perWeek = ctx.weeks.map(w => _rKm(_sum(ctx.runs.filter(r => _inWindow(r.date, w.monday, w.sunday)).map(r => _n(r.distance)))));
  return {
    longRun4wKm: km.length ? _rKm(Math.max(...km)) : null,
    longRun4wDate: longest ? _cfDate(longest.date) : null,
    kmPerWeek: perWeek,
    kmPerWeekMean: _rKm(_mean(perWeek)),
    paceAtZ2: _fmtPace(_mean(paces)),
    nRuns4w: runs.length,
    nZ2Compliant4w: z2Runs.length,
    tenKReadiness: _tenKReadiness(ctx, runs, longest),
  };
}

/**
 * "10k cómodo" (C.1) = 10 km continuos, FC media ≤ techo Z2, deriva de la 2ª mitad <5 bpm,
 * RPE ≤5, sin dolor, RHR del día siguiente ≤ +3. De esos seis criterios el pack puede medir
 * dos y medio, así que el veredicto va con su `basis` y los criterios que no se pueden
 * comprobar van a `null`. Un "listo para el 10k" sacado de tres criterios de seis, dicho sin
 * decirlo, es exactamente la falsa precisión que el sistema tiene prohibida.
 */
function _tenKReadiness(ctx, runs, longest) {
  const longKm = longest ? _n(longest.distance) : null;
  const z2 = longest ? _z2Compliant(longest, ctx.z2Ceiling.bpm) : null;
  let verdict = 'sin señal';
  if (runs.length) {
    if (longKm != null && longKm >= 10 && z2 === true) verdict = 'listo para intentarlo';
    else if (longKm != null && longKm >= 8) verdict = 'acercándose';
    else verdict = 'lejos';
  }
  return {
    verdict,
    longestKm: _rKm(longKm),
    longestZ2Compliant: z2,
    driftBpm: null,
    criteria: { km10: longKm != null ? longKm >= 10 : null, avgHrUnderCeiling: z2, driftUnder5: null, rpeUnder5: null, painFree: null, nextDayRhr: null },
    basis: 'Sólo se pueden medir distancia y FC media. Deriva de FC, RPE, dolor y RHR del día siguiente no están en los stores: van a null.',
  };
}

// ---------- plan ----------

function _factsPlan(ctx) {
  const p = ctx.plan;
  if (!p) {
    ctx.gaps.push('No hay plan activo en el pack: el coach no puede proponer un diff sobre nada.');
    return null;
  }
  const tpl = {};
  const wt = p.weekTemplate || {};
  for (let dow = 0; dow <= 6; dow++) {
    const s = wt[dow] || wt[String(dow)] || { type: 'rest' };
    tpl[dow] = {
      type: s.type || 'rest',
      session: s.session || null,
      label: s.label || null,
      subtype: s.subtype || null,
      durationMin: _rMin(s.durationMin),
      z2FinisherMin: _rMin(s.z2FinisherMin),
      cardio: s.cardio ? {
        durationMin: _rMin(s.cardio.durationMin), distanceKm: _rKm(s.cardio.distanceKm),
        subtype: s.cardio.subtype || null, hrZone: s.cardio.hrZone || null,
        note: _trunc(s.cardio.note, FACTS_NOTE_CHARS), source: s.cardio.source || null,
      } : null,
    };
  }
  const sessions = {};
  for (const [sid, s] of Object.entries(p.sessions || {})) {
    sessions[sid] = {
      name: s.name || sid,
      subtitle: s.subtitle || null,
      focus: _trunc(s.focus, FACTS_NOTE_CHARS),
      exercises: (s.exercises || []).map((ex, i) => ({
        id: ex.id, name: ex.name || null, muscle: ex.muscle || null,
        sets: _n(ex.sets), reps: ex.reps || null, rpe: ex.rpe || null,
        order: _n(ex.order) != null ? _n(ex.order) : i,
        optional: !!ex.optional, superset: ex.superset || null,
        // `db`/`bw`/`measure` son el vocabulario con el que la edge function construye su
        // `allowed` y fuerza `kg: null` donde no hay carga (mancuerna = kg POR MANO, peso
        // corporal = `+kg`, medida = cm). `measure` sale de `deps.measureUnitFor`, no del
        // plan: el store `exercises` no persiste campos arbitrarios.
        db: !!ex.db, bw: !!ex.bw, compound: !!ex.compound,
        measure: !!ctx.d.measureUnitFor(ex.id),
        measureUnit: ctx.d.measureUnitFor(ex.id) || null,
        target: ex.target ? {
          kg: _rKg(ex.target.kg), reps: ex.target.reps || null, rpe: ex.target.rpe || null,
          note: _trunc(ex.target.note, FACTS_NOTE_CHARS), source: ex.target.source || null,
          evidence: Array.isArray(ex.target.evidence) ? ex.target.evidence.slice(0, 6) : [],
        } : null,
      })),
    };
  }
  const ovr = (ctx.st.settings && ctx.st.settings.exerciseOverrides) || {};
  const sched = (ctx.st.settings && ctx.st.settings.weekSchedule) || {};
  const futureSched = {};
  for (const [date, v] of Object.entries(sched)) if (_cfDate(date) && date >= ctx.todayStr) futureSched[date] = v;

  return {
    id: p.id || null, version: _n(p.version), label: p.label || null,
    schema: _n(p.schema), status: p.status || null, author: p.author || null,
    weekKey: p.weekKey || null, reviewId: p.reviewId || null, basedOn: p.basedOn || null,
    seedRev: _n(p.seedRev), createdAt: p.createdAt || null,
    block: p.block || null,
    running: p.running || null,
    idealVariant: _n(ctx.settings.idealVariant),
    weekTemplate: tpl,
    sessions,
    overrides: { exercises: ovr, futureSchedule: futureSched },
  };
}

// ---------- adherence ----------

/**
 * Cuatro filas semanales: qué había planificado y qué se hizo.
 *
 * `plannedSource` es honesto a propósito. Lo planificado de una semana pasada sólo se conoce
 * de verdad si los registros de esa semana llevan el `planVersion` del plan que sigue activo;
 * si el plan cambió en medio, lo que se cuenta es la PLANTILLA ACTUAL proyectada hacia atrás,
 * y eso se dice ("aproximado") en la fila y en `dataGaps`. Un porcentaje de adherencia contra
 * un plan que no era el de esa semana es un número que parece medido y no lo es.
 */
function _factsAdherence(ctx) {
  const planVersion = _n(ctx.plan && ctx.plan.version);
  let anyApprox = false;
  const rows = ctx.weeks.map(w => {
    const upTo = w.sunday <= ctx.todayStr ? w.sunday : ctx.todayStr;
    const workouts = ctx.workouts.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const runs = ctx.runs.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const sess = ctx.sessions.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const mob = ctx.mobility.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const planned = _plannedForWeek(ctx, w, upTo);
    const versions = [...new Set(workouts.map(x => _n(x.planVersion)).filter(v => v != null))];
    const exact = versions.length <= 1 && (versions.length === 0 || versions[0] === planVersion);
    if (!exact) anyApprox = true;
    const durations = workouts.map(x => _rMin(_durMin(x.duration))).filter(v => v != null);
    const cardioMin = _sum(runs.map(r => _durMin(r.duration))) + _sum(sess.filter(s => (s.family || 'cardio') !== 'recovery').map(s => _durMin(s.durationMin)));
    return {
      weekKey: w.weekKey, monday: w.monday, daysElapsed: Math.min(7, (_cfDiff(w.monday, upTo) || 0) + 1),
      gym: {
        planned: planned.gym, plannedToDate: planned.gymToDate, done: workouts.length,
        ids: workouts.map(x => x.session || x.sessionName || null),
        quick: workouts.filter(x => x.quick === true).length,
        pctToDate: planned.gymToDate ? _rPct((workouts.length / planned.gymToDate) * 100) : null,
      },
      cardio: {
        planned: planned.cardio, plannedToDate: planned.cardioToDate,
        done: runs.length + sess.filter(s => (s.family || 'cardio') === 'cardio').length,
        km: _rKm(_sum(runs.map(r => _n(r.distance)))),
        min: _rMin(cardioMin),
        hard: _hardCount(ctx, runs, sess),
      },
      recovery: { planned: planned.recovery, done: mob.length },
      durationsMin: durations,
      avgDurationMin: _rMin(_mean(durations)),
      plannedSource: exact ? 'plan-activo' : 'plantilla-actual (aproximado)',
    };
  });
  if (anyApprox) {
    ctx.gaps.push('`adherence.planned` es APROXIMADO en al menos una semana: los registros llevan otra versión del plan, así que lo planificado se ha proyectado desde la plantilla actual.');
  }
  return rows;
}

function _plannedForWeek(ctx, w, upTo) {
  const wt = (ctx.plan && ctx.plan.weekTemplate) || {};
  const sched = (ctx.st.settings && ctx.st.settings.weekSchedule) || {};
  let gym = 0, cardio = 0, recovery = 0, gymToDate = 0, cardioToDate = 0;
  for (let i = 0; i < 7; i++) {
    const date = _cfShift(w.monday, i);
    const dow = _cfDow(date);
    const slot = wt[dow] || wt[String(dow)] || { type: 'rest' };
    let type = slot.type || 'rest';
    if (Object.prototype.hasOwnProperty.call(sched, date)) type = sched[date] ? 'gym' : 'rest';
    const counted = date <= upTo;
    if (type === 'gym') { gym++; if (counted) gymToDate++; }
    else if (type === 'run') { cardio++; if (counted) cardioToDate++; }
    else if (type === 'recovery') recovery++;
  }
  return { gym, cardio, recovery, gymToDate, cardioToDate };
}

function _hardCount(ctx, runs, sess) {
  let n = 0;
  for (const r of runs) if (FACTS_HARD_SUBTYPES[_runSubtype(r)]) n++;
  for (const s of sess) {
    if (s.family === 'hybrid') n++;
    else if (FACTS_HARD_SUBTYPES[s.subtype]) n++;
  }
  return n;
}

function _runSubtype(r) {
  const l = String((r && r.intensityLabel) || '').toLowerCase();
  if (l.includes('interval') || l.includes('vo2')) return 'intervals';
  if (l.includes('threshold') || l.includes('tempo')) return 'threshold';
  if (l.includes('long')) return 'long_easy';
  if (l.includes('z3') || l.includes('zone3')) return 'zone3';
  if (l.includes('recovery')) return 'recovery';
  return 'zone2';
}

// ---------- lifts ----------

/**
 * Por ejercicio: hasta 4 sesiones con el top set, e1RM, RPE medio y tendencia.
 *
 * TODO EN KG, SIEMPRE. Los registros de antes de la mudanza a España llevan `unit: 'lb'`; sin
 * `convertWeight` un 205 lb de banca entraría al lado de un 95 kg y el modelo leería una
 * caída del 54 % que nunca ocurrió. Las MEDIDAS (box jump = cm) no son carga: reportan cm y no
 * tienen e1RM, porque "50 cm + 2,5" no significa nada. Los ejercicios de peso corporal
 * reportan el LASTRE (`+kg`) y tampoco e1RM: la Epley sobre el lastre de unas dominadas
 * describe una fuerza que no es la del atleta.
 */
function _factsLifts(ctx) {
  const d = ctx.d;
  const out = {};
  const seen = new Map();     // exId → [{date, session, sets, unit}]
  // Ventana amplia (8 semanas) para poder dar `daysSinceLast` de un ejercicio que no se ha
  // tocado en el último mes: es justo el dato que dispara la regla de reentrada (LOAD-004).
  const from = _cfShift(ctx.todayStr, -55);
  for (const w of ctx.workouts) {
    if (!_inWindow(w.date, from, ctx.todayStr)) continue;
    for (const ex of (w.exercises || [])) {
      const id = ex.exerciseId || ex.id;
      if (!id) continue;
      if (!seen.has(id)) seen.set(id, []);
      const list = seen.get(id);
      if (list.length >= FACTS_MAX_LIFT_SESSIONS + 2) continue;   // margen para descartar vacías
      list.push({ date: _cfDate(w.date), session: w.session || w.sessionName || null, unit: w.unit || 'kg', ex, workout: w });
    }
  }

  const plannedSets = _plannedSetsByExercise(ctx);
  const skip = _skipStats(ctx);

  for (const [id, list] of seen.entries()) {
    const measureUnit = d.measureUnitFor(id) || null;
    const isBw = _isBwExercise(ctx, id, list);
    const sessions = [];
    for (const item of list) {
      const sets = (item.ex.sets || []).filter(s => s && s.done === true);
      if (!sets.length) continue;
      const row = _liftSession(ctx, id, item, sets, measureUnit, isBw, plannedSets);
      if (row) sessions.push(row);
      if (sessions.length >= FACTS_MAX_LIFT_SESSIONS) break;
    }
    if (!sessions.length) continue;
    const lib = ctx.library[id] || null;
    out[id] = {
      id,
      name: (lib && lib.name) || (list[0].ex.name) || id,
      muscle: (lib && lib.muscle) || null,
      pattern: (lib && lib.movementPattern) || null,
      kind: measureUnit ? 'measure' : (isBw ? 'bw' : 'load'),
      measureUnit,
      sessions,
      daysSinceLast: _cfDiff(sessions[0].date, ctx.todayStr),
      nSessions: sessions.length,
      trend: _liftTrend(sessions),
      skipRate4w: skip[id] ? _rPct(skip[id].rate * 100) : null,
      exposures4w: skip[id] ? skip[id].exposures : 0,
      pausedOver21d: (_cfDiff(sessions[0].date, ctx.todayStr) || 0) > FACTS_PAUSE_DAYS,
    };
  }
  if (!ctx.d.hasConvert) {
    ctx.gaps.push('Falta `deps.convertWeight`: los pesos se han tomado en la unidad en que se guardaron, así que un registro en lb NO está convertido a kg.');
  }
  return out;
}

function _isBwExercise(ctx, id, list) {
  const lib = ctx.library[id];
  if (lib && lib.bw === true) return true;
  return list.some(item => item.ex && item.ex.bw === true);
}

function _liftSession(ctx, id, item, sets, measureUnit, isBw, plannedSets) {
  const d = ctx.d;
  const unit = item.unit || 'kg';
  const toKg = (v) => { const x = _n(v); return x == null ? null : _n(d.convertWeight(x, unit, 'kg')); };
  // Top set. En una MEDIDA manda el número (cm de cajón); en peso corporal mandan las reps
  // (el lastre suele ser 0 y el progreso está en las repeticiones); en carga, el peso.
  let top = null;
  for (const s of sets) {
    const reps = _n(s.reps) || 0;
    const raw = _n(s.weight) || 0;
    const val = measureUnit ? raw : (toKg(raw) || 0);
    if (!top) { top = { val, reps, rpe: _n(s.rpe) }; continue; }
    const better = isBw
      ? (reps > top.reps || (reps === top.reps && val > top.val))
      : (val > top.val || (val === top.val && reps > top.reps));
    if (better) top = { val, reps, rpe: _n(s.rpe) };
  }
  if (!top) return null;
  const rpes = sets.map(s => _n(s.rpe)).filter(x => x != null);
  const row = {
    date: item.date,
    session: item.session,
    setsDone: sets.length,
    setsPlanned: (plannedSets[item.session] && plannedSets[item.session][id]) != null ? plannedSets[item.session][id] : null,
    topReps: top.reps || null,
    topRpe: top.rpe,
    avgRpe: _round(_mean(rpes), 0.1),
    repsPerSet: sets.map(s => _n(s.reps)).filter(x => x != null),
    loggedUnit: unit,
  };
  if (measureUnit) {
    row.topMeasure = _rMin(top.val);
    row.measureUnit = measureUnit;
    row.topKg = null;
    row.e1rm = null;
    row.note = `Se mide en ${measureUnit}: no es carga y no tiene e1RM.`;
  } else if (isBw) {
    row.addedKg = _rKg(top.val);
    row.topKg = _rKg(top.val);
    row.e1rm = null;
    row.note = 'Peso corporal + lastre: el número es el LASTRE (+kg). No se estima e1RM sobre el lastre.';
  } else {
    row.topKg = _rKg(top.val);
    row.e1rm = _rKg(d.estimate1RM(top.val, top.reps));
  }
  if (item.ex.target) {
    row.targetShown = {
      kg: _rKg(item.ex.target.kg), reps: item.ex.target.reps || null,
      rpe: item.ex.target.rpe || null, source: item.ex.target.source || null,
    };
  }
  const ro = item.workout && item.workout.readout;
  if (ro && Array.isArray(ro.items)) {
    const it = ro.items.find(x => x && x.exerciseId === id);
    if (it && it.outcome) row.outcome = it.outcome;
  }
  return row;
}

/** 'up' | 'flat' | 'down' | 'insufficient' — por e1RM, ±2 % sobre las sesiones disponibles. */
function _liftTrend(sessions) {
  const vals = sessions.map(s => _n(s.e1rm)).filter(x => x != null && x > 0);
  if (vals.length < 2) return 'insufficient';
  const newest = vals[0], oldest = vals[vals.length - 1];
  const pct = ((newest - oldest) / oldest) * 100;
  if (pct > FACTS_TREND_PCT) return 'up';
  if (pct < -FACTS_TREND_PCT) return 'down';
  return 'flat';
}

/** { [sessionId]: { [exId]: setsPrescritas } } desde el plan activo. */
function _plannedSetsByExercise(ctx) {
  const out = {};
  for (const [sid, s] of Object.entries((ctx.plan && ctx.plan.sessions) || {})) {
    out[sid] = {};
    for (const ex of (s.exercises || [])) if (ex && ex.id) out[sid][ex.id] = _n(ex.sets);
  }
  return out;
}

/**
 * Exposiciones vs saltos por ejercicio en la ventana de 4 semanas.
 * "Exposición" = el ejercicio estaba en la sesión que se registró. "Salto" = estaba y no tiene
 * ni una serie marcada (o no aparece en el registro).
 */
function _skipStats(ctx) {
  const planned = _plannedSetsByExercise(ctx);
  const acc = {};
  for (const w of ctx.workouts) {
    if (!_inWindow(w.date, ctx.from4w, ctx.todayStr)) continue;
    const sid = w.session || w.sessionName;
    const ids = new Set(Object.keys(planned[sid] || {}));
    for (const ex of (w.exercises || [])) if (ex && (ex.exerciseId || ex.id)) ids.add(ex.exerciseId || ex.id);
    for (const id of ids) {
      const rec = (w.exercises || []).find(e => (e.exerciseId || e.id) === id);
      const done = !!(rec && (rec.sets || []).some(s => s && s.done === true));
      if (!acc[id]) acc[id] = { exposures: 0, skips: 0 };
      acc[id].exposures++;
      if (!done) acc[id].skips++;
    }
  }
  for (const id of Object.keys(acc)) acc[id].rate = acc[id].exposures ? acc[id].skips / acc[id].exposures : 0;
  return acc;
}

/** Ejercicios que se saltan de forma recurrente (§C.2 paso 3: 2 de 3 → reordenar o quitar). */
function _factsSkipped(ctx) {
  const stats = _skipStats(ctx);
  const out = [];
  for (const [id, s] of Object.entries(stats)) {
    if (s.skips < 2 || s.rate < 0.5) continue;
    const lib = ctx.library[id];
    out.push({
      id, name: (lib && lib.name) || id,
      skips: s.skips, exposures: s.exposures, rate: _rPct(s.rate * 100),
      action: 'reordenar antes o quitar (no recordar)',
    });
  }
  return out.sort((a, b) => b.rate - a.rate || b.skips - a.skips);
}

// ---------- cardio ----------

function _factsCardio(ctx) {
  const weeks = ctx.weeks.map(w => {
    const runs = ctx.runs.filter(r => _inWindow(r.date, w.monday, w.sunday));
    const sess = ctx.sessions.filter(s => _inWindow(s.date, w.monday, w.sunday) && (s.family || 'cardio') !== 'recovery');
    return {
      weekKey: w.weekKey,
      km: _rKm(_sum(runs.map(r => _n(r.distance))) + _sum(sess.map(s => _n(s.distance)))),
      min: _rMin(_sum(runs.map(r => _durMin(r.duration))) + _sum(sess.map(s => _durMin(s.durationMin)))),
      sessions: runs.length + sess.length,
      hard: _hardCount(ctx, runs, sess),
      finishers: sess.filter(s => s.origin === 'z2_finisher').length,
    };
  });

  let driftMissing = false;
  const runs = ctx.runs.slice(0, FACTS_MAX_RUNS).map(r => {
    const zones = Array.isArray(r.hrZoneTimes) ? r.hrZoneTimes.map(_n).filter(x => x != null) : null;
    const total = zones ? _sum(zones) : 0;
    // pctZ2 = tiempo en Z1+Z2, o sea "por debajo o dentro de Z2". Lo que interesa de verdad es
    // el complementario (§C.2 paso 5: "≤10 % del tiempo sobre Z2"), así que van los dos.
    const pctZ2 = zones && total > 0 ? _rPct(((zones[0] || 0) + (zones[1] || 0)) / total * 100) : null;
    const drift = _n(r.decoupling);
    if (drift == null) driftMissing = true;
    return {
      date: _cfDate(r.date),
      km: _rKm(r.distance),
      min: _rMin(_durMin(r.duration)),
      avgHR: _rMin(r.avgHR),
      maxHR: _rMin(r.maxHR),
      pace: r.avgPace || null,
      gapPace: r.gapPace || null,
      subtype: _runSubtype(r),
      z2Compliant: _z2Compliant(r, ctx.z2Ceiling.bpm),
      pctZ2,
      pctAboveZ2: pctZ2 == null ? null : _rPct(100 - pctZ2),
      decoupling: drift,
      hrDrift: null,
      source: r.source || 'manual',
      sport: r.sport || null,
      trainingLoad: _n(r.trainingLoad),
    };
  });
  if (driftMissing || !runs.length) {
    ctx.gaps.push('Deriva de FC (2ª mitad vs 1ª) NO disponible: los registros no traen streams de FC. `hrDrift` va a null en todas las carreras — no la infieras del `decoupling` cuando también sea null.');
  }
  const last = ctx.runs[0] || null;
  const lastCardio = [...ctx.runs.map(r => _cfDate(r.date)), ...ctx.sessions.map(s => _cfDate(s.date))].filter(Boolean).sort().pop() || null;
  return {
    z2Ceiling: ctx.z2Ceiling,
    z2Tolerance: FACTS_Z2_TOLERANCE,
    weeks,
    runs,
    daysSinceLastRun: last ? _cfDiff(last.date, ctx.todayStr) : null,
    daysSinceLastCardio: lastCardio ? _cfDiff(lastCardio, ctx.todayStr) : null,
    z2CompliancePct4w: (() => {
      const w = ctx.runs.filter(r => _inWindow(r.date, ctx.from4w, ctx.todayStr) && _z2Compliant(r, ctx.z2Ceiling.bpm) != null);
      if (!w.length) return null;
      return _rPct(w.filter(r => _z2Compliant(r, ctx.z2Ceiling.bpm) === true).length / w.length * 100);
    })(),
    maxWeekKm4w: _rKm(Math.max(0, ...weeks.map(w => _n(w.km) || 0))) || 0,
    note: 'Carreras y sesiones vienen DEDUPEADAS (`dedupeRuns`/`dedupeSessions`): la misma actividad de COROS puede llegar por Strava y por intervals.icu. Los finishers Z2 post-fuerza (`origin: z2_finisher`) cuentan como minutos aeróbicos reales.',
  };
}

/** true/false/null — Z2 cumplida si la FC media ≤ techo + tolerancia. null si no hay FC. */
function _z2Compliant(run, ceiling) {
  const hr = _n(run && run.avgHR);
  const c = _n(ceiling);
  if (hr == null || c == null) return null;
  return hr <= c + FACTS_Z2_TOLERANCE;
}

// ---------- readiness ----------

/**
 * Recuperación: tendencias propias 7d vs 28d (READ-004), nunca umbrales de literatura.
 *
 * Y la carga, con dos etiquetas distintas y visibles:
 *   `aerobicLoad` — CTL/ATL/form/rampRate de intervals.icu. **Sólo cardio** (F-3): las
 *      sesiones de fuerza no llegan al hub, así que un CTL de 2,4 no describe la semana de
 *      alguien que hace 4 sesiones de fuerza. `form = ctl − atl` (F-2): `rampRate` es ΔCTL por
 *      semana, otra magnitud, y aplicarle umbrales de TSB es lo que llevaba meses sin disparar.
 *   `internalLoad` — carga interna PROPIA (C.4): Σ budgetWeight + Σ(duración × RPE) de fuerza.
 *      Es ordinal: sirve para comparar semanas entre sí, no contra ninguna tabla.
 */
function _factsReadiness(ctx) {
  const w = ctx.wellness;
  const pick = (field, days, offset) => w
    .filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= (offset || 0) && dd < (offset || 0) + days && _n(r[field]) != null; })
    .map(r => _n(r[field]));

  const band = (field, rounder) => {
    const a = pick(field, 7, 0), b = pick(field, FACTS_LONG_WINDOW_DAYS, 0);
    const m7 = _mean(a), m28 = _mean(b);
    return {
      mean7: rounder(m7), mean28: rounder(m28), n7: a.length, n28: b.length,
      deltaPct: (m7 != null && m28 != null && m28 !== 0) ? _rPct(((m7 - m28) / m28) * 100) : null,
      deltaAbs: (m7 != null && m28 != null) ? rounder(m7 - m28) : null,
    };
  };

  const sleep7 = pick('sleepSecs', 7, 0);
  const sleep28 = pick('sleepSecs', FACTS_LONG_WINDOW_DAYS, 0);
  const scores7 = w.filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < 7 && _n(r.readiness) != null; });
  const scores28 = w.filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < FACTS_LONG_WINDOW_DAYS && _n(r.readiness) != null; });
  const colorOf = (v) => v == null ? 'unknown' : (v >= FACTS_GREEN ? 'green' : (v >= FACTS_YELLOW ? 'yellow' : 'red'));
  const colors = { green: 0, yellow: 0, red: 0 };
  for (const r of scores7) colors[colorOf(_n(r.readiness))]++;

  const today = w.find(r => _cfDate(r.date) === ctx.todayStr) || null;
  const latest = w[0] || null;
  const load = latest || {};

  if (scores7.length < FACTS_MIN_WELLNESS_DAYS_7) {
    ctx.gaps.push(`Sólo ${scores7.length}/7 días de wellness con readiness: por debajo de ${FACTS_MIN_WELLNESS_DAYS_7} no se juzga la recuperación (READ-004).`);
  }

  return {
    hrv: band('hrv', _rMs),
    restingHR: band('restingHR', _rMin),
    sleep: {
      mean7Hrs: _rHrs(_mean(sleep7) != null ? _mean(sleep7) / 3600 : null),
      mean28Hrs: _rHrs(_mean(sleep28) != null ? _mean(sleep28) / 3600 : null),
      nightsUnder6h5_7: sleep7.filter(s => s < FACTS_SLEEP_FLOOR_SECS).length,
      nightsUnder6h_7: sleep7.filter(s => s < FACTS_SLEEP_SHORT_SECS).length,
      n7: sleep7.length, n28: sleep28.length,
    },
    score: {
      mean7: _rMin(_mean(scores7.map(r => _n(r.readiness)))),
      mean28: _rMin(_mean(scores28.map(r => _n(r.readiness)))),
      deltaPts: (() => {
        const a = _mean(scores7.map(r => _n(r.readiness))), b = _mean(scores28.map(r => _n(r.readiness)));
        return (a != null && b != null) ? _rMin(a - b) : null;
      })(),
      green7: colors.green, yellow7: colors.yellow, red7: colors.red,
      n7: scores7.length, n28: scores28.length,
      cutoffs: { green: FACTS_GREEN, yellow: FACTS_YELLOW },
    },
    today: today ? {
      date: ctx.todayStr, readiness: _rMin(today.readiness), color: colorOf(_n(today.readiness)),
      hrv: _rMs(today.hrv), restingHR: _rMin(today.restingHR),
      sleepHrs: _rHrs(_n(today.sleepSecs) != null ? _n(today.sleepSecs) / 3600 : null),
      source: today.readinessSource || null,
    } : { date: ctx.todayStr, readiness: null, color: 'unknown', note: 'Sin dato de hoy: intervals.icu por la mañana sigue mostrando el de ayer y no se usa como si fuera de hoy.' },
    lastDataDate: latest ? _cfDate(latest.date) : null,
    aerobicLoad: {
      ctl: _round(load.ctl, 0.1),
      atl: _round(load.atl, 0.1),
      form: (_n(load.ctl) != null && _n(load.atl) != null) ? _round(_n(load.ctl) - _n(load.atl), 0.1) : null,
      rampRate: _round(load.rampRate, 0.01),
      date: latest ? _cfDate(latest.date) : null,
      note: 'sólo cardio: las sesiones de fuerza no llegan a intervals.icu, así que esto NO es la carga total (F-3). `form = ctl − atl` (F-2); `rampRate` es ΔCTL/semana, no forma, y los umbrales de TSB de la literatura no aplican a este rango (±2 medido).',
    },
    internalLoad: _internalLoad(ctx),
    pressExposuresPerWeek: _pressExposures(ctx),
    setsPerMuscle: _setsPerMuscle(ctx),
    anomalies: _readinessAnomalies(ctx, scores28, colorOf),
  };
}

/** Carga interna propia por semana: Σ budgetWeight + Σ(duración × RPE) de fuerza. Ordinal. */
function _internalLoad(ctx) {
  return ctx.weeks.map(w => {
    const workouts = ctx.workouts.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const runs = ctx.runs.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const sess = ctx.sessions.filter(x => _inWindow(x.date, w.monday, w.sunday));
    let bw = 0;
    for (const x of workouts) bw += _n(x.budgetWeight) != null ? _n(x.budgetWeight) : 1;
    for (const r of runs) bw += _bwForCardio(ctx, r, 'runs');
    for (const s of sess) bw += _bwForCardio(ctx, s, 'sessions');
    let rpeLoad = 0;
    for (const x of workouts) {
      const min = _durMin(x.duration);
      const rpes = (x.exercises || []).flatMap(e => (e.sets || []).filter(s => s && s.done && _n(s.rpe) != null).map(s => _n(s.rpe)));
      const avg = _mean(rpes);
      if (min != null && avg != null) rpeLoad += min * avg;
    }
    return {
      weekKey: w.weekKey,
      budgetWeight: _round(bw, 0.5),
      strengthRpeLoad: _rMin(rpeLoad),
      strengthSessions: workouts.length,
    };
  });
}

function _bwForCardio(ctx, rec, store) {
  if (_n(rec.budgetWeight) != null) return _n(rec.budgetWeight);
  if (ctx.d.toSession) {
    try {
      const s = ctx.d.toSession(rec, store);
      if (s && _n(s.budgetWeight) != null) return _n(s.budgetWeight);
    } catch (e) { /* un adaptador que falla no puede tumbar el pack */ }
  }
  const sub = store === 'runs' ? _runSubtype(rec) : (rec.subtype || 'zone2');
  return _n(FACTS_CARDIO_BW[sub]) != null ? FACTS_CARDIO_BW[sub] : 1;
}

/**
 * Exposiciones de EMPUJE por semana (STR-002).
 * Es el hecho que explica W35: 5 exposiciones de press en 10 días y la banca cayó. Sin este
 * número, un modelo mirando sólo la carga concluye "bajar el peso" cuando el problema era la
 * frecuencia.
 */
function _pressExposures(ctx) {
  return ctx.weeks.map(w => {
    const workouts = ctx.workouts.filter(x => _inWindow(x.date, w.monday, w.sunday));
    const days = new Set();
    const ids = new Set();
    for (const x of workouts) {
      for (const ex of (x.exercises || [])) {
        const id = ex.exerciseId || ex.id;
        if (!id || !_isPress(ctx, id)) continue;
        if (!(ex.sets || []).some(s => s && s.done === true)) continue;
        days.add(_cfDate(x.date));
        ids.add(id);
      }
    }
    return { weekKey: w.weekKey, exposures: days.size, exerciseIds: [...ids] };
  });
}

function _isPress(ctx, id) {
  const lib = ctx.library[id];
  if (lib && lib.movementPattern) return !!FACTS_PRESS_PATTERNS[lib.movementPattern];
  return !!FACTS_PRESS_IDS[id];
}

/** Series por músculo, hechas vs prescritas, por semana (STR-003 y el gate de VOL-CAP). */
function _setsPerMuscle(ctx) {
  const muscleOf = (id, ex) => {
    const lib = ctx.library[id];
    if (lib && lib.muscle) return lib.muscle;
    for (const s of Object.values((ctx.plan && ctx.plan.sessions) || {})) {
      const p = (s.exercises || []).find(e => e.id === id);
      if (p && p.muscle) return p.muscle;
    }
    return (ex && ex.muscle) || 'otros';
  };
  return ctx.weeks.map(w => {
    const done = {};
    for (const x of ctx.workouts.filter(x => _inWindow(x.date, w.monday, w.sunday))) {
      for (const ex of (x.exercises || [])) {
        const id = ex.exerciseId || ex.id;
        if (!id) continue;
        const n = (ex.sets || []).filter(s => s && s.done === true).length;
        if (!n) continue;
        const m = muscleOf(id, ex);
        done[m] = (done[m] || 0) + n;
      }
    }
    return { weekKey: w.weekKey, done };
  });
}

/**
 * Anomalías de recuperación con su contexto (C.4): el sueño de esa noche, el alcohol de ese
 * día y la carga del día anterior. Los tres desplomes de readiness del historial coincidieron
 * con ATL <18 y <5 h de sueño — eso es un evento puntual (READ-007, cambia el DÍA) y no una
 * semana mala (READ-002, cambia la SEMANA). Sin el contexto, el modelo no puede distinguirlos.
 */
function _readinessAnomalies(ctx, scores28, colorOf) {
  const mean = _mean(scores28.map(r => _n(r.readiness)));
  const nutByDate = new Map(ctx.nutrition.map(n => [_cfDate(n.date), n]));
  const out = [];
  for (const r of scores28) {
    const v = _n(r.readiness);
    const isRed = colorOf(v) === 'red';
    const drop = mean != null ? mean - v : null;
    if (!isRed && !(drop != null && drop >= 15)) continue;
    const date = _cfDate(r.date);
    const prev = _cfShift(date, -1);
    const nut = nutByDate.get(date) || null;
    out.push({
      date,
      readiness: _rMin(v),
      deltaVsMean28: drop != null ? _rMin(-drop) : null,
      sleepHrs: _rHrs(_n(r.sleepSecs) != null ? _n(r.sleepSecs) / 3600 : null),
      alcoholG: nut ? _n(nut.alcoholG) : null,
      prevDay: {
        date: prev,
        strengthSessions: ctx.workouts.filter(x => _cfDate(x.date) === prev).length,
        cardioSessions: ctx.runs.filter(x => _cfDate(x.date) === prev).length + ctx.sessions.filter(x => _cfDate(x.date) === prev).length,
        budgetWeight: _round(
          _sum(ctx.workouts.filter(x => _cfDate(x.date) === prev).map(x => _n(x.budgetWeight) != null ? _n(x.budgetWeight) : 1))
          + _sum(ctx.runs.filter(x => _cfDate(x.date) === prev).map(x => _bwForCardio(ctx, x, 'runs')))
          + _sum(ctx.sessions.filter(x => _cfDate(x.date) === prev).map(x => _bwForCardio(ctx, x, 'sessions'))), 0.5),
        atl: _round((ctx.wellness.find(x => _cfDate(x.date) === prev) || {}).atl, 0.1),
      },
    });
    if (out.length >= FACTS_MAX_ANOMALIES) break;
  }
  return out;
}

// ---------- nutrition ----------

/**
 * Nutrición. La EA sólo se calcula sobre días CERRADOS (`date < todayStr`) — F-12: a las 9:00
 * con 400 kcal ingeridas la EA da 5 y el semáforo grita "crítico" todos los días, con lo que
 * la alarma real deja de significar nada. EA es una magnitud diaria (REC-008, Thomas 2016).
 */
function _factsNutrition(ctx) {
  const inWin = (days) => ctx.nutrition.filter(n => { const dd = _cfDiff(n.date, ctx.todayStr); return dd != null && dd >= 0 && dd < days; });
  const rows28 = inWin(FACTS_LONG_WINDOW_DAYS);
  const rows7 = inWin(7);
  const rows14 = inWin(14);
  const logged = (rows) => rows.filter(n => n.loggedV2 === true || (_n(n.calories) || 0) > 0);
  const l28 = logged(rows28), l7 = logged(rows7), l14 = logged(rows14);
  const closed = l28.filter(n => _cfDate(n.date) < ctx.todayStr);
  const closed7 = l7.filter(n => _cfDate(n.date) < ctx.todayStr);
  const eaVals = closed.map(n => _n(n.ea)).filter(x => x != null);
  const eaVals7 = closed7.map(n => _n(n.ea)).filter(x => x != null);
  const floor = _n(ctx.settings.goals && ctx.settings.goals.constraints && ctx.settings.goals.constraints.proteinG);

  if (l28.length < FACTS_MIN_NUTRITION_DAYS_28) {
    ctx.gaps.push(`Nutrición registrada sólo ${l28.length}/${FACTS_LONG_WINDOW_DAYS} días: **NO inferir ingesta** ni calcular déficit a partir de estos datos — manda la báscula (${l14.length}/14 en la ventana corta, gate ${FACTS_MIN_NUTRITION_DAYS_14}).`);
  }

  let deficits = null;
  if (ctx.d.weeklyDeficits) {
    try {
      deficits = ctx.d.weeklyDeficits(rows28).map(x => ({
        weekStart: x.weekStart, days: x.days, avgKcal: _rMin(x.avgKcal),
        avgTarget: _rMin(x.avgTarget), avgDeficit: _rMin(x.avgDeficit),
      }));
    } catch (e) { deficits = null; }
  }

  return {
    daysLogged7: l7.length,
    daysLogged14: l14.length,
    daysLogged28: l28.length,
    pilot: l14.length >= FACTS_MIN_NUTRITION_DAYS_14 ? 'tracker' : 'peso',
    protein: {
      mean7: _rMin(_mean(l7.map(n => _n(n.protein)))),
      mean28: _rMin(_mean(l28.map(n => _n(n.protein)))),
      floorG: floor,
      daysUnderFloor28: floor != null ? l28.filter(n => (_n(n.protein) || 0) < floor).length : null,
    },
    kcal: {
      mean7: _rMin(_mean(l7.map(n => _n(n.calories)))),
      mean28: _rMin(_mean(l28.map(n => _n(n.calories)))),
      targetMean7: _rMin(_mean(l7.map(n => _n(n.kcalTarget)))),
      trainingDayMean: _rMin(_mean(l28.filter(n => n.trainingDay === true).map(n => _n(n.calories)))),
      restDayMean: _rMin(_mean(l28.filter(n => n.trainingDay === false).map(n => _n(n.calories)))),
    },
    ea: {
      closedDays: closed.length,
      mean7: _rHrs(_mean(eaVals7)),
      mean28: _rHrs(_mean(eaVals)),
      daysUnder30: eaVals.filter(x => x < 30).length,
      daysUnder27: eaVals.filter(x => x < 27).length,
      lowestClosed: eaVals.length ? _rHrs(Math.min(...eaVals)) : null,
      note: 'Sólo días CERRADOS (fecha < hoy). La EA es una magnitud diaria (REC-008): intradía siempre sale "crítica" y no significa nada (F-12).',
    },
    maintenance: {
      modelMean7: _rMin(_mean(l7.map(n => _n(n.burn)))),
      modelMean28: _rMin(_mean(l28.map(n => _n(n.burn)))),
      source: 'modelo (Katch-McArdle + NEAT/pasos + EEE + TEF), no medido',
      ffmKg: _rBw(_mean(l28.map(n => _n(n.ffm)))),
    },
    weeklyDeficits: deficits,
    alcoholG7: _rMin(_sum(l7.map(n => _n(n.alcoholG)))),
  };
}

// ---------- steps · mobility ----------

function _factsSteps(ctx) {
  const inWin = (days) => ctx.steps.filter(s => { const dd = _cfDiff(s.date, ctx.todayStr); return dd != null && dd >= 0 && dd < days; });
  const s7 = inWin(7), s28 = inWin(FACTS_LONG_WINDOW_DAYS);
  const floor = _n(ctx.settings.goals && ctx.settings.goals.constraints && ctx.settings.goals.constraints.stepsFloor);
  return {
    mean7: _rMin(_mean(s7.map(s => _n(s.steps)))),
    mean28: _rMin(_mean(s28.map(s => _n(s.steps)))),
    floor,
    daysAtFloor28: floor != null ? s28.filter(s => (_n(s.steps) || 0) >= floor).length : null,
    n7: s7.length, n28: s28.length,
    note: 'Pasos sin convertir a kcal: el gasto por paso ya entra en el mantenimiento modelado, contarlo dos veces infla el déficit aparente.',
  };
}

function _factsMobility(ctx) {
  const weeks = ctx.weeks.map(w => {
    const rows = ctx.mobility.filter(m => _inWindow(m.date, w.monday, w.sunday));
    return {
      weekKey: w.weekKey, sessions: rows.length,
      minutes: _rMin(_sum(rows.map(m => _n(m.durationMin)))),
    };
  });
  const recent = ctx.mobility.slice(0, 4).map(m => ({
    date: _cfDate(m.date), routine: m.routineName || m.routineId || null,
    durationMin: _rMin(m.durationMin), painBefore: _n(m.painBefore), painAfter: _n(m.painAfter),
  }));
  return {
    weeks, recent,
    total4w: _sum(weeks.map(w => w.sessions)),
    daysSinceLast: ctx.mobility.length ? _cfDiff(_cfDate(ctx.mobility[0].date), ctx.todayStr) : null,
    floorPerWeek: 2,
    note: 'Éxito = ≥2 sesiones registradas por semana (ATH-006). La forma mínima que OCURRE vale más que la ideal que no.',
  };
}

// ---------- decisions ----------

/**
 * Ledger de decisiones (C.4): lo que permite el "te dije X el {fecha}, los datos dicen Y".
 * Sin esto cada revisión empieza de cero y ninguna decisión se retira nunca.
 */
function _factsDecisions(ctx) {
  return ctx.decisions.slice(0, FACTS_MAX_DECISIONS).map(x => {
    const ev = x.evidence || {};
    const row = {
      id: x.id || null,
      date: _cfDate(x.date),
      weekKey: x.weekKey || (_cfDate(x.date) ? _cfIsoWeek(_cfDate(x.date)) : null),
      type: x.type || 'other',
      source: x.source || null,
      claim: _trunc(x.what, FACTS_NOTE_CHARS),
      why: _trunc(x.why, FACTS_NOTE_CHARS),
      test: _trunc(x.test || ev.test, FACTS_NOTE_CHARS),
      reviewOn: _cfDate(x.reviewOn || ev.reviewOn),
      ruleIds: Array.isArray(x.ruleIds) ? x.ruleIds.slice(0, 8) : [],
      outcome: x.outcome || null,
      ref: x.ref && (x.ref.sessionId || x.ref.workoutId || x.ref.exId) ? {
        sessionId: x.ref.sessionId || null, exId: x.ref.exId || null,
      } : null,
    };
    if (ev.numbers && typeof ev.numbers === 'object') row.numbers = ev.numbers;
    if (_cfDate(row.reviewOn) && row.reviewOn <= ctx.todayStr) row.dueForReview = true;
    return row;
  });
}

// ---------- priorReviews ----------

function _factsPriorReviews(ctx) {
  const rows = (ctx.st.coachReviews || [])
    .filter(r => r && r.weekKey)
    .slice()
    .sort((a, b) => String(b.weekKey).localeCompare(String(a.weekKey)) || (_n(b.attempt) || 0) - (_n(a.attempt) || 0))
    .filter(r => r.weekKey !== ctx.weekKey)
    .slice(0, FACTS_MAX_REVIEWS)
    .map(r => {
      const out = r.output || {};
      const br = out.briefing || {};
      return {
        kind: 'review',
        id: r.id || null, weekKey: r.weekKey, attempt: _n(r.attempt), status: r.status || null,
        applied: r.status === 'applied',
        appliedPlanId: r.appliedPlanId || null,
        priorities: Array.isArray(br.priorities) ? br.priorities.slice(0, 3).map(p => _trunc(p, FACTS_NOTE_CHARS)) : [],
        decisions: Array.isArray(out.decisions) ? out.decisions.slice(0, 8).map(x => ({
          id: x.id || null, type: x.type || null, what: _trunc(x.what, FACTS_NOTE_CHARS),
          ruleIds: Array.isArray(x.ruleIds) ? x.ruleIds.slice(0, 6) : [],
        })) : [],
        excerpt: _trunc(br.nextWeek || br.lastWeek, FACTS_EXCERPT_CHARS),
      };
    });

  // Primera vez: la voz del cron de W36 entra como una entrada `legacy`, para que la primera
  // revisión del coach pueda retirar o mantener explícitamente lo que dijo la anterior.
  const legacy = ctx.inp.legacyLatest;
  if (legacy && rows.length < FACTS_MAX_REVIEWS) {
    const cv = legacy.coachVoice || {};
    const np = legacy.nextWeekPlan || {};
    rows.push({
      kind: 'legacy',
      id: `legacy:${legacy.weekKey || 'W?'}`,
      weekKey: legacy.weekKey || null,
      attempt: null,
      status: 'legacy',
      applied: null,
      source: legacy.source || 'manual',
      priorities: [],
      decisions: [],
      excerpt: _trunc(cv.nextWeek || legacy.planNext, FACTS_EXCERPT_CHARS),
      planSummary: _trunc(np.summary, FACTS_EXCERPT_CHARS),
      note: 'Revisión previa al coach in-app (markdown/`latest.json`). No lleva decisiones estructuradas ni ruleIds: trátala como prosa, no como datos.',
    });
  }
  if (!rows.length) {
    ctx.gaps.push('No hay revisiones previas: no se puede revisar ninguna decisión anterior ("te dije X"). Es la primera revisión del coach.');
  }
  return rows;
}

// ---------- staleness ----------

function _factsStaleness(ctx) {
  const src = {
    workouts: ctx.workouts, runs: ctx.runs, sessions: ctx.sessions, wellness: ctx.wellness,
    bodyweight: ctx.bodyweight, nutrition: ctx.nutrition, steps: ctx.steps,
    mobility: ctx.mobility, decisions: ctx.decisions,
  };
  const out = {};
  for (const [name, rows] of Object.entries(src)) {
    const last = (rows || []).map(r => _cfDate(r.date)).filter(Boolean).sort().pop() || null;
    const daysAgo = last ? _cfDiff(last, ctx.todayStr) : null;
    out[name] = {
      lastDate: last, daysAgo, n: (rows || []).length,
      stale: daysAgo == null ? true : daysAgo > FACTS_STALE_DAYS,
    };
  }
  return out;
}

// ---------- dataGaps · confidence ----------

/**
 * Los huecos que el modelo tiene OBLIGACIÓN de repetir. Se construyen aquí, al final, para
 * que ninguno dependa del orden en que se calcularon las secciones.
 */
function _factsGaps(ctx, facts) {
  const gaps = ctx.gaps.slice();
  const nWorkouts = ctx.workouts.filter(x => _inWindow(x.date, ctx.from4w, ctx.todayStr)).length;
  if (nWorkouts < FACTS_MIN_WORKOUTS) {
    gaps.push(`Sólo ${nWorkouts} sesiones de fuerza registradas en la ventana de 4 semanas (gate ${FACTS_MIN_WORKOUTS}): la señal de progresión es débil y el volumen no se sube.`);
  }
  const nRuns = ctx.runs.filter(x => _inWindow(x.date, ctx.from4w, ctx.todayStr)).length;
  if (nRuns === 0) {
    gaps.push('Cero carreras en la ventana de 4 semanas: no hay cómo evaluar la Z2 ni justificar una rampa de km — sin rampa (END-003).');
  }
  const w = facts.progress && facts.progress.weight;
  if (w && (w.nMeasured28 || 0) < FACTS_MIN_MEASURED_WEIGHTS) {
    gaps.push(`Sólo ${w.nMeasured28 || 0} pesadas MEDIDAS en 28 días (gate ${FACTS_MIN_MEASURED_WEIGHTS}): la pendiente no es señal y no se ajustan calorías por ella.`);
  } else if (w && (w.nMeasured7 || 0) < FACTS_MIN_MEASURED_WEIGHTS_7) {
    gaps.push(`Sólo ${w.nMeasured7 || 0} pesadas medidas en 7 días (gate ${FACTS_MIN_MEASURED_WEIGHTS_7}): la media de 7 días es orientativa.`);
  }
  if (w && w.validWindow && !w.validWindow.ok) {
    gaps.push(`Ventana de peso NO válida para ajustar calorías: ${w.validWindow.reasons.join('; ')}.`);
  }
  for (const [name, s] of Object.entries(facts.staleness || {})) {
    if (s.stale && s.n > 0) gaps.push(`Dato viejo en \`${name}\`: el último es de ${s.lastDate} (${s.daysAgo} días).`);
    if (s.n === 0) gaps.push(`El store \`${name}\` viene vacío en el pack: no hay nada que leer ahí.`);
  }
  // Dedupe conservando el orden: el mismo hueco dicho dos veces le baja el peso a los demás.
  return [...new Set(gaps)];
}

function _factsConfidence(ctx, facts) {
  const lvl = (n, hi, mid) => n >= hi ? 'high' : (n >= mid ? 'medium' : (n > 0 ? 'low' : 'none'));
  const w = (facts.progress && facts.progress.weight) || {};
  const by = {
    strength: lvl(ctx.workouts.filter(x => _inWindow(x.date, ctx.from4w, ctx.todayStr)).length, 12, 8),
    cardio: lvl(ctx.runs.filter(x => _inWindow(x.date, ctx.from4w, ctx.todayStr)).length, 8, 4),
    weight: lvl(w.nMeasured28 || 0, 14, FACTS_MIN_MEASURED_WEIGHTS),
    nutrition: lvl((facts.nutrition && facts.nutrition.daysLogged28) || 0, 20, FACTS_MIN_NUTRITION_DAYS_28),
    readiness: lvl((facts.readiness && facts.readiness.score && facts.readiness.score.n7) || 0, 7, FACTS_MIN_WELLNESS_DAYS_7),
    mobility: lvl((facts.mobility && facts.mobility.total4w) || 0, 8, 4),
  };
  const rank = { none: 0, low: 1, medium: 2, high: 3 };
  const vals = Object.values(by).map(v => rank[v]);
  const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  const overall = avg >= 2.5 ? 'high' : (avg >= 1.5 ? 'medium' : (avg > 0 ? 'low' : 'none'));
  return { overall, bySection: by, gapCount: (facts.dataGaps || []).length };
}

// ============================================================
// VALIDADOR DE PLANES — `validatePlanVersion(plan, ctx)`
// ============================================================
//
// Dos niveles y una regla de producto que no se negocia: **nada bloquea al usuario**
// (memoria del usuario, §Principios 4). Los DUROS (`level: 'hard'`) restringen al COACH: si la
// propuesta del modelo viola uno, la edge function le pide UNA regeneración con el aviso; si
// persiste, la app lo pinta en rojo y Julian puede aplicarlo igual. Los BLANDOS (`warn`) son
// chips ámbar. Ninguno impide guardar, arrancar una sesión ni aplicar un plan.
//
// Textos en castellano y con los números metidos: un aviso que dice "salto de carga" sin decir
// de cuánto a cuánto no se puede juzgar de un vistazo, y el que lo lee acaba ignorándolo.
//
// PURO Y DEFENSIVO. Cada chequeo que no tiene su trozo de `ctx` se SALTA en silencio; ninguno
// lanza. Un validador que revienta con un contexto incompleto convierte "aplicar el plan" en
// un error de JavaScript.

const VP_FLOORS = { proteinG: 185, kcalTraining: 2500, kcalRest: 2300 };
const VP_MAX_SETS_PER_MUSCLE = 14;
const VP_MAX_HARD_CARDIO = 1;
const VP_MAX_BUDGET = 6;
const VP_MAX_PRESS_EXPOSURES = 2;
const VP_MAX_SESSION_MIN = 75;
const VP_MAX_PLYO_CONTACTS = 80;
const VP_MAX_STRUCTURAL_CHANGES = 3;
const VP_MIN_STRENGTH_SESSIONS = 2;
const VP_MIN_MOBILITY_SLOTS = 2;
const VP_DELOAD_VOLUME_FACTOR = 0.6;
const VP_KM_HARD_FACTOR = 1.2;
const VP_KM_SOFT_FACTOR = 1.10;
const VP_KM_FLOOR_KM = 1;
const VP_REENTRY_KM_CAP = 8;
const VP_REENTRY_DAYS = 14;
const VP_LOAD_JUMP_PCT = 10;
const VP_LOAD_DROP_PCT = 15;
const VP_TARGET_STALE_DAYS = 21;
const VP_PLYO_SESSION = 'lowerA';
const VP_PLYO_IDS = { 'box-jump': 1, 'pogo-hops': 1, 'broad-jump': 1 };
const VP_HARD_SUBTYPES = { threshold: 1, intervals: 1 };
const VP_SUMMER_MONTHS = { '06': 1, '07': 1, '08': 1, '09': 1 };
// Sustituciones permitidas de un ancla (STR-010 + LOAD-003, flag lumbar). Fuera de estos
// pares, un ancla no se rota: se cambia el ESQUEMA, no el ejercicio.
const VP_ANCHOR_SWAPS = {
  'trap-bar-dl': { 'sumo-dl': 1, 'conv-dl': 1 },
  'sumo-dl': { 'trap-bar-dl': 1 },
  'conv-dl': { 'trap-bar-dl': 1 },
  'barbell-row': { 'chest-supported-row': 1 },
  'chest-supported-row': { 'barbell-row': 1 },
};
const VP_ANCHORS = ['back-squat', 'bench-press', 'ohp', 'barbell-row', 'chinups', 'trap-bar-dl', 'sumo-dl', 'conv-dl'];

/** Formatea un número para un texto en castellano (coma decimal, sin ceros de más). */
function _vpNum(v, decimals) {
  const x = _n(v);
  if (x == null) return '—';
  if (typeof _coachFmtKg === 'function' && (decimals == null || decimals === 1)) return _coachFmtKg(x);
  const s = (decimals == null ? x : Number(x.toFixed(decimals)));
  return String(s).replace('.', ',');
}

/**
 * Audita una versión de plan (o una propuesta ya mergeada) contra los guardarraíles de §C.3.
 *
 * @param {object} plan  plan v2: `{ sessions, weekTemplate, block, running, nutrition?, decisions?, briefing? }`
 * @param {object} ctx
 *   `basedOn`         plan anterior (para el diff de volumen y de anclas)
 *   `facts`           el pack (para km previos, exposiciones, EA, readiness, historial de kg)
 *   `variant`         `settings.idealVariant` (calendario elegido por el usuario)
 *   `libraryIds`      Set/array/objeto de ids válidos
 *   `lowerSessionIds` Set/array de ids de sesión de pierna
 *   `block`           `{index, isDeload, weeksTotal}` · `isDeload` también se acepta suelto
 *   `bodyweightKg`, `goals`, `zones`, `decisions`, `briefing`
 * @returns {Array<{id, level:'hard'|'warn', text, ruleIds}>}
 */
function validatePlanVersion(plan, ctx) {
  const out = [];
  const p = plan || {};
  const c = ctx || {};
  const add = (id, level, text, ruleIds) => out.push({ id, level, text, ruleIds: ruleIds || [] });
  const has = (v) => v != null;
  const idSet = _vpSet(c.libraryIds);
  const lowerSet = _vpSet(c.lowerSessionIds);
  const facts = c.facts || {};
  const isDeload = c.isDeload != null ? !!c.isDeload : !!(c.block && c.block.isDeload) || !!(p.block && p.block.isDeload) || p.phase === 'deload';
  const goals = c.goals || (facts.goals || null);
  const floors = {
    proteinG: _n(goals && goals.constraints && goals.constraints.proteinG) || VP_FLOORS.proteinG,
    kcalTraining: VP_FLOORS.kcalTraining, kcalRest: VP_FLOORS.kcalRest,
  };
  const sessions = p.sessions && typeof p.sessions === 'object' ? p.sessions : {};
  const tpl = p.weekTemplate && typeof p.weekTemplate === 'object' ? p.weekTemplate : null;
  const decisions = Array.isArray(p.decisions) ? p.decisions : (Array.isArray(c.decisions) ? c.decisions : []);
  const briefing = p.briefing || c.briefing || null;

  try {
    // ---- G-H2 · NO-SOURCE-KG (GEN-002) ----
    for (const [sid, s] of Object.entries(sessions)) {
      for (const ex of (s.exercises || [])) {
        const t = ex && ex.target;
        if (!t || _n(t.kg) == null) continue;
        const hasEvidence = (Array.isArray(t.evidence) && t.evidence.length) || t.basis || t.decisionId || t.source === 'rule' || t.source === 'last';
        const byRpe = t.porRPE === true || /rpe/i.test(String(t.note || ''));
        if (!hasEvidence && !byRpe) {
          add('NO-SOURCE-KG', 'hard',
            `${ex.name || ex.id} en ${s.name || sid}: ${_vpNum(t.kg)} kg sin dato de origen ni marca "ajustar por RPE, sin dato". Todo kg viene de un dato o va marcado.`,
            ['GEN-002']);
        }
      }
    }

    // ---- G-H1 · LOAD-JUMP (STR-001, LOAD-001) ----
    const lifts = facts.lifts || {};
    for (const [sid, s] of Object.entries(sessions)) {
      for (const ex of (s.exercises || [])) {
        const t = ex && ex.target;
        const kg = t ? _n(t.kg) : null;
        if (kg == null) continue;
        const lift = lifts[ex.id];
        const lastTop = lift && lift.sessions && lift.sessions.length ? _n(lift.sessions[0].topKg) : null;
        if (lastTop == null || lastTop <= 0) {
          add('LOAD-JUMP', 'hard',
            `${ex.name || ex.id} en ${s.name || sid}: objetivo de ${_vpNum(kg)} kg sin ningún top set previo con el que compararlo. Sin histórico no se prescribe carga: primera vez es "elige un peso que deje 2-3 reps".`,
            ['STR-001', 'LOAD-001']);
          continue;
        }
        const pct = ((kg - lastTop) / lastTop) * 100;
        if (pct > VP_LOAD_JUMP_PCT) {
          add('LOAD-JUMP', 'hard',
            `${ex.name || ex.id}: salto de carga de ${_vpNum(lastTop)} a ${_vpNum(kg)} kg (+${_vpNum(pct, 1)} %), por encima del +${VP_LOAD_JUMP_PCT} % sobre el último top set.`,
            ['STR-001', 'LOAD-001']);
        } else if (pct < -VP_LOAD_DROP_PCT) {
          add('LOAD-JUMP', 'warn',
            `${ex.name || ex.id}: caída de carga de ${_vpNum(lastTop)} a ${_vpNum(kg)} kg (${_vpNum(pct, 1)} %), más del −${VP_LOAD_DROP_PCT} % sin que sea deload. Si es intencionado, dilo en la razón.`,
            ['STR-001', 'LOAD-001']);
        }
        // ---- G-S6 · TARGET-N1 ----
        const n = lift ? _n(lift.nSessions) : null;
        const days = lift ? _n(lift.daysSinceLast) : null;
        if (n === 1) {
          add('TARGET-N1', 'warn',
            `${ex.name || ex.id}: el objetivo de ${_vpNum(kg)} kg se apoya en UNA sola sesión (n=1). Es una hipótesis, no una tendencia.`,
            ['STR-001', 'GEN-002']);
        } else if (days != null && days > VP_TARGET_STALE_DAYS) {
          add('TARGET-N1', 'warn',
            `${ex.name || ex.id}: el último dato es de hace ${days} días (>${VP_TARGET_STALE_DAYS}). Toca reentrada: la serie 1 decide, no el objetivo.`,
            ['LOAD-004', 'STR-001']);
        }
      }
    }

    // ---- EX-UNKNOWN (SEL-001) ----
    if (idSet) {
      for (const [sid, s] of Object.entries(sessions)) {
        for (const ex of (s.exercises || [])) {
          if (!ex || !ex.id) continue;
          if (!idSet.has(ex.id)) {
            add('EX-UNKNOWN', 'hard',
              `\`${ex.id}\` (${s.name || sid}) no está en la biblioteca de ejercicios: la app no lo puede pintar ni guardar su historial. Usa un id existente o añádelo antes.`,
              ['SEL-001', 'SEL-003']);
          }
        }
      }
    }

    // ---- G-H7 · VOL-CAP (STR-003, STR-001) ----
    const setsNow = _vpSetsPerMuscle(sessions, tpl);
    const setsPrev = c.basedOn ? _vpSetsPerMuscle(c.basedOn.sessions || {}, c.basedOn.weekTemplate || null) : null;
    const deficit = !goals || !goals.primary || goals.primary.type !== 'maintenance';
    for (const [muscle, n] of Object.entries(setsNow.byMuscle)) {
      if (deficit && n > VP_MAX_SETS_PER_MUSCLE) {
        add('VOL-CAP', 'hard',
          `${muscle}: ${n} series/semana, por encima del tope de ${VP_MAX_SETS_PER_MUSCLE} en déficit (STR-003 marca 10-14). En déficit se mantiene el volumen, no se sube.`,
          ['STR-003', 'STR-001']);
      }
    }
    if (setsPrev && setsPrev.total > 0) {
      const pct = ((setsNow.total - setsPrev.total) / setsPrev.total) * 100;
      if (pct > VP_LOAD_JUMP_PCT && !_vpVolumeGatesOk(facts)) {
        add('VOL-CAP', 'hard',
          `Volumen total de ${setsPrev.total} a ${setsNow.total} series (+${_vpNum(pct, 1)} %) sin los tres gates: adherencia ≥75 %, semana verde y nutrición ≥10/14 registrados. Añadir series en déficit sin los tres es la vía rápida al agujero.`,
          ['STR-003', 'STR-001']);
      }
    }

    // ---- G-H3 · DELOAD-VOLUME (LOAD-004) ----
    if (isDeload) {
      if (setsPrev && setsPrev.total > 0 && setsNow.total > setsPrev.total * VP_DELOAD_VOLUME_FACTOR) {
        add('DELOAD-VOLUME', 'hard',
          `Semana de DESCARGA con ${setsNow.total} series frente a ${setsPrev.total} de la semana de carga: por encima del ${Math.round(VP_DELOAD_VOLUME_FACTOR * 100)} % que define una descarga (series al 50 %, RPE 5-6, kg 85-90 %).`,
          ['LOAD-004']);
      }
      const plyo = _vpPlyoExercises(sessions);
      if (plyo.length) {
        add('DELOAD-VOLUME', 'hard',
          `Semana de descarga con pliometría (${plyo.map(x => x.id).join(', ')}): en la descarga no hay box jump.`,
          ['LOAD-004', 'ATH-001']);
      }
      const hard = _vpHardCardio(p, tpl);
      if (hard.count > 0) {
        add('DELOAD-VOLUME', 'hard',
          `Semana de descarga con ${hard.count} sesión(es) dura(s) de cardio (${hard.labels.join(', ')}): la descarga recorta la carrera un 30-40 %, no añade calidad.`,
          ['LOAD-004', 'END-004']);
      }
      if (p.block && p.block.phase && p.block.phase !== 'deload') {
        add('DELOAD-VOLUME', 'hard',
          `La semana ${c.block && c.block.index ? c.block.index : '?'}/${(c.block && c.block.weeksTotal) || 5} es de descarga por calendario pero el plan la marca \`phase: '${p.block.phase}'\`. El calendario manda (LOAD-004).`,
          ['LOAD-004']);
      }
    }

    // ---- G-H4 · HARD-CARDIO (END-004, BUD-001) ----
    const hardAll = _vpHardCardio(p, tpl);
    if (hardAll.count > VP_MAX_HARD_CARDIO) {
      add('HARD-CARDIO', 'hard',
        `${hardAll.count} sesiones duras de cardio/híbrido en la semana (${hardAll.labels.join(', ')}): el tope es ${VP_MAX_HARD_CARDIO}. Nunca la dura y el híbrido la misma semana.`,
        ['END-004', 'BUD-001']);
    }

    // ---- G-H5 · RUN-BEFORE-LEGS (INT-001, HYB-002) ----
    if (tpl && lowerSet) {
      for (let dow = 0; dow <= 6; dow++) {
        const slot = tpl[dow] || tpl[String(dow)];
        if (!slot) continue;
        if (!_vpSlotIsHardCardio(slot)) continue;
        const next = (dow + 1) % 7;                       // Domingo (0) → lunes (1): la vuelta cuenta
        const ns = tpl[next] || tpl[String(next)];
        if (ns && ns.type === 'gym' && ns.session && lowerSet.has(ns.session)) {
          add('RUN-BEFORE-LEGS', 'hard',
            `${_vpDow(dow)}: cardio duro/híbrido menos de 24 h antes de la pierna del ${_vpDow(next)} (${ns.session}). La calidad va lejos de pierna (INT-001).`,
            ['INT-001', 'HYB-002']);
        }
      }
    }

    // ---- G-H6 · ANCHOR-SWAP (STR-010, LOAD-003) ----
    if (c.basedOn && c.basedOn.sessions) {
      for (const [sid, s] of Object.entries(sessions)) {
        const prev = c.basedOn.sessions[sid];
        if (!prev) continue;
        const prevIds = (prev.exercises || []).map(e => e.id);
        const nowIds = (s.exercises || []).map(e => e.id);
        for (const anchor of prevIds.filter(id => VP_ANCHORS.indexOf(id) !== -1)) {
          if (nowIds.indexOf(anchor) !== -1) continue;
          const allowed = VP_ANCHOR_SWAPS[anchor] || {};
          const replacement = nowIds.find(id => allowed[id]);
          if (!replacement) {
            add('ANCHOR-SWAP', 'hard',
              `${anchor} sale de ${s.name || sid} y no entra un sustituto permitido (${Object.keys(allowed).join(' / ') || 'ninguno'}). Un ancla no se rota por estancamiento: se cambia el esquema de series.`,
              ['STR-010', 'LOAD-003']);
          }
        }
      }
    }

    // ---- G-H8/G-S1 · KM-JUMP (END-003, LOAD-001) ----
    const kmNow = _n(p.running && p.running.weeklyKmTarget);
    const cardioWeeks = (facts.cardio && facts.cardio.weeks) || [];
    const kmHist = cardioWeeks.map(w => _n(w.km)).filter(x => x != null);
    const kmPrev = kmHist.length ? kmHist[kmHist.length - 1] : null;
    const kmMax = kmHist.length ? Math.max(...kmHist) : null;
    const daysSinceRun = _n(facts.cardio && facts.cardio.daysSinceLastRun);
    if (kmNow != null) {
      if (daysSinceRun != null && daysSinceRun >= VP_REENTRY_DAYS && kmNow > VP_REENTRY_KM_CAP) {
        add('KM-JUMP', 'hard',
          `${_vpNum(kmNow, 1)} km/semana tras ${daysSinceRun} días sin correr: la reentrada tiene tope de ${VP_REENTRY_KM_CAP} km.`,
          ['END-003', 'LOAD-001']);
      } else if (kmMax != null && kmMax > 0 && kmNow > kmMax * VP_KM_HARD_FACTOR) {
        add('KM-JUMP', 'hard',
          `${_vpNum(kmNow, 1)} km/semana frente a un máximo de ${_vpNum(kmMax, 1)} km en 4 semanas: por encima de ×${String(VP_KM_HARD_FACTOR).replace('.', ',')} (${_vpNum(kmMax * VP_KM_HARD_FACTOR, 1)} km).`,
          ['END-003', 'LOAD-001']);
      } else if (kmPrev != null && kmPrev > 0 && kmNow > Math.max(kmPrev * VP_KM_SOFT_FACTOR, kmPrev + VP_KM_FLOOR_KM)) {
        const cap = Math.max(kmPrev * VP_KM_SOFT_FACTOR, kmPrev + VP_KM_FLOOR_KM);
        add('KM-JUMP', 'warn',
          `${_vpNum(kmNow, 1)} km/semana frente a ${_vpNum(kmPrev, 1)} de la semana pasada (tope orientativo ${_vpNum(cap, 1)} km): por encima del 10 % orientativo, que es heurística prudente NO validada (Buist 2008 no encontró diferencia entre 10 % y 24 %).`,
          ['END-003', 'LOAD-001']);
      }
    }

    // ---- G-H9 · PROTEIN-FLOOR / KCAL-FLOOR (REC-001, REC-008) ----
    const nut = _vpNutrition(p, decisions);
    if (nut.proteinG != null && nut.proteinG < floors.proteinG) {
      add('PROTEIN-FLOOR', 'hard',
        `Proteína a ${_vpNum(nut.proteinG, 0)} g/día, por debajo del suelo de ${floors.proteinG} g. La proteína no cede nunca (REC-001).`,
        ['REC-001', 'REC-008']);
    }
    if (nut.kcalTraining != null && nut.kcalTraining < floors.kcalTraining) {
      add('KCAL-FLOOR', 'hard',
        `Día de entreno a ${_vpNum(nut.kcalTraining, 0)} kcal, por debajo del suelo de ${floors.kcalTraining}.`,
        ['REC-001', 'REC-008']);
    }
    if (nut.kcalRest != null && nut.kcalRest < floors.kcalRest) {
      add('KCAL-FLOOR', 'hard',
        `Día de descanso a ${_vpNum(nut.kcalRest, 0)} kcal, por debajo del suelo de ${floors.kcalRest}.`,
        ['REC-001', 'REC-008']);
    }

    // ---- G-H10 · DELOAD-DIETBREAK (REC-005) ----
    if (nut.dietBreak != null || isDeload) {
      const db = nut.dietBreak === true;
      if (isDeload && nut.dietBreak === false) {
        add('DELOAD-DIETBREAK', 'hard',
          'Semana de descarga sin diet break: el deload y la subida a mantenimiento van juntos (REC-005). Separarlos deja la fatiga sin la única palanca que la baja de verdad.',
          ['REC-005', 'LOAD-004']);
      } else if (!isDeload && db) {
        add('DELOAD-DIETBREAK', 'hard',
          'Diet break en una semana de carga: mantenimiento y descarga van juntos (REC-005), no en semanas distintas.',
          ['REC-005', 'LOAD-004']);
      }
    }

    // ---- G-H11 · PLYO-PLACEMENT (ATH-001, INT-004) ----
    for (const item of _vpPlyoExercises(sessions)) {
      if (item.sid !== VP_PLYO_SESSION) {
        add('PLYO-PLACEMENT', 'hard',
          `${item.id} está en ${item.sessionName}: la pliometría va en ${VP_PLYO_SESSION} y en fresco (INT-004).`,
          ['ATH-001', 'INT-004']);
      } else if (item.index > 0) {
        add('PLYO-PLACEMENT', 'hard',
          `${item.id} va en posición ${item.index + 1} de ${item.sessionName}: la potencia va PRIMERA, con intención máxima y sin fatiga previa.`,
          ['ATH-001', 'INT-004']);
      }
      if (item.contacts != null && item.contacts > VP_MAX_PLYO_CONTACTS) {
        add('PLYO-PLACEMENT', 'hard',
          `${item.id}: ${item.contacts} contactos, por encima del tope de ${VP_MAX_PLYO_CONTACTS} (ATH-001 marca 40-80). El tendón adapta despacio.`,
          ['ATH-001', 'ATH-004']);
      }
    }
    if (tpl && lowerSet) {
      const plyoDays = new Set();
      for (let dow = 0; dow <= 6; dow++) {
        const slot = tpl[dow] || tpl[String(dow)];
        if (slot && slot.type === 'gym' && slot.session && _vpPlyoExercises(sessions).some(x => x.sid === slot.session)) plyoDays.add(dow);
      }
      for (const dow of plyoDays) {
        const prev = (dow + 6) % 7;
        const ps = tpl[prev] || tpl[String(prev)];
        if (ps && _vpSlotIsHardCardio(ps)) {
          add('PLYO-PLACEMENT', 'hard',
            `Pliometría el ${_vpDow(dow)} justo después del cardio duro del ${_vpDow(prev)}: el plyo nunca va después de aeróbico (INT-004).`,
            ['INT-004', 'ATH-001']);
        }
      }
    }

    // ---- G-H12 · CORE-PATTERNS (ATH-003) ----
    if (Object.keys(sessions).length) {
      const core = _vpCorePatterns(sessions, c);
      if (!core.antiRotation || !core.antiExtension) {
        const falta = [!core.antiRotation ? 'anti-rotación (Pallof, suitcase carry, bird dog)' : null,
                       !core.antiExtension ? 'anti-extensión (ab wheel, plancha, dead bug)' : null].filter(Boolean);
        add('CORE-PATTERNS', 'hard',
          `La semana no cubre ${falta.join(' ni ')}. Con historial lumbar, anti-rotación Y anti-extensión van SIEMPRE (ATH-003, \`strong\`); la flexión es la opcional.`,
          ['ATH-003']);
      }
    }

    // ---- G-H13 · MIN-STRENGTH (LONG-002) ----
    if (tpl) {
      const gymDays = _vpCount(tpl, s => s.type === 'gym');
      if (gymDays < VP_MIN_STRENGTH_SESSIONS) {
        add('MIN-STRENGTH', 'hard',
          `${gymDays} sesión(es) de fuerza en la semana: el mínimo eficaz son ${VP_MIN_STRENGTH_SESSIONS} (LONG-002). Por debajo se pierde masa en déficit.`,
          ['LONG-002', 'STR-001']);
      }
    }

    // ---- G-H14 · DECISION-EVIDENCE (ethos) ----
    for (const dec of decisions) {
      if (!dec) continue;
      const ids = Array.isArray(dec.ruleIds) ? dec.ruleIds.filter(Boolean) : [];
      const nums = (dec.evidence && dec.evidence.numbers) || dec.numbers || null;
      const hasNums = nums && typeof nums === 'object' && Object.keys(nums).length > 0;
      if (!ids.length || !hasNums) {
        add('DECISION-EVIDENCE', 'hard',
          `Decisión "${_trunc(dec.what || dec.id || 'sin título', 80)}" ${!ids.length ? 'sin Rule IDs' : ''}${!ids.length && !hasNums ? ' y ' : ''}${!hasNums ? 'sin números en `evidence.numbers`' : ''}. Cada decisión se traza a datos y a reglas, o no se toma.`,
          ['GEN-002']);
      }
      // ---- G-S13 · CTL-FOR-STRENGTH ----
      const txt = `${dec.what || ''} ${dec.why || ''}`.toLowerCase();
      const type = String(dec.type || '');
      if (/\bctl\b|\batl\b|ramprate|ramp rate/.test(txt) && /progress|structure|deload|recovery|strength/.test(type + ' ' + txt)) {
        add('CTL-FOR-STRENGTH', 'warn',
          `La decisión "${_trunc(dec.what || dec.id, 80)}" se apoya en ctl/atl/rampRate para una decisión de fuerza o de descarga. Esa carga sólo ve el cardio (F-3) y \`rampRate\` no es la forma (F-2): la señal de fuerza es RPE, top set y calidad de la sesión.`,
          ['GEN-002', 'READ-003']);
      }
    }

    // ---- SESSION-COUNT (BUD-001) ----
    if (tpl && _n(c.variant) != null) {
      const gymDays = _vpCount(tpl, s => s.type === 'gym');
      const allowed = _vpStrengthDaysForVariant(_n(c.variant));
      if (allowed != null && gymDays > allowed) {
        add('SESSION-COUNT', 'warn',
          `${gymDays} días de gimnasio frente a los ${allowed} de la variante ${_n(c.variant)} que eligió el usuario. La variante es SU calendario: el coach cambia el contenido, no el número de días.`,
          ['BUD-001']);
      }
    }

    // ---- EA-GATE (REC-008) ----
    const ea = facts.nutrition && facts.nutrition.ea;
    if (ea && _n(ea.daysUnder30) != null && _n(ea.daysUnder30) >= 4) {
      const volUp = setsPrev ? setsNow.total > setsPrev.total : false;
      const kmUp = (kmNow != null && kmPrev != null) ? kmNow > kmPrev : false;
      if (volUp || kmUp) {
        add('EA-GATE', 'warn',
          `${ea.daysUnder30} días con EA <30 kcal/kg FFM y el plan sube ${volUp ? 'series' : ''}${volUp && kmUp ? ' y ' : ''}${kmUp ? 'km' : ''}. Con la disponibilidad energética baja, primero se come (REC-008).`,
          ['REC-008', 'REC-001']);
      }
    }

    // ---- G-S2 · MOBILITY-FLOOR (ATH-006) ----
    if (tpl) {
      const mob = _vpMobilitySlots(sessions, tpl);
      if (mob < VP_MIN_MOBILITY_SLOTS) {
        add('MOBILITY-FLOOR', 'warn',
          `${mob} slot(s) de movilidad en la semana: el objetivo son ${VP_MIN_MOBILITY_SLOTS} registradas (ATH-006). La forma mínima que ocurre vale más que la ideal que no.`,
          ['ATH-006']);
      }
    }

    // ---- G-S3 · PRESS-EXPOSURES (STR-002) ----
    const press = _vpPressExposures(sessions, tpl, c);
    if (press > VP_MAX_PRESS_EXPOSURES) {
      add('PRESS-EXPOSURES', 'warn',
        `${press} exposiciones de empuje en la semana (tope orientativo ${VP_MAX_PRESS_EXPOSURES}). En W35 fueron 5 en 10 días y la banca cayó: aquello fue FRECUENCIA, no carga (STR-002).`,
        ['STR-002', 'INT-001']);
    }

    // ---- G-S4 · SESSION-LENGTH ----
    const maxMin = _n(goals && goals.constraints && goals.constraints.sessionMaxMin) || VP_MAX_SESSION_MIN;
    for (const [sid, s] of Object.entries(sessions)) {
      const est = _vpSessionMin(s);
      if (est != null && est > maxMin) {
        add('SESSION-LENGTH', 'warn',
          `${s.name || sid}: ~${Math.round(est)} min estimados, por encima de ${maxMin}. Si se pasa de ${maxMin}' de forma habitual, hay demasiado volumen.`,
          ['STR-003', 'BUD-001']);
      }
    }

    // ---- G-S5 · HYBRID-PLUS-LONG (HYB-002, END-003) ----
    const hybridDays = _vpCount(tpl || {}, s => s.type === 'run' && /hybrid|hibrido|híbrido|sled|trineo|ski/i.test(String(s.subtype || '') + String(s.label || '')));
    if (hybridDays > 0 && kmNow != null && kmPrev != null && kmNow > kmPrev) {
      add('HYBRID-PLUS-LONG', 'warn',
        `Híbrido en la semana y el largo sube (${_vpNum(kmPrev, 1)} → ${_vpNum(kmNow, 1)} km): dos estímulos duros a la vez. Nunca el híbrido y el largo creciendo la misma semana.`,
        ['HYB-002', 'END-003', 'BUD-001']);
    }

    // ---- G-S7 · READINESS-N (READ-004) ----
    const rn = _n(facts.readiness && facts.readiness.score && facts.readiness.score.n7);
    if (rn != null && rn < FACTS_MIN_WELLNESS_DAYS_7) {
      add('READINESS-N', 'warn',
        `La lectura de recuperación se apoya en ${rn}/7 días de wellness (gate ${FACTS_MIN_WELLNESS_DAYS_7}): con menos días la tendencia 7d vs 28d no es tendencia (READ-004).`,
        ['READ-004', 'READ-001']);
    }

    // ---- G-S8 · WEIGHT-WINDOW (REC-002) ----
    const win = facts.progress && facts.progress.weight && facts.progress.weight.validWindow;
    if (win && win.ok === false && _vpTouchesKcal(decisions, p)) {
      add('WEIGHT-WINDOW', 'warn',
        `Se toca la ingesta con una ventana de peso no válida: ${(win.reasons || []).join('; ')}. La pendiente de esa ventana no es señal (REC-002).`,
        ['REC-002', 'REC-008']);
    }

    // ---- G-S9 · HARD-BUDGET (BUD-001) ----
    const budget = _vpBudget(p, tpl, c);
    if (budget != null && budget > VP_MAX_BUDGET) {
      add('HARD-BUDGET', 'warn',
        `Presupuesto de días duros de la semana: ${_vpNum(budget, 1)} sobre un tope orientativo de ${VP_MAX_BUDGET} (BUD-001 es informativo, no una regla dura).`,
        ['BUD-001']);
    }

    // ---- G-S10 · SUMMER-PACE (ENV-001) ----
    const month = String(c.todayStr || (facts.meta && facts.meta.todayStr) || '').slice(5, 7);
    if (VP_SUMMER_MONTHS[month] && _vpMentionsPaceProgress(decisions, briefing)) {
      add('SUMMER-PACE', 'warn',
        `Se lee progreso aeróbico por RITMO en ${month === '06' ? 'junio' : month === '07' ? 'julio' : month === '08' ? 'agosto' : 'septiembre'}: con calor el ritmo a FC fija empeora sin que la forma cambie (ENV-001). Mide por FC y por duración.`,
        ['ENV-001', 'END-002']);
    }

    // ---- G-S11 · Z2-CEILING ----
    const zones = c.zones || (facts.cardio && facts.cardio.z2Ceiling) || null;
    const planCeil = _vpPlanZ2Ceiling(p);
    const zoneCeil = _n(zones && (zones.bpm != null ? zones.bpm : (zones.z && zones.z.zone2 && zones.z.zone2[1])));
    if (planCeil != null && zoneCeil != null && planCeil !== zoneCeil) {
      add('Z2-CEILING', 'warn',
        `El plan usa un techo de Z2 de ${_vpNum(planCeil, 0)} bpm y las zonas dicen ${_vpNum(zoneCeil, 0)} bpm. Dos techos para la misma zona es cómo la app y el reloj acaban discrepando.`,
        ['END-001', 'END-002']);
    }

    // ---- G-S12 · CHURN / ROTATION (GEN-001, STR-010) ----
    const priorities = (briefing && Array.isArray(briefing.priorities)) ? briefing.priorities.length : null;
    if (priorities != null && priorities > 3) {
      add('CHURN', 'warn',
        `${priorities} prioridades en el briefing: el tope son 3. Más de tres prioridades no son prioridades.`,
        ['GEN-001']);
    }
    const changes = _vpStructuralChanges(sessions);
    if (changes.total > VP_MAX_STRUCTURAL_CHANGES) {
      add('CHURN', 'warn',
        `${changes.total} cambios estructurales en una semana (tope orientativo ${VP_MAX_STRUCTURAL_CHANGES}): con tanto movimiento a la vez no se puede saber qué funcionó.`,
        ['GEN-001', 'STR-010']);
    }
    const blockIndex = _n((c.block && c.block.index) != null ? c.block.index : (p.block && p.block.weekIndex));
    if (changes.swaps > 0 && blockIndex != null && blockIndex !== 1) {
      add('ROTATION', 'warn',
        `${changes.swaps} cambio(s) de ejercicio en la semana ${blockIndex} del bloque: los accesorios rotan en la semana 1, con motivo (STR-010, \`expert\`: es práctica, no evidencia fuerte).`,
        ['STR-010', 'SEL-002']);
    }
  } catch (e) {
    // Un validador que lanza convierte "aplicar el plan" en un error de JavaScript. Se avisa
    // del fallo como un aviso más y se devuelve lo que se pudo comprobar.
    out.push({ id: 'VALIDATOR-ERROR', level: 'warn', text: `El validador falló a mitad (${e && e.message ? e.message : e}): los avisos de abajo pueden estar incompletos.`, ruleIds: [] });
  }
  return out;
}

// ---------- helpers del validador ----------

/**
 * Normaliza `libraryIds` / `lowerSessionIds` a un Set, venga como Set, array u objeto-mapa.
 *
 * EL DETALLE QUE HA COSTADO UN TEST: `v instanceof Set` es FALSO cuando el Set se construyó en
 * otro realm — y eso es exactamente lo que pasa cuando este fichero corre dentro de un
 * contexto `vm` y el llamador (el test) crea el Set fuera. El resultado era un Set vacío, con
 * lo que TODOS los ids parecían desconocidos y `lowerSessionIds` no reconocía ningún día de
 * pierna. Se detecta por FORMA (`has` + `forEach`), no por identidad de constructor.
 */
function _vpSet(v) {
  if (!v) return null;
  if (typeof v.has === 'function' && typeof v.forEach === 'function') return v;
  if (Array.isArray(v)) return new Set(v);
  if (typeof v === 'object') return new Set(Object.keys(v));
  return null;
}

const _VP_DOW_ES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function _vpDow(dow) { return _VP_DOW_ES[((_n(dow) || 0) % 7 + 7) % 7]; }

function _vpCount(tpl, pred) {
  let n = 0;
  for (let dow = 0; dow <= 6; dow++) {
    const s = (tpl && (tpl[dow] || tpl[String(dow)])) || null;
    if (s && pred(s)) n++;
  }
  return n;
}

/** Series por músculo y total de la semana: series × veces que la sesión aparece en el template. */
function _vpSetsPerMuscle(sessions, tpl) {
  const occurrences = {};
  if (tpl) {
    for (let dow = 0; dow <= 6; dow++) {
      const s = tpl[dow] || tpl[String(dow)];
      if (s && s.type === 'gym' && s.session) occurrences[s.session] = (occurrences[s.session] || 0) + 1;
    }
  }
  const byMuscle = {};
  let total = 0;
  for (const [sid, s] of Object.entries(sessions || {})) {
    const times = tpl ? (occurrences[sid] || 0) : 1;
    if (!times) continue;
    for (const ex of (s.exercises || [])) {
      if (!ex) continue;
      const n = (_n(ex.sets) || 0) * times;
      if (!n) continue;
      const m = ex.muscle || 'otros';
      byMuscle[m] = (byMuscle[m] || 0) + n;
      total += n;
    }
  }
  return { byMuscle, total, occurrences };
}

function _vpVolumeGatesOk(facts) {
  const adh = (facts.adherence || []).slice(-4);
  if (!adh.length) return false;
  const pcts = adh.map(a => _n(a.gym && a.gym.pctToDate)).filter(x => x != null);
  const adhOk = pcts.length ? _mean(pcts) >= 75 : false;
  const sc = facts.readiness && facts.readiness.score;
  const greenOk = sc ? (_n(sc.red7) === 0 && (_n(sc.yellow7) || 0) <= 1) : false;
  const nutOk = _n(facts.nutrition && facts.nutrition.daysLogged14) != null
    ? _n(facts.nutrition.daysLogged14) >= FACTS_MIN_NUTRITION_DAYS_14 : false;
  return adhOk && greenOk && nutOk;
}

function _vpSlotIsHardCardio(slot) {
  if (!slot) return false;
  if (slot.type !== 'run' && slot.type !== 'hybrid') return false;
  const sub = String((slot.cardio && slot.cardio.subtype) || slot.subtype || '');
  if (VP_HARD_SUBTYPES[sub]) return true;
  return /hybrid|hibrido|híbrido|sled|trineo|benchmark/i.test(String(slot.label || '') + ' ' + sub);
}

function _vpHardCardio(plan, tpl) {
  const labels = [];
  if (tpl) {
    for (let dow = 0; dow <= 6; dow++) {
      const s = tpl[dow] || tpl[String(dow)];
      if (_vpSlotIsHardCardio(s)) labels.push(`${_vpDow(dow)} ${(s.cardio && s.cardio.subtype) || s.subtype || s.label || 'duro'}`);
    }
  }
  const declared = _n(plan && plan.running && plan.running.hardSessions);
  const count = labels.length || (declared != null ? declared : 0);
  if (!labels.length && declared) labels.push(`${declared} declarada(s) en \`running.hardSessions\``);
  return { count, labels };
}

function _vpPlyoExercises(sessions) {
  const out = [];
  for (const [sid, s] of Object.entries(sessions || {})) {
    (s.exercises || []).forEach((ex, i) => {
      if (!ex || !VP_PLYO_IDS[ex.id]) return;
      const reps = _n(String(ex.reps || '').replace(/[^\d.]/g, ''));
      out.push({
        sid, sessionName: s.name || sid, id: ex.id, index: i,
        contacts: (reps != null && _n(ex.sets) != null) ? reps * _n(ex.sets) : null,
      });
    });
  }
  return out;
}

function _vpCorePatterns(sessions, ctx) {
  const lib = (ctx && ctx.exerciseLibrary) || null;
  const AR = { 'pallof-press': 1, 'suitcase-carry': 1, 'farmer-carry': 1, 'bird-dog': 1, 'side-plank': 1 };
  const AE = { 'ab-wheel': 1, 'plank': 1, 'dead-bug': 1, 'back-extension': 1 };
  let antiRotation = false, antiExtension = false;
  for (const s of Object.values(sessions || {})) {
    for (const ex of (s.exercises || [])) {
      if (!ex || !ex.id) continue;
      const pat = (lib && lib[ex.id] && lib[ex.id].movementPattern) || null;
      if (pat === 'core-anti-rotation' || AR[ex.id]) antiRotation = true;
      if (pat === 'core-anti-extension' || AE[ex.id]) antiExtension = true;
    }
  }
  return { antiRotation, antiExtension };
}

/**
 * Slots de movilidad de la semana. Cuenta los días `recovery` MÁS los días de gimnasio cuya
 * sesión trae movilidad dentro (`mobilityMin`, o un ejercicio de movilidad).
 *
 * Por qué las dos cosas: la forma que de verdad ocurre son los 5-8' al final de Lower A/B con
 * el temporizador (C.1), no un día dedicado. Contar sólo los días `recovery` daría un aviso
 * permanente sobre el plan que sí cumple ATH-006.
 */
function _vpMobilitySlots(sessions, tpl) {
  const withMobility = new Set();
  for (const [sid, s] of Object.entries(sessions || {})) {
    const inline = _n(s.mobilityMin) != null && _n(s.mobilityMin) > 0;
    const asEx = (s.exercises || []).some(e => e && /mobility|movilidad|stretch|estiramiento/i.test(String(e.id) + ' ' + String(e.name)));
    if (inline || asEx) withMobility.add(sid);
  }
  if (!tpl) return _vpCount({}, () => false) + withMobility.size;
  return _vpCount(tpl, s => s.type === 'recovery')
    + _vpCount(tpl, s => s.type === 'gym' && s.session && withMobility.has(s.session));
}

function _vpPressExposures(sessions, tpl, ctx) {
  const lib = (ctx && ctx.exerciseLibrary) || null;
  const isPress = (id) => {
    const pat = (lib && lib[id] && lib[id].movementPattern) || null;
    return pat ? !!FACTS_PRESS_PATTERNS[pat] : !!FACTS_PRESS_IDS[id];
  };
  const withPress = new Set();
  for (const [sid, s] of Object.entries(sessions || {})) {
    if ((s.exercises || []).some(e => e && isPress(e.id))) withPress.add(sid);
  }
  if (!tpl) return withPress.size;
  return _vpCount(tpl, s => s.type === 'gym' && s.session && withPress.has(s.session));
}

/**
 * Duración estimada de una sesión: 10' de calentamiento + por serie (descanso + ~45 s de
 * trabajo). Es una estimación de presupuesto, no una medida — para eso están los `blockTimings`.
 */
function _vpSessionMin(s) {
  const exs = (s && s.exercises) || [];
  if (!exs.length) return null;
  let sec = 10 * 60;
  for (const ex of exs) {
    if (!ex) continue;
    const sets = _n(ex.sets) || 0;
    const rest = _n(ex.defaultRest) != null ? _n(ex.defaultRest) : 90;
    sec += sets * (rest + 45);
  }
  return sec / 60;
}

function _vpBudget(plan, tpl, ctx) {
  const declared = _n(plan && plan.budgetWeight);
  if (declared != null) return declared;
  if (!tpl) return null;
  const lowerSet = _vpSet(ctx && ctx.lowerSessionIds);
  let bw = 0;
  for (let dow = 0; dow <= 6; dow++) {
    const s = tpl[dow] || tpl[String(dow)];
    if (!s) continue;
    if (s.type === 'gym') bw += (lowerSet && s.session && lowerSet.has(s.session)) ? 2 : 1;
    else if (s.type === 'run') {
      const sub = (s.cardio && s.cardio.subtype) || s.subtype || 'zone2';
      bw += _n(FACTS_CARDIO_BW[sub]) != null ? FACTS_CARDIO_BW[sub] : 1;
    }
  }
  return bw;
}

/**
 * Los números de nutrición que la propuesta pone sobre la mesa: la cabecera `plan.nutrition`
 * y los que vengan dentro de una decisión de tipo `nutrition`.
 *
 * Se queda con el MÍNIMO de los dos, no con el primero que aparezca. Si la cabecera dice 190 g
 * de proteína y una decisión dice "bajar a 150", el número que hay que auditar es el 150: con
 * la lógica de "el primero que exista", una decisión que rompe el suelo pasaba invisible detrás
 * de una cabecera correcta.
 */
function _vpNutrition(plan, decisions) {
  const out = { proteinG: null, kcalTraining: null, kcalRest: null, dietBreak: null };
  const lower = (key, v) => { const x = _n(v); if (x != null && (out[key] == null || x < out[key])) out[key] = x; };
  const n = plan && plan.nutrition;
  if (n) {
    lower('proteinG', n.proteinG != null ? n.proteinG : n.protein);
    lower('kcalTraining', n.kcalTraining);
    lower('kcalRest', n.kcalRest);
    if (typeof n.dietBreak === 'boolean') out.dietBreak = n.dietBreak;
    if (typeof n.maintenance === 'boolean' && out.dietBreak == null) out.dietBreak = n.maintenance;
  }
  for (const dec of (decisions || [])) {
    if (!dec || dec.type !== 'nutrition') continue;
    const num = (dec.evidence && dec.evidence.numbers) || dec.numbers || {};
    lower('proteinG', num.proteinG);
    lower('kcalTraining', num.kcalTraining);
    lower('kcalRest', num.kcalRest);
    if (out.dietBreak == null && typeof num.dietBreak === 'boolean') out.dietBreak = num.dietBreak;
  }
  return out;
}

function _vpTouchesKcal(decisions, plan) {
  if (plan && plan.nutrition && (_n(plan.nutrition.kcalTraining) != null || _n(plan.nutrition.kcalRest) != null)) return true;
  return (decisions || []).some(d => d && d.type === 'nutrition');
}

function _vpMentionsPaceProgress(decisions, briefing) {
  const texts = [];
  for (const d of (decisions || [])) if (d) texts.push(`${d.what || ''} ${d.why || ''}`);
  if (briefing) texts.push(`${briefing.lastWeek || ''} ${briefing.nextWeek || ''} ${(briefing.priorities || []).join(' ')}`);
  const t = texts.join(' ').toLowerCase();
  if (!t) return false;
  return /(ritmo|pace)[^.]{0,60}(mejor|baja|sube|progres|más rápido|mas rapido)/.test(t)
      || /(mejor|progres)[^.]{0,60}(ritmo|pace)/.test(t);
}

function _vpPlanZ2Ceiling(plan) {
  const cands = [];
  const r = plan && plan.running;
  if (r && _n(r.z2CeilingBpm) != null) cands.push(_n(r.z2CeilingBpm));
  for (const item of ((r && r.plan) || [])) {
    const m = String((item && item.note) || '').match(/(\d{2,3})\s*bpm/);
    if (m) cands.push(_n(m[1]));
  }
  const wt = plan && plan.weekTemplate;
  if (wt) {
    for (let dow = 0; dow <= 6; dow++) {
      const s = wt[dow] || wt[String(dow)];
      const m = String((s && s.cardio && s.cardio.note) || '').match(/(\d{2,3})\s*bpm/);
      if (m) cands.push(_n(m[1]));
    }
  }
  return cands.length ? cands[0] : null;
}

function _vpStructuralChanges(sessions) {
  let total = 0, swaps = 0;
  for (const s of Object.values(sessions || {})) {
    for (const ch of (s.changes || [])) {
      if (!ch) continue;
      total++;
      if (ch.kind === 'swap' || ch.kind === 'add' || ch.kind === 'remove') swaps++;
    }
  }
  return { total, swaps };
}

/** Días de FUERZA que trae cada variante del ideal (IDEAL_BLOCK_V1). 0 = viaje. */
function _vpStrengthDaysForVariant(n) {
  const map = { 0: 2, 3: 2, 4: 2, 5: 3, 6: 4 };
  return map[n] != null ? map[n] : null;
}

// ============================================================
// DIFF Y MERGE DE VERSIONES
// ============================================================

/**
 * Qué cambia de `a` a `b`. `structural` cuenta lo que altera la estructura de la semana
 * (template, ejercicios añadidos/quitados/reordenados, series); los kg y las reps del objetivo
 * NO son estructurales: cambian cada semana por diseño y contarlos convertiría cualquier
 * progresión normal en "churn".
 */
function diffPlanVersions(a, b) {
  const A = a || {}, B = b || {};
  const weekTemplate = [];
  for (let dow = 0; dow <= 6; dow++) {
    const sa = (A.weekTemplate && (A.weekTemplate[dow] || A.weekTemplate[String(dow)])) || null;
    const sb = (B.weekTemplate && (B.weekTemplate[dow] || B.weekTemplate[String(dow)])) || null;
    if (stableStringify(sa) !== stableStringify(sb)) weekTemplate.push({ dow, from: sa, to: sb });
  }
  const sessions = {};
  const ids = new Set([...Object.keys(A.sessions || {}), ...Object.keys(B.sessions || {})]);
  for (const sid of ids) {
    const sa = (A.sessions || {})[sid] || null;
    const sb = (B.sessions || {})[sid] || null;
    if (stableStringify(sa) === stableStringify(sb)) continue;
    const exA = (sa && sa.exercises) || [];
    const exB = (sb && sb.exercises) || [];
    const idsA = exA.map(e => e.id), idsB = exB.map(e => e.id);
    const added = idsB.filter(id => idsA.indexOf(id) === -1);
    const removed = idsA.filter(id => idsB.indexOf(id) === -1);
    const common = idsA.filter(id => idsB.indexOf(id) !== -1);
    const reordered = stableStringify(common) !== stableStringify(idsB.filter(id => idsA.indexOf(id) !== -1));
    const setsChanged = [];
    const targets = [];
    for (const id of common) {
      const ea = exA.find(e => e.id === id), eb = exB.find(e => e.id === id);
      if (_n(ea.sets) !== _n(eb.sets)) setsChanged.push({ exId: id, from: _n(ea.sets), to: _n(eb.sets) });
      const ta = ea.target || {}, tb = eb.target || {};
      if (_n(ta.kg) !== _n(tb.kg) || (ta.reps || null) !== (tb.reps || null) || (ta.rpe || null) !== (tb.rpe || null)) {
        targets.push({ exId: id, fromKg: _rKg(ta.kg), toKg: _rKg(tb.kg), fromReps: ta.reps || null, toReps: tb.reps || null, fromRpe: ta.rpe || null, toRpe: tb.rpe || null });
      }
    }
    sessions[sid] = {
      added, removed, reordered, setsChanged, targets,
      focusChanged: ((sa && sa.focus) || null) !== ((sb && sb.focus) || null),
      sessionAdded: !sa, sessionRemoved: !sb,
    };
  }
  const running = stableStringify(A.running || null) === stableStringify(B.running || null)
    ? null : { from: A.running || null, to: B.running || null };
  let structural = weekTemplate.length + (running ? 1 : 0);
  for (const s of Object.values(sessions)) {
    structural += s.added.length + s.removed.length + s.setsChanged.length
      + (s.reordered ? 1 : 0) + (s.sessionAdded ? 1 : 0) + (s.sessionRemoved ? 1 : 0);
  }
  return { weekTemplate, sessions, running, structural };
}

/**
 * Aplica una propuesta del coach sobre el plan activo.
 *
 * DOS INVARIANTES, y los dos han costado un bug antes:
 *   1. **Las sesiones NO tocadas se copian tal cual.** Si el coach sólo habla de Upper B, la
 *      Lower A que sale es byte a byte la que entró. Una propuesta parcial no puede convertirse
 *      en una reescritura silenciosa del resto de la semana.
 *   2. **`warmup` se quita de las sesiones que el coach toca.** `startWorkout` cae a
 *      `PLAN.sessions[id].warmup`, así que los arreglos de calentamiento que viajan con
 *      `PLAN_REV` siguen llegando al teléfono. Un warm-up congelado dentro de un plan del coach
 *      sería la única parte de la app que deja de recibir actualizaciones.
 *
 * @param {object} activePlan
 * @param {object} proposal `{ label, phase, sessions:[{id, focus, exercises, changes}],
 *                             cardio:[{dow, subtype, durationMin, distanceKm, note}],
 *                             running:{...}, weekTemplateChanges:[{dow, slot}] }`
 * @returns {{label, sessions, weekTemplate, running, phase, touched, strippedWarmup, cardioDays}}
 */
function mergeProposal(activePlan, proposal) {
  const base = activePlan || {};
  const prop = proposal || {};
  const sessions = {};
  for (const [sid, s] of Object.entries(base.sessions || {})) sessions[sid] = s;   // intactas, misma referencia

  const touched = [];
  const stripped = [];
  for (const ps of (prop.sessions || [])) {
    if (!ps || !ps.id) continue;
    const prev = (base.sessions || {})[ps.id] || {};
    const merged = Object.assign({}, prev, ps);
    if (Object.prototype.hasOwnProperty.call(merged, 'warmup')) { delete merged.warmup; stripped.push(ps.id); }
    merged.id = ps.id;
    if (!merged.name) merged.name = prev.name || ps.id;
    sessions[ps.id] = merged;
    touched.push(ps.id);
  }

  // Template: copia profunda para no mutar el plan activo, y luego los cambios declarados.
  const weekTemplate = JSON.parse(JSON.stringify(base.weekTemplate || {}));
  for (const ch of (prop.weekTemplateChanges || [])) {
    if (!ch || _n(ch.dow) == null) continue;
    const dow = _n(ch.dow);
    weekTemplate[dow] = ch.slot ? JSON.parse(JSON.stringify(ch.slot)) : { type: 'rest', label: 'Rest' };
  }
  const cardioDays = [];
  for (const cd of (prop.cardio || [])) {
    if (!cd || _n(cd.dow) == null) continue;
    const dow = _n(cd.dow);
    if (!weekTemplate[dow]) weekTemplate[dow] = { type: 'run', label: 'Cardio' };
    weekTemplate[dow].cardio = {
      durationMin: _rMin(cd.durationMin),
      distanceKm: _rKm(cd.distanceKm),
      subtype: cd.subtype || weekTemplate[dow].subtype || 'zone2',
      hrZone: cd.hrZone || 'z2',
      note: _trunc(cd.note, FACTS_NOTE_CHARS),
      source: 'coach',
    };
    cardioDays.push(dow);
  }

  return {
    label: prop.label || base.label || null,
    phase: prop.phase || (base.block && base.block.phase) || null,
    sessions,
    weekTemplate,
    running: prop.running ? Object.assign({}, base.running || {}, prop.running) : (base.running || null),
    touched, strippedWarmup: stripped, cardioDays,
  };
}

// ==================== EXPORTS PARA LOS TESTS ====================
// `tests/verify-coach-facts.mjs` y `tests/verify-plan-validator.mjs` cargan este fichero en
// `vm` junto a `coach-engine.js` y leen sus exports por aquí. En el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    // API pública
    buildCoachFacts,
    validatePlanVersion,
    diffPlanVersions,
    mergeProposal,
    stableStringify,
    // Constantes (el test comprueba los umbrales, no los reescribe)
    FACTS_SCHEMA, FACTS_WEEKS, FACTS_MAX_LIFT_SESSIONS, FACTS_MAX_RUNS, FACTS_MAX_REVIEWS,
    FACTS_MAX_DECISIONS, FACTS_Z2_CEILING_DEFAULT, FACTS_Z2_TOLERANCE, FACTS_STALE_DAYS,
    FACTS_MIN_WORKOUTS, FACTS_MIN_WELLNESS_DAYS_7, FACTS_MIN_NUTRITION_DAYS_28,
    FACTS_MIN_NUTRITION_DAYS_14, FACTS_MIN_MEASURED_WEIGHTS, FACTS_DELOAD_WASHOUT_DAYS,
    FACTS_TREND_PCT, FACTS_GREEN, FACTS_YELLOW, FACTS_PRESS_IDS, FACTS_CARDIO_BW,
    VP_FLOORS, VP_MAX_SETS_PER_MUSCLE, VP_MAX_HARD_CARDIO, VP_MAX_BUDGET,
    VP_MAX_PRESS_EXPOSURES, VP_MAX_SESSION_MIN, VP_MAX_PLYO_CONTACTS,
    VP_MAX_STRUCTURAL_CHANGES, VP_MIN_STRENGTH_SESSIONS, VP_MIN_MOBILITY_SLOTS,
    VP_DELOAD_VOLUME_FACTOR, VP_KM_HARD_FACTOR, VP_KM_SOFT_FACTOR, VP_REENTRY_KM_CAP,
    VP_REENTRY_DAYS, VP_LOAD_JUMP_PCT, VP_LOAD_DROP_PCT, VP_TARGET_STALE_DAYS,
    VP_ANCHOR_SWAPS, VP_ANCHORS,
    // Internos que los tests usan para no re-implementar aritmética
    _cfShift, _cfDiff, _cfIsoWeek, _cfMonday, _durMin, _paceSec, _fmtPace,
    _slopePerWeek, _liftTrend, _z2Compliant, _sanitize,
    _vpSetsPerMuscle, _vpSessionMin, _vpPlyoExercises, _vpMobilitySlots, _vpHardCardio,
  };
}
