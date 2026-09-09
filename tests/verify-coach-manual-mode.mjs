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

console.log('');
console.log('4. La tarjeta de Home y la caducidad');
const card = body(COACH, 'async function renderCoachWeekCard(');
yes(/review\.status === 'requested'/.test(card), "renderCoachWeekCard tiene el estado 'requested'");
yes(/waiting for the manual review from Claude Code/.test(card), 'y dice que la semana está cerrada y espera a Claude Code');
yes(/id="coach-week-ask-api"/.test(card) && /on\('coach-week-ask-api'/.test(card), 'con el botón "Ask the model instead" cableado');
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
for (const k of ['MAX_SESSIONS', 'MAX_EX_PER_SESSION', 'MAX_FOCUS', 'MAX_WHY', 'MAX_SUMMARY_LINE', 'VERBOSE_LASTWEEK', 'VERBOSE_NEXTWEEK']) {
  const a = c(new RegExp(`const ${k} = (\\d+)`), SCRIPT), b = c(new RegExp(`const ${k} = (\\d+)`), INDEX);
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

console.log('');
console.log('7. El comando del repo documenta el camino nuevo');
yes(/scripts\/coach-manual-review\.mjs/.test(CMD), '.claude/commands/coach-manual-run.md apunta al script del repo');
yes(/requested/.test(CMD), 'y explica la fila requested');

console.log('');
if (failed) { console.log(`${failed} FALLOS`); process.exit(1); }
console.log('TODO OK');
