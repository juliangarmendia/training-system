# Engine Architecture — pipeline en cascada

Diseño de la lógica de decisión para programación atlética híbrida. **Esto es un spec de diseño, no
código.** No describe el generador actual (`app/app.js`, hardcodeado); describe los motores que lo
reemplazarán en una fase posterior, una vez aprobado.

Todas las reglas referenciadas (`STR-*`, `INT-*`, etc.) viven en
[`../../research/evidence-to-rules.md`](../../research/evidence-to-rules.md), única fuente de verdad.

## Principios de arquitectura (invariantes)

1. **Readiness es compuerta upstream**, no un ajuste posterior. Modula el objetivo de la sesión antes
   de que los motores de dominio generen nada (READ-007).
2. **Interference es un constraint resolver**, no una heurística suelta: recibe las sesiones de la
   semana y produce una colocación que respeta restricciones duras (INT-001, HYB-002, BUD-001).
3. **Progression progresa UNA cualidad dominante por bloque** (GEN-001); el resto se mantiene.
4. **Evidence Engine es transversal**: cada decisión sale etiquetada con `ruleId`, `population`,
   `applicabilityToUser`, `evidenceLevel`, `confidence`.
5. **Sin falsa precisión**: ningún motor deriva dosis numéricas exactas de un score compuesto
   (READ-003). Los buckets cualitativos son cualitativos.

## Flujo

```
[State/Profile Store]
        │  (perfil, historial, logs, Whoop/Intervals, equipamiento)
        ▼
[0. Block Planner] ───────────► cualidad dominante + mantenidas, deload, diet break (semana/bloque)
        ▼
[1. Goal Engine] ─────────────► objetivo dominante de CADA sesión de la semana
        ▼
[2. Readiness Engine] ────────► green / yellow / red por TENDENCIAS (gate)
        ▼
[3. Interference Engine] ─────► colocación semanal (constraint resolver)
        ▼
[4. Modality Engine] ─────────► modalidad cardio por sesión
        ▼
[5a. Strength] [5b. Cardio] [5c. Hybrid]  ► generan la sesión según objetivo + readiness
        ▼
[6. Exercise Selection Engine] ► llena slots por patrón + ROI + equipamiento + compatibilidad
        ▼
[7. Progression Engine] ──────► actualiza cargas/volumen/paces (una cualidad/bloque)
        ▼
[8. Recovery Engine] ─────────► override: degradar / sustituir / deload
        ▼
[9. Evidence Engine] ─────────► (transversal) etiqueta cada decisión con su trazabilidad
```

---

## 0. State / Profile Store
- **Inputs:** perfil (`docs/profile.md`), goals, logs de workouts (IDB/Supabase), datos Whoop/Intervals, inventario de equipamiento, historial de lesiones.
- **Outputs:** estado consolidado y consultable por todos los motores.
- **Decide:** nada — es almacenamiento + lectura.
- **No debe:** inferir datos ausentes; expone "missing" explícito.

## 0b. Block Planner (mesociclo, 3-6 sem)
- **Inputs:** goals, fase actual (re-entry/cut/base), readiness agregada del bloque previo, calendario (deloads, diet breaks).
- **Outputs:** cualidad **dominante** + 1-2 **mantenidas**, modelo de periodización, ubicación de deload y diet break, caps de volumen por modalidad.
- **Decide:** qué se progresa este bloque y qué solo se mantiene.
- **Reglas:** GEN-001, REC-004, REC-005, END-007, INT-006, LOAD-004, HYB-001/004.
- **Datos:** tendencias de bloque, no días sueltos.
- **No debe:** progresar más de una cualidad a la vez; cambiar el dominante a mitad de bloque sin trigger de Recovery.
- **Interacción:** define el marco que consume el Goal Engine.

## 1. Goal Engine (sesión)
- **Inputs:** plan de bloque, plantilla semanal, día de la semana.
- **Outputs:** objetivo dominante por sesión (uno de: recomposition, fat_loss, strength_maintenance, hypertrophy, aerobic_base, running_progression, hybrid_conditioning, strength_endurance, recovery, athleticism).
- **Decide:** el "para qué" de cada día.
- **Reglas:** GEN-001, REC-003, INT-005 (cardio co-igual).
- **No debe:** mezclar dos objetivos duros en una sesión (un día = un objetivo dominante).
- **Interacción:** alimenta Readiness e Interference.

## 2. Readiness Engine (GATE upstream)
- **Inputs:** HRV/RHR rolling 7d, sueño, recovery score, fitness/fatigue/form (Intervals), subjetivos, rendimiento del warm-up.
- **Outputs:** estado del día `green | yellow | red` + razón.
- **Decide:** si el objetivo del día se mantiene, se degrada o se reemplaza (READ-007).
- **Reglas:** READ-001..008.
- **Datos:** tendencias, no valores diarios; baseline individual.
- **No debe:** actuar por una sola métrica (READ-002); tratar el score como calculadora de dosis (READ-003); sobrescribir un rendimiento real bueno por un score malo (READ-005).
- **Interacción:** gate antes de Interference y de los motores de dominio. Ver [`readiness-rules.md`](./readiness-rules.md).

## 3. Interference Engine (constraint resolver)
- **Inputs:** sesiones de la semana con su objetivo + coste, estado de readiness, carga reciente de tren inferior.
- **Outputs:** colocación semanal (qué día lleva pierna/run duro/intervals/híbrido) que satisface las restricciones.
- **Decide:** orden y espaciado; cuándo swappear modalidad.
- **Reglas (duras):** INT-001 (no run duro <24h pre-pierna pesada), INT-002/SEL-004 (modalidad), INT-003 (orden intra-sesión), INT-004 (proteger potencia), HYB-002 (espaciar híbrido), BUD-001/002 (techo de días duros).
- **No debe:** colocar dos cargas duras de la misma región en <24h; exceder el budget.
- **Interacción:** entrega un calendario factible a Modality y a los motores de dominio. Ver [`interference-rules.md`](./interference-rules.md).

## 4. Modality Engine
- **Inputs:** objetivo de la sesión cardio, fatiga de tren inferior reciente, equipamiento, impacto tolerable, especificidad requerida (¿correr?).
- **Outputs:** modalidad (`run_outdoor | treadmill | bike | row | ski`) + zona objetivo.
- **Decide:** con qué herramienta cumplir el estímulo aeróbico/híbrido.
- **Reglas:** SEL-004, INT-002, HYB-005, END-002.
- **Datos:** metadata de [`cardio-modality-schema-v1.md`](./cardio-modality-schema-v1.md).
- **No debe:** elegir running de alto impacto cuando el tren inferior está muy cargado salvo que la especificidad de correr sea el objetivo del bloque.

## 5a. Strength Engine
- **Inputs:** objetivo, readiness, patrones a cubrir, volumen objetivo del bloque.
- **Outputs:** sesión de fuerza (slots con sets/reps/RIR/descanso).
- **Reglas:** STR-001..007, STR-010, REC-001.
- **No debe:** programar al fallo en compuestos en déficit (STR-004); subir volumen por encima del cap del bloque.

## 5b. Cardio Engine
- **Inputs:** objetivo, modalidad (de Modality Engine), readiness, fase de progresión de running.
- **Outputs:** sesión cardio (zona, duración/estructura, intervals/threshold/easy/long).
- **Reglas:** END-001..008.
- **No debe:** más de 1 sesión dura de cardio que choque con pierna; prescribir paces antes de base aeróbica (END-002).

## 5c. Hybrid Engine
- **Inputs:** objetivo (work_capacity/strength_endurance), readiness, equipamiento, budget restante.
- **Outputs:** sesión híbrida de un tipo de la taxonomía (A/B/C/D).
- **Reglas:** HYB-001..005, INT-004.
- **No debe:** generar metcons random; usar movimientos de alta skill bajo fatiga (HYB-003); programar híbrido junto a pierna pesada. Ver [`hybrid-session-taxonomy.md`](./hybrid-session-taxonomy.md).

## 6. Exercise Selection Engine
- **Inputs:** slots a llenar (patrón + objetivo + rango), equipamiento, estado de fatiga local, historial reciente.
- **Outputs:** ejercicios concretos por slot + sustitutos.
- **Reglas:** SEL-001..003, STR-007, STR-010, ATH-003, HYB-003, LOAD-003.
- **Datos:** metadata de [`exercise-schema-v1.md`](./exercise-schema-v1.md) (SFR, fatiga local, estrés articular, skill, cardioCompatibility).
- **No debe:** elegir por novedad/viralidad; rotar compuestos principales semanalmente; ignorar estrés lumbar dado el historial.

## 7. Progression Engine
- **Inputs:** logs de rendimiento, cualidad dominante del bloque, tendencias.
- **Outputs:** nuevas cargas/volumen/paces para la próxima sesión.
- **Decide:** qué avanza y qué se mantiene.
- **Reglas:** GEN-001 (una cualidad), STR-001 (volumen antes que carga en déficit), END-003 (~10%/sem soft), LOAD-001 (sin spikes).
- **No debe:** progresar todas las cualidades a la vez; saltar volumen/carga bruscamente.

## 8. Recovery Engine (override)
- **Inputs:** readiness sostenida, señales de overreaching, dolor/tendón, adherencia.
- **Outputs:** override de la sesión/semana: degradar, sustituir modalidad, deload, o priorizar sueño.
- **Reglas:** READ-007/008, LOAD-002/003/004, REC-002/005.
- **No debe:** eliminar fuerza reflexivamente ante dolor lumbar (LOAD-003); descansar tendón a cero (LOAD-002).

## 9. Evidence Engine (transversal)
- **Inputs:** cada decisión de cualquier motor + su `ruleId`.
- **Outputs:** anotación `{ruleId, population, energyState, applicabilityToUser, evidenceLevel, confidence, caveats}`.
- **Decide:** nada — etiqueta y expone trazabilidad y conflictos (GEN-002, GEN-003).
- **No debe:** dejar pasar una decisión sin fuente; normalizar enums (todos ya usan el vocabulario único).

---

## Notas de implementación futura (NO ejecutar aún)
- El generador actual (`PLAN` + `WEEK_TEMPLATE` hardcodeados en `app/app.js`) sería reemplazado por
  este pipeline leyendo `evidence-to-rules.md` + los schemas. **No se toca en esta fase.**
- El State Store ya existe parcialmente (IDB `workouts`/`plans`/`exercises` + Supabase + Whoop/Intervals).
- Orden sugerido de construcción posterior: Readiness → Interference + hard-day budget → Modality →
  Exercise Selection (requiere metadata poblada) → Strength/Cardio/Hybrid → Progression → Block Planner.
