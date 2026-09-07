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
eq(facts.cardio.z2Ceiling.source, 'declarado', 'y se declara que es DECLARADO, no medido (no hay icuZones)');
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
ok(/sólo cardio/.test(al.note), 'la nota dice "sólo cardio" (F-3)');
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
eq(facts.progress.running.tenKReadiness.verdict, 'lejos', '10k: "lejos" con un largo de 6 km');
eq(facts.progress.running.tenKReadiness.driftBpm, null, 'y la deriva, que no se puede medir, va a null');

// ════════════════════════════════════════════════════════════════════════════════════
sec('nutrition · EA sólo de días CERRADOS (F-12)');
// ════════════════════════════════════════════════════════════════════════════════════
eq(facts.nutrition.daysLogged28, 12, '12 días registrados en 28');
eq(facts.nutrition.ea.closedDays, 11, 'la EA se calcula sobre 11 días: HOY no cuenta');
eq(facts.nutrition.ea.mean28, 31, 'media de EA = 31 (con el 5 intradía de hoy saldría 28,6)');
eq(facts.nutrition.ea.daysUnder30, 0, 'y 0 días por debajo de 30 (con hoy dentro habría 1 falso)');
ok(/días CERRADOS/.test(facts.nutrition.ea.note), 'la nota lo dice explícitamente');
eq(facts.nutrition.protein.floorG, 185, 'el suelo de proteína viene de goals.constraints');
eq(facts.nutrition.pilot, 'tracker', '12/14 días registrados → pilota el tracker, no la báscula');
eq(facts.nutrition.maintenance.modelMean7, 2900, 'mantenimiento MODELADO, y se dice que es modelo');
ok(/no medido/.test(facts.nutrition.maintenance.source), '');

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
ok(/NO inferir ingesta/.test(gaps), 'con 12/28 días de nutrición: "NO inferir ingesta"');
ok(/icuZones/.test(gaps), 'sin zonas de FC: el techo de Z2 se declara');
ok(/sesiones de fuerza registradas/.test(gaps), `<${F.FACTS_MIN_WORKOUTS} sesiones en la ventana: señal débil`);
ok(/APROXIMADO/.test(gaps), 'lo planificado de alguna semana es aproximado');
ok(/[Dd]eriva de FC/.test(gaps), 'la deriva de FC no está disponible y se dice');
ok(/pesadas MEDIDAS|pesadas medidas/.test(gaps), 'faltan pesadas medidas para la pendiente');
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
eq(facts.decisions.length, 3, 'las 3 decisiones del fixture');
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
eq(factsCaps.priorReviews.length, 3, 'tope de 3 revisiones previas');
eq(factsCaps.priorReviews.filter(r => r.kind === 'legacy').length, 0, 'con 3 revisiones reales, la legacy no entra');
const manyRuns = Array.from({ length: 20 }, (_, i) => ({
  id: `r${i}`, date: `2026-09-0${(i % 7) + 1}`, distance: 5, duration: 30 + i, avgHR: 140, avgPace: '6:00', source: 'manual',
}));
const factsRuns = buildCoachFacts(mkInput({
  stores: Object.assign({}, mkInput().stores, { runs: manyRuns }),
}), DEPS);
eq(factsRuns.cardio.runs.length, 10, 'tope de 10 carreras');
ok(Object.values(facts.lifts).every(l => l.sessions.length <= 4), 'tope de 4 sesiones por ejercicio');

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
ok(kb < 40, 'el pack pesa <40 KB (objetivo 25-35 KB, ~8-10k tokens)');
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

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
