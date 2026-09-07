// `getWhoopContext()`: el dato de hoy es de HOY, o no hay dato.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (F-6 y F-14 del audit 2026-09-05):
//
//   1. `getWhoopContext()` hacía `data.recovery[data.recovery.length - 1]` — el ÚLTIMO elemento
//      del array de 7 días — SIN comparar su fecha con hoy. intervals.icu tarda horas en
//      reflejar el readiness del día, así que a las 7:00 el array acaba en el registro de AYER
//      y la app hablaba de hoy con la noche de anteayer. El escenario real: domingo 4 h de
//      sueño → lunes recovery 28 (rojo) → martes duermes 8 h, WHOOP aún no ha sincronizado →
//      el martes te pinta el 28 del lunes. Y el mensaje "todavía no hay dato" sólo salía si el
//      array estaba VACÍO.
//   2. La fecha derivada de UTC (`toISOString()`): a la 1:30 de Madrid "hoy" era ayer.
//   3. **v11.62**: el ajuste diario se retiró (decisión de Julian, 2026-09-07: "voy a ser yo y
//      mi cuerpo el que decida skipear un ejercicio o bajar los pesos"). Este fichero sustituye
//      a `verify-advisory-matrix.mjs`: la matriz `keep/modify/replace/recovery` ya no existe, y
//      lo que queda —y hay que seguir protegiendo— es la HONESTIDAD DE FECHA del dato de hoy,
//      que ahora alimenta una línea informativa en Home y la lista de señales de Stats.
//      Se comprueba además que `renderCardioLibrary` ya no dependa del advisory muerto: su
//      contexto sale de `getPlannedSessionForDate` + `getWhoopContext`.
//
// Ejecutar desde la raíz del repo: node tests/verify-whoop-context.mjs

import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
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

const GWC_SRC = cut(APP, 'async function getWhoopContext() {', '\n// ==================== READINESS', 'getWhoopContext');
const COLOR_SRC = cut(WHOOP, 'function getRecoveryColor(score) {', '\nasync function renderWhoopRecoveryCard', 'getRecoveryColor');

// ── Sandbox ────────────────────────────────────────────────────────────────────────────
// TODAY es la fecha LOCAL. YESTERDAY es lo que habría devuelto `toISOString().split('T')[0]` a
// la 1:30 de la madrugada en Madrid: un día MENOS. El caso 3 usa esa diferencia.
const TODAY = '2026-09-07';
const YESTERDAY = '2026-09-06';

const ctx = { console: { log() {}, info() {}, warn() {} } };
vm.createContext(ctx);
vm.runInContext(`
  var _INJECT = { data: null };
  function today() { return '${TODAY}'; }
  function whoopIsConnected() { return true; }
  var window = { whoopIsConnected: whoopIsConnected };
  async function whoopSyncData() { return _INJECT.data; }
  ${COLOR_SRC}
  ${GWC_SRC}
  globalThis._INJECT = _INJECT;
  globalThis.getWhoopContext = getWhoopContext;
`, ctx);

const set = (recovery, extra = {}) => {
  ctx._INJECT.data = Object.assign({ synced: true, recovery, sleep: [] }, extra);
};

// ── 1. Sin dato de hoy: unknown honesto, nunca el de ayer ──────────────────────────────
console.log('1. Sólo hay el dato de AYER (el fallo F-6)');
set([{ date: YESTERDAY, score: 28, hrv: 41, restingHR: 58 }],
  { todaySource: 'missing', todayMissingReason: 'intervals.icu aún tiene el de ayer; WHOOP directo no conectado' });
let c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'color unknown (el 28 de ayer NO se usa como hoy)');
eq(c.score, null, 'score null');
eq(c.source, 'none', "source 'none'");
eq(c.date, TODAY, 'date = hoy (local)');
yes(/ayer/.test(c.reason || ''), `reason explica por qué falta: "${c.reason}"`);
yes(!!c.lastAvailable && c.lastAvailable.date === YESTERDAY && c.lastAvailable.score === 28,
  'lastAvailable expone el último disponible con SU fecha (sólo para pintar)');

// ── 2. WHOOP directo trae el de hoy ────────────────────────────────────────────────────
console.log('');
console.log('2. intervals tiene ayer, WHOOP directo tiene HOY');
set([
  { date: YESTERDAY, score: 28, hrv: 41, restingHR: 58 },
  { date: TODAY, score: 71, hrv: 68, restingHR: 50, source: 'whoop-direct', fetchedAt: 1757222520000 },
], { todaySource: 'whoop-direct' });
c = await ctx.getWhoopContext();
eq(c.color, 'green', 'color verde (71 ≥ 67)');
eq(c.score, 71, 'score 71 — el de hoy');
eq(c.source, 'whoop-direct', "source 'whoop-direct'");
eq(c.fetchedAt, 1757222520000, 'fetchedAt viaja para poder pintar la hora');
eq(c.hrv, 68, 'hrv del registro de hoy');
eq(c.reason, null, 'sin motivo de falta (el dato está)');

// ── 3. La fecha se compara en LOCAL, no en UTC ─────────────────────────────────────────
console.log('');
console.log('3. Comparación de fechas en local');
set([{ date: YESTERDAY, score: 20 }, { date: TODAY, score: 71 }], { todaySource: 'intervals' });
c = await ctx.getWhoopContext();
eq(c.score, 71, 'con dos registros consecutivos elige el de la fecha LOCAL de hoy');
yes(!/recovery\[[^\]]*length - 1\]/.test(GWC_SRC), 'getWhoopContext ya no usa recovery[recovery.length - 1]');
yes(/recovery\.find\(|\.find\(r =>/.test(GWC_SRC), 'usa .find() por fecha');
yes(!/toISOString/.test(GWC_SRC), 'y no deriva "hoy" de una fecha UTC');
set([{ date: TODAY, score: null, hrv: 60 }],
  { todaySource: 'missing', todayMissingReason: 'WHOOP aún no puntuó la noche' });
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'una fila de hoy sin score sigue siendo unknown');
yes(/puntu/.test(c.reason || ''), 'con el motivo "WHOOP aún no puntuó la noche"');

// ── 4. Sin conexión ni datos: no se inventa nada ───────────────────────────────────────
console.log('');
console.log('4. Sin datos');
set([]);
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'array vacío → unknown');
eq(c.lastAvailable, null, 'lastAvailable null');
yes(!!c.reason, `y aun así hay un motivo legible: "${c.reason}"`);
ctx._INJECT.data = null;
c = await ctx.getWhoopContext();
eq(c.color, 'unknown', 'sin payload → unknown');
eq(c.score, null, 'y sin score inventado');

// ── 5. El advisory muerto no puede volver por la puerta de atrás ───────────────────────
//
// `renderCardioLibrary` era el último consumidor de `computeTrainingAdvisory` fuera de Home:
// pedía la matriz entera para sacar dos datos (¿hoy toca pierna? ¿la recuperación está en
// rojo?). Si el advisory volviera, volvería con él el consejo diario que el usuario rechazó.
console.log('');
console.log('5. renderCardioLibrary sin advisory (v11.62)');
const RCL_SRC = cut(APP, 'async function renderCardioLibrary() {', '\n// Push one catalog workout', 'renderCardioLibrary');
yes(!/computeTrainingAdvisory/.test(RCL_SRC), 'renderCardioLibrary NO llama a computeTrainingAdvisory');
yes(/getPlannedSessionForDate\(/.test(RCL_SRC), 'la sesión de hoy sale de getPlannedSessionForDate');
yes(/getWhoopContext\(/.test(RCL_SRC), 'y el rojo, de getWhoopContext (informativo)');
yes(/legsToday/.test(RCL_SRC) && /whoopRed/.test(RCL_SRC), 'conserva los dos avisos: pierna hoy y rojo');
yes(!/hardDayBudgetContext/.test(RCL_SRC), 'y ya no arrastra el contexto del presupuesto');

for (const f of readdirSync('app').filter(n => n.endsWith('.js'))) {
  const src = readFileSync(`app/${f}`, 'utf8');
  yes(!/computeTrainingAdvisory/.test(src), `app/${f} sin computeTrainingAdvisory`);
  yes(!/adjustSessionForReadiness/.test(src), `app/${f} sin adjustSessionForReadiness`);
}

console.log('');
console.log(failed === 0
  ? '✅ WHOOP: el dato de hoy es de hoy, el de ayer se pinta con su fecha y nadie ajusta el día con él.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
