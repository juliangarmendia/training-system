// La matriz del advisory y la frescura del dato de hoy (incremento 4, v11.58).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (F-6 del audit 2026-09-05):
// `getWhoopContext()` hacía `data.recovery[data.recovery.length - 1]` — el ÚLTIMO elemento del
// array de 7 días — SIN comparar su fecha con hoy. intervals.icu tarda horas en reflejar el
// readiness del día, así que a las 7:00 el array acaba en el registro de AYER y el advisory
// decidía el entreno de hoy con él. El escenario real: domingo 4 h de sueño → lunes recovery 28
// (rojo) → martes duermes 8 h, WHOOP aún no ha sincronizado → el martes te dice "Recuperar" con
// el 28 del lunes. Y el mensaje "todavía no hay dato" sólo salía si el array estaba VACÍO.
//
// El segundo fallo que impide (F-7, cruzado): la rama `hard` del advisory dependía de que
// `toSession` clasificara bien la sesión. Con `fullA` → `strength.maintenance` peso 1, un
// full-body con la recuperación en rojo caía al `else` final: "Recuperación y carga ok".
//
// Reglas que verifica: READ-001 (dato del día correcto), READ-002 (≥2 señales concordantes para
// escalar a `replace`), READ-003 (rojo + sesión exigente), y la honestidad del `unknown`:
// sin dato de hoy → `keep` con `confidence:'low'` y un motivo que dice por qué.
//
// Ejecutar desde la raíz del repo: node tests/verify-advisory-matrix.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync('app/app.js', 'utf8');
const WHOOP = readFileSync('app/whoop.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

const cut = (src, from, to, label) => {
  const i = src.indexOf(from);
  const j = src.indexOf(to, i + from.length);
  if (i < 0 || j < 0) { console.log(`FAIL — no se pudo extraer ${label}`); process.exit(1); }
  return src.slice(i, j);
};

const TYPES_SRC   = cut(APP, 'const SESSION_TYPES = {', '\n// Map a legacy WEEK_TEMPLATE', 'SESSION_TYPES');
const ADAPT_SRC   = cut(APP, 'function sessionSubtypeMeta(', '\n// ==================== DYNAMIC PLAN SYSTEM', 'toSession + SESSION_CLASS');
const IDEAL_SRC   = cut(APP, 'const IDEAL_BLOCK_V1 = {', '\n// RETIRADO en v11.38', 'IDEAL_BLOCK_V1');
const ALT_SRC     = cut(APP, 'const ALT_LIBRARY = {', '\n// T3b: state for 1-tap', 'ALT_LIBRARY');
const STRESS_SRC  = cut(APP, 'function classifySessionStress(', '\n// Weekly hard-day budget', 'classifySessionStress + getWhoopContext');
const INTERF_SRC  = cut(APP, 'function detectInterference(', '\n// Orchestrator', 'detectInterference + getReplacementOptions');
const ADVISORY_SRC = cut(APP, 'async function computeTrainingAdvisory() {', '\nconst _T3_REC = {', 'computeTrainingAdvisory');
const COLOR_SRC   = cut(WHOOP, 'function getRecoveryColor(score) {', '\nasync function renderWhoopRecoveryCard', 'getRecoveryColor');

// ── Sandbox: hoy es fijo, y los datos de WHOOP y del plan se inyectan ──────────────────
// TODAY es la fecha LOCAL. UTC_TODAY es lo que habría devuelto `toISOString().split('T')[0]`
// a la 1:30 de la madrugada en Madrid: un día MENOS. El caso 7 usa esa diferencia.
const TODAY = '2026-09-07';
const YESTERDAY = '2026-09-06';   // = la fecha UTC de las 01:30 locales del 7-sep en Madrid

const ctx = { console: { log() {}, info() {}, warn() {} } };
vm.createContext(ctx);
vm.runInContext(`
  var state = { settings: {} };
  var _INJECT = { data: null, planned: null };
  function today() { return '${TODAY}'; }
  function dateStr(d) { return '${TODAY}'; }
  function whoopIsConnected() { return true; }
  var window = { whoopIsConnected: whoopIsConnected };
  async function whoopSyncData() { return _INJECT.data; }
  async function getPlannedSessionForDate() { return _INJECT.planned; }
  async function computeHardDayBudget() { return { used: 2, cap: 6, hardSessions: 1, items: [], overCap: false }; }
  ${COLOR_SRC}
  ${TYPES_SRC}
  ${ADAPT_SRC}
  ${IDEAL_SRC}
  ${ALT_SRC}
  ${STRESS_SRC}
  ${INTERF_SRC}
  ${ADVISORY_SRC}
  globalThis._INJECT = _INJECT;
  globalThis.getWhoopContext = getWhoopContext;
  globalThis.computeTrainingAdvisory = computeTrainingAdvisory;
  globalThis.classifySessionStress = classifySessionStress;
`, ctx);

const gym = (sessionId) => ({ type: 'gym', date: TODAY, sessionId, name: sessionId, subtitle: '', exercises: [] });
const set = (recovery, planned, extra = {}) => {
  ctx._INJECT.data = Object.assign({ synced: true, recovery, sleep: [] }, extra);
  ctx._INJECT.planned = planned;
};

// ── 1. Sin dato de hoy: unknown honesto, nunca el de ayer ──────────────────────────────
console.log('1. Sólo hay el dato de AYER (el fallo F-6)');
set([{ date: YESTERDAY, score: 28, hrv: 41, restingHR: 58 }], gym('lowerA'),
  { todaySource: 'missing', todayMissingReason: 'intervals.icu aún tiene el de ayer; WHOOP directo no conectado' });
let c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'color unknown (el 28 de ayer NO se usa como hoy)');
eq(c.score, null, 'score null');
eq(c.source, 'none', "source 'none'");
eq(c.date, TODAY, 'date = hoy (local)');
yes(/ayer/.test(c.reason || ''), `reason explica por qué falta: "${c.reason}"`);
yes(!!c.lastAvailable && c.lastAvailable.date === YESTERDAY && c.lastAvailable.score === 28,
  'lastAvailable expone el último disponible con SU fecha (sólo para pintar)');
let a = await ctx.computeTrainingAdvisory();
eq(a.recommendation, 'keep', 'advisory: keep');
eq(a.confidence, 'low', 'advisory: confidence low');
yes(a.reason.some(r => /hoy/.test(r)), 'advisory: alguna razón menciona "hoy"');
yes(a.reason.some(r => /ayer|no conectado|puntu/.test(r)), 'advisory: y traslada el motivo concreto');

// ── 2. WHOOP directo trae el de hoy ────────────────────────────────────────────────────
console.log('');
console.log('2. intervals tiene ayer, WHOOP directo tiene HOY');
set([
  { date: YESTERDAY, score: 28, hrv: 41, restingHR: 58 },
  { date: TODAY, score: 71, hrv: 68, restingHR: 50, source: 'whoop-direct', fetchedAt: 1757222520000 },
], gym('lowerA'), { todaySource: 'whoop-direct' });
c = await ctx.getWhoopContext();
eq(c.color, 'green', 'color verde (71 ≥ 67)');
eq(c.score, 71, 'score 71 — el de hoy');
eq(c.source, 'whoop-direct', "source 'whoop-direct'");
eq(c.fetchedAt, 1757222520000, 'fetchedAt viaja para poder pintar la hora');
eq(c.hrv, 68, 'hrv del registro de hoy');
a = await ctx.computeTrainingAdvisory();
eq(a.recommendation, 'keep', 'advisory: keep con recuperación verde');
eq(a.confidence, 'high', 'advisory: confidence high (hay dato de hoy)');

// ── 3. Rojo hoy + sesión exigente → recuperación ───────────────────────────────────────
console.log('');
console.log('3. Rojo HOY + pierna pesada');
set([{ date: TODAY, score: 24, hrv: 38, restingHR: 61 }], gym('lowerA'), { todaySource: 'intervals' });
c = await ctx.getWhoopContext();
eq(c.color, 'red', 'color rojo');
eq(c.source, 'intervals', "source 'intervals' cuando el dato de hoy viene del histórico");
a = await ctx.computeTrainingAdvisory();
eq(a.plannedStress.level, 'hard', 'lowerA es exigente');
eq(a.recommendation, 'recovery', 'advisory: recovery (matriz v1)');
yes(a.alternatives.length > 0, 'y ofrece alternativas de ALT_LIBRARY');

// ── 4. Amarillo hoy + sesión moderada → ajustar ────────────────────────────────────────
console.log('');
console.log('4. Amarillo HOY + upper (moderada)');
set([{ date: TODAY, score: 52 }], gym('upperA'), { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.whoopContext.color, 'yellow', 'color amarillo');
eq(a.plannedStress.level, 'moderate', 'upperA es moderada');
eq(a.recommendation, 'modify', 'advisory: modify');

// ── 5. Día suave / descanso → keep siempre ─────────────────────────────────────────────
console.log('');
console.log('5. Descanso y cardio fácil: keep con cualquier color');
set([{ date: TODAY, score: 18 }], { type: 'rest', date: TODAY, name: 'Rest' }, { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.recommendation, 'keep', 'descanso + rojo → keep');
set([{ date: TODAY, score: 18 }], { type: 'run', date: TODAY, name: 'Cardio Z2', subtype: 'zone2', durationMin: 40 }, { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.plannedStress.level, 'easy', 'Z2 es suave');
eq(a.recommendation, 'keep', 'Z2 + rojo → keep');

// ── 6. F-7 arreglado: un full-body con rojo YA escala ──────────────────────────────────
console.log('');
console.log('6. fullA + rojo HOY (antes: "Recuperación y carga ok")');
set([{ date: TODAY, score: 25 }], gym('fullA'), { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.plannedStress.level, 'hard', 'fullA es exigente (peso 2 del IDEAL)');
eq(a.recommendation, 'recovery', 'advisory: recovery');
set([{ date: TODAY, score: 25 }], gym('hybrid1'), { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.plannedStress.family, 'hybrid', 'hybrid1 es familia hybrid');
yes(a.interferenceContext.flags.some(f => f.ruleId === 'HYB-002'), 'y produce el flag HYB-002 (era inalcanzable)');
eq(a.recommendation, 'replace', 'rojo + híbrido = 2 señales → replace (READ-002)');

// ── 7. La fecha se compara en LOCAL, no en UTC ─────────────────────────────────────────
console.log('');
console.log('7. Comparación de fechas en local');
// A la 1:30 de la madrugada del 7-sep en Madrid, `toISOString().split('T')[0]` da '2026-09-06'.
// Si el código comparase con esa cadena, elegiría el registro del 6 (score 20) en vez del de hoy.
set([{ date: YESTERDAY, score: 20 }, { date: TODAY, score: 71 }], gym('lowerA'), { todaySource: 'intervals' });
c = await ctx.getWhoopContext();
eq(c.score, 71, 'con dos registros consecutivos elige el de la fecha LOCAL de hoy');
const GWC_SRC = cut(APP, 'async function getWhoopContext() {', '\n// Weekly hard-day budget', 'getWhoopContext');
// Lo prohibido es indexar el array de recovery por su último elemento para hacer de "hoy".
// (`lastAvailable` sí coge el último, pero de una copia ORDENADA y etiquetado con su fecha.)
yes(!/recovery\[[^\]]*length - 1\]/.test(GWC_SRC), 'getWhoopContext ya no usa recovery[recovery.length - 1]');
yes(/recovery\.find\(|\.find\(r =>/.test(GWC_SRC), 'usa .find() por fecha');
yes(!/toISOString/.test(GWC_SRC), 'y no deriva "hoy" de una fecha UTC');
// Un registro de hoy sin score puntuado tampoco vale como dato.
set([{ date: TODAY, score: null, hrv: 60 }], gym('lowerA'),
  { todaySource: 'missing', todayMissingReason: 'WHOOP aún no puntuó la noche' });
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'una fila de hoy sin score sigue siendo unknown');
yes(/puntu/.test(c.reason || ''), 'con el motivo "WHOOP aún no puntuó la noche"');

// ── 8. Sin conexión ni datos: no se inventa nada ───────────────────────────────────────
console.log('');
console.log('8. Sin datos');
set([], gym('lowerA'));
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'array vacío → unknown');
eq(c.lastAvailable, null, 'lastAvailable null');
yes(!!c.reason, `y aun así hay un motivo legible: "${c.reason}"`);
a = await ctx.computeTrainingAdvisory();
eq(a.recommendation, 'keep', 'advisory: keep');
eq(a.confidence, 'low', 'advisory: confidence low');

console.log('');
console.log(failed === 0
  ? '✅ Advisory v1: el dato de hoy es de hoy, o unknown con motivo.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
