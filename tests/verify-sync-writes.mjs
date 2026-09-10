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
import vm from 'node:vm';

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
    store: 'settings', src: APP, n: 9,
    motivo: 'borrador de entreno en curso y de movilidad (se escriben en cada serie: ' +
            'sincronizarlos inundaría la cola), 6 flags de migración (el sexto, v11.57: ' +
            're-anclaje del bloque al 7-sep) y el flag del backfill. Un flag sincronizado ' +
            'haría que otro dispositivo se saltara una migración que sí necesita. ' +
            'v11.73 (C-16): la restauración de backup YA NO está aquí — pasó a smartPut.',
  },
  {
    store: 'settings', src: SYNC, n: 2,
    motivo: 'contabilidad del propio sync (syncStatus, lastSyncTimestamp). Sincronizarlos ' +
            'sería un bucle de realimentación.',
  },
  {
    store: 'workouts', src: APP, n: 1,
    motivo: 'restauración local de la migración de fechas: cancela un delete encolado, así ' +
            'que la nube YA tiene la fila. v11.73 (C-16): la restauración de backup pasó a ' +
            'smartPut.',
  },
  {
    store: 'steps', src: APP, n: 1,
    motivo: 'escritura de filas que VIENEN de la nube: encolarlas las devolvería. v11.73 ' +
            '(C-15): el registro manual pasó a smartPut — el empuje por steps-ingest es ' +
            '"best effort" y su fallo sólo iba a la consola, así que un secreto caducado ' +
            'dejaba los pasos escritos a mano SÓLO en el teléfono.',
  },
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
];

for (const b of baseline) {
  const got = cuenta(b.src, new RegExp(`dbPut\\('${b.store}'`, 'g'));
  eq(got, b.n, `dbPut('${b.store}') × ${b.n}`);
}

// ── 3.a v11.73 · C-15 y C-16: las dos rutas que no tenían red ──────────────────────
//
// EL FALLO. `logStepsManual` escribía con `dbPut` y empujaba a `steps-ingest` con un
// `.then` que sólo hacía `console.warn`: con el secreto caducado, sin red o con la función
// caída, los pasos tecleados a mano se quedaban en ESTE teléfono y nadie se enteraba.
// `importBackup` es peor: un restore es justo el momento en que la copia de la nube está
// incompleta, y con `dbPut` lo restaurado no subía — la siguiente bajada podía volver a
// pisarlo con lo que hubiera en Supabase.
console.log('');
console.log('3.a C-15 · C-16: pasos a mano y restauración de backup encolan');
{
  const cuerpo = (src, firma, largo) => {
    const i = src.indexOf(firma);
    return i < 0 ? '' : src.slice(i, i + largo);
  };
  const steps = cuerpo(APP, 'async function logStepsManual(', 900);
  yes(steps.length > 0, 'se localiza logStepsManual()');
  yes(/smartPut\('steps'/.test(steps), "logStepsManual() escribe con smartPut (C-15)");
  yes(!/dbPut\('steps'/.test(steps), 'y no crudo');
  yes(/postStepsToCloud\(n\)/.test(steps), 'sigue empujando por steps-ingest (camino rápido)');

  const imp = cuerpo(APP, 'async function importBackup(', 1400);
  yes(imp.length > 0, 'se localiza importBackup()');
  for (const st of ['workouts', 'runs', 'nutrition', 'settings']) {
    yes(imp.includes(`smartPut('${st}'`), `importBackup() restaura ${st} con smartPut (C-16)`);
    yes(!imp.includes(`dbPut('${st}'`), `y no crudo (${st})`);
  }
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

// ── 6. C-8 · los dos secretos NO viajan en `settings/userSettings` ─────────────────
//
// EL FALLO QUE ESTA PARTE EXISTE PARA IMPEDIR. `settings/userSettings` se sincroniza entero
// a Supabase, y dentro iban `intervalsIcuApiKey` y `stepsSecret`. Con el secreto de pasos
// cualquiera escribe en `steps` a través de `steps-ingest`; con la API key de intervals.icu
// se lee todo el histórico del atleta. v11.70 (S-2) los quitó del BACKUP compartible; esto es
// la otra mitad, la fila.
//
// Se EJECUTA `smartPut`, no se busca la cadena: el filtro vive dentro de la función y lo que
// hay que demostrar es que el objeto que sale no lleva las claves — y que el accesor sigue
// devolviendo el valor, o el arreglo habría roto intervals.icu en silencio.
console.log('');
console.log('6. C-8 · secretos fuera de la fila sincronizada');
{
  const trozo = (firma, hasta) => {
    const i = APP.indexOf(firma);
    const j = APP.indexOf(hasta, i);
    return (i < 0 || j < 0) ? '' : APP.slice(i, j);
  };
  const src = trozo('const LOCAL_ONLY_KEYS', '// ==================== STATE');
  yes(src.length > 0, 'se localizan LOCAL_ONLY_KEYS + los accesores + smartPut');

  const store = new Map();
  const escrituras = [];
  const ctx = {
    console,
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    window: { syncedPut: (s2, d) => { escrituras.push([s2, d]); return Promise.resolve(); } },
    dbPut: (s2, d) => { escrituras.push([s2, d]); return Promise.resolve(); },
    state: { settings: { unit: 'kg', intervalsIcuApiKey: 'K3Y', stepsSecret: 'S3CR3T', goalWeight: 82 } },
  };
  vm.createContext(ctx);
  vm.runInContext(`${src}\nglobalThis.__m = { smartPut, intervalsApiKey, stepsSecret, setIntervalsApiKey, setStepsSecret, LOCAL_ONLY_KEYS };`, ctx);
  const M = ctx.__m;

  yes(Array.isArray(M.LOCAL_ONLY_KEYS) && M.LOCAL_ONLY_KEYS.includes('intervalsIcuApiKey')
    && M.LOCAL_ONLY_KEYS.includes('stepsSecret'), 'LOCAL_ONLY_KEYS lista las dos claves');

  // (a) migración perezosa: el valor que ya estaba en la fila se recupera y pasa a localStorage
  eq(M.intervalsApiKey(), 'K3Y', 'intervalsApiKey() migra el valor que ya estaba en la fila');
  eq(M.stepsSecret(), 'S3CR3T', 'stepsSecret() también');
  yes(store.size === 2, 'y quedan guardados en localStorage (2 claves)');
  yes(!('intervalsIcuApiKey' in ctx.state.settings) && !('stepsSecret' in ctx.state.settings),
    'y salen de state.settings, que es lo que se serializa');

  // (b) el objeto que smartPut escribe NUNCA lleva los secretos, ni si vuelven a la fila
  ctx.state.settings.intervalsIcuApiKey = 'OTRA';   // una bajada de Supabase con la fila vieja
  ctx.state.settings.stepsSecret = 'OTRO';
  M.smartPut('settings', { key: 'userSettings', data: ctx.state.settings });
  const [st, row] = escrituras[escrituras.length - 1];
  eq(st, 'settings', 'la escritura va al store settings');
  yes(!('intervalsIcuApiKey' in row.data), 'el objeto escrito NO lleva intervalsIcuApiKey (C-8)');
  yes(!('stepsSecret' in row.data), 'ni stepsSecret');
  eq(row.data.unit, 'kg', 'y conserva el resto de userSettings');
  eq(row.data.goalWeight, 82, 'incluido el peso objetivo');
  eq(ctx.state.settings.intervalsIcuApiKey, 'OTRA', 'sin mutar el objeto del llamador');

  // (c) otras filas de settings pasan intactas (el filtro es sólo para userSettings)
  M.smartPut('settings', { key: 'weekSchedule', data: { '2026-09-10': 'lowerA' } });
  eq(escrituras[escrituras.length - 1][1].data['2026-09-10'], 'lowerA',
    'weekSchedule viaja tal cual');

  // (d) el setter escribe en localStorage y no en la fila
  M.setIntervalsApiKey('NUEVA');
  eq(M.intervalsApiKey(), 'NUEVA', 'setIntervalsApiKey() se lee por el accesor');
  yes(!('intervalsIcuApiKey' in ctx.state.settings), 'y borra la clave de state.settings');
  M.setStepsSecret('');
  eq(M.stepsSecret(), '', 'vaciar el secreto lo borra');
}

// Y NINGÚN otro sitio lee las claves directamente: el accesor es el único lector.
for (const [nombre, src] of [['app.js', APP], ['coach.js', COACHJS], ['whoop.js', WHOOP], ['nutrition.js', NUT]]) {
  const codigo = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  eq((codigo.match(/state\.settings\.intervalsIcuApiKey/g) || []).length, 0,
    `${nombre} no lee state.settings.intervalsIcuApiKey (usa intervalsApiKey())`);
  eq((codigo.match(/state\.settings\.stepsSecret/g) || []).length, 0,
    `${nombre} no lee state.settings.stepsSecret (usa stepsSecret())`);
}
yes(/const BACKUP_REDACT_KEYS = \['stepsSecret', 'intervalsIcuApiKey'\]/.test(APP),
  'y el redactado del backup (S-2, v11.70) sigue en pie');

console.log('');
console.log(failed === 0
  ? '✅ Escrituras de sync: toda la configuración y los seeds llegan a la nube.'
  : `❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
