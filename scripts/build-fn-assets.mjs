#!/usr/bin/env node
// ============================================================
// build-fn-assets.mjs — el validador de planes DENTRO de la edge function
// ============================================================
//
// QUÉ HACE. Copia `app/coach-facts.js` a
// `supabase/functions/coach-weekly-review/coach-facts.generated.js` envuelto en el mínimo
// necesario para que Deno lo importe como módulo ESM, y escribe el sha del fuente en
// `coach-facts.generated.sha`. Mismo patrón (y mismo seguro) que `build-rules-compact.mjs`.
//
// EL FALLO QUE ESTO EXISTE PARA ARREGLAR (auditoría 2026-09-08, E-13). `plan-v2-schema.md` y
// `coach-facts-schema.md` decían, desde el diseño, que un `hard` del validador le cuesta al
// coach UNA regeneración. No era verdad: `index.ts` sólo saneaba (topes, ids, redondeos) y los
// guardarraíles se calculaban en el teléfono, al aplicar, cuando la propuesta ya estaba escrita
// y el coste ya estaba pagado. El resultado era el peor de los dos mundos: una propuesta que
// rompe `SESSION-COUNT` o `KCAL-STEP` llegaba entera a la pantalla, en rojo, y la única salida
// era rechazarla y volver a pagar la revisión a mano. Con el validador dentro, el `hard` se
// corrige en la misma ejecución y sólo cuesta la segunda llamada cuando de verdad falla.
//
// POR QUÉ UNA COPIA GENERADA Y NO UN IMPORT. Tres cosas lo impiden y las tres son estructurales:
//   1. **`app/` no existe en el runtime de la función.** El bundle de Supabase sube el
//      directorio de la función; `../../../app/coach-facts.js` no viaja.
//   2. **`coach-facts.js` es un script CLÁSICO, no un módulo.** Lo cargan `<script>` en
//      `index.html` y `vm` en los tests, y termina en el guardia
//      `if (typeof module !== 'undefined' && module.exports)`. Deno no le puede hacer `import`
//      sin ese `module` delante — de ahí el prólogo de una línea.
//   3. **La fuente de verdad no se duplica.** Reescribir el validador en TypeScript sería un
//      segundo validador, y dos validadores divergen: el del teléfono diría `hard` donde el del
//      servidor dice `warn` y nadie sabría cuál manda. El sha en `coach-facts.generated.sha` es
//      lo que hace FALLAR a `tests/verify-fn-assets.mjs` cuando alguien toca `app/coach-facts.js`
//      y no regenera — el mismo seguro que `rules-compact.sha`.
//
// LO QUE NO SE PUEDE COLAR AQUÍ. El fichero se importa en el arranque del módulo, así que
// cualquier acceso a `window`, `document` o `localStorage` en el nivel superior mataría la
// función entera en el primer request. `coach-facts.js` sólo los toca detrás de `typeof`, y el
// test lo comprueba con un grep sobre el nivel superior.
//
// Uso, desde la raíz del repo:
//   node scripts/build-fn-assets.mjs            # escribe el .generated.js + .sha
//   node scripts/build-fn-assets.mjs --check    # exit 1 si está desincronizado

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

const SRC = 'app/coach-facts.js';
const OUT_DIR = 'supabase/functions/coach-weekly-review';
const OUT = path.join(OUT_DIR, 'coach-facts.generated.js');
const OUT_SHA = path.join(OUT_DIR, 'coach-facts.generated.sha');

// Lo único que la función necesita del fichero. `buildCoachFacts` NO: el pack se calcula en la
// PWA (una sola implementación del dedupe y de las unidades, con sus tests) y viaja en el
// request. Aquí sólo se AUDITA lo que el modelo devolvió.
const EXPORTS = ['validatePlanVersion', 'mergeProposal', 'diffPlanVersions'];

const check = process.argv.includes('--check');

export function wrap(source, sha) {
  return `// ============================================================
// coach-facts.generated.js — el validador de planes, para Deno
// ============================================================
//
// GENERADO por scripts/build-fn-assets.mjs — no editar. La fuente de verdad es
// app/coach-facts.js; esto es una copia con el prólogo que Deno necesita para importar un
// script clásico. Para regenerarlo:
//
//   node scripts/build-fn-assets.mjs
//
// sourceSha256: ${sha}
// source: ${SRC}
//
// tests/verify-fn-assets.mjs FALLA si app/coach-facts.js cambia y nadie regeneró esto: dos
// validadores divergentes (uno en el teléfono, otro en el servidor) serían peor que ninguno.

const module = { exports: {} };

${source}

// Los tres nombres se exportan como DECLARACIONES, no desestructurando \`module.exports\`:
// \`export const { validatePlanVersion } = …\` choca con la \`function validatePlanVersion\` de
// arriba ("Identifier already declared") y el módulo no compila. La comprobación de que el
// guardia \`module.exports\` de app/coach-facts.js sigue exportándolos se hace aparte, y LANZA en
// el import: si alguien quita uno de la lista de exports del fuente, la función falla al
// arrancar en vez de saltarse el validador en silencio.
for (const __name of ${JSON.stringify(EXPORTS)}) {
  if (typeof module.exports[__name] !== "function") {
    throw new Error(
      \`coach-facts.generated.js: app/coach-facts.js ya no exporta \\\`\${__name}\\\` por module.exports\`,
    );
  }
}

export { ${EXPORTS.join(', ')} };
`;
}

function main() {
  const source = readFileSync(SRC, 'utf8');
  const sha = createHash('sha256').update(source).digest('hex');
  const out = wrap(source, sha);

  if (check) {
    if (!existsSync(OUT)) {
      console.error(`FALTA ${OUT}. Ejecuta: node scripts/build-fn-assets.mjs`);
      process.exit(1);
    }
    if (readFileSync(OUT, 'utf8') !== out) {
      console.error(`DESINCRONIZADO: ${OUT} no corresponde al ${SRC} actual. Ejecuta: node scripts/build-fn-assets.mjs`);
      process.exit(1);
    }
    if (!existsSync(OUT_SHA) || readFileSync(OUT_SHA, 'utf8').trim() !== sha) {
      console.error(`DESINCRONIZADO: ${OUT_SHA}. Ejecuta: node scripts/build-fn-assets.mjs`);
      process.exit(1);
    }
    console.log(`ok — ${OUT} al día (sha ${sha.slice(0, 12)}…)`);
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT, out, 'utf8');
  writeFileSync(OUT_SHA, `${sha}\n`, 'utf8');
  const kb = (Buffer.byteLength(out, 'utf8') / 1024).toFixed(1);
  console.log(`${OUT} — ${kb} KB, exporta ${EXPORTS.join(', ')}`);
  console.log(`${OUT_SHA} — ${sha}`);
}

main();
