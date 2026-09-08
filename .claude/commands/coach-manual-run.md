---
description: Revisión semanal del coach hecha A MANO (sin API) — misma salida que la función, validada con el mismo validador, escrita como fila `proposed` en coach_reviews para que Julian la aplique en la app.
---

# /coach-manual-run — el coach de la semana, a mano

**Cuándo.** Cuando Julian pide explícitamente que la revisión de la semana la haga Claude en la
sesión en vez de la función `coach-weekly-review` (primera vez: W37, 2026-09-09, "el coach de esta
semana córrelo tú, no por API"). No sustituye a la función: es el mismo trabajo por otro camino.

**Qué produce.** Una fila en `coach_reviews` con `record_id = '{weekKey}#{attempt}'`, `status:
'proposed'`, el `output` del contrato v2 (`briefing`, `decisions`, `proposal`, `requestedData`),
`guardrails` calculados por `validatePlanVersion`, y las marcas `usage.source: 'manual'` y
`prompt.model: 'manual-claude'`. La app la enseña en Home como cualquier propuesta; **aplicarla sigue
siendo el toque de Julian**. Además, la lectura larga en `tracking/weekly-reviews/{weekKey}-deep-dive.md`.

**Qué NO hace.** No escribe `plans`, `decisions`, `settings` ni ningún otro store. No despliega nada.
(El skill `/coach-deep-dive` es sólo lectura y prohíbe escribir `coach_reviews`; este comando es la
excepción explícita, sólo bajo petición de Julian.)

## Procedimiento

1. **Datos por SQL (MCP `execute_sql`)**, agregados para no arrastrar blobs: top sets por ejercicio y
   fecha (`workouts.data.exercises[].sets[]` con `weight/reps/rpe/done`; los recientes traen
   `data.readout`), carreras dedupeadas (`runs` + `sessions`), `bodyweight` (la referencia es
   `source:'withings'`), `wellness` 28 días (`readiness`, `hrv`, `restingHR`, `sleepSecs`,
   `readinessSource`), `nutrition` (días registrados), `decisions`, el plan activo (`plans` con mayor
   `version`: `sessions`, `weekTemplate` con `session` por `dow`), `settings/userSettings`
   (`goals`, `idealVariant`, `deloadAnchorDate`, `icuZones.z.zone2[1]`).
2. **Análisis en el orden del prompt** (`supabase/functions/coach-weekly-review/prompt.ts`): posición
   en el bloque → gates de suficiencia → recuperación como información → adherencia → rendimiento
   primero → recorrido → propuesta. Reglas sólo del corpus (`research/evidence-to-rules.md`).
3. **Redactar el `output` en inglés** conforme a `schema.ts` (cabeceras markdown literales: `## What
   happened`, `## Previous decisions`, `## What I am changing — max 3 priorities`, `## Why it changes`,
   `## Why it holds`, `## What I am watching`, `## What I need from you`; `weekSummary` con UNA fila por
   sesión del plan; `sessions` sólo las que cambian, con `target` por ejercicio). Las decisiones de
   nutrición llevan `evidence.numbers.proteinG/kcalTraining/kcalRest` (es lo que lee `PROTEIN-FLOOR`).
4. **Validar como la función**: el script de la primera ejecución está en
   `C:/Users/julia/.claude/jobs/ae40ffa4/tmp/manual-review.mjs` (plantilla; copiarlo al job actual).
   Lee la clave `service_role` con `supabase projects api-keys --project-ref … -o json` **en memoria**,
   importa `coach-weekly-review/coach-facts.generated.js` como `.mjs`, hace `mergeProposal(plan,
   proposal)` + `validatePlanVersion(candidate, ctx)` con el `ctx` de `index.ts` (`variant`,
   `libraryIds`, `lowerSessionIds`, `block`, `bodyweightKg`, `zones`, `goals`, `decisions`,
   `briefing`, `todayStr`) y aborta si hay `hard`. **`facts.lifts[exId].sessions[0].topKg` es
   obligatorio** para cada ejercicio con `target.kg`: sin historial, `LOAD-JUMP` es duro.
5. **`--write`** sólo con 0 duros: upsert por PostgREST (`on_conflict=user_id,record_id`) con
   `facts.plan.version` = versión activa (así la app no avisa de base obsoleta).
6. **Deep-dive + tracking** (`weekly-reviews/{weekKey}-deep-dive.md`, resumen arriba de
   `weekly-checkins.md`, fila en `progress-log.md`) y commit de `tracking/`.

## Lecciones de W37

- El validador cazó dos cosas reales en la primera pasada: 5 `LOAD-JUMP` (pack sin `lifts`) y
  `VOL-CAP` (la semilla etiqueta el box jump como Quads: 16 series contra 14). Se corrigió la propuesta,
  no el validador.
- `CTL-FOR-STRENGTH` salta con "ATL" en una decisión de recuperación: escribir "carga de entrenamiento".
- Los avisos `MOBILITY-FLOOR` y `HARD-BUDGET` son de la plantilla de 6 días; se aceptan y se dicen.
