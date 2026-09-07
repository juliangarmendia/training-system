// Toda escritura de dato de usuario en un store sincronizado tiene que pasar por smartPut.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR, y que ya ocurrió dos veces:
//
//   1. `ensureExerciseLibrarySeeded()` usaba `dbPut('exercises', ...)` y además corría antes
//      de `initSupabase()`. `enqueueSync()` hace `if (!supabaseClient) return`, así que
//      descartaba en silencio. Resultado: `public.exercises` con 0 filas durante meses. La
//      biblioteca de ejercicios es el vocabulario que el cron semanal necesita para resolver
//      patrón de movimiento y grupo muscular; sin ella en la nube, el análisis longitudinal
//      trabaja a ciegas.
//   2. La configuración del usuario (`userSettings`: unidad, objetivos de kcal y proteína,
//      peso meta) se escribía con `dbPut` en 10 sitios y con `smartPut` en 2. Llegaba a la
//      nube sólo si se daba la ruta buena, así que el estado remoto dependía de por dónde
//      hubieras pasado.
//
// Ninguno de los dos daba error. Nada fallaba, nada avisaba: los datos simplemente no
// estaban. Es la razón de que esto sea un test y no un comentario.
//
// El test cuenta escrituras crudas por store contra una línea base DOCUMENTADA. Añadir una
// escritura cruda nueva rompe el test y obliga a justificarla aquí o a usar smartPut. No es
// análisis sintáctico —este proyecto no tiene AST a mano— pero sí una red que se dispara.
//
// Ejecutar desde la raíz del repo: node tests/verify-sync-writes.mjs

import { readFileSync } from 'node:fs';

const APP = readFileSync('app/app.js', 'utf8');
const SYNC = readFileSync('app/supabase-sync.js', 'utf8');
const NUT = readFileSync('app/nutrition.js', 'utf8');
const WHOOP = readFileSync('app/whoop.js', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (got === want ? ok(m) : bad(`${m} — esperaba ${want}, hay ${got}`));

const cuenta = (src, re) => (src.match(re) || []).length;

// ── 1. La lista de stores sincronizados ─────────────────────────────────────────────
console.log('1. Stores sincronizados');
const m = SYNC.match(/const stores = \[([^\]]*)\]/);
yes(!!m, 'se localiza la lista de stores en syncAll()');
const sincronizados = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
eq(sincronizados.length, 15, `${sincronizados.length} stores sincronizados`);
for (const s of ['foods', 'meals', 'exercises', 'plans', 'settings', 'nutrition',
                 'coach_reviews', 'decisions']) {
  yes(sincronizados.includes(s), `'${s}' está en la lista`);
}

// Y los que son locales a propósito NO deben aparecer nunca ahí: si entran sin tener tabla
// en Supabase, la cola de salida se congela (v11.28: siete semanas).
console.log('');
console.log('2. Stores deliberadamente locales');
for (const s of ['sync_queue', 'trash', 'weekly_reviews']) {
  yes(!sincronizados.includes(s), `'${s}' NO se sincroniza (sin tabla en Supabase)`);
}

// ── 3. Línea base de escrituras crudas, con su justificación ────────────────────────
//
// Cada entrada es una excepción JUSTIFICADA. Si un número no cuadra, o alguien añadió una
// escritura cruda nueva (y hay que justificarla abajo o cambiarla a smartPut), o alguien
// arregló una y toca bajar el número.
console.log('');
console.log('3. Escrituras crudas en stores sincronizados (línea base justificada)');

const baseline = [
  {
    store: 'settings', src: APP, n: 9,
    motivo: 'borrador de entreno en curso y de movilidad (se escriben en cada serie: ' +
            'sincronizarlos inundaría la cola), restauración de backup, 5 flags de migración ' +
            'y el flag del backfill. Un flag sincronizado haría que otro dispositivo se ' +
            'saltara una migración que sí necesita.',
  },
  {
    store: 'settings', src: SYNC, n: 2,
    motivo: 'contabilidad del propio sync (syncStatus, lastSyncTimestamp). Sincronizarlos ' +
            'sería un bucle de realimentación.',
  },
  {
    store: 'workouts', src: APP, n: 2,
    motivo: 'restauración local de la migración de fechas (cancela un delete encolado, así ' +
            'que la nube ya tiene la fila) y restauración de backup.',
  },
  {
    store: 'steps', src: APP, n: 2,
    motivo: 'escritura de filas que VIENEN de la nube (encolarlas las devolvería) y registro ' +
            'manual, que empuja por su propia edge function steps-ingest.',
  },
  { store: 'runs', src: APP, n: 1, motivo: 'restauración de backup.' },
  { store: 'nutrition', src: APP, n: 1, motivo: 'restauración de backup.' },
];

for (const b of baseline) {
  const got = cuenta(b.src, new RegExp(`dbPut\\('${b.store}'`, 'g'));
  eq(got, b.n, `dbPut('${b.store}') × ${b.n}`);
}

// Los stores que NO deben tener ninguna escritura cruda en ningún fichero.
const sinCrudas = ['bodyweight', 'sessions', 'mobility_sessions', 'wellness', 'foods', 'meals',
                   'exercises', 'plans',
                   // Coach v2 (v11.55). `logDecision` y las revisiones del coach son dato de
                   // usuario con tabla en Supabase: una escritura cruda repetiría el bug de
                   // `exercises` (0 filas en la nube durante meses) sobre la memoria del coach.
                   // Ojo: `pruneDecisions()` sí BORRA en local con dbDelete a propósito — la
                   // nube conserva el historial completo.
                   'coach_reviews', 'decisions'];
for (const store of sinCrudas) {
  const total = [APP, SYNC, NUT, WHOOP]
    .reduce((acc, src) => acc + cuenta(src, new RegExp(`dbPut\\('${store}'`, 'g')), 0);
  eq(total, 0, `'${store}' no tiene ninguna escritura cruda`);
}

// ── 4. Los seeds usan smartPut ──────────────────────────────────────────────────────
console.log('');
console.log('4. Los seeds encolan');
for (const [fn, store] of [['ensurePlanSeeded', 'plans'],
                           ['ensureExerciseLibrarySeeded', 'exercises'],
                           ['seedFoods', 'foods']]) {
  const src = fn === 'seedFoods' ? NUT : APP;
  const i = src.indexOf(`function ${fn}(`);
  yes(i > 0, `se localiza ${fn}()`);
  if (i < 0) continue;
  const cuerpo = src.slice(i, i + 3000);
  yes(cuerpo.includes(`smartPut('${store}'`), `${fn}() escribe con smartPut`);
  yes(!cuerpo.includes(`dbPut('${store}'`), `${fn}() no escribe crudo`);
}

// ── 5. El backfill existe, corre tras la auth, y su flag es local ───────────────────
// Los seeds de plan y ejercicios TIENEN que correr antes de loadActivePlan(), que va mucho
// antes de la auth. Hasta v11.55 eso bastaba para perderlos: `enqueueSync` descartaba sin
// cliente (F-1). Desde v11.55 gatea por configuración y encola igual, así que el backfill
// pasa a ser SANEAMIENTO ÚNICO de los dispositivos que ya arrancaron con el bug — se queda
// una versión más y luego se borra. Su flag sigue siendo local.
console.log('');
console.log('5. Backfill post-auth de los seeds (saneamiento único)');
yes(/async function backfillSeedStoresToCloud/.test(APP), 'backfillSeedStoresToCloud() existe');
const iAuth = APP.indexOf('await checkAuth()');
const iBack = APP.indexOf('await backfillSeedStoresToCloud()');
yes(iAuth > 0 && iBack > iAuth, 'se llama DESPUÉS de checkAuth(), o no habría cliente');
const iSeedPlan = APP.indexOf('await ensurePlanSeeded()');
const iLoadPlan = APP.indexOf('await loadActivePlan()');
yes(iSeedPlan > 0 && iSeedPlan < iLoadPlan,
  'el seed del plan sigue antes de loadActivePlan() (por eso hace falta el backfill)');
yes(/dbPut\('settings', \{ key: KEY/.test(APP),
  'el flag del backfill se guarda LOCAL: sincronizarlo haría que otro dispositivo se lo saltara');
// Y la causa raíz, arreglada: el guard mira la configuración (constantes, disponibles desde
// la primera línea) y no el cliente (tardío). Detalle en tests/verify-sync-enqueue.mjs.
const iEnq = SYNC.indexOf('async function enqueueSync(');
const ENQ = SYNC.slice(iEnq, SYNC.indexOf('\n}', iEnq));
yes(/if \(!SUPABASE_URL \|\| !SUPABASE_ANON_KEY\) return;/.test(ENQ),
  'enqueueSync() gatea por configuración, no por cliente (v11.55, F-1)');
yes(!/supabaseClient/.test(ENQ),
  'enqueueSync() ya no menciona supabaseClient');

console.log('');
console.log(failed === 0
  ? '✅ Escrituras de sync: toda la configuración y los seeds llegan a la nube.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
