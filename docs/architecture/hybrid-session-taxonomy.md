# Hybrid Session Taxonomy — HYROX-like sin metcons random

Define los tipos de sesión híbrida que el Hybrid Engine puede generar. **No son metcons aleatorios:**
cada tipo tiene objetivo, dosis y reglas. La evidencia directa de programación HYROX es
`weak_extrapolated` (ver [`evidence-grading.md`](../../research/evidence-grading.md)); la lógica se
infiere de concurrent training, strength-endurance y biomecánica de sled/carry. Reglas:
[`HYB-001..005`, `INT-004`](../../research/evidence-to-rules.md).

El usuario **no compite en HYROX**; lo híbrido es herramienta para estética, work capacity,
resistencia muscular y sensación atlética — dosificado, no el centro del programa.

---

## A. Hybrid Aerobic Circuit
- **Objetivo:** base aeróbica, gasto energético, work capacity.
- **Intensidad:** zona 2-3 (conversacional a algo incómodo). HR controlada, no all-out.
- **Duración:** 20-40 min continuos/circulares.
- **Frecuencia:** 0-1/semana al inicio.
- **Coste de fatiga (budget):** 1.
- **Modalidad compatible:** row, ski, bike, treadmill incline, sled ligero.
- **Ejercicios compatibles:** ergs, sled push ligero, carries ligeros, step-ups, lunges sin carga, wall ball ligero — **baja skill** (HYB-003).
- **Cuándo hacerlo:** días sin pierna pesada; cuando se busca volumen aeróbico con variedad.
- **Cuándo evitarlo:** readiness red; 24h alrededor de pierna pesada (si usa mucho tren inferior).
- **Progresión:** subir duración antes que intensidad; luego densidad (menos descanso).

## B. Hybrid Threshold Session
- **Objetivo:** tolerancia a ritmo sostenido, techo aeróbico, capacidad de sostener esfuerzo.
- **Intensidad:** zona 3-4 (threshold). Esfuerzo "cómodamente duro".
- **Duración:** 20-30 min de trabajo efectivo (intervalos de 5-10 min con descanso corto).
- **Frecuencia:** baja (cuenta dentro del límite de 1 sesión dura de cardio/sem, END-004).
- **Coste de fatiga (budget):** 2 — **día duro**.
- **Modalidad compatible:** row, ski, bike (preferir bajo impacto); treadmill solo si tren inferior fresco.
- **Ejercicios compatibles:** ergs principalmente; estaciones de baja skill intercaladas.
- **Cuándo hacerlo:** readiness green; lejos ≥24h de pierna pesada (INT-001).
- **Cuándo evitarlo:** cerca de pierna pesada o long run; readiness yellow/red.
- **Progresión:** alargar tiempo en threshold; mejorar pace-to-HR.

## C. Hybrid Strength Endurance
- **Objetivo:** resistencia muscular; sled, carries, lunges, wall balls.
- **Intensidad:** cargas moderadas, reps altas, descanso corto. No pesado-pesado.
- **Duración:** 20-35 min.
- **Frecuencia:** 0-1/semana.
- **Coste de fatiga (budget):** 2 — **alto coste muscular + parcial de pierna**.
- **Modalidad compatible:** sled push/pull, farmer/suitcase carries, lunges cargadas, wall ball, ski.
- **Ejercicios compatibles:** baja skill, alto retorno de work capacity; grip y cadena posterior se cargan → considerar fatiga local.
- **Cuándo hacerlo:** día sin pierna pesada; **separar de lower heavy** (solapa tren inferior).
- **Cuándo evitarlo:** 24-48h alrededor de pierna pesada; molestia lumbar (carries/sled cargan lumbar).
- **Progresión:** carga o distancia gradual; densidad. Cuidar grip y lumbar.

## D. Hybrid Benchmark
- **Objetivo:** test ocasional de progreso/work capacity. Motivación.
- **Intensidad:** alta, semi-competitiva.
- **Duración:** variable (15-40 min).
- **Frecuencia:** **máximo cada 4-6 semanas** (HYB-004). No es sesión semanal.
- **Coste de fatiga (budget):** 3 — **el más caro**.
- **Modalidad compatible:** mezcla erg + estaciones funcionales de baja skill.
- **Ejercicios compatibles:** formato estable y repetible para comparar en el tiempo.
- **Cuándo hacerlo:** fin de bloque, readiness green, no en semana de pierna pesada o long run duro.
- **Cuándo evitarlo:** en déficit agresivo o readiness comprometida; como entrenamiento habitual.
- **Progresión:** comparar tiempos/output del mismo benchmark entre bloques, no semana a semana.

---

## Reglas transversales de la taxonomía

- **Solo baja skill bajo fatiga** (HYB-003): nada de Olympic lifts ni gimnásticos.
- **Cuenta en el budget** (HYB-002, BUD-002): el Interference Engine suma su peso y lo separa de pierna/run duro.
- **Frecuencia total** (HYB-001): 0-1/sem en bloque de definición/fuerza; hasta 2 solo en bloque dedicado de work-capacity.
- **Anti-random:** cada sesión híbrida declara su tipo (A/B/C/D) y su objetivo; si no encaja en uno, no se genera.
