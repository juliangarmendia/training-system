// Smoke test de la vista de analítica: extrae las funciones de render de app.js, las corre con
// un DOM mínimo y comprueba el HTML resultante.
//
// Lo que busca (todos son fallos que `node --check` NO detecta):
//   - que ninguna referencia quede sin definir en tiempo de ejecución
//   - que no aparezca "undefined" ni "NaN" en el HTML pintado
//   - que la cabecera de aviso y el de caducidad estén presentes (LONG-003)
//   - que TODOS los marcadores medidos aparezcan, incluidos los que no se puntúan
//   - que el puntaje y la antigüedad se pinten como DOS elementos distintos
//
// Ejecutar desde la raíz del repo: node <ruta>/verify-analytics-render.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync('app/app.js', 'utf8');
const BLOOD = readFileSync('app/bloodwork.js', 'utf8');

// Extrae el bloque de la vista de app.js (entre sus dos marcadores de sección).
const START = '// ==================== ANALÍTICA DE SANGRE (v11.43) ====================';
const END = '// T5.1: compact day-count selector on Home.';
const i = APP.indexOf(START), j = APP.indexOf(END);
if (i < 0 || j < 0 || j <= i) {
  console.log('FAIL — no se encontró el bloque de la vista en app.js');
  process.exit(1);
}
const VIEW = APP.slice(i, j);

// --- DOM mínimo ---
let capturedHTML = '';
const listeners = [];
const fakeEl = {
  set innerHTML(v) { capturedHTML = v; },
  get innerHTML() { return capturedHTML; },
  addEventListener: (ev, fn) => listeners.push([ev, fn]),
  textContent: '',
};
const ctx = {
  console,
  document: {
    getElementById: (id) => (id === 'analytics-body' ? fakeEl : (id === 'an-copy' ? fakeEl : null)),
  },
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout: () => {},
  showView: () => {},
};
vm.createContext(ctx);

let fail = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fail++; };

console.log('\n=== La vista renderiza sin lanzar ===');
try {
  // Las `const` de un script no caen en el global del contexto: se exponen a mano.
  const EXPORTS = ['renderAnalytics', 'BLOOD_MARKERS', 'BLOOD_NEVER_MEASURED',
    'BLOOD_REQUEST_LIST', 'bloodMarkerLatest'];
  vm.runInContext(
    BLOOD + '\n' + VIEW + '\n' + EXPORTS.map(n => `globalThis.${n} = ${n};`).join('\n'),
    ctx
  );
  ctx.renderAnalytics();
  ok(true, 'renderAnalytics() completa sin excepción');
} catch (e) {
  ok(false, `renderAnalytics() lanzó: ${e.message}`);
  process.exit(1);
}

const html = capturedHTML;
ok(html.length > 3000, `pintó HTML (${html.length} caracteres)`);

console.log('\n=== Nada sin definir en el HTML ===');
ok(!html.includes('undefined'), 'no aparece "undefined"');
ok(!html.includes('NaN'), 'no aparece "NaN"');
ok(!html.includes('[object Object]'), 'no aparece "[object Object]"');
ok(!/>\s*null\s*</.test(html), 'no aparece "null" como texto visible');

console.log('\n=== LONG-003: los avisos están presentes ===');
ok(html.includes('no un diagnóstico'), 'la cabecera dice que no es un diagnóstico');
ok(html.includes('no cambia ningún entrenamiento'), 'dice explícitamente que no cambia el entrenamiento');
ok(html.includes('an-overdue'), 'muestra el aviso de caducidad (el panel más nuevo pasa de 12 meses)');
ok(html.includes('Toca repetir la analítica'), 'el aviso de caducidad tiene texto');
ok(/es de tu médico/.test(html), 'el pie deriva al médico en vez de dar pauta');

console.log('\n=== Todos los marcadores medidos aparecen ===');
const medidos = ctx.BLOOD_MARKERS
  .map(m => ctx.bloodMarkerLatest(m.key))
  .filter(Boolean);
for (const m of medidos) ok(html.includes(m.def.label), `${m.def.label} está en la vista`);
// 33 = 8 lípidos + 4 metabólico + 8 micronutrientes + 2 inflamación + 11 órganos.
// (La primera versión de este test decía 32 — la cuenta estaba mal, no el código.)
ok(medidos.length === 33, `33 marcadores medidos pintados (fueron ${medidos.length})`);
ok(medidos.length === ctx.BLOOD_MARKERS.length, 'ningún marcador definido queda sin pintar');

console.log('\n=== Los que no se puntúan NO se esconden ===');
const sinPuntaje = medidos.filter(m => m.score == null);
ok(sinPuntaje.length > 0, `${sinPuntaje.length} marcadores sin puntaje`);
for (const m of sinPuntaje.slice(0, 4)) ok(html.includes(m.def.label), `${m.def.label} (sin puntaje) visible`);
const noScoreCount = (html.match(/an-noscore/g) || []).length;
ok(noScoreCount >= sinPuntaje.length, `la etiqueta "no se puntúa" aparece ${noScoreCount} veces`);

console.log('\n=== Puntaje y antigüedad son DOS elementos separados ===');
ok(html.includes('an-score s1') && html.includes('an-stale historico'),
  'el puntaje (an-score) y la antigüedad (an-stale) se pintan por separado');
// La vitamina D es el caso que motivó separar los ejes: 1/5 medido hace 36 meses.
const vdIdx = html.indexOf('25-OH vitamina D');
const bloque = html.slice(vdIdx, vdIdx + 700);
ok(/an-score s1/.test(bloque), 'vitamina D pinta el puntaje 1');
ok(/an-stale historico/.test(bloque), 'vitamina D pinta la antigüedad como histórica, aparte del puntaje');
ok(/36 meses/.test(bloque), 'vitamina D dice cuántos meses tiene el dato');

console.log('\n=== Orden: lo peor primero dentro de cada familia ===');
// En lípidos, el ApoB (2) debe ir antes que los que no se puntúan.
ok(html.indexOf('Apolipoproteína B') < html.indexOf('Apolipoproteína A-I'),
  'ApoB (puntaje 2) va antes que ApoA-I (sin puntaje)');
ok(html.indexOf('Colesterol no-HDL') < html.indexOf('Triglicéridos'),
  'no-HDL (2) va antes que triglicéridos (5)');

console.log('\n=== Series longitudinales ===');
ok(html.includes('an-series'), 'pinta series inline');
ok(html.includes('<i>LabCorp</i>') || html.includes('LabCorp'),
  'la serie etiqueta el laboratorio cuando hay más de uno');

console.log('\n=== Suplementación y qué pedir ===');
ok(html.includes('Creatina monohidrato'), 'creatina presente');
ok(html.includes('Grupo A del AIS'), 'cita el marco del AIS');
ok(html.includes('Lo que no vale la pena'), 'incluye lo que no vale la pena');
ok(!/vitamina D.*\d+\.?\d*\s*UI/i.test(html), 'NO hay dosis de vitamina D en la vista (es médico)');
ok(html.includes('an-copy'), 'el botón de copiar la lista existe');
ok(ctx.BLOOD_REQUEST_LIST.every(r => html.includes(r)), 'la lista de qué pedir está completa');

console.log('\n=== El botón de copiar se cablea ===');
ok(listeners.some(([ev]) => ev === 'click'), 'se registró el listener de click del botón copiar');

console.log('\n=== Nunca medido ===');
for (const n of ctx.BLOOD_NEVER_MEASURED) ok(html.includes(n.label), `"${n.label}" aparece en nunca-medido`);

console.log(fail === 0 ? '\nPASS — la vista de analítica renderiza correcta y completa\n'
                       : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
