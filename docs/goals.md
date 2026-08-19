# Goals and Constraints

> Last updated: **2026-08-19** — objetivo de peso confirmado por Julian y traducido a composición
> real medida.

## 🎯 El objetivo, aclarado (2026-08-19)

**El objetivo es el número de la báscula: 79-81 kg.** Palabras de Julian: *"siempre que peso entre
79-81 kg me siento muy bien atlético, rápido, en buena forma física."*

Eso resuelve la contradicción que tenía este documento (pedía 80-83 kg **y** 15-17% de grasa a la
vez). Con **72,8 kg de masa libre de grasa** medidos por Tanita el 11-ago:

| Peso | Grasa | % |
|---|---|---|
| **87,1 kg (hoy)** | 14,3 kg | 16,4% |
| 85 kg | 12,2 kg | 14,4% |
| 83 kg | 10,2 kg | 12,3% |
| **80 kg (objetivo)** | 7,2 kg | 9,0% ← *sólo si la masa magra no se moviera nada* |
| **80 kg (realista)** | ~8,5 kg | **~10,5-11%** ← lo esperable |

**Realista, no aritmético.** Bajar 7 kg no es perder 7 kg de grasa: incluso con proteína alta y
entrenamiento de fuerza, entre el 15% y el 20% de la pérdida suele ser masa magra. Lo esperable en
80 kg es **~10,5-11% de grasa**, no 9%. Sigue siendo bastante magro y es un objetivo legítimo — la
sensación subjetiva de estar atlético y rápido a ese peso es un dato válido, y menos peso además
ayuda a correr, que es otro objetivo.

**El ritmo importa más que el número.** 7,1 kg a **~0,45 kg/semana (0,5%) = 16 semanas**, con un
déficit de ~500 kcal/día.

> Corregido el 2026-08-19: aquí decía 12-16 semanas. **Las 12 exigirían ~650 kcal/día de déficit**,
> por encima de la banda de 300-500 que fija `CLAUDE.md`. Lo honesto es **16-18 semanas**. Ir más
> rápido no acelera el resultado: acelera la pérdida de masa magra, que es justo lo que no se quiere
> cuando el objetivo es *verse atlético* y no *pesar menos*. Cálculo en `plans/nutrition-notes.md`.

**Y lo que de verdad decide si funciona: entrenar.** Lo que protege la masa magra en déficit es el
estímulo de fuerza, no la dieta. Con 1-2 sesiones por semana se llega a 80 kg más blando; con 4 se
llega a 80 kg atlético. **La adherencia no es un objetivo aparte: es el mecanismo de este objetivo.**

### Objetivos, en orden

1. **Peso 79-81 kg**, a ~0,5%/semana (~0,45 kg), sin prisa
2. **Masa magra**: mantener los 72,8 kg lo máximo posible — es lo que separa "80 kg atlético" de
   "80 kg flaco". Medido por rendimiento en los compuestos, no por la báscula
3. **Fuerza**: mantener o subir en banca, sentadilla, peso muerto, press militar, remo, dominadas
4. **Correr**: base aeróbica progresiva; el peso más bajo ayuda aquí directamente
5. **Adherencia**: es el requisito de 1 a 4, no un extra

> ⚠️ Las **restricciones operativas** de abajo describen el plan de abril y ya no coinciden con el
> sistema vivo:
>
> | Dice | Realidad desde v11.28 (2026-06-30) |
> |---|---|
> | "Training days/week: 4 gym + 2-3 runs" | 4 sesiones de fuerza + Z2 casi diario + 1 cardio largo + recuperación activa (variante 6 del IDEAL); el usuario flexa a 3/4/5 días |
> | "Running schedule: Wed + Sat" | El IDEAL coloca los días; el selector de variante los mueve |
> | "Equipment access: power rack, barbell..." | Inventario del gimnasio anterior. El actual es David Lloyd Serrano (ver `profile.md`) |
> | "Timeline: 10-16 weeks... Reassessment at week 9" | Vencido. Arrancó en abril; la reevaluación nunca ocurrió |
> | "Deload every 4-5 weeks" | ✅ Arreglado en v11.35: anclado al bloque de 5 semanas |
>
> El objetivo declarado del sistema hoy es más amplio que este documento: recomposición atlética
> híbrida, con **cardio como cualidad co-igual** (`CLAUDE.md`), no carrera como modalidad secundaria.
> Y la salud entra ahora por `LONG-001..004`. → [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md)

## Primary goals *(superseded — ver la sección de arriba, 2026-08-19)*

1. ~~**Fat loss:** 5-8 kg at 0.5-0.7% body weight/week (0.44-0.62 kg/week at 88.6 kg)~~ → **7,1 kg desde 87,1 hasta 80 kg**, mismo ritmo
2. ~~**Muscle preservation:** maintain lean mass (~69.8 kg FFM)~~ → **72,8 kg FFM medidos**, no estimados
3. **Strength:** maintain or increase working weights on bench, squat, deadlift, OHP, row, chin-up ✅ sin cambios
4. **Running:** build a sustainable zone 2 habit ✅ sin cambios
5. **Body composition:** *"leaner, stronger, not just lighter"* — sigue siendo la frase correcta, y ahora está cuantificada

## Timeline

- **7,1 kg a ~0,45 kg/semana → 16-18 semanas** desde el 2026-08-19 (déficit ~500 kcal/día)
- Deload cada 5 semanas (anclado desde v11.35), con diet break a mantenimiento encima
- **Calorías cicladas:** ~2.700 en días de entreno, ~2.400 en descanso (media ~2.570). Mantiene la
  disponibilidad energética por encima de 30 kcal/kg de masa magra los dos tipos de día — con la
  pauta plana de 2.500 caía a 27,5 en días de entreno. Detalle en `../plans/nutrition-notes.md`
- No es una dieta agresiva. Ante un estancamiento: primero paciencia, después ajustes pequeños
- Re-medir composición con la **misma** Tanita cada 8-12 semanas; el peso, en media móvil de 7 días

## Constraints *(actualizado 2026-08-19)*

- **Training days/week:** el selector flexa entre **Viaje / 3 / 4 / 5 / Ideal (6)**. El default es 6
- **Max session length:** 45-75 min gimnasio · ~30 min las sesiones de viaje
- **Equipment access:** David Lloyd Serrano (Madrid) — inventario completo en `profile.md`. Incluye
  **trineo + turf, SkiErg, Concept2, farmer handles**, que desde v11.42 sí se usan
- **Viajes:** son la restricción real y recurrente. La variante **Viaje** (peso corporal, banda
  opcional, cero gimnasio) existe desde v11.42 precisamente porque los viajes eran la causa de los
  huecos de 11-14 días entre sesiones
- **Off-limit days:** ninguno

## Non-negotiables

- **Proteína 185 g/día** (subido de 170 el 2026-08-19). Con 72,8 kg de masa magra medidos: 2,12 g/kg
  de peso y 2,54 g/kg de masa magra, dentro de los dos rangos de referencia. El suelo de 170 se había
  calculado con una masa magra *estimada* de 69,8 kg
- Compound lifts stay in the program
- At least one full rest day per week
- Sleep is a recovery tool, not optional
- Back squat gets programmed as a main lift (correcting previous gap)
- Deload cada 5 semanas, con diet break a mantenimiento

## What success looks like *(actualizado 2026-08-19)*

- **79-81 kg en la báscula**, con la sensación de atlético y rápido que Julian asocia a ese peso
- **~10,5-11% de grasa** al llegar — no 9%: parte de los 7 kg será masa magra, y fingir lo contrario
  sería aritmética, no fisiología
- Compuestos mantenidos o mejorados. **Es el indicador de que se llega atlético y no flaco**
- Corriendo con regularidad y más rápido, ayudado por el peso más bajo
- **Entrenando de forma sostenida, también en viajes** — para eso está la variante Viaje
- Sin quemarse, y con el sistema listo para la fase siguiente
