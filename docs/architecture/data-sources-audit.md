# Operational Data Sources Audit

Auditoría de **qué datos reales ingiere hoy el sistema** (inspeccionado en código, no asumido).
Fuentes verificadas: `app/whoop.js`, `app/strava.js`, `app/app.js`, `app/supabase-sync.js`,
`supabase/functions/{whoop-auth,strava-sync,steps-ingest}/`. Fecha: 2026-06-23.

## Hallazgo de arquitectura (importante)

**`intervals.icu` es el hub de datos**, no un input más:
- **Whoop → intervals.icu wellness → app** (ruta primaria, sin OAuth; el OAuth directo a Whoop es
  legacy/fallback marcado para borrar). Endpoint: `/api/v1/athlete/{id}/wellness`.
- **Coros PACE → Strava (auto-sync) → app** (`strava-sync`) **y** **Coros → Strava → intervals.icu →
  app** (dos rutas que traen las mismas carreras; dedup last-write-wins por `_updated_at`).
- **Apple Health NO tiene integración directa** (sin HealthKit). Steps/peso entran vía el companion
  iOS de intervals.icu, con fallback de iOS Shortcut → `steps-ingest`.
- **CTL/ATL/rampRate llegan PRE-COMPUTADOS** desde intervals.icu (no se calculan en cliente).

Implicación: la fiabilidad del sistema depende de la cadena Whoop/Coros → intervals.icu. Si el
companion de Apple Health falla, el peso se degrada a forward-fills (ver caveats).

---

## 1. Whoop (vía intervals.icu wellness) — store IDB `wellness`

| Campo | Clasificación | Nota |
|---|---|---|
| `readiness` (recovery score 0-100) | available | Flag verde/amarillo/rojo (READ-003), no dosis |
| `hrv` (ms) + `hrvSDNN` | available | HRV de **sueño** (Whoop), no RMSSD matinal — usar como tendencia |
| `restingHR` (+ `restingHRMeasured`) | available | Tendencia |
| `sleepSecs` (duración) | available | Input directo a readiness |
| `sleepScore` (0-100) | available | Calidad de sueño |
| `respiration` | available | Estable |
| `spO2` | available_but_noisy | No usar para decisiones de entreno |
| `avgSleepingHR` | available | Contexto |
| `weight` / `weightMeasured` | available_but_noisy | `weight`=forward-fill, `weightMeasured`=real (flag `measured`) |
| `bodyFat` | manual_only | Solo si se loguea en intervals (Wyze o similar) |
| `abdomen` (cm) | manual_only | Solo si se loguea |
| `ctl` (Fitness) / `atl` (Fatigue) / `rampRate` | **available (pre-computado)** | **Crítico** para carga/periodización |
| `fatigue/soreness/stress/mood/motivation` (1-5) | manual_only / unavailable_in_practice | Campos existen pero **el usuario no los rellena** (vienen de intervals, suelen ser null) |
| sleep stages (REM/deep) | not_reliable_for_decisions | Solo en ruta OAuth legacy; null en ruta intervals |
| `skinTemp` | unavailable | Solo legacy |
| rolling averages / trends | derived_possible | No se computan en cliente (salvo CTL/ATL que vienen ya hechos) |

## 2. Coros (vía Strava) y 3. intervals.icu activities — store IDB `runs`

| Campo | Clasificación | Nota |
|---|---|---|
| `distance` (km) | available | |
| `duration` (min) | available | |
| `avgHR` / `maxHR` | available | Solo si el reloj registró HR |
| `avgPace` | available_but_noisy | Calculado de moving_time/distance; no ajusta terreno/pausas |
| `name` / `notes` | available | |
| `feel` | manual_only | Suele null (no se rellena tras sync automático) |
| **cadence** | **unavailable** | No se extrae de Strava/intervals |
| **elevation / gain** | **unavailable** | No se extrae |
| **HR zones / time-in-zone** | **unavailable** | No se extrae |
| **decoupling / HR drift** | **unavailable** (derived_possible) | No se calcula; END-005 lo asume pero **no existe el dato hoy** |
| **splits / pace zones** | **unavailable** | |
| `icu_intensity` (easy/threshold) | derived_possible | intervals lo expone; el app **no lo extrae** aún |

> ⚠️ **Riesgo de duplicación:** la misma carrera de Coros llega por Strava (`strava_{id}`) y por
> intervals (`icu_{id}`) con IDs distintos → posible doble conteo de volumen/carga si no se dedup por
> fecha+distancia. Hoy el dedup es por `source_id`, que **no** colisiona entre fuentes.

## 4. Apple Health — sin integración directa

| Campo | Clasificación | Nota |
|---|---|---|
| steps | available (vía intervals companion) + manual_only (Shortcut) | store `steps` |
| weight | available_but_noisy (vía intervals proxy) | forward-fills no fiables |
| HR / energy | unavailable | No se importa directo |
| sleep | (duplicado de Whoop vía intervals) | Riesgo de duplicación con Whoop |

## 5. Workout logs — store IDB `workouts`

| Campo | Clasificación | Nota |
|---|---|---|
| `date, session, sessionName, week, planVersion, unit` | available | |
| `exercises[].sets[].{weight, reps, rpe, done}` | available | **RPE sí; RIR NO** se captura |
| `note` (por ejercicio), `notes` (sesión) | manual_only | Texto libre |
| `quality` (1-5) | available | Rating de sesión al finalizar |
| `duration`, `startTime`, `blockTimings` | available | |
| **RIR por set** | **unavailable** | Solo RPE |
| **soreness / pain / dolor articular** | **unavailable** | No se captura en ningún lado del workout |
| **subjective readiness pre-sesión** | **unavailable** | No existe input |
| **sesión saltada / missed** | **unavailable** | Solo se guardan completadas; ausencia = inferencia |
| **exercise swap history** | unavailable | Solo el ejercicio final |

## 6. Derived strength (calculado on-demand, no almacenado)

| Dato | Clasificación | Función |
|---|---|---|
| e1RM por ejercicio | derived_possible | `estimate1RM(weight, reps)` |
| PRs | derived_possible | `detectPRs()` al finalizar workout |
| Volumen semanal por músculo | derived_possible | `renderWeeklySummary()` (DB cuenta ×2) |
| Última fecha por patrón de movimiento | derived_possible | Filtrado de workouts |
| Fatigue/readiness score compuesto | derived_possible | 6 factores (frecuencia, quality, energy, proteína, RPE medio, + Whoop si conectado) |

## 7. Body metrics — stores `bodyweight`, `wellness`

| Campo | Clasificación | Nota |
|---|---|---|
| `weight` (+ `measured` flag) | available_but_noisy | Manual o intervals proxy; forward-fills marcados `measured:false` |
| weight trend (media móvil 7d) | derived (ya implementado) | Línea suavizada en chart |
| `bodyFat` (Wyze) | manual_only / noisy | Solo si en intervals; ruidoso → solo tendencia |
| `abdomen` (cintura) | manual_only | |
| photos / check-ins | unavailable | No existe |

## 8. Subjetivos — store `nutrition`

| Campo | Clasificación | Nota |
|---|---|---|
| `energy` (1-5) | available (manual) | Tab nutrición |
| `hunger` (1-5) | available (manual) | |
| `alcohol` (count) | available (manual) | |
| `protein` / `meals[]` / `calories` | available (manual) | |
| `fatigue/soreness/stress/mood/motivation` | unavailable_in_practice | Campos en `wellness` pero no se rellenan |

## 9. Equipment — David Lloyd Serrano (inventario asumido disponible)

| Elemento | Disp. | Fuerza | Cardio | Híbrido | Coste fatiga | Sustituciones | Constraints |
|---|---|---|---|---|---|---|---|
| Racks (squat/bench) | available | ✓✓ | — | — | alto (compuestos) | — | Núcleo de fuerza pesada |
| Barras + discos kg | available | ✓✓ | — | ✓ | alto | dumbbells | kg (post-relocación) |
| Dumbbells | available | ✓✓ | — | ✓ | medio | máquinas/barra | Versátil |
| Máquinas (selectorizadas) | available | ✓ | — | — | bajo-medio | libres | Ideal aislamiento + fatiga sistémica alta (SEL-001) |
| Cables | available | ✓ | — | ✓ | bajo | máquinas | Pallof, face pull, chops |
| Treadmill | available | — | ✓✓ | ✓ | medio-alto | outdoor run | Incline para techar HR en calor de Madrid; impacto medio |
| Bike (erg/spin) | available | — | ✓✓ | ✓ | bajo | — | **Default Z2/recovery cuando piernas cargadas** (INT-002) |
| Rower | available | — | ✓ | ✓✓ | medio | ski/bike | Carga lumbar/posterior → evitar post-DL pesado |
| SkiErg | available | — | ✓ | ✓✓ | medio | bike | Upper/core; bueno cuando piernas cargadas (HYB-005) |
| Functional area (turf) | available | — | — | ✓✓ | — | — | Espacio para carries/lunges/saltos |
| Sled | uncertain | ✓ | — | ✓✓ | alto | bike intervals | **Confirmar disponibilidad/turf**; concéntrico puro, bajo DOMS |
| Wall ball / med balls | uncertain | — | — | ✓ | medio | — | **Confirmar**; baja skill |
| Kettlebells | uncertain | ✓ | — | ✓ | medio | dumbbells | Confirmar rango de pesos |
| Movilidad (bandas, foam) | available | — | — | — | 0 | — | Warm-up / recovery |

**Pendiente de confirmar con el usuario:** sled, wall ball, kettlebells (marcados `uncertain`).
El resto sostiene completamente fuerza + cardio indoor + híbrido low-impact.

---

## #3 — Matriz de datos para decisión

| Data field | Source | Available? | Reliability | Noise | Update freq | Direct use | Derived use | Automate? | Suggest-only? | Rules |
|---|---|---|---|---|---|---|---|---|---|---|
| HRV (sleep) | Whoop→intervals | sí | media | alto día / bajo 7d | diario | no (solo) | tendencia 7d | no (solo) | sí | READ-001/004 |
| RHR | Whoop→intervals | sí | media-alta | medio | diario | tendencia | — | no (solo) | sí | READ-001 |
| Recovery score | Whoop→intervals | sí | media | medio | diario | flag | — | parcial (flag) | sí | READ-003 |
| Sleep duration | Whoop→intervals | sí | alta | bajo | diario | **directo** | déficit acumulado | sí | — | READ-006 |
| Sleep score | Whoop→intervals | sí | media | medio | diario | señal | — | no | sí | READ-006 |
| CTL (Fitness) | intervals (pre-comp) | sí | alta | bajo | diario | tendencia carga | — | sí (contexto) | — | BUD-*, LOAD-001 |
| ATL (Fatigue) | intervals (pre-comp) | sí | alta | medio | diario | flag fatiga | TSB=CTL-ATL | sí (flag) | sí | READ-008, BUD-* |
| rampRate / TSB | intervals / derivable | parcial | media | medio | diario | flag | TSB no calculado hoy | parcial | sí | LOAD-001 |
| pace-to-HR | runs (derivable) | no aún | — | — | por carrera | — | progresión aeróbica | no | sí | END-005 |
| HR drift / decoupling | — | **no** | — | — | — | — | requiere splits no extraídos | no | — | END-005 (bloqueado) |
| Zone distribution | — | **no** | — | — | — | — | requiere zonas no extraídas | no | — | END-001 (parcial) |
| Running volume (km/sem) | runs | sí | alta | bajo | por carrera | **directo** | progresión ~10% | sí | — | END-003 |
| Steps | AppleHealth→intervals | sí | media | medio | diario | contexto NEAT | adherencia | no (contexto) | sí | adherencia |
| Bodyweight (measured) | manual/intervals | parcial | media | alto (FF) | irregular | tendencia | rate of loss | no (solo) | sí | REC-002 |
| Body fat (Wyze) | intervals | manual | baja | alto | irregular | — | solo tendencia | no | sí (trend) | REC-002 |
| Workout sets/reps/RPE | app log | sí | alta | bajo | por sesión | **directo** | e1RM, volumen, PR | sí | — | STR-*, progresión |
| RIR | — | **no** | — | — | — | — | — | no | — | STR-004 (usa RPE) |
| Soreness/pain | — | **no** | — | — | — | — | — | no | — | READ/LOAD (bloqueado) |
| Session quality (1-5) | app log | sí | media | medio | por sesión | señal | fatiga compuesta | no | sí | READ-* |
| Energy/hunger (1-5) | app nutrición | sí (manual) | media | medio | diario (si loguea) | señal subjetiva | — | no | sí | READ-005 |

## #4 — Reglas de resolución de conflictos de datos

Principios (alineados con READ-002/005, GEN-002):
1. **Performance + subjetivo > score de wearable.** Whoop verde pero rendimiento real cae 2 sesiones → tratar como fatiga (gana el rendimiento).
2. **Tendencias > valores diarios.** HRV bajo un día pero subjetivo alto + 7d estable → no actuar.
3. **Confirmación multi-señal > una métrica.** intervals dice fatiga alta (ATL↑) pero sueño bueno + rendimiento OK → no degradar; esperar 2ª señal.
4. **Datos faltantes degradan con gracia.** Si falta HRV un día → usar sueño + subjetivo + rendimiento; nunca bloquear la decisión por un hueco.
5. **Sin falsa precisión.** Bodyweight salta por hidratación/sodio → usar media móvil 7d, ignorar el salto diario.
6. **Duplicación Coros/Strava/intervals/AppleHealth:** dedup por (fecha + distancia ± tolerancia), no solo por `source_id`; preferir intervals.icu como fuente canónica de carrera; preferir Whoop para recovery/sueño; steps de una sola fuente.

## #5 — Readiness Engine v1 — viabilidad de inputs

**usable_now** (dato real y fiable hoy):
- sleep duration (`sleepSecs`), sleep score
- RHR (tendencia)
- recovery score (`readiness`) como flag
- CTL / ATL (carga/fatiga pre-computada)
- completed sessions + tipo (de `workouts`)
- hard sessions esta semana (clasificable desde workouts/runs)
- RPE medio reciente
- energy/hunger subjetivos **si el usuario los loguea**

**usable_if_derived** (calculable con lo que hay):
- HRV rolling 7d (hoy llega diario; derivar media móvil)
- TSB = CTL − ATL (no se calcula hoy, trivial de derivar)
- hard-day budget points (clasificar sesiones por tipo)
- rate of loss (de bodyweight measured + media 7d)

**useful_later** (requiere dato no disponible aún):
- pace-to-HR, HR drift/decoupling (requiere splits/zonas no extraídos de runs)
- zone distribution semanal (requiere zonas)
- modelado de injury risk

**not_reliable** (no usar como dosis):
- body fat diario, HRV de un solo día, recovery score como número exacto, forward-fills de peso

## #6 — Hard-Day Budget v1 — viabilidad de inputs

**Calculable hoy** (de `workouts` + `runs` + `wellness`):
- tipo de sesión completada (gym vs run; upper/lower por `session`/exerciseIds)
- clasificación lower/upper (de exerciseIds + movementPattern)
- duración, RPE (proxy de intensidad; RIR no existe)
- modalidad cardio (de `runs.source` / futuro modality)
- running distance (km)
- training load (CTL/ATL como contexto)
- flag de pierna pesada (lower + RPE alto + compound)

**Requiere metadata futura / no disponible hoy:**
- clasificación automática threshold/interval (no hay zonas/intensidad de carrera)
- flag híbrido (no existe tipo de sesión híbrida en el log)
- modificadores de soreness/pain (no se capturan)
- pesos de budget por sesión (heurística BUD-002, a configurar)

**Conclusión:** el Hard-Day Budget v1 puede clasificar y sumar fuerza + carrera con RPE/duración/km,
pero **threshold/interval e híbrido requieren** o bien extraer `icu_intensity`/zonas de intervals, o
bien un nuevo input manual de tipo de sesión. Clasificación gruesa: viable hoy. Fina: bloqueada.

---

## Resumen de bloqueos para implementación
- **Decoupling / pace-to-HR / zonas** (END-005, END-001 fino): bloqueado — no se extrae de runs.
  Desbloqueo barato: extraer `icu_intensity`/HR-zones de la API de intervals (ya conectada).
- **Soreness / pain / RIR / subjective readiness pre-sesión**: no se capturan — bloquea readiness
  fino y modificadores de carga. Desbloqueo: añadir input subjetivo (1 tap) en el log de sesión.
- **Dedup Coros/Strava/intervals**: riesgo de doble conteo de volumen de carrera. Desbloqueo: dedup
  por fecha+distancia.
- **Peso fiable**: forward-fills de Apple Health degradan la tendencia. Desbloqueo: weigh-in manual
  4-7×/sem (ya señalado en weekly reviews).

## Qué ya estaría listo para Readiness Engine v1
Sleep, RHR, recovery flag, CTL/ATL, sesiones completadas y RPE están **disponibles y fiables hoy** →
suficiente para un Readiness Engine v1 trend-based con confirmación multi-señal, sin automatizar
dosis. El hard-day budget grueso (fuerza + carrera) también. Lo híbrido y lo aeróbico-fino quedan
para cuando se extraigan zonas/intensidad y se añada el input subjetivo.
