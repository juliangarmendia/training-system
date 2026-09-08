// Una sola lectura de `runs` y `sessions`: la dedupeada (E-10, auditoría 2026-09-08).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. La misma actividad llega DOS VECES: el reloj
// COROS sube a Strava y a intervals.icu, y las dos rutas importan la carrera con ids distintos
// (v11.36). `dedupeRuns`/`dedupeSessions` resuelven el solapamiento y `getRunsDeduped()` /
// `getSessionsDeduped()` son la vista buena — pero doce agregaciones seguían leyendo las tablas
// crudas. Y el daño no es cosmético: la racha contaba dos días donde había uno, el informe
// semanal sumaba 12 km donde había 6, y el total del año se iba inflando solo. Peor: la mitad
// de la app decía un número y la otra mitad decía otro del mismo dato, así que "¿cuántos km
// llevo esta semana?" tenía dos respuestas según la pantalla.
//
// CÓMO SE LEE ESTE TEST. Cada lectura cruda que quede tiene que estar en la lista de abajo con
// su motivo. Si aparece una nueva, el test falla y hay dos salidas honestas: usar la vista
// dedupeada, o añadirla aquí explicando por qué esa aritmética necesita las filas crudas.
// Lo que el test NO permite es que una agregación nueva entre en silencio.
//
// Ejecutar desde la raíz del repo: node tests/verify-dedupe-reads.mjs

import { readFileSync } from 'node:fs';

const APP = readFileSync('app/app.js', 'utf8');
const NUT = readFileSync('app/nutrition.js', 'utf8');

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

/**
 * LAS LECTURAS CRUDAS PERMITIDAS, por la función que las contiene y con su categoría.
 *
 *   `dedupe`  — es la vista dedupeada, o el diagnóstico que la valida. Tiene que leer crudo.
 *   `export`  — copia de seguridad y CSV: se exporta lo que hay, no una vista.
 *   `raw-count` — diagnósticos que MUESTRAN el número de filas crudas. Dedupearlos convertiría
 *                 "tienes 412 filas de runs" en otro número y dejaría de servir para lo único
 *                 que sirven: ver si el solapamiento existe.
 *   `guarded` — el patrón `typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll(...)`.
 *               La lectura cruda es el respaldo de un fichero que no cargó, no la ruta normal.
 *   `doomed`  — se borra en v11.66 (E-12, dead code). Permitida hasta que el borrado aterrice.
 *
 * El criterio del audit: fuera de `dedupe` y `export` no puede quedar más de DOS.
 */
const PERMITIDAS = {
  getRunsDeduped: 'dedupe',
  getSessionsDeduped: 'dedupe',
  validateRunDedup: 'dedupe',
  dataAvailability: 'raw-count',
  renderSyncCard: 'raw-count',
  exportCSV: 'export',
  exportBackup: 'export',
  restoreBackup: 'export',
  _cardioRecsDesc: 'guarded',
  _runningHistory4w: 'guarded',
  computeHardDayBudget: 'guarded',
  renderSessionHistory: 'guarded',
  // Se van con E-12 (dead code) en el mismo incremento; si ya no están, no pasa nada.
  renderWeekStrip: 'doomed',
  renderActivityRings: 'doomed',
  renderActivityRingsHome: 'doomed',
  renderWeeklyReport: 'doomed',
  renderRecentActivity: 'doomed',
};
const SIN_TOPE = new Set(['dedupe', 'export', 'guarded', 'doomed']);
const MAX_FUERA_DE_DEDUPE_Y_EXPORT = 2;

/** La función que contiene el offset `pos` (la última declaración a nivel de fichero). */
function fnAt(src, pos) {
  const re = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm;
  let name = '(nivel de fichero)';
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index > pos) break;
    name = m[1];
  }
  return name;
}

/** Todas las lecturas crudas de un store, con su función y su línea. */
function crudas(src, store) {
  const re = new RegExp(`dbGetAll\\('${store}'\\)`, 'g');
  const out = [];
  let m;
  while ((m = re.exec(src)) !== null) {
    const linea = src.slice(0, m.index).split('\n').length;
    // El patrón con guarda va en la MISMA línea que el ternario.
    const lineaSrc = src.split('\n')[linea - 1] || '';
    const guarded = /typeof get(Runs|Sessions)Deduped === 'function'/.test(lineaSrc);
    out.push({ fn: fnAt(src, m.index), linea, guarded });
  }
  return out;
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('1. Las vistas dedupeadas existen y son las únicas con la aritmética');

ok(/async function getRunsDeduped\(\)/.test(APP), 'getRunsDeduped() existe');
ok(/async function getSessionsDeduped\(\)/.test(APP), 'getSessionsDeduped() existe');
ok(/function dedupeRuns\(/.test(APP), 'dedupeRuns() existe (la aritmética del solapamiento)');
ok(/function dedupeSessions\(/.test(APP), 'dedupeSessions() existe');
ok(/return dedupeRuns\(await dbGetAll\('runs'\)\)/.test(APP),
  'getRunsDeduped() es exactamente "lee crudo y dedupea": una sola línea que se puede auditar');

// ════════════════════════════════════════════════════════════════════════════════════
sec('2. app.js: cada lectura cruda de `runs`, con su motivo');

const runsRaw = crudas(APP, 'runs');
const desconocidas = [];
let fueraDeDedupeYExport = 0;
for (const r of runsRaw) {
  const cat = r.guarded ? 'guarded' : PERMITIDAS[r.fn];
  if (!cat) { desconocidas.push(`${r.fn}() línea ${r.linea}`); continue; }
  if (!SIN_TOPE.has(cat) || cat === 'raw-count') {
    if (cat === 'raw-count') fueraDeDedupeYExport++;
  }
  console.log(`  ok   ${r.fn}() línea ${r.linea} — ${cat}`);
}
eq(desconocidas.join(' · ') || 'ninguna', 'ninguna',
  'ninguna lectura cruda de `runs` sin declarar (si aparece: usa getRunsDeduped o añádela con su motivo)');
ok(fueraDeDedupeYExport <= MAX_FUERA_DE_DEDUPE_Y_EXPORT,
  `${fueraDeDedupeYExport} lectura(s) cruda(s) fuera de dedupe/export/guarda: el tope del audit es ${MAX_FUERA_DE_DEDUPE_Y_EXPORT}`);

// ════════════════════════════════════════════════════════════════════════════════════
sec('3. app.js: `sessions` con el mismo criterio');

const sessRaw = crudas(APP, 'sessions');
const desconocidasS = [];
for (const r of sessRaw) {
  const cat = r.guarded ? 'guarded' : PERMITIDAS[r.fn];
  if (!cat) { desconocidasS.push(`${r.fn}() línea ${r.linea}`); continue; }
  console.log(`  ok   ${r.fn}() línea ${r.linea} — ${cat}`);
}
eq(desconocidasS.join(' · ') || 'ninguna', 'ninguna', 'ninguna lectura cruda de `sessions` sin declarar');

// ════════════════════════════════════════════════════════════════════════════════════
sec('4. Las agregaciones que el audit señaló usan la vista dedupeada');

// Las doce del hallazgo E-10, por nombre: si alguna vuelve a leer crudo, la línea de arriba lo
// caza; esto comprueba lo contrario, que de verdad llaman a la vista buena.
const debenDedupear = [
  'async function showWelcomeScreen(',       // racha diaria
  'async function renderStreaks(',           // rachas de Stats
  'async function renderWeekComparison(',    // comparación de semanas
  'async function renderStreakCalendar(',    // calendario de racha
  'async function renderWeeklySummary(',     // resumen semanal
  'async function renderWeekCalendar(',      // el calendario de Home
  'async function renderTodaysPlan(',        // la tarjeta de hoy
  'async function renderRunTotals(',         // totales semana/mes/año
  'async function renderRunHistory(',        // historial de carreras
  'async function renderSwimlaneTL(',        // swimlane
  'async function renderWeekBanner(',        // el banner de Gym
];
for (const anchor of debenDedupear) {
  const i = APP.indexOf(anchor);
  const nombre = anchor.replace('async function ', '').replace('(', '');
  if (i < 0) { console.log(`  ok   ${nombre}() ya no existe (borrada en este incremento)`); continue; }
  const cuerpo = APP.slice(i, i + 2600);
  ok(/getRunsDeduped\(/.test(cuerpo), `${nombre}() lee con getRunsDeduped()`);
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('5. nutrition.js: el EEE y el "¿hoy hay entreno?" también');

const nutRuns = crudas(NUT, 'runs');
for (const r of nutRuns) {
  ok(r.guarded, `nutrition.js línea ${r.linea}: la lectura cruda es sólo el respaldo de la guarda`);
}
const EEE_I = NUT.indexOf('async function nutEeeForDate(');
ok(EEE_I > 0, 'nutEeeForDate() existe');
ok(/getRunsDeduped/.test(NUT.slice(EEE_I, EEE_I + 2000)),
  'nutEeeForDate() dedupea (aquí se SUMAN kcal: contar doble hunde la EA del día)');
const TD_I = NUT.indexOf('async function nutIsTrainingDay(');
ok(TD_I > 0, 'nutIsTrainingDay() existe');
ok(/getRunsDeduped/.test(NUT.slice(TD_I, TD_I + 1200))
  && /getSessionsDeduped/.test(NUT.slice(TD_I, TD_I + 1200)),
  'nutIsTrainingDay() dedupea las dos tablas');

console.log(fail === 0
  ? '\nPASS — una sola lectura de runs/sessions: la dedupeada, y las crudas están declaradas\n'
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
