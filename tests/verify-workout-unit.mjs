// La unidad de un registro de entrenamiento: que la ficha de edición y "Copy for WHOOP" no puedan
// volver a discrepar, y que guardar no reetiquete pesos sin convertirlos.
//
// El fallo que este test existe para impedir (24-ago-2026, Upper A): el entrenamiento se veía en KG
// en la ficha y "Copy for WHOOP" lo copiaba en LB. Los números eran los mismos —95, 90, 60— pero la
// etiqueta no, porque cada consumidor deducía la unidad por su cuenta:
//
//   ficha de edición  →  w.inputUnit || appUnit     (NUNCA miraba w.unit)
//   transcript WHOOP  →  w.unit || appUnit          (NUNCA miraba w.inputUnit)
//
// Con un registro sellado `unit: 'lb'` eso da kg en pantalla y lb en el portapapeles. Y encima
// saveEditWorkout hacía `w.unit = appUnit` incondicional: abrir un entrenamiento de abril guardado
// en lb, tocar cualquier campo y guardar reetiquetaba sus 205 lb como "205 kg" sin tocar el número.
//
// Ejecutar desde la raíz del repo: node tests/verify-workout-unit.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/app.js', 'utf8');

function slice(fromAnchor, toAnchor, label) {
  const i = SRC.indexOf(fromAnchor);
  const j = SRC.indexOf(toAnchor, i + fromAnchor.length);
  if (i < 0 || j < 0) { console.log(`FAIL — no se pudo extraer ${label}`); process.exit(1); }
  return SRC.slice(i, j);
}

const CONVERT_SRC = slice('function convertWeight(value, fromUnit, toUnit) {', '// Volume helper:', 'convertWeight + loggedUnit');
const TRANSCRIPT_SRC = slice('function buildWhoopTranscript(w, ctx = {}) {', '// Sync click handler', 'buildWhoopTranscript');

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(`
  var state = { settings: { unit: 'kg' } };
  var activePlan = { sessions: {} };
  function getExerciseName(id) { return id; }
  function formatDate(d) { return d; }
  ${CONVERT_SRC}
  ${TRANSCRIPT_SRC}
  // Tolerante a propósito: contra el código ANTERIOR al arreglo loggedUnit no existe, y el test
  // tiene que enseñar la discrepancia que provocaba, no reventar por un símbolo ausente.
  globalThis.loggedUnit = typeof loggedUnit === 'function' ? loggedUnit : null;
  globalThis.convertWeight = convertWeight;
  globalThis.buildWhoopTranscript = buildWhoopTranscript;
  globalThis._setAppUnit = (u) => { state.settings.unit = u; };
  globalThis._appUnit = () => state.settings.unit;
  globalThis._setPlan = (p) => { activePlan = p; };
`, ctx);

const { convertWeight, buildWhoopTranscript } = ctx;
// La regla que aplica la ficha de edición. Con el arreglo es loggedUnit; sin él, la que tenía
// openEditWorkout: `w.inputUnit || appUnit`, ciega a w.unit — el origen del fallo.
const loggedUnit = ctx.loggedUnit || ((w) => (w && w.inputUnit) || ctx._appUnit() || 'kg');

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const sec = (t) => console.log(`\n=== ${t} ===`);

ctx._setPlan({
  sessions: {
    upperA: {
      id: 'upperA', name: 'Upper A',
      exercises: [
        { id: 'bench-press', name: 'Barbell Bench Press', sets: 4 },
        { id: 'incline-db-press', name: 'Incline DB Press', sets: 3, db: true },
        { id: 'chinups', name: 'Chin-ups', sets: 3, bw: true },
      ],
    },
  },
});

// El registro real del 2026-08-24 (Supabase, record mt73p36r4y29hf), recortado.
const AUG24 = {
  id: 'mt73p36r4y29hf', date: '2026-08-24', session: 'upperA', sessionName: 'Upper A',
  unit: 'kg', duration: '70:26',
  exercises: [
    { exerciseId: 'bench-press', compound: true, sets: [
      { weight: 95, reps: 8, rpe: 7.5, done: true },
      { weight: 90, reps: 8, rpe: 8, done: true },
    ] },
    { exerciseId: 'incline-db-press', db: true, sets: [
      { weight: 30, reps: 12, rpe: 7, done: true },
    ] },
  ],
};

sec('1. loggedUnit — una sola fuente de verdad');
ok(typeof ctx.loggedUnit === 'function', 'loggedUnit existe en app.js');
ok(loggedUnit({ unit: 'lb' }) === 'lb', 'lee w.unit');
ok(loggedUnit({ inputUnit: 'lb' }) === 'lb', 'lee w.inputUnit');
ok(loggedUnit({ inputUnit: 'lb', unit: 'kg' }) === 'lb',
  'inputUnit manda sobre unit: son los pesos tal y como se están tecleando, sin convertir aún');
ok(loggedUnit({}) === 'kg', 'sin ninguna de las dos, cae al ajuste de la app');
ok(loggedUnit(null) === 'kg', 'null no lanza');
ctx._setAppUnit('lb');
ok(loggedUnit({}) === 'lb', 'el fallback sigue al ajuste');
ok(loggedUnit({ unit: 'kg' }) === 'kg', 'pero un registro con unidad propia NO se deja arrastrar');
ctx._setAppUnit('kg');

sec('2. Ficha de edición y transcript leen lo MISMO — el fallo del 24-ago');
// La ficha ya no puede deducir la unidad por su cuenta: ambas pasan por loggedUnit.
const EDIT_SRC = slice('async function openEditWorkout(id) {', 'function closeEditWorkout', 'openEditWorkout');
ok(/const unit = loggedUnit\(w\)/.test(EDIT_SRC), 'openEditWorkout usa loggedUnit(w)');
ok(!/w\.inputUnit \|\| appUnit/.test(EDIT_SRC), 'ya no queda el `w.inputUnit || appUnit` que ignoraba w.unit');
ok(/const unit = loggedUnit\(w\)/.test(TRANSCRIPT_SRC), 'buildWhoopTranscript usa loggedUnit(w)');
ok(!/w\.unit \|\| state\.settings\.unit/.test(TRANSCRIPT_SRC), 'ya no queda el `w.unit || settings` que ignoraba inputUnit');
// Y el aviso en el título salta por la unidad EFECTIVA, no sólo por inputUnit.
ok(/if \(unit !== appUnit\)/.test(EDIT_SRC),
  'el aviso de unidad en el título salta siempre que el registro no esté en la unidad de la app');

// La discrepancia, reproducida: mismo registro, las dos vías tienen que coincidir SIEMPRE.
for (const [inputUnit, unit] of [[null, 'lb'], [null, 'kg'], ['lb', 'kg'], ['kg', 'lb'], [null, null]]) {
  const w = { ...AUG24, unit, inputUnit };
  if (!unit) delete w.unit;
  if (!inputUnit) delete w.inputUnit;
  const fichaUnit = loggedUnit(w);                      // lo que pinta openEditWorkout
  const txt = buildWhoopTranscript(w);                  // lo que copia el botón
  ok(txt.includes(`95 ${fichaUnit}`),
    `registro {unit:${unit}, inputUnit:${inputUnit}} → ficha y transcript dicen "${fichaUnit}"`);
  ok(!txt.includes(`95 ${fichaUnit === 'kg' ? 'lb' : 'kg'}`), '  …y no aparece la otra unidad');
}

sec('3. El transcript etiqueta, NUNCA convierte');
const txtKg = buildWhoopTranscript(AUG24);
ok(txtKg.includes('95 kg') && txtKg.includes('90 kg'), 'los números salen tal cual se guardaron');
ok(!/209|198/.test(txtKg), 'no hay conversión encubierta a lb');
ok(txtKg.includes('30 kg/DB'), 'mancuerna: peso por mancuerna, con la misma unidad');
const txtLb = buildWhoopTranscript({ ...AUG24, unit: 'lb' });
ok(txtLb.includes('95 lb'), 'con unit lb cambia la ETIQUETA, no el número');
ok(txtLb.replace(/lb/g, 'kg') === txtKg, 'kg y lb producen texto idéntico salvo la etiqueta');

sec('4. El registro real del 24-ago sale en kg');
ok(loggedUnit(AUG24) === 'kg', 'unit: "kg" en Supabase → kg');
ok(txtKg.includes('Upper A') && txtKg.includes('2026-08-24'), 'cabecera con sesión y fecha');
ok(txtKg.includes('@ RPE 7.5'), 'lleva el RPE, que es lo que WHOOP necesita para la carga');

sec('5. Guardar no puede reetiquetar pesos sin convertirlos');
const SAVE_SRC = slice('async function saveEditWorkout() {', 'async function deleteEditWorkout', 'saveEditWorkout');
ok(/if \(w\.inputUnit \|\| !w\.unit\) w\.unit = appUnit;/.test(SAVE_SRC),
  'w.unit sólo se reasigna si hubo conversión (inputUnit) o si el registro no traía unidad');
ok(!/^\s*w\.unit = appUnit;\s*$/m.test(SAVE_SRC),
  'ya no queda la reasignación incondicional que convertía 205 lb en "205 kg"');
ok(/delete w\.inputUnit/.test(SAVE_SRC), 'inputUnit se sigue limpiando tras el round-trip');

// La regla, ejecutada sobre los tres casos que importan.
const applySave = (w, appUnit) => { if (w.inputUnit || !w.unit) w.unit = appUnit; delete w.inputUnit; return w; };
ok(applySave({ unit: 'lb' }, 'kg').unit === 'lb',
  'entrenamiento de abril en lb: se guarda la nota y SIGUE en lb');
ok(applySave({ unit: 'kg', inputUnit: 'lb' }, 'kg').unit === 'kg',
  'borrador tecleado en lb con la app en kg: tras convertir, queda en kg');
ok(applySave({}, 'kg').unit === 'kg', 'registro antiguo sin unidad: se sella con la de la app');

sec('6. La calculadora de discos no puede sellar la unidad de la sesión');
// finishWorkout estampa `state.settings.unit`. Cualquiera que escriba ese ajuste decide en qué
// unidad queda grabado el entrenamiento — y una calculadora no puede tener ese poder.
// Ojo con el ancla: el toggle de la CABECERA del entrenamiento (#unit-toggle) sí escribe
// state.settings.unit, y debe hacerlo — es el control con el que se elige la unidad de la sesión.
// Aquí se recorta sólo el bloque de la hoja de discos.
const SHEET_SRC = slice("const sheetInput = document.getElementById('plate-sheet-input');", '// Backup / Restore / CSV', 'handler de la hoja de discos');
ok(!/state\.settings\.unit\s*=/.test(SHEET_SRC),
  'el toggle de la hoja NO escribe state.settings.unit');
ok(!/dbPut\('settings'/.test(SHEET_SRC), 'y no persiste ningún ajuste');
ok(/plateSheetUnit = btn\.dataset\.sheetUnit/.test(SHEET_SRC), 'usa su propia variable local');
ok(!/#unit-toggle/.test(SHEET_SRC), 'tampoco mueve el selector de unidad de la cabecera');
// Sincronización de una sola dirección: ajuste → hoja, al abrir.
const OPEN_SHEET_SRC = slice('function openPlateSheet(prefillWeight) {', 'function closePlateSheet', 'openPlateSheet');
ok(/plateSheetUnit = state\.settings\.unit/.test(OPEN_SHEET_SRC), 'openPlateSheet copia el ajuste a la hoja');
ok(!/renderPlateInto\('plate-sheet-input', 'plate-sheet-result', unit\)/.test(OPEN_SHEET_SRC),
  'no queda la referencia a la variable `unit` que se eliminó');
// La gemela de Ajustes ya lo hacía bien; que siga haciéndolo.
ok(/plateCalcUnit = btn\.dataset\.plateUnit/.test(SRC), 'la calculadora de Ajustes sigue con unidad local');

sec('7. convertWeight: sin regresiones');
ok(convertWeight(100, 'lb', 'kg') === 45.36, '100 lb → 45.36 kg');
ok(convertWeight(100, 'kg', 'lb') === 220.46, '100 kg → 220.46 lb');
ok(convertWeight(95, 'kg', 'kg') === 95, 'misma unidad: intacto');
ok(convertWeight(0, 'lb', 'kg') === 0, 'cero: intacto');
ok(convertWeight(95, undefined, 'kg') === 95, 'sin unidad de origen: intacto, no NaN');

console.log(fail === 0
  ? '\nPASS — la unidad de un registro tiene una sola fuente, y guardar no la reescribe\n'
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
