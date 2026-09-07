// El motor de progresión: `suggestSetTarget` es la spec ejecutable del Change 7 del audit.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. La regla de doble progresión llevaba meses
// escrita en `generateCoachNote` y sólo emitía TEXTO: "sube a 92,5" en una frase, el
// placeholder del set con el peso de la sesión anterior, y el objetivo del cron en otra
// pestaña. Tres números para una decisión y ninguno en el hueco donde se escribe el peso
// (F-0, F-4). Ahora la app prescribe el kg, así que cada forma de prescribir mal es un fallo
// que llega a la barra:
//
//   · Progresar en semana de DESCARGA: la semana 5/5 existe para bajar la carga; subirla ahí
//     es lo peor de los dos mundos.
//   · Progresar tras una PAUSA: +2,5 kg sobre un dato de hace 30 días prescribe carga a un
//     cuerpo que ya no la tiene (LOAD-004).
//   · Tratar CENTÍMETROS como kg: `box-jump` mide la altura del cajón (v11.48). "50 cm + 2,5"
//     no significa nada, y el 3-sep ya quedó un registro con 0×5@6 por confundir las columnas.
//   · Inventar un PAR DE MANCUERNAS que no existe: 20 + 1,25 = 21,25 kg no está en ningún
//     rack. Todo peso de mancuerna se ajusta a la tabla real del gimnasio.
//   · Progresar sobre reps NO NUMÉRICAS: '20 m' de trineo o 'AMRAP' no son 20 reps.
//   · Obedecer a un objetivo del coach VENCIDO: el del cron de hace tres semanas describe un
//     cuerpo que ya no existe; manda la regla, y se dice en la razón.
//   · Sacar un número de una FRASE en prosa: un regex generoso sobre "ajustar a RPE 7 desde
//     unos 60 kg" acaba poniendo 7 kg en la barra.
//
// Ejecutar desde la raíz del repo: node tests/verify-set-target.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');

// Mismo patrón que verify-nutrition-v2 / verify-coach-wiring: el fichero entero en `vm` y sus
// exports por el bloque `module.exports`.
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
const E = sandbox.module.exports;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

if (typeof E.suggestSetTarget !== 'function') {
  console.log('FAIL — coach-engine.js no exporta suggestSetTarget');
  process.exit(1);
}
const { suggestSetTarget, parseCoachTarget, sessionReadout } = E;

const HOY = '2026-09-07';                 // lunes 2026-W37
const SEMANA = '2026-W37';

// --- Ejercicios reales del plan (mismos ids, reps, rpe y flags que `PLAN.sessions`) ---
const BENCH = { id: 'bench-press', name: 'Bench Press', muscle: 'Chest', sets: 3, reps: '5-8', rpe: '7-8', compound: true };
const ROW = { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 3, reps: '8-10', rpe: '7-8', compound: true };
const INCLINE = { id: 'incline-db-press', name: 'Incline DB Press', muscle: 'Chest', sets: 3, reps: '8-12', rpe: '7', db: true };
const BSS = { id: 'bss', name: 'Bulgarian Split Squat', muscle: 'Quads', sets: 3, reps: '8-10/side', rpe: '7-8', db: true };
const CHINS = { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 4, reps: '5-8', rpe: '7-8', bw: true, compound: true };
const ABWHEEL = { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', bw: true };
const FACEPULL = { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7' };
const PUSHDOWN = { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscle: 'Arms', sets: 3, reps: '10-15', rpe: '7' };
const LEGEXT = { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7-8' };
const BOXJUMP = { id: 'box-jump', name: 'Box Jump', muscle: 'Power', sets: 3, reps: '5', rpe: '-' };
const POGO = { id: 'pogo-hops', name: 'Pogo Hops', muscle: 'Power', sets: 3, reps: '20', rpe: '-' };
const SLED = { id: 'sled-push', name: 'Sled Push', muscle: 'Quads', sets: 6, reps: '20 m', rpe: '8', compound: true };
const AMRAP = { id: 'pushup', name: 'Push-up', muscle: 'Chest', sets: 3, reps: 'AMRAP', rpe: '8', bw: true };

/** Una sesión de historial: mismas reps/rpe en las N series. */
const S = (date, kg, reps, rpe, n = 3) => ({
  date,
  sets: Array.from({ length: n }, () => ({ weight: kg, reps, rpe, done: true })),
});
/** Una sesión con reps distintas por serie. */
const Sx = (date, kg, repsArr, rpe) => ({
  date,
  sets: repsArr.map(r => ({ weight: kg, reps: r, rpe, done: true })),
});
const T = (o = {}) => Object.assign({ today: HOY, todayWeekKey: SEMANA, deload: false }, o);

// ════════════════════════════════════════════════════════════════════════════════════
sec('1. Los 8 fixtures del audit (Change 7, criterios de aceptación)');

// (a) Todas al tope del rango con RPE controlado → +2,5 kg de barra.
{
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T());
  eq(r.kg, 95, '(a) 3×8 @7 sobre 92,5 en rango 5-8 → 95 kg');
  eq(r.source, 'rule', '(a) origen = regla (no hay objetivo del coach)');
  eq(r.rpe, '7-8', '(a) mantiene el RPE prescrito');
  eq(r.reps, '5-8', '(a) mantiene el rango de reps');
  eq(r.delta, 2.5, '(a) delta +2,5');
  ok(r.ruleIds.includes('STR-001'), '(a) cita STR-001');
  ok(/al tope/i.test(r.reason) && r.reason.includes('7,0'), `(a) razón dice tope y RPE: "${r.reason}"`);
  eq(r.basis.lastKg, 92.5, '(a) basis.lastKg = la última carga real');
  eq(r.basis.daysSince, 3, '(a) basis.daysSince = 3');
}

// (b) Al tope pero el RPE se fue: la carga se queda donde está.
{
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 9)], T());
  eq(r.kg, 92.5, '(b) 3×8 @9 → mismo 92,5 kg (no sube)');
  eq(r.delta, 0, '(b) delta 0');
  ok(/RPE/.test(r.reason), `(b) la razón nombra el RPE: "${r.reason}"`);
}

// (c) No llega al mínimo: una serie corta se repite; la mitad o más, se baja.
{
  const una = suggestSetTarget(ROW, [Sx('2026-09-04', 80, [8, 8, 6], 7)], T());
  eq(una.kg, 80, '(c) 8/8/6 en rango 8-10 → repite 80 kg');
  ok(/repite/i.test(una.reason), `(c) razón de repetición: "${una.reason}"`);
  const todas = suggestSetTarget(ROW, [S('2026-09-04', 80, 6, 7)], T());
  eq(todas.kg, 77.5, '(c) 6/6/6 en rango 8-10 → 77,5 kg (−2,5)');
  eq(todas.delta, -2.5, '(c) delta −2,5');
  ok(/mínimo/i.test(todas.reason), `(c) razón: no llegó al mínimo — "${todas.reason}"`);
}

// (d) El coach de ESTA semana manda sobre la regla.
{
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T({
    coachTarget: { kg: 95, reps: '5-8', rpe: '7-8', note: 'MANTENER. El 24-ago salió 95 × 7 @8,0' },
    coachWeekKey: SEMANA,
  }));
  eq(r.kg, 95, '(d) objetivo del coach de esta semana → 95 kg');
  eq(r.source, 'coach', '(d) origen = coach');
  ok(r.reason.startsWith('MANTENER'), '(d) la razón es la nota del coach, literal');
  // Y la semana anterior sigue vigente (el coach corre el domingo; el lunes no hay nueva).
  const prev = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T({
    coachTarget: { kg: 97.5 }, coachWeekKey: '2026-W36',
  }));
  eq(prev.kg, 97.5, '(d) la semana ANTERIOR también vale (el coach corre el domingo)');
  eq(prev.source, 'coach', '(d) …y sigue siendo origen coach');
  ok(/esta semana/.test(prev.reason), '(d) sin nota, razón por defecto');
}

// (e) El coach de hace tres semanas NO manda: cae a la regla, y lo dice.
{
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T({
    coachTarget: { kg: 110 },
    coachWeekKey: '2026-W34',            // lunes 2026-08-17 → 21 días
    planCreatedAt: '2026-08-17',
  }));
  eq(r.kg, 95, '(e) objetivo del coach de hace 3 semanas ignorado → 95 kg por la regla');
  eq(r.source, 'rule', '(e) origen = regla');
  ok(r.reason.startsWith('Objetivo del coach de hace 21 días — aplico la regla. '),
    `(e) la razón declara el objetivo vencido: "${r.reason}"`);
  // Sin `weekKey`, la vigencia la da `createdAt` ≤ 14 días.
  const fresco = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T({
    coachTarget: { kg: 100 }, coachWeekKey: null, planCreatedAt: '2026-09-01',
  }));
  eq(fresco.kg, 100, '(e) sin weekKey, un plan de hace 6 días sigue vigente');
  const viejo = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T({
    coachTarget: { kg: 100 }, coachWeekKey: null, planCreatedAt: '2026-08-10',
  }));
  eq(viejo.source, 'rule', '(e) sin weekKey y plan de hace 28 días → regla');
}

// (f) Descarga: −10 % sobre la última carga real y RPE 5-6. Sin evaluar progresión.
{
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)], T({ deload: true }));
  eq(r.kg, 83.75, '(f) deload sobre 92,5 → 83,75 kg (×0,9 al múltiplo de 1,25)');
  eq(r.rpe, '5-6', '(f) RPE 5-6');
  eq(r.source, 'rule', '(f) origen = regla');
  ok(r.ruleIds.includes('LOAD-004'), '(f) cita LOAD-004');
  ok(/Deload/.test(r.reason), `(f) razón: "${r.reason}"`);
  ok(r.kg < 92.5, '(f) EL INVARIANTE: en descarga nunca sube');
  // Mancuerna en descarga: par real de la tabla, nunca 27 kg.
  const db = suggestSetTarget(INCLINE, [S('2026-09-04', 30, 12, 7)], T({ deload: true }));
  eq(db.kg, 25, '(f) deload de 30 kg/mano → 25 (par real ≤ 27, no 27)');
}

// (g) Pausa de 30 días: repetir la carga, nunca subir.
{
  const r = suggestSetTarget(BENCH, [S('2026-08-08', 92.5, 8, 7)], T());
  eq(r.kg, 92.5, '(g) última sesión hace 30 días → repite 92,5 kg');
  eq(r.source, 'last', '(g) origen = último');
  ok(/Pausa de 30 días/.test(r.reason), `(g) razón: "${r.reason}"`);
  ok(r.ruleIds.includes('LOAD-004'), '(g) cita LOAD-004');
  // La pausa gana a la descarga: ya vienes detrenado, no hay que recortar más.
  const conDeload = suggestSetTarget(BENCH, [S('2026-08-08', 92.5, 8, 7)], T({ deload: true }));
  eq(conDeload.kg, 92.5, '(g) pausa + semana de descarga → repite (la pausa manda)');
  // El límite es 21 días: 21 progresa, 22 no.
  eq(suggestSetTarget(BENCH, [S('2026-08-17', 92.5, 8, 7)], T()).source, 'rule',
    '(g) 21 días exactos: todavía progresa');
  eq(suggestSetTarget(BENCH, [S('2026-08-16', 92.5, 8, 7)], T()).source, 'last',
    '(g) 22 días: ya es pausa');
}

// (h) Sin historial no se inventa un número: la tarjeta se queda como está.
{
  const r = suggestSetTarget(BENCH, [], T());
  eq(r.kg, null, '(h) sin historial → kg null');
  eq(r.source, 'none', '(h) origen = none (la tarjeta no pinta línea de objetivo)');
  ok(/Primera vez/.test(r.reason), `(h) razón: "${r.reason}"`);
  // Series sin marcar no son historial.
  const sinHacer = suggestSetTarget(BENCH, [{ date: '2026-09-04', sets: [{ weight: 90, reps: 8, rpe: 7, done: false }] }], T());
  eq(sinHacer.source, 'none', '(h) series sin marcar no cuentan como historial');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('2. Mancuernas: sólo pares que existen en el rack');

eq(E._coachNextDbPair(12.5), 15, '12,5 → 15 (siguiente par de la tabla)');
eq(E._coachNextDbPair(11), 12.5, '11 (fuera de tabla) → se ajusta a 10 y sube a 12,5');
eq(E._coachNextDbPair(40), 42.5, '40 (tope de la tabla) → 42,5 (mancuerna cargable)');
eq(E._coachNextDbPair(20), 22.5, '20 → 22,5 y NUNCA 21,25');
eq(E._coachPrevDbPair(15), 12.5, '15 → 12,5 hacia abajo');
eq(E._coachPrevDbPair(2), 0, 'el par más bajo baja a 0, no a negativo');
eq(E._coachSnapDbDown(27), 25, 'ajuste hacia abajo: 27 → 25');
{
  const r = suggestSetTarget(INCLINE, [S('2026-09-04', 12.5, 12, 7)], T());
  eq(r.kg, 15, 'incline DB 12,5 × 12 al tope → 15 kg/mano');
  const raro = suggestSetTarget(INCLINE, [S('2026-09-04', 11, 12, 7)], T());
  eq(raro.kg, 12.5, 'un 11 kg de un registro viejo → 12,5, no 12,25');
  const pesado = suggestSetTarget(INCLINE, [S('2026-09-04', 40, 12, 7)], T());
  eq(pesado.kg, 42.5, '40 kg/mano al tope → 42,5');
  // Ningún kg prescrito puede caer fuera de los múltiplos de 1,25.
  for (const kg of [11, 12.5, 13, 17.5, 21.25, 33]) {
    const t = suggestSetTarget(INCLINE, [S('2026-09-04', kg, 12, 7)], T());
    ok(E.COACH_DB_PAIRS_KG.includes(t.kg) || t.kg % 2.5 === 0,
      `desde ${kg} kg/mano el objetivo (${t.kg}) es un par real`);
  }
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('3. Lo que NO se carga en kg');

{
  const r = suggestSetTarget(BOXJUMP, [S('2026-09-03', 50, 5, null)], T({ measureUnit: 'cm' }));
  eq(r.kg, null, 'box jump: la columna son cm → sin objetivo de kg');
  eq(r.source, 'none', 'box jump: origen none');
  eq(r.reason, 'Se mide en cm, no en kg', 'box jump: razón explícita');
  // Y ni en descarga ni con objetivo del coach aparece un kg.
  eq(suggestSetTarget(BOXJUMP, [S('2026-09-03', 50, 5, null)], T({ measureUnit: 'cm', deload: true })).kg, null,
    'box jump en descarga: sigue sin kg');
  eq(suggestSetTarget(BOXJUMP, [], T({ measureUnit: 'cm', coachTarget: { kg: 60 }, coachWeekKey: SEMANA })).kg, null,
    'box jump con objetivo del coach: sigue sin kg (la medida gana)');
}
{
  const r = suggestSetTarget(POGO, [S('2026-09-03', 0, 20, null)], T());
  eq(r.kg, null, 'pogo hops (sin columna de medida) tampoco recibe carga');
  ok(/Salto/.test(r.reason), `pogo hops: razón de potencia — "${r.reason}"`);
}
{
  const r = suggestSetTarget(SLED, [S('2026-09-03', 60, 20, 8, 6)], T());
  eq(r.source, 'last', "trineo '20 m': reps no numéricas → origen último");
  eq(r.kg, 60, 'trineo: repite la última carga');
  ok(/Sin rango de reps/.test(r.reason), `trineo: razón — "${r.reason}"`);
  const amrap = suggestSetTarget(AMRAP, [S('2026-09-03', 0, 25, 8)], T());
  eq(amrap.source, 'last', "'AMRAP' → origen último, sin progresión de carga");
}
{
  const r = suggestSetTarget(ABWHEEL, [S('2026-09-04', 0, 12, null)], T());
  eq(r.kg, null, 'ab wheel (peso corporal, RPE "-") → nunca kg');
  eq(r.source, 'rule', 'ab wheel: hay regla, pero no es carga');
  ok(/recorrido/.test(r.reason), `ab wheel al tope: razón — "${r.reason}"`);
  const corto = suggestSetTarget(ABWHEEL, [S('2026-09-04', 0, 8, null)], T());
  eq(corto.kg, null, 'ab wheel sin llegar al tope: sigue sin kg');
  ok(/Completa el rango/.test(corto.reason), 'ab wheel: completar el rango primero');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('4. Peso corporal con lastre, polea y unilateral');

{
  const r = suggestSetTarget(CHINS, [S('2026-09-04', 0, 8, 7, 4)], T());
  eq(r.kg, 2.5, 'dominadas 4×8 a peso corporal @7 → +2,5 kg de lastre');
  ok(/lastre/.test(r.reason), `dominadas: razón — "${r.reason}"`);
  const conLastre = suggestSetTarget(CHINS, [S('2026-09-04', 5, 8, 7, 4)], T());
  eq(conLastre.kg, 7.5, 'con +5 kg ya colgado y todo al tope → +7,5');
  const deload = suggestSetTarget(CHINS, [S('2026-09-04', 0, 8, 7, 4)], T({ deload: true }));
  eq(deload.kg, null, 'dominadas sin lastre en descarga: no hay carga que bajar');
  eq(deload.rpe, '5-6', '…pero sí baja el RPE prescrito');
}
{
  const r = suggestSetTarget(FACEPULL, [S('2026-09-04', 25, 15, 7)], T());
  eq(r.kg, 26.25, 'face pull (polea) sube 1,25, no 2,5');
  eq(E._coachLoadType(FACEPULL, null), 'cable', 'face pull se clasifica como polea');
  eq(E._coachLoadType(PUSHDOWN, null), 'cable', 'tricep pushdown también');
  eq(E._coachLoadType(LEGEXT, null), 'machine', 'leg extension: máquina (no compuesto, no polea)');
  eq(E._coachLoadType(BENCH, null), 'barbell', 'banca: barra (compuesto sin db ni bw)');
  eq(E._coachLoadType(CHINS, null), 'bw', 'dominadas: peso corporal');
  eq(suggestSetTarget(LEGEXT, [S('2026-09-04', 60, 15, 7)], T()).kg, 62.5,
    'máquina sube 2,5');
}
{
  const r = suggestSetTarget(BSS, [S('2026-09-04', 20, 10, 7)], T());
  eq(r.reps, '8-10/side', 'unilateral: el sufijo /side se conserva en el objetivo');
  eq(r.kg, 22.5, 'unilateral: el rango se evalúa por lado (10 = tope) → siguiente par');
  const pierna = suggestSetTarget(
    { id: 'bss', name: 'BSS', sets: 3, reps: '10-15/pierna', rpe: '8', bw: true },
    [S('2026-09-04', 0, 15, 8)], T());
  eq(pierna.reps, '10-15/pierna', 'el sufijo en castellano también');
  eq(pierna.kg, 2.5, 'BSS a peso corporal al tope → 2,5 kg de lastre');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('5. Sin RPE anotado, dos sesiones iguales, y el rango por dentro');

{
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, null)], T());
  eq(r.kg, 95, 'todo al tope sin RPE anotado → progresa igual');
  ok(r.reason.includes('(sin RPE'), `…y lo declara: "${r.reason}"`);
  eq(r.basis.avgRpe, null, 'basis.avgRpe = null (no se inventa)');
}
{
  const r = suggestSetTarget(BENCH, [Sx('2026-09-04', 90, [5, 6, 5], 7)], T());
  eq(r.kg, 90, 'dentro del rango sin llegar al tope → mismo kg');
  ok(/\+1 rep por serie \(5\/6\/5 → 6\/7\/6\)/.test(r.reason), `razón con las reps concretas: "${r.reason}"`);
}
{
  const r = suggestSetTarget(BENCH, [
    Sx('2026-09-04', 90, [6, 6, 6], 7),
    Sx('2026-08-31', 90, [6, 6, 6], 7),
  ], T());
  eq(r.kg, 90, 'dos sesiones idénticas → mismo kg');
  ok(/Dos sesiones iguales/.test(r.reason), `razón de estancamiento: "${r.reason}"`);
}
{
  // Al tope pero por encima del RPE objetivo sin llegar a 8,5: tampoco sube.
  const r = suggestSetTarget(FACEPULL, [S('2026-09-04', 25, 15, 8)], T());
  eq(r.kg, 25, 'al tope con RPE 8 sobre un objetivo de 7 → mismo kg');
  ok(/objetivo/.test(r.reason), `razón: "${r.reason}"`);
}
{
  // Una serie corta pero con RPE 9: se baja igual (la señal manda sobre el conteo).
  const r = suggestSetTarget(ROW, [Sx('2026-09-04', 80, [8, 8, 6], 9)], T());
  eq(r.kg, 77.5, 'una serie corta con RPE 9 → baja');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('6. parseCoachTarget — adaptador legacy del texto del cron');

const P = (s) => parseCoachTarget(s);
eq(P('95 kg × 5-8').kg, 95, "'95 kg × 5-8' → 95");
eq(P('95 kg × 5-8').reps, '5-8', "…y reps '5-8'");
eq(P('62,5 kg × 6-10').kg, 62.5, "coma decimal: '62,5 kg × 6-10' → 62,5");
eq(P('70 kg x 12').reps, '12', "tolera la x latina y un solo número de reps");
eq(P('32 kg/mano × 8-12').kg, 32, "'32 kg/mano × 8-12' → 32 por mano");
eq(P('32 kg/mano × 8-12').perHand, true, '…marcado perHand');
eq(P('20 kg/DB').kg, 20, "'20 kg/DB' → 20");
eq(P('20 kg/DB').perHand, true, '…también perHand');
eq(P('BW +7,5 kg × 5-8').kg, 7.5, "'BW +7,5 kg × 5-8' → 7,5 de lastre");
eq(P('BW +7,5 kg × 5-8').bw, true, '…marcado bw');
eq(P('BW+2,5').kg, 2.5, "'BW+2,5' → 2,5");
eq(P('BW × 8-12').kg, null, "'BW × 8-12' (sin lastre) → kg null");
eq(P('BW × 8-12').bw, true, '…pero sí bw');
eq(P('8-9 kg/mano × 12-15').kg, 8, "un rango de kg toma el suelo: '8-9 kg/mano' → 8");
eq(P('3 × 12').kg, null, "'3 × 12' son series×reps: NO es un peso");
eq(P('3 × 12').reps, '12', '…de ahí sólo se puede leer las reps');
eq(P('empezar en 60 kg, ajustar a RPE 7').kg, 60, "la única prosa reconocida: 'empezar en 60 kg' → 60");
eq(P('ajustar a RPE 7 desde unos 60 kg').kg, null, 'un número en medio de una frase NO se toma');
eq(P('').kg, null, 'cadena vacía → null, sin lanzar');
eq(P(null).kg, null, 'null → null, sin lanzar');
eq(P('—').kg, null, 'un guion → null');
// Y el objetivo parseado entra en el motor como cualquier otro.
{
  const t = P('95 kg × 5-8');
  const r = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)],
    T({ coachTarget: { kg: t.kg, reps: t.reps, rpe: '7-8', note: 'MANTENER' }, coachWeekKey: SEMANA }));
  eq(r.kg, 95, 'el objetivo parseado del cron llega al motor');
  eq(r.source, 'coach', '…con origen coach');
  // Un objetivo sin kg no puede secuestrar la decisión: manda la regla.
  const sinKg = suggestSetTarget(BENCH, [S('2026-09-04', 92.5, 8, 7)],
    T({ coachTarget: { kg: P('3 × 12').kg }, coachWeekKey: SEMANA }));
  eq(sinKg.source, 'rule', 'un objetivo del coach sin kg cede el paso a la regla');
  eq(sinKg.kg, 95, '…y la regla progresa normal');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('7. sessionReadout — qué se prescribió, qué se hizo, qué toca');

{
  const exDefs = {
    'bench-press': BENCH,
    'barbell-row': ROW,
    'incline-db-press': INCLINE,
    'tricep-pushdown': PUSHDOWN,
    'box-jump': Object.assign({ measureUnit: 'cm' }, BOXJUMP),
  };
  const targets = {
    'bench-press': { kg: 95, reps: '5-8', rpe: '7-8', source: 'rule' },
    'barbell-row': { kg: 67.5, reps: '8-10', rpe: '7-8', source: 'coach' },
    'incline-db-press': { kg: 22.5, reps: '8-12', rpe: '7', source: 'rule' },
    'tricep-pushdown': { kg: 25, reps: '10-15', rpe: '7', source: 'rule' },
    'box-jump': { kg: null, reps: '5', rpe: '-', source: 'none' },
  };
  const workout = {
    id: 'w1', date: HOY, session: 'upperA', duration: '74:12', unit: 'kg',
    exercises: [
      { exerciseId: 'bench-press', sets: [
        { weight: 95, reps: 8, rpe: 7.5, done: true },
        { weight: 95, reps: 8, rpe: 8, done: true },
        { weight: 95, reps: 7, rpe: 8, done: true }] },
      { exerciseId: 'barbell-row', sets: [
        { weight: 67.5, reps: 10, rpe: 7, done: true },
        { weight: 67.5, reps: 10, rpe: 7.5, done: true },
        { weight: 67.5, reps: 7, rpe: 8, done: true }] },
      { exerciseId: 'incline-db-press', sets: [
        { weight: 20, reps: 12, rpe: 7, done: true },
        { weight: 20, reps: 11, rpe: 7.5, done: true }] },
      { exerciseId: 'tricep-pushdown', sets: [
        { weight: 0, reps: 0, rpe: null, done: false },
        { weight: 0, reps: 0, rpe: null, done: false }] },
      { exerciseId: 'box-jump', sets: [
        { weight: 50, reps: 5, rpe: null, done: true },
        { weight: 50, reps: 5, rpe: null, done: true }] },
    ],
  };
  const nextById = {
    'bench-press': { kg: 97.5, reason: 'Todas las series al tope (8) @7,8 → +2,5 kg.' },
    'barbell-row': { kg: 67.5, reason: 'Una serie corta: repite 67,5 kg y completa el rango' },
    'incline-db-press': { kg: 20, reason: '+1 rep por serie (12/11 → 12/12)' },
  };
  const R = sessionReadout(workout, targets, exDefs, nextById);
  const by = {};
  R.items.forEach(it => { by[it.exerciseId] = it; });
  eq(by['bench-press'].outcome, 'progressed', 'banca 95×8/8/7 sobre objetivo 95 → progressed');
  eq(by['barbell-row'].outcome, 'held', 'remo 67,5 con una serie corta → held');
  eq(by['incline-db-press'].outcome, 'regressed', 'incline 20 sobre objetivo 22,5 → regressed');
  eq(by['tricep-pushdown'].outcome, 'skipped', 'pushdown sin series hechas → skipped');
  eq(by['box-jump'].outcome, 'no-target', 'box jump sin objetivo de kg → no-target');
  eq(by['bench-press'].done.topKg, 95, 'topKg de la banca');
  eq(JSON.stringify(by['bench-press'].done.reps), '[8,8,7]', 'reps hechas de la banca');
  eq(by['bench-press'].done.avgRpe, 7.8, 'RPE medio de la banca');
  eq(by['bench-press'].next.kg, 97.5, 'y el próximo objetivo viaja en el item');
  eq(by['bench-press'].name, 'Bench Press', 'el nombre sale de exDefs');
  eq(by['box-jump'].measureUnit, 'cm', 'la unidad viaja con el item: 50 son CENTÍMETROS, no kilos');
  eq(by['bench-press'].measureUnit, null, 'y es null cuando el número sí son kilos');
  eq(R.summary.progressed, 1, 'summary.progressed');
  eq(R.summary.held, 1, 'summary.held');
  eq(R.summary.regressed, 1, 'summary.regressed');
  eq(R.summary.skipped, 1, 'summary.skipped');
  ok(/^1 subida, 1 mantenida, 1 corta, 1 saltado\./.test(R.line), `la línea resume en castellano: "${R.line}"`);
  ok(/Bench Press sube a 97,5 kg la próxima\./.test(R.line), 'y dice qué sube la próxima vez');
  // Plurales y sesión vacía.
  const vacio = sessionReadout({ exercises: [] }, {}, {}, {});
  eq(vacio.line, 'Sin series registradas.', 'sin ejercicios: línea honesta, sin números');
  eq(vacio.summary.progressed, 0, 'y el resumen a cero');
}

// ════════════════════════════════════════════════════════════════════════════════════
sec('8. Helpers puros');

eq(JSON.stringify(E._coachParseReps('5-8')), JSON.stringify({ min: 5, max: 8, suffix: '', numeric: true, raw: '5-8' }), "_coachParseReps('5-8')");
eq(E._coachParseReps('8-10/side').suffix, '/side', "sufijo '/side'");
eq(E._coachParseReps('10-15/pierna').max, 15, "'10-15/pierna' → max 15");
eq(E._coachParseReps('5').min, 5, "'5' → min = max = 5");
eq(E._coachParseReps('5').max, 5, '…');
eq(E._coachParseReps('AMRAP').numeric, false, "'AMRAP' no es numérico");
eq(E._coachParseReps('20 m').numeric, false, "'20 m' no es numérico (metros, no reps)");
eq(E._coachParseReps('30-40 s').numeric, false, "'30-40 s' tampoco (segundos)");
eq(E._coachParseRpeTop('7-8'), 8, "_coachParseRpeTop('7-8') → 8");
eq(E._coachParseRpeTop('7'), 7, "'7' → 7");
eq(E._coachParseRpeTop('-'), null, "'-' → null (no se puntúa)");
eq(E._coachParseRpeTop(null), null, 'null → null');
eq(E._coachRound(83.25), 83.75, '_coachRound(83,25) → 83,75');
eq(E._coachRound(92.5 * 0.9), 83.75, 'el 92,5 × 0,9 del deload → 83,75');
eq(E._coachRound(100 / 3, 2.5), 32.5, 'redondeo a 2,5');
eq(E._coachFmtKg(92.5), '92,5', '_coachFmtKg: coma decimal');
eq(E._coachFmtKg(95), '95', 'los enteros sin decimales');
eq(E._coachFmtKg(2.5), '2,5', '2,5');
eq(E._coachFmtRpe(7), '7,0', '_coachFmtRpe: el RPE siempre con un decimal');
eq(E._coachWeekKeyMonday('2026-W37'), '2026-09-07', "_coachWeekKeyMonday('2026-W37')");
eq(E._coachWeekKeyMonday('2026-W01'), '2025-12-29', 'W01 de 2026 empieza el 29-dic-2025');
eq(E._coachWeekKeyMonday('nada'), null, 'una clave inválida → null');
eq(E._coachDaysBetween('2026-09-04', '2026-09-07'), 3, '_coachDaysBetween');
eq(E.COACH_STEP_KG, 1.25, 'COACH_STEP_KG = 1,25');
eq(E.COACH_PAUSE_DAYS, 21, 'COACH_PAUSE_DAYS = 21');
eq(E.COACH_DELOAD_FACTOR, 0.9, 'COACH_DELOAD_FACTOR = 0,9');
eq(E.COACH_RPE_HIGH, 8.5, 'COACH_RPE_HIGH = 8,5');
eq(E.COACH_TARGET_TTL_DAYS, 14, 'COACH_TARGET_TTL_DAYS = 14');
eq(E.COACH_INC.barbell, 2.5, 'incremento de barra 2,5 (práctica, no evidencia)');
eq(E.COACH_INC.cable, 1.25, 'incremento de polea 1,25');

// ════════════════════════════════════════════════════════════════════════════════════
sec('9. Robustez: nada de esto puede lanzar en la pantalla de entreno');

const raros = [
  [null, null, undefined],
  [{}, [], {}],
  [BENCH, null, T()],
  [BENCH, [{ date: '2026-09-04', sets: null }], T()],
  [BENCH, [{ sets: [{ weight: 90, reps: 8, done: true }] }], T()],   // sin fecha
  [BENCH, [S('2026-09-04', 0, 0, 0)], T()],
  [{ id: 'x', reps: null, rpe: null }, [S('2026-09-04', 50, 10, 7)], T()],
  [BENCH, [S('2026-09-04', 90, 8, 7)], { deload: true }],            // sin `today`
];
for (const [ex, h, o] of raros) {
  let threw = null;
  let r = null;
  try { r = suggestSetTarget(ex, h, o); } catch (e) { threw = e; }
  ok(!threw, `entrada rara ${JSON.stringify([ex && ex.id, h && h.length])} no lanza${threw ? ` — ${threw.message}` : ''}`);
  ok(r && typeof r === 'object' && 'kg' in r && 'source' in r, '  …y devuelve la forma completa');
}
{
  // El invariante que protege la barra: en descarga y tras una pausa NUNCA sube la carga.
  let subeEnDeload = 0;
  let subeTrasPausa = 0;
  for (const kg of [40, 60, 80, 92.5, 105]) {
    for (const reps of [5, 6, 8, 10]) {
      for (const rpe of [6, 7, 8, 9]) {
        const d = suggestSetTarget(BENCH, [S('2026-09-04', kg, reps, rpe)], T({ deload: true }));
        if (d.kg != null && d.kg > kg) subeEnDeload++;
        const p = suggestSetTarget(BENCH, [S('2026-07-15', kg, reps, rpe)], T());
        if (p.kg != null && p.kg > kg) subeTrasPausa++;
      }
    }
  }
  eq(subeEnDeload, 0, '80 combinaciones en descarga: 0 subidas de carga');
  eq(subeTrasPausa, 0, '80 combinaciones tras 54 días de pausa: 0 subidas de carga');
}

console.log(fail === 0
  ? '\nPASS — la app prescribe el kg del set, y no lo sube donde no debe\n'
  : `\nFAIL — ${fail} problema(s)\n`);
process.exit(fail === 0 ? 0 : 1);
