// Verifica la corrección del registro del 2026-08-20 (migración `fix-aug20-mislabeled`).
//
// El fixture es el registro REAL, copiado del backup JSON que exportó Julian el 2026-08-21. No es
// inventado: si la migración lo transforma bien aquí, lo hará bien en el teléfono.
//
// El contexto: entrenó siguiendo la rutina de un amigo, metió los pesos en los huecos de Upper A y
// escribió el ejercicio real en la nota de cada ejercicio. Los pesos son buenos, las etiquetas no.
//
// Ejecutar desde la raíz del repo: node tests/verify-aug20-fix.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// --- Extrae la función pura de app.js sin ejecutar la app entera ---
const SRC = readFileSync('app/app.js', 'utf8');
const START = 'function fixAug20Mislabeled(w) {';
const END = '\n// One-time data migrations';
const i = SRC.indexOf(START), j = SRC.indexOf(END, i);
if (i < 0 || j < 0) { console.log('FAIL — no se encontró fixAug20Mislabeled en app/app.js'); process.exit(1); }
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(SRC.slice(i, j) + '\nglobalThis.fixAug20Mislabeled = fixAug20Mislabeled;', ctx);
const fix = ctx.fixAug20Mislabeled;

// --- El registro real, tal cual salió del backup ---
const s = (weight, reps, rpe, done = true) => ({ rpe, done, reps, weight });
const ORIGINAL = {
  id: 'mt1mjjrhqlx740', date: '2026-08-20', unit: 'kg', week: 20,
  notes: '', quick: false, quality: 3, session: 'upperA', duration: '45:33',
  startTime: '15:51', planVersion: 16, sessionName: 'Upper A',
  exercises: [
    { note: '', compound: true, exerciseId: 'bench-press',
      sets: [s(95, 8, 7), s(95, 8, 7), s(95, 9, 7), s(95, 8, 7.5)] },
    { note: 'Combine con press de hombro con barra (40kg) 4x10', exerciseId: 'cable-row',
      sets: [s(60, 10, 6), s(60, 10, 6), s(60, 10, 6.5), s(60, 12, 6.5)] },
    { db: true, note: 'Es apertura inclinadas con mancuerna en realidad', exerciseId: 'incline-db-press',
      sets: [s(10, 12, 6), s(10, 12, 6), s(10, 12, 6)] },
    { note: 'Cable lat pulldown', exerciseId: 'lat-pulldown',
      sets: [s(25, 12, 6.5), s(28.75, 12, 6.5), s(28.75, 12, 6.5)] },
    { note: 'Change for inclined press (60kg) 3x10', exerciseId: 'face-pull',
      sets: [s(60, 10, 6.5), s(60, 10, 6.5), s(60, 10, 6.5)] },
    { db: true, note: 'Lateral raise and frontal raise continued (8+8)', exerciseId: 'lateral-raise',
      sets: [s(8, 16, 7), s(8, 16, 7), s(8, 16, 7)] },
    { note: '', exerciseId: 'tricep-pushdown',
      sets: [s(0, 0, null, false), s(0, 0, null, false)] },
  ],
};

let fail = 0;
const ok = (cond, msg) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fail++; };
const sec = (t) => console.log(`\n=== ${t} ===`);

const snapshot = JSON.stringify(ORIGINAL);
const out = fix(ORIGINAL);
const byId = (id) => out.exercises.filter(e => e.exerciseId === id);
const one = (id) => byId(id)[0];

sec('1. No muta la entrada');
ok(JSON.stringify(ORIGINAL) === snapshot, 'el registro original queda intacto');
ok(out !== ORIGINAL, 'devuelve un objeto nuevo');

sec('2. Lo que el usuario pidió: fuera el dato incorrecto');
ok(byId('face-pull').length === 0, 'NO queda ninguna entrada de face-pull en el registro');
ok(byId('lat-pulldown').length === 0, 'NO queda ninguna entrada de lat-pulldown');
ok(byId('incline-db-press').length === 0, 'NO queda ninguna entrada de incline-db-press');

sec('3. Reasignaciones');
ok(!!one('incline-press'), 'aparece incline-press (era el hueco face-pull)');
ok(!!one('incline-db-fly'), 'aparece incline-db-fly (eran aperturas)');
ok(!!one('straight-arm-pulldown'), 'aparece straight-arm-pulldown (pullover en polea)');
ok(!!one('front-raise'), 'aparece front-raise (la mitad frontal del encadenado)');
ok(!!one('ohp'), 'aparece ohp (la superserie que sólo estaba en la nota)');

sec('4. Los pesos y repeticiones sobreviven intactos');
const ip = one('incline-press');
ok(ip.sets.length === 3 && ip.sets.every(x => x.weight === 60 && x.reps === 10 && x.rpe === 6.5),
  'press inclinado: 3 × 10 @ 60 kg, RPE 6,5 — los números originales');
const fly = one('incline-db-fly');
ok(fly.sets.length === 3 && fly.sets.every(x => x.weight === 10 && x.reps === 12),
  'aperturas: 3 × 12 @ 10 kg');
ok(fly.db === true, 'aperturas mantienen la marca de mancuerna (factor ×2 del volumen)');
const sap = one('straight-arm-pulldown');
ok(sap.sets.map(x => x.weight).join(',') === '25,28.75,28.75', 'pullover: 25 / 28,75 / 28,75 kg');
const bench = one('bench-press');
ok(bench.sets.map(x => `${x.weight}x${x.reps}`).join(' ') === '95x8 95x8 95x9 95x8',
  'el banco NO se toca: 95×8, 95×8, 95×9, 95×8');
const row = one('cable-row');
ok(row.sets.map(x => x.reps).join(',') === '10,10,10,12', 'el remo NO se toca: 10,10,10,12 @ 60 kg');

sec('5. El encadenado lateral+frontal se parte en dos de 8');
const lat = one('lateral-raise');
ok(lat.sets.every(x => x.reps === 8) && lat.sets.length === 3, 'laterales: 3 × 8 (ya no 16)');
ok(one('front-raise').sets.every(x => x.reps === 8 && x.weight === 8), 'frontales: 3 × 8 @ 8 kg');
ok(lat.db === true && one('front-raise').db === true, 'las dos con marca de mancuerna');

sec('6. El press de hombro de la nota, sin inventar nada');
const ohp = one('ohp');
ok(ohp.sets.length === 4 && ohp.sets.every(x => x.weight === 40 && x.reps === 10),
  '4 × 10 @ 40 kg — literalmente lo que decía la nota');
ok(ohp.sets.every(x => x.rpe === null), 'RPE null: ese dato NO se registró y no se inventa');
ok(ohp.sets.every(x => x.done === true), 'marcadas como hechas');

sec('7. Trazabilidad: se ve de dónde vino cada reasignación');
ok(/face-pull/.test(ip.note), 'el press inclinado dice que venía del hueco face-pull');
ok(/lat-pulldown/.test(sap.note), 'el pullover dice que venía del hueco lat-pulldown');
ok(/incline-db-press/.test(fly.note), 'las aperturas dicen de qué hueco vinieron');

sec('8. El resto del registro no cambia');
for (const k of ['id', 'date', 'unit', 'week', 'quality', 'session', 'duration', 'startTime', 'planVersion']) {
  ok(out[k] === ORIGINAL[k], `${k} intacto (${out[k]})`);
}
ok(one('tricep-pushdown').sets.every(x => x.done === false),
  'el tríceps sigue sin hacer — no se rellena lo que no ocurrió');
ok(out.exercises.length === 9, `9 ejercicios tras la corrección (eran 7) — fueron ${out.exercises.length}`);

sec('9. Idempotencia');
const twice = fix(out);
ok(twice === out, 'aplicarla dos veces devuelve la MISMA referencia (no duplica el ohp)');
ok(fix(twice).exercises.filter(e => e.exerciseId === 'ohp').length === 1, 'sigue habiendo un solo ohp');

sec('10. El efecto medible: volumen por músculo');
// Mapa mínimo de músculo, igual al que resuelve la app.
const MUSCLE = {
  'bench-press': 'Chest', 'incline-press': 'Chest', 'incline-db-fly': 'Chest',
  'cable-row': 'Back', 'straight-arm-pulldown': 'Back', 'lat-pulldown': 'Back',
  'ohp': 'Shoulders', 'lateral-raise': 'Shoulders', 'front-raise': 'Shoulders',
  'face-pull': 'Rear Delt', 'incline-db-press': 'Chest', 'tricep-pushdown': 'Triceps',
};
const setsByMuscle = (rec) => rec.exercises.reduce((acc, e) => {
  const m = MUSCLE[e.exerciseId] || 'Other';
  acc[m] = (acc[m] || 0) + e.sets.filter(x => x.done).length;
  return acc;
}, {});
const before = setsByMuscle(ORIGINAL), after = setsByMuscle(out);
console.log(`     antes:   ${JSON.stringify(before)}`);
console.log(`     después: ${JSON.stringify(after)}`);
ok(before['Rear Delt'] === 3 && !after['Rear Delt'],
  'deltoides posterior 3 → 0 series: es lo real, el face pull no se hizo');
ok(after['Chest'] === 10, `pecho = 10 series (banco 4 + inclinado 3 + aperturas 3) — fue ${after['Chest']}`);
ok(after['Shoulders'] === 10, `hombro = 10 series (press 4 + lat 3 + frontal 3) — fue ${after['Shoulders']}`);
ok(after['Back'] === 7, `espalda = 7 series (remo 4 + pullover 3) — fue ${after['Back']}`);

console.log(fail === 0
  ? '\nPASS — la corrección del 20-ago es fiel al registro real\n'
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
