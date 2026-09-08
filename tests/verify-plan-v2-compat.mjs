// Compatibilidad del plan v2: qué fila del store `plans` es el plan VIVO.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR: que una PROPUESTA del coach, o una versión
// vieja, acabe siendo el plan que arranca la sesión de mañana. Son tres formas distintas de
// que ocurra, y las tres son silenciosas:
//
//   1. **Una propuesta escrita en `plans`.** Es la razón de que las propuestas vivan en
//      `coach_reviews`: el invariante de la app es "plan activo = versión más alta"
//      (`loadActivePlan`, sin cambios de criterio desde v10). Cualquier fila nueva en `plans`
//      ES el plan vivo en todos los dispositivos, incluidos los que corren código viejo y no
//      saben leer `status:'proposed'`. Con 21 versiones ya existentes, un `status` que sólo
//      entiende el código nuevo no es una salvaguarda: es una bomba de relojería.
//   2. **`plan_vNaN`.** `createNewPlanVersion` calcula `max(version) + 1`. Con una fila sin
//      `version` (las hay: las primeras del abril de 2026) `Math.max` devuelve `NaN` si el
//      reduce no lo defiende, y el id resultante (`plan_vNaN`) ordena mal, colisiona con el
//      siguiente `NaN` y sobrescribe el plan del usuario.
//   3. **`meta` pisando la identidad.** El plan v2 estampa `author`/`weekKey`/`status` por
//      `modifications.meta`. Si el spread va DESPUÉS de `id`/`version`/`createdAt`, un
//      `meta.version` de una propuesta se convierte en el plan vivo. El orden es el test.
//
// Y dos invariantes de `mergeProposal` que ya han costado un bug antes:
//   · Las sesiones NO tocadas salen `JSON.stringify`-idénticas. Una propuesta que sólo habla
//     de Upper B no puede reescribir en silencio el resto de la semana.
//   · El `warmup` se cae de las sesiones que el coach toca, para que los arreglos de
//     calentamiento sigan llegando por `PLAN_REV` (`startWorkout` cae a `PLAN.sessions[id]`).
//
// Más una fila v1 pura (sin `schema`, sin `status`, sin `weekKey`) que sigue resolviendo en un
// lookup tipo `getPlannedSessionForDate`: la compatibilidad hacia atrás no es teórica, es la
// fila que el iPhone tiene guardada ahora mismo.
//
// Ejecutar desde la raíz del repo: node tests/verify-plan-v2-compat.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync('app/app.js', 'utf8');
const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const FACTS = readFileSync('app/coach-facts.js', 'utf8');

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want),
  `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

// ── coach-facts.js en el mismo orden que index.html (engine primero) ────────────────
const fsb = { module: { exports: {} }, console };
fsb.exports = fsb.module.exports;
vm.createContext(fsb);
new vm.Script(ENGINE).runInContext(fsb);
fsb.module = { exports: {} };
fsb.exports = fsb.module.exports;
new vm.Script(FACTS).runInContext(fsb);
const { mergeProposal, diffPlanVersions, stableStringify } = fsb.module.exports;

// ── Trozos reales de app.js: loadActivePlan y createNewPlanVersion ─────────────────
function slice(fromAnchor, toAnchor, label) {
  const i = APP.indexOf(fromAnchor);
  const j = APP.indexOf(toAnchor, i + fromAnchor.length);
  if (i < 0 || j < 0) { console.log(`FAIL — no se pudo extraer ${label}`); process.exit(1); }
  return APP.slice(i, j);
}
const LOAD_SRC = slice('async function loadActivePlan()', '// Load exercise library into memory', 'loadActivePlan');
// v11.66 (E-12): el ancla de cierre era `// ==== RE-ENTRY RAMP`, el bloque de la rampa de
// re-entrada que se borró por muerto. Ahora cierra en la sección de la base de datos.
const CNP_SRC = slice('async function createNewPlanVersion(modifications)', '// ==================== DATABASE ====================', 'createNewPlanVersion');

const store = { plans: [] };
const written = [];
const ctx = {
  console,
  dbGetAll: async (s) => (store[s] || []).map(r => JSON.parse(JSON.stringify(r))),
  smartPut: async (s, data) => { written.push([s, data]); store[s] = (store[s] || []).filter(r => r.id !== data.id).concat([data]); },
  PLAN: { sessions: { upperA: { id: 'upperA', name: 'Upper A' } } },
  WEEK_TEMPLATE: { 0: { type: 'rest' }, 1: { type: 'gym', session: 'upperA' } },
  getWeekNumber: () => 37,
};
vm.createContext(ctx);
vm.runInContext(`
  var activePlan = null;
  var activeWeekTemplate = null;
  ${LOAD_SRC}
  ${CNP_SRC}
  globalThis.loadActivePlan = loadActivePlan;
  globalThis.createNewPlanVersion = createNewPlanVersion;
  globalThis._active = () => activePlan;
  globalThis._tpl = () => activeWeekTemplate;
`, ctx);

const setPlans = (rows) => { store.plans = JSON.parse(JSON.stringify(rows)); };

// Sesiones de referencia con la forma real (incluye `warmup`, que es el campo que se cae).
const SESSIONS = {
  upperA: {
    id: 'upperA', name: 'Upper A', subtitle: 'Horizontal Press', icon: '🏋️',
    warmup: ['Banda 2×15', 'Barra vacía 10'],
    exercises: [
      { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', compound: true },
      { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'Back', sets: 3, reps: '10-12', rpe: '7' },
    ],
  },
  upperB: {
    id: 'upperB', name: 'Upper B', subtitle: 'Vertical Press', icon: '🏋️',
    warmup: ['Movilidad de hombro'],
    exercises: [
      { id: 'pallof-press', name: 'Pallof Press', muscle: 'Core', sets: 3, reps: '10/side', rpe: '7' },
      { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', compound: true },
      { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscle: 'Arms', sets: 3, reps: '10-15', rpe: '7' },
    ],
  },
  lowerA: {
    id: 'lowerA', name: 'Lower A', subtitle: 'Squat', icon: '🦵',
    warmup: ['Tobillo', 'Sentadilla sin peso'],
    exercises: [
      { id: 'box-jump', name: 'Box Jump', muscle: 'Legs', sets: 3, reps: '3', rpe: '6' },
      { id: 'back-squat', name: 'Back Squat', muscle: 'Legs', sets: 4, reps: '5-8', rpe: '7-8', compound: true },
    ],
  },
};
const TEMPLATE = {
  0: { type: 'rest', label: 'Rest' },
  1: { type: 'gym', session: 'upperA', z2FinisherMin: 20 },
  2: { type: 'gym', session: 'lowerA' },
  3: { type: 'run', label: 'Cardio Z2', subtype: 'zone2', durationMin: 40 },
  4: { type: 'gym', session: 'upperB' },
  5: { type: 'rest', label: 'Rest' },
  6: { type: 'run', label: 'Cardio calidad', subtype: 'long_easy', durationMin: 50 },
};

// ════════════════════════════════════════════════════════════════════════════════════
sec('1. Plan activo = versión más alta, con filas heterogéneas');

// El caso de A.8: una legacy sin `status`, una `superseded` y la activa del coach.
setPlans([
  { id: 'plan_v12', version: 12, label: 'Ideal · 6 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v13', version: 13, label: 'Coach · W36', status: 'superseded', supersededBy: 'plan_v14', author: 'coach-llm', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v14', version: 14, label: 'Coach · W37', status: 'active', author: 'coach-llm', weekKey: '2026-W37', sessions: SESSIONS, weekTemplate: TEMPLATE },
]);
await ctx.loadActivePlan();
eq(ctx._active().id, 'plan_v14', '[v12 legacy, v13 superseded, v14 active] → v14');
eq(ctx._active().version, 14, 'y su versión es la 14');
eq(ctx._active().author, 'coach-llm', 'con el author del coach (lo lee applyIdealPlan para no pisarlo)');
ok(ctx._tpl() === ctx._active().weekTemplate, 'activeWeekTemplate apunta al del plan activo');

// El orden de llegada no puede decidir: syncAll escribe en el orden que devuelve Supabase.
setPlans([
  { id: 'plan_v14', version: 14, label: 'Coach · W37', status: 'active', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v12', version: 12, label: 'Ideal · 6 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v13', version: 13, label: 'Coach · W36', status: 'superseded', sessions: SESSIONS, weekTemplate: TEMPLATE },
]);
await ctx.loadActivePlan();
eq(ctx._active().id, 'plan_v14', 'el orden de las filas en el store no cambia el resultado');

// Sólo legacy (ninguna con `status`): manda la más alta igual. Es el estado del iPhone hoy.
setPlans([
  { id: 'plan_v20', version: 20, label: 'Ideal · 6 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v21', version: 21, label: 'Ideal · 6 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v19', version: 19, label: 'Ideal · 5 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
]);
await ctx.loadActivePlan();
eq(ctx._active().version, 21, 'sólo filas legacy → max(version)');

// Una fila v1 pura sigue resolviendo: sin schema, sin status, sin weekKey, sin author.
setPlans([{ id: 'plan_v1', version: 1, label: 'Upper/Lower 4-Day Split', sessions: SESSIONS, weekTemplate: TEMPLATE }]);
await ctx.loadActivePlan();
const v1 = ctx._active();
eq(v1.version, 1, 'una única fila v1 es el plan activo');
ok(v1.schema === undefined && v1.status === undefined && v1.author === undefined,
  'y no se le inventan campos v2 al leerla');

// Store vacío → fallback duro, nunca undefined (la pantalla de bienvenida lo desreferencia).
setPlans([]);
await ctx.loadActivePlan();
ok(ctx._active() && ctx._active().sessions && ctx._active().version === 0,
  'store vacío → fallback con version 0 (nunca activePlan == null)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('2. getPlannedSessionForDate-style lookup sobre una fila v1');

// El trozo que importa de `getPlannedSessionForDate`: `weekTemplate[jsDay]` + `sessions[id]`.
// Se reproduce aquí en vez de importar la función entera porque ésa arrastra IDB, readiness y
// el motor de cardio; lo que este test protege es que la FORMA de la fila v1 siga sirviendo.
setPlans([{ id: 'plan_v1', version: 1, label: 'Upper/Lower 4-Day Split', sessions: SESSIONS, weekTemplate: TEMPLATE }]);
await ctx.loadActivePlan();
const lookup = (jsDay) => {
  const slot = (ctx._tpl() && ctx._tpl()[jsDay]) || { type: 'rest' };
  if (slot.type !== 'gym' || !slot.session) return { type: slot.type };
  const s = ctx._active().sessions[slot.session] || null;
  return { type: 'gym', sessionId: slot.session, name: s ? s.name : slot.session, exercises: (s && s.exercises) || [] };
};
eq(lookup(1).name, 'Upper A', 'lunes resuelve a Upper A sobre la fila v1');
eq(lookup(1).exercises.length, 2, 'con sus ejercicios');
eq(lookup(3).type, 'run', 'miércoles sigue siendo cardio');
eq(lookup(5).type, 'rest', 'viernes sigue siendo descanso');
// Y con claves de string (JSON round-trip de Supabase): el mismo día tiene que resolver.
const strTpl = {}; for (const [k, v] of Object.entries(TEMPLATE)) strTpl[String(k)] = v;
setPlans([{ id: 'plan_v1', version: 1, label: 'legacy', sessions: SESSIONS, weekTemplate: strTpl }]);
await ctx.loadActivePlan();
eq(lookup(1).name, 'Upper A', 'el weekTemplate con claves de string resuelve igual');

// ════════════════════════════════════════════════════════════════════════════════════
sec('3. createNewPlanVersion: identidad blindada, nunca plan_vNaN');

setPlans([
  { id: 'plan_v12', version: 12, label: 'Ideal · 6 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v13', version: 13, label: 'Coach · W36', status: 'superseded', sessions: SESSIONS, weekTemplate: TEMPLATE },
]);
await ctx.loadActivePlan();
written.length = 0;
const nuevo = await ctx.createNewPlanVersion({
  label: 'Coach · 2026-W37',
  sessions: SESSIONS,
  weekTemplate: TEMPLATE,
  meta: {
    schema: 2, status: 'active', author: 'coach-llm', basedOn: 'plan_v13',
    weekKey: '2026-W37', reviewId: '2026-W37#1', seedRev: 8,
    // v11.65: el brief del coach viaja por `meta` como un campo más. Es lo que permite a la
    // Home decir "por qué cambia / por qué se mantiene" cuando la revisión ya no esté.
    coachBrief: {
      reviewId: '2026-W37#1', weekKey: '2026-W37', appliedAt: 1757200000000,
      focus: 'mantener los 6 anclas', phase: 'build',
      whyChanged: '', whyKept: 'Upper A igual: 8/8/7 @7,5 el 1-sep.',
      priorities: ['a', 'b', 'c'], lastWeekSummary: ['3 de 4 sesiones'],
      weekSummary: [{ sessionId: 'upperA', status: 'kept', line: 'sin cambios' }],
    },
    // v11.67 (E-16): la instantánea de lo que `applyCoachProposal` está a punto de borrar —
    // los swaps de ejercicio y los cambios de día del calendario. Viaja por `meta` como el
    // brief, y `rollbackPlanVersion` la lee de la versión que deshace. Si el spread la
    // filtrara, Deshacer devolvería el plan viejo SIN el trabajo manual que tenía encima.
    baseVersion: 12,
    appliedOnVersion: 12,
    preApply: {
      exerciseOverrides: { upperA: { chinups: { id: 'lat-pulldown', name: 'Lat Pulldown' } } },
      weekSchedule: { '2026-09-10': 'upperA', '2026-09-11': null },
    },
    // Lo que una propuesta maliciosa o un bug intentaría estampar:
    id: 'plan_vPROPUESTA', version: 999, createdAt: '1999-01-01T00:00:00.000Z',
  },
});
eq(nuevo.id, 'plan_v14', 'la versión nueva es max+1, no lo que traía meta.id');
eq(nuevo.version, 14, 'y meta.version NO puede pisar version');
ok(nuevo.createdAt !== '1999-01-01T00:00:00.000Z', 'ni meta.createdAt la fecha');
eq(nuevo.author, 'coach-llm', 'pero meta SÍ estampa author');
eq(nuevo.weekKey, '2026-W37', 'y weekKey');
eq(nuevo.reviewId, '2026-W37#1', 'y reviewId (lo lee la tarjeta para el "Deshacer")');
eq(nuevo.status, 'active', 'y status');
eq(nuevo.basedOn, 'plan_v13', 'y basedOn');
// `coachBrief` NO es una clave protegida: tiene que sobrevivir al spread entero, con su
// `weekSummary` dentro. Si `createNewPlanVersion` lo filtrara, la Home volvería a "Plan W37
// activo (v14)" y el porqué de cada sesión se perdería en cuanto se pode la revisión.
ok(!!nuevo.coachBrief, 'coachBrief sobrevive a createNewPlanVersion (no es una clave protegida)');
eq(nuevo.coachBrief.focus, 'mantener los 6 anclas', 'con su foco');
eq(nuevo.coachBrief.phase, 'build', 'su fase');
eq(nuevo.coachBrief.weekSummary.length, 1, 'y su weekSummary intacto');
eq(nuevo.coachBrief.whyKept, 'Upper A igual: 8/8/7 @7,5 el 1-sep.', 'y el "por qué se mantiene"');
// E-16 · `preApply` tiene que sobrevivir igual: es lo que hace reversible un apply.
ok(!!nuevo.preApply, 'preApply sobrevive a createNewPlanVersion');
eq(nuevo.preApply.exerciseOverrides.upperA.chinups.id, 'lat-pulldown',
  'con el swap que había encima del plan anterior');
eq(Object.keys(nuevo.preApply.weekSchedule).length, 2,
  'y los dos cambios de día del calendario (uno movido, uno vaciado)');
eq(nuevo.baseVersion, 12, 'y la base que el coach tenía delante (E-15)');
eq(nuevo.appliedOnVersion, 12, 'y la base sobre la que se aplicó de verdad');
await ctx.loadActivePlan();
eq(ctx._active().coachBrief.focus, 'mantener los 6 anclas',
  'y sigue ahí tras releer el store (es un campo del plan, no un adorno del render)');
eq(ctx._active().preApply.weekSchedule['2026-09-11'], null,
  'preApply también sobrevive al store, con sus nulls intactos (null = día vaciado a mano)');
eq(written.length, 1, 'una sola escritura');
eq(written[0][0], 'plans', 'en el store plans');
ok(written[0][1] === nuevo, 'la fila escrita es la que devuelve');
eq(ctx._active().id, 'plan_v14', 'y pasa a ser el plan activo en memoria');
ok(!/NaN/.test(nuevo.id), 'el id no contiene NaN');

// Filas sin `version` (las primeras de abril de 2026). `Math.max(..., 0)` es lo que lo salva.
setPlans([
  { id: 'plan_legacy', label: 'Upper/Lower 4-Day Split', sessions: SESSIONS, weekTemplate: TEMPLATE },
  { id: 'plan_v2', version: 2, label: 'Ideal · 6 días', sessions: SESSIONS, weekTemplate: TEMPLATE },
]);
await ctx.loadActivePlan();
const trasLegacy = await ctx.createNewPlanVersion({ label: 'X', sessions: SESSIONS, weekTemplate: TEMPLATE });
ok(!/NaN/.test(trasLegacy.id), `con una fila sin version el id sigue sano (${trasLegacy.id})`);
ok(Number.isFinite(trasLegacy.version), 'y la versión es un número finito');

// Store vacío: la primera versión es la 1, no la NaN.
setPlans([]);
await ctx.loadActivePlan();
const primera = await ctx.createNewPlanVersion({ label: 'Semilla', sessions: SESSIONS, weekTemplate: TEMPLATE });
eq(primera.id, 'plan_v1', 'store vacío → plan_v1');
eq(primera.version, 1, 'version 1');

// La copia es profunda: mutar el plan nuevo no puede tocar el objeto de origen.
setPlans([{ id: 'plan_v5', version: 5, label: 'base', sessions: SESSIONS, weekTemplate: TEMPLATE }]);
await ctx.loadActivePlan();
const copia = await ctx.createNewPlanVersion({ label: 'copia', sessions: SESSIONS, weekTemplate: TEMPLATE });
copia.sessions.upperA.exercises[0].sets = 99;
copia.weekTemplate[1].session = 'otro';
eq(SESSIONS.upperA.exercises[0].sets, 4, 'las sesiones se copian en profundidad');
eq(TEMPLATE[1].session, 'upperA', 'y el weekTemplate también');

// ════════════════════════════════════════════════════════════════════════════════════
sec('4. mergeProposal: lo no tocado sale byte a byte');

const base = { id: 'plan_v14', version: 14, label: 'Ideal · 6 días', sessions: JSON.parse(JSON.stringify(SESSIONS)), weekTemplate: JSON.parse(JSON.stringify(TEMPLATE)), running: null };
const antesUpperA = JSON.stringify(base.sessions.upperA);
const antesLowerA = JSON.stringify(base.sessions.lowerA);
const antesTpl = JSON.stringify(base.weekTemplate);

const propuesta = {
  label: 'Coach · W37',
  phase: 'build',
  sessions: [{
    id: 'upperB',
    focus: 'El core primero. El OHP mantiene 55.',
    exercises: [
      { id: 'pallof-press', name: 'Pallof Press', muscle: 'Core', sets: 3, reps: '10/side', rpe: '7', order: 1 },
      { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', order: 2, target: { kg: 55, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } },
    ],
    changes: [{ kind: 'remove', exId: 'tricep-pushdown', why: 'Cinco exposiciones de empuje en 10 días.' }],
  }],
  cardio: [{ dow: 3, subtype: 'zone2', durationMin: 45, distanceKm: null, note: 'Techo 143 bpm.' }],
  running: { weeklyKmTarget: 19, longRunKm: 6.5, hardSessions: 0 },
};

const merged = mergeProposal(base, propuesta);
eq(JSON.stringify(merged.sessions.upperA), antesUpperA, 'Upper A (no tocada) sale JSON-idéntica');
eq(JSON.stringify(merged.sessions.lowerA), antesLowerA, 'Lower A (no tocada) sale JSON-idéntica');
eq(JSON.stringify(base.weekTemplate), antesTpl, 'y mergeProposal NO muta el weekTemplate del plan activo');
eq(base.sessions.upperB.exercises.length, 3, 'ni la sesión que sí toca');
eq(merged.sessions.upperB.exercises.length, 2, 'la tocada queda con los 2 ejercicios de la propuesta');
ok(!('warmup' in merged.sessions.upperB), 'el warmup se cae de la sesión tocada (llega por PLAN_REV)');
ok(merged.strippedWarmup.includes('upperB'), 'y se declara en strippedWarmup');
ok('warmup' in merged.sessions.upperA, 'pero el de la sesión NO tocada se conserva');
eq(merged.sessions.upperB.name, 'Upper B', 'la sesión tocada conserva el nombre del plan');
eq(merged.touched.join(','), 'upperB', 'touched lista sólo la sesión tocada');
eq(merged.weekTemplate[3].cardio.durationMin, 45, "el cardio del coach aterriza en weekTemplate[dow].cardio");
eq(merged.weekTemplate[3].cardio.source, 'coach', "con source:'coach'");
eq(merged.weekTemplate[3].durationMin, 40, 'y NO pisa el durationMin base del slot');
eq(merged.running.weeklyKmTarget, 19, 'el running de la propuesta entra');

// Una propuesta vacía tiene que ser la identidad: es lo que llega cuando el coach no cambia nada.
const vacia = mergeProposal(base, { sessions: [], cardio: [], weekTemplateChanges: [] });
eq(stableStringify(vacia.sessions), stableStringify(base.sessions), 'propuesta vacía → sesiones idénticas');
eq(diffPlanVersions(base, vacia).structural, 0, 'y structural: 0 en el diff');

// ════════════════════════════════════════════════════════════════════════════════════
sec('5. El diff que pinta la tarjeta');

const d = diffPlanVersions(base, merged);
ok(d.sessions.upperB, 'el diff ve Upper B');
ok(d.sessions.upperB.removed.includes('tricep-pushdown'), 'con el ejercicio quitado');
eq(d.sessions.upperB.added.length, 0, 'y ninguno añadido');
ok(!d.sessions.upperA, 'y NO ve Upper A (no cambió)');
ok(!d.sessions.lowerA, 'ni Lower A');
ok(d.weekTemplate.length === 1 && d.weekTemplate[0].dow === 3, 'el template cambia sólo el miércoles');
ok(d.running && d.running.to.weeklyKmTarget === 19, 'y el running viaja en el diff');
ok(d.structural >= 2, `structural cuenta los cambios reales (${d.structural})`);

// Los kg del objetivo NO son estructurales: si lo fueran, cualquier progresión normal sería
// "churn" y el aviso CHURN saltaría todas las semanas.
const soloKg = mergeProposal(base, {
  sessions: [{
    id: 'upperA',
    exercises: base.sessions.upperA.exercises.map(e => (e.id === 'bench-press'
      ? { ...e, target: { kg: 95, reps: '5-8', rpe: '7-8', source: 'coach', evidence: ['STR-001'] } }
      : { ...e })),
  }],
});
const dKg = diffPlanVersions(base, soloKg);
eq(dKg.structural, 0, 'un cambio de sólo kg objetivo → structural 0');
ok(dKg.sessions.upperA && dKg.sessions.upperA.targets.length === 1, 'pero el diff sí lista el target');
eq(dKg.sessions.upperA.targets[0].toKg, 95, 'con el kg nuevo (95)');

// ════════════════════════════════════════════════════════════════════════════════════
sec('6. La propuesta mergeada, convertida en versión, sigue respetando el invariante');

setPlans([
  { id: 'plan_v13', version: 13, label: 'Ideal · 6 días', status: 'active', author: 'ideal-seed', sessions: SESSIONS, weekTemplate: TEMPLATE },
]);
await ctx.loadActivePlan();
const aplicada = await ctx.createNewPlanVersion({
  label: `Coach · ${'2026-W37'}`,
  sessions: merged.sessions,
  weekTemplate: merged.weekTemplate,
  meta: { schema: 2, status: 'active', author: 'coach-llm', basedOn: 'plan_v13', weekKey: '2026-W37', reviewId: '2026-W37#1', running: merged.running, seedRev: 8 },
});
eq(aplicada.version, 14, 'la propuesta aplicada es la v14 (max+1)');
await ctx.loadActivePlan();
eq(ctx._active().id, 'plan_v14', 'y al recargar, el plan activo es ella');
eq(ctx._active().running.weeklyKmTarget, 19, 'con el running del coach dentro del plan');
ok(!store.plans.some(p => p.status === 'proposed'),
  'ninguna fila de `plans` queda con status "proposed" (las propuestas viven en coach_reviews)');

// Rollback = NUEVA versión copiada. Volver a activar la v13 rompería el invariante en los
// dispositivos con código viejo, que sólo miran max(version).
const restaurada = await ctx.createNewPlanVersion({
  label: 'Ideal · 6 días (restaurada)',
  sessions: SESSIONS,
  weekTemplate: TEMPLATE,
  meta: { schema: 2, status: 'active', author: 'user', basedOn: 'plan_v13', rolledBackFrom: 'plan_v14', seedRev: 8 },
});
eq(restaurada.version, 15, 'el rollback crea la v15, no reactiva la v13');
eq(restaurada.rolledBackFrom, 'plan_v14', 'y deja rastro de desde dónde se volvió');
eq(store.plans.length, 3, 'sin borrar ninguna fila (historia lineal)');
await ctx.loadActivePlan();
eq(ctx._active().version, 15, 'y la restaurada es la activa por ser la más alta');

console.log('');
console.log(fail === 0
  ? '✅ Plan v2 compatible: activo = versión más alta, identidad blindada, propuestas fuera de `plans`.'
  : `❌ ${fail} comprobación(es) fallaron.`);
process.exit(fail === 0 ? 0 : 1);
