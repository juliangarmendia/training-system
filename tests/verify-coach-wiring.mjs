// Coach v2 — parte 0: los cimientos de datos (incremento 1, v11.55).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. La app no tiene bundler: los módulos se
// hablan por globals sueltos y por el orden de los `<script>` de index.html. Cada pieza de
// este incremento tiene una forma conocida de romperse en silencio:
//
//   · `coach-engine.js` cargado DESPUÉS de app.js, o no cargado: `COACH_GOALS_DEFAULT` es
//     undefined en `init()` y `ensureGoals()` no siembra nada. Nadie ve un error.
//   · `coach-engine.js` fuera del APP_SHELL del service worker: funciona en el navegador y
//     falla sin conexión, que es justo donde se entrena. Ya pasó con nutrition.js.
//   · `CACHE_NAME` sin subir: el iPhone sigue sirviendo el bundle viejo desde caché y el
//     despliegue no existe. Es el fallo más repetido del proyecto.
//   · `DB_VERSION` sin subir tras añadir stores: `coach_reviews`/`decisions` no se crean y
//     cada lectura lanza NotFoundError. Bajarlo rompe la app con VersionError (rollback
//     caveat de db-schema-state.md): el suelo sube a 12 y no vuelve a bajar.
//   · Stores nuevos fuera de la lista de sync: los datos del coach se quedan en el teléfono
//     y la edge function razona sobre la nada.
//   · `createNewPlanVersion` sin esparcir `meta`: el plan del coach pierde `author`,
//     `weekKey` y `reviewId`, así que `applyIdealPlan` lo pisa y `suggestSetTarget` no sabe
//     si el objetivo sigue vigente.
//   · `logDecision` con `dbPut` en vez de `smartPut`: el registro de decisiones —la memoria
//     del coach— se queda local. Exactamente el bug de `exercises` (F-1).
//   · `isoWeekKey` en hora local: en la frontera domingo/lunes y en los cambios de horario
//     la semana se desplaza y el objetivo del coach se declara vencido un día antes. El
//     proyecto ya pagó una migración por fechas (tz_date_migration_v2).
//
// Ejecutar desde la raíz del repo: node tests/verify-coach-wiring.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const SYNC = readFileSync('app/supabase-sync.js', 'utf8');
const HTML = readFileSync('app/index.html', 'utf8');
const SW = readFileSync('app/sw.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// ── 1. Carga del módulo y caché ─────────────────────────────────────────────────────
console.log('1. Scripts, service worker y versión');
const iEngine = HTML.indexOf('src="coach-engine.js"');
const iApp = HTML.indexOf('src="app.js"');
const iNut = HTML.indexOf('src="nutrition.js"');
yes(iEngine > 0, 'index.html carga coach-engine.js');
yes(iEngine > 0 && iApp > 0 && iEngine < iApp,
  'coach-engine.js se carga ANTES de app.js (init() lee COACH_GOALS_DEFAULT)');
yes(iNut > 0 && iEngine > iNut, 'y después de nutrition.js (orden declarado del plan)');
yes(/'\.\/coach-engine\.js'/.test(SW), 'coach-engine.js está en el APP_SHELL del service worker');

const vHtml = (HTML.match(/Training System v(\d+\.\d+)/) || [])[1];
const vSw = (SW.match(/CACHE_NAME = 'training-v(\d+\.\d+)'/) || [])[1];
yes(!!vHtml, `index.html declara la versión (v${vHtml})`);
eq(vSw, vHtml, 'CACHE_NAME del service worker == versión de index.html');
eq(vHtml, '11.55', 'la versión de este incremento es v11.55');

// ── 2. Los dos stores nuevos ────────────────────────────────────────────────────────
console.log('');
console.log('2. IndexedDB: DB_VERSION y stores');
const dbv = Number((APP.match(/const DB_VERSION = (\d+)/) || [])[1]);
yes(dbv >= 12, `DB_VERSION = ${dbv} (>= 12; monótona creciente, nunca baja)`);
const iOpen = APP.indexOf('function openDB()');
const iOpenEnd = APP.indexOf('function dbPut(', iOpen);
const OPEN_SRC = APP.slice(iOpen, iOpenEnd);
for (const store of ['coach_reviews', 'decisions']) {
  yes(new RegExp(`contains\\('${store}'\\)`).test(OPEN_SRC),
    `openDB() crea el store '${store}' (aditivo, con guard de existencia)`);
  yes(new RegExp(`createObjectStore\\('${store}', \\{ keyPath: 'id' \\}\\)`).test(OPEN_SRC),
    `'${store}' con keyPath 'id'`);
}

// ── 3. Sync y backup ────────────────────────────────────────────────────────────────
console.log('');
console.log('3. Sync y backup');
const stores = (SYNC.match(/const stores = \[([^\]]*)\]/) || [])[1] || '';
const backup = (APP.match(/const BACKUP_STORES = \[([^\]]*)\]/) || [])[1] || '';
for (const store of ['coach_reviews', 'decisions']) {
  yes(stores.includes(`'${store}'`), `'${store}' entra en el pull de syncAll() (la tabla ya existe)`);
  yes(backup.includes(`'${store}'`), `'${store}' entra en BACKUP_STORES (el export JSON lo incluye)`);
}

// ── 4. createNewPlanVersion esparce meta ────────────────────────────────────────────
// El plan v2 lleva schema/status/author/basedOn/weekKey/reviewId/block/running/seedRev como
// metadatos. Sin esto no hay dónde estamparlos, y con esto no puede pisar id/version.
console.log('');
console.log('4. createNewPlanVersion(meta)');
const iCNP = APP.indexOf('async function createNewPlanVersion(');
const CNP_SRC = APP.slice(iCNP, APP.indexOf('\n}', iCNP));
yes(iCNP > 0, 'se localiza createNewPlanVersion()');
yes(/\.\.\.\s*(?:\(?\s*)?meta/.test(CNP_SRC) || /\.\.\.modifications\.meta/.test(CNP_SRC),
  'esparce modifications.meta en el plan nuevo');
const iSpread = CNP_SRC.search(/\.\.\.\s*(?:\(?\s*)?meta/);
yes(iSpread > CNP_SRC.indexOf('weekTemplate:'),
  'lo esparce DESPUÉS de los campos base (para poder estampar author/weekKey/status)');
yes(/id:\s*`plan_v/.test(CNP_SRC) && CNP_SRC.lastIndexOf('id: `plan_v') > iSpread,
  'id/version/createdAt se reafirman después del spread: meta no puede pisarlos');

// ── 5. ensureGoals y el registro de decisiones ──────────────────────────────────────
console.log('');
console.log('5. ensureGoals() y logDecision()');
yes(/async function ensureGoals\(\)/.test(APP), 'ensureGoals() existe');
const iAnchor = APP.indexOf('await ensureDeloadAnchor()');
const iGoals = APP.indexOf('await ensureGoals()');
yes(iAnchor > 0 && iGoals > iAnchor, 'init() llama ensureGoals( justo después de ensureDeloadAnchor()');
const iEG = APP.indexOf('async function ensureGoals()');
const EG_SRC = APP.slice(iEG, APP.indexOf('\n}', iEG));
yes(/smartPut\('settings', \{ key: 'userSettings'/.test(EG_SRC),
  'persiste con smartPut en userSettings (la misma ruta que ensureDeloadAnchor)');
yes(/typeof COACH_GOALS_DEFAULT/.test(EG_SRC),
  'se defiende de que coach-engine.js no haya cargado');

yes(/async function logDecision\(/.test(APP), 'logDecision() existe');
yes(/async function pruneDecisions\(/.test(APP), 'pruneDecisions() existe');
const iLD = APP.indexOf('async function logDecision(');
const LD_SRC = APP.slice(iLD, APP.indexOf('async function pruneDecisions(', iLD));
yes(/smartPut\('decisions',/.test(LD_SRC),
  "logDecision() escribe con smartPut('decisions' — no puede quedarse en local");
yes(/pruneDecisions\(/.test(LD_SRC), 'logDecision() poda la cola local tras escribir');
for (const store of ['coach_reviews', 'decisions']) {
  eq((APP.match(new RegExp(`dbPut\\('${store}'`, 'g')) || []).length, 0,
    `ninguna escritura cruda dbPut('${store}') en app.js`);
}

// ── 6. coach-engine.js: puro, sin DOM ni IDB ────────────────────────────────────────
console.log('');
console.log('6. coach-engine.js es puro');
for (const prohibido of ['document.', 'indexedDB', 'dbGet', 'dbPut', 'smartPut', 'localStorage']) {
  yes(!ENGINE.includes(prohibido), `no usa ${prohibido}`);
}

// Cargarlo como lo hace verify-nutrition-v2.mjs: aprovechando su bloque module.exports.
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(ENGINE).runInContext(sandbox);
const E = sandbox.module.exports;
yes(!!E && typeof E.isoWeekKey === 'function', 'exporta isoWeekKey()');
yes(!!E && !!E.COACH_GOALS_DEFAULT, 'exporta COACH_GOALS_DEFAULT');
if (!E || !E.isoWeekKey) {
  console.log('');
  console.log(`❌ ${failed} comprobación(es) fallaron.`);
  process.exit(1);
}

// ── 7. isoWeekKey en UTC ────────────────────────────────────────────────────────────
// Semana ISO: empieza en lunes, la semana 1 es la que contiene el 4 de enero. 2026 tiene 53.
console.log('');
console.log('7. isoWeekKey (UTC, lunes, semana 1 contiene el 4-ene)');
eq(E.isoWeekKey('2026-09-06'), '2026-W36', 'domingo 6-sep-2026 → W36 (no se adelanta a la siguiente)');
eq(E.isoWeekKey('2026-09-07'), '2026-W37', 'lunes 7-sep-2026 → W37');
eq(E.isoWeekKey('2026-01-01'), '2026-W01', 'jueves 1-ene-2026 → W01 (no W53 de 2025)');
eq(E.isoWeekKey('2027-01-03'), '2026-W53', 'domingo 3-ene-2027 → W53 de 2026 (2026 tiene 53 semanas)');
eq(E.isoWeekKey('2027-01-04'), '2027-W01', 'lunes 4-ene-2027 → W01 de 2027');
// Misma semana de lunes a domingo, y salto exacto el lunes siguiente.
const semana = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13'];
yes(semana.every(d => E.isoWeekKey(d) === '2026-W37'), 'lunes→domingo caen todos en W37');
eq(E.isoWeekKey('2026-09-14'), '2026-W38', 'el lunes siguiente ya es W38');
// Un timestamp completo no debe cambiar el resultado (el facts pack pasa fechas, no Dates).
eq(E.isoWeekKey('2026-09-07T23:30:00+02:00'), '2026-W37', 'tolera un ISO completo sin desplazarse');

// ── 8. COACH_GOALS_DEFAULT ──────────────────────────────────────────────────────────
console.log('');
console.log('8. COACH_GOALS_DEFAULT (plan §B.5)');
const G = E.COACH_GOALS_DEFAULT;
eq(JSON.stringify(G.primary.targetWeightKg), JSON.stringify([79, 81]), 'objetivo de peso = [79, 81] kg');
eq(G.primary.type, 'fat-loss', 'objetivo primario = fat-loss (la grasa manda sobre el 10k)');
eq(G.primary.rateKgPerWeek, 0.45, 'tasa objetivo 0,45 kg/semana');
eq(G.primary.startWeightKg, 87.1, 'peso de partida 87,1 kg');
eq(G.primary.startDate, '2026-08-19', 'fecha de partida 2026-08-19');
eq(G.preserve.ffmKg, 72.8, 'FFM a preservar 72,8 kg');
eq(G.preserve.anchorLifts.length, 6, '6 levantamientos ancla');
eq(G.secondary.run10k.targetKm, 10, 'objetivo secundario: 10 km');
eq(G.constraints.sessionMaxMin, 75, 'sesión máx 75 min');
eq(G.constraints.stepsFloor, 8000, 'suelo de 8.000 pasos');
eq(G.constraints.proteinG, 185, 'proteína 185 g');
eq(G.constraints.daysPerWeek, null, 'daysPerWeek null → lo resuelve idealVariant');
eq(G.version, 1, 'version 1');

console.log('');
console.log(failed === 0
  ? '✅ Cimientos de Coach v2 cableados: módulo, stores, sync, meta del plan y decisiones.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
