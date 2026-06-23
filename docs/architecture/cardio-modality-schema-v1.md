# Cardio Modality Schema v1 — metadata por modalidad

Metadata que el Modality Engine usa para elegir entre running, treadmill, bici, remo y ski según
objetivo, fatiga, impacto e interferencia. Buckets cualitativos, sin falsa precisión. Reglas:
[`SEL-004`, `INT-002`, `HYB-005`, `END-002`](../../research/evidence-to-rules.md).

## Campos

```json
{
  "id": "run_outdoor|treadmill|bike|row|ski",
  "impact": "low|medium|high",
  "lowerLimbInterference": "low|medium|high",
  "posteriorChainLoad": "low|medium|high",
  "upperBodyLoad": "low|medium|high",
  "lumbarLoad": "low|medium|high",
  "gripLoad": "low|medium|high",
  "bestFor": ["zone2", "zone3", "threshold", "intervals", "recovery", "hybrid"],
  "avoidWhen": [],
  "preferredWhen": [],
  "progressionMetrics": [],
  "fatigueCost": "low|medium|high",
  "specificityForRunning": "low|medium|high",
  "notes": ""
}
```

## Modalidades pobladas

```json
[
  {
    "id": "run_outdoor",
    "impact": "high",
    "lowerLimbInterference": "high",
    "posteriorChainLoad": "medium",
    "upperBodyLoad": "low",
    "lumbarLoad": "low",
    "gripLoad": "low",
    "bestFor": ["zone2", "zone3", "threshold", "intervals"],
    "avoidWhen": ["lower_limb_fatigue_high", "within_24h_of_heavy_lower", "tendon_irritation", "readiness_red"],
    "preferredWhen": ["running_progression_is_block_goal", "specificity_needed"],
    "progressionMetrics": ["pace_at_fixed_HR", "aerobic_decoupling", "weekly_volume_km"],
    "fatigueCost": "high",
    "specificityForRunning": "high",
    "notes": "Mayor especificidad para correr y mayor interferencia/impacto (INT-002, Wilson 2012). Es el camino obligado para el objetivo 10-15 km. Madrid verano: vigilar HR por calor."
  },
  {
    "id": "treadmill",
    "impact": "medium",
    "lowerLimbInterference": "high",
    "posteriorChainLoad": "medium",
    "upperBodyLoad": "low",
    "lumbarLoad": "low",
    "gripLoad": "low",
    "bestFor": ["zone2", "zone3", "threshold", "intervals", "recovery"],
    "avoidWhen": ["within_24h_of_heavy_lower (si intervals)"],
    "preferredWhen": ["heat_or_weather", "precise_pace_control", "incline_to_cap_HR", "indoor_needed"],
    "progressionMetrics": ["pace_at_fixed_HR", "aerobic_decoupling"],
    "fatigueCost": "medium",
    "specificityForRunning": "high",
    "notes": "Casi tan específico como outdoor, impacto algo menor, control de pace/incline. Útil para Z2 con HR techada en calor (END-002/005)."
  },
  {
    "id": "bike",
    "impact": "low",
    "lowerLimbInterference": "low",
    "posteriorChainLoad": "low",
    "upperBodyLoad": "low",
    "lumbarLoad": "low",
    "gripLoad": "low",
    "bestFor": ["zone2", "zone3", "recovery", "intervals", "hybrid"],
    "avoidWhen": [],
    "preferredWhen": ["lower_limb_fatigue_high", "post_heavy_lower", "tendon_or_joint_management", "low_impact_volume_needed"],
    "progressionMetrics": ["power_at_fixed_HR", "aerobic_decoupling"],
    "fatigueCost": "low",
    "specificityForRunning": "low",
    "notes": "Mínima interferencia e impacto (INT-002). Elección por defecto para volumen aeróbico/recovery cuando piernas cargadas o hay molestias. Baja transferencia a correr."
  },
  {
    "id": "row",
    "impact": "low",
    "lowerLimbInterference": "medium",
    "posteriorChainLoad": "medium",
    "upperBodyLoad": "medium",
    "lumbarLoad": "medium",
    "gripLoad": "medium",
    "bestFor": ["zone2", "zone3", "threshold", "intervals", "hybrid"],
    "avoidWhen": ["lumbar_fatigue_or_irritation", "post_heavy_deadlift", "posterior_chain_fatigue_high"],
    "preferredWhen": ["full_body_stimulus_wanted", "hybrid_conditioning"],
    "progressionMetrics": ["pace/500m_at_fixed_HR", "aerobic_decoupling"],
    "fatigueCost": "medium",
    "specificityForRunning": "low",
    "notes": "Bajo impacto pero carga lumbar/cadena posterior y grip moderados → evitar tras DL/RDL pesado o con molestia lumbar (interference-rules)."
  },
  {
    "id": "ski",
    "impact": "low",
    "lowerLimbInterference": "low",
    "posteriorChainLoad": "medium",
    "upperBodyLoad": "high",
    "lumbarLoad": "medium",
    "gripLoad": "medium",
    "bestFor": ["zone2", "zone3", "threshold", "intervals", "hybrid"],
    "avoidWhen": ["upper_body_fatigue_high", "lumbar_irritation"],
    "preferredWhen": ["lower_limb_fatigue_high", "hybrid_conditioning", "upper_dominant_cardio_wanted"],
    "progressionMetrics": ["pace_at_fixed_HR", "aerobic_decoupling"],
    "fatigueCost": "medium",
    "specificityForRunning": "low",
    "notes": "Bajo impacto, más upper/core. Buena opción cuando piernas están cargadas y se quiere estímulo cardio/híbrido sin más tren inferior (HYB-005)."
  }
]
```

## Lógica de selección (resumen)

1. **Objetivo del bloque = correr** → `run_outdoor`/`treadmill` pese a interferencia (specificity gana).
2. **Tren inferior cargado / post-pierna / molestia** → `bike` (default) o `ski`.
3. **Molestia lumbar o post-DL pesado** → evitar `row`; preferir `bike`.
4. **Calor de Madrid / control de pace** → `treadmill` con incline para techar HR.
5. **Híbrido sin más impacto de pierna** → `ski` o `bike`.
6. **Recovery puro** → `bike` Z1-2.
