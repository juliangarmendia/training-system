# Training Advisory Layer v1 (T3)

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

Tests: `tests/verify-session-classification.mjs`, `tests/verify-advisory-matrix.mjs`,
`tests/verify-coach-wiring.mjs` §12. La ruta directa de WHOOP **no se puede probar contra la API
real** desde los tests: el código devuelve `null` ante cualquier error y nunca lanza.

## Matriz de decisión (conservadora, default = keep)
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
  7d/28d como respaldo llegan en el incremento 5 con `computeReadiness`.)

## Roadmap
T3 (esto) → T3b/E2 (aplicar swap con 1 tap) → T4 (Base Plan Engine: plan ideal desde el knowledge base) →
T5 (reemplazar PLAN/WEEK_TEMPLATE) → T6 (periodización por bloque, modality/progression engines).
