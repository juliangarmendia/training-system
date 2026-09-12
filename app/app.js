// ============================================================
// Training App — v4.0
// ============================================================

// ==================== TRAINING PLAN DATA ====================
// v11.48 — UNA sola prescripcion de aproximacion.
// Cada sesion traia una linea fija tipo 'Squat: bar x 10, 50% x 6, 70% x 4, 85% x 2' mientras
// renderWorkout() YA calcula la rampa sola (bar -> 40% -> 60% -> 80%) con kg reales y desglose
// de discos, leyendo la serie top de la ultima vez que se hizo ESA sesion. Se veian las dos a la
// vez y decian cosas distintas. La automatica es estrictamente mejor, asi que la fija se retira.
//
// Esta nota no lleva numeros a proposito: no puede contradecir a la automatica, y cubre el caso
// en que la automatica NO aparece — `previous` es el ultimo workout de esta misma sesion, asi que
// fullA/fullB (nunca registradas) no tienen rampa y sin esto se quedarian sin ninguna guia.
//
// Retirada aparte: la linea de lowerB pedia 85% x 1. Un single pesado calentando, con dos
// contracturas lumbares en el historial, es la prescripcion equivocada. La automatica topa en 80% x 2.
const RAMP_NOTE = 'Warm-up ramp for the first compound: the app computes it below with real kg and plates. '
  + 'If it does not show (first time with this session), ramp in 3-4 sets up to ~80% of the working weight.';

const PLAN = {
  sessions: {
    upperA: {
      id: 'upperA', name: 'Upper A', subtitle: 'Horizontal Press', icon: '🏋️',
      warmup: [
        '5 min treadmill walk or light bike',
        'Band pull-aparts — 2 × 15 (scapular activation)',
        // v11.48: los pull-aparts cubren retraccion escapular, NO rotacion del manguito, y
        // detras vienen 4 series de banca a RPE 7-8. Son 60 segundos.
        'Banded external rotation — 2 × 12/side (cuff, before heavy bench)',
        'Arm circles forward/back — 1 × 10 each direction',
        'Cat-cow — 1 × 8',
        'Thoracic rotations — 2 × 8/side (T-spine prep)',
        RAMP_NOTE,
      ],
      exercises: [
        { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Main press. Full ROM, control the eccentric.', compound: true },
        { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 4, reps: '6-10', rpe: '7-8', defaultRest: 150, notes: 'Overhand grip. Strict form, no heaving.', compound: true },
        { id: 'incline-db-press', name: 'Incline DB Press', muscle: 'Chest', sets: 3, reps: '8-12', rpe: '7', defaultRest: 90, notes: '30-45° angle. 3s eccentric.', superset: 'A', db: true },
        // v11.35 (D2): Pec Deck moved to Upper B and Lat Pulldown takes its place, so
        // horizontal press and vertical pull are both trained 2x/week (STR-002). Chest
        // stays at 10 weekly sets — redistributed, not increased.
        { id: 'lat-pulldown', name: 'Lat Pulldown', muscle: 'Back', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: '2nd vertical-pull stimulus. Controlled, no swinging.', superset: 'A' },
        { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Shoulder health. Non-negotiable.', superset: 'B' },
        { id: 'lateral-raise', name: 'DB Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Light, controlled, full ROM.', superset: 'B', db: true },
        { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscle: 'Triceps', sets: 2, reps: '10-15', rpe: '7', defaultRest: 60, notes: 'Optional — skip if short on time.' },
      ]
    },
    lowerA: {
      id: 'lowerA', name: 'Lower A', subtitle: 'Squat Focus', icon: '🦵',
      warmup: [
        '5 min treadmill walk or light bike',
        'Leg swings front/back — 2 × 10/side',
        'Leg swings lateral — 1 × 10/side',
        'Hip circles — 1 × 10/side',
        // v11.48: no habia NADA de dorsiflexion antes de sentadilla profunda.
        'Ankle to wall — 2 × 10/side (dorsiflexion before squatting)',
        'Bodyweight squats — 1 × 10',
        'Glute bridges — 2 × 10 (glute activation pre-squat)',
        // v11.48: los pogos LLEGAN de `exercises`. Su proposito declarado siempre fue "prepara el
        // tendon para el salto al cajon" — es preparacion, no entrenamiento: baja amplitud, sin
        // variable de progresion, y la columna de carga que tenian no significaba nada.
        // El box jump SI se queda como ejercicio (ATH-002: potencia fresca y con intencion maxima).
        'Pogo hops — 2 × 20 (ankle only, knee nearly straight, short stiff contact; primes the tendon for the box jump)',
        RAMP_NOTE,
      ],
      exercises: [
        // PLIOMETRÍA (v11.42) — al principio, en fresco, antes de cargar nada.
        //
        // Era el hueco con mejor evidencia de todo el plan: END-007 está graduada `strong` (fuerza
        // pesada + pliometría de baja dosis mejoran la economía de carrera) y la base aeróbica es
        // una de las dos cualidades en progresión. No había NADA de esto en ninguna sesión.
        //
        // Dosis deliberadamente conservadora: ~55 contactos, dentro del rango 40-80 de ATH-001, y
        // sólo en este día para empezar (ATH-004: el tendón adapta despacio; se introduce tras la
        // base, no de golpe). INT-004: la potencia va en fresco y nunca después de aeróbico.
        // Los pogos primero porque son de baja amplitud y bajo riesgo: preparan el tendón para el
        // salto al cajón. Del cajón se BAJA caminando — la caída es donde está la lesión.
        // v11.48: `pogo-hops` se ha ido al calentamiento (sigue en la libreria y en
        // MOVEMENT_PATTERNS: el registro del 3-sep lo referencia y el historico tiene que
        // seguir resolviendose). El box jump se queda porque ATH-002 pide la potencia fresca y
        // con intencion maxima — eso es trabajo, no preparacion.
        //
        // Y pierde `bw: true`. Esa flag significa "peso corporal MAS lastre opcional", correcto
        // en dominadas o fondos; en un salto no existe la dimension de carga y la columna salia
        // como "+kg" con placeholder 0 (el 3-sep quedo registrado como 0x5@6, donde el 0 es
        // ruido). Ahora esa columna mide la ALTURA DEL CAJON en cm, que es su variable de
        // progresion real. Ver `_MEASURE_EXERCISES`.
        { id: 'box-jump', name: 'Box Jump', muscle: 'Power', sets: 3, reps: '5', rpe: '-', defaultRest: 90, notes: 'Log the BOX HEIGHT in cm in the load column. Jump with maximal intent and **STEP DOWN**, never jump down: the landing is where injuries happen. If technique degrades, end the set.' },
        { id: 'back-squat', name: 'Barbell Back Squat', muscle: 'Quads', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, notes: 'Priority #1. Use rack safeties.', compound: true },
        { id: 'rdl', name: 'Barbell RDL', muscle: 'Hamstrings', sets: 3, reps: '8-10', rpe: '7', defaultRest: 150, notes: '3 sec eccentric. Stop at mid-shin.' },
        { id: 'hack-squat', name: 'Hack Squat', muscle: 'Quads', sets: 3, reps: '10-12', rpe: '7-8', defaultRest: 120, notes: 'Quad volume, no spinal load. Controlled depth.' },
        { id: 'seated-leg-curl', name: 'Seated Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: '3s eccentric, squeeze 1s.', superset: 'A' },
        { id: 'calf-raise', name: 'Standing Calf Raise', muscle: 'Calves', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Full ROM, pause at stretch.', superset: 'A' },
        // v11.37: Cable Crunch (flexión cargada) -> Ab Wheel (anti-extensión). Lo encontró el test
        // de ATH-003 al correrlo sobre TODAS las variantes: la de 6 días —la que está viva— tenía
        // solo el Pallof de lowerB como trabajo de la regla, y las otras dos sesiones de core eran
        // flexión. Cero anti-extensión en la semana, con dos contracturas lumbares en el historial.
        // El Ab Wheel estaba aquí hasta que v6.0 lo cambió por el Cable Crunch.
        { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, notes: 'Anti-extension. From the knees; do not let the low back arch. Scale the range, not the reps.', bw: true },
      ]
    },
    upperB: {
      id: 'upperB', name: 'Upper B', subtitle: 'Pull / Press', icon: '💪',
      warmup: [
        '5 min treadmill walk or light bike',
        'Band pull-aparts — 2 × 15 (scapular activation)',
        // v11.48 — EL HUECO MAS GRAVE de los 9 calentamientos. El OHP es lift principal a
        // 4 × 5-8 @RPE 7-8 y no habia NADA de posicion overhead: ni wall slides, ni dislocates,
        // ni alcance. Es el movimiento con mas demanda de movilidad de la sesion y entraba en frio.
        // Los arm circles salen: los dislocates cubren lo mismo y mas.
        'Wall slides — 2 × 10 (overhead position before the OHP)',
        'Banded dislocates — 2 × 10 (overhead shoulder mobility)',
        'Thoracic rotations — 2 × 8/side',
        'Scapular pull-ups — 2 × 8 (lat activation pre-chinup)',
        // Se MANTIENE: la rampa automatica salta las dominadas, porque su carga es lastre y cae
        // en el filtro `topWeight <= bar`. Sin esta linea no tendrian aproximacion ninguna.
        'Chin-up: BW × 3-5 easy, or lat pulldown light × 10',
      ],
      // v11.47 — RECORTE, 7 → 5. Los tres ultimos ejercicios salian `done=false` en LAS TRES
      // sesiones de agosto (14, 22, 26): `incline-curl`, `lateral-raise-machine` y
      // `hanging-leg-raise`, cero series de nueve posibles cada uno. El 26-ago los
      // blockTimings lo dejan claro — "Superset A" duro 17 segundos: cerro la app.
      //
      // No baja el volumen real, esas series ya no ocurrian. Lo que quita es la senal de
      // sesion a medias. `incline-curl` y `lateral-raise-machine` salen. El deltoide lateral sigue
      // cubierto en Upper A (`lateral-raise`, 3 series). El BICEPS pierde todo su trabajo directo:
      // Upper A no tiene curl, asi que se queda con el indirecto de dominadas lastradas (4 series),
      // lat pulldown (3) y los dos remos (7) — suficiente en un bloque de deficit con la fuerza en
      // mantenimiento, y recuperable desde el swap de la sesion si hace falta. El core SE QUEDA pero
      // sube al principio: era lo unico que entrenaba el patron en esta sesion y moria
      // sistematicamente por ir el ultimo.
      //
      // Lower A y Upper A NO se recortan: la sesion del 3-sep (74 min, 8 de 8 ejercicios,
      // cero saltos) demuestra que ahi el problema era el tiempo disponible, no el plan.
      exercises: [
        { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, notes: 'First, not last: going last it scored 0 of 9 sets in August. Scale to bent knees if needed.', bw: true },
        { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Add weight at 4×8. Assisted pull-up machine if <5 reps.', bw: true, compound: true },
        { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Standing. Strict form, no leg drive.', compound: true },
        // v11.35 (D2): arrives from Upper A — the week's 2nd horizontal-press stimulus.
        { id: 'pec-deck', name: 'Pec Deck', muscle: 'Chest', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: '2nd chest stimulus of the week. Constant tension, squeeze 1s.' },
        { id: 'chest-supported-row', name: 'Chest-Supported Row', muscle: 'Back', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'Strict, no lower-back fatigue. Squeeze at the top. Cable Row works just as well (it is in the swap list): they are different machines, do not compare loads between them.' },
      ]
    },
    lowerB: {
      id: 'lowerB', name: 'Lower B', subtitle: 'Hinge Focus', icon: '🔥',
      warmup: [
        '5 min treadmill walk or light bike',
        'Leg swings front/back — 2 × 10/side',
        // v11.48: era el unico dia de pierna sin swings laterales, que si tiene lowerA.
        'Leg swings lateral — 1 × 10/side',
        'Hip circles — 1 × 10/side',
        'Cat-cow — 1 × 8',
        // v11.48: habia cat-cow (movilidad) pero CERO anti-extension ni bracing antes de la
        // bisagra pesada, con dos contracturas lumbares en el historial.
        'Dead bug — 2 × 8/side (anti-extension and bracing before the heavy hinge)',
        'Glute bridges — 2 × 10 (glute activation pre-hinge)',
        'Good mornings (bodyweight) — 2 × 8 (hinge pattern prep)',
        RAMP_NOTE,
      ],
      exercises: [
        { id: 'sumo-dl', name: 'Sumo Deadlift', muscle: 'Posterior', sets: 4, reps: '3-6', rpe: '7-8', defaultRest: 210, notes: 'Reset each rep from floor. First working set gates load (lumbar history).', compound: true },
        { id: 'glute-drive', name: 'Glute Drive (machine)', muscle: 'Glutes', sets: 3, reps: '8-12', rpe: '7', defaultRest: 120, notes: 'Hip-thrust machine. Full lockout, squeeze 1s.' },
        { id: 'bss', name: 'Bulgarian Split Squat', muscle: 'Quads', sets: 3, reps: '8-10/side', rpe: '7-8', defaultRest: 90, notes: 'DB in each hand, rear foot on bench.', db: true },
        { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7-8', defaultRest: 90, notes: 'Controlled 2-3 sec eccentric, squeeze top.', superset: 'A' },
        { id: 'leg-curl-b', name: 'Lying Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: '3s eccentric, squeeze 1s. Second hamstring hit.', superset: 'A' },
        { id: 'pallof-press', name: 'Cable Pallof Press', muscle: 'Core', sets: 3, reps: '10-15', rpe: '-', defaultRest: 60, notes: 'Anti-rotation. Slow and controlled.' },
      ]
    },
    // ---- T5: full-body sessions for the 3/4-day ideal variants (5/6-day use Upper/Lower) ----
    // Reuse existing library exercise ids so ensureExerciseLibrarySeeded() picks them up.
    // kg targets inherit the post-ramp baseline (the W28 re-entry loads) since the ideal
    // plan replaces the re-entry ramp directly. Lumbar caution preserved on squat/DL.
    fullA: {
      id: 'fullA', name: 'Full Body A', subtitle: 'Squat · Press · Pull', icon: '🏋️',
      warmup: [
        '5 min treadmill walk or light bike',
        'Leg swings front/back — 2 × 10/side',
        'Band pull-aparts — 2 × 15',
        'Bodyweight squats — 1 × 10',
        RAMP_NOTE,
      ],
      exercises: [
        { id: 'back-squat', name: 'Barbell Back Squat', muscle: 'Quads', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, notes: 'Target ~97.5 kg. Priority #1, use rack safeties. Conservative ramp, lumbar history.', compound: true },
        { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 3, reps: '6-8', rpe: '7-8', defaultRest: 150, notes: 'Target ~92.5 kg. Full ROM, control the eccentric.', compound: true },
        { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 3, reps: '8-10', rpe: '7-8', defaultRest: 120, notes: 'Target ~67.5 kg. Strict, no heaving.', compound: true },
        // Isquios. v11.37 puso aquí un RDL y fue un error: dejaba CUATRO compuestos de barra
        // seguidos y metía una bisagra justo después de 4 series de sentadilla pesada, apilando
        // carga axial sobre un historial de dos contracturas lumbares. El hueco que arreglaba
        // (cero isquios directos en la semana de 3/4 días) era real; la solución, no.
        // v11.38: leg curl en máquina — mismo estímulo de isquios, CERO carga axial. La extensión
        // de cadera ya la cubre el sumo de fullB, así que lo que falta aquí es flexión de rodilla.
        { id: 'seated-leg-curl', name: 'Seated Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'Hamstrings with no spinal load. 3s eccentric, squeeze 1s at the top.' },
        // Cable Crunch (flexión espinal cargada) -> Pallof (anti-rotación). ATH-003 es `strong` y
        // pide explícitamente anti-rotación/anti-extensión POR el historial lumbar; la sesión
        // hacía justo lo contrario. fullB cubre la anti-extensión con el Ab Wheel.
        { id: 'pallof-press', name: 'Cable Pallof Press', muscle: 'Core', sets: 3, reps: '10-15', rpe: '-', defaultRest: 60, notes: 'Anti-rotation. Slow and controlled, no torso rotation.' },
      ]
    },
    fullB: {
      id: 'fullB', name: 'Full Body B', subtitle: 'Hinge · OHP · Pull-up', icon: '🔥',
      warmup: [
        '5 min treadmill walk or light bike',
        'Hip circles — 1 × 10/side',
        'Glute bridges — 2 × 10',
        // v11.48: fullB tambien tiene OHP como lift principal, mismo hueco que upperB.
        'Wall slides — 2 × 10 (overhead position before the OHP)',
        'Scapular pull-ups — 2 × 8',
        RAMP_NOTE,
      ],
      exercises: [
        { id: 'sumo-dl', name: 'Sumo Deadlift', muscle: 'Posterior', sets: 3, reps: '3-6', rpe: '7-8', defaultRest: 210, notes: 'Target ~110 kg. Reset every rep. The first set gates it: if it comes in ≥RPE 8, do not add load. Lumbar history.', compound: true },
        { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 3, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Target ~52.5 kg. Standing, strict, no leg drive.', compound: true },
        { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 3, reps: '6-8', rpe: '7-8', defaultRest: 150, notes: 'Target BW +10 kg. Assisted machine if <5 reps.', bw: true, compound: true },
        // v11.38: fullB no tenía NADA de cuádriceps. En la semana de 3/4 días el cuádriceps
        // dependía enteramente de las 4 series de sentadilla de fullA, un solo día. La extensión
        // da volumen de cuádriceps sin carga espinal, justo después del sumo — y pone el
        // cuádriceps a 2 días/semana (STR-002).
        { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7-8', defaultRest: 90, notes: 'Quads with no spinal load. Controlled 2-3s eccentric, squeeze at the top.' },
        // v11.37: Hanging Leg Raise (flexión de cadera) -> Ab Wheel (anti-extensión). Con el
        // Pallof de fullA, las dos cualidades que pide ATH-003 quedan cubiertas en la semana,
        // ambas con ejercicios que la propia regla nombra.
        { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, notes: 'Anti-extension. From the knees; do not let the low back arch. Scale the range, not the reps.', bw: true },
      ]
    },

    // ---- v11.42: ACONDICIONAMIENTO HÍBRIDO — trineo + SkiErg ----
    //
    // SUSTITUYE un día de cardio, no se añade (HYB-001 lo dice literalmente: "0-1/sem, en lugar de
    // un cardio, no además"). Va en el hueco del sábado como alternativa al cardio largo.
    //
    // Por qué estas herramientas y no un metcon: el trineo es **concéntrico puro** — sin fase
    // excéntrica no hay daño muscular apreciable, así que da mucho estímulo cardiovascular y de
    // piernas con pocas agujetas y mínima interferencia con la sentadilla y con correr. Es
    // probablemente la mejor herramienta de acondicionamiento para un historial lumbar. El SkiErg
    // añade tren superior y core con impacto cero (HYB-005).
    //
    // Todos los movimientos son de BAJA SKILL a propósito (HYB-003): bajo fatiga no se hacen
    // ejercicios técnicos. Nada de olímpicos, nada de gimnásticos.
    //
    // Honestidad sobre la evidencia: la programación híbrida es lo más débil del corpus
    // (`weak_extrapolated`, no hay ensayos de HYROX). La dosis es conservadora por eso.
    hybrid1: {
      id: 'hybrid1', name: 'Hybrid · Sled + SkiErg', subtitle: 'Conditioning', icon: '🛷',
      warmup: [
        '5 min easy bike or row',
        'Hip and ankle mobility — 2 min',
        'Empty or very light sled — 2 × 20 m to find the pattern',
        'SkiErg 1 min easy',
      ],
      exercises: [
        { id: 'sled-push', name: 'Sled Push', muscle: 'Power', sets: 6, reps: '20 m', rpe: '8', defaultRest: 90, notes: 'Continuous push, torso leaning in, short powerful steps. Purely concentric: almost no soreness, so it does not interfere with legs or running. Rest = walk back.', compound: true },
        { id: 'ski-erg', name: 'SkiErg', muscle: 'Back', sets: 5, reps: '250 m', rpe: '7-8', defaultRest: 60, notes: 'Pull from the core and hips, not just the arms. Zero impact: this is what you can do hard on tired legs.', compound: true },
        { id: 'farmer-carry', name: 'Farmer Carry', muscle: 'Core', sets: 4, reps: '40 m', rpe: '8', defaultRest: 90, notes: 'Heavy, torso solid, no leaning to one side. It is anti-lateral: core and grip. If the low back complains, drop the weight — not the distance.' },
      ]
    },

    // ---- v11.42: SESIONES DE VIAJE — peso corporal, banda opcional, cero gimnasio ----
    //
    // Hasta ahora ninguna de las 4 variantes funcionaba sin rack y barra, aunque la de 3 días se
    // llamó "viaje / sin gym" hasta el 17-ago. Y resultó ser la causa real de la adherencia baja:
    // 11 sesiones en 9 semanas porque estuvo de viaje. Esto es el arreglo del problema de verdad.
    //
    // Principio de diseño clave: **cada sesión es completa por sí sola** (pierna + empuje + tirón +
    // core). En viaje no sabes si vas a hacer una o cuatro, así que ninguna puede dejar un hueco.
    // A y B se diferencian en el énfasis, no en la cobertura — misma lógica que fullA/fullB.
    //
    // La intensidad se consigue con progresión de dificultad y proximidad al fallo, no con carga:
    // sin peso externo, RPE 8 en rangos altos es lo que da estímulo real (STR-004 sigue aplicando).
    travelA: {
      id: 'travelA', name: 'Travel A', subtitle: 'Squat · Push · Vertical pull', icon: '🧳',
      warmup: [
        '3-5 min: jumping in place, arm circles, knees to chest',
        'Bodyweight squats — 1 × 15',
        'Band pull-aparts (or arm crosses) — 2 × 15',
        'Plank 20 s + glute bridge 10 reps',
      ],
      exercises: [
        { id: 'bss', name: 'Bulgarian Split Squat', muscle: 'Quads', sets: 3, reps: '10-15/leg', rpe: '8', defaultRest: 90, notes: 'Rear foot on a chair or the edge of the bed. Bodyweight alone is already hard: lower slowly (3s) and get close to failure. If reps are left over, pause 2s at the bottom.', bw: true },
        { id: 'pushup', name: 'Push-ups', muscle: 'Chest', sets: 3, reps: '10-20', rpe: '8', defaultRest: 90, notes: 'If you do >20, put your feet on the bed (decline) or lower for 3s. Progression before endless reps.', bw: true, compound: true },
        { id: 'pullups', name: 'Pull-ups', muscle: 'Back', sets: 3, reps: 'AMRAP', rpe: '8-9', defaultRest: 120, notes: 'No bar available: Band Row anchored to a door, 3×15-20. It is the hardest pattern to replicate while travelling — find a bar if you can (a park, a doorway bar).', bw: true, compound: true },
        { id: 'sl-glute-bridge', name: 'Single-Leg Glute Bridge', muscle: 'Glutes', sets: 3, reps: '12-15/leg', rpe: '8', defaultRest: 60, notes: 'Hip extension. Heel planted, drive up through the glute, pause 1s at the top. Shoulders on the floor or on the bed for more range.', bw: true },
        { id: 'bird-dog', name: 'Bird Dog', muscle: 'Core', sets: 3, reps: '8-10/side', rpe: '-', defaultRest: 45, notes: 'Anti-rotation: opposite arm and leg, without the hip opening or the low back arching. One of McGill\'s Big 3 — the source the core rule in this system comes from. Slow, 2s at the top.', bw: true },
      ]
    },
    travelB: {
      id: 'travelB', name: 'Travel B', subtitle: 'Hinge · Vertical press · Horizontal pull', icon: '🧳',
      warmup: [
        '3-5 min: jumping in place, hip circles, walking lunges',
        'Glute bridge — 2 × 12',
        'Bodyweight Romanian deadlift — 1 × 12 slow',
        'Band pull-aparts (or arm crosses) — 2 × 15',
      ],
      exercises: [
        { id: 'sl-rdl', name: 'Single-Leg RDL', muscle: 'Hamstrings', sets: 3, reps: '10-12/leg', rpe: '8', defaultRest: 90, notes: 'Hinge at the hip, not the knee. Lower slowly until you feel the hamstring, back flat. With a loaded backpack if you have one. Balance is part of the exercise.', bw: true, compound: true },
        { id: 'pike-pushup', name: 'Pike Push-up', muscle: 'Shoulders', sets: 3, reps: '6-12', rpe: '8', defaultRest: 90, notes: 'Vertical push: hips high in a V, head toward the floor between your hands. The more vertical the hips, the harder. Feet on the bed to progress.', bw: true, compound: true },
        { id: 'band-row', name: 'Band Row', muscle: 'Back', sets: 3, reps: '15-20', rpe: '8', defaultRest: 90, notes: 'Band anchored to a door or post. Squeeze the shoulder blades, no shrugging. No band: Inverted Row under a solid table.', compound: true },
        { id: 'nordic-curl', name: 'Nordic Curl', muscle: 'Hamstrings', sets: 3, reps: '5-8', rpe: '8', defaultRest: 90, notes: 'Knee flexion, which the Romanian deadlift does NOT cover. Feet hooked under a sofa or a heavy bed; lower as slowly as you can and push with your hands to come back up. Very demanding: 3-5 reps already count.', bw: true },
        { id: 'dead-bug', name: 'Dead Bug', muscle: 'Core', sets: 3, reps: '8-10/side', rpe: '-', defaultRest: 45, notes: 'Anti-extension. Low back pinned to the floor the whole time — if it lifts, shorten the range. Slow, exhaling as you extend.', bw: true },
      ]
    }
  }
};

// Rolling number animation — digits roll up/down when value changes
function animateNumber(el, newValue, suffix = '') {
  if (!el) return;
  const text = String(newValue) + suffix;
  if (el.textContent === text) return;
  el.classList.add('num-roll');
  el.style.setProperty('--from', `"${el.textContent}"`);
  el.textContent = text;
  el.addEventListener('animationend', () => el.classList.remove('num-roll'), { once: true });
}

// RPE color mapping
function rpeColor(rpe) {
  if (!rpe || rpe <= 0) return 'var(--text3)';
  if (rpe <= 6) return 'var(--accent)';
  if (rpe <= 7) return 'var(--accent2)';
  if (rpe <= 7.5) return 'var(--yellow)';
  if (rpe <= 8.5) return 'var(--orange)';
  return 'var(--red)';
}

// Muscle badge colors.
//
// V-2 (auditoría 2026-09-08): eran doce hexes de la paleta por defecto de Tailwind
// (blue-400, emerald-400, violet-400, …), heredados del primer prototipo. Convivían con la
// identidad Whoop-dark sin pertenecer a ella: el azul del pecho no era el azul de strain y el
// verde de la espalda no era el verde de recuperación, así que la misma pantalla mostraba dos
// familias de color. Ahora cada músculo apunta a un token, y cambiar la identidad cambia
// también estas insignias. `MUSCLE_FALLBACK` cubre las claves que se reetiquetan en caliente
// (`Power`, de los pliométricos) sin inventarles un color.
const MUSCLE_COLORS = {
  'Chest': 'var(--blue)', 'Back': 'var(--accent)', 'Shoulders': 'var(--purple)', 'Rear Delt': 'var(--purple)',
  'Triceps': 'var(--orange)', 'Biceps': 'var(--pink)', 'Quads': 'var(--accent2)', 'Hamstrings': 'var(--yellow)',
  'Calves': 'var(--text2)', 'Core': 'var(--text)', 'Glutes': 'var(--pink)', 'Posterior': 'var(--yellow)',
};
const MUSCLE_FALLBACK = 'var(--text3)';

// Key lifts for strength chart tracking
const KEY_LIFTS = ['bench-press', 'back-squat', 'sumo-dl', 'ohp', 'barbell-row', 'chinups'];

// Estimate calories burned for a session.
// Uses Keytel et al. (2005) HR-based formula when avgHr is available
// (most accurate for runs). Falls back to MET × kg × hours otherwise.
// Returns { kcal, method } or null if there's not enough info.
function estimateCalories({ type, durationMin, bodyweightKg, avgHr, avgRpe, distanceKm, age }) {
  if (!durationMin || !bodyweightKg) return null;
  const kg = bodyweightKg;
  const a = age || 30;
  const hours = durationMin / 60;
  if (type === 'run' && avgHr && avgHr > 60) {
    const kcalPerMin = (-55.0969 + 0.6309 * avgHr + 0.1988 * kg + 0.2017 * a) / 4.184;
    return { kcal: Math.max(0, Math.round(kcalPerMin * durationMin)), method: 'hr' };
  }
  if (type === 'run' && distanceKm > 0) {
    const paceMinPerKm = durationMin / distanceKm;
    let met;
    if (paceMinPerKm > 7) met = 7;
    else if (paceMinPerKm > 5.5) met = 9.8;
    else if (paceMinPerKm > 4.5) met = 11.5;
    else met = 14;
    return { kcal: Math.round(met * kg * hours), method: 'met-pace' };
  }
  if (type === 'gym') {
    // Rough strength-training MET (vigorous ≈ 5-6); modulate by avg RPE
    const met = avgRpe >= 8.5 ? 6 : avgRpe >= 7 ? 5 : 4;
    return { kcal: Math.round(met * kg * hours), method: 'met-rpe' };
  }
  return null;
}

// Latest body weight from IDB. Cached on first hit per session.
let _bwCache = null;
async function getBodyweightLatest() {
  if (_bwCache) return _bwCache;
  const all = _bwWeighIns(await dbGetAll('bodyweight'));
  if (all.length === 0) return null;
  _bwCache = all[all.length - 1].weight;
  return _bwCache;
}

// Las filas de `bodyweight` que SON una pesada, ascendentes por fecha.
//
// EL FALLO QUE IMPIDE (2026-09-09): el store guarda tres cosas con la misma clave `date` — la
// pesada, la fila de cintura (sin `weight`) y, desde Withings, una fila que puede traer sólo el
// pulso de la báscula. Toda la serie de peso (tarjeta, gráfico, deltas, ETA, kcal estimadas) hacía
// `row.weight` sin mirar si existía, y con una fila sin peso el resultado era "NaN kg" en Stats.
function _bwWeighIns(rows) {
  return (rows || [])
    .filter((r) => r && r.date && Number.isFinite(Number(r.weight)) && Number(r.weight) > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Avg RPE across all done sets in a workout (used for calorie estimation).
function workoutAvgRpe(w) {
  const rpes = [];
  w.exercises.forEach(ex => ex.sets.filter(s => s.done && s.rpe).forEach(s => rpes.push(s.rpe)));
  return rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null;
}

// Parse "MM:SS" duration string back to total minutes.
function durationToMinutes(durStr) {
  if (!durStr) return 0;
  const [m, s] = String(durStr).split(':').map(n => parseInt(n) || 0);
  return m + (s || 0) / 60;
}

// Convert a stored weight from the unit it was logged in to another unit.
// Stored values are NEVER mutated — this is display/compute-time only. Workouts
// carry their own `w.unit` ('lb' for pre-Spain sessions, 'kg' since the move),
// so historical lb numbers must be converted before being shown or compared in
// the current display unit.
function convertWeight(value, fromUnit, toUnit) {
  if (!value || !fromUnit || fromUnit === toUnit) return value;
  // LB_TO_KG vive en coach-engine.js, que se carga antes (E-9). Había dos constantes para
  // el mismo factor (0.453592 aquí, 0.45359237 en el motor): el mismo peso salía distinto
  // según qué fichero lo convirtiera.
  if (fromUnit === 'lb' && toUnit === 'kg') return +(value * LB_TO_KG).toFixed(2);
  if (fromUnit === 'kg' && toUnit === 'lb') return +(value * 2.20462).toFixed(2);
  return value;
}
// A stored set weight → current display unit. workoutUnit defaults to the
// display unit (so weights already in the display unit pass through unchanged).
function dispW(weight, workoutUnit) {
  return convertWeight(weight, workoutUnit || state.settings.unit, state.settings.unit);
}

// Unidad en la que están guardados los pesos de UN registro. Fuente única.
//
// El fallo que esta función existe para impedir (24-ago-2026): la ficha de edición deducía la
// unidad con `w.inputUnit || appUnit` —sin mirar nunca `w.unit`— mientras el transcript de WHOOP
// la deducía con `w.unit`. Con un registro sellado `unit: 'lb'` la ficha lo pintaba en kg y
// "Copy for WHOOP" lo copiaba en lb: los mismos números, dos etiquetas. Todo lo que necesite la
// unidad de un registro pasa por aquí.
//
// `inputUnit` manda sobre `unit` porque sólo existe mientras un borrador está sin guardar: son los
// pesos tal y como se están tecleando, antes de la conversión que hace saveEditWorkout.
function loggedUnit(w) {
  return (w && (w.inputUnit || w.unit)) || state.settings.unit || 'kg';
}

// Volume helper: dumbbell exercises count both hands (peso × reps × 2). Uses
// the snapshot meta on saved exercises (set in finishWorkout); for legacy
// workouts without it, falls back to the plan definition by id. `unit` is the
// owning workout's unit — weights are converted to the display unit so volume
// across mixed lb/kg sessions sums consistently.
// v11.48 — Ejercicios cuya columna de carga es una MEDIDA, no un peso.
//
// `box-jump` llevaba `bw: true`, que significa "peso corporal MAS lastre opcional" (correcto en
// dominadas o fondos). En un salto no existe la dimension de carga: la columna salia como "+kg"
// con placeholder 0 y el 3-sep quedo registrado como 0x5@6, donde el 0 no significa nada.
// Julian lo detecto entrenando. Ahora esa columna mide la ALTURA DEL CAJON, que es la variable
// de progresion real del ejercicio.
//
// Consecuencia que hay que blindar: un numero en esa columna NO es kg. Sin esto, 50 cm x 5 reps
// x 3 series inyectarian 750 kg de tonelaje inventado en el grafico de volumen, y el "Est. 1RM"
// se calcularia sobre centimetros.
//
// Mismo patron que `_DB_EXERCISE_IDS`: un mapa de ids, porque el store `exercises` no persiste
// campos arbitrarios (solo id, name, muscle, movementPattern, bw, defaultNotes, custom).
const _MEASURE_EXERCISES = { 'box-jump': 'cm' };
function measureUnitFor(exId) { return _MEASURE_EXERCISES[exId] || null; }

function volumeForExercise(ex, unit) {
  // Una medida no es carga: no aporta tonelaje. Aqui dentro y no en cada consumidor, porque
  // volumeForExercise se llama desde 7 sitios distintos.
  if (measureUnitFor(ex.exerciseId)) return 0;
  const planEx = activePlan && activePlan.sessions
    ? Object.values(activePlan.sessions).flatMap(s => s.exercises).find(e => e.id === ex.exerciseId)
    : null;
  const factor = (ex.db || planEx?.db) ? 2 : 1;
  return ex.sets.filter(s => s.done).reduce((sum, s) => sum + dispW(s.weight || 0, unit) * (s.reps || 0) * factor, 0);
}

// ==================== MOBILITY LIBRARY (v10.5) ====================
// Evidence-based mobility routines for back health & lifter recovery.
// Sources: Lancet 2018 LBP series, McGill Big 3, NICE guidelines.
// Each exercise has durationSec for the active-routine timer.
const MOBILITY_LIBRARY = {
  'hip-reset': {
    id: 'hip-reset',
    name: 'Hip Reset',
    duration: 7,
    area: 'hips',
    color: 'teal',
    description: 'Daily hip flow. Counters sitting and primes the hips for lifting.',
    exercises: [
      { name: '90/90 Hip Switch', reps: '8 each side', durationSec: 90, perSide: true, youtubeId: 'oALcD7wEa-s', instructions: 'Sit with one leg in front (90°) and the other to the side (90°). Switch sides slowly, keeping chest tall.' },
      { name: 'Couch Stretch', reps: '60s each side', durationSec: 120, perSide: true, youtubeId: 'TML8Vqy-ACQ', instructions: 'Kneel facing away from a couch, back foot on the seat, front foot flat. Squeeze glutes, tuck pelvis.' },
      { name: "World's Greatest Stretch", reps: '5 each side', durationSec: 90, perSide: true, youtubeId: 'PE-UuERblwA', instructions: 'Lunge forward, plant hand inside front foot, rotate other arm to ceiling. Alternate sides.' },
      { name: 'Deep Squat Hold + Thoracic Reach', reps: '45s', durationSec: 45, youtubeId: 'vlizhxKrgck', instructions: 'Squat as deep as comfortable, elbows pushing knees out. Reach one arm up at a time, rotating thoracic spine.' },
      { name: 'Glute Bridge', reps: '12 reps · pause 2s top', durationSec: 75, youtubeId: 'MnluU4dEHQE', instructions: 'Lying on back, knees bent. Drive through heels, squeeze glutes hard at the top. 2-second pause.' },
    ],
  },
  'lumbar-decompression': {
    id: 'lumbar-decompression',
    name: 'Lumbar Decompression + Core Endurance',
    duration: 10,
    area: 'lumbar',
    color: 'purple',
    description: 'McGill-based core endurance work. Builds the spinal stability that prevents lumbar pain.',
    exercises: [
      { name: 'Cat-Cow', reps: '8 reps slow', durationSec: 60, youtubeId: 'WHUevrqeKIg', instructions: 'On hands and knees. Round spine up (cat), then arch and look up (cow). Move slowly, breathe deep.' },
      { name: 'Bird Dog', reps: '8 each side · 3s pause', durationSec: 120, perSide: true, youtubeId: 'S1QbyYZaXIg', instructions: 'On hands and knees. Extend opposite arm and leg, hold 3s. Keep hips level — no rotation.' },
      { name: 'Side Plank', reps: '30-45s each side', durationSec: 90, perSide: true, youtubeId: '1qcsRZhtMyo', instructions: 'On forearm, body straight from head to feet. Hips stacked.' },
      { name: 'McGill Curl-Up', reps: '5 reps × 3 sets', durationSec: 120, youtubeId: '_tz9WGVH25g', instructions: 'Lying on back, one knee bent. Hands under lower back. Lift head and shoulders slightly — chin tucked, no full sit-up.' },
      { name: 'Dead Bug', reps: '8 each side slow', durationSec: 90, perSide: true, youtubeId: 'Aoipu_fl3HA', instructions: 'On back, arms up, knees at 90°. Lower opposite arm and leg slowly without arching the lower back.' },
      { name: 'Child\'s Pose + Lateral Reach', reps: '30s each side', durationSec: 60, perSide: true, youtubeId: 'I89NCXZ55i0', instructions: 'Sit hips back to heels, arms forward. Walk both arms to one side to stretch the side body.' },
    ],
  },
  'thoracic-posterior': {
    id: 'thoracic-posterior',
    name: 'Thoracic + Posterior Chain',
    duration: 10,
    area: 'thoracic',
    color: 'blue',
    description: 'Opens up the upper back and primes the posterior chain. Great on upper-body lift days.',
    exercises: [
      { name: 'Open-Book (Thoracic Rotation)', reps: '8 each side', durationSec: 90, perSide: true, youtubeId: 'peeW19ofFUg', instructions: 'Lying on side, knees bent, arms stacked in front. Rotate top arm back, opening the chest. Eyes follow the hand.' },
      { name: 'Thread the Needle', reps: '6 each side', durationSec: 75, perSide: true, youtubeId: 'ds3umIYJDrE', instructions: 'On hands and knees. Slide one arm under the other, lowering shoulder to floor. Pause, return.' },
      { name: 'Wall Slides', reps: '10 reps', durationSec: 60, youtubeId: 'GaP20t6ZOfU', instructions: 'Back against wall, arms in goalpost. Slide arms up overhead while keeping forearms touching the wall.' },
      { name: 'Prone Y-T-W', reps: '8 each shape', durationSec: 90, youtubeId: 'FATPBjxNuvo', instructions: 'Face down on floor. Lift arms in Y shape (overhead), then T (out to sides), then W (elbows bent). 8 reps each.' },
      { name: 'Romanian Deadlift (Unweighted)', reps: '12 reps slow', durationSec: 75, youtubeId: 'P9akD4PyOXk', instructions: 'Stand tall. Hinge at hips, push butt back, slight knee bend. Slow eccentric to mid-shin, drive hips through.' },
      { name: 'Hip Flexor Stretch + Reach', reps: '45s each side', durationSec: 90, perSide: true, youtubeId: 'd9wYh4pRV6Q', instructions: 'Half-kneeling lunge. Squeeze the glute of the back leg. Reach same-side arm overhead and slightly to opposite side.' },
    ],
  },
};

// Schedule: which routine to recommend based on day of week (0=Sun..6=Sat)
// Hip Reset is daily but the "main" recommended depends on day.
function getRecommendedMobilityToday() {
  const dow = new Date().getDay();
  // Mon/Wed/Fri (1,3,5) -> lumbar; Tue/Thu (2,4) -> thoracic; Sat/Sun -> hip-reset
  if (dow === 1 || dow === 3 || dow === 5) return MOBILITY_LIBRARY['lumbar-decompression'];
  if (dow === 2 || dow === 4) return MOBILITY_LIBRARY['thoracic-posterior'];
  return MOBILITY_LIBRARY['hip-reset'];
}

// Map color name → CSS var pair (token + tint)
function mobilityColorVars(color) {
  const map = {
    teal: { color: 'var(--teal)', tint: 'var(--tint-teal)' },
    purple: { color: 'var(--purple)', tint: 'var(--tint-purple)' },
    blue: { color: 'var(--blue)', tint: 'var(--tint-blue)' },
  };
  return map[color] || map.teal;
}

// Exercise alternatives by muscle group (for swapping)
const EXERCISE_ALTERNATIVES = {
  // v11.70 (L-1): la pliometría y el acondicionamiento dejan de etiquetarse 'Quads' en la semilla (el
  // validador contaba el box jump como volumen de cuádriceps). El swap sigue teniendo alternativas: las
  // suyas, no las de sentadilla.
  'Power': [
    { id: 'box-jump', name: 'Box Jump' },
    { id: 'broad-jump', name: 'Broad Jump' },
    { id: 'pogo-hops', name: 'Pogo Hops' },
    { id: 'sled-push', name: 'Sled Push' },
  ],
  'Chest': [
    { id: 'bench-press', name: 'Barbell Bench Press' },
    { id: 'incline-press', name: 'Incline Chest Press' },
    { id: 'incline-db-press', name: 'Incline DB Press' },
    { id: 'incline-db-fly', name: 'Incline DB Fly' },
    { id: 'db-bench', name: 'DB Bench Press' },
    { id: 'machine-chest-press', name: 'Machine Chest Press' },
    { id: 'hammer-chest-press', name: 'Hammer Strength Chest Press' },
    { id: 'pec-deck', name: 'Pec Deck' },
    { id: 'cable-fly', name: 'Cable Fly' },
    { id: 'cable-crossover', name: 'Cable Crossover' },
    { id: 'pushup', name: 'Push-ups' },
    { id: 'dips', name: 'Dips (Chest)' },
  ],
  'Back': [
    { id: 'barbell-row', name: 'Barbell Row' },
    { id: 'pendlay-row', name: 'Pendlay Row' },
    { id: 'band-row', name: 'Band Row' },
    { id: 'inverted-row', name: 'Inverted Row' },
    { id: 'chinups', name: 'Chin-ups' },
    { id: 'lat-pulldown', name: 'Lat Pulldown' },
    { id: 'straight-arm-pulldown', name: 'Cable Straight-Arm Pulldown' },
    { id: 'chest-supported-row', name: 'Chest-Supported Row' },
    { id: 'high-row', name: 'High Row (machine)' },
    { id: 'landmine-row', name: 'Landmine Row' },
    { id: 'cable-row', name: 'Cable Row (Low Row)' },
    { id: 'db-row', name: 'DB Row' },
    { id: 't-bar-row', name: 'T-Bar Row' },
    { id: 'pullups', name: 'Pull-ups' },
  ],
  'Shoulders': [
    { id: 'ohp', name: 'Overhead Press' },
    { id: 'lateral-raise', name: 'DB Lateral Raise' },
    { id: 'front-raise', name: 'DB Front Raise' },
    { id: 'cable-lateral', name: 'Cable Lateral Raise' },
    { id: 'lateral-raise-machine', name: 'Lateral Raise Machine' },
    { id: 'db-shoulder-press', name: 'DB Shoulder Press' },
    { id: 'machine-shoulder-press', name: 'Machine Shoulder Press' },
    { id: 'arnold-press', name: 'Arnold Press' },
    { id: 'pike-pushup', name: 'Pike Push-up' },
  ],
  'Rear Delt': [
    { id: 'face-pull', name: 'Cable Face Pull' },
    { id: 'rear-delt-fly', name: 'Rear Delt Fly' },
    { id: 'band-pull-apart', name: 'Band Pull-Apart' },
    { id: 'reverse-pec-deck', name: 'Reverse Pec Deck' },
  ],
  'Quads': [
    { id: 'back-squat', name: 'Barbell Back Squat' },
    { id: 'front-squat', name: 'Front Squat' },
    { id: 'leg-press', name: 'Leg Press' },
    { id: 'leg-extension', name: 'Leg Extension' },
    { id: 'bss', name: 'Bulgarian Split Squat' },
    { id: 'goblet-squat', name: 'Goblet Squat' },
    { id: 'hack-squat', name: 'Hack Squat' },
    { id: 'split-squat', name: 'Bodyweight Split Squat' },
    { id: 'pogo-hops', name: 'Pogo Hops' },
    { id: 'box-jump', name: 'Box Jump' },
    { id: 'broad-jump', name: 'Broad Jump' },
  ],
  'Hamstrings': [
    { id: 'rdl', name: 'Barbell RDL' },
    { id: 'stiff-leg-deadlift', name: 'Stiff-Leg Deadlift' },
    { id: 'leg-curl-b', name: 'Lying Leg Curl' },
    { id: 'seated-leg-curl', name: 'Seated Leg Curl' },
    { id: 'ghr', name: 'Glute-Ham Raise (GHD)' },
    { id: 'db-rdl', name: 'DB RDL' },
    { id: 'good-morning', name: 'Good Morning' },
    { id: 'nordic-curl', name: 'Nordic Curl' },
    { id: 'sl-rdl', name: 'Single-Leg RDL' },
  ],
  'Posterior': [
    { id: 'sumo-dl', name: 'Sumo Deadlift' },
    { id: 'conv-dl', name: 'Conventional Deadlift' },
    { id: 'trap-bar-dl', name: 'Trap Bar Deadlift' },
    { id: 'rdl', name: 'Barbell RDL' },
  ],
  'Glutes': [
    { id: 'hip-thrust', name: 'Barbell Hip Thrust' },
    { id: 'glute-drive', name: 'Glute Drive (machine)' },
    { id: 'cable-kickback', name: 'Cable Kickback' },
    { id: 'glute-bridge', name: 'Glute Bridge' },
    { id: 'sl-glute-bridge', name: 'Single-Leg Glute Bridge' },
  ],
  'Triceps': [
    { id: 'tricep-pushdown', name: 'Tricep Pushdown' },
    { id: 'overhead-ext', name: 'Overhead Tricep Extension' },
    { id: 'skull-crusher', name: 'Skull Crusher' },
    { id: 'close-grip-bench', name: 'Close-Grip Bench' },
  ],
  'Biceps': [
    { id: 'incline-curl', name: 'Incline DB Curl' },
    { id: 'barbell-curl', name: 'Barbell Curl' },
    { id: 'hammer-curl', name: 'Hammer Curl' },
    { id: 'cable-curl', name: 'Cable Curl' },
    { id: 'preacher-curl', name: 'Preacher Curl' },
  ],
  'Core': [
    { id: 'ab-wheel', name: 'Ab Wheel Rollout' },
    { id: 'hanging-leg-raise', name: 'Hanging Leg Raise' },
    { id: 'pallof-press', name: 'Cable Pallof Press' },
    { id: 'cable-crunch', name: 'Cable Crunch' },
    { id: 'plank', name: 'Plank' },
    { id: 'dead-bug', name: 'Dead Bug' },
    { id: 'bird-dog', name: 'Bird Dog' },
    { id: 'side-plank', name: 'Side Plank' },
  ],
  'Calves': [
    { id: 'calf-raise', name: 'Standing Calf Raise' },
    { id: 'seated-calf-raise', name: 'Seated Calf Raise' },
    { id: 'leg-press-calf', name: 'Leg Press Calf Raise' },
  ],
};

// Standard plate weights (kg) for plate calculator
const PLATE_WEIGHTS = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_WEIGHT = 20; // Standard Olympic bar

// Weekly schedule template: 0=Sun, 1=Mon, ..., 6=Sat
const WEEK_TEMPLATE = {
  1: { type: 'gym', session: 'upperA' },
  2: { type: 'gym', session: 'lowerA' },
  3: { type: 'run', label: 'Zone 2 Run' },
  4: { type: 'gym', session: 'upperB' },
  5: { type: 'gym', session: 'lowerB' },
  6: { type: 'run', label: 'Zone 2 Run' },
  0: { type: 'rest', label: 'Rest' },
};

// ==================== T1: SESSION TYPE TAXONOMY (v11.10) ====================
// Backwards-compatible foundation for richer session types. PURE DATA + PURE
// helpers + a read-time adapter. Nothing here changes existing behavior: legacy
// workouts/runs/mobility records are interpreted by toSession() in reads; no
// record is migrated or rewritten. budgetWeight aligns with hard-day-budget.md;
// evidenceTags reference research/evidence-to-rules.md Rule IDs.
const SESSION_TYPES = {
  strength: {
    label: 'Strength', tone: 'var(--blue)', icon: '🏋️',
    subtypes: {
      upper:       { label: 'Upper', budgetWeight: 1, evidenceTags: ['STR-002', 'STR-005', 'STR-006'] },
      lower:       { label: 'Lower', budgetWeight: 2, evidenceTags: ['STR-002', 'STR-005', 'INT-001'] },
      full:        { label: 'Full Body', budgetWeight: 2, evidenceTags: ['STR-002'] },
      hypertrophy: { label: 'Hypertrophy', budgetWeight: 1, evidenceTags: ['STR-003', 'STR-004', 'STR-007'] },
      maintenance: { label: 'Maintenance', budgetWeight: 1, evidenceTags: ['STR-001'] },
    },
  },
  cardio: {
    label: 'Cardio', tone: 'var(--accent)', icon: '🏃',
    // v11.36: elliptical/swim/walk added — the importer can now bring in every modality
    // Strava and Whoop record, not just runs (see CARDIO_TYPE_MAP).
    modalities: ['run_outdoor', 'treadmill', 'bike', 'row', 'ski', 'elliptical', 'swim', 'walk'],
    subtypes: {
      zone2:     { label: 'Zone 2', budgetWeight: 0.5, evidenceTags: ['END-001', 'END-005', 'INT-002'] },
      zone3:     { label: 'Zone 3', budgetWeight: 1, evidenceTags: ['END-001'] },
      threshold: { label: 'Threshold', budgetWeight: 2, evidenceTags: ['END-001', 'END-004', 'BUD-001'] },
      intervals: { label: 'Intervals', budgetWeight: 2, evidenceTags: ['END-004', 'END-008', 'INT-001', 'BUD-001'] },
      long_easy: { label: 'Long Easy', budgetWeight: 1, evidenceTags: ['END-001', 'END-003'] },
      recovery:  { label: 'Recovery Cardio', budgetWeight: 0, evidenceTags: ['READ-007'] },
    },
  },
  hybrid: {
    label: 'Hybrid', tone: 'var(--orange)', icon: '🔥',
    subtypes: {
      aerobic_circuit:    { label: 'Aerobic Circuit', budgetWeight: 1, evidenceTags: ['HYB-001', 'HYB-005'] },
      threshold:          { label: 'Hybrid Threshold', budgetWeight: 2, evidenceTags: ['HYB-002', 'BUD-001'] },
      strength_endurance: { label: 'Strength Endurance', budgetWeight: 2, evidenceTags: ['HYB-002', 'HYB-003'] },
      benchmark:          { label: 'HYROX-like Benchmark', budgetWeight: 3, evidenceTags: ['HYB-004'] },
      low_impact:         { label: 'Low-impact Hybrid', budgetWeight: 1, evidenceTags: ['HYB-005'] },
    },
  },
  recovery: {
    label: 'Recovery', tone: 'var(--purple)', icon: '🧘',
    subtypes: {
      mobility:    { label: 'Mobility', budgetWeight: 0, evidenceTags: ['ATH-003'] },
      easy_cardio: { label: 'Easy Cardio', budgetWeight: 0, evidenceTags: ['READ-007'] },
      walk:        { label: 'Walk', budgetWeight: 0, evidenceTags: [] },
      breathing:   { label: 'Breathing', budgetWeight: 0, evidenceTags: ['READ-006'] },
      deload:      { label: 'Deload', budgetWeight: 0, evidenceTags: ['LOAD-004', 'READ-008'] },
    },
  },
  athleticism: {
    label: 'Athleticism', tone: 'var(--teal)', icon: '⚡',
    subtypes: {
      plyometrics: { label: 'Plyometrics', budgetWeight: 1, evidenceTags: ['ATH-001', 'ATH-004', 'INT-004'] },
      carries:     { label: 'Carries', budgetWeight: 1, evidenceTags: ['ATH-003'] },
      sled:        { label: 'Sled', budgetWeight: 2, evidenceTags: ['HYB-005'] },
      unilateral:  { label: 'Unilateral', budgetWeight: 1, evidenceTags: ['ATH-005'] },
      core:        { label: 'Core', budgetWeight: 0.5, evidenceTags: ['ATH-003'] },
      agility:     { label: 'Agility', budgetWeight: 1, evidenceTags: ['ATH-002', 'INT-004'] },
    },
  },
  benchmark: {
    label: 'Benchmark', tone: 'var(--red)', icon: '🎯',
    subtypes: {
      strength:     { label: 'Strength Test', budgetWeight: 2, evidenceTags: [] },
      running:      { label: 'Running Test', budgetWeight: 2, evidenceTags: ['END-005'] },
      hybrid:       { label: 'Hybrid Test', budgetWeight: 3, evidenceTags: ['HYB-004'] },
      conditioning: { label: 'Conditioning Test', budgetWeight: 3, evidenceTags: [] },
    },
  },
};

// Map a legacy WEEK_TEMPLATE/activity-feed type ('gym'|'run'|'rest'|'mobility')
// OR an already-valid family name → a canonical family (or null for rest).
function sessionFamily(t) {
  if (!t) return null;
  if (SESSION_TYPES[t]) return t;            // already a family
  if (t === 'gym' || t === 'lift' || t === 'workout') return 'strength';
  if (t === 'run' || t === 'cardio') return 'cardio';
  if (t === 'mobility') return 'recovery';
  if (t === 'rest') return null;
  return null;
}

// Canonical tone color per family: strength→blue, cardio→accent/green, recovery→purple.
// (V-4 retiró `_homeTypeTone`, que era un envoltorio sin llamadores sobre esta función.)
function typeTone(family) {
  const f = sessionFamily(family) || family;
  return (SESSION_TYPES[f] && SESSION_TYPES[f].tone) || 'var(--blue)';
}

// Look up subtype metadata (budgetWeight, evidenceTags, label).
function sessionSubtypeMeta(family, subtype) {
  const fam = SESSION_TYPES[family];
  if (!fam || !fam.subtypes) return null;
  return fam.subtypes[subtype] || null;
}

// ==================== CLASIFICACIÓN DE SESIONES DESDE EL DATO (F-7, v11.58) ====================
// `toSession` clasificaba la sesión de fuerza por regex sobre su id, y se equivocaba en 6 de las
// 9 del plan: `fullA/fullB/travelA/travelB/hybrid1` y la sesión libre `free` caían en
// `strength.maintenance` peso 1. Eso rompía tres cosas a la vez: un full-body nunca era `hard`
// (así que el advisory nunca proponía recuperación con la recuperación en rojo), `hybrid1` nunca
// era familia `hybrid` (flag HYB-002 inalcanzable) y el presupuesto de la semana infra-contaba.
//
// La clasificación sale ahora del dato que YA existe: `IDEAL_BLOCK_V1.variants[*].days[]` declara
// `planRef`, `kind`, `subtype` y `bw` de cada sesión. El mapa se construye una vez, perezosamente
// (IDEAL_BLOCK_V1 se define más abajo en el fichero; en tiempo de ejecución ya existe). La regex
// queda sólo como último recurso, y avisa: dejar de decidir en silencio es la mitad del arreglo.
//
// `SESSION_CLASS_EXTRA` cubre lo que el IDEAL no referencia. Los ids que también están en el
// IDEAL coinciden con él a propósito: si algún día divergen, gana el IDEAL (es el dato).
const SESSION_CLASS_EXTRA = {
  // La sesión libre vive en `state.adHocSession`, nunca en el IDEAL. Suele ser compuesta →
  // peso 2 es la elección conservadora (audit Change 3).
  free: { family: 'strength', subtype: 'full', bw: 2 },
  // Híbrido (trineo + SkiErg): sólo existe como alternativa en ALT_LIBRARY, no como día del
  // IDEAL. Familia `hybrid` = el flag HYB-002 vuelve a ser alcanzable.
  hybrid1: { family: 'hybrid', subtype: 'strength_endurance', bw: 2 },
  // Legacy: los ids que los 31 registros guardados ya usan, por si alguna variante del IDEAL
  // deja de referenciarlos (el registro histórico no se migra, el adaptador lo cubre).
  lowerA: { family: 'strength', subtype: 'lower', bw: 2 },
  lowerB: { family: 'strength', subtype: 'lower', bw: 2 },
  upperA: { family: 'strength', subtype: 'upper', bw: 1 },
  upperB: { family: 'strength', subtype: 'upper', bw: 1 },
  fullA: { family: 'strength', subtype: 'full', bw: 2 },
  fullB: { family: 'strength', subtype: 'full', bw: 2 },
  travelA: { family: 'strength', subtype: 'full', bw: 1.5 },
  travelB: { family: 'strength', subtype: 'full', bw: 1.5 },
};
const _SESSION_KIND_FAMILY = { strength: 'strength', hybrid: 'hybrid', cardio: 'cardio', recovery: 'recovery' };
let _sessionClassCache = null;

// { sessionId: { family, subtype, bw } } — IDEAL primero, mapa explícito para el resto.
function sessionClassMap() {
  if (_sessionClassCache) return _sessionClassCache;
  const map = {};
  try {
    const variants = (typeof IDEAL_BLOCK_V1 !== 'undefined' && IDEAL_BLOCK_V1.variants) || {};
    for (const v of Object.values(variants)) {
      for (const day of (v.days || [])) {
        if (!day || !day.planRef) continue;
        map[day.planRef] = {
          family: _SESSION_KIND_FAMILY[day.kind] || 'strength',
          subtype: day.subtype,
          bw: day.bw != null ? day.bw : null,
        };
      }
    }
  } catch (e) { console.warn('[sessionClass] IDEAL_BLOCK_V1 no legible:', e); }
  for (const [id, cls] of Object.entries(SESSION_CLASS_EXTRA)) {
    if (!map[id]) map[id] = Object.assign({}, cls);
  }
  _sessionClassCache = map;
  return map;
}

function _subtypeFromIntensity(label) {
  const l = String(label || '').toLowerCase();
  if (!l) return 'zone2';
  if (l.includes('interval') || l.includes('vo2')) return 'intervals';
  if (l.includes('threshold') || l.includes('tempo')) return 'threshold';
  if (l.includes('long')) return 'long_easy';
  if (l.includes('z3') || l.includes('zone3') || l.includes('zone_3')) return 'zone3';
  if (l.includes('recovery')) return 'recovery';
  return 'zone2'; // easy_run and unknowns default to zone 2
}

// READ-TIME ADAPTER — normalize ANY stored record (legacy or new) into a common
// session envelope. Never mutates/rewrites the record. originStore tells us how to
// interpret legacy records that lack a sessionType discriminator.
//   { id, date, ts, family, subtype, modality, title, durationMin,
//     evidenceTags, budgetWeight, payload, source, sessionType }
function toSession(record, originStore) {
  if (!record) return null;
  // New-style records already carry a discriminator.
  if (record.sessionType && record.family) {
    const meta = sessionSubtypeMeta(record.family, record.subtype) || {};
    return Object.assign({
      evidenceTags: record.evidenceTags || meta.evidenceTags || [],
      budgetWeight: record.budgetWeight != null ? record.budgetWeight : (meta.budgetWeight != null ? meta.budgetWeight : 1),
    }, record);
  }
  const store = originStore || record._store;
  if (store === 'runs' || record.distance != null && record.avgPace != null && !record.exercises) {
    const subtype = _subtypeFromIntensity(record.intensityLabel);
    const meta = sessionSubtypeMeta('cardio', subtype) || {};
    return {
      id: record.id, date: record.date, ts: record._updated_at || null,
      family: 'cardio', subtype, modality: record.sport ? String(record.sport).toLowerCase() : 'run_outdoor',
      title: record.notes || meta.label || 'Run',
      durationMin: record.duration != null ? Number(record.duration) : null,
      perceivedEffort: record.feel != null ? Number(record.feel) : null,
      evidenceTags: meta.evidenceTags || [], budgetWeight: meta.budgetWeight != null ? meta.budgetWeight : 0.5,
      source: record.source || 'manual', sessionType: 'cardio.' + subtype,
      payload: {
        distance: record.distance, avgPace: record.avgPace, gapPace: record.gapPace || null,
        avgHR: record.avgHR || null, maxHR: record.maxHR || null, hrZoneTimes: record.hrZoneTimes || null,
        decoupling: record.decoupling || null, intensityLabel: record.intensityLabel || null,
        trainingLoad: record.trainingLoad || null,
      },
    };
  }
  if (store === 'mobility_sessions' || record.routineId != null) {
    const meta = sessionSubtypeMeta('recovery', 'mobility') || {};
    return {
      id: record.id, date: record.date, ts: record.createdAt || null,
      family: 'recovery', subtype: 'mobility', modality: 'mobility',
      title: record.routineName || 'Mobility',
      durationMin: record.durationMin != null ? Number(record.durationMin) : null,
      perceivedEffort: null, evidenceTags: meta.evidenceTags || [], budgetWeight: 0,
      source: 'manual', sessionType: 'recovery.mobility',
      payload: { routineId: record.routineId, painBefore: record.painBefore, painAfter: record.painAfter },
    };
  }
  // Default: gym workout. Clasificación por prioridad (F-7, v11.58):
  //   1) el propio registro, si `finishWorkout` guardó su instantánea `family/subtype`;
  //   2) el lookup SESSION_CLASS (IDEAL_BLOCK_V1 + mapa explícito) por id de sesión;
  //   3) la regex de siempre, SÓLO como último recurso y avisando.
  const rawSid = String(record.session || record.sessionName || '').trim();
  const sid = rawSid.toLowerCase();
  const SESSION_CLASS = sessionClassMap();
  let cls = (record.family && record.subtype)
    ? { family: record.family, subtype: record.subtype, bw: record.budgetWeight != null ? record.budgetWeight : null }
    : (SESSION_CLASS[rawSid] || null);
  if (!cls) {
    console.warn('[toSession] fallback regex for', rawSid || '(sin id)');
    const guess = /low|leg|squat|dead|hinge|glute/.test(sid) ? 'lower'
                : /upper|push|pull|bench|press/.test(sid) ? 'upper' : 'maintenance';
    cls = { family: 'strength', subtype: guess, bw: null };
  }
  const meta = sessionSubtypeMeta(cls.family, cls.subtype) || {};
  const bw = cls.bw != null ? cls.bw : (meta.budgetWeight != null ? meta.budgetWeight : 1);
  return {
    id: record.id, date: record.date, ts: record._updated_at || null,
    family: cls.family, subtype: cls.subtype, modality: 'gym',
    title: record.sessionName || 'Strength',
    durationMin: null, perceivedEffort: null,
    evidenceTags: meta.evidenceTags || [], budgetWeight: bw,
    source: 'manual', sessionType: cls.family + '.' + cls.subtype,
    payload: { exercises: record.exercises || [], quality: record.quality, unit: record.unit, blockTimings: record.blockTimings },
  };
}

// ==================== DYNAMIC PLAN SYSTEM ====================
// Module-level state — loaded from IDB at startup, fallback to hardcoded PLAN
let activePlan = null;           // { sessions, weekTemplate, version, ... }
let activeWeekTemplate = null;   // shortcut to activePlan.weekTemplate
let exerciseLibrary = {};        // { exerciseId: { id, name, muscle, movementPattern, ... } }

// Movement pattern mapping for every known exercise
const MOVEMENT_PATTERNS = {
  // Horizontal press
  'bench-press': 'horizontal-press', 'incline-db-press': 'horizontal-press',
  'db-bench': 'horizontal-press', 'machine-chest-press': 'horizontal-press',
  'cable-fly': 'horizontal-press', 'pushup': 'horizontal-press',
  'incline-press': 'horizontal-press', 'incline-db-fly': 'horizontal-press',
  'inverted-row': 'horizontal-pull', 'band-row': 'horizontal-pull',
  'pike-pushup': 'vertical-press',
  'sl-rdl': 'hinge', 'sl-glute-bridge': 'glute', 'split-squat': 'single-leg',
  // Pliometría (v11.42): patrón propio, para no contarla como volumen de pierna.
  // Corregido en v11.48: esto decía "para poder auditar el volumen de contactos", y NADA audita
  // contactos — 'plyometric' sólo se consume en los defaults de reps/RPE de ejercicios nuevos y,
  // desde v11.48, en renderMuscleVolume para mandar los saltos a la fila 'Power'. Además los 40
  // contactos de los pogos ya no están aquí: se fueron al calentamiento de lowerA.
  'pogo-hops': 'plyometric', 'box-jump': 'plyometric', 'broad-jump': 'plyometric',
  // Acondicionamiento híbrido: concéntrico dominante, bajo DOMS, baja skill.
  'sled-push': 'conditioning', 'sled-drag': 'conditioning',
  'ski-erg': 'conditioning', 'farmer-carry': 'carry',
  'dips': 'horizontal-press', 'close-grip-bench': 'horizontal-press',
  'floor-press': 'horizontal-press', 'pec-deck': 'horizontal-press',
  'cable-crossover': 'horizontal-press', 'hammer-chest-press': 'horizontal-press',
  // Vertical press
  'ohp': 'vertical-press', 'db-shoulder-press': 'vertical-press',
  'machine-shoulder-press': 'vertical-press', 'arnold-press': 'vertical-press',
  // Horizontal pull
  'barbell-row': 'horizontal-pull', 'landmine-row': 'horizontal-pull',
  'cable-row': 'horizontal-pull', 'db-row': 'horizontal-pull',
  't-bar-row': 'horizontal-pull', 'pendlay-row': 'horizontal-pull',
  'chest-supported-row': 'horizontal-pull', 'high-row': 'horizontal-pull',
  // Vertical pull
  'chinups': 'vertical-pull', 'pullups': 'vertical-pull',
  'lat-pulldown': 'vertical-pull',
  // Aislamiento de dorsal (v11.44): el pullover en polea con brazos extendidos es EXTENSIÓN DE
  // HOMBRO, no un tirón vertical — no hay flexión de codo. Etiquetarlo 'vertical-pull' le diría al
  // sistema que se cubrió ese patrón, y no se cubre. Patrón propio, como pliometría en v11.42.
  'straight-arm-pulldown': 'isolation-lat',
  // Squat pattern
  'back-squat': 'squat', 'front-squat': 'squat', 'leg-press': 'squat',
  'goblet-squat': 'squat', 'hack-squat': 'squat', 'bss': 'single-leg',
  'walking-lunge': 'single-leg',
  // Hinge
  'sumo-dl': 'hinge', 'conv-dl': 'hinge', 'trap-bar-dl': 'hinge',
  'rdl': 'hinge', 'db-rdl': 'hinge', 'good-morning': 'hinge',
  'stiff-leg-deadlift': 'hinge',
  // Isolation legs
  'leg-extension': 'isolation-quad', 'leg-curl-a': 'isolation-ham',
  'leg-curl-b': 'isolation-ham', 'nordic-curl': 'isolation-ham',
  'seated-leg-curl': 'isolation-ham', 'ghr': 'isolation-ham',
  'calf-raise': 'isolation-calf', 'seated-calf-raise': 'isolation-calf',
  'leg-press-calf': 'isolation-calf',
  // Glute
  'hip-thrust': 'glute', 'cable-kickback': 'glute', 'glute-bridge': 'glute',
  'glute-drive': 'glute',
  // Isolation shoulder
  'lateral-raise': 'isolation-shoulder', 'cable-lateral': 'isolation-shoulder',
  'lateral-raise-machine': 'isolation-shoulder', 'front-raise': 'isolation-shoulder',
  'face-pull': 'isolation-rear-delt', 'rear-delt-fly': 'isolation-rear-delt',
  'band-pull-apart': 'isolation-rear-delt', 'reverse-pec-deck': 'isolation-rear-delt',
  // Isolation arms
  'tricep-pushdown': 'isolation-tricep', 'overhead-ext': 'isolation-tricep',
  'skull-crusher': 'isolation-tricep',
  'incline-curl': 'isolation-bicep', 'barbell-curl': 'isolation-bicep',
  'hammer-curl': 'isolation-bicep', 'cable-curl': 'isolation-bicep',
  'preacher-curl': 'isolation-bicep',
  // Core — split by FUNCTION in v11.37, not lumped as 'core'.
  //
  // ATH-003 (`strong`, ready_to_govern_code) prescribes anti-rotation / anti-extension work
  // specifically BECAUSE of the lumbar history, and names Pallof / dead bug / carries / ab
  // wheel. With every core movement tagged `'core'`, a session could satisfy a "core 2x/week"
  // check with two loaded-flexion exercises and nothing would notice — which is exactly what
  // fullA (Cable Crunch) + fullB (Hanging Leg Raise) did. The rule was well written and
  // structurally unenforceable: the taxonomy could not express it.
  //
  // Anything downstream that wants "any core" should test the `core-` prefix.
  'pallof-press': 'core-anti-rotation',
  'ab-wheel': 'core-anti-extension', 'plank': 'core-anti-extension', 'dead-bug': 'core-anti-extension',
  'cable-crunch': 'core-flexion', 'hanging-leg-raise': 'core-flexion',
  // Bird dog y side plank (v11.42): las opciones sin equipo de los "Big 3" de McGill, que es
  // justamente la fuente de ATH-003. El bird dog resiste rotación; la plancha lateral, flexión
  // lateral — la agrupo con anti-rotación porque su función es la misma: no dejar que el tronco ceda.
  'bird-dog': 'core-anti-rotation', 'side-plank': 'core-anti-rotation',
};

// Does a movement pattern count as core work? Use this instead of `=== 'core'`, which no
// longer matches anything since the split above.
function isCorePattern(p) { return typeof p === 'string' && p.startsWith('core'); }

// Seed the plans store with the hardcoded PLAN if empty
async function ensurePlanSeeded() {
  const plans = await dbGetAll('plans');
  if (plans.length > 0) return;
  const seedPlan = {
    id: 'plan_v1',
    version: 1,
    createdAt: new Date().toISOString(),
    weekNumber: null,
    label: 'Upper/Lower 4-Day Split',
    sessions: JSON.parse(JSON.stringify(PLAN.sessions)),
    weekTemplate: JSON.parse(JSON.stringify(WEEK_TEMPLATE)),
  };
  await smartPut('plans', seedPlan);
  console.log('[Plan] Seeded plan_v1 from hardcoded PLAN');
}

// Build the exercise library from PLAN sessions + EXERCISE_ALTERNATIVES
async function ensureExerciseLibrarySeeded() {
  const existing = await dbGetAll('exercises');
  if (existing.length > 0) return;
  const exMap = {};
  // From PLAN sessions
  for (const s of Object.values(PLAN.sessions)) {
    for (const ex of s.exercises) {
      if (!exMap[ex.id]) {
        exMap[ex.id] = {
          id: ex.id, name: ex.name, muscle: ex.muscle,
          movementPattern: MOVEMENT_PATTERNS[ex.id] || 'other',
          bw: !!ex.bw, defaultNotes: ex.notes || '', custom: false,
        };
      }
    }
  }
  // From EXERCISE_ALTERNATIVES
  for (const [muscle, alts] of Object.entries(EXERCISE_ALTERNATIVES)) {
    for (const alt of alts) {
      if (!exMap[alt.id]) {
        exMap[alt.id] = {
          id: alt.id, name: alt.name, muscle,
          movementPattern: MOVEMENT_PATTERNS[alt.id] || 'other',
          bw: false, defaultNotes: '', custom: false,
        };
      }
    }
  }
  for (const ex of Object.values(exMap)) {
    await smartPut('exercises', ex);
  }
  console.log(`[Plan] Seeded ${Object.keys(exMap).length} exercises`);
}

// Load the highest-version plan into memory
async function loadActivePlan() {
  const plans = await dbGetAll('plans');
  if (plans.length > 0) {
    plans.sort((a, b) => b.version - a.version);
    activePlan = plans[0];
    activeWeekTemplate = activePlan.weekTemplate;
  } else {
    // Fallback to hardcoded (should not happen after seed)
    activePlan = { sessions: PLAN.sessions, weekTemplate: WEEK_TEMPLATE, version: 0, label: 'Fallback' };
    activeWeekTemplate = WEEK_TEMPLATE;
  }
  console.log(`[Plan] Active: v${activePlan.version} "${activePlan.label}"`);
}

// Load exercise library into memory for fast lookups
async function loadExerciseLibrary() {
  const all = await dbGetAll('exercises');
  exerciseLibrary = {};
  all.forEach(ex => { exerciseLibrary[ex.id] = ex; });
  console.log(`[Plan] Exercise library: ${all.length} exercises loaded`);
}

// ==================== EXERCISE SWAP OVERRIDES (T5.2) ====================
// Persistent, reversible per-session exercise swaps. Shape:
//   { [sessionId]: { [originalExId]: { id, name } } }
// Stored in settings (synced), applied at render time. Survives reloads and
// future sessions, and is NOT wiped when the ideal variant regenerates the plan
// (that only touches weekTemplate + base sessions, not this override map).
let exerciseOverrides = {};

async function loadExerciseOverrides() {
  const saved = await dbGet('settings', 'exerciseOverrides');
  exerciseOverrides = (saved && saved.data) || {};
}

async function setExerciseOverride(sessionId, origId, newId, newName) {
  if (!exerciseOverrides[sessionId]) exerciseOverrides[sessionId] = {};
  exerciseOverrides[sessionId][origId] = { id: newId, name: newName };
  await smartPut('settings', { key: 'exerciseOverrides', data: exerciseOverrides });
}

async function clearExerciseOverride(sessionId, origId) {
  if (exerciseOverrides[sessionId]) {
    delete exerciseOverrides[sessionId][origId];
    if (!Object.keys(exerciseOverrides[sessionId]).length) delete exerciseOverrides[sessionId];
  }
  await smartPut('settings', { key: 'exerciseOverrides', data: exerciseOverrides });
}

// Apply the saved overrides to a session's exercise list. Keeps the slot's
// programming (sets/reps/RPE/rest/superset) and only swaps the movement; tracks
// _origId/_origName so the swap is reversible in the UI.
function resolveSessionExercises(sessionId, exercises) {
  const ov = exerciseOverrides[sessionId];
  if (!ov || !Array.isArray(exercises)) return exercises;
  return exercises.map(ex => {
    const sub = ov[ex.id];
    if (!sub) return ex;
    return { ...ex, id: sub.id, name: sub.name, _origId: ex.id, _origName: ex.name };
  });
}

// Create a new plan version (for weekly updates)
//
// `modifications.meta` (Coach v2, v11.55) es el sobre de metadatos del plan v2:
// `schema`, `status`, `author`, `basedOn`, `weekKey`, `reviewId`, `block`, `running`,
// `seedRev`. Se esparce DESPUÉS de los campos base para que el coach pueda estamparlos, y
// `id`/`version`/`createdAt` se reafirman después del spread: son la identidad de la fila y
// el invariante del que cuelga todo lo demás ("plan activo = versión más alta"). Un `meta`
// que pudiera pisar `version` convertiría cualquier propuesta en el plan vivo de todos los
// dispositivos, incluidos los que corren código viejo.
async function createNewPlanVersion(modifications) {
  const plans = await dbGetAll('plans');
  // `Number(p.version) || 0` y no `p.version`: las primeras filas de abril de 2026 no llevan
  // `version`, y un solo `undefined` dentro de `Math.max` devuelve NaN → `plan_vNaN`, que
  // ordena mal, colisiona con el siguiente NaN y sobrescribe el plan del usuario.
  // `tests/verify-plan-v2-compat.mjs` cubre el caso.
  const currentVersion = Math.max(...plans.map(p => Number(p.version) || 0), 0);
  const meta = (modifications && typeof modifications.meta === 'object' && modifications.meta) || {};
  const newPlan = {
    weekNumber: modifications.weekNumber || getWeekNumber(),
    label: modifications.label || activePlan.label,
    sessions: JSON.parse(JSON.stringify(modifications.sessions || activePlan.sessions)),
    weekTemplate: JSON.parse(JSON.stringify(modifications.weekTemplate || activeWeekTemplate)),
    ...meta,
    id: `plan_v${currentVersion + 1}`,
    version: currentVersion + 1,
    createdAt: new Date().toISOString(),
  };
  await smartPut('plans', newPlan);
  activePlan = newPlan;
  activeWeekTemplate = newPlan.weekTemplate;
  console.log(`[Plan] Created v${newPlan.version} "${newPlan.label}"`);
  return newPlan;
}

// RETIRADO en v11.66 (auditoría 2026-09-08, E-12): la rampa de re-entrada W26-W28 (junio-julio
// 2026) — su tabla de cargas, la plantilla de semana con una sola tirada y el instalador de plan
// por fecha. Sin llamadores desde T5 (v11.28), cuando el plan ideal pasó a ser el default vivo y
// sustituyó a la rampa directamente. Sus cargas de la última semana son la base de las sesiones
// full/maintenance, así que el número sobrevive aunque el código no.

// ==================== DATABASE ====================
const DB_NAME = 'TrainingApp';
const DB_VERSION = 12;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('workouts')) d.createObjectStore('workouts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('runs')) d.createObjectStore('runs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('nutrition')) d.createObjectStore('nutrition', { keyPath: 'date' });
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('sync_queue')) d.createObjectStore('sync_queue', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('bodyweight')) d.createObjectStore('bodyweight', { keyPath: 'date' });
      // Trash: soft-deleted items kept locally for 2 days
      if (!d.objectStoreNames.contains('trash')) d.createObjectStore('trash', { keyPath: 'trashId' });
      // Dynamic plans (versioned snapshots) and exercise library
      if (!d.objectStoreNames.contains('plans')) d.createObjectStore('plans', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('exercises')) d.createObjectStore('exercises', { keyPath: 'id' });
      // Mobility sessions — added v10.5 (DB v6)
      if (!d.objectStoreNames.contains('mobility_sessions')) d.createObjectStore('mobility_sessions', { keyPath: 'id' });
      // Weekly review cards — added v10.11 (DB v7)
      if (!d.objectStoreNames.contains('weekly_reviews')) d.createObjectStore('weekly_reviews', { keyPath: 'weekKey' });
      // Daily steps — added v10.13 (DB v8)
      if (!d.objectStoreNames.contains('steps')) d.createObjectStore('steps', { keyPath: 'date' });
      // Daily wellness (intervals.icu): readiness, hrv, restingHR, sleep, ctl/atl/rampRate,
      // macros, weight, steps. Cron + body insights read from here. v10.27 (DB v9)
      if (!d.objectStoreNames.contains('wellness')) d.createObjectStore('wellness', { keyPath: 'date' });
      // Unified sessions — T1 (DB v10, v11.10): home for NEW training types (hybrid,
      // athleticism, cardio non-run, benchmark) that don't fit workouts/runs/mobility.
      // Legacy stores stay untouched; reads merge via toSession(). Not yet written to
      // until T2 (logging) — and sync wiring for it is deferred to T2.
      if (!d.objectStoreNames.contains('sessions')) d.createObjectStore('sessions', { keyPath: 'id' });
      // Nutricion v2 — DB v11 (v11.49). `foods` es la biblioteca canonica de alimentos
      // con macros por 100 g; `meals` es una fila por comida registrada con sus items en
      // gramos. El store `nutrition` NO se sustituye: pasa a ser el agregado derivado por
      // dia (recomputeNutritionDay), asi los consumidores que ya leen .protein/.calories
      // siguen funcionando sin cambios.
      if (!d.objectStoreNames.contains('foods')) d.createObjectStore('foods', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meals')) {
        const st = d.createObjectStore('meals', { keyPath: 'id' });
        st.createIndex('date', 'date', { unique: false });
      }
      // Coach v2 — DB v12 (v11.55, 2026-09-07). `coach_reviews` (id = '2026-W37#1') guarda
      // una fila por revisión semanal del coach: facts pack, salida del modelo, propuesta de
      // plan y estado. Las propuestas viven AQUÍ y nunca en `plans`: `loadActivePlan()` toma
      // la versión más alta, así que una fila `proposed` en `plans` sería el plan vivo en
      // cualquier dispositivo con código viejo. `decisions` (id = uid) es el registro de
      // decisiones (coach / regla / readiness / usuario) que da memoria al coach: "te
      // propuse 95 en banca, hiciste 92,5". Ambos aditivos; ambas tablas Supabase creadas
      // antes (supabase/migrations/20260907_coach_reviews_and_decisions.sql).
      if (!d.objectStoreNames.contains('coach_reviews')) d.createObjectStore('coach_reviews', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('decisions')) d.createObjectStore('decisions', { keyPath: 'id' });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

// V-7d (auditoría 2026-09-08): el mismo trío de repintados estaba copiado en cuatro sitios
// (guardar una edición, borrar, deshacer el borrado y restaurar de la papelera) y en dos de
// ellos con una llamada más o una menos que en los otros. Un solo sitio.
async function afterWorkoutSaved() {
  invalidateRenderPass();
  // v11.75: aquí es donde se SABE lo que pasó, así que aquí se recoloca la semana. Va antes de
  // los repintados para que todos lean el calendario ya corregido.
  try { await applyWeekReflow(); } catch (e) { console.warn('[repaint] reflow:', e); }
  // V-5: los cuatro grupos de Stats caducan a la vez — series, volumen, rachas y carga de la
  // semana salen todos del entreno que se acaba de guardar.
  state._statsPainted.clear();
  try { await renderRecentWorkouts(); } catch (e) { console.warn('[repaint] recent workouts:', e); }
  try { await renderWeekBanner(); } catch (e) { console.warn('[repaint] week banner:', e); }
  if (state.currentView === 'stats') {
    try { await renderStats(); } catch (e) { console.warn('[repaint] stats:', e); }
  }
}

// ==================== RENDER PASS MEMO (V-7, auditoría 2026-09-08) ====================
//
// El problema medido: un pintado de Home hacía ~30 transacciones IDB, doce de ellas
// `dbGetAll` de los MISMOS cuatro stores (`workouts`, `runs`, `nutrition`, `sessions`),
// porque cada bloque de Home lee por su cuenta. Stats hacía lo mismo veinte veces.
//
// Semántica del memo, que es lo único que hay que tener en la cabeza:
//   • Sólo existe DENTRO de un pase: `beginRenderPass()` … `endRenderPass()`. Fuera de un
//     pase `dbGetAll` es exactamente lo que era antes — misma firma, misma transacción.
//   • Dentro de un pase, la PRIMERA llamada por store abre la transacción y las demás
//     esperan esa misma promesa. Un pase = una lectura por store.
//   • Cada llamada recibe una COPIA superficial del array (`.slice()`), porque media app
//     hace `(await dbGetAll('workouts')).sort(...)` — ordenar en el sitio el array
//     compartido cambiaría el orden por debajo de los demás bloques del pase. Los objetos
//     de dentro SÍ se comparten: un renderer no debe mutarlos (ninguno lo hace).
//   • Los pases anidan (`afterWorkoutSaved` → `renderStats`): un contador de profundidad
//     mantiene el memo vivo hasta que cierra el pase más externo.
//   • CUALQUIER escritura (`dbPut`/`dbDelete`, y por tanto `smartPut`/`smartDelete` y el
//     pull de la nube) tira el memo: un pase nunca sirve datos anteriores a una escritura.
let _renderPass = null;   // { depth, reads: Map<store, Promise<Array>> }

function beginRenderPass() {
  if (_renderPass) { _renderPass.depth++; return; }
  _renderPass = { depth: 1, reads: new Map() };
}

function endRenderPass() {
  if (!_renderPass) return;
  _renderPass.depth--;
  if (_renderPass.depth <= 0) _renderPass = null;
}

function invalidateRenderPass() {
  if (_renderPass) _renderPass.reads.clear();
}

function dbPut(store, data) {
  invalidateRenderPass();
  // La caché del calendario personalizado vive en `state` (V-7a): cualquier escritura de
  // `settings/weekSchedule` — la propia app, o una fila que baja de la nube — la tira.
  if (store === 'settings' && data && data.key === 'weekSchedule') state._weekSchedule = null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function dbGetAll(store) {
  if (_renderPass) {
    let p = _renderPass.reads.get(store);
    if (!p) { p = _dbGetAllRaw(store); _renderPass.reads.set(store, p); }
    // Copia por llamador: el memo ahorra la transacción, no el array.
    return p.then(arr => (arr || []).slice());
  }
  return _dbGetAllRaw(store);
}

function _dbGetAllRaw(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function dbDelete(store, key) {
  invalidateRenderPass();
  if (store === 'settings' && key === 'weekSchedule') state._weekSchedule = null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

// ==================== SECRETOS QUE NO SINCRONIZAN (C-8) ====================
//
// `settings/userSettings` viaja a Supabase entero, y dentro llevaba dos secretos operativos:
// con `stepsSecret` cualquiera escribe en `steps` a través de `steps-ingest`, y con la API key
// de intervals.icu se lee todo el histórico del atleta. v11.70 (S-2) los quitó del BACKUP; esto
// los quita de la FILA, que es la mitad que faltaba.
//
// Dónde viven ahora: `localStorage`, por dispositivo. Es la decisión correcta mientras el
// destino final (A-7: `integration_tokens` en el servidor, como WHOOP y Withings) no exista —
// una API key no es preferencia de usuario, es una credencial, y una credencial no se replica
// a todos los dispositivos por comodidad.
//
// Se leen por UN accesor cada una (`intervalsApiKey()`, `stepsSecret()`), que además MIGRA el
// valor que ya esté en la fila la primera vez que se lee: nadie tiene que volver a teclear la
// clave, y en la siguiente escritura de `userSettings` desaparece de la fila.
const LOCAL_ONLY_KEYS = ['intervalsIcuApiKey', 'stepsSecret'];
const LOCAL_ONLY_PREFIX = 'training_secret_';

function _localOnlyRead(key) {
  let v = null;
  try { v = localStorage.getItem(LOCAL_ONLY_PREFIX + key); } catch (e) { v = null; }
  if (v) return v;
  // Migración perezosa desde la fila sincronizada. `state.settings` la conserva en memoria
  // hasta la próxima escritura; a partir de ahí el único sitio es localStorage.
  const heredado = (state && state.settings) ? state.settings[key] : null;
  if (typeof heredado === 'string' && heredado.trim()) {
    _localOnlyWrite(key, heredado.trim());
    return heredado.trim();
  }
  return '';
}

function _localOnlyWrite(key, value) {
  const v = (value == null) ? '' : String(value).trim();
  try {
    if (v) localStorage.setItem(LOCAL_ONLY_PREFIX + key, v);
    else localStorage.removeItem(LOCAL_ONLY_PREFIX + key);
  } catch (e) { console.warn('[secretos] no se pudo guardar', key, e); }
  // Y fuera de la fila: `state.settings` es lo que se serializa en cada `smartPut`.
  if (state && state.settings) delete state.settings[key];
}

/** La API key de intervals.icu. '' si no hay. Único lector permitido. */
function intervalsApiKey() { return _localOnlyRead('intervalsIcuApiKey'); }
function setIntervalsApiKey(v) { _localOnlyWrite('intervalsIcuApiKey', v); }
/** El secreto compartido con `steps-ingest`. '' si no hay. */
function stepsSecret() { return _localOnlyRead('stepsSecret'); }
function setStepsSecret(v) { _localOnlyWrite('stepsSecret', v); }

/** Copia de `userSettings` sin los secretos. No muta la entrada. */
function _stripLocalOnly(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
  if (!LOCAL_ONLY_KEYS.some((k) => k in data)) return data;
  const out = Object.assign({}, data);
  for (const k of LOCAL_ONLY_KEYS) delete out[k];
  return out;
}

// ==================== SYNCED DB HELPERS ====================
function smartPut(store, data) {
  // C-8: el filtro va AQUÍ y no en los ~20 llamadores. `smartPut('settings', {key:
  // 'userSettings', data: state.settings})` aparece en app.js y en coach.js; filtrar en cada
  // sitio garantiza que el próximo incremento se olvide de uno.
  if (store === 'settings' && data && data.key === 'userSettings') {
    const limpio = _stripLocalOnly(data.data);
    if (limpio !== data.data) data = Object.assign({}, data, { data: limpio });
  }
  if (window.syncedPut) return window.syncedPut(store, data);
  return dbPut(store, data);
}
function smartDelete(store, key) {
  if (window.syncedDelete) return window.syncedDelete(store, key);
  return dbDelete(store, key);
}

// ==================== STATE ====================
const state = {
  currentTab: 'home',
  currentView: 'home',
  // V-5: qué grupos de Stats ya están pintados. Efímero (no se persiste): al arrancar la app
  // no hay nada pintado. Lo vacía `afterWorkoutSaved()`.
  _statsPainted: new Set(),
  activeSession: null,
  // Definición de la sesión libre en curso (v11.44). Efímera; su instantánea vive en
  // settings.activeWorkout.adHoc. Nunca se escribe en el store `plans`.
  adHocSession: null,
  viewingCompleted: false,
  // B-2: la pestaña desde la que se abrió un entreno guardado, para que "volver" vuelva ahí.
  viewingCompletedFrom: null,
  workoutStartTime: null,
  workoutTimerInterval: null,
  restTimerInterval: null,
  restTimerRemaining: 0,
  restTimerTotal: 0,
  settings: { unit: 'kg', proteinTarget: 185, calorieTargetTraining: 2700, calorieTargetRest: 2400, calorieTarget: 2570, startDate: null, userName: '', goalWeight: null, idealVariant: 6 },
  sessionQuality: 3,
  quickMode: false,
  // Objetivo de kg por ejercicio de la sesión en curso (v11.57). Lo llena `startWorkout` y lo
  // sella `finishWorkout` en el registro; `clearActiveWorkout` lo limpia.
  activeTargets: null,
  // Instantánea del readiness con el que se arrancó la sesión. Viaja en
  // `settings.activeWorkout` y se sella en el registro (`readinessAtStart`) como LOG PURO: el
  // coach semanal lo lee para contextualizar la semana, y nadie lo usa para cambiar el día
  // (v11.62). `clearActiveWorkout` lo limpia.
  activeReadiness: null,
  selectedStrengthLift: 'bench-press',
  // V-7a: caché del calendario personalizado (`settings/weekSchedule`). La invalida `dbPut`.
  _weekSchedule: null,
};

// ==================== ONE-SHOT MIGRATION: tz date fix ====================
// Previous versions used toISOString() which is UTC. For users east/west of
// UTC, evening workouts were saved to the next day. This runs once: for each
// workout/run from the last 90 days, if the stored `date` is exactly 1 day
// ahead of what the id's epoch converts to in local time, fix it.
//
// v1 had a slice bug (took 9 chars when Date.now().toString(36) is 8) so the
// parsed epoch was garbage — v2 rolls a new flag and re-runs correctly.
// One-shot: reset the cloud-sync watermark so the next syncAll re-pulls ALL
// rows from Supabase. Used to recover workouts that were locally deleted but
// still exist in cloud (e.g. accidental tap on the old delete X).
async function oneShotCloudRecovery() {
  if (localStorage.getItem('cloud_recovery_v1')) return;
  try {
    await dbDelete('settings', 'lastSyncTimestamp');
    localStorage.setItem('cloud_recovery_v1', String(Date.now()));
    console.log('[Recovery] lastSyncTimestamp reset — next sync will full-pull');
  } catch (e) { console.warn('[Recovery] Failed:', e); }
}

// Scan local sync_queue for pending delete entries and restore them.
// If a delete was enqueued but never drained to cloud (offline, app closed,
// error), the full item data is still sitting in the queue — we can recover
// it and cancel the delete.
async function recoverFromSyncQueue() {
  const restored = [];
  try {
    const queue = await dbGetAll('sync_queue');
    for (const q of queue) {
      if (q.action !== 'delete' || q.store !== 'workouts') continue;
      if (!q.data || !q.data.id) continue;
      // Make sure it's not already present locally
      const existing = await dbGet('workouts', q.data.id);
      if (!existing) {
        const clean = { ...q.data };
        delete clean._updated_at;
        await dbPut('workouts', clean);
        restored.push({ id: clean.id, session: clean.session, date: clean.date });
      }
      // Cancel the pending delete either way
      await dbDelete('sync_queue', q.id);
    }
  } catch (e) { console.warn('[Recovery] sync_queue scan failed:', e); }
  return restored;
}

// Force-pull every workout from Supabase and merge into local.
// Returns an array of summaries of anything that was new or different.
async function forceCloudPull() {
  const added = [];
  if (!window.supabaseClient && !window.initSupabase) return added;
  // Use the global set in supabase-sync.js
  const client = window.__supabaseClient || null;
  // Fallback: call syncAll after resetting the watermark
  try {
    await dbDelete('settings', 'lastSyncTimestamp');
  } catch {}
  if (typeof window.syncAll === 'function') {
    await window.syncAll();
  }
  // After sync, re-check local count
  const local = await dbGetAll('workouts');
  return local;
}

async function listCloudWorkouts() {
  // Directly query Supabase for all workouts for this user
  const client = window.__supabaseClient;
  if (!client) return { error: 'Supabase client not initialized' };
  const user = typeof window.getSupaUser === 'function' ? await window.getSupaUser() : null;
  if (!user) return { error: 'Not logged in' };
  const { data, error } = await client
    .from('workouts')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return { error: error.message };
  return { rows: data || [] };
}

async function migrateWorkoutDatesToLocal() {
  if (localStorage.getItem('tz_date_migration_v2')) return;
  try {
    let fixed = 0;
    const details = [];
    const minEpoch = new Date('2020-01-01').getTime();
    const maxEpoch = Date.now() + 86400000;
    const fixCollection = async (storeName) => {
      const items = await dbGetAll(storeName);
      for (const item of items) {
        if (!item.id || !item.date) continue;
        // uid() = Date.now().toString(36) + random. Date.now() is 8 base36 chars.
        const epochMs = parseInt(item.id.slice(0, 8), 36);
        if (!isFinite(epochMs) || epochMs < minEpoch || epochMs > maxEpoch) continue;
        if (Date.now() - epochMs > 90 * 86400000) continue;
        const localDate = dateStr(new Date(epochMs));
        if (localDate === item.date) continue;
        const stored = new Date(item.date + 'T00:00:00');
        const inferred = new Date(localDate + 'T00:00:00');
        const diffDays = Math.round((stored - inferred) / 86400000);
        // Only auto-fix the classic +1 day UTC drift
        if (diffDays === 1) {
          details.push(`${storeName} ${item.session || ''} ${item.date}→${localDate}`);
          item.date = localDate;
          await smartPut(storeName, item);
          fixed++;
        }
      }
    };
    await fixCollection('workouts');
    await fixCollection('runs');
    localStorage.setItem('tz_date_migration_v2', String(Date.now()));
    if (fixed > 0) {
      console.log(`[migration v2] Fixed ${fixed}:`, details);
      setTimeout(() => {
        if (typeof toast === 'function') toast(`Fixed ${fixed} workout date${fixed === 1 ? '' : 's'}`);
      }, 1800);
    } else {
      console.log('[migration v2] No records needed fixing');
    }
  } catch (e) {
    console.warn('[migration v2] tz date fix failed:', e);
  }
}

// ==================== UTILITIES ====================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
// Local-date YYYY-MM-DD (NOT UTC — toISOString() drifts by tz and breaks streaks
// for users east/west of UTC. Julian is in UTC-3 so evening workouts were
// getting logged as the next day.)
function today() { return dateStr(new Date()); }

function formatDate(d) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// C-28 (auditoría 2026-09-09): la causa en el toast, cuando es corta y no filtra nada.
//
// "Error restoring backup" obliga a abrir la consola de Safari en el móvil, o sea a no
// enterarse: un JSON de otra versión, un store que no existe y un disco lleno daban el mismo
// texto. Se recorta a 90 caracteres (el toast mide 340 px) y se colapsa el espacio en blanco,
// para que un stack multilínea no rompa la caja.
//
// Lo que NO pasa por aquí: el texto crudo de PostgREST (C-29, del lado del servidor). Esto es
// para errores del navegador, que son de este dispositivo y no describen la base de datos.
const ERR_TEXT_MAX = 90;
function errText(e, fallback) {
  const raw = (e && (e.message || e.error_description || e.error)) || e || '';
  const s = String(raw).replace(/\s+/g, ' ').trim();
  if (!s || s === '[object Object]') return fallback || 'unknown error';
  return s.length > ERR_TEXT_MAX ? s.slice(0, ERR_TEXT_MAX - 1) + '…' : s;
}

let _toastTimeout = null;
function toast(msg, action) {
  // `:not(.toast-sticky)`: el chip de versión nueva (C-6) es un `.toast` persistente con su
  // propio id, y sin este filtro el primer `toast()` de la sesión lo reutilizaría como
  // contenedor y borraría el aviso de actualización.
  let el = document.querySelector('.toast:not(.toast-sticky)');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  if (_toastTimeout) clearTimeout(_toastTimeout);

  if (action) {
    el.innerHTML = `<span>${msg}</span><button class="toast-action">${action.label}</button>`;
    el.querySelector('.toast-action').addEventListener('click', () => {
      action.callback();
      el.classList.remove('show');
    });
    el.classList.add('show');
    _toastTimeout = setTimeout(() => {
      el.classList.remove('show');
      if (action.onExpire) action.onExpire();
    }, 5000);
  } else {
    el.innerHTML = `<span>${msg}</span>`;
    el.classList.add('show');
    _toastTimeout = setTimeout(() => el.classList.remove('show'), 2200);
  }
}

function getWeekNumber() {
  const start = state.settings.startDate;
  if (!start) return 1;
  const startDate = new Date(start + 'T00:00:00');
  const now = new Date();
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

// Deload cadence — anchored to the IDEAL's 5-week block (4 build + 1 deload, LOAD-004).
//
// Until v11.35 this was `weekNum === 5 || weekNum === 9`, hardcoded to the April 2026
// program. getWeekNumber() counts from settings.startDate, so once week 9 passed this
// returned FALSE FOREVER — no programmed deload could fire from mid-May onward, across
// the 5 places that call it. The reactive deload path (retired in v11.62) needed workouts,
// which stopped syncing on 2026-06-30, so there was no fallback either.
//
// The anchor is stored, not derived from startDate, so switching this on does NOT
// retroactively make the current week a deload: the first one lands 4 weeks out.
//
// v11.56 — EL ANCLA PASA A SER UNA FECHA (`settings.deloadAnchorDate`, lunes ISO).
// Antes era `deloadAnchorWeek`, un número de `getWeekNumber()`, o sea "semanas desde
// `settings.startDate`" — y `startDate` se edita en Ajustes. Cambiarla un día que cruce el
// lunes desplazaba `weekNum` en 1 y el deload se movía de semana SIN AVISO (audit F-13).
// Ahora hay UNA sola aritmética, la del motor puro (`blockWeekFromDates` en coach-engine.js),
// y `getWeekNumber()` vuelve a ser lo que debería haber sido siempre: una etiqueta.
// `deloadAnchorWeek` se conserva en settings (código viejo y backups lo leen), pero ninguna
// decisión sale de él.
const DELOAD_BLOCK_WEEKS = 5;

function deloadAnchorWeek() {
  const a = state.settings && state.settings.deloadAnchorWeek;
  return (typeof a === 'number' && a > 0) ? a : null;
}

// La semana del bloque de una fecha: `{ index 1..5, isDeload, label, blockStartMonday,
// deloadMonday }`. Único punto de la app que sabe contar semanas de bloque.
function blockWeek(date = new Date()) {
  const anchor = (state.settings && state.settings.deloadAnchorDate) || null;
  if (typeof blockWeekFromDates !== 'function') {      // coach-engine.js no cargó
    return { index: null, isDeload: false, weeksIntoBlock: null, label: 'no anchor', blockStartMonday: null, deloadMonday: null };
  }
  return blockWeekFromDates(dateStr(date), anchor, DELOAD_BLOCK_WEEKS);
}

// Fecha (local) en la que arranca una semana de app. `getWeekNumber()` cuenta semanas de 7
// días desde `startDate`, así que las semanas de app empiezan el día de la semana de
// `startDate` — NO necesariamente lunes. Se convierte a fecha y `blockWeek` la normaliza a su
// lunes ISO; para la semana en curso se usa hoy directamente, que es lo que piden los ~8
// llamadores de `isDeloadWeek` (todos pasan `getWeekNumber()`).
function _weekNumToDate(weekNum) {
  const wk = Math.floor(Number(weekNum));
  if (!isFinite(wk) || wk === getWeekNumber()) return new Date();
  const start = state.settings && state.settings.startDate;
  // MISMA ARITMÉTICA QUE LA MIGRACIÓN DEL ANCLA (E-9): `anchorDateFromWeek` cuenta los 7 días
  // en UTC y normaliza al lunes ISO, igual que `blockWeekFromDates`. La versión anterior sumaba
  // días con `setDate` en hora local (deriva en los cambios de horario) y, sin `startDate`,
  // devolvía HOY para cualquier semana: la semana 12 heredaba el deload de la semana en curso.
  const monday = (start && typeof anchorDateFromWeek === 'function')
    ? anchorDateFromWeek(start, Math.max(1, wk))
    : null;
  return monday ? new Date(monday + 'T12:00:00') : null;
}

// Firma intacta (número de semana de app) por sus llamadores; la aritmética es una sola.
// null = no se puede saber (no hay `startDate` y la semana no es la de hoy) → no es deload:
// inventar un deload es recortar una semana entera de entreno por una fecha que falta.
function isDeloadWeek(weekNum) {
  const d = _weekNumToDate(weekNum);
  return d ? blockWeek(d).isDeload : false;
}

// Pone el ancla una sola vez.
//  · Si ya hay `deloadAnchorDate`, no se toca (el coach o el usuario pueden haberlo fijado).
//  · Si existe el `deloadAnchorWeek` viejo, se MIGRA a fecha: la coherencia con lo que el
//    usuario ya venía viendo importa más que empezar limpio.
//  · Si no hay nada, se ancla al lunes de esta semana, así el primer deload queda 4 semanas
//    fuera y se ve venir en vez de perder una semana a un recorte del 50 % por sorpresa.
async function ensureDeloadAnchor() {
  if (typeof mondayOf !== 'function') {                // coach-engine.js no cargó
    console.warn('[Deload] coach-engine.js no disponible; ancla sin sembrar');
    return;
  }
  if (state.settings.deloadAnchorDate) return;
  const legacy = deloadAnchorWeek();
  const migrated = legacy ? anchorDateFromWeek(state.settings.startDate, legacy) : null;
  state.settings.deloadAnchorDate = migrated || mondayOf(today());
  // Se mantiene poblado para código viejo y para los backups ya exportados; nada decide con él.
  if (!legacy) state.settings.deloadAnchorWeek = getWeekNumber();
  try { await smartPut('settings', { key: 'userSettings', data: state.settings }); } catch (e) {}
  console.log(`[Deload] Ancla = ${state.settings.deloadAnchorDate} (${migrated ? `migrada de la semana ${legacy}` : 'lunes de esta semana'}); próximo deload la semana del ${blockWeek().deloadMonday}`);
}

// ==================== COACH V2 · OBJETIVOS ====================
//
// Siembra `settings.goals` la primera vez, con `COACH_GOALS_DEFAULT` (coach-engine.js).
// Hasta ahora los objetivos vivían en `docs/goals.md`, en el prompt del cron y en la cabeza
// del usuario: tres copias que se desincronizan y ninguna que la app pueda leer. Desde
// v11.55 son un dato de `userSettings`, así que el facts pack y `goalProgress` (incremento 6)
// leen lo mismo que ve el usuario.
//
// Copia profunda a propósito: `COACH_GOALS_DEFAULT` es una constante compartida del módulo;
// guardar una referencia y dejar que el usuario edite el rango de peso mutaría el default
// para el resto de la sesión.
//
// No sobreescribe nunca lo que ya haya: si el usuario (o el coach) ajustó un objetivo, el
// arranque no puede devolverlo al valor de fábrica. Misma forma que `ensureDeloadAnchor()`,
// y la misma ruta de escritura (`smartPut` en `userSettings`) — que desde v11.55 sí llega a
// la nube aunque corra antes de la auth (`enqueueSync` gatea por configuración).
async function ensureGoals() {
  if (state.settings.goals) return;
  if (typeof COACH_GOALS_DEFAULT === 'undefined') {   // coach-engine.js no cargó
    console.warn('[Coach] COACH_GOALS_DEFAULT no disponible; objetivos sin sembrar');
    return;
  }
  state.settings.goals = JSON.parse(JSON.stringify(COACH_GOALS_DEFAULT));
  state.settings.goals.updatedAt = new Date().toISOString();
  try { await smartPut('settings', { key: 'userSettings', data: state.settings }); } catch (e) {}
  console.log('[Coach] Objetivos sembrados desde COACH_GOALS_DEFAULT');
}

// ==================== COACH V2 · DECISIONS ====================
//
// El registro de decisiones (store/tabla `decisions`, DB v12, v11.55). Es la memoria del
// coach: sin él, cada revisión semanal empieza de cero y el sistema no puede decir "te
// propuse 95 en banca, hiciste 92,5×8/8/7" ni retirar una decisión que no funcionó. El
// facts pack (incremento 7) lee las últimas 30 filas.
//
// UN REGISTRO POR DECISIÓN, no por set: una lectura de sesión (`session-readout`) lleva su
// detalle por ejercicio en `evidence.perExercise`. Granularidad por set inundaría la cola de
// sync y no añadiría nada que el store `workouts` no tenga ya.
//
// Nadie llama a `logDecision` todavía: los llamantes llegan con la progresión (incremento 3,
// `session-readout`), el ajuste por recuperación (incremento 5) y la aprobación de propuestas
// (incremento 9). Los cimientos van primero para que el esquema y el sync estén probados
// antes de que haya datos que migrar.
//
// `smartPut` y no `dbPut`: es dato de usuario y tiene tabla en Supabase. Escribirlo crudo
// repetiría el bug de `exercises` (F-1), que estuvo meses con 0 filas en la nube.
async function logDecision(d) {
  const date = (d && d.date) || today();
  const rec = {
    id: uid(),
    ts: Date.now(),
    date,
    weekKey: typeof isoWeekKey === 'function' ? isoWeekKey(date) : null,
    source: 'rule',
    type: 'other',
    what: '',
    why: '',
    ruleIds: [],
    evidence: {},
    ref: {},
    outcome: null,
    ...(d || {}),
  };
  try {
    await smartPut('decisions', rec);
    await pruneDecisions();
  } catch (e) { console.warn('[Coach] logDecision:', e); }
  return rec;
}

// Poda LOCAL, y sólo local, a propósito: la nube conserva el historial completo (el borrado
// va con `dbDelete`, no con `smartDelete`, así que no encola ningún delete). El teléfono no
// necesita más de 500 decisiones —el facts pack usa 30— y una tabla local que crece sin techo
// acaba costando tiempo de arranque en cada `dbGetAll`.
async function pruneDecisions(max = 500) {
  try {
    const all = await dbGetAll('decisions');
    if (!all || all.length <= max) return 0;
    const sobra = all.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(0, all.length - max);
    for (const r of sobra) {
      try { await dbDelete('decisions', r.id); } catch (e) {}
    }
    return sobra.length;
  } catch (e) { return 0; }
}

// Which calendar week (from getWeekNumber) is the next deload?
//
// v11.56: se deriva de `blockWeek()` — el `deloadMonday` del bloque en curso traducido a
// número de semana de app — en vez de repetir el modulo con el ancla vieja. Dos aritméticas
// para el mismo concepto es cómo la etiqueta ("deload en 2 semanas") acaba contradiciendo al
// recorte de series que sí ocurre.
function nextDeloadWeek() {
  const blk = blockWeek();
  if (!blk.deloadMonday) return null;
  return _appWeekNumFor(blk.deloadMonday);
}

// Número de semana de app de una fecha 'YYYY-MM-DD' (inverso de `getWeekNumber()`, que sólo
// sabe de hoy). Redondeo, no truncado: entre dos fechas locales un cambio de horario mete una
// hora de diferencia y `Math.floor` restaría un día entero.
function _appWeekNumFor(ds) {
  const start = state.settings && state.settings.startDate;
  if (!start || !ds) return null;
  const days = Math.round((Date.parse(ds + 'T00:00:00') - Date.parse(start + 'T00:00:00')) / 86400000);
  if (!isFinite(days)) return null;
  return Math.max(1, Math.floor(days / 7) + 1);
}

// C-24: el lunes lo decide `mondayOf()` del motor (UTC, domingo = último día de SU semana) y
// los seis días siguientes `addDays()`. Antes esta función tenía su propia aritmética de lunes
// —una de las cinco de la app— y contaba en hora local, así que un domingo por la noche podía
// devolver una semana distinta de la que usaba el pack del coach.
//
// Devuelve Date y no cadenas porque sus once llamadores hacen `dateStr(d)` y `d.getDay()`.
// Mediodía local: la hora no se usa para nada, y a las 12:00 ningún desfase de zona horaria
// cambia el día.
function getWeekDates() {
  const monday = mondayOf(today());
  return Array.from({ length: 7 }, (_, i) => new Date(addDays(monday, i) + 'T12:00:00'));
}

// C-25: LA ÚNICA fecha local de la app. `whoop.js` tenía su propio `_whoopLocalDateStr` byte a
// byte igual salvo en la tolerancia a la entrada, "porque whoop.js se carga antes que app.js".
// El orden de los <script> no importa aquí: ninguna de esas llamadas ocurre en tiempo de
// evaluación, así que cuando se ejecutan este global ya existe. La firma se ensancha con lo que
// aportaba la copia (sin argumento = ahora, entrada inválida = null), que es un superconjunto.
function dateStr(d) {
  // Local YYYY-MM-DD — must NOT use toISOString() (it converts to UTC and drops
  // evening workouts into the wrong day for any non-UTC user).
  const dt = (d instanceof Date) ? d : (d != null ? new Date(d) : new Date());
  if (isNaN(dt.getTime())) return null;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ==================== BLOCK TIMERS (per-block estimated + actual durations) ====================
// A "block" is a derived UI grouping of the workout: warmup + each exercise (or superset group).
// We estimate per-block duration up front and track actual time the user spends on each.
function parseRepsAvg(repsStr) {
  if (!repsStr) return 8;
  const s = String(repsStr).trim();
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (m) return (parseInt(m[1]) + parseInt(m[2])) / 2;
  const n = parseFloat(s);
  return isFinite(n) && n > 0 ? n : 8;
}

function estimateExerciseSec(ex, deload) {
  const sets = deload ? Math.ceil(ex.sets / 2) : ex.sets;
  const reps = parseRepsAvg(ex.reps);
  const rest = ex.defaultRest || 120;
  const setSec = reps * 4 + 20; // ~4s/rep + 20s setup
  // sets working time + rest between sets (no rest after last set, since user moves on)
  return sets * setSec + Math.max(0, sets - 1) * rest;
}

// `deload` puede ser un booleano (toda la sesión) o un PREDICADO `(exId) => boolean` (E-5):
// en una semana de descarga sobre un plan del coach, sólo los ejercicios sin objetivo del
// coach recortan series, y la estimación de tiempo tiene que reflejarlo o el "~52 min" de la
// pantalla describe una sesión que no es la que se va a hacer.
function computeBlocks(session, deload) {
  const dl = (ex) => (typeof deload === 'function' ? !!deload(ex && ex.id) : !!deload);
  const blocks = [];
  // Warmup block: rough estimate based on warmup item count
  const warmupCount = (session.warmup && session.warmup.length) || 0;
  blocks.push({
    id: 'warmup',
    label: 'Warm-up',
    type: 'warmup',
    exerciseIds: [],
    estimatedSec: Math.max(180, warmupCount * 45 + 120), // ramp sets add time
  });

  let currentSS = null;
  session.exercises.forEach((ex) => {
    if (ex.superset) {
      if (currentSS && currentSS.label === ex.superset) {
        currentSS.exercises.push(ex);
      } else {
        currentSS = { label: ex.superset, exercises: [ex] };
        const id = `ss-${ex.superset}`;
        blocks.push({ id, label: `Superset ${ex.superset}`, type: 'superset', _ref: currentSS, exerciseIds: [ex.id] });
      }
      // Update exerciseIds on the existing block for this superset
      const ssBlock = blocks.find(b => b.id === `ss-${ex.superset}`);
      if (ssBlock && !ssBlock.exerciseIds.includes(ex.id)) ssBlock.exerciseIds.push(ex.id);
    } else {
      currentSS = null;
      blocks.push({
        id: `ex-${ex.id}`,
        label: ex.name,
        type: 'single',
        exerciseIds: [ex.id],
        estimatedSec: estimateExerciseSec(ex, dl(ex)),
      });
    }
  });

  // Estimate superset blocks (sum of exercises + short rest between)
  blocks.forEach(b => {
    if (b.type === 'superset') {
      const exs = session.exercises.filter(e => b.exerciseIds.includes(e.id));
      const total = exs.reduce((s, e) => s + estimateExerciseSec(e, dl(e)), 0);
      b.estimatedSec = total;
      delete b._ref;
    }
  });
  return blocks;
}

function getBlockIdForExerciseId(exId) {
  if (!state.activeBlocks) return null;
  const b = state.activeBlocks.find(blk => blk.exerciseIds.includes(exId));
  return b ? b.id : null;
}

function formatBlockMin(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function startBlockTimer(blockId) {
  if (!blockId) return;
  if (state.activeBlockId === blockId) return;
  state.activeBlockId = blockId;
  state.activeBlockStartedAt = Date.now();
  if (state.blockTimerInterval) clearInterval(state.blockTimerInterval);
  state.blockTimerInterval = setInterval(updateActiveBlockChip, 1000);
  updateActiveBlockChip();
}

function endBlockTimer(blockId) {
  if (!blockId || state.activeBlockId !== blockId) return;
  const dur = Math.round((Date.now() - state.activeBlockStartedAt) / 1000);
  const block = (state.activeBlocks || []).find(b => b.id === blockId);
  state.blockTimings = state.blockTimings || [];
  // Remove any prior entry for this blockId (in case of re-finalization)
  state.blockTimings = state.blockTimings.filter(t => t.blockId !== blockId);
  state.blockTimings.push({
    blockId,
    label: block ? block.label : blockId,
    estimatedSec: block ? block.estimatedSec : 0,
    startedAt: state.activeBlockStartedAt,
    endedAt: Date.now(),
    durationSec: dur,
  });
  if (state.blockTimerInterval) { clearInterval(state.blockTimerInterval); state.blockTimerInterval = null; }
  // Mark the block header chip as final
  const headerEl = document.querySelector(`[data-block-id="${blockId}"] .block-time-actual`);
  if (headerEl) {
    headerEl.classList.remove('hidden');
    headerEl.classList.add('done');
    headerEl.textContent = formatBlockMin(dur);
  }
  state.activeBlockId = null;
  state.activeBlockStartedAt = null;
}

function updateActiveBlockChip() {
  if (!state.activeBlockId || !state.activeBlockStartedAt) return;
  const sec = Math.round((Date.now() - state.activeBlockStartedAt) / 1000);
  const block = (state.activeBlocks || []).find(b => b.id === state.activeBlockId);
  const el = document.querySelector(`[data-block-id="${state.activeBlockId}"] .block-time-actual`);
  if (!el) return;
  el.classList.remove('hidden', 'done');
  el.textContent = formatBlockMin(sec);
  if (block && block.estimatedSec && sec > block.estimatedSec * 1.25) {
    el.classList.add('over');
  } else {
    el.classList.remove('over');
  }
}

// Determine which block the user is currently working on, based on which exercise
// has its first unchecked set (or warmup if none started). Then finalize prior + start new.
function advanceBlockIfNeeded() {
  if (!state.activeBlocks) return;
  const cards = [...document.querySelectorAll('#workout-exercises .exercise-card')];
  let nextBlockId = null;
  for (const card of cards) {
    const checks = card.querySelectorAll('.set-check');
    if (!checks.length) continue;
    const unchecked = [...checks].some(c => !c.classList.contains('checked'));
    if (unchecked) { nextBlockId = getBlockIdForExerciseId(card.dataset.exerciseId); break; }
  }
  // If everything is checked, leave activeBlockId as-is (user will hit Finish)
  if (!nextBlockId) return;
  if (state.activeBlockId !== nextBlockId) {
    if (state.activeBlockId) endBlockTimer(state.activeBlockId);
    startBlockTimer(nextBlockId);
  }
}

// Plate breakdown: total weight per side — "bar + 25 /side"
function plateBreakdown(weight, unit) {
  const bar = unit === 'lb' ? 45 : 20;
  if (weight <= bar) return 'bar only';
  const perSide = (weight - bar) / 2;
  // Show clean number: drop ".0" but keep real decimals like 18.75
  const display = perSide % 1 === 0 ? perSide.toFixed(0) : perSide;
  return `bar + ${display} /side`;
}

// Epley formula: 1RM = weight × (1 + reps/30)
function estimate1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Get exercise name from ID
function getExerciseName(exId) {
  if (exerciseLibrary[exId]) return exerciseLibrary[exId].name;
  for (const s of Object.values(activePlan.sessions)) {
    const ex = s.exercises.find(e => e.id === exId);
    if (ex) return ex.name;
  }
  return exId;
}

// ==================== LOGIN SCREEN ====================
function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
}

function hideLoginScreen() {
  document.getElementById('login-screen').classList.add('hidden');
}

function bindLoginEvents() {
  const errEl = document.getElementById('login-error');

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) { errEl.textContent = 'Enter email and password'; return; }
    errEl.textContent = '';
    const { error } = await supaSignIn(email, pass);
    if (error) {
      errEl.textContent = error.message;
    } else {
      hideLoginScreen();
    }
  });

  // Toggle name field for registration
  let registerMode = false;
  document.getElementById('btn-register').addEventListener('click', async () => {
    const nameRow = document.getElementById('login-name-row');
    if (!registerMode) {
      // First click: show name field and switch to register mode
      registerMode = true;
      nameRow.hidden = false;
      document.getElementById('btn-register').textContent = 'Create Account';
      document.getElementById('btn-login').textContent = 'Back to Sign In';
      return;
    }
    const name = document.getElementById('login-name').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    if (!name) { errEl.textContent = 'Enter your name'; return; }
    if (!email || pass.length < 6) { errEl.textContent = 'Email + password (min 6 chars)'; return; }
    errEl.textContent = '';
    // Save name to settings after signup
    state.settings.userName = name;
    await smartPut('settings', { key: 'userSettings', data: state.settings });
    const { error } = await supaSignUp(email, pass);
    if (error) {
      errEl.textContent = error.message;
    } else {
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Check your email to confirm, then sign in.';
      registerMode = false;
      nameRow.hidden = true;
      document.getElementById('btn-register').textContent = 'Create Account';
      document.getElementById('btn-login').textContent = 'Sign In';
    }
  });

  // Allow Enter key to submit
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
}

async function checkAuth() {
  if (!supabaseClient) {
    hideLoginScreen();
    return;
  }
  const user = await getUser();
  if (user) {
    // If no userName saved, derive from email
    if (!state.settings.userName && user.email) {
      state.settings.userName = user.email.split('@')[0];
      await smartPut('settings', { key: 'userSettings', data: state.settings });
    }
    hideLoginScreen();
    showWelcomeScreen();
  } else {
    showLoginScreen();
  }
}

// ==================== WELCOME SCREEN ====================
async function showWelcomeScreen() {
  const name = state.settings.userName || 'there';
  const jsDay = new Date().getDay();
  const plan = activeWeekTemplate[jsDay];
  const wk = getWeekNumber();

  let todayText = '';
  let headsUpHTML = '';
  if (plan.type === 'gym') {
    // Sin la guarda, un id de sesión desconocido en weekTemplate reventaba la pantalla de bienvenida.
    const session = activePlan.sessions[plan.session] || null;
    const deload = isDeloadWeek(wk);
    const numEx = session && session.exercises ? session.exercises.length : 0;
    const estMin = Math.max(35, numEx * 9);
    todayText = `Let's train`;
    headsUpHTML = `
      <div class="wh-title">Today</div>
      <div class="wh-session">${session.icon || ''} ${session.name}${deload ? ' · Deload' : ''}</div>
      <div class="wh-meta">${numEx} exercises · ~${estMin} min · ${session.subtitle}</div>
    `;
  } else if (plan.type === 'run') {
    // v11.35: this used to be gated by getRunsThisWeek(wk) — a 1/2/3-runs-by-week-number
    // ramp from the April plan that always returned 3 by now, and that contradicted the
    // IDEAL (which decides the cardio days itself). Removed; the plan is the authority.
    todayText = `Let's run`;
    headsUpHTML = `
      <div class="wh-title">Today</div>
      <div class="wh-session">🏃 ${plan.label || 'Zone 2 Run'}</div>
      <div class="wh-meta">${plan.durationMin ? `${plan.durationMin} min · ` : ''}Conversational pace · easy effort</div>
    `;
  } else if (plan.type === 'recovery') {
    todayText = 'Active recovery';
    headsUpHTML = `
      <div class="wh-title">Today</div>
      <div class="wh-session">🧘 ${plan.label || 'Active recovery'}</div>
      <div class="wh-meta">Mobility + core${plan.z2FinisherMin ? ` · ${plan.z2FinisherMin} min easy Z2${plan.z2FinisherModality ? ' ' + _z2ModalityLabel(plan.z2FinisherModality) : ''}` : ''}</div>
    `;
  } else {
    todayText = 'Rest day — recover well.';
  }

  document.getElementById('welcome-greeting').textContent = `Hi, ${name}`;
  document.getElementById('welcome-today').textContent = todayText;

  const headsUp = document.getElementById('welcome-headsup');
  if (headsUpHTML) {
    headsUp.innerHTML = headsUpHTML;
    headsUp.classList.remove('hidden');
  } else {
    headsUp.classList.add('hidden');
  }

  // Streak line — only if streak >= 2
  try {
    const workouts = await dbGetAll('workouts');
    const runs = await getRunsDeduped();
    const trainingDates = new Set();
    workouts.forEach(w => trainingDates.add(w.date));
    runs.forEach(r => trainingDates.add(r.date));
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = dateStr(d);
      if (trainingDates.has(ds)) streak++;
      else if (i !== 0) break;
      d.setDate(d.getDate() - 1);
    }
    const streakEl = document.getElementById('welcome-streak');
    if (streak >= 2) {
      const fire = streak >= 7 ? '🔥🔥🔥' : streak >= 4 ? '🔥🔥' : '🔥';
      streakEl.innerHTML = `<span class="welcome-streak-icon">${fire}</span><span class="welcome-streak-text"><strong>${streak}-day streak</strong> — keep it going</span>`;
      streakEl.classList.remove('hidden');
    } else {
      streakEl.classList.add('hidden');
    }
  } catch (e) { /* noop */ }

  document.getElementById('welcome-screen').classList.remove('hidden');

  document.getElementById('btn-welcome-go').addEventListener('click', () => {
    document.getElementById('welcome-screen').classList.add('hidden');
  }, { once: true });

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    document.getElementById('welcome-screen').classList.add('hidden');
  }, 6000);
}

// ==================== THEME ====================
// Dark-only since the Whoop-inspired visual identity (no light mode). Kept as no-ops
// so any legacy callers don't break; the document stays pinned to the dark palette.
function setTheme() {
  document.documentElement.setAttribute('data-theme', 'dark');
  localStorage.setItem('training_theme', 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = '#08090b';
}

function loadTheme() {
  setTheme();
}

// ==================== NAVIGATION ====================
function switchTab(tab) {
  state.currentTab = tab;
  document.body.dataset.tab = tab; // CSS hooks (e.g. hide global header on home for the Lovable top bar)
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  if (tab === 'home') {
    showView('home');
    // B-5: `renderHomeView` es async — sin `catch` un fallo dentro era un rechazo no atendido
    // y Home se quedaba con el pintado anterior sin decir nada.
    renderHomeView().catch(e => console.warn('[Home] render:', e));
  } else if (tab === 'gym') {
    // Use activeSession (not currentView) — currentView gets overwritten by other tabs
    const inWorkout = !!state.activeSession;
    showView(inWorkout ? 'workout' : 'gym');
    if (!inWorkout) {
      renderRecentWorkouts();
      // B-3: el banner de la semana lo pedía la tira retirada.
      renderWeekBanner().catch(e => console.warn('[Gym] week banner:', e));
    }
  } else if (tab === 'cardio') { showView('cardio'); renderRunPlanBanner(); renderCardioLibrary(); renderSessionHistory(); renderRunTotals(); renderRunHistory(); }
  else if (tab === 'nutrition') { showView('nutrition'); renderNutrition(); }
  else if (tab === 'stats') { showView('stats'); renderStats().catch(e => console.warn('[Stats] render:', e)); }
  // BUG-UI-2 fix (v11.12): 'settings' had no branch, so the Home gear/bell/avatar
  // (which call switchTab('settings')) only un-hid the global header ("old bar")
  // without ever activating view-settings. Mirror the #btn-settings handler.
  else if (tab === 'settings') { showView('settings'); renderTrashList(); }

  updateHeader(tab);
}

// B-4 (auditoría 2026-09-08): cinco vistas secundarias (Coach, Ideal, Analítica, Movilidad,
// Ajustes) hacían `showView` y punto. Como `body[data-tab="home"] header { display: none }`
// sigue activo, abrirlas desde Home dejaba la pantalla SIN cabecera: sin título y sin saber
// dónde estabas. Un solo helper hace las tres cosas que hay que hacer siempre.
//   `viewName`  → la sección `#view-<viewName>` que se activa
//   `headerKey` → la clave que entiende `updateHeader` (por defecto, la misma)
function enterSecondaryView(viewName, headerKey) {
  const key = headerKey || viewName;
  showView(viewName);
  updateHeader(key);
  document.body.dataset.tab = key;
  // Ninguna de estas vistas es una pestaña: la barra inferior no debe marcar nada activo.
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === key));
}

function showView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  // FAB visible only during active workout
  const fab = document.getElementById('plate-fab');
  if (fab) fab.classList.toggle('hidden', view !== 'workout');
  // Auto-close the plate sheet if leaving the workout view
  if (view !== 'workout') {
    const sheet = document.getElementById('plate-sheet');
    if (sheet && !sheet.classList.contains('hidden')) closePlateSheet();
  }
}

function updateHeader(tab) {
  const title = document.getElementById('header-title');
  const sub = document.getElementById('header-subtitle');
  title.classList.remove('ctx');
  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);
  // Day number since program start — appended to Week so user can distinguish
  // training week from calendar week (which would never grow into 3-digit days).
  const startDateStr = state.settings.startDate;
  const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
  const dayNum = startDate ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1) : null;
  const dayChip = dayNum ? ` · Day ${dayNum}` : '';
  if (tab === 'gym') {
    // When actively in a workout, title was set by startWorkout — leave it.
    if (state.currentView === 'workout' && state.activeSession) return;
    title.textContent = 'Training';
    sub.textContent = `Week ${wk}${dayChip} · ${deload ? 'Deload' : 'Cut'}`;
  } else if (tab === 'cardio') {
    title.textContent = 'Cardio';
    sub.textContent = `Week ${wk}${dayChip} · Zone 2`;
  } else if (tab === 'nutrition') {
    title.textContent = 'Nutrition';
    sub.textContent = `${state.settings.proteinTarget} g protein · photo to log`;
  } else if (tab === 'stats') {
    title.textContent = 'Stats';
    sub.textContent = `Week ${wk}${dayChip} · ${deload ? 'Deload' : 'Cut Phase'}`;
  } else if (tab === 'settings') {
    title.textContent = 'Settings';
    sub.textContent = '';
  } else if (tab === 'coach') {
    // Vista secundaria (v11.61): mismo patrón que `ideal-preview`/`analytics`, con su propio
    // botón de volver. No es una pestaña: la barra inferior no la muestra.
    title.textContent = 'Coach';
    const blk = (typeof blockWeek === 'function') ? blockWeek() : null;
    sub.textContent = (blk && blk.index)
      ? `Week ${blk.index}/${DELOAD_BLOCK_WEEKS} · ${blk.label}`
      : `Week ${wk}${dayChip}`;
  } else if (tab === 'ideal-preview') {
    // B-4: las tres vistas secundarias que no tenían rama aquí. Con `enterSecondaryView` la
    // cabecera SE VE, así que necesita título propio o queda el de la vista anterior.
    title.textContent = 'Ideal plan';
    sub.textContent = `Week ${wk}${dayChip}`;
  } else if (tab === 'analytics') {
    title.textContent = 'Bloodwork';
    sub.textContent = 'Score and age, side by side';
  } else if (tab === 'mobility') {
    title.textContent = 'Mobility';
    sub.textContent = 'Routines and streak';
  }
}

// ==================== GYM MODULE ====================
async function renderWeekBanner() {
  const wk = getWeekNumber();
  // EL BLOQUE ES DE 5 SEMANAS Y SALE DE UN SOLO SITIO (E-9, auditoría 2026-09-08).
  //
  // Este banner contaba bloques de NUEVE semanas desde `startDate` mientras el motor cuenta
  // CINCO (4 build + 1 deload, LOAD-004) ancladas a `settings.deloadAnchorDate`. Resultado: la
  // barra decía "semana 3 de 9" en la misma pantalla en que la tarjeta de la sesión decía
  // "semana 3/5 · deload la semana del 5-oct", y el `Deload` del banner venía de una tercera
  // cuenta. Ahora las tres cosas salen de `blockWeek()`.
  const blk = (typeof blockWeek === 'function') ? blockWeek() : null;
  const deload = !!(blk && blk.isDeload);
  const blockLen = DELOAD_BLOCK_WEEKS;
  const blockIdx = (blk && blk.index) || null;
  const blockTag = (typeof blockLabel === 'function' && state.settings)
    ? blockLabel(today(), state.settings.deloadAnchorDate, DELOAD_BLOCK_WEEKS)
    : null;
  const pct = blockIdx ? Math.min((blockIdx / blockLen) * 100, 100) : 0;
  // Day count since program start — disambiguates training week from ISO week.
  const startDateStr = state.settings.startDate;
  const startDate = startDateStr ? new Date(startDateStr + 'T00:00:00') : null;
  const dayNum = startDate ? Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1) : null;

  // Compute this-week stats for richer context
  const weekDates = getWeekDates().map(d => dateStr(d));
  const [allWorkouts, allRuns] = await Promise.all([dbGetAll('workouts'), getRunsDeduped()]);
  const wkWorkouts = (allWorkouts || []).filter(w => weekDates.includes(w.date));
  const wkRuns = (allRuns || []).filter(r => weekDates.includes(r.date)); // D1: deduped so a Coros run from Strava+intervals isn't double-counted
  let totalVolume = 0;
  wkWorkouts.forEach(w => w.exercises.forEach(ex => { totalVolume += volumeForExercise(ex, w.unit); }));
  const totalKm = wkRuns.reduce((s, r) => s + (parseFloat(r.distance) || 0), 0);
  const plannedSessions = Object.values(activeWeekTemplate || {}).filter(d => d && d.type === 'gym').length;

  // Find next planned session (today onwards) for "Up next"
  const todayDow = new Date().getDay();
  let nextLabel = '—';
  for (let offset = 0; offset < 7; offset++) {
    const dow = (todayDow + offset) % 7;
    const slot = activeWeekTemplate && activeWeekTemplate[dow];
    if (slot && slot.type === 'gym' && slot.session) {
      const s = activePlan.sessions[slot.session];
      const name = s ? s.name : slot.session;
      const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dow];
      const when = offset === 0 ? 'today' : offset === 1 ? 'tomorrow' : dayName;
      // Skip if already done today
      if (offset === 0 && wkWorkouts.find(w => w.date === today())) continue;
      nextLabel = `${name} · ${when}`;
      break;
    }
  }

  const dayChip = dayNum ? ` · Day ${dayNum}` : '';
  // "· B2 · week 3/5": el mismo bloque y la misma semana que dice la tarjeta de la sesión y que
  // ve el coach en el pack (`facts.trajectory.program.blocks` usa esta misma numeración).
  const blockChip = blockTag ? ` · ${blockTag}` : '';
  const weekChip = blockIdx ? ` · week ${blockIdx}/${blockLen}` : '';
  document.getElementById('week-banner').innerHTML = `
    <div class="wb-top">
      <span class="wb-title">Week ${wk}${dayChip}</span>
      <span class="wb-phase ${deload ? 'wb-deload' : ''}">${deload ? 'Deload' : 'Cut'}${blockChip}${weekChip}</span>
    </div>
    <div class="wb-bar"><div class="wb-bar-fill" style="width:${pct}%"></div></div>
    <div class="wb-stats">
      <div class="wb-stat"><span class="wb-stat-val">${wkWorkouts.length}/${plannedSessions || 4}</span><span class="wb-stat-lbl">sessions</span></div>
      <div class="wb-stat"><span class="wb-stat-val">${Math.round(totalVolume / 1000)}k</span><span class="wb-stat-lbl">volume (${state.settings.unit || 'kg'})</span></div>
      <div class="wb-stat"><span class="wb-stat-val">${totalKm.toFixed(1)}</span><span class="wb-stat-lbl">run km</span></div>
    </div>
    <div class="wb-next">Up next: <strong>${nextLabel}</strong></div>
  `;
}

// Get custom week schedule (overrides per date)
//
// V-7a (auditoría 2026-09-08): `getPlannedSessionForDate` llama aquí una vez POR DÍA, así que
// pintar el calendario de Home costaba quince `dbGet` del mismo registro. La caché vive en
// `state._weekSchedule` y la tira `dbPut` en cuanto alguien escribe `settings/weekSchedule`
// (incluida una fila que baje de la nube). Se devuelve el MISMO objeto a propósito: hay
// llamadores que lo mutan y luego llaman a `saveWeekSchedule` con él.
async function getWeekSchedule() {
  if (state._weekSchedule) return state._weekSchedule;
  const saved = await dbGet('settings', 'weekSchedule');
  state._weekSchedule = (saved && saved.data) || {};
  return state._weekSchedule;
}

async function saveWeekSchedule(schedule) {
  await smartPut('settings', { key: 'weekSchedule', data: schedule });
  // Después de la escritura: `dbPut` acaba de invalidar la caché y este es el valor bueno.
  state._weekSchedule = schedule;
}

/**
 * LA SEMANA SE RECOLOCA SOLA (v11.75).
 *
 * Julian, 2026-09-12: "Si por ejemplo el lunes en vez de hacer Lower A hago Upper A, no puede ser
 * que el martes me vuelva a decir Upper A. Tiene que adaptarse el plan."
 *
 * Y no había nada que lo hiciera. `showSessionPicker` escribía UNA clave `weekSchedule[fecha]`
 * antes de empezar la sesión y ahí acababa todo: `finishWorkout` no tocaba el calendario, así que
 * la semana seguía pidiendo el martes lo que ya se había hecho el lunes, y se quedaba sin día de
 * pierna sin que nadie lo dijera.
 *
 * POR QUÉ NO HACE FALTA UN STORE NUEVO. `getPlannedSession` ya consulta `weekSchedule[ds]` ANTES
 * que la plantilla, y las cuatro superficies que enseñan la semana —el calendario de Home, la
 * cola de "This week", la tarjeta de hoy y el banner de Gym— leen todas `getPlannedSessionForDate`.
 * Escribir overrides por fecha propaga a las cuatro sin tocar ninguna.
 *
 * El reparto lo decide `reflowWeek` (coach-engine.js, pura y con test propio). Aquí sólo se leen
 * los entrenos de la semana, se llama, se escribe y se avisa.
 */
async function applyWeekReflow(opts = {}) {
  if (typeof reflowWeek !== 'function') return null;
  try {
    const fechas = getWeekDates().map((d) => dateStr(d));
    const workouts = (await dbGetAll('workouts').catch(() => [])) || [];
    const doneByDate = {};
    for (const w of workouts) {
      if (!w || !w.date || !fechas.includes(w.date)) continue;
      // El primero del día manda: dos entrenos el mismo día es raro, y el segundo no cambia
      // qué sesión de la semana se ha cubierto.
      if (!doneByDate[w.date]) doneByDate[w.date] = w.sessionId || w.session || null;
    }
    const plan = (typeof activePlan !== 'undefined' && activePlan) ? activePlan : null;
    const tpl = (plan && plan.weekTemplate) || activeWeekTemplate || null;
    if (!tpl) return null;
    const overrides = await getWeekSchedule();
    const r = reflowWeek({
      template: tpl,
      doneByDate,
      weekDates: fechas,
      todayStr: today(),
      classMap: (typeof sessionClassMap === 'function') ? sessionClassMap() : {},
      overrides,
    });
    const claves = Object.keys(r.changes || {});
    if (!claves.length) return r;

    const nuevo = Object.assign({}, overrides);
    for (const ds of claves) nuevo[ds] = r.changes[ds];
    await saveWeekSchedule(nuevo);

    // Se AVISA, no se pregunta (decisión de Julian: "reordenar la semana sola"). Pero se dice
    // qué se movió: un plan que cambia solo y en silencio es peor que uno que no cambia.
    if (!opts.silent && typeof toast === 'function') {
      const m = (r.moved || [])[0];
      const nombre = (sid) => {
        const ses = plan && plan.sessions && plan.sessions[sid];
        return (ses && ses.name) || sid;
      };
      const dia = m ? new Date(m.to + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' }) : null;
      if (m && dia) toast(`Week rescheduled · ${nombre(m.session)} moved to ${dia}`);
      else toast('Week rescheduled around what you actually did');
    }
    // Y queda en el log de decisiones, que es lo que el coach lee el domingo: sin esto, la
    // desviación y su arreglo son invisibles para la revisión semanal.
    if ((r.moved || []).length && typeof smartPut === 'function') {
      try {
        await smartPut('decisions', {
          id: `reflow-${today()}-${Date.now()}`,
          date: today(),
          type: 'structure',
          what: `Week rescheduled: ${r.moved.map((m) => `${m.session} → ${m.to}`).join(', ')}`,
          why: 'A session was done on a different day than planned; the remaining days were redealt.',
          outcome: 'done',
          ruleIds: ['STR-002', 'STR-007'],
          source: 'app',
        });
      } catch (e) { console.warn('[reflow] decision:', e); }
    }
    return r;
  } catch (e) {
    console.warn('[reflow]:', e);
    return null;
  }
}

// Get the planned gym session for a specific date
function getPlannedSession(jsDay, customSchedule, ds) {
  // Custom override for this specific date
  if (customSchedule[ds] !== undefined) return customSchedule[ds]; // null = empty, string = sessionId
  const plan = activeWeekTemplate[jsDay];
  return plan.type === 'gym' ? plan.session : null;
}

// RETIRADO en v11.66 (auditoría 2026-09-08, B-3): la tira de la semana. Escribía en un
// contenedor que dejó de existir cuando `renderWeekCalendar()` la sustituyó, y sus ONCE
// llamadores lanzaban una promesa rechazada cada uno — once por cada guardado de entreno.
// Con ella se va el selector de sesión por pulsación larga, cuyo único llamador era la tira.
// El banner de la semana (`renderWeekBanner`) NO era parte de ella: se llamaba desde aquí y
// ahora lo llaman `switchTab('gym')`, `init()` y `afterWorkoutSaved()`.

// Generic action sheet — returns a Promise that resolves with the chosen value or null
function showActionSheet(title, options) {
  return new Promise(resolve => {
    const sheet = document.getElementById('action-sheet');
    const titleEl = document.getElementById('action-sheet-title');
    const optionsEl = document.getElementById('action-sheet-options');
    const cancelBtn = document.getElementById('action-sheet-cancel');
    const backdrop = sheet.querySelector('.action-sheet-backdrop');

    titleEl.textContent = title;
    optionsEl.innerHTML = options.map(o => `
      <button class="action-sheet-btn${o.selected ? ' selected' : ''}" data-value="${o.value}">
        ${o.icon ? `<span class="as-icon">${o.icon}</span>` : ''}
        <span class="as-label">${o.label}</span>
        ${o.selected ? '<span class="as-check">✓</span>' : ''}
      </button>
    `).join('');

    sheet.classList.remove('hidden');

    function close(val) {
      sheet.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(val);
    }
    function onCancel() { close(null); }

    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    optionsEl.querySelectorAll('.action-sheet-btn').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.value));
    });
  });
}

// V-8 (auditoría 2026-09-08): el esqueleto existía y se usaba en UN sitio, así que Home y
// Stats se pintaban como un salto de vacío a contenido — en 4G lenta con la base fría son
// varios cientos de milisegundos de tarjetas en blanco que parecen datos que no hay.
// `kind: 'line'` usa `.skeleton-line` (tres rayas de texto) y es lo que va DENTRO de una
// tarjeta que ya tiene su marco; `'card'` (el original) es para las listas de tarjetas.
function showSkeleton(container, count = 3, kind = 'card') {
  if (!container) return;
  const cls = kind === 'line' ? 'skeleton skeleton-line' : 'skeleton skeleton-card';
  container.innerHTML = Array(count).fill(`<div class="${cls}"></div>`).join('');
  container.classList.remove('morph-in');
}

function showEmptyState(container, icon, title, text) {
  if (!container) return;
  container.innerHTML = `<div class="empty-state-box"><div class="empty-state-icon">${icon}</div><div class="empty-state-title">${title}</div><div class="empty-state-text">${text}</div></div>`;
  morphIn(container);
}

// V-4 (auditoría 2026-09-09): EL ESTADO DE ERROR QUE NO EXISTÍA.
//
// La app tenía 76 `.catch(() => [])`, 51 `catch {}` y 44 `innerHTML = ''`: cuando una lectura
// de IndexedDB o de la nube fallaba, la tarjeta se quedaba VACÍA, exactamente igual que
// cuando no hay datos. Y de las dos, la que el usuario cree siempre es la segunda — así que
// un fallo de lectura se leía como "esta semana no has entrenado".
//
// Tres cosas, y ninguna más: se dice que ha fallado, se dice qué (una frase, no un stack), y
// se ofrece reintentar LA MISMA función. Sin `retryFn` no se pinta el botón: un "Retry" que
// no reintenta nada es peor que no tenerlo.
function showErrorState(container, msg, retryFn) {
  if (!container) return;
  container.classList.remove('hidden');
  container.innerHTML = `<div class="error-state-box">
      <div class="error-state-icon">!</div>
      <div class="error-state-title">Could not load this</div>
      <div class="error-state-text">${escapeHtml(String(msg || 'Something went wrong reading the data.'))}</div>
      ${typeof retryFn === 'function' ? '<button type="button" class="error-state-retry">Retry</button>' : ''}
    </div>`;
  if (typeof retryFn === 'function') {
    const b = container.querySelector('.error-state-retry');
    if (b) b.addEventListener('click', () => {
      b.disabled = true;
      b.textContent = 'Retrying…';
      Promise.resolve().then(retryFn).catch((e) => {
        console.warn('[showErrorState] retry:', e);
        showErrorState(container, (e && e.message) || 'Still failing.', retryFn);
      });
    });
  }
}

// V-7 (auditoría 2026-09-09): la hoja de texto que sustituye a `prompt()`.
//
// `prompt()` en una PWA instalada sale como un diálogo del NAVEGADOR, con el dominio en la
// cabecera y el tipo del sistema — la única cosa de la app que no parece de la app. Y no
// admite varias líneas, que es justo lo que pide "¿qué debería tener en cuenta?": la nota que
// viaja al modelo se escribía en un campo de una línea.
//
// Devuelve `Promise<string|null>`: `null` = cancelado (la misma semántica que `prompt()`, así
// que los llamadores distinguen "cancelar" de "aceptar en blanco" igual que antes).
function promptSheet({ title, placeholder, multiline, confirmLabel, value } = {}) {
  return new Promise((resolve) => {
    const sheet = document.getElementById('prompt-sheet');
    const backdrop = document.getElementById('prompt-sheet-backdrop');
    const field = document.getElementById('prompt-sheet-field');
    const titleEl = document.getElementById('prompt-sheet-title');
    const okBtn = document.getElementById('prompt-sheet-ok');
    const cancelBtn = document.getElementById('prompt-sheet-cancel');
    const closeBtn = document.getElementById('prompt-sheet-close');
    // Sin la hoja en el DOM (una versión vieja cacheada) no se pierde el gesto: cae a prompt().
    if (!sheet || !field || !okBtn) {
      resolve(typeof prompt === 'function' ? prompt(title || '') : null);
      return;
    }
    titleEl.textContent = title || 'Note';
    okBtn.textContent = confirmLabel || 'OK';
    field.innerHTML = multiline
      ? `<textarea class="text-input prompt-sheet-input" rows="4"></textarea>`
      : `<input type="text" class="text-input prompt-sheet-input">`;
    const input = field.firstElementChild;
    input.placeholder = placeholder || '';
    input.value = value != null ? String(value) : '';

    const abrir = () => {
      sheet.classList.remove('hidden');
      backdrop.classList.remove('hidden');
      requestAnimationFrame(() => { sheet.classList.add('visible'); backdrop.classList.add('visible'); });
      setTimeout(() => input.focus(), 120);
    };
    const cerrar = (val) => {
      sheet.classList.remove('visible');
      backdrop.classList.remove('visible');
      setTimeout(() => { sheet.classList.add('hidden'); backdrop.classList.add('hidden'); }, 220);
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      closeBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      input.removeEventListener('keydown', onKey);
      resolve(val);
    };
    const onOk = () => cerrar(input.value);
    const onCancel = () => cerrar(null);
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel();
      // En una línea, Enter acepta; en el textarea Enter es un salto de línea (es lo que se pide).
      else if (e.key === 'Enter' && !multiline) { e.preventDefault(); onOk(); }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    closeBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    input.addEventListener('keydown', onKey);
    abrir();
  });
}

// C-11 (auditoría 2026-09-09): CERO timeouts de red en todo el cliente (`grep AbortSignal` = 0).
// Un proveedor colgado —intervals.icu detrás de un portal cautivo de hotel es el caso real—
// dejaba el `await` vivo hasta que el sistema operativo cortaba, y con él la cadena de renders
// que lo esperaba. 12 s es holgado para las cinco llamadas que existen (la más lenta, el
// `events/bulk` de la semana, tarda ~1 s) y corto para que la pantalla no se quede colgada.
const FETCH_TIMEOUT_MS = 12000;
function fetchWithTimeout(url, opts, ms = FETCH_TIMEOUT_MS) {
  const o = Object.assign({}, opts || {});
  if (!o.signal && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    o.signal = AbortSignal.timeout(ms);
  }
  return fetch(url, o);
}

// V-9 (auditoría 2026-09-08): UNA forma de llamar a una función de otro módulo.
//
// Había tres, mezcladas sin criterio: `typeof X === 'function' ? X() : null`, `window.X ? …`
// y la llamada directa. Los módulos entran por <script> aparte (`coach.js`, `nutrition.js`,
// `integrations.js`, `whoop.js`), así que la llamada directa revienta el render entero si el
// fichero no llegó, y las dos guardas dicen lo mismo con distinta sintaxis en sesenta sitios.
// Aquí además se captura el throw: un renderer de otro módulo que falla deja SU hueco vacío
// y un warning con su nombre, no una pantalla a medias.
//
// Devuelve `undefined` cuando la función no existe o lanzó. Si devuelve una promesa, la
// promesa se devuelve tal cual — el `allSettled` de quien llama sigue viendo el rechazo.
function safeCall(name, ...args) {
  const fn = (typeof window !== 'undefined') ? window[name] : undefined;
  if (typeof fn !== 'function') return undefined;
  try {
    return fn(...args);
  } catch (e) {
    console.warn(`[safeCall] ${name}:`, e);
    return undefined;
  }
}

// C-27 (auditoría 2026-09-09): "llama y no esperes, pero que se sepa si falló".
//
// `safeCall` captura el throw SÍNCRONO. Si la función es async —y casi todos los renderers lo
// son— devuelve una promesa, y en los sitios donde nadie la espera el rechazo moría en un
// `unhandledrejection` que en el iPhone no se ve. Eran cuatro: el punto del topbar tras un
// reintento de sync, `openMobilityView` desde la cola de Home y los dos repintados de la
// tarjeta de recuperación al llegar el dato de WHOOP — uno de ellos con `.catch(() => {})`,
// que es peor porque parece manejado.
//
// No devuelve nada A PROPÓSITO: quien quiera el resultado usa `safeCall` y lo espera.
function safeCallVoid(name, ...args) {
  const r = safeCall(name, ...args);
  if (r && typeof r.then === 'function') {
    r.then(undefined, (e) => console.warn(`[safeCall] ${name}:`, e));
  }
}

function morphIn(container) {
  container.classList.remove('morph-in');
  void container.offsetWidth; // force reflow
  container.classList.add('morph-in');
}

async function renderRecentWorkouts() {
  const container = document.getElementById('recent-workouts');
  showSkeleton(container, 3);
  // Show the last 20 — was capped at 8, which hid roughly half the month
  // worth of sessions and made the list look suspiciously thin.
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);

  if (!workouts.length) {
    showEmptyState(container, '🏋️', 'No workouts yet', 'Tap a day in the schedule above to start your first session.');
    return;
  }

  const iconBarbell = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="12" x2="22" y2="12"/><rect x="3" y="8.5" width="2" height="7" rx="0.6"/><rect x="6" y="6.5" width="2.5" height="11" rx="0.6"/><rect x="15.5" y="6.5" width="2.5" height="11" rx="0.6"/><rect x="19" y="8.5" width="2" height="7" rx="0.6"/></svg>`;
  container.innerHTML = workouts.map(w => {
    const session = activePlan.sessions[w.session];
    const totalSets = w.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
    return `
      <div class="history-item" data-edit-workout="${w.id}">
        <div class="hi-icon" style="background:var(--tint-orange);color:var(--orange)">${iconBarbell}</div>
        <div class="hi-left">
          <div class="hi-title">${session ? session.name : (w.sessionName || w.session)}</div>
          <div class="hi-sub">${formatDate(w.date)} · ${totalSets} sets · ${w.duration || ''}</div>
        </div>
        <div class="hi-right">
          <div>
            <div class="hi-stat">${w.quality || '-'}/5</div>
            <div class="hi-stat-sub">quality</div>
          </div>
          <span class="hi-chev" aria-hidden="true">›</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-edit-workout]').forEach(item => {
    item.addEventListener('click', () => openEditWorkout(item.dataset.editWorkout));
  });
  morphIn(container);
}

// ==================== EDIT WORKOUT MODAL ====================
let _editWorkoutId = null;
// Cached data for the currently-open workout. Populated synchronously-ready
// at modal open so copyWhoopTranscript() can write to clipboard without
// any awaits — iOS Safari requires the clipboard call to stay inside the
// same user-gesture task, and awaits between click and writeText break it.
let _editWorkoutCache = null;

async function openEditWorkout(id) {
  const w = await dbGet('workouts', id);
  if (!w) { toast('Workout not found'); return; }
  _editWorkoutId = id;

  const session = activePlan.sessions[w.session];
  const sessionName = session ? session.name : (w.sessionName || w.session);
  document.getElementById('ew-title').textContent = sessionName;
  document.getElementById('ew-date').value = w.date || '';
  document.getElementById('ew-quality').value = w.quality || '';
  document.getElementById('ew-notes').value = w.notes || '';

  const appUnit = state.settings.unit || 'kg';
  const unit = loggedUnit(w);
  const titleEl = document.getElementById('ew-title');
  // El aviso salta siempre que el registro NO esté en la unidad de la app, venga de `inputUnit`
  // (borrador a medio guardar) o de `unit` (sesión de EE.UU. en lb). Antes sólo miraba `inputUnit`,
  // así que un registro en lb se abría sin ninguna señal de que estaba en lb.
  if (unit !== appUnit) {
    titleEl.innerHTML = `${sessionName} <span style="font-size:11px;color:var(--accent);font-weight:600">· ${unit.toUpperCase()}</span>`;
  }

  // Calorie estimate row + cache for sync clipboard copy later
  const bw = await getBodyweightLatest();
  const dur = durationToMinutes(w.duration);
  const cal = estimateCalories({ type: 'gym', durationMin: dur, bodyweightKg: bw || 80, avgRpe: workoutAvgRpe(w), age: state.settings.age });
  _editWorkoutCache = { workout: w, kcal: cal?.kcal };
  const calEl = document.getElementById('ew-calories');
  if (calEl) {
    calEl.innerHTML = cal
      ? `<span class="ew-cal-icon">🔥</span><span>~${cal.kcal} kcal estimated</span><span class="ew-cal-method">${cal.method === 'met-rpe' ? 'MET × RPE' : cal.method}${bw ? '' : ' · using 80 kg fallback'}</span>`
      : '';
  }

  // Block timings — only shown if recorded for this workout
  const btContainer = document.getElementById('ew-block-timings');
  if (btContainer) {
    if (w.blockTimings && w.blockTimings.length) {
      const totalActual = w.blockTimings.reduce((s, t) => s + (t.durationSec || 0), 0);
      const totalEstimated = w.blockTimings.reduce((s, t) => s + (t.estimatedSec || 0), 0);
      btContainer.innerHTML = `
        <div class="section-label" style="margin-top:12px">Time per Block</div>
        <div class="card" style="padding:8px 12px">
          <div class="bt-row bt-row-head">
            <span>Block</span><span>Est.</span><span>Real</span><span>Δ</span>
          </div>
          ${w.blockTimings.map(t => {
            const est = t.estimatedSec || 0;
            const real = t.durationSec || 0;
            const delta = real - est;
            const cls = delta <= 0 ? 'pos' : (delta > est * 0.25 ? 'neg' : 'neutral');
            const sign = delta >= 0 ? '+' : '−';
            return `<div class="bt-row">
              <span class="bt-label">${t.label}</span>
              <span class="bt-est">${est ? formatBlockMin(est) : '—'}</span>
              <span class="bt-real">${formatBlockMin(real)}</span>
              <span class="bt-delta ${cls}">${est ? sign + formatBlockMin(Math.abs(delta)) : '—'}</span>
            </div>`;
          }).join('')}
          <div class="bt-row bt-row-total">
            <span>Total</span>
            <span>${totalEstimated ? formatBlockMin(totalEstimated) : '—'}</span>
            <span>${formatBlockMin(totalActual)}</span>
            <span></span>
          </div>
        </div>
      `;
    } else {
      btContainer.innerHTML = '';
    }
  }

  // Load previous workouts for this session (for ghost sets / 1RM)
  const allSessionWorkouts = (await dbGetAll('workouts'))
    .filter(wk => wk.session === w.session && wk.id !== w.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const previous = allSessionWorkouts[0] || null;

  const exHost = document.getElementById('ew-exercises');
  exHost.innerHTML = w.exercises.map((ex, exi) => {
    const exName = getExerciseName(ex.exerciseId);
    const muscle = getExerciseMuscle(ex.exerciseId);
    const muscleColor = MUSCLE_COLORS[muscle] || MUSCLE_FALLBACK;

    // Find plan exercise definition for target info + notes
    const planEx = session ? session.exercises.find(e => e.id === ex.exerciseId) : null;
    const targetHTML = planEx
      ? `<div class="exercise-target">${planEx.sets} × ${planEx.reps} @ RPE ${planEx.rpe} · Rest ${Math.floor((planEx.defaultRest || 120) / 60)}:${((planEx.defaultRest || 120) % 60).toString().padStart(2, '0')}</div>`
      : '';
    const notesHTML = planEx && planEx.notes
      ? `<div class="exercise-notes" style="margin-top:6px">${escapeHtml(planEx.notes)}</div>`
      : '';

    // Previous workout ghost data
    const prevEx = previous ? previous.exercises.find(e => e.exerciseId === ex.exerciseId) : null;
    const prevDoneSets = prevEx ? prevEx.sets.filter(s => s.done && (s.weight > 0 || (planEx && planEx.bw))) : [];
    const prevSummary = prevDoneSets.length > 0
      ? prevDoneSets.map(s => `${planEx && planEx.bw ? '+' : ''}${convertWeight(s.weight, previous && previous.unit, unit)}×${s.reps}`).join('  ')
      : '';
    const prevHeaderHTML = prevSummary ? `<div class="prev-header">Last: ${prevSummary}</div>` : '';

    // Est 1RM from all history — convert each session's weight from its own unit
    // to the display unit before estimating, so lb and kg sessions compare cleanly.
    let best1RM = 0;
    // Un 1RM estimado sobre centimetros de cajon no significa nada (v11.48).
    if (!measureUnitFor(ex.exerciseId)) allSessionWorkouts.concat([w]).forEach(wk => {
      const wex = wk.exercises.find(e => e.exerciseId === ex.exerciseId);
      if (wex) wex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0).forEach(s => {
        const e1rm = estimate1RM(convertWeight(s.weight, wk.unit, appUnit), s.reps);
        if (e1rm > best1RM) best1RM = e1rm;
      });
    });
    const e1rmHTML = best1RM > 0 ? `<div class="exercise-1rm">Est. 1RM: ${best1RM} ${appUnit}</div>` : '';

    const rows = ex.sets.map((s, i) => {
      const ghostSet = prevEx && prevEx.sets[i];
      const ghostHTML = ghostSet && ghostSet.done
        ? `<div class="ghost-set ew-ghost"><span>${planEx && planEx.bw ? '+' : ''}${convertWeight(ghostSet.weight, previous && previous.unit, unit)}</span><span>${ghostSet.reps}</span><span>${ghostSet.rpe || ''}</span></div>`
        : '';
      return `
        ${ghostHTML}
        <div class="ew-set" data-ex="${exi}" data-set="${i}">
          <div class="ew-num">${i + 1}</div>
          <input type="number" inputmode="decimal" step="0.5" data-f="weight" value="${s.weight || ''}" placeholder="${unit}">
          <input type="number" inputmode="numeric" data-f="reps" value="${s.reps || ''}" placeholder="reps">
          <select data-f="rpe" class="ew-rpe-select" style="${s.rpe ? 'color:' + rpeColor(s.rpe) : ''}">
            <option value="">RPE</option>
            ${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(v => `<option value="${v}"${s.rpe == v ? ' selected' : ''}>${v}</option>`).join('')}
          </select>
          <button class="ew-done ${s.done ? 'checked' : ''}" data-f="done" type="button">✓</button>
        </div>
      `;
    }).join('');

    const supersetTag = planEx && planEx.superset
      ? `<span class="ew-superset-tag">SS ${planEx.superset}</span>` : '';

    return `
      <div class="ew-ex">
        <div class="exercise-name-row" style="margin-bottom:4px">
          <span class="exercise-name" style="font-size:14px;font-weight:700">${exName}</span>
          ${muscle ? `<span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${muscle}</span>` : ''}
          ${supersetTag}
        </div>
        ${targetHTML}
        ${prevHeaderHTML}
        ${e1rmHTML}
        <div class="ew-set-head"><span></span><span>${measureUnitFor(ex.exerciseId) || (planEx && planEx.bw ? '+' + unit : (planEx && planEx.db ? unit + '/DB' : unit))}</span><span>Reps</span><span>RPE</span><span>Done</span></div>
        ${rows}
        ${notesHTML}
      </div>
    `;
  }).join('');

  // Toggle done buttons
  exHost.querySelectorAll('.ew-done').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('checked'));
  });

  // RPE color on change
  exHost.querySelectorAll('.ew-rpe-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const val = parseFloat(sel.value);
      sel.style.color = val ? rpeColor(val) : '';
    });
  });

  document.getElementById('edit-workout-modal').classList.remove('hidden');
}

function closeEditWorkout() {
  document.getElementById('edit-workout-modal').classList.add('hidden');
  _editWorkoutId = null;
  _editWorkoutCache = null;
}

// Build a plain-text summary of the workout for pasting into WHOOP's
// activity notes so its AI can credit strain accurately.
function buildWhoopTranscript(w, ctx = {}) {
  const session = activePlan.sessions[w.session];
  const sessionName = session ? session.name : (w.sessionName || w.session);
  const unit = loggedUnit(w);
  const headerBits = [sessionName];
  if (w.date) headerBits.push(formatDate(w.date));
  if (w.duration) headerBits.push(w.duration);
  const lines = [headerBits.join(' — ')];
  if (ctx.kcal) lines.push(`Est. burn: ~${ctx.kcal} kcal`);

  w.exercises.forEach(ex => {
    const doneSets = ex.sets.filter(s => s.done && s.reps > 0);
    if (doneSets.length === 0) return;
    const exName = getExerciseName(ex.exerciseId);
    const planEx = session ? session.exercises.find(e => e.id === ex.exerciseId) : null;
    const isBW = !!(ex.bw || planEx?.bw);
    const isDB = !!(ex.db || planEx?.db);
    lines.push('');
    lines.push(exName);
    doneSets.forEach(s => {
      let load;
      if (isBW) {
        load = s.weight > 0 ? `BW + ${s.weight} ${unit}` : 'BW';
      } else if (isDB) {
        load = `${s.weight} ${unit}/DB`;
      } else {
        load = `${s.weight} ${unit}`;
      }
      const rpePart = s.rpe ? ` @ RPE ${s.rpe}` : '';
      lines.push(`  ${load} x ${s.reps}${rpePart}`);
    });
  });

  return lines.join('\n');
}

// Sync click handler — no awaits before clipboard call so iOS preserves
// the user-gesture context that allows writeText to succeed in PWA mode.
function copyWhoopTranscript() {
  const cache = _editWorkoutCache;
  if (!cache || !cache.workout) { toast('Workout not loaded'); return; }
  const text = buildWhoopTranscript(cache.workout, { kcal: cache.kcal });
  copyTextToClipboard(text).then(ok => toast(ok ? 'Copied for WHOOP' : 'Copy failed'));
}

// Write `text` to the clipboard. Tries the modern API first; on failure
// (or if unavailable) falls back to a hidden textarea + execCommand('copy'),
// which is more reliable in iOS PWA standalone mode.
function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(e => {
        console.warn('clipboard.writeText failed, trying textarea fallback', e);
        return copyViaTextarea(text);
      });
  }
  return Promise.resolve(copyViaTextarea(text));
}

function copyViaTextarea(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    console.warn('textarea fallback failed', e);
    return false;
  }
}

async function saveEditWorkout() {
  if (!_editWorkoutId) return;
  const w = await dbGet('workouts', _editWorkoutId);
  if (!w) { toast('Workout not found'); return; }

  const newDate = document.getElementById('ew-date').value;
  const newQuality = parseInt(document.getElementById('ew-quality').value, 10);
  const newNotes = document.getElementById('ew-notes').value.trim();

  if (newDate) w.date = newDate;
  if (!isNaN(newQuality)) w.quality = Math.max(1, Math.min(5, newQuality));
  w.notes = newNotes;

  const appUnit = state.settings.unit || 'kg';
  // If the workout was drafted in a different input unit, convert on save so
  // internal values stay in the app's canonical unit.
  const inputUnit = w.inputUnit || appUnit;
  const convert = (v) => {
    if (inputUnit === appUnit) return v;
    if (inputUnit === 'lb' && appUnit === 'kg') return +(v * LB_TO_KG).toFixed(2);
    if (inputUnit === 'kg' && appUnit === 'lb') return +(v * 2.20462).toFixed(2);
    return v;
  };
  document.querySelectorAll('#ew-exercises .ew-set').forEach(row => {
    const exi = parseInt(row.dataset.ex, 10);
    const si = parseInt(row.dataset.set, 10);
    const s = w.exercises[exi] && w.exercises[exi].sets[si];
    if (!s) return;
    const rawWeight = parseFloat(row.querySelector('[data-f="weight"]').value) || 0;
    s.weight = convert(rawWeight);
    s.reps = parseInt(row.querySelector('[data-f="reps"]').value, 10) || 0;
    const rpeEl = row.querySelector('[data-f="rpe"]');
    const rpeVal = parseFloat(rpeEl.value);
    s.rpe = isNaN(rpeVal) ? null : rpeVal;
    s.done = row.querySelector('[data-f="done"]').classList.contains('checked');
  });
  // Re-etiquetar SÓLO cuando de verdad se ha convertido (round-trip de `inputUnit`) o cuando el
  // registro no traía unidad. Hacer `w.unit = appUnit` incondicional era corrupción de datos: abrir
  // un entrenamiento de abril guardado en lb, tocar cualquier campo y guardar convertía sus 205 en
  // "205 kg" sin tocar el número. Es también lo que borró la prueba del fallo del 24-ago: al añadir
  // la nota, el registro pasó de `lb` a `kg` solo.
  if (w.inputUnit || !w.unit) w.unit = appUnit;
  // One-time conversion only: strip inputUnit after saving so future edits
  // use the app's canonical unit directly.
  delete w.inputUnit;

  await smartPut('workouts', w);
  closeEditWorkout();
  toast('Workout updated');
  await afterWorkoutSaved();
}

async function deleteEditWorkout() {
  if (!_editWorkoutId) return;
  const confirmed = confirm('Delete this workout? It will be kept in Trash for 2 days so you can restore it.');
  if (!confirmed) return;
  const wId = _editWorkoutId;
  const w = await dbGet('workouts', wId);
  closeEditWorkout();
  if (!w) return;
  await moveToTrash('workouts', w);
  await smartDelete('workouts', wId);
  await afterWorkoutSaved();
  toast('Moved to Trash (2 days)', {
    label: 'Undo',
    callback: async () => {
      await restoreFromTrash(w.id);
      await afterWorkoutSaved();
      toast('Workout restored');
    }
  });
}

// ==================== TRASH (soft delete) ====================
const TRASH_TTL_MS = 2 * 24 * 60 * 60 * 1000;

async function moveToTrash(store, item) {
  const clone = { ...item };
  delete clone._updated_at;
  const entry = {
    trashId: `${store}:${item.id}`,
    store,
    originalId: item.id,
    data: clone,
    deletedAt: Date.now(),
  };
  await dbPut('trash', entry);
}

async function restoreFromTrash(originalId) {
  const all = await dbGetAll('trash');
  const entry = all.find(t => t.originalId === originalId);
  if (!entry) return false;
  await smartPut(entry.store, entry.data);
  await dbDelete('trash', entry.trashId);
  return true;
}

async function purgeExpiredTrash() {
  try {
    const all = await dbGetAll('trash');
    const now = Date.now();
    for (const t of all) {
      if (now - t.deletedAt > TRASH_TTL_MS) {
        await dbDelete('trash', t.trashId);
      }
    }
  } catch (e) { console.warn('[Trash] Purge failed:', e); }
}

async function renderTrashList() {
  const host = document.getElementById('trash-list');
  if (!host) return;
  const all = (await dbGetAll('trash')).sort((a, b) => b.deletedAt - a.deletedAt);
  if (!all.length) {
    host.innerHTML = '<p class="muted" style="font-size:12px">Trash is empty.</p>';
    return;
  }
  const now = Date.now();
  host.innerHTML = all.map(t => {
    const remainingMs = TRASH_TTL_MS - (now - t.deletedAt);
    const hoursLeft = Math.max(0, Math.floor(remainingMs / (60 * 60 * 1000)));
    const d = t.data || {};
    const session = activePlan.sessions[d.session];
    const name = session ? session.name : (d.session || t.store);
    return `
      <div class="trash-item">
        <div class="ti-left">
          <div class="ti-title">${name}</div>
          <div class="ti-sub">${d.date || ''} · expires in ${hoursLeft}h</div>
        </div>
        <button class="btn-secondary" data-restore="${t.originalId}" style="padding:6px 10px;font-size:12px">Restore</button>
      </div>
    `;
  }).join('');
  host.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await restoreFromTrash(btn.dataset.restore);
      renderTrashList();
      await afterWorkoutSaved();
      toast('Restored');
    });
  });
}

// ==================== LOG PAST WORKOUT ====================
async function logPastWorkout() {
  const sessions = Object.values(activePlan.sessions);

  // Step 1: Pick session via action sheet buttons
  const sessionOptions = sessions.map(s => ({
    value: s.id, label: s.name + ' — ' + s.subtitle, icon: s.icon
  }));
  const sessionId = await showActionSheet('Which session?', sessionOptions);
  if (!sessionId) return;
  const session = activePlan.sessions[sessionId];
  if (!session) return;

  // Step 2: Pick unit via action sheet buttons
  const appUnit = state.settings.unit || 'kg';
  const unitOptions = [
    { value: 'kg', label: 'Kilograms (kg)', icon: '🏋️', selected: appUnit === 'kg' },
    { value: 'lb', label: 'Pounds (lb)', icon: '🏋️', selected: appUnit === 'lb' },
  ];
  const inputUnit = await showActionSheet('Enter weights in', unitOptions);
  if (!inputUnit) return;

  const workout = {
    id: uid(),
    date: today(),
    session: session.id,
    sessionName: session.name,
    planVersion: activePlan.version || 1,
    week: getWeekNumber(),
    startTime: '00:00',
    duration: '',
    exercises: session.exercises.map(ex => ({
      exerciseId: ex.id,
      sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0, rpe: null, done: false })),
    })),
    quality: null,
    notes: '',
    inputUnit,
  };
  // V-9: idem que en `finishWorkout` — sin esto, "crear borrador" no hacía nada visible.
  try {
    await smartPut('workouts', workout);
  } catch (e) {
    console.warn('[Gym] borrador de entreno:', e);
    toast(`Something went wrong creating the draft: ${(e && e.message) || 'storage error'}`);
    return;
  }
  renderRecentWorkouts();
  toast('Draft created — edit the details');
  openEditWorkout(workout.id);
}

// C-10 (auditoría 2026-09-09): AQUÍ VIVÍA `_isoWeekKeyFor`, la tercera semana ISO de la app.
// Había tres implementaciones: ésta, una `isoWeekKey` LOCAL dentro de `renderStreaks` que
// sombreaba al global, y la del motor (`coach-engine.js`). Las dos de app.js contaban en hora
// LOCAL con la fórmula del 1-ene; la del motor cuenta en UTC con la del 4-ene, que es la
// definición ISO 8601. Discrepan en las fronteras de año (2027-01-03 es 2026-W53, no 2027-W01)
// y en el cambio de horario, así que las rachas de Stats podían decir una semana y el pack del
// coach otra sobre el mismo entreno. Ahora hay UNA: `isoWeekKey(dateStr)` del motor, que recibe
// una CADENA 'YYYY-MM-DD' (no un Date) y se carga antes que app.js.

// ==================== SESSION PROGRESS ====================
function updateSessionProgress() {
  const allChecks = document.querySelectorAll('#workout-exercises .set-check');
  const allChecked = document.querySelectorAll('#workout-exercises .set-check.checked');
  const total = allChecks.length;
  const done = allChecked.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  // Update bar
  document.getElementById('sp-fill').style.width = pct + '%';
  document.getElementById('sp-text').textContent = `${done} / ${total} sets`;

  // Update progress ring if present
  const ring = document.getElementById('sp-ring-fill');
  if (ring) {
    const circumference = 2 * Math.PI * 38; // r=38
    ring.style.strokeDashoffset = circumference - (circumference * pct / 100);
  }
  const ringText = document.getElementById('sp-ring-pct');
  if (ringText) animateNumber(ringText, Math.round(pct), '%');
}

// ==================== SESSION PICKER (day swap) ====================
async function showSessionPicker(defaultSession, dateOverride) {
  const sessions = Object.entries(activePlan.sessions);
  const options = sessions.map(([id, s]) => ({
    value: id, label: s.name + ' — ' + s.subtitle, icon: s.icon, selected: id === defaultSession
  }));
  // La sesión libre no vive en el plan, así que se añade a mano al final.
  options.push({ value: FREE_SESSION_ID, label: 'Free session — pick as you go', icon: '🎛️' });

  const choice = await showActionSheet('Start workout', options);
  if (choice === null) return;

  // La libre NO se fija en weekSchedule: no es un día planificado, y dejarla ahí escrita haría que
  // el calendario intentase arrancar una sesión vacía en el futuro.
  if (choice === FREE_SESSION_ID) { await startFreeWorkout(); return; }

  // Persist the day swap in weekSchedule so the strip updates
  if (choice !== defaultSession) {
    const ds = dateOverride || today();
    const customSchedule = await getWeekSchedule();
    customSchedule[ds] = choice;
    await saveWeekSchedule(customSchedule);
  }

  startWorkout(choice);
}

// ==================== VIEW COMPLETED WORKOUT (read-only) ====================
function viewCompletedWorkout(workout) {
  state.viewingCompleted = true;
  // B-2: el entreno completado se abre desde el calendario de Home Y desde la lista de Gym.
  // Volver siempre a Home dejaba al usuario lejos de donde estaba.
  state.viewingCompletedFrom = state.currentTab || 'home';
  const session = activePlan.sessions[workout.session];
  const sessionName = session ? session.name : (workout.sessionName || workout.session);

  document.getElementById('workout-timer').textContent = workout.duration || '--:--';
  document.getElementById('sp-fill').style.width = '100%';
  document.getElementById('sp-text').textContent = 'Completed';

  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';

  const unit = state.settings.unit;
  for (const ex of workout.exercises) {
    const exName = getExerciseName(ex.exerciseId);
    const muscle = getExerciseMuscle(ex.exerciseId);
    const muscleColor = MUSCLE_COLORS[muscle] || MUSCLE_FALLBACK;

    const setsHTML = ex.sets.map((s, i) => `
      <div class="set-row" style="opacity:${s.done ? 1 : 0.4}${s.rpe ? ';border-left:3px solid ' + rpeColor(s.rpe) : ''}">
        <div class="set-num">${i + 1}</div>
        <div class="set-input" style="text-align:center;font-weight:700">${s.weight || '-'}</div>
        <div class="set-input" style="text-align:center">${s.reps || '-'}</div>
        <div class="set-input" style="text-align:center;font-size:12px;${s.rpe ? 'color:' + rpeColor(s.rpe) : ''}">${s.rpe || ''}</div>
        <div class="set-check ${s.done ? 'checked' : ''}" style="pointer-events:none">✓</div>
      </div>
    `).join('');

    const card = document.createElement('div');
    card.className = 'exercise-card expanded';
    card.dataset.exerciseId = ex.exerciseId;
    card.innerHTML = `
      <div class="exercise-header" style="cursor:default">
        <div class="exercise-info">
          <div class="exercise-name-row">
            <span class="exercise-name tappable" data-ex-id="${ex.exerciseId}">${exName} <span class="tap-hint">history</span></span>
            <span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${muscle || ''}</span>
          </div>
          <div class="exercise-target" style="color:var(--accent)">Completed · ${workout.date}</div>
        </div>
      </div>
      <div class="exercise-body" style="display:block">
        <div class="exercise-body-inner">
          <div class="set-table">
            <div class="set-table-header">
              <div>Set</div><div>${unit}</div><div>Reps</div><div>RPE</div><div></div>
            </div>
            ${setsHTML}
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  }

  // Wire exercise name taps for history
  container.querySelectorAll('.exercise-name.tappable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openExerciseHistory(el.dataset.exId);
    });
  });

  // Hide finish button, show back only
  { const f = document.getElementById('btn-finish-workout'); if (f) f.hidden = true; }
  // B-1 (auditoría 2026-09-08): aquí había un `getElementById(...).style` sobre el textarea
  // de notas del entreno, que dejó de existir hace versiones (0 apariciones en index.html).
  // Lanzaba ANTES de activar la vista, así que tocar un día ya entrenado en el calendario no
  // abría nada. Las notas se pintan ahora de sólo lectura y escapadas (B-6).
  const notesEl = document.getElementById('wo-completed-notes');
  if (notesEl) {
    const txt = (workout.notes || '').trim();
    notesEl.innerHTML = txt ? `<p class="wo-notes-ro">${escapeHtml(txt)}</p>` : '';
    notesEl.hidden = !txt;
  }

  // El calentamiento de un entreno guardado no se recuerda; la sección se deja vacía y
  // colapsada en vez de reutilizarla como cajón de las notas.
  const warmupBody = document.getElementById('warmup-body');
  if (warmupBody) warmupBody.innerHTML = '';
  document.getElementById('warmup-section').classList.remove('expanded');

  // `showView` es lo que faltaba: activa la sección y, de paso, deja el estado coherente
  // (`state.currentView`), que es lo que lee `switchTab` al volver. El FAB de la calculadora
  // de discos se oculta a mano: aquí no se levanta nada, se mira.
  showView('workout');
  const fab = document.getElementById('plate-fab');
  if (fab) fab.classList.add('hidden');
}

// ==================== WORKOUT ====================
function syncQuickModeUI() {
  const btn = document.getElementById('quick-mode-toggle');
  const stateEl = document.getElementById('quick-pill-state');
  const hint = document.getElementById('quick-pill-hint');
  if (!btn || !stateEl) return;
  const on = !!state.quickMode;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  stateEl.textContent = on ? 'ON' : 'OFF';
  if (hint) hint.textContent = on
    ? 'Compounds full · accessories trimmed · isolation 1 set'
    : '~40 min · keep compounds, trim accessories';
}

// ==================== SESIÓN LIBRE (v11.44) ====================
//
// El problema que resuelve: hasta ahora la única forma de registrar un entrenamiento era seguir una
// plantilla del plan. Entrenar la rutina de otro obligaba a secuestrar los huecos de una sesión y
// anotar el ejercicio real en el comentario — que es exactamente lo que pasó el 20-ago y lo que la
// migración `fix-aug20-mislabeled` tuvo que deshacer.
//
// Decisión de arquitectura: la sesión libre vive en `state.adHocSession`, NO en `PLAN.sessions`.
// Registrarla en el plan habría exigido subir PLAN_REV, lo que escribe una versión de plan nueva y
// sincronizada sólo para declarar una sesión vacía — y encima no ahorraría nada, porque la lista de
// ejercicios hay que persistirla igual para que el resume funcione. Con el resolutor de abajo sólo
// cambian las 5 lecturas que de verdad importan.
//
// Nada de esto escribe en el store `plans`.

const FREE_SESSION_ID = 'free';

function makeFreeSession() {
  return {
    id: FREE_SESSION_ID, name: 'Free session', subtitle: 'Pick as you go',
    icon: '🎛️', adHoc: true,
    warmup: [
      '5-10 min easy cardio',
      'Mobility for whatever you are about to train',
      'Warm-up ramp sets on the first heavy exercise',
    ],
    exercises: [],
  };
}

// El resolutor. Único punto que sabe que existen sesiones fuera del plan.
function getSessionDef(id) {
  if (state.adHocSession && state.adHocSession.id === id) return state.adHocSession;
  return (activePlan && activePlan.sessions) ? activePlan.sessions[id] : null;
}

function isAdHocSession(id) {
  const d = getSessionDef(id);
  return !!(d && d.adHoc);
}

// Catálogo para el selector: UNIÓN de las tres fuentes, no sólo el store.
// Motivo: `ensureExerciseLibrarySeeded` sale si ya hay filas, así que el store del teléfono se
// sembró una vez y le faltan todos los ejercicios añadidos desde v11.37 (trineo, SkiErg, farmer
// carry, pliometría, bird dog…). La unión da el catálogo completo sin escribir nada.
function libraryOptionsByMuscle() {
  const byMuscle = {};
  // Un ejercicio, UN músculo. `rdl` aparece en EXERCISE_ALTERNATIVES bajo Hamstrings y bajo
  // Posterior; sin esto saldría dos veces en el selector. Gana la primera fuente que lo declare
  // (librería → plan → alternativas), que es el orden de mayor a menor autoridad.
  const claimed = new Set();
  const add = (id, name, muscle) => {
    if (!id || !name || !muscle || claimed.has(id)) return;
    claimed.add(id);
    if (!byMuscle[muscle]) byMuscle[muscle] = new Map();
    byMuscle[muscle].set(id, name);
  };
  for (const e of Object.values(exerciseLibrary || {})) add(e.id, e.name, e.muscle);
  if (activePlan && activePlan.sessions) {
    for (const s of Object.values(activePlan.sessions)) {
      for (const ex of (s.exercises || [])) add(ex.id, ex.name, ex.muscle);
    }
  }
  for (const [muscle, alts] of Object.entries(EXERCISE_ALTERNATIVES)) {
    for (const a of alts) add(a.id, a.name, muscle);
  }
  return byMuscle;
}

// El store `exercises` NO guarda `db` (mira `ensureExerciseLibrarySeeded`: sólo persiste id, name,
// muscle, movementPattern, bw, defaultNotes, custom). Y `volumeForExercise` lee `ex.db` del propio
// registro para aplicar el factor ×2. Así que las flags se derivan aquí.
// Deliberadamente imperfecto: si falla, el único efecto es un factor ×2 en un accesorio.
const _DB_EXERCISE_IDS = new Set([
  'incline-db-press', 'db-bench', 'db-row', 'db-rdl', 'db-shoulder-press', 'lateral-raise',
  'incline-curl', 'hammer-curl', 'bss', 'arnold-press', 'incline-db-fly', 'front-raise',
]);
const _COMPOUND_PATTERNS = new Set([
  'squat', 'hinge', 'horizontal-press', 'vertical-press', 'horizontal-pull', 'vertical-pull',
  'single-leg',
]);

function deriveExerciseFlags(exId) {
  // 1) Si el ejercicio existe en alguna sesión del plan, esas flags son la verdad.
  if (activePlan && activePlan.sessions) {
    for (const s of Object.values(activePlan.sessions)) {
      const hit = (s.exercises || []).find(e => e.id === exId);
      if (hit) return { db: !!hit.db, bw: !!hit.bw, compound: !!hit.compound };
    }
  }
  const lib = exerciseLibrary[exId] || {};
  const pattern = MOVEMENT_PATTERNS[exId] || null;
  const name = (lib.name || '').toLowerCase();
  const db = _DB_EXERCISE_IDS.has(exId) || /\bdb\b|mancuerna|dumbbell/.test(exId + ' ' + name);
  return { db, bw: !!lib.bw, compound: !!(pattern && _COMPOUND_PATTERNS.has(pattern)) };
}

// Series/reps/RPE por defecto para un ejercicio elegido a mano, según su patrón. `notes` SIEMPRE
// string: sin objetivo, la tarjeta interpola `ex.notes` crudo, así que un undefined pintaría
// literalmente "undefined". `reps` siempre string porque `_coachParseReps` la normaliza.
function defaultsForPattern(exId) {
  const p = MOVEMENT_PATTERNS[exId] || 'other';
  if (_COMPOUND_PATTERNS.has(p)) return { reps: '6-10', rpe: '7-8', defaultRest: 150 };
  if (p === 'conditioning') return { reps: '30-40 s', rpe: '7-8', defaultRest: 90 };
  if (p === 'plyometric') return { reps: '3-5', rpe: '6', defaultRest: 90 };
  if (p === 'carry') return { reps: '40 m', rpe: '8', defaultRest: 90 };
  if (p.startsWith('core')) return { reps: '10-15', rpe: '7', defaultRest: 45 };
  if (p === 'glute') return { reps: '10-12', rpe: '7-8', defaultRest: 90 };
  if (p.startsWith('isolation')) return { reps: '10-15', rpe: '7', defaultRest: 60 };
  return { reps: '8-12', rpe: '7', defaultRest: 90 };
}

async function startFreeWorkout() {
  // No pisar un entrenamiento en curso sin avisar.
  const pending = await dbGet('settings', 'activeWorkout');
  if (pending && pending.sessionId) {
    const def = getSessionDef(pending.sessionId);
    const label = (pending.adHoc && pending.adHoc.name) || (def && def.name) || pending.sessionId;
    if (!confirm(`You have "${label}" unfinished. Discard it and start a free session?`)) return;
    await clearActiveWorkout();
  }
  state.adHocSession = makeFreeSession();
  state.workoutStartTime = null;   // startWorkout lo pone a ahora
  state.quickMode = false;
  await startWorkout(FREE_SESSION_ID);
  await saveActiveWorkout();
  await addAdHocExercise();        // arranca pidiendo el primer ejercicio

  // Si cancelaste el selector sin elegir nada, no dejamos una sesión viva y persistida con cero
  // ejercicios: el banner de "en curso" aparecería en Home con 0/0 series y sólo se podría cerrar
  // terminándola o descartándola a mano.
  if (state.adHocSession && !state.adHocSession.exercises.length) {
    state.activeSession = null;
    if (state.workoutTimerInterval) { clearInterval(state.workoutTimerInterval); state.workoutTimerInterval = null; }
    await clearActiveWorkout();
    switchTab('home');
  }
}

// Añade un ejercicio a la sesión libre en caliente. Reutiliza `showActionSheet`, que ya es un
// bottom-sheet genérico basado en promesas (lo usan `showSessionPicker` y `logPastWorkout`).
async function addAdHocExercise() {
  if (!state.adHocSession) return;
  const catalog = libraryOptionsByMuscle();
  const already = new Set(state.adHocSession.exercises.map(e => e.id));

  const muscles = Object.keys(catalog)
    .filter(m => [...catalog[m].keys()].some(id => !already.has(id)))
    .sort();
  if (!muscles.length) { toast('No exercises left to add'); return; }

  // Grupos musculares EN INGLÉS, igual que la insignia de músculo de cada tarjeta de ejercicio en
  // el resto de la app. Dos pasos y ya: músculo → ejercicio. El número de series no se pregunta —
  // entra con 3 y se ajusta con el botón "+ serie" de la tarjeta.
  const muscle = await showActionSheet('Muscle group', muscles.map(m => ({ value: m, label: m })));
  if (!muscle || !catalog[muscle]) return;

  const opts = [...catalog[muscle].entries()]
    .filter(([id]) => !already.has(id))
    .map(([id, name]) => ({ value: id, label: name }));
  const exId = await showActionSheet(muscle, opts);
  if (!exId) return;

  const name = catalog[muscle].get(exId);
  const flags = deriveExerciseFlags(exId);
  const d = defaultsForPattern(exId);
  state.adHocSession.exercises.push({
    id: exId, name, muscle,
    sets: 3,
    reps: d.reps, rpe: d.rpe, defaultRest: d.defaultRest,
    notes: '',
    ...(flags.db ? { db: true } : {}),
    ...(flags.bw ? { bw: true } : {}),
    ...(flags.compound ? { compound: true } : {}),
  });

  // Si el ejercicio no está en el store, registrarlo para que `getExerciseName` lo resuelva en el
  // historial futuro. Se auto-cura sin migración de sembrado.
  if (!exerciseLibrary[exId]) {
    await smartPut('exercises', {
      id: exId, name, muscle,
      movementPattern: MOVEMENT_PATTERNS[exId] || 'other',
      bw: !!flags.bw, defaultNotes: '', custom: false,
    });
    exerciseLibrary[exId] = { id: exId, name, muscle, movementPattern: MOVEMENT_PATTERNS[exId] || 'other', bw: !!flags.bw };
  }

  await _rerenderAdHoc(exId);
}

// Añade una serie a un ejercicio de la sesión libre.
// Clave: incrementa `sets` en la DEFINICIÓN, no sólo añade una fila al DOM. La restauración
// reconstruye las filas a partir de `sets`, así que una fila sin su incremento desaparecería al
// reabrir la app — la misma pérdida silenciosa que este módulo existe para evitar.
async function addAdHocSet(exId) {
  if (!state.adHocSession) return;
  const ex = state.adHocSession.exercises.find(e => e.id === exId);
  if (!ex) return;
  ex.sets = (ex.sets || 3) + 1;
  await _rerenderAdHoc(exId);
}

async function removeAdHocExercise(exId) {
  if (!state.adHocSession) return;
  const i = state.adHocSession.exercises.findIndex(e => e.id === exId);
  if (i < 0) return;
  state.adHocSession.exercises.splice(i, 1);
  // El orden importa: la instantánea se toma del DOM (que todavía tiene la tarjeta) y al restaurar
  // la entrada huérfana se descarta sola, porque `restoreActiveWorkout` ignora lo que no tiene
  // tarjeta. Aquí ese descarte silencioso es justo lo que queremos.
  await _rerenderAdHoc(null);
}

// Re-render por round-trip guardar→restaurar. Es el mismo camino que ya usa el toggle de Quick mode,
// y hace de una vez todo lo que hace falta: recalcula state.activeBlocks (que si no se calcularía
// una sola vez), reconstruye el DOM, re-liga los eventos sin duplicarlos, y repone pesos, reps, RPE,
// notas y los bloques ya cronometrados.
async function _rerenderAdHoc(focusExId) {
  const scroller = document.querySelector('#view-workout .view-scroll');
  const scrollTop = scroller ? scroller.scrollTop : 0;
  await saveActiveWorkout();
  await restoreActiveWorkout();
  if (scroller) scroller.scrollTop = scrollTop;
  if (focusExId) {
    const card = document.querySelector(`#workout-exercises .exercise-card[data-exercise-id="${focusExId}"]`);
    if (card) {
      card.classList.add('expanded');
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
  // Si ya estaban todas las series cerradas, el bloque anterior seguiría corriendo: esto lo cierra
  // y arranca el del ejercicio nuevo.
  advanceBlockIfNeeded();
}

// ==================== FIN SESIÓN LIBRE ====================

// `opts.targets` repone los objetivos de una instantánea al reanudar (`restoreActiveWorkout`):
// el kg que ves a mitad de sesión no puede cambiar porque otro dispositivo haya sincronizado
// un entrenamiento nuevo entre medias. Sin instantánea se calculan.
//
// v11.62: `opts.adjustments` ya no existe. La app NO cambia la sesión del día por la
// recuperación (decisión del usuario, 2026-09-07): la sesión arranca siempre completa, con sus
// kg objetivo, y quien decide saltar un ejercicio o bajar el peso es él, en el momento.
async function startWorkout(sessionId, opts = {}) {
  const baseSession = getSessionDef(sessionId);
  if (!baseSession) {
    // Antes fallaba en silencio. Este proyecto ya ha pagado cuatro veces el precio de no dejar
    // rastro al fallar, así que aquí se avisa.
    console.warn('[startWorkout] sesión desconocida:', sessionId);
    toast(`Cannot find session "${sessionId}"`);
    return;
  }
  // Una sesión libre es de un solo uso: no lee ni escribe `exerciseOverrides`.
  const session = baseSession.adHoc
    ? { ...baseSession, exercises: baseSession.exercises.map(e => ({ ...e })) }
    // Apply persistent exercise swaps (T5.2). id is preserved so session.id works for the swap UI.
    : { ...baseSession, exercises: resolveSessionExercises(sessionId, baseSession.exercises) };

  // La instantánea del readiness se guarda SIEMPRE. Es LOG, no gate: con qué recuperación se
  // arrancó, para que el coach semanal pueda leer la semana entera con contexto. No filtra
  // ejercicios, no tapa el RPE y no recorta series (v11.62).
  try { state.activeReadiness = _coachReadinessStamp(await computeReadiness()); } catch (e) { state.activeReadiness = null; }

  state.activeSession = sessionId;
  // B-1: la sesión en vivo no enseña las notas del entreno guardado que se estuviera mirando
  // (salir por la barra inferior no pasa por el botón de volver, que es quien las limpia).
  state.viewingCompleted = false;
  state.viewingCompletedFrom = null;
  { const ro = document.getElementById('wo-completed-notes'); if (ro) { ro.innerHTML = ''; ro.hidden = true; } }
  { const fin = document.getElementById('btn-finish-workout'); if (fin) fin.hidden = false; }
  // Preserve workoutStartTime if user is just toggling Quick mode on the same
  // session — otherwise reset to now. We treat "no startTime yet" as fresh start.
  if (!state.workoutStartTime) state.workoutStartTime = Date.now();
  state.sessionQuality = 3;
  // Reset block timer state for the new session (warmup starts immediately)
  state.blockTimings = [];
  state.activeBlockId = null;
  state.activeBlockStartedAt = null;
  state.suggestionsShown = new Set();
  if (state.blockTimerInterval) { clearInterval(state.blockTimerInterval); state.blockTimerInterval = null; }
  // Quick mode recorta accesorios y aislamientos a 1 serie. En una sesión libre los ejercicios se
  // eligieron a mano uno por uno, así que recortarlos sería absurdo: se desactiva y se oculta.
  if (baseSession.adHoc) state.quickMode = false;
  { const qb = document.getElementById('quick-mode-bar'); if (qb) qb.classList.toggle('hidden', !!baseSession.adHoc); }
  // Sync Quick toggle pill with current state.quickMode (handles re-renders).
  syncQuickModeUI();
  // Unlock audio with this gesture so the rest-timer cue is audible on iOS PWA.
  primeAudio();
  prepareBeepAudio();

  const wk = getWeekNumber();
  // En deload, `buildExerciseCard` recorta series y fuerza RPE 5-6. Aplicarlo a una sesión libre
  // partiría a la mitad las series que acabás de elegir a mano. No se aplica.
  //
  // Y TAMPOCO SOBRE LOS EJERCICIOS QUE EL COACH YA DOSIFICÓ (v11.61): para ésos el plan del
  // coach trae el volumen de la semana de descarga — el modelo escribe las series y el RPE con
  // LOAD-004 en la mano. Aplicar encima el recorte de la tarjeta sería el doble recorte
  // (4 series → 2 → 1) y un RPE 5-6 sobre una carga que ya se bajó.
  //
  // LA DESCARGA ES POR EJERCICIO CUANDO EL PLAN ES DEL COACH (E-5, auditoría 2026-09-08).
  //
  // El fallo que cierra: `deload` era `false` para TODO el plan en cuanto el autor era
  // `coach-llm`, con el argumento de que el coach ya trae el volumen de la semana de descarga.
  // Cierto para los ejercicios que traen `target` — y falso para los demás: un accesorio que el
  // coach no tocó recibía progresión normal en semana de deload, contra G-H3 y LOAD-004.
  // Ahora se libran los que llevan objetivo del coach; el resto recibe su −10 % y su RPE 5-6.
  const weekIsDeload = baseSession.adHoc ? false : isDeloadWeek(wk);
  const coachAuthored = !!(activePlan && activePlan.author === 'coach-llm');
  const deloadFor = (exId) => weekIsDeload && !(coachAuthored && _coachHasTargetFor(sessionId, exId));
  const anyDeload = weekIsDeload
    && (session.exercises || []).some(e => e && deloadFor(e.id));

  const allWorkoutsDesc = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date));
  // `workouts` alimenta el 1RM estimado de cada tarjeta. Para las sesiones del plan se mantiene
  // exactamente el comportamiento de antes (filtrado por sesión); una libre ve todo el historial.
  const workouts = baseSession.adHoc ? allWorkoutsDesc : allWorkoutsDesc.filter(w => w.session === sessionId);
  let previous;
  if (baseSession.adHoc) {
    // `previous` normalmente es "el último workout de ESTA misma sesión". Para una sesión libre eso
    // no sirve: la anterior tenía otros ejercicios, así que el "Last: …", el 1RM estimado y la rampa
    // de calentamiento saldrían vacíos — justo lo que te dice qué peso poner.
    // Se construye un `previous` sintético buscando, POR EJERCICIO, el último workout en que se hizo,
    // venga de la sesión que venga. `buildExerciseCard` sólo usa `previous.exercises.find(...)` y
    // `previous.unit`, así que encaja sin cambiar firmas.
    const u = state.settings.unit || 'kg';
    const picked = [];
    for (const ex of session.exercises) {
      const src = allWorkoutsDesc.find(w =>
        (w.exercises || []).some(e => e.exerciseId === ex.id && e.sets.some(s => s.done)));
      if (!src) continue;
      const se = src.exercises.find(e => e.exerciseId === ex.id);
      picked.push({
        exerciseId: ex.id,
        sets: se.sets.map(s => ({ ...s, weight: convertWeight(s.weight || 0, src.unit, u) })),
      });
    }
    previous = picked.length ? { unit: u, exercises: picked } : null;
  } else {
    previous = workouts[0] || null;
  }

  // El kg objetivo de cada ejercicio (v11.57). Va al placeholder de las series y a la línea
  // "Objetivo" de la tarjeta; se guarda en `state` para que `finishWorkout` pueda sellar en el
  // registro lo que de verdad se prescribió.
  //
  // Los objetivos de la instantánea se CONSERVAN y sólo se calculan los que falten. Así el
  // reanudado repone el mismo kg (el número no puede cambiar a mitad de sesión) y, a la vez, un
  // ejercicio añadido en una sesión libre —que llega por el mismo round-trip
  // guardar→restaurar— recibe el suyo en vez de quedarse sin objetivo.
  {
    const dados = (opts && opts.targets) || null;
    const faltan = dados ? session.exercises.filter(e => !(e.id in dados)) : session.exercises;
    const nuevos = faltan.length
      ? await computeSessionTargets(sessionId, faltan, { deloadFor, allWorkoutsDesc })
      : {};
    state.activeTargets = Object.assign({}, dados || {}, nuevos);
  }

  const restSettings = await dbGet('settings', 'restTimes') || { key: 'restTimes', data: {} };
  const exerciseNotes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };

  // Set unit toggle to current unit
  const curUnit = state.settings.unit || 'kg';
  document.querySelectorAll('#unit-toggle .unit-opt').forEach(b => b.classList.toggle('active', b.dataset.unit === curUnit));

  // Render warm-up with auto warm-up sets
  const warmupBody = document.getElementById('warmup-body');
  let warmupHTML = `<ul class="warmup-list">${session.warmup.map(w => `<li>${w}</li>`).join('')}</ul>`;

  // Auto warm-up ramp: full for 1st compound, short for 2nd, none for accessories
  if (previous) {
    const bar = state.settings.unit === 'lb' ? 45 : 20;
    let compoundIdx = 0;
    for (const ex of session.exercises) {
      const prevEx = previous.exercises.find(e => e.exerciseId === ex.id);
      // Convert the previous top set from its workout's unit to the display unit
      // so ramp %/plates are correct even when the last session was logged in lb.
      const topWeight = prevEx ? convertWeight(Math.max(...prevEx.sets.filter(s => s.done && s.weight > 0).map(s => s.weight), 0), previous.unit, state.settings.unit) : 0;
      if (topWeight <= bar) continue;
      // Only compounds (sets >= 3 and has RPE >= 7) get warm-up ramps
      const isCompound = ex.sets >= 3 && ex.rpe !== '-' && parseFloat(ex.rpe) >= 7;
      if (!isCompound) continue;
      compoundIdx++;
      let warmupSets;
      if (compoundIdx === 1) {
        // First compound: full ramp (bar → 40% → 60% → 80%)
        warmupSets = [
          { pct: 0, w: bar, reps: 10 },
          { pct: 40, w: Math.round(topWeight * 0.4 / 2.5) * 2.5, reps: 6 },
          { pct: 60, w: Math.round(topWeight * 0.6 / 2.5) * 2.5, reps: 4 },
          { pct: 80, w: Math.round(topWeight * 0.8 / 2.5) * 2.5, reps: 2 },
        ];
      } else if (compoundIdx === 2) {
        // Second compound: short ramp (60% → 80%) — already warm
        warmupSets = [
          { pct: 60, w: Math.round(topWeight * 0.6 / 2.5) * 2.5, reps: 4 },
          { pct: 80, w: Math.round(topWeight * 0.8 / 2.5) * 2.5, reps: 2 },
        ];
      } else {
        break; // No ramp for 3rd+ compound
      }
      warmupSets = warmupSets.filter(s => s.w >= bar && s.w < topWeight);
      if (warmupSets.length > 0) {
        warmupHTML += `
          <div class="warmup-auto">
            <div class="warmup-auto-title">${ex.name} (${topWeight}${state.settings.unit})</div>
            ${warmupSets.map(s => {
              const pb = plateBreakdown(s.w, state.settings.unit);
              return `<div class="warmup-auto-set"><span class="warmup-pct">${s.pct === 0 ? 'Bar' : s.pct + '%'}</span><span class="warmup-weight">${s.w}${state.settings.unit}</span><span class="warmup-reps">× ${s.reps}</span><span class="warmup-plates">${pb}</span></div>`;
            }).join('')}
          </div>`;
      }
    }
  }

  warmupBody.innerHTML = warmupHTML;
  document.getElementById('warmup-section').classList.remove('expanded');

  // Group exercises by superset
  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';
  // Trigger fadeSlideIn stagger only on this initial render — not on reloads
  container.classList.add('initial-animate');
  setTimeout(() => container.classList.remove('initial-animate'), 700);

  // Build groups: standalone exercises and superset groups
  const groups = [];
  let currentSuperset = null;
  session.exercises.forEach((ex, idx) => {
    if (ex.superset) {
      if (currentSuperset && currentSuperset.label === ex.superset) {
        currentSuperset.exercises.push({ ex, idx });
      } else {
        currentSuperset = { type: 'superset', label: ex.superset, exercises: [{ ex, idx }] };
        groups.push(currentSuperset);
      }
    } else {
      currentSuperset = null;
      groups.push({ type: 'single', ex, idx });
    }
  });

  // Compute blocks (warmup + exercises/supersets) and store on state for timer logic.
  // Warmup itself is rendered separately above (#warmup-section), so we only
  // inject block headers for the exercise blocks here. The warmup chip lives
  // on the warmup-section header (see below).
  state.activeBlocks = computeBlocks(session, deloadFor);

  const blockHeaderHTML = (block) => `
    <div class="block-header" data-block-id="${block.id}">
      <span class="block-title">${block.label}</span>
      <div class="block-times">
        <span class="block-time-est">~${formatBlockMin(block.estimatedSec || 0)}</span>
        <span class="block-time-actual hidden">0s</span>
      </div>
    </div>
  `;

  groups.forEach((group, gi) => {
    if (group.type === 'superset') {
      const block = state.activeBlocks.find(b => b.id === `ss-${group.label}`);
      const wrapper = document.createElement('div');
      wrapper.className = 'block-wrapper';
      wrapper.dataset.blockId = block ? block.id : '';
      if (block) wrapper.insertAdjacentHTML('beforeend', blockHeaderHTML(block));
      const inner = document.createElement('div');
      inner.className = 'superset-group';
      inner.innerHTML = `<div class="superset-label">Superset ${group.label}</div>`;
      group.exercises.forEach(({ ex, idx }) => {
        inner.appendChild(buildExerciseCard(ex, idx, previous, restSettings, exerciseNotes, deloadFor(ex.id), session, workouts, (state.activeTargets || {})[ex.id] || null));
      });
      wrapper.appendChild(inner);
      container.appendChild(wrapper);
    } else {
      const block = state.activeBlocks.find(b => b.id === `ex-${group.ex.id}`);
      const wrapper = document.createElement('div');
      wrapper.className = 'block-wrapper';
      wrapper.dataset.blockId = block ? block.id : '';
      if (block) wrapper.insertAdjacentHTML('beforeend', blockHeaderHTML(block));
      wrapper.appendChild(buildExerciseCard(group.ex, group.idx, previous, restSettings, exerciseNotes, deloadFor(group.ex.id), session, workouts, (state.activeTargets || {})[group.ex.id] || null));
      container.appendChild(wrapper);
    }
  });

  // Warmup block chip on the warm-up section header (inserted before chevron)
  const warmupBlock = state.activeBlocks.find(b => b.id === 'warmup');
  const warmupHeader = document.getElementById('warmup-toggle');
  if (warmupBlock && warmupHeader) {
    const existing = warmupHeader.querySelector('.block-times[data-block-id="warmup"]');
    if (existing) existing.remove();
    const chevron = warmupHeader.querySelector('.warmup-chevron');
    const chip = document.createElement('div');
    chip.className = 'block-times';
    chip.dataset.blockId = 'warmup';
    chip.style.marginLeft = 'auto';
    chip.style.marginRight = '8px';
    chip.innerHTML = `
      <span class="block-time-est">~${formatBlockMin(warmupBlock.estimatedSec)}</span>
      <span class="block-time-actual hidden">0s</span>
    `;
    if (chevron) warmupHeader.insertBefore(chip, chevron);
    else warmupHeader.appendChild(chip);
  }

  // Event: expand/collapse
  container.querySelectorAll('.exercise-header').forEach(h => {
    h.addEventListener('click', (e) => {
      // Don't toggle if clicking the exercise name (tappable) link
      if (e.target.classList.contains('tappable')) return;
      h.closest('.exercise-card').classList.toggle('expanded');
    });
  });

  // Drag-to-reorder exercises (long-press + drag)
  initExerciseDrag(container);

  // Event: set check (+ auto rest timer with superset awareness)
  container.querySelectorAll('.set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('checked');
      // V-20: el estado también por accesibilidad, no sólo por clase.
      btn.setAttribute('aria-pressed', btn.classList.contains('checked') ? 'true' : 'false');
      const card = btn.closest('.exercise-card');
      const row = btn.closest('.set-row');
      // ACEPTAR EL OBJETIVO CON EL CHECK (v11.57). Hasta ahora una serie marcada sin escribir
      // peso se guardaba con `weight: 0` y DESAPARECÍA del historial (y del tonelaje, y del
      // 1RM estimado): el gesto más rápido de la pantalla producía un dato falso. Con el
      // objetivo en el placeholder, el número que se ve es la lectura honesta de lo que se
      // acaba de hacer, así que se escribe. Si ya hay algo tecleado, NO se pisa.
      if (btn.classList.contains('checked') && row) {
        const wIn = row.querySelector('[data-field="weight"]');
        if (wIn && wIn.value === '' && isFinite(parseFloat(wIn.placeholder))) {
          wIn.value = wIn.placeholder;
        }
      }
      // Row flash feedback. (No vibration: iOS Safari doesn't implement
      // navigator.vibrate, so this would be Android-only dead code.)
      if (btn.classList.contains('checked')) {
        if (row) {
          row.classList.remove('flashed');
          // Force reflow so the animation restarts
          void row.offsetWidth;
          row.classList.add('flashed');
        }
      }
      updateExerciseStatus(card);
      updateSessionProgress();
      updateNowNext();
      advanceBlockIfNeeded();
      saveActiveWorkout();
      // Auto-start rest timer when checking a set (not unchecking)
      if (btn.classList.contains('checked')) {
        const inSuperset = card.closest('.superset-group');
        const fullRest = parseInt(card.dataset.rest) || 120;
        // In a superset: short rest (15s) between exercises, full rest after last exercise in group
        if (inSuperset) {
          const cards = inSuperset.querySelectorAll('.exercise-card');
          const lastCard = cards[cards.length - 1];
          const isLastExercise = card === lastCard;
          const setIdx = parseInt(btn.dataset.setCheck);
          const allChecked = card.querySelectorAll('.set-check.checked').length === card.querySelectorAll('.set-check').length;
          // If all sets of this exercise done and it's not the last exercise in superset, short rest
          if (!isLastExercise) {
            startRestTimer(15, true);
          } else {
            startRestTimer(fullRest, true);
          }
        } else {
          startRestTimer(fullRest, true);
        }
      }
    });
  });

  // Event: per-exercise notes auto-save
  container.querySelectorAll('.ex-note').forEach(textarea => {
    textarea.addEventListener('input', () => _autosaveWorkout());
  });

  // Event: RPE color on change + auto-save
  container.querySelectorAll('[data-field="rpe"]').forEach(select => {
    select.addEventListener('change', () => {
      const val = parseFloat(select.value);
      const row = select.closest('.set-row');
      if (val) {
        row.style.borderLeft = `3px solid ${rpeColor(val)}`;
        select.style.color = rpeColor(val);
      } else {
        row.style.borderLeft = '';
        select.style.color = '';
      }
      _autosaveWorkout();
    });
  });

  // Auto-save on weight/reps input change
  container.querySelectorAll('[data-field="weight"], [data-field="reps"]').forEach(input => {
    input.addEventListener('change', () => _autosaveWorkout());
  });

  // Event: tappable exercise names
  container.querySelectorAll('.exercise-name.tappable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openExerciseHistory(el.dataset.exId);
    });
  });

  // Event: swap buttons. El :not() importa — el botón de quitar reutiliza la clase .btn-swap por
  // estilo, y sin excluirlo caería aquí con un exId undefined.
  container.querySelectorAll('.btn-swap:not(.btn-remove-ex):not(.btn-add-set)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.exercise-card');
      const muscle = btn.dataset.swapMuscle;
      const exId = btn.dataset.swapExId;
      const ex = session.exercises.find(e => e.id === exId) || { id: exId, name: getExerciseName(exId), muscle };
      showSwapUI(card, ex, session);
    });
  });

  // Event: añadir una serie / quitar un ejercicio (sólo en sesión libre)
  container.querySelectorAll('.btn-add-set').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await addAdHocSet(btn.dataset.addSetExId);
    });
  });
  container.querySelectorAll('.btn-remove-ex').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeAdHocExercise(btn.dataset.removeExId);
    });
  });

  // Quality stars
  document.querySelectorAll('#quality-stars button').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.v) === 3);
    btn.addEventListener('click', () => {
      state.sessionQuality = parseInt(btn.dataset.v);
      document.querySelectorAll('#quality-stars button').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.v) === state.sessionQuality));
    });
  });

  updateSessionProgress();
  updateNowNext();
  startWorkoutTimer();
  showView('workout');
  { const b = document.getElementById('btn-add-exercise'); if (b) b.classList.toggle('hidden', !session.adHoc); }
  document.getElementById('header-title').textContent = session.name;
  document.getElementById('header-subtitle').textContent = session.subtitle + (anyDeload ? ' (Deload)' : '');
  // Start the warmup block timer immediately (workoutStartTime is reference)
  if (!state.blockTimings.length && !state.activeBlockId) {
    state.activeBlockId = 'warmup';
    state.activeBlockStartedAt = state.workoutStartTime;
    if (state.blockTimerInterval) clearInterval(state.blockTimerInterval);
    state.blockTimerInterval = setInterval(updateActiveBlockChip, 1000);
    updateActiveBlockChip();
  }
  saveActiveWorkout();
}

// ==================== OBJETIVO DEL SET (v11.57, incremento 3) ====================
//
// Sustituye a `generateCoachNote`, que calculaba la doble progresión y sólo emitía una FRASE
// ("↑ All sets hit 8 reps… increase to 95") mientras el placeholder del set seguía mostrando el
// peso anterior y el objetivo del cron vivía en otra pestaña: tres números para una decisión
// (audit Change 7, F-4). Ahora el número lo pone `suggestSetTarget` y va al placeholder.
//
// ESTE WRAPPER es la única parte que toca IndexedDB: lee el historial y el objetivo del coach y
// llama al motor puro (`app/coach-engine.js`), que es lo que `verify-set-target.mjs` recorre con
// fixtures. La división es a propósito: nada que necesite IDB se puede probar en Node.

/**
 * Objetivos del coach para una sesión, tal y como los dejó el cron semanal en texto libre.
 * ADAPTADOR LEGACY: mientras el plan activo no sea v2 (incremento 9), el objetivo del coach
 * vive en `weekly_reviews[].nextWeekPlan.sessions[].exercises[].target` como '95 kg × 5-8'.
 * @returns {Promise<{weekKey:string|null, byId:object}|null>}
 */
async function _legacyCoachTargets(sessionId) {
  try {
    if (typeof parseCoachTarget !== 'function') return null;
    const all = await dbGetAll('weekly_reviews');
    if (!all || !all.length) return null;
    const latest = all.slice().sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0))[0];
    const sess = ((latest.nextWeekPlan || {}).sessions || []).find(s => s && s.id === sessionId);
    if (!sess) return null;
    const byId = {};
    for (const ex of (sess.exercises || [])) {
      if (!ex || !ex.id) continue;
      const parsed = parseCoachTarget(ex.target);
      byId[ex.id] = {
        kg: parsed.kg, reps: parsed.reps, bw: parsed.bw, perHand: parsed.perHand,
        rpe: ex.rpe || null, note: ex.note || null,
      };
    }
    return { weekKey: latest.weekKey || null, byId };
  } catch (e) {
    console.warn('[Coach] objetivos legacy:', e);
    return null;
  }
}

/**
 * ¿Trae el coach un objetivo escrito para ESTE ejercicio de esta sesión? (E-5)
 *
 * Es la pregunta que decide si el ejercicio se libra del recorte de descarga: el coach escribe
 * el volumen y el kg de la semana de deload con LOAD-004 en la mano, así que aplicarle encima
 * el −10 % de la tarjeta sería el doble recorte. Pero eso vale SÓLO para los ejercicios que
 * llevan su objetivo; el resto del plan no lo ha mirado nadie y le toca la descarga normal.
 *
 * Se busca por `ex.id` (el movimiento que se va a hacer) y no por `_origId`: el objetivo que
 * el coach escribió para las dominadas no es el objetivo del jalón que las sustituye.
 */
function _coachHasTargetFor(sessionId, exId) {
  const s = (activePlan && activePlan.sessions && activePlan.sessions[sessionId]) || null;
  if (!s || !Array.isArray(s.exercises) || !exId) return false;
  const hit = s.exercises.find(e => e && e.id === exId);
  return !!(hit && hit.target);
}

/**
 * El objetivo de hoy para cada ejercicio de una sesión: `{ [exerciseId]: target }`.
 *
 * HISTORIAL DESDE CUALQUIER SESIÓN, no sólo desde ésta. Lo exigen los dos casos reales: la
 * sesión libre (que nunca se repite igual) y los swaps — si hoy el jalón sustituye a las
 * dominadas, el peso que importa es el del JALÓN, venga de la sesión que venga. Se busca por
 * `ex.id` (el movimiento que se va a hacer), no por `_origId` (el hueco del plan).
 *
 * Los pesos se convierten a kg con `convertWeight`: los registros anteriores a junio de 2026
 * están en lb y compararlos crudos daría un "sube a 95" sobre 95 libras.
 *
 * @param {string} sessionId
 * @param {Array<object>} exercises  Ya resueltos con los swaps (`resolveSessionExercises`).
 * @param {{deload?:boolean, deloadFor?:function, allWorkoutsDesc?:Array<object>}} [opts]
 *        `deloadFor(exId)` (E-5) manda sobre `deload` cuando se pasa: en una semana de descarga
 *        sobre un plan del coach, la descarga es por ejercicio.
 */
async function computeSessionTargets(sessionId, exercises, opts = {}) {
  const out = {};
  if (typeof suggestSetTarget !== 'function') {      // coach-engine.js no cargó
    console.warn('[Coach] coach-engine.js no disponible; sin objetivos de set');
    return out;
  }
  const list = Array.isArray(exercises) ? exercises : [];
  if (!list.length) return out;
  const all = opts.allWorkoutsDesc
    || (await dbGetAll('workouts')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const planSession = (activePlan && activePlan.sessions && activePlan.sessions[sessionId]) || null;
  // El adaptador legacy (`weekly_reviews`, el cron retirado en v11.61) sólo se consulta si el
  // plan activo NO es del coach. Con un plan v2 vivo, `exercises[].target` es la fuente y la
  // prosa del cron es historia: leerla igual reintroduciría los objetivos de un coach que ya no
  // existe, con la etiqueta de autoridad más alta que tiene la app.
  const legacy = (activePlan && activePlan.author === 'coach-llm')
    ? null
    : await _legacyCoachTargets(sessionId);
  const ds = today();
  const todayWeekKey = typeof isoWeekKey === 'function' ? isoWeekKey(ds) : null;

  for (const ex of list) {
    if (!ex || !ex.id) continue;
    const history = [];
    for (const w of all) {
      const we = (w.exercises || []).find(e => e.exerciseId === ex.id);
      if (!we || !Array.isArray(we.sets)) continue;
      history.push({
        date: w.date,
        sets: we.sets.map(s => ({
          weight: convertWeight(s.weight || 0, w.unit || 'kg', 'kg'),
          reps: s.reps, rpe: s.rpe, done: !!s.done,
        })),
      });
    }
    // Prioridad del objetivo del coach: plan v2 primero, texto del cron después.
    //
    // UN SWAP INVALIDA EL OBJETIVO DEL HUECO. `_origId` sólo existe cuando hay un cambio activo,
    // y el kg que el coach fijó era para el movimiento ORIGINAL: aplicar los 70 kg de un jalón a
    // un pullover en polea prescribe un número absurdo con la etiqueta de autoridad más alta que
    // tiene la app. Con swap sólo se acepta un objetivo que el coach haya escrito para el
    // SUSTITUTO (posible desde el incremento 9, cuando el coach reescriba el plan después del
    // cambio); si no lo hay, manda la regla sobre el historial del sustituto.
    let coachTarget = null;
    let coachWeekKey = null;
    let planCreatedAt = null;
    const slotId = ex._origId || ex.id;
    const swapped = !!(ex._origId && ex._origId !== ex.id);
    const findPlanEx = (id) => (planSession && Array.isArray(planSession.exercises)
      ? planSession.exercises.find(e => e.id === id)
      : null);
    const planEx = findPlanEx(ex.id) || (swapped ? null : findPlanEx(slotId));
    let fromPlanV2 = false;
    if (planEx && planEx.target) {
      coachTarget = typeof planEx.target === 'string'
        ? parseCoachTarget(planEx.target)
        : planEx.target;
      if (planEx.rpe && !coachTarget.rpe) coachTarget = { ...coachTarget, rpe: planEx.rpe };
      coachWeekKey = activePlan.weekKey || null;
      planCreatedAt = activePlan.createdAt || null;
      fromPlanV2 = true;
    } else if (legacy) {
      const t = legacy.byId[ex.id] || (swapped ? null : legacy.byId[slotId]);
      if (t) { coachTarget = t; coachWeekKey = legacy.weekKey; }
    }
    // El cron semanal (adaptador legacy) NO conoce la semana del bloque: prescribe carga de
    // construcción también en la descarga (audit Change 4, todavía sin hacer). En una semana de
    // descarga su objetivo se descarta y manda la regla, que sí recorta el 10 %. El objetivo del
    // plan v2 sobrevive: lo escribe el coach de dentro de la app, que ya sabe en qué semana está.
    const exDeload = typeof opts.deloadFor === 'function' ? !!opts.deloadFor(ex.id) : !!opts.deload;
    if (exDeload && coachTarget && !fromPlanV2) coachTarget = null;
    out[ex.id] = suggestSetTarget(ex, history, {
      coachTarget,
      coachWeekKey,
      todayWeekKey,
      planCreatedAt,
      deload: exDeload,
      today: ds,
      measureUnit: measureUnitFor(ex.id),
    });
  }
  return out;
}

/**
 * Adjunta `workout.readout` al registro que se está cerrando: qué se prescribió, qué se hizo y
 * qué toca la próxima vez. Lo pinta `renderCoachReadout()` en Home (app/coach.js) y lo lee el
 * facts pack del coach semanal (incremento 7).
 *
 * El `next` de cada ejercicio se calcula con la sesión de hoy YA metida en el historial, que es
 * exactamente lo que verá la tarjeta la próxima vez.
 *
 * Y CON EL DELOAD DE LA SEMANA QUE VIENE, NO CON `false` (E-8, auditoría 2026-09-08). Se
 * calculaba siempre sin descarga "para no adivinar el calendario", pero el calendario del
 * bloque está anclado a una fecha (`settings.deloadAnchorDate`) y se sabe con exactitud. El
 * resultado era una promesa que el lunes no se cumplía: la tarjeta post-sesión del viernes
 * decía "la próxima: 95 kg" y el lunes de descarga la pantalla prescribía 85. Prometer una
 * subida que el propio sistema ya sabe que no va a ocurrir es peor que no prometer nada.
 */
async function attachSessionReadout(workout, sessionDef) {
  if (typeof sessionReadout !== 'function' || typeof suggestSetTarget !== 'function') return;
  const targets = state.activeTargets || {};
  const all = (await dbGetAll('workouts')).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const ds = today();
  const todayWeekKey = typeof isoWeekKey === 'function' ? isoWeekKey(ds) : null;
  // La próxima exposición de un ejercicio cae en la semana siguiente (2×/semana por músculo →
  // 3-4 días), así que el deload que importa es el de +7 días. Con `blockWeek` anclado a fecha
  // esto no es una estimación: es el mismo cálculo que hará la tarjeta de ese día.
  const nextWeekDeload = (() => {
    try {
      const d = new Date(addDays(ds, 7) + 'T12:00:00');
      return !!(typeof blockWeek === 'function' && blockWeek(d).isDeload);
    } catch (e) { return false; }
  })();
  // F-27: la misma fecha de +7 días que gobierna el deload gobierna la vigencia del objetivo
  // del coach. Una sola definición de "la próxima vez".
  const nextExposureDs = addDays(ds, 7) || ds;
  const exDefs = {};
  const nextById = {};
  for (const we of (workout.exercises || [])) {
    const id = we.exerciseId;
    const planEx = (sessionDef ? (sessionDef.exercises || []).find(e => e.id === id) : null)
      || deriveExerciseFlags(id);
    const def = {
      id,
      name: getExerciseName(id),
      reps: planEx && planEx.reps ? planEx.reps : (targets[id] && targets[id].reps) || '',
      rpe: planEx && planEx.rpe ? planEx.rpe : (targets[id] && targets[id].rpe) || '-',
      db: !!(planEx && planEx.db), bw: !!(planEx && planEx.bw), compound: !!(planEx && planEx.compound),
      measureUnit: measureUnitFor(id),
    };
    exDefs[id] = def;
    // Historial en kg con la sesión de hoy delante (aún no está en `workouts`).
    const history = [{
      date: workout.date,
      sets: (we.sets || []).map(s => ({
        weight: convertWeight(s.weight || 0, workout.unit || 'kg', 'kg'),
        reps: s.reps, rpe: s.rpe, done: !!s.done,
      })),
    }];
    for (const w of all) {
      if (w.id === workout.id) continue;
      const prev = (w.exercises || []).find(e => e.exerciseId === id);
      if (!prev || !Array.isArray(prev.sets)) continue;
      history.push({
        date: w.date,
        sets: prev.sets.map(s => ({
          weight: convertWeight(s.weight || 0, w.unit || 'kg', 'kg'),
          reps: s.reps, rpe: s.rpe, done: !!s.done,
        })),
      });
    }
    // F-27 (auditoría 2026-09-09): iba con `coachTarget: null` fijo, así que la línea "la
    // próxima: 95 kg × 8" de la tarjeta post-sesión salía SIEMPRE de la regla — aunque el coach
    // hubiese escrito un objetivo para ese ejercicio. El lunes la pantalla de la sesión decía
    // otra cosa (ahí el objetivo del coach sí manda), y dos números distintos para el mismo set
    // con tres días de diferencia son un sistema que no sabe lo que prescribe.
    //
    // La ventana es la de SIEMPRE (`coachTargetIsCurrent`), evaluada a +7 días porque ésa es la
    // fecha de la próxima exposición: un plan de la semana pasada ya no vale para la que viene.
    let nextCoachTarget = null;
    if (planEx && planEx.target && activePlan && activePlan.weekKey
        && typeof coachTargetIsCurrent === 'function'
        && coachTargetIsCurrent(activePlan.weekKey, nextExposureDs)) {
      nextCoachTarget = typeof planEx.target === 'string' ? parseCoachTarget(planEx.target) : planEx.target;
      if (planEx.rpe && nextCoachTarget && !nextCoachTarget.rpe) nextCoachTarget = { ...nextCoachTarget, rpe: planEx.rpe };
    }
    nextById[id] = suggestSetTarget(def, history, {
      coachTarget: nextCoachTarget,
      coachWeekKey: nextCoachTarget ? activePlan.weekKey : null,
      todayWeekKey,
      planCreatedAt: nextCoachTarget ? (activePlan.createdAt || null) : null,
      deload: nextWeekDeload, today: ds, measureUnit: def.measureUnit,
    });
  }
  workout.readout = sessionReadout(workout, targets, exDefs, nextById);
}

/**
 * La línea "Objetivo: **92,5 kg** × 5-8 @7-8 [chip]" de la tarjeta.
 * Devuelve '' cuando no hay kg que prescribir: sin objetivo la tarjeta queda EXACTAMENTE como
 * antes de v11.57 (ejercicios de medida, primera vez, ab wheel). `verify-coach-wiring.mjs`
 * compara el HTML sin objetivo contra la instantánea de v11.56.
 */
function coachObjectiveHtml(target, ex) {
  if (!target || target.kg == null) return '';
  const kgDisp = convertWeight(target.kg, 'kg', state.settings.unit);
  const label = (ex && ex.bw ? '+' : '') + _coachFmtKg(kgDisp) + ' ' + state.settings.unit;
  const chipTxt = target.source === 'coach' ? 'coach' : (target.source === 'last' ? 'last' : 'rule');
  const rpeBit = target.rpe && target.rpe !== '-' ? ` @${escapeHtml(target.rpe)}` : '';
  return `<div class="exercise-objective coach-objective"><span class="coach-obj-label">Target:</span> <b>${label}</b> × ${escapeHtml(target.reps)}${rpeBit} <span class="coach-chip coach-chip-${target.source}">${chipTxt}</span></div>`;
}

function buildExerciseCard(ex, exIdx, previous, restSettings, exerciseNotes, deload, session, allWorkouts, target = null) {
  const prevEx = previous ? previous.exercises.find(e => e.exerciseId === ex.id) : null;
  const customRest = (restSettings.data && restSettings.data[ex.id]) || ex.defaultRest;
  // Quick mode: keep compounds full (overload signal), trim accessories.
  // Deload always wins over Quick because both compress the session, but deload
  // governs intensity too. When both apply, deload formula is used.
  let numSets;
  if (deload) {
    numSets = Math.ceil(ex.sets / 2);
  } else if (state.quickMode) {
    if (ex.compound) numSets = ex.sets;
    else if (ex.superset || ex.muscle === 'Core') numSets = 1;
    else numSets = Math.max(2, ex.sets - 1);
  } else {
    numSets = ex.sets;
  }
  // v11.62: aquí estaba el recorte de series y el tope de RPE por recuperación. Fuera. Lo único
  // que comprime la sesión son el deload (programado) y el quick mode (elegido a mano).
  const rpeDisplay = deload && ex.rpe !== '-' ? 'RPE 5-6' : `RPE ${ex.rpe}`;
  const muscleColor = MUSCLE_COLORS[ex.muscle] || MUSCLE_FALLBACK;

  // El objetivo manda sobre la nota estática. `source: 'none'` (medida, primera vez) NO cuenta
  // como objetivo: en ese caso la tarjeta tiene que quedar idéntica a la de v11.56.
  const hasTarget = !!(target && target.source !== 'none' && target.reason);
  // La razón se escapa: cuando viene del coach es texto de un LLM y acaba en innerHTML. La
  // frase del deload sí lleva HTML propio, así que sólo esa rama se interpola cruda.
  const coachNote = hasTarget
    ? escapeHtml(target.reason)
    : (deload ? '<strong>Deload:</strong> lighter weight, focus on form.' : ex.notes);
  const objectiveHTML = hasTarget ? coachObjectiveHtml(target, ex) : '';
  // Placeholder de TODAS las series = el kg objetivo. La fila fantasma sigue mostrando lo
  // anterior, así que no se pierde el dato: se gana el número que hay que poner hoy.
  const targetKgDisp = (target && target.kg != null)
    ? convertWeight(target.kg, 'kg', state.settings.unit)
    : null;

  // Calculate est. 1RM from all history for this exercise
  let best1RM = 0;
  // Un 1RM estimado sobre centimetros de cajon no significa nada (v11.48).
  if (!measureUnitFor(ex.id)) allWorkouts.forEach(w => {
    const wex = w.exercises.find(e => e.exerciseId === ex.id);
    if (wex) {
      wex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0).forEach(s => {
        const e1rm = estimate1RM(convertWeight(s.weight, w.unit, state.settings.unit), s.reps);
        if (e1rm > best1RM) best1RM = e1rm;
      });
    }
  });

  const card = document.createElement('div');
  card.className = 'exercise-card';
  card.dataset.exerciseId = ex.id;
  card.dataset.origId = ex._origId || ex.id;       // original slot exercise (swap key)
  card.dataset.origName = ex._origName || ex.name; // for the "back to original" option
  if (exIdx === 0) card.classList.add('expanded');

  let setsHTML = '';
  for (let i = 0; i < numSets; i++) {
    const prevSet = prevEx && prevEx.sets[i];
    // Previous set weight converted from its workout's unit to the display unit.
    const prevWeightDisp = prevSet ? convertWeight(prevSet.weight, previous && previous.unit, state.settings.unit) : null;
    const ghostHTML = prevSet && prevSet.done ? `<div class="ghost-set"><span>${ex.bw ? '+' : ''}${prevWeightDisp}</span><span>${prevSet.reps}</span><span>${prevSet.rpe || ''}</span></div>` : '';
    setsHTML += `
      ${ghostHTML}
      <div class="set-row" data-set="${i}">
        <div class="set-num">${i + 1}</div>
        <input type="number" class="set-input" data-field="weight" placeholder="${targetKgDisp != null ? targetKgDisp : (prevSet ? prevWeightDisp : (ex.bw ? '0' : '-'))}" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="${prevSet ? prevSet.reps : '-'}" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px">
          <option value="">RPE</option>
          ${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
        <button class="set-check" data-set-check="${i}" aria-label="Set ${i + 1}" aria-pressed="false">✓</button>
      </div>
    `;
  }

  const prevDoneSets = prevEx ? prevEx.sets.filter(s => s.done && (s.weight > 0 || ex.bw)) : [];
  const prevSummary = prevDoneSets.length > 0
    ? prevDoneSets.map(s => { const wd = convertWeight(s.weight, previous && previous.unit, state.settings.unit); return `${ex.bw ? '+' + wd : wd}×${s.reps}`; }).join('  ')
    : '';
  const prevHeaderHTML = prevSummary
    ? `<div class="prev-header">Last: ${prevSummary}</div>`
    : '';

  const e1rmHTML = best1RM > 0 ? `<div class="exercise-1rm">Est. 1RM: ${best1RM} ${state.settings.unit}</div>` : '';

  card.innerHTML = `
    <div class="exercise-header">
      <div class="exercise-info">
        <div class="exercise-name-row">
          <span class="exercise-name tappable" data-ex-id="${ex.id}">${ex.name} <span class="tap-hint">history</span></span>
          <span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${ex.muscle}</span>
        </div>
        <div class="exercise-target">${numSets} × ${ex.reps} @ ${rpeDisplay} · Rest ${Math.floor(customRest / 60)}:${(customRest % 60).toString().padStart(2, '0')}</div>${objectiveHTML}
        ${prevHeaderHTML}
        ${e1rmHTML}
      </div>
      <div class="exercise-status" data-status="${ex.id}"></div>
    </div>
    <div class="exercise-body">
      <div class="exercise-body-inner">
        <div class="set-table">
          <div class="set-table-header">
            <div>Set</div>
            <div>${measureUnitFor(ex.id) || (ex.bw ? '+' + state.settings.unit : (ex.db ? state.settings.unit + '/DB' : state.settings.unit))}</div>
            <div>Reps</div>
            <div>RPE</div>
            <div></div>
          </div>
          ${setsHTML}
        </div>
        <div class="exercise-notes">${coachNote}</div>
        <textarea class="ex-note" data-ex-note="${ex.id}" placeholder="Notes for this exercise..." rows="1"></textarea>
        <button class="btn-swap" data-swap-muscle="${ex.muscle}" data-swap-ex-id="${ex.id}">↔ Swap exercise</button>
        ${session && session.adHoc ? `<button class="btn-swap btn-add-set" data-add-set-ex-id="${ex.id}">+ Set</button>
        <button class="btn-swap btn-remove-ex" data-remove-ex-id="${ex.id}">✕ Remove from session</button>` : ''}
      </div>
    </div>
  `;
  card.dataset.rest = customRest;
  return card;
}

function updateExerciseStatus(card) {
  const checks = card.querySelectorAll('.set-check');
  const done = card.querySelectorAll('.set-check.checked');
  const statusEl = card.querySelector('.exercise-status');
  if (done.length === checks.length && checks.length > 0) {
    statusEl.className = 'exercise-status done';
    statusEl.textContent = '✓';
    // Find next incomplete card across the entire workout (handles supersets too)
    const allCards = [...document.querySelectorAll('#workout-exercises .exercise-card')];
    const myIdx = allCards.indexOf(card);
    const nextCard = allCards.slice(myIdx + 1).find(c => {
      const cDone = c.querySelectorAll('.set-check.checked').length;
      const cTotal = c.querySelectorAll('.set-check').length;
      return cTotal > 0 && cDone < cTotal;
    });
    if (nextCard && !nextCard.classList.contains('expanded')) {
      card.classList.remove('expanded');
      nextCard.classList.add('expanded');
    } else if (!nextCard) {
      card.classList.remove('expanded');
    }
  } else if (done.length > 0) {
    statusEl.className = 'exercise-status partial';
    statusEl.textContent = `${done.length}`;
  } else {
    statusEl.className = 'exercise-status';
    statusEl.textContent = '';
  }
}

// Highlight the current (first incomplete) set across all exercises and
// update the Now / Next bar at the top of the workout view.
function updateNowNext() {
  const container = document.getElementById('workout-exercises');
  if (!container) return;
  // Clear current markers
  container.querySelectorAll('.set-row.current').forEach(r => r.classList.remove('current'));
  container.querySelectorAll('.set-row.completed').forEach(r => r.classList.remove('completed'));

  const cards = [...container.querySelectorAll('.exercise-card')];
  let nowExName = '—';
  let nextExName = '—';
  let foundCurrent = false;

  for (const card of cards) {
    const rows = [...card.querySelectorAll('.set-row')];
    const allDone = rows.length > 0 && rows.every(r => r.querySelector('.set-check').classList.contains('checked'));
    if (allDone) continue;

    // Mark completed rows in this card
    rows.forEach(r => {
      if (r.querySelector('.set-check').classList.contains('checked')) r.classList.add('completed');
    });

    if (!foundCurrent) {
      // First incomplete set in the first incomplete card
      const firstOpen = rows.find(r => !r.querySelector('.set-check').classList.contains('checked'));
      if (firstOpen) firstOpen.classList.add('current');
      const nameEl = card.querySelector('.exercise-name');
      nowExName = nameEl ? nameEl.childNodes[0].textContent.trim() : '—';
      foundCurrent = true;
      continue;
    }
    // Next incomplete exercise after the current
    const nameEl = card.querySelector('.exercise-name');
    nextExName = nameEl ? nameEl.childNodes[0].textContent.trim() : '—';
    break;
  }

  const nowEl = document.getElementById('nn-now-val');
  const nextEl = document.getElementById('nn-next-val');
  if (nowEl) nowEl.textContent = nowExName;
  if (nextEl) nextEl.textContent = nextExName === '—' ? 'Last one 💪' : nextExName;
}

// ==================== WORKOUT PERSISTENCE ====================
function captureWorkoutState() {
  const exercises = [];
  document.querySelectorAll('#workout-exercises .exercise-card').forEach(card => {
    const exId = card.dataset.exerciseId;
    const expanded = card.classList.contains('expanded');
    const sets = [];
    card.querySelectorAll('.set-row').forEach(row => {
      sets.push({
        weight: row.querySelector('[data-field="weight"]').value,
        reps: row.querySelector('[data-field="reps"]').value,
        rpe: row.querySelector('[data-field="rpe"]').value,
        done: row.querySelector('.set-check').classList.contains('checked'),
      });
    });
    const noteEl = card.querySelector('.ex-note');
    const note = noteEl ? noteEl.value : '';
    exercises.push({ exerciseId: exId, sets, expanded, note });
  });
  return {
    key: 'activeWorkout',
    sessionId: state.activeSession,
    startTime: state.workoutStartTime,
    quality: state.sessionQuality,
    notes: '',
    exercises,
    blockTimings: state.blockTimings || [],
    activeBlockId: state.activeBlockId || null,
    activeBlockStartedAt: state.activeBlockStartedAt || null,
    quickMode: !!state.quickMode,
    // La definición de la sesión libre viaja CON la instantánea. Sin esto, al reabrir la app no hay
    // forma de saber qué ejercicios habías elegido: `startWorkout` pintaría cero tarjetas y el
    // emparejamiento por exerciseId descartaría en silencio todas las series. Es exactamente el
    // fallo que tenía el código de plantillas que se acaba de retirar.
    adHoc: state.adHocSession ? JSON.parse(JSON.stringify(state.adHocSession)) : null,
    // Los objetivos viajan CON la instantánea (v11.57). Recalcularlos al reanudar los dejaría a
    // merced de lo que haya sincronizado otro dispositivo a mitad de sesión: el kg que estás
    // levantando no puede cambiar entre que cierras la app y la reabres.
    targets: state.activeTargets ? JSON.parse(JSON.stringify(state.activeTargets)) : null,
    // La instantánea del readiness viaja con la sesión: si entrenó a las 7:00 sin dato de hoy,
    // el registro tiene que decir eso y no el verde que llegó a mediodía.
    readinessAtStart: state.activeReadiness ? JSON.parse(JSON.stringify(state.activeReadiness)) : null,
  };
}

// v11.70 (C-5): el autoguardado del entreno en curso colgaba de `input`/`change` sin `catch`. Un
// fallo de IndexedDB (cuota, VersionError, pestaña bloqueada) era un rechazo sin dueño por pulsación
// y el borrador dejaba de persistir EN SILENCIO — el dato más caro de perder de la app. Un toast, una
// sola vez por sesión: el segundo fallo ya no es noticia, y el aviso en cada tecla sería ruido.
let _autosaveWarned = false;
function _autosaveWorkout() {
  Promise.resolve().then(() => saveActiveWorkout()).catch((e) => {
    console.warn('[workout] autosave:', e);
    if (_autosaveWarned) return;
    _autosaveWarned = true;
    if (typeof toast === 'function') toast('Could not save the workout draft. Check storage and try again.');
  });
}

async function saveActiveWorkout() {
  if (!state.activeSession) return;
  const data = captureWorkoutState();
  await dbPut('settings', data);
}

async function clearActiveWorkout() {
  await dbDelete('settings', 'activeWorkout');
  const banner = document.getElementById('resume-workout-banner');
  if (banner) { banner.classList.add('hidden'); banner.innerHTML = ''; }
  const weekBanner = document.getElementById('week-banner');
  if (weekBanner) weekBanner.classList.remove('hidden');
  // Stop any block timer leftover (discard/finish)
  if (state.blockTimerInterval) { clearInterval(state.blockTimerInterval); state.blockTimerInterval = null; }
  state.activeBlockId = null;
  state.activeBlockStartedAt = null;
  state.blockTimings = [];
  state.quickMode = false;
  state.workoutStartTime = null;
  state.adHocSession = null;
  state.activeTargets = null;
  state.activeReadiness = null;
  { const qb = document.getElementById('quick-mode-bar'); if (qb) qb.classList.remove('hidden'); }
  syncQuickModeUI();
}

async function showResumeBanner() {
  const banner = document.getElementById('resume-workout-banner');
  const weekBanner = document.getElementById('week-banner');
  // Render the mobility banner in parallel — independent of the workout one.
  await showResumeMobilityBanner();

  if (!banner) return;
  const saved = await dbGet('settings', 'activeWorkout');
  if (!saved || !saved.sessionId) {
    banner.classList.add('hidden');
    if (weekBanner) weekBanner.classList.remove('hidden');
    return;
  }
  // `saved.adHoc` primero: si no, una sesión libre en curso caería en el clearActiveWorkout de
  // abajo y se BORRARÍA sola al reabrir la app.
  const session = saved.adHoc || activePlan.sessions[saved.sessionId];
  if (!session) { await clearActiveWorkout(); return; }
  if (weekBanner) weekBanner.classList.add('hidden');

  const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
  const completedSets = saved.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
  const totalSets = saved.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="resume-banner" id="resume-banner-tap">
      <div class="resume-banner-icon">💪</div>
      <div class="resume-banner-info">
        <div class="resume-banner-title">${session.name} in progress</div>
        <div class="resume-banner-sub">${completedSets}/${totalSets} sets · ${formatDuration(elapsed)} elapsed</div>
      </div>
      <button class="resume-banner-discard" id="resume-discard">Discard</button>
    </div>
  `;

  document.getElementById('resume-banner-tap').addEventListener('click', async (e) => {
    if (e.target.id === 'resume-discard') {
      e.stopPropagation();
      if (confirm('Discard this workout? All progress will be lost.')) {
        await clearActiveWorkout();
        state.activeSession = null;
      }
      return;
    }
    await restoreActiveWorkout();
    banner.classList.add('hidden');
  });
}

async function showResumeMobilityBanner() {
  const banner = document.getElementById('resume-mobility-banner');
  if (!banner) return;
  const saved = await dbGet('settings', 'activeMobility');
  if (!saved || !saved.routineId) {
    banner.classList.add('hidden');
    banner.innerHTML = '';
    return;
  }
  const routine = MOBILITY_LIBRARY[saved.routineId];
  if (!routine) { await clearActiveMobility(); return; }

  const elapsed = Math.floor((Date.now() - (saved.startedAt || Date.now())) / 1000);
  const total = routine.exercises.length;
  const idx = Math.min(saved.exerciseIdx || 0, total - 1);

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="resume-banner resume-banner-mobility" id="resume-mobility-tap">
      <div class="resume-banner-icon">🧘</div>
      <div class="resume-banner-info">
        <div class="resume-banner-title">${routine.name} in progress</div>
        <div class="resume-banner-sub">${idx + 1}/${total} exercises · ${formatDuration(elapsed)} elapsed</div>
      </div>
      <button class="resume-banner-discard" id="resume-mobility-discard">Discard</button>
    </div>
  `;

  document.getElementById('resume-mobility-tap').addEventListener('click', async (e) => {
    if (e.target.id === 'resume-mobility-discard') {
      e.stopPropagation();
      if (confirm('Discard this mobility session? Progress will be lost.')) {
        await clearActiveMobility();
      }
      return;
    }
    await restoreActiveMobility();
    banner.classList.add('hidden');
  });
}

async function restoreActiveWorkout() {
  const saved = await dbGet('settings', 'activeWorkout');
  if (!saved || !saved.sessionId) return false;
  // La definición ad-hoc se repone ANTES de resolver, para que getSessionDef la encuentre. Sin esto
  // una sesión libre entraría por el clearActiveWorkout de abajo y se perdería entera.
  state.adHocSession = saved.adHoc || null;
  const session = getSessionDef(saved.sessionId);
  if (!session) { await clearActiveWorkout(); return false; }

  // Restore state
  state.activeSession = saved.sessionId;
  state.workoutStartTime = saved.startTime;
  state.sessionQuality = saved.quality || 3;
  state.quickMode = !!saved.quickMode;

  // Rebuild the workout UI (reuse startWorkout rendering)
  await startWorkout(saved.sessionId, { targets: saved.targets || null });
  // El readiness del ARRANQUE, no el de ahora: si entrenó a las 7:00 sin dato de hoy, el registro
  // tiene que decir eso y no el verde que llegó a mediodía.
  if (saved.readinessAtStart) state.activeReadiness = saved.readinessAtStart;
  // startWorkout resetea sessionQuality a 3 (bug de orden preexistente: la línea de arriba lo fija
  // y startWorkout lo pisa antes de que se repinten las estrellas). Con el round-trip de "añadir
  // ejercicio" esto pasaría en CADA añadido, así que se repone aquí.
  state.sessionQuality = saved.quality || 3;

  // Now restore the saved input values on top of the freshly rendered UI
  const cards = document.querySelectorAll('#workout-exercises .exercise-card');
  saved.exercises.forEach((savedEx, i) => {
    // Find the card with matching exerciseId
    const card = [...cards].find(c => c.dataset.exerciseId === savedEx.exerciseId);
    if (!card) return;
    if (savedEx.expanded) card.classList.add('expanded');
    else card.classList.remove('expanded');
    const rows = card.querySelectorAll('.set-row');
    savedEx.sets.forEach((s, j) => {
      const row = rows[j];
      if (!row) return;
      if (s.weight) row.querySelector('[data-field="weight"]').value = s.weight;
      if (s.reps) row.querySelector('[data-field="reps"]').value = s.reps;
      if (s.rpe) {
        const sel = row.querySelector('[data-field="rpe"]');
        sel.value = s.rpe;
        sel.style.color = rpeColor(parseFloat(s.rpe));
        row.style.borderLeft = `3px solid ${rpeColor(parseFloat(s.rpe))}`;
      }
      if (s.done) {
        // V-20: clase y estado accesible van juntos, o VoiceOver lee "no marcado" sobre una
        // serie que sí lo está.
        const chk = row.querySelector('.set-check');
        if (chk) { chk.classList.add('checked'); chk.setAttribute('aria-pressed', 'true'); }
      }
    });
  });

  // Restore per-exercise notes
  saved.exercises.forEach(savedEx => {
    const card = [...cards].find(c => c.dataset.exerciseId === savedEx.exerciseId);
    if (!card) return;
    const noteEl = card.querySelector('.ex-note');
    if (noteEl && savedEx.note) noteEl.value = savedEx.note;
  });

  // Restore quality
  document.querySelectorAll('#quality-stars button').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.v) === state.sessionQuality);
  });

  // Restore start time for timer (don't reset it)
  state.workoutStartTime = saved.startTime;
  updateSessionProgress();
  updateNowNext();
  // This is a restore, not a first render — drop the stagger animation
  const wc = document.getElementById('workout-exercises');
  if (wc) wc.classList.remove('initial-animate');

  // Restore block timer state and re-render finalized chips
  if (state.blockTimerInterval) { clearInterval(state.blockTimerInterval); state.blockTimerInterval = null; }
  state.blockTimings = saved.blockTimings || [];
  state.blockTimings.forEach(t => {
    const el = document.querySelector(`[data-block-id="${t.blockId}"] .block-time-actual`);
    if (el) {
      el.classList.remove('hidden');
      el.classList.add('done');
      el.textContent = formatBlockMin(t.durationSec);
    }
  });
  state.activeBlockId = saved.activeBlockId || null;
  state.activeBlockStartedAt = saved.activeBlockStartedAt || null;
  // If there was an active block, resume its ticking; otherwise figure out where we are
  if (state.activeBlockId && state.activeBlockStartedAt) {
    state.blockTimerInterval = setInterval(updateActiveBlockChip, 1000);
    updateActiveBlockChip();
  } else {
    advanceBlockIfNeeded();
  }

  return true;
}

function startWorkoutTimer() {
  if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
  const timerEl = document.getElementById('workout-timer');
  state.workoutTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);
    timerEl.textContent = formatDuration(elapsed);
  }, 1000);
}

async function finishWorkout() {
  if (!state.activeSession) return;
  const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);
  const duration = formatDuration(elapsed);

  const exercises = [];
  const sessionDef = getSessionDef(state.activeSession);
  document.querySelectorAll('#workout-exercises .exercise-card').forEach(card => {
    const exId = card.dataset.exerciseId;
    const sets = [];
    card.querySelectorAll('.set-row').forEach(row => {
      const weight = parseFloat(row.querySelector('[data-field="weight"]').value) || 0;
      const reps = parseInt(row.querySelector('[data-field="reps"]').value) || 0;
      const rpe = parseFloat(row.querySelector('[data-field="rpe"]').value) || null;
      const done = row.querySelector('.set-check').classList.contains('checked');
      sets.push({ weight, reps, rpe, done });
    });
    const noteEl = card.querySelector('.ex-note');
    const note = noteEl ? noteEl.value.trim() : '';
    // Snapshot exercise meta flags so volume/calorie calc doesn't depend on
    // the plan still containing this exercise definition later.
    // `sessionDef` es la sesión BASE, así que un ejercicio intercambiado con el swap no aparece en
    // ella y hasta ahora perdía sus flags — con lo que `volumeForExercise` le quitaba el factor ×2
    // de mancuerna. El fallback lo arregla, y es lo que hace funcionar la sesión libre.
    const planEx = (sessionDef ? sessionDef.exercises.find(e => e.id === exId) : null)
      || deriveExerciseFlags(exId);
    const meta = {};
    if (planEx?.db) meta.db = true;
    if (planEx?.bw) meta.bw = true;
    if (planEx?.compound) meta.compound = true;
    // Instantánea de lo que la tarjeta PRESCRIBIÓ (v11.57). Es lo que permite luego decir "te
    // propuse 95, hiciste 92,5×8/8/7": sin guardarlo, el objetivo se recalcularía con el
    // historial de después y el sistema no podría contrastar su propia decisión. Campo nuevo y
    // opcional: la forma del registro sigue siendo compatible hacia atrás.
    const t = (state.activeTargets || {})[exId];
    if (t) meta.target = { kg: t.kg, reps: t.reps, rpe: t.rpe, source: t.source, reason: t.reason };
    exercises.push({ exerciseId: exId, sets, note, ...meta });
  });

  // Finalize the active block (whatever the user was on when hitting Finish)
  if (state.activeBlockId) endBlockTimer(state.activeBlockId);

  // Use the date the workout was started, not when it was finished (local tz)
  const startDate = dateStr(new Date(state.workoutStartTime));
  const workout = {
    id: uid(),
    date: startDate,
    session: state.activeSession,
    // Se guarda en el registro para que el histórico no dependa de que la sesión siga existiendo en
    // el plan — imprescindible para 'free', que nunca estará en `activePlan.sessions`.
    sessionName: sessionDef?.name || state.activeSession,
    planVersion: activePlan.version || 1,
    week: getWeekNumber(),
    startTime: new Date(state.workoutStartTime).toTimeString().slice(0, 5),
    duration,
    exercises,
    quality: state.sessionQuality,
    notes: '',
    unit: state.settings.unit || 'kg',
    blockTimings: (state.blockTimings || []).slice(),
    quick: !!state.quickMode,
    // Con qué recuperación se arrancó (v11.59). Campo opcional y LOG PURO: el coach semanal lo
    // lee para contextualizar la semana. Desde v11.62 no hay `adjusted` ni `adjustments`, porque
    // la app ya no cambia la sesión del día por la recuperación.
    readinessAtStart: state.activeReadiness || null,
  };

  // Instantánea de la clasificación (F-7, v11.58): el registro se describe a sí mismo y deja de
  // depender de que el id siga en el plan mañana. Campos nuevos y opcionales — `toSession` los
  // respeta si están y cae al lookup si no, así que los 31 registros anteriores siguen valiendo.
  // NO se guarda `sessionType`: eso activaría la primera rama de `toSession` (la de los registros
  // de `sessions`, que devuelve el registro crudo) en vez del envoltorio de fuerza.
  // (`free` está en SESSION_CLASS_EXTRA → strength.full peso 2, como cualquier otra sesión.)
  const _cls = sessionClassMap()[state.activeSession] || null;
  if (_cls) {
    workout.family = _cls.family;
    workout.subtype = _cls.subtype;
    const _meta = sessionSubtypeMeta(_cls.family, _cls.subtype) || {};
    workout.budgetWeight = _cls.bw != null ? _cls.bw : (_meta.budgetWeight != null ? _meta.budgetWeight : 1);
  }

  // LECTURA DE LA SESIÓN (v11.57): objetivo vs. hecho, y qué toca la próxima vez. Se calcula
  // ANTES de escribir porque `clearActiveWorkout()` limpia `state.activeTargets`, y entero
  // dentro de un try/catch: terminar un entrenamiento no puede fallar por un resumen.
  try {
    await attachSessionReadout(workout, sessionDef);
  } catch (e) {
    console.warn('[Coach] lectura de sesión:', e);
  }

  // V-9 (auditoría 2026-09-08): la escritura del entreno NO estaba en un try/catch. Un fallo
  // de IndexedDB (cuota llena, base bloqueada por otra pestaña, migración a medias) rechazaba
  // la promesa de `finishWorkout` y el usuario veía la app volver a Home sin nada guardado y
  // sin un solo aviso — una hora de trabajo perdida en silencio. Con esto: toast, warning, y
  // la sesión activa SE QUEDA para poder reintentar.
  try {
    await smartPut('workouts', workout);
  } catch (e) {
    console.warn('[Gym] guardar entreno:', e);
    toast(`Something went wrong saving the workout: ${(e && e.message) || 'storage error'}`);
    return;
  }

  // El registro de decisiones es la memoria del coach (§B.7): UNA fila por sesión, con el
  // detalle por ejercicio en `evidence.perExercise`. Nunca bloquea el cierre de la sesión.
  if (workout.readout) {
    try {
      await logDecision({
        date: workout.date,
        source: 'rule',
        type: 'session-readout',
        what: workout.readout.line,
        why: 'Double progression over the logged session',
        ruleIds: ['STR-001'],
        evidence: {
          perExercise: workout.readout.items.map(it => ({
            id: it.exerciseId,
            target: it.target ? it.target.kg : null,
            source: it.target ? it.target.source : null,
            topKg: it.done.topKg,
            reps: it.done.reps,
            avgRpe: it.done.avgRpe,
            outcome: it.outcome,
            next: it.next ? it.next.kg : null,
          })),
          summary: workout.readout.summary,
        },
        ref: { workoutId: workout.id, sessionId: workout.session },
        outcome: 'done',
      });
    } catch (e) {
      console.warn('[Coach] logDecision(session-readout):', e);
    }
  }

  // El RPE y la calidad de la sesión que se acaba de cerrar son dos de las señales del
  // readiness: la respuesta de mañana ya no es la de hace un minuto.
  invalidateReadiness();
  await clearActiveWorkout();

  // Clear state and navigate home BEFORE running async PR detection so the
  // user lands on Gym immediately. PR toast will appear ~500ms later.
  if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
  if (state.blockTimerInterval) clearInterval(state.blockTimerInterval);
  state.activeSession = null;
  state.workoutStartTime = null;
  state.currentView = 'home';
  state.activeBlockTimings = null;
  state.activeBlockId = null;
  toast('Workout saved!');
  // Navigate to Home after finishing — rings light up, recent activity shows the workout
  switchTab('home');

  // PR detection runs after navigation — its toast appears with a small delay
  detectPRs(workout).catch(() => {});
}

// ==================== EXERCISE HISTORY MODAL ====================
async function openExerciseHistory(exId) {
  const modal = document.getElementById('exercise-modal');
  const exName = getExerciseName(exId);
  document.getElementById('modal-ex-name').textContent = exName;

  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));

  // Gather history for this exercise
  const history = [];
  workouts.forEach(w => {
    const ex = w.exercises.find(e => e.exerciseId === exId);
    if (ex) {
      const doneSets = ex.sets.filter(s => s.done && s.weight > 0);
      if (doneSets.length > 0) {
        const bestSet = doneSets.reduce((best, s) => estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps) ? s : best);
        const avgRpe = doneSets.filter(s => s.rpe).reduce((sum, s, _, arr) => sum + s.rpe / arr.length, 0);
        // Convert to the display unit so lb and kg sessions chart on one scale.
        history.push({
          date: w.date,
          sets: doneSets,
          unit: w.unit,
          best1RM: estimate1RM(convertWeight(bestSet.weight, w.unit, state.settings.unit), bestSet.reps),
          bestWeight: convertWeight(bestSet.weight, w.unit, state.settings.unit),
          bestReps: bestSet.reps,
          avgRpe: avgRpe || null,
        });
      }
    }
  });

  // Show 1RM summary
  const latest1RM = history.length > 0 ? history[history.length - 1].best1RM : 0;
  const peak1RM = history.reduce((max, h) => Math.max(max, h.best1RM), 0);
  document.getElementById('modal-1rm').innerHTML = latest1RM > 0
    ? `<span>Est. 1RM: <strong>${latest1RM}</strong> ${state.settings.unit}</span>${peak1RM > latest1RM ? `<span style="color:var(--text3);font-size:11px;margin-left:8px">Peak: ${peak1RM} ${state.settings.unit}</span>` : '<span style="color:var(--accent);font-size:11px;margin-left:8px">= All-time best</span>'}`
    : '<span>No data yet</span>';

  // 1RM progression chart
  const e1rmChart = document.getElementById('modal-1rm-chart');
  const e1rmData = history.filter(h => h.best1RM > 0).slice(-16);
  if (e1rmData.length >= 2) {
    e1rmChart.innerHTML = renderLineChart(
      e1rmData.map(h => formatDate(h.date)),
      e1rmData.map(h => h.best1RM),
      { color: 'var(--accent)', height: 130, showDots: true }
    );
  } else {
    e1rmChart.innerHTML = '<span class="chart-empty">Need 2+ sessions for 1RM trend</span>';
  }

  // RPE trend chart
  const rpeChart = document.getElementById('modal-rpe-chart');
  const rpeData = history.filter(h => h.avgRpe > 0).slice(-12);
  if (rpeData.length >= 2) {
    rpeChart.innerHTML = renderLineChart(
      rpeData.map(h => formatDate(h.date)),
      rpeData.map(h => Math.round(h.avgRpe * 10) / 10),
      { min: 5, max: 10, color: 'var(--orange)', height: 120 }
    );
  } else {
    rpeChart.innerHTML = '<span class="chart-empty">Need 2+ sessions for RPE trend</span>';
  }

  // History list
  const histList = document.getElementById('modal-history-list');
  const recentHistory = history.slice().reverse().slice(0, 20);
  if (recentHistory.length === 0) {
    histList.innerHTML = '<div class="empty-state">No history for this exercise</div>';
  } else {
    histList.innerHTML = recentHistory.map(h => `
      <div class="modal-history-row">
        <span class="mhr-date">${formatDate(h.date)}</span>
        <span class="mhr-data">${h.sets.map(s => `${convertWeight(s.weight, h.unit, state.settings.unit)}×${s.reps}`).join(', ')}</span>
        <span class="mhr-rpe">${h.avgRpe ? `RPE ${h.avgRpe.toFixed(1)}` : ''}</span>
      </div>
    `).join('');
  }

  // Load exercise notes
  const exerciseNotes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };
  document.getElementById('modal-ex-notes').value = (exerciseNotes.data && exerciseNotes.data[exId]) || '';

  // Save notes handler
  const saveBtn = document.getElementById('modal-save-notes');
  saveBtn.onclick = async () => {
    const notes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };
    if (!notes.data) notes.data = {};
    notes.data[exId] = document.getElementById('modal-ex-notes').value.trim();
    await smartPut('settings', notes);
    toast('Notes saved');
  };

  modal.classList.remove('hidden');
}

function closeExerciseModal() {
  document.getElementById('exercise-modal').classList.add('hidden');
}

// ==================== SVG CHART RENDERING ====================
function renderLineChart(labels, values, opts = {}) {
  const { min, max, color = 'var(--accent)', height = 150, showDots = true, tooltip = false, unit = '', extraSeries = [] } = opts;
  const width = 320;
  const pad = { top: 20, right: 15, bottom: 30, left: 40 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  if (values.length === 0) return '<span class="chart-empty">No data</span>';

  const dataMin = min !== undefined ? min : Math.min(...values) * 0.9;
  const dataMax = max !== undefined ? max : Math.max(...values) * 1.1;
  const range = dataMax - dataMin || 1;

  const points = values.map((v, i) => {
    const x = pad.left + (i / Math.max(values.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((v - dataMin) / range) * chartH;
    return { x, y, v };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Y-axis labels
  const ySteps = 4;
  let yLabels = '';
  for (let i = 0; i <= ySteps; i++) {
    const val = dataMin + (range * i / ySteps);
    const y = pad.top + chartH - (i / ySteps) * chartH;
    yLabels += `<text x="${pad.left - 6}" y="${y + 4}" fill="var(--text3)" font-size="10" text-anchor="end">${Math.round(val * 10) / 10}</text>`;
    yLabels += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3"/>`;
  }

  // X-axis labels (show max 6)
  let xLabels = '';
  const step = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((label, i) => {
    if (i % step === 0 || i === labels.length - 1) {
      const x = pad.left + (i / Math.max(labels.length - 1, 1)) * chartW;
      xLabels += `<text x="${x}" y="${height - 4}" fill="var(--text3)" font-size="9" text-anchor="middle">${label}</text>`;
    }
  });

  // Dots
  let dotsHTML = '';
  if (showDots) {
    dotsHTML = points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"/>`).join('');
  }

  // Gradient fill area
  const gradientId = 'grad-' + Math.random().toString(36).slice(2, 7);
  const areaD = pathD + ` L${points[points.length - 1].x.toFixed(1)},${pad.top + chartH} L${points[0].x.toFixed(1)},${pad.top + chartH} Z`;

  // Extra series (e.g., moving average overlay) drawn in same coord space.
  let extraPathsHTML = '';
  if (extraSeries && extraSeries.length) {
    for (const s of extraSeries) {
      if (!s.values || !s.values.length) continue;
      const sPts = s.values.map((v, i) => {
        const x = pad.left + (i / Math.max(s.values.length - 1, 1)) * chartW;
        const y = pad.top + chartH - ((v - dataMin) / range) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const dashAttr = s.dashed ? ' stroke-dasharray="4 3"' : '';
      const op = s.opacity != null ? s.opacity : 0.8;
      extraPathsHTML += `<path d="M${sPts.join(' L')}" fill="none" stroke="${s.color || 'var(--text2)'}" stroke-width="2" opacity="${op}"${dashAttr}/>`;
    }
  }

  // Tooltip layer (opt-in). Embeds points + labels for bindChartTooltip to consume.
  let tooltipAttrs = '';
  let tooltipLayer = '';
  if (tooltip) {
    const tooltipPoints = points.map((p, i) => {
      const tp = {
        x: +p.x.toFixed(1),
        y: +p.y.toFixed(1),
        label: labels[i],
        value: p.v
      };
      if (extraSeries && extraSeries.length) {
        tp.extras = extraSeries
          .filter(s => s.values && s.values[i] != null)
          .map(s => ({ label: s.label || '', value: s.values[i], color: s.color }));
      }
      return tp;
    });
    tooltipAttrs = ` data-tooltip="1" data-unit="${unit}" data-points='${JSON.stringify(tooltipPoints).replace(/'/g, '&#39;')}'`;
    tooltipLayer = `
      <g class="chart-tooltip hidden" pointer-events="none">
        <line class="ct-cross" x1="0" y1="${pad.top}" x2="0" y2="${pad.top + chartH}" stroke="var(--text3)" stroke-width="1" stroke-dasharray="3 2" opacity="0.5"/>
        <circle class="ct-dot" cx="0" cy="0" r="5" fill="${color}" stroke="var(--bg)" stroke-width="2"/>
        <rect class="ct-box" x="0" y="0" width="100" height="22" rx="4" fill="var(--bg)" stroke="var(--border)" stroke-width="1"/>
        <text class="ct-text" x="0" y="0" font-size="11" text-anchor="middle">
          <tspan class="ct-line ct-line-1" font-weight="600" fill="var(--text)"></tspan>
          <tspan class="ct-line ct-line-2" x="0" dy="14" font-weight="500"></tspan>
        </text>
      </g>
      <rect class="chart-hitbox" x="${pad.left}" y="${pad.top}" width="${chartW}" height="${chartH}" fill="transparent" pointer-events="all"/>
    `;
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"${tooltipAttrs}>
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${yLabels}
      ${xLabels}
      <path d="${areaD}" fill="url(#${gradientId})"/>
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dotsHTML}
      ${extraPathsHTML}
      ${tooltipLayer}
    </svg>
  `;
}

// Bind interactive tooltip to a chart SVG that was rendered with { tooltip: true }.
// Reads data-points/data-unit from the SVG and wires pointer events on the hitbox.
function bindChartTooltip(svgEl) {
  if (!svgEl || svgEl.dataset.tooltip !== '1') return;
  let points;
  try { points = JSON.parse(svgEl.dataset.points); } catch (e) { return; }
  if (!points || !points.length) return;
  const unit = svgEl.dataset.unit || '';
  const tipG = svgEl.querySelector('.chart-tooltip');
  const hitbox = svgEl.querySelector('.chart-hitbox');
  if (!tipG || !hitbox) return;
  const cross = tipG.querySelector('.ct-cross');
  const dot = tipG.querySelector('.ct-dot');
  const box = tipG.querySelector('.ct-box');
  const text = tipG.querySelector('.ct-text');
  const line1 = tipG.querySelector('.ct-line-1');
  const line2 = tipG.querySelector('.ct-line-2');

  const viewBox = svgEl.viewBox.baseVal;
  const vbW = viewBox.width || 320;

  const measure = (el, fallback) => {
    if (el && el.getComputedTextLength) {
      try { return el.getComputedTextLength(); } catch (e) {}
    }
    return fallback;
  };

  const showAt = (clientX) => {
    const rect = svgEl.getBoundingClientRect();
    const svgX = ((clientX - rect.left) / rect.width) * vbW;
    let nearest = points[0], minDist = Infinity;
    for (const p of points) {
      const d = Math.abs(p.x - svgX);
      if (d < minDist) { minDist = d; nearest = p; }
    }
    const lineA = `${nearest.label} — ${nearest.value} ${unit}`.trim();
    let lineB = '';
    let lineBColor = 'var(--text2)';
    if (nearest.extras && nearest.extras.length) {
      const ex = nearest.extras[0]; // primary extra (e.g., 7d avg)
      lineB = `${ex.label}: ${ex.value} ${unit}`.trim();
      if (ex.color) lineBColor = ex.color;
    }
    line1.textContent = lineA;
    line2.textContent = lineB;
    line2.setAttribute('fill', lineBColor);
    const hasLine2 = lineB.length > 0;

    const w1 = measure(line1, lineA.length * 6);
    const w2 = hasLine2 ? measure(line2, lineB.length * 6) : 0;
    const textW = Math.max(w1, w2);
    const boxW = Math.max(70, textW + 16);
    const boxH = hasLine2 ? 36 : 20;

    let bx = nearest.x - boxW / 2;
    if (bx < 2) bx = 2;
    if (bx + boxW > vbW - 2) bx = vbW - 2 - boxW;
    let by = nearest.y - boxH - 10;
    if (by < 2) by = nearest.y + 10; // flip below if no room above

    box.setAttribute('x', bx);
    box.setAttribute('y', by);
    box.setAttribute('width', boxW);
    box.setAttribute('height', boxH);
    const cx = bx + boxW / 2;
    text.setAttribute('x', cx);
    text.setAttribute('y', by + 13);
    if (line2) line2.setAttribute('x', cx);
    if (line2) line2.classList.toggle('hidden', !hasLine2);
    cross.setAttribute('x1', nearest.x);
    cross.setAttribute('x2', nearest.x);
    dot.setAttribute('cx', nearest.x);
    dot.setAttribute('cy', nearest.y);
    tipG.classList.remove('hidden');
  };
  const hide = () => { tipG.classList.add('hidden'); };

  hitbox.addEventListener('pointermove', (e) => { showAt(e.clientX); });
  hitbox.addEventListener('pointerdown', (e) => { showAt(e.clientX); });
  hitbox.addEventListener('pointerleave', hide);
  hitbox.addEventListener('pointercancel', hide);
}

// ==================== STATS MODULE ====================
//
// V-5 (auditoría 2026-09-09): STATS PINTA UN GRUPO, NO CUATRO.
//
// `renderStats()` ejecutaba los 22 renderers de las cuatro pestañas cada vez que se entraba en
// la vista — veintidós lecturas de IndexedDB y veintidós pintados para enseñar una pestaña.
// Ahora cada grupo es una tanda con nombre, se pinta el ACTIVO, y `switchStatsGroup` pinta el
// nuevo la primera vez que se enseña. `state._statsPainted` recuerda cuáles ya están; se vacía
// en `afterWorkoutSaved()`, que es el único momento en que TODOS los números cambian.
//
// El orden de terminación dentro de una tanda no importa: cada renderer escribe SU contenedor
// y el orden visual lo fija `index.html`.
const STATS_GROUPS = {
  now: [
    ['sync-warning', () => renderSyncWarning()],
    ['streaks', () => renderStreaks()],
    // V-10: UN bloque de recuperación (señales + rendimiento + detalle de WHOOP). Vive en
    // coach.js, de ahí `safeCall`. Antes eran tres llamadas a tres tarjetas distintas.
    ['recovery-block', () => safeCall('renderRecoveryBlock')],
    // v11.60: peso, 10k cómodo y fuerza mantenida, con su tamaño de muestra. Por `safeCall`
    // porque vive en coach.js. También se pinta en la vista Coach (`coach-goals-view`).
    ['goals-card', () => safeCall('renderGoalsCard')],
  ],
  week: [
    // v11.62: la carga de la semana se mudó de Home a Stats; V-10 la baja a su pestaña.
    ['hard-day-budget', () => renderHardDayBudget()],
    ['weekly-summary', () => renderWeeklySummary()],
    ['weekly-coach', () => loadAndRenderWeeklyCoach()],
    ['week-comparison', () => renderWeekComparison()],
    ['swimlane', () => renderSwimlaneTL()],
  ],
  body: [
    ['bodyweight-chart', () => renderBodyWeightChart()],
    // E-12 (v11.66): los pasos de intervals.icu tenían renderer y no tenían sitio. V-10 los
    // deja SÓLO aquí: estaban a la vez en Today y en Body, con dos formatos del mismo número.
    ['steps-card', () => renderStepsCard()],
    ['steps-history', () => renderStepsHistoryChart()],
    ['withings-comp', () => renderWithingsComposition()],
    ['bodycomp', () => renderBodyCompEstimator()],
    ['protein-chart', () => renderProteinChart()],
    ['streak-calendar', () => renderStreakCalendar()],
    ['macro-calculator', () => { renderMacroCalculator(); return null; }],
  ],
  strength: [
    ['muscle-volume', () => renderMuscleVolume()],
    ['strength-chart', () => renderStrengthChart()],
    ['volume-chart', () => renderVolumeChart()],
  ],
};

const STATS_DEFAULT_GROUP = 'now';

/** El grupo visible ahora mismo, o el de por defecto si aún no hay ninguno. */
function _activeStatsGroup() {
  const el = document.querySelector('#view-stats .view-scroll > [data-group].active-group');
  return (el && el.dataset.group) || STATS_DEFAULT_GROUP;
}

/** Sólo el DOM: qué pestaña está activa y qué bloques se ven. No pinta nada. */
function _showStatsGroup(group) {
  document.querySelectorAll('#stats-tabs .stats-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.statsGroup === group);
  });
  document.querySelectorAll('#view-stats .view-scroll > [data-group]').forEach(el => {
    el.classList.toggle('active-group', el.dataset.group === group);
  });
  const scroll = document.querySelector('#view-stats .view-scroll');
  if (scroll) scroll.scrollTop = 0;
}

function switchStatsGroup(group) {
  _showStatsGroup(group);
  // V-5: la primera vez que se enseña un grupo hay que pintarlo. Las siguientes no: el
  // contenido sigue en el DOM y sólo lo invalida un entreno guardado.
  if (!state._statsPainted.has(group)) {
    renderStatsGroup(group).catch(e => console.warn(`[Stats] ${group}:`, e));
  }
}

/** Una tanda con `allSettled`: el renderer que falla deja SU hueco y se anota; los demás pintan. */
async function renderStatsGroup(group) {
  const tareas = STATS_GROUPS[group];
  if (!tareas) return;
  state._statsPainted.add(group);
  showStatsSkeletons(group);
  beginRenderPass();
  try {
    const res = await Promise.allSettled(tareas.map(([, fn]) => fn()));
    res.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`[Stats] ${group}/${tareas[i][0]}:`, r.reason);
    });
  } finally {
    endRenderPass();
  }
}

async function renderStats() {
  // Ensure a stats group is active (default: now). Se usa `_showStatsGroup` y no
  // `switchStatsGroup` porque el pintado lo hace la línea de abajo: con el atajo, entrar en
  // Stats por primera vez lanzaba DOS pases sobre el mismo grupo, a la vez.
  const anyActive = document.querySelector('#view-stats .view-scroll > [data-group].active-group');
  if (!anyActive) _showStatsGroup(STATS_DEFAULT_GROUP);
  await renderStatsGroup(_activeStatsGroup());
}

async function renderStreaks() {
  const container = document.getElementById('streak-row');
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date));
  const runs = (await getRunsDeduped()).sort((a, b) => b.date.localeCompare(a.date));
  const nutrition = (await dbGetAll('nutrition')).sort((a, b) => b.date.localeCompare(a.date));

  // Gym streak: consecutive completed weeks with >= 4 training days (Mon-Sun ISO weeks,
  // bucketed by actual workout date - NOT by the saved w.week field, which can be stale for
  // retroactively-logged sessions).
  //
  // C-10: aquí había una `isoWeekKey` LOCAL que SOMBREABA al global del motor — misma firma,
  // otra aritmética (hora local, fórmula del 1-ene). Quien leía esta función creía estar
  // llamando a la del motor. Ahora se llama al global de verdad, con la fecha como cadena.
  const weekDays = {}; // weekKey -> Set of distinct date strings (workout days)
  workouts.forEach(w => {
    if (!w.date) return;
    const key = isoWeekKey(w.date);
    if (!weekDays[key]) weekDays[key] = new Set();
    weekDays[key].add(w.date);
  });
  const currentKey = isoWeekKey(today());
  // Walk back from this week. Skip current (in progress). Count consecutive
  // completed weeks with ≥ 4 distinct training days.
  let gymStreak = 0;
  const sortedKeys = Object.keys(weekDays).sort().reverse();
  let started = false;
  for (const key of sortedKeys) {
    if (key === currentKey) continue; // current week may not be done
    const days = weekDays[key].size;
    if (days >= 4) {
      gymStreak++;
      started = true;
    } else if (started) {
      break; // streak broken
    } else {
      break;
    }
  }

  // Protein streak: consecutive days hitting target
  let proteinStreak = 0;
  const todayD = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const ds = dateStr(d);
    const entry = nutrition.find(n => n.date === ds);
    if (entry && entry.protein >= state.settings.proteinTarget) {
      proteinStreak++;
    } else if (i > 0) {
      break; // allow today to be missing
    }
  }

  // Total sessions
  const totalSessions = workouts.length + runs.length;

  container.innerHTML = `
    <div class="streak-card">
      <div class="streak-num">${gymStreak}</div>
      <div class="streak-label">Weeks ≥ 4 days</div>
    </div>
    <div class="streak-card">
      <div class="streak-num">${proteinStreak}</div>
      <div class="streak-label">Protein Days</div>
    </div>
    <div class="streak-card">
      <div class="streak-num">${totalSessions}</div>
      <div class="streak-label">All-time sessions</div>
    </div>
  `;
}

/// ==================== RESUMEN DEL COACH EN STATS (v11.61) ====================
//
// LO QUE SUSTITUYE. Hasta v11.60 esta tarjeta hacía un `fetch` al manifiesto JSON que publicaba
// el cron del domingo bajo `tracking/weekly-reviews/`, y pintaba su prosa entera en Stats. Ese
// cron está desprogramado: la revisión semanal la hace ahora la edge function
// `coach-weekly-review` desde dentro de la app y la fuente de verdad es el store
// `coach_reviews`. La función que leía ese manifiesto se BORRÓ, y con ella el fetch: mantener
// una lectura de un artefacto que ya nadie escribe sólo garantiza que un día la tarjeta muestre
// la revisión de agosto como si fuera la de esta semana.
//
// Y AQUÍ SE QUEDA EN DOS LÍNEAS. La revisión completa (briefing, propuesta con diff, decisiones,
// versiones) vive en la vista Coach, a la que se llega desde Home y desde aquí. Repetir el mismo
// contenido en dos pantallas es cómo se acaba con dos renderers que discrepan.
async function loadAndRenderWeeklyCoach() {
  const card = document.getElementById('weekly-coach-card');
  if (!card) return;
  try {
    let review = null;
    try {
      const rows = await dbGetAll('coach_reviews');
      const ts = (r) => (r.updatedAt ? Date.parse(r.updatedAt) || 0 : 0) || Number(r.createdAt || 0) || 0;
      review = (rows || []).filter(r => r && r.id).sort((a, b) =>
        String(b.weekKey || '').localeCompare(String(a.weekKey || ''))
        || (Number(b.attempt || 0) - Number(a.attempt || 0))
        || (ts(b) - ts(a)))[0] || null;
    } catch (e) { review = null; }

    // Fallback LEGACY, sólo lectura: las filas que el cron dejó en `weekly_reviews`. El store no
    // se borra (§B.9) y sigue teniendo valor histórico, pero ya no se escribe ni se sincroniza.
    let legacy = null;
    if (!review) {
      try {
        const all = await dbGetAll('weekly_reviews');
        legacy = (all || []).slice().sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0))[0] || null;
      } catch (e) { legacy = null; }
    }

    if (!review && !legacy) {
      card.classList.remove('hidden');
      card.innerHTML = `
        <div class="wcc-header">
          <span class="wcc-week">Coach</span>
          <span class="wcc-source">weekly</span>
        </div>
        <div class="wcc-empty">
          <p>No review yet.</p>
          <p class="muted">The coach reviews the week the first time you open the app each Monday. It needs at least one week of data.</p>
        </div>`;
      return;
    }

    const ESTADO = (typeof COACH_STATUS_LABEL !== 'undefined' && COACH_STATUS_LABEL) || {};
    const wk = (review && review.weekKey) || (legacy && legacy.weekKey) || '';
    const estado = review ? (ESTADO[review.status] || review.status || '') : 'old review';
    const primeraLinea = (md) => String(md || '').split('\n').map(l => l.replace(/^[#*\-\s]+/, '').trim()).find(l => l) || '—';
    // V-4 (auditoría 2026-09-08): el `focus` de la semana SALE de aquí.
    //
    // Estaba en tres sitios: la tarjeta de Home, la vista Coach y este teaser de Stats. La
    // misma frase escrita por el modelo, palabra por palabra, en tres pantallas de una app de
    // un solo usuario. El teaser no es donde se lee el foco (para eso está Home, que es la
    // primera pantalla) ni donde se razona (para eso está la vista Coach): es un enlace con
    // estado. Así que se queda con lo único que sólo él dice —qué semana y cómo va la
    // revisión— y el foco vive en DOS sitios, no en tres. Las revisiones del cron retirado
    // (`weekly_reviews`) mantienen su prosa, que no es `focus` y no duplica nada.
    const linea = (review && review.status === 'running')
      ? 'The coach is reviewing the week…'
      : (legacy
        ? primeraLinea((legacy.coachVoice && legacy.coachVoice.lastWeek) || legacy.observed)
        : (review ? 'Open Coach for the focus of the week and the session table.' : 'No review this week.'));

    card.classList.remove('hidden');
    card.innerHTML = `
      <div class="wcc-header">
        <span class="wcc-week">${escapeHtml(String(wk))}</span>
        <span class="wcc-source">${escapeHtml(String(estado))}</span>
      </div>
      <div class="wcc-summary">${escapeHtml(String(linea).slice(0, 220))}</div>
      <button id="btn-open-coach-stats" class="btn-secondary btn-full" style="margin-top:10px;text-align:center">Open Coach</button>`;
    const b = document.getElementById('btn-open-coach-stats');
    if (b && typeof openCoachView === 'function') b.addEventListener('click', openCoachView);
  } catch (e) {
    console.warn('[Coach] resumen en Stats:', e);
    card.classList.add('hidden');
    card.innerHTML = '';
  }
}

// ==================== STRAVA SETTINGS UI ====================
//
// A-7 (2026-09-10). Strava se fue ENTERA al servidor: `strava.js` son cinco envoltorios sobre
// `integrations.js` y el estado sale de `integration_status`, no de `localStorage`. Esta tarjeta
// legacy sobrevive porque conectar/sincronizar desde dos sitios distintos no molesta, pero la
// superficie buena es la de Integraciones: aquí ya no se lee ni una marca de tiempo local
// (`strava_last_sync` era del cliente que hacía el volcado; ahora lo hace el cron).
function renderStravaUI() {
  const container = document.getElementById('strava-section');
  if (!container) return;
  if (typeof window.stravaIsConnected !== 'function') {
    container.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Strava not loaded</p>';
    return;
  }
  const row = (typeof integrationsStatusOf === 'function') ? integrationsStatusOf('strava') : null;
  if (window.stravaNeedsReconnect && window.stravaNeedsReconnect()) {
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--red)">Strava session expired</label>
      </div>
      <p class="muted" style="font-size:11px;margin:4px 0 8px">Reconnect to resume pulling runs from your COROS PACE 4 (via Strava).</p>
      <button id="btn-strava-reconnect" class="btn-secondary btn-full" style="border-color:var(--red);color:var(--red)">Reconnect Strava</button>
    `;
    document.getElementById('btn-strava-reconnect').addEventListener('click', () => { stravaConnect(); });
    return;
  }
  if (window.stravaIsConnected()) {
    const lastSyncStr = (row && row.last_sync_at) ? new Date(row.last_sync_at).toLocaleString() : 'Never';
    container.innerHTML = `
      <div class="form-row inline">
        <label style="font-size:13px;color:var(--accent)">Strava Connected</label>
        <button id="btn-strava-disconnect" class="btn-secondary" style="width:auto;padding:8px 16px">Disconnect</button>
      </div>
      <p class="muted" style="font-size:11px;margin:6px 0 8px">Last server sync: ${escapeHtml(lastSyncStr)}</p>
      <button id="btn-strava-sync" class="btn-secondary btn-full">Sync Now</button>
      <p class="muted" style="font-size:11px;margin-top:6px">The server pulls your activities (auto-synced from COROS) every day. This is the shortcut.</p>
    `;
    document.getElementById('btn-strava-disconnect').addEventListener('click', async () => {
      // `integrationsDisconnect` ya pide confirmación, repinta la tarjeta de Integraciones y
      // avisa: aquí no se duplica ni el confirm ni el toast.
      await stravaDisconnect();
      renderStravaUI();
    });
    document.getElementById('btn-strava-sync').addEventListener('click', async () => {
      const btn = document.getElementById('btn-strava-sync');
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      const result = await stravaSync();
      if (result) {
        const n = Number(result.runs || 0) + Number(result.sessions || 0);
        if (typeof toast === 'function') toast(`Synced ${n} activit${n === 1 ? 'y' : 'ies'}`);
        renderStravaUI();
        renderRecentWorkouts();
      } else {
        if (typeof toast === 'function') toast(`Strava sync failed: ${errText(safeCall('stravaLastError'), 'check the connection')}`);
        btn.textContent = 'Sync Now';
        btn.disabled = false;
      }
    });
  } else {
    container.innerHTML = `
      <button id="btn-strava-connect" class="btn-secondary btn-full" style="border-color:var(--brand-strava);color:var(--brand-strava)">Connect Strava</button>
      <p class="muted" style="font-size:11px;margin-top:6px">Pulls runs from your COROS PACE 4 via Strava (already auto-syncing). One-time OAuth, tokens stay on the server.</p>
    `;
    document.getElementById('btn-strava-connect').addEventListener('click', () => { stravaConnect(); });
  }
}

// ==================== LA CREDENCIAL DE INTERVALS.ICU ====================
//
// UN SOLO CAMINO DE GUARDADO, para los dos formularios que la piden (esta tarjeta Sync y la fila
// de intervals.icu en la tarjeta de Integraciones). Dos caminos acabarían con una clave en el
// servidor y otra en el dispositivo, y el síntoma sería "el cron no trae nada" una semana
// después de haberla cambiado en el sitio equivocado.
//
// El guardado tiene DOS MITADES, y las dos hacen falta hoy (A-7):
//   1. **Servidor** (`intervals-sync {action:'set_key'}`): valida la clave contra intervals.icu
//      ANTES de guardarla y la deja en `integration_tokens` (sólo service role). Es lo que hace
//      que el cron diario, `push_events` y `athlete` funcionen sin abrir la app.
//   2. **Dispositivo** (`setIntervalsApiKey`, C-8 → `localStorage`, NUNCA la fila sincronizada):
//      es lo que sigue alimentando el import de cliente, que es la vía viva de `wellness`,
//      `steps`, `bodyweight` y la mayoría de `runs`.
//
// PUNTO DE RETIRADA. Cuando el import de servidor lleve dos semanas escribiendo los cinco stores
// sin huecos, se borra la mitad 2 de aquí, el accesor `intervalsApiKey()`/`setIntervalsApiKey()`,
// `intervalsIcuSync()` y `intervalsFetchWellness()` (whoop.js), y esta función se queda sólo con
// la llamada al servidor. Hasta entonces la clave está en el dispositivo A PROPÓSITO — pero
// fuera de la fila sincronizada y fuera del backup exportable, que es lo que C-8 pedía.
//
// El id de atleta NO es secreto (es `i12345`): sigue en `state.settings`, sincronizado, porque
// las URLs del import de cliente lo necesitan.
async function saveIntervalsCredentials(apiKey, athleteId) {
  const clave = String(apiKey == null ? '' : apiKey).trim();
  const atleta = String(athleteId == null ? '' : athleteId).trim();
  if (!clave) return { ok: false, error: 'Paste the API key first' };

  // Mitad servidor primero: valida contra intervals.icu, así que un fallo aquí significa que la
  // clave no sirve y no hay por qué escribirla en el dispositivo.
  let srv = { ok: false, status: 'offline' };
  if (typeof integrationsSetIntervalsKey === 'function') {
    srv = await integrationsSetIntervalsKey(clave, atleta);
  }
  const resuelto = (srv && srv.ok && srv.athleteId) ? String(srv.athleteId) : atleta;

  // Mitad dispositivo. Se hace también cuando el servidor no contesta (`offline`): sin red, el
  // import de cliente es lo único que hay, y bloquear el guardado por eso dejaría la app sin
  // datos hasta que vuelva la cobertura.
  const sinServidor = !!(srv && srv.status === 'offline');
  const guardable = !!(srv && srv.ok) || sinServidor;
  if (guardable) {
    state.settings = state.settings || {};
    if (resuelto) state.settings.intervalsIcuAthleteId = resuelto;
    setIntervalsApiKey(clave);
    await saveSettings();
  }
  return {
    ok: guardable,
    serverOk: !!(srv && srv.ok),
    athleteId: resuelto,
    keyHint: (srv && srv.keyHint) || '',
    code: (srv && srv.code) || null,
    error: (srv && !srv.ok && !sinServidor) ? (srv.error || 'The server rejected the key') : null,
  };
}

// ==================== UNIFIED SYNC CARD (v10.28) ====================
// Replaces the four legacy cards (WHOOP / Strava / intervals.icu / Steps Shortcut).
// One status surface for the user, one place to edit credentials.
function _maskApiKey(k) {
  if (!k || k.length < 8) return '••••';
  return '••••••••' + k.slice(-6);
}

let _syncCardEditMode = false;

// A-7: `{status, athleteId, keyHint, lastError}` de la credencial que hay EN EL SERVIDOR. En
// memoria: la tarjeta se repinta a menudo y esto es una llamada a una edge function, no un
// `getItem`. `null` = todavía no se ha preguntado, o no hay credencial de servidor.
let _syncServerInfo = null;
// Y si ya se preguntó. Sin esta bandera, un servidor SIN credencial deja `_syncServerInfo` en
// null para siempre y la tarjeta invoca la edge function en cada repintado.
let _syncServerAsked = false;

async function renderSyncCard() {
  const container = document.getElementById('sync-section');
  if (!container) return;

  const apiKey = intervalsApiKey();
  const athleteId = (state.settings && state.settings.intervalsIcuAthleteId) || '';
  const configured = !!(apiKey && athleteId);
  const lastRuns = localStorage.getItem('intervalsicu_last_sync') || null;
  const lastRunsDate = lastRuns ? new Date(parseInt(lastRuns)).toLocaleString() : 'Never';

  // `{action:'status'}` en el render: es la ÚNICA vía para saber si el servidor tiene la clave y
  // CUÁL (el indicio `••••1234`). `integration_status` dice si está activa, pero no el indicio:
  // eso es dato del token y el token no sale de `integration_tokens`.
  if (typeof integrationsIntervalsStatus === 'function' && !_syncServerInfo && !_syncServerAsked) {
    _syncServerAsked = true;
    try {
      const info = await integrationsIntervalsStatus();
      if (info && info.ok !== false && info.status && info.status !== 'disconnected') _syncServerInfo = info;
      // Sin sesión todavía no cuenta como "preguntado": el estado llegará cuando haya sesión.
      if (info && info.status === 'offline') _syncServerAsked = false;
    } catch (e) { /* la tarjeta se pinta igual: el import de cliente no depende de esto */ }
  }
  const srvActiva = !!(_syncServerInfo && _syncServerInfo.status === 'active');

  if (!configured || _syncCardEditMode) {
    // Setup / edit mode
    container.innerHTML = `
      <div class="form-row inline" style="margin-bottom:8px">
        <label style="font-size:13px;color:var(--accent)">${configured ? 'Edit credentials' : 'Connect intervals.icu'}</label>
      </div>
      <p class="muted" style="font-size:11px;margin-top:0;margin-bottom:12px">
        ${configured ? '' : 'One connection covers everything — wellness (recovery, HRV, RHR, sleep), runs (COROS), training load (CTL/ATL), body weight, steps, and macros. '}
        Get your API key at <a href="https://intervals.icu/settings" target="_blank" style="color:var(--accent)">intervals.icu/settings</a> → API.
      </p>
      <div class="form-row"><label style="font-size:13px">Athlete ID</label><input type="text" id="sync-athlete" class="text-input" placeholder="i12345" value="${escapeHtml(athleteId)}"></div>
      <div style="height:8px"></div>
      <div class="form-row"><label style="font-size:13px">API key</label><input type="password" id="sync-apikey" class="text-input" placeholder="paste API key" value="${escapeHtml(apiKey)}"></div>
      <div style="height:12px"></div>
      <div style="display:flex;gap:8px">
        <button id="sync-save" class="btn-primary" style="flex:1">Save</button>
        ${configured ? `<button id="sync-cancel" class="btn-secondary" style="flex:1">Cancel</button>` : ''}
      </div>
      <p class="muted" style="font-size:11px;margin-top:10px">The key is uploaded to the server so the daily sync and the COROS push keep working when the app is closed. It is never sent back and never leaves in a backup.</p>
    `;
    document.getElementById('sync-save').onclick = async () => {
      const btn = document.getElementById('sync-save');
      const newAthlete = (document.getElementById('sync-athlete').value || '').trim();
      const newKey = (document.getElementById('sync-apikey').value || '').trim();
      if (!newAthlete || !newKey) { toast('Both fields required'); return; }
      btn.disabled = true;
      btn.textContent = 'Saving…';
      // A-7: un solo camino de guardado (dispositivo + servidor). Ver `saveIntervalsCredentials`.
      const r = await saveIntervalsCredentials(newKey, newAthlete);
      if (!r || !r.ok) {
        btn.disabled = false;
        btn.textContent = 'Save';
        toast(errText(r && r.error, 'The key could not be saved'));
        return;
      }
      _syncCardEditMode = false;
      _syncServerInfo = r.serverOk
        ? { status: 'active', athleteId: r.athleteId, keyHint: r.keyHint, lastError: null }
        : null;
      _syncServerAsked = r.serverOk;   // sin servidor, la próxima tarjeta vuelve a preguntar
      toast(r.serverOk ? `Saved on the server (${r.keyHint || '••••'}) — syncing now…` : 'Saved on this device — syncing now…');
      await renderSyncCard();
      // Trigger an immediate full sync
      await runFullSync({ silent: false });
    };
    if (configured) {
      document.getElementById('sync-cancel').onclick = () => {
        _syncCardEditMode = false;
        renderSyncCard();
      };
    }
    return;
  }

  // Connected status view
  const wellnessRowCount = await dbGetAll('wellness').then(r => r.length).catch(() => 0);
  const runRowCount = await dbGetAll('runs').then(r => r.length).catch(() => 0);
  const sessRowCount = await dbGetAll('sessions').then(r => r.length).catch(() => 0);

  // v11.36: show what the last import actually kept and DROPPED. Silently discarding
  // every non-Run activity is what hid this for months.
  const imp = await dbGet('settings', 'lastImportSummary').then(r => r && r.data).catch(() => null);
  let importLine = '';
  if (imp) {
    const keptStr = Object.entries(imp.kept || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing';
    const skipStr = Object.entries(imp.skipped || {}).map(([k, v]) => `${k} ${v}`).join(', ');
    importLine = `Last import (${escapeHtml(imp.window || '')}): ${escapeHtml(String(imp.total || 0))} activities → imported: ${escapeHtml(keptStr)}`
      + (skipStr ? `<br><span style="color:var(--text2)">Skipped: ${escapeHtml(skipStr)}</span>` : '')
      + '<br>';
  }

  container.innerHTML = `
    <div class="form-row inline" style="margin-bottom:6px">
      <label style="font-size:13px;color:var(--accent)">intervals.icu ✓ Connected</label>
      <button id="sync-edit" class="btn-secondary" style="width:auto;padding:6px 12px;font-size:11px">Edit</button>
    </div>
    <div class="muted" style="font-size:11px;margin-bottom:10px">
      Athlete <code>${escapeHtml(athleteId)}</code> · Key ${escapeHtml(_maskApiKey(apiKey))}
    </div>
    <div class="muted" style="font-size:11px;margin-bottom:10px;line-height:1.6">
      Server credential: ${srvActiva
        ? `<span style="color:var(--accent)">stored</span> · key ${escapeHtml(_syncServerInfo.keyHint || '••••')}${_syncServerInfo.athleteId ? ` · athlete <code>${escapeHtml(String(_syncServerInfo.athleteId))}</code>` : ''}`
        : `<span style="color:var(--yellow)">not stored</span> — the daily sync and the COROS push need it. Tap Edit and save the key again.`}
      ${(_syncServerInfo && _syncServerInfo.lastError) ? `<br><span style="color:var(--red)">${escapeHtml(String(_syncServerInfo.lastError).slice(0, 160))}</span>` : ''}
    </div>
    <div class="muted" style="font-size:11px;margin-bottom:12px;line-height:1.6">
      Syncing: <strong>wellness</strong> (recovery, HRV, RHR, sleep, SpO2) · <strong>training load</strong> (CTL/ATL/Form) · <strong>body</strong> (weight, steps) · <strong>nutrition</strong> (kcal + macros) · <strong>activities</strong> (all cardio: running, treadmill, bike, row, ski, elliptical, walking, swimming)<br>
      Local cache: ${wellnessRowCount} wellness rows · ${runRowCount} runs · ${sessRowCount} cardio sessions<br>
      ${importLine}Last runs sync: ${escapeHtml(lastRunsDate)}
    </div>
    <button id="sync-now" class="btn-primary btn-full">Sync now</button>
    <button id="sync-from-server" class="btn-secondary btn-full" style="margin-top:8px"${srvActiva ? '' : ' disabled'}>Sync from the server</button>
    <p class="muted" style="font-size:11px;margin-top:6px">"Sync now" imports from this device. "Sync from the server" asks the server to import and then pulls the rows down — the same path the daily job uses.</p>
  `;
  document.getElementById('sync-edit').onclick = () => {
    _syncCardEditMode = true;
    renderSyncCard();
  };
  // A-7: el camino de SERVIDOR, a demanda. Existe para poder ejercitarlo desde el teléfono sin
  // esperar al cron de las 12:30 UTC, que es lo único que lo ejecuta hoy. El import de cliente
  // ("Sync now") sigue siendo el que manda mientras el de servidor no lleve dos semanas limpio.
  const srvBtn = document.getElementById('sync-from-server');
  if (srvBtn) srvBtn.onclick = async () => {
    srvBtn.textContent = 'Syncing…';
    srvBtn.disabled = true;
    try {
      const r = (typeof integrationsSync === 'function')
        ? await integrationsSync('intervals', { days: 7 })
        : { ok: false, status: 'error', error: 'Integrations not loaded' };
      if (r && r.ok) {
        const n = Array.isArray(r.dates) ? r.dates.length : null;
        toast(n != null ? `Server synced ${n} day${n === 1 ? '' : 's'}` : 'Server synced');
        await safeCall('renderRecoveryBlock');
        if (typeof renderRecentWorkouts === 'function') renderRecentWorkouts();
      } else if (r && r.status === 'needs_reconnect') {
        toast('The server key was rejected — save it again');
      } else {
        toast(errText(r && r.error, 'The server sync failed'));
      }
      // El indicio y el último error pueden haber cambiado: se vuelve a preguntar una vez.
      _syncServerInfo = null;
      _syncServerAsked = false;
      await renderSyncCard();
    } finally {
      const b = document.getElementById('sync-from-server');
      if (b) { b.textContent = 'Sync from the server'; b.disabled = false; }
    }
  };
  document.getElementById('sync-now').onclick = async () => {
    const btn = document.getElementById('sync-now');
    btn.textContent = 'Syncing…';
    btn.disabled = true;
    try {
      await runFullSync({ silent: false });
      await renderSyncCard();
      // Refresh visible cards
      // V-10: un solo bloque de recuperación (señales + rendimiento + WHOOP).
      await safeCall('renderRecoveryBlock');
      if (typeof renderRecentWorkouts === 'function') renderRecentWorkouts();
    } finally {
      const b = document.getElementById('sync-now');
      if (b) { b.textContent = 'Sync now'; b.disabled = false; }
    }
  };
}

// One-shot sync of everything intervals.icu provides. Called from init() and
// from the unified Sync card "Sync now" button.
async function runFullSync({ silent = true } = {}) {
  let runsResult = null;
  let wellnessResult = null;
  try {
    runsResult = await intervalsIcuSync();
  } catch (e) { console.warn('[sync] runs failed:', e); }
  try {
    // Se salta la caché de 10 min a propósito: "Sync now" tiene que volver a pedirle el dato de
    // hoy al servidor sin esperar a la ventana de reintento (§B.2.b). A-3: la caché vive en
    // memoria dentro de whoop.js, ya no en localStorage.
    if (typeof whoopResetCache === 'function') whoopResetCache();
    if (typeof whoopSyncData === 'function') {
      wellnessResult = await whoopSyncData();
      invalidateReadiness();   // v11.59: puede haber llegado el dato de hoy
    }
  } catch (e) { console.warn('[sync] wellness failed:', e); }

  if (!silent) {
    const parts = [];
    if (runsResult && runsResult.pulled != null) parts.push(`${runsResult.pulled} run${runsResult.pulled === 1 ? '' : 's'}`);
    if (wellnessResult) parts.push(`${(wellnessResult.recovery || []).length} wellness`);
    if (typeof toast === 'function') {
      toast(parts.length ? `Synced: ${parts.join(', ')}` : 'Sync ran (no new data)');
    }
  }
  return { runsResult, wellnessResult };
}

// ==================== INTERVALS.ICU SETTINGS UI (legacy) ====================
function renderIntervalsIcuUI() {
  const apiInput = document.getElementById('setting-intervals-api-key');
  const athInput = document.getElementById('setting-intervals-athlete');
  const saveBtn = document.getElementById('btn-save-intervals');
  if (!apiInput || !athInput || !saveBtn) return;
  apiInput.value = intervalsApiKey();
  athInput.value = (state.settings && state.settings.intervalsIcuAthleteId) || '';
  saveBtn.onclick = async () => {
    // A-7: el MISMO camino que la tarjeta Sync (dispositivo + servidor). Este formulario está
    // oculto y es legacy, pero un tercer camino de guardado sería un tercer sitio donde la clave
    // del servidor puede quedarse vieja.
    const r = await saveIntervalsCredentials(apiInput.value, athInput.value);
    if (typeof toast === 'function') {
      toast((r && r.ok)
        ? (r.serverOk ? 'intervals.icu config saved on the server' : 'intervals.icu config saved on this device')
        : errText(r && r.error, 'The key could not be saved'));
    }
    if (!r || !r.ok) return;
    // Pull HR zones now so cardio prescriptions get real bpm ranges (best-effort).
    fetchIntervalsIcuZones().catch(() => {});
    // Rerender the coach card so the "Push to COROS" button toggles based on key presence.
    if (typeof loadAndRenderWeeklyCoach === 'function') loadAndRenderWeeklyCoach();
  };
  const syncBtn = document.getElementById('btn-intervals-sync-now');
  if (syncBtn) {
    syncBtn.onclick = async () => {
      syncBtn.textContent = 'Syncing...';
      syncBtn.disabled = true;
      try {
        const result = await intervalsIcuSync();
        if (result) {
          if (typeof toast === 'function') toast(`Pulled ${result.pulled} run${result.pulled === 1 ? '' : 's'}`);
          renderRecentWorkouts();
        } else {
          if (typeof toast === 'function') toast(`Sync failed: ${errText(intervalsLastError(), 'check the API key / athlete ID')}`);
        }
      } finally {
        syncBtn.textContent = 'Sync runs now';
        syncBtn.disabled = false;
      }
    };
  }
}

// ==================== PULL ACTIVITIES ← intervals.icu ← COROS ====================
// Client-side sync: pulls Run activities from intervals.icu (which auto-syncs
// from COROS PACE 4) and upserts them to the local runs store. smartPut also
// enqueues for Supabase cloud sync. No Edge Function needed — Basic auth with
// the user's personal API key.
function _formatPaceFromSec(secondsPerKm) {
  if (!isFinite(secondsPerKm) || secondsPerKm <= 0) return '';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Activity type → app cardio modality. intervals.icu and Strava use the same type
// names (both originate from Strava), so ONE map serves both import paths.
//
// Until v11.36 both paths filtered to `type === 'Run'` and silently dropped everything
// else, so every bike / row / ski / walk session Whoop and Strava recorded was invisible
// to the app. That contradicted the system's own premise — CLAUDE.md calls cardio a
// co-equal quality across run/row/bike/ski/treadmill, and CARDIO_LIBRARY can push bike and
// row workouts to the COROS that the app could then never see you complete. It also left
// the hard-day budget, weekly volume and adherence blind to a whole block of training.
// See assessments/2026-08-16_system-audit.md.
const CARDIO_TYPE_MAP = {
  Run: 'run_outdoor', TrailRun: 'run_outdoor',
  VirtualRun: 'treadmill', Treadmill: 'treadmill',
  Ride: 'bike', VirtualRide: 'bike', GravelRide: 'bike', MountainBikeRide: 'bike', EBikeRide: 'bike', Handcycle: 'bike',
  Rowing: 'row', VirtualRow: 'row', Kayaking: 'row', Canoeing: 'row',
  // VirtualSki es el tipo que intervals.icu creó para el SkiErg de Concept2 (anuncio del
  // 2025-10-10: "RowErg -> Virtual Row, SkiErg -> Virtual Ski, a newly added activity type").
  // FALTABA en v11.36 —el mapa se escribió antes de conocer la integración— así que cada sesión
  // de SkiErg se descartaba en silencio. VirtualRow y VirtualRide (BikeErg) ya estaban por suerte.
  NordicSki: 'ski', BackcountrySki: 'ski', RollerSki: 'ski', AlpineSki: 'ski', VirtualSki: 'ski',
  Elliptical: 'elliptical', StairStepper: 'elliptical',
  Swim: 'swim',
};

const RUN_MODALITIES = new Set(['run_outdoor', 'treadmill']);

// El lookup NORMALIZA la clave: intervals.icu muestra "Virtual Ski" con espacio en la interfaz
// mientras la API devuelve `VirtualSki`, y no quiero que un espacio o un guion bajo nos cueste otra
// ronda de sesiones descartadas en silencio. "Virtual Ski", "VirtualSki", "virtual_ski" y
// "VIRTUAL-SKI" resuelven todas igual.
const _CARDIO_TYPE_MAP_NORM = Object.fromEntries(
  Object.entries(CARDIO_TYPE_MAP).map(([k, v]) => [k.toLowerCase().replace(/[\s_-]/g, ''), v])
);

function _activityModality(a) {
  const raw = String((a && (a.type || a.sport)) || '');
  if (!raw) return null;
  return CARDIO_TYPE_MAP[raw] || _CARDIO_TYPE_MAP_NORM[raw.toLowerCase().replace(/[\s_-]/g, '')] || null;
}

// Walks are recovery, not a cardio dose — consistent with logCardio().
function _modalityFamily(modality) {
  return modality === 'walk' ? 'recovery' : 'cardio';
}

// C-28: la razón del último fallo, para que el toast diga algo. `intervalsIcuSync()` sigue
// devolviendo `null` en el fallo (sus llamadores comprueban truthiness); lo que cambia es que
// la causa ya no muere en la consola.
let _intervalsLastError = null;
function intervalsLastError() { return _intervalsLastError; }

// ┌─ PUNTO DE RETIRADA · A-7 (2026-09-10) ─────────────────────────────────────────────────────┐
// │ ESTA FUNCIÓN ES EL IMPORT DE CLIENTE de intervals.icu, y sigue viva a propósito. El         │
// │ servidor ya sabe hacer lo mismo (`intervals-sync`, cron `intervals-sync-daily` a las 12:30  │
// │ UTC, más el botón "Sync from the server" de Ajustes), pero ESTE camino es lo que alimenta   │
// │ HOY `wellness`, `steps`, `bodyweight` y la mayoría de `runs`. Apostar el pipeline vivo a un │
// │ import de servidor sin verificar, la víspera del cierre semanal, no es un cambio que valga  │
// │ lo que arriesga.                                                                            │
// │                                                                                             │
// │ QUÉ SE BORRA CUANDO SE RETIRE, y no antes de que el camino de servidor lleve DOS SEMANAS    │
// │ escribiendo los cinco stores sin huecos (comparar `wellness`/`steps`/`runs` día a día):     │
// │   · esta función y `backfillCardioFromIntervals()`,                                         │
// │   · `intervalsFetchWellness()` en whoop.js (y con ella el guard de precedencia con WHOOP),  │
// │   · la mitad "dispositivo" de `saveIntervalsCredentials()`, `intervalsApiKey()` /           │
// │     `setIntervalsApiKey()` y su entrada en `LOCAL_ONLY_KEYS` / `BACKUP_REDACT_KEYS`,        │
// │   · el camino directo de `_icuUpsertEvents()` y de `fetchIntervalsIcuZones()`,              │
// │   · `runFullSync()` pasa a ser `integrationsSync('intervals')` + `whoopSyncData()`.         │
// │ Lo que NO se borra: `CARDIO_TYPE_MAP` (lo usa el import del servidor, espejado en           │
// │ `_shared/cardio-types.ts` y vigilado por `verify-strava-steps-fns`).                        │
// └─────────────────────────────────────────────────────────────────────────────────────────────┘
async function intervalsIcuSync(opts = {}) {
  const apiKey = intervalsApiKey();
  const athleteId = state.settings && state.settings.intervalsIcuAthleteId;
  if (!apiKey || !athleteId) { _intervalsLastError = 'no API key or athlete ID'; return null; }
  _intervalsLastError = null;

  // Sync window: 30 days back default, or since last sync minus 1 day for overlap.
  // opts.oldest/opts.newest override it (used by the one-shot backfill).
  const lastSync = parseInt(localStorage.getItem('intervalsicu_last_sync') || '0');
  const sinceMs = lastSync ? lastSync - 86400000 : Date.now() - 30 * 86400000;
  const oldest = opts.oldest || dateStr(new Date(sinceMs));
  const newest = opts.newest || dateStr(new Date());
  const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);
  const url = `https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}/activities?oldest=${oldest}&newest=${newest}`;

  try {
    const res = await fetchWithTimeout(url, { headers: { Authorization: auth } });
    if (!res.ok) {
      console.warn('[intervals.icu] activities fetch failed:', res.status);
      _intervalsLastError = `HTTP ${res.status}`;
      return null;
    }
    const activities = await res.json();

    // D1 (v11.9) — one-time key logger: surface the FULL set of activity keys
    // intervals.icu actually returns in production, so we wire the confirmed
    // intensity/zone/decoupling field names (no assumptions). Review the console
    // once, then adjust the field mappings below if the real names differ.
    // Mirrors the wellness key-logger in whoop.js.
    if (!intervalsIcuSync._keyLogDone && Array.isArray(activities) && activities.length) {
      const seen = new Set();
      activities.forEach(a => Object.keys(a || {}).forEach(k => seen.add(k)));
      console.info('[intervals.icu] available activity keys (D1 review):', [...seen].sort());
      intervalsIcuSync._keyLogDone = true;
    }

    // v11.36: import EVERY cardio modality, not just runs. Runs keep going to `runs`
    // (that store owns distance/pace/GAP and the run history reads from it); everything
    // else goes to `sessions`, the T1 envelope built for exactly this.
    let pulled = 0, pulledSessions = 0;
    const skipped = {};   // type -> count, so a discard is never silent again
    const kept = {};      // modality -> count
    // Null-safe numeric coercion for the additive D1 fields.
    const num = (v) => (v != null && isFinite(Number(v))) ? Number(v) : null;

    for (const a of (activities || [])) {
      const rawType = String((a && (a.type || a.sport)) || 'unknown');
      const modality = _activityModality(a);
      if (!modality) { skipped[rawType] = (skipped[rawType] || 0) + 1; continue; }

      const stravaOrIcuId = a.id || a.external_id || `${a.start_date_local}_${a.distance}`;
      const recordId = `icu_${stravaOrIcuId}`;
      const startLocal = String(a.start_date_local || a.start_date || '');
      const date = startLocal.split('T')[0];
      if (!date) { skipped['no date'] = (skipped['no date'] || 0) + 1; continue; }
      const distanceKm = Number(a.distance || 0) / 1000;
      const movingSec = Number(a.moving_time || a.elapsed_time || 0);
      const durationMin = Math.round(movingSec / 60);
      const paceSecPerKm = distanceKm > 0 ? movingSec / distanceKm : 0;
      const gapSec = num(a.gap);
      kept[modality] = (kept[modality] || 0) + 1;

      // --- Non-run cardio → `sessions` (unified T1 envelope) ---
      if (!RUN_MODALITIES.has(modality)) {
        const family = _modalityFamily(modality);
        const subtype = family === 'recovery' ? 'walk' : _subtypeFromIntensity(a.icu_intensity);
        const meta = (typeof sessionSubtypeMeta === 'function' && sessionSubtypeMeta(family, subtype)) || {};
        await smartPut('sessions', {
          id: recordId, date, ts: Date.parse(startLocal) || Date.now(),
          family, subtype, sessionType: `${family}.${subtype}`,
          modality, title: String(a.name || `${modality} ${subtype}`),
          durationMin: durationMin || null,
          distance: distanceKm > 0 ? Math.round(distanceKm * 100) / 100 : null,
          avgHR: a.average_heartrate ? Math.round(Number(a.average_heartrate)) : null,
          maxHR: a.max_heartrate ? Math.round(Number(a.max_heartrate)) : null,
          tempC: num(a.average_temp),      // F-26: el calor de la sesión, no el mes
          perceivedEffort: null,
          evidenceTags: meta.evidenceTags || [],
          budgetWeight: meta.budgetWeight != null ? meta.budgetWeight : 0.5,
          trainingLoad: num(a.icu_training_load),
          intensityLabel: (typeof a.icu_intensity === 'string' && a.icu_intensity) ? a.icu_intensity : null,
          // The subtype is INFERRED when intervals.icu gives no intensity label — flagged
          // so nothing downstream treats a guessed zone as a measured one (GEN-002).
          subtypeInferred: !a.icu_intensity,
          sport: rawType,
          notes: '', source: 'intervals.icu', source_id: String(stravaOrIcuId),
          week: getWeekNumber(), _updated_at: Date.now(),
        });
        pulledSessions++;
        continue;
      }

      const run = {
        id: recordId,
        date,
        distance: Math.round(distanceKm * 100) / 100,
        duration: durationMin,
        avgHR: a.average_heartrate ? Math.round(Number(a.average_heartrate)) : null,
        maxHR: a.max_heartrate ? Math.round(Number(a.max_heartrate)) : null,
        avgPace: _formatPaceFromSec(paceSecPerKm),
        feel: null,
        notes: String(a.name || ''),
        source: 'intervals.icu',
        source_id: String(stravaOrIcuId),
        // --- D1 data unlock (v11.9): additive, null-safe. Feed the future cardio
        // & hard-day-budget engines. Field names are best-effort vs the intervals.icu
        // activities API — verify against the one-time key log above and adjust.
        sport: String(a.type || a.sport || 'Run'),
        intensityLabel: (typeof a.icu_intensity === 'string' && a.icu_intensity) ? a.icu_intensity : null,
        trainingLoad: num(a.icu_training_load),
        decoupling: num(a.decoupling),                 // % aerobic decoupling, pre-computed by intervals.icu (if present)
        efficiencyFactor: num(a.icu_efficiency),
        hrZoneTimes: Array.isArray(a.icu_hr_zone_times) ? a.icu_hr_zone_times
                   : (Array.isArray(a.icu_zone_times) ? a.icu_zone_times : null),
        gapPace: gapSec ? _formatPaceFromSec(gapSec) : null,  // grade-adjusted pace
        // F-26 (auditoría 2026-09-09): la TEMPERATURA de la sesión. ENV-001 dice que en calor
        // se mantiene la FC objetivo y el ritmo cae, y el guardarraíl que lo vigila
        // (`SUMMER-PACE`) decidía por el MES — junio-septiembre son "verano" y ya. En Madrid un
        // rodaje a las 21:00 de septiembre a 19 °C y otro a las 14:00 de junio a 36 °C recibían
        // la misma advertencia, que es tanto como no tenerla. Ésta es la granularidad correcta:
        // el calor DE LA CARRERA, no la media del día.
        tempC: num(a.average_temp),
        _updated_at: Date.now(),
      };
      await smartPut('runs', run);
      pulled++;
    }

    // v11.56: la importación puede traer el cardio de ayer; la progresión lee "días sin cardio".
    if (pulled + pulledSessions > 0) { state._lastCardioDate = null; state._runningWeek = null; }
    // v11.59: y puede traer wellness nuevo, que mueve las tendencias de 7d/28d del readiness.
    invalidateReadiness();

    if (!opts.skipCursor) localStorage.setItem('intervalsicu_last_sync', String(Date.now()));

    // Diagnostics. A silent discard is what let this go unnoticed for months; now every
    // sync says what came in and what was dropped, by type.
    const summary = {
      window: `${oldest} → ${newest}`,
      total: (activities || []).length,
      runs: pulled, sessions: pulledSessions,
      kept, skipped,
    };
    console.info('[intervals.icu] import:', summary);
    try {
      // smartPut, no dbPut: v11.36 lo guardaba solo en el teléfono, así que el diagnóstico de qué
      // se descartaba no se podía revisar en remoto — justo la información que hacía falta para
      // encontrar el fallo de `VirtualSki`. Ahora sube.
      await smartPut('settings', { key: 'lastImportSummary', data: { ...summary, at: Date.now() } });
    } catch (_) {}

    try { await validateRunDedup(); } catch (_) { /* validation log only */ }
    try { await fetchIntervalsIcuZones(); } catch (_) { /* zones are best-effort */ }

    // Push what we just imported NOW. smartPut only ENQUEUES, and syncAll() runs ~500 ms
    // after init while this pull is fired without await — so anything imported afterwards
    // used to sit in the queue until the next app open.
    if ((pulled + pulledSessions) > 0 && typeof window.drainSyncQueue === 'function') {
      try { await window.drainSyncQueue(); } catch (_) {}
    }

    return { pulled, pulledSessions, total: (activities || []).length, kept, skipped };
  } catch (e) {
    console.warn('[intervals.icu] sync error:', e);
    _intervalsLastError = (e && e.message) || 'network error';
    return null;
  }
}

// One-shot backfill: every cardio modality since the program started. The normal sync
// window is only [lastSync-1d, today], so months of bike/row/ski/walk sessions were never
// imported and can't be recovered by it. Monthly windows keep each response small;
// idempotent because every record is keyed by `icu_{id}`.
const CARDIO_BACKFILL_FROM = '2026-04-01';

// VERSIONADO desde v11.40, y por una razón concreta: en v11.36 el marcador era un booleano, así que
// el backfill se ejecutó UNA vez — antes de que existiera el mapeo de `VirtualSki` (v11.39). Como la
// ventana de sync normal solo mira de ayer a hoy, todo el histórico de SkiErg habría quedado fuera
// para siempre. Subir esta constante fuerza una nueva pasada.
//   1 = v11.36 (primer backfill; sin VirtualSki)
//   2 = v11.40 (con VirtualSki + lookup normalizado)
// Súbela cada vez que cambie CARDIO_TYPE_MAP o el rutado de actividades.
const CARDIO_BACKFILL_REV = 2;

async function backfillCardioFromIntervals({ force = false } = {}) {
  const flag = (await dbGet('settings', 'cardioBackfillDone').catch(() => null));
  const doneRev = (flag && flag.data && flag.data.rev) || (flag && flag.data ? 1 : 0);
  if (doneRev >= CARDIO_BACKFILL_REV && !force) return null;
  if (!(intervalsApiKey() && state.settings && state.settings.intervalsIcuAthleteId)) return null;

  const totals = { runs: 0, sessions: 0, total: 0, kept: {}, skipped: {}, windows: 0 };
  const end = new Date();
  let cursor = new Date(CARDIO_BACKFILL_FROM + 'T00:00:00');

  while (cursor <= end) {
    const winStart = new Date(cursor);
    const winEnd = new Date(cursor);
    winEnd.setMonth(winEnd.getMonth() + 1);
    if (winEnd > end) winEnd.setTime(end.getTime());
    const r = await intervalsIcuSync({
      oldest: dateStr(winStart), newest: dateStr(winEnd), skipCursor: true,
    });
    if (r) {
      totals.runs += r.pulled || 0;
      totals.sessions += r.pulledSessions || 0;
      totals.total += r.total || 0;
      totals.windows++;
      for (const [k, v] of Object.entries(r.kept || {})) totals.kept[k] = (totals.kept[k] || 0) + v;
      for (const [k, v] of Object.entries(r.skipped || {})) totals.skipped[k] = (totals.skipped[k] || 0) + v;
    }
    cursor.setMonth(cursor.getMonth() + 1);
  }

  console.info('[backfill] cardio desde', CARDIO_BACKFILL_FROM, totals);
  // smartPut (no dbPut): el resultado del backfill debe SUBIR, para poder verificar en remoto qué
  // recuperó y qué descartó sin pedir capturas de pantalla.
  await smartPut('settings', { key: 'cardioBackfillDone', data: { at: Date.now(), rev: CARDIO_BACKFILL_REV, from: CARDIO_BACKFILL_FROM, ...totals } });
  if (typeof toast === 'function' && (totals.runs + totals.sessions) > 0) {
    toast(`Recovered ${totals.sessions} cardio sessions`);
  }
  return totals;
}

// ==================== INTERVALS.ICU HR ZONES (T5.2) ====================
// Pull the athlete's HR zones (the same ones synced to his COROS) so cardio
// prescriptions show real bpm ranges. Cached in settings.icuZones (synced).
// Defensive: intervals.icu's athlete/sportSettings shape varies, so we try the
// native zone bounds first, then derive from LTHR, then from max HR.
async function fetchIntervalsIcuZones() {
  // A-7: el ALGORITMO no se toca (tres caminos y una heurística probados); lo único que cambia
  // es de dónde salen los campos crudos. Con credencial en el servidor se piden por
  // `intervals-sync {action:'athlete'}`, que devuelve exactamente `{lthr, maxHr, hrZones,
  // sportSettings:[{types,lthr,max_hr,hr_zones}]}` — una forma RECORTADA del atleta, sin nombre
  // ni correo. Sin credencial de servidor, el camino directo de siempre.
  //
  // La respuesta del servidor se re-mapea a los nombres crudos de la API (`icu_lthr`,
  // `icu_max_hr`, `icu_hr_zones`) para que la heurística de abajo sea LA MISMA función en los
  // dos caminos: dos derivaciones de zonas serían dos juegos de bpm en la misma pantalla.
  let a = null;
  const srvKey = (typeof integrationsIntervalsHasServerKey === 'function') && integrationsIntervalsHasServerKey();
  if (srvKey && typeof integrationsIntervalsAthlete === 'function') {
    const srv = await integrationsIntervalsAthlete();
    if (srv) {
      a = {
        icu_lthr: srv.lthr, icu_max_hr: srv.maxHr, icu_hr_zones: srv.hrZones,
        sportSettings: Array.isArray(srv.sportSettings) ? srv.sportSettings : [],
      };
    }
  }
  if (!a) {
    const apiKey = intervalsApiKey();
    const athleteId = state.settings && state.settings.intervalsIcuAthleteId;
    if (!apiKey || !athleteId) return null;
    const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);
    const res = await fetchWithTimeout(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}`, { headers: { Authorization: auth } });
    if (!res.ok) { console.warn('[intervals.icu] athlete fetch failed:', res.status); return null; }
    a = await res.json();
  }
  const settings = Array.isArray(a.sportSettings) ? a.sportSettings : [];
  // Prefer the Run profile, else the first, else the athlete top-level fields.
  const sp = settings.find(s => Array.isArray(s.types) && s.types.some(t => /run/i.test(t))) || settings[0] || {};
  const lthr = Number(sp.lthr || a.icu_lthr || a.lthr) || null;
  const maxHr = Number(sp.max_hr || a.icu_max_hr || a.max_hr) || null;
  const rawZones = Array.isArray(sp.hr_zones) ? sp.hr_zones.map(Number).filter(n => isFinite(n))
                 : (Array.isArray(a.icu_hr_zones) ? a.icu_hr_zones.map(Number).filter(n => isFinite(n)) : []);

  const z = {};
  // Are rawZones absolute bpm, or percentages of LTHR? A %-of-LTHR array like
  // [68,83,94,105] sits entirely inside a naive 60..230 "bpm" window, so also require
  // a top bound that is genuinely bpm-sized and consistent with maxHr when we know it.
  const top = rawZones[rawZones.length - 1];
  const bpmLooking = rawZones.length >= 4
    && rawZones.every((n, i) => n > 60 && n < 230 && (i === 0 || n > rawZones[i - 1]))
    && top > 120
    && (!maxHr || (top >= maxHr * 0.7 && top <= maxHr * 1.1));
  if (bpmLooking) {
    // Absolute bpm upper bounds [Z1max, Z2max, Z3max, Z4max, (Z5max)]
    const ceiling = maxHr || (top + 10);
    z.zone1 = [Math.round((maxHr || rawZones[0] * 1.6) * 0.45), rawZones[0]];
    z.zone2 = [rawZones[0] + 1, rawZones[1]];
    z.zone3 = [rawZones[1] + 1, rawZones[2]];
    z.threshold = [rawZones[2] + 1, rawZones[3]];
    z.intervals = [rawZones[3] + 1, rawZones[4] || ceiling];
  } else if (lthr) {
    const r = (lo, hi) => [Math.round(lthr * lo), Math.round(lthr * hi)];
    z.zone1 = r(0.55, 0.75);
    z.zone2 = r(0.75, 0.88); z.zone3 = r(0.88, 0.95); z.threshold = r(0.95, 1.02); z.intervals = r(1.02, 1.10);
  } else if (maxHr) {
    const r = (lo, hi) => [Math.round(maxHr * lo), Math.round(maxHr * hi)];
    z.zone1 = r(0.45, 0.60);
    z.zone2 = r(0.60, 0.72); z.zone3 = r(0.72, 0.82); z.threshold = r(0.82, 0.90); z.intervals = r(0.90, 1.00);
  } else {
    return null; // nothing usable
  }
  z.long_easy = z.zone2;
  z.recovery = z.zone1;
  state.settings.icuZones = { lthr, maxHr, z, updatedAt: Date.now() };
  await smartPut('settings', { key: 'userSettings', data: state.settings });
  console.log('[intervals.icu] HR zones cached', state.settings.icuZones);
  return state.settings.icuZones;
}

// Return a bpm-range string for a cardio subtype from cached zones, or null.
function cardioHrTarget(subtype) {
  const zc = state.settings && state.settings.icuZones;
  if (!zc || !zc.z) return null;
  const key = (subtype === 'long_easy') ? 'zone2' : (subtype || 'zone2');
  const r = zc.z[key] || zc.z.zone2;
  return (r && r.length === 2) ? `${r[0]}-${r[1]} bpm` : null;
}

// Inverse of cardioHrTarget: which zone (z1..z5) does an absolute bpm fall in?
// Used to translate a legacy raw-bpm target into a zone label, since the
// intervals.icu DSL has no absolute-bpm syntax. Defaults to z2 without zones.
function _zoneForBpm(bpm) {
  const n = Number(bpm);
  const zc = state.settings && state.settings.icuZones;
  if (!isFinite(n) || !zc || !zc.z) return 'z2';
  const bands = [['z1', zc.z.zone1], ['z2', zc.z.zone2], ['z3', zc.z.zone3], ['z4', zc.z.threshold], ['z5', zc.z.intervals]];
  const usable = bands.filter(([, r]) => r && r.length === 2);
  if (!usable.length) return 'z2';
  for (const [z, r] of usable) if (n >= r[0] && n <= r[1]) return z;
  if (n < usable[0][1][0]) return usable[0][0];              // below the lowest band
  return usable[usable.length - 1][0];                       // above the highest band
}

// ==================== D1 DATA UNLOCK HELPERS (v11.9) ====================
// Pure, additive utilities for the data-foundation layer. NO programming logic,
// NO generator changes — extraction, dedup and availability flags only.

// Two runs are the SAME Coros activity (arriving via both Strava and intervals.icu)
// if same date + sport + distance within 0.3 km + duration within 3 min.
function _runsAreSameActivity(a, b) {
  if (!a || !b) return false;
  if ((a.date || '') !== (b.date || '')) return false;
  const sa = String(a.sport || 'Run').toLowerCase();
  const sb = String(b.sport || 'Run').toLowerCase();
  if (sa !== sb) return false;
  const distOk = Math.abs(Number(a.distance || 0) - Number(b.distance || 0)) <= 0.3;
  const durOk = Math.abs(Number(a.duration || 0) - Number(b.duration || 0)) <= 3;
  return distOk && durOk;
}

// Returns a deduped copy. Canonical preference: intervals.icu > strava > manual.
// Never mutates the store; manual runs (no source match) are always kept.
function dedupeRuns(runs) {
  const sourceRank = { 'intervals.icu': 3, 'strava': 2 };
  const rank = (r) => sourceRank[r && r.source] || 1; // manual/unknown = 1 (kept)
  const kept = [];
  for (const r of (runs || [])) {
    const dupIdx = kept.findIndex(k => _runsAreSameActivity(k, r));
    if (dupIdx === -1) { kept.push(r); continue; }
    if (rank(r) > rank(kept[dupIdx])) {
      const loser = kept[dupIdx];
      if (r.feel == null && loser.feel != null) r.feel = loser.feel; // keep manual feel
      kept[dupIdx] = r;
    }
  }
  return kept;
}

// Deduped accessor — use for VOLUME/aggregation reads so one Coros run isn't
// counted twice. Export/backup must stay raw (dbGetAll) to avoid data loss.
async function getRunsDeduped() {
  return dedupeRuns(await dbGetAll('runs'));
}

// v11.36: the same activity can arrive twice — via Strava (`strava_{id}`) and via
// intervals.icu (`icu_{id}`) — with different ids, so id-based dedup never catches it.
// Match on (date + modality + duration ±2 min) and prefer intervals.icu as canonical,
// the same rule dedupeRuns already applies to runs.
function _sessionsAreSameActivity(a, b) {
  if (!a || !b) return false;
  if (a.date !== b.date) return false;
  if ((a.modality || '') !== (b.modality || '')) return false;
  const da = Number(a.durationMin), db = Number(b.durationMin);
  if (!isFinite(da) || !isFinite(db)) return false;
  return Math.abs(da - db) <= 2;
}

function dedupeSessions(sessions) {
  const rank = (s) => ({ 'intervals.icu': 3, 'strava': 2 })[s && s.source] || 1; // manual = 1
  const kept = [];
  for (const s of (sessions || [])) {
    const i = kept.findIndex(k => _sessionsAreSameActivity(k, s));
    if (i === -1) { kept.push(s); continue; }
    if (rank(s) > rank(kept[i])) {
      // Keep a manually-entered perceived effort — the import can't supply it.
      if (s.perceivedEffort == null && kept[i].perceivedEffort != null) s.perceivedEffort = kept[i].perceivedEffort;
      kept[i] = s;
    }
  }
  return kept;
}

async function getSessionsDeduped() {
  return dedupeSessions(await dbGetAll('sessions').catch(() => []));
}

// Non-destructive validation: counts duplicate run pairs against real data, so we
// VERIFY the double-count problem before any aggregation rewiring. Logs the result.
async function validateRunDedup() {
  const raw = await dbGetAll('runs');
  const deduped = dedupeRuns(raw);
  const out = { raw: raw.length, deduped: deduped.length, duplicatesRemoved: raw.length - deduped.length };
  console.info('[D1 dedup] run dedup check:', out);
  return out;
}

// Per-field availability flags for the FUTURE Readiness / Hard-Day-Budget engines.
// Pure inspection of what is present/fresh — computes NO score or dose.
// Statuses: available · missing · stale · noisy(quality) · derived · manual.
async function dataAvailability() {
  const todayMs = Date.parse(dateStr(new Date()) + 'T12:00:00');
  const daysAgo = (d) => {
    const t = Date.parse((d || '') + 'T12:00:00');
    return isFinite(t) ? Math.round((todayMs - t) / 86400000) : Infinity;
  };
  const latest = (arr, key) => {
    let best = null;
    for (const r of (arr || [])) {
      if (r && r[key] != null && (!best || (r.date || '') > (best.date || ''))) best = r;
    }
    return best;
  };
  const [wellness, weights, runsRaw, workouts] = await Promise.all([
    dbGetAll('wellness').catch(() => []),
    dbGetAll('bodyweight').catch(() => []),
    dbGetAll('runs').catch(() => []),
    dbGetAll('workouts').catch(() => []),
  ]);
  const flag = (rec, staleDays, extra) => {
    if (!rec) return Object.assign({ status: 'missing' }, extra || {});
    const age = daysAgo(rec.date);
    return Object.assign({ status: age > staleDays ? 'stale' : 'available', ageDays: age, date: rec.date }, extra || {});
  };
  const measuredWeights = (weights || []).filter(w => w && w.measured);
  return {
    sleepHrs:      flag(latest(wellness, 'sleepSecs'), 2, { source: 'intervals.icu' }),
    rhr:           flag(latest(wellness, 'restingHR'), 2, { source: 'intervals.icu', note: 'use 7d trend' }),
    hrv:           flag(latest(wellness, 'hrv'), 2, { source: 'intervals.icu', quality: 'noisy', note: 'sleep HRV not morning RMSSD; 7d trend' }),
    recovery:      flag(latest(wellness, 'readiness'), 2, { source: 'intervals.icu', note: 'flag only, not a dose' }),
    ctl:           flag(latest(wellness, 'ctl'), 3, { source: 'intervals.icu', derived: true }),
    atl:           flag(latest(wellness, 'atl'), 3, { source: 'intervals.icu', derived: true }),
    bodyweight:    measuredWeights.length ? flag(latest(measuredWeights, 'weight'), 4, { source: 'manual/intervals', note: 'measured:true only; 7d avg' }) : { status: 'missing', note: 'no measured weigh-in; forward-fills ignored' },
    bodyFat:       flag(latest(wellness, 'bodyFat'), 10, { source: 'intervals.icu (Wyze)', quality: 'noisy', note: 'trend only, never a decision' }),
    runs:          (runsRaw && runsRaw.length) ? { status: 'available', count: runsRaw.length, note: 'dedupe via getRunsDeduped()' } : { status: 'missing' },
    decoupling:    latest(runsRaw, 'decoupling') ? { status: 'available', source: 'intervals.icu', quality: 'noisy', note: 'heuristic; confirm field via key log' } : { status: 'missing', note: 'not yet returned/parsed — see key log' },
    hrZoneTimes:   latest(runsRaw, 'hrZoneTimes') ? { status: 'available', source: 'intervals.icu', note: 'depends on correct zone setup' } : { status: 'missing', note: 'not yet returned/parsed — see key log' },
    workouts:      (workouts && workouts.length) ? { status: 'available', count: workouts.length, note: 'RPE present; RIR & soreness NOT captured' } : { status: 'missing' },
    soreness:      { status: 'missing', note: 'subjective check-in not yet implemented (D1 design)' },
    pain:          { status: 'missing', note: 'subjective check-in not yet implemented (D1 design)' },
    subjReadiness: { status: 'missing', note: 'subjective check-in not yet implemented (D1 design)' },
  };
}

// ==================== PUSH RUNNING PLAN → intervals.icu → COROS ====================
// intervals.icu DSL syntax (verified empirically + per their docs):
//   - Each step starts with `- ` (hyphen + space)
//   - Duration first: `5km`, `30m`, `5m30s`, `1h`
//   - Target AFTER duration, with the **zone/range first** then the **modality**:
//       HR zone:        `Z2 HR`        (zone N + literal "HR")
//       HR absolute:    `125-140 HR`   (low-high range)
//       HR % max:       `70-75% HR`
//       HR % LTHR:      `90-95% LTHR`
//       Pace zone:      `Z2 Pace`
//       Pace absolute:  `7:15-7:00/km Pace` (slower first, faster second)
//   - Order matters: `Z2 HR` works, `HR Z2` parses as power_zone (wrong).
//   - Sections (warmup / main / cooldown) are optional headers above steps.
//   - Repeats: `Main Set Nx` header above the repeated steps.
function _generateIntervalsIcuDsl(run) {
  // 1) Free-form intervals string overrides the simple template — assumed to
  //    be already in valid intervals.icu DSL.
  if (run.intervals) return String(run.intervals);

  // 2) Build a structured single-step workout from the run's targets.
  const lines = [];
  const dur = run.distance_km ? `${run.distance_km}km` : (run.duration_min ? `${run.duration_min}m` : '5km');

  // Decide target token in priority: explicit pace range > pace zone > HR zone > HR max
  let target = '';
  if (run.target_pace_min_per_km && run.target_pace_min_per_km_fast) {
    // slower first, faster second per intervals.icu docs
    target = `${run.target_pace_min_per_km}-${run.target_pace_min_per_km_fast}/km Pace`;
  } else if (run.type === 'Z2' || run.type === 'easy') {
    target = 'Z2 HR';
  } else if (run.type === 'tempo') {
    target = 'Z3 HR';
  } else if (run.type === 'threshold') {
    target = 'Z4 HR';
  } else if (run.type === 'intervals' || run.type === 'vo2') {
    target = 'Z5 HR';
  } else if (run.target_hr_max) {
    // A raw bpm cap can't be sent as-is (intervals.icu has no absolute-bpm syntax —
    // see _icuZoneToken), so resolve it to the zone that contains it.
    target = _icuZoneToken(_zoneForBpm(run.target_hr_max));
  }

  lines.push(`- ${dur}${target ? ' ' + target : ''}`);
  return lines.join('\n');
}

// A-7: ¿se puede EMPUJAR a intervals.icu? Con credencial local (el camino directo) o con
// credencial en el servidor (`push_events`). Una sola definición para los cuatro sitios que lo
// preguntaban por separado: cuando el punto de retirada llegue y la clave local desaparezca, es
// esta función la que cambia, no cuatro condiciones idénticas repartidas por el fichero.
function _icuCanPush() {
  if (intervalsApiKey() && state.settings && state.settings.intervalsIcuAthleteId) return true;
  return (typeof integrationsIntervalsHasServerKey === 'function') && integrationsIntervalsHasServerKey();
}

// Upsert planned events on the intervals.icu calendar.
//
// Uses the BULK endpoint with upsert=true. The plain POST /events does NOT match on
// external_id, so before v11.33 every re-push created a DUPLICATE event and the COROS
// received several workouts for the same day. Per the API guide: "Events that do not
// exist will be created. Those that already exist are updated. The external_id is only
// matched against events created by your application."
//
// A-7 (2026-09-10). El EMPUJE pasa por el servidor cuando hay credencial guardada
// (`intervals-sync {action:'push_events'}`), y cae al camino directo cuando no la hay. Lo que NO
// cambia es quién ARMA los eventos: `pushRunningPlanToIntervalsIcu` y `pushCardioToIntervalsIcu`
// siguen construyéndolos aquí, con el plan activo, el cardio del coach, la regla de fase y el
// DSL verbatim. Reconstruir eso en el servidor sería una segunda implementación de la semana de
// carrera — exactamente el fallo de L-1 (dos contadores de volumen). El servidor sólo valida la
// forma y pone la credencial; el `external_id` sigue empezando por `pwa-`, que es lo que acota
// qué eventos puede tocar (uno ajeno pisaría algo creado a mano en intervals.icu).
async function _icuUpsertEvents(events) {
  const srvKey = (typeof integrationsIntervalsHasServerKey === 'function') && integrationsIntervalsHasServerKey();
  if (srvKey && typeof integrationsPushIntervalsEvents === 'function') {
    const r = await integrationsPushIntervalsEvents(events);
    if (r && r.ok) return r;
    // Un rechazo del servidor NO se reintenta en directo: si la clave del servidor está mal, la
    // del dispositivo suele ser la misma, y un doble intento duplicaría el ruido sin arreglar
    // nada. Se dice qué pasó y el llamador lo pinta.
    throw new Error((r && r.error) ? String(r.error) : 'The server rejected the push');
  }
  const apiKey = intervalsApiKey();
  const athleteId = state.settings && state.settings.intervalsIcuAthleteId;
  if (!apiKey || !athleteId) throw new Error('intervals.icu no configurado');
  const auth = 'Basic ' + btoa(`API_KEY:${apiKey}`);
  const res = await fetchWithTimeout(`https://intervals.icu/api/v1/athlete/${encodeURIComponent(athleteId)}/events/bulk?upsert=true`, {
    method: 'POST',
    headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(events),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text().catch(() => '')}`.trim());
  return res;
}

// Subtipo del plan v2 → el `type` que entiende `_generateIntervalsIcuDsl` (que a su vez lo
// traduce a un token de zona; intervals.icu no admite bpm absolutos, ver `_icuZoneToken`).
const _ICU_RUN_TYPE_BY_SUBTYPE = {
  zone2: 'Z2', long_easy: 'Z2', recovery: 'Z2', zone3: 'tempo',
  threshold: 'threshold', intervals: 'intervals',
};

// El lunes de una semana ISO ('2026-W37' → '2026-09-07'), en UTC como toda la aritmética de
// semanas del proyecto (el incidente de tz ya se pagó una vez). Es la INVERSA de `isoWeekKey`:
// se parte del 4 de enero, que por definición cae en la semana 1, y se suman semanas.
// `verify-coach-wiring.mjs` comprueba el ida y vuelta contra `isoWeekKey`.
function _mondayOfWeekKey(weekKey) {
  const m = String(weekKey || '').match(/^(\d{4})-W(\d{2})$/);
  if (!m) return null;
  const jan4 = Date.UTC(Number(m[1]), 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7;         // domingo = 7, no 0
  const week1Monday = jan4 - (dow - 1) * 86400000;
  const d = new Date(week1Monday + (Number(m[2]) - 1) * 7 * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Empuja la semana de carrera a intervals.icu → COROS.
 *
 * F-17 (auditoría 2026-09-09). LA FUENTE ESTABA MAL. Leía `activePlan.running.plan[]`, un array
 * de slots que NINGÚN plan del coach escribe (el esquema v2 devuelve `running` como tres números
 * —`weeklyKmTarget`, `longRunKm`, `hardSessions`— y el reparto por días vive en
 * `weekTemplate[dow].cardio`), así que en la práctica el botón caía SIEMPRE al fallback: el store
 * `weekly_reviews` del cron retirado. Es decir, el reloj recibía la semana de un sistema que ya no
 * existe, o nada.
 *
 * Ahora la fuente es la misma que pinta la pantalla, y en el mismo orden: **coach > regla > base**.
 *   · `_coachCardioSlot(dow)` — lo que el coach escribió para ese día, si sigue vigente (E-4).
 *   · `suggestRunningWeekCached` — la fase de la regla (run/walk, km, DSL) para los días que el
 *     coach no tocó. Es lo que el usuario ve en la tarjeta del día: mandar otra cosa al reloj
 *     sería que la pantalla y el COROS se contradijeran.
 *   · el slot de la plantilla — duración y subtipo de la semilla.
 * El fallback a `weekly_reviews` se va: no queda nada que lo escriba.
 *
 * Las fechas salen del lunes del `weekKey` del plan (los slots llevan `dow`, no fecha: un plan
 * aprobado el martes sigue siendo válido el jueves).
 */
async function pushRunningPlanToIntervalsIcu() {
  if (!_icuCanPush()) {
    if (typeof toast === 'function') toast('Set up intervals.icu in Settings first');
    return;
  }

  const weekKey = (activePlan && activePlan.weekKey)
    || (typeof isoWeekKey === 'function' ? isoWeekKey(today()) : null);
  const monday = _mondayOfWeekKey(weekKey);
  const tpl = (activePlan && activePlan.weekTemplate) || activeWeekTemplate || {};

  // La semana de la regla, una vez para los siete días (tiene caché propia, pero pedirla aquí
  // deja claro que es UNA fuente, no una por día).
  let rw = null;
  try { rw = await suggestRunningWeekCached(new Date()); } catch (e) { console.warn('[intervals.icu] rule week:', e); }

  const plan = [];
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const slot = tpl[dow] || {};
    const cc = _coachCardioSlot(dow);
    // Sólo los días de cardio y los que el coach convirtió en uno. El finisher Z2 de un día de
    // fuerza tiene su propio botón en la tarjeta del día (`rx-push-z2`): mandarlo también aquí
    // duplicaría el evento en el calendario del reloj.
    if (!cc && slot.type !== 'run') continue;
    const st = (cc && cc.subtype) || slot.subtype || 'zone2';
    const rs = rw ? ((rw.sessions || []).find((x) => x.dow === dow) || null) : null;
    const usaRegla = !cc && !!rs;
    const offset = (dow >= 1 && dow <= 6) ? dow - 1 : 6;   // dow 0 = domingo = último día ISO
    const date = monday ? addDays(monday, offset) : null;
    const durationMin = (cc && cc.durationMin != null) ? Number(cc.durationMin)
      : (usaRegla && rs.min != null) ? Number(rs.min)
        : (slot.durationMin || null);
    const distanceKm = (cc && cc.distanceKm != null) ? Number(cc.distanceKm)
      : (usaRegla && rs.km != null) ? Number(rs.km) : null;
    plan.push({
      id: `dow${dow}`,
      date,
      label: (cc && cc.label) || slot.label || cardioSubtypeLabel(st),
      distance_km: distanceKm,
      duration_min: durationMin,
      // El DSL del coach o el de la fase se manda VERBATIM: un bloque de trote/caminata no se
      // puede aplanar a "35m Z2" sin perder la prescripción entera (mismo criterio que
      // `_generateCardioDsl`).
      intervals: (cc && cc.dsl) || (usaRegla ? rs.dsl : null) || null,
      type: _ICU_RUN_TYPE_BY_SUBTYPE[st] || 'Z2',
      note: (cc && cc.note) || (usaRegla ? rs.note : null) || null,
      source: cc ? 'coach' : (usaRegla ? 'rule' : 'seed'),
    });
  }
  if (!plan.length) {
    if (typeof toast === 'function') toast('The active plan has no cardio scheduled');
    return;
  }

  // external_id keeps the push idempotent, but only through the bulk upsert endpoint
  // (see _icuUpsertEvents) — the whole week goes in a single request.
  const events = plan
    .filter(run => run.date)
    .map(run => ({
      external_id: `pwa-${weekKey}-${run.id}`,
      name: run.label || 'Programmed run',
      start_date_local: `${run.date}T06:00:00`,
      category: 'WORKOUT',
      type: 'Run',
      description: _generateIntervalsIcuDsl(run),
    }));
  const skipped = plan.length - events.length; // runs without a date
  if (!events.length) { if (typeof toast === 'function') toast('No dated runs to push'); return; }
  try {
    await _icuUpsertEvents(events);
    if (typeof toast === 'function') toast(`Pushed ${events.length} run${events.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} with no date` : ''}`);
  } catch (e) {
    console.warn('[intervals.icu] push failed:', e);
    if (typeof toast === 'function') toast(`Push failed (${e.message || 'error'})`);
  }
}

// ==================== PUSH TODAY'S CARDIO → intervals.icu → COROS (T5.2) ====================
// intervals.icu event `type` per modality (drives which COROS activity it maps to).
// v11.39: `ski` mandaba 'Workout' — un tipo genérico que además está en la lista de exclusión de
// importación, así que el workout enviado no casaba con la actividad que vuelve de Concept2.
// intervals.icu ya tiene tipos propios para los ergs: VirtualSki y VirtualRow.
const _ICU_TYPE_BY_MODALITY = { bike: 'Ride', run_outdoor: 'Run', treadmill: 'Run', row: 'Rowing', ski: 'VirtualSki', walk: 'Walk', elliptical: 'Elliptical', swim: 'Swim' };
const _ICU_ZONE_BY_SUBTYPE = { zone2: 'Z2', long_easy: 'Z2', zone3: 'Z3', threshold: 'Z4', intervals: 'Z5', recovery: 'Z1' };

// Build a one-step intervals.icu DSL for a planned cardio session. The target is
// always a zone label — see _icuZoneToken for why absolute bpm is not an option.
function _generateCardioDsl(planned) {
  // v11.60: si la regla de carrera ya trajo un DSL, se usa VERBATIM. Es DSL válido de
  // intervals.icu (bloque de repeticiones de trote/caminata, o distancia en km) y volver a
  // generarlo aquí lo aplanaría: el reloj recibiría "35m Z2" seguidos en vez de los 6 × (5' +
  // 1'), que es justo la prescripción de la fase.
  if (planned && typeof planned.dsl === 'string' && planned.dsl.trim()) return planned.dsl;
  const dur = planned.durationMin ? `${planned.durationMin}m` : '40m';
  const st = planned.subtype || 'zone2';
  return `- ${dur} ${_icuZoneToken(_ICU_ZONE_BY_SUBTYPE[st] || 'Z2')}`;
}

async function pushCardioToIntervalsIcu() {
  if (!_icuCanPush()) { toast('Set up intervals.icu in Settings first'); return; }

  const date = today();
  let planned = null;
  try { planned = await getPlannedSessionForDate(new Date()); } catch (e) {}
  if (!planned || planned.type !== 'run') {
    // No cardio planned today — default to a Z2 40' so the button still works.
    planned = { type: 'run', name: 'Cardio Z2', subtype: 'zone2', durationMin: 40, hrTarget: cardioHrTarget('zone2') };
  }

  // Ask which modality so intervals.icu maps to the right COROS activity type.
  const modality = await showActionSheet('What are you going to do?', [
    { value: 'bike', label: 'Bike', icon: '🚴' },
    { value: 'run_outdoor', label: 'Run', icon: '🏃' },
    { value: 'treadmill', label: 'Treadmill', icon: '🏃' },
    { value: 'row', label: 'Row', icon: '🚣' },
    { value: 'ski', label: 'SkiErg', icon: '⛷️' },
  ]);
  if (!modality) return;

  // One "today's cardio" slot: re-pushing replaces it instead of piling up events.
  const body = {
    external_id: `pwa-cardio-${date}`,
    name: planned.name || 'Cardio Z2',
    start_date_local: `${date}T06:00:00`,
    category: 'WORKOUT',
    type: _ICU_TYPE_BY_MODALITY[modality] || 'Workout',
    description: _generateCardioDsl(planned),
  };
  try {
    await _icuUpsertEvents([body]);
    toast('Sent to intervals.icu → COROS');
  } catch (e) {
    console.warn('[intervals.icu] cardio push failed:', e);
    toast(`Push failed (${e.message || 'error'})`);
  }
}

// ---- Z2 finisher on strength days (v11.34) ----
//
// IDEAL_BLOCK_V1 prescribes 15-20' of easy Z2 after each strength session (`z2Finisher`),
// which is what the block's "aerobic stimulus every day" rests on — 80 min/week in the
// 6-day variant. Until v11.34 that prescription existed ONLY as the string "+20' Z2"
// concatenated into a Home eyebrow: it had no zone, no HR target, no modality, and could
// be neither logged nor sent to the watch. So on the 4 strength days the aerobic dose was
// invisible (see assessments/2026-08-16_system-audit.md, A3).
//
// These helpers make it real. They add NO training volume: the dose has been in the plan
// since v11.28. Logged as a normal cardio session (family cardio / subtype zone2) so it
// counts in the hard-day budget like any other Z2, tagged `origin: 'z2_finisher'` so it
// can be told apart from a standalone cardio day.
const _Z2F_MODALITIES = [
  { value: 'bike', label: 'Bike', icon: '🚴' },
  { value: 'treadmill', label: 'Treadmill', icon: '🏃' },
  { value: 'row', label: 'Remo', icon: '🚣' },
  { value: 'ski', label: 'SkiErg', icon: '⛷️' },
  { value: 'run_outdoor', label: 'Correr', icon: '🏃' },
];

async function logZ2Finisher(minutes) {
  const mins = parseInt(minutes, 10) || 20;
  const modality = await showActionSheet('What did you do it on?', _Z2F_MODALITIES);
  if (!modality) return;
  const meta = (typeof sessionSubtypeMeta === 'function' && sessionSubtypeMeta('cardio', 'zone2')) || {};
  const MOD = { run_outdoor: 'Run', treadmill: 'Treadmill', bike: 'Bike', row: 'Row', ski: 'SkiErg' };
  await smartPut('sessions', {
    id: uid(), date: today(), ts: Date.now(),
    family: 'cardio', subtype: 'zone2', sessionType: 'cardio.zone2',
    modality, title: `${MOD[modality] || 'Cardio'} · post-strength Z2`,
    durationMin: mins, distance: null, avgHR: null, perceivedEffort: null,
    evidenceTags: meta.evidenceTags || ['END-001'],
    budgetWeight: meta.budgetWeight != null ? meta.budgetWeight : 0.5,
    notes: '', source: 'manual', origin: 'z2_finisher', week: getWeekNumber(),
  });
  state._lastCardioDate = null; state._runningWeek = null;   // v11.56: el finisher cuenta como cardio para la progresión
  toast(`Z2 ${mins}' logged`);
  try { renderTodaysPlan(); } catch (e) { console.warn('[Home] plan de hoy:', e); }
  try { renderSessionHistory(); } catch (e) { console.warn('[Cardio] historial:', e); }
}

async function pushZ2FinisherToIntervalsIcu(minutes) {
  const mins = parseInt(minutes, 10) || 20;
  const modality = await showActionSheet('What will you do it on?', _Z2F_MODALITIES);
  if (!modality) return;
  const date = today();
  try {
    await _icuUpsertEvents([{
      external_id: `pwa-z2finisher-${date}`,
      name: `Z2 ${mins}' post-fuerza`,
      start_date_local: `${date}T18:00:00`,
      category: 'WORKOUT',
      type: _ICU_TYPE_BY_MODALITY[modality] || 'Workout',
      description: _generateCardioDsl({ subtype: 'zone2', durationMin: mins }),
    }]);
    toast('Sent to intervals.icu → COROS');
  } catch (e) {
    console.warn('[intervals.icu] Z2 finisher push failed:', e);
    toast(`Push failed (${e.message || 'error'})`);
  }
}

// Zone → intervals.icu HR target token. z in {z1,z2,z3,z4,z5}.
//
// ALWAYS a zone label — never absolute bpm. intervals.icu does NOT support absolute
// bpm targets ("You need to specify the HR range in % of threshold HR. This is so
// workouts are portable between athletes." — david, intervals.icu). A bare number
// before `HR` is parsed as a PERCENT of max HR, so `128-145 HR` became 128-145% of
// max HR (~240-275 bpm) and reached the COROS as an impossible target. That was the
// v11.31/v11.32 bug. The cached bpm in settings.icuZones is for on-screen display
// only (see cardioHrTarget) and must never reach the DSL.
function _icuZoneToken(z) {
  const n = String(z || 'z2').toUpperCase();
  return `${/^Z[1-5]$/.test(n) ? n : 'Z2'} HR`;
}

// ==================== CARDIO LIBRARY (T5.3) ====================
// Curated, evidence-based cardio workouts the user can send to intervals.icu → COROS
// ANY day (not only planned cardio days). Aligned to his goals: fat loss + aerobic base
// (5k→10-15k Z2) with ~1 quality session/week. Each item builds an intervals.icu DSL.

// A repeat block is delimited by BLANK LINES, not by indentation: "Leave one empty
// line before and after every repeat block" (intervals.icu builder guide). Until
// v11.33 these were written with a leading space and no blank lines, so the parser
// swallowed the cooldown into the repeat — the 3x8 threshold session compiled to
// 10 + 3x(8+2+5) = 55 min instead of 45. Keep the rule in these two helpers only.
const _icuRepeat = (n, ...steps) => ['', `${n}x`, ...steps, ''];
const _icuDsl = (...parts) => parts.flat().join('\n');

const CARDIO_LIBRARY = [
  { group: 'Aerobic base (Z2)', id: 'run_z2_5k',  modality: 'run_outdoor', label: 'Z2 run · 5 km',  note: 'Easy, conversational', dsl: () => `- 5km ${_icuZoneToken('z2')}` },
  { group: 'Aerobic base (Z2)', id: 'run_z2_8k',  modality: 'run_outdoor', label: 'Z2 run · 8 km',  note: 'Mid-range base', dsl: () => `- 8km ${_icuZoneToken('z2')}` },
  { group: 'Aerobic base (Z2)', id: 'run_z2_10k', modality: 'run_outdoor', label: 'Z2 run · 10 km (long)', note: 'Weekend long run', dsl: () => `- 10km ${_icuZoneToken('z2')}` },
  { group: 'Aerobic base (Z2)', id: 'bike_z2_40', modality: 'bike', label: 'Z2 bike · 40 min', note: 'Low impact', dsl: () => `- 40m ${_icuZoneToken('z2')}` },
  { group: 'Aerobic base (Z2)', id: 'bike_z2_60', modality: 'bike', label: 'Z2 bike · 60 min', note: 'Cheap aerobic volume', dsl: () => `- 60m ${_icuZoneToken('z2')}` },
  { group: 'Aerobic base (Z2)', id: 'row_z2_30',  modality: 'row',  label: 'Z2 row · 30 min', note: 'Full body, easy', dsl: () => `- 30m ${_icuZoneToken('z2')}` },
  // v11.39: el catálogo tenía 13 workouts y CERO de ski, pese a que `ski` es una modalidad
  // declarada, hay un SkiErg en el gimnasio y la integración Concept2 ya trae "Virtual Ski".
  // El SkiErg es la mejor opción cuando las piernas están cargadas: tren superior y core,
  // impacto nulo (HYB-005, INT-002).
  { group: 'Aerobic base (Z2)', id: 'ski_z2_25',  modality: 'ski',  label: 'Z2 SkiErg · 25 min', note: 'Tired legs, zero impact', dsl: () => `- 25m ${_icuZoneToken('z2')}` },

  { group: 'Quality (1×/wk)', id: 'run_prog', modality: 'run_outdoor', label: 'Progression Z2→Z3 · 35 min', note: 'Finish a little faster', dsl: () => _icuDsl(`- 15m ${_icuZoneToken('z2')}`, `- 15m ${_icuZoneToken('z3')}`, `- 5m ${_icuZoneToken('z2')}`) },
  { group: 'Quality (1×/wk)', id: 'run_tempo', modality: 'run_outdoor', label: 'Threshold · 3×8 min Z4', note: 'Sustained tempo', dsl: () => _icuDsl(`- 10m ${_icuZoneToken('z2')}`, _icuRepeat(3, `- 8m ${_icuZoneToken('z4')}`, `- 2m ${_icuZoneToken('z1')}`), `- 5m ${_icuZoneToken('z2')}`) },
  { group: 'Quality (1×/wk)', id: 'run_vo2', modality: 'run_outdoor', label: 'VO2 · 5×3 min Z5', note: 'Hard intervals', dsl: () => _icuDsl(`- 12m ${_icuZoneToken('z2')}`, _icuRepeat(5, `- 3m ${_icuZoneToken('z5')}`, `- 3m ${_icuZoneToken('z1')}`), `- 8m ${_icuZoneToken('z2')}`) },
  { group: 'Quality (1×/wk)', id: 'bike_intervals', modality: 'bike', label: 'Bike · 4×4 min Z4', note: 'Low-impact intervals', dsl: () => _icuDsl(`- 10m ${_icuZoneToken('z2')}`, _icuRepeat(4, `- 4m ${_icuZoneToken('z4')}`, `- 3m ${_icuZoneToken('z1')}`), `- 5m ${_icuZoneToken('z2')}`) },
  { group: 'Quality (1×/wk)', id: 'row_intervals', modality: 'row', label: 'Row · 6×2 min Z4', note: 'Aerobic power', dsl: () => _icuDsl(`- 8m ${_icuZoneToken('z2')}`, _icuRepeat(6, `- 2m ${_icuZoneToken('z4')}`, `- 2m ${_icuZoneToken('z1')}`), `- 5m ${_icuZoneToken('z2')}`) },
  { group: 'Quality (1×/wk)', id: 'ski_intervals', modality: 'ski', label: 'SkiErg · 8×1 min Z4', note: 'Hard without punishing the legs', dsl: () => _icuDsl(`- 8m ${_icuZoneToken('z2')}`, _icuRepeat(8, `- 1m ${_icuZoneToken('z4')}`, `- 1m ${_icuZoneToken('z1')}`), `- 5m ${_icuZoneToken('z2')}`) },

  { group: 'Recovery', id: 'walk_30', modality: 'walk', label: 'Z1 walk · 30 min', note: 'Active recovery', dsl: () => `- 30m ${_icuZoneToken('z1')}` },
  { group: 'Recovery', id: 'bike_recov', modality: 'bike', label: 'Z1 recovery bike · 30 min', note: 'Tired legs', dsl: () => `- 30m ${_icuZoneToken('z1')}` },
];

// Render the "Enviar a COROS" catalog inside the Cardio tab (always visible).
// Which catalog subtypes are "hard"? Used only to ADVISE, never to block.
const _CLIB_HARD = new Set(['threshold', 'intervals', 'zone3']);

// Map a catalog item to the cardio subtype it really is, so it can be compared
// against today's planned session. Derived from the item id (the DSL builders are
// opaque), which is why this lives next to CARDIO_LIBRARY.
function _clibSubtype(item) {
  const id = String(item.id || '');
  if (/tempo|umbral|threshold/.test(id)) return 'threshold';
  if (/vo2|interval/.test(id)) return 'intervals';
  if (/prog/.test(id)) return 'zone3';
  if (/recov|walk/.test(id)) return 'recovery';
  if (/10k|60|long/.test(id)) return 'long_easy';
  return 'zone2';
}

// v11.34: the catalog used to be 13 identical buttons with no context — you could send
// a VO2 session the evening before heavy legs and nothing would say a word. It now
// recommends and warns, and STILL SENDS ANYTHING: advise, don't block (user decision,
// 2026-08-16).
//
// v11.62: el contexto sale de las dos fuentes DIRECTAS —la sesión planificada de hoy y el
// color de WHOOP de hoy— y no del advisory, que se retiró. Son dos hechos físicos
// (interferencia con pierna, recuperación en rojo) puestos al lado del botón; no cambian nada
// ni deshabilitan nada.
async function renderCardioLibrary() {
  const host = document.getElementById('cardio-library');
  if (!host) return;
  const hasCreds = _icuCanPush();
  const groups = [...new Set(CARDIO_LIBRARY.map(w => w.group))];
  // The target is always sent as a zone label (Z1-Z5) — intervals.icu resolves it
  // against your own zones before it reaches the COROS. The cached bpm is shown
  // here purely as a reference for you.
  const z2 = cardioHrTarget('zone2');
  const zNote = z2 ? `Zone-based target · your Z2 = ${z2}` : 'Zone-based target (Z1-Z5), from your intervals.icu zones';

  let planned = null;
  try { planned = await getPlannedSessionForDate(new Date()); } catch (e) { /* context is optional */ }
  let whoopRed = false;
  try { const wc = await getWhoopContext(); whoopRed = !!(wc && wc.color === 'red'); } catch (e) {}
  // A hard cardio session is discouraged when the day already carries heavy legs
  // (INT-001), the week is over its hard-day cap (BUD-001), or recovery is red.
  const legsToday = planned && planned.type === 'gym' && /lower|leg|pierna|squat|hinge|bisagra/i.test(`${planned.sessionId} ${planned.subtitle || ''}`);
  // v11.41: el aviso se apoya solo en razones físicas reales —pierna hoy (interferencia) y
  // recuperación en rojo—, no en la carga acumulada, que ya no condiciona nada.
  const hardDiscouraged = legsToday || whoopRed;
  const hardWhy = legsToday ? 'legs today' : whoopRed ? 'recovery in the red' : '';
  const wantSubtype = planned && planned.type === 'run' ? (planned.subtype || 'zone2') : null;

  let header = '';
  if (planned && planned.type === 'run') {
    header = `<div class="clib-today">Today: <b>${planned.name || cardioSubtypeLabel(planned.subtype)}</b>${planned.durationMin ? ` · ${planned.durationMin}'` : ''}. You can still send any other one.</div>`;
  } else if (planned && planned.type === 'gym') {
    header = `<div class="clib-today">Today: <b>${planned.name || 'strength'}</b>. If you also want cardio, keep it easy${hardDiscouraged ? ` — ${hardWhy}` : ''}.</div>`;
  }

  host.innerHTML = `
    <div class="section-head" style="margin-top:4px">
      <div class="section-head-icon" style="background:var(--tint-blue);color:var(--blue)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>
      </div>
      <span class="section-head-title">Send to COROS</span>
    </div>
    ${header}
    ${hasCreds ? '' : `<div class="clib-warn">Set up intervals.icu in Settings to send to your COROS.</div>`}
    ${groups.map(g => `
      <div class="clib-group">${g}</div>
      ${CARDIO_LIBRARY.filter(w => w.group === g).map(w => {
        const st = _clibSubtype(w);
        const isHard = _CLIB_HARD.has(st);
        const rec = wantSubtype && st === wantSubtype;
        const warn = isHard && hardDiscouraged;
        return `<button class="clib-row${rec ? ' clib-rec' : ''}" data-clib="${w.id}" ${hasCreds ? '' : 'disabled'}>
          <span class="clib-body">
            <span class="clib-label">${w.label}${rec ? '<span class="clib-badge">Recommended today</span>' : ''}</span>
            <span class="clib-note">${warn ? `⚠ Demanding — ${hardWhy}` : w.note}</span>
          </span>
          <span class="clib-send">→ COROS</span>
        </button>`;
      }).join('')}
    `).join('')}
    <div class="clib-foot">${zNote} · it is scheduled for today in your intervals.icu calendar → COROS. The warnings are advisory: you can send any of them.</div>
  `;
  host.querySelectorAll('[data-clib]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = CARDIO_LIBRARY.find(w => w.id === btn.dataset.clib);
      if (item) pushCardioWorkout(item);
    });
  });
}

// Push one catalog workout to intervals.icu as today's planned event.
// external_id is per (day, workout): sending the SAME workout again updates it,
// while two different workouts can coexist on one day (Z2 morning + intervals later).
async function pushCardioWorkout(item) {
  if (!_icuCanPush()) { toast('Set up intervals.icu in Settings first'); return; }
  const date = today();
  const body = {
    external_id: `pwa-cardio-${date}-${item.id}`,
    name: item.label,
    start_date_local: `${date}T06:00:00`,
    category: 'WORKOUT',
    type: _ICU_TYPE_BY_MODALITY[item.modality] || 'Workout',
    description: item.dsl(),
  };
  try {
    await _icuUpsertEvents([body]);
    toast(`${item.label} → COROS ✓`);
  } catch (e) {
    console.warn('[intervals.icu] catalog push failed:', e);
    toast(`Push failed (${e.message || 'error'})`);
  }
}

// Tiny markdown subset: bold (**...**), bullets ("- "), and line breaks.
function markdownToBasicHtml(md) {
  if (!md) return '';
  const safe = escapeHtml(md);
  const lines = safe.split('\n');
  const out = [];
  let inList = false;
  lines.forEach(line => {
    const isBullet = /^\s*[-*]\s+/.test(line);
    if (isBullet) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push('<li>' + line.replace(/^\s*[-*]\s+/, '') + '</li>');
    } else {
      if (inList) { out.push('</ul>'); inList = false; }
      if (line.trim() !== '') out.push('<p>' + line + '</p>');
    }
  });
  if (inList) out.push('</ul>');
  return out.join('').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

async function renderStrengthChart() {
  const tabsContainer = document.getElementById('strength-tabs');
  const chartContainer = document.getElementById('strength-chart');

  // Build tabs for key lifts
  tabsContainer.innerHTML = KEY_LIFTS.map(liftId => {
    const name = getExerciseName(liftId);
    const short = name.replace('Barbell ', '').replace('Sumo ', '');
    return `<button class="chart-tab${liftId === state.selectedStrengthLift ? ' active' : ''}" data-lift="${liftId}">${short}</button>`;
  }).join('');

  tabsContainer.querySelectorAll('.chart-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedStrengthLift = btn.dataset.lift;
      tabsContainer.querySelectorAll('.chart-tab').forEach(b => b.classList.toggle('active', b.dataset.lift === state.selectedStrengthLift));
      drawStrengthChart(state.selectedStrengthLift, chartContainer);
    });
  });

  await drawStrengthChart(state.selectedStrengthLift, chartContainer);
}

async function drawStrengthChart(liftId, container) {
  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));

  const data = [];
  workouts.forEach(w => {
    const ex = w.exercises.find(e => e.exerciseId === liftId);
    if (ex) {
      const doneSets = ex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0);
      if (doneSets.length > 0) {
        const best = doneSets.reduce((b, s) => estimate1RM(s.weight, s.reps) > estimate1RM(b.weight, b.reps) ? s : b);
        data.push({ date: w.date, e1rm: estimate1RM(convertWeight(best.weight, w.unit, state.settings.unit), best.reps) });
      }
    }
  });

  if (data.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ sessions to chart progress</span>';
    return;
  }

  container.innerHTML = renderLineChart(
    data.map(d => formatDate(d.date)),
    data.map(d => d.e1rm),
    { color: 'var(--accent)', height: 160 }
  );
}

async function renderVolumeChart() {
  const container = document.getElementById('volume-chart');
  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));

  if (workouts.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ weeks of data</span>';
    return;
  }

  // Group by week (DB exercises count both hands via volumeForExercise)
  const weekVolumes = {};
  workouts.forEach(w => {
    const wk = w.week || 1;
    if (!weekVolumes[wk]) weekVolumes[wk] = 0;
    w.exercises.forEach(ex => { weekVolumes[wk] += volumeForExercise(ex, w.unit); });
  });

  const weeks = Object.keys(weekVolumes).sort((a, b) => a - b);
  if (weeks.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ weeks of data</span>';
    return;
  }

  container.innerHTML = renderLineChart(
    weeks.map(w => `Wk ${w}`),
    weeks.map(w => Math.round(weekVolumes[w])),
    { color: 'var(--blue)', height: 160 }
  );
}

// ==================== WEEK vs WEEK COMPARISON ====================
async function renderWeekComparison() {
  const container = document.getElementById('week-compare');
  if (!container) return;

  const workouts = await dbGetAll('workouts');
  const runs = await getRunsDeduped();
  const nutrition = await dbGetAll('nutrition');

  // Current week dates
  const curWeekDates = getWeekDates().map(d => dateStr(d));

  // Previous week dates
  const prevWeekDates = getWeekDates().map(d => {
    const pd = new Date(d);
    pd.setDate(pd.getDate() - 7);
    return dateStr(pd);
  });

  function weekMetrics(dates) {
    const wk = workouts.filter(w => dates.includes(w.date));
    const rn = runs.filter(r => dates.includes(r.date));
    const nt = nutrition.filter(n => dates.includes(n.date));

    let volume = 0;
    wk.forEach(w => w.exercises.forEach(ex => { volume += volumeForExercise(ex, w.unit); }));

    const avgProtein = nt.length > 0 ? Math.round(nt.reduce((s, n) => s + (n.protein || 0), 0) / nt.length) : 0;
    const avgQuality = wk.length > 0 ? +(wk.reduce((s, w) => s + (w.quality || 3), 0) / wk.length).toFixed(1) : 0;
    const totalKm = +rn.reduce((s, r) => s + (r.distance || 0), 0).toFixed(1);

    return { sessions: wk.length, runs: rn.length, volume, totalKm, avgProtein, avgQuality };
  }

  const curr = weekMetrics(curWeekDates);
  const prev = weekMetrics(prevWeekDates);

  function delta(c, p, higherIsBetter = true) {
    if (p === 0 && c === 0) return '<span class="wc-delta flat">=</span>';
    if (p === 0) return '<span class="wc-delta up">NEW</span>';
    const diff = c - p;
    if (diff === 0) return '<span class="wc-delta flat">=</span>';
    const positive = higherIsBetter ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? '↑' : '↓';
    const cls = positive ? 'up' : 'down';
    return `<span class="wc-delta ${cls}">${arrow}${Math.abs(Math.round(diff))}</span>`;
  }

  const rows = [
    { label: 'Gym sessions', c: curr.sessions, p: prev.sessions },
    { label: 'Runs', c: curr.runs, p: prev.runs },
    { label: 'Volume (kg)', c: curr.volume.toLocaleString(), p: prev.volume.toLocaleString(), cRaw: curr.volume, pRaw: prev.volume },
    { label: 'Run km', c: curr.totalKm, p: prev.totalKm },
    { label: 'Avg protein', c: curr.avgProtein + 'g', p: prev.avgProtein + 'g', cRaw: curr.avgProtein, pRaw: prev.avgProtein },
    { label: 'Avg quality', c: curr.avgQuality + '/5', p: prev.avgQuality + '/5', cRaw: curr.avgQuality, pRaw: prev.avgQuality },
  ];

  container.innerHTML = `
    <div class="wc-header">
      <span></span><span>Prev</span><span>This</span><span>Δ</span>
    </div>
    ${rows.map(r => `
      <div class="wc-row">
        <span class="wc-label">${r.label}</span>
        <span class="wc-val" style="color:var(--text3)">${r.p}</span>
        <span class="wc-val">${r.c}</span>
        ${delta(r.cRaw !== undefined ? r.cRaw : r.c, r.pRaw !== undefined ? r.pRaw : r.p)}
      </div>
    `).join('')}
  `;
}

// ==================== STREAK CALENDAR (GitHub style) ====================
async function renderStreakCalendar() {
  const container = document.getElementById('streak-calendar');
  if (!container) return;

  const workouts = await dbGetAll('workouts');
  const runs = await getRunsDeduped();

  // Build set of active dates (last 12 weeks = 84 days)
  const activeDates = new Set();
  workouts.forEach(w => activeDates.add(w.date));
  runs.forEach(r => activeDates.add(r.date));

  const today = new Date();
  const days = 84; // 12 weeks
  const cells = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = dateStr(d);
    const active = activeDates.has(ds);
    const isToday = i === 0;
    cells.push({ date: ds, active, isToday, day: d.getDay() });
  }

  // Arrange in columns (weeks), rows (days 0-6)
  const weeks = [];
  let currentWeek = [];
  cells.forEach((c, i) => {
    if (i === 0) {
      // Pad first week
      for (let j = 0; j < c.day; j++) currentWeek.push(null);
    }
    currentWeek.push(c);
    if (c.day === 6 || i === cells.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  const totalActive = activeDates.size;
  const last7 = cells.slice(-7).filter(c => c && c.active).length;

  container.innerHTML = `
    <div class="streak-cal-stats">
      <span>${totalActive} total sessions</span>
      <span>${last7}/7 this week</span>
    </div>
    <div class="streak-cal-grid">
      ${weeks.map(week => `<div class="streak-cal-col">${week.map(c => {
        if (!c) return '<div class="streak-cal-cell empty"></div>';
        return `<div class="streak-cal-cell${c.active ? ' active' : ''}${c.isToday ? ' today' : ''}" title="${c.date}"></div>`;
      }).join('')}</div>`).join('')}
    </div>
    <div class="streak-cal-legend"><span class="streak-cal-cell"></span> Rest <span class="streak-cal-cell active"></span> Active</div>
  `;
}

// ==================== BODY COMPOSITION + WAIST TRACKING ====================
// v11.47: hasta ahora esto era una calculadora que TIRABA el dato. Pedia cintura, cuello y
// altura, mostraba un % de grasa por el metodo Navy, y no guardaba nada. El numero que mide
// el objetivo declarado --reducir cintura-- se escribia, se veia una vez y se perdia. Sin
// historico no hay tendencia, y sin tendencia la circunferencia no sirve: el ruido de
// medicion es de +-0,5 cm, asi que solo los cambios a ~2 semanas significan algo.
//
// Persiste dentro del store `bodyweight` en lugar de un store nuevo: ya tiene keyPath
// 'date', ya sincroniza a Supabase, ya esta en BACKUP_STORES y en el export CSV. Anadir
// campos es aditivo, no rompe las filas existentes (las de intervals.icu traen `measured`
// y `source`), y deja la serie de cintura al lado de la de peso -- que es como se leen,
// las dos son tendencia de composicion.
//
// El write MERGEA sobre la fila del dia: la balanza escribe `weight` cada manana y la
// cintura se mide un dia a la semana, asi que pisar la fila perderia uno de los dos.
const WAIST_MIN_DELTA_DAYS = 10; // por debajo de esto el delta es ruido, no senal

// ==================== WITHINGS BODY SMART · COMPOSICIÓN ====================
//
// "Extraer y apalancar todas las métricas de Withings" (Julian, 2026-09-09). La báscula manda por
// pesada: peso, % grasa, masa grasa, FFM, músculo, agua, hueso, grasa visceral (índice),
// metabolismo basal, edad metabólica y pulso de pie. Hasta aquí sólo se leía el peso y una línea
// apagada; el resto se guardaba y no se veía. Esta tarjeta los enseña TODOS, con un delta que se
// lee sobre DÍAS (la bioimpedancia oscila ±0,5 % de un día a otro: comparar con la pesada anterior
// es leer ruido) y una línea de recomposición: grasa que baja con FFM que aguanta es el objetivo 1
// aunque el peso se mueva poco. El mismo criterio que `trajectory.weight.scale` en el pack del coach.
const WCOMP_MIN_DELTA_DAYS = 7;
const WCOMP_WINDOW_DAYS = 28;
const WCOMP_FIELDS = [
  { key: 'fatPct',       label: 'Body fat',       unit: '%',    d: 1, goodDown: true, primary: true },
  { key: 'fatMassKg',    label: 'Fat mass',       unit: 'kg',   d: 1, goodDown: true, primary: true },
  { key: 'ffmKg',        label: 'Lean mass',      unit: 'kg',   d: 1, goodDown: false, primary: true },
  { key: 'muscleKg',     label: 'Muscle',         unit: 'kg',   d: 1, goodDown: false, primary: true },
  { key: 'waterKg',      label: 'Water',          unit: 'kg',   d: 1, goodDown: null },
  { key: 'boneKg',       label: 'Bone',           unit: 'kg',   d: 2, goodDown: null },
  // V-11: `visceralFat` es un ÍNDICE de Withings (1-12 sano), no kg ni %. Sin unidad, un "8,0"
  // al lado de "18,4 %" y "16,1 kg" se lee como si fuera de la misma familia.
  { key: 'visceralFat',  label: 'Visceral fat',   unit: 'idx',  d: 1, goodDown: true },
  { key: 'bmrKcal',      label: 'BMR',            unit: 'kcal', d: 0, goodDown: null },
  { key: 'metabolicAge', label: 'Metabolic age',  unit: 'y',    d: 0, goodDown: true },
  { key: 'heartRateBpm', label: 'Standing pulse', unit: 'bpm',  d: 0, goodDown: null },
];

async function renderWithingsComposition() {
  const el = document.getElementById('withings-comp');
  if (!el) return;
  const num = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  // V-4: `.catch(() => [])` convertía un fallo de lectura en "la báscula no ha escrito nada",
  // que es la lectura que el usuario cree siempre. Ahora se distinguen.
  let rows;
  try { rows = (await dbGetAll('bodyweight')) || []; } catch (e) {
    console.warn('[Withings] lectura:', e);
    showErrorState(el, 'Could not read the scale history.', renderWithingsComposition);
    return;
  }
  const scale = rows
    .filter((r) => r && r.source === 'withings' && r.date && WCOMP_FIELDS.some((f) => num(r[f.key]) != null))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  if (!scale.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }

  const last = scale[scale.length - 1];
  const dayMs = 86400000;
  const t = (d) => new Date(d + 'T12:00:00').getTime();
  const in28 = scale.filter((r) => (t(last.date) - t(r.date)) < WCOMP_WINDOW_DAYS * dayMs);
  // Referencia: la lectura MÁS ANTIGUA dentro de 28 días que esté a ≥7 días de la última.
  const ref = in28.find((r) => (t(last.date) - t(r.date)) >= WCOMP_MIN_DELTA_DAYS * dayMs) || null;
  const refDays = ref ? Math.round((t(last.date) - t(ref.date)) / dayMs) : null;
  const fmt = (v, d) => (d === 0 ? Math.round(v).toLocaleString('en-US') : v.toFixed(d));
  const MINUS = '\u2212';
  const sg = (x, d) => (x > 0 ? '+' : (x < 0 ? MINUS : '')) + fmt(Math.abs(x), d);

  // V-11: el "· N d" iba en LOS DIEZ tiles — la misma ventana repetida diez veces, ocupando el
  // sitio del dato. La ventana es una propiedad de la tarjeta, no de cada métrica: sube a
  // `.wcomp-meta`, arriba, una vez.
  const tile = (f) => {
    const v = num(last[f.key]);
    if (v == null) return '';
    let delta = '<span class="wcomp-delta muted">no reference yet</span>';
    const rv = ref ? num(ref[f.key]) : null;
    if (rv != null) {
      const dlt = v - rv;
      const eps = f.d === 0 ? 0.5 : Math.pow(10, -f.d) / 2;
      let color = 'var(--text3)';
      if (Math.abs(dlt) >= eps && f.goodDown !== null) color = ((dlt < 0) === f.goodDown) ? 'var(--accent)' : 'var(--red)';
      const unit = f.unit === '%' ? ' pp' : (f.unit ? ' ' + f.unit : '');
      delta = `<span class="wcomp-delta" style="color:${color}">${sg(dlt, f.d)}${unit}</span>`;
    }
    return `<div class="wcomp-stat"><span class="wcomp-label">${f.label}</span><span class="wcomp-val">${fmt(v, f.d)}${f.unit ? `<span class="wcomp-unit">${f.unit}</span>` : ''}</span>${delta}</div>`;
  };
  // V-11: cuatro tiles arriba (los que responden al objetivo 1: grasa abajo, magro arriba) y los
  // otros seis en un desplegable. Diez rectángulos iguales no son una jerarquía: son una lista.
  const tiles = WCOMP_FIELDS.filter((f) => f.primary).map(tile).join('');
  const restoHtml = WCOMP_FIELDS.filter((f) => !f.primary).map(tile).filter(Boolean).join('');

  // Recomposición: masa grasa y FFM contra la referencia, y la media de 7 días del % de grasa
  // cuando hay ≥3 lecturas en la semana — la forma honesta de leer una bioimpedancia.
  const in7 = scale.filter((r) => (t(last.date) - t(r.date)) < 7 * dayMs && num(r.fatPct) != null);
  const avg7 = in7.length >= 3 ? in7.reduce((acc, r) => acc + num(r.fatPct), 0) / in7.length : null;
  let recomp;
  if (ref && num(last.fatMassKg) != null && num(ref.fatMassKg) != null && num(last.ffmKg) != null && num(ref.ffmKg) != null) {
    const dFat = num(last.fatMassKg) - num(ref.fatMassKg);
    const dFfm = num(last.ffmKg) - num(ref.ffmKg);
    let verdict;
    if (dFat <= -0.3 && dFfm >= -0.3) verdict = 'recomposition on track: fat down, lean mass held';
    else if (dFat <= -0.3) verdict = 'fat is going, but so is lean mass: check protein and the anchors';
    else if (dFat >= 0.3) verdict = 'fat mass is up over this window';
    else verdict = 'within the noise of the scale for now';
    recomp = `<b>Fat mass ${sg(dFat, 1)} kg · lean mass ${sg(dFfm, 1)} kg</b> since ${formatDate(ref.date)} (n=${in28.length}): ${verdict}.`;
  } else {
    recomp = `Need weigh-ins ${WCOMP_MIN_DELTA_DAYS}+ days apart to read the recomposition trend (n=${in28.length} in 28 d).`;
  }
  if (avg7 != null) recomp += ` 7-day fat average <b>${avg7.toFixed(1)} %</b> (n=${in7.length}).`;
  // V-11: la grasa visceral es el único índice de la tarjeta y su escala no es evidente.
  const vf = num(last.visceralFat);
  if (vf != null) recomp += ` Visceral fat <b>${vf.toFixed(1)} idx</b> (1-12 healthy).`;

  el.classList.remove('hidden');
  el.innerHTML = `
    <div class="wcomp-head">
      <span class="wcomp-title"><span class="bw-source-pill">Withings</span> Body Smart</span>
      <span class="wcomp-meta">last ${formatDate(last.date)}${num(last.weight) != null ? ` · ${num(last.weight).toFixed(1)} kg` : ''} · ${in28.length} weigh-in${in28.length === 1 ? '' : 's'} / 28 d${refDays ? ` · deltas vs ${refDays} d ago` : ''}</span>
    </div>
    <div class="wcomp-grid">${tiles}</div>
    ${restoHtml ? `<details class="wcomp-more"><summary>All scale metrics</summary><div class="wcomp-grid">${restoHtml}</div></details>` : ''}
    <div class="wcomp-recomp">${recomp}</div>`;
}

/**
 * F-14 (auditoría 2026-09-09): la CINTURA es el veto del piloto de calorías —y hasta hoy sólo se
 * podía guardar rellenando los CUATRO campos de la calculadora Navy. Medirla y no tener el
 * cuello a mano significaba no guardarla. Y `wellness.abdomen`, que intervals.icu ya persiste,
 * no entraba en la serie: había medidas que el sistema tenía y no usaba.
 *
 * La serie de cintura que se pinta y sobre la que se calcula el delta MEZCLA las dos fuentes: la
 * manual manda por día, y donde no la hay entra `abdomen`. La mezcla es de SÓLO LECTURA — no se
 * escribe en `bodyweight`, porque duplicar un dato que ya vive en `wellness` es cómo se acaba con
 * dos historiales que se contradicen.
 */
function _waistSeries(bodyweightRows, wellnessRows) {
  const n = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  const byDate = new Map();
  for (const r of (wellnessRows || [])) {
    const w = r && r.date ? n(r.abdomen) : null;
    if (w != null && w > 0) byDate.set(r.date, { date: r.date, waist: w, source: 'intervals.icu' });
  }
  for (const r of (bodyweightRows || [])) {
    const w = r && r.date ? n(r.waist) : null;
    if (w != null && w > 0) byDate.set(r.date, Object.assign({}, r, { source: 'manual' }));
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * ¿Manda la báscula? Mismo criterio que `renderWithingsComposition`, calculado sobre el DATO y no
 * sobre el DOM: las dos tarjetas se pintan en la misma tanda con `allSettled` y el orden de
 * terminación no está garantizado. El estado del contenedor se mira además por si el renderer de
 * la báscula ya pasó (es la fuente de verdad cuando existe).
 */
function _withingsCompositionPresent(rows) {
  const el = document.getElementById('withings-comp');
  if (el && el.innerHTML && !el.classList.contains('hidden')) return true;
  const n = (v) => (v == null || v === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
  return (rows || []).some((r) => r && r.source === 'withings' && r.date
    && WCOMP_FIELDS.some((f) => n(r[f.key]) != null));
}

/**
 * DECISIÓN DE JULIAN (2026-09-10, V-11): **Navy sólo cuando no hay báscula.**
 *
 * La tarjeta de Withings da un % de grasa por bioimpedancia y esta calculadora daba OTRO por
 * circunferencias, los dos bajo la etiqueta "Body Fat" y a dos dedos de distancia. Dos números
 * distintos para lo mismo no son dos estimaciones: son un sistema que no sabe cuánto pesas. Con
 * báscula manda la báscula, y esta tarjeta se queda con lo único que la báscula NO mide: la
 * cintura. Sin báscula (viaje, avería) vuelve la estimación Navy completa.
 *
 * V-15: rejilla 2×2 con `label for=` de verdad, `class="text-input"` (16 px: por debajo iOS hace
 * zoom al enfocar) y sin la cadena de CSS en línea que había.
 */
async function renderBodyCompEstimator() {
  const container = document.getElementById('bodycomp-section');
  if (!container) return;

  let rows = [];
  let wellness = [];
  try {
    [rows, wellness] = await Promise.all([dbGetAll('bodyweight'), dbGetAll('wellness')]);
  } catch (e) {
    console.warn('[Cintura] lectura:', e);
    showErrorState(container, 'Could not read the waist history.', renderBodyCompEstimator);
    return;
  }
  const waistLog = _waistSeries(rows, wellness);
  const last = waistLog.length ? waistLog[waistLog.length - 1] : null;
  const lastManual = [...waistLog].reverse().find((e) => e.source === 'manual') || null;
  const pesadas = _bwWeighIns(rows);
  const lastWeighIn = pesadas.length ? pesadas[pesadas.length - 1] : null;
  const navy = !_withingsCompositionPresent(rows);

  // Prefill: cuello y altura no cambian entre mediciones; el peso viene del ultimo pesaje.
  const pfWeight = (lastWeighIn && Number(lastWeighIn.weight)) || '';
  const pfWaist = (last && Number(last.waist)) || '';
  const pfNeck = (lastManual && Number(lastManual.neck)) || '';
  const pfHeight = (lastManual && Number(lastManual.heightCm)) || 182;

  const campo = (id, label, value, step, ph) => `
      <div class="waist-field">
        <label for="${id}">${label}</label>
        <input type="number" id="${id}" class="text-input" inputmode="decimal" step="${step}" value="${value}" placeholder="${ph}">
      </div>`;

  container.innerHTML = `
    <div class="card-title">${navy ? 'Waist and composition' : 'Waist'}</div>
    <div class="waist-form">
      ${navy ? campo('bc-weight', 'Weight (kg)', pfWeight, '0.1', '87') : ''}
      ${campo('bc-waist', 'Waist (cm)', pfWaist, '0.5', '92')}
      ${campo('bc-neck', `Neck (cm)${navy ? '' : ' · optional'}`, pfNeck, '0.5', '39')}
      ${campo('bc-height', `Height (cm)${navy ? '' : ' · optional'}`, pfHeight, '1', '182')}
    </div>
    <button id="btn-calc-bf" class="btn-secondary btn-full">${navy ? 'Calculate and save' : 'Save waist'}</button>
    <div id="bc-result" style="margin-top:10px">${renderWaistSummary(waistLog)}</div>
    <p class="setting-hint">${navy
      ? 'No scale connected, so body fat is estimated from circumferences (US Navy). Sunday morning, fasted.'
      : 'The scale owns body fat; this card owns the waist, which it cannot measure.'}
      Standing and relaxed, tape at navel height, at the end of a normal exhale, snug without compressing. Take two measurements and average them.</p>
  `;

  document.getElementById('btn-calc-bf').addEventListener('click', async () => {
    const waist = parseFloat(document.getElementById('bc-waist').value);
    const neck = parseFloat(document.getElementById('bc-neck').value);
    const height = parseFloat(document.getElementById('bc-height').value);
    const weightEl = document.getElementById('bc-weight');
    const weight = weightEl ? parseFloat(weightEl.value) : NaN;
    const resultEl = document.getElementById('bc-result');

    if (!waist) {
      resultEl.innerHTML = '<span class="muted">Enter the waist measurement</span>';
      return;
    }
    let bfPct = null, leanMass = null, fatMass = null, category = null;
    if (navy) {
      if (!weight || !neck || !height) {
        resultEl.innerHTML = '<span class="muted">Fill in all four fields</span>';
        return;
      }
      // El logaritmo de Navy explota si la cintura no supera al cuello.
      if (waist <= neck) {
        resultEl.innerHTML = '<span class="muted">The waist must be larger than the neck</span>';
        return;
      }
      // US Navy method (male)
      const bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
      bfPct = Math.round(bf * 10) / 10;
      leanMass = Math.round(weight * (1 - bfPct / 100) * 10) / 10;
      fatMass = Math.round(weight * (bfPct / 100) * 10) / 10;
      if (bfPct < 6) category = 'Essential';
      else if (bfPct < 14) category = 'Athletic';
      else if (bfPct < 18) category = 'Fitness';
      else if (bfPct < 25) category = 'Average';
      else category = 'Above average';
    }

    // Merge sobre la fila del dia: no pisar el peso que ya escribio la balanza, ni los
    // campos `source`/`measured` que trae intervals.icu.
    const d = today();
    let existing = null;
    try { existing = await dbGet('bodyweight', d); } catch (e) { console.warn('[Peso] fila del día:', e); }
    const fila = Object.assign({}, existing || {}, {
      date: d,
      waist,
      timestamp: Date.now(),
    });
    // Opcionales: sólo si vienen. Un cuello en blanco no puede borrar el de la semana pasada.
    if (Number.isFinite(neck) && neck > 0) fila.neck = neck;
    if (Number.isFinite(height) && height > 0) fila.heightCm = height;
    // F-14 + V-11: sin báscula el Navy escribe su `bfPct`; CON báscula NO se recalcula nunca —
    // el % de grasa de la tarjeta de Withings es el que manda y pisarlo aquí lo contradiría.
    if (navy) {
      fila.weight = weight;
      fila.bfPct = bfPct;
      // `measured` es una propiedad del PESO, no de la cintura: aquí hay un peso teclado, así
      // que la fila es una pesada real. Guardando sólo la cintura NO se toca — si el peso del
      // día es el forward-fill de intervals.icu (`measured: false`), marcarlo `true` haría que
      // `_weightDays` contase un valor suavizado como pesada, y con ella la pendiente de 28 días.
      fila.measured = true;
    }
    try {
      await smartPut('bodyweight', fila);
    } catch (e) {
      // V-9: la medida de cintura es de las que cuestan un metro y dos minutos.
      console.warn('[Peso] guardar cintura:', e);
      toast(`Something went wrong saving the measurement: ${(e && e.message) || 'storage error'}`);
      return;
    }
    if (navy) _bwCache = weight; // igual que logBodyWeight(): refresca el peso de las estimaciones

    resultEl.innerHTML = navy
      ? `
      <div class="bc-result-grid">
        <div class="bc-stat"><span class="bc-val">${bfPct}%</span><span class="bc-label">Body Fat</span></div>
        <div class="bc-stat"><span class="bc-val">${leanMass} kg</span><span class="bc-label">Lean Mass</span></div>
        <div class="bc-stat"><span class="bc-val">${fatMass} kg</span><span class="bc-label">Fat Mass</span></div>
        <div class="bc-stat"><span class="bc-val">${category}</span><span class="bc-label">Category</span></div>
      </div>
    `
      : renderWaistSummary(_waistSeries(
        (rows || []).filter((r) => r.date !== d).concat([fila]), wellness));
    toast(`Waist ${waist} cm saved`);
    try { await renderBodyWeightChart(); } catch (e) { console.warn('[Peso] gráfico:', e); }
  });
}

// Resumen del historico de cintura: valor actual, delta contra la medicion mas reciente que
// este al menos WAIST_MIN_DELTA_DAYS antes, y las ultimas mediciones. Devuelve HTML.
function renderWaistSummary(waistLog) {
  if (!waistLog || !waistLog.length) {
    return '<span class="muted" style="font-size:12px">No measurements yet. The first one sets the baseline.</span>';
  }
  const last = waistLog[waistLog.length - 1];
  const lastMs = new Date(last.date + 'T00:00:00').getTime();

  let ref = null;
  for (let k = waistLog.length - 2; k >= 0; k--) {
    const days = Math.round((lastMs - new Date(waistLog[k].date + 'T00:00:00').getTime()) / 86400000);
    if (days >= WAIST_MIN_DELTA_DAYS) { ref = Object.assign({}, waistLog[k], { days }); break; }
  }

  let deltaHtml = '<span class="muted" style="font-size:12px">Delta available after ~2 weeks</span>';
  if (ref) {
    const delta = Math.round((Number(last.waist) - Number(ref.waist)) * 10) / 10;
    const color = delta < -0.05 ? 'var(--accent)' : (delta > 0.05 ? 'var(--red)' : 'var(--text2)');
    const sign = delta > 0 ? '+' : '';
    deltaHtml = `<span style="color:${color};font-size:12px"><b>${sign}${delta.toFixed(1)} cm</b> in ${ref.days} days</span>`;
  }

  const recent = waistLog.slice(-6).reverse().map(e => {
    const bf = Number(e.bfPct) > 0 ? ` &middot; ${Number(e.bfPct).toFixed(1)}%` : '';
    // F-14: de dónde sale la medida. `abdomen` de intervals.icu cuenta para la serie, pero el
    // usuario tiene que poder distinguir lo que midió él de lo que llegó del reloj.
    const src = e.source === 'intervals.icu' ? ' <span class="muted">· icu</span>' : '';
    return `<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px"><span class="muted">${e.date}</span><span>${Number(e.waist).toFixed(1)} cm${bf}${src}</span></div>`;
  }).join('');

  return `
    <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:6px">
      <span style="font-size:22px;font-weight:600">${Number(last.waist).toFixed(1)} cm</span>
      ${deltaHtml}
    </div>
    <div style="border-top:1px solid var(--border);padding-top:6px">${recent}</div>
  `;
}

// ==================== WEEKLY TRAINING SUMMARY ====================
async function renderWeeklySummary() {
  const container = document.getElementById('weekly-summary');
  if (!container) return;

  let workouts, runs;
  try {
    workouts = await dbGetAll('workouts');
    runs = await getRunsDeduped();
  } catch (e) {
    console.warn('[Semana] resumen:', e);
    showErrorState(container, 'Could not read this week\'s sessions.', renderWeeklySummary);
    return;
  }

  // Filter by ISO-week date range (Mon-Sun) instead of the saved w.week
  // field. Retroactive logs and program-week vs ISO-week mismatches were
  // dropping 1-2 sessions from this counter.
  const weekDates = getWeekDates().map(d => dateStr(d));
  const thisWeek = workouts.filter(w => weekDates.includes(w.date));
  const thisWeekRuns = runs.filter(r => weekDates.includes(r.date));

  // Total volume
  let totalVolume = 0;
  let totalSets = 0;
  const muscleSets = {};
  const prs = [];

  thisWeek.forEach(w => {
    w.exercises.forEach(ex => {
      const muscle = getExerciseMuscle(ex.exerciseId);
      totalVolume += volumeForExercise(ex, w.unit);
      ex.sets.filter(s => s.done).forEach(() => {
        totalSets++;
        if (muscle) muscleSets[muscle] = (muscleSets[muscle] || 0) + 1;
      });
    });
  });

  const totalKm = thisWeekRuns.reduce((sum, r) => sum + (r.distance || 0), 0);
  const adherence = thisWeek.length;
  const planned = Object.values(activeWeekTemplate).filter(d => d.type === 'gym').length;

  container.innerHTML = `
    <div class="ws-grid">
      <div class="ws-stat"><span class="ws-val">${adherence}/${planned}</span><span class="ws-tile-label">Sessions</span></div>
      <div class="ws-stat"><span class="ws-val">${totalSets}</span><span class="ws-tile-label">Total Sets</span></div>
      <div class="ws-stat"><span class="ws-val">${Math.round(totalVolume / 1000)}k</span><span class="ws-tile-label">Volume (${state.settings.unit})</span></div>
      <div class="ws-stat"><span class="ws-val">${totalKm.toFixed(1)}</span><span class="ws-tile-label">Run km</span></div>
    </div>
  `;
}

// ==================== MACRO CALCULATOR ====================
function renderMacroCalculator() {
  const container = document.getElementById('macro-calc-section');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <div style="flex:1;min-width:70px"><label class="muted" style="font-size:11px">Weight (kg)</label><input type="number" id="mc-weight" inputmode="decimal" step="0.1" placeholder="82" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px"></div>
      <div style="flex:1;min-width:100px"><label class="muted" style="font-size:11px">Goal</label>
        <select id="mc-goal" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px">
          <option value="cut">Fat Loss</option>
          <option value="maintain">Maintain</option>
          <option value="bulk">Muscle Gain</option>
        </select>
      </div>
      <div style="flex:1;min-width:100px"><label class="muted" style="font-size:11px">Activity</label>
        <select id="mc-activity" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px">
          <option value="1.4">Sedentary</option>
          <option value="1.55" selected>Moderate (3-4x/wk)</option>
          <option value="1.7">Active (5-6x/wk)</option>
          <option value="1.9">Very Active</option>
        </select>
      </div>
    </div>
    <button id="btn-calc-macros" class="btn-secondary" style="width:100%;text-align:center">Calculate Macros</button>
    <div id="mc-result" style="margin-top:10px"></div>
  `;

  document.getElementById('btn-calc-macros').addEventListener('click', () => {
    const weight = parseFloat(document.getElementById('mc-weight').value);
    const goal = document.getElementById('mc-goal').value;
    const activity = parseFloat(document.getElementById('mc-activity').value);

    if (!weight) {
      document.getElementById('mc-result').innerHTML = '<span class="muted">Enter your weight</span>';
      return;
    }

    // Mifflin-St Jeor estimate (male, assume height ~178, age ~30)
    const bmr = 10 * weight + 6.25 * 178 - 5 * 30 + 5;
    const tdee = Math.round(bmr * activity);
    const deficit = goal === 'cut' ? -400 : (goal === 'bulk' ? 300 : 0);
    const calories = tdee + deficit;

    // Macros
    const protein = Math.round(weight * 2); // 2g/kg
    const fat = Math.round(weight * 0.9); // 0.9g/kg
    const proteinCal = protein * 4;
    const fatCal = fat * 9;
    const carbCal = calories - proteinCal - fatCal;
    const carbs = Math.max(0, Math.round(carbCal / 4));

    document.getElementById('mc-result').innerHTML = `
      <div class="mc-summary">Target: <strong>${calories} kcal/day</strong> (TDEE ${tdee} ${deficit > 0 ? '+' : ''}${deficit})</div>
      <div class="mc-macros">
        <div class="mc-macro"><div class="mc-bar" style="background:var(--accent);height:${Math.round(proteinCal/calories*60)}px"></div><span class="mc-val">${protein}g</span><span class="mc-label">Protein</span></div>
        <div class="mc-macro"><div class="mc-bar" style="background:var(--yellow);height:${Math.round(fatCal/calories*60)}px"></div><span class="mc-val">${fat}g</span><span class="mc-label">Fat</span></div>
        <div class="mc-macro"><div class="mc-bar" style="background:var(--blue);height:${Math.round(carbCal/calories*60)}px"></div><span class="mc-val">${carbs}g</span><span class="mc-label">Carbs</span></div>
      </div>
    `;
  });
}

function getExerciseMuscle(exId) {
  if (exerciseLibrary[exId]) return exerciseLibrary[exId].muscle;
  for (const session of Object.values(activePlan.sessions)) {
    const ex = session.exercises.find(e => e.id === exId);
    if (ex) return ex.muscle;
  }
  return null;
}

// ==================== REST TIMER ====================
// Singleton AudioContext — iOS PWA requires creation/resume from a user gesture.
// We unlock it once per session in primeAudio() (called from startWorkout) so the
// rest-timer end cue is reliably audible even after backgrounding.
let _audioCtx = null;
function primeAudio() {
  try {
    if (!_audioCtx) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      _audioCtx = new Ctor();
    }
    if (_audioCtx.state === 'suspended') _audioCtx.resume();
  } catch { /* audio not available */ }
}

// HTML5 audio path — more reliable on iOS PWA standalone than Web Audio.
// We render the 3-beep pattern once via OfflineAudioContext into a WAV
// Blob, then play it via an <audio> element. This must be unlocked from a
// user gesture; prepareBeepAudio() is called in startWorkout / startMobilityRoutine.
let _beepAudioEl = null;
let _beepUnlocked = false;

function audioBufferToWavBlob(buffer) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, len - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * 2, true);
  view.setUint16(32, numCh * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, buffer.length * numCh * 2, true);
  let off = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      off += 2;
    }
  }
  return new Blob([ab], { type: 'audio/wav' });
}

async function prepareBeepAudio() {
  if (_beepAudioEl && _beepUnlocked) return;
  try {
    const Ctor = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!Ctor) return;
    const sr = 44100;
    const dur = 0.85;
    const offline = new Ctor(1, Math.ceil(sr * dur), sr);
    const beep = (freq, start, length) => {
      const osc = offline.createOscillator();
      const gain = offline.createGain();
      osc.frequency.value = freq;
      // Quick attack/release envelope to avoid clicks
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.5, start + 0.01);
      gain.gain.setValueAtTime(0.5, start + length - 0.02);
      gain.gain.linearRampToValueAtTime(0, start + length);
      osc.connect(gain); gain.connect(offline.destination);
      osc.start(start);
      osc.stop(start + length);
    };
    beep(880, 0, 0.15);
    beep(880, 0.25, 0.15);
    beep(1320, 0.5, 0.30);
    const buf = await offline.startRendering();
    const blob = audioBufferToWavBlob(buf);
    const url = URL.createObjectURL(blob);
    if (!_beepAudioEl) {
      _beepAudioEl = new Audio();
      _beepAudioEl.preload = 'auto';
    }
    _beepAudioEl.src = url;
    // Unlock by playing muted then pausing — must be from user gesture.
    _beepAudioEl.muted = true;
    const p = _beepAudioEl.play();
    if (p && p.then) {
      p.then(() => {
        _beepAudioEl.pause();
        _beepAudioEl.currentTime = 0;
        _beepAudioEl.muted = false;
        _beepUnlocked = true;
      }).catch(() => { /* unlock failed; fallback path will still try */ });
    } else {
      _beepAudioEl.pause();
      _beepAudioEl.muted = false;
      _beepUnlocked = true;
    }
  } catch (e) {
    console.warn('prepareBeepAudio failed', e);
  }
}

function playTimerBeep() {
  if (state.settings && state.settings.audioFeedback === false) return;
  // Try HTML5 audio first (more reliable on iOS PWA)
  if (_beepAudioEl && _beepUnlocked) {
    try {
      _beepAudioEl.currentTime = 0;
      const p = _beepAudioEl.play();
      if (p && p.catch) p.catch(e => console.warn('HTML5 beep failed, falling back to oscillator', e));
      return;
    } catch (e) {
      console.warn('HTML5 beep error, falling back to oscillator', e);
    }
  }
  // Fallback: Web Audio oscillator
  try {
    primeAudio();
    const ctx = _audioCtx;
    if (!ctx) return;
    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.4;
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    beep(880, 0, 0.15);
    beep(880, 0.25, 0.15);
    beep(1320, 0.5, 0.3);
  } catch (e) { console.warn('Timer beep failed', e); }
}

// Visual cue when the rest timer ends — replaces vibration which iOS
// Safari doesn't implement. Whole-screen green flash for ~1 second.
function flashTimerScreen() {
  const el = document.getElementById('timer-flash');
  if (!el) return;
  el.classList.remove('flash');
  void el.offsetWidth; // restart animation if it was already running
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1100);
}

function startRestTimer(seconds, autoStart = false) {
  // Re-arm AudioContext on every fresh user gesture (set-completion tap).
  // iOS PWA suspends the context after backgrounding/lock; resuming here
  // is the most reliable way to keep the end-of-rest beep audible.
  primeAudio();

  state.restTimerTotal = seconds;
  state.restTimerRemaining = seconds;
  state.restTimerRunning = false;
  state.restTimerEndAt = null; // wall-clock target (set when countdown begins)

  const bar = document.getElementById('rest-timer-bar');
  const textEl = document.getElementById('timer-text');
  const labelEl = document.getElementById('timer-label');
  const ringFill = document.getElementById('timer-ring-fill');
  const timerDisplay = document.getElementById('timer-display');
  // Sticky-bar ring: r=15 → circumference = 2π × 15 ≈ 94.25
  const circumference = 2 * Math.PI * 15;
  ringFill.setAttribute('stroke-dasharray', circumference.toFixed(2));
  ringFill.style.strokeDashoffset = '0';
  bar.classList.remove('urgent');

  bar.classList.remove('hidden');
  if (state.restTimerInterval) clearInterval(state.restTimerInterval);

  // Remove previous visibility handler if any
  if (state._timerVisHandler) {
    document.removeEventListener('visibilitychange', state._timerVisHandler);
    state._timerVisHandler = null;
  }

  function syncFromClock() {
    if (!state.restTimerEndAt) return;
    const remaining = Math.round((state.restTimerEndAt - Date.now()) / 1000);
    state.restTimerRemaining = Math.max(remaining, 0);
  }

  function updateDisplay() {
    const min = Math.floor(state.restTimerRemaining / 60);
    const sec = state.restTimerRemaining % 60;
    textEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    const progress = 1 - (state.restTimerRemaining / state.restTimerTotal);
    ringFill.style.strokeDashoffset = circumference * (1 - progress);
    // Pulse / change color when ≤ 5s remaining so it's glanceable from peripheral vision
    bar.classList.toggle('urgent', state.restTimerRemaining > 0 && state.restTimerRemaining <= 5);
  }

  function finishTimer() {
    clearInterval(state.restTimerInterval);
    state.restTimerRemaining = 0;
    state.restTimerRunning = false;
    state.restTimerEndAt = null;
    updateDisplay();
    labelEl.textContent = 'DONE';
    playTimerBeep();
    flashTimerScreen();
    setTimeout(() => {
      bar.classList.add('hidden');
      bar.classList.remove('urgent');
    }, 1200);
  }

  function beginCountdown() {
    if (state.restTimerRunning) return;
    state.restTimerRunning = true;
    state.restTimerEndAt = Date.now() + seconds * 1000;
    labelEl.textContent = 'REST';
    timerDisplay.style.cursor = 'default';

    state.restTimerInterval = setInterval(() => {
      syncFromClock();
      if (state.restTimerRemaining <= 0) {
        finishTimer();
        return;
      }
      updateDisplay();
    }, 1000);

    // When app returns from background, immediately sync with real clock
    state._timerVisHandler = () => {
      if (document.visibilityState === 'visible' && state.restTimerRunning) {
        syncFromClock();
        if (state.restTimerRemaining <= 0) {
          finishTimer();
        } else {
          updateDisplay();
        }
      }
    };
    document.addEventListener('visibilitychange', state._timerVisHandler);
  }

  updateDisplay();

  // Remove old listener if any
  if (state._timerTapHandler) timerDisplay.removeEventListener('click', state._timerTapHandler);

  if (autoStart) {
    // Auto-triggered by set check: start immediately
    beginCountdown();
  } else {
    // Manual trigger: wait for tap
    labelEl.textContent = '▶ TAP TO START';
    timerDisplay.style.cursor = 'pointer';
    state._timerTapHandler = beginCountdown;
    timerDisplay.addEventListener('click', state._timerTapHandler);
  }
}

function stopRestTimer() {
  if (state.restTimerInterval) clearInterval(state.restTimerInterval);
  if (state._timerVisHandler) {
    document.removeEventListener('visibilitychange', state._timerVisHandler);
    state._timerVisHandler = null;
  }
  state.restTimerRunning = false;
  state.restTimerEndAt = null;
  const bar = document.getElementById('rest-timer-bar');
  if (bar) {
    bar.classList.add('hidden');
    bar.classList.remove('urgent');
  }
}

// ==================== RUNNING MODULE ====================
async function renderRunPlanBanner() {
  const banner = document.getElementById('run-plan-banner');
  if (!banner) return;
  let planned = null;
  try { planned = await getPlannedSessionForDate(new Date()); } catch (e) {}

  if (planned && planned.type === 'run') {
    const hr = planned.hrTarget ? `FC ${planned.hrTarget}` : cardioIntensityGuide(planned.subtype);
    // v11.56: los minutos ya vienen progresados por la semana del bloque; el badge dice de dónde
    // salen. `_cardioDurLabel` mete un <span>, y el badge es texto plano, así que se compone aparte.
    const durTxt = planned.durationMin
      ? `${planned.durationMin} min` + ((planned.durationSource === 'rule' && planned.baseMin && planned.baseMin !== planned.durationMin && planned.block && planned.block.index)
          ? ` (${planned.baseMin}' base · week ${planned.block.index})`
          : (planned.durationSource === 'coach' ? ' (coach)' : ''))
      : '';
    // v11.60: la dosis de la fase manda en el badge. Con kilómetros se dicen los kilómetros;
    // en trote/caminata, el patrón — que es lo único que se puede ejecutar sin pensar.
    const kmTxt = planned.distanceKm ? `${String(planned.distanceKm)} km` : '';
    const badge = [kmTxt || durTxt, planned.pattern, planned.subtitle, hr].filter(Boolean).join(' · ');
    const fase = (typeof runningPhaseLabel === 'function') ? runningPhaseLabel(planned) : '';
    banner.innerHTML = `
      <div class="rpb-title">Today: ${planned.name}</div>
      <div class="rpb-detail">${escapeHtml(planned.summary || planned.subtitle || '')}</div>
      ${_blockEyebrowHtml(planned.block)}
      ${fase ? `<div class="plan-block-eyebrow">${fase}</div>` : ''}
      <span class="rpb-badge">${badge}</span>
      <button class="btn-secondary btn-full" id="rpb-push-icu" style="margin-top:10px;text-align:center">Send to intervals.icu</button>
    `;
    const b = banner.querySelector('#rpb-push-icu');
    if (b) b.addEventListener('click', () => pushCardioToIntervalsIcu());
  } else {
    const wk = getWeekNumber();
    banner.innerHTML = `
      <div class="rpb-title">Cardio</div>
      <div class="rpb-detail">No cardio planned today — you can still log a session (bike/row/treadmill/walk).</div>
      <span class="rpb-badge">Week ${wk} · Zone 2 most days</span>
    `;
  }
}

// T5.1: unified Cardio logger — any modality (run/treadmill/bike/row/ski/walk) + intensity.
// Writes to the 'sessions' store (T1 envelope). Legacy 'runs' still render via toSession().
async function logCardio() {
  const modality = document.getElementById('cardio-modality').value;   // run_outdoor|treadmill|bike|row|ski|walk
  const intensity = document.getElementById('cardio-intensity').value; // zone2|long_easy|zone3|threshold|intervals
  const duration = parseInt(document.getElementById('cardio-duration').value) || null;
  const distance = parseFloat(document.getElementById('cardio-distance').value) || null;
  const hr = parseInt(document.getElementById('cardio-hr').value) || null;
  const feel = getStarValue('cardio-feel');
  const notes = document.getElementById('cardio-notes').value.trim();
  if (!duration && !distance) { toast('Enter a duration or a distance'); return; }

  const isWalk = modality === 'walk';
  const family = isWalk ? 'recovery' : 'cardio';
  const subtype = isWalk ? 'walk' : intensity;
  const meta = (typeof sessionSubtypeMeta === 'function' && sessionSubtypeMeta(family, subtype)) || {};
  const MOD = { run_outdoor: 'Run', treadmill: 'Treadmill', bike: 'Bike', row: 'Row', ski: 'SkiErg', walk: 'Walk' };
  const INT = { zone2: 'Z2', long_easy: 'Long Z2', zone3: 'Z3', threshold: 'Threshold', intervals: 'Intervals' };
  const title = isWalk ? 'Walk (recovery)' : `${MOD[modality] || 'Cardio'} · ${INT[subtype] || 'Z2'}`;

  const rec = {
    id: uid(), date: today(), ts: Date.now(),
    family, subtype, sessionType: `${family}.${subtype}`,
    modality, title,
    durationMin: duration, distance, avgHR: hr,
    perceivedEffort: feel,
    evidenceTags: meta.evidenceTags || [],
    budgetWeight: meta.budgetWeight != null ? meta.budgetWeight : 0,
    notes, source: 'manual', week: getWeekNumber(),
  };
  // V-9: registrar cardio tampoco podía fallar en silencio.
  try {
    await smartPut('sessions', rec);
  } catch (e) {
    console.warn('[Cardio] registrar sesión:', e);
    toast(`Something went wrong logging the session: ${(e && e.message) || 'storage error'}`);
    return;
  }
  state._lastCardioDate = null; state._runningWeek = null;   // v11.56: invalida la caché de "días sin cardio"

  document.getElementById('cardio-duration').value = '';
  document.getElementById('cardio-distance').value = '';
  document.getElementById('cardio-hr').value = '';
  document.getElementById('cardio-notes').value = '';
  setStarValue('cardio-feel', 3);
  toast(`${title} logged`);
  renderSessionHistory();
  try { renderRunTotals(); } catch (e) { console.warn('[Cardio] totales:', e); }
}

// T2 (v11.20): render recently-logged non-run cardio + recovery sessions in the
// Run tab. Reads the 'sessions' store, normalizes via the T1 adapter.
// v11.77 (punto 9) · UN icono por MODALIDAD. Julian: "los logos de Ride, Row son iguales que
// los de Run, deberíamos poner otro logito". Y era literal: `renderSessionHistory` tenía una rama
// binaria por FAMILIA (cardio → corredor, recuperación → sol), así que una salida en bici, una de
// remo y una de ski salían las tres con el mismo muñeco corriendo. Los emoji ya existían en la
// app para esto mismo (el selector de envío a intervals.icu), así que no se inventa un juego
// nuevo: se usa el que ya se reconoce.
const CARDIO_ICON = {
  run_outdoor: '🏃', treadmill: '🏃', bike: '🚴', row: '🚣', ski: '⛷️',
  elliptical: '🌀', swim: '🏊', walk: '🚶',
};
const CARDIO_ICON_TINT = {
  bike: ['var(--tint-orange)', 'var(--orange)'],
  row: ['var(--tint-teal)', 'var(--teal)'],
  ski: ['var(--tint-purple)', 'var(--purple)'],
  walk: ['var(--tint-teal)', 'var(--teal)'],
};
function cardioIconFor(modality, family) {
  const icono = CARDIO_ICON[modality] || (family === 'recovery' ? '🚶' : '🏃');
  const tinte = CARDIO_ICON_TINT[modality] || (family === 'recovery' ? ['var(--tint-teal)', 'var(--teal)'] : ['var(--tint-blue)', 'var(--blue)']);
  return { icono, bg: tinte[0], fg: tinte[1] };
}

async function renderSessionHistory() {
  const container = document.getElementById('sess-history');
  if (!container) return;
  // UNA lista. Antes había dos: ésta leía `sessions` (bici, remo, ski, caminata) y "Runs
  // (history)" leía `runs` (las carreras), con los totales en medio. Julian: "en Cardio debería
  // aparecer todo junto en Recent Cardio, tanto runs como cycling como rows". Las dos fuentes ya
  // vienen dedupeadas de fábrica (`getRunsDeduped`/`getSessionsDeduped`): la misma actividad del
  // COROS llega por Strava y por intervals.icu, y juntarlas sin dedupe la habría duplicado.
  const [runs, sesiones] = await Promise.all([
    (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
    (typeof getSessionsDeduped === 'function' ? getSessionsDeduped() : dbGetAll('sessions')).catch(() => []),
  ]);
  const filas = []
    .concat((sesiones || []).map((x) => {
      const sess = (typeof toSession === 'function') ? toSession(x, 'sessions') : x;
      return { kind: 'session', id: sess.id, date: sess.date, title: sess.title || 'Session',
        distance: sess.distance, durationMin: sess.durationMin, week: sess.week,
        feel: sess.perceivedEffort, modality: sess.modality || null, family: sess.family || 'cardio' };
    }))
    .concat((runs || []).map((r) => ({
      kind: 'run', id: r.id, date: r.date,
      title: r.avgPace ? `Run · ${r.avgPace}/km` : 'Run',
      distance: r.distance, durationMin: r.duration ? Math.round(durationToMinutes(r.duration)) : null,
      week: r.week, feel: null, modality: 'run_outdoor', family: 'cardio',
    })))
    .filter((f) => f && f.date)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .slice(0, 14);
  if (!filas.length) {
    if (typeof showEmptyState === 'function') showEmptyState(container, '🏃', 'No cardio yet', 'Runs, rides, rows and ski sessions all land here.');
    else container.innerHTML = '';
    return;
  }
  container.innerHTML = filas.map(sess => {
    const ic = cardioIconFor(sess.modality, sess.family);
    const dist = sess.distance != null ? ` · ${sess.distance} km` : '';
    const dur = sess.durationMin != null ? `${sess.durationMin} min` : '';
    return `
    <div class="history-item">
      <div class="hi-icon hi-icon-emoji" style="background:${ic.bg};color:${ic.fg}">${ic.icono}</div>
      <div class="hi-left">
        <div class="hi-title">${escapeHtml(sess.title)}${dist}</div>
        <div class="hi-sub">${formatDate(sess.date)}${dur ? ` · ${dur}` : ''}${sess.week ? ` · Wk ${sess.week}` : ''}</div>
      </div>
      <div class="hi-right">
        ${sess.feel ? `<div><div class="hi-stat">${sess.feel}/5</div><div class="hi-stat-sub">feel</div></div>` : ''}
        ${sess.kind === 'session' ? `<button class="hi-delete" data-delete-session="${sess.id}" aria-label="Delete session">&times;</button>` : ''}
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('[data-delete-session]').forEach(btn => {
    btn.addEventListener('click', async () => {
      try { await dbDelete('sessions', btn.dataset.deleteSession); } catch (e) { console.warn(e); }
      renderSessionHistory();
    });
  });
}

// ==================== MOBILITY (v10.5) ====================
// Counts of mobility sessions per local date — used by the mobility streak and views
async function getMobilityCountsByDate() {
  const sessions = await dbGetAll('mobility_sessions');
  const counts = {};
  sessions.forEach(s => { if (s.date) counts[s.date] = (counts[s.date] || 0) + 1; });
  return counts;
}

async function getMobilityStreak() {
  const counts = await getMobilityCountsByDate();
  // Walk back from today until we find a day without a session
  let streak = 0;
  const d = new Date();
  // If today has none, start counting from yesterday (a streak shouldn't break mid-day)
  if (!counts[dateStr(d)]) d.setDate(d.getDate() - 1);
  while (counts[dateStr(d)]) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// Inline icon (sparkles / movement) for mobility cards
const ICON_MOBILITY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M3 12h3M18 12h3M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>`;
const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="6 4 20 12 6 20 6 4"/></svg>`;

function openMobilityView() {
  enterSecondaryView('mobility');
  renderMobilityView();
}

async function renderMobilityView() {
  // Streak card
  const streakContainer = document.getElementById('mobility-streak-card');
  if (streakContainer) {
    const streak = await getMobilityStreak();
    const counts = await getMobilityCountsByDate();
    const totalSessions = Object.values(counts).reduce((a, b) => a + b, 0);
    streakContainer.innerHTML = `
      <div class="card mob-streak-card">
        <div class="mob-streak-row">
          <div class="mob-streak-stat">
            <div class="mob-streak-num">${streak}</div>
            <div class="mob-streak-label">Day streak</div>
          </div>
          <div class="mob-streak-divider"></div>
          <div class="mob-streak-stat">
            <div class="mob-streak-num">${totalSessions}</div>
            <div class="mob-streak-label">Total sessions</div>
          </div>
        </div>
      </div>
    `;
  }

  // Routines list
  const routinesContainer = document.getElementById('mobility-routines-list');
  if (routinesContainer) {
    const today_dow = new Date().getDay();
    const recommended = getRecommendedMobilityToday();
    routinesContainer.innerHTML = '<div class="card-stack">' + Object.values(MOBILITY_LIBRARY).map(r => {
      const cv = mobilityColorVars(r.color);
      const isReco = r.id === recommended.id;
      return `
        <div class="card mob-routine-card" data-routine-id="${r.id}">
          <div class="mob-routine-icon" style="background:${cv.tint};color:${cv.color}">${ICON_MOBILITY}</div>
          <div class="mob-routine-body">
            <div class="mob-routine-name">${r.name}${isReco ? ' <span class="mob-reco-pill">Today</span>' : ''}</div>
            <div class="mob-routine-meta">${r.duration} min · ${r.exercises.length} exercises</div>
            <div class="mob-routine-desc">${r.description}</div>
          </div>
          <button class="mob-routine-start" style="background:${cv.color}" data-start-routine="${r.id}">${ICON_PLAY}</button>
        </div>
      `;
    }).join('') + '</div>';
    routinesContainer.querySelectorAll('[data-start-routine]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        startMobilityRoutine(btn.dataset.startRoutine);
      });
    });
  }

  // Pain trend (last 14 days, avg painAfter per day)
  await renderMobilityPainTrend();

  // History
  await renderMobilityHistory();
}

async function renderMobilityPainTrend() {
  const container = document.getElementById('mobility-pain-trend');
  if (!container) return;
  const sessions = (await dbGetAll('mobility_sessions')).sort((a, b) => a.date.localeCompare(b.date));
  if (sessions.length === 0) {
    container.innerHTML = '<div class="empty-state">No pain data yet. Log a mobility session to start tracking.</div>';
    return;
  }
  // Group by date, average painAfter
  const byDate = {};
  sessions.forEach(s => {
    if (s.painAfter == null) return;
    if (!byDate[s.date]) byDate[s.date] = [];
    byDate[s.date].push(s.painAfter);
  });
  const dates = Object.keys(byDate).sort().slice(-14);
  if (dates.length < 2) {
    container.innerHTML = '<div class="empty-state">Need 2+ sessions with pain rating for trend.</div>';
    return;
  }
  const labels = dates.map(d => formatDate(d));
  const values = dates.map(d => {
    const arr = byDate[d];
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length * 10) / 10;
  });
  // Reuse existing renderLineChart helper
  container.innerHTML = renderLineChart(labels, values, { color: 'var(--purple)', height: 130, showDots: true, min: 1, max: 5 });
}

async function renderMobilityHistory() {
  const container = document.getElementById('mobility-history');
  if (!container) return;
  const sessions = (await dbGetAll('mobility_sessions')).sort((a, b) => b.createdAt - a.createdAt).slice(0, 12);
  if (sessions.length === 0) {
    container.innerHTML = '<div class="empty-state">No sessions yet</div>';
    return;
  }
  container.innerHTML = sessions.map(s => {
    const routine = MOBILITY_LIBRARY[s.routineId] || { color: 'teal' };
    const cv = mobilityColorVars(routine.color);
    const painDelta = (s.painBefore != null && s.painAfter != null) ? s.painBefore - s.painAfter : null;
    const painLabel = painDelta != null ? (painDelta > 0 ? `↓ ${painDelta}` : (painDelta < 0 ? `↑ ${-painDelta}` : '=')) : '—';
    const painCls = painDelta > 0 ? 'pos' : (painDelta < 0 ? 'neg' : 'neutral');
    return `
      <div class="history-item" data-mob-session="${s.id}">
        <div class="hi-icon" style="background:${cv.tint};color:${cv.color}">${ICON_MOBILITY}</div>
        <div class="hi-left">
          <div class="hi-title">${s.routineName}</div>
          <div class="hi-sub">${formatDate(s.date)} · ${s.durationMin} min · pain ${s.painBefore ?? '—'} → ${s.painAfter ?? '—'}</div>
        </div>
        <div class="hi-right">
          <div>
            <div class="hi-stat bt-delta ${painCls}">${painLabel}</div>
            <div class="hi-stat-sub">pain</div>
          </div>
          <button class="hi-delete" data-delete-mob="${s.id}" aria-label="Delete mobility session">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-delete-mob]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.deleteMob;
      const removed = await dbGet('mobility_sessions', id);
      await smartDelete('mobility_sessions', id);
      renderMobilityView();
      toast('Mobility session deleted', {
        label: 'Undo',
        callback: async () => {
          if (removed) {
            await smartPut('mobility_sessions', removed);
            renderMobilityView();
          }
        }
      });
    });
  });
}

// ==================== MOBILITY VIDEO EMBED ====================
// YouTube embed (autoplay + mute + loop + no controls + playsinline) so the
// video acts like a moving GIF demo. Falls back to a static placeholder when
// the user is offline or when no youtubeId is set for the exercise.
function renderMobilityVideo(ex) {
  if (!ex.youtubeId || !navigator.onLine) {
    const reason = !ex.youtubeId ? 'No demo video set' : 'Offline · video unavailable';
    return `
      <div class="mob-video-fallback">
        <div class="mob-video-fallback-icon">${ICON_MOBILITY}</div>
        <div class="mob-video-fallback-text">${reason}</div>
        <div class="mob-video-fallback-sub">Follow the instructions below</div>
      </div>
    `;
  }
  const id = ex.youtubeId;
  const src = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}&controls=0&playsinline=1&modestbranding=1&rel=0&disablekb=1`;
  return `<iframe src="${src}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy" title="Exercise demo"></iframe>`;
}

// Re-render current exercise's video when network state changes
window.addEventListener('online', () => {
  if (state.activeMobility) {
    const ex = state.activeMobility.routine.exercises[state.activeMobility.exerciseIdx];
    const videoEl = document.getElementById('mob-active-video');
    if (videoEl && ex) videoEl.innerHTML = renderMobilityVideo(ex);
  }
});
window.addEventListener('offline', () => {
  if (state.activeMobility) {
    const ex = state.activeMobility.routine.exercises[state.activeMobility.exerciseIdx];
    const videoEl = document.getElementById('mob-active-video');
    if (videoEl && ex) videoEl.innerHTML = renderMobilityVideo(ex);
  }
});

// ==================== MOBILITY ACTIVE ROUTINE ====================
// Phase machine per exercise:
//   prep (5s)  → side1 (dur/2) → switch (2s, audio cue) → side2 (dur/2)   for perSide
//   prep (5s)  → hold  (full duration)                                     otherwise
const MOB_PREP_SEC = 5;
const MOB_SWITCH_SEC = 2;

// Distinct two-tone ascending cue (440 → 660 Hz) so the user clearly distinguishes
// "switch side" from the end-of-exercise/end-of-rest beep.
function playSwitchCue() {
  if (state.settings && state.settings.audioFeedback === false) return;
  try {
    primeAudio();
    const ctx = _audioCtx;
    if (!ctx) return;
    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.4;
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    beep(440, 0, 0.2);
    beep(660, 0.22, 0.3);
  } catch (e) { console.warn('Switch cue failed', e); }
}

async function startMobilityRoutine(routineId) {
  const routine = MOBILITY_LIBRARY[routineId];
  if (!routine) return;
  // Pain before prompt
  const painBefore = await askPainRating('How does your back feel right now?');
  if (painBefore === null) return; // cancelled
  // iOS PWA: prime audio on the user-gesture so the cue is audible later.
  primeAudio();
  prepareBeepAudio();
  state.activeMobility = {
    routineId,
    routine,
    painBefore,
    exerciseIdx: 0,
    startedAt: Date.now(),
    timerInterval: null,
    timerRemaining: 0,
    paused: false,
    phase: 'prep',
    phaseEndAt: null, // wall-clock target so background/lock doesn't drift
  };
  showView('mobility-active');
  runCurrentMobilityExercise();
}

// Build the ordered list of phases for an exercise.
function buildMobilityPhases(ex) {
  const phases = [{ name: 'prep', label: 'GET READY', seconds: MOB_PREP_SEC }];
  if (ex.perSide) {
    const half = Math.max(1, Math.round(ex.durationSec / 2));
    phases.push({ name: 'side1', label: 'LEFT SIDE', seconds: half });
    phases.push({ name: 'switch', label: 'SWITCH SIDE', seconds: MOB_SWITCH_SEC });
    phases.push({ name: 'side2', label: 'RIGHT SIDE', seconds: half });
  } else {
    phases.push({ name: 'hold', label: 'GO', seconds: ex.durationSec });
  }
  return phases;
}

function runCurrentMobilityExercise() {
  const am = state.activeMobility;
  if (!am) return;
  const ex = am.routine.exercises[am.exerciseIdx];
  if (!ex) { finishMobilityRoutine(); return; }

  // Update DOM (exercise-level info)
  document.getElementById('mob-active-num').textContent = `${am.exerciseIdx + 1} / ${am.routine.exercises.length}`;
  document.getElementById('mob-active-name').textContent = ex.name;
  document.getElementById('mob-active-reps').textContent = ex.reps;
  document.getElementById('mob-active-instructions').textContent = ex.instructions;
  const videoEl = document.getElementById('mob-active-video');
  if (videoEl) videoEl.innerHTML = renderMobilityVideo(ex);

  // Progress dots
  const dots = document.getElementById('mob-active-progress');
  if (dots) {
    dots.innerHTML = am.routine.exercises.map((_, i) => {
      const cls = i < am.exerciseIdx ? 'done' : (i === am.exerciseIdx ? 'current' : '');
      return `<span class="mob-dot ${cls}"></span>`;
    }).join('');
  }

  // Build phase queue and start at first phase (or resume from saved phase)
  am.phases = buildMobilityPhases(ex);
  // If restoring from save, am.phaseIdx + am.timerRemaining are already set;
  // otherwise start at phase 0 with full seconds.
  if (typeof am.phaseIdx !== 'number' || am.phaseIdx < 0 || am.phaseIdx >= am.phases.length) {
    am.phaseIdx = 0;
    am.timerRemaining = am.phases[0].seconds;
  }
  am.paused = false;
  const pauseBtn = document.getElementById('mob-pause-btn');
  if (pauseBtn) pauseBtn.textContent = 'Pause';

  startMobilityPhaseTick();
}

function startMobilityPhaseTick() {
  const am = state.activeMobility;
  if (!am) return;
  applyMobilityPhaseUI();
  if (am.timerInterval) clearInterval(am.timerInterval);
  am.phaseEndAt = Date.now() + am.timerRemaining * 1000;
  saveActiveMobility();

  am.timerInterval = setInterval(() => {
    if (state.activeMobility !== am) return;
    if (am.paused) {
      // While paused, push the wall-clock target forward so seconds don't bleed.
      am.phaseEndAt = Date.now() + am.timerRemaining * 1000;
      return;
    }
    am.timerRemaining = Math.max(0, Math.round((am.phaseEndAt - Date.now()) / 1000));
    updateMobilityTimerDisplay();
    if (am.timerRemaining <= 0) {
      clearInterval(am.timerInterval);
      am.timerInterval = null;
      advanceMobilityPhase();
    } else {
      // Persist roughly every tick so a crash/close keeps us within 1s.
      saveActiveMobility();
    }
  }, 1000);
  updateMobilityTimerDisplay();
}

function applyMobilityPhaseUI() {
  const am = state.activeMobility;
  if (!am) return;
  const phase = am.phases[am.phaseIdx];
  const phaseEl = document.getElementById('mob-active-phase');
  const labelEl = document.getElementById('mob-active-timer-label');
  const overlay = document.getElementById('mob-switch-overlay');
  if (phaseEl) {
    phaseEl.textContent = phase.label;
    phaseEl.className = 'mob-active-phase phase-' + phase.name;
  }
  if (labelEl) {
    labelEl.textContent = phase.name === 'prep' ? 'get ready' :
                          phase.name === 'switch' ? '' : 'seconds left';
  }
  // Switch overlay: show during switch phase
  if (overlay) {
    if (phase.name === 'switch') {
      overlay.classList.remove('hidden');
      playSwitchCue();
      // (No vibration — iOS Safari doesn't implement navigator.vibrate.)
    } else {
      overlay.classList.add('hidden');
    }
  }
}

function advanceMobilityPhase() {
  const am = state.activeMobility;
  if (!am) return;
  am.phaseIdx++;
  if (am.phaseIdx >= am.phases.length) {
    // End of exercise — advance to next. (No vibration — iOS Safari
    // doesn't implement navigator.vibrate.)
    am.phaseIdx = 0;
    advanceMobilityExercise();
    return;
  }
  am.timerRemaining = am.phases[am.phaseIdx].seconds;
  startMobilityPhaseTick();
}

function updateMobilityTimerDisplay() {
  const am = state.activeMobility;
  if (!am) return;
  const big = document.getElementById('mob-active-timer-big');
  const top = document.getElementById('mob-routine-timer');
  if (big) big.textContent = Math.max(0, am.timerRemaining);
  if (top) {
    const elapsed = Math.floor((Date.now() - am.startedAt) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    top.textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }
}

function advanceMobilityExercise() {
  const am = state.activeMobility;
  if (!am) return;
  if (am.timerInterval) { clearInterval(am.timerInterval); am.timerInterval = null; }
  am.exerciseIdx++;
  // Reset phase state so a Skip/auto-advance doesn't carry stale phase from prev exercise.
  am.phaseIdx = undefined;
  am.timerRemaining = 0;
  if (am.exerciseIdx >= am.routine.exercises.length) {
    finishMobilityRoutine();
  } else {
    runCurrentMobilityExercise();
  }
}

function pauseMobilityExercise() {
  const am = state.activeMobility;
  if (!am) return;
  am.paused = !am.paused;
  const pauseBtn = document.getElementById('mob-pause-btn');
  if (pauseBtn) pauseBtn.textContent = am.paused ? 'Resume' : 'Pause';
  if (!am.paused) {
    // On resume, recompute wall-clock target from current remaining
    am.phaseEndAt = Date.now() + am.timerRemaining * 1000;
  }
  saveActiveMobility();
}

// ----- Persistence (resume after accidental exit) -----
async function saveActiveMobility() {
  const am = state.activeMobility;
  if (!am) return;
  try {
    await dbPut('settings', {
      key: 'activeMobility',
      routineId: am.routineId,
      painBefore: am.painBefore,
      exerciseIdx: am.exerciseIdx,
      phaseIdx: am.phaseIdx,
      timerRemaining: am.timerRemaining,
      paused: am.paused,
      startedAt: am.startedAt,
      savedAt: Date.now(),
    });
  } catch (e) { console.warn('saveActiveMobility failed', e); }
}

async function clearActiveMobility() {
  try { await dbDelete('settings', 'activeMobility'); } catch {}
  const banner = document.getElementById('resume-mobility-banner');
  if (banner) { banner.classList.add('hidden'); banner.innerHTML = ''; }
}

async function restoreActiveMobility() {
  const saved = await dbGet('settings', 'activeMobility');
  if (!saved || !saved.routineId) return false;
  const routine = MOBILITY_LIBRARY[saved.routineId];
  if (!routine) { await clearActiveMobility(); return false; }
  primeAudio();
  state.activeMobility = {
    routineId: saved.routineId,
    routine,
    painBefore: saved.painBefore,
    exerciseIdx: saved.exerciseIdx || 0,
    startedAt: saved.startedAt || Date.now(),
    timerInterval: null,
    timerRemaining: saved.timerRemaining || 0,
    paused: !!saved.paused,
    phaseIdx: saved.phaseIdx || 0,
    phaseEndAt: null,
  };
  showView('mobility-active');
  runCurrentMobilityExercise();
  return true;
}

async function finishMobilityRoutine() {
  const am = state.activeMobility;
  if (!am) return;
  if (am.timerInterval) { clearInterval(am.timerInterval); am.timerInterval = null; }
  // Stop the video iframe so it doesn't keep loading in the background
  const videoEl = document.getElementById('mob-active-video');
  if (videoEl) videoEl.innerHTML = '';

  // Pain after prompt
  const painAfter = await askPainRating('How does it feel now?');
  // Save session even if user dismisses (painAfter null is OK)
  const session = {
    id: uid(),
    date: dateStr(new Date(am.startedAt)),
    routineId: am.routineId,
    routineName: am.routine.name,
    durationMin: am.routine.duration,
    painBefore: am.painBefore,
    painAfter: painAfter,
    notes: '',
    createdAt: Date.now(),
  };
  await smartPut('mobility_sessions', session);
  state.activeMobility = null;
  await clearActiveMobility();
  toast('Mobility done · streak +1');
  // Return to mobility view
  openMobilityView();
}

async function cancelMobilityRoutine() {
  const am = state.activeMobility;
  if (!am) return;
  if (!confirm('End this mobility routine? Progress will not be saved.')) return;
  if (am.timerInterval) clearInterval(am.timerInterval);
  // Stop the video iframe
  const videoEl = document.getElementById('mob-active-video');
  if (videoEl) videoEl.innerHTML = '';
  state.activeMobility = null;
  await clearActiveMobility();
  openMobilityView();
}

// Pain rating prompt — uses showActionSheet with 5 options. Returns 1-5 or null if cancelled.
async function askPainRating(prompt) {
  const choice = await showActionSheet(prompt, [
    { value: '1', label: '1 — No pain', icon: '😄' },
    { value: '2', label: '2 — Mild', icon: '🙂' },
    { value: '3', label: '3 — Moderate', icon: '😐' },
    { value: '4', label: '4 — Strong', icon: '😣' },
    { value: '5', label: '5 — Severe', icon: '😖' },
  ]);
  if (choice === null) return null;
  return parseInt(choice);
}

// ==================== HOME VIEW ORCHESTRATOR (v10.7) ====================
async function renderHomeView() {
  document.body.dataset.tab = 'home';
  renderHomeTopbar();
  // V-8: esqueleto ANTES de tocar IndexedDB en los tres bloques grandes. Con la base fría son
  // varios cientos de milisegundos con tres tarjetas en blanco, que se leen como "no hay
  // datos" y no como "todavía estoy leyendo".
  showHomeSkeletons();
  // B-5 (auditoría 2026-09-08): era `Promise.all`. El primer bloque que lanzaba cancelaba la
  // espera de los otros nueve y Home se quedaba a medio pintar EN SILENCIO — un fallo del
  // coach dejaba sin calendario, sin plan de hoy y sin cola. Con `allSettled` el bloque que
  // falla deja SU hueco vacío y se anota; los demás pintan.
  // V-7b: todo el pintado va dentro de un pase de render, así que los `dbGetAll` repetidos de
  // los bloques (eran doce de los mismos cuatro stores) se resuelven con una lectura cada uno.
  // V-9: los renderers de OTROS módulos entran por `safeCall`, que es la única forma de
  // llamarlos en toda la app (antes había tres sintaxis distintas para lo mismo).
  const bloques = [
    ['resume-banner', () => showResumeBanner()],
    ['plan-selector', () => renderPlanSelector()],       // T5.1 day-count selector (3/4/5/Ideal)
    ['week-calendar', () => renderWeekCalendar()],
    // Lectura del coach de la sesión de hoy (app/coach.js, v11.57). Por `safeCall` porque el
    // módulo se carga por <script> aparte: si no cargó, Home se pinta igual.
    ['coach-readout', () => safeCall('renderCoachReadout')],
    // Revisión semanal del coach (v11.61 · v11.65): qué pasó la semana pasada, en qué etapa
    // estoy, cuál es el foco y por qué cambia o por qué sigue igual. Desde v11.65 SIEMPRE
    // pinta: sin revisión ofrece "Cerrar semana ahora", que es de donde sale la primera.
    ['coach-week-card', () => safeCall('renderCoachWeekCard')],
    // Cómo viene el objetivo (v11.65): peso, pendiente, hito, carrera y anclas en dos líneas.
    ['coach-goal-line', () => safeCall('renderCoachGoalLine')],
    ['todays-plan', () => renderTodaysPlan()],
    // v11.65: el WHOOP de hoy es el tile `Readiness` del trío de estadísticas; el párrafo de
    // rendimiento y tendencias que vivía aquí se mudó a Stats › Today. Un dashboard de tarjetas
    // no se explica con una línea de texto suelta en medio.
    ['home-stat-trio', () => renderHomeStatTrio()],
    ['home-queue', () => renderHomeQueue()],
  ];
  beginRenderPass();
  try {
    const res = await Promise.allSettled(bloques.map(([, fn]) => fn()));
    res.forEach((r, i) => {
      if (r.status === 'rejected') console.warn(`[Home] ${bloques[i][0]}:`, r.reason);
    });
  } finally {
    endRenderPass();
  }
}

// ==================== HOME TOP BAR (Lovable) ====================
// "Today" eyebrow + weekday/date on the left; status dot, settings, avatar on the right.
//
// V-4 (auditoría 2026-09-08): la campana se va. Los tres botones hacían LO MISMO
// (`switchTab('settings')`) y la campana además prometía notificaciones que la app no manda:
// tres afordancias para un destino es peor que una, y una que miente es peor que dos.
// V-8: en su hueco entra el punto de estado, que es la única cosa que el topbar todavía no
// decía y que el usuario necesita saber ANTES de registrar algo — si está offline o si hay
// cola pendiente de subir. Antes vivía sólo en `#sync-warning`, en Stats, y sólo con
// cuarentena o con más de 24 h de retraso.
function renderHomeTopbar() {
  const el = document.getElementById('home-topbar');
  if (!el) return;
  const d = new Date();
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
  const datestr = d.toLocaleDateString('en-US', { day: 'numeric', month: 'long' });
  const initials = homeAvatarInitials();
  const gear = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  el.innerHTML = `
    <div class="ht-left">
      <div class="ht-eyebrow">Today</div>
      <div class="ht-date">${weekday} <span class="ht-date-sub">${datestr}</span></div>
    </div>
    <div class="ht-actions">
      <span class="ht-status ht-status-ok" id="ht-status" role="img" aria-label="Sync status" title="Sync status"></span>
      <button class="ht-icon" id="ht-settings" aria-label="Settings">${gear}</button>
      <button class="ht-avatar" id="ht-profile" aria-label="Profile">${initials}</button>
    </div>`;
  // El engranaje entra por Integraciones (`#integrations-card`), que es lo que se toca; el
  // avatar entra por Ajustes por arriba (la cuenta). Dos destinos distintos para dos gestos
  // distintos, en vez de tres botones al mismo sitio.
  el.querySelector('#ht-settings').addEventListener('click', () => openSettingsAt('integrations-card'));
  el.querySelector('#ht-profile').addEventListener('click', () => switchTab('settings'));
  renderTopbarStatusDot();
}

// V-5: las iniciales del avatar, sin nombre hard-coded.
// Estaba `'Julian Garmendia'` escrito en el fuente como fallback: el día que otra persona
// abriese la app vería las iniciales de Julian, y el día que Julian escriba su nombre en
// Ajustes el literal seguiría ahí sin que nadie sepa por qué. Orden: `settings.name` →
// iniciales del email de la sesión → 'JG'.
function homeAvatarInitials() {
  const name = String((state.settings && state.settings.name) || '').trim();
  if (name) {
    return (name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('') || 'JG').toUpperCase();
  }
  const local = String(state._authEmail || '').split('@')[0];
  const partes = local.split(/[._+-]+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return 'JG';
}

// El email de la sesión, cacheado en `state`: `getSupaUser()` es asíncrono y el topbar se
// pinta en el primer frame. Cuando llega, repinta — no antes.
async function primeAuthEmail() {
  if (state._authEmail !== undefined) return state._authEmail;
  state._authEmail = null;
  try {
    const u = (typeof getSupaUser === 'function') ? await getSupaUser() : null;
    state._authEmail = (u && u.email) || null;
  } catch (e) {
    console.warn('[auth] email de la sesión:', e);
    state._authEmail = null;
  }
  if (state._authEmail && !((state.settings && state.settings.name) || '').trim()) renderHomeTopbar();
  return state._authEmail;
}

// V-8: el punto de estado. Tres estados y un `title` que dice el motivo:
//   gris  — sin conexión: lo que registres se queda en el teléfono y sube después
//   ámbar — hay cola pendiente de subir (la app está online, pero algo no ha salido)
//   verde — al día
// Se repinta con `online`/`offline` y después de cada `syncAll`.
async function renderTopbarStatusDot() {
  const el = document.getElementById('ht-status');
  if (!el) return;
  let tone = 'ok';
  let title = 'Up to date';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    tone = 'off';
    title = 'Offline — what you log stays on the phone and uploads later';
  } else {
    let pendientes = 0;
    try {
      pendientes = (typeof syncPendingCount === 'function') ? await syncPendingCount() : 0;
    } catch (e) {
      console.warn('[Sync] pendientes:', e);
      pendientes = 0;
    }
    if (pendientes > 0) {
      tone = 'wait';
      title = `${pendientes} change${pendientes === 1 ? '' : 's'} waiting to upload`;
    }
  }
  el.className = `ht-status ht-status-${tone}`;
  el.setAttribute('title', title);
  el.setAttribute('aria-label', `Sync status: ${title}`);
}

// V-8: el estado de red cambia sin que nadie repinte Home, así que el punto se engancha a los
// dos eventos del navegador. `renderTopbarStatusDot` sale sola si el topbar no está montado.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('online', () => { renderTopbarStatusDot(); });
  window.addEventListener('offline', () => { renderTopbarStatusDot(); });
}

// V-8: los esqueletos de Home. Sólo los tres bloques grandes que esperan a IndexedDB —
// el calendario de la semana, la sesión de hoy y la cola. El topbar y el selector de plan
// se pintan desde `state`, así que un esqueleto allí sería un parpadeo gratis.
function showHomeSkeletons() {
  // v11.77: el trío de tiles sube a lo más alto de Home (decisión de Julian), así que es lo
  // primero que se ve vacío mientras carga. Sin esqueleto, Home abre con un hueco arriba.
  const bloques = [['home-stat-trio', 1], ['week-calendar', 3], ['todays-plan-card', 3], ['home-queue', 1]];
  for (const [id, n] of bloques) {
    const el = document.getElementById(id);
    if (el && !el.innerHTML) showSkeleton(el, n, 'line');
  }
}

// Idem en Stats: las tarjetas del grupo activo, que son las que el usuario está mirando.
function showStatsSkeletons(group) {
  const POR_GRUPO = {
    now: ['streak-row', 'readiness-signals', 'coach-goals'],
    week: ['hard-day-budget', 'weekly-summary', 'weekly-coach-card'],
    body: ['bw-metrics', 'steps-card', 'withings-comp'],
    strength: ['muscle-volume'],
  };
  for (const id of (POR_GRUPO[group] || POR_GRUPO.now)) {
    const el = document.getElementById(id);
    if (el && !el.innerHTML) showSkeleton(el, 2, 'line');
  }
}

// V-4: Ajustes con destino. El engranaje del topbar abre Ajustes y baja a la tarjeta que se
// va a tocar; sin ancla, "Integraciones" está a tres pantallas de scroll.
function openSettingsAt(anchorId) {
  switchTab('settings');
  if (!anchorId) return;
  // Un frame de margen: `switchTab` activa la vista y el scroll no existe hasta que se pinta.
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 120);
}

// RETIRADO en v11.62: `renderRecoveryHero()` — la tarjeta grande de WHOOP en Home. Sus
// mensajes ("Your body is ready for high strain today", "Low recovery. Prioritise rest")
// eran exactamente el consejo diario que el usuario rechazó el 2026-09-07. La recuperación
// sigue visible: una línea informativa en Home (`renderRecoveryLine`, coach.js) y la lista
// completa de señales en Stats › Today (`renderReadinessSignals`), más la tarjeta de WHOOP
// de Stats. Ninguna propone nada.

// Lucide-style inline icons for the recovery vitals
const ICON_ACTIVITY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>`;

// ==================== T3: TRAINING ADVISORY LAYER (v11.21) ====================
// Programming-intelligence layer, READ-ONLY. WHOOP = recovery source (not recomputed).
// Reads today's PLANNED session (current PLAN/WEEK_TEMPLATE — Base Plan Engine is T4),
// classifies its stress, reads WHOOP context + weekly hard-day budget + interference,
// and SUGGESTS keep/modify/replace/recovery. NEVER mutates PLAN/WEEK_TEMPLATE/sessions.
// Forward-compatible: getPlannedSessionForDate() will later read from the Base Plan Engine.

// Predefined replacement library (no random improvisation).
// `modality` present = loggable in 1 tap via the sessions path (T3b). Entries
// without modality (strength modifications) stay as text guidance only.
const ALT_LIBRARY = {
  strength_lower: [
    { label: 'Bike Zone 2 35-45 min', family: 'cardio', subtype: 'zone2', modality: 'bike', durationMin: 40, intensity: 'Z2', reason: 'Aerobic work with no leg cost', ruleIds: ['INT-002', 'HYB-005'] },
    { label: 'Upper light accessories', family: 'strength', subtype: 'upper', durationMin: 35, intensity: 'RPE 6-7', reason: 'Low stimulus, avoids the lower body', ruleIds: ['STR-001'] },
    { label: 'Mobility + core', family: 'recovery', subtype: 'mobility', modality: 'mobility', durationMin: 25, intensity: 'easy', reason: 'Active recovery', ruleIds: ['ATH-003'] },
    { label: 'Recovery walk 30-40 min', family: 'recovery', subtype: 'walk', modality: 'walk', durationMin: 35, intensity: 'easy', reason: 'Low impact / NEAT', ruleIds: ['READ-007'] },
  ],
  hard_cardio: [
    // v11.42: el híbrido de trineo + SkiErg entra AQUÍ, como alternativa del cardio del sábado —
    // no como un día extra. HYB-001 lo dice literal: "0-1/sem, en lugar de un cardio, no además".
    { label: 'Hybrid: sled + SkiErg (~40 min)', family: 'hybrid', subtype: 'strength_endurance', planRef: 'hybrid1', durationMin: 40, intensity: 'RPE 8', reason: 'Purely concentric sled: plenty of stimulus, little soreness, barely interferes with legs or running', ruleIds: ['HYB-001', 'HYB-003', 'HYB-005'] },
    { label: 'Bike Zone 2 35-45 min', family: 'cardio', subtype: 'zone2', modality: 'bike', durationMin: 40, intensity: 'Z2', reason: 'Low impact, low interference', ruleIds: ['INT-002'] },
    { label: 'Moderate row 25-30 min', family: 'cardio', subtype: 'zone2', modality: 'row', durationMin: 28, intensity: 'Z2', reason: 'Low impact', ruleIds: ['INT-002'] },
    { label: 'Easy run/walk 30 min', family: 'cardio', subtype: 'zone2', modality: 'run', durationMin: 30, intensity: 'easy', reason: 'Cuts the load on the legs', ruleIds: ['END-006'] },
  ],
  hybrid: [
    { label: 'Bike Zone 2 35 min', family: 'cardio', subtype: 'zone2', modality: 'bike', durationMin: 35, intensity: 'Z2', reason: 'Keeps the aerobic work, cuts fatigue', ruleIds: ['HYB-005'] },
    { label: 'Easy SkiErg 25 min', family: 'cardio', subtype: 'zone2', modality: 'ski', durationMin: 25, intensity: 'easy', reason: 'Low impact', ruleIds: ['HYB-005'] },
    { label: 'Mobility / recovery', family: 'recovery', subtype: 'mobility', modality: 'mobility', durationMin: 25, intensity: 'easy', reason: 'Recovery', ruleIds: ['ATH-003'] },
  ],
  strength_upper: [
    { label: 'Upper, no failure, −1-2 accessories', family: 'strength', subtype: 'upper', durationMin: 40, intensity: 'RPE 7', reason: 'Keep the stimulus, trim the fatigue', ruleIds: ['STR-001', 'STR-004'] },
  ],
};

// RETIRADO en v11.62: `t3LogAlternative()` y su estado (`_t3LastAlts`, `_t3PlannedName`).
// Registraba de un toque la alternativa que proponía el advisory cuando la recuperación
// estaba en rojo. Sin advisory no hay alternativa que proponer: `ALT_LIBRARY` se queda
// porque la lee `renderIdealPreview` para enseñar los cambios posibles de cada día.

// Resolve today's planned session from the CURRENT plan (T4 will swap the source).
// ---- Progresión de cardio: cuánto tiempo hace del último cardio (v11.56) ----
//
// `progressCardioMin` no progresa tras >14 días sin cardio: volver de una pausa con un 33 %
// más de volumen es cómo se llega a una lesión. Esto le da el dato.
//
// Cuenta como cardio cualquier carrera y cualquier sesión de familia `cardio` — el Z2 finisher
// incluido (`origin: 'z2_finisher'`): son minutos aeróbicos reales, y excluirlos haría creer
// que hay una pausa en semanas de 4 días de fuerza con finisher.
//
// Lecturas DEDUPEADAS: la misma actividad llega por Strava y por intervals.icu con ids
// distintos (v11.36). Aquí sólo importa la fecha más reciente, así que el duplicado no
// cambiaría el resultado — pero usar la vista dedupeada es la regla de la casa y evita que
// esto se convierta en el único sitio que cuenta doble.
//
// Caché de 60 s en `state._lastCardioDate` porque `renderWeekCalendar` y `renderHomeQueue`
// llaman a `getPlannedSessionForDate` 7 veces seguidas. Se invalida al registrar cardio
// (`logCardio`/`logZ2Finisher`) y al importar (`intervalsIcuSync`): sin eso, el
// finisher que acabás de registrar tardaría un minuto en contar.
// v11.67 (E-6): la caché guarda también los MINUTOS de cada registro, porque la rampa de
// cardio pasó a salir de lo que se hizo de verdad en ese hueco y no del número de semana del
// bloque. Es la misma lectura (dedupeada) y la misma caché de 60 s: leer las dos tablas otra
// vez para conseguir los minutos convertiría cada pintado de Home en 14 transacciones más.
async function _cardioRecsDesc() {
  const now = Date.now();
  const c = state._lastCardioDate;
  if (c && c.recs && (now - c.ts) < 60000) return c.recs;
  const [runs, sessions] = await Promise.all([
    (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
    (typeof getSessionsDeduped === 'function' ? getSessionsDeduped() : dbGetAll('sessions')).catch(() => []),
  ]);
  const recs = [];
  const min = (v) => { const n = parseFloat(v); return isFinite(n) && n > 0 ? n : null; };
  for (const r of (runs || [])) {
    if (!r || !r.date) continue;
    recs.push({ date: r.date, min: min(r.durationMin != null ? r.durationMin : r.duration), finisher: false });
  }
  for (const s of (sessions || [])) {
    if (!s || !s.date || s.family !== 'cardio') continue;
    recs.push({
      date: s.date,
      min: min(s.durationMin != null ? s.durationMin : s.duration),
      finisher: s.origin === 'z2_finisher',
    });
  }
  recs.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  state._lastCardioDate = { dates: recs.map(r => r.date), recs, ts: now };
  return recs;
}

async function _cardioDatesDesc() {
  return (await _cardioRecsDesc()).map(r => r.date);
}

/**
 * Lo hecho EN ESTE HUECO: los minutos de cardio de los registros que caen en el mismo día de
 * la semana, con su semana ISO, más los días desde el último (E-6).
 *
 * EL FALLO QUE CIERRA. `progressCardioMin` rampaba por `block.index`: en la semana 4 del bloque
 * prescribía base × 1,1³ aunque no se hubiese corrido en tres semanas — una bici de hace tres
 * días bastaba para pasar la puerta global de los 14 días. La referencia y la puerta pasan a
 * ser del hueco: si el miércoles no se hace cardio desde hace un mes, el miércoles vuelve a la
 * base aunque el sábado se esté cumpliendo.
 *
 * SE SEPARA EL FINISHER DE LA SESIÓN DE CARDIO. Un finisher de 20′ y una sesión de 50′ pueden
 * caer el mismo día de la semana; mezclarlos daría una mediana que no describe ninguno de los
 * dos huecos.
 *
 * @param {number} jsDay  0=domingo … 6=sábado.
 * @param {string} ds     'YYYY-MM-DD' del día que se está prescribiendo.
 * @param {'session'|'finisher'} kind
 * @param {number} [days] Ventana de lectura, en días. 28 = las cuatro últimas semanas.
 * @returns {{history: Array<{weekKey:string, min:number}>, lastDaysAgo: number|null}}
 */
async function _cardioSlotHistory(jsDay, ds, kind, days = 28) {
  let recs = [];
  try { recs = await _cardioRecsDesc(); } catch (e) { return { history: [], lastDaysAgo: null }; }
  const wantFinisher = kind === 'finisher';
  const history = [];
  let lastDaysAgo = null;
  for (const r of recs) {
    if (!r || !r.date || r.date > ds) continue;
    if (!!r.finisher !== wantFinisher) continue;
    const dow = new Date(r.date + 'T12:00:00Z').getUTCDay();
    if (dow !== Number(jsDay)) continue;
    const age = Math.round((Date.parse(ds + 'T12:00:00') - Date.parse(r.date + 'T12:00:00')) / 86400000);
    if (age > days) continue;
    if (lastDaysAgo == null || age < lastDaysAgo) lastDaysAgo = age;
    if (r.min == null) continue;                   // un registro sin duración no rampa nada
    const wk = (typeof isoWeekKey === 'function') ? isoWeekKey(r.date) : null;
    if (wk) history.push({ weekKey: wk, min: r.min });
  }
  return { history, lastDaysAgo };
}

// Días desde el último cardio registrado EN O ANTES de `ds`. null = nunca (no se inventa).
async function lastCardioDaysAgo(ds) {
  let dates = [];
  try { dates = await _cardioDatesDesc(); } catch (e) { return null; }
  const last = dates.find(d => d <= ds);
  if (!last) return null;
  return Math.round((Date.parse(ds + 'T12:00:00') - Date.parse(last + 'T12:00:00')) / 86400000);
}

/**
 * ¿Siguen vigentes los objetivos del plan activo? La misma ventana que los kg del set
 * (`plan-v2-schema.md` §"La regla de prioridad"): la semana ISO en que se escribió tiene que
 * ser ésta o la anterior y, sin `weekKey`, vale un plan creado hace ≤ 14 días.
 */
function _coachPlanTargetsAreCurrent() {
  if (!activePlan) return false;
  if (typeof coachTargetIsCurrent !== 'function') return true;   // coach-engine.js no cargó
  if (activePlan.weekKey) return coachTargetIsCurrent(activePlan.weekKey, today());
  const created = activePlan.createdAt;
  if (!created) return false;
  const ttl = (typeof COACH_TARGET_TTL_DAYS === 'number') ? COACH_TARGET_TTL_DAYS : 14;
  const age = Math.round((Date.now() - Date.parse(created)) / 86400000);
  return isFinite(age) && age >= 0 && age <= ttl;
}

/**
 * Minutos del coach para un día de la semana, si la versión activa del plan los trae (esquema
 * v2, incremento 9). Prioridad coach > regla > base (plan §Principios 3).
 *
 * CON LA MISMA VENTANA DE VIGENCIA QUE LOS KG (E-4, auditoría 2026-09-08). Los objetivos de
 * carga del coach caducan cuando su semana ISO deja de ser ésta o la anterior
 * (`coachTargetIsCurrent` en coach-engine.js, usada por `suggestSetTarget`); los minutos de
 * cardio del MISMO plan no caducaban nunca, así que un plan de hace tres semanas seguía
 * prescribiendo 50′ mientras sus kg ya habían cedido el paso a la regla. Un plan con dos
 * vidas distintas es un plan que se contradice consigo mismo.
 *
 * Sin `weekKey` (planes sembrados antes del esquema v2) no hay objetivo del coach que aplicar:
 * esas plantillas no las escribió un coach, son la semilla del plan ideal.
 */
function _coachCardioMin(jsDay, field) {
  if (!activePlan || !activePlan.weekTemplate) return null;
  const d = activePlan.weekTemplate[jsDay];
  const c = d && d.cardio;
  if (!c) return null;
  // Sólo caduca lo que escribió el COACH. `source: 'seed'` es la semilla del plan ideal
  // (`plan-v2-schema.md`:53) y no es una prescripción con fecha: no tiene por qué vencer.
  if (c.source !== 'seed' && !_coachPlanTargetsAreCurrent()) return null;
  const v = c[field];
  return (v != null && isFinite(Number(v))) ? Number(v) : null;
}

/** El cardio que el COACH escribió para este día de la semana, si sigue vigente (misma ventana que
 *  los kg, E-4). `source: 'seed'` no es una prescripción con fecha y no cuenta como del coach. */
function _coachCardioSlot(jsDay) {
  if (!activePlan || !activePlan.weekTemplate) return null;
  const d = activePlan.weekTemplate[jsDay];
  const c = d && d.cardio;
  if (!c || c.source === 'seed') return null;
  return _coachPlanTargetsAreCurrent() ? c : null;
}

/** ¿Tiene el coach la semana de carrera ENTERA (`running.plan[]` con slots) y sigue vigente? Sólo en
 *  ese caso la regla no entra en los días sin cardio del coach. Los tres números de `running`
 *  (`weeklyKmTarget`, `longRunKm`, `hardSessions`) no son un plan de días. */
function _coachRunningPlanIsCurrent() {
  const r = activePlan && activePlan.running;
  if (!r || !Array.isArray(r.plan) || !r.plan.length) return false;
  return _coachPlanTargetsAreCurrent();
}

// ==================== CARRERA DE LA SEMANA: FALLBACK DETERMINISTA (v11.60) ====================
//
// EL PROBLEMA QUE RESUELVE. El plan vivo trae "Cardio Z2 40'" el miércoles y "Cardio calidad
// Z2 50'" el sábado, y hasta v11.59 eso era TODO lo que el sistema sabía de correr: ninguna
// fase, ningún kilómetro, ningún camino desde donde está esta persona (cuatro carreras a
// 147-155 bpm sobre una Z2 que acaba en 143) hasta un 10 km cómodo. `suggestRunningWeek`
// (coach-engine.js) convierte el slot en una FASE con dosis; esto es el cableado.
//
// SÓLO ES FALLBACK, y el orden es el mismo que en `progressCardioMin` y `suggestSetTarget`:
// **coach > regla > base**. Cuando el coach semanal escriba `activePlan.running` (incremento
// 9), esta rama no se ejecuta. Dos fuentes discutiendo por el mismo día es cómo la pantalla
// acaba contradiciendo al reloj.

/** Zona 2 en bpm desde `settings.icuZones`. null → el motor usa su defecto declarado (131-143). */
function _runningZones() {
  const zc = state.settings && state.settings.icuZones;
  const r = zc && zc.z && zc.z.zone2;
  if (r && r.length === 2 && isFinite(Number(r[0])) && isFinite(Number(r[1]))) {
    return { z2: [Number(r[0]), Number(r[1])] };
  }
  return null;
}

/**
 * Los slots de carrera de la semana ACTIVA, tal como los ve el motor. El día de recuperación
 * entra como opcional con su `z2FinisherMin`: es un hueco aeróbico real del plan, y sin él el
 * reparto de kilómetros creería que la semana tiene dos carreras cuando tiene tres.
 */
function _runningSlots() {
  const tpl = activeWeekTemplate || {};
  const out = [];
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const d = tpl[dow];
    if (!d) continue;
    if (d.type === 'run' && d.durationMin) {
      out.push({ dow, base: Number(d.durationMin), subtype: d.subtype || 'zone2' });
    } else if (d.type === 'recovery' && d.z2FinisherMin) {
      out.push({ dow, base: Number(d.z2FinisherMin), subtype: 'recovery', optional: true });
    }
  }
  return out;
}

/**
 * Historial de 4 semanas para el motor.
 *
 * Lecturas DEDUPEADAS (la misma actividad llega por Strava y por intervals.icu con ids
 * distintos, v11.36) y sólo lo que es CORRER: de `sessions` entran las que tienen distancia
 * real y modalidad de carrera, y se descarta el Z2 finisher (`origin: 'z2_finisher'`), que es
 * un remate aeróbico post-fuerza sin distancia — contarlo como carrera metería una fila sin
 * FC ni km en la ventana de cumplimiento de Z2 y empujaría a trote/caminata sin motivo.
 * Bici, remo y ski los descarta el propio motor (`_rwNormalizeRuns`): son minutos aeróbicos
 * reales, pero no construyen tolerancia al impacto.
 */
async function _runningHistory4w(ds) {
  const desde = addDays(ds, -28);
  const [runs, sess] = await Promise.all([
    (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
    (typeof getSessionsDeduped === 'function' ? getSessionsDeduped() : dbGetAll('sessions')).catch(() => []),
  ]);
  const out = [];
  for (const r of (runs || [])) {
    if (!r || !r.date || r.date < desde || r.date > ds) continue;
    out.push({
      date: r.date, km: Number(r.distance) || 0, min: Number(r.duration) || null,
      avgHR: r.avgHR != null ? Number(r.avgHR) : null,
      decoupling: r.decoupling != null ? Number(r.decoupling) : null,
      modality: r.modality || null,
    });
  }
  for (const s of (sess || [])) {
    if (!s || !s.date || s.date < desde || s.date > ds) continue;
    if (s.family !== 'cardio' || s.origin === 'z2_finisher') continue;
    if (!(Number(s.distance) > 0)) continue;
    out.push({
      date: s.date, km: Number(s.distance), min: Number(s.durationMin) || null,
      avgHR: s.avgHR != null ? Number(s.avgHR) : null, modality: s.modality || null,
    });
  }
  out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return out;
}

/**
 * La semana de carrera de la regla, con caché.
 *
 * DOS CLAVES a propósito: `weekKey` (la semana ISO — la prescripción es semanal) y
 * `runsCount` (para que registrar una carrera la recalcule al instante). Y encima una ventana
 * de 60 s, porque `renderWeekCalendar` llama a `getPlannedSessionForDate` siete veces
 * seguidas y sin ella cada render haría catorce `dbGetAll`.
 */
async function suggestRunningWeekCached(date) {
  if (typeof suggestRunningWeek !== 'function') return null;
  const ds = dateStr(date);
  const weekKey = (typeof isoWeekKey === 'function') ? isoWeekKey(ds) : ds;
  const c = state._runningWeek;
  if (c && c.weekKey === weekKey && (Date.now() - c.ts) < 60000) return c.value;
  const history4w = await _runningHistory4w(ds);
  if (c && c.weekKey === weekKey && c.runsCount === history4w.length) {
    c.ts = Date.now();
    return c.value;
  }
  const value = suggestRunningWeek({
    history4w,
    block: blockWeek(date),
    // El readiness ya calculado, si lo hay. No se fuerza su cálculo desde aquí: pintar el plan
    // no puede depender de una llamada a WHOOP, y sin él el motor simplemente no retiene.
    readiness: (state._readinessCache && state._readinessCache.value) || { deloadHint: false },
    goals: (state.settings && state.settings.goals) || (typeof COACH_GOALS_DEFAULT !== 'undefined' ? COACH_GOALS_DEFAULT : {}),
    zones: _runningZones(),
    slots: _runningSlots(),
    todayStr: ds,
    variant: (typeof _idealVariant === 'function') ? _idealVariant() : null,
  });
  state._runningWeek = { weekKey, runsCount: history4w.length, ts: Date.now(), value };
  return value;
}

/**
 * Vuelca la sesión de la regla sobre la sesión planificada del día.
 *
 * LOS MINUTOS DE LA FASE TROTE/CAMINATA PISAN A LOS DEL SLOT, y esto es una decisión, no un
 * descuido: el run/walk arranca en 30'/40' (§B.4) mientras el slot del ideal lleva 40'/50',
 * porque en trote/caminata la mitad del tiempo se camina. Si la pantalla dijera 50' y el
 * resumen "8 × (5′ trote / 1′ caminar)" (48'), dos números de la misma tarjeta se
 * contradirían. `baseMin` y `durationSource` viajan con el número correcto para que
 * `_cardioDurLabel` siga explicando de dónde sale ("35 min · 30' base · semana 3/5").
 * El objetivo del COACH, cuando existe, sigue mandando sobre los dos.
 */
async function _applyRunningWeekFallback(out, date, jsDay, durInfo) {
  try {
    const rw = await suggestRunningWeekCached(date);
    if (!rw) return;
    const s = (rw.sessions || []).find(x => x.dow === jsDay);
    if (s) {
      if (s.summary) out.summary = s.summary;
      out.distanceKm = s.km != null ? s.km : null;
      out.pattern = s.pattern || null;
      out.dsl = s.dsl || null;
      out.runningType = s.type;
      out.runningNote = s.note || null;
      out.runningPhase = rw.phase;
      out.runningSource = 'rule';
      out.weeklyKmTarget = rw.weeklyKmTarget;
      if (s.min != null && (!durInfo || durInfo.source !== 'coach')) {
        out.durationMin = s.min;
        if (s.baseMin != null) out.baseMin = s.baseMin;
        out.durationSource = 'rule';
        out.durationNote = s.pattern ? 'jog/walk by time' : out.durationNote;
      }
    }
    await _logRunningWeekOnce(rw, out.date);
  } catch (e) {
    console.warn('[coach] semana de carrera:', e);
  }
}

/**
 * Una entrada en `decisions` por semana ISO, y sólo cuando el fallback se USA de verdad.
 *
 * Tres guardas porque hay tres formas de spamear: `getPlannedSessionForDate` se llama siete
 * veces por render (memoria de proceso), se llama también para días de OTRAS semanas al pintar
 * el calendario (sólo se registra la de hoy), y la app se abre varias veces al día en
 * dispositivos distintos (se consulta el store antes de escribir).
 */
async function _logRunningWeekOnce(rw, ds) {
  if (!rw || typeof logDecision !== 'function') return;
  if (ds !== today()) return;
  const weekKey = (typeof isoWeekKey === 'function') ? isoWeekKey(ds) : ds;
  if (state._runningWeekLogged === weekKey) return;
  state._runningWeekLogged = weekKey;   // antes del await: siete llamadas en paralelo son una
  try {
    const all = await dbGetAll('decisions');
    if ((all || []).some(d => d && d.type === 'running-week' && d.weekKey === weekKey)) return;
  } catch (e) { return; }
  await logDecision({
    date: ds,
    source: 'rule',
    type: 'running-week',
    what: rw.reason,
    why: 'Deterministic fallback with no coach running plan',
    ruleIds: rw.ruleIds || [],
    evidence: {
      phase: rw.phase,
      weeklyKmTarget: rw.weeklyKmTarget,
      weeklyMinTarget: rw.weeklyMinTarget,
      gates: rw.gates,
    },
    outcome: 'done',
  });
}

/**
 * Fase de carrera en castellano. Cadena vacía sin fase: no se inventa una etiqueta.
 * El mapa (`RW_PHASE_LABEL`) vive en coach-engine.js, que es quien define los ids de fase.
 */
function runningPhaseLabel(planned) {
  const p = planned && planned.runningPhase;
  if (!p) return '';
  const lbl = (typeof RW_PHASE_LABEL !== 'undefined' && RW_PHASE_LABEL[p]) || p;
  return `Running · ${lbl} phase`;
}

async function getPlannedSessionForDate(date) {
  const ds = dateStr(date);
  const jsDay = date.getDay();
  let customSchedule = {};
  try { customSchedule = await getWeekSchedule(); } catch (e) {}
  const slot = (activeWeekTemplate && activeWeekTemplate[jsDay]) || { type: 'rest' };
  const sessionId = getPlannedSession(jsDay, customSchedule, ds); // gym id or null
  // La semana del bloque viaja con la sesión planificada: la pantalla, el push a COROS y el
  // registro leen el mismo `block` que decidió los minutos.
  const blk = blockWeek(date);
  const variant = (typeof _idealVariant === 'function') ? _idealVariant() : null;
  // LA RAMPA SALE DE LO HECHO EN ESTE HUECO (E-6). `kind` separa el finisher post-fuerza de
  // la sesión de cardio del día: mezclar 20′ de finisher con 50′ de bici en la misma mediana
  // describiría un hueco que no existe. Y `lastCardioDaysAgo` pasa a ser del hueco: la puerta
  // de los 14 días miraba TODO el cardio, así que una bici de anteayer dejaba que el miércoles
  // siguiera rampando después de un mes sin correr.
  const prog = async (baseMin, coachMin, kind = 'session') => {
    if (typeof progressCardioMin !== 'function') return { min: baseMin || null, source: 'base', note: null };
    if (!baseMin && coachMin == null) return { min: null, source: 'base', note: null };
    const h = await _cardioSlotHistory(jsDay, ds, kind);
    return progressCardioMin(baseMin, blk, {
      variant,
      lastCardioDaysAgo: h.lastDaysAgo,
      history: h.history,
      coachMin,
    });
  };
  if (sessionId) {
    const s = (activePlan && activePlan.sessions) ? activePlan.sessions[sessionId] : null;
    // Z2 finisher only applies when the day comes from the template (not a manual override).
    const z2Base = (slot.type === 'gym' && customSchedule[ds] === undefined) ? (slot.z2FinisherMin || null) : null;
    const z2 = await prog(z2Base, z2Base ? _coachCardioMin(jsDay, 'z2FinisherMin') : null, 'finisher');
    const exs = s ? resolveSessionExercises(sessionId, s.exercises) : [];
    return { type: 'gym', date: ds, sessionId, name: s ? s.name : sessionId, subtitle: s ? s.subtitle : '', exercises: exs || [], z2FinisherMin: z2.min, z2BaseMin: z2Base, z2Source: z2.source, z2Note: z2.note, z2FinisherModality: slot.z2FinisherModality || null, block: blk };
  }
  if (customSchedule[ds] === undefined) {
    if (slot.type === 'run') { // cardio day (internal type stays 'run' for compatibility)
      const st = slot.subtype || 'zone2';
      const base = slot.durationMin || null;
      const p = await prog(base, _coachCardioMin(jsDay, 'durationMin'));
      const out = { type: 'run', date: ds, name: slot.label || 'Cardio Z2', subtitle: cardioSubtypeLabel(st), subtype: st, durationMin: p.min, baseMin: base, durationSource: p.source, durationNote: p.note, block: blk, summary: slot.summary || null, hrTarget: cardioHrTarget(st), alt: slot.alt || null };
      // v11.60: la carrera de la semana. Coach > regla > base.
      //
      // v11.70 (L-2). La puerta era `if (!(activePlan && activePlan.running))`, y el esquema del
      // coach SIEMPRE devuelve `running{weeklyKmTarget, longRunKm, hardSessions}` — tres números
      // que `mergeProposal` hereda en cada versión. Aplicar la primera propuesta apagaba para
      // siempre el motor de run/walk (`3 × (3′ trote / 2′ caminata) · HR ≤143`), y los km/techo que
      // el coach escribe en `weekTemplate[dow].cardio` no se leían: sólo `durationMin`. Ahora manda
      // el coach cuando ESTE día tiene su cardio vigente (km, zona y nota se pintan), la regla
      // decide la fase cuando no lo tiene, y un `running.plan[]` (que hoy nadie escribe) sería la
      // única forma de que el coach se quede la semana entera.
      const cc = _coachCardioSlot(jsDay);
      if (cc) {
        if (cc.distanceKm != null && isFinite(Number(cc.distanceKm))) out.distanceKm = Number(cc.distanceKm);
        if (cc.hrZone) out.hrZone = cc.hrZone;
        if (cc.note) out.summary = cc.note;
        out.runningSource = 'coach';
      } else if (!_coachRunningPlanIsCurrent()) {
        await _applyRunningWeekFallback(out, date, jsDay, p);
      }
      return out;
    }
    if (slot.type === 'recovery') {
      const rBase = slot.z2FinisherMin || null;
      const r = await prog(rBase, rBase ? _coachCardioMin(jsDay, 'z2FinisherMin') : null, 'finisher');
      return { type: 'recovery', date: ds, name: slot.label || 'Active recovery', subtitle: 'Mobility + easy Z2', z2FinisherMin: r.min, z2BaseMin: rBase, z2Source: r.source, z2Note: r.note, z2FinisherModality: slot.z2FinisherModality || null, block: blk };
    }
  }
  return { type: 'rest', date: ds, name: 'Rest', block: blk };
}

// ---- Cómo se cuenta la semana del bloque en pantalla (v11.56) ----
//
// El número que se hace y de dónde sale, en la misma línea. Sin esto, el cardio subiría de
// 40' a 50' sin que nada lo explique — y un cambio que no se entiende se lee como un bug.
// "48 min (40' base · semana 3/5)" · "45 min (coach)" · "40 min" cuando no hay progresión.
function _cardioDurLabel(min, baseMin, source, blk) {
  if (min == null) return '—';
  if (source === 'coach') return `${min} min <span class="rx-dur-src">(coach)</span>`;
  if (source === 'rule' && baseMin && baseMin !== min && blk && blk.index) {
    return `${min} min <span class="rx-dur-src">(${baseMin}' base · week ${blk.index}/${DELOAD_BLOCK_WEEKS})</span>`;
  }
  return `${min} min`;
}

// "Semana 3/5 · build" — cadena vacía si no hay ancla (no se inventa una semana de bloque).
function _blockEyebrow(blk) {
  if (!blk || !blk.index) return '';
  return `Week ${blk.index}/${DELOAD_BLOCK_WEEKS} · ${blk.label}`;
}

function _blockEyebrowHtml(blk) {
  const t = _blockEyebrow(blk);
  return t ? `<div class="plan-block-eyebrow">${t}</div>` : '';
}

// Spanish label for a cardio subtype (used in planned-session cards).
function cardioSubtypeLabel(subtype) {
  const map = { zone2: 'Zone 2 · easy', zone3: 'Zone 3', threshold: 'Threshold', intervals: 'Intervals', long_easy: 'Long Z2 · quality', recovery: 'Recovery' };
  return map[subtype] || 'Zone 2 · easy';
}

// Fallback intensity cue (RPE / conversational) when no bpm zones are cached.
function cardioIntensityGuide(subtype) {
  const map = {
    zone2: 'Conversational · you can talk · RPE 3-4',
    long_easy: 'Conversational · you can talk · RPE 3-4',
    zone3: 'Comfortably hard · short sentences · RPE 5-6',
    threshold: 'Sustained hard · RPE 7-8',
    intervals: 'Very hard in blocks · RPE 9',
    recovery: 'Very easy · RPE 2',
  };
  return map[subtype] || map.zone2;
}

// Classify the planned session's training stress (reuses toSession + SESSION_TYPES).
function classifySessionStress(planned) {
  if (!planned || planned.type === 'rest') {
    return { level: 'easy', family: 'recovery', subtype: 'deload', regions: [], impact: 'low', systemicFatigue: 'low', budgetWeight: 0, ruleIds: [] };
  }
  if (planned.type === 'recovery') {
    return { level: 'easy', family: 'recovery', subtype: 'mobility', regions: [], impact: 'low', systemicFatigue: 'low', budgetWeight: 0, ruleIds: ['ATH-003', 'READ-007'] };
  }
  if (planned.type === 'run') {
    const subtype = planned.subtype || 'zone2';
    const meta = (typeof sessionSubtypeMeta === 'function' && sessionSubtypeMeta('cardio', subtype)) || {};
    const bw = meta.budgetWeight != null ? meta.budgetWeight : 0.5;
    return { level: bw >= 2 ? 'hard' : bw >= 1 ? 'moderate' : 'easy', family: 'cardio', subtype, regions: ['cardio'], impact: 'high', systemicFatigue: 'low', budgetWeight: bw, ruleIds: meta.evidenceTags || ['END-001'] };
  }
  const sess = toSession({ session: planned.sessionId, sessionName: planned.name, exercises: planned.exercises || [] }, 'workouts');
  const meta = (typeof sessionSubtypeMeta === 'function' && sessionSubtypeMeta(sess.family, sess.subtype)) || {};
  const bw = (sess.budgetWeight != null ? sess.budgetWeight : (meta.budgetWeight != null ? meta.budgetWeight : 1));
  const level = bw >= 2 ? 'hard' : bw >= 1 ? 'moderate' : 'easy';
  const regions = sess.subtype === 'lower' ? ['lower'] : sess.subtype === 'upper' ? ['upper'] : ['full'];
  return { level, family: sess.family, subtype: sess.subtype, regions, impact: 'low', systemicFatigue: bw >= 2 ? 'high' : 'medium', budgetWeight: bw, ruleIds: sess.evidenceTags || [] };
}

// WHOOP recovery context — uses WHOOP's recovery as-is (flag), does NOT recompute a score.
//
// v11.58 (F-6): el dato es de HOY o no hay dato. Antes cogía `recovery[recovery.length - 1]` —el
// último elemento del array de 7 días— sin comparar su fecha con hoy, así que a las 7:00, cuando
// intervals.icu todavía tiene el de ayer, el advisory decidía el entreno de hoy con la noche de
// anteayer. Ahora: `find(r => r.date === today())`; si no está → `unknown` con el motivo, y el
// último disponible viaja aparte en `lastAvailable` SÓLO para pintarlo con su fecha.
async function getWhoopContext() {
  let data = null;
  try { if (window.whoopIsConnected && whoopIsConnected()) data = await whoopSyncData(); } catch (e) {}
  const t = today();
  const recs = (data && Array.isArray(data.recovery)) ? data.recovery.filter(r => r && r.date) : [];
  const rec = recs.find(r => r.date === t) || null;
  const sorted = recs.slice().sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted.length ? sorted[sorted.length - 1] : null;
  const lastAvailable = last ? { date: last.date, score: last.score != null ? last.score : null } : null;
  const sleeps = (data && Array.isArray(data.sleep)) ? data.sleep.filter(s => s && s.date) : [];
  const sleepToday = sleeps.find(s => s.date === t) || null;
  const sleepHrs = sleepToday ? sleepToday.durationHrs : null;
  if (!rec || rec.score == null) {
    const reason = (data && data.todayMissingReason)
      || (data ? 'No recovery data for today' : 'No recovery data');
    return { color: 'unknown', score: null, hrv: null, rhr: null, sleepHrs, source: 'none', date: t, fetchedAt: null, reason, lastAvailable };
  }
  const source = (rec.source === 'whoop-direct' || (data && data.todaySource === 'whoop-direct')) ? 'whoop-direct' : 'intervals';
  const { label } = getRecoveryColor(rec.score);
  return {
    color: String(label).toLowerCase(), score: rec.score,
    hrv: rec.hrv != null ? rec.hrv : null, rhr: rec.restingHR != null ? rec.restingHR : null,
    sleepHrs, source, date: t,
    fetchedAt: rec.fetchedAt || (data && data.todayFetchedAt) || null,
    reason: null, lastAvailable,
  };
}

// ==================== READINESS (v11.59, incremento 5) ====================
//
// El envoltorio con IndexedDB del motor puro (`computeReadinessFrom` en coach-engine.js). Es el
// ÚNICO sitio de la app que decide si hoy es verde, amarillo o rojo: lo consumen el advisory de
// Home, el banner de deload de Stats y la lista de señales de Stats › Today. Antes había tres
// cálculos con tres criterios (audit F-5) y el usuario podía ver los tres a la vez.
//
// DOS FUENTES CON PAPELES DISTINTOS (§B.2.b, requisito del usuario):
//   · `wellness` (intervals.icu) = el HISTÓRICO. A la mañana está completo hasta ayer, que es
//     exactamente lo que las tendencias de 7d/28d necesitan.
//   · `getWhoopContext()` = el dato de HOY, y sólo si es de hoy (F-6). Si falta, se pasa el
//     motivo real y el motor declara la señal `insufficient` en vez de usar el de ayer.
//
// CACHÉ POR DÍA porque la línea de Home (`renderRecoveryLine`) y la lista de Stats
// (`renderReadinessSignals`) se piden en el mismo render y cada una haría su propio
// `dbGetAll('wellness')`. Se invalida cuando llega el dato de hoy (`whoopSyncData`), al
// importar (`intervalsIcuSync`) y al terminar una sesión: los momentos en que puede cambiar.
const READINESS_WINDOW_DAYS = 35;   // 7 de tendencia + 28 de base propia

function invalidateReadiness() { state._readinessCache = null; }

async function computeReadiness({ date } = {}) {
  const ds = date || today();
  const c = state._readinessCache;
  if (c && c.ds === ds && c.value) return c.value;

  const wc = await getWhoopContext();
  // `source !== 'none'` = getWhoopContext encontró la fila de HOY. Cualquier otra cosa es "no hay
  // dato de hoy", con su motivo.
  const whoopToday = (wc && wc.source !== 'none' && wc.score != null)
    ? { score: wc.score, source: wc.source, fetchedAt: wc.fetchedAt || null }
    : null;

  let wellness = [];
  try {
    const all = await dbGetAll('wellness');
    const desde = addDays(ds, -READINESS_WINDOW_DAYS);
    wellness = (all || []).filter(r => r && r.date && r.date >= desde && r.date <= ds);
  } catch (e) { console.warn('[readiness] wellness:', e); }

  let workouts = [];
  try {
    const all = await dbGetAll('workouts');
    workouts = (all || [])
      .filter(w => w && w.date && w.date <= ds)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 10);
  } catch (e) { console.warn('[readiness] workouts:', e); }

  let value;
  if (typeof computeReadinessFrom !== 'function') {
    // coach-engine.js no cargó: se dice, y no se inventa un color.
    value = { color: 'unknown', signals: [], fired: 0, confidence: 'low', deloadHint: false, ruleIds: [] };
  } else {
    value = computeReadinessFrom({
      today: ds, wellness, whoopToday, whoopMissingReason: (wc && wc.reason) || null,
      workouts, cutoffs: { green: 67, yellow: 34 },
    });
  }
  // El último dato disponible viaja SÓLO para pintarlo con su fecha ("ayer"): no entra en
  // ninguna decisión (F-6). La honestidad de v11.58, conservada.
  value.whoopLastAvailable = (wc && wc.lastAvailable) || null;

  state._readinessCache = { ds, ts: Date.now(), value };
  return value;
}

// RETIRADO en v11.62 con el ajuste diario: `_coachIsMainLift`, `_coachIsCore`,
// `_coachAdjustCtx` y `_coachAdjustmentsPayload`. Eran el contexto que necesitaba el motor de
// ajuste para decidir qué accesorio se recortaba en un día rojo. Nadie recorta ya.

// La instantánea mínima del readiness que se guarda con la sesión: color, qué señales dispararon
// y con qué confianza. Sin números crudos: el registro no es el sitio donde re-derivar nada.
function _coachReadinessStamp(r) {
  if (!r) return null;
  return {
    color: r.color,
    signals: (r.signals || []).filter(s => s.fired).map(s => s.id),
    confidence: r.confidence,
    source: ((r.signals || []).find(s => s.id === 'whoop') || {}).status === 'ok' ? 'whoop-today' : 'trend',
  };
}

// Weekly hard-day budget (programming guardrail, not a physiological score).
async function computeHardDayBudget() {
  const weekDates = getWeekDates().map(d => dateStr(d));
  const [workouts, runs, sessions] = await Promise.all([
    dbGetAll('workouts').catch(() => []),
    (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
    // Deduped since v11.36: imported cardio can arrive via both Strava and intervals.icu.
    (typeof getSessionsDeduped === 'function' ? getSessionsDeduped() : dbGetAll('sessions')).catch(() => []),
  ]);
  const items = [];
  const add = (rec, store) => {
    if (!rec || !weekDates.includes(rec.date)) return;
    const s = toSession(rec, store);
    if (!s) return;
    const meta = (typeof sessionSubtypeMeta === 'function' && sessionSubtypeMeta(s.family, s.subtype)) || {};
    const w = (s.budgetWeight != null ? s.budgetWeight : (meta.budgetWeight != null ? meta.budgetWeight : 1));
    items.push({ date: rec.date, label: s.title || s.family, weight: w });
  };
  (workouts || []).forEach(r => add(r, 'workouts'));
  (runs || []).forEach(r => add(r, 'runs'));
  (sessions || []).forEach(r => add(r, 'sessions'));
  const used = Math.round(items.reduce((sum, it) => sum + (it.weight || 0), 0) * 10) / 10;
  // VP_MAX_BUDGET vive en coach-facts.js, donde el validador `BUD-001` juzga las propuestas
  // del coach (E-9). Había un 6 aquí y un 8 en la barra de la tarjeta: el mismo esfuerzo
  // llenaba el 100 % en un sitio y el 75 % en el otro.
  const cap = (typeof VP_MAX_BUDGET === 'number') ? VP_MAX_BUDGET : 6;
  return { used, cap, hardSessions: items.filter(it => it.weight >= 2).length, items: items.sort((a, b) => b.weight - a.weight), overCap: used > cap };
}

// RETIRADO en v11.62: `detectInterference`, `getReplacementOptions`, el orquestador del
// advisory y las etiquetas de su matriz (`_T3_REC`, `_T3_LEVEL_ES`, `_T3_REGION_ES`,
// `_t3StressPlain`). El orquestador leía la sesión planificada, la clasificaba, miraba el
// readiness y devolvía mantener/ajustar/cambiar/recuperar. Es justo lo que el usuario retiró
// el 2026-09-07: la app no decide por él en el gimnasio.
// `classifySessionStress` se conserva (la usa el clasificador de sesiones y su test) y
// `_t3SessionLabel` también (la etiqueta descriptiva del día, que sigue en el calendario).

function _t3WeightWord(w) { return w >= 2 ? 'demanding' : w >= 1 ? 'moderate' : w > 0 ? 'easy' : 'recovery'; }
// Descriptive session label from its actual main lifts (movement patterns), in
// Spanish — e.g. "Sentadilla · Peso muerto" instead of the internal "Lower B".
const _PATTERN_LABEL = {
  'squat': 'Squat', 'hinge': 'Deadlift', 'horizontal-press': 'Bench press',
  'vertical-press': 'Overhead press', 'horizontal-pull': 'Row', 'vertical-pull': 'Pull-ups',
};
const _MUSCLE_LABEL = {
  Chest: 'Chest', Back: 'Back', Shoulders: 'Shoulders', Quads: 'Quads', Hamstrings: 'Hamstrings',
  Posterior: 'Posterior', Glutes: 'Glutes', Triceps: 'Triceps', Biceps: 'Biceps', Core: 'Core',
  Calves: 'Calves', 'Rear Delt': 'Rear delt',
};
function _t3SessionLabel(planned) {
  if (!planned) return 'Session';
  if (planned.type === 'run') return 'Z2 run';
  if (planned.type === 'rest') return 'Rest';
  const exs = planned.exercises || [];
  const major = [], minor = [];
  for (const ex of exs) {
    const pat = (typeof MOVEMENT_PATTERNS !== 'undefined' && MOVEMENT_PATTERNS[ex.id]) || null;
    if (pat && _PATTERN_LABEL[pat]) { if (!major.includes(_PATTERN_LABEL[pat])) major.push(_PATTERN_LABEL[pat]); }
    else { const mu = _MUSCLE_LABEL[ex.muscle]; if (mu && !minor.includes(mu)) minor.push(mu); }
  }
  const out = major.concat(minor).slice(0, 2);
  return out.length ? out.join(' · ') : (planned.name || 'Strength');
}

// RETIRADO en v11.62 — LA TARJETA DE CONSEJO DIARIO.
//
// Aquí vivía la tarjeta del advisory, con sus dos botones (hacer la sesión recortada o la
// del plan), el check-in de 2 toques (`_coachCheckinHtml`, `_coachBindCheckin`, su guardado y
// sus bandas de sueño), `_coachChangeLabel`, `_readinessLine` y las etiquetas de color
// `_READINESS_ES` / `_READINESS_COLOR`.
//
// POR QUÉ. Julian, 2026-09-07: *"nada de ajustar el entrenamiento del día por WHOOP; eso
// es muy subjetivo; voy a ser yo y mi cuerpo el que decida skipear un ejercicio o bajar
// los pesos"*. El trabajo del coach es SEMANAL. Lo que queda de la recuperación en Home es
// una línea informativa (`renderRecoveryLine`, coach.js) con las tendencias de 7 días y,
// primero, el RENDIMIENTO (`performanceLine`, coach-engine.js). Sin color de estado, sin
// botones y sin nada que aceptar o rechazar. El check-in se fue con ella: preguntar
// "¿cómo dormiste?" cada mañana para no hacer nada con la respuesta es pedir por pedir.

// Card 2 — Carga acumulada de la semana. INFORMATIVO, no un límite.
//
// v11.41 (decisión del usuario, 2026-08-18): "olvidate de ese ranking de dureza de 6. Lo importante
// es entrenar bien, de última pondré menos peso, menos repeticiones, o te avisaré que es mucho.
// O haré descanso." Y: "podemos mantener el valor mostrando cuánto vengo haciendo, pero no limites
// las planificaciones con eso."
//
// Así que la tarjeta se queda —ver la carga acumulada es útil— pero deja de comportarse como un
// tope: sin barra roja, sin avisos de "no sumes otro día", y sobre todo el número no entra en
// ninguna decisión. La autorregulación la hace él, que además tiene información que el sistema
// no tiene. v11.62: vive en Stats › Today, no en Home.
async function renderHardDayBudget() {
  const container = document.getElementById('hard-day-budget');
  if (!container) return;
  let b;
  try { b = await computeHardDayBudget(); } catch (e) {
    console.warn('[carga] falló', e);
    showErrorState(container, 'The weekly load could not be computed.', renderHardDayBudget);
    return;
  }
  // La barra usa EL MISMO tope que el cálculo (`b.cap` = `VP_MAX_BUDGET`, E-9). Sigue sin ser
  // un límite —no hay barra roja ni avisos, y el número no entra en ninguna decisión—, pero la
  // escala es una sola: con un divisor de 8 aquí y un tope de 6 allí, 6 puntos se pintaban al
  // 75 % mientras el validador del coach los llamaba "el tope".
  const pct = Math.min(100, Math.round((b.used / (b.cap || 6)) * 100));
  const top = (b.items || []).slice(0, 3).map(it => `${it.label} (${_t3WeightWord(it.weight)})`).join(' · ');
  container.innerHTML = `
    <section class="card t3-card">
      <div class="t3-head"><span class="t3-eyebrow">Week load</span><span class="t3-budget-num">${b.used}</span></div>
      <div class="t3-bar"><div class="t3-bar-fill" style="width:${pct}%;background:var(--accent)"></div></div>
      <div class="t3-context">How much hard effort you piled up this week, just so you see it. <b>It is not a limit</b>: if a session is too much, drop the weight or the reps, or rest.</div>
      ${top ? `<div class="t3-context">Biggest contributors: ${top}</div>` : '<div class="t3-context">No workouts this week yet.</div>'}
    </section>`;
}

// ==================== T4: IDEAL PLAN ENGINE — PREVIEW (v11.26, read-only) ====================
// Evidence-derived ideal block, encoded as DATA (traceable to Rule IDs). The preview
// renders it side-by-side with the current plan. It does NOT touch PLAN/WEEK_TEMPLATE/
// generator/logs — "Aplicar" is deferred to T5. Generation logic is documented in
// docs/architecture/ideal-plan-engine-v1.md (spec for the future algorithmic engine).
// dow: 1=Mon..6=Sat, 0=Sun. budgetWeight mirrors SESSION_TYPES so the budget sum is consistent.
// T5.1: the IDEAL is a 4-day Upper/Lower split (covers the 6 patterns 2×/wk, ~14-18 sets/muscle,
// hypertrophy-leaning for recomp/aesthetics) + a daily Z2 stimulus (finisher on strength days,
// dedicated cardio days, 1 active-recovery day) → a stimulus every day of the week. Strength days
// carry z2Finisher (min) so the aerobic dose shows daily. Full sessions are 60-75 min; quick-mode
// compresses them to ~40-45 min (it is the time-saver, NOT a permanently light day).
// Variants flex DOWN from the ideal for busy/travel weeks. dow: 1=Mon..6=Sat, 0=Sun.
const IDEAL_BLOCK_V1 = {
  goal: 'Recomposition (lose fat + add tone) + aerobic base + strength',
  weeks: 5, // 4 build + 1 deload
  progressing: ['Strength/hypertrophy (Upper/Lower 2×)', 'Aerobic base (daily Z2)'],
  maintaining: ['Mobility / athleticism'],
  runningArc: 'Easy Z2 almost every day + 1 quality session/wk (long run or Z2/Z3 progression).',
  cautions: [
    'No hard cardio <24 h before heavy legs (INT-001) — the quality session goes on Saturday.',
    'The Z2 finisher is ALWAYS easy/conversational: it does not interfere with strength (END-001).',
    'Most cardio easy — roughly 80/20 across the week (END-001).',
    'In a deficit: keep the intensity, do not push volume up aggressively; quick-mode if fatigued (LOAD).',
  ],
  variants: {
    // v11.42 — VIAJE. La causa real de la adherencia baja (11 sesiones en 9 semanas) era que
    // estaba de viaje y NINGUNA variante funcionaba sin rack y barra. Cero equipo, banda opcional.
    // Dos sesiones de fuerza completas + caminata/carrera libre; sin días duros que exijan gimnasio.
    0: {
      label: 'Travel · no gym',
      note: 'Bodyweight (band if you have one). Every session is complete: legs + push + pull + core.',
      days: [
        { dow: 1, kind: 'strength', subtype: 'full', bw: 1.5, planRef: 'travelA', title: 'Travel A', summary: 'Bulgarians + push-ups + pull-ups + glute + plank', why: 'A complete session with no equipment; keeps the patterns.', ruleIds: ['STR-002', 'STR-004'], alt: 'strength_upper' },
        { dow: 3, kind: 'cardio', subtype: 'zone2', bw: 0.5, durationMin: 30, title: 'Free Z2 cardio', summary: '30 min easy: run, brisk walk, or the hotel gym', why: 'The aerobic minimum without depending on kit.', ruleIds: ['END-001'], alt: 'hard_cardio' },
        { dow: 5, kind: 'strength', subtype: 'full', bw: 1.5, planRef: 'travelB', title: 'Travel B', summary: 'Single-leg RDL + pike + band row + nordic + dead bug', why: 'Hinge and vertical pattern, what A does not cover.', ruleIds: ['STR-002', 'STR-007'], alt: 'strength_upper' },
        { dow: 0, kind: 'recovery', subtype: 'mobility', bw: 0, z2Finisher: 20, z2FinisherModality: 'walk', title: 'Active recovery', summary: 'Mobility + walk', why: 'Travelling piles up sitting hours; mobility matters more, not less.', ruleIds: ['ATH-003', 'ATH-006'], alt: null },
      ],
    },
    3: {
      // v11.37: la nota decía "Viaje / sin gym" mientras fullA prescribe rack, barra, banco y
      // máquina de cables — 4 de 4 ejercicios necesitan gimnasio completo. Corregida a lo que
      // realmente es. NO existe una variante sin gimnasio de verdad; es un hueco abierto, no algo
      // que se arregle con una frase. Ver assessments/2026-08-16_system-audit.md (A11).
      label: 'Minimal · 3 days',
      note: 'Compressed week, with a gym: 2 full-body + 1 cardio. Maintains, does not progress.',
      days: [
        { dow: 1, kind: 'strength', subtype: 'full', bw: 2, planRef: 'fullA', title: 'Full Body A', summary: 'Squat + bench press + row + core', why: 'Covers legs/push/pull in one session.', ruleIds: ['STR-002', 'STR-005'], alt: 'strength_lower' },
        { dow: 3, kind: 'strength', subtype: 'full', bw: 2, planRef: 'fullB', title: 'Full Body B', summary: 'Deadlift + overhead press + pull-ups + core', why: 'Hinge + vertical pattern.', ruleIds: ['STR-002', 'STR-007'], alt: 'strength_lower' },
        { dow: 6, kind: 'cardio', subtype: 'zone2', bw: 0.5, durationMin: 35, title: 'Cardio Z2', summary: '30-40 min easy (bike/row/treadmill or run)', why: 'The aerobic minimum.', ruleIds: ['END-001', 'INT-002'], alt: 'hard_cardio' },
      ],
    },
    4: {
      // v11.38: la nota decía "sin perder cobertura", pero la cobertura de FUERZA es idéntica a
      // la variante 3 — las mismas 2 sesiones y las mismas series. El 4º día es aeróbico.
      // Añadir un 3er día de fuerza subiría el budget a 7 sobre un tope de 6 (BUD-001), y esta
      // variante existe precisamente para semanas con MENOS margen: meterle otra sesión dura
      // contradice su propósito. Queda como decisión D5, con carga real medida.
      label: 'Reduced · 4 days',
      note: 'Adds one aerobic day over the 3-day one; strength is identical (2 full-body). Maintains.',
      days: [
        { dow: 1, kind: 'strength', subtype: 'full', bw: 2, planRef: 'fullA', z2Finisher: 15, z2FinisherModality: 'bike', title: 'Full Body A', summary: 'Squat + press + row + core', why: 'Full-body covers everything; + a short Z2 at the end.', ruleIds: ['STR-002', 'STR-005'], alt: 'strength_lower' },
        { dow: 2, kind: 'cardio', subtype: 'zone2', bw: 0.5, durationMin: 35, title: 'Cardio Z2', summary: '30-40 min easy', why: 'Low-impact aerobic work.', ruleIds: ['END-001', 'INT-002'], alt: 'hard_cardio' },
        { dow: 4, kind: 'strength', subtype: 'full', bw: 2, planRef: 'fullB', z2Finisher: 15, z2FinisherModality: 'ski', title: 'Full Body B', summary: 'Deadlift + OHP + pull-ups + core', why: 'Hinge + vertical pattern; + a short Z2.', ruleIds: ['STR-002', 'STR-007'], alt: 'strength_upper' },
        { dow: 6, kind: 'cardio', subtype: 'long_easy', bw: 1, durationMin: 45, title: 'Long Z2 cardio', summary: 'Easy long session, building ~10%/wk', why: 'Progress the aerobic base away from legs.', ruleIds: ['END-003', 'END-001'], alt: 'hard_cardio' },
      ],
    },
    5: {
      // HISTORIA DE ESTA VARIANTE, porque ha cambiado dos veces y las dos por una razón real:
      //   · Hasta v11.35 era lower/upper/UPPER. D3 la cambió a lower/upper/LOWER porque al bajar
      //     de 6 a 5 días desaparecía `lowerB` y con él el PESO MUERTO SUMO, un ancla declarada
      //     "nunca rotar", y la cadena posterior se quedaba sin día propio.
      //   · v11.72 (F-8, decisión de Julian 2026-09-10) la devuelve a lower/upper/UPPER. Lo que
      //     D3 no vio es que lower/upper/lower incumple STR-002 en LAS DOS mitades del tren
      //     superior: empuje y tirón se quedaban a 1×/semana (el mínimo de la casa es 2×), y la
      //     variante existe para semanas de 5 días, no para semanas de descarga. El coste que D3
      //     temía se paga por otra vía: la BISAGRA no se pierde, la cubre el RDL de `lowerA`
      //     (3×8-10 @7), que es la misma cadena posterior con menos carga axial. Lo que sí se
      //     acepta es que el sumo pesado no está en esta variante — 5 días no dan para todo, y
      //     entre "un patrón a la mitad de dosis" y "dos patrones a la mitad de dosis" gana el
      //     primero. La variante ACTIVA sigue siendo la de 6 días, donde `lowerB` está entero.
      label: 'High · 5 days',
      note: '3 strength (lower/upper/upper) + 2 cardio + recovery. Push and pull twice a week; the hinge rides on the RDL in Lower A.',
      days: [
        { dow: 1, kind: 'strength', subtype: 'lower', bw: 2, planRef: 'lowerA', z2Finisher: 15, z2FinisherModality: 'bike', title: 'Lower A · Squat + RDL', why: 'Heavy legs at the start, while fresh; the RDL carries the hinge in this variant.', ruleIds: ['STR-005', 'STR-007', 'INT-001'], alt: 'strength_lower' },
        { dow: 2, kind: 'strength', subtype: 'upper', bw: 1, planRef: 'upperA', z2Finisher: 15, z2FinisherModality: 'treadmill', title: 'Upper A · Press/Row/Pull-up', why: 'Horizontal push and pull, plus vertical pull; + a short Z2.', ruleIds: ['STR-002'], alt: 'strength_upper' },
        { dow: 3, kind: 'cardio', subtype: 'zone2', bw: 0.5, durationMin: 35, title: 'Cardio Z2', summary: '30-40 min easy + mobility', why: 'Low-impact aerobic work.', ruleIds: ['END-001', 'INT-002'], alt: 'hard_cardio' },
        { dow: 5, kind: 'strength', subtype: 'upper', bw: 1, planRef: 'upperB', z2Finisher: 15, z2FinisherModality: 'treadmill', title: 'Upper B · Pull-ups/OHP', why: 'Second upper stimulus: vertical press and pull, so push and pull reach 2x/week (STR-002).', ruleIds: ['STR-002', 'STR-007'], alt: 'strength_upper' },
        { dow: 6, kind: 'cardio', subtype: 'long_easy', bw: 1, durationMin: 45, title: 'Z2 quality cardio', summary: 'Long / Z2-Z3 progression', why: 'The only quality session of the week, and the day furthest from heavy legs.', ruleIds: ['END-003', 'END-004'], alt: 'hard_cardio' },
        { dow: 0, kind: 'recovery', subtype: 'mobility', bw: 0, z2Finisher: 20, z2FinisherModality: 'walk', title: 'Active recovery', summary: 'Mobility + core + 20 min easy Z2', why: 'Active recovery with an aerobic stimulus.', ruleIds: ['ATH-003', 'READ-007'], alt: null },
      ],
    },
    6: {
      label: 'Full · ideal',
      note: 'THE IDEAL: 4 strength (Upper/Lower 2×, all 6 patterns) + daily Z2 + 1 quality + recovery. A stimulus all 7 days. Quick-mode when time is short.',
      days: [
        { dow: 1, kind: 'strength', subtype: 'lower', bw: 2, planRef: 'lowerA', z2Finisher: 20, z2FinisherModality: 'bike', title: 'Lower A · Squat', why: 'Heavy legs at the start, while fresh. +20 min easy Z2 at the end.', ruleIds: ['STR-005', 'INT-001'], alt: 'strength_lower' },
        { dow: 2, kind: 'strength', subtype: 'upper', bw: 1, planRef: 'upperA', z2Finisher: 20, z2FinisherModality: 'treadmill', title: 'Upper A · Press/Row', why: 'Horizontal push/pull. +20 min easy Z2.', ruleIds: ['STR-002'], alt: 'strength_upper' },
        { dow: 3, kind: 'cardio', subtype: 'zone2', bw: 0.5, durationMin: 40, title: 'Cardio Z2 + mobility', summary: '35-45 min easy (bike/row/treadmill) + mobility/core', why: 'A dedicated aerobic day between strength stimuli.', ruleIds: ['END-001', 'END-003'], alt: 'hard_cardio' },
        { dow: 4, kind: 'strength', subtype: 'lower', bw: 2, planRef: 'lowerB', z2Finisher: 20, z2FinisherModality: 'ski', title: 'Lower B · Hinge', why: 'Hinge (deadlift) — 2nd leg stimulus. +20 min Z2.', ruleIds: ['STR-005', 'STR-007'], alt: 'strength_lower' },
        { dow: 5, kind: 'strength', subtype: 'upper', bw: 1, planRef: 'upperB', z2Finisher: 20, z2FinisherModality: 'treadmill', title: 'Upper B · Pull-ups/OHP', why: 'Vertical pattern (pull-ups + overhead press). +20 min Z2.', ruleIds: ['STR-002', 'STR-007'], alt: 'strength_upper' },
        { dow: 6, kind: 'cardio', subtype: 'long_easy', bw: 1, durationMin: 50, title: 'Z2 quality cardio', summary: 'Easy long session, or swap it for the sled + SkiErg hybrid', why: 'Builds the aerobic engine; away from legs. The hybrid is an alternative, not an extra day.', ruleIds: ['END-003', 'END-005'], alt: 'hard_cardio' },
        { dow: 0, kind: 'recovery', subtype: 'mobility', bw: 0, z2Finisher: 20, z2FinisherModality: 'walk', title: 'Active recovery', summary: 'Mobility + core + walk/easy Z2 20 min', why: 'Active recovery; a gentle stimulus all 7 days.', ruleIds: ['ATH-003', 'READ-007'], alt: null },
      ],
    },
  },
};

// RETIRADO en v11.38. `EQUIP_SUBS` existió desde T4 y NUNCA estuvo conectado a nada: sus
// únicos dos usos en todo el código eran su propia definición y una frase del preview que
// afirmaba "cada día tiene alternativas si el gym está lleno o falta equipo". No había
// mecanismo alguno detrás — la afirmación era falsa.
//
// La capacidad real sí existe y es mejor: `showSwapUI` (T5.2, v11.31) permite cambiar cualquier
// ejercicio desde la pantalla de la sesión, el cambio PERSISTE en `settings.exerciseOverrides`,
// es reversible, y no lo pisa el cambio de variante del ideal. Los sustitutos salen de
// `EXERCISE_ALTERNATIVES`, que sí está poblado. El preview ahora apunta ahí.
//
// Ver assessments/2026-08-16_system-audit.md (A11, punto 5).

// F-15: el nombre visible de la modalidad del finisher. Los ids son los de `_ICU_TYPE_BY_MODALITY`
// (el mismo vocabulario que viaja a intervals.icu), así que no hay un tercer diccionario.
const _Z2_MODALITY_LABEL = {
  bike: 'Bike', ski: 'SkiErg', row: 'Row', treadmill: 'Treadmill',
  run_outdoor: 'Easy run', walk: 'Walk', elliptical: 'Elliptical', swim: 'Swim',
};
function _z2ModalityLabel(id) { return _Z2_MODALITY_LABEL[id] || String(id || ''); }

// T5: the chosen day-count (3/4/5/6) and per-session duration persist in settings (synced).
// T5.1: default to the full IDEAL (variant 6 "Completa"). Selector flexes down to 3/4/5.
function _idealVariant() { const v = state.settings && state.settings.idealVariant; return (v === 0 || v === 3 || v === 4 || v === 5 || v === 6) ? v : 6; }

// T5.1: derive a week template ({0..6: slot}) from the chosen ideal variant.
// strength → gym (+z2FinisherMin/+z2FinisherModality) · cardio → run (subtype + durationMin) ·
// recovery → recovery (+z2FinisherMin/+z2FinisherModality) · gap → rest.
function buildWeekTemplateFromIdeal(variantNum) {
  const variant = IDEAL_BLOCK_V1.variants[variantNum] || IDEAL_BLOCK_V1.variants[6];
  const tpl = {};
  for (let d = 0; d <= 6; d++) tpl[d] = { type: 'rest', label: 'Rest' };
  for (const day of variant.days) {
    if (day.kind === 'strength' && day.planRef) {
      tpl[day.dow] = { type: 'gym', session: day.planRef };
      if (day.z2Finisher) tpl[day.dow].z2FinisherMin = day.z2Finisher;
      // F-15: la modalidad del finisher es prescripción, no adorno (INT-002/SEL-004).
      if (day.z2FinisherModality) tpl[day.dow].z2FinisherModality = day.z2FinisherModality;
    } else if (day.kind === 'cardio') {
      tpl[day.dow] = { type: 'run', label: day.title, subtype: day.subtype || 'zone2', durationMin: day.durationMin || null, summary: day.summary || null };
      // v11.75: la clave de sus alternativas (`ALT_LIBRARY`). Estaba en la semilla desde T4 y se
      // perdía aquí, así que la tarjeta del día no tenía de dónde sacar las opciones y el bloque
      // 'Pick one' no se pintaba nunca, en silencio.
      if (day.alt) tpl[day.dow].alt = day.alt;
    } else if (day.kind === 'recovery') {
      tpl[day.dow] = { type: 'recovery', label: day.title || 'Active recovery', subtype: day.subtype || 'mobility' };
      if (day.z2Finisher) tpl[day.dow].z2FinisherMin = day.z2Finisher;
      if (day.z2FinisherModality) tpl[day.dow].z2FinisherModality = day.z2FinisherModality;
    }
  }
  return tpl;
}

// T5: install the ideal plan as the LIVE default plan source (replaces the re-entry ramp).
// Idempotent: only writes a new version when the target label differs (or force=true).
// Never clobbers a manually-created custom plan unless forced (user taps the selector).
// Bump when PLAN.sessions or the IDEAL day structure changes, so devices already running
// the same label still regenerate. Without this, applyIdealPlan() returns early on label
// match and a session edit shipped in an update would never reach the phone.
// 2 = v11.35 (D2: Pec Deck A->B + Lat Pulldown into A; D3: variant 5 keeps lowerB).
// 3 = v11.37 (fullA: Cable Crunch->Pallof + RDL; fullB: Hanging Leg Raise->Ab Wheel).
// 4 = v11.38 (fullA: RDL->Seated Leg Curl; fullB: +Leg Extension).
// 5 = v11.42 (pliometría en lowerA; sesiones de viaje; híbrido trineo+SkiErg).
// 6 = v11.45 (nombres de ejercicio a inglés: la tarjeta de la sesión lee `ex.name` del plan, así
//     que sin este bump seguiría diciendo "Dominadas" mientras el historial dice "Pull-ups").
// 7 = v11.47 (Upper B de 7 a 5 ejercicios, con el core al principio).
// 8 = v11.48 (calentamientos: fuera las rampas fijas de %, prep de overhead en upperB/fullB,
//     bracing en lowerB, tobillo en lowerA; los pogo hops pasan de ejercicio a calentamiento).
// 9 = v11.70 (box jump y sled push pasan de 'Quads' a 'Power': el validador contaba 16 series de
//     cuádriceps a la semana cuando eran 13 y disparaba VOL-CAP en rojo en cada propuesta del coach).
// 10 = v11.72 (F-8: la variante de 5 días vuelve a lower/upper/upper — empuje y tirón a 2x/semana,
//     STR-002, con la bisagra en el RDL de lowerA. F-15: `z2FinisherModality` en los días con
//     finisher, para que "20' Z2" diga TAMBIÉN en qué — bici/ski tras pierna, cinta tras torso).
// 11 = v11.75 (la plantilla se queda el `alt` de cada día de cardio: sin él, el bloque
//      "Pick one" de la tarjeta no tenía alternativas que ofrecer y no se pintaba, en silencio).
const PLAN_REV = 11;

async function applyIdealPlan({ force = false } = {}) {
  const n = _idealVariant();
  const lbl = (activePlan && activePlan.label) || '';
  const author = (activePlan && activePlan.author) || null;

  // COACH V2 (v11.61). Un plan del COACH o del USUARIO no se regenera desde la semilla — ni
  // aunque suba `PLAN_REV`. `PLAN_REV` pasa a ser "revisión de la SEMILLA": gobierna los planes
  // `ideal-seed` y dentro de los del coach viaja como `seedRev`, para saber con qué semilla se
  // construyeron. Sin este gate, un arreglo de calentamiento que sube PLAN_REV borraría en el
  // siguiente arranque la propuesta que Julian aprobó el lunes — con sus kg y su carrera.
  // Los arreglos de la semilla siguen llegando: `startWorkout` cae a `PLAN.sessions[id].warmup`,
  // y la próxima propuesta del coach se construye sobre el plan vivo.
  if ((author === 'coach-llm' || author === 'user') && !force) {
    const antes = (state.settings && state.settings.planRev) != null ? state.settings.planRev : null;
    if (antes !== PLAN_REV) {
      // El flag sube igual: si no, esto se registraría en cada arranque. Se anota UNA vez.
      state.settings.planRev = PLAN_REV;
      try { await smartPut('settings', { key: 'userSettings', data: state.settings }); } catch (e) {}
      console.log(`[Plan] PLAN_REV ${antes} → ${PLAN_REV} con plan "${author}" activo: no se regenera`);
      try {
        await logDecision({
          source: 'rule', type: 'other',
          what: `Plan seed up to date at PLAN_REV ${PLAN_REV}; the active plan (${author}) is kept`,
          why: 'PLAN_REV governs seed plans only; in coach plans it travels as seedRev',
          ruleIds: [],
          evidence: { desde: antes, hasta: PLAN_REV, plan: (activePlan && activePlan.id) || null },
          ref: { planVersion: (activePlan && activePlan.version) != null ? activePlan.version : null },
          outcome: 'done',
        });
      } catch (e) { /* el log no puede impedir el arranque */ }
    }
    return;
  }

  const managed = /^Ideal/.test(lbl) || lbl === 'Upper/Lower 4-Day Split' || lbl === 'Fallback' || /^Re-Entry/.test(lbl);
  if (!managed && !force) return; // respect a custom plan the user set themselves
  const targetLabel = `Ideal · ${n} days`;
  const revStale = (state.settings && state.settings.planRev) !== PLAN_REV;
  if (lbl === targetLabel && !force && !revStale) return; // already current → no version churn
  if (revStale) {
    state.settings.planRev = PLAN_REV;
    try { await smartPut('settings', { key: 'userSettings', data: state.settings }); } catch (e) {}
  }
  await createNewPlanVersion({
    label: targetLabel,
    weekNumber: getWeekNumber(),
    sessions: JSON.parse(JSON.stringify(PLAN.sessions)),
    weekTemplate: buildWeekTemplateFromIdeal(n),
  });
  if (state.settings.unit !== 'kg') {
    state.settings.unit = 'kg';
    await smartPut('settings', { key: 'userSettings', data: state.settings });
  }
  console.log(`[Plan] Ideal default → "${targetLabel}"`);
}

// T5.1: clear per-date schedule overrides for TODAY and FUTURE dates, so a regenerated
// plan shows up immediately on the current week. Past days keep their overrides (history).
async function clearFutureScheduleOverrides() {
  try {
    const sched = await getWeekSchedule();
    const t = today();
    let changed = false;
    for (const ds of Object.keys(sched)) { if (ds >= t) { delete sched[ds]; changed = true; } }
    if (changed) await saveWeekSchedule(sched);
  } catch (e) {
    // C-28: era un `catch {}`. Si esto falla, los cambios de día hechos a mano SOBREVIVEN al
    // plan nuevo y la semana que se pinta no es la que el coach propuso — un fallo que se nota
    // como "el plan no se aplicó" y que no dejaba ni una línea en la consola.
    console.warn('[Plan] clearFutureScheduleOverrides:', e);
    if (typeof toast === 'function') toast(`Manual day changes kept: ${errText(e)}`);
  }
}

// T5.1: user flexes the day-count (3/4/5/6; 6 = the full ideal). Persists the choice (synced),
// regenerates the plan FORWARD, clears future overrides so the change is visible immediately,
// and preserves past/done days. Logs (workouts/runs/sessions) are never touched.
async function setIdealVariant(n) {
  if (![0, 3, 4, 5, 6].includes(n)) return;
  const author = (activePlan && activePlan.author) || null;
  const coachActivo = author === 'coach-llm' || author === 'user';
  const changed = n !== _idealVariant()
    || (!coachActivo && !/^Ideal/.test((activePlan && activePlan.label) || ''));
  state.settings.idealVariant = n;
  await smartPut('settings', { key: 'userSettings', data: state.settings });
  if (changed) {
    // VARIANTE = CALENDARIO, COACH = CONTENIDO (§A.8). Con un plan del coach vivo, un
    // `applyIdealPlan({force:true})` reinstalaría `PLAN.sessions` y borraría los kg, el foco y
    // la carrera de esta semana. Cambiar de 6 a 4 días es una decisión de AGENDA.
    if (coachActivo) await _applyVariantOverCoachPlan(n);
    else await applyIdealPlan({ force: true });
    await clearFutureScheduleOverrides();
  }
  try { await renderHomeView(); } catch (e) {}
  try { await renderIdealPreview(); } catch (e) {}
  if (changed) {
    const lbl = (IDEAL_BLOCK_V1.variants[n] && IDEAL_BLOCK_V1.variants[n].label) || `${n} days`;
    toast(`Plan: ${lbl} — past days untouched`);
  }
}

/**
 * Nueva variante de CALENDARIO sobre un plan del coach (v11.61).
 *
 * El `weekTemplate` sale de la variante elegida; las `sessions`, el `running` y el `weekKey`
 * son los del plan vivo. La versión resultante es `author:'user'` porque la decisión es del
 * usuario: así el gate de `applyIdealPlan` sigue protegiéndola y el propio coach ve en
 * `facts.plan.author` que el calendario lo movió él, no el modelo.
 */
async function _applyVariantOverCoachPlan(n) {
  const prev = activePlan;
  const wkShort = prev && prev.weekKey ? String(prev.weekKey).replace(/^\d{4}-/, '') : null;
  const lblVar = (IDEAL_BLOCK_V1.variants[n] && IDEAL_BLOCK_V1.variants[n].label) || `${n} days`;
  const nuevo = await createNewPlanVersion({
    label: `Coach${wkShort ? ` · ${wkShort}` : ''} · ${lblVar}`,
    weekNumber: getWeekNumber(),
    sessions: (prev && prev.sessions) || PLAN.sessions,
    weekTemplate: buildWeekTemplateFromIdeal(n),
    meta: {
      schema: 2, status: 'active', author: 'user',
      basedOn: (prev && prev.id) || null,
      weekKey: (prev && prev.weekKey) || null,
      reviewId: (prev && prev.reviewId) || null,
      block: (typeof blockWeek === 'function') ? blockWeek() : null,
      running: (prev && prev.running) || null,
      seedRev: PLAN_REV,
      // v11.65: el brief del coach viaja con el contenido. Cambiar de 6 a 4 días es una
      // decisión de AGENDA; dejar la versión nueva sin `coachBrief` vaciaría la Home ("por
      // qué cambia / por qué se mantiene") por haber tocado el calendario.
      coachBrief: (prev && prev.coachBrief) || null,
    },
  });
  if (prev && prev.id) {
    try { await smartPut('plans', { ...prev, status: 'superseded', supersededBy: nuevo.id }); } catch (e) {}
  }
  try {
    await logDecision({
      source: 'user', type: 'plan-adjust',
      what: `Calendar switched to ${lblVar}; the coach's content is kept`,
      why: 'Variant = calendar, coach = content',
      ruleIds: [],
      evidence: { variante: n, desde: (prev && prev.label) || null, plan: nuevo.id },
      ref: { planVersion: nuevo.version },
      outcome: 'done',
    });
  } catch (e) {}
  return nuevo;
}
const _DOW_LABEL = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 0: 'Sun' };
const _DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
function _idealKindFamily(kind) {
  return kind === 'cardio' ? 'cardio' : kind === 'hybrid' ? 'hybrid' : kind === 'recovery' ? 'recovery' : 'strength';
}
function _currentWeekLabel(dow) {
  const slot = (activeWeekTemplate && activeWeekTemplate[dow]) || { type: 'rest' };
  if (slot.type === 'gym' && slot.session) {
    const s = (activePlan && activePlan.sessions) ? activePlan.sessions[slot.session] : null;
    return s ? _t3SessionLabel({ type: 'gym', sessionId: slot.session, name: s.name, exercises: s.exercises }) : slot.session;
  }
  if (slot.type === 'run') return slot.label || 'Z2 run';
  return (slot.label && slot.label !== 'Rest') ? slot.label : 'Rest';
}

// Per-day guidance text for the ideal week (full session + quick-mode + Z2 finisher).
// `prog` (v11.56) = los minutos ya progresados por la semana del bloque, cuando difieren de la
// base. La base se sigue mostrando: el plan es el dato, la progresión es una función sobre él, y
// esconder la base haría creer que alguien editó `IDEAL_BLOCK_V1`.
function _idealDayGuide(d, prog) {
  const upd = (base) => (prog != null && base && prog !== base) ? ` → <b>${prog}'</b> this week` : '';
  if (d.kind === 'strength') return `Full session 60-75' (quick-mode 40-45')${d.z2Finisher ? ` · +${d.z2Finisher}' Z2 at the end${upd(d.z2Finisher)}` : ''}`;
  if (d.kind === 'cardio') return `${d.durationMin || 35}' ${d.subtype === 'long_easy' ? 'quality' : 'easy'}${upd(d.durationMin)}`;
  if (d.kind === 'recovery') return `Mobility + core${d.z2Finisher ? ` · easy Z2 ${d.z2Finisher}'${upd(d.z2Finisher)}` : ''}`;
  return '';
}

// C-24 (auditoría 2026-09-09): LA ÚNICA suma de días de app.js. Se llamaba `_plusDaysStr` y
// convivía con cuatro variantes a mano — `new Date(Date.parse(ds + 'T12:00:00') ± n*86400000)`
// en tres sitios de este fichero y un `d.setDate(d.getDate() - 1)` en whoop.js. Todas hacían
// "más o menos" lo mismo, y "más o menos" con fechas es lo que costó `tz_date_migration_v2`.
//
// Aritmética en UTC, igual que `mondayOf`/`isoWeekKey` del motor: sumar días sobre un Date
// construido en hora local se desplaza un día en los cambios de horario.
//
// 'YYYY-MM-DD' → 'YYYY-MM-DD', o null si la entrada no es una fecha.
function addDays(ds, n) {
  if (!ds) return null;
  const t = Date.parse(String(ds).slice(0, 10) + 'T00:00:00Z');
  if (!isFinite(t)) return null;
  return new Date(t + n * 86400000).toISOString().slice(0, 10);
}

// "Sep 7", para las fechas del bloque ("block from Sep 7 to Sep 13"). En inglés desde v11.67.
function _shortDate(ds) {
  if (!ds) return '—';
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(ds + 'T12:00:00');
  return `${M[d.getMonth()]} ${d.getDate()}`;
}

// Render the Ideal Plan view (the LIVE plan). Day-count selector regenerates it.
async function renderIdealPreview() {
  const host = document.getElementById('ideal-preview-body');
  if (!host) return;
  const v = _idealVariant();
  const variant = IDEAL_BLOCK_V1.variants[v] || IDEAL_BLOCK_V1.variants[6];
  const byDow = {};
  variant.days.forEach(d => { byDow[d.dow] = d; });

  // v11.56: dónde estás dentro del bloque de 5 semanas, y qué minutos toca ESTA semana.
  // Hasta ahora el preview mostraba la semana ideal como si las 5 fueran idénticas — que es
  // exactamente lo que eran (audit Change 11).
  const blk = blockWeek();
  const daysAgo = await lastCardioDaysAgo(today()).catch(() => null);
  const progFor = (d) => {
    if (typeof progressCardioMin !== 'function') return null;
    const base = d.kind === 'cardio' ? (d.durationMin || null) : (d.z2Finisher || null);
    if (!base) return null;
    return progressCardioMin(base, blk, { variant: v, lastCardioDaysAgo: daysAgo, coachMin: null }).min;
  };
  const blockLine = blk.index
    ? `Week <b>${blk.index}/${DELOAD_BLOCK_WEEKS}</b> · ${blk.label} · block from ${_shortDate(blk.blockStartMonday)} to ${_shortDate(addDays(blk.blockStartMonday, 6))} · deload the week of ${_shortDate(blk.deloadMonday)}`
    : 'No block anchor yet — cardio repeats the base duration.';

  const variantToggle = [0, 3, 4, 5, 6].map(n => {
    const lab = n === 0 ? 'Travel' : n === 6 ? 'Ideal' : `${n}d`;
    return `<button class="ip-tog ${n === v ? 'active' : ''}" data-ip-variant="${n}">${lab}</button>`;
  }).join('');

  const idealRows = _DOW_ORDER.map(dow => {
    const d = byDow[dow];
    if (!d) return `<div class="ip-day ip-rest"><div class="ip-dow">${_DOW_LABEL[dow]}</div><div class="ip-day-main"><div class="ip-day-title">Rest</div></div></div>`;
    const tone = typeTone(_idealKindFamily(d.kind));
    const lvl = _t3WeightWord(d.bw);
    const altArr = (d.alt && ALT_LIBRARY[d.alt]) ? ALT_LIBRARY[d.alt].slice(0, 2).map(o => o.label) : [];
    return `<div class="ip-day"><div class="ip-dow">${_DOW_LABEL[dow]}</div>
      <div class="ip-day-main">
        <div class="ip-day-title">${d.title} <span class="ip-level" style="color:${tone};background:${tone}1a">${lvl}</span></div>
        <div class="ip-day-why">${d.why}${d.summary ? ` · ${d.summary}` : ''}</div>
        <div class="ip-day-dur">${_idealDayGuide(d, progFor(d))}</div>
        ${altArr.length ? `<div class="ip-day-alt">Alt: ${altArr.join(' · ')}</div>` : ''}
      </div></div>`;
  }).join('');

  const currentRows = _DOW_ORDER.map(dow => `<div class="ip-cur-row"><span class="ip-dow">${_DOW_LABEL[dow]}</span><span>${_currentWeekLabel(dow)}</span></div>`).join('');

  host.innerHTML = `
    <div class="ip-goal card">
      <div class="t3-eyebrow">Your plan</div>
      <div class="ip-goal-title">${IDEAL_BLOCK_V1.goal}</div>
      <div class="ip-goal-sub"><b>Progressing:</b> ${IDEAL_BLOCK_V1.progressing.join(', ')}</div>
      <div class="ip-goal-sub"><b>Maintaining:</b> ${IDEAL_BLOCK_V1.maintaining.join(', ')}</div>
      <div class="ip-goal-sub"><b>Cardio:</b> ${IDEAL_BLOCK_V1.runningArc}</div>
    </div>
    <div class="ip-toggles"><div class="ip-tog-group">${variantToggle}</div></div>
    <div class="ip-block card"><div class="plan-block-eyebrow">Block</div><div class="ip-block-line">${blockLine}</div></div>
    <div class="ip-note">${variant.note}</div>
    <div class="section-label" style="margin-top:10px">Week</div>
    <div class="ip-week">${idealRows}</div>
    <div class="section-label" style="margin-top:16px">This week in your calendar</div>
    <div class="ip-current card">${currentRows}</div>
    <div class="section-label" style="margin-top:16px">Cautions it respects</div>
    <ul class="ip-cautions">${IDEAL_BLOCK_V1.cautions.map(c => `<li>${c}</li>`).join('')}</ul>
    <div class="ip-equip">Machine taken or missing kit? Tap the exercise inside the session and pick a substitute: the swap is saved and stays, and you can go back to the original whenever you want.</div>
    <div class="t3-foot">This is your live plan. <b>Ideal</b> = the full week (a stimulus all 7 days). Drop days on travel weeks — it only changes going forward; your logged sessions stay untouched.</div>
  `;
  host.querySelectorAll('[data-ip-variant]').forEach(b => b.addEventListener('click', () => { setIdealVariant(parseInt(b.dataset.ipVariant, 10)); }));
}

function openIdealPreview() {
  enterSecondaryView('ideal-preview');
  renderIdealPreview().catch(e => console.warn('[Ideal] preview:', e));
}

// ==================== ANALÍTICA DE SANGRE (v11.43) ====================
//
// Los datos y la rúbrica viven en bloodwork.js. Esto solo pinta.
//
// Dos decisiones de diseño que importan:
//  1. Puntaje y ANTIGÜEDAD son ejes SEPARADOS y se pintan separados. Un 5 de hace tres años no
//     es un 5 de hoy, y una sola insignia mezclada haría exactamente esa lectura falsa.
//  2. Los marcadores sin puntaje NO se esconden. "No se puntúa, y este es el motivo" es
//     información; borrarlos daría la impresión de que la tabla está completa.
//
// LONG-003: nada de esto dispara ninguna regla de programación. Es lectura.

function _anScoreDots(score) {
  if (score == null) return '<span class="an-noscore">not scored</span>';
  const dots = [1, 2, 3, 4, 5].map(i => `<span class="an-dot${i <= score ? ' on' : ''}"></span>`).join('');
  return `<span class="an-score s${score}">${dots}<b>${score}/5</b></span>`;
}

function _anFmt(v, unit) {
  if (v == null) return '—';
  // Punto decimal: la UI es toda en inglés desde v11.67.
  const s = (Math.round(v * 100) / 100).toString();
  return unit ? `${s} ${unit}` : s;
}

function _anMonthYear(iso) {
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const d = new Date(iso + 'T00:00:00');
  return `${M[d.getMonth()]}-${d.getFullYear()}`;
}

// Serie inline en texto, sin librería de gráficos: 149 → 170 → 143. Con la etiqueta del
// laboratorio cuando cambia, porque comparar entre laboratorios no es comparar lo mismo.
function _anSeriesLine(series, unit) {
  if (!series || series.length < 2) return '';
  const labs = new Set(series.map(s => s.lab));
  const parts = series.map(s => {
    const lab = labs.size > 1 ? ` <i>${s.lab}</i>` : '';
    return `<span class="an-pt">${_anFmt(s.value)}<em>${_anMonthYear(s.date)}${lab}</em></span>`;
  });
  return `<div class="an-series">${parts.join('<span class="an-arrow">→</span>')}</div>`;
}

// Orden deliberado, tras el aviso de Julian de que la sección "no decía nada de qué sucede":
// LO QUE SIGNIFICA su valor va VISIBLE, sin desplegar. Al desplegar: qué es el marcador y qué hacer.
// Y la metodología —rango del laboratorio, objetivo de guía, fuente, por qué no se puntúa— al final,
// que es dónde debió estar desde el principio. Antes ocupaba el sitio de la interpretación.
function _anMarkerRow(latest) {
  const d = latest.def;
  const stale = latest.stale;
  const state = d.states ? bloodMarkerState(d.key, latest.value) : null;

  const detalle = [];
  if (d.what) detalle.push(`<div class="an-block"><span class="an-block-h">What it is</span>${d.what}</div>`);
  if (d.action) detalle.push(`<div class="an-block an-block-do"><span class="an-block-h">What to do</span>${d.action}</div>`);
  if (d.confounder) detalle.push(`<div class="an-warn">⚠️ Watch out: ${d.confounder}</div>`);
  if (d.caution) detalle.push(`<div class="an-warn">⚠️ ${d.caution}</div>`);

  // Metodología, plegada aparte para que no compita con lo anterior.
  const metodo = [];
  if (d.labRange) metodo.push(`<div class="an-meta"><span>Lab</span> ${d.labRange}</div>`);
  if (d.target) metodo.push(`<div class="an-meta"><span>Guidelines</span> ${d.target}</div>`);
  if (d.source) metodo.push(`<div class="an-meta"><span>Source</span> ${d.source}</div>`);
  if (d.noScore) metodo.push(`<div class="an-why">${d.noScore}</div>`);
  if (d.note) metodo.push(`<div class="an-why">${d.note}</div>`);

  return `
    <details class="an-marker">
      <summary>
        <div class="an-head">
          <div class="an-name">${d.label}${d.uncertain ? ' <span class="an-unc">not legible</span>' : ''}</div>
          ${_anScoreDots(latest.score)}
        </div>
        <div class="an-sub">
          <b>${_anFmt(latest.value, d.unit)}</b>
          <span class="an-date">${_anMonthYear(latest.date)}</span>
          <span class="an-stale ${stale.level}">${stale.label}</span>
          ${state ? `<span class="an-state">${state}</span>` : ''}
        </div>
        ${d.meaning ? `<div class="an-meaning">${d.meaning}</div>` : ''}
      </summary>
      <div class="an-detail">
        ${_anSeriesLine(latest.series, d.unit)}
        ${detalle.join('')}
        ${metodo.length ? `<details class="an-method"><summary>Ranges and sources</summary>${metodo.join('')}</details>` : ''}
      </div>
    </details>`;
}

// El resumen del conjunto, que es lo que faltaba: qué pasa, qué va bien, qué vigilar y qué lo
// mejoraría. Va PRIMERO, antes de cualquier marcador.
function _anSummary() {
  if (typeof BLOOD_SUMMARY === 'undefined' || !BLOOD_SUMMARY) return '';
  const s = BLOOD_SUMMARY;
  const lista = (items, cls, titulo, icono) => (items && items.length) ? `
    <div class="an-sum-block ${cls}">
      <div class="an-sum-h">${icono} ${titulo}</div>
      <ul class="an-sum-list">${items.map(i => `<li>${i}</li>`).join('')}</ul>
    </div>` : '';
  return `
    <div class="an-summary">
      ${s.titular ? `<div class="an-sum-lead">${s.titular}</div>` : ''}
      ${s.queEstaPasando ? `<div class="an-sum-body">${s.queEstaPasando}</div>` : ''}
      ${lista(s.loQueVaBien, 'good', 'What is going well', '✓')}
      ${lista(s.loQueVigilar, 'watch', 'What to watch', '!')}
      ${lista(s.loQueLoMejoraria, 'improve', 'What would improve it', '→')}
      ${s.laLimitacion ? `<div class="an-sum-limit">${s.laLimitacion}</div>` : ''}
    </div>`;
}

function renderAnalytics() {
  const host = document.getElementById('analytics-body');
  if (!host) return;
  if (typeof BLOOD_MARKERS === 'undefined') {
    host.innerHTML = '<p class="muted">bloodwork.js did not load.</p>';
    return;
  }

  const fresh = bloodFreshnessSummary();
  const groups = BLOOD_FAMILIES.map(f => {
    const rows = BLOOD_MARKERS
      .filter(m => m.family === f.key)
      .map(m => bloodMarkerLatest(m.key))
      .filter(Boolean)
      // Peor puntaje primero: lo que hay que mirar va arriba. Los sin puntaje, al final.
      .sort((a, b) => (a.score == null ? 99 : a.score) - (b.score == null ? 99 : b.score));
    if (!rows.length) return '';
    return `<div class="clib-group">${f.label}</div>${rows.map(_anMarkerRow).join('')}`;
  }).join('');

  const supps = BLOOD_SUPPLEMENTS.worth.map(s => `
    <details class="an-marker">
      <summary>
        <div class="an-head"><div class="an-name">${s.name}</div><span class="clib-badge">${s.tier}</span></div>
        <div class="an-sub"><b>${s.dose}</b></div>
      </summary>
      <div class="an-detail">
        <div class="an-meta"><span>Effect</span> ${s.effect}</div>
        <div class="an-meta"><span>Source</span> ${s.source}</div>
        <div class="an-warn">⚠️ ${s.caveat}</div>
      </div>
    </details>`).join('');

  host.innerHTML = `
    <div class="ip-goal">
      <div class="ip-goal-title">Bloodwork</div>
      <div class="ip-goal-sub">6 panels · 2021-2025 · ${fresh.total} markers measured, ${fresh.scored} scored</div>
    </div>

    ${_anSummary()}

    <div class="an-disclaimer">
      <b>This is historical context, not a diagnosis.</b> The score describes where your value falls
      against <i>published</i> targets — not against the lab's range, which is a different thing.
      It does not replace a doctor and <b>it does not change any training</b>.
    </div>

    ${fresh.overdue ? `
    <div class="an-overdue">
      <b>Time to repeat the bloodwork.</b> The newest panel is from ${_anMonthYear(fresh.newestDate)}:
      <b>${fresh.newestMonths} months</b> ago. ${fresh.historic} markers are older than 24 months and
      ${fresh.neverMeasured} were never measured. <b>No value here describes your state today.</b>
    </div>` : ''}

    ${groups}

    <div class="clib-group">Never measured</div>
    ${BLOOD_NEVER_MEASURED.map(n => `
      <details class="an-marker an-never">
        <summary>
          <div class="an-head"><div class="an-name">${n.label}</div><span class="an-noscore">no data</span></div>
        </summary>
        <div class="an-detail"><div class="an-why">${n.why}</div></div>
      </details>`).join('')}

    <div class="clib-group">What to ask for next time</div>
    <div class="card" style="padding:14px 16px">
      <ul class="an-list">${BLOOD_REQUEST_LIST.map(r => `<li>${r}</li>`).join('')}</ul>
      <div class="an-cond">${BLOOD_REQUEST_CONDITIONS}</div>
      <button id="an-copy" class="btn-secondary btn-full" style="text-align:center;margin-top:12px">Copy the list</button>
    </div>

    <div class="clib-group">Evidence-based supplementation</div>
    ${supps}
    <details class="an-marker">
      <summary>
        <div class="an-head"><div class="an-name">Not worth it</div><span class="an-noscore">${BLOOD_SUPPLEMENTS.notWorth.length}</span></div>
      </summary>
      <div class="an-detail">
        ${BLOOD_SUPPLEMENTS.notWorth.map(s => `<div class="an-meta"><span>${s.name}</span> ${s.why}</div>`).join('')}
        <div class="an-warn">⚠️ ${BLOOD_SUPPLEMENTS.risk}</div>
      </div>
    </details>

    <div class="t3-foot">
      Nothing in this section corrects a deficiency: that takes a protocol, a duration and follow-up
      testing, and it belongs to your doctor. The full analysis, with the rubric and the sources, is in
      <b>data/processed/2026-08-20_analitica-puntuada.md</b>.
    </div>
  `;

  const copy = document.getElementById('an-copy');
  if (copy) copy.addEventListener('click', async () => {
    const txt = 'Bloodwork to request:\n' + BLOOD_REQUEST_LIST.map(r => `- ${r}`).join('\n')
      + `\n\nConditions: ${BLOOD_REQUEST_CONDITIONS}`;
    try {
      await navigator.clipboard.writeText(txt);
      copy.textContent = '✓ Copied';
      setTimeout(() => { copy.textContent = 'Copy the list'; }, 1800);
    } catch (e) {
      // iOS niega el portapapeles fuera de un gesto directo en algunos casos. Mostrar el
      // texto es mejor que un fallo silencioso: se puede seleccionar a mano.
      copy.textContent = 'Could not copy — long-press the text instead';
    }
  });
}

function openAnalytics() {
  enterSecondaryView('analytics');
  renderAnalytics();
}

// T5.1: compact day-count selector on Home. Default 6 = the full ideal; flex down for busy weeks.
async function renderPlanSelector() {
  const container = document.getElementById('plan-selector');
  if (!container) return;
  const v = _idealVariant();
  const variant = IDEAL_BLOCK_V1.variants[v] || IDEAL_BLOCK_V1.variants[6];
  const days = variant.days || [];
  const strengthN = days.filter(d => d.kind === 'strength').length;
  const cardioN = days.filter(d => d.kind === 'cardio').length;
  const z2N = days.filter(d => d.z2Finisher).length;
  const toggles = [0, 3, 4, 5, 6].map(n => {
    const lab = n === 0 ? '🧳' : n === 6 ? 'Ideal' : `${n}`;
    return `<button class="ip-tog ${n === v ? 'active' : ''}" data-ps-variant="${n}">${lab}</button>`;
  }).join('');
  container.innerHTML = `
    <div class="home-sec-row" style="margin-top:24px">
      <h2 class="home-h2">Your plan</h2>
      <span class="home-link-mono" id="plan-detail">View ›</span>
    </div>
    <div class="card" style="padding:14px 16px">
      <div class="ip-tog-group" style="display:flex;gap:6px;margin-bottom:10px">${toggles}</div>
      <div class="muted" style="font-size:12.5px;line-height:1.5">
        <b>${variant.label}</b> · ${strengthN} strength + ${cardioN} cardio${z2N ? ` · Z2 on ${z2N} days` : ''}
      </div>
    </div>`;
  container.querySelectorAll('[data-ps-variant]').forEach(b => b.addEventListener('click', () => setIdealVariant(parseInt(b.dataset.psVariant, 10))));
  const det = container.querySelector('#plan-detail');
  if (det) det.onclick = () => openIdealPreview();
}

// ==================== HOME STAT TRIO (Lovable dashboard cards) ====================
// Readiness (WHOOP de HOY) · Strain (weekly RPE load) · Streak (weeks) · Volume (weekly kg).
//
// v11.65: entra `Readiness` y sale de Home la línea de texto de recuperación (se mudó a
// Stats › Today). El dato del wearable es UN NÚMERO y su sitio es la fila de números del
// dashboard, no un párrafo debajo de la sesión del día.
//
// HONESTIDAD DE FECHA (F-6). El valor sale de `getWhoopContext()`, que devuelve el dato SÓLO
// si su fecha es la de hoy (`recs.find(r => r.date === today())`). Aquí no se lee el store
// `wellness`: su fila de ayer, pintada sin fecha en un tile, sería exactamente la mentira que
// v11.58 quitó. Sin dato de hoy el tile dice "—", y el sub dice por qué.
//
// Bandas de color = las de WHOOP (`getRecoveryColor`): ≥67 verde, 34-66 amarillo, <34 rojo.
// Es el único sitio de Home con color por estado, y se lo puede permitir porque es el número
// del wearable tal cual, sin recomendación pegada al lado.
async function renderHomeStatTrio() {
  const container = document.getElementById('home-stat-trio');
  if (!container) return;
  const weekDates = getWeekDates().map(dateStr);
  const weekStart = weekDates[0], weekEnd = weekDates[6];
  const workouts = await dbGetAll('workouts');
  const weekWorkouts = workouts.filter(w => w.date >= weekStart && w.date <= weekEnd);

  // V-5 (auditoría 2026-09-08): STRAIN = Σ(RPE × series hechas), y SÓLO con las series que
  // llevan RPE anotado.
  //
  // Era `parseFloat(s.rpe) || 7`: sin RPE anotado la serie contaba como 7, así que el número
  // era ≈ 7 × series — un contador de series disfrazado de carga interna, en un tile que imita
  // la escala 0-21 de WHOOP. Dos series al fallo sin anotar daban lo mismo que dos series
  // fáciles sin anotar, y una semana entera sin anotar un solo RPE daba un "strain" alto.
  // Ahora: si NINGUNA serie de la semana lleva RPE, el tile dice "—" / "LOG RPE", que es la
  // información de verdad (falta el dato, y así se consigue). El sub pasa a "RPE LOAD" porque
  // esto no es el strain de WHOOP y no debe leerse como si lo fuera.
  let volume = 0, strain = 0, strainSets = 0;
  weekWorkouts.forEach(w => {
    (w.exercises || []).forEach(ex => {
      (ex.sets || []).forEach(s => {
        if (s.done) {
          const wt = parseFloat(s.weight) || 0, reps = parseInt(s.reps) || 0;
          volume += wt * reps;
          const rpe = parseFloat(s.rpe);
          if (Number.isFinite(rpe) && rpe > 0) { strain += rpe; strainSets++; }
        }
      });
    });
  });

  // Weeks streak: consecutive prior ISO weeks with >=4 training days
  const weekDays = {};
  workouts.forEach(w => {
    if (!w.date) return;
    const k = isoWeekKey(w.date);
    (weekDays[k] = weekDays[k] || new Set()).add(w.date);
  });
  const curKey = isoWeekKey(today());
  let streak = 0;
  for (const k of Object.keys(weekDays).sort().reverse()) {
    if (k === curKey) continue;
    if (weekDays[k].size >= 4) streak++; else break;
  }

  const volTxt = volume >= 1000 ? `${(volume / 1000).toFixed(volume >= 10000 ? 0 : 1)}k` : String(Math.round(volume));

  // El WHOOP de HOY, o nada. `whoopIsConnected`/`integrationsIsActive` con `typeof` porque
  // viven en whoop.js/integrations.js, que se cargan por <script> aparte.
  // V-23 (auditoría 2026-09-09): el tile decía "— / WHOOP OFF" y ahí se acababa. Es la
  // primera pantalla de la app y el único sitio donde se ve que falta una integración: ahora
  // ES el botón que lleva a conectarla. Y con dato, el sub dice DE CUÁNDO es la lectura, que
  // es la mitad de la información en un número que caduca cada mañana.
  let rd = { value: '—', sub: 'NO DATA', tone: 'var(--text3)', action: null };
  try {
    const wc = await getWhoopContext();
    if (wc && wc.score != null) {
      const hhmm = (typeof whoopClock === 'function' && wc.fetchedAt) ? whoopClock(wc.fetchedAt) : '';
      rd = {
        value: String(Math.round(wc.score)),
        sub: hhmm ? `TODAY ${hhmm}` : 'TODAY',
        tone: wc.score >= 67 ? 'var(--accent)' : (wc.score >= 34 ? 'var(--yellow)' : 'var(--red)'),
        action: null,
      };
    } else {
      const conectado = (typeof whoopIsConnected === 'function')
        ? whoopIsConnected()
        : ((typeof integrationsIsActive === 'function') ? integrationsIsActive('whoop') : true);
      if (!conectado) { rd.sub = 'CONNECT'; rd.action = 'integrations-card'; }
      else if (wc && wc.lastAvailable && wc.lastAvailable.date) {
        rd.sub = String((typeof whoopDayLabel === 'function' ? whoopDayLabel(wc.lastAvailable.date, today()) : wc.lastAvailable.date)).toUpperCase();
      }
    }
  } catch (e) { /* el tile ya dice "—": no hay nada que inventar */ }

  const cards = [
    { label: 'Readiness', value: rd.value, sub: rd.sub, tone: rd.tone, action: rd.action },
    // "Strain" era el nombre de WHOOP para una escala 0-21 que esto no es: aquí es
    // Σ(RPE × series hechas) de la semana. Se llama por su nombre.
    { label: 'RPE Load', value: strainSets ? String(Math.round(strain)) : '—', sub: strainSets ? 'THIS WEEK' : 'LOG RPE', tone: strainSets ? 'var(--blue)' : 'var(--text3)' },
    { label: 'Streak', value: String(streak), sub: streak === 1 ? 'WEEK' : 'WEEKS', tone: 'var(--yellow)' },
    { label: 'Volume', value: volTxt, sub: 'KG', tone: 'var(--accent)' },
  ];
  container.innerHTML = `
    <div class="stat-trio">
      ${cards.map(c => `
        <${c.action ? 'button type="button"' : 'div'} class="stat-card"${c.action ? ` data-stat-goto="${c.action}"` : ''}>
          <div class="stat-card-label">${c.label}</div>
          <div class="stat-card-val" style="color:${c.tone}">${c.value}</div>
          <div class="stat-card-sub">${c.sub}</div>
        </${c.action ? 'button' : 'div'}>`).join('')}
    </div>`;
  container.querySelectorAll('[data-stat-goto]').forEach((b) => {
    b.addEventListener('click', () => openSettingsAt(b.dataset.statGoto));
  });
}

// V-3/V-4: `_homeTypeTone` y `_homeCover` se van con las filas de la cola.
// `_homeTypeTone` ya no tenía llamadores antes de este incremento (delegaba en `typeTone`) y
// `_homeCover` sólo elegía la foto de las filas de `#home-queue`, que ahora es una línea sin
// foto. El hero de la sesión de hoy (`.sh-img`) tiene su propio selector de imagen.

// ==================== WEEK CALENDAR (Lovable single 7-day strip + Historial) ====================
async function renderWeekCalendar() {
  const container = document.getElementById('week-calendar');
  if (!container) return;
  const weekDates = getWeekDates();
  const todayStr = today();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const [workouts, runs, mobs, sessions] = await Promise.all([
    dbGetAll('workouts'), getRunsDeduped(), dbGetAll('mobility_sessions'), getSessionsDeduped()]);
  // Rich planned session per date (cardio/recovery-aware), so cardio days are not invisible.
  const plannedArr = await Promise.all(weekDates.map(d => getPlannedSessionForDate(d).catch(() => null)));

  let doneCount = 0;
  const cells = weekDates.map((date, i) => {
    const ds = dateStr(date);
    const jsDay = date.getDay();
    const isToday = ds === todayStr;
    const isPast = ds < todayStr;
    const gym = workouts.find(w => w.date === ds);
    const run = runs.find(r => r.date === ds);
    const mob = mobs.find(m => m.date === ds);
    const sess = sessions.find(s => s.date === ds); // logged cardio/recovery (unified store)
    const loggedCardio = run || (sess && sess.family === 'cardio');
    const loggedRecovery = mob || (sess && sess.family === 'recovery');
    const done = !!(gym || run || mob || sess);
    if (done) doneCount++;
    const planned = plannedArr[i];
    const pType = planned ? planned.type : null;

    // Two independent tracks per day: strength + cardio. State: done | planned | none.
    // (Past days show only what was logged — no "planned" ghosting.)
    const strengthState = gym ? 'done' : (!isPast && pType === 'gym') ? 'planned' : 'none';
    const cardioPlanned = !isPast && (pType === 'run' || (planned && planned.z2FinisherMin > 0));
    const cardioState = loggedCardio ? 'done' : cardioPlanned ? 'planned' : 'none';
    const recoveryOnly = !isPast && pType === 'recovery' && !planned.z2FinisherMin;

    const anyContent = strengthState !== 'none' || cardioState !== 'none' || loggedRecovery || recoveryOnly;
    const status = isToday ? 'today' : (anyContent ? 'active' : 'rest');

    const sCol = typeTone('strength'), cCol = typeTone('cardio');
    const track = isToday ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.10)';
    const line = (st, col) => {
      const bg = st === 'none' ? track : col;
      const op = st === 'done' ? 1 : st === 'planned' ? 0.5 : 1;
      return `<span class="wc-line" style="background:${bg};opacity:${op}"></span>`;
    };
    let dot;
    if (status === 'rest') dot = `<span class="wc-rest"></span>`;
    else dot = `<span class="wc-lines">${line(strengthState, sCol)}${line(cardioState, cCol)}</span>`;

    // v11.75 · LA ETIQUETA. Julian: "en This week debería aparecer qué hice cada día y qué
    // tengo que hacer los días que faltan". Antes la única diferencia entre hecho y pendiente
    // era la opacidad de una barra de 2 px, y los días pasados no enseñaban plan ninguno: un
    // martes fallado se veía igual que un martes de descanso.
    const nombreSesion = (sid) => {
      if (!sid) return null;
      const ses = (typeof activePlan !== 'undefined' && activePlan && activePlan.sessions) ? activePlan.sessions[sid] : null;
      return (ses && ses.name) || sid;
    };
    let etiqueta = '';
    let etiquetaEstado = '';          // done | pending | missed
    if (gym) { etiqueta = nombreSesion(gym.sessionId || gym.session) || 'Session'; etiquetaEstado = 'done'; }
    else if (loggedCardio) { etiqueta = (sess && sess.title) || (run && 'Run') || 'Cardio'; etiquetaEstado = 'done'; }
    else if (loggedRecovery) { etiqueta = 'Recovery'; etiquetaEstado = 'done'; }
    else if (pType === 'gym') { etiqueta = nombreSesion(planned.sessionId || planned.session) || 'Session'; etiquetaEstado = isPast ? 'missed' : 'pending'; }
    else if (pType === 'run') { etiqueta = planned.distanceKm ? `${planned.distanceKm} km` : (planned.durationMin ? `${planned.durationMin}'` : 'Cardio'); etiquetaEstado = isPast ? 'missed' : 'pending'; }
    else if (pType === 'recovery') { etiqueta = 'Mobility'; etiquetaEstado = isPast ? 'missed' : 'pending'; }
    else { etiqueta = 'Rest'; etiquetaEstado = 'rest'; }
    // El nombre largo no cabe en una columna de 48 px: se recorta por palabra.
    const corta = String(etiqueta).length > 9 ? String(etiqueta).split(/[ ·]/)[0].slice(0, 9) : etiqueta;

    return { i, ds, jsDay, isToday, dateNum: date.getDate(), label: dayNames[i], status, dot, gym, planned, etiqueta: corta, etiquetaEstado, etiquetaFull: etiqueta };
  });

  container.innerHTML = `
    <div class="home-sec-row">
      <h2 class="home-h2">This week</h2>
      <span class="home-link-mono">${doneCount} of ${cells.filter((c) => c.etiquetaEstado !== 'rest').length} done</span>
    </div>
    <div class="week-cal">
      ${cells.map(c => `
        <button class="wc-cell${c.isToday ? ' is-today' : ''}${c.status === 'rest' ? ' is-rest' : ''}" data-wc="${c.i}" title="${escapeHtml(c.etiquetaFull)}">
          <span class="wc-day">${c.label}</span>
          <span class="wc-date">${c.dateNum}</span>
          <span class="wc-status">${c.dot}</span>
          <span class="wc-label -${c.etiquetaEstado}">${c.etiquetaEstado === 'done' ? '✓ ' : ''}${escapeHtml(c.etiqueta)}</span>
        </button>`).join('')}
    </div>
    <button class="historial-btn" id="historial-btn">
      <span class="historial-left">
        <span class="historial-icon">${ICON_ACTIVITY}</span>
        <span class="historial-title">History</span>
      </span>
      <span class="historial-right"><span class="home-link-mono">All workouts</span><span class="historial-chev">›</span></span>
    </button>`;

  cells.forEach(c => {
    const el = container.querySelector(`[data-wc="${c.i}"]`);
    if (!el) return;
    el.addEventListener('click', () => {
      if (c.gym) viewCompletedWorkout(c.gym);       // already trained → view it
      else pickDayActivity(c.ds, c.jsDay);          // otherwise choose what to do
    });
  });
  const hist = container.querySelector('#historial-btn');
  if (hist) hist.addEventListener('click', () => switchTab('gym'));
}

// Day tap → pick modality (gym / running / mobility); gym chains to the muscle-group picker
async function pickDayActivity(ds, jsDay) {
  const dayLabel = new Date(ds + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const choice = await showActionSheet(dayLabel, [
    { value: 'gym', label: 'Gym — strength', icon: '🏋️' },
    { value: 'run', label: 'Cardio', icon: '🏃' },
    { value: 'mobility', label: 'Mobility', icon: '🧘' },
  ]);
  if (!choice) return;
  if (choice === 'gym') {
    const customSchedule = await getWeekSchedule();
    const planned = getPlannedSession(jsDay, customSchedule, ds);
    showSessionPicker(planned || Object.keys(activePlan.sessions)[0], ds); // lists muscle-group sessions
  } else if (choice === 'run') {
    switchTab('cardio');
  } else if (choice === 'mobility') {
    switchTab('gym');
    if (typeof openMobilityView === 'function') openMobilityView();
  }
}

// ==================== THIS WEEK QUEUE (upcoming sessions, Lovable image rows) ====================
async function renderHomeQueue() {
  const container = document.getElementById('home-queue');
  const aheadEl = document.getElementById('queue-ahead');
  if (!container) return;
  const weekDates = getWeekDates();
  const todayStr = today();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  // Rich planned per day so cardio/recovery days appear in the queue (not just gym).
  const plannedArr = await Promise.all(weekDates.map(d => getPlannedSessionForDate(d).catch(() => null)));

  const rows = [];
  weekDates.forEach((date, i) => {
    const ds = dateStr(date);
    if (ds <= todayStr) return; // upcoming only
    const p = plannedArr[i];
    if (!p || p.type === 'rest') return;
    if (p.type === 'gym') {
      rows.push({ ds, label: dayNames[i], name: p.name, kind: 'gym', key: p.sessionId });
    } else if (p.type === 'run') {
      rows.push({ ds, label: dayNames[i], name: p.name, kind: 'cardio' });
    } else if (p.type === 'recovery') {
      rows.push({ ds, label: dayNames[i], name: p.name, kind: 'recovery' });
    }
  });

  if (aheadEl) aheadEl.textContent = rows.length ? `${rows.length} ahead` : '';

  if (rows.length === 0) {
    // V-5: el estado vacío por el helper de la casa, no una cadena ad hoc. Mismo texto.
    showEmptyState(container, '😴', 'Nothing else planned this week', 'Recovery counts.');
    return;
  }

  // V-4: UNA línea, la siguiente sesión. Era una lista con foto, nombre y `focus` de hasta
  // seis sesiones — el mismo plan de la semana que ya cuentan el calendario (arriba) y la
  // tarjeta de hoy, con el mismo `name + focus` de la tarjeta del coach. Tres veces la misma
  // información en una pantalla de 390 px, y la cola era la copia menos útil: el calendario
  // ya dice qué días hay algo, y para saber QUÉ hay se toca el día. Lo que la cola aporta y
  // el calendario no es una sola cosa: cuál es la próxima. Eso es lo que queda.
  const n = rows[0];
  container.innerHTML = `
    <button class="queue-next" data-q="0">
      <span class="queue-next-label">Next</span>
      <span class="queue-next-txt">${escapeHtml(n.label)} · ${escapeHtml(n.name || 'Session')}</span>
      <span class="queue-chev">›</span>
    </button>`;
  const el = container.querySelector('[data-q="0"]');
  if (el) {
    el.addEventListener('click', () => {
      if (n.kind === 'gym') showSessionPicker(n.key, n.ds);
      else if (n.kind === 'cardio') switchTab('cardio');
      else { switchTab('gym'); safeCallVoid('openMobilityView'); }
    });
  }
}

// ==================== TODAY'S PLAN CARD ====================
async function renderTodaysPlan() {
  const container = document.getElementById('todays-plan-card');
  if (!container) return;
  const ds = today();
  const planned = await getPlannedSessionForDate(new Date());

  const [allWorkouts, runs, mobs, sessions] = await Promise.all([
    dbGetAll('workouts'), getRunsDeduped(), dbGetAll('mobility_sessions'), getSessionsDeduped()]);
  const doneWorkout = allWorkouts.find(w => w.date === ds);
  const doneCardio = runs.find(r => r.date === ds) || sessions.find(s => s.date === ds && s.family === 'cardio');
  const doneRecovery = mobs.find(m => m.date === ds) || sessions.find(s => s.date === ds && s.family === 'recovery');

  // --- Cardio day → cardio hero (links to the Cardio logger) ---
  if (planned.type === 'run') {
    const done = !!doneCardio;
    const sub = (planned.subtitle || 'Zone 2 · easy') + (planned.durationMin ? ` · ${planned.durationMin}'` : '');
    const hrLine = planned.hrTarget ? `Target HR: <b>${planned.hrTarget}</b>` : cardioIntensityGuide(planned.subtype);
    const opcionesCardio = cardioDayOptions(planned);
    // v11.60: la fase de carrera y su dosis. El patrón de trote/caminata y los km son la
    // prescripción real de la semana; sin ellos la tarjeta decía sólo "40 min Zona 2".
    const fase = (typeof runningPhaseLabel === 'function') ? runningPhaseLabel(planned) : '';
    const rxRows = [
      _blockEyebrowHtml(planned.block),
      fase ? `<div class="plan-block-eyebrow">${fase}</div>` : '',
      // Un solo número para la dosis: con kilómetros prescritos, los minutos del slot son el
      // hueco reservado, no la prescripción, y pintar los dos es el problema de "tres números
      // para una decisión" que el audit (F-0/F-4) ya cerró en la tarjeta de ejercicio.
      planned.distanceKm
        ? `<div class="cardio-rx-row"><span>Distance</span><b>${String(planned.distanceKm)} km</b></div>`
        : (planned.durationMin ? `<div class="cardio-rx-row"><span>Duration</span><b>${_cardioDurLabel(planned.durationMin, planned.baseMin, planned.durationSource, planned.block)}</b></div>` : ''),
      planned.pattern ? `<div class="cardio-rx-row"><span>Pattern</span><b>${escapeHtml(planned.pattern)}</b></div>` : '',
      `<div class="cardio-rx-row"><span>Intensity</span><b>${hrLine}</b></div>`,
      planned.summary ? `<div class="cardio-rx-row"><span>What to do</span><b>${escapeHtml(planned.summary)}</b></div>` : '',
      planned.runningNote ? `<div class="cardio-rx-note">${escapeHtml(planned.runningNote)}</div>` : '',
    ].join('');
    container.innerHTML = `
      <section class="session-hero" data-sh>
        <img class="sh-img" src="img/session-rest.jpg" alt="" loading="lazy">
        <div class="sh-scrim"></div>
        <div class="sh-top"><span class="sh-chip">Cardio</span>${done ? `<span class="sh-chip sh-chip-done">✓ Done</span>` : `<span class="sh-chip sh-chip-today">● Today</span>`}</div>
        <div class="sh-bottom">
          <div class="sh-eyebrow">${done ? 'Completed' : sub}</div>
          <h3 class="sh-title">${planned.name}<br><span class="sh-title-sub">${planned.subtitle || 'Zone 2'}</span></h3>
        </div>
      </section>
      <div class="cardio-rx card">
        ${rxRows}
        ${done ? '' : cardioOptionsHtml(opcionesCardio)}
        <div class="cardio-rx-actions">
          <button class="btn-primary" id="rx-log-cardio">${done ? 'View cardio' : 'Log cardio'}</button>
          <button class="btn-secondary" id="rx-push-icu">Send to intervals.icu</button>
        </div>
      </div>`;
    container.querySelector('[data-sh]').addEventListener('click', () => switchTab('cardio'));
    const logBtn = container.querySelector('#rx-log-cardio');
    if (logBtn) logBtn.addEventListener('click', () => switchTab('cardio'));
    const pushBtn = container.querySelector('#rx-push-icu');
    if (pushBtn) pushBtn.addEventListener('click', () => pushCardioToIntervalsIcu());
    // Elegir una opción o una máquina NO cambia la plantilla de la semana: cambia lo de HOY, y se
    // recuerda para que la tarjeta y el registro de cardio lleguen con ello puesto.
    container.querySelectorAll('[data-copt]').forEach((b) => b.addEventListener('click', async () => {
      const o = opcionesCardio[Number(b.dataset.copt)] || null;
      if (!o) return;
      container.querySelectorAll('[data-copt]').forEach((x) => x.classList.remove('is-picked'));
      b.classList.add('is-picked');
      state._cardioPick = { date: today(), option: o.id, label: o.label, modality: o.modality || (state._cardioPick || {}).modality || null };
      if (typeof toast === 'function') toast(`Today: ${o.label}`);
    }));
    container.querySelectorAll('[data-cmod]').forEach((b) => b.addEventListener('click', () => {
      const mod = b.dataset.cmod;
      container.querySelectorAll('[data-cmod]').forEach((x) => x.classList.remove('is-picked'));
      b.classList.add('is-picked');
      state._cardioPick = Object.assign({ date: today() }, state._cardioPick || {}, { modality: mod });
      const m = CARDIO_MODALITIES.find((x) => x.id === mod);
      if (typeof toast === 'function' && m) toast(`On the ${m.label.toLowerCase()}`);
    }));
    return;
  }

  // --- Active recovery day ---
  if (planned.type === 'recovery') {
    const done = !!doneRecovery;
    // Same fix as the strength day: the recovery slot also carries a real Z2 dose.
    const rMin = planned.z2FinisherMin;
    const rDone = (sessions || []).some(x => x.date === ds && x.origin === 'z2_finisher');
    const rHr = cardioHrTarget('zone2');
    const rBlock = rMin ? `
      <div class="cardio-rx card">
        <div class="rx-sub">Easy Z2 ${rDone ? '<span class="rx-done">✓ done</span>' : ''}</div>
        ${_blockEyebrowHtml(planned.block)}
        <div class="cardio-rx-row"><span>Duration</span><b>${_cardioDurLabel(rMin, planned.z2BaseMin, planned.z2Source, planned.block)}</b></div>
        <div class="cardio-rx-row"><span>Intensity</span><b>${rHr ? `HR ${rHr}` : cardioIntensityGuide('zone2')}</b></div>
        <div class="cardio-rx-row"><span>What to do</span><b>${planned.z2FinisherModality ? _z2ModalityLabel(planned.z2FinisherModality) : 'Walk, easy bike or easy row'} — conversational</b></div>
        <div class="cardio-rx-actions">
          <button class="btn-secondary" id="rx-log-z2">${rDone ? 'Log another' : 'Log Z2'}</button>
          <button class="btn-secondary" id="rx-push-z2">Send to COROS</button>
        </div>
      </div>` : '';
    container.innerHTML = `
      <section class="session-hero" data-sh>
        <img class="sh-img" src="img/session-rest.jpg" alt="" loading="lazy">
        <div class="sh-scrim"></div>
        <div class="sh-top"><span class="sh-chip">Recovery</span>${done ? `<span class="sh-chip sh-chip-done">✓ Done</span>` : `<span class="sh-chip sh-chip-today">● Today</span>`}</div>
        <div class="sh-bottom">
          <div class="sh-eyebrow">${planned.subtitle || 'Mobility + easy Z2'}</div>
          <h3 class="sh-title">${planned.name}<br><span class="sh-title-sub">Active recovery</span></h3>
          <button class="sh-cta sh-cta-ghost"><span class="sh-cta-label">Mobility</span></button>
        </div>
      </section>${rBlock}`;
    container.querySelector('[data-sh]').addEventListener('click', () => { switchTab('gym'); if (typeof openMobilityView === 'function') openMobilityView(); });
    const rLog = container.querySelector('#rx-log-z2');
    if (rLog) rLog.addEventListener('click', () => logZ2Finisher(rMin));
    const rPush = container.querySelector('#rx-push-z2');
    if (rPush) rPush.addEventListener('click', () => pushZ2FinisherToIntervalsIcu(rMin));
    return;
  }

  // --- Pure rest day ---
  // V-5: por `showEmptyState`, con el mismo emoji y el mismo texto. Había diez estados vacíos
  // por el helper y unos treinta escritos a mano, cada uno con su marco y su tamaño de fuente.
  if (planned.type !== 'gym') {
    showEmptyState(container, '😌', 'Rest day', 'No training planned. Recovery counts.');
    return;
  }

  // --- Strength day (gym) ---
  const plannedSession = planned.sessionId;
  const s = activePlan.sessions[plannedSession];
  const name = planned.name || (s ? s.name : plannedSession);
  const focus = planned.subtitle || (s && s.subtitle) || 'Strength';
  const exCount = s && Array.isArray(s.exercises) ? s.exercises.length : null;
  const planSets = (s && Array.isArray(s.exercises))
    ? s.exercises.reduce((sum, ex) => sum + (typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3)), 0)
    : null;

  // Eyebrow: actual when done; planned estimate (+ Z2 finisher) otherwise
  let eyebrow;
  if (doneWorkout) {
    const doneSets = (doneWorkout.exercises || []).reduce((n, ex) => n + (ex.sets || []).filter(x => x.done).length, 0);
    eyebrow = `Completed · ${doneSets} sets${doneWorkout.duration ? ' · ' + doneWorkout.duration : ''}`;
  } else {
    const parts = [];
    if (exCount) parts.push(`${exCount} exercises`);
    if (planSets) parts.push(`${planSets} sets`);
    parts.push('60-75 min');
    if (planned.z2FinisherMin) parts.push(`+${planned.z2FinisherMin}' Z2${planned.z2FinisherModality ? ' ' + _z2ModalityLabel(planned.z2FinisherModality) : ''}`);
    const blkTxt = _blockEyebrow(planned.block);
    if (blkTxt) parts.push(blkTxt);
    eyebrow = parts.join(' · ');
  }

  const key = `${name} ${focus}`.toLowerCase();
  let img = 'img/hero-pull.jpg';
  if (/leg|lower|squat|quad|hamstring|bisagra/.test(key)) img = 'img/session-legs.jpg';
  else if (/push|chest|press|shoulder/.test(key)) img = 'img/session-push.jpg';
  else if (/mobility|recovery|rest|stretch/.test(key)) img = 'img/session-rest.jpg';

  const rightChip = doneWorkout
    ? `<span class="sh-chip sh-chip-done">✓ Done</span>`
    : `<span class="sh-chip sh-chip-today">● Today</span>`;
  const cta = doneWorkout
    ? `<span class="sh-cta-label">View session</span>`
    : `<span class="sh-cta-label">Start workout</span><span class="sh-cta-arrow">›</span>`;

  // v11.57: el kg objetivo también en Home. La decisión de "¿con cuánto voy hoy?" se toma antes
  // de entrar al gimnasio; verla sólo dentro de la sesión llega tarde. Se calcula sobre los
  // ejercicios YA resueltos con los swaps (mismo orden que `s.exercises`, así que el índice
  // empareja) y cualquier fallo aquí deja la fila como estaba: Home no puede caerse por esto.
  const baseExercises = (s && Array.isArray(s.exercises)) ? s.exercises : [];
  let rxTargets = {};
  let rxResolved = baseExercises;
  try {
    if (baseExercises.length) {
      rxResolved = resolveSessionExercises(plannedSession, baseExercises);
      rxTargets = await computeSessionTargets(plannedSession, rxResolved, {
        deload: isDeloadWeek(getWeekNumber()),
        allWorkoutsDesc: allWorkouts.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))),
      });
    }
  } catch (e) {
    rxTargets = {};
    rxResolved = baseExercises;
  }

  // v11.34: a strength day used to be a photo plus the string "6 exercises · 20 sets ·
  // 60-75 min · +20' Z2" — it never said WHAT to do. Cardio days already had a full
  // prescription card; this gives strength days the same, reusing .cardio-rx.
  // Se itera la lista YA RESUELTA: hasta v11.56 Home pintaba el nombre del hueco del plan
  // aunque hubiera un swap activo, y con el kg al lado eso sería el nombre de un ejercicio con
  // el peso de otro. `resolveSessionExercises` conserva series/reps/RPE del hueco y sólo cambia
  // el movimiento, así que el esquema no se mueve.
  const rxExercises = rxResolved.map((ex) => {
    const sets = typeof ex.sets === 'number' ? ex.sets : (Array.isArray(ex.sets) ? ex.sets.length : 3);
    const scheme = `${sets}×${ex.reps || '—'}${ex.rpe ? ` @RPE ${ex.rpe}` : ''}`;
    const tgt = rxTargets[ex.id];
    const kgBit = (tgt && tgt.kg != null)
      ? ` · <b>${(ex.bw ? '+' : '') + _coachFmtKg(convertWeight(tgt.kg, 'kg', state.settings.unit))} ${state.settings.unit}</b> <span class="coach-chip coach-chip-${tgt.source}">${tgt.source === 'coach' ? 'coach' : (tgt.source === 'last' ? 'last' : 'rule')}</span>`
      : '';
    // El kg va DENTRO del <b> de la derecha: `.cardio-rx-row` es un flex con space-between y un
    // tercer hijo rompería la alineación de todas las filas.
    return `<div class="cardio-rx-row"><span>${ex.compound ? '<b class="rx-key">•</b> ' : ''}${ex.name}</span><b>${scheme}${kgBit}</b></div>`;
  }).join('');

  // The Z2 finisher is a real prescription (IDEAL_BLOCK_V1.z2Finisher), not a label.
  let z2Block = '';
  const z2Min = planned.z2FinisherMin;
  if (z2Min) {
    const z2Done = (sessions || []).some(x => x.date === ds && x.origin === 'z2_finisher');
    const hr = cardioHrTarget('zone2');
    const intensity = hr ? `HR ${hr}` : cardioIntensityGuide('zone2');
    z2Block = `
      <div class="rx-sub">When you finish · easy Z2 ${z2Done ? '<span class="rx-done">✓ done</span>' : ''}</div>
      ${_blockEyebrowHtml(planned.block)}
      <div class="cardio-rx-row"><span>Duration</span><b>${_cardioDurLabel(z2Min, planned.z2BaseMin, planned.z2Source, planned.block)}</b></div>
      <div class="cardio-rx-row"><span>Intensity</span><b>${intensity}</b></div>
      <div class="cardio-rx-row"><span>What to do</span><b>${planned.z2FinisherModality ? _z2ModalityLabel(planned.z2FinisherModality) : 'Bike, row or treadmill'} — conversational</b></div>
      <div class="cardio-rx-actions">
        <button class="btn-secondary" id="rx-log-z2">${z2Done ? 'Log another' : 'Log Z2'}</button>
        <button class="btn-secondary" id="rx-push-z2">Send to COROS</button>
      </div>`;
  }

  container.innerHTML = `
    <section class="session-hero" data-sh>
      <img class="sh-img" src="${img}" alt="" loading="lazy">
      <div class="sh-scrim"></div>
      <div class="sh-top">
        <span class="sh-chip">${focus}</span>
        ${rightChip}
      </div>
      <div class="sh-bottom">
        <div class="sh-eyebrow">${eyebrow}</div>
        <h3 class="sh-title">${name}<br><span class="sh-title-sub">${focus}</span></h3>
        <button class="sh-cta${doneWorkout ? ' sh-cta-ghost' : ''}">${cta}</button>
      </div>
    </section>
    ${(rxExercises || z2Block) ? `<div class="cardio-rx card">${rxExercises}${z2Block}</div>` : ''}`;

  const open = doneWorkout
    ? () => openEditWorkout(doneWorkout.id)
    : () => showSessionPicker(plannedSession);
  container.querySelector('[data-sh]').addEventListener('click', open);
  const logZ2 = container.querySelector('#rx-log-z2');
  if (logZ2) logZ2.addEventListener('click', () => logZ2Finisher(z2Min));
  const pushZ2 = container.querySelector('#rx-push-z2');
  if (pushZ2) pushZ2.addEventListener('click', () => pushZ2FinisherToIntervalsIcu(z2Min));
  const detail = document.getElementById('todays-detail');
  if (detail) detail.onclick = open;
}

async function renderRunTotals() {
  const container = document.getElementById('run-totals-card');
  if (!container) return;
  // Totals span legacy runs + unified cardio sessions that recorded a distance.
  // Dedupeadas: la misma actividad de COROS llega por Strava y por intervals.icu, y aquí se
  // SUMAN kilómetros — contarla dos veces infla el total del año, no sólo una tarjeta.
  const [legacyRuns, sessions] = await Promise.all([getRunsDeduped(), getSessionsDeduped()]);
  const runs = legacyRuns.concat(sessions.filter(s => s.family === 'cardio' && parseFloat(s.distance) > 0));

  const now = new Date();
  // C-24: el lunes por `mondayOf()` del motor (era la quinta aritmética de lunes de la app) y
  // la semana anterior por `addDays()`. Los dos vuelven a Date porque `inRange` compara Date
  // construidos en hora local.
  const lunes = mondayOf(today());
  const weekStart = new Date(lunes + 'T00:00:00');
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  // Previous period starts (for trend deltas)
  const prevWeekStart = new Date(addDays(lunes, -7) + 'T00:00:00');
  const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevYearStart = new Date(now.getFullYear() - 1, 0, 1);

  const inRange = (r, start, end) => {
    if (!r.date) return false;
    const [y, m, d] = r.date.split('-').map(Number);
    const rd = new Date(y, m - 1, d);
    return rd >= start && (!end || rd < end);
  };

  const sum = (arr) => arr.reduce((s, r) => s + (parseFloat(r.distance) || 0), 0);
  const wk = sum(runs.filter(r => inRange(r, weekStart)));
  const mo = sum(runs.filter(r => inRange(r, monthStart)));
  const yr = sum(runs.filter(r => inRange(r, yearStart)));
  const prevWk = sum(runs.filter(r => inRange(r, prevWeekStart, weekStart)));
  const prevMo = sum(runs.filter(r => inRange(r, prevMonthStart, monthStart)));

  const fmt = (n) => n >= 100 ? n.toFixed(0) : n.toFixed(1);
  const trendHTML = (curr, prev, label) => {
    if (prev <= 0 && curr <= 0) return `<div class="metric-card-trend">No ${label} yet</div>`;
    if (prev <= 0) return `<div class="metric-card-trend">First ${label}</div>`;
    const delta = curr - prev;
    const pct = Math.round(Math.abs(delta) / prev * 100);
    if (Math.abs(delta) < 0.1) return `<div class="metric-card-trend">Same as ${label}</div>`;
    const cls = delta > 0 ? 'up' : 'down';
    const arrow = delta > 0 ? '↑' : '↓';
    return `<div class="metric-card-trend"><span class="metric-trend ${cls}">${arrow} ${pct}%</span> <span style="margin-left:6px">vs ${label}</span></div>`;
  };

  // Reusable inline SVG icons (24×24, currentColor)
  const iconRun = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M5 21l3-9 2.5 2V21M15 11l-3-3-4 4 2 2"/></svg>`;
  const iconCal = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`;
  const iconYear = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18"/></svg>`;

  const card = (icon, label, value, trend, tint, color) => `
    <div class="metric-card">
      <div class="metric-card-icon" style="background:${tint};color:${color}">${icon}</div>
      <div class="metric-card-body">
        <div class="metric-card-label">${label}</div>
        <div class="metric-card-value">${fmt(value)}<span class="metric-unit">km</span></div>
        ${trend}
      </div>
    </div>
  `;

  container.innerHTML = `
    <div class="card-stack">
      ${card(iconRun, 'This week', wk, trendHTML(wk, prevWk, 'last week'), 'var(--tint-blue)', 'var(--blue)')}
      ${card(iconCal, 'This month', mo, trendHTML(mo, prevMo, 'last month'), 'var(--tint-blue)', 'var(--blue)')}
      ${card(iconYear, now.getFullYear().toString(), yr, '<div class="metric-card-trend">Year to date</div>', 'var(--tint-blue)', 'var(--blue)')}
    </div>
  `;
}

async function renderRunHistory() {
  const container = document.getElementById('run-history');
  const runs = (await getRunsDeduped()).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  if (!runs.length) {
    showEmptyState(container, '🏃', 'No runs yet', 'Log your runs in the Run tab to track distance and pace.');
    return;
  }

  const bw = await getBodyweightLatest();
  const iconRunner = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13" cy="4" r="2"/><path d="M5 21l3-9 2.5 2V21M15 11l-3-3-4 4 2 2"/></svg>`;
  container.innerHTML = runs.map(r => {
    const cal = estimateCalories({ type: 'run', durationMin: parseFloat(r.duration) || 0, bodyweightKg: bw || 80, avgHr: r.avgHR, distanceKm: r.distance, age: state.settings.age });
    const calBit = cal ? ` · ~${cal.kcal} kcal` : '';
    return `
    <div class="history-item">
      <div class="hi-icon" style="background:var(--tint-blue);color:var(--blue)">${iconRunner}</div>
      <div class="hi-left">
        <div class="hi-title">${r.distance} km · ${r.avgPace}/km</div>
        <div class="hi-sub">${formatDate(r.date)} · ${r.duration} min${r.avgHR ? ` · ${r.avgHR} bpm` : ''}${calBit}${r.week ? ` · Wk ${r.week}` : ''}</div>
      </div>
      <div class="hi-right">
        <div>
          <div class="hi-stat">${r.feel}/5</div>
          <div class="hi-stat-sub">feel</div>
        </div>
        <button class="hi-delete" data-delete-run="${r.id}" aria-label="Delete cardio session">&times;</button>
      </div>
    </div>
  `;
  }).join('');

  container.querySelectorAll('[data-delete-run]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const runId = btn.dataset.deleteRun;
      const deletedRun = await dbGet('runs', runId);
      await smartDelete('runs', runId);
      renderRunTotals();
      renderRunHistory();
      toast('Run deleted', {
        label: 'Undo',
        callback: async () => {
          if (deletedRun) {
            await smartPut('runs', deletedRun);
            renderRunTotals();
            renderRunHistory();
          }
        }
      });
    });
  });
}

// ==================== NUTRITION MODULE ====================
// v11.49: el registro vive en nutrition.js (Nutricion v2, foto -> IA -> confirmacion).
// Se retiraron `renderMealList`, `updateProteinRing`, `PROTEIN_DB`,
// `setupProteinAutocomplete`, `addMeal` y `logNutrition`: dejar dos rutas de entrada
// compitiendo es como se llego a 11 filas en cuatro meses. `PROTEIN_DB` (proteina por
// racion, sin kcal) lo sustituye FOODS_SEED, con macros por 100 g.
//
// El store `nutrition` NO se sustituyo: sigue siendo la fila por dia, ahora derivada por
// recomputeNutritionDay(). Por eso renderNutritionHistory(), la racha, la tarjeta del
// coach y el anillo del dashboard siguen funcionando sin tocarlos.
async function renderNutrition() {
  if (typeof renderNutricionV2 === 'function') return renderNutricionV2();
  console.warn('[Nutricion] nutrition.js no cargo');
}

async function renderNutritionHistory() {
  const container = document.getElementById('nutrition-history');
  const entries = (await dbGetAll('nutrition')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  if (!entries.length) {
    showEmptyState(container, '📊', 'No history', "Each day's totals will show up here.");
    return;
  }

  container.innerHTML = entries.map(e => {
    const totalProtein = e.protein || (e.meals || []).reduce((sum, m) => sum + (m.protein || 0), 0);
    // `mealCount` lo escribe recomputeNutritionDay; el fallback lee las filas antiguas,
    // que guardaban las comidas dentro del propio registro del dia.
    const mealCount = e.mealCount != null ? e.mealCount : (e.meals || []).length;
    const hitTarget = totalProtein >= (e.proteinFloor || state.settings.proteinTarget);
    return `
      <div class="history-item">
        <div class="hi-left">
          <div class="hi-title">${formatDate(e.date)}</div>
          <div class="hi-sub">${e.calories ? `${e.calories} kcal · ` : ''}${totalProtein} g protein · ${mealCount} ${mealCount === 1 ? 'meal' : 'meals'}${e.ea != null ? ` · EA ${e.ea}` : ''}</div>
        </div>
        <div class="hi-right">
          <div class="hi-stat" style="color:${hitTarget ? 'var(--accent)' : 'var(--orange)'}">${hitTarget ? '✓' : '✗'}</div>
          <div class="hi-stat-sub">protein</div>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== PR DETECTION ====================
async function detectPRs(workout) {
  const allWorkouts = (await dbGetAll('workouts')).filter(w => w.id !== workout.id);
  const prs = [];

  for (const ex of workout.exercises) {
    const doneSets = ex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0);
    if (doneSets.length === 0) continue;

    // Find best previous 1RM for this exercise
    // Compare 1RMs in kg across all sessions, regardless of each one's logged unit.
    let prevBest1RM = 0;
    allWorkouts.forEach(w => {
      const wex = w.exercises.find(e => e.exerciseId === ex.exerciseId);
      if (wex) {
        wex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0).forEach(s => {
          const e1rm = estimate1RM(convertWeight(s.weight, w.unit, 'kg'), s.reps);
          if (e1rm > prevBest1RM) prevBest1RM = e1rm;
        });
      }
    });

    // Check if any set in this workout beats the previous best (compare in kg).
    const todayBest = doneSets.reduce((best, s) => {
      const e1rm = estimate1RM(convertWeight(s.weight, workout.unit, 'kg'), s.reps);
      return e1rm > best.e1rm ? { e1rm, weight: s.weight, reps: s.reps } : best;
    }, { e1rm: 0, weight: 0, reps: 0 });

    if (todayBest.e1rm > prevBest1RM && prevBest1RM > 0) {
      prs.push({ exerciseId: ex.exerciseId, e1rm: todayBest.e1rm, weight: todayBest.weight, reps: todayBest.reps });
    }
  }

  if (prs.length > 0) {
    const names = prs.map(pr => `${getExerciseName(pr.exerciseId)} (${pr.weight}×${pr.reps})`).join(', ');
    setTimeout(() => toast(`🏆 New PR! ${names}`), 500);
  }
}

// Note: Post-set RPE progression toasts were removed in v10.14 — they
// disappeared too fast to read on the phone. Same logic now lives in
// /weekly-review (`.claude/commands/weekly-review.md`) which writes the
// guidance into the persistent Coach Review card on Stats > Today.

// ==================== EXERCISE SWAP ====================
function showSwapUI(card, ex, session) {
  const existing = card.querySelector('.swap-panel');
  if (existing) { existing.remove(); return; }

  // En una sesión libre NO se persiste override: `exerciseOverrides['free']` haría que un cambio de
  // una sola sesión contaminase todas las libres futuras. El swap sigue cambiando la tarjeta, pero
  // no deja rastro en los ajustes.
  const sessionId = session && !session.adHoc && session.id;
  const origId = card.dataset.origId || ex.id;
  const origName = card.dataset.origName || ex.name;
  const currentId = card.dataset.exerciseId;
  const isOverridden = currentId !== origId;

  // Options = same-muscle alternatives + the original slot exercise, minus the current one.
  const byId = new Map();
  (EXERCISE_ALTERNATIVES[ex.muscle] || []).forEach(a => byId.set(a.id, a.name));
  byId.set(origId, origName); // ensure the original is always offered
  byId.delete(currentId);
  const opts = [...byId.entries()].map(([id, name]) => ({ id, name }));
  if (opts.length === 0) { toast('No alternatives available'); return; }

  const panel = document.createElement('div');
  panel.className = 'swap-panel';
  const revertBtn = isOverridden
    ? `<button class="swap-option swap-revert" data-swap-id="${escapeHtml(origId)}" data-swap-name="${escapeHtml(origName)}">↩ Back to the original (${escapeHtml(origName)})</button>`
    : '';
  panel.innerHTML = `
    <div class="swap-title">Swap ${escapeHtml(ex.name)} for:</div>
    ${revertBtn}
    ${opts.map(a => `<button class="swap-option" data-swap-id="${escapeHtml(a.id)}" data-swap-name="${escapeHtml(a.name)}">${escapeHtml(a.name)}</button>`).join('')}
    <button class="swap-cancel">Cancel</button>
  `;

  panel.querySelector('.swap-cancel').addEventListener('click', () => panel.remove());
  panel.querySelectorAll('.swap-option').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newId = btn.dataset.swapId;
      const newName = btn.dataset.swapName;
      // Persist (or clear, if reverting to the original) — synced, survives reloads.
      if (sessionId) {
        if (newId === origId) await clearExerciseOverride(sessionId, origId);
        else await setExerciseOverride(sessionId, origId, newId, newName);
      }
      // Update the card in place
      card.dataset.exerciseId = newId;
      const nameEl = card.querySelector('.exercise-name');
      if (nameEl) { nameEl.childNodes[0].textContent = newName + ' '; nameEl.dataset.exId = newId; }
      const notesEl = card.querySelector('.exercise-notes');
      if (notesEl) notesEl.textContent = newId === origId ? '' : `Swapped from ${origName}`;
      // El objetivo en kg era del movimiento ANTERIOR: dejarlo bajo el nombre nuevo prescribiría
      // el peso de otro ejercicio, que es justo el fallo que v11.57 viene a cerrar. Se quita, y
      // se borra también del snapshot para que `finishWorkout` no lo sella contra el sustituto.
      // El sustituto recibe SU objetivo (calculado sobre SU historial) la próxima vez que se
      // arranque la sesión, que es cuando `resolveSessionExercises` ya lo trae resuelto.
      const objEl = card.querySelector('.coach-objective');
      if (objEl) objEl.remove();
      if (state.activeTargets) { delete state.activeTargets[currentId]; delete state.activeTargets[newId]; }
      panel.remove();
      await saveActiveWorkout();
      toast(newId === origId ? `Volviste a ${newName}` : `Cambiado a ${newName}`);
    });
  });

  card.querySelector('.exercise-body-inner').appendChild(panel);
}

// ==================== DAILY STEPS ====================
// Primary source (v10.26+): intervals.icu wellness — Apple Health → intervals.icu
// Companion → wellness.steps. Pulled by intervalsFetchWellness in whoop.js,
// upserted to IDB 'steps' store. No iOS Automation needed.
// Legacy paths (kept for fallback + manual entry):
//   - syncStepsFromCloud(): pulls from Supabase steps table (populated by old
//     iOS Shortcut → steps-ingest Edge Function). Still works for historical
//     data backfill if intervals.icu doesn't have it.
//   - logStepsManual(): manual entry override.
const STEPS_INGEST_URL = 'https://ycfodifvpvosukepcxie.supabase.co/functions/v1/steps-ingest';

async function syncStepsFromCloud() {
  // supabase-sync.js declares supabaseClient and getUser as script-scoped
  // globals (not window props). Use them directly. This sync was silently
  // returning because `window.supabaseClient` was always undefined.
  if (typeof getUser !== 'function') return;
  if (typeof supabaseClient === 'undefined' || !supabaseClient) return;
  const user = await getUser();
  if (!user) return;
  try {
    const since = dateStr(new Date(Date.now() - 30 * 86400000));
    const url = `${SUPABASE_URL}/rest/v1/steps?user_id=eq.${user.id}&record_id=gte.${since}&select=record_id,data`;
    const sess = await supabaseClient.auth.getSession();
    const token = sess?.data?.session?.access_token || SUPABASE_ANON_KEY;
    const res = await fetchWithTimeout(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      console.warn('[Steps] cloud fetch returned', res.status);
      return;
    }
    const rows = await res.json();
    for (const r of rows) {
      const d = r.data || {};
      await dbPut('steps', { date: r.record_id, steps: d.steps || 0, source: d.source || 'shortcut', ts: d.ts || Date.now() });
    }
  } catch (e) {
    console.warn('[Steps] sync failed', e);
  }
}

/**
 * F-23 (auditoría 2026-09-09): EL SUELO DE PASOS, UNA SOLA VEZ.
 *
 * Estaba escrito dos veces como `settings.stepsTarget || 8000` (la tarjeta y el histórico) y una
 * tercera, distinta, en los objetivos del coach (`goals.constraints.stepsFloor`), que es la que
 * viaja en el facts pack y sobre la que razona la revisión semanal. Manda el objetivo: el número
 * de Ajustes es el respaldo para quien no tenga objetivos, y 8.000 el suelo de la casa.
 */
function stepsFloor() {
  const g = ((state.settings || {}).goals || {}).constraints || {};
  const cands = [g.stepsFloor, (state.settings || {}).stepsTarget, 8000];
  for (const v of cands) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 8000;
}

async function getStepsToday() {
  const e = await dbGet('steps', today());
  return e ? (e.steps || 0) : 0;
}

async function getStepsAvg7d() {
  const all = await dbGetAll('steps');
  const cutoff = dateStr(new Date(Date.now() - 7 * 86400000));
  const recent = (all || []).filter(e => e.date >= cutoff);
  if (recent.length === 0) return 0;
  return Math.round(recent.reduce((s, e) => s + (e.steps || 0), 0) / recent.length);
}

async function postStepsToCloud(stepsValue, dateStrOverride) {
  const secret = stepsSecret();
  if (!secret) return { error: 'No secret configured. Generate one in Settings → Daily Steps.' };
  try {
    const res = await fetchWithTimeout(STEPS_INGEST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        date: dateStrOverride || today(),
        steps: stepsValue,
        source: 'manual',
      }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function logStepsManual(stepsValue) {
  const n = parseInt(stepsValue);
  if (!Number.isFinite(n) || n < 0 || n > 200000) { toast('Invalid steps value'); return; }
  // C-15: `smartPut` y no `dbPut`. El empuje por `steps-ingest` es "best effort" y su fallo
  // sólo iba a la consola, así que un secreto caducado o un avión dejaban los pasos escritos
  // a mano SÓLO en este teléfono, en silencio. La cola de sync es la red que faltaba: si el
  // empuje directo no llega, la fila sube igual por el camino normal.
  await smartPut('steps', { date: today(), steps: n, source: 'manual', ts: Date.now() });
  postStepsToCloud(n).then(r => {
    if (r && r.error) console.warn('[Steps] cloud push failed:', r.error);
  });
  renderStepsCard();
}

async function renderStepsCard() {
  const el = document.getElementById('steps-card');
  if (!el) return;
  const target = stepsFloor();
  let today_, avg7;
  try {
    today_ = await getStepsToday();
    avg7 = await getStepsAvg7d();
  } catch (e) {
    console.warn('[Steps] tarjeta:', e);
    showErrorState(el, 'Could not read your steps.', renderStepsCard);
    return;
  }
  // Estado vacío (v11.66): sin ninguna lectura, un anillo a 0 y un "0 / 8.000" leen como
  // "no has andado nada hoy", que es distinto de "no hay dato". Se dice cuál de las dos es.
  if (!today_ && !avg7) {
    el.innerHTML = '<div class="steps-row"><div class="steps-info">'
      + '<div class="steps-sub">No steps yet. They sync from Apple Health via intervals.icu, '
      + 'or you can log today by hand.</div></div>'
      + '<button class="steps-edit" id="steps-manual-btn" aria-label="Log steps manually">\u270E</button></div>';
    const b0 = document.getElementById('steps-manual-btn');
    if (b0) b0.addEventListener('click', async () => {
      const v = await promptSheet({ title: 'Steps today', placeholder: 'e.g. 9500', confirmLabel: 'Save' });
      if (v !== null && v.trim() !== '') logStepsManual(v.trim());
    });
    return;
  }
  const pct = Math.min(today_ / target, 1);
  const circumference = 220;
  const dashOffset = circumference - circumference * pct;
  const ringColor = pct >= 1 ? 'var(--accent)' : pct >= 0.7 ? 'var(--blue)' : 'var(--orange)';

  el.innerHTML = `
    <div class="steps-row">
      <svg class="steps-ring" viewBox="0 0 80 80" width="64" height="64" aria-hidden="true">
        <circle cx="40" cy="40" r="35" fill="none" stroke="var(--border)" stroke-width="6"/>
        <circle cx="40" cy="40" r="35" fill="none" stroke="${ringColor}" stroke-width="6"
                stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${dashOffset}"
                transform="rotate(-90 40 40)" style="transition:stroke-dashoffset 0.6s ease-out"/>
      </svg>
      <div class="steps-info">
        <div class="steps-num">${today_.toLocaleString()}<span class="steps-target"> / ${target.toLocaleString()}</span></div>
        <div class="steps-sub">steps today · 7d avg ${avg7.toLocaleString()}</div>
      </div>
      <button class="steps-edit" id="steps-manual-btn" aria-label="Log manually">✎</button>
    </div>
  `;
  const btn = document.getElementById('steps-manual-btn');
  if (btn) btn.addEventListener('click', async () => {
    const v = await promptSheet({
      title: 'Steps today', placeholder: 'e.g. 9500', confirmLabel: 'Save',
      value: today_ || '',
    });
    if (v !== null && v.trim() !== '') logStepsManual(v.trim());
  });
}

// Steps history chart + stats for Stats > Body. Pulls cloud first to make
// sure last night's automation is included.
async function renderStepsHistoryChart() {
  const statsRow = document.getElementById('steps-stats-row');
  const chartEl = document.getElementById('steps-chart');
  const histEl = document.getElementById('steps-history');
  if (!chartEl) return;
  // Ensure latest cloud data is in IDB
  await syncStepsFromCloud().catch(() => {});

  const all = (await dbGetAll('steps')).sort((a, b) => a.date.localeCompare(b.date));
  const target = stepsFloor();

  if (all.length === 0) {
    if (statsRow) statsRow.innerHTML = '<div class="muted" style="font-size:13px">No steps logged yet. Steps sync automatically from Apple Health via intervals.icu Companion.</div>';
    if (chartEl) showEmptyState(chartEl, '👟', 'No steps yet', 'Steps appear here once intervals.icu syncs from Apple Health.');
    if (histEl) histEl.innerHTML = '';
    return;
  }

  // Stats: today, yesterday, 7-day avg, days hitting target
  const todayKey = today();
  const ydayKey = dateStr(new Date(Date.now() - 86400000));
  const todayE = all.find(e => e.date === todayKey);
  const ydayE = all.find(e => e.date === ydayKey);
  const last7 = all.filter(e => e.date >= dateStr(new Date(Date.now() - 7 * 86400000)));
  const avg7 = last7.length ? Math.round(last7.reduce((s, e) => s + (e.steps || 0), 0) / last7.length) : 0;
  const last30 = all.filter(e => e.date >= dateStr(new Date(Date.now() - 30 * 86400000)));
  const hits = last30.filter(e => (e.steps || 0) >= target).length;
  const hitRate = last30.length ? Math.round((hits / last30.length) * 100) : 0;

  if (statsRow) {
    statsRow.innerHTML = `
      <div class="ss-tile"><div class="ss-label">Today</div><div class="ss-val">${todayE ? todayE.steps.toLocaleString() : '—'}</div></div>
      <div class="ss-tile"><div class="ss-label">Yesterday</div><div class="ss-val">${ydayE ? ydayE.steps.toLocaleString() : '—'}</div></div>
      <div class="ss-tile"><div class="ss-label">7d avg</div><div class="ss-val">${avg7.toLocaleString()}</div></div>
      <div class="ss-tile"><div class="ss-label">Target hit (30d)</div><div class="ss-val">${hits}/${last30.length} <span class="ss-sub">· ${hitRate}%</span></div></div>
    `;
  }

  // Chart: last 30 days, fill missing days with 0 so the timeline is honest
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = dateStr(new Date(Date.now() - i * 86400000));
    const e = all.find(x => x.date === d);
    days.push({ date: d, steps: e ? (e.steps || 0) : 0 });
  }
  // Color bars: green if ≥ target, else accent dimmed
  const labels = days.map(d => formatDate(d.date));
  const values = days.map(d => d.steps);
  chartEl.innerHTML = renderLineChart(labels, values, { color: 'var(--accent)', height: 160 });
  // Overlay target horizontal line
  const svgEl = chartEl.querySelector('svg');
  if (svgEl && values.some(v => v > 0)) {
    const width = 320, pad = { top: 20, right: 15, bottom: 30, left: 40 };
    const chartW = width - pad.left - pad.right;
    const chartH = 160 - pad.top - pad.bottom;
    const dataMax = Math.max(...values, target * 1.1);
    const dataMin = 0;
    const range = dataMax - dataMin || 1;
    const yTarget = pad.top + chartH - ((target - dataMin) / range) * chartH;
    const targetLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    targetLine.setAttribute('x1', pad.left);
    targetLine.setAttribute('x2', pad.left + chartW);
    targetLine.setAttribute('y1', yTarget);
    targetLine.setAttribute('y2', yTarget);
    targetLine.setAttribute('stroke', 'var(--orange)');
    targetLine.setAttribute('stroke-width', '1.5');
    targetLine.setAttribute('stroke-dasharray', '4 3');
    targetLine.setAttribute('opacity', '0.7');
    svgEl.appendChild(targetLine);
    const txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', pad.left + chartW - 4);
    txt.setAttribute('y', yTarget - 4);
    txt.setAttribute('text-anchor', 'end');
    txt.setAttribute('font-size', '9');
    txt.setAttribute('fill', 'var(--orange)');
    txt.textContent = `target ${target.toLocaleString()}`;
    svgEl.appendChild(txt);
  }

  // Recent history list — last 10 days with explicit values
  if (histEl) {
    const recent = days.slice(-10).reverse();
    const rows = recent.map(d => {
      const e = all.find(x => x.date === d.date);
      const isOver = d.steps >= target;
      const arrow = e ? (isOver ? '✓' : '·') : '—';
      const color = e ? (isOver ? 'var(--accent)' : 'var(--text2)') : 'var(--text3)';
      return `<div class="bw-h-row">
        <span class="bw-h-date">${formatDate(d.date)}</span>
        <span class="bw-h-weight">${e ? d.steps.toLocaleString() : '—'}</span>
        <span class="bw-h-delta" style="color:${color}">${arrow}</span>
      </div>`;
    }).join('');
    histEl.innerHTML = `<div class="section-label" style="margin-top:12px">Last 10 Days</div>
      <div class="card bw-history-card">${rows}</div>`;
  }
}

// ==================== BODY WEIGHT TRACKING ====================
async function logBodyWeight() {
  const input = document.getElementById('bw-input');
  const weight = parseFloat(input.value);
  if (!weight || weight < 20 || weight > 300) { toast('Enter a valid weight'); return; }

  // V-9: la pesada es un dato de una sola oportunidad al día. Si no entra, hay que decirlo.
  try {
    await smartPut('bodyweight', { date: today(), weight, timestamp: Date.now() });
  } catch (e) {
    console.warn('[Peso] registrar pesada:', e);
    toast(`Something went wrong saving the weigh-in: ${(e && e.message) || 'storage error'}`);
    return;
  }
  _bwCache = weight; // refresh cached value used for calorie estimation
  input.value = '';
  toast(`${weight} kg logged`);
  renderBodyWeightChart();
}

// Compute and render the 4 motivational metric tiles (week delta, 30d trend,
// total since start, days logged this month). Reuses `entries` already sorted ascending.
function renderBodyWeightMetrics(entries, host) {
  if (!host) return;
  if (entries.length < 1) { host.innerHTML = ''; return; }

  const goalLossDirection = true; // user goal: lose weight (CLAUDE.md)
  const colorForDelta = (delta) => {
    if (Math.abs(delta) < 0.05) return 'var(--text2)';
    const losing = delta < 0;
    return (losing === goalLossDirection) ? 'var(--accent)' : 'var(--red)';
  };

  const now = new Date();
  const dayMs = 86400000;
  const dateOf = (e) => new Date(e.date + 'T12:00:00');

  // Tile: total since start (settings.startDate or first entry)
  const startDateStr = state.settings && state.settings.startDate;
  const startEntry = startDateStr
    ? entries.find(e => e.date >= startDateStr) || entries[0]
    : entries[0];
  const totalDelta = entries[entries.length - 1].weight - startEntry.weight;
  const weeksSince = Math.max(1, Math.round((dateOf(entries[entries.length - 1]) - dateOf(startEntry)) / (7 * dayMs)));
  const totalTile = `<div class="bw-stat">
    <div class="bw-stat-label">since start</div>
    <div class="bw-stat-val" style="color:${colorForDelta(totalDelta)}">${totalDelta >= 0 ? '+' : '−'}${Math.abs(totalDelta).toFixed(1)} kg <span class="bw-stat-sub">· ${weeksSince}w</span></div>
  </div>`;

  // Tile: days logged this month (calendar month)
  const ymPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const loggedThisMonth = entries.filter(e => e.date.startsWith(ymPrefix)).length;
  const totalDaysSoFar = now.getDate();
  const consistencyColor = loggedThisMonth >= totalDaysSoFar * 0.7 ? 'var(--accent)' : 'var(--text)';
  const loggedTile = `<div class="bw-stat">
    <div class="bw-stat-label">this month</div>
    <div class="bw-stat-val" style="color:${consistencyColor}">${loggedThisMonth} / ${totalDaysSoFar} days</div>
  </div>`;

  host.innerHTML = totalTile + loggedTile;
}

// Origen de la pesada (A-5). Una fila de la báscula Withings trae hora y composición; una
// manual sólo el número. Se marca para no leerlas como si fueran lo mismo. `fatPct` es el % de
// grasa del dispositivo (bioimpedancia), que sustituye al Navy del día.
function _bwSourcePill(e) {
  if (!e || e.source !== 'withings') return '';
  const fat = (typeof e.fatPct === 'number' && e.fatPct > 0)
    ? ` · ${e.fatPct.toFixed(1)} % fat` : '';
  return `<span class="bw-source-pill">Withings</span>${fat}`;
}

// Render last 7 entries newest-first, with delta vs previous entry.
function renderBodyWeightHistory(entries, host) {
  if (!host) return;
  if (entries.length === 0) { host.innerHTML = ''; return; }

  const recent = entries.slice(-8); // grab 8 so we can compute delta of the 7th
  const rows = [];
  for (let i = recent.length - 1; i >= Math.max(0, recent.length - 7); i--) {
    const e = recent[i];
    const prev = i > 0 ? recent[i - 1] : null;
    const delta = prev ? e.weight - prev.weight : null;
    let deltaHTML = '<span class="bw-h-delta muted">—</span>';
    if (delta !== null) {
      const arrow = Math.abs(delta) < 0.05 ? '—' : (delta < 0 ? '↓' : '↑');
      const color = Math.abs(delta) < 0.05 ? 'var(--text2)' : (delta < 0 ? 'var(--accent)' : 'var(--red)');
      deltaHTML = `<span class="bw-h-delta" style="color:${color}">${arrow} ${Math.abs(delta).toFixed(1)}</span>`;
    }
    rows.push(`<div class="bw-h-row">
      <span class="bw-h-date">${formatDate(e.date)} ${_bwSourcePill(e)}</span>
      <span class="bw-h-weight">${e.weight} kg</span>
      ${deltaHTML}
    </div>`);
  }
  host.innerHTML = `<div class="section-label" style="margin-top:12px">Recent Logs</div>
    <div class="card bw-history-card">${rows.join('')}</div>`;
}

// Compute ETA to goal, plateau warning, and missed-day nudge.
// All three are rendered as small banners above the metric tiles so the user
// gets actionable signal — when to weigh, where they're heading, and whether
// the trend is genuinely stalled.
function renderBodyWeightInsights(entries, nudgeEl, etaEl, plateauEl) {
  const dayMs = 86400000;
  const dateOf = (e) => new Date(e.date + 'T12:00:00');
  const now = new Date();
  const latest = entries[entries.length - 1];
  const latestDate = dateOf(latest);
  const daysSinceLatest = Math.floor((now - latestDate) / dayMs);

  // Nudge: no log in 2+ days. Resets when user logs.
  if (nudgeEl) {
    if (daysSinceLatest >= 2) {
      nudgeEl.classList.remove('hidden');
      nudgeEl.textContent = `⚖️ ${daysSinceLatest} days since your last weigh-in. Log this morning's reading to keep the trend honest.`;
    } else {
      nudgeEl.classList.add('hidden');
      nudgeEl.textContent = '';
    }
  }

  // ETA: project weeks to goal using last-30d slope.
  if (etaEl) {
    const goal = state.settings.goalWeight;
    etaEl.innerHTML = '';
    if (goal && Number.isFinite(goal)) {
      const last30all = entries.filter(e => (now - dateOf(e)) <= 30 * dayMs);
      const last30meas = last30all.filter(e => e.measured !== false);
      // D1 (v11.9): base the rate-of-loss regression on REAL weigh-ins (measured:true);
      // fall back to all entries only when too few measured points exist. Forward-fills
      // from Apple Health otherwise flatten/contaminate the slope.
      const last30 = last30meas.length >= 4 ? last30meas : last30all;
      const remaining = latest.weight - goal;
      if (Math.abs(remaining) < 0.3) {
        etaEl.innerHTML = `🎯 Goal reached — current ${latest.weight} kg vs goal ${goal} kg. Time to recompose or set a new target.`;
      } else if (last30.length >= 4) {
        const t0 = dateOf(last30[0]).getTime();
        const xs = last30.map(e => (dateOf(e).getTime() - t0) / dayMs);
        const ys = last30.map(e => e.weight);
        const n = xs.length;
        const meanX = xs.reduce((a, b) => a + b, 0) / n;
        const meanY = ys.reduce((a, b) => a + b, 0) / n;
        let num = 0, den = 0;
        for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (ys[i] - meanY); den += (xs[i] - meanX) ** 2; }
        const slopePerWeek = den > 0 ? (num / den) * 7 : 0;
        // Going the right direction? Goal is loss → slope should be negative.
        const losing = slopePerWeek < -0.05;
        const gaining = slopePerWeek > 0.05;
        const shouldLose = remaining > 0;
        const trendLabel = '<span class="bw-line-label">30d trend (regression):</span>';
        if (shouldLose && losing) {
          const weeksToGoal = Math.ceil(remaining / Math.abs(slopePerWeek));
          etaEl.innerHTML = `🎯 ${trendLabel} <strong>${slopePerWeek.toFixed(2)} kg/wk</strong> → goal <strong>${goal} kg</strong> in ~${weeksToGoal} wks (${remaining.toFixed(1)} kg to go).`;
        } else if (shouldLose && !losing) {
          etaEl.innerHTML = `🎯 ${trendLabel} <strong>${slopePerWeek >= 0 ? '+' : ''}${slopePerWeek.toFixed(2)} kg/wk</strong> · ${remaining.toFixed(1)} kg to <strong>${goal} kg</strong>. Trend ${gaining ? 'is going the other way' : 'is flat'} — ETA on hold until the loss resumes.`;
        } else if (!shouldLose && gaining) {
          const weeksToGoal = Math.ceil(Math.abs(remaining) / slopePerWeek);
          etaEl.innerHTML = `🎯 ${trendLabel} <strong>+${slopePerWeek.toFixed(2)} kg/wk</strong> → goal <strong>${goal} kg</strong> in ~${weeksToGoal} wks.`;
        } else {
          etaEl.innerHTML = `🎯 ${trendLabel} <strong>${slopePerWeek >= 0 ? '+' : ''}${slopePerWeek.toFixed(2)} kg/wk</strong> · goal <strong>${goal} kg</strong> (${Math.abs(remaining).toFixed(1)} kg to ${remaining > 0 ? 'lose' : 'gain'}).`;
        }
      } else {
        etaEl.innerHTML = `🎯 <span class="bw-line-label">30d trend:</span> need 4+ logs · goal <strong>${goal} kg</strong> (${Math.abs(remaining).toFixed(1)} kg to ${remaining > 0 ? 'lose' : 'gain'}).`;
      }
    }
  }

  // Origen de la última pesada (A-5): si viene de la báscula Withings se dice, con el % de
  // grasa del dispositivo cuando lo trae. Una línea; ni gráfico nuevo ni tarjeta nueva.
  //
  // v11.65: la báscula manda además pulso, índice de grasa visceral, metabolismo basal y edad
  // metabólica. Caben todos en la MISMA línea apagada, cada uno sólo si su número existe: son
  // contexto de la pesada, no tres tarjetas más ni un gráfico que nadie pidió.
  if (etaEl && latest && latest.source === 'withings') {
    const _fin = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
    const _num = (v, d) => v.toFixed(d);
    const extras = [];
    const musculo = _fin(latest.muscleKg);
    if (musculo != null) extras.push(`muscle ${_num(musculo, 1)} kg`);
    const visceral = _fin(latest.visceralFat);
    if (visceral != null) extras.push(`visceral ${Number.isInteger(visceral) ? visceral : _num(visceral, 1)}`);
    const bmr = _fin(latest.bmrKcal);
    // Millar en inglés: `toLocaleString('en-US')` SÍ agrupa los números de 4 cifras
    // (minimumGroupingDigits = 1 en el CLDR inglés), así que da "1,812".
    if (bmr != null) extras.push(`BMR ${Math.round(bmr).toLocaleString('en-US')} kcal`);
    const pulso = _fin(latest.heartRateBpm);
    if (pulso != null) extras.push(`pulse ${Math.round(pulso)}`);
    const edadMet = _fin(latest.metabolicAge);
    if (edadMet != null) extras.push(`metabolic age ${Math.round(edadMet)}`);
    etaEl.innerHTML += `<div style="margin-top:4px">Last weigh-in: ${_bwSourcePill(latest)}${extras.length ? ' · ' + extras.join(' · ') : ''}</div>`;
  }

  // Plateau: 7-day avg now vs 7-day avg from 14d ago. If |delta| < 0.3 kg over
  // a 14-day window with enough data, flag it. Only meaningful on a cut.
  if (plateauEl) {
    plateauEl.classList.add('hidden');
    plateauEl.innerHTML = '';
    const recentWindow = entries.filter(e => (now - dateOf(e)) <= 7 * dayMs);
    const olderWindow = entries.filter(e => {
      const age = now - dateOf(e);
      return age >= 14 * dayMs && age <= 21 * dayMs;
    });
    if (recentWindow.length >= 3 && olderWindow.length >= 3) {
      const avgNow = recentWindow.reduce((s, e) => s + e.weight, 0) / recentWindow.length;
      const avgOld = olderWindow.reduce((s, e) => s + e.weight, 0) / olderWindow.length;
      const delta = avgNow - avgOld;
      const goal = state.settings.goalWeight;
      const onCut = !goal || latest.weight > goal;
      if (onCut && Math.abs(delta) < 0.3) {
        plateauEl.classList.remove('hidden');
        plateauEl.innerHTML = `⚠️ <strong>Plateau detected.</strong> 7-day avg has barely moved (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg over 14d). If adherence is solid, drop ~150 kcal/day or add 1k steps before assuming the plan is wrong.`;
      }
    }
  }
}

async function renderBodyWeightChart() {
  const container = document.getElementById('bw-chart');
  const currentEl = document.getElementById('bw-current');
  const metricsEl = document.getElementById('bw-metrics');
  const historyEl = document.getElementById('bw-history');
  const legendEl = document.getElementById('bw-chart-legend');
  const nudgeEl = document.getElementById('bw-nudge');
  const etaEl = document.getElementById('bw-eta');
  const plateauEl = document.getElementById('bw-plateau');
  let entries;
  try { entries = _bwWeighIns(await dbGetAll('bodyweight')); } catch (e) {
    console.warn('[Peso] gráfico:', e);
    showErrorState(container, 'Could not read your weigh-ins.', renderBodyWeightChart);
    return;
  }

  if (entries.length === 0) {
    currentEl.textContent = '--';
    if (metricsEl) metricsEl.innerHTML = '';
    if (historyEl) historyEl.innerHTML = '';
    if (legendEl) legendEl.innerHTML = '';
    if (nudgeEl) { nudgeEl.classList.remove('hidden'); nudgeEl.textContent = '⚖️ Log your first weigh-in to start tracking trends.'; }
    if (etaEl) etaEl.textContent = '';
    if (plateauEl) plateauEl.classList.add('hidden');
    showEmptyState(container, '⚖️', 'No weigh-ins yet', 'Log your weight above to start tracking trends.');
    return;
  }

  const latestWeight = entries[entries.length - 1].weight;
  currentEl.textContent = latestWeight + ' kg';

  renderBodyWeightMetrics(entries, metricsEl);
  renderBodyWeightHistory(entries, historyEl);
  renderBodyWeightInsights(entries, nudgeEl, etaEl, plateauEl);

  // Rate of change: compare 7-day average now vs 7 days ago
  const rateEl = document.getElementById('bw-rate');
  if (entries.length >= 3) {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    const recentEntries = entries.filter(e => new Date(e.date + 'T12:00:00') > weekAgo);
    const olderEntries = entries.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d <= weekAgo && d > new Date(now - 14 * 86400000);
    });
    if (recentEntries.length > 0 && olderEntries.length > 0) {
      const avgRecent = recentEntries.reduce((s, e) => s + e.weight, 0) / recentEntries.length;
      const avgOlder = olderEntries.reduce((s, e) => s + e.weight, 0) / olderEntries.length;
      const weeklyChange = avgRecent - avgOlder;
      const pctChange = (weeklyChange / avgOlder) * 100;
      const absPct = Math.abs(pctChange).toFixed(1);
      const sign = weeklyChange > 0 ? '+' : '';
      let color, label;
      if (pctChange <= -0.5 && pctChange >= -1.0) { color = 'var(--accent)'; label = 'on target'; }
      else if (pctChange < -1.0) { color = 'var(--orange)'; label = 'too fast'; }
      else if (pctChange < 0) { color = 'var(--yellow)'; label = 'slow'; }
      else { color = 'var(--red)'; label = 'gaining'; }
      rateEl.innerHTML = `<span class="bw-line-label">Last 7d vs previous 7d:</span> <span style="color:${color}">${sign}${weeklyChange.toFixed(1)} kg/wk (${sign}${pctChange.toFixed(1)}%) — ${label}</span> <span style="color:var(--text3)">target: -0.5 to -1%/wk</span>`;
    } else {
      rateEl.innerHTML = '<span class="bw-line-label">Last 7d vs previous 7d:</span> <span class="muted">need 2+ weeks of data</span>';
    }
  } else {
    rateEl.textContent = '';
  }

  if (entries.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ entries for chart</span>';
    return;
  }

  // Show last 30 entries max
  const recent = entries.slice(-30);

  // Calculate 7-day moving average
  const avgValues = recent.map((_, i) => {
    const window = recent.slice(Math.max(0, i - 6), i + 1);
    return Math.round(window.reduce((s, e) => s + e.weight, 0) / window.length * 10) / 10;
  });
  const hasMA = recent.length >= 7;

  container.innerHTML = renderLineChart(
    recent.map(e => formatDate(e.date)),
    recent.map(e => e.weight),
    {
      color: 'var(--blue)',
      height: 150,
      tooltip: true,
      unit: 'kg',
      extraSeries: hasMA ? [{
        label: '7d avg',
        values: avgValues,
        color: 'var(--orange)',
        dashed: true,
        opacity: 0.8
      }] : []
    }
  );
  bindChartTooltip(container.querySelector('svg'));

  // Legend below chart so the user knows what each line is
  if (legendEl) {
    legendEl.innerHTML = `
      <span class="bw-leg-row"><span class="bw-leg-line" style="background:var(--blue)"></span>Daily weight</span>
      ${hasMA ? '<span class="bw-leg-row"><span class="bw-leg-line bw-leg-line-dashed" style="background:var(--orange)"></span>7-day avg (trend)</span>' : ''}
      <div class="bw-chart-hint">Daily weight bounces with food, water, sleep. The orange line smooths the noise — focus on its direction.</div>
    `;
  }
}

// ==================== PLATE CALCULATOR ====================
let plateCalcUnit = 'kg';
// La hoja de discos que se abre con el FAB DURANTE el entrenamiento. Su unidad es local, igual que
// la de la calculadora de Ajustes: escribía `state.settings.unit` y eso es lo que sellaba
// `unit: 'lb'` en un entrenamiento tecleado en kg — finishWorkout estampa `state.settings.unit`,
// así que un toque en una CALCULADORA decidía en qué unidad quedaba grabada la sesión. La
// sincronización es de una sola dirección: openPlateSheet la copia del ajuste al abrir.
let plateSheetUnit = 'kg';

function calculatePlates(targetWeight, unit) {
  const barWeight = unit === 'lb' ? 45 : BAR_WEIGHT;
  const plates = unit === 'lb' ? [45, 35, 25, 10, 5, 2.5] : PLATE_WEIGHTS;

  if (targetWeight <= barWeight) return { bar: barWeight, perSide: [], total: barWeight };

  let remaining = (targetWeight - barWeight) / 2;
  const perSide = [];

  for (const plate of plates) {
    while (remaining >= plate) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  const actual = barWeight + perSide.reduce((s, p) => s + p * 2, 0);
  return { bar: barWeight, perSide, total: actual };
}

function renderPlateInto(inputId, resultId, unit) {
  const input = document.getElementById(inputId);
  const result = document.getElementById(resultId);
  if (!input || !result) return;
  const target = parseFloat(input.value);

  if (!target || target <= 0) { result.innerHTML = ''; return; }

  const { bar, perSide, total } = calculatePlates(target, unit);

  if (perSide.length === 0) {
    result.innerHTML = `<div class="plate-result">Just the bar: ${bar} ${unit}</div>`;
    return;
  }

  const counts = {};
  perSide.forEach(p => { counts[p] = (counts[p] || 0) + 1; });
  const plateList = Object.entries(counts).map(([w, c]) => `${c}× ${w}${unit}`).join(' + ');

  result.innerHTML = `
    <div class="plate-result">
      <div class="plate-bar">Bar: ${bar} ${unit}</div>
      <div class="plate-each">Each side: ${plateList}</div>
      <div class="plate-visual">${perSide.map(p => `<span class="plate-disc" style="height:${Math.max(20, p * (unit === 'lb' ? 0.8 : 2))}px">${p}</span>`).join('')}</div>
      ${total !== target ? `<div class="plate-note">Closest: ${total} ${unit} (${target - total > 0 ? '-' : '+'}${Math.abs(target - total).toFixed(1)})</div>` : ''}
    </div>
  `;
}

function renderPlateCalculator() {
  renderPlateInto('plate-calc-input', 'plate-calc-result', plateCalcUnit);
}

// ==================== PLATE CALCULATOR FLOATING SHEET ====================
function openPlateSheet(prefillWeight) {
  const sheet = document.getElementById('plate-sheet');
  const backdrop = document.getElementById('plate-sheet-backdrop');
  const input = document.getElementById('plate-sheet-input');
  if (!sheet || !backdrop || !input) return;

  // Sync unit with app setting on open — de una sola dirección (ajuste → hoja).
  plateSheetUnit = state.settings.unit || 'kg';
  document.querySelectorAll('#plate-sheet-unit-toggle .toggle-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.sheetUnit === plateSheetUnit);
  });

  // Prefill: explicit value > last used > current focused set weight
  if (prefillWeight && prefillWeight > 0) {
    input.value = prefillWeight;
  } else if (state.lastPlateCalcInput) {
    input.value = state.lastPlateCalcInput;
  }

  backdrop.classList.remove('hidden');
  sheet.classList.remove('hidden');
  // Force reflow then add visible class for slide-up animation
  void sheet.offsetWidth;
  backdrop.classList.add('visible');
  sheet.classList.add('visible');

  renderPlateInto('plate-sheet-input', 'plate-sheet-result', plateSheetUnit);
  setTimeout(() => input.focus(), 200);
}

function closePlateSheet() {
  const sheet = document.getElementById('plate-sheet');
  const backdrop = document.getElementById('plate-sheet-backdrop');
  if (!sheet || !backdrop) return;
  sheet.classList.remove('visible');
  backdrop.classList.remove('visible');
  setTimeout(() => {
    sheet.classList.add('hidden');
    backdrop.classList.add('hidden');
  }, 250);
  // Persist input for next open
  const input = document.getElementById('plate-sheet-input');
  if (input && input.value) state.lastPlateCalcInput = input.value;
}

// RETIRADO en v11.62: `checkDeloadNeeded()` y el banner reactivo de descarga, con su botón para
// pedirle al coach que la adelantara.
//
// Era el ÚLTIMO sitio donde la recuperación empujaba una acción, y por eso se va con el
// ajuste diario. El dato no se pierde: `deloadHint` viaja en el facts pack a la revisión
// semanal, que es quien puede mover el ancla del bloque con aprobación, y el deload
// PROGRAMADO ya se ve en el calendario y en el eyebrow de la semana. La etiqueta
// `deload-request` sigue en `COACH_DECISION_LABEL` para leer las decisiones históricas.

// v11.35: a sync failure must be visible the same day, not seven weeks later.
// The queue silently froze on 2026-06-30 and nothing in the UI said a word — Settings
// kept claiming "Data backed up automatically". See assessments/2026-08-16_system-audit.md.
async function renderSyncWarning() {
  const container = document.getElementById('sync-warning');
  if (!container) return;
  if (typeof getSyncStatus !== 'function') { container.classList.add('hidden'); return; }
  let st;
  try { st = await getSyncStatus(); } catch (e) { container.classList.add('hidden'); return; }

  const pending = (st && st.total) || 0;
  const quarantined = (st && st.quarantined) || 0;
  const ageH = st && st.oldest ? Math.floor((Date.now() - st.oldest) / 3600000) : 0;

  // Quiet unless it actually matters: something stuck, or a backlog older than a day.
  if (quarantined === 0 && !(pending > 0 && ageH >= 24)) { container.classList.add('hidden'); return; }

  const age = ageH >= 48 ? `${Math.floor(ageH / 24)} days` : `${ageH} h`;
  const msg = quarantined > 0
    ? `${quarantined} record${quarantined === 1 ? '' : 's'} could not be uploaded. Your data is still on the phone.`
    : `${pending} change${pending === 1 ? '' : 's'} not uploaded for ${age}.`;
  // V-3: familia propia (`.sync-warning-*`). Reutilizaba `.deload-*`, las clases del banner
  // reactivo de descarga que se retiró en v11.62, y tenía que pisar su amarillo con un
  // `style` inline en rojo para no parecer un aviso de descarga.
  container.innerHTML = `
    <div class="sync-warning-banner">
      <span class="sync-warning-icon">☁️</span>
      <div>
        <div class="sync-warning-title">Cloud backup pending</div>
        <div class="sync-warning-text">${msg} Tap to retry.</div>
      </div>
    </div>`;
  container.classList.remove('hidden');
  container.onclick = async () => {
    if (typeof syncAll === 'function') await syncAll();
    await renderSyncWarning();
    const after = await getSyncStatus();
    toast(after.total > 0 ? `${after.total} still not uploaded` : 'Synced');
    // V-8: el punto del topbar cuenta lo mismo que este banner; sin esto se quedaría ámbar
    // después de un reintento con éxito.
    safeCallVoid('renderTopbarStatusDot');
  };
}

// ==================== FULL JSON BACKUP (v11.35) ====================
// The CSV export only covers workouts/runs/nutrition/bodyweight — it silently omits
// `sessions` (every cardio logged since v11.29) and `mobility_sessions`. That made the
// one "backup" in the app an incomplete one at exactly the moment the cloud copy was
// stale. This dumps every IndexedDB store verbatim, so it can be restored as-is.
const BACKUP_STORES = [
  'workouts', 'runs', 'sessions', 'nutrition', 'bodyweight', 'mobility_sessions',
  'steps', 'wellness', 'plans', 'exercises', 'weekly_reviews', 'settings', 'sync_queue',
  // Coach v2 (v11.55): las revisiones del coach y el registro de decisiones son el historial
  // de por qué el plan es como es. Un backup sin ellos deja el plan sin su explicación.
  'coach_reviews', 'decisions',
  // v11.70 (D-2): nutrición v2. `meals` es el registro de comida que empieza el 2026-09-09 y `foods`
  // la biblioteca con macros verificados. Faltaban aquí y sí estaban en la lista de sync: un restore
  // los perdía. `verify-home-render` exige BACKUP_STORES ⊇ stores de sync (menos la cola).
  'meals', 'foods',
];

// v11.70 (S-2): el backup sale por la hoja de compartir de iOS (WhatsApp, correo, iCloud). Dos claves
// de `settings/userSettings` son secretos operativos y no viajan: con `stepsSecret` cualquiera
// escribe en `steps` vía steps-ingest; con la API key de intervals.icu se lee todo el histórico.
const BACKUP_REDACT_KEYS = ['stepsSecret', 'intervalsIcuApiKey'];
function _redactSettingsRows(rows) {
  return (rows || []).map((row) => {
    if (!row || !row.data || typeof row.data !== 'object' || Array.isArray(row.data)) return row;
    if (!BACKUP_REDACT_KEYS.some((k) => k in row.data)) return row;
    const data = Object.assign({}, row.data);
    for (const k of BACKUP_REDACT_KEYS) delete data[k];
    return Object.assign({}, row, { data });
  });
}

async function exportJSON() {
  const data = {};
  const counts = {};
  for (const store of BACKUP_STORES) {
    try {
      const rows = await dbGetAll(store);
      data[store] = store === 'settings' ? _redactSettingsRows(rows || []) : (rows || []);
      counts[store] = (rows || []).length;
    } catch (e) {
      data[store] = [];
      counts[store] = null; // store missing on this device
    }
  }
  const backup = {
    app: 'training-system',
    version: '11.42',
    exportedAt: new Date().toISOString(),
    dbVersion: typeof DB_VERSION !== 'undefined' ? DB_VERSION : null,
    counts,
    data,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `training-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  const total = Object.values(counts).reduce((n, c) => n + (c || 0), 0);
  toast(`Backup: ${total} registros`);
}

// ==================== CSV EXPORT ====================
async function exportCSV() {
  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));
  const runs = (await dbGetAll('runs')).sort((a, b) => a.date.localeCompare(b.date));
  const nutrition = (await dbGetAll('nutrition')).sort((a, b) => a.date.localeCompare(b.date));
  const bodyweight = (await dbGetAll('bodyweight')).sort((a, b) => a.date.localeCompare(b.date));

  let csv = '';

  // Workouts sheet
  csv += '=== WORKOUTS ===\n';
  csv += 'Date,Session,Exercise,Set,Weight,Unit,Reps,RPE,Done,Quality,Duration\n';
  workouts.forEach(w => {
    const session = activePlan.sessions[w.session];
    w.exercises.forEach(ex => {
      ex.sets.forEach((s, i) => {
        csv += `${w.date},${session ? session.name : (w.sessionName || w.session)},${getExerciseName(ex.exerciseId)},${i + 1},${s.weight},${w.unit || 'kg'},${s.reps},${s.rpe || ''},${s.done},${w.quality || ''},${w.duration || ''}\n`;
      });
    });
  });

  // Runs
  csv += '\n=== RUNS ===\n';
  csv += 'Date,Distance(km),Duration(min),Pace,AvgHR,Feel,Notes\n';
  runs.forEach(r => {
    csv += `${r.date},${r.distance},${r.duration},${r.avgPace},${r.avgHR || ''},${r.feel || ''},"${(r.notes || '').replace(/"/g, '""')}"\n`;
  });

  // Nutrition
  csv += '\n=== NUTRITION ===\n';
  csv += 'Date,Protein(g),Meals,Energy,Calories,Alcohol,Notes\n';
  nutrition.forEach(n => {
    const protein = n.protein || (n.meals || []).reduce((s, m) => s + (m.protein || 0), 0);
    const mealCount = (n.meals || []).length;
    csv += `${n.date},${protein},${mealCount},${n.energy || ''},${n.calories || ''},${n.alcohol || ''},"${(n.notes || '').replace(/"/g, '""')}"\n`;
  });

  // Body weight
  csv += '\n=== BODY WEIGHT ===\n';
  csv += 'Date,Weight(kg),Source,Fat%,FatMass(kg),FFM(kg),Muscle(kg),Water(kg),Bone(kg),Visceral,BMR(kcal),MetabolicAge,Pulse,Waist(cm)\n';
  // Nunca `undefined` en el CSV: una fila de sólo cintura o de sólo pulso no tiene peso.
  const _c = (v) => (v == null || v === '' || Number.isNaN(v)) ? '' : v;
  bodyweight.forEach(b => {
    csv += [b.date, _c(b.weight), _c(b.source), _c(b.fatPct != null ? b.fatPct : b.bfPct), _c(b.fatMassKg), _c(b.ffmKg),
      _c(b.muscleKg), _c(b.waterKg), _c(b.boneKg), _c(b.visceralFat), _c(b.bmrKcal), _c(b.metabolicAge),
      _c(b.heartRateBpm), _c(b.waist)].join(',') + '\n';
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const fileName = `training-export-${today()}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported!');
}

// ==================== NUTRITION PROTEIN CHART ====================
async function renderProteinChart() {
  const container = document.getElementById('protein-chart');
  if (!container) return;

  const entries = (await dbGetAll('nutrition')).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  if (entries.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ days of data</span>';
    return;
  }

  const labels = entries.map(e => formatDate(e.date));
  const values = entries.map(e => e.protein || (e.meals || []).reduce((s, m) => s + (m.protein || 0), 0));

  // Draw chart with target line
  const chartHTML = renderLineChart(labels, values, { color: 'var(--accent)', height: 150 });
  container.innerHTML = chartHTML;

  // Add target line
  const svgEl = container.querySelector('svg');
  if (svgEl && state.settings.proteinTarget) {
    const width = 320, pad = { top: 20, right: 15, bottom: 30, left: 40 };
    const chartH = 150 - pad.top - pad.bottom;
    const allVals = [...values, state.settings.proteinTarget];
    const dataMin = Math.min(...allVals) * 0.9;
    const dataMax = Math.max(...allVals) * 1.1;
    const range = dataMax - dataMin || 1;
    const targetY = pad.top + chartH - ((state.settings.proteinTarget - dataMin) / range) * chartH;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', pad.left);
    line.setAttribute('y1', targetY);
    line.setAttribute('x2', width - pad.right);
    line.setAttribute('y2', targetY);
    line.setAttribute('stroke', 'var(--red)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '5 3');
    line.setAttribute('opacity', '0.6');
    svgEl.appendChild(line);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', width - pad.right);
    label.setAttribute('y', targetY - 4);
    label.setAttribute('fill', 'var(--red)');
    label.setAttribute('font-size', '9');
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('opacity', '0.7');
    label.textContent = `Target ${state.settings.proteinTarget}g`;
    svgEl.appendChild(label);
  }
}

// ==================== OPCIONES DE UN DIA DE CARDIO (v11.75) ====================
//
// Julian, 2026-09-12: "Cuando es cardio como hoy sábado tengo que tener opciones, no solamente
// Run 40' in Z2. En la tarjeta tengo que decir 1/2/3/4 con las opciones disponibles."
//
// Los datos YA ESTABAN y no los leía nadie en la tarjeta del día:
//   · `IDEAL_BLOCK_V1` etiqueta cada día con su `alt` (`hard_cardio`, `strength_upper`…).
//   · `ALT_LIBRARY['hard_cardio']` tiene bici Z2, remo moderado, run/walk fácil y el híbrido
//     sled+ski, cada uno con su `reason` y sus `ruleIds`. Su consumidor se retiró en v11.62 y
//     las alternativas se quedaron huérfanas: el preview las pintaba como TEXTO, sin poder
//     elegirlas.
//   · `CARDIO_LIBRARY` tiene 17 sesiones con DSL y ya sabe cuál encaja con el subtipo de hoy.
//
// Julian eligió "las dos cosas": primero QUÉ sesión, y dentro de ella CON QUÉ. Son dos
// decisiones distintas y conviene no mezclarlas — cambiar de máquina no cambia el estímulo
// (SEL-004, INT-002: misma dosis aeróbica, distinto impacto e interferencia con las piernas),
// mientras que cambiar de sesión sí.
const CARDIO_MODALITIES = [
  { id: 'run_outdoor', label: 'Run', icon: '🏃' },
  { id: 'treadmill', label: 'Treadmill', icon: '🏃' },
  { id: 'bike', label: 'Bike', icon: '🚴' },
  { id: 'row', label: 'Row', icon: '🚣' },
  { id: 'ski', label: 'SkiErg', icon: '⛷️' },
];

/**
 * Las 2-3 sesiones entre las que elegir hoy. La prescrita SIEMPRE la primera y marcada.
 * Puras salvo la lectura del plan activo: deciden qué se ofrece, no qué se hace.
 */
function cardioDayOptions(planned) {
  const out = [{
    id: 'rx',
    label: planned.subtitle || cardioSubtypeLabel(planned.subtype) || 'Prescribed',
    detail: planned.distanceKm ? `${planned.distanceKm} km` : (planned.durationMin ? `${planned.durationMin} min` : ''),
    why: 'What the plan asks for today.',
    recommended: true,
    modality: planned.modality || null,
  }];
  // Las alternativas del día vienen de su `alt` en el bloque ideal. Sin `alt`, no se inventan.
  const alt = planned.alt || (planned.slot && planned.slot.alt) || null;
  const lib = (typeof ALT_LIBRARY !== 'undefined' && ALT_LIBRARY) ? (ALT_LIBRARY[alt] || []) : [];
  // LAS DURAS VAN LAS ÚLTIMAS Y DICEN QUE LO SON. El híbrido de trineo + SkiErg está en esta
  // lista como ALTERNATIVA de un día de cardio (HYB-001: "0-1/sem, en lugar de un cardio, no
  // además"), pero ofrecerlo en el mismo tono que un Z2 fácil invita a convertir un día suave en
  // un día duro sin pensarlo — y el presupuesto de días duros es semanal (BUD-001).
  const dura = (a) => a.family === 'hybrid' || /RPE 8|RPE 9/.test(String(a.intensity || ''));
  const ordenadas = lib.slice().sort((a, b) => (dura(a) ? 1 : 0) - (dura(b) ? 1 : 0));
  for (const a of ordenadas.slice(0, 3)) {
    out.push({
      id: `alt-${out.length}`,
      label: a.label,
      detail: [a.durationMin ? `${a.durationMin} min` : '', dura(a) ? 'demanding' : ''].filter(Boolean).join(' · '),
      why: a.reason || '',
      recommended: false,
      modality: a.modality || null,
    });
  }
  return out;
}

/** El HTML de "Pick one" + la fila de máquinas. Reutiliza el chasis de `.swap-panel`. */
function cardioOptionsHtml(opciones) {
  if (!opciones || opciones.length < 2) return '';
  return `<div class="cardio-opts">
    <div class="swap-title">Pick one</div>
    ${opciones.map((o, i) => `
      <button class="swap-option cardio-opt" data-copt="${i}">
        <span class="cardio-opt-n">${i + 1}</span>
        <span class="cardio-opt-main">
          <span class="cardio-opt-label">${escapeHtml(o.label)}${o.detail ? ` · ${escapeHtml(o.detail)}` : ''}</span>
          ${o.why ? `<span class="cardio-opt-why">${escapeHtml(o.why)}</span>` : ''}
        </span>
        ${o.recommended ? '<span class="cardio-opt-rec">Recommended</span>' : ''}
      </button>`).join('')}
    <div class="swap-title" style="margin-top:10px">On what</div>
    <div class="cardio-mods">
      ${CARDIO_MODALITIES.map((m) => `<button class="swap-option cardio-mod" data-cmod="${m.id}">${m.icon} ${escapeHtml(m.label)}</button>`).join('')}
    </div>
  </div>`;
}

// ==================== VOLUME PER MUSCLE GROUP (HEATMAP) ====================
//
// SERIES EFECTIVAS EN PANTALLA (L-1, 2026-09-10). Este mapa contaba UNA serie entera para la
// etiqueta `muscle` del ejercicio y NADA para nadie más: un press de banca no acreditaba ni al
// hombro ni al tríceps, y una remada nada al bíceps. El coach, desde v11.71, juzga el volumen en
// series EFECTIVAS (1,0 al motor primario + 0,5 por cada secundario cargado del patrón), porque
// el 10-14 de STR-003 está escrito en esos términos. O sea que la pantalla y el coach decían dos
// números distintos del mismo entreno — exactamente el fallo que L-1 documentó (la app leía 16
// series donde el validador leía 13) y que costó una semana de decisiones sobre un dato corrupto.
//
// NO SE ESCRIBE UN SEGUNDO MAPA DE CRÉDITOS. Se reusa el ÚNICO que existe, en `coach-facts.js`
// (`VP_PATTERN_SECONDARIES`, `VP_SECONDARY_CREDIT`, `VP_NO_SECONDARY_IDS`, `VP_PATTERN_IDS`,
// `_vpVolumeMuscle`, `_vpSecondariesFor`), que son declaraciones de nivel superior de un script
// clásico cargado ANTES de este fichero y por tanto globales. Todo va con guarda `typeof`: con un
// bundle viejo en caché la tarjeta degrada a series DIRECTAS (subcuenta, nunca infla) en vez de
// lanzar y dejar la pantalla en blanco.
//
// La diferencia con el validador: allí se cuentan series PLANIFICADAS del plan; aquí, las series
// HECHAS (`s.done`). Mismo crédito, distinta entrada.

/** ¿Está disponible el crédito fraccionado de `coach-facts.js`? Si no, series directas. */
function _mvEffectiveAvailable() {
  return typeof _vpVolumeMuscle === 'function'
    && typeof _vpSecondariesFor === 'function'
    && typeof VP_SECONDARY_CREDIT === 'number'
    && typeof VP_NO_SECONDARY_IDS === 'object' && VP_NO_SECONDARY_IDS
    && typeof VP_PATTERN_IDS === 'object' && VP_PATTERN_IDS;
}

/** Media serie: el crédito fraccionado es una estimación, no una medida al decimal. */
function _mvHalf(n) { return Math.round((Number(n) || 0) * 2) / 2; }

/** `10` → "10"; `10.5` → "10.5". Punto decimal (i18n: la UI es en inglés). */
function _mvNum(n) {
  const v = _mvHalf(n);
  return (v % 1 === 0) ? String(v) : v.toFixed(1);
}

/** ¿Esta fila se juzga contra el 10-14 de STR-003? `Power` y `Erectors`, no — igual que el
 *  validador (`VP_VOLUME_NO_FLOOR`): la pliometría no es volumen de hipertrofia y el corpus no
 *  declara ninguna banda para los erectores, que trabajan en cada bisagra y cada transporte. */
function _mvHasBand(muscle) {
  const fam = (typeof _vpMuscleFamily === 'function') ? _vpMuscleFamily(muscle) : muscle;
  if (typeof _vpFamilyHasFloor === 'function') return _vpFamilyHasFloor(fam);
  return !/^(power|core|erectors|otros|other)$/i.test(String(fam || ''));
}

async function renderMuscleVolume() {
  const container = document.getElementById('muscle-volume');
  if (!container) return;

  const weekDates = getWeekDates();
  const weekStrs = weekDates.map(d => dateStr(d));
  let workouts;
  try { workouts = (await dbGetAll('workouts')).filter(w => weekStrs.includes(w.date)); } catch (e) {
    console.warn('[Volumen] series por músculo:', e);
    showErrorState(container, 'Could not read this week\'s sets.', renderMuscleVolume);
    return;
  }

  if (workouts.length === 0) {
    showEmptyState(container, '📊', 'No data yet', 'Complete workouts to see your volume heatmap');
    return;
  }

  // Series EFECTIVAS por músculo y por día, con el crédito de `coach-facts.js`.
  const efectivas = _mvEffectiveAvailable();
  const muscleDay = {}; // { muscle: { '2026-04-07': 4.5, ... } }
  const muscleTotals = {};
  const anota = (m, date, n) => {
    if (!m || !n) return;
    if (!muscleDay[m]) muscleDay[m] = {};
    muscleDay[m][date] = (muscleDay[m][date] || 0) + n;
    muscleTotals[m] = (muscleTotals[m] || 0) + n;
  };
  workouts.forEach(w => {
    w.exercises.forEach(ex => {
      let muscle = null;
      for (const s of Object.values(activePlan.sessions)) {
        const found = s.exercises.find(e => e.id === ex.exerciseId);
        if (found) { muscle = found.muscle; break; }
      }
      // Era el único agregador por músculo que NO consultaba la librería: todo lo registrado en una
      // sesión libre (y los ejercicios nuevos como el pullover en polea) caía en 'Other'. Va aquí, en
      // medio, para no alterar la resolución de nada que ya funcionase.
      if (!muscle && exerciseLibrary[ex.exerciseId]) muscle = exerciseLibrary[ex.exerciseId].muscle;
      if (!muscle) {
        for (const [m, alts] of Object.entries(EXERCISE_ALTERNATIVES)) {
          if (alts.some(a => a.id === ex.exerciseId)) { muscle = m; break; }
        }
      }
      if (!muscle) muscle = 'Other';
      // v11.48 — `pogo-hops` y `box-jump` estan como muscle: 'Quads', asi que sus series se
      // contaban como volumen de cuadriceps: el 3-sep el mapa de calor marco 12 series de
      // cuadriceps cuando eran 7 (4 sentadilla + 3 hack + 2 pogos + 3 saltos), un +71%. Con las
      // decisiones de volumen tomadas sobre ese numero, era un dato corrupto.
      //
      // Se reetiqueta AQUI y no en el PLAN: el campo `muscle` alimenta `data-swap-muscle`, y
      // 'Power' no es una clave de EXERCISE_ALTERNATIVES, asi que cambiarlo alli dejaria el
      // boton de swap sin alternativas. Los contactos siguen visibles en su propia fila.
      //
      // v11.72 (L-1): la reetiqueta la decide `_vpVolumeMuscle`, que es la MISMA función que usa
      // el coach (ids de pliometría / acondicionamiento / transporte, más la etiqueta
      // `power|conditioning|cardio|plyo`). La regla por patrón de v11.48 se queda DETRÁS como
      // red: cubre un id pliométrico que el mapa del coach todavía no conozca, y en la
      // dirección segura (fuera de la hipertrofia, nunca dentro).
      if (efectivas) muscle = _vpVolumeMuscle(ex.exerciseId, muscle);
      if (MOVEMENT_PATTERNS[ex.exerciseId] === 'plyometric') muscle = 'Power';

      const doneSets = ex.sets.filter(s => s.done).length;
      if (!doneSets) return;
      anota(muscle, w.date, doneSets);
      if (!efectivas) return;
      // El primario ya tiene su 1,0. `Power` no acredita secundarios (no es hipertrofia), una
      // apertura tampoco (monoarticular aunque la librería la etiquete como press), y un patrón
      // que no se puede resolver no acredita NADA: el sesgo es siempre a subcontar.
      if (muscle === 'Power') return;
      if (VP_NO_SECONDARY_IDS[String(ex.exerciseId || '')]) return;
      const patron = MOVEMENT_PATTERNS[ex.exerciseId] || VP_PATTERN_IDS[String(ex.exerciseId || '')] || null;
      if (!patron) return;
      for (const sec of _vpSecondariesFor(patron, muscle)) anota(sec, w.date, doneSets * VP_SECONDARY_CREDIT);
    });
  });
  // A 0,5, una vez, al final: sumar y redondear en cada paso arrastraría el redondeo.
  for (const m of Object.keys(muscleTotals)) {
    muscleTotals[m] = _mvHalf(muscleTotals[m]);
    for (const d of Object.keys(muscleDay[m] || {})) muscleDay[m][d] = _mvHalf(muscleDay[m][d]);
  }

  // Sort muscles by total sets descending
  const sorted = Object.keys(muscleTotals).sort((a, b) => muscleTotals[b] - muscleTotals[a]);

  // El VEREDICTO (el 10-14) se da por FAMILIA, no por etiqueta, porque es así como lo da el
  // validador: la cadena posterior repartida en `Hamstrings` / `Posterior` / `Glutes` leía 9
  // series donde había 14 (F-7). Las FILAS siguen siendo por músculo —esa granularidad es lo
  // útil de un mapa de calor— pero el color del total sale del total de su familia. Sin esto,
  // `Glutes 3.5` se pintaría en naranja mientras el coach dice que la cadena posterior cumple:
  // la pantalla y el coach volverían a contradecirse, que es el fallo entero de L-1.
  const familyTotals = {};
  for (const m of sorted) {
    const fam = (typeof _vpMuscleFamily === 'function') ? _vpMuscleFamily(m) : m;
    familyTotals[fam] = _mvHalf((familyTotals[fam] || 0) + muscleTotals[m]);
  }
  const familyOf = (m) => ((typeof _vpMuscleFamily === 'function') ? _vpMuscleFamily(m) : m);

  // Find max sets in any single cell for intensity scaling
  let maxCell = 0;
  sorted.forEach(m => weekStrs.forEach(d => { maxCell = Math.max(maxCell, (muscleDay[m] && muscleDay[m][d]) || 0); }));
  if (maxCell === 0) maxCell = 1;

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayStr = today();

  // La etiqueta dice que el número lleva crédito fraccionado. Sin esto, un "8.5" en la fila de
  // hombros parece un error de la app en vez de la cuenta que el coach usa.
  let html = efectivas
    ? `<p class="muted" style="font-size:11px;margin:0 0 10px;line-height:1.5">Effective sets: <b>1.0</b> for the exercise's primary muscle + <b>0.5</b> for each loaded secondary of its movement pattern (a bench press credits shoulders and triceps; a row, biceps and rear delts). This is the count the coach judges against 10-14, and the colour of each total is its <b>family</b> verdict — hamstrings, glutes and posterior are one chain to the coach. <b>Power</b> and <b>Erectors</b> have no band and are shown apart.</p>`
    : `<p class="muted" style="font-size:11px;margin:0 0 10px;line-height:1.5">Direct sets only (the effective-set credit is unavailable in this build).</p>`;
  html += `<div class="heatmap-grid" style="grid-template-columns: 72px repeat(7, 1fr) 40px">`;
  // Header row
  html += `<div class="hm-corner"></div>`;
  dayLabels.forEach((d, i) => {
    const isToday = weekStrs[i] === todayStr;
    html += `<div class="hm-day${isToday ? ' hm-today' : ''}">${d}</div>`;
  });
  html += `<div class="hm-day">Σ</div>`;

  // Muscle rows
  sorted.forEach(muscle => {
    const color = MUSCLE_COLORS[muscle] || MUSCLE_FALLBACK;
    const total = muscleTotals[muscle];
    // El 10-14 sólo se juzga donde el corpus lo declara. `Power` y `Erectors` se pintan neutros:
    // colorearlos en naranja por "no llegar a 10" sería inventarse una banda que no existe.
    const conBanda = _mvHasBand(muscle);
    const fam = familyOf(muscle);
    const veredicto = familyTotals[fam] != null ? familyTotals[fam] : total;
    const inRange = veredicto >= 10 && veredicto <= 14;
    const colorTotal = !conBanda ? 'var(--text3)'
      : (inRange ? 'var(--accent)' : veredicto < 10 ? 'var(--orange)' : 'var(--yellow)');
    const tituloFam = (fam !== muscle) ? ` title="${escapeHtml(String(fam))}: ${_mvNum(veredicto)} effective sets"` : '';
    html += `<div class="hm-muscle" style="color:${color}"${tituloFam}>${escapeHtml(String(muscle))}</div>`;
    weekStrs.forEach(d => {
      const sets = (muscleDay[muscle] && muscleDay[muscle][d]) || 0;
      const intensity = sets / maxCell;
      // V-2: antes se concatenaba el alfa al hex (`#60a5fa99`). Con tokens eso no existe, así
      // que el tinte se compone con `color-mix`, que es lo que el hex+alfa imitaba a mano.
      const bg = sets > 0 ? `color-mix(in srgb, ${color} ${Math.round(intensity * 60)}%, transparent)` : 'transparent';
      html += `<div class="hm-cell" style="background:${bg}" title="${escapeHtml(String(muscle))}: ${_mvNum(sets)} ${efectivas ? 'effective ' : ''}sets">${sets ? _mvNum(sets) : ''}</div>`;
    });
    html += `<div class="hm-total" style="color:${colorTotal}">${_mvNum(total)}</div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// ==================== SWIMLANE TIMELINE ====================
async function renderSwimlaneTL() {
  const container = document.getElementById('swimlane-timeline');
  if (!container) return;

  const weekDates = getWeekDates();
  const weekStrs = weekDates.map(d => dateStr(d));
  const workouts = await dbGetAll('workouts');
  const runs = await getRunsDeduped();
  const customSchedule = await getWeekSchedule();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayStr = today();

  const lanes = [
    { id: 'gym', label: 'Gym', color: 'var(--orange)', icon: '🏋️' },
    { id: 'run', label: 'Run', color: 'var(--blue)', icon: '🏃' },
    { id: 'rest', label: 'Rest', color: 'var(--text3)', icon: '😴' },
  ];

  // Build day data
  const dayData = weekStrs.map((ds, i) => {
    const w = workouts.find(w => w.date === ds);
    const r = runs.find(r => r.date === ds);
    const sched = customSchedule || activeWeekTemplate;
    const jsDay = weekDates[i].getDay();
    const planned = sched[jsDay] || { type: 'rest' };
    return { date: ds, day: dayNames[i], workout: w, run: r, planned };
  });

  let html = `<div class="swimlane">`;
  // Day headers
  html += `<div class="sl-header"><div class="sl-lane-label"></div>`;
  dayData.forEach(d => {
    const isToday = d.date === todayStr;
    html += `<div class="sl-day${isToday ? ' sl-today' : ''}">${d.day}</div>`;
  });
  html += `</div>`;

  // Lanes
  lanes.forEach(lane => {
    html += `<div class="sl-row"><div class="sl-lane-label">${lane.icon} ${lane.label}</div>`;
    dayData.forEach(d => {
      let active = false, label = '';
      if (lane.id === 'gym') {
        if (d.workout) {
          active = true;
          const sess = activePlan.sessions[d.workout.session];
          label = sess ? sess.name.replace(/Upper |Lower /, '').charAt(0) : '✓';
        } else if (d.planned.type === 'gym' && d.date >= todayStr) {
          label = '·';
        }
      } else if (lane.id === 'run') {
        if (d.run) {
          active = true;
          label = d.run.distance ? d.run.distance + 'k' : '✓';
        } else if (d.planned.type === 'run' && d.date >= todayStr) {
          label = '·';
        }
      } else if (lane.id === 'rest') {
        if (!d.workout && !d.run && d.date <= todayStr) {
          active = true;
          label = '✓';
        } else if (d.planned.type === 'rest' || d.planned.type === 'recovery') {
          label = '·';
        }
      }
      const bg = active ? lane.color : 'transparent';
      html += `<div class="sl-cell${active ? ' sl-active' : ''}" style="${active ? 'background:' + lane.color + '20;color:' + lane.color : ''}"><span>${label}</span></div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// ==================== DRAG-TO-REORDER EXERCISES ====================
function initExerciseDrag(container) {
  let dragEl = null, placeholder = null, startY = 0, offsetY = 0, longPressTimer = null;

  const getSwappable = () => [...container.children].filter(el => el.classList.contains('exercise-card') || el.classList.contains('superset-group'));

  container.addEventListener('touchstart', (e) => {
    const header = e.target.closest('.exercise-header');
    if (!header) return;
    const card = header.closest('.exercise-card, .superset-group') || header.closest('.exercise-card');
    if (!card || !container.contains(card)) return;
    const touch = e.touches[0];
    startY = touch.clientY;
    longPressTimer = setTimeout(() => {
      dragEl = card.parentElement.classList.contains('superset-group') ? card.parentElement : card;
      const rect = dragEl.getBoundingClientRect();
      offsetY = startY - rect.top;
      dragEl.classList.add('dragging');
      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = rect.height + 'px';
      dragEl.parentNode.insertBefore(placeholder, dragEl);
      dragEl.style.position = 'fixed';
      dragEl.style.top = (startY - offsetY) + 'px';
      dragEl.style.left = rect.left + 'px';
      dragEl.style.width = rect.width + 'px';
      dragEl.style.zIndex = '999';
      // (No vibration — iOS Safari doesn't implement navigator.vibrate.)
    }, 400);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (longPressTimer && Math.abs(e.touches[0].clientY - startY) > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!dragEl) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    dragEl.style.top = (y - offsetY) + 'px';
    // Find swap target
    const items = getSwappable().filter(el => el !== dragEl);
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (y < mid && container.children.length > 0) {
        container.insertBefore(placeholder, item);
        break;
      }
      if (item === items[items.length - 1]) {
        container.appendChild(placeholder);
      }
    }
  }, { passive: false });

  const endDrag = () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl.style.position = '';
    dragEl.style.top = '';
    dragEl.style.left = '';
    dragEl.style.width = '';
    dragEl.style.zIndex = '';
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(dragEl, placeholder);
      placeholder.remove();
    }
    // Spring animation
    dragEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    dragEl.style.transform = 'scale(1.02)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dragEl.style.transform = '';
        setTimeout(() => { dragEl.style.transition = ''; }, 300);
      });
    });
    dragEl = null;
    placeholder = null;
  };

  container.addEventListener('touchend', endDrag, { passive: true });
  container.addEventListener('touchcancel', endDrag, { passive: true });
}

// ==================== STAR & TOGGLE HELPERS ====================
function getStarValue(containerId) {
  const sel = document.querySelector(`#${containerId} button.selected`);
  return sel ? parseInt(sel.dataset.v) : 3;
}

function setStarValue(containerId, val) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('button').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.v) === val));
}

function setupStarGroup(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

// ==================== SETTINGS ====================
async function loadSettings() {
  const saved = await dbGet('settings', 'userSettings');
  if (saved) {
    state.settings = { ...state.settings, ...saved.data };
  }
  applySettingsToUI();
}

function applySettingsToUI() {
  const { unit, proteinTarget, startDate, userName, audioFeedback, stepsTarget, goalWeight } = state.settings;
  document.getElementById('unit-kg').classList.toggle('selected', unit === 'kg');
  document.getElementById('unit-lb').classList.toggle('selected', unit === 'lb');
  document.getElementById('setting-protein-target').value = proteinTarget;
  // Objetivos por tipo de dia. El `calorieTarget` unico se conserva en el estado como
  // media (lo leen otras vistas), pero ya no se edita a mano: se deriva de los dos.
  const elTr = document.getElementById('setting-calorie-target-training');
  const elRe = document.getElementById('setting-calorie-target-rest');
  if (elTr) elTr.value = state.settings.calorieTargetTraining || 2700;
  if (elRe) elRe.value = state.settings.calorieTargetRest || 2400;
  document.getElementById('setting-start-date').value = startDate || today();
  document.getElementById('setting-name').value = userName || '';
  const goalWeightEl = document.getElementById('setting-goal-weight');
  if (goalWeightEl) goalWeightEl.value = goalWeight || '';
  const audioOnEl = document.getElementById('audio-on');
  const audioOffEl = document.getElementById('audio-off');
  if (audioOnEl && audioOffEl) {
    const on = audioFeedback !== false;
    audioOnEl.classList.toggle('selected', on);
    audioOffEl.classList.toggle('selected', !on);
  }
  const stepsTargetEl = document.getElementById('setting-steps-target');
  if (stepsTargetEl) stepsTargetEl.value = stepsTarget || 8000;
  const stepsSecretEl = document.getElementById('steps-secret');
  if (stepsSecretEl) stepsSecretEl.value = stepsSecret();   // C-8: localStorage, no la fila
  const stepsEndpointEl = document.getElementById('steps-endpoint-url');
  if (stepsEndpointEl) stepsEndpointEl.value = STEPS_INGEST_URL;
  // Coach v2 (v11.61): 'ask' por defecto. `coachAutoApplyMode()` normaliza (vive en coach.js).
  const autoEl = document.getElementById('setting-coach-auto-apply');
  if (autoEl) autoEl.value = (typeof coachAutoApplyMode === 'function') ? coachAutoApplyMode() : 'ask';
  // v11.69: quién escribe la revisión — la función con la API, o Claude Code a mano (sin coste).
  const modeEl = document.getElementById('setting-coach-review-mode');
  if (modeEl) modeEl.value = (typeof coachReviewMode === 'function') ? coachReviewMode() : 'api';
}

async function saveSettings() {
  const unit = document.getElementById('unit-kg').classList.contains('selected') ? 'kg' : 'lb';
  const proteinTarget = parseInt(document.getElementById('setting-protein-target').value) || NUT_PROTEIN_FLOOR;
  const trEl = document.getElementById('setting-calorie-target-training');
  const reEl = document.getElementById('setting-calorie-target-rest');
  const calorieTargetTraining = (trEl && parseInt(trEl.value)) || NUT_KCAL_TRAINING;
  const calorieTargetRest = (reEl && parseInt(reEl.value)) || NUT_KCAL_REST;
  // Media de la semana del plan (4 dias de entreno + 3 de descanso). Se sigue guardando
  // porque otras vistas leen `calorieTarget`, pero es derivado, no editable.
  const calorieTarget = Math.round((calorieTargetTraining * 4 + calorieTargetRest * 3) / 7);
  const startDate = document.getElementById('setting-start-date').value || today();
  const userName = document.getElementById('setting-name').value.trim();
  const stepsTargetEl = document.getElementById('setting-steps-target');
  const stepsTarget = stepsTargetEl ? (parseInt(stepsTargetEl.value) || 8000) : (state.settings.stepsTarget || 8000);
  const goalWeightEl = document.getElementById('setting-goal-weight');
  const goalWeightVal = goalWeightEl ? parseFloat(goalWeightEl.value) : NaN;
  const goalWeight = (Number.isFinite(goalWeightVal) && goalWeightVal > 20 && goalWeightVal < 300) ? goalWeightVal : null;

  state.settings = { ...state.settings, unit, proteinTarget, calorieTarget, calorieTargetTraining, calorieTargetRest, startDate, userName, stepsTarget, goalWeight };
  await smartPut('settings', { key: 'userSettings', data: state.settings });
  toast('Settings saved!');
  renderStepsCard();
}

// Generate a steps secret on demand. The value must be copied by the user
// into the Supabase Function env (STEPS_INGEST_SECRET) and into the iOS
// Shortcut. Stored locally so the same secret is reused for "Test connection".
async function generateStepsSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  setStepsSecret(secret);              // C-8: localStorage, nunca la fila sincronizada
  applySettingsToUI();
  toast('Secret generated. Copy it to the Supabase env var + your Shortcut.');
}

async function testStepsConnection() {
  const secret = stepsSecret();
  if (!secret) { toast('Generate a secret first'); return; }
  const out = document.getElementById('steps-test-output');
  if (out) out.textContent = 'Testing…';
  const r = await postStepsToCloud(0, today());
  if (r.ok) {
    if (out) out.textContent = '✓ OK — endpoint accepted the secret. Test row written for today (steps=0). Now build the Shortcut to push real values.';
    toast('Connection OK');
  } else {
    if (out) out.textContent = '✗ ' + (r.error || 'Unknown error');
    toast('Test failed: ' + r.error);
  }
}

// ==================== BACKUP / RESTORE ====================
async function exportBackup() {
  const data = {
    version: 3.1,
    exportDate: new Date().toISOString(),
    workouts: await dbGetAll('workouts'),
    runs: await dbGetAll('runs'),
    nutrition: await dbGetAll('nutrition'),
    settings: _redactSettingsRows(await dbGetAll('settings')),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const fileName = `training-backup-${today()}.json`;

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'application/json' });
    const shareData = { files: [file], title: 'Training Backup', text: `Backup from ${today()}` };
    try {
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast('Backup shared!');
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup downloaded!');
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // C-16: `smartPut` y no `dbPut`. Un restore es EXACTAMENTE el momento en que la copia de
    // la nube está incompleta o perdida, y con `dbPut` lo restaurado se quedaba en el
    // teléfono: la siguiente bajada podía volver a pisarlo con lo que hubiera en Supabase.
    // Ahora entra en la cola y sube.
    if (data.workouts) for (const w of data.workouts) await smartPut('workouts', w);
    if (data.runs) for (const r of data.runs) await smartPut('runs', r);
    if (data.nutrition) for (const n of data.nutrition) await smartPut('nutrition', n);
    if (data.settings) for (const s of data.settings) await smartPut('settings', s);

    await loadSettings();
    toast('Backup restored!');
    switchTab(state.currentTab);
  } catch (e) {
    console.error(e);
    toast(`Could not restore the backup: ${errText(e, 'unreadable file')}`);
  }
}

// ==================== EVENT BINDING ====================
function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Stats sub-tabs
  document.querySelectorAll('#stats-tabs .stats-tab').forEach(btn => {
    btn.addEventListener('click', () => switchStatsGroup(btn.dataset.statsGroup));
  });

  // Settings button
  document.getElementById('btn-settings').addEventListener('click', () => {
    enterSecondaryView('settings');
    renderTrashList();
  });

  // T4: Ideal Plan Preview open/back (read-only view)
  { const b = document.getElementById('btn-ideal-preview'); if (b) b.addEventListener('click', openIdealPreview); }
  { const b = document.getElementById('ip-back'); if (b) b.addEventListener('click', () => enterSecondaryView('settings')); }
  { const b = document.getElementById('btn-analytics'); if (b) b.addEventListener('click', openAnalytics); }
  { const b = document.getElementById('an-back'); if (b) b.addEventListener('click', () => enterSecondaryView('settings')); }

  // Vista Coach (v11.61). El "volver" va a HOME y no a Ajustes: se entra sobre todo desde la
  // tarjeta de Home, y devolver a Ajustes al que llegó desde Home sería teletransportarlo.
  { const b = document.getElementById('coach-back'); if (b) b.addEventListener('click', () => { switchTab('home'); }); }
  { const b = document.getElementById('btn-open-coach'); if (b) b.addEventListener('click', () => { if (typeof openCoachView === 'function') openCoachView(); }); }
  { const b = document.getElementById('btn-export-facts'); if (b) b.addEventListener('click', () => { if (typeof exportCoachFacts === 'function') exportCoachFacts(); }); }
  {
    const s = document.getElementById('setting-coach-auto-apply');
    // Se guarda al cambiar y no al pulsar "Save": es un interruptor, no un formulario.
    if (s) s.addEventListener('change', () => { if (typeof setCoachAutoApply === 'function') setCoachAutoApply(s.value); });
  }
  {
    const s = document.getElementById('setting-coach-review-mode');
    if (s) s.addEventListener('change', () => { if (typeof setCoachReviewMode === 'function') setCoachReviewMode(s.value); });
  }

  // Unit toggle in workout header (segmented control)
  document.getElementById('unit-toggle').addEventListener('click', async (e) => {
    const btn = e.target.closest('.unit-opt');
    if (!btn) return;
    const newUnit = btn.dataset.unit;
    if (newUnit === state.settings.unit) return;
    state.settings.unit = newUnit;
    document.querySelectorAll('#unit-toggle .unit-opt').forEach(b => b.classList.toggle('active', b.dataset.unit === newUnit));
    await smartPut('settings', { key: 'userSettings', data: state.settings });
    // Update column headers to reflect new unit
    document.querySelectorAll('#workout-exercises .set-table-header').forEach(header => {
      const cols = header.children;
      if (cols[1]) {
        const ex = header.closest('.exercise-card');
        // v11.48: si la columna es una medida (cm de cajon), el toggle kg/lb no la toca —
        // convertirla haria de 50 cm 110.
        const measured = ex && ex.dataset && measureUnitFor(ex.dataset.exerciseId);
        if (measured) { cols[1].textContent = measured; return; }
        const isBw = ex && ex.querySelector('.set-input[data-field="weight"]')?.placeholder === '0';
        cols[1].textContent = isBw ? '+' + newUnit : newUnit;
      }
    });
    // Update warm-up plate breakdowns
    document.querySelectorAll('.warmup-plates').forEach(el => {
      const setEl = el.closest('.warmup-auto-set');
      if (!setEl) return;
      const weightSpan = setEl.querySelector('.warmup-weight');
      if (!weightSpan) return;
      const w = parseFloat(weightSpan.textContent);
      if (!isNaN(w)) el.textContent = plateBreakdown(w, newUnit);
    });
  });

  // Mobility view: back button → gym home
  const mobBack = document.getElementById('mob-back-btn');
  if (mobBack) mobBack.addEventListener('click', () => switchTab('gym'));

  // Mobility active: back/end button → confirm + cancel
  const mobActiveBack = document.getElementById('mob-active-back-btn');
  if (mobActiveBack) mobActiveBack.addEventListener('click', cancelMobilityRoutine);

  // Mobility active: skip button → advance immediately
  const mobSkip = document.getElementById('mob-skip-btn');
  if (mobSkip) mobSkip.addEventListener('click', advanceMobilityExercise);

  // Mobility active: pause/resume
  const mobPause = document.getElementById('mob-pause-btn');
  if (mobPause) mobPause.addEventListener('click', pauseMobilityExercise);

  // Back from workout
  document.getElementById('btn-back-gym').addEventListener('click', () => {
    if (state.viewingCompleted) {
      // Viewing saved workout: just go back, no prompt needed
      state.viewingCompleted = false;
      { const f = document.getElementById('btn-finish-workout'); if (f) f.hidden = false; }
      // B-1: la tercera referencia al textarea de notas inexistente vivía aquí, y era la
      // que mataba el botón de volver de un entreno completado.
      const roNotes = document.getElementById('wo-completed-notes');
      if (roNotes) { roNotes.innerHTML = ''; roNotes.hidden = true; }
      // B-2: volver a la pestaña de la que se vino (Home o Gym), no siempre a Home.
      const back = state.viewingCompletedFrom || 'home';
      state.viewingCompletedFrom = null;
      switchTab(back);
    } else if (state.activeSession) {
      if (confirm('Abandon workout? Progress will be lost.')) {
        if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
        state.activeSession = null;
        clearActiveWorkout();
        state.currentView = 'home';
        switchTab('home');
      }
    } else {
      state.currentView = 'home';
      switchTab('home');
    }
  });

  // Finish workout
  document.getElementById('btn-finish-workout').addEventListener('click', async () => {
    if (!state.activeSession) return;
    // Una sesión libre se abre vacía: si se termina sin marcar ninguna serie, guardaría un registro
    // sin contenido que luego ensucia el historial y el volumen. Mejor ofrecer descartarla.
    const anyDone = !!document.querySelector('#workout-exercises .set-check.checked');
    if (isAdHocSession(state.activeSession) && !anyDone) {
      if (confirm('You did not log a single set. Discard the session?')) {
        if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
        state.activeSession = null;
        await clearActiveWorkout();
        switchTab('home');
      }
      return;
    }
    if (confirm('Finish workout? It will be saved to your history.')) {
      finishWorkout();
    }
  });

  // Warm-up toggle
  document.getElementById('warmup-toggle').addEventListener('click', () => {
    document.getElementById('warmup-section').classList.toggle('expanded');
  });

  // Quick mode toggle — only allowed before any set is checked, to avoid
  // dropping in-progress data when the cards re-render with reduced sets.
  document.getElementById('quick-mode-toggle').addEventListener('click', async () => {
    if (!state.activeSession) return;
    const anyDone = !!document.querySelector('#workout-exercises .set-check.checked');
    if (anyDone) {
      toast('Lock set after first checked rep — finish or restart the session to switch modes.');
      return;
    }
    state.quickMode = !state.quickMode;
    syncQuickModeUI();
    await startWorkout(state.activeSession);
  });

  // Cardio logging (unified)
  { const b = document.getElementById('btn-log-cardio'); if (b) b.addEventListener('click', logCardio); }

  // Nutricion v2 (v11.49): captura por foto. Los bindings viven en nutrition.js
  // para que el modulo sea autocontenido, como bloodwork.js.
  if (typeof bindNutricionV2 === 'function') bindNutricionV2();

  // Settings save
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Steps: generate-secret + test-connection buttons in Settings
  const genBtn = document.getElementById('btn-steps-generate');
  if (genBtn) genBtn.addEventListener('click', generateStepsSecret);
  const testBtn = document.getElementById('btn-steps-test');
  if (testBtn) testBtn.addEventListener('click', testStepsConnection);
  const copyBtn = document.getElementById('btn-steps-copy-payload');
  if (copyBtn) copyBtn.addEventListener('click', async () => {
    const secret = stepsSecret() || '<GENERATE A SECRET FIRST>';
    const sample = JSON.stringify({ secret, date: 'YYYY-MM-DD', steps: 0, source: 'shortcut' }, null, 2);
    try { await navigator.clipboard.writeText(sample); toast('Sample payload copied'); } catch { toast('Copy failed'); }
  });

  // Force update
  document.getElementById('btn-force-update').addEventListener('click', async () => {
    toast('Updating...');
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.unregister();
      }
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    window.location.reload(true);
  });

  // Unit toggles
  document.getElementById('unit-kg').addEventListener('click', () => {
    document.getElementById('unit-kg').classList.add('selected');
    document.getElementById('unit-lb').classList.remove('selected');
  });
  document.getElementById('unit-lb').addEventListener('click', () => {
    document.getElementById('unit-lb').classList.add('selected');
    document.getElementById('unit-kg').classList.remove('selected');
  });

  // Theme: dark-only (no toggle UI)

  // Star selectors
  ['cardio-feel', 'nut-energy'].forEach(setupStarGroup);

  // Rest timer controls
  document.getElementById('timer-skip').addEventListener('click', stopRestTimer);
  document.getElementById('timer-minus').addEventListener('click', () => {
    state.restTimerRemaining = Math.max(0, state.restTimerRemaining - 15);
    if (state.restTimerEndAt) state.restTimerEndAt -= 15000;
  });
  document.getElementById('timer-plus').addEventListener('click', () => {
    state.restTimerRemaining += 15;
    state.restTimerTotal = Math.max(state.restTimerTotal, state.restTimerRemaining);
    if (state.restTimerEndAt) state.restTimerEndAt += 15000;
  });

  // Body weight
  document.getElementById('btn-log-bw').addEventListener('click', logBodyWeight);
  document.getElementById('bw-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') logBodyWeight();
  });

  // Plate calculator (Stats > Tools)
  document.getElementById('plate-calc-input').addEventListener('input', renderPlateCalculator);
  document.querySelectorAll('#plate-unit-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      plateCalcUnit = btn.dataset.plateUnit;
      document.querySelectorAll('#plate-unit-toggle .toggle-btn').forEach(b => {
        b.classList.toggle('selected', b === btn);
      });
      renderPlateCalculator();
    });
  });

  // Plate calculator FAB + bottom-sheet (during workout)
  const plateFab = document.getElementById('plate-fab');
  if (plateFab) {
    plateFab.addEventListener('click', () => {
      // Try to prefill from the currently focused weight input
      const focused = document.activeElement;
      let prefill = null;
      if (focused && focused.matches('[data-field="weight"]')) {
        const v = parseFloat(focused.value);
        if (v > 0) prefill = v;
      }
      openPlateSheet(prefill);
    });
  }
  const sheetClose = document.getElementById('plate-sheet-close');
  if (sheetClose) sheetClose.addEventListener('click', closePlateSheet);
  const sheetBackdrop = document.getElementById('plate-sheet-backdrop');
  if (sheetBackdrop) sheetBackdrop.addEventListener('click', closePlateSheet);

  const sheetInput = document.getElementById('plate-sheet-input');
  if (sheetInput) sheetInput.addEventListener('input', () => {
    renderPlateInto('plate-sheet-input', 'plate-sheet-result', plateSheetUnit);
  });

  document.querySelectorAll('#plate-sheet-unit-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      plateSheetUnit = btn.dataset.sheetUnit;
      document.querySelectorAll('#plate-sheet-unit-toggle .toggle-btn').forEach(b => {
        b.classList.toggle('selected', b === btn);
      });
      // Local a la calculadora: NO toca state.settings.unit ni el selector de la cabecera. Cambiar
      // la unidad con la que consultas discos no puede cambiar en qué unidad se graba la sesión.
      renderPlateInto('plate-sheet-input', 'plate-sheet-result', plateSheetUnit);
    });
  });

  // Backup / Restore / CSV
  document.getElementById('btn-backup').addEventListener('click', exportBackup);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  const btnJson = document.getElementById('btn-export-json');
  if (btnJson) btnJson.addEventListener('click', exportJSON);
  document.getElementById('file-restore').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });

  // Exercise modal close
  document.getElementById('modal-close').addEventListener('click', closeExerciseModal);

  // Edit workout modal
  document.getElementById('ew-close').addEventListener('click', closeEditWorkout);
  document.getElementById('ew-save').addEventListener('click', saveEditWorkout);
  document.getElementById('ew-copy-whoop').addEventListener('click', copyWhoopTranscript);
  document.getElementById('ew-delete').addEventListener('click', deleteEditWorkout);

  // Log past workout
  document.getElementById('btn-log-past').addEventListener('click', logPastWorkout);
  { const b = document.getElementById('btn-free-session'); if (b) b.addEventListener('click', startFreeWorkout); }
  { const b = document.getElementById('btn-add-exercise'); if (b) b.addEventListener('click', addAdHocExercise); }

  // Data recovery buttons (Settings)
  const recoveryOut = document.getElementById('recovery-output');
  const showOut = (txt) => { recoveryOut.hidden = false; recoveryOut.textContent = txt; };
  document.getElementById('btn-recover-data').addEventListener('click', async () => {
    showOut('Scanning…');
    const lines = [];
    // 1) Pending-delete recovery from sync queue
    const restoredQ = await recoverFromSyncQueue();
    lines.push(`Sync queue: restored ${restoredQ.length}`);
    restoredQ.forEach(r => lines.push(`  + ${r.session} · ${r.date}`));
    // 2) Force cloud pull
    const beforeCount = (await dbGetAll('workouts')).length;
    await forceCloudPull();
    const afterCount = (await dbGetAll('workouts')).length;
    lines.push(`Cloud pull: ${beforeCount} → ${afterCount} workouts`);
    lines.push(`(net change: ${afterCount - beforeCount})`);
    showOut(lines.join('\n'));
    await afterWorkoutSaved();
    toast(`Recovery: +${restoredQ.length} queue, ${afterCount - beforeCount} cloud`);
  });
  document.getElementById('btn-scan-cloud').addEventListener('click', async () => {
    showOut('Fetching cloud workouts…');
    const res = await listCloudWorkouts();
    if (res.error) { showOut('Error: ' + res.error); return; }
    const lines = [`Cloud has ${res.rows.length} workouts:`];
    res.rows.forEach(r => {
      const w = r.data || {};
      const sessKey = w.session || '?';
      const session = activePlan.sessions[sessKey];
      const name = session ? session.name : sessKey;
      lines.push(`  ${w.date || '?'} · ${name} · id=${(w.id || '').slice(0, 6)}`);
    });
    showOut(lines.join('\n'));
  });

  // Notification toggles
  document.getElementById('notif-on').addEventListener('click', () => toggleNotifications(true));
  document.getElementById('notif-off').addEventListener('click', () => toggleNotifications(false));

  // Audio feedback toggle (rest timer beep)
  const audioOn = document.getElementById('audio-on');
  const audioOff = document.getElementById('audio-off');
  if (audioOn && audioOff) {
    const initial = state.settings.audioFeedback !== false;
    audioOn.classList.toggle('selected', initial);
    audioOff.classList.toggle('selected', !initial);
    const setAudio = async (on) => {
      state.settings.audioFeedback = on;
      audioOn.classList.toggle('selected', on);
      audioOff.classList.toggle('selected', !on);
      await smartPut('settings', { key: 'userSettings', data: state.settings });
      if (on) primeAudio();
    };
    audioOn.addEventListener('click', () => setAudio(true));
    audioOff.addEventListener('click', () => setAudio(false));
  }

}

// ==================== NOTIFICATIONS ====================
let _notifInterval = null;

async function initNotifications() {
  const enabled = localStorage.getItem('training_notif') === 'on';
  document.getElementById('notif-on').classList.toggle('selected', enabled);
  document.getElementById('notif-off').classList.toggle('selected', !enabled);

  if (enabled && 'Notification' in window) {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') startNotificationChecks();
  }
}

function toggleNotifications(on) {
  localStorage.setItem('training_notif', on ? 'on' : 'off');
  document.getElementById('notif-on').classList.toggle('selected', on);
  document.getElementById('notif-off').classList.toggle('selected', !on);

  if (on && 'Notification' in window) {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        startNotificationChecks();
        toast('Notifications enabled');
      } else {
        toast('Permission denied by browser');
        localStorage.setItem('training_notif', 'off');
        document.getElementById('notif-on').classList.remove('selected');
        document.getElementById('notif-off').classList.add('selected');
      }
    });
  } else {
    if (_notifInterval) clearInterval(_notifInterval);
    toast('Notifications disabled');
  }
}

function startNotificationChecks() {
  if (_notifInterval) clearInterval(_notifInterval);
  checkAndNotify(); // immediate check
  _notifInterval = setInterval(checkAndNotify, 30 * 60 * 1000); // every 30 min
}

async function checkAndNotify() {
  if (localStorage.getItem('training_notif') !== 'on') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const hour = now.getHours();
  const todayStr = today();
  const lastNotif = localStorage.getItem('training_last_notif');
  if (lastNotif === todayStr) return; // one notification per day max

  const jsDay = now.getDay();
  const plan = activeWeekTemplate[jsDay];

  // Morning training reminder (7-10 AM)
  if (hour >= 7 && hour <= 10 && plan.type !== 'rest') {
    const label = plan.type === 'gym'
      ? (activePlan.sessions[plan.session]?.name || 'Gym')
      : 'Zone 2 Run';
    new Notification('Training Day', { body: `Today: ${label}. Let's go!`, tag: 'training-day' });
    localStorage.setItem('training_last_notif', todayStr);
    return;
  }

  // Evening protein reminder (8-10 PM)
  if (hour >= 20 && hour <= 22) {
    try {
      const entry = await dbGet('nutrition', todayStr);
      if (!entry || (entry.protein || 0) < state.settings.proteinTarget) {
        const current = entry ? entry.protein || 0 : 0;
        new Notification('Protein Check', {
          body: `${current}g / ${state.settings.proteinTarget}g today. Log your protein!`,
          tag: 'protein-reminder'
        });
        localStorage.setItem('training_last_notif', todayStr);
      }
    } catch (e) { /* ignore */ }
  }
}

// ==================== SERVICE WORKER ====================
//
// C-6 (auditoría 2026-09-09). Lo que había y por qué era un problema real:
//
//   · DOS caminos de recarga a la vez — `updatefound` (cuando el worker nuevo activa) y
//     `controllerchange` (cuando toma el control). Con `skipWaiting()` + `clients.claim()` los
//     dos disparan en la misma actualización, así que la página se recargaba dos veces.
//   · `controllerchange` salta TAMBIÉN en la primera instalación, cuando la página aún no tenía
//     controlador. Era el "se recarga sola la primera vez que la abro".
//   · `reg.installing` sin comprobar null. `updatefound` también salta cuando el que cambia es
//     `reg.waiting`, y ahí `installing` es null: el `addEventListener` lanzaba un TypeError que
//     se perdía dentro del `.then` y la actualización no se aplicaba nunca más en esa pestaña.
//   · `reg.update()` cada 5 minutos. Con el teléfono en el gimnasio eso es una comprobación
//     cada dos ejercicios, y cada una podía acabar en `location.reload()` A MITAD DE UNA SERIE.
//
// Ahora: UN solo camino, con la comprobación de null, sin recarga en la primera instalación, y
// con una sesión de entreno abierta la recarga NO se hace sola — se ofrece en un chip. Perder
// el sitio en la sesión a mitad de una serie es peor que ir una versión por detrás media hora.
//
// `clients.claim()` se queda en `sw.js`: sin él la primera visita se queda sin controlador y
// no hay app offline hasta la siguiente carga. Lo que se retira es la RECARGA, no el claim.

// El cerrojo que impide recargar dos veces: el chip y el camino automático comparten salida.
// No se guarda el worker: cuando esto se ejecuta ya está `activated` y controlando la página
// (`skipWaiting` + `clients.claim` en sw.js), así que recargar basta — no hay que mandarle nada.
let _swReloading = false;

/** Recarga por decisión explícita (el chip) o automática. Idempotente. */
function _swApplyUpdate() {
  if (_swReloading) return;
  _swReloading = true;
  window.location.reload();
}

/**
 * Chip persistente "New version — tap to reload". Reutiliza el CSS del toast (`.toast` +
 * `.toast-action`) con el modificador `.toast-sticky`, que es lo único que lo distingue: no lo
 * borra el temporizador de `toast()`, porque el aviso tiene que seguir ahí cuando Julian acabe
 * la serie. Id propio para que `toast()` no lo reutilice como su contenedor.
 */
function _swUpdateChip() {
  let el = document.getElementById('sw-update-chip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sw-update-chip';
    el.className = 'toast toast-sticky';
    document.body.appendChild(el);
    el.addEventListener('click', () => _swApplyUpdate());
  }
  el.innerHTML = '<span>New version</span><button class="toast-action">Reload</button>';
  el.classList.add('show');
}

/** El worker nuevo ya está activo: recargar, o ofrecerlo si hay un entreno en curso. */
function _swVersionReady() {
  if (_swReloading) return;
  if (state.activeSession) {
    console.log('[SW] nueva versión lista; sesión abierta → se ofrece, no se recarga');
    _swUpdateChip();
    return;
  }
  toast('App updated — reloading');
  setTimeout(_swApplyUpdate, 1000);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js')
    .then((reg) => {
      console.log('[SW] Registered:', reg.scope);
      // Cada 30 minutos, no cada 5: la comprobación puede terminar en una recarga.
      setInterval(() => { Promise.resolve(reg.update()).catch(() => {}); }, 30 * 60 * 1000);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing || reg.waiting;
        if (!w) return;
        // Sin controlador es la PRIMERA instalación: no hay versión vieja que sustituir.
        if (!navigator.serviceWorker.controller) return;
        if (w.state === 'activated') { _swVersionReady(); return; }
        const onState = () => {
          if (w.state !== 'activated') return;
          w.removeEventListener('statechange', onState);
          _swVersionReady();
        };
        w.addEventListener('statechange', onState);
      });
    })
    .catch((err) => console.warn('[SW] Registration failed:', err));
}

// ==================== INIT ====================

// Nombres canónicos en inglés (v11.45). Los nombres de ejercicio de toda la librería estaban en
// inglés; v11.42 metió cinco en castellano en las sesiones de viaje y v11.44 otros cuatro. El efecto
// no era cosmético: un mismo id acababa con DOS nombres —"Dominadas" en la vista de entrenamiento,
// que lee `ex.name` de la sesión, y "Pull-ups" en el historial, que resuelve por `getExerciseName`.
//
// Los `id` NO se tocan: un id es la clave del historial y cambiarlo lo partiría en dos.
const EXERCISE_NAMES_EN = [
  // v11.44
  { id: 'incline-press', name: 'Incline Chest Press', muscle: 'Chest', movementPattern: 'horizontal-press', bw: false },
  { id: 'incline-db-fly', name: 'Incline DB Fly', muscle: 'Chest', movementPattern: 'horizontal-press', bw: false },
  { id: 'straight-arm-pulldown', name: 'Cable Straight-Arm Pulldown', muscle: 'Back', movementPattern: 'isolation-lat', bw: false },
  { id: 'front-raise', name: 'DB Front Raise', muscle: 'Shoulders', movementPattern: 'isolation-shoulder', bw: false },
  // v11.42 — el nombre inglés ya existía en EXERCISE_ALTERNATIVES; aquí sólo se hace que gane
  { id: 'pullups', name: 'Pull-ups', muscle: 'Back', movementPattern: 'vertical-pull', bw: true },
  { id: 'sl-rdl', name: 'Single-Leg RDL', muscle: 'Hamstrings', movementPattern: 'hinge', bw: true },
  { id: 'sl-glute-bridge', name: 'Single-Leg Glute Bridge', muscle: 'Glutes', movementPattern: 'glute', bw: true },
  { id: 'band-row', name: 'Band Row', muscle: 'Back', movementPattern: 'horizontal-pull', bw: false },
  { id: 'nordic-curl', name: 'Nordic Curl', muscle: 'Hamstrings', movementPattern: 'isolation-ham', bw: true },
];

const AUG20_WORKOUT_ID = 'mt1mjjrhqlx740';

// Reasigna cada hueco al ejercicio que se hizo de verdad, según las notas del propio registro.
// PURA a propósito: recibe el registro y devuelve uno nuevo sin mutar la entrada, para poder
// probarla contra el registro real en tests/verify-aug20-fix.mjs.
// Idempotente por sí misma (no sólo por el flag de migración): si ya está corregido, devuelve la
// MISMA referencia, que es lo que el llamador usa para decidir si escribe.
function fixAug20Mislabeled(w) {
  if (w.exercises.some(e => e.exerciseId === 'incline-press')) return w;
  const origen = (hueco) => `Reassigned on 2026-08-21 · logged in the "${hueco}" slot`;
  const out = { ...w, exercises: [] };

  for (const ex of w.exercises) {
    const sets = ex.sets.map(s => ({ ...s }));
    switch (ex.exerciseId) {
      case 'cable-row':
        // El remo sí era remo. Pero su nota decía "Combine con press de hombro con barra (40kg)
        // 4x10": eso es un ejercicio propio y merece su entrada. Los números salen literalmente de
        // la nota; el RPE va null porque ése no lo registró.
        out.exercises.push({ ...ex, sets, note: 'Superset with barbell shoulder press.' });
        out.exercises.push({
          exerciseId: 'ohp', compound: true,
          note: 'Superset with the row. Weights and reps taken from the original note.',
          sets: [0, 1, 2, 3].map(() => ({ weight: 40, reps: 10, rpe: null, done: true })),
        });
        break;
      case 'incline-db-press':
        out.exercises.push({ ...ex, exerciseId: 'incline-db-fly', db: true, sets, note: origen('incline-db-press') });
        break;
      case 'lat-pulldown':
        // De pie, agarre amplio, brazos extendidos hasta la cadera: extensión de hombro, no tirón
        // vertical. Por eso `isolation-lat` y no `vertical-pull`.
        out.exercises.push({ ...ex, exerciseId: 'straight-arm-pulldown', sets, note: origen('lat-pulldown') });
        break;
      case 'face-pull':
        out.exercises.push({ ...ex, exerciseId: 'incline-press', sets, note: origen('face-pull') });
        break;
      case 'lateral-raise':
        // Eran laterales + frontales encadenadas, anotadas como una serie de 16 (8+8). Se parten en
        // dos ejercicios de 8, que es lo que ocurrió.
        out.exercises.push({ ...ex, db: true, sets: sets.map(s => ({ ...s, reps: 8 })), note: 'Chained with the front raise (8+8).' });
        out.exercises.push({ ...ex, exerciseId: 'front-raise', db: true, sets: sets.map(s => ({ ...s, reps: 8 })), note: 'Chained with the lateral raise (8+8).' });
        break;
      default:
        out.exercises.push({ ...ex, sets });
    }
  }
  return out;
}

// One-time data migrations
async function runMigrations() {
  const migKey = 'migrations_done';
  const done = (await dbGet('settings', migKey)) || { key: migKey, data: [] };
  if (!done.data) done.data = [];

  // Nutricion v2 (v11.49): los objetivos de la app llevaban meses desfasados respecto a
  // plans/nutrition-notes.md — proteina 170 cuando el plan dice 185 desde el 2026-08-19, y
  // un unico `calorieTarget: 2500` que no representaba el ciclado 2.700/2.400 y que ademas
  // no estaba cableado a nada.
  //
  // CONSERVADORA A PROPOSITO: solo toca los valores que siguen en el default viejo. Si el
  // usuario los habia cambiado a mano, esa decision gana; subirle un objetivo que eligio
  // el mismo seria decidir por el.
  if (!done.data.includes('nutricion-v2-targets')) {
    const st = state.settings;
    let cambios = [];
    if (st.proteinTarget === 170) { st.proteinTarget = NUT_PROTEIN_FLOOR; cambios.push('protein 170 -> ' + NUT_PROTEIN_FLOOR); }
    if (st.calorieTargetTraining == null) { st.calorieTargetTraining = NUT_KCAL_TRAINING; cambios.push('kcal training ' + NUT_KCAL_TRAINING); }
    if (st.calorieTargetRest == null) { st.calorieTargetRest = NUT_KCAL_REST; cambios.push('kcal rest ' + NUT_KCAL_REST); }
    if (cambios.length) {
      await smartPut('settings', { key: 'userSettings', data: st });
      applySettingsToUI();
      console.log('[Nutricion] objetivos alineados con nutrition-notes.md:', cambios.join(', '));
    }
    done.data.push('nutricion-v2-targets');
    await dbPut('settings', done);
  }

  // Migration: backfill `unit` on all workouts + convert known lb workouts to kg
  if (!done.data.includes('backfill-unit')) {
    const appUnit = state.settings.unit || 'kg';
    const workouts = await dbGetAll('workouts');
    // These workouts were saved in lb without conversion (known from initial data audit)
    const lbWorkoutIds = ['mnuj7m3zh2anjq', 'mns1m5s1j5yrol'];
    for (const w of workouts) {
      if (w.unit) continue; // already tagged
      if (lbWorkoutIds.includes(w.id) && appUnit === 'kg') {
        // Convert lb weights to kg
        w.exercises.forEach(ex => {
          ex.sets.forEach(s => {
            if (s.weight) s.weight = +(s.weight * LB_TO_KG).toFixed(2);
          });
        });
        console.log(`[Migration] Converted workout ${w.id} from lb to kg`);
      }
      w.unit = appUnit;
      await smartPut('workouts', w);
    }
    done.data.push('backfill-unit');
    await dbPut('settings', done);
  }

  // Migration: fix duplicate workouts on 2026-04-08 — move Upper A to 2026-04-07
  if (!done.data.includes('fix-apr8-dup')) {
    const workouts = await dbGetAll('workouts');
    const apr8 = workouts.filter(w => w.date === '2026-04-08');
    if (apr8.length >= 2) {
      const upperA = apr8.find(w => w.session === 'upperA');
      if (upperA) {
        upperA.date = '2026-04-07';
        await smartPut('workouts', upperA);
        console.log('[Migration] Moved Upper A workout to 2026-04-07');
      }
    }
    done.data.push('fix-apr8-dup');
    await dbPut('settings', done);
  }

  // Migration (v11.44): reasignar los ejercicios del 2026-08-20.
  //
  // Julian entrenó siguiendo la rutina de un amigo. Como no existía forma de registrar una sesión
  // que no fuera una plantilla del plan, usó los huecos de Upper A y escribió el ejercicio real en
  // el campo de nota. Los pesos son reales; las ETIQUETAS no lo son.
  //
  // No es cosmético: toda la progresión se resuelve por `exerciseId` sin ningún fallback. Un face
  // pull de 60 kg hace que la doble progresión sugiera "bajar a 57,5 kg", que la rampa automática
  // genere calentamientos de face pull a 47,5 kg, y que el 1RM estimado quede en ~80 kg.
  if (!done.data.includes('fix-aug20-mislabeled')) {
    // Los ejercicios que esta corrección introduce se registran en el store en la migración
    // `rename-exercises-en` de abajo, que corre a continuación y es la única fuente de nombres.
    const w = await dbGet('workouts', AUG20_WORKOUT_ID);
    if (w && Array.isArray(w.exercises)) {
      const fixed = fixAug20Mislabeled(w);
      if (fixed !== w) {
        await smartPut('workouts', fixed);
        console.log('[Migration] 2026-08-20: ejercicios reasignados a lo que realmente se hizo');
      } else {
        console.log('[Migration] 2026-08-20: ya estaba corregido, no se toca');
      }
    }
    done.data.push('fix-aug20-mislabeled');
    await dbPut('settings', done);
  }

  // Migration (v11.45): los nombres de ejercicio, todos a inglés.
  //
  // El store gana sobre las sesiones en `getExerciseName`, así que si aquí queda un nombre en
  // castellano, seguirá saliendo en el historial aunque la constante ya esté corregida. Esta
  // migración es la que hace que el nombre canónico sea el del store.
  //
  // Escrita para dar el resultado correcto en los dos escenarios posibles: si el teléfono nunca
  // corrió `fix-aug20-mislabeled` (no hay filas), las crea bien; y si sí la corrió cuando escribía
  // los nombres en castellano, las corrige.
  if (!done.data.includes('rename-exercises-en')) {
    let changed = 0;
    for (const canon of EXERCISE_NAMES_EN) {
      const cur = await dbGet('exercises', canon.id);
      if (cur && cur.name === canon.name) continue;   // ya está bien
      await smartPut('exercises', {
        // Se preserva lo que ya hubiera (notas propias, `custom`) y sólo se imponen los campos
        // canónicos. Así un renombrado no borra nada de lo que el usuario haya tocado.
        ...(cur || { defaultNotes: '', custom: false }),
        id: canon.id, name: canon.name, muscle: canon.muscle,
        movementPattern: canon.movementPattern, bw: canon.bw,
      });
      changed++;
    }
    if (changed) {
      await loadExerciseLibrary();
      console.log(`[Migration] ${changed} nombres de ejercicio normalizados a inglés`);
    }
    done.data.push('rename-exercises-en');
    await dbPut('settings', done);
  }

  // Migración (v11.57, 2026-09-07): re-anclar el bloque al lunes 7-sep y registrar el hito de −5 kg.
  //
  // Decisión de Julian del 2026-09-07 ("sigo la recomendación del coach"). El ancla que la app fijó
  // sola el 16-ago (semana 19 de la app) ponía el deload en la semana del 7-sep: quinta semana de un
  // bloque en el que sólo hubo entrenamiento real desde el 17-ago (primera pierna completa el 3-sep,
  // primer peso muerto el 5-sep, readiness ~89, RHR en mínimo histórico). LOAD-004 pide deload tras
  // 4-6 semanas de carga acumulada, no de calendario; y el deload es también la pausa de dieta a
  // mantenimiento, que habría frenado el déficit en su primera semana medible. Semana 1 del bloque
  // B1 = 7-sep → primer deload la semana del 5-oct.
  //
  // Hito: "bajar 5 kg en el corto plazo" (Julian, 2026-09-07) → ~82 kg, antes de los 79-81 finales.
  // Es un dato del usuario, no una estimación: el coach mide el progreso contra él.
  if (!done.data.includes('coach-v2-reanchor-2026-09-07')) {
    const st = state.settings;
    st.deloadAnchorDate = '2026-09-07';
    if (st.goals && st.goals.primary) {
      st.goals.primary.milestoneKg = 82;
      st.goals.primary.milestoneLabel = '−5 kg a corto plazo (2026-09-07)';
      st.goals.updatedAt = new Date().toISOString();
    }
    await smartPut('settings', { key: 'userSettings', data: st });
    const prox = (typeof blockWeek === 'function' && blockWeek().deloadMonday) || '?';
    console.log(`[Migration] Bloque re-anclado al 2026-09-07 (próximo deload la semana del ${prox}); hito −5 kg → 82 kg`);
    done.data.push('coach-v2-reanchor-2026-09-07');
    await dbPut('settings', done);
  }
}

// v11.35: IndexedDB is the ONLY complete copy of the training log — the cloud is a
// mirror, and it was stale for seven weeks without anyone noticing. Ask the browser not
// to evict it under storage pressure. It's a request, not a guarantee (iOS grants it
// readily for home-screen PWAs), and it was never being asked for at all.
async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return;
    if (await navigator.storage.persisted()) return;
    const granted = await navigator.storage.persist();
    console.log(`[Storage] Persistent storage ${granted ? 'granted' : 'denied'}`);
  } catch (e) { /* not supported — nothing to do */ }
}

// Empuja a la nube lo que los seeds dejaron solo en local.
//
// EL FALLO QUE ARREGLA: `ensurePlanSeeded()` y `ensureExerciseLibrarySeeded()` tienen que
// correr ANTES de `loadActivePlan()`, que es el paso 8 de init(), mientras `initSupabase()`
// es el paso 20. Y `enqueueSync()` hace `if (!supabaseClient) return`, asi que sus filas
// nunca se encolaban. Por eso `public.exercises` esta en 0 filas: la biblioteca de
// ejercicios —el vocabulario que el cron semanal necesita para resolver patron de
// movimiento y grupo muscular— no existia en la nube.
//
// No se arregla adelantando initSupabase(): eso registra onAuthStateChange, que dispara
// syncAll(), y mover el arranque de la cola es justo lo que la congelo siete semanas en
// v11.28. Este backfill es aditivo y no toca el orden de la auth.
//
// El flag va con `dbPut` a proposito: si se sincronizara, otro dispositivo se saltaria su
// propio backfill al recibirlo. Misma razon que los flags de migracion.
async function backfillSeedStoresToCloud() {
  if (!window.syncedPut || !window.getSupaClient || !window.getSupaClient()) return;
  const user = window.getSupaUser ? await window.getSupaUser() : null;
  if (!user) return;

  const KEY = 'seed_cloud_backfill_v1';
  const flag = await dbGet('settings', KEY).catch(() => null);
  if (flag && flag.data && flag.data.done) return;

  let n = 0;
  for (const store of ['plans', 'exercises']) {
    const rows = (await dbGetAll(store).catch(() => [])) || [];
    for (const r of rows) {
      try { await window.syncedPut(store, r); n++; } catch (e) { console.warn('[Sync] backfill', store, e); }
    }
  }
  await dbPut('settings', { key: KEY, data: { done: true, rows: n, at: Date.now() } });
  if (n) console.log(`[Sync] Backfill de seeds: ${n} filas encoladas`);
}

async function init() {
  await openDB();
  await requestPersistentStorage();
  await loadSettings();
  loadTheme();

  // Seed and load dynamic plan + exercise library
  await ensurePlanSeeded();
  await ensureExerciseLibrarySeeded();
  await loadActivePlan();
  await ensureDeloadAnchor(); // v11.35: D1 — anchor the 5-week deload block (first one 4 wks out)
  await ensureGoals();        // v11.55: Coach v2 — settings.goals desde COACH_GOALS_DEFAULT
  await applyIdealPlan();     // T5: install the ideal plan as the live default (replaces re-entry ramp)
  await loadExerciseLibrary();
  await loadExerciseOverrides(); // T5.2: persistent exercise swaps

  bindEvents();

  // Run data migrations
  await runMigrations();
  await migrateWorkoutDatesToLocal();
  await oneShotCloudRecovery();
  await purgeExpiredTrash();

  // Service Worker
  registerServiceWorker();

  // Supabase auth
  if (window.initSupabase) {
    window.initSupabase();
    bindLoginEvents();
    await checkAuth();
  } else {
    hideLoginScreen();
    const authSection = document.getElementById('auth-section');
    if (authSection) {
      authSection.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Cloud sync not configured.</p>';
    }
  }

  // Nutricion v2: la biblioteca de alimentos. Idempotente por id, asi que no duplica al
  // reinstalar la PWA ni pisa lo que el usuario haya editado.
  //
  // VA DESPUES DE LA AUTH A PROPOSITO. Hasta v11.55 `enqueueSync()` hacia `if (!supabaseClient) return`,
  // asi que sembrar antes de initSupabase() dejaria los 55 alimentos SOLO en IndexedDB. Y la
  // edge function `parse-meal-photo` lee `foods` de Supabase: con la tabla vacia no podria
  // resolver ningun alimento contra la biblioteca y cada foto volveria a estimar macros desde
  // cero, que es exactamente la debilidad de Caltrack que este diseño existe para corregir.
  // v11.55 arreglo la causa raiz (el guard mira la configuracion, no el cliente: F-1), asi que
  // el orden ya no es critico. Se mantiene igual: no depender de un solo guard sale gratis.
  try { await safeCall('seedFoods'); } catch (e) { console.warn('[Nutricion] seed:', e); }

  // Y empujar lo que los seeds de plan/ejercicios dejaron solo en local (ver la funcion).
  try { await backfillSeedStoresToCloud(); } catch (e) { console.warn('[Sync] backfill:', e); }

  // COACH SEMANAL (v11.61). Va después de la auth y de un `syncAll()` ESPERADO a propósito: sin
  // el pull de `coach_reviews`, una revisión que ya se creó en otro dispositivo no se vería aquí
  // y la app pagaría una segunda ($0,50-0,70). Todo en segundo plano para no retrasar el primer
  // pintado — `maybeRunWeeklyCoach` repinta la tarjeta de Home cuando llega la propuesta.
  (async () => {
    try { if (window.syncAll) await window.syncAll(); } catch (e) { /* sin red, se decide con lo local */ }
    await safeCall('maybeRunWeeklyCoach');
  })().catch(e => console.warn('[Coach] semanal:', e));

  renderRecentWorkouts();
  // B-3: el banner de la semana lo pintaba la tira retirada; ahora se pide aquí (primer
  // pintado) y en `switchTab('gym')`.
  renderWeekBanner().catch(e => console.warn('[Gym] week banner:', e));

  // Pull steps from cloud in the background; doesn't block UI.
  syncStepsFromCloud().then(() => {
    // E-12 (v11.66): la tarjeta vive en Stats › Today, no en Home. El guard por pestaña la
    // habría dejado sin repintar justo cuando llega el dato. Repintar en oculto es gratis.
    renderStepsCard().catch(() => {});
  }).catch(() => {});

  // Resumen del coach en Stats, pintado desde IDB (v11.61: ya sin fetch a ningún manifiesto),
  // para que la pestaña esté lista cuando el usuario llegue — sin spinner ni parpadeo vacío.
  loadAndRenderWeeklyCoach().catch(() => {});

  // Populate the initial tab. HTML defaults to view-home being .active, so
  // without this the user sees an empty Home until they switch tabs.
  const startTab = state.currentTab || 'home';
  await switchTab(startTab);

  // Check for in-progress workout
  await showResumeBanner();

  // Unified Sync card (v10.28) — primary surface for intervals.icu connection
  renderSyncCard();

  // Integraciones de servidor (A-3): WHOOP y Withings. Los tokens viven en Supabase; esta
  // tarjeta sólo lee `integration_status` y dispara authorize / sync / disconnect.
  // `integrationsHandleReturn()` va DESPUÉS de switchTab(): parsea `#settings?connected=…` y
  // abre Ajustes, y hacerlo antes lo pisaría el tab inicial. Va también después de checkAuth():
  // sin sesión no hay estado que leer.
  Promise.resolve(safeCall('integrationsHandleReturn')).catch((e) => console.warn('[integraciones] vuelta:', e));
  Promise.resolve(safeCall('renderIntegrationsCard')).catch((e) => console.warn('[integraciones] tarjeta:', e));

  // Legacy connection cards inside collapsible "Legacy connections" section
  renderStravaUI();
  renderIntervalsIcuUI();
  // A-7: `stravaIsConnected()` es síncrona y lee la caché de `integration_status`, que la línea
  // de arriba está cebando en segundo plano. Sin este segundo pase la tarjeta legacy de Strava
  // pinta "Connect" en cada arranque sobre una integración que sí está conectada.
  Promise.resolve(safeCall('integrationsGetStatus')).then(() => renderStravaUI()).catch(() => {});

  // Background sync on app open: runs (so Recent Runs is fresh) + wellness
  // (so the recovery card is current). Both swallowed errors — never block UI.
  intervalsIcuSync().then(result => {
    if (result && ((result.pulled || 0) + (result.pulledSessions || 0)) > 0 && state.currentTab === 'home') {
      renderRecentWorkouts();
    }
    // v11.36: one-shot recovery of every non-run cardio session since April, which the
    // Run-only filter discarded. Runs after the normal sync so it never delays startup.
    return backfillCardioFromIntervals().then(t => {
      if (t && (t.runs + t.sessions) > 0) {
        try { renderRecentWorkouts(); } catch (_) {}
        try { renderSessionHistory(); } catch (_) {}
      }
    });
  }).catch(() => {});
  {
    Promise.resolve(safeCall('whoopSyncData')).then((d) => {
      if (state.currentTab !== 'home') return;
      safeCallVoid('renderRecoveryBlock');
      // v11.58: si esta sincronización trajo el dato de HOY (ruta directa de WHOOP, o intervals
      // que ya lo tiene), el Home se repinta solo. Sin esto, la tarjeta se quedaría con el "Sin
      // dato de hoy" del primer render aunque el dato hubiese llegado dos segundos después.
      // v11.59: el readiness cacheado se calculó SIN el dato de hoy; en cuanto llega hay que
      // recalcularlo, o la tarjeta se queda con el "sin dato de hoy" del primer render.
      invalidateReadiness();
      if (d && d.todaySource && d.todaySource !== 'missing') {
        safeCallVoid('renderRecoveryBlock');
        // v11.65: y el tile Readiness, que es donde se ve el número de hoy desde este incremento.
        renderHomeStatTrio().catch(() => {});
      }
    }).catch(() => {});
  }

  // V-5: el email de la sesión, para las iniciales del avatar cuando no hay `settings.name`.
  // En segundo plano: `getUser()` habla con Supabase y el topbar ya está pintado con 'JG'.
  primeAuthEmail().catch((e) => console.warn('[auth] email:', e));
  // V-8: y el punto de estado, que necesita contar la cola de sincronización.
  renderTopbarStatusDot().catch((e) => console.warn('[Sync] punto de estado:', e));

  // Notifications
  initNotifications();

  // Sticky compressed section headers
  document.querySelectorAll('.view-scroll').forEach(scroll => {
    const labels = scroll.querySelectorAll(':scope > .section-label');
    if (!labels.length) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('stuck', entry.intersectionRatio < 1);
      });
    }, { root: scroll, threshold: [1] });
    labels.forEach(l => {
      l.style.top = '-1px'; // needed so it triggers when fully stuck
      observer.observe(l);
    });
  });
}

// `coach.js` se carga como <script> aparte y necesita el helper de B-4.
window.enterSecondaryView = enterSecondaryView;

// B-5 (auditoría 2026-09-08): `init()` es async y no tenía `catch`. Cualquier throw (una
// migración, un seed, un `getElementById` nulo) dejaba la app a medio arrancar EN SILENCIO:
// ni error visible ni forma de saber que faltaba media pantalla.
document.addEventListener('DOMContentLoaded', () => init().catch(e => {
  console.warn('[init]', e);
  toast(`Startup failed: ${errText(e, 'pull down to retry')}`);
}));

// Save workout state when app goes to background (iOS kills PWAs aggressively)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.activeSession) {
    saveActiveWorkout();
  }
  // v11.65: al volver a primer plano el dato de hoy puede haber llegado (WHOOP publica la
  // recuperación por la mañana, casi siempre con la app en segundo plano). integrations.js ya
  // resincroniza y repinta la línea de Stats; el tile Readiness de Home se repinta aquí, sin
  // tocar ese fichero. `whoopSyncData` tiene caché de 10 min: llamarlo dos veces no cuesta.
  if (document.visibilityState === 'visible' && state.currentTab === 'home') {
    (async () => {
      try { await safeCall('whoopSyncData'); } catch (e) { console.warn('[WHOOP] vuelta a primer plano:', e); }
      invalidateReadiness();
      try { await renderHomeStatTrio(); } catch (e) { console.warn('[Home] trío tras volver:', e); }
      // V-8: y el punto de estado, porque la red pudo cambiar con la app en segundo plano.
      renderTopbarStatusDot();
    })();
  }
});
window.addEventListener('pagehide', () => {
  if (state.activeSession) saveActiveWorkout();
});
