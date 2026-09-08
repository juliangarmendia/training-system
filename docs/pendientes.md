# Pendientes

> **Esta es la única lista.** Se lee de arriba abajo, un punto a la vez. Todo en castellano, sin
> etiquetas internas ni Rule IDs sin explicar.
>
> El *por qué* de cada cosa vive en [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md).
> Aquí está el *qué sigue*.
>
> Última actualización: **2026-09-08** (auditoría de la app: incremento 1 · v11.66 y incremento 3 · fn v4 hechos — P0, rendimiento, guardarraíles del coach en el servidor, corpus y advisors)

## Regla de trabajo

Un punto a la vez, en orden. **Solo interrumpe algo que esté perdiendo datos** — como pasó con el
SkiErg el 18 de agosto, que se estaba descartando en silencio.

Antes de cada tanda de trabajo: leer esta lista. Al cerrar un punto: actualizarla.

---

## Coach v2 (2026-09-07) — de plantilla fija a entrenador que decide

El audit del 5-sep concluyó que la app era *"una plantilla fija con libreta"*: sesiones estáticas, kg
sin prescribir, cardio a 40/50 min constantes desde junio, y un coach semanal cuya prescripción moría
en una tarjeta de Stats. El plan aprobado
([`architecture/coach-v2-implementation-plan.md`](architecture/coach-v2-implementation-plan.md)) son 10
incrementos. Estado de hoy:

### Desplegado hoy

| # | Versión | Qué |
|---|---|---|
| 1 | v11.55 | **Cimientos.** `enqueueSync` gatea por configuración y no por cliente (descartaba en silencio todo lo escrito antes de `initSupabase`); DB v12 con `coach_reviews` y `decisions` + sus dos tablas Supabase; `settings.goals`; `logDecision` |
| 2 | v11.56 | **Semana del bloque y cardio que progresa.** `blockWeekFromDates` + `progressCardioMin`: "Semana 3/5 · build" y los minutos suben dentro del bloque (40 → 45 → 50 → 55 → 30). Ancla por **fecha** (`deloadAnchorDate`), que ya no se mueve al editar `startDate` |
| 3 | v11.57 | **La app prescribe el kg del set.** `suggestSetTarget` (coach > regla > último), objetivo con chip en la tarjeta, ese kg como placeholder de todas las series, marcar una serie sin peso lo acepta, y la "Lectura del coach" al terminar. `generateCoachNote` borrado |
| 4 | v11.58 | **El dato de recuperación es de hoy o no existe.** WHOOP directo para hoy, intervals.icu para el histórico; fechas en local. Y `toSession` clasifica desde `IDEAL_BLOCK_V1`, no por regex (`fullA`/`hybrid1`/`travelA` estaban mal en 6 de 10) |
| 5 | v11.59 | **Un readiness para todo.** `computeReadinessFrom` (8 señales, ≥2 concordantes) + `adjustSessionForReadiness`; se acabaron los tres cálculos que discrepaban y el "Push hard today" derivado de un score |
| 7 | — | **Facts pack.** `app/coach-facts.js`: `buildCoachFacts`, `validatePlanVersion` (32 avisos con Rule ID), `diffPlanVersions`, `mergeProposal` + `rules-compact.json`. Cero cambio visible, cero coste |
| 8 | — | **Edge function `coach-weekly-review` desplegada y ACTIVA** (Opus 5, ~$0,50-0,70 por revisión). Nunca escribe `plans` |
| 10 | — | **Retiro y docs** (esto): el cron pasa a [`/coach-deep-dive`](../.claude/commands/coach-deep-dive.md) manual, `engines.md` reescrito como "3 motores + 7 decisiones de diseño", nuevo [`plan-v2-schema.md`](architecture/plan-v2-schema.md) |

### En marcha

- **Incremento 6 (v11.60) — carrera hacia el 10k.** `suggestRunningWeek`: fases run/walk → base →
  build → ready10k, con el DSL de trote/caminata que llega al reloj. Arranca en run/walk porque las
  cuatro últimas carreras fueron a 147-155 bpm sobre una Z2 que acaba en 143: **cero en Z2**.
- **Incremento 9 (v11.61) — vista Coach y aprobación.** Tarjeta del lunes, diff de la propuesta,
  avisos, y **[Aplicar] [Ajustar] [Rechazar]**.

---

## Coach v2.1 · Carril B — el coach manda sobre la semana, no sobre el día (2026-09-08)

Julian revisó Coach v2 en uso el 7-sep y corrigió la dirección: *"nada de ajustar el entrenamiento
del día por WHOOP"* y *"el coach tiene que darme feedback de la semana pasada, decirme en qué etapa
estoy, cómo viene el objetivo y cuál es el enfoque de la semana — por qué cambia o por qué sigue
igual"*. Plan completo en
[`architecture/coach-v2.1-implementation-plan.md`](architecture/coach-v2.1-implementation-plan.md).

| Paso | Qué | Estado |
|---|---|---|
| B-1 | **Retirada del ajuste diario.** Fuera el consejo del día, el hero de WHOOP, el check-in de 2 toques y el banner de descarga; entra `renderRecoveryLine` (rendimiento primero, tendencias después) y el presupuesto de días duros se muda a Stats. **v11.65:** la línea de rendimiento baja también a **Stats › Today** (en Home era texto plano en un dashboard de tarjetas) y el WHOOP de hoy sube al tile **Readiness** del trío, que pasa a cuatro tiles | hecho |
| B-2 | **`trajectory` en el facts pack.** Todo el recorrido: programa, bloques, peso desde el inicio, anclas, adherencia, patrones saltados. `FACTS_SCHEMA 2`, `priorReviews` 6 | hecho |
| B-3 | **Contrato v2 de la edge function.** `focus`, `phase` (5 fases), `whyChanged`, `whyKept`, `lastWeekSummary` y `weekSummary` con **una fila por CADA sesión**, también las que no cambian | desplegado |
| B-4 | **La Home explica la semana.** `coachBrief` estampado en la versión del plan (y arrastrado en Deshacer y en el cambio de variante), `coachTargetWeekKey` (domingo → semana siguiente), botón **"Cerrar semana y pedir la próxima"**, Home reordenada (la semana antes que el día) con `#coach-goal-line`, y la vista Coach con Foco / Fase / Por qué / tabla de sesiones | hecho |
| B-5 | **Primera semana cerrada de verdad** (domingo 2026-09-13): leer la propuesta real, comprobar que cita ≥1 número desde el inicio del programa y ajustar el prompt si hace falta. Sin código nuevo | **pendiente** |

---

## Coach v2.1 · Integraciones de servidor (2026-09-08)

Los tokens de WHOOP y Withings viven en Supabase, no en el teléfono. Detalle en
[`architecture/integrations.md`](architecture/integrations.md).

| Paso | Qué | Estado |
|---|---|---|
| A-1 | Tablas (`integration_tokens`, `integration_status`, `oauth_states`, `integration_events`), lease-lock de refresco, `integrations-oauth` + `integrations-callback` | desplegado |
| A-2 | `whoop-sync` + `whoop-webhook`: el recovery entra solo | desplegado |
| A-3 | **La PWA deja de hacer OAuth.** `app/integrations.js`, `whoop.js` adelgazado, `pullStore`, tarjeta **Ajustes › Integraciones**, `whoop-callback.html` borrado | hecho |
| A-4 | `pg_cron` + `pg_net` + Vault: pull programado como red bajo los webhooks | desplegado |
| A-5 | Withings Body+: `withings-sync`, `withings-webhook`, suscripción; pill "Withings" en el peso | desplegado |
| A-6 | **Limpieza pendiente:** borrar la edge function **`whoop-auth`** (el proxy OAuth del cliente: hoy es un relé abierto con la clave anon que firma con nuestro secreto) y su bloque en `config.toml`; comprobar que `grep -rn "whoop-auth|whoop-callback" app/ supabase/` da 0 | **hecho 2026-09-08** (función borrada del proyecto; quedan sólo los marcadores negativos de los tests) |\|whoop-callback" app/ supabase/` da 0 | **pendiente** |

### Lo que queda para Julian (no lo puede hacer Claude)

**1 · Desprogramar la tarea de los domingos.** El cron `/weekly-review-auto` **no vive en el repo**:
vive en el programador de Claude Code, así que renombrar el fichero no lo apaga. Si no se quita, el
domingo a las 21:30 EDT un agente ejecutará un playbook que ya no existe.

> Abrir Claude Code → panel de tareas programadas (`/schedule`, o el listado de *scheduled tasks* /
> `/tasks`) → localizar el trabajo de los **domingos 21:30 EDT** que invoca `/weekly-review-auto` →
> **eliminarlo**. Si aparece un `.claude/scheduled_tasks.lock` suelto en el repo, es un residuo del
> proceso y se puede borrar; **no** es la programación.

**2 · Conectar WHOOP una vez con el flujo nuevo (A-3).** Ajustes → **Integraciones** → *Conectar*
en WHOOP. La autorización se abre fuera de la PWA y vuelve por Safari: cerrar Safari y volver a la
app; la tarjeta debe decir "Conectado · último sync hh:mm". A partir de ahí los tokens se refrescan
en el servidor y la conexión no se pierde al reinstalar la PWA.

La lectura de la mañana depende de esto: intervals.icu a las 7:00 todavía tiene el readiness de
**ayer**, y usarlo para hablar de hoy es exactamente el fallo F-6. Sin la integración activa el
sistema degrada a tendencias 7d y **lo dice** ("WHOOP no conectado"); no inventa el dato.
Requisito previo: en el panel de WHOOP, la redirect URI `…/functions/v1/integrations-callback/whoop`,
el webhook `…/functions/v1/whoop-webhook` y los scopes con `offline` y `read:cycles`.

**3 · Cerrar la primera semana, el domingo 2026-09-13.** En Home (o en la vista Coach) pulsar
**"Cerrar semana y pedir la próxima"**: la revisión se pide para **2026-W38** —el domingo, la
propuesta es para la semana que empieza mañana— y tarda 60-180 s. Leer el briefing y el diff, y
**aprobar o rechazar**. Si se prefiere esperar al lunes, se dispara sola en la primera apertura.

Esa primera propuesta trae el bloque **B1** del macroplan (ancla 7-sep, primer deload la semana del
5-oct) y es una decisión de plan, no de código. Al aplicarla, la Home pasa a mostrar SEMANA PASADA /
ESTA SEMANA (semana n/5 · B1 · fase) / POR QUÉ SE MANTIENE con sus desplegables. Si en 3-4 semanas
el coach se gana la confianza, se puede pasar `coachAutoApply` a `auto-if-clean` desde Ajustes.

**4 · Checklist manual en el iPhone (v11.57 + v11.59).** Una sesión real completa; son las diez
comprobaciones que ningún test cubre porque viven en la pantalla más usada:

1. Upper A: cada ejercicio muestra **una** línea "Objetivo" con su chip; el box jump de Lower A **sin
   kg**.
2. El placeholder de cada serie es el kg objetivo; "Last: …" y "Est. 1RM" siguen ahí.
3. Marcar una serie **sin escribir peso** → se guarda el objetivo (antes se guardaba 0 y desaparecía
   del historial). Con peso escrito, no lo pisa.
4. Cambiar un ejercicio (swap) → el objetivo es el del **sustituto**, con su propio historial.
5. Semana de descarga: ×0,9, "RPE 5-6", series a la mitad y "(Deload)" en la cabecera.
6. Cerrar la app a mitad de la sesión y reabrir → vuelven las series, los ajustes y los objetivos.
7. Terminar → Home, toast de PR, tarjeta "Lectura del coach" con ✕; cerrada, **no reaparece**.
8. Home en amarillo: **los dos botones arrancan**; la ajustada va sin box jump ni gemelo y con
   "RPE tope 7", mismos kg.
9. Rojo + día de pierna: "Registrar la alternativa" crea la sesión; "Hacer la planificada igual"
   arranca la completa. Ninguno se deshabilita.
10. **Por la mañana temprano**, antes de que intervals.icu tenga el día: la tarjeta dice "Sin dato de
    hoy" o "WHOOP 07:42" — **nunca** pinta el score de ayer como si fuera de hoy. Al reabrir a
    mediodía, la tarjeta ha cambiado sola.

---

## Auditoría de la app (2026-09-08) — remediación v11.66 → v11.70

Auditoría completa (visual · funcionalidad · motores · lógica de entrenamiento · research) en
[`audits/2026-09-08-app-audit.md`](audits/2026-09-08-app-audit.md), con `file:line` en cada
hallazgo. Sustituye al plan Coach v2.1 (implementado). Julian aprobó el alcance completo P0 → P3
el 2026-09-08, en incrementos separados con tests.

### Incremento 1 · v11.66 · P0 + rendimiento

| ID | Qué | Estado |
|---|---|---|
| B-1 | **Un día ya entrenado no abría nada.** `viewCompletedWorkout()` hacía `getElementById` sobre el textarea de notas, retirado hacía versiones; lanzaba antes de activar la vista. Las tres referencias fuera; las notas del entreno se pintan de sólo lectura y escapadas bajo la cabecera (`#wo-completed-notes`) | **hecho 2026-09-08** (v11.66) |
| B-2 | **Botón "volver" muerto** por el mismo `null` en `bindEvents`. Arreglado con B-1, y ahora vuelve a la pestaña de la que se vino (Home o Gym), no siempre a Home | **hecho 2026-09-08** (v11.66) |
| B-3 | **La tira de la semana escribía en un contenedor que no existe** (la sustituyó `renderWeekCalendar`): once llamadores, once promesas rechazadas por cada guardado de entreno. Función y llamadas borradas; el banner de la semana (que sí existe) pasa a pedirse desde `switchTab('gym')`, `init()` y `afterWorkoutSaved()` | **hecho 2026-09-08** (v11.66) |
| B-4 | **Cabecera invisible en cinco vistas secundarias** (Coach, Ideal, Analítica, Movilidad, Ajustes): ninguna ponía `body.dataset.tab` y `body[data-tab="home"] header{display:none}` seguía activo. Un helper `enterSecondaryView(view, headerKey)` hace `showView` + `updateHeader` + `dataset.tab`, usado en las cinco (más los dos botones de volver) y expuesto en `window` para `coach.js`. `updateHeader` gana rama para `ideal-preview`, `analytics` y `mobility` | **hecho 2026-09-08** (v11.66) |
| B-5 | **`init()` y `renderHomeView()` sin `catch`:** cualquier throw dejaba la app a medias en silencio. `DOMContentLoaded` con `.catch` + toast; `renderHomeView` con `Promise.allSettled` (un bloque que falla deja su hueco, no la pantalla) y un warn por bloque; `switchTab` atrapa Home y Stats | **hecho 2026-09-08** (v11.66) |
| B-6 | **`innerHTML` sin escapar** en notas del entreno, notas del plan, `data-swap-name` y —lo más serio— nombres y notas que vienen del modelo que lee las fotos de comida. Los ocho puntos con `escapeHtml`, y un test que grep-ea `${…notes}`/`${it.name}` sin escape en las líneas que construyen markup | **hecho 2026-09-08** (v11.66) |
| E-12 | **Código muerto:** rampa de re-entrada W26-W28, `renderWeeklyReport`, `renderRecentActivity`, `logRun`, `logSession`, los dos juegos de anillos de actividad, el banner de racha, la tarjeta de movilidad de hoy y dos iconos — 725 líneas que en varios casos leían tres tablas de IndexedDB para no pintar nada. **`renderStepsCard` se rescata:** tiene contenedor real en Stats › Today (`#steps-card`) y estado vacío, así que los pasos de intervals.icu dejan de perderse | **hecho 2026-09-08** (v11.66) |
| V-6 | **Service worker:** entran la hoja de Google Fonts, `favicon.svg`, `privacy.html` y `strava-callback.html`; salen del precache `app-icon.png` (1,9 MB) e `intro.mp4`; el `addAll` atómico pasa a dos tandas (crítica / opcional con `allSettled`); cache-first con revalidación en segundo plano para el shell y network-first sólo para la navegación | **hecho 2026-09-08** (v11.66) |
| V-7 | **Rendimiento:** caché de `weekSchedule` en `state` (eran 15 `dbGet` del mismo registro por pintado de Home), memo de `dbGetAll` por pase de render (eran 12 lecturas de los mismos cuatro stores), `renderStats` en tres tandas en vez de veinte `await` en serie, y un `afterWorkoutSaved()` en lugar del mismo trío de repintados copiado en cuatro sitios | **hecho 2026-09-08** (v11.66) |

Test nuevo: `tests/verify-home-render.mjs` — 91 comprobaciones. Impide la recaída de los tres
bugs P0 con la misma forma (un renderer escribiendo en un contenedor que no existe), verifica el
contrato del memo **ejecutándolo** sobre un IndexedDB de juguete, y afirma el shell del service
worker. Actualizados por símbolos borrados o por la nueva forma del código:
`verify-coach-wiring`, `verify-plan-v2-compat`, `verify-waist-persistence`,
`verify-integrations-wiring`.

Comprobación en el iPhone que queda para Julian (§7 del informe): tocar un día entrenado en el
calendario abre el entreno y "volver" funciona; abrir Coach/Analítica/Ideal/Movilidad muestra la
cabecera; guardar un entreno no deja errores en consola.

### Incremento 2 · v11.67 · Motores — **hecho 2026-09-08**

| ID | Qué | Estado |
|---|---|---|
| **E-1** | **La regla de kg no tenía tope porcentual.** El escalón salía del material, no de la carga: 4 → 6 kg en una mancuerna es **+50 %** y +2,5 en una máquina de 20 kg es +12,5 % — saltos que el validador del coach rechaza como `LOAD-JUMP` cuando los propone el modelo y que la app prescribía sin mirar. `LOAD_JUMP_MAX_PCT = 0.10` en `coach-engine.js`, medido **después** del redondeo al disco o al par (el salto que de verdad va a la barra). Y **no bloquea**: con material discreto no siempre se puede subir dentro del 10 %, así que lo que se exige es más evidencia — cerrar el tope del rango **dos** sesiones seguidas. STR-009 | **hecho** |
| **E-2** | **El RPE ausente contaba como RPE bajo.** La condición era `avgRpe == null` **o** `avgRpe <= rpeTop`: "no lo anoté" valía lo mismo que "me sobró", así que una sesión llevada al fallo sin RPE apuntado sumaba +2,5 kg a la siguiente. Sin el dato hace falta la otra evidencia que sí existe: `allHitMax` en dos sesiones utilizables consecutivas. Si no: mismo kg y *"sin RPE: subo sólo tras dos sesiones al tope. Hoy: mismo kg, y anota el RPE"* | **hecho** |
| **E-3** | **Dos registros del mismo día entraban como dos sesiones.** El historial es "todos los entrenos con este ejercicio", y un día puede traer dos filas (la sesión del plan y una libre, o un registro reabierto y vuelto a guardar): `usable[0]` y `usable[1]` eran el mismo entreno, así que la regla concluía *"dos sesiones iguales: hoy +1 rep"* el día del primer levantamiento y `daysSince` salía 0 sobre un intervalo inexistente. `_coachDedupeHistory(hist, type)` deja **una fila por fecha**, la de más series hechas. Va en el motor y no en el cableado, así que cubre los dos llamadores (`computeSessionTargets` y `attachSessionReadout`) y se puede probar sin navegador | **hecho** |
| **E-4** | **Los minutos de cardio del coach no caducaban.** `plan-v2-schema.md` dice que el objetivo del coach manda "y la ventana de vigencia está abierta", y eso se cumplía para los kg y no para los minutos: un plan de hace tres semanas seguía prescribiendo 50′ de zona 2 mientras sus kg ya habían cedido el paso a la regla — el mismo plan con dos vidas distintas. `coachTargetIsCurrent(planWeekKey, todayStr)` sale de dentro de `suggestSetTarget` a función exportada, y `_coachCardioMin` la usa (con el mismo respaldo de 14 días por `createdAt`) | **hecho** |
| **E-5** | **Plan del coach en semana de descarga: exención para todo.** `deload` era `false` para el plan entero en cuanto `author === 'coach-llm'`, con el argumento de que el coach ya trae el volumen de la descarga. Cierto **de lo que él escribió**: un accesorio sin `target` recibía progresión normal en semana de deload, contra G-H3 y LOAD-004. Ahora `deloadFor(exId)` decide por ejercicio, y de ahí cuelgan los objetivos (`computeSessionTargets` acepta `deloadFor`), la estimación de tiempo (`computeBlocks` acepta un predicado) y el subtítulo de la cabecera | **hecho** |
| **E-6** | **La rampa de cardio iba por el calendario.** `progressCardioMin` subía `base × 1,1^(index−1)`: en la semana 4 del bloque prescribía un +33 % **aunque no se hubiese corrido en tres semanas**, porque la única puerta era `lastCardioDaysAgo` y era GLOBAL — una bici de anteayer bastaba para pasarla. Ahora la referencia es la **mediana de los minutos de las dos últimas semanas ISO con dato en el mismo hueco** (`opts.history`, `[{weekKey, min}]`); sin dato, o con el hueco vacío 14 días, devuelve la base; el techo sigue siendo ×1,35 **sobre la base del slot**. El cableado lo pone `_cardioSlotHistory(jsDay, ds, kind)`, que separa el finisher post-fuerza de la sesión de cardio del mismo día de la semana — mezclar 20′ y 50′ daría una mediana que no describe ninguno de los dos. El camino sin `history` se conserva para los llamadores que no lo pasan | **hecho** |
| **E-7** | **Residuo de dosificación por recuperación.** `readiness.deloadHint` congelaba la rampa de km y cerraba la puerta de la calidad en `suggestRunningWeek`: una dosis derivada de WHOOP y del RPE, aplicada sin que nadie la aprobara — justo lo que Julian retiró el 7-sep. Ya **no cambia ningún número**: ni `weeklyKmTarget`, ni `weeklyMinTarget`, ni la fase, ni `qualityUnlocked`, ni el reparto por sesión. Sigue en la firma y aparece, como mucho, al final de `reason` ("dato para la revisión semanal, no un recorte automático"). El test de la sección 4 de `verify-running-week` es ahora **negativo**: compara las dos salidas km a km | **hecho** |
| **E-8** | **El `next` del readout prometía una subida imposible.** Se calculaba con `deload: false` "para no adivinar el calendario" — pero el bloque está anclado a fecha y se sabe con exactitud: la tarjeta del viernes decía "la próxima: 95 kg" y el lunes de descarga la pantalla prescribía 85. Ahora usa `blockWeek(fecha + 7 d).isDeload`, el mismo cálculo que hará la tarjeta de ese día | **hecho** |
| **E-9** | **Una fuente por concepto.** `LB_TO_KG = 0.45359237` (había un `0.453592` truncado en `app.js` y dos copias en el motor: el mismo peso salía distinto según qué fichero lo convirtiera) · `RW_Z2_TOLERANCE_BPM`, ahora usada también por `performanceLine` (una carrera a 144 bpm sobre un techo de 143 se llamaba "carrera" en Home y "Z2 cumplida" en el pack) · `LOAD_JUMP_MAX_PCT` · `ffmKg({bodyweightRows, settings, todayStr})`, que resuelve **una** FFM con su procedencia y la usan `nutrition.js` y el facts pack (había tres: la declarada de 72,8, la de Withings y la derivada, y la EA salía 26,4 o 28,9 según cuál) · el banner de Gym pasa de bloques de **9** semanas a `blockWeek()`/`blockLabel()` (5, ancladas a fecha), así que la barra y la tarjeta de la sesión dejan de contradecirse · la barra del presupuesto de días duros usa `VP_MAX_BUDGET` en vez de dividir por 8 lo que se calcula sobre 6 · `_weekNumToDate` devuelve el **lunes ISO correcto** con la aritmética UTC de `anchorDateFromWeek` (sumaba días en hora local) y `null` en vez de "hoy" cuando no hay `startDate` — devolver hoy hacía que la semana 12 heredara el deload de la semana en curso | **hecho** |
| **E-10** | **Once agregaciones leían `runs`/`sessions` crudos.** La misma actividad de COROS llega por Strava **y** por intervals.icu (v11.36), así que la racha contaba dos días donde había uno, `renderRunTotals` inflaba el total del año y "¿cuántos km llevo esta semana?" tenía dos respuestas según la pantalla. Convertidas a `getRunsDeduped()`/`getSessionsDeduped()`: racha diaria de bienvenida, rachas de Stats, comparación de semanas, calendario de racha, resumen semanal, calendario de Home, tarjeta de hoy, totales de carrera, historial, swimlane, banner de Gym, y en `nutrition.js` el `nutIsTrainingDay` y el `nutEeeForDate` (donde se **suman** kilocalorías: contar doble hunde la EA del día). Las crudas que quedan están declaradas una por una, con su motivo, en el test nuevo | **hecho** |
| **E-11** | **Nutrición: pintar escribía, y la EA intradía se pintaba como estado.** `renderNutricionV2()` llamaba a `recomputeNutritionDay()` en cada pintado, así que abrir la pestaña escribía en IndexedDB y encolaba una sincronización con un `updatedAt` nuevo — el último dispositivo que MIRASE la pantalla ganaba el merge sin haber registrado nada. Se separa en tres: `computeNutritionDay` (calcula), `recomputeNutritionDay` (único escritor, sólo desde `saveMeal`/`deleteMeal`/`nutCloseDay`) y `nutDayForRender` (pinta sin escribir). Y la fila lleva `closed`: la EA es una magnitud diaria (REC-008) y a las 11:00 con un desayuno registrado sale siempre "crítica", así que hoy se muestra el número sin semáforo y con la línea *"in progress — a daily figure (REC-008); judged when the day closes"*. `nutCloseDay(fecha)` sella el día de ayer una vez, es idempotente y no inventa filas | **hecho** |
| **E-15** | **Base obsoleta al aplicar.** `applyCoachProposal` mergea el diff contra el `activePlan` **del momento de aplicar**, no contra la versión que el coach tenía delante: entre la propuesta del domingo y el toque del lunes cabe un `setIdealVariant` (4 → 5 días) o un rollback, y el "sube la banca a 95" se estampaba sobre otra base sin aviso. Se compara `activePlan.version` con `review.facts.plan.version` y, si no coinciden, un `confirm()` amarillo: *"The plan changed since this review (v14 → v16). Apply anyway?"*. La versión nueva registra `baseVersion` y `appliedOnVersion` | **hecho** |
| **E-16** | **Deshacer perdía trabajo del usuario.** Aplicar limpia los swaps de ejercicio que el plan nuevo absorbió (`_coachReconcileOverrides`) y los cambios de día hechos a mano (`clearFutureScheduleOverrides`); el rollback restauraba `sessions` y `weekTemplate` y **no** esos overrides, así que Deshacer devolvía el plan viejo sin los cambios manuales que tenía encima. `applyCoachProposal` guarda `preApply: {exerciseOverrides, weekSchedule}` (copia profunda, **antes** de limpiar) en la versión nueva, y `rollbackPlanVersion` los restaura desde la versión que deshace, contándolo en la decisión | **hecho** |
| **E-18** | **El piloto de kcal no tenía reloj** (lado app). `settings.kcalFirstAdjustDate` / `kcalLastAdjustDate` no existían, así que `nextEligibleAdjustDate` era `null` **siempre** y el gate de 14 días de `KCAL-STEP` no se podía comprobar. Aplicar una propuesta con `nutrition.kcalTarget` sella las dos fechas por la ruta que sincroniza (`userSettings`) — y **sólo si el número cambia** respecto al último sellado (`kcalLastAdjustValue`): si el coach repite el mismo objetivo cada domingo y esto reescribiera la fecha, el reloj se reiniciaría cada semana y el gate no dispararía nunca. `_coachValidateCtx` pasa además `kcalTarget`, `kcalLastAdjustDate` y `daysSinceKcalAdjust` al validador | **hecho** |
| **R-2** | Cita muerta: el comentario de `progressCardioMin` decía que END-003 es `expert`; la ficha dice `moderate`, confianza media (Bertelsen 2017 respalda el **mecanismo** carga-vs-capacidad, no el 10 %) | **hecho** |

Tests: **`verify-cardio-progress.mjs`** y **`verify-dedupe-reads.mjs`** nuevos (el segundo lleva la
lista de lecturas crudas permitidas con su categoría: si aparece una nueva, falla). Ampliados:
`verify-set-target` (§10 el tope del 10 %, §11 el mismo día, §12 la vigencia — y las tres
aserciones de progresión de mancuerna pasan a exigir **dos** sesiones al tope, que es la regla
nueva), `verify-running-week` (§4 negativo), `verify-block-week` (§8 el banner, `_weekNumToDate`,
el presupuesto y `LB_TO_KG`), `verify-nutrition-v2` (§13 recompute y EA, §14 la precedencia de la
FFM ejecutada sobre el motor), `verify-coach-wiring` (§18 aplicar y deshacer),
`verify-plan-v2-compat` (`preApply` sobrevive a `createNewPlanVersion`), `verify-workout-unit` y
`verify-sync-writes` (el sandbox y la ventana de extracción, por la forma nueva del código).

Lo que queda de este incremento y **no** se hizo aquí: `nutrition.js:47-48` ya estaba a 2.700 /
2.400 (R-1, lo dejó el incremento 3), y `E-12`/`E-13`/`E-14`/`E-17` son de los otros dos carriles.

### Incremento 3 · fn v4 · Guardarraíles, research y servidor — **hecho 2026-09-08**

| ID | Qué | Estado |
|---|---|---|
| **E-13** | **La edge function no ejecutaba el validador.** Los docs decían desde el diseño que un `hard` le cuesta al coach una regeneración; no era verdad — los avisos se calculaban en el teléfono AL APLICAR, con la propuesta ya escrita y la llamada ya pagada. Ahora `scripts/build-fn-assets.mjs` copia `app/coach-facts.js` a `coach-weekly-review/coach-facts.generated.js` (con sha, como `rules-compact`), y tras sanear la función hace `validatePlanVersion(mergeProposal(...))` con el **mismo `ctx`** que usa la PWA. Si hay algún `hard` → **UNA** regeneración ("corrige sólo eso, no cambies nada más"), y la segunda propuesta sólo sustituye a la primera si tiene MENOS `hard`. La fila guarda `guardrails` (el array que la app ya lee) + `guardrailsMeta {hard, warn, regenerated, attempts, structuralChanges}` | **hecho** (fn v10) |
| **E-14** | **Lo que ningún guardarraíl detenía**, cerrado con 6 ids nuevos: `SESSION-COUNT` pasa a **duro** (>variante+1 o >5, y ya no se salta sin variante — un sexto día de gym no lo paraba nadie) · `HARD-CARDIO`/`RUN-BEFORE-LEGS` cuentan como dura un **largo ≥10 km** y los días de `running.hardSessions[]` · `ORDER-SAME-DAY` (levantar primero si comparten día, INT-003) · `FREQ-FLOOR` (patrón mayor <2 exposiciones/semana en variantes ≥4, STR-002 `strong`) · `CHURN` sobre el **diff real**, no sobre el `changes[]` autodeclarado · `PROTEIN-FLOOR` avisa cuando una semana de déficit toca la ingesta sin decir nada de la proteína | **hecho** |
| **E-17** | `RECOVERY-ONLY`: una decisión que baja series/kg/km citando **sólo** reglas `READ-*` y sin un dato de rendimiento al lado es dosificación por wearable con otro nombre — lo que Julian retiró el 7-sep | **hecho** |
| **E-18** | `KCAL-STEP` **duro**: un cambio de `nutrition.kcalTarget` no pasa de **150 kcal** ni llega antes de **14 días** del anterior (se lee de `progress.weight.validWindow`). Sin tope, "el ritmo es un dial gobernado por el rendimiento" era prosa: a las dos semanas no se sabe si la pendiente cambió por el ajuste o por el ruido | **hecho** (lado validador) |
| **R-1** | **Suelo de kcal a 2.700 / 2.400** (decisión de Julian), en `prompt.ts` y en `KCAL-FLOOR`. Con 2.500 la disponibilidad energética cae a ~27 kcal/kg FFM y REC-008 marca 30: el suelo viejo contradecía la regla que lo justificaba | **hecho** (falta `nutrition.js:47-48`, del agente de motores) |
| **R-3** | **LOAD-004** con las magnitudes de la descarga dentro (series ×0,6, km ×0,7, kg ×0,9, RPE 5-6) y degradada a `expert`: los factores que el código aplicaba no tenían fuente ninguna | **hecho** |
| **R-4** | **STR-009** escrita: la doble progresión (ventanas de reps, +reps antes que +kg, pasos 2,5 / 1,25 / par de mancuernas, tope del 10 % en cualquier salto, y "sin RPE no es RPE bajo": dos sesiones al tope antes de subir). Grado `expert`, no `moderate` — Plotkin 2022 **no** está en `corpus-map.md` | **hecho** |
| **R-5** | **END-009** nueva (`strong`, Jakicic 2024): ≥150 min/semana de MVPA y 200-300 para pérdida de grasa, con `MVPA-FLOOR` en el validador. Da consumidor a LONG-001, una de las siete `strong` que sólo llegaban a la documentación | **hecho** |
| **R-6** | **REC-001**: el rango pasa de 1,8-2,7 a **1,6-2,2 g/kg** ("ACSM 1,2-2,0; extrapolado arriba en déficit por Helms/ISSN"). La mitad alta del rango viejo no tenía fuente | **hecho** |
| **R-7** | **Los `caveats` viajan al prompt** (recortados a 160 chars, 2 por regla): el grado dice cómo de firme es una regla, el caveat dice **en qué se equivoca**. Y los dos guardarraíles que descansaban sobre evidencia débil bajan a blandos: deload + diet break (REC-005 `weak_extrapolated`, cuyo texto dice que **no** preserva más masa magra) → `G-S15`, y el tope de 80 contactos de plyo (el caveat de ATH-001 niega la optimalidad de la dosis baja) → `G-S16` con su id propio `PLYO-CONTACTS`. La **colocación** del plyo sigue dura: INT-004 es `strong` | **hecho** |
| **R-8** | **`consumer` en las 72 fichas** (`engine`/`validator`/`guardrail`/`prompt`/`doc`/`none`), con `consumerNote` obligatoria cuando una regla `strong` no tiene más consumidor que un documento. Lo comprueba `tests/verify-rule-coverage.mjs`, y lo comprueba **de verdad**: contrasta cada `validator` contra los `ruleIds` del validador, cada `guardrail` contra el bloque de guardarraíles del prompt y cada `engine` contra el código de los motores. Distribución: 39 validator · 17 engine · 1 guardrail · 1 prompt · 14 doc · 0 none | **hecho** |
| **R-10** | **CI con job `test`.** `deploy.yml` sólo publicaba `app/`: los 30+ ficheros de tests dependían de que alguien se acordara. Ahora un job `test` (Node 24) comprueba los artefactos generados (`--check`) y corre la suite entera, y el `deploy` lleva `needs: test` | **hecho** |
| **I-1** | **Migración `20260909_advisors.sql`.** `rls_auto_enable()` fuera del alcance de `anon`/`authenticated`; las **25 políticas RLS** a `(select auth.uid())` (de re-evaluar por fila a una vez por consulta, misma semántica); índice en `oauth_states(user_id)`; fuera el índice `integration_events_received_idx` que nunca se usó. Advisors después: **cero** `auth_rls_initplan`, cero `unindexed_foreign_keys`, cero `anon_security_definer_function_executable` | **hecho** |
| **D** | **La prosa del coach en inglés** (decisión de producto del 8-sep): `prompt.ts` pide toda la prosa en inglés manteniendo Rule IDs, ids y números, con las cabeceras markdown literales en inglés; las notas de saneado de `index.ts` traducidas y comprobadas por test | **hecho** (el resto de la UI, en v11.67) |
| **V-1** (mitad del coach) | **`coach.js`, `coach-engine.js` y `coach-facts.js` en inglés**: etiquetas, estados vacíos, toasts, botones, cabeceras de tarjeta (LAST WEEK · THIS WEEK · WHAT CHANGES AND WHY · WHY IT HOLDS), las `reason`/`note` de los motores puros, los `dataGaps` y las 39 frases del validador. Los mapas `*_ES` pasan a `*_LABEL` con las mismas claves (`PHASE_LABEL`, `RW_PHASE_LABEL`, `COACH_GUARD_LABEL`, `COACH_DECISION_LABEL`, `COACH_ERROR_LABEL`, `COACH_STATUS_LABEL`, `COACH_EVIDENCE_LABEL`, `COACH_OUTCOME_LABEL`, `COACH_WS_STATUS_LABEL`, `COACH_DOW_LABEL`, `COACH_RULE_LABEL`, `COACH_CLOSE_WEEK_LABEL`, `COACH_LIFT_LABEL`, `_READ_COLOR_LABEL`, `_GP_STATUS_LABEL`, `_VP_DOW_LABEL`). **El separador decimal pasa a punto** en los cuatro formateadores compartidos (`_coachFmtKg`, `_coachFmtRpe`, `_cardioFmtMin`, `_rwFmt`, y `_vpNum`/`_cNum`/`_cKg` que cuelgan de ellos): un solo sitio, no una cadena por cadena. `coach-facts.generated.js` regenerado. Comentarios y docs siguen en castellano | **hecho** |
| **V-1** (mitad de la app) | **`app.js`, `nutrition.js`, `integrations.js`, `whoop.js`, `strava.js`, `bloodwork.js`, `supabase-sync.js` e `index.html` en inglés**: los datos del `PLAN` (notas de ejercicio, calentamientos, sesiones de viaje y el híbrido, sufijos `/leg` y `/side`), `IDEAL_BLOCK_V1` entero (labels, `why`, `summary`, `cautions`) y su preview, la biblioteca de cardio y su tarjeta de envío a COROS, el formulario de cardio, Nutrición completa (contrato del día, comidas, compositor de fotos, calibración, coste, leaderboard, coach del resto del día), la vista de analítica y `bloodwork.js` entero, las integraciones (pills `Connected`/`Reconnect`/`Not connected`, botones, códigos de `connect_error`), la cintura y las líneas de peso de Withings, el aviso de sync y los toasts. `_PATTERN_ES`/`_MUSCLE_ES`/`_DOW_ES` → `_PATTERN_LABEL`/`_MUSCLE_LABEL`/`_DOW_LABEL`; `INTEG_PILL_ES`/`INTEG_CONNECT_ERROR_ES` → `_EN`. **Separador decimal a punto** y millar inglés (`toLocaleString('en-US')`) en los formateadores que quedaban: `nutFmt`, el `eur()` del coste, `_anFmt`, `_es()`→`_num()` de la línea de Withings y el punto de millar a mano del BMR. Vigilado por `tests/verify-i18n.mjs` (nuevo): tokeniza `app/*.js`, exceptúa comentarios y `console.*`, y revisa el texto y los `placeholder`/`aria-label`/`title` de `index.html`. Se queda en castellano **a propósito** `FOODS_SEED` (dato de usuario ya sembrado, idempotente por `id`, y vocabulario de resolución del parseo) y las claves internas que son también clases CSS o valores `data-*` (`hoy`/`tendencias`/`alimentos`, `desayuno`/`comida`/`cena`, `fresco`/`caducado`/`historico`, `lipidos`/`metabolico`/…) | **hecho** |

Ids del validador: **33 → 39**. Tests: `verify-plan-validator` (39 ids, positivo y negativo por
regla nueva), `verify-fn-assets.mjs` **nuevo** (importa el módulo generado de verdad y ejecuta las
tres funciones), `verify-rule-coverage.mjs` **nuevo**, `verify-rules-compact` (caveats + tamaño),
`verify-coach-fn-wiring` (renumeración, suelo de kcal, inglés). Suite completa en verde.

### Lo que fn v4 dejó a la vista, y es para Julian

**`ANTHROPIC_API_KEY` no está en los secretos del proyecto.** Un POST a la función devuelve
`{"error":"Función sin configurar: falta ANTHROPIC_API_KEY"}`: el coach semanal **no puede correr**,
y `parse-meal-photo` tampoco. Se arregla en Dashboard › Functions › Secrets (o
`supabase secrets set ANTHROPIC_API_KEY=…`). Es lo primero que hay que hacer antes de cerrar la
semana el domingo 13.

### Incrementos 4, 5 y 7

Pendientes, en el orden del informe: **v11.67** todo en inglés (V-1), **v11.69** visual y UX
(V-2…V-5, V-8, V-9), **R-11** (ledger de evidencia en la vista Coach) y **A-7** (intervals.icu y
Strava al servidor).

---

## Estado de los datos (medido el 2026-08-18)

| Dato | Cantidad | Último | |
|---|---|---|---|
| Entrenamientos de gimnasio | 23 | 2026-08-17 | ✅ entra bien |
| Carreras | 13 | 2026-08-16 | ✅ |
| Sueño / HRV / recuperación | 105 | 2026-08-18 | ✅ |
| **Composición corporal** | Tanita | **2026-08-11** | ✅ **nueva referencia** |
| **Perfil lipídico** | LabCorp | **2025-02-04** | ✅ 18 meses |
| Cardio no-carrera (bici, remo, SkiErg) | **0** | — | ❌ punto 1 |
| Nutrición | 11 | 2026-05-28 | ❌ punto 2 |
| Movilidad | 2 | 2026-04-27 | ❌ punto 7 |

Reproducir: consultar Supabase (proyecto `ycfodifvpvosukepcxie`), tabla por tabla, filtrando por el
`user_id` de Julian. No fiarse de la memoria de nadie.

## ✅ RESUELTO: la adherencia baja era por viajes

**Julian (2026-08-19):** *"NO estuve entrenando porque estaba de viaje."*

Explicación benigna, y señala el arreglo real: **ninguna de las variantes funcionaba sin gimnasio**,
así que un viaje equivalía a no entrenar. Los huecos de 11, 12 y 14 días eran viajes, no desidia.

Arreglado en v11.42 con la variante **Viaje** (abajo, punto 1b). El análisis original se conserva
como referencia de la magnitud del problema:

<details>
<summary>Análisis original: adherencia ~30%</summary>

Sesiones registradas entre el **2026-06-20 y el 2026-08-17** (9 semanas): **11**. El plan prescribe 4
por semana → **~1,2/semana medidas**.

| Sesión | Veces |
|---|---|
| `upperA` (press/remo) | 5 |
| `lowerA` (sentadilla) | 4 |
| `upperB` (dominadas/OHP) | 2 |
| **`lowerB` (bisagra / peso muerto)** | **0** |

Huecos de 11, 12 y 14 días. **El sumo deadlift —uno de los cinco anchors "never rotate"— lleva más
de dos meses sin tocarse**, y con él toda la cadena posterior.

**Por qué esto reordena la lista:** las cinco últimas jornadas se fueron en optimizar la
*composición* del plan (frecuencia por patrón, tipo de core, isquios, pliometría). Eso tiene un techo
bajo mientras el plan se ejecuta al 30%. **Afinar el motor de un coche que arranca una vez por
semana rinde poco.**

Caveat honesto: esto mide adherencia **de registro**. Puede haber entrenado sin registrar. Pero sin
registro el sistema no puede progresar cargas ni adaptar nada, así que el efecto es el mismo — y es
justo lo que Julian pide que el sistema haga.

</details>

---

## 1 · Que el cardio no-carrera entre de verdad — **esperando a que Julian abra la app**

Todo el código está desplegado. Tres arreglos encadenados: el filtro que descartaba lo que no fuera
correr (16-ago), el tipo `VirtualSki` del SkiErg de Concept2 (18-ago), y la recuperación del
histórico, que se marcaba "hecha" con un booleano puesto *antes* del arreglo de `VirtualSki` y por
tanto no habría vuelto a ejecutarse (18-ago, ahora versionada).

**Cambio de v11.41:** las **caminatas ya no se importan**. Caminar 15 minutos al trabajo no es
entrenamiento y ensuciaba el historial con desplazamientos. Los pasos siguen entrando por su propia
vía, donde sí tienen sentido como contexto de actividad diaria.

**Cómo se comprueba:** abrir la app y verificar en Supabase que `sessions` pasa de 0 a más de 0. El
diagnóstico de importación ahora sube a la nube, así que si algo se descarta se puede ver en remoto
sin pedir capturas.

## 1b · ✅ Variante VIAJE — HECHO (v11.42)

El arreglo del problema de adherencia. **Dos sesiones de peso corporal, cero gimnasio, banda opcional:**

| | Viaje A | Viaje B |
|---|---|---|
| Pierna | Búlgaras 3×10-15/pierna | Rumano a 1 pierna 3×10-12/pierna |
| Empuje | Flexiones 3×10-20 | Pike push-up 3×6-12 |
| Tirón | Dominadas AMRAP *(o remo con banda)* | Remo con banda 3×15-20 |
| Extra | Puente de glúteo a 1 pierna | Nordic curl asistido |
| Core | Bird dog (anti-rotación) | Dead bug (anti-extensión) |

**Principio de diseño clave: cada sesión es completa por sí sola** — pierna, empuje, tirón y core. En
viaje no sabes si vas a hacer una o cuatro, así que ninguna puede dejar un hueco. A y B se
diferencian en el énfasis, no en la cobertura.

La intensidad sale de la **dificultad y la proximidad al fallo**, no de la carga: sin peso externo,
RPE 8 en rangos altos es lo que da estímulo real. Cada ejercicio lleva su progresión escrita (pies
elevados, pausas, tempo lento) para que no se convierta en repeticiones infinitas.

En el selector de la app aparece como **🧳**, antes del 3.

## 2 · ✅ Composición medida — y el objetivo, aclarado

**Resuelto el 2026-08-18** con la Tanita MC-780MA-N: **87,1 kg · 16,4% de grasa · 72,8 kg de masa
libre de grasa**. Detalle en
[`../data/processed/2026-08-18_body-composition-tanita.md`](../data/processed/2026-08-18_body-composition-tanita.md).

Lo importante que salió de ahí: **el ~21% que arrastraba el perfil desde abril estaba mal**, no es
que hubiera una recomp espectacular. Y con 72,8 kg de masa libre de grasa, el objetivo escrito
—"80-83 kg **y** 15-17% de grasa"— es internamente contradictorio:

| Peso | Grasa | % |
|---|---|---|
| **87,1 kg (hoy)** | 14,3 kg | **16,4%** ← ya dentro del objetivo de % |
| 85,6 kg | 12,8 kg | 15,0% |
| 83 kg | 10,2 kg | **12,3%** |
| 80 kg | 7,2 kg | **9,0%** |

### ✅ Decidido (2026-08-19): el objetivo es la báscula, 79-81 kg

*"Siempre que peso entre 79-81 kg me siento muy bien atlético, rápido, en buena forma física."*

`goals.md` reescrito con eso. Lo importante de la traducción: **llegar a 80 kg no es llegar al 9% de
grasa** — parte de los 7,1 kg será masa magra incluso haciéndolo bien, así que lo esperable es
**~10,5-11%**. Sigue siendo magro y es un objetivo legítimo; la sensación subjetiva a ese peso es un
dato válido y además pesar menos ayuda a correr.

**7,1 kg a ~0,5%/semana = 16-18 semanas** (corregido el 19-ago: 12 semanas exigirían ~650 kcal/día de
déficit, por encima de la banda del sistema). Y lo que decide si se llega *atlético* o *flaco* no es
la dieta: es el estímulo de fuerza. Con 1-2 sesiones/semana se llega blando; con 4, atlético. Por eso
la variante Viaje importa tanto como el déficit.

### Sigue pendiente: pesarse con regularidad

Una medición de composición cada 8-12 semanas, pero **el peso en media móvil de 7 días** es lo que
permite ver si el déficit funciona. Sin eso no se puede ajustar nada con criterio. Ídem la nutrición:
último registro del 28 de mayo.

## 3 · Dos decisiones de entrenamiento abiertas — **Julian decide**

### 3a. La "sesión de calidad" del sábado

El plan la llama sesión de calidad y lo que manda al reloj es Z2 fácil. Dos salidas coherentes:

- **que lo sea de verdad** (Z3 o umbral) — pasa a contar como día duro;
- **o quitarle la etiqueta** y asumir que la semana es 100% cardio fácil, que es defendible en
  déficit.

Lo único que no vale es que diga una cosa y haga otra.

### 3b. ✅ El presupuesto de dureza deja de limitar — resuelto

**Decisión de Julian (2026-08-18):** *"olvidate de ese ranking de dureza de 6. Lo importante es
entrenar bien, de última pondré menos peso, menos repeticiones, o te avisaré que es mucho. O haré
descanso."* Y: *"podemos mantener el valor mostrando cuánto vengo haciendo, pero no limites las
planificaciones con eso."*

Aplicado en v11.41:

- **La carga acumulada sigue visible** en su tarjeta, como información. Sin barra roja ni avisos.
- **Ya no decide nada.** Se retiró del consejo diario, que ahora se apoya solo en señales
  fisiológicas reales: recuperación e interferencia (no correr fuerte antes de pierna).
- El aviso del catálogo de cardio se mantiene solo por razones físicas —pierna hoy, recuperación en
  rojo—, no por un número heurístico.

**Y era la decisión correcta**, por una razón que los datos respaldan: la adherencia real es de ~1,2
sesiones por semana. Un sistema que rechaza planes por exceso de carga mientras el problema real es
que no se entrena estaba resolviendo el problema equivocado.

## 4 · ✅ Pliometría, trineo y SkiErg — HECHO (v11.42)

**Decisión de Julian:** *"agregar pliometría + trineo + skierg o lo que consideres que es bueno para
entrenar y mezclar."*

**Pliometría — en `lowerA`, al principio, en fresco.** Pogo hops 2×20 + box jump 3×5 = **55
contactos**, dentro del rango 40-80 que marca la regla. Sólo en ese día para empezar: el tendón
adapta despacio y se introduce tras la base, no de golpe. Del cajón **se baja caminando** — la caída
es donde está la lesión. Era el hueco con mejor evidencia de todo el plan (fuerza pesada +
pliometría mejoran la economía de carrera, graduado `strong`).

**Híbrido trineo + SkiErg — sustituye el cardio del sábado, no lo suma.** Trineo 6×20 m + SkiErg
5×250 m + farmer carry 4×40 m. Aparece como alternativa del día de cardio, que es literalmente lo
que dice la regla ("en lugar de un cardio, no además"). El trineo es **concéntrico puro**: sin fase
excéntrica no hay daño muscular apreciable, así que da mucho estímulo con pocas agujetas y casi no
interfiere con la sentadilla ni con correr — probablemente la mejor herramienta de acondicionamiento
para un historial lumbar. Todo de baja skill a propósito: bajo fatiga no se hacen ejercicios técnicos.

**SkiErg** ya tiene sus dos workouts en el catálogo desde v11.39 (Z2 25 min y 8×1 min Z4).

Honestidad sobre la evidencia: la programación híbrida es lo más débil del corpus (no hay ensayos de
HYROX). Por eso la dosis es conservadora y va como alternativa, no como obligación.

<details>
<summary>Recomendación original</summary>

- **Pliometría: recomiendo hacerlo.** La evidencia de que fuerza pesada + pliometría de baja dosis
  mejoran la economía de carrera es de las más sólidas del corpus, y la base aeróbica es una de tus
  dos cualidades en progresión. Cuesta ~5 min al inicio de un día de pierna, en fresco. Ahora mismo
  no hay nada de esto en ninguna sesión, y su ausencia no tiene justificación.
- **Trineo: sí, pero sustituyendo un día de cardio, no añadiéndolo** — es literalmente lo que dice
  la regla. Concéntrico puro, pocas agujetas, impacto bajo: de todo lo que falta, es lo que mejor
  encaja con tu historial lumbar.
- **Circuitos híbridos completos:** con el presupuesto de dureza ya retirado como límite (punto 3b),
  el argumento de "no cabe en la semana" desaparece. Lo que queda es que la evidencia de programación
  HYROX es la más débil del corpus (no hay ensayos), así que se diseña con dosis conservadora.

</details>

## 5 · Analítica de sangre — ✅ analizada y en la app (v11.43) · **pedir la nueva sigue siendo tuyo**

**Hecho el 2026-08-20.** Las 6 analíticas están puntuadas contra **objetivos de guía**, no contra el
rango del laboratorio, en
[`../data/processed/2026-08-20_analitica-puntuada.md`](../data/processed/2026-08-20_analitica-puntuada.md)
y en la app (**Ajustes → Mis marcadores**).

Los tres hallazgos que el rango del laboratorio escondía:

| | |
|---|---|
| **ApoB 110 "dentro de rango" es un 2 de 5** | El `66-133` que imprime IACA es un intervalo **poblacional**, no un umbral de riesgo. Todo su tramo alto queda por encima de cualquier objetivo de guía |
| **Ferritina 191 está a 9 unidades de un flag** | La OMS marca >200 µg/L en hombres sanos como riesgo de sobrecarga de hierro. El rango `30-400` del laboratorio lo tapa |
| **El "óptimo" de vitamina D no existe** | El 40-60 ng/mL que se repite en todas partes es de la guía de 2011 de la Endocrine Society; **la vigente (2024) dice que no hay evidencia que defina el nivel óptimo**. Que 11,2 sea deficiencia sigue siendo cierto por todas las definiciones |

Y dos cosas que dije mal y quedan corregidas: el HDL de 65 **no** es un "✅ bueno" (esa convención,
NCEP ATP III, no sobrevivió a la evidencia y ninguna guía vigente fija diana de HDL hacia arriba), y
la serie de LDL 149 → 170 → 143 **mezcla dos laboratorios y dos ecuaciones** — el descenso es real y
está en el colesterol total medido (−30 mg/dL), pero no soporta una narrativa de "oscilación".

**Lo que sigue siendo tuyo: pedir la analítica nueva.** La app tiene la lista lista para copiar, con
las condiciones (en ayunas, 48 h sin sesión dura, bien hidratado). Prioridad: **vitamina D**, que
lleva 36 meses sin re-control.

<details>
<summary>Estado anterior del punto (18-ago)</summary>

**Actualizado el 2026-08-18.** Apareció una segunda carpeta, `data/00. Blood Tests/`, con un
**perfil lipídico del 2025-02-04** que no estaba en la que audité. Eso corrige algo que dije mal:

| | 2021 | 2024-09 | **2025-02** |
|---|---|---|---|
| LDL | 149 | 170 | **143** |
| HDL | 66 | 68 | 65 |
| Total | 226 | 260 | 230 |
| Ratio LDL/HDL | — | — | **2,2** (rango 0-3,6) |

**Dije que el LDL venía subiendo. No es cierto:** el valor más reciente es el más bajo de la serie, y
el 170 de 2024 era un pico. Sigue estando por encima de la referencia (<100) y merece conversación
médica, pero con la ratio LDL/HDL en 2,2 —banda de riesgo bajo— y triglicéridos normales, el patrón
no es alarmante.

Lo que sigue faltando, y es lo que de verdad importa:

- **Vitamina D en 11,2 ng/mL** = deficiencia franca (el corte está en 20), medida en **2023** y nunca
  re-controlada. El plan de nutrición sugiere una dosis de mantenimiento, no de corrección. **Es el
  punto más accionable de toda la analítica.**
- **ApoB y Lp(a)**: estratifican el riesgo cardiovascular mucho mejor que el LDL calculado. La ApoB
  se midió una vez (110, en 2023); la Lp(a) **nunca**, y se mide una sola vez en la vida.
- **Testosterona nunca medida**, en alguien con déficit prolongado.

El sistema registra y deriva; **no interpreta ni trata**. Esto es conversación médica.

Lista de qué pedir en [`../data/processed/2026-08-16_blood-markers.md`](../data/processed/2026-08-16_blood-markers.md).

</details>

## 6 · Las revisiones semanales que faltaban — HECHO (2026-08-19)

**15 revisiones escritas (W19 a W33)** con datos reales de Supabase, en
[`../tracking/weekly-reviews/`](../tracking/weekly-reviews/). Lo que salio del analisis:

1. **La fuerza progreso pese a 10 sesiones en 15 semanas.** Banca 80 -> 90 kg, sentadilla 90 -> 100,
   OHP 50 -> 55, con el RPE clavado entre 7,0 y 7,4. Era margen que venia de antes del paron, y ya
   esta casi agotado: con 0,67 sesiones por semana no se sostiene.
2. **El peso muerto lleva sin tocarse desde el 3 de mayo** — cero sesiones de `lowerB` en 15 semanas.
   El hueco mas grande del historial.
3. **La semana 29 conecta sueno y rendimiento.** Readiness 48,3 y sueno 6,04 h (los dos minimos del
   periodo) es exactamente la semana del **unico retroceso de carga** de todo el tramo: el remo cayo
   de 60 a 50 kg. La sentadilla del dia siguiente aguanto — bajo fatiga cae antes lo accesorio.
4. **La mejor semana fisiologica fue de cero entrenamientos** (W30: frecuencia en reposo 43,5, la
   minima del ano). Estar descansado y estar en forma no son lo mismo.
5. **El sueno subio ~24 min por noche** entre el primer y el ultimo tramo. La mejora mas solida del
   periodo, y la unica que no depende de entrenar.
6. **Carreras: Z2 cumplido 3 de 6, y las tres ultimas fuera** (HR 147-149 contra un techo de 143).
   Pero **19 s/km mas rapido a la misma frecuencia cardiaca** que en mayo: la base aerobica mejoro.

`latest.json` programa **W35** (24-30 ago): el peso muerto vuelve **a 90 kg con gate de RPE**, no a
110; sentadilla 102,5; OHP 57,5; dominadas BW+2,5; remo de vuelta a 60; banca mantiene 90; y carreras
en Z2 estricto por debajo de 143.

<details>
<summary>Descripcion original del punto</summary>

Sin registro desde la semana 18 (4 de mayo). Merece su propia pasada con `/weekly-review-auto`.

</details>

## 7 · Deuda que no bloquea nada — **Claude, al final**

- **No existe una variante sin gimnasio.** Ninguna de las cuatro funciona sin rack y barra, aunque
  la de 3 días se llamara "viaje / sin gym" hasta el 17-ago. La librería ya tiene flexiones,
  dominadas, sentadilla búlgara, puente de glúteo y plancha con patrón asignado; faltan un empuje
  vertical y un tirón horizontal sin equipo, y una quinta opción en el selector. Es diseño nuevo.
- **Movilidad: 2 registros en total, el último del 27 de abril.** Con dos contracturas lumbares
  detrás y una regla que pide 2-3 sesiones por semana. O la haces y no la registras, o no la haces:
  las dos cosas importan y ninguna se ve desde aquí.
- ✅ **Perfil y plan de nutrición recalibrados** (19-ago, con la Tanita del 11-ago): metabolismo basal
  por tres métodos (Katch-McArdle 1.942 como referencia, que es el único que usa la masa magra
  medida), **calorías cicladas 2.700 entreno / 2.400 descanso** para que la disponibilidad energética
  no caiga por debajo de 30 los días de entreno, **proteína 170 → 185 g**, y la periodización de
  carbohidrato con los días corregidos (estaban invertidos: Lower es Lun/Jue, no Mar/Vie).
  **Corregido también el plazo: 16-18 semanas, no 12-16** — las 12 exigían un déficit por encima de
  la banda que fija el propio sistema.
  **Lo único que no se puede calibrar sin ti: pesarte.** Los números son de fórmula; la media móvil
  de 7 días es el único árbitro. Último registro: 27 de mayo.

---

## Cerrado

| Fecha | Qué | Versión |
|---|---|---|
| 2026-08-15 | Objetivos de FC rotos al enviar cardio al COROS: se mandaban bpm absolutos, que intervals.icu lee como porcentaje de la FC máxima → objetivos imposibles en el reloj | v11.33 |
| 2026-08-16 | Auditoría completa del knowledge base; módulos de longevidad y calor; 5 analíticas procesadas | v11.34 |
| 2026-08-16 | **La cola de sync llevaba congelada desde el 30-jun** por un registro que no podía subir nunca (tabla inexistente) y un `break` que bloqueaba todo lo que venía detrás | v11.35 |
| 2026-08-16 | El deload no se disparaba desde mayo; pecho y dominadas pasaban a 2×/semana; la variante de 5 días dejaba de borrar el peso muerto | v11.35 |
| 2026-08-16 | **Solo se importaban carreras**: bici, remo, ski, elíptica y caminata se descartaban en silencio en los dos caminos de entrada | v11.36 |
| 2026-08-17 | Sin trabajo anti-rotación ni anti-extensión en ninguna sesión, con historial lumbar — y la taxonomía era incapaz de detectarlo | v11.37 |
| 2026-08-18 | Corregido un error propio: el RDL añadido el día anterior dejaba cuatro compuestos de barra seguidos y una bisagra tras sentadilla pesada. `fullB` no tenía nada de cuádriceps | v11.38 |
| 2026-08-18 | **`VirtualSki` faltaba en el mapa**: cada sesión de SkiErg se descartaba justo después de conectar Concept2. El catálogo tampoco tenía workouts de ski | v11.39 |
| 2026-08-19 | Ninguna variante funcionaba sin gimnasio, así que un viaje equivalía a no entrenar. Variante Viaje + pliometría + híbrido trineo/SkiErg | v11.42 |
| 2026-08-20 | **Los rangos del laboratorio escondían tres cosas** (ApoB, ferritina, vitamina D). Analítica puntuada contra objetivos de guía, documento + sección en la app, y los tests que impiden que documento y código divergan | v11.43 |

### El patrón que se repite

Cuatro de los fallos de arriba comparten forma: **el sistema no podía ver su propio incumplimiento.**
La cola descartaba en silencio, el filtro de actividades descartaba en silencio, la pantalla de
ajustes decía "backed up automatically" pasara lo que pasara, y la taxonomía de core no sabía
expresar la regla que debía cumplir.

No fue falta de evidencia ni de reglas. Fue que **nada dejaba rastro al fallar**. De ahí la
prioridad de los diagnósticos visibles y de los tests: el fallo de la variante de 6 días lo encontró
un test, no la lectura del código.
