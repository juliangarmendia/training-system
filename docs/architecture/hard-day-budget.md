# Hard-Day Budget — evitar semanas imposibles

Operacionaliza [`BUD-001` y `BUD-002`](../../research/evidence-to-rules.md). El objetivo: que el
sistema **nunca genere una semana con demasiado estrés duro**, aplicando el principio 80/20 de Seiler
(END-001) a la semana completa — no solo al running. Cuenta como "hard stress" **todo** lo exigente:
fuerza pesada, threshold, intervals, híbrido duro, long run exigente, sled pesado, metcon.

> Los pesos son **heurísticos**, no medidos. Son puntos de partida razonables, refinables con datos
> logueados. No son scores falsamente precisos (`evidenceLevel: expert` en BUD-002).

## Pesos de estrés por sesión

| Sesión | Peso | Notas |
|---|---|---|
| Recovery / movilidad / caminar | 0 | No cuenta. |
| Easy zone 2 (cardio o run fácil) | 0.5 | Bajo, pero no cero (volumen acumula). |
| Upper strength | 1 | Bajo coste sistémico/articular. |
| Lower strength (squat/DL/RDL pesado) | 2 | Alto coste sistémico + tren inferior. |
| Threshold (run o cardio Z3/Z4) | 2 | Día duro. |
| Intervals (HIIT) | 2 | Día duro; alta interferencia (END-008). |
| Hybrid aerobic circuit (Z2-3, baja skill) | 1 | Moderado si se mantiene fácil. |
| Hybrid threshold | 2 | Día duro. |
| Hybrid strength endurance (sled/carries/lunges/wall ball) | 2 | Alto coste muscular + parcial de pierna. |
| Long run exigente | 2 | Cuenta como duro si es largo/rápido. |
| Benchmark (HYROX-like test) | 3 | El más caro; ≤1 cada 4-6 sem (HYB-004). |

## Cap semanal

- **Budget objetivo: ~5-6 puntos/semana** en bloque de definición/re-entry (déficit + concurrent).
- **Hasta ~7** solo en un bloque dedicado con buena readiness sostenida y sin déficit agresivo.
- Equivale a la regla **≤2-3 sesiones verdaderamente duras/semana** (BUD-001): p.ej. 2 lower strength
  (4) + 1 threshold (2) = 6, con el resto easy/recovery/upper.

## Lógica de aplicación

1. El **Block Planner** fija el cap del bloque según fase y readiness agregada.
2. El **Goal Engine** propone las sesiones de la semana; cada una trae su peso.
3. El **Interference Engine** suma pesos. Si el total > cap:
   - degradar la sesión de menor prioridad (p.ej. threshold → easy Z2),
   - o sustituir por modalidad de menor coste (run duro → bici Z2),
   - o mover a la semana siguiente.
4. El **Readiness Engine** puede recortar el cap del día (red → tratar el cap como ya excedido).
5. Restricción dura adicional: **no dos sesiones de peso ≥2 en días consecutivos sobre la misma
   región** (se resuelve en `interference-rules.md`).

## Ejemplo (bloque de definición, cap 6)

| Día | Sesión | Peso |
|---|---|---|
| Lun | Lower strength | 2 |
| Mar | Upper strength + easy Z2 | 1 + 0.5 |
| Mié | Easy run Z2 | 0.5 |
| Jue | Lower strength | 2 |
| Vie | Upper strength | 1 |
| Sáb | Long easy run / hybrid aerobic | 1 |
| Dom | Recovery | 0 |
| **Total** | | **5.5** ✅ |

Meter aquí un día de intervals (+2) o un benchmark (+3) excedería el cap → el sistema lo rechaza o
degrada otra sesión. Así no se acumulan 4-5 días duros "sin querer".
