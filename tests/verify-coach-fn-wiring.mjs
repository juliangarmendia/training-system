// Coach v2 — incremento 8: el cableado de la edge function `coach-weekly-review`.
// Coach v2.1 — incremento B-3: el contrato de salida v2 (fases, `weekSummary`, `whyKept`).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Esta función es la única pieza del sistema que
// puede escribir en la base de datos sin que nadie mire, y la única que cuesta dinero cada vez
// que corre. Tiene cuatro formas conocidas de romperse en silencio:
//
//   · **Un coach que escribe planes.** `loadActivePlan()` toma `max(version)` de `plans`: una
//     sola fila escrita desde aquí se convierte en el plan vivo en cualquier dispositivo antes
//     de que Julian la haya leído. La propuesta tiene que quedarse en
//     `coach_reviews[id].output.proposal` y sólo la PWA la copia al aplicar. Si esta función
//     aprende a escribir `plans`, el flujo de aprobación deja de existir y nadie se entera
//     hasta que un lunes el plan cambió solo.
//   · **Un refusal tragado.** Los clasificadores de seguridad declinan con HTTP 200. Sin mirar
//     `stop_reason` antes del contenido, `parsed_output` es null o un objeto vacío y se guarda
//     como propuesta legítima: una semana entera de entreno prescrita desde la nada.
//   · **Una fila que se queda en `running`.** La PWA hace polling 5 minutos y luego se rinde.
//     Si un error de API, un JSON inválido o un throw dejan la fila en `running`, la app no
//     sabe si reintentar (y `maybeRunWeeklyCoach` no vuelve a lanzar porque ya hay fila). El
//     resultado es una semana sin coach y sin mensaje de error. Cada rama de fallo tiene que
//     escribir `status: "failed"`.
//   · **Ids fuera del vocabulario de la app.** Si el esquema no fija los ids con `z.enum` y el
//     saneado no filtra, el modelo propone `trap-bar-deadlift-v2` y la tarjeta del ejercicio
//     se renderiza vacía en el gimnasio, sin historial y sin objetivo.
//
// Y una quinta, del prompt: **el corpus desaparecido**. `rules-compact.json` es el placeholder
// hasta que `scripts/build-rules-compact.mjs` lo genera. Con el placeholder el prompt corre sin
// las 70 reglas, el modelo cita Rule IDs de memoria y el saneado los descarta todos: decisiones
// sin evidencia trazable. Este test falla mientras el placeholder esté ahí, a propósito.
//
// Y una sexta, del contrato v2 (decisiones de Julian, 2026-09-07): **una Home que no sabe decir
// por qué NO cambia nada**. El coach trabaja por semanas y la estabilidad es el estado normal;
// si el contrato sólo obliga a explicar los cambios, la semana en que no cambia nada — que es la
// mayoría — se lee como una semana en la que el coach no miró los datos. De ahí `whyKept`
// (nunca vacío), `focus`, y `weekSummary` con **una fila por CADA sesión del plan, también las
// que se mantienen**. La cobertura no se le pide al modelo: se comprueba en el saneado contra el
// plan que viaja en el request, y la sesión sin motivo se rellena con "(sin motivo — el coach no
// lo dio)" para que el hueco se vea en la app en vez de desaparecer.
// Otras dos formas de romperlo en silencio, ambas cubiertas aquí:
//   · **La caché v1.** `factsHash` es la idempotencia. Si `PROMPT_VERSION` no entra en el hash,
//     la primera semana con el contrato v2 devuelve la fila v1 cacheada — sin `focus`, sin
//     `whyKept`, sin `weekSummary` — y la Home nueva se queda muda sin ningún error.
//   · **Un deload que progresa.** `phase` sale del modelo; si el bloque dice deload y el
//     saneado no lo fuerza, una semana de descarga se prescribe como build (G-H3, LOAD-004).
//
// Es un test de texto sobre las fuentes TypeScript: Node no puede importar módulos Deno con
// `npm:` ni con import attributes de JSON. La excepción es §14, que sí EJECUTA
// `reconcileWeekSummary` extrayéndola del fuente y quitándole los tipos con
// `module.stripTypeScriptTypes` — la cobertura y la consistencia de `weekSummary` son lógica con
// ramas, y un grep no distingue "está escrito" de "funciona". El type-check real sigue siendo
// `deno check supabase/functions/coach-weekly-review/index.ts`.
//
// Ejecutar desde la raíz del repo: node tests/verify-coach-fn-wiring.mjs

import { readFileSync, existsSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const DIR = 'supabase/functions/coach-weekly-review';
const read = (p) => (existsSync(p) ? readFileSync(p, 'utf8') : '');

const INDEX = read(`${DIR}/index.ts`);
const PROMPT = read(`${DIR}/prompt.ts`);
const SCHEMA = read(`${DIR}/schema.ts`);
const CONFIG = read('supabase/config.toml');
const RULES_PATH = `${DIR}/rules-compact.json`;

// Las comprobaciones NEGATIVAS ("no debe aparecer X") tienen que correr sobre el código, no
// sobre los comentarios: estos ficheros documentan justo los anti-patrones que evitan (".optional()",
// "ningún techo de 140"), así que un grep crudo se dispara contra la propia explicación.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !/^\s*\/\//.test(l))
  .join('\n');

const INDEX_CODE = stripComments(INDEX);
const PROMPT_CODE = stripComments(PROMPT);
const SCHEMA_CODE = stripComments(SCHEMA);

// El prompt vive dentro de plantillas literales, así que sus backticks van escapados (`\``).
// Para comprobar el TEXTO que ve el modelo hay que deshacer ese escape primero.
const PROMPT_TEXT = PROMPT.replace(/\\`/g, '`');

/** Recorta desde `marker` hasta la llave que lo cierra, contando llaves. Suficiente para las
 * funciones de este fichero, que no llevan llaves dentro de literales de cadena. */
function extractBraced(src, marker) {
  const start = src.indexOf(marker);
  if (start < 0) throw new Error(`no encuentro "${marker}" en index.ts`);
  const open = src.indexOf('{', start);
  if (open < 0) throw new Error(`"${marker}" sin cuerpo`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1);
  }
  throw new Error(`"${marker}" sin cerrar`);
}

/** Saca del fuente de `index.ts` la función pedida más las constantes y ayudantes de los que
 * depende, y la devuelve ejecutable. Es la única forma de PROBAR la lógica: `index.ts` importa
 * `npm:` y `jsr:`, que Node no resuelve.
 *
 * Los tipos se quitan del fichero ENTERO antes de recortar, no después: una anotación como
 * `Array<{ sessionId: string }>` mete una llave en la firma y el recorte por llaves cerraría
 * ahí en vez de al final del cuerpo. `mode: 'strip'` sustituye los tipos por espacios, así que
 * las posiciones se mantienen y el recorte es el mismo que sobre el TypeScript. */
function loadFromIndex(fnName, constNames = [], helperNames = []) {
  const js = stripTypeScriptTypes(INDEX, { mode: 'strip' });
  const pieces = [];
  for (const c of constNames) {
    const m = js.match(new RegExp(`^const ${c}\\s*=[\\s\\S]*?;\\s*$`, 'm'));
    if (!m) throw new Error(`no encuentro la constante ${c}`);
    pieces.push(m[0]);
  }
  for (const h of helperNames) pieces.push(extractBraced(js, `function ${h}(`));
  pieces.push(extractBraced(js, `function ${fnName}(`));
  return new Function(`${pieces.join('\n\n')}\nreturn ${fnName};`)();
}

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));

// ── 0. Los ficheros existen ──────────────────────────────────────────────────────────
console.log('0. Ficheros de la función');
yes(INDEX.length > 0, 'existe index.ts');
yes(PROMPT.length > 0, 'existe prompt.ts');
yes(SCHEMA.length > 0, 'existe schema.ts');
if (!INDEX || !PROMPT || !SCHEMA) {
  console.log('\n❌ Faltan fuentes de la función; el resto de comprobaciones no aplica.');
  process.exit(1);
}

// ── 1. Mismo patrón que parse-meal-photo ─────────────────────────────────────────────
console.log('');
console.log('1. Patrón del SDK (el mismo que parse-meal-photo, que ya funciona en producción)');
yes(/zodOutputFormat/.test(INDEX), 'usa zodOutputFormat (salida estructurada, no parseo de prosa)');
yes(/@anthropic-ai\/sdk@0\.123\.0/.test(INDEX), 'fija la versión del SDK igual que parse-meal-photo');
yes(/["']claude-opus-5["']/.test(INDEX), 'modelo claude-opus-5');
yes(/thinking:\s*\{\s*type:\s*["']adaptive["']\s*\}/.test(INDEX), 'thinking adaptive');
yes(/EFFORT\s*=\s*["']high["']/.test(INDEX), 'la constante EFFORT es "high"');
yes(/effort:\s*(EFFORT|["']high["'])/.test(INDEX), 'y output_config la pasa como effort');
yes(/output_config:\s*\{/.test(INDEX), 'la salida se fija con output_config.format, no con prompt');
yes(/cache_control/.test(INDEX), 'el bloque estático del system lleva cache_control');
yes(/max_tokens:\s*(MAX_TOKENS|\d{4,6})/.test(INDEX), 'max_tokens explícito (no el default)');
yes(/timeout:\s*API_TIMEOUT_MS|timeout:\s*1?\d{2}_?\d{3}/.test(INDEX), 'timeout por request (el tope wall-clock del plan)');
yes(/asUser\.auth\.getUser\(\)/.test(INDEX), 'resuelve el usuario con el JWT del Authorization');
yes(/SUPABASE_SERVICE_ROLE_KEY/.test(INDEX), 'y usa la service role sólo para escribir la fila');
yes(/OPTIONS/.test(INDEX) && /Access-Control-Allow-Origin/.test(INDEX), 'CORS + preflight OPTIONS');

// ── 2. El invariante que más duele: no escribe planes ────────────────────────────────
console.log('');
console.log('2. NO escribe en `plans` (una fila desde aquí sería el plan vivo, sin aprobación)');
const PLANS_WRITE = /\.from\(\s*["']plans["']\s*\)[\s\S]{0,200}?\.(insert|upsert|update|delete)\s*\(/;
yes(!PLANS_WRITE.test(INDEX_CODE), 'ninguna escritura a la tabla plans (insert/upsert/update/delete)');
yes(!/\.from\(\s*["']plans["']\s*\)/.test(INDEX_CODE), 'de hecho no toca la tabla plans en absoluto');
yes(/["']coach_reviews["']/.test(INDEX), 'la propuesta se guarda en coach_reviews');
yes(/onConflict:\s*["']user_id,record_id["']/.test(INDEX), 'upsert por (user_id, record_id), la clave única de la tabla');

// ── 3. Refusal, JSON nulo y excepciones: nunca `running` ─────────────────────────────
console.log('');
console.log('3. Ninguna rama deja la fila en `running`');
yes(/stop_reason/.test(INDEX) && /["']refusal["']/.test(INDEX), 'mira stop_reason === "refusal" antes del contenido');
yes(/stop_details/.test(INDEX), 'y guarda la categoría del refusal (stop_details.category)');
yes(/parsed_output/.test(INDEX), 'comprueba parsed_output === null');
yes(/kind:\s*["']parse["']/.test(INDEX), 'con un estado failed/parse cuando el JSON no llega');
yes(/kind:\s*["']refusal["']/.test(INDEX), 'un estado failed/refusal');
yes(/kind:\s*["']api["']/.test(INDEX), 'y un estado failed/api para cualquier excepción');
const failedWrites = (INDEX.match(/status:\s*["']failed["']/g) || []).length;
yes(failedWrites >= 3, `escribe status "failed" en ≥3 ramas (encontradas: ${failedWrites})`);
yes(/catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,400}status:\s*["']failed["']/.test(INDEX),
  'el catch de run() escribe la fila antes de rendirse (no re-lanza)');
yes(/status:\s*["']proposed["']/.test(INDEX), 'y el camino bueno acaba en "proposed" (nunca "active")');

// ── 4. Asíncrono + idempotencia ──────────────────────────────────────────────────────
console.log('');
console.log('4. Asíncrono, 202 y hash de los hechos');
yes(/EdgeRuntime\.waitUntil\(/.test(INDEX), 'EdgeRuntime.waitUntil (sin esto el runtime mata el trabajo al responder)');
yes(/,\s*202\s*\)/.test(INDEX), 'devuelve 202 en modo async');
yes(/mode\s*===?\s*["']sync["']/.test(INDEX), 'y soporta mode:"sync" para probar con un pack real');
yes(/factsHash/.test(INDEX), 'calcula factsHash');
yes(/function stableStringify/.test(INDEX), 'con un stringify determinista (claves ordenadas)');
yes(/keys\s*=\s*Object\.keys\([^)]*\)\.sort\(\)/.test(INDEX), 'que efectivamente ordena las claves');
yes(/crypto\.subtle\.digest\(\s*["']SHA-256["']/.test(INDEX), 'y sha256 de verdad');
yes(/cached:\s*true/.test(INDEX), 'devuelve cached:true en vez de pagar otra revisión idéntica');
yes(/regenerate/.test(INDEX), 'salvo que el usuario pida regenerar');
yes(/attempt/.test(INDEX) && /\$\{weekKey\}#/.test(INDEX), 'el id es `weekKey#attempt`');

// ── 5. Validación de entrada ─────────────────────────────────────────────────────────
console.log('');
console.log('5. Validación de la petición');
yes(/\^\\d\{4\}-W\\d\{2\}\$/.test(INDEX), 'weekKey contra la regex YYYY-Wnn');
yes(/200_000|200000/.test(INDEX), 'tope de 200 KB al facts pack');
yes(/MAX_SESSION_IDS\s*=\s*12/.test(INDEX), 'tope de 12 sesiones permitidas');
yes(/MAX_EXERCISE_IDS\s*=\s*150/.test(INDEX), 'tope de 150 ejercicios permitidos');
yes(/MAX_PRIOR_REVIEWS\s*=\s*6/.test(INDEX),
  'MAX_PRIOR_REVIEWS = 6 (con 4 no se ve un bloque entero, y el coach v2.1 razona sobre el recorrido)');
yes(/priorReviews[\s\S]{0,200}slice\(0,\s*MAX_PRIOR_REVIEWS\)/.test(INDEX_CODE),
  'y priorReviews se recorta de verdad con esa constante');

// ── 6. Saneado en código, no en el decoder ───────────────────────────────────────────
console.log('');
console.log('6. Saneado en código (los topes no se confían al modelo)');
yes(/MAX_SESSIONS\s*=\s*6/.test(INDEX), '≤6 sesiones');
yes(/MAX_EX_PER_SESSION\s*=\s*10/.test(INDEX), '≤10 ejercicios por sesión');
yes(/MAX_NOTE\s*=\s*240/.test(INDEX), 'notas recortadas a 240 caracteres');
yes(/N_PRIORITIES\s*=\s*3/.test(INDEX), 'exactamente 3 prioridades');
yes(/priorities\.push\(/.test(INDEX), 'que se rellenan si faltan');
yes(/ROUND_KG\s*=\s*1\.25/.test(INDEX), 'kg redondeado al múltiplo de 1,25');
yes(/POR MANO/.test(INDEX), 'con el kg por mano en los ejercicios db');
yes(/const isMeasure = Boolean\(meta\?\.measure\)/.test(INDEX),
  'target.kg a null solo en measure (cm/reps)');
yes(/lastre/.test(INDEX) && /uno de los 6 anchors/.test(INDEX),
  'y en bw el kg se CONSERVA: es el lastre de la dominada, su unica palanca de progresion');
yes(/dow < 0 \|\| dow > 6/.test(INDEX), 'dow del cardio dentro de 0..6');
yes(/RULE_IDS\.has\(/.test(INDEX), 'ruleIds filtrados contra el corpus real');
yes(/sanitized\.push\(/.test(INDEX), 'y todo lo recortado se anota en sanitized[] en vez de desaparecer');
yes(/no está en los ids permitidos|no está en la librería/.test(INDEX), 'los ids fuera de allowed se descartan con motivo');
yes(/weeklyKmTarget/.test(INDEX) && /Math\.max\(0,\s*round1/.test(INDEX), 'weeklyKmTarget ≥ 0');
yes(/dataGaps/.test(INDEX), 'y comprueba que el briefing repite los dataGaps del pack');

// ── 6b. Contrato v2: los topes nuevos y las reglas que sostienen la Home ──────────────
console.log('');
console.log('6b. Saneado del contrato v2 (focus, whyKept, weekSummary, fase)');
for (const [name, value] of [
  ['MAX_FOCUS', 160], ['MAX_WHY', 600], ['MAX_LASTWEEK_BULLETS', 3],
  ['MAX_WEEK_SUMMARY', 12], ['MAX_SUMMARY_LINE', 160],
]) {
  yes(new RegExp(`${name}\\s*=\\s*${value}\\b`).test(INDEX), `${name} = ${value}`);
}
yes(/PROMPT_VERSION\s*=\s*2\b/.test(INDEX), 'PROMPT_VERSION = 2 (el contrato subió de versión)');
// Sin esto, la primera semana de v2 devuelve la revisión v1 cacheada y la Home nueva sale vacía.
yes(/sha256Hex\([^)]*PROMPT_VERSION/.test(INDEX_CODE),
  'y PROMPT_VERSION entra en el factsHash (si no, una fila v1 en caché se devuelve como v2)');
yes(/PHASES\s*=\s*\[[^\]]*"base"[^\]]*"build"[^\]]*"intensify"[^\]]*"deload"[^\]]*"maintenance"/.test(INDEX_CODE),
  'las 5 fases también en el saneado, no sólo en el esquema');
yes(/no es una fase conocida; a 'build'/.test(INDEX), "fase fuera del enum → 'build' + nota");
yes(/isDeload/.test(INDEX_CODE) && /forzada a 'deload'/.test(INDEX),
  "facts.block.isDeload = true y otra fase → forzada a 'deload' + nota (G-H3, LOAD-004)");
yes(/briefing\.whyKept vacío/.test(INDEX), 'whyKept vacío se anota (mantener también se justifica)');
yes(/\(sin motivo — el coach no lo dio\)/.test(INDEX),
  'la sesión sin fila en weekSummary se rellena con "(sin motivo — el coach no lo dio)"');
yes(/function reconcileWeekSummary/.test(INDEX_CODE), 'con una función de cobertura + consistencia');
yes(/corregido a 'changed'/.test(INDEX) && /corregido a 'kept'/.test(INDEX),
  'y el status se corrige contra proposal.sessions en los dos sentidos');
yes(/lastWeekSummary/.test(INDEX_CODE) && /MAX_LASTWEEK_BULLETS/.test(INDEX_CODE),
  'lastWeekSummary recortado a 3 líneas');
yes(/focus:\s*(clip|focus)/.test(INDEX_CODE) && /MAX_FOCUS/.test(INDEX_CODE), 'focus recortado a MAX_FOCUS');
yes(/planSessionIdsOf/.test(INDEX_CODE) && /currentPlan/.test(INDEX_CODE),
  'la cobertura se mide contra el plan del request (currentPlan), no contra el vocabulario');
yes(/"## Por qué cambia"/.test(INDEX_CODE) && /"## Por qué se mantiene"/.test(INDEX_CODE),
  'y nextWeek se comprueba con las 5 secciones nuevas');

// ── 7. Coste medido, no estimado ─────────────────────────────────────────────────────
console.log('');
console.log('7. Coste y uso guardados en la fila');
yes(/PRICE_INPUT\s*=\s*5(\.0+)?/.test(INDEX), 'precio de entrada de Opus 5: $5/MTok');
yes(/PRICE_OUTPUT\s*=\s*25(\.0+)?/.test(INDEX), 'precio de salida: $25/MTok');
yes(/PRICE_CACHE_READ\s*=\s*0\.50?/.test(INDEX), 'lectura de caché: $0,50/MTok');
yes(/PRICE_CACHE_WRITE_1H\s*=\s*10(\.0+)?/.test(INDEX), 'escritura de caché con TTL 1 h: $10/MTok (2x, no 1,25x)');
yes(/cache_read_input_tokens/.test(INDEX) && /cache_creation_input_tokens/.test(INDEX),
  'guarda los tokens de caché (si cacheRead es 0 siempre, algo invalida el prefijo)');
yes(/costUsd/.test(INDEX) && /latencyMs/.test(INDEX), 'costUsd y latencyMs en la fila');
yes(/console\.log\([\s\S]{0,300}status=/.test(INDEX), 'una línea de log por ejecución con estado y coste');

// ── 8. Esquema: los ids se fijan con enum ────────────────────────────────────────────
console.log('');
console.log('8. Esquema zod dinámico');
yes(/z\.enum\(/.test(SCHEMA), 'usa z.enum para cerrar el vocabulario');
yes(/function idEnum/.test(SCHEMA), 'con un constructor de enum por request');
yes(/clean\.length === 0[\s\S]{0,80}z\.string\(\)/.test(SCHEMA), 'y fallback a z.string() si la lista llega vacía');
yes(/enumsAreOpen/.test(SCHEMA) && /enumsAreOpen/.test(INDEX), 'que se anota en la fila cuando ocurre');
yes(!/\.transform\(/.test(SCHEMA_CODE), 'sin .transform() (el decoder restringido no lo expresa)');
yes(!/\.refine\(/.test(SCHEMA_CODE) && !/\.superRefine\(/.test(SCHEMA_CODE), 'sin refinements');
yes(!/\.optional\(\)/.test(SCHEMA_CODE), 'sin .optional() — todo opcional es .nullable()');
yes(/\.nullable\(\)/.test(SCHEMA), 'y sí .nullable()');
yes(/z\.record\(z\.string\(\)\)/.test(SCHEMA), 'evidence.numbers como record de strings');
yes(/exactamente 3|Exactamente 3/.test(SCHEMA), 'priorities descrito como exactamente 3');
yes(/sólo las sesiones que cambian|SÓLO las sesiones que cambian/.test(SCHEMA),
  'proposal.sessions descrito como sólo las sesiones que cambian');
yes(/DECISION_TYPES/.test(SCHEMA) && /CARDIO_SUBTYPES/.test(SCHEMA), 'enums de Decision.type y CardioSlot.subtype');

// ── 8b. Esquema: el contrato v2 ──────────────────────────────────────────────────────
console.log('');
console.log('8b. Esquema: contrato v2 (5 fases, weekSummary, whyKept)');
const phasesDecl = (SCHEMA_CODE.match(/PHASES\s*=\s*\[([^\]]*)\]/) || [])[1] || '';
const phaseValues = (phasesDecl.match(/"([a-z_]+)"/g) || []).map((s) => s.replace(/"/g, ''));
yes(phaseValues.length === 5, `PHASES tiene exactamente 5 valores (${phaseValues.length}: ${phaseValues.join(', ')})`);
for (const p of ['base', 'build', 'intensify', 'deload', 'maintenance']) {
  yes(phaseValues.includes(p), `PHASES incluye '${p}'`);
}
yes(/phase:\s*z\.enum\(PHASES\)/.test(SCHEMA_CODE), 'proposal.phase y briefing.phase usan z.enum(PHASES)');
yes((SCHEMA_CODE.match(/phase:\s*z\.enum\(PHASES\)/g) || []).length >= 2,
  'las dos: la propuesta y el briefing');
yes(!/z\.enum\(\[\s*"build",\s*"deload"\s*\]\)/.test(SCHEMA_CODE), 'y ya no queda el enum viejo de 2 fases');
yes(/WEEK_SUMMARY_STATUS\s*=\s*\[/.test(SCHEMA_CODE) && /"kept"/.test(SCHEMA_CODE) && /"removed"/.test(SCHEMA_CODE),
  'estados de weekSummary: kept | changed | new | removed');
yes(/weekSummary:\s*z\.array\(WeekSummaryRow\)/.test(SCHEMA_CODE), 'proposal.weekSummary es un array de filas');
yes(/sessionId:\s*SessionId/.test(SCHEMA_CODE), 'con el sessionId cerrado por el mismo enum que las sesiones');
yes(/UNA FILA POR CADA SESIÓN/i.test(SCHEMA), 'descrito como una fila por CADA sesión, también las que no cambian');
for (const f of ['focus', 'whyChanged', 'whyKept', 'lastWeekSummary']) {
  yes(new RegExp(`${f}:\\s*z\\.`).test(SCHEMA_CODE), `briefing.${f} existe en el esquema`);
}
yes(/NUNCA vacío/.test(SCHEMA), 'y whyKept está descrito como nunca vacío');
yes(/cinco secciones/.test(SCHEMA), 'nextWeek descrito con cinco secciones');

// ── 9. Prompt: ethos con las correcciones del audit ──────────────────────────────────
console.log('');
console.log('9. Prompt: reglas citadas y correcciones del audit (F-2, F-3, F-9)');
for (const rid of ['READ-002', 'STR-001', 'END-004', 'INT-001', 'LOAD-004', 'REC-008']) {
  yes(PROMPT.includes(rid), `cita ${rid}`);
}
yes(/form = ctl/.test(PROMPT), 'F-2: la forma aeróbica es `form = ctl − atl` (no rampRate, que es ΔCTL/sem)');
yes(/rampRate/.test(PROMPT) && /no\*?\*? es TSB|no es TSB/.test(PROMPT), 'y dice explícitamente que rampRate no es TSB');
yes(/carga AERÓBICA|sólo carga aeróbica|aeróbica y sólo eso/i.test(PROMPT),
  'F-3: CTL/ATL son carga aeróbica, no dosifican fuerza');
yes(/RPE, top set y calidad|RPE\/top set|top set y calidad/i.test(PROMPT),
  'y la señal de fuerza es RPE + top set + calidad de la sesión');
yes(/facts\.cardio\.z2Ceiling/.test(PROMPT), 'F-9: el techo de Z2 se lee del pack, no está hardcodeado');
yes(!/\b140\b/.test(PROMPT_CODE), 'y no hay ningún techo de 140 escrito a mano');
yes(/facts\.plan\.weekTemplate/.test(PROMPT), 'los días de pierna salen de facts.plan.weekTemplate');
yes(/dataGaps/.test(PROMPT), 'los dataGaps se repiten literalmente');
yes(/no hay señal/i.test(PROMPT), '"no hay señal" cuando falla un gate');
yes(/ajustar por RPE, sin dato/.test(PROMPT), 'kg null + "ajustar por RPE, sin dato" en vez de inventar');
yes(/Propones\. Julian decide|propone.*el usuario decide/i.test(PROMPT), 'propone; el usuario decide');
yes(/se llama progreso/.test(PROMPT), 'mantener en déficit se llama progreso');
yes(/expert|weak_extrapolated/.test(PROMPT), 'grado de evidencia cuando la regla es expert/weak');
yes(/POR MANO/.test(PROMPT) && /lastre/.test(PROMPT), 'kg por mano en db, lastre en bw');
yes(/SIEMPRE null/.test(PROMPT), 'y null en measure');
yes(/\+10%/.test(PROMPT), 'sin saltos de carga >+10% sin decisión');
yes(/21 días/.test(PROMPT), '>21 días sin exposición → reentrada, no progresión');
yes(/isDeload/.test(PROMPT), 'nada progresa en deload (facts.block.isDeload)');
yes(/24 h/.test(PROMPT), 'nada duro <24 h antes de una sesión de pierna');
yes(/G-H14/.test(PROMPT) && /G-H1\b/.test(PROMPT), 'guardarraíles duros G-H1..G-H14 como MUST');
yes(/G-S13/.test(PROMPT), 'y los blandos G-S1..G-S13 como SHOULD');
yes(/MUST/.test(PROMPT) && /SHOULD/.test(PROMPT), 'con los dos niveles etiquetados');

console.log('');
console.log('10. Prompt: decisiones ya tomadas por Julian');
yes(/2026-09-06/.test(PROMPT), 'la grasa manda sobre el 10k (decisión del 2026-09-06)');
yes(/2026-09-07/.test(PROMPT), 'bloque re-anclado al 2026-09-07');
yes(/2026-10-05/.test(PROMPT), 'con el primer deload la semana del 2026-10-05');
yes(/\b82\b/.test(PROMPT), 'hito de −5 kg → 82 kg');
yes(/185/.test(PROMPT), 'y la proteína de 185 g como suelo que no cede');

console.log('');
console.log('11. Prompt: estructura cacheable y contrato de salida');
yes(/export const SYSTEM_STATIC/.test(PROMPT), 'SYSTEM_STATIC construido al cargar el módulo');
yes(/export function buildDynamicSystem/.test(PROMPT), 'y lo del request en buildDynamicSystem');
yes(/export function buildUserMessage/.test(PROMPT), 'con los datos en el mensaje de usuario');
yes(/export const RULES_VERSION/.test(PROMPT), 'RULES_VERSION exportado para estampar la fila');
yes(/rules-compact\.json["']\s+with\s*\{\s*type:\s*["']json["']\s*\}/.test(PROMPT),
  'el corpus se importa con import attributes');
yes(!/Date\.now\(\)|new Date\(/.test(PROMPT_CODE), 'sin fechas calculadas en el prompt estático (invalidaría la caché)');
for (const h of ['## Qué pasó', '## Qué cambio', '## Por qué', '## Decisiones anteriores',
                 '## Qué vigilo', '## Qué necesito de ti']) {
  yes(PROMPT.includes(h), `el contrato del briefing incluye "${h}"`);
}

// ── 11b. Prompt: el giro del contrato v2 ─────────────────────────────────────────────
console.log('');
console.log('11b. Prompt: rendimiento primero, el recorrido y la estabilidad con motivo');
for (const m of ['Primero el rendimiento', 'nunca dosifica', 'facts.trajectory',
                 'No cambies por variedad', 'Qué necesito de ti']) {
  yes(PROMPT.includes(m), `contiene el marcador "${m}"`);
}
// Los campos de trayectoria se citan por su nombre exacto: el prompt y el facts pack (B.2)
// tienen que hablar del mismo objeto o el coach pide un dato que nadie le manda.
for (const f of ['trajectory.program.blocks', 'trajectory.weight.slopeSinceStartKgPerWeek',
                 'trajectory.anchors[]', 'trajectory.running.weeklyKm',
                 'trajectory.adherenceByWeek', 'trajectory.skippedPatterns',
                 'trajectory.decisionsFollowUp']) {
  yes(PROMPT.includes(f), `el paso "El recorrido" cita \`${f}\``);
}
yes(/Rendimiento y recuperación \(en ese orden\)/.test(PROMPT), 'el paso 2 es "Rendimiento y recuperación (en ese orden)"');
yes(/recuperación sola nunca baja un kg/i.test(PROMPT), 'y la recuperación sola nunca baja un kg');
yes(/no se hizo tres veces no se recuerda/.test(PROMPT),
  'lo saltado 3 veces se reordena o se quita, no se vuelve a prescribir');
yes(/número desde el inicio/.test(PROMPT), 'exige ≥1 número since-start en lastWeek / whyKept / whyChanged');
yes(/La recuperación es información, no dosis/.test(PROMPT) && /2026-09-07/.test(PROMPT),
  'ANCLAS: "La recuperación es información, no dosis" (decisión del usuario 2026-09-07)');
yes(/dejar una sesión del plan sin su fila en/.test(PROMPT_TEXT),
  'NUNCA: dejar una sesión del plan sin su fila en weekSummary');
yes(/Cambiar una sesión sin un dato/.test(PROMPT_TEXT), 'NUNCA: cambiar una sesión sin un dato');
for (const p of ['base', 'build', 'intensify', 'deload', 'maintenance']) {
  yes(PROMPT_TEXT.includes(`- \`${p}\` —`), `el CONTRATO define la fase \`${p}\``);
}
yes(/adherencia ≥75%.{0,60}verde 2 semanas/s.test(PROMPT), 'intensify sólo con adherencia ≥75% y verde 2 semanas');
yes(/whyKept/.test(PROMPT) && /whyChanged/.test(PROMPT) && /lastWeekSummary/.test(PROMPT) && /briefing\.focus/.test(PROMPT),
  'el CONTRATO nombra focus, lastWeekSummary, whyChanged y whyKept');
yes(/## Por qué se mantiene/.test(PROMPT), 'nextWeek lleva la sección "Por qué se mantiene"');

// Los negativos: READ-007 aplicado al día es exactamente lo que Julian rechazó el 2026-09-07.
// Si estas frases vuelven, el coach vuelve a razonar en días y la app vuelve a ajustar sesiones.
for (const neg of ['una señal cambia el objetivo del día', 'una noche de 5 h']) {
  yes(!PROMPT.includes(neg), `NO contiene "${neg}" (ajuste diario retirado, 2026-09-07)`);
}
yes(/señal o un día suelto no cambia nada/i.test(PROMPT),
  'y en su lugar: "una señal o un día suelto no cambia nada: se anota y se mira la semana que viene"');

// ── 14. `reconcileWeekSummary` ejecutada de verdad ───────────────────────────────────
// Un grep confirma que el código está escrito; no confirma que rellene, corrija y no duplique.
// Se extrae del fuente y se le quitan los tipos: no hay forma de importar index.ts desde Node.
console.log('');
console.log('14. Cobertura y consistencia de weekSummary (ejecutada con un fixture)');
try {
  const reconcile = loadFromIndex('reconcileWeekSummary', [
    'MAX_WEEK_SUMMARY', 'MAX_SUMMARY_LINE', 'WEEK_SUMMARY_STATUSES', 'WEEK_SUMMARY_FILL',
  ], ['clip']);

  // Plan de 3 sesiones. El coach sólo dio fila para A, y cambió B en `proposal.sessions`.
  const notes = [];
  const rows = reconcile(
    [{ sessionId: 'upper-a', status: 'kept', line: 'Igual: 8/8/7 @7,5 el 1-sep' }],
    ['upper-a', 'lower-a', 'upper-b'],
    new Set(['lower-a']),
    notes,
  );
  const by = Object.fromEntries(rows.map((r) => [r.sessionId, r]));
  yes(rows.length === 3, `una fila por cada sesión del plan (${rows.length} de 3)`);
  yes(by['upper-a']?.status === 'kept', "A: la fila que dio el coach se respeta ('kept')");
  yes(by['lower-a']?.status === 'changed', "B: falta la fila pero está en sessions → se rellena como 'changed'");
  yes(by['upper-b']?.status === 'kept', "C: falta la fila y no cambia → 'kept'");
  yes(by['upper-b']?.line === '(sin motivo — el coach no lo dio)', 'C: con la línea de relleno visible');
  yes(notes.length === 2, `2 notas, una por sesión rellenada (${notes.length})`);
  yes(notes.every((n) => /sin motivo — el coach no lo dio/.test(n)), 'y las dos dicen que el coach no dio motivo');

  // Consistencia en los dos sentidos, sobre filas que el coach SÍ dio.
  const notes2 = [];
  const rows2 = reconcile(
    [
      { sessionId: 'upper-a', status: 'kept', line: 'igual' },     // pero está en sessions
      { sessionId: 'lower-a', status: 'changed', line: 'sube' },   // pero NO está en sessions
      { sessionId: 'upper-a', status: 'new', line: 'duplicada' },  // duplicada
    ],
    ['upper-a', 'lower-a'],
    new Set(['upper-a']),
    notes2,
  );
  const by2 = Object.fromEntries(rows2.map((r) => [r.sessionId, r]));
  yes(rows2.length === 2, 'la fila duplicada se descarta');
  yes(by2['upper-a']?.status === 'changed', "'kept' + está en sessions → corregido a 'changed'");
  yes(by2['lower-a']?.status === 'kept', "'changed' + no está en sessions → corregido a 'kept'");
  yes(notes2.length === 3, `3 notas: dos correcciones y la duplicada (${notes2.length})`);

  // Topes: 12 filas y 160 caracteres por línea.
  const notes3 = [];
  const many = Array.from({ length: 15 }, (_, i) => ({ sessionId: `s${i}`, status: 'kept', line: 'x'.repeat(300) }));
  const rows3 = reconcile(many, [], new Set(), notes3);
  yes(rows3.length === 12, `weekSummary recortado a 12 filas (${rows3.length})`);
  yes(rows3.every((r) => r.line.length <= 160), 'y cada línea a 160 caracteres');
  yes(notes3.some((n) => /15 filas/.test(n)), 'con la nota del recorte');

  // Un status inventado no rompe la fila: se degrada a 'kept' y se anota.
  const notes4 = [];
  const rows4 = reconcile([{ sessionId: 'a', status: 'reescrita', line: 'x' }], [], new Set(), notes4);
  yes(rows4[0]?.status === 'kept', "un status desconocido cae a 'kept'");
  yes(notes4.length === 1, 'y se anota');
} catch (err) {
  bad(`no se pudo ejecutar reconcileWeekSummary desde index.ts: ${err.message}`);
}

// ── 12. Config ───────────────────────────────────────────────────────────────────────
console.log('');
console.log('12. config.toml');
yes(/\[functions\.coach-weekly-review\]/.test(CONFIG), 'la función está declarada en supabase/config.toml');
const fnBlock = CONFIG.split('[functions.coach-weekly-review]')[1] || '';
yes(/verify_jwt\s*=\s*true/.test(fnBlock), 'con verify_jwt = true (igual que parse-meal-photo)');
yes(/entrypoint\s*=\s*".\/functions\/coach-weekly-review\/index\.ts"/.test(fnBlock), 'y el entrypoint correcto');

// ── 13. El corpus de reglas ──────────────────────────────────────────────────────────
console.log('');
console.log('13. rules-compact.json');
if (!existsSync(RULES_PATH)) {
  bad('existe rules-compact.json — NO existe. Lo genera scripts/build-rules-compact.mjs (incremento 7).');
} else {
  ok('existe rules-compact.json');
  let parsedRules = null;
  try { parsedRules = JSON.parse(readFileSync(RULES_PATH, 'utf8')); } catch (e) {
    bad(`rules-compact.json no es JSON válido: ${e.message}`);
  }
  if (parsedRules) {
    const list = Array.isArray(parsedRules) ? parsedRules : (parsedRules.rules || []);
    const isPlaceholder = parsedRules.placeholder === true || list.length === 0;
    if (isPlaceholder) {
      bad('rules-compact.json ES EL PLACEHOLDER (0 reglas). El prompt correría sin corpus: el ' +
          'modelo citaría Rule IDs de memoria y el saneado los descartaría todos, dejando ' +
          'decisiones sin evidencia trazable. Ejecutar `node scripts/build-rules-compact.mjs` ' +
          'ANTES de desplegar y volver a correr este test.');
    } else {
      ok(`rules-compact.json con ${list.length} reglas (no es el placeholder)`);
      yes(list.length >= 60, `el corpus trae ≥60 reglas (${list.length})`);
      yes(list.every((r) => r && typeof r.id === 'string' && typeof r.rule === 'string'),
        'toda regla tiene id y texto');
      const grades = new Set(['strong', 'moderate', 'weak_extrapolated', 'expert']);
      yes(list.every((r) => !r.evidenceLevel || grades.has(r.evidenceLevel)),
        'y los grados de evidencia son del enum del repo');
      const sha = Array.isArray(parsedRules) ? null : (parsedRules.sourceSha256 || parsedRules.rulesVersion);
      yes(!!sha, 'trae sourceSha256 para que RULES_VERSION no sea "placeholder"');
    }
  }
}

console.log('');
console.log(failed === 0
  ? '✅ Edge function del coach: patrón del SDK, sin escrituras a plans, ningún camino que deje la fila en running, ids cerrados por enum y prompt con las correcciones del audit.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
