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
const FN = readFileSync('supabase/functions/parse-meal-photo/index.ts', 'utf8');

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
  // Un id puede vivir en el marcado estatico O crearlo el propio modulo al renderizar
  // (el boton de "anadir otra foto" nace dentro de renderNutStaged). Las dos son validas;
  // lo que no vale es apuntar a un id que no exista en ninguno de los dos sitios.
  const enHtml = HTML.includes(`id="${id}"`);
  const generado = NUT.includes(`id="${id}"`);
  yes(enHtml || generado,
    `#${id} existe${enHtml ? ' en index.html' : generado ? ' (generado por nutrition.js)' : ''}`);
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
  yes(Number(m[2]) >= 54, `cache en v${version} (v11.53 ya estaba desplegada)`);
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
// v11.73 (C-16): `importBackup()` restaura las filas exportadas y pasó de `dbPut` a `smartPut`
// —con `dbPut` un restore no subía nunca, y un restore es justo el momento en que la copia de la
// nube está incompleta—. NO rompe la invariante: la invariante es que nadie AUTORE totales a
// mano, y devolver una fila que salió del propio export no es autorarla. Se excluye ese cuerpo y
// se sigue exigiendo cero en todo lo demás.
const iImp = APP.indexOf('async function importBackup(');
const jImp = APP.indexOf('\n}', APP.indexOf('Could not restore the backup', iImp));
const APP_SIN_RESTORE = APP.slice(0, iImp) + APP.slice(jImp);
const escriturasApp = (APP_SIN_RESTORE.match(/smartPut\('nutrition'/g) || []).length;
yes(iImp > 0 && jImp > iImp, 'se localiza importBackup() (la única excepción permitida)');
yes(escriturasApp === 0, `app.js no escribe en 'nutrition' fuera del restore (${escriturasApp} escrituras)`);
yes(/smartPut\('nutrition', n\)/.test(APP.slice(iImp, jImp)),
  'y el restore sí encola sus filas, o no subirían nunca (C-16)');
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
// DB_VERSION es monótona creciente (rollback caveat de db-schema-state.md): `foods`/`meals`
// nacieron en v11 y cualquier valor posterior los sigue creando. Bajarlo rompe la app.
yes(Number((APP.match(/DB_VERSION = (\d+)/) || [])[1]) >= 11,
  'DB_VERSION >= 11 (la versión que creó los stores; nunca baja)');

// ── 10. La semilla tiene que poder llegar a Supabase ───────────────────────
// Hasta v11.55 enqueueSync() hacia `if (!supabaseClient) return`, asi que sembrar antes de
// initSupabase() dejaba los 55 alimentos SOLO en IndexedDB. Y la edge function lee `foods` de
// Supabase: con la tabla vacia no resuelve ningun alimento contra la biblioteca y cada foto
// vuelve a estimar macros desde cero — justo la debilidad de Caltrack que este diseño existe
// para corregir. Sintoma que lo delato: `public.exercises` con 0 filas durante meses.
// v11.55 arregla la causa raiz (el guard mira la configuracion, no el cliente: F-1), pero el
// orden se mantiene y se sigue vigilando: es gratis y no depende de un solo guard.
console.log('');
console.log('10. Orden de la semilla respecto a la auth');
const iAuth = APP.indexOf('await checkAuth()');
// v11.68 (V-9): la llamada pasa por `safeCall`, que es la unica forma de llamar a otro modulo
// desde app.js. Lo que este test vigila no es la sintaxis de la llamada sino el ORDEN.
const iSeed = APP.indexOf("safeCall('seedFoods')");
yes(iAuth > 0 && iSeed > 0, 'se localizan checkAuth() y seedFoods() en init()');
yes(iSeed > iAuth, 'seedFoods() corre DESPUES de checkAuth(), o la semilla no sincroniza');
yes(/if \(!SUPABASE_URL \|\| !SUPABASE_ANON_KEY\) return;/.test(SYNC),
  'enqueueSync() gatea por configuracion, no por cliente (v11.55: la causa raiz, arreglada)');

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

// ── 13. El contrato del prompt ──────────────────────────────────
// La decision componentes/plato/etiqueta es lo que mas afecta a la precision, y es la mas
// facil de romper sin que nada falle: el modelo devolveria 19 filas inventadas para un bowl
// mezclado y el total tendria falsa precision. Peor que un solo numero honesto, porque un
// numero aproximado se corrige y diecinueve no.
console.log('');
console.log('13. Contrato del prompt de la edge function');
yes(/kind: z\.enum\(\["componentes", "plato", "etiqueta"\]\)/.test(FN),
  'el esquema obliga a clasificar la foto en uno de los tres tipos');
yes(FN.includes('kind: parsed.kind'), 'el tipo se devuelve a la PWA');
yes(NUT.includes('NUT_KIND_INFO'), 'la PWA explica el tipo en la hoja de confirmacion');
for (const k of ['componentes', 'plato', 'etiqueta']) {
  yes(NUT.includes(k + ':'), `la PWA sabe explicar "${k}"`);
}
// Las tres reglas duras del prompt. Si alguna desaparece, la precision cae en silencio.
yes(/UN SOLO item con el plato entero/.test(FN),
  'regla dura: un plato compuesto va como UNA unidad, no descompuesto');
yes(/NO lo descompongas en ingredientes/.test(FN), 'y se dice explicitamente');
yes(/Un dato publicado siempre gana a tu mejor estimaci/.test(FN),
  'una etiqueta o carta manda sobre cualquier estimacion');
yes(/grasas invisibles|aceite de cocci/.test(FN),
  'se pide contar el aceite y el alino: la fuente de kcal que mas se olvida');
yes(/confianza inflada es peor/.test(FN),
  'se pide confianza honesta: la baja se marca y se corrige, la inflada se cuela');
// El esfuerzo es una decision tomada a mano y documentada; no puede volver a low por descuido.
yes(/effort: "medium"/.test(FN), 'esfuerzo en medium (elegido el 4-sep por precision de gramaje)');
yes(/claude-opus-5/.test(FN), 'modelo Opus 5, coherente con los precios de NUT_AI_MODEL');
const modeloPWA = (NUT.match(/NUT_AI_MODEL = '([^']+)'/) || [])[1];
yes(FN.includes(modeloPWA), `el modelo de la funcion (${modeloPWA}) coincide con el que usa el calculo de coste`);

// ── 14. Compositor: N fotos + nota ───────────────────────────────
console.log('');
console.log('14. Compositor de comida');
// Tres vias de entrada: camara, galeria y solo texto.
for (const id of ['btn-nut-photo', 'btn-nut-gallery', 'btn-nut-write',
                  'nut-photo-input', 'nut-gallery-input', 'nut-composer',
                  'nut-composer-note', 'btn-nut-analyze', 'btn-nut-discard']) {
  yes(HTML.includes(`id="${id}"`), `#${id} existe`);
}
// La camara tiene que forzar la trasera; la galeria tiene que permitir varias.
yes(/id="nut-photo-input"[^>]*capture="environment"/.test(HTML),
  'la camara abre la trasera directamente (capture=environment)');
yes(/id="nut-gallery-input"[^>]*multiple/.test(HTML),
  'la galeria permite elegir varias (carta + plato en una pasada)');
yes(!/id="nut-gallery-input"[^>]*capture=/.test(HTML),
  'la galeria NO lleva capture: eso forzaria la camara y bloquearia elegir de la fototeca');

// La funcion tiene que aceptar el array y la nota, no solo una foto suelta.
yes(FN.includes('body.photoPaths'), 'la funcion acepta varias fotos');
yes(FN.includes('body.photoPath ?'), 'y sigue aceptando photoPath suelto por compatibilidad');
yes(/const note = typeof body\.note === "string"/.test(FN), 'la funcion acepta la nota');
yes(/!photoPaths\.length && !note/.test(FN), 'sin foto Y sin nota es error; solo nota es valido');
yes(FN.includes('MAX_IMAGES'), 'hay tope de imagenes');
// Comprobacion de seguridad: cada ruta se valida contra el uid, no solo la primera. La URL
// firmada se crea con la service role, que se salta el RLS del bucket.
yes(/for \(const path of photoPaths\) \{[\s\S]{0,160}startsWith\(`\$\{userId\}\/`\)/.test(FN),
  'TODAS las rutas se validan contra el uid, no solo la primera');

// La nota manda sobre lo que se ve: es informacion que no esta en los pixeles.
yes(/NOTA DEL USUARIO/.test(FN), 'la nota se le pasa al modelo etiquetada');
yes(/tiene prioridad sobre lo que veas/.test(FN),
  'el prompt dice que la nota gana a la estimacion visual');
yes(/MISMA comida/.test(FN), 'varias fotos se combinan en un registro, no en varias comidas');
yes(/carta o etiqueta \+ plato|carta \+ plato/i.test(FN),
  'el prompt explica la combinacion carta + plato');

// Redimensionado en el movil: EXIF incluido, o una foto vertical llega tumbada.
yes(/function nutResizeImage/.test(NUT), 'las fotos se redimensionan antes de subir');
yes(/imageOrientation: 'from-image'/.test(NUT),
  'se aplica la orientacion EXIF, o una foto vertical llegaria girada');
yes(/NUT_FOTO_MAX_PX/.test(NUT), 'hay un maximo de pixeles definido');
// Las fotos no se suben hasta pulsar Analizar: subir al elegir llenaria Storage de intentos.
const cuerpoAdd = NUT.slice(NUT.indexOf('async function nutAddFiles'),
                            NUT.indexOf('function nutOpenComposer'));
yes(!cuerpoAdd.includes('.upload('), 'elegir una foto NO la sube: solo se suben al analizar');
yes(NUT.slice(NUT.indexOf('async function nutAnalyze')).includes('.upload('),
  'la subida ocurre en nutAnalyze()');

// ── 15. v11.76 · Los tres caminos ────────────────────────────────
// A (foto → guardar el plato), B (biblioteca con medidas y por uso), C (texto con chips).
// El cableado nuevo es el de siempre: ids en el marcado, clases en el CSS, y ninguna
// escritura que se salte `saveMeal`.
console.log('');
console.log('15. Los tres caminos de registro (v11.76)');
// B · La hoja del picker, sobre el chasis de `.plate-sheet` (no un action sheet de 40 filas).
for (const id of ['nut-picker', 'nut-picker-backdrop', 'nut-picker-close',
                  'nut-picker-search', 'nut-picker-list']) {
  yes(HTML.includes(`id="${id}"`), `#${id} existe`);
}
yes(/id="nut-picker"[^>]*class="[^"]*plate-sheet/.test(HTML),
  'el picker reutiliza el chasis de .plate-sheet (un solo patrón de hoja inferior)');
// El chasis vive en z-index 111 y la hoja de confirmación es un `.modal` en 900: sin subirlo,
// el picker se abriría DEBAJO de la hoja desde la que se invoca.
yes(/#nut-picker\s*\{[^}]*z-index:\s*(\d+)/.test(CSS) &&
    Number(CSS.match(/#nut-picker\s*\{[^}]*z-index:\s*(\d+)/)[1]) > 900,
  'el picker se pinta por encima de la hoja de confirmación (.modal está en 900)');
yes(/function nutOpenFoodPicker/.test(NUT), 'nutOpenFoodPicker() existe');
yes(/function nutPickerSections/.test(NUT), 'y las secciones se calculan en una función pura');
yes(!/showActionSheet\('Add food'/.test(NUT),
  'el action sheet de 40 filas se retiró (era el problema, no la solución)');

// C · Los chips del compositor. Sólo escriben texto: el contrato del servidor no cambia.
for (const id of ['nut-chips', 'nut-chip-line']) {
  yes(HTML.includes(`id="${id}"`), `#${id} existe`);
}
yes(/const NUT_CHIP_DEFS/.test(NUT), 'los chips están declarados en un solo sitio');
yes(/function nutChipLine/.test(NUT), 'y componen una línea con formato fijo');
{
  const ANALYZE = NUT.slice(NUT.indexOf('async function nutAnalyze('),
                            NUT.indexOf('function nutGuessMealType('));
  yes(/nutChipLine\(/.test(ANALYZE), 'nutAnalyze() añade la línea a la nota');
  yes(/nutDayType\(/.test(ANALYZE), '…con el tipo de día, que el cliente ya sabe');
  yes(/body: \{ photoPaths, note \}/.test(ANALYZE),
    '…y el cuerpo del request sigue siendo el mismo: photoPaths + note');
}

// A · Guardar el plato desde la hoja de confirmación.
yes(HTML.includes('id="nut-confirm-save-food"'), '#nut-confirm-save-food existe');
yes(/function nutSaveItemAsFood/.test(NUT), 'se puede guardar un item como alimento');
yes(/function nutSaveMealAsFood/.test(NUT), '…y la comida entera como un plato');
yes(/Save to my foods/.test(HTML) || /Save to my foods/.test(NUT),
  'y se llama por su nombre en la pantalla');

// El esquema de `foods` crece, y la migración es perezosa: sin `serving`, 100 g.
yes(/function foodServings/.test(NUT), 'foodServings() resuelve la medida de cualquier fila');
yes(/NUT_DEFAULT_SERVING/.test(NUT), '…con un respaldo de 100 g declarado');
yes(/function nutApplyFoodUsage/.test(NUT), 'el uso se actualiza en un solo sitio');
{
  // Ojo con los anclajes: la cabecera de sección "COACH RESTO DEL DÍA" aparece DOS veces en
  // el fichero (una en el índice del encabezado), así que el corte va por la declaración.
  const FOODS = NUT.slice(NUT.indexOf('async function renderNutFoods('),
                          NUT.indexOf('async function renderNutCoach('));
  yes(!/dbGetAll\('meals'\)/.test(FOODS),
    'el ranking ya no escanea todas las comidas en cada pintado: lee el campo');
  yes(/useCount/.test(FOODS), '…que es `useCount`');
}

// 10 · La pestaña se llama por lo que es.
yes(/data-nut-group="alimentos">Ranking</.test(HTML),
  'la pestaña "Foods" pasa a "Ranking" (el panel es una tabla ordenable, no la biblioteca)');
yes(HTML.includes('data-nut-group="alimentos"'),
  '…y la clave `alimentos` no se toca: el switch y los tests dependen de ella');

// El prompt del servidor gana su propia sección para el caso sin foto.
console.log('');
console.log('16. El prompt del caso sin foto');
yes(/PROMPT_VERSION = 2/.test(FN), 'PROMPT_VERSION sube a 2');
yes(/SIN FOTO/.test(FN), 'hay una sección de sistema propia para el registro por texto');
yes(/palma|taza|cucharada/i.test(FN),
  'las medidas caseras se traducen a gramos con supuestos dichos');
yes(/Context —/.test(FN),
  'el prompt sabe leer la línea estructurada que escriben los chips');
yes(/no la suavices/i.test(FN),
  'una estimación con poca confianza se marca como tal, no se suaviza');

console.log('');
console.log(failed === 0
  ? '✅ Nutrición v2: el cableado entre los tres ficheros está completo.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
