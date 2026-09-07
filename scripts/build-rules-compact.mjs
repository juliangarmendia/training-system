#!/usr/bin/env node
// ============================================================
// build-rules-compact.mjs — corpus de reglas para el prompt del coach
// ============================================================
//
// QUÉ HACE. Extrae el único bloque ```json de `research/evidence-to-rules.md` (las 70 reglas
// con su evidencia) y escribe la versión COMPACTA que consume la edge function del coach:
// `supabase/functions/coach-weekly-review/rules-compact.json`.
//
// POR QUÉ COMPACTA. El .md completo son ~90 KB: `sources`, `caveats`, `domain`, `population`
// y `applicabilityToUser` son imprescindibles para auditar una regla y completamente inútiles
// para aplicarla. Al modelo le hacen falta seis campos: qué dice la regla (`rule`), cómo está
// graduada (`evidenceLevel`, `confidence`), en qué estado energético aplica (`energyState`) y
// qué le autoriza a hacer (`programmingAction`). Con eso el bloque baja a ~24 KB (~5k tokens),
// que es lo que cabe en un prefijo cacheable de una llamada semanal.
//
// POR QUÉ UN FICHERO GENERADO Y NO UNA LECTURA EN CALIENTE. La edge function corre en Deno y
// no tiene el repo: importa el JSON con `with {type:'json'}`. Y el `sourceSha256` que se
// guarda dentro es lo que permite que `tests/verify-rules-compact.mjs` FALLE cuando el .md
// cambia y nadie regeneró el JSON — el fallo que este script existe para hacer visible es
// "el corpus del prompt desincronizado de la fuente de verdad", que es exactamente el tipo de
// desincronización silenciosa que el repo lleva meses persiguiendo.
//
// Y TAMBIÉN `app/coach-rules.js` (v11.61, incremento 9). La vista Coach tiene que poder
// escribir "Regla STR-001 (evidencia fuerte): <texto>" debajo de cada decisión: los Rule ID
// crudos en pantalla son ruido (§B.9), pero sin el texto de la regla el "por qué" del coach no
// se puede auditar desde el teléfono. Un `fetch` al JSON de la edge function no sirve —la PWA
// entrena sin conexión— así que el corpus viaja como script clásico dentro del APP_SHELL. Sólo
// `rule` y `evidenceLevel`: el resto de campos son para el modelo, no para la pantalla.
//
// Uso, desde la raíz del repo:
//   node scripts/build-rules-compact.mjs            # escribe el JSON + app/coach-rules.js
//   node scripts/build-rules-compact.mjs --check    # sólo comprueba que está al día (exit 1 si no)

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const SRC = 'research/evidence-to-rules.md';
const OUT_DIR = 'supabase/functions/coach-weekly-review';
const OUT = path.join(OUT_DIR, 'rules-compact.json');
const OUT_SHA = path.join(OUT_DIR, 'rules-compact.sha');
const OUT_JS = 'app/coach-rules.js';

// Los seis campos que viajan al prompt. El orden importa: es el orden en que se serializan y
// por tanto el que ve el modelo (id primero, acción al final: "qué regla, cómo de firme, qué
// me autoriza a hacer").
const FIELDS = ['id', 'rule', 'evidenceLevel', 'confidence', 'energyState', 'programmingAction'];
const LEVELS = new Set(['strong', 'moderate', 'weak_extrapolated', 'expert']);

const check = process.argv.includes('--check');

/** El único bloque ```json del documento. Si algún día hay dos, esto falla en vez de adivinar. */
export function extractRules(md) {
  const blocks = [...md.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  if (blocks.length !== 1) {
    throw new Error(`${SRC}: se esperaba UN bloque \`\`\`json y hay ${blocks.length}. El script no adivina cuál es el corpus.`);
  }
  const rules = JSON.parse(blocks[0][1]);
  if (!Array.isArray(rules)) throw new Error(`${SRC}: el bloque json no es un array.`);
  return rules;
}

function main() {
  const md = readFileSync(SRC, 'utf8');
  const sourceSha256 = createHash('sha256').update(md).digest('hex');
  const rules = extractRules(md);

  const ids = new Set();
  const compact = rules.map((r, i) => {
    if (!r || !r.id) throw new Error(`Regla #${i} sin \`id\`.`);
    if (ids.has(r.id)) throw new Error(`Rule ID duplicado: ${r.id}.`);
    ids.add(r.id);
    if (!r.rule) throw new Error(`${r.id}: sin \`rule\`.`);
    if (!LEVELS.has(r.evidenceLevel)) {
      throw new Error(`${r.id}: \`evidenceLevel\` "${r.evidenceLevel}" fuera del enum único del repo (${[...LEVELS].join(' | ')}).`);
    }
    // Sólo los campos que EXISTEN: un `confidence: null` en el prompt es una casilla vacía que
    // el modelo puede leer como "sin confianza" en vez de "no aplica".
    const out = {};
    for (const f of FIELDS) if (r[f] !== undefined && r[f] !== null) out[f] = r[f];
    return out;
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    source: SRC,
    sourceSha256,
    count: compact.length,
    fields: FIELDS,
    note: 'Generado por scripts/build-rules-compact.mjs desde research/evidence-to-rules.md (fuente de verdad). NO editar a mano: tests/verify-rules-compact.mjs compara ids, textos y sha.',
    rules: compact,
  };

  // Una regla por línea: sin indentar sería una sola línea de 24 KB imposible de revisar en un
  // diff, e indentado del todo pesaría ~40 KB. Esto pesa lo mismo que el minificado y se lee.
  const head = JSON.stringify(payload, (k, v) => (k === 'rules' ? undefined : v), 2).replace(/\n}$/, '');
  const body = compact.map(r => '    ' + JSON.stringify(r)).join(',\n');
  const json = `${head},\n  "rules": [\n${body}\n  ]\n}\n`;

  // ---- El corpus para la PANTALLA (app/coach-rules.js) ----
  // Script clásico, no módulo: la PWA no tiene bundler y esto se carga por <script> junto a
  // coach-facts.js. Una regla por línea por el mismo motivo que el JSON: el diff se lee.
  const jsBody = compact
    .map(r => `  ${JSON.stringify(r.id)}: { rule: ${JSON.stringify(r.rule)}, evidenceLevel: ${JSON.stringify(r.evidenceLevel)} },`)
    .join('\n');
  const js = `// ============================================================
// coach-rules.js — texto de las reglas para la vista Coach
// ============================================================
//
// GENERADO — no editar. Lo escribe scripts/build-rules-compact.mjs desde
// research/evidence-to-rules.md (fuente de verdad). Para regenerarlo:
//
//   node scripts/build-rules-compact.mjs
//
// sourceSha256: ${sourceSha256}
// count: ${compact.length}
//
// POR QUÉ EXISTE. La vista Coach escribe "Regla STR-001 (evidencia fuerte): <texto>" debajo de
// cada decisión del coach. Los Rule ID crudos en pantalla son ruido (§B.9) y el texto no puede
// venir por fetch: la app entrena sin conexión, así que el corpus va en el APP_SHELL. Sólo
// viajan \`rule\` y \`evidenceLevel\`; el resto de campos son para el prompt, no para la pantalla.
// El texto de la regla se queda en el idioma del corpus (inglés); la etiqueta de evidencia la
// traduce COACH_EVIDENCE_ES en app/coach.js.

const COACH_RULES = {
${jsBody}
};

if (typeof module !== 'undefined' && module.exports) module.exports = { COACH_RULES };
`;

  if (check) {
    if (!existsSync(OUT)) { console.error(`FALTA ${OUT}. Ejecuta: node scripts/build-rules-compact.mjs`); process.exit(1); }
    let prev = null;
    try { prev = JSON.parse(readFileSync(OUT, 'utf8')); } catch (e) { prev = null; }
    if (!prev || prev.sourceSha256 !== sourceSha256 || prev.count !== compact.length) {
      console.error(`DESINCRONIZADO: ${OUT} no corresponde al ${SRC} actual. Ejecuta: node scripts/build-rules-compact.mjs`);
      process.exit(1);
    }
    if (!existsSync(OUT_JS) || readFileSync(OUT_JS, 'utf8') !== js) {
      console.error(`DESINCRONIZADO: ${OUT_JS} no corresponde al ${SRC} actual. Ejecuta: node scripts/build-rules-compact.mjs`);
      process.exit(1);
    }
    console.log(`ok — ${OUT} y ${OUT_JS} al día (${compact.length} reglas, sha ${sourceSha256.slice(0, 12)}…)`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, json, 'utf8');
  writeFileSync(OUT_SHA, sourceSha256 + '\n', 'utf8');
  writeFileSync(OUT_JS, js, 'utf8');
  const kb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);
  const kbJs = (Buffer.byteLength(js, 'utf8') / 1024).toFixed(1);
  console.log(`${OUT} — ${compact.length} reglas, ${kb} KB`);
  console.log(`${OUT_SHA} — ${sourceSha256}`);
  console.log(`${OUT_JS} — ${compact.length} reglas, ${kbJs} KB`);
  if (Number(kb) > 25) console.warn(`AVISO: ${kb} KB por encima del objetivo de 25 KB del prefijo cacheable.`);
}

main();
