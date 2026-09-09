# Semana 37 (2026-09-07 → 13) — revisión del coach hecha a mano

*Escrita el 2026-09-09 por Claude en la sesión de trabajo, a petición de Julian ("el coach de esta
semana córrelo tú, no por API"). Mismo contrato que la función `coach-weekly-review` (esquema v2),
misma lista de 72 reglas, y validada con el mismo `validatePlanVersion` (0 duros, 2 avisos
informativos). La propuesta está en `coach_reviews` como `2026-W37#1 · proposed` con
`usage.source: 'manual'`; en la app aparece en inglés y Julian la aplica o la rechaza con un toque.
Este documento es la lectura larga, en castellano, para el repo.*

*Revisada la misma tarde: (1) los pesos de Withings estaban mal decodificados (la báscula manda el
pulso en un grupo aparte con el mismo timestamp y la fila del día se quedaba sin peso: "NaN kg" en
la app); con el decodificador arreglado y la resincronización, la serie es **86,3 · 87,9 · 88,4 ·
86,1 · 86,7 kg** (4-9 sep, ayunas), media **87,1**, exactamente la salida declarada. (2) Julian pidió
que la revisión fuera "concisa pero thoughtful, como haría un coach profesional": el texto de la
propuesta se reescribió con esa voz (secciones 6 y 7 actualizadas).*

## 0 · Posición en el bloque

Semana **1 de 5** del bloque **B1** (ancla lunes 2026-09-07), fase **base**. Primera descarga la
semana del 2026-10-05. Nada estructural se mueve en semana 1 (LOAD-004).

## 1 · Suficiencia de datos

| Gate | Estado | Consecuencia |
|---|---|---|
| Peso: ≥4 medidas en 7 d | pasa (5 en 6 d, Withings en ayunas) | hay nivel (media 87,1), no hay pendiente: ≥14 días para tocar kcal |
| Nutrición: ≥10 de 14 días | **falla** (0 días) | la ingesta es desconocida; manda la báscula, y la báscula dice "plano" |
| Carreras ≥1 con FC | pasa (5,31 km @139 el 7-sep) | rampa **por tiempo**, no por km |
| Fuerza ≥1 exposición/14 d por ancla | pasa en 6/6 | objetivos por la regla |
| Wellness ≥5 de 7 d con dato de hoy | pasa (WHOOP directo, 31 noches) | informativo |
| Cintura ≥2 medidas | falla | — |

## 2 · Recuperación (información, no dosis)

WHOOP recovery de los últimos 8 días: 96 · 78 · 69 · 61 · 44 · 63 · **39** · 48 (hoy). HRV 77 → 56 ms.
Sueño 5,6 h el lunes, 6,6 h el martes. La carga aeróbica (ATL 5,7 → 18) sube porque volvió a 6 días de entrenamiento. En la
misma ventana sentadilla, RDL, remo y dominadas **progresaron**: cuando el wearable y el rendimiento
discrepan, gana el rendimiento (READ-005). Dos señales (HRV, sueño) valen una nota de sueño, no un
recorte de volumen (READ-002). Recomendación: ≥7 h las noches antes de pierna.

## 3 · Adherencia

| Semana | Gym hecho / plan | Carreras hechas / plan |
|---|---|---|
| W34 (17-23 ago) | 4 / 4 (+ híbrido) | 1 / 2 |
| W35 (24-30 ago) | **2** / 4 | 1 / 2 |
| W36 (31 ago-6 sep) | 3 / 4 | **0** / 2 |
| W37 (hasta el martes) | 2 / 4 | 1 (lunes, 5,3 km Z2) |

Fuerza 75 % en 4 semanas → rampa permitida. Carrera: 1 de 4 planificadas en dos semanas → **la
plantilla (40 + 50 min) no se cumple; se simplifica** (30 + 40 min por tiempo).

## 4 · Fuerza — todo en kg

| Ancla | Primera en ventana | Mejor | Última | Lectura |
|---|---|---|---|---|
| Sentadilla | 95×8 @7 (14-jul) | 105×6 @7 (8-sep) | 105×6/6/6/6 @7 | ↑ progresa; 100×8 (15-ago) → 105×6 |
| Banca | 85×8 @7,3 (1-jul) | 95×8 @7,1 (20-ago) | 90×8/8/8/8 @7 (7-sep) | bajó 5 kg tras 2 semanas flojas; la regla la sube a 92,5 el jueves |
| Peso muerto sumo | 110×8/6/6/6 @6,6 (5-sep) | = | = | n=1 desde el ancla: falta un segundo dato |
| Press militar | 55×8 @6,9 (14-ago) | = | 55×6/6/8/7 @7,5 (4-sep) | **plano**, n=2: una exposición más antes de juzgar |
| Remo con barra | 60×10 @7 (1-jul) | 65×10 @6,8 (7-sep) | = | ↑ |
| Dominadas | +0×8 @7,1 (14-ago) | +8×5/6/7/7 @6,9 (4-sep) | = | ↑ (lastre) |

Accesorios: RDL 75 → **90×10 @7** (→ 92,5); hack 50×11/11/12 @7,3; curl femoral sentado 65×12 @7,3
(→ 67,5); gemelo sentado 50×15/12/12 @7,5. **5 de 6 anclas suben o aguantan.** Duración de Lower A:
74:21 y 74:46 contra un tope de 75 min.

## 5 · Carrera

Desde el 19-ago: 0,98 km (18-ago), 1,92 km @152 (26-ago), **5,31 km @139 en 39 min (7-sep)**, dentro de
Z2 (techo 143). Antes: 5,6 km @147 (18-jul) y 5,1 km @148 (16-ago), ambas por encima. Km/semana: 1 ·
1,9 · 0 · 5,3. No hay base para rampar distancia (END-003); sí hay esfuerzo Z2 sostenible. Esta semana:
miércoles 30 min y sábado 40 min por tiempo, ≤143 bpm, 0 sesiones duras.

## 6 · Composición y objetivo

Salida declarada 87,1 kg (19-ago). Withings en ayunas (serie corregida): 86,3 (4-sep) · 87,9 (5-sep)
· 88,4 (7-sep) · 86,1 (8-sep) · **86,7 (9-sep)**. Media de los cinco: **87,1 kg, la salida declarada**.
Grasa 21,1 · 21,0 · 21,2 · 20,9 · **20,5 %** (media 7 d 20,9 %, ≈18,2 kg); FFM 68,1-69,6 (media 68,8);
visceral 2,8-2,9; BMR ≈2.000 kcal; edad metabólica 31. Tres semanas de programa y el peso está donde
empezó; con 6 días de báscula hay nivel pero no pendiente (la regla pide 14). La bioimpedancia oscila
±0,5 % de un día a otro: la recomposición se leerá en masa grasa y FFM cuando haya ≥21 días entre
lecturas. **Ingesta desconocida: 0 comidas registradas en 21 días.** El objetivo primario (perder
grasa) no tiene hoy ni un dato detrás. Kcal 2.700/2.400 y proteína 185 g se mantienen (REC-002,
REC-008, GEN-002): moverlas sin dato sería adivinar en cualquier dirección. La decisión de kcal se
toma el **21-sep** si hay ≥5 días registrados por semana y pesadas diarias en ayunas.

## 7 · Lo que dice la propuesta (`2026-W37#1`)

**Foco:** *B1 week 1: hold the six anchors, two Z2 runs by time, log your food. The scale is where you
started.*

**Se mantiene:** las cuatro sesiones de fuerza programadas (Lower A, Upper A, Lower B, Upper B) y las
cinco de reserva, con sus objetivos por la regla de doble progresión.

**Cambia (2 cosas):**
1. **Cardio por minutos y más pequeño que la plantilla:** X 30 min Z2, S 40 min Z2, 0 duras, sin km.
2. **Lower A:** el gemelo pasa a opcional (74:21 y 74:46 contra 75), y el box jump se re-etiqueta de
   *Quads* a *Power*: como cuádriceps la semana leía **16 series contra el tope de 14** en déficit
   (STR-003); un primer pliométrico 3×5 @6 no es volumen de hipertrofia; el recuento real es **13**.
   El validador de la función lo marcó como duro (`VOL-CAP`) y esa fue la corrección.

**Decisiones (8):** mantener anclas · OHP una exposición más · gemelo opcional · recuento de
cuádriceps · Z2 por minutos · sin cambio de kcal · registro nutricional · recuperación informativa.

**Validador:** 0 duros · 2 avisos: `MOBILITY-FLOOR` (1 hueco de movilidad, objetivo 2) y `HARD-BUDGET`
(7 contra un tope indicativo de 6), ambos propiedades de la plantilla de 6 días, no de la propuesta.
La reescritura pasó por `scripts/coach-manual-review.mjs` (el camino manual del repo): contrato ok,
0 duros, y dos avisos de voz sobre longitud que se dejaron anotados en `sanitized`.

## 8 · Qué vigilar esta semana

- Banca jueves: 92,5×8/8/8/8 @≤7,5 → 95 la semana que viene.
- OHP: 55×8/8/8/8 @≤7,5, o miramos técnica (rack vs bloqueo).
- Sumo 110, segunda exposición (3-6 reps, RPE 7-8).
- Sábado: FC media ≤143 durante los 40 min.
- ≥5 pesadas en ayunas en la Withings; ≥5 días de comidas.
- Lower A por debajo de 75 min.

## 9 · Lo que aprendí del sistema al hacerlo a mano

- El validador funciona: con una propuesta sin historial de cargas devolvió 5 `LOAD-JUMP` duros
  ("objetivo sin top set anterior"), y con el plan tal cual, `VOL-CAP` por los 16 de cuádriceps. Los dos
  eran señales reales: el primero porque el pack manual no llevaba `facts.lifts`; el segundo porque la
  semilla etiqueta el box jump como cuádriceps.
- `PROTEIN-FLOOR` lee `evidence.numbers.proteinG/kcalTraining/kcalRest` de las decisiones de nutrición:
  si el coach no pone esos números en la decisión, la regla avisa aunque el texto los mencione.
- `CTL-FOR-STRENGTH` salta con la palabra "ATL" en una decisión de recuperación. Razonable: esa carga
  sólo ve cardio.

## 10 · Lo que se arregló al revisar esta revisión (misma tarde)

- **`groupByDay` (Withings):** la Body Smart manda dos grupos por pesada con el mismo `date`; el del
  pulso iba delante y se quedaba con la fila. Ahora la fila se compone con todos los grupos del día.
  Resincronizados 30 días; las cinco pesadas tienen peso y composición completa.
- **`mergeProposal`:** una sesión propuesta por el coach perdía `muscle`/`name`/`db`/`bw` (el contrato
  no los transporta) y `VOL-CAP` contaba 19 series en "otros": un duro falso que habría afectado también
  a la función. Ahora hereda los campos de librería del plan base; lo explícito en la propuesta gana.
- **Voz del coach:** bloque `VOZ` en el prompt (veredicto primero, segunda persona, cada número una
  vez, ≤900/≤1.400 caracteres) y avisos de longitud en `sanitized`. La primera versión de esta
  revisión era correcta y era un informe; ésta es la que se lee.
- **Stats › Body:** tarjeta "Withings Body Smart" con las diez métricas de la báscula, deltas a ≥7
  días y la línea de recomposición; el pack lleva ahora masa grasa, agua, hueso y la media de 7 días.
- **Modo manual:** Ajustes › "Who writes the weekly review". En manual, "Close the week" guarda el body
  íntegro como fila `requested` y la sesión la convierte en `proposed` con el script del repo.
