# Auditoría profunda del sistema — 2026-09-05

> Encargo: investigar → entender → cuestionar → validar → diagnosticar → priorizar → planificar.
> **Sin implementar nada.** El entregable es un diagnóstico y un *implementation brief* para el
> agente que ejecute los cambios.
>
> Estándar de evidencia: cada finding importante se rastreó hasta el código (fichero y función),
> se buscó si existía ya un guardarraíl, y se marcó **Confirmed / Likely / Risk**. Donde se pudo,
> se contrastó contra datos reales de Supabase (proyecto `ycfodifvpvosukepcxie`). Ninguna cifra
> de este informe es inferida.
>
> Roles simultáneos: Staff Engineer · Arquitecto · Product Engineer · especialista en sistemas de
> decisión · revisor técnico de entrenamiento basado en evidencia.
>
> **Revisión 2026-09-05 (misma sesión), tras la objeción del usuario** — *"no tiene sentido que de 10
> motores usemos dos y sea un loop de la misma rutina"*: se añade **F-0** (el finding paraguas),
> se reescribe **Change 7** de "el cron llega a la tarjeta" a **"la app prescribe el set; el cron
> sobreescribe"**, se añade **Change 11** (semana del bloque + progresión de cardio), y suben de
> posición en el orden. El diagnóstico de fondo no cambia: no hacen falta 10 motores; hacen falta
> 3, y dos de ellos son conectar reglas que ya existen.

---

## 0 · Cómo leer este documento

| Sección | Para qué |
|---|---|
| §1 System understanding | Verificar que el audit parte de una comprensión correcta |
| §2 Executive assessment | Notas, 5 mejores decisiones, 5 riesgos, qué no tocar |
| §3 Findings | Cada problema con evidencia, causa raíz y dirección |
| §4 Cross-engine failure modes | Dónde cada pieza es razonable y el conjunto no |
| §5 Matriz científica | Regla → evidencia → fidelidad de implementación |
| §6 Simplificación · §7 Edge cases · §8 Test plan · §9 Roadmap · §10 No tocar |
| **§11 IMPLEMENTATION HANDOFF** | Operativo, para el agente que implemente |
| §12 Dependency map · §13 Recomendación final |

---

## 1 · SYSTEM UNDERSTANDING

### 1.1 Qué es de verdad

Una **PWA vanilla-JS de un solo usuario** (sin framework, sin bundler, `app/app.js` de 11.7k
líneas + 5 módulos) que actúa como *visor y logger*, con **IndexedDB como fuente local**
(`DB_VERSION 11`, 16 stores) espejada a **Supabase** por una cola de sync offline-first, y un
**agente Claude programado los domingos** (`/weekly-review-auto`) que lee Supabase y escribe la
revisión semanal + prescripción de la semana siguiente. Despliegue: GitHub Pages por Action al
hacer push a `main`. Service worker network-first con caché de shell versionada (`training-v11.54`).

**La premisa de arquitectura declarada en memoria del proyecto es correcta y se cumple:** "la PWA
es sólo un visor; Supabase + el cron semanal son el cerebro". Pero tiene una consecuencia que
nadie ha escrito: **hay dos sistemas de decisión y no se hablan** (ver §1.3).

### 1.2 Fuentes de datos (verificado en código y en Supabase)

```
Whoop ──► intervals.icu wellness ──► app/whoop.js (intervalsFetchWellness) ──► stores wellness · bodyweight · steps
COROS ──► Strava ──► intervals.icu activities ──► app.js intervalsIcuSync ──► runs (carreras) · sessions (resto cardio)
COROS ──► Strava ──► supabase/functions/strava-sync ──► Supabase runs/sessions   [ruta latente: 0 filas hoy]
iOS Shortcut ──► supabase/functions/steps-ingest ──► steps                        [fallback]
Manual ──► workouts · sessions (logCardio) · mobility_sessions · bodyweight · foods · meals
Foto ──► Storage meal-photos ──► supabase/functions/parse-meal-photo (Claude Opus 5) ──► meals (tras confirmación)
```

Realidad medida en Supabase (2026-09-05): `runs` 15 (12 intervals.icu + 3 manuales, **0 Strava**),
`sessions` 3, `workouts` 31 (10 en lb pre-España, 21 en kg), `wellness` 123 días con
readiness/HRV/RHR/sueño y **cero campos de energía**; `exercises` 0 filas (bug de sync, ya
corregido en v11.50, pendiente de que el backfill drene al abrir la app).

**intervals.icu es el hub, no una fuente más.** Si su companion falla, cae el peso, los pasos y
el recovery a la vez.

### 1.3 El pipeline de decisión — TAL COMO EXISTE (no como lo describe `engines.md`)

`docs/architecture/engines.md` es un **spec de diseño** — lo dice en su segunda línea: *"no
describe el generador actual"*. Los 10 motores en cascada (Block Planner → Goal → Readiness →
Interference → Modality → Strength/Cardio/Hybrid → Selection → Progression → Recovery →
Evidence) **no están implementados**. Lo que existe es esto:

```
                    ┌─────────────────────── SISTEMA A: la app (diario, in-device) ───────────────────────┐
IDEAL_BLOCK_V1 (data) ─► buildWeekTemplateFromIdeal(n) ─► applyIdealPlan() en init ─► activePlan/activeWeekTemplate
                                                                  │
                                            getWeekSchedule() overrides por fecha ─┤
                                            exerciseOverrides (swaps persistentes) ─┤
                                                                  ▼
                                     getPlannedSessionForDate(hoy) ─► {type, sessionId, exercises, z2FinisherMin}
                                                                  │
                    ┌─────────────────────────────────────────────┼──────────────────────────────────────┐
                    ▼                                             ▼                                      ▼
        computeTrainingAdvisory()                       renderTodaysPlan()                     startWorkout(sessionId)
        · classifySessionStress (toSession)             · sets×reps @RPE del PLAN               · buildExerciseCard:
        · getWhoopContext (ÚLTIMO día WHOOP)            · SIN objetivo de kg                       placeholder = peso ANTERIOR
        · computeHardDayBudget (informativo)                                                       generateCoachNote: pista +2,5 kg
        · detectInterference (2 flags)                                                           · finishWorkout → workouts
        → keep | modify | replace | recovery                                                       → detectPRs
                                    ╳ PROGRESIÓN IN-APP: NINGUNA. La regla existe (generateCoachNote) y sólo emite texto.
                                    ╳ CARDIO: durationMin constante desde el 30-jun. END-003 no existe.
                    │
        checkDeloadNeeded() (Stats)        renderFatigueCard() (Stats)        isDeloadWeek() (5 sem ancladas)
        · quality ≤2 ×2                     · score 0-100 de 6 factores         · 50% series si deload
        · RPE ≥8,5 ×3                       · + WHOOP último día
        · WHOOP <34 media 3d                → "Push hard today" / etc.
        · "5 sem sin deload" (MUERTO)

                    └─────────────────────── SISTEMA B: el cron (semanal, remoto) ───────────────────────┐
/weekly-review-auto (Claude, domingo 21:30 EDT) ─► lee Supabase (workouts, runs, wellness, nutrition, steps…)
        · tendencias 4 semanas, adherencia, top-set por lift, CTL/ATL/rampRate, peso 7d
        · REGLA DE PROGRESIÓN: RPE≤7 y reps al tope → +2,5 kg · RPE 7,5-8,5 → mantener · RPE≥9 ×2 → deload
        ─► tracking/weekly-reviews/2026-WNN.md + latest.json {coachVoice, nextWeekPlan.sessions[].exercises[].target}
        ─► push runningPlan a intervals.icu (COROS)
                    │
                    ▼
        PWA: loadAndRenderWeeklyCoach() ─► Stats › Coach Review (texto + tabla de targets)
                                            ╳ NINGÚN OTRO CONSUMIDOR de nextWeekPlan.sessions
```

**Respuestas a las preguntas del encargo:**

| Pregunta | Respuesta |
|---|---|
| ¿Dónde está la source of truth de cada decisión? | *Qué sesión hoy*: `activeWeekTemplate` + overrides. *Cuánto peso*: **no hay una** — el cron escribe un target que nadie consume; la app enseña el peso anterior; `generateCoachNote` sugiere otro. *Si entrenar hoy*: tres cálculos independientes (advisory, fatigue card, deload reminder). |
| ¿Qué engines tienen autoridad? | Ninguno la tiene formalmente. El advisory es *read-only* por diseño ("no cambia tu plan"). El cron escribe ficheros, no la app. El usuario es el único actuador. |
| ¿Decisiones tomadas en más de un lugar? | **Sí, las tres importantes**: readiness (3 sitios), progresión de carga (2 reglas distintas), deload (2 cadencias distintas: app 5 sem anclado; cron "semana 5 o 9"). |
| ¿Dependencias circulares? | No conceptuales. Sí un acoplamiento oculto: `whoopSyncData()` es una *lectura* que **escribe** 3 stores (`bodyweight`, `steps`, `wellness`). |
| ¿Puede una decisión posterior invalidar una anterior en silencio? | Sí: el cron dice "95 kg × 5-8"; la app enseña "90" (el anterior) y `generateCoachNote` dice "sube a 92,5". El usuario ve tres números. |
| ¿Jerarquía clara en conflicto? | El cron la declara (wellness > logs > peso > subjetivo). La app **no**. |
| ¿Prioridad implícita por orden de código? | Sí, en `computeTrainingAdvisory`: la cadena `if/else if` hace que un `easy` nunca llegue a mirar WHOOP, y un `moderate` sólo mire *yellow*, nunca *red*. |
| ¿Cada engine razonable y el conjunto no? | Sí — ver §4. |

### 1.4 Lo que NO pude determinar

- Si la ruta OAuth directa de Whoop (`whoop-auth`) sigue activa para alguien. En código es *fallback*; en datos, todo llega por intervals.icu. La trato como legado.
- La semántica exacta de `icu_intensity` y `icu_hr_zone_times` en la API de intervals.icu: el código las mapea *best-effort* y deja un key-logger en consola. No hay filas con `decoupling` ni `hrZoneTimes` en Supabase, así que END-005 sigue bloqueada por datos, como ya decía `data-sources-audit.md`.
- Por qué `settings.startDate` (base de `getWeekNumber()`) tiene el valor que tiene: no lo consulté. Todo el calendario de deloads depende de él (ver F-13).

---

## 2 · EXECUTIVE ASSESSMENT

### Overall system health: **Reasonable** (tendiendo a Good en la fontanería de datos tras agosto; Concerning en la capa de decisión)

| Dimensión | Nota | Por qué |
|---|---|---|
| Architecture | **6/10** | El esqueleto (visor + IDB + Supabase + cron LLM) es el correcto para un sistema de una persona. Pero los dos sistemas de decisión no se conectan, y el spec (`engines.md`) describe algo que no existe — un lector nuevo se orienta con un mapa falso. |
| Code quality | **6/10** | Consistente, y los **comentarios son ejemplares**: cada fix lleva su porqué, su fecha y su lección. Contra: un fichero de 11.7k líneas con globals; clasificación de sesiones por regex; tres cálculos paralelos de fatiga. |
| Maintainability | **6/10** | Los docs de decisión (`pendientes.md`, auditoría de agosto) son de primera. Pero **el comando del cron está desincronizado del plan vivo** en tres puntos (§F-9) y nadie lo detecta porque no hay test que lo lea. |
| Decision-system coherence | **4/10** | El punto débil. Tres readiness, dos progresiones, dos deloads, y la prescripción del cron muere en una tarjeta de Stats. |
| Scientific implementation | **5/10** | El corpus (70 reglas, DOI verificados, degradaciones honestas) está muy por encima de la media. La implementación viola sus propias READ-001/002/003/004 en tres sitios distintos, y el cron confunde `rampRate` con TSB. |
| Data integrity | **6/10** | Mucho mejor tras v11.35/v11.50 (cola con cuarentena, smartPut auditado por test). Queda la causa raíz de todos esos incidentes sin tocar: `enqueueSync` descarta sin cliente (F-1). Dedup de carreras existe pero se usa en 6 de 29 lecturas. |
| Robustness (edge cases) | **5/10** | Offline bien resuelto para logging. Mal resuelto: dato WHOOP de ayer usado como hoy; deload dependiente de `startDate`; sesiones full-body infraponderadas. |
| Testing | **5/10** | 10 tests, estilo excelente (cada uno documenta el fallo que impide). Pero **cobertura cero sobre el código de decisión**: advisory, toSession, dedup, budget, deload, fechas, cola de sync, regla de progresión. |
| Performance | **8/10** | Nada que hacer hoy. `dbGetAll` repetidos por render son irrelevantes a esta escala. |
| Security | **7/10** | RLS en todas las tablas; edge function con `verify_jwt` y comprobación de uid en ruta; bucket privado por carpeta. La API key de intervals.icu vive en `settings` (jsonb bajo RLS) y en localStorage — aceptable para uso personal, no para multiusuario. |

### Las 5 mejores decisiones del proyecto

1. **El corpus con Rule IDs y grados de evidencia**, con degradaciones honestas (GEN-001 rebajada a *expert* cuando sus fuentes no la sostenían). Es la base que permite auditar.
2. **El patrón de tabla genérica `(user_id, record_id, data jsonb)`** + cola offline-first con cuarentena. Simple, RLS trivial, y sobrevivió a un backlog de 7 semanas sin perder datos.
3. **`smartPut`/`dbPut` como distinción explícita** entre "dato de usuario" y "estado local", ahora blindada por `verify-sync-writes.mjs`.
4. **El adaptador de lectura `toSession()`**: normaliza tres stores legacy en un sobre común sin migrar nada. La idea es correcta; sólo falla su clasificador (F-7).
5. **Que el hard-day budget pasara a informativo** (decisión del usuario, 2026-08-18) y que el cron sea el cerebro en vez de un motor in-app: "afinar el motor de un coche que arranca una vez por semana rinde poco". Es la lectura correcta del problema real (adherencia), y lo dice el propio repo.

### Los 5 riesgos principales

1. **`enqueueSync` descarta cuando `supabaseClient` es null** — y todo `smartPut` de `init()` corre antes de `initSupabase()`. Es la causa raíz común de *tres* incidentes ya sufridos (cola congelada, `exercises` vacía, `foods` que no iba a subir). Sigue ahí. **F-1.**
2. **El cron periodiza sobre una métrica mal interpretada y ciega**: aplica umbrales de TSB a `rampRate` (rango real ±2 → nunca disparan) y trata CTL/ATL como "señal primaria" cuando sólo ven el cardio (CTL medio 2,4). **F-2, F-3.**
3. **Nada progresa por sí solo**: sesiones estáticas, kg no prescritos (la regla existe y sólo emite una frase), cardio a duración constante; el cron calcula la progresión y no llega al rack. Es un loop, y es la queja correcta. **F-0, F-4.**
4. **Tres readiness sin jerarquía**, uno de ellos (fatigue card) deriva un consejo de un score compuesto — exactamente lo que READ-003 prohíbe. **F-5, F-6.**
5. **El spec del cron está desfasado del plan vivo** (días de pierna invertidos, deload "5 o 9", techo Z2 140 vs 143). Un agente LLM ejecuta ese texto cada domingo. **F-9.**

### Qué parte merece más revisión

La **capa de decisión diaria + su conexión con el cron** (F-1 a F-7). Es donde el sistema promete más de lo que hace, y donde un arreglo pequeño rinde mucho.

### Qué NO tocaría (resumen; detalle en §10)

Vanilla JS sin framework · fichero único (por ahora) · tabla genérica jsonb · IDEAL como *dato* y no
generador algorítmico · cron LLM como cerebro · budget informativo · nutrición por foto con
resolución contra biblioteca · el estilo de tests.

---

## 3 · FINDINGS

Formato: **[ID] Título** · Category · Severity · Confidence · Current / Expected · Evidence · Why · Scenario · Root cause · Direction · Alternative · Trade-offs · Effort · Regression risk · Fix now?

---

### [F-0] La app es una plantilla fija con libreta: nada progresa por sí solo

**Category:** Product logic / Architecture · **Severity:** High · **Confidence:** High (Confirmed)

**Current behavior:** cuatro cosas deberían variar de una semana a otra y sólo una lo hace:

| Debería variar | Realidad |
|---|---|
| Ejercicios / series / reps / RPE | Datos estáticos en `PLAN.sessions`; cambian cuando un humano sube `PLAN_REV` (8 veces desde junio, por sesiones de Claude, no por un motor) |
| **Carga (kg)** | **No se prescribe.** `buildExerciseCard` pone como placeholder el peso **anterior**. `generateCoachNote` (`app.js:3666-3727`) tiene un árbol de decisión completo de doble progresión (sube 2,5 / mantén si RPE alto / baja / +1 rep) que **sólo emite una frase** en `.exercise-notes` y no toca el input |
| Duración del cardio | `durationMin` 40/50 constantes desde 2026-06-30 (`IDEAL_BLOCK_V1`); END-003 (+10%/sem) no existe en ningún sitio |
| Deload | Ciclo de 5 semanas anclado → 50% series, RPE 5-6, aplicado en 6 sitios. **Lo único que varía solo** |

El cron del domingo **sí** calcula progresión (kg y plan de carrera). El plan de carrera llega al COROS; los kg mueren en Stats (F-4).

**Expected:** que la app, por sí misma y offline, proponga la carga del día desde la última ejecución (doble progresión), progrese la duración del cardio dentro del bloque, y sepa en qué semana del bloque está; y que el cron **sobreescriba** cuando tiene contexto que la regla no tiene.

**Why it matters:** es la queja del usuario formulada con exactitud: *"un loop de la misma rutina semana tras semana"*. Desde donde él está, el sistema no adapta nada — la adaptación existe (cron) pero no llega, y la regla in-app existe pero no actúa. `CLAUDE.md` promete "evolving with data over weeks and months"; hoy eso ocurre en una hoja que no está en el rack.

**Root cause:** T5 (v11.28) convirtió el IDEAL en plan vivo como *dato* y dejó la progresión para "T6 — loop de adaptación (NO implementado)". T6 nunca llegó; el cron ocupó el hueco por fuera de la app.

**Recommended direction — y la corrección a mi propio primer borrador:** NO construir la cascada de 10 motores. De los 10, sólo **Progression**, **Readiness** y un **Block Planner mínimo** hacen falta como código para una persona con un objetivo fijo; Goal, Interference, Modality y Selection ya están resueltos *en tiempo de diseño* por el IDEAL (calidad el sábado, pierna Lun/Jue), `ALT_LIBRARY` y los swaps, y los generadores/Evidence no aportan nada que las sesiones autoradas no den. La solución es **conectar lo que ya existe**: (1) la regla de `generateCoachNote` pasa a ser el objetivo del set (Change 7, reescrito: app-first, cron override); (2) duración de cardio × 1,1 por semana de bloque con reset en deload (Change 11); (3) semana-del-bloque explícita reutilizando el ancla del deload (Change 11).

**Effort:** Medium (tres cambios pequeños) · **Regression risk:** Medium · **Should we fix now?:** **Yes** — es el hallazgo que define si el producto hace lo que dice.

---

### [F-1] `enqueueSync` descarta en silencio toda escritura anterior a `initSupabase()`

**Category:** Data integrity · **Severity:** High · **Confidence:** High (Confirmed)

**Current behavior:** `app/supabase-sync.js:188` — `enqueueSync()` empieza con `if (!supabaseClient) return;`. `supabaseClient` lo crea `initSupabase()`, que en `init()` (`app.js` ~11507+) es el paso ~20. Antes corren `ensurePlanSeeded`, `ensureExerciseLibrarySeeded`, `ensureDeloadAnchor`, `applyIdealPlan` (escribe `plans` y `settings.planRev`), `runMigrations` (incluida la migración de objetivos de nutrición). Todos usan `smartPut`. **Todos quedan sólo en local.**

**Expected:** encolar siempre — la cola vive en IndexedDB y no necesita el cliente. Sólo *drenar* lo necesita.

**Evidence:** `supabase-sync.js:188-201` (guard), `app.js` orden de `init()`, `tests/verify-sync-writes.mjs` §5 ya documenta que "sin cliente, enqueueSync descarta". Incidentes históricos con esta causa: cola congelada (2026-06-30, tabla `plans` inexistente + `break`), `public.exercises` con 0 filas (meses), `foods` seed (v11.49, detectado antes de desplegar). Supabase hoy: `exercises` 0 filas.

**Why it matters:** cualquier dato escrito durante el arranque —el ancla del deload, la revisión del plan, los objetivos de nutrición— sólo llega a la nube si *otra* escritura posterior del mismo registro ocurre tras la auth. `userSettings` se autocura porque el usuario guarda ajustes; `deloadAnchorWeek` **no**: un segundo dispositivo se ancla a otra semana y los dos discrepan sobre cuándo es deload.

**Scenario:** reinstalar la PWA → `ensureDeloadAnchor()` fija la semana actual → nunca sube → el cron (que lee Supabase) y el teléfono calculan deloads distintos.

**Root cause:** el guard protege el caso "Supabase no configurado", que **no existe**: `SUPABASE_URL`/`SUPABASE_ANON_KEY` son constantes hardcodeadas. El guard mira la variable equivocada (el cliente, tardío) en vez de la configuración (constantes, inmediatas).

**Recommended direction:** `enqueueSync` debe gatear por `SUPABASE_URL && SUPABASE_ANON_KEY`, no por `supabaseClient`. Con eso, `backfillSeedStoresToCloud()` (v11.50) deja de ser necesario para el futuro (puede quedarse como saneamiento único).

**Alternative:** mover `initSupabase()` al principio de `init()`. **Desaconsejado**: registra `onAuthStateChange → syncAll()` y adelantar el arranque de la cola es justo lo que la congeló en v11.28. Riesgo alto por ganancia igual.

**Trade-offs:** ninguno real. Si algún día se quiere modo "sin nube", se añade un flag explícito.

**Effort:** Small · **Regression risk:** Low · **Fix now?:** **Yes**

---

### [F-2] El cron aplica umbrales de TSB a `rampRate`, que es otra magnitud — y por eso nunca disparan

**Category:** Scientific / conceptual · **Severity:** High (para la calidad del cron) · **Confidence:** High (Confirmed empíricamente)

**Current behavior:** `.claude/commands/weekly-review-auto.md` §2.10: *"`rampRate` ≈ TSB (Training Stress Balance, also called Form) = `ctl − atl`"*, y define reglas: `< −20 tres días → deload obligado`, `−10 a −20 → estrés óptimo`, `> +5 → fresco`, `> +20 una semana → destrenado, subir volumen`.

**Expected:** `rampRate` en intervals.icu es la **velocidad de cambio de CTL** (puntos/semana). TSB/Form es `ctl − atl`, una magnitud distinta que el propio proyecto sabe que **no calcula** (`data-sources-audit.md` #3: "TSB = CTL − ATL (no se calcula hoy, trivial de derivar)"; `readiness-rules.md` lista Form y rampRate como filas separadas).

**Evidence (medido en Supabase, 123 días con ctl/atl):** `rampRate` mín **−0,91**, mediana **−0,21**, máx **+1,86**. Días con rampRate < −20: **0**. > +20: **0**. TSB real (ctl−atl): mín −11, mediana 0, máx +1,3. Así que **ninguno de los cuatro umbrales puede dispararse jamás** sobre el campo que el cron lee.

**Why it matters:** §2.10 se autodenomina *"the highest-fidelity recovery and load signal the system has… primary input for periodization decisions"*. Toda la rama de deload por carga del cron es inerte. Peor: un agente LLM que lee "rampRate −0,3 → entre 0 y −10 → estrés moderado, entrenamiento normal" cree estar aplicando una regla y está aplicando ruido.

**Scenario:** semana con 6 días duros → TSB real −11 (sí ocurrió: es el mínimo medido) → el cron mira rampRate −0,5 → "normal training". Ninguna alerta.

**Root cause:** conflación de dos métricas de intervals.icu en la redacción del comando; nunca se contrastó contra el rango real de los datos.

**Recommended direction:** (a) que el cron derive `form = ctl − atl` por día y aplique los umbrales a *eso*; (b) tratar `rampRate` como lo que es (ritmo de subida de fitness; >~5/sem sostenido es subida agresiva); (c) **antes de nada, leer F-3** — los umbrales absolutos de TSB también están mal calibrados para este atleta.

**Alternative:** quitar la sección 2.10 de carga y dejar sólo recovery/sueño hasta tener una carga que incluya la fuerza (F-3).

**Trade-offs:** el cron pierde una "regla" que en la práctica nunca hizo nada; gana honestidad.

**Effort:** Small (texto del comando) · **Regression risk:** Low · **Fix now?:** **Yes**

---

### [F-3] CTL/ATL de intervals.icu sólo ven el cardio; el cron los trata como carga total en un programa de 4 días de fuerza

**Category:** Scientific / conceptual · **Severity:** High · **Confidence:** High (Confirmed)

**Current behavior:** intervals.icu computa CTL/ATL desde las actividades que recibe (carreras/cardio con FC). **Las sesiones de fuerza se registran en la PWA y no llegan a intervals.icu** (`NON_CARDIO_TYPES` las excluye a la entrada a propósito; nada las empuja a la salida). Medido: **CTL medio 2,4, ATL medio 3,9** — cifras de alguien casi inactivo, para alguien que hace 4 sesiones de fuerza + cardio casi diario.

**Expected:** o bien la carga que se usa para periodizar incluye la fuerza, o bien el cron dice explícitamente "esta carga es sólo cardio" y la usa sólo para decisiones de cardio.

**Evidence:** query Supabase (arriba); `CARDIO_TYPE_MAP`/`NON_CARDIO_TYPES` en `app.js:5200-5240`; `weekly-review-auto.md` §2.10 "primary input for periodization decisions"; los umbrales absolutos (−20/+20) suponen un CTL de decenas, típico de endurance.

**Why it matters:** cualquier decisión de "deload por carga", "sube volumen" o "mantener CTL es el objetivo en déficit" tomada desde estos números está midiendo una fracción minoritaria del estímulo. Y el mismo cron dice *"trust wellness over RPE — RPE is laggy"*: con la fuerza fuera de wellness, esa jerarquía **descarta la única medida de la fuerza (RPE/top set) a favor de una que no la ve**.

**Scenario:** semana de 4 fuerza pesadas + 0 cardio → CTL cae → "losing fitness" → el cron sugiere subir volumen aeróbico en la semana más cargada.

**Root cause:** decisión razonable a la entrada (no duplicar gym) sin la contrapartida a la salida (una carga interna propia que sume fuerza), y un texto de cron heredado de un mundo endurance.

**Recommended direction:** dos opciones, elegir una y decirlo:
(a) **Carga interna propia y honesta**: `budgetWeight` semanal (ya existe) + sesiones-RPE (`duración × RPE` para fuerza; ya se estima kcal por sesión) como serie diaria; el cron la usa como "carga total" y CTL/ATL sólo como "carga cardio".
(b) **Degradar CTL/ATL** en el cron a contexto de cardio y quitar la jerarquía "wellness > RPE" para decisiones de fuerza.
Recomiendo (b) ahora y (a) cuando haya 8+ semanas de adherencia real: no vale la pena un modelo de carga con ~1,2 sesiones/semana registradas.

**Alternative:** subir los workouts de fuerza a intervals.icu como actividades manuales (`POST /activities`) para que su CTL las incluya. Funciona, pero acopla más al hub y el TSS que intervals asigna a fuerza sin FC es arbitrario.

**Trade-offs:** (b) resta una "señal" al cron y le devuelve la honestidad; (a) añade una métrica interna que hay que documentar y testear.

**Effort:** (b) Small · (a) Medium · **Regression risk:** Low · **Fix now?:** **Yes (b)**, Later (a)

---

### [F-4] La prescripción de carga del cron no llega a la pantalla del entrenamiento

**Category:** Product logic · **Severity:** High · **Confidence:** High (Confirmed)

**Current behavior:** `latest.json → nextWeekPlan.sessions[].exercises[].target` (ej. `"95 kg × 5-8" @ "7-8"`, medido en el `latest.json` vivo de W36) se renderiza **sólo** en `renderNextWeekPlan()` (Stats › Coach Review, `app.js:4830+`). `grep nextWeekPlan` en `app.js` devuelve un único consumidor adicional: `runningPlan` para el push a intervals (`app.js:5747`). En el entreno, `buildExerciseCard()` (`app.js:3728`) pone como *placeholder* el **peso anterior** y `generateCoachNote()` (`app.js:3666`) calcula **su propia** sugerencia (+2,5 kg si todas las series al tope de reps con RPE controlado) con una regla **distinta** a la del cron (§2.9: RPE ≤7 y reps al tope).

**Expected:** un único objetivo por ejercicio, visible donde se ejecuta la serie, con su origen.

**Evidence:** `grep -n nextWeekPlan app/app.js` → líneas 5747 (runningPlan) y las de render 4830-4900; `renderTodaysPlan()` (`app.js:8894+`) muestra `sets×reps @RPE` del PLAN sin kg; `buildExerciseCard` placeholder `prevWeightDisp`.

**Why it matters:** el sistema **ya calcula** la progresión correcta (con tendencias de 4 semanas, unidades normalizadas, RPE) y la entrega en el sitio donde el usuario no está cuando levanta. En la mesa del rack ve "90" (lo que hizo) y una nota "sube a 92,5" (otra regla). Es la promesa central de "el sistema progresa cargas" incumplida por un problema de fontanería, no de ciencia.

**Scenario:** domingo el cron escribe "Bench 95 × 5-8"; martes el usuario abre Upper A, ve placeholder 90 (semana anterior), hace 90 otra vez, RPE 7 → el cron del domingo siguiente vuelve a decir "sube".

**Root cause:** `latest.json` se diseñó como *tarjeta de coach* (v10.13-10.17) antes de que existiera un plan vivo; nadie conectó `nextWeekPlan.sessions[].exercises[]` con `startWorkout`. Y `generateCoachNote` es anterior al cron.

**Recommended direction:** **una sola fuente de objetivo de carga.** `buildExerciseCard` busca `exerciseId` en `weekly_reviews[latest].nextWeekPlan.sessions[sessionId].exercises[]`; si existe y el `weekKey` es la semana en curso o la anterior, el placeholder/target es el del cron con etiqueta "coach"; si no, cae al comportamiento actual. `generateCoachNote` **deja de calcular progresión** y pasa a mostrar la `note` del cron (o el histórico si no hay).

**Alternative:** eliminar del cron los targets por ejercicio y quedarse con `generateCoachNote` como única regla. Peor: la regla del cron es mejor (usa 4 semanas, normaliza unidades, tiene contexto de wellness) y ya está escrita.

**Trade-offs:** depende de que el cron corra y de que la semana coincida (el `weekKey` lo resuelve). Añade una lectura de `weekly_reviews` en `startWorkout` (trivial).

**Effort:** Medium · **Regression risk:** Medium (toca la pantalla más usada) · **Fix now?:** **Probably** — es el cambio con más ROI de producto

---

### [F-5] Tres readiness paralelos sin jerarquía; uno deriva un consejo de un score compuesto

**Category:** Scientific + Architecture · **Severity:** High · **Confidence:** High (Confirmed)

**Current behavior:** tres cálculos independientes, tres pantallas, tres criterios:

| Dónde | Función | Inputs | Output |
|---|---|---|---|
| Home | `computeTrainingAdvisory()` `app.js:7960` | color WHOOP del **último día** + 2 flags | keep/modify/replace/recovery |
| Stats › Today | `renderFatigueCard()` `app.js:4675` | frecuencia 7d (workouts+runs **sin sessions**), quality media, energía nutrición, días bajo proteína, RPE medio, + WHOOP último día | **score 0-100** → "Push hard today" / "Moderate fatigue" / … |
| Stats › Today | `checkDeloadNeeded()` `app.js:10131` | quality ≤2 ×2, RPE ≥8,5 ×3, WHOOP media 3d <34, (semanas sin deload: muerto) | banner "Deload recommended" |

**Expected:** una función `computeReadiness()` con inputs declarados, tendencias (READ-001), confirmación multi-señal (READ-002), baseline individual (READ-004), que devuelva `{color, señales[], confianza}` y que **los tres consumidores** lean de ahí.

**Evidence:** las tres funciones citadas; `readiness-rules.md` §"Anti-falsa-precisión": *"Nunca traducir un Recovery % a una carga exacta… Nunca actuar sobre una sola métrica de un solo día"*. La fatigue card hace `fatigue*0.70 + (100−score)*0.3` y de ahí un consejo textual — es un dose-from-composite, READ-003 al revés. Además pondera "días bajo proteína ×3" como fatiga (sin base: la proteína baja no es fatiga aguda) y "frecuencia ≥6 → +30" sin distinguir una caminata de una pierna pesada.

**Why it matters:** el usuario puede ver a la vez "Mantener" (Home), "Moderate fatigue — monitor" (Stats) y un banner de deload. No hay forma de saber cuál manda porque ninguno lo sabe. Y cada uno viola una regla distinta del corpus que el propio sistema declara *ready_to_govern_code*.

**Scenario:** WHOOP 62 (amarillo) tras una noche corta; resto de señales normales. Advisory: "Ajustar" para un día de upper. Fatigue card: puntúa 40 → "Moderate fatigue". Deload: nada. Tres lecturas de **una** noche.

**Root cause:** crecimiento por capas (fatigue card v10.x, deload reminder abril, advisory T3 junio) sin consolidar; cada una se validó sola.

**Recommended direction:** un `computeReadiness()` único que implemente lo que `readiness-rules.md` ya describe (es un spec bueno y corto): rolling 7d de HRV/RHR/sueño vs baseline 28d, WHOOP del **día correcto** (F-6), RPE/quality de las 2 últimas sesiones; salida `green|yellow|red` + lista de señales concordantes + confianza. Advisory, deload reactivo y fatigue card consumen eso. La fatigue card deja de puntuar y pasa a **mostrar las señales** (sin "push hard").

**Alternative:** borrar la fatigue card y el deload reminder, dejar sólo el advisory. Más simple; pierde el banner de deload reactivo, que sí tiene valor (LOAD-004).

**Trade-offs:** una función más a testear; a cambio, tres menos que discrepen. Sube la coherencia y baja el código.

**Effort:** Medium · **Regression risk:** Medium · **Fix now?:** **Probably** (junto con F-6)

---

### [F-6] El advisory usa un solo día de WHOOP, sin comprobar que sea hoy, y su "multi-señal" es en la práctica una sola señal

**Category:** Scientific · **Severity:** High · **Confidence:** High (Confirmed)

**Current behavior:** `getWhoopContext()` (`app.js:7880`): `rec = data.recovery[data.recovery.length − 1]` — el último elemento del array de 7 días, **sin comparar `rec.date` con `today()`**. Si el recovery de hoy no ha llegado (WHOOP suele sincronizar por la mañana tarde; el propio doc T3 lo reconoce), se usa **el de ayer como si fuera hoy**, y el mensaje "Todavía no hay dato de recuperación hoy" sólo sale si el array está vacío. En `computeTrainingAdvisory()` las "señales" para `replace` son `{WHOOP red, nFlags≥1}`; los flags posibles son *WHOOP red con sesión dura* (redundante con la primera) y *familia hybrid* — **inalcanzable**, porque `toSession` clasifica `hybrid1` como `strength.maintenance` (F-7). Resultado: un único input.

**Expected:** READ-001 (tendencia 7d), READ-002 (≥2 señales concordantes), READ-004 (baseline propio), y un dato de *hoy* o declarar `unknown`.

**Evidence:** `app.js:7880-7890` (sin filtro por fecha), `7950-7958` (flags), `7990-8000` (matriz); `training-advisory-v1.md` afirma READ-002 ("≥2 concordantes"); `intervalsFetchWellness` sí trae 7 días (`whoop.js:225-228`) que se descartan salvo el último.

**Why it matters:** *"¿Una mala noche modifica demasiado el entrenamiento?"* — sí: un WHOOP amarillo de un día degrada un upper a "modify"; uno rojo manda un lower a "recovery". Y un rojo **de ayer** puede degradar el entreno de hoy aunque hoy hayas dormido bien. Es la definición de falsa precisión que el corpus prohíbe.

**Scenario:** domingo noche 4 h de sueño → lunes recovery 28 (rojo) → martes duermes 8 h, WHOOP aún no sincronizó a las 7:00 → advisory del martes: "Recuperar" con el 28 del lunes.

**Root cause:** T3 v1 se escribió honesto ("WHOOP tal cual, confidence low si falta") pero implementó "tal cual" como "el último que haya"; y la segunda señal se apoyó en un clasificador que no la produce.

**Recommended direction:** dentro de F-5: (1) elegir el registro cuya `date === today()`; si no existe → `unknown`; (2) baseline 7d/28d de HRV y RHR desde el store `wellness` (ya tiene 123 días); (3) señales = {WHOOP rojo hoy, HRV 7d < baseline −X%, RHR 7d > baseline +Y, sueño 7d < 6,5 h, RPE≥9 en las 2 últimas}; actuar con ≥2.

**Alternative:** mínimo viable sin rediseño: filtrar por fecha y exigir *rojo hoy Y rojo ayer* para `recovery`. Cubre el 80% del daño con 5 líneas.

**Trade-offs:** el advisory será menos "reactivo" — que es exactamente lo que piden READ-001/002.

**Effort:** Small (mínimo) / Medium (completo) · **Regression risk:** Low · **Fix now?:** **Yes** (mínimo) → Probably (completo con F-5)

---

### [F-7] `toSession` clasifica por regex sobre el id y se equivoca en 6 de 10 sesiones

**Category:** Bug · **Severity:** Medium · **Confidence:** High (Confirmed por simulación)

**Current behavior:** `app.js:812-816`: `/low|leg|squat|dead|hinge|glute/` → `lower` (peso 2); `/upper|push|pull|bench|press/` → `upper` (1); **todo lo demás → `maintenance` (1)**. Resultado simulado sobre las claves reales de `PLAN.sessions`: `fullA`, `fullB`, `travelA`, `travelB`, `hybrid1`, `free` → `maintenance`, peso 1. `IDEAL_BLOCK_V1` declara `fullA/fullB` **bw: 2**, `travelA/B` **1,5**; `hybrid1` debería ser familia `hybrid` (peso 2, flag HYB-002).

**Expected:** la clasificación debe salir del **dato** (el `subtype`/`kind` que ya existe en `IDEAL_BLOCK_V1.variants[*].days[].subtype` y `planRef`), no de adivinar por el nombre.

**Evidence:** simulación de la regex (§ investigación); `IDEAL_BLOCK_V1` líneas 8117-8210; Supabase tiene 1 workout `hybrid1` registrado. `classifySessionStress` → `level` desde `budgetWeight` → `moderate` para full-body (debería `hard`).

**Why it matters:** un día de full-body (variantes 3/4, las de semanas comprimidas) nunca activa la rama `hard` del advisory (nunca "recovery" con rojo); `hybrid1` nunca produce el flag HYB-002; el budget informativo infra-cuenta. Y `free` (sesión libre) siempre pesa 1 aunque sean 4 compuestos.

**Scenario:** semana de viaje, variante 3, `fullA` lunes con WHOOP 25 (rojo) → advisory: `moderate` + rojo → cae al `else` → **"Recuperación y carga ok — mantené"**. Exactamente al revés.

**Root cause:** `toSession` se escribió (T1, v11.10) antes de que existieran full/travel/hybrid; la regex no se revisó al añadirlas.

**Recommended direction:** `toSession` para `workouts` debe resolver `session` → `subtype` por lookup: primero `IDEAL_BLOCK_V1` (todas las variantes, `planRef → {kind, subtype, bw}`), luego un mapa explícito para `free`/legacy; la regex sólo como último fallback y con `console.warn`. Un test que recorra todas las claves de `PLAN.sessions` y exija clasificación no-fallback.

**Alternative:** añadir `family/subtype` al registro al guardar en `finishWorkout` (snapshot). Mejor a largo plazo (el registro es autodescriptivo), pero no arregla los 31 ya guardados; hacer ambos.

**Trade-offs:** ninguno; sólo corrección.

**Effort:** Small · **Regression risk:** Low · **Fix now?:** **Yes**

---

### [F-8] `checkDeloadNeeded` "N semanas sin deload" usa aritmética del programa de abril y no puede disparar

**Category:** Bug (guardarraíl muerto) · **Severity:** Low · **Confidence:** High (Confirmed)

**Current behavior:** `app.js:10165-10171`: `lastDeloadWeek = Math.floor((wk − 1) / 4) * 4 + (isDeloadWeek(wk) ? wk : 0)`; como la función ya hizo `return null` si `isDeloadWeek(wk)`, el término es 0 y `weeksSinceLast = wk − floor((wk−1)/4)*4 ∈ [1, 4]`. La condición `>= 5` es **inalcanzable**. Además asume ciclo de 4 cuando `isDeloadWeek` es ahora de 5 anclado (`DELOAD_BLOCK_WEEKS = 5`, `app.js:1477`).

**Expected:** `weeksSinceLast = wk − últimoDeloadAnclado`, usando `nextDeloadWeek()`/`deloadAnchorWeek()` que ya existen.

**Evidence:** código citado; v11.35 cambió `isDeloadWeek` y no tocó esta rama.

**Why it matters:** bajo. Es un guardarraíl que aparenta existir. El daño es de confianza: quien lea el código cree que hay red.

**Recommended direction:** dentro de F-5 (deload reactivo consume `computeReadiness` + `nextDeloadWeek()`); o borrar la rama.

**Effort:** Small · **Regression risk:** Low · **Fix now?:** Later (con F-5)

---

### [F-9] El comando del cron está desfasado del plan vivo en tres puntos que cambian decisiones

**Category:** Maintainability + Product logic · **Severity:** Medium · **Confidence:** High (Confirmed)

**Current behavior** (`.claude/commands/weekly-review-auto.md`):
1. §2.8: *"Mon/Thu = upper days = OK for runs; Tue/Fri = lower days = avoid"*. El IDEAL vivo (variante 6) es **Lun lowerA, Mar upperA, Jue lowerB, Vie upperB** — **invertido**. `pendientes.md` §7 ya registró esta inversión al corregir `nutrition-notes.md`; el cron no se tocó.
2. §3.2: *"deload week (week 5 or 9 per the program structure)"* — el programa de abril. La app usa `deloadAnchorWeek` con ciclo de 5 (v11.35). **Dos calendarios de deload.**
3. §2.8: techo Z2 `avgHR < 140`; la tabla de zonas del **mismo fichero** (§4.4) dice Z2 = 131-**143**; `latest.json` W36 usa 143 (7 menciones), `running-plan.md` 140. Tres valores para una constante que además ya vive en `settings.icuZones`.

**Why it matters:** un LLM ejecuta este texto cada domingo con autoridad de "auto mode, no questions". La regla INT-001 aplicada con los días invertidos coloca carreras duras el día *antes* de pierna (Mié → Jue lowerB) creyendo que evita pierna.

**Recommended direction:** el cron debe **leer** el plan vivo (`plans` en Supabase: `weekTemplate` y `sessions`) y las zonas (`settings.icuZones`) en vez de tener días y umbrales hardcodeados; y su deload debe salir de `settings.deloadAnchorWeek`. Un test de coherencia (`verify-cron-spec.mjs`) que lea el `.md` y compruebe que no contiene "week 5 or 9", "< 140" ni la frase de días invertidos.

**Effort:** Small (texto) + Small (test) · **Regression risk:** Low · **Fix now?:** **Yes**

---

### [F-10] 23 lecturas crudas de `runs` frente a 6 dedupeadas: doble conteo latente

**Category:** Data integrity · **Severity:** Medium (latente) · **Confidence:** Medium (Likely, gated)

**Current behavior:** `dedupeRuns()`/`getRunsDeduped()` existen (`app.js:5543-5575`) y se usan en `computeHardDayBudget` y 5 sitios más. `dbGetAll('runs')` crudo aparece en **23** sitios: anillos/racha (`app.js:2725`), `renderWeekStrip`, `renderRunTotals`, fatigue card, gráficos… Hoy **no hay filas de Strava** en Supabase (12 intervals + 3 manuales), así que no hay duplicados reales.

**Expected:** una única función de lectura para agregación (`getRunsDeduped`) y `dbGetAll('runs')` sólo en export/backup.

**Why it matters:** el día que Strava se reconecte (el código y la edge function están listos), km semanales, racha y anillos se duplican en silencio — el patrón "descarte/duplicado silencioso" que el propio repo identifica como su fallo recurrente.

**Recommended direction:** renombrar `dbGetAll('runs')` en los agregadores a `getRunsDeduped()`; un test que cuente lecturas crudas fuera de backup/export (como hace `verify-sync-writes` con `dbPut`). Mismo para `sessions`.

**Effort:** Small · **Regression risk:** Low · **Fix now?:** Probably

---

### [F-11] `recomputeNutritionDay()` se ejecuta en cada render y escribe (y sincroniza) sin cambios

**Category:** Architecture + Performance (churn) · **Severity:** Medium · **Confidence:** High (Confirmed — código propio de esta sesión)

**Current behavior:** `renderNutricionV2()` → `recomputeNutritionDay(today())` → `smartPut('nutrition', row)` **siempre**, con `updatedAt: Date.now()`. Cada apertura de la pestaña encola un upsert idéntico salvo el timestamp. La cola colapsa upserts del mismo registro, así que no explota, pero es una lectura que escribe.

**Expected:** recomputar sólo tras una escritura en `meals` (ya se hace en `saveMeal`/`deleteMeal`) o cuando cambie un input (día nuevo, sesión registrada); el render lee.

**Why it matters:** ruido en la cola y en `updated_at` de Supabase (el cron no puede distinguir "cambió" de "se abrió la pestaña"); y sienta el patrón contrario al que la propia cola de sync intenta proteger. El mismo olor existe en `whoopSyncData()` (lectura que escribe 3 stores).

**Recommended direction:** `renderNutricionV2` lee la fila; recompute sólo si `row.date !== today()` no existe o si `meals` cambió (comparar `mealCount`/hash de ids) o si es la primera vez del día (EEE puede cambiar por una sesión nueva: recomputar también al `finishWorkout`/`logCardio`).

**Effort:** Small · **Regression risk:** Low · **Fix now?:** Probably

---

### [F-12] La disponibilidad energética se muestra intradía como estado, y a las 9:00 siempre es "crítica"

**Category:** Product logic / Scientific · **Severity:** Medium · **Confidence:** High (Confirmed — código propio)

**Current behavior:** `renderNutToday()` calcula `ea = (kcal consumidas hasta ahora − EEE)/FFM` y pinta `eaStatus()` en rojo cuando `< 27`. A media mañana con 400 kcal ingeridas, EA ≈ 5 → "🔴 crítico · faltan 1.800 kcal".

**Expected:** EA es una magnitud **diaria** (REC-008, Thomas 2016). Intradía sólo tiene sentido como proyección o como cierre del día anterior.

**Recommended direction:** en la tarjeta de Hoy mostrar EA **de ayer** (día cerrado) y "kcal netas restantes para EA ≥30"; el semáforo diario en Tendencias sobre días cerrados. Mantener el cálculo, cambiar cuándo se juzga.

**Effort:** Small · **Regression risk:** Low · **Fix now?:** Probably

---

### [F-13] Todo el calendario de deloads depende de `settings.startDate`, editable en Ajustes

**Category:** Product logic / Risk · **Severity:** Low-Medium · **Confidence:** Medium (Risk)

**Current behavior:** `getWeekNumber()` = semanas desde `settings.startDate`; `isDeloadWeek(wk)` = `((wk − anchor) % 5) === 4`. `startDate` se edita en Ajustes (`setting-start-date`, `saveSettings`). Cambiarlo un día que cruce lunes desplaza `wk` en 1 → el deload se mueve una semana sin aviso. También `workouts.week` almacenado usa esta numeración; el cron usa ISO. Dos numeraciones de semana.

**Recommended direction:** anclar el deload a una **fecha** (`deloadAnchorDate`, lunes ISO) y derivar todo de fechas; dejar `getWeekNumber` sólo para etiquetas. Documentar que `startDate` no debe editarse, o hacerlo de solo lectura.

**Effort:** Small · **Regression risk:** Medium (toca `isDeloadWeek`, 5 llamadores) · **Fix now?:** Later

---

### [F-14] `intervalsFetchWellness` usa fecha UTC para la ventana; el resto de la app usa local

**Category:** Bug (menor) · **Severity:** Low · **Confidence:** High (Confirmed)

`whoop.js:226-227`: `new Date().toISOString().split('T')[0]`. La app ya sufrió `tz_date_migration_v2` por esto y `dateStr()` es local a propósito. Impacto: entre 00:00 y 02:00 hora Madrid la ventana pide "hoy" UTC (= ayer local); el recovery de hoy llega más tarde de todos modos. Arreglo trivial con `dateStr(new Date())`.

**Effort:** Small · **Fix now?:** Later (junto a F-6)

---

### [F-15] Dead code: el ramp de re-entrada sigue en el fichero sin llamadores

**Category:** Simplification · **Severity:** Low · **Confidence:** High (Confirmed)

`app.js:1067-1175` (`RE-ENTRY RAMP`, `applyReentryPlan`, `REENTRY_*`, `buildReentrySessions`) — `ideal-plan-engine-v1.md` T5 dice *"quedan en el código sin invocarse (rollback)"*. Han pasado 10 semanas y 20 versiones. ~110 líneas + `generateCoachNote` tiene una rama `ex.notes.startsWith('Reentrada ')`.

**Recommended direction:** borrar. Está en git si hiciera falta.

**Effort:** Small · **Fix now?:** Later

---

### [F-16] Conflictos de sync: last-write-wins por timestamp del dispositivo, sin detección

**Category:** Data integrity (riesgo aceptado) · **Severity:** Low · **Confidence:** High

`drainSyncQueue` sube `updated_at = item.timestamp`; `syncAll` pull aplica si `remoteTime > local._updated_at`. Dos dispositivos editando el mismo registro offline → el reloj más adelantado gana, sin aviso. Para un usuario con un iPhone es aceptable; **documentarlo** en `db-schema-state.md` como decisión, no como omisión.

**Fix now?:** No (documentar)

---

### [F-17] Seguridad: secretos de terceros en `settings` sincronizado y en localStorage

**Category:** Security · **Severity:** Low (personal) · **Confidence:** High

`intervalsIcuApiKey` viaja en `settings.userSettings` a Supabase (jsonb, RLS por uid) y el cron lo lee de ahí. Tokens de Strava en localStorage. Anon key hardcodeada (esperado). Edge functions correctas: `verify_jwt`, comprobación de uid en `photoPath`, bucket privado. Para un solo usuario es aceptable; **no** escalar a multiusuario sin mover la API key a un secreto de Supabase por usuario (vault) y sacar tokens de localStorage.

**Fix now?:** No (anotar como límite de diseño)

---

## 4 · CROSS-ENGINE FAILURE MODES

| # | Engines | Trigger | Resultado actual | Por qué es problema | Prio | Recomendación |
|---|---|---|---|---|---|---|
| X-1 | **Cron (progresión) × buildExerciseCard × generateCoachNote** | Domingo el cron prescribe "95 × 5-8"; martes el usuario abre la sesión | Ve placeholder 90 (anterior), nota "sube a 92,5", y el 95 en otra pestaña | Tres números para una decisión; la mejor regla es la que no se ve | **P1** | F-4: un solo objetivo, el del cron, en la tarjeta |
| X-2 | **Advisory × Fatigue card × Deload reminder** | WHOOP 62 (amarillo) un día, resto normal | Home "Ajustar"; Stats "Moderate fatigue"; sin deload | Tres lecturas de una noche, sin jerarquía; viola READ-001/002/003 | **P1** | F-5+F-6: `computeReadiness()` único |
| X-3 | **toSession × Advisory × Budget × Interferencia** | Día `fullA`/`hybrid1`/`free` | `maintenance` peso 1 → nunca `hard` → nunca "recovery" ni flag HYB-002 | El guardarraíl de día rojo no protege las sesiones más cargadas de las variantes de viaje/mínima | **P1** | F-7: clasificar desde el dato |
| X-4 | **Cron (CTL/ATL) × ingesta (fuerza excluida)** | Semana 4× fuerza pesada, 0 cardio | CTL baja → "losing fitness" → sugiere subir volumen | La carga mide el 20% del estímulo y decide sobre el 100% | **P0/P1** | F-3: degradar CTL/ATL a contexto de cardio |
| X-5 | **Cron (rampRate) × umbrales de TSB** | Cualquier semana | Ningún umbral dispara (rango real ±2) | Rama de deload por carga inerte; el LLM cree aplicar una regla | **P0** | F-2 |
| X-6 | **Cron (días fijos) × IDEAL (días reales)** | Cron programa carrera "lejos de pierna" | Coloca Mié/Sáb creyendo que Mar/Vie son pierna; Jue es `lowerB` | INT-001 aplicada al revés | **P1** | F-9: leer `weekTemplate` |
| X-7 | **isDeloadWeek (app, 5 sem ancladas) × cron ("week 5 or 9")** | Semana de deload según la app | El cron prescribe cargas normales; la app corta series al 50% | Dos calendarios; el usuario ve targets de build en semana de deload | **P1** | F-9: cron lee `deloadAnchorWeek` |
| X-8 | **whoopSyncData (cache 10') × 7 llamadores × smartPut** | Render de Home | Una "lectura" escribe `bodyweight`/`steps`/`wellness` y encola sync | Acoplamiento oculto; el mismo patrón que F-11 | P2 | Separar `fetchWellness()` (escribe, 1 vez/10') de `getRecoveryToday()` (lee) |
| X-9 | **enqueueSync guard × init() order** | Cualquier smartPut antes de initSupabase | Local-only silencioso | Causa raíz de 3 incidentes | **P0** | F-1 |
| X-10 | **dedupeRuns (6 sitios) × dbGetAll('runs') (23 sitios)** | Strava reconectado | km, racha y anillos duplican; budget no | Inconsistencia entre pantallas | P1 | F-10 |
| X-11 | **Nutrición EA intradía × semáforo** | 9:00 | "Crítico, faltan 1.800 kcal" | Alarma falsa diaria erosiona la señal real | P1 | F-12 |
| X-12 | **Budget (peso Z2 finisher 0,5) × fatigue card (no lee `sessions`)** | Z2 finisher registrado | Cuenta en budget, no en frecuencia de fatigue | Dos "cargas semanales" con universos distintos | P2 | F-5 unifica inputs |

---

## 5 · SCIENTIFIC / LOGIC MATRIX

| Decision / Rule | Where | Evidence basis | Implementation fidelity | Confidence | Concern |
|---|---|---|---|---|---|
| Proteína 185 g (2,1 g/kg) — REC-001 | `NUT_PROTEIN_FLOOR`, settings | Strong | Good | High | — |
| 2.700/2.400 kcal por tipo de día — REC-007 | `nutDayTargets` | Moderate | Good | High | Tipo de día por plan o sesión registrada; correcto |
| EA ≥30 kcal/kg FFM — REC-008 | `energyAvailability` | Moderate (extrapolado de RED-S femenino; el propio corpus lo dice) | **Overly precise intradía** (F-12); correcto como diario | Medium | El umbral es de *dirección*, no de número; pintarlo rojo a las 9:00 es falsa precisión |
| BMR Katch-McArdle sobre FFM medida | `bmrKatchMcArdle` | Strong (fórmula validada) | Good (=1.942, coincide con perfil) | High | — |
| NEAT 10% BMR + 0,00046 kcal/paso/kg; TEF 10% | `maintenanceKcal` | **Reasonable heuristic** | Good (cada término explícito; total dentro del rango declarado 2.720-3.110) | Medium | Es un prior; la calibración con báscula es lo que lo corrige — bien diseñado, pero **sin 10 días de registro no emite nada** |
| Calibración a 14 d, medias 3 d, sin veredicto <150 kcal/d | `wearableCalibration` | Reasonable heuristic | Good | Medium | Suelo de ruido razonable; documentado |
| Score de alimento (PD/20, NOVA, fibra) | `foodScore` | **Product decision** (fórmula publicada, reproducible) | Good | High | Honesto: NOVA 4 penaliza whey; asumido |
| Guardarraíl adherencia 10/14 | `adherenceMode` | Product decision (umbral heredado 5/7) | Good | High | — |
| Whoop recovery → verde/amarillo/rojo — READ-003 | `getRecoveryColor` 67/34 | Expert | Good (mapea, no dosifica) | High | Los cortes son los de WHOOP; ok |
| Tendencia 7d HRV/RHR — READ-001 | `getWhoopContext` | Strong | **Incorrect** (último día) | High | F-6 |
| Multi-señal ≥2 — READ-002 | `computeTrainingAdvisory` | Strong | **Incorrect** (una señal efectiva) | High | F-6/F-7 |
| Baseline individual — READ-004 | — | Strong | **Not implemented** | High | Datos disponibles (123 d) |
| Fatigue score 0-100 → consejo | `renderFatigueCard` | **Arbitrary** (pesos inventados: proteína ×3, frecuencia ≥6 = +30) | **Potentially incorrect** (dose-from-composite) | High | Viola READ-003; F-5 |
| Deload cada 5 sem anclado — LOAD-004 | `isDeloadWeek` | Moderate | Good | High | F-13 (depende de startDate) |
| Deload reactivo (quality ≤2 ×2; RPE ≥8,5 ×3) | `checkDeloadNeeded` | Moderate (LOAD-004 dice "2 sesiones con declive de rendimiento") | Mostly correct; rama "semanas sin deload" **Incorrect** (muerta) | High | F-8 |
| Progresión +2,5 kg si todas al tope y RPE controlado | `generateCoachNote` | Reasonable heuristic (doble progresión) | Mostly correct | Medium | Compite con la del cron (F-4) |
| Progresión cron: RPE ≤7 y reps al tope → +2,5; ≥9 ×2 → deload | `weekly-review-auto.md` §2.9 | Reasonable heuristic | Good — **pero no llega al entreno** | High | F-4 |
| Hard-day budget pesos (0,5/1/2/3) y cap 6 — BUD-002 | `SESSION_TYPES`, `computeHardDayBudget` | Expert (el propio corpus: "heurísticos, no medidos") | Mostly correct; **informativo por decisión de usuario** | High | Correcto como se usa. `full` infraponderado (F-7) |
| INT-001 no run duro <24 h pre-pierna | Cron §2.8; IDEAL cautions | Moderate | **Incorrect en el cron** (días invertidos, F-9); Good en IDEAL (calidad el sábado) | High | — |
| INT-002 modalidad de bajo impacto con pierna cargada | `ALT_LIBRARY` | Strong | Mostly correct (sólo como alternativas; no hay Modality Engine) | Medium | Honesto: sugiere, no decide |
| STR-002 2×/patrón | `IDEAL_BLOCK_V1` v6 | Strong | Mostly correct (OHP 1×/sem aceptado a propósito, documentado) | High | — |
| STR-003 10-14 series en déficit | IDEAL (83 series/sem) | Strong | Mostly correct; espalda 14 (tope) | High | Documentado como coste asumido |
| STR-004 RPE 7-8 compuestos, no fallo | PLAN.sessions | Moderate | Good | High | — |
| STR-006 descansos 2-3' compuestos | `defaultRest` 150-210 s | Strong | Good | High | — |
| ATH-001 pliometría 40-80 contactos | `lowerA` 55 contactos | Moderate (el corpus advierte que "low-dose óptimo" no está soportado) | Good para el fin declarado (mantenimiento en déficit) | Medium | Test `verify-warmup-plyo` lo protege |
| ATH-003 anti-rotación/anti-extensión cada semana | taxonomía `core-*` | Strong | Good (tras v11.37) | High | Test existe |
| END-001 80/20 semanal | IDEAL (100% fácil) | Strong (población endurance) | **Oversimplified**: todo fácil; `pendientes.md` 3a sigue abierta | Medium | Defendible en déficit; lo indefendible es declarar "calidad" y compilar Z2 |
| END-003 +10%/sem | IDEAL `durationMin` constantes | Moderate (el corpus lo marca heurístico no validado) | **Not implemented** (sin progresión de duración) | High | Ya en auditoría de agosto; sigue igual |
| END-005 decoupling <5% | — | Expert (practitioner) | **Unable to determine** (dato no llega) | — | Bloqueada por datos; correcto no implementarla |
| CTL/ATL como "señal primaria de periodización" | Cron §2.10 | Moderate (para endurance) | **Incorrect** (sólo cardio; umbrales sobre campo equivocado) | High | F-2, F-3 |
| Z2 ceiling 140 / 143 / `icuZones` | Cron, running-plan, settings | Product decision | **Inconsistent** (3 valores) | High | F-9 |
| Jerarquía "wellness > RPE, RPE es laggy" | Cron ethos | Expert | **Potentially incorrect** para fuerza (wellness no ve la fuerza) | Medium | F-3 |

---

## 6 · SIMPLIFICATION OPPORTUNITIES (por valor)

| # | Qué | Complejidad que quita | Líneas/conceptos | Riesgo | Beneficio | ¿Cambia comportamiento? |
|---|---|---|---|---|---|---|
| S-1 | **Un `computeReadiness()`** consumido por advisory, deload reactivo y fatigue card (F-5/6/8) | 3 cálculos → 1; 3 criterios → 1 | −~120 líneas netas; −2 conceptos ("fatigue score", "checkDeload semanas") | Medium | Coherencia + cumple READ-001/002/004 | Sí (menos reactivo a un día; deseado) |
| S-2 | **Un solo objetivo de carga** (F-4): `generateCoachNote` deja de calcular progresión | 2 reglas → 1 | −~50 líneas | Medium | El usuario ve el número correcto donde levanta | Sí |
| S-3 | **`enqueueSync` gatea por config, no por cliente** (F-1) → `backfillSeedStoresToCloud` queda como saneamiento único, borrable en 2 versiones | 1 estado implícito menos ("¿ya hay cliente?") | −~40 líneas a medio plazo | Low | Cierra una clase de bug | No (corrige) |
| S-4 | **Cron lee el plan vivo** (F-9): fuera días/umbrales/deload hardcodeados del `.md` | 3 fuentes de verdad → 1 | −~30 líneas de texto; −1 concepto ("semana 5 o 9") | Low | El cron deja de contradecir la app | Sí (correcto) |
| S-5 | **Borrar RE-ENTRY RAMP** (F-15) y la rama `'Reentrada '` de `generateCoachNote` | dead code | −~115 líneas | Low | Menos ruido | No |
| S-6 | **Una constante de techo Z2** leída de `settings.icuZones` (cron y app) | 3 números → 1 | — | Low | Coherencia | Sí (140→143 donde diga 140) |
| S-7 | **`toSession` desde el dato** (F-7): la regex pasa a fallback con warn | adivinación → lookup | ±0 líneas | Low | Corrección | Sí |
| S-8 | **`recomputeNutritionDay` sólo en escritura** (F-11) | lectura-que-escribe → lectura | −5 líneas | Low | Menos churn en cola/Supabase | No visible |
| S-9 | **Separar `fetchWellness()` (escribe) de `getRecoveryToday()` (lee)** (X-8) | acoplamiento oculto | ±0 | Medium | Renders no escriben | No visible |

**No simplificar:** el fichero único (split = riesgo alto, beneficio bajo hoy); la tabla jsonb genérica; los stores legacy `runs`/`mobility_sessions` (el adaptador los cubre).

---

## 7 · EDGE CASE MATRIX

| Scenario | Current behavior | Correct? | Risk | Recommendation |
|---|---|---|---|---|
| No completa un workout (sale sin Finish) | `activeWorkout` en settings local; banner "in progress"; restaura al volver | ✅ | Low | — |
| Hace la mitad (Finish con sets sin marcar) | Guarda con `done:false`; volumen sólo `done`; cron detecta "exercises consistently cut" | ✅ | Low | — |
| Cambia ejercicios (swap) | `exerciseOverrides` persistente y sincronizado; `finishWorkout` guarda flags por `deriveExerciseFlags` | ✅ | Low | — |
| Hace más de lo prescrito | Sesión libre (`free`) permite añadir series/ejercicios | ✅ registro; ❌ clasificación (peso 1 siempre, F-7) | Medium | F-7 |
| Registra dos veces el mismo entreno | Dos `workouts` con `uid()` distintos; sin dedup | ❌ | Medium | Aviso si ya hay workout con misma `session` y `date` (no bloquear) |
| Elimina un workout | Soft delete a `trash` 2 días + `smartDelete` → Supabase delete | ✅ | Low | — |
| Sync tarda 24 h | Cola en IDB; `renderSyncWarning` avisa a las 24 h; cuarentena tras 5 intentos | ✅ | Low | — |
| Escritura antes de auth (arranque) | **Descartada en silencio** | ❌ | High | F-1 |
| HR mal / GPS mal en una carrera | `avgHR` se importa tal cual; `avgPace` = moving/dist; sin validación de rango | ⚠️ | Low-Med | Descartar `avgHR` fuera de 40-220 y pace <2:00 o >15:00 min/km (marcar, no borrar) |
| Cambio de timezone / viaje | `dateStr` local ✅; `intervalsFetchWellness` UTC ⚠️ (F-14); `getWeekDates` local ✅ | Mayormente | Low | F-14 |
| Descansa una semana | Adherencia baja en cron; `adherenceMode` → piloto peso; deload calendario sigue | ✅ | Low | — |
| Entrena 7 días seguidos | Budget lo muestra (informativo); fatigue card +30 por frecuencia sin mirar intensidad | ⚠️ | Medium | F-5 |
| Dos sesiones en un día | Ambas cuentan; `nutIsTrainingDay` ✅; EEE suma ambas ✅ | ✅ | Low | — |
| Sesión externa no planificada (COROS) | Llega por intervals; dedup por (fecha, modalidad, ±2 min) si también viene por Strava | ✅ (Strava inactivo) | Medium latente | F-10 |
| Cambia disponibilidad semanal | Selector 🧳/3/4/5/6 regenera hacia adelante, limpia overrides futuros | ✅ | Low | — |
| Cambia objetivos | Editar `goals.md`/settings; no hay motor que lo consuma salvo el cron | ✅ honesto | Low | — |
| Peso cambia mucho | FFM recalculada desde `bodyweight.bfPct` si existe; si no, 72,8 fijo | ⚠️ | Medium | Aviso cuando FFM usado tenga >90 días |
| Pierde fitness | CTL cae (sólo cardio) → cron malinterpreta (F-3) | ❌ | High | F-3 |
| Mejora mucho rápido | Cron sube +2,5 kg/semana máx; ok. App no aplica (F-4) | ⚠️ | Medium | F-4 |
| Readiness desaparece varios días | Advisory usa el último (**de días atrás**) como hoy | ❌ | Medium | F-6 |
| Vuelve tras lesión | Sin flag de lesión; `ALT_LIBRARY` ofrece alternativas de bajo impacto; LOAD-003 no implementada | ⚠️ | Medium | Fuera de alcance; nota en profile |
| Debe evitar un movimiento | Swap persistente por sesión ✅; no hay "lista negra" global | ⚠️ | Low | Aceptable |
| Equipo no disponible | Swap desde `EXERCISE_ALTERNATIVES` ✅ (`EQUIP_SUBS` retirado honestamente) | ✅ | Low | — |
| Modalidad cardio no disponible | Catálogo permite otra; advisory sugiere alternativas | ✅ | Low | — |
| Cold start (usuario nuevo, sin datos) | Seeds locales; advisory "confidence low"; nutrición piloto peso; deload sin ancla = false | ✅ conservador | Low | — |
| Primera semana sin WHOOP | `unknown` → keep, confidence low ✅; fatigue card sigue puntuando sin WHOOP ⚠️ | Mayormente | Low | F-5 |
| Sin 1RM | `estimate1RM` Epley por sesión; sin dependencia | ✅ | Low | — |
| Versión vieja cacheada en el teléfono | SW network-first + `skipWaiting`; `PLAN_REV` regenera plan; `DB_VERSION` aditivo | ✅ | Low | — |
| Actualiza con operaciones pendientes | Cola en IDB sobrevive; `_updated_at` en items | ✅ | Low | — |
| Downgrade de versión | `VersionError` si `DB_VERSION` baja (documentado, nunca bajar) | ✅ documentado | — | — |

---

## 8 · TEST PLAN

Estilo a mantener: Node puro, `vm` sobre `app/*.js`, cada test documenta **el fallo que existe para impedir**. Cero framework.

### Must-have antes de tocar la capa de decisión (regresión)

1. **`verify-session-classification.mjs`** — cada clave de `PLAN.sessions` y cada `planRef` de `IDEAL_BLOCK_V1` clasifica sin caer al fallback `maintenance`; `fullA/fullB` → peso 2; `hybrid1` → familia `hybrid`; `travelA/B` → 1,5. Hoy **fallaría** (F-7): documenta el estado antes de arreglar.
2. **`verify-advisory-matrix.mjs`** — extraer `computeTrainingAdvisory` con `whoop`/`stress` inyectados: `hard+red` → `recovery`; `hard+red+hybrid` → `replace`; `moderate+yellow` → `modify`; `easy` → `keep` siempre; `unknown` → `keep` + `confidence:low`; **y** que un registro WHOOP con `date ≠ today` produzca `unknown` (falla hoy, F-6).
3. **`verify-sync-enqueue.mjs`** — `enqueueSync` encola aunque `supabaseClient` sea null cuando hay `SUPABASE_URL`; `drainSyncQueue` no envía sin cliente. (F-1)
4. **`verify-deload-calendar.mjs`** — `isDeloadWeek` con ancla: semanas anchor+4, +9, +14 son deload y ninguna otra; `checkDeloadNeeded` "semanas sin deload" dispara a las 5 (falla hoy, F-8).

### Highest-value new tests (≤20, ordenados por probabilidad × impacto ÷ coste)

5. **`verify-cron-spec.mjs`** — lee `weekly-review-auto.md`: no contiene "week 5 or 9", no "< 140", no "Mon/Thu = upper"; contiene "form = ctl - atl"; los días de pierna citados coinciden con `IDEAL_BLOCK_V1.variants[6]`. (F-2, F-9)
6. **`verify-run-dedup-readers.mjs`** — cuenta `dbGetAll('runs')` fuera de export/backup/dedupe; línea base 0 tras F-10 (misma técnica que `verify-sync-writes`).
7. **`verify-dedupe.mjs`** — `dedupeRuns`/`dedupeSessions`: misma actividad por Strava e intervals → 1, prefiere intervals, conserva `feel` manual; ±0,3 km/±3 min de tolerancia; dos carreras reales el mismo día con distinta distancia → 2.
8. **`verify-set-target.mjs`** — `suggestSetTarget()` pura con 8 fixtures: sube +2,5 al tope con RPE ok; mantiene con RPE >8,5; baja si no llega al mínimo; usa el cron si `weekKey` es la semana en curso; ignora un cron de hace 3 semanas; ×0,9 en deload; repite tras >21 días de pausa; placeholder anterior sin nada. (F-0/F-4, **escribir antes de implementar** — es la spec ejecutable de Change 7)
9. **`verify-readiness-trend.mjs`** — `computeReadiness()`: 7 d de HRV 10% bajo baseline + RHR +5 → 2 señales → `red`; sólo WHOOP rojo hoy → `yellow` (1 señal); WHOOP rojo ayer y verde hoy → `green`. (F-5/F-6)
10. **`verify-plan-variants.mjs`** — para cada variante: `buildWeekTemplateFromIdeal` cubre los 7 días; cada `planRef` existe en `PLAN.sessions`; suma de `bw` declarada; patrones 2×/sem en variante 6 salvo OHP (documentado). Extiende `verify-warmup-plyo`.
11. **`verify-date-utils.mjs`** — `dateStr`/`today` local; `getWeekDates` Lun-Dom; `getWeekNumber` con `startDate` en lunes/domingo; `nutShiftDate` ya cubierto.
12. **`verify-finish-workout-snapshot.mjs`** — `finishWorkout` guarda `unit`, `planVersion`, `sessionName`, flags `db/bw/compound` (incluido ejercicio swapeado); `date` = fecha de inicio local.
13. **`verify-week-schedule-overrides.mjs`** — `getPlannedSession` con override null/string; `clearFutureScheduleOverrides` preserva pasado.
14. **`verify-wellness-ingest.mjs`** — `intervalsFetchWellness` con filas sintéticas: `tempWeight` → `bodyweight.measured:true`; sólo `weight` → no escribe si igual al anterior; `steps` → store; ventana usa fecha local (F-14).
15. **`verify-budget-sum.mjs`** — `computeHardDayBudget` suma dedupeada; Z2 finisher 0,5; fullA 2 (tras F-7).
16. **`verify-nutrition-recompute-idempotent.mjs`** — `renderNutricionV2` sin cambios en `meals` **no** encola (F-11); tras `saveMeal` sí.
17. **`verify-ea-daily.mjs`** — tarjeta Hoy muestra EA de ayer/proyección; nunca "crítico" con <3 comidas del día (F-12).
18. **`verify-idb-upgrade.mjs`** — simular `onupgradeneeded` de v10 → v11: crea `foods`/`meals`, no toca los demás (usa `fake-indexeddb` **sólo si** se acepta la dependencia dev; si no, test de texto sobre `openDB`).
19. **`verify-cron-output-shape.mjs`** — `latest.json` tiene `weekKey`, `nextWeekPlan.sessions[].exercises[].{id,target,rpe}`, ids existen en `PLAN.sessions`; unidades en kg.
20. **`verify-alt-library.mjs`** — cada entrada con `modality` es registrable (`family/subtype` existen en `SESSION_TYPES`); `planRef: 'hybrid1'` existe.

### Cross-engine tests
- (2) + (1): advisory sobre `fullA` con rojo → `recovery` (hoy `keep`).
- (9) + (4): readiness `red` sostenido 3 d → `checkDeloadNeeded` propone deload.
- (8) + (19): un `latest.json` real de W36 alimenta la tarjeta de Upper A.

### Data pipeline tests
- (3), (6), (7), (14), más: `drainSyncQueue` colapsa upserts superseded y cuarentena tras 5 intentos (extraer y ejecutar con un cliente falso).

### Edge-case tests
- Cold start: `applyIdealPlan` con `plans` vacío; `adherenceMode([])` → `peso`; advisory sin WHOOP → `unknown`.
- Pausa: 14 días sin `nutrition` → `wearableCalibration.reason === 'pocos-datos'`.

---

## 9 · PRIORITY ROADMAP

### P0 — Fix before trusting the system
- **F-1** `enqueueSync` gatea por configuración (1 línea + test 3).
- **F-2** El cron deja de aplicar umbrales de TSB a `rampRate`; deriva `form` o quita la rama.
- **F-3 (b)** El cron degrada CTL/ATL a "carga de cardio" y retira "wellness > RPE" para decisiones de fuerza.

### P1 — High-value fixes
- **F-7** `toSession` desde el dato (+ test 1).
- **F-6 mínimo** WHOOP del día correcto o `unknown`; rojo dos días para `recovery` (+ test 2).
- **F-9** Cron lee plan vivo, zonas y ancla de deload (+ test 5).
- **F-0 / F-4** La app prescribe la carga del set con doble progresión; el cron sobreescribe (Change 7, + `verify-set-target`).
- **F-0** Semana del bloque explícita + progresión de duración de cardio END-003 (Change 11, + `verify-block-week`).
- **F-5** `computeReadiness()` único; fatigue card sin score-consejo (+ test 9).
- **F-10** Lecturas dedupeadas (+ tests 6, 7).
- **F-11**, **F-12** Nutrición: recompute sólo en escritura; EA diaria.

### P2 — Worth improving
- F-8 (con F-5), F-13 ancla por fecha, F-14 UTC, S-9 separar fetch/read de wellness, aviso de workout duplicado mismo día, validación de rangos HR/pace en importación, aviso de FFM antigua.

### P3 — Optional
- F-15 borrar re-entry; F-3 (a) carga interna propia cuando haya 8+ semanas de adherencia; END-003 progresión de duración (decisión de producto pendiente en `pendientes.md` 3a); documentar F-16/F-17.

---

## 10 · THINGS I WOULD NOT CHANGE

1. **Vanilla JS, sin framework, sin bundler, un fichero.** Un ingeniero nuevo querría partirlo en módulos ES. No: los tests actuales dependen de evaluar `app.js` con `vm`; el despliegue es copiar archivos; el usuario es uno. El coste de un split es alto y el beneficio, estético. Cuando duela de verdad, partir por *feature* como ya se hizo con `bloodwork.js`/`nutrition.js`.
2. **La tabla genérica `(user_id, record_id, data jsonb)`.** Alguien propondría columnas tipadas y FKs. Para un usuario y ~13 stores, el jsonb + RLS por uid es más simple, sobrevivió a una migración de unidad y a 7 semanas de backlog, y el cron lo consulta con `->>` sin problema.
3. **El IDEAL como *dato*, no como generador algorítmico** (T4b). El spec `engines.md` es tentador. Un generador de sesiones no mejora nada que un dato bien mantenido no mejore, y añade una superficie enorme de bugs. **Pero esto NO significa que nada deba ser código**: la progresión de carga, la de duración de cardio y la semana del bloque **sí** deben ser reglas ejecutables en la app (F-0, Changes 7 y 11). La distinción: *qué* sesión hacer es dato autorado; *cuánto* peso y *cuánto* tiempo hoy es una función de la última ejecución.
4. **El cron LLM como cerebro semanal** en vez de un Progression Engine in-app. Lee todo, razona con contexto, escribe en castellano. Lo que le falta es *fontanería* (F-4, F-9), no inteligencia.
5. **El budget como informativo.** Fue decisión del usuario con un argumento correcto. No volver a hacerlo bloqueante.
6. **Last-write-wins en sync.** Para un iPhone, un vector clock es sobreingeniería. Documentar y seguir.
7. **Nutrición por foto con resolución contra biblioteca y los tres tipos de foto.** Es el diseño correcto para el problema (la precisión crece con el uso). Los dos defectos (F-11, F-12) son de *cuándo* se calcula, no de *qué*.
8. **El estilo de tests** ("el fallo que este test existe para impedir"). Es mejor que la mayoría de suites con framework. Sólo falta apuntarlos al código de decisión.
9. **Los comentarios del código.** Cada `// v11.xx:` con su porqué es documentación viva. No "limpiar".
10. **`toSession` como adaptador de lectura sin migrar registros.** La idea es correcta. Sólo el clasificador está mal.

---

## 11 · IMPLEMENTATION HANDOFF

> Para el agente que implemente. Asume acceso al repo y **no** repetir esta investigación.
> Convenciones obligatorias: cada cambio de app sube `CACHE_NAME` en `app/sw.js` y el texto
> "Training System vX" en `index.html`; si toca `PLAN.sessions` o la estructura del IDEAL, sube
> `PLAN_REV`; toda escritura de dato de usuario usa `smartPut`; los tests corren con
> `for f in tests/verify-*.mjs; do node $f; done` desde la raíz y deben quedar todos en verde;
> commit + push con `gh auth switch --user juliangarmendia` antes del push. Comentarios en
> español con el porqué, como el resto del fichero.

---

### Change 1: `enqueueSync` no depende de que exista el cliente

**Priority:** P0

**Problem:** `app/supabase-sync.js:188` — `if (!supabaseClient) return;` descarta toda escritura anterior a `initSupabase()` (paso ~20 de `init()`). Causa raíz de la cola congelada (jun-2026), `exercises` vacía y el bug de `foods` (v11.49).

**Current behavior:** `smartPut` durante `ensurePlanSeeded`, `ensureExerciseLibrarySeeded`, `ensureDeloadAnchor`, `applyIdealPlan`, `runMigrations` → sólo IndexedDB.

**Target behavior:** `enqueueSync` encola siempre que la app esté configurada para nube (`SUPABASE_URL && SUPABASE_ANON_KEY`, constantes). Sólo `drainSyncQueue` exige cliente + usuario.

**Files:** `app/supabase-sync.js` (`enqueueSync`), `app/app.js` (`backfillSeedStoresToCloud` — mantener una versión más; luego borrar), `tests/verify-sync-writes.mjs` (§5 afirma hoy el comportamiento viejo: actualizar), nuevo `tests/verify-sync-enqueue.mjs`.

**Relevant functions:** `enqueueSync`, `drainSyncQueue`, `syncedPut`, `initSupabase`, `backfillSeedStoresToCloud`.

**Dependencies:** ninguna. Habilita Change 2 (el ancla de deload pasará a subir).

**Invariants that MUST remain true:** `dbPut` directo nunca encola; flags de migración (`migrations_done`, `seed_cloud_backfill_v1`, `syncStatus`, `lastSyncTimestamp`) siguen con `dbPut`; la cola sigue colapsando upserts superseded; cuarentena intacta.

**Implementation guidance:** sustituir el guard por uno sobre las constantes de configuración; dejar comentario con los tres incidentes que causó. En `verify-sync-writes.mjs` §5, cambiar la aserción "descarta sin cliente" por "encola sin cliente". Considerar `console.info` la primera vez que se encola sin cliente (una vez por sesión) para trazabilidad.

**Do NOT:** adelantar `initSupabase()` en `init()` (registra `onAuthStateChange → syncAll()`; adelantar la cola es lo que la congeló en v11.28). No borrar `backfillSeedStoresToCloud` en este cambio (los dispositivos que ya arrancaron lo necesitan una vez).

**Acceptance criteria:** con `supabaseClient = null` y URL configurada, `smartPut('plans', …)` deja un item en `sync_queue`; tras auth, `drainSyncQueue` lo sube; `deloadAnchorWeek` aparece en `settings.userSettings` de Supabase tras un arranque limpio.

**Required tests:** `verify-sync-enqueue.mjs` (encola sin cliente; no drena sin cliente); actualizar `verify-sync-writes.mjs` §5.

**Regression risks:** ninguno funcional. Vigilar que `sync_queue` no crezca sin drenar si alguna vez `SUPABASE_URL` está mal (hoy imposible).

**Order:** primero de todo.

---

### Change 2: El cron deja de confundir `rampRate` con TSB y de tratar CTL/ATL como carga total

**Priority:** P0

**Problem:** `.claude/commands/weekly-review-auto.md` §2.10 aplica umbrales de TSB (−20/−10/+5/+20) a `rampRate` (rango real medido: −0,91…+1,86; **0** días fuera de ±20 en 123). Y llama a CTL/ATL "primary input for periodization" cuando intervals.icu sólo recibe cardio (CTL medio 2,4; las 4 sesiones de fuerza no llegan por decisión explícita de `NON_CARDIO_TYPES`).

**Current behavior:** rama de deload por carga inerte; jerarquía "wellness > RPE" descarta la única medida de la fuerza.

**Target behavior:** §2.10 (a) deriva `form = ctl − atl` por día y aplica umbrales a `form`, **recalibrados** al rango de este atleta (TSB real −11…+1,3; proponer: `form < −8` sostenido 3 d = carga alta; no inventar −20); (b) etiqueta CTL/ATL/form como **"carga aeróbica (intervals.icu sólo ve cardio)"**; (c) para fuerza, la señal primaria es RPE/top-set/quality de `workouts`; (d) retira "trust wellness — RPE is laggy" o lo limita a cardio.

**Files:** `.claude/commands/weekly-review-auto.md` (§Coaching ethos, §2.10), `.claude/commands/weekly-review.md` (versión interactiva, mismo texto), nuevo `tests/verify-cron-spec.mjs`, `docs/architecture/data-sources-audit.md` (nota).

**Dependencies:** ninguna de código. Coordinar con Change 4 (mismo fichero).

**Invariants:** el cron sigue siendo el único que escribe `tracking/`, `plans/training-plan.md`, `latest.json`; la jerarquía objetivo > subjetivo se mantiene para recovery/sueño.

**Implementation guidance:** texto, no código. Añadir una tabla "qué mide cada métrica de intervals.icu" con `rampRate` = Δ CTL/semana. Los umbrales de `form` deben venir con la advertencia de que con CTL ~2-5 la escala es pequeña y **la decisión de deload por carga debe requerir además RPE/quality de fuerza** (READ-002 aplicado al cron).

**Do NOT:** subir workouts de fuerza a intervals.icu para "arreglar" CTL (acopla más al hub y el TSS sería arbitrario) — es una alternativa válida pero es Change P3 con decisión de usuario.

**Acceptance criteria:** `verify-cron-spec.mjs` verde: el `.md` no contiene "rampRate ≈ TSB", contiene "form = ctl - atl" y la etiqueta "sólo cardio"; la siguiente revisión semanal generada cita `form` y no `rampRate` como TSB.

**Required tests:** `verify-cron-spec.mjs` (texto).

**Regression risks:** el cron puede volverse más conservador en deload por carga (deseado).

**Order:** junto con Change 4 (un solo commit sobre el `.md`).

---

### Change 3: `toSession` clasifica desde el dato, no por regex

**Priority:** P1

**Problem:** `app/app.js:812-816` clasifica `fullA/fullB/travelA/travelB/hybrid1/free` como `strength.maintenance` (peso 1). `IDEAL_BLOCK_V1` declara `full` bw 2, `travel` 1,5; `hybrid1` es familia `hybrid` (2, flag HYB-002).

**Current behavior:** advisory nunca `hard` para full-body → nunca `recovery` con rojo; flag hybrid inalcanzable; budget infra-cuenta.

**Target behavior:** lookup `session → {family, subtype, budgetWeight}` construido desde `IDEAL_BLOCK_V1.variants[*].days[]` (`planRef`, `kind`, `subtype`, `bw`) + mapa explícito `{ hybrid1: {family:'hybrid', subtype:'strength_endurance'}, free: {family:'strength', subtype:'full'} }`; regex sólo como fallback con `console.warn('[toSession] fallback regex para', sid)`.

**Files:** `app/app.js` (`toSession`, ~línea 812; helper nuevo junto a `SESSION_TYPES`), `tests/verify-session-classification.mjs` (nuevo).

**Relevant functions:** `toSession`, `classifySessionStress`, `computeHardDayBudget`, `detectInterference`, `sessionSubtypeMeta`, `IDEAL_BLOCK_V1`, `PLAN.sessions`.

**Dependencies:** ninguna. Change 6 (readiness) lo asume.

**Invariants:** registros nuevos con `sessionType && family` siguen respetándose tal cual (primer `if` de `toSession`); `lowerA/B → lower (2)`, `upperA/B → upper (1)` no cambian; `budgetWeight` explícito en el registro gana al lookup.

**Implementation guidance:** construir el mapa una vez (lazy) recorriendo todas las variantes; `free` → `strength.full` peso 2 es la elección conservadora (una sesión libre suele ser compuesta). Opcional en el mismo cambio: `finishWorkout` guarda `family/subtype/budgetWeight` en el registro (snapshot autodescriptivo) — recomendado.

**Do NOT:** tocar `SESSION_TYPES` pesos; no migrar registros antiguos (el adaptador los cubre).

**Acceptance criteria:** test recorre todas las claves de `PLAN.sessions` y todos los `planRef` del IDEAL: ninguno cae al fallback; `fullA` → 2, `hybrid1` → `hybrid`, `travelA` → 1,5; `classifySessionStress(fullA)` → `level:'hard'`.

**Required tests:** `verify-session-classification.mjs`; `verify-advisory-matrix.mjs` caso `fullA + red → recovery`.

**Regression risks:** el budget informativo sube en semanas con full-body (correcto). Comprobar que la tarjeta "Carga de la semana" sigue pintando.

**Order:** antes de Change 6.

---

### Change 4: El cron lee el plan vivo, las zonas y el ancla de deload

**Priority:** P1

**Problem:** `weekly-review-auto.md` hardcodea días de pierna **invertidos** respecto al IDEAL (§2.8), deload "week 5 or 9" (§3.2) y techo Z2 `< 140` (§2.8) frente a 143 en su propia tabla y en `settings.icuZones`.

**Target behavior:** el cron consulta en Supabase `plans` (fila de mayor `version`: `weekTemplate` da qué día es `gym` y con qué `session`; `sessions[id].exercises` da los ids) y `settings.userSettings` (`deloadAnchorWeek`, `startDate`, `icuZones`); deriva "días de pierna" de `MOVEMENT_PATTERNS`-equivalente (sesiones `lowerA/lowerB` o cuyo `planRef` sea `kind:'strength', subtype:'lower'`); deload = `((wk − anchor) % 5) === 4` con `wk` calculado igual que `getWeekNumber()` (desde `startDate`); techo Z2 = `icuZones.z2.max` si existe, si no 143.

**Files:** `.claude/commands/weekly-review-auto.md`, `.claude/commands/weekly-review.md`, `tests/verify-cron-spec.mjs`.

**Dependencies:** Change 1 (para que `deloadAnchorWeek` esté en Supabase). Mismo commit que Change 2.

**Invariants:** el formato de `latest.json` no cambia (la PWA lo consume).

**Implementation guidance:** añadir una sección "Phase 1.6 — Leer el plan vivo" con las tres queries SQL concretas (`plans` ordenado por `(data->>'version')::int desc limit 1`; `settings where record_id='userSettings'`). Sustituir toda mención de días fijos por "según `weekTemplate`". Sustituir "week 5 or 9" por la fórmula del ancla.

**Do NOT:** duplicar la lógica de `isDeloadWeek` con otra cadencia; no inventar zonas si `icuZones` falta (usar 143 y decirlo).

**Acceptance criteria:** `verify-cron-spec.mjs` verde (sin "week 5 or 9", sin "< 140", sin "Mon/Thu = upper", con las queries); la siguiente revisión generada nombra correctamente Lun/Jue como pierna.

**Required tests:** `verify-cron-spec.mjs`.

**Regression risks:** ninguno en app. La revisión del domingo siguiente puede cambiar de tono al ver la carga correctamente.

---

### Change 5: WHOOP del día correcto o `unknown` (mínimo viable de F-6)

**Priority:** P1

**Problem:** `getWhoopContext()` (`app.js:~7880`) usa `recovery[length−1]` sin comparar `date` con `today()`; el de ayer se usa como hoy.

**Target behavior:** `rec = recovery.find(r => r.date === today())`; si no existe → `color:'unknown'` (el advisory ya trata `unknown` como `keep` + `confidence:low`). Además: `recovery` para `hard` exige rojo **hoy y ayer** (dos días) — puente hasta Change 6.

**Files:** `app/app.js` (`getWhoopContext`, `computeTrainingAdvisory`), `app/whoop.js:226-227` (fecha local, F-14), `tests/verify-advisory-matrix.mjs` (nuevo).

**Dependencies:** ninguna; Change 6 lo reemplaza/absorbe.

**Invariants:** `renderRecoveryHero` puede seguir mostrando el último disponible (es visualización, con su fecha); el advisory no.

**Do NOT:** cambiar los cortes 67/34 de `getRecoveryColor`.

**Acceptance criteria:** test: WHOOP rojo con `date` = ayer y sin fila de hoy → advisory `keep`/`low`; rojo hoy solo → `keep` con razón "rojo hoy; confirmando"; rojo hoy y ayer con sesión `hard` → `recovery`.

**Required tests:** `verify-advisory-matrix.mjs`.

**Regression risks:** el advisory dirá `unknown` más mañanas (WHOOP sincroniza tarde). Es honesto; el texto ya existe.

---

### Change 6: Un `computeReadiness()` para advisory, deload reactivo y fatigue card

**Priority:** P1

**Problem:** tres cálculos independientes (`computeTrainingAdvisory`, `renderFatigueCard` `app.js:~4675`, `checkDeloadNeeded` `app.js:~10131`) con inputs y criterios distintos; la fatigue card deriva un consejo de un score compuesto (READ-003 al revés); `checkDeloadNeeded` tiene una rama muerta (F-8).

**Target behavior:** `computeReadiness({date})` → `{ color:'green'|'yellow'|'red'|'unknown', signals:[{id, dir, value, baseline}], confidence, deloadHint:boolean }`. Señales: WHOOP hoy (color), HRV media 7d vs baseline 28d (−10% = señal), RHR media 7d vs baseline (+5 bpm), sueño media 7d (<6,5 h), RPE≥9 en las 2 últimas sesiones, quality ≤2 en las 2 últimas. `red` = ≥2 concordantes; `yellow` = 1; `deloadHint` = ≥3 sostenidas o RPE≥9 ×2 (LOAD-004). Advisory usa `color`; `checkDeloadNeeded` usa `deloadHint` + `nextDeloadWeek()`; fatigue card **muestra las señales** (sin score, sin "push hard").

**Files:** `app/app.js` (nueva sección `READINESS`, modificar `computeTrainingAdvisory`, `checkDeloadNeeded`, `renderFatigueCard`), `tests/verify-readiness-trend.mjs` (nuevo), actualizar `verify-advisory-matrix.mjs`.

**Relevant functions/data:** store `wellness` (123 días: `hrv`, `restingHR`, `sleepSecs`, `readiness`), `whoopSyncData`, `getRecoveryColor`, `workouts` (quality, rpe), `nextDeloadWeek`, `deloadAnchorWeek`.

**Dependencies:** Change 3 (clasificación correcta) y Change 5 (fecha correcta). Sustituye la rama muerta de F-8.

**Invariants:** matriz del advisory se conserva (`easy → keep`; `unknown → keep/low`; `hard + red → recovery`; `hard + red + flag → replace`; `moderate + yellow → modify`); `readiness-rules.md` es la spec — no inventar umbrales fuera de ella sin anotarlos como heurística.

**Implementation guidance:** baselines desde el store `wellness` local (no red). Si hay <14 días de datos → `confidence:'low'` y sólo WHOOP. Mantener la tarjeta de fatiga como lista de señales con su valor y baseline ("HRV 7d 62 ms vs 71 base −13%"). Borrar el score 0-100 y las ponderaciones de proteína/frecuencia.

**Do NOT:** convertir `color` en número de series/kg (READ-003); no usar `hrv` de un día; no comparar HRV con valores poblacionales.

**Acceptance criteria:** tests 2 y 9 verdes; una noche mala sola → `yellow` como máximo; tres pantallas muestran el mismo color/señales.

**Required tests:** `verify-readiness-trend.mjs`, `verify-advisory-matrix.mjs`, `verify-deload-calendar.mjs`.

**Regression risks:** medium — toca Home y Stats. Verificar en iPhone que las tres tarjetas pintan y coinciden.

**Order:** después de 3 y 5.

---

### Change 7: La app prescribe la carga del set (doble progresión), y el cron sobreescribe

**Priority:** P1 — **el cambio de producto de mayor ROI** (F-0, F-4)

**Problem:** el placeholder del set es el peso anterior; `generateCoachNote` (`app.js:3666`) calcula la doble progresión y sólo emite una frase; el target del cron sólo se ve en Stats. Tres números, ninguno en el input. Mi primer borrador proponía "el target del cron llega a la tarjeta": eso deja la progresión **dependiente de que el cron corra el domingo** y de que su `weekKey` coincida. La arquitectura correcta es la inversa.

**Current behavior:** `buildExerciseCard` → `placeholder = prevWeightDisp`; `generateCoachNote` → texto.

**Target behavior:** una función pura **`suggestSetTarget(ex, history, opts)`** → `{ kg, reps, rpe, reason, source }` con prioridad explícita:
1. **`source:'coach'`** — si `weekly_reviews[latest].nextWeekPlan.sessions[sessionId].exercises[exerciseId].target` existe **y** `weekKey` es la semana ISO en curso (o la anterior si aún no hay nueva) → parsear kg/reps/rpe/note.
2. **`source:'rule'`** — si no, la regla ya escrita en `generateCoachNote`, extraída y hecha determinista: todas las series al tope del rango con RPE ≤ objetivo → **+2,5 kg** (barra) / siguiente par (DB) / +1,25 kg (accesorio, como dice el cron §2.9); al tope pero RPE > 8,5 → mismo kg; no llegó al mínimo en todas → **−2,5 kg** o repetir; si no → mismo kg, "+1 rep".
3. **`source:'last'`** — sin histórico ni cron: el peso anterior (comportamiento actual).
4. **Deload** (`isDeloadWeek`): kg × 0,85-0,9 sobre el sugerido, RPE 5-6 (hoy sólo se recortan series).

La tarjeta muestra **una** línea de objetivo — "**Objetivo:** 92,5 kg × 5-8 @7-8 · *regla: todas al tope @7,0*" o "*coach W36: …*" — y el placeholder del set 1 es ese kg. "Last: 90×8 90×8 90×7" queda como histórico. `generateCoachNote` **desaparece** (su lógica vive en `suggestSetTarget`).

**Files:** `app/app.js` (`buildExerciseCard`, `startWorkout`, `generateCoachNote` → `suggestSetTarget`, `renderTodaysPlan` para mostrar el kg objetivo también en Home), `app/style.css`, `tests/verify-set-target.mjs` (nuevo, **escribir primero**), `tests/verify-cron-output-shape.mjs`.

**Relevant data/functions:** `convertWeight` (lb→kg del histórico pre-España), `estimate1RM`, `measureUnitFor` (los ejercicios de medida —cm de cajón— no tienen kg objetivo), `planEx.db/bw/compound`, `isDeloadWeek`, `weekly_reviews` store, `latest.json` (ejemplo real W36: `{id:'bench-press', target:'95 kg × 5-8', rpe:'7-8', note}`).

**Dependencies:** ninguna dura. Mejor tras Change 4 para que el cron no prescriba build en semana de deload de la app. Change 11 comparte el concepto "semana del bloque".

**Invariants that MUST remain true:** el usuario puede escribir cualquier kg; `finishWorkout` no cambia de forma; sin histórico y sin cron la tarjeta es idéntica a hoy; `verify-workout-unit.mjs` sigue verde (una sola fuente de unidad); los ejercicios `bw` suman sobre el peso corporal (`+kg`); los de medida no reciben objetivo de kg.

**Implementation guidance:** `suggestSetTarget` debe ser **pura** (recibe `ex`, `history[]` ya normalizado a la unidad de la app, `coachTarget|null`, `deload:boolean`) para que el test la recorra con fixtures. Incrementos: barra 2,5 kg; mancuerna → siguiente par disponible (constante editable con los pares del gym); accesorio de polea 1,25-2,5. Redondear a múltiplo de 1,25. El parseo del target del cron en `parseCoachTarget()` pura (tolerar "×"/"x", "kg", "/DB", "BW+2,5"). Etiquetar siempre el origen en la UI: esa etiqueta es lo que permite al usuario confiar o corregir.

**Do NOT:** hacer que el cron escriba en `plans`/`sessions` (rompe no-mutación); no progresar en semana de deload; no progresar si la última sesión de ese ejercicio tiene >21 días (tras pausa: repetir último kg, no subir); no aplicar la regla a ejercicios de medida; no borrar el histórico "Last:" (es la evidencia que el usuario mira).

**Acceptance criteria:** fixtures: (a) 3×8 @RPE 7 con rango 5-8 y sin cron → objetivo +2,5; (b) 3×8 @RPE 9 → mismo kg, razón "RPE alto"; (c) 8/8/6 en rango 8-10 → −2,5 o repetir; (d) cron W-actual con "95 kg × 5-8" → 95, `source:'coach'`; (e) cron de hace 3 semanas → ignorado, cae a la regla; (f) `isDeloadWeek` → ×0,9, RPE 5-6; (g) última sesión hace 30 días → repetir, `source:'last'`, razón "pausa"; (h) sin nada → placeholder anterior. En el iPhone: Upper A muestra un objetivo por ejercicio con su origen.

**Required tests:** `verify-set-target.mjs` (los 8 casos), `verify-cron-output-shape.mjs`, actualizar `verify-workout-unit.mjs` si toca la tarjeta.

**Regression risks:** medium-high — es la pantalla más usada. Probar una sesión real completa antes de cerrar. Riesgo científico controlado: la regla es la doble progresión estándar que el corpus ya usa (STR-001: carga antes que volumen en déficit; el incremento fijo de 2,5 kg es heurística de práctica, no evidencia — decirlo en el comentario).

---

### Change 8: Lecturas de carreras y sesiones siempre dedupeadas en agregaciones

**Priority:** P1

**Problem:** 23 `dbGetAll('runs')` crudos vs 6 dedupeados; latente hasta que Strava se reconecte.

**Target behavior:** en anillos/racha (`app.js:~2725`), `renderWeekStrip`, `renderRunTotals`, fatigue card, gráficos de running → `getRunsDeduped()` / `getSessionsDeduped()`. Crudo sólo en backup/CSV/export y en el propio dedupe.

**Files:** `app/app.js` (sitios listados por `grep -n "dbGetAll('runs')"`), `tests/verify-run-dedup-readers.mjs` (nuevo, línea base 0 fuera de la allowlist), `tests/verify-dedupe.mjs` (nuevo).

**Invariants:** export/backup siguen crudos ("must stay raw to avoid data loss", comentario existente).

**Do NOT:** cambiar las tolerancias de `_runsAreSameActivity` sin test.

**Acceptance criteria:** tests 6 y 7 verdes; cifras de km/racha idénticas con Strava desconectado.

---

### Change 9: Nutrición — recompute sólo en escritura; EA como métrica diaria

**Priority:** P1

**Problem:** F-11 (`renderNutricionV2` → `recomputeNutritionDay` → `smartPut` en cada render) y F-12 (EA intradía en rojo).

**Target behavior:** `renderNutricionV2` lee `nutrition[today]`; recompute sólo si no existe, si cambió `meals` (comparar ids/`mealCount`) o tras `finishWorkout`/`logCardio`/`logZ2Finisher` (EEE cambia). Tarjeta Hoy: EA de **ayer** con semáforo + "kcal netas para llegar a 30 hoy: N"; el semáforo de EA en Tendencias sólo sobre días cerrados (`date < today`).

**Files:** `app/nutrition.js` (`renderNutricionV2`, `recomputeNutritionDay`, `renderNutToday`, `renderNutTrends`), `app/app.js` (hook en `finishWorkout`/`logCardio` → `recomputeNutritionDay(today())` si existe), `tests/verify-nutrition-v2.mjs` (añadir), `tests/verify-nutrition-recompute-idempotent.mjs`.

**Invariants:** `nutrition` sigue con un único escritor; `energy` se conserva por merge; los 5 consumidores legacy intactos.

**Do NOT:** mover la EA a "proyección a fin de día" con extrapolación de kcal (inventaría datos).

**Acceptance criteria:** abrir la pestaña 3 veces sin cambios → 0 items nuevos en `sync_queue`; a las 9:00 con 1 comida la tarjeta no muestra "crítico".

---

### Change 10 (P2): Ancla de deload por fecha; UTC en wellness; borrar re-entry

- `deloadAnchorDate` (lunes ISO) en settings; `isDeloadWeek(date)` deriva de fechas; `getWeekNumber` sólo etiqueta. Migración: si existe `deloadAnchorWeek`, convertir a fecha con `startDate`. Test 4.
- `whoop.js:226-227` → `dateStr(new Date())`.
- Borrar `app.js:1067-1175` (RE-ENTRY RAMP) y la rama `'Reentrada '` de `generateCoachNote`. Verificar con grep que nada llama `applyReentryPlan`/`REENTRY_`.

---

### Change 11: Semana del bloque explícita + progresión de duración de cardio (END-003)

**Priority:** P1 (F-0)

**Problem:** `IDEAL_BLOCK_V1.weeks = 5` declara "4 build + 1 deload"; sólo el deload existe (`isDeloadWeek`). Las semanas 1-4 son idénticas. `durationMin` del cardio es constante (40/50) desde junio. END-003 (+10%/sem soft, down weeks) no está en ningún sitio; el cron programa km de carrera pero no toca el `durationMin` del template.

**Target behavior:** `blockWeek()` → `{ index: 1..5, isDeload, weeksIntoBlock }` derivado del **mismo ancla** que `isDeloadWeek` (`deloadAnchorWeek`; tras Change 10, `deloadAnchorDate`). `getPlannedSessionForDate` para `type:'run'` devuelve `durationMin = round5(base × 1.1^(index−1))` para `index` 1-4 y `base × 0,7` en deload, con techo `base × 1,35`. El `hrTarget` no cambia (la progresión en base aeróbica es de volumen, no de intensidad — END-002). `renderTodaysPlan`, el push a intervals.icu (`pushCardioToIntervalsIcu`) y el Z2 finisher leen la duración ya progresada.

**Files:** `app/app.js` (`blockWeek` junto a `isDeloadWeek`; `getPlannedSessionForDate` rama `run` y `z2FinisherMin`; `_idealDayGuide`/`renderIdealPreview` para mostrar "semana 3 de 5"), `tests/verify-block-week.mjs` (nuevo).

**Relevant functions:** `isDeloadWeek`, `deloadAnchorWeek`, `nextDeloadWeek`, `getWeekNumber`, `buildWeekTemplateFromIdeal`, `getPlannedSessionForDate`, `pushCardioToIntervalsIcu`, `logZ2Finisher`.

**Dependencies:** comparte ancla con Change 10; puede ir antes usando `deloadAnchorWeek`.

**Invariants:** el `durationMin` **base** sigue viviendo en `IDEAL_BLOCK_V1` (dato); la progresión es una función, no una edición del dato; la variante de viaje no progresa; el deload sigue recortando series de fuerza al 50% como hoy.

**Implementation guidance:** END-003 en el corpus está marcada *heuristic, NOT validated* (Buist: 10,5% vs 23,7% sin diferencia). Usar 10% como default prudente y **decirlo en el comentario**. Mostrar la semana del bloque en Home ("Semana 3/5 · build") para que el usuario vea por qué hoy son 48 min y no 40. Cuando el cron prescriba km explícitos para un día (`runningPlan`), esos ganan sobre la duración progresada (misma prioridad coach > regla que en Change 7).

**Do NOT:** progresar intensidad/zona; progresar en deload o tras >14 días sin cardio registrado (repetir base); tocar `IDEAL_BLOCK_V1.durationMin`.

**Acceptance criteria:** con ancla en semana W, la sesión de cardio de W+2 muestra 48 min (40 × 1,21 → 48), W+4 (deload) 28 min; el Z2 finisher progresa igual (20 → 22 → 24 → 26 → 14); `renderIdealPreview` muestra "Semana N/5"; test verde.

**Required tests:** `verify-block-week.mjs` (índice por semana; duración por índice; techo; deload; viaje no progresa; pausa >14 d repite base).

**Regression risks:** low-medium; toca el push a intervals (verificar que el DSL lleva la duración nueva).

---

## 12 · DEPENDENCY MAP

```
Change 1 (enqueueSync) ─────────────────────────► habilita que deloadAnchorWeek llegue a Supabase
        │                                                   │
        └──► Change 4 (cron lee plan/ancla/zonas) ◄─────────┘
                    ▲
Change 2 (cron rampRate/CTL) ── mismo fichero, MISMO COMMIT que Change 4

Change 3 (toSession) ──┐
Change 5 (WHOOP hoy) ──┼──► Change 6 (computeReadiness) ──► absorbe F-8 (deload muerto)
                       │
Change 7 (la app prescribe el set; cron override) — independiente; MEJOR tras Change 4
                                        escribir verify-set-target ANTES de implementar
        │
        └──► Change 11 (semana del bloque + cardio END-003) — comparte "semana del bloque"; puede ir a la vez

Change 8 (dedup) — independiente
Change 9 (nutrición) — independiente
Change 10 — después de todo lo anterior
```

**Orden sugerido:** 1 → (2+4) → **7 → 11** → 3 → 5 → 8 → 9 → 6 → 10. El 7 sube de posición a propósito: es lo que convierte la plantilla en un plan que progresa, y no depende de nada. Los tests "must-have" (§8 1-4) se escriben **antes** de 3, 5, 6; `verify-set-target` **antes** de 7.

---

## 13 · FINAL RECOMMENDATION

**1. ¿Confiaría hoy en que esta aplicación genere mi entrenamiento?**
Para **registrar y ver**: sí, sin reservas — la fontanería de datos es sólida tras agosto y la ingesta es honesta con lo que descarta. Para **decidir si entrenar hoy**: parcialmente — el advisory es conservador por diseño (default `keep`), así que rara vez hace daño, pero reacciona a un solo día de WHOOP que puede ser el de ayer. Para **progresar cargas**: **no** — el sistema calcula la progresión correcta cada domingo y no la entrega donde se levanta. Para **periodizar por carga**: **no** — la señal es ciega a la fuerza y sus umbrales no pueden disparar.

**2. Qué partes sí:** ingesta y sync (post-v11.50 + Change 1), el plan como dato con sus variantes y swaps, el registro de sesiones y sesión libre, la nutrición por foto con biblioteca, el corpus y su trazabilidad, la revisión semanal como *texto* de coach.

**3. Qué partes todavía no:** el advisory diario como gate de readiness; la fatigue card; la rama de carga del cron; la prescripción de kg en el entreno.

**4. Principal riesgo sistémico:** **fragmentación de la capa de decisión** — tres readiness, dos progresiones, dos deloads, y un cron que razona sobre un plan que ya no existe. Cada pieza sola es defendible; el conjunto produce números distintos para la misma pregunta.

**5. Principal oportunidad de simplificación:** **`computeReadiness()` único** (S-1): quita dos cálculos, cumple tres reglas del corpus que hoy se violan, y hace que Home y Stats digan lo mismo.

**6. Cambio individual con mayor ROI:** **Change 7** — que la app prescriba el kg del set con la regla que ya tiene escrita, y el cron sobreescriba. Es lo que convierte una plantilla con libreta en un plan que progresa, sin construir ningún motor nuevo. Por integridad de datos, **Change 1** (`enqueueSync`, una línea) va antes.

**7. ¿Algo justifica reconsiderar la arquitectura?** No — pero sí **reconsiderar el spec**. `engines.md` describe 10 motores en cascada de los que sólo 3 (Progression, Readiness, Block mínimo) hacen falta como código para una persona con un objetivo fijo; los otros 7 están resueltos en tiempo de diseño por el IDEAL, los swaps y `ALT_LIBRARY`, y construirlos sería fabricar maquinaria para un problema que no existe. La objeción del usuario (*"un loop de la misma rutina"*) es correcta y su causa no es la falta de motores: es que la única regla de progresión que existe emite texto en vez de fijar el objetivo, y la que calcula el cron no llega al rack. Recomendación concreta: reescribir la cabecera de `engines.md` como "3 motores a implementar + 7 decisiones de diseño ya tomadas en el IDEAL", para que nadie vuelva a leerlo como un backlog de 10.

**8. ¿Mejorar incrementalmente?** Sí. La base es la correcta para un sistema de una persona: visor + IDB + Supabase + cron LLM. Con los 11 cambios de §11 en el orden de §12 —y con **7 y 11 pronto**, no al final— el sistema deja de ser un loop: cada sesión propone su carga desde la anterior, el cardio crece dentro del bloque, el deload corta, y el cron corrige por encima cuando ve algo que la regla no ve. Sin reescribir nada y sin construir los 7 motores que no hacen falta.

---

*Auditoría realizada el 2026-09-05 leyendo `app/*.js`, `supabase/functions/*`, `docs/architecture/*`, `research/evidence-to-rules.md`, `.claude/commands/weekly-review-auto.md`, `assessments/2026-08-16_system-audit.md`, `docs/pendientes.md`, y consultando Supabase (`wellness`, `runs`, `sessions`, `workouts`). Sin cambios en el código.*
