# Readiness Rules — uso de Whoop e Intervals

> **v11.62 — TODO ESTO ES INFORMACIÓN. La app no ajusta el entrenamiento del día por
> recuperación** (decisión del usuario, 2026-09-07). El estado `green/yellow/red` se calcula igual
> y se muestra —una línea en Home, la lista de señales en Stats— pero **no cambia la sesión, ni el
> RPE, ni el volumen, ni los kg, y no propone nada**. Quien decide saltar un ejercicio o bajar el
> peso es él, en el gimnasio. **READ-007 ya NO lo aplica la app**: el único consumidor que puede
> cambiar el plan es el coach **semanal**, y lo hace sobre la semana entera y con aprobación.
> La otra mitad de la lectura —y la que manda— es el **rendimiento**: top set, reps a la misma
> carga, RPE, pulso a Z2 (`performanceLine`).

Cómo el Readiness Engine convierte datos de wearables en un estado
`green | yellow | red` **sin caer en falsa precisión**. Las reglas viven en
[`evidence-to-rules.md`](../../research/evidence-to-rules.md) (`READ-001..008`); este documento es la
**vista operativa**, no reescribe reglas.

## Principios (referencia, no duplicar)

- **READ-001** — tendencias 7d, no días sueltos.
- **READ-002** — confirmación multi-señal (≥2 concordantes) antes de cambiar el plan.
- **READ-003** — Whoop Recovery = flag, no calculadora de dosis.
- **READ-004** — HRV contra baseline individual, nunca entre personas.
- **READ-005** — si el wearable contradice el rendimiento real, gana el rendimiento.
- **READ-006** — sueño es la palanca primaria.
- **READ-007** — día rojo cambia el OBJETIVO, no solo la carga. **No aplicada por la app desde
  v11.62**: la regla sigue siendo cierta como principio de entrenamiento, y quien la ejecuta es el
  usuario en el momento (o el coach semanal al planificar), no un botón en Home.
- **READ-008** — deload por declive multi-señal sostenido. Se calcula (`deloadHint`) y **viaja en
  el facts pack** a la revisión semanal; desde v11.62 ya no pinta un banner con un botón.

## Tabla de señales

| Señal | Fuente | Cómo usarla | Trampa a evitar |
|---|---|---|---|
| **HRV** | Whoop | Media móvil 7d vs baseline personal; caída sostenida = bandera | Reaccionar a un día; comparar con otros |
| **RHR** | Whoop | Tendencia; +sostenido confirma fatiga/enfermedad | Ruido diario |
| **Sleep duration** | Whoop | Déficit acumulado = palanca primaria (READ-006) | Obsesión con un mal día |
| **Sleep consistency** | Whoop | Horarios regulares pesan tanto como duración | — |
| **Recovery score** | Whoop | Solo mapear a green/yellow/red | Derivar sets/reps del % |
| **Strain** | Whoop | Contexto descriptivo de carga | Perseguir un "strain target" diario |
| **Fitness (CTL)** | Intervals | Tendencia de capacidad crónica | Confundir con readiness diaria |
| **Fatigue (ATL)** | Intervals | Carga aguda; pico = precaución | — |
| **Form (TSB)** | Intervals | Muy negativo sostenido = bandera de fatiga | Buscar TSB positivo siempre |
| **Pace-to-HR** | Intervals | Mejora aeróbica si pace↑ a HR fija | Ignorar calor/condiciones |
| **HR drift / decoupling** | Intervals | <5% = base Z2 sólida (END-005) | No ajustar por calor de Madrid |
| **Zone distribution** | Intervals | Verificar 80/20 semanal (END-001) | — |
| **Compliance** | logs | Gate de ajustes: <50% logueado bloquea cambios finos | Ajustar sobre datos incompletos |
| **Subjective fatigue/soreness/pain/motivation** | el propio usuario | Muy sensibles (READ-005); dolor articular = override. **No hay check-in en la app desde v11.62**: se pedía para decidir el día y ya no se decide nada | Descartarlos frente al wearable |

## Cómo se computa green / yellow / red

1. **Recoger señales** (rolling 7d donde aplica).
2. **Contar concordancia** (READ-002): se necesitan ≥2 señales en la misma dirección para actuar.
3. **Mapear** (los tres colores son ETIQUETAS que se muestran; ninguna dispara una acción):
   - **GREEN** — sin señales rojas; HRV/RHR/sueño en rango.
   - **YELLOW** — 1 señal degradada, o el WHOOP de hoy en amarillo.
   - **RED** — ≥2 señales concordantes degradadas. Es un dato para el usuario y para la revisión
     semanal, no una orden: *lo que hace la app con un rojo es escribirlo en la línea de Home y
     sellarlo en `readinessAtStart` del registro*.
4. **Conflicto wearable vs realidad** (READ-005): manda el rendimiento. La línea lo pone primero,
   precisamente por esto.

> **v11.65:** la línea de rendimiento/tendencias vive en **Stats › Today**; el WHOOP de hoy, en el
> tile **Readiness** de Home. En Home era un párrafo de texto plano en medio de un dashboard de
> tarjetas y el usuario lo rechazó; el número del wearable sí es dashboard, el párrafo no.

## Qué hace la app con todo esto (v11.62)

| Acción | ¿La hace la app? | Dónde |
|---|---|---|
| Mostrar el color y las señales que lo justifican | ✅ | Stats › Today (`renderReadinessSignals`) |
| Mostrar el dato de HOY del wearable | ✅ | tile **Readiness** de Home (`renderHomeStatTrio`) |
| Mostrar las tendencias 7d | ✅ | `renderRecoveryLine`, línea 2 (Stats › Today) |
| Mostrar el rendimiento reciente (anclas + última carrera) | ✅ | `renderRecoveryLine`, línea 1 (Stats › Today) |
| Sellar con qué recuperación se arrancó la sesión | ✅ (log puro) | `workout.readinessAtStart` |
| Pasar `deloadHint` y las señales al coach semanal | ✅ | facts pack |
| **Degradar una sesión dura en RED** | ❌ retirado v11.62 | lo decide él |
| **Recortar volumen en YELLOW / tapar el RPE** | ❌ retirado v11.62 | lo decide él |
| **Cambiar la modalidad del día por fatiga** | ❌ retirado v11.62 | lo decide él |
| **Proponer adelantar el deload con un botón** | ❌ retirado v11.62 | lo propone el coach semanal |
| **Congelar la rampa de km o cerrar la sesión de calidad** | ❌ retirado **v11.67** (E-7) | lo decide la revisión semanal |
| Cambiar el plan de la semana | ✅ con aprobación | coach semanal (`coach_reviews`) |

> **v11.67 (auditoría 2026-09-08, E-7):** quedaba un residuo. `suggestRunningWeek` leía
> `readiness.deloadHint` y con él congelaba `weeklyKmTarget` y cerraba `gates.qualityUnlocked` —
> una dosis derivada de WHOOP y del RPE, aplicada sin que nadie la aprobara, o sea exactamente lo
> que se retiró en v11.62 pero en la escala de la semana. Ya no cambia **ningún** número: ni los
> km, ni los minutos, ni la fase, ni el reparto por sesión. `deloadHint` sigue en la firma para
> poder NOMBRAR la señal en la razón ("dato para la revisión semanal, no un recorte automático") y
> sigue viajando en el facts pack, que es donde sirve: **la recuperación informa; la decisión
> semanal es del coach y del usuario**. Lo fija un test negativo (`verify-running-week`, §4), que
> compara las dos salidas kilómetro a kilómetro.

## Implementación (v11.59, podada en v11.62)

Una sola función, `computeReadinessFrom` (`app/coach-engine.js`), consumida por la línea
informativa de Home, la lista de señales de Stats y el facts pack del coach semanal. **Seis
señales** — las dos del check-in subjetivo se retiraron con el ajuste diario. Cada una, su umbral
y su regla:

| Señal | Cálculo | Dispara | Regla |
|---|---|---|---|
| `whoop` | score con `date === hoy` (nunca el último del array) | rojo (<34); amarillo fija suelo de color | READ-003 |
| `hrv7v28` | media días 0..6 vs media días 7..34 | ≤ −10 % | READ-001, READ-004 |
| `rhr7v28` | media 7d − base propia | ≥ +5 bpm | READ-001 |
| `sleep7` | media 7d (≥4 noches) | < 6,5 h | READ-006 |
| `rpe2` | RPE medio de las 2 últimas sesiones con ≥3 series con RPE | ambas ≥ 9 | READ-005, LOAD-004 |
| `quality2` | `quality` de las 2 últimas | ambas ≤ 2 | READ-005 |

Color: ≥2 disparadas → rojo · 1 → amarillo · 0 → amarillo si WHOOP amarillo, `unknown` si no hay
dato de hoy **y** las tendencias son insuficientes, si no verde (READ-002). `deloadHint` = ≥3
disparadas, o `rpe2`, o (`hrv7v28` ∧ `rhr7v28` ∧ `quality2`) — READ-008; viaja al coach semanal y
no mueve el ancla. **No hay ninguna función que convierta este estado en un cambio de la sesión
del día**: la que existía (`adjustSessionForReadiness`) se borró en v11.62, y
`tests/verify-coach-wiring.mjs` §16 comprueba que no vuelva. Cada umbral es heurística prudente,
declarada como constante con nombre; ninguno sale de un ensayo con este sujeto. Tests:
`tests/verify-readiness-trend.mjs`, `tests/verify-performance-line.mjs`,
`tests/verify-whoop-context.mjs`, `tests/verify-coach-wiring.mjs` §16.

## La línea de rendimiento (v11.62)

`performanceLine(workouts, runs, opts)` (`app/coach-engine.js`, pura) construye la primera línea
de Home: la última lectura de cada ancla (≤3, la más reciente primero) con su flecha —`↑ → ↓ ○`,
tomada del `outcome` que ya calculó `sessionReadout`, sin recalcular nada— más la última carrera.
La carrera se etiqueta `Z2` **sólo** si su pulso medio está en el techo de Z2 o por debajo; por
encima es "carrera", con su pulso al lado.

```
Rendimiento: banca 95×8 ↑ · sentadilla 105×8 → · Z2 5,1 km @141
HRV estable (−3 %) · RHR 44 · sueño 7,4 h · WHOOP hoy 71 %
```

## Anti-falsa-precisión (no negociable)

- Nunca traducir un Recovery % a una carga exacta.
- Nunca actuar sobre una sola métrica de un solo día.
- Nunca dejar que la recuperación decida el entrenamiento del día por el usuario (v11.62).
- Nunca comparar HRV absoluta con valores poblacionales.
- Reusa el trigger LEA ya existente del check-in semanal (sueño/libido/ánimo/enfermedad) en lugar de
  duplicarlo.
