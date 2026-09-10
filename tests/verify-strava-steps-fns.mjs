// Las tres funciones de servidor que no cubría ningún test: `strava-sync`, `steps-ingest` y
// `parse-meal-photo`.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Son cuatro, y ninguno da un error cuando ocurre:
//
//   · **`strava-sync` volviendo a confiar en el cuerpo** (S-1). La función escribe `runs` y
//     `sessions` con la SERVICE ROLE, que se salta el RLS. Hasta v11.70 el `user_id` salía de
//     `body.user_id` y el cliente llamaba con la anon key, que es pública en GitHub Pages:
//     cualquiera podía insertar carreras en la cuenta de cualquiera y usar la función como
//     proxy OAuth de Strava. El arreglo es una línea (`asUser.auth.getUser()`) y se deshace
//     igual de fácil — un `const { user_id } = body` de vuelta y nada falla, nada avisa.
//
//   · **`strava-sync` devolviendo un token al teléfono** (A-7). La función era un PROXY SIN
//     ESTADO: `exchange` devolvía el par access/refresh al navegador y `refresh` lo recibía en
//     el cuerpo. Strava ROTA el refresh token, así que dos almacenamientos (la PWA instalada y
//     Safari, separados en iOS) se pisaban y el segundo recibía `refresh_token invalid` →
//     "Strava se ha desconectado sola". Ahora los tokens viven en `integration_tokens` y por el
//     cuerpo no entra ni sale ninguno; un solo `body.access_token` de vuelta lo deshace y nada
//     falla, nada avisa.
//
//   · **Los `CARDIO_TYPE_MAP` divergiendo** (C-7). El mismo mapa vive en `app/app.js` (vía
//     intervals.icu) y en `_shared/cardio-types.ts` (las dos vías del servidor), con un "keep in
//     sync" a mano y cero comprobaciones. Ya se había roto de las dos formas posibles, cada una
//     silenciosa:
//       — faltaba `VirtualSki` en el servidor, así que toda sesión de SkiErg que llegara por
//         Strava se descartaba sin ruido (`skipped`, que nadie mira);
//       — sobraban `Walk`/`Hike`, que la app NO importa por decisión de Julian (2026-08-18),
//         así que el mismo paseo contaba o no contaba según por dónde entrase.
//     Un mapa que discrepa no rompe nada: sólo hace que la mitad del cardio desaparezca o que
//     aparezcan sesiones que el usuario decidió no registrar. Este test compara los literales.
//
//   · **El secreto de `steps-ingest` comparado con `!==`** (C-20). Es un endpoint PÚBLICO
//     (`verify_jwt = false`: lo llama un Atajo de iOS sin sesión) cuya única autenticación es
//     ese secreto. `a !== b` sale en el primer byte distinto: quien mida el tiempo de respuesta
//     lo reconstruye byte a byte. `timingSafeEqual` recorre siempre la longitud máxima.
//
//   · **`parse-meal-photo` con el modelo enterrado en la llamada** (C-21). La PWA calcula el
//     coste de cada foto con SU propia constante (`NUT_AI_MODEL`) y su propia tabla de precios.
//     Con el nombre del modelo escrito a mano dentro del request, los dos podían separarse sin
//     que nada avisara: el coste mostrado sería el de otro modelo. Ahora el servidor devuelve
//     `usage` con el coste ya calculado y el modelo que de verdad corrió.
//
// Ejecutar desde la raíz del repo: node tests/verify-strava-steps-fns.mjs

import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const STRAVA = read('supabase/functions/strava-sync/index.ts');
const STRAVA_SYNC = read('supabase/functions/_shared/strava-sync.ts');
const IMPORT = read('supabase/functions/_shared/activity-import.ts');
const STEPS = read('supabase/functions/steps-ingest/index.ts');
const MEAL = read('supabase/functions/parse-meal-photo/index.ts');
const APPJS = read('app/app.js');
const HTTP = read('supabase/functions/_shared/http.ts');
const CONFIG = read('supabase/config.toml');

// `_shared/cardio-types.ts` es PURO (sintaxis borrable, cero imports, cero globals de Deno), así
// que Node 25 lo importa sin build y se compara el VALOR que corre, no un texto parecido. Si
// alguien mete un `enum` o un `Deno.env.get` en el top level, este import revienta y el aviso
// llega antes del despliegue.
const cardio = await import(pathToFileURL('supabase/functions/_shared/cardio-types.ts').href);

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// ── 1. strava-sync: el usuario sale del JWT, jamás del cuerpo — y el token, de la BASE ─────
//
// A-7 reescribió la función: el volcado vive en `_shared/strava-sync.ts` y la escritura en
// `_shared/activity-import.ts`, así que las comprobaciones apuntan a los tres ficheros. Lo que
// se protege es lo mismo de siempre, más una invariante nueva: **por el cuerpo no entra ni sale
// una credencial**.
console.log('1. strava-sync · el usuario del JWT y el token de la base (S-1 + A-7)');
yes(/asUser\.auth\.getUser\(\)/.test(STRAVA), 'el usuario se resuelve con asUser.auth.getUser()');
yes(/SUPABASE_ANON_KEY/.test(STRAVA) && /Authorization: authHeader/.test(STRAVA),
    'con un cliente que lleva el Authorization de la petición (no la service role)');
yes(/if \(userErr \|\| !userData\?\.user\) return json\(\{ error: "Token inválido" \}, 401\)/.test(STRAVA),
    'una sesión inválida es un 401, no un fallback a nada');
yes(!/body\.user_id/.test(STRAVA) && !/user_id\s*\}\s*=\s*body/.test(STRAVA) && !/body\?\.user_id/.test(STRAVA),
    'body.user_id no se lee en NINGÚN sitio de la función');
// LA INVARIANTE DE A-7. Hasta v11.70 el cliente mandaba `access_token` en el cuerpo de `sync` y
// recibía el par rotado en la respuesta de `refresh`. Un solo `body.access_token` de vuelta
// devuelve la credencial al teléfono y nada falla, nada avisa.
for (const [fichero, src] of [
  ['strava-sync/index.ts', STRAVA],
  ['_shared/strava-sync.ts', STRAVA_SYNC],
  ['_shared/activity-import.ts', IMPORT],
]) {
  yes(!/body[.?]{1,2}access_token/.test(src) && !/access_token\s*\}\s*=\s*body/.test(src),
      `${fichero}: el access token NO se lee del cuerpo`);
  yes(!/access_token:/.test(src) && !/refresh_token:/.test(src),
      `${fichero}: y ninguna respuesta lleva un token dentro`);
}
yes(/RETIRED_ACTIONS = \["exchange", "refresh"\]/.test(STRAVA),
    'las dos acciones del proxy viejo siguen ACEPTÁNDOSE (la PWA sin reescribir no revienta)');
yes(/"action_retired"/.test(STRAVA) && /code: "server_oauth"/.test(STRAVA),
    'y son no-ops con un código que dice dónde está la puerta nueva');
yes(/from "\.\.\/_shared\/tokens\.ts"/.test(STRAVA) || /serviceClient/.test(STRAVA),
    'la escritura sigue siendo con la service role (por eso el usuario tiene que salir del JWT)');
yes(/withProviderFetch\("strava"/.test(STRAVA_SYNC),
    '_shared/strava-sync.ts pide el token a tokens.ts (401 → un refresco → un reintento)');
yes(/p_user: userId/.test(IMPORT) && /userId: string/.test(IMPORT),
    'activity-import escribe con el userId que recibe, no con uno del payload');
// A-7 · la otra mitad de la invariante: el CLIENTE tampoco manda un token. Las dos acciones
// retiradas siguen aceptándose en el servidor para una PWA vieja, pero la PWA de este repo no
// las llama ya — y si alguien vuelve a escribir `action:'refresh'` en app/, el par rotado vuelve
// al teléfono y se reabre el bucle de "Strava se ha desconectado sola".
{
  const STRAVAJS = read('app/strava.js');
  yes(!!STRAVAJS, 'app/strava.js existe');
  // La lista de claves MUERTAS que la limpieza borra las nombra por obligación (`strava_access_token`
  // es el nombre de la clave que hay que quitar del dispositivo). Se neutraliza esa lista y se
  // comprueba lo que importa: que en el CÓDIGO no queda ni una lectura ni un envío de token.
  // Los comentarios también salen: la cabecera del fichero CITA el error de Strava que causó las
  // desconexiones (`{field:"refresh_token"…}`), y esa historia tiene que poder estar escrita.
  const sinLista = STRAVAJS
    .replace(/const STRAVA_DEAD_LS_KEYS = \[[\s\S]*?\];/, 'const STRAVA_DEAD_LS_KEYS = [];')
    .replace(/^\s*\/\/.*$/gm, '');
  yes(sinLista.length < STRAVAJS.length, 'se localiza la lista de claves muertas');
  yes(!/access_token/.test(sinLista) && !/refresh_token/.test(sinLista),
      'fuera de esa lista, app/strava.js no nombra un token (ni para leerlo, ni para mandarlo)');
  for (const accion of ['refresh', 'exchange', 'sync']) {
    yes(!new RegExp(`action: '${accion}'`).test(STRAVAJS),
        `y no invoca 'strava-sync' con action:'${accion}' (la invocación es de integrations.js)`);
  }
  yes(/integrationsSync\('strava'/.test(STRAVAJS),
      "el sync del cliente pasa por integrationsSync('strava'), que manda { days, mode:'sync' }");
}

// ── 2. C-29 + A-7: ni PostgREST ni Strava hablan directamente con el cliente ───────────────
console.log('');
console.log('2. strava-sync · los textos crudos van al log, no al cliente (C-29)');
// El cuerpo de un error de PostgREST nombra tablas, columnas y restricciones; el de Strava
// nombra el campo de NUESTRA configuración que está mal. Los dos son un oráculo.
for (const [fichero, src] of [
  ['strava-sync/index.ts', STRAVA],
  ['_shared/strava-sync.ts', STRAVA_SYNC],
  ['_shared/activity-import.ts', IMPORT],
]) {
  yes(!/text\.substring\(/.test(src), `${fichero}: ningún text.substring() viaja en una respuesta`);
  yes(!/details: data/.test(src), `${fichero}: sin \`details: data\` (el JSON entero del proveedor)`);
}
yes(STRAVA.includes('"strava_sync_failed"'), 'el catch general devuelve la etiqueta `strava_sync_failed`');
yes(!/error: \(err as Error\)\.message/.test(STRAVA),
    'el catch general no devuelve el mensaje crudo de la excepción');
yes(/code: "config"/.test(STRAVA),
    'un secreto que falta se distingue con `code: "config"` (reconectar no arregla eso)');
// Los `errors[]` que sí viajan son NUESTROS: id del proveedor + etiqueta, sin cuerpo ajeno.
yes(/out\.errors\.push\(`\$\{n\.sourceId\}: merge_failed`\)/.test(IMPORT),
    'los errores por actividad son etiqueta + id, no el cuerpo de la respuesta');
yes(/console\.error\(`\[\$\{opts\.source\}\]/.test(IMPORT),
    'y el detalle de cada uno sí se escribe en el log');

// ── 3. C-7: CARDIO_TYPE_MAP y RUN_MODALITIES, idénticos en cliente y servidor ─────────────
//
// A-7 movió el mapa del servidor a `_shared/cardio-types.ts` — un módulo PURO que sirve a las
// DOS vías de importación (Strava e intervals.icu). Antes había dos copias en el servidor
// esperando a divergir; ahora hay una, y este test la compara con la de `app/app.js`. Como el
// módulo es puro, se IMPORTA en vez de extraerse con una expresión regular: lo que se compara
// es el valor real que corre, no un texto que se le parece.
console.log('');
console.log('3. C-7 · el mapa de modalidades es EL MISMO en app.js y en _shared/cardio-types.ts');

/** Extrae el objeto literal `const <name> = { … };` y lo devuelve como pares clave→valor. */
function extraerMapa(src, name) {
  const re = new RegExp(`const ${name}(?::\\s*Record<string, string>)?\\s*=\\s*\\{`);
  const m = re.exec(src);
  if (!m) return null;
  const abre = src.indexOf('{', m.index);
  let prof = 0, fin = -1;
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '{') prof++;
    else if (src[i] === '}') { prof--; if (prof === 0) { fin = i; break; } }
  }
  if (fin < 0) return null;
  const cuerpo = src.slice(abre + 1, fin)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  const pares = {};
  for (const par of cuerpo.split(',')) {
    const mm = /^\s*['"]?([A-Za-z0-9_]+)['"]?\s*:\s*['"]([^'"]+)['"]\s*$/.exec(par);
    if (mm) pares[mm[1]] = mm[2];
  }
  return pares;
}

/** Extrae `const <name> = new Set([...]);` y lo devuelve ordenado. */
function extraerSet(src, name) {
  const re = new RegExp(`const ${name}\\s*=\\s*new Set\\(\\[([^\\]]*)\\]\\)`);
  const m = re.exec(src);
  if (!m) return null;
  return m[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean).sort();
}

const mapaApp = extraerMapa(APPJS, 'CARDIO_TYPE_MAP');
const mapaFn = cardio.CARDIO_TYPE_MAP;
yes(mapaApp && Object.keys(mapaApp).length > 10, `CARDIO_TYPE_MAP extraído de app/app.js (${mapaApp ? Object.keys(mapaApp).length : 0} tipos)`);
yes(mapaFn && Object.keys(mapaFn).length > 10, `CARDIO_TYPE_MAP importado de _shared/cardio-types.ts (${mapaFn ? Object.keys(mapaFn).length : 0} tipos)`);
if (mapaApp && mapaFn) {
  const soloApp = Object.keys(mapaApp).filter((k) => !(k in mapaFn));
  const soloFn = Object.keys(mapaFn).filter((k) => !(k in mapaApp));
  const distintos = Object.keys(mapaApp).filter((k) => k in mapaFn && mapaApp[k] !== mapaFn[k]);
  yes(soloApp.length === 0, `ningún tipo sólo en app.js${soloApp.length ? ` — faltan en el servidor: ${soloApp.join(', ')}` : ''}`);
  yes(soloFn.length === 0, `ningún tipo sólo en el servidor${soloFn.length ? ` — sobran: ${soloFn.join(', ')}` : ''}`);
  yes(distintos.length === 0,
      `ninguno apunta a modalidades distintas${distintos.length ? ` — ${distintos.map((k) => `${k}: ${mapaApp[k]} vs ${mapaFn[k]}`).join('; ')}` : ''}`);
  // Las dos roturas históricas, nombradas: un test que sólo compara no dice qué buscar.
  yes(mapaFn.VirtualSki === 'ski', 'VirtualSki → ski en el servidor (el SkiErg de Concept2 se descartaba)');
  yes(!('Walk' in mapaFn) && !('Hike' in mapaFn),
      'Walk/Hike NO se importan (decisión de Julian 2026-08-18: los pasos van por `steps`)');
}

// A-7 dejó vivo el import de cliente de intervals.icu con un punto de retirada comentado. Este
// mapa es lo ÚNICO de ese bloque que NO se va con él (lo usa el import del servidor vía el
// módulo puro), así que se dice aquí para que la retirada no se lo lleve por delante.
yes(/PUNTO DE RETIRADA · A-7/.test(APPJS) && /NO se borra/.test(APPJS),
    'el punto de retirada del import de cliente dice explícitamente que CARDIO_TYPE_MAP se queda');

const setApp = extraerSet(APPJS, 'RUN_MODALITIES');
const setFn = [...cardio.RUN_MODALITIES].sort();
yes(!!setApp && setFn.length > 0, 'RUN_MODALITIES en los dos lados');
eq(setFn.join(','), (setApp || []).join(','),
   'RUN_MODALITIES es el mismo conjunto (decide qué va a `runs` y qué a `sessions`)');

// El lookup normalizado: intervals.icu enseña "Virtual Ski" con espacio y la API devuelve
// `VirtualSki`. Un espacio no puede costar otra ronda de sesiones descartadas en silencio.
for (const variante of ['VirtualSki', 'Virtual Ski', 'virtual_ski', 'VIRTUAL-SKI']) {
  eq(cardio.activityModality({ type: variante }), 'ski', `activityModality("${variante}") → ski`);
}
eq(cardio.activityModality({ type: 'WeightTraining' }), null,
   'la fuerza NO se importa (duplicaría las sesiones de gimnasio registradas a mano)');

// El peso del subtipo alimenta el presupuesto de días duros: un intervalo importado con 0,5 en
// vez de 2 hace creer al motor que queda presupuesto libre. Los valores tienen que ser los
// MISMOS que en `SESSION_TYPES.cardio.subtypes` de app.js.
console.log('');
console.log('3b. C-7 · budgetWeight de los subtipos de cardio, igual que en app.js');
const cardioBlock = (() => {
  const i = APPJS.indexOf('  cardio: {');
  if (i < 0) return '';
  return APPJS.slice(i, APPJS.indexOf('  hybrid: {', i));
})();
let pesosComparados = 0;
for (const sub of ['zone2', 'zone3', 'threshold', 'intervals', 'long_easy', 'recovery']) {
  const m = new RegExp(`${sub}:\\s*\\{[^}]*budgetWeight:\\s*([0-9.]+)`).exec(cardioBlock);
  if (!m) { bad(`no se pudo leer budgetWeight de cardio.${sub} en app.js`); continue; }
  const meta = cardio.CARDIO_SUBTYPE_META[`cardio.${sub}`];
  eq(meta ? meta.budgetWeight : 'AUSENTE', Number(m[1]), `cardio.${sub}: budgetWeight ${m[1]}`);
  pesosComparados++;
}
eq(pesosComparados, 6, 'los seis subtipos de cardio comparados');
eq(cardio.subtypeMeta('recovery', 'walk').budgetWeight, 0,
   'recovery.walk pesa 0 (un paseo no es una dosis de cardio)');
// `subtypeFromIntensity` es la traducción de la etiqueta de intervals.icu; Strava no da ninguna
// y cae en zona 2 CON `subtypeInferred` (GEN-002: una suposición no se presenta como medida).
eq(cardio.subtypeFromIntensity('VO2 Max intervals'), 'intervals', 'intensidad "VO2" → intervals');
eq(cardio.subtypeFromIntensity('Tempo'), 'threshold', 'intensidad "Tempo" → threshold');
eq(cardio.subtypeFromIntensity(''), 'zone2', 'sin etiqueta → zone2');
yes(cardio.normalizeActivity({ id: 1, type: 'Run', start_date_local: '2026-09-08T07:00:00Z', distance: 5000, moving_time: 1500 }, 'strava_').subtypeInferred,
    'y una actividad de Strava (sin intensidad) queda marcada subtypeInferred');
// ── 4. C-20: steps-ingest ─────────────────────────────────────────────────────────────────
console.log('');
console.log('4. steps-ingest · secreto en tiempo constante y http compartido (C-20)');
yes(/import \{ corsHeaders, json, timingSafeEqual \} from "\.\.\/_shared\/http\.ts"/.test(STEPS),
    'importa corsHeaders, json y timingSafeEqual de _shared/http.ts');
yes(/timingSafeEqual\(secret, expected\)/.test(STEPS),
    'el secreto se compara en tiempo constante');
yes(!/secret !== expected/.test(STEPS),
    'y no queda ningún `!==` sobre el secreto (filtraba el prefijo correcto byte a byte)');
yes(!/const corsHeaders = \{/.test(STEPS) && !/function json\(/.test(STEPS),
    'sin copias locales de corsHeaders ni json');
yes(/await req\.json\(\)\.catch\(\(\) => \(\{\}\)\)/.test(STEPS),
    'un cuerpo vacío o mal formado no revienta con un 500 del parser');
yes(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//.test(STEPS), 'la fecha se valida como YYYY-MM-DD');
yes(/stepsNum < 0 \|\| stepsNum > 200000/.test(STEPS), 'y los pasos tienen rango');
yes(/verify_jwt = false/.test((CONFIG.split('[functions.steps-ingest]')[1] || '').split('\n[')[0]),
    'config.toml: verify_jwt = false (por eso el secreto ES la autenticación)');
yes(/export function timingSafeEqual/.test(HTTP), 'y timingSafeEqual vive en el módulo compartido');

// ── 5. C-21: parse-meal-photo ─────────────────────────────────────────────────────────────
console.log('');
console.log('5. parse-meal-photo · constantes con nombre y `usage` en la respuesta (C-21)');
yes(/^const MODEL = "claude-opus-5";$/m.test(MEAL), 'MODEL con nombre');
yes(/^const MAX_TOKENS = 16000;$/m.test(MEAL), 'MAX_TOKENS con nombre');
yes(/^const EFFORT = /m.test(MEAL) && /effort: "medium"/.test(MEAL), 'EFFORT con nombre, y sigue en medium');
yes(/^const PROMPT_VERSION = \d+;$/m.test(MEAL), 'PROMPT_VERSION con nombre');
yes(/model: MODEL/.test(MEAL) && /max_tokens: MAX_TOKENS/.test(MEAL) && /effort: EFFORT/.test(MEAL),
    'y la llamada usa las constantes, no literales repetidos');
yes(/function usageOf\(/.test(MEAL), 'hay un usageOf() propio (copiado, no importado de otra función)');
yes(!/from "\.\.\/coach-weekly-review/.test(MEAL),
    'y no importa nada de coach-weekly-review (arrastraría su Deno.serve a este bundle)');
yes(/usage: usageOf\(response\)/.test(MEAL), 'la respuesta devuelve usage');
for (const campo of ['input', 'output', 'cacheRead', 'cacheWrite', 'costUsd', 'model: MODEL', 'promptVersion: PROMPT_VERSION']) {
  yes(new RegExp(campo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(MEAL), `usage lleva \`${campo.split(':')[0]}\``);
}
for (const precio of ['PRICE_INPUT = 5.00', 'PRICE_OUTPUT = 25.00', 'PRICE_CACHE_READ = 0.50', 'PRICE_CACHE_WRITE_5M = 6.25']) {
  yes(MEAL.includes(precio), `precio ${precio.split(' =')[0]} declarado (los mismos que coach-weekly-review)`);
}
yes(/import \{ corsHeaders, json \} from "\.\.\/_shared\/http\.ts"/.test(MEAL),
    'C-22: corsHeaders y json compartidos');
yes(!/const corsHeaders = \{/.test(MEAL) && !/^function json\(/m.test(MEAL),
    'sin copias locales');
// La resolución contra la biblioteca es la razón de ser de la función: no puede cambiarla el
// saneado del coste.
yes(/resolved: "biblioteca" as const/.test(MEAL) && /resolved: "nuevo" as const/.test(MEAL),
    'y la resolución contra `foods` sigue intacta (los macros de la biblioteca ganan al modelo)');

console.log('');
console.log(failed === 0
  ? '✅ strava-sync, steps-ingest y parse-meal-photo: auth del JWT, mapa único, secreto en tiempo constante y coste medido.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
