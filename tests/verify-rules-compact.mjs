// El corpus del prompt del coach, contrastado con la fuente de verdad.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR. `research/evidence-to-rules.md` es "la única
// fuente de verdad de reglas" (lo dice su primera línea) y el coach de producción NO lo lee:
// lee `supabase/functions/coach-weekly-review/rules-compact.json`, un fichero generado que
// vive en otro directorio y que Deno importa como JSON. En cuanto esas dos cosas se separan,
// el sistema entero miente sin avisar:
//
//   · Se corrige el texto de una regla en el .md (como pasó con GEN-001, reatribuida y
//     degradada a `expert` en la auditoría del 16-ago) y el prompt sigue citando la versión
//     vieja durante semanas. El coach cree estar aplicando evidencia y aplica un texto retirado.
//   · Se añade una regla nueva y el modelo nunca la ve, así que "cita Rule IDs" produce citas
//     de un corpus incompleto.
//   · Alguien edita el JSON a mano para "arreglar" una regla: el .md deja de ser la fuente de
//     verdad y nadie se enteraría, porque el JSON es lo que se despliega.
//   · Un `evidenceLevel` fuera del enum del repo ("moderada-alta", "medium") convierte el
//     grado de evidencia en texto libre, y con él la honestidad que el briefing promete.
//
// El seguro es `sourceSha256`: el JSON lleva dentro el sha del .md con el que se generó. Si el
// .md cambia y nadie ejecuta `node scripts/build-rules-compact.mjs`, este test FALLA.
//
// Ejecutar desde la raíz del repo: node tests/verify-rules-compact.mjs

import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SRC = 'research/evidence-to-rules.md';
const OUT = 'supabase/functions/coach-weekly-review/rules-compact.json';
const SHA_FILE = 'supabase/functions/coach-weekly-review/rules-compact.sha';
const MIN_RULES = 70;
const LEVELS = ['strong', 'moderate', 'weak_extrapolated', 'expert'];

let fail = 0;
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); if (!c) fail++; };
const eq = (got, want, m) => ok(String(got) === String(want), `${m}${String(got) === String(want) ? '' : ` — esperaba ${want}, obtuve ${got}`}`);
const sec = (t) => console.log(`\n=== ${t} ===`);

// ── El .md: se re-parsea aquí, sin usar el script, para que el test no valide su propio código.
const md = readFileSync(SRC, 'utf8');
const blocks = [...md.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];

sec('Fuente de verdad');
eq(blocks.length, 1, 'evidence-to-rules.md tiene exactamente UN bloque ```json');
if (blocks.length !== 1) process.exit(1);

let source;
try { source = JSON.parse(blocks[0][1]); } catch (e) {
  console.log(`  FAIL el bloque json de ${SRC} no parsea: ${e.message}`);
  process.exit(1);
}
ok(Array.isArray(source), 'el bloque es un array');
ok(source.length >= MIN_RULES, `el corpus tiene ≥${MIN_RULES} reglas (tiene ${source.length})`);

sec('El JSON generado existe y está al día');
ok(existsSync(OUT), `${OUT} existe`);
if (!existsSync(OUT)) {
  console.log('  → ejecuta: node scripts/build-rules-compact.mjs');
  process.exit(1);
}
const gen = JSON.parse(readFileSync(OUT, 'utf8'));
ok(gen.placeholder !== true, 'el JSON NO es el placeholder del incremento 8 (`placeholder: true`)');

const sha = createHash('sha256').update(md).digest('hex');
eq(gen.sourceSha256, sha, 'sourceSha256 corresponde al evidence-to-rules.md actual (un JSON viejo falla aquí)');
eq(gen.count, source.length, 'count coincide con el número de reglas del .md');
eq((gen.rules || []).length, source.length, `rules[] trae las ${source.length} reglas`);
eq(gen.source, SRC, 'declara su fuente');

if (existsSync(SHA_FILE)) {
  eq(readFileSync(SHA_FILE, 'utf8').trim(), sha, 'rules-compact.sha coincide con el sha del .md');
} else {
  console.log('  ok   (sin rules-compact.sha; el sha viaja dentro del JSON)');
}

sec('Mismo set de ids, mismo texto');
const srcIds = source.map(r => r.id);
const genIds = (gen.rules || []).map(r => r.id);
eq(genIds.join(','), srcIds.join(','), 'mismos ids y en el mismo orden');
eq(new Set(genIds).size, genIds.length, 'sin ids duplicados');

const byId = new Map(source.map(r => [r.id, r]));
let textMismatch = 0, levelMismatch = 0, confMismatch = 0, actionMismatch = 0, energyMismatch = 0;
for (const r of (gen.rules || [])) {
  const s = byId.get(r.id);
  if (!s) continue;
  if (r.rule !== s.rule) { textMismatch++; if (textMismatch === 1) console.log(`       primer desajuste de texto: ${r.id}`); }
  if (r.evidenceLevel !== s.evidenceLevel) levelMismatch++;
  if ((r.confidence || null) !== (s.confidence || null)) confMismatch++;
  if ((r.programmingAction || null) !== (s.programmingAction || null)) actionMismatch++;
  if (JSON.stringify(r.energyState || null) !== JSON.stringify(s.energyState || null)) energyMismatch++;
}
eq(textMismatch, 0, 'el texto `rule` es idéntico regla por regla');
eq(levelMismatch, 0, '`evidenceLevel` idéntico regla por regla');
eq(confMismatch, 0, '`confidence` idéntico regla por regla');
eq(actionMismatch, 0, '`programmingAction` idéntico regla por regla');
eq(energyMismatch, 0, '`energyState` idéntico regla por regla');

sec('Grados válidos y campos mínimos');
const badLevels = (gen.rules || []).filter(r => LEVELS.indexOf(r.evidenceLevel) === -1);
eq(badLevels.length, 0, `evidenceLevel ∈ {${LEVELS.join(', ')}}${badLevels.length ? ` — fuera: ${badLevels.map(r => `${r.id}:${r.evidenceLevel}`).join(', ')}` : ''}`);
const badSrcLevels = source.filter(r => LEVELS.indexOf(r.evidenceLevel) === -1);
eq(badSrcLevels.length, 0, 'y el propio .md no ha inventado un grado nuevo');
eq((gen.rules || []).filter(r => !r.rule || !r.id).length, 0, 'toda regla lleva id y texto');
eq((gen.rules || []).filter(r => !r.programmingAction).length, 0, 'toda regla lleva programmingAction (es lo que autoriza al coach a actuar)');

sec('El compacto es COMPACTO (prefijo cacheable)');
const bytes = Buffer.byteLength(readFileSync(OUT, 'utf8'), 'utf8');
console.log(`       tamaño: ${(bytes / 1024).toFixed(1)} KB`);
ok(bytes <= 25 * 1024, 'el JSON pesa ≤25 KB (~5k tokens)');
const heavy = ['sources', 'caveats', 'domain', 'population', 'applicabilityToUser', 'goal'];
const leaked = (gen.rules || []).flatMap(r => Object.keys(r)).filter(k => heavy.indexOf(k) !== -1);
eq(leaked.length, 0, `los campos de auditoría (${heavy.join(', ')}) NO viajan al prompt`);

console.log(`\n${fail === 0 ? 'TODO OK' : `${fail} FALLOS`}`);
process.exit(fail === 0 ? 0 : 1);
