# Personal Training System — instrucciones para agentes

> **`CLAUDE.md` es la fuente de verdad. Léelo antes de actuar.** Este archivo existe solo para
> los agentes que buscan `AGENTS.md` por convención, y se mantiene deliberadamente corto para que
> no pueda volver a divergir.
>
> **Historial:** hasta 2026-08-16 este archivo era una copia del `CLAUDE.md` **viejo** y afirmaba
> lo contrario que el vigente — decía *"running as a secondary modality"* cuando el sistema pasó
> a tratar el cardio como **cualidad co-igual**. Dos agentes leían filosofías opuestas. Por eso
> ahora es un puntero y no una copia (ver
> [`assessments/2026-08-16_system-audit.md`](assessments/2026-08-16_system-audit.md), §4).

## Qué leer, en orden

| Necesitas | Archivo |
|---|---|
| Qué es el sistema y cómo comportarte | [`CLAUDE.md`](CLAUDE.md) |
| Reglas de programación (fuente de verdad, por Rule ID) | [`research/evidence-to-rules.md`](research/evidence-to-rules.md) |
| Qué literatura gobierna qué decisión | [`research/corpus-map.md`](research/corpus-map.md) |
| Qué regla puede gobernar código y con qué guardrail | [`research/rule-readiness.md`](research/rule-readiness.md) |
| Arquitectura de motores y schemas | [`docs/architecture/`](docs/architecture/) |
| Reglas operativas de programación y de datos | [`.claude/rules/`](.claude/rules/) |
| Estado real del sistema y decisiones abiertas | [`assessments/2026-08-16_system-audit.md`](assessments/2026-08-16_system-audit.md) |

## Lo mínimo que no puedes ignorar

- Es un sistema de **recomposición atlética híbrida basada en evidencia** para un adulto entrenado.
  **Cardio y carrera son cualidades entrenables co-iguales**, no una modalidad subordinada.
- Su trabajo central es **asignar recursos bajo interferencia y restricciones de recuperación**: no
  se puede maximizar todo a la vez.
- **Cita Rule IDs** (`STR-002`, `INT-001`…) en vez de re-derivar la evidencia. Si un cambio no
  traza a una regla, di que es juicio propio.
- **No inventes datos.** Ni pesos, ni calorías, ni cargas. Si el dato falta, dilo.
- No cambies el plan sin documentar por qué.
- Recuperación y adherencia son restricciones de primera clase.
- Sin relleno motivacional. Directo, crítico, específico.

## Estado actual (2026-08-16)

Dos cosas que cualquier agente debe saber antes de proponer nada:

1. **El espejo de datos en Supabase está apagado desde ~2026-06-30.** No hay workouts desde el
   25-jun. Cualquier cifra "actual" sobre peso, cargas o adherencia sería inventada.
2. **El deload programado no se dispara desde mayo** (`isDeloadWeek` sigue anclado al programa de
   abril). Está documentado como decisión abierta, no arreglado.
