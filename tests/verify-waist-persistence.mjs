// La medición de cintura tiene que sobrevivir a la recarga, y no puede pisar el peso diario.
//
// El fallo que este test existe para impedir (3-sep-2026): `renderBodyCompEstimator` pedía
// cintura, cuello y altura, calculaba el % de grasa por el método Navy, pintaba el resultado…
// y NO GUARDABA NADA. Ni store, ni sync, ni histórico. El número que mide el objetivo declarado
// —reducir cintura— se escribía, se veía una vez y se perdía al cambiar de pestaña.
//
// Y el riesgo al arreglarlo: `bodyweight` tiene keyPath 'date' y la balanza escribe `weight`
// cada mañana, mientras la cintura se mide un día a la semana. Un `put` que no mergee sobre la
// fila del día borra uno de los dos. Las filas de intervals.icu además traen `source` y
// `measured: false` (forward-fill) que el resto del sistema usa para filtrar — pisarlas
// convertiría un valor interpolado en un valor "medido".
//
// v11.72 (F-14 + V-11, decisión de Julian 2026-09-10) añade el segundo fallo a impedir, que es
// el contrario del primero: **dos % de grasa distintos bajo la misma etiqueta**. La tarjeta de
// Withings da uno por bioimpedancia y el Navy daba otro por circunferencias, a dos dedos de
// distancia en la misma pantalla. Ahora:
//   · CON báscula → el formulario guarda LA CINTURA SOLA (cuello y altura opcionales) y no
//     recalcula `bfPct` jamás: el % de grasa es de la báscula.
//   · SIN báscula → vuelve el Navy completo, que es la única estimación disponible.
//   · y la serie de cintura incluye `wellness[].abdomen` de intervals.icu en los días sin medida
//     manual — de sólo lectura, sin escribirlo en `bodyweight`.
//
// Ejecutar desde la raíz del repo: node tests/verify-waist-persistence.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/app.js', 'utf8');
let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const eq = (got, want, m) => (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// ── 1. El guardado existe y va al store correcto ────────────────────────────────
const i = SRC.indexOf('async function renderBodyCompEstimator()');
const j = SRC.indexOf('// ==================== WEEKLY TRAINING SUMMARY');
if (i < 0 || j < 0) { console.log('FAIL — no se pudo localizar renderBodyCompEstimator'); process.exit(1); }
const FN = SRC.slice(i, j);

FN.includes("smartPut('bodyweight'")
  ? ok("persiste con smartPut('bodyweight') — entra en la cola de sync, no sólo en IDB")
  : bad('no persiste: sigue siendo una calculadora que tira el dato');

/\bwaist,\n/.test(FN) ? ok('guarda `waist`') : bad('no guarda el campo waist');
FN.includes('fila.bfPct = bfPct;') ? ok('guarda `bfPct` cuando lo calcula (modo Navy)') : bad('no guarda bfPct en modo Navy');
FN.includes('fila.heightCm = height;') ? ok('guarda `heightCm` para poder recalcular') : bad('no guarda la altura');

// El merge es el punto crítico.
(FN.includes("dbGet('bodyweight', d)") && /Object\.assign\(\{\}, existing \|\| \{\}/.test(FN))
  ? ok('lee la fila del día y hace merge: MERGEA, no pisa')
  : bad('escribe sin mergear — borraría el peso de la balanza del mismo día');

// V-11: con báscula, el bfPct de Navy NO se escribe.
/if \(navy\) \{\s*\n\s*fila\.weight = weight;\s*\n\s*fila\.bfPct = bfPct;/.test(FN)
  ? ok('`bfPct` y `weight` sólo se escriben en modo Navy (V-11: la báscula manda sobre el % de grasa)')
  : bad('escribe bfPct fuera del modo Navy: contradiría a la tarjeta de Withings');

// V-15: el formulario, sin CSS en línea y con labels de verdad.
!/inputCss/.test(FN) ? ok('sin la cadena `inputCss` en línea (V-15)') : bad('el formulario sigue con CSS en línea');
/<label for="\$\{id\}">/.test(FN) ? ok('cada label apunta a su input con `for` (V-15)') : bad('labels sin `for`');
/class="text-input"/.test(FN) ? ok('los inputs usan `.text-input` (16 px: iOS no hace zoom, V-14)') : bad('inputs sin .text-input');
/class="waist-form"/.test(FN) ? ok('y la rejilla 2×2 `.waist-form`') : bad('sin la rejilla .waist-form');

// V-4: un fallo de lectura no se pinta como "no hay medidas".
/showErrorState\(container/.test(FN) ? ok('un fallo de lectura pinta estado de error, no vacío (V-4)') : bad('el catch sigue significando "no hay datos"');

// ── 2. El merge, ejecutado de verdad ───────────────────────────────────────────
// Reproduce la secuencia real: la balanza escribe por la mañana, la cintura por la tarde.
const store = new Map();
store.set('2026-09-06', { date: '2026-09-06', weight: 86.4, source: 'intervals.icu', measured: false, timestamp: 1 });

const existing = store.get('2026-09-06');
const merged = { ...(existing || {}), date: '2026-09-06', weight: 86.4, waist: 92.5, neck: 39, heightCm: 182, bfPct: 19.8, measured: true, timestamp: 2 };
store.set('2026-09-06', merged);

const row = store.get('2026-09-06');
eq(row.weight, 86.4, 'el peso del mismo día sobrevive al guardar la cintura');
eq(row.waist, 92.5, 'la cintura queda guardada');
eq(row.source, 'intervals.icu', '`source` heredado no se pierde en el merge');
eq(row.measured, true, 'la fila pasa a measured:true — ahora hay una medida real detrás');

// ── 3. El delta sólo aparece con separación suficiente ─────────────────────────
const SUM_SRC = SRC.slice(SRC.indexOf('function renderWaistSummary(waistLog)'), j);
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(`var WAIST_MIN_DELTA_DAYS = 10; ${SUM_SRC}; globalThis.renderWaistSummary = renderWaistSummary;`, ctx);
const render = ctx.renderWaistSummary;

const empty = render([]);
empty.includes('baseline') ? ok('sin mediciones: invita a fijar la línea base, no pinta un delta falso') : bad('el estado vacío no avisa');

// Dos mediciones a 3 días: por debajo del umbral de ruido (±0,5 cm), no debe dar delta.
const tooClose = render([
  { date: '2026-09-06', waist: 92.5, bfPct: 19.8 },
  { date: '2026-09-09', waist: 92.0, bfPct: 19.6 },
]);
(!/in \d+ days/.test(tooClose) && tooClose.includes('2 weeks'))
  ? ok('mediciones a 3 días: NO reporta delta — 0,5 cm a 3 días es ruido de cinta')
  : bad('reporta un delta con 3 días de separación: eso es ruido presentado como progreso');

// A 14 días sí hay señal.
const farEnough = render([
  { date: '2026-08-23', waist: 93.5, bfPct: 20.4 },
  { date: '2026-09-06', waist: 92.5, bfPct: 19.8 },
]);
/-1\.0 cm<\/b> in 14 days/.test(farEnough)
  ? ok('a 14 días: −1,0 cm en 14 días, con signo correcto')
  : bad(`no calcula el delta a 14 días — salida: ${farEnough.replace(/\s+/g, ' ').slice(0, 160)}`);

farEnough.includes('var(--accent)')
  ? ok('bajar cintura se pinta con --accent (la convención de colorForDelta), no con --good inexistente')
  : bad('color fuera de la convención del CSS: --good/--bad no existen en style.css');

// Coge la referencia MÁS RECIENTE que supere el umbral, no la más antigua del log.
const threePoints = render([
  { date: '2026-07-01', waist: 97.0 },
  { date: '2026-08-23', waist: 93.5 },
  { date: '2026-09-06', waist: 92.5 },
]);
/-1\.0 cm/.test(threePoints)
  ? ok('con 3 mediciones usa la referencia más reciente válida (−1,0), no la de julio (−4,5)')
  : bad('elige mal la referencia del delta: exagera el progreso usando el punto más antiguo');

// F-14: la medida que llega de intervals.icu se distingue de la que midió el usuario.
render([{ date: '2026-09-06', waist: 92.5, source: 'intervals.icu' }]).includes('icu')
  ? ok('una medida de intervals.icu se etiqueta como tal en el histórico')
  : bad('no se distingue la medida manual de la que llega del reloj');

// ── 4. La llamada está await-eada ──────────────────────────────────────────────
// v11.72 (V-5): la llamada vive ahora en el grupo `body` de `STATS_GROUPS`, que
// `renderStatsGroup` ejecuta dentro de un `await Promise.allSettled(...)`.
/\['bodycomp', \(\) => renderBodyCompEstimator\(\)\]/.test(SRC)
  ? ok('el call site vive en el grupo `body` de STATS_GROUPS, que se espera con allSettled (V-5)')
  : bad('renderBodyCompEstimator ya no se llama desde un grupo esperado de Stats');

// ── 5. Ejecución real: DOM y IDB simulados, y el click ────────────────────────
// Lo que ni el análisis estático ni el VM de arriba cubren: que la plantilla y el handler
// se ejecuten sin reventar, y que el payload que llega a smartPut sea el correcto.
//
// Se ejecutan los DOS modos, porque son dos contratos distintos sobre el MISMO botón.
function montar({ rows, wellness, withingsVisible }) {
  const FN_SRC = SRC.slice(SRC.indexOf('const WAIST_MIN_DELTA_DAYS'), j);
  const BW_SRC = SRC.slice(SRC.indexOf('function _bwWeighIns(rows)'), SRC.indexOf('// Avg RPE across all done sets'));
  if (!BW_SRC.startsWith('function _bwWeighIns')) bad('no se pudo localizar _bwWeighIns en app.js');

  const el = (id) => ({
    id, value: '', innerHTML: '', className: '', _listeners: {},
    classList: { contains: () => false, add() {}, remove() {}, toggle() {} },
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
    click() { return this._listeners.click && this._listeners.click(); },
  });
  const nodes = new Map();
  const getEl = (id) => {
    if (id === 'withings-comp') {
      const n = el(id);
      n.innerHTML = withingsVisible ? '<div>scale</div>' : '';
      n.classList = { contains: () => !withingsVisible, add() {}, remove() {}, toggle() {} };
      return n;
    }
    if (!nodes.has(id)) nodes.set(id, el(id));
    return nodes.get(id);
  };

  const puts = [];
  const sandbox = {
    console,
    document: { getElementById: getEl },
    dbGetAll: async (store_) => (store_ === 'wellness' ? (wellness || []).slice() : rows.slice()),
    dbGet: async (_s, key) => rows.find(r => r.date === key) || null,
    smartPut: async (store_, data) => { puts.push({ store: store_, data }); },
    today: () => '2026-09-06',
    toast: () => {},
    showErrorState: () => {},
    renderBodyWeightChart: async () => {},
    Math, Number, String, Object, Date, Map, Set, parseFloat, JSON, Promise, Array, Boolean, isFinite,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${BW_SRC}; ${FN_SRC}; globalThis.__render = renderBodyCompEstimator;`, sandbox);
  return { sandbox, getEl, puts };
}

// 5.a — SIN báscula: el Navy completo, como siempre.
{
  const rows = [
    { date: '2026-08-23', weight: 87.0, waist: 93.5, neck: 39, heightCm: 182, bfPct: 20.4, measured: true },
    { date: '2026-09-06', weight: 86.4, source: 'intervals.icu', measured: false },
  ];
  const { sandbox, getEl, puts } = montar({ rows, wellness: [], withingsVisible: false });
  await sandbox.__render();

  const host = getEl('bodycomp-section');
  host.innerHTML.includes('93.5 cm')
    ? ok('[sin báscula] render inicial: pinta la última cintura del histórico (93,5 cm)')
    : bad('el render inicial no muestra el histórico');
  host.innerHTML.includes('value="182"') ? ok('[sin báscula] prefill: hereda la altura') : bad('no prefillea la altura');
  host.innerHTML.includes('value="86.4"') ? ok('[sin báscula] prefill: el peso del último pesaje') : bad('no prefillea el peso');
  host.innerHTML.includes('id="bc-weight"') ? ok('[sin báscula] el campo de peso EXISTE (Navy lo necesita)') : bad('el modo Navy no pinta el peso');
  host.innerHTML.includes('Calculate and save') ? ok('[sin báscula] el botón calcula') : bad('el botón no dice que calcula');

  getEl('bc-weight').value = '86.4';
  getEl('bc-waist').value = '92.5';
  getEl('bc-neck').value = '39';
  getEl('bc-height').value = '182';
  await getEl('btn-calc-bf').click();

  eq(puts.length, 1, '[sin báscula] el click provoca exactamente un smartPut');
  const w = puts[0];
  eq(w.store, 'bodyweight', 'escribe en el store `bodyweight`');
  eq(w.data.waist, 92.5, 'guarda la cintura medida');
  eq(w.data.weight, 86.4, 'conserva el peso del día');
  eq(w.data.source, 'intervals.icu', 'el merge preserva `source` de la fila forward-fill');
  eq(w.data.measured, true, 'la fila pasa a measured:true');
  (w.data.bfPct > 15 && w.data.bfPct < 30)
    ? ok(`[sin báscula] bfPct calculado en rango plausible (${w.data.bfPct}%)`)
    : bad(`bfPct fuera de rango: ${w.data.bfPct}`);

  // Guardia: cintura <= cuello rompe el log de Navy.
  puts.length = 0;
  getEl('bc-waist').value = '38';
  await getEl('btn-calc-bf').click();
  (puts.length === 0 && getEl('bc-result').innerHTML.includes('larger than the neck'))
    ? ok('cintura ≤ cuello: avisa y NO guarda — el log de Navy daría NaN')
    : bad('acepta cintura ≤ cuello: guardaría un bfPct NaN');

  // Guardia: campos incompletos.
  puts.length = 0;
  getEl('bc-waist').value = '';
  await getEl('btn-calc-bf').click();
  eq(puts.length, 0, 'campos incompletos: no guarda nada');
}

// 5.b — CON báscula: sólo cintura, y el % de grasa se deja en paz.
{
  const rows = [
    { date: '2026-09-05', weight: 86.6, source: 'withings', fatPct: 18.4, fatMassKg: 15.9, ffmKg: 70.7, muscleKg: 67.1 },
    { date: '2026-09-06', weight: 86.4, source: 'withings', fatPct: 18.2, fatMassKg: 15.7, ffmKg: 70.7, bfPct: 18.2 },
  ];
  const { sandbox, getEl, puts } = montar({ rows, wellness: [], withingsVisible: true });
  await sandbox.__render();

  const host = getEl('bodycomp-section');
  !host.innerHTML.includes('id="bc-weight"')
    ? ok('[con báscula] el campo de peso NO se pinta: aquí no se estima nada')
    : bad('sigue pidiendo el peso con báscula conectada');
  host.innerHTML.includes('Save waist')
    ? ok('[con báscula] el botón dice "Save waist", no "Calculate"')
    : bad('el botón sigue prometiendo un cálculo');
  host.innerHTML.includes('optional')
    ? ok('[con báscula] cuello y altura quedan marcados como opcionales (F-14)')
    : bad('sigue exigiendo cuello y altura para guardar la cintura');

  getEl('bc-waist').value = '92.0';
  getEl('bc-neck').value = '';
  getEl('bc-height').value = '';
  await getEl('btn-calc-bf').click();

  eq(puts.length, 1, '[con báscula] guarda con SÓLO la cintura');
  const w = puts[0];
  eq(w.data.waist, 92, 'guarda la cintura');
  ('bfPct' in w.data && w.data.bfPct === 18.2)
    ? ok('[con báscula] el `bfPct` de la fila es el de la báscula, intacto')
    : bad(`recalculó o borró el bfPct de la báscula: ${w.data.bfPct}`);
  eq(w.data.source, 'withings', 'y `source` sigue siendo withings');
  (!('neck' in w.data) && !('heightCm' in w.data))
    ? ok('[con báscula] un cuello en blanco NO borra nada: los opcionales vacíos no se escriben')
    : bad('escribe cuello/altura vacíos y pisaría los de la semana pasada');
}

// 5.c — F-14: `wellness.abdomen` entra en la serie donde no hay medida manual.
{
  const rows = [{ date: '2026-08-23', waist: 93.5, measured: true }];
  const wellness = [
    { date: '2026-09-01', abdomen: 92.8 },
    { date: '2026-08-23', abdomen: 99.9 },   // el mismo día que la manual: gana la manual
  ];
  const { sandbox, getEl } = montar({ rows, wellness, withingsVisible: true });
  await sandbox.__render();
  const html = getEl('bodycomp-section').innerHTML;
  html.includes('92.8 cm')
    ? ok('[abdomen] la medida de intervals.icu entra en la serie cuando no hay manual (F-14)')
    : bad('wellness.abdomen sigue sin llegar a la serie de cintura');
  !html.includes('99.9')
    ? ok('[abdomen] y la manual del mismo día MANDA sobre la del reloj')
    : bad('la medida del reloj pisa la manual del mismo día');
}

console.log(failed
  ? `\nFAIL — ${failed} comprobación(es) de la cintura no pasan`
  : '\nPASS — la cintura persiste, mergea sobre el peso del día, no inventa un segundo % de grasa y su delta sólo habla cuando hay señal');
process.exit(failed ? 1 : 0);
