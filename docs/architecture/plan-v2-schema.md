# El plan como dato — esquema v2, `coach_reviews`, `decisions` y el flujo de aprobación

Creado el **2026-09-07** (incremento 10 de [`coach-v2-implementation-plan.md`](coach-v2-implementation-plan.md),
§A.2 · §A.6 · §A.7 · §A.8). Es el contrato entre tres piezas que escriben y leen el mismo documento: la
app diaria, el coach semanal (edge function) y Julian aprobando con un toque.

Documentos hermanos: [`coach-facts-schema.md`](coach-facts-schema.md) (el pack de hechos que ve el
modelo, `validatePlanVersion`, `diffPlanVersions`, `mergeProposal`) y
[`db-schema-state.md`](db-schema-state.md) (stores, tablas, reglas de rollback). Los Rule IDs viven en
[`../../research/evidence-to-rules.md`](../../research/evidence-to-rules.md).

## El invariante, primero

> **El plan activo es la fila de `plans` con la `version` más alta.** No hay campo que lo decida.
> `loadActivePlan()` toma `max(version)` y `createNewPlanVersion()` hace `Math.max(...versions) + 1`.

De ahí sale todo lo demás:

1. **Las propuestas NUNCA entran en `plans`.** Una fila `proposed` con versión N+1 sería el plan vivo
   en cualquier dispositivo —incluidos los que corren código viejo, que no saben leer `status`—. La
   propuesta vive en `coach_reviews[id].output.proposal` y **se copia a `plans` sólo al aplicarla**.
2. **Revisión y plan son registros distintos.** El plan lleva punteros (`weekKey`, `reviewId`) y la
   evidencia compacta por objetivo; el razonamiento completo se queda en `coach_reviews`.
3. **El rollback es una versión nueva copiada**, nunca reactivar una fila vieja (abajo).
4. **`status`, `author` y compañía son metadatos**, no la fuente de la verdad. Si `status` se
   perdiera, el plan seguiría resolviéndose igual.

## Esquema del plan v2

Compatible con v1 hacia atrás: **todo lo nuevo es opcional**. Una fila v1 (las 21 que ya existen)
sigue resolviendo sin tocar nada; una fila v2 leída por código viejo pierde los campos nuevos y sigue
funcionando como plantilla.

```js
{ id: 'plan_v22', version: 22, createdAt, weekNumber, label,

  sessions: { upperA: { id, name, subtitle, icon,
      focus: 'Banca mantiene 95. El remo sube.',                                        // v2
      changes: [{ kind:'reorder'|'remove'|'add'|'swap'|'sets', exId, why, decisionId }], // v2
      exercises: [{ id, name, muscle, sets, reps:'5-8', rpe:'7-8', defaultRest, notes,
        compound, db, bw, superset,
        order, optional,                                                                 // v2
        target: {                                                                        // v2
          kg: 95 | null,        // null en ejercicios de medida y cuando no hay dato
          reps: '5-8', rpe: '7-8',
          note: '≤240 chars',
          source: 'coach' | 'rule' | 'seed',
          evidence: ['STR-001'], decisionId } }] } },

  weekTemplate: { 0..6:
      { type:'gym', session, z2FinisherMin }
    | { type:'run', label, subtype, durationMin, summary,
        cardio: { durationMin, distanceKm, subtype, hrZone:'z2', note, source:'coach'|'seed' } } // v2
    | { type:'recovery', ... } | { type:'rest' } },

  schema: 2,                                    // v2
  status: 'active' | 'superseded',               // v2 — nunca 'proposed'
  author: 'ideal-seed' | 'coach-llm' | 'user',   // v2
  basedOn: 'plan_v21', supersededBy: 'plan_v23', // v2
  weekKey: '2026-W37', reviewId: '2026-W37#1',   // v2
  block:   { id, weekIndex:1..5, weeksTotal:5, phase:'build'|'deload', emphasis:[…], deloadAnchor },
  running: { weeklyKmTarget, longRunKm, hardSessions,
             plan:[{ id, dow, distanceKm, durationMin, subtype, hrZone, note }] },
  seedRev: 8 }                                   // v2 — el PLAN_REV con el que se generó
```

### Los cinco detalles que han costado un bug antes

- **`warmup` se omite en los planes del coach.** `startWorkout` cae a `PLAN.sessions[id].warmup`, así
  que los arreglos de calentamiento que viajan con `PLAN_REV` siguen llegando al teléfono. Un warm-up
  congelado dentro de un plan del coach sería la única parte de la app que deja de actualizarse.
- **`running.plan[].dow`, no fechas.** El push a intervals.icu resuelve las fechas desde `weekKey`
  (lunes ISO). Un plan aprobado el martes sigue siendo válido el resto de la semana.
- **`block` lo estampa el cliente** desde `blockWeekFromDates()`. El modelo puede declarar
  `phase:'deload'` reactivo (LOAD-004) pero **no mueve el ancla**: el ancla es
  `settings.deloadAnchorDate` (lunes ISO) y sólo cambia con una aprobación explícita de Julian.
- **`cardio.durationMin` no pisa la base.** La progresión de cardio es una función sobre el dato base
  de `IDEAL_BLOCK_V1` (`progressCardioMin`, prioridad coach > regla > base), no una edición del dato.
- **`target` no se persiste en `plans` cuando lo calcula la regla.** Sólo el objetivo del **coach**
  vive en el plan. El de la regla se calcula al vuelo en cada dispositivo (`suggestSetTarget`, función
  pura → mismo número en iPhone y web) y se guarda como *snapshot* en
  `workout.exercises[i].target`, no en el plan.

### `seedRev` y quién gobierna qué

`PLAN_REV` pasa a ser **revisión de la semilla**: gobierna sólo los planes con `author:'ideal-seed'`.
En un plan del coach viaja como `seedRev` (trazabilidad, no autoridad) y `applyIdealPlan()` **no
sobrescribe** un plan con `author` `coach-llm` o `user` salvo `force`. Cambiar de variante de
calendario (`setIdealVariant`) crea una versión `author:'user'`: **la variante es el calendario, el
coach es el contenido** — se toma el `weekTemplate` nuevo y se conservan las sesiones, los objetivos y
el `running` del coach.

## `coach_reviews` — el registro de la revisión

Store IDB con keyPath `id`; tabla Supabase genérica con `record_id = id`. `id = '2026-W37#1'` = semana
ISO + intento.

```js
{ id:'2026-W37#1', weekKey, attempt, createdAt, updatedAt, appliedAt, appliedPlanId,
  status: 'running'|'proposed'|'applied'|'rejected'|'expired'|'failed',
  rejectedReason, userNote,
  factsHash, facts:{…},                                  // el pack determinista que vio el modelo
  prompt:{ model, effort, rulesVersion, promptVersion },
  output:{
    briefing:{ lastWeek, nextWeek, priorities:[3] },      // markdown, secciones de §C.6
                                                          // v2 añade focus/phase/whyChanged/whyKept/
                                                          // lastWeekSummary — ver "Contrato v2" abajo
    decisions:[{ id, type:'progression'|'structure'|'running'|'nutrition'|'recovery',
                 what, why, evidence:{ numbers:{…} }, ruleIds, confidence,
                 applies:[{ sessionId, exId }] }],
    proposal:{ … },                                      // plan v2 sin id/version/status; SÓLO lo tocado
    requestedData:[…] },
  guardrails:[{ id, level:'hard'|'warn', text, ruleIds }],
  usage:{ input, output, cacheRead, costUsd, latencyMs }, error }
```

**Ciclo de vida:** `running` (la función aceptó el trabajo) → `proposed` (hay propuesta) →
`applied` | `rejected`. Si arranca la semana siguiente sin aplicarse, pasa a `expired` y entra en
`priorReviews` con `applied:false` — el coach ve que su propuesta no se usó. `failed` guarda el motivo
(`refusal`, `parse`, timeout) como fila visible en lugar de un HTTP perdido.

### Contrato v2 del `output` (`prompt.promptVersion = 2`, 2026-09-07)

El coach trabaja **por semanas** y no ajusta el día (decisiones de Julian, 2026-09-07). La Home tiene
que poder decir **por qué cambia o por qué sigue igual**, y eso obliga a dos cosas que v1 no tenía:
justificar lo que se **mantiene**, y cubrir **todas** las sesiones, no sólo las que cambian.

```js
output: {
  briefing: {
    focus,                    // ≤160. El titular de la semana, con su número
    phase,                    // 'base'|'build'|'intensify'|'deload'|'maintenance'
    lastWeek,                 // markdown, 2 secciones (igual que v1) + ≥1 número since-start
    lastWeekSummary: [≤3],    // líneas ≤160: hecho vs planificado. Lo que se ve en Home sin abrir
    whyChanged,               // markdown ≤600. '' si esta semana no cambia nada
    whyKept,                  // markdown ≤600. NUNCA vacío: mantener también se justifica
    nextWeek,                 // markdown, 5 secciones (ver abajo)
    priorities: [3],
  },
  proposal: {
    label, phase,             // phase idéntica a briefing.phase
    weekSummary: [≤12],       // { sessionId, status:'kept'|'changed'|'new'|'removed', line ≤160 }
                              // UNA FILA POR CADA SESIÓN del plan activo, también las que no cambian
    sessions: [≤6],           // sigue siendo un DIFF: sólo las que cambian
    cardio, running, weekTemplateChanges,
  },
  decisions, requestedData,   // sin cambios respecto a v1
}
```

`briefing.nextWeek` pasa de 4 a **5 secciones**: *Qué cambio · Por qué cambia · Por qué se mantiene ·
Qué vigilo esta semana · Qué necesito de ti*.

**Fases.** `base` = semanas 1-2 tras un deload · `build` = 3-4 · `intensify` sólo con adherencia ≥75 %
y rendimiento verde 2 semanas · `deload` **obligatoria** si `facts.block.isDeload` · `maintenance`
cuando la grasa manda y la fuerza aguanta.

**Lo que garantiza el servidor** (`index.ts`, saneado en código; todo lo tocado se anota en
`sanitized[]`, nada se descarta en silencio):

| Regla | Qué hace |
|---|---|
| Fase desconocida | → `'build'` + nota |
| `facts.block.isDeload` y fase ≠ `deload` | → forzada a `'deload'` + nota (G-H3, LOAD-004) |
| Sesión del plan sin fila en `weekSummary` | se añade con `line: '(sin motivo — el coach no lo dio)'`, `status` según el diff, una nota por sesión |
| Fila `kept` cuya sesión está en `proposal.sessions` | → `changed` + nota |
| Fila `changed`/`new` cuya sesión NO está en `sessions` | → `kept` + nota |
| `whyKept` vacío | nota (nunca debería estarlo) |
| Topes | `focus` 160 · `whyChanged`/`whyKept` 600 · `lastWeekSummary` 3×160 · `weekSummary` 12 filas × 160 |

La cobertura se mide contra `currentPlan.sessions` **del request**, no contra el vocabulario
(`allowed.sessionIds`), que es la librería y trae sesiones no programadas.

`PROMPT_VERSION` entra en el `factsHash` de idempotencia: con el mismo pack, una revisión v1 en caché
no puede devolverse como v2 — le faltarían justo los campos que la Home nueva lee. `MAX_PRIOR_REVIEWS`
sube de 4 a **6** (el coach razona sobre el recorrido, y con 4 no se ve un bloque de 5 semanas).

**Lo que lee la PWA:** `briefing.focus` · `briefing.phase` · `briefing.whyChanged` ·
`briefing.whyKept` · `briefing.lastWeekSummary` · `proposal.weekSummary`. Al aplicar, esos campos se
estampan en la versión nueva del plan como `coachBrief` (§B.4 del plan v2.1), con fallback derivado de
`diffPlanVersions` para revisiones v1.

## `decisions` — la memoria

Store IDB keyPath `id`, tabla Supabase genérica, en `BACKUP_STORES`. Un registro por decisión —**nunca
uno por set**; una lectura de sesión lleva el detalle en `evidence.perExercise`.

```js
{ id, ts, date, weekKey, source:'coach-llm'|'rule'|'readiness'|'user',
  type:'session-readout'|'readiness-adjust'|'plan-apply'|'plan-adjust'|'plan-reject'
      |'plan-rollback'|'deload-request'|'running-week'|'goal-update'|'target-override',
  what, why, ruleIds[], evidence:{…cifras},
  ref:{ workoutId?, planVersion?, sessionId?, exerciseId? },
  outcome:'accepted'|'declined'|'done'|null }
```

Es lo que permite al facts pack decir *"te propuse 95 en banca, hiciste 92,5×8/8/7; te propuse quitar
el box jump el jueves y lo hiciste igual"*. `pruneDecisions()` recorta a 500 filas **en local y sólo
en local**: la nube conserva el historial completo.

## El flujo de aprobación (§A.7)

```
maybeRunWeeklyCoach()  →  buildCoachFacts()  →  POST edge fn (202)  →  coach_reviews {status:'running'}
                                                                              │ polling 5 s / 5 min
                                                                              ▼
                                                            {status:'proposed', output, guardrails}
                                                                              │
  Coach view: briefing · diff · avisos · [Aplicar] [Ajustar] [Rechazar] [Regenerar con nota]
                                                                              │ Aplicar
                                                                              ▼
        mergeProposal(activePlan, proposal) → validatePlanVersion(plan, ctx) → createNewPlanVersion(…meta)
                                                                              │
                        plan anterior: status 'superseded' + supersededBy · review: 'applied'
```

`createNewPlanVersion({ label, sessions, weekTemplate, meta:{ schema:2, status:'active',
author:'coach-llm', basedOn, weekKey, reviewId, block, running, seedRev } })`. `meta` se esparce, pero
`id`, `version` y `createdAt` se reafirman **después** del spread: `meta` no puede pisar la identidad
de la fila.

**Overrides del usuario al aplicar:** se absorben si la sesión nueva ya trae el swap, se conservan si
sigue el ejercicio original, y se borran si el slot desaparece. Los `scheduleOverrides` futuros se
limpian **sólo** si cambió el `weekTemplate`.

**Guardarraíles: avisan, nunca bloquean.** `validatePlanVersion` devuelve `[{id, level:'hard'|'warn',
text, ruleIds}]`. Los `hard` restringen **al coach** (la edge function le pide **una** regeneración con
el aviso; si insiste, la app lo pinta en rojo); los `warn` son chips ámbar. **Ningún botón se
deshabilita nunca**: Julian puede aplicar una propuesta con avisos rojos. Tabla completa de los 32 ids
en [`coach-facts-schema.md`](coach-facts-schema.md).

**Política `settings.coachAutoApply`:** `'ask'` (**default**, decisión de Julian) ·
`'auto-if-clean'` (0 avisos y ninguna decisión de tipo `structure`) · `'auto'`. `'auto'` **no se
despliega por defecto**, y `'auto-if-clean'` es una decisión de Julian cuando confíe en el coach.

**Rollback = versión nueva copiada.** `createNewPlanVersion({ ...vieja, label: vieja.label + '
(restaurada)', meta:{ author:'user', basedOn: vieja.id, rolledBackFrom: actual.id } })`. Se mantiene el
invariante "activa = versión más alta", funciona con código viejo, y la historia queda lineal. **Nunca
se borra una versión.**

## La regla de prioridad — coach > regla > último

Un único orden para las tres cosas que se prescriben (kg del set, minutos de cardio, semana de
carrera):

| Prioridad | Fuente | Cuándo manda |
|---|---|---|
| 1 | **coach** | `activePlan.sessions[sid].exercises[].target.source === 'coach'` (o `cardio.source`, o `activePlan.running`) **y** la ventana de vigencia está abierta |
| 2 | **regla** | `suggestSetTarget` (doble progresión) · `progressCardioMin` · `suggestRunningWeek` |
| 3 | **último** | el histórico: el último top set, la duración base de `IDEAL_BLOCK_V1` |

**Ventana de vigencia:** `activePlan.weekKey` ∈ {semana ISO **actual**, **anterior**}. Sin `weekKey`,
el fallback es `createdAt` ≤ 14 días. Un objetivo del coach vencido no se descarta en silencio: la
tarjeta dice *"Objetivo del coach de hace N días — aplico la regla"*. Y en semana de descarga el
objetivo del coach legacy **nunca** se honra (el cron viejo no sabía en qué semana del bloque estaba).

**Doble recorte de deload, evitado:** `startWorkout` usa
`deload = author === 'coach-llm' ? false : isDeloadWeek(wk)`. El plan del coach ya trae el volumen de
descarga dentro; aplicarle además el recorte del 50 % lo dejaría a la cuarta parte.

## Migración y retiro (§A.8)

| Pieza | Qué pasa |
|---|---|
| `loadActivePlan()` | prefiere `status === 'active'` (mayor versión si hay varias); si no, legacy `max(version)` entre filas **sin** `status`; **nunca** una `superseded` |
| `weekly_reviews` + `latest.json` | se dejan de escribir, **no se borran**. `latest.json` (W36) entra una vez en `priorReviews` como entrada `legacy` |
| `fetchLatestWeeklyReview()` | se borra (incremento 9) |
| `/weekly-review-auto` (cron de los domingos) | **desprogramado**. Renombrado a [`/coach-deep-dive`](../../.claude/commands/coach-deep-dive.md): manual, sólo prosa en `tracking/`, prohibido escribir `plans` |
| `pushRunningPlanToIntervalsIcu()` | fuente `activePlan.running.plan[]`, fechas desde `weekKey`, `external_id = pwa-${weekKey}-${id}` |

## Qué NO hacer

Propuestas en `plans` · bajar `DB_VERSION` · borrar una versión de plan · calcular los facts en Deno
(duplicaría el dedupe y las unidades sin tests) · mandar stores crudos al modelo · aceptar ids de
ejercicio libres en el esquema de salida · dos escritores en `plans` (la app diaria escribe
`workouts`, no `plans`) · dar por hecho que `status` existe en las filas legacy.
