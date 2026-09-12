// verify-home-render.mjs — v11.66 (auditoría 2026-09-08, incremento 1: P0 + rendimiento)
//
// El fallo que este test existe para impedir: que un renderer siga escribiendo en un
// contenedor que ya no existe, y que nadie se entere.
//
// Fue el patrón de TRES bugs P0 a la vez, todos con la misma forma:
//   • B-1/B-2 — `viewCompletedWorkout()` hacía `getElementById('workout-notes').style` sobre un
//     textarea retirado hacía versiones. Lanzaba ANTES de activar la vista, así que tocar un día
//     ya entrenado en el calendario de Home no abría NADA y el botón de volver quedaba muerto.
//     Sin excepción visible: la promesa se rechazaba y se perdía.
//   • B-3 — `renderWeekStrip()` escribía en `#week-strip`, sustituido por `renderWeekCalendar()`.
//     Once llamadores, once promesas rechazadas por cada guardado de entreno.
//   • E-12 — seis renderers más (`renderActivityRings`, `renderStreakBanner`,
//     `renderRecentActivity`, …) leían tres tablas de IndexedDB para no pintar nada, porque su
//     contenedor tampoco existía. Y `renderStepsCard()`, al contrario: pintaba bien, pero nadie
//     le había dado un sitio, así que los pasos de intervals.icu se perdían.
//
// Y los tres compañeros de viaje del mismo incremento, por la misma razón (un fallo que no se
// ve no se arregla): `init()`/`renderHomeView()` sin `catch`, `innerHTML` con texto del modelo
// de fotos sin escapar, y un service worker que precacheaba 2,2 MB de forma atómica.
//
// Uso: node tests/verify-home-render.mjs

import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

let fails = 0;
let checks = 0;
function yes(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error('  FAIL ' + msg); }
}
function section(t) { console.log('\n' + t); }

const APP = readFileSync('app/app.js', 'utf8');
const COACH = readFileSync('app/coach.js', 'utf8');
const INTEG = readFileSync('app/integrations.js', 'utf8');
const NUT = readFileSync('app/nutrition.js', 'utf8');
const HTML = readFileSync('app/index.html', 'utf8');
const SW = readFileSync('app/sw.js', 'utf8');

const JS = { 'app/app.js': APP, 'app/coach.js': COACH, 'app/integrations.js': INTEG };

// ---------------------------------------------------------------------------
// 1 · Todo `getElementById` de un `render*` apunta a un id que existe
// ---------------------------------------------------------------------------
// Un id vale si (a) está en `index.html`, o (b) lo crea el propio fichero en su markup — el
// caso legítimo de "pinto un bloque y luego engancho su botón" (`#steps-manual-btn`,
// `#sync-save`, `#mc-result`…). Cualquier otro es un renderer huérfano.
section('1 · renderers ↔ ids del DOM');

const HTML_IDS = new Set([...HTML.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));

// Ids creados dinámicamente y consultados desde OTRO fichero. Cada uno, justificado.
const DYNAMIC_ID_ALLOWLIST = {
  // v11.72 (V-15): los cuatro campos del formulario de cintura los fabrica el propio
  // `renderBodyCompEstimator` con un helper (`id="${id}"`), así que la búsqueda de ids
  // literales no los ve. Los crea y los lee la MISMA función, que es el caso legítimo.
  'bc-waist': 'renderBodyCompEstimator lo crea con el helper `campo()` (V-15)',
  'bc-neck': 'idem',
  'bc-height': 'idem',
  'bc-weight': 'idem (sólo en modo Navy, sin báscula)',
};

function renderersOf(src) {
  // Recorrido por llaves: nombre de la función de nivel superior en la que cae cada línea.
  const lines = src.split('\n');
  const out = [];
  let cur = null;
  let depth = 0;
  let inFn = false;
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    const m = L.match(/^(?:async\s+)?function\s+(\w+)\s*\(/);
    if (m && depth === 0) { cur = m[1]; inFn = true; }
    if (inFn) {
      for (const ch of L) { if (ch === '{') depth++; else if (ch === '}') depth--; }
      if (depth <= 0 && /\}/.test(L)) { cur = null; inFn = false; depth = 0; }
    }
    if (cur && /^render/.test(cur)) out.push([cur, i + 1, L]);
  }
  return out;
}

let orphanCount = 0;
for (const [file, src] of Object.entries(JS)) {
  const ownIds = new Set([...src.matchAll(/\bid=\\?["']([a-zA-Z][\w-]*)\\?["']/g)].map((m) => m[1]));
  for (const [fn, ln, L] of renderersOf(src)) {
    for (const g of L.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)) {
      const id = g[1];
      const ok = HTML_IDS.has(id) || ownIds.has(id) || id in DYNAMIC_ID_ALLOWLIST;
      if (!ok) { orphanCount++; console.error(`  FAIL ${file}:${ln} — ${fn}() escribe en #${id}, que no existe`); }
    }
  }
}
checks++;
if (orphanCount) fails++;
yes(orphanCount === 0, `cero renderers huérfanos (encontrados: ${orphanCount})`);

// Los contenedores que el incremento añade o rescata.
yes(HTML_IDS.has('steps-card'), '#steps-card existe en index.html (E-12: los pasos ya se ven)');
// v11.72 (V-10, decisión de Julian): los pasos estaban en Today Y en Body, con dos formatos
// del mismo número. Ahora viven SÓLO en Body, junto a su gráfico y su histórico.
yes(/id="steps-card"[^>]*data-group="body"/.test(HTML),
  '#steps-card está en el grupo `body` de Stats');
yes((HTML.match(/id="steps-card"/g) || []).length === 1, 'y sólo hay uno');
yes(HTML.indexOf('id="steps-card"') > HTML.indexOf('>Daily Steps<'),
  '#steps-card va bajo la etiqueta "Daily Steps"');
// V-10: los tres contenedores de recuperación son UNO.
yes(!HTML.includes('id="coach-recovery-line"') && !HTML.includes('id="whoop-recovery"'),
  '#coach-recovery-line y #whoop-recovery ya no existen: un solo bloque de recuperación');
yes(/id="readiness-signals"[^>]*data-group="now"/.test(HTML),
  'y el que queda vive en el grupo `now`');
yes(HTML_IDS.has('wo-completed-notes'),
  '#wo-completed-notes existe (B-1: notas de un entreno guardado, de sólo lectura)');

// ---------------------------------------------------------------------------
// 2 · Los símbolos borrados no vuelven
// ---------------------------------------------------------------------------
section('2 · símbolos retirados (B-1, B-3, E-12)');

const GONE = [
  ['workout-notes', 'B-1/B-2: el textarea retirado; tres `getElementById` apuntaban a la nada'],
  ['week-strip', 'B-3: el contenedor que `renderWeekCalendar()` sustituyó'],
  ['renderWeekStrip', 'B-3: la función y sus once llamadores'],
  ['renderActivityRings', 'E-12: leía tres tablas para no pintar nada'],
  ['renderStreakBanner', 'E-12: idem, con seis llamadores'],
  ['renderMobilityTodayCard', 'E-12: idem, con tres llamadores'],
  ['renderWeeklyReport', 'E-12: sin contenedor y sin llamadores'],
  ['renderRecentActivity', 'E-12: idem'],
  ['applyReentryPlan', 'E-12: la rampa de re-entrada W26-W28, sin llamadores desde T5'],
];
for (const [sym, why] of GONE) {
  const hits = [];
  for (const [file, src] of Object.entries({ ...JS, 'app/index.html': HTML, 'app/nutrition.js': NUT, 'app/sw.js': SW })) {
    src.split('\n').forEach((L, i) => { if (L.includes(sym)) hits.push(`${file}:${i + 1}`); });
  }
  yes(hits.length === 0, `cero referencias a \`${sym}\` — ${why}${hits.length ? ' [' + hits.join(', ') + ']' : ''}`);
}

// Y el que se queda, con su llamador de verdad.
yes(/async function renderStepsCard\(/.test(APP), 'renderStepsCard() sigue existiendo (E-12: se rescata, no se borra)');
const STATS_SRC = (() => {
  const i = APP.indexOf('async function renderStats() {');
  if (i < 0) return '';
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(STATS_SRC.length > 0, 'renderStats() localizable');
yes(/renderStepsCard\(\)/.test(APP.slice(APP.indexOf('const STATS_GROUPS = {'), APP.indexOf('const STATS_DEFAULT_GROUP'))),
  'renderStepsCard() está en el grupo `body` de STATS_GROUPS');
yes(/No steps yet/.test(APP), 'renderStepsCard() tiene estado vacío ("No steps yet") y no pinta un 0 como si fuera un dato');

// ---------------------------------------------------------------------------
// 3 · B-5 · nada falla en silencio en el arranque
// ---------------------------------------------------------------------------
section('3 · B-5 · arranque y Home con catch');

const DCL = APP.match(/document\.addEventListener\('DOMContentLoaded',[\s\S]{0,200}?\)\);/);
yes(!!DCL, 'el handler de DOMContentLoaded es localizable');
yes(!!DCL && /\.catch\(/.test(DCL[0]), 'el handler de DOMContentLoaded lleva `.catch` (init() ya no falla en silencio)');
yes(!!DCL && /console\.warn\('\[init\]'/.test(DCL[0]), 'y anota el fallo con console.warn(\'[init]\')');
yes(!!DCL && /toast\(/.test(DCL[0]), 'y avisa al usuario con un toast');

const HOME_SRC = (() => {
  const i = APP.indexOf('async function renderHomeView() {');
  if (i < 0) return '';
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(HOME_SRC.length > 0, 'renderHomeView() localizable');
yes(/Promise\.allSettled\(/.test(HOME_SRC),
  'renderHomeView() usa allSettled (un bloque que falla no cancela los otros nueve)');
yes(!/await Promise\.all\(\[/.test(HOME_SRC), 'y ya no usa Promise.all');
yes(/console\.warn\(`\[Home\] /.test(HOME_SRC), 'y anota por bloque rechazado');
yes(/renderHomeView\(\)\.catch\(/.test(APP), 'switchTab() atrapa el fallo de renderHomeView()');
yes(/renderStats\(\)\.catch\(/.test(APP), 'switchTab() atrapa el fallo de renderStats()');
// V-5 (v11.72): `renderStats` pinta UN grupo. Los 22 renderers de las cuatro pestañas se
// ejecutaban enteros por cada visita a la vista, para enseñar una sola.
const GROUP_SRC = (() => {
  const i = APP.indexOf('async function renderStatsGroup(group) {');
  return i < 0 ? '' : APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(GROUP_SRC.length > 0, 'renderStatsGroup(group) existe');
yes(/Promise\.allSettled\(/.test(GROUP_SRC), 'y usa allSettled dentro del grupo');
yes(/state\._statsPainted\.add\(group\)/.test(GROUP_SRC), 'marca el grupo como pintado');
yes(/renderStatsGroup\(_activeStatsGroup\(\)\)/.test(STATS_SRC),
  'renderStats() pinta SÓLO el grupo activo');
{
  const SW_SRC = (() => {
    const i = APP.indexOf('function switchStatsGroup(group) {');
    return i < 0 ? '' : APP.slice(i, APP.indexOf('\n}\n', i));
  })();
  yes(/state\._statsPainted\.has\(group\)/.test(SW_SRC) && /renderStatsGroup\(group\)/.test(SW_SRC),
    'switchStatsGroup pinta un grupo la primera vez que se enseña');
}
{
  const AWS = (() => {
    const i = APP.indexOf('async function afterWorkoutSaved() {');
    return i < 0 ? '' : APP.slice(i, APP.indexOf('\n}\n', i));
  })();
  yes(/state\._statsPainted\.clear\(\)/.test(AWS),
    'y guardar un entreno invalida los cuatro (todos los números cambian)');
}
// Los cuatro grupos existen y ninguno se queda sin renderers.
{
  const G = APP.slice(APP.indexOf('const STATS_GROUPS = {'), APP.indexOf('const STATS_DEFAULT_GROUP'));
  for (const g of ['now:', 'week:', 'body:', 'strength:']) {
    yes(G.includes('  ' + g), `STATS_GROUPS tiene el grupo ${g.replace(':', '')}`);
  }
  const tabs = [...HTML.matchAll(/data-stats-group="(\w+)"/g)].map((m) => m[1]);
  yes(tabs.join(',') === 'now,week,body,strength',
    `las pestañas de Stats son Now/Week/Body/Strength (son: ${tabs.join(',')})`);
  // Ningún renderer se pierde en la mudanza: cada id de contenedor de Stats sigue teniendo quien
  // lo pinte, y cada pestaña sigue teniendo contenido.
  for (const id of ['macro-calc-section', 'plate-calc-input', 'week-compare', 'swimlane-timeline',
                    'weekly-coach-card', 'hard-day-budget', 'muscle-volume', 'streak-calendar']) {
    yes(HTML.includes(`id="${id}"`), `#${id} sobrevive a la reorganización de pestañas (V-10)`);
  }
}

// ---------------------------------------------------------------------------
// 4 · B-6 · nada del modelo de fotos entra sin escapar
// ---------------------------------------------------------------------------
section('4 · B-6 · escapeHtml en notas y nombres');

// Regla: en una plantilla, una interpolación de `…notes` / `it.name` / `f.name` tiene que
// llevar una llamada de escape en la MISMA línea.
const ESCAPE_CALL = /escapeHtml\(|_cEsc\(|_nutEsc\(/;
// Sólo líneas que de verdad construyen markup: un `${r.notes}` dentro de una línea de CSV no
// es una inyección, y escaparlo allí rompería el fichero exportado.
const IS_MARKUP = /<[a-zA-Z/]|="\$\{/;
const RISKY = [
  [/\$\{[^}]*\bnotes\b[^}]*\}/, 'notes'],
  [/\$\{[^}]*\bit\.name\b[^}]*\}/, 'it.name'],
];
let unescaped = 0;
for (const [file, src] of Object.entries({ 'app/app.js': APP, 'app/nutrition.js': NUT, 'app/coach.js': COACH })) {
  src.split('\n').forEach((L, i) => {
    if (/^\s*(\/\/|\*)/.test(L)) return;                 // comentario
    if (!IS_MARKUP.test(L)) return;
    for (const [re, what] of RISKY) {
      if (re.test(L) && !ESCAPE_CALL.test(L)) {
        unescaped++;
        console.error(`  FAIL ${file}:${i + 1} — \${…${what}…} sin escapar: ${L.trim().slice(0, 110)}`);
      }
    }
  });
}
checks++;
if (unescaped) fails++;
yes(unescaped === 0, `cero interpolaciones de notas/nombres sin escapar (encontradas: ${unescaped})`);

yes(/data-swap-name="\$\{escapeHtml\(/.test(APP), 'data-swap-name va escapado (B-6)');
yes(/wo-notes-ro">\$\{escapeHtml\(/.test(APP), 'las notas del entreno guardado van escapadas (B-1 + B-6)');
yes(/function escapeHtml\(/.test(APP), 'escapeHtml() sigue definido en app.js (nutrition.js lo usa por global)');

// ---------------------------------------------------------------------------
// 5 · B-4 · las vistas secundarias entran por un solo sitio
// ---------------------------------------------------------------------------
section('5 · B-4 · enterSecondaryView');

yes(/function enterSecondaryView\(viewName, headerKey\)/.test(APP), 'enterSecondaryView(viewName, headerKey) existe');
const ESV_SRC = (() => {
  const i = APP.indexOf('function enterSecondaryView(');
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(/showView\(/.test(ESV_SRC), 'hace showView()');
yes(/updateHeader\(/.test(ESV_SRC), 'hace updateHeader()');
yes(/document\.body\.dataset\.tab = /.test(ESV_SRC),
  'y pone body.dataset.tab (sin esto `body[data-tab="home"] header{display:none}` oculta la cabecera)');
yes(/window\.enterSecondaryView = enterSecondaryView/.test(APP), 'está expuesto en window para coach.js');

const uses = (APP.match(/enterSecondaryView\(/g) || []).length
  - 1 // la declaración
  - 1; // la asignación a window
yes(uses >= 5, `enterSecondaryView se usa en ≥ 5 sitios de app.js (usos: ${uses})`);
yes(/enterSecondaryView\('coach'\)/.test(COACH), 'coach.js abre la vista Coach con el helper');
yes(/typeof window\.enterSecondaryView === 'function'/.test(COACH), 'y con guarda de `typeof` (coach.js es otro <script>)');

// updateHeader tiene rama para las cinco claves; sin rama, la cabecera visible muestra el
// título de la vista anterior.
const UH_SRC = (() => {
  const i = APP.indexOf('function updateHeader(tab) {');
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
for (const key of ['coach', 'ideal-preview', 'analytics', 'mobility', 'settings']) {
  yes(UH_SRC.includes(`tab === '${key}'`), `updateHeader() tiene rama para '${key}'`);
}
yes(/body\[data-tab="home"\] header \{ display: none; \}/.test(readFileSync('app/style.css', 'utf8')),
  'la regla que ocultaba la cabecera sigue siendo SÓLO para home (si cambia, revisa B-4)');

// ---------------------------------------------------------------------------
// 6 · V-7 · rendimiento: caché de weekSchedule, memo por pase, un solo repintado
// ---------------------------------------------------------------------------
section('6 · V-7 · rendimiento');

const GWS_SRC = (() => {
  const i = APP.indexOf('async function getWeekSchedule() {');
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(/state\._weekSchedule/.test(GWS_SRC), 'getWeekSchedule() cachea en state._weekSchedule (eran 15 dbGet por pintado de Home)');
yes(/state\._weekSchedule = null/.test(APP), 'y algo la invalida');
const DBPUT_SRC = (() => {
  const i = APP.indexOf('function dbPut(store, data) {');
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(/state\._weekSchedule = null/.test(DBPUT_SRC),
  'la invalida dbPut() — así también la tira una fila que baje de la nube');
yes(/invalidateRenderPass\(\)/.test(DBPUT_SRC), 'dbPut() invalida además el memo del pase de render');

yes(/function beginRenderPass\(\)/.test(APP), 'beginRenderPass() existe');
yes(/function endRenderPass\(\)/.test(APP), 'endRenderPass() existe');
yes(/function invalidateRenderPass\(\)/.test(APP), 'invalidateRenderPass() existe');
const DGA_SRC = (() => {
  const i = APP.indexOf('function dbGetAll(store) {');
  return APP.slice(i, APP.indexOf('\n}\n', i));
})();
yes(/_renderPass/.test(DGA_SRC), 'dbGetAll() consulta el pase activo');
yes(/\.slice\(\)/.test(DGA_SRC), 'y devuelve una COPIA por llamador (media app hace .sort() sobre el resultado)');
yes(/function _dbGetAllRaw\(store\)/.test(APP), 'la lectura sin memo sigue disponible (_dbGetAllRaw) para fuera del pase');
yes(/beginRenderPass\(\)/.test(HOME_SRC) && /endRenderPass\(\)/.test(HOME_SRC), 'renderHomeView() abre y cierra el pase');
yes(/beginRenderPass\(\)/.test(GROUP_SRC) && /endRenderPass\(\)/.test(GROUP_SRC),
  'renderStatsGroup() abre y cierra el pase');

yes(/async function afterWorkoutSaved\(\)/.test(APP), 'afterWorkoutSaved() existe (V-7d)');
yes((APP.match(/await afterWorkoutSaved\(\)/g) || []).length >= 4,
  'y lo llaman los cuatro sitios que repetían el mismo trío de repintados');

// ---------------------------------------------------------------------------
// 6.b · El memo, ejecutado de verdad (no sólo grep-eado)
// ---------------------------------------------------------------------------
// Se monta el trozo real de app.js sobre un IndexedDB de juguete que cuenta transacciones.
// Es la única forma de comprobar las tres propiedades que importan: una lectura por store y
// pase, copia por llamador, y cero memo fuera del pase.
section('6.b · memo del pase, en ejecución');

function extractFn(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  let started = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') { depth++; started = true; } else if (src[k] === '}') { depth--; }
    if (started && depth === 0) return src.slice(i, k + 1);
  }
  return '';
}

const memoSrc = [
  'let _renderPass = null;',
  extractFn(APP, 'function beginRenderPass()'),
  extractFn(APP, 'function endRenderPass()'),
  extractFn(APP, 'function invalidateRenderPass()'),
  extractFn(APP, 'function dbGetAll(store)'),
  extractFn(APP, 'function _dbGetAllRaw(store)'),
].join('\n\n');

let memoOk = false;
let memoWhy = '';
try {
  const factory = new Function('db', memoSrc +
    '\nreturn { beginRenderPass, endRenderPass, invalidateRenderPass, dbGetAll };');
  let txCount = 0;
  const rows = [{ date: '2026-09-01' }, { date: '2026-09-02' }, { date: '2026-09-03' }];
  const fakeDb = {
    transaction() {
      txCount++;
      const req = { onsuccess: null, onerror: null, result: rows.map((r) => ({ ...r })) };
      setTimeout(() => req.onsuccess && req.onsuccess(), 0);
      return { objectStore: () => ({ getAll: () => req }) };
    },
  };
  const M = factory(fakeDb);

  // (a) fuera del pase: una transacción por llamada, igual que antes
  await M.dbGetAll('workouts');
  await M.dbGetAll('workouts');
  const outside = txCount;
  if (outside !== 2) throw new Error(`fuera del pase deberían ser 2 transacciones, fueron ${outside}`);

  // (b) dentro del pase: una sola, aunque llamen cinco bloques a la vez
  txCount = 0;
  M.beginRenderPass();
  const arrs = await Promise.all([
    M.dbGetAll('workouts'), M.dbGetAll('workouts'), M.dbGetAll('workouts'),
    M.dbGetAll('runs'), M.dbGetAll('runs'),
  ]);
  if (txCount !== 2) throw new Error(`en el pase deberían ser 2 transacciones (workouts + runs), fueron ${txCount}`);

  // (c) copia por llamador: ordenar uno no reordena el del vecino
  const before = arrs[1].map((r) => r.date).join(',');
  arrs[0].sort((a, b) => b.date.localeCompare(a.date));
  if (arrs[1].map((r) => r.date).join(',') !== before) {
    throw new Error('un .sort() de un llamador reordenó el array de otro: el memo no está copiando');
  }
  if (arrs[0] === arrs[1]) throw new Error('dos llamadores recibieron la MISMA referencia de array');

  // (d) una escritura tira el memo
  txCount = 0;
  M.invalidateRenderPass();
  await M.dbGetAll('workouts');
  if (txCount !== 1) throw new Error('invalidateRenderPass() no forzó una lectura nueva');

  // (e) los pases anidan
  txCount = 0;
  M.beginRenderPass();
  await M.dbGetAll('runs');
  M.endRenderPass();          // cierra el interno: el memo sigue vivo
  await M.dbGetAll('runs');
  if (txCount !== 1) throw new Error('un pase anidado cerró el memo del externo');
  M.endRenderPass();
  txCount = 0;
  await M.dbGetAll('runs');
  if (txCount !== 1) throw new Error('el memo sobrevivió al cierre del pase externo');

  memoOk = true;
} catch (e) {
  memoWhy = e.message;
}
yes(memoOk, `el memo cumple su contrato en ejecución${memoOk ? '' : ' — ' + memoWhy}`);

// ---------------------------------------------------------------------------
// 7 · V-6 · service worker
// ---------------------------------------------------------------------------
section('7 · V-6 · service worker');

// El shell declarado, leído del propio APP_SHELL (critical + optional).
const SHELL_BLOCK = SW.slice(SW.indexOf('const APP_SHELL = {'), SW.indexOf('const SHELL_URLS'));
yes(SHELL_BLOCK.length > 0, 'APP_SHELL es localizable en sw.js');
const shellEntries = [...SHELL_BLOCK.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
yes(!SHELL_BLOCK.includes('app-icon.png'),
  'APP_SHELL NO precachea app-icon.png (1,9 MB antes de activar el service worker)');
yes(!SHELL_BLOCK.includes('intro.mp4'), 'APP_SHELL NO precachea intro.mp4');

// ── C-17 (auditoría 2026-09-09): la lista esperada SE DERIVA DE index.html ──────────────
//
// EL FALLO QUE ESTA PARTE EXISTE PARA IMPEDIR: hasta v11.72 la lista de ficheros que este test
// exigía en `APP_SHELL.critical` estaba escrita a mano AQUÍ. O sea que añadir un `<script src>`
// nuevo al HTML y olvidarse de `sw.js` pasaba el test en verde, y el fichero nuevo simplemente
// no existía sin conexión: la app abría, y la mitad que dependía de ese script no estaba.
// Es exactamente el bug que V-6 arregló para `integrations.js` — a mano, y sin red que lo
// impidiera la segunda vez.
//
// Ahora la fuente de verdad es el HTML: todo `<script src="x.js">` y todo
// `<link rel="stylesheet" href="x.css">` de origen propio TIENE que estar en `critical`.
// La hoja de Google Fonts es el caso aparte (va en `optional`, con su constante).
const localScripts = [...HTML.matchAll(/<script\s+src="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^https?:\/\//.test(u));
const localStyles = [...HTML.matchAll(/<link\s+rel="stylesheet"\s+href="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^https?:\/\//.test(u));
const criticalBlock = SHELL_BLOCK.slice(SHELL_BLOCK.indexOf('critical:'), SHELL_BLOCK.indexOf('optional:'));
const criticalEntries = [...criticalBlock.matchAll(/'(\.\/[^']*)'/g)].map((m) => m[1]);
yes(localScripts.length >= 10, `index.html carga ${localScripts.length} scripts propios`);
yes(criticalEntries.includes('./index.html') && criticalEntries.includes('./'),
  'APP_SHELL.critical incluye el documento (./ y ./index.html)');
for (const u of localScripts.concat(localStyles)) {
  const rel = './' + u.replace(/^\.\//, '');
  yes(criticalEntries.includes(rel),
    `APP_SHELL.critical incluye ${rel} (lo carga index.html) — si falla, ese fichero no existe sin conexión`);
  yes(existsSync('app/' + u.replace(/^\.\//, '')), `y ${u} existe en app/`);
}
// El recíproco: nada en `critical` que ya no cargue el HTML (residuo de un borrado).
for (const rel of criticalEntries) {
  if (rel === './' || rel === './index.html') continue;
  const u = rel.slice(2);
  yes(localScripts.includes(u) || localStyles.includes(u),
    `${rel} sigue en el APP_SHELL crítico y lo sigue cargando index.html`);
}
// C-18: el cliente de Supabase viene de un CDN con VERSIÓN EXACTA, y está fuera del shell
// a propósito (respuesta opaca en `no-cors` + sin red no hay nada que sincronizar). La decisión
// tiene que estar escrita al lado, o el próximo incremento la deshace sin saberlo.
{
  const cdn = [...HTML.matchAll(/<script\s+src="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
  yes(cdn.length === 1 && /@supabase\/supabase-js@\d+\.\d+\.\d+/.test(cdn[0]),
    `el único script de CDN es supabase-js con versión exacta (${cdn[0] || 'ninguno'})`);
  yes(!SHELL_BLOCK.includes('supabase-js'), 'y NO está en el APP_SHELL');
  const iCdn = HTML.indexOf('cdn.jsdelivr.net');
  yes(/C-18/.test(HTML.slice(Math.max(0, iCdn - 1800), iCdn)),
    'con el comentario que justifica el pin y por qué se queda fuera del shell');
}

// A-7 (2026-09-10): la comprobación va en LAS DOS DIRECCIONES. `strava-callback.html` se borró
// —el OAuth de Strava vive entero en el servidor— y una entrada de shell que apunta a un fichero
// que ya no existe hace que `cache.addAll`/`allSettled` de la tanda opcional falle en silencio en
// cada install: la app sigue arrancando y nadie se entera de que el precache está roto.
for (const f of ['./favicon.svg', './privacy.html', './strava-callback.html']) {
  const onDisk = existsSync('app/' + f.slice(2));
  yes(!onDisk || shellEntries.includes(f), `APP_SHELL incluye ${f} (existe en app/)`);
  yes(onDisk || !shellEntries.includes(f), `y NO lo lista si el fichero no existe (${f})`);
}
yes(!existsSync('app/strava-callback.html') && !shellEntries.includes('./strava-callback.html'),
  'strava-callback.html borrado y fuera del APP_SHELL (A-7)');
yes(/GOOGLE_FONTS_CSS/.test(SHELL_BLOCK), 'APP_SHELL incluye la hoja de Google Fonts');
const fontsUrl = (SW.match(/const GOOGLE_FONTS_CSS = '([^']+)'/) || [])[1];
yes(!!fontsUrl && HTML.includes(fontsUrl),
  'y es EXACTAMENTE la URL que pide index.html (si no, el cache.match nunca acierta)');
yes(/fonts\.gstatic\.com/.test(SW), 'hay regla de runtime para fonts.gstatic.com');
yes(/RUNTIME_CACHE_FIRST/.test(SW) && /cacheFirstRevalidate/.test(SW), 'y es cache-first');

yes(/APP_SHELL\.critical\)/.test(SW) || /addAll\(APP_SHELL\.critical/.test(SW),
  'el install hace addAll SÓLO de la tanda crítica (un 404 en lo opcional ya no aborta el install)');
yes(/Promise\.allSettled\(\s*\n?\s*APP_SHELL\.optional/.test(SW), 'y la tanda opcional va con allSettled');
yes(/async function cacheFirstRevalidate\(request\)/.test(SW), 'cache-first con revalidación en segundo plano');
yes(/async function networkFirst\(request\)/.test(SW), 'network-first sigue existiendo');
yes(/e\.request\.mode === 'navigate'[\s\S]{0,120}networkFirst/.test(SW),
  'network-first SÓLO para la navegación (index.html)');
yes(/isShellRequest\(url\)[\s\S]{0,140}cacheFirstRevalidate/.test(SW),
  'los assets del shell van cache-first (antes esperaban el timeout de la red en 4G mala)');
// La versión NO se fija aquí (cambia en cada push): se comprueba que CACHE_NAME, la etiqueta de
// index.html y COACH_APP_VERSION digan lo mismo, que es la invariante que sí importa.
{
  const swV = (/const CACHE_NAME = 'training-(v\d+\.\d+)'/.exec(SW) || [])[1];
  const htmlV = (/Training System (v\d+\.\d+)<br>/.exec(HTML) || [])[1];
  yes(!!swV && swV === htmlV, `CACHE_NAME (${swV}) coincide con la etiqueta de index.html (${htmlV})`);
}

// ---------------------------------------------------------------------------
console.log('');

// ── v11.70 · Backup: todos los stores que sincronizan, sin secretos; autosave con dueño ──────
{
  const _ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log(`  FAIL ${msg}`); } else console.log(`  ok   ${msg}`); };
  const SYNC_SRC = readFileSync('app/supabase-sync.js', 'utf8');
  const listOf = (src, re) => { const m = src.match(re); if (!m) return null; return m[1].replace(/\/\/.*$/gm, '').split(',').map((x) => x.trim().replace(/^'|'$/g, '')).filter(Boolean); };
  const backupStores = listOf(APP, /const BACKUP_STORES = \[([\s\S]*?)\];/);
  const syncStores = listOf(SYNC_SRC, /const stores = \[([^\]]*)\];/);
  _ok(Array.isArray(backupStores) && Array.isArray(syncStores), 'BACKUP_STORES y la lista de sync se pueden leer');
  if (backupStores && syncStores) {
    const missing = syncStores.filter((s) => !backupStores.includes(s));
    _ok(missing.length === 0, `BACKUP_STORES ⊇ stores de sync (D-2)${missing.length ? ` — faltan: ${missing.join(', ')}` : ''}`);
  }
  // Redactado de secretos: la función es pura, se ejecuta.
  const i = APP.indexOf('function _redactSettingsRows(');
  const j = APP.indexOf('\n}\n', i);
  _ok(i > 0 && j > i, 'existe _redactSettingsRows()');
  if (i > 0 && j > i) {
    const keysM = APP.match(/const BACKUP_REDACT_KEYS = (\[[^\]]*\]);/);
    const ctxR = {};
    vm.createContext(ctxR);
    vm.runInContext(`const BACKUP_REDACT_KEYS = ${keysM ? keysM[1] : "['stepsSecret','intervalsIcuApiKey']"};\n${APP.slice(i, j + 2)}\nglobalThis.__redact = _redactSettingsRows;`, ctxR);
    const rows = [
      { key: 'userSettings', data: { unit: 'kg', stepsSecret: 'S3CR3T', intervalsIcuApiKey: 'K3Y', goals: { a: 1 } } },
      { key: 'lastSyncTimestamp', data: '2026-09-09T10:00:00Z' },
    ];
    const out = ctxR.__redact(rows);
    _ok(!('stepsSecret' in out[0].data) && !('intervalsIcuApiKey' in out[0].data), 'el backup no lleva stepsSecret ni intervalsIcuApiKey (S-2)');
    _ok(out[0].data.unit === 'kg' && out[0].data.goals && out[0].data.goals.a === 1, 'y conserva el resto de userSettings');
    _ok(out[1] === rows[1], 'las filas sin secretos salen tal cual (misma referencia)');
    _ok(rows[0].data.stepsSecret === 'S3CR3T', 'la fila original NO se muta (el redactado es una copia)');
  }
  _ok(/settings: _redactSettingsRows\(await dbGetAll\('settings'\)\)/.test(APP), 'exportBackup() redacta settings');
  _ok(/data\[store\] = store === 'settings' \? _redactSettingsRows\(rows \|\| \[\]\) : \(rows \|\| \[\]\)/.test(APP), 'exportJSON() redacta settings');
  // Autosave del entreno (C-5): un solo camino, con catch.
  const a = APP.indexOf('function _autosaveWorkout()');
  const b = APP.indexOf('\n}\n', a);
  _ok(a > 0 && /\.catch\(/.test(APP.slice(a, b)), '_autosaveWorkout() existe y captura el rechazo');
  _ok(!/addEventListener\('(input|change)', \(\) => saveActiveWorkout\(\)\)/.test(APP), 'ningún listener llama a saveActiveWorkout() sin catch');
  _ok(!/^\s+saveActiveWorkout\(\);\s*$/m.test(APP.slice(APP.indexOf("container.querySelectorAll('[data-field=\"rpe\"]')"), APP.indexOf("container.querySelectorAll('[data-field=\"rpe\"]')") + 600)), 'el handler de RPE tampoco');
}

// ---------------------------------------------------------------------------
// 10 · L-1 · el mapa de calor cuenta SERIES EFECTIVAS, con el crédito del coach
// ---------------------------------------------------------------------------
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR: que la PANTALLA y el COACH cuenten el volumen de
// dos maneras distintas. `renderMuscleVolume` sumaba una serie entera para la etiqueta `muscle`
// del ejercicio y nada para nadie más; desde v11.71 el validador juzga series EFECTIVAS (1,0 al
// motor primario + 0,5 por secundario cargado del patrón), porque el 10-14 de STR-003 está
// escrito en esos términos. Es exactamente la forma de L-1: dos contadores, la app leyendo 16
// series donde el validador leía 13, y una semana de decisiones tomadas sobre el número corrupto.
//
// Y su gemelo: que el arreglo sea un SEGUNDO mapa de créditos en app.js. Entonces habría dos
// mapas que divergen en el siguiente incremento en vez de dos contadores.
section('10 · L-1 · mapa de calor en series efectivas');
{
  const FACTS = readFileSync('app/coach-facts.js', 'utf8');
  const mv = APP.slice(APP.indexOf('async function renderMuscleVolume()'),
                       APP.indexOf('// ==================== SWIMLANE TIMELINE'));
  yes(mv.length > 800, 'se localiza renderMuscleVolume');

  // El crédito se REUSA, no se reimplementa.
  for (const sym of ['_vpVolumeMuscle', '_vpSecondariesFor', 'VP_SECONDARY_CREDIT',
                     'VP_NO_SECONDARY_IDS', 'VP_PATTERN_IDS']) {
    yes(new RegExp(`(const|function|let)\\s+${sym}\\b`).test(FACTS),
      `${sym} es una declaración de nivel superior de coach-facts.js (global en un script clásico)`);
    yes(mv.includes(sym) || APP.includes(sym), `y app.js la usa: ${sym}`);
  }
  // Ni un segundo mapa de secundarios en app.js.
  yes(!/VP_PATTERN_SECONDARIES\s*=/.test(APP) && !/SECONDARY_CREDIT\s*=\s*0\.5/.test(APP),
    'app.js NO declara su propio mapa de créditos ni su propio 0,5 (una implementación, no dos)');
  yes(/VP_SECONDARY_CREDIT\s*=\s*0\.5/.test(FACTS), 'el 0,5 vive en coach-facts.js y sólo ahí');

  // Guarda `typeof`: un bundle viejo en caché degrada a series directas, no lanza.
  yes(/function _mvEffectiveAvailable\(\)/.test(APP), 'hay un predicado de disponibilidad');
  const avail = APP.slice(APP.indexOf('function _mvEffectiveAvailable()'), APP.indexOf('function _mvHalf'));
  yes(/typeof _vpVolumeMuscle === 'function'/.test(avail) && /typeof _vpSecondariesFor === 'function'/.test(avail),
    'que comprueba con typeof las funciones de coach-facts.js');
  yes(/typeof VP_SECONDARY_CREDIT === 'number'/.test(avail), 'y el crédito');
  yes(/const efectivas = _mvEffectiveAvailable\(\)/.test(mv), 'renderMuscleVolume lo consulta una vez');
  yes(/if \(!efectivas\) return;/.test(mv), 'y sin él cuenta series DIRECTAS (subcuenta, no lanza)');

  // El crédito: 1,0 al primario, 0,5 a cada secundario del patrón, y las tres exclusiones.
  yes(/anota\(muscle, w\.date, doneSets\)/.test(mv), '1,0 al músculo primario');
  yes(/doneSets \* VP_SECONDARY_CREDIT/.test(mv), 'y VP_SECONDARY_CREDIT a cada secundario');
  yes(/_vpSecondariesFor\(patron, muscle\)/.test(mv), 'los secundarios los resuelve coach-facts.js');
  yes(/MOVEMENT_PATTERNS\[ex\.exerciseId\] \|\| VP_PATTERN_IDS\[/.test(mv),
    'el patrón sale de la librería y, si no, del fallback por id del validador');
  yes(/if \(!patron\) return;/.test(mv), 'un patrón que no se resuelve NO acredita nada (sesgo a subcontar)');
  yes(/if \(muscle === 'Power'\) return;/.test(mv), 'Power no acredita secundarios (no es hipertrofia)');
  yes(/VP_NO_SECONDARY_IDS\[String\(ex\.exerciseId/.test(mv), 'y las aperturas tampoco (monoarticulares)');
  yes(/_vpVolumeMuscle\(ex\.exerciseId, muscle\)/.test(mv),
    'la reetiqueta a Power la decide _vpVolumeMuscle (la misma que el coach)');

  // Power y Erectors fuera de la banda 10-14, igual que el validador.
  yes(/function _mvHasBand\(/.test(APP), 'hay un predicado de "esta fila tiene banda"');
  const band = APP.slice(APP.indexOf('function _mvHasBand('), APP.indexOf('async function renderMuscleVolume()'));
  yes(/_vpFamilyHasFloor/.test(band) && /_vpMuscleFamily/.test(band),
    'que delega en _vpFamilyHasFloor/_vpMuscleFamily del validador');
  yes(/power\|core\|erectors/.test(band), 'con un respaldo local por si coach-facts.js no está');
  yes(/const conBanda = _mvHasBand\(muscle\)/.test(mv) && /!conBanda \? 'var\(--text3\)'/.test(mv),
    'las filas sin banda se pintan neutras (no en naranja por "no llegar a 10")');

  // El veredicto se da por FAMILIA, como el validador (F-7): la cadena posterior repartida en
  // tres etiquetas leía 9 series donde había 14. Sin esto, `Glutes 3.5` sale en naranja mientras
  // el coach dice que la cadena cumple — y la pantalla vuelve a contradecir al coach.
  yes(/const familyTotals = \{\}/.test(mv) && /_vpMuscleFamily\(m\)/.test(mv),
    'los totales se agregan también por familia, con _vpMuscleFamily del validador');
  yes(/veredicto >= 10 && veredicto <= 14/.test(mv) && /veredicto < 10 \? 'var\(--orange\)'/.test(mv),
    'y el color del total juzga el total de la FAMILIA, no el de la etiqueta suelta');
  yes(/_mvNum\(veredicto\)/.test(mv), 'con el número de la familia en el title de la fila');
  yes(/VP_VOLUME_FAMILY_MERGE/.test(FACTS) && /'posterior chain': VP_POSTERIOR_FAMILY/.test(FACTS),
    'y la fusión de familias sigue declarada una sola vez, en coach-facts.js');
  yes(/family<\/b> verdict/.test(mv), 'la tarjeta explica que el color es el veredicto de la familia');
  yes(/VP_VOLUME_NO_FLOOR = \{ power: 1, core: 1, otros: 1, erectors: 1 \}/.test(FACTS),
    'y la lista de familias sin suelo sigue siendo la del validador');

  // Medias series: se muestran, y se etiquetan.
  yes(/function _mvNum\(/.test(APP) && /v\.toFixed\(1\)/.test(APP), 'los 0,5 se pintan como 10.5, no como 10');
  yes(/_mvNum\(total\)/.test(mv) && /_mvNum\(sets\)/.test(mv), 'en el total de la fila y en cada celda');
  yes(/Math\.round\(\(Number\(n\) \|\| 0\) \* 2\) \/ 2/.test(APP), 'redondeando a media serie');
  yes(/Effective sets:/.test(mv) && /1\.0/.test(mv) && /0\.5/.test(mv),
    'la tarjeta EXPLICA que el número lleva crédito fraccionado');
  yes(/coach judges against 10-14/.test(mv), 'y dice que es la cuenta que usa el coach');
  yes(/Power<\/b> and <b>Erectors/.test(mv), 'y que Power y Erectors van aparte, sin banda');
  yes(/Weekly Effective Sets by Muscle/.test(HTML), 'el título de la tarjeta también lo dice');
}

section('11 · v11.75 · "This week" dice qué hiciste y qué falta');
// EL FALLO QUE ESTO IMPIDE. Julian: "en This week debería aparecer qué hice cada día y qué tengo
// que hacer los días faltantes". La única diferencia entre hecho y pendiente era la opacidad de
// una barra de 2 px, y los días pasados no enseñaban plan: un martes fallado se veía exactamente
// igual que un martes de descanso.
{
  const i = APP.indexOf('async function renderWeekCalendar(');
  const cuerpo = APP.slice(i, APP.indexOf('\n}', i));
  yes(/class="wc-label -\$\{c\.etiquetaEstado\}"/.test(cuerpo), 'cada día pinta su etiqueta con su estado');
  yes(/isPast \? 'missed' : 'pending'/.test(cuerpo), 'un día pasado con plan y sin registro se marca como fallado, no como descanso');
  yes(/etiquetaEstado = 'done'/.test(cuerpo) && /'✓ '/.test(cuerpo), 'lo hecho lleva su marca');
  yes(/nombreSesion\(gym\.sessionId/.test(cuerpo), 'y lo hecho dice el NOMBRE de la sesión que se hizo, no "gym"');
  yes(/done\} of \$\{/.test(cuerpo) || /doneCount\} of /.test(cuerpo), 'la cabecera cuenta cuántos van de cuántos');
  yes(!/wc-leg-dot/.test(cuerpo), 'y la leyenda de dos puntos de color, que no explicaba nada, se retira');
}

section('12 · v11.75 · el día de cardio ofrece opciones');
// Julian: "cuando es cardio como hoy sábado tengo que tener opciones, no solamente Run 40' in Z2".
// Los datos existían (ALT_LIBRARY, con su `alt` en cada día del bloque ideal) y no llegaban a la
// tarjeta: el `alt` se perdía en `buildWeekTemplateFromIdeal`, así que la lista salía con una sola
// opción y el bloque no se pintaba NUNCA, en silencio.
{
  yes(/if \(day\.alt\) tpl\[day\.dow\]\.alt = day\.alt;/.test(APP),
    'la plantilla se queda el `alt` del día (sin esto, no hay alternativas que ofrecer)');
  yes(/alt: slot\.alt \|\| null/.test(APP), 'y el día lo lleva hasta la tarjeta');
  yes(/function cardioDayOptions\(planned\)/.test(APP) && /function cardioOptionsHtml\(opciones\)/.test(APP),
    'existen las dos piezas: qué se ofrece y cómo se pinta');
  const i = APP.indexOf('function cardioDayOptions(planned)');
  const cuerpo = APP.slice(i, APP.indexOf('\n}', i));
  yes(/recommended: true/.test(cuerpo), 'la prescrita va la primera y marcada como recomendada');
  yes(/ALT_LIBRARY/.test(cuerpo), 'las alternativas salen de ALT_LIBRARY, no de una lista nueva');
  yes(/family === 'hybrid'|RPE 8/.test(cuerpo), 'y las duras se ordenan las últimas');
  yes(/demanding/.test(cuerpo), 'diciendo que lo son');
  const h = APP.indexOf('function cardioOptionsHtml(opciones)');
  const html = APP.slice(h, APP.indexOf('\n}', h));
  yes(/\$\{i \+ 1\}/.test(html), 'las opciones van numeradas 1, 2, 3 como pidió Julian');
  yes(/data-cmod/.test(html) && /CARDIO_MODALITIES/.test(APP), 'y debajo se elige la máquina');
  yes(/opciones\.length < 2/.test(html), 'con una sola opción no se pinta un selector de una cosa');
  // PLAN_REV sube: la plantilla cambia de forma y los teléfonos tienen que regenerarla.
  yes(/const PLAN_REV = 11;/.test(APP), 'PLAN_REV sube a 11 (la plantilla cambió de forma)');
}

section('13 · v11.75 · la semana se recoloca al guardar');
{
  const i = APP.indexOf('async function afterWorkoutSaved()');
  const cuerpo = APP.slice(i, APP.indexOf('\n}', i));
  yes(/applyWeekReflow\(/.test(cuerpo), 'guardar un entreno recoloca la semana');
  yes(cuerpo.indexOf('applyWeekReflow') < cuerpo.indexOf('renderWeekBanner'),
    'y lo hace ANTES de repintar, para que todos lean el calendario ya corregido');
}

section('14 · v11.77 · Cardio: UNA lista, con icono propio y sin perder nada');
// Julian, punto 9: "en Cardio debería aparecer todo junto en Recent Cardio, tanto runs como
// cycling como rows"; "los logos de Ride, Row son iguales que los de Run"; "el Distance total
// debería ir arriba del todo".
//
// El fallo que esta sección existe para impedir es el de la fusión descuidada: juntar dos listas
// quedándose sólo con lo que hacía una de ellas. La lista de carreras que se retira sabía tres
// cosas que la otra no: estimaba las kcal, enseñaba el pulso medio y borraba con deshacer.
{
  // La vista: los totales primero, y una sola lista después.
  // El corte va hasta la SIGUIENTE vista, no hasta `view-stats`: Nutrición está en medio, y
  // cortar por ahí metía su lista de comidas dentro de "la vista de Cardio".
  const iCardio = HTML.indexOf('id="view-cardio"');
  const vistaCardio = HTML.slice(iCardio, HTML.indexOf('id="view-', iCardio + 12));
  yes(vistaCardio.indexOf('id="run-totals-card"') > -1, 'los totales de distancia siguen en la vista');
  yes(vistaCardio.indexOf('id="run-totals-card"') < vistaCardio.indexOf('id="sess-history"'),
    'y van ARRIBA de la lista, no metidos entre las dos que había');
  yes(!/id="run-history"/.test(HTML), 'la segunda lista ("Runs (history)") ya no existe en el HTML');
  yes(!/function renderRunHistory\(/.test(APP), 'ni su renderer en app.js (no queda escribiendo en un hueco)');
  yes((vistaCardio.match(/class="recent-list"/g) || []).length === 1,
    'en Cardio queda exactamente UNA lista');

  // El renderer: dos fuentes, ya dedupeadas.
  const iRSH = APP.indexOf('async function renderSessionHistory()');
  const cuerpoRSH = APP.slice(iRSH, APP.indexOf('\n}\n', iRSH));
  yes(/getRunsDeduped/.test(cuerpoRSH) && /getSessionsDeduped/.test(cuerpoRSH),
    'lee las DOS fuentes, y las dos dedupeadas (la misma salida del COROS llega por Strava y por intervals.icu)');
  yes(/localeCompare/.test(cuerpoRSH), 'y las mezcla ordenadas por fecha, no una detrás de otra');

  // Lo que la lista retirada sabía hacer, y que no se pierde por el camino.
  yes(/estimateCalories\(/.test(cuerpoRSH), 'sigue estimando las kcal de una carrera');
  yes(/avgHR/.test(cuerpoRSH), 'sigue enseñando el pulso medio');
  yes(/feel: r\.feel/.test(cuerpoRSH), 'y el feel de la carrera, que la primera versión de la fusión ponía a null');
  yes(/smartDelete\(/.test(cuerpoRSH) && /label: 'Undo'/.test(cuerpoRSH),
    'borrar sincroniza y se puede deshacer');
  yes(!/dbDelete\('sessions'/.test(cuerpoRSH),
    'y ya no hay un borrado en crudo: esa fila volvía en la siguiente sincronización');
  yes((cuerpoRSH.match(/data-del-id/g) || []).length >= 2,
    'un solo botón de borrar para las dos fuentes, no dos comportamientos distintos en la misma lista');

  // El icono, que era la queja literal de Julian.
  yes(/function cardioIconFor\(/.test(APP), 'el icono se elige por MODALIDAD, no por familia');
  const iMapa = APP.indexOf('const CARDIO_ICON = {');
  const mapa = APP.slice(iMapa, APP.indexOf('};', iMapa));
  const iconos = ['run_outdoor', 'bike', 'row', 'ski']
    .map((k) => (mapa.match(new RegExp(k + ": '([^']+)'")) || [])[1]);
  yes(iconos.every(Boolean), 'correr, bici, remo y ski tienen icono');
  yes(new Set(iconos).size === 4,
    'y los cuatro son DISTINTOS (antes bici, remo y ski salían los tres con el muñeco corriendo)');
  yes(/cardioIconFor\(sess\.modality/.test(cuerpoRSH), 'y la lista lo usa');

  // El llamador ya no invoca la retirada.
  const iTab = APP.indexOf("} else if (tab === 'cardio')");
  const tab = APP.slice(iTab, iTab + 220);
  yes(!/renderRunHistory/.test(tab), 'abrir la pestaña Cardio ya no llama a la retirada');
  yes(tab.indexOf('renderRunTotals') < tab.indexOf('renderSessionHistory'),
    'y pinta los totales antes que la lista, en el orden en que se leen');
}

if (fails) {
  console.error(`verify-home-render: ${fails} de ${checks} comprobaciones FALLAN`);
  process.exit(1);
}
console.log(`verify-home-render: ${checks} comprobaciones OK`);
