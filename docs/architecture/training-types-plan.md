# Training Types & Extensible Session Architecture Plan

Plan de arquitectura para evolucionar la PWA viva hacia una taxonomía rica de tipos de sesión
**por capas, backwards-compatible, sin tocar el generador todavía**. Es un plan; la implementación va
en fases T1→T4, cada una revisada antes de avanzar.

## Contexto

Hoy la app entiende 3 tipos (`gym`/`run`/`rest` en `WEEK_TEMPLATE`), con 3 stores de shapes distintos
(`workouts`, `runs`, `mobility_sessions`) y ~14 sitios que ramifican por `.type`/`kind`. El corpus
[`evidence-to-rules.md`](../../research/evidence-to-rules.md) necesita una taxonomía mucho más rica
(strength/cardio/hybrid/recovery/athleticism/benchmark + subtipos) para que Readiness y
Hard-Day-Budget clasifiquen sesiones. Hay que llegar ahí sin romper logs, sync, offline ni la PWA.

Contrato: incremental · testeable · backwards-compatible · versionado · documentado · advisory-first ·
ninguna regla/score reescribe el plan · commits chicos · revisión entre fases.

## Decisión arquitectónica central

**Envelope común + payload por tipo, aditivo, con adaptador de lectura** (no un store por subtipo, no
mega-refactor):

1. **Taxonomía como datos** `SESSION_TYPES`: `family` → `subtype`, con metadata por subtipo
   (`evidenceTags` [Rule IDs], `budgetWeight`, `modality`, `icon`, `tone`).
2. **Adaptador `toSession(record, originStore)`**: normaliza CUALQUIER registro (viejo o nuevo) a un
   envelope común `{id,date,ts,family,subtype,modality,title,evidenceTags,payload,source}`. Los viejos
   se interpretan por su store de origen (`workouts`→strength, `runs`→cardio vía `intensityLabel`,
   `mobility_sessions`→recovery). **Cero migración destructiva.** Extiende el normalizador parcial del
   activity feed (`app.js` ~6447-6511).
3. **Discriminador aditivo opcional** `sessionType` + `evidenceTags` en stores existentes (nuevos
   registros lo traen; viejos no → el adaptador lo infiere).
4. **Store nuevo `sessions`** (IDB v10, aditivo) solo para tipos que no encajan en los 3 stores
   (hybrid, athleticism, cardio no-run). Stores viejos intactos; lecturas hacen merge.
5. **Centralizar el branching** en helpers (`sessionFamily`, `typeTone`, `isTrainingType`,
   `sessionRenderModel`) para que agregar un tipo no signifique editar 14 sitios.

*(Alternativa descartada: un store por familia → más superficie y branching.)*

## Modelo de datos

**Envelope común (toda sesión):** `id, date, ts, family, subtype, modality, title, durationMin,
perceivedEffort (RPE/feel), evidenceTags[], budgetWeight, source, notes`.

**Payload por familia:**
- **strength:** `exercises[]{exerciseId, sets[{weight,reps,rpe,done}], note}, quality, unit, blockTimings` (= shape actual de `workouts`).
- **cardio:** `distance, avgPace, gapPace, avgHR, maxHR, hrZoneTimes, decoupling, intensityLabel, trainingLoad` (= `runs` + campos D1).
- **hybrid:** `stations[]{movement, modality, reps|dist|time, load}, format (A/B/C/D), rounds, targetZone`.
- **recovery:** `routineId, painBefore, painAfter` (= mobility) o `kind (walk|breath|easy-cardio)`.
- **athleticism:** `drills[]{type (plyo|carry|sled|unilateral|core), sets, contacts|dist|load}, freshness`.
- **benchmark:** `benchmarkId, result (time|reps|load), comparableTo (prev)`.

## UI / logging / motores
- **UI:** un renderer normalizado pinta una card por `family` (color `typeTone`, icono, título,
  subtítulo), reusando el patrón del activity feed. El week-strip pasa de 3 filas fijas a filas
  derivadas de las familias presentes, sin romper las 3 actuales.
- **Logging:** ruta genérica `logSession(family, subtype, payload)` que escribe al store correcto
  (viejo si aplica, `sessions` si es nuevo). Los flujos actuales (startWorkout/logRun/mobility) siguen
  intactos y opcionalmente estampan `sessionType`.
- **Readiness / Hard-Day-Budget (advisory, T3):** leen `toSession()` + `evidenceTags` + `budgetWeight`
  (BUD-002) para clasificar duro/fácil y sumar el budget. **Nunca mutan el plan.**

## Qué NO tocar todavía
Generador, `PLAN`, `WEEK_TEMPLATE` como fuente de verdad de programación, sync schema, nutrition,
plans/exercises stores.

## Fases

### T1 — Session type taxonomy + backwards-compatible schema
`SESSION_TYPES` (constantes) · `toSession()` adaptador + tests de equivalencia con los 3 shapes viejos
· campos aditivos opcionales `sessionType`/`evidenceTags` · store `sessions` en `openDB`
(DB_VERSION 9→10, aditivo) · helpers de branching + refactor de los 14 sitios con default =
comportamiento actual. **Sin** logging/UI nuevos. **Sin** generador. Cache/version bump.
Validación: `node --check` + la app se comporta idéntico (viejos pasan por el adaptador).

### T2 — Logging/UI support
`logSession()` + formularios mínimos para 1-2 tipos nuevos (cardio no-run, recovery walk) + renderer
normalizado. Pequeño y reversible.

### T3 — Advisory integration
Readiness v1 + Hard-Day-Budget v1 (advisory/read-only) leen los tipos y los clasifican. No mutan
programación.

### T4 — Generator upgrade
Migración progresiva fuera del `PLAN` hardcodeado. Solo tras T1-T3 revisados.

## Verificación (cada fase)
- `node --check` en JS tocado.
- **Regla de oro backwards-compat:** con T1 desplegado, un usuario con solo datos viejos ve
  exactamente lo mismo (el adaptador no cambia la salida).
- Prueba en iPhone PWA al final de cada fase antes de avanzar.
- Rollback por fase = revertir el commit (cache vuelve a la versión anterior).

## Fuera de alcance
Implementar los 6 tipos de golpe; tocar el generador; mega-commit; cualquier cambio que rompa
`PLAN`/`WEEK_TEMPLATE`/logs/sync/offline.
