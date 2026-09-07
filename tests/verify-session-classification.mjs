// Clasificación de sesiones DESDE EL DATO (incremento 4, v11.58).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (F-7 del audit 2026-09-05): `toSession`
// clasificaba por regex sobre el id de la sesión — `/low|leg|squat|dead|hinge|glute/` → lower,
// `/upper|push|pull|bench|press/` → upper, y TODO LO DEMÁS → `strength.maintenance` con peso 1.
// Sobre las claves reales del plan eso se equivoca en 6 de 9: `fullA`, `fullB`, `travelA`,
// `travelB`, `hybrid1` y la sesión libre `free` caían en `maintenance`, peso 1. Consecuencias
// medidas en el audit:
//
//   · un día full-body nunca era `hard`, así que el advisory NUNCA proponía recuperación con la
//     recuperación en rojo: caía al `else` final ("Recuperación y carga ok — mantené"), justo lo
//     contrario de lo que toca;
//   · `hybrid1` nunca salía con familia `hybrid`, así que el flag HYB-002 era inalcanzable y la
//     rama `replace` del advisory (dos señales concordantes) no existía en la práctica;
//   · el presupuesto de días duros infra-contaba las semanas de viaje y las comprimidas
//     (`travelA/B` valen 1,5 y `fullA/B` valen 2 en `IDEAL_BLOCK_V1`, no 1).
//
// La clasificación tiene que salir del dato que YA existe: `IDEAL_BLOCK_V1.variants[*].days[]`
// declara `planRef`, `kind`, `subtype` y `bw` de cada sesión del plan. La regex se queda sólo
// como último recurso, y cuando se usa avisa (`console.warn`) para que no vuelva a decidir en
// silencio.
//
// Ejecutar desde la raíz del repo: node tests/verify-session-classification.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync('app/app.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

const slice = (from, to, label) => {
  const i = APP.indexOf(from);
  const j = APP.indexOf(to, i + from.length);
  if (i < 0 || j < 0) { console.log(`FAIL — no se pudo extraer ${label}`); process.exit(1); }
  return APP.slice(i, j);
};

const PLAN_SRC   = slice('const RAMP_NOTE = ', '\n// Rolling number animation', 'RAMP_NOTE + PLAN');
const TYPES_SRC  = slice('const SESSION_TYPES = {', '\n// Map a legacy WEEK_TEMPLATE', 'SESSION_TYPES');
const ADAPT_SRC  = slice('function sessionSubtypeMeta(', '\n// ==================== DYNAMIC PLAN SYSTEM',
  'sessionSubtypeMeta + SESSION_CLASS + toSession');
const IDEAL_SRC  = slice('const IDEAL_BLOCK_V1 = {', '\n// RETIRADO en v11.38', 'IDEAL_BLOCK_V1');
const STRESS_SRC = slice('function classifySessionStress(', '\n// WHOOP recovery context', 'classifySessionStress');

// ── Sandbox ────────────────────────────────────────────────────────────────────────────
const warns = [];
const ctx = {
  console: { log: console.log, info() {}, warn: (...a) => warns.push(a.map(String).join(' ')) },
};
vm.createContext(ctx);
vm.runInContext(`
  var state = { settings: {} };
  ${PLAN_SRC}
  ${TYPES_SRC}
  ${ADAPT_SRC}
  ${IDEAL_SRC}
  ${STRESS_SRC}
  globalThis.PLAN = PLAN;
  globalThis.SESSION_TYPES = SESSION_TYPES;
  globalThis.IDEAL_BLOCK_V1 = IDEAL_BLOCK_V1;
  globalThis.toSession = toSession;
  globalThis.classifySessionStress = classifySessionStress;
  globalThis.sessionClassMap = typeof sessionClassMap === 'function' ? sessionClassMap : null;
`, ctx);

const { toSession, classifySessionStress, PLAN, SESSION_TYPES, IDEAL_BLOCK_V1 } = ctx;
const rec = (session) => ({ id: 'w1', date: '2026-09-07', session, exercises: [] });
const cls = (session) => { warns.length = 0; const s = toSession(rec(session), 'workouts'); return { s, warns: warns.slice() }; };

// ── 1. El mapa existe y se construye desde el IDEAL ────────────────────────────────────
console.log('1. SESSION_CLASS se construye desde IDEAL_BLOCK_V1');
const TOSESSION_SRC = slice('function toSession(record, originStore) {', '\n// ==================== DYNAMIC PLAN SYSTEM', 'toSession');
yes(/SESSION_CLASS/.test(TOSESSION_SRC), 'toSession usa la tabla SESSION_CLASS');
yes(typeof ctx.sessionClassMap === 'function', 'existe el constructor perezoso del mapa');
const MAP = ctx.sessionClassMap ? ctx.sessionClassMap() : {};
const planRefs = [];
for (const v of Object.values(IDEAL_BLOCK_V1.variants)) {
  for (const d of v.days) if (d.planRef) planRefs.push(d.planRef);
}
yes(planRefs.length >= 8, `el IDEAL declara ${planRefs.length} planRef (esperaba >= 8)`);
yes(planRefs.every(id => MAP[id]), 'todos los planRef del IDEAL están en el mapa');

// ── 2. Ninguna sesión real cae al fallback ─────────────────────────────────────────────
console.log('');
console.log('2. Ninguna clave de PLAN.sessions ni planRef del IDEAL cae en la regex');
const ids = Array.from(new Set([...Object.keys(PLAN.sessions), ...planRefs, 'free']));
eq(ids.length, 10, 'se recorren 10 ids (9 del plan + la sesión libre)');
const fellBack = [];
for (const id of ids) {
  const r = cls(id);
  if (r.warns.length) fellBack.push(`${id} → ${r.s.sessionType}`);
}
yes(fellBack.length === 0, fellBack.length
  ? `cayeron al fallback: ${fellBack.join(', ')}`
  : 'ninguna cayó al fallback (0 console.warn)');
const maintenance = ids.filter(id => cls(id).s.subtype === 'maintenance');
yes(maintenance.length === 0, maintenance.length
  ? `siguen clasificadas como maintenance: ${maintenance.join(', ')}`
  : 'ninguna se clasifica como strength.maintenance (era el bug: 6 de 9)');

// ── 3. Los valores concretos que el audit exige ────────────────────────────────────────
console.log('');
console.log('3. Familia, subtipo y peso por sesión');
const expect = {
  lowerA:  ['strength', 'lower', 2],
  lowerB:  ['strength', 'lower', 2],
  upperA:  ['strength', 'upper', 1],
  upperB:  ['strength', 'upper', 1],
  fullA:   ['strength', 'full', 2],
  fullB:   ['strength', 'full', 2],
  travelA: ['strength', 'full', 1.5],
  travelB: ['strength', 'full', 1.5],
  hybrid1: ['hybrid', 'strength_endurance', 2],
  free:    ['strength', 'full', 2],
};
for (const [id, [family, subtype, bw]] of Object.entries(expect)) {
  const s = cls(id).s;
  eq(`${s.family}/${s.subtype}/${s.budgetWeight}`, `${family}/${subtype}/${bw}`, `${id}`);
}
eq(cls('fullA').s.sessionType, 'strength.full', 'fullA → sessionType strength.full');
eq(cls('hybrid1').s.sessionType, 'hybrid.strength_endurance', 'hybrid1 → sessionType hybrid.strength_endurance');

// ── 4. El presupuesto y el nivel de estrés se mueven con la clasificación ───────────────
console.log('');
console.log('4. classifySessionStress: un full-body es un día exigente');
const stress = (sessionId) => classifySessionStress({ type: 'gym', sessionId, name: sessionId, exercises: [] });
eq(stress('fullA').level, 'hard', 'fullA → level hard (antes moderate → nunca recuperación con rojo)');
eq(stress('hybrid1').family, 'hybrid', 'hybrid1 → family hybrid (flag HYB-002 alcanzable)');
eq(stress('hybrid1').level, 'hard', 'hybrid1 → level hard');
eq(stress('travelA').level, 'moderate', 'travelA → moderate (peso 1,5)');
eq(stress('lowerA').level, 'hard', 'lowerA → hard (sin cambio)');
eq(stress('upperA').level, 'moderate', 'upperA → moderate (sin cambio)');

// ── 5. Invariantes: los pesos de SESSION_TYPES no se tocan ─────────────────────────────
console.log('');
console.log('5. Invariantes de SESSION_TYPES');
eq(SESSION_TYPES.strength.subtypes.full.budgetWeight, 2, 'strength.full existe y pesa 2');
eq(SESSION_TYPES.strength.subtypes.lower.budgetWeight, 2, 'strength.lower sigue pesando 2');
eq(SESSION_TYPES.strength.subtypes.upper.budgetWeight, 1, 'strength.upper sigue pesando 1');
eq(SESSION_TYPES.hybrid.subtypes.strength_endurance.budgetWeight, 2, 'hybrid.strength_endurance sigue pesando 2');

// ── 6. El snapshot del registro manda; un id desconocido avisa ─────────────────────────
console.log('');
console.log('6. Snapshot del registro y fallback ruidoso');
warns.length = 0;
const snap = toSession({ id: 'w2', date: '2026-09-07', session: 'lo-que-sea', family: 'hybrid', subtype: 'benchmark', exercises: [] }, 'workouts');
eq(`${snap.family}/${snap.subtype}`, 'hybrid/benchmark', 'un registro con family+subtype se respeta tal cual');
eq(snap.budgetWeight, 3, 'y su peso sale de SESSION_TYPES (hybrid.benchmark = 3)');
yes(warns.length === 0, 'el snapshot no dispara el fallback');

warns.length = 0;
const snapBw = toSession({ id: 'w3', date: '2026-09-07', session: 'fullA', family: 'strength', subtype: 'full', budgetWeight: 1.5, exercises: [] }, 'workouts');
eq(snapBw.budgetWeight, 1.5, 'un budgetWeight explícito en el registro gana al lookup');

warns.length = 0;
const unknown = toSession({ id: 'w4', date: '2026-09-07', session: 'xyz', exercises: [] }, 'workouts');
eq(warns.length, 1, "un id desconocido ('xyz') avisa UNA vez");
yes(/\[toSession\] fallback regex/.test(warns[0] || ''), 'el aviso identifica el fallback');
yes(/xyz/.test(warns[0] || ''), 'y nombra el id que no supo clasificar');
eq(`${unknown.family}/${unknown.subtype}`, 'strength/maintenance', 'el fallback sigue devolviendo algo usable');

warns.length = 0;
eq(toSession({ id: 'w5', date: '2026-09-07', session: 'legDay2019', exercises: [] }, 'workouts').subtype, 'lower',
  'la regex sigue reconociendo un id legacy de pierna');
eq(warns.length, 1, 'y también avisa (la regex ya no decide en silencio)');

// ── 7. Los otros stores no cambian ─────────────────────────────────────────────────────
console.log('');
console.log('7. runs / mobility / registros nuevos no se tocan');
const run = toSession({ id: 'r1', date: '2026-09-07', distance: 8, avgPace: '5:30', duration: 44, intensityLabel: 'Easy Run' }, 'runs');
eq(`${run.family}/${run.subtype}/${run.budgetWeight}`, 'cardio/zone2/0.5', 'una carrera fácil sigue siendo cardio.zone2 peso 0,5');
const mob = toSession({ id: 'm1', date: '2026-09-07', routineId: 'hip', routineName: 'Caderas', durationMin: 20 }, 'mobility_sessions');
eq(`${mob.family}/${mob.subtype}/${mob.budgetWeight}`, 'recovery/mobility/0', 'una sesión de movilidad sigue pesando 0');
const nuevo = toSession({ id: 's1', date: '2026-09-07', sessionType: 'cardio.zone2', family: 'cardio', subtype: 'zone2', modality: 'bike' }, 'sessions');
eq(nuevo.budgetWeight, 0.5, 'un registro nuevo con sessionType+family conserva su envoltorio');

console.log('');
console.log(failed === 0
  ? '✅ La clasificación sale del dato: 10 sesiones, 0 fallbacks, pesos del IDEAL.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
