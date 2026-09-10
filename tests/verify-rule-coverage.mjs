// ¿Quién APLICA cada regla del corpus? — `consumer` en las 72 fichas.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR: **evidencia decorativa**. La auditoría del
// 2026-09-08 (R-8) encontró tres reglas totalmente huérfanas (STR-008, LONG-004, ENV-002) y
// diecinueve que no llegaban más allá de la documentación — SIETE de ellas graduadas `strong`
// (INT-002, INT-005, END-007, END-008, LOAD-002, SEL-004, LONG-001). Eso es peor que no tenerlas:
// el sistema se presenta como "evidence-based" contando 72 reglas y la mitad no toca ninguna
// decisión, así que el número no mide nada y nadie puede saber cuál sí.
//
// Y no se arregla escribiendo más reglas. Se arregla obligando a cada ficha a DECLARAR quién la
// consume, y exigiendo una explicación cuando una regla fuerte no tiene más consumidor que un
// documento. Una regla `strong` sin consumidor y sin excusa es un fallo; con la excusa escrita
// (falta el dato, falta el módulo, es una refutación y no hay nada que computar) es una decisión.
//
// Lo que el test comprueba, y por qué cada cosa:
//   1. **Toda ficha declara `consumer`** del enum. Sin el campo, la pregunta no se puede hacer.
//   2. **Toda regla `strong` con `consumer: doc|none` lleva `consumerNote`.** Es la única
//      excepción que se admite, y tiene que estar razonada por escrito.
//   3. **`consumer: validator` es VERIFICABLE**: el id de la regla aparece de verdad en los
//      `ruleIds` de algún aviso de `validatePlanVersion`. Una declaración que nadie contrasta es
//      la misma clase de mentira que el test viene a impedir, sólo en otro campo.
//   4. **`consumer: guardrail` → el id aparece en el bloque de guardarraíles del prompt**, y
//      **`consumer: prompt` → en el resto del prompt**. Mismo motivo.
//   5. **`consumer: engine` → el id aparece en el código de los motores.** Aquí la comprobación
//      es más débil a propósito: una cita en `SESSION_TYPES.evidenceTags` o en `ruleIds` de una
//      variante del plan ideal es consumo REAL (la app las lleva y las pinta) pero no es una
//      rama de código, y distinguirlas con un grep sería fingir precisión.
//   6. **Ninguna regla huérfana sin declararlo**: `consumer: none` exige `consumerNote`.
//
// Ejecutar desde la raíz del repo: node tests/verify-rule-coverage.mjs

import { readFileSync } from 'node:fs';

const SRC = 'research/evidence-to-rules.md';
const CONSUMERS = ['engine', 'validator', 'guardrail', 'prompt', 'doc', 'none'];
const NEEDS_NOTE = ['doc', 'none'];
// `coach-facts.js` entra en la lista el 2026-09-09 (F-13): el facts pack es la OTRA mitad
// determinista del coach — no decide, pero calcula, y una regla que se consume publicando un
// campo del pack (hidratación de REC-006, rendimiento de LOAD-004) se consume tanto como una
// que dispara una rama. El chequeo de `validator` sigue siendo el estricto: mira sólo dentro de
// `validatePlanVersion`.
const ENGINE_FILES = ['app/coach-engine.js', 'app/coach-facts.js', 'app/nutrition.js', 'app/app.js', 'app/bloodwork.js'];
const VALIDATOR_FILE = 'app/coach-facts.js';
const PROMPT_FILE = 'supabase/functions/coach-weekly-review/prompt.ts';
const MIN_RULES = 72;

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

// ── El bloque JSON, reparseado aquí (no se usa el script: el test no valida su propio código)
const md = readFileSync(SRC, 'utf8');
const blocks = [...md.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];

sec('La fuente de verdad');
eq(blocks.length, 1, `${SRC} tiene exactamente UN bloque \`\`\`json`);
if (blocks.length !== 1) process.exit(1);

let rules;
try { rules = JSON.parse(blocks[0][1]); } catch (e) {
  console.log(`  FAIL el bloque json no parsea: ${e.message}`);
  process.exit(1);
}
ok(Array.isArray(rules), 'el bloque es un array');
ok(rules.length >= MIN_RULES, `≥${MIN_RULES} reglas (${rules.length})`);
// El propio documento tiene que explicar el campo: un enum que sólo vive en un test es un enum
// que la siguiente persona reinventa.
ok(/\*\*`consumer`\*\*/.test(md), 'y las Convenciones del documento explican `consumer`');
for (const c of CONSUMERS) {
  ok(md.includes(`\`${c}\``) || md.includes(`${c} (`), `las Convenciones nombran '${c}'`);
}

// ── 1. Toda ficha declara `consumer` ────────────────────────────────────────────────
sec('1 · Toda ficha declara `consumer` del enum');
const sinCampo = rules.filter(r => r.consumer === undefined);
eq(sinCampo.length, 0, `ninguna ficha sin \`consumer\`${sinCampo.length ? ` — sin él: ${sinCampo.map(r => r.id).join(', ')}` : ''}`);
const fueraEnum = rules.filter(r => CONSUMERS.indexOf(r.consumer) === -1);
eq(fueraEnum.length, 0, `y ninguna con un valor fuera de {${CONSUMERS.join(', ')}}${fueraEnum.length ? ` — ${fueraEnum.map(r => `${r.id}:${r.consumer}`).join(', ')}` : ''}`);

const dist = {};
for (const r of rules) dist[r.consumer] = (dist[r.consumer] || 0) + 1;
console.log(`       distribución: ${CONSUMERS.map(c => `${c} ${dist[c] || 0}`).join(' · ')}`);
// Si TODO fuera `doc`, el test pasaría el punto 1 y no mediría nada.
ok((dist.validator || 0) + (dist.engine || 0) >= 40,
  `al menos 40 reglas con consumidor ejecutable (engine+validator = ${(dist.validator || 0) + (dist.engine || 0)})`);

// ── 2. Una regla `strong` sin consumidor ejecutable tiene que explicarse ─────────────
sec('2 · Toda regla `strong` con consumer doc|none lleva `consumerNote`');
const strongDoc = rules.filter(r => r.evidenceLevel === 'strong' && NEEDS_NOTE.indexOf(r.consumer) !== -1);
const strongSinNota = strongDoc.filter(r => !r.consumerNote || String(r.consumerNote).trim().length < 40);
eq(strongSinNota.length, 0,
  `las ${strongDoc.length} reglas \`strong\` sin consumidor ejecutable están razonadas${strongSinNota.length ? ` — sin nota (o demasiado corta): ${strongSinNota.map(r => r.id).join(', ')}` : ''}`);
if (strongDoc.length) {
  console.log(`       strong sólo-doc (declaradas y razonadas): ${strongDoc.map(r => r.id).join(', ')}`);
}
// Y las huérfanas de verdad, sea cual sea el grado.
const nones = rules.filter(r => r.consumer === 'none');
const nonesSinNota = nones.filter(r => !r.consumerNote);
eq(nonesSinNota.length, 0, `y toda \`consumer: none\` explica por qué${nonesSinNota.length ? ` — ${nonesSinNota.map(r => r.id).join(', ')}` : ''}`);
// Las tres huérfanas que la auditoría nombró: ninguna puede seguir sin consumidor declarado.
for (const id of ['STR-008', 'LONG-004', 'ENV-002']) {
  const r = rules.find(x => x.id === id);
  ok(!!r && CONSUMERS.indexOf(r.consumer) !== -1,
    `${id} (huérfana en la auditoría R-8) declara consumer: ${r ? r.consumer : '—'}`);
  if (r && NEEDS_NOTE.indexOf(r.consumer) !== -1) {
    ok(!!r.consumerNote, `   y con \`consumerNote\``);
  }
}

// ── 3. `consumer: validator` se contrasta contra el validador ───────────────────────
sec('3 · `consumer: validator` aparece de verdad en validatePlanVersion');
const facts = readFileSync(VALIDATOR_FILE, 'utf8');
const vStart = facts.indexOf('function validatePlanVersion(');
const vEnd = facts.indexOf('// ---------- helpers del validador ----------');
ok(vStart > 0 && vEnd > vStart, 'se localiza el cuerpo de validatePlanVersion');
const vBody = facts.slice(vStart, vEnd);
const vRuleIds = new Set();
for (const m of vBody.matchAll(/\[((?:'[A-Z]{3,4}-\d{3}'(?:,\s*)?)+)\]/g)) {
  for (const rid of (m[1].match(/[A-Z]{3,4}-\d{3}/g) || [])) vRuleIds.add(rid);
}
console.log(`       el validador cita ${vRuleIds.size} Rule IDs`);
const mentidas = rules.filter(r => r.consumer === 'validator' && !vRuleIds.has(r.id));
eq(mentidas.length, 0,
  `toda \`consumer: validator\` está en los ruleIds de algún aviso${mentidas.length ? ` — no está: ${mentidas.map(r => r.id).join(', ')}` : ''}`);
// Y el recíproco: una regla que el validador cita no puede declararse `doc` o `none`.
const infravaloradas = rules.filter(r => vRuleIds.has(r.id) && NEEDS_NOTE.indexOf(r.consumer) !== -1);
eq(infravaloradas.length, 0,
  `y ninguna regla que el validador cita se declara doc/none${infravaloradas.length ? ` — ${infravaloradas.map(r => `${r.id}:${r.consumer}`).join(', ')}` : ''}`);
// Cada Rule ID citado por el validador existe en el corpus: un id inventado en un aviso es un
// "Regla XXX-999" que la vista Coach no puede traducir.
const byId = new Set(rules.map(r => r.id));
const fantasmas = [...vRuleIds].filter(id => !byId.has(id));
eq(fantasmas.join(', ') || 'ninguno', 'ninguno', 'y ningún aviso cita un Rule ID que no existe');

// ── 4. `guardrail` y `prompt` se contrastan contra el prompt ─────────────────────────
sec('4 · `consumer: guardrail` / `prompt` aparecen en el prompt del coach');
const prompt = readFileSync(PROMPT_FILE, 'utf8');
const durosStart = prompt.indexOf('const DUROS');
const nuncaStart = prompt.indexOf('const NUNCA');
const corpusStart = prompt.indexOf('const CORPUS');
ok(durosStart > 0 && nuncaStart > durosStart, 'se localizan los bloques DUROS y BLANDOS');
const guardBlock = prompt.slice(durosStart, nuncaStart);
// El resto del prompt SIN el corpus: el corpus lista los 72 ids y haría pasar cualquier cosa.
const promptRest = prompt.slice(0, durosStart) + prompt.slice(nuncaStart, corpusStart > 0 ? corpusStart : undefined);
const gIds = new Set((guardBlock.match(/[A-Z]{3,4}-\d{3}/g) || []));
const pIds = new Set((promptRest.match(/[A-Z]{3,4}-\d{3}/g) || []));
console.log(`       guardarraíles citan ${gIds.size} ids · el resto del prompt, ${pIds.size}`);
const gMal = rules.filter(r => r.consumer === 'guardrail' && !gIds.has(r.id));
eq(gMal.length, 0, `toda \`consumer: guardrail\` está en el bloque de guardarraíles${gMal.length ? ` — no está: ${gMal.map(r => r.id).join(', ')}` : ''}`);
const pMal = rules.filter(r => r.consumer === 'prompt' && !pIds.has(r.id) && !gIds.has(r.id));
eq(pMal.length, 0, `toda \`consumer: prompt\` está en el prompt${pMal.length ? ` — no está: ${pMal.map(r => r.id).join(', ')}` : ''}`);

// ── 5. `engine` se contrasta contra los motores ─────────────────────────────────────
sec('5 · `consumer: engine` aparece en el código de los motores');
const engineSrc = ENGINE_FILES.map(f => { try { return readFileSync(f, 'utf8'); } catch (e) { return ''; } }).join('\n');
// LA EXCEPCIÓN, y es una sola: una regla puede consumirse a través de una SEÑAL que en el código
// lleva el id de otra regla. LONG-004 (sueño 7-8 h como objetivo de longevidad) se aplica por la
// tendencia de sueño que `computeReadinessFrom` ya construye para READ-006, y su propio caveat
// dice que comparten el objetivo accionable y que **no** se cuenten como evidencia independiente.
// Escribir "LONG-004" al lado de "READ-006" en esa línea sería justo el doble conteo que la ficha
// prohíbe. Así que se admite `consumer: engine` sin el id en el fuente CUANDO la `consumerNote`
// nombra la función que lo consume — la nota es la evidencia, y la nota es obligatoria.
const namesFn = (r) => /\b[A-Za-z_$][\w$]*\(\)/.test(String(r.consumerNote || ''));
const eMal = rules.filter(r => r.consumer === 'engine' && !new RegExp(r.id).test(engineSrc) && !namesFn(r));
eq(eMal.length, 0,
  `toda \`consumer: engine\` se cita en ${ENGINE_FILES.join(' / ')} (o su consumerNote nombra la función)${eMal.length ? ` — no está: ${eMal.map(r => r.id).join(', ')}` : ''}`);
const viaNota = rules.filter(r => r.consumer === 'engine' && !new RegExp(r.id).test(engineSrc));
if (viaNota.length) {
  console.log(`       consumidas por una señal de otra regla (nota obligatoria): ${viaNota.map(r => r.id).join(', ')}`);
  ok(viaNota.every(r => String(r.consumerNote || '').length >= 60),
    'y su consumerNote explica por qué el id no aparece en el fuente');
}

// ── 6. Las reglas nuevas de la auditoría llevan su consumidor ────────────────────────
sec('6 · Las reglas nuevas del 2026-09-08 tienen consumidor');
for (const [id, want] of [['STR-009', 'engine'], ['END-009', 'validator']]) {
  const r = rules.find(x => x.id === id);
  ok(!!r, `${id} existe en el corpus`);
  if (r) eq(r.consumer, want, `   y su consumer es '${want}'`);
}
// END-009 se estrenó con `MVPA-FLOOR`; sin ese aviso la regla sería otra ficha decorativa.
ok(/MVPA-FLOOR/.test(vBody), 'END-009 tiene su aviso: MVPA-FLOOR está en el validador');
// LONG-001 era una de las siete `strong` sólo-doc: `MVPA-FLOOR` la cita y le da consumidor.
{
  const r = rules.find(x => x.id === 'LONG-001');
  ok(!!r && r.consumer === 'validator',
    `LONG-001 (strong, sólo-doc en la auditoría) pasa a '${r ? r.consumer : '—'}': MVPA-FLOOR la cita`);
}

sec('7 · REC-006: la regla `strong` que se declaraba huérfana teniendo el campo (F-13)');
// La `consumerNote` decía "no hay campo de hidratación en ningún store" y sí lo hay:
// `hydration` / `hydrationVolume` llegan de intervals.icu y `whoop.js` los persiste desde el
// primer día. Una nota que justifica la orfandad con un hecho falso es peor que la orfandad:
// cierra la pregunta. El test comprueba las dos mitades — la declaración y el campo.
{
  const r = rules.find(x => x.id === 'REC-006');
  ok(!!r, 'REC-006 existe en el corpus');
  if (r) {
    eq(r.consumer, 'engine', "   y su consumer es 'engine' (el pack lo publica)");
    ok(!/no hydration field/i.test(String(r.consumerNote || '')),
      '   con la nota corregida: ya no dice que no exista el campo');
    ok(/hydration7/.test(String(r.consumerNote || '')), '   y nombra el campo del pack (hydration7)');
  }
  const packSrc = readFileSync('app/coach-facts.js', 'utf8');
  ok(/hydration7/.test(packSrc), 'y `facts.readiness.hydration7` existe de verdad en el pack');
  ok(/hydrationVolume/.test(packSrc), '   leyendo `hydrationVolume` del store de wellness');
}

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
