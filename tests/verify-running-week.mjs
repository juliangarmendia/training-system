// Coach v2 — incremento 6: la carrera hacia el 10k (`suggestRunningWeek`, v11.60).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. El dato real de partida es demoledor: las
// cuatro últimas carreras (1,9 / 3,2 / 5,0 / 4,1 km) van a 152, 149, 155 y 147 bpm de media
// sobre una Z2 que acaba en 143. O sea: CERO carreras en Z2. Cualquier motor que prescriba
// kilómetros sobre eso está prescribiendo sobre una base que no existe. Las formas conocidas
// de romperlo en silencio:
//
//   · **Kilómetros a quien corre fuera de Z2.** Si el motor mira sólo el volumen ("5 km la
//     semana pasada → 5,5 esta") le sube la dosis a alguien cuyo problema es la INTENSIDAD.
//     La salida correcta es tiempo con caminata intercalada (END-006), no distancia.
//   · **Intervalos sin base.** END-004 permite 1 sesión dura/semana; sin 3 semanas de ≥15 km
//     en Z2 esa sesión no es calidad, es la única sesión dura de una base inexistente. El
//     motor NO genera duras nunca: abre la puerta (`qualityUnlocked`) y la propone el coach.
//   · **Largo > 50 % del volumen semanal.** El reparto es lo que convierte 18 km/semana en
//     una lesión: 12 el sábado y 6 el miércoles no es la misma semana que 9 y 9.
//   · **Progresar en deload.** La semana de descarga recorta series al 50 %; subir el volumen
//     de carrera ahí es lo peor de los dos mundos (LOAD-004).
//   · **Dosificar por recuperación (E-7, auditoría 2026-09-08).** Hasta v11.66 un
//     `readiness.deloadHint` congelaba la rampa de km y cerraba la puerta de la calidad. Era
//     una dosis derivada de WHOOP y del RPE, aplicada sin que nadie la aprobara — justo lo que
//     Julian retiró el 2026-09-07: *"nada de ajustar el entrenamiento por WHOOP"*. La
//     recuperación INFORMA; la decisión semanal es del coach y del usuario. El test de la
//     sección 4 es ahora un test NEGATIVO: con `deloadHint:true` no cambia ni un número.
//   · **Bici / remo / ski contando como km de carrera.** Son minutos aeróbicos reales y
//     cuentan para el presupuesto, pero no construyen tolerancia al impacto. Si suman km, el
//     motor cree que hay una base de carrera que no hay.
//   · **Decoupling inventado.** "10k cómodo" exige deriva <5 % (END-005, `expert` y encima
//     dato que hoy casi nunca llega). Sin el dato, `decouplingOk: null` y NO se declara listo.
//
// Ejecutar desde la raíz del repo: node tests/verify-running-week.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/coach-engine.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(SRC).runInContext(sandbox);
const E = sandbox.module.exports;

if (!E || typeof E.suggestRunningWeek !== 'function') {
  console.log('FAIL — coach-engine.js no exporta suggestRunningWeek');
  process.exit(1);
}

// ── Contexto común ──────────────────────────────────────────────────────────────────
// Hoy = miércoles 2026-09-23 (semana ISO 2026-W39). Ancla del bloque = lunes 2026-09-07,
// así que la semana del bloque es la 3 (build) y `progressCardioMin` progresa +10 %^2.
const TODAY = '2026-09-23';
const ANCHOR = '2026-09-07';
const BLOCK3 = E.blockWeekFromDates(TODAY, ANCHOR, 5);
const DELOAD = E.blockWeekFromDates('2026-10-07', ANCHOR, 5);
const ZONES = { z2: [131, 143] };                     // z2max = 145 con el ruido de correa
const SLOTS3 = [
  { dow: 3, base: 40, subtype: 'zone2' },
  { dow: 6, base: 50, subtype: 'long_easy' },
  { dow: 0, base: 20, optional: true },
];
const SLOTS2 = SLOTS3.slice(0, 2);
const GOALS = E.COACH_GOALS_DEFAULT;
const GREEN = { deloadHint: false };

const call = (o) => E.suggestRunningWeek(Object.assign({
  block: BLOCK3, readiness: GREEN, goals: GOALS, zones: ZONES, slots: SLOTS3, todayStr: TODAY,
}, o));
const byDow = (rw, dow) => (rw.sessions || []).find(s => s.dow === dow) || {};

console.log('0. Contexto');
eq(BLOCK3.index, 3, 'el 23-sep-2026 es la semana 3/5 del bloque anclado al 7-sep');
yes(DELOAD.isDeload, 'y el 7-oct-2026 es la semana de descarga');

// ── 1. El dato real: 0 de 4 carreras en Z2 → trote/caminata POR TIEMPO ──────────────
console.log('');
console.log('1. Fixture real (1,9 / 3,2 / 5,0 / 4,1 km a 152/149/155/147 bpm)');
const REAL = [
  { date: '2026-09-09', km: 1.9, min: 20, avgHR: 152 },
  { date: '2026-09-12', km: 3.2, min: 32, avgHR: 149 },
  { date: '2026-09-16', km: 5.0, min: 48, avgHR: 155 },
  { date: '2026-09-19', km: 4.1, min: 40, avgHR: 147 },
];
const real = call({ history4w: REAL });

eq(real.phase, 'run_walk', 'fase = run_walk (la intensidad es el problema, no el volumen)');
eq(real.weeklyKmTarget, null, 'weeklyKmTarget = null: en esta fase NO se prescriben kilómetros');
eq(real.gates.z2Compliance, 0, '0 de las 3 últimas carreras dentro de Z2 (FC ≤145)');
eq(real.gates.z2Sample, 3, 'la ventana de cumplimiento son 3 carreras');
eq(real.gates.qualityUnlocked, false, 'sin base, la sesión de calidad sigue cerrada (END-004)');
eq(real.gates.baseWeeks, 0, 'cero semanas ISO con ≥15 km en Z2');
eq(real.gates.longestZ2Km, 0, 'y cero km de largo EN Z2 (ninguna carrera cumplió)');
yes(real.sessions.length === 3, 'tres sesiones (los tres slots del ideal de 6 días)');
yes(/145|Z2|run\/walk/i.test(real.reason), `la razón cita el número: "${real.reason}"`);
yes(real.reason.length < 170, 'y es una línea, no un párrafo');

const rMid = byDow(real, 3), rLong = byDow(real, 6), rOpt = byDow(real, 0);
eq(rMid.type, 'run-walk', 'miércoles = run-walk');
eq(rLong.type, 'run-walk', 'sábado = run-walk');
eq(rOpt.type, 'easy-opt', 'domingo = suave opcional');
eq(rMid.min, 35, "miércoles 35' (base 30' de run/walk, semana 3 del bloque)");
eq(rLong.min, 50, "sábado 50' (base 40' de run/walk, semana 3)");
eq(rOpt.min, 24, "domingo 24' (base 20', paso de 2')");
yes(rMid.km == null && rLong.km == null, 'ninguna sesión lleva km: la dosis es tiempo');
eq(rMid.pattern, '5′ jog / 1′ walk', 'semana ≥3 del bloque → patrón 5/1');
eq(rMid.hrCap, 143, 'el techo de FC es el alto de Z2 (143), no el z2max con ruido');
eq(rMid.source, 'rule', "source:'rule' (esto NO es el coach)");
yes(/6 × \(5′ jog \/ 1′ walk\)/.test(rMid.summary || ''), `summary legible: "${rMid.summary}"`);
yes(/HR ≤143/.test(rMid.summary || ''), 'con el techo de FC en el resumen');

// El DSL es lo que llega al reloj: un bloque de repeticiones válido de intervals.icu.
console.log('');
console.log('1.b El DSL que llega al COROS');
yes(/\d+x/.test(rMid.dsl || ''), `lleva bloque de repeticiones: ${JSON.stringify(rMid.dsl)}`);
yes(/Z2 HR/.test(rMid.dsl), 'el tramo de trote va en Z2 HR (nunca bpm absolutos)');
yes(/Z1 HR/.test(rMid.dsl), 'y el de caminar en Z1 HR');
yes(/^\n/.test(rMid.dsl) && /\n$/.test(rMid.dsl),
  'con línea en blanco antes y después (convención de _icuRepeat, o el parser se come el resto)');
eq((rMid.dsl.match(/(\d+)x/) || [])[1], 6, "35' con patrón 5+1 → 6 repeticiones");
yes(!/\d+,\d/.test(rMid.dsl), 'sin comas decimales en el DSL (eso es castellano de pantalla, no sintaxis)');
eq((rLong.dsl.match(/(\d+)x/) || [])[1], 8, "50' → 8 repeticiones");
yes(!/Z[45] HR/.test(real.sessions.map(s => s.dsl).join('\n')), 'ningún tramo duro en el DSL');

// Semanas 1-2 del bloque: el patrón es más conservador.
const w1 = call({ history4w: REAL, block: E.blockWeekFromDates('2026-09-09', ANCHOR, 5) });
eq(byDow(w1, 3).pattern, '3′ jog / 2′ walk', 'semanas 1-2 del bloque → patrón 3/2');
eq(byDow(w1, 3).min, 30, "y sin progresión: 30' en la semana 1");
eq((byDow(w1, 3).dsl.match(/(\d+)x/) || [])[1], 6, "30' con patrón 3+2 → 6 repeticiones");

// ── 2. Las otras tres puertas a run_walk ────────────────────────────────────────────
console.log('');
console.log('2. Las otras puertas a run_walk (ninguna necesita FC alta)');
eq(call({ history4w: [{ date: '2026-08-30', km: 8, min: 60, avgHR: 138 },
                      { date: '2026-08-29', km: 8, min: 60, avgHR: 138 }] }).phase, 'run_walk',
  'sin ninguna carrera en 14 días → run_walk (volver de una pausa no es rampar)');
eq(call({ history4w: [{ date: '2026-09-19', km: 3.0, min: 22, avgHR: 138 },
                      { date: '2026-09-16', km: 3.0, min: 22, avgHR: 138 }] }).phase, 'run_walk',
  'última semana ISO con 6 km (<8) → run_walk');
eq(call({ history4w: [{ date: '2026-09-19', km: 9.0, min: 63, avgHR: 138 }] }).phase, 'run_walk',
  'una sola carrera en 4 semanas → run_walk (n=1 no es una base)');
eq(call({ history4w: [] }).phase, 'run_walk', 'sin datos → run_walk (el suelo, nunca km)');
eq(call({ history4w: [] }).weeklyKmTarget, null, 'y sin km inventados');

// ── 3. Fase base: la rampa por kilómetros ───────────────────────────────────────────
console.log('');
console.log('3. Fase base (2 de 3 en Z2, 12 km la última semana ISO)');
const BASE = [
  { date: '2026-09-09', km: 5.0, min: 36, avgHR: 148 },
  { date: '2026-09-12', km: 5.0, min: 36, avgHR: 141 },
  { date: '2026-09-16', km: 6.0, min: 43, avgHR: 150 },
  { date: '2026-09-19', km: 6.0, min: 43, avgHR: 142 },
];
const base2 = call({ history4w: BASE, slots: SLOTS2 });
eq(base2.phase, 'base', 'fase = base');
eq(base2.gates.z2Compliance, 2, '2 de las 3 últimas en Z2');
eq(base2.gates.baseWeeks, 0, 'pero 12 km no llegan a los 15 de una semana de base');
eq(base2.gates.qualityUnlocked, false, 'así que nada de duras (END-004)');
eq(base2.weeklyKmTarget, 13.5, '12 km → 13,5 km (+10 % o +1 km, el mayor; techo +20 %)');
eq(byDow(base2, 6).type, 'long', 'el sábado es el largo');
eq(byDow(base2, 6).km, 6.5, 'largo 6,5 km = 50 % con dos carreras, redondeado a la baja');
yes(byDow(base2, 6).km <= base2.weeklyKmTarget * 0.5 + 1e-9, 'el largo NO pasa del 50 % del volumen');
eq(byDow(base2, 3).type, 'Z2', 'el miércoles es Z2');
eq(byDow(base2, 3).km, 6.5, 'y se lleva la otra mitad');
yes(byDow(base2, 6).min == null, 'en fase km la sesión no prescribe minutos (no se inventa ritmo)');
yes(/- 6\.5km Z2 HR/.test(byDow(base2, 6).dsl), `DSL por distancia: ${JSON.stringify(byDow(base2, 6).dsl)}`);
yes(/6\.5 km Z2/.test(byDow(base2, 6).summary || ''), `summary con punto decimal: "${byDow(base2, 6).summary}"`);
yes(/12|13,5/.test(base2.reason), `la razón cita los km: "${base2.reason}"`);

const base3 = call({ history4w: BASE, slots: SLOTS3 });
eq(base3.weeklyKmTarget, 13.5, 'con tres slots el volumen semanal no cambia');
yes(byDow(base3, 6).km <= base3.weeklyKmTarget * 0.4 + 1e-9,
  `con tres carreras el largo baja al 40 % (${byDow(base3, 6).km} km ≤ 5,4)`);
yes(byDow(base3, 6).km >= byDow(base3, 3).km, 'y sigue siendo la carrera más larga de la semana');
yes(byDow(base3, 0).km >= 2, `la suave opcional no baja de 2 km (${byDow(base3, 0).km})`);
eq(byDow(base3, 0).type, 'easy-opt', 'y sigue marcada como opcional');
yes(base3.sessions.reduce((s, x) => s + (x.km || 0), 0) <= 13.5 + 1e-9,
  'la suma de las sesiones nunca pasa del objetivo semanal');

// ── 4. Deload y deloadHint: nada progresa ───────────────────────────────────────────
console.log('');
console.log('4. Deload (calendario) y deloadHint (reactivo)');
const dl = call({ history4w: BASE, slots: SLOTS2, block: DELOAD });
eq(dl.weeklyKmTarget, 8.5, '12 km → 8,5 km en descarga (−30 %)');
yes(dl.weeklyKmTarget < 12, 'que es MENOS que la semana pasada, no más');
yes(/descarga|deload/i.test(dl.reason), `y se dice por qué: "${dl.reason}"`);
eq(byDow(dl, 6).km, 4.0, 'el largo baja con el volumen');

// E-7 · TEST NEGATIVO: `deloadHint` no mueve NI UN NÚMERO.
const verde = call({ history4w: BASE, slots: SLOTS2 });
const hint = call({ history4w: BASE, slots: SLOTS2, readiness: { deloadHint: true } });
eq(hint.weeklyKmTarget, verde.weeklyKmTarget,
  `con deloadHint el objetivo semanal es el mismo (${verde.weeklyKmTarget} km): la recuperación informa, no dosifica`);
eq(hint.weeklyMinTarget, verde.weeklyMinTarget, '…y los minutos tampoco cambian');
eq(hint.phase, verde.phase, '…ni la fase');
eq(hint.gates.qualityUnlocked, verde.gates.qualityUnlocked,
  '…ni la puerta de la calidad (la abre la base construida, no la HRV)');
eq(JSON.stringify(hint.sessions.map(s => [s.dow, s.km, s.min])),
  JSON.stringify(verde.sessions.map(s => [s.dow, s.km, s.min])),
  '…ni el reparto por sesión, km a km');
yes(/fatigue/i.test(hint.reason), `la señal se NOMBRA en la razón, sin recortar: "${hint.reason}"`);
yes(/weekly review/i.test(hint.reason), '…y dice a quién le toca decidir');

// Y con la puerta de la calidad abierta, `deloadHint` tampoco la cierra.
const conBase = {
  history4w: [
    { date: '2026-09-01', km: 5.5, min: 40, avgHR: 138 },
    { date: '2026-09-05', km: 9.5, min: 68, avgHR: 140 },
    { date: '2026-09-08', km: 5.5, min: 40, avgHR: 139 },
    { date: '2026-09-12', km: 9.5, min: 68, avgHR: 141 },
    { date: '2026-09-15', km: 5.5, min: 40, avgHR: 140 },
    { date: '2026-09-19', km: 9.5, min: 68, avgHR: 142 },
  ],
  slots: SLOTS2,
};
const qVerde = call(conBase);
const qHint = call(Object.assign({ readiness: { deloadHint: true } }, conBase));
yes(qVerde.gates.baseWeeks >= 3, `el fixture tiene base construida (${qVerde.gates.baseWeeks} semanas)`);
yes(qVerde.gates.qualityUnlocked, 'con base construida la calidad está desbloqueada');
yes(qHint.gates.qualityUnlocked, '…y sigue desbloqueada con deloadHint: la abre la base, no el wearable');

// La semana DE DESPUÉS de la descarga: la rampa reanuda el arco, no lo reinicia. Sin esto
// cada bloque bajaba el volumen un escalón permanente (12 → 8,5 → 9,5 → …) y los 8,5 km de
// la descarga caían bajo el suelo de 8 km, devolviendo a run/walk. Un oscilador, no un plan.
const trasDeload = call({
  history4w: [
    { date: '2026-09-09', km: 6.0, min: 43, avgHR: 141 },
    { date: '2026-09-12', km: 6.0, min: 43, avgHR: 142 },   // W37 = 12 km (antes de la descarga)
    { date: '2026-09-16', km: 4.0, min: 29, avgHR: 140 },
    { date: '2026-09-19', km: 4.5, min: 32, avgHR: 141 },   // W38 = 8,5 km (la descarga)
  ],
  slots: SLOTS2,
});
eq(trasDeload.gates.lastWeekKm, 8.5, 'la semana pasada fueron 8,5 km (la descarga)');
eq(trasDeload.gates.rampFromKm, 12, 'pero la referencia de la rampa son los 12 km de antes');
eq(trasDeload.weeklyKmTarget, 13.5, 'así que se reanuda el arco en 13,5 km, no en 9,5');
eq(trasDeload.phase, 'base', 'y la semana posterior a la descarga NO devuelve a run/walk');

// El suelo de 8 km se mide igual sobre las dos semanas: 6 + 0 sigue siendo run/walk.
eq(call({ history4w: [{ date: '2026-09-19', km: 3.0, min: 22, avgHR: 138 },
                      { date: '2026-09-16', km: 3.0, min: 22, avgHR: 138 }] }).gates.rampFromKm, 6,
  'con 6 km en dos semanas la referencia sigue por debajo del suelo');

// ── 5. Fase build: 3 semanas de base abren la puerta de la calidad ──────────────────
console.log('');
console.log('5. Fase build (3 semanas ISO consecutivas ≥15 km y ≥2/3 en Z2)');
const BUILD = [
  { date: '2026-09-02', km: 7.0, min: 49, avgHR: 140 },
  { date: '2026-09-05', km: 8.5, min: 60, avgHR: 142 },
  { date: '2026-09-09', km: 7.5, min: 52, avgHR: 141 },
  { date: '2026-09-12', km: 8.0, min: 56, avgHR: 143 },
  { date: '2026-09-16', km: 8.0, min: 56, avgHR: 140 },
  { date: '2026-09-19', km: 8.5, min: 59, avgHR: 142 },
];
const build = call({ history4w: BUILD, slots: SLOTS2 });
eq(build.gates.baseWeeks, 3, 'tres semanas de base contadas');
eq(build.phase, 'build', 'fase = build');
eq(build.gates.qualityUnlocked, true, 'gates.qualityUnlocked = true (END-004 satisfecho)');
const tipos = build.sessions.map(s => s.type);
yes(tipos.every(t => ['run-walk', 'Z2', 'long', 'easy-opt'].includes(t)),
  `PERO el motor NO genera la dura: tipos = ${JSON.stringify(tipos)} (la propone el coach)`);
yes(!/Z[45] HR/.test(build.sessions.map(s => s.dsl).join('\n')), 'y ningún DSL lleva Z4/Z5');
eq(build.weeklyKmTarget, 18.5, '16,5 km → 18,5 (+10 %, techo +20 % = 19,5)');
yes(byDow(build, 6).km <= 18.5 * 0.5 + 1e-9, `el largo sigue acotado al 50 % (${byDow(build, 6).km} km)`);
yes(byDow(build, 6).km >= 8.5, 'y crece respecto al largo anterior (8,5 km)');
yes(build.gates.decouplingOk === null, 'sin dato de decoupling → null, nunca false por comodidad');

const buildDl = call({ history4w: BUILD, slots: SLOTS2, block: DELOAD });
eq(buildDl.gates.qualityUnlocked, false, 'en descarga la puerta de la calidad se cierra (nunca duras en deload)');

// ── 6. ready10k: sólo con largo ≥8 km en Z2, deriva <5 % y ≥18 km/sem ───────────────
console.log('');
console.log('6. ready10k (los tres criterios, y ninguno se rellena)');
const READY = [
  { date: '2026-09-16', km: 5.5, min: 39, avgHR: 140 },
  { date: '2026-09-18', km: 5.5, min: 39, avgHR: 141 },
  { date: '2026-09-19', km: 8.2, min: 58, avgHR: 141, decoupling: 4.1 },
];
const ready = call({ history4w: READY, slots: SLOTS2 });
eq(ready.phase, 'ready10k', 'largo 8,2 km en Z2 + decoupling 4,1 % + 19,2 km/sem → ready10k');
eq(ready.gates.longestZ2Km, 8.2, 'el largo Z2 es 8,2 km');
eq(ready.gates.decouplingOk, true, 'y la deriva cumple (<5 %)');
yes(/8,2|4,1|10 km/.test(ready.reason), `la razón cita los números: "${ready.reason}"`);

const noDec = call({ history4w: READY.map(r => { const c = { ...r }; delete c.decoupling; return c; }), slots: SLOTS2 });
eq(noDec.gates.decouplingOk, null, 'sin decoupling → null (END-005: no se inventa)');
yes(noDec.phase !== 'ready10k', `y NO se declara listo (fase ${noDec.phase})`);
yes(/drift|decoupling/i.test([byDow(noDec, 6).note, noDec.reason, noDec.gates.decouplingNote].join(' ')),
  'se dice que falta el dato, en vez de callarlo');

const decBad = call({
  history4w: READY.map(r => (r.km === 8.2 ? { ...r, decoupling: 7.4 } : r)), slots: SLOTS2,
});
eq(decBad.gates.decouplingOk, false, 'deriva 7,4 % → false');
yes(decBad.phase !== 'ready10k', 'y tampoco es ready10k');

// Deriva por mitades cuando intervals.icu no trae `decoupling` (proxy declarado).
const halves = call({
  history4w: READY.map(r => (r.km === 8.2 ? { ...r, decoupling: null, avgHRHalves: [138, 141] } : r)),
  slots: SLOTS2,
});
eq(halves.gates.decouplingOk, true, 'deriva de FC por mitades (+3 bpm <5) sirve como proxy');

// ── 7. Bici / remo / ski no son kilómetros de carrera ───────────────────────────────
console.log('');
console.log('7. Bici, remo y ski: minutos aeróbicos, CERO km de carrera');
const conBici = BASE.concat([
  { date: '2026-09-17', km: 25, min: 60, avgHR: 132, modality: 'bike' },
  { date: '2026-09-18', km: 8, min: 35, avgHR: 138, modality: 'row' },
  { date: '2026-09-15', km: 6, min: 30, avgHR: 140, modality: 'ski' },
]);
const bici = call({ history4w: conBici, slots: SLOTS2 });
eq(bici.weeklyKmTarget, base2.weeklyKmTarget, '39 km de bici/remo/ski no mueven el objetivo semanal');
eq(bici.gates.longestZ2Km, base2.gates.longestZ2Km, 'ni el largo en Z2');
eq(bici.gates.z2Compliance, base2.gates.z2Compliance, 'ni el cumplimiento de Z2 de las carreras');
eq(call({ history4w: [{ date: '2026-09-19', km: 30, min: 70, avgHR: 130, modality: 'bike' }] }).phase,
  'run_walk', '30 km de bici no ascienden a nadie de fase');
eq(bici.gates.runCount, base2.gates.runCount, 'y el recuento de carreras no cambia');
yes(call({ history4w: BASE.concat([{ date: '2026-09-18', km: 7, min: 45, avgHR: 140, modality: 'treadmill' }]) })
  .gates.runCount === base2.gates.runCount + 1, 'la CINTA sí cuenta como carrera (impacto real)');

// ── 8. Invariantes que valen para todas las fases ───────────────────────────────────
console.log('');
console.log('8. Invariantes');
for (const [nombre, rw] of [['real', real], ['base', base2], ['base3', base3], ['build', build],
                            ['ready', ready], ['deload', dl], ['hint', hint]]) {
  yes(['run_walk', 'base', 'build', 'ready10k'].includes(rw.phase), `${nombre}: fase válida`);
  yes(Array.isArray(rw.ruleIds) && rw.ruleIds.length > 0, `${nombre}: cita Rule IDs`);
  yes(rw.ruleIds.every(r => /^[A-Z]{3,4}-\d{3}$/.test(r)), `${nombre}: con formato de Rule ID`);
  yes(typeof rw.weeklyMinTarget === 'number' && rw.weeklyMinTarget > 0, `${nombre}: weeklyMinTarget real`);
  yes(rw.sessions.every(s => s.hrCap === 143), `${nombre}: todas las sesiones con techo de FC 143`);
  yes(rw.sessions.every(s => s.source === 'rule'), `${nombre}: todas marcadas source:'rule'`);
  yes(rw.sessions.every(s => typeof s.dsl === 'string' && s.dsl.length > 0), `${nombre}: todas con DSL`);
  yes(rw.sessions.every(s => typeof s.note === 'string' && s.note.length > 0), `${nombre}: todas con nota`);
  yes(rw.sessions.every(s => !/Z[345] HR/.test(s.dsl)), `${nombre}: ninguna sesión dura generada`);
  const g = rw.gates;
  yes(g && typeof g.z2Compliance === 'number' && typeof g.baseWeeks === 'number'
      && typeof g.qualityUnlocked === 'boolean' && typeof g.longestZ2Km === 'number'
      && (g.decouplingOk === null || typeof g.decouplingOk === 'boolean'),
    `${nombre}: gates completo y con tipos honestos`);
}
eq(real.weeklyKmTarget, null, 'run_walk nunca trae km');
const soloUnSlot = call({ history4w: REAL, slots: [{ dow: 3, base: 30, subtype: 'zone2' }] });
eq(soloUnSlot.sessions.length, 1, 'variante de viaje (1 slot) → 1 sesión, sin inventar días');
eq(byDow(soloUnSlot, 3).min, 35, "y progresa desde la base del slot (30' → 35'), no desde 40'");


// ── v11.70 (L-2) · aplicar un plan del coach NO apaga el motor de run/walk ────────────────
console.log('');
console.log('v11.70 · la puerta del fallback de carrera: coach por DÍA, regla si no, `running.plan[]` para la semana entera');
{
  const _yes = (c, m) => { if (c) console.log(`  ok   ${m}`); else { console.log(`  FAIL ${m}`); failed++; } };
  const APPSRC = readFileSync('app/app.js', 'utf8');
  _yes(!/if \(!\(activePlan && activePlan\.running\)\) await _applyRunningWeekFallback/.test(APPSRC), 'la puerta ya no es `activePlan.running` (que el esquema del coach rellena SIEMPRE)');
  _yes(/function _coachRunningPlanIsCurrent\(\)/.test(APPSRC) && /!Array\.isArray\(r\.plan\) \|\| !r\.plan\.length/.test(APPSRC), '_coachRunningPlanIsCurrent(): sólo un running.plan[] vigente se queda la semana entera');
  _yes(/function _coachCardioSlot\(jsDay\)/.test(APPSRC) && /_coachPlanTargetsAreCurrent\(\) \? c : null/.test(APPSRC), '_coachCardioSlot(): el cardio del coach del día, con la misma ventana de vigencia que los kg (E-4)');
  const runBranch = APPSRC.slice(APPSRC.indexOf("if (slot.type === 'run') {"), APPSRC.indexOf("if (slot.type === 'recovery') {"));
  _yes(/out\.distanceKm = Number\(cc\.distanceKm\)/.test(runBranch) && /out\.hrZone = cc\.hrZone/.test(runBranch) && /out\.summary = cc\.note/.test(runBranch), 'los km, la zona y la nota del coach se pintan en la tarjeta del día');
  _yes(/else if \(!_coachRunningPlanIsCurrent\(\)\) \{\s*await _applyRunningWeekFallback/.test(runBranch), 'sin cardio del coach para el día, la regla decide la fase (run/walk)');
}

console.log('');
console.log(failed === 0
  ? '✅ Carrera hacia el 10k: tiempo mientras la FC no cumple, km cuando cumple, cero duras sin base.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
