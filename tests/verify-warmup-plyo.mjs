// Los calentamientos prescriben la aproximación UNA vez, y la pliometría no se registra como carga.
//
// Tres fallos que este test existe para impedir, los tres del 2026-09-04:
//
// 1. **Doble prescripción de aproximación.** Cada sesión traía una línea fija
//    `'Squat: bar × 10, 50% × 6, 70% × 4, 85% × 2'` mientras `renderWorkout` YA calcula la rampa
//    sola en bar → 40% → 60% → 80%, con kg reales y discos. Se veían las dos y decían cosas
//    distintas. La de `lowerB` además pedía `85% × 1`: un single pesado calentando, con dos
//    contracturas lumbares en el historial.
//
// 2. **`box-jump` con columna de carga.** Llevaba `bw: true`, que significa "peso corporal MÁS
//    lastre opcional" — correcto en dominadas, sin sentido en un salto. El 3-sep quedó registrado
//    como `0x5@6`. Julian lo detectó entrenando. Ahora esa columna mide la ALTURA del cajón, y por
//    eso NO puede entrar en el tonelaje ni en el 1RM estimado: 50 cm × 5 × 3 = 750 kg inventados.
//
// 3. **Los saltos contaban como volumen de cuádriceps.** `renderMuscleVolume` agrega por el campo
//    `muscle`, y pogos y saltos estaban como `'Quads'`: el 3-sep marcó 12 series de cuádriceps
//    cuando eran 7 (+71%).
//
// Ejecutar desde la raíz del repo: node tests/verify-warmup-plyo.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/app.js', 'utf8');
let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const eq = (got, want, m) => (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// ── Cargar PLAN de verdad, no por regex ────────────────────────────────────────
const planStart = SRC.indexOf('const RAMP_NOTE =');
const planEnd = SRC.indexOf('const MOVEMENT_PATTERNS');
if (planStart < 0 || planEnd < 0) { console.log('FAIL — no se pudo localizar PLAN'); process.exit(1); }

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(SRC.slice(planStart, planEnd) + '\nglobalThis.__PLAN = PLAN; globalThis.__RAMP = RAMP_NOTE;', ctx);
const PLAN = ctx.__PLAN;
const RAMP_NOTE = ctx.__RAMP;

const SESSIONS = Object.keys(PLAN.sessions);
eq(SESSIONS.length, 9, 'las 9 sesiones del plan se cargan');

// ── 1. Ninguna rampa de porcentajes fija en ningún calentamiento ──────────────
{
  const offenders = [];
  for (const [id, sess] of Object.entries(PLAN.sessions)) {
    for (const item of (sess.warmup || [])) {
      if (/\d+\s*%\s*×/.test(item)) offenders.push(`${id}: "${item}"`);
    }
  }
  offenders.length === 0
    ? ok('ningún calentamiento prescribe porcentajes: la rampa automática es la única fuente')
    : bad(`quedan rampas fijas duplicando la automática → ${offenders.join(' · ')}`);

  // Y en particular el single al 85% desaparece.
  !JSON.stringify(PLAN.sessions.lowerB.warmup).includes('85%')
    ? ok('lowerB ya no pide un single al 85% calentando (historial lumbar)')
    : bad('lowerB sigue pidiendo 85% × 1 en el calentamiento');
}

// ── 2. La nota de aproximación está donde hacía falta ────────────────────────
{
  // fullA/fullB nunca se han registrado, así que NO tienen rampa automática (`previous` es el
  // último workout de esa misma sesión). Sin la nota se quedarían sin ninguna guía.
  const needRamp = ['upperA', 'lowerA', 'lowerB', 'fullA', 'fullB'];
  const missing = needRamp.filter(id => !(PLAN.sessions[id].warmup || []).includes(RAMP_NOTE));
  missing.length === 0
    ? ok(`la nota de aproximación está en las ${needRamp.length} sesiones con compuesto barra`)
    : bad(`falta la nota de aproximación en: ${missing.join(', ')}`);

  // La nota puede nombrar el TECHO (para el caso sin rampa automática), pero no puede prescribir
  // una tabla de series por porcentajes — eso era la duplicación. Y el techo que nombre tiene que
  // ser el mismo que calcula la rampa automática, o vuelven a decir cosas distintas.
  !/%\s*[×x]/.test(RAMP_NOTE)
    ? ok('la nota no prescribe series por porcentaje: no duplica la tabla de la automática')
    : bad('la nota vuelve a prescribir series por porcentaje');

  {
    const autoPcts = [...SRC.matchAll(/\{ pct: (\d+),/g)].map(m => Number(m[1]));
    const autoTop = Math.max(...autoPcts);
    const notePcts = [...RAMP_NOTE.matchAll(/(\d+)\s*%/g)].map(m => Number(m[1]));
    notePcts.length <= 1
      ? ok('la nota menciona un solo porcentaje como máximo (el techo), no una progresión')
      : bad(`la nota menciona ${notePcts.length} porcentajes: es una tabla, no un techo`);
    (notePcts.length === 0 || notePcts[0] === autoTop)
      ? ok(`el techo de la nota (${notePcts[0]}%) coincide con el de la rampa automática (${autoTop}%)`)
      : bad(`la nota dice ${notePcts[0]}% y la rampa automática topa en ${autoTop}%: contradicción`);
  }

  // upperB conserva su primer de dominadas: la rampa automática las salta porque su carga es
  // lastre y cae en el filtro `topWeight <= bar`.
  JSON.stringify(PLAN.sessions.upperB.warmup).includes('Chin-up')
    ? ok('upperB conserva el primer de dominadas, que la rampa automática no cubre')
    : bad('upperB perdió el primer de dominadas y se queda sin aproximación para ellas');
}

// ── 3. Los cuatro huecos de calentamiento, tapados ───────────────────────────
{
  const has = (id, re) => re.test(JSON.stringify(PLAN.sessions[id].warmup));

  // El hueco más grave: OHP como lift principal sin nada de posición overhead.
  for (const id of ['upperB', 'fullB']) {
    const ohp = (PLAN.sessions[id].exercises || []).some(e => e.id === 'ohp');
    if (!ohp) { bad(`${id} debería tener OHP como lift principal y no lo tiene`); continue; }
    has(id, /Wall slides|Dislocates/i)
      ? ok(`${id}: OHP es lift principal y ya tiene preparación de posición overhead`)
      : bad(`${id}: el OHP sigue entrando en frío, sin prep de overhead`);
  }

  has('lowerB', /Dead bug|bird dog/i)
    ? ok('lowerB: hay anti-extensión/bracing antes de la bisagra pesada')
    : bad('lowerB: cat-cow es movilidad, no bracing — sigue sin anti-extensión');

  has('lowerA', /[Tt]obillo|dorsiflexi/i)
    ? ok('lowerA: hay dorsiflexión de tobillo antes de la sentadilla profunda')
    : bad('lowerA: sigue sin nada de tobillo');

  has('lowerB', /lateral/i)
    ? ok('lowerB: ya tiene swings laterales, como lowerA')
    : bad('lowerB: sigue siendo el único día de pierna sin swings laterales');

  has('upperA', /external rotation/i)
    ? ok('upperA: hay rotación externa de manguito antes de 4 series de banca')
    : bad('upperA: sigue sin prep de manguito');
}

// ── 4. Pogo hops: al calentamiento. Box jump: sigue siendo ejercicio ─────────
{
  const lowerA = PLAN.sessions.lowerA;
  const ids = lowerA.exercises.map(e => e.id);

  !ids.includes('pogo-hops')
    ? ok('pogo-hops ya no es un ejercicio con columna de carga')
    : bad('pogo-hops sigue en exercises con su columna de peso sin sentido');

  /[Pp]ogo/.test(JSON.stringify(lowerA.warmup))
    ? ok('pogo-hops está en el calentamiento, con su dosis escrita (2 × 20)')
    : bad('pogo-hops desapareció del todo: la dosis de contactos no queda en ningún sitio');

  ids.includes('box-jump')
    ? ok('box-jump SIGUE siendo ejercicio registrado (ATH-002: potencia fresca, intención máxima)')
    : bad('box-jump se fue al calentamiento: pierde registro y progresión de altura');

  const bj = lowerA.exercises.find(e => e.id === 'box-jump');
  !bj.bw
    ? ok('box-jump ya no lleva `bw` (no existe el lastre en un salto)')
    : bad('box-jump sigue con bw: true → la columna seguirá diciendo "+kg"');

  // El orden importa: la potencia va primero, en fresco (INT-004 / ATH-002).
  eq(ids[0], 'box-jump', 'box-jump va primero en la sesión, en fresco');
  eq(ids[1], 'back-squat', 'la sentadilla va detrás de los saltos');
}

// ── 5. measureUnitFor + el tonelaje inventado ────────────────────────────────
{
  const i = SRC.indexOf('const _MEASURE_EXERCISES');
  const j = SRC.indexOf('// ==================== MOBILITY LIBRARY');
  if (i < 0 || j < 0) { console.log('  FAIL no se localizó _MEASURE_EXERCISES'); failed++; }
  else {
    const c2 = { console };
    vm.createContext(c2);
    vm.runInContext(`
      var activePlan = { sessions: { lowerA: { exercises: ${JSON.stringify(PLAN.sessions.lowerA.exercises)} } } };
      function dispW(w) { return w; }
      ${SRC.slice(i, j)}
      globalThis.measureUnitFor = measureUnitFor;
      globalThis.volumeForExercise = volumeForExercise;
    `, c2);

    eq(c2.measureUnitFor('box-jump'), 'cm', "measureUnitFor('box-jump') === 'cm'");
    eq(c2.measureUnitFor('back-squat'), 'null', 'la sentadilla no es una medida');

    // 3 series de 5 saltos desde un cajón de 50 cm.
    const jumps = { exerciseId: 'box-jump', sets: Array.from({ length: 3 }, () => ({ done: true, weight: 50, reps: 5 })) };
    eq(c2.volumeForExercise(jumps, 'kg'), 0, 'un cajón de 50 cm NO inyecta 750 kg de tonelaje falso');

    // La sentadilla sigue contando bien.
    const squat = { exerciseId: 'back-squat', sets: Array.from({ length: 4 }, () => ({ done: true, weight: 105, reps: 5 })) };
    eq(c2.volumeForExercise(squat, 'kg'), 2100, 'la sentadilla sigue sumando tonelaje (105 × 5 × 4)');

    // Y el factor ×2 de mancuernas no se rompe.
    const db = { exerciseId: 'incline-db-press', db: true, sets: [{ done: true, weight: 30, reps: 10 }] };
    eq(c2.volumeForExercise(db, 'kg'), 600, 'las mancuernas conservan el factor ×2 (30 × 10 × 2)');
  }
}

// ── 6. El 1RM estimado y la cabecera ─────────────────────────────────────────
{
  const guards = (SRC.match(/if \(!measureUnitFor\(ex\.(?:id|exerciseId)\)\)/g) || []).length;
  eq(guards, 2, 'las dos vistas de 1RM estimado saltan los ejercicios de medida');

  const headers = (SRC.match(/measureUnitFor\(ex\.(?:id|exerciseId)\) \|\|/g) || []).length;
  eq(headers, 2, 'las dos cabeceras de tabla de series usan la etiqueta de la medida');

  SRC.includes("if (measured) { cols[1].textContent = measured; return; }")
    ? ok('el toggle kg/lb no convierte una medida (50 cm no se vuelven 110)')
    : bad('el toggle de unidad sigue reescribiendo la cabecera de una medida');
}

// ── 7. La pliometría no es volumen de cuádriceps ─────────────────────────────
{
  SRC.includes("if (MOVEMENT_PATTERNS[ex.exerciseId] === 'plyometric') muscle = 'Power';")
    ? ok("los saltos se agregan en la fila 'Power', no como series de cuádriceps")
    : bad('los saltos siguen contando como volumen de cuádriceps (+71% el 3-sep)');

  // El PLAN conserva muscle:'Quads' a propósito: alimenta data-swap-muscle.
  const bj = PLAN.sessions.lowerA.exercises.find(e => e.id === 'box-jump');
  eq(bj.muscle, 'Quads', "box-jump mantiene muscle:'Quads' en el PLAN, para que el swap tenga alternativas");

  const mi = SRC.indexOf('const MOVEMENT_PATTERNS');
  /'box-jump':\s*'plyometric'/.test(SRC.slice(mi, mi + 4000))
    ? ok("box-jump sigue mapeado a 'plyometric', que es lo que lee el agregador")
    : bad('box-jump perdió su patrón plyometric y el agregador no lo reconocerá');

  /'pogo-hops':\s*'plyometric'/.test(SRC.slice(mi, mi + 4000))
    ? ok('pogo-hops sigue en MOVEMENT_PATTERNS: el registro del 3-sep tiene que resolverse')
    : bad('pogo-hops salió de MOVEMENT_PATTERNS y su histórico deja de resolverse');
}

// ── 8. El bump que hace que llegue al móvil ──────────────────────────────────
{
  const m = SRC.match(/const PLAN_REV = (\d+);/);
  m && Number(m[1]) >= 8
    ? ok(`PLAN_REV = ${m[1]}: el plan cambiado regenera en el móvil`)
    : bad('PLAN_REV sin subir — PLAN.sessions cambió y el móvil se quedaría con el plan viejo');
}

console.log(failed
  ? `\nFAIL — ${failed} comprobación(es) no pasan`
  : '\nPASS — una sola prescripción de aproximación, los 4 huecos tapados, y la pliometría fuera de carga y de volumen de pierna');
process.exit(failed ? 1 : 0);
