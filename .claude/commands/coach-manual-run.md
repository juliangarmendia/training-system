---
description: Revisión semanal del coach hecha A MANO (sin API) — el mismo pack, el mismo prompt y el mismo validador que la función; la fila `requested` que deja "Cerrar la semana" en modo manual pasa a `proposed` y Julian la aplica en la app.
---

# /coach-manual-run — el coach de la semana, a mano

**Cuándo.** Cuando la app está en **modo manual** (Ajustes › Weekly coach › "Who writes the weekly
review" = Manual) y Julian ha pulsado "Close the week and ask for the next", o cuando pide
explícitamente que la revisión la haga Claude en la sesión en vez de la función `coach-weekly-review`
(primera vez: W37, 2026-09-09). No sustituye a la función: es **el mismo trabajo por otro camino**, y
el script del repo existe para que sea el mismo de verdad.

**Qué produce.** La fila de la semana en `coach_reviews` con `status: 'proposed'`, el `output` del
contrato v2 (`briefing`, `decisions`, `proposal`, `requestedData`), `guardrails` del validador de la
función, y las marcas `usage.source: 'manual'` / `prompt.model: 'manual-claude'`. La app la enseña en
Home igual que una de la función; **aplicarla sigue siendo el toque de Julian**. Además, la lectura
larga en castellano en `tracking/weekly-reviews/{weekKey}-deep-dive.md`.

**Qué NO hace.** No escribe `plans`, `decisions` ni `settings`. No despliega nada. (El skill
`/coach-deep-dive` es sólo lectura y prohíbe escribir `coach_reviews`; este comando es la excepción
explícita, sólo bajo petición de Julian o con una fila `requested` suya.)

## El camino (script del repo: `scripts/coach-manual-review.mjs`)

Node ≥ 23 (importa `prompt.ts` sin compilar). La `service_role` se lee **en memoria** con la CLI de
Supabase (`supabase projects api-keys`), nunca se imprime ni se guarda.

1. **¿Hay semana cerrada esperando?** `node scripts/coach-manual-review.mjs pending` lista las filas
   `requested` (las deja la app en modo manual con `facts` + `request{currentPlan, allowed,
   priorReviews, lowerSessionIds}`: exactamente el body que viajaría a la función).
2. **El pack y el prompt.** `node scripts/coach-manual-review.mjs pack --week 2026-W38` escribe en
   `%TEMP%/coach-manual/2026-W38/` tres ficheros: `pack.json`, `prompt.md` (SYSTEM_STATIC + bloque
   dinámico + mensaje de usuario, byte a byte lo que leería el modelo) y `output.template.json`.
   Sin fila `requested`: `--facts fichero.json` (el JSON de Ajustes › "Export facts JSON") o
   `--row 2026-W38#1` (usa los `facts` de esa fila); el plan y el vocabulario salen de `plans` y
   `exercises` con las mismas reglas que `_coachCurrentPlan` / `_coachAllowed`.
3. **Leer `prompt.md` entero y hacer el trabajo del coach**: en el orden del procedimiento
   (posición en el bloque → gates → rendimiento primero → recorrido → adherencia → propuesta), con
   la **voz** que pide el prompt (veredicto primero, segunda persona, cada número una vez, ≤900 /
   ≤1.400 caracteres, opinión explícita) y sólo Rule IDs del corpus. Escribir `output.json` en ese
   directorio siguiendo `output.template.json`. Las decisiones de nutrición llevan
   `evidence.numbers.proteinG/kcalTraining/kcalRest` (es lo que lee `PROTEIN-FLOOR`); cada ejercicio
   con `target.kg` necesita historial en `facts.lifts[id].sessions[0].topKg` (si no, `LOAD-JUMP`).
4. **Validar como la función.** `node scripts/coach-manual-review.mjs validate --week 2026-W38
   --output <dir>/output.json` pasa el contrato (cabeceras literales, 3 prioridades, una fila de
   `weekSummary` por sesión, ids ∈ allowed, Rule IDs ∈ corpus, longitudes) y `validatePlanVersion`
   con el mismo `ctx` que `runGuardrails` en `index.ts`. Corregir la propuesta hasta 0 duros; los
   avisos de voz se anotan en `sanitized`.
5. **Escribir.** `node scripts/coach-manual-review.mjs write --week 2026-W38 --output <dir>/output.json`
   hace el upsert idempotente por `(user_id, record_id)` sobre la fila `requested` (mismo id, así un
   "Regenerate" posterior es el intento siguiente). `--allow-hard` sólo si Julian lo decide.
6. **Deep-dive + tracking.** `tracking/weekly-reviews/{weekKey}-deep-dive.md`, resumen arriba de
   `tracking/weekly-checkins.md`, fila en `tracking/progress-log.md`. Commit de `tracking/`.

## Lecciones (W37, 2026-09-09)

- El validador cazó dos cosas reales en la primera pasada: 5 `LOAD-JUMP` (pack sin `lifts`) y
  `VOL-CAP` (la semilla etiqueta el box jump como Quads: 16 series contra 14). Se corrigió la
  propuesta, no el validador.
- `CTL-FOR-STRENGTH` salta con "ATL" en una decisión de recuperación: escribir "carga de entrenamiento".
- Los avisos `MOBILITY-FLOOR` y `HARD-BUDGET` son de la plantilla de 6 días; se aceptan y se dicen.
- La primera revisión era correcta y era un informe (cada sección repetía las mismas series). Julian:
  "conciso pero thoughtful, como haría un coach profesional". De ahí el bloque VOZ del prompt y los
  avisos de longitud en `sanitized`.
