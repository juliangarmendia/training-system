# Auditoría del sistema — 2026-08-16

> Encargo: auditar los documentos del proyecto (entrenamiento, nutrición, fuerza, pérdida de grasa,
> HIIT, longevidad) y responder si falta algo, si esos documentos se usan de verdad en los
> entrenamientos, y si los entrenamientos son eficientes y lo mejor probado para este perfil.
>
> Alcance: **informe**. No se cambió el contenido del plan de entrenamiento. Las decisiones que lo
> afectan están al final, sin aplicar.

## Resumen

El corpus científico es sólido y está por encima de la media de lo que se ve en sistemas de
entrenamiento personales: 59 reglas trazadas a fuente, 3 rondas de verificación con DOI/PMID, un
vocabulario de evidencia único, y correcciones de cita reales (Refalo→Robinson, Barakat degradado a
narrative review, Nielsen marcado inconcluso, Byrne reescrita sin el claim de FFM). Eso no es
decorativo: es trabajo de verificación de verdad.

**El problema no es el corpus. Es la distancia entre el corpus y lo que ocurre.**

Tres cosas que el sistema declara no existen en el código: el deload, la progresión y el estímulo
aeróbico diario. Una cuarta —el espejo de datos— lleva apagada desde el 30 de junio. Y la regla
sobre la que descansa toda la estructura de bloques (GEN-001) es la menos verificada del corpus.

---

## 1 · Auditoría de `IDEAL_BLOCK_V1`

El plan vivo desde v11.28 (2026-06-30). Default = variante 6:

| Día | Sesión | budgetWeight | Z2 finisher |
|---|---|---|---|
| Lun | `lowerA` · Sentadilla | 2 | 20' |
| Mar | `upperA` · Press/Remo | 1 | 20' |
| Mié | Cardio Z2 40' + movilidad | 0,5 | — |
| Jue | `lowerB` · Bisagra | 2 | 20' |
| Vie | `upperB` · Dominadas/OHP | 1 | 20' |
| Sáb | "Cardio calidad" 50' | 1 | — |
| Dom | Recuperación activa | 0 | 20' |

Cada día lleva sus `ruleIds` como etiqueta. Varias de esas etiquetas no se cumplen.

### A1 · Frecuencia por patrón — falla en las 4 variantes

| Variante | Días de fuerza | Patrones 2×/sem | Patrones 1×/sem |
|---|---|---|---|
| 3 "Mínima" | fullA, fullB | ninguno | los 6 |
| 4 "Reducida" | fullA, fullB | ninguno | los 6 |
| 5 "Alta" | lowerA, upperA, upperB | tirón horizontal | sentadilla, **bisagra**, empuje horiz., press vert., tirón vert. |
| 6 "Ideal" | lowerA, upperA, lowerB, upperB | tirón horiz., sentadilla, bisagra | **empuje horiz., press vert., tirón vert.** |

En la variante 6 el empuje horizontal vive entero en `upperA`: bench 4 + incline DB 3 + pec deck 3
= **10 series de pecho en una sola sesión**, y nada el resto de la semana. OHP y dominadas, solo en
`upperB`.

Series por músculo y semana (variante 6, ~80 series totales):

| Músculo | Series/sem | Sesiones/sem | Objetivo STR-003 |
|---|---|---|---|
| Pecho | 10 | **1** | 10-14 ✅ volumen · ❌ frecuencia |
| Espalda | 11 | 2 | ✅ |
| Cuádriceps | 13 | 2 | ✅ |
| Isquios | 9 | 2 | ✅ |
| Hombro (lat/post) | 9 | 2 | ✅ |
| Core | 9 | 3 | ✅ |
| Bíceps / tríceps (directo) | 3 / 2 | 1 / 1 | suficiente con el trabajo indirecto |

Contradice **STR-002** (`strong`, `ready_to_govern_code`, Currier 2026 + Currier 2023 BJSM), el
propio `ruleIds: ['STR-002']` de esos días, la afirmación de `ideal-plan-engine-v1.md` T5.1
("cubren los 6 patrones 2×/sem") y `CLAUDE.md` ("2x/week per muscle group baseline").

Matiz honesto: la frecuencia importa **menos** que el volumen semanal cuando el volumen está
igualado (Pelland 2026, Currier 2023). 10 series de pecho una vez por semana no es un desastre. Pero
sí es peor que 5+5, la evidencia de fuerza favorece 2-3×/semana, y sobre todo **el sistema afirma
hacer una cosa y hace otra**. En las variantes 3 y 4 es un compromiso razonable de dosis mínima para
semanas de viaje; en la 6, que es el default y se llama "el ideal", no.

### A2 · La variante 5 elimina el peso muerto

Al bajar de 6 a 5 días el que desaparece es **`lowerB` (bisagra)**, no un día de tren superior.
Quedan 2 sesiones de upper contra 1 de lower, y el **sumo deadlift —uno de los 5 anchors marcados
"never rotate"— no aparece en toda la semana**. La bisagra se reduce al RDL de `lowerA` (3 series).

Está escrito a propósito (`note: '3 fuerza (lower/upper/upper)'`), pero es la elección equivocada:
sacrifica cadena posterior, glúteo e isquios enteros, y contradice STR-002, STR-005 (slot pesado por
patrón) y los seis patrones de `CLAUDE.md`.

### A3 · El Z2 diario —la tesis del bloque— no está implementado

`z2Finisher` existe como dato en 9 días de las variantes 4/5/6 (80 min/semana en la 6). Rastreando
el código: se copia a `z2FinisherMin` en `buildWeekTemplateFromIdeal`, se propaga en
`getPlannedSessionForDate`, y **su único uso es concatenar el texto `+20' Z2`** en el eyebrow de
Home (`app.js:7763`) y en la cola semanal (`app.js:7625`).

No existe en ningún otro sitio: no se renderiza dentro del entrenamiento de fuerza, no se puede
registrar, no se puede enviar a COROS, no tiene zona ni FC objetivo ni modalidad, y no cuenta en el
budget. **El "estímulo aeróbico los 7 días" que justifica todo el IDEAL es ficticio los 4 días de
fuerza.**

→ Corregido en v11.34 (ver §6): el finisher pasa a ser una prescripción real, visible, registrable
y enviable. Eso **no añade volumen** — estaba prescrito desde v11.28; lo que cambia es que ahora
existe en la interfaz.

### A4 · El deload está muerto desde mayo — lo más grave del informe

`IDEAL_BLOCK_V1.weeks = 5` declara "4 build + 1 deload, **LOAD-004**". Nada lo conecta. Quien decide
el deload sigue siendo el programa de abril:

```js
function isDeloadWeek(weekNum) { return weekNum === 5 || weekNum === 9; }
```

`getWeekNumber()` cuenta semanas desde `startDate` (abril) → hoy va por ~la 19. **`isDeloadWeek`
devuelve `false` para siempre**, y gobierna 5 puntos del código (`app.js` 1506, 1641, 1671, 1755,
2761). La vía reactiva (`checkDeloadNeeded()`) necesita workouts registrados, y se cortaron el
25-jun.

**No ha habido ni puede haber un deload programado desde mediados de mayo** — tres meses. Sobrevive
también `getRunsThisWeek(wk)` (1/2/3 carreras según número de semana), otro resto de abril que aún
decide el calendario en dos sitios.

### A5 · No hay progresión

El arco declarado es "S1 2×Z2 25-30' → S4 largo 45-50'" (END-003, ~10%/semana). Los `durationMin`
son constantes (40 y 50) y no cambian nunca. Los targets de kg de `fullA`/`fullB` están congelados
en el baseline W28 desde el 30-jun. La doble progresión existe en `training-plan.md` pero no en el
generador: es manual, apoyada en que `buildExerciseCard` te muestra la sesión anterior.

### A6 · Cero potencia / pliometría

La familia `athleticism` de `SESSION_TYPES` tiene 6 subtipos con ATH-001/002/004 etiquetadas.
**Ninguna sesión la instancia.** END-007 (fuerza + pliometría mejoran la economía de carrera,
`strong`) no se cita en la app. Para un objetivo declarado de "atletismo", es un hueco entero.

### A7 · El budget planificado supera su propio tope

2 + 1 + 0,5 + 2 + 1 + 1 + 0 = **7,5** contra un `cap` de 6. Además `computeHardDayBudget()` solo
suma sesiones **ya registradas**: el plan nunca se contrasta con BUD-001, así que el guardrail es
retrospectivo y no puede rechazar nada. Los 80 min de Z2 finisher no se cuentan. Y
`renderIdealPreview()` ya no muestra la línea de budget que `ideal-plan-engine-v1.md` dice que
muestra.

### A8 · El 100% del cardio prescrito es fácil

La sesión "de calidad" del sábado tiene `subtype: 'long_easy'`; el texto dice "progresivo Z2/Z3"
pero **el subtype es lo que gobierna el DSL y el budget**, así que compila a `- 50m Z2 HR`. END-004,
END-008 y toda la mitad threshold/intervals de `SESSION_TYPES.cardio` no las usa nadie.

En déficit con 4 días de fuerza, cero cardio duro es una lectura razonable de BUD-001. Lo que no se
sostiene es **declarar** 80/20 y una sesión de calidad, y ejecutar otra cosa.

### A9 · GEN-001 no es best practice tal como está escrita

GEN-001 dice *"Progress only ONE dominant quality per block"*. El IDEAL declara dos
(`progressing: ['Fuerza/hipertrofia', 'Base aeróbica']`). Antes de llamar a eso una violación, hay
que mirar la regla:

- GEN-001 cita **Huiberts 2024**, pero el claim verificado de Huiberts en `source-coverage-audit.md`
  es que la interferencia es *real pero **modesta***, modulada por sexo y training status, con los
  **entrenados protegidos en VO₂max**. Huiberts no testea "progresar una cualidad a la vez"; para
  este perfil apunta más bien al revés — que es justo lo que dice INT-005 (`strong`).
- La otra fuente, **Soligard 2016**, es el consenso IOC de **carga y lesión**, no de cuántas
  cualidades progresar.
- **GEN-001 nunca tuvo ficha** en `source-coverage-audit.md` ni figura en "Gaps remanentes". Se coló
  en las 3 rondas. Es la regla sobre la que descansa toda la estructura de bloques y es la menos
  verificada del corpus.
- Los dos documentos se contradecían: `evidence-to-rules.md` la graduaba `moderate` +
  `confidence: high`; `rule-readiness.md` la clasifica como
  `expert_or_extrapolated_use_with_guardrails` con base "síntesis".

Es una heurística sensata de gestión de fatiga para atletas avanzados buscando pico en una cualidad.
Para un recreacional en déficit moderado con 4 días de fuerza y cardio fácil, mejorar fuerza y base
aeróbica a la vez es normal y está respaldado. **Que el IDEAL declare dos cualidades en progresión
es defendible; lo que había que arreglar era la regla.** → Corregida en esta ronda: `moderate` →
`expert`, `confidence` high → medium, fuentes reatribuidas, ficha añadida.

---

### A10 · La app sólo importaba carreras (descubierto y corregido en v11.36)

Este hallazgo **no estaba en la auditoría original** — apareció cuando Julian notó que su cardio no
aparecía por ningún lado. Es el más consecuente de todos los de ingesta.

Los dos caminos de entrada filtraban por tipo `Run` y **descartaban en silencio todo lo demás**:

- `app/app.js` — `filter(a => a.type === 'Run' || …)`
- `supabase/functions/strava-sync/index.ts` — `filter(a => a.type === "Run" …)`
- `app/whoop.js` — importa **solo wellness**; nunca actividades

Consecuencia: bici, remo, ski, elíptica, caminata y natación **no existían** para el sistema, aunque
Whoop y Strava las registraran. El store `sessions` llevaba **0 filas** desde su creación. Y como el
hard-day budget, el volumen semanal, la adherencia y el advisory diario leen de ahí, todos operaban
sobre una imagen parcial de la carga real.

Lo más incoherente: `CARDIO_LIBRARY` puede mandar 13 workouts de bici, remo y ski al COROS —
y la app **no podía leer que se hubieran hecho**. El catálogo era de ida y no de vuelta, en un
sistema cuyo `CLAUDE.md` declara el cardio *"cualidad co-igual, no una modalidad subordinada"*.

**Corregido en v11.36:** `CARDIO_TYPE_MAP` mapea 23 tipos a 8 modalidades; carreras a `runs` y el
resto a `sessions`; fuerza excluida a propósito para no duplicar el log de gym; backfill desde
2026-04-01; dedup entre fuentes; y **diagnóstico visible de qué se importa y qué se descarta**.

> **El patrón que se repite en las tres rondas: el descarte silencioso.** `drainSyncQueue` hacía
> `break` sin decir nada; el filtro de actividades tiraba sin decir nada; Settings afirmaba "Data
> backed up automatically" pasara lo que pasara. Cada vez, el fallo era invisible hasta que alguien
> lo notó por casualidad. La lección de diseño no es "arreglar el filtro": es **que ningún camino
> descarte datos sin dejar rastro**.

### A11 · Auditoría de Full Body A (2026-08-17, corregido en v11.37)

Julian pidió auditar `fullA` con criterio crítico. `fullA` y `fullB` son las **únicas** sesiones de
fuerza de las variantes de 3 y 4 días, así que lo que falle ahí falla cuando menos margen hay.

**Lo que estaba bien:** selección de compuestos, orden (compuestos primero, alternando
inferior/superior), RPE 7-8 = 1-3 RIR (STR-004), descansos 180/150/120 s (STR-006), y 5 de 6
compuestos tocando el rango 3-6 por abajo (STR-005). **El volumen bajo tampoco era un error:**
25 series/semana es dosis de mantenimiento deliberada, y ACSM 2026 reconoce explícitamente que
dosis mínimas producen resultados sustanciales. El problema era la **composición**, no la cantidad.

| # | Hallazgo | Estado |
|---|---|---|
| 1 | **ATH-003 incumplida y estructuralmente indetectable.** `fullA` cerraba con Cable Crunch (flexión espinal cargada) y `fullB` con Hanging Leg Raise (flexión de cadera): **cero** anti-rotación o anti-extensión, con dos contracturas lumbares en el historial. Y `MOVEMENT_PATTERNS` metía todo el core en un bucket `'core'`, así que cualquier chequeo de "core 2×/semana" daba la sesión por buena. **La regla estaba bien escrita y era inaplicable** | ✅ Taxonomía partida en `core-anti-rotation` / `core-anti-extension` / `core-flexion`; Pallof a `fullA`, Ab Wheel a `fullB` |
| 2 | **Cero series directas de isquios en toda la semana de 3/4 días.** Lo único posterior eran las 3 series de sumo — que lleva gate lumbar, así que en un mal día la cadena posterior entera podía quedar en nada | ✅ RDL 2×8-10 @RPE 7 en `fullA`; de paso la bisagra pasa a 2×/semana |
| 3 | **La variante de 4 días no añadía nada de fuerza:** mismas 2 sesiones y las mismas 25 series que la de 3 días; el cuarto día es cardio. Su nota decía "sin perder cobertura" y la cobertura era idéntica | ⏸ Acoplado al **presupuesto de dureza** (`pendientes.md` punto 3b) — arreglarlo sube la suma a 6,5 sobre un objetivo de 6. Mejor con carga real medida |
| 4 | **La variante 3 decía "Viaje / sin gym"** y `fullA` prescribe rack, barra, banco y máquina de cables: 4 de 4 ejercicios necesitan gimnasio completo | ✅ Etiqueta corregida. **No existe** una variante sin gimnasio de verdad — hueco abierto |
| 5 | **`EQUIP_SUBS` es decoración.** `renderIdealPreview` afirma "cada día tiene alternativas si falta equipo"; la constante aparece en exactamente dos sitios del código y no está conectada a ninguna sesión | ⏸ Documentado, no arreglado |

**Y lo que encontró el test, que la auditoría no vio:** al ejecutar el chequeo de ATH-003 sobre
**las cuatro** variantes y no solo sobre `fullA`, saltó que la variante 6 —**la que está viva**—
tenía el mismo fallo: solo el Pallof de `lowerB`, con `lowerA` y `upperB` en flexión. Cero
anti-extensión en la semana real. Corregido cambiando el Cable Crunch de `lowerA` por Ab Wheel
(donde estaba antes de que v6.0 lo sustituyera). El core del plan vivo queda 3/3/3 entre
anti-extensión, anti-rotación y flexión, con el volumen total intacto en 83 series.

> **Tercera lección del mismo tipo.** Los tres fallos grandes de esta auditoría —cola de sync,
> filtro de actividades, y ahora ATH-003— comparten forma: **el sistema no podía ver su propio
> incumplimiento.** No fue falta de evidencia ni de reglas; fue que el código descartaba en
> silencio o el modelo de datos no sabía expresar la distinción. Escribir el chequeo fue lo que
> encontró el problema en la variante viva, no leer el código.

### A12 · Corrección de A11: el RDL fue un error (v11.38, 2026-08-18)

Julian rechazó el resultado de A11: *"Full body A es muy malo... barbell back squat y barbell bench
press y luego barbell row y barbell rdl terminando con cable pallof press"*. Tenía razón.

**El hueco de isquios que A11 detectó era real. La solución que aplicó no.** Meter un RDL dejaba
`fullA` con **cuatro compuestos de barra seguidos** y ponía una bisagra justo después de 4 series de
sentadilla pesada — apilando carga axial en la sesión, sobre un historial de dos contracturas
lumbares. Se arregló un hueco creando un riesgo mayor.

| Corrección | Por qué |
|---|---|
| `fullA`: **RDL → Seated Leg Curl** | Mismo estímulo de isquios, **cero** carga espinal. La extensión de cadera ya la cubre el sumo de `fullB`; lo que faltaba era flexión de rodilla. Baja de 4 a 3 compuestos de barra |
| `fullB`: **+ Leg Extension** | `fullB` **no tenía nada de cuádriceps**. El cuádriceps dependía entero de la sentadilla de `fullA`, un solo día → ahora 7 series en 2 días (STR-002). A11 no lo vio |

Volumen de la semana de 3/4 días: 25 → 31 series. Sigue siendo dosis de mantenimiento; el aumento
son dos ceros que se rellenan (cuádriceps en B, isquios en A).

**Nuevo chequeo automático de carga axial**, para que este error no se repita: ninguna sesión
full-body puede llevar más de **un** lift de carga espinal pesada ni más de **tres** compuestos de
barra. Los días de pierna dedicados admiten dos (sentadilla + RDL en `lowerA` es programación
estándar: hay 48 h hasta el siguiente día de pierna y el resto de la sesión no compite).

> **Y una nota sobre el propio chequeo.** La primera versión aplicaba el tope de 1 a *todas* las
> sesiones y marcaba `lowerA` como fallo. `lowerA` no es un fallo: la regla estaba mal calibrada.
> Un test demasiado estricto también miente — igual que la UI que decía "backed up automatically".

### A13 · `EQUIP_SUBS` retirado (v11.38)

`EQUIP_SUBS` existía desde T4 y sus **únicos dos usos en todo el código** eran su definición y una
frase del preview: *"Cada día tiene alternativas si el gym está lleno o falta equipo"*. No había
mecanismo detrás. Afirmación falsa, retirada.

La capacidad real existe y es mejor: `showSwapUI` (T5.2, v11.31) cambia cualquier ejercicio desde
la pantalla de la sesión, persiste en `settings.exerciseOverrides`, es reversible, y no lo pisa el
cambio de variante. El preview ahora apunta ahí.

### A14 · Variante 4: nota honesta (v11.38)

Decía *"2 full-body + 2 cardio. Para semanas con menos margen, **sin perder cobertura**"* cuando la
cobertura de fuerza es **idéntica** a la de 3 días. Ahora dice lo que hace: añade un día aeróbico,
la fuerza es la misma.

**No se le añadió un tercer día de fuerza**, y la razón es la misma que en A11: subiría el budget a
7 sobre un tope de 6 (BUD-001), y esta variante existe justamente para semanas con menos margen —
meterle otra sesión dura contradice su propósito. Sigue abierto en `pendientes.md` punto 3b, con carga real medida.

## 2 · ¿Se usan los documentos en los entrenamientos?

**34 de 59 Rule IDs aparecen en `app.js` (58%)** — pero citar no es cumplir.

| Dominio | Estado |
|---|---|
| **Fuerza (micro)** | ✅ De verdad. RPE 7-8 (STR-004), descansos 150-210 s en compuestos (STR-006), ROM completo y posición alargada (STR-007), core anti-rotación (ATH-003), gate lumbar del sumo, volumen 10-14 (STR-003) |
| **Fuerza (macro)** | ❌ Frecuencia por patrón (A1/A2), deload (A4), progresión (A5) |
| **Aeróbico** | ⚠️ El eslabón débil. END-005 *bloqueada por datos* (no se extraen zonas ni splits); el 80/20 de END-001 **no es medible** por lo mismo; END-004 no tiene nada que limitar; END-007 no se cita y no hay pliometría; el Z2 diario no estaba implementado (A3). **Y había una causa más profunda que esta auditoría no vio: la app sólo importaba actividades de tipo `Run`**, así que bici, remo, ski y caminata no entraban nunca. No era sólo un problema de *prescripción*: era de **ingesta**. Corregido en v11.36 — ver A10 |
| **Nutrición** | ❌ **Cero**. REC-001..005 no aparecen ni una vez en la app, siendo la pérdida de grasa el objetivo #1 |
| **Readiness** | ⚠️ A medias. El score de WHOOP se usa como flag (READ-003 ✅, honesto), pero READ-001/004 (media móvil 7d, baseline individual) no están: `getWhoopContext()` toma el último día suelto |
| **Selección** | ⚠️ SEL-001..004 no se citan pese a que `ALT_LIBRARY` y la elección de modalidad existen |

Reglas sin ninguna presencia en la app: GEN-001/002/003, STR-008, STR-010, **REC-001..005**,
INT-003/005/006, END-002, END-007, LOAD-001/002/003, READ-001/004, SEL-001..004, BUD-002.

---

## 3 · El espejo de datos está apagado

Consulta directa a Supabase (`ycfodifvpvosukepcxie`, 2026-08-16):

| Tabla | Filas | Último registro |
|---|---|---|
| `workouts` | 15 | **2026-06-25** |
| `runs` | 8 | 2026-05-24 |
| `wellness` | 61 | 2026-06-30 |
| `steps` | 58 | 2026-06-29 |
| `bodyweight` | 15 | 2026-05-27 |
| `nutrition` | 11 | 2026-05-28 |
| `sessions` | **0** | — |

### ✅ CAUSA RAÍZ ENCONTRADA Y CORREGIDA (2026-08-16, v11.35)

**Un mensaje envenenado bloqueaba la cola de salida desde el 30 de junio.**

`drainSyncQueue()` recorría la cola ordenada por timestamp y, ante el **primer** fallo, hacía
`break` — salía del bucle entero. El comentario decía *"leave in queue for retry"*, pero un elemento
que **nunca puede tener éxito** se reintenta para siempre y arrastra consigo todo lo encolado
después. Head-of-line blocking clásico.

El elemento envenenado era un registro de `plans`:

1. `applyIdealPlan()` corre en `init()`. La primera vez, el plan activo era `Re-Entry ...` ≠
   `Ideal · 6 días`, así que llamó a `createNewPlanVersion()`.
2. Esa función hace `smartPut('plans', …)` → `syncedPut` → `enqueueSync('plans', 'upsert', …)`.
3. **La tabla `plans` no existía en Supabase.** Estaba en la lista de sync (`supabase-sync.js:239`)
   pero nunca se creó — igual que `exercises`.
4. Error permanente → `break` → **cola congelada**.

**La fecha encaja exactamente.** Último push correcto en todas las tablas: **2026-06-30**.
`v11.28 "T5 — ideal plan is the live default"` se commiteó el **2026-06-30**.

Y explica el detalle que más chirriaba: **`sessions` con 0 filas** pese a estar conectada desde
v11.24. El logger unificado de Cardio empezó a escribir ahí en **v11.29 (2026-07-01)** — un día
*después* del atasco. Nunca tuvo una sola oportunidad de subir.

**Descartado:** no fue sesión caducada. Los pushes del 30-jun prueban autenticación válida posterior
al último sign-in (21-jun), y la sesión se auto-renueva.

**Por qué nadie se enteró en 7 semanas:** el fallo era un `console.warn` y nada más, mientras
Settings decía *"Synced to cloud. Data backed up automatically."* de forma incondicional.

**Corregido en v11.35:**
- Tablas `plans` y `exercises` creadas (migración `add_plans_and_exercises_sync_tables`, patrón
  idéntico a `sessions`: PK `(user_id, record_id)`, RLS por `auth.uid()`). El backlog drena solo.
- `drainSyncQueue`: `break` → `continue`; contador de intentos; **cuarentena** para fallos
  permanentes (`42P01`, `PGRST205`…) o tras 5 intentos. Un elemento roto ya no puede bloquear.
  Además colapsa upserts superseded del mismo registro, que en 7 semanas de backlog son mayoría.
- Settings muestra estado real (pendientes, cuarentena, último sync correcto) y Home avisa si hay
  backlog de más de 24 h.
- `mobility_sessions` añadido al pull; **backup JSON completo** (el CSV se dejaba `sessions` y
  `mobility_sessions`); `navigator.storage.persist()` en `init()` — antes ni se pedía.

**Nada se perdió:** IndexedDB en el iPhone conserva todo, y las carreras además viven en
COROS/Strava/intervals.icu. El backfill de W19–W32 sigue pendiente y ahora **es posible** en cuanto
suba el backlog.

---

## 4 · Documentos desincronizados

Hoy es **2026-08-16 (ISO W33)**.

| Documento | Actualizado | Qué afirmaba que ya no era cierto |
|---|---|---|
| `plans/training-plan.md` | 2026-06-20 | "Current ISO week: 25"; rampa W26–W28 (terminó el 12-jul); "Next review: W29" nunca ocurrió |
| `plans/running-plan.md` | 2026-04-06 | "Zone 3 NOT during this plan", "Why Not HIIT During a Cut", HR<140, MAF 142, 88,6 kg |
| `plans/nutrition-notes.md` | 2026-05-02 | TDEE 2.900 calculado para "4 gym + 2 runs"; tabla de CHO con días equivocados |
| `docs/profile.md` | 2026-06-20 | "On a 3-week re-entry ramp"; último peso fiable del 2026-05-04; "Injuries: **None**" pese al historial lumbar |
| `docs/goals.md` | 2026-04-06 | "4 gym + 2-3 runs", "Wed + Sat", timeline vencido |
| `tracking/` | W18 (2026-05-04) | 14 semanas sin revisión |
| `AGENTS.md` | — | Copia del CLAUDE.md **viejo**: "running as a secondary modality", cuando el actual dice "co-equal trainable qualities, **not** a subordinate modality" |
| `acsm-summaries.md` §6 | 2026-05-02 | "Buenos Aires winters", "Bariloche ski trips" |

Todos marcados o corregidos en esta ronda. Ninguno se reescribió con números nuevos, porque no los
hay (§3).

---

## 5 · Lo que faltaba

### 5.1 Longevidad — no existía nada

Cero módulos de salud en `corpus-map.md`, cero reglas, y **5 analíticas sin procesar** desde 2021.
Añadido: **módulo 11** + reglas `LONG-001..004` + `data/processed/2026-08-16_blood-markers.md`.

**Dos hallazgos de las analíticas** (detalle y caveats en el archivo procesado):

- 🔴 **Vitamina D 11,2 ng/mL** (ago-2023) = **deficiencia** franca (<20), no insuficiencia. Nunca se
  volvió a medir. `nutrition-notes.md` recomienda 1.000-2.000 UI/día con la coletilla "get blood
  levels tested if possible" — ya se midió, y esa es dosis de mantenimiento, no de corrección.
- ⚠️ **LDL 149 → 170 mg/dL** y colesterol total 226 → 260 entre 2021 y sep-2024, con HDL (68) y
  triglicéridos (101) intactos. **ApoB 110 mg/dL** (ago-2023). No es el patrón del síndrome
  metabólico — el HOMA bajó de 2,8 a 1,3 y la HbA1c era 5,3%. Es un tema médico, no de
  entrenamiento.

Nunca medidos: **testosterona / SHBG** (llamativo en alguien en déficit prolongado, cuando el
sistema ya vigila la libido como proxy), **Lp(a)**, **VO₂max real**.

⚠️ La analítica más reciente tiene ~23 meses. Es baseline histórico, **no** estado actual, y ninguna
regla se dispara sobre ella.

### 5.2 Calor — no existía nada, en agosto en Madrid

El único paper ambiental del corpus es el de lesiones por **frío** (2006, aplicabilidad LOW) y su
resumen aún asumía Buenos Aires. El propio caveat de END-005 nombra "Madrid summer" como confusor.

Añadido: reglas `ENV-001..002`. El punto práctico: en calor, para una misma potencia la FC sube
(Périard 2015/2016), así que **anclar la Z2 a la FC en agosto significa correr más lento de lo que
el plan cree** — no es que estés peor, es que el termómetro está dentro de la ecuación. Mantener la
FC y aceptar el ritmo es lo correcto; forzar el ritmo saca de zona.

### 5.3 Reglas operativas de nutrición sin ID

La síntesis ACSM generó 8 acciones; 4 se implementaron en `nutrition-notes.md` (hidratación 500 mL,
periodización de CHO, monitoreo LEA, tempo excéntrico) pero **ninguna tenía Rule ID**. Como la app
aplica por Rule ID, eran inaplicables por diseño. Añadidas: `REC-006` hidratación · `REC-007` CHO
por tipo de día · `REC-008` energy availability · `REC-009` pasos/NEAT · `ATH-006` suelo de
movilidad.

---

## 6 · Cambios de app en esta ronda (v11.34)

Solo de **superficie**. No se tocó qué prescribe el plan.

1. **Home, día de fuerza** — antes: una foto y la cadena `"6 exercises · 20 sets · 60-75 min ·
   +20' Z2"`. Ahora: tarjeta de prescripción con los ejercicios (series × reps @ RPE) y el **Z2
   finisher como fila propia** con duración, zona y FC objetivo reales, botón de registrar y de
   enviar a COROS. Los días de cardio ya tenían esto; los de fuerza no.
2. **Catálogo de cardio** — badge **"Recomendado hoy"** sobre el workout que encaja con el plan del
   día, y aviso discreto en los que chocarían (p. ej. VO₂ 5×3 en víspera de pierna pesada, INT-001).
   **Los 13 workouts siguen enviables cualquier día.** Avisar, no impedir.

---

## 7 · Decisiones para Julian

> ## ⚠️ LAS ETIQUETAS D1-D7 ESTÁN RETIRADAS (2026-08-18)
>
> **La lista viva de pendientes es [`../docs/pendientes.md`](../docs/pendientes.md).**
>
> Numerar las decisiones fue un error de comunicación: acabé citándolas por número —"eso es D5"—
> como si el usuario las tuviera memorizadas, cuando vivían enterradas en un informe de 500 líneas.
> Lo mismo con "el tope de 6", jerga que nunca traduje.
>
> Esta sección se conserva como **registro de qué se decidió y por qué**. Para saber **qué sigue**,
> ir a `docs/pendientes.md`, que está en castellano, ordenado y con un dueño por línea.
>
> Equivalencias, por si aparecen citadas en commits antiguos:
>
> | Etiqueta vieja | Dónde está ahora |
> |---|---|
> | D1, D2, D3, D7 | Cerradas — ver la tabla "Cerrado" de `pendientes.md` |
> | D4 (sesión de calidad del sábado) | `pendientes.md` punto **3a** |
> | D5 (la semana suma 7,5 sobre 6) | `pendientes.md` punto **3b** |
> | D6 (analítica nueva) | `pendientes.md` punto **5** |

### ✅ Aplicadas en v11.35

| # | Qué se hizo |
|---|---|
| **Deload** | `isDeloadWeek` se ancla al bloque de 5 semanas del IDEAL (`deloadAnchorWeek` en settings) en vez de a `wk===5\|\|wk===9` de abril. El ancla se fija a la semana actual, así que **el primer deload cae 4 semanas después**, sin sorpresas. De paso se retiró `getRunsThisWeek` (resto de abril que decía "Optional run" los domingos, contra el IDEAL) |
| **Frecuencia por patrón** | Pec Deck pasa de `upperA` a `upperB`; Lat Pulldown entra en `upperA`. **Empuje horizontal 2×/sem** (7+3) y **tirón vertical 2×/sem** (3+4). Pecho sigue en 10 series. **Coste real: espalda 11 → 14 series/sem y total 80 → 83.** Sigue dentro de 10-14 (STR-003), pero es un aumento de volumen en déficit, que STR-001 desaconseja — queda dicho, no disimulado. El press vertical (OHP) se deja a propósito en 1×/sem |
| **Variante de 5 días** | La variante de 5 días quita `upperB` en vez de `lowerB`: **lower/upper/lower**, con el sumo deadlift intacto. Gracias a D2 el tirón vertical sobrevive en `upperA`; sólo se pierde el press vertical. **Efecto secundario:** su budget sube de 5,5 a 6,5, por encima del objetivo de 6 → ver `pendientes.md` punto 3b |

Para que los cambios lleguen al teléfono se añadió `PLAN_REV`: `applyIdealPlan()` era idempotente
por etiqueta, así que una edición de sesiones nunca habría regenerado el plan en un dispositivo que
ya tuviera `Ideal · 6 días`.

### Abiertas → seguidas ahora en [`../docs/pendientes.md`](../docs/pendientes.md)

### Sesión de calidad real (A8) — *`pendientes.md` punto 3a*

Si quieres que el sábado sea de verdad una sesión de calidad, su `subtype` debe ser `zone3` o
`threshold`, no `long_easy` — eso lo hace contar en el budget y compilar correctamente al COROS. Si
prefieres mantener todo fácil (defendible en déficit), hay que quitar "calidad" y el 80/20 de la
documentación. **Hoy dice una cosa y hace otra; cualquiera de las dos es coherente.**

### El presupuesto de dureza suma 7,5 contra un objetivo de 6 (A7) — *`pendientes.md` punto 3b*

Contrastar el plan contra BUD-001 al generarlo, no solo a posteriori. Con el reparto actual, o sube
el `cap` a 7,5 con justificación, o baja el peso de un día. **Antes de tocar nada, conviene tener
datos reales** (§3) para saber si 7,5 es demasiado *para ti* o solo sobre el papel.

### Analítica de sangre nueva (5.1) — *`pendientes.md` punto 5*

Es el requisito para que el módulo de longevidad sirva de algo. Lo mínimo: perfil lipídico + ApoB +
Lp(a) · glucosa + HbA1c + insulina · **testosterona total y libre + SHBG** · 25-OH vitamina D · PCR
ultrasensible + ESR · hepatograma · urea/creatinina/TFGe · TSH. En ayunas, sin entrenamiento fuerte
48 h antes, bien hidratado.

### ✅ Arreglar el sync (§3) — HECHO en v11.35

Causa raíz encontrada y corregida (ver §3). Queda un paso que sólo puede hacer el usuario:
**abrir la app en el iPhone** para que el backlog drene. Después, el backfill de W19–W32 con
`/weekly-review-auto` ya es posible y merece su propia pasada.

---

## Trazabilidad

Todos los hallazgos de código se verificaron leyendo `app/app.js` directamente (líneas citadas). Los
de datos, consultando Supabase. Los de analíticas, extrayendo los PDF originales. Las fuentes nuevas
del corpus se verificaron por búsqueda web antes de citarse; las que no se pudieron verificar quedan
`pending_research`. Ninguna cifra de este informe es inferida.
