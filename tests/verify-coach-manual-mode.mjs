// Modo manual del coach (v11.69): "Cerrar la semana" sin API, y el camino manual desde la sesión.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Julian pidió poder hacer la revisión "con el API
// desde la web o desde aquí para no gastar API, debería ser lo mismo". Las formas de que NO sea lo
// mismo, todas silenciosas:
//
//   · `maybeRunWeeklyCoach` sin mirar el modo: abrir la app un lunes en modo manual dispara la
//     función igual y cuesta $0,60 sin que nadie lo pida.
//   · `runWeeklyCoach` sin el desvío: "Cerrar la semana" en modo manual llama al modelo.
//   · La fila `requested` sin `request` (currentPlan/allowed/priorReviews/lowerSessionIds): la
//     sesión tendría que reconstruir el body con otras reglas y dejaría de ser "lo mismo".
//   · La fila escrita con `dbPut` en vez de `smartPut`: se queda en el teléfono y la sesión, que
//     lee de Supabase, no la ve nunca.
//   · La tarjeta de Home sin el estado `requested`: la semana está cerrada y la pantalla dice
//     "no usable review", que es indistinguible de un fallo.
//   · El script del repo con constantes distintas a las de `index.ts` (fases, topes, cabeceras):
//     valida otro contrato que el de la función.
//   · El selector de Ajustes sin cablear: el modo existe en código y no se puede cambiar.
//
// Ejecutar desde la raíz del repo: node tests/verify-coach-manual-mode.mjs

import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const COACH = readFileSync('app/coach.js', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const HTML = readFileSync('app/index.html', 'utf8');
const INDEX = readFileSync('supabase/functions/coach-weekly-review/index.ts', 'utf8');
const SCRIPT_PATH = 'scripts/coach-manual-review.mjs';
const SCRIPT = existsSync(SCRIPT_PATH) ? readFileSync(SCRIPT_PATH, 'utf8') : '';
const CMD = existsSync('.claude/commands/coach-manual-run.md') ? readFileSync('.claude/commands/coach-manual-run.md', 'utf8') : '';

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) => (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));
// El cuerpo de una función por emparejado de llaves, empezando en el `) {` que cierra los
// parámetros (no en el primer `{`, que en `runWeeklyCoach({ weekKey, … } = {})` es el destructuring).
const body = (src, name) => {
  const i = src.indexOf(name);
  if (i === -1) return '';
  const open = src.indexOf(') {', i);
  if (open === -1) return '';
  let depth = 0, start = open + 2, j = start;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(start, j + 1);
};

console.log('1. El modo en coach.js');
yes(/function coachReviewMode\(\)/.test(COACH), 'existe coachReviewMode()');
yes(/return v === 'manual' \? 'manual' : 'api'/.test(COACH), "normaliza a 'manual' | 'api' (api por defecto)");
yes(/async function setCoachReviewMode\(mode\)/.test(COACH), 'existe setCoachReviewMode()');
yes(/coachReviewMode: v \}\);\s*\n\s*await smartPut\('settings'/.test(COACH), 'y persiste en settings con smartPut (llega a la nube)');
yes(/requested: 'requested \(manual\)'/.test(COACH), "COACH_STATUS_LABEL tiene 'requested'");

console.log('');
console.log('2. Ni el disparo automático ni "Cerrar la semana" llaman al modelo en modo manual');
const maybe = body(COACH, 'async function maybeRunWeeklyCoach()');
yes(/coachReviewMode\(\) === 'manual'/.test(maybe) && maybe.indexOf("coachReviewMode() === 'manual'") < maybe.indexOf('await runWeeklyCoach'),
  'maybeRunWeeklyCoach vuelve ANTES de runWeeklyCoach cuando el modo es manual');
const run = body(COACH, 'async function runWeeklyCoach(');
yes(/!force && !regenerate && coachReviewMode\(\) === 'manual'/.test(run), 'runWeeklyCoach desvía a la fila requested salvo regenerate/force');
yes(run.indexOf('requestManualCoachReview') < run.indexOf("functions.invoke('coach-weekly-review'"), 'y el desvío va antes de functions.invoke');

console.log('');
console.log('3. La fila `requested` es el mismo body que viajaría a la función');
const req = body(COACH, 'async function requestManualCoachReview(');
yes(req.length > 0, 'existe requestManualCoachReview()');
yes(/status: 'requested'/.test(req), "status 'requested'");
yes(/facts,\s*\n/.test(req) && /buildCoachFactsFromStores\(\{ weekKey: wk \}\)/.test(req), 'lleva el facts pack de buildCoachFactsFromStores');
for (const k of ['currentPlan: _coachCurrentPlan()', 'allowed: _coachAllowed()', 'priorReviews: _coachPriorReviews(', 'lowerSessionIds:']) {
  yes(req.includes(k), `request.${k.split(':')[0]} con la misma función que runWeeklyCoach`);
}
yes(/await smartPut\('coach_reviews', row\)/.test(req), 'se escribe con smartPut (tiene que llegar a Supabase)');
yes(/id: `\$\{wk\}#\$\{rows\.length \+ 1\}`/.test(req), 'attempt = filas de la semana + 1, la numeración de la función');
yes(/prompt: \{ model: 'manual-claude'/.test(req), "prompt.model 'manual-claude' para distinguirla");
yes(/r\.status === 'requested'/.test(req), 'no duplica: si ya hay una requested, la reutiliza');

// ── 3.b C-19 · la fila `requested`, EJECUTADA ──────────────────────────────────────
//
// EL FALLO QUE ESTA PARTE EXISTE PARA IMPEDIR. Todo lo de arriba es regex sobre el texto de
// la función: comprueba que las cadenas están escritas, no que la fila que se escribe las
// contenga. Un `if` mal puesto, un `facts` que se queda en `undefined` porque el pack falló,
// un `request` construido pero no asignado — todo eso pasa el test de arriba en verde y deja
// a la sesión del domingo sin nada que leer. Y el fallo más caro no es una cadena que falte:
// es que el camino manual escriba en `plans`. La propuesta manual pasa por `proposed` y la
// aplica Julian; si esta función tocase el plan, lo cambiaría sin que nadie lo aprobase.
//
// Así que se EJECUTA en un sandbox, con los colaboradores fingidos, y se afirma la fila.
console.log('');
console.log('3.b C-19 · requestManualCoachReview() ejecutada en un sandbox');
{
  const src = COACH.slice(COACH.indexOf('async function requestManualCoachReview('));
  const fin = src.indexOf('\n}\n');
  const lower = COACH.slice(COACH.indexOf('function _coachLowerSessionIds() {'));
  const escrituras = [];
  const crudas = [];
  const toasts = [];
  let reviews = [];
  const box = {
    console, Date,
    today: () => '2026-09-13',
    _cWeekKey: (ds) => '2026-W37',
    dbGetAll: (store) => Promise.resolve(store === 'coach_reviews' ? reviews : []),
    smartPut: (store, row) => { escrituras.push([store, row]); return Promise.resolve(); },
    dbPut: (store, row) => { crudas.push([store, row]); return Promise.resolve(); },
    toast: (m) => toasts.push(m),
    renderCoachWeekCard: () => Promise.resolve(),
    renderCoachView: () => Promise.resolve(),
    openCoachView: () => {},
    buildCoachFactsFromStores: (o) => Promise.resolve({ meta: { weekKey: o && o.weekKey, todayStr: '2026-09-13' } }),
    _coachCurrentPlan: () => ({ id: 'plan-v26', version: 26 }),
    _coachAllowed: () => ({ exercises: ['squat'] }),
    _coachPriorReviews: (rows) => rows.map((r) => r.id),
    sessionClassMap: () => ({
      lowerA: { family: 'strength', subtype: 'lower' },
      upperA: { family: 'strength', subtype: 'upper' },
      hyroxA: { family: 'hybrid', subtype: 'conditioning' },
    }),
    state: { currentView: 'home', settings: {} },
    COACH_MAX_USER_NOTE: 1200,
    COACH_APP_VERSION: 'v11.73',
  };
  vm.createContext(box);
  vm.runInContext(`${lower.slice(0, lower.indexOf('\n}\n') + 3)}\n${src.slice(0, fin + 2)}\n`
    + 'globalThis.__req = requestManualCoachReview;', box);

  const row = await box.__req({ weekKey: '2026-W37', userNote: 'la rodilla' });

  yes(!!row, 'devuelve la fila que ha escrito');
  eq(escrituras.length, 1, 'y hace UNA escritura');
  eq(crudas.length, 0, 'ninguna con dbPut (la fila es del usuario y tiene que subir)');
  if (escrituras.length) {
    const [store, r] = escrituras[0];
    eq(store, 'coach_reviews', 'al store coach_reviews');
    eq(r.status, 'requested', "status 'requested'");
    eq(r.id, '2026-W37#1', 'id = semana#intento, la numeración de la función');
    eq(r.attempt, 1, 'attempt 1 sin filas previas');
    eq(r.weekKey, '2026-W37', 'con la semana objetivo');
    yes(!!r.facts && !!r.facts.meta, 'lleva el pack de hechos, no undefined');
    eq(r.facts.meta.weekKey, '2026-W37', '…construido PARA esa semana');
    yes(!!r.request, 'lleva `request`, el resto del body que viajaría a la función');
    for (const k of ['currentPlan', 'allowed', 'priorReviews', 'lowerSessionIds']) {
      yes(r.request && Object.prototype.hasOwnProperty.call(r.request, k), `request.${k} presente`);
    }
    eq(r.request.currentPlan.version, 26, 'currentPlan es el plan vigente de verdad');
    eq((r.request.lowerSessionIds || []).sort().join(','), 'hyroxA,lowerA',
      'lowerSessionIds sale de _coachLowerSessionIds() (lower + hybrid, no upper)');
    eq(r.userNote, 'la rodilla', 'la nota del usuario viaja');
    eq(r.prompt.model, 'manual-claude', "prompt.model 'manual-claude' para distinguirla");
    eq(r.clientVersion, 'v11.73', 'y la versión del cliente que la escribió');
    yes(!!r.requestedAt && !!r.createdAt, 'con marcas de tiempo');
  }
  eq(escrituras.filter(([st]) => st === 'plans').length, 0,
    'NUNCA escribe en `plans`: la propuesta manual pasa por `proposed` y la aplica Julian');
  eq(crudas.filter(([st]) => st === 'plans').length, 0, '…ni con dbPut');
  yes(toasts.some((t) => /Week closed/.test(t)), 'y avisa de que la semana está cerrada');

  // Con una `requested` ya en la semana no duplica: reutiliza la que hay.
  escrituras.length = 0;
  toasts.length = 0;
  reviews = [{ id: '2026-W37#1', weekKey: '2026-W37', status: 'requested' }];
  const otra = await box.__req({ weekKey: '2026-W37' });
  eq(escrituras.length, 0, 'con una requested viva no escribe una segunda');
  eq(otra.id, '2026-W37#1', '…devuelve la que ya había');
  yes(toasts.some((t) => /already closed/.test(t)), '…y lo dice');

  // Con un intento anterior fallido/rechazado, el `attempt` sigue la cuenta de la función.
  escrituras.length = 0;
  reviews = [{ id: '2026-W37#1', weekKey: '2026-W37', status: 'rejected' }];
  await box.__req({ weekKey: '2026-W37' });
  eq(escrituras.length, 1, 'con la anterior rechazada sí escribe');
  eq(escrituras[0][1].id, '2026-W37#2', '…como intento 2, el mismo id que usaría la función');
}

console.log('');
console.log('4. La tarjeta de Home y la caducidad');
const card = body(COACH, 'async function renderCoachWeekCard(');
yes(/review\.status === 'requested'/.test(card), "renderCoachWeekCard tiene el estado 'requested'");
// v11.72 (V-25): el texto ya no nombra "Claude Code". Cómo se escribe la revisión es una
// interioridad del taller; lo que el usuario necesita saber es que la semana está cerrada, que
// el pack está guardado y que la propuesta aparecerá aquí.
yes(/the manual review is being written/.test(card), 'y dice que la semana está cerrada y que la revisión se está escribiendo');
// Se mira el CÓDIGO, no los comentarios: el comentario que explica qué texto se retiró tiene
// que poder citarlo.
const sinComentarios = (src) => src.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join(' ');
yes(!/Claude Code/.test(sinComentarios(card)), 'sin nombrar la herramienta en la interfaz (V-25)');
yes(!/toast\([^)]*Claude Code/.test(sinComentarios(COACH)), 'y ningún toast la nombra tampoco');
// v11.72 (V-12): los ids llevan sufijo por contenedor (Home y la vista Coach comparten tarjeta).
yes(/id="\$\{bid\('coach-week-ask-api'\)\}"/.test(card) && /on\('coach-week-ask-api'/.test(card),
  'con el botón "Ask the model instead" cableado');
yes(/force: true/.test(card.slice(card.indexOf("on('coach-week-ask-api'"))), 'que llama con force (decisión explícita de gastar)');
const expire = body(COACH, 'async function _coachExpireIfStale(');
yes(/review\.status !== 'requested'/.test(expire), 'una requested de una semana pasada caduca como una proposed');

console.log('');
console.log('5. Ajustes: el selector existe y está cableado');
yes(/id="setting-coach-review-mode"/.test(HTML), 'index.html tiene el select');
yes(/<option value="api">/.test(HTML) && /<option value="manual">/.test(HTML), 'con las opciones api y manual');
yes(/getElementById\('setting-coach-review-mode'\)/.test(APP) && /setCoachReviewMode\(s\.value\)/.test(APP), 'app.js lo guarda al cambiar');
yes(/modeEl\.value = \(typeof coachReviewMode === 'function'\) \? coachReviewMode\(\)/.test(APP), 'y lo carga en loadSettings');
yes(!/Abrir Coach/.test(HTML), 'el botón "Abrir Coach" ya está en inglés');

console.log('');
console.log('6. El script del camino manual replica las constantes de la función');
yes(SCRIPT.length > 0, `existe ${SCRIPT_PATH}`);
const c = (re, src) => { const m = src.match(re); return m ? m[1] : null; };
yes(c(/const PROMPT_VERSION = (\d+)/, SCRIPT) === c(/const PROMPT_VERSION = (\d+)/, INDEX), `PROMPT_VERSION igual que index.ts (${c(/const PROMPT_VERSION = (\d+)/, INDEX)})`);
for (const k of ['MAX_SESSIONS', 'MAX_EX_PER_SESSION', 'MAX_FOCUS', 'MAX_WHY', 'MAX_SUMMARY_LINE', 'VERBOSE_LASTWEEK', 'VERBOSE_NEXTWEEK',
  // v11.70 (C-3): los topes de SANEADO también, no sólo los de validación
  'MAX_NOTE', 'N_PRIORITIES', 'MAX_CARDIO_SLOTS', 'MAX_DECISIONS', 'MAX_TEMPLATE_CHANGES', 'MAX_REQUESTED_DATA', 'ROUND_KG', 'MAX_LASTWEEK_BULLETS', 'MAX_WEEK_SUMMARY']) {
  const a = c(new RegExp(`const ${k} = ([\\d.]+)`), SCRIPT), b = c(new RegExp(`const ${k} = ([\\d.]+)`), INDEX);
  yes(a !== null && a === b, `${k} = ${b} en los dos`);
}
yes(/"## What I am changing",\s*"## Why it changes",\s*"## Why it holds",\s*"## What I am watching",\s*"## What I need from you"/.test(INDEX)
  && /'## What I am changing', '## Why it changes', '## Why it holds', '## What I am watching', '## What I need from you'/.test(SCRIPT), 'las cinco cabeceras de nextWeek, literales, en los dos');
yes(/import\(pathToFileURL\(path\.join\(FN_DIR, 'prompt\.ts'\)\)\.href\)/.test(SCRIPT), 'importa prompt.ts tal cual (mismo SYSTEM_STATIC, mismo mensaje de usuario)');
yes(/coach-facts\.generated\.js/.test(SCRIPT) && /validatePlanVersion\(candidate, ctx\)/.test(SCRIPT), 'valida con el validador generado de la función');
yes(/lowerSessionIds: new Set\(pack\.lowerSessionIds/.test(SCRIPT) && /variant: f\?\.plan\?\.idealVariant/.test(SCRIPT), 'con el mismo ctx que runGuardrails');
yes(/status: 'proposed'/.test(SCRIPT) && /usage: \{ source: 'manual'/.test(SCRIPT) && /model: 'manual-claude'/.test(SCRIPT), 'escribe la fila proposed con las marcas manuales');
yes(!/from\('plans'\)|rest\(`plans\?[^`]*`, \{\s*method: 'POST'/.test(SCRIPT) && !/plans\?on_conflict/.test(SCRIPT), 'NUNCA escribe en plans');
yes(/Prefer: 'resolution=merge-duplicates/.test(SCRIPT) && /on_conflict=user_id,record_id/.test(SCRIPT), 'upsert idempotente por (user_id, record_id)');
try {
  const out = execFileSync(process.execPath, [SCRIPT_PATH, 'help'], { encoding: 'utf8', timeout: 20000 });
  yes(/pack\s+--week/.test(out) && /validate/.test(out) && /write/.test(out), 'help arranca sin red y lista pack/validate/write');
} catch (e) {
  bad(`help no arranca: ${e.message.split('\n')[0]}`);
}

yes(/function sanitizeLite\(raw, pack\)/.test(SCRIPT) && /Math\.round\(Number\(v\) \/ ROUND_KG\) \* ROUND_KG/.test(SCRIPT), 'el script SANEA (redondeo a ROUND_KG, topes, cardio y weekTemplateChanges) antes de validar y escribir');
yes(/const \{ output, notes: sanitizeNotes \} = sanitizeLite\(readJson\(args\.output\), pack\)/.test(SCRIPT), 'validate() usa la copia saneada (y write() escribe esa copia)');

console.log('');
console.log('6b. v11.70 · Regenerate pide la semana OBJETIVO y el modo manual retoma el polling');
yes(!/runWeeklyCoach\(\{ weekKey: _cWeekKey\(today\(\)\), (userNote: nota\.trim\(\), )?regenerate: true \}\)/.test(COACH), 'ningún Regenerate usa _cWeekKey(today()) (el domingo era la semana que muere a medianoche)');
yes((COACH.match(/runWeeklyCoach\(\{ weekKey: _cTargetWeek\(today\(\)\), (userNote: nota\.trim\(\), )?regenerate: true \}\)/g) || []).length >= 3, 'los tres Regenerate usan _cTargetWeek(today()), como "Close the week"');
const manualBranch = maybe.slice(maybe.indexOf("coachReviewMode() === 'manual'"), maybe.indexOf("coachReviewMode() === 'manual'") + 700);
yes(/pollCoachReview\(/.test(manualBranch) && manualBranch.indexOf('pollCoachReview(') < manualBranch.indexOf('return;'), 'en modo manual, una fila running se sigue vigilando antes de volver');

console.log('');
console.log('7. El comando del repo documenta el camino nuevo');
yes(/scripts\/coach-manual-review\.mjs/.test(CMD), '.claude/commands/coach-manual-run.md apunta al script del repo');
yes(/requested/.test(CMD), 'y explica la fila requested');

console.log('');
if (failed) { console.log(`${failed} FALLOS`); process.exit(1); }
console.log('TODO OK');
