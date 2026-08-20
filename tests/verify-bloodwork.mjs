// Verifica app/bloodwork.js contra el documento y contra sus propios invariantes.
//
// Lo que busca:
//   1. Que los intervalos de cada marcador estén ANIDADOS (si no, el puntaje es basura)
//   2. Regla A: ningún marcador tiene un 5 disponible sin objetivo publicado (`source`)
//   3. Que los puntajes que produce la app COINCIDAN con la tabla maestra del documento
//   4. Que toda clave usada en BLOOD_PANELS tenga definición en BLOOD_MARKERS (y al revés)
//   5. Que ningún marcador quede sin puntaje Y sin motivo escrito
//   6. Antigüedad
//
// Es el test que obliga a que documento y app digan lo mismo. Si divergen, uno de los dos
// está mal y hay que arreglarlo, no silenciar el test.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Ruta relativa: se ejecuta desde la raíz del repo (node tests/verify-bloodwork.mjs).
const SRC = 'app/bloodwork.js';
const ctx = { console };
vm.createContext(ctx);
// Las declaraciones `const` de un script no caen en el objeto global del contexto, así que
// se exponen a mano. Las `function` sí, pero se listan igual para que quede explícito.
const EXPORTS = ['BLOOD_MARKERS', 'BLOOD_PANELS', 'BLOOD_FAMILIES', 'BLOOD_NEVER_MEASURED',
  'BLOOD_REQUEST_LIST', 'BLOOD_SUPPLEMENTS', 'scoreMarker', 'bloodStaleness',
  'bloodMarkerLatest', 'bloodMarkerSeries', 'bloodMarkerState', 'bloodFreshnessSummary',
  'bloodMarkerDef'];
vm.runInContext(
  readFileSync(SRC, 'utf8') + '\n' + EXPORTS.map(n => `globalThis.${n} = ${n};`).join('\n'),
  ctx
);
const {
  BLOOD_MARKERS, BLOOD_PANELS, BLOOD_FAMILIES, BLOOD_NEVER_MEASURED,
  scoreMarker, bloodStaleness, bloodMarkerLatest, bloodMarkerSeries,
  bloodMarkerState, bloodFreshnessSummary,
} = ctx;

const HOY = '2026-08-20';
let fail = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fail++; };
const sec = (t) => console.log(`\n=== ${t} ===`);

// ---------- 1. Los intervalos se anidan ----------
sec('1. Invariante: los intervalos se anidan del 5 al 1');
function nestError(bands) {
  for (let i = 1; i < bands.length; i++) {
    const prev = bands[i - 1], cur = bands[i];
    if (cur.score >= prev.score) return `el puntaje no decrece (${prev.score} → ${cur.score})`;
    const minOk = cur.min == null || (prev.min != null && cur.min <= prev.min);
    const maxOk = cur.max == null || (prev.max != null && cur.max >= prev.max);
    if (!minOk) return `banda ${cur.score}: min ${cur.min} no contiene el min ${prev.min} de la banda ${prev.score}`;
    if (!maxOk) return `banda ${cur.score}: max ${cur.max} no contiene el max ${prev.max} de la banda ${prev.score}`;
  }
  return null;
}
for (const m of BLOOD_MARKERS.filter(m => m.shape)) {
  const err = nestError(m.bands);
  ok(err === null, `${m.label}${err ? ' — ' + err : ''}`);
}

// ---------- 2. Regla A: sin objetivo publicado no hay 5 ----------
sec('2. Regla A: ningún 5 sin objetivo publicado');
for (const m of BLOOD_MARKERS.filter(m => m.shape)) {
  const has5 = m.bands.some(b => b.score === 5);
  if (has5) {
    ok(!!m.source, `${m.label}: ofrece un 5 y cita fuente (${m.source || 'NINGUNA'})`);
  } else {
    ok(true, `${m.label}: tope en ${Math.max(...m.bands.map(b => b.score))} — sin diana publicada`);
  }
}
// Los cinco que deben topar en 4 por la Regla A:
for (const k of ['vitD', 'tsh', 'creatinine', 'ferritin', 'homocysteine']) {
  const m = BLOOD_MARKERS.find(x => x.key === k);
  ok(!m.bands.some(b => b.score === 5), `${m.label} NO puede sacar un 5 (Regla A)`);
}

// ---------- 3. La app coincide con la tabla maestra del documento ----------
sec('3. Los puntajes coinciden con la tabla maestra del documento');
// Cada fila: [clave, valor esperado, fecha esperada, puntaje esperado del documento]
const TABLA_DOC = [
  ['nonHdl', 165, '2025-02-04', 2],
  ['apoB', 110, '2023-08-07', 2],
  ['tg', 126, '2025-02-04', 5],
  ['hba1c', 5.3, '2023-08-07', 5],
  ['glucose', 95, '2024-09-20', 5],
  ['vitD', 11.2, '2023-08-07', 1],
  ['homocysteine', 9, '2023-08-07', 4],
  ['ferritin', 191, '2023-08-07', 4],
  ['tsh', 3.07, '2024-09-20', 4],   // corregido: el doc decía 3, la rúbrica da 4
  ['creatinine', 1.15, '2024-09-20', 4],
  ['egfr', 84, '2024-09-20', 4],
  ['urea', 59.0, '2024-09-20', 2],  // corregido: el doc decía 4, y 59 está FUERA del intervalo
];
for (const [key, valEsperado, fechaEsperada, puntajeEsperado] of TABLA_DOC) {
  const l = bloodMarkerLatest(key, HOY);
  ok(l != null, `${key}: existe el marcador`);
  if (!l) continue;
  ok(l.value === valEsperado, `${l.def.label}: valor ${l.value} == ${valEsperado}`);
  ok(l.date === fechaEsperada, `${l.def.label}: fecha ${l.date} == ${fechaEsperada}`);
  ok(l.score === puntajeEsperado, `${l.def.label}: puntaje ${l.score} == ${puntajeEsperado} (documento)`);
}

// Los que el documento dice explícitamente que NO se puntúan
sec('3b. Los marcadores que el documento excluye siguen sin puntaje');
for (const k of ['insulin', 'homa', 'hdl', 'ldlCalc', 'totalChol', 'apoA1', 'ldlHdlRatio', 'crp', 'ast', 'alt']) {
  const l = bloodMarkerLatest(k, HOY);
  ok(l && l.score === null, `${l ? l.def.label : k}: sin puntaje, como manda el documento`);
}

// El HDL usa el indicador de tres estados en vez de puntaje
sec('3c. El HDL se lee en tres estados, no en puntaje');
ok(bloodMarkerState('hdl', 65) === 'sin señal', 'HDL 65 → "sin señal" (no "bueno ✅")');
ok(bloodMarkerState('hdl', 35) === 'bajo — marcador de riesgo', 'HDL 35 → marcador de riesgo');
ok(bloodMarkerState('hdl', 95) === 'muy alto', 'HDL 95 → muy alto (cohortes con curva en U)');

// ---------- 4. Claves cruzadas ----------
sec('4. Toda clave medida tiene definición, y toda definición tiene medición');
const defKeys = new Set(BLOOD_MARKERS.map(m => m.key));
const panelKeys = new Set(BLOOD_PANELS.flatMap(p => Object.keys(p.values)));
for (const k of panelKeys) ok(defKeys.has(k), `clave medida "${k}" tiene definición`);
const sinMedir = [...defKeys].filter(k => !panelKeys.has(k));
ok(sinMedir.length === 0, `ninguna definición sin medición${sinMedir.length ? ' — sobran: ' + sinMedir.join(', ') : ''}`);

// Toda familia declarada se usa, y todo marcador cae en una familia declarada
const famKeys = new Set(BLOOD_FAMILIES.map(f => f.key));
for (const m of BLOOD_MARKERS) ok(famKeys.has(m.family), `${m.label}: familia "${m.family}" declarada`);

// ---------- 5. Nada queda sin puntaje y sin explicación ----------
sec('5. Todo marcador sin puntaje explica por qué');
for (const m of BLOOD_MARKERS) {
  if (m.shape) ok(Array.isArray(m.bands) && m.bands.length >= 2, `${m.label}: tiene bandas`);
  else ok(!!m.noScore, `${m.label}: sin puntaje, con motivo escrito`);
}

// ---------- 6. Antigüedad ----------
sec('6. Antigüedad (eje separado del puntaje)');
ok(bloodStaleness('2025-02-04', HOY).level === 'caducado', 'lípidos feb-2025 (18 m) → caducado');
ok(bloodStaleness('2023-08-07', HOY).level === 'historico', 'panel rico ago-2023 (36 m) → histórico');
ok(bloodStaleness('2026-06-01', HOY).level === 'fresco', 'jun-2026 sería fresco');
const fs_ = bloodFreshnessSummary(HOY);
ok(fs_.overdue === true, `avisa de caducidad: el panel más nuevo tiene ${fs_.newestMonths} meses (>12)`);
ok(fs_.historic > 0, `${fs_.historic} marcadores con más de 24 meses`);
ok(fs_.neverMeasured === BLOOD_NEVER_MEASURED.length, `${fs_.neverMeasured} marcadores nunca medidos`);

// ---------- 7. El caso que motivó separar los dos ejes ----------
sec('7. Puntaje y antigüedad no se leen como lo mismo');
const vd = bloodMarkerLatest('vitD', HOY);
ok(vd.score === 1 && vd.stale.level === 'historico',
  `vitamina D se presenta como "1/5, medido hace ${vd.stale.months} meses", no como un hecho de hoy`);

// ---------- 8. Series y trazabilidad de laboratorio ----------
sec('8. Series longitudinales');
ok(bloodMarkerSeries('creatinine').length === 3, 'creatinina tiene 3 mediciones (1,44 → 1,40 → 1,15)');
ok(bloodMarkerSeries('glucose').length === 5, 'glucosa tiene 5 mediciones');
const ldl = bloodMarkerSeries('ldlCalc');
ok(ldl.length === 3 && new Set(ldl.map(x => x.lab)).size === 2,
  'la serie de LDL registra los DOS laboratorios — es lo que hace la comparación no comparable');
ok(bloodMarkerLatest('lp_a', HOY) === null, 'un marcador nunca medido devuelve null, no un cero');

// ---------- 9. Valores ausentes ----------
sec('9. Ausentes e ilegibles');
ok(scoreMarker(bloodMarkerDefBands('apoB'), null) === null, 'valor null → sin puntaje (no se inventa)');
ok(scoreMarker(bloodMarkerDefBands('apoB'), NaN) === null, 'valor no numérico → sin puntaje');
ok(BLOOD_MARKERS.find(m => m.key === 'b6').uncertain === true, 'la B6 queda marcada como no legible y no se puntúa');
function bloodMarkerDefBands(k) { return BLOOD_MARKERS.find(m => m.key === k).bands; }

console.log(fail === 0
  ? `\nPASS — bloodwork.js es consistente con el documento y con su propia rúbrica\n`
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
