# Ideal Plan Engine — v1 (Preview)

**Frase guía:** build the ideal evidence-based weekly plan for results, then adapt it intelligently
based on real recovery, load, equipment, and constraints.

T4 v1 = **preview read-only**. La semana ideal está **encodeada como DATA** (`IDEAL_BLOCK_V1` en
`app/app.js`), derivada de la evidencia y trazada a Rule IDs. Se muestra al lado del plan actual.
**No** toca `PLAN`/`WEEK_TEMPLATE`/generador/logs; "Aplicar" está inerte (→ T5). Este doc es además la
**spec del generador algorítmico** (T4b) y del **loop de adaptación** (T6).

## Bloque v1
- **Objetivo:** recomposición atlética + base aeróbica + mantenimiento de fuerza. 5 semanas (4 build +
  1 deload, LOAD-004).
- **Progresa:** base aeróbica / running. **Mantiene:** fuerza pesada (2×/patrón), hipertrofia útil,
  movilidad/athleticism. Déficit moderado en paralelo (REC-001/002).
- **Arco de running:** S1 2×Z2 25-30' → S4 1 largo Z2 45-50' + 1 Z2/Z3 → S5 deload (END-003/004/005).

## Lógica de generación (cómo se deriva del knowledge base)
1. **Objetivo dominante (GEN-001):** una cualidad progresa, el resto se mantiene. v1 fijo; T4b lo
   elige desde goals + historial.
2. **Estructura semanal:** fuerza 2×/patrón (STR-002) con ≥1 slot pesado (STR-005); cardio mayormente
   fácil ~80/20 (END-001); intervals ≤1/sem (END-004); recovery 1-2 días.
3. **Hard-day budget (BUD-001/002):** suma de `budgetWeight` (de `SESSION_TYPES`) ≤ ~6. Si una variante
   excede, se baja la intensidad del 2º cardio o se quita un día duro.
4. **Interferencia (INT-001/002/004, HYB-002):** pierna pesada en fresco; no correr fuerte <24 h antes
   de pierna; bici/remo/ski cuando hay impacto/fatiga de tren inferior; híbrido nunca el mismo día que
   pierna y cuenta como duro; potencia solo fresca.
5. **Variantes 3/4/5 días:** mínima (preserva fuerza pesada + mínimo aeróbico), estándar (2 fuerza + 2
   cardio), óptima (3 fuerza + 2 cardio + microdosis movilidad). Budgets: 4.5 / 4.5 / 5.5.
6. **Duración 45/60/75:** `core` (compuestos + 1-2 accesorios), `standard` (sesión completa), `extra`
   (+ accesorios + movilidad/finisher).
7. **Hybrid/athleticism:** HYB-001 (0-1/sem, en lugar de un cardio, no además), HYB-003 (baja skill);
   ATH-001/002/003 (plyo/power/core en microdosis, fresco).

## Alternativas y equipo
- Por día: `ALT_LIBRARY` (T3) por family + situación (low readiness / gym lleno / fatiga / tiempo /
  equipo), con razón + Rule IDs.
- `EQUIP_SUBS`: sin SkiErg→row/bici/incline-walk; sin sled→carries/incline-push/leg-press/bike-int;
  sin rack→máquinas/DB/Smith/leg-press; gym lleno→DB-only/máquinas/cardio.

## UI
`renderIdealPreview()` (vista `#view-ideal-preview`, abierta desde Settings → "Ver plan ideal"):
objetivo del bloque, toggles 3/4/5 días y 45/60/75', semana ideal (día · tipo · nivel · duración · por
qué · alternativas), plan actual al lado, hard-day budget X/6, cuidados que respeta, sustituciones de
equipo, y botón "Aplicar" **deshabilitado** (T5). Lenguaje plano; sin Rule IDs en pantalla.

## No-mutación
Solo lee `activeWeekTemplate`/`activePlan` para el lado "actual". No escribe plan/sesiones/logs. Rollback
= revertir commit (sin cambio de schema).

## Adaptación semana-a-semana (spec para T6, NO implementado en T4)
Mirar: adherencia, sesiones completadas, RPE, fuerza, km/semana, WHOOP recovery trend, hard-day budget,
peso/fat-loss. Ajustar: subir running ~10%/sem si la base aguanta; mantener fuerza; bajar volumen si muy
cargado; cambiar modalidad si hay impacto; mover/quitar híbrido; deload si corresponde. **Nunca progresar
todo a la vez** (GEN-001). Todo con aprobación (no auto-mutación).

## Roadmap
- **T4b:** generador algorítmico (arma bloque/semana desde reglas+perfil en runtime).
- **T5:** aplicar el plan ideal (reemplazar `WEEK_TEMPLATE`/`PLAN` con confirmación, versionado).
- **T6:** loop de adaptación semanal + periodización multi-bloque + progression/modality engines.
