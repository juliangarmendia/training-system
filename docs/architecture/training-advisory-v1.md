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
- `getWhoopContext()` → `{color:'green'|'yellow'|'red'|'unknown', score, sleepHrs, hrv, rhr}`. Usa el
  recovery de WHOOP **tal cual** (READ-003); `null`/sin datos → `unknown`. **No usa strain/stress** (no
  llegan por el proxy intervals.icu).
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

## Matriz de decisión (conservadora, default = keep)
Solo se sale de `keep` con **confirmación multi-señal** (≥2 concordantes, READ-002):
- rest / `easy` / recovery → **keep** siempre.
- WHOOP `unknown`/null → **keep**, `confidence: low` (no inventar).
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

## Roadmap
T3 (esto) → T3b/E2 (aplicar swap con 1 tap) → T4 (Base Plan Engine: plan ideal desde el knowledge base) →
T5 (reemplazar PLAN/WEEK_TEMPLATE) → T6 (periodización por bloque, modality/progression engines).
