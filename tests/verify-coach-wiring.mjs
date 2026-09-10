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

import { readFileSync, readdirSync } from 'node:fs';
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
// v11.67 (E-6): la puerta de la pausa y la referencia de la rampa pasan a ser DEL HUECO. Con
// `lastCardioDaysAgo(ds)` global, una bici de anteayer dejaba que el miércoles siguiera
// rampando después de un mes sin correr — la rampa iba por `block.index`, no por lo hecho.
yes(/_cardioSlotHistory\(jsDay, ds, kind\)/.test(GP_SRC),
  'lee el historial del hueco con _cardioSlotHistory(jsDay, ds, kind)');
yes(/lastCardioDaysAgo: h\.lastDaysAgo/.test(GP_SRC),
  'y la puerta de los 14 días mira ese hueco, no todo el cardio');
yes(/history: h\.history/.test(GP_SRC), 'y pasa los minutos a progressCardioMin(');
yes(/function _cardioSlotHistory\(/.test(APP), '_cardioSlotHistory() existe');
yes(/r\.finisher !== wantFinisher/.test(fnSrc('async function _cardioSlotHistory(')),
  'y separa el finisher post-fuerza de la sesión de cardio del mismo día de la semana');
yes(/function lastCardioDaysAgo\(/.test(APP),
  'lastCardioDaysAgo() sigue existiendo (la usa el fallback de la carrera de la semana)');

// La invalidación de la caché: sin ella el cardio recién registrado tarda un minuto en contar.
// v11.66 (E-12): `logRun` se borró — era código muerto (cero llamadores, y sus inputs no
// existen en index.html desde el logger unificado de cardio). Quedan los tres vivos.
for (const fn of ['async function logCardio(', 'async function logZ2Finisher(', 'async function intervalsIcuSync(']) {
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
// v11.67 (E-5): la descarga es POR EJERCICIO (`deloadFor`), así que la comprobación también.
yes(/const exDeload = typeof opts\.deloadFor === 'function' \? !!opts\.deloadFor\(ex\.id\) : !!opts\.deload;/.test(CST_SRC),
  'la descarga se resuelve por ejercicio (deloadFor) y no para toda la sesión');
yes(/if \(exDeload && coachTarget && !fromPlanV2\) coachTarget = null;/.test(CST_SRC),
  'en descarga se descarta el objetivo del cron legacy (no conoce el bloque) y manda la regla');
yes(/deload: exDeload,/.test(CST_SRC), 'y suggestSetTarget recibe el deload de ESE ejercicio');
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
yes(/function buildExerciseCard\(ex, exIdx, previous, restSettings, exerciseNotes, deload, session, allWorkouts, target = null\)/.test(APP),
  'buildExerciseCard recibe `target` al final (compatible con llamadas viejas)');
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
yes(/'last'/.test(OBJ_SRC) && /'rule'/.test(OBJ_SRC) && /'coach'/.test(OBJ_SRC),
  'los tres chips (en inglés desde v11.67): coach · rule · last');
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
// v11.67 (E-5): LA DESCARGA ES POR EJERCICIO CUANDO EL PLAN ES DEL COACH.
//
// El fallo que este bloque impide ahora: `deload` era `false` para TODO el plan en cuanto el
// autor era `coach-llm`, con el argumento de que el coach ya trae el volumen de la descarga.
// Cierto para los ejercicios que traen `target`; falso para los demás — un accesorio que el
// coach no tocó recibía progresión normal en semana de deload, contra G-H3 y LOAD-004. Y sigue
// en pie lo de v11.61: la sesión LIBRE nunca recibe el recorte (partiría a la mitad las series
// que acabas de elegir a mano).
yes(/const weekIsDeload = baseSession\.adHoc \? false : isDeloadWeek\(wk\);/.test(SW_SRC),
  'la sesión libre sigue sin deload (comportamiento intacto), y el resto lo decide isDeloadWeek');
yes(/const deloadFor = \(exId\) => weekIsDeload && !\(coachAuthored && _coachHasTargetFor\(sessionId, exId\)\);/.test(SW_SRC),
  'sólo se libran del recorte los ejercicios con target del coach (deloadFor por ejercicio)');
yes(/function _coachHasTargetFor\(/.test(APP), '_coachHasTargetFor() existe');
yes(/hit && hit\.target/.test(fnSrc('function _coachHasTargetFor(')),
  '…y mira `target` en el ejercicio de la sesión del plan activo');
yes(/computeSessionTargets\(sessionId, faltan, \{ deloadFor, allWorkoutsDesc \}\)/.test(SW_SRC),
  'los objetivos se calculan con el predicado, no con un booleano de sesión');
yes(/computeBlocks\(session, deloadFor\)/.test(SW_SRC),
  'y la estimación de tiempo también (si un ejercicio recorta series, el "~52 min" lo refleja)');
yes(/buildExerciseCard\(ex, idx, previous, restSettings, exerciseNotes, deloadFor\(ex\.id\)/.test(SW_SRC),
  'cada tarjeta recibe su propio deload');
// El fallo que esto arregla de paso: un set marcado sin escribir peso se guardaba con weight 0
// y desaparecía del historial, del tonelaje y del 1RM.
yes(/wIn\.value === '' && isFinite\(parseFloat\(wIn\.placeholder\)\)/.test(SW_SRC),
  'el check acepta el objetivo: rellena el peso desde el placeholder si está vacío');
yes(/wIn\.value = wIn\.placeholder/.test(SW_SRC), '…escribiendo el placeholder tal cual');
const CAP_SRC = fnSrc('function captureWorkoutState(');
yes(/targets: state\.activeTargets/.test(CAP_SRC), 'captureWorkoutState() guarda los objetivos');
const RES_SRC = fnSrc('async function restoreActiveWorkout(');
yes(/startWorkout\(saved\.sessionId, \{ targets: saved\.targets \|\| null \}\)/.test(RES_SRC),
  'restoreActiveWorkout() repone los MISMOS objetivos (y nada más: v11.62 no hay ajustes)');
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
// v11.67 (E-8): el "próxima vez" se calculaba con `deload: false` "para no adivinar el
// calendario". Pero el calendario del bloque está anclado a una fecha y se sabe con exactitud:
// la tarjeta del viernes prometía "la próxima: 95 kg" y el lunes de descarga la pantalla
// prescribía 85. Ahora usa el deload REAL de la semana siguiente.
yes(/const nextWeekDeload = /.test(ATT_SRC), 'el "próxima vez" resuelve el deload de la semana que viene');
yes(/blockWeek\(d\)\.isDeload/.test(ATT_SRC), '…con la misma aritmética anclada que la tarjeta de ese día');
// v11.73 (C-24): la suma de días ya no se escribe a mano — es `addDays()`, la única del
// proyecto. Lo que hay que seguir afirmando es el +7, no cómo se calcula.
yes(/addDays\(ds, 7\)/.test(ATT_SRC), '…mirando +7 días (la próxima exposición del ejercicio)');
yes(/deload: nextWeekDeload,/.test(ATT_SRC), '…y se lo pasa a suggestSetTarget');
yes(!/deload: false/.test(ATT_SRC), 'y ya no hay un `deload: false` que prometa una subida imposible');

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
// v11.68 (V-9): la guarda dejo de ser `typeof X === 'function' ? X() : null` y paso a
// `safeCall('X')`, que es la UNICA forma de llamar a otro <script> desde app.js. Lo que este
// test protege sigue igual: coach.js puede no haber cargado y Home tiene que pintarse.
yes(/safeCall\('renderCoachReadout'\)/.test(HOME_SRC),
  "renderHomeView() llama renderCoachReadout() por safeCall (coach.js es otro <script>)");

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
yes(/Next time is already applied on the card/.test(RCR_SRC), 'lleva el pie del wireframe (§B.1)');
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
yes(conObjetivo.includes('Target:'), 'con objetivo: aparece "Target:"');
yes(conObjetivo.includes('92.5'), 'con objetivo: el kg va con punto decimal (92.5)');
yes(conObjetivo.includes('placeholder="92.5"'), 'con objetivo: el placeholder del set es 92.5');
eq((conObjetivo.match(/placeholder="92\.5"/g) || []).length, 3,
  'con objetivo: las TRES series llevan el placeholder');
yes(conObjetivo.includes('coach-chip coach-chip-rule'), 'con objetivo: chip "regla"');
yes(conObjetivo.includes('>rule<'), 'con objetivo: el chip se lee');
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
        <select class="set-input" data-field="rpe" style="padding:8px 2px">
          <option value="">RPE</option>
          <option value="6">6</option><option value="6.5">6.5</option><option value="7">7</option><option value="7.5">7.5</option><option value="8">8</option><option value="8.5">8.5</option><option value="9">9</option><option value="9.5">9.5</option><option value="10">10</option>
        </select>
        <button class="set-check" data-set-check="0" aria-label="Set 1" aria-pressed="false">✓</button>
      </div>
    
      
      <div class="set-row" data-set="1">
        <div class="set-num">2</div>
        <input type="number" class="set-input" data-field="weight" placeholder="-" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="-" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px">
          <option value="">RPE</option>
          <option value="6">6</option><option value="6.5">6.5</option><option value="7">7</option><option value="7.5">7.5</option><option value="8">8</option><option value="8.5">8.5</option><option value="9">9</option><option value="9.5">9.5</option><option value="10">10</option>
        </select>
        <button class="set-check" data-set-check="1" aria-label="Set 2" aria-pressed="false">✓</button>
      </div>
    
      
      <div class="set-row" data-set="2">
        <div class="set-num">3</div>
        <input type="number" class="set-input" data-field="weight" placeholder="-" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="-" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px">
          <option value="">RPE</option>
          <option value="6">6</option><option value="6.5">6.5</option><option value="7">7</option><option value="7.5">7.5</option><option value="8">8</option><option value="8.5">8.5</option><option value="9">9</option><option value="9.5">9.5</option><option value="10">10</option>
        </select>
        <button class="set-check" data-set-check="2" aria-label="Set 3" aria-pressed="false">✓</button>
      </div>
    
        </div>
        <div class="exercise-notes">Main press. Full ROM, control the eccentric.</div>
        <textarea class="ex-note" data-ex-note="bench-press" placeholder="Notes for this exercise..." rows="1"></textarea>
        <button class="btn-swap" data-swap-muscle="Chest" data-swap-ex-id="bench-press">↔ Swap exercise</button>
        
      </div>
    </div>
  `;
const sinObjetivo = render(null);
yes(!sinObjetivo.includes('Target:'), 'sin objetivo: NO aparece la línea "Target:"');
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
yes(!abWheel.includes('Target:'), 'ab wheel: sin línea de objetivo (no hay kg)');
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

// ── 12. Inc 4 — clasificación desde el dato y frescura del dato de hoy (v11.58 · A-3) ─────────
// Los fallos que impide, todos silenciosos: la ruta que trae el dato de HOY definida pero nunca
// llamada desde `whoopSyncData` (a la mañana seguiría el dato de ayer); un `toISOString()` que
// vuelva a colar la fecha UTC como "hoy" (F-14, la app ya pagó una migración por esto);
// `getWhoopContext` volviendo a coger el último elemento del array; `toSession` sin la tabla
// SESSION_CLASS (F-7); `finishWorkout` sin la instantánea.
//
// A-3 (Coach v2.1) cambió QUIÉN trae el dato de hoy, no la garantía: ya no es un fetch OAuth
// desde el navegador (`whoopFetchTodayRecovery` con los tokens en localStorage — la causa de
// las desconexiones), sino el servidor: el webhook escribe `wellness[hoy]` con
// `readinessSource:'whoop'` y, si aún no ha llegado, la app pide `integrationsSync('whoop')`.
// Lo que sigue protegido es lo mismo: el dato de hoy es de hoy, y si falta se dice por qué.
console.log('');
console.log('12. Inc 4 · clasificación por dato + dato de hoy fresco (v11.58 · A-3)');
const WHOOPJS = readFileSync('app/whoop.js', 'utf8');
const whoopFn = (decl) => {
  const i = WHOOPJS.indexOf(decl);
  if (i < 0) return '';
  const j = WHOOPJS.indexOf('\n}', i);
  return WHOOPJS.slice(i, j < 0 ? WHOOPJS.length : j);
};
const WSD_SRC = whoopFn('async function whoopSyncData() {');
yes(/pullStore\('wellness'\)/.test(WSD_SRC), 'whoopSyncData baja primero lo que escribió el servidor (pullStore wellness)');
yes(/intervalsFetchWellness\(\)/.test(WSD_SRC), 'y luego el histórico de intervals.icu');
yes(/integrationsSync\('whoop', \{ days: 2 \}\)/.test(WSD_SRC),
  'si falta el dato de hoy le pide al servidor que sincronice (integrationsSync)');
yes(/integrationsIsActive\('whoop'\)/.test(WSD_SRC),
  'y sólo si la integración está ACTIVA (pedirlo con needs_reconnect sería quemar una llamada)');
yes(/_whoopServerSyncAt = Date\.now\(\)/.test(WSD_SRC),
  'la marca del intento se pone ANTES del await: dos renders no piden dos veces');
yes(/_whoopBuildFromWellness\(/.test(WSD_SRC), 'el payload se construye desde el store wellness');
const BFW_SRC = whoopFn('async function _whoopBuildFromWellness(');
yes(/readinessSource === 'whoop'/.test(BFW_SRC), "distingue las filas del servidor por readinessSource==='whoop'");
yes(/'whoop-direct'/.test(BFW_SRC) && /'intervals'/.test(BFW_SRC), "y marca source 'whoop-direct' | 'intervals'");
yes(/whoopSyncedAt/.test(BFW_SRC), 'con fetchedAt sacado de whoopSyncedAt (la hora real del dato)');
yes(/todaySource = 'missing'/.test(BFW_SRC) && /todayMissingReason/.test(BFW_SRC),
  "si no hay fila de HOY con score: todaySource 'missing' + motivo (nunca hereda el de ayer)");
const TMR_SRC = whoopFn('async function _whoopTodayMissingReason()');
yes(/integrationsGetStatus\(\)/.test(TMR_SRC), 'el motivo sale de integration_status, no de una bandera local');
yes(/not connected/.test(TMR_SRC) && /scored the night/.test(TMR_SRC) && /reconnecting in Settings/.test(TMR_SRC),
  'los tres motivos: no conectado / hay que reconectar / WHOOP no ha puntuado');
// Precedencia (plan A.4): intervals.icu no puede pisar lo que escribió WHOOP.
const IFW_SRC = WHOOPJS.slice(WHOOPJS.indexOf('async function intervalsFetchWellness()'),
  WHOOPJS.indexOf('// ==================== EL DATO DE HOY'));
yes(/readinessSource === 'whoop'/.test(IFW_SRC),
  "intervalsFetchWellness respeta la fila del servidor (readinessSource === 'whoop')");
yes(/WHOOP_OWNED_KEYS/.test(WHOOPJS) && /'sleepRemSecs'/.test(WHOOPJS),
  'la lista de claves que son de WHOOP está declarada y es testeable');
yes(/_whoopRowsEqual\((compact|merged), prev\)/.test(IFW_SRC),
  'y no reescribe una fila idéntica (mata el churn de updated_at en cada render)');
yes(/source === 'withings'/.test(IFW_SRC),
  'ni pisa una pesada de la báscula Withings con el eco de intervals.icu');
// Ni un token ni una llamada directa a la API de WHOOP quedan en el cliente.
for (const marca of ['whoop_access_token', 'whoop_refresh_token', 'whoop_token_expiry',
                     'whoop_needs_reconnect', 'api.prod.whoop.com', 'whoop-auth']) {
  yes(!WHOOPJS.includes(marca), `whoop.js sin \`${marca}\` (los tokens viven en el servidor)`);
}
// F-14: ni un solo "hoy" derivado de UTC en whoop.js. Se cuentan usos REALES (las líneas de
// comentario que explican el bug histórico no cuentan).
const WHOOP_CODE = WHOOPJS.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const isoUses = (WHOOP_CODE.match(/toISOString\(\)/g) || []).length;
eq(isoUses, 0, 'whoop.js no usa toISOString() en ninguna fecha (F-14: todo local)');
// C-25 (v11.73): la afirmación se INVIERTE. `_whoopLocalDateStr` era `dateStr()` copiada
// byte a byte, y la justificaba el orden de los <script> — cierto pero irrelevante: ninguna
// de esas llamadas ocurre en tiempo de evaluación del fichero.
yes(!/function _whoopLocalDateStr\(/.test(WHOOPJS),
  'whoop.js ya NO define su propia fecha local (C-25: era dateStr() duplicada)');
yes(!/_whoopLocalDateStr/.test(WHOOP_CODE), 'ni la usa en ningún sitio');
yes((WHOOP_CODE.match(/\bdateStr\(/g) || []).length >= 7,
  'usa `dateStr()` de app.js en los ~8 sitios donde tenía la copia');
yes(/const dt = \(d instanceof Date\) \? d : \(d != null \? new Date\(d\) : new Date\(\)\);/.test(APP),
  'y `dateStr()` absorbió la tolerancia de la copia (sin argumento = ahora)');
yes(/if \(isNaN\(dt\.getTime\(\)\)\) return null;/.test(APP), '…y su null para entrada inválida');
// La caché de 10 min no puede tapar la falta del dato de hoy.
yes(/hasToday/.test(WSD_SRC), 'y si al payload cacheado le falta hoy, se resincroniza');
yes(/_whoopServerSyncAt\) < WHOOP_CACHE_MS/.test(WSD_SRC),
  'la comprobación de caché mira la ventana de reintento contra el servidor');
yes(/function whoopResetCache\(/.test(WHOOPJS), 'whoopResetCache() existe para saltarse la ventana a mano');
yes(/whoopResetCache\(\)/.test(APP), '"Sync now" la llama para reintentar ya');
// app.js: hoy es hoy.
const GWC = fnSrc('async function getWhoopContext()');
yes(!/recovery\[[^\]]*length - 1\]/.test(GWC), 'getWhoopContext NO usa recovery[recovery.length - 1] (F-6)');
yes(/\.find\(r => r\.date === t\)/.test(GWC), 'usa find(r => r.date === today())');
yes(/lastAvailable/.test(GWC), 'y expone lastAvailable para pintar el último con su fecha');
yes(/source: 'none'/.test(GWC) && /'whoop-direct'/.test(GWC), "devuelve source 'none' | 'whoop-direct' | 'intervals'");
// v11.62: el advisory y el hero de WHOOP salieron de Home (§16). Lo que hay que seguir
// protegiendo de esta parte es que el motivo de la falta de dato viaje HASTA la pantalla: sin
// él, "sin dato de hoy" es una afirmación sin explicación. Ahora lo consume la lista de Stats.
// v11.72 (V-10): las señales dejan de ser una tarjeta propia y pasan a ser el bloque central
// de la ÚNICA tarjeta de recuperación (`_rsSignalsHtml`, compuesta por `renderRecoveryBlock`).
const RRS12 = COACHJS.slice(COACHJS.indexOf('function _rsSignalsHtml(r)'),
  COACHJS.indexOf('async function _rsPerformanceHtml('));
yes(/sig\.reason/.test(RRS12), 'la lista de Stats pinta el motivo de cada señal sin dato');
yes(/whoopDayLabel\(/.test(RRS12), 'y etiqueta la fecha del último dato (hoy/ayer/hace N días)');
yes(/does not count as today/.test(RRS12), 'diciendo explícitamente que el de ayer no cuenta');
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
yes(typeof E.performanceLine === 'function', 'y performanceLine() (lo que la sustituye en Home)');
eq(E.READ_CUTOFFS.green, 67, 'los cortes de color siguen siendo 67/34 (getRecoveryColor)');
eq(E.READ_CUTOFFS.yellow, 34, '…el amarillo también');
yes(Array.isArray(E.READ_RULE_IDS) && E.READ_RULE_IDS.includes('READ-002'),
  'declara READ-002 (≥2 señales concordantes) entre sus reglas');
// READ-003: ni un score, ni una dosis derivada de un score.
const R_SRC = ENGINE.slice(ENGINE.indexOf('function computeReadinessFrom('),
  ENGINE.indexOf('// ==================== LÍNEA DE RENDIMIENTO'));
yes(!/score:/.test(R_SRC.replace(/wt\.score|inp\.whoopToday|\bscore\b\s*[!=]/g, '')),
  'computeReadinessFrom no devuelve ningún score compuesto');
yes(!/0\.55|0\.70|0\.3\b/.test(R_SRC), 'y no queda ninguna ponderación del score viejo');
yes(!/protein|proteína/i.test(R_SRC), 'la proteína ya no cuenta como fatiga (era una ponderación inventada)');
// v11.62: la sección "EL AJUSTE DE LA SESIÓN" se retiró entera. En su hueco está la línea de
// rendimiento, que LEE y no decide: ni escribe kg, ni toca la sesión, ni devuelve un modo.
const _iPerf = ENGINE.indexOf('// ==================== LÍNEA DE RENDIMIENTO');
const _iPerfEnd = ENGINE.indexOf('\n// ==================== CARRERA', _iPerf);
const PERF_SRC = ENGINE.slice(_iPerf, _iPerfEnd > 0 ? _iPerfEnd : ENGINE.length);
yes(!/\.kg\s*=/.test(PERF_SRC), 'la línea de rendimiento no ESCRIBE ningún kg (sólo lo lee)');
yes(!/session|exercises\s*=/.test(PERF_SRC.replace(/sesión|sessionReadout|de la sesión/g, '')),
  'no toca la sesión planificada: devuelve un string');
yes(/it\.outcome/.test(PERF_SRC),
  'la flecha sale del `outcome` de sessionReadout (un solo criterio de progresión)');

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
  ['async function runFullSync(', 'runFullSync'],
]) {
  yes(/invalidateReadiness\(\)/.test(fnSrc(fn)), `${label}() invalida la caché del readiness`);
}
// v11.73 (C-27): el repintado pasa por `safeCallVoid`, que es `safeCall` + el rechazo de la
// promesa enganchado. El orden respecto a `invalidateReadiness()` es lo que se afirma.
yes(/invalidateReadiness\(\);[\s\S]{0,400}safeCallVoid\('renderRecoveryBlock'\)/.test(APP),
  'y al llegar el dato de hoy en init se invalida ANTES de repintar el bloque de recuperación');

// 13.c/d/e RETIRADOS en v11.62 — el advisory delegaba, la tarjeta pintaba dos botones y el
// check-in pedía dos toques. Los tres se fueron con el ajuste diario: §16 comprueba que no
// vuelvan, y `verify-whoop-context.mjs` que la honestidad de fecha del dato de hoy siga en pie.

// Se mira el CÓDIGO, no los comentarios: los que explican qué se retiró sí pueden citar las
// frases retiradas.
const APP_CODE = APP.split(/\r?\n/).filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(String.fromCharCode(10));
yes(!/no cambia tu plan/.test(APP_CODE), 'fuera el pie "es una sugerencia — no cambia tu plan"');

// 13.f startWorkout / buildExerciseCard / capture / restore / finish
const SW13 = fnSrc('async function startWorkout(');
yes(/state\.activeReadiness/.test(SW13), 'startWorkout guarda la instantánea del readiness');
yes(/_coachReadinessStamp\(await computeReadiness\(\)\)/.test(SW13),
  'calculada SIEMPRE, arranque como arranque (es log, no gate)');
const CAP13 = fnSrc('function captureWorkoutState(');
yes(/readinessAtStart: state\.activeReadiness/.test(CAP13), 'captureWorkoutState guarda `readinessAtStart`');
const CLR13 = fnSrc('async function clearActiveWorkout(');
yes(/state\.activeReadiness = null/.test(CLR13), 'clearActiveWorkout la limpia');
const FIN13 = fnSrc('async function finishWorkout()');
yes(/readinessAtStart: state\.activeReadiness \|\| null/.test(FIN13), 'finishWorkout sella readinessAtStart');
yes(FIN13.indexOf('readinessAtStart') < FIN13.indexOf('invalidateReadiness'),
  'y lo hace ANTES de invalidar/limpiar el estado');

// 13.g Stats: la lista de señales sustituye al score
yes(!/function renderFatigueScore/.test(APP), 'renderFatigueScore ya NO existe en app.js');
yes(!/Push hard/.test(APP_CODE), 'ni su consejo "Push hard" (dose-from-composite, READ-003)');
yes(!/Moderate fatigue/.test(APP_CODE), 'ni "Moderate fatigue"');
yes(!/fatigue-bar|fatigue-score/.test(APP_CODE), 'ni la barra ni el número del score');
yes(/renderRecoveryBlock/.test(APP), 'renderStats llama renderRecoveryBlock');
yes(/async function renderRecoveryBlock\(\)/.test(COACHJS), 'que vive en coach.js');
// V-10: los dos nombres viejos siguen existiendo porque integrations.js los llama tras
// sincronizar, y los dos repintan el bloque único (una tarjeta, un renderer).
yes(/async function renderReadinessSignals\(\) \{ return renderRecoveryBlock\(\); \}/.test(COACHJS)
  && /async function renderRecoveryLine\(\) \{ return renderRecoveryBlock\(\); \}/.test(COACHJS),
  'y los nombres antiguos delegan en él (integrations.js los sigue llamando)');
const RRB_SRC = COACHJS.slice(COACHJS.indexOf('async function renderRecoveryBlock()'),
  COACHJS.indexOf('async function renderReadinessSignals()'));
yes(/computeReadiness\(\)/.test(RRB_SRC), 'y lee el MISMO computeReadiness que Home (una sola verdad)');
yes(/whoopRecoveryBlockHtml/.test(RRB_SRC), 'y compone el detalle de WHOOP dentro de la misma tarjeta');
yes(/Promise\.allSettled/.test(RRB_SRC), 'con allSettled: si WHOOP falla, las señales se pintan igual');
yes(/showErrorState\(/.test(RRB_SRC), 'y un fallo de lectura pinta estado de error, no una tarjeta vacía (V-4)');
const RRS_SRC = RRS12;
yes(/high confidence/.test(RRS_SRC), 'muestra la confianza');
yes(/no data/.test(RRS_SRC) && /sig\.reason/.test(RRS_SRC), 'y las señales insuficientes con su motivo');
yes(/whoopDayLabel\(/.test(RRS_SRC), 'conserva la honestidad de v11.58: el dato de ayer, con su fecha');
yes(!/Push hard|score|bar/i.test(RRS_SRC.replace(/whoopDayLabel|last\.score|s\.score/g, '')),
  'sin score, sin barra y sin consejo');
yes(HTML.indexOf('id="readiness-signals"') > 0, 'index.html tiene #readiness-signals');
yes(HTML.indexOf('id="fatigue-card"') < 0, 'y ya no tiene #fatigue-card');

// 13.h El banner de descarga reactivo se retiró en v11.62 (§16 lo fija). Era el último sitio
// donde la recuperación empujaba una ACCIÓN ("Proponer adelantar el deload"). Lo que queda:
// `deloadHint` sigue calculándose en el motor y viaja en el facts pack a la revisión semanal,
// que es quien puede mover el ancla del bloque —con aprobación—; y el deload PROGRAMADO se ve
// en el calendario y en el eyebrow de la semana.
yes(typeof E.computeReadinessFrom === 'function' && 'deloadHint' in E.computeReadinessFrom({}),
  'el motor sigue devolviendo deloadHint (lo lee el facts pack, no un banner)');
yes(/deloadHint/.test(readFileSync('app/coach-facts.js', 'utf8')),
  'y el facts pack lo recoge para el coach semanal');
yes(!/Proponer adelantar el deload/.test(APP), 'el botón "Proponer adelantar el deload" ya no existe');
yes(!/Descarga recomendada/.test(APP), 'ni el banner "Descarga recomendada"');

// 13.i Versión y CSS
eq(vSw, vHtml, 'CACHE_NAME del service worker == versión de index.html (otra vez, tras el bump)');
yes(vNum(vHtml) >= vNum('11.59'), `la versión (v${vHtml}) es >= v11.59`);
// v11.72 (V-10/V-19): `.coach-recovery-line` se va con su contenedor — las dos líneas viven
// ahora dentro de la tarjeta única, así que sus reglas cuelgan de `.crl-perf`/`.crl-trend`
// directamente. CSS muerto es CSS que alguien vuelve a usar sin querer.
for (const clase of ['coach-btn', 'coach-btn-primary',
                     'crl-perf', 'crl-trend', 'rs-sep', 'rs-whoop',
                     'readiness-signals', 'rs-row', 'rs-fired', 'rs-none']) {
  yes(new RegExp(`\\.${clase}[\\s,{:]`).test(CSS), `.${clase} existe en style.css`);
}
// v11.68 (V-3): `.coach-signals*` se borro. Nunca tuvo un solo uso en app/*.js ni en
// index.html — las señales del readiness se pintan con `.rs-*`. CSS muerto es CSS que
// alguien vuelve a usar sin querer, asi que ahora se vigila que NO vuelva.
for (const clase of ['coach-signals', 'coach-signals-note', 'coach-recovery-line']) {
  yes(!new RegExp(`\\.${clase}[\\s,{:]`).test(CSS), `.${clase} ya NO está en style.css`);
}
// Y las de la tarjeta de consejo diario no pueden quedarse de adorno: CSS muerto es CSS que
// alguien vuelve a usar sin querer.
for (const clase of ['coach-proposal', 'coach-changes', 'coach-checkin', 'recovery-hero',
                     'rh-ring', 'rh-score', 't3-rec', 't3-title', 't3-alts']) {
  yes(!new RegExp(`\\.${clase}[\\s,{:]`).test(CSS), `.${clase} ya NO está en style.css`);
}

// ── 14. Inc 6 — la carrera de la semana y la tarjeta de objetivos (v11.60) ────────────────────
//
// El fallo que esta sección impide: que el motor de carrera exista y NO llegue a ninguna
// pantalla (que es exactamente lo que pasaba con `z2Finisher` antes de v11.34 — la dosis
// estaba en el plan y sólo se veía como un texto pegado a un eyebrow), o que llegue a la
// pantalla pero no al reloj porque `_generateCardioDsl` vuelve a aplanar el DSL.
console.log('');
console.log('14. Inc 6 — carrera hacia el 10k y objetivos (v11.60)');

// 14.a El motor existe, es puro y exporta lo que la app consume
yes(typeof E.suggestRunningWeek === 'function', 'coach-engine.js exporta suggestRunningWeek');
yes(typeof E.goalProgress === 'function', 'y goalProgress');
const RW_SRC = ENGINE.slice(ENGINE.indexOf('function suggestRunningWeek('));
yes(!/document\.|window\.|localStorage|indexedDB|fetch\(/.test(RW_SRC),
  'y siguen siendo puros: sin DOM, sin IDB, sin red');
yes(/progressCardioMin\(/.test(RW_SRC),
  'suggestRunningWeek reusa progressCardioMin (una sola fuente de minutos: coach > regla > base)');
yes(!/Z[45] HR/.test(RW_SRC), 'y no hay ni una zona dura en el generador de DSL (END-004)');

// 14.b La rama `run` consulta al coach ANTES que a la regla
const GPS_SRC = fnSrc('async function getPlannedSessionForDate(');
yes(/_applyRunningWeekFallback\(/.test(GPS_SRC), 'getPlannedSessionForDate usa el fallback de carrera');
yes(/activePlan && activePlan\.running/.test(GPS_SRC),
  'y comprueba activePlan.running PRIMERO (coach > regla)');
yes(GPS_SRC.indexOf('activePlan.running') < GPS_SRC.indexOf('_applyRunningWeekFallback('),
  'la comprobación va antes de la llamada, no después');
const ARW_SRC = fnSrc('async function _applyRunningWeekFallback(');
yes(/suggestRunningWeekCached\(/.test(ARW_SRC), 'que resuelve por suggestRunningWeekCached');
for (const campo of ['distanceKm', 'pattern', 'dsl', 'runningPhase', "runningSource = 'rule'"]) {
  yes(ARW_SRC.indexOf(campo) >= 0,
    `y vuelca \`${campo}\` en la sesión planificada`);
}
yes(/durInfo\.source !== 'coach'/.test(ARW_SRC), 'el objetivo del coach sigue mandando sobre los minutos');
const SRWC_SRC = fnSrc('async function suggestRunningWeekCached(');
yes(/getRunsDeduped|_runningHistory4w/.test(SRWC_SRC + fnSrc('async function _runningHistory4w(')),
  'el historial sale de lecturas DEDUPEADAS (una carrera no cuenta dos veces)');
yes(/weekKey/.test(SRWC_SRC) && /runsCount/.test(SRWC_SRC),
  'con caché por semana ISO + número de carreras');
yes(/blockWeek\(date\)/.test(SRWC_SRC), 'y la semana del bloque de ESE día');
const HIST_SRC = fnSrc('async function _runningHistory4w(');
yes(/z2_finisher/.test(HIST_SRC), 'el Z2 finisher NO entra como carrera de la semana');
yes(/family !== 'cardio'/.test(HIST_SRC), 'ni las sesiones que no son cardio');

// 14.c El DSL llega al reloj tal como lo generó la regla
const DSL_SRC = fnSrc('function _generateCardioDsl(');
yes(/planned\.dsl/.test(DSL_SRC), '_generateCardioDsl usa planned.dsl cuando existe');
yes(DSL_SRC.indexOf('planned.dsl') < DSL_SRC.indexOf('planned.durationMin'),
  'y lo hace ANTES de reconstruirlo (o el patrón trote/caminata se aplanaría)');
yes(/return planned\.dsl/.test(DSL_SRC), 'lo devuelve verbatim, sin reformatear');

// 14.d Las dos pantallas de cardio dicen la fase y la dosis
const RTP6_SRC = fnSrc('async function renderTodaysPlan(');
yes(/runningPhaseLabel\(/.test(RTP6_SRC), 'renderTodaysPlan pinta la fase de carrera');
yes(/planned\.pattern/.test(RTP6_SRC), 'y el patrón de trote/caminata');
yes(/planned\.distanceKm/.test(RTP6_SRC), 'y los kilómetros cuando la fase los tiene');
const RPB_SRC = fnSrc('async function renderRunPlanBanner(');
yes(/planned\.pattern/.test(RPB_SRC), 'el banner de Cardio también lleva el patrón');
yes(/distanceKm/.test(RPB_SRC), 'y los kilómetros');
yes(/runningPhaseLabel\(/.test(RPB_SRC), 'y la fase');
yes(/RW_PHASE_LABEL/.test(ENGINE), 'las fases de la carrera tienen etiqueta, y vive en el motor');
yes(/RW_PHASE_LABEL/.test(COACHJS), 'la usa la capa de coach.js');
yes(/RW_PHASE_LABEL/.test(APP) && !/RW_PHASE_ES/.test(APP),
  'y app.js también, ya sólo con el nombre nuevo (`_ES` retirado en v11.67)');
yes(!/RUN_PHASE_ES/.test(APP_CODE), 'el mapa viejo de app.js ya no existe (una sola fuente de etiquetas)');

// 14.e Una decisión por semana, y sólo cuando el fallback se usa
const LRW_SRC = fnSrc('async function _logRunningWeekOnce(');
yes(/logDecision\(/.test(LRW_SRC), 'el fallback registra la decisión con logDecision');
yes(/type: 'running-week'/.test(LRW_SRC), "con type:'running-week'");
yes(/source: 'rule'/.test(LRW_SRC), "y source:'rule' (no es el coach)");
yes(/dbGetAll\('decisions'\)/.test(LRW_SRC), 'consultando el store antes de escribir (no spamea)');
yes(/state\._runningWeekLogged/.test(LRW_SRC), 'con memoria de proceso para las 7 llamadas del calendario');
yes(/ds !== today\(\)/.test(LRW_SRC), 'y sólo para HOY, no para los otros días del calendario');
yes(/gates/.test(LRW_SRC), 'la evidencia guarda las puertas que decidieron');

// 14.f La tarjeta "Objetivos"
yes(HTML.indexOf('id="coach-goals"') > 0, 'index.html tiene #coach-goals');
yes(HTML.indexOf('id="coach-goals"') > HTML.indexOf('id="readiness-signals"'),
  'justo después de #readiness-signals (Stats › Today)');
// v11.61: la firma pasa a llevar el id del contenedor, porque la misma tarjeta se pinta en
// Stats (`#coach-goals`) y en la vista Coach (`#coach-goals-view`). Dos contenedores y no un id
// duplicado: `getElementById` sólo encontraría uno de los dos.
yes(/async function renderGoalsCard\(containerId = 'coach-goals'\)/.test(COACHJS),
  'renderGoalsCard(containerId) vive en coach.js');
// ACOTADO a la propia función: antes iba hasta el final del fichero, y desde v11.61 detrás hay
// 800 líneas de coach semanal que sí citan Rule IDs (en `title=`, que es donde se permiten).
// v11.65: el cálculo se extrajo a `_coachGoalProgressFromStores()` (lo comparten la tarjeta y
// la línea de Home), así que el tramo empieza ahí. Sigue acotado por delante del coach semanal.
const RGC_SRC = COACHJS.slice(
  COACHJS.indexOf('async function _coachGoalProgressFromStores('),
  COACHJS.indexOf('// ==================== LÍNEA DE OBJETIVO'));
yes(/goalProgress\(/.test(RGC_SRC), 'y delega TODO el cálculo en goalProgress (nada de números en el renderer)');
yes(/measured === false/.test(RGC_SRC), 'sólo pesadas medidas (los forward-fill meterían pendiente 0)');
yes(/weightMeasured/.test(RGC_SRC), 'incluyendo las de wellness');
yes(/estimate1RM/.test(RGC_SRC), 'reusa estimate1RM (no reimplementa Epley)');
yes(/getRunsDeduped/.test(RGC_SRC), 'y las carreras dedupeadas');
yes(/Signals for the coach/.test(RGC_SRC), 'pinta la lista de señales');
yes(!/canvas|chart|Chart/.test(RGC_SRC), 'sin gráficos nuevos (§B.9)');
yes(!/[A-Z]{3}-\d{3}/.test(RGC_SRC.replace(/\/\/[^\n]*/g, '')), 'y sin Rule IDs crudos en pantalla');
// v11.72 (V-5): las llamadas de Stats viven en `STATS_GROUPS`, una tanda por pestaña.
yes(/renderGoalsCard/.test(APP.slice(APP.indexOf('const STATS_GROUPS = {'), APP.indexOf('const STATS_DEFAULT_GROUP'))),
  'el grupo `now` de Stats la llama');
yes(/safeCall\('renderGoalsCard'\)/.test(APP), "por safeCall (vive en otro <script>)");
yes(/renderGoalsCard/.test(COACHJS.slice(COACHJS.indexOf('module.exports'))), 'y está exportada para los tests');

// 14.g La caché de la semana se invalida cuando llega una carrera
yes(/state\._runningWeek = null/.test(APP), 'registrar cardio invalida state._runningWeek');
const invals = (APP.match(/state\._runningWeek = null/g) || []).length;
// v11.66 (E-12): eran cuatro sitios; `logRun` se borró por muerto y quedan tres.
yes(invals >= 3, `en los mismos ${invals} sitios que la caché de "días sin cardio"`);

// 14.h Versión y CSS
eq(vSw, vHtml, 'CACHE_NAME del service worker == versión de index.html (tras el bump a v11.60)');
yes(vNum(vHtml) >= vNum('11.60'), `la versión (v${vHtml}) es >= v11.60`);
for (const clase of ['coach-goals-head', 'coach-goal-row', 'coach-goal-status-ok', 'coach-goal-status-warn',
                     'coach-goal-status-na', 'coach-goal-sig', 'cardio-rx-note']) {
  yes(new RegExp(`\\.${clase}[\\s,{:]`).test(CSS), `.${clase} existe en style.css`);
}
// v11.68 (V-2): `.coach-goals` ya NO tiene regla propia — su unico declarado era
// `padding: 14px 16px`, uno de los cinco paddings de tarjeta que la auditoria conto. El
// contenedor sigue existiendo en el HTML (`class="card coach-goals"`) y hereda el padding
// unico de `.card`. Lo que se vigila es que nadie le vuelva a poner padding propio:
// `verify-visual-tokens.mjs` lo comprueba para las nueve familias.
yes(!/^\.coach-goals \{/m.test(CSS), '.coach-goals no vuelve a pisar el padding de .card (V-2)');


// ── 15. Inc 9 — vista Coach, aprobación y retiro del cron (v11.61) ────────────────────────────
//
// Formas nuevas de romperse en silencio, todas de este incremento:
//
//   · `coach-facts.js` o `coach-rules.js` fuera del orden de <script> o del APP_SHELL:
//     `buildCoachFacts`/`COACH_RULES` son undefined y el coach semanal no arranca — sin error
//     visible, porque cada llamada va con `typeof`. Y sin conexión, que es donde se entrena.
//   · Una propuesta escrita en `plans` con `status:'proposed'`: el invariante de la app es
//     "plan activo = versión más alta" y lo aplican también los dispositivos con código viejo.
//     Sería el plan vivo de todos ellos.
//   · El espejo `running` con `smartPut`: el último-que-escribe-gana subiría la copia del
//     cliente por encima del `proposed` del servidor y borraría la propuesta que costó $0,60.
//   · `applyIdealPlan` sin mirar `author`: un PLAN_REV nuevo regeneraría desde la semilla y
//     borraría el plan del coach con sus kg y su carrera.
//   · El deload aplicado dos veces (el plan del coach ya trae el volumen recortado).
//   · `pushRunningPlanToIntervalsIcu` leyendo el `weekly_reviews` del cron retirado: el reloj
//     recibiría la semana de carrera de agosto.
//   · Un fetch superviviente al manifiesto del cron: la tarjeta mostraría la revisión de
//     agosto como si fuera la de esta semana.
//   · `coach-rules.js` desincronizado de `evidence-to-rules.md`: la vista Coach citaría el
//     texto de una regla que ya no dice eso. (No se toca `verify-rules-compact.mjs`; el sha se
//     compara aquí.)
console.log('');
console.log('15. Inc 9 — vista Coach, aprobación y retiro del cron (v11.61)');

const RULESJS = readFileSync('app/coach-rules.js', 'utf8');
const FACTSJS = readFileSync('app/coach-facts.js', 'utf8');

// 15.a Orden de carga y APP_SHELL
const iFacts = HTML.indexOf('src="coach-facts.js"');
const iRules = HTML.indexOf('src="coach-rules.js"');

yes(iFacts > 0, 'index.html carga coach-facts.js');
yes(iRules > 0, 'index.html carga coach-rules.js');
yes(iEngine > 0 && iFacts > iEngine, 'coach-facts.js DESPUÉS de coach-engine.js (usa isoWeekKey/mondayOf como globals)');
yes(iRules > iFacts, 'coach-rules.js después de coach-facts.js');
yes(iCoachJs > iRules, 'coach.js después de los dos (los consume)');
yes(iApp > iCoachJs, 'y app.js al final, como siempre');
for (const m of ['coach-engine.js', 'coach-facts.js', 'coach-rules.js', 'coach.js']) {
  yes(new RegExp(`'\\./${m.replace('.', '\\.')}'`).test(SW), `'./${m}' está en el APP_SHELL`);
}

// 15.b Versión: index.html == CACHE_NAME == COACH_APP_VERSION
const vCoach = (COACHJS.match(/const COACH_APP_VERSION = 'v(\d+\.\d+)'/) || [])[1];
eq(vCoach, vHtml, 'COACH_APP_VERSION == versión de index.html (viaja como clientVersion)');
yes(vNum(vHtml) >= vNum('11.61'), `la versión (v${vHtml}) es >= v11.61`);

// 15.c El corpus de reglas generado
const sha = readFileSync('supabase/functions/coach-weekly-review/rules-compact.sha', 'utf8').trim();
yes(/GENERADO — no editar/.test(RULESJS), 'coach-rules.js se declara generado');
yes(RULESJS.includes(`sourceSha256: ${sha}`),
  'y su sha coincide con rules-compact.sha (si el .md cambia y nadie regenera, esto falla)');
const nRules = (RULESJS.match(/evidenceLevel:/g) || []).length;
// 72 desde la auditoría del 2026-09-08: STR-009 (doble progresión, R-4) y END-009 (minutos
// MVPA, R-5) estaban una reservada y vacía y la otra sin escribir.
eq(nRules, 72, `coach-rules.js trae las 72 reglas del corpus (${nRules})`);
yes(/const COACH_RULES = \{/.test(RULESJS), 'como script clásico (sin bundler no hay import)');
// Por CLAVE y no por palabra: "sources" aparece dentro del texto de GEN-003 ("when sources
// conflict…"), y buscarla suelta haría fallar el test por una regla escrita en inglés.
yes(!/(sources|caveats|applicabilityToUser|population|domain|goal):/.test(RULESJS),
  'sin los campos de auditoría: a la pantalla sólo van `rule` y `evidenceLevel`');
yes(!/(confidence|energyState|programmingAction):/.test(RULESJS),
  'ni los campos que sólo le sirven al modelo (el prompt los lee del JSON, no de aquí)');
yes(/module\.exports/.test(RULESJS), 'y exportado para los tests');
// La traducción de la graduación, con los cuatro niveles del enum único del repo.
for (const [nivel, en] of [['strong', 'strong'], ['moderate', 'moderate'],
                           ['weak_extrapolated', 'weak/extrapolated'], ['expert', 'expert']]) {
  yes(COACHJS.includes(`${nivel}: '${en}'`), `COACH_EVIDENCE_LABEL etiqueta ${nivel} → ${en}`);
}
yes(/function COACH_RULE_LABEL\(/.test(COACHJS), 'COACH_RULE_LABEL(ruleId) existe');
yes(/Rule \$\{ruleId\}/.test(COACHJS), 'y arma la etiqueta "Rule <id> (<nivel> evidence)"');

// 15.d index.html: los contenedores nuevos
for (const id of ['view-coach', 'coach-week-card', 'coach-week', 'coach-briefing', 'coach-proposal',
                  'coach-goals-view', 'coach-decisions', 'coach-versions', 'coach-back',
                  'btn-export-facts', 'setting-coach-auto-apply', 'btn-open-coach']) {
  yes(HTML.indexOf(`id="${id}"`) > 0, `index.html tiene #${id}`);
}
// v11.65 (§B.5): la tarjeta SUBE por encima de "Today's session". El coach manda sobre la
// semana y la semana manda sobre el día. El orden completo de Home se fija en §17.
yes(HTML.indexOf('id="coach-week-card"') < HTML.indexOf('id="coach-readout"'),
  '#coach-week-card va ANTES de #coach-readout (la semana antes que el día)');
yes(HTML.indexOf('id="coach-week-card"') < HTML.indexOf('id="todays-plan-card"'),
  'y antes de #todays-plan-card');
// El selector con los tres modos, y `ask` primero (es el valor por defecto).
for (const v of ['ask', 'auto-if-clean', 'auto']) {
  yes(HTML.includes(`value="${v}"`), `el selector ofrece coachAutoApply="${v}"`);
}
yes(HTML.indexOf('value="ask"') < HTML.indexOf('value="auto-if-clean"'),
  "'ask' es la primera opción (el default nunca es automático)");
// Y un id no puede estar dos veces: `getElementById` sólo encontraría uno.
{
  const ids = [...HTML.matchAll(/id="([a-z0-9-]+)"/g)].map(m => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  eq([...new Set(dup)].join(', ') || 'ninguno', 'ninguno', 'sin ids duplicados en index.html');
}

// 15.e La llamada a la edge function
yes(/functions\.invoke\('coach-weekly-review'/.test(COACHJS),
  "coach.js invoca la función con functions.invoke('coach-weekly-review'");
const RWC_SRC = COACHJS.slice(COACHJS.indexOf('async function runWeeklyCoach('),
  COACHJS.indexOf('async function _coachMirror('));
yes(!!RWC_SRC, 'se localiza runWeeklyCoach()');
for (const k of ['weekKey', 'facts', 'currentPlan', 'allowed', 'priorReviews', 'clientVersion']) {
  yes(new RegExp(`${k}[,:]`).test(RWC_SRC), `el body lleva ${k}`);
}
yes(/mode: 'async'/.test(RWC_SRC), "y mode:'async' (el modelo tarda 60-180 s; iOS suspende la PWA)");
yes(/getUser\(\)/.test(RWC_SRC), 'exige sesión (la función valida el token)');
yes(/navigator\.onLine === false/.test(RWC_SRC), 'y no llama sin conexión');
yes(/dbPut\('coach_reviews'/.test(RWC_SRC),
  "el espejo `running` va con dbPut (un smartPut pisaría el `proposed` del servidor)");
yes(!/smartPut\('coach_reviews'/.test(RWC_SRC), 'y runWeeklyCoach no encola la fila del servidor');
yes(/kind: 'invoke'/.test(RWC_SRC), 'un fallo de invocación deja fila `failed` con error.kind');

// 15.f El disparo automático: una vez por semana y nunca sobre un historial de fallos
const MRW_SRC = COACHJS.slice(COACHJS.indexOf('async function maybeRunWeeklyCoach('),
  COACHJS.indexOf('async function runWeeklyCoach('));
yes(!!MRW_SRC, 'se localiza maybeRunWeeklyCoach()');
yes(/_coachWeeklyTried/.test(MRW_SRC), 'con memoria de proceso (una vez por carga)');
yes(/isoWeekKey|_cWeekKey/.test(MRW_SRC), 'resuelve la semana ISO');
yes(/if \(mine\.length\) return/.test(MRW_SRC),
  'cualquier fila de esta semana (incl. sólo `failed`) corta el disparo: no se reintenta solo');
yes(/pollCoachReview\(/.test(MRW_SRC), 'y retoma el polling de una revisión que quedó en marcha');
const iCheckAuth = APP.indexOf('await checkAuth()');
const iMaybe = APP.indexOf("await safeCall('maybeRunWeeklyCoach')");
yes(iCheckAuth > 0 && iMaybe > iCheckAuth, 'init() lo llama DESPUÉS de checkAuth()');
yes(/await window\.syncAll\(\)[\s\S]{0,180}await safeCall\('maybeRunWeeklyCoach'\)/.test(APP),
  'y tras esperar un syncAll() (sin el pull, se pagaría una revisión que ya existe en la nube)');

// 15.g Polling: 5 s, 5 min, y se para al ocultar la pestaña
const POLL_SRC = COACHJS.slice(COACHJS.indexOf('function pollCoachReview('),
  COACHJS.indexOf('function _coachElapsed('));
yes(/COACH_POLL_MS/.test(POLL_SRC) && /5000/.test(COACHJS), 'polling cada 5 s');
yes(/5 \* 60 \* 1000/.test(COACHJS), 'hasta 5 min');
yes(/\.from\('coach_reviews'\)[\s\S]{0,140}record_id/.test(POLL_SRC),
  'consulta su propia fila por record_id (RLS)');
yes(/maybeSingle\(\)/.test(POLL_SRC), 'con maybeSingle()');
yes(/visibilitychange/.test(COACHJS), 'se para al ocultar la pestaña y se retoma al volver');
yes(/status !== 'running'/.test(POLL_SRC), 'y sólo refleja cuando la fila ya no está en marcha');
yes(/come back later/.test(COACHJS), 'si se agota el plazo, la tarjeta lo dice (el pull la traerá)');

// 15.h Aplicar: las propuestas NUNCA entran en `plans`
const ACP_SRC = COACHJS.slice(COACHJS.indexOf('async function applyCoachProposal('),
  COACHJS.indexOf('async function rejectCoachProposal('));
yes(!!ACP_SRC, 'se localiza applyCoachProposal()');
yes(/mergeProposal\(/.test(ACP_SRC), 'mergea la propuesta sobre el plan activo');
yes(/validatePlanVersion\(/.test(ACP_SRC), 'la audita con validatePlanVersion');
yes(/createNewPlanVersion\(/.test(ACP_SRC), 'y crea una VERSIÓN nueva de plan');
yes(/author: 'coach-llm'/.test(ACP_SRC), "estampada con author:'coach-llm'");
for (const k of ['schema: 2', 'basedOn', 'weekKey', 'reviewId', 'seedRev']) {
  yes(ACP_SRC.includes(k), `con ${k} en el meta`);
}
yes(/status: 'superseded'/.test(ACP_SRC), 'marca la anterior como superseded (sin borrarla)');
yes(/smartPut\('coach_reviews'/.test(ACP_SRC), "y la decisión del usuario sí sube (smartPut)");
yes(/status: 'applied'/.test(ACP_SRC), "con status:'applied'");
yes(/appliedPlanId/.test(ACP_SRC), 'y appliedPlanId');
yes(/logDecision\(/.test(ACP_SRC) && /'plan-apply'/.test(ACP_SRC), "registra la decisión plan-apply");
yes(/_coachReconcileOverrides\(/.test(ACP_SRC), 'reconcilia los swaps de ejercicio');
yes(/diff\.weekTemplate && diff\.weekTemplate\.length > 0/.test(ACP_SRC),
  'y sólo limpia los overrides de calendario si el template cambió');
// La regla que no se negocia: ninguna propuesta en `plans`.
yes(!/smartPut\('plans'[\s\S]{0,200}'proposed'/.test(COACHJS),
  "ningún smartPut('plans') escribe status 'proposed'");
yes(!/status: 'proposed'/.test(COACHJS.replace(/\/\/[^\n]*/g, '')),
  "coach.js no escribe status:'proposed' en ninguna parte (lo pone la función, en coach_reviews)");
// Y NADA se deshabilita por un aviso.
yes(!/disabled[\s\S]{0,60}guardrail/i.test(COACHJS), 'ningún botón se deshabilita por un guardarraíl');
yes(/-hard/.test(COACHJS) && /-warn/.test(COACHJS), 'los avisos se pintan en rojo y ámbar (chips)');
yes(/\.coach-week-chip\.-hard/.test(CSS) && /\.coach-week-chip\.-warn/.test(CSS),
  'con su CSS (rojo = duro, ámbar = blando)');

// 15.i Rechazar y rollback
const REJ_SRC = COACHJS.slice(COACHJS.indexOf('async function rejectCoachProposal('),
  COACHJS.indexOf('async function rollbackPlanVersion('));
yes(/status: 'rejected'/.test(REJ_SRC) && /rejectedReason/.test(REJ_SRC), 'rechazar guarda el motivo');
yes(/smartPut\('coach_reviews'/.test(REJ_SRC), 'con smartPut (es una decisión del usuario)');
yes(/'plan-reject'/.test(REJ_SRC), "y registra la decisión plan-reject");
const RBK_SRC = COACHJS.slice(COACHJS.indexOf('async function rollbackPlanVersion('),
  COACHJS.indexOf('async function _coachReconcileOverrides('));
yes(/createNewPlanVersion\(/.test(RBK_SRC),
  'el rollback crea una versión NUEVA copiada (no re-activa la vieja: el invariante es max(version))');
yes(/\(restored\)/.test(RBK_SRC), 'etiquetada "(restored)"');
yes(/rolledBackFrom/.test(RBK_SRC), 'con rolledBackFrom');
yes(/author: 'user'/.test(RBK_SRC), "y author:'user'");
yes(/'plan-rollback'/.test(RBK_SRC), 'registra la decisión plan-rollback');
yes(!/dbDelete\('plans'|smartDelete\('plans'/.test(COACHJS), 'y nunca borra una versión');
// Vencimiento: una propuesta de otra semana no se puede aplicar.
yes(/status: 'expired'/.test(COACHJS), 'una propuesta de una semana anterior pasa a `expired`');
yes(/_coachExpireIfStale\(/.test(COACHJS), 'y se comprueba al pintar');

// 15.j Retiro y migración en app.js
const AIP_SRC = fnSrc('async function applyIdealPlan(');
yes(/author === 'coach-llm'/.test(AIP_SRC) && /author === 'user'/.test(AIP_SRC),
  "applyIdealPlan() sale temprano con un plan del coach o del usuario");
yes(/!force/.test(AIP_SRC), 'salvo force (el selector de variante y la semilla siguen pudiendo)');
yes(/planRev = PLAN_REV/.test(AIP_SRC) && /logDecision\(/.test(AIP_SRC),
  'y con un PLAN_REV nuevo NO regenera: sube el flag y lo anota UNA vez');
const SIV_SRC = fnSrc('async function setIdealVariant(');
yes(/_applyVariantOverCoachPlan\(/.test(SIV_SRC),
  'setIdealVariant() con plan del coach crea una versión propia (variante = calendario)');
const AVO_SRC = fnSrc('async function _applyVariantOverCoachPlan(');
yes(/buildWeekTemplateFromIdeal\(n\)/.test(AVO_SRC), 'con el weekTemplate de la variante elegida');
yes(/sessions: \(prev && prev\.sessions\)/.test(AVO_SRC), 'y las sesiones del coach intactas');
yes(/author: 'user'/.test(AVO_SRC), "author:'user' (la decisión es del usuario)");
yes(/running: \(prev && prev\.running\)/.test(AVO_SRC), 'conservando el running del coach');

const CST_SRC9 = fnSrc('async function computeSessionTargets(');
yes(/activePlan\.sessions\[sessionId\]/.test(CST_SRC9),
  'computeSessionTargets lee las sesiones del plan activo');
yes(/coachWeekKey = activePlan\.weekKey/.test(CST_SRC9),
  'y la vigencia del objetivo sale de activePlan.weekKey (v11.57, intacto)');
yes(/activePlan && activePlan\.author === 'coach-llm'\)\s*\n?\s*\? null/.test(CST_SRC9)
  || /author === 'coach-llm'[\s\S]{0,60}\? null[\s\S]{0,80}_legacyCoachTargets/.test(CST_SRC9),
  'el adaptador legacy de weekly_reviews sólo se consulta si el plan NO es del coach');

// F-17 (auditoría 2026-09-09): LA FUENTE ESTABA MAL. `activePlan.running.plan[]` no lo escribe
// ningún plan del coach (el esquema v2 da `running` como tres números y el reparto por días vive
// en `weekTemplate[dow].cardio`), así que el botón caía SIEMPRE al store del cron retirado: el
// reloj recibía la semana de un sistema que ya no existe, o nada.
const PRP_SRC = fnSrc('async function pushRunningPlanToIntervalsIcu(');
yes(/_coachCardioSlot\(dow\)/.test(PRP_SRC), 'el push lee el cardio del coach de weekTemplate[dow]');
yes(/suggestRunningWeekCached\(/.test(PRP_SRC), 'y cae a la fase de la regla en los días que el coach no tocó');
yes(PRP_SRC.indexOf('_coachCardioSlot(dow)') < PRP_SRC.indexOf('usaRegla'),
  'en ese orden: coach > regla > base, el mismo que pinta la pantalla');
yes(!/weekly_reviews/.test(PRP_SRC), 'y el fallback a weekly_reviews se retira (nadie lo escribe ya)');
yes(/_mondayOfWeekKey\(/.test(PRP_SRC), 'y resuelve las fechas desde el lunes del weekKey');
yes(/pwa-\$\{weekKey\}-\$\{run\.id\}/.test(PRP_SRC), 'con external_id = pwa-${weekKey}-${id}');
yes(/\(cc && cc\.dsl\)/.test(PRP_SRC), 'el DSL del coach viaja verbatim (un run/walk no se aplana)');

// El fetch al manifiesto del cron, muerto y enterrado (comentarios incluidos: si el literal
// sigue en el fichero, alguien puede volver a llamarlo).
yes(!/fetchLatestWeeklyReview/.test(APP), 'app.js ya no contiene fetchLatestWeeklyReview');
yes(!APP.includes('tracking/weekly-reviews/latest.json'),
  'ni la URL del manifiesto del cron');
const LWC_SRC = fnSrc('async function loadAndRenderWeeklyCoach(');
yes(/dbGetAll\('coach_reviews'\)/.test(LWC_SRC), 'el resumen de Stats lee coach_reviews');
yes(/dbGetAll\('weekly_reviews'\)/.test(LWC_SRC), 'con el legacy como fallback de sólo lectura');
yes(/Open Coach/.test(LWC_SRC), 'y ofrece "Open Coach" (V-1: la UI es toda en inglés)');
yes(!/fetch\(/.test(LWC_SRC), 'sin ningún fetch');

// 15.k El pack desde los stores, y el botón de exportarlo
const BCF_SRC = COACHJS.slice(COACHJS.indexOf('async function buildCoachFactsFromStores('),
  COACHJS.indexOf('function _coachZ2Ceiling('));
yes(!!BCF_SRC, 'se localiza buildCoachFactsFromStores()');
for (const s of ['workouts', 'runs', 'sessions', 'mobility_sessions', 'wellness', 'steps',
                 'bodyweight', 'nutrition', 'decisions', 'coach_reviews']) {
  yes(BCF_SRC.includes(`'${s}'`), `lee el store ${s}`);
}
for (const k of ['exerciseOverrides', 'weekSchedule', 'userSettings', 'activePlan', 'exercisesLibrary']) {
  yes(BCF_SRC.includes(k), `y pasa ${k}`);
}
for (const d of ['convertWeight', 'estimate1RM', 'measureUnitFor', 'dedupeRuns', 'dedupeSessions', 'toSession']) {
  yes(BCF_SRC.includes(d), `inyecta el dep ${d}`);
}
yes(/typeof nutRollingWeight === 'function'/.test(BCF_SRC)
  && /typeof weeklyDeficits === 'function'/.test(BCF_SRC),
  'los dos deps de nutrition.js van con guarda typeof (si ese script no cargó, el pack se degrada)');
yes(/z2Ceiling: _coachZ2Ceiling\(\)/.test(BCF_SRC), 'y el techo de Z2 medido');
yes(/legacyLatest/.test(BCF_SRC), 'con el latest de weekly_reviews como entrada legacy');
yes(/buildCoachFacts\(input, deps\)/.test(BCF_SRC), 'y delega TODO el cálculo en buildCoachFacts');
yes(!/\.reduce\(|Math\.round/.test(BCF_SRC),
  'sin aritmética propia: un número calculado aquí sería un número sin test');
const EXP_SRC = COACHJS.slice(COACHJS.indexOf('async function exportCoachFacts('),
  COACHJS.indexOf('function coachAutoApplyMode('));
yes(/clipboard/.test(EXP_SRC), 'exportCoachFacts copia al portapapeles');
yes(/navigator\.share/.test(EXP_SRC), 'con navigator.share como segundo camino (iOS)');
yes(/textarea/.test(EXP_SRC), 'y un textarea como último recurso');
yes(/dataGaps/.test(EXP_SRC), 'y dice cuántos huecos de datos declara el pack');
yes(/KB/.test(EXP_SRC), 'y cuánto pesa');
yes(/function coachAutoApplyMode\(/.test(COACHJS), 'coachAutoApplyMode() normaliza a ask por defecto');
yes(/=== 'auto' \|\| v === 'auto-if-clean'\) \? v : 'ask'/.test(COACHJS),
  "cualquier otro valor cae en 'ask' (auto NUNCA por defecto)");
yes(/smartPut\('settings', \{ key: 'userSettings'/.test(COACHJS),
  'y el ajuste se persiste por la ruta de userSettings');

// 15.l `_mondayOfWeekKey` es la inversa exacta de `isoWeekKey`
{
  const src = fnSrc('function _mondayOfWeekKey(');
  yes(!!src, 'se localiza _mondayOfWeekKey()');
  const f = new Function(`${src}\n}\nreturn _mondayOfWeekKey;`)();
  const casos = [['2026-W37', '2026-09-07'], ['2026-W01', '2025-12-29'], ['2027-W01', '2027-01-04']];
  for (const [wk, mon] of casos) eq(f(wk), mon, `_mondayOfWeekKey('${wk}') = ${mon}`);
  eq(f('basura'), null, 'y devuelve null con una entrada que no es una semana ISO');
  // Ida y vuelta contra la aritmética del motor, que es la fuente: 120 semanas seguidas.
  let rt = 0;
  for (let i = 0; i < 120; i++) {
    const d = new Date(Date.UTC(2026, 0, 5) + i * 7 * 86400000).toISOString().slice(0, 10);
    const wk = E.isoWeekKey(d);
    if (f(wk) === E.mondayOf(d)) rt++;
  }
  eq(rt, 120, 'ida y vuelta con isoWeekKey/mondayOf en 120 semanas seguidas');
}

// 15.m Home, vista y navegación
yes(/renderCoachWeekCard/.test(fnSrc('async function renderHomeView(')),
  'renderHomeView llama renderCoachWeekCard');
yes(/safeCall\('renderCoachWeekCard'\)/.test(APP), 'por safeCall (vive en coach.js)');
yes(/async function renderCoachWeekCard\(/.test(COACHJS), 'renderCoachWeekCard vive en coach.js');
yes(/async function renderCoachView\(/.test(COACHJS), 'y renderCoachView también');
yes(/function openCoachView\(/.test(COACHJS), 'con openCoachView() como entrada');
yes(/showView\('coach'\)/.test(COACHJS), "que hace showView('coach') — mismo patrón que ideal-preview");
yes(/tab === 'coach'/.test(fnSrc('function updateHeader(')), "updateHeader conoce la pestaña 'coach'");
yes(/getElementById\('coach-back'\)/.test(APP), 'el botón de volver está cableado');
yes(/getElementById\('btn-export-facts'\)/.test(APP), 'y el de exportar los facts');
yes(/getElementById\('setting-coach-auto-apply'\)/.test(APP), 'y el selector de coachAutoApply');
yes(/setCoachAutoApply\(/.test(APP), 'que guarda con setCoachAutoApply');
yes(/coachAutoApplyMode\(\)/.test(fnSrc('function applySettingsToUI(')),
  'applySettingsToUI pinta el valor guardado');
// Cada sección de la vista con su try/catch (patrón renderHomeView): una no puede vaciar el resto.
const RCV_SRC = COACHJS.slice(COACHJS.indexOf('async function renderCoachView('),
  COACHJS.indexOf('async function _coachRenderWeek('));
yes(/try \{ await fn\(el\); \} catch/.test(RCV_SRC), 'cada sección de la vista Coach con su try/catch');
for (const id of ['coach-week', 'coach-briefing', 'coach-proposal', 'coach-goals-view',
                  'coach-decisions', 'coach-versions']) {
  yes(RCV_SRC.includes(`'${id}'`), `la vista pinta #${id}`);
}
yes(/renderGoalsCard\('coach-goals-view'\)/.test(RCV_SRC),
  'reutilizando renderGoalsCard en su propio contenedor');
// Y los renderers de los incrementos anteriores siguen en pie.
for (const fn of ['renderCoachReadout', 'renderReadinessSignals', 'renderGoalsCard']) {
  yes(new RegExp(`async function ${fn}\\(`).test(COACHJS), `${fn} sigue existiendo`);
  yes(COACHJS.slice(COACHJS.indexOf('module.exports')).includes(fn), `y sigue exportado`);
}

// 15.n El diff y los estados de la tarjeta
yes(/function coachDiffGroups\(/.test(COACHJS), 'coachDiffGroups() agrupa el diff por sesión');
yes(/diffPlanVersions\(/.test(COACHJS), 'sobre diffPlanVersions (una sola aritmética de diff)');
for (const k of ['-up', '-down', '-add', '-remove']) {
  yes(CSS.includes(`.coach-diff-row.${k}`), `.coach-diff-row.${k} existe en style.css`);
}
for (const clase of ['coach-week-card', 'coach-week-chip', 'coach-week-prios', 'coach-diff-group',
                     'coach-diff-session', 'coach-dec-row', 'coach-ver-row', 'coach-ver-back',
                     'coach-brief-title', 'wcc-summary']) {
  yes(new RegExp(`\\.${clase}[\\s,{:.]`).test(CSS), `.${clase} existe en style.css`);
}
yes(!/@keyframes coach-week|animation:[^;]*coach-week/.test(CSS), 'y cero animaciones nuevas (§B.6)');
const RCWC_SRC = COACHJS.slice(COACHJS.indexOf('async function renderCoachWeekCard('),
  COACHJS.indexOf('function openCoachView('));
for (const st of ['running', 'proposed', 'applied', 'failed', 'expired']) {
  yes(RCWC_SRC.includes(`'${st}'`), `la tarjeta cubre el estado ${st}`);
}
yes(/classList\.add\('hidden'\)/.test(RCWC_SRC), 'y sin revisión no pinta nada (no deja hueco)');
yes(/coach-week-apply/.test(RCWC_SRC) && /coach-week-reject/.test(RCWC_SRC)
  && /coach-week-regen-note/.test(RCWC_SRC), 'con Aplicar · Rechazar · Regenerar con nota');
yes(/rollbackPlanVersion\(/.test(RCWC_SRC), 'y "Deshacer" en el estado applied');
yes(/COACH_GUARD_LABEL/.test(COACHJS), 'los ids de guardarraíl llevan etiqueta (nada de ids crudos en pantalla)');

// 15.o `allowed`: el vocabulario que se le permite al modelo
const ALW_SRC = COACHJS.slice(COACHJS.indexOf('function _coachAllowed('),
  COACHJS.indexOf('function _coachCurrentPlan('));
yes(/COACH_MAX_SESSION_IDS/.test(ALW_SRC) && /COACH_MAX_EXERCISE_IDS/.test(ALW_SRC),
  '_coachAllowed respeta los topes que valida la función');
eq((COACHJS.match(/const COACH_MAX_SESSION_IDS = (\d+)/) || [])[1], '12', 'tope de sesiones = 12');
eq((COACHJS.match(/const COACH_MAX_EXERCISE_IDS = (\d+)/) || [])[1], '150', 'tope de ejercicios = 150');
yes(ALW_SRC.indexOf('plan.sessions') < ALW_SRC.indexOf('Object.keys(lib)'),
  'los ejercicios DEL PLAN van primero (así sobreviven al recorte de 150)');
yes(/measure: !!\(typeof measureUnitFor === 'function' && measureUnitFor\(id\)\)/.test(ALW_SRC),
  "`measure` sale de measureUnitFor y no del plan (sin él, el modelo podría prescribir 'box jump 52,5 kg')");
for (const k of ['name', 'muscle', 'db', 'bw']) yes(new RegExp(`${k}:`).test(ALW_SRC), `y cada id lleva ${k}`);

// ── 16. Inc B-1 — EL COACH NO AJUSTA EL DÍA (v11.62) ─────────────────────────────────────────
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR. El 2026-09-07 Julian revisó Coach v2 en uso y
// corrigió la dirección en el primer punto de siete:
//
//   *"Nada de ajustar el entrenamiento del día por WHOOP. Eso es muy subjetivo; voy a ser yo y
//   mi cuerpo el que decida skipear un ejercicio o bajar los pesos."*
//
// Retirar una función es fácil; que no vuelva, no. Este proyecto ya ha visto tres veces el
// mismo patrón: se retira una pieza de la pantalla, se deja el motor "por si acaso", y dos
// incrementos después alguien lo vuelve a llamar porque sigue exportado y con tests en verde.
// Aquí se cierran las cinco puertas por las que el consejo diario podría volver:
//
//   1. **El motor.** `adjustSessionForReadiness` y su recorte de accesorios no existen en
//      ningún fichero de `app/` — ni llamados, ni exportados, ni comentados como "pendiente".
//   2. **Los botones.** "Hacer la ajustada" / "Hacer la planificada" / "Registrar la
//      alternativa" eran la interfaz del ajuste. Si el texto reaparece, algo lo pinta.
//   3. **El plumbing.** `opts.adjustments` en `startWorkout`, `state.activeAdjustments`, el
//      `setDelta`/`rpeCap` de la tarjeta, los campos `adjusted`/`adjustments` del registro. Esta
//      es la puerta peligrosa: se puede reintroducir "sólo el dato" sin UI, y entonces el
//      registro vuelve a decir que la sesión iba recortada sin que nadie lo haya decidido.
//   4. **El check-in.** Pedir "¿cómo dormiste?" cada mañana sólo tenía sentido para alimentar la
//      decisión del día. Sin decisión, es un dato que se pide para no usarlo.
//   5. **El banner de descarga.** Era el último sitio donde la recuperación empujaba una acción.
//
// Y dos invariantes en positivo, porque retirar de más también es un fallo: `readinessAtStart`
// SIGUE sellándose en el registro (log puro, es lo que le da contexto a la revisión semanal), y
// la tarjeta de ejercicio sin objetivo sigue siendo byte a byte la de v11.56 (§10).
console.log('');
console.log('16. B-1 · el coach no ajusta el día (v11.62)');

const APP_FILES = readdirSync('app').filter(n => n.endsWith('.js'));
const APP_SRCS = APP_FILES.map(n => [n, readFileSync(`app/${n}`, 'utf8')]);

// 16.a El motor y sus llamadores: cero rastros, comentarios incluidos.
for (const [name, src] of APP_SRCS) {
  for (const sym of ['adjustSessionForReadiness', 'computeTrainingAdvisory', 'renderTrainingAdvisory',
                     'activeAdjustments', 'saveCheckin', 'renderDeloadReminder']) {
    yes(!src.includes(sym), `app/${name} sin ${sym}`);
  }
}
yes(!('adjustSessionForReadiness' in E), 'coach-engine ya no exporta adjustSessionForReadiness');
yes(!('_coachTrimAccessories' in E), 'ni _coachTrimAccessories');
yes(!('_readCopySession' in E) && !('_readRound5' in E), 'ni sus ayudantes');

// 16.b Los botones y el check-in
for (const txt of ['Hacer la ajustada', 'Hacer la planificada', 'Registrar la alternativa',
                   'Te propongo la sesión ajustada', 'coach-do-adjusted', 'coach-do-planned',
                   'coach-do-alt', 'data-checkin-sleep', 'data-checkin-feel', 'coach-checkin-close',
                   '_CHECKIN_BANDS', 'contame en 2 toques']) {
  yes(!APP.includes(txt) && !COACHJS.includes(txt), `no queda "${txt}"`);
}
yes(!/id="training-advisory"/.test(HTML), 'index.html ya no tiene #training-advisory');
yes(!/id="recovery-hero"/.test(HTML), 'ni #recovery-hero');
yes(!/id="deload-reminder"/.test(HTML), 'ni #deload-reminder');

// 16.c El plumbing del ajuste
const SW16 = fnSrc('async function startWorkout(');
yes(/opts\.targets/.test(SW16), 'startWorkout conserva opts.targets (el reanudado no recalcula kg)');
yes(/_coachReadinessStamp\(/.test(SW16), 'y sella la instantánea del readiness');
yes(!/adjustments/.test(SW16), 'pero no acepta ni aplica ajustes');
yes(!/dropIds/.test(APP), 'nadie filtra ejercicios por dropIds');
yes(!/rpeCap/.test(APP), 'ni tapa el RPE');
yes(!/setDelta/.test(APP), 'ni recorta series por recuperación');
const CARD16 = fnSrc('function buildExerciseCard(');
yes(!/adjustments/.test(CARD16), 'buildExerciseCard no conoce los ajustes');
yes(/deload && ex\.rpe !== '-' \? 'RPE 5-6' : `RPE \$\{ex\.rpe\}`/.test(CARD16),
  'el RPE de la tarjeta es el del plan, o el del deload programado, y nada más');
const FIN16 = fnSrc('async function finishWorkout()');
yes(/readinessAtStart: state\.activeReadiness \|\| null/.test(FIN16),
  'finishWorkout SIGUE sellando readinessAtStart (log puro, 4 campos)');
yes(!/adjusted:/.test(FIN16), 'y ya no escribe `adjusted`');
yes(!/workout\.adjustments/.test(FIN16), 'ni `workout.adjustments`');
yes(/color:/.test(fnSrc('function _coachReadinessStamp(')), 'la instantánea sigue siendo color + señales + confianza + origen');

// 16.d La línea de rendimiento sale de Home y baja a Stats › Today (v11.65)
//
// EL FALLO QUE IMPIDE. Julian vio la línea en el iPhone en v11.64 y la rechazó: dos párrafos de
// texto plano en medio de un dashboard de tarjetas ("está feo, sin nada que ver con la UX").
// Mudarla tiene dos formas de salir mal, y las dos son silenciosas: que `renderHomeView` la siga
// llamando (el párrafo reaparece donde el usuario lo rechazó) o que el div se mude a Stats y
// NADIE lo pinte (un contenedor vacío para siempre, que es peor que no haberlo movido).
const HOME16 = fnSrc('async function renderHomeView(');
yes(!/renderRecoveryLine/.test(HOME16), 'renderHomeView ya NO llama a renderRecoveryLine()');
yes(!/renderRecoveryHero|renderHardDayBudget|advisory/i.test(HOME16),
  'y sigue sin llamar al hero, al advisory ni al presupuesto');
yes(/renderHomeStatTrio\(\)/.test(HOME16), 'lo que sí pinta es el trío (con el tile Readiness)');
const HOME_BLOCK16 = HTML.slice(HTML.indexOf('id="view-home"'), HTML.indexOf('id="view-gym"'));
// v11.72 (V-10): el contenedor propio de la línea desaparece — su contenido es el primer bloque
// de la tarjeta única de recuperación. Lo que sigue protegido es lo mismo: que no vuelva a Home
// y que su renderer siga teniendo quien lo llame.
yes(!HOME_BLOCK16.includes('id="coach-recovery-line"') && !HTML.includes('id="coach-recovery-line"'),
  '#coach-recovery-line ya no existe: su contenido vive en la tarjeta única de Stats › Now');
const STATS_GROUPS16 = APP.slice(APP.indexOf('const STATS_GROUPS = {'), APP.indexOf('const STATS_DEFAULT_GROUP'));
yes(/safeCall\('renderRecoveryBlock'\)/.test(STATS_GROUPS16),
  'el grupo `now` de Stats lo pinta por safeCall (vive en coach.js)');

// 16.e El presupuesto de días duros se muda a Stats (V-10: a la pestaña `week`, con el resto
// de bloques de la semana — estaba en "Today" junto a cinco cosas más que no eran de hoy).
yes(/renderHardDayBudget\(\)/.test(STATS_GROUPS16), 'STATS_GROUPS llama renderHardDayBudget()');
yes(STATS_GROUPS16.indexOf('renderRecoveryBlock') < STATS_GROUPS16.indexOf('renderHardDayBudget'),
  'el bloque de recuperación (grupo `now`) va antes que la carga (grupo `week`)');
yes(/id="hard-day-budget" data-group="week"/.test(HTML),
  '#hard-day-budget vive en Stats › Week (con su data-group, o no se mostraría nunca)');

// 16.f La línea nueva: informa, no aconseja
const RCL16 = COACHJS.slice(COACHJS.indexOf('async function _rsPerformanceHtml('),
  COACHJS.indexOf('async function renderRecoveryBlock()'));
yes(/async function _rsPerformanceHtml\(r\)/.test(RCL16),
  '_rsPerformanceHtml() vive en coach.js y devuelve HTML (V-10: quien pinta es el bloque)');
yes(/performanceLine\(/.test(RCL16), 'y la primera línea es el RENDIMIENTO (performanceLine)');
yes(RCL16.indexOf('performanceLine(') < RCL16.indexOf('_crlTrendBits('),
  'rendimiento ANTES que wearable (plan v2.1 §Principios 2)');
// V-10: el readiness ya no se recalcula aquí — lo calcula UNA vez `renderRecoveryBlock` y lo
// pasa. Dos `computeReadiness()` en la misma tarjeta eran dos lecturas del mismo dato.
yes(/_crlTrendBits\(r\.signals\)/.test(RCL16), 'la segunda son las tendencias del readiness único');
yes(/whoopLastAvailable/.test(RCL16), 'con el último dato y SU fecha cuando falta el de hoy (F-6)');
yes(!/<button|addEventListener/.test(RCL16), 'sin un solo botón');
yes(!/var\(--red\)|var\(--yellow\)|var\(--accent\)/.test(RCL16), 'y sin color por estado');
yes(/escapeHtml\(/.test(RCL16), 'escapa lo que pinta');
yes(/if \(!perf && !trend\) return '';/.test(RCL16), 'sin nada que decir no aporta bloque');
yes(COACHJS.slice(COACHJS.indexOf('module.exports')).includes('renderRecoveryBlock'),
  'y el bloque está exportado para los tests');

// 16.g El motor de la línea, en coach-engine.js
yes(typeof E.performanceLine === 'function', 'coach-engine exporta performanceLine()');
eq(E.performanceLine([], [], {}), '', 'que devuelve "" sin datos');
eq(E.PERF_OUTCOME_ARROW.progressed, '↑', 'las flechas están declaradas, no repartidas por el render');
yes(E.COACH_LIFT_LABEL['bench-press'] === 'bench', 'y los nombres cortos viven en el motor');

// 16.h Readiness: seis señales, sin subjetivo
const seis = E.computeReadinessFrom({ today: '2026-09-07' });
eq(seis.signals.length, 6, 'computeReadinessFrom devuelve exactamente 6 señales');
eq(seis.signals.map(x => x.id).join(','), 'whoop,hrv7v28,rhr7v28,sleep7,rpe2,quality2', 'y son éstas');

// 16.i Las etiquetas históricas se conservan, marcadas como tales
yes(/'readiness-adjust': 'recovery adjustment \(historical: no longer written\)'/.test(COACHJS),
  "COACH_DECISION_LABEL conserva 'readiness-adjust' marcada como histórica");
yes(/'deload-request': 'deload \(historical: no longer written\)'/.test(COACHJS),
  "y 'deload-request' igual (las decisiones viejas se siguen leyendo)");

// 16.j Lo que NO se toca: ALT_LIBRARY (la lee el preview del ideal) y el presupuesto.
yes(/const ALT_LIBRARY = \{/.test(APP), 'ALT_LIBRARY sigue existiendo');
yes(/ALT_LIBRARY\[/.test(fnSrc('function renderIdealPreview(')) || /ALT_LIBRARY\[/.test(APP),
  'porque renderIdealPreview la lee para enseñar los cambios posibles de cada día');
yes(/async function computeHardDayBudget\(\)/.test(APP), 'computeHardDayBudget sigue');
yes(/async function renderHardDayBudget\(\)/.test(APP), 'y renderHardDayBudget también');
yes(/async function getWhoopContext\(\)/.test(APP), 'getWhoopContext sigue (honestidad de fecha)');
yes(/async function computeReadiness\(/.test(APP) && /function invalidateReadiness\(\)/.test(APP),
  'computeReadiness/invalidateReadiness siguen');

// 16.k Y la tarjeta dorada, intacta. Quitar el parámetro `adjustments` de `buildExerciseCard` no
// puede mover un solo carácter del HTML de un ejercicio sin objetivo: es la tarjeta que ven los
// ejercicios de medida y los que se estrenan hoy, y §10 la compara con la instantánea de v11.56.
eq(cardCtx.buildExerciseCard(EX_FIXTURE, 1, null, { data: {} }, { data: {} }, false,
  { id: 'upperA' }, [], null).innerHTML, GOLDEN_V1156,
  'la tarjeta sin objetivo sigue siendo byte a byte la de v11.56 tras la retirada');

// 16.l El tile Readiness: el WHOOP de hoy, en la fila de números (v11.65)
//
// EL FALLO QUE ESTA SUBSECCIÓN EXISTE PARA IMPEDIR. El número del wearable subió al dashboard
// porque el usuario lo pidió allí ("lo de WHOOP envíalo arriba, al Readiness / Strain / Streak /
// Volume"). Tres formas de romperlo en silencio:
//
//   · Leer el store `wellness` para llenar el tile: su última fila es la de AYER a primera hora
//     de la mañana, y un tile no tiene sitio para poner la fecha al lado. Sería la mentira que
//     v11.58 (F-6) quitó del advisory, reintroducida en un sitio más visible.
//   · Cuatro tarjetas con el CSS de tres: `repeat(3, 1fr)` con cuatro hijos las desborda en los
//     390 px del iPhone, que es el único ancho en el que esta app se usa.
//   · Un tile sin dato que enseñe un 0, o el número de ayer: "no hay dato de hoy" es información,
//     un cero es una lectura falsa.
const TRIO16 = fnSrc('async function renderHomeStatTrio(');
const TRIO_CARDS = (TRIO16.match(/\{ label: '([A-Za-z ]+)'/g) || []).map(m => m.split("'")[1]);
eq(TRIO_CARDS.length, 4, 'renderHomeStatTrio construye exactamente 4 tarjetas');
// v11.72 (V-23): 'Strain' pasa a 'RPE Load'. Aquí no es la escala 0-21 de WHOOP: es
// Σ(RPE × series hechas) de la semana, y llamarlo Strain invitaba a compararlo con la app.
eq(TRIO_CARDS.join(' > '), 'Readiness > RPE Load > Streak > Volume', 'y en este orden');
yes(/getWhoopContext\(\)/.test(TRIO16),
  'el valor sale de getWhoopContext() — el dato de HOY o nada (F-6)');
yes(!/wellness/.test(TRIO16), 'y NUNCA del store wellness (su última fila puede ser la de ayer)');
yes(!/whoopLastAvailable/.test(TRIO16), 'ni del último dato disponible, que se pinta con su fecha o no se pinta');
yes(/'—'/.test(TRIO16) && /NO DATA/.test(TRIO16), 'sin dato de hoy el tile dice "—" / NO DATA');
yes(/WHOOP OFF/.test(TRIO16) && /typeof whoopIsConnected === 'function'/.test(TRIO16),
  'y "WHOOP OFF" si la integración no está conectada (con guarda typeof)');
yes(!/\b0\b\s*:/.test(TRIO16.slice(TRIO16.indexOf('let rd'), TRIO16.indexOf('const cards'))),
  'la ausencia de dato no se rellena con un 0');
yes(/wc\.score >= 67 \? 'var\(--accent\)' : \(wc\.score >= 34 \? 'var\(--yellow\)' : 'var\(--red\)'\)/.test(TRIO16),
  'las bandas de color son las de WHOOP (≥67 verde · 34-66 amarillo · <34 rojo)');
yes(/repeat\(4, 1fr\)/.test(CSS.slice(CSS.indexOf('.stat-trio {'), CSS.indexOf('.stat-trio {') + 200)),
  '.stat-trio es repeat(4, 1fr) en style.css');
// Y el número se refresca cuando el dato llega tarde: WHOOP publica la recuperación por la
// mañana, muchas veces con la app en segundo plano o recién abierta.
yes(/invalidateReadiness\(\);[\s\S]{0,600}renderHomeStatTrio\(\)/.test(APP),
  'al llegar el dato de hoy en init se repinta el trío');
yes(/visibilityState === 'visible'[\s\S]{0,700}renderHomeStatTrio\(\)/.test(APP),
  'y al volver a primer plano también (sin tocar integrations.js)');

// 16.m La pesada de Withings dice todo lo que mide la báscula, en UNA línea
//
// El servidor escribe pulso, grasa visceral, metabolismo basal y edad metabólica junto al peso.
// El fallo que impide: que esos campos lleguen a IndexedDB y no se vean en ninguna pantalla —el
// dato que nadie enseña es dato que nadie sabe que tiene— o que cada uno se convierta en una
// tarjeta nueva, que es justo lo que esta línea existe para no ser.
const BWI16 = fnSrc('function renderBodyWeightInsights(');
const BW_WITHINGS16 = BWI16.slice(BWI16.indexOf("latest.source === 'withings'"));
for (const k of ['visceralFat', 'bmrKcal', 'heartRateBpm', 'metabolicAge', 'muscleKg']) {
  yes(BW_WITHINGS16.includes(k), `la línea de Withings lee \`${k}\``);
}
yes(/Number\.isFinite/.test(BW_WITHINGS16), 'y sólo pinta lo que es un número finito');
yes(!/replace\('\.', ','\)/.test(BW_WITHINGS16) && /toLocaleString\('en-US'\)/.test(BW_WITHINGS16),
  'con punto decimal y millar inglés (la UI es toda en inglés desde v11.67)');
yes((BW_WITHINGS16.match(/etaEl\.innerHTML \+=/g) || []).length === 1,
  'sigue siendo UNA sola línea: ni una tarjeta ni un gráfico nuevos');

// ── 17. Inc B-4 — LA HOME EXPLICA LA SEMANA (v11.65) ─────────────────────────────────────────
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR. Julian pidió el 2026-09-07, con estas
// palabras: *"El coach tiene que darme feedback de la semana pasada, decirme en qué etapa
// estoy, cómo viene el objetivo y cuál es el enfoque de la semana — por qué cambia o por qué
// sigue igual."* La edge function ya devuelve todo eso (contrato v2). Las formas de que no
// llegue a la pantalla son cinco, y las cinco son silenciosas:
//
//   1. **El brief se queda en la revisión.** `coach_reviews` se poda y la fila de W36 no
//      describe el plan de W38. Sin `coachBrief` DENTRO de la versión del plan, "¿por qué mi
//      Upper A sigue igual?" deja de tener respuesta en cuanto la revisión desaparece.
//   2. **El brief se pierde al deshacer o al cambiar de variante.** Las dos rutas copian una
//      versión a otra; si no arrastran `coachBrief`, un toque en "Deshacer" o un cambio de 6 a
//      4 días vacía la Home sin que nadie lo note.
//   3. **La semana equivocada.** Cerrar el domingo y escribir la propuesta con la clave de la
//      semana que ACABA de terminar: `_coachExpireIfStale` la declara vencida el lunes a las
//      00:00 y el trabajo del coach muere antes de que nadie lo aplique. De ahí
//      `coachTargetWeekKey` (domingo → semana siguiente) y su test con las tres fechas.
//   4. **El callejón sin salida del estado vacío.** Hasta v11.64, sin revisión la tarjeta no
//      se pintaba — y no había ningún sitio desde el que pedir la primera. El estado vacío era
//      también el único camino cerrado.
//   5. **El gate del coste aplicado al camino manual.** El gate de `maybeRunWeeklyCoach`
//      (cualquier fila de la semana corta el disparo) existe para no quemar $0,60 en cada
//      arranque. Copiado al botón, convertiría una revisión `failed` en una semana sin coach.
//
// Y el orden de Home, que es la petición literal: la semana antes que el día.
console.log('');
console.log('17. B-4 · la Home explica la semana (v11.65)');

// 17.a El orden de Home, id a id
const HOME_HTML = HTML.slice(HTML.indexOf('id="view-home"'), HTML.indexOf('id="view-gym"'));
const HOME_IDS = [...HOME_HTML.matchAll(/id="([a-z0-9-]+)"/g)].map(m => m[1]);
const HOME_ESPERADO = [
  'view-home', 'home-scroll',
  'resume-workout-banner', 'resume-mobility-banner',
  'home-topbar', 'plan-selector', 'week-calendar',
  'coach-week-card', 'coach-goal-line',
  'todays-detail',                    // la fila "Today's session"
  'coach-readout', 'todays-plan-card',
  'home-stat-trio',                   // v11.65: 4 tiles, Readiness el primero
  'queue-ahead',                      // la fila "This week"
  'home-queue',
];
eq(HOME_IDS.join(' > '), HOME_ESPERADO.join(' > '), 'el orden de Home es exactamente el de §B.5');
yes(HOME_IDS.indexOf('coach-week-card') < HOME_IDS.indexOf('todays-detail'),
  'la tarjeta del coach va ANTES de "Today\'s session" (la semana manda sobre el día)');
yes(!/<div id="coach-week-card" class="hidden">/.test(HTML),
  '#coach-week-card ya no arranca oculto (siempre hay algo que decir, aunque sea "cierra la semana")');

// 17.a-bis V-4 · un destino por gesto en el topbar
//
// El fallo que esta subseccion existe para impedir: tres botones al mismo sitio. La campana,
// el engranaje y el avatar hacian los tres `switchTab('settings')`, y la campana ademas
// prometia notificaciones que la app no manda. Ahora el engranaje baja a Integraciones, el
// avatar abre Ajustes, y en el hueco de la campana esta el punto de estado (V-8).
const TOPBAR68 = fnSrc('function renderHomeTopbar(');
yes(!/ht-bell/.test(APP), 'la campana del topbar no existe en ninguna parte de app.js');
yes(!/ht-bell/.test(HTML), 'ni en index.html');
yes(/id="ht-settings"/.test(TOPBAR68) && /id="ht-profile"/.test(TOPBAR68),
  'quedan el engranaje y el avatar');
yes(/openSettingsAt\('integrations-card'\)/.test(TOPBAR68),
  'el engranaje abre Ajustes EN Integraciones (dos gestos, dos destinos)');
yes(/id="ht-status"/.test(TOPBAR68), 'y el punto de estado (V-8) ocupa el hueco de la campana');
yes(!/Julian Garmendia/.test(APP.replace(/\/\/.*/g, '')),
  'el nombre por defecto ya no esta en el codigo (V-5; el comentario que lo cita no cuenta)');
yes(/function homeAvatarInitials\(/.test(APP), 'las iniciales salen de homeAvatarInitials()');
yes(/state\._authEmail/.test(fnSrc('function homeAvatarInitials(')),
  'con el email de la sesion como segundo origen');
yes(/return 'JG'/.test(fnSrc('function homeAvatarInitials(')), "y 'JG' solo como ultimo recurso");

// 17.b Lo que B-1 se llevó de Home no vuelve, y el presupuesto sigue en Stats
for (const id of ['training-advisory', 'recovery-hero', 'deload-reminder']) {
  yes(!HOME_HTML.includes(`id="${id}"`), `Home sigue sin #${id}`);
  yes(!HTML.includes(`id="${id}"`), `y no está en ninguna otra vista`);
}
yes(!HOME_HTML.includes('id="hard-day-budget"'), 'el presupuesto de días duros no vuelve a Home');
yes(/id="hard-day-budget" data-group="week"/.test(HTML), 'sigue en Stats › Week (V-10)');
// v11.65: y la línea de rendimiento tampoco vuelve — se fue a Stats con el mismo argumento.
// v11.72 (V-10): su contenedor ya no existe; su contenido es el primer bloque de la tarjeta
// única de recuperación, que vive en Stats › Now.
yes(!HOME_HTML.includes('id="coach-recovery-line"') && !HOME_HTML.includes('id="readiness-signals"'),
  'la línea de rendimiento tampoco vuelve a Home');

// coach-facts.js en su propio sandbox, para probar el validador nuevo sin tocar el de §15.
const F17 = (() => {
  const sb = { module: { exports: {} }, console };
  sb.exports = sb.module.exports;
  vm.createContext(sb);
  new vm.Script(ENGINE).runInContext(sb);
  sb.module = { exports: {} }; sb.exports = sb.module.exports;
  new vm.Script(FACTSJS).runInContext(sb);
  return sb.module.exports;
})();

// 17.c El motor: la semana PARA la que se pide la revisión
yes(typeof E.coachTargetWeekKey === 'function', 'coach-engine exporta coachTargetWeekKey()');
eq(E.coachTargetWeekKey('2026-09-13'), '2026-W38', "domingo 13-sep → '2026-W38' (la que empieza mañana)");
eq(E.coachTargetWeekKey('2026-09-09'), '2026-W37', "miércoles 9-sep → '2026-W37' (la de ahora)");
eq(E.coachTargetWeekKey('2026-09-07'), '2026-W37', "lunes 7-sep → '2026-W37'");
eq(E.coachTargetWeekKey('2026-09-12'), '2026-W37', 'y el sábado todavía es la de ahora');
eq(E.coachTargetWeekKey('basura'), null, 'con una entrada que no es fecha devuelve null');
eq(Object.keys(E.PHASE_LABEL || {}).sort().join(','), 'base,build,deload,intensify,maintenance',
  'PHASE_LABEL tiene las 5 fases del contrato v2, y sólo ésas');
yes(Object.values(E.PHASE_LABEL || {}).every((v) => typeof v === 'string' && v.length > 0),
  'y todas llevan etiqueta (nada de ids crudos en pantalla)');
eq(E.PHASE_LABEL.intensify, 'intensify', "la etiqueta es inglesa ('intensify', no 'intensificación')");
yes(typeof E.blockLabel === 'function', 'coach-engine exporta blockLabel()');
eq(E.blockLabel('2026-09-07', '2026-09-07'), 'B1', 'el bloque que empieza en el ancla es B1');
eq(E.blockLabel('2026-10-05', '2026-09-07'), 'B1', 'la semana de descarga sigue siendo B1 (5 semanas)');
eq(E.blockLabel('2026-10-12', '2026-09-07'), 'B2', 'y la siguiente ya es B2');
eq(E.blockLabel('2026-09-01', '2026-09-07'), null, 'antes del ancla no se extrapola: null');
eq(E.blockLabel('2026-09-07', null), null, 'y sin ancla tampoco');

// 17.d `coachBrief` se estampa al aplicar y se arrastra en variante y rollback
const ACP17 = COACHJS.slice(COACHJS.indexOf('async function applyCoachProposal('),
  COACHJS.indexOf('async function rejectCoachProposal('));
yes(/coachBrief/.test(ACP17), 'applyCoachProposal construye el coachBrief');
yes(/coachBriefFromReview\(/.test(ACP17), 'con coachBriefFromReview() (una sola fuente, con fallback v1)');
yes(/coachBrief,/.test(ACP17), 'y lo estampa en el `meta` de la versión nueva');
yes(ACP17.indexOf('coachBriefFromReview(') < ACP17.indexOf('validatePlanVersion('),
  'el brief se construye ANTES de validar (si no, WEEK-SUMMARY no podría dispararse nunca)');
yes(/appliedAt: Date\.now\(\)/.test(ACP17), 'con appliedAt');
for (const k of ['focus:', 'phase:', 'kept:', 'changed:']) {
  yes(ACP17.includes(k), `la decisión plan-apply lleva ${k.replace(':', '')}`);
}
const RBK17 = COACHJS.slice(COACHJS.indexOf('async function rollbackPlanVersion('),
  COACHJS.indexOf('async function _coachReconcileOverrides('));
yes(/coachBrief: old\.coachBrief/.test(RBK17), 'rollbackPlanVersion arrastra el coachBrief de la versión que copia');
const AVO17 = fnSrc('async function _applyVariantOverCoachPlan(');
yes(/coachBrief: \(prev && prev\.coachBrief\)/.test(AVO17),
  '_applyVariantOverCoachPlan también (cambiar de calendario no borra el porqué)');

// El contrato del brief, campo a campo.
const CBR17 = COACHJS.slice(COACHJS.indexOf('function coachBriefFromReview('),
  COACHJS.indexOf('// ==================== EL PACK DE HECHOS'));
for (const k of ['reviewId', 'weekKey', 'appliedAt', 'focus', 'phase', 'whyChanged', 'whyKept',
                 'priorities', 'lastWeekSummary', 'weekSummary']) {
  // `[,:]` porque el objeto usa taquigrafía (`priorities,`) en la mitad de los campos.
  yes(new RegExp(`\\b${k}[,:]`).test(CBR17), `el brief lleva ${k}`);
}
yes(/diff/.test(CBR17), 'y el fallback v1 se deriva del diff');

// 17.e El validador: una sesión sin fila avisa, y sólo con brief
yes(/'WEEK-SUMMARY': '[^']+'/.test(COACHJS), "COACH_GUARD_LABEL etiqueta 'WEEK-SUMMARY' (nada de ids crudos)");
yes(/'WEEK-SUMMARY'/.test(FACTSJS), 'coach-facts.js emite el aviso WEEK-SUMMARY');
{
  const planSinResumen = {
    sessions: { upperA: { id: 'upperA', name: 'Upper A', exercises: [] }, upperB: { id: 'upperB', name: 'Upper B', exercises: [] } },
    coachBrief: { weekSummary: [{ sessionId: 'upperA', status: 'kept', line: 'sin cambios' }] },
  };
  const res = F17.validatePlanVersion(planSinResumen, {});
  const ws = res.filter(r => r.id === 'WEEK-SUMMARY');
  eq(ws.length, 1, 'con una sesión sin fila, un aviso y sólo uno');
  eq(ws[0].level, 'warn', 'y es BLANDO (nada bloquea)');
  yes(/Upper B/.test(ws[0].text), 'que nombra la sesión que falta');
  const completo = JSON.parse(JSON.stringify(planSinResumen));
  completo.coachBrief.weekSummary.push({ sessionId: 'upperB', status: 'changed', line: 'sube el remo' });
  eq(F17.validatePlanVersion(completo, {}).filter(r => r.id === 'WEEK-SUMMARY').length, 0,
    'con todas las filas, callado');
  const sinBrief = { sessions: planSinResumen.sessions };
  eq(F17.validatePlanVersion(sinBrief, {}).filter(r => r.id === 'WEEK-SUMMARY').length, 0,
    'y sin coachBrief no dice nada (un plan de la semilla no lleva resumen)');
}

// 17.f El camino manual no se bloquea por filas de esa semana
const RWC17 = COACHJS.slice(COACHJS.indexOf('async function runWeeklyCoach('),
  COACHJS.indexOf('async function _coachMirror('));
yes(!/if \(mine\.length\) return/.test(RWC17),
  'runWeeklyCoach NO copia el gate del disparo automático (failed/rejected/expired no bloquean)');
yes(/force/.test(RWC17), 'acepta `force`');
yes(/status === 'running'/.test(RWC17), "una fila `running` de esa semana retoma el polling");
yes(/status === 'proposed'/.test(RWC17), 'y una `proposed` navega a ella en vez de volver a pagar');
yes(/openCoachView\(\)/.test(RWC17), 'con openCoachView()');
for (const st of ["'failed'", "'rejected'", "'expired'"]) {
  yes(!RWC17.includes(`r.status === ${st}`), `${st} no aparece como condición de corte`);
}
// El gate del coste SIGUE en su sitio: el disparo automático.
const MRW17 = COACHJS.slice(COACHJS.indexOf('async function maybeRunWeeklyCoach('),
  COACHJS.indexOf('async function runWeeklyCoach('));
yes(/if \(mine\.length\) return/.test(MRW17),
  'el gate por coste sigue INTACTO en maybeRunWeeklyCoach (una llamada por semana)');

// 17.g El botón "Cerrar semana y pedir la próxima"
yes(/coach-close-week/.test(COACHJS), 'existe el botón #coach-close-week');
// v11.72 (V-12): la etiqueta es una FUNCIÓN del modo. En manual no se le pide nada a nadie —
// se guarda el pack y se espera —, así que "…and ask for the next" era una promesa falsa.
yes(/function COACH_CLOSE_WEEK_LABEL\(\)/.test(COACHJS), 'COACH_CLOSE_WEEK_LABEL es función del modo');
yes(/'Close the week \(manual review\)'/.test(COACHJS), "en manual: 'Close the week (manual review)'");
yes(/'Close the week and ask for the next'/.test(COACHJS),
  "y con API el texto que pidió Julian, en inglés (V-1)");
const CBW17 = COACHJS.slice(COACHJS.indexOf('function _coachBindCloseWeek('),
  COACHJS.indexOf('// ==================== TARJETA DE HOME'));
yes(/_cTargetWeek\(today\(\)\)/.test(CBW17), 'pide la revisión PARA la semana objetivo (domingo → la siguiente)');
yes(/b\.disabled = true/.test(CBW17) && /Closing the week…/.test(CBW17),
  'y se marca en marcha en el propio botón (60-180 s sin marca = doble pulsación)');
// v11.72 (V-12): UNA implementación de la tarjeta para las dos pantallas. Los ids llevan
// sufijo por contenedor, porque Home y la vista Coach conviven en el mismo documento y
// `getElementById` sólo encontraría uno.
yes(/const sufijo = \(!opts\.into \|\| opts\.into === 'coach-week-card'\) \? '' : '-view'/.test(COACHJS),
  'la vista Coach usa ids con sufijo propio (dos elementos con el mismo id: getElementById sólo ve uno)');
yes(/const bid = \(base\) => `\$\{base\}\$\{sufijo\}`/.test(COACHJS), 'con un helper único de ids');
yes(/if \(cerrar\) _coachBindCloseWeek\(cerrar\)/.test(COACHJS), 'y se cablea allí');
yes(/async function _coachRenderWeek\(el, review\) \{[\s\S]{0,200}renderCoachWeekCard\(\{ into: 'coach-week' \}\)/.test(COACHJS),
  'la semana de la vista Coach delega en renderCoachWeekCard({ into }) — una sola tarjeta');
yes(/review\.status === 'requested'/.test(RCWC_SRC),
  'así que la vista Coach también conoce el estado `requested` (V-12: antes no)');
yes(/coachAutoApplyMode/.test(COACHJS) && /: 'ask'/.test(COACHJS), "coachAutoApply sigue en 'ask'");

// 17.h La línea de objetivo en Home
yes(/async function renderCoachGoalLine\(\)/.test(COACHJS), 'renderCoachGoalLine() vive en coach.js');
yes(/async function _coachGoalProgressFromStores\(/.test(COACHJS),
  'con el cálculo compartido en _coachGoalProgressFromStores()');
const CGL17 = COACHJS.slice(COACHJS.indexOf('async function renderCoachGoalLine('),
  COACHJS.indexOf('// ============================================================\n// COACH SEMANAL'));
yes(/_coachGoalProgressFromStores\(\)/.test(CGL17), 'la línea reusa ese cálculo (no reimplementa la pendiente)');
yes(!/goalProgress\(/.test(CGL17), 'y no vuelve a llamar a goalProgress por su cuenta');
yes(/no signal/.test(CGL17), 'con el fallback honesto "no signal (N weigh-ins in 14 d)"');
yes(/openCoachView\(\)/.test(CGL17), 'un toque abre la vista Coach');
yes(!/<button/.test(CGL17), 'y no hay más botones que ese toque');
yes(/_cNum\(/.test(CGL17), 'los números salen por el helper _cNum (punto decimal, un solo sitio)');
const HOME17 = fnSrc('async function renderHomeView(');
yes(/renderCoachGoalLine/.test(HOME17), 'renderHomeView llama renderCoachGoalLine()');
yes(/safeCall\('renderCoachGoalLine'\)/.test(HOME17), 'por safeCall (V-9)');
yes(/safeCall\('renderCoachWeekCard'\)/.test(HOME17) && /renderHomeStatTrio\(\)/.test(HOME17),
  'y sigue llamando a la tarjeta del coach y al trío de estadísticas (v11.65: la línea de'
  + ' recuperación se mudó a Stats)');
for (const fn of ['renderCoachGoalLine', 'coachBriefFromReview']) {
  yes(COACHJS.slice(COACHJS.indexOf('module.exports')).includes(fn), `${fn} está exportada`);
}

// 17.i La vista Coach y el teaser de Stats hablan el contrato v2
const RBRIEF17 = COACHJS.slice(COACHJS.indexOf('async function _coachRenderBriefing('),
  COACHJS.indexOf('async function _coachRenderProposal('));
for (const t of ['Focus', 'Phase', 'What changes and why', 'Why it holds']) {
  yes(RBRIEF17.includes(t), `la vista Coach pinta "${t}"`);
}
yes(/_coachWsRowHtml\(/.test(RBRIEF17), 'y la tabla de sesiones fila a fila');
const LWC17 = fnSrc('async function loadAndRenderWeeklyCoach(');
// v11.68 (V-4): el teaser de Stats YA NO repite el `focus`.
//
// El fallo que esta subseccion existe para impedir es el contrario del de v11.65: la misma
// frase del modelo en tres pantallas (tarjeta de Home, vista Coach y este teaser). El teaser
// es un enlace con estado — dice qué semana y cómo va la revisión — y el foco vive en los dos
// sitios donde se lee y se razona. Si alguien lo vuelve a meter aquí, esto lo caza.
yes(!/\.focus/.test(LWC17), 'el teaser de Stats NO pinta el `focus` (vive en Home y en Coach)');
yes(!/priorities/.test(LWC17), 'ni las prioridades v1, que eran el fallback del mismo dato');
yes(/status === 'running'/.test(LWC17), 'lo que sí dice es el estado de la revisión');
yes(/coachVoice/.test(LWC17), 'y la prosa legacy del cron retirado, que no duplica nada');

// 17.j CSS nueva, al final del fichero y sin animaciones
for (const clase of ['.coach-goal-line', '.cgl-row', '.cwc-focus', '.cwc-block', '.cwc-label',
                     '.cwc-line', '.cwc-bullets', '.cwc-why', '.cwc-ws', '.ws-row', '.ws-chip',
                     '.ws-name', '.ws-line', '.coach-close-week']) {
  yes(new RegExp(`\\${clase}[\\s,{:.\\[]`).test(CSS), `${clase} existe en style.css`);
}
for (const st of ['kept', 'changed', 'new', 'removed']) {
  yes(CSS.includes(`.ws-chip.${st}`), `.ws-chip.${st} tiene su color`);
}
yes(!/@keyframes cwc-|animation:[^;]*cwc-/.test(CSS), 'y cero animaciones nuevas');

// 17.k LA TARJETA, RENDERIZADA DE VERDAD (DOM stub)
//
// Los greps de arriba no pueden ver el HTML. Esto lo pinta con `coach.js` entero dentro de un
// `vm`: los tres estados que importan (`none`, `applied` v2 y `applied` con una revisión v1)
// tienen que producir texto, no una excepción tragada por el try/catch — que es exactamente
// cómo esta tarjeta se quedaría en blanco sin que nadie se entere.
{
  const nodes = {};
  const mkNode = (id) => ({
    id, innerHTML: '', textContent: '', disabled: false, dataset: {},
    classList: { add() {}, remove() {}, contains() { return false; } },
    addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; },
  });
  for (const id of ['coach-week-card', 'coach-goal-line', 'coach-week', 'coach-briefing']) nodes[id] = mkNode(id);

  const store = { coach_reviews: [], bodyweight: [], plans: [] };
  const ctx = {
    console,
    module: { exports: {} },
    setTimeout, clearTimeout,
    document: {
      getElementById: (id) => nodes[id] || null,
      createElement: () => mkNode(''),
      addEventListener() {},
      visibilityState: 'visible',
    },
    navigator: { onLine: true },
    today: () => '2026-09-07',
    dateStr: (d) => new Date(d).toISOString().slice(0, 10),
    dbGetAll: async (s) => (store[s] || []).map(r => JSON.parse(JSON.stringify(r))),
    dbGet: async () => null,
    dbPut: async () => {},
    smartPut: async () => {},
    escapeHtml: (s) => String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    DELOAD_BLOCK_WEEKS: 5,
    blockWeek: () => E.blockWeekFromDates('2026-09-14', '2026-09-07', 5),
    getExerciseName: (id) => id,
    exerciseLibrary: {},
    state: { settings: { deloadAnchorDate: '2026-09-07' }, currentView: 'home' },
    activePlan: null,
  };
  ctx.exports = ctx.module.exports;
  vm.createContext(ctx);
  new vm.Script(ENGINE).runInContext(ctx);
  ctx.module = { exports: {} }; ctx.exports = ctx.module.exports;
  new vm.Script(FACTSJS).runInContext(ctx);
  ctx.module = { exports: {} }; ctx.exports = ctx.module.exports;
  new vm.Script(COACHJS).runInContext(ctx);
  const C = ctx.module.exports;
  yes(typeof C.renderCoachWeekCard === 'function', 'coach.js carga en vm y exporta renderCoachWeekCard');
  yes(!!(C.COACH_GUARD_LABEL || {})['WEEK-SUMMARY'], "y COACH_GUARD_LABEL['WEEK-SUMMARY'] tiene etiqueta");
  eq(Object.keys(C.COACH_WS_STATUS_LABEL || {}).sort().join(','), 'changed,kept,new,removed',
    'los cuatro estados de una sesión tienen su chip');

  // --- Estado `none`: no hay ninguna revisión todavía ---
  store.coach_reviews = [];
  ctx.activePlan = null;
  await C.renderCoachWeekCard();
  const NONE = nodes['coach-week-card'].innerHTML;
  yes(NONE.includes('First week with the coach'), 'estado `none`: "First week with the coach"');
  yes(NONE.includes('coach-close-week'), 'estado `none`: con el botón para cerrar la semana');
  yes(NONE.includes('Close the week now'), 'y su texto');
  yes(NONE.includes('Coach · W37'), 'con la semana objetivo en la cabecera (lunes 7-sep → W37)');
  yes(NONE.length > 0, 'la tarjeta ya NO se queda vacía sin revisión');

  // --- Estado `applied` con un brief v2 completo ---
  const WS = [
    { sessionId: 'upperA', status: 'kept', line: '8/8/7 @7,5 el 1-sep: un dato más antes de subir' },
    { sessionId: 'upperB', status: 'changed', line: 'OHP 55 → 57,5 kg tras dos sesiones a RPE 7' },
    { sessionId: 'lowerA', status: 'kept', line: 'sentadilla 105 se mantiene: la rodilla va justa' },
    { sessionId: 'lowerB', status: 'new', line: 'entra el peso muerto trap-bar' },
  ];
  ctx.activePlan = {
    id: 'plan_v15', version: 15, basedOn: 'plan_v14', reviewId: '2026-W38#1',
    author: 'coach-llm', weekKey: '2026-W38',
    sessions: {
      upperA: { id: 'upperA', name: 'Upper A' }, upperB: { id: 'upperB', name: 'Upper B' },
      lowerA: { id: 'lowerA', name: 'Lower A' }, lowerB: { id: 'lowerB', name: 'Lower B' },
    },
    coachBrief: {
      reviewId: '2026-W38#1', weekKey: '2026-W38', appliedAt: 1,
      focus: 'mantener los 6 anclas y sumar el largo a 6,5 km',
      phase: 'build',
      whyKept: 'Upper A igual: 8/8/7 @7,5 el 1-sep, un dato más antes de subir.',
      whyChanged: '',
      priorities: ['Sumar el largo', 'Sostener la banca', 'Dormir 7 h'],
      lastWeekSummary: ['3 de 4 sesiones · banca 95×8 ↑', '12,1 km en 2 carreras, ambas en Z2'],
      weekSummary: WS,
    },
  };
  store.coach_reviews = [{
    id: '2026-W38#1', weekKey: '2026-W38', attempt: 1, status: 'applied',
    createdAt: 1, guardrails: [], output: { briefing: {}, proposal: {} },
  }];
  await C.renderCoachWeekCard();
  const APPL = nodes['coach-week-card'].innerHTML;
  yes(APPL.includes('LAST WEEK'), 'estado `applied`: bloque LAST WEEK');
  yes(APPL.includes('3 de 4 sesiones'), 'con los bullets de la semana pasada');
  yes(APPL.includes('THIS WEEK'), 'bloque THIS WEEK');
  yes(APPL.includes('Week 2/5'), 'con la semana del bloque');
  yes(APPL.includes('B1'), 'la etiqueta del bloque');
  yes(APPL.includes('build phase'), 'la fase con su etiqueta inglesa (build → build phase)');
  yes(APPL.includes('Focus: mantener los 6 anclas'), 'y el foco de la semana');
  yes(APPL.includes('WHY IT HOLDS'), 'bloque WHY IT HOLDS');
  yes(!APPL.includes('WHAT CHANGES AND WHY'), 'y sin WHAT CHANGES AND WHY cuando whyChanged viene vacío');
  yes(/<div class="cwc-block"><div class="cwc-label">WHY IT HOLDS/.test(APPL),
    'que va ABIERTO (no plegado) cuando es lo único que hay que leer');
  yes(APPL.includes('What changes (2 sessions)'), 'desplegable "What changes" con las 2 que no son `kept`');
  yes(APPL.includes('All sessions (4)'), 'y "All sessions" con las 4');
  for (const w of WS) {
    yes(APPL.includes(ctx.escapeHtml(w.line)), `la fila de ${w.sessionId} lleva su motivo`);
  }
  yes(APPL.includes('Upper A') && APPL.includes('Lower B'), 'con los nombres de sesión del plan');
  yes(APPL.includes('plan v15'), 'la cabecera dice la versión del plan');
  yes(APPL.includes('See all'), 'y ofrece "See all ›"');
  yes(APPL.includes('coach-week-undo'), 'con el Deshacer en su sitio');
  yes(!/undefined|\[object Object\]/.test(APPL), 'y sin "undefined" ni objetos en pantalla');

  // --- Revisión v1 (sin weekSummary, sin whyKept): el fallback pinta y no lanza ---
  ctx.activePlan = {
    id: 'plan_v9', version: 9, basedOn: 'plan_v8', reviewId: '2026-W20#1',
    sessions: { upperA: { id: 'upperA', name: 'Upper A' }, upperB: { id: 'upperB', name: 'Upper B' } },
  };
  store.coach_reviews = [{
    id: '2026-W20#1', weekKey: '2026-W20', attempt: 1, status: 'applied', createdAt: 1,
    output: {
      briefing: { lastWeek: 'Semana floja.', nextWeek: 'Subimos el remo.', priorities: ['Sostener la banca'] },
      proposal: { phase: 'build', sessions: [{ id: 'upperB', exercises: [] }] },
    },
  }];
  nodes['coach-week-card'].innerHTML = '';
  await C.renderCoachWeekCard();
  const V1 = nodes['coach-week-card'].innerHTML;
  yes(V1.length > 0, 'una revisión v1 sigue pintando la tarjeta (fallback, no excepción)');
  yes(V1.includes('Focus: Sostener la banca'), 'el foco v1 sale de la primera prioridad');
  yes(V1.includes('All sessions (2)'), 'y las filas se derivan del plan');
  yes(V1.includes('no changes'), 'las sesiones que no toca la propuesta salen como "no changes"');
  yes(!V1.includes('POR QUÉ SE MANTIENE'), 'sin whyKept no se inventa un motivo');

  // El brief puro, sin DOM: la forma que se estampa en el plan.
  const b1 = C.coachBriefFromReview(store.coach_reviews[0], { prev: ctx.activePlan, next: ctx.activePlan });
  eq(b1.phase, 'base', "la fase binaria v1 ('build') se mapea a 'base'");
  eq(b1.whyKept, '', 'y whyKept queda vacío (v1 nunca justificó lo que mantenía)');
  eq(b1.weekSummary.length, 2, 'con una fila por sesión del plan');
  eq(b1.weekSummary.filter(w => w.status === 'changed').length, 1, 'y sólo la tocada sale como `changed`');
  const b2 = C.coachBriefFromReview({
    id: 'x', weekKey: '2026-W38',
    output: { briefing: { focus: 'f', phase: 'intensify', whyKept: 'k', whyChanged: 'c', lastWeekSummary: ['a', 'b', 'c', 'd'] },
      proposal: { weekSummary: WS } },
  });
  eq(b2.phase, 'intensify', 'una revisión v2 conserva su fase del enum');
  eq(b2.lastWeekSummary.length, 3, 'y lastWeekSummary se acota a 3 líneas');
  eq(b2.weekSummary.length, 4, 'con las filas que dio el coach');
}

// ── 18. Aplicar y deshacer sin perder trabajo (E-15, E-16, E-18 · v11.67) ──────────
//
// LOS TRES FALLOS QUE ESTE BLOQUE IMPIDE (auditoría 2026-09-08):
//
//   E-15 · **Base obsoleta.** `applyCoachProposal` mergea el diff contra el `activePlan` DEL
//     MOMENTO DE APLICAR, no contra la versión que el coach tenía delante. Entre la propuesta
//     del domingo y el toque del lunes cabe un `setIdealVariant` (4 → 5 días) o un rollback: el
//     "sube la banca a 95" se estampaba sobre otra base y nadie se enteraba.
//   E-16 · **Deshacer perdía los overrides.** Aplicar limpia los swaps de ejercicio absorbidos
//     y los cambios de día hechos a mano. El rollback restauraba `sessions` y `weekTemplate` y
//     NO esos overrides, así que Deshacer devolvía el plan viejo sin los cambios manuales que
//     el usuario tenía encima — trabajo suyo, borrado por un botón que promete lo contrario.
//   E-18 · **El piloto de kcal no tenía reloj.** `settings.kcalFirstAdjustDate` /
//     `kcalLastAdjustDate` no existían, así que `nextEligibleAdjustDate` era `null` SIEMPRE y
//     el gate de 14 días de `KCAL-STEP` (REC-002) no se podía comprobar.
console.log('');
console.log('18. E-15/E-16/E-18 · aplicar contra la base correcta y deshacer sin perder nada');

const ACP18 = COACHJS.slice(COACHJS.indexOf('async function applyCoachProposal('),
  COACHJS.indexOf('async function rejectCoachProposal('));

// 18.a E-15 · el aviso de base obsoleta
yes(/review\.facts\.plan \? Number\(review\.facts\.plan\.version\)/.test(ACP18),
  'lee la versión que viajó en el pack (facts.plan.version)');
yes(/baseVersion !== nowVersion/.test(ACP18), 'la compara con la del plan activo');
yes(/The plan changed since this review \(v\$\{baseVersion\} → v\$\{nowVersion\}\)\. Apply anyway\?/.test(ACP18),
  'y pregunta en inglés, con las dos versiones en la frase');
yes(/confirm\(msg\)/.test(ACP18), 'con un confirm() (bloqueante: aplicar es irreversible sin Deshacer)');
yes(/if \(!seguir\)[\s\S]{0,200}return null;/.test(ACP18), 'si se dice no, no se aplica nada');
yes(ACP18.indexOf('confirm(msg)') < ACP18.indexOf('createNewPlanVersion('),
  'el aviso llega ANTES de crear la versión, no después');
yes(/baseVersion,/.test(ACP18) && /appliedOnVersion: nowVersion,/.test(ACP18),
  'la versión nueva registra baseVersion y appliedOnVersion (sin las dos, "por qué dice esto" no se reconstruye)');

// 18.b E-16 · la instantánea y su restauración
yes(/const preApply = \{/.test(ACP18), 'applyCoachProposal construye preApply');
yes(/exerciseOverrides: \(typeof exerciseOverrides === 'object' && exerciseOverrides\)/.test(ACP18),
  '…con los swaps de ejercicio');
yes(/weekSchedule: await/.test(ACP18), '…y con los cambios de día del calendario');
yes(/JSON\.parse\(JSON\.stringify\(exerciseOverrides\)\)/.test(ACP18),
  '…copiados en profundidad (una referencia se vaciaría con la limpieza de después)');
yes(/preApply,/.test(ACP18), 'y viaja en la versión nueva (meta se esparce al nivel superior)');
yes(ACP18.indexOf('const preApply') < ACP18.indexOf('_coachReconcileOverrides('),
  'la instantánea se toma ANTES de limpiar los overrides');

const RBK18 = COACHJS.slice(COACHJS.indexOf('async function rollbackPlanVersion('),
  COACHJS.indexOf('async function _coachReconcileOverrides('));
yes(/const snap = \(prev && prev\.preApply\) \|\| null;/.test(RBK18),
  'el rollback lee la instantánea de la versión QUE SE DESHACE (no de la que restaura)');
yes(/Object\.assign\(exerciseOverrides, JSON\.parse\(JSON\.stringify\(snap\.exerciseOverrides\)\)\)/.test(RBK18),
  'restaura los swaps');
yes(/smartPut\('settings', \{ key: 'exerciseOverrides'/.test(RBK18),
  '…y los persiste por la ruta que sincroniza');
yes(/saveWeekSchedule\(JSON\.parse\(JSON\.stringify\(snap\.weekSchedule\)\)\)/.test(RBK18),
  'y restaura los cambios de día con saveWeekSchedule()');
yes(/for \(const k of Object\.keys\(exerciseOverrides\)\) delete exerciseOverrides\[k\];/.test(RBK18),
  'limpia antes de asignar (si no, quedarían mezclados los de después con los de antes)');
yes(/overridesRestored/.test(RBK18), 'y la decisión registrada dice cuántos se restauraron');
yes(/no prior snapshot/.test(RBK18),
  '…o que no había instantánea (las versiones anteriores a v11.67 no la llevan)');

// 18.c E-18 · el reloj del piloto de kcal
yes(/kcalLastAdjustDate: ds,/.test(ACP18), 'aplicar sella settings.kcalLastAdjustDate');
yes(/kcalFirstAdjustDate: state\.settings\.kcalFirstAdjustDate \|\| ds,/.test(ACP18),
  '…y kcalFirstAdjustDate sólo la primera vez');
yes(/smartPut\('settings', \{ key: 'userSettings', data: state\.settings \}\)/.test(ACP18),
  '…por la misma ruta que Ajustes, así que el pack del domingo siguiente la lee desde cualquier dispositivo');
yes(/nut\.kcalTarget != null \? nut\.kcalTarget : nut\.kcal/.test(ACP18),
  'el disparador es que la propuesta traiga nutrition.kcalTarget');
yes(/!isFinite\(anterior\) \|\| anterior !== kcal/.test(ACP18),
  'sólo si el número CAMBIA: repetir el mismo objetivo cada domingo reiniciaría el reloj de 14 días y el gate no dispararía nunca');
yes(/kcalLastAdjustValue: kcal,/.test(ACP18), '…y para eso se guarda el último valor sellado');
// El validador tiene que recibir esas fechas o `KCAL-STEP` no puede comprobar el gate.
const CTX18 = COACHJS.slice(COACHJS.indexOf('async function _coachValidateCtx('),
  COACHJS.indexOf('async function applyCoachProposal('));
yes(/kcalLastAdjustDate: \(state && state\.settings && state\.settings\.kcalLastAdjustDate\)/.test(CTX18),
  '_coachValidateCtx() pasa kcalLastAdjustDate al validador');
yes(/daysSinceKcalAdjust:/.test(CTX18), '…y los días transcurridos');
yes(/kcalTarget: \(\(\) => \{/.test(CTX18), '…y el objetivo vigente, para medir el paso');
// Y coach-facts.js sigue leyendo esas claves (el contrato de coach-facts-schema.md:641-645).
yes(/ctx\.settings\.kcalFirstAdjustDate/.test(FACTSJS), 'coach-facts.js lee settings.kcalFirstAdjustDate');
yes(/_cfDate\(ctx\.settings\.kcalLastAdjustDate\)/.test(FACTSJS), '…y settings.kcalLastAdjustDate');
yes(/nextEligibleAdjustDate: nextEligible/.test(FACTSJS),
  '…y de ahí sale nextEligibleAdjustDate, que hasta ahora era null siempre');

// ══════════════════════════════════════════════════════════════════════════════════
// v11.73 · Código y tests (auditoría 2026-09-09, incremento 5)
// ══════════════════════════════════════════════════════════════════════════════════

// ── C-10 · UNA sola semana ISO ─────────────────────────────────────────────────────
//
// EL FALLO. Había TRES: `_isoWeekKeyFor` en app.js, una `isoWeekKey` LOCAL dentro de
// `renderStreaks` que SOMBREABA al global del motor (misma firma, otra aritmética), y la del
// motor. Las dos de app.js contaban en hora local con la fórmula del 1-ene; la del motor
// cuenta en UTC con la del 4-ene, que es ISO 8601. Discrepan en las fronteras de año y en el
// cambio de horario, así que la racha de Stats y el `weekKey` del pack podían meter el mismo
// entreno en semanas distintas. Y quien leía `renderStreaks` creía estar llamando al motor.
console.log('');
console.log('19. C-10 · una sola semana ISO');
{
  const APP_CODE = APP.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  yes(!/function _isoWeekKeyFor\(/.test(APP_CODE), 'app.js ya no define _isoWeekKeyFor()');
  yes(!/_isoWeekKeyFor/.test(APP_CODE), 'ni la llama en ningún sitio');
  eq((APP_CODE.match(/function isoWeekKey\(/g) || []).length, 0,
    'app.js no redefine isoWeekKey() en NINGÚN ámbito (la local sombreaba al global)');
  eq((ENGINE.match(/^function isoWeekKey\(/gm) || []).length, 1,
    'la única definición vive en coach-engine.js');
  // Todo argumento de `isoWeekKey(` en app.js tiene que ser una CADENA de fecha, no un Date.
  const args = [...APP_CODE.matchAll(/[^_.\w]isoWeekKey\(([^)]*)\)/g)].map((m) => m[1].trim());
  yes(args.length >= 8, `${args.length} llamadas a isoWeekKey() en app.js`);
  const conDate = args.filter((a) => /new Date\(/.test(a));
  eq(conDate.length, 0, `ninguna le pasa un Date${conDate.length ? ' — ' + conDate.join(' | ') : ''}`);
  // Y la frontera de año, ejecutada contra el motor: es donde las dos fórmulas discrepaban.
  if (E && E.isoWeekKey) {
    eq(E.isoWeekKey('2027-01-03'), '2026-W53', 'domingo 3-ene-2027 → 2026-W53 (la fórmula del 1-ene daba 2027-W01)');
    eq(E.isoWeekKey('2026-01-01'), '2026-W01', 'jueves 1-ene-2026 → 2026-W01');
    eq(E.isoWeekKey('2026-12-31'), '2026-W53', 'jueves 31-dic-2026 → 2026-W53');
    eq(E.isoWeekKey('2025-12-29'), '2026-W01', 'lunes 29-dic-2025 → ya es 2026-W01');
  }
}

// ── C-24 · un `mondayOf` y un `addDays` ────────────────────────────────────────────
//
// EL FALLO. Cinco aritméticas de "lunes de esta semana" y cinco de "sumar días" repartidas
// por app.js, whoop.js y nutrition.js, cada una con su convención. Con fechas eso no es
// duplicación cosmética: `d.setDate(d.getDate() - 1)` sobre un Date local devuelve el MISMO
// día en el fin de semana del cambio de horario, y un día de desfase mueve la frontera
// domingo/lunes — o sea la semana entera.
console.log('');
console.log('20. C-24 · una sola aritmética de fechas');
{
  const codigo = (src) => src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const APP_CODE = codigo(APP);
  const WH_CODE = codigo(WHOOPJS);
  yes(/^function addDays\(ds, n\) \{/m.test(APP), 'app.js define addDays(ds, n)');
  yes(!/_plusDaysStr/.test(APP_CODE), 'y ya no queda `_plusDaysStr` (era el mismo helper con otro nombre)');
  yes(/const monday = mondayOf\(today\(\)\);/.test(APP),
    'getWeekDates() saca el lunes de `mondayOf()` del motor, no de su propia cuenta');
  yes(!/monday\.setDate\(/.test(APP_CODE), 'sin `monday.setDate(...)` a mano');
  yes(!/\(now\.getDay\(\) \+ 6\) % 7/.test(APP_CODE), 'ni el `(getDay() + 6) % 7` de los totales de carrera');
  yes(!/setDate\(\w+\.getDate\(\) - 1\)/.test(WH_CODE), 'whoop.js ya no resta un día a mano');
  yes(/addDays\(r\.id, -1\)/.test(WH_CODE), 'usa addDays(r.id, -1)');
  // Las sumas de días sobre 'YYYY-MM-DD' a mano, contadas: cero.
  const aMano = (APP_CODE.match(/Date\.parse\([^)]*T12:00:00'\)\s*[+-]\s*\w+\s*\*\s*86400000/g) || []);
  eq(aMano.length, 0, `ninguna suma de días a mano en app.js${aMano.length ? ' — ' + aMano.join(' | ') : ''}`);
  // `addDays` ejecutada: el cambio de horario es el caso que rompía a las copias.
  const src = APP.slice(APP.indexOf('function addDays(ds, n) {'));
  const box = { console };
  vm.createContext(box);
  vm.runInContext(`${src.slice(0, src.indexOf('\n}') + 2)}\nglobalThis.__ad = addDays;`, box);
  const ad = box.__ad;
  eq(ad('2026-03-29', -1), '2026-03-28', 'addDays cruza el cambio de hora de primavera');
  eq(ad('2026-10-25', -1), '2026-10-24', '…y el de otoño');
  eq(ad('2026-01-01', -1), '2025-12-31', '…y el año');
  eq(ad('2026-09-07', 6), '2026-09-13', 'lunes + 6 = domingo de la misma semana');
  eq(ad(null, 3), null, 'y devuelve null sin fecha');
  // Y coincide con el `mondayOf` del motor: el lunes de la semana es addDays(dom, -6).
  if (E && E.mondayOf) {
    eq(E.mondayOf('2026-09-13'), ad('2026-09-13', -6), 'mondayOf(domingo) == addDays(domingo, -6)');
  }
}

// ── C-26 · una sola lista de sesiones de pierna ────────────────────────────────────
//
// EL FALLO. El predicado de RUN-BEFORE-LEGS (`subtype lower|full` o `family hybrid`) estaba
// copiado tres veces en coach.js: en el body que viaja a la función, en el `ctx` del
// validador local y en la fila `requested` del modo manual. Que los tres coincidieran era la
// condición para que "el API y el modo manual sean lo mismo", y nada lo comprobaba.
console.log('');
console.log('21. C-26 · _coachLowerSessionIds()');
{
  const COACH_CODE = COACHJS.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  yes(/function _coachLowerSessionIds\(\) \{/.test(COACHJS), 'existe _coachLowerSessionIds()');
  eq((COACH_CODE.match(/subtype === 'lower'/g) || []).length, 1,
    'el predicado aparece UNA vez en coach.js (eran tres)');
  eq((COACH_CODE.match(/_coachLowerSessionIds\(\)/g) || []).length, 4,
    'y los tres consumidores + el export lo llaman');
  // Ejecutada: el mapa manda, y `full`/`hybrid` cuentan.
  const i = COACHJS.indexOf('function _coachLowerSessionIds() {');
  const src = COACHJS.slice(i, COACHJS.indexOf('\n}', i) + 2);
  const box = {
    console,
    sessionClassMap: () => ({
      lowerA: { family: 'strength', subtype: 'lower' },
      upperA: { family: 'strength', subtype: 'upper' },
      fullA: { family: 'strength', subtype: 'full' },
      hyroxA: { family: 'hybrid', subtype: 'conditioning' },
      z2: { family: 'cardio', subtype: 'zone2' },
    }),
  };
  vm.createContext(box);
  vm.runInContext(`${src}\nglobalThis.__l = _coachLowerSessionIds;`, box);
  const ids = box.__l().sort();
  eq(ids.join(','), 'fullA,hyroxA,lowerA', 'lower + full + hybrid cuentan como pierna; upper y cardio no');
  // Sin el mapa no revienta ni inventa.
  const box2 = { console };
  vm.createContext(box2);
  vm.runInContext(`${src}\nglobalThis.__l = _coachLowerSessionIds;`, box2);
  eq(box2.__l().length, 0, 'sin sessionClassMap() devuelve lista vacía, no lanza');
}

// ── C-27 y C-28 · el fallo que no se ve no se arregla ──────────────────────────────
console.log('');
console.log('22. C-27 · safeCallVoid · C-28 · la causa en el toast');
{
  const APP_CODE = APP.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  yes(/function safeCallVoid\(name, \.\.\.args\) \{/.test(APP), 'existe safeCallVoid()');
  yes(/r\.then\(undefined, \(e\) => console\.warn\(`\[safeCall\] \$\{name\}:`, e\)\)/.test(APP),
    'y engancha el rechazo de la promesa (safeCall sólo captura el throw síncrono)');
  eq((APP_CODE.match(/safeCallVoid\('/g) || []).length, 4,
    'los cuatro fire-and-forget del audit pasan por él');
  yes(!/Promise\.resolve\(safeCall\('renderRecoveryBlock'\)\)\.catch\(\(\) => \{\}\)/.test(APP),
    'y desaparece el `.catch(() => {})` que hacía pasar por manejado un fallo perdido');
  // C-28
  yes(/^function errText\(e, fallback\) \{/m.test(APP), 'existe errText()');
  const i = APP.indexOf('function errText(e, fallback) {');
  const box = { console };
  vm.createContext(box);
  vm.runInContext(`const ERR_TEXT_MAX = 90;\n${APP.slice(i, APP.indexOf('\n}', i) + 2)}\nglobalThis.__e = errText;`, box);
  const et = box.__e;
  eq(et(new Error('QuotaExceededError')), 'QuotaExceededError', 'saca el message del Error');
  eq(et({ error_description: 'invalid grant' }), 'invalid grant', '…o el error_description de Supabase');
  eq(et(null, 'unreadable file'), 'unreadable file', 'y usa el respaldo cuando no hay causa');
  eq(et({}, 'nada'), 'nada', '…también con un objeto sin mensaje');
  eq(et(new Error('a\nb\n  c')), 'a b c', 'colapsa los saltos de línea (un stack rompería la caja)');
  eq(et(new Error('x'.repeat(200))).length, 90, 'y recorta a 90 caracteres');
  yes(et(new Error('x'.repeat(200))).endsWith('…'), '…con puntos suspensivos');
  // Los toasts ciegos que quedaban
  yes(!/toast\('Error restoring backup'\)/.test(APP), 'el toast del restore ya no esconde la causa');
  yes(/Could not restore the backup: \$\{errText\(e/.test(APP), '…la dice');
  yes(!/toast\('Strava sync failed — check connection'\)/.test(APP), 'ni el de Strava');
  yes(/function stravaLastError\(\)/.test(readFileSync('app/strava.js', 'utf8')),
    'strava.js expone la razón del último fallo (stravaSync() sigue devolviendo null)');
  yes(/function intervalsLastError\(\)/.test(APP), 'y app.js la de intervals.icu');
  yes(!/toast\('Sync failed — check API key\/athlete ID'\)/.test(APP), 'el de intervals tampoco adivina');
  yes(/function _cErr\(e, fallback\)/.test(COACHJS), 'coach.js tiene su _cErr() (se carga aparte)');
  for (const t of ["Could not reject: \\$\\{_cErr\\(e\\)\\}", "Could not restore: \\$\\{_cErr\\(e\\)\\}", "Could not build the pack: \\$\\{_cErr\\(e\\)\\}"]) {
    yes(new RegExp(t).test(COACHJS), `y los tres toasts del coach dicen la causa (${t.slice(0, 22)}…)`);
  }
  // El `catch {}` de clearFutureScheduleOverrides
  const j = APP.indexOf('async function clearFutureScheduleOverrides()');
  const cfso = APP.slice(j, APP.indexOf('\n}', APP.indexOf('} catch', j)) + 2);
  yes(!/\} catch \(e\) \{\}/.test(cfso), 'clearFutureScheduleOverrides() ya no tiene el catch vacío');
  yes(/console\.warn\('\[Plan\] clearFutureScheduleOverrides:'/.test(cfso), '…avisa por consola');
  yes(/Manual day changes kept/.test(cfso), '…y en pantalla, porque el plan aplicado no se ve entero');
  yes(!/clearFutureScheduleOverrides\(\); \} catch \(e\) \{\}/.test(COACHJS),
    'y su llamador de coach.js tampoco lo silencia');
}

// ── F-25 · el caveat de la regla en el ledger ──────────────────────────────────────
//
// El ledger decía "REC-002 · citada 4 veces · strong" y ahí se acababa. Un grado de evidencia
// sin su salvedad es la mitad tranquilizadora de la información: REC-001 es `strong` Y lleva
// escrito que su banda se reescribió porque la mitad alta no tenía fuente.
console.log('');
console.log('23. F-25 · el caveat en el ledger de evidencia');
{
  yes(/function _coachRuleCaveatHtml\(regla\)/.test(COACHJS), 'existe _coachRuleCaveatHtml()');
  yes(/\$\{_coachRuleCaveatHtml\(corpus\[f\.ruleId\]\)\}/.test(COACHJS),
    'y el ledger lo pinta debajo de cada fila');
  yes(/class="evl-item"/.test(COACHJS) && /\.evl-item \{/.test(CSS),
    'la fila y su salvedad van en un `.evl-item` (con el borde en `.evl-row` el caveat leía como de la regla siguiente)');
  yes(/\.evl-caveat \{/.test(CSS), '.evl-caveat tiene estilo');
  const i = COACHJS.indexOf('function _coachRuleCaveatHtml(regla) {');
  const box = { console, _cEsc: (x) => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;') };
  vm.createContext(box);
  vm.runInContext(`const COACH_CAVEAT_MAX = 220;\n${COACHJS.slice(i, COACHJS.indexOf('\n}', i) + 2)}\nglobalThis.__c = _coachRuleCaveatHtml;`, box);
  const ch = box.__c;
  eq(ch(undefined), '', 'sin regla no pinta nada');
  eq(ch({ rule: 'x', evidenceLevel: 'strong' }), '',
    'y con el corpus GENERADO de hoy (sólo rule + evidenceLevel) tampoco: ni hueco ni etiqueta vacía');
  yes(/RANGE REWRITTEN/.test(ch({ caveat: 'RANGE REWRITTEN 2026-09-08' })), 'con `caveat` (cadena) lo pinta');
  yes(/a · b/.test(ch({ caveats: ['a', 'b'] })),
    'y con `caveats` (array, la forma de evidence-to-rules.md) los une — tolerante a las dos');
  yes(ch({ caveat: 'y'.repeat(400) }).includes('…'), 'recorta el texto largo');
  yes(/title="/.test(ch({ caveat: 'y'.repeat(400) })), '…y deja el completo en el title');
  yes(!/<b>/.test(ch({ caveat: '<b>ojo</b>' })), 'y escapa el HTML del corpus');
}

// ── F-28 · aviso de carrera vieja antes de cerrar la semana ────────────────────────
//
// Cerrar la semana congela el pack. Si intervals.icu o Strava no han sincronizado, la revisión
// razona sobre una semana con menos kilómetros de los que Julian corrió y baja el objetivo por
// un fallo de sincronización. El pack lo sabe (`staleness.runs`) pero DESPUÉS de cerrar, y en
// los estados desde los que se cierra todavía no hay pack.
console.log('');
console.log('24. F-28 · "Close the week" avisa si la carrera lleva > 2 días sin llegar');
{
  yes(/const COACH_RUNS_STALE_DAYS = 2;/.test(COACHJS),
    'el umbral es 2 días, el mismo FACTS_STALE_DAYS del pack');
  eq((readFileSync('app/coach-facts.js', 'utf8').match(/const FACTS_STALE_DAYS = 2;/g) || []).length, 1,
    '…y el pack sigue usando 2 (si cambia allí, este test lo canta)');
  yes(/async function _coachStaleRunsHtml\(\)/.test(COACHJS), 'existe _coachStaleRunsHtml()');
  yes(/const avisoCarrera = cerrar \? await _coachStaleRunsHtml\(\) : '';/.test(COACHJS),
    'y la tarjeta lo pinta SÓLO donde hay algo que cerrar');
  // Hay tres plantillas `coach-week-card` en el fichero; la que importa es la que interpola el
  // aviso. Se busca por el aviso y se mira su plantilla, no al revés.
  const iAviso = COACHJS.indexOf('${avisoCarrera}');
  const iAbre = COACHJS.lastIndexOf('el.innerHTML = `<div class="card coach-week-card">', iAviso);
  const tpl = COACHJS.slice(iAbre, COACHJS.indexOf('</div>`;', iAviso));
  yes(iAviso > 0 && iAbre > 0, 'el aviso se interpola dentro de la tarjeta de la semana');
  yes(tpl.indexOf('${avisoCarrera}') < tpl.indexOf('coach-actions'),
    'justo encima de las acciones, donde está el botón');
  yes(!/disabled/.test(tpl), 'y no deshabilita nada: los avisos restringen al coach, no al usuario');
  // Ejecutado, con las tres situaciones que importan.
  const i = COACHJS.indexOf('async function _coachRunsDaysAgo() {');
  const j = COACHJS.indexOf('function _coachCloseWeekBtn(');
  const src = COACHJS.slice(i, j);
  const mk = (runs, sess) => {
    const box = {
      console, Date,
      today: () => '2026-09-10',
      _cEsc: (x) => String(x == null ? '' : x),
      getRunsDeduped: () => Promise.resolve(runs),
      getSessionsDeduped: () => Promise.resolve(sess),
      dbGetAll: () => Promise.resolve([]),
    };
    vm.createContext(box);
    vm.runInContext(`const COACH_RUNS_STALE_DAYS = 2;\n${src}\nglobalThis.__h = _coachStaleRunsHtml;`, box);
    return box.__h();
  };
  await mk([{ date: '2026-09-09' }], []).then((h) => eq(h, '', 'ayer: no avisa'));
  await mk([{ date: '2026-09-08' }], []).then((h) => eq(h, '', 'hace 2 días: tampoco (es el umbral)'));
  await mk([{ date: '2026-09-06' }], []).then((h) => {
    yes(/4 days ago/.test(h), 'hace 4 días: avisa, con el número');
    yes(/2026-09-06/.test(h), '…y con la fecha del último dato');
    yes(/coach-week-bad/.test(h), '…en rojo (la clase que ya existe)');
    yes(/intervals\.icu or Strava/.test(h), '…diciendo qué hacer antes de cerrar');
  });
  // Una sesión de cardio del store unificado cuenta igual que una carrera de `runs`.
  await mk([{ date: '2026-09-06' }], [{ date: '2026-09-09', family: 'cardio' }])
    .then((h) => eq(h, '', 'un remo de ayer en `sessions` también cuenta como cardio al día'));
  await mk([{ date: '2026-09-06' }], [{ date: '2026-09-09', family: 'recovery' }])
    .then((h) => yes(/4 days ago/.test(h), 'pero una sesión de movilidad NO cuenta como cardio'));
  await mk([], []).then((h) => eq(h, '', 'sin ninguna carrera no hay "vieja" que avisar'));
}

console.log('');
console.log(failed === 0
  ? '✅ Coach v2.1 cableado: módulos, stores, sync, plan, bloque, readiness informativo, cero ajuste del día y una Home que explica la semana.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
