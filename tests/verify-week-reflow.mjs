// ════════════════════════════════════════════════════════════════════════════════════
// verify-week-reflow.mjs — la semana se recoloca cuando te sales del guion
// ════════════════════════════════════════════════════════════════════════════════════
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR, en las palabras de Julian (2026-09-12):
//
//   "Si por ejemplo el lunes en vez de hacer Lower A hago Upper A, no puede ser que el martes me
//    vuelva a decir Upper A. Tiene que adaptarse el plan."
//
// Antes de v11.75 no había NADA que reconciliase: `showSessionPicker` escribía una sola clave
// `weekSchedule[fecha]` antes de empezar la sesión, `finishWorkout` no tocaba el calendario, y la
// plantilla seguía diciendo lo mismo el resto de la semana. La semana acababa con dos días de
// tren superior, ninguno de pierna, y la app sin enterarse.
//
// Lo que este test protege, por orden de gravedad:
//   1. Que lo YA HECHO salga del conjunto: si hiciste Upper A, nadie vuelve a pedirte Upper A.
//   2. Que el PASADO no se toque nunca. Reescribir el plan de ayer para que cuadre con lo que
//      hiciste es la forma más limpia de que la adherencia mienta.
//   3. Que NO se inventen días. Si no caben, se dicen las que se quedan fuera: añadir un quinto
//      día de fuerza porque el usuario se desordenó es subir el volumen por la puerta de atrás,
//      justo lo que CLAUDE.md prohíbe en déficit.
//   4. Que no se encadenen dos días de pierna cuando hay alternativa.

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failed = 0;
const ok = (msg) => console.log(`  ok   ${msg}`);
const bad = (msg) => { failed++; console.log(`  FAIL ${msg}`); };
const yes = (cond, msg) => (cond ? ok(msg) : bad(msg));
const eq = (a, b, msg) => (JSON.stringify(a) === JSON.stringify(b)
  ? ok(msg)
  : bad(`${msg} — esperaba ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)}`));
const sec = (t) => { console.log(''); console.log(t); };

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const ctx = { module: { exports: {} }, console };
ctx.exports = ctx.module.exports;
vm.createContext(ctx);
vm.runInContext(ENGINE, ctx);
const { reflowWeek } = ctx.module.exports;

console.log('verify-week-reflow');
yes(typeof reflowWeek === 'function', 'coach-engine exporta reflowWeek()');
if (typeof reflowWeek !== 'function') process.exit(1);

// ── El escenario: la semana viva de 6 días ───────────────────────────────────────────
// Lun lowerA · Mar upperA · Mié cardio · Jue lowerB · Vie upperB · Sáb cardio · Dom recovery
const TPL = {
  1: { type: 'gym', session: 'lowerA' },
  2: { type: 'gym', session: 'upperA' },
  3: { type: 'run', subtype: 'zone2', durationMin: 40 },
  4: { type: 'gym', session: 'lowerB' },
  5: { type: 'gym', session: 'upperB' },
  6: { type: 'run', subtype: 'long_easy', durationMin: 50 },
  0: { type: 'recovery', subtype: 'mobility' },
};
const CLASES = {
  lowerA: { family: 'strength', subtype: 'lower' },
  lowerB: { family: 'strength', subtype: 'lower' },
  upperA: { family: 'strength', subtype: 'upper' },
  upperB: { family: 'strength', subtype: 'upper' },
  fullA: { family: 'strength', subtype: 'full' },
};
// Lunes 2026-09-07 … domingo 2026-09-13
const DIAS = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
const run = (extra) => reflowWeek(Object.assign({
  template: TPL, weekDates: DIAS, classMap: CLASES, overrides: {}, doneByDate: {},
}, extra));

// ════════════════════════════════════════════════════════════════════════════════════
sec('1 · El caso de Julian: el lunes hace Upper A en vez de Lower A');
// ════════════════════════════════════════════════════════════════════════════════════
{
  const r = run({ doneByDate: { '2026-09-07': 'upperA' }, todayStr: '2026-09-08' });
  eq(r.changes['2026-09-08'], 'lowerA', 'el martes deja de pedir Upper A y pide Lower A');
  yes(!Object.prototype.hasOwnProperty.call(r.changes, '2026-09-07'),
    'y el lunes, que ya pasó y además está hecho, no se toca');
  eq(r.pending, [], 'las cuatro sesiones caben en los cuatro huecos: nada se queda fuera');
  const sesiones = Object.values(r.changes).filter(Boolean);
  eq(new Set(sesiones).size, sesiones.length, 'ninguna sesión se programa dos veces');
  yes(!sesiones.includes('upperA'), 'y Upper A, que ya está hecha, no vuelve a aparecer en la semana');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('2 · El pasado es intocable');
// ════════════════════════════════════════════════════════════════════════════════════
{
  // Jueves, con el lunes y el martes hechos al revés y el miércoles en blanco.
  const r = run({
    doneByDate: { '2026-09-07': 'upperA', '2026-09-08': 'upperB' },
    todayStr: '2026-09-10',
  });
  for (const ds of ['2026-09-07', '2026-09-08', '2026-09-09']) {
    yes(!Object.prototype.hasOwnProperty.call(r.changes, ds), `${ds} (pasado) no recibe ningún cambio`);
  }
  const futuros = Object.keys(r.changes);
  yes(futuros.every((ds) => ds >= '2026-09-10'), 'todos los cambios son de hoy en adelante');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('3 · No se inventan días: lo que no cabe se dice');
// ════════════════════════════════════════════════════════════════════════════════════
{
  // Viernes y sólo queda un hueco de gimnasio (el del propio viernes), con dos sesiones sin hacer.
  const r = run({ doneByDate: { '2026-09-07': 'lowerA', '2026-09-08': 'upperA' }, todayStr: '2026-09-11' });
  const huecos = Object.keys(r.changes).filter((k) => r.changes[k]);
  eq(huecos.length, 1, 'sólo se programa el hueco que existe');
  eq(r.pending.length, 1, 'y la sesión que no cabe se devuelve como pendiente, no se cuela en un día de cardio');
  yes(!Object.keys(r.changes).some((ds) => {
    const jsDay = new Date(ds + 'T12:00:00').getDay();
    return TPL[jsDay] && TPL[jsDay].type !== 'gym' && r.changes[ds];
  }), 'ningún día de cardio o descanso se convierte en día de fuerza');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('4 · Dos días de pierna seguidos se evitan cuando hay alternativa');
// ════════════════════════════════════════════════════════════════════════════════════
{
  // Miércoles: el lunes se hizo upperA y el martes upperB. Quedan lowerA y lowerB para
  // jueves y viernes: no hay alternativa, así que van seguidas y eso es correcto.
  const r1 = run({ doneByDate: { '2026-09-07': 'upperA', '2026-09-08': 'upperB' }, todayStr: '2026-09-09' });
  eq([r1.changes['2026-09-10'], r1.changes['2026-09-11']].filter(Boolean).length, 2,
    'sin alternativa, las dos de pierna se programan igual (el plan manda sobre la preferencia)');

  // Y cuando el reparto natural SÍ encadenaría dos piernas, se busca alternativa. Lunes hecho
  // como Upper A; quedan lowerA, lowerB y upperB para martes, jueves y viernes. El martes coge
  // lowerA; el jueves debería coger upperB (no lowerB) para no encadenar dos días de pierna.
  const r2 = run({ doneByDate: { '2026-09-07': 'upperA' }, todayStr: '2026-09-08' });
  eq(r2.changes['2026-09-08'], 'lowerA', 'el martes coge Lower A (la que se saltó el lunes)');
  eq(r2.changes['2026-09-10'], 'upperB', 'el jueves NO coge la otra de pierna: mete Upper B en medio');
  eq(r2.changes['2026-09-11'], 'lowerB', 'y Lower B se va al viernes, separada de Lower A');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('5 · Sin desviación no hay cambios (el reflow no toca lo que ya está bien)');
// ════════════════════════════════════════════════════════════════════════════════════
{
  const r = run({ doneByDate: { '2026-09-07': 'lowerA' }, todayStr: '2026-09-08' });
  eq(Object.keys(r.changes).filter((k) => r.changes[k] !== null), [],
    'el lunes hizo lo que tocaba: la plantilla ya dice lo correcto y no se escribe ni un override');
  eq(r.moved, [], 'y no se anuncia ningún movimiento');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('6 · Entradas imposibles no revientan');
// ════════════════════════════════════════════════════════════════════════════════════
{
  eq(reflowWeek(null), { changes: {}, pending: [], moved: [] }, 'sin argumentos devuelve vacío');
  eq(reflowWeek({}), { changes: {}, pending: [], moved: [] }, 'sin plantilla ni días, vacío');
  eq(reflowWeek({ template: {}, weekDates: DIAS, todayStr: '2026-09-09' }),
    { changes: {}, pending: [], moved: [] }, 'una plantilla sin días de gimnasio no programa nada');
  const basura = reflowWeek({
    template: { 1: null, 2: { type: 'gym' } }, weekDates: DIAS, todayStr: '2026-09-09',
    doneByDate: { x: null }, classMap: null, overrides: null,
  });
  yes(basura && typeof basura.changes === 'object', 'slots sin sesión y mapas nulos se ignoran en silencio');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('7 · Pura: sin DOM, sin IDB, sin reloj');
// ════════════════════════════════════════════════════════════════════════════════════
{
  const i = ENGINE.indexOf('function reflowWeek(o) {');
  const cuerpo = ENGINE.slice(i, ENGINE.indexOf('\n}', i));
  for (const prohibido of ['document', 'dbGet', 'smartPut', 'Date.now', 'today(']) {
    yes(!cuerpo.includes(prohibido), `reflowWeek no usa ${prohibido}`);
  }
  yes(/o\.todayStr/.test(cuerpo), 'hoy entra como argumento, no se lee del reloj');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('8 · Cableado: quién la llama y dónde escribe');
// ════════════════════════════════════════════════════════════════════════════════════
{
  yes(/async function applyWeekReflow\(/.test(APP), 'app.js tiene applyWeekReflow(), el que habla con IDB');
  const i = APP.indexOf('async function applyWeekReflow(');
  const cuerpo = APP.slice(i, APP.indexOf('\n}', i));
  yes(/reflowWeek\(/.test(cuerpo), 'y delega el reparto en la función pura');
  yes(/saveWeekSchedule\(/.test(cuerpo), 'escribe por `saveWeekSchedule` (la misma clave que lee getPlannedSession)');
  const after = APP.slice(APP.indexOf('async function afterWorkoutSaved()'), APP.indexOf('\n}', APP.indexOf('async function afterWorkoutSaved()')));
  yes(/applyWeekReflow\(/.test(after), 'y se dispara al guardar un entreno, que es cuando se sabe lo que pasó');
}

console.log('');
console.log(failed === 0
  ? '✅ La semana se recoloca sola: lo hecho sale del conjunto, el pasado no se toca y no se inventan días.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
