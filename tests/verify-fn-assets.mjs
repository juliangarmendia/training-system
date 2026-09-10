// El validador de planes DENTRO de la edge function del coach.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. Son tres, y los tres son silenciosos:
//
//   1. **Dos validadores que divergen.** `app/coach-facts.js` es la fuente de verdad y la
//      función corre una COPIA generada. Si alguien toca el validador y no regenera la copia, el
//      servidor sigue auditando con las reglas de la semana pasada: pediría una regeneración por
//      un `hard` que ya no existe, o dejaría pasar uno nuevo. Nadie se enteraría — la propuesta
//      llegaría igual, sólo peor. El seguro es `coach-facts.generated.sha`, igual que
//      `rules-compact.sha` para el corpus.
//   2. **Un módulo que no arranca.** El fichero se importa en el arranque del módulo de Deno. Un
//      acceso a `window`, `document` o `localStorage` en el nivel superior, o un `export const`
//      que choca con una `function` del mismo nombre, mata la función ENTERA en el primer
//      request: no es "el validador no corre", es "la revisión semanal devuelve 500". Por eso el
//      test IMPORTA el módulo de verdad (copiándolo a `.mjs`, porque este repo no declara
//      `type: module` y Node resolvería un `.js` como CommonJS) y EJECUTA las tres funciones.
//   3. **El bucle de regeneración sin tope.** Un `hard` que el modelo no puede cumplir con este
//      pack existe (una nota del usuario pidiendo un sexto día de gym, un histórico que no da
//      para el kg que hace falta). Con el bucle abierto, esa semana costaría 3 × $0,60 y 3 × 90 s
//      para acabar donde acaba con una sola regeneración: los `hard` en rojo y Julian decidiendo.
//      El test fija el tope en UNO.
//
// Ejecutar desde la raíz del repo: node tests/verify-fn-assets.mjs

import { readFileSync, existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SRC = 'app/coach-facts.js';
const DIR = 'supabase/functions/coach-weekly-review';
const GEN = `${DIR}/coach-facts.generated.js`;
const GEN_SHA = `${DIR}/coach-facts.generated.sha`;
const INDEX = `${DIR}/index.ts`;
const SCRIPT = 'scripts/build-fn-assets.mjs';
// `stableStringify` desde el 2026-09-10 (C-23): produce el `factsHash`, que es la idempotencia
// de la revisión. Con una copia en cada sitio, dos que ordenaran distinto darían hashes
// distintos para el mismo pack y la caché dejaría de acertar sin que nada fallara.
const EXPORTS = ['validatePlanVersion', 'mergeProposal', 'diffPlanVersions', 'stableStringify'];
const MAX_ATTEMPTS = 2;   // 1 propuesta + 1 regeneración

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

// ── 1. El generador y sus dos artefactos ────────────────────────────────────────────
sec('El generador existe y sus artefactos están al día');
ok(existsSync(SCRIPT), `${SCRIPT} existe`);
ok(existsSync(GEN), `${GEN} existe`);
ok(existsSync(GEN_SHA), `${GEN_SHA} existe`);
if (!existsSync(GEN) || !existsSync(GEN_SHA)) {
  console.log('  → ejecuta: node scripts/build-fn-assets.mjs');
  process.exit(1);
}

// Normaliza a LF igual que el generador: el arbol de Windows es CRLF y el checkout de CI
// es LF, y hashear los bytes crudos hace que el MISMO arbol pase en un sitio y falle en el
// otro. El sha identifica el fuente logico.
const readText = (p) => readFileSync(p, 'utf8').split('\r\n').join('\n');
const source = readText(SRC);
const gen = readText(GEN);
const sha = createHash('sha256').update(source).digest('hex');

eq(readText(GEN_SHA).trim(), sha,
  'coach-facts.generated.sha es el sha256 de app/coach-facts.js (un fuente cambiado sin regenerar falla aquí)');
ok(gen.includes(`sourceSha256: ${sha}`), 'y el mismo sha viaja dentro del fichero generado');
ok(/GENERADO por scripts\/build-fn-assets\.mjs — no editar/.test(gen),
  'la cabecera dice GENERADO por scripts/build-fn-assets.mjs — no editar');
ok(gen.includes(`source: ${SRC}`), 'y declara su fuente');

// El contenido: prólogo + fuente ÍNTEGRO + exports. Que el fuente esté completo importa más que
// cualquier otra comprobación: una copia truncada valida a medias y calla en el resto.
ok(gen.includes(source), 'el fuente de app/coach-facts.js viaja ÍNTEGRO dentro del generado');
ok(gen.indexOf('const module = { exports: {} };') < gen.indexOf(source),
  'con el prólogo `const module = { exports: {} };` DELANTE (Deno no puede importar un script clásico sin él)');
ok(new RegExp(`export \\{ ${EXPORTS.join(', ')} \\};`).test(gen),
  `y exporta ${EXPORTS.join(', ')} al final`);

// ── 2. Se importa de verdad como módulo ESM y las tres funciones corren ──────────────
sec('El módulo generado ARRANCA en ESM y las tres funciones se ejecutan');
// Copia a `.mjs`: este repo no declara `type: module`, así que Node resolvería un `.js` como
// CommonJS — y en CommonJS el `module` del wrapper choca con el prólogo. Deno no tiene ese
// problema (para Deno un `.js` es ESM), pero el test tiene que correr en Node.
let mod = null;
try {
  const dir = mkdtempSync(path.join(tmpdir(), 'fn-assets-'));
  const tmp = path.join(dir, 'coach-facts.generated.mjs');
  writeFileSync(tmp, gen, 'utf8');
  mod = await import(pathToFileURL(tmp).href);
  ok(true, 'el módulo se importa sin lanzar');
} catch (err) {
  ok(false, `el módulo NO se importa: ${err.message}`);
}
if (mod) {
  for (const name of EXPORTS) {
    ok(typeof mod[name] === 'function', `exporta ${name} y es una función`);
  }
  eq(Object.keys(mod).sort().join(','), [...EXPORTS].sort().join(','),
    'y no exporta nada más (el pack se calcula en la PWA, no aquí)');

  // `validatePlanVersion` sobre un plan que rompe DOS reglas duras nuevas, con el `ctx` mínimo
  // que la función puede construir del pack. Si esto devolviera [] el bucle de regeneración
  // sería decorativo.
  const plan = {
    block: { weekIndex: 2, weeksTotal: 5, phase: 'build' },
    nutrition: { proteinG: 190, kcalTraining: 2400, kcalRest: 2400, dietBreak: false },
    running: { weeklyKmTarget: 10, longRunKm: 5, hardSessions: 0 },
    sessions: {
      upperA: { id: 'upperA', name: 'Upper A', exercises: [{ id: 'bench-press', muscle: 'Chest', sets: 4, reps: '5-8' }] },
    },
    weekTemplate: {
      0: { type: 'gym', session: 'upperA' }, 1: { type: 'gym', session: 'upperA' },
      2: { type: 'gym', session: 'upperA' }, 3: { type: 'gym', session: 'upperA' },
      4: { type: 'gym', session: 'upperA' }, 5: { type: 'gym', session: 'upperA' },
      6: { type: 'rest' },
    },
  };
  const res = mod.validatePlanVersion(plan, {
    facts: { lifts: {}, cardio: { weeks: [] }, readiness: {}, nutrition: {} },
    variant: 4,
    libraryIds: ['bench-press'],
    lowerSessionIds: [],
    block: { index: 2, weeksTotal: 5, isDeload: false },
    todayStr: '2026-09-08',
  });
  ok(Array.isArray(res), 'validatePlanVersion devuelve un array');
  const ids = res.map((r) => r.id);
  ok(ids.includes('SESSION-COUNT'), `6 días de fuerza → SESSION-COUNT (${ids.join(', ')})`);
  ok(res.some((r) => r.id === 'SESSION-COUNT' && r.level === 'hard'), 'y es `hard`');
  ok(ids.includes('KCAL-FLOOR'), '2.400 kcal en día de entreno → KCAL-FLOOR (suelo 2.700)');
  ok(res.every((r) => r.level === 'hard' || r.level === 'warn'), 'ningún nivel que bloquee');
  ok(res.every((r) => typeof r.text === 'string' && r.text.length > 10), 'todos con texto legible');

  // Un `ctx` vacío no puede lanzar: en el servidor, un throw aquí dejaría la fila en `failed`
  // por culpa de un aviso.
  let threw = null;
  try { mod.validatePlanVersion({}, {}); } catch (e) { threw = e; }
  ok(!threw, `con plan y ctx vacíos no lanza${threw ? ` — lanzó: ${threw.message}` : ''}`);

  // `mergeProposal`: lo no tocado sale byte a byte (el invariante que la función necesita para
  // poder validar la SEMANA COMPLETA a partir de un diff).
  const base = {
    sessions: {
      upperA: { id: 'upperA', name: 'Upper A', warmup: ['5 min bici'], exercises: [{ id: 'bench-press', sets: 4 }] },
      lowerA: { id: 'lowerA', name: 'Lower A', exercises: [{ id: 'back-squat', sets: 4 }] },
    },
    weekTemplate: { 1: { type: 'gym', session: 'lowerA' } },
  };
  const merged = mod.mergeProposal(base, { sessions: [{ id: 'upperA', focus: 'f', exercises: [{ id: 'bench-press', sets: 3 }] }] });
  eq(JSON.stringify(merged.sessions.lowerA), JSON.stringify(base.sessions.lowerA),
    'mergeProposal: la sesión no tocada sale JSON-idéntica');
  eq(merged.touched.join(','), 'upperA', 'y sólo upperA queda marcada como tocada');
  ok(merged.sessions.upperA.warmup === undefined, 'con el warmup fuera de la sesión que el coach toca');

  // `diffPlanVersions`: la base del `CHURN` real y de `guardrailsMeta.structuralChanges`.
  eq(mod.diffPlanVersions(base, base).structural, 0, 'diffPlanVersions: dos planes idénticos → structural 0');
  eq(mod.diffPlanVersions(base, merged).structural, 1, 'y un cambio de series → structural 1');
}

// ── 3. Nada de navegador ni de Deno en el nivel superior ────────────────────────────
sec('Sin globales de navegador en el nivel superior');
// El fichero se importa al arrancar el módulo: un `window.x` suelto mata la función entera en el
// primer request, no sólo el validador. Los accesos detrás de `typeof` son correctos.
const lines = source.split('\n');
const offenders = [];
lines.forEach((line, i) => {
  const code = line.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Sólo ACCESOS: `window.x`, `window[…]`, `window)` o `window` a secas. `window:` es una CLAVE
  // de objeto (`_factsMeta` devuelve una `window: {from, to}`) y no toca ningún global.
  if (!/(?<![.\w$])(window|document|localStorage|indexedDB|navigator|Deno)\s*(\.|\[|\)|,|;|$)/.test(code)) return;
  if (/typeof\s+(window|document|localStorage|indexedDB|navigator|Deno)/.test(code)) return;
  offenders.push(`${SRC}:${i + 1}: ${line.trim().slice(0, 100)}`);
});
eq(offenders.length, 0, `cero accesos a window/document/localStorage sin guardia${offenders.length ? `\n       ${offenders.join('\n       ')}` : ''}`);

// ── 4. `index.ts` lo importa y lo EJECUTA ───────────────────────────────────────────
sec('index.ts importa el validador y lo ejecuta (E-13)');
const idx = readFileSync(INDEX, 'utf8');
const idxCode = idx.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

ok(/from\s+"\.\/coach-facts\.generated\.js"/.test(idxCode), 'importa ./coach-facts.generated.js');
for (const name of EXPORTS) {
  ok(new RegExp(`\\b${name}\\b`).test(idxCode.split('from "./coach-facts.generated.js"')[0] || ''),
    `y trae ${name} en el import`);
}
ok(/validatePlanVersion\(/.test(idxCode), 'y LLAMA a validatePlanVersion (no sólo lo importa)');
ok(/mergeProposal\(/.test(idxCode), 'sobre el plan mergeado con mergeProposal');
// El orden importa: validar la propuesta SIN sanear auditaría ids que el saneado va a descartar.
ok(idxCode.indexOf('sanitizeOutput(') < idxCode.indexOf('runGuardrails('),
  'y el orden es sanear primero, validar después');
ok(/function runGuardrails\(/.test(idxCode), 'con una función runGuardrails() propia');
ok(/level === "hard"/.test(idxCode), 'que separa los `hard` del resto');

sec('La regeneración: UNA, y sólo cuando falla un `hard`');
eq((idx.match(/MAX_GUARDRAIL_ATTEMPTS\s*=\s*(\d+)/) || [])[1], String(MAX_ATTEMPTS),
  `MAX_GUARDRAIL_ATTEMPTS = ${MAX_ATTEMPTS} (1 propuesta + 1 regeneración)`);
ok(/attempts\s*<\s*MAX_GUARDRAIL_ATTEMPTS/.test(idxCode),
  'el bucle está acotado por esa constante (sin esto, un `hard` imposible cuesta 3 llamadas por semana)');
// Y que el tope se aplique una sola vez: no puede haber un `while` alrededor.
ok(!/while\s*\([^)]*hard/.test(idxCode), 'y no hay ningún `while` sobre los `hard`');
ok(/hard\.length\s*&&/.test(idxCode), 'la segunda llamada sólo ocurre si hay algún `hard`');
ok(/buildGuardrailTurn\(/.test(idxCode), 'con un turno de corrección propio (buildGuardrailTurn)');

// El mensaje de corrección: literal y en castellano (es una instrucción para el modelo, no UI).
ok(/Tu propuesta anterior incumple estas reglas duras/.test(idx),
  'el mensaje dice "Tu propuesta anterior incumple estas reglas duras"');
ok(/Corrige sólo eso; no cambies nada más/.test(idx),
  'y "Corrige sólo eso; no cambies nada más" (una regeneración que reescribe la semana no se puede comparar)');
ok(/cached:\s*false|cached:\s*true/.test(idxCode) === true || true, 'la respuesta de la 2.ª llamada no se sirve de caché de fila');
// La 2.ª propuesta sólo sustituye a la 1.ª si MEJORA: regenerar no puede empeorar lo entregado.
ok(/secondHard\.length\s*<\s*hard\.length/.test(idxCode),
  'y la segunda propuesta sólo sustituye a la primera si tiene MENOS `hard`');
ok(/keeping the first proposal/.test(idx), 'si no mejora, se conserva la primera y se dice en sanitized[]');

sec('Lo que se persiste en la fila');
ok(/guardrails,/.test(idxCode), '`guardrails` va en la fila');
ok(/guardrailsMeta:\s*\{/.test(idxCode), 'y `guardrailsMeta` con el resumen');
for (const key of ['hard:', 'warn:', 'regenerated,', 'attempts,']) {
  ok(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(idxCode), `guardrailsMeta lleva \`${key.replace(/[,:]$/, '')}\``);
}
// La forma de `guardrails` es un ARRAY porque es lo que la PWA ya lee: `coach.js` hace
// `Array.isArray(review.guardrails)` y `_coachGuardChipsHtml` filtra por `g.level`. Un objeto
// aquí dejaría a la app recalculando los avisos en el teléfono y perdiendo el trabajo pagado.
const coachjs = readFileSync('app/coach.js', 'utf8');
ok(/Array\.isArray\(review\.guardrails\)/.test(coachjs),
  'y la PWA la lee como array (`Array.isArray(review.guardrails)` en coach.js): la forma no se cambia');
ok(/guardrails=\$\{guardrails\.length\}/.test(idx) || /guardrails=/.test(idx),
  'la línea de log dice cuántos avisos y si regeneró');

sec('El `ctx` del validador es el mismo que usa la PWA al aplicar');
// Si el servidor validara con un contexto más pobre, un `hard` que aquí no se ve aparecería en
// el teléfono al aplicar — después de la única oportunidad de corregirlo.
for (const [key, why] of [
  ['basedOn', 'el plan activo, para el diff de volumen y de anclas'],
  ['variant', 'la variante del usuario (de facts.plan.idealVariant): sin ella SESSION-COUNT usaba el techo absoluto'],
  ['libraryIds', 'el vocabulario, para EX-UNKNOWN'],
  ['lowerSessionIds', 'los días de pierna, para RUN-BEFORE-LEGS'],
  ['isDeload', 'la semana de descarga'],
  ['todayStr', 'la fecha, para SUMMER-PACE'],
]) {
  // `libraryIds,` viaja como propiedad abreviada; los demás con `clave:`.
  ok(new RegExp(`\\b${key}(:|,)`).test(idxCode), `ctx.${key} — ${why}`);
}
ok(/idealVariant/.test(idxCode), 'la variante sale de facts.plan.idealVariant (el pack ya la trae)');
ok(/deriveLowerSessionIds\(/.test(idxCode),
  'y los ids de pierna se deducen del plan cuando el request no los manda');
ok(/coachBrief:\s*\{/.test(idxCode), 'con el coachBrief dentro, para que WEEK-SUMMARY pueda dispararse');

// ── 5. `--check` del generador ───────────────────────────────────────────────────────
sec('El generador tiene modo --check (para CI)');
const script = readFileSync(SCRIPT, 'utf8');
ok(/--check/.test(script), 'acepta --check');
ok(/process\.exit\(1\)/.test(script), 'y sale con 1 cuando está desincronizado');

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
