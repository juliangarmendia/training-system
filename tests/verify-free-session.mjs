// Verifica la sesión libre (v11.44) y, sobre todo, que NO cambia el comportamiento de las
// sesiones normales del plan.
//
// El fallo que este test existe para impedir: el código de plantillas que se retiró en v11.44
// ponía `state.activeSession = 'custom'`, un id que no estaba en el plan, y al reabrir la app
// `showResumeBanner`/`restoreActiveWorkout` hacían `clearActiveWorkout()` y BORRABAN el
// entrenamiento en curso. La sesión libre no puede repetirlo.
//
// Ejecutar desde la raíz del repo: node tests/verify-free-session.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/app.js', 'utf8');

// Extrae una región de app.js entre dos anclas textuales (la segunda no se incluye).
function slice(fromAnchor, toAnchor, label) {
  const i = SRC.indexOf(fromAnchor);
  const j = SRC.indexOf(toAnchor, i + fromAnchor.length);
  if (i < 0 || j < 0) { console.log(`FAIL — no se pudo extraer ${label}`); process.exit(1); }
  return SRC.slice(i, j);
}

const EXERCISE_ALTERNATIVES_SRC = slice('const EXERCISE_ALTERNATIVES = {', 'const PLATE_WEIGHTS', 'EXERCISE_ALTERNATIVES');
const MOVEMENT_PATTERNS_SRC = slice('const MOVEMENT_PATTERNS = {', 'function isCorePattern', 'MOVEMENT_PATTERNS');
const COMPUTE_BLOCKS_SRC = slice('function computeBlocks(session, deload) {', 'function getBlockIdForExerciseId', 'computeBlocks');
const FREE_SRC = slice('const FREE_SESSION_ID = ', '// ==================== FIN SESIÓN LIBRE', 'bloque de sesión libre');

// --- Contexto con los stubs mínimos que el bloque necesita ---
const toasts = [];
const ctx = {
  console,
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
  toast: (m) => toasts.push(m),
  confirm: () => true,
  smartPut: async () => {},
  dbGet: async () => null,
  getExerciseName: (id) => id,
  parseRepsAvg: (r) => { const m = String(r).match(/\d+/g); return m ? (+m[0] + +(m[1] || m[0])) / 2 : 10; },
  estimateExerciseSec: null,   // computeBlocks lo usa; se define abajo
};
vm.createContext(ctx);

const EXPORTS = ['FREE_SESSION_ID', 'makeFreeSession', 'getSessionDef', 'isAdHocSession',
  'libraryOptionsByMuscle', 'deriveExerciseFlags', 'defaultsForPattern',
  'MOVEMENT_PATTERNS', 'EXERCISE_ALTERNATIVES', 'computeBlocks'];

vm.runInContext(`
  var state = { adHocSession: null, activeSession: null, quickMode: false };
  var activePlan = null;
  var exerciseLibrary = {};
  ${EXERCISE_ALTERNATIVES_SRC}
  ${MOVEMENT_PATTERNS_SRC}
  function estimateExerciseSec(ex, deload) {
    const sets = deload ? Math.max(1, Math.ceil(ex.sets / 2)) : ex.sets;
    return sets * (parseRepsAvg(ex.reps) * 4 + 20) + (sets - 1) * (ex.defaultRest || 90);
  }
  ${COMPUTE_BLOCKS_SRC}
  ${FREE_SRC}
  ${EXPORTS.map(n => `globalThis.${n} = ${n};`).join('\n')}
  globalThis._setState = (s) => { Object.assign(state, s); };
  globalThis._setPlan = (p) => { activePlan = p; };
  globalThis._setLib = (l) => { exerciseLibrary = l; };
`, ctx);

const {
  FREE_SESSION_ID, makeFreeSession, getSessionDef, isAdHocSession,
  libraryOptionsByMuscle, deriveExerciseFlags, defaultsForPattern, computeBlocks,
} = ctx;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const sec = (t) => console.log(`\n=== ${t} ===`);

// Plan de referencia, con la forma real de una sesión del plan.
const PLAN = {
  version: 16,
  sessions: {
    upperA: {
      id: 'upperA', name: 'Upper A', subtitle: 'Horizontal Press', icon: '🏋️', warmup: ['a', 'b'],
      exercises: [
        { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'x', compound: true },
        { id: 'incline-db-press', name: 'Incline DB Press', muscle: 'Chest', sets: 3, reps: '8-12', rpe: '7', defaultRest: 90, notes: 'y', superset: 'A', db: true },
        { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'Back', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'z', superset: 'A' },
      ],
    },
  },
};
ctx._setPlan(PLAN);
ctx._setLib({
  'bench-press': { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', bw: false },
  'straight-arm-pulldown': { id: 'straight-arm-pulldown', name: 'Pullover en Polea (brazos extendidos)', muscle: 'Back', bw: false },
  'incline-db-fly': { id: 'incline-db-fly', name: 'Apertura Inclinada con Mancuerna', muscle: 'Chest', bw: false },
  'chinups': { id: 'chinups', name: 'Chin-ups', muscle: 'Back', bw: true },
});

sec('1. Forma de la sesión libre');
const free = makeFreeSession();
ok(free.id === FREE_SESSION_ID && free.id === 'free', 'id = "free"');
ok(free.adHoc === true, 'lleva la marca adHoc, que es la que gobierna todas las ramas');
ok(Array.isArray(free.exercises) && free.exercises.length === 0, 'empieza vacía');
ok(Array.isArray(free.warmup) && free.warmup.length > 0, 'tiene calentamiento');
for (const k of ['name', 'subtitle', 'icon']) ok(typeof free[k] === 'string' && free[k], `${k} presente (lo usan header y selectores)`);

sec('2. El resolutor');
ctx._setState({ adHocSession: null });
ok(getSessionDef('upperA') === PLAN.sessions.upperA, 'sin ad-hoc, upperA sale del plan');
ok(getSessionDef('free') === undefined || getSessionDef('free') === null, 'sin ad-hoc, "free" no existe');
ok(isAdHocSession('upperA') === false, 'upperA no es ad-hoc');
ctx._setState({ adHocSession: free });
ok(getSessionDef('free') === free, 'con ad-hoc activa, "free" la resuelve');
ok(isAdHocSession('free') === true, 'y se reconoce como ad-hoc');
ok(getSessionDef('upperA') === PLAN.sessions.upperA, 'y upperA SIGUE saliendo del plan — no se rompe nada');
ok(getSessionDef('noExiste') === undefined, 'un id inventado devuelve undefined, no lanza');

sec('3. deriveExerciseFlags — el fallo que el store no puede cubrir');
// El store `exercises` NO persiste `db`, así que leerlo de ahí daría siempre false y el volumen de
// mancuernas se contaría a la mitad.
ok(deriveExerciseFlags('bench-press').compound === true, 'bench-press: compound (viene del plan)');
ok(deriveExerciseFlags('incline-db-press').db === true, 'incline-db-press: db desde el plan');
ok(deriveExerciseFlags('incline-db-fly').db === true, 'incline-db-fly: db por lista explícita, aunque el plan no lo tenga');
ok(deriveExerciseFlags('lateral-raise').db === true, 'lateral-raise: db');
ok(deriveExerciseFlags('chinups').bw === true, 'chinups: bw desde la librería');
ok(deriveExerciseFlags('back-squat').compound === true, 'back-squat: compound por patrón squat');
ok(deriveExerciseFlags('straight-arm-pulldown').compound === false,
  'pullover en polea: NO compound — isolation-lat no es un patrón compuesto');
ok(deriveExerciseFlags('straight-arm-pulldown').db === false, 'pullover: no es de mancuerna');
ok(deriveExerciseFlags('face-pull').compound === false, 'face-pull: no compound');

sec('4. defaultsForPattern');
const d = (id) => defaultsForPattern(id);
ok(d('bench-press').reps === '6-10' && d('bench-press').defaultRest === 150, 'compuesto: 6-10 reps, 150 s');
ok(d('lateral-raise').reps === '10-15' && d('lateral-raise').defaultRest === 60, 'aislamiento: 10-15 reps, 60 s');
ok(d('sled-push').reps === '30-40 s', 'conditioning: por tiempo');
ok(d('box-jump').reps === '3-5' && d('box-jump').rpe === '6', 'pliometría: pocas reps, RPE bajo');
ok(d('farmer-carry').reps === '40 m', 'carry: por distancia');
ok(d('ab-wheel').defaultRest === 45, 'core: descanso corto');
ok(d('hip-thrust').reps === '10-12', 'glúteo: 10-12');
ok(d('idInventado').reps === '8-12', 'id desconocido: valores genéricos, no undefined');
for (const id of ['bench-press', 'lateral-raise', 'sled-push', 'box-jump', 'farmer-carry', 'ab-wheel', 'idInventado']) {
  ok(typeof d(id).reps === 'string', `${id}: reps es string (generateCoachNote hace .toString())`);
}

sec('5. Catálogo del selector: la UNIÓN, no sólo el store');
// El store del teléfono se sembró una vez y le faltan los ejercicios posteriores a v11.37.
const cat = libraryOptionsByMuscle();
ok(!!cat['Chest'] && !!cat['Back'] && !!cat['Shoulders'], 'agrupa por músculo');
ok(cat['Back'].has('straight-arm-pulldown'), 'incluye lo que sólo está en la librería');
ok(cat['Chest'].has('bench-press'), 'incluye lo que está en el plan');
ok(cat['Back'].has('t-bar-row'), 'incluye lo que sólo está en EXERCISE_ALTERNATIVES');
ok(cat['Chest'].has('incline-press') && cat['Chest'].has('incline-db-fly'),
  'incluye los ejercicios nuevos de v11.44');
ok(cat['Shoulders'].has('front-raise'), 'incluye la elevación frontal');
ok(cat['Chest'].get('bench-press') === 'Barbell Bench Press', 'mapea id → nombre legible');
// Sin duplicados: un ejercicio que está en las tres fuentes aparece una sola vez.
const allIds = Object.values(cat).flatMap(m => [...m.keys()]);
ok(new Set(allIds).size === allIds.length, `sin ids duplicados (${allIds.length} opciones)`);

sec('6. computeBlocks se recalcula al añadir (hoy se calculaba una sola vez)');
const s0 = makeFreeSession();
const blocks0 = computeBlocks(s0, false);
ok(blocks0.length === 1 && blocks0[0].id === 'warmup', 'sesión vacía: sólo el bloque de calentamiento');
s0.exercises.push({ id: 'bench-press', name: 'B', muscle: 'Chest', sets: 4, reps: '6-10', rpe: '7-8', defaultRest: 150, notes: '' });
const blocks1 = computeBlocks(s0, false);
ok(blocks1.length === 2 && blocks1[1].id === 'ex-bench-press', 'tras añadir uno: warmup + ex-bench-press');
s0.exercises.push({ id: 'lateral-raise', name: 'L', muscle: 'Shoulders', sets: 3, reps: '10-15', rpe: '7', defaultRest: 60, notes: '' });
const blocks2 = computeBlocks(s0, false);
ok(blocks2.length === 3, 'tras añadir otro: 3 bloques');
ok(blocks2[1].id === 'ex-bench-press',
  'el id del bloque ya cronometrado NO cambia al añadir al final — los tiempos sobreviven');
ok(blocks2.every(b => b.estimatedSec > 0), 'todos los bloques tienen estimación');
ok(!blocks2.some(b => String(b.id).startsWith('ss-')),
  'ningún bloque de superserie: los ejercicios ad-hoc nunca llevan `superset`, y así los ids son estables');

sec('7. Las sesiones del plan no cambian de comportamiento');
const planBlocks = computeBlocks(PLAN.sessions.upperA, false);
ok(planBlocks.map(b => b.id).join(',') === 'warmup,ex-bench-press,ss-A',
  'upperA sigue dando warmup + bench + superserie A');
const planBlocksDeload = computeBlocks(PLAN.sessions.upperA, true);
ok(planBlocksDeload[1].estimatedSec < planBlocks[1].estimatedSec,
  'el deload sigue recortando en las sesiones del plan');
ok(PLAN.sessions.upperA.exercises.length === 3, 'el objeto del plan no se mutó');
ok(!('adHoc' in PLAN.sessions.upperA), 'las sesiones del plan no llevan la marca adHoc');

sec('8. Round-trip de la instantánea: el fallo que borraba la sesión');
// Réplica del contrato entre captureWorkoutState y restoreActiveWorkout.
const live = makeFreeSession();
live.exercises.push({ id: 'bench-press', name: 'B', muscle: 'Chest', sets: 3, reps: '6-10', rpe: '7-8', defaultRest: 150, notes: '', compound: true });
live.exercises.push({ id: 'incline-db-fly', name: 'A', muscle: 'Chest', sets: 3, reps: '10-15', rpe: '7', defaultRest: 60, notes: '', db: true });
ctx._setState({ adHocSession: live, activeSession: 'free' });

const snapshot = {
  key: 'activeWorkout', sessionId: 'free', startTime: 1787233894404, quality: 4,
  exercises: live.exercises.map(e => ({ exerciseId: e.id, sets: [], expanded: false, note: '' })),
  blockTimings: [{ blockId: 'ex-bench-press', durationSec: 557 }],
  adHoc: JSON.parse(JSON.stringify(live)),
};
ok(snapshot.adHoc !== null, 'la instantánea LLEVA la definición ad-hoc');
ok(snapshot.adHoc.exercises.length === 2, 'con sus 2 ejercicios');
ok(snapshot.adHoc !== live, 'es una copia profunda, no la misma referencia');

// Simula reabrir la app: estado limpio y restauración desde la instantánea.
ctx._setState({ adHocSession: null, activeSession: null });
ok(getSessionDef('free') == null, 'con el estado limpio, "free" no resuelve (aquí se perdía todo)');
ctx._setState({ adHocSession: snapshot.adHoc });
const restored = getSessionDef('free');
ok(!!restored, 'tras reponer la instantánea, "free" resuelve');
ok(restored.exercises.length === 2, 'los 2 ejercicios vuelven');
ok(restored.exercises.map(e => e.id).join(',') === 'bench-press,incline-db-fly', 'en el mismo orden');
ok(restored.exercises[1].db === true, 'las flags sobreviven al round-trip (factor ×2 del volumen)');
// El emparejamiento por exerciseId, que es lo que descarta en silencio si no coincide.
const cardIds = restored.exercises.map(e => e.id);
ok(snapshot.exercises.every(se => cardIds.includes(se.exerciseId)),
  'cada ejercicio de la instantánea encuentra su tarjeta — nada se descarta en silencio');
ok(computeBlocks(restored, false).some(b => b.id === 'ex-bench-press'),
  'el bloque cronometrado se puede volver a emparejar tras el restore');

sec('9. Quitar un ejercicio deja huérfana su entrada, y eso es lo correcto');
const afterRemove = { ...restored, exercises: restored.exercises.filter(e => e.id !== 'bench-press') };
const stillMatched = snapshot.exercises.filter(se => afterRemove.exercises.some(e => e.id === se.exerciseId));
ok(stillMatched.length === 1, 'sólo 1 de las 2 entradas encuentra tarjeta tras quitar uno');
ok(stillMatched[0].exerciseId === 'incline-db-fly', 'sobrevive el que no se quitó');

sec('10. El código muerto de plantillas ya no existe');
for (const dead of ['startCustomWorkout', 'saveWorkoutAsTemplate', 'renderTemplateUI', 'workoutTemplates']) {
  ok(!SRC.includes(dead), `${dead} retirado de app.js`);
}
ok(!SRC.includes("activeSession = 'custom'"), "ya nadie pone activeSession = 'custom'");

console.log(fail === 0
  ? '\nPASS — la sesión libre funciona y las sesiones del plan no se tocan\n'
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
