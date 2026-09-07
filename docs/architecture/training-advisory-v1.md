# Training Advisory Layer v1 (T3)

> **v11.62 — RETIRADO: el coach no ajusta el día (decisión del usuario, 2026-09-07).**
> *"Nada de ajustar el entrenamiento del día por WHOOP. Eso es muy subjetivo; voy a ser yo y mi
> cuerpo el que decida skipear un ejercicio o bajar los pesos."* Con esa frase se fueron
> `computeTrainingAdvisory`, `renderTrainingAdvisory` y sus dos botones, el check-in de 2 toques,
> el hero de WHOOP en Home, el banner reactivo de descarga y el motor `adjustSessionForReadiness`.
> **Este documento se conserva como historia**: describe una capa que ya no existe.
>
> Lo que SÍ sigue vivo de aquí, y dónde: `getPlannedSessionForDate` (el plan del día),
> `classifySessionStress` (clasificación de sesiones), `getWhoopContext` (dato de hoy o nada),
> `computeHardDayBudget` / `renderHardDayBudget` (ahora en **Stats › Today**, informativo) y
> `ALT_LIBRARY` (la lee el preview del plan ideal). La recuperación se ve en Home como **una línea
> informativa** (`renderRecoveryLine`, con el rendimiento primero) y en Stats como la lista de
> señales (`renderReadinessSignals`). Ninguna propone nada.
>
> El coaching que sí cambia el plan es **semanal**: `docs/architecture/coach-v2.1-implementation-plan.md`.

Capa de **inteligencia de programación, read-only**. WHOOP = fuente de recovery (no se recalcula).
La app responde, para hoy: qué sesión tocaba (plan actual) → qué estrés genera → contexto WHOOP →
hard-day budget de la semana → interferencia → **recomendación advisory** (keep/modify/replace/
recovery) + alternativas. **Nunca muta `PLAN`/`WEEK_TEMPLATE`/sessions/workouts.** Implementado en
`app/app.js` (v11.21).

## Interfaces (forward-compatible)
- `getPlannedSessionForDate(date)` → `{type:'gym'|'run'|'rest', name, sessionId?, exercises?}`. Hoy
  lee `activeWeekTemplate`/`activePlan`/`getWeekSchedule`. **T4 (Base Plan Engine) reemplazará esta
  fuente sin cambiar el resto.**
- `classifySessionStress(planned)` → `{level:'hard'|'moderate'|'easy', family, subtype, regions,
  impact, systemicFatigue, budgetWeight, ruleIds}` (vía `toSession` + `SESSION_TYPES`).
- `getWhoopContext()` → `{color:'green'|'yellow'|'red'|'unknown', score, hrv, rhr, sleepHrs,
  source:'intervals'|'whoop-direct'|'none', date, fetchedAt, reason, lastAvailable}`. Usa el recovery
  de WHOOP **tal cual** (READ-003); `null`/sin datos → `unknown`. **No usa strain/stress** (no llegan
  por el proxy intervals.icu). **v11.58: el dato es de HOY o no hay dato** — ver abajo.
- `computeHardDayBudget()` → `{used, cap:6, hardSessions, items[], overCap}`. Suma `budgetWeight` de
  workouts/runs(deduped)/sessions de la semana. Guardrail heurístico (BUD-001/002), no fisiológico.
- `detectInterference(planned, ctx)` → `{flags:[{type, ruleId, note}]}` (BUD-001, READ-003, HYB-002).
  Forward-ready: varios flags quedan **latentes** hasta que el plan tenga sesiones duras (T4).
- `getReplacementOptions(planned, ctx)` → `ALT_LIBRARY` predefinida (no improvisa).
- `computeTrainingAdvisory()` → objeto final (abajo). **Puro/read-only.**

```js
{ plannedSession, plannedStress, recommendation:'keep'|'modify'|'replace'|'recovery',
  reason:[], alternatives:[], confidence:'high'|'medium'|'low',
  ruleIds:[], whoopContext:{}, hardDayBudgetContext:{}, interferenceContext:{} }
```

## v11.58 — hoy o `unknown`, y la clasificación sale del dato (audit Changes 3+5, F-6/F-7/F-14)

Dos correcciones al v1, ambas en `app/app.js` + `app/whoop.js`:

1. **El dato de recuperación es de hoy o no existe.** `getWhoopContext` hacía
   `recovery[recovery.length - 1]` sin comparar la fecha: a las 7:00, cuando intervals.icu todavía
   tiene el de ayer, el advisory decidía el entreno de hoy con la noche de anteayer (F-6). Ahora
   `recovery.find(r => r.date === today())`; si no está → `color:'unknown'`, `source:'none'`,
   `reason` con el motivo real y `lastAvailable` **sólo para pintar** (con su fecha: "ayer", "hace
   3 días"). `unknown` → `keep` + `confidence:'low'`, nunca una decisión.
   **Dos fuentes con roles distintos**: intervals.icu = **histórico** (store `wellness`, baselines
   7d/28d), WHOOP directo (`whoopFetchTodayRecovery`, OAuth) = **el dato de hoy**. Se pide sólo si
   la fila de hoy falta o no trae `readiness`; se mezcla en `data.recovery` con
   `source:'whoop-direct'` + `fetchedAt`, y se guarda en `wellness` (merge, `readinessSource`).
   Caché del intento **por día** (`whoop_today_attempt`, 10 min): se reintenta cada vez que se abre
   la app hasta que llegue, y la caché de 10 min de `whoop_cache` no lo tapa. Sin ruta directa el
   sistema lo dice y degrada; **no inventa el dato**. Todas las fechas de `whoop.js` son locales
   (F-14: `_whoopLocalDateStr`, cero `toISOString`).
2. **`toSession` clasifica desde el dato** (F-7). Lookup `SESSION_CLASS` construido desde
   `IDEAL_BLOCK_V1.variants[*].days[]` (`planRef` → `kind`/`subtype`/`bw`) + mapa explícito
   (`free` → `strength.full` peso 2, `hybrid1` → `hybrid.strength_endurance` peso 2, legacy). La
   regex sobre el id queda como último recurso **con `console.warn`**. `finishWorkout` guarda además
   `family`/`subtype`/`budgetWeight` en el registro. Efecto: `fullA/fullB` pasan a `hard` (peso 2) y
   un full-body con rojo ya propone recuperación; `hybrid1` produce el flag HYB-002.
   Además, en la rama `hard` el flag redundante `recovery` ("rojo + sesión exigente") dejó de contar
   como segunda señal: era la misma señal dos veces, así que un rojo de un día daba `replace`
   (READ-002 pide **concordancia**, no repetición).

Tests: `tests/verify-session-classification.mjs`, `tests/verify-whoop-context.mjs` (el sucesor de
`verify-advisory-matrix.mjs`, con sólo la honestidad de fecha), `tests/verify-coach-wiring.mjs` §12. La ruta directa de WHOOP **no se puede probar contra la API
real** desde los tests: el código devuelve `null` ante cualquier error y nunca lanza.

## v11.59 — Un readiness para todo: advisory, deload reactivo y señales

**El día rojo cambia el objetivo, no el kg.** El incremento 5 sustituye la matriz del v1 por
`computeReadinessFrom` + `adjustSessionForReadiness` (`app/coach-engine.js`, puros y testeados) y
consolida las **tres** lecturas de recuperación que discrepaban (audit F-5) en una sola:

| Antes (v11.58) | Ahora (v11.59) |
|---|---|
| Home: color WHOOP de un día + 2 flags (uno redundante, otro inalcanzable) | `computeReadiness()` — 8 señales, ≥2 concordantes para el rojo (READ-002) |
| Stats: `renderFatigueScore` → score 0-100 → "Push hard today" | `renderReadinessSignals` → la lista de señales con valor y base. Sin número, sin barra, sin consejo (READ-003) |
| Stats: `checkDeloadNeeded` con su propio criterio + una rama muerta (F-8) | `deloadHint` del mismo readiness + la fecha del deload **programado** |

**Señales y umbrales** (heurística prudente, no un hallazgo; todos declarados juntos en
`coach-engine.js`): `whoop` (score de HOY; rojo dispara, amarillo fija suelo de color · 67/34) ·
`hrv7v28` (media 7d vs media de los días 7..34, ≤ −10 %) · `rhr7v28` (≥ +5 bpm) · `sleep7`
(< 6,5 h) · `rpe2` (RPE medio ≥9 en las 2 últimas sesiones con ≥3 series con RPE) · `quality2`
(≤2 en las 2 últimas) · `sleepSelf` (`<6h` en el check-in) · `feelSelf` (≤2/5). Color: ≥2
disparadas → rojo; 1 → amarillo; 0 → amarillo si WHOOP amarillo, `unknown` si no hay dato de hoy
**y** las tendencias son insuficientes, si no verde. Confianza: alta = dato de hoy + ≥14 días de
base; media = falta uno; baja = sólo entrenos/subjetivo.

**Consecuencia buscada:** un WHOOP rojo de hoy, solo, es UNA señal → **amarillo** → la sesión se
ajusta, no se cambia. Antes mandaba una pierna pesada a "Recuperar" con la noche de un solo día,
y a veces con la de ayer (F-6). Con una segunda señal concordante sí escala.

**Matriz del ajuste** (`adjustSessionForReadiness`; nunca toca kg, ni el Z2 finisher, ni los días
de descanso, y nunca bloquea):

| readiness \ sesión | rest/recuperación | cardio fácil | cardio con carga | gym moderada | gym exigente |
|---|---|---|---|---|---|
| `unknown` | keep | keep | keep | keep · low | keep · low |
| verde | keep | keep | keep | keep | keep |
| amarilla | keep | keep | **modify** ×0,8 (misma zona) | **modify**: RPE ≤7 · −1 accesorio · sin potencia | **modify**: RPE ≤7 · −2 accesorios · sin potencia (INT-004) · compuestos intactos |
| roja | keep | keep, tope 30′ | **replace** → `ALT_LIBRARY.hard_cardio` | **modify**: RPE ≤7 · sólo compuestos+core · compuestos −1 serie (mín 2) | **recovery** → `ALT_LIBRARY.strength_lower`/`.hybrid` a 30′; **replace** con una 2ª bandera de interferencia |

Recorte por permanencia `compuesto > Core > superserie > accesorio suelto`, desde el final. Dos
predicados, no uno: `isCompound` es la flag del plan (decide el esqueleto del día rojo) e
`isMainLift` son los seis patrones (protege del recorte al RDL, que no lleva la flag en `PLAN`).

**Home**: la tarjeta propone la sesión ajustada con un bullet por cambio (con su *por qué*) y dos
botones — `[Hacer la ajustada] [Hacer la planificada]`, o `[Registrar la alternativa] [Hacer la
planificada igual]` cuando cambia el objetivo del día. Ninguno se deshabilita; las dos decisiones
se registran (`logDecision type:'readiness-adjust'`, `outcome: accepted|declined`). El pie "no
cambia tu plan" desaparece: ahora sí cambia la sesión del día. **Check-in de 2 toques** cuando
falta el dato de hoy (READ-005): `¿Cómo dormiste? [<6h][6-7][7-8][>8]` y `¿Cómo te sientes? [1-5]`
→ `wellness[hoy].subjective`, con merge (`smartPut`) para no pisar el histórico de intervals.icu
(y la escritura de `intervalsFetchWellness` conserva `subjective`, o el check-in duraría minutos).

**Entreno**: `startWorkout(id, {adjustments})` filtra `dropIds` (por `id` y por `_origId`, así el
swap sigue funcionando), `buildExerciseCard` aplica `RPE ≤7` y `setDelta` con suelo de 2 series, y
el encabezado dice "· ajustada (recuperación amarilla)". `captureWorkoutState` guarda `adjustments`
y `readinessAtStart`, así que **al reanudar los ejercicios quitados siguen quitados**.
`finishWorkout` sella `readinessAtStart`, `adjusted` y el resumen del ajuste: es la mitad del lazo
que el coach semanal necesita para contrastar sus propias propuestas.

Tests: `verify-readiness-trend.mjs`, `verify-coach-wiring.mjs` §13. (`verify-session-adjust.mjs` y
`verify-advisory-matrix.mjs` se borraron en v11.62 con el ajuste diario; `verify-coach-wiring.mjs`
§16 comprueba ahora que nada de esto vuelva.)

## Matriz de decisión v1 (histórica — la vigente es la de v11.59, arriba)
Solo se sale de `keep` con **confirmación multi-señal** (≥2 concordantes, READ-002):
- rest / `easy` / recovery → **keep** siempre.
- WHOOP `unknown`/null (**incluido "hay dato, pero no es de hoy"**, v11.58) → **keep**,
  `confidence: low` (no inventar), con el motivo en `reason[]`.
- `hard`: señales = {WHOOP red, budget overCap, interferencia}. ≥2 → **replace**; solo red → **recovery**;
  yellow + semana cargada (≥cap−1) → **modify**; si no → **keep**.
- `moderate` (upper) + yellow → **modify** (sin fallo, −1-2 accesorios).
- **`move` NO está en v1** (advisory sin mutación lo hace débil) → T3b.

## UI (Home, read-only)
- **Card 1 `#training-advisory`** ("Hoy · plan actual"): sesión + estrés (level/regions) · WHOOP color ·
  carga dura X/Y · recomendación · 2-3 razones · alternativas (2-3) · `según <ruleIds>` · footer
  "Advisory — no cambia tu plan". Etiqueta **"plan actual"**, NO "ideal" (el ideal es T4).
- **Card 2 `#hard-day-budget`**: used/cap + barra (verde/amarillo/rojo) + top sesiones + aviso si alto.
- Render: `renderTrainingAdvisory()` + `renderHardDayBudget()` en `renderHomeView()` (tras recovery hero).
  Ambas con try/catch → si fallan, no rompen el Home.

## Garantías
- **No-mutación:** todas las funciones leen (`wellness/workouts/runs/sessions/WEEK_TEMPLATE/plan`) y
  solo pintan 2 tarjetas. No escriben nada. (T3b/E2 añadirá "aplicar con 1 tap".)
- **Sin falsa precisión:** color WHOOP tal cual; HRV diario no es decisión fuerte (se confía en el
  recovery de WHOOP que ya lo integra); budget = guardrail; `confidence: low` y mensajes honestos si
  faltan datos.
- **Rollback:** revertir el commit (sin cambio de schema; `DB_VERSION` se mantiene ≥10).

## Rule IDs que gobiernan
BUD-001, BUD-002, INT-001/002/004 (latentes hasta T4), HYB-002, READ-003, READ-005, GEN-001 (futuro
con block context). Ver `research/evidence-to-rules.md`.

## Limitaciones v1 (honestas)
- Adapta el **plan actual** (hardcodeado), no un plan ideal evidence-based (eso es T4).
- Interferencia mayormente **latente** (el WEEK_TEMPLATE actual solo tiene gym + carreras Z2).
- Budget **grueso** (sin RIR/soreness; carreras Z2; híbrido raro) → refleja sobre todo días de fuerza.
- Recovery de WHOOP suele venir más tarde en el día → muchas mañanas: keep + confidence baja.
  (v11.58 lo acota: si la app de WHOOP está conectada por OAuth, el dato de hoy se pide directo y la
  mañana deja de ser ciega; si no, la tarjeta dice "Sin dato de hoy" con el motivo. Las tendencias
  7d/28d como respaldo llegaron en el incremento 5 con `computeReadiness` — v11.59, arriba.)

## Roadmap
T3 (esto) → T3b/E2 (aplicar swap con 1 tap) → T4 (Base Plan Engine: plan ideal desde el knowledge base) →
T5 (reemplazar PLAN/WEEK_TEMPLATE) → T6 (periodización por bloque, modality/progression engines).
