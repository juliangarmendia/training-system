---
description: RETIRADO (2026-09-07). El coach semanal vive dentro de la app; para un informe en el repo, usar /coach-deep-dive.
---

# Weekly Review — retirado el 2026-09-07

Este playbook queda **sin uso**. Lo sustituyen dos cosas:

- **El coach semanal ahora corre dentro de la app** (incremento 9, v11.61): la PWA construye el facts
  pack (`app/coach-facts.js`), la edge function `coach-weekly-review` (Opus 5) devuelve briefing,
  decisiones y **propuesta de plan**, y Julian la aprueba o la rechaza con un toque. La revisión vive
  en la tabla `coach_reviews`, no en `tracking/weekly-reviews/latest.json`.
- **Para una lectura profunda o un informe en el repo:** [`/coach-deep-dive`](./coach-deep-dive.md) —
  manual, lee `coach_reviews` y los stores por MCP y escribe **sólo prosa** en `tracking/`.

**Por qué se retira** y no sólo se corrige: el audit del 2026-09-05 encontró que este texto razonaba
sobre un plan que ya no existía. Aplicaba umbrales de TSB a `rampRate`, que es otra magnitud y nunca
podía dispararlos (F-2); trataba CTL/ATL como carga total en un programa de cuatro días de fuerza que
intervals.icu no ve (F-3); tenía los días de pierna **invertidos**, el deload en "semana 5 o 9" del
programa de abril y el techo de Z2 en 140 frente a 143 (F-9); y su prescripción de kg moría en una
tarjeta de Stats sin llegar nunca al rack (F-4). Las cuatro correcciones viven hoy en el prompt de la
edge function (`supabase/functions/coach-weekly-review/prompt.ts`) y en el facts pack determinista.

Contexto: [`../../docs/architecture/coach-v2-implementation-plan.md`](../../docs/architecture/coach-v2-implementation-plan.md)
(§A.3, §A.8) · [`../../docs/architecture/coach-facts-schema.md`](../../docs/architecture/coach-facts-schema.md)
· [`../../docs/architecture/plan-v2-schema.md`](../../docs/architecture/plan-v2-schema.md).
`latest.json` y los 22 informes de `tracking/weekly-reviews/` se conservan como histórico.
