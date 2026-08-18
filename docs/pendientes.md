# Pendientes

> **Esta es la única lista.** Se lee de arriba abajo, un punto a la vez. Todo en castellano, sin
> etiquetas internas ni Rule IDs sin explicar.
>
> El *por qué* de cada cosa vive en [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md).
> Aquí está el *qué sigue*.
>
> Última actualización: **2026-08-18** (v11.41)

## Regla de trabajo

Un punto a la vez, en orden. **Solo interrumpe algo que esté perdiendo datos** — como pasó con el
SkiErg el 18 de agosto, que se estaba descartando en silencio.

Antes de cada tanda de trabajo: leer esta lista. Al cerrar un punto: actualizarla.

---

## Estado de los datos (medido el 2026-08-18)

| Dato | Cantidad | Último | |
|---|---|---|---|
| Entrenamientos de gimnasio | 23 | 2026-08-17 | ✅ entra bien |
| Carreras | 13 | 2026-08-16 | ✅ |
| Sueño / HRV / recuperación | 105 | 2026-08-18 | ✅ |
| **Composición corporal** | Tanita | **2026-08-11** | ✅ **nueva referencia** |
| **Perfil lipídico** | LabCorp | **2025-02-04** | ✅ 18 meses |
| Cardio no-carrera (bici, remo, SkiErg) | **0** | — | ❌ punto 1 |
| Nutrición | 11 | 2026-05-28 | ❌ punto 2 |
| Movilidad | 2 | 2026-04-27 | ❌ punto 7 |

Reproducir: consultar Supabase (proyecto `ycfodifvpvosukepcxie`), tabla por tabla, filtrando por el
`user_id` de Julian. No fiarse de la memoria de nadie.

## 🔴 El hallazgo que domina todo lo demás: adherencia ~30%

Sesiones registradas entre el **2026-06-20 y el 2026-08-17** (9 semanas): **11**. El plan prescribe 4
por semana → **~1,2/semana medidas**.

| Sesión | Veces |
|---|---|
| `upperA` (press/remo) | 5 |
| `lowerA` (sentadilla) | 4 |
| `upperB` (dominadas/OHP) | 2 |
| **`lowerB` (bisagra / peso muerto)** | **0** |

Huecos de 11, 12 y 14 días. **El sumo deadlift —uno de los cinco anchors "never rotate"— lleva más
de dos meses sin tocarse**, y con él toda la cadena posterior.

**Por qué esto reordena la lista:** las cinco últimas jornadas se fueron en optimizar la
*composición* del plan (frecuencia por patrón, tipo de core, isquios, pliometría). Eso tiene un techo
bajo mientras el plan se ejecuta al 30%. **Afinar el motor de un coche que arranca una vez por
semana rinde poco.**

Caveat honesto: esto mide adherencia **de registro**. Puede haber entrenado sin registrar. Pero sin
registro el sistema no puede progresar cargas ni adaptar nada, así que el efecto es el mismo — y es
justo lo que Julian pide que el sistema haga.

**No sé por qué la adherencia es baja, y no lo voy a suponer.** Falta de tiempo, sesiones demasiado
largas, el gimnasio lejos, el plan poco atractivo, o simplemente no registrar lo que sí se hace son
explicaciones muy distintas y llevan a soluciones opuestas. Es la conversación que más valor tiene
ahora mismo.

---

## 1 · Que el cardio no-carrera entre de verdad — **esperando a que Julian abra la app**

Todo el código está desplegado. Tres arreglos encadenados: el filtro que descartaba lo que no fuera
correr (16-ago), el tipo `VirtualSki` del SkiErg de Concept2 (18-ago), y la recuperación del
histórico, que se marcaba "hecha" con un booleano puesto *antes* del arreglo de `VirtualSki` y por
tanto no habría vuelto a ejecutarse (18-ago, ahora versionada).

**Cambio de v11.41:** las **caminatas ya no se importan**. Caminar 15 minutos al trabajo no es
entrenamiento y ensuciaba el historial con desplazamientos. Los pasos siguen entrando por su propia
vía, donde sí tienen sentido como contexto de actividad diaria.

**Cómo se comprueba:** abrir la app y verificar en Supabase que `sessions` pasa de 0 a más de 0. El
diagnóstico de importación ahora sube a la nube, así que si algo se descarta se puede ver en remoto
sin pedir capturas.

## 2 · ✅ Composición medida — y el objetivo de peso ya no cuadra

**Resuelto el 2026-08-18** con la Tanita MC-780MA-N: **87,1 kg · 16,4% de grasa · 72,8 kg de masa
libre de grasa**. Detalle en
[`../data/processed/2026-08-18_body-composition-tanita.md`](../data/processed/2026-08-18_body-composition-tanita.md).

Lo importante que salió de ahí: **el ~21% que arrastraba el perfil desde abril estaba mal**, no es
que hubiera una recomp espectacular. Y con 72,8 kg de masa libre de grasa, el objetivo escrito
—"80-83 kg **y** 15-17% de grasa"— es internamente contradictorio:

| Peso | Grasa | % |
|---|---|---|
| **87,1 kg (hoy)** | 14,3 kg | **16,4%** ← ya dentro del objetivo de % |
| 85,6 kg | 12,8 kg | 15,0% |
| 83 kg | 10,2 kg | **12,3%** |
| 80 kg | 7,2 kg | **9,0%** |

### ⏸ Decisión pendiente — **Julian**

**¿El objetivo es el porcentaje de grasa o el número de la báscula?** Ya estás dentro del rango de
grasa que el documento pedía. Bajar a 80-83 kg significa llegar a 9-12%: legítimo, pero es un
objetivo mucho más agresivo del que está escrito, con un coste de adherencia y rendimiento distinto.
Y con la adherencia actual al 30%, perseguir 9% sería contraproducente.

Hasta que se decida, `goals.md` queda marcado como contradictorio y no se recalibran calorías.

### Sigue pendiente: pesarse con regularidad

Una medición de composición cada 8-12 semanas, pero **el peso en media móvil de 7 días** es lo que
permite ver si el déficit funciona. Sin eso no se puede ajustar nada con criterio. Ídem la nutrición:
último registro del 28 de mayo.

## 3 · Dos decisiones de entrenamiento abiertas — **Julian decide**

### 3a. La "sesión de calidad" del sábado

El plan la llama sesión de calidad y lo que manda al reloj es Z2 fácil. Dos salidas coherentes:

- **que lo sea de verdad** (Z3 o umbral) — pasa a contar como día duro;
- **o quitarle la etiqueta** y asumir que la semana es 100% cardio fácil, que es defendible en
  déficit.

Lo único que no vale es que diga una cosa y haga otra.

### 3b. ✅ El presupuesto de dureza deja de limitar — resuelto

**Decisión de Julian (2026-08-18):** *"olvidate de ese ranking de dureza de 6. Lo importante es
entrenar bien, de última pondré menos peso, menos repeticiones, o te avisaré que es mucho. O haré
descanso."* Y: *"podemos mantener el valor mostrando cuánto vengo haciendo, pero no limites las
planificaciones con eso."*

Aplicado en v11.41:

- **La carga acumulada sigue visible** en su tarjeta, como información. Sin barra roja ni avisos.
- **Ya no decide nada.** Se retiró del consejo diario, que ahora se apoya solo en señales
  fisiológicas reales: recuperación e interferencia (no correr fuerte antes de pierna).
- El aviso del catálogo de cardio se mantiene solo por razones físicas —pierna hoy, recuperación en
  rojo—, no por un número heurístico.

**Y era la decisión correcta**, por una razón que los datos respaldan: la adherencia real es de ~1,2
sesiones por semana. Un sistema que rechaza planes por exceso de carga mientras el problema real es
que no se entrena estaba resolviendo el problema equivocado.

## 4 · Pliometría y trineo — **Julian decide**

- **Pliometría: recomiendo hacerlo.** La evidencia de que fuerza pesada + pliometría de baja dosis
  mejoran la economía de carrera es de las más sólidas del corpus, y la base aeróbica es una de tus
  dos cualidades en progresión. Cuesta ~5 min al inicio de un día de pierna, en fresco. Ahora mismo
  no hay nada de esto en ninguna sesión, y su ausencia no tiene justificación.
- **Trineo: sí, pero sustituyendo un día de cardio, no añadiéndolo** — es literalmente lo que dice
  la regla. Concéntrico puro, pocas agujetas, impacto bajo: de todo lo que falta, es lo que mejor
  encaja con tu historial lumbar.
- **Circuitos híbridos completos:** con el presupuesto de dureza ya retirado como límite (punto 3b),
  el argumento de "no cabe en la semana" desaparece. Lo que queda es que la evidencia de programación
  HYROX es la más débil del corpus (no hay ensayos), así que se diseña con dosis conservadora.

**Decisión de Julian (2026-08-18): sí, y añadir todo lo que tenga sentido.** Pendiente de diseñar e
implementar — es el siguiente punto de trabajo.

## 5 · Analítica de sangre — **Julian**

**Actualizado el 2026-08-18.** Apareció una segunda carpeta, `data/00. Blood Tests/`, con un
**perfil lipídico del 2025-02-04** que no estaba en la que audité. Eso corrige algo que dije mal:

| | 2021 | 2024-09 | **2025-02** |
|---|---|---|---|
| LDL | 149 | 170 | **143** |
| HDL | 66 | 68 | 65 |
| Total | 226 | 260 | 230 |
| Ratio LDL/HDL | — | — | **2,2** (rango 0-3,6) |

**Dije que el LDL venía subiendo. No es cierto:** el valor más reciente es el más bajo de la serie, y
el 170 de 2024 era un pico. Sigue estando por encima de la referencia (<100) y merece conversación
médica, pero con la ratio LDL/HDL en 2,2 —banda de riesgo bajo— y triglicéridos normales, el patrón
no es alarmante.

Lo que sigue faltando, y es lo que de verdad importa:

- **Vitamina D en 11,2 ng/mL** = deficiencia franca (el corte está en 20), medida en **2023** y nunca
  re-controlada. El plan de nutrición sugiere una dosis de mantenimiento, no de corrección. **Es el
  punto más accionable de toda la analítica.**
- **ApoB y Lp(a)**: estratifican el riesgo cardiovascular mucho mejor que el LDL calculado. La ApoB
  se midió una vez (110, en 2023); la Lp(a) **nunca**, y se mide una sola vez en la vida.
- **Testosterona nunca medida**, en alguien con déficit prolongado.

El sistema registra y deriva; **no interpreta ni trata**. Esto es conversación médica.

Lista de qué pedir en [`../data/processed/2026-08-16_blood-markers.md`](../data/processed/2026-08-16_blood-markers.md).

## 6 · Las 14 revisiones semanales que faltan — **Claude, cuando haya datos**

Sin registro desde la semana 18 (4 de mayo). **Ya es posible**: hay entrenamientos, carreras y sueño
reales de julio y agosto. Merece su propia pasada con `/weekly-review-auto`, no colarla dentro de
otra tarea.

Depende del punto 1 (para que el cardio esté dentro) y mejora mucho con el punto 2 (peso).

## 7 · Deuda que no bloquea nada — **Claude, al final**

- **No existe una variante sin gimnasio.** Ninguna de las cuatro funciona sin rack y barra, aunque
  la de 3 días se llamara "viaje / sin gym" hasta el 17-ago. La librería ya tiene flexiones,
  dominadas, sentadilla búlgara, puente de glúteo y plancha con patrón asignado; faltan un empuje
  vertical y un tirón horizontal sin equipo, y una quinta opción en el selector. Es diseño nuevo.
- **Movilidad: 2 registros en total, el último del 27 de abril.** Con dos contracturas lumbares
  detrás y una regla que pide 2-3 sesiones por semana. O la haces y no la registras, o no la haces:
  las dos cosas importan y ninguna se ve desde aquí.
- **Perfil y plan de nutrición con números de mayo.** Se reescriben cuando llegue el peso (punto 2).
  Hacerlo antes sería inventar.

---

## Cerrado

| Fecha | Qué | Versión |
|---|---|---|
| 2026-08-15 | Objetivos de FC rotos al enviar cardio al COROS: se mandaban bpm absolutos, que intervals.icu lee como porcentaje de la FC máxima → objetivos imposibles en el reloj | v11.33 |
| 2026-08-16 | Auditoría completa del knowledge base; módulos de longevidad y calor; 5 analíticas procesadas | v11.34 |
| 2026-08-16 | **La cola de sync llevaba congelada desde el 30-jun** por un registro que no podía subir nunca (tabla inexistente) y un `break` que bloqueaba todo lo que venía detrás | v11.35 |
| 2026-08-16 | El deload no se disparaba desde mayo; pecho y dominadas pasaban a 2×/semana; la variante de 5 días dejaba de borrar el peso muerto | v11.35 |
| 2026-08-16 | **Solo se importaban carreras**: bici, remo, ski, elíptica y caminata se descartaban en silencio en los dos caminos de entrada | v11.36 |
| 2026-08-17 | Sin trabajo anti-rotación ni anti-extensión en ninguna sesión, con historial lumbar — y la taxonomía era incapaz de detectarlo | v11.37 |
| 2026-08-18 | Corregido un error propio: el RDL añadido el día anterior dejaba cuatro compuestos de barra seguidos y una bisagra tras sentadilla pesada. `fullB` no tenía nada de cuádriceps | v11.38 |
| 2026-08-18 | **`VirtualSki` faltaba en el mapa**: cada sesión de SkiErg se descartaba justo después de conectar Concept2. El catálogo tampoco tenía workouts de ski | v11.39 |

### El patrón que se repite

Cuatro de los fallos de arriba comparten forma: **el sistema no podía ver su propio incumplimiento.**
La cola descartaba en silencio, el filtro de actividades descartaba en silencio, la pantalla de
ajustes decía "backed up automatically" pasara lo que pasara, y la taxonomía de core no sabía
expresar la regla que debía cumplir.

No fue falta de evidencia ni de reglas. Fue que **nada dejaba rastro al fallar**. De ahí la
prioridad de los diagnósticos visibles y de los tests: el fallo de la variante de 6 días lo encontró
un test, no la lectura del código.
