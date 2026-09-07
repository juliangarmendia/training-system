// El ajuste de la sesión por recuperación: qué se toca y, sobre todo, qué NO.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Un ajuste automático por recuperación es la puerta
// de entrada a los tres errores que el corpus prohíbe explícitamente:
//
//   1. QUE TOQUE LOS KG. Si un color de wearable mueve el peso de la barra, el sistema ha
//      convertido un score en una dosis (READ-003 al revés). La carga la fija la doble progresión
//      (`suggestSetTarget`, STR-001) y la fatiga se gestiona por RPE y volumen. Ni un kg.
//   2. QUE QUITE COMPUESTOS EN AMARILLO. En déficit lo que preserva fuerza es la intensidad de
//      los compuestos (STR-001). Un ajuste que recorta la sentadilla y deja el gemelo está
//      recortando exactamente lo que había que proteger.
//   3. QUE DEJE LA PLIOMETRÍA. INT-004/ATH-004: la potencia va en fresco y con intención máxima.
//      Un box jump con la recuperación en amarillo es el peor ejercicio del día — riesgo alto,
//      estímulo bajo — y era el que más fácil se quedaba, porque va PRIMERO en la sesión.
//
// Y un cuarto, de implementación: que el ajuste MUTE la sesión planificada. `planned` viene de
// `getPlannedSessionForDate`, que la construye sobre `activePlan.sessions` — mutarla dejaría el
// plan recortado en memoria para el resto de la sesión de la app, y el botón "Hacer la
// planificada" arrancaría la ajustada. El test compara `planned` byte a byte antes y después.
//
// Ejecutar desde la raíz del repo: node tests/verify-session-adjust.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');

const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
const E = sandbox.module.exports;

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

if (typeof E.adjustSessionForReadiness !== 'function') {
  console.log('FAIL — coach-engine.js no exporta adjustSessionForReadiness()');
  process.exit(1);
}

// ── Fixtures ───────────────────────────────────────────────────────────────────────────
// `lowerA` con la forma REAL de `PLAN.sessions.lowerA` (v11.58) más `pogo-hops`, que vivió ahí
// hasta v11.48 y sigue en la librería: los dos ids de potencia tienen que salir.
const lowerA = () => ({
  type: 'gym', date: '2026-09-07', sessionId: 'lowerA', name: 'Lower A', subtitle: 'Squat Focus',
  z2FinisherMin: 20,
  exercises: [
    { id: 'pogo-hops', name: 'Pogo Hops', muscle: 'Calves', sets: 2, reps: '20', rpe: '-', defaultRest: 60 },
    { id: 'box-jump', name: 'Box Jump', muscle: 'Quads', sets: 3, reps: '5', rpe: '-', defaultRest: 90 },
    { id: 'back-squat', name: 'Barbell Back Squat', muscle: 'Quads', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, compound: true },
    { id: 'rdl', name: 'Barbell RDL', muscle: 'Hamstrings', sets: 3, reps: '8-10', rpe: '7', defaultRest: 150 },
    { id: 'hack-squat', name: 'Hack Squat', muscle: 'Quads', sets: 3, reps: '10-12', rpe: '7-8', defaultRest: 120 },
    { id: 'seated-leg-curl', name: 'Seated Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, superset: 'A' },
    { id: 'calf-raise', name: 'Standing Calf Raise', muscle: 'Calves', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, superset: 'A' },
    { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, bw: true },
  ],
});

const upperA = () => ({
  type: 'gym', date: '2026-09-07', sessionId: 'upperA', name: 'Upper A', subtitle: 'Horizontal Press',
  exercises: [
    { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, compound: true },
    { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 4, reps: '6-10', rpe: '7-8', defaultRest: 150, compound: true },
    { id: 'incline-db-press', name: 'Incline DB Press', muscle: 'Chest', sets: 3, reps: '8-12', rpe: '7', defaultRest: 90, superset: 'A', db: true },
    { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'Back', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, superset: 'A' },
    { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, superset: 'B' },
    { id: 'lateral-raise', name: 'DB Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, superset: 'B', db: true },
    { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscle: 'Triceps', sets: 2, reps: '10-15', rpe: '7', defaultRest: 60 },
  ],
});

const cardio = (subtype, min) => ({
  type: 'run', date: '2026-09-07', name: subtype === 'long_easy' ? 'Largo Z2' : 'Cardio Z2',
  subtype, durationMin: min, baseMin: min,
});

// El estado de recuperación, sólo con lo que el ajuste usa.
const rd = (color, fired, extra = {}) => Object.assign({
  color, fired, confidence: color === 'unknown' ? 'low' : 'high', deloadHint: false,
  signals: [{ id: 'hrv7v28', fired: fired > 0, text: 'HRV 7d 62 ms vs 71 de base (−13 %)', status: 'ok' }],
}, extra);

// Los dos predicados, como los pasa app.js:
//   · `isCompound` = la flag del plan. Decide el esqueleto del día rojo ("sólo compuestos y
//     core") y a quién se le quita una serie.
//   · `isMainLift` = uno de los seis patrones (MOVEMENT_PATTERNS + _COMPOUND_PATTERNS). Sólo
//     PROTEGE del recorte de accesorios: sin él, un recorte de 2 en `lowerA` se llevaría el RDL
//     —que no lleva `compound: true` en PLAN— y dejaría el gemelo.
const PATTERN = {
  'back-squat': 'squat', 'hack-squat': 'squat', 'rdl': 'hinge',
  'bench-press': 'horizontal-press', 'barbell-row': 'horizontal-pull',
  'incline-db-press': 'horizontal-press', 'lat-pulldown': 'vertical-pull',
  'pogo-hops': 'plyometric', 'box-jump': 'plyometric',
};
const COMPOUND_PATTERNS = new Set(['squat', 'hinge', 'horizontal-press', 'vertical-press', 'horizontal-pull', 'vertical-pull', 'single-leg']);
const ctx = (stress, alts = [], flags = 0) => ({
  stress,
  alts,
  flags,
  powerIds: { 'box-jump': 1, 'pogo-hops': 1 },
  isCore: (ex) => !!(ex && ex.muscle === 'Core'),
  isCompound: (ex) => !!(ex && ex.compound),
  isMainLift: (ex) => !!(ex && COMPOUND_PATTERNS.has(PATTERN[ex.id])),
});
const S = {
  gymHard: { level: 'hard', family: 'strength', subtype: 'lower' },
  gymModerate: { level: 'moderate', family: 'strength', subtype: 'upper' },
  hybrid: { level: 'hard', family: 'hybrid', subtype: 'strength_endurance' },
  runEasy: { level: 'easy', family: 'cardio', subtype: 'zone2' },
  runLong: { level: 'moderate', family: 'cardio', subtype: 'long_easy' },
  recovery: { level: 'easy', family: 'recovery', subtype: 'mobility' },
};
const ALTS_LOWER = [
  { label: 'Bike Zone 2 35-45 min', family: 'cardio', subtype: 'zone2', modality: 'bike', durationMin: 40 },
  { label: 'Mobility + core', family: 'recovery', subtype: 'mobility', modality: 'mobility', durationMin: 25 },
];
const ALTS_HARD_CARDIO = [
  { label: 'Bike Zone 2 35-45 min', family: 'cardio', subtype: 'zone2', modality: 'bike', durationMin: 40 },
];

const ids = (list) => (list || []).map(e => e.id);
const dropped = (a) => a.changes.filter(c => c.type === 'dropExercise').map(c => c.exerciseId);
const change = (a, type) => a.changes.find(c => c.type === type) || null;
const ex = (s, id) => (s.exercises || []).find(e => e.id === id) || null;

// ── 1. lowerA (exigente) + amarillo ───────────────────────────────────────────────────
console.log('1. Pierna pesada + recuperación amarilla');
let planned = lowerA();
const antes = JSON.stringify(planned);
let a = E.adjustSessionForReadiness(planned, rd('yellow', 1), ctx(S.gymHard, ALTS_LOWER));
eq(a.mode, 'modify', 'mode modify (no se cambia el día, se recorta)');
yes(dropped(a).includes('box-jump'), 'quita el box jump (INT-004: la potencia sólo en fresco)');
yes(dropped(a).includes('pogo-hops'), 'y los pogos: los DOS ids de potencia salen');
yes(dropped(a).includes('calf-raise'), 'quita el gemelo');
eq(dropped(a).length, 4, 'cuatro bajas: 2 de potencia + 2 accesorios (sesión exigente)');
yes(ids(a.session.exercises).includes('back-squat'), 'la sentadilla SE QUEDA');
eq(ex(a.session, 'back-squat').sets, 4, '…con sus 4 series intactas (compuestos intactos en amarillo)');
yes(ids(a.session.exercises).includes('rdl'), 'el RDL se queda (es un compuesto, aunque el plan no lo marque)');
yes(ids(a.session.exercises).includes('ab-wheel'), 'el core se queda (más permanencia que un accesorio)');
eq(change(a, 'rpeCap').to, 7, 'tope de RPE 7');
yes(/fallo/.test(change(a, 'rpeCap').why), 'con su motivo: sin llegar al fallo');
// EL INVARIANTE: cero kg.
const kgKeys = ['kg', 'weight', 'load', 'targetKg'];
yes(a.changes.every(c => !kgKeys.includes(c.type)), 'ningún change es de tipo carga');
yes(!JSON.stringify(a.session).match(/"(kg|weight|targetKg)":/), 'la sesión ajustada no lleva ningún campo de kg');
eq(a.session.z2FinisherMin, 20, 'el Z2 finisher no se toca');
// Y no muta lo planificado.
eq(JSON.stringify(planned), antes, 'planned NO se muta (deep-equal antes/después)');
eq(planned.exercises.length, 8, 'la sesión planificada sigue con sus 8 ejercicios');
eq(planned.exercises[2].sets, 4, 'y la sentadilla con sus 4 series');

// ── 2. upperA (moderada) + amarillo → un solo accesorio ───────────────────────────────
console.log('');
console.log('2. Upper (moderada) + amarilla');
planned = upperA();
a = E.adjustSessionForReadiness(planned, rd('yellow', 1), ctx(S.gymModerate));
eq(a.mode, 'modify', 'mode modify');
eq(dropped(a).join(','), 'tricep-pushdown', 'quita SÓLO el pushdown (el accesorio suelto del final)');
eq(a.session.exercises.length, 6, 'quedan 6 ejercicios');
eq(ex(a.session, 'bench-press').sets, 4, 'la banca con sus 4 series');
eq(ex(a.session, 'face-pull') ? 'sí' : 'no', 'sí', 'el face pull se queda (salud de hombro, superserie)');
eq(change(a, 'rpeCap').to, 7, 'tope de RPE 7');
eq(change(a, 'setDelta'), null, 'en amarillo NO se recortan series de compuestos');

// ── 3. upperA + rojo → compuestos + core, −1 serie con suelo de 2 ─────────────────────
console.log('');
console.log('3. Upper (moderada) + roja');
planned = upperA();
a = E.adjustSessionForReadiness(planned, rd('red', 2), ctx(S.gymModerate));
eq(a.mode, 'modify', 'mode modify (una sesión moderada NO se cambia por otra)');
eq(ids(a.session.exercises).join(','), 'bench-press,barbell-row', 'sólo compuestos (y core, aquí no hay)');
eq(ex(a.session, 'bench-press').sets, 3, 'banca 4 → 3 series');
eq(ex(a.session, 'barbell-row').sets, 3, 'remo 4 → 3 series');
eq(change(a, 'setDelta').from, 4, 'el change registra de dónde viene');
eq(change(a, 'setDelta').to, 3, 'y a dónde va');
eq(change(a, 'rpeCap').to, 7, 'tope de RPE 7');
eq(dropped(a).length, 5, 'los 5 accesorios fuera');
// Suelo de 2 series: un compuesto que ya venía con 2 no baja a 1.
const dosSeries = {
  type: 'gym', date: '2026-09-07', sessionId: 'x', name: 'Mini', exercises: [
    { id: 'ohp', name: 'OHP', muscle: 'Shoulders', sets: 2, reps: '5-8', rpe: '7-8', compound: true },
    { id: 'ab-wheel', name: 'Ab Wheel', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-' },
  ],
};
const mini = E.adjustSessionForReadiness(dosSeries, rd('red', 2), ctx(S.gymModerate));
eq(ex(mini.session, 'ohp').sets, 2, 'un compuesto con 2 series se queda en 2 (suelo)');
eq(change(mini, 'setDelta'), null, 'y no se registra un change que no ocurrió');
yes(ids(mini.session.exercises).includes('ab-wheel'), 'el core sobrevive al rojo');

// ── 4. lowerA (exigente) + rojo → cambia el objetivo del día (READ-007) ───────────────
console.log('');
console.log('4. Pierna pesada + roja');
planned = lowerA();
const antes4 = JSON.stringify(planned);
a = E.adjustSessionForReadiness(planned, rd('red', 2), ctx(S.gymHard, ALTS_LOWER));
eq(a.mode, 'recovery', 'mode recovery (no hay segunda bandera de interferencia)');
eq(a.session.name, 'Bike Zone 2 35-45 min', 'la primera alternativa de ALT_LIBRARY.strength_lower');
eq(a.session.durationMin, 30, 'a 30 minutos');
eq(a.session.type, 'recovery', "type 'recovery'");
eq(a.session.replacedFrom, 'Lower A', 'y deja dicho qué sustituye');
eq(a.session.exercises, undefined, 'sin lista de ejercicios (ya no es una sesión de fuerza)');
eq(change(a, 'replaceSession').from, 'Lower A', 'change replaceSession con el origen');
yes(/objetivo/.test(change(a, 'replaceSession').why), 'y el motivo cita el cambio de OBJETIVO (READ-007)');
yes(a.alternatives.length >= 2, 'ofrece las alternativas para registrar con un toque');
eq(JSON.stringify(planned), antes4, 'planned intacto');
// Con una segunda bandera (familia híbrida, HYB-002) se propone un CAMBIO, no recuperación.
const hib = E.adjustSessionForReadiness(
  { type: 'gym', date: '2026-09-07', sessionId: 'hybrid1', name: 'Híbrido', exercises: [] },
  rd('red', 2), ctx(S.hybrid, ALTS_HARD_CARDIO, 1));
eq(hib.mode, 'replace', 'rojo + exigente + flag de interferencia → replace');
eq(hib.session.durationMin, 40, 'con la duración de la alternativa');

// ── 5. Cardio ─────────────────────────────────────────────────────────────────────────
console.log('');
console.log('5. Cardio');
let c = E.adjustSessionForReadiness(cardio('long_easy', 50), rd('yellow', 1), ctx(S.runLong, ALTS_HARD_CARDIO));
eq(c.mode, 'modify', 'largo Z2 + amarillo → modify');
eq(c.session.durationMin, 40, "50' × 0,8 = 40' (redondeo a 5)");
eq(change(c, 'durationScale').from, 50, 'change durationScale de 50');
eq(change(c, 'durationScale').to, 40, 'a 40');
yes(/zona/.test(change(c, 'durationScale').why), 'y dice que la ZONA no cambia (END-002)');
eq(c.session.subtype, 'long_easy', 'el subtipo no cambia: menos minutos, misma zona');

c = E.adjustSessionForReadiness(cardio('zone2', 40), rd('red', 2), ctx(S.runEasy));
eq(c.mode, 'keep', 'Z2 fácil + rojo → keep (invariante del v1: easy nunca escala)');
eq(c.session.durationMin, 30, "con tope de 30'");
eq(change(c, 'durationScale').to, 30, 'y el change lo deja registrado');

c = E.adjustSessionForReadiness(cardio('zone2', 25), rd('red', 2), ctx(S.runEasy));
eq(c.mode, 'keep', 'Z2 de 25′ + rojo → keep');
eq(c.session.durationMin, 25, 'y no se toca (ya está por debajo del tope)');
eq(c.changes.length, 0, 'sin changes que no aportan nada');

c = E.adjustSessionForReadiness(cardio('long_easy', 50), rd('red', 2), ctx(S.runLong, ALTS_HARD_CARDIO));
eq(c.mode, 'replace', 'largo Z2 + rojo → replace');
eq(c.session.name, 'Bike Zone 2 35-45 min', 'por la primera alternativa de hard_cardio');

// ── 6. Verde, descanso y sin dato ─────────────────────────────────────────────────────
console.log('');
console.log('6. Verde, descanso, recuperación y sin dato');
a = E.adjustSessionForReadiness(lowerA(), rd('green', 0), ctx(S.gymHard, ALTS_LOWER));
eq(a.mode, 'keep', 'verde + pierna pesada → keep');
eq(a.changes.length, 0, 'sin cambios');
eq(a.session.exercises.length, 8, 'la sesión entera');
eq(a.alternatives.length, 0, 'y sin alternativas que distraigan');

a = E.adjustSessionForReadiness({ type: 'rest', date: '2026-09-07', name: 'Rest' }, rd('red', 3), ctx({ level: 'easy', family: 'recovery', subtype: 'deload' }));
eq(a.mode, 'keep', 'descanso + rojo → keep');
a = E.adjustSessionForReadiness({ type: 'recovery', date: '2026-09-07', name: 'Recuperación activa', z2FinisherMin: 20 }, rd('red', 3), ctx(S.recovery));
eq(a.mode, 'keep', 'día de recuperación + rojo → keep');
eq(a.session.z2FinisherMin, 20, 'y su Z2 suave sigue igual');

a = E.adjustSessionForReadiness(lowerA(), rd('unknown', 0), ctx(S.gymHard, ALTS_LOWER));
eq(a.mode, 'keep', 'sin dato → keep (no se decide con lo que no se sabe)');
eq(a.confidence, 'low', "…y confidence 'low'");
eq(a.session.exercises.length, 8, 'la sesión entera');
yes(/[Ss]in dato/.test(a.reason.join(' ')), 'y la razón lo dice');

// ── 7. Todo change es explicable y trazable ───────────────────────────────────────────
console.log('');
console.log('7. Trazabilidad de cada cambio');
const todos = [];
for (const [planned2, readiness, c2] of [
  [lowerA(), rd('yellow', 1), ctx(S.gymHard, ALTS_LOWER)],
  [lowerA(), rd('red', 2), ctx(S.gymHard, ALTS_LOWER)],
  [upperA(), rd('yellow', 1), ctx(S.gymModerate)],
  [upperA(), rd('red', 2), ctx(S.gymModerate)],
  [cardio('long_easy', 50), rd('yellow', 1), ctx(S.runLong, ALTS_HARD_CARDIO)],
  [cardio('zone2', 40), rd('red', 2), ctx(S.runEasy)],
]) {
  todos.push(...E.adjustSessionForReadiness(planned2, readiness, c2).changes);
}
yes(todos.length >= 12, `hay cambios que revisar (${todos.length})`);
yes(todos.every(ch => typeof ch.why === 'string' && ch.why.length > 10), 'todos los changes llevan `why` legible');
yes(todos.every(ch => Array.isArray(ch.ruleIds) && ch.ruleIds.length > 0), 'y `ruleIds` no vacío');
yes(todos.every(ch => ['dropExercise', 'rpeCap', 'setDelta', 'durationScale', 'replaceSession'].includes(ch.type)),
  'y sólo los 5 tipos declarados en §B.2');
// El invariante de verdad: ningún tipo de change puede mover carga. Los motivos SÍ hablan de kg
// —"mismos kg", "no sólo el peso de la barra"— porque es justo lo que hay que dejar claro.
yes(todos.every(ch => !('kg' in ch) && !('weight' in ch)), 'ningún change lleva un campo de carga');
eq(todos.filter(ch => ch.type === 'setDelta').every(ch => ch.to >= 2), true,
  'ningún setDelta baja de 2 series');

// ── 8. _coachTrimAccessories: la permanencia declarada ────────────────────────────────
console.log('');
console.log('8. _coachTrimAccessories (permanencia compuesto > core > superserie > suelto)');
const lista = [
  { id: 'c1', name: 'Compuesto', compound: true },
  { id: 'core1', name: 'Core', muscle: 'Core' },
  { id: 'ss1', name: 'Superserie 1', superset: 'A' },
  { id: 'ss2', name: 'Superserie 2', superset: 'A' },
  { id: 'l1', name: 'Suelto 1' },
  { id: 'l2', name: 'Suelto 2' },
  { id: 'box-jump', name: 'Box Jump' },
];
const opts = { powerIds: { 'box-jump': 1 }, isCore: (e) => e.muscle === 'Core' };
let t = E._coachTrimAccessories(lista, 1, opts);
eq(t.power.map(e => e.id).join(','), 'box-jump', 'la potencia sale siempre y aparte');
eq(t.dropped.map(e => e.id).join(','), 'l2', 'con n=1 cae el último accesorio SUELTO');
t = E._coachTrimAccessories(lista, 2, opts);
eq(t.dropped.map(e => e.id).join(','), 'l2,l1', 'con n=2 caen los dos sueltos, desde el final');
t = E._coachTrimAccessories(lista, 3, opts);
eq(t.dropped.map(e => e.id).join(','), 'l2,l1,ss2', 'con n=3 se entra en la superserie, por el final');
t = E._coachTrimAccessories(lista, 9, opts);
eq(t.kept.map(e => e.id).join(','), 'c1,core1', 'ni pidiendo 9 se toca el compuesto ni el core');
eq(E._coachTrimAccessories(lista, 0, opts).dropped.length, 0, 'con n=0 no se quita ningún accesorio');
eq(E._coachTrimAccessories([], 2, opts).kept.length, 0, 'lista vacía no explota');

console.log('');
console.log(failed === 0
  ? '✅ Ajuste por recuperación: recorta accesorios y RPE, nunca kg ni compuestos, y no muta el plan.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
