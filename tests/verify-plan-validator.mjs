// Los guardarraíles del plan: `validatePlanVersion`, `diffPlanVersions`, `mergeProposal`.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Un guardarraíl tiene exactamente dos formas de
// ser inútil, y las dos son silenciosas:
//
//   1. **Que nunca dispare.** Es lo que ya pasó: el cron aplicaba umbrales de TSB a `rampRate`
//      (rango real ±2), así que sus cuatro reglas de descarga por carga eran letra muerta y el
//      LLM creía estar aplicando evidencia (audit F-2). Un aviso que no salta con el caso que
//      viene a cazar es peor que no tenerlo: da una falsa sensación de red.
//   2. **Que bloquee.** La regla de producto es "avisan, nunca bloquean". Los DUROS restringen
//      al coach (la edge function le pide una regeneración); si insiste, la app lo pinta en rojo
//      y Julian aplica igual. Nada de esto puede impedir guardar un plan ni arrancar una sesión.
//      Y con un `ctx` incompleto el validador tiene que CALLAR el chequeo, no lanzar: un
//      TypeError aquí convierte "Aplicar" en una pantalla en blanco.
//
// Así que cada id se prueba con un caso POSITIVO (dispara, con los números dentro del texto) y
// uno NEGATIVO (calla). Los casos que más han costado antes van con nombre:
//
//   · `RUN-BEFORE-LEGS` con la vuelta DOMINGO → LUNES: el día siguiente al 0 es el 1, no el 7.
//     El cron ya se equivocó de días de pierna una vez (F-9).
//   · `KM-JUMP` con el suelo de +1 km: sobre 8 km, un +10 % son 800 m, y avisar por 800 m
//     convierte el aviso en ruido. Y con 14 días sin correr, el tope es 8 km "reentrada",
//     no un porcentaje.
//   · `LOAD-JUMP` sin histórico: prescribir kg sobre un ejercicio que nunca se ha hecho.
//   · `mergeProposal`: una propuesta que sólo habla de Upper B no puede reescribir en silencio
//     el resto de la semana, y el `warmup` tiene que salir del plan del coach para que los
//     arreglos de calentamiento sigan llegando por `PLAN_REV`.
//
// Ejecutar desde la raíz del repo: node tests/verify-plan-validator.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const FACTS = readFileSync('app/coach-facts.js', 'utf8');
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
sandbox.module = { exports: {} };
sandbox.exports = sandbox.module.exports;
new vm.Script(FACTS).runInContext(sandbox);
const F = sandbox.module.exports;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

if (typeof F.validatePlanVersion !== 'function') {
  console.log('FAIL — coach-facts.js no exporta validatePlanVersion');
  process.exit(1);
}
const { validatePlanVersion, diffPlanVersions, mergeProposal } = F;

const clone = (o) => JSON.parse(JSON.stringify(o));

// ════════════════════════════════════════════════════════════════════════════════════
// FIXTURE LIMPIO — la semana ideal real (4 fuerza + 2 cardio + recuperación) sobre hechos
// plausibles. Dispara UN aviso y sólo uno: HARD-BUDGET, porque el presupuesto del ideal es
// 7,5 sobre un tope de 6 y BUD-001 es informativo (la propia app retiró el flag en v11.41).
// Que el fixture "limpio" lleve ese aviso no es un defecto del test: es un hecho del plan.
// ════════════════════════════════════════════════════════════════════════════════════

const EX = {
  bench: { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, compound: true },
  row: { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 4, reps: '6-10', rpe: '7-8', defaultRest: 150, compound: true },
  facePull: { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60 },
  pallof: { id: 'pallof-press', name: 'Pallof Press', muscle: 'Core', sets: 3, reps: '10-12', rpe: '7', defaultRest: 60 },
  ohp: { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, compound: true },
  chins: { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, bw: true, compound: true },
  abWheel: { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, bw: true },
  boxJump: { id: 'box-jump', name: 'Box Jump', muscle: 'Power', sets: 3, reps: '5', rpe: '-', defaultRest: 90 },
  squat: { id: 'back-squat', name: 'Back Squat', muscle: 'Quads', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, compound: true },
  legCurl: { id: 'leg-curl-a', name: 'Seated Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90 },
  trap: { id: 'trap-bar-dl', name: 'Trap Bar Deadlift', muscle: 'Hamstrings', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, compound: true },
  legExt: { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7', defaultRest: 90 },
};

const PLAN_OK = {
  label: 'Ideal · Completa',
  block: { id: 'b1', weekIndex: 1, weeksTotal: 5, phase: 'build' },
  nutrition: { proteinG: 190, kcalTraining: 2700, kcalRest: 2400, dietBreak: false },
  running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: 0 },
  sessions: {
    upperA: { id: 'upperA', name: 'Upper A', warmup: ['5 min bici'], exercises: [EX.bench, EX.row, EX.facePull, EX.pallof] },
    upperB: { id: 'upperB', name: 'Upper B', warmup: ['5 min remo'], exercises: [EX.ohp, EX.chins, EX.abWheel] },
    // `mobilityMin`: los 5-8' de movilidad al final de Lower A/B (C.1). Es la forma que ocurre.
    lowerA: { id: 'lowerA', name: 'Lower A', warmup: ['5 min cinta'], mobilityMin: 8, exercises: [EX.boxJump, EX.squat, EX.legCurl] },
    lowerB: { id: 'lowerB', name: 'Lower B', warmup: ['5 min bici'], mobilityMin: 8, exercises: [EX.trap, EX.legExt, EX.abWheel] },
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

const LIB = {
  'bench-press': { movementPattern: 'horizontal-press' },
  'barbell-row': { movementPattern: 'horizontal-pull' },
  'face-pull': { movementPattern: 'isolation-rear-delt' },
  'pallof-press': { movementPattern: 'core-anti-rotation' },
  ohp: { movementPattern: 'vertical-press' },
  chinups: { movementPattern: 'vertical-pull' },
  'ab-wheel': { movementPattern: 'core-anti-extension' },
  'box-jump': { movementPattern: 'plyometric' },
  'back-squat': { movementPattern: 'squat' },
  'leg-curl-a': { movementPattern: 'isolation-ham' },
  'trap-bar-dl': { movementPattern: 'hinge' },
  'leg-extension': { movementPattern: 'isolation-quad' },
  'hack-squat': { movementPattern: 'squat' },
  'sumo-dl': { movementPattern: 'hinge' },
};

const FACTS_OK = {
  meta: { todayStr: '2026-09-07' },
  goals: { primary: { type: 'fat-loss' }, constraints: { proteinG: 185, sessionMaxMin: 75 } },
  progress: { weight: { validWindow: { ok: true, reasons: [] } } },
  adherence: [{ gym: { pctToDate: 100 } }, { gym: { pctToDate: 100 } }, { gym: { pctToDate: 100 } }, { gym: { pctToDate: 100 } }],
  lifts: {
    'bench-press': { nSessions: 3, daysSinceLast: 6, sessions: [{ topKg: 95 }] },
    'back-squat': { nSessions: 2, daysSinceLast: 0, sessions: [{ topKg: 105 }] },
    ohp: { nSessions: 1, daysSinceLast: 9, sessions: [{ topKg: 55 }] },
    'trap-bar-dl': { nSessions: 2, daysSinceLast: 30, sessions: [{ topKg: 100 }] },
    'barbell-row': { nSessions: 3, daysSinceLast: 6, sessions: [{ topKg: 72.5 }] },
  },
  cardio: { weeks: [{ km: 4.5 }, { km: 5 }, { km: 11 }, { km: 11 }], daysSinceLastRun: 1, z2Ceiling: { bpm: 143, source: 'icuZones' } },
  readiness: { score: { n7: 7, red7: 0, yellow7: 1 } },
  nutrition: { daysLogged14: 12, ea: { daysUnder30: 0 } },
};

const CTX_OK = {
  basedOn: PLAN_OK,
  facts: FACTS_OK,
  variant: 6,
  libraryIds: new Set(Object.keys(LIB)),
  lowerSessionIds: new Set(['lowerA', 'lowerB']),
  exerciseLibrary: LIB,
  block: { index: 1, weeksTotal: 5, isDeload: false },
  bodyweightKg: 85.6,
  goals: FACTS_OK.goals,
  zones: { bpm: 143 },
  todayStr: '2026-09-07',
  decisions: [{ id: 'd1', type: 'progression', what: 'Banca sube a 97,5', why: 'Todas al tope y RPE ≤8', ruleIds: ['STR-001'], evidence: { numbers: { from: 95, to: 97.5 } } }],
  briefing: { priorities: ['Frecuencia de press a 2', 'Z2 estricta', 'Movilidad ≥2'], lastWeek: '', nextWeek: '' },
};

/** Ejecuta el validador y devuelve `[{id, level, text}]`. */
const run = (planOver, ctxOver) => validatePlanVersion(
  planOver ? Object.assign(clone(PLAN_OK), planOver) : clone(PLAN_OK),
  ctxOver ? Object.assign({}, CTX_OK, ctxOver) : CTX_OK,
);
const ids = (res) => res.map(r => r.id);
const pick = (res, id) => res.filter(r => r.id === id);

/** Positivo: el id dispara, con el nivel esperado y con los números en el texto. */
function fires(res, id, level, needles, label) {
  const hits = pick(res, id);
  if (!hits.length) { ok(false, `${label} → ${id} DISPARA`); return; }
  ok(true, `${label} → ${id} dispara`);
  eq(hits[0].level, level, `   nivel ${level}`);
  ok(hits[0].ruleIds.length > 0, `   con Rule IDs (${hits[0].ruleIds.join(', ')})`);
  for (const n of (needles || [])) {
    ok(hits[0].text.indexOf(n) !== -1, `   el texto lleva "${n}"${hits[0].text.indexOf(n) === -1 ? ` — texto: ${hits[0].text}` : ''}`);
  }
}
/** Negativo: el id calla. */
function silent(res, id, label) {
  ok(pick(res, id).length === 0, `${label} → ${id} calla${pick(res, id).length ? ` — disparó: ${pick(res, id)[0].text}` : ''}`);
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('El plan limpio sólo dispara HARD-BUDGET (7,5 sobre 6, informativo)');
// ════════════════════════════════════════════════════════════════════════════════════
const base = run();
eq(ids(base).sort().join(','), 'HARD-BUDGET', 'el ideal real produce exactamente un aviso, y es el del presupuesto');
eq(base[0].level, 'warn', 'y es BLANDO: BUD-001 es informativo');
ok(/7,5/.test(base[0].text), `el texto lleva el número (${base[0].text})`);
// Un template ligero baja el presupuesto: el aviso desaparece.
const light = run({
  weekTemplate: {
    0: { type: 'recovery', subtype: 'mobility' }, 1: { type: 'gym', session: 'lowerA' },
    2: { type: 'gym', session: 'upperA' }, 3: { type: 'run', subtype: 'zone2', durationMin: 40 },
    4: { type: 'rest' }, 5: { type: 'gym', session: 'upperB' }, 6: { type: 'rest' },
  },
  running: { weeklyKmTarget: 5, longRunKm: 5, hardSessions: 0 },
}, { variant: 5 });
silent(light, 'HARD-BUDGET', 'semana ligera (5,5)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H1 · LOAD-JUMP (hard) — STR-001, LOAD-001');
// ════════════════════════════════════════════════════════════════════════════════════
const jump = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { target: { kg: 110, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }), EX.row, EX.facePull, EX.pallof] },
}) });
fires(jump, 'LOAD-JUMP', 'hard', ['95', '110'], 'banca 95 → 110 (+15,8 %)');
const noHist = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, EX.squat, Object.assign({}, EX.legCurl, { target: { kg: 40, reps: '10-12', rpe: '7', source: 'coach', evidence: ['STR-001'] } })] },
}) });
fires(noHist, 'LOAD-JUMP', 'hard', ['40', 'sin ningún top set previo'], 'objetivo sobre un ejercicio sin histórico');
const drop = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { target: { kg: 75, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }), EX.row, EX.facePull, EX.pallof] },
}) });
fires(drop, 'LOAD-JUMP', 'warn', ['95', '75'], 'banca 95 → 75 (−21 %)');
const inRange = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { target: { kg: 97.5, reps: '5-8', rpe: '7-8', source: 'rule', evidence: ['STR-001'] } }), EX.row, EX.facePull, EX.pallof] },
}) });
silent(inRange, 'LOAD-JUMP', 'banca 95 → 97,5 (+2,6 %)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H2 · NO-SOURCE-KG (hard) — GEN-002');
// ════════════════════════════════════════════════════════════════════════════════════
const noSrc = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { target: { kg: 95, reps: '5-8', rpe: '7-8' } }), EX.row, EX.facePull, EX.pallof] },
}) });
fires(noSrc, 'NO-SOURCE-KG', 'hard', ['95', 'ajustar por RPE'], 'kg sin origen ni marca porRPE');
const byRpe = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { target: { kg: 95, reps: '5-8', rpe: '7-8', note: 'ajustar por RPE, sin dato' } }), EX.row, EX.facePull, EX.pallof] },
}) });
silent(byRpe, 'NO-SOURCE-KG', 'el mismo kg marcado "ajustar por RPE"');
silent(inRange, 'NO-SOURCE-KG', 'un target con `source: rule` y evidencia');

// ════════════════════════════════════════════════════════════════════════════════════
sec('EX-UNKNOWN (hard) — SEL-001');
// ════════════════════════════════════════════════════════════════════════════════════
const unknown = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, { id: 'trap-bar-row-9000', name: 'Trap Bar Row', muscle: 'Back', sets: 3, reps: '8-10', rpe: '7' }, EX.abWheel] },
}) });
fires(unknown, 'EX-UNKNOWN', 'hard', ['trap-bar-row-9000'], 'id fuera de la biblioteca');
silent(base, 'EX-UNKNOWN', 'todos los ids del ideal están en la biblioteca');
silent(validatePlanVersion(clone(PLAN_OK), Object.assign({}, CTX_OK, { libraryIds: null })), 'EX-UNKNOWN', 'sin `libraryIds` el chequeo se SALTA (no adivina)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H7 · VOL-CAP (hard) — STR-003, STR-001');
// ════════════════════════════════════════════════════════════════════════════════════
const volMuscle = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { sets: 16 }), EX.row, EX.facePull, EX.pallof] },
}) });
fires(volMuscle, 'VOL-CAP', 'hard', ['Chest', '16', '14'], 'pecho a 16 series/semana');
const volTotal = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { sets: 8 }), Object.assign({}, EX.row, { sets: 8 }), Object.assign({}, EX.facePull, { sets: 6 }), EX.pallof] },
}), }, { facts: Object.assign({}, FACTS_OK, { readiness: { score: { n7: 7, red7: 2, yellow7: 3 } } }) });
fires(volTotal, 'VOL-CAP', 'hard', ['adherencia ≥75 %'], 'volumen total +10 % con una semana en rojo');
const volTotalGated = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { sets: 8 }), Object.assign({}, EX.row, { sets: 8 }), Object.assign({}, EX.facePull, { sets: 6 }), EX.pallof] },
}) });
ok(pick(volTotalGated, 'VOL-CAP').every(x => x.text.indexOf('Volumen total') === -1),
  'con los tres gates cumplidos (adherencia, verde, nutrición) el +10 % total NO avisa');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H3 · DELOAD-VOLUME (hard) — LOAD-004');
// ════════════════════════════════════════════════════════════════════════════════════
const CTX_DELOAD = { isDeload: true, block: { index: 5, weeksTotal: 5, isDeload: true } };
const deloadFull = run({ block: { weekIndex: 5, weeksTotal: 5, phase: 'deload' } }, CTX_DELOAD);
fires(deloadFull, 'DELOAD-VOLUME', 'hard', ['DESCARGA'], 'descarga con el volumen de la semana de carga');
const deloadPlyo = pick(deloadFull, 'DELOAD-VOLUME').find(x => /pliometría/.test(x.text));
ok(!!deloadPlyo, '   y otro aviso por el box jump en descarga');
const deloadOk = run({
  block: { weekIndex: 5, weeksTotal: 5, phase: 'deload' },
  sessions: {
    upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { sets: 2 }), Object.assign({}, EX.row, { sets: 2 }), Object.assign({}, EX.pallof, { sets: 1 })] },
    upperB: { id: 'upperB', name: 'Upper B', exercises: [Object.assign({}, EX.ohp, { sets: 2 }), Object.assign({}, EX.chins, { sets: 2 }), Object.assign({}, EX.abWheel, { sets: 1 })] },
    lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [Object.assign({}, EX.squat, { sets: 2 }), Object.assign({}, EX.legCurl, { sets: 1 })] },
    lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [Object.assign({}, EX.trap, { sets: 2 }), Object.assign({}, EX.abWheel, { sets: 1 })] },
  },
  nutrition: { proteinG: 190, kcalTraining: 3000, kcalRest: 2700, dietBreak: true },
}, CTX_DELOAD);
silent(deloadOk, 'DELOAD-VOLUME', 'descarga de verdad (series al ~40 %, sin plyo, sin duras)');
const phaseWrong = run({ block: { weekIndex: 5, weeksTotal: 5, phase: 'build' } }, CTX_DELOAD);
ok(pick(phaseWrong, 'DELOAD-VOLUME').some(x => /phase/.test(x.text)), 'descarga por calendario marcada `phase: build` → dispara');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H4 · HARD-CARDIO (hard) — END-004, BUD-001');
// ════════════════════════════════════════════════════════════════════════════════════
const twoHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  3: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 35 },
  6: { type: 'run', label: 'Intervalos', subtype: 'intervals', durationMin: 40 },
}) });
fires(twoHard, 'HARD-CARDIO', 'hard', ['2'], 'dos sesiones duras la misma semana');
silent(base, 'HARD-CARDIO', 'el ideal no lleva ninguna dura');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H5 · RUN-BEFORE-LEGS (hard) — INT-001, HYB-002 · la vuelta DOMINGO → LUNES');
// ════════════════════════════════════════════════════════════════════════════════════
const sunHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  0: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 35 },
}) });
fires(sunHard, 'RUN-BEFORE-LEGS', 'hard', ['domingo', 'lunes', 'lowerA'], 'dura el domingo, pierna el lunes');
const midHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  3: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 35 },
}) });
fires(midHard, 'RUN-BEFORE-LEGS', 'hard', ['miércoles', 'jueves'], 'dura el miércoles, pierna el jueves');
const satHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  6: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 40 },
}) });
silent(satHard, 'RUN-BEFORE-LEGS', 'dura el sábado, domingo de recuperación');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H6 · ANCHOR-SWAP (hard) — STR-010, LOAD-003');
// ════════════════════════════════════════════════════════════════════════════════════
const anchorGone = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, { id: 'hack-squat', name: 'Hack Squat', muscle: 'Quads', sets: 4, reps: '8-10', rpe: '7-8', defaultRest: 150 }, EX.legCurl] },
}) });
fires(anchorGone, 'ANCHOR-SWAP', 'hard', ['back-squat'], 'la sentadilla sale y entra hack squat');
const anchorAllowed = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [{ id: 'sumo-dl', name: 'Sumo Deadlift', muscle: 'Hamstrings', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180 }, EX.legExt, EX.abWheel] },
}) });
silent(anchorAllowed, 'ANCHOR-SWAP', 'trap bar ↔ sumo (el par permitido)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H8/G-S1 · KM-JUMP — END-003, LOAD-001');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run({ running: { weeklyKmTarget: 14, longRunKm: 7, hardSessions: 0 } }), 'KM-JUMP', 'hard', ['14', '11'], '14 km sobre un máximo de 11 (×1,2 = 13,2)');
fires(run({ running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 } }), 'KM-JUMP', 'warn', ['12,5', '11'], '12,5 km: por encima del 10 % orientativo');
ok(/heurística prudente NO validada/.test(pick(run({ running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 } }), 'KM-JUMP')[0].text),
  '   y el texto dice que el 10 % es heurística, no evidencia (Buist 2008)');
silent(run({ running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: 0 } }), 'KM-JUMP', '12 km sobre 11 (dentro del tope)');
// Suelo de +1 km: con 8 km la semana pasada (máximo 10), 8,9 km NO avisa aunque sea +11 %.
const FLOOR = { facts: Object.assign({}, FACTS_OK, { cardio: { weeks: [{ km: 10 }, { km: 10 }, { km: 10 }, { km: 8 }], daysSinceLastRun: 2, z2Ceiling: { bpm: 143 } } }) };
silent(run({ running: { weeklyKmTarget: 8.9, longRunKm: 5, hardSessions: 0 } }, FLOOR), 'KM-JUMP', '8 → 8,9 km (el suelo de +1 km absorbe los 900 m)');
fires(run({ running: { weeklyKmTarget: 9.5, longRunKm: 5, hardSessions: 0 } }, FLOOR), 'KM-JUMP', 'warn', ['9,5', '8'], '8 → 9,5 km (por encima de prev + 1 km)');
// Reentrada: 14 días sin correr → tope 8 km, no un porcentaje.
const REENTRY = { facts: Object.assign({}, FACTS_OK, { cardio: { weeks: [{ km: 12 }, { km: 10 }, { km: 0 }, { km: 0 }], daysSinceLastRun: 20, z2Ceiling: { bpm: 143 } } }) };
fires(run({ running: { weeklyKmTarget: 9, longRunKm: 5, hardSessions: 0 } }, REENTRY), 'KM-JUMP', 'hard', ['20 días sin correr', '8 km'], '9 km tras 20 días sin correr');
silent(run({ running: { weeklyKmTarget: 7, longRunKm: 4, hardSessions: 0 } }, REENTRY), 'KM-JUMP', '7 km tras 20 días (dentro del tope de reentrada)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H9 · PROTEIN-FLOOR / KCAL-FLOOR (hard) — REC-001, REC-008');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run({ nutrition: { proteinG: 170, kcalTraining: 2700, kcalRest: 2400, dietBreak: false } }), 'PROTEIN-FLOOR', 'hard', ['170', '185'], 'proteína a 170 g');
silent(base, 'PROTEIN-FLOOR', 'proteína a 190 g');
fires(run(null, { decisions: [{ id: 'n1', type: 'nutrition', what: 'Bajar proteína', why: 'x', ruleIds: ['REC-001'], evidence: { numbers: { proteinG: 150 } } }] }), 'PROTEIN-FLOOR', 'hard', ['150'], 'una DECISIÓN que baja la proteína a 150 g');
fires(run({ nutrition: { proteinG: 190, kcalTraining: 2400, kcalRest: 2400, dietBreak: false } }), 'KCAL-FLOOR', 'hard', ['2400', '2500'], 'día de entreno a 2.400 kcal');
fires(run({ nutrition: { proteinG: 190, kcalTraining: 2700, kcalRest: 2200, dietBreak: false } }), 'KCAL-FLOOR', 'hard', ['2200', '2300'], 'día de descanso a 2.200 kcal');
silent(base, 'KCAL-FLOOR', '2.700 / 2.400');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H10 · DELOAD-DIETBREAK (hard) — REC-005');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run({ block: { weekIndex: 5, weeksTotal: 5, phase: 'deload' } }, CTX_DELOAD), 'DELOAD-DIETBREAK', 'hard', ['sin diet break'], 'descarga sin subir a mantenimiento');
fires(run({ nutrition: { proteinG: 190, kcalTraining: 3000, kcalRest: 2700, dietBreak: true } }), 'DELOAD-DIETBREAK', 'hard', ['Diet break en una semana de carga'], 'diet break en semana de carga');
silent(deloadOk, 'DELOAD-DIETBREAK', 'descarga + diet break juntos');
silent(base, 'DELOAD-DIETBREAK', 'carga + déficit');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H11 · PLYO-PLACEMENT (hard) — ATH-001, INT-004');
// ════════════════════════════════════════════════════════════════════════════════════
const plyoLate = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.squat, EX.legCurl, EX.boxJump] },
}) });
fires(plyoLate, 'PLYO-PLACEMENT', 'hard', ['posición 3'], 'box jump al final de Lower A');
const plyoWrongSession = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.boxJump, EX.bench, EX.row, EX.pallof] },
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.squat, EX.legCurl] },
}) });
fires(plyoWrongSession, 'PLYO-PLACEMENT', 'hard', ['Upper A', 'lowerA'], 'box jump en Upper A');
const plyoVolume = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [Object.assign({}, EX.boxJump, { sets: 6, reps: '15' }), EX.squat, EX.legCurl] },
}) });
fires(plyoVolume, 'PLYO-PLACEMENT', 'hard', ['90', '80'], '90 contactos');
const plyoAfterHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  0: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 35 },
}) });
ok(pick(plyoAfterHard, 'PLYO-PLACEMENT').some(x => /después del cardio duro/.test(x.text)), 'plyo el lunes tras la dura del domingo → dispara');
silent(base, 'PLYO-PLACEMENT', 'box jump primero en Lower A, 15 contactos');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H12 · CORE-PATTERNS (hard) — ATH-003');
// ════════════════════════════════════════════════════════════════════════════════════
const noAR = run({ sessions: {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.bench, EX.row, EX.facePull] },
  upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, EX.chins, EX.abWheel] },
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, EX.squat, EX.legCurl] },
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [EX.trap, EX.legExt] },
} });
fires(noAR, 'CORE-PATTERNS', 'hard', ['anti-rotación'], 'semana sin anti-rotación');
const noAE = run({ sessions: {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.bench, EX.row, EX.pallof] },
  upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, EX.chins] },
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, EX.squat, EX.legCurl] },
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [EX.trap, EX.legExt] },
} });
fires(noAE, 'CORE-PATTERNS', 'hard', ['anti-extensión'], 'semana sin anti-extensión');
silent(base, 'CORE-PATTERNS', 'Pallof + ab wheel en la semana');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H13 · MIN-STRENGTH (hard) — LONG-002');
// ════════════════════════════════════════════════════════════════════════════════════
const oneGym = run({ weekTemplate: {
  0: { type: 'recovery', subtype: 'mobility' }, 1: { type: 'gym', session: 'lowerA' },
  2: { type: 'rest' }, 3: { type: 'run', subtype: 'zone2', durationMin: 40 },
  4: { type: 'rest' }, 5: { type: 'rest' }, 6: { type: 'run', subtype: 'long_easy', durationMin: 50 },
}, running: { weeklyKmTarget: 11, longRunKm: 6, hardSessions: 0 } });
fires(oneGym, 'MIN-STRENGTH', 'hard', ['1', '2'], 'una sola sesión de fuerza');
silent(base, 'MIN-STRENGTH', '4 sesiones de fuerza');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H14 · DECISION-EVIDENCE (hard) — ethos');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run(null, { decisions: [{ id: 'x', type: 'structure', what: 'Quitar el curl', why: 'porque sí', ruleIds: [], evidence: { numbers: { n: 3 } } }] }),
  'DECISION-EVIDENCE', 'hard', ['sin Rule IDs'], 'decisión sin Rule IDs');
fires(run(null, { decisions: [{ id: 'x', type: 'structure', what: 'Quitar el curl', why: 'porque sí', ruleIds: ['STR-010'], evidence: {} }] }),
  'DECISION-EVIDENCE', 'hard', ['sin números'], 'decisión sin números en la evidencia');
silent(base, 'DECISION-EVIDENCE', 'decisión con Rule IDs y números');

// ════════════════════════════════════════════════════════════════════════════════════
sec('SESSION-COUNT (warn) — BUD-001');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run(null, { variant: 4 }), 'SESSION-COUNT', 'warn', ['4', '2'], '4 días de gimnasio con la variante de 4 días (2 de fuerza)');
silent(base, 'SESSION-COUNT', 'la variante 6 permite 4 días de fuerza');
silent(run(null, { variant: null }), 'SESSION-COUNT', 'sin variante en el ctx el chequeo se salta');

// ════════════════════════════════════════════════════════════════════════════════════
sec('EA-GATE (warn) — REC-008');
// ════════════════════════════════════════════════════════════════════════════════════
const lowEa = { facts: Object.assign({}, FACTS_OK, { nutrition: { daysLogged14: 12, ea: { daysUnder30: 5 } } }) };
fires(run({ running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 } }, lowEa), 'EA-GATE', 'warn', ['5 días', 'km'], '5 días con EA <30 y los km suben');
silent(base, 'EA-GATE', 'EA por encima de 30');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S2 · MOBILITY-FLOOR (warn) — ATH-006');
// ════════════════════════════════════════════════════════════════════════════════════
const noMob = run({ sessions: {
  upperA: PLAN_OK.sessions.upperA, upperB: PLAN_OK.sessions.upperB,
  lowerA: { id: 'lowerA', name: 'Lower A', exercises: [EX.boxJump, EX.squat, EX.legCurl] },
  lowerB: { id: 'lowerB', name: 'Lower B', exercises: [EX.trap, EX.legExt, EX.abWheel] },
} });
fires(noMob, 'MOBILITY-FLOOR', 'warn', ['1', '2'], 'sólo el domingo de recuperación, sin movilidad en Lower A/B');
silent(base, 'MOBILITY-FLOOR', 'recuperación + 8\' al final de Lower A y Lower B');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S3 · PRESS-EXPOSURES (warn) — STR-002');
// ════════════════════════════════════════════════════════════════════════════════════
const press3 = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [EX.trap, EX.bench, EX.abWheel] },
}) });
fires(press3, 'PRESS-EXPOSURES', 'warn', ['3', '2', 'W35'], '3 días con empuje en la semana');
silent(base, 'PRESS-EXPOSURES', 'banca en Upper A y OHP en Upper B: 2 exposiciones');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S4 · SESSION-LENGTH (warn)');
// ════════════════════════════════════════════════════════════════════════════════════
const longSession = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [
    Object.assign({}, EX.bench, { sets: 5 }), Object.assign({}, EX.row, { sets: 5 }),
    Object.assign({}, EX.ohp, { sets: 5 }), Object.assign({}, EX.chins, { sets: 5 }),
    Object.assign({}, EX.facePull, { sets: 4 }), EX.pallof,
  ] },
}) });
fires(longSession, 'SESSION-LENGTH', 'warn', ['Upper A', '75'], 'Upper A de 6 ejercicios y 25 series');
silent(base, 'SESSION-LENGTH', 'las cuatro sesiones del ideal caben en 75 min');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S5 · HYBRID-PLUS-LONG (warn) — HYB-002, END-003');
// ════════════════════════════════════════════════════════════════════════════════════
const hybLong = run({
  weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
    6: { type: 'run', label: 'Híbrido trineo + SkiErg', subtype: 'aerobic_circuit', durationMin: 40 },
  }),
  running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 },
});
fires(hybLong, 'HYBRID-PLUS-LONG', 'warn', ['11', '12,5'], 'híbrido el sábado y el largo subiendo');
silent(base, 'HYBRID-PLUS-LONG', 'sin híbrido');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S6 · TARGET-N1 (warn)');
// ════════════════════════════════════════════════════════════════════════════════════
const n1 = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperB: { id: 'upperB', name: 'Upper B', exercises: [Object.assign({}, EX.ohp, { target: { kg: 55, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }), EX.chins, EX.abWheel] },
}) });
fires(n1, 'TARGET-N1', 'warn', ['UNA sola sesión'], 'objetivo de OHP con n=1');
const stale = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [Object.assign({}, EX.trap, { target: { kg: 100, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }), EX.legExt, EX.abWheel] },
}) });
fires(stale, 'TARGET-N1', 'warn', ['30 días', 'reentrada'], 'objetivo de trap bar con el último dato de hace 30 días');
silent(inRange, 'TARGET-N1', 'objetivo de banca con 3 sesiones y 6 días');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S7 · READINESS-N (warn) — READ-004');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run(null, { facts: Object.assign({}, FACTS_OK, { readiness: { score: { n7: 3, red7: 0, yellow7: 1 } } }) }),
  'READINESS-N', 'warn', ['3/7'], 'sólo 3 días de wellness en la semana');
silent(base, 'READINESS-N', '7 días de wellness');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S8 · WEIGHT-WINDOW (warn) — REC-002');
// ════════════════════════════════════════════════════════════════════════════════════
const badWindow = {
  facts: Object.assign({}, FACTS_OK, {
    progress: { weight: { validWindow: { ok: false, reasons: ['sólo 6 pesadas medidas en 14 días (gate: 10)', 'la ventana contiene 1 semana(s) de descarga / diet break + 5 días'] } } },
  }),
};
fires(run({ nutrition: { proteinG: 190, kcalTraining: 2600, kcalRest: 2400, dietBreak: false } }, badWindow),
  'WEIGHT-WINDOW', 'warn', ['6 pesadas', 'descarga'], 'se toca la ingesta con la ventana de peso inválida');
silent(base, 'WEIGHT-WINDOW', 'ventana válida');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S10 · SUMMER-PACE (warn) — ENV-001');
// ════════════════════════════════════════════════════════════════════════════════════
const paceDec = [{ id: 'p1', type: 'running', what: 'Subir el largo', why: 'El ritmo mejora a la misma FC', ruleIds: ['END-003'], evidence: { numbers: { pace: 400 } } }];
fires(run(null, { decisions: paceDec }), 'SUMMER-PACE', 'warn', ['septiembre'], 'progreso por ritmo leído en septiembre');
silent(run(null, { decisions: paceDec, todayStr: '2027-01-11', facts: Object.assign({}, FACTS_OK, { meta: { todayStr: '2027-01-11' } }) }),
  'SUMMER-PACE', 'el mismo texto en enero');
silent(base, 'SUMMER-PACE', 'ninguna decisión habla de ritmo');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S11 · Z2-CEILING (warn)');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run({ running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: 0, z2CeilingBpm: 150 } }), 'Z2-CEILING', 'warn', ['150', '143'], 'el plan dice 150 y las zonas 143');
silent(run({ running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: 0, z2CeilingBpm: 143 } }), 'Z2-CEILING', 'los dos dicen 143');
silent(base, 'Z2-CEILING', 'el plan no declara techo (se salta)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S12 · CHURN / ROTATION (warn) — GEN-001, STR-010');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run(null, { briefing: { priorities: ['a', 'b', 'c', 'd', 'e'] } }), 'CHURN', 'warn', ['5', '3'], '5 prioridades en el briefing');
const churn = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: Object.assign(clone(PLAN_OK.sessions.upperA), { changes: [
    { kind: 'swap', exId: 'face-pull', why: 'a' }, { kind: 'add', exId: 'dips', why: 'b' },
    { kind: 'remove', exId: 'pallof-press', why: 'c' }, { kind: 'reorder', exId: 'bench-press', why: 'd' },
  ] }),
}) }, { block: { index: 3, weeksTotal: 5, isDeload: false } });
ok(pick(churn, 'CHURN').some(x => /cambios estructurales/.test(x.text)), '4 cambios estructurales en una semana → CHURN');
fires(churn, 'ROTATION', 'warn', ['semana 1'], 'swaps fuera de la semana 1 del bloque');
silent(run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: Object.assign(clone(PLAN_OK.sessions.upperA), { changes: [{ kind: 'swap', exId: 'face-pull', why: 'hombro' }] }),
}) }, { block: { index: 1, weeksTotal: 5, isDeload: false } }), 'ROTATION', 'un swap en la semana 1 del bloque');
silent(base, 'CHURN', '3 prioridades y ningún cambio');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S13 · CTL-FOR-STRENGTH (warn) — F-3 / F-2');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run(null, { decisions: [{ id: 'c1', type: 'progression', what: 'Bajar series de banca', why: 'El CTL cayó a 2,4 esta semana', ruleIds: ['STR-003'], evidence: { numbers: { ctl: 2.4 } } }] }),
  'CTL-FOR-STRENGTH', 'warn', ['sólo ve el cardio'], 'decisión de fuerza justificada por CTL');
fires(run(null, { decisions: [{ id: 'c2', type: 'recovery', what: 'Deload reactivo', why: 'rampRate por debajo de −20', ruleIds: ['LOAD-004'], evidence: { numbers: { rampRate: -0.3 } } }] }),
  'CTL-FOR-STRENGTH', 'warn', ['rampRate` no es la forma'], 'descarga justificada por rampRate');
silent(base, 'CTL-FOR-STRENGTH', 'la decisión se apoya en RPE y top set');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S14 · WEEK-SUMMARY (warn) — el contrato v2, v11.65');
// ════════════════════════════════════════════════════════════════════════════════════
// El fallo que impide: que el coach entregue una semana con sesiones sin motivo. El contrato
// v2 obliga a UNA FILA POR CADA SESIÓN, también las que no cambian — es la mitad "por qué
// sigue igual" de la petición de Julian. Sin este aviso, una sesión sin fila desaparece de la
// Home en silencio y la rutina vuelve a cambiar (o a no cambiar) sin explicación.
{
  const conBrief = (rows) => Object.assign(clone(PLAN_OK), {
    coachBrief: { focus: 'f', phase: 'build', whyKept: 'k', whyChanged: '', weekSummary: rows },
  });
  const todas = ['upperA', 'upperB', 'lowerA', 'lowerB']
    .map((sid) => ({ sessionId: sid, status: 'kept', line: 'sin cambios' }));
  fires(validatePlanVersion(conBrief(todas.slice(0, 3)), CTX_OK), 'WEEK-SUMMARY', 'warn',
    ['Lower B'], 'una sesión del plan sin fila en weekSummary');
  eq(pick(validatePlanVersion(conBrief([]), CTX_OK), 'WEEK-SUMMARY').length, 4,
    'con el resumen vacío, un aviso por cada sesión');
  silent(validatePlanVersion(conBrief(todas), CTX_OK), 'WEEK-SUMMARY', 'con todas las filas');
  // Un plan de la semilla o del usuario no lleva brief: avisar ahí sería ruido en cada
  // `setIdealVariant`, que crea una versión sin pasar por el coach.
  silent(base, 'WEEK-SUMMARY', 'un plan sin coachBrief no dice nada');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('El catálogo de ids: 33 y ni uno suelto');
// ════════════════════════════════════════════════════════════════════════════════════
// Cuenta los ids que el validador puede emitir, leyendo su propio fuente. Sirve para dos
// cosas: que añadir un aviso obligue a mirar esta línea (y a traducirlo en `COACH_GUARD_ES`),
// y que borrar uno no pase inadvertido. Eran 32 hasta v11.64; WEEK-SUMMARY hace 33.
{
  const src = readFileSync('app/coach-facts.js', 'utf8');
  const i = src.indexOf('function validatePlanVersion(');
  const j = src.indexOf('// ---------- helpers del validador ----------');
  const cuerpo = src.slice(i, j);
  const emitidos = new Set([
    ...[...cuerpo.matchAll(/add\('([A-Z0-9-]+)'/g)].map(m => m[1]),
    ...[...cuerpo.matchAll(/out\.push\(\{ id: '([A-Z0-9-]+)'/g)].map(m => m[1]),
  ]);
  eq(emitidos.size, 33, `el validador emite 33 ids distintos (${[...emitidos].sort().join(', ')})`);
  ok(emitidos.has('WEEK-SUMMARY'), 'y WEEK-SUMMARY es el nuevo');
  // Todos traducidos en la pantalla: un id crudo en un chip no se entiende.
  const coachjs = readFileSync('app/coach.js', 'utf8');
  const sinTraducir = [...emitidos].filter(id => !new RegExp(`'${id}':|\\b${id}:`).test(coachjs));
  eq(sinTraducir.join(', ') || 'ninguno', 'ninguno', 'y todos tienen etiqueta en COACH_GUARD_ES');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('Nada bloquea y nada revienta');
// ════════════════════════════════════════════════════════════════════════════════════
ok(run().every(r => r.level === 'hard' || r.level === 'warn'), 'todos los avisos son `hard` o `warn`: no existe un nivel que bloquee');
ok(run().every(r => typeof r.text === 'string' && r.text.length > 10), 'todos llevan un texto legible en castellano');
const empties = [
  ['plan y ctx vacíos', () => validatePlanVersion({}, {})],
  ['plan y ctx nulos', () => validatePlanVersion(null, null)],
  ['sin ctx', () => validatePlanVersion(clone(PLAN_OK))],
  ['sin facts', () => validatePlanVersion(clone(PLAN_OK), { libraryIds: null })],
  ['sin sessions', () => validatePlanVersion({ weekTemplate: PLAN_OK.weekTemplate }, CTX_OK)],
  ['sin weekTemplate', () => validatePlanVersion({ sessions: PLAN_OK.sessions }, CTX_OK)],
  ['basura', () => validatePlanVersion({ sessions: { x: { exercises: [null, { id: null }] } }, weekTemplate: { 1: null } }, { libraryIds: [] })],
];
for (const [label, fn] of empties) {
  let res = null, threw = null;
  try { res = fn(); } catch (e) { threw = e; }
  ok(!threw && Array.isArray(res), `${label} → devuelve un array sin lanzar${threw ? ` — lanzó: ${threw.message}` : ''}`);
  if (res) ok(res.every(r => r.id !== 'VALIDATOR-ERROR'), `   y sin VALIDATOR-ERROR`);
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('diffPlanVersions');
// ════════════════════════════════════════════════════════════════════════════════════
const same = diffPlanVersions(clone(PLAN_OK), clone(PLAN_OK));
eq(same.structural, 0, 'dos planes idénticos → structural 0');
eq(same.weekTemplate.length, 0, 'sin cambios de template');
eq(Object.keys(same.sessions).length, 0, 'sin cambios de sesión');
eq(same.running, null, 'sin cambios de running');

const b2 = clone(PLAN_OK);
b2.sessions.upperA.exercises = [EX.bench, EX.row, EX.pallof];                 // fuera face-pull
b2.sessions.upperB.exercises[0] = Object.assign({}, EX.ohp, { sets: 3 });     // OHP 4 → 3 series
b2.weekTemplate[3] = { type: 'run', label: 'Cardio Z2', subtype: 'zone2', durationMin: 45 };
b2.running = { weeklyKmTarget: 13, longRunKm: 7, hardSessions: 0 };
const d2 = diffPlanVersions(PLAN_OK, b2);
eq(d2.sessions.upperA.removed.join(','), 'face-pull', 'detecta el ejercicio quitado');
eq(d2.sessions.upperB.setsChanged[0].from, 4, 'detecta las series que cambian (de 4…)');
eq(d2.sessions.upperB.setsChanged[0].to, 3, '…a 3)');
eq(d2.weekTemplate.length, 1, 'detecta el día de template que cambió');
eq(d2.weekTemplate[0].dow, 3, 'y dice cuál');
ok(!!d2.running, 'detecta el cambio de running');
eq(d2.structural, 4, 'structural = 1 quitado + 1 setsChanged + 1 template + 1 running');

// Un cambio de kg NO es estructural: la progresión normal no puede parecer churn.
const b3 = clone(PLAN_OK);
b3.sessions.upperA.exercises[0] = Object.assign({}, EX.bench, { target: { kg: 97.5, reps: '5-8', rpe: '7-8', source: 'rule' } });
const d3 = diffPlanVersions(PLAN_OK, b3);
eq(d3.structural, 0, 'sólo cambia un objetivo de kg → structural 0');
eq(d3.sessions.upperA.targets[0].toKg, 97.5, 'pero el diff de objetivos sí lo recoge');
eq(d3.sessions.upperA.targets[0].fromKg, null, 'y dice que antes no había objetivo');

// ════════════════════════════════════════════════════════════════════════════════════
sec('mergeProposal · lo no tocado se copia byte a byte, el warmup se va');
// ════════════════════════════════════════════════════════════════════════════════════
const proposal = {
  label: 'W37 · coach',
  phase: 'build',
  sessions: [{
    id: 'upperB', focus: 'El OHP mantiene 55. Las dominadas suben.',
    warmup: ['calentamiento inventado por el modelo'],
    exercises: [
      Object.assign({}, EX.ohp, { target: { kg: 55, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }),
      Object.assign({}, EX.chins, { target: { kg: 5, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }),
      EX.abWheel,
    ],
    changes: [{ kind: 'sets', exId: 'chinups', why: 'Subió el lastre', decisionId: 'd9' }],
  }],
  cardio: [{ dow: 3, subtype: 'zone2', durationMin: 45, distanceKm: 5.5, note: 'FC media ≤143' }],
  running: { weeklyKmTarget: 12.5, longRunKm: 6.5, hardSessions: 0 },
  weekTemplateChanges: [{ dow: 0, slot: { type: 'recovery', label: 'Movilidad + cintura', subtype: 'mobility', z2FinisherMin: 20 } }],
};
const merged = mergeProposal(PLAN_OK, proposal);
for (const sid of ['upperA', 'lowerA', 'lowerB']) {
  eq(JSON.stringify(merged.sessions[sid]), JSON.stringify(PLAN_OK.sessions[sid]), `${sid} (no tocada) sale JSON-idéntica`);
}
eq(merged.touched.join(','), 'upperB', 'sólo upperB queda marcada como tocada');
ok(merged.sessions.upperB.warmup === undefined, 'a upperB se le QUITA el warmup (cae a PLAN.sessions[id].warmup, que sí recibe los fixes por PLAN_REV)');
eq(merged.strippedWarmup.join(','), 'upperB', 'y se dice de qué sesión se quitó');
ok(!!PLAN_OK.sessions.upperB.warmup, 'el plan activo original NO se muta: sigue con su warmup');
eq(merged.sessions.upperB.focus, 'El OHP mantiene 55. Las dominadas suben.', 'el focus del coach entra');
eq(merged.sessions.upperB.name, 'Upper B', 'y el nombre de la sesión se conserva del plan activo');
eq(merged.weekTemplate[3].cardio.durationMin, 45, 'cardio[] aterriza en weekTemplate[dow].cardio');
eq(merged.weekTemplate[3].cardio.distanceKm, 5.5, 'con su distancia');
eq(merged.weekTemplate[3].cardio.source, 'coach', 'marcado `source: coach` (coach > regla > base)');
eq(merged.weekTemplate[3].durationMin, 40, 'y la duración BASE del slot no se pisa: la progresión es una función sobre ella');
eq(merged.weekTemplate[0].label, 'Movilidad + cintura', 'weekTemplateChanges se aplica');
eq(merged.running.weeklyKmTarget, 12.5, 'running del coach');
eq(merged.label, 'W37 · coach', 'label del coach');
ok(PLAN_OK.weekTemplate[0].label === 'Recuperación activa', 'el weekTemplate del plan activo tampoco se muta');
// El resultado mergeado tiene que poder validarse tal cual.
const mergedRes = validatePlanVersion(Object.assign({ block: PLAN_OK.block, nutrition: PLAN_OK.nutrition }, merged), CTX_OK);
ok(Array.isArray(mergedRes), 'el plan mergeado pasa por el validador sin lanzar');
silent(mergedRes, 'NO-SOURCE-KG', 'los objetivos del coach traen evidencia');

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
