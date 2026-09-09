// `enqueueSync` tiene que encolar SIEMPRE que la app esté configurada para nube, aunque
// todavía no exista el cliente de Supabase.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (F-1 del audit 2026-09-05, tres incidentes ya
// sufridos con esta misma causa raíz):
//
//   1. `public.exercises` con 0 filas durante meses. `ensureExerciseLibrarySeeded()` corre
//      antes de `loadActivePlan()` (paso 8 de init()) y `initSupabase()` es el paso ~20: la
//      biblioteca de ejercicios —el vocabulario del coach— nunca salió del teléfono.
//   2. Cola de salida congelada siete semanas (2026-06-30, v11.28). El plan que escribió
//      `applyIdealPlan()` en el arranque tampoco se encoló; cuando por fin se encoló algo,
//      la tabla `plans` no existía y el `break` del drenaje bloqueó todo lo demás.
//   3. La semilla de `foods` (v11.49) iba a repetirlo; se detectó antes de desplegar y se
//      parcheó moviendo `seedFoods()` detrás de la auth — un parche por sitio de llamada,
//      no un arreglo de la causa.
//
// La causa raíz era mirar la variable equivocada: `if (!supabaseClient) return;` protege el
// caso "Supabase no configurado", que NO existe (URL y anon key son constantes hardcodeadas),
// y descarta el caso que sí ocurre (cliente aún no creado). La cola vive en IndexedDB: no
// necesita cliente. Sólo DRENAR lo necesita.
//
// Ejecutar desde la raíz del repo: node tests/verify-sync-enqueue.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SYNC = readFileSync('app/supabase-sync.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// Extrae una región de supabase-sync.js entre dos anclas textuales (la segunda no se incluye).
function slice(fromAnchor, toAnchor, label) {
  const i = SYNC.indexOf(fromAnchor);
  const j = SYNC.indexOf(toAnchor, i + fromAnchor.length);
  if (i < 0 || j < 0) { console.log(`FAIL — no se pudo extraer ${label}`); process.exit(1); }
  return SYNC.slice(i, j);
}

const CONFIG_SRC = slice('const SUPABASE_URL = ', 'let supabaseClient', 'constantes de configuración');
const ENQUEUE_SRC = slice('async function enqueueSync(', '// A queue item that can NEVER succeed',
  'enqueueSync()');

// Ejecuta enqueueSync con `supabaseClient = null` (el estado del arranque) y devuelve lo que
// llegó a dbPut. `config` permite sustituir las constantes reales por vacías.
async function encolar(config) {
  const writes = [];
  const ctx = {
    console: { log: () => {}, warn: () => {} },
    __writes: writes,
  };
  vm.createContext(ctx);
  vm.runInContext(`
    ${config}
    var supabaseClient = null;          // el estado real antes de initSupabase()
    var _n = 0;
    function uid() { return 'q' + (++_n); }
    async function dbPut(store, data) { __writes.push({ store, data }); }
    ${ENQUEUE_SRC}
    globalThis.__enqueue = enqueueSync;
  `, ctx);
  await ctx.__enqueue('plans', 'upsert', { id: 'plan_v22', label: 'test' });
  return writes;
}

// ── 1. Configurado y sin cliente → encola ───────────────────────────────────────────
console.log('1. Con URL y anon key (constantes reales), sin cliente');
const conConfig = await encolar(CONFIG_SRC);
eq(conConfig.length, 1, 'la escritura del arranque acaba en la cola');
if (conConfig.length) {
  eq(conConfig[0].store, 'sync_queue', 'va al store sync_queue');
  eq(conConfig[0].data.store, 'plans', 'conserva el store de destino');
  eq(conConfig[0].data.action, 'upsert', 'conserva la acción');
  eq(conConfig[0].data.data.id, 'plan_v22', 'conserva el registro completo');
  yes(typeof conConfig[0].data.timestamp === 'number', 'lleva timestamp (el drenaje ordena por él)');
}

// ── 2. Sin configurar → descarta ────────────────────────────────────────────────────
// El único caso que el guard debe proteger: una copia del repo sin credenciales.
console.log('');
console.log('2. Sin URL ni anon key (copia sin configurar)');
const sinConfig = await encolar("var SUPABASE_URL = ''; var SUPABASE_ANON_KEY = '';");
eq(sinConfig.length, 0, 'no encola nada (la cola crecería sin poder drenarse nunca)');

// ── 3. El gate mira la configuración, no el cliente ─────────────────────────────────
console.log('');
console.log('3. Forma del guard');
yes(/SUPABASE_URL/.test(ENQUEUE_SRC) && /SUPABASE_ANON_KEY/.test(ENQUEUE_SRC),
  'enqueueSync() nombra las dos constantes de configuración');
yes(!/supabaseClient/.test(ENQUEUE_SRC),
  'enqueueSync() ya no mira supabaseClient (la variable tardía que causó los tres incidentes)');

// ── 4. Drenar y sincronizar SÍ siguen exigiendo cliente ─────────────────────────────
// Encolar sin cliente es correcto; intentar hablar con Supabase sin cliente es un TypeError.
console.log('');
console.log('4. El drenaje conserva su guard');
const DRAIN_SRC = slice('async function drainSyncQueue() {', 'async function countSyncQueue() {',
  'drainSyncQueue()');
yes(/if \(!supabaseClient\) return;/.test(DRAIN_SRC),
  'drainSyncQueue() sigue saliendo sin cliente');
const SYNCALL_SRC = slice('async function syncAll() {', 'const lastSync', 'syncAll()');
yes(/if \(!supabaseClient \|\| !navigator\.onLine\) return;/.test(SYNCALL_SRC),
  'syncAll() sigue saliendo sin cliente / sin red');


// ── v11.70 (C-4) · la marca de agua del pull: reloj del servidor, con solapo ────────────────
console.log('');
console.log('v11.70 · _syncNextWatermark: máximo updated_at visto − 60 s, nunca el reloj del teléfono');
{
  const _yes = (c, m) => { if (c) console.log(`  ok   ${m}`); else { console.log(`  FAIL ${m}`); failed++; } };
  const i = SYNC.indexOf('function _syncNextWatermark(');
  const j = SYNC.indexOf('\n}\n', i);
  _yes(i > 0, 'existe _syncNextWatermark()');
  const c3 = {};
  vm.createContext(c3);
  vm.runInContext(`const SYNC_WATERMARK_OVERLAP_MS = 60_000;\n${SYNC.slice(i, j + 2)}\nglobalThis.__wm = _syncNextWatermark;`, c3);
  _yes(c3.__wm('2026-09-09T10:00:00.000Z', '2026-09-09T12:00:00.000Z') === '2026-09-09T11:59:00.000Z', 'con filas vistas: máximo updated_at − 60 s');
  _yes(c3.__wm('2026-09-09T10:00:00.000Z', null) === '2026-09-09T10:00:00.000Z', 'sin filas nuevas: la marca no avanza (no se pierde nada por releer)');
  _yes(c3.__wm('2026-09-09T10:00:00.000Z', '2026-09-09T10:00:30.000Z') === '2026-09-09T10:00:00.000Z', 'una fila dentro del solapo no retrocede la marca');
  _yes(c3.__wm(null, '2026-09-09T12:00:00.000Z') === '2026-09-09T11:59:00.000Z', 'primer pull: la marca es la del servidor');
  _yes(/data: _syncNextWatermark\(since, _pullMaxUpdatedAt\)/.test(SYNC), 'syncAll() escribe lastSyncTimestamp con la marca calculada');
  _yes(!/key: 'lastSyncTimestamp', data: new Date\(\)\.toISOString\(\)/.test(SYNC), 'y ya no con new Date() del teléfono');
  _yes(/_pullMaxUpdatedAt = String\(row\.updated_at\)/.test(SYNC), 'pullStore registra el máximo updated_at visto');
}

console.log('');
console.log(failed === 0
  ? '✅ enqueueSync gatea por configuración: las escrituras del arranque llegan a la nube.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
