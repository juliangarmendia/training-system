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
//   · **Los dos `CARDIO_TYPE_MAP` divergiendo** (C-7). El mismo mapa vive en `app/app.js` (vía
//     intervals.icu) y en `strava-sync/index.ts` (vía Strava), con un "keep in sync" a mano y
//     cero comprobaciones. Ya se había roto de las dos formas posibles, cada una silenciosa:
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

const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const STRAVA = read('supabase/functions/strava-sync/index.ts');
const STEPS = read('supabase/functions/steps-ingest/index.ts');
const MEAL = read('supabase/functions/parse-meal-photo/index.ts');
const APPJS = read('app/app.js');
const HTTP = read('supabase/functions/_shared/http.ts');
const CONFIG = read('supabase/config.toml');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// ── 1. strava-sync: el usuario sale del JWT, jamás del cuerpo ──────────────────────────────
console.log('1. strava-sync · el usuario del JWT, nunca del cuerpo (S-1)');
const syncBody = STRAVA.slice(STRAVA.indexOf('if (action === "sync")'));
yes(/asUser\.auth\.getUser\(\)/.test(syncBody), 'el usuario se resuelve con asUser.auth.getUser()');
yes(/SUPABASE_ANON_KEY/.test(syncBody) && /Authorization: authHeader/.test(syncBody),
    'con un cliente que lleva el Authorization de la petición (no la service role)');
yes(/if \(userErr \|\| !userData\?\.user\) return jsonResponse\(\{ error: "Invalid session" \}, 401\)/.test(syncBody),
    'una sesión inválida es un 401, no un fallback a nada');
yes(!/body\.user_id/.test(STRAVA) && !/user_id\s*\}\s*=\s*body/.test(STRAVA),
    'body.user_id no se lee en NINGÚN sitio de la función');
eq((syncBody.match(/user_id: userId/g) || []).length, 2,
   'los dos upserts (runs y sessions) escriben el userId del JWT');
yes(/SUPABASE_SERVICE_ROLE_KEY/.test(syncBody),
    'la escritura sigue siendo con la service role (por eso el usuario tiene que salir del JWT)');
yes(/verify_jwt = true/.test((CONFIG.split('[functions.strava-sync]')[1] || '').split('\n[')[0]),
    'y config.toml declara verify_jwt = true para strava-sync');

// ── 2. C-29: ni PostgREST ni Strava hablan directamente con el cliente ────────────────────
console.log('');
console.log('2. strava-sync · los textos crudos van al log, no al cliente (C-29)');
// El cuerpo de un error de PostgREST nombra tablas, columnas y restricciones; el de Strava
// nombra el campo de NUESTRA configuración que está mal. Los dos son un oráculo.
yes(!/text\.substring\(0, 500\) \}/.test(STRAVA) && !/\$\{text\.substring\(0, 200\)\}/.test(STRAVA),
    'ningún `text.substring()` viaja dentro de una respuesta');
yes(!/details: data/.test(STRAVA),
    'exchange/refresh ya no devuelven `details: data` (el JSON entero de Strava al cliente)');
for (const [etiqueta, contexto] of [
  ['strava_exchange_failed', 'exchange'],
  ['strava_refresh_failed', 'refresh'],
  ['strava_fetch_failed', 'listado de actividades'],
  ['strava_sync_failed', 'el catch general'],
]) {
  yes(STRAVA.includes(`"${etiqueta}"`), `${contexto} devuelve la etiqueta \`${etiqueta}\``);
}
eq((STRAVA.match(/console\.error\(`\[strava-sync\]/g) || []).length, 6,
   'y los seis caminos de error escriben el detalle en el log');
yes(!/error: \(err as Error\)\.message/.test(STRAVA),
    'el catch general no devuelve el mensaje crudo de la excepción');
// Los `errors[]` que sí viajan son NUESTROS: id + código + status, sin cuerpo del proveedor.
yes(/errors\.push\(`\$\{stravaId\}: upsert_failed \$\{upsertRes\.status\}`\)/.test(STRAVA),
    'los errores por actividad son etiqueta + status, no el cuerpo de la respuesta');

// ── 3. C-7: CARDIO_TYPE_MAP y RUN_MODALITIES, idénticos en cliente y servidor ─────────────
console.log('');
console.log('3. C-7 · el mapa de modalidades es EL MISMO en app.js y en strava-sync');

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
const mapaFn = extraerMapa(STRAVA, 'CARDIO_TYPE_MAP');
yes(mapaApp && Object.keys(mapaApp).length > 10, `CARDIO_TYPE_MAP extraído de app/app.js (${mapaApp ? Object.keys(mapaApp).length : 0} tipos)`);
yes(mapaFn && Object.keys(mapaFn).length > 10, `CARDIO_TYPE_MAP extraído de strava-sync (${mapaFn ? Object.keys(mapaFn).length : 0} tipos)`);
if (mapaApp && mapaFn) {
  const soloApp = Object.keys(mapaApp).filter((k) => !(k in mapaFn));
  const soloFn = Object.keys(mapaFn).filter((k) => !(k in mapaApp));
  const distintos = Object.keys(mapaApp).filter((k) => k in mapaFn && mapaApp[k] !== mapaFn[k]);
  yes(soloApp.length === 0, `ningún tipo sólo en app.js${soloApp.length ? ` — faltan en el servidor: ${soloApp.join(', ')}` : ''}`);
  yes(soloFn.length === 0, `ningún tipo sólo en strava-sync${soloFn.length ? ` — sobran en el servidor: ${soloFn.join(', ')}` : ''}`);
  yes(distintos.length === 0,
      `ninguno apunta a modalidades distintas${distintos.length ? ` — ${distintos.map((k) => `${k}: ${mapaApp[k]} vs ${mapaFn[k]}`).join('; ')}` : ''}`);
  // Las dos roturas históricas, nombradas: un test que sólo compara no dice qué buscar.
  yes(mapaFn.VirtualSki === 'ski', 'VirtualSki → ski en el servidor (el SkiErg de Concept2 se descartaba)');
  yes(!('Walk' in mapaFn) && !('Hike' in mapaFn),
      'Walk/Hike NO se importan por Strava (decisión de Julian 2026-08-18: los pasos van por `steps`)');
}

const setApp = extraerSet(APPJS, 'RUN_MODALITIES');
const setFn = extraerSet(STRAVA, 'RUN_MODALITIES');
yes(!!setApp && !!setFn, 'RUN_MODALITIES extraído de los dos ficheros');
eq((setFn || []).join(','), (setApp || []).join(','),
   'RUN_MODALITIES es el mismo conjunto (decide qué va a `runs` y qué a `sessions`)');

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
