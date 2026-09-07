// Coach v2 — incremento 6: progreso contra objetivos (`goalProgress`, v11.60).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. La tarjeta "Objetivos" es la primera pantalla
// que dice "vas a llegar al peso X el día Y" y "la fuerza se mantiene". Las tres formas de
// que eso sea mentira:
//
//   · **ETA inventado sin pendiente.** Con 5 pesadas en dos semanas no hay pendiente, y sin
//     pendiente no hay fecha. Un "80 kg en 9 semanas" calculado sobre ruido es peor que un
//     "no hay señal": el usuario aprieta el déficit por un número que no existía.
//   · **"Mantenida" sin ventana.** Decir que el sumo se mantiene cuando no se ha tocado en
//     seis semanas es afirmar sobre la nada. Sin exposición en las dos ventanas
//     (últimos 14 d y −42..−28 d) el veredicto es `null`, no `true`.
//   · **Tasa demasiado rápida que pasa el filtro.** −0,9 kg/semana con 87 kg y déficit
//     abierto es pérdida de masa magra (REC-002). Si el estado lo pinta como "en rumbo"
//     porque baja, el sistema premia justo lo que tiene que frenar.
//
// Y dos más específicas de este proyecto:
//   · La pendiente se calcula sobre la MEDIA de 7 días, no sobre pesadas crudas: una cena
//     salada mueve 1,2 kg en un día y decidiría el déficit de la semana.
//   · El largo "de 10k" cuenta sólo si fue EN Z2. Una carrera de 4,8 km a 152 bpm no es
//     progreso hacia un 10k cómodo; es la misma carrera de siempre, más larga.
//
// Ejecutar desde la raíz del repo: node tests/verify-goal-progress.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/coach-engine.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));
const near = (got, want, tol, m) =>
  (got != null && Math.abs(Number(got) - Number(want)) <= tol
    ? ok(`${m} (${got})`)
    : bad(`${m} — esperaba ${want}±${tol}, obtuve ${got}`));
const between = (got, lo, hi, m) =>
  (got != null && Number(got) >= lo && Number(got) <= hi
    ? ok(`${m} (${got})`)
    : bad(`${m} — esperaba ${lo}..${hi}, obtuve ${got}`));

const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(SRC).runInContext(sandbox);
const E = sandbox.module.exports;

if (!E || typeof E.goalProgress !== 'function') {
  console.log('FAIL — coach-engine.js no exporta goalProgress');
  process.exit(1);
}

const TODAY = '2026-09-23';
const GOALS = E.COACH_GOALS_DEFAULT;
const ZONES = { z2: [131, 143] };

// `estimate1RM` de app.js, replicada aquí: el motor recibe la fórmula, no la importa (puro).
const e1rm = (w, reps) => {
  if (!w || !reps || reps <= 0) return 0;
  if (reps === 1) return w;
  return Math.round(w * (1 + reps / 30) * 10) / 10;
};

const shift = (ds, days) => {
  const [y, m, d] = ds.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
};

// Serie diaria de pesadas: `endKg` hoy y una pendiente de `kgPerWeek` (negativa = pérdida).
const serie = (endKg, kgPerWeek, days) => {
  const out = [];
  for (let i = 0; i < days; i++) {
    out.push({ date: shift(TODAY, -i), kg: Math.round((endKg - (kgPerWeek / 7) * i) * 10) / 10 });
  }
  return out;
};

const facts = (o) => Object.assign({
  today: TODAY, bodyweight: [], runs4w: [], zones: ZONES, workouts8w: [], e1rm,
}, o);

// ── 1. Pendiente y ETA sobre la media de 7 días ─────────────────────────────────────
console.log('1. Peso: 87,1 → 85,4 en 28 días de pesadas diarias');
const A = E.goalProgress(GOALS, facts({ bodyweight: serie(85.4, -0.4407, 35) }));
eq(A.weight.status, 'on-track', 'estado = on-track (−0,75 … −0,30 kg/sem)');
near(A.weight.trend7d, 85.6, 0.1, 'media de 7 días');
near(A.weight.slope, -0.42, 0.05, 'pendiente kg/semana sobre la media de 7 d');
between(A.weight.etaWeeks, 10, 12, 'ETA a 81 kg (alto de la banda objetivo)');
between(A.weight.etaMilestoneWeeks, 7.5, 9.5, 'ETA al hito de 82 kg');
yes(/pesadas/.test(A.weight.text), `el texto declara el tamaño de muestra: "${A.weight.text}"`);
yes(/85,6|85,5|85,7/.test(A.weight.text), 'y la media con coma decimal (castellano)');
yes(/82/.test(A.weight.text), 'y el hito de 82 kg');
yes(!(A.signals || []).some(s => s.id === 'rate-too-fast'), '−0,42 kg/sem no dispara rate-too-fast');
yes(!(A.signals || []).some(s => s.id === 'weight-at-target'), 'ni weight-at-target a 85,6 kg');

// ── 2. Estancamiento: plano, pero con ventana suficiente ────────────────────────────
console.log('');
console.log('2. Plano 21+ días con pesadas diarias');
const B = E.goalProgress(GOALS, facts({ bodyweight: serie(86.0, 0, 28) }));
eq(B.weight.status, 'stalled', 'estado = stalled');
eq(B.weight.etaWeeks, null, 'sin pérdida no hay ETA (no se inventa una fecha)');
eq(B.weight.etaMilestoneWeeks, null, 'ni ETA al hito');
yes((B.signals || []).some(s => s.id === 'stalled-3w'), 'dispara la señal stalled-3w');
yes((B.signals || []).find(s => s.id === 'stalled-3w').severity === 'flag', 'y es un aviso, no info');

// Plano pero con pocos días: NO es un estancamiento, es falta de ventana.
const B2 = E.goalProgress(GOALS, facts({ bodyweight: serie(86.0, 0, 10) }));
yes(B2.weight.status !== 'stalled', `10 días planos no son estancamiento (estado ${B2.weight.status})`);
yes(!(B2.signals || []).some(s => s.id === 'stalled-3w'), 'y no dispara stalled-3w');

// ── 3. Demasiado rápido (REC-002) ───────────────────────────────────────────────────
console.log('');
console.log('3. −0,9 kg/semana');
const C = E.goalProgress(GOALS, facts({ bodyweight: serie(84.0, -0.9, 35) }));
eq(C.weight.status, 'fast', 'estado = fast (< −0,75 kg/sem)');
near(C.weight.slope, -0.9, 0.06, 'la pendiente lo confirma');
const rtf = (C.signals || []).find(s => s.id === 'rate-too-fast');
yes(!!rtf, 'dispara rate-too-fast');
eq(rtf && rtf.severity, 'flag', 'como aviso');
yes(/0,9|0,8|1,0/.test(rtf.text), `con la cifra dentro: "${rtf.text}"`);
yes(C.weight.etaWeeks != null, 'el ETA existe (hay pendiente), pero el estado avisa de que sobra prisa');

// ── 4. Datos insuficientes: ni estado ni ETA ────────────────────────────────────────
console.log('');
console.log('4. Cinco pesadas en dos semanas');
const D = E.goalProgress(GOALS, facts({
  bodyweight: [1, 3, 6, 9, 12].map(i => ({ date: shift(TODAY, -i), kg: 86.5 - i * 0.05 })),
}));
eq(D.weight.status, 'insufficient', 'estado = insufficient (<7 pesadas en 14 días)');
eq(D.weight.etaWeeks, null, 'ETA = null');
eq(D.weight.etaMilestoneWeeks, null, 'ETA al hito = null');
yes(/5 pesada/.test(D.weight.text), `y el texto dice cuántas hay: "${D.weight.text}"`);
eq(E.goalProgress(GOALS, facts({})).weight.status, 'insufficient', 'sin pesadas, tampoco se inventa nada');
eq(E.goalProgress(GOALS, facts({})).weight.trend7d, null, 'y la media de 7 d es null, no 0');

// ── 5. Objetivo y hito alcanzados ───────────────────────────────────────────────────
console.log('');
console.log('5. Banda objetivo (79-81) y hito (82)');
const F = E.goalProgress(GOALS, facts({ bodyweight: serie(81.8, 0, 24) }));
yes((F.signals || []).some(s => s.id === 'milestone-reached'), 'media 81,8 → milestone-reached (≤82)');
yes(!(F.signals || []).some(s => s.id === 'weight-at-target'), 'pero todavía NO weight-at-target (>81)');
const G = E.goalProgress(GOALS, facts({ bodyweight: serie(80.6, 0, 24) }));
eq(G.weight.status, 'at-target', 'media 80,6 → estado at-target (dentro de la banda)');
yes((G.signals || []).some(s => s.id === 'weight-at-target'), 'y la señal weight-at-target');
yes((G.signals || []).find(s => s.id === 'weight-at-target').severity === 'info',
  'que es informativa: llegar no es un problema');

// ── 6. Fuerza mantenida: dos ventanas o `null` ──────────────────────────────────────
console.log('');
console.log('6. Anclas de fuerza (mejor e1RM de 14 d vs mejor de −42..−28 d)');
const WK = [
  { date: '2026-09-18', unit: 'kg', exercises: [
    { exerciseId: 'bench-press', sets: [{ weight: 92.5, reps: 5, done: true }, { weight: 92.5, reps: 4, done: true }] },
    { exerciseId: 'back-squat', sets: [{ weight: 112.5, reps: 5, done: true }] },
    { exerciseId: 'ohp', sets: [{ weight: 56, reps: 5, done: true }] },
  ] },
  { date: '2026-08-19', unit: 'kg', exercises: [
    { exerciseId: 'bench-press', sets: [{ weight: 96, reps: 5, done: true }] },
    { exerciseId: 'back-squat', sets: [{ weight: 120, reps: 5, done: true }] },
    { exerciseId: 'ohp', sets: [{ weight: 60, reps: 5, done: true }] },
  ] },
  // El sumo se hizo hace 20 días: fuera de las DOS ventanas. No hay veredicto posible.
  { date: '2026-09-03', unit: 'kg', exercises: [
    { exerciseId: 'sumo-dl', sets: [{ weight: 140, reps: 5, done: true }] },
  ] },
];
const H = E.goalProgress(GOALS, facts({ workouts8w: WK, bodyweight: serie(85.4, -0.4407, 35) }));
const an = (id) => (H.strength.anchors || []).find(a => a.id === id) || {};
eq((H.strength.anchors || []).length, 6, 'las seis anclas de goals.preserve.anchorLifts, siempre');
near(an('bench-press').e1rmNow, 107.9, 0.2, 'banca: e1RM de hoy (92,5×5)');
near(an('bench-press').e1rm4wAgo, 112.0, 0.2, 'banca: e1RM de hace 4 semanas (96×5)');
near(an('bench-press').pct, -3.7, 0.3, 'banca: −3,7 %');
eq(an('bench-press').maintained, true, 'banca MANTENIDA (pct ≥ −5 %)');
eq(an('sumo-dl').e1rmNow, null, 'sumo: sin exposición en 14 días → e1rmNow null');
eq(an('sumo-dl').maintained, null, 'sumo: veredicto null, NUNCA true (no se afirma sobre la nada)');
eq(an('barbell-row').maintained, null, 'remo con barra: sin datos → null');
near(an('back-squat').pct, -6.2, 0.3, 'sentadilla: −6,2 %');
eq(an('back-squat').maintained, false, 'sentadilla NO mantenida');
near(an('ohp').pct, -6.7, 0.3, 'press militar: −6,7 %');
eq(H.strength.allMaintained, false, 'allMaintained = false (dos anclas por debajo)');
const sd = (H.signals || []).find(s => s.id === 'strength-drop');
yes(!!sd, 'dispara strength-drop');
eq(sd && sd.severity, 'flag', 'como aviso');
yes(/2/.test(sd.text), `y dice cuántas anclas cayeron: "${sd.text}"`);
yes(/\/6/.test(H.strength.text), `el texto es "mantenidas n/6": "${H.strength.text}"`);

const H0 = E.goalProgress(GOALS, facts({ workouts8w: [] }));
eq(H0.strength.allMaintained, null, 'sin ninguna sesión → allMaintained null (no "todo bien")');
yes(!(H0.signals || []).some(s => s.id === 'strength-drop'), 'y sin señal de caída');

// ── 7. Indicador de 10k: el largo cuenta sólo si fue en Z2 ──────────────────────────
console.log('');
console.log('7. readinessFor10k (indicador declarado, no una dosis)');
const RUNS = [
  { date: '2026-09-16', km: 4.8, min: 33, avgHR: 152 },   // el más largo, pero FUERA de Z2
  { date: '2026-09-17', km: 1.8, min: 13, avgHR: 150 },
  { date: '2026-09-19', km: 2.4, min: 18, avgHR: 140 },   // el largo EN Z2
];
const R = E.goalProgress(GOALS, facts({ runs4w: RUNS }));
eq(R.running.longestZ2Km, 2.4, 'largo en Z2 = 2,4 km (los 4,8 a 152 bpm no cuentan)');
eq(R.running.weeklyKm, 9, 'km de la última semana ISO completa = 9');
eq(R.running.z2Compliance, 1, '1 de las 3 últimas en Z2');
eq(R.running.z2Sample, 3, 'sobre una muestra de 3');
near(R.running.readinessFor10k, 0.37, 0.03,
  '0,5·min(2,4/8,1) + 0,3·min(9/18,1) + 0,2·(1/3)');
eq(R.running.decouplingOk, null, 'sin decoupling → null');
eq(R.running.phase, 'run_walk', 'y la fase sigue siendo trote/caminata');
yes(/2,4|9|indicador/.test(R.running.text), `el texto lleva los números: "${R.running.text}"`);
yes(!(R.signals || []).some(s => s.id === 'long-run-8k'), 'sin largo de 8 km, sin señal long-run-8k');

const RB = E.goalProgress(GOALS, facts({
  runs4w: [
    { date: '2026-09-16', km: 5.5, min: 39, avgHR: 140 },
    { date: '2026-09-18', km: 5.5, min: 39, avgHR: 141 },
    { date: '2026-09-19', km: 8.2, min: 58, avgHR: 141, decoupling: 4.1 },
  ],
}));
eq(RB.running.longestZ2Km, 8.2, 'largo Z2 de 8,2 km');
yes((RB.signals || []).some(s => s.id === 'long-run-8k'), 'dispara long-run-8k');
eq(RB.running.decouplingOk, true, 'y el decoupling de 4,1 % cumple');
near(RB.running.readinessFor10k, 1, 0.02, 'los tres términos al tope → el indicador llega a 1');
yes(RB.running.readinessFor10k <= 1, 'y nunca pasa de 1');
eq(E.goalProgress(GOALS, facts({})).running.readinessFor10k, 0,
  'sin carreras el indicador es 0, no null (cero es un dato; el texto lo explica)');

// ── 8. quality-unlocked llega a las señales del coach ───────────────────────────────
console.log('');
console.log('8. quality-unlocked (la propone el coach, no el motor)');
const Q = E.goalProgress(GOALS, facts({
  runs4w: [
    { date: '2026-09-02', km: 7.0, min: 49, avgHR: 140 },
    { date: '2026-09-05', km: 8.5, min: 60, avgHR: 142 },
    { date: '2026-09-09', km: 7.5, min: 52, avgHR: 141 },
    { date: '2026-09-12', km: 8.0, min: 56, avgHR: 143 },
    { date: '2026-09-16', km: 8.0, min: 56, avgHR: 140 },
    { date: '2026-09-19', km: 8.5, min: 59, avgHR: 142 },
  ],
}));
eq(Q.running.phase, 'build', 'tres semanas de base → fase build');
const qu = (Q.signals || []).find(s => s.id === 'quality-unlocked');
yes(!!qu, 'dispara quality-unlocked');
eq(qu && qu.severity, 'info', 'informativa: es una puerta abierta, no una prescripción');
yes(/dura|calidad/i.test(qu.text), `y lo dice así: "${qu.text}"`);

// ── 9. Forma del retorno ────────────────────────────────────────────────────────────
console.log('');
console.log('9. Forma del retorno y textos');
for (const [nombre, gp] of [['on-track', A], ['stalled', B], ['fast', C], ['insufficient', D],
                            ['fuerza', H], ['carrera', R]]) {
  yes(gp.weight && gp.running && gp.strength && Array.isArray(gp.signals),
    `${nombre}: {weight, running, strength, signals}`);
  yes(['at-target', 'on-track', 'slow', 'stalled', 'fast', 'insufficient'].includes(gp.weight.status),
    `${nombre}: estado del peso válido (${gp.weight.status})`);
  yes(typeof gp.weight.text === 'string' && gp.weight.text.length > 0, `${nombre}: texto de peso`);
  yes(typeof gp.running.text === 'string' && gp.running.text.length > 0, `${nombre}: texto de carrera`);
  yes(typeof gp.strength.text === 'string' && gp.strength.text.length > 0, `${nombre}: texto de fuerza`);
  yes(gp.signals.every(s => s.id && (s.severity === 'info' || s.severity === 'flag') && s.text),
    `${nombre}: señales con {id, severity, text}`);
  yes(!/\d+\.\d/.test([gp.weight.text, gp.running.text, gp.strength.text].join(' ')),
    `${nombre}: sin puntos decimales en pantalla (el castellano usa coma)`);
  yes(!/[A-Z]{3}-\d{3}/.test([gp.weight.text, gp.running.text, gp.strength.text].join(' ')),
    `${nombre}: sin Rule IDs crudos en los textos (§B.9)`);
}

console.log('');
console.log(failed === 0
  ? '✅ Objetivos: pendiente sobre la media de 7 d, ETA sólo con pendiente, "mantenida" sólo con ventana.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
