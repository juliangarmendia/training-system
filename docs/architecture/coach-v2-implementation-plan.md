<!-- Copia del plan aprobado el 2026-09-07 (origen: ~/.claude/plans/radiant-purring-toucan.md). Es la especificación por incrementos de Coach v2. -->

# Plan: de plantilla fija a entrenador que decide, explica y ajusta

> Estado: **listo para aprobar.** Tres diseños en paralelo (A · cerebro del coach + plan como dato ·
> B · motores in-app + UI · C · lógica de coaching cut→10k) consolidados en 10 incrementos desplegables.
> Lectura rápida: §Context → §Arquitectura → §Incrementos y orden → §Verificación. Las partes A/B/C son la
> especificación por área para quien implemente.

> **Fe de erratas (2026-09-07, tras implementar 1-8):** (1) numeración real de versiones: 1-5 = v11.55-v11.59, 6 = v11.60, 9 = v11.61; los incrementos 7 y 8 se subieron sin bump de app (commits 710c1cb y 733f0f0). (2) `progressCardioMin` redondea a paso de 5' (≥30) o 2' (<30): 40/45/50/55/30 y 20/22/24/26/14; los 44/48/53 de §B.3 eran valores antes de redondear. (3) El día de largo de 10 km da 3.060 kcal con la fórmula de §C.1, no ~3.050. (4) El validador implementado tiene 32 ids con nivel hard/warn (§C.3 fusionado en §A.6); la tabla autoritativa está en `coach-facts-schema.md`. (5) Tablas Supabase tras DB v12: 15, no 14. Además: la ruta real del techo Z2 es `settings.icuZones.z.zone2[1]` y los ajustes viven en `settings.data->'data'`.

## Context

**Por qué.** La auditoría del 2026-09-05 (`docs/audits/2026-09-05-system-audit.md`, F-0) confirmó que la
app es "una plantilla fija con libreta": sesiones estáticas (`PLAN.sessions` en código, 8 `PLAN_REV` a
mano), kg no prescritos (la regla de doble progresión existe en `generateCoachNote` y sólo emite una
frase), cardio a 40/50 min constantes desde junio, y un coach semanal (Claude Code, domingos) cuya
prescripción muere en una tarjeta de Stats. Julian respondió con la definición del producto:

> "No quiero una plantilla fija. Quiero que la app actúe como un entrenador profesional, que itere,
> tenga opinión, claridad y coherencia, siempre buscando el mejor entrenamiento para mis objetivos
> (bajar de peso definiéndome; ganar resistencia — correr 10k y disfrutarlo), apalancándose en ciencia,
> papers y documentación relevante."

**Decisiones del usuario (2026-09-06, AskUserQuestion):**

| Decisión | Elegido |
|---|---|
| Dónde corre el coach semanal | **Dentro de la app · Claude API** (edge function Supabase con Opus 5, disparada desde la PWA al abrir la semana nueva + botón "Regenerar"). No depende del PC. El markdown en el repo pasa a opcional. |
| Aprobación de cambios estructurales | **Propone, él aprueba con un toque.** Los kg del día y el ajuste por recuperación son automáticos (dentro del plan). |
| Déficit vs 10k cuando chocan | **Cede la carrera, manda la grasa.** Base aeróbica Z2 progresando despacio durante el cut; bloque específico de 10k al acercarse a 80-81 kg. |

**Dos precisiones del usuario al revisar el plan (2026-09-07):**

1. **El dato de recuperación de hoy llega tarde por intervals.icu.** Por la mañana intervals.icu sigue
   mostrando el readiness de ayer; usarlo para decidir el entreno de hoy sería incorrecto. → El plan trata la
   frescura como requisito de primer orden (ver B.2.b): hoy sólo cuenta si es de hoy; la API directa de WHOOP
   (que `whoop.js` ya tiene y hoy sólo usa como fallback) pasa a ser la fuente **del día**; intervals.icu queda
   como fuente del **histórico** (tendencias 7d/28d, que a la mañana ya están completas hasta ayer). Si no hay
   dato de hoy por ninguna vía: `unknown` explícito + tendencias + check-in subjetivo de 2 toques (READ-005).
2. **Modelo para programar: Opus, por coste.** El plan es un handoff por incrementos con tests primero,
   ejecutable por una sesión con Opus (`/model opus` al aprobar). El coach en producción ya usa
   `claude-opus-5` (edge function, ~$0,50-0,70 por revisión semanal).

**Resultado esperado.** Cada lunes la app presenta un briefing del coach (qué pasó → qué cambio → por qué →
qué miro) con el plan de la semana como **versión de datos** que Julian aprueba con un toque. Cada día la
app prescribe el kg del set (doble progresión), gatea por recuperación con ≥2 señales concordantes, sabe
en qué semana del bloque está y progresa el cardio. Cada decisión queda trazada a datos y Rule IDs. Nada
progresa "por variedad"; nada bloquea; todo se explica.

## Principios de diseño (no negociables)

1. **Hechos deterministas, juicio del modelo.** Los números (tendencias, e1RM, pendiente de peso,
   cumplimiento Z2, baselines HRV/RHR) los calcula código testeado (`facts pack`); el LLM decide y
   explica sobre esos hechos. Nunca le pedimos aritmética al modelo (el playbook actual lo hace y falla:
   F-2 rampRate≠TSB).
2. **El plan es dato versionado, no código.** Reutiliza el store/tabla `plans` (21 versiones ya existen,
   `createNewPlanVersion`). Versión v2 = v1 + objetivos por ejercicio + bloque + cardio + decisiones +
   briefing + `status`. `IDEAL_BLOCK_V1` queda como **semilla y fallback** (autor `ideal-seed`).
3. **Prioridad explícita coach > regla > último.** Si la versión activa trae objetivo del coach para esta
   semana, manda; si no, la regla de doble progresión; si no, el histórico. Offline funciona siempre.
4. **Guardarraíles avisan, nunca bloquean** (memoria del usuario). `validatePlanVersion()` produce
   avisos con Rule ID; el usuario decide.
5. **Sin falsa precisión.** READ-001/002/003/004/007: tendencias 7d vs baseline 28d, ≥2 señales, WHOOP
   es bandera no dosis, un día rojo cambia el objetivo de la sesión (no sólo el kg).
6. **Tests antes que motor.** Estilo del repo: Node `vm` sobre slices de fuente, cada test documenta
   "el fallo que existe para impedir". Cada incremento = tests → código → cache bump + versión + push.
7. **No construir la cascada de 10 motores.** Sólo Progresión, Readiness y Bloque mínimo como código
   in-app + el coach LLM semanal. Goal/Interference/Modality/Selection están resueltos en el IDEAL, los
   swaps y el juicio del coach.

## Arquitectura objetivo

```
                 ┌──────────────── SEMANAL (coach, LLM) ────────────────┐
IDB stores ──► buildCoachFacts() ──► edge fn coach-weekly-review ──► propuesta plan v2 (status: proposed)
(app/coach-facts.js, puro)     (Deno · Opus 5 · zod schema)          + briefing + decisions[] + usage
                                  ▲ rules-compact.json (prefijo cacheable)
                                                                      │
                                              validatePlanVersion() ──┤ avisos (warn-only)
                                                                      ▼
                                       Coach view: briefing · diff · avisos · [Aplicar][Ajustar][Rechazar]
                                                                      │ Aplicar → status active, anterior superseded
                 ┌──────────────── DIARIO (app, determinista) ─────────▼──────────────────┐
activePlan (v2) ─► getPlannedSessionForDate() ─► blockWeek() · cardio progresado · running fallback
                        │
                        ├─► computeReadiness() ─► adjustSessionForReadiness() ─► Home: [ajustada][planificada]
                        │
                        └─► startWorkout ─► suggestSetTarget(coach>regla>último) ─► kg objetivo en la tarjeta
                                              finishWorkout ─► lectura post-sesión ─► decisions log
```

Fuentes verificadas: `plans` Supabase 21 filas (`plan_v2..v21`, `sessions` objeto + `weekTemplate`),
`workouts` 31, `runs` 15, `sessions` 3, `wellness` 124 días, `bodyweight` 17, `steps` 118, `exercises` 69.
Edge function patrón: `supabase/functions/parse-meal-photo/index.ts` (SDK 0.123.0, `zodOutputFormat`,
`claude-opus-5`, adaptive thinking, `ANTHROPIC_API_KEY` ya configurada).

## Parte A · Cerebro del coach + plan como dato

### A.1 Tres decisiones estructurales

1. **Las propuestas NUNCA entran en `plans`.** `loadActivePlan()` (app.js:985) toma `max(version)` y
   `createNewPlanVersion()` (app.js:1048) hace `Math.max(...versions)`: una fila `proposed` v(N+1) sería el
   plan vivo en cualquier dispositivo con código viejo. La propuesta vive en `coach_reviews[id].output.proposal`
   y se copia a `plans` **sólo al aplicar**. `plans` sólo tiene `status: 'active' | 'superseded'` (o
   ausente = legacy).
2. **Revisión y plan son registros distintos.** Nuevo store/tabla `coach_reviews` (sustituye a
   `weekly_reviews` + `latest.json`; `weekly_reviews` se deja de escribir pero no se borra). El plan
   lleva sólo puntero (`reviewId`, `weekKey`) + `evidence` compacta por objetivo.
3. **Los hechos los calcula la PWA** (`app/coach-facts.js`, puro, testeado); el modelo sólo razona. Es la
   corrección directa de los fallos del playbook actual (rampRate≠TSB, días de pierna invertidos, lb/kg).

### A.2 Esquema plan v2 (compatible con v1: todo lo nuevo es opcional)

```js
{ id:'plan_v14', version, createdAt, weekNumber, label,
  sessions: { upperA: { id, name, subtitle, icon,
      focus: 'Banca mantiene 95. El remo sube.',                                   // v2
      changes: [{ kind:'reorder'|'remove'|'add'|'swap'|'sets', exId, why, decisionId }], // v2
      exercises: [{ id, name, muscle, sets, reps:'5-8', rpe:'7-8', defaultRest, notes, compound, db, bw, superset,
        order, optional,                                                             // v2
        target: { kg|null, reps, rpe, note≤240, source:'coach'|'rule'|'seed', evidence:[ruleIds], decisionId } }] } },
  weekTemplate: { 0..6: {type:'gym',session,z2FinisherMin} | {type:'run',label,subtype,durationMin,summary,
      cardio:{ durationMin, distanceKm, subtype, hrZone:'z2', note, source:'coach'|'seed' }}  // v2
      | {type:'recovery',...} | {type:'rest'} },
  schema:2, status:'active'|'superseded', author:'ideal-seed'|'coach-llm'|'user',
  basedOn, supersededBy, weekKey:'2026-W37', reviewId:'2026-W37#1',
  block: { id, weekIndex:1..5, weeksTotal:5, phase:'build'|'deload', emphasis:[...], deloadAnchor },
  running: { weeklyKmTarget, longRunKm, hardSessions, plan:[{ id, dow, distanceKm, durationMin, subtype, hrZone, note }] },
  seedRev: PLAN_REV }
```

- `warmup` se omite en planes del coach: `startWorkout` cae a `PLAN.sessions[id].warmup` (así los fixes
  de calentamiento por `PLAN_REV` siguen llegando).
- `running.plan[].dow`, no fechas: `pushRunningPlanToIntervalsIcu` resuelve fechas desde `weekKey`
  (lunes = `nutIsoWeekStart`). Un plan aplicado el martes sigue siendo válido.
- `block` lo estampa el cliente desde `blockWeek()` (Change 11); el modelo puede poner `phase:'deload'`
  reactivo (LOAD-004) pero no mover el ancla.

**`coach_reviews`** (IDB keyPath `id`; Supabase genérica, `record_id = id`):

```js
{ id:'2026-W37#1', weekKey, attempt, status:'running'|'proposed'|'applied'|'rejected'|'expired'|'failed',
  createdAt, updatedAt, appliedAt, appliedPlanId, rejectedReason, userNote,
  factsHash, facts:{...}, prompt:{ model, effort, rulesVersion, promptVersion },
  output:{ briefing:{ lastWeek, nextWeek, priorities:[3] },
           decisions:[{ id, type:'progression'|'structure'|'running'|'nutrition'|'recovery', what, why,
                        evidence:{numbers:{...}}, ruleIds, confidence, applies:[{sessionId, exId}] }],
           proposal:{ ...plan v2 sin id/version/status; sólo sesiones tocadas },
           requestedData:[...] },
  guardrails:[{ id, level:'warn', text, ruleIds }], usage:{ input, output, cacheRead, costUsd, latencyMs }, error }
```

### A.3 Dónde corre: edge function asíncrona invocada por la PWA (decisión del usuario, con dos ajustes)

- **Asíncrona**: Opus 5 `effort:'high'` con ~10k tokens de salida + thinking tarda 60-180 s; iOS suspende
  la PWA en segundo plano. Patrón: la función upserta `coach_reviews {status:'running'}`, devuelve 202,
  hace la llamada bajo `EdgeRuntime.waitUntil()`, upserta el resultado. La PWA hace polling de su fila
  (RLS) cada 5 s hasta 5 min y además la recoge en `syncAll`. Los fallos parciales quedan como filas
  visibles, no como respuestas HTTP perdidas.
- **Coste**: entrada ≈ 21k tokens (ethos+guardarraíles 1,5k · rules-compact 5k · esquema 2,5k · facts 9k ·
  plan actual 2k · 3 revisiones previas 1,5k) ≈ $0,11; salida 16-22k (propuesta 7k · briefing/decisiones
  3k · thinking 6-12k) ≈ $0,40-0,55. **≈ $0,50-0,70 por ejecución, ~$5-6/mes.** Prompt caching casi
  irrelevante a una llamada/semana; se estructura cacheable igual (estático primero, `cache_control` 1h).
- **Markdown en el repo**: opcional. Fuente de verdad = `coach_reviews`. Se mantiene un comando manual
  `/coach-deep-dive` (renombrado desde `weekly-review-auto.md`, **desprogramado**) que lee `coach_reviews`
  y stores por MCP y escribe sólo prosa en `tracking/weekly-reviews/` — prohibido escribir `plans` o
  empujar a intervals.icu. No se mete service-role key en GitHub Actions por ahora.

### A.4 Facts pack — `buildCoachFacts(input, deps)` en `app/coach-facts.js`

Script clásico con el patrón `module.exports` de `nutrition.js` (app/nutrition.js:2070). Puro: recibe
`{ todayStr, weekKey, stores:{workouts, runs, sessions, mobility, wellness, steps, bodyweight, nutrition,
settings, activePlan, exercisesLibrary, priorReviews}, block, seedRev, appVersion }` y `deps:{ convertWeight,
estimate1RM, nutRollingWeight, weeklyDeficits, dedupeRuns, dedupeSessions }`. Secciones (redondeo: kg 0,5 ·
km 0,1 · min 1 · % 1):

| Sección | Contenido | Reusa |
|---|---|---|
| `meta` | weekKey, ventana 4 semanas ISO, appVersion, seedRev, unit kg | `isoWeekKey()` nueva (UTC como `nutIsoWeekStart`) |
| `goals` | de `settings.goals` (nuevo; sembrado desde proteinTarget/goalWeight/stepsTarget/kcal + goals.md) | |
| `progress` | peso: media 7d, pendiente 14d/28d desde filas **medidas**, n; cintura; running: long run 4w, km/sem, ritmo a Z2, `tenKReadiness` | `nutRollingWeight` |
| `block` | weekIndex, phase, ancla, próximo deload, weekNumber | `blockWeek`, `nextDeloadWeek` |
| `plan` | plan activo compacto: template por día, sesiones con `{id, sets, reps, rpe, target}`, overrides, schedule overrides | |
| `adherence` | 4 filas semanales: gym planned/done/ids/quick, cardio planned/done/km, recovery, duraciones | |
| `lifts` | por ejercicio: ≤4 sesiones `{date, session, topKg, topReps, topRpe, e1rm, setsDone/Planned, avgRpe}`, daysSinceLast, trend, skipRate4w. Todo en kg vía `convertWeight`; `measure` reporta cm sin e1RM; `bw` reporta +kg | `convertWeight`, `estimate1RM`, `measureUnitFor` |
| `skipped` | ejercicios con done=false recurrente | |
| `cardio` | semanas `{km, min, sessions, hard}`; ≤10 carreras `{date, km, min, avgHR, pace, z2Compliant, pctZ2, decoupling, source}`; techo Z2 de `icuZones` (o 143 declarado); no-carrera | `getRunsDeduped`, `getSessionsDeduped` (incl. `origin:'z2_finisher'`), `cardioHrTarget` |
| `readiness` | HRV/RHR media 7d vs 28d (Δ%), sueño 7d/28d + noches <6,5 h, días verde/amarillo/rojo (67/34), **`aerobicLoad:{ctl, atl, form: ctl−atl, note:'sólo cardio'}`** | `getRecoveryColor` |
| `nutrition` | días registrados 28/7, proteína, kcal, EA sólo de días **cerrados**, `weeklyDeficits`, modelo de mantenimiento | `energyAvailability`, `weeklyDeficits`, `maintenanceKcal` |
| `steps` · `mobility` | medias, días en suelo; sesiones 4w, dolor | |
| `priorReviews` | ≤3: weekKey, status, prioridades, decisiones `{id,type,what}`, applied, extracto ≤1200 chars. Primera vez: entrada `legacy` desde `latest.json` W36 | |
| `dataGaps` | strings que el modelo **debe** repetir: <8 workouts, 0 carreras, nutrición <14 días → "NO inferir ingesta", sin `icuZones`, <5 días wellness, <7 pesos medidos, planned aproximado | |
| `confidence` | overall + por bloque | |

Tamaño ≈ 25-35 KB (~8-10k tokens). Nunca se envían filas crudas de `wellness`.

### A.5 Corpus de reglas — `rules-compact.json`

`research/evidence-to-rules.md` ya contiene un único bloque ```json con los 70 objetos. Script
`scripts/build-rules-compact.mjs` → `supabase/functions/coach-weekly-review/rules-compact.json` (Deno
`import ... with {type:'json'}`) con `{id, rule, evidenceLevel, confidence, energyState, programmingAction}`
≈ 5k tokens; `rulesVersion` = sha256. Test `verify-rules-compact.mjs`: 70 reglas, mismo set de ids, mismo
texto, grados válidos.

System prompt (estático primero, `cache_control` 1h en el último bloque): (1) ethos en castellano
(reescrito desde `weekly-review-auto.md` con Changes 2/4: **señal de fuerza = RPE/top set/quality; CTL/ATL/
form son sólo carga aeróbica; `form = ctl−atl` con el rango pequeño de este atleta, nunca umbrales de TSB
de la literatura**; ≥2 señales; respetar `dataGaps` literalmente; propone, el usuario decide); (2)
guardarraíles duros citados (STR-001/003, END-003/004, INT-001/004, REC-001/002/008, LOAD-004, READ-002,
BUD-001) + invariantes de producto (sólo ids permitidos; kg por mano en `db`, `+kg` en `bw`, `null` en
medida; sin salto >+10% sin decisión; >21 días sin ejercicio → repetir); (3) contrato de salida;
(4) `rules-compact.json`. Mensaje de usuario = facts pack + "Devuelve la propuesta para {weekKey}" +
`userNote` si hay.

### A.6 `validatePlanVersion(plan, ctx)` — puro, sólo avisos

`ctx = { basedOn, facts, variant, libraryIds, lowerSessionIds, block, bodyweightKg }` → `[{id, level:'warn', text, ruleIds}]`:

| id | Chequeo | Rule IDs |
|---|---|---|
| `VOL-CAP` | series/músculo/sem > 14 en fat-loss | STR-003, STR-001 |
| `HARD-CARDIO` | slots threshold/intervals + híbrido > 1 | END-004, BUD-001 |
| `KM-JUMP` | km sem > max(prev×1,10, prev+1); sin carrera 14 d → tope 8 km "reentrada" | END-003, LOAD-001 |
| `RUN-BEFORE-LEGS` | carrera dura en d y `lowerSessionIds` en d+1 (Dom→Lun) | INT-001 |
| `DELOAD-VOLUME` | deload y series > 0,6×basedOn; o `isDeload` sin `phase:'deload'` | LOAD-004 |
| `SESSION-COUNT` | gym slots > días de fuerza de la variante | BUD-001 |
| `LOAD-JUMP` | target.kg vs último top: > +10% o < −15% → "salto de carga"; sin histórico | STR-001, LOAD-001 |
| `EX-UNKNOWN` | id ∉ librería | SEL-* |
| `PROTEIN-FLOOR` | decisión que baje proteína < 1,8 g/kg o < goals.proteinFloorG | REC-001 |
| `EA-GATE` | ≥4 días EA<30 y sube series o km | REC-008 |
| `HARD-BUDGET` | Σ bw de la semana > 6 | BUD-001 |
| `CHURN` | > 3 cambios estructurales en una semana | GEN-001 |
| `PLYO-PLACEMENT` | box-jump no primero o tras carrera dura | INT-004 |

`diffPlanVersions(a, b)` (mismo fichero) → `{ weekTemplate:[{dow,from,to}], sessions:{[id]:{added, removed,
reordered, setsChanged, targets:[{exId, fromKg, toKg, fromReps, toReps}]}}, running, structural:n }`.
`mergeProposal(activePlan, proposal)` copia intactas las sesiones no tocadas.

### A.7 Flujo de aprobación en la PWA — `app/coach.js`

- **Disparo** `maybeRunWeeklyCoach()` en `init()` tras `checkAuth()`+`syncAll()`: si no hay fila
  `coach_reviews` para `isoWeekKey(today())` (salvo `failed`) → construir facts, POST, insertar fila
  `running` local, polling. Manual: "Regenerar" / "Regenerar con nota" (nuevo `attempt`).
- **Tarjeta Home `#coach-week-card`** (antes de `todays-plan-card`, index.html:186; `renderHomeView`
  llama `renderCoachWeekCard()`): `running` → "El coach está revisando W37…"; `proposed` → 3 prioridades,
  `nextWeek` plegado, **diff por sesión** ("Upper B: core primero · fuera curl · OHP 55 (=)"), avisos como
  chips ámbar, botones **Aplicar · Rechazar · Regenerar con nota**; `applied` → "Plan W37 activo (v14) ·
  2 avisos · Deshacer"; `rejected/expired` → una línea + Regenerar.
- **`applyCoachProposal(review)`**: `mergeProposal` → `validatePlanVersion` → `createNewPlanVersion({…,
  meta:{schema:2, status:'active', author:'coach-llm', basedOn, weekKey, reviewId, block, running,
  seedRev}})` (extender para aceptar `meta`) → anterior `status:'superseded', supersededBy` → overrides:
  absorbidos si la sesión nueva ya trae el swap, conservados si sigue el original, borrados si el slot
  desaparece → `clearFutureScheduleOverrides()` sólo si cambió el template → review `applied`.
- **`rollbackPlanVersion(toId)`**: destino `active` (`rolledBackFrom`), actual `superseded`. Historia
  lineal, sin borrados.
- **Política** `settings.coachAutoApply`: `'ask'` (default, decisión del usuario) · `'auto-if-clean'`
  (0 avisos y sin decisiones `structure`) · `'auto'`. No se despliega `auto` por defecto.
- Casos: propuesta pendiente al empezar un entreno → sigue el plan activo; propuesta sin aplicar cuando
  corre la siguiente semana → `expired` y va a `priorReviews` con `applied:false`; aplicar offline →
  `smartPut` encola; dos dispositivos → la fila sincroniza.

### A.8 Migración y retiro

- `loadActivePlan()`: preferir `status==='active'` (mayor versión si varias), si no legacy `max(version)`
  entre filas sin `status`; nunca `superseded`.
- `applyIdealPlan()`: `if (activePlan.author==='coach-llm'||'user') return;` salvo `force`. `PLAN_REV`
  pasa a "revisión de semilla": gobierna sólo planes `ideal-seed`; en planes coach viaja como `seedRev`.
- `setIdealVariant(n)` con plan coach activo: **variante = calendario, coach = contenido** → versión
  `author:'user'` con `weekTemplate = buildWeekTemplateFromIdeal(n)` + sesiones/targets/running del coach.
- `startWorkout`: `deload = author==='coach-llm' ? false : isDeloadWeek(wk)` — el plan coach ya trae el
  volumen de deload; evitar el doble recorte. Warm-up: `session.warmup || PLAN.sessions[id].warmup`.
- `getPlannedSessionForDate` rama `run`: `slot.cardio?.source==='coach' ? slot.cardio.durationMin :
  progresado(base)` (coach > regla, Change 11).
- `suggestSetTarget` (Change 7) prioridad 1 = `activePlan.sessions[sid].exercises[].target` con
  `source:'coach'` y `activePlan.weekKey` = semana ISO actual o anterior. `weekly_reviews` deja de ser fuente.
- `loadAndRenderWeeklyCoach`/`renderNextWeekPlan` → leen `coach_reviews` + plan v2 (historial 8 revisiones
  en Stats › Coach). `fetchLatestWeeklyReview()` se borra; `latest.json` queda como artefacto histórico.
- `pushRunningPlanToIntervalsIcu()`: fuente `activePlan.running.plan[]`, fechas desde `weekKey`,
  `external_id = pwa-${weekKey}-${id}`.
- Docs: nuevo `docs/architecture/plan-v2-schema.md`; `db-schema-state.md` (DB v12, 14 tablas);
  `engines.md` cabecera "3 motores + 7 decisiones de diseño".

### A.9 Edge function `supabase/functions/coach-weekly-review/index.ts`

Mismo patrón que `parse-meal-photo` (imports, CORS, `asUser.auth.getUser()`, cliente `admin`, `json()`);
`config.toml` `verify_jwt = true`. Request `{ weekKey, facts, currentPlan, allowed:{sessionIds,
exerciseIds:[{id,name,muscle,db,bw,measure}]}, priorReviews, userNote?, regenerate?, mode:'async'|'sync',
clientVersion }` (validar: weekKey regex, facts ≤200 KB, ≤12 sesiones, ≤150 ejercicios). Flujo:
`factsHash` → si existe fila con mismo hash y status proposed/applied y no `regenerate` → devolver
`cached:true` · upsert `running` · `mode async` → `EdgeRuntime.waitUntil(run())` + 202 · `run()` =
`anthropic.messages.parse({ model:'claude-opus-5', max_tokens:24000, thinking:{type:'adaptive'},
output_config:{ effort:'high', format: zodOutputFormat(CoachOutput(allowed)) }, system:[{text, cache_control}],
messages:[facts] }, { timeout:170_000, maxRetries:1 })` · `stop_reason==='refusal'` → `failed/refusal` ·
`parsed_output===null` → 1 reintento, luego `failed/parse` · **saneado en código** (≤6 sesiones, ≤10
ejercicios, notas ≤240, 3 prioridades, ids ∉ allowed fuera, kg null en bw/medida, redondeo 1,25) · guardar
`output`, `usage` (+costUsd), `status:'proposed'`. **Nunca escribe `plans`.**

Zod (dinámico por request; los `z.enum(allowedIds)` mantienen al modelo dentro del vocabulario de la app):
`Target{kg|null, reps, rpe, note, evidence[], decisionId|null}` · `Exercise{id∈enum, sets, reps, rpe, optional,
superset|null, target}` · `Session{id∈enum, focus, exercises[], changes[]}` · `CardioSlot{dow 0-6, subtype∈
zone2|long_easy|zone3|threshold|intervals|recovery, durationMin, distanceKm|null, note}` · `Decision{id, type,
what, why, evidence{numbers}, ruleIds[], confidence}` · `CoachOutput{ briefing{lastWeek, nextWeek, priorities},
decisions[], proposal{label, phase, sessions[], cardio[], running{weeklyKmTarget, longRunKm, hardSessions},
weekTemplateChanges[]}, requestedData[] }`. Los límites `.max()` se imponen en código, no se confía en el
decoder (como hace `parse-meal-photo` con `MAX_ITEMS`).

Tabla (crear **antes** de añadir el store a la lista de sync — regla de `db-schema-state.md`):

```sql
create table if not exists coach_reviews (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  record_id text not null, data jsonb not null, updated_at timestamptz default now(),
  unique(user_id, record_id));
alter table coach_reviews enable row level security;
create policy "own coach_reviews" on coach_reviews for all using (auth.uid() = user_id);
create index if not exists coach_reviews_user_updated_idx on coach_reviews (user_id, updated_at);
```

PWA: `coach_reviews` en `openDB` (**DB_VERSION 12**, keyPath `id`) y en `stores` de `syncAll`
(`supabase-sync.js:347`; `verify-sync-writes.mjs` 13 → 14).

### A.10 Tests de la parte A

| Test | El fallo que impide |
|---|---|
| `verify-coach-facts.mjs` | aritmética del LLM sobre filas crudas; mezcla lb/kg; carreras duplicadas COROS/Strava; peso forward-filled en la pendiente; `form≠ctl−atl`; EA de días abiertos; `dataGaps` ausente con <14 días de nutrición; `isoWeekKey` en frontera Dom/Lun; `stableStringify` orden de claves; `undefined`/`NaN` en el JSON |
| `verify-plan-validator.mjs` | un guardarraíl que bloquea o que nunca dispara (13 ids, positivo y negativo; `RUN-BEFORE-LEGS` Dom→Lun; `diffPlanVersions` idéntico → `structural:0`) |
| `verify-plan-v2-compat.mjs` | una propuesta o versión vieja convertida en plan vivo (fila v1 sigue resolviendo; `[v12 legacy, v13 superseded, v14 active]` → v14; nunca `plan_vNaN`; `mergeProposal` conserva byte a byte lo no tocado) |
| `verify-rules-compact.mjs` | corpus del prompt desincronizado de `evidence-to-rules.md` |
| `verify-coach-wiring.mjs` | scripts en index.html/sw.js antes de app.js; `DB_VERSION ≥ 12`; `coach_reviews` en openDB y sync; `renderHomeView` → `renderCoachWeekCard`; `applyIdealPlan` mira `author`; warm-up fallback; sin lectura de `weekly_reviews` en push; edge fn con `refusal`/`parsed_output`/`waitUntil` y **sin** `.from("plans")` |
| `verify-sync-writes.mjs` (actualizar) | 14 stores; sin `dbPut('plans'|'coach_reviews'` |

### A.11 Riesgos / NO hacer (parte A)

Sin propuestas en `plans` · sin facts en Deno desde Supabase (duplica dedupe/unidades sin tests) · sin
stores crudos al modelo · sin ids libres en el esquema (si el modelo pide trap-bar, se añade a
`EXERCISE_ALTERNATIVES` con test) · sin doble recorte de deload · nunca bajar `DB_VERSION` · la tarjeta no
bloquea · `auto` nunca por defecto · verificar el tope wall-clock del plan Supabase antes de fiarse de
`waitUntil` (si 150 s → `max_tokens` 16k) · `isoWeekKey` en UTC (incidente tz) · versionar el prompt
(`promptVersion`) por fila.

## Parte B · Motores deterministas in-app + UI del coach

### B.0 Decisiones de arquitectura

1. **Tres módulos nuevos, todos scripts clásicos** cargados entre `nutrition.js` y `app.js`
   (`index.html:796`; añadir a `APP_SHELL` en `sw.js:6`), con el patrón `module.exports` de
   `app/nutrition.js:2070` para que los tests los carguen enteros en `vm`:
   - `app/coach-engine.js` — **puro, diario**: `suggestSetTarget`, `sessionReadout`, `computeReadinessFrom`,
     `adjustSessionForReadiness`, `blockWeekFromAnchor`, `progressCardioMin`, `suggestRunningWeek`,
     `goalProgress`, constantes `COACH_*`. Sin IDB ni DOM.
   - `app/coach-facts.js` — **puro, semanal**: `buildCoachFacts`, `isoWeekKey`, `stableStringify`,
     `validatePlanVersion`, `diffPlanVersions`, `mergeProposal` (Parte A).
   - `app/coach.js` — orquestación + renderers **nuevos**: disparo/polling del coach, `applyCoachProposal`,
     `rollbackPlanVersion`, `renderCoachWeekCard`, `renderCoachReadout`, vista `view-coach`.
   Los wrappers async que leen IDB (`computeSessionTargets`, `computeReadiness`, `blockWeek`) y las
   modificaciones a renderers existentes viven en `app.js`, junto a lo que sustituyen.
2. **El objetivo del set se calcula al vuelo, no se escribe en el plan.** Multi-dispositivo: `workouts`
   ya sincroniza y el cálculo es función pura → mismo número en iPhone y web sin ordenar escrituras. Dos
   escritores en `plans` (app diaria + coach) romperían "la versión es el documento del coach". Lo que sí se
   persiste: `workout.exercises[i].target` (snapshot de lo mostrado) y `workout.readout`.
3. **Prioridad única coach > regla > último.** El target del coach vale si `activePlan.weekKey` es la
   semana ISO actual o la anterior (fallback: `createdAt` ≤ 14 días si no hay `weekKey`).
4. **Readiness nunca es dosis.** Color + señales → cambios **discretos** de objetivo (quitar accesorios,
   capar RPE, sustituir sesión). Ningún `kg × factor(color)`.
5. **Nada bloquea.** Toda salida es recomendación con dos botones; el CTA del hero de Home sigue
   arrancando la sesión planificada.
6. **Sin pestaña nueva en el nav.** Vista `view-coach` (como `view-ideal-preview`) con tres entradas.

### B.1 Motor de progresión — `suggestSetTarget(ex, history, opts)` (Change 7, completado)

Constantes (David Lloyd, editables): `COACH_DB_PAIRS_KG = [2,4,6,8,10,12.5,15,17.5,20,22.5,25,27.5,30,32.5,35,40]`,
`COACH_STEP_KG = 1.25`, `COACH_INC = { barbell:2.5, machine:2.5, cable:1.25, bw:2.5 }` (heurística de práctica, no
evidencia — decirlo en el comentario), `COACH_CABLE_IDS`, `COACH_POWER_IDS = {box-jump, pogo-hops}`,
`COACH_PAUSE_DAYS = 21`, `COACH_DELOAD_FACTOR = 0.9`, `COACH_RPE_HIGH = 8.5`.

Helpers puros: `_coachParseReps('8-10/side')` → `{min, max, suffix, numeric}` · `_coachParseRpeTop('7-8')` → 8 ·
`_coachRound(kg, 1.25)` · `_coachNextDbPair`/`_coachPrevDbPair` · `_coachLoadType(ex)` →
`measure|db|bw|cable|barbell|machine` · `_coachIncrement(ex, kg, dir)`.

```js
suggestSetTarget(ex, history /* desc, pesos YA en unidad de la app */, opts /* {coachTarget, planWeekKey, todayWeekKey,
  planCreatedAt, deload, today, measureUnit, unit} */)
→ { kg|null, reps, rpe, source:'coach'|'rule'|'last'|'none', reason /* es, 1 línea */, delta, ruleIds, basis }
```

Orden de decisión: (1) `measureUnit` → `kg:null`, "Se mide en cm" · (2) reps no numérico (AMRAP, metros) →
`last` · (3) **coach** vigente → `{kg, reps, rpe, source:'coach', reason: target.note}`; vencido → sigue con
prefijo "Objetivo del coach de hace N días — aplico la regla" · (4) sin historial → `kg:null, source:'none'`,
"Primera vez: elige un peso que deje 2-3 reps" (tarjeta **idéntica a hoy**) · (5) pausa >21 d → `last`,
"Pausa de N días: repite la carga" (LOAD-004) · (6) **deload** → `kg = incrementoAbajo(top×0,9)`, `rpe:'5-6'`,
"Deload · semana 5/5: −10 % y RPE 5-6"; **no se evalúa progresión** · (7) **doble progresión** sobre
`history[0]`: todas al tope y avgRPE ≤ tope (o sin RPE anotado, dicho) → **+inc** (STR-001) · al tope pero RPE
>8,5 → **hold** · no llega al mínimo: ≥ mitad de series cortas o RPE ≥9 → **−inc**; si no → repetir · resto →
mismo kg, "+1 rep por serie"; dos sesiones iguales → "hoy +1 rep o RPE 8 en la última". `bw` sin lastre al
tope → `kg: 2.5`; `bw` con `rpe:'-'` (ab wheel, leg raise) → nunca kg. Unilateral conserva sufijo. Supersets
sin efecto. Historial en lb lo convierte **el llamador** (`convertWeight`).

Wrapper `computeSessionTargets(sessionId, exercises, {deload, allWorkoutsDesc})` → `Map<exId, target>`:
historial por ejercicio desde **cualquier** sesión (la sesión libre y los swaps lo exigen; ya se hace así en
`startWorkout:3350-3369`), `coachTarget` desde `activePlan.sessions[sid].exercises.find(e => e.id === (ex._origId||ex.id)).target`.
`parseCoachTarget(str)` sólo para el adaptador legacy de `weekly_reviews` mientras el plan activo no sea v2.

**Render** (`buildExerciseCard`, app.js:3728, firma + `target, adjustments`): bajo `.exercise-target`, línea
`Objetivo: **92,5 kg** × 5-8 @7-8 [chip coach|regla|último]` (`.coach-objective`, coma decimal, `bw` → "+2,5 kg",
`kg:null` → no se pinta). `.exercise-notes` = `target.reason` (**`generateCoachNote` se elimina** con su rama
'Reentrada'). **Placeholder de todos los sets = `target.kg`** (la fila fantasma ya muestra el anterior).
**Aceptar con el check**: en el handler `.set-check` (app.js:~3534), si `weight.value===''` y el placeholder es
numérico → `weight.value = placeholder` (hoy un set marcado sin escribir se guarda con `weight:0` y desaparece
del historial; esto lo arregla de paso). "Last: 90×8 90×8 90×7" **se conserva**. Home `renderTodaysPlan`
(app.js:9029): `Bench Press | 4×5-8 @7-8 · **92,5 kg** [chip]`.

**Lectura post-sesión** `sessionReadout(workout, targetsById, exDefs)` → `{ items:[{exerciseId, name, target, done:{topKg,
reps[], avgRpe}, outcome:'progressed'|'held'|'regressed'|'skipped'|'no-target', next:{kg, reason}}], summary, line }`.
`finishWorkout` (app.js:4168): adjunta `target` a cada ejercicio desde `state.activeTargets`, `workout.readout`,
`readinessAtStart`, `adjusted`, `adjustments`; `smartPut`; `logDecision({type:'session-readout'})`. Render:
**tarjeta en Home** `#coach-readout` (encima de `#todays-plan-card`), visible si `workouts[today].readout` y
`settings.coachReadoutSeen !== workout.id` (dbPut local):

```
┌ LECTURA DEL COACH · Upper A · 74 min ─────────── ✕ ┐
│ 3 subidas · 2 mantenidas · 1 corta                   │
│ ● Banca      92,5 → hiciste 92,5×8/8/7 @7,5   ↑ 95   │
│ ● Remo       67,5 → 67,5×10/10/9             → 67,5 · +1 rep │
│ ● Incline DB 20   → 20×12/12/10              ↑ 22,5 (par)    │
│ ○ Pushdown   —    → sin series                (saltado)       │
│ Próxima vez ya está aplicado en la tarjeta.          │
└──────────────────────────────────────────────────────┘
```

### B.2 Motor de readiness (Changes 5+6 + READ-007 sin bloquear)

```js
computeReadinessFrom({ today, wellness[], whoopToday|null, workouts[] desc, cutoffs:{green:67, yellow:34} })
→ { color:'green'|'yellow'|'red'|'unknown', signals:[{id, fired, dir, value, baseline, unit, text, status:'ok'|'insufficient'}],
    fired, confidence:'high'|'medium'|'low', deloadHint, ruleIds:['READ-001','READ-002','READ-003','READ-004','READ-008'] }
```

| Señal | Cálculo | Dispara | Insuficiente |
|---|---|---|---|
| `whoop` | score **con `date === today`** (F-6) → `getRecoveryColor` 67/34 | rojo = señal; amarillo fija color mínimo amarillo | sin fila de hoy → `unknown` |
| `hrv7v28` | media 7d vs media días 7..34 | ≤ −10 % | <5 valores 7d o <14 baseline |
| `rhr7v28` | media 7d − baseline | ≥ +5 bpm | idem |
| `sleep7` | media 7d | < 6,5 h | <4 noches |
| `rpe2` | avgRPE de las 2 últimas sesiones de fuerza (≥3 sets con RPE) | ambas ≥ 9 | <2 sesiones |
| `quality2` | `quality` de las 2 últimas | ambas ≤ 2 | <2 sesiones |

`color`: ≥2 disparadas → rojo; 1 → amarillo; 0 → amarillo si WHOOP amarillo, `unknown` si sin WHOOP hoy y
tendencias insuficientes, si no verde. `confidence`: high = WHOOP hoy + baseline ≥14 d. `deloadHint` = ≥3
disparadas, o `rpe2`, o (`hrv7v28` ∧ `rhr7v28` ∧ `quality2`). Textos: "HRV 7d 62 ms vs 71 de base (−13 %)",
"FC reposo 7d 54 vs 49 (+5)", "Sueño 7d 6,1 h", "WHOOP hoy 31 % · rojo". Wrapper `computeReadiness({date})` en
app.js con caché por día en `state._readinessCache` (invalidada en `finishWorkout`, `intervalsIcuSync`,
`whoopSyncData`). Consumidores: `computeTrainingAdvisory`, `checkDeloadNeeded`, `renderReadinessSignals`,
`startWorkout` (snapshot). `getWhoopContext` queda como adaptador date-checked para `renderRecoveryHero`.

#### B.2.b Frescura del dato de hoy (requisito del usuario)

Estado actual (`app/whoop.js:491-517`): `whoopSyncData()` usa **intervals.icu como primaria** y sólo cae a la
API directa de WHOOP (`whoopGetRecoveryCollection`, `whoopGetCycles`, `whoopGetSleep`, con refresh de token vía
la edge function `whoop-auth`) si intervals devuelve null. intervals.icu tarda horas en reflejar el readiness
de hoy; a la mañana tiene el de ayer. Resultado: el advisory decide con el dato equivocado (F-6 agravado).

Diseño:
- **Dos fuentes con roles distintos.** intervals.icu = **histórico** (store `wellness`, baselines 7d/28d;
  a la mañana está completo hasta ayer, que es lo que las tendencias necesitan). WHOOP directo = **el dato de
  hoy**. Nuevo `whoopFetchTodayRecovery()` en `whoop.js`: si `whoopOAuthConnected()`, pide
  `/v2/recovery` de los últimos 2 días y devuelve el registro cuya fecha local (no UTC — F-14) sea hoy con
  `{score, hrv, restingHR, sleepHrs, source:'whoop-direct', fetchedAt}`; se ejecuta **después** de la ruta
  intervals cuando la fila de hoy falta o no trae `readiness`, y mezcla el resultado en `data.recovery`
  marcando `source`. Caché de "hoy" de 10 min **por día**, así se reintenta cada vez que se abre la app hasta
  que llegue.
- **`computeReadinessFrom` sólo acepta hoy.** La señal `whoop` toma `recovery.find(r => r.date === today)`;
  si no existe → `status:'insufficient'` con motivo `'intervals.icu aún tiene el de ayer; WHOOP directo no
  conectado'` o `'WHOOP aún no puntuó la noche'`. **Nunca** el último elemento del array. Las tendencias
  (HRV/RHR/sueño 7d vs 28d) y las señales de rendimiento siguen funcionando con datos hasta ayer, así que la
  mañana sin dato de hoy da un color por tendencia con `confidence:'medium'`, no un `unknown` inútil.
- **Check-in subjetivo de 2 toques** cuando falta el dato de hoy (READ-005: subjetivo y rendimiento pesan
  más que el wearable cuando discrepan): en la tarjeta del coach, "¿Cómo dormiste? [<6h · 6-7 · 7-8 · >8]"
  y "¿Cómo te sientes? [1-5]" → `wellness[today].subjective = {sleepBand, feel, ts}` vía `smartPut`
  (campo nuevo, aditivo; el histórico de intervals no lo pisa porque el merge de `intervalsFetchWellness`
  conserva claves no presentes). Señales `sleepSelf` (<6 h) y `feelSelf` (≤2) entran en el recuento de
  ≥2 concordantes. Opcional y descartable: si no lo rellena, no pasa nada.
- **La UI dice de dónde y de cuándo es el dato**: "Recuperación: verde · WHOOP 07:42" / "Sin dato de hoy
  (intervals.icu aún tiene el de ayer) · tendencias 7d: sin señales · [check-in]". `renderRecoveryHero`
  puede seguir mostrando el último disponible **con su fecha visible** ("ayer"), nunca como si fuera hoy.
- **Re-evaluación cuando llega**: `state._readinessCache` se invalida al completar `whoopSyncData` con un
  registro de hoy nuevo; la tarjeta del coach se repinta. Si entrenó antes, `readinessAtStart` guarda
  honestamente `unknown`/tendencia.
- **Prerrequisito operativo**: (re)conectar WHOOP OAuth en Ajustes (`whoopConnect`, `whoopNeedsReconnect`);
  la auditoría no pudo confirmar si la app OAuth sigue viva. Si la ruta directa no funciona, el sistema
  degrada a tendencias + check-in y lo dice; no se inventa el dato.

Tests (`verify-advisory-matrix.mjs` / `verify-readiness-trend.mjs`): intervals tiene ayer y WHOOP directo tiene
hoy → usa hoy, `source:'whoop-direct'` · ninguno tiene hoy → señal `insufficient` con motivo, color por
tendencias, `confidence:'medium'` · check-in "<6 h" + HRV −12 % → 2 señales → rojo · la fecha se compara en
**local**, no UTC (registro de las 23:30 UTC-1 no es "mañana").

**`adjustSessionForReadiness(planned, readiness, ctx)`** → `{ mode:'keep'|'modify'|'replace'|'recovery', session,
changes:[{type, exerciseId?, from, to, why, ruleIds}], reason, alternatives, confidence }`:

| readiness \ sesión | rest/recov | run easy | run long_easy | gym moderate (upper) | gym hard (lower/full/hybrid) |
|---|---|---|---|---|---|
| unknown | keep | keep | keep | keep · low · "Sin dato de hoy: plan tal cual" | keep · low |
| green | keep | keep | keep | keep | keep |
| yellow | keep | keep | **modify** ×0,8 misma zona | **modify** suave: RPE ≤7 · −1 accesorio · sin potencia | **modify**: RPE ≤7 · −2 accesorios · sin box jump (INT-004) · compuestos intactos |
| red | keep | keep, tope 30' | **replace** → `ALT_LIBRARY.hard_cardio` | **modify** fuerte: RPE ≤7 · sólo compuestos+core · compuestos −1 serie (mín 2) | **recovery** → `ALT_LIBRARY.strength_lower/.hybrid`, 30' |

Recorte `_coachTrimAccessories(exercises, n)`: permanencia `compound > Core > superset > accesorio suelto`, desde
el final. Ej. `lowerA` amarillo → quita `box-jump` + `calf-raise`. **No cambia kg** (lo fija `suggestSetTarget`;
la fatiga se gestiona por RPE/volumen — STR-001), ni el Z2 finisher, ni la sesión de recuperación.

Integración: `startWorkout(sessionId, {adjustments})` filtra `dropIds`, `buildExerciseCard` aplica `setDelta`
(mín 2) y `RPE ≤7`; `state.activeAdjustments`, `state.activeReadiness`; header "· ajustada (recuperación
amarilla)"; `captureWorkoutState`/`restoreActiveWorkout` reponen ajustes (si no, al reabrir volverían los
ejercicios quitados). **Home** (`renderTrainingAdvisory` reescrito sobre `computeReadiness` + `adjustSession…`):

```
┌ HOY · Semana 3/5 · build ──────────────── Coach › ┐
│ Lower A · Sentadilla                               │
│ Recuperación: amarilla · 1 señal                   │
│   HRV 7d 62 ms vs 71 de base (−13 %)               │
│ Te propongo la sesión ajustada:                    │
│   · sin box jump (la potencia, sólo en fresco)     │
│   · sin gemelo · RPE tope 7, mismos kg             │
│ [Hacer la ajustada]   [Hacer la planificada]       │
│ Vos decidís. Las dos quedan registradas.           │
└────────────────────────────────────────────────────┘
```
Verde → dos líneas y CTA implícito (hero). Rojo → `[Registrar la alternativa]` (reusa `t3LogAlternative`) +
`[Hacer la planificada igual]`. Ambos botones → `logDecision({type:'readiness-adjust', outcome})`. El pie "no
cambia tu plan" desaparece. `renderFatigueScore` → **`renderReadinessSignals`** (Stats › Today, `#readiness-signals`):
lista de señales con valor vs base, **sin número, sin "Push hard"**; se borran las ponderaciones de
proteína/frecuencia. `checkDeloadNeeded`: `deloadHint` + `nextDeloadWeek()`; rama muerta fuera; botón
`[Proponer adelantar el deload]` → `logDecision({type:'deload-request'})` (el ancla la mueve el coach semanal
con aprobación).

### B.3 Semana del bloque + progresión de cardio (Change 11 + ancla por fecha, Change 10a)

`blockWeekFromAnchor(weekNum, anchorWeek, 5)` → `{ index 1..5|null, isDeload, weeksIntoBlock, label }`; wrapper
`blockWeek()` junto a `isDeloadWeek` (app.js:1490), que pasa a **delegar** en él (una sola aritmética).
**Ancla por fecha**: `settings.deloadAnchorDate` (lunes ISO); migración desde `deloadAnchorWeek` con `startDate`;
`getWeekNumber` sólo etiqueta. La primera propuesta del coach (C.1) fija el ancla al **lunes 2026-09-07** —
es cambio de plan, Julian lo aprueba.

`progressCardioMin(baseMin, block, {variant, lastCardioDaysAgo, coachMin})` → `{min, source:'coach'|'rule'|'base', note}`:
coach si existe · base si variante 0, sin ancla o >14 días sin cardio · deload `round(base×0,7)` · si no
`min(round(base×1,1^(index−1)), round(base×1,35))`; paso 5 si base ≥30, 2 si no (finisher 20→22→24→26→14;
carrera 40→44→48→53→28; 50→55→60→65→35). `getPlannedSessionForDate` rama `run`: `coachMin =
activePlan.weekTemplate[jsDay].cardio?.durationMin`; devuelve además `baseMin`, `durationSource`, `block`;
`z2FinisherMin` igual. Consumidores sin cambio de firma: `renderTodaysPlan` ("48' (40' base · semana 3)"),
`renderRunPlanBanner`, `pushCardioToIntervalsIcu`, `logZ2Finisher`, `renderWeekCalendar`. Home muestra
"Semana 3/5 · build · foco: base aeróbica + déficit" (foco = `briefing.priorities[0]` o
`IDEAL_BLOCK_V1.progressing`); `renderIdealPreview` añade fechas del bloque y deload.

### B.4 Carrera hacia 10k — `suggestRunningWeek` (fallback cuando el coach no fijó `running`)

```js
suggestRunningWeek({ history4w /* runs dedupeados + sessions run_outdoor|treadmill; bici/remo NO cuentan km */,
  block, readiness, goals, zones:{z2:[131,143]}, slots:[{dow:3, base:40, subtype:'zone2'}, {dow:6, base:50, subtype:'long_easy'}, {dow:0, base:20, optional:true}] })
→ { phase:'run_walk'|'base'|'build'|'ready10k', weeklyKmTarget|null, weeklyMinTarget,
    sessions:[{dow, type:'run-walk'|'Z2'|'long'|'easy-opt', min?, km?, hrCap, pattern?, dsl, source:'rule'}],
    gates:{ z2Compliance, baseWeeks, qualityUnlocked, longestZ2Km, decouplingOk }, reason, ruleIds }
```
`z2max = zona2[1] + 2` (ruido de correa) · `z2Compliance` sobre las 3 últimas · `baseWeeks` = semanas ISO
consecutivas con ≥15 km y ≥2/3 en Z2.
- **`run_walk`** si ≥2 de las 3 últimas con FC > z2max, o sin carrera 14 d, o <8 km/sem, o <2 carreras →
  **por tiempo**: Mié `progressCardioMin(30)`, Sáb `progressCardioMin(40)`, Dom 20' opcional; `pattern` sem 1-2
  "3′ trote / 2′ caminar", sem 3+ "5′/1′"; `dsl = 'Nx\n- 3m Z2 HR\n- 2m Z1 HR'` (END-006, END-002).
- **`base`** si Z2 ≥ 2/3 y ≥8 km: `weeklyKm = deload ? last×0,7 : min(max(last×1,10, last+1), last×1,20)`;
  largo = 50 % con 2 carreras, ≤40 % con 3 (el 40 % es heurística `expert`, se declara).
- **`build`** si `baseWeeks ≥ 3` (gate END-004: cero duras hasta 3 semanas ≥15 km en Z2, nunca en deload). El
  motor **no añade** intervalos: `gates.qualityUnlocked:true` para que el coach lo proponga (Sáb; INT-001).
- **`ready10k`** si largo Z2 ≥8 km ∧ (`decoupling <5` ∨ deriva FC <5 bpm) ∧ ≥18 km/sem. Sin dato de
  decoupling → `decouplingOk:null`, **no** ready (END-005; nunca se inventa).

Consumo: rama `run` de `getPlannedSessionForDate` sin `activePlan.running` → `summary` ("6 × (3′ trote /
2′ caminar) · FC ≤143") y `distanceKm` en fase km; caché por `weekKey + runsCount`; `_generateCardioDsl` acepta
`planned.dsl` (el push a COROS lleva los bloques run/walk). Arco base con el dato real (0/4 en Z2, 1,9-5 km):
sem 1-3 run/walk 30′/40′ → 35′/50′; sem 4 base 5+6 km; deload; sem 6-8 base 15→17 km (3ª → `qualityUnlocked`);
sem 9 build largo 8 km; sem 11-13 build 19→21 km; **sem 14-16 `ready10k` → 10 km cómodo**. Coincide con el arco
de peso: el 10k llega a la vez que los 79-81 kg.

### B.5 Modelo de objetivos — `settings.goals` + `goalProgress`

```js
COACH_GOALS_DEFAULT = { version:1, source:'user',
  primary:   { type:'fat-loss', targetWeightKg:[79,81], rateKgPerWeek:0.45, waistCm:null, startWeightKg:87.1, startDate:'2026-08-19' },
  preserve:  { ffmKg:72.8, anchorLifts:['back-squat','bench-press','sumo-dl','ohp','barbell-row','chinups'] },
  secondary: { run10k:{ targetKm:10, comfortable:true, horizonWeeks:null } },
  constraints:{ daysPerWeek:null /* → idealVariant */, sessionMaxMin:75, lumbar:true, stepsFloor:8000, proteinG:185 } }
```
`ensureGoals()` en `init()` junto a `ensureDeloadAnchor` (`smartPut` en `userSettings`). `goalProgress(goals,
facts)` → `weight:{trend7d, slope (regresión sobre media 7d, 28 d), etaWeeks, status:'at-target'|'on-track'|
'slow'|'stalled'|'fast'|'insufficient'}` · `running:{longestZ2Km, weeklyKm, z2Compliance, readinessFor10k =
0,5·min(largo/8,1)+0,3·min(km/18,1)+0,2·Z2 (indicador declarado, no dosis), decouplingOk, phase}` ·
`strength:{anchors:[{id, e1rmNow (mejor 14 d), e1rm4wAgo (ventana −42..−28 d), pct, maintained: pct ≥ −5 | null}]}`
· `signals[]` para el coach (la transición de fase la decide el LLM y la aprueba Julian): `weight-at-target`
(≤81 dos lecturas), `long-run-8k`, `strength-drop` (−5 % dos semanas), `rate-too-fast` (< −0,75 kg/sem,
REC-002), `stalled-3w`, `quality-unlocked`. Reusa `nutRollingWeight` y `estimate1RM`.

### B.6 Vista Coach (`<section id="view-coach">`, back → home) y cambios en Home

**Home**: `#training-advisory` → tarjeta del coach (B.2) con `Coach ›` · `#coach-week-card` (Parte A; sólo con
`coach_reviews` `proposed`/`running`/`applied` reciente) · `#coach-readout` · `#todays-plan-card` con kg y
duración progresada. Sin cambios: `#hard-day-budget`, `#recovery-hero`, `#plan-selector`, `#week-calendar`.

**Vista Coach** (un scroll; cada sección con `try/catch` propio, patrón `renderHomeView`):
1. `#coach-week` — "Semana 3/5 · build · deload el 5-oct", readiness de hoy, **3 prioridades**.
2. `#coach-briefing` — "Qué pasó" / "Qué cambio" (de `coach_reviews[latest].output.briefing`; fallback
   `weekly_reviews[latest].coachVoice`). Es el contenido actual de `loadAndRenderWeeklyCoach`, movido.
3. `#coach-proposal` — sólo con revisión `proposed`: **diff** (`diffPlanVersions`; filas `Banca · 92,5 → 95 kg`,
   `+ Face pull (Upper B)`, `− Tricep pushdown`, `Mié Z2 · 48′ → 45′`, `Carrera · 17 → 19 km/sem`) ·
   **decisiones** (qué en negrita, por qué, cifras, `<details>` "por qué" con la regla **en castellano** vía
   `COACH_RULE_ES[ruleId]`; el id crudo sólo en `title=`) · **avisos** (rojos = duros, ámbar = blandos; ninguno
   bloquea) · `[Aplicar] [Ajustar] [Rechazar] [Regenerar con nota]`. `Ajustar` = inputs numéricos sólo para
   `target.kg` (marca `source:'user'`).
4. `#coach-goals` — Peso (media 7d · pendiente · estado · ETA) · 10k cómodo (%, largo Z2, km/sem, Z2) · Fuerza
   mantenida n/6 · señales para el coach. Sin gráficos (ya existen en Stats).
5. `#coach-decisions` — últimas 20: fecha · tipo · qué · resultado.
6. `#coach-versions` — `v14 · Coach · W37 · activa`, `v13 … [Volver a esta]`. **Rollback = nueva versión copiada**
   (`createNewPlanVersion({...old, label: old.label+' (restaurada)', meta:{author:'user', basedOn: old.id}})`)
   → se mantiene el invariante "activa = versión más alta" y funciona con código viejo. Nunca borra.

Entradas: Home `Coach ›`, `#coach-week-card`, y Stats › Today `#weekly-coach-card` (resumen de 2 líneas +
"Abrir Coach"). CSS prefijo `.coach-*` reutilizando `--accent/--yellow/--red/--teal/--text2/3/--bg2`; cero
animaciones nuevas.

### B.7 Registro de decisiones — store/tabla `decisions`

IDB `decisions` (keyPath `id`) en el mismo bump a **DB_VERSION 12** que `coach_reviews`; añadir a
`BACKUP_STORES` (app.js:10258); tabla Supabase genérica (misma migración que `coach_reviews`) y lista de sync.

```js
{ id, ts, date, weekKey, source:'coach-llm'|'rule'|'readiness'|'user',
  type:'session-readout'|'readiness-adjust'|'plan-apply'|'plan-adjust'|'plan-reject'|'plan-rollback'|'deload-request'|'running-week'|'goal-update'|'target-override',
  what, why, ruleIds[], evidence:{...cifras}, ref:{workoutId?, planVersion?, sessionId?, exerciseId?}, outcome:'accepted'|'declined'|'done'|null }
```
`logDecision(d)` → `smartPut` + `pruneDecisions()` (tope 500 local; la nube conserva). **Un registro por
sesión** (`session-readout` con `evidence.perExercise`), no por set. El facts pack lee las últimas 30 +
`workouts` (con `target`, `readinessAtStart`, `adjusted`) → "te propuse 95 en banca, hiciste 92,5×8/8/7; te
propuse quitar el box jump el jueves, lo hiciste igual".

### B.8 Tests de la parte B (todos antes del motor)

| Test | El fallo que impide | Fixtures clave |
|---|---|---|
| `verify-set-target.mjs` | progresión que vuelve a ser texto; progresar en deload o tras pausa; cm como kg; par DB 21,25 | los 8 del audit: (a) 3×8@7 → 92,5→95 rule · (b) 3×8@9 → hold · (c) 8/8/6 → repetir; 6/6/6 → −2,5 · (d) coach vigente → 95 coach · (e) coach vencido → regla · (f) deload 92,5 → **83,75** rpe 5-6 · (g) 30 d → last "pausa" · (h) sin historial → null/none. Extra: DB 12,5→15; DB 11→12,5; DB 40→42,5; chins 0 kg 4×8 → +2,5; ab-wheel → null; '8-10/side'; box-jump → none; AMRAP → last; face-pull +1,25; sin RPE al tope → progresa "(sin RPE)"; `parseCoachTarget('95 kg × 5-8'|'BW+2,5'|'20 kg/DB')` |
| `verify-readiness-trend.mjs` | una noche mala sola da rojo; WHOOP de ayer cuenta como hoy; HRV de un día decide | 35 días sintéticos (HRV 71 / RHR 49 / 7,2 h): normal → green/high · sólo HRV −13 % → yellow · +RHR +6 → red sin deloadHint · +RPE 9,2/9,0 → deloadHint · WHOOP rojo de ayer sin hoy → `unknown` · 10 días → low · WHOOP amarillo solo → yellow · 1 noche 4 h con 7d 7,0 h → no dispara |
| `verify-advisory-matrix.mjs` | `fullA`+rojo sin recovery (F-7); `unknown` degrada; matriz v1 rota | tabla [planned, readiness] → mode incl. `fullA` + red → recovery, red×hard+hybrid → alts `.hybrid` |
| `verify-session-adjust.mjs` | un ajuste toca kg, quita compuestos o deja el box jump en amarillo | lowerA+yellow → drop `box-jump`,`calf-raise`, RPE ≤7, squat 4 sets, kg intactos · upperA+red → compuestos+core, setDelta −1 mín 2 · long_easy 50′+yellow → 40′ · `changes[]` con why/ruleIds · no muta `planned` |
| `verify-block-week.mjs` | semanas 1-4 iguales; progresa en deload/viaje/pausa; sin techo | ancla W30: W30→1 … W34→deload, W35→1; W29 → null · 40′: 40/45/50/55/30 · finisher 20/22/24/26/14 · variante 0 → base · 15 d sin cardio → base · coachMin 45 → coach · migración `deloadAnchorWeek` → `deloadAnchorDate` |
| `verify-running-week.mjs` | km a quien corre fuera de Z2; intervalos sin base; largo >50 % | fixture real 1,9/3,2/5,0/4,1 km @152/149/155/147 → `run_walk` por minutos con `pattern`+`dsl Nx` · base 2/3 Z2, 12 km → 13,5, largo 6,5 · deload → 8,5 · baseWeeks 3 → `qualityUnlocked` sin type duro · largo 8,2 Z2 + decoupling 4,1 + 19 km → `ready10k`; sin decoupling → null |
| `verify-goal-progress.mjs` | ETA inventado sin pendiente; "mantenida" sin ventana; tasa rápida pasa | 87,1→85,4 en 28 d → slope ≈ −0,42 on-track, eta 10-11 · plano 21 d → stalled · −0,9 → fast + `rate-too-fast` · 5 pesadas → insufficient · banca 112→108 maintained · sumo sin ventana → null · 2 checks −6 % → `strength-drop` |
| `verify-session-classification.mjs` | F-7: `fullA/hybrid1/travelA` caen al regex | recorre `PLAN.sessions` y `planRef` del IDEAL: ninguno usa fallback (espía `console.warn`); `fullA→full bw 2`, `hybrid1→hybrid`, `travelA→1.5` |
| `verify-coach-ui-wiring.mjs` | la tarjeta pierde el objetivo; reaparece "Push hard"; finish no guarda snapshot; la caché no sube | grep: `buildExerciseCard` con `coach-objective` y sin `generateCoachNote(`; sin `Push hard`; `finishWorkout` con `readinessAtStart`, `adjusted`, `.target =`; `computeTrainingAdvisory` llama `computeReadiness(`/`adjustSessionForReadiness(`; `getPlannedSessionForDate` llama `progressCardioMin(`; `captureWorkoutState` guarda `adjustments`; DOM stub: target 92,5 → `Objetivo:`+`92,5`+`placeholder="92.5"`; sin target → HTML idéntico al de hoy; `index.html` con `view-coach`, `coach-readout`, `readiness-signals`, tres scripts antes de `app.js`; `sw.js CACHE_NAME` == versión |

Además: `verify-workout-unit.mjs` (firma de `buildExerciseCard`) y `verify-free-session.mjs` siguen verdes (la
sesión libre no aplica deload ni ajustes).

### B.9 NO hacer (parte B)

No convertir color/score en kg/series/minutos (READ-003) · no progresar en deload, tras >21 días, en ejercicios
de medida ni con reps no numéricas · no escribir `target.source:'rule'` en `plans` · no inventar datos
(`decoupling` ausente → null; WHOOP sin fila de hoy → unknown; <14 días → low) · no bloquear (ningún botón
deshabilitado; el hero arranca siempre la planificada) · no Rule IDs crudos en pantalla · no gráficos nuevos
ni 6ª pestaña · no tocar `IDEAL_BLOCK_V1.durationMin`, pesos de `SESSION_TYPES`, tolerancias de
`_runsAreSameActivity`, ni `getRecoveryColor` (67/34) · no borrar "Last: …" ni el store `weekly_reviews`.

## Parte C · Lógica de coaching cut → 10k (lo que el coach decide y cómo lo dice)

Esta parte es **contenido**, no código: alimenta el system prompt del coach (A.5), los guardarraíles
(A.6), la regla de progresión (B) y la primera propuesta que Julian aprobará. Todo trazado a Rule IDs de
`research/evidence-to-rules.md`; donde el corpus es `expert`/`weak_extrapolated` se dice.

### C.1 Macroplan W37 → W03-2027 (4 bloques × 5 semanas; 4 build + 1 deload = diet break)

Anclado a **fecha** (`deloadAnchorDate` = lunes 2026-09-07). La grasa manda en los 4 bloques (decisión
del usuario); la base aeróbica progresa en paralelo a carga moderada (GEN-001 es heurística de presupuesto,
no interferencia); la fuerza **se mantiene** (STR-001: mantener en déficit es progreso). Corrección honesta
a `goals.md`: las "14 semanas" no contaban los 3 diet breaks → **81 kg en W52-W53, 80 kg en W02-W03**.

| | **B1 Reentrada y base** W37-41 | **B2 Base aeróbica** W42-46 | **B3 Largo hacia 10 km** W47-51 | **B4 Consolidación** W52-W03 |
|---|---|---|---|---|
| Dominante | Déficit + hábito (3-4 fuerza, pasos 8.000, báscula diaria). Correr: **cumplir Z2**, no volumen | Déficit + volumen de carrera | Déficit + largo hasta 10 km | Cierre del déficit o transición a mantenimiento; 10k consolidado |
| Fuerza | Plan vivo sin añadir nada (STR-003 10-14): pecho 10 · espalda 14 · cuádriceps 13 · bisagra 7-10 · OHP 4 · core 3/3/3. Cargas ancladas al último dato | Igual; 2 semanas amarillas → −1 serie/accesorio | Igual o −2 series/músculo si el largo degrada el jueves; opcional top set 3-5 + back-off | +2 series/músculo sólo con calorías a mantenimiento |
| Running | Mié 30-40' **run/walk por FC** (END-006) · Sáb 35→50' run/walk · finisher Mar/Vie 20' cinta run/walk, Lun/Jue bici/ski (INT-002) | Mié 5-5,5 km Z2 · Sáb 6→7,5 km | Mié 5-6 km · Sáb 8→**10 km (test W50)** | Mié 5-6 · Sáb 10 km Z2 o ≤1 dura si criterios |
| km/sem | ~11→15,5 (por tiempo) · deload ~7 | 16→18 · deload 9 | 19→20,5 · deload 9 | 20-24 |
| Ramp | +5'/sem en el largo | +0,5 km/sem (~7-8%); END-003 (10%) es tope prudente **no validado** (Buist) | igual | sin ramp |
| Duras cardio | **0** | **0** | **0** | ≤1/sem (END-004), sábado, nunca <24 h antes de pierna |
| Híbrido trineo+SkiErg | sólo sábado de deload, formato A (HYB-001 `weak`) | ≤1/bloque | ≤1/bloque | ≤1/sem alternando con la dura |
| Plyo | Lower A primero, fresco: pogos 2×20 + box jump 3×5 = 55 contactos; progresa **altura** +5 cm, no volumen; sólo verde/amarillo | igual | igual | igual |
| Movilidad | **forma mínima que ocurra**: 5-8' al final de Lower A/B con el temporizador + Dom 15' con la cintura; éxito = ≥2 registradas/sem | si B1 cumplió → 10' | igual | igual |
| Nutrición | 2.700/2.400 · proteína 185 · primer ajuste 24-sep · CHO por tipo de día (REC-007) | + día de largo ≥8 km: **2.700 + 90×(km−6)** para EA ≥30 (REC-008) | igual | reverse diet +150-200/2 sem al llegar a 80-81 |
| Diet break (deload) | mantenimiento ≈ 3.000/2.700; esperar +0,5-1 kg transitorio; esa semana + 5 días **no cuentan** para la pendiente | igual | W51 = 14-20 dic | Navidad **planificada como mantenimiento** |
| Peso proyectado | ~85,3 al cierre | ~83,5 · Tanita W45 | ~81,7 | 81 W52-53 · 80 W02-03 |

**Transiciones (se evalúan en semana 4):** B1→B2: ≥3 fuerza/sem en 3 de 4 · pendiente −0,30…−0,70 o
cintura −1 cm/2 sem · ≥2 carreras/sem y ≥75% con FC media ≤143 · trap bar ≥110×5 @≤8 sin lumbar · 0 semanas
rojas · movilidad ≥2/sem en 2 semanas (si falla (c) → B2 sigue en run/walk sin km). B2→B3: largo ≥7,5 km
Z2 con deriva FC <5 bpm · km ≥17 dos semanas · e1RM anchors ±5% · HRV 7d ≥ −5%. B3→B4: 10 km Z2 o largo ≥9 ·
peso ≤82.

**"10k cómodo"** = 10 km continuos, FC media ≤143, deriva 2ª mitad <5 bpm (o decoupling <5% cuando exista
— END-005 `expert`), RPE ≤5, sin dolor, RHR al día siguiente ≤ +3. Primer intento **W50** si adherencia
≥80% y sin rojas; **lo probable es W02-W04 de 2027**, ya a mantenimiento. ~70-75' al ritmo Z2 actual;
a 81 kg el ritmo a FC fija mejora 20-30 s/km sólo por peso (inferencia, n=2).

**Cuando chocan, cede en este orden:** (1) el ramp de carrera se congela; (2) sale el híbrido; (3)
accesorios −1 serie; (4) el déficit se afloja +150 sólo con EA <30 o síntomas LEA 2 semanas o caída de
fuerza 2 sesiones. **Nunca ceden:** proteína 185, heavy slot de los 6 anchors, sueño.

### C.2 Procedimiento semanal del coach (orden estricto → contenido del system prompt)

0. **Posición en el bloque** (`blockWeek`): deload = nada progresa. Se imprime "Semana 3/5 del bloque 1".
1. **Suficiencia de datos** (gates; sin señal → se dice "no hay señal", nunca se rellena): peso ≥4
   medidas/7 d para tendencia, ≥10/14 para ajustar kcal, ventana sin diet break, fecha ≥24-sep, ≥14 d desde
   el último ajuste · nutrición ≥10/14 registrados o manda la báscula · carreras ≥1 con FC, 0 → sin ramp ·
   lift ≥1 exposición en 14 d para mover objetivo, ≥21 d → reentrada · wellness ≥5/7 días y último dato hoy
   o ayer (F-6) · cintura ≥2 medidas ≥7 d, cambio ≥1 cm/2 sem.
2. **Estado de recuperación** (7d vs 28d propio, READ-001/002/004/008): HRV ≤ −10% · RHR ≥ +5 bpm (baseline
   44-47 → ≥50) · sueño <6,5 h o ≥3 noches <6 h · readiness ≥3/7 días amarillo/rojo o −10 pts · rendimiento
   −2 reps a misma carga 2 sesiones o RPE ≥9 en anchor · dolor lumbar/articular = **override a rojo**.
   Verde 0-1 · Amarillo 2 · Rojo ≥3 (o 2 con rendimiento, o dolor). Acción: verde → arco; amarillo →
   congelar ramp, mantener kg, quitar híbrido; rojo → semana tipo deload y **mirar sueño antes de llamarlo
   deload** (READ-006). Evento puntual (los 3 desplomes con ATL <18 y sueño <5 h) → cambia el **día**
   (READ-007), no la semana (READ-002).
3. **Adherencia**: ≥75% fuerza + ≥2 carreras 4 sem → ramp permitido; 50-75% → mantener; <50% →
   **simplificar** (bajar variante), nunca añadir. Ejercicio `done=false` en 2 de 3 → **reordenar antes o
   quitar**, no recordar. >75' con saltos → recortar; <45' con saltos → es tiempo, reordenar.
4. **Progresión de fuerza por lift** (doble progresión = regla de `generateCoachNote` hecha determinista):
   tope de reps y RPE ≤ objetivo → +2,5 barra / +1,25 accesorio / siguiente par DB / chins +2,5 · tope
   pero RPE >8,5 → mismo kg · no llega al mínimo → −2,5 o repetir · en medio → +1 rep · reentrada (≥21 d)
   → serie 1 decide, semanas 1-3 hasta +10%/sem si serie 1 ≤RPE 6, luego +2,5 · bisagra desde el suelo →
   serie 1 ≥RPE 8 congela la semana (LOAD-003). **Casos vivos:** squat 105 hasta ×8 (no 107,5); banca 95
   hasta 4×8 @≤7,5 con **≤2 exposiciones de press/sem** (W35 fue frecuencia, no carga); OHP 55 hasta 4×8;
   trap bar 100 → gate. Cambio de ejercicio: stall 3 sem → accesorio swap **en semana 1 de bloque**
   (STR-010), anchor **nunca** por stall (cambia el esquema); dolor → sustituto lumbar ya; saltado 2/3 →
   reordenar/quitar ya; sustitución sostenida 3 sem por el usuario → permanente.
5. **Carrera**: Z2 cumplida = FC media ≤143 **y** (máx ≤155 o ≤10% del tiempo sobre Z2). Salir de run/walk
   con 2 carreras seguidas ≥30' FC media ≤140 y ≤10% caminando (END-006). Ramp sólo verde/amarillo-1 +
   adherencia ≥75% + 2 últimas en Z2: largo +5' (B1) / +0,5 km (B2-3); total ≤ +10% blando, +20% duro.
   Dura sólo si ≥6 sem con ≥2 carreras, 4 últimas Z2, largo ≥8 km deriva <5, e1RM ±5%, verde 2 sem,
   **déficit cerrado o en banda**; máx 1, sábado. Calor jun-sep: no leer progreso del ritmo (ENV-001).
6. **Piloto del déficit** (cada 2 sem, pendiente media 7d): > −0,30 → −200, **pero** si cintura −1 cm/2 sem
   → no tocar; si registro <10/14 → adherencia primero; primera palanca = pasos 8.000 → 9-10.000 (REC-009)
   · −0,30…−0,70 → nada · < −0,70 → +150 (REC-002) · 2 de [sueño, libido, ánimo, enfermedad] 2 sem → diet
   break adelantado + volumen −30% (REC-008). Suelos: entreno ≥2.500, descanso ≥2.300. Semana 1 del déficit
   (−0,8…−1,2 kg de agua) **no es señal**.
7. **Deload/diet break**: calendario manda; reactivo (LOAD-004 + READ-008) sólo si rendimiento cae 2
   sesiones **y** ≥2 señales; sueño <6,5 h → sueño primero; sólo rendimiento con verde → buscar causa
   (frecuencia de press, kcal, técnica); deload de calendario a ≤1 sem → adelantarlo. Prescripción: series
   50%, RPE 5-6, kg 85-90%, sin box jump, carrera −30-40%, kcal a mantenimiento, proteína igual.
8. **Colocación** (INT-001/002/004, HYB-002): Lun Lower A (plyo primero) + finisher bici/ski · Mar Upper A +
   cinta run/walk · Mié Z2 correr (fácil permitido <24 h antes de pierna, duro no) · Jue Lower B + bici/ski
   (nada de remo tras bisagra) · Vie Upper B + cinta · Sáb largo (o híbrido A en deload; o dura en B4;
   **nunca ambos la misma semana**) · Dom movilidad + cintura. Duros = 2 lower + ≤1 (BUD-001, informativo).
9. **Lo que NUNCA hace**: añadir series/sesiones en déficit sin adherencia ≥75% **y** verde **y** nutrición
   ≥10/14 · progresar en deload · rotar un anchor por variedad/stall · actuar sobre 1 señal/1 día · dosis
   desde % Whoop · inventar números (todo kg/km viene de un dato o va marcado "ajustar por RPE, sin dato") ·
   >1 dura/sem o dura/híbrido <24 h antes de pierna · saltos >10%/sem, ramp >20% · separar diet break y
   deload · bajar proteína de 185 o kcal de 2.500/2.300 · plyo tras cardio · CTL/ATL como carga total o
   "wellness > RPE" para fuerza (F-3) · progreso aeróbico por ritmo en verano · >3 prioridades · >2-3
   accesorios por frontera.

### C.3 Guardarraíles (alimentan A.6 y el prompt) — reconciliación con "avisar, nunca bloquear"

Dos niveles, y la regla del usuario se respeta así: los **duros** restringen **al coach**, no al usuario —
si la propuesta del modelo viola uno, la edge function le pide **una** regeneración con el aviso; si
persiste, la app lo muestra en **rojo** y Julian puede aplicar igual. Los **blandos** son chips ámbar.

**Duros (G-H):** H1 salto de carga >+10% vs último top set (STR-001, LOAD-001) · H2 kg sin dato de origen ni
marca `porRPE` (GEN-002) · H3 deload con cualquier target/km/dura/box-jump ↑ (LOAD-004) · H4 >1 dura de
cardio (END-004, BUD-001) · H5 dura/híbrido <24 h antes de lower (INT-001, HYB-002) · H6 anchor sustituido
fuera de {trap bar↔sumo, chest-supported↔barbell row con flag lumbar} (STR-010, LOAD-003) · H7 >14
series/músculo en déficit o total > sem anterior +10% sin [adh ≥75, verde, nutr ≥10/14] (STR-003, STR-001)
· H8 km/sem > máx 4 sem × 1,2 (END-003, LOAD-001) · H9 proteína <185, entreno <2.500, descanso <2.300
(REC-001, REC-008) · H10 deload sin mantenimiento o viceversa (REC-005) · H11 plyo fuera de lowerA/no
primero/>80 contactos (ATH-001, INT-004) · H12 semana sin anti-rotación **y** anti-extensión (ATH-003) ·
H13 <2 sesiones de fuerza (LONG-002) · H14 decisión con `ruleIds` o `numbers` vacíos (ethos).

**Blandos (G-S):** S1 km +10-20% ("por encima del 10% orientativo, heurístico no validado") · S2 movilidad
<2 slots (ATH-006) · S3 >2 exposiciones de press/sem (STR-002; "en W35 fueron 5 en 10 días y la banca cayó")
· S4 sesión >75' · S5 híbrido + largo que sube · S6 target con n=1 o >21 d · S7 recuperación con <5 días ·
S8 pendiente de peso con <10/14, ventana con diet break, <14 d desde ajuste o antes del 24-sep · S9 budget
>6 (informativo) · S10 progreso aeróbico por ritmo jun-sep (ENV-001) · S11 techo Z2 ≠ `icuZones` · S12 >3
prioridades, >3 swaps, swap fuera de semana 1 · S13 decisión de fuerza/deload basada en ctl/atl/rampRate.

Textos en castellano por ID en el diseño C (se copian tal cual al implementar `validatePlanVersion`).

### C.4 Hechos que el facts pack debe calcular (completa A.4)

`form = ctl − atl` y `rampRate` = ΔCTL/sem etiquetados **"sólo cardio"** · **carga interna semanal propia**
Σ budgetWeight + Σ(duración×RPE) de fuerza, ordinal · **exposiciones de press/semana** y series/músculo
hechas vs prescritas (detecta el W35) · por anomalía de recuperación: sueño de esa noche, alcohol (g) y
carga del día anterior · peso: n medidas 7/14 d, pendiente sólo en días de déficit, días desde diet break,
**fecha del próximo ajuste elegible** · cintura últimas 3 + delta 2 sem · EA por día **cerrado** · pasos
sin convertir a kcal · carreras con tiempo en zona (`icu_hr_zone_times`) y **deriva de FC** 2ª vs 1ª mitad
desde streams (o "no disponible") · staleness por fuente (>2 días → "dato viejo") · **ledger de decisiones**
`{id, date, claim, test, reviewOn, ruleIds}` para el "te dije X".

### C.5 Rotación por patrón (para `EXERCISE_ALTERNATIVES` y el prompt)

Anchors fijos: back squat · hinge desde el suelo (hoy trap bar; sumo vuelve con trap bar ≥111×6 y 2 bloques
sin flag lumbar) · bench · OHP · barbell row · chin-up lastrado. Accesorios rotan sólo en semana 1 de
bloque, ≤3, con motivo. Sustitutos lumbar-friendly cualquier semana: hack/leg press por squat; glute drive
+ leg curl por trap bar; leg curl + back extension por RDL; chest-supported row por barbell row; landmine
por OHP si hombro. Core: ≥1 anti-rotación (Pallof/suitcase carry) y ≥1 anti-extensión (ab wheel/plancha)
**siempre**; flexión (hanging leg raise) opcional y primero en Upper B. Cardio: finisher cinta en upper,
bici/ski en lower; remo nunca tras bisagra; híbrido A sólo en deload.

### C.6 Plantilla del briefing (la "opinión" operativa)

```
## Qué pasó (semana {W}, {n} días de datos)     ← 2-4 frases con números; n siempre
## Qué cambio — máx 3 prioridades                ← **{cambio}** — {número}; "todo lo demás se mantiene"
## Por qué                                        ← dato → decisión; si la regla es expert/weak: "es práctica, no evidencia fuerte"
## Decisiones anteriores                          ← "Te dije X el {fecha}. Los datos dicen Y ({n}). Retiro / mantengo / ajusto."
## Qué vigilo esta semana                         ← 2-3 señales con umbral
## Qué necesito de ti (≤3)                        ← acciones concretas
```

Reglas de honestidad: tamaño de muestra siempre · grado de evidencia cuando la regla es
`expert`/`weak_extrapolated` (GEN-001, STR-010, REC-005, HYB-*, END-005/006, READ-003/007/008, SEL-002) ·
"no hay señal" cuando falla un gate · medido vs modelado vs estimado (báscula / TDEE / e1RM / EA) · ritmo
en verano no es progreso · wearable vs rendimiento+subjetivo → gana lo segundo (READ-005) · mantener en
déficit **se llama progreso** · sin fechas sin condición ("81 kg en Navidad **si** la pendiente aguanta").
Cada decisión guarda `{id, date, claim, test, reviewOn, ruleIds}`; al vencer `reviewOn` el briefing la
revisa explícitamente (como W36 hizo con el recorte de Lower A).

## Reconciliaciones entre A, B y C (decisiones finales donde diferían)

| Tema | Decisión final |
|---|---|
| Módulos | Tres: `coach-engine.js` (puro diario), `coach-facts.js` (puro semanal), `coach.js` (orquestación + renderers nuevos). Modificaciones a renderers existentes en `app.js`. |
| Plan activo | **Sigue siendo la versión más alta** (`loadActivePlan`, app.js:985, sin cambios de criterio). Las propuestas viven en `coach_reviews`, nunca en `plans`. `status/author/…` en `plans` son metadatos (`createNewPlanVersion` acepta `meta` y lo esparce). |
| Rollback | **Nueva versión copiada** ("(restaurada)", `basedOn`), no re-activar filas viejas: mantiene el invariante y funciona con código viejo. |
| Banner de propuesta | Lee `coach_reviews` con `status:'proposed'` (no `plans`). |
| Vigencia del target del coach | `activePlan.weekKey` ∈ {semana ISO actual, anterior}; fallback `createdAt` ≤ 14 d. |
| Guardarraíles | `validatePlanVersion` devuelve `level:'hard'|'warn'`. **Duros restringen al coach**: la edge function re-pide una vez al modelo con el aviso; si persiste, la app lo pinta en rojo y Julian puede aplicar igual. Blandos = chips ámbar. Nada bloquea al usuario. |
| Ancla del bloque | Migrar a `deloadAnchorDate` (Change 10a) en el incremento 2; el valor **2026-09-07** lo fija la primera propuesta del coach (C.1) con aprobación de Julian. |
| DB_VERSION | Un solo bump a **12** con `coach_reviews` + `decisions`; tablas Supabase creadas **antes** (regla de `db-schema-state.md`). |
| Deload en planes del coach | `startWorkout`: `deload = author==='coach-llm' ? false : isDeloadWeek(...)`; el plan del coach ya trae el volumen de deload. |
| Markdown en `tracking/` | Opcional, vía comando manual `/coach-deep-dive` (lee `coach_reviews` por MCP; no escribe `plans` ni intervals.icu). Sin service-role key en GitHub Actions. |

## Incrementos y orden (cada uno = tests → código → `CACHE_NAME` + versión en `index.html` → push)

| # | Versión | Contenido | Depende | Esfuerzo | Riesgo |
|---|---|---|---|---|---|
| 1 | v11.55 | **Cimientos de datos.** Audit Change 1 (`enqueueSync` gatea por `SUPABASE_URL && SUPABASE_ANON_KEY`, `supabase-sync.js:188`). DB_VERSION 12: stores `coach_reviews` (keyPath `id`) y `decisions` (keyPath `id`); dos tablas Supabase genéricas + RLS + índice `(user_id, updated_at)` (migraciones en `supabase/migrations/`); ambas en `stores` de `syncAll` (:347) y `decisions` en `BACKUP_STORES`. `createNewPlanVersion(modifications)` esparce `modifications.meta`. `ensureGoals()` + `COACH_GOALS_DEFAULT`. `logDecision`/`pruneDecisions`. Tests: `verify-sync-enqueue.mjs` (nuevo), `verify-sync-writes.mjs` (14 stores), `verify-coach-wiring.mjs` parte 0. Docs: `db-schema-state.md`. | — | 1 d | bajo (probar que el iPhone abre tras el bump) |
| 2 | v11.56 | **Bloque + cardio** (Change 11 + 10a). `app/coach-engine.js` con `blockWeekFromAnchor`, `progressCardioMin`; `deloadAnchorDate` + migración desde `deloadAnchorWeek`; `isDeloadWeek` delega en `blockWeek()`; rama `run`/`z2FinisherMin` de `getPlannedSessionForDate`; "Semana N/5" en Home, Ideal y Cardio. Test `verify-block-week.mjs`. | 1 | 0,5-1 d | bajo-medio (verificar duración en el evento de intervals.icu) |
| 3 | v11.57 | **Progresión** (Change 7). `suggestSetTarget`, helpers, `parseCoachTarget` (legacy), `sessionReadout`; `computeSessionTargets`; `buildExerciseCard` con Objetivo/chip/placeholder/aceptar-con-check; **borrar `generateCoachNote`**; Home kg por ejercicio; `finishWorkout` snapshot + `readout` + `logDecision('session-readout')`; `#coach-readout`. Tests: `verify-set-target.mjs` (**primero**), `verify-coach-ui-wiring.mjs` parte 1, `verify-workout-unit.mjs` actualizado. | 1, 2 | 1,5-2 d | **alto** (pantalla más usada) → checklist iPhone completo |
| 4 | v11.58 | **Clasificación + dato de hoy fresco** (Changes 3+5 + B.2.b). `toSession` por lookup en `IDEAL_BLOCK_V1` (+ mapa `free`/legacy; regex sólo fallback con `console.warn`). `whoopFetchTodayRecovery()` en `whoop.js` (WHOOP directo para **hoy**, intervals.icu para el histórico), fecha en local, caché por día; `getWhoopContext` date-checked con `source`/`fetchedAt`; `renderRecoveryHero` muestra la fecha del dato. Verificar/reconectar WHOOP OAuth en Ajustes. Tests `verify-session-classification.mjs`, `verify-advisory-matrix.mjs` (v1 + casos de frescura). | — | 1 d | bajo-medio (depende de que la app OAuth de WHOOP siga viva) |
| 5 | v11.59 | **Readiness** (Change 6 + READ-007 + check-in). `computeReadinessFrom` (sólo hoy; tendencias hasta ayer; `sleepSelf`/`feelSelf`), `adjustSessionForReadiness`, `_coachTrimAccessories`; `computeReadiness` con caché invalidada al llegar el dato de hoy; advisory reescrito con `[Hacer la ajustada]/[Hacer la planificada]` + check-in de 2 toques cuando falta el dato; `startWorkout(id, {adjustments})`; capture/restore; `readinessAtStart`/`adjusted` en el registro; `renderReadinessSignals` (fuera `renderFatigueScore`); `checkDeloadNeeded` con `deloadHint`. Tests `verify-readiness-trend.mjs`, `verify-session-adjust.mjs`, matriz completa. | 3, 4 | 2-2,5 d | **medio-alto** (Home + workout + Stats) |
| 6 | v11.60 | **Carrera hacia 10k + objetivos.** `suggestRunningWeek` + DSL run/walk (`_generateCardioDsl` acepta `planned.dsl`), rama `run` con fallback, banner Cardio; `goalProgress` + tarjeta "Objetivos" (en Stats hasta que exista la vista Coach). Tests `verify-running-week.mjs`, `verify-goal-progress.mjs`. | 2, 5 | 1-1,5 d | bajo |
| 7 | v11.61 | **Facts pack + validador + corpus.** `app/coach-facts.js`: `buildCoachFacts`, `isoWeekKey`, `stableStringify`, `validatePlanVersion` (hard/warn con los textos de C.3), `diffPlanVersions`, `mergeProposal`. `scripts/build-rules-compact.mjs` → `rules-compact.json`. Settings: "Exportar facts JSON" (copiar al portapapeles) para inspeccionar el pack en el iPhone **antes de gastar un céntimo**. Tests `verify-coach-facts.mjs`, `verify-plan-validator.mjs`, `verify-rules-compact.mjs`. Cero cambio visible, cero coste. | 1-6 | 1,5-2 d | bajo |
| 8 | (sin versión app) | **Edge function `coach-weekly-review`** + `config.toml` + deploy. Correr en `mode:'sync'` con un pack real exportado; iterar el prompt 2-3 veces sobre calidad (¿cita números? ¿respeta `dataGaps`? ¿3 prioridades?); medir `usage`/latencia; verificar el tope wall-clock del plan Supabase; pasar a `async`. | 7 | 1,5-2 d | medio (calidad del prompt; coste ~$0,50-0,70/run) |
| 9 | v11.62 | **Vista Coach + aprobación.** `app/coach.js`: `maybeRunWeeklyCoach` (lunes/primer uso de la semana), polling, `#coach-week-card`, `applyCoachProposal`, `rollbackPlanVersion`, `view-coach` (semana, briefing, propuesta con diff/decisiones/avisos, objetivos, decisiones, versiones), `COACH_RULE_ES`, Stats resumen + "Abrir Coach". `applyIdealPlan` gate por `author`; `setIdealVariant` "variante = calendario, coach = contenido"; `startWorkout` deload flag; `suggestSetTarget` lee `target` v2; `pushRunningPlanToIntervalsIcu` desde `activePlan.running` con fechas por `weekKey`; **borrar `fetchLatestWeeklyReview`**. Tests `verify-coach-wiring.mjs` parte 2, `verify-plan-v2-compat.mjs`. | 8 | 2-2,5 d | medio |
| 10 | v11.63 | **Retiro + docs + primera propuesta.** Desprogramar el cron; `weekly-review-auto.md` → `coach-deep-dive.md` (manual, sólo prosa). `engines.md` cabecera "3 motores + 7 decisiones de diseño". Nuevo `docs/architecture/plan-v2-schema.md`. `nutrition-notes.md`: kcal del día de largo, exclusión del diet break, suelos 2.500/2.300, pasos antes de recortar (C.1). `plans/training-plan.md`/`running-plan.md`: apuntar al plan vivo. **Primera propuesta del coach** (B1 de C.1, ancla 2026-09-07) generada por la edge function y aprobada por Julian en la app. Follow-ups P1 del audit que quedan: Change 8 (lecturas dedupeadas), Change 9 (nutrición recompute/EA). | 9 | 1 d | bajo |

**Total ≈ 13-16 días de trabajo efectivo**, en ~10 despliegues. Los incrementos 1-6 ya convierten la plantilla
en un plan que progresa (kg del set, cardio por semana de bloque, readiness que ajusta, carrera run/walk→10k)
**sin el LLM**; 7-10 añaden el coach que opina y reescribe la semana. Durante 1-8 (2-3 semanas), el
`/weekly-review` manual puede seguir escribiendo `latest.json` para la tarjeta legacy de Stats.

**Riesgo principal y cómo se acota:** los incrementos 3 y 5 tocan la pantalla de entreno. Cada uno cierra con una
sesión real completa en el iPhone (checklist abajo) antes de dar por hecho el push.

## Verificación

**Automática** (desde la raíz, `node tests/verify-X.mjs`; todos deben pasar antes de cada push): los 10 tests
existentes + los nuevos por incremento (`verify-sync-enqueue`, `verify-block-week`, `verify-set-target`,
`verify-coach-ui-wiring`, `verify-session-classification`, `verify-advisory-matrix`, `verify-readiness-trend`,
`verify-session-adjust`, `verify-running-week`, `verify-goal-progress`, `verify-coach-facts`,
`verify-plan-validator`, `verify-rules-compact`, `verify-plan-v2-compat`). Cada test abre con "el fallo que
este test existe para impedir".

**Edge function** (incremento 8): `supabase functions deploy coach-weekly-review`; POST con el pack real
exportado en `mode:'sync'`; comprobar `stop_reason`, `parsed_output` no nulo, saneado (≤6 sesiones, ≤10
ejercicios, 3 prioridades, ids ∈ allowed), `validatePlanVersion` sin duros, `usage.costUsd` ≈ 0,5-0,7,
latencia < tope del plan; la fila `coach_reviews` visible desde la PWA por RLS.

**Manual en iPhone** (sesión real completa tras los incrementos 3 y 5; repetir lo aplicable tras 9):
1. Upper A: cada ejercicio muestra **una** línea "Objetivo" con chip; box jump (Lower A) sin kg.
2. Placeholder de los sets = kg objetivo; "Last: …" y "Est. 1RM" siguen.
3. Marcar un set sin escribir peso → queda el objetivo; con peso escrito → no lo pisa.
4. KG↔LB en sesión: objetivo y placeholder se recalculan (`verify-workout-unit` verde).
5. Swap de ejercicio → objetivo del sustituto (su historial, no el del original).
6. Quick mode ON/OFF → series recortadas como antes; objetivo igual.
7. Deload forzado: ×0,9, "RPE 5-6", series a la mitad, header "(Deload)".
8. Sesión libre: sin ajustes ni deload; objetivos desde cualquier sesión previa.
9. Cerrar la app a mitad y reabrir → resume repone sets, ajustes y objetivos.
10. Finish → Home, toast PR, "Lectura del coach" con ✕; no reaparece tras cerrarla.
11. Home amarillo: los dos botones arrancan; la ajustada sin box jump/gemelo y "RPE ≤7"; `adjusted` correcto.
12. Rojo + Lower: "Registrar la alternativa" crea la `session`; "Hacer la planificada igual" arranca completa.
13. Cardio miércoles: duración progresada en Home, Cardio y en el evento que llega a COROS (abrir intervals.icu).
14. Stats › Today: señales con el mismo color que Home; banner de deload sólo con `deloadHint`.
15. Tras DB v12: la app abre en frío, el backup JSON incluye `decisions`, `sync_queue` drena.
15b. **Mañana temprano** (antes de que intervals.icu tenga el día): la tarjeta dice "Sin dato de hoy" o
    "WHOOP 07:42" según haya ruta directa; **nunca** pinta el score de ayer como hoy; el check-in aparece
    sólo si falta el dato; al reabrir a mediodía, el dato de hoy ya está y la tarjeta cambió sola.
16. (Inc 9) Lunes: tarjeta "El coach está revisando…" → propuesta con diff y avisos → Aplicar → la tarjeta del
    ejercicio muestra el kg del coach con chip "coach"; Deshacer restaura la versión anterior como nueva versión.

## Lo que queda para Julian (decisiones ya tomadas y las que vendrán en la app)

- Tomadas hoy: coach dentro de la app (edge function), aprobación con un toque, la grasa manda sobre el 10k.
- Vendrán como **propuestas en la app**, no como código: re-anclar el bloque al 7-sep; el macroplan B1-B4 de
  C.1 (con la corrección honesta: 81 kg en Navidad, 80 kg en enero, 10k probable en W02-W04 de 2027); y cada
  lunes el plan de la semana.
- Si en 3-4 semanas confía en el coach, puede pasar `coachAutoApply` a `auto-if-clean` desde Ajustes.
