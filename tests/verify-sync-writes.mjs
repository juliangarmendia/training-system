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
const COACHJS = readFileSync('app/coach.js', 'utf8');

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
    store: 'settings', src: APP, n: 10,
    motivo: 'borrador de entreno en curso y de movilidad (se escriben en cada serie: ' +
            'sincronizarlos inundaría la cola), restauración de backup, 6 flags de migración ' +
            '(el sexto, v11.57: re-anclaje del bloque al 7-sep) y el flag del backfill. Un flag sincronizado haría que otro dispositivo se ' +
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
  {
    store: 'settings', src: COACHJS, n: 1,
    motivo: "'coachReadoutSeen' (v11.57): la lectura del coach ya vista. Es estado de INTERFAZ " +
            'de este dispositivo, no dato de usuario. Sincronizarlo haría que descartarla en el ' +
            'móvil la borrase en la web antes de leerla, y encolaría una escritura por sesión.',
  },
  {
    store: 'coach_reviews', src: COACHJS, n: 3,
    motivo: 'ESPEJO LOCAL de filas que escribe LA EDGE FUNCTION, no la app (v11.61). La fila de ' +
            'una revisión es del servidor: él pone `running` y luego `proposed` con la propuesta ' +
            'que cuesta $0,50-0,70. Un `smartPut` de la copia `running` la encolaría y el ' +
            'último-que-escribe-gana la subiría DESPUÉS del `proposed`, borrando la propuesta. ' +
            'Los tres sitios son: (1) el espejo `running` tras el 202, (2) `_coachMirror()` — el ' +
            'reflejo de la fila terminada que llega por polling o por `cached:true` —, y (3) la ' +
            'fila `failed` local cuando la invocación ni llega a la función (sin fila del ' +
            'servidor no hay nada que reflejar, y un fallo sin rastro es indistinguible de "el ' +
            'coach no dijo nada"). Las escrituras del USUARIO sobre esa misma fila —aplicar, ' +
            'rechazar, vencer— sí van con `smartPut`: ésas son suyas y tienen que llegar a la nube.',
  },
  { store: 'nutrition', src: APP, n: 1, motivo: 'restauración de backup.' },
];

for (const b of baseline) {
  const got = cuenta(b.src, new RegExp(`dbPut\\('${b.store}'`, 'g'));
  eq(got, b.n, `dbPut('${b.store}') × ${b.n}`);
}

// Los stores que NO deben tener ninguna escritura cruda en ningún fichero.
const sinCrudas = ['bodyweight', 'sessions', 'mobility_sessions', 'wellness', 'foods', 'meals',
                   'exercises', 'plans',
                   // Coach v2 (v11.55). `logDecision` es dato de usuario con tabla en Supabase:
                   // una escritura cruda repetiría el bug de `exercises` (0 filas en la nube
                   // durante meses) sobre la memoria del coach. Ojo: `pruneDecisions()` sí BORRA
                   // en local con dbDelete a propósito — la nube conserva el historial completo.
                   'decisions'];
for (const store of sinCrudas) {
  const total = [APP, SYNC, NUT, WHOOP, COACHJS]
    .reduce((acc, src) => acc + cuenta(src, new RegExp(`dbPut\\('${store}'`, 'g')), 0);
  eq(total, 0, `'${store}' no tiene ninguna escritura cruda`);
}

// `coach_reviews` es el caso raro y se comprueba por separado: NINGUNA escritura cruda fuera de
// coach.js (los tres espejos justificados arriba), y las decisiones del usuario sobre la fila
// —aplicar, rechazar, vencer— con `smartPut`. Sin esta segunda mitad, "el espejo va con dbPut"
// se convertiría en "todo va con dbPut" y el "Aplicar" del lunes no saldría del teléfono.
console.log('');
console.log('3.b coach_reviews: espejo local con dbPut, decisiones del usuario con smartPut');
for (const [nombre, src] of [['app.js', APP], ['supabase-sync.js', SYNC], ['nutrition.js', NUT], ['whoop.js', WHOOP]]) {
  eq(cuenta(src, /dbPut\('coach_reviews'/g), 0, `sin dbPut('coach_reviews') en ${nombre}`);
}
const smartCR = cuenta(COACHJS, /smartPut\('coach_reviews'/g);
yes(smartCR >= 3, `coach.js escribe con smartPut('coach_reviews') en ${smartCR} sitios (aplicar, rechazar, vencer)`);
for (const fn of ['applyCoachProposal', 'rejectCoachProposal', '_coachExpireIfStale']) {
  const i = COACHJS.indexOf(`function ${fn}(`);
  yes(i > 0, `se localiza ${fn}()`);
  if (i < 0) continue;
  // 9000 y no 5000: `applyCoachProposal` creció con el aviso de base obsoleta (E-15), la
  // instantánea `preApply` (E-16) y las fechas de ajuste de kcal (E-18), y la escritura de la
  // fila quedó fuera de la ventana. Una ventana corta convierte "esta función encola" en
  // "esta función encola en sus primeras N líneas", que no es lo que se quiere afirmar.
  const cuerpo = COACHJS.slice(i, i + 9000);
  yes(/smartPut\('coach_reviews'/.test(cuerpo), `${fn}() escribe la fila con smartPut`);
  yes(!/dbPut\('coach_reviews'/.test(cuerpo), `${fn}() no la escribe cruda`);
}
// Y el espejo, al contrario: `_coachMirror` NUNCA puede encolar (subiría la copia del cliente
// por encima de lo que escribió el servidor).
{
  const i = COACHJS.indexOf('async function _coachMirror(');
  yes(i > 0, 'se localiza _coachMirror()');
  const cuerpo = COACHJS.slice(i, i + 1600);
  yes(/dbPut\('coach_reviews'/.test(cuerpo), '_coachMirror() refleja con dbPut');
  yes(!/smartPut/.test(cuerpo), '_coachMirror() no encola nada');
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
