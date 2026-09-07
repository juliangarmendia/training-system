// Coach v2 — incremento 2: semana del bloque + progresión de cardio (v11.56).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. `IDEAL_BLOCK_V1.weeks = 5` declara "4 build +
// 1 deload" desde junio, pero sólo el deload existía: las semanas 1-4 eran IDÉNTICAS y el
// `durationMin` del cardio llevaba constante en 40/50 desde entonces (audit Change 11, F-0).
// Al conectar la progresión, las formas conocidas de romperla en silencio son:
//
//   · **Semanas 1-4 iguales.** Si `blockWeekFromDates` devuelve siempre el mismo índice —o
//     `null` porque el ancla no migró—, `progressCardioMin` cae a `base` para siempre y el
//     bug queda tal cual, pero ahora con código que finge progresar.
//   · **Progresar en deload.** La semana 5 recorta series de fuerza al 50 % Y baja el cardio
//     a ×0,7. Un modulo mal puesto (`index % 5` en vez de `(w % 5) + 1`) pone el pico de
//     volumen justo en la semana de descarga: lo peor de los dos mundos.
//   · **Progresar en viaje.** La variante 0 existe porque no hay gimnasio ni rutina; subirle
//     los minutos un 10 % semanal es prescribir sobre datos que no existen.
//   · **Progresar tras una pausa.** Volver de 3 semanas sin cardio con el 33 % más de
//     volumen que el último día que se corrió es cómo se llega a una lesión. >14 días → base.
//   · **Sin techo.** 1,1^n crece sin límite: 12 semanas de bloque convertirían 40' en 115'.
//     El techo ×1,35 es explícito.
//   · **Aritmética en local / semana que no empieza en lunes.** El ancla es un LUNES ISO. Si
//     `mondayOf` usa horas locales, un domingo por la noche cae en la semana siguiente y el
//     deload se mueve un día antes de tiempo (el proyecto ya pagó `tz_date_migration_v2`).
//   · **Migración perdida.** `deloadAnchorWeek` (número de semana de app) → `deloadAnchorDate`
//     (lunes ISO). Si la conversión falla, el ancla se resetea a hoy y el deload salta de sitio
//     sin avisar (F-13: todo el calendario dependía de `settings.startDate`, editable en Ajustes).
//
// Ejecutar desde la raíz del repo: node tests/verify-block-week.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/coach-engine.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// Cargar el módulo puro como hace verify-nutrition-v2.mjs: `vm` sobre el fuente entero,
// aprovechando su bloque `module.exports`. Si hiciera falta un navegador, no habría test.
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(SRC).runInContext(sandbox);
const E = sandbox.module.exports;

if (!E || typeof E.blockWeekFromDates !== 'function' || typeof E.progressCardioMin !== 'function') {
  console.log('FAIL — coach-engine.js no exporta blockWeekFromDates/progressCardioMin');
  process.exit(1);
}

// ── 1. mondayOf: normalizar cualquier fecha a su LUNES ISO ──────────────────────────
console.log('1. mondayOf (lunes ISO, aritmética en UTC)');
eq(E.mondayOf('2026-09-07'), '2026-09-07', 'un lunes se queda donde está');
eq(E.mondayOf('2026-09-06'), '2026-08-31', 'domingo 6-sep → lunes 31-ago (NO el lunes siguiente)');
eq(E.mondayOf('2026-09-08'), '2026-09-07', 'martes → su propio lunes');
eq(E.mondayOf('2026-09-13'), '2026-09-07', 'domingo 13-sep → lunes 7-sep (fin de la misma semana)');
eq(E.mondayOf('2026-09-14'), '2026-09-14', 'el lunes siguiente ya es otra semana');
eq(E.mondayOf('2026-03-29'), '2026-03-23', 'cruce de horario de verano (29-mar) sin desplazarse');
eq(E.mondayOf('2026-10-25'), '2026-10-19', 'cruce de horario de invierno (25-oct) sin desplazarse');
eq(E.mondayOf('2026-09-07T23:30:00+02:00'), '2026-09-07', 'tolera un ISO completo');
eq(E.mondayOf(''), null, 'entrada vacía → null (no un lunes inventado)');

// ── 2. blockWeekFromDates: 4 build + 1 deload, anclado a fecha ──────────────────────
console.log('');
console.log('2. blockWeekFromDates (ancla 2026-07-20, bloque de 5)');
const A = '2026-07-20';                       // lunes
const bw = (d) => E.blockWeekFromDates(d, A, 5);

eq(bw('2026-07-20').index, 1, 'el propio lunes del ancla → semana 1');
eq(bw('2026-07-22').index, 1, 'miércoles de esa semana → sigue siendo 1');
eq(bw('2026-07-26').index, 1, 'domingo de esa semana → sigue siendo 1 (la semana no parte)');
eq(bw('2026-07-27').index, 2, 'el lunes siguiente → 2');
eq(bw('2026-08-03').index, 3, '+2 semanas → 3');
eq(bw('2026-08-10').index, 4, '+3 semanas → 4 (última de carga)');
eq(bw('2026-08-17').index, 5, '+4 semanas → 5');
yes(bw('2026-08-17').isDeload, 'la semana 5 ES deload');
eq(bw('2026-08-17').label, 'deload', 'y su etiqueta es "deload"');
eq(bw('2026-08-10').label, 'build', 'la semana 4 es "build"');
yes(!bw('2026-08-10').isDeload, 'la semana 4 NO es deload');
eq(bw('2026-08-24').index, 1, '+5 semanas → 1 otra vez (bloque nuevo)');
yes(!bw('2026-08-24').isDeload, 'y el bloque nuevo no arranca en deload');
eq(bw('2026-08-24').weeksIntoBlock, 5, 'weeksIntoBlock cuenta desde el ancla, no dentro del bloque');

// Un domingo pertenece a la semana de SU lunes, no a la siguiente.
eq(bw('2026-08-23').index, 5, 'domingo 23-ago → semana del lunes 17-ago → 5');
yes(bw('2026-08-23').isDeload, 'ese domingo sigue siendo deload');

// Antes del ancla no hay bloque: no se extrapola hacia atrás.
eq(bw('2026-07-13').index, null, 'una semana ANTES del ancla → index null');
yes(!bw('2026-07-13').isDeload, 'y no es deload');
eq(bw('2026-07-13').label, 'sin ancla', 'etiqueta "sin ancla"');
eq(E.blockWeekFromDates('2026-09-07', null, 5).index, null, 'sin ancla → index null');
eq(E.blockWeekFromDates('2026-09-07', undefined, 5).label, 'sin ancla', 'ancla undefined → "sin ancla"');

// Fechas del bloque, para que la UI pueda decir "del lunes X al domingo Y".
eq(bw('2026-08-03').blockStartMonday, '2026-07-20', 'blockStartMonday del primer bloque');
eq(bw('2026-08-03').deloadMonday, '2026-08-17', 'deloadMonday = blockStart + 4 semanas');
eq(bw('2026-08-31').blockStartMonday, '2026-08-24', 'segundo bloque arranca el 24-ago');
eq(bw('2026-08-31').deloadMonday, '2026-09-21', 'y su deload cae la semana del 21-sep');

// Un ancla que no sea lunes se normaliza (defensa: `settings` es editable).
eq(E.blockWeekFromDates('2026-08-03', '2026-07-22', 5).index, 3,
  'un ancla en miércoles se normaliza a su lunes (mismo resultado)');

// ── 3. progressCardioMin: +10 %/semana con techo, reset en deload ────────────────────
console.log('');
console.log('3. progressCardioMin (END-003 · +10 %/sem, techo ×1,35, deload ×0,7)');
const blk = (index) => ({ index, isDeload: index === 5, label: index === 5 ? 'deload' : 'build' });
const P = (base, index, opts) => E.progressCardioMin(base, blk(index), Object.assign({ variant: 6, lastCardioDaysAgo: 2 }, opts || {}));

// Carrera del miércoles: 40' base, paso de 5.
eq(P(40, 1).min, 40, "40' semana 1 → 40 (la semana 1 ES la base, no un +10 %)");
eq(P(40, 2).min, 45, "40' semana 2 → 45");
eq(P(40, 3).min, 50, "40' semana 3 → 50");
eq(P(40, 4).min, 55, "40' semana 4 → 55");
eq(P(40, 5).min, 30, "40' deload → 30 (×0,7, no ×1,1^4)");
eq(P(40, 2).source, 'rule', 'la fuente es "rule" (regla, no coach ni base)');

// Largo del sábado: 50' base.
eq(P(50, 1).min, 50, "50' semana 1 → 50");
eq(P(50, 2).min, 55, "50' semana 2 → 55");
eq(P(50, 3).min, 60, "50' semana 3 → 60");
eq(P(50, 4).min, 65, "50' semana 4 → 65");
eq(P(50, 5).min, 35, "50' deload → 35");

// Z2 finisher: 20' base → paso de 2 (redondear a 5 borraría la progresión entera).
eq(P(20, 1).min, 20, "finisher 20' semana 1 → 20");
eq(P(20, 2).min, 22, "finisher 20' semana 2 → 22 (paso 2, no 5)");
eq(P(20, 3).min, 24, "finisher 20' semana 3 → 24");
eq(P(20, 4).min, 26, "finisher 20' semana 4 → 26");
eq(P(20, 5).min, 14, "finisher 20' deload → 14");
eq(P(15, 4).min, 20, "finisher 15' semana 4 → 20 (1,1^3 = 19,97 → paso 2)");

// El techo. Con bloque de 5 no llega a morder (1,1^3 = 1,331 < 1,35), pero es el invariante
// que impide que un bloque más largo convierta 40' en 115'.
const capped = E.progressCardioMin(40, { index: 8, isDeload: false }, { variant: 6, lastCardioDaysAgo: 2 });
eq(capped.min, 55, "semana 8 hipotética → 55, no 86 (techo ×1,35 = 54 → paso 5)");
eq(P(40, 4).min, 55, "y la semana 4 real: min(53,24; 54) → 55");

// ── 4. Las cuatro puertas que devuelven la base ──────────────────────────────────────
console.log('');
console.log('4. Cuándo NO se progresa (repite base)');
const g = (opts) => E.progressCardioMin(40, blk(3), Object.assign({ variant: 6, lastCardioDaysAgo: 2 }, opts));
eq(g({ variant: 0 }).min, 40, 'variante 0 (viaje) → base, no 50');
eq(g({ variant: 0 }).source, 'base', 'y la fuente es "base"');
yes(/base/.test(g({ variant: 0 }).note || ''), 'con nota que lo explica');
eq(E.progressCardioMin(40, { index: null, isDeload: false, label: 'sin ancla' }, { variant: 6, lastCardioDaysAgo: 2 }).min, 40,
  'sin ancla de bloque (index null) → base');
eq(g({ lastCardioDaysAgo: 15 }).min, 40, '15 días sin cardio → base (no se progresa tras una pausa)');
eq(g({ lastCardioDaysAgo: 15 }).source, 'base', 'fuente "base" tras la pausa');
yes(/15/.test(g({ lastCardioDaysAgo: 15 }).note || ''), 'la nota dice cuántos días');
eq(g({ lastCardioDaysAgo: 14 }).min, 50, '14 días justos todavía progresa (el corte es > 14)');
eq(g({ lastCardioDaysAgo: null }).min, 40, 'sin historial de cardio → base (no se inventa dato)');
eq(g({ lastCardioDaysAgo: null }).source, 'base', 'y la fuente es "base"');
eq(E.progressCardioMin(null, blk(3), { variant: 6, lastCardioDaysAgo: 2 }).min, null,
  'sin duración base → null (el día no tiene prescripción de minutos)');
eq(E.progressCardioMin(0, blk(3), { variant: 6, lastCardioDaysAgo: 2 }).min, null, 'base 0 → null');

// ── 5. Prioridad coach > regla > base ────────────────────────────────────────────────
console.log('');
console.log('5. Prioridad explícita (plan §Principios 3)');
const c = E.progressCardioMin(40, blk(3), { variant: 6, lastCardioDaysAgo: 2, coachMin: 45 });
eq(c.min, 45, 'coachMin 45 manda sobre la regla (que diría 50)');
eq(c.source, 'coach', 'y la fuente es "coach"');
eq(E.progressCardioMin(40, blk(5), { variant: 0, lastCardioDaysAgo: 40, coachMin: 45 }).min, 45,
  'el coach manda incluso en deload, viaje y tras una pausa (él ya lo sabe)');
eq(E.progressCardioMin(40, blk(3), { variant: 6, lastCardioDaysAgo: 2, coachMin: null }).min, 50,
  'coachMin null NO cuenta como objetivo del coach');

// ── 6. La intensidad nunca progresa (END-002) ────────────────────────────────────────
// Invariante de forma, no de valor: la función sólo devuelve minutos. Si algún día
// devolviera zona, ritmo o FC, la base aeróbica dejaría de ser base aeróbica.
console.log('');
console.log('6. Sólo volumen (END-002: la intensidad no es una perilla de progresión)');
const keys = Object.keys(P(40, 3)).sort().join(',');
eq(keys, 'min,note,source', 'el retorno es {min, note, source} — ni zona, ni FC, ni ritmo');

// ── 7. Migración del ancla: número de semana de app → lunes ISO ──────────────────────
console.log('');
console.log('7. anchorDateFromWeek (migración de deloadAnchorWeek → deloadAnchorDate)');
yes(typeof E.anchorDateFromWeek === 'function', 'anchorDateFromWeek existe (helper puro y testeable)');
eq(E.anchorDateFromWeek('2026-04-06', 19), '2026-08-10',
  'startDate lunes 6-abr + semana 19 → lunes 10-ago (18 × 7 días)');
eq(E.anchorDateFromWeek('2026-04-06', 1), '2026-04-06', 'semana 1 → el propio startDate');
eq(E.anchorDateFromWeek('2026-04-08', 19), '2026-08-10',
  'un startDate en MIÉRCOLES se normaliza al lunes ISO de esa semana (elección documentada)');
eq(E.anchorDateFromWeek(null, 19), null, 'sin startDate no hay migración posible → null');
eq(E.anchorDateFromWeek('2026-04-06', null), null, 'sin semana ancla → null');
eq(E.anchorDateFromWeek('2026-04-06', 0), null, 'semana 0 no existe (la numeración arranca en 1)');

// El resultado de la migración tiene que ser coherente con el ancla vieja: la semana de app
// 19 y la semana ISO del 10-ago describen el mismo deload.
eq(E.blockWeekFromDates('2026-08-10', E.anchorDateFromWeek('2026-04-06', 19), 5).index, 1,
  'tras migrar, la semana del ancla sigue siendo la 1 del bloque');
eq(E.blockWeekFromDates('2026-09-07', E.anchorDateFromWeek('2026-04-06', 19), 5).index, 5,
  'y el 7-sep-2026 (4 semanas después) es deload — el mismo que daba la aritmética vieja');

console.log('');
console.log(failed === 0
  ? '✅ Semana del bloque y progresión de cardio: 4 build + 1 deload, con techo y sin inventar datos.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
