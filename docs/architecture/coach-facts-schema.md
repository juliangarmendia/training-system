# Facts pack del coach — esquema y contrato (`app/coach-facts.js`)

Incremento 7 de [`coach-v2-implementation-plan.md`](coach-v2-implementation-plan.md) (§A.4, §A.6,
§C.3, §C.4). Este documento es lo que necesita quien escriba **el wrapper de la app** (`app/coach.js`,
incremento 9) y quien escriba **la edge function** (`supabase/functions/coach-weekly-review`,
incremento 8). Las reglas citadas (`STR-*`, `END-*`…) viven en
[`../../research/evidence-to-rules.md`](../../research/evidence-to-rules.md), única fuente de verdad.

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
| `z2Ceiling` | `number` (143 por defecto) | 143, y `cardio.z2Ceiling.source = 'declarado'` |

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

Topes: **≤4** sesiones por ejercicio · **≤10** carreras · **≤3** revisiones previas · **≤30**
decisiones · **≤5** anomalías de recuperación · extractos ≤1200 chars · notas ≤240 chars.
Tamaño real con datos de 4 semanas: **~22-30 KB** (~6-8k tokens). `tests/verify-coach-facts.mjs`
falla por encima de 40 KB.

## Secciones del pack

### `meta`
```js
{ factsSchema: 1, weekKey: '2026-W37', todayStr: '2026-09-07', generatedAt: '…',
  window: { from: '2026-08-17', to: '2026-09-07', weeks: ['2026-W34','2026-W35','2026-W36','2026-W37'] },
  window28: { from: '2026-08-11', to: '2026-09-07' },
  appVersion: 'v11.61', seedRev: 8, unit: 'kg',
  rounding: {…}, caps: { liftSessions: 4, runs: 10, priorReviews: 3, decisions: 30 } }
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
             tenKReadiness: { verdict: 'lejos', longestKm, longestZ2Compliant, driftBpm: null,
                              criteria: {…}, basis: 'Sólo se pueden medir distancia y FC media…' } } }
```

**La pendiente sólo mira pesadas MEDIDAS** (`bodyweight.measured === true` o
`wellness.weightMeasured`). El valor suavizado de intervals.icu es un forward-fill: una línea recta
que aplana la regresión los días sin báscula y hace que el piloto del déficit recorte calorías por un
artefacto. La **ventana válida** excluye la semana de descarga y los 5 días siguientes (C.1: el agua
del refeed no es grasa) y exige ≥10 pesadas en 14 días, ≥14 días desde el último ajuste y no estar
antes de la primera fecha elegible.

### `block`
`{ index, weeksTotal, phase, isDeload, weeksIntoBlock, blockStartMonday, deloadMonday, deloadAnchorDate, weekNumber }`

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
{ z2Ceiling: { bpm: 143, source: 'icuZones'|'declarado', lthr, maxHr }, z2Tolerance: 2,
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
                prevDay: { date, strengthSessions, cardioSessions, budgetWeight, atl } }] }
```
* Baselines **propias**: 7d vs 28d de los datos del usuario (READ-004), nunca umbrales de literatura.
* `pressExposuresPerWeek` es el hecho que explica W35 (5 exposiciones de press en 10 días y la banca
  cayó): sin él, un modelo que sólo mira la carga concluye "baja el peso" cuando el problema era la
  frecuencia.
* `anomalies` lleva el contexto de C.4 (sueño de esa noche, alcohol del día, carga del día anterior)
  para poder distinguir un **evento puntual** (READ-007, cambia el día) de una **semana mala**
  (READ-002, cambia la semana).
* **Nunca** viajan filas crudas de `wellness`.

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

### `priorReviews` — ≤3
```js
{ kind: 'review', id, weekKey, attempt, status, applied, appliedPlanId,
  priorities: [≤3], decisions: [{id, type, what, ruleIds}], excerpt: '≤1200 chars' }
{ kind: 'legacy', id: 'legacy:2026-W36', weekKey, status: 'legacy', excerpt, planSummary, note }
```
La entrada `legacy` sale de `input.legacyLatest` (el `latest.json` de W36) y sólo entra si hay menos
de 3 revisiones reales. No lleva decisiones estructuradas ni Rule IDs: es prosa, y su `note` lo dice.

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

### `confidence`
`{ overall: 'none'|'low'|'medium'|'high', bySection: { strength, cardio, weight, nutrition, readiness, mobility }, gapCount }`

## `validatePlanVersion(plan, ctx)`

**Dos niveles y una regla de producto que no se negocia: nada bloquea al usuario.** Los `hard`
restringen al **coach** — la edge function le pide UNA regeneración con el aviso; si insiste, la app
lo pinta en rojo y Julian puede aplicarlo igual. Los `warn` son chips ámbar. Puro y defensivo: un
chequeo sin su trozo de `ctx` se **salta**; nunca lanza (si algo falla, emite `VALIDATOR-ERROR` como
aviso `warn` y devuelve lo que pudo comprobar).

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
}
```

### Tabla de ids

| id | Nivel | Chequeo | Rule IDs | §C.3 |
|---|---|---|---|---|
| `LOAD-JUMP` | **hard** | `target.kg` > +10 % sobre el último top set, o kg **sin histórico** | STR-001, LOAD-001 | G-H1 |
| `LOAD-JUMP` | warn | caída > −15 % fuera de deload | STR-001, LOAD-001 | — |
| `NO-SOURCE-KG` | **hard** | kg sin `evidence`/`source`/`decisionId` ni marca "ajustar por RPE" | GEN-002 | G-H2 |
| `DELOAD-VOLUME` | **hard** | descarga con series > 0,6× la semana de carga · con plyo · con dura · o `phase ≠ 'deload'` | LOAD-004, ATH-001, END-004 | G-H3 |
| `HARD-CARDIO` | **hard** | > 1 sesión dura de cardio/híbrido | END-004, BUD-001 | G-H4 |
| `RUN-BEFORE-LEGS` | **hard** | dura/híbrido en `d` y pierna en `d+1` (**domingo → lunes** incluido) | INT-001, HYB-002 | G-H5 |
| `ANCHOR-SWAP` | **hard** | ancla sustituida fuera de {trap bar ↔ sumo/conv, barbell row ↔ chest-supported} | STR-010, LOAD-003 | G-H6 |
| `VOL-CAP` | **hard** | > 14 series/músculo en déficit; o total > +10 % sin [adh ≥75 %, verde, nutr ≥10/14] | STR-003, STR-001 | G-H7 |
| `KM-JUMP` | **hard** | km/sem > máx 4 sem × 1,2; o > 8 km tras ≥14 días sin correr ("reentrada") | END-003, LOAD-001 | G-H8 |
| `KM-JUMP` | warn | km/sem > `max(prev × 1,10, prev + 1)` — el 10 % es heurística no validada (Buist 2008) | END-003, LOAD-001 | G-S1 |
| `PROTEIN-FLOOR` | **hard** | proteína < 185 g (o `goals.constraints.proteinG`), en cabecera **o** en una decisión | REC-001, REC-008 | G-H9 |
| `KCAL-FLOOR` | **hard** | día de entreno < 2.500 kcal · descanso < 2.300 | REC-001, REC-008 | G-H9 |
| `DELOAD-DIETBREAK` | **hard** | descarga sin diet break, o diet break en semana de carga | REC-005, LOAD-004 | G-H10 |
| `PLYO-PLACEMENT` | **hard** | plyo fuera de `lowerA` · no primero · > 80 contactos · el día después de una dura | ATH-001, INT-004, ATH-004 | G-H11 |
| `CORE-PATTERNS` | **hard** | semana sin anti-rotación **o** sin anti-extensión | ATH-003 | G-H12 |
| `MIN-STRENGTH` | **hard** | < 2 sesiones de fuerza | LONG-002, STR-001 | G-H13 |
| `DECISION-EVIDENCE` | **hard** | decisión con `ruleIds` vacío o sin `evidence.numbers` | GEN-002 | G-H14 |
| `EX-UNKNOWN` | **hard** | id de ejercicio ∉ `libraryIds` | SEL-001, SEL-003 | — (A.6) |
| `SESSION-COUNT` | warn | días de gimnasio > los de fuerza de la variante elegida | BUD-001 | — (A.6) |
| `EA-GATE` | warn | ≥4 días con EA < 30 y el plan sube series o km | REC-008, REC-001 | — (A.6) |
| `MOBILITY-FLOOR` | warn | < 2 slots de movilidad (días `recovery` + sesiones con `mobilityMin`) | ATH-006 | G-S2 |
| `PRESS-EXPOSURES` | warn | > 2 exposiciones de empuje/semana ("en W35 fueron 5 en 10 días y la banca cayó") | STR-002, INT-001 | G-S3 |
| `SESSION-LENGTH` | warn | sesión estimada > 75 min (o `goals.constraints.sessionMaxMin`) | STR-003, BUD-001 | G-S4 |
| `HYBRID-PLUS-LONG` | warn | híbrido en la semana **y** el largo subiendo | HYB-002, END-003, BUD-001 | G-S5 |
| `TARGET-N1` | warn | objetivo con n=1, o con el último dato de hace > 21 días (reentrada) | STR-001, GEN-002, LOAD-004 | G-S6 |
| `READINESS-N` | warn | lectura de recuperación con < 5 días de wellness | READ-004, READ-001 | G-S7 |
| `WEIGHT-WINDOW` | warn | se toca la ingesta con `validWindow.ok === false` | REC-002, REC-008 | G-S8 |
| `HARD-BUDGET` | warn | Σ budgetWeight de la semana > 6 (informativo) | BUD-001 | G-S9 |
| `SUMMER-PACE` | warn | se lee progreso aeróbico por **ritmo** entre junio y septiembre | ENV-001, END-002 | G-S10 |
| `Z2-CEILING` | warn | el techo de Z2 del plan ≠ el de `icuZones` | END-001, END-002 | G-S11 |
| `CHURN` | warn | > 3 prioridades, o > 3 cambios estructurales en una semana | GEN-001, STR-010 | G-S12 |
| `ROTATION` | warn | swap de ejercicio fuera de la semana 1 del bloque | STR-010, SEL-002 | G-S12 |
| `CTL-FOR-STRENGTH` | warn | decisión de fuerza/descarga apoyada en ctl/atl/rampRate (F-3 / F-2) | GEN-002, READ-003 | G-S13 |
| `VALIDATOR-ERROR` | warn | el propio validador falló: los avisos pueden estar incompletos | — | — |

**Nota sobre el plan ideal real**: la semana completa (4 fuerza + 2 cardio + recuperación) suma un
presupuesto de **7,5 sobre un tope de 6**, así que `HARD-BUDGET` dispara sobre el plan vivo. Es
correcto y es informativo — la propia app retiró el flag de presupuesto en v11.41 por decisión del
usuario. `tests/verify-plan-validator.mjs` usa ese hecho como línea base.

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
| `tests/verify-coach-facts.mjs` | aritmética del LLM sobre filas crudas · lb/kg mezclados · carreras duplicadas COROS/Strava · peso forward-filled en la pendiente · `form ≠ ctl − atl` · EA de días abiertos · `dataGaps` ausente con <14 días de nutrición · frontera domingo/lunes · `stableStringify` inestable · `undefined`/`NaN` en el JSON · topes |
| `tests/verify-plan-validator.mjs` | un guardarraíl que nunca dispara o que bloquea (positivo y negativo por id, `hard` vs `warn`, números en el texto, `RUN-BEFORE-LEGS` domingo→lunes, suelo de +1 km y tope de reentrada, `diffPlanVersions` idéntico → `structural: 0`, `mergeProposal` byte a byte + warmup, `ctx` vacío sin lanzar) |
| `tests/verify-rules-compact.mjs` | corpus del prompt desincronizado de `evidence-to-rules.md` |

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
  El campo lleva además `source: 'icuZones'|'declarado'`, que es lo que hace honesta la cifra.
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
