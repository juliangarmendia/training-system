# Exercise Schema v1 — metadata mínima por ejercicio

Metadata que el Exercise Selection Engine necesita para elegir por retorno-sobre-fatiga. **Buckets
cualitativos, no falsa precisión:** donde no hay evidencia medible, se usa `low | medium | high`, no
números inventados. Reglas relacionadas:
[`SEL-001..003`, `STR-007`, `STR-010`, `ATH-003`, `HYB-003`, `LOAD-003`](../../research/evidence-to-rules.md).

> **No migrar a `app/app.js` todavía.** El objeto actual del library tiene solo
> `id/name/muscle/movementPattern`; este schema es aditivo y se implementará en una fase posterior
> aprobada. Aquí queda el contrato + ejemplos.

## Campos

```json
{
  "id": "",
  "name": "",
  "movementPattern": [],
  "primaryMuscles": [],
  "secondaryMuscles": [],
  "primaryGoal": [],
  "stimulusToFatigue": "low|medium|high",
  "systemicFatigue": "low|medium|high",
  "localFatigue": {
    "lowerBody": "low|medium|high",
    "upperBody": "low|medium|high",
    "posteriorChain": "low|medium|high",
    "grip": "low|medium|high"
  },
  "jointStress": {
    "lumbar": "low|medium|high",
    "knee": "low|medium|high",
    "shoulder": "low|medium|high",
    "ankleAchilles": "low|medium|high"
  },
  "impactCost": "low|medium|high",
  "skillRequirement": "low|medium|high",
  "equipment": [],
  "loadingStyle": [],
  "failureProximity": "avoid_failure|1-3_RIR|0-1_RIR_allowed",
  "bestRepRanges": [],
  "cardioCompatibility": "good|neutral|poor",
  "avoidBefore": [],
  "avoidAfter": [],
  "substitutes": [],
  "progressions": [],
  "regressions": [],
  "evidenceLevel": "strong|moderate|weak_extrapolated|expert",
  "notes": ""
}
```

### Notas de campos clave
- **`stimulusToFatigue`** — SFR cualitativo (SEL-002). High = mucho estímulo por poca fatiga.
- **`localFatigue.posteriorChain` y `.grip`** — críticos en híbrido (sled, carries, remo, DL): limitan la frecuencia real aunque el músculo objetivo no esté fatigado.
- **`impactCost`** — para gestión de tendón/articulación y selección frente a días de running.
- **`cardioCompatibility`** — `good` = se puede programar el mismo día que cardio sin solapar fatiga; `poor` = compite con el estímulo cardio o tren inferior.
- **`avoidBefore` / `avoidAfter`** — relaciones de interferencia (p.ej. DL pesado `avoidBefore: [hard_run, intervals]`).
- **`failureProximity`** — por defecto `1-3_RIR`; `0-1_RIR_allowed` solo en aislamiento/máquina segura (STR-004).

## Ejemplos poblados

```json
{
  "id": "back-squat",
  "name": "Barbell Back Squat",
  "movementPattern": ["squat"],
  "primaryMuscles": ["quads", "glutes"],
  "secondaryMuscles": ["adductors", "spinal_erectors", "core"],
  "primaryGoal": ["strength", "hypertrophy"],
  "stimulusToFatigue": "high",
  "systemicFatigue": "high",
  "localFatigue": { "lowerBody": "high", "upperBody": "low", "posteriorChain": "medium", "grip": "low" },
  "jointStress": { "lumbar": "medium", "knee": "medium", "shoulder": "low", "ankleAchilles": "low" },
  "impactCost": "low",
  "skillRequirement": "medium",
  "equipment": ["barbell", "rack"],
  "loadingStyle": ["heavy", "moderate"],
  "failureProximity": "1-3_RIR",
  "bestRepRanges": ["3-6", "6-8"],
  "cardioCompatibility": "poor",
  "avoidBefore": ["hard_run", "intervals", "hybrid_strength_endurance"],
  "avoidAfter": ["hard_run", "long_run"],
  "substitutes": ["hack-squat", "front-squat", "leg-press"],
  "progressions": ["add reps in range", "then add load"],
  "regressions": ["box squat", "leg press"],
  "evidenceLevel": "strong",
  "notes": "Anchor lower compound. Respeta historial lumbar: priorizar técnica y RPE."
}
```

```json
{
  "id": "sled-push",
  "name": "Sled Push",
  "movementPattern": ["squat", "conditioning"],
  "primaryMuscles": ["quads", "glutes"],
  "secondaryMuscles": ["calves", "core"],
  "primaryGoal": ["conditioning", "strength_endurance", "power"],
  "stimulusToFatigue": "high",
  "systemicFatigue": "high",
  "localFatigue": { "lowerBody": "high", "upperBody": "low", "posteriorChain": "medium", "grip": "low" },
  "jointStress": { "lumbar": "low", "knee": "low", "shoulder": "low", "ankleAchilles": "low" },
  "impactCost": "low",
  "skillRequirement": "low",
  "equipment": ["sled", "turf"],
  "loadingStyle": ["metabolic", "explosive"],
  "failureProximity": "avoid_failure",
  "bestRepRanges": ["distance/time intervals"],
  "cardioCompatibility": "neutral",
  "avoidBefore": ["heavy_lower_strength"],
  "avoidAfter": [],
  "substitutes": ["bike-intervals", "ski-erg"],
  "progressions": ["add load", "add distance", "increase density"],
  "regressions": ["lighter sled", "shorter distance"],
  "evidenceLevel": "moderate",
  "notes": "Concéntrico puro, bajo DOMS, bajo impacto. Ideal híbrido cuando se quiere estímulo de pierna sin daño excéntrico. Cuenta como tren inferior."
}
```

```json
{
  "id": "pallof-press",
  "name": "Cable Pallof Press",
  "movementPattern": ["core_anti_rotation"],
  "primaryMuscles": ["obliques", "deep_core"],
  "secondaryMuscles": ["shoulders"],
  "primaryGoal": ["core", "athleticism"],
  "stimulusToFatigue": "high",
  "systemicFatigue": "low",
  "localFatigue": { "lowerBody": "low", "upperBody": "low", "posteriorChain": "low", "grip": "low" },
  "jointStress": { "lumbar": "low", "knee": "low", "shoulder": "low", "ankleAchilles": "low" },
  "impactCost": "low",
  "skillRequirement": "low",
  "equipment": ["cable"],
  "loadingStyle": ["light", "moderate"],
  "failureProximity": "1-3_RIR",
  "bestRepRanges": ["10-15"],
  "cardioCompatibility": "good",
  "avoidBefore": [],
  "avoidAfter": [],
  "substitutes": ["dead-bug", "side-plank"],
  "progressions": ["add load", "add tempo/pause"],
  "regressions": ["band pallof", "dead-bug"],
  "evidenceLevel": "strong",
  "notes": "Anti-rotación spine-sparing (McGill, ATH-003). Prioritario por historial lumbar."
}
```

```json
{
  "id": "incline-db-press",
  "name": "Incline Dumbbell Press",
  "movementPattern": ["horizontal-press"],
  "primaryMuscles": ["chest", "front_delts"],
  "secondaryMuscles": ["triceps"],
  "primaryGoal": ["hypertrophy"],
  "stimulusToFatigue": "high",
  "systemicFatigue": "medium",
  "localFatigue": { "lowerBody": "low", "upperBody": "medium", "posteriorChain": "low", "grip": "low" },
  "jointStress": { "lumbar": "low", "knee": "low", "shoulder": "medium", "ankleAchilles": "low" },
  "impactCost": "low",
  "skillRequirement": "low",
  "equipment": ["dumbbells", "adjustable_bench"],
  "loadingStyle": ["moderate"],
  "failureProximity": "1-3_RIR",
  "bestRepRanges": ["8-12"],
  "cardioCompatibility": "good",
  "avoidBefore": [],
  "avoidAfter": [],
  "substitutes": ["incline-barbell-press", "machine-press"],
  "progressions": ["add reps", "then load"],
  "regressions": ["machine chest press"],
  "evidenceLevel": "moderate",
  "notes": "Carga posición alargada del pecho (STR-007). 3s eccentric."
}
```
