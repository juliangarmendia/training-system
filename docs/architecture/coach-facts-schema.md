# Facts pack del coach — esquema y contrato (`app/coach-facts.js`)

Incremento 7 de [`coach-v2-implementation-plan.md`](coach-v2-implementation-plan.md) (§A.4, §A.6,
§C.3, §C.4). Este documento es lo que necesita quien escriba **el wrapper de la app** (`app/coach.js`,
incremento 9) y quien escriba **la edge function** (`supabase/functions/coach-weekly-review`,
incremento 8). Las reglas citadas (`STR-*`, `END-*`…) viven en
[`../../research/evidence-to-rules.md`](../../research/evidence-to-rules.md), única fuente de verdad.

> **`FACTS_SCHEMA = 2`** (incremento B-2 de
> [`coach-v2.1-implementation-plan.md`](coach-v2.1-implementation-plan.md) §B.2). Respecto al
> esquema 1: sección **[`trajectory`](#trajectory--todo-el-recorrido-esquema-2)** con todo el
> recorrido (bloques, peso desde el inicio, anclas de siempre, 12 semanas de carrera y
> adherencia, patrones de salto y decisiones a revisar), `readiness.deloadHint` /
> `firedSignals`, **`priorReviews` de 3 → 6** (3 completas + 3 compactas) y el techo del test
> de 40 → **50 KB**. Todo lo del esquema 1 sigue igual: es aditivo.

## Qué es y por qué

`buildCoachFacts()` convierte los stores de IndexedDB en un documento de **hechos ya calculados**.
El LLM no hace aritmética: lee números y decide. Es la corrección directa de los cuatro fallos que
midió el audit del 2026-09-05:

| Audit | Qué hacía el cron | Qué hace el pack |
|---|---|---|
| **F-2** | aplicaba umbrales de TSB a `rampRate` (rango real ±2 → nunca disparaban) | `readiness.aerobicLoad.form = ctl − atl`, y `rampRate` viaja aparte etiquetado como ΔCTL/semana |
| **F-3** | trataba CTL/ATL como carga total en un programa de 4 días de fuerza | `aerobicLoad.note` dice "sólo cardio"; al lado va `internalLoad` (Σ budgetWeight + Σ duración×RPE), que sí ve la fuerza |
| **F-10** | leía `runs` sin dedupear en 23 sitios | las carreras entran por `deps.dedupeRuns`, siempre |
| **F-12** | juzgaba la EA intradía (a las 9:00 siempre "crítica") | `nutrition.ea` sólo usa días **cerrados** (`date < todayStr`) |

Y la regla que gobierna todo: **no se inventa un número**. Falta el dato → el campo va a `null` y el
hueco se declara en `dataGaps` con una frase que el prompt obliga al modelo a repetir.

**Puro**: sin DOM, sin IndexedDB, sin `fetch`, sin `localStorage`, sin `Date.now()` en la salida
(`meta.generatedAt` lo pone el llamador). Se prueba entero en `vm`
(`tests/verify-coach-facts.mjs`, `tests/verify-plan-validator.mjs`).

**Se carga después de `app/coach-engine.js`** (index.html y `APP_SHELL` del service worker): usa
`isoWeekKey`, `mondayOf` y `blockWeekFromDates` como globales del motor. Dos aritméticas de semana
ISO en el mismo repo es cómo la frontera domingo/lunes acaba contradiciéndose.

## API

```js
buildCoachFacts(input, deps)      → facts (objeto plano, JSON-limpio)
validatePlanVersion(plan, ctx)    → [{ id, level: 'hard'|'warn', text, ruleIds }]
diffPlanVersions(a, b)            → { weekTemplate, sessions, running, structural }
mergeProposal(activePlan, proposal) → { label, phase, sessions, weekTemplate, running, touched, strippedWarmup, cardioDays }
stableStringify(obj)              → string (claves ordenadas → `factsHash` estable)
```

## `input` — lo que el wrapper de la app tiene que pasar

```js
{
  todayStr: '2026-09-07',        // OBLIGATORIO en la práctica: el "hoy" lo pone el llamador
  weekKey: '2026-W37',           // opcional; si falta se deriva de todayStr con isoWeekKey()
  generatedAt: '2026-09-07T08:00:00.000Z',  // opcional, sólo para `meta`
  appVersion: 'v11.61',
  seedRev: 8,                    // PLAN_REV
  weekNumber: 37,                // opcional (etiqueta de app), sólo informativo
  block: {                       // salida de blockWeekFromDates()
    index: 1, weeksTotal: 5, isDeload: false, weeksIntoBlock: 0,
    label: 'build', blockStartMonday: '2026-09-07', deloadMonday: '2026-10-05',
  },
  legacyLatest: {…} | null,      // tracking/weekly-reviews/latest.json (W36), sólo la 1ª vez
  stores: {
    workouts:   [],  // dbGetAll('workouts')          — crudo, el pack no los dedupea (no hace falta)
    runs:       [],  // dbGetAll('runs')              — CRUDO: los dedupea el pack con deps.dedupeRuns
    sessions:   [],  // dbGetAll('sessions')          — idem con deps.dedupeSessions
    mobility:   [],  // dbGetAll('mobility_sessions')
    wellness:   [],  // dbGetAll('wellness')          — NUNCA salen filas crudas en el pack
    steps:      [],  // dbGetAll('steps')
    bodyweight: [],  // dbGetAll('bodyweight')
    nutrition:  [],  // dbGetAll('nutrition')
    decisions:  [],  // dbGetAll('decisions')
    coachReviews: [],// dbGetAll('coach_reviews')
    settings: {
      userSettings:      state.settings,                       // goals, idealVariant, deloadAnchorDate, icuZones…
      exerciseOverrides: (await dbGet('settings','exerciseOverrides'))?.data || {},
      weekSchedule:      (await dbGet('settings','weekSchedule'))?.data   || {},
    },
    activePlan: activePlan,      // el plan v1/v2 activo tal cual
    exercisesLibrary: exerciseLibrary,   // mapa {id: {…}} o array; se usa `movementPattern` y `muscle`
  },
}
```

Claves de `settings.userSettings` que el pack lee: `goals`, `idealVariant`, `deloadAnchorDate`,
`deloadBlockWeeks`, `icuZones`, `kcalFirstAdjustDate`, `kcalLastAdjustDate`. Las dos últimas **no
existen todavía**: mientras no existan, `progress.weight.validWindow` lo dice en `reasons` en vez de
suponer una fecha (ver *Lo que no se puede calcular hoy*).

## `deps` — helpers de `app.js`, inyectados

| dep | Firma | Si falta |
|---|---|---|
| `convertWeight` | `(v, from, to) => number` | identidad + `dataGap` ("un registro en lb NO está convertido") |
| `estimate1RM` | `(kg, reps) => number` | `e1rm: null` en todas las sesiones |
| `measureUnitFor` | `(exId) => 'cm'\|null` | ningún ejercicio se trata como medida (el box jump entraría como kg) |
| `dedupeRuns` | `(runs) => runs` | copia sin dedupear (riesgo F-10) |
| `dedupeSessions` | `(sessions) => sessions` | idem |
| `toSession` | `(record, store) => session` · **opcional** | `budgetWeight` cae a un espejo local de `SESSION_TYPES` |
| `nutRollingWeight` | `(rows, date, win)` · **opcional** | no se usa hoy (el pack calcula su media sobre filas medidas) |
| `weeklyDeficits` | `(days) => rows` · **opcional** | `nutrition.weeklyDeficits: null` |
| `z2Ceiling` | `number` (143 por defecto) | 143, y `cardio.z2Ceiling.source = 'declared'` |
| `computeReadinessFrom` | `(inputs) => {color, signals, deloadHint…}` · **opcional** | el global del motor; si tampoco está, `readiness.deloadHint: null` |
| `blockWeekFromDates` | `(date, anchor, weeks)` · **opcional** | el global del motor (mismo patrón que `isoWeekKey`/`mondayOf`) |

Los dos últimos son helpers **puros de `coach-engine.js`**, no de `app.js`: se aceptan por
`deps` para que un test pueda inyectarlos, y si no vienen se cogen del global del motor. Nunca
se llama a `computeReadiness()` de `app.js` (toca `state` e IndexedDB); `computeReadinessFrom`
sí es pura.

Llamada tipo desde la app:

```js
const facts = buildCoachFacts(input, {
  convertWeight, estimate1RM, measureUnitFor, dedupeRuns, dedupeSessions, toSession,
  nutRollingWeight, weeklyDeficits,
  z2Ceiling: (state.settings.icuZones?.z?.zone2?.[1]) || 143,
});
const factsHash = await sha256(stableStringify(facts));
```

## Redondeos y topes

| Magnitud | Paso | Por qué |
|---|---|---|
| cargas, e1RM | **0,5 kg** | el gimnasio va de 1,25 en 1,25; media placa es la resolución de una decisión |
| peso corporal, FFM, cintura | **0,1 kg / cm** | a 0,5 kg la pendiente de un cut (~0,45 kg/sem) desaparece dentro del redondeo |
| pendientes | **0,01 kg/semana** | es la magnitud con la que se pilota el déficit (−0,30…−0,70) |
| km | 0,1 · min 1 · % 1 · ms 1 | §A.4 |

Topes: **≤4** sesiones por ejercicio · **≤10** carreras · **≤6** revisiones previas (las 3 más
recientes completas, las 4-6 compactas) · **≤30** decisiones · **≤6** decisiones en el
seguimiento de `trajectory` · **≤5** anomalías de recuperación · **12** semanas de trayectoria
(8 de cumplimiento Z2) · extractos ≤1200 chars · notas ≤240 chars · el `what` del seguimiento
≤120 chars.

Tamaño real con datos de 4 semanas: **~28-43 KB** (~8-12k tokens), de los cuales `trajectory`
son 5-12 KB. `tests/verify-coach-facts.mjs` falla por encima de **50 KB** (era 40 en el
esquema 1) y por encima de **12.000 chars** de `stableStringify(facts.trajectory)`. El tope
del servidor (200 KB) no se toca.

## Secciones del pack

### `meta`
```js
{ factsSchema: 2, weekKey: '2026-W37', todayStr: '2026-09-07', generatedAt: '…',
  window: { from: '2026-08-17', to: '2026-09-07', weeks: ['2026-W34','2026-W35','2026-W36','2026-W37'] },
  window28: { from: '2026-08-11', to: '2026-09-07' },
  appVersion: 'v11.61', seedRev: 8, unit: 'kg',
  rounding: {…}, caps: { liftSessions: 4, runs: 10, priorReviews: 6, priorReviewsFull: 3,
                         decisions: 30, trajectoryWeeks: 12 } }
```

### `goals`
`settings.goals` compacto (`primary`, `preserve`, `secondary`, `constraints`). `null` + `dataGap` si
no están sembrados.

### `progress`
```js
{ weight: {
    mean7: 85.9, mean7Prev: 86.7, mean7Delta: -0.78,
    slope14KgPerWeek: -0.7, slope28KgPerWeek: -0.7,
    nMeasured7: 6, nMeasured14: 8, nMeasured28: 8, nForwardFilled28: 2,
    last: { date: '2026-09-07', kg: 85.6, measured: true },
    lastMeasured: { date: '2026-09-07', kg: 85.6 }, daysSinceMeasured: 0,
    validWindow: { ok: false, from, to, excluded: [{from,to,reason}], reasons: [...],
                   firstAdjustDate, lastAdjustDate, daysSinceLastAdjust, nextEligibleAdjustDate },
    note: 'La media y las pendientes usan SÓLO pesadas medidas…' },
  waist: { last3: [{date,cm}], delta2w: null, delta2wFrom: null, daysSinceLast: 0, n: 2 },
  running: { longRun4wKm: 6, longRun4wDate, kmPerWeek: [4.5,5,11,0], kmPerWeekMean: 5.1,
             paceAtZ2: '7:00', nRuns4w: 4, nZ2Compliant4w: 3,
             tenKReadiness: { verdict: 'far off', longestKm, longestZ2Compliant, driftBpm: null,
                              criteria: {…}, basis: 'Only distance and mean HR can be measured…' } } }
```

**La pendiente sólo mira pesadas MEDIDAS** (`bodyweight.measured === true` o
`wellness.weightMeasured`). El valor suavizado de intervals.icu es un forward-fill: una línea recta
que aplana la regresión los días sin báscula y hace que el piloto del déficit recorte calorías por un
artefacto. La **ventana válida** excluye la semana de descarga y los 5 días siguientes (C.1: el agua
del refeed no es grasa) y exige ≥10 pesadas en 14 días, ≥14 días desde el último ajuste y no estar
antes de la primera fecha elegible.

### `block`
`{ index, weeksTotal, phase, isDeload, weeksIntoBlock, blockStartMonday, deloadMonday, deloadAnchorDate, weekNumber }`

### `trajectory` — todo el recorrido (esquema 2)

Añadida en `FACTS_SCHEMA = 2` (incremento B-2 de
[`coach-v2.1-implementation-plan.md`](coach-v2.1-implementation-plan.md) §B.2). **El fallo que
corrige:** con una ventana de 4 semanas el coach empieza de cero cada domingo. No puede
contestar "cómo viene entrenando", "cuánto ha avanzado hacia el objetivo" ni "qué hizo y qué
no": un ancla que lleva dos meses sin tocarse parece mantenida, un ejercicio que se salta
desde julio parece nuevo, y el progreso desde 87,1 kg no existe. Julian lo dijo con esas
palabras el 2026-09-07.

Es **memoria larga y compacta**: agregados por bloque, por semana y por ancla, nunca filas
crudas. Y usa la MISMA aritmética que el resto del pack — pesadas MEDIDAS (nunca el
forward-fill), carreras DEDUPEADAS, kg convertidos con `deps.convertWeight`. Un número que
aquí saliera distinto del de `progress` sería una segunda contabilidad y el modelo citaría la
que le conviniera.

```js
trajectory: {
  program: { firstWorkoutDate: '2026-06-29', weeksSince: 11, totalStrengthSessions: 8,
             sessionsPerWeekAvg: 0.7, anchorDate: '2026-09-07', blockWeeks: 5,
             blocks: [{ index: 0, label: 'pre-bloque', from, to, weeks, strengthSessions, runs, km },
                      { index: 1, label: 'B1', from: '2026-09-07', to, weeks,
                        strengthSessions, runs, km, isCurrent: true }] },
  weight: { startKg: 87.1, startDate: '2026-08-19', firstMeasured: { kg: 86.8, date: '2026-08-26' },
            nMeasuredSinceStart: 8, latest7dMean: 85.9, deltaKg: -1.2,
            slopeSinceStartKgPerWeek: -0.7, slopeUsedForEta: '28d'|'sinceStart'|null,
            weeksToMilestoneAtCurrentSlope: 5.6, weeksToTargetAtCurrentSlope: 7,
            scale: { date, daysAgo, fatPct, ffmKg, muscleKg, visceralFat, bmrKcal, metabolicAge,
                     heartRateBpm, readings28d, fatPctDelta28d, ffmKgDelta28d, fatMassKgDelta28d, fatPct7dAvg, readings7d, deltaFrom, weightKg, fatMassKg, waterKg, boneKg } | null,
            note },
  anchors: [{ id, name, kind: 'load'|'bw', first: {date,kg,reps,e1rm}, best: {…},
              latest: {…, outcome}, exposures, exposures12w, daysSinceLast,
              trendSinceStartPct, trendBasis? }],
  running: { weekKeys: [12], weeklyKm: [12], longestRunEver: { km, date, avgHR },
             z2ComplianceByWeek: [8], z2WeekKeys: [8],
             phaseHistory: [{ weekKey, phase }], note },
  adherenceByWeek: [{ weekKey, planned, done, kmDone, runs }],   // 12
  plannedIsApprox: true,
  skippedPatterns: [{ id, name, skips, exposures, lastSkipped }],
  decisionsFollowUp: [{ id, weekKey, type, what, reviewOn, dueForReview, outcome, source }],
}
```

#### `program`

| campo | qué es |
|---|---|
| `firstWorkoutDate` | la sesión de fuerza más antigua del store, sin ventana |
| `weeksSince` | semanas ISO desde esa fecha hasta hoy, ambas incluidas |
| `totalStrengthSessions` · `sessionsPerWeekAvg` | total y media (0,1) sobre `weeksSince` |
| `anchorDate` | `settings.deloadAnchorDate` — el lunes que ancla los bloques |
| `blockWeeks` | `settings.deloadBlockWeeks` → `block.weeksTotal` → 5 |
| `blocks[]` | un tramo por bloque, con `strengthSessions`, `runs` y `km` dentro de `[from, to]` |

El **índice 0 (`pre-bloque`)** es todo lo anterior al ancla, y no se numera a propósito:
`blockWeekFromDates` devuelve `index: null` antes del ancla (no se extrapola hacia atrás),
pero el coach sí necesita saber que ahí hubo entrenamiento y cuánto. Desde el ancla van `B1`,
`B2`… de `blockWeeks` semanas cada uno; el último se **corta en hoy** (`to = todayStr`, no el
final teórico) y lleva `isCurrent: true`. Sin `deloadAnchorDate` sale un único tramo
`pre-bloque` con todo el recorrido: no se inventa una numeración que no existe.

#### `weight`

`startKg`/`startDate` salen de `goals.primary`; `firstMeasured` es la primera pesada MEDIDA
en o después de `startDate`. `deltaKg` = `latest7dMean − startKg` (si no hay `startKg`,
`− firstMeasured.kg`), y `latest7dMean` es **el mismo número** que `progress.weight.mean7`.

`slopeSinceStartKgPerWeek` son mínimos cuadrados sobre las pesadas medidas desde el inicio, y
va a **`null` con menos de 6 puntos**: con 3, la recta la decide la primera pesada.

`slopeUsedForEta` dice de dónde sale el ETA: **`'28d'` cuando existe** (es la que describe el
déficit de AHORA), `'sinceStart'` como respaldo — con la advertencia en `note` de que incluye
descargas y diet breaks —, `null` si no hay ninguna. Los dos ETA (hito `goals.primary.milestoneKg`
= 82 kg y objetivo = el extremo alto de `targetWeightKg`) sólo se publican si la pendiente
**baja**: con pendiente ≥0 la división daría "faltan −12 semanas". `note` (≤240 chars,
castellano) recoge los motivos por los que la pendiente no es fiable; `null` si no hay ninguno.

`scale` (v11.65) es la **última lectura de la báscula Withings** (`bodyweight.source === 'withings'`):
% grasa, FFM, músculo, grasa visceral (índice), metabolismo basal (kcal/día), edad metabólica y
pulso en pie, más `readings28d` y — sólo si la primera y la última lectura de los 28 días están a
≥21 días — `fatPctDelta28d` y `ffmKgDelta28d`, que es donde se lee la recomposición (el % grasa de
impedancia oscila a diario; a 5 días no significa nada). `null` si nunca se ha conectado la
báscula, para que el modelo no invente composición. Las claves que la fila no trae van a `null`.

#### `anchors[]`

Una fila por id de `goals.preserve.anchorLifts`, sobre **todo el historial**. Cuatro semanas no
distinguen una meseta de una caída, y el objetivo declarado (preservar magra) se mide en meses.

* `first`/`best`/`latest`: `{date, kg, reps, e1rm}` del top set de esa sesión, siempre en kg
  vía `deps.convertWeight(w, workout.unit, 'kg')` — los registros anteriores a la mudanza van
  en lb y un 185 lb al lado de un 95 kg parece una caída del 49 %.
* `best` es el mejor **e1RM** (en `kind: 'bw'`, las mejores reps), que no tiene por qué ser el
  último: en el fixture el mejor es 92,5×8 (e1RM 117) y el último 95×6 (114).
* `latest.outcome` sale del `readout` de esa sesión (`progressed`/`held`/…) si lo hubo.
* `kind: 'bw'` (dominadas, ab wheel): `kg` es el **lastre** y `e1rm` va a `null` — la Epley
  sobre el lastre describe una fuerza que no es la del atleta. En ese caso
  `trendSinceStartPct` se calcula sobre **reps** y lo declara en `trendBasis`.
* `exposures` (todo el historial) vs `exposures12w`; `trendSinceStartPct` es `null` con una
  sola exposición.
* **Un ancla con 0 exposiciones no se calla**: sale con `exposures: 0`, `first/best/latest`
  a `null` y su línea en `dataGaps`. "No ha bajado" y "no lo has hecho" no son lo mismo.

#### `running`

`weekKeys` y `weeklyKm` son 12 semanas ISO **de la más antigua a la actual**, con `0` en las
semanas sin carreras (omitirlas convertiría un parón en un hueco invisible). `longestRunEver`
es el largo de todo el historial con su FC media — sin ella no se sabe si fue en Z2.

`z2ComplianceByWeek` son las **8** últimas semanas (`z2WeekKeys` las nombra) y es una
**fracción** 0-1, no un porcentaje: la de carreras con `avgHR ≤ cardio.z2Ceiling.bpm + 2`
(misma tolerancia que `cardio`). `null` = esa semana no hubo carreras con FC, que no es un 0.

`phaseHistory` (≤8) sale de las decisiones `type: 'running-week'` (`evidence.phase`), una por
semana, de la más reciente hacia atrás.

#### `adherenceByWeek` + `plannedIsApprox`

12 filas. `planned` son las sesiones de **fuerza** de la plantilla activa proyectadas hacia
atrás (con los overrides de `weekSchedule` de esa semana). Es una aproximación declarada una
sola vez para toda la sección con **`plannedIsApprox: true`**: el plan de hace dos meses no se
guarda por semana, y un porcentaje de adherencia contra un plan que no era el de esa semana es
un número que parece medido y no lo es.

#### `skippedPatterns[]`

Ejercicios saltados **≥3 veces en sus últimas ≤6 exposiciones** de las 12 semanas. Distinto de
`skipped` (4 semanas, ≥2 saltos y ≥50 %): aquí manda la **recencia**. Un ejercicio saltado tres
veces en junio y hecho desde entonces no es un patrón; uno que se salta las tres últimas veces
que aparece, sí. La regla del prompt es "lo que no se hizo tres veces no se recuerda: se
reordena o se quita". Con el umbral en 2 el coach reescribiría la sesión por ruido.

"Exposición" y "salto" son los mismos de `skipped`: el ejercicio estaba en la sesión
registrada (o en la plantilla de esa sesión) y no tiene ni una serie con `done: true`.

#### `decisionsFollowUp[]`

Las ≤6 decisiones más recientes con `source: 'coach'` **o** `type` que empiece por `plan-`.
Las de `source: 'rule'` (readouts automáticos, `running-week`) se quedan fuera: nadie tiene que
rendir cuentas de ellas y llenarían los seis huecos con la misma frase. `what` va recortado a
**120 chars** y `dueForReview` marca las que ya vencieron (`reviewOn <= todayStr`) — es el
"te dije X el {fecha}, los datos dicen Y" que el briefing tiene obligación de cerrar.


### `plan`
Plan activo compacto: identidad (`id`, `version`, `schema`, `status`, `author`, `weekKey`,
`reviewId`, `basedOn`, `seedRev`), `block`, `running`, `idealVariant`, `weekTemplate[0..6]`
(`{type, session, label, subtype, durationMin, z2FinisherMin, cardio}`), `sessions[id]`
(`{name, subtitle, focus, exercises:[{id, name, muscle, sets, reps, rpe, order, optional, superset, db, bw, compound, measure, measureUnit, target}]}`)
y `overrides` (`exercises` = `settings.exerciseOverrides`, `futureSchedule` = overrides de
`weekSchedule` con fecha ≥ hoy).

**Esta sección es el vocabulario de la edge function**: `deriveAllowedFromFacts()`
(`supabase/functions/coach-weekly-review/index.ts`) construye `allowed.sessionIds` y
`allowed.exerciseIds` desde `plan.sessions`, y lee `db` / `bw` / `measure` para forzar `kg: null`
donde no hay carga. `measure` sale de `deps.measureUnitFor(id)`, no del plan — el store `exercises`
no persiste campos arbitrarios. Sin ese flag el modelo podría prescribir "box jump 52,5 kg".

### `adherence` — 4 filas, una por semana ISO
```js
{ weekKey: '2026-W37', monday: '2026-09-07', daysElapsed: 1,
  gym:      { planned: 4, plannedToDate: 1, done: 1, ids: ['lowerA'], quick: 0, pctToDate: 100 },
  cardio:   { planned: 2, plannedToDate: 0, done: 1, km: 0, min: 20, hard: 0 },
  recovery: { planned: 1, done: 0 },
  durationsMin: [64], avgDurationMin: 64,
  plannedSource: 'plan-activo' | 'plantilla-actual (aproximado)' }
```
`plannedSource` es honesto a propósito: lo planificado de una semana pasada sólo se conoce si los
registros de esa semana llevan el `planVersion` del plan activo. Si no, se proyecta la plantilla
actual hacia atrás y se declara — en la fila **y** en `dataGaps`.

### `lifts` — mapa por `exerciseId`
```js
'bench-press': {
  id, name, muscle: 'Chest', pattern: 'horizontal-press', kind: 'load'|'bw'|'measure',
  measureUnit: null, daysSinceLast: 6, nSessions: 3, trend: 'up'|'flat'|'down'|'insufficient',
  skipRate4w: 0, exposures4w: 3, pausedOver21d: false,
  sessions: [ { date, session, setsDone, setsPlanned, topKg: 95, topReps: 6, topRpe: 8,
                avgRpe: 8, repsPerSet: [6,6,6], e1rm: 114, loggedUnit: 'kg',
                targetShown: { kg, reps, rpe, source }, outcome: 'progressed' } ] }
```
* **Todo en kg**, vía `deps.convertWeight(w, workout.unit || 'kg', 'kg')`. Un 205 lb al lado de un
  95 kg parece una caída del 54 %.
* `kind: 'measure'` (box jump): `topMeasure` en cm, `topKg: null`, `e1rm: null`. "50 cm + 2,5" no
  significa nada.
* `kind: 'bw'` (dominadas, ab wheel): `addedKg` es el **lastre**; `e1rm: null`, porque la Epley sobre
  el lastre describe una fuerza que no es la del atleta.
* `trend`: newest vs oldest e1RM de las ≤4 sesiones, umbral **±2 %**. Con <2 e1RM → `'insufficient'`.

### `skipped`
`[{ id, name, skips, exposures, rate, action: 'reordenar antes o quitar (no recordar)' }]` — sólo con
≥2 saltos y ≥50 % de las exposiciones (§C.2 paso 3).

### `cardio`
```js
{ z2Ceiling: { bpm: 143, source: 'icuZones'|'declared', lthr, maxHr }, z2Tolerance: 2,
  weeks: [{ weekKey, km, min, sessions, hard, finishers }],
  runs: [{ date, km, min, avgHR, maxHR, pace, gapPace, subtype, z2Compliant: true|false|null,
           pctZ2, pctAboveZ2, decoupling, hrDrift: null, source, sport, trainingLoad }],
  daysSinceLastRun, daysSinceLastCardio, z2CompliancePct4w, maxWeekKm4w, note: 'Carreras … DEDUPEADAS…' }
```
* Z2 cumplida ⇔ `avgHR ≤ z2Ceiling + 2`. La tolerancia existe porque 144 bpm en una carrera de 45'
  no es "haber fallado la Z2": sin ella, cualquier carrera incumple y la señal se vuelve inútil.
* `pctZ2` = tiempo en Z1+Z2 desde `hrZoneTimes`; `pctAboveZ2` es el complementario, que es el que
  mira la regla ("≤10 % del tiempo sobre Z2"). Sin `hrZoneTimes` → `null`, no se estima.
* `hrDrift` es **siempre `null` hoy**: hace falta el stream de FC y los registros no lo traen. Va
  declarado en `dataGaps`. `decoupling` viaja si intervals.icu lo precalculó.
* La carrera del **domingo** cuenta en SU semana ISO, no en la siguiente.

### `readiness`
```js
{ hrv: { mean7, mean28, n7, n28, deltaPct, deltaAbs },
  restingHR: {…}, sleep: { mean7Hrs, mean28Hrs, nightsUnder6h5_7, nightsUnder6h_7, n7, n28 },
  score: { mean7, mean28, deltaPts, green7, yellow7, red7, n7, n28, cutoffs: { green: 67, yellow: 34 } },
  today: { date, readiness, color, hrv, restingHR, sleepHrs, source } | { …, readiness: null, color: 'unknown', note },
  lastDataDate: '2026-09-07',
  aerobicLoad: { ctl: 3.2, atl: 5.1, form: -1.9, rampRate: -0.21, date,
                 note: 'sólo cardio: … `form = ctl − atl` (F-2); `rampRate` es ΔCTL/semana…' },
  internalLoad: [{ weekKey, budgetWeight, strengthRpeLoad, strengthSessions }],
  pressExposuresPerWeek: [{ weekKey, exposures, exerciseIds }],
  setsPerMuscle: [{ weekKey, done: { Chest: 3, Back: 6, … } }],
  anomalies: [{ date, readiness, deltaVsMean28, sleepHrs, alcoholG,
                prevDay: { date, strengthSessions, cardioSessions, budgetWeight, atl } }],
  deloadHint: false, firedSignals: ['rpe2'], readinessColor: 'green' }
```
* Baselines **propias**: 7d vs 28d de los datos del usuario (READ-004), nunca umbrales de literatura.
* `pressExposuresPerWeek` es el hecho que explica W35 (5 exposiciones de press en 10 días y la banca
  cayó): sin él, un modelo que sólo mira la carga concluye "baja el peso" cuando el problema era la
  frecuencia.
* `anomalies` lleva el contexto de C.4 (sueño de esa noche, alcohol del día, carga del día anterior)
  para poder distinguir un **evento puntual** (READ-007, cambia el día) de una **semana mala**
  (READ-002, cambia la semana).
* **Nunca** viajan filas crudas de `wellness`.
* `deloadHint`, `firedSignals` y `readinessColor` (esquema 2) son el veredicto de
  **`computeReadinessFrom`** (`coach-engine.js`, puro), el mismo que pinta Stats — no una
  segunda lectura del pack: si el pack recalculase el declive por su cuenta, la app y el coach
  podrían decir cosas distintas del mismo día. `deloadHint` es un declive **sostenido**
  (READ-008 + LOAD-004: ≥3 señales, o RPE ≥9 en las dos últimas sesiones, o HRV+RHR+calidad),
  no un mal día. Sigue siendo **información**: la recuperación no dosifica (decisión del
  usuario, 2026-09-07). Sin el motor disponible → `deloadHint: null`, `firedSignals: []`.

### `nutrition`
```js
{ daysLogged7, daysLogged14, daysLogged28, pilot: 'tracker'|'peso',
  protein: { mean7, mean28, floorG: 185, daysUnderFloor28 },
  kcal: { mean7, mean28, targetMean7, trainingDayMean, restDayMean },
  ea: { closedDays: 11, mean7, mean28, daysUnder30, daysUnder27, lowestClosed,
        note: 'Sólo días CERRADOS (fecha < hoy)…' },
  maintenance: { modelMean7, modelMean28, source: 'modelo (…), no medido', ffmKg },
  weeklyDeficits: [{ weekStart, days, avgKcal, avgTarget, avgDeficit }] | null,
  alcoholG7 }
```

### `steps` · `mobility`
`steps`: `{ mean7, mean28, floor, daysAtFloor28, n7, n28, note: 'Pasos sin convertir a kcal…' }`.
`mobility`: `{ weeks: [{weekKey, sessions, minutes}], recent: [{date, routine, durationMin, painBefore, painAfter}], total4w, daysSinceLast, floorPerWeek: 2, note }`.

### `decisions` — ledger, ≤30
```js
{ id, date, weekKey, type, source, claim, why, test, reviewOn, ruleIds, outcome,
  ref: { sessionId, exId }, numbers: {…}, dueForReview: true }
```
`claim` es el `what` del store: es lo que permite el *"te dije X el {fecha}, los datos dicen Y"*.
`dueForReview` marca las decisiones cuyo `reviewOn` ya venció — el briefing tiene que revisarlas.

### `priorReviews` — ≤6, en **3 + 3**
```js
// las 3 MÁS RECIENTES, completas:
{ kind: 'review', id, weekKey, attempt, status, applied, appliedPlanId,
  priorities: [≤3], decisions: [{id, type, what, ruleIds}], excerpt: '≤1200 chars' }
// las 4-6, COMPACTAS (sin `excerpt`, sin `decisions`, sin `appliedPlanId`):
{ kind: 'review', id, weekKey, attempt, status, applied, priorities: [≤3], compact: true }
{ kind: 'legacy', id: 'legacy:2026-W36', weekKey, status: 'legacy', excerpt, planSummary, note }
```
El tope pasó de 3 a **6** en el esquema 2, pero sólo las **3 más recientes** van completas
(`FACTS_FULL_REVIEWS`). El coach necesita saber que en W22 ya se probó bajar la frecuencia de
empuje; no necesita releer los 1.200 caracteres con los que se dijo. Tres extractos más serían
~3,6 KB de prosa vieja compitiendo con los hechos de esta semana.

La entrada `legacy` sale de `input.legacyLatest` (el `latest.json` de W36) y sólo entra si hay menos
de **3** revisiones reales — el gate NO subió a 6: es prosa sin Rule IDs y sólo tiene sentido
mientras el coach in-app apenas tenga historial propio. Su `note` lo dice.

### `staleness`
`{ [store]: { lastDate, daysAgo, n, stale } }` para los 9 stores. `stale` = `daysAgo > 2` (o sin
datos). Cada fuente vieja añade su línea a `dataGaps`.

### `dataGaps` — strings, deduplicados
Lo que el prompt obliga al modelo a repetir. Los que se generan hoy:

- `<8` sesiones de fuerza en 4 semanas → "la señal de progresión es débil y el volumen no se sube"
- 0 carreras → "no hay cómo evaluar la Z2 ni justificar una rampa de km — sin rampa (END-003)"
- nutrición `<14/28` días → **"NO inferir ingesta"** + gate corto (10/14)
- sin `icuZones` → "el techo de Z2 usado es 143 bpm DECLARADO, no medido"
- `<5/7` días de wellness → "no se juzga la recuperación (READ-004)"
- `<7` pesadas medidas en 28 días → "la pendiente no es señal"
- ventana de peso no válida → con la lista de razones
- `adherence.planned` aproximado → "los registros llevan otra versión del plan"
- deriva de FC no disponible → "`hrDrift` va a null — no la infieras"
- cualquier fuente con `>2` días de retraso, o un store vacío
- sin `settings.goals`, sin plan activo, sin revisiones previas, sin `deps.convertWeight`
- **(esquema 2)** programa de `<8` semanas → "trayectoria corta: pendientes orientativas, no señal"
- **(esquema 2)** un solo bloque desde el ancla → "no hay bloque anterior con el que comparar"
- **(esquema 2)** una línea por cada ancla con `exposures: 0` → "no se puede decir si se mantiene"

### `confidence`
`{ overall: 'none'|'low'|'medium'|'high', bySection: { strength, cardio, weight, nutrition, readiness, mobility }, gapCount }`

## `validatePlanVersion(plan, ctx)`

**Dos niveles y una regla de producto que no se negocia: nada bloquea al usuario.** Los `hard`
restringen al **coach** — la edge function le pide UNA regeneración con el aviso; si insiste, la app
lo pinta en rojo y Julian puede aplicarlo igual. Los `warn` son chips ámbar. Puro y defensivo: un
chequeo sin su trozo de `ctx` se **salta**; nunca lanza (si algo falla, emite `VALIDATOR-ERROR` como
aviso `warn` y devuelve lo que pudo comprobar).

**Y desde el 2026-09-08 (fn v4) esto corre en el SERVIDOR, no sólo en el teléfono.** Hasta ese día
el "UNA regeneración" del párrafo de arriba era una promesa del diseño que nadie ejecutaba: los
avisos se calculaban en `applyCoachProposal`, con la propuesta ya escrita y la llamada ya pagada.
`scripts/build-fn-assets.mjs` copia este fichero a `coach-weekly-review/coach-facts.generated.js`
(con su sha, como `rules-compact`) y la función lo llama con el **mismo `ctx`** — mismo rojo en el
servidor que en la pantalla. Ver [`plan-v2-schema.md`](plan-v2-schema.md#el-bucle-de-guardarra%C3%ADles).

```js
ctx = {
  basedOn,           // plan anterior (diff de volumen y de anclas)
  facts,             // el pack (km previos, exposiciones, EA, readiness, historial de kg)
  variant,           // settings.idealVariant — el calendario que eligió el usuario
  libraryIds,        // Set | array | objeto-mapa de ids válidos
  lowerSessionIds,   // Set | array de ids de sesión de pierna
  exerciseLibrary,   // mapa {id: {movementPattern}} — mejora la detección de core/press
  block,             // { index, weeksTotal, isDeload }
  isDeload,          // opcional; si no, se deduce de block/plan.phase
  bodyweightKg, goals, zones, decisions, briefing, todayStr,
  // fn v4 (2026-09-08): opcionales, para KCAL-STEP. Si no llegan se leen de
  // `facts.progress.weight.validWindow` (`lastAdjustDate`, `daysSinceLastAdjust`) y de
  // `facts.nutrition.kcal.targetMean7`; si tampoco están, el chequeo se salta.
  kcalTarget, kcalLastAdjustDate, daysSinceKcalAdjust,
}
```

En el servidor el `ctx` se construye del pack: `variant` ← `facts.plan.idealVariant`, `libraryIds`
← el vocabulario `allowed` + los ids del plan activo, `lowerSessionIds` ← `body.lowerSessionIds` o
deducido del plan por músculo/patrón, y `exerciseLibrary` **no viaja** (el pack no lleva
`movementPattern`), así que el validador cae a sus tablas por id (`VP_PATTERN_IDS`,
`FACTS_PRESS_IDS`), que cubren la librería real.

### Tabla de ids

| id | Nivel | Chequeo | Rule IDs | §C.3 |
|---|---|---|---|---|
| `LOAD-JUMP` | **hard** | `target.kg` > +10 % sobre el último top set, o kg **sin histórico** | STR-001, LOAD-001 | G-H1 |
| `LOAD-JUMP` | warn | caída > −15 % fuera de deload | STR-001, LOAD-001 | — |
| `NO-SOURCE-KG` | **hard** | kg sin `evidence`/`source`/`decisionId` ni marca "ajustar por RPE" | GEN-002 | G-H2 |
| `DELOAD-VOLUME` | **hard** | descarga con series > 0,6× la semana de carga · con plyo · con dura · o `phase ≠ 'deload'` | LOAD-004, ATH-001, END-004 | G-H3 |
| `HARD-CARDIO` | **hard** | > 1 sesión dura de cardio/híbrido. **Dura** = subtipo `threshold`/`intervals`, etiqueta de híbrido/trineo/benchmark, **distancia ≥10 km** (aunque el subtipo diga `long_easy`) o un día de `running.hardSessions[]` | END-004, BUD-001 | G-H4 |
| `RUN-BEFORE-LEGS` | **hard** | dura/híbrido en `d` y pierna en `d+1` (**domingo → lunes** incluido), con la misma definición ampliada de "dura" | INT-001, HYB-002 | G-H5 |
| `ANCHOR-SWAP` | **hard** | ancla sustituida fuera de {trap bar ↔ sumo/conv, barbell row ↔ chest-supported} | STR-010, LOAD-003 | G-H6 |
| `VOL-CAP` | **hard** | > 14 series/músculo en déficit; o total > +10 % sin [adh ≥75 %, verde, nutr ≥10/14] | STR-003, STR-001 | G-H7 |
| `KM-JUMP` | **hard** | km/sem > máx 4 sem × 1,2; o > 8 km tras ≥14 días sin correr ("reentrada") | END-003, LOAD-001 | G-H8 |
| `KM-JUMP` | warn | km/sem > `max(prev × 1,10, prev + 1)` — el 10 % es heurística no validada (Buist 2008) | END-003, LOAD-001 | G-S1 |
| `PROTEIN-FLOOR` | **hard** | proteína < 185 g (o `goals.constraints.proteinG`), en cabecera **o** en una decisión | REC-001, REC-008 | G-H9 |
| `PROTEIN-FLOOR` | warn | semana de déficit que toca la ingesta y **no menciona** la proteína (v11.67 · E-14f) | REC-001, REC-008 | G-H9 |
| `KCAL-FLOOR` | **hard** | día de entreno < **2.700** kcal · descanso < **2.400** (subidos de 2.500/2.300 el 2026-09-08: con 2.500 la EA cae a ~27 kcal/kg FFM y REC-008 marca 30) | REC-001, REC-008 | G-H9 |
| `KCAL-STEP` | **hard** | `nutrition.kcalTarget` cambia > **150 kcal**, o llega antes de **14 días** desde `validWindow.lastAdjustDate` (fn v4 · E-18) | REC-002, REC-008 | G-H14 |
| `PLYO-PLACEMENT` | **hard** | plyo fuera de `lowerA` · no primero · el día después de una dura. **Sólo la colocación**: INT-004 es `strong` | ATH-001, INT-004 | G-H10 |
| `PLYO-CONTACTS` | warn | > 80 contactos de plyo. **Blando desde el 2026-09-08** (R-7): el caveat de ATH-001 dice que "la dosis baja es óptima" NO está soportado — el número es prudencia lumbar, no evidencia | ATH-001, ATH-004 | G-S16 |
| `DELOAD-DIETBREAK` | warn | descarga sin diet break, o diet break en semana de carga. **Blando desde el 2026-09-08** (R-7): descansaba entero sobre REC-005 `weak_extrapolated`, cuyo texto dice que el diet break **no** preserva más masa magra | REC-005, LOAD-004 | G-S15 |
| `CORE-PATTERNS` | **hard** | semana sin anti-rotación **o** sin anti-extensión | ATH-003 | G-H11 |
| `MIN-STRENGTH` | **hard** | < 2 sesiones de fuerza | LONG-002, STR-001 | G-H12 |
| `DECISION-EVIDENCE` | **hard** | decisión con `ruleIds` vacío o sin `evidence.numbers` | GEN-002 | G-H15 |
| `EX-UNKNOWN` | **hard** | id de ejercicio ∉ `libraryIds` | SEL-001, SEL-003 | — (A.6) |
| `SESSION-COUNT` | **hard** | días de fuerza > `variant + 1`, o > **5** en cualquier caso. Sin `ctx.variant` se usa 5 — antes el chequeo se SALTABA sin variante y un sexto día de gym no lo paraba nadie (fn v4 · E-14a) | BUD-001, LONG-002 | G-H13 |
| `SESSION-COUNT` | warn | por debajo del techo duro: días de gimnasio > los de fuerza de la variante elegida | BUD-001 | — (A.6) |
| `FREQ-FLOOR` | warn | una familia de patrón mayor (rodilla, bisagra, empuje, tirón) con < 2 exposiciones/semana, sólo en variantes ≥ 4. Cuenta por **familia**: la extensión de cuádriceps del jueves es la segunda exposición de rodilla de la sentadilla del lunes (fn v4 · E-14d) | STR-002, STR-001 | G-S18 |
| `ORDER-SAME-DAY` | warn | día con fuerza y cardio en el que el cardio va **antes** de levantar, y sólo con señal positiva de orden (`cardio.order: 'before'`, `cardioFirst`, o la nota diciéndolo): un finisher de Z2 va después por definición (fn v4 · E-14c) | INT-003, INT-001 | G-S17 |
| `RECOVERY-ONLY` | warn | decisión que baja series/kg/km citando **sólo** reglas `READ-*` y sin un dato de rendimiento al lado (top set, RPE, `readout`, cumplimiento de Z2) (fn v4 · E-17) | READ-005, READ-002 | G-S19 |
| `MVPA-FLOOR` | warn | la semana suma < **150 min** de cardio (END-009, consenso ACSM 2024: 150 el suelo, 200-300 la banda de pérdida de grasa). Cuenta minutos de cardio solamente: la fuerza también es MVPA, así que el chequeo se queda corto a propósito | END-009, LONG-001, REC-009 | G-S20 |
| `EA-GATE` | warn | ≥4 días con EA < 30 y el plan sube series o km | REC-008, REC-001 | — (A.6) |
| `MOBILITY-FLOOR` | warn | < 2 slots de movilidad (días `recovery` + sesiones con `mobilityMin`) | ATH-006 | G-S2 |
| `PRESS-EXPOSURES` | warn | > 2 exposiciones de empuje/semana ("en W35 fueron 5 en 10 días y la banca cayó") | STR-002, INT-001 | G-S3 |
| `SESSION-LENGTH` | warn | sesión estimada > 75 min (o `goals.constraints.sessionMaxMin`) | STR-003, BUD-001 | G-S4 |
| `HYBRID-PLUS-LONG` | warn | híbrido en la semana **y** el largo subiendo | HYB-002, END-003, BUD-001 | G-S5 |
| `TARGET-N1` | warn | objetivo con n=1, o con el último dato de hace > 21 días (reentrada) | STR-001, GEN-002, LOAD-004 | G-S6 |
| `READINESS-N` | warn | lectura de recuperación con < 5 días de wellness | READ-004, READ-001 | G-S7 |
| `WEIGHT-WINDOW` | warn | se toca la ingesta con `validWindow.ok === false` | REC-002, REC-008 | G-S8 |
| `HARD-BUDGET` | warn | Σ budgetWeight de la semana > 6 (informativo) | BUD-001, BUD-002 | G-S9 |
| `SUMMER-PACE` | warn | se lee progreso aeróbico por **ritmo** entre junio y septiembre | ENV-001, END-002 | G-S10 |
| `Z2-CEILING` | warn | el techo de Z2 del plan ≠ el de `icuZones` | END-001, END-002 | G-S11 |
| `CHURN` | warn | > 3 prioridades, o > 3 cambios estructurales en una semana. Los cambios salen del **diff real** (`diffPlanVersions(ctx.basedOn, plan)`), no del `changes[]` autodeclarado — sin `basedOn`, `changes[]` es el respaldo y el texto lo dice (fn v4 · E-14e) | GEN-001, STR-010 | G-S12 |
| `ROTATION` | warn | swap de ejercicio fuera de la semana 1 del bloque, contado sobre el mismo diff | STR-010, SEL-002 | G-S12 |
| `CTL-FOR-STRENGTH` | warn | decisión de fuerza/descarga apoyada en ctl/atl/rampRate (F-3 / F-2) | GEN-002, READ-003 | G-S13 |
| `WEEK-SUMMARY` | warn | sesión del plan sin fila en `coachBrief.weekSummary` — sólo cuando hay `coachBrief` (v11.65, contrato v2: también lo que se mantiene lleva su motivo) | GEN-001 | G-S14 |
| `VALIDATOR-ERROR` | warn | el propio validador falló: los avisos pueden estar incompletos | — | — |

**39 ids** (33 hasta v11.65; los 6 de fn v4 son `SESSION-COUNT` duro —el id existía, el nivel no—,
`ORDER-SAME-DAY`, `FREQ-FLOOR`, `RECOVERY-ONLY`, `KCAL-STEP`, `MVPA-FLOOR` y `PLYO-CONTACTS`). Todos
con etiqueta en `COACH_GUARD_LABEL` (`app/coach.js`) y todos con Rule IDs del corpus:
`tests/verify-plan-validator.mjs` cuenta los ids leyendo el fuente y comprueba que ninguno cita una
regla que no existe.

**Nota sobre el plan ideal real**: la semana completa (4 fuerza + 2 cardio + recuperación) suma un
presupuesto de **7,5 sobre un tope de 6**, así que `HARD-BUDGET` dispara sobre el plan vivo. Es
correcto y es informativo — la propia app retiró el flag de presupuesto en v11.41 por decisión del
usuario. `tests/verify-plan-validator.mjs` usa ese hecho como línea base.

Umbrales de fn v4, también exportados: `VP_MAX_STRENGTH_DAYS` (5), `VP_VARIANT_SLACK` (1),
`VP_LONG_RUN_HARD_KM` (10), `VP_MIN_MVPA_MIN` (150), `VP_MVPA_FAT_LOSS_MIN` (200),
`VP_KCAL_STEP_MAX` (150), `VP_KCAL_ADJUST_DAYS` (14), `VP_MIN_PATTERN_EXPOSURES` (2),
`VP_FREQ_FLOOR_MIN_VARIANT` (4), `VP_PATTERN_FAMILIES`, `VP_PATTERN_IDS`.

Umbrales exportados para los tests (no reescribirlos en el llamador): `VP_FLOORS`,
`VP_MAX_SETS_PER_MUSCLE`, `VP_MAX_HARD_CARDIO`, `VP_MAX_BUDGET`, `VP_MAX_PRESS_EXPOSURES`,
`VP_MAX_SESSION_MIN`, `VP_MAX_PLYO_CONTACTS`, `VP_MAX_STRUCTURAL_CHANGES`,
`VP_MIN_STRENGTH_SESSIONS`, `VP_MIN_MOBILITY_SLOTS`, `VP_DELOAD_VOLUME_FACTOR`,
`VP_KM_HARD_FACTOR`, `VP_KM_SOFT_FACTOR`, `VP_REENTRY_KM_CAP`, `VP_REENTRY_DAYS`,
`VP_LOAD_JUMP_PCT`, `VP_LOAD_DROP_PCT`, `VP_TARGET_STALE_DAYS`, `VP_ANCHOR_SWAPS`, `VP_ANCHORS`.

## `diffPlanVersions(a, b)`

```js
{ weekTemplate: [{ dow, from, to }],
  sessions: { [id]: { added: [], removed: [], reordered: bool,
                      setsChanged: [{exId, from, to}],
                      targets: [{exId, fromKg, toKg, fromReps, toReps, fromRpe, toRpe}],
                      focusChanged, sessionAdded, sessionRemoved } },
  running: { from, to } | null,
  structural: 4 }
```
`structural` cuenta template + añadidos + quitados + reordenados + series + running. **Los kg y las
reps del objetivo NO son estructurales**: cambian cada semana por diseño, y contarlos convertiría
cualquier progresión normal en "churn". Dos planes idénticos → `structural: 0`.

## `mergeProposal(activePlan, proposal)`

```js
proposal = {
  label, phase,
  sessions: [{ id, focus, exercises: [...], changes: [...] }],   // sólo las TOCADAS
  cardio: [{ dow, subtype, durationMin, distanceKm, hrZone, note }],
  running: { weeklyKmTarget, longRunKm, hardSessions },
  weekTemplateChanges: [{ dow, slot }],
}
→ { label, phase, sessions, weekTemplate, running, touched: [ids], strippedWarmup: [ids], cardioDays: [dows] }
```

Dos invariantes, y los dos han costado un bug antes:

1. **Las sesiones no tocadas se copian tal cual.** Si el coach sólo habla de Upper B, la Lower A que
   sale es `JSON.stringify`-idéntica a la que entró. Una propuesta parcial no puede convertirse en
   una reescritura silenciosa del resto de la semana. `mergeProposal` **no muta** `activePlan`.
2. **`warmup` se quita de las sesiones que el coach toca.** `startWorkout` cae a
   `PLAN.sessions[id].warmup`, así que los arreglos de calentamiento que viajan con `PLAN_REV`
   siguen llegando al teléfono. Un warm-up congelado dentro de un plan del coach sería la única
   parte de la app que deja de recibir actualizaciones.

`cardio[]` aterriza en `weekTemplate[dow].cardio` con `source: 'coach'` y **no pisa** el
`durationMin` base del slot: la progresión de cardio es una función sobre el dato base
(`progressCardioMin`, coach > regla > base).

El resultado va a `createNewPlanVersion({ label, sessions, weekTemplate, meta: { schema: 2,
status: 'active', author: 'coach-llm', basedOn, weekKey, reviewId, block, running, seedRev } })`
(§A.7). Las propuestas **nunca** entran en `plans`.

## Corpus de reglas — `rules-compact.json`

`scripts/build-rules-compact.mjs` extrae el único bloque ```json de
`research/evidence-to-rules.md` y escribe
`supabase/functions/coach-weekly-review/rules-compact.json`:

```js
{ generatedAt, source: 'research/evidence-to-rules.md', sourceSha256, count: 70,
  fields: ['id','rule','evidenceLevel','confidence','energyState','programmingAction'],
  note: '…', rules: [ {…}, … ] }         // 23,7 KB · ~5k tokens
```
Los campos de auditoría (`sources`, `caveats`, `domain`, `population`, `applicabilityToUser`,
`goal`) **no** viajan al prompt. `sourceSha256` (también en `rules-compact.sha`) es lo que hace
fallar a `tests/verify-rules-compact.mjs` cuando el .md cambia y nadie regeneró el JSON — el fallo
que el script existe para hacer visible es "el corpus del prompt desincronizado de la fuente de
verdad".

```
node scripts/build-rules-compact.mjs            # regenerar
node scripts/build-rules-compact.mjs --check    # exit 1 si está desincronizado
```

## Lo que NO se puede calcular hoy (y cómo lo declara el pack)

| Hecho pedido en §C.4 | Estado | Cómo se declara |
|---|---|---|
| **Deriva de FC** 2ª mitad vs 1ª desde streams | no hay streams de FC en `runs` | `cardio.runs[].hrDrift: null` + `dataGap` explícito. `decoupling` viaja si intervals.icu lo precalculó |
| **Fecha del próximo ajuste** de kcal | `settings.kcalFirstAdjustDate` / `kcalLastAdjustDate` no existen aún | `progress.weight.validWindow.reasons` incluye "no hay fecha de primer ajuste ni de último ajuste en `settings`"; `nextEligibleAdjustDate: null`. **No se inventa el 24-sep de C.1** |
| **Pendiente sólo en días de déficit** | no hay marca de "día en déficit" por fila | se usa la exclusión por descarga/diet break, que es la que sí se puede derivar del ancla |
| **`series/músculo` prescritas vs hechas** | las hechas sí (`readiness.setsPerMuscle`); las prescritas viven en `plan.sessions[].exercises[].sets` y el validador las cruza en `VOL-CAP` | — |
| **RPE / dolor / RHR del día siguiente** para "10k cómodo" | no se registran por carrera | `tenKReadiness.criteria` con `null` + `basis` que lo dice |
| `wellness` sin ancla de bloque | sin `settings.deloadAnchorDate` no se sabe qué semana fue descarga | `validWindow.reasons` lo dice y la ventana queda entera |

## Tests

| Test | El fallo que existe para impedir |
|---|---|
| `tests/verify-coach-facts.mjs` | aritmética del LLM sobre filas crudas · lb/kg mezclados · carreras duplicadas COROS/Strava · peso forward-filled en la pendiente · `form ≠ ctl − atl` · EA de días abiertos · `dataGaps` ausente con <14 días de nutrición · frontera domingo/lunes · `stableStringify` inestable · `undefined`/`NaN` en el JSON · topes · **(esquema 2)** un coach que empieza de cero cada domingo: `trajectory` con `firstWorkoutDate`/`weeksSince`, bloques `pre-bloque`/`B1`, `deltaKg` sólo de pesadas medidas, anclas `first/best/latest` con lb→kg y un ancla a 0 exposiciones + su `dataGap`, `weeklyKm[12]`, umbral de `skippedPatterns` (2 no, 3 sí), `dueForReview`, `priorReviews` 3+3, `deloadHint`, pack <50 KB y `trajectory` <12.000 chars |
| `tests/verify-plan-validator.mjs` | un guardarraíl que nunca dispara o que bloquea (positivo y negativo por id, `hard` vs `warn`, números en el texto, `RUN-BEFORE-LEGS` domingo→lunes, suelo de +1 km y tope de reentrada, `diffPlanVersions` idéntico → `structural: 0`, `mergeProposal` byte a byte + warmup, `ctx` vacío sin lanzar) |
| `tests/verify-rules-compact.mjs` | corpus del prompt desincronizado de `evidence-to-rules.md`; y desde fn v4, un compacto **sin `caveats`** (el grado dice cómo de firme es una regla, el caveat dice EN QUÉ SE EQUIVOCA) o por encima de 38 KB |
| `tests/verify-fn-assets.mjs` | **dos validadores que divergen** (el del teléfono y la copia del servidor) · un módulo generado que no arranca en Deno y tumba la función entera en el primer request · el bucle de regeneración sin tope, que convertiría un `hard` imposible en 3 × $0,60 por semana |
| `tests/verify-rule-coverage.mjs` | **evidencia decorativa**: una regla del corpus que nadie aplica, y una regla `strong` sin consumidor y sin explicación. Contrasta cada `consumer` declarado contra el sitio que dice consumirla |

Los tres cargan `app/coach-engine.js` y luego `app/coach-facts.js` **en el mismo contexto `vm`**,
que es el mismo orden que `index.html`.

## Compatibilidad con la edge function (incremento 8, ya desplegada)

Campos del pack que `supabase/functions/coach-weekly-review` consume hoy: `facts.plan.sessions`
(→ `allowed`), `facts.plan.weekTemplate` (días de pierna, colocación), `facts.block` /
`facts.block.isDeload`, `facts.cardio.z2Ceiling`, `facts.lifts[id].sessions[0].topKg`,
`facts.priorReviews`, `facts.dataGaps`. Todos existen.

Dos detalles a mano del autor del prompt:

- **`facts.cardio.z2Ceiling` es un OBJETO** (`{bpm, source, lthr, maxHr}`), no un número.
  `prompt.ts` lo cita como si fuera el bpm ("FC media ≤ `facts.cardio.z2Ceiling`"); conviene
  escribirlo como `facts.cardio.z2Ceiling.bpm` para que el modelo no compare una FC con un objeto.
  El campo lleva además `source: 'icuZones'|'declared'`, que es lo que hace honesta la cifra.
- El `factsHash` lo calcula la función en el servidor con su propio `stableStringify` sobre el pack
  ya pasado por JSON. Coincide con `stableStringify` de este módulo porque `buildCoachFacts`
  sanea `undefined`/`NaN` a `null` antes de devolver: sin ese saneado, las dos implementaciones
  divergirían (la del servidor escribe `"k":null` para una clave `undefined`; esta la omite).

## Pendiente para el coordinador (incremento 7 → 9)

1. `<script src="coach-facts.js">` en `index.html` **después** de `coach-engine.js` y antes de
   `app.js`; añadirlo al `APP_SHELL` de `sw.js`; bump de `CACHE_NAME` y de la versión.
2. Wrapper en `app.js`/`app/coach.js` que lea los stores y llame a `buildCoachFacts` con el `input`
   y los `deps` de arriba.
3. Botón **"Exportar facts JSON"** en Ajustes (copiar al portapapeles) para inspeccionar el pack en
   el iPhone antes de gastar un céntimo.
4. `verify-coach-wiring.mjs`: comprobar el orden de scripts y el `APP_SHELL`.
