// La rampa de cardio sale de lo HECHO, no del número de semana (E-6, auditoría 2026-09-08).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. `progressCardioMin` rampaba sobre
// `block.index`: en la semana 4 del bloque prescribía base × 1,1³ **aunque no se hubiese
// corrido en tres semanas**. La única puerta que lo protegía era `lastCardioDaysAgo`, y era
// GLOBAL — cualquier cardio contaba, incluido el Z2 finisher de 15′ del lunes y una bici de
// anteayer. Resultado real del 8 de septiembre: cuatro semanas sin correr, una bici hace tres
// días, y el miércoles seguía pidiendo 53′ de zona 2 sobre una base aeróbica que no existía.
//
// Las formas conocidas de romperlo otra vez:
//
//   · **Rampar sobre el calendario.** Si el número sube porque pasó una semana y no porque se
//     hicieron los minutos de la semana anterior, la prescripción es una progresión de papel.
//   · **Mezclar huecos.** Un finisher de 20′ y una sesión de cardio de 50′ pueden caer el
//     mismo día de la semana; una mediana de los dos no describe ninguno.
//   · **Rampar sobre la media.** Un día en que se cortó la sesión a la mitad arrastraría la
//     prescripción de la semana siguiente. La mediana absorbe el día raro; la media no.
//   · **Perder el techo.** El ×1,35 sobre la BASE del slot es lo que impide que un bloque
//     largo convierta 40′ en 115′. Si el techo pasara a ser relativo a lo hecho, desaparece.
//   · **Quitar la puerta de los 14 días.** Volver de una pausa con un 10 % más de volumen es
//     cómo se llega a una lesión (LOAD-004).
//   · **Progresar en descarga.** La semana 5/5 existe para bajar. Un pico de cardio ahí es lo
//     peor de los dos mundos.
//
// Y el contrato que no puede romperse nunca: esta función devuelve MINUTOS. Ni zona, ni FC, ni
// ritmo (END-002: la base aeróbica se construye con minutos fáciles, la intensidad no es una
// perilla de progresión). `verify-block-week.mjs` fija la forma del retorno.
//
// Ejecutar desde la raíz del repo: node tests/verify-cardio-progress.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');

const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
const E = sandbox.module.exports;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

if (typeof E.progressCardioMin !== 'function' || typeof E._cardioRefMin !== 'function') {
  console.log('FAIL — coach-engine.js no exporta progressCardioMin/_cardioRefMin');
  process.exit(1);
}
const { progressCardioMin } = E;

/** Un bloque de 5 semanas, en la semana `i`. */
const blk = (i, isDeload = false) => ({ index: i, isDeload, label: isDeload ? 'deload' : 'build' });
/** Historial de un hueco: `[['2026-W36', 40], ['2026-W37', 45]]` → filas del motor. */
const H = (pairs) => pairs.map(([weekKey, min]) => ({ weekKey, min }));
/** Opciones con historial: la variante 6, y el hueco visto hace 3 días. */
const O = (history, extra = {}) => Object.assign(
  { variant: 6, lastCardioDaysAgo: 3, history }, extra);

// ════════════════════════════════════════════════════════════════════════════════════
sec('1. _cardioRefMin: la mediana de las DOS últimas semanas con dato');

eq(E._cardioRefMin(H([['2026-W37', 40]])), 40, 'una sola sesión: la referencia es ella');
eq(E._cardioRefMin(H([['2026-W37', 40], ['2026-W37', 50]])), 45,
  'dos sesiones de la misma semana: la mediana de las dos');
eq(E._cardioRefMin(H([['2026-W37', 50], ['2026-W36', 40], ['2026-W36', 45]])), 45,
  'tres sesiones en dos semanas: mediana del conjunto (40/45/50)');
eq(E._cardioRefMin(H([['2026-W37', 50], ['2026-W36', 45], ['2026-W30', 10]])), 47.5,
  'la semana de hace dos meses NO entra: sólo las dos últimas CON dato');
eq(E._cardioRefMin(H([['2026-W37', 40], ['2026-W37', 40], ['2026-W37', 90]])), 40,
  'la mediana absorbe el día raro (40/40/90 → 40); la media daría 56,7');
eq(E._cardioRefMin([]), null, 'sin filas: null (el llamador repite la base)');
eq(E._cardioRefMin(H([['2026-W37', 0], ['2026-W37', -5]])), null,
  'minutos no positivos no son un dato');
eq(E._cardioRefMin([{ min: 40 }]), null, 'una fila sin semana no se puede ordenar: se descarta');
eq(E._cardioRefMin(null), null, 'null no revienta');

// El orden de las claves ISO es el orden del tiempo, incluido el cruce de año.
eq(E._cardioRefMin(H([['2027-W01', 50], ['2026-W53', 40], ['2026-W52', 10]])), 45,
  'cruce de año: 2027-W01 y 2026-W53 son las dos últimas, no 2026-W52');

// ════════════════════════════════════════════════════════════════════════════════════
sec('2. La rampa: +10 % sobre la mediana, con el techo sobre la BASE');

{
  const r = progressCardioMin(40, blk(4), O(H([['2026-W37', 40], ['2026-W36', 40]])));
  eq(r.min, 45, '40′ hechos dos semanas → 44 redondeado al paso de 5 = 45′');
  eq(r.source, 'rule', 'la fuente es la regla');
  ok(/median/.test(r.note), `y la nota dice de dónde sale: "${r.note}"`);
  ok(/40/.test(r.note), '…con el número de referencia dentro');
}
{
  // EL CASO DEL AUDIT. Semana 4 del bloque, pero el hueco lleva un mes sin usarse: la puerta
  // de los 14 días es del HUECO, así que devuelve la base en vez de 53′.
  const r = progressCardioMin(40, blk(4), O(H([['2026-W33', 40]]), { lastCardioDaysAgo: 30 }));
  eq(r.min, 40, 'semana 4 del bloque con 30 días sin usar este hueco → base, no 53′');
  eq(r.source, 'base', 'y la fuente lo dice');
  ok(/30 d without cardio/.test(r.note), `con su motivo: "${r.note}"`);
  // Contraste: la MISMA semana de bloque por el camino legacy (sin historial) sí rampaba.
  const legacy = progressCardioMin(40, blk(4), { variant: 6, lastCardioDaysAgo: 3 });
  eq(legacy.min, 55, 'el camino legacy (sin history) sigue dando 40 × 1,1³ ≈ 53 → 55');
}
{
  const r = progressCardioMin(40, blk(4), O([]));
  eq(r.min, 40, 'historial vacío (nunca se hizo cardio en este hueco) → base');
  eq(r.source, 'base', '…y la fuente es base');
  ok(/no minutes logged in this slot/.test(r.note), `con su motivo: "${r.note}"`);
}
{
  // El techo sigue siendo relativo a la BASE del slot: 40 × 1,35 = 54.
  const r = progressCardioMin(40, blk(3), O(H([['2026-W37', 60], ['2026-W36', 60]])));
  eq(r.min, 55, '60′ hechos sobre una base de 40 → tope 54, redondeado al paso = 55′');
  const alto = progressCardioMin(40, blk(3), O(H([['2026-W37', 120]])));
  eq(alto.min, 55, 'y 120′ tampoco pasan del techo: la base manda sobre el pico');
}
{
  // Progresa desde lo hecho aunque esté POR DEBAJO de la base: es el punto de la regla.
  const r = progressCardioMin(50, blk(2), O(H([['2026-W37', 25], ['2026-W36', 25]])));
  eq(r.min, 30, '25′ hechos sobre un slot de 50′ → 27,5 redondeado = 30′, no 50′');
}
{
  // Finisher corto: el paso es de 2′ o la progresión desaparece en el redondeo.
  const r = progressCardioMin(20, blk(2), O(H([['2026-W37', 20], ['2026-W36', 20]])));
  eq(r.min, 22, 'finisher de 20′ → 22′ (paso de 2′, no de 5′)');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('3. Las puertas que siguen mandando sobre el historial');

{
  const r = progressCardioMin(40, blk(5, true), O(H([['2026-W37', 50], ['2026-W36', 50]])));
  eq(r.min, 35, 'descarga: −30 % sobre la mediana (50 → 35), nunca una subida');
  eq(r.source, 'rule', 'sigue siendo la regla');
  ok(/deload/.test(r.note), `y se dice: "${r.note}"`);
}
{
  const r = progressCardioMin(40, blk(3), O(H([['2026-W37', 40]]), { variant: 0 }));
  eq(r.min, 40, 'variante de viaje (0): repite base, con historial o sin él');
  ok(/travel/.test(r.note), `con su motivo: "${r.note}"`);
}
{
  const r = progressCardioMin(40, blk(3), O(H([['2026-W37', 40]]), { coachMin: 45 }));
  eq(r.min, 45, 'el coach manda sobre la regla, también con historial');
  eq(r.source, 'coach', '…y la fuente lo dice');
}
{
  const r = progressCardioMin(40, blk(3), O(H([['2026-W37', 40]]), { lastCardioDaysAgo: null }));
  eq(r.min, 40, 'sin ningún registro en el hueco (lastCardioDaysAgo null) → base');
}
{
  // Sin ancla de bloque el historial SÍ vale: la mediana no necesita saber en qué semana del
  // bloque estamos, sólo el deload lo necesita — y sin ancla no hay deload.
  const r = progressCardioMin(40, { index: null, isDeload: false, label: 'sin ancla' },
    O(H([['2026-W37', 40], ['2026-W36', 40]])));
  eq(r.min, 45, 'sin ancla de bloque, con historial, la rampa funciona igual');
}
{
  // El invariante: con historial, NADA sube más del 10 % sobre la mediana ni del 35 % sobre la
  // base, y en descarga nada sube.
  let excesos = 0;
  let subeEnDeload = 0;
  for (const base of [15, 20, 30, 40, 50]) {
    for (const hecho of [5, 12, 20, 35, 48, 70]) {
      const ref = hecho;
      const r = progressCardioMin(base, blk(3), O(H([['2026-W37', hecho], ['2026-W36', hecho]])));
      if (r.min > Math.min(ref * 1.1, base * 1.35) + 2.5 + 1e-9) excesos++;
      const d = progressCardioMin(base, blk(5, true), O(H([['2026-W37', hecho]])));
      if (d.min > ref) subeEnDeload++;
    }
  }
  eq(excesos, 0, '30 combinaciones: ninguna pasa del +10 % ni del techo (± el paso de redondeo)');
  eq(subeEnDeload, 0, '30 combinaciones en descarga: 0 subidas');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('4. El cableado: app.js lee el hueco, no todo el cardio');

const fnSrc = (anchor, len = 4000) => {
  const i = APP.indexOf(anchor);
  return i < 0 ? '' : APP.slice(i, i + len);
};

const SLOT_SRC = fnSrc('async function _cardioSlotHistory(');
ok(!!SLOT_SRC, '_cardioSlotHistory() existe en app.js');
ok(/dow !== Number\(jsDay\)/.test(SLOT_SRC), 'filtra por el MISMO día de la semana (el hueco)');
ok(/!!r\.finisher !== wantFinisher/.test(SLOT_SRC),
  'y separa el finisher post-fuerza de la sesión de cardio (dos huecos, dos medianas)');
ok(/isoWeekKey\(r\.date\)/.test(SLOT_SRC), 'cada fila viaja con su semana ISO');
ok(/if \(age > days\) continue;/.test(SLOT_SRC), 'la ventana de lectura está acotada');
ok(/r\.date > ds/.test(SLOT_SRC), 'y no cuenta el futuro (no se rampa sobre lo que no ha pasado)');

const GP_SRC = fnSrc('async function getPlannedSessionForDate(', 3500);
ok(/_cardioSlotHistory\(jsDay, ds, kind\)/.test(GP_SRC), 'getPlannedSessionForDate() lo llama');
ok(/history: h\.history/.test(GP_SRC), '…y pasa el historial a progressCardioMin');
ok(/lastCardioDaysAgo: h\.lastDaysAgo/.test(GP_SRC),
  '…y la puerta de los 14 días mira ese hueco, no el último cardio de cualquier tipo');
ok(/'finisher'\)/.test(GP_SRC), 'los slots de finisher se piden como tal');

const RECS_SRC = fnSrc('async function _cardioRecsDesc(', 2200);
ok(!!RECS_SRC, '_cardioRecsDesc() existe');
ok(/getRunsDeduped/.test(RECS_SRC) && /getSessionsDeduped/.test(RECS_SRC),
  'lee DEDUPEADO (la misma actividad llega por Strava y por intervals.icu)');
ok(/state\._lastCardioDate = \{ dates: recs\.map/.test(RECS_SRC),
  'y mantiene la caché de 60 s con la misma clave que invalidan logCardio/logZ2Finisher/sync');
ok(/origin === 'z2_finisher'/.test(RECS_SRC), 'marca el finisher por su `origin`');

// ════════════════════════════════════════════════════════════════════════════════════
sec('5. E-4 · los minutos del coach caducan como sus kg');

// EL FALLO QUE ESTA SECCIÓN IMPIDE. `plan-v2-schema.md` §"La regla de prioridad" dice que el
// objetivo del coach manda "y la ventana de vigencia está abierta", y eso se cumplía para los
// kg (`suggestSetTarget`) y NO para los minutos: `_coachCardioMin` devolvía el número del plan
// para siempre. Un plan de hace tres semanas seguía prescribiendo 50′ de zona 2 mientras sus
// kg ya habían cedido el paso a la regla — el mismo plan con dos vidas distintas.
const CCM_SRC = fnSrc('function _coachCardioMin(', 900);
ok(!!CCM_SRC, '_coachCardioMin() existe');
ok(/if \(c\.source !== 'seed' && !_coachPlanTargetsAreCurrent\(\)\) return null;/.test(CCM_SRC),
  'comprueba la vigencia antes de devolver un número');
ok(/c\.source !== 'seed'/.test(CCM_SRC),
  '…y sólo caduca lo que escribió el coach: la semilla del plan ideal no es una prescripción con fecha');
const VIG_SRC = fnSrc('function _coachPlanTargetsAreCurrent(', 900);
ok(/coachTargetIsCurrent\(activePlan\.weekKey, today\(\)\)/.test(VIG_SRC),
  'con la MISMA función que usa suggestSetTarget para los kg');
ok(/COACH_TARGET_TTL_DAYS/.test(VIG_SRC),
  'y con el mismo respaldo de 14 días por createdAt cuando el plan no trae weekKey');
ok(/typeof coachTargetIsCurrent !== 'function'/.test(VIG_SRC),
  'si coach-engine.js no cargó no bloquea el plan (degradar, no romper)');

// La ventana en sí, sobre el motor.
ok(typeof E.coachTargetIsCurrent === 'function', 'coachTargetIsCurrent() está exportada');
ok(E.coachTargetIsCurrent('2026-W37', '2026-09-08'), 'un plan de esta semana está vigente');
ok(E.coachTargetIsCurrent('2026-W36', '2026-09-08'), 'y uno de la semana pasada');
ok(!E.coachTargetIsCurrent('2026-W35', '2026-09-08'), 'el de hace tres semanas ya no');
ok(!E.coachTargetIsCurrent(null, '2026-09-08'), 'sin semana no hay vigencia');

console.log(fail === 0
  ? '\nPASS — el cardio progresa desde lo que se hizo en ese hueco, con su techo y sus puertas\n'
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
