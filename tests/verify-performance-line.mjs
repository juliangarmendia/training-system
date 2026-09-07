// `performanceLine()`: la segunda línea de la tarjeta de recuperación de Home — RENDIMIENTO.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. La decisión de Julian del 2026-09-07 es que la
// app no toque el entrenamiento del día por lo que diga el wearable, y que la recuperación se
// mire "sobre todo en los entrenamientos". Si la única línea que queda en Home fuese la de
// WHOOP/HRV, la app habría cambiado de opinión sólo a medias: seguiría contando la semana en
// porcentajes de recuperación. Esta función es la mitad que hace que el principio se cumpla —
// **rendimiento primero**— y tiene tres formas conocidas de romperse en silencio:
//
//   1. **Se pinta un kg sin decir si subió, se mantuvo o cayó.** "banca 95×8" a secas no es
//      información: el número solo no dice nada sin la flecha, que es lo que sale del `outcome`
//      que ya calculó `sessionReadout`. Recalcularlo aquí crearía un SEGUNDO criterio de
//      progresión que se desincronizaría del de la tarjeta post-sesión.
//   2. **Una carrera fuera de Z2 se etiqueta como Z2.** Las cuatro carreras reales de agosto
//      iban a 147-155 bpm sobre un techo de 143: llamarlas "Z2" en Home es exactamente la
//      falsa precisión que el sistema tiene prohibida. Por encima del techo se dice "carrera",
//      con su pulso al lado, y ya.
//   3. **Devuelve una línea vacía con adornos** ("Rendimiento: ·" / "Rendimiento: —") cuando no
//      hay ni sesiones ni carreras. Un contenedor con puntuación y sin datos es ruido: sin
//      datos la función devuelve '' y Home no pinta nada.
//
// Ejecutar desde la raíz del repo: node tests/verify-performance-line.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');

const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
const E = sandbox.module.exports;

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m}\n       esperaba: ${JSON.stringify(want)}\n       obtuve  : ${JSON.stringify(got)}`));

if (typeof E.performanceLine !== 'function') {
  console.log('FAIL — coach-engine.js no exporta performanceLine()');
  process.exit(1);
}

// ── Fixture ────────────────────────────────────────────────────────────────────────────
// Dos sesiones con la lectura que escribe `sessionReadout` (`workout.readout`) y una carrera.
// La banca subió (95 era el objetivo y se hizo), la sentadilla se mantuvo.
const wk = (date, items) => ({ date, unit: 'kg', readout: { items, summary: {}, line: '' } });
const item = (exerciseId, name, topKg, reps, outcome, targetKg) => ({
  exerciseId, name,
  target: targetKg != null ? { kg: targetKg, reps: '5-8', source: 'rule' } : null,
  done: { topKg, reps, avgRpe: 8 },
  outcome,
  measureUnit: null,
  next: null,
});

const WORKOUTS = [
  wk('2026-09-05', [
    item('bench-press', 'Barbell Bench Press', 95, [8, 8, 7], 'progressed', 95),
    item('lat-raise', 'Lateral Raise', 12, [12, 12], 'held', 12),
  ]),
  wk('2026-09-03', [
    item('back-squat', 'Barbell Back Squat', 105, [8, 7, 7], 'held', 105),
  ]),
];
const RUNS = [{ date: '2026-09-06', distance: 5.1, duration: 32, avgHR: 141 }];

// ── 1. La línea exacta ─────────────────────────────────────────────────────────────────
console.log('1. Dos sesiones con lectura + una carrera en Z2');
eq(E.performanceLine(WORKOUTS, RUNS, { z2Ceiling: 143 }),
  'Rendimiento: banca 95×8 ↑ · sentadilla 105×8 → · Z2 5,1 km @141',
  'la línea completa, con nombres cortos en castellano y coma decimal');

// Sólo las anclas: el elevador lateral de la misma sesión NO entra.
yes(!E.performanceLine(WORKOUTS, RUNS, { z2Ceiling: 143 }).includes('Lateral'),
  'los accesorios no entran (sólo goals.preserve.anchorLifts)');

// Y el orden es el del calendario: lo más reciente primero.
const linea = E.performanceLine(WORKOUTS, RUNS, { z2Ceiling: 143 });
yes(linea.indexOf('banca') < linea.indexOf('sentadilla'),
  'la sesión más reciente va primero (banca 5-sep antes que sentadilla 3-sep)');

// ── 2. Una carrera por encima del techo de Z2 NO es Z2 ─────────────────────────────────
console.log('');
console.log('2. Carrera a 151 bpm con el techo en 145');
eq(E.performanceLine([], [{ date: '2026-09-06', distance: 5.1, avgHR: 151 }], { z2Ceiling: 145 }),
  'Rendimiento: carrera 5,1 km @151',
  'por encima del techo se llama "carrera", nunca "Z2"');
eq(E.performanceLine([], [{ date: '2026-09-06', distance: 5.1, avgHR: 145 }], { z2Ceiling: 145 }),
  'Rendimiento: Z2 5,1 km @145',
  'justo en el techo sí cuenta como Z2');
eq(E.performanceLine([], [{ date: '2026-09-06', distance: 5.1, avgHR: null }], { z2Ceiling: 145 }),
  'Rendimiento: carrera 5,1 km',
  'sin pulso no se afirma la zona ni se inventa un @');

// ── 3. Sin nada que decir, no se dice nada ─────────────────────────────────────────────
console.log('');
console.log('3. Sin lecturas y sin carreras');
eq(E.performanceLine([], [], { z2Ceiling: 143 }), '', 'devuelve la cadena vacía');
eq(E.performanceLine(null, null, {}), '', 'y con null tampoco explota');
eq(E.performanceLine([wk('2026-09-05', [])], [], {}), '',
  'una sesión sin items tampoco produce línea');

// ── 4. Las cuatro flechas salen del `outcome` de sessionReadout ────────────────────────
console.log('');
console.log('4. Flechas ↑ → ↓ ○');
const flecha = (outcome) => E.performanceLine(
  [wk('2026-09-05', [item('bench-press', 'Barbell Bench Press', 95, [8], outcome, 95)])], [], {});
eq(flecha('progressed'), 'Rendimiento: banca 95×8 ↑', 'progressed → ↑');
eq(flecha('held'), 'Rendimiento: banca 95×8 →', 'held → →');
eq(flecha('regressed'), 'Rendimiento: banca 95×8 ↓', 'regressed → ↓');
eq(flecha('no-target'), 'Rendimiento: banca 95×8 ○', 'sin objetivo → ○ (no se juzga)');
// Un ejercicio saltado no tiene número: se dice que se saltó, no se pinta un 0.
eq(E.performanceLine(
  [wk('2026-09-05', [{ exerciseId: 'bench-press', name: 'Barbell Bench Press', target: null,
    done: { topKg: null, reps: [], avgRpe: null }, outcome: 'skipped', measureUnit: null, next: null }])],
  [], {}),
  'Rendimiento: banca saltado ○', 'saltado → sin kg inventado');

// ── 5. Tope de 3 anclas ────────────────────────────────────────────────────────────────
console.log('');
console.log('5. Como mucho tres anclas');
const cuatro = [
  wk('2026-09-06', [item('bench-press', 'Bench', 95, [8], 'progressed', 95)]),
  wk('2026-09-05', [item('back-squat', 'Squat', 105, [8], 'held', 105)]),
  wk('2026-09-04', [item('sumo-dl', 'Sumo', 120, [5], 'progressed', 120)]),
  wk('2026-09-03', [item('ohp', 'OHP', 50, [6], 'held', 50)]),
];
const l5 = E.performanceLine(cuatro, [], {});
eq((l5.match(/·/g) || []).length, 2, 'tres anclas = dos separadores');
yes(!l5.includes('press militar'), 'la cuarta (la más antigua) se queda fuera');
// Y una misma ancla no se repite: manda la lectura MÁS RECIENTE.
const repetida = [
  wk('2026-09-06', [item('bench-press', 'Bench', 97.5, [6], 'progressed', 97.5)]),
  wk('2026-09-02', [item('bench-press', 'Bench', 95, [8], 'held', 95)]),
];
eq(E.performanceLine(repetida, [], {}), 'Rendimiento: banca 97,5×6 ↑',
  'una sola fila por ancla, la más reciente, con coma decimal');

// ── 6. Sin `readout` se calcula desde las series (registros anteriores a v11.57) ───────
console.log('');
console.log('6. Registro viejo, sin workout.readout');
const viejo = [{
  date: '2026-09-05', unit: 'kg',
  exercises: [{
    exerciseId: 'bench-press',
    target: { kg: 95, reps: '5-8' },
    sets: [{ weight: 95, reps: 8, rpe: 8, done: true }, { weight: 95, reps: 7, rpe: 9, done: true },
           { weight: 95, reps: 0, rpe: null, done: false }],
  }],
}];
eq(E.performanceLine(viejo, [], {}), 'Rendimiento: banca 95×8 ↑',
  'se reconstruye desde las series hechas y el objetivo sellado');
// Los registros en libras (pre-España) se convierten: 205 lb ≈ 93 kg, no 205.
const enLb = [{
  date: '2026-09-05', unit: 'lb',
  exercises: [{ exerciseId: 'bench-press', target: null,
    sets: [{ weight: 205, reps: 5, rpe: 8, done: true }] }],
}];
yes(/93/.test(E.performanceLine(enLb, [], {})), '205 lb se pintan como ~93 kg, no como 205');

// ── 7. Las anclas por defecto son las de COACH_GOALS_DEFAULT ──────────────────────────
console.log('');
console.log('7. Anclas por defecto y override');
yes(Array.isArray(E.COACH_GOALS_DEFAULT.preserve.anchorLifts)
  && E.COACH_GOALS_DEFAULT.preserve.anchorLifts.includes('bench-press'),
  'COACH_GOALS_DEFAULT.preserve.anchorLifts sigue siendo la fuente');
eq(E.performanceLine(WORKOUTS, [], { anchorIds: ['lat-raise'] }),
  'Rendimiento: Lateral Raise 12×12 →',
  'con anchorIds propios manda la lista dada, y sin nombre corto se usa el del registro');

console.log('');
console.log(failed === 0
  ? '✅ performanceLine: kg y flecha por ancla, la carrera con su zona honesta, y vacío cuando no hay dato.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
