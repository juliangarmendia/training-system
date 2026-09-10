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

// v11.71 (auditoría 2026-09-09): esquema 3. Campos nuevos y todos ADITIVOS —
// `progress.performance` (F-6), `plan.plannedSetsPerMuscle` (F-7), `readiness.firedSignals` como
// contrato del motor (F-9), `readiness.sleep.{consistency7,debtHrs7,score7}` (F-11),
// `readiness.subjective` (F-12), `readiness.hydration7` (F-13), `lifts[id].atSameLoad` (F-18),
// `adherence[].restCompliancePct` (F-19) y `cardio.mvpaMinByWeek`/`mvpaBand` (F-22).
const FACTS_SCHEMA = 3;                 // versión del esquema del pack (viaja en `meta`)
const FACTS_WEEKS = 4;                  // ventana de semanas ISO (§A.4)
const FACTS_LONG_WINDOW_DAYS = 28;      // ventana larga para baselines y nutrición
const FACTS_MAX_LIFT_SESSIONS = 4;      // ≤4 sesiones por ejercicio
const FACTS_MAX_RUNS = 10;              // ≤10 carreras
// Revisiones previas: 6, pero sólo las 3 más recientes van completas (con extracto y
// decisiones); las 4-6 viajan COMPACTAS. El coach necesita memoria larga para no repetir un
// experimento que ya falló hace dos meses, y no necesita releer la prosa de aquella semana.
const FACTS_MAX_REVIEWS = 6;            // ≤6 revisiones previas (3 completas + 3 compactas)
const FACTS_FULL_REVIEWS = 3;           // las N más recientes van con extracto y decisiones
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

// ---- TRAYECTORIA (B.2 del plan v2.1) ----------------------------------------------------
// El coach semanal tiene que leer TODO EL RECORRIDO, no las últimas 4 semanas: cómo viene
// entrenando, cuánto ha avanzado hacia el objetivo, y qué hizo y qué no. Las ventanas de
// abajo son el compromiso entre memoria y tamaño del prompt.
const FACTS_TRAJ_WEEKS = 12;             // km/semana y adherencia: 12 semanas ISO
const FACTS_TRAJ_Z2_WEEKS = 8;           // cumplimiento Z2 por semana: 8
const FACTS_TRAJ_PHASE_HISTORY = 8;      // fases de carrera registradas: ≤8
const FACTS_TRAJ_FOLLOWUP = 6;           // decisiones de coach/plan a revisar: ≤6
const FACTS_TRAJ_WHAT_CHARS = 120;       // el `what` de una decisión en el seguimiento
const FACTS_TRAJ_MAX_BLOCKS = 24;        // guarda del bucle de bloques (≈2 años)
const FACTS_BLOCK_WEEKS_DEFAULT = 5;     // 4 de carga + 1 de descarga (LOAD-004)
// Pendiente desde el inicio: mínimos cuadrados sobre pesadas MEDIDAS. Con menos de 6 puntos
// repartidos en meses, la recta la decide la primera pesada; eso no es una tendencia.
const FACTS_TRAJ_MIN_SLOPE_POINTS = 6;
// Programa corto: por debajo de 8 semanas las pendientes desde el inicio son orientativas.
const FACTS_TRAJ_MIN_WEEKS = 8;
// "Lo que no se hizo tres veces no se recuerda": ≥3 saltos en las últimas ≤6 exposiciones.
const FACTS_TRAJ_SKIP_WINDOW = 6;
const FACTS_TRAJ_SKIP_MIN = 3;

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
// END-009 / ACSM 2024 (Jakicic): 150 min/semana de MVPA es el suelo de salud y 200-300 la banda de
// pérdida de grasa. Los mismos números que `VP_MIN_MVPA_MIN` / `VP_MVPA_FAT_LOSS_MIN` del
// validador — declarados aquí para que el pack publique la banda contra la que se le juzga.
const FACTS_MVPA_BAND = [200, 300];
const FACTS_MVPA_FLOOR_MIN = 150;

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
    trajectory: _factsTrajectory(ctx),
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
    // Helpers PUROS del motor (`coach-engine.js`). Se aceptan por `deps` para que un test
    // pueda inyectarlos, y si no vienen se cogen del global del motor — que es como este
    // fichero ya usa `blockWeekFromDates`/`isoWeekKey`/`mondayOf`. Nunca se llama a nada de
    // `app.js`: `computeReadiness()` toca `state` y IndexedDB; `computeReadinessFrom` no.
    computeReadinessFrom: typeof p.computeReadinessFrom === 'function' ? p.computeReadinessFrom
      : (typeof computeReadinessFrom === 'function' ? computeReadinessFrom : null),
    blockWeekFromDates: typeof p.blockWeekFromDates === 'function' ? p.blockWeekFromDates
      : (typeof blockWeekFromDates === 'function' ? blockWeekFromDates : null),
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
  gaps.push(`No intervals.icu HR zones (\`icuZones\`): the Z2 ceiling in use is ${d.z2Ceiling != null ? d.z2Ceiling : FACTS_Z2_CEILING_DEFAULT} bpm DECLARED, not measured.`);
  return { bpm: d.z2Ceiling != null ? _rMin(d.z2Ceiling) : FACTS_Z2_CEILING_DEFAULT, source: 'declared', lthr: null, maxHr: null };
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
      priorReviews: FACTS_MAX_REVIEWS, priorReviewsFull: FACTS_FULL_REVIEWS,
      decisions: FACTS_MAX_DECISIONS, trajectoryWeeks: FACTS_TRAJ_WEEKS,
    },
  };
}

// ---------- goals ----------

function _factsGoals(ctx) {
  const g = ctx.settings && ctx.settings.goals;
  if (!g) {
    ctx.gaps.push('No `settings.goals`: goals are not seeded, so there is nothing to measure progress against.');
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
      out.push({ from: mon, to: _cfShift(mon, 6 + FACTS_DELOAD_WASHOUT_DAYS), reason: 'deload / diet break + 5 days' });
    }
    mon = _cfShift(mon, 7);
  }
  return { intervals: out, known: true };
}

// ---------- trajectory · TODO EL RECORRIDO ----------
//
// EL FALLO QUE IMPIDE. Hasta el esquema 1 el pack sólo enseñaba 4 semanas, así que el coach
// no podía responder a "cómo viene entrenando" ni a "cuánto ha avanzado hacia el objetivo":
// cada domingo empezaba de cero, y una sesión que lleva tres meses sin tocarse parecía
// exactamente igual de nueva que la de la semana pasada. Esta sección es la memoria larga —
// compacta a propósito (<12.000 chars de `stableStringify`): agregados por bloque, por
// semana y por ancla, nunca filas crudas.
//
// Todo lo que hay aquí es el MISMO dato que ya usa el resto del pack, agregado en otra
// ventana: las pesadas MEDIDAS (nunca el forward-fill), las carreras DEDUPEADAS, los kg
// convertidos con `deps.convertWeight`. Un número que aquí saliera distinto del de
// `progress` sería una segunda contabilidad, y el modelo citaría la que le conviniera.

function _factsTrajectory(ctx) {
  return {
    program: _trajProgram(ctx),
    weight: _trajWeight(ctx),
    anchors: _trajAnchors(ctx),
    running: _trajRunning(ctx),
    adherenceByWeek: _trajAdherence(ctx),
    // Declarado una vez para toda la sección: lo planificado de una semana de hace dos meses
    // se proyecta desde la PLANTILLA ACTUAL. El plan de entonces no se guarda por semana.
    plannedIsApprox: true,
    skippedPatterns: _trajSkipped(ctx),
    decisionsFollowUp: _trajFollowUp(ctx),
  };
}

/** Semanas ISO que abarca [from, to], ambas incluidas. 1 = la misma semana. */
function _weeksSpan(from, to) {
  const a = _cfMonday(from), b = _cfMonday(to);
  if (!a || !b) return null;
  const d = _cfDiff(a, b);
  return d == null ? null : Math.floor(d / 7) + 1;
}

/**
 * El programa: desde cuándo, cuánto se ha entrenado y en qué bloque cae cada tramo.
 *
 * El índice 0 (`pre-bloque`) es todo lo anterior al ancla de descarga. No es un bloque de
 * verdad y por eso no se numera: `blockWeekFromDates` devuelve `index: null` antes del ancla
 * a propósito (no se extrapola hacia atrás), pero el coach sí necesita saber que ahí hubo
 * entrenamiento y cuánto.
 */
function _trajProgram(ctx) {
  const dates = ctx.workouts.map(w => _cfDate(w.date)).filter(Boolean).sort();
  const firstWorkoutDate = dates.length ? dates[0] : null;
  const anchor = _cfDate(ctx.settings.deloadAnchorDate);
  const blockWeeks = _n(ctx.settings.deloadBlockWeeks)
    || _n((ctx.inp.block || {}).weeksTotal) || FACTS_BLOCK_WEEKS_DEFAULT;
  const weeksSince = firstWorkoutDate ? _weeksSpan(firstWorkoutDate, ctx.todayStr) : null;

  const count = (from, to) => {
    const runs = ctx.runs.filter(r => _inWindow(r.date, from, to));
    return {
      strengthSessions: ctx.workouts.filter(w => _inWindow(w.date, from, to)).length,
      runs: runs.length,
      km: _rKm(_sum(runs.map(r => _n(r.distance)))),
    };
  };
  const mk = (index, label, from, to) => Object.assign(
    { index, label, from, to, weeks: _weeksSpan(from, to) }, count(from, to));

  const blocks = [];
  if (!anchor) {
    // Sin ancla no hay bloques: el recorrido entero es un tramo suelto. El hueco lo declara
    // `validWindow.reasons`; aquí no se inventa una numeración que no existe.
    if (firstWorkoutDate) blocks.push(mk(0, 'pre-bloque', firstWorkoutDate, ctx.todayStr));
  } else {
    // El `pre-bloque` sólo existe si de verdad hubo entrenamiento antes del ancla.
    if (firstWorkoutDate && firstWorkoutDate < anchor) {
      blocks.push(mk(0, 'pre-bloque', firstWorkoutDate, _cfShift(anchor, -1)));
    }
    let from = _cfMonday(anchor);
    for (let i = 1; from && from <= ctx.todayStr && i <= FACTS_TRAJ_MAX_BLOCKS; i++) {
      const end = _cfShift(from, blockWeeks * 7 - 1);
      const to = end <= ctx.todayStr ? end : ctx.todayStr;
      const row = mk(i, `B${i}`, from, to);
      if (from <= ctx.todayStr && ctx.todayStr <= end) row.isCurrent = true;
      blocks.push(row);
      from = _cfShift(end, 1);
    }
  }

  const total = dates.length;
  return {
    firstWorkoutDate,
    weeksSince,
    totalStrengthSessions: total,
    sessionsPerWeekAvg: weeksSince ? _round(total / weeksSince, 0.1) : null,
    anchorDate: anchor,
    blockWeeks,
    blocks,
  };
}

/**
 * Peso desde el inicio del programa: cuánto se ha movido y a qué ritmo.
 *
 * SÓLO PESADAS MEDIDAS, igual que `progress.weight` (el forward-fill de intervals.icu es una
 * recta y aplana cualquier regresión). La pendiente que pilota el ETA es la de 28 días si
 * existe — es la que describe el déficit de AHORA; la de todo el recorrido se queda como
 * contexto, porque incluye descargas, diet breaks y el rebote del principio.
 */
function _trajWeight(ctx) {
  const g = (ctx.settings.goals || {}).primary || {};
  const startKg = _rBw(g.startWeightKg);
  const startDate = _cfDate(g.startDate);
  const measured = _weightDays(ctx).measured;
  const since = startDate ? measured.filter(r => r.date >= startDate) : measured.slice();
  const first = since.length ? since[0] : null;

  // La media de 7 días es la MISMA que la de `progress.weight.mean7`: mismo filtro, misma
  // ventana. Dos medias distintas del mismo peso en el mismo pack es cómo el modelo acaba
  // citando la que le conviene.
  const m7 = measured.filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < 7; });
  const latest7dMean = _rBw(_mean(m7.map(r => r.kg)));
  const base = startKg != null ? startKg : (first ? _rBw(first.kg) : null);
  const deltaKg = (latest7dMean != null && base != null) ? _rBw(latest7dMean - base) : null;

  const slopeSince = since.length >= FACTS_TRAJ_MIN_SLOPE_POINTS ? _rSlope(_slopePerWeek(since)) : null;
  const slope28 = _rSlope(_slopePerWeek(measured.filter(r => {
    const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < FACTS_LONG_WINDOW_DAYS;
  })));
  const slopeUsedForEta = slope28 != null ? '28d' : (slopeSince != null ? 'sinceStart' : null);
  const slope = slopeUsedForEta === '28d' ? slope28 : (slopeUsedForEta === 'sinceStart' ? slopeSince : null);

  // ETA sólo si de verdad se está bajando. Con pendiente ≥0 la división da un número negativo
  // y el modelo lo leería como "faltan −12 semanas".
  const eta = (target) => {
    const t = _n(target);
    if (t == null || slope == null || slope >= 0 || latest7dMean == null) return null;
    if (latest7dMean <= t) return 0;
    return _round((latest7dMean - t) / -slope, 0.1);
  };
  const band = g.targetWeightKg;
  const targetHi = Array.isArray(band) ? _n(band[band.length - 1]) : _n(band);

  const notes = [];
  if (startKg == null && !first) notes.push('no starting weight and no measured weigh-ins: there is no trajectory to measure');
  if (since.length && since.length < FACTS_TRAJ_MIN_SLOPE_POINTS) {
    notes.push(`only ${since.length} measured weigh-ins since the start (gate ${FACTS_TRAJ_MIN_SLOPE_POINTS}): the trajectory slope goes to null`);
  }
  if (slopeUsedForEta === 'sinceStart') {
    notes.push('the ETA uses the slope of the WHOLE trajectory (there are no 28 days with weigh-ins): it includes deloads and diet breaks');
  }
  if (slope != null && slope >= 0) notes.push('the slope is not going down: no ETA until it does');

  return {
    startKg, startDate,
    firstMeasured: first ? { kg: _rBw(first.kg), date: first.date } : null,
    nMeasuredSinceStart: since.length,
    latest7dMean,
    deltaKg,
    slopeSinceStartKgPerWeek: slopeSince,
    slopeUsedForEta,
    weeksToMilestoneAtCurrentSlope: eta(g.milestoneKg),
    weeksToTargetAtCurrentSlope: eta(targetHi),
    scale: _trajScale(ctx),
    note: notes.length ? _trunc(notes.join('; '), FACTS_NOTE_CHARS) : null,
  };
}

/**
 * Lo que la báscula (Withings Body Smart, v11.65) sabe y una pesada manual no: composición,
 * grasa visceral, metabolismo basal, edad metabólica y pulso en pie. La última lectura del
 * dispositivo y, si hay dos lecturas separadas ≥21 días dentro de 28, el cambio de % grasa —
 * que es el número que de verdad mide la recomposición (FFM que se conserva mientras baja la
 * grasa). Null si nunca se ha conectado la báscula: el modelo no debe inventar composición.
 */
function _trajScale(ctx) {
  const COMP = ['fatPct', 'ffmKg', 'fatMassKg', 'muscleKg', 'waterKg', 'boneKg', 'visceralFat', 'bmrKcal', 'metabolicAge', 'heartRateBpm'];
  const rows = (ctx.bodyweight || [])
    .filter(r => r && r.source === 'withings' && _cfDate(r.date) && (_n(r.weight) != null || COMP.some(k => _n(r[k]) != null)))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!rows.length) return null;
  // La última lectura CON composición: una fila de sólo pulso (Withings manda el pulso en un grupo
  // aparte, 2026-09-09) no describe el cuerpo y no puede ser "lo que dice la báscula".
  const withComp = rows.filter(r => _n(r.fatPct) != null || _n(r.ffmKg) != null);
  const last = withComp.length ? withComp[withComp.length - 1] : rows[rows.length - 1];
  const pick = (r, k, rnd) => { const v = _n(r[k]); return v == null ? null : (rnd ? rnd(v) : v); };
  const inDays = (list, n) => list.filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < n; });
  const in28 = inDays(withComp.length ? withComp : rows, FACTS_LONG_WINDOW_DAYS);
  const in7 = inDays(in28, 7);
  const firstIn28 = in28.length ? in28[0] : null;
  const spanOk = firstIn28 && _cfDiff(firstIn28.date, last.date) >= 21;
  const delta = (k) => (spanOk && pick(last, k) != null && pick(firstIn28, k) != null) ? _rBw(pick(last, k) - pick(firstIn28, k)) : null;
  const fat7 = in7.map(r => _n(r.fatPct)).filter(v => v != null);
  return {
    date: last.date,
    daysAgo: _cfDiff(last.date, ctx.todayStr),
    weightKg: pick(last, 'weight', _rBw),
    fatPct: pick(last, 'fatPct', _rBw),
    fatMassKg: pick(last, 'fatMassKg', _rBw),
    ffmKg: pick(last, 'ffmKg', _rBw),
    muscleKg: pick(last, 'muscleKg', _rBw),
    waterKg: pick(last, 'waterKg', _rBw),
    boneKg: pick(last, 'boneKg', _rBw),
    visceralFat: pick(last, 'visceralFat'),
    bmrKcal: pick(last, 'bmrKcal', (v) => Math.round(v)),
    metabolicAge: pick(last, 'metabolicAge', (v) => Math.round(v)),
    heartRateBpm: pick(last, 'heartRateBpm', (v) => Math.round(v)),
    readings28d: in28.length,
    readings7d: in7.length,
    // Media de 7 días del % de grasa cuando hay ≥3 lecturas: la bioimpedancia oscila a diario y
    // el día suelto no es señal (misma regla que la tarjeta de Stats › Body).
    fatPct7dAvg: fat7.length >= 3 ? _rBw(_mean(fat7)) : null,
    // Deltas sólo con ≥21 días entre la primera lectura de la ventana y la última.
    deltaFrom: spanOk ? firstIn28.date : null,
    fatPctDelta28d: delta('fatPct'),
    fatMassKgDelta28d: delta('fatMassKg'),
    ffmKgDelta28d: delta('ffmKg'),
  };
}

/** ¿Es un ejercicio de peso corporal? (biblioteca primero, registro después) */
function _trajIsBw(ctx, id, records) {
  const lib = ctx.library[id];
  if (lib && lib.bw === true) return true;
  return (records || []).some(r => r && r.ex && r.ex.bw === true);
}

/**
 * Las anclas de fuerza (`goals.preserve.anchorLifts`) a lo largo de TODO el historial.
 *
 * Es lo que contesta "¿la fuerza se mantiene en el déficit?" con la ventana correcta: 4
 * semanas no distinguen una meseta de una caída, y el objetivo declarado (preservar magra)
 * se mide en meses. Un ancla con 0 exposiciones NO se calla: sale con `exposures: 0` y su
 * línea en `dataGaps`, porque "no ha bajado" y "no lo has tocado" no son lo mismo.
 *
 * TODO EN KG (`deps.convertWeight`): los registros anteriores a la mudanza van en lb, y un
 * 205 lb al lado de un 95 kg parece una caída del 54 %.
 */
function _trajAnchors(ctx) {
  const d = ctx.d;
  const ids = ((ctx.settings.goals || {}).preserve || {}).anchorLifts || [];
  const from12w = _cfShift(_cfMonday(ctx.todayStr), -7 * (FACTS_TRAJ_WEEKS - 1));
  const out = [];

  for (const id of (Array.isArray(ids) ? ids : [])) {
    const records = [];
    for (const w of ctx.workouts) {
      const ex = (w.exercises || []).find(e => e && (e.exerciseId || e.id) === id);
      if (!ex) continue;
      const date = _cfDate(w.date);
      if (!date) continue;
      records.push({ date, ex, unit: w.unit || 'kg', workout: w });
    }
    const isBw = _trajIsBw(ctx, id, records);
    const lib = ctx.library[id] || null;
    const entries = [];
    for (const r of records) {
      const sets = (r.ex.sets || []).filter(s => s && s.done === true);
      if (!sets.length) continue;
      const toKg = (v) => { const x = _n(v); return x == null ? null : _n(d.convertWeight(x, r.unit, 'kg')); };
      let top = null;
      for (const s of sets) {
        const reps = _n(s.reps) || 0;
        const kg = toKg(_n(s.weight) || 0) || 0;
        const better = !top || (isBw
          ? (reps > top.reps || (reps === top.reps && kg > top.kg))
          : (kg > top.kg || (kg === top.kg && reps > top.reps)));
        if (better) top = { kg, reps };
      }
      if (!top) continue;
      entries.push({
        date: r.date,
        kg: _rKg(top.kg),
        reps: top.reps || null,
        // Peso corporal: la Epley sobre el LASTRE describe una fuerza que no es la del atleta.
        e1rm: isBw ? null : _rKg(d.estimate1RM(top.kg, top.reps)),
        workout: r.workout,
      });
    }
    entries.sort((a, b) => a.date.localeCompare(b.date));

    const row = {
      id,
      name: (lib && lib.name) || id,
      kind: isBw ? 'bw' : 'load',
      first: null, best: null, latest: null,
      exposures: entries.length,
      exposures12w: entries.filter(e => e.date >= from12w).length,
      daysSinceLast: null,
      trendSinceStartPct: null,
    };
    if (entries.length) {
      const plain = (e) => ({ date: e.date, kg: e.kg, reps: e.reps, e1rm: e.e1rm });
      const metric = (e) => (isBw ? _n(e.reps) : _n(e.e1rm));
      const first = entries[0];
      const last = entries[entries.length - 1];
      const best = entries.reduce((b, e) => ((metric(e) || 0) > (metric(b) || 0) ? e : b), first);
      row.first = plain(first);
      row.best = plain(best);
      row.latest = plain(last);
      const ro = last.workout && last.workout.readout;
      if (ro && Array.isArray(ro.items)) {
        const it = ro.items.find(x => x && x.exerciseId === id);
        if (it && it.outcome) row.latest.outcome = it.outcome;
      }
      row.daysSinceLast = _cfDiff(last.date, ctx.todayStr);
      const a = metric(first), b = metric(last);
      if (entries.length >= 2 && a != null && b != null && a > 0) row.trendSinceStartPct = _rPct(((b - a) / a) * 100);
      // En peso corporal la "tendencia" son REPS, no kg: decirlo evita que el modelo lea el
      // porcentaje como si fuera carga.
      if (isBw) row.trendBasis = 'reps (bodyweight: no e1RM over the added load)';
    }
    out.push(row);
  }
  return out;
}

/**
 * Carrera a 12 semanas: volumen, el largo de toda la historia, cumplimiento de Z2 y las fases
 * que el motor fue registrando. Las carreras entran DEDUPEADAS (F-10) y el domingo cuenta en
 * SU semana ISO.
 */
function _trajRunning(ctx) {
  const monNow = _cfMonday(ctx.todayStr);
  const weekKeys = [];
  const weeklyKm = [];
  const z2 = [];
  for (let i = FACTS_TRAJ_WEEKS - 1; i >= 0; i--) {
    const mon = _cfShift(monNow, -7 * i);
    const sun = _cfShift(mon, 6);
    const runs = ctx.runs.filter(r => _inWindow(r.date, mon, sun));
    weekKeys.push(_cfIsoWeek(mon));
    weeklyKm.push(_rKm(_sum(runs.map(r => _n(r.distance)))));
    if (i < FACTS_TRAJ_Z2_WEEKS) {
      const judged = runs.filter(r => _z2Compliant(r, ctx.z2Ceiling.bpm) != null);
      // Fracción, no porcentaje: ocupa la mitad y dice lo mismo. `null` = esa semana no hubo
      // carreras con FC, que no es lo mismo que un 0.
      z2.push(judged.length
        ? _round(judged.filter(r => _z2Compliant(r, ctx.z2Ceiling.bpm) === true).length / judged.length, 0.01)
        : null);
    }
  }

  let longest = null;
  for (const r of ctx.runs) {
    const km = _n(r.distance);
    if (km == null || km <= 0) continue;
    if (!longest || km > longest.km) longest = { km: _rKm(km), date: _cfDate(r.date), avgHR: _rMin(r.avgHR) };
  }

  const phaseHistory = [];
  const seenWeeks = new Set();
  for (const x of ctx.decisions) {
    if (!x || x.type !== 'running-week') continue;
    const phase = (x.evidence && x.evidence.phase) || x.phase || null;
    const wk = x.weekKey || (_cfDate(x.date) ? _cfIsoWeek(_cfDate(x.date)) : null);
    if (!phase || !wk || seenWeeks.has(wk)) continue;
    seenWeeks.add(wk);
    phaseHistory.push({ weekKey: wk, phase: String(phase) });
    if (phaseHistory.length >= FACTS_TRAJ_PHASE_HISTORY) break;
  }

  return {
    weekKeys,
    weeklyKm,
    longestRunEver: longest,
    z2ComplianceByWeek: z2,
    z2WeekKeys: weekKeys.slice(-FACTS_TRAJ_Z2_WEEKS),
    phaseHistory,
    note: 'weeklyKm and weekKeys run from the OLDEST week to the current one, with 0 in weeks with no runs. z2ComplianceByWeek is the FRACTION of runs with mean HR ≤ Z2 ceiling + tolerance (null = no run with HR that week).',
  };
}

/**
 * Adherencia semana a semana, 12 semanas. `planned` son las sesiones de FUERZA de la
 * plantilla activa proyectada hacia atrás — aproximado y declarado (`plannedIsApprox`).
 */
function _trajAdherence(ctx) {
  const monNow = _cfMonday(ctx.todayStr);
  const rows = [];
  for (let i = FACTS_TRAJ_WEEKS - 1; i >= 0; i--) {
    const mon = _cfShift(monNow, -7 * i);
    const sun = _cfShift(mon, 6);
    const upTo = sun <= ctx.todayStr ? sun : ctx.todayStr;
    const runs = ctx.runs.filter(r => _inWindow(r.date, mon, sun));
    rows.push({
      weekKey: _cfIsoWeek(mon),
      planned: _plannedForWeek(ctx, { monday: mon, sunday: sun }, upTo).gym,
      done: ctx.workouts.filter(w => _inWindow(w.date, mon, sun)).length,
      kmDone: _rKm(_sum(runs.map(r => _n(r.distance)))),
      runs: runs.length,
    });
  }
  return rows;
}

/**
 * Lo que se salta de verdad: ≥3 saltos en las ÚLTIMAS ≤6 exposiciones de las 12 semanas.
 *
 * Distinto de `skipped` (4 semanas, ≥2 saltos y ≥50 %): aquí manda la RECENCIA. Un ejercicio
 * que se saltó tres veces en junio y se hace desde entonces no es un patrón; uno que se salta
 * las tres últimas veces que aparece, sí. §C.2 paso 3: se reordena o se quita, no se
 * "recuerda".
 */
function _trajSkipped(ctx) {
  const planned = _plannedSetsByExercise(ctx);
  const from = _cfShift(_cfMonday(ctx.todayStr), -7 * (FACTS_TRAJ_WEEKS - 1));
  const acc = {};
  // `ctx.workouts` va descendente: se recorre al revés para tener las exposiciones en orden.
  for (const w of ctx.workouts.slice().reverse()) {
    if (!_inWindow(w.date, from, ctx.todayStr)) continue;
    const sid = w.session || w.sessionName;
    const ids = new Set(Object.keys(planned[sid] || {}));
    for (const ex of (w.exercises || [])) if (ex && (ex.exerciseId || ex.id)) ids.add(ex.exerciseId || ex.id);
    for (const id of ids) {
      const rec = (w.exercises || []).find(e => (e.exerciseId || e.id) === id);
      const done = !!(rec && (rec.sets || []).some(s => s && s.done === true));
      if (!acc[id]) acc[id] = [];
      acc[id].push({ date: _cfDate(w.date), done });
    }
  }
  const out = [];
  for (const [id, list] of Object.entries(acc)) {
    const last = list.slice(-FACTS_TRAJ_SKIP_WINDOW);
    const skipped = last.filter(x => !x.done);
    if (skipped.length < FACTS_TRAJ_SKIP_MIN) continue;
    const lib = ctx.library[id];
    out.push({
      id, name: (lib && lib.name) || id,
      skips: skipped.length, exposures: last.length,
      lastSkipped: skipped[skipped.length - 1].date,
    });
  }
  return out.sort((a, b) => b.skips - a.skips || String(a.id).localeCompare(String(b.id)));
}

/**
 * Las decisiones del COACH (y las de plan) que hay que revisar: el "te dije X el {fecha}".
 * Las de `source: 'rule'` (readouts automáticos) no entran: nadie tiene que rendir cuentas de
 * ellas y llenarían los 6 huecos con la misma frase.
 */
function _trajFollowUp(ctx) {
  const out = [];
  for (const x of ctx.decisions) {
    const type = x.type || 'other';
    if (x.source !== 'coach' && !/^plan-/.test(String(type))) continue;
    const reviewOn = _cfDate(x.reviewOn || (x.evidence || {}).reviewOn);
    out.push({
      id: x.id || null,
      weekKey: x.weekKey || (_cfDate(x.date) ? _cfIsoWeek(_cfDate(x.date)) : null),
      type,
      what: _trunc(x.what, FACTS_TRAJ_WHAT_CHARS),
      reviewOn,
      dueForReview: !!(reviewOn && reviewOn <= ctx.todayStr),
      outcome: x.outcome || null,
      source: x.source || null,
    });
    if (out.length >= FACTS_TRAJ_FOLLOWUP) break;
  }
  return out;
}

// ---------- progress ----------

function _factsProgress(ctx) {
  return {
    weight: _factsWeight(ctx),
    waist: _factsWaist(ctx),
    running: _factsRunProgress(ctx),
    performance: _factsPerformance(ctx),
  };
}

/**
 * F-6 (auditoría 2026-09-09) · LA MITAD REACTIVA DE LOAD-004, QUE NO CALCULABA NADIE.
 *
 * LOAD-004 dice "descarga reactiva si el RENDIMIENTO cae dos sesiones consecutivas". El pack
 * traía `readiness.deloadHint`, que mira RPE, calidad percibida y wearable — o sea, todo menos
 * el rendimiento. Y el dato existía desde v11.57: cada entreno cerrado sella su `readout`
 * (`sessionReadout` en coach-engine.js, `attachSessionReadout` en app.js) con un `summary`
 * `{progressed, held, regressed, skipped}` que compara lo prescrito con lo hecho, ejercicio a
 * ejercicio. Nadie lo agregaba, así que el criterio del corpus no era ejecutable y el modelo
 * acababa llamando "deload" a dos noches malas de HRV.
 *
 * `regressedStreak` son las sesiones de fuerza MÁS RECIENTES, consecutivas, con al menos un
 * ejercicio por debajo del objetivo y NINGUNO por encima. Una sesión con una caída y una subida
 * no es un declive: es una sesión. Y `skipped` no cuenta en ninguna dirección — no hacer un
 * ejercicio no dice nada sobre la fuerza de ese día (eso lo mide `skipped`/`skipRate4w`).
 *
 * Sólo entran registros con `readout.summary` OBJETO. Las filas anteriores a v11.57 (y las de
 * los fixtures viejos) llevan un `summary` de texto: se ignoran en silencio, porque parsear una
 * frase para sacar un número es exactamente la aritmética que este pack existe para evitar.
 */
function _factsPerformance(ctx) {
  const sessions = [];
  for (const w of ctx.workouts) {
    if (!_inWindow(w.date, ctx.from4w, ctx.todayStr)) continue;
    const sum = w.readout && w.readout.summary;
    if (!sum || typeof sum !== 'object') continue;
    const progressed = _n(sum.progressed), held = _n(sum.held), regressed = _n(sum.regressed);
    if (progressed == null && held == null && regressed == null) continue;
    sessions.push({
      date: _cfDate(w.date),
      session: w.session || w.sessionName || null,
      progressed: progressed || 0,
      held: held || 0,
      regressed: regressed || 0,
    });
  }
  // `ctx.workouts` ya viene descendente: la primera es la más reciente.
  let regressedStreak = 0;
  for (const s of sessions) {
    if (s.regressed >= 1 && s.progressed === 0) regressedStreak++;
    else break;
  }
  const lastRegressed = sessions.find(s => s.regressed >= 1) || null;
  return {
    regressedStreak,
    lastRegressedDate: lastRegressed ? lastRegressed.date : null,
    sessions,
    note: 'From each sealed workout `readout.summary` (prescribed vs done, exercise by exercise). `regressedStreak` = consecutive most-recent sessions with ≥1 exercise short and none progressed: it is THE signal for a reactive deload (LOAD-004), not the wearable.',
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
/**
 * Una fila de peso por día, ascendente, preferiendo la pesada MEDIDA.
 * `wellness.weightMeasured` es la misma medida vista desde el otro store: si el store
 * `bodyweight` no la tiene, cuenta igual. La usan `_factsWeight` y `trajectory.weight`, y
 * tiene que ser la MISMA convención en los dos sitios: si la trayectoria contase el
 * forward-fill, el `deltaKg` desde el inicio diría que el peso no se mueve.
 */
function _weightDays(ctx) {
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
    // v11.70 (D-1): `weightSource` lo escribe el servidor desde Withings ('withings' | 'manual');
    // sin él, la fila es el `weightMeasured` clásico de intervals.icu. Etiquetarlo fijo contaba
    // "dos básculas" en el pack cuando era la misma.
    if (!prev || !prev.measured) byDate.set(date, { date, kg, measured: true, source: w.weightSource || 'intervals.icu' });
  }
  const all = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { all, measured: all.filter(r => r.measured) };
}

function _factsWeight(ctx) {
  const days = _weightDays(ctx);
  const all = days.all;
  const measured = days.measured;
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
    // v11.70 (D-1): de dónde salen las pesadas medidas de 28 días. "n=5 en una báscula" y "n=5 en dos"
    // no son la misma frase para el coach, y hasta ahora el pack no podía distinguirlas.
    measuredSources28d: m28.reduce((acc, r) => { const k = r.source || 'manual'; acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    last: all.length ? { date: all[all.length - 1].date, kg: _rBw(all[all.length - 1].kg), measured: all[all.length - 1].measured } : null,
    lastMeasured: measured.length ? { date: measured[measured.length - 1].date, kg: _rBw(measured[measured.length - 1].kg) } : null,
    daysSinceMeasured: measured.length ? _cfDiff(measured[measured.length - 1].date, ctx.todayStr) : null,
    validWindow: win,
    note: 'The mean and the slopes use ONLY measured weigh-ins (`measured: true` / `weightMeasured`). The smoothed intervals.icu values (forward-fill) are left out: they would inject a 0 slope on days with no scale reading.',
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
  if (!dl.known) reasons.push('no `deloadAnchorDate`: there is no way to know which weeks were deloads');
  const n14 = measured.filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < 14; }).length;
  if (n14 < FACTS_MIN_NUTRITION_DAYS_14) reasons.push(`only ${n14} measured weigh-ins in 14 days (gate: ${FACTS_MIN_NUTRITION_DAYS_14})`);
  if (excluded.length) reasons.push(`the window contains ${excluded.length} deload / diet break week(s) + 5 days`);

  const firstAdjust = _cfDate(ctx.settings.kcalFirstAdjustDate)
    || _cfDate((ctx.settings.goals && ctx.settings.goals.constraints && ctx.settings.goals.constraints.firstAdjustDate));
  const lastAdjust = _cfDate(ctx.settings.kcalLastAdjustDate);
  const daysSinceAdjust = lastAdjust ? _cfDiff(lastAdjust, ctx.todayStr) : null;
  if (firstAdjust && ctx.todayStr < firstAdjust) reasons.push(`before the first eligible adjustment date (${firstAdjust})`);
  if (daysSinceAdjust != null && daysSinceAdjust < 14) reasons.push(`only ${daysSinceAdjust} days since the last kcal adjustment (gate: 14)`);
  if (!firstAdjust && !lastAdjust) reasons.push('no first-adjustment or last-adjustment date in `settings`: the 14-day gate cannot be checked');

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
  let verdict = 'no signal';
  if (runs.length) {
    if (longKm != null && longKm >= 10 && z2 === true) verdict = 'ready to attempt it';
    else if (longKm != null && longKm >= 8) verdict = 'getting close';
    else verdict = 'far off';
  }
  return {
    verdict,
    longestKm: _rKm(longKm),
    longestZ2Compliant: z2,
    driftBpm: null,
    criteria: { km10: longKm != null ? longKm >= 10 : null, avgHrUnderCeiling: z2, driftUnder5: null, rpeUnder5: null, painFree: null, nextDayRhr: null },
    basis: 'Only distance and mean HR can be measured. HR drift, RPE, pain and next-day RHR are not in the stores: they go to null.',
  };
}

// ---------- plan ----------

function _factsPlan(ctx) {
  const p = ctx.plan;
  if (!p) {
    ctx.gaps.push('No active plan in the pack: the coach cannot propose a diff against nothing.');
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
    // F-7 (auditoría 2026-09-09) · LAS SERIES PRESCRITAS POR MÚSCULO, publicadas.
    //
    // `readiness.setsPerMuscle` traía las series HECHAS y nadie publicaba las PLANIFICADAS, así
    // que el coach no veía el mismo número que el validador juzga en `VOL-CAP` / `VOL-FLOOR` —
    // tenía que sumarlas él del `weekTemplate` y las sesiones, que es justo la aritmética que
    // este pack existe para quitarle. Es el MISMO contador (`_vpSetsPerMuscle`), no una segunda
    // implementación: dos contadores de volumen en el mismo repo es cómo la app leía 16 series
    // donde el validador leía 13 (L-1, v11.70).
    //
    // `families` agrega la cadena posterior (Hamstrings + Posterior + Glutes), que la semilla
    // reparte en tres etiquetas y hacía leer "9 series de isquios" sobre una cadena posterior de
    // 14. `Power`, `Core` y `otros` quedan fuera: no son volumen de hipertrofia.
    plannedSetsPerMuscle: (() => {
      const sets = _vpSetsPerMuscle(sessions, tpl);
      const eff = _vpEffectiveSetsPerMuscle(sessions, tpl);
      return {
        byMuscle: sets.byMuscle,
        families: _vpMuscleFamilies(sets.byMuscle),
        total: sets.total,
        // v11.71 · LAS DOS CUENTAS, las dos visibles. `byMuscle`/`families` son series DIRECTAS
        // (la etiqueta `muscle` del ejercicio); `effective` añade el crédito fraccionado por
        // patrón, que es la convención en la que está escrito el 10-14 de STR-003 y la que juzgan
        // `VOL-FLOOR` y el aviso de `VOL-CAP`. Publicar sólo una de las dos fue el fallo: con
        // las directas a secas el coach leía "Shoulders 7" de una semana con dos empujes.
        effective: {
          byMuscle: eff.byMuscle,
          families: eff.families,
          total: eff.total,
          note: 'Effective sets: 1.0 for the exercise\'s primary muscle (its `muscle` label) + 0.5 for each meaningfully loaded secondary of its `movementPattern` — horizontal press → shoulders + triceps, vertical press → triceps, horizontal pull → biceps + rear delts, vertical pull → biceps, squat/single-leg → glutes, hinge → the other posterior-chain muscle + `Erectors` (its own bucket, not `Back`: the erector is not the lat, and `Erectors` has no floor or cap because the corpus declares no band for it). Isolation, glute, carry, plyometric, conditioning, core and openers (flies) credit nothing beyond the primary. Rounded to 0.5. THIS is the number VOL-FLOOR and the VOL-CAP warning judge, because STR-003\'s 10-14 is written in these terms.',
        },
        floorPerMuscle: VP_MIN_SETS_PER_MUSCLE,
        capPerMuscle: VP_MAX_SETS_PER_MUSCLE,
        note: 'Sets × times the session appears in `weekTemplate`. `byMuscle`/`families` are DIRECT sets (the exercise\'s `muscle` label only); `effective` adds fractional credit for secondary muscles — see `effective.note`. `families` merges Hamstrings + Posterior + Glutes into "Posterior chain"; Power, Core and `otros` are not judged as hypertrophy volume. Same counters the validator uses: VOL-FLOOR and the VOL-CAP warning judge `effective`, the hard VOL-CAP judges direct sets only.',
      };
    })(),
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
      ...(_restCompliance(workouts)),
      plannedSource: exact ? 'plan-activo' : 'plantilla-actual (aproximado)',
    };
  });
  if (anyApprox) {
    ctx.gaps.push('`adherence.planned` is APPROXIMATE in at least one week: the logs carry a different plan version, so what was planned has been projected from the current template.');
  }
  return rows;
}

/**
 * F-19 (auditoría 2026-09-09) · CUMPLIMIENTO DE LOS DESCANSOS, desde `blockTimings`.
 *
 * Cada bloque de una sesión guarda su duración estimada y la real (`{estimatedSec, durationSec}`,
 * `endBlockTimer` en app.js). El cociente Σreal/Σestimada es lo más cerca que el sistema está de
 * medir si los 2-4 minutos entre series de un compuesto se respetan: por debajo del 100 % la
 * sesión va con prisa, y la prisa en un básico es carga que no se levanta (STR-003, LOAD-001).
 * NO es una medida de descanso set a set — nadie cronometra eso — y por eso va con su `n`: es un
 * indicador de ritmo de sesión, no un número del que salga una prescripción.
 *
 * `null` cuando ningún entreno de la semana trae bloques con estimación: la mayoría de sesiones
 * libres no los tienen, y un 0 % ahí sería una acusación inventada.
 */
function _restCompliance(workouts) {
  let est = 0, real = 0, n = 0;
  for (const w of (workouts || [])) {
    const bt = Array.isArray(w.blockTimings) ? w.blockTimings : null;
    if (!bt || !bt.length) continue;
    let e = 0, r = 0;
    for (const t of bt) {
      const te = _n(t && t.estimatedSec), tr = _n(t && t.durationSec);
      if (te == null || te <= 0 || tr == null || tr < 0) continue;
      e += te; r += tr;
    }
    if (e > 0) { est += e; real += r; n++; }
  }
  return {
    restCompliancePct: est > 0 ? Math.round((real / est) * 100) : null,
    restComplianceN: n,
  };
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
      atSameLoad: _liftAtSameLoad(sessions, measureUnit),
      skipRate4w: skip[id] ? _rPct(skip[id].rate * 100) : null,
      exposures4w: skip[id] ? skip[id].exposures : 0,
      pausedOver21d: (_cfDiff(sessions[0].date, ctx.todayStr) || 0) > FACTS_PAUSE_DAYS,
    };
  }
  if (!ctx.d.hasConvert) {
    ctx.gaps.push('`deps.convertWeight` is missing: weights were taken in the unit they were stored in, so a log in lb is NOT converted to kg.');
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
    row.note = `Measured in ${measureUnit}: it is not load and has no e1RM.`;
  } else if (isBw) {
    row.addedKg = _rKg(top.val);
    row.topKg = _rKg(top.val);
    row.e1rm = null;
    row.note = 'Bodyweight + added load: the number is the ADDED LOAD (+kg). No e1RM is estimated over added load.';
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

/**
 * F-18 (auditoría 2026-09-09) · LA DERIVA A CARGA IGUAL: la señal de progreso que no es el e1RM.
 *
 * `trend` compara e1RM, que mezcla carga y repeticiones y por eso se queda plano justo cuando
 * más está pasando: tres semanas a 95 kg subiendo de 6 a 8 reps con el RPE bajando de 8,5 a 7,5
 * es la doble progresión funcionando, y el e1RM apenas se mueve. Al revés, las MISMAS reps al
 * MISMO kg con el RPE subiendo es fatiga acumulándose antes de que caiga ningún número.
 *
 * Se toma la carga de top set MÁS FRECUENTE de las últimas exposiciones (con ≥2, si no no hay
 * "misma carga" que comparar) y se dan las reps y el RPE medio de cada una. Los deltas son
 * **la más reciente menos la más antigua** a esa carga, en el mismo orden descendente que
 * `sessions`. En medidas (cm de cajón) devuelve `null`: un centímetro no es una carga.
 */
function _liftAtSameLoad(sessions, measureUnit) {
  if (measureUnit) return null;
  const rows = (sessions || []).filter(s => _n(s.topKg) != null && _n(s.topReps) != null);
  if (rows.length < 2) return null;
  const counts = new Map();
  for (const r of rows) { const k = _rKg(r.topKg); counts.set(k, (counts.get(k) || 0) + 1); }
  let kg = null, best = 0;
  for (const [k, n] of counts.entries()) {
    if (n > best || (n === best && kg != null && k > kg)) { best = n; kg = k; }
  }
  if (best < 2) return null;
  const series = rows.filter(r => _rKg(r.topKg) === kg)
    .map(r => ({ date: r.date, reps: _n(r.topReps), avgRpe: _n(r.avgRpe) }));
  const newest = series[0], oldest = series[series.length - 1];
  return {
    kg, n: series.length, series,
    repsDelta: (newest.reps != null && oldest.reps != null) ? newest.reps - oldest.reps : null,
    rpeDelta: (newest.avgRpe != null && oldest.avgRpe != null) ? _round(newest.avgRpe - oldest.avgRpe, 0.1) : null,
    note: 'Most frequent top-set load among the last exposures. Deltas are MOST RECENT minus OLDEST at that load: +reps or −RPE at the same kg is progress the e1RM does not show.',
  };
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
      action: 'move earlier or drop (do not just remember it)',
    });
  }
  return out.sort((a, b) => b.rate - a.rate || b.skips - a.skips);
}

// ---------- cardio ----------

function _factsCardio(ctx) {
  const weeks = ctx.weeks.map(w => {
    const runs = ctx.runs.filter(r => _inWindow(r.date, w.monday, w.sunday));
    const sess = ctx.sessions.filter(s => _inWindow(s.date, w.monday, w.sunday) && (s.family || 'cardio') !== 'recovery');
    const runMin = _sum(runs.map(r => _durMin(r.duration)));
    const finishers = sess.filter(s => s.origin === 'z2_finisher');
    return {
      weekKey: w.weekKey,
      km: _rKm(_sum(runs.map(r => _n(r.distance))) + _sum(sess.map(s => _n(s.distance)))),
      min: _rMin(runMin + _sum(sess.map(s => _durMin(s.durationMin)))),
      sessions: runs.length + sess.length,
      hard: _hardCount(ctx, runs, sess),
      finishers: finishers.length,
      // F-22 (auditoría 2026-09-09): el desglose de los MVPA de la semana. Va aquí y no en un cálculo aparte para que
      // el minuto que cuenta el pack sea el mismo que juzga `MVPA-FLOOR`.
      mvpa: {
        runMin: _rMin(runMin),
        sessionMin: _rMin(_sum(sess.filter(x => x.origin !== 'z2_finisher').map(x => _durMin(x.durationMin)))),
        finisherMin: _rMin(_sum(finishers.map(x => _durMin(x.durationMin)))),
      },
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
    ctx.gaps.push('HR drift (2nd half vs 1st) NOT available: the logs carry no HR streams. `hrDrift` goes to null on every run — do not infer it from `decoupling` when that is null too.');
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
    // F-22 (auditoría 2026-09-09) · LOS MINUTOS MVPA HECHOS, contra la banda de END-009.
    //
    // El paso 6 del prompt manda mover el GASTO cuando la ingesta ya está en el suelo, y "más
    // minutos fáciles" sin un número es una frase: sin saber si la semana lleva 150 o 260 min, el
    // coach no puede decir cuántos faltan. Aquí van los minutos de carrera + cardio + finishers de
    // Z2 por semana ISO (los mismos que suma `weeks[].min`, desglosados en `weeks[].mvpa`) y la
    // banda 200-300 de END-009 / ACSM 2024, que es el objetivo de PÉRDIDA DE GRASA — 150 es el
    // suelo de salud, no el objetivo de este bloque.
    mvpaMinByWeek: weeks.map(w => ({ weekKey: w.weekKey, min: w.min })),
    // F-26 (auditoría 2026-09-09) · EL CALOR MEDIDO, no el mes del calendario.
    //
    // `SUMMER-PACE` (ENV-001) avisaba por MES: junio a septiembre, siempre. Eso confunde dos
    // cosas que no son la misma — una carrera a las 21:00 de septiembre a 19 °C y una a las
    // 14:00 de junio a 36 °C recibían el mismo aviso, y el aviso es sobre el CALOR, no sobre la
    // página del calendario. intervals.icu trae `average_temp` POR ACTIVIDAD, que además es la
    // granularidad correcta: lo que degrada el ritmo a FC fija es el calor de esa carrera.
    // Con el mes como respaldo, porque las actividades sin temperatura existen (cinta, un reloj
    // que no la registra) y quedarse callado en agosto sería peor que avisar de más.
    tempC28d: (() => {
      const vals = [...ctx.runs, ...ctx.sessions]
        .filter(x => x && _inWindow(_cfDate(x.date), ctx.from4w, ctx.todayStr))
        .map(x => _n(x.tempC))
        .filter(v => v != null && v > -30 && v < 60);
      if (!vals.length) return { meanC: null, maxC: null, n: 0 };
      return { meanC: Math.round(_mean(vals) * 10) / 10, maxC: Math.max(...vals), n: vals.length };
    })(),
    mvpaBand: FACTS_MVPA_BAND.slice(),
    mvpaFloorMin: FACTS_MVPA_FLOOR_MIN,
    note: 'Runs and sessions arrive DEDUPED (`dedupeRuns`/`dedupeSessions`): the same COROS activity can come in through both Strava and intervals.icu. Post-strength Z2 finishers (`origin: z2_finisher`) count as real aerobic minutes.',
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
    ctx.gaps.push(`Only ${scores7.length}/7 wellness days with readiness: below ${FACTS_MIN_WELLNESS_DAYS_7} recovery is not judged (READ-004).`);
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
      // F-11 (auditoría 2026-09-09). WHOOP persiste consistencia, score y NECESIDAD de sueño
      // (`sleepNeedSecs`) desde v11.69 y el pack sólo publicaba la duración, así que READ-006 y
      // LONG-004 —que piden "duración **y** consistencia"— no eran ejecutables: siete horas de
      // media con la hora de acostarse bailando 3 h no es el mismo sueño que siete horas
      // regulares, y la deuda acumulada es lo que separa "una noche mala" de un déficit crónico.
      consistency7: _band7(w, ctx, 'sleepConsistency', _rMin),
      score7: _band7(w, ctx, 'sleepScore', _rMin),
      debtHrs7: _sleepDebt7(w, ctx),
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
    } : { date: ctx.todayStr, readiness: null, color: 'unknown', note: "No data for today: in the morning intervals.icu still shows yesterday's, and it is not used as if it were today's." },
    lastDataDate: latest ? _cfDate(latest.date) : null,
    aerobicLoad: {
      ctl: _round(load.ctl, 0.1),
      atl: _round(load.atl, 0.1),
      form: (_n(load.ctl) != null && _n(load.atl) != null) ? _round(_n(load.ctl) - _n(load.atl), 0.1) : null,
      rampRate: _round(load.rampRate, 0.01),
      date: latest ? _cfDate(latest.date) : null,
      note: 'cardio only: strength sessions never reach intervals.icu, so this is NOT total load (F-3). `form = ctl − atl` (F-2); `rampRate` is ΔCTL/week, not form, and the TSB thresholds from the literature do not apply to this range (±2 measured).',
    },
    // F-12 (auditoría 2026-09-09): las cinco subjetivas de intervals.icu, que YA se persisten (`whoop.js`) y no salían
    // del store. Sin ellas el disparador de LEA de REC-008 ("2 de [sueño, libido, ánimo,
    // enfermedad] durante 2 semanas") no lo podía evaluar nadie: sólo el sueño estaba en el pack.
    subjective: _factsSubjective(ctx),
    // F-13 (auditoría 2026-09-09): REC-006 (`strong`) se declaraba sin consumidor "porque no hay campo de hidratación",
    // y `hydration`/`hydrationVolume` se persisten desde el primer día de wellness.
    hydration7: _factsHydration(ctx),
    internalLoad: _internalLoad(ctx),
    pressExposuresPerWeek: _pressExposures(ctx),
    setsPerMuscle: _setsPerMuscle(ctx),
    anomalies: _readinessAnomalies(ctx, scores28, colorOf),
    // El veredicto del motor, no una segunda lectura. `computeReadinessFrom` es PURO (vive en
    // `coach-engine.js` y no toca `state` ni IndexedDB) y es el mismo que pinta Stats: si el
    // pack recalculase el declive por su cuenta, la app y el coach podrían decir cosas
    // distintas del mismo día. `deloadHint` es un declive SOSTENIDO (READ-008 + LOAD-004), no
    // un mal día — y sigue siendo INFORMACIÓN: la recuperación no dosifica (decisión del
    // usuario, 2026-09-07).
    ...(_readinessVerdict(ctx)),
  };
}

/** Media de 7 días de un campo de `wellness`, con su n. `null` cuando no hay ni un dato. */
function _band7(rows, ctx, field, rounder) {
  const vals = (rows || [])
    .filter(r => { const dd = _cfDiff(r.date, ctx.todayStr); return dd != null && dd >= 0 && dd < 7 && _n(r[field]) != null; })
    .map(r => _n(r[field]));
  return { mean: vals.length ? rounder(_mean(vals)) : null, n: vals.length };
}

/**
 * F-11 (auditoría 2026-09-09) · Deuda de sueño de 7 días: media de `sleepNeedSecs − sleepSecs`, en horas y nunca
 * negativa. Dormir de más no compensa una noche corta, así que el exceso se recorta a 0 en vez
 * de restarse de la deuda de otro día. Sólo cuentan los días con LOS DOS campos.
 */
function _sleepDebt7(rows, ctx) {
  const vals = [];
  for (const r of (rows || [])) {
    const dd = _cfDiff(r.date, ctx.todayStr);
    if (dd == null || dd < 0 || dd >= 7) continue;
    const need = _n(r.sleepNeedSecs), got = _n(r.sleepSecs);
    if (need == null || got == null) continue;
    vals.push(Math.max(0, need - got) / 3600);
  }
  return { mean: vals.length ? _rHrs(_mean(vals)) : null, n: vals.length };
}

/**
 * F-12 (auditoría 2026-09-09) · Las cinco subjetivas de intervals.icu (`fatigue`, `soreness`, `stress`, `mood`,
 * `motivation`), media de 7 días. `n7` son los días con AL MENOS una de las cinco: Julian no las
 * rellena hoy, así que lo normal es `n7: 0` y cinco `null` — que es la respuesta correcta y la
 * que impide que el modelo cuente el disparador de LEA sobre datos que no existen.
 *
 * NO se normalizan ni se invierten escalas: en intervals.icu 1 es lo mejor en `fatigue` y lo peor
 * en `mood`, y darles un signo común aquí sería inventar una semántica que el store no tiene.
 */
function _factsSubjective(ctx) {
  const w = ctx.wellness;
  const fields = ['fatigue', 'soreness', 'stress', 'mood', 'motivation'];
  const out = {};
  for (const f of fields) out[`${f}7`] = _band7(w, ctx, f, (v) => _round(v, 0.1)).mean;
  const days = new Set();
  for (const r of w) {
    const dd = _cfDiff(r.date, ctx.todayStr);
    if (dd == null || dd < 0 || dd >= 7) continue;
    if (fields.some(f => _n(r[f]) != null)) days.add(_cfDate(r.date));
  }
  out.n7 = days.size;
  out.note = 'intervals.icu 1-5 scales, as stored: no normalisation and no common sign (1 is best in `fatigue`, worst in `mood`). Libido and illness are NOT here: they only exist if Julian writes them in the note.';
  return out;
}

/**
 * F-13 (auditoría 2026-09-09) · Hidratación de 7 días en litros (REC-006). `hydrationVolume` de intervals.icu llega en
 * mililitros y `hydration` a veces como litros: se toma el primero que exista y se convierte por
 * MAGNITUD (≥100 ⇒ ml), que es la única heurística honesta sin un campo de unidad en el store.
 * Sin datos, `meanL: null` y `n: 0` — el hueco se declara, no se rellena con un objetivo.
 */
function _factsHydration(ctx) {
  const vals = [];
  for (const r of ctx.wellness) {
    const dd = _cfDiff(r.date, ctx.todayStr);
    if (dd == null || dd < 0 || dd >= 7) continue;
    const raw = _n(r.hydrationVolume) != null ? _n(r.hydrationVolume) : _n(r.hydration);
    if (raw == null || raw <= 0) continue;
    vals.push(raw >= 100 ? raw / 1000 : raw);
  }
  return {
    meanL: vals.length ? _round(_mean(vals), 0.1) : null,
    n: vals.length,
    note: 'REC-006: 5-10 mL/kg in the 2-4 h before a session (~500 mL for this user). Only what intervals.icu carries; a null here means it was not logged, not that it was low.',
  };
}

/** `{deloadHint, firedSignals}` desde `computeReadinessFrom`. Sin el motor, nulls honestos. */
function _readinessVerdict(ctx) {
  const fn = ctx.d.computeReadinessFrom;
  if (typeof fn !== 'function') return { deloadHint: null, firedSignals: [], readinessColor: null };
  try {
    const todayRow = ctx.wellness.find(r => _cfDate(r.date) === ctx.todayStr) || null;
    const score = todayRow ? _n(todayRow.readiness) : null;
    const res = fn({
      today: ctx.todayStr,
      wellness: ctx.wellness,
      // El dato de HOY o NINGUNO (F-6): aquí nunca se coge "el último que haya".
      whoopToday: score != null ? { score, source: todayRow.readinessSource || null } : null,
      whoopMissingReason: score == null ? 'No recovery data for today in `wellness`' : undefined,
      workouts: ctx.workouts,
      cutoffs: { green: FACTS_GREEN, yellow: FACTS_YELLOW },
    }) || {};
    return {
      deloadHint: !!res.deloadHint,
      // F-9 (auditoría 2026-09-09): la lista viene HECHA del motor desde v11.71. Se conserva el
      // cálculo local como respaldo por si el pack corre contra un motor viejo (la copia
      // generada de la función se regenera aparte), pero la fuente es una sola.
      firedSignals: Array.isArray(res.firedSignals)
        ? res.firedSignals.slice()
        : (res.signals || []).filter(s => s && s.fired).map(s => s.id),
      readinessColor: res.color || null,
    };
  } catch (e) {
    // Un motor que cambie de firma no puede tumbar el pack entero.
    return { deloadHint: null, firedSignals: [], readinessColor: null };
  }
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
        const m = _vpVolumeMuscle(id, muscleOf(id, ex));
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
    ctx.gaps.push(`Nutrition logged on only ${l28.length}/${FACTS_LONG_WINDOW_DAYS} days: **do NOT infer intake** or compute a deficit from this data — the scale rules (${l14.length}/14 over the last 14 days, gate ${FACTS_MIN_NUTRITION_DAYS_14}).`);
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
    pilot: l14.length >= FACTS_MIN_NUTRITION_DAYS_14 ? 'tracker' : 'weight',
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
      note: 'CLOSED days only (date < today). EA is a daily quantity (REC-008): intraday it always reads "critical" and means nothing (F-12).',
    },
    maintenance: {
      modelMean7: _rMin(_mean(l7.map(n => _n(n.burn)))),
      modelMean28: _rMin(_mean(l28.map(n => _n(n.burn)))),
      source: 'model (Katch-McArdle + NEAT/steps + EEE + TEF), not measured',
      // LA FFM QUE DIVIDE LA EA Y ALIMENTA EL BMR, DE UNA SOLA FUENTE (E-9, auditoría
      // 2026-09-08): `ffmKg()` en coach-engine.js — Withings de menos de 14 días → derivada de
      // la última fila con %grasa → declarada — y con su `source` al lado. Aquí se publicaba
      // la media de 28 días del campo `ffm` de las filas de nutrición, o sea el promedio de lo
      // que `nutrition.js` hubiera calculado ese día con su propia aritmética: la EA del pack
      // podía dividir por un número que ninguna pantalla mostraba.
      ...(() => {
        const rows = ctx.bodyweight || [];
        const f = (typeof ffmKg === 'function')
          ? ffmKg({ bodyweightRows: rows, settings: ctx.settings, todayStr: ctx.todayStr })
          : null;
        return f
          ? { ffmKg: _rBw(f.kg), ffmSource: f.source, ffmDate: f.date || null, ffmNote: f.note }
          : { ffmKg: _rBw(_mean(l28.map(n => _n(n.ffm)))), ffmSource: 'nutrition-rows-mean28' };
      })(),
      ffmKgMean28: _rBw(_mean(l28.map(n => _n(n.ffm)))),
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
    note: 'Steps are not converted to kcal: the per-step expenditure is already inside the modelled maintenance, and counting it twice inflates the apparent deficit.',
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
    note: 'Success = ≥2 logged sessions per week (ATH-006). The minimal version that HAPPENS beats the ideal one that does not.',
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
    // Las 3 más recientes, completas; las 4-6 COMPACTAS (sin extracto ni decisiones). El
    // coach necesita saber que en W32 ya se probó bajar la frecuencia de empuje; no necesita
    // releer los 1.200 caracteres con los que se dijo. Tres extractos más serían ~3,6 KB de
    // prosa vieja compitiendo con los hechos de esta semana.
    .map((r, i) => {
      const out = r.output || {};
      const br = out.briefing || {};
      const head = {
        kind: 'review',
        id: r.id || null, weekKey: r.weekKey, attempt: _n(r.attempt), status: r.status || null,
        applied: r.status === 'applied',
        priorities: Array.isArray(br.priorities) ? br.priorities.slice(0, 3).map(p => _trunc(p, FACTS_NOTE_CHARS)) : [],
      };
      if (i >= FACTS_FULL_REVIEWS) return Object.assign(head, { compact: true });
      return Object.assign(head, {
        appliedPlanId: r.appliedPlanId || null,
        decisions: Array.isArray(out.decisions) ? out.decisions.slice(0, 8).map(x => ({
          id: x.id || null, type: x.type || null, what: _trunc(x.what, FACTS_NOTE_CHARS),
          ruleIds: Array.isArray(x.ruleIds) ? x.ruleIds.slice(0, 6) : [],
        })) : [],
        excerpt: _trunc(br.nextWeek || br.lastWeek, FACTS_EXCERPT_CHARS),
      });
    });

  // Primera vez: la voz del cron de W36 entra como una entrada `legacy`, para que la primera
  // revisión del coach pueda retirar o mantener explícitamente lo que dijo la anterior.
  // El gate sigue siendo 3 (no 6): la legacy es prosa sin Rule IDs y sólo tiene sentido
  // mientras el coach in-app apenas tenga historial propio.
  const legacy = ctx.inp.legacyLatest;
  if (legacy && rows.length < FACTS_FULL_REVIEWS) {
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
      note: 'Review from before the in-app coach (markdown/`latest.json`). It carries no structured decisions and no ruleIds: treat it as prose, not as data.',
    });
  }
  if (!rows.length) {
    ctx.gaps.push('No prior reviews: there is no earlier decision to review ("I told you X"). This is the first coach review.');
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
    gaps.push(`Only ${nWorkouts} strength sessions logged in the 4-week window (gate ${FACTS_MIN_WORKOUTS}): the progression signal is weak and volume does not go up.`);
  }
  const nRuns = ctx.runs.filter(x => _inWindow(x.date, ctx.from4w, ctx.todayStr)).length;
  if (nRuns === 0) {
    gaps.push('Zero runs in the 4-week window: there is no way to evaluate Z2 or justify a km ramp — no ramp (END-003).');
  }
  const w = facts.progress && facts.progress.weight;
  if (w && (w.nMeasured28 || 0) < FACTS_MIN_MEASURED_WEIGHTS) {
    gaps.push(`Only ${w.nMeasured28 || 0} MEASURED weigh-ins in 28 days (gate ${FACTS_MIN_MEASURED_WEIGHTS}): the slope is not signal and calories are not adjusted on it.`);
  } else if (w && (w.nMeasured7 || 0) < FACTS_MIN_MEASURED_WEIGHTS_7) {
    gaps.push(`Only ${w.nMeasured7 || 0} measured weigh-ins in 7 days (gate ${FACTS_MIN_MEASURED_WEIGHTS_7}): the 7-day mean is indicative only.`);
  }
  if (w && w.validWindow && !w.validWindow.ok) {
    gaps.push(`Weight window NOT valid for adjusting calories: ${w.validWindow.reasons.join('; ')}.`);
  }
  for (const [name, s] of Object.entries(facts.staleness || {})) {
    if (s.stale && s.n > 0) gaps.push(`Stale data in \`${name}\`: the last one is from ${s.lastDate} (${s.daysAgo} days).`);
    if (s.n === 0) gaps.push(`The \`${name}\` store arrives empty in the pack: there is nothing to read there.`);
  }
  // ---- Huecos de la TRAYECTORIA (esquema 2) ----
  const tr = facts.trajectory || null;
  const prog = tr && tr.program;
  if (prog) {
    if (prog.weeksSince != null && prog.weeksSince < FACTS_TRAJ_MIN_WEEKS) {
      gaps.push(`Short trajectory (${prog.weeksSince} weeks, <${FACTS_TRAJ_MIN_WEEKS}): slopes are indicative, not signal.`);
    }
    const sinceAnchor = (prog.blocks || []).filter(b => _n(b.index) != null && _n(b.index) >= 1);
    if (sinceAnchor.length === 1) {
      gaps.push('Only one block since the anchor: there is no earlier block to compare against.');
    }
  }
  for (const a of (tr && tr.anchors) || []) {
    if (!a.exposures) gaps.push(`Anchor \`${a.id}\` with 0 logged exposures: there is no way to say whether it is being maintained.`);
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

// Suelos de nutrición. Las kcal subieron de 2.500/2.300 a **2.700/2.400** el 2026-09-08
// (auditoría R-1, decisión de Julian): con 2.500 kcal en día de entreno la disponibilidad
// energética cae a ~27 kcal/kg FFM y REC-008 marca 30 como umbral de riesgo — el suelo viejo
// contradecía la regla que lo justificaba, y lo hacía en la dirección que más cuesta deshacer.
const VP_FLOORS = { proteinG: 185, kcalTraining: 2700, kcalRest: 2400 };
const VP_MAX_SETS_PER_MUSCLE = 14;
// F-7 (auditoría 2026-09-09). STR-003 dice 10-14 series/músculo/semana en déficit y el validador
// sólo tenía el TECHO: la semana viva pasaba con Hamstrings 9, Shoulders 7 y bíceps 0 directo sin
// que nada dijera nada, porque "no pasarse" no es lo mismo que "llegar". El suelo se juzga sobre
// FAMILIAS agregadas, no sobre las etiquetas de la semilla: la cadena posterior repartida en
// `Hamstrings` / `Posterior` / `Glutes` leía 9 series donde había 14.
const VP_MIN_SETS_PER_MUSCLE = 10;
const VP_POSTERIOR_FAMILY = 'Posterior chain';
const VP_VOLUME_FAMILY_MERGE = {
  hamstrings: VP_POSTERIOR_FAMILY, posterior: VP_POSTERIOR_FAMILY,
  'posterior chain': VP_POSTERIOR_FAMILY, glutes: VP_POSTERIOR_FAMILY,
};
// Lo que NO es volumen de hipertrofia y por tanto no tiene suelo: pliometría/acondicionamiento
// (`Power`, ver `_vpVolumeMuscle`), el core (ATH-003 lo gobierna por PATRÓN, no por series) y el
// cajón de sastre `otros`, que es "la semilla no dijo músculo" y no un grupo muscular.
// Los erectores, como el core: se entrenan por patrón (cada bisagra, cada transporte) y el corpus
// no declara un rango de series para ellos. Sólo aparecen como crédito secundario de `hinge`.
const VP_ERECTORS_MUSCLE = 'Erectors';
const VP_VOLUME_NO_FLOOR = { power: 1, core: 1, otros: 1, erectors: 1 };
/** La familia de volumen de un músculo (agrega la cadena posterior). */
function _vpMuscleFamily(muscle) {
  const key = String(muscle == null ? '' : muscle).trim().toLowerCase();
  return VP_VOLUME_FAMILY_MERGE[key] || (muscle || 'otros');
}
/** `{músculo: series}` → `{familia: series}`. */
function _vpMuscleFamilies(byMuscle) {
  const out = {};
  for (const [m, n] of Object.entries(byMuscle || {})) {
    const fam = _vpMuscleFamily(m);
    out[fam] = (out[fam] || 0) + (_n(n) || 0);
  }
  return out;
}
/** ¿Esta familia tiene suelo de series? (Power/Core/otros no.) */
function _vpFamilyHasFloor(fam) {
  return !VP_VOLUME_NO_FLOOR[String(fam == null ? '' : fam).trim().toLowerCase()];
}
// v11.70 (L-1). Ejercicios que NO son volumen de hipertrofia aunque la semilla les ponga un músculo:
// pliometría, acondicionamiento y transporte — el mismo criterio que MOVEMENT_PATTERNS en app.js y que
// `renderMuscleVolume` (que ya los mandaba a la fila 'Power' EN PANTALLA desde v11.48, mientras los dos
// contadores de aquí seguían sumándolos). Con el box jump como 'Quads', la semana de 6 días leía 16
// series contra un tope de 14 y VOL-CAP salía en rojo en cada propuesta del coach — y el coach veía 16
// cuando eran 13. Se cuentan aparte, en 'Power', y VOL-CAP no juzga esa fila.
const VP_NON_HYPERTROPHY_IDS = new Set(['box-jump', 'pogo-hops', 'broad-jump', 'sled-push', 'sled-drag', 'ski-erg', 'farmer-carry']);
const VP_POWER_MUSCLE = 'Power';
function _vpVolumeMuscle(id, muscle) {
  if (VP_NON_HYPERTROPHY_IDS.has(String(id || ''))) return VP_POWER_MUSCLE;
  if (/^(power|conditioning|cardio|plyo)$/i.test(String(muscle || ''))) return VP_POWER_MUSCLE;
  return muscle || 'otros';
}

// ── SERIES EFECTIVAS (fraccionadas) · v11.71 ────────────────────────────────────────────────
//
// EL FALLO. Los dos contadores de volumen sumaban series DIRECTAS: la etiqueta `muscle` del
// ejercicio, 1 serie entera para ese músculo y NADA para nadie más. Con esa cuenta un press de
// banca no le acredita nada al hombro ni al tríceps, y una remada nada al bíceps — así que sobre
// la semilla real seis familias incumplían el suelo de 10 a la vez (Rear Delt 3, Chest 4,
// Shoulders 4, Quads 7, Posterior chain 7, Back 8) con un plan perfectamente razonable delante.
// Ningún entrenador cuenta así, y el 10-14 de STR-003 NO está escrito en esos términos: la
// convención de la literatura de dosis-respuesta (Pelland 2026, Currier 2023) es **1,0 serie para
// el motor primario y ~0,5 para cada secundario cargado de forma significativa**.
//
// LA DECISIÓN SE TOMA POR PATRÓN, no por ejercicio. `movementPattern` ya existe en la librería
// (`MOVEMENT_PATTERNS` en app.js) y es la única propiedad estructural del movimiento que el
// sistema tiene; decidir por id serían 90 decisiones sin auditar. Una decisión por patrón,
// conservadora, y el primario es SIEMPRE la etiqueta `muscle` del propio ejercicio a 1,0.
//
// CONSERVADORA quiere decir dos cosas concretas:
//   · Un patrón que no está en el mapa (o un ejercicio cuyo patrón no se puede resolver) no
//     acredita NADA. El sesgo es siempre a subcontar, nunca a inflar.
//   · Un secundario que coincide con el primario no cobra dos veces (close-grip bench etiquetado
//     'Triceps' vale 1,0, no 1,5).
const VP_SECONDARY_CREDIT = 0.5;
// El compañero de cadena posterior de una bisagra: el miembro que NO es el primario. Con la
// etiqueta paraguas 'Posterior' (peso muerto) se acredita el glúteo, que es el motor de la
// extensión de cadera terminal.
function _vpHingePartner(muscle) {
  return /^glutes?$/i.test(String(muscle == null ? '' : muscle).trim()) ? 'Hamstrings' : 'Glutes';
}
// Los valores son las etiquetas `muscle` de la semilla (las claves de EXERCISE_ALTERNATIVES en
// app.js): 'Shoulders', 'Triceps', 'Biceps', 'Rear Delt', 'Glutes', 'Hamstrings', 'Back'. Una
// función cuando el secundario depende del primario. `[]` es una decisión explícita de no
// acreditar, no un hueco.
const VP_PATTERN_SECONDARIES = {
  // Deltoides anterior y tríceps son sinergistas obligados de cualquier empuje horizontal.
  'horizontal-press': ['Shoulders', 'Triceps'],
  // En el empuje vertical el hombro YA es el primario; queda la extensión de codo.
  'vertical-press': ['Triceps'],
  // Flexión de codo (bíceps) + deltoides posterior en la retracción escapular.
  'horizontal-pull': ['Biceps', 'Rear Delt'],
  // Flexión de codo. El deltoides posterior apenas trabaja en el plano vertical.
  'vertical-pull': ['Biceps'],
  // Extensión de cadera bajo carga. Los isquios en sentadilla trabajan casi isométricos: no cobran.
  squat: ['Glutes'],
  // Zancada / split squat: la misma extensión de cadera que la sentadilla, con MÁS recorrido de
  // cadera todavía. Misma decisión que `squat`, por consistencia.
  'single-leg': ['Glutes'],
  // El otro miembro de la cadena posterior, y los erectores — que en un peso muerto sostienen la
  // columna bajo la carga más alta de la semana.
  //
  // LOS ERECTORES VAN A SU PROPIO CUBO, no a `Back`. La etiqueta `Back` de la semilla es dorsal y
  // espalda media, y está EXACTAMENTE en el tope (14 directas): sumarle ahí el crédito de los
  // erectores la empujaba a 17,5 efectivas y encendía un `VOL-CAP` blando permanente sobre un
  // músculo que no se ha pasado de nada. Además el erector no es el dorsal. `Erectors` no tiene
  // suelo ni techo (`VP_VOLUME_NO_FLOOR`, `_vpFamilyHasCap`): el corpus no declara un 10-14 para
  // los erectores, que trabajan en cada bisagra y en cada transporte de la semana.
  hinge: (muscle) => [_vpHingePartner(muscle), VP_ERECTORS_MUSCLE],
  // Hip thrust / glute drive / kickback: cadera extendida con el tronco APOYADO — sin carga de
  // erectores, y el isquio trabaja corto. Es prácticamente monoarticular.
  glute: [],
  // Aislamiento: monoarticular por definición. Todo el crédito es del primario.
  'isolation-quad': [], 'isolation-ham': [], 'isolation-calf': [], 'isolation-lat': [],
  'isolation-shoulder': [], 'isolation-rear-delt': [], 'isolation-tricep': [], 'isolation-bicep': [],
  // No son volumen de hipertrofia (van a la fila `Power`, ver `_vpVolumeMuscle`): acreditar
  // secundarios sería inventarse volumen que la regla no cuenta.
  plyometric: [], conditioning: [], carry: [],
  // El core lo gobierna ATH-003 por PATRÓN, no por series, y no tiene suelo (VP_VOLUME_NO_FLOOR).
  'core-anti-rotation': [], 'core-anti-extension': [], 'core-flexion': [],
  // Patrón desconocido: sin decisión no hay crédito.
  other: [],
};
// APERTURAS: monoarticulares aunque la librería las etiquete `horizontal-press`. Una apertura no
// extiende el codo ni presiona por encima, así que no acredita tríceps ni hombro. Se listan por id
// porque el patrón que traen de `app.js` es el del press y ese fichero no es de este incremento.
const VP_NO_SECONDARY_IDS = {
  'incline-db-fly': 1, 'cable-fly': 1, 'cable-crossover': 1, 'pec-deck': 1, 'db-fly': 1,
  'machine-fly': 1, 'rear-delt-fly': 1,
};
/** Los secundarios de un ejercicio, ya resueltos contra su primario. */
function _vpSecondariesFor(pattern, muscle) {
  const def = VP_PATTERN_SECONDARIES[String(pattern == null ? '' : pattern)];
  if (def == null) return [];
  const list = typeof def === 'function' ? def(muscle) : def;
  return (Array.isArray(list) ? list : []).filter(m => m && String(m) !== String(muscle));
}
/** Redondeo a media serie: el crédito fraccionado es una estimación, no una medida al decimal. */
function _vpHalf(n) { return Math.round((_n(n) || 0) * 2) / 2; }

const VP_MAX_HARD_CARDIO = 1;
const VP_MAX_BUDGET = 6;
const VP_MAX_PRESS_EXPOSURES = 2;
const VP_MAX_SESSION_MIN = 75;
const VP_MAX_PLYO_CONTACTS = 80;
const VP_MAX_STRUCTURAL_CHANGES = 3;
const VP_MIN_STRENGTH_SESSIONS = 2;
const VP_MIN_MOBILITY_SLOTS = 2;
// Tope duro de días de fuerza, con y sin variante. `variant + 1` deja margen para una semana en
// la que el coach añade UN día justificado; 5 es el techo absoluto (CLAUDE.md: "no programar más
// de 4-5 sesiones/semana sin justificarlo"). Sin `variant` se usa 5: hasta el 2026-09-08 el
// chequeo se SALTABA sin variante, así que un sexto día de gimnasio no lo paraba nadie (E-14a).
const VP_MAX_STRENGTH_DAYS = 5;
const VP_VARIANT_SLACK = 1;
// Un largo de ≥10 km es una sesión dura aunque su subtipo diga "fácil": el coste para la pierna
// del día siguiente lo pone la distancia, no la etiqueta (E-14b).
const VP_LONG_RUN_HARD_KM = 10;
// END-009 / ACSM 2024: 150 min/semana de MVPA es el suelo, 200-300 la banda de pérdida de grasa.
// Se cuentan minutos de CARDIO solamente (la fuerza también es MVPA, así que el chequeo se queda
// corto a propósito: un aviso que se dispara de más se ignora en dos semanas).
const VP_MIN_MVPA_MIN = 150;
const VP_MVPA_FAT_LOSS_MIN = 200;
// REC-002 + el piloto de kcal de C.1: un ajuste de ingesta no pasa de 150 kcal y no llega antes
// de 14 días del anterior. Sin esto, "el ritmo es un dial gobernado por rendimiento" era prosa.
const VP_KCAL_STEP_MAX = 150;
const VP_KCAL_ADJUST_DAYS = 14;
// F-5 (auditoría 2026-09-09) · el veto de recomposición. Los mismos tres números del paso 6 del
// prompt: grasa que baja ≥0,5 kg, magra que no cae más de 0,3 kg, y ≥21 días entre lecturas de la
// báscula (por debajo, la bioimpedancia no separa la tendencia del agua).
const VP_RECOMP_FAT_DROP_KG = -0.5;
const VP_RECOMP_FFM_HOLD_KG = -0.3;
const VP_RECOMP_MIN_SPAN_DAYS = 21;
/** Una decisión que dice, en palabras, que baja la ingesta. La salida del modelo va en inglés. */
const VP_LOWER_KCAL_RE = /\b(lower|reduce|cut|drop|decrease|trim)\b[^.]{0,40}\b(kcal|calorie|calories|intake|deficit)\b|\b(kcal|calorie|calories|intake)\b[^.]{0,40}\b(down|lower|cut)\b/i;
// STR-002 (`strong`): cada patrón mayor, 2 veces por semana. Sólo se comprueba en variantes de
// 4 días o más — con 2-3 días de fuerza la frecuencia 2× es aritméticamente imposible y el aviso
// sería permanente.
const VP_MIN_PATTERN_EXPOSURES = 2;
const VP_FREQ_FLOOR_MIN_VARIANT = 4;
// Días de gimnasio mínimos para que el SUELO de series tenga sentido. Con dos sesiones, 10 series
// por familia no cabe en la semana; con tres, las familias grandes llegan y las pequeñas no, y eso
// SÍ es una decisión (redistribuir o aceptar).
const VP_MIN_GYM_DAYS_FOR_FLOOR = 3;
/**
 * Las cuatro FAMILIAS de patrón mayor, y por qué son familias y no patrones sueltos.
 *
 * STR-002 dice "cada grupo muscular / patrón de movimiento 2×/semana". Contado por patrón
 * estricto, el propio plan ideal lo incumpliría tres veces: sentadilla 1× (Lower A) y bisagra 1×
 * (Lower B) es exactamente el reparto upper/lower que el sistema considera correcto. Lo que la
 * regla pide de verdad es que el ESTÍMULO se repita: la rodilla se carga con la sentadilla el
 * lunes y con la extensión el jueves. De ahí que el aislamiento cuente dentro de su familia.
 */
const VP_PATTERN_FAMILIES = {
  squat: { label: 'squat / knee', patterns: { squat: 1, 'single-leg': 1, 'isolation-quad': 1 } },
  hinge: { label: 'hinge / posterior chain', patterns: { hinge: 1, 'isolation-ham': 1, glute: 1 } },
  press: { label: 'press', patterns: { 'horizontal-press': 1, 'vertical-press': 1 } },
  pull: { label: 'pull', patterns: { 'horizontal-pull': 1, 'vertical-pull': 1, 'isolation-lat': 1 } },
};
/** Fallback por id cuando el llamador no pasa `exerciseLibrary` (la edge function no lo tiene).
 *  Espejo parcial de `MOVEMENT_PATTERNS` (app.js): sólo los ids del plan ideal y sus alternativas. */
const VP_PATTERN_IDS = {
  'back-squat': 'squat', 'front-squat': 'squat', 'leg-press': 'squat', 'hack-squat': 'squat',
  'goblet-squat': 'squat', bss: 'single-leg', 'split-squat': 'single-leg', 'walking-lunge': 'single-leg',
  'leg-extension': 'isolation-quad',
  'trap-bar-dl': 'hinge', 'sumo-dl': 'hinge', 'conv-dl': 'hinge', rdl: 'hinge', 'db-rdl': 'hinge',
  'good-morning': 'hinge', 'stiff-leg-deadlift': 'hinge', 'sl-rdl': 'hinge',
  'leg-curl-a': 'isolation-ham', 'leg-curl-b': 'isolation-ham', 'seated-leg-curl': 'isolation-ham',
  'nordic-curl': 'isolation-ham', ghr: 'isolation-ham',
  'hip-thrust': 'glute', 'glute-bridge': 'glute', 'glute-drive': 'glute', 'cable-kickback': 'glute',
  'bench-press': 'horizontal-press', 'incline-press': 'horizontal-press', 'incline-db-press': 'horizontal-press',
  'db-bench': 'horizontal-press', 'machine-chest-press': 'horizontal-press', 'hammer-chest-press': 'horizontal-press',
  'close-grip-bench': 'horizontal-press', 'floor-press': 'horizontal-press', dips: 'horizontal-press',
  pushup: 'horizontal-press',
  ohp: 'vertical-press', 'db-shoulder-press': 'vertical-press', 'machine-shoulder-press': 'vertical-press',
  'arnold-press': 'vertical-press', 'pike-pushup': 'vertical-press',
  'barbell-row': 'horizontal-pull', 'cable-row': 'horizontal-pull', 'db-row': 'horizontal-pull',
  't-bar-row': 'horizontal-pull', 'chest-supported-row': 'horizontal-pull', 'landmine-row': 'horizontal-pull',
  'pendlay-row': 'horizontal-pull', 'high-row': 'horizontal-pull', 'inverted-row': 'horizontal-pull',
  'band-row': 'horizontal-pull',
  chinups: 'vertical-pull', pullups: 'vertical-pull', 'lat-pulldown': 'vertical-pull',
  'straight-arm-pulldown': 'isolation-lat',
};
// Las señales que cuentan como RENDIMIENTO en `RECOVERY-ONLY`. Sin una de éstas al lado, la
// recuperación no baja series, kg ni km: es contexto (decisión del usuario, 2026-09-07).
const VP_PERF_RE = /top ?set|topkg|e1rm|\brpe\b|\breps?\b|readout|anchor|ancla|z2|zona ?2|decoupl|deriva|drift|pace|ritmo|adheren|complet|falli?d|fallo/i;
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
// Respaldo de ENV-001 cuando NINGUNA sesión trae temperatura. Madrid: junio a septiembre.
const VP_SUMMER_MONTHS = { '06': 1, '07': 1, '08': 1, '09': 1 };
// F-26: los umbrales de "hace calor" sobre la temperatura MEDIDA (`cardio.tempC28d`). 22 °C de
// media es donde la deriva cardiovascular empieza a mover el ritmo a FC fija de forma visible;
// 28 °C de máximo hace que una sola sesión caliente ya contamine la lectura por ritmo.
const VP_HEAT_MEAN_C = 22;
const VP_HEAT_MAX_C = 28;
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

/** Formatea un número para un texto de pantalla (punto decimal, sin ceros de más). */
function _vpNum(v, decimals) {
  const x = _n(v);
  if (x == null) return '—';
  if (typeof _coachFmtKg === 'function' && (decimals == null || decimals === 1)) return _coachFmtKg(x);
  const s = (decimals == null ? x : Number(x.toFixed(decimals)));
  return String(s);
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
 *   `goals`, `zones`, `decisions`, `briefing`, `todayStr`
 *   `kcalTarget`, `kcalLastAdjustDate`, `daysSinceKcalAdjust` (opcionales, para KCAL-STEP)
 *
 * F-24 (auditoría 2026-09-09): `bodyweightKg` SALE del contrato. Ningún chequeo lo leía nunca —
 * un campo documentado que nadie usa es una promesa de que el validador sabe algo que no sabe, y
 * el llamador paga por construirlo. La proteína por kg, si algún día se valida, sale de
 * `facts.trajectory.weight` / `facts.nutrition`, que sí viajan con su fecha y su n.
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
            `${ex.name || ex.id} in ${s.name || sid}: ${_vpNum(t.kg)} kg with no source data and no "adjust by RPE, no data" marker. Every kg comes from data or is marked.`,
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
            `${ex.name || ex.id} in ${s.name || sid}: a ${_vpNum(kg)} kg target with no previous top set to compare it against. With no history, load is not prescribed: the first time is "pick a weight that leaves 2-3 reps".`,
            ['STR-001', 'LOAD-001']);
          continue;
        }
        const pct = ((kg - lastTop) / lastTop) * 100;
        if (pct > VP_LOAD_JUMP_PCT) {
          add('LOAD-JUMP', 'hard',
            `${ex.name || ex.id}: load jump from ${_vpNum(lastTop)} to ${_vpNum(kg)} kg (+${_vpNum(pct, 1)} %), above the +${VP_LOAD_JUMP_PCT} % over the last top set.`,
            ['STR-001', 'LOAD-001']);
        } else if (pct < -VP_LOAD_DROP_PCT) {
          add('LOAD-JUMP', 'warn',
            `${ex.name || ex.id}: load drop from ${_vpNum(lastTop)} to ${_vpNum(kg)} kg (${_vpNum(pct, 1)} %), more than −${VP_LOAD_DROP_PCT} % outside a deload. If it is deliberate, say so in the reason.`,
            ['STR-001', 'LOAD-001']);
        }
        // ---- G-S6 · TARGET-N1 ----
        const n = lift ? _n(lift.nSessions) : null;
        const days = lift ? _n(lift.daysSinceLast) : null;
        if (n === 1) {
          add('TARGET-N1', 'warn',
            `${ex.name || ex.id}: the ${_vpNum(kg)} kg target rests on a SINGLE session (n=1). That is a hypothesis, not a trend.`,
            ['STR-001', 'GEN-002']);
        } else if (days != null && days > VP_TARGET_STALE_DAYS) {
          add('TARGET-N1', 'warn',
            `${ex.name || ex.id}: the last data point is ${days} days old (>${VP_TARGET_STALE_DAYS}). This is a re-entry: set 1 decides, not the target.`,
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
              `\`${ex.id}\` (${s.name || sid}) is not in the exercise library: the app cannot render it or store its history. Use an existing id or add it first.`,
              ['SEL-001', 'SEL-003']);
          }
        }
      }
    }

    // ---- G-H7 · VOL-CAP (STR-003, STR-001) ----
    //
    // DOS NIVELES, y la frontera es el tipo de número. Desde v11.71 el volumen se juzga en series
    // EFECTIVAS (directas + 0,5 por secundario del patrón, ver `VP_PATTERN_SECONDARIES`), porque
    // es la convención en la que está escrito el 10-14 de STR-003. Pero el crédito fraccionado es
    // una ESTIMACIÓN de modelo, no un hecho registrado, y un DURO detiene el camino manual: sin
    // `--allow-hard` no escribe. Así que:
    //   · DURO sólo si las DIRECTAS pasan del tope. Eso es inequívoco: son series prescritas.
    //   · AVISO si sólo las EFECTIVAS lo pasan. El exceso viene del crédito fraccionado, y una
    //     estimación no bloquea un apply — se dice y Julian decide.
    const setsNow = _vpSetsPerMuscle(sessions, tpl);
    const effNow = _vpEffectiveSetsPerMuscle(sessions, tpl);
    const setsPrev = c.basedOn ? _vpSetsPerMuscle(c.basedOn.sessions || {}, c.basedOn.weekTemplate || null) : null;
    const deficit = !goals || !goals.primary || goals.primary.type !== 'maintenance';
    for (const [muscle, n] of Object.entries(setsNow.byMuscle)) {
      if (muscle === VP_POWER_MUSCLE) continue;   // pliometría/acondicionamiento: no es hipertrofia
      if (deficit && n > VP_MAX_SETS_PER_MUSCLE) {
        add('VOL-CAP', 'hard',
          `${muscle}: ${n} DIRECT sets/week, above the cap of ${VP_MAX_SETS_PER_MUSCLE} in a deficit (STR-003 says 10-14). These are prescribed sets, not an estimate: no fractional credit is involved. In a deficit volume is maintained, not raised.`,
          ['STR-003', 'STR-001']);
      }
    }
    for (const [muscle, n] of Object.entries(effNow.byMuscle)) {
      if (muscle === VP_POWER_MUSCLE) continue;
      if (!deficit || n <= VP_MAX_SETS_PER_MUSCLE) continue;
      const dir = _n(setsNow.byMuscle[muscle]) || 0;
      if (dir > VP_MAX_SETS_PER_MUSCLE) continue;   // ya salió como duro con el número directo
      add('VOL-CAP', 'warn',
        `${muscle}: ${_vpNum(n, 1)} EFFECTIVE sets/week against a cap of ${VP_MAX_SETS_PER_MUSCLE} in a deficit (STR-003 says 10-14), but only ${dir} direct. The excess is fractional credit from compounds (1.0 for the primary muscle, ${VP_SECONDARY_CREDIT} per loaded secondary of its movement pattern) — a modelling estimate, so this warns and does not block. If it is deliberate, say so; otherwise move a compound or drop a set.`,
        ['STR-003', 'STR-001']);
    }
    // ---- F-7 (auditoría 2026-09-09) · VOL-FLOOR (STR-003, STR-001) ----
    //
    // El suelo de STR-003, que sólo existía como techo. Sólo en déficit, que es donde 10-14 es el
    // rango declarado, y sólo con al menos 3 DÍAS DE GIMNASIO en la plantilla.
    //
    // LA PUERTA CUENTA DÍAS DE GIMNASIO, NO LA VARIANTE. La variante son los días que Julian
    // dedica a entrenar, cardio y recuperación incluidos: la de 4 días tiene DOS de fuerza, y con
    // dos sesiones 10 series por familia es aritméticamente imposible — el suelo avisaba de ocho
    // familias a la vez sobre un plan que no puede hacer otra cosa, que es un aviso sobre el que
    // no se puede actuar. Con la plantilla delante el número real está ahí, así que se usa ése;
    // la variante queda de respaldo para cuando no hay plantilla.
    //
    // Se juzgan las familias PRESENTES en el plan. Un músculo que el plan no nombra ni recibe
    // crédito de ningún patrón no se puede contar sin una lista canónica de grupos musculares, y
    // fabricarla aquí sería inventar el denominador: eso se ve en `plan.plannedSetsPerMuscle` y
    // lo juzga el coach. Desde v11.71 el bíceps SÍ entra (lo acreditan los tirones), que era el
    // ejemplo que este comentario usaba para decir que no se podía.
    const gymDaysForFloor = tpl ? _vpCount(tpl, x => x && x.type === 'gym') : null;
    const floorGateOk = gymDaysForFloor != null
      ? gymDaysForFloor >= VP_MIN_GYM_DAYS_FOR_FLOOR
      : (_n(c.variant) == null || _n(c.variant) >= VP_FREQ_FLOOR_MIN_VARIANT);
    if (deficit && floorGateOk) {
      const families = effNow.families;
      // UN aviso con la lista, no uno por familia: sobre el plan vivo el suelo lo incumplen tres
      // o cuatro a la vez, y cuatro chips con el mismo texto de tres frases se leen como ruido.
      // El hallazgo es uno y la decisión también (¿se redistribuyen series o se acepta?).
      //
      // Y SE JUZGA EN SERIES EFECTIVAS (v11.71). Hasta aquí el contador sumaba sólo las series
      // cuya etiqueta `muscle` era esa familia — las DIRECTAS — y el aviso lo confesaba: un press
      // no acreditaba nada al hombro, una remada nada al bíceps. Sobre la semilla real eso hacía
      // que seis familias incumplieran el suelo a la vez con un plan razonable delante, y un aviso
      // que salta siempre no informa de nada. El 10-14 de STR-003 está escrito en series
      // efectivas (1,0 al primario + 0,5 a cada secundario cargado del patrón), así que ése es el
      // número que se juzga. Las directas siguen publicadas en el pack, al lado.
      const bajo = Object.entries(families)
        .filter(([fam, n]) => _vpFamilyHasFloor(fam) && n < VP_MIN_SETS_PER_MUSCLE)
        .sort((a, b) => a[1] - b[1]);
      if (bajo.length) {
        add('VOL-FLOOR', 'warn',
          `Below the floor of ${VP_MIN_SETS_PER_MUSCLE} EFFECTIVE sets/week (STR-003 says 10-14 in a deficit): ${
            bajo.map(([fam, n]) => `${fam} ${_vpNum(n, 1)}`).join(', ')}. Effective sets = 1.0 for the exercise's primary muscle + ${VP_SECONDARY_CREDIT} for each meaningfully loaded secondary of its movement pattern (a bench press credits shoulders and triceps, a row credits biceps and rear delts), which is the convention STR-003's 10-14 is written in; the direct-only count is published next to it in \`plan.plannedSetsPerMuscle.byMuscle\`. Under the floor the muscle is not maintained, it is visited — and in a deficit that is where lean mass goes. Counted by family: ${VP_POSTERIOR_FAMILY} merges Hamstrings + Posterior + Glutes.`,
          ['STR-003', 'STR-001']);
      }
    }

    if (setsPrev && setsPrev.total > 0) {
      const pct = ((setsNow.total - setsPrev.total) / setsPrev.total) * 100;
      if (pct > VP_LOAD_JUMP_PCT && !_vpVolumeGatesOk(facts)) {
        add('VOL-CAP', 'hard',
          `Total volume from ${setsPrev.total} to ${setsNow.total} sets (+${_vpNum(pct, 1)} %) without the three gates: adherence ≥75 %, a green week and nutrition logged ≥10/14. Adding sets in a deficit without all three is the fast lane into a hole.`,
          ['STR-003', 'STR-001']);
      }
    }

    // ---- G-H3 · DELOAD-VOLUME (LOAD-004) ----
    if (isDeload) {
      if (setsPrev && setsPrev.total > 0 && setsNow.total > setsPrev.total * VP_DELOAD_VOLUME_FACTOR) {
        add('DELOAD-VOLUME', 'hard',
          `DELOAD week with ${setsNow.total} sets against ${setsPrev.total} in the loading week: above the ${Math.round(VP_DELOAD_VOLUME_FACTOR * 100)} % that defines a deload (sets at 50 %, RPE 5-6, kg 85-90 %).`,
          ['LOAD-004']);
      }
      const plyo = _vpPlyoExercises(sessions);
      if (plyo.length) {
        add('DELOAD-VOLUME', 'hard',
          `Deload week with plyometrics (${plyo.map(x => x.id).join(', ')}): there is no box jump in a deload.`,
          ['LOAD-004', 'ATH-001']);
      }
      const hard = _vpHardCardio(p, tpl);
      if (hard.count > 0) {
        add('DELOAD-VOLUME', 'hard',
          `Deload week with ${hard.count} hard cardio session(s) (${hard.labels.join(', ')}): a deload cuts running by 30-40 %, it does not add quality.`,
          ['LOAD-004', 'END-004']);
      }
      if (p.block && p.block.phase && p.block.phase !== 'deload') {
        add('DELOAD-VOLUME', 'hard',
          `Week ${c.block && c.block.index ? c.block.index : '?'}/${(c.block && c.block.weeksTotal) || 5} is a deload by calendar but the plan marks it \`phase: '${p.block.phase}'\`. The calendar rules (LOAD-004).`,
          ['LOAD-004']);
      }
    }

    // ---- G-H4 · HARD-CARDIO (END-004, BUD-001) ----
    const hardAll = _vpHardCardio(p, tpl);
    if (hardAll.count > VP_MAX_HARD_CARDIO) {
      add('HARD-CARDIO', 'hard',
        `${hardAll.count} hard cardio/hybrid sessions in the week (${hardAll.labels.join(', ')}): the cap is ${VP_MAX_HARD_CARDIO}. Never the hard session and the hybrid in the same week.`,
        ['END-004', 'BUD-001']);
    }

    // ---- G-H5 · RUN-BEFORE-LEGS (INT-001, HYB-002) ----
    //
    // Desde el 2026-09-08 cuenta como duro también un largo de ≥10 km (`_vpSlotIsHardCardio`) y
    // cualquier día declarado en `running.hardSessions[]`: el chequeo mira los dos orígenes, no
    // sólo el subtipo del slot. La vuelta domingo → lunes cuenta (el día siguiente al 0 es el 1).
    if (tpl && lowerSet) {
      const hardDays = new Set(_vpHardSessionDays(p));
      for (let dow = 0; dow <= 6; dow++) {
        const slot = tpl[dow] || tpl[String(dow)];
        const isHard = _vpSlotIsHardCardio(slot) || hardDays.has(dow);
        if (!isHard) continue;
        const next = (dow + 1) % 7;                       // Domingo (0) → lunes (1): la vuelta cuenta
        const ns = tpl[next] || tpl[String(next)];
        if (ns && ns.type === 'gym' && ns.session && lowerSet.has(ns.session)) {
          const km = _n((slot && slot.cardio && slot.cardio.distanceKm) != null
            ? slot.cardio.distanceKm : (slot && slot.distanceKm));
          const que = (km != null && km >= VP_LONG_RUN_HARD_KM)
            ? `${_vpNum(km, 1)} km long run (≥${VP_LONG_RUN_HARD_KM}: counts as hard)`
            : (_vpSlotIsHardCardio(slot) ? 'hard/hybrid cardio' : 'hard session declared in `running.hardSessions`');
          add('RUN-BEFORE-LEGS', 'hard',
            `${_vpDow(dow)}: ${que} less than 24 h before the leg session on ${_vpDow(next)} (${ns.session}). Quality work stays away from legs (INT-001).`,
            ['INT-001', 'HYB-002']);
        }
      }
    }

    // ---- G-S17 · ORDER-SAME-DAY (INT-003) ----
    // Lo que ningún guardarraíl detenía: "levantar primero si comparten día" no existía en
    // ningún sitio (E-14c). Blando porque INT-003 es `weak_extrapolated`: Schumann 2022 sostiene
    // la interferencia intra-sesión, pero el ORDEN concreto es ordenación práctica.
    for (const d of _vpCardioBeforeLift(tpl, sessions)) {
      add('ORDER-SAME-DAY', 'warn',
        `${_vpDow(d.dow)}: cardio comes BEFORE ${d.name}. If the goal of the day is strength, you lift first (INT-003, \`weak_extrapolated\`: practical sequencing, not a measured result). If the dominant goal of the day is aerobic, say so in the reason.`,
        ['INT-003', 'INT-001']);
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
              `${anchor} leaves ${s.name || sid} and no allowed substitute comes in (${Object.keys(allowed).join(' / ') || 'none'}). An anchor is not rotated out because it stalled: you change the set scheme.`,
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
          `${_vpNum(kmNow, 1)} km/week after ${daysSinceRun} days without running: re-entry is capped at ${VP_REENTRY_KM_CAP} km.`,
          ['END-003', 'LOAD-001']);
      } else if (kmMax != null && kmMax > 0 && kmNow > kmMax * VP_KM_HARD_FACTOR) {
        add('KM-JUMP', 'hard',
          `${_vpNum(kmNow, 1)} km/week against a 4-week maximum of ${_vpNum(kmMax, 1)} km: above ×${VP_KM_HARD_FACTOR} (${_vpNum(kmMax * VP_KM_HARD_FACTOR, 1)} km).`,
          ['END-003', 'LOAD-001']);
      } else if (kmPrev != null && kmPrev > 0 && kmNow > Math.max(kmPrev * VP_KM_SOFT_FACTOR, kmPrev + VP_KM_FLOOR_KM)) {
        const cap = Math.max(kmPrev * VP_KM_SOFT_FACTOR, kmPrev + VP_KM_FLOOR_KM);
        add('KM-JUMP', 'warn',
          `${_vpNum(kmNow, 1)} km/week against ${_vpNum(kmPrev, 1)} last week (indicative cap ${_vpNum(cap, 1)} km): above the indicative 10 %, which is prudent heuristic and NOT validated (Buist 2008 found no difference between 10 % and 24 %).`,
          ['END-003', 'LOAD-001']);
      }
    }

    // ---- G-H9 · PROTEIN-FLOOR / KCAL-FLOOR (REC-001, REC-008) ----
    const nut = _vpNutrition(p, decisions);
    if (nut.proteinG != null && nut.proteinG < floors.proteinG) {
      add('PROTEIN-FLOOR', 'hard',
        `Protein at ${_vpNum(nut.proteinG, 0)} g/day, below the floor of ${floors.proteinG} g. Protein never gives way (REC-001).`,
        ['REC-001', 'REC-008']);
    }
    if (nut.kcalTraining != null && nut.kcalTraining < floors.kcalTraining) {
      add('KCAL-FLOOR', 'hard',
        `Training day at ${_vpNum(nut.kcalTraining, 0)} kcal, below the floor of ${floors.kcalTraining}.`,
        ['REC-001', 'REC-008']);
    }
    if (nut.kcalRest != null && nut.kcalRest < floors.kcalRest) {
      add('KCAL-FLOOR', 'hard',
        `Rest day at ${_vpNum(nut.kcalRest, 0)} kcal, below the floor of ${floors.kcalRest}.`,
        ['REC-001', 'REC-008']);
    }
    // Omitir la proteína en una semana de déficit no es lo mismo que bajarla, pero se parece
    // demasiado: una propuesta que toca la ingesta y no menciona el suelo deja al usuario
    // adivinando cuál de los dos números manda (E-14f). Blando: puede estar en el briefing.
    if (deficit && _vpTouchesKcal(decisions, p) && nut.proteinG == null) {
      add('PROTEIN-FLOOR', 'warn',
        `The proposal touches intake in a deficit week and says nothing about protein: with no protein guidance, the ${floors.proteinG} g floor lives only in whoever remembers it (REC-001).`,
        ['REC-001', 'REC-008']);
    }

    // ---- G-H14 · KCAL-STEP (REC-002) ----
    //
    // EL FALLO QUE ESTO IMPIDE (auditoría E-18). El coach ya podía proponer `nutrition.kcalTarget`
    // y nada acotaba el paso: un −400 de golpe, o dos ajustes en semanas consecutivas, pasaban
    // como "el ritmo es un dial gobernado por el rendimiento". Sin tope, el dial es un
    // interruptor: dos semanas después no se sabe si la pendiente cambió por el ajuste o por el
    // ruido, que es justo lo que la ventana de 14 días protege.
    const kcalNow = _n(p.nutrition && (p.nutrition.kcalTarget != null ? p.nutrition.kcalTarget : p.nutrition.kcal));
    const kcalWin = facts.progress && facts.progress.weight && facts.progress.weight.validWindow;
    const kcalPrev = _n(c.kcalTarget) != null ? _n(c.kcalTarget)
      : _n(facts.nutrition && facts.nutrition.kcal && facts.nutrition.kcal.targetMean7);
    if (kcalNow != null && kcalPrev != null && kcalNow !== kcalPrev) {
      const delta = kcalNow - kcalPrev;
      if (Math.abs(delta) > VP_KCAL_STEP_MAX) {
        add('KCAL-STEP', 'hard',
          `kcal target from ${_vpNum(kcalPrev, 0)} to ${_vpNum(kcalNow, 0)} (${delta > 0 ? '+' : '−'}${_vpNum(Math.abs(delta), 0)}): the maximum step is ${VP_KCAL_STEP_MAX} kcal (REC-002). A bigger jump cannot be read in the slope: two weeks later there is no telling whether it dropped from the adjustment or from water.`,
          ['REC-002', 'REC-008']);
      }
      const daysSince = _n(c.daysSinceKcalAdjust) != null ? _n(c.daysSinceKcalAdjust)
        : _n(kcalWin && kcalWin.daysSinceLastAdjust);
      const lastDate = c.kcalLastAdjustDate || (kcalWin && kcalWin.lastAdjustDate) || null;
      if (daysSince != null && daysSince < VP_KCAL_ADJUST_DAYS) {
        add('KCAL-STEP', 'hard',
          `kcal adjustment ${daysSince} day(s) after the last one (${lastDate || 'no date'}): the gate is ${VP_KCAL_ADJUST_DAYS} days (REC-002). Two adjustments inside the same window make the slope of both unreadable.`,
          ['REC-002', 'REC-008']);
      }
    }

    // ---- F-5 (auditoría 2026-09-09) · RECOMP-HOLD (REC-002, REC-008) ----
    //
    // EL FALLO QUE ESTO IMPIDE. El piloto del déficit lee la PENDIENTE DEL PESO, y el peso plano
    // con la grasa bajando y la magra aguantando es exactamente el objetivo #1 cumpliéndose
    // (recomposición). Sin este aviso, la báscula de composición —que el pack ya publica en
    // `trajectory.weight.scale` desde v11.69— no tenía ningún consumidor ejecutable y el coach
    // podía recortar kcal por un artefacto de la balanza, que es la forma más cara de perder
    // masa magra: se cambia lo que funciona por un número que no medía lo que se quería.
    //
    // Los tres requisitos son los del paso 6 del prompt, ni uno menos: grasa −0,5 kg o más, FFM
    // que no cae más de 0,3 kg y ≥21 días entre la primera y la última lectura. Con menos span
    // la bioimpedancia no distingue una tendencia del ruido de hidratación.
    const scale = facts.trajectory && facts.trajectory.weight && facts.trajectory.weight.scale;
    if (scale && decisions.length) {
      const fat = _n(scale.fatMassKgDelta28d);
      const ffm = _n(scale.ffmKgDelta28d);
      const span = scale.deltaFrom && scale.date ? _cfDiff(scale.deltaFrom, scale.date) : null;
      const recomp = fat != null && ffm != null && span != null
        && fat <= VP_RECOMP_FAT_DROP_KG && ffm >= VP_RECOMP_FFM_HOLD_KG && span >= VP_RECOMP_MIN_SPAN_DAYS;
      if (recomp) {
        // La referencia del "baja" es el objetivo ANTERIOR, no un suelo: bajar de 2.700 a 2.550
        // es bajar aunque los dos estén por encima del suelo. Sin referencia de día de descanso
        // no se compara ese número — un 2.400 de descanso al lado de un target medio de 2.600 no
        // es un recorte, es que el día de descanso come menos.
        const nutPrev = (c.basedOn && c.basedOn.nutrition) || {};
        const refTraining = _n(nutPrev.kcalTraining) != null ? _n(nutPrev.kcalTraining)
          : (_n(c.kcalTarget) != null ? _n(c.kcalTarget)
            : _n(facts.nutrition && facts.nutrition.kcal && facts.nutrition.kcal.targetMean7));
        const refRest = _n(nutPrev.kcalRest);
        for (const dec of decisions) {
          if (!dec || dec.type !== 'nutrition') continue;
          const num = (dec.evidence && dec.evidence.numbers) || dec.numbers || {};
          const why = [];
          const t = _n(num.kcalTraining), r = _n(num.kcalRest);
          if (t != null && refTraining != null && t < refTraining) why.push(`training day ${_vpNum(refTraining, 0)} → ${_vpNum(t, 0)} kcal`);
          if (r != null && refRest != null && r < refRest) why.push(`rest day ${_vpNum(refRest, 0)} → ${_vpNum(r, 0)} kcal`);
          if (_n(num.from) != null && _n(num.to) != null && _n(num.to) < _n(num.from) && _n(num.from) >= 1000) {
            why.push(`${_vpNum(_n(num.from), 0)} → ${_vpNum(_n(num.to), 0)} kcal`);
          }
          if (_n(num.kcalDelta) != null && _n(num.kcalDelta) < 0) why.push(`${_vpNum(_n(num.kcalDelta), 0)} kcal`);
          if (!why.length && VP_LOWER_KCAL_RE.test(`${dec.what || ''} ${dec.why || ''}`)) why.push('the decision text says it lowers intake');
          if (!why.length) continue;
          add('RECOMP-HOLD', 'warn',
            `The scale says RECOMPOSITION (fat mass ${_vpNum(fat, 1)} kg, FFM ${ffm >= 0 ? '+' : ''}${_vpNum(ffm, 1)} kg over ${span} days since ${scale.deltaFrom}) and this decision still lowers intake (${why.join(' · ')}). Flat weight with fat coming down is goal #1 being met, not a stall: hold the target and move the EXPENDITURE lever (steps REC-009, easy minutes towards the ${VP_MVPA_FAT_LOSS_MIN}-300 min band of END-009).`,
            ['REC-002', 'REC-008']);
        }
      }
    }

    // ---- G-S15 · DELOAD-DIETBREAK (REC-005) ----
    //
    // BLANDO desde el 2026-09-08 (auditoría R-7). Era duro, y descansaba entero sobre REC-005,
    // `weak_extrapolated`, cuyo propio texto dice que el diet break alineado con el deload
    // mejora la EFICIENCIA de la pérdida y **no** preserva más masa magra. Una regla dura sobre
    // esa base es exactamente el patrón que la auditoría fue a buscar: certeza prestada.
    if (nut.dietBreak != null || isDeload) {
      const db = nut.dietBreak === true;
      if (isDeload && nut.dietBreak === false) {
        add('DELOAD-DIETBREAK', 'warn',
          'Deload week without a diet break: the deload and the bump to maintenance are scheduled together (REC-005, `weak_extrapolated`: it improves the efficiency of the loss, it does NOT preserve more lean mass — practice, not strong evidence). If they go separately, say so in the reason.',
          ['REC-005', 'LOAD-004']);
      } else if (!isDeload && db) {
        add('DELOAD-DIETBREAK', 'warn',
          'Diet break in a loading week: maintenance and deload go together (REC-005, `weak_extrapolated`), not in separate weeks.',
          ['REC-005', 'LOAD-004']);
      }
    }

    // ---- G-H10 · PLYO-PLACEMENT (INT-004 `strong`) / G-S16 · PLYO-CONTACTS (ATH-001) ----
    for (const item of _vpPlyoExercises(sessions)) {
      if (item.sid !== VP_PLYO_SESSION) {
        add('PLYO-PLACEMENT', 'hard',
          `${item.id} is in ${item.sessionName}: plyometrics belong in ${VP_PLYO_SESSION} and when fresh (INT-004).`,
          ['ATH-001', 'INT-004']);
      } else if (item.index > 0) {
        add('PLYO-PLACEMENT', 'hard',
          `${item.id} sits at position ${item.index + 1} of ${item.sessionName}: power goes FIRST, with maximal intent and no prior fatigue.`,
          ['ATH-001', 'INT-004']);
      }
      // El TOPE de contactos se separó de la COLOCACIÓN el 2026-09-08 (auditoría R-7), y con
      // niveles distintos porque la evidencia es distinta. La colocación es INT-004 (`strong`):
      // el plyo no va después de aeróbico y va en fresco — sigue dura. El número 80 es ATH-001
      // (`moderate`) y su propio caveat dice que "la dosis baja es óptima" NO está soportado: la
      // dosis-respuesta favorece MÁS volumen, y aquí se usa dosis baja como MANTENIMIENTO de
      // potencia en déficit y por el historial lumbar. Eso es prudencia, no un muro.
      if (item.contacts != null && item.contacts > VP_MAX_PLYO_CONTACTS) {
        add('PLYO-CONTACTS', 'warn',
          `${item.id}: ${item.contacts} contacts, above the cap of ${VP_MAX_PLYO_CONTACTS} (ATH-001 says 40-80). This is caution because of the low-back history, not evidence: the ATH-001 caveat says that "the low dose is optimal" is NOT supported. If you go up, say so and go up slowly.`,
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
            `Plyometrics on ${_vpDow(dow)} right after the hard cardio on ${_vpDow(prev)}: plyo never goes after aerobic work (INT-004).`,
            ['INT-004', 'ATH-001']);
        }
      }
    }

    // ---- G-H11 · CORE-PATTERNS (ATH-003) ----
    if (Object.keys(sessions).length) {
      const core = _vpCorePatterns(sessions, c);
      if (!core.antiRotation || !core.antiExtension) {
        const falta = [!core.antiRotation ? 'anti-rotation (Pallof, suitcase carry, bird dog)' : null,
                       !core.antiExtension ? 'anti-extension (ab wheel, plank, dead bug)' : null].filter(Boolean);
        add('CORE-PATTERNS', 'hard',
          `The week does not cover ${falta.join(' or ')}. With a low-back history, anti-rotation AND anti-extension go in ALWAYS (ATH-003, \`strong\`); flexion is the optional one.`,
          ['ATH-003']);
      }
    }

    // ---- G-H12 · MIN-STRENGTH (LONG-002) ----
    if (tpl) {
      const gymDays = _vpCount(tpl, s => s.type === 'gym');
      if (gymDays < VP_MIN_STRENGTH_SESSIONS) {
        add('MIN-STRENGTH', 'hard',
          `${gymDays} strength session(s) in the week: the effective minimum is ${VP_MIN_STRENGTH_SESSIONS} (LONG-002). Below that you lose mass in a deficit.`,
          ['LONG-002', 'STR-001']);
      }
    }

    // ---- G-H15 · DECISION-EVIDENCE (ethos) ----
    for (const dec of decisions) {
      if (!dec) continue;
      const ids = Array.isArray(dec.ruleIds) ? dec.ruleIds.filter(Boolean) : [];
      const nums = (dec.evidence && dec.evidence.numbers) || dec.numbers || null;
      const hasNums = nums && typeof nums === 'object' && Object.keys(nums).length > 0;
      if (!ids.length || !hasNums) {
        add('DECISION-EVIDENCE', 'hard',
          `Decision "${_trunc(dec.what || dec.id || 'untitled', 80)}" ${!ids.length ? 'with no Rule IDs' : ''}${!ids.length && !hasNums ? ' and ' : ''}${!hasNums ? 'with no numbers in `evidence.numbers`' : ''}. Every decision traces to data and to rules, or it is not taken.`,
          ['GEN-002']);
      }
      // ---- G-S13 · CTL-FOR-STRENGTH ----
      const txt = `${dec.what || ''} ${dec.why || ''}`.toLowerCase();
      const type = String(dec.type || '');
      if (/\bctl\b|\batl\b|ramprate|ramp rate/.test(txt) && /progress|structure|deload|recovery|strength/.test(type + ' ' + txt)) {
        add('CTL-FOR-STRENGTH', 'warn',
          `Decision "${_trunc(dec.what || dec.id, 80)}" leans on ctl/atl/rampRate for a strength or deload decision. That load only sees cardio (F-3) and \`rampRate\` is not form (F-2): the strength signal is RPE, top set and session quality.`,
          ['GEN-002', 'READ-003']);
      }

      // ---- G-S19 · RECOVERY-ONLY (READ-005, READ-002) ----
      //
      // EL RESIDUO QUE ESTO CAZA (auditoría E-17). El prompt autoriza "bajar el volumen de la
      // SEMANA cuando el rendimiento lo confirme", y nada exigía la parte del rendimiento: una
      // decisión que cita sólo READ-* y quita series es dosificación por wearable con otro
      // nombre, y eso es lo que Julian retiró el 2026-09-07. READ-005 dice literalmente que
      // cuando el wearable y el rendimiento discrepan gana el rendimiento; sin un dato de
      // rendimiento citado no hay con qué discrepar.
      const onlyRead = ids.length > 0 && ids.every((r) => /^READ-/.test(String(r)));
      if (onlyRead) {
        const numKeys = hasNums ? Object.keys(nums).join(' ') : '';
        const numVals = hasNums ? Object.values(nums).map(v => String(v)).join(' ') : '';
        const lowers = /\b(baj|reduc|recort|quit|menos|drop|cut|lower|reduce|remove)/i.test(txt)
          && /\bserie|\bsets?\b|\bkg\b|\bkm\b|volumen|volume|carga|load|frecuencia|frequency/i.test(txt);
        const hasPerf = VP_PERF_RE.test(`${txt} ${numKeys} ${numVals}`);
        if (lowers && !hasPerf) {
          add('RECOVERY-ONLY', 'warn',
            `Decision "${_trunc(dec.what || dec.id, 80)}" lowers load citing ONLY recovery rules (${ids.join(', ')}) and with no performance data alongside (top set, RPE at equal load, \`readout\`, Z2 compliance). Recovery is context, not dose (READ-005): on its own it goes in the briefing and the plan is left alone.`,
            ['READ-005', 'READ-002']);
        }
      }
    }

    // ---- G-H13 · SESSION-COUNT (BUD-001) ----
    //
    // DURO desde el 2026-09-08 (auditoría E-14a). Era blando Y se saltaba entero sin
    // `ctx.variant`, así que "añade un sexto día de gimnasio" —que es exactamente lo que una
    // nota del usuario puede pedir en un buen día— no lo paraba nadie: ni el prompt, ni el
    // esquema (MAX_SESSIONS son 6), ni el validador. El tope duro es `variant + 1` (margen para
    // UN día justificado) y nunca más de 5; sin variante se usa 5, no se salta.
    if (tpl) {
      const gymDays = _vpCount(tpl, s => s.type === 'gym');
      const variant = _n(c.variant);
      const hardCap = variant != null
        ? Math.min(variant + VP_VARIANT_SLACK, VP_MAX_STRENGTH_DAYS)
        : VP_MAX_STRENGTH_DAYS;
      if (gymDays > hardCap) {
        add('SESSION-COUNT', 'hard',
          `${gymDays} strength days in the week, above the cap of ${hardCap}${variant != null ? ` (variant ${variant} + ${VP_VARIANT_SLACK}, and never more than ${VP_MAX_STRENGTH_DAYS})` : ` (with no variant in context the absolute ceiling of ${VP_MAX_STRENGTH_DAYS} applies)`}. More than ${VP_MAX_STRENGTH_DAYS} sessions/week are not programmed without justifying it (CLAUDE.md), and the calendar belongs to the user: the coach changes the content, not the number of days.`,
          ['BUD-001', 'LONG-002']);
      } else {
        const allowed = variant != null ? _vpStrengthDaysForVariant(variant) : null;
        if (allowed != null && gymDays > allowed) {
          add('SESSION-COUNT', 'warn',
            `${gymDays} gym days against the ${allowed} of variant ${variant} the user chose. The variant is THEIR calendar: the coach changes the content, not the number of days.`,
            ['BUD-001']);
        }
      }
    }

    // ---- G-S18 · FREQ-FLOOR (STR-002) ----
    //
    // Lo que ningún guardarraíl detenía: 2×/semana por patrón sin suelo (E-14d). STR-002 es
    // `strong` y era la regla fuerte más fácil de incumplir sin que nada dijera nada. Sólo en
    // variantes de ≥4 días: con 2-3 días de fuerza la frecuencia 2× es imposible y el aviso
    // sería permanente. Cuenta por FAMILIA (ver VP_PATTERN_FAMILIES): la extensión de cuádriceps
    // del jueves es la segunda exposición de rodilla de la sentadilla del lunes.
    if (Object.keys(sessions).length && (_n(c.variant) == null || _n(c.variant) >= VP_FREQ_FLOOR_MIN_VARIANT)) {
      const exp = _vpPatternExposures(sessions, tpl, c);
      for (const [fam, def] of Object.entries(VP_PATTERN_FAMILIES)) {
        const n = exp[fam] || 0;
        if (n < VP_MIN_PATTERN_EXPOSURES) {
          add('FREQ-FLOOR', 'warn',
            `${def.label}: ${n} exposure(s) in the week, below ${VP_MIN_PATTERN_EXPOSURES} (STR-002, \`strong\`: every major pattern twice a week). With ${n === 0 ? 'no' : 'a single'} exposure the pattern is not maintained, it is visited.`,
            ['STR-002', 'STR-001']);
        }
      }
    }

    // ---- G-S20 · MVPA-FLOOR (END-009) ----
    // ACSM 2024 (Jakicic): ≥150 min/semana es el suelo y 200-300 la banda de pérdida de grasa.
    // Cuenta minutos de CARDIO solamente — la fuerza también es MVPA, así que el chequeo se queda
    // corto a propósito. El arreglo son minutos FÁCILES, nunca otra sesión dura.
    const mvpa = _vpWeeklyCardioMin(p, tpl);
    if (mvpa && mvpa.slots > 0 && mvpa.min < VP_MIN_MVPA_MIN) {
      add('MVPA-FLOOR', 'warn',
        `${_vpNum(mvpa.min, 0)} min of cardio in the week, below the floor of ${VP_MIN_MVPA_MIN} (END-009, ACSM 2024 consensus: 150 is the minimum and ${VP_MVPA_FAT_LOSS_MIN}-300 the fat-loss band). It is fixed with EASY minutes and steps (REC-009), not with another hard session.`,
        ['END-009', 'LONG-001', 'REC-009']);
    }

    // ---- EA-GATE (REC-008) ----
    const ea = facts.nutrition && facts.nutrition.ea;
    if (ea && _n(ea.daysUnder30) != null && _n(ea.daysUnder30) >= 4) {
      const volUp = setsPrev ? setsNow.total > setsPrev.total : false;
      const kmUp = (kmNow != null && kmPrev != null) ? kmNow > kmPrev : false;
      if (volUp || kmUp) {
        add('EA-GATE', 'warn',
          `${ea.daysUnder30} days with EA <30 kcal/kg FFM and the plan raises ${volUp ? 'sets' : ''}${volUp && kmUp ? ' and ' : ''}${kmUp ? 'km' : ''}. With low energy availability, you eat first (REC-008).`,
          ['REC-008', 'REC-001']);
      }
    }

    // ---- G-S2 · MOBILITY-FLOOR (ATH-006) ----
    if (tpl) {
      const mob = _vpMobilitySlots(sessions, tpl);
      if (mob < VP_MIN_MOBILITY_SLOTS) {
        add('MOBILITY-FLOOR', 'warn',
          `${mob} mobility slot(s) in the week: the target is ${VP_MIN_MOBILITY_SLOTS} logged (ATH-006). The minimal version that happens beats the ideal one that does not.`,
          ['ATH-006']);
      }
    }

    // ---- G-S3 · PRESS-EXPOSURES (STR-002) ----
    const press = _vpPressExposures(sessions, tpl, c);
    if (press > VP_MAX_PRESS_EXPOSURES) {
      add('PRESS-EXPOSURES', 'warn',
        `${press} press exposures in the week (indicative cap ${VP_MAX_PRESS_EXPOSURES}). In W35 it was 5 in 10 days and the bench dropped: that was FREQUENCY, not load (STR-002).`,
        ['STR-002', 'INT-001']);
    }

    // ---- G-S4 · SESSION-LENGTH ----
    const maxMin = _n(goals && goals.constraints && goals.constraints.sessionMaxMin) || VP_MAX_SESSION_MIN;
    for (const [sid, s] of Object.entries(sessions)) {
      const est = _vpSessionMin(s);
      if (est != null && est > maxMin) {
        add('SESSION-LENGTH', 'warn',
          `${s.name || sid}: ~${Math.round(est)} min estimated, above ${maxMin}. If it regularly runs past ${maxMin}', there is too much volume.`,
          ['STR-003', 'BUD-001']);
      }
    }

    // ---- G-S5 · HYBRID-PLUS-LONG (HYB-002, END-003) ----
    const hybridDays = _vpCount(tpl || {}, s => s.type === 'run' && /hybrid|hibrido|híbrido|sled|trineo|ski/i.test(String(s.subtype || '') + String(s.label || '')));
    if (hybridDays > 0 && kmNow != null && kmPrev != null && kmNow > kmPrev) {
      add('HYBRID-PLUS-LONG', 'warn',
        `Hybrid in the week and the long run going up (${_vpNum(kmPrev, 1)} → ${_vpNum(kmNow, 1)} km): two hard stimuli at once. Never the hybrid and a growing long run in the same week.`,
        ['HYB-002', 'END-003', 'BUD-001']);
    }

    // ---- G-S7 · READINESS-N (READ-004) ----
    const rn = _n(facts.readiness && facts.readiness.score && facts.readiness.score.n7);
    if (rn != null && rn < FACTS_MIN_WELLNESS_DAYS_7) {
      add('READINESS-N', 'warn',
        `The recovery reading rests on ${rn}/7 wellness days (gate ${FACTS_MIN_WELLNESS_DAYS_7}): with fewer days the 7d vs 28d trend is not a trend (READ-004).`,
        ['READ-004', 'READ-001']);
    }

    // ---- G-S8 · WEIGHT-WINDOW (REC-002) ----
    const win = facts.progress && facts.progress.weight && facts.progress.weight.validWindow;
    if (win && win.ok === false && _vpTouchesKcal(decisions, p)) {
      add('WEIGHT-WINDOW', 'warn',
        `Intake is being touched with an invalid weight window: ${(win.reasons || []).join('; ')}. The slope of that window is not signal (REC-002).`,
        ['REC-002', 'REC-008']);
    }

    // ---- G-S9 · HARD-BUDGET (BUD-001) ----
    const budget = _vpBudget(p, tpl, c);
    if (budget != null && budget > VP_MAX_BUDGET) {
      add('HARD-BUDGET', 'warn',
        `Hard-day budget for the week: ${_vpNum(budget, 1)} against an indicative cap of ${VP_MAX_BUDGET} (BUD-001 is informative, not a hard rule).`,
        ['BUD-001', 'BUD-002']);
    }

    // ---- G-S10 · SUMMER-PACE (ENV-001) ----
    //
    // F-26: manda la temperatura MEDIDA de las últimas 4 semanas (`cardio.tempC28d`, de
    // `average_temp` de intervals.icu) y el mes es sólo el respaldo para cuando no hay ninguna.
    // El umbral son 22 °C de media, que es donde la deriva cardiovascular empieza a mover el
    // ritmo a FC fija de forma visible; por encima de 28 °C de máximo basta una sola sesión
    // caliente para que leer el progreso por ritmo engañe.
    const month = String(c.todayStr || (facts.meta && facts.meta.todayStr) || '').slice(5, 7);
    const t28 = (facts.cardio && facts.cardio.tempC28d) || null;
    const calorMedido = t28 && t28.n > 0
      ? ((_n(t28.meanC) != null && _n(t28.meanC) >= VP_HEAT_MEAN_C) || (_n(t28.maxC) != null && _n(t28.maxC) >= VP_HEAT_MAX_C))
      : null;
    const hacecalor = calorMedido != null ? calorMedido : !!VP_SUMMER_MONTHS[month];
    if (hacecalor && _vpMentionsPaceProgress(decisions, briefing)) {
      const porQue = calorMedido
        ? `the last 4 weeks of sessions average ${_vpNum(t28.meanC, 1)} °C (peak ${_vpNum(t28.maxC, 0)} °C)`
        : `it is month ${month} and no session carries a temperature`;
      add('SUMMER-PACE', 'warn',
        `Aerobic progress is being read by PACE while it is hot: ${porQue}. In the heat, pace at fixed HR gets worse without fitness changing (ENV-001). Measure by HR and by duration.`,
        ['ENV-001', 'END-002']);
    }

    // ---- G-S11 · Z2-CEILING ----
    const zones = c.zones || (facts.cardio && facts.cardio.z2Ceiling) || null;
    const planCeil = _vpPlanZ2Ceiling(p);
    const zoneCeil = _n(zones && (zones.bpm != null ? zones.bpm : (zones.z && zones.z.zone2 && zones.z.zone2[1])));
    if (planCeil != null && zoneCeil != null && planCeil !== zoneCeil) {
      add('Z2-CEILING', 'warn',
        `The plan uses a Z2 ceiling of ${_vpNum(planCeil, 0)} bpm and the zones say ${_vpNum(zoneCeil, 0)} bpm. Two ceilings for the same zone is how the app and the watch end up disagreeing.`,
        ['END-001', 'END-002']);
    }

    // ---- G-S12 · CHURN / ROTATION (GEN-001, STR-010) ----
    const priorities = (briefing && Array.isArray(briefing.priorities)) ? briefing.priorities.length : null;
    if (priorities != null && priorities > 3) {
      add('CHURN', 'warn',
        `${priorities} priorities in the briefing: the cap is 3. More than three priorities are not priorities.`,
        ['GEN-001']);
    }
    // ---- G-S14 · WEEK-SUMMARY (GEN-001) — v11.65 ----
    //
    // El contrato v2 obliga a UNA FILA POR CADA SESIÓN del plan, también las que no cambian:
    // la Home tiene que poder decir "por qué sigue igual", y una sesión sin fila es
    // exactamente el hueco por el que vuelve la rutina que cambia sin motivo.
    //
    // BLANDO Y SÓLO CON `coachBrief`: un plan de la semilla o del usuario no tiene por qué
    // llevar resumen, y avisar ahí sería ruido en cada `setIdealVariant`.
    const cb = p.coachBrief || c.coachBrief || null;
    if (cb) {
      const filas = Array.isArray(cb.weekSummary) ? cb.weekSummary : [];
      const cubiertas = _vpSet(filas.map((r) => (r && r.sessionId) || null).filter(Boolean));
      for (const [sid, s] of Object.entries(sessions)) {
        if (cubiertas && cubiertas.has(sid)) continue;
        add('WEEK-SUMMARY', 'warn',
          `${(s && s.name) || sid}: no row in the week summary. Every session carries its reason, including the ones that hold.`,
          ['GEN-001']);
      }
    }

    // Los cambios se cuentan sobre el DIFF REAL contra el plan anterior, no sobre el `changes[]`
    // que el coach se autodeclara (auditoría E-14e): una propuesta que reescribe media semana y
    // no rellena `changes[]` no se auditaba en absoluto, que es el único caso en que este aviso
    // hace falta. `changes[]` sigue siendo el respaldo cuando no hay `basedOn` con el que
    // comparar (un plan de la semilla, un `setIdealVariant`).
    const changes = _vpStructuralChanges(sessions);
    const diffed = c.basedOn && typeof diffPlanVersions === 'function'
      ? (function () {
        try { return diffPlanVersions(c.basedOn, p); } catch (e) { return null; }
      }())
      : null;
    let total = changes.total, swaps = changes.swaps, fuente = '`changes[]` as declared by the coach';
    if (diffed) {
      total = _n(diffed.structural) || 0;
      swaps = 0;
      for (const s of Object.values(diffed.sessions || {})) {
        swaps += (s.added || []).length + (s.removed || []).length
          + (s.sessionAdded ? 1 : 0) + (s.sessionRemoved ? 1 : 0);
      }
      fuente = 'the diff against the active plan';
    }
    if (total > VP_MAX_STRUCTURAL_CHANGES) {
      add('CHURN', 'warn',
        `${total} structural changes in one week according to ${fuente} (indicative cap ${VP_MAX_STRUCTURAL_CHANGES}): with that much moving at once there is no telling what worked.`,
        ['GEN-001', 'STR-010']);
    }
    const blockIndex = _n((c.block && c.block.index) != null ? c.block.index : (p.block && p.block.weekIndex));
    if (swaps > 0 && blockIndex != null && blockIndex !== 1) {
      add('ROTATION', 'warn',
        `${swaps} exercise change(s) in week ${blockIndex} of the block: accessories rotate in week 1, with a reason (STR-010, \`expert\`: practice, not strong evidence).`,
        ['STR-010', 'SEL-002']);
    }
  } catch (e) {
    // Un validador que lanza convierte "aplicar el plan" en un error de JavaScript. Se avisa
    // del fallo como un aviso más y se devuelve lo que se pudo comprobar.
    out.push({ id: 'VALIDATOR-ERROR', level: 'warn', text: `The validator failed halfway through (${e && e.message ? e.message : e}): the warnings below may be incomplete.`, ruleIds: [] });
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

const _VP_DOW_LABEL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function _vpDow(dow) { return _VP_DOW_LABEL[((_n(dow) || 0) % 7 + 7) % 7]; }

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
      const m = _vpVolumeMuscle(ex.id, ex.muscle);
      byMuscle[m] = (byMuscle[m] || 0) + n;
      total += n;
    }
  }
  return { byMuscle, total, occurrences };
}

/**
 * Series EFECTIVAS por músculo: directas (1,0 al primario) + fraccionadas (0,5 a cada secundario
 * del patrón). Ver `VP_PATTERN_SECONDARIES` para el mapa y su justificación patrón a patrón.
 *
 * Misma firma que `_vpSetsPerMuscle` **a propósito**: dos argumentos, sin `ctx`. El patrón sale
 * del propio ejercicio (`movementPattern`, que `mergeProposal` hereda del plan base) y, si no lo
 * trae, de `VP_PATTERN_IDS` — que es el fallback que ya usa el resto del validador. Pasarle la
 * librería aquí haría que la app contase una cosa y la edge function (que no la recibe) otra, y
 * dos contadores de volumen distintos en el mismo repo es exactamente el fallo de L-1: la app
 * leía 16 series donde el validador leía 13. Un solo número, en los dos lados.
 *
 * `Power` no acredita secundarios: no es volumen de hipertrofia.
 *
 * @returns {{byMuscle: object, families: object, total: number}} en series efectivas, a 0,5
 */
function _vpEffectiveSetsPerMuscle(sessions, tpl) {
  const direct = _vpSetsPerMuscle(sessions, tpl);
  const occurrences = direct.occurrences;
  const byMuscle = {};
  const bump = (m, n) => { if (m && n) byMuscle[m] = (byMuscle[m] || 0) + n; };
  for (const [sid, s] of Object.entries(sessions || {})) {
    const times = tpl ? (occurrences[sid] || 0) : 1;
    if (!times) continue;
    for (const ex of (s.exercises || [])) {
      if (!ex) continue;
      const n = (_n(ex.sets) || 0) * times;
      if (!n) continue;
      const primary = _vpVolumeMuscle(ex.id, ex.muscle);
      bump(primary, n);
      if (primary === VP_POWER_MUSCLE) continue;
      if (VP_NO_SECONDARY_IDS[String(ex.id || '')]) continue;
      const pattern = ex.movementPattern || VP_PATTERN_IDS[String(ex.id || '')] || null;
      if (!pattern) continue;
      for (const sec of _vpSecondariesFor(pattern, primary)) bump(sec, n * VP_SECONDARY_CREDIT);
    }
  }
  let total = 0;
  for (const m of Object.keys(byMuscle)) { byMuscle[m] = _vpHalf(byMuscle[m]); total += byMuscle[m]; }
  const families = _vpMuscleFamilies(byMuscle);
  for (const f of Object.keys(families)) families[f] = _vpHalf(families[f]);
  return { byMuscle, families, total: _vpHalf(total) };
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

/**
 * ¿Este slot es cardio DURO?
 *
 * Tres formas de serlo, y las dos últimas se añadieron el 2026-09-08 (auditoría E-14b) porque
 * `HARD-CARDIO` y `RUN-BEFORE-LEGS` sólo miraban el subtipo y se les colaba lo más caro:
 *   1. **Subtipo** `threshold` / `intervals`, o etiqueta de híbrido/trineo/benchmark.
 *   2. **Distancia ≥10 km**, aunque el subtipo diga `long_easy`. Un largo de 12 km delante de un
 *      día de pierna cuesta lo que cuesta por la distancia, no por la etiqueta. 10 km es el
 *      objetivo del bloque (docs/goals.md), así que "el largo del hito" no puede ser gratis.
 *   3. **El día declarado en `running.hardSessions`**, cuando ése viaja como array de
 *      `{day|dow}`. En el esquema del coach `hardSessions` es un número (0|1) y entonces no
 *      identifica un día; eso lo cuenta `_vpHardCardio`.
 */
function _vpSlotIsHardCardio(slot) {
  if (!slot) return false;
  if (slot.type !== 'run' && slot.type !== 'hybrid') return false;
  const sub = String((slot.cardio && slot.cardio.subtype) || slot.subtype || '');
  if (VP_HARD_SUBTYPES[sub]) return true;
  const km = _n((slot.cardio && slot.cardio.distanceKm) != null ? slot.cardio.distanceKm : slot.distanceKm);
  if (km != null && km >= VP_LONG_RUN_HARD_KM) return true;
  return /hybrid|hibrido|híbrido|sled|trineo|benchmark/i.test(String(slot.label || '') + ' ' + sub);
}

/** Los días que `running.hardSessions` marca como duros, cuando viaja como array de objetos. */
function _vpHardSessionDays(plan) {
  const hs = plan && plan.running && plan.running.hardSessions;
  if (!Array.isArray(hs)) return [];
  const out = [];
  for (const h of hs) {
    const dow = _n(h && (h.day != null ? h.day : h.dow));
    if (dow != null && dow >= 0 && dow <= 6) out.push(dow);
  }
  return [...new Set(out)];
}

function _vpHardCardio(plan, tpl) {
  const labels = [];
  const days = new Set(_vpHardSessionDays(plan));
  if (tpl) {
    for (let dow = 0; dow <= 6; dow++) {
      const s = tpl[dow] || tpl[String(dow)];
      if (_vpSlotIsHardCardio(s)) {
        labels.push(`${_vpDow(dow)} ${(s.cardio && s.cardio.subtype) || s.subtype || s.label || 'hard'}`);
        days.delete(dow);
      }
    }
  }
  // Un día declarado en `running.hardSessions[]` que la plantilla no refleja cuenta igual: la
  // sesión existe aunque el template no la haya recibido todavía.
  for (const dow of days) labels.push(`${_vpDow(dow)} declared in \`running.hardSessions\``);
  const declared = Array.isArray(plan && plan.running && plan.running.hardSessions)
    ? null : _n(plan && plan.running && plan.running.hardSessions);
  const count = labels.length || (declared != null ? declared : 0);
  if (!labels.length && declared) labels.push(`${declared} declared in \`running.hardSessions\``);
  return { count, labels };
}

/** Minutos de CARDIO de la semana: el slot de cardio más los finishers de Z2 de los días de gym. */
function _vpWeeklyCardioMin(plan, tpl) {
  if (!tpl) return null;
  let min = 0, n = 0;
  for (let dow = 0; dow <= 6; dow++) {
    const s = tpl[dow] || tpl[String(dow)];
    if (!s) continue;
    const cardio = _n(s.cardio && s.cardio.durationMin);
    const own = (s.type === 'run' || s.type === 'hybrid') ? _n(s.durationMin) : null;
    const fin = _n(s.z2FinisherMin);
    const d = (cardio != null ? cardio : (own || 0)) + (fin || 0);
    if (d > 0) { min += d; n++; }
  }
  return { min, slots: n };
}

/**
 * Exposiciones semanales por familia de patrón mayor (STR-002).
 *
 * Se cuenta por DÍA, no por serie: una sesión que aparece dos veces en la plantilla son dos
 * exposiciones, y dos ejercicios de la misma familia dentro de la misma sesión son UNA (la
 * frecuencia es la separación en el tiempo, que es de lo que habla la regla).
 */
function _vpPatternExposures(sessions, tpl, ctx) {
  const lib = (ctx && ctx.exerciseLibrary) || null;
  const patternOf = (id) => (lib && lib[id] && lib[id].movementPattern) || VP_PATTERN_IDS[id] || null;
  const familiesOf = (s) => {
    const fams = new Set();
    for (const ex of ((s && s.exercises) || [])) {
      const pat = ex && ex.id ? patternOf(ex.id) : null;
      if (!pat) continue;
      for (const [fam, def] of Object.entries(VP_PATTERN_FAMILIES)) if (def.patterns[pat]) fams.add(fam);
    }
    return fams;
  };
  const bySession = {};
  for (const [sid, s] of Object.entries(sessions || {})) bySession[sid] = familiesOf(s);
  const out = {};
  for (const fam of Object.keys(VP_PATTERN_FAMILIES)) out[fam] = 0;
  if (!tpl) {
    for (const fams of Object.values(bySession)) for (const fam of fams) out[fam]++;
    return out;
  }
  for (let dow = 0; dow <= 6; dow++) {
    const s = tpl[dow] || tpl[String(dow)];
    if (!s || s.type !== 'gym' || !s.session) continue;
    for (const fam of (bySession[s.session] || [])) out[fam]++;
  }
  return out;
}

/**
 * ¿Va el cardio ANTES de levantar en un día que lleva las dos cosas? (INT-003)
 *
 * Sólo con una señal POSITIVA de orden. Un día de gimnasio con un finisher de Z2 es lo normal y
 * el finisher es, por definición, después; avisar por la mera coexistencia convertiría el aviso
 * en ruido en las 4-5 sesiones de cada semana. Así que se busca lo declarado: `cardioFirst`,
 * `order: 'before'`, o el texto de la nota diciéndolo.
 */
function _vpCardioBeforeLift(tpl, sessions) {
  const out = [];
  if (!tpl) return out;
  for (let dow = 0; dow <= 6; dow++) {
    const s = tpl[dow] || tpl[String(dow)];
    if (!s || s.type !== 'gym' || !s.session) continue;
    const c = s.cardio || null;
    const hasCardio = !!c || _n(s.z2FinisherMin) != null;
    if (!hasCardio) continue;
    // Marcado como finisher → va después, y no hay nada que avisar.
    if (_n(s.z2FinisherMin) != null && !c) continue;
    const order = String((c && (c.order || c.when || c.position)) || s.cardioOrder || '').toLowerCase();
    const note = String((c && c.note) || '');
    const first = (c && (c.first === true || c.beforeLift === true)) || s.cardioFirst === true
      || /^(before|pre|first|antes|primero)/.test(order)
      || /(antes de (levantar|las? (pesas|sesión|serie)|entrenar)|before (the )?(lift|lifting|weights|session)|cardio (primero|first))/i.test(note);
    if (first) out.push({ dow, session: s.session, name: (sessions && sessions[s.session] && sessions[s.session].name) || s.session });
  }
  return out;
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

  // Los campos de LIBRERÍA de un ejercicio (`muscle`, `name`, `db`, `bw`, `measure`,
  // `movementPattern`) no viajan en el contrato de salida: el coach devuelve id, series, reps, RPE y
  // objetivo. Sin heredarlos del plan base, una sesión propuesta llegaba al validador con todos sus
  // ejercicios sin `muscle` y VOL-CAP los contaba como "otros" (19 series → duro falso), mientras el
  // recuento real por músculo quedaba corto (2026-09-09, primera revisión manual). El ejercicio del
  // mismo id se busca primero en la misma sesión y después en cualquier sesión del plan; lo que la
  // propuesta trae explícito (p. ej. un `muscle` re-etiquetado) gana.
  const LIB_FIELDS = ['muscle', 'name', 'db', 'bw', 'measure', 'movementPattern'];
  const baseExById = {};
  for (const s of Object.values(base.sessions || {})) {
    for (const ex of (s && s.exercises) || []) if (ex && ex.id && !baseExById[ex.id]) baseExById[ex.id] = ex;
  }
  const inherit = (ex, prevSession) => {
    if (!ex || !ex.id) return ex;
    const same = ((prevSession && prevSession.exercises) || []).find(e => e && e.id === ex.id) || baseExById[ex.id];
    if (!same) return ex;
    const out = Object.assign({}, ex);
    for (const k of LIB_FIELDS) if (out[k] == null && same[k] != null) out[k] = same[k];
    return out;
  };

  const touched = [];
  const stripped = [];
  for (const ps of (prop.sessions || [])) {
    if (!ps || !ps.id) continue;
    const prev = (base.sessions || {})[ps.id] || {};
    const merged = Object.assign({}, prev, ps);
    if (Object.prototype.hasOwnProperty.call(merged, 'warmup')) { delete merged.warmup; stripped.push(ps.id); }
    merged.id = ps.id;
    if (!merged.name) merged.name = prev.name || ps.id;
    if (Array.isArray(ps.exercises)) merged.exercises = ps.exercises.map(ex => inherit(ex, prev));
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
    FACTS_FULL_REVIEWS,
    FACTS_MAX_DECISIONS, FACTS_Z2_CEILING_DEFAULT, FACTS_Z2_TOLERANCE, FACTS_STALE_DAYS,
    FACTS_MIN_WORKOUTS, FACTS_MIN_WELLNESS_DAYS_7, FACTS_MIN_NUTRITION_DAYS_28,
    FACTS_MIN_NUTRITION_DAYS_14, FACTS_MIN_MEASURED_WEIGHTS, FACTS_DELOAD_WASHOUT_DAYS,
    FACTS_TREND_PCT, FACTS_GREEN, FACTS_YELLOW, FACTS_PRESS_IDS, FACTS_CARDIO_BW,
    FACTS_TRAJ_WEEKS, FACTS_TRAJ_Z2_WEEKS, FACTS_TRAJ_FOLLOWUP, FACTS_TRAJ_MIN_WEEKS,
    FACTS_TRAJ_MIN_SLOPE_POINTS, FACTS_TRAJ_SKIP_WINDOW, FACTS_TRAJ_SKIP_MIN,
    FACTS_BLOCK_WEEKS_DEFAULT, FACTS_MVPA_BAND, FACTS_MVPA_FLOOR_MIN,
    VP_FLOORS, VP_MAX_SETS_PER_MUSCLE, VP_MAX_HARD_CARDIO, VP_MAX_BUDGET,
    VP_MAX_PRESS_EXPOSURES, VP_MAX_SESSION_MIN, VP_MAX_PLYO_CONTACTS,
    VP_MAX_STRUCTURAL_CHANGES, VP_MIN_STRENGTH_SESSIONS, VP_MIN_MOBILITY_SLOTS,
    VP_DELOAD_VOLUME_FACTOR, VP_KM_HARD_FACTOR, VP_KM_SOFT_FACTOR, VP_REENTRY_KM_CAP,
    VP_REENTRY_DAYS, VP_LOAD_JUMP_PCT, VP_LOAD_DROP_PCT, VP_TARGET_STALE_DAYS,
    VP_ANCHOR_SWAPS, VP_ANCHORS,
    // v11.67 / fn v4 (auditoría 2026-09-08): los umbrales de los 6 ids nuevos
    VP_MAX_STRENGTH_DAYS, VP_VARIANT_SLACK, VP_LONG_RUN_HARD_KM, VP_MIN_MVPA_MIN,
    VP_MVPA_FAT_LOSS_MIN, VP_KCAL_STEP_MAX, VP_KCAL_ADJUST_DAYS, VP_MIN_PATTERN_EXPOSURES,
    VP_FREQ_FLOOR_MIN_VARIANT, VP_MIN_GYM_DAYS_FOR_FLOOR, VP_HEAT_MEAN_C, VP_HEAT_MAX_C, VP_PATTERN_FAMILIES, VP_PATTERN_IDS,
    // v11.71 / auditoría 2026-09-09: los umbrales de los 2 ids nuevos (F-5, F-7)
    VP_MIN_SETS_PER_MUSCLE, VP_POSTERIOR_FAMILY, VP_VOLUME_FAMILY_MERGE, VP_VOLUME_NO_FLOOR,
    VP_RECOMP_FAT_DROP_KG, VP_RECOMP_FFM_HOLD_KG, VP_RECOMP_MIN_SPAN_DAYS,
    // v11.71 · series efectivas (crédito fraccionado por patrón)
    VP_SECONDARY_CREDIT, VP_PATTERN_SECONDARIES, VP_NO_SECONDARY_IDS, VP_ERECTORS_MUSCLE,
    // Internos que los tests usan para no re-implementar aritmética
    _cfShift, _cfDiff, _cfIsoWeek, _cfMonday, _durMin, _paceSec, _fmtPace,
    _slopePerWeek, _liftTrend, _z2Compliant, _sanitize, _weeksSpan, _weightDays,
    _vpSetsPerMuscle, _vpEffectiveSetsPerMuscle, _vpSecondariesFor, _vpHingePartner,
    _vpMuscleFamily, _vpMuscleFamilies, _vpFamilyHasFloor,
    _vpSessionMin, _vpPlyoExercises, _vpMobilitySlots, _vpHardCardio,
    _vpPatternExposures, _vpWeeklyCardioMin, _vpCardioBeforeLift, _vpHardSessionDays,
    _vpSlotIsHardCardio,
  };
}
