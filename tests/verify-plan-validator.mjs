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
sec('El plan limpio: HARD-BUDGET (7,5 sobre 6) y el suelo de series de una semana de 4 sesiones');
// ════════════════════════════════════════════════════════════════════════════════════
// Hasta v11.70 este fixture disparaba UN aviso. Desde v11.71 dispara dos ids: `HARD-BUDGET` y
// `VOL-FLOOR` (F-7), y el segundo también es un HECHO del plan, no un defecto del test — la
// semana ideal de 4 sesiones deja pecho en 4 series, hombro en 4, cadena posterior en 7 y
// cuádriceps en 7, todos por debajo del 10 que STR-003 declara como suelo en déficit. Que nadie
// lo dijera durante meses es exactamente lo que la auditoría del 09-sep fue a buscar: el
// validador tenía el techo (14) y no el suelo, así que "no pasarse" pasaba por "estar bien".
const base = run();
eq([...new Set(ids(base))].sort().join(','), 'HARD-BUDGET,VOL-FLOOR', 'el ideal real produce dos ids: presupuesto y suelo de series');
ok(base.every(r => r.level === 'warn'), 'y los dos son BLANDOS: BUD-001 es informativo y el suelo se discute, no bloquea');
const budget = pick(base, 'HARD-BUDGET')[0];
ok(/7\.5/.test(budget.text), `el texto del presupuesto lleva el número (${budget.text})`);
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
fires(noHist, 'LOAD-JUMP', 'hard', ['40', 'no previous top set'], 'objetivo sobre un ejercicio sin histórico');
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
fires(noSrc, 'NO-SOURCE-KG', 'hard', ['95', 'adjust by RPE'], 'kg sin origen ni marca porRPE');
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
fires(volTotal, 'VOL-CAP', 'hard', ['adherence ≥75 %'], 'volumen total +10 % con una semana en rojo');
const volTotalGated = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { sets: 8 }), Object.assign({}, EX.row, { sets: 8 }), Object.assign({}, EX.facePull, { sets: 6 }), EX.pallof] },
}) });
ok(pick(volTotalGated, 'VOL-CAP').every(x => x.text.indexOf('Volumen total') === -1),
  'con los tres gates cumplidos (adherencia, verde, nutrición) el +10 % total NO avisa');

// ════════════════════════════════════════════════════════════════════════════════════
sec('F-7 · VOL-FLOOR (warn) — STR-003: el SUELO de series, no sólo el techo');
// ════════════════════════════════════════════════════════════════════════════════════
// EL FALLO QUE ESTE BLOQUE IMPIDE. STR-003 dice 10-14 series/músculo/semana en déficit y el
// validador sólo miraba el 14. Un plan podía dejar el hombro en 4 series y la cadena posterior
// repartida en tres etiquetas (`Hamstrings` 3 + `Posterior` 4 + `Glutes` 4) sin que nada dijera
// nada: por debajo del suelo el músculo no se mantiene, se visita — y en déficit ahí es donde se
// va la masa magra, que es el objetivo #2 declarado.
{
  const volFloor = pick(base, 'VOL-FLOOR');
  ok(volFloor.length > 0, 'el ideal de 4 sesiones dispara el suelo');
  ok(volFloor.every(r => r.level === 'warn'), 'y siempre BLANDO: se discute, no bloquea');
  const chest = volFloor.find(r => /^Chest/.test(r.text));
  ok(!!chest, 'pecho, con 4 series/semana, está entre los avisados');
  if (chest) {
    for (const n of ['Chest', '4 sets/week', '10']) {
      ok(chest.text.indexOf(n) !== -1, `   el texto lleva "${n}" — ${chest.text}`);
    }
    eq(chest.ruleIds.join(','), 'STR-003,STR-001', '   y cita STR-003 (el que declara el 10-14)');
  }
  // Ni pliometría ni core tienen suelo: ATH-003 gobierna el core por PATRÓN (anti-rotación /
  // anti-extensión), no por series, y el box jump no es volumen de hipertrofia (L-1, v11.70).
  ok(!volFloor.some(r => /^Power/.test(r.text)), "la fila 'Power' nunca tiene suelo");
  ok(!volFloor.some(r => /^Core/.test(r.text)), "ni 'Core': lo gobierna ATH-003 por patrón");
  ok(!volFloor.some(r => /^otros/.test(r.text)), "ni 'otros', que es 'la semilla no dijo músculo'");

  // La cadena posterior, agregada: 3 + 4 + 4 = 11 series, por encima del suelo. Sin la fusión
  // saldrían TRES avisos por debajo de 10 sobre un estímulo que está bien dosificado.
  const post = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
    lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, EX.squat, Object.assign({}, EX.legCurl, { muscle: 'Hamstrings', sets: 3 })] },
    lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [Object.assign({}, EX.trap, { muscle: 'Posterior', sets: 4 }), EX.legExt, EX.abWheel, Object.assign({}, EX.legCurl, { muscle: 'Glutes', sets: 4 })] },
  }) });
  ok(!pick(post, 'VOL-FLOOR').some(r => /^Posterior chain:/.test(r.text)),
    `la cadena posterior agregada (11 series) NO avisa — avisan: ${pick(post, 'VOL-FLOOR').map(r => r.text.split(':')[0]).join(', ')}`);
  ok(!pick(post, 'VOL-FLOOR').some(r => /^(Hamstrings|Glutes|Posterior):/.test(r.text)),
    'y ninguna de las tres etiquetas sueltas avisa por su cuenta');

  // Por encima del suelo, silencio.
  const chestOk = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
    upperA: { id: 'upperA', name: 'Upper A', exercises: [Object.assign({}, EX.bench, { sets: 10 }), EX.row, EX.facePull, EX.pallof] },
  }) });
  ok(!pick(chestOk, 'VOL-FLOOR').some(r => /^Chest/.test(r.text)), 'pecho con 10 series exactas: en el suelo, no por debajo');

  // Las dos puertas: variante <4 y mantenimiento.
  silent(run(null, { variant: 3 }), 'VOL-FLOOR',
    'variante de 3 días (10 series/familia es aritméticamente imposible)');
  silent(run(null, { goals: { primary: { type: 'maintenance' }, constraints: { proteinG: 185 } } }), 'VOL-FLOOR',
    'fuera de déficit (el 10-14 de STR-003 es el rango del déficit)');
  eq(F.VP_MIN_SETS_PER_MUSCLE, 10, 'el suelo está declarado como constante exportada');
  eq(F.VP_POSTERIOR_FAMILY, 'Posterior chain', 'y el nombre de la familia agregada también');
  eq(F._vpMuscleFamily('Glutes'), 'Posterior chain', '_vpMuscleFamily fusiona Glutes…');
  eq(F._vpMuscleFamily('hamstrings'), 'Posterior chain', '…y Hamstrings sin importar mayúsculas');
  eq(F._vpMuscleFamily('Chest'), 'Chest', 'y deja el resto como está');
  eq(F._vpFamilyHasFloor('Power'), false, '_vpFamilyHasFloor: Power no');
  eq(F._vpFamilyHasFloor('Chest'), true, '   Chest sí');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('F-5 · RECOMP-HOLD (warn) — REC-002/REC-008: la báscula veta el recorte');
// ════════════════════════════════════════════════════════════════════════════════════
// EL FALLO QUE ESTE BLOQUE IMPIDE. El piloto del déficit lee la pendiente del PESO. Con el peso
// plano, la grasa bajando y la magra aguantando —que es literalmente el objetivo #1 cumpliéndose—
// el piloto leía "estancamiento" y recortaba kcal. Cambiar lo que funciona por un artefacto de la
// balanza es la forma más cara de perder masa magra, y el dato para no hacerlo llevaba en el pack
// desde v11.69 (`trajectory.weight.scale`) sin ningún consumidor ejecutable.
{
  const SCALE_RECOMP = { date: '2026-09-06', deltaFrom: '2026-08-10', fatMassKgDelta28d: -0.9, ffmKgDelta28d: -0.1 };
  const factsWith = (scale) => Object.assign({}, FACTS_OK, { trajectory: { weight: { scale } } });
  const DEC_LOWER = [{ id: 'n1', type: 'nutrition', what: 'Lower training-day kcal', why: 'Weight flat for two weeks', ruleIds: ['REC-002'], evidence: { numbers: { kcalTraining: 2550 } } }];

  const recomp = run(null, { facts: factsWith(SCALE_RECOMP), decisions: DEC_LOWER });
  fires(recomp, 'RECOMP-HOLD', 'warn', ['2700', '2550', 'RECOMPOSITION', '-0.9'],
    'grasa −0,9 kg con FFM −0,1 kg en 27 días y una decisión que baja las kcal');
  ok(pick(recomp, 'RECOMP-HOLD')[0].text.indexOf('EXPENDITURE') !== -1,
    '   y dice cuál es la palanca que sí existe: el gasto');
  eq(pick(recomp, 'RECOMP-HOLD')[0].ruleIds.join(','), 'REC-002,REC-008', '   con las reglas del piloto');

  // El texto también cuenta: una decisión sin números que dice que recorta.
  const porTexto = run(null, {
    facts: factsWith(SCALE_RECOMP),
    decisions: [{ id: 'n2', type: 'nutrition', what: 'Cut intake by 150 kcal', why: 'Slope flat', ruleIds: ['REC-002'], evidence: { numbers: { weeks: 2 } } }],
  });
  fires(porTexto, 'RECOMP-HOLD', 'warn', ['RECOMPOSITION'], 'una decisión que lo dice con palabras');

  // Los tres requisitos, uno a uno. Ninguno se rellena.
  silent(run(null, { facts: factsWith(Object.assign({}, SCALE_RECOMP, { fatMassKgDelta28d: -0.2 })), decisions: DEC_LOWER }),
    'RECOMP-HOLD', 'grasa que sólo baja 0,2 kg (bajo el umbral de 0,5)');
  silent(run(null, { facts: factsWith(Object.assign({}, SCALE_RECOMP, { ffmKgDelta28d: -0.8 })), decisions: DEC_LOWER }),
    'RECOMP-HOLD', 'FFM cayendo 0,8 kg: eso NO es recomposición, y el recorte puede ser correcto');
  silent(run(null, { facts: factsWith(Object.assign({}, SCALE_RECOMP, { deltaFrom: '2026-08-25' })), decisions: DEC_LOWER }),
    'RECOMP-HOLD', '12 días entre lecturas (<21): la bioimpedancia no separa tendencia de agua');
  silent(run(null, { facts: factsWith(null), decisions: DEC_LOWER }),
    'RECOMP-HOLD', 'sin báscula de composición no hay veto que aplicar');

  // Subir kcal con la misma señal no se toca: el veto es DIRECCIONAL.
  silent(run(null, {
    facts: factsWith(SCALE_RECOMP),
    decisions: [{ id: 'n3', type: 'nutrition', what: 'Raise training-day kcal', why: 'Losing too fast', ruleIds: ['REC-002'], evidence: { numbers: { kcalTraining: 2850 } } }],
  }), 'RECOMP-HOLD', 'una decisión que SUBE las kcal');
  // Y una decisión que no es de nutrición tampoco.
  silent(run(null, { facts: factsWith(SCALE_RECOMP) }), 'RECOMP-HOLD', 'sin decisiones de nutrición');
  eq(F.VP_RECOMP_FAT_DROP_KG, -0.5, 'el umbral de grasa está declarado (−0,5 kg)');
  eq(F.VP_RECOMP_FFM_HOLD_KG, -0.3, 'el de FFM también (−0,3 kg)');
  eq(F.VP_RECOMP_MIN_SPAN_DAYS, 21, 'y el span mínimo entre lecturas (21 días)');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H3 · DELOAD-VOLUME (hard) — LOAD-004');
// ════════════════════════════════════════════════════════════════════════════════════
const CTX_DELOAD = { isDeload: true, block: { index: 5, weeksTotal: 5, isDeload: true } };
const deloadFull = run({ block: { weekIndex: 5, weeksTotal: 5, phase: 'deload' } }, CTX_DELOAD);
fires(deloadFull, 'DELOAD-VOLUME', 'hard', ['DELOAD week'], 'descarga con el volumen de la semana de carga');
const deloadPlyo = pick(deloadFull, 'DELOAD-VOLUME').find(x => /plyometrics/.test(x.text));
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
fires(sunHard, 'RUN-BEFORE-LEGS', 'hard', ['Sunday', 'Monday', 'lowerA'], 'dura el domingo, pierna el lunes');
const midHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  3: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 35 },
}) });
fires(midHard, 'RUN-BEFORE-LEGS', 'hard', ['Wednesday', 'Thursday'], 'dura el miércoles, pierna el jueves');
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
fires(run({ running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 } }), 'KM-JUMP', 'warn', ['12.5', '11'], '12,5 km: por encima del 10 % orientativo');
ok(/prudent heuristic and NOT validated/.test(pick(run({ running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 } }), 'KM-JUMP')[0].text),
  '   y el texto dice que el 10 % es heurística, no evidencia (Buist 2008)');
silent(run({ running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: 0 } }), 'KM-JUMP', '12 km sobre 11 (dentro del tope)');
// Suelo de +1 km: con 8 km la semana pasada (máximo 10), 8,9 km NO avisa aunque sea +11 %.
const FLOOR = { facts: Object.assign({}, FACTS_OK, { cardio: { weeks: [{ km: 10 }, { km: 10 }, { km: 10 }, { km: 8 }], daysSinceLastRun: 2, z2Ceiling: { bpm: 143 } } }) };
silent(run({ running: { weeklyKmTarget: 8.9, longRunKm: 5, hardSessions: 0 } }, FLOOR), 'KM-JUMP', '8 → 8,9 km (el suelo de +1 km absorbe los 900 m)');
fires(run({ running: { weeklyKmTarget: 9.5, longRunKm: 5, hardSessions: 0 } }, FLOOR), 'KM-JUMP', 'warn', ['9.5', '8'], '8 → 9,5 km (por encima de prev + 1 km)');
// Reentrada: 14 días sin correr → tope 8 km, no un porcentaje.
const REENTRY = { facts: Object.assign({}, FACTS_OK, { cardio: { weeks: [{ km: 12 }, { km: 10 }, { km: 0 }, { km: 0 }], daysSinceLastRun: 20, z2Ceiling: { bpm: 143 } } }) };
fires(run({ running: { weeklyKmTarget: 9, longRunKm: 5, hardSessions: 0 } }, REENTRY), 'KM-JUMP', 'hard', ['20 days without running', '8 km'], '9 km tras 20 días sin correr');
silent(run({ running: { weeklyKmTarget: 7, longRunKm: 4, hardSessions: 0 } }, REENTRY), 'KM-JUMP', '7 km tras 20 días (dentro del tope de reentrada)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H9 · PROTEIN-FLOOR / KCAL-FLOOR (hard) — REC-001, REC-008');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run({ nutrition: { proteinG: 170, kcalTraining: 2700, kcalRest: 2400, dietBreak: false } }), 'PROTEIN-FLOOR', 'hard', ['170', '185'], 'proteína a 170 g');
silent(base, 'PROTEIN-FLOOR', 'proteína a 190 g');
fires(run(null, { decisions: [{ id: 'n1', type: 'nutrition', what: 'Bajar proteína', why: 'x', ruleIds: ['REC-001'], evidence: { numbers: { proteinG: 150 } } }] }), 'PROTEIN-FLOOR', 'hard', ['150'], 'una DECISIÓN que baja la proteína a 150 g');
// R-1 (2026-09-08): los suelos son 2.700 / 2.400, no 2.500 / 2.300. El suelo viejo dejaba la EA
// en ~27 kcal/kg FFM y REC-008 marca 30 — contradecía la regla que lo justificaba.
fires(run({ nutrition: { proteinG: 190, kcalTraining: 2600, kcalRest: 2400, dietBreak: false } }), 'KCAL-FLOOR', 'hard', ['2600', '2700'], 'día de entreno a 2.600 kcal (pasaba con el suelo viejo)');
fires(run({ nutrition: { proteinG: 190, kcalTraining: 2700, kcalRest: 2350, dietBreak: false } }), 'KCAL-FLOOR', 'hard', ['2350', '2400'], 'día de descanso a 2.350 kcal (pasaba con el suelo viejo)');
silent(base, 'KCAL-FLOOR', '2.700 / 2.400 exactos: el plan ideal está justo en el suelo');
eq(F.VP_FLOORS.kcalTraining, 2700, 'VP_FLOORS.kcalTraining = 2700 (R-1)');
eq(F.VP_FLOORS.kcalRest, 2400, 'VP_FLOORS.kcalRest = 2400 (R-1)');
// PROTEIN-FLOOR, aviso BLANDO nuevo: tocar la ingesta en déficit sin decir nada de la proteína.
fires(run({ nutrition: { kcalTraining: 2700, kcalRest: 2400, dietBreak: false } },
  { decisions: [{ id: 'n2', type: 'nutrition', what: 'Bajar 150 kcal', why: 'pendiente −0,15', ruleIds: ['REC-002'], evidence: { numbers: { slope: -0.15 } } }] }),
  'PROTEIN-FLOOR', 'warn', ['185'], 'se toca la ingesta en déficit y la propuesta no menciona proteína');
silent(base, 'PROTEIN-FLOOR', 'la cabecera declara 190 g');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S15 · DELOAD-DIETBREAK (warn desde 2026-09-08) — REC-005');
// ════════════════════════════════════════════════════════════════════════════════════
// R-7: era DURO sobre REC-005, `weak_extrapolated`, cuyo propio texto dice que el diet break
// alineado con el deload mejora la EFICIENCIA de la pérdida y NO preserva más masa magra. Una
// regla dura sobre esa base es certeza prestada, que es el patrón que la auditoría fue a buscar.
fires(run({ block: { weekIndex: 5, weeksTotal: 5, phase: 'deload' } }, CTX_DELOAD), 'DELOAD-DIETBREAK', 'warn', ['without a diet break', 'weak_extrapolated'], 'descarga sin subir a mantenimiento');
fires(run({ nutrition: { proteinG: 190, kcalTraining: 3000, kcalRest: 2700, dietBreak: true } }), 'DELOAD-DIETBREAK', 'warn', ['Diet break in a loading week'], 'diet break en semana de carga');
silent(deloadOk, 'DELOAD-DIETBREAK', 'descarga + diet break juntos');
silent(base, 'DELOAD-DIETBREAK', 'carga + déficit');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H10 · PLYO-PLACEMENT (hard, INT-004) / G-S16 · PLYO-CONTACTS (warn, ATH-001)');
// ════════════════════════════════════════════════════════════════════════════════════
const plyoLate = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.squat, EX.legCurl, EX.boxJump] },
}) });
fires(plyoLate, 'PLYO-PLACEMENT', 'hard', ['position 3'], 'box jump al final de Lower A');
const plyoWrongSession = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.boxJump, EX.bench, EX.row, EX.pallof] },
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.squat, EX.legCurl] },
}) });
fires(plyoWrongSession, 'PLYO-PLACEMENT', 'hard', ['Upper A', 'lowerA'], 'box jump en Upper A');
const plyoVolume = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [Object.assign({}, EX.boxJump, { sets: 6, reps: '15' }), EX.squat, EX.legCurl] },
}) });
// R-7: la COLOCACIÓN sigue dura (INT-004, `strong`: el plyo no va después de aeróbico ni con
// fatiga previa). El NÚMERO 80 baja a blando y a su propio id: el caveat de ATH-001 dice que "la
// dosis baja es óptima" NO está soportado — la dosis-respuesta favorece MÁS volumen — y aquí la
// dosis baja es mantenimiento de potencia en déficit y prudencia lumbar, no un óptimo.
fires(plyoVolume, 'PLYO-CONTACTS', 'warn', ['90', '80', 'is NOT supported'], '90 contactos');
silent(plyoVolume, 'PLYO-PLACEMENT', 'y el box jump sigue primero en Lower A: la colocación no se toca');
silent(base, 'PLYO-CONTACTS', '15 contactos');
const plyoAfterHard = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  0: { type: 'run', label: 'Umbral', subtype: 'threshold', durationMin: 35 },
}) });
ok(pick(plyoAfterHard, 'PLYO-PLACEMENT').some(x => /right after the hard cardio/.test(x.text)), 'plyo el lunes tras la dura del domingo → dispara');
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
fires(noAR, 'CORE-PATTERNS', 'hard', ['anti-rotation'], 'semana sin anti-rotación');
const noAE = run({ sessions: {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.bench, EX.row, EX.pallof] },
  upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, EX.chins] },
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, EX.squat, EX.legCurl] },
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [EX.trap, EX.legExt] },
} });
fires(noAE, 'CORE-PATTERNS', 'hard', ['anti-extension'], 'semana sin anti-extensión');
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
  'DECISION-EVIDENCE', 'hard', ['with no Rule IDs'], 'decisión sin Rule IDs');
fires(run(null, { decisions: [{ id: 'x', type: 'structure', what: 'Quitar el curl', why: 'porque sí', ruleIds: ['STR-010'], evidence: {} }] }),
  'DECISION-EVIDENCE', 'hard', ['with no numbers'], 'decisión sin números en la evidencia');
silent(base, 'DECISION-EVIDENCE', 'decisión con Rule IDs y números');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H13 · SESSION-COUNT (hard desde 2026-09-08) — BUD-001, LONG-002');
// ════════════════════════════════════════════════════════════════════════════════════
// EL CASO DE LA AUDITORÍA (E-14a): "añade un sexto día de gym" en la nota del usuario no lo
// paraba nadie. Era BLANDO y además se SALTABA entero sin `ctx.variant`, así que el camino más
// probable —la app sin variante elegida— era el que no tenía red.
const SIX_DAYS = {
  weekTemplate: {
    0: { type: 'gym', session: 'upperA' }, 1: { type: 'gym', session: 'lowerA' },
    2: { type: 'gym', session: 'upperA' }, 3: { type: 'gym', session: 'lowerB' },
    4: { type: 'gym', session: 'upperB' }, 5: { type: 'gym', session: 'lowerA' },
    6: { type: 'run', label: 'Cardio Z2', subtype: 'zone2', durationMin: 50 },
  },
};
fires(run(SIX_DAYS, { variant: 4 }), 'SESSION-COUNT', 'hard', ['6', '5'], '6 días de fuerza con la variante 4');
fires(run(SIX_DAYS, { variant: null }), 'SESSION-COUNT', 'hard', ['6', '5'], '6 días de fuerza SIN variante (antes se saltaba el chequeo)');
fires(run(SIX_DAYS, { variant: 6 }), 'SESSION-COUNT', 'hard', ['6', '5'], '6 días de fuerza incluso con la variante 6: el techo absoluto son 5');
// El blando sigue vivo por debajo del techo: 4 días con la variante de 4 (2 de fuerza).
fires(run(null, { variant: 4 }), 'SESSION-COUNT', 'warn', ['4', '2'], '4 días de gimnasio con la variante de 4 días (2 de fuerza)');
silent(base, 'SESSION-COUNT', 'la variante 6 permite 4 días de fuerza');
silent(run(null, { variant: null }), 'SESSION-COUNT', 'sin variante, 4 días están por debajo del techo de 5');
eq(F.VP_MAX_STRENGTH_DAYS, 5, 'VP_MAX_STRENGTH_DAYS = 5');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H5 · el largo de ≥10 km y `running.hardSessions[]` cuentan como dura (E-14b)');
// ════════════════════════════════════════════════════════════════════════════════════
// Lo que se colaba: `_vpSlotIsHardCardio` sólo miraba el subtipo, así que un largo de 12 km el
// domingo delante de la pierna del lunes era invisible — y 10 km es justo el objetivo del bloque,
// de modo que "el largo del hito" era el caso más probable de todos.
const longSun = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  0: { type: 'run', label: 'Largo fácil', subtype: 'long_easy', durationMin: 80, cardio: { subtype: 'long_easy', durationMin: 80, distanceKm: 12 } },
}) });
fires(longSun, 'RUN-BEFORE-LEGS', 'hard', ['Sunday', 'Monday', '12'], 'largo de 12 km el domingo, pierna el lunes');
const longShort = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  0: { type: 'run', label: 'Largo fácil', subtype: 'long_easy', durationMin: 55, cardio: { subtype: 'long_easy', durationMin: 55, distanceKm: 8 } },
}) });
silent(longShort, 'RUN-BEFORE-LEGS', 'largo de 8 km el domingo (por debajo de los 10)');
// `running.hardSessions` como array de días: el día viaja en la propuesta aunque la plantilla no
// lo refleje todavía.
fires(run({ running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: [{ day: 0, subtype: 'threshold' }] } }),
  'RUN-BEFORE-LEGS', 'hard', ['Sunday', 'Monday'], '`running.hardSessions[{day:0}]` con pierna el lunes');
fires(run({ running: { weeklyKmTarget: 12, longRunKm: 6, hardSessions: [{ day: 0 }, { day: 3 }] } }),
  'HARD-CARDIO', 'hard', ['2'], 'dos días declarados en `running.hardSessions[]`');
eq(F.VP_LONG_RUN_HARD_KM, 10, 'VP_LONG_RUN_HARD_KM = 10');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S17 · ORDER-SAME-DAY (warn) — INT-003');
// ════════════════════════════════════════════════════════════════════════════════════
// "Levantar primero si comparten día" no existía en ningún guardarraíl (E-14c). Blando porque
// INT-003 es `weak_extrapolated`: Schumann 2022 sostiene la interferencia intra-sesión, no el
// orden concreto. Y sólo con señal POSITIVA de orden: el finisher de Z2 de los 4 días de gym va
// después por definición, y avisar por la mera coexistencia sería ruido cada semana.
const cardioFirst = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  1: { type: 'gym', session: 'lowerA', cardio: { subtype: 'zone2', durationMin: 30, order: 'before', note: 'Z2 30 min ≤143 bpm' } },
}) });
fires(cardioFirst, 'ORDER-SAME-DAY', 'warn', ['Monday', 'Lower A'], 'cardio declarado ANTES de Lower A (`order: before`)');
const cardioNote = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  2: { type: 'gym', session: 'upperA', cardio: { subtype: 'zone2', durationMin: 25, note: '25 min de Z2 antes de levantar, ≤143 bpm' } },
}) });
fires(cardioNote, 'ORDER-SAME-DAY', 'warn', ['Tuesday'], 'y también cuando lo dice la nota ("antes de levantar")');
const cardioAfter = run({ weekTemplate: Object.assign(clone(PLAN_OK.weekTemplate), {
  1: { type: 'gym', session: 'lowerA', cardio: { subtype: 'zone2', durationMin: 20, note: 'finisher de 20 min ≤143 bpm' } },
}) });
silent(cardioAfter, 'ORDER-SAME-DAY', 'un finisher sin marca de orden no dispara nada');
silent(base, 'ORDER-SAME-DAY', 'los 4 días de gym del ideal llevan z2FinisherMin: va después');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S18 · FREQ-FLOOR (warn) — STR-002 `strong`');
// ════════════════════════════════════════════════════════════════════════════════════
// 2×/semana por patrón no tenía suelo (E-14d): la regla `strong` más fácil de incumplir sin que
// nada dijera nada. Cuenta por FAMILIA — la extensión de cuádriceps del jueves es la segunda
// exposición de rodilla de la sentadilla del lunes — y por eso el plan ideal (4 días) CALLA.
silent(base, 'FREQ-FLOOR', 'el ideal cubre las 4 familias 2× (rodilla, bisagra, empuje, tirón)');
const noPull = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, EX.abWheel, EX.facePull] },
}) });
fires(noPull, 'FREQ-FLOOR', 'warn', ['pull', '1', '2'], 'sin dominadas en Upper B: el tirón baja a 1 exposición');
const noHinge = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [EX.legExt, EX.abWheel] },
}) });
ok(pick(noHinge, 'FREQ-FLOOR').some(x => /hinge/.test(x.text)), 'sin peso muerto en Lower B → avisa por la bisagra');
// Variantes de 3 días: la frecuencia 2× es aritméticamente imposible, así que el aviso se calla.
silent(run(null, { variant: 3 }), 'FREQ-FLOOR', 'variante de 3 días: el chequeo no aplica');
silent(validatePlanVersion(Object.assign(clone(PLAN_OK), {
  sessions: Object.assign(clone(PLAN_OK.sessions), {
    upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, EX.abWheel, EX.facePull] },
  }),
}), Object.assign({}, CTX_OK, { variant: 3 })), 'FREQ-FLOOR', 'el mismo plan sin tirón en la variante de 3 días');
eq(F.VP_MIN_PATTERN_EXPOSURES, 2, 'VP_MIN_PATTERN_EXPOSURES = 2');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S20 · MVPA-FLOOR (warn) — END-009, ACSM 2024');
// ════════════════════════════════════════════════════════════════════════════════════
// Ninguna regla codificaba los minutos MVPA/semana (R-5). 150 es el suelo de consenso y 200-300
// la banda de pérdida de grasa; se cuentan minutos de CARDIO solamente (la fuerza también es
// MVPA, así que el chequeo se queda corto a propósito).
silent(base, 'MVPA-FLOOR', 'el ideal suma 190 min de cardio (2 slots + 4 finishers + recuperación)');
const fewMin = run({ weekTemplate: {
  0: { type: 'rest' }, 1: { type: 'gym', session: 'lowerA' }, 2: { type: 'gym', session: 'upperA' },
  3: { type: 'run', label: 'Cardio Z2', subtype: 'zone2', durationMin: 30 },
  4: { type: 'gym', session: 'lowerB' }, 5: { type: 'gym', session: 'upperB' }, 6: { type: 'rest' },
} });
fires(fewMin, 'MVPA-FLOOR', 'warn', ['30', '150', '200'], '30 min de cardio en la semana');
eq(F.VP_MIN_MVPA_MIN, 150, 'VP_MIN_MVPA_MIN = 150');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S19 · RECOVERY-ONLY (warn) — READ-005, READ-002');
// ════════════════════════════════════════════════════════════════════════════════════
// El residuo de E-17: el prompt autoriza bajar el volumen de la SEMANA "cuando el rendimiento lo
// confirme" y nada exigía la parte del rendimiento. Una decisión que cita sólo READ-* y quita
// series es dosificación por wearable con otro nombre — lo que Julian retiró el 2026-09-07.
const readOnly = [{ id: 'r1', type: 'progression', what: 'Bajar 2 series en accesorios',
  why: 'HRV −12 % y RHR +6 bpm en 7 días', ruleIds: ['READ-001', 'READ-004'],
  evidence: { numbers: { hrvDelta: '-12%', rhrDelta: '+6' } } }];
fires(run(null, { decisions: readOnly }), 'RECOVERY-ONLY', 'warn', ['READ-001', 'Recovery is context'],
  'baja series citando sólo READ-*, sin dato de rendimiento');
const readPlusPerf = [{ id: 'r2', type: 'progression', what: 'Bajar 2 series en accesorios',
  why: 'HRV −12 % Y el top set de banca cayó a 95×6 desde 95×8', ruleIds: ['READ-001', 'STR-001'],
  evidence: { numbers: { hrvDelta: '-12%', topSet: '95x6 el 5-sep' } } }];
silent(run(null, { decisions: readPlusPerf }), 'RECOVERY-ONLY', 'la misma bajada con un top set citado');
const readNoDrop = [{ id: 'r3', type: 'recovery', what: 'Vigilar el sueño esta semana',
  why: 'media de 6,2 h en 7 días', ruleIds: ['READ-006'], evidence: { numbers: { sleepH: 6.2 } } }];
silent(run(null, { decisions: readNoDrop }), 'RECOVERY-ONLY', 'una nota de recuperación que no baja nada');
silent(base, 'RECOVERY-ONLY', 'la decisión del ideal se apoya en RPE y top set');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-H14 · KCAL-STEP (hard) — REC-002');
// ════════════════════════════════════════════════════════════════════════════════════
// E-18: el coach ya podía proponer `nutrition.kcalTarget` y nada acotaba el paso. Sin tope, el
// "dial gobernado por rendimiento" es un interruptor: a las 2 semanas no se sabe si la pendiente
// cambió por el ajuste o por el ruido, que es justo lo que la ventana de 14 días protege.
const KCAL_CTX = { facts: Object.assign({}, FACTS_OK, {
  nutrition: { daysLogged14: 12, ea: { daysUnder30: 0 }, kcal: { targetMean7: 2900 } },
  progress: { weight: { validWindow: { ok: true, reasons: [], lastAdjustDate: '2026-08-20', daysSinceLastAdjust: 19 } } },
}) };
fires(run({ nutrition: { proteinG: 190, kcalTarget: 2700, kcalTraining: 2700, kcalRest: 2400, dietBreak: false } }, KCAL_CTX),
  'KCAL-STEP', 'hard', ['2900', '2700', '200', '150'], 'salto de 200 kcal de golpe');
silent(run({ nutrition: { proteinG: 190, kcalTarget: 2775, kcalTraining: 2775, kcalRest: 2400, dietBreak: false } }, KCAL_CTX),
  'KCAL-STEP', 'un ajuste de 125 kcal con 19 días desde el último');
const KCAL_RECENT = { facts: Object.assign({}, FACTS_OK, {
  nutrition: { daysLogged14: 12, ea: { daysUnder30: 0 }, kcal: { targetMean7: 2900 } },
  progress: { weight: { validWindow: { ok: true, reasons: [], lastAdjustDate: '2026-09-02', daysSinceLastAdjust: 6 } } },
}) };
fires(run({ nutrition: { proteinG: 190, kcalTarget: 2800, kcalTraining: 2800, kcalRest: 2400, dietBreak: false } }, KCAL_RECENT),
  'KCAL-STEP', 'hard', ['6', '14', '2026-09-02'], '100 kcal pero sólo 6 días desde el último ajuste');
silent(run({ nutrition: { proteinG: 190, kcalTarget: 2900, kcalTraining: 2900, kcalRest: 2400, dietBreak: false } }, KCAL_RECENT),
  'KCAL-STEP', 'el mismo objetivo que ya había: no es un ajuste');
silent(base, 'KCAL-STEP', 'el plan ideal no declara kcalTarget');
eq(F.VP_KCAL_STEP_MAX, 150, 'VP_KCAL_STEP_MAX = 150');
eq(F.VP_KCAL_ADJUST_DAYS, 14, 'VP_KCAL_ADJUST_DAYS = 14');

// ════════════════════════════════════════════════════════════════════════════════════
sec('EA-GATE (warn) — REC-008');
// ════════════════════════════════════════════════════════════════════════════════════
const lowEa = { facts: Object.assign({}, FACTS_OK, { nutrition: { daysLogged14: 12, ea: { daysUnder30: 5 } } }) };
fires(run({ running: { weeklyKmTarget: 12.5, longRunKm: 7, hardSessions: 0 } }, lowEa), 'EA-GATE', 'warn', ['5 days', 'km'], '5 días con EA <30 y los km suben');
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
fires(hybLong, 'HYBRID-PLUS-LONG', 'warn', ['11', '12.5'], 'híbrido el sábado y el largo subiendo');
silent(base, 'HYBRID-PLUS-LONG', 'sin híbrido');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S6 · TARGET-N1 (warn)');
// ════════════════════════════════════════════════════════════════════════════════════
const n1 = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperB: { id: 'upperB', name: 'Upper B', exercises: [Object.assign({}, EX.ohp, { target: { kg: 55, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }), EX.chins, EX.abWheel] },
}) });
fires(n1, 'TARGET-N1', 'warn', ['a SINGLE session'], 'objetivo de OHP con n=1');
const stale = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [Object.assign({}, EX.trap, { target: { kg: 100, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }), EX.legExt, EX.abWheel] },
}) });
fires(stale, 'TARGET-N1', 'warn', ['30 days old', 're-entry'], 'objetivo de trap bar con el último dato de hace 30 días');
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
    progress: { weight: { validWindow: { ok: false, reasons: ['only 6 measured weigh-ins in 14 days (gate: 10)', 'the window contains 1 deload / diet break week(s) + 5 days'] } } },
  }),
};
fires(run({ nutrition: { proteinG: 190, kcalTraining: 2600, kcalRest: 2400, dietBreak: false } }, badWindow),
  'WEIGHT-WINDOW', 'warn', ['6 measured weigh-ins', 'deload'], 'se toca la ingesta con la ventana de peso inválida');
silent(base, 'WEIGHT-WINDOW', 'ventana válida');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S10 · SUMMER-PACE (warn) — ENV-001');
// ════════════════════════════════════════════════════════════════════════════════════
const paceDec = [{ id: 'p1', type: 'running', what: 'Subir el largo', why: 'El ritmo mejora a la misma FC', ruleIds: ['END-003'], evidence: { numbers: { pace: 400 } } }];
fires(run(null, { decisions: paceDec }), 'SUMMER-PACE', 'warn', ['September'], 'progreso por ritmo leído en septiembre');
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
// E-14e: `CHURN` contaña el `changes[]` que el coach se AUTODECLARA, así que una propuesta que
// reescribe media semana sin rellenar `changes[]` no se auditaba en absoluto — el único caso en
// que este aviso hace falta. Ahora cuenta el DIFF real contra `ctx.basedOn`.
const churn = run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  // Cuatro cambios REALES y CERO `changes[]` declarados: es el caso que se colaba.
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.bench, EX.row, EX.pallof] },              // −1 face-pull
  upperB: { id: 'upperB', name: 'Upper B', exercises: [EX.ohp, EX.chins, EX.abWheel, EX.facePull] }, // +1 face-pull
  lowerB: { id: 'lowerB', name: 'Lower B', mobilityMin: 8, exercises: [EX.trap, EX.legExt, EX.abWheel, EX.legCurl] }, // +1
  lowerA: { id: 'lowerA', name: 'Lower A', mobilityMin: 8, exercises: [EX.boxJump, EX.squat, EX.legExt] },            // swap
}) }, { block: { index: 3, weeksTotal: 5, isDeload: false } });
ok(pick(churn, 'CHURN').some(x => /structural changes/.test(x.text) && /the diff against the active plan/.test(x.text)),
  '5 cambios reales SIN `changes[]` declarado → CHURN sobre el diff');
fires(churn, 'ROTATION', 'warn', ['week 1'], 'swaps fuera de la semana 1 del bloque');
// Un solo swap real en la semana 1 del bloque: ROTATION calla.
silent(run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: { id: 'upperA', name: 'Upper A', exercises: [EX.bench, EX.row, EX.pallof, EX.abWheel] },
}) }, { block: { index: 1, weeksTotal: 5, isDeload: false } }), 'ROTATION', 'un swap en la semana 1 del bloque');
// Y el recíproco del fallo viejo: `changes[]` inflado sin ningún cambio real NO dispara.
silent(run({ sessions: Object.assign(clone(PLAN_OK.sessions), {
  upperA: Object.assign(clone(PLAN_OK.sessions.upperA), { changes: [
    { kind: 'swap', exId: 'face-pull', why: 'a' }, { kind: 'add', exId: 'dips', why: 'b' },
    { kind: 'remove', exId: 'pallof-press', why: 'c' }, { kind: 'reorder', exId: 'bench-press', why: 'd' },
  ] }),
}) }, { block: { index: 3, weeksTotal: 5, isDeload: false } }), 'CHURN',
  '4 `changes[]` declarados sobre un plan que no cambió (el diff manda)');
// Sin `basedOn` no hay diff con el que comparar: `changes[]` vuelve a ser la fuente.
{
  const sinBase = validatePlanVersion(Object.assign(clone(PLAN_OK), {
    sessions: Object.assign(clone(PLAN_OK.sessions), {
      upperA: Object.assign(clone(PLAN_OK.sessions.upperA), { changes: [
        { kind: 'swap', exId: 'face-pull', why: 'a' }, { kind: 'add', exId: 'dips', why: 'b' },
        { kind: 'remove', exId: 'pallof-press', why: 'c' }, { kind: 'reorder', exId: 'bench-press', why: 'd' },
      ] }),
    }),
  }), Object.assign({}, CTX_OK, { basedOn: null }));
  ok(pick(sinBase, 'CHURN').some(x => /as declared by the coach/.test(x.text)),
    'sin `basedOn`, `changes[]` sigue siendo el respaldo y se dice en el texto');
}
silent(base, 'CHURN', '3 prioridades y ningún cambio');

// ════════════════════════════════════════════════════════════════════════════════════
sec('G-S13 · CTL-FOR-STRENGTH (warn) — F-3 / F-2');
// ════════════════════════════════════════════════════════════════════════════════════
fires(run(null, { decisions: [{ id: 'c1', type: 'progression', what: 'Bajar series de banca', why: 'El CTL cayó a 2,4 esta semana', ruleIds: ['STR-003'], evidence: { numbers: { ctl: 2.4 } } }] }),
  'CTL-FOR-STRENGTH', 'warn', ['only sees cardio'], 'decisión de fuerza justificada por CTL');
fires(run(null, { decisions: [{ id: 'c2', type: 'recovery', what: 'Deload reactivo', why: 'rampRate por debajo de −20', ruleIds: ['LOAD-004'], evidence: { numbers: { rampRate: -0.3 } } }] }),
  'CTL-FOR-STRENGTH', 'warn', ['rampRate` is not form'], 'descarga justificada por rampRate');
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
sec('El catálogo de ids: 41 y ni uno suelto');
// ════════════════════════════════════════════════════════════════════════════════════
// Cuenta los ids que el validador puede emitir, leyendo su propio fuente. Sirve para dos
// cosas: que añadir un aviso obligue a mirar esta línea (y a etiquetarlo en `COACH_GUARD_LABEL`),
// y que borrar uno no pase inadvertido. Eran 32 hasta v11.64; WEEK-SUMMARY hizo 33; la auditoría
// del 2026-09-08 añade 6 y hace 39 (E-14: ORDER-SAME-DAY, FREQ-FLOOR, SESSION-COUNT ya existía
// · E-17: RECOVERY-ONLY · E-18: KCAL-STEP · R-5: MVPA-FLOOR · R-7: PLYO-CONTACTS).
{
  const src = readFileSync('app/coach-facts.js', 'utf8');
  const i = src.indexOf('function validatePlanVersion(');
  const j = src.indexOf('// ---------- helpers del validador ----------');
  const cuerpo = src.slice(i, j);
  const emitidos = new Set([
    ...[...cuerpo.matchAll(/add\('([A-Z0-9-]+)'/g)].map(m => m[1]),
    ...[...cuerpo.matchAll(/out\.push\(\{ id: '([A-Z0-9-]+)'/g)].map(m => m[1]),
  ]);
  eq(emitidos.size, 41, `el validador emite 41 ids distintos (${[...emitidos].sort().join(', ')})`);
  for (const id of ['ORDER-SAME-DAY', 'FREQ-FLOOR', 'RECOVERY-ONLY', 'KCAL-STEP', 'MVPA-FLOOR', 'PLYO-CONTACTS']) {
    ok(emitidos.has(id), `${id} está en el catálogo (nuevo en fn v4)`);
  }
  for (const id of ['VOL-FLOOR', 'RECOMP-HOLD']) {
    ok(emitidos.has(id), `${id} está en el catálogo (nuevo en v11.71, auditoría 09-sep)`);
  }
  ok(emitidos.has('WEEK-SUMMARY'), 'y WEEK-SUMMARY sigue ahí');
  // Cada id lleva Rule IDs del corpus: un aviso sin regla es una opinión con formato de regla.
  const CORPUS = new Set(Object.keys(JSON.parse(readFileSync('supabase/functions/coach-weekly-review/rules-compact.json', 'utf8'))
    .rules.reduce((acc, r) => { acc[r.id] = 1; return acc; }, {})));
  const citados = [...cuerpo.matchAll(/add\('([A-Z0-9-]+)',\s*'(hard|warn)',[\s\S]{0,1400}?\[((?:'[A-Z]{3,4}-\d{3}'(?:,\s*)?)+)\]\);/g)];
  const fuera = new Set();
  for (const m of citados) for (const rid of (m[3].match(/[A-Z]{3,4}-\d{3}/g) || [])) if (!CORPUS.has(rid)) fuera.add(rid);
  eq([...fuera].join(', ') || 'ninguno', 'ninguno', 'y todos los Rule IDs que cita el validador existen en el corpus');
  ok(citados.length >= 38, `se encontraron ${citados.length} avisos con Rule IDs en el fuente`);
  // Todos traducidos en la pantalla: un id crudo en un chip no se entiende.
  const coachjs = readFileSync('app/coach.js', 'utf8');
  //
  // SIN LISTA DE PENDIENTES. Un id que el validador emite y la pantalla no sabe traducir sale
  // como chip crudo en la tarjeta del coach ("VOL-FLOOR"), y eso no se entiende. La
  // comprobación es total a propósito: cada id nuevo obliga a su etiqueta en el mismo
  // incremento. Fue el caso de VOL-FLOOR y RECOMP-HOLD al integrar v11.71 con v11.72.
  const tieneEtiqueta = (id) => new RegExp(`'${id}':|\\b${id}:`).test(coachjs);
  const sinTraducir = [...emitidos].filter(id => !tieneEtiqueta(id));
  eq(sinTraducir.join(', ') || 'ninguno', 'ninguno', 'y todos tienen etiqueta en COACH_GUARD_LABEL');
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


// ════════════════════════════════════════════════════════════════════════════════════
sec('mergeProposal · una sesión propuesta sin `muscle` hereda el del plan base (2026-09-09)');
// EL FALLO: el contrato de salida no transporta `muscle`/`name`/`db`/`bw`. Una sesión propuesta
// llegaba al validador con todos sus ejercicios sin músculo, VOL-CAP los contaba como "otros"
// (19 series → duro FALSO) y el recuento real por músculo quedaba corto. Se vio en la primera
// revisión manual (W37): el mismo pack, validado con el plan completo, daba 0 duros.
// ════════════════════════════════════════════════════════════════════════════════════
const sinLib = {
  sessions: [{
    id: 'upperB', focus: 'igual',
    exercises: [
      { id: EX.ohp.id, sets: EX.ohp.sets, reps: EX.ohp.reps, rpe: EX.ohp.rpe, optional: false, superset: null,
        target: { kg: 55, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } },
      { id: EX.chins.id, sets: 4, reps: '5-8', rpe: '7-8', optional: false, superset: null, muscle: 'Lats',
        target: { kg: 5, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } },
    ],
    changes: [],
  }],
  cardio: [], weekTemplateChanges: [],
};
const mSin = mergeProposal(PLAN_OK, sinLib);
const exOhp = mSin.sessions.upperB.exercises.find(e => e.id === EX.ohp.id);
ok(!!EX.ohp.muscle, 'fixture: el OHP del plan tiene `muscle`');
eq(exOhp.muscle, EX.ohp.muscle, 'el OHP propuesto sin `muscle` hereda el del plan (antes VOL-CAP lo contaba como "otros")');
eq(exOhp.name, EX.ohp.name, 'y el nombre');
const exChins = mSin.sessions.upperB.exercises.find(e => e.id === EX.chins.id);
eq(exChins.muscle, 'Lats', 'un `muscle` explícito en la propuesta gana al del plan');
eq(String(exChins.bw), String(EX.chins.bw), 'y hereda `bw` (el kg es lastre), que el contrato no transporta');
eq(exChins.sets, 4, 'las series son las de la propuesta, no las del plan');
ok(sinLib.sessions[0].exercises[0].muscle === undefined, 'la propuesta original no se muta');
const volSin = validatePlanVersion(Object.assign({ block: PLAN_OK.block, nutrition: PLAN_OK.nutrition }, mSin), CTX_OK);
ok(!volSin.some(g => g.id === 'VOL-CAP' && /otros/.test(g.text)), 'VOL-CAP ya no cuenta series en "otros" por una sesión propuesta');


// ════════════════════════════════════════════════════════════════════════════════════
sec('VOL-CAP sobre la semilla REAL (v11.70, L-1): el box jump no es volumen de cuádriceps');
// EL FALLO: el fixture de arriba etiqueta el box jump como 'Power' y la semilla real lo etiquetaba
// 'Quads' — 3 + 4 + 3 + 3 + 3 = 16 series contra un tope de 14, VOL-CAP en rojo en CADA propuesta del
// coach, el modo manual negándose a escribir y la regeneración de la función gastada en un fallo que el
// modelo no causó. Por eso este bloque carga PLAN e IDEAL_BLOCK_V1 de app.js, no un fixture.
// ════════════════════════════════════════════════════════════════════════════════════
{
  const APP_SRC = readFileSync('app/app.js', 'utf8');
  const cutConst = (start) => { const i = APP_SRC.indexOf(start); if (i < 0) return ''; const j = APP_SRC.indexOf('\n};', i); return APP_SRC.slice(i, j + 3); };
  const cutFn = (start) => { const i = APP_SRC.indexOf(start); if (i < 0) return ''; const j = APP_SRC.indexOf('\n}\n', i); return APP_SRC.slice(i, j + 2); };
  // Constantes que el literal de PLAN referencia y viven fuera de él: su valor no afecta al recuento de series.
  const seedSrc = ["const RAMP_NOTE = ''; const LB_TO_KG = 0.45359237;", cutConst('const PLAN = {'), cutConst('const IDEAL_BLOCK_V1 = {'), cutFn('function buildWeekTemplateFromIdeal(')].join('\n');
  const seedCtx = { console };
  vm.createContext(seedCtx);
  let SEED = null;
  try {
    new vm.Script(seedSrc + '\nglobalThis.__seed = { PLAN, IDEAL_BLOCK_V1, buildWeekTemplateFromIdeal };').runInContext(seedCtx);
    SEED = seedCtx.__seed;
    ok(true, 'PLAN, IDEAL_BLOCK_V1 y buildWeekTemplateFromIdeal se cargan tal cual desde app.js');
  } catch (e) {
    ok(false, `no se pudo cargar la semilla de app.js: ${e.message}`);
  }
  if (SEED) {
    const bj = SEED.PLAN.sessions.lowerA.exercises.find(e => e.id === 'box-jump');
    const sp = SEED.PLAN.sessions.hybrid1.exercises.find(e => e.id === 'sled-push');
    eq(bj && bj.muscle, 'Power', "la semilla etiqueta el box jump como 'Power'");
    eq(sp && sp.muscle, 'Power', "y el sled push como 'Power' (6 series que sumaban a cuádriceps en el híbrido)");
    for (const variant of [6, 5, 4, 3]) {
      const tpl = SEED.buildWeekTemplateFromIdeal(variant);
      const seedPlan = { sessions: SEED.PLAN.sessions, weekTemplate: tpl, running: null, block: PLAN_OK.block, nutrition: PLAN_OK.nutrition };
      const ids = new Set();
      for (const s of Object.values(SEED.PLAN.sessions)) for (const ex of (s.exercises || [])) ids.add(ex.id);
      const ctxV = Object.assign({}, CTX_OK, { basedOn: null, libraryIds: ids, variant, lowerSessionIds: new Set(['lowerA', 'lowerB', 'fullA', 'fullB', 'hybrid1', 'travelA', 'travelB']) });
      const res = validatePlanVersion(seedPlan, ctxV);
      const vol = res.filter(g => g.id === 'VOL-CAP');
      ok(vol.length === 0, `la semilla de ${variant} días no dispara VOL-CAP${vol.length ? ` — ${vol.map(g => g.text).join(' | ')}` : ''}`);
    }
  }
  // Y aunque la semilla volviera a decir 'Quads', el contador manda el box jump a 'Power' POR ID.
  const quadsPlan = clone(PLAN_OK);
  quadsPlan.sessions.lowerA.exercises = [
    Object.assign({}, EX.boxJump, { muscle: 'Quads', sets: 3 }),
    Object.assign({}, EX.squat, { sets: 4 }),
    { id: 'hack-squat', name: 'Hack', muscle: 'Quads', sets: 3, reps: '10-12', rpe: '7-8' },
    { id: 'leg-extension', name: 'Ext', muscle: 'Quads', sets: 4, reps: '12', rpe: '7' },
  ];
  const quadsRes = validatePlanVersion(quadsPlan, Object.assign({}, CTX_OK, { basedOn: null }));
  ok(!quadsRes.some(g => g.id === 'VOL-CAP' && /Quads/.test(g.text)), 'box jump etiquetado Quads (3) + 11 series reales = 11 para VOL-CAP, no 14+');
  ok(!quadsRes.some(g => g.id === 'VOL-CAP' && /Power/.test(g.text)), "y la fila 'Power' nunca se juzga contra el tope");
}

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
