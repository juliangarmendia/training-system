// La matriz completa del advisory, ahora sobre el readiness único (incremento 5, v11.59).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (F-6 y F-7 del audit 2026-09-05):
//
//   1. `getWhoopContext()` hacía `data.recovery[data.recovery.length - 1]` — el ÚLTIMO elemento
//      del array de 7 días — SIN comparar su fecha con hoy. intervals.icu tarda horas en
//      reflejar el readiness del día, así que a las 7:00 el array acaba en el registro de AYER
//      y el advisory decidía el entreno de hoy con él. El escenario real: domingo 4 h de sueño →
//      lunes recovery 28 (rojo) → martes duermes 8 h, WHOOP aún no ha sincronizado → el martes
//      te dice "Recuperar" con el 28 del lunes. Y el mensaje "todavía no hay dato" sólo salía si
//      el array estaba VACÍO. (v11.58 lo arregló; aquí se fija para que no vuelva.)
//   2. La rama `hard` dependía de que `toSession` clasificara bien la sesión. Con `fullA` →
//      `strength.maintenance` peso 1, un full-body con la recuperación en rojo caía al `else`
//      final: "Recuperación y carga ok". (v11.58; se fija igual.)
//   3. **v11.59**: el "multi-señal" del v1 era en la práctica UNA señal — el color de WHOOP de un
//      día — con dos nombres. Ahora el color viene de `computeReadiness()`, que exige ≥2 señales
//      CONCORDANTES para el rojo (READ-002). CONSECUENCIA BUSCADA Y COMPROBADA ABAJO: un WHOOP
//      rojo de hoy, solo, es UNA señal → amarillo → la sesión se AJUSTA, no se cambia. Es la
//      respuesta directa a "¿una mala noche modifica demasiado el entrenamiento?".
//
// Los invariantes del v1 que NO cambian: `easy → keep` con cualquier color · `unknown → keep` con
// `confidence:'low'` · `moderate + amarillo → modify` · `exigente + rojo → recovery` · `exigente +
// rojo + flag de interferencia no redundante → replace`.
//
// Ejecutar desde la raíz del repo: node tests/verify-advisory-matrix.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync('app/app.js', 'utf8');
const WHOOP = readFileSync('app/whoop.js', 'utf8');
const ENGINE = readFileSync('app/coach-engine.js', 'utf8');

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

const TYPES_SRC     = cut(APP, 'const SESSION_TYPES = {', '\n// Map a legacy WEEK_TEMPLATE', 'SESSION_TYPES');
const ADAPT_SRC     = cut(APP, 'function sessionSubtypeMeta(', '\n// ==================== DYNAMIC PLAN SYSTEM', 'toSession + SESSION_CLASS');
const IDEAL_SRC     = cut(APP, 'const IDEAL_BLOCK_V1 = {', '\n// RETIRADO en v11.38', 'IDEAL_BLOCK_V1');
const ALT_SRC       = cut(APP, 'const ALT_LIBRARY = {', '\n// T3b: state for 1-tap', 'ALT_LIBRARY');
const STRESS_SRC    = cut(APP, 'function classifySessionStress(', '\n// ==================== READINESS', 'classifySessionStress + getWhoopContext');
const READINESS_SRC = cut(APP, '// ==================== READINESS (v11.59', '\n// Weekly hard-day budget', 'computeReadiness + _coachAdjustCtx');
const INTERF_SRC    = cut(APP, 'function detectInterference(', '\n// Orchestrator', 'detectInterference + getReplacementOptions');
const ADVISORY_SRC  = cut(APP, 'async function computeTrainingAdvisory() {', '\n// ==================== TARJETA DEL COACH', 'computeTrainingAdvisory');
const PATTERNS_SRC  = cut(APP, 'const MOVEMENT_PATTERNS = {', '\n// Does a movement pattern count as core work?', 'MOVEMENT_PATTERNS');
const COMPOUND_SRC  = cut(APP, 'const _COMPOUND_PATTERNS = new Set([', '\nfunction deriveExerciseFlags(', '_COMPOUND_PATTERNS');
const COLOR_SRC     = cut(WHOOP, 'function getRecoveryColor(score) {', '\nasync function renderWhoopRecoveryCard', 'getRecoveryColor');

// ── Sandbox ────────────────────────────────────────────────────────────────────────────
// TODAY es la fecha LOCAL. YESTERDAY es lo que habría devuelto `toISOString().split('T')[0]` a
// la 1:30 de la madrugada en Madrid: un día MENOS. El caso 7 usa esa diferencia.
const TODAY = '2026-09-07';
const YESTERDAY = '2026-09-06';

const ctx = { console: { log() {}, info() {}, warn() {} } };
vm.createContext(ctx);
vm.runInContext(ENGINE, ctx);         // el motor puro: adjustSessionForReadiness, COACH_POWER_IDS
vm.runInContext(`
  var state = { settings: {} };
  var _INJECT = { data: null, planned: null, readiness: null, wellness: [], workouts: [] };
  function today() { return '${TODAY}'; }
  function dateStr(d) {
    // Sólo la usa computeReadiness para la ventana de 35 días; con fecha real basta.
    const dt = (d instanceof Date) ? d : new Date(d);
    const p = (n) => String(n).padStart(2, '0');
    return dt.getFullYear() + '-' + p(dt.getMonth() + 1) + '-' + p(dt.getDate());
  }
  function whoopIsConnected() { return true; }
  var window = { whoopIsConnected: whoopIsConnected };
  async function whoopSyncData() { return _INJECT.data; }
  async function dbGetAll(store) {
    if (store === 'wellness') return _INJECT.wellness;
    if (store === 'workouts') return _INJECT.workouts;
    return [];
  }
  function whoopDayLabel(d, t) { return d === t ? 'hoy' : 'ayer'; }
  async function getPlannedSessionForDate() { return _INJECT.planned; }
  async function computeHardDayBudget() { return { used: 2, cap: 6, hardSessions: 1, items: [], overCap: false }; }
  function getExerciseName(id) { return id; }
  ${COLOR_SRC}
  ${PATTERNS_SRC}
  ${COMPOUND_SRC}
  ${TYPES_SRC}
  ${ADAPT_SRC}
  ${IDEAL_SRC}
  ${ALT_SRC}
  ${STRESS_SRC}
  ${READINESS_SRC}
  ${INTERF_SRC}
  ${ADVISORY_SRC}
  // El stub del readiness: con \`_INJECT.readiness\` puesto manda la tabla; con null corre el
  // cálculo REAL sobre \`_INJECT.wellness\` + \`_INJECT.workouts\` (casos 8 y 9).
  const _realComputeReadiness = computeReadiness;
  computeReadiness = async (o) => (_INJECT.readiness ? _INJECT.readiness : _realComputeReadiness(o));
  globalThis._INJECT = _INJECT;
  globalThis.getWhoopContext = getWhoopContext;
  globalThis.computeTrainingAdvisory = computeTrainingAdvisory;
  globalThis.classifySessionStress = classifySessionStress;
  globalThis.invalidateReadiness = invalidateReadiness;
  globalThis._coachAdjustCtx = _coachAdjustCtx;
  globalThis._coachIsMainLift = _coachIsMainLift;
`, ctx);

const gym = (sessionId) => ({ type: 'gym', date: TODAY, sessionId, name: sessionId, subtitle: '', exercises: [] });
const set = (recovery, planned, extra = {}) => {
  ctx._INJECT.data = Object.assign({ synced: true, recovery, sleep: [] }, extra);
  ctx._INJECT.planned = planned;
  ctx.invalidateReadiness();
};
// El readiness inyectado. `fired` cuenta señales; `signals` sólo se usa para los textos.
const rd = (color, fired, confidence) => ({
  color, fired, confidence: confidence || (color === 'unknown' ? 'low' : 'high'), deloadHint: false,
  ruleIds: ['READ-001', 'READ-002'],
  signals: [
    { id: 'whoop', fired: false, status: 'ok', text: 'WHOOP hoy 70 % · verde' },
    { id: 'hrv7v28', fired: fired > 0, status: 'ok', text: 'HRV 7d 62 ms vs 71 de base (−13 %)' },
    { id: 'rhr7v28', fired: fired > 1, status: 'ok', text: 'FC reposo 7d 55 vs 49 (+6)' },
  ],
});

// ── 1. Sin dato de hoy: unknown honesto, nunca el de ayer ──────────────────────────────
console.log('1. Sólo hay el dato de AYER (el fallo F-6)');
ctx._INJECT.readiness = null;
ctx._INJECT.wellness = [];
ctx._INJECT.workouts = [];
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
eq(a.readiness.color, 'unknown', 'y el readiness también dice unknown (sin tendencias)');
yes(a.reason.some(r => /hoy/.test(r)), 'advisory: alguna razón menciona "hoy"');
yes(a.reason.some(r => /ayer|no conectado|puntu/.test(r)), 'advisory: y traslada el motivo concreto');
yes(a.reason.some(r => /no cuenta como hoy/.test(r)), 'advisory: dice explícitamente que el de ayer no cuenta');

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
eq(a.readiness.color, 'green', 'readiness verde (0 señales)');
eq(a.readiness.confidence, 'medium', 'confianza media: hay dato de hoy pero no 14 días de base');

// ── 3. La matriz, con el readiness inyectado ───────────────────────────────────────────
console.log('');
console.log('3. La matriz completa (readiness inyectado)');
const casos = [
  // [color, señales, sesión planificada, modo esperado, nota]
  ['green',   0, gym('lowerA'),  'keep',     'verde + pierna pesada'],
  ['green',   0, gym('upperA'),  'keep',     'verde + upper'],
  ['unknown', 0, gym('lowerA'),  'keep',     'sin dato + pierna pesada (nunca decide a ciegas)'],
  ['unknown', 0, gym('upperA'),  'keep',     'sin dato + upper'],
  ['yellow',  1, gym('upperA'),  'modify',   'amarillo + moderada → ajustar'],
  ['yellow',  1, gym('lowerA'),  'modify',   'amarillo + exigente → ajustar (compuestos intactos)'],
  ['red',     2, gym('upperA'),  'modify',   'rojo + moderada → ajustar fuerte, NO se cambia el día'],
  ['red',     2, gym('lowerA'),  'recovery', 'rojo + exigente → recuperación (READ-007)'],
  ['red',     2, gym('fullA'),   'recovery', 'rojo + full body → recuperación (F-7 arreglado)'],
  ['red',     2, gym('hybrid1'), 'replace',  'rojo + híbrido (2ª señal: HYB-002) → cambiar'],
];
for (const [color, fired, planned, esperado, nota] of casos) {
  ctx._INJECT.readiness = rd(color, fired);
  set([{ date: TODAY, score: 70 }], planned, { todaySource: 'intervals' });
  a = await ctx.computeTrainingAdvisory();
  eq(a.recommendation, esperado, nota);
}
// Y el `easy` es keep con CUALQUIER color: descanso, Z2 y día de recuperación.
for (const planned of [
  { type: 'rest', date: TODAY, name: 'Rest' },
  { type: 'run', date: TODAY, name: 'Cardio Z2', subtype: 'zone2', durationMin: 40 },
  { type: 'recovery', date: TODAY, name: 'Recuperación activa', z2FinisherMin: 20 },
]) {
  ctx._INJECT.readiness = rd('red', 3);
  set([{ date: TODAY, score: 18 }], planned, { todaySource: 'intervals' });
  a = await ctx.computeTrainingAdvisory();
  eq(a.recommendation, 'keep', `${planned.name} + rojo → keep`);
}
// El largo Z2 (peso 1 = moderada) sí se recorta.
ctx._INJECT.readiness = rd('yellow', 1);
set([{ date: TODAY, score: 52 }], { type: 'run', date: TODAY, name: 'Largo Z2', subtype: 'long_easy', durationMin: 50 }, { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.plannedStress.level, 'moderate', 'el largo Z2 es moderado (peso 1)');
eq(a.recommendation, 'modify', 'largo Z2 + amarillo → modify');
eq(a.adjusted.durationMin, 40, "y la sesión ajustada trae 40' (50 × 0,8)");

// ── 4. La salida trae la sesión ajustada y sus cambios ─────────────────────────────────
console.log('');
console.log('4. La salida del advisory (nuevos campos de v11.59)');
ctx._INJECT.readiness = rd('yellow', 1);
set([{ date: TODAY, score: 52 }], gym('lowerA'), { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
for (const k of ['plannedSession', 'plannedStress', 'recommendation', 'reason', 'alternatives',
                 'confidence', 'ruleIds', 'whoopContext', 'hardDayBudgetContext', 'interferenceContext',
                 'readiness', 'adjusted', 'changes']) {
  yes(k in a, `devuelve ${k}`);
}
yes(Array.isArray(a.changes), 'changes es un array');
yes(a.ruleIds.includes('READ-002'), 'los ruleIds del readiness llegan al advisory');
yes(a.reason.length > 0, 'y hay al menos una razón legible');
// `lowerA` del plan vivo no trae `exercises` en este fixture, así que los cambios son el tope de
// RPE; lo que importa aquí es que el objeto viaje y que no se toque `plannedSession`.
eq(a.plannedSession.sessionId, 'lowerA', 'plannedSession sigue siendo la planificada');

// ── 5. Un WHOOP rojo de hoy, SOLO, es amarillo (el cambio de v11.59) ──────────────────
console.log('');
console.log('5. Un rojo de un día no manda una sesión a recuperación (READ-002)');
ctx._INJECT.readiness = null;         // cálculo REAL
// 35 días de base normal: HRV 71, FC reposo 49, 7,2 h. Ninguna tendencia dispara.
const dayBefore = (n) => {
  const t = Date.UTC(2026, 8, 7) - n * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
ctx._INJECT.wellness = Array.from({ length: 35 }, (_, i) => ({
  date: dayBefore(i), hrv: 71, restingHR: 49, sleepSecs: Math.round(7.2 * 3600), readiness: 70,
}));
ctx._INJECT.workouts = [];
set([{ date: TODAY, score: 24, hrv: 70, restingHR: 49 }], gym('lowerA'), { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.whoopContext.color, 'red', 'WHOOP de hoy en rojo');
eq(a.readiness.fired, 1, 'una sola señal disparada');
eq(a.readiness.color, 'yellow', '…así que el readiness es AMARILLO, no rojo');
eq(a.recommendation, 'modify', 'y la pierna pesada se AJUSTA, no se cambia');
yes(a.readiness.confidence === 'high', 'con confianza alta (dato de hoy + 28 días de base)');

// ── 6. …y con una segunda señal concordante sí escala ──────────────────────────────────
console.log('');
console.log('6. Rojo de hoy + FC de reposo +6 → dos señales → recuperación');
ctx._INJECT.wellness = Array.from({ length: 35 }, (_, i) => ({
  date: dayBefore(i), hrv: 71, restingHR: i <= 6 ? 55 : 49, sleepSecs: Math.round(7.2 * 3600), readiness: 70,
}));
set([{ date: TODAY, score: 24, hrv: 70, restingHR: 55 }], gym('lowerA'), { todaySource: 'intervals' });
a = await ctx.computeTrainingAdvisory();
eq(a.readiness.fired, 2, 'dos señales concordantes');
eq(a.readiness.color, 'red', 'readiness rojo');
eq(a.recommendation, 'recovery', 'ahora sí: recuperación');
yes(a.alternatives.length > 0, 'y ofrece alternativas de ALT_LIBRARY');
eq(a.adjusted.durationMin, 30, "la sesión propuesta son 30' de la primera alternativa");

// ── 7. La fecha se compara en LOCAL, no en UTC ─────────────────────────────────────────
console.log('');
console.log('7. Comparación de fechas en local');
ctx._INJECT.readiness = rd('green', 0);
set([{ date: YESTERDAY, score: 20 }, { date: TODAY, score: 71 }], gym('lowerA'), { todaySource: 'intervals' });
c = await ctx.getWhoopContext();
eq(c.score, 71, 'con dos registros consecutivos elige el de la fecha LOCAL de hoy');
const GWC_SRC = cut(APP, 'async function getWhoopContext() {', '\n// ==================== READINESS', 'getWhoopContext');
yes(!/recovery\[[^\]]*length - 1\]/.test(GWC_SRC), 'getWhoopContext ya no usa recovery[recovery.length - 1]');
yes(/recovery\.find\(|\.find\(r =>/.test(GWC_SRC), 'usa .find() por fecha');
yes(!/toISOString/.test(GWC_SRC), 'y no deriva "hoy" de una fecha UTC');
set([{ date: TODAY, score: null, hrv: 60 }], gym('lowerA'),
  { todaySource: 'missing', todayMissingReason: 'WHOOP aún no puntuó la noche' });
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'una fila de hoy sin score sigue siendo unknown');
yes(/puntu/.test(c.reason || ''), 'con el motivo "WHOOP aún no puntuó la noche"');

// ── 8. Sin conexión ni datos: no se inventa nada ───────────────────────────────────────
console.log('');
console.log('8. Sin datos');
ctx._INJECT.readiness = null;
ctx._INJECT.wellness = [];
set([], gym('lowerA'));
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'array vacío → unknown');
eq(c.lastAvailable, null, 'lastAvailable null');
yes(!!c.reason, `y aun así hay un motivo legible: "${c.reason}"`);
a = await ctx.computeTrainingAdvisory();
eq(a.recommendation, 'keep', 'advisory: keep');
eq(a.confidence, 'low', 'advisory: confidence low');
eq(a.readiness.color, 'unknown', 'readiness unknown');

// ── 9. El ctx del ajuste protege los seis patrones ─────────────────────────────────────
console.log('');
console.log('9. _coachAdjustCtx');
const stress = ctx.classifySessionStress(gym('lowerA'));
const actx = ctx._coachAdjustCtx(gym('lowerA'), stress, { flags: [] });
yes(typeof actx.isCore === 'function' && typeof actx.isCompound === 'function', 'pasa isCore e isCompound');
yes(typeof actx.isMainLift === 'function', 'y isMainLift (protege el RDL del recorte)');
yes(actx.isMainLift({ id: 'rdl' }), 'rdl cuenta como patrón principal (bisagra)');
yes(actx.isMainLift({ id: 'back-squat' }), 'back-squat también');
yes(!actx.isMainLift({ id: 'calf-raise' }), 'el gemelo no');
yes(!actx.isMainLift({ id: 'box-jump' }), 'el box jump tampoco (pliometría)');
yes(!!actx.powerIds && !!actx.powerIds['box-jump'], 'y los ids de potencia llegan');
// El flag redundante ("rojo + sesión exigente") NO cuenta como segunda señal (READ-002).
const conFlags = ctx._coachAdjustCtx(gym('lowerA'), stress, {
  flags: [{ type: 'recovery', ruleId: 'READ-003' }, { type: 'hybrid', ruleId: 'HYB-002' }],
});
eq(conFlags.flags, 1, "de dos flags sólo cuenta el no redundante (el 'recovery' es la misma señal)");

console.log('');
console.log(failed === 0
  ? '✅ Advisory v11.59: el dato de hoy es de hoy, el rojo pide dos señales y la salida trae la sesión ajustada.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
