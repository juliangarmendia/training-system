# D1 — Data Unlock Foundation (implementación)

Ejecución del Camino A. **Solo capa de datos** (extracción, limpieza, dedup, captura, flags).
NO se tocó el generador, `PLAN`, `WEEK_TEMPLATE`, ni se creó lógica de programación. Versión v11.9.

## 1. Intervals — extracción de actividades (IMPLEMENTADO)
`app/app.js › intervalsIcuSync()`:
- **Logger de claves de una sola vez** (`intervalsIcuSync._keyLogDone`): registra en consola el set
  completo de claves que la API de actividades de intervals.icu devuelve en producción. **Propósito:
  confirmar los nombres reales de los campos antes de fiarnos de ellos** (sin asumir). Revisar la
  consola una vez tras un sync y ajustar los mapeos si difieren.
- **Campos nuevos en cada `run`** (aditivos, null-safe): `sport`, `intensityLabel` (`icu_intensity`),
  `trainingLoad` (`icu_training_load`), `decoupling`, `efficiencyFactor` (`icu_efficiency`),
  `hrZoneTimes` (`icu_hr_zone_times` | `icu_zone_times`), `gapPace` (grade-adjusted, de `gap`).
- **Estado honesto:** los nombres son best-effort contra la API; `decoupling`/`hrZoneTimes` pueden
  llegar como `null` hasta confirmar con el key-log. `dataAvailability()` los marca `missing` si no
  llegan, así el motor nunca asume.

## 2. Dedup Coros/Strava/Intervals (IMPLEMENTADO + VALIDADO)
`app/app.js`:
- **Fuente canónica: intervals.icu** (`rank` 3) > Strava (2) > manual/desconocido (1, siempre se
  conserva). `dedupeRuns(runs)` es **puro y no destructivo** (no borra del store).
- **Regla de dedup** (`_runsAreSameActivity`): misma actividad si **misma fecha + mismo sport +
  distancia ±0.3 km + duración ±3 min**. Edge cases: una carrera manual sin match siempre se
  conserva; si colisionan, se conserva la de mayor rank y se hereda el `feel` manual si el canónico
  no lo tiene.
- **Accesor deduped**: `getRunsDeduped()`. **Aplicado** en el stat visible de km semanales
  (`renderWeekBanner`, antes `dbGetAll('runs')`). Export/backup y `fixCollection` siguen usando
  `dbGetAll` crudo (no perder datos).
- **Validación**: `validateRunDedup()` corre tras cada sync de intervals y loguea
  `{raw, deduped, duplicatesRemoved}`. **Así se verifica el doble conteo con datos reales** antes de
  migrar el resto de agregaciones. (Migración pendiente documentada abajo.)

### Sitios de agregación a migrar a `getRunsDeduped()` (D1b, tras validar con datos)
`dbGetAll('runs')` se usa en ~20 sitios. Sólo importan los que **suman volumen/distancia/carga**:
`renderWeekBanner` (hecho), y revisar: líneas ~2221, ~6094, ~6397, ~7543, ~7733. Los de **fecha-set**
(streak ~1288) y **listas de display** no causan doble conteo (dedup es cosmético allí). **Export
(~8009) y fixCollection (~864) deben quedar crudos.**

## 3. Subjective check-in (DISEÑADO — no implementado, según lo aprobado)
Captura mínima, 3 toques, no pesada. Reusa el store `wellness` (ya tiene los campos
`soreness/fatigue/mood/motivation` definidos) + un nuevo store/registro diario propio del PWA para no
depender de intervals.

| Campo | Tipo | Obligatorio | Uso | Reglas que desbloquea |
|---|---|---|---|---|
| `subjReadiness` | 1-5 | **Obligatorio** (pre-sesión o diario) | Señal subjetiva primaria | READ-002/005/007 |
| `soreness` | 1-5 | **Obligatorio** | Modificador de carga; flag de fatiga local | READ-002, LOAD-003 |
| `energy` | 1-5 | Opcional (ya existe en `nutrition`) | Confirmación multi-señal | READ-005 |
| `pain` | 0=no / 1-5 + zona | Condicional (solo si marca que hay) | Gate de seguridad; variante/ROM | LOAD-002/003 |
| `motivation` | 1-5 | Opcional | Contexto de adherencia | — |
| `RIR` por set | num | Opcional | Redundante con RPE; solo si lo prefiere | STR-004 (ya cubierto por RPE) |

- **Anti-fatiga de UX:** un widget de 3 toques (readiness, soreness, +pain si aplica) al abrir la app
  o iniciar sesión; defaults razonables; **nunca bloquea el flujo**; si no se llena, el motor degrada
  con gracia (usa wearable + rendimiento). RIR queda fuera por defecto (ya hay RPE).
- **Almacenamiento propuesto:** store `checkins` (keyPath `date`) o reutilizar `wellness` con
  `source:'manual'`. Decisión para D1b/implementación.

## 4. Bodyweight reliability (IMPLEMENTADO — ya parcial + mejora)
- **Ya existía** (`app/whoop.js`): sólo persiste pesajes reales (`tempWeight` → `measured:true`); los
  forward-fills de Apple Health sólo se guardan si son "new signal" y nunca pisan un log manual.
- **Mejora D1** (`app/app.js › renderBodyWeightInsights`): la **regresión de rate-of-loss usa solo
  `measured:true`** (fallback a todos si <4 pesajes reales en 30d). Antes incluía forward-fills que
  aplanaban la pendiente.
- **Body fat (Wyze):** `dataAvailability().bodyFat` marcado `quality:'noisy', note:'trend only,
  never a decision'`. Nunca driver automático.
- **Weigh-in manual** = fuente más fiable; el nudge de "X días sin pesarte" ya existe.

## 5. Data availability flags (IMPLEMENTADO)
`app/app.js › dataAvailability()` — async, **puro, sin score ni dosis**. Devuelve por campo:
`status: available | missing | stale` (+ `ageDays`, `quality:'noisy'`, `derived:true`, `source`,
`note`). Cubre sleep, RHR, HRV, recovery, CTL, ATL, bodyweight (measured-only), bodyFat, runs,
decoupling, hrZoneTimes, workouts, y marca explícitamente `soreness/pain/subjReadiness` como
`missing` (check-in no implementado). **Este es el contrato que E1 leerá para no asumir inputs.**

## 6. No false precision (RESPETADO)
No se creó ningún score, readiness engine, hard-day budget ni cálculo de dosis. Solo datos limpios +
flags + dedup + extracción.

---

## Campos de datos DESBLOQUEADOS (tras D1)
- Por actividad: `sport`, `intensityLabel`, `trainingLoad`, `decoupling`*, `efficiencyFactor`,
  `hrZoneTimes`*, `gapPace` (*sujetos a confirmación por key-log).
- Volumen de carrera **sin doble conteo** (getRunsDeduped).
- Tendencia de peso **honesta** (measured-only).
- Contrato de disponibilidad (`dataAvailability()`).

## Campos que SIGUEN no disponibles
- `soreness / pain / subjReadiness` → check-in diseñado, no implementado.
- `decoupling / hrZoneTimes` → **condicional**: implementado el parseo, pero confirmar que intervals
  los devuelve (revisar key-log de producción). Si no, requieren el stream endpoint.
- RIR → no se captura (RPE sí; se considera redundante).

## Cómo se validó que no hay doble conteo
`validateRunDedup()` corre tras cada sync y loguea `{raw, deduped, duplicatesRemoved}`. Con datos
reales esto cuantifica los pares duplicados Strava↔intervals. La regla se probó lógicamente:
mismo día + sport + ±0.3 km + ±3 min colapsa; distinto día o deporte no. **Verificación en vivo
pendiente:** revisar el log tras un sync en el iPhone.

## Qué queda listo para E1
- **Readiness Engine v1 (advisory):** sleep, RHR, recovery flag, CTL, ATL, workouts, RPE → todos
  `available` vía `dataAvailability()`. Suficiente para un v1 trend-based de sugerencia.
- **Hard-Day Budget v1 (coarse):** tipo de sesión (gym/run), km deduped, RPE, training load → clasif.
  gruesa duro/fácil viable.

## Qué sigue bloqueado
- Clasificación fina threshold/interval e híbrido → depende de confirmar `intensityLabel`/`hrZoneTimes`.
- Modificadores de soreness/pain/readiness → check-in (diseñado, no implementado).
- ATH-002 velocity loss → requiere dispositivo (no existe).

## Verificación de no-regresión (pendiente en iPhone)
Cambios aditivos + 1 cambio localizado en la regresión de peso. **Requiere prueba en el iPhone PWA:**
(1) abrir app → sync intervals → revisar consola (`available activity keys`, `run dedup check`);
(2) confirmar que el stat de km semanales y el ETA de peso siguen correctos. `node --check` pasó.

## Confirmación
✅ NO se tocó el generador, `PLAN` ni `WEEK_TEMPLATE`. ✅ NO lógica de programación. ✅ NO rutina.
✅ NO scores/dosis. Cambios: `app/app.js` (extracción, helpers, peso), `app/sw.js` (cache v11.9),
`app/index.html` (version v11.9).
