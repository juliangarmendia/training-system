// Coach v2 — parte 0: los cimientos de datos (incremento 1, v11.55) + el cableado del
// bloque y la progresión de cardio (incremento 2, v11.56).
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
// Incremento 2 (v11.56) añade dos formas más de romperse en silencio:
//
//   · `isDeloadWeek` con su propio modulo Y `blockWeek()` calculando lo mismo desde una fecha:
//     dos aritméticas del mismo concepto se desincronizan, y la etiqueta ("deload en 2
//     semanas") acaba contradiciendo al recorte de series que sí ocurre.
//   · `getPlannedSessionForDate` sin llamar a `progressCardioMin`: el motor existe, sus tests
//     pasan (`verify-block-week.mjs`) y la pantalla sigue mostrando 40' para siempre. El motor
//     que nadie llama es peor que el motor que no existe: parece hecho.
//
// Ejecutar desde la raíz del repo: node tests/verify-coach-wiring.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ENGINE = readFileSync('app/coach-engine.js', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const SYNC = readFileSync('app/supabase-sync.js', 'utf8');
const HTML = readFileSync('app/index.html', 'utf8');
const SW = readFileSync('app/sw.js', 'utf8');
const COACHJS = readFileSync('app/coach.js', 'utf8');
const CSS = readFileSync('app/style.css', 'utf8');

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
// Agnóstico de versión a propósito: lo que importa es que las DOS suban juntas (el fallo más
// repetido del proyecto es subir una y no la otra) y que nunca bajen por debajo del incremento
// que introdujo estos cimientos. Fijar el número exacto obliga a editar el test en cada push.
const vNum = (v) => { const [a, b] = String(v).split('.').map(Number); return a * 1000 + b; };
yes(vNum(vHtml) >= vNum('11.55'), `la versión (v${vHtml}) es >= v11.55 (nunca retrocede)`);

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

// ── 6.b. Incremento 2: una sola aritmética de bloque, cardio progresado ─────────────
//
// `isDeloadWeek` tenía su propio modulo sobre `deloadAnchorWeek`. Con `blockWeek()` al lado
// haciendo lo mismo desde una fecha, dos aritméticas para el mismo concepto se desincronizan:
// la etiqueta diría "deload en 2 semanas" mientras el recorte de series ocurre en otra.
console.log('');
console.log('6.b Bloque por fecha y progresión de cardio (v11.56)');
yes(!!E && typeof E.blockWeekFromDates === 'function', 'coach-engine exporta blockWeekFromDates()');
yes(!!E && typeof E.progressCardioMin === 'function', 'coach-engine exporta progressCardioMin()');
yes(!!E && typeof E.mondayOf === 'function', 'coach-engine exporta mondayOf()');
yes(!!E && typeof E.anchorDateFromWeek === 'function', 'coach-engine exporta anchorDateFromWeek()');

// Cuerpo de una función tope de app.js: desde su declaración hasta el primer `}` en columna 0.
const fnSrc = (decl) => {
  const i = APP.indexOf(decl);
  if (i < 0) return '';
  const j = APP.indexOf('\n}', i);
  return APP.slice(i, j < 0 ? APP.length : j);
};

const IDW_SRC = fnSrc('function isDeloadWeek(');
yes(!!IDW_SRC, 'se localiza isDeloadWeek()');
yes(/blockWeek\(/.test(IDW_SRC), 'isDeloadWeek() delega en blockWeek( — una sola aritmética');
yes(!/% DELOAD_BLOCK_WEEKS/.test(IDW_SRC),
  'y ya NO calcula su propio modulo (% DELOAD_BLOCK_WEEKS fuera de isDeloadWeek)');
const BW_SRC = fnSrc('function blockWeek(');
yes(!!BW_SRC, 'blockWeek() existe en app.js (wrapper del motor puro)');
yes(/blockWeekFromDates\(/.test(BW_SRC), 'blockWeek() llama blockWeekFromDates( del motor');
yes(/deloadAnchorDate/.test(BW_SRC), 'y lee settings.deloadAnchorDate (ancla por fecha, F-13)');
const NDW_SRC = fnSrc('function nextDeloadWeek(');
yes(/blockWeek\(\)/.test(NDW_SRC), 'nextDeloadWeek() también se deriva de blockWeek()');

const EDA_SRC = fnSrc('async function ensureDeloadAnchor()');
yes(/state\.settings\.deloadAnchorDate =/.test(EDA_SRC), 'ensureDeloadAnchor() escribe deloadAnchorDate');
yes(/anchorDateFromWeek\(/.test(EDA_SRC), 'y migra desde deloadAnchorWeek con anchorDateFromWeek(');
yes(/smartPut\('settings', \{ key: 'userSettings'/.test(EDA_SRC),
  'persiste con smartPut en userSettings (la misma ruta que ensureGoals)');
yes(/function deloadAnchorWeek\(/.test(APP),
  'deloadAnchorWeek() sigue existiendo (no se borra: código viejo y backups lo leen)');

const GP_SRC = fnSrc('async function getPlannedSessionForDate(');
yes(/progressCardioMin\(/.test(GP_SRC), 'getPlannedSessionForDate() llama progressCardioMin(');
yes(/blockWeek\(date\)/.test(GP_SRC), 'y sitúa la fecha en el bloque con blockWeek(date)');
for (const f of ['durationSource', 'baseMin', 'block:', 'z2Source']) {
  yes(GP_SRC.includes(f), `devuelve ${f} (la UI necesita saber de dónde salen los minutos)`);
}
yes(/lastCardioDaysAgo\(/.test(GP_SRC), 'pasa lastCardioDaysAgo( (no se progresa tras una pausa)');

// La invalidación de la caché: sin ella el cardio recién registrado tarda un minuto en contar.
for (const fn of ['async function logRun(', 'async function logCardio(', 'async function logZ2Finisher(', 'async function intervalsIcuSync(']) {
  yes(/state\._lastCardioDate = null/.test(fnSrc(fn)), `${fn.replace('async function ', '')}) invalida state._lastCardioDate`);
}
// Los consumidores leen los minutos YA progresados, nunca IDEAL_BLOCK_V1 directamente.
for (const fn of ['function _generateCardioDsl(', 'async function pushCardioToIntervalsIcu(', 'async function pushZ2FinisherToIntervalsIcu(', 'async function logZ2Finisher(']) {
  yes(!/IDEAL_BLOCK_V1/.test(fnSrc(fn)),
    `${fn.replace(/^(async )?function /, '')}) no lee IDEAL_BLOCK_V1 (usa la duración progresada que le llega)`);
}
// Los renderers muestran de dónde salen los minutos (el "48' (40' base · semana 3/5)").
yes(/function _cardioDurLabel\(/.test(APP), '_cardioDurLabel() existe (número + procedencia en la misma línea)');
yes(/function _blockEyebrow\(/.test(APP), '_blockEyebrow() existe ("Semana 3/5 · build")');
yes(/_cardioDurLabel\(/.test(fnSrc('async function renderTodaysPlan(')),
  'renderTodaysPlan() usa _cardioDurLabel(');
yes(/plan-block-eyebrow/.test(readFileSync('app/style.css', 'utf8')),
  '.plan-block-eyebrow existe en style.css');

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


// ── 9. UI · Inc 3 — el objetivo del set llega a la tarjeta (v11.57) ─────────────────
//
// Formas conocidas de romper esto en silencio, todas en la pantalla más usada de la app:
//
//   · El motor existe, sus tests pasan y `buildExerciseCard` no lo llama: la tarjeta sigue
//     mostrando el peso anterior. El motor que nadie llama parece hecho y no lo está.
//   · Vuelve `generateCoachNote` (o su frase) y otra vez hay dos números para una decisión.
//   · `finishWorkout` no sella el objetivo mostrado: el sistema pierde la única forma de
//     contrastar su propia prescripción ("te propuse 95, hiciste 92,5").
//   · La tarjeta SIN objetivo cambia: los ejercicios de medida y los estrenados no tienen kg,
//     y ahí el HTML tiene que ser exactamente el de v11.56. Por eso hay una instantánea.
//   · `coach.js` fuera del APP_SHELL o cargado después de app.js: la lectura del coach
//     desaparece justo sin conexión, que es donde se entrena.
console.log('');
console.log('9. UI · Inc 3 — el kg objetivo en la tarjeta, en Home y en el registro');

// 9.a El motor y su wrapper
yes(typeof E.suggestSetTarget === 'function', 'coach-engine exporta suggestSetTarget()');
yes(typeof E.parseCoachTarget === 'function', 'coach-engine exporta parseCoachTarget() (adaptador legacy)');
yes(typeof E.sessionReadout === 'function', 'coach-engine exporta sessionReadout()');
yes(typeof E._coachFmtKg === 'function', 'coach-engine exporta _coachFmtKg() (coma decimal en la UI)');
yes(/async function computeSessionTargets\(sessionId, exercises, opts/.test(APP),
  'computeSessionTargets(sessionId, exercises, opts) existe en app.js');
const CST_SRC = fnSrc('async function computeSessionTargets(');
yes(/suggestSetTarget\(/.test(CST_SRC), 'computeSessionTargets() llama al motor puro');
yes(/convertWeight\(s\.weight \|\| 0, w\.unit \|\| 'kg', 'kg'\)/.test(CST_SRC),
  'convierte el historial a kg (los registros pre-España están en lb)');
yes(/e\.exerciseId === ex\.id/.test(CST_SRC),
  'busca el historial por el ejercicio que se va a HACER (el swap), no por el hueco del plan');
yes(/measureUnitFor\(ex\.id\)/.test(CST_SRC), 'pasa measureUnit (los cm no son kg)');
yes(/isoWeekKey\(/.test(CST_SRC), 'pasa la semana ISO de hoy (vigencia del objetivo del coach)');
yes(/_origId/.test(CST_SRC), 'el objetivo del coach se busca por el hueco del plan (_origId)');
// Un swap invalida el objetivo del hueco: los 70 kg de un jalón en un pullover en polea serían
// un número absurdo con la etiqueta de más autoridad de la app.
yes(/const swapped = !!\(ex\._origId && ex\._origId !== ex\.id\)/.test(CST_SRC),
  'detecta si el ejercicio viene de un swap');
yes(/swapped \? null : findPlanEx\(slotId\)/.test(CST_SRC),
  'con swap NO hereda el objetivo del movimiento original (sólo uno escrito para el sustituto)');
yes(/swapped \? null : legacy\.byId\[slotId\]/.test(CST_SRC), '…y lo mismo con el objetivo legacy');
// El cron no conoce la semana del bloque (Change 4 pendiente): en descarga manda la regla.
yes(/if \(opts\.deload && coachTarget && !fromPlanV2\) coachTarget = null;/.test(CST_SRC),
  'en descarga se descarta el objetivo del cron legacy (no conoce el bloque) y manda la regla');
const LEG_SRC = fnSrc('async function _legacyCoachTargets(');
yes(/parseCoachTarget\(/.test(LEG_SRC) && /weekly_reviews/.test(LEG_SRC),
  '_legacyCoachTargets() parsea el texto de weekly_reviews');
yes(/latest\.weekKey/.test(LEG_SRC), 'y se queda con su weekKey (sin fecha no hay vigencia)');

// 9.b `generateCoachNote` ha muerto
eq((APP.match(/generateCoachNote\(/g) || []).length, 0,
  'ninguna llamada a generateCoachNote( (la regla ya no es sólo texto)');
yes(!/^function generateCoachNote/m.test(APP), 'la función generateCoachNote ya no existe');
// La frase que emitía, en inglés y con interpolación. Se busca el literal interpolado y no el
// texto pelado: los comentarios que EXPLICAN qué se retiró sí pueden citarla.
yes(!/All sets hit \$\{/.test(APP), "no queda su frase en inglés ('↑ All sets hit ${…} reps @ RPE')");
yes(!/Didn't hit min \$\{/.test(APP), 'ni la de bajar peso');
yes(!/ex\.notes\.startsWith\('Reentrada '\)/.test(APP), "fuera la rama muerta 'Reentrada ' de la nota");

// 9.c La tarjeta
const CARD_SRC = fnSrc('function buildExerciseCard(');
yes(/function buildExerciseCard\(ex, exIdx, previous, restSettings, exerciseNotes, deload, session, allWorkouts, target = null, adjustments = null\)/.test(APP),
  'buildExerciseCard recibe `target` y `adjustments` al final (compatible con llamadas viejas)');
yes(/coach-objective/.test(CARD_SRC) || /coachObjectiveHtml\(/.test(CARD_SRC),
  'la tarjeta pinta la línea .coach-objective');
yes(/target\.reason/.test(CARD_SRC), '.exercise-notes muestra la razón del objetivo');
yes(/targetKgDisp != null \? targetKgDisp/.test(CARD_SRC),
  'el placeholder de las series es el kg objetivo cuando existe');
yes(/prev-header/.test(CARD_SRC), 'sigue el "Last: …" (es la evidencia que se mira)');
yes(/ghost-set/.test(CARD_SRC), 'sigue la fila fantasma');
yes(/exercise-1rm/.test(CARD_SRC), 'sigue el Est. 1RM');
yes(/source !== 'none'/.test(CARD_SRC),
  "source:'none' no pinta objetivo (medida / primera vez → tarjeta idéntica a v11.56)");
const OBJ_SRC = fnSrc('function coachObjectiveHtml(');
yes(/coach-chip-\$\{target\.source\}/.test(OBJ_SRC), 'el chip lleva el ORIGEN del número');
yes(/último/.test(OBJ_SRC) && /regla/.test(OBJ_SRC) && /coach/.test(OBJ_SRC),
  'los tres chips en castellano: coach · regla · último');
yes(/_coachFmtKg\(/.test(OBJ_SRC), 'el kg se pinta con coma decimal');
yes(/ex && ex\.bw \? '\+' : ''/.test(OBJ_SRC), "peso corporal → '+2,5 kg' (es lastre, no carga total)");

// 9.d startWorkout, aceptar-con-check y el reanudado
const SW_SRC = fnSrc('async function startWorkout(');
yes(/computeSessionTargets\(/.test(SW_SRC), 'startWorkout() calcula los objetivos');
yes(/state\.activeTargets =/.test(SW_SRC), 'y los guarda en state.activeTargets');
yes(/opts\.targets/.test(SW_SRC), 'acepta objetivos ya calculados (reanudar no los recalcula)');
yes(/session\.exercises\.filter\(e => !\(e\.id in dados\)\)/.test(SW_SRC),
  '…y sólo calcula los que faltan (un ejercicio añadido en la sesión libre recibe el suyo)');
yes(/state\.activeTargets \|\| \{\}/.test(SW_SRC), 'y los pasa a cada tarjeta con guard');
yes(/const deload = baseSession\.adHoc \? false : isDeloadWeek\(wk\)/.test(SW_SRC),
  'la sesión libre sigue sin deload (comportamiento intacto)');
// El fallo que esto arregla de paso: un set marcado sin escribir peso se guardaba con weight 0
// y desaparecía del historial, del tonelaje y del 1RM.
yes(/wIn\.value === '' && isFinite\(parseFloat\(wIn\.placeholder\)\)/.test(SW_SRC),
  'el check acepta el objetivo: rellena el peso desde el placeholder si está vacío');
yes(/wIn\.value = wIn\.placeholder/.test(SW_SRC), '…escribiendo el placeholder tal cual');
const CAP_SRC = fnSrc('function captureWorkoutState(');
yes(/targets: state\.activeTargets/.test(CAP_SRC), 'captureWorkoutState() guarda los objetivos');
const RES_SRC = fnSrc('async function restoreActiveWorkout(');
yes(/startWorkout\(saved\.sessionId, \{ targets: saved\.targets \|\| null, adjustments: saved\.adjustments \|\| null \}\)/.test(RES_SRC),
  'restoreActiveWorkout() repone los MISMOS objetivos (y los ajustes, v11.59)');
const CLR_SRC = fnSrc('async function clearActiveWorkout(');
yes(/state\.activeTargets = null/.test(CLR_SRC), 'clearActiveWorkout() los limpia');

// 9.e finishWorkout: instantánea, lectura y decisión
const FIN_SRC = fnSrc('async function finishWorkout(');
yes(/meta\.target = \{ kg: t\.kg/.test(FIN_SRC),
  'finishWorkout() sella en cada ejercicio el objetivo que se mostró');
yes(/attachSessionReadout\(workout, sessionDef\)/.test(FIN_SRC), 'y calcula la lectura de la sesión');
yes(/logDecision\(/.test(FIN_SRC), 'y registra la decisión (memoria del coach)');
yes(/'session-readout'/.test(FIN_SRC), "con type:'session-readout'");
yes(/perExercise/.test(FIN_SRC), 'un registro por sesión, con el detalle en evidence.perExercise');
yes(FIN_SRC.indexOf('attachSessionReadout') < FIN_SRC.indexOf("smartPut('workouts'"),
  'la lectura se calcula ANTES de escribir (clearActiveWorkout borra los objetivos)');
yes(/try \{[\s\S]{0,200}attachSessionReadout/.test(FIN_SRC),
  'y va en try/catch: terminar una sesión no puede fallar por un resumen');
const ATT_SRC = fnSrc('async function attachSessionReadout(');
yes(/\.readout = sessionReadout\(/.test(ATT_SRC), 'attachSessionReadout() adjunta workout.readout');
yes(/deload: false/.test(ATT_SRC), 'el "próxima vez" no promete el −10 % de una descarga futura');

// 9.f Home: el kg también antes de entrar al gimnasio
const RTP_SRC = fnSrc('async function renderTodaysPlan(');
yes(/computeSessionTargets\(/.test(RTP_SRC), 'renderTodaysPlan() calcula los objetivos de hoy');
yes(/coach-chip/.test(RTP_SRC), 'y pinta el chip de origen en la fila del ejercicio');
yes(/catch \(e\) \{\s*rxTargets = \{\};/.test(RTP_SRC),
  'si algo falla, la fila queda como antes (Home no se cae por esto)');
// Con un swap activo, el nombre y el kg tienen que ser del MISMO ejercicio.
yes(/const rxExercises = rxResolved\.map\(/.test(RTP_SRC),
  'las filas se pintan sobre la lista resuelta (nombre y kg del mismo movimiento)');
yes(/resolveSessionExercises\(plannedSession, baseExercises\)/.test(RTP_SRC),
  'y los swaps se resuelven con la misma función que usa startWorkout');
const HOME_SRC = fnSrc('async function renderHomeView(');
yes(/typeof renderCoachReadout === 'function' \? renderCoachReadout\(\)/.test(HOME_SRC),
  "renderHomeView() llama renderCoachReadout() con guard de typeof");

// 9.g El módulo nuevo y su carga
const iCoachJs = HTML.indexOf('src="coach.js"');
yes(iCoachJs > 0, 'index.html carga coach.js');
yes(iCoachJs > iEngine, 'coach.js se carga DESPUÉS de coach-engine.js (usa _coachFmtKg)');
yes(iCoachJs < iApp, 'y ANTES de app.js (renderHomeView lo llama)');
yes(/'\.\/coach\.js'/.test(SW), 'coach.js está en el APP_SHELL del service worker');
yes(HTML.indexOf('id="coach-readout"') > 0, 'index.html tiene #coach-readout');
yes(HTML.indexOf('id="coach-readout"') < HTML.indexOf('id="todays-plan-card"'),
  'y va ENCIMA de #todays-plan-card');
const RCR_SRC = COACHJS.slice(COACHJS.indexOf('async function renderCoachReadout('));
yes(/coachReadoutSeen/.test(RCR_SRC), 'la tarjeta se descarta y no vuelve (coachReadoutSeen)');
yes(/dbPut\('settings', \{ key: 'coachReadoutSeen'/.test(RCR_SRC),
  "el descarte es LOCAL con dbPut: 'ya la vi' es estado de este dispositivo, no dato de usuario");
yes(/Próxima vez ya está aplicado en la tarjeta/.test(RCR_SRC), 'lleva el pie del wireframe (§B.1)');
yes(/escapeHtml\(/.test(RCR_SRC), 'escapa el texto que pinta');
for (const clase of ['coach-objective', 'coach-obj-label', 'coach-chip', 'coach-chip-coach',
                     'coach-chip-rule', 'coach-chip-last', 'coach-readout', 'coach-readout-row',
                     'coach-outcome-up', 'coach-outcome-hold', 'coach-outcome-down', 'coach-outcome-skip']) {
  yes(new RegExp(`\\.${clase}[\\s,{:]`).test(CSS), `.${clase} existe en style.css`);
}
yes(!/animation:/.test(CSS.slice(CSS.indexOf('COACH v2 — objetivo del set'))),
  'el bloque del coach no añade animaciones');

// ── 10. La tarjeta, renderizada de verdad (DOM stub) ────────────────────────────────
//
// Los greps de arriba no pueden ver el HTML. Esto lo pinta: con objetivo tiene que aparecer la
// línea y el placeholder; SIN objetivo tiene que ser BYTE A BYTE el HTML de v11.56, porque los
// ejercicios de medida y los que se estrenan hoy no tienen kg y su tarjeta no debe moverse.
console.log('');
console.log('10. buildExerciseCard renderizada (con y sin objetivo)');

const cutApp = (a, b) => {
  const i = APP.indexOf(a);
  const j = APP.indexOf(b, i + a.length);
  return (i < 0 || j < 0) ? '' : APP.slice(i, j);
};
const CARD_BLOCK = cutApp('function coachObjectiveHtml(', 'function updateExerciseStatus(');
const ESC_BLOCK = (() => { const i = APP.indexOf('function escapeHtml('); return i < 0 ? '' : APP.slice(i, APP.indexOf('\n}', i)) + '\n}'; })();
const CONV_BLOCK = cutApp('function convertWeight(value, fromUnit, toUnit) {', '// A stored set weight');
const MEAS_BLOCK = cutApp('const _MEASURE_EXERCISES = {', 'function volumeForExercise(');
const E1RM_BLOCK = (() => { const i = APP.indexOf('function estimate1RM('); return i < 0 ? '' : APP.slice(i, APP.indexOf('\n}', i)) + '\n}'; })();

const mkEl = () => ({
  className: '', dataset: {}, innerHTML: '',
  classList: { add() {}, remove() {}, contains() { return false; } },
});
const cardCtx = { console, document: { createElement: mkEl }, module: { exports: {} } };
cardCtx.exports = cardCtx.module.exports;
vm.createContext(cardCtx);
vm.runInContext(ENGINE, cardCtx);
vm.runInContext(`
  var state = { settings: { unit: 'kg' }, quickMode: false };
  var MUSCLE_COLORS = { Chest: '#ee343b', Back: '#00a3ff' };
  ${CONV_BLOCK}
  ${MEAS_BLOCK}
  ${E1RM_BLOCK}
  ${ESC_BLOCK}
  ${CARD_BLOCK}
  globalThis.buildExerciseCard = buildExerciseCard;
`, cardCtx);

const EX_FIXTURE = {
  id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 3, reps: '5-8',
  rpe: '7-8', defaultRest: 150, notes: 'Main press. Full ROM, control the eccentric.', compound: true,
};
const render = (target) => cardCtx.buildExerciseCard(
  EX_FIXTURE, 1, null, { data: {} }, { data: {} }, false, { id: 'upperA' }, [], target).innerHTML;

const conObjetivo = render({ kg: 92.5, reps: '5-8', rpe: '7-8', source: 'rule', reason: 'x' });
yes(conObjetivo.includes('Objetivo:'), 'con objetivo: aparece "Objetivo:"');
yes(conObjetivo.includes('92,5'), 'con objetivo: el kg va con coma decimal (92,5)');
yes(conObjetivo.includes('placeholder="92.5"'), 'con objetivo: el placeholder del set es 92.5');
eq((conObjetivo.match(/placeholder="92\.5"/g) || []).length, 3,
  'con objetivo: las TRES series llevan el placeholder');
yes(conObjetivo.includes('coach-chip coach-chip-rule'), 'con objetivo: chip "regla"');
yes(conObjetivo.includes('>regla<'), 'con objetivo: el chip se lee en castellano');
eq((conObjetivo.match(/coach-objective/g) || []).length, 1, 'con objetivo: UNA sola línea de objetivo');
yes(!conObjetivo.includes('Main press. Full ROM'),
  'con objetivo: la razón sustituye a la nota estática');
yes(conObjetivo.includes('undefined') === false, 'con objetivo: no aparece "undefined"');
const delCoach = render({ kg: 95, reps: '5-8', rpe: '7-8', source: 'coach', reason: 'MANTENER' });
yes(delCoach.includes('coach-chip-coach') && delCoach.includes('>coach<'), 'objetivo del coach: chip "coach"');
yes(delCoach.includes('MANTENER'), 'objetivo del coach: su nota es la razón');

// EL INVARIANTE. Instantánea del HTML de v11.56 (sin objetivo). Sólo debe cambiar cuando se
// cambie la tarjeta A PROPÓSITO: si este bloque falla, alguien movió la tarjeta de los
// ejercicios que NO tienen kg objetivo.
const GOLDEN_V1156 = `
    <div class="exercise-header">
      <div class="exercise-info">
        <div class="exercise-name-row">
          <span class="exercise-name tappable" data-ex-id="bench-press">Barbell Bench Press <span class="tap-hint">history</span></span>
          <span class="muscle-badge" style="background:#ee343b20;color:#ee343b">Chest</span>
        </div>
        <div class="exercise-target">3 × 5-8 @ RPE 7-8 · Rest 2:30</div>
        
        
      </div>
      <div class="exercise-status" data-status="bench-press"></div>
    </div>
    <div class="exercise-body">
      <div class="exercise-body-inner">
        <div class="set-table">
          <div class="set-table-header">
            <div>Set</div>
            <div>kg</div>
            <div>Reps</div>
            <div>RPE</div>
            <div></div>
          </div>
          
      
      <div class="set-row" data-set="0">
        <div class="set-num">1</div>
        <input type="number" class="set-input" data-field="weight" placeholder="-" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="-" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px;font-size:12px">
          <option value="">RPE</option>
          <option value="6">6</option><option value="6.5">6.5</option><option value="7">7</option><option value="7.5">7.5</option><option value="8">8</option><option value="8.5">8.5</option><option value="9">9</option><option value="9.5">9.5</option><option value="10">10</option>
        </select>
        <button class="set-check" data-set-check="0">✓</button>
      </div>
    
      
      <div class="set-row" data-set="1">
        <div class="set-num">2</div>
        <input type="number" class="set-input" data-field="weight" placeholder="-" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="-" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px;font-size:12px">
          <option value="">RPE</option>
          <option value="6">6</option><option value="6.5">6.5</option><option value="7">7</option><option value="7.5">7.5</option><option value="8">8</option><option value="8.5">8.5</option><option value="9">9</option><option value="9.5">9.5</option><option value="10">10</option>
        </select>
        <button class="set-check" data-set-check="1">✓</button>
      </div>
    
      
      <div class="set-row" data-set="2">
        <div class="set-num">3</div>
        <input type="number" class="set-input" data-field="weight" placeholder="-" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="-" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px;font-size:12px">
          <option value="">RPE</option>
          <option value="6">6</option><option value="6.5">6.5</option><option value="7">7</option><option value="7.5">7.5</option><option value="8">8</option><option value="8.5">8.5</option><option value="9">9</option><option value="9.5">9.5</option><option value="10">10</option>
        </select>
        <button class="set-check" data-set-check="2">✓</button>
      </div>
    
        </div>
        <div class="exercise-notes">Main press. Full ROM, control the eccentric.</div>
        <textarea class="ex-note" data-ex-note="bench-press" placeholder="Notes for this exercise..." rows="1"></textarea>
        <button class="btn-swap" data-swap-muscle="Chest" data-swap-ex-id="bench-press">↔ Swap exercise</button>
        
      </div>
    </div>
  `;
const sinObjetivo = render(null);
yes(!sinObjetivo.includes('Objetivo:'), 'sin objetivo: NO aparece la línea "Objetivo:"');
yes(!sinObjetivo.includes('coach-objective'), 'sin objetivo: ni la clase');
yes(sinObjetivo.includes('Main press. Full ROM'), 'sin objetivo: la nota estática sigue en su sitio');
yes(sinObjetivo.includes('placeholder="-"'), 'sin objetivo y sin historial: el placeholder es "-"');
if (sinObjetivo === GOLDEN_V1156) {
  ok('sin objetivo: HTML IDÉNTICO byte a byte al de v11.56');
} else {
  const a = sinObjetivo.split('\n');
  const b = GOLDEN_V1156.split('\n');
  let linea = -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) if (a[i] !== b[i]) { linea = i; break; }
  bad(`sin objetivo: el HTML CAMBIÓ respecto a v11.56 (línea ${linea})\n       obtuve : ${JSON.stringify(a[linea])}\n       esperaba: ${JSON.stringify(b[linea])}`);
}
// Y con `source:'none'` (ejercicio de medida, o estrenado hoy) el resultado es el mismo.
const sinKg = render({ kg: null, reps: '5', rpe: '-', source: 'none', reason: 'Se mide en cm, no en kg' });
eq(sinKg, GOLDEN_V1156, "source:'none' pinta exactamente la tarjeta de v11.56");
// Un objetivo sin kg pero con regla (ab wheel) sí cambia la nota, pero no pinta línea ni placeholder.
const abWheel = render({ kg: null, reps: '8-12', rpe: '-', source: 'rule', reason: 'Sube el recorrido o +1 rep' });
yes(!abWheel.includes('Objetivo:'), 'ab wheel: sin línea de objetivo (no hay kg)');
yes(abWheel.includes('Sube el recorrido'), 'ab wheel: pero sí su razón en las notas');
yes(abWheel.includes('placeholder="-"'), 'ab wheel: y el placeholder no inventa un peso');

// ── 11. Migración de re-anclaje + hito −5 kg (v11.57, decisión de Julian 2026-09-07) ──────────
// El fallo que impide: que el deload vuelva a caer en la semana del 7-sep (ancla automática del
// 16-ago) o que el hito de −5 kg se pierda en una instalación nueva.
console.log('');
console.log('11. Migración coach-v2-reanchor-2026-09-07 e hito de −5 kg');
const MIG = APP.slice(APP.indexOf('async function runMigrations'));
yes(MIG.includes("done.data.includes('coach-v2-reanchor-2026-09-07')"), 'runMigrations tiene la migración de re-anclaje');
yes(MIG.includes("st.deloadAnchorDate = '2026-09-07'"), 'fija deloadAnchorDate al lunes 2026-09-07');
yes(MIG.includes('milestoneKg = 82'), 'registra el hito milestoneKg = 82');
yes(APP.indexOf('await ensureDeloadAnchor()') < APP.indexOf('await runMigrations()'),
  'la migración corre DESPUÉS de ensureDeloadAnchor (gana la decisión del usuario, no la semilla)');
yes(E.COACH_GOALS_DEFAULT.primary.milestoneKg === 82, 'COACH_GOALS_DEFAULT.primary.milestoneKg = 82 para instalaciones nuevas');
yes(E.blockWeekFromDates('2026-09-07', '2026-09-07', 5).index === 1
  && E.blockWeekFromDates('2026-10-05', '2026-09-07', 5).isDeload === true
  && E.blockWeekFromDates('2026-09-13', '2026-09-07', 5).isDeload === false,
  'con el ancla nueva: 7-sep = semana 1, 13-sep sigue en semana 1, 5-oct = deload');

// ── 12. Inc 4 — clasificación desde el dato y frescura del dato de hoy (v11.58) ───────────────
// Los fallos que impide, todos silenciosos: `whoopFetchTodayRecovery` definida pero nunca
// llamada desde `whoopSyncData` (la ruta directa no se ejecutaría jamás y a la mañana seguiría
// el dato de ayer); un `toISOString()` que vuelva a colar la fecha UTC como "hoy" (F-14, la app
// ya pagó una migración por esto); `getWhoopContext` volviendo a coger el último elemento del
// array; `toSession` sin la tabla SESSION_CLASS (F-7); `finishWorkout` sin la instantánea.
console.log('');
console.log('12. Inc 4 · clasificación por dato + dato de hoy fresco (v11.58)');
const WHOOPJS = readFileSync('app/whoop.js', 'utf8');
const whoopFn = (decl) => {
  const i = WHOOPJS.indexOf(decl);
  if (i < 0) return '';
  const j = WHOOPJS.indexOf('\n}', i);
  return WHOOPJS.slice(i, j < 0 ? WHOOPJS.length : j);
};
yes(/async function whoopFetchTodayRecovery\(/.test(WHOOPJS), 'whoop.js define whoopFetchTodayRecovery()');
yes(/window\.whoopFetchTodayRecovery = whoopFetchTodayRecovery/.test(WHOOPJS), 'y la expone en window');
const WSD_SRC = whoopFn('async function whoopSyncData() {');
yes(/_whoopEnsureTodayFresh\(/.test(WSD_SRC), 'whoopSyncData llama al paso de frescura del dato de hoy');
const ETF_SRC = whoopFn('async function _whoopEnsureTodayFresh(');
yes(/whoopFetchTodayRecovery\(/.test(ETF_SRC), 'y ese paso llama a whoopFetchTodayRecovery()');
yes(/todaySource = 'whoop-direct'/.test(ETF_SRC) && /todaySource = 'missing'/.test(ETF_SRC),
  "marca todaySource 'whoop-direct' o 'missing'");
yes(/_whoopTodayMissingReason\(\)/.test(ETF_SRC), 'y adjunta el motivo concreto cuando falta');
const TMR_SRC = whoopFn('function _whoopTodayMissingReason()');
yes(/aún tiene el de ayer/.test(TMR_SRC) && /no puntuó la noche/.test(TMR_SRC) && /reconectarse en Ajustes/.test(TMR_SRC),
  'los tres motivos: sin ruta directa / hay que reconectar / WHOOP no ha puntuado');
yes(/_whoopPersistTodayWellness\(/.test(ETF_SRC), 'persiste el dato de hoy en el store wellness');
const PTW_SRC = whoopFn('async function _whoopPersistTodayWellness(');
yes(/smartPut\('wellness'/.test(PTW_SRC), 'y lo hace con smartPut (mismo camino que intervals → sube a Supabase)');
yes(/Object\.assign\(\{\}, existing/.test(PTW_SRC), 'mezclando con la fila existente (no pisa peso/pasos/CTL)');
yes(/readinessSource: 'whoop-direct'|readinessSource = 'whoop-direct'/.test(PTW_SRC), "y marca readinessSource:'whoop-direct'");
// F-14: ni un solo "hoy" derivado de UTC en whoop.js. Se cuentan usos REALES (las líneas de
// comentario que explican el bug histórico no cuentan).
const WHOOP_CODE = WHOOPJS.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const isoUses = (WHOOP_CODE.match(/toISOString\(\)/g) || []).length;
eq(isoUses, 0, 'whoop.js no usa toISOString() en ninguna fecha (F-14: todo local)');
yes(/function _whoopLocalDateStr\(/.test(WHOOPJS), 'define _whoopLocalDateStr() (whoop.js carga antes que app.js)');
// La caché de 10 min no puede tapar la falta del dato de hoy.
yes(/_whoopTodayAttemptFresh\(/.test(WSD_SRC), 'la comprobación de caché mira la ventana de reintento del dato de hoy');
yes(/hasToday/.test(WSD_SRC), 'y si al payload cacheado le falta hoy, se resincroniza');
const FTR_SRC = whoopFn('async function whoopFetchTodayRecovery(');
yes(/whoopOAuthConnected\(\)/.test(FTR_SRC), 'whoopFetchTodayRecovery exige OAuth');
yes(/whoopGetRecoveryCollection\(/.test(FTR_SRC), 'pide /v2/recovery de los últimos 2 días');
yes(/whoopGetSleep\(/.test(FTR_SRC), 'y el sueño de anoche');
yes(/score_state === 'SCORED'/.test(FTR_SRC), 'sólo acepta registros SCORED');
yes(/return null/.test(FTR_SRC) && /catch/.test(FTR_SRC), 'y ante cualquier error devuelve null (nunca lanza)');
yes(/whoop_today_attempt/.test(WHOOPJS), 'la marca del intento por día vive en localStorage');
yes(/localStorage\.removeItem\('whoop_today_attempt'\)/.test(APP), '"Sync Now" borra la marca para reintentar ya');
// app.js: hoy es hoy.
const GWC = fnSrc('async function getWhoopContext()');
yes(!/recovery\[[^\]]*length - 1\]/.test(GWC), 'getWhoopContext NO usa recovery[recovery.length - 1] (F-6)');
yes(/\.find\(r => r\.date === t\)/.test(GWC), 'usa find(r => r.date === today())');
yes(/lastAvailable/.test(GWC), 'y expone lastAvailable para pintar el último con su fecha');
yes(/source: 'none'/.test(GWC) && /'whoop-direct'/.test(GWC), "devuelve source 'none' | 'whoop-direct' | 'intervals'");
const CTA = fnSrc('async function computeTrainingAdvisory()');
yes(/whoop\.reason/.test(CTA), 'el advisory traslada el motivo de la falta de dato');
// v11.59: la matriz (y con ella el `confidence:'low'` del unknown) vive en el motor puro. Lo que
// el advisory tiene que hacer es DELEGAR y devolver lo que el motor decida.
yes(/adjustSessionForReadiness\(/.test(CTA), 'y delega la matriz en adjustSessionForReadiness(');
yes(/confidence: adj\.confidence/.test(CTA), 'devolviendo la confianza del motor (low con unknown)');
yes(/color === 'unknown' \? 'low'/.test(ENGINE), "y el motor fija 'low' cuando el color es unknown");
const RRH = fnSrc('async function renderRecoveryHero()');
yes(/whoopDayLabel\(/.test(RRH), 'renderRecoveryHero etiqueta la fecha del dato (hoy/ayer/hace N días)');
yes(/Sin dato de hoy/.test(RRH), 'y avisa "Sin dato de hoy" con el motivo');
// v11.59: la fatigue card ya no puntúa nada porque ya no existe (se comprueba en §13).
// F-7: la clasificación sale del dato.
const TOS = fnSrc('function toSession(record, originStore)');
yes(/SESSION_CLASS/.test(TOS), 'toSession usa la tabla SESSION_CLASS');
yes(/fallback regex/.test(TOS), 'y la regex queda como fallback con aviso');
yes(/const SESSION_CLASS_EXTRA = \{/.test(APP), 'existe el mapa explícito (free, hybrid1, legacy)');
yes(/function sessionClassMap\(\)/.test(APP), 'y el constructor perezoso desde IDEAL_BLOCK_V1');
const FIN = fnSrc('async function finishWorkout()');
yes(/workout\.family = /.test(FIN), 'finishWorkout guarda la instantánea family');
yes(/workout\.subtype = /.test(FIN) && /workout\.budgetWeight = /.test(FIN), 'con subtype y budgetWeight');
yes(!/workout\.sessionType = /.test(FIN), 'y NO guarda sessionType (activaría la rama de `sessions`)');


// ── 13. Inc 5 — un readiness para todo, y la sesión ajustada llega al entreno (v11.59) ────────
//
// Los fallos que impide, todos silenciosos y todos ya vistos en este proyecto:
//
//   · El motor existe, sus tests pasan y `computeTrainingAdvisory` sigue con la matriz vieja: el
//     readiness único no se usa y siguen habiendo dos criterios. El motor que nadie llama parece
//     hecho y no lo está.
//   · Vuelve el score compuesto ("Push hard today") en Stats y otra vez hay tres lecturas de la
//     misma noche que se contradicen (F-5).
//   · `captureWorkoutState` no guarda los ajustes: al reabrir la app los ejercicios que el coach
//     quitó VUELVEN, y las series que ya habías apuntado se emparejan por exerciseId contra una
//     lista distinta. La sesión ajustada se deshace sola a mitad de entreno.
//   · `finishWorkout` no sella con qué recuperación se arrancó: el sistema pierde la única forma
//     de contrastar su propia propuesta ("te propuse quitar el box jump y lo hiciste igual").
//   · La rama muerta del deload sigue ahí (F-8) aparentando ser un guardarraíl.
//   · El check-in de 2 toques pinta botones contra ids que `index.html` no tiene, o su guardado
//     hace un `put` plano sobre `wellness` y se lleva por delante el histórico de intervals.icu.
//   · Y el invariante de v11.57: la tarjeta de ejercicio SIN objetivo y SIN ajuste tiene que
//     seguir siendo byte a byte la de v11.56 (§10 lo comprueba; aquí se fija que `adjustments`
//     sea opcional y por defecto null).
console.log('');
console.log('13. Inc 5 · readiness único, sesión ajustada y check-in (v11.59)');

// 13.a El motor puro
yes(typeof E.computeReadinessFrom === 'function', 'coach-engine exporta computeReadinessFrom()');
yes(typeof E.adjustSessionForReadiness === 'function', 'coach-engine exporta adjustSessionForReadiness()');
yes(typeof E._coachTrimAccessories === 'function', 'coach-engine exporta _coachTrimAccessories()');
eq(E.READ_CUTOFFS.green, 67, 'los cortes de color siguen siendo 67/34 (getRecoveryColor)');
eq(E.READ_CUTOFFS.yellow, 34, '…el amarillo también');
yes(Array.isArray(E.READ_RULE_IDS) && E.READ_RULE_IDS.includes('READ-002'),
  'declara READ-002 (≥2 señales concordantes) entre sus reglas');
// READ-003: ni un score, ni una dosis derivada de un score.
const R_SRC = ENGINE.slice(ENGINE.indexOf('function computeReadinessFrom('), ENGINE.indexOf('function _readRound5('));
yes(!/score:/.test(R_SRC.replace(/wt\.score|inp\.whoopToday|\bscore\b\s*[!=]/g, '')),
  'computeReadinessFrom no devuelve ningún score compuesto');
yes(!/0\.55|0\.70|0\.3\b/.test(R_SRC), 'y no queda ninguna ponderación del score viejo');
yes(!/protein|proteína/i.test(R_SRC), 'la proteína ya no cuenta como fatiga (era una ponderación inventada)');
const ADJ_SRC = ENGINE.slice(ENGINE.indexOf('function adjustSessionForReadiness('));
yes(!/\.kg\s*=|kg:/.test(ADJ_SRC), 'adjustSessionForReadiness no escribe ningún kg (READ-003)');
yes(/_readCopySession\(/.test(ADJ_SRC), 'trabaja sobre una COPIA de la sesión planificada');

// 13.b El envoltorio en app.js
yes(/async function computeReadiness\(\{ date \} = \{\}\)/.test(APP), 'app.js define computeReadiness({date})');
const CR_SRC = fnSrc('async function computeReadiness(');
yes(/computeReadinessFrom\(/.test(CR_SRC), 'y llama al motor puro');
yes(/getWhoopContext\(\)/.test(CR_SRC), 'el dato de hoy sale de getWhoopContext (date-checked)');
yes(/source !== 'none'/.test(CR_SRC), "…y sólo cuenta si su source no es 'none'");
yes(/whoopMissingReason/.test(CR_SRC), 'pasa el motivo real cuando falta el dato de hoy');
yes(/dbGetAll\('wellness'\)/.test(CR_SRC), 'lee el histórico del store wellness (tendencias 7d/28d)');
yes(/state\._readinessCache/.test(CR_SRC), 'y cachea por día');
yes(/whoopLastAvailable/.test(CR_SRC), 'expone el último dato disponible SÓLO para pintarlo con su fecha');
yes(/function invalidateReadiness\(\)/.test(APP), 'existe invalidateReadiness()');
// La caché tiene que caerse en los cuatro momentos en que la respuesta cambia.
for (const [fn, label] of [
  ['async function finishWorkout(', 'finishWorkout'],
  ['async function intervalsIcuSync(', 'intervalsIcuSync'],
  ['async function saveCheckin(', 'saveCheckin'],
  ['async function runFullSync(', 'runFullSync'],
]) {
  yes(/invalidateReadiness\(\)/.test(fnSrc(fn)), `${label}() invalida la caché del readiness`);
}
yes(/invalidateReadiness\(\);[\s\S]{0,400}renderTrainingAdvisory\(\)/.test(APP),
  'y al llegar el dato de hoy en init se invalida ANTES de repintar la tarjeta');

// 13.c El advisory delega
const CTA13 = fnSrc('async function computeTrainingAdvisory()');
yes(/computeReadiness\(/.test(CTA13), 'computeTrainingAdvisory() llama computeReadiness(');
yes(/adjustSessionForReadiness\(/.test(CTA13), 'y adjustSessionForReadiness(');
yes(/_coachAdjustCtx\(/.test(CTA13), 'con el ctx compartido (_coachAdjustCtx)');
for (const k of ['readiness', 'adjusted: adj.session', 'changes: adj.changes']) {
  yes(CTA13.includes(k), `devuelve ${k}`);
}
yes(/recommendation: adj\.mode/.test(CTA13), 'y la recomendación ES el modo del motor');
// El flag redundante no puede volver a contar como segunda señal (F-6).
const ACTX_SRC = fnSrc('function _coachAdjustCtx(');
yes(/f\.type !== 'recovery'/.test(ACTX_SRC), "el flag redundante 'recovery' no cuenta como 2ª señal");
yes(/isMainLift/.test(ACTX_SRC), 'y pasa isMainLift (protege el RDL del recorte de accesorios)');

// 13.d La tarjeta de Home
const RTA_SRC = fnSrc('async function renderTrainingAdvisory()');
yes(/_blockEyebrow\(/.test(RTA_SRC), 'la tarjeta lleva "Semana N/5 · build" en el eyebrow');
yes(/coach-signals/.test(RTA_SRC), 'pinta las señales disparadas');
yes(/Te propongo la sesión ajustada/.test(RTA_SRC), 'y el título de la propuesta del wireframe');
yes(/Hacer la ajustada/.test(RTA_SRC) && /Hacer la planificada/.test(RTA_SRC),
  'con los dos botones [Hacer la ajustada] [Hacer la planificada]');
yes(/Registrar la alternativa/.test(RTA_SRC), 'y [Registrar la alternativa] cuando cambia el día');
yes(/t3LogAlternative\(/.test(RTA_SRC), 'que reusa t3LogAlternative (no duplica el registro)');
yes(/Vos decidís\. Las dos quedan registradas\./.test(RTA_SRC), 'el pie nuevo');
// El pie viejo ("no cambia tu plan") ya no puede estar: ahora SÍ cambia la sesión del día. Se
// mira el CÓDIGO, no los comentarios: los que explican qué se retiró sí pueden citar la frase.
const APP_CODE = APP.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
yes(!/no cambia tu plan/.test(APP_CODE), 'fuera el pie "es una sugerencia — no cambia tu plan"');
yes(/type: 'readiness-adjust'/.test(RTA_SRC), "los dos botones registran type:'readiness-adjust'");
yes(/outcome: 'accepted'|'accepted'/.test(RTA_SRC) && /'declined'/.test(RTA_SRC),
  'con outcome accepted/declined según lo que elija');
yes(/source: 'readiness'/.test(RTA_SRC), "y source:'readiness'");
yes(/startWorkout\(planned\.sessionId, \{ adjustments \}\)/.test(RTA_SRC),
  '"Hacer la ajustada" arranca con los ajustes');
yes(/startWorkout\(planned\.sessionId\)/.test(RTA_SRC), 'y "Hacer la planificada" sin ellos');
yes(!/disabled/.test(RTA_SRC), 'ningún botón se deshabilita (los guardarraíles avisan, no bloquean)');

// 13.e Check-in de 2 toques
const CHK_SRC = fnSrc('function _coachCheckinHtml(');
yes(/status !== 'insufficient'/.test(CHK_SRC), 'el check-in sólo aparece si falta el dato de hoy');
yes(/¿Cómo dormiste\?/.test(CHK_SRC) && /¿Cómo te sientes\?/.test(CHK_SRC), 'las dos preguntas del plan');
yes(/_CHECKIN_BANDS/.test(CHK_SRC) && /'<6h', '6-7', '7-8', '>8'/.test(APP), 'las cuatro bandas de sueño');
yes(/state\._checkinDismissed/.test(CHK_SRC), 'y se puede descartar');
const SCK_SRC = fnSrc('async function saveCheckin(');
yes(/smartPut\('wellness'/.test(SCK_SRC), "el check-in se guarda con smartPut('wellness') (sube a Supabase)");
yes(/Object\.assign\(\{\}, existing \|\| \{\}/.test(SCK_SRC),
  'MEZCLANDO con la fila existente (no pisa peso/pasos/CTL de intervals.icu)');
yes(/subjective/.test(SCK_SRC), 'en el campo subjective');
yes(/invalidateReadiness\(\)/.test(SCK_SRC), 'invalida el readiness');
yes(/renderTrainingAdvisory\(\)/.test(SCK_SRC), 'y repinta la tarjeta');
// Y el camino inverso: la sincronización de intervals.icu no puede borrar el check-in.
const WPERSIST = readFileSync('app/whoop.js', 'utf8');
yes(/prev && prev\.subjective/.test(WPERSIST),
  'intervalsFetchWellness conserva `subjective` al reescribir la fila (si no, el check-in duraría minutos)');
// El descarte es SÓLO en memoria: mañana se vuelve a preguntar.
yes(!/checkinDismissed'/.test(APP) && !/dbPut\('settings', \{ key: 'checkin/.test(APP),
  'el descarte del check-in no se persiste (es "ahora no", no una preferencia)');

// 13.f startWorkout / buildExerciseCard / capture / restore / finish
const SW13 = fnSrc('async function startWorkout(');
yes(/opts\.adjustments/.test(SW13), 'startWorkout acepta opts.adjustments');
yes(/adjustments\.dropIds/.test(SW13), 'y filtra los ejercicios quitados por dropIds');
yes(/fuera\.has\(e\._origId \|\| e\.id\)/.test(SW13), '…comparando también por _origId (el swap sigue vivo)');
yes(/state\.activeAdjustments = adjustments/.test(SW13), 'guarda state.activeAdjustments');
yes(/state\.activeReadiness/.test(SW13), 'y la instantánea del readiness');
yes(/_coachReadinessStamp\(await computeReadiness\(\)\)/.test(SW13),
  'que se calcula también arrancando la planificada (el hero no pasa ajustes)');
yes(/ajustada \(recuperación/.test(SW13), 'el encabezado dice que la sesión está ajustada');
yes(/, adjustments\)\)/.test(SW13), 'y pasa los ajustes a buildExerciseCard');
// El repintado por quick mode no puede perderlos: devolvería los ejercicios quitados.
yes(/startWorkout\(state\.activeSession, \{ adjustments: state\.activeAdjustments/.test(APP),
  'el toggle de quick mode repinta CON los ajustes');
const CARD13 = fnSrc('function buildExerciseCard(');
yes(/function buildExerciseCard\(ex, exIdx, previous, restSettings, exerciseNotes, deload, session, allWorkouts, target = null, adjustments = null\)/.test(APP),
  'buildExerciseCard mantiene la firma con `adjustments = null` al final');
yes(/adjustments && adjustments\.setDelta && ex\.compound/.test(CARD13), 'aplica setDelta sólo a compuestos');
yes(/Math\.max\(2, numSets \+ Number\(adjustments\.setDelta\)\)/.test(CARD13), 'con suelo de 2 series');
yes(/RPE ≤\$\{rpeCap\}/.test(CARD13), 'y pinta "RPE ≤7" cuando hay tope');
yes(/deload && ex\.rpe !== '-' \? 'RPE 5-6'/.test(CARD13), 'el deload sigue mandando sobre el tope');
const CAP13 = fnSrc('function captureWorkoutState(');
yes(/adjustments: state\.activeAdjustments/.test(CAP13), 'captureWorkoutState guarda `adjustments`');
yes(/readinessAtStart: state\.activeReadiness/.test(CAP13), 'y `readinessAtStart`');
const CLR13 = fnSrc('async function clearActiveWorkout(');
yes(/state\.activeAdjustments = null/.test(CLR13) && /state\.activeReadiness = null/.test(CLR13),
  'clearActiveWorkout limpia los dos');
const FIN13 = fnSrc('async function finishWorkout()');
yes(/readinessAtStart: state\.activeReadiness \|\| null/.test(FIN13), 'finishWorkout sella readinessAtStart');
yes(/adjusted: !!state\.activeAdjustments/.test(FIN13), 'y `adjusted`');
yes(/workout\.adjustments = \{/.test(FIN13), 'con el resumen del ajuste cuando lo hubo');
yes(FIN13.indexOf('readinessAtStart') < FIN13.indexOf('invalidateReadiness'),
  'y lo hace ANTES de invalidar/limpiar el estado');

// 13.g Stats: la lista de señales sustituye al score
yes(!/function renderFatigueScore/.test(APP), 'renderFatigueScore ya NO existe en app.js');
yes(!/Push hard/.test(APP_CODE), 'ni su consejo "Push hard" (dose-from-composite, READ-003)');
yes(!/Moderate fatigue/.test(APP_CODE), 'ni "Moderate fatigue"');
yes(!/fatigue-bar|fatigue-score/.test(APP_CODE), 'ni la barra ni el número del score');
yes(/renderReadinessSignals/.test(APP), 'renderStats llama renderReadinessSignals');
yes(/async function renderReadinessSignals\(\)/.test(COACHJS), 'que vive en coach.js');
const RRS_SRC = COACHJS.slice(COACHJS.indexOf('async function renderReadinessSignals('));
yes(/computeReadiness\(\)/.test(RRS_SRC), 'y lee el MISMO computeReadiness que Home (una sola verdad)');
yes(/confianza alta/.test(RRS_SRC), 'muestra la confianza');
yes(/sin dato/.test(RRS_SRC) && /s\.reason/.test(RRS_SRC), 'y las señales insuficientes con su motivo');
yes(/whoopDayLabel\(/.test(RRS_SRC), 'conserva la honestidad de v11.58: el dato de ayer, con su fecha');
yes(!/Push hard|score|bar/i.test(RRS_SRC.replace(/whoopDayLabel|last\.score|s\.score/g, '')),
  'sin score, sin barra y sin consejo');
yes(HTML.indexOf('id="readiness-signals"') > 0, 'index.html tiene #readiness-signals');
yes(HTML.indexOf('id="fatigue-card"') < 0, 'y ya no tiene #fatigue-card');

// 13.h Deload reactivo (F-8)
const CDN_SRC = fnSrc('async function checkDeloadNeeded(');
yes(/computeReadiness\(\)/.test(CDN_SRC), 'checkDeloadNeeded consume computeReadiness()');
yes(/deloadHint/.test(CDN_SRC), 'y decide por deloadHint (READ-008)');
yes(!/Math\.floor\(\(wk - 1\) \/ 4\)/.test(CDN_SRC), 'fuera la aritmética muerta de "N semanas sin deload" (F-8)');
yes(!/weeksSinceLast/.test(CDN_SRC), 'y su variable');
yes(/deloadMonday/.test(CDN_SRC), 'dice cuándo es el deload PROGRAMADO');
yes(/Próximo deload programado/.test(CDN_SRC), 'con el texto del plan');
const RDR_SRC = fnSrc('async function renderDeloadReminder(');
yes(/Proponer adelantar el deload/.test(RDR_SRC), 'el banner lleva el botón de proponer');
yes(/type: 'deload-request'/.test(RDR_SRC), "que registra type:'deload-request'");
yes(/Anotado para el coach/.test(RDR_SRC), 'y avisa "Anotado para el coach"');
yes(!/deloadAnchorDate =/.test(RDR_SRC), 'y NO mueve el ancla (eso lo aprueba Julian con el coach)');

// 13.i Versión y CSS
eq(vSw, vHtml, 'CACHE_NAME del service worker == versión de index.html (otra vez, tras el bump)');
yes(vNum(vHtml) >= vNum('11.59'), `la versión (v${vHtml}) es >= v11.59`);
for (const clase of ['coach-signals', 'coach-proposal', 'coach-changes', 'coach-btn', 'coach-btn-primary',
                     'coach-checkin', 'coach-checkin-opt', 'coach-checkin-close',
                     'readiness-signals', 'rs-row', 'rs-fired', 'rs-none']) {
  yes(new RegExp(`\\.${clase}[\\s,{:]`).test(CSS), `.${clase} existe en style.css`);
}

console.log('');
console.log(failed === 0
  ? '✅ Coach v2 cableado: módulo, stores, sync, plan, decisiones, bloque, dato de hoy y readiness que ajusta.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
