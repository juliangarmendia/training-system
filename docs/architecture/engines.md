# Engine Architecture — 3 motores implementados + 7 decisiones de diseño

> **v11.62 — el motor diario prescribe el kg y REPORTA; no ajusta.** Decisión del usuario
> (2026-09-07): *"nada de ajustar el entrenamiento del día por WHOOP; voy a ser yo y mi cuerpo el
> que decida skipear un ejercicio o bajar los pesos"*. En consecuencia, del día a día la app hace
> exactamente dos cosas: **prescribir el kg del set** (`suggestSetTarget`, dato propio y doble
> progresión) y **contar lo que pasó** (`sessionReadout`, `performanceLine`, `computeReadinessFrom`
> como información). El Readiness Engine deja de ser compuerta y pasa a ser **lector**: su salida
> se muestra y viaja al coach semanal, pero no degrada, no sustituye y no recorta. Todo lo que
> cambia el plan lo hace el **coach semanal**, sobre la semana entera y con aprobación.

Actualizado el **2026-09-07**. La cascada de 10 motores de más abajo se escribió en junio de 2026 como
spec de diseño. El audit del 2026-09-05 (§13.7) concluyó que **sólo 3 de los 10 hacen falta como
código** para una persona con un objetivo fijo; los otros 7 están resueltos **en tiempo de diseño** por
`IDEAL_BLOCK_V1`, la tabla de sustituciones, `ALT_LIBRARY` y el juicio del coach semanal. Construirlos
sería fabricar maquinaria para un problema que no existe. Esta cabecera existe para que nadie vuelva a
leer el documento como un backlog de diez.

Todas las reglas referenciadas (`STR-*`, `INT-*`, etc.) viven en
[`../../research/evidence-to-rules.md`](../../research/evidence-to-rules.md), única fuente de verdad.

## Cómo leer este documento ahora

Las dos tablas de esta cabecera dicen **qué existe y dónde**. Todo lo que viene después del separador
es el **spec original de 2026-06**: sigue siendo la mejor descripción de *qué decide cada capa y con qué
reglas* —y por eso no se borra—, pero **no es un plan de trabajo** y su nota final ("orden sugerido de
construcción") quedó superada por
[`coach-v2-implementation-plan.md`](coach-v2-implementation-plan.md).

### Lo que es código hoy (3 motores + los ayudantes de calendario)

| Motor | Función | Dónde | Versión |
|---|---|---|---|
| **7 · Progression** | `suggestSetTarget(ex, history, opts)` → `{kg, reps, rpe, source, reason}`, prioridad **coach > regla > último**; `sessionReadout` compara objetivo vs. hecho | `app/coach-engine.js` (puro) + `computeSessionTargets` en `app/app.js` | v11.57 |
| **2 · Readiness** (+ **8 · Recovery** como su salida) | `computeReadinessFrom(...)` → color por **≥2 señales concordantes** (READ-002) sobre **6 señales**. **Informativo desde v11.62**: se muestra (línea de Home + Stats), se sella en el registro (`readinessAtStart`) y viaja al coach semanal; **no ajusta la sesión** — la función que lo hacía se borró | `app/coach-engine.js` (puro) | v11.59 · v11.62 |
| **7b · Reporte del día** | `sessionReadout(...)` (objetivo vs. hecho, por ejercicio) y `performanceLine(workouts, runs, opts)` → `"Rendimiento: banca 95×8 ↑ · sentadilla 105×8 → · Z2 5,1 km @141"`. Es la mitad que cierra el lazo y la que pone el **rendimiento primero** en Home | `app/coach-engine.js` (puro) | v11.57 · v11.62 |
| **0b · Block Planner (mínimo)** | `blockWeekFromDates(fecha, anclaLunes, 5)` → semana 1..5 del bloque + `isDeload`; `blockLabel(fecha, anclaLunes, 5)` → `'B1'`, `'B2'`… (misma numeración que `facts.trajectory.program.blocks`); `progressCardioMin(...)` sube los minutos dentro del bloque (END-003); `suggestRunningWeek(...)` da la semana de carrera por fases run/walk → base → build → ready10k | `app/coach-engine.js` (puro) | v11.56 · v11.60 · v11.65 |
| **0c · Semana del coach** | `isoWeekKey(fecha)` → `'2026-W37'` (la clave canónica del sistema); `coachTargetWeekKey(fecha)` → la semana **PARA la que** se pide una revisión: **domingo → la siguiente, lunes-sábado → la actual**, porque cerrar el domingo es escribir la semana que empieza mañana; `PHASE_LABEL` etiqueta las 5 fases del contrato v2 (`base`/`build`/`intensify`/`deload`/`maintenance`) | `app/coach-engine.js` (puro) | v11.55 · v11.65 |
| **+ el coach semanal (LLM)** | hace de Block Planner completo, Goal y Selection una vez por semana: `buildCoachFacts` / `validatePlanVersion` (`app/coach-facts.js`) → edge function `coach-weekly-review` (Opus 5) → propuesta de plan v2 que Julian aprueba | `app/coach-facts.js` + `supabase/functions/coach-weekly-review/` | v11.61 / inc. 8 |

Los tres motores son **puros y testeados** (`tests/verify-set-target.mjs`,
`verify-readiness-trend.mjs`, `verify-performance-line.mjs`, `verify-block-week.mjs`,
`verify-running-week.mjs`, `verify-coach-facts.mjs`, `verify-plan-validator.mjs`): sin DOM, sin
IndexedDB, sin `fetch`. El cableado a pantalla lo vigila `verify-coach-wiring.mjs`, cuya §16 fija
que el ajuste diario no vuelva y cuya §17 fija el orden de Home, el `coachBrief` en el plan y las
tres fechas de `coachTargetWeekKey`.

### v11.67 — lo que cambió en los motores (auditoría 2026-09-08, E-1…E-11)

La auditoría del 8 de septiembre encontró tres motores prescribiendo sobre el calendario, sobre un
dato ausente, o sobre una segunda aritmética. Esto es lo que se cambió y por qué:

| Cambio | Antes | Ahora | Por qué |
|---|---|---|---|
| **E-1 · tope del salto de carga** | el escalón salía del material: 4 → 6 kg en mancuerna (**+50 %**), +2,5 en una máquina de 20 kg (+12,5 %) | `LOAD_JUMP_MAX_PCT = 0.10` en `coach-engine.js`; por encima del 10 % se mantiene el kg y se piden reps hasta cerrar el tope del rango **dos** veces seguidas | el validador del coach ya rechazaba esos saltos (`LOAD-JUMP`, `VP_LOAD_JUMP_PCT`) mientras la regla de la app los prescribía sin mirar. Un tope para las dos fuentes, o el coach queda sujeto a un límite que la app se salta. STR-009 |
| **E-2 · RPE ausente** | la condición era `avgRpe == null` **o** `avgRpe <= rpeTop`: "no lo anoté" contaba igual que "me sobró", así que una sesión al fallo sin RPE sumaba +2,5 kg | sin RPE hace falta `allHitMax` en **dos** sesiones utilizables consecutivas; si no, mismo kg y *"sin RPE: subo sólo tras dos sesiones al tope"* | sin el dato no se puede saber si sobró margen. Una sesión al tope puede ser una sesión al límite; dos son una tendencia |
| **E-3 · una fila por día** | dos registros del mismo ejercicio el mismo día entraban como dos sesiones: `usable[0]` y `usable[1]` eran el mismo entreno | `_coachDedupeHistory(hist, type)` deduplica por fecha y se queda con la de **más series hechas** | disparaba *"dos sesiones iguales"* el día del primer levantamiento, y `daysSince` salía 0 sobre un intervalo que no existía |
| **E-4 · vigencia única** | los kg del coach caducaban (semana ISO actual o anterior) y sus **minutos de cardio no caducaban nunca** | `coachTargetIsCurrent(planWeekKey, todayStr)` en el motor, usada por `suggestSetTarget` **y** por `_coachCardioMin` (con el mismo respaldo de 14 días por `createdAt`) | un plan de hace tres semanas prescribía 50′ mientras sus kg ya habían cedido el paso a la regla: el mismo plan con dos vidas distintas |
| **E-5 · descarga por ejercicio** | `deload` era `false` para **todo** el plan en cuanto `author === 'coach-llm'` | `deloadFor(exId)`: se libran del recorte sólo los ejercicios que traen `target` del coach; el resto recibe su −10 % y RPE 5-6 | cierto que el coach dosifica la descarga… de lo que escribe. Un accesorio que no tocó recibía progresión normal en deload, contra G-H3 / LOAD-004 |
| **E-6 · la rampa de cardio** | `base × 1,1^(index−1)`: subía porque pasó una semana del bloque, no porque se hicieran los minutos | `progressCardioMin(base, block, {history})` rampa sobre la **mediana de los minutos de las dos últimas semanas ISO con dato en el mismo hueco**; sin dato, o con 14 días de hueco vacío, devuelve la base; el techo sigue siendo ×1,35 **sobre la base del slot** | cuatro semanas sin correr con una bici hace tres días seguían subiendo minutos: la puerta de los 14 días era global. El hueco del finisher y el de la sesión de cardio se leen por separado (`_cardioSlotHistory(jsDay, ds, kind)` en app.js) |
| **E-7 · fuera la dosis por recuperación** | `readiness.deloadHint` congelaba `weeklyKmTarget` y cerraba `qualityUnlocked` en `suggestRunningWeek` | `deloadHint` **no cambia ningún número**: sigue en la firma y aparece, como mucho, en `note`/`reason` | era una dosis derivada de WHOOP y del RPE aplicada sin aprobación — exactamente lo que Julian retiró el 2026-09-07. **La recuperación informa; la decisión semanal es del coach y del usuario** |
| **E-8 · el "próxima vez"** | `deload: false` fijo, "para no adivinar el calendario" | el deload **real** de la semana siguiente (`blockWeek(fecha + 7 d).isDeload`) | el bloque está anclado a fecha y se sabe con exactitud: la tarjeta del viernes prometía 95 kg y el lunes de descarga la pantalla prescribía 85 |
| **E-9 · una fuente por concepto** | dos constantes lb→kg, dos tolerancias de Z2, tres FFM, bloques de 9 semanas en el banner y de 5 en el motor, tope de presupuesto 6 contra una barra sobre 8, y `_weekNumToDate` devolviendo "hoy" | `LB_TO_KG`, `RW_Z2_TOLERANCE_BPM`, `LOAD_JUMP_MAX_PCT` y `ffmKg({bodyweightRows, settings, todayStr})` exportados por `coach-engine.js`; el banner usa `blockWeek()`/`blockLabel()`; la barra usa `VP_MAX_BUDGET`; `_weekNumToDate` devuelve el lunes ISO correcto o `null` | dos números para el mismo concepto son dos pantallas que se contradicen y una decisión que depende de cuál se leyó primero |
| **E-10 · lecturas dedupeadas** | doce agregaciones leían `runs`/`sessions` crudos | `getRunsDeduped()` / `getSessionsDeduped()`; las lecturas crudas que quedan están declaradas una por una en `tests/verify-dedupe-reads.mjs` con su motivo | la misma actividad de COROS llega por Strava **y** por intervals.icu: la racha contaba dos días donde había uno y el total del año se inflaba solo |
| **E-11 · nutrición** | `recomputeNutritionDay()` en cada pintado (escribir al mirar) y EA intradía pintada como estado | `computeNutritionDay` calcula, `recomputeNutritionDay` escribe (sólo desde `saveMeal`/`deleteMeal`/`nutCloseDay`), `nutDayForRender` pinta sin escribir; la EA lleva color y "faltan N kcal" sólo si `day.closed` | un render que escribe hace que el último dispositivo que MIRE la pantalla gane el merge. Y la EA es una magnitud diaria (REC-008): intradía sale siempre "crítica" y no significa nada |

**La precedencia de `ffmKg()`** — la que decide por qué número se divide la disponibilidad
energética y con qué FFM se calcula el BMR de Katch-McArdle:

1. `ffmKg` de una fila con `source:'withings'` de **menos de 14 días** (`FFM_FRESH_DAYS`);
2. si no, la derivada `peso × (1 − bfPct/100)` de la última fila medida con %grasa;
3. si no, la **declarada**: `settings.goals.preserve.ffmKg`, y si falta, `COACH_GOALS_DEFAULT` (72,8 kg).

El retorno lleva `source`, `date` y `ageDays` a propósito: sin ellos, la tarjeta de nutrición y el
pack del coach no pueden distinguir "28,9 medido ayer" de "28,9 sobre un número de agosto", que es
la diferencia entre un dato y una suposición. Lo consumen `nutFfmKg()`/`nutFfmDetail()` en
`nutrition.js` y `facts.nutrition.maintenance.ffmKg` en `coach-facts.js`.

Tests: `verify-set-target` (§10 el tope del 10 %, §11 el mismo día, §12 la vigencia),
`verify-cardio-progress` (nuevo), `verify-running-week` (§4, test **negativo** de `deloadHint`),
`verify-block-week` (§8 el banner y las constantes únicas), `verify-dedupe-reads` (nuevo),
`verify-nutrition-v2` (§13 recompute y EA, §14 la FFM), `verify-coach-wiring` (§18 aplicar contra la
base correcta y deshacer sin perder nada).

### Lo que son decisiones de diseño, ya tomadas (7)

| Motor del spec | Dónde está resuelto |
|---|---|
| **1 · Goal Engine** | `IDEAL_BLOCK_V1`: cada día de cada variante ya declara su `kind`/`subtype`. El objetivo dominante del bloque lo fija el macroplan B1-B4 (§C.1 del plan) y lo revisa el coach semanal |
| **3 · Interference** | resuelto en la plantilla: plyo primero en pierna A, cinta en tren superior, bici/ski en pierna, remo nunca tras bisagra, nada duro <24 h antes de pierna. Se **verifica**, no se calcula: `validatePlanVersion` (`RUN-BEFORE-LEGS`, `PLYO-PLACEMENT`, `HARD-CARDIO`) |
| **4 · Modality** | `CARDIO_LIBRARY` + el slot del día. `progressCardioMin` mueve minutos y **nunca** zona ni intensidad (END-002) |
| **5a/5b/5c · generadores** | no hacen falta: las sesiones son datos versionados (`plans`), no salida de un generador. El coach reescribe las que cambian |
| **6 · Exercise Selection** | `EXERCISE_ALTERNATIVES` + los swaps del usuario + la tabla de sustituciones de `plans/training-plan.md`. Los anchors **no rotan**; los accesorios rotan en la semana 1 del bloque (STR-010, `expert`) |
| **9 · Evidence** | no es un motor: los Rule IDs viajan **en el dato**. `decisions[].ruleIds` (store `decisions`), `target.evidence[]` en el plan v2 y `guardrails[].ruleIds` en `coach_reviews`. El corpus llega al coach como `rules-compact.json` |
| **0 · State Store** | IndexedDB (15 stores, DB v12) + Supabase (15 tablas). Ver [`db-schema-state.md`](db-schema-state.md) |

**Lo que sí sigue faltando** y no es un motor nuevo: nada de esto progresa por sí solo si el dato no
entra. El cuello de botella medido del sistema fue siempre la adherencia de registro, no la falta de
capas de decisión.

---

*Lo que sigue es el spec original de 2026-06, conservado íntegro.*

## Principios de arquitectura (invariantes) *(spec original, 2026-06)*

Cuatro de los cinco siguen vigentes: nada deriva dosis de un score compuesto (READ-003) y cada
decisión sale con su Rule ID. **El primero cambió en v11.62** y por eso se reescribe aquí.

1. ~~**Readiness es compuerta upstream**~~ → **Readiness es información, y actúa a escala
   semanal.** Modulaba el objetivo del día antes de que los motores de dominio generaran nada
   (READ-007); desde v11.62 no modula nada: se muestra, se registra y se le pasa al coach semanal,
   que sí puede cambiar la semana siguiente con aprobación. El motivo es del usuario, no técnico:
   el ajuste diario por wearable es demasiado subjetivo y quien conoce el día es él.
2. **Interference es un constraint resolver**, no una heurística suelta: recibe las sesiones de la
   semana y produce una colocación que respeta restricciones duras (INT-001, HYB-002, BUD-001).
3. **Progression progresa UNA cualidad dominante por bloque** (GEN-001); el resto se mantiene.
4. **Evidence Engine es transversal**: cada decisión sale etiquetada con `ruleId`, `population`,
   `applicabilityToUser`, `evidenceLevel`, `confidence`.
5. **Sin falsa precisión**: ningún motor deriva dosis numéricas exactas de un score compuesto
   (READ-003). Los buckets cualitativos son cualitativos.

## Flujo *(spec original, 2026-06)*

```
[State/Profile Store]
        │  (perfil, historial, logs, Whoop/Intervals, equipamiento)
        ▼
[0. Block Planner] ───────────► cualidad dominante + mantenidas, deload, diet break (semana/bloque)
        ▼
[1. Goal Engine] ─────────────► objetivo dominante de CADA sesión de la semana
        ▼
[2. Readiness Engine] ────────► green / yellow / red por TENDENCIAS (INFORMA; ya no es gate)
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

## 0. State / Profile Store *(spec original, 2026-06)*
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

## 2. Readiness Engine (LECTOR — ya no es gate, v11.62)
- **Inputs:** HRV/RHR rolling 7d, sueño, recovery score del día, RPE y calidad de las 2 últimas sesiones. **Seis señales**; el check-in subjetivo se retiró con el ajuste diario.
- **Outputs:** estado del día `green | yellow | red | unknown`, la lista de señales que lo justifican, la confianza y `deloadHint`.
- **Decide:** *nada*. Se muestra (Home y Stats), se sella en `workout.readinessAtStart` y viaja en el facts pack. Quien decide bajar el peso o saltar un ejercicio es el usuario; quien cambia el plan es el coach semanal.
- **Reglas:** READ-001..006, READ-008. **READ-007 ya no lo aplica la app** (sigue siendo cierto como principio; lo ejecuta la persona).
- **Datos:** tendencias, no valores diarios; baseline individual; el dato de hoy es de hoy o no existe (F-6).
- **No debe:** actuar por una sola métrica (READ-002); tratar el score como calculadora de dosis (READ-003); sobrescribir un rendimiento real bueno por un score malo (READ-005); **volver a tocar la sesión del día**.
- **Interacción:** alimenta la línea de rendimiento (junto a `performanceLine`, que va PRIMERO), la lista de Stats y el coach semanal. Ver [`readiness-rules.md`](./readiness-rules.md).
- **v11.65:** la línea de rendimiento/tendencias vive en **Stats › Today**; el WHOOP de hoy, en el tile **Readiness** de Home (`renderHomeStatTrio`, hoy o "—", nunca la fila de ayer).

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
- **Inputs:** objetivo, modalidad (de Modality Engine), fase de progresión de running, y **los minutos ya hechos en ese hueco** (v11.67, E-6). El `readiness` sigue entrando y **no mueve ningún número** (E-7).
- **Outputs:** sesión cardio (zona, duración/estructura, intervals/threshold/easy/long).
- **Reglas:** END-001..008.
- **No debe:** más de 1 sesión dura de cardio que choque con pierna; prescribir paces antes de base aeróbica (END-002); **rampar por el número de semana del bloque en vez de por lo hecho** (E-6); **recortar km o cerrar la puerta de la calidad por una señal de recuperación** — eso lo decide la revisión semanal, con el usuario delante (E-7).

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
- **Reglas:** GEN-001 (una cualidad), STR-001 (volumen antes que carga en déficit), STR-009 (doble progresión y sus magnitudes, con el **tope del 10 %**), END-003 (~10%/sem soft, `moderate`), LOAD-001 (sin spikes), GEN-002 (ningún número sin dato de origen).
- **No debe:** progresar todas las cualidades a la vez; saltar volumen/carga bruscamente; **pasar del +10 % del último top set** aunque el disco más pequeño del gimnasio lo obligue (v11.67, E-1: se piden reps y una sesión más al tope); **tratar un RPE ausente como RPE bajo** (E-2).

## 8. Recovery Engine (override) — **no existe como código, y no va a existir a escala diaria**
- **Inputs:** readiness sostenida, señales de overreaching, dolor/tendón, adherencia.
- **Outputs:** en el spec, un override de la sesión/semana. **En la app v11.62 no hay override de la sesión.** El declive sostenido (`deloadHint`, READ-008) se calcula y se le pasa al coach semanal, que puede proponer adelantar la descarga en la revisión — con aprobación, no con un botón en Home.
- **Reglas:** READ-008, LOAD-002/003/004, REC-002/005.
- **No debe:** eliminar fuerza reflexivamente ante dolor lumbar (LOAD-003); descansar tendón a cero (LOAD-002); convertir un día rojo en un recorte automático.

## 9. Evidence Engine (transversal)
- **Inputs:** cada decisión de cualquier motor + su `ruleId`.
- **Outputs:** anotación `{ruleId, population, energyState, applicabilityToUser, evidenceLevel, confidence, caveats}`.
- **Decide:** nada — etiqueta y expone trazabilidad y conflictos (GEN-002, GEN-003).
- **No debe:** dejar pasar una decisión sin fuente; normalizar enums (todos ya usan el vocabulario único).

### 9b · Ledger de evidencia — `buildEvidenceLedger(decisions, rules)` (R-11, v11.68)

El bucle **regla → decisión → resultado** existía entero y no se podía leer. El sistema obliga al
coach a citar Rule IDs (`decisions[].ruleIds`) y guarda el resultado de cada decisión (`outcome`),
pero no había ninguna agregación por Rule ID: la pregunta *"¿cuántas veces citamos REC-005 y
cuántas se retiró?"* no tenía respuesta en ninguna pantalla. Y es la pregunta que gobierna el
corpus: una regla `weak_extrapolated` citada veinte veces y declinada quince es exactamente la que
hay que degradar en `evidence-to-rules.md`.

| | |
|---|---|
| **Dónde** | `app/coach-engine.js` (puro), junto a los otros motores. **No** en `coach-facts.js`: eso lo sellaría en la edge function con `build-fn-assets.mjs`, y el servidor no lo usa — el ledger es una lectura de pantalla sobre datos que ya están en el teléfono |
| **Inputs** | `decisions` (el store completo, en cualquier orden) y `rules` (el diccionario `COACH_RULES` de `coach-rules.js`, generado desde el corpus) |
| **Outputs** | `[{ ruleId, cited, retired, lastWeek, grade, known }]`, ordenado por `cited` desc y, a igualdad, por `ruleId` asc (orden estable: la tabla no baila entre renders) |
| **Pinta** | `_coachRenderLedger()` en la vista Coach, sección **"Evidence ledger"** justo debajo del log de decisiones (es su agregado). Top 15 + *"Show all N"*; vacío: *"No decisions yet — the ledger fills in as the coach cites rules."* |
| **Test** | `tests/verify-visual-tokens.mjs` §8 — se **ejecuta** con un fixture de tres decisiones, no se grep-ea |

Cuatro decisiones de diseño que el test fija:

- **`retired` = `outcome === 'declined'`.** El vocabulario de `outcome` es cerrado
  (`COACH_OUTCOME_LABEL`: `accepted` · `declined` · `done`) y no tiene un `retired`. Lo más cercano
  a *"la regla no sobrevivió al contacto con la realidad"* es la propuesta que la citaba y se
  rechazó. `LEDGER_RETIRED_OUTCOMES` acepta además `rejected` y `retired` por si el vocabulario
  crece; lo que **no** se hace es inventar una categoría que nadie escribe.
- **Un id repetido dentro de la misma decisión cuenta una vez.** Citar STR-001 dos veces en la
  misma frase no son dos usos de la regla.
- **`lastWeek` es la clave ISO más alta, no la última leída.** El store no viene ordenado.
  Sin `weekKey` se deriva de `date` (ISO 8601, el jueves manda el año); sin fecha se queda en
  `null` — dato ausente, no semana inventada.
- **Un Rule ID que el corpus local no conoce se enseña con `known:false`**, tachado y sin grado.
  Puede ser un id alucinado que se colase por el saneado, o una regla retirada del corpus: las dos
  cosas son información sobre el bucle, y esconderlas es perder justo la señal interesante.

---

## Notas de implementación futura *(spec original, 2026-06 — superadas)*

> **Superadas el 2026-09-07.** La ruta que se tomó no es la de este apartado: en vez de reemplazar el
> generador por la cascada, el plan pasó a ser **dato versionado** (`plans`, esquema v2) que reescribe
> el coach semanal, con tres motores puros in-app para lo diario. Ver la cabecera y
> [`coach-v2-implementation-plan.md`](coach-v2-implementation-plan.md).

- El generador actual (`PLAN` + `WEEK_TEMPLATE` hardcodeados en `app/app.js`) sería reemplazado por
  este pipeline leyendo `evidence-to-rules.md` + los schemas. **No se toca en esta fase.**
- El State Store ya existe parcialmente (IDB `workouts`/`plans`/`exercises` + Supabase + Whoop/Intervals).
- Orden sugerido de construcción posterior: Readiness → Interference + hard-day budget → Modality →
  Exercise Selection (requiere metadata poblada) → Strength/Cardio/Hybrid → Progression → Block Planner.
