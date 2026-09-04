// Nutrición v2 vive en tres ficheros que se hablan por globals sueltos, sin bundler ni
// imports. Nada avisa cuando una de esas referencias se rompe: la pestaña simplemente deja
// de pintar, o peor, pinta a medias y el fallo sale por consola en un iPhone donde nadie
// mira la consola.
//
// Los fallos que este test existe para impedir:
//   · Un getElementById apuntando a un id que se renombró o se quedó en el formulario viejo.
//   · nutrition.js llamando a una función de app.js que ya no existe (o que se retiró al
//     desmontar el registro anterior).
//   · app.js delegando en renderNutricionV2/bindNutricionV2/seedFoods sin que estén.
//   · nutrition.js cargándose DESPUÉS de app.js, o no cargándose en absoluto.
//   · Un fichero nuevo que no entra en el APP_SHELL del service worker: funciona en el
//     navegador y falla justo donde importa, sin conexión.
//   · Una clase CSS usada en el marcado generado y nunca definida.
//   · Restos del formulario retirado — dos rutas de entrada compitiendo es exactamente
//     cómo se llegó a 11 filas en cuatro meses.
//
// Ejecutar desde la raíz del repo: node tests/verify-nutrition-wiring.mjs

import { readFileSync } from 'node:fs';

const NUT = readFileSync('app/nutrition.js', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const HTML = readFileSync('app/index.html', 'utf8');
const CSS = readFileSync('app/style.css', 'utf8');
const SW = readFileSync('app/sw.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));

const defineFn = (src, name) => new RegExp(`function\\s+${name}\\s*\\(`).test(src);
const usaFn = (src, name) => new RegExp(`[^A-Za-z0-9_$.]${name}\\s*\\(`).test(src);

// ── 1. Todo id del DOM que toca nutrition.js existe en el marcado ───────────────────
console.log('1. Ids del DOM');
const ids = [...NUT.matchAll(/getElementById\(['"`]([^'"`]+)['"`]\)/g)].map((m) => m[1]);
const idsUnicos = [...new Set(ids)];
yes(idsUnicos.length > 10, `${idsUnicos.length} ids referenciados desde nutrition.js`);
for (const id of idsUnicos) {
  yes(HTML.includes(`id="${id}"`), `#${id} existe en index.html`);
}

// ── 2. Funciones de app.js que nutrition.js da por hechas ───────────────────────────
console.log('');
console.log('2. Funciones que nutrition.js toma de app.js');
const externas = [
  'dbGet', 'dbGetAll', 'smartPut', 'smartDelete', 'today', 'formatDate', 'toast',
  'showEmptyState', 'showActionSheet', 'setStarValue', 'getStarValue',
  'estimateCalories', 'getBodyweightLatest', 'durationToMinutes', 'workoutAvgRpe',
  'renderNutritionHistory',
];
for (const fn of externas) {
  if (!usaFn(NUT, fn)) continue;   // sólo comprobamos las que realmente usa
  yes(defineFn(APP, fn), `app.js define ${fn}()`);
}

// ── 3. El puente en la otra dirección ───────────────────────────────────────────────
console.log('');
console.log('3. Lo que app.js delega en nutrition.js');
for (const fn of ['renderNutricionV2', 'bindNutricionV2', 'seedFoods']) {
  yes(defineFn(NUT, fn), `nutrition.js define ${fn}()`);
  yes(APP.includes(fn), `app.js invoca ${fn}`);
}
// La delegación tiene que ser defensiva: si nutrition.js no cargó, app.js no puede reventar.
yes(/typeof\s+renderNutricionV2\s*===\s*'function'/.test(APP),
  'app.js comprueba que nutrition.js cargó antes de delegar');

// ── 4. Orden y presencia de los scripts ─────────────────────────────────────────────
console.log('');
console.log('4. Carga de scripts');
const iNut = HTML.indexOf('src="nutrition.js"');
const iApp = HTML.indexOf('src="app.js"');
yes(iNut > 0, 'index.html carga nutrition.js');
yes(iNut > 0 && iApp > 0 && iNut < iApp, 'nutrition.js se carga antes que app.js');
yes(SW.includes("'./nutrition.js'"),
  'nutrition.js está en el APP_SHELL del service worker (si no, la app falla sin conexión)');

// ── 5. El cache del service worker sube de versión ──────────────────────────────────
console.log('');
console.log('5. Versión del cache');
const m = SW.match(/CACHE_NAME\s*=\s*'training-v(\d+)\.(\d+)'/);
yes(!!m, 'CACHE_NAME tiene el formato esperado');
if (m) {
  const version = `${m[1]}.${m[2]}`;
  yes(Number(m[2]) >= 51, `cache en v${version} (v11.50 ya estaba desplegada)`);
}

// ── 6. Clases CSS usadas en el marcado generado ─────────────────────────────────────
console.log('');
console.log('6. Clases CSS');
const clases = new Set();
for (const m2 of NUT.matchAll(/class="([^"$]*)"/g)) {
  for (const c of m2[1].split(/\s+/)) if (c.startsWith('nut-') || c.startsWith('ncc-')) clases.add(c);
}
yes(clases.size > 15, `${clases.size} clases propias en el marcado generado`);
const huerfanas = [...clases].filter((c) => !CSS.includes('.' + c));
yes(huerfanas.length === 0, `todas definidas en style.css${huerfanas.length ? ' — faltan: ' + huerfanas.join(', ') : ''}`);

// ── 7. El formulario viejo se retiró de verdad ──────────────────────────────────────
// Dos rutas de entrada compitiendo es como se llegó a 11 filas en cuatro meses. Si algo de
// esto vuelve, el registro se parte en dos y los totales dejan de cuadrar.
console.log('');
console.log('7. El registro anterior está retirado');
for (const resto of ['btn-add-meal', 'btn-log-nutrition', 'protein-suggestions',
                     'nut-calories', 'nut-hunger', 'meal-protein']) {
  yes(!HTML.includes(`id="${resto}"`), `#${resto} ya no está en el marcado`);
}
for (const fn of ['addMeal', 'logNutrition', 'renderMealList', 'setupProteinAutocomplete']) {
  yes(!defineFn(APP, fn), `app.js ya no define ${fn}()`);
}
yes(!/const PROTEIN_DB\s*=/.test(APP), 'PROTEIN_DB retirado (lo sustituye FOODS_SEED con macros por 100 g)');
// Pero la energía SÍ se conserva: el motor de fatiga la consume.
yes(HTML.includes('id="nut-energy"'), 'la energía subjetiva se conserva (el motor de fatiga la lee)');
yes(defineFn(NUT, 'nutSaveEnergy'), 'y tiene quien la guarde');

// ── 8. `nutrition` sigue teniendo un único escritor ─────────────────────────────────
// El store es ahora un agregado DERIVADO. Si alguien vuelve a escribirlo a mano, los
// totales dejan de venir de las comidas y vuelve el problema que esto arregla.
console.log('');
console.log('8. Un solo escritor del store derivado');
const escriturasApp = (APP.match(/smartPut\('nutrition'/g) || []).length;
yes(escriturasApp === 0, `app.js ya no escribe en 'nutrition' (${escriturasApp} escrituras)`);
const escriturasNut = (NUT.match(/smartPut\('nutrition'/g) || []).length;
yes(escriturasNut === 2, `nutrition.js escribe en 2 sitios: el agregado y la energía (${escriturasNut})`);
yes(/async function recomputeNutritionDay/.test(NUT), 'recomputeNutritionDay() es el agregador');

// ── 9. Los stores nuevos existen y están sincronizados ──────────────────────────────
// La trampa documentada: añadir un store al sync sin crear su tabla congeló la cola 7 semanas.
console.log('');
console.log('9. Stores nuevos y sincronización');
const SYNC = readFileSync('app/supabase-sync.js', 'utf8');
for (const store of ['foods', 'meals']) {
  yes(APP.includes(`contains('${store}')`), `IndexedDB crea el store '${store}'`);
  yes(new RegExp(`'${store}'`).test(SYNC.match(/const stores = \[[^\]]*\]/)[0]),
    `'${store}' entra en el pull de syncAll()`);
  yes(SYNC.includes(`create table if not exists ${store}`),
    `el DDL de '${store}' está documentado (la tabla debe existir o la cola se congela)`);
}
yes(/DB_VERSION = 11/.test(APP), 'DB_VERSION subió a 11 para crear los stores');

// ── 10. La semilla tiene que poder llegar a Supabase ───────────────────────
// enqueueSync() hace `if (!supabaseClient) return`, asi que sembrar antes de initSupabase()
// deja los 55 alimentos SOLO en IndexedDB. Y la edge function lee `foods` de Supabase: con la
// tabla vacia no resuelve ningun alimento contra la biblioteca y cada foto vuelve a estimar
// macros desde cero — justo la debilidad de Caltrack que este diseño existe para corregir.
// Sintoma a vigilar: `public.exercises` tiene 0 filas por este mismo motivo.
console.log('');
console.log('10. Orden de la semilla respecto a la auth');
const iAuth = APP.indexOf('await checkAuth()');
const iSeed = APP.indexOf('seedFoods()');
yes(iAuth > 0 && iSeed > 0, 'se localizan checkAuth() y seedFoods() en init()');
yes(iSeed > iAuth, 'seedFoods() corre DESPUES de checkAuth(), o la semilla no sincroniza');
yes(/if \(!supabaseClient\) return;/.test(SYNC),
  'enqueueSync() sigue descartando en silencio sin cliente (la razon del orden anterior)');

// ── 11. Sub-vistas (Hoy / Tendencias / Alimentos) ─────────────────────
// La regla que oculta grupos inactivos esta scopeada a #view-stats, asi que esta vista
// necesita la suya. Sin ella las tres sub-vistas se pintan una debajo de otra.
console.log('');
console.log('11. Sub-vistas');
yes(/function switchNutGroup/.test(NUT), 'switchNutGroup() existe');
yes(NUT.includes('dataset.nutGroup'), 'los botones se cablean por data-nut-group');
for (const g of ['hoy', 'tendencias', 'alimentos']) {
  yes(HTML.includes(`data-nut-group="${g}"`), `boton de la sub-vista "${g}"`);
  yes(HTML.includes(`data-group="${g}"`), `contenido de la sub-vista "${g}"`);
}
yes(/#view-nutrition[^{]*\[data-group\][^{]*:not\(\.active-group\)/.test(CSS),
  'CSS propio para ocultar grupos inactivos (el de Stats esta scopeado a #view-stats)');
// Cada render de sub-vista tiene su contenedor y se invoca.
for (const [fn, id] of [['renderNutStreak', 'nut-streak'], ['renderNutTrends', 'nut-trends'],
                        ['renderNutWeekly', 'nut-weekly'], ['renderNutCalibration', 'nut-calibration'],
                        ['renderNutFoods', 'nut-foods'], ['renderNutCoach', 'nut-coach']]) {
  yes(new RegExp(`function ${fn}`).test(NUT), `${fn}() existe`);
  yes(HTML.includes(`id="${id}"`), `#${id} existe`);
  const cuerpoV2 = NUT.slice(NUT.indexOf('async function renderNutricionV2'),
                             NUT.indexOf('async function renderNutricionV2') + 2200);
  yes(cuerpoV2.includes(fn + '('), `renderNutricionV2() invoca ${fn}()`);
}

// ── 12. La tabla no puede desbordar la vista ─────────────────────────
console.log('');
console.log('12. Contencion del leaderboard');
yes(/\.nut-table-wrap\s*\{[^}]*overflow-x:\s*auto/.test(CSS),
  'la tabla scrollea dentro de su caja, no arrastra el body en horizontal');
// Y `.nut-bar` (barra de progreso de Hoy) no puede colisionar con las de tendencia.
yes(!NUT.includes('class="nut-bar "') && NUT.includes('class="nut-tbar'),
  'las barras de tendencia usan .nut-tbar, sin colisionar con la .nut-bar de progreso');

console.log('');
console.log(failed === 0
  ? '✅ Nutrición v2: el cableado entre los tres ficheros está completo.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
