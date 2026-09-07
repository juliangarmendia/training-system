// El readiness único: tendencias de 7 días, ≥2 señales concordantes y cero scores compuestos.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (audit 2026-09-05, F-5 y F-6). Cuatro fallos, todos
// confirmados en el código de v11.58 y todos de la misma familia — falsa precisión:
//
//   1. UNA NOCHE MALA SOLA DABA ROJO. `computeTrainingAdvisory` leía el color de WHOOP de un día
//      y con eso mandaba una pierna pesada a "Recuperar". READ-002 pide ≥2 señales CONCORDANTES;
//      el "multi-señal" del v1 eran dos flags, uno de los cuales era la misma señal repetida
//      ("rojo + sesión exigente") y el otro inalcanzable (familia híbrida, que el clasificador no
//      producía). Un input, tres nombres.
//   2. EL WHOOP DE AYER CONTABA COMO HOY. `recovery[recovery.length - 1]` sin comparar fechas: a
//      las 7:00, cuando intervals.icu todavía tiene el de ayer, el entreno de hoy se decidía con
//      la noche de anteayer. Corregido en v11.58 para `getWhoopContext`; aquí se fija en el motor.
//   3. LA HRV DE UN DÍA DECIDÍA. Ninguna de las tres lecturas comparaba con una base propia
//      (READ-004): o usaban el valor del día, o no la usaban.
//   4. UN SCORE COMPUESTO PRODUCÍA UNA DOSIS. `renderFatigueScore` hacía
//      `fatigue*0.55 + whoopFatigue + fatigue*0.15`, sumaba "días bajo proteína ×3" como fatiga
//      aguda y de ahí sacaba "Push hard today". Eso es READ-003 al revés.
//
// Además fija el requisito del usuario (§B.2.b): la mañana sin dato de hoy NO es un `unknown`
// inútil — las tendencias hasta ayer siguen valiendo y dan color con `confidence:'medium'`; y el
// check-in de 2 toques (READ-005) entra en el recuento de señales.
//
// Ejecutar desde la raíz del repo: node tests/verify-readiness-trend.mjs

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
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

if (typeof E.computeReadinessFrom !== 'function') {
  console.log('FAIL — coach-engine.js no exporta computeReadinessFrom()');
  process.exit(1);
}

// ── Fixture: 35 días sintéticos ────────────────────────────────────────────────────────
// HRV 71 ms, FC reposo 49 bpm, 7,2 h de sueño. Es la "base propia" contra la que se compara
// todo (READ-004): números constantes para que cualquier señal que dispare sea la que el caso
// introduce a propósito y no ruido del fixture.
const TODAY = '2026-09-07';
const HRV_BASE = 71;
const RHR_BASE = 49;
const SLEEP_BASE = Math.round(7.2 * 3600);

const dayBefore = (ds, n) => {
  const [y, m, d] = ds.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) - n * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

/**
 * `days` filas de wellness terminando HOY. `over` sobreescribe por antigüedad en días
 * (0 = hoy, 6 = hace 6 días): `{0: {hrv: 62}, ...}` o una función `(age) => patch`.
 */
const wellness = (days = 35, over = null) => {
  const rows = [];
  for (let age = 0; age < days; age++) {
    const base = { date: dayBefore(TODAY, age), hrv: HRV_BASE, restingHR: RHR_BASE, sleepSecs: SLEEP_BASE, readiness: 70 };
    const patch = typeof over === 'function' ? over(age) : (over && over[age]) || null;
    rows.push(patch ? Object.assign(base, patch) : base);
  }
  return rows;
};

// Una sesión de fuerza con `n` series con RPE `rpe` y calidad `q`.
const workout = (ageDays, rpe, q, n = 4) => ({
  date: dayBefore(TODAY, ageDays),
  quality: q,
  exercises: [{ exerciseId: 'bench-press', sets: Array.from({ length: n }, () => ({ done: true, rpe, weight: 90, reps: 6 })) }],
});

const run = (over) => E.computeReadinessFrom(Object.assign({
  today: TODAY, wellness: wellness(), whoopToday: null, workouts: [], cutoffs: { green: 67, yellow: 34 },
}, over));
const sig = (r, id) => r.signals.find(s => s.id === id) || null;
const firedIds = (r) => r.signals.filter(s => s.fired).map(s => s.id).join(',');

// ── 1. Todo normal + WHOOP verde de hoy → verde, alta confianza, cero señales ──────────
console.log('1. Todo en rango + WHOOP verde de HOY');
let r = run({ whoopToday: { score: 74, source: 'whoop-direct', fetchedAt: 1757222520000 } });
eq(r.color, 'green', 'color verde');
eq(r.fired, 0, 'cero señales disparadas');
eq(r.confidence, 'high', 'confianza alta (dato de hoy + 28 días de base)');
eq(r.deloadHint, false, 'sin deloadHint');
eq(sig(r, 'whoop').text, 'WHOOP hoy 74 % · verde', 'texto de la señal WHOOP');
eq(sig(r, 'hrv7v28').status, 'ok', 'la tendencia de HRV tiene datos suficientes');
eq(sig(r, 'hrv7v28').text, 'HRV 7d 71 ms vs 71 de base (+0 %)', 'y se lee con su valor y su base');
eq(sig(r, 'sleep7').text, 'Sueño 7d 7,2 h', 'el sueño con coma decimal');
// Anti-falsa-precisión: la salida NO puede traer un score del que derivar una dosis.
yes(!('score' in r) && !('fatigue' in r), 'la salida no lleva score ni fatigue (READ-003)');
yes(Array.isArray(r.ruleIds) && r.ruleIds.includes('READ-002') && r.ruleIds.includes('READ-004'),
  'declara las reglas que la gobiernan');

// ── 2. Sólo la HRV cae un 13 % → UNA señal → amarillo ─────────────────────────────────
console.log('');
console.log('2. Sólo HRV 7d −13 % (una señal sola nunca es rojo)');
r = run({
  wellness: wellness(35, (age) => (age <= 6 ? { hrv: 62 } : null)),
  whoopToday: { score: 74, source: 'whoop-direct' },
});
eq(r.color, 'yellow', 'color amarillo con una sola señal (READ-002)');
eq(r.fired, 1, 'una señal');
eq(firedIds(r), 'hrv7v28', 'y es la de HRV');
eq(sig(r, 'hrv7v28').text, 'HRV 7d 62 ms vs 71 de base (−13 %)', 'el texto del wireframe, literal');
eq(sig(r, 'hrv7v28').value, 62, 'value = media 7d');
eq(sig(r, 'hrv7v28').baseline, 71, 'baseline = base propia (días 7..34), no poblacional');
eq(r.deloadHint, false, 'una señal no propone deload');

// ── 3. HRV −13 % + FC reposo +6 → DOS señales concordantes → rojo ─────────────────────
console.log('');
console.log('3. HRV −13 % + FC reposo +6 (dos concordantes → rojo)');
r = run({
  wellness: wellness(35, (age) => (age <= 6 ? { hrv: 62, restingHR: 55 } : null)),
  whoopToday: { score: 74, source: 'whoop-direct' },
});
eq(r.color, 'red', 'color rojo');
eq(r.fired, 2, 'dos señales');
eq(firedIds(r), 'hrv7v28,rhr7v28', 'HRV y FC de reposo');
eq(sig(r, 'rhr7v28').text, 'FC reposo 7d 55 vs 49 (+6)', 'texto de la FC de reposo');
eq(r.deloadHint, false, 'dos señales NO proponen deload todavía (READ-008 pide sostenido)');

// ── 4. …y encima RPE ≥9 en las dos últimas → deloadHint ───────────────────────────────
console.log('');
console.log('4. + RPE 9,2 y 9,0 en las 2 últimas sesiones → deloadHint');
r = run({
  wellness: wellness(35, (age) => (age <= 6 ? { hrv: 62, restingHR: 55 } : null)),
  whoopToday: { score: 74, source: 'whoop-direct' },
  workouts: [workout(1, 9.2, 4), workout(3, 9.0, 4)],
});
eq(r.color, 'red', 'sigue rojo');
eq(r.deloadHint, true, 'deloadHint: RPE ≥9 dos veces (LOAD-004)');
yes(sig(r, 'rpe2').fired, 'la señal rpe2 dispara');
eq(sig(r, 'rpe2').text, 'RPE ≥9 en las 2 últimas sesiones', 'con su texto');
// Una sola sesión al límite no basta.
const soloUna = run({ workouts: [workout(1, 9.4, 4)] });
eq(sig(soloUna, 'rpe2').status, 'insufficient', 'con UNA sola sesión con RPE la señal es insuficiente');
eq(soloUna.deloadHint, false, 'y no propone deload');
// Series sueltas con RPE tampoco: hacen falta ≥3 por sesión.
const dosSeries = run({ workouts: [workout(1, 9.5, 4, 2), workout(3, 9.5, 4, 2)] });
eq(sig(dosSeries, 'rpe2').status, 'insufficient', 'dos series con RPE no son una sesión "al límite"');

// ── 5. WHOOP rojo de AYER y nada de hoy → insuficiente, color por tendencias ──────────
console.log('');
console.log('5. WHOOP rojo de AYER, sin dato de hoy (el fallo F-6)');
const MOTIVO = 'intervals.icu aún tiene el de ayer; WHOOP directo no conectado';
r = run({
  wellness: wellness(35, { 1: { readiness: 24 } }),   // el rojo de ayer está en el histórico
  whoopToday: null,
  whoopMissingReason: MOTIVO,
});
eq(sig(r, 'whoop').status, 'insufficient', "la señal WHOOP es 'insufficient' (el 24 de ayer no cuenta)");
eq(sig(r, 'whoop').reason, MOTIVO, 'y lleva el motivo real, no una frase genérica');
eq(sig(r, 'whoop').value, null, 'sin valor inventado');
eq(r.color, 'green', 'el color sale de las TENDENCIAS, que están en rango');
eq(r.confidence, 'medium', 'confianza media: hay base propia pero falta el dato de hoy');
eq(r.fired, 0, 'cero señales');

// ── 6. Instalación con 10 días de datos → confianza baja ──────────────────────────────
console.log('');
console.log('6. Sólo 10 días de historial');
r = run({ wellness: wellness(10), whoopToday: null });
eq(r.confidence, 'low', 'confianza baja (<14 días de base y sin dato de hoy)');
eq(sig(r, 'hrv7v28').status, 'insufficient', 'la tendencia de HRV no se calcula sin base');
yes(/base propia incompleta/.test(sig(r, 'hrv7v28').reason || ''), 'y dice por qué');
eq(sig(r, 'rhr7v28').status, 'insufficient', 'igual la FC de reposo');
eq(r.fired, 0, 'no se inventan señales con datos insuficientes');

// ── 7. WHOOP amarillo solo → amarillo (suelo de color, sin disparar) ──────────────────
console.log('');
console.log('7. WHOOP amarillo de hoy, todo lo demás en rango');
r = run({ whoopToday: { score: 52, source: 'intervals' } });
eq(r.color, 'yellow', 'amarillo: el color de WHOOP fija un suelo');
eq(r.fired, 0, 'pero no cuenta como señal disparada (READ-003: bandera, no dosis)');
eq(sig(r, 'whoop').text, 'WHOOP hoy 52 % · amarillo', 'texto de la señal');
eq(r.deloadHint, false, 'sin deloadHint');
// Y un rojo de hoy, solo, es UNA señal: amarillo. Es la corrección explícita del v1.
const rojoSolo = run({ whoopToday: { score: 24, source: 'intervals' } });
eq(rojoSolo.fired, 1, 'un WHOOP rojo de hoy es UNA señal');
eq(rojoSolo.color, 'yellow', '…y una sola señal es amarillo, no rojo (READ-002)');

// ── 8. Una noche de 4 h con la media semanal en 7,0 h → el sueño NO dispara ────────────
console.log('');
console.log('8. Una noche mala aislada');
r = run({
  wellness: wellness(35, (age) => {
    if (age === 0) return { sleepSecs: 4 * 3600 };
    if (age <= 6) return { sleepSecs: Math.round(7.5 * 3600) };
    return null;
  }),
  whoopToday: { score: 74, source: 'whoop-direct' },
});
eq(sig(r, 'sleep7').fired, false, 'sleep7 NO dispara (media 7d = 7,0 h > 6,5)');
eq(sig(r, 'sleep7').text, 'Sueño 7d 7 h', 'y se lee la media, no la noche mala');
eq(r.color, 'green', 'el día sigue verde');
// Con la media POR DEBAJO de 6,5 h sí dispara.
const pocoSueno = run({
  wellness: wellness(35, (age) => (age <= 6 ? { sleepSecs: Math.round(6.1 * 3600) } : null)),
  whoopToday: { score: 74, source: 'whoop-direct' },
});
yes(sig(pocoSueno, 'sleep7').fired, 'media 7d de 6,1 h sí dispara (READ-006)');
eq(sig(pocoSueno, 'sleep7').text, 'Sueño 7d 6,1 h', 'con el texto del wireframe');
eq(pocoSueno.color, 'yellow', 'una señal → amarillo');

// ── 9. Check-in "<6h" + HRV −12 % → dos señales → rojo (READ-005) ─────────────────────
console.log('');
console.log('9. Check-in subjetivo + tendencia de HRV, sin wearable de hoy');
r = run({
  wellness: wellness(35, (age) => (age === 0
    ? { hrv: 62.5, subjective: { sleepBand: '<6h', feel: 3, ts: 1 } }
    : (age <= 6 ? { hrv: 62.5 } : null))),
  whoopToday: null,
  whoopMissingReason: MOTIVO,
});
eq(r.color, 'red', 'rojo: el subjetivo cuenta como señal concordante');
eq(r.fired, 2, 'dos señales');
eq(firedIds(r), 'hrv7v28,sleepSelf', 'HRV 7d y el check-in de sueño');
eq(sig(r, 'sleepSelf').text, 'Dormiste <6 h (check-in)', 'texto del check-in de sueño');
eq(sig(r, 'feelSelf').fired, false, 'sentirse 3/5 no dispara');
eq(sig(r, 'feelSelf').text, 'Te sientes 3/5 (check-in)', 'pero se muestra');
// Sentirse 2/5 sí.
const malCuerpo = run({
  wellness: wellness(35, { 0: { subjective: { sleepBand: '7-8', feel: 2, ts: 1 } } }),
  whoopToday: null,
});
yes(sig(malCuerpo, 'feelSelf').fired, 'sentirse 2/5 dispara (READ-005)');
eq(malCuerpo.color, 'yellow', 'solo, es amarillo');
// Sin check-in: insuficiente, y se dice.
const sinCheckin = run({ whoopToday: null });
eq(sig(sinCheckin, 'sleepSelf').status, 'insufficient', 'sin check-in la señal es insuficiente');
yes(/sin responder/.test(sig(sinCheckin, 'feelSelf').reason || ''), 'y el motivo lo dice');

// ── 10. Sin WHOOP y sin tendencias → unknown honesto ──────────────────────────────────
console.log('');
console.log('10. Primera semana: ni dato de hoy ni tendencias');
r = run({ wellness: wellness(2), whoopToday: null, whoopMissingReason: 'WHOOP aún no puntuó la noche' });
eq(r.color, 'unknown', "color 'unknown' (no se inventa un verde)");
eq(r.confidence, 'low', 'confianza baja');
eq(r.fired, 0, 'cero señales');
eq(r.deloadHint, false, 'sin deloadHint');
yes(r.signals.every(s => s.status === 'insufficient'), 'y TODAS las señales se declaran insuficientes');
// Sin ningún dato tampoco explota.
const vacio = E.computeReadinessFrom({ today: TODAY });
eq(vacio.color, 'unknown', 'con inputs vacíos: unknown');
eq(vacio.signals.length, 8, 'y las 8 señales presentes, todas insuficientes');

// ── 11. Calidad ≤2 dos veces ──────────────────────────────────────────────────────────
console.log('');
console.log('11. Calidad de sesión');
r = run({ workouts: [workout(1, 7, 2), workout(3, 7, 1)], whoopToday: { score: 74, source: 'intervals' } });
yes(sig(r, 'quality2').fired, 'calidad 2 y 1 dispara quality2');
eq(sig(r, 'quality2').text, 'Calidad ≤2 en las 2 últimas', 'con su texto');
eq(r.color, 'yellow', 'una señal → amarillo');
const buenaCalidad = run({ workouts: [workout(1, 7, 4), workout(3, 7, 2)] });
eq(sig(buenaCalidad, 'quality2').fired, false, 'con una buena de las dos, no dispara');
eq(sig(buenaCalidad, 'quality2').text, 'Calidad 4 y 2 en las 2 últimas', 'y muestra las dos');
// El trío del deload sostenido.
const trio = run({
  wellness: wellness(35, (age) => (age <= 6 ? { hrv: 62, restingHR: 55 } : null)),
  workouts: [workout(1, 7, 2), workout(3, 7, 2)],
  whoopToday: { score: 74, source: 'intervals' },
});
eq(trio.deloadHint, true, 'HRV + FC reposo + calidad ≤2 → deloadHint (READ-008)');

// ── 12. Los umbrales están declarados y son los del corpus ────────────────────────────
console.log('');
console.log('12. Umbrales declarados (no repartidos por el render)');
eq(E.READ_CUTOFFS.green, 67, 'corte verde 67 (el mismo de getRecoveryColor)');
eq(E.READ_CUTOFFS.yellow, 34, 'corte amarillo 34');
eq(E.READ_HRV_DROP_PCT, -10, 'HRV: −10 %');
eq(E.READ_RHR_RISE_BPM, 5, 'FC reposo: +5 bpm');
eq(E.READ_SLEEP_FLOOR_SECS, 23400, 'sueño: 6,5 h en segundos');
eq(E.READ_RPE_FLOOR, 9, 'RPE: 9');
eq(E.READ_QUALITY_CEIL, 2, 'calidad: 2');
eq(E.READ_MIN_BASE_VALUES, 14, 'base propia mínima: 14 días');

console.log('');
console.log(failed === 0
  ? '✅ Readiness: tendencias 7d vs base propia, ≥2 señales para actuar, cero scores.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
