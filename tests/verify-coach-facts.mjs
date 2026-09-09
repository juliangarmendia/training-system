// El facts pack: los hechos que el coach LLM NO tiene que calcular.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. El playbook actual del cron le da al modelo
// filas crudas y le pide aritmética, y el audit del 2026-09-05 midió el resultado: confunde
// `rampRate` con la forma (F-2), trata una carga que sólo ve el cardio como carga total (F-3),
// lee `runs` sin dedupear (F-10) y juzga la disponibilidad energética a media mañana (F-12).
// Este pack existe para que ninguna de esas cuentas la haga el modelo. Cada una de las de
// abajo es un número que, mal calculado, llega al plan de la semana:
//
//   · Mezclar lb y kg: un 205 lb de banca al lado de un 95 kg parece una caída del 54 %.
//     Todos los pesos pasan por `convertWeight(w, workout.unit, 'kg')`, siempre.
//   · Contar dos veces la misma carrera de COROS (llega por Strava y por intervals.icu): los
//     km semanales y la rampa se duplican en silencio. Entra `dedupeRuns`, siempre.
//   · Meter el peso FORWARD-FILLED de intervals.icu en la pendiente: los días que no te pesas
//     el valor suavizado es una línea recta, así que la pendiente se aplana y el piloto del
//     déficit recorta calorías por un artefacto.
//   · `form ≠ ctl − atl`: el campo que el cron leía nunca podía disparar sus umbrales.
//   · EA del día en curso: a las 9:00 sale "crítico" todos los días y la alarma real deja de
//     significar nada. Sólo días CERRADOS.
//   · Perder la frontera domingo/lunes: la carrera del domingo cae en la semana siguiente y
//     el cumplimiento de la semana se calcula sobre la semana equivocada.
//   · Callar los huecos: con 12 días de nutrición registrada el modelo NO puede inferir
//     ingesta, y el pack tiene que decírselo con esas palabras.
//   · `factsHash` inestable: dos packs con los mismos hechos, dos hashes, y cada apertura de
//     la app paga otra revisión de $0,50-0,70.
//   · `undefined`/`NaN` en el JSON: `JSON.stringify` los convierte en `null` sin avisar y el
//     modelo los cita como si fueran hechos.
//   · Mirar sólo 4 semanas (esquema 2 · `trajectory`): sin el recorrido, un ancla que lleva
//     dos meses sin tocarse parece mantenida, una sesión que se salta desde julio parece
//     nueva, y el progreso hacia el objetivo (−1,2 kg desde 87,1) no existe. Y el mismo
//     filtro de siempre: si el forward-fill entrase en `deltaKg`, el recorrido se reduciría
//     a la mitad.
//
// Ejecutar desde la raíz del repo: node tests/verify-coach-facts.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Mismo patrón que verify-set-target: los dos ficheros enteros en el MISMO contexto `vm`, para
// que `coach-facts.js` vea `isoWeekKey`/`mondayOf`/`blockWeekFromDates` como globales igual que
// las ve en el navegador (index.html carga coach-engine.js antes).
const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const FACTS = readFileSync('app/coach-facts.js', 'utf8');
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
const ENGINE_EXPORTS = sandbox.module.exports;
sandbox.module = { exports: {} };
sandbox.exports = sandbox.module.exports;
new vm.Script(FACTS).runInContext(sandbox);
const F = sandbox.module.exports;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

if (typeof F.buildCoachFacts !== 'function') {
  console.log('FAIL — coach-facts.js no exporta buildCoachFacts');
  process.exit(1);
}
ok(typeof ENGINE_EXPORTS.isoWeekKey === 'function', 'coach-engine.js expone isoWeekKey (dependencia del pack)');

const { buildCoachFacts, stableStringify } = F;

// ════════════════════════════════════════════════════════════════════════════════════
// DEPS — las implementaciones reales de app.js, copiadas tal cual. Son el contrato: si
// cambian allí y no aquí, el test deja de describir lo que corre en el teléfono.
// ════════════════════════════════════════════════════════════════════════════════════

function convertWeight(value, fromUnit, toUnit) {
  if (!value || !fromUnit || fromUnit === toUnit) return value;
  if (fromUnit === 'lb' && toUnit === 'kg') return +(value * 0.453592).toFixed(2);
  if (fromUnit === 'kg' && toUnit === 'lb') return +(value * 2.20462).toFixed(2);
  return value;
}
function estimate1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}
const MEASURE = { 'box-jump': 'cm' };
const measureUnitFor = (id) => MEASURE[id] || null;

// Dedupe simple para el test: misma fecha + misma duración = la misma actividad; gana
// intervals.icu sobre strava sobre manual (misma preferencia que `dedupeRuns` en app.js).
function dedupeRuns(runs) {
  const rank = (r) => ({ 'intervals.icu': 3, strava: 2 })[r && r.source] || 1;
  const kept = [];
  for (const r of (runs || [])) {
    const i = kept.findIndex(k => k.date === r.date && Number(k.duration) === Number(r.duration));
    if (i === -1) { kept.push(r); continue; }
    if (rank(r) > rank(kept[i])) kept[i] = r;
  }
  return kept;
}
function dedupeSessions(sessions) {
  const kept = [];
  for (const s of (sessions || [])) {
    if (kept.some(k => k.date === s.date && Number(k.durationMin) === Number(s.durationMin) && k.modality === s.modality)) continue;
    kept.push(s);
  }
  return kept;
}
const DEPS = { convertWeight, estimate1RM, measureUnitFor, dedupeRuns, dedupeSessions, z2Ceiling: 143 };

// ════════════════════════════════════════════════════════════════════════════════════
// FIXTURE — hoy es lunes 2026-09-07 (2026-W37). Ventana: W34 · W35 · W36 · W37.
// ════════════════════════════════════════════════════════════════════════════════════

const HOY = '2026-09-07';
const SEMANA = '2026-W37';

const S = (kg, reps, rpe, n) => Array.from({ length: n }, () => ({ weight: kg, reps, rpe, done: true }));
const SKIP = (n) => Array.from({ length: n }, () => ({ weight: 0, reps: 0, rpe: null, done: false }));

const WORKOUTS = [
  // ── El RECORRIDO (esquema 2). Dos sesiones muy anteriores al ancla (2026-09-07), fuera de
  // las ventanas de 4 semanas y de 55 días: no tocan `lifts` ni `adherence`, y son las que
  // dan a `trajectory` un `pre-bloque` y un `first` de cada ancla en LIBRAS.
  {
    id: 'w0a', date: '2026-06-29', session: 'upperA', sessionName: 'Upper A', unit: 'lb',
    planVersion: 12, duration: '61:00', family: 'strength', subtype: 'upper', budgetWeight: 1,
    exercises: [
      { exerciseId: 'bench-press', sets: [{ weight: 185, reps: 5, rpe: 8, done: true }, { weight: 185, reps: 5, rpe: 8, done: true }] },
      { exerciseId: 'barbell-row', sets: S(135, 8, 7, 3) },
    ],
  },
  {
    id: 'w0b', date: '2026-07-06', session: 'lowerA', sessionName: 'Lower A', unit: 'kg',
    planVersion: 12, duration: '58:00', family: 'strength', subtype: 'lower', budgetWeight: 2,
    exercises: [
      { exerciseId: 'back-squat', sets: S(95, 5, 8, 4) },
    ],
  },
  // W35 · 3 días con EMPUJE en 6 días: el patrón de W35 (frecuencia, no carga).
  {
    id: 'w1', date: '2026-08-25', session: 'upperA', sessionName: 'Upper A', unit: 'lb',
    planVersion: 19, duration: '68:00', family: 'strength', subtype: 'upper', budgetWeight: 1,
    exercises: [
      { exerciseId: 'bench-press', sets: [{ weight: 205, reps: 5, rpe: 8, done: true }, { weight: 205, reps: 5, rpe: 8, done: true }] },
      { exerciseId: 'barbell-row', sets: S(155, 8, 7, 3) },
    ],
  },
  {
    id: 'w2', date: '2026-08-27', session: 'upperA', sessionName: 'Upper A', unit: 'kg',
    planVersion: 21, duration: '70:00', family: 'strength', subtype: 'upper', budgetWeight: 1,
    exercises: [
      { exerciseId: 'bench-press', sets: S(92.5, 8, 7.5, 3) },
      { exerciseId: 'barbell-row', sets: S(70, 10, 7, 3) },
      { exerciseId: 'face-pull', sets: SKIP(3) },
    ],
  },
  {
    id: 'w3', date: '2026-08-29', session: 'upperB', sessionName: 'Upper B', unit: 'kg',
    planVersion: 21, duration: '62:00', family: 'strength', subtype: 'upper', budgetWeight: 1,
    exercises: [
      { exerciseId: 'ohp', sets: S(55, 8, 8, 4) },
      { exerciseId: 'chinups', sets: S(2.5, 6, 8, 3), bw: true },
      { exerciseId: 'ab-wheel', sets: S(0, 10, null, 3), bw: true },
    ],
  },
  // W36
  {
    id: 'w4', date: '2026-09-01', session: 'upperA', sessionName: 'Upper A', unit: 'kg',
    planVersion: 21, duration: '74:21', family: 'strength', subtype: 'upper', budgetWeight: 1,
    quick: false,
    exercises: [
      {
        exerciseId: 'bench-press', sets: S(95, 6, 8, 3),
        target: { kg: 95, reps: '5-8', rpe: '7-8', source: 'rule', reason: 'Todas al tope y RPE ≤8: +2,5 kg' },
      },
      { exerciseId: 'barbell-row', sets: S(72.5, 10, 7, 3) },
      { exerciseId: 'face-pull', sets: SKIP(3) },
    ],
    readout: {
      line: 'Banca 95×6/6/6 · remo 72,5 subió',
      summary: '2 progresaron, 1 saltado',
      items: [{ exerciseId: 'bench-press', outcome: 'progressed', target: { kg: 95, source: 'rule' }, done: { topKg: 95, reps: [6, 6, 6], avgRpe: 8 }, next: { kg: 97.5 } }],
    },
  },
  {
    id: 'w5', date: '2026-09-03', session: 'lowerA', sessionName: 'Lower A', unit: 'kg',
    planVersion: 21, duration: '66:00', family: 'strength', subtype: 'lower', budgetWeight: 2,
    exercises: [
      { exerciseId: 'box-jump', sets: S(50, 5, null, 3) },
      { exerciseId: 'back-squat', sets: S(105, 5, 8, 4) },
    ],
  },
  // W37 · hoy
  {
    id: 'w6', date: '2026-09-07', session: 'lowerA', sessionName: 'Lower A', unit: 'kg',
    planVersion: 21, duration: '64:00', family: 'strength', subtype: 'lower', budgetWeight: 2,
    exercises: [
      { exerciseId: 'box-jump', sets: S(55, 5, null, 3) },
      { exerciseId: 'back-squat', sets: S(105, 8, 8, 4) },
    ],
  },
];

const RUNS = [
  // La MISMA carrera de COROS por dos caminos. `dedupeRuns` tiene que dejar una.
  { id: 'icu_1', date: '2026-09-06', distance: 6.0, duration: 40, avgHR: 141, maxHR: 152, avgPace: '6:40', source: 'intervals.icu', sport: 'Run', hrZoneTimes: [600, 1500, 300, 0, 0], decoupling: null },
  { id: 'strava_1', date: '2026-09-06', distance: 6.02, duration: 40, avgHR: 141, maxHR: 152, avgPace: '6:39', source: 'strava', sport: 'Run', hrZoneTimes: null, decoupling: null },
  { id: 'icu_2', date: '2026-09-02', distance: 5.0, duration: 35, avgHR: 145, avgPace: '7:00', source: 'intervals.icu', sport: 'Run', hrZoneTimes: null, decoupling: null },
  { id: 'icu_3', date: '2026-08-29', distance: 5.0, duration: 36, avgHR: 146, avgPace: '7:12', source: 'intervals.icu', sport: 'Run', hrZoneTimes: null, decoupling: null },
  { id: 'man_1', date: '2026-08-22', distance: 4.5, duration: 33, avgHR: 140, avgPace: '7:20', source: 'manual', sport: 'Run', hrZoneTimes: null, decoupling: null },
];

const SESSIONS = [
  { id: 's1', date: '2026-09-07', family: 'cardio', subtype: 'zone2', modality: 'bike', durationMin: 20, budgetWeight: 0.5, origin: 'z2_finisher', source: 'manual' },
  { id: 's2', date: '2026-09-01', family: 'cardio', subtype: 'zone2', modality: 'treadmill', durationMin: 20, budgetWeight: 0.5, origin: 'z2_finisher', source: 'manual' },
];

// 30 filas de wellness (2026-08-09 → 2026-09-07). NUNCA viajan crudas al pack.
const READINESS_7 = { '2026-09-07': 70, '2026-09-06': 68, '2026-09-05': 55, '2026-09-04': 30, '2026-09-03': 72, '2026-09-02': 66, '2026-09-01': 40 };
const SLEEP_7 = { '2026-09-04': 17000, '2026-09-01': 22000 };
const WELLNESS = [];
for (let i = 0; i < 30; i++) {
  const t = Date.UTC(2026, 8, 7) - i * 86400000;
  const date = new Date(t).toISOString().slice(0, 10);
  WELLNESS.push({
    date,
    readiness: READINESS_7[date] != null ? READINESS_7[date] : 60,
    hrv: 62, restingHR: 47,
    sleepSecs: SLEEP_7[date] != null ? SLEEP_7[date] : 26000,
    sleepScore: 80,
    weight: 90.0,                 // ← forward-fill de intervals.icu: NO es una pesada
    weightMeasured: null,
    steps: 8200,
    ctl: i === 0 ? 3.2 : 3.0, atl: i === 0 ? 5.1 : 4.0, rampRate: -0.21,
  });
}

const BODYWEIGHT = [
  { date: '2026-08-26', weight: 86.8, measured: true, source: 'intervals.icu' },
  { date: '2026-08-29', weight: 86.5, measured: true, source: 'intervals.icu' },
  { date: '2026-08-31', weight: 90.0, measured: false, source: 'intervals.icu' }, // ← forward-fill
  { date: '2026-09-01', weight: 86.2, measured: true, source: 'intervals.icu' },
  { date: '2026-09-02', weight: 90.0, measured: false, source: 'intervals.icu' }, // ← forward-fill
  { date: '2026-09-03', weight: 86.0, measured: true, source: 'intervals.icu', waist: 96.0 },
  { date: '2026-09-04', weight: 85.9, measured: true, source: 'intervals.icu' },
  { date: '2026-09-05', weight: 85.8, measured: true, source: 'intervals.icu' },
  { date: '2026-09-06', weight: 85.7, measured: true, source: 'intervals.icu' },
  { date: '2026-09-07', weight: 85.6, measured: true, source: 'manual', waist: 95.0 },
];

// 12 días de nutrición (2026-08-27 → 2026-09-07), HOY incluido. La EA de hoy es intradía.
const NUTRITION = [];
for (let i = 0; i < 12; i++) {
  const t = Date.UTC(2026, 8, 7) - i * 86400000;
  const date = new Date(t).toISOString().slice(0, 10);
  NUTRITION.push({
    date, protein: 190, calories: 2420, carbs: 240, fat: 80, fiber: 30,
    alcoholG: date === '2026-09-04' ? 20 : 0,
    mealCount: 4, kcalTarget: 2400, proteinFloor: 185, trainingDay: true,
    eee: 400, ffm: 72.8, steps: 8200, burn: 2900, burnSource: 'modelo',
    ea: date === HOY ? 5 : 31,      // ← hoy, a media mañana: intradía, no es un hecho
    loggedV2: true, updatedAt: t,
  });
}

const STEPS = [];
for (let i = 0; i < 10; i++) {
  const t = Date.UTC(2026, 8, 7) - i * 86400000;
  STEPS.push({ date: new Date(t).toISOString().slice(0, 10), steps: 8200 + i * 50, source: 'intervals.icu' });
}

const MOBILITY = [
  { id: 'm1', date: '2026-09-06', routineId: 'lumbar', routineName: 'Lumbar + cadera', durationMin: 15, painBefore: 2, painAfter: 1 },
  { id: 'm2', date: '2026-08-30', routineId: 'lumbar', routineName: 'Lumbar + cadera', durationMin: 12, painBefore: 3, painAfter: 1 },
];

const DECISIONS = [
  { id: 'd1', ts: Date.UTC(2026, 8, 7), date: '2026-09-07', weekKey: '2026-W37', source: 'rule', type: 'session-readout', what: 'Banca 95×6/6/6', why: 'Doble progresión', ruleIds: ['STR-001'], evidence: { numbers: { topKg: 95 } }, ref: { sessionId: 'lowerA' }, outcome: 'done' },
  { id: 'd2', ts: Date.UTC(2026, 8, 1), date: '2026-09-01', weekKey: '2026-W36', source: 'coach', type: 'progression', what: 'Banca sube a 95', why: 'Todas al tope', ruleIds: ['STR-001', 'STR-002'], evidence: { numbers: { from: 92.5, to: 95 } }, reviewOn: '2026-09-07' },
  { id: 'd3', ts: Date.UTC(2026, 7, 31), date: '2026-08-31', weekKey: '2026-W36', source: 'coach', type: 'running', what: 'Sin rampa de km esta semana', why: 'Z2 no cumplida en 2 de 4', ruleIds: ['END-003'], evidence: { numbers: { z2Pct: 50 } } },
  // La fase de carrera que el motor registra cada semana (`_logRunningWeekOnce`). Es `rule`,
  // no `coach`: alimenta `trajectory.running.phaseHistory` y NO el seguimiento de decisiones.
  { id: 'd4', ts: Date.UTC(2026, 7, 30), date: '2026-08-30', weekKey: '2026-W35', source: 'rule', type: 'running-week', what: 'Base: 3 salidas Z2', why: 'Fallback determinista', ruleIds: ['END-003'], evidence: { phase: 'base', weeklyKmTarget: 12 }, outcome: 'done' },
];

const REVIEWS = [
  {
    id: '2026-W36#1', weekKey: '2026-W36', attempt: 1, status: 'applied', appliedPlanId: 'plan_v21',
    output: { briefing: { lastWeek: 'La banca cayó.', nextWeek: 'Bajamos la frecuencia de empuje a 2.', priorities: ['Frecuencia de press a 2', 'Z2 estricta ≤143', 'Movilidad ≥2'] }, decisions: [{ id: 'x1', type: 'structure', what: 'Press 2×/sem', ruleIds: ['STR-002'] }] },
  },
  {
    id: '2026-W35#1', weekKey: '2026-W35', attempt: 1, status: 'expired',
    output: { briefing: { lastWeek: '', nextWeek: 'Mantener.', priorities: ['Mantener'] }, decisions: [] },
  },
];

const LEGACY = {
  weekKey: '2026-W36', generatedAt: 1788393600000, source: 'manual',
  coachVoice: { lastWeek: 'La mejor sesión del historial.', nextWeek: 'X'.repeat(3000) },
  nextWeekPlan: { weekNumber: 36, summary: 'Déficit ~500 kcal pilotado por la media de 7 días.', sessions: [] },
};

const PLAN = {
  id: 'plan_v21', version: 21, label: 'Ideal · Completa', schema: 1, createdAt: '2026-09-01T08:00:00.000Z',
  sessions: {
    upperA: {
      id: 'upperA', name: 'Upper A', subtitle: 'Horizontal Press', warmup: ['5 min bici'],
      exercises: [
        { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, compound: true },
        { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 4, reps: '6-10', rpe: '7-8', defaultRest: 150, compound: true },
        { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60 },
        { id: 'pallof-press', name: 'Pallof Press', muscle: 'Core', sets: 3, reps: '10-12', rpe: '7', defaultRest: 60 },
      ],
    },
    upperB: {
      id: 'upperB', name: 'Upper B', subtitle: 'Vertical', warmup: ['5 min remo'],
      exercises: [
        { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, compound: true },
        { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, bw: true, compound: true },
        { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, bw: true },
      ],
    },
    lowerA: {
      id: 'lowerA', name: 'Lower A', subtitle: 'Squat', warmup: ['5 min cinta'],
      exercises: [
        { id: 'box-jump', name: 'Box Jump', muscle: 'Power', sets: 3, reps: '5', rpe: '-', defaultRest: 90 },
        { id: 'back-squat', name: 'Back Squat', muscle: 'Quads', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, compound: true },
        { id: 'leg-curl-a', name: 'Seated Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90 },
      ],
    },
    lowerB: {
      id: 'lowerB', name: 'Lower B', subtitle: 'Hinge', warmup: ['5 min bici'],
      exercises: [
        { id: 'trap-bar-dl', name: 'Trap Bar Deadlift', muscle: 'Hamstrings', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, compound: true },
        { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7', defaultRest: 90 },
        { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, bw: true },
      ],
    },
  },
  weekTemplate: {
    0: { type: 'recovery', label: 'Recuperación activa', subtype: 'mobility', z2FinisherMin: 20 },
    1: { type: 'gym', session: 'lowerA', z2FinisherMin: 20 },
    2: { type: 'gym', session: 'upperA', z2FinisherMin: 20 },
    3: { type: 'run', label: 'Cardio Z2', subtype: 'zone2', durationMin: 40 },
    4: { type: 'gym', session: 'lowerB', z2FinisherMin: 20 },
    5: { type: 'gym', session: 'upperB', z2FinisherMin: 20 },
    6: { type: 'run', label: 'Cardio calidad Z2', subtype: 'long_easy', durationMin: 50 },
  },
};

const LIBRARY = {
  'bench-press': { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', movementPattern: 'horizontal-press' },
  'barbell-row': { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', movementPattern: 'horizontal-pull' },
  'face-pull': { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', movementPattern: 'isolation-rear-delt' },
  'pallof-press': { id: 'pallof-press', name: 'Pallof Press', muscle: 'Core', movementPattern: 'core-anti-rotation' },
  ohp: { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', movementPattern: 'vertical-press' },
  chinups: { id: 'chinups', name: 'Chin-ups', muscle: 'Back', movementPattern: 'vertical-pull', bw: true },
  'ab-wheel': { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', movementPattern: 'core-anti-extension', bw: true },
  'box-jump': { id: 'box-jump', name: 'Box Jump', muscle: 'Power', movementPattern: 'plyometric' },
  'back-squat': { id: 'back-squat', name: 'Back Squat', muscle: 'Quads', movementPattern: 'squat' },
  'leg-curl-a': { id: 'leg-curl-a', name: 'Seated Leg Curl', muscle: 'Hamstrings', movementPattern: 'isolation-ham' },
  'trap-bar-dl': { id: 'trap-bar-dl', name: 'Trap Bar Deadlift', muscle: 'Hamstrings', movementPattern: 'hinge' },
  'leg-extension': { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', movementPattern: 'isolation-quad' },
};

const SETTINGS = {
  unit: 'kg', idealVariant: 6, deloadAnchorDate: '2026-09-07',
  goals: JSON.parse(JSON.stringify(ENGINE_EXPORTS.COACH_GOALS_DEFAULT)),
};

function mkInput(over) {
  const base = {
    todayStr: HOY, weekKey: SEMANA, appVersion: 'v11.61', seedRev: 8,
    generatedAt: '2026-09-07T08:00:00.000Z',
    block: { index: 1, weeksTotal: 5, isDeload: false, weeksIntoBlock: 0, label: 'build', blockStartMonday: '2026-09-07', deloadMonday: '2026-10-05' },
    legacyLatest: LEGACY,
    stores: {
      workouts: WORKOUTS, runs: RUNS, sessions: SESSIONS, mobility: MOBILITY,
      wellness: WELLNESS, steps: STEPS, bodyweight: BODYWEIGHT, nutrition: NUTRITION,
      decisions: DECISIONS, coachReviews: REVIEWS,
      settings: { userSettings: SETTINGS, exerciseOverrides: {}, weekSchedule: {} },
      activePlan: PLAN, exercisesLibrary: LIBRARY,
    },
  };
  return Object.assign(base, over || {});
}

const facts = buildCoachFacts(mkInput(), DEPS);

// ════════════════════════════════════════════════════════════════════════════════════
sec('meta y ventana ISO (la frontera domingo/lunes)');
// ════════════════════════════════════════════════════════════════════════════════════
eq(facts.meta.weekKey, SEMANA, 'weekKey = 2026-W37');
eq(facts.meta.factsSchema, 2, 'esquema 2 del pack (trae `trajectory`)');
eq(facts.meta.caps.priorReviews, 6, 'el tope de revisiones previas es 6 (3 completas + 3 compactas)');
eq(facts.meta.window.weeks.join(' '), '2026-W34 2026-W35 2026-W36 2026-W37', 'ventana de 4 semanas ISO, la actual al final');
eq(facts.meta.window.from, '2026-08-17', 'la ventana empieza el lunes de hace 3 semanas');
eq(facts.meta.unit, 'kg', 'todo el pack va en kg');
eq(facts.meta.appVersion, 'v11.61', 'appVersion viaja en meta');

// ════════════════════════════════════════════════════════════════════════════════════
sec('lifts · lb → kg, e1RM, medidas y peso corporal');
// ════════════════════════════════════════════════════════════════════════════════════
const bench = facts.lifts['bench-press'];
ok(!!bench, 'bench-press está en lifts');
eq(bench.sessions.length, 3, 'las 3 sesiones de banca, la más reciente primero');
eq(bench.sessions[0].date, '2026-09-01', 'orden descendente por fecha');
eq(bench.sessions[0].topKg, 95, 'top set del 1-sep: 95 kg');
eq(bench.sessions[0].e1rm, 114, 'e1RM Epley de 95×6 = 114,0 kg');
// 205 lb × 0,453592 = 92,99 kg → 93,0 al paso de 0,5 kg. El fallo que impide: 205 al lado de 95.
eq(bench.sessions[2].loggedUnit, 'lb', 'la sesión del 25-ago se guardó en lb');
eq(bench.sessions[2].topKg, 93, '205 lb → 93,0 kg (convertWeight, no el número crudo)');
eq(bench.sessions[2].e1rm, 108.5, 'e1RM de 205 lb × 5 = 108,5 kg (sobre los kg convertidos)');
eq(bench.sessions[0].setsPlanned, 4, 'setsPlanned viene del plan activo (4)');
eq(bench.sessions[0].setsDone, 3, 'setsDone cuenta sólo las series marcadas');
eq(bench.sessions[0].targetShown.kg, 95, 'el objetivo que la tarjeta mostró viaja con la sesión');
eq(bench.sessions[0].outcome, 'progressed', 'la lectura post-sesión (`readout`) viaja como outcome');
eq(bench.trend, 'up', 'tendencia por e1RM: 108,5 → 114,0 es +5 % (>2 %) → up');
eq(bench.daysSinceLast, 6, 'daysSinceLast del 1-sep a hoy = 6');
eq(bench.pattern, 'horizontal-press', 'el patrón sale de la biblioteca');

const box = facts.lifts['box-jump'];
eq(box.kind, 'measure', 'box-jump se clasifica como MEDIDA');
eq(box.measureUnit, 'cm', 'su unidad es cm');
eq(box.sessions[0].topMeasure, 55, 'top del 7-sep: 55 cm');
eq(box.sessions[0].topKg, null, 'una medida NO tiene kg');
eq(box.sessions[0].e1rm, null, 'una medida NO tiene e1RM ("50 cm + 2,5" no significa nada)');

const chins = facts.lifts.chinups;
eq(chins.kind, 'bw', 'chinups se clasifica como peso corporal');
eq(chins.sessions[0].addedKg, 2.5, 'el número es el LASTRE: +2,5 kg');
eq(chins.sessions[0].e1rm, null, 'no se estima e1RM sobre el lastre de unas dominadas');

// `plan.sessions[].exercises[]` es de donde la edge function saca su `allowed` y con lo que
// fuerza `kg: null` donde no hay carga (deriveAllowedFromFacts lee `db`/`bw`/`measure`). Sin el
// flag `measure`, el modelo podría prescribir "box jump 52,5 kg".
eq(facts.plan.sessions.lowerA.exercises[0].measure, true, 'el plan marca box-jump como `measure: true` (vocabulario de la edge function)');
eq(facts.plan.sessions.lowerA.exercises[0].measureUnit, 'cm', 'con su unidad');
eq(facts.plan.sessions.upperA.exercises[0].measure, false, 'y la banca no es una medida');
eq(facts.plan.sessions.upperB.exercises[1].bw, true, 'las dominadas viajan con `bw: true`');

eq(facts.lifts['back-squat'].sessions.length, 2, 'back-squat: 2 sesiones');
eq(facts.lifts['back-squat'].sessions[0].topReps, 8, '105×8 el 7-sep');
ok(facts.lifts['face-pull'] === undefined, 'face-pull NO está en lifts: no tiene ni una serie marcada');

// ════════════════════════════════════════════════════════════════════════════════════
sec('skipped · el ejercicio que se salta siempre');
// ════════════════════════════════════════════════════════════════════════════════════
const fp = facts.skipped.find(x => x.id === 'face-pull');
ok(!!fp, 'face-pull aparece en `skipped`');
eq(fp.skips, 3, '3 saltos en las 3 exposiciones de upperA de la ventana');
eq(fp.rate, 100, 'rate 100 %');

// ════════════════════════════════════════════════════════════════════════════════════
sec('cardio · dedupe, Z2 con tolerancia, deriva no disponible');
// ════════════════════════════════════════════════════════════════════════════════════
eq(facts.cardio.runs.length, 4, 'de 5 filas quedan 4: la carrera de COROS duplicada (Strava + intervals.icu) se fue');
ok(!facts.cardio.runs.some(r => r.source === 'strava'), 'la que sobrevive es la de intervals.icu (canónica)');
eq(facts.cardio.z2Ceiling.bpm, 143, 'techo Z2 = 143 bpm');
eq(facts.cardio.z2Ceiling.source, 'declared', 'y se declara que es DECLARADO, no medido (no hay icuZones)');
eq(facts.cardio.z2Tolerance, 2, 'la tolerancia del semáforo es +2 bpm');
const r141 = facts.cardio.runs.find(r => r.date === '2026-09-06');
const r145 = facts.cardio.runs.find(r => r.date === '2026-09-02');
const r146 = facts.cardio.runs.find(r => r.date === '2026-08-29');
eq(r141.z2Compliant, true, 'FC media 141 ≤ 143+2 → Z2 cumplida');
eq(r145.z2Compliant, true, 'FC media 145 = 143+2 → cumple justo en el borde');
eq(r146.z2Compliant, false, 'FC media 146 > 143+2 → NO cumple');
eq(facts.cardio.z2CompliancePct4w, 75, '3 de 4 carreras en Z2 = 75 %');
// (600+1500)/2400 = 87,5 % → 88 con la resolución de 1 % del pack (§A.4: "% 1").
eq(r141.pctZ2, 88, 'pctZ2 desde hrZoneTimes: (600+1500)/2400 = 87,5 % → 88 % (resolución 1 %)');
eq(r141.pctAboveZ2, 12, 'y su complementario, que es el que la regla mira (≤10 %)');
eq(r145.pctZ2, null, 'sin hrZoneTimes, pctZ2 va a null — no se estima');
eq(r141.hrDrift, null, 'la deriva de FC va a null: no hay streams');
// La carrera del DOMINGO 6-sep pertenece a W36, no a W37.
const wk = Object.fromEntries(facts.cardio.weeks.map(w => [w.weekKey, w.km]));
eq(wk['2026-W36'], 11, 'W36 = 6,0 + 5,0 = 11,0 km (el domingo 6-sep cuenta en SU semana)');
eq(wk['2026-W37'], 0, 'W37 aún no tiene km');
eq(wk['2026-W35'], 5, 'W35 = 5,0 km');
eq(wk['2026-W34'], 4.5, 'W34 = 4,5 km');
eq(facts.cardio.maxWeekKm4w, 11, 'máximo semanal de 4 semanas = 11,0 km');
eq(facts.cardio.daysSinceLastRun, 1, 'último día con carrera: ayer');
eq(facts.cardio.weeks.find(w => w.weekKey === '2026-W37').finishers, 1, 'el finisher Z2 post-fuerza cuenta como cardio');

// ════════════════════════════════════════════════════════════════════════════════════
sec('readiness · form = ctl − atl, y la carga que sólo ve el cardio');
// ════════════════════════════════════════════════════════════════════════════════════
const al = facts.readiness.aerobicLoad;
eq(al.ctl, 3.2, 'ctl del último día');
eq(al.atl, 5.1, 'atl del último día');
eq(al.form, -1.9, 'form = ctl − atl = 3,2 − 5,1 = −1,9 (F-2: NO es rampRate)');
eq(al.rampRate, -0.21, 'rampRate viaja aparte, como lo que es: ΔCTL/semana');
ok(/cardio only/.test(al.note), 'la nota dice "cardio only" (F-3)');
ok(/form = ctl − atl/.test(al.note), 'y deja escrita la definición de form');
eq(facts.readiness.score.green7, 3, '3 días verdes en 7 (≥67)');
eq(facts.readiness.score.yellow7, 3, '3 amarillos (34-66)');
eq(facts.readiness.score.red7, 1, '1 rojo (<34)');
eq(facts.readiness.score.cutoffs.green, 67, 'los cortes son los de Home: 67 / 34');
eq(facts.readiness.score.cutoffs.yellow, 34, '');
eq(facts.readiness.score.n7, 7, '7 días de readiness en la ventana corta');
eq(facts.readiness.today.readiness, 70, 'el dato de hoy existe y es de hoy');
eq(facts.readiness.today.color, 'green', 'y su color');
eq(facts.readiness.sleep.nightsUnder6h5_7, 2, '2 noches por debajo de 6,5 h en 7 días');
eq(facts.readiness.hrv.n28, 28, 'baseline de HRV sobre 28 días');
ok(JSON.stringify(facts).indexOf('"sleepScore"') === -1, 'NUNCA viajan filas crudas de wellness (no hay sleepScore en el pack)');

const anom = facts.readiness.anomalies;
ok(anom.length >= 1, `hay al menos una anomalía de recuperación (${anom.length})`);
eq(anom[0].date, '2026-09-04', 'la primera es el día rojo (readiness 30)');
eq(anom[0].sleepHrs, 4.7, 'con el sueño de ESA noche (17.000 s = 4,7 h)');
eq(anom[0].alcoholG, 20, 'y el alcohol de ese día, desde `nutrition`');
eq(anom[0].prevDay.budgetWeight, 2, 'y la carga del día anterior (lowerA = 2)');

eq(facts.readiness.pressExposuresPerWeek.find(w => w.weekKey === '2026-W35').exposures, 3,
  'W35: 3 exposiciones de EMPUJE en la semana (el patrón que hundió la banca: frecuencia, no carga)');
eq(facts.readiness.pressExposuresPerWeek.find(w => w.weekKey === '2026-W36').exposures, 1, 'W36: 1');
const il = facts.readiness.internalLoad.find(w => w.weekKey === '2026-W37');
eq(il.strengthSessions, 1, 'carga interna propia: 1 sesión de fuerza en W37');
ok(il.strengthRpeLoad > 0, 'y su Σ(duración × RPE) es > 0 (la fuerza SÍ entra en esta carga)');
ok(il.budgetWeight >= 2, 'el budgetWeight de la semana suma fuerza + cardio');

// ════════════════════════════════════════════════════════════════════════════════════
sec('progress.weight · sólo pesadas MEDIDAS');
// ════════════════════════════════════════════════════════════════════════════════════
const w = facts.progress.weight;
eq(w.nMeasured7, 6, '6 pesadas medidas en 7 días');
eq(w.nMeasured28, 8, '8 en 28 días (de 10 filas: 2 son forward-fill)');
eq(w.nForwardFilled28, 2, 'y las 2 forward-filled se cuentan aparte, no se usan');
eq(w.mean7, 85.9, 'media de 7 días = 85,87 → 85,9 kg (si entraran los 90,0 daría 87,3)');
eq(w.last.kg, 85.6, 'última pesada: 85,6 kg del 7-sep');
ok(w.slope14KgPerWeek < 0, `la pendiente de 14 días es negativa (${w.slope14KgPerWeek} kg/sem)`);
ok(/measured/.test(w.note), 'la nota explica que sólo usa filas medidas');

// El contraste: las MISMAS filas con `measured: true` mueven la pendiente. Es la prueba de
// que el filtro hace algo, y no que la pendiente saliera negativa por casualidad.
const bwFake = BODYWEIGHT.map(r => Object.assign({}, r, { measured: true }));
const factsFake = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { bodyweight: bwFake }),
}), DEPS);
eq(factsFake.progress.weight.nMeasured28, 10, 'con las 10 filas marcadas como medidas, n sube a 10');
eq(factsFake.progress.weight.mean7, 86.5, 'y la media de 7 días pasa de 85,9 a 86,5: los 90,0 la ensucian');
ok(Math.abs(factsFake.progress.weight.slope14KgPerWeek - w.slope14KgPerWeek) >= 0.3,
  `y la pendiente cambia de ${w.slope14KgPerWeek} a ${factsFake.progress.weight.slope14KgPerWeek} kg/sem: por eso se filtra`);
ok(!w.validWindow.ok, 'la ventana NO es válida para ajustar kcal (menos de 10 pesadas en 14 días)');
ok(w.validWindow.reasons.length > 0, 'y dice por qué');

eq(facts.progress.waist.last3[0].cm, 95, 'cintura: la última medida es la primera de la lista');
eq(facts.progress.running.longRun4wKm, 6, 'largo de 4 semanas: 6,0 km');
eq(facts.progress.running.tenKReadiness.verdict, 'far off', '10k: "far off" con un largo de 6 km');
eq(facts.progress.running.tenKReadiness.driftBpm, null, 'y la deriva, que no se puede medir, va a null');

// ════════════════════════════════════════════════════════════════════════════════════
sec('nutrition · EA sólo de días CERRADOS (F-12)');
// ════════════════════════════════════════════════════════════════════════════════════
eq(facts.nutrition.daysLogged28, 12, '12 días registrados en 28');
eq(facts.nutrition.ea.closedDays, 11, 'la EA se calcula sobre 11 días: HOY no cuenta');
eq(facts.nutrition.ea.mean28, 31, 'media de EA = 31 (con el 5 intradía de hoy saldría 28,6)');
eq(facts.nutrition.ea.daysUnder30, 0, 'y 0 días por debajo de 30 (con hoy dentro habría 1 falso)');
ok(/CLOSED days/.test(facts.nutrition.ea.note), 'la nota lo dice explícitamente');
eq(facts.nutrition.protein.floorG, 185, 'el suelo de proteína viene de goals.constraints');
eq(facts.nutrition.pilot, 'tracker', '12/14 días registrados → pilota el tracker, no la báscula');
eq(facts.nutrition.maintenance.modelMean7, 2900, 'mantenimiento MODELADO, y se dice que es modelo');
ok(/not measured/.test(facts.nutrition.maintenance.source), 'y el `source` dice que es modelo, no medida');

// ════════════════════════════════════════════════════════════════════════════════════
sec('adherence · planificado exacto vs aproximado');
// ════════════════════════════════════════════════════════════════════════════════════
const adh = Object.fromEntries(facts.adherence.map(a => [a.weekKey, a]));
eq(facts.adherence.length, 4, '4 filas, una por semana ISO');
eq(adh['2026-W36'].gym.planned, 4, 'W36: 4 días de gimnasio planificados');
eq(adh['2026-W36'].gym.done, 2, 'y 2 hechos');
eq(adh['2026-W36'].cardio.planned, 2, '2 días de cardio planificados');
eq(adh['2026-W37'].gym.plannedToDate, 1, 'W37 va por el lunes: 1 planificado hasta hoy');
eq(adh['2026-W37'].gym.done, 1, 'y 1 hecho');
eq(adh['2026-W37'].gym.pctToDate, 100, '→ 100 % a fecha de hoy');
eq(adh['2026-W37'].plannedSource, 'plan-activo', 'W37 se mide contra el plan que estaba activo');
eq(adh['2026-W35'].plannedSource, 'plantilla-actual (aproximado)', 'W35 lleva un registro de la v19: aproximado, y se dice');
eq(adh['2026-W36'].avgDurationMin, 70, 'duración media de W36: (74 + 66)/2 = 70 min');

// ════════════════════════════════════════════════════════════════════════════════════
sec('dataGaps · lo que el modelo tiene que repetir');
// ════════════════════════════════════════════════════════════════════════════════════
const gaps = facts.dataGaps.join(' | ');
ok(/do NOT infer intake/.test(gaps), 'con 12/28 días de nutrición: "do NOT infer intake"');
ok(/icuZones/.test(gaps), 'sin zonas de FC: el techo de Z2 se declara');
ok(/strength sessions logged/.test(gaps), `<${F.FACTS_MIN_WORKOUTS} sesiones en la ventana: señal débil`);
ok(/APPROXIMATE/.test(gaps), 'lo planificado de alguna semana es aproximado');
ok(/HR drift/.test(gaps), 'la deriva de FC no está disponible y se dice');
ok(/MEASURED weigh-ins|measured weigh-ins/.test(gaps), 'faltan pesadas medidas para la pendiente');
eq(new Set(facts.dataGaps).size, facts.dataGaps.length, 'ningún hueco se repite (repetirlo le baja peso a los demás)');
ok(['low', 'medium', 'high', 'none'].indexOf(facts.confidence.overall) !== -1, `confidence.overall = ${facts.confidence.overall}`);
ok(!!facts.confidence.bySection.weight, 'y hay confianza por sección');

// ════════════════════════════════════════════════════════════════════════════════════
sec('staleness · dato viejo por fuente');
// ════════════════════════════════════════════════════════════════════════════════════
eq(facts.staleness.wellness.daysAgo, 0, 'wellness es de hoy');
eq(facts.staleness.wellness.stale, false, 'y por tanto no es viejo');
eq(facts.staleness.mobility.lastDate, '2026-09-06', 'movilidad: última del 6-sep');
ok(facts.staleness.mobility.stale === false, 'ayer no es viejo (el umbral son >2 días)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('decisions y priorReviews · topes y legacy');
// ════════════════════════════════════════════════════════════════════════════════════
eq(facts.decisions.length, 4, 'las 4 decisiones del fixture');
eq(facts.decisions[0].id, 'd1', 'la más reciente primero');
eq(facts.decisions[1].claim, 'Banca sube a 95', '`what` viaja como `claim` (el "te dije X")');
eq(facts.decisions[1].dueForReview, true, 'y una con `reviewOn` vencido se marca dueForReview');
eq(facts.decisions[1].numbers.to, 95, 'los números de la evidencia viajan');

eq(facts.priorReviews.length, 3, '2 revisiones + la entrada legacy');
eq(facts.priorReviews[0].weekKey, '2026-W36', 'la más reciente primero');
eq(facts.priorReviews[0].applied, true, 'y se sabe si se aplicó');
eq(facts.priorReviews[0].priorities.length, 3, 'con sus 3 prioridades');
const leg = facts.priorReviews.find(r => r.kind === 'legacy');
ok(!!leg, 'la revisión legacy (latest.json de W36) entra como `legacy`');
ok(leg.excerpt.length <= 1200, `su extracto está recortado a ≤1200 chars (${leg.excerpt.length})`);
ok(/pilotado por la media/.test(leg.planSummary), 'y trae el resumen del plan de la semana');

// Topes: 35 decisiones → 30; 5 revisiones → 3 y sin legacy.
const many = Array.from({ length: 35 }, (_, i) => ({
  id: `x${i}`, ts: Date.UTC(2026, 8, 1) + i * 1000, date: '2026-09-01', type: 'other',
  what: `d${i}`, why: '', ruleIds: [], evidence: {},
}));
const manyReviews = Array.from({ length: 5 }, (_, i) => ({
  id: `2026-W3${i}#1`, weekKey: `2026-W3${i}`, attempt: 1, status: 'applied',
  output: { briefing: { priorities: ['a'] }, decisions: [] },
}));
const factsCaps = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { decisions: many, coachReviews: manyReviews }),
}), DEPS);
eq(factsCaps.decisions.length, 30, 'tope de 30 decisiones');
eq(factsCaps.priorReviews.length, 5, '5 revisiones caben enteras bajo el tope de 6');
eq(factsCaps.priorReviews.filter(r => r.kind === 'legacy').length, 0, 'con 3 revisiones reales o mas, la legacy no entra');
const manyRuns = Array.from({ length: 20 }, (_, i) => ({
  id: `r${i}`, date: `2026-09-0${(i % 7) + 1}`, distance: 5, duration: 30 + i, avgHR: 140, avgPace: '6:00', source: 'manual',
}));
const factsRuns = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { runs: manyRuns }),
}), DEPS);
eq(factsRuns.cardio.runs.length, 10, 'tope de 10 carreras');
ok(Object.values(facts.lifts).every(l => l.sessions.length <= 4), 'tope de 4 sesiones por ejercicio');

// ════════════════════════════════════════════════════════════════════════════════════
sec('trajectory · TODO EL RECORRIDO (esquema 2)');
// ════════════════════════════════════════════════════════════════════════════════════
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR: un coach que cada domingo empieza de cero.
// Con una ventana de 4 semanas no se puede contestar "cómo viene entrenando", "cuánto ha
// avanzado hacia el objetivo" ni "qué hizo y qué no": una sesión que lleva tres meses sin
// tocarse parece igual de nueva que la de la semana pasada, y un ancla que se ha dejado de
// hacer parece mantenida. Todo lo de abajo es memoria larga con la MISMA aritmética que el
// resto del pack (pesadas medidas, carreras dedupeadas, kg convertidos).

const tr = facts.trajectory;
ok(!!tr, 'el pack trae la sección `trajectory`');

// ---- program ----
eq(tr.program.firstWorkoutDate, '2026-06-29', 'firstWorkoutDate = la sesión más antigua del historial, no la de la ventana de 4 semanas');
eq(tr.program.weeksSince, 11, '11 semanas ISO desde la primera sesión hasta hoy');
eq(tr.program.totalStrengthSessions, 8, '8 sesiones de fuerza en todo el recorrido (la ventana de 4 semanas sólo ve 6)');
eq(tr.program.sessionsPerWeekAvg, 0.7, '8 sesiones / 11 semanas = 0,7 por semana');
eq(tr.program.anchorDate, '2026-09-07', 'el ancla del bloque es la de `settings.deloadAnchorDate`');

eq(tr.program.blocks.length, 2, 'dos tramos: lo anterior al ancla y B1');
const pre = tr.program.blocks[0];
eq(pre.index, 0, 'el tramo anterior al ancla va con índice 0');
eq(pre.label, 'pre-bloque', 'y se llama `pre-bloque`: no es un bloque numerado (blockWeekFromDates devuelve null antes del ancla)');
eq(pre.from, '2026-06-29', 'empieza en la primera sesión');
eq(pre.to, '2026-09-06', 'y acaba el día antes del ancla');
eq(pre.weeks, 10, '10 semanas ISO');
eq(pre.strengthSessions, 7, '7 sesiones de fuerza antes del ancla');
eq(pre.runs, 4, '4 carreras (DEDUPEADAS: las 5 filas incluyen la de COROS duplicada)');
eq(pre.km, 20.5, '20,5 km');
const b1 = tr.program.blocks[1];
eq(b1.index, 1, 'el primer bloque desde el ancla es el 1');
eq(b1.label, 'B1', 'etiquetado B1');
eq(b1.from, '2026-09-07', 'arranca EN el ancla');
eq(b1.to, '2026-09-07', 'y se corta en hoy, no en el final teórico del bloque');
eq(b1.isCurrent, true, 'es el bloque en curso');
eq(b1.strengthSessions, 1, 'con la sesión de hoy dentro');
ok(tr.program.blocks.filter(b => b.isCurrent).length === 1, 'exactamente un bloque marcado como actual');

// ---- weight · SÓLO pesadas medidas ----
// El mismo fallo que en `progress.weight`, pero con más consecuencias: el forward-fill de
// intervals.icu (90,0 kg repetido) haría que el recorrido desde 87,1 kg pareciera la mitad.
const tw = tr.weight;
eq(tw.startKg, 87.1, 'el peso de partida sale de `goals.primary.startWeightKg`');
eq(tw.startDate, '2026-08-19', 'con su fecha');
eq(tw.firstMeasured.kg, 86.8, 'la primera pesada MEDIDA desde el inicio: 86,8 kg');
eq(tw.firstMeasured.date, '2026-08-26', 'del 26-ago');
eq(tw.nMeasuredSinceStart, 8, '8 pesadas medidas desde el inicio (las 2 forward-filled no cuentan)');
eq(tw.latest7dMean, 85.9, 'media de 7 días = la misma que `progress.weight.mean7`');
eq(tw.deltaKg, -1.2, 'delta desde el inicio = 85,9 − 87,1 = −1,2 kg');
eq(factsFake.trajectory.weight.nMeasuredSinceStart, 10, 'con las 10 filas marcadas como medidas, n sube a 10');
eq(factsFake.trajectory.weight.deltaKg, -0.6, 'y el delta pasa a −0,6: una fila forward-filled dentro se come la mitad del recorrido');
ok(tw.slopeSinceStartKgPerWeek < 0, `la pendiente desde el inicio es negativa (${tw.slopeSinceStartKgPerWeek} kg/sem)`);
eq(tw.slopeUsedForEta, '28d', 'el ETA usa la pendiente de 28 días cuando existe (describe el déficit de AHORA)');
ok(tw.weeksToMilestoneAtCurrentSlope > 0, `hito de 82 kg en ~${tw.weeksToMilestoneAtCurrentSlope} semanas`);
ok(tw.weeksToTargetAtCurrentSlope > tw.weeksToMilestoneAtCurrentSlope, 'y el objetivo final queda más lejos que el hito');

// Con menos de 6 pesadas medidas la pendiente del recorrido NO se publica: con 3 puntos la
// recta la decide la primera pesada, y eso no es una tendencia.
const factsPocas = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { bodyweight: BODYWEIGHT.slice(0, 4) }),
}), DEPS);
eq(factsPocas.trajectory.weight.nMeasuredSinceStart, 3, 'con 4 filas (3 medidas) desde el inicio');
eq(factsPocas.trajectory.weight.slopeSinceStartKgPerWeek, null, 'la pendiente del recorrido va a null (gate de 6 puntos)');
ok(/trajectory slope goes to null/.test(factsPocas.trajectory.weight.note || ''), 'y la nota lo dice');

// ---- weight.scale · lo que sabe la báscula (Withings Body Smart, v11.65) ----
// El fallo que impide: que el modelo cite composición corporal cuando no hay báscula (inventada),
// o que con báscula se quede sólo con el peso y no vea que el % grasa baja mientras la FFM aguanta.
eq(tr.weight.scale, null, 'sin filas source:withings, scale es null (no se inventa composición)');
const factsScale = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, {
    bodyweight: BODYWEIGHT.concat([
      { date: '2026-08-12', weight: 87.4, measured: true, source: 'withings', fatPct: 24.1, ffmKg: 66.3, muscleKg: 62.9, visceralFat: 9, bmrKcal: 1846, metabolicAge: 41, heartRateBpm: 61 },
      { date: '2026-09-06', weight: 85.6, measured: true, source: 'withings', fatPct: 22.6, ffmKg: 66.2, muscleKg: 62.8, visceralFat: 8, bmrKcal: 1812.4, metabolicAge: 38, heartRateBpm: 57 },
    ]),
  }),
}), DEPS);
const sc = factsScale.trajectory.weight.scale;
eq(sc && sc.date, '2026-09-06', 'scale = la última lectura del dispositivo');
eq(sc && sc.daysAgo, 1, 'con su antigüedad en días');
eq(sc && sc.fatPct, 22.6, '% grasa de la báscula');
eq(sc && sc.visceralFat, 8, 'grasa visceral (índice, sin unidad)');
eq(sc && sc.bmrKcal, 1812, 'metabolismo basal redondeado a kcal');
eq(sc && sc.metabolicAge, 38, 'edad metabólica');
eq(sc && sc.heartRateBpm, 57, 'pulso en la báscula');
eq(sc && sc.readings28d, 2, 'dos lecturas en 28 días');
eq(sc && sc.fatPctDelta28d, -1.5, 'y con ≥21 días entre ellas, el cambio de % grasa: −1,5');
eq(sc && sc.ffmKgDelta28d, -0.1, 'y el de FFM: −0,1 (la recomposición se lee aquí, no en el peso)');
const factsScaleCorta = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, {
    bodyweight: BODYWEIGHT.concat([
      { date: '2026-09-01', weight: 86.0, measured: true, source: 'withings', fatPct: 23.0 },
      { date: '2026-09-06', weight: 85.6, measured: true, source: 'withings', fatPct: 22.6 },
    ]),
  }),
}), DEPS);
eq(factsScaleCorta.trajectory.weight.scale.fatPctDelta28d, null, 'con 5 días entre lecturas no hay delta: el % grasa de báscula oscila a diario');
eq(factsScaleCorta.trajectory.weight.scale.bmrKcal, null, 'las claves que la fila no trae van a null, no a 0');
eq(sc && sc.readings7d, 1, 'readings7d: sólo la lectura del 6-sep cae en la última semana');
eq(sc && sc.fatPct7dAvg, null, 'con <3 lecturas en 7 días no hay media semanal de % grasa');
eq(sc && sc.deltaFrom, '2026-08-12', 'deltaFrom dice desde qué lectura se mide el delta');
eq(sc && sc.fatMassKgDelta28d, null, 'fatMassKgDelta28d va a null si la fila no trae fatMassKg (no se deriva)');
eq(sc && sc.weightKg, 85.6, 'weightKg: el peso de la misma pesada, para leer composición y peso juntos');
// El fallo del 2026-09-09: la Body Smart manda el pulso en un grupo aparte y una fila puede traer
// SÓLO `heartRateBpm`. Esa fila no es "lo que dice la báscula" sobre el cuerpo: `scale` tiene que
// seguir apuntando a la última lectura con composición, y la media de 7 días se calcula con las
// lecturas que tienen % grasa.
const factsScalePulso = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, {
    bodyweight: BODYWEIGHT.concat([
      { date: '2026-09-03', weight: 86.4, measured: true, source: 'withings', fatPct: 22.9, ffmKg: 66.6, fatMassKg: 19.8 },
      { date: '2026-09-05', weight: 86.0, measured: true, source: 'withings', fatPct: 22.7, ffmKg: 66.5, fatMassKg: 19.5 },
      { date: '2026-09-06', weight: 85.6, measured: true, source: 'withings', fatPct: 22.6, ffmKg: 66.2, fatMassKg: 19.3 },
      { date: '2026-09-07', measured: true, source: 'withings', heartRateBpm: 78 },
    ]),
  }),
}), DEPS);
const scP = factsScalePulso.trajectory.weight.scale;
eq(scP && scP.date, '2026-09-06', 'una fila de SÓLO pulso no se convierte en la lectura de la báscula');
eq(scP && scP.readings7d, 3, 'tres lecturas con composición en 7 días');
eq(scP && scP.fatPct7dAvg, 22.7, 'y su media de % grasa a 7 días: 22,7');
eq(scP && scP.fatMassKg, 19.3, 'fatMassKg viaja al pack (la recomposición se lee en masa grasa, no sólo en %)');

// ---- anchors · las 6 anclas de goals.preserve, con lb → kg ----
const anchorsById = Object.fromEntries(tr.anchors.map(a => [a.id, a]));
eq(tr.anchors.length, 6, 'una fila por ancla de `goals.preserve.anchorLifts`');
const aBench = anchorsById['bench-press'];
eq(aBench.kind, 'load', 'la banca es carga');
eq(aBench.first.date, '2026-06-29', 'su primera exposición es la del 29-jun');
// 185 lb × 0,453592 = 83,91 kg → 84,0 al paso de 0,5. Sin convertir entraría un "185" al lado
// de un 95 y el recorrido diría que la banca se ha desplomado un 49 %.
eq(aBench.first.kg, 84, '185 lb → 84,0 kg (convertWeight, no el número crudo)');
eq(aBench.first.e1rm, 98, 'y su e1RM sobre los kg convertidos');
eq(aBench.best.date, '2026-08-27', 'el mejor e1RM del recorrido es el del 27-ago (92,5×8)');
eq(aBench.best.e1rm, 117, '117 kg de e1RM: más que el 95×6 del 1-sep');
eq(aBench.latest.date, '2026-09-01', 'la última exposición es la del 1-sep');
eq(aBench.latest.e1rm, 114, 'con e1RM 114');
eq(aBench.latest.outcome, 'progressed', 'y el outcome del readout de esa sesión');
eq(aBench.exposures, 4, '4 exposiciones en todo el recorrido');
eq(aBench.exposures12w, 4, 'las 4 dentro de las últimas 12 semanas');
eq(aBench.daysSinceLast, 6, 'hace 6 días de la última');
eq(aBench.trendSinceStartPct, 16, 'e1RM de 98 → 114 = +16 % desde el inicio');

const aChin = anchorsById.chinups;
eq(aChin.kind, 'bw', 'las dominadas son peso corporal');
eq(aChin.latest.e1rm, null, 'y no llevan e1RM: la Epley sobre el lastre no describe al atleta');
eq(aChin.latest.kg, 2.5, 'el número es el LASTRE');
eq(aChin.trendSinceStartPct, null, 'con una sola exposición no hay tendencia');

// Un ancla que NO se ha tocado no se calla: "no ha bajado" y "no lo has hecho" no son lo mismo.
const aSumo = anchorsById['sumo-dl'];
eq(aSumo.exposures, 0, 'sumo-dl no tiene ninguna exposición registrada');
eq(aSumo.first, null, 'sin primera');
eq(aSumo.latest, null, 'sin última');
ok(facts.dataGaps.some(g => /sumo-dl/.test(g) && /0 logged exposures/.test(g)),
  'y el hueco se declara en dataGaps ("anchor with 0 logged exposures")');

// ---- running · 12 semanas, el largo de siempre, Z2 por semana y las fases ----
const trr = tr.running;
eq(trr.weeklyKm.length, 12, 'weeklyKm trae 12 semanas');
eq(trr.weekKeys.length, 12, 'y sus 12 claves de semana');
eq(trr.weekKeys[11], '2026-W37', 'de la más antigua a la ACTUAL (la última es esta semana)');
eq(trr.weekKeys[0], '2026-W26', 'y la primera es la de hace 11 semanas');
eq(trr.weeklyKm[10], 11, 'W36 = 11,0 km (el domingo 6-sep cuenta en SU semana)');
eq(trr.weeklyKm[0], 0, 'las semanas sin carreras van con 0, no se omiten');
eq(trr.longestRunEver.km, 6, 'el largo de todo el historial: 6,0 km');
eq(trr.longestRunEver.date, '2026-09-06', 'con su fecha');
eq(trr.longestRunEver.avgHR, 141, 'y su FC media (sin ella no se sabe si el largo fue en Z2)');
eq(trr.z2ComplianceByWeek.length, 8, 'cumplimiento de Z2 de las 8 últimas semanas');
eq(trr.z2ComplianceByWeek[6], 1, 'W36: las 2 carreras en Z2 → 1');
eq(trr.z2ComplianceByWeek[5], 0, 'W35: la de 146 bpm no cumple → 0');
eq(trr.z2ComplianceByWeek[7], null, 'W37 sin carreras → null, que NO es un 0');
eq(trr.phaseHistory.length, 1, 'una fase de carrera registrada');
eq(trr.phaseHistory[0].weekKey, '2026-W35', 'de W35');
eq(trr.phaseHistory[0].phase, 'base', 'fase base (sale de `evidence.phase` de la decisión running-week)');

// ---- adherenceByWeek · 12 semanas, planificado APROXIMADO y declarado ----
eq(tr.adherenceByWeek.length, 12, '12 filas de adherencia');
eq(tr.plannedIsApprox, true, 'y la sección declara que lo planificado es aproximado (la plantilla actual proyectada hacia atrás)');
const adhTr = Object.fromEntries(tr.adherenceByWeek.map(a => [a.weekKey, a]));
eq(adhTr['2026-W36'].planned, 4, 'W36: 4 sesiones de fuerza planificadas');
eq(adhTr['2026-W36'].done, 2, 'y 2 hechas');
eq(adhTr['2026-W36'].kmDone, 11, 'con 11,0 km');
eq(adhTr['2026-W36'].runs, 2, 'en 2 carreras');
eq(adhTr['2026-W37'].done, 1, 'W37 lleva 1 sesión');

// ---- skippedPatterns · ≥3 saltos en las últimas ≤6 exposiciones ----
// Es la regla "lo que no se hizo tres veces no se recuerda: se reordena o se quita". El
// umbral importa: con 2 el coach reescribiría la sesión por ruido.
const skById = Object.fromEntries(tr.skippedPatterns.map(x => [x.id, x]));
ok(!!skById['leg-curl-a'], 'leg-curl-a aparece: 3 saltos de 3 exposiciones');
eq(skById['leg-curl-a'].skips, 3, '3 saltos');
eq(skById['leg-curl-a'].exposures, 3, 'sobre 3 exposiciones');
eq(skById['leg-curl-a'].lastSkipped, '2026-09-07', 'y la fecha del último salto');
eq(skById['face-pull'].skips, 4, 'face-pull: 4 saltos en las últimas 4 exposiciones de 12 semanas');

const conLegCurl = WORKOUTS.map(w => (w.id === 'w0b'
  ? Object.assign({}, w, { exercises: w.exercises.concat([{ exerciseId: 'leg-curl-a', sets: S(35, 12, 7, 3) }]) })
  : w));
const factsMenosSkips = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { workouts: conLegCurl }),
}), DEPS);
const skMenos = factsMenosSkips.trajectory.skippedPatterns.map(x => x.id);
ok(skMenos.indexOf('leg-curl-a') === -1, 'con 2 saltos (uno de los tres hecho) leg-curl-a YA NO es un patrón: el umbral es 3');
ok(skMenos.indexOf('face-pull') !== -1, 'y face-pull, que sigue en 4, se queda');

// ---- decisionsFollowUp · sólo coach/plan-*, con lo que vence hoy ----
const fu = tr.decisionsFollowUp;
eq(fu.length, 2, 'las 2 decisiones del coach (las de `source: rule` no entran: nadie rinde cuentas de un readout)');
ok(fu.every(x => x.source === 'coach' || /^plan-/.test(x.type)), 'todas son del coach o de plan-*');
ok(!fu.some(x => x.id === 'd4'), 'la decisión `running-week` (source rule) se queda fuera del seguimiento');
eq(fu[0].id, 'd2', 'la más reciente primero');
eq(fu[0].dueForReview, true, 'con `reviewOn` = hoy → toca revisarla');
eq(fu[0].what, 'Banca sube a 95', 'y el "te dije X" viaja recortado a 120 chars');
eq(fu[1].dueForReview, false, 'la que no tiene `reviewOn` no vence');

// ---- readiness · el veredicto del motor, no una segunda lectura ----
ok(typeof facts.readiness.deloadHint === 'boolean',
  `readiness.deloadHint viene de computeReadinessFrom (${facts.readiness.deloadHint})`);
ok(Array.isArray(facts.readiness.firedSignals),
  `y las señales disparadas van por id (${JSON.stringify(facts.readiness.firedSignals)})`);
// Con dos sesiones a RPE 9 el motor pide descarga: la señal existe y el pack la transporta
// TAL CUAL. El pack no decide nada con ella — la recuperación es información (2026-09-07).
const duras = WORKOUTS.map(w => (w.id === 'w5' || w.id === 'w6'
  ? Object.assign({}, w, { exercises: w.exercises.map(ex => Object.assign({}, ex, { sets: (ex.sets || []).map(s => Object.assign({}, s, { rpe: s.rpe == null ? null : 9.5 })) })) })
  : w));
const factsDuras = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { workouts: duras }),
}), DEPS);
eq(factsDuras.readiness.deloadHint, true, 'con RPE ≥9 en las 2 últimas sesiones, deloadHint pasa a true');
ok(factsDuras.readiness.firedSignals.indexOf('rpe2') !== -1, 'y `rpe2` aparece entre las señales disparadas');

// ---- dataGaps de la trayectoria ----
const gapsTr = facts.dataGaps.join(' | ');
ok(/[Oo]nly one block since the anchor/.test(gapsTr), 'con sólo B1 desde el ancla, el hueco se declara');
ok(!/[Ss]hort trajectory/.test(gapsTr), 'con 11 semanas NO se declara trayectoria corta');
const factsCorto = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { workouts: WORKOUTS.slice(2) }),
}), DEPS);
eq(factsCorto.trajectory.program.weeksSince, 3, 'sin las dos sesiones viejas el programa tiene 3 semanas');
ok(factsCorto.dataGaps.some(g => /[Ss]hort trajectory/.test(g) && /indicative/.test(g)),
  'y entonces sí: "short trajectory (<8 weeks): slopes are indicative"');

// ---- tamaño de la sección ----
const trChars = stableStringify(tr).length;
console.log(`       tamaño de trajectory: ${trChars} chars`);
ok(trChars < 12000, `la trayectoria cabe en 12.000 chars (${trChars})`);

// ════════════════════════════════════════════════════════════════════════════════════
sec('priorReviews · 6 = 3 completas + 3 compactas');
// ════════════════════════════════════════════════════════════════════════════════════
// El coach necesita saber que en W22 ya se probó bajar la frecuencia de empuje; no necesita
// releer los 1.200 caracteres con los que se dijo. Tres extractos más serían ~3,6 KB de prosa
// vieja compitiendo con los hechos de esta semana.
eq(F.FACTS_MAX_REVIEWS, 6, 'el tope de revisiones previas es 6');
eq(F.FACTS_FULL_REVIEWS, 3, 'y sólo las 3 más recientes van completas');
const ochoReviews = Array.from({ length: 8 }, (_, i) => ({
  id: `2026-W${20 + i}#1`, weekKey: `2026-W${20 + i}`, attempt: 1, status: 'applied', appliedPlanId: `plan_${i}`,
  output: {
    briefing: { priorities: ['Frecuencia de press a 2'], nextWeek: 'N'.repeat(2000), lastWeek: 'L' },
    decisions: [{ id: `z${i}`, type: 'structure', what: 'Press 2×/sem', ruleIds: ['STR-002'] }],
  },
}));
const factsRev = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { coachReviews: ochoReviews }),
}), DEPS);
const pr = factsRev.priorReviews;
eq(pr.length, 6, '8 revisiones → 6 en el pack');
eq(pr[0].weekKey, '2026-W27', 'la más reciente primero');
ok(pr.slice(0, 3).every(r => typeof r.excerpt === 'string' && Array.isArray(r.decisions)),
  'las 3 primeras van completas: extracto y decisiones estructuradas');
ok(pr.slice(3).every(r => r.compact === true), 'las 4-6 van marcadas `compact: true`');
ok(pr.slice(3).every(r => r.excerpt === undefined && r.decisions === undefined),
  'y sin extracto ni decisiones: sólo semana, estado y prioridades');
ok(pr.slice(3).every(r => Array.isArray(r.priorities)), 'las prioridades sí sobreviven (es lo que se dijo, en una línea)');
eq(pr.filter(r => r.kind === 'legacy').length, 0, 'con historial propio, la entrada legacy no entra');

// ════════════════════════════════════════════════════════════════════════════════════
sec('stableStringify · el hash no depende del orden de las claves');
// ════════════════════════════════════════════════════════════════════════════════════
const a = { z: 1, a: { c: [3, 2, 1], b: 'x' }, m: null };
const b = { m: null, a: { b: 'x', c: [3, 2, 1] }, z: 1 };
eq(stableStringify(a), stableStringify(b), 'dos permutaciones de las mismas claves → el mismo string');
ok(JSON.stringify(a) !== JSON.stringify(b), 'y JSON.stringify sí difiere (por eso hace falta stableStringify)');
eq(stableStringify([3, 1, 2]), '[3,1,2]', 'los arrays conservan su orden (es información, no ruido)');
eq(stableStringify({ a: NaN, b: Infinity }), '{"a":null,"b":null}', 'NaN e Infinity → null, nunca "NaN"');
eq(stableStringify({ a: undefined, b: 1 }), '{"b":1}', 'las claves undefined no entran');
eq(stableStringify(buildCoachFacts(mkInput(), DEPS)), stableStringify(facts), 'dos builds del mismo input → el mismo string (factsHash estable)');
// La trayectoria recorre Maps, Sets y `Object.entries`: si alguno de esos órdenes dependiera
// del orden de inserción de los stores, dos packs con los MISMOS hechos darían hashes
// distintos y cada apertura de la app pagaría otra revisión.
eq(stableStringify(buildCoachFacts(mkInput(), DEPS).trajectory), stableStringify(tr), 'y la trayectoria también es determinista (mismo string dos veces)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('el pack es JSON limpio y cabe en el prompt');
// ════════════════════════════════════════════════════════════════════════════════════
const bad = [];
(function walk(v, path) {
  if (v === undefined) { bad.push(`${path} = undefined`); return; }
  if (typeof v === 'number' && !isFinite(v)) { bad.push(`${path} = ${v}`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
  if (v && typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], `${path}.${k}`); }
})(facts, 'facts');
eq(bad.length, 0, `sin undefined ni NaN en ninguna rama${bad.length ? ` — ${bad.slice(0, 5).join(', ')}` : ''}`);

const json = JSON.stringify(facts);
const kb = Buffer.byteLength(json, 'utf8') / 1024;
console.log(`       tamaño del pack: ${kb.toFixed(1)} KB`);
ok(kb < 50, 'el pack pesa <50 KB (objetivo 30-43 KB con `trajectory`, ~10-12k tokens)');
ok(json.indexOf('undefined') === -1, 'la palabra "undefined" no aparece en el JSON');
ok(json.indexOf('NaN') === -1, 'ni "NaN"');

// ════════════════════════════════════════════════════════════════════════════════════
sec('defensivo · un pack vacío no revienta');
// ════════════════════════════════════════════════════════════════════════════════════
let empty = null;
try {
  empty = buildCoachFacts({ todayStr: HOY, stores: {} }, {});
  ok(true, 'buildCoachFacts con stores vacíos no lanza');
} catch (e) {
  ok(false, `buildCoachFacts lanzó con stores vacíos: ${e.message}`);
}
if (empty) {
  eq(empty.meta.weekKey, SEMANA, 'y aun así deriva la semana ISO de hoy');
  ok(empty.dataGaps.length > 5, `y declara todos los huecos (${empty.dataGaps.length})`);
  eq(empty.plan, null, 'sin plan activo → null, no un plan inventado');
  eq(empty.confidence.overall, 'none', 'confianza "none": no hay nada sobre lo que decidir');
}


// ---- v11.70 (D-1) · wellness.weightMeasured lleva su origen ----
// El espejo de Withings escribe `weightMeasured` + `weightSource:'withings'` en wellness. Etiquetarlo
// 'intervals.icu' fijo contaba dos básculas donde había una.
{
  const wl = WELLNESS.map(w => Object.assign({}, w));
  wl[3] = Object.assign({}, wl[3], { weightMeasured: 86.1, weightSource: 'withings' });
  const fx = buildCoachFacts(mkInput({ stores: Object.assign({}, mkInput().stores, { wellness: wl, bodyweight: BODYWEIGHT.filter(r => r.date !== wl[3].date) }) }), DEPS);
  const src = fx.progress.weight.measuredSources28d || {};
  eq(src.withings, 1, 'un weightMeasured de wellness con weightSource withings cuenta como withings, no intervals.icu');
  ok(Object.values(src).reduce((a, b) => a + b, 0) === fx.progress.weight.nMeasured28, 'y measuredSources28d suma exactamente nMeasured28');
}

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
