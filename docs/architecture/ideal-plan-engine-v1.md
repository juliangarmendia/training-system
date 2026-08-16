# Ideal Plan Engine — v1 (Preview)

**Frase guía:** build the ideal evidence-based weekly plan for results, then adapt it intelligently
based on real recovery, load, equipment, and constraints.

T4 v1 = **preview read-only**. La semana ideal está **encodeada como DATA** (`IDEAL_BLOCK_V1` en
`app/app.js`), derivada de la evidencia y trazada a Rule IDs. Se muestra al lado del plan actual.
**No** toca `PLAN`/`WEEK_TEMPLATE`/generador/logs; "Aplicar" está inerte (→ T5). Este doc es además la
**spec del generador algorítmico** (T4b) y del **loop de adaptación** (T6).

## Bloque v1
- **Objetivo:** recomposición atlética + base aeróbica + mantenimiento de fuerza. 5 semanas (4 build +
  1 deload, LOAD-004).
- **Progresa:** base aeróbica / running. **Mantiene:** fuerza pesada (2×/patrón), hipertrofia útil,
  movilidad/athleticism. Déficit moderado en paralelo (REC-001/002).
- **Arco de running:** S1 2×Z2 25-30' → S4 1 largo Z2 45-50' + 1 Z2/Z3 → S5 deload (END-003/004/005).

## Lógica de generación (cómo se deriva del knowledge base)
1. **Objetivo dominante (GEN-001):** una cualidad progresa, el resto se mantiene. v1 fijo; T4b lo
   elige desde goals + historial.
2. **Estructura semanal:** fuerza 2×/patrón (STR-002) con ≥1 slot pesado (STR-005); cardio mayormente
   fácil ~80/20 (END-001); intervals ≤1/sem (END-004); recovery 1-2 días.
3. **Hard-day budget (BUD-001/002):** suma de `budgetWeight` (de `SESSION_TYPES`) ≤ ~6. Si una variante
   excede, se baja la intensidad del 2º cardio o se quita un día duro.
4. **Interferencia (INT-001/002/004, HYB-002):** pierna pesada en fresco; no correr fuerte <24 h antes
   de pierna; bici/remo/ski cuando hay impacto/fatiga de tren inferior; híbrido nunca el mismo día que
   pierna y cuenta como duro; potencia solo fresca.
5. **Variantes 3/4/5 días:** mínima (preserva fuerza pesada + mínimo aeróbico), estándar (2 fuerza + 2
   cardio), óptima (3 fuerza + 2 cardio + microdosis movilidad). Budgets: 4.5 / 4.5 / 5.5.
6. **Duración 45/60/75:** `core` (compuestos + 1-2 accesorios), `standard` (sesión completa), `extra`
   (+ accesorios + movilidad/finisher).
7. **Hybrid/athleticism:** HYB-001 (0-1/sem, en lugar de un cardio, no además), HYB-003 (baja skill);
   ATH-001/002/003 (plyo/power/core en microdosis, fresco).

## Alternativas y equipo
- Por día: `ALT_LIBRARY` (T3) por family + situación (low readiness / gym lleno / fatiga / tiempo /
  equipo), con razón + Rule IDs.
- `EQUIP_SUBS`: sin SkiErg→row/bici/incline-walk; sin sled→carries/incline-push/leg-press/bike-int;
  sin rack→máquinas/DB/Smith/leg-press; gym lleno→DB-only/máquinas/cardio.

## UI
`renderIdealPreview()` (vista `#view-ideal-preview`, abierta desde Settings → "Ver plan ideal"):
objetivo del bloque, toggles 3/4/5 días y 45/60/75', semana ideal (día · tipo · nivel · duración · por
qué · alternativas), plan actual al lado, hard-day budget X/6, cuidados que respeta, sustituciones de
equipo, y botón "Aplicar" **deshabilitado** (T5). Lenguaje plano; sin Rule IDs en pantalla.

## No-mutación
Solo lee `activeWeekTemplate`/`activePlan` para el lado "actual". No escribe plan/sesiones/logs. Rollback
= revertir commit (sin cambio de schema).

## Adaptación semana-a-semana (spec para T6, NO implementado en T4)
Mirar: adherencia, sesiones completadas, RPE, fuerza, km/semana, WHOOP recovery trend, hard-day budget,
peso/fat-loss. Ajustar: subir running ~10%/sem si la base aguanta; mantener fuerza; bajar volumen si muy
cargado; cambiar modalidad si hay impacto; mover/quitar híbrido; deload si corresponde. **Nunca progresar
todo a la vez** (GEN-001). Todo con aprobación (no auto-mutación).

## Dirección confirmada (usuario, 2026-06-26) — el ideal es el DEFAULT
El plan ideal NO es algo a "aplicar" manualmente: debe ser el **default automático**. El usuario solo
elige el **número de días (3/4/5/6)** para flexar estímulos según la semana (viaje → 3; semana holgada
→ 6). Días extra = carreras Z2 fáciles (correr 30' casi no suma carga dura). **Variante de 6 días ya
agregada** (v11.27): budget ~6, sin sumar días duros. → reformula T5 (abajo).

## T5 — IMPLEMENTADO (v11.28, 2026-06-30)
El plan ideal es ahora el **default vivo**. `applyIdealPlan()` (en `init()`, reemplaza a
`applyReentryPlan()`) instala `Ideal · {n} días` como versión activa del store `plans`;
`buildWeekTemplateFromIdeal(n)` deriva el week template desde `IDEAL_BLOCK_V1.variants[n].days`
(strength→gym vía `planRef`, cardio→run, recovery→rest). El selector de días persiste en
`state.settings.idealVariant` (default **5**, sincronizado); `setIdealVariant(n)` regenera el plan
**hacia adelante** como versión nueva — los logs (`workouts`/`runs`/`sessions`) son stores aparte, intactos.
Idempotente por label (no churn de versiones por carga). Se eliminó el botón "Aplicar". El advisory
diario (T3) sigue flexando dentro del día.

**Decisiones de implementación:**
- El ideal **reemplazó el ramp de re-entry de inmediato** (decisión del usuario 2026-06-30, no esperó al
  cierre de ventana 2026-07-12). `applyReentryPlan()`/`REENTRY_*` quedan en el código sin invocarse (rollback).
- Se autoraron sesiones concretas `fullA`/`fullB`/`maintenance` en `PLAN.sessions` (variantes 3/5/6),
  reutilizando ejercicios de la librería, con **objetivos kg heredados del baseline W28** y caución lumbar.

## T5.1 — IDEAL real + cardio visible + logger Cardio (v11.29, 2026-07-01)
Tras uso real, se corrigió el IDEAL y se arreglaron bugs de visibilidad:

- **IDEAL redefinido** (objetivo: bajar grasa/recomp/estética, 87→81-82 kg, estímulo los 7 días). Default =
  variante **6 "Completa"**: **4 días Upper/Lower** (`lowerA`/`upperA`/`lowerB`/`upperB` — cubren los 6 patrones
  2×/sem, ~14-18 series/músculo) + **Z2 finisher diario** (campo `z2Finisher` en días de fuerza) + 1 cardio de
  calidad + 1 recuperación activa. Variantes 3/4/5 flexan hacia abajo. `state.settings.idealVariant` default → **6**.
- Se **eliminó la sesión `maintenance`** (era relleno flojo: no cubría OHP ni dominadas, cuádriceps 1×/sem).
  El IDEAL usa los 4 probados; `fullA`/`fullB` quedan para las variantes 3-4.
- **Modelo de slot extendido**: gym `{session, z2FinisherMin}` · cardio `{type:'run', subtype, durationMin}` ·
  `{type:'recovery', z2FinisherMin}`. `getPlannedSessionForDate` resuelve los 4 tipos.
- **Causa raíz del "solo veo 2 entrenamientos"**: los renderers de Home usaban `getPlannedSession()` (gym-only →
  null para cardio). Reescritos `renderTodaysPlan`/`renderHomeQueue`/`renderWeekCalendar`/`pickDayActivity` para
  usar `getPlannedSessionForDate()` → el cardio se ve los 7 días (indicador aeróbico en días con Z2).
- **Selector en Home**: `renderPlanSelector()` (`#plan-selector`) con botones 3/4/5/Ideal → `setIdealVariant()`,
  que ahora re-renderiza Home y **limpia overrides futuros** (`clearFutureScheduleOverrides`) para que el cambio
  se vea en la semana actual, preservando días pasados.
- **Quick-mode** (ya existía) es el compresor de tiempo: sesiones completas 60-75', quick-mode ~40-45'. Se quitó
  el toggle de duración 45/60/75.
- **Logger Cardio unificado**: pestaña Run→**Cardio**; `logCardio()` (un form: modalidad run/cinta/bici/remo/ski/
  caminata + intensidad Z2/Z3/umbral/intervalos/largo) escribe a `sessions` (envelope T1). Historial/totales siguen
  leyendo los `runs` legacy vía `toSession()`.

## T5.2 — Swaps persistentes + prescripción de cardio + push intervals.icu (v11.31, 2026-07-02)
- **Swaps de ejercicio persistentes y reversibles**: `exerciseOverrides = {sessionId:{origId:{id,name}}}` en settings
  (sincronizado, `loadExerciseOverrides` en init). `resolveSessionExercises()` los aplica en `startWorkout` y en la
  rama gym de `getPlannedSessionForDate` (mantiene el esquema sets/reps del slot). `buildExerciseCard` guarda
  `origId/origName`. `showSwapUI` reescrito: persiste vía `setExerciseOverride`, ofrece "↩ Volver al original"
  (`clearExerciseOverride`) y llama `saveActiveWorkout`. NO lo pisa el cambio de variante del ideal.
- **Prescripción de cardio**: `buildWeekTemplateFromIdeal` lleva `summary` al slot; `getPlannedSessionForDate` cardio
  devuelve `summary` + `hrTarget`. `renderTodaysPlan` y `renderRunPlanBanner` muestran duración + zona + qué hacer +
  rango de FC (o guía RPE/conversacional vía `cardioIntensityGuide`). Se quitó el "HR<140" hardcodeado.
- **Zonas de FC desde intervals.icu**: `fetchIntervalsIcuZones()` lee el perfil del atleta (sportSettings/LTHR/max_hr),
  cachea `settings.icuZones` (sincronizado); corre en `intervalsIcuSync` y al guardar credenciales. `cardioHrTarget(subtype)`
  devuelve el rango bpm. Defensivo: bpm nativos → derivado de LTHR → derivado de FCmax → guía sin bpm.
- **Push de cardio del día**: `pushCardioToIntervalsIcu()` + `_generateCardioDsl()` — action sheet de modalidad
  (bici→Ride, correr/cinta→Run, remo→Rowing, ski→Workout), `POST /athlete/{id}/events`, `external_id: pwa-cardio-{date}`
  (idempotente). Botón en la tarjeta de cardio (Home) y en el banner de la pestaña Cardio.
  > ⚠️ Corregido en v11.33: el DSL emitía bpm absolutos (inválidos) y `/events` no era idempotente.

## T5.3 — Catálogo de cardio → COROS cualquier día (v11.32, 2026-07-02)
`CARDIO_LIBRARY` (data): workouts curados (Z2 5/8/10k, bici Z2 40/60, remo Z2, progresivo, umbral 3×8, VO2 5×3,
bici 4×4, remo 6×2, recuperación) con builder de DSL intervals.icu (repeats con sintaxis indentada). `renderCardioLibrary()`
muestra el catálogo SIEMPRE en la pestaña Cardio (no solo días de cardio). `pushCardioWorkout(item)` → `POST /events`
(external_id `pwa-cardio-{date}-{id}`) para HOY. `_icuZoneToken(z)` usa las zonas bpm cacheadas (o etiqueta Zn).
Resuelve: poder mandar a COROS cualquier día (ej. correr en un día de fuerza).
> ⚠️ Corregido en v11.33: los repeats NO se agrupan por sangría y `_icuZoneToken` no puede emitir bpm.

## v11.33 — Fix: objetivos de FC rotos en el envío a COROS (2026-08-15)

**Causa raíz:** intervals.icu **no soporta objetivos de FC en bpm absolutos**. El desarrollador lo
confirma explícitamente: *"You need to specify the HR range in % of threshold HR. This is so
workouts are portable between athletes."* La guía del workout builder sólo documenta `60% HR`
(% de FCmáx), `95% LTHR` y `Z2 HR`.

T5.2 introdujo `_generateCardioDsl` emitiendo `- 40m 128-145 HR` bajo el supuesto
*"cached bpm zones … most accurate for COROS"*, y T5.3 lo extendió a todo el catálogo vía
`_icuZoneToken`. Sin `%`, intervals.icu parsea ese número como **porcentaje**: 128-145 % de FCmáx
≈ 240-275 bpm → objetivo imposible en el reloj. Antes de T5.2 sólo existía `_generateIntervalsIcuDsl`
emitiendo `Z2 HR`, que sí funcionaba.

Corregido:
- **`_icuZoneToken(z)`** reducido a etiqueta de zona `Zn HR`, siempre. Es el punto único que decide
  el formato del objetivo. Las bpm de `settings.icuZones` quedan **sólo para pantalla**
  (`cardioHrTarget`), nunca en el DSL. Arregla también `z1`, que antes no estaba en el map y
  mezclaba dos formatos dentro del mismo workout.
- **`_generateCardioDsl`** usa `_ICU_ZONE_BY_SUBTYPE`; **`_generateIntervalsIcuDsl`** traduce la
  rama legacy `target_hr_max` (bpm crudos) a zona con el nuevo `_zoneForBpm()`.
- **Bloques de repetición**: los `Nx` iban con sangría y sin líneas en blanco. La sangría no agrupa
  nada — *"Leave one empty line before and after every repeat block"* — así que la vuelta a la calma
  se absorbía dentro de la serie (umbral 3×8 compilaba a 10+3×(8+2+5) = 55 min en vez de 45).
  Helpers `_icuRepeat` / `_icuDsl` concentran la regla.
- **Duplicados**: `POST /events` NO deduplica por `external_id` (el comentario "idempotent" era
  falso); cada reenvío creaba un evento nuevo y el COROS recibía varios el mismo día. Nuevo
  `_icuUpsertEvents()` → `POST /events/bulk?upsert=true`, usado por los tres pushes. Se mantiene
  `external_id` por workout: reenviar el mismo lo actualiza, y dos distintos conviven en un día.
- **`fetchIntervalsIcuZones`** endurecida (un array de % de LTHR como [68,83,94,105] pasaba el test
  de "parece bpm") y añade `z.zone1` / `z.recovery`.

## Auditoría del bloque (2026-08-16) — correcciones a este documento

Auditoría completa en
[`../../assessments/2026-08-16_system-audit.md`](../../assessments/2026-08-16_system-audit.md) §1.
Afirmaciones de este documento que **eran falsas** y quedan corregidas aquí:

| Decía | Realidad |
|---|---|
| T5.1: los 4 días *"cubren los 6 patrones 2×/sem"* | **Falso.** En la variante 6, empuje horizontal, press vertical y tirón vertical son **1×/sem** (10 series de pecho en una sola sesión). Solo tirón horizontal, sentadilla y bisagra llegan a 2× |
| UI: `renderIdealPreview()` muestra *"hard-day budget X/6"* | **Ya no lo muestra.** Y el budget planificado de la variante 6 suma **7,5** contra un tope de 6 |
| "5 semanas (4 build + 1 deload, **LOAD-004**)" | **No está implementado.** `isDeloadWeek(wk)` sigue siendo `wk === 5 \|\| wk === 9` del programa de abril; `getWeekNumber()` va por ~la 19 → **devuelve `false` para siempre** desde mayo |
| Arco de running "S1 25-30' → S4 45-50'" (END-003) | **No hay progresión.** Los `durationMin` son constantes (40 y 50) y no cambian nunca |
| Variante 5 = *"3 fuerza (lower/upper/upper)"* | Correcto pero es la elección equivocada: al bajar de 6 a 5 días se cae **`lowerB`**, así que el **sumo deadlift desaparece de la semana** entera |
| `progressing: ['Fuerza/hipertrofia', 'Base aeróbica']` vs GEN-001 | **No es una violación.** GEN-001 fue reatribuida y degradada a `expert` en la ronda 4: sus fuentes (Huiberts 2024, Soligard 2016) no sostenían el claim. Dos cualidades en progresión son defendibles para este perfil |

Ninguno de estos puntos se arregló en el código: son decisiones D1-D5 del informe, pendientes de
que el usuario elija. Lo que **sí** se corrigió es la visibilidad (abajo).

## v11.34 — El Z2 finisher pasa a existir (2026-08-16)

`z2Finisher` estaba en los datos de 9 días (80 min/semana en la variante 6) y era **la tesis del
bloque**: "estímulo aeróbico los 7 días". Rastreado en el código, su único uso era concatenar el
texto `+20' Z2` en el eyebrow de Home y en la cola semanal. No se renderizaba dentro del
entrenamiento, no se podía registrar ni enviar al reloj, no tenía zona ni FC objetivo, y no contaba
en el budget. **Los 4 días de fuerza no tenían dosis aeróbica real.**

Corregido en `renderTodaysPlan()`:
- Los días de **fuerza** ganan tarjeta de prescripción (reutiliza `.cardio-rx`, que los días de
  cardio ya tenían): ejercicios con series × reps @ RPE, y el Z2 finisher como bloque propio con
  duración, FC objetivo real (`cardioHrTarget`) y qué hacer.
- Nuevos `logZ2Finisher()` y `pushZ2FinisherToIntervalsIcu()`. Se registra como sesión normal
  (`family: 'cardio'`, `subtype: 'zone2'`) con `origin: 'z2_finisher'` para distinguirla, así que
  **cuenta en el hard-day budget** como cualquier otro Z2.
- El día de **recuperación** lleva el mismo bloque (también tiene `z2Finisher: 20`).

**No añade volumen:** la dosis está prescrita desde v11.28; lo que cambia es que ahora existe en la
interfaz.

## v11.34 — Recomendación en el catálogo de cardio (2026-08-16)

`CARDIO_LIBRARY` permitía enviar VO₂ 5×3 la víspera de pierna pesada sin que nada dijera nada.
`renderCardioLibrary()` es ahora `async` y consume `computeTrainingAdvisory()` —que ya calculaba
sesión planificada, nivel de esfuerzo, WHOOP y budget, sin estar conectada al catálogo— para:
badge **"Recomendado hoy"** en el workout que encaja con el plan, y aviso en los exigentes cuando
hoy toca pierna (INT-001), la semana pasó el tope (BUD-001) o la recuperación está en rojo.

**Decisión explícita del usuario: avisar, nunca bloquear.** Los 13 workouts siguen enviables
cualquier día.

## Roadmap
- **T4b:** generador algorítmico (arma bloque/semana desde reglas+perfil en runtime; hoy `IDEAL_BLOCK_V1` es data).
- **T6:** loop de adaptación semanal + periodización multi-bloque + progression/modality engines.
- **Antes que ambos:** arreglar el sync de Supabase (apagado desde ~2026-06-30) y decidir D1-D5. Sin
  datos no hay adaptación posible, que es justo lo que T6 promete.
