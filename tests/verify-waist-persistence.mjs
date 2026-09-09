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

FN.includes('waist,') ? ok('guarda `waist`') : bad('no guarda el campo waist');
FN.includes('bfPct,') ? ok('guarda `bfPct` calculado') : bad('no guarda bfPct');
FN.includes('heightCm: height,') ? ok('guarda `heightCm` para poder recalcular') : bad('no guarda la altura');

// El merge es el punto crítico.
(FN.includes("dbGet('bodyweight', d)") && /\.\.\.\(existing \|\| \{\}\)/.test(FN))
  ? ok('lee la fila del día y hace spread: MERGEA, no pisa')
  : bad('escribe sin mergear — borraría el peso de la balanza del mismo día');

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

// ── 4. La llamada está await-eada ──────────────────────────────────────────────
// v11.66 (V-7c): `renderStats` dejó de ser veinte `await` en serie. La llamada vive ahora
// dentro de una de las tres tandas (`await Promise.allSettled(...)`), así que sigue
// esperada — pero ya no como `await renderBodyCompEstimator();` literal.
/\['bodycomp', \(\) => renderBodyCompEstimator\(\)\]/.test(SRC)
  ? ok('el call site va dentro de una tanda await-eada de renderStats (V-7c)')
  : bad('renderBodyCompEstimator ya no se llama desde una tanda esperada de renderStats');

// ── 5. Ejecución real: DOM y IDB simulados, y el click ────────────────────────
// Lo que ni el análisis estático ni el VM de arriba cubren: que la plantilla y el handler
// se ejecuten sin reventar, y que el payload que llega a smartPut sea el correcto.
{
  const FN_SRC = SRC.slice(SRC.indexOf('const WAIST_MIN_DELTA_DAYS'), j);
  // v11.69: el prefill del peso pasa por `_bwWeighIns` (filas CON peso, ascendentes), que vive junto a
  // `getBodyweightLatest` y no dentro de la rebanada de arriba. Se trae tal cual: es el mismo código.
  const BW_SRC = SRC.slice(SRC.indexOf('function _bwWeighIns(rows)'), SRC.indexOf('// Avg RPE across all done sets'));
  if (!BW_SRC.startsWith('function _bwWeighIns')) { bad('no se pudo localizar _bwWeighIns en app.js'); }

  const el = (id) => ({
    id, value: '', innerHTML: '', _listeners: {},
    addEventListener(ev, fn) { this._listeners[ev] = fn; },
    click() { return this._listeners.click && this._listeners.click(); },
  });
  const nodes = new Map();
  const getEl = (id) => { if (!nodes.has(id)) nodes.set(id, el(id)); return nodes.get(id); };

  // La balanza ya escribió el peso esta mañana, con una fila forward-fill de intervals.icu.
  const rows = [
    { date: '2026-08-23', weight: 87.0, waist: 93.5, neck: 39, heightCm: 182, bfPct: 20.4, measured: true },
    { date: '2026-09-06', weight: 86.4, source: 'intervals.icu', measured: false },
  ];
  const puts = [];

  const sandbox = {
    console,
    document: { getElementById: getEl },
    dbGetAll: async () => rows.slice(),
    dbGet: async (_s, key) => rows.find(r => r.date === key) || null,
    smartPut: async (store, data) => { puts.push({ store, data }); },
    today: () => '2026-09-06',
    toast: () => {},
    renderBodyWeightChart: async () => {},
    Math, Number, String, Object, Date, parseFloat, JSON,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`${BW_SRC}; ${FN_SRC}; globalThis.__render = renderBodyCompEstimator;`, sandbox);

  await sandbox.__render();

  const host = getEl('bodycomp-section');
  host.innerHTML.includes('93.5 cm')
    ? ok('render inicial: pinta la última cintura del histórico (93,5 cm)')
    : bad('el render inicial no muestra el histórico');
  host.innerHTML.includes('value="182"')
    ? ok('prefill: hereda la altura de la medición anterior')
    : bad('no prefillea la altura');
  host.innerHTML.includes('value="86.4"')
    ? ok('prefill: el peso viene del último pesaje de la balanza (86,4)')
    : bad('no prefillea el peso desde el último pesaje');

  // El usuario mide 92,5 y pulsa el botón.
  getEl('bc-weight').value = '86.4';
  getEl('bc-waist').value = '92.5';
  getEl('bc-neck').value = '39';
  getEl('bc-height').value = '182';
  await getEl('btn-calc-bf').click();

  eq(puts.length, 1, 'el click provoca exactamente un smartPut');
  const w = puts[0];
  eq(w.store, 'bodyweight', 'escribe en el store `bodyweight`');
  eq(w.data.waist, 92.5, 'guarda la cintura medida');
  eq(w.data.weight, 86.4, 'conserva el peso del día');
  eq(w.data.source, 'intervals.icu', 'el merge preserva `source` de la fila forward-fill');
  eq(w.data.measured, true, 'la fila pasa a measured:true');
  (w.data.bfPct > 15 && w.data.bfPct < 30)
    ? ok(`bfPct calculado en rango plausible (${w.data.bfPct}%)`)
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

console.log(failed
  ? `\nFAIL — ${failed} comprobación(es) de la cintura no pasan`
  : '\nPASS — la cintura persiste, mergea sobre el peso del día y su delta sólo habla cuando hay señal');
process.exit(failed ? 1 : 0);
