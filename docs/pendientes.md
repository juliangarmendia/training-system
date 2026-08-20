# Pendientes

> **Esta es la única lista.** Se lee de arriba abajo, un punto a la vez. Todo en castellano, sin
> etiquetas internas ni Rule IDs sin explicar.
>
> El *por qué* de cada cosa vive en [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md).
> Aquí está el *qué sigue*.
>
> Última actualización: **2026-08-20** (v11.43 · sección de analítica)

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

## ✅ RESUELTO: la adherencia baja era por viajes

**Julian (2026-08-19):** *"NO estuve entrenando porque estaba de viaje."*

Explicación benigna, y señala el arreglo real: **ninguna de las variantes funcionaba sin gimnasio**,
así que un viaje equivalía a no entrenar. Los huecos de 11, 12 y 14 días eran viajes, no desidia.

Arreglado en v11.42 con la variante **Viaje** (abajo, punto 1b). El análisis original se conserva
como referencia de la magnitud del problema:

<details>
<summary>Análisis original: adherencia ~30%</summary>

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

</details>

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

## 1b · ✅ Variante VIAJE — HECHO (v11.42)

El arreglo del problema de adherencia. **Dos sesiones de peso corporal, cero gimnasio, banda opcional:**

| | Viaje A | Viaje B |
|---|---|---|
| Pierna | Búlgaras 3×10-15/pierna | Rumano a 1 pierna 3×10-12/pierna |
| Empuje | Flexiones 3×10-20 | Pike push-up 3×6-12 |
| Tirón | Dominadas AMRAP *(o remo con banda)* | Remo con banda 3×15-20 |
| Extra | Puente de glúteo a 1 pierna | Nordic curl asistido |
| Core | Bird dog (anti-rotación) | Dead bug (anti-extensión) |

**Principio de diseño clave: cada sesión es completa por sí sola** — pierna, empuje, tirón y core. En
viaje no sabes si vas a hacer una o cuatro, así que ninguna puede dejar un hueco. A y B se
diferencian en el énfasis, no en la cobertura.

La intensidad sale de la **dificultad y la proximidad al fallo**, no de la carga: sin peso externo,
RPE 8 en rangos altos es lo que da estímulo real. Cada ejercicio lleva su progresión escrita (pies
elevados, pausas, tempo lento) para que no se convierta en repeticiones infinitas.

En el selector de la app aparece como **🧳**, antes del 3.

## 2 · ✅ Composición medida — y el objetivo, aclarado

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

### ✅ Decidido (2026-08-19): el objetivo es la báscula, 79-81 kg

*"Siempre que peso entre 79-81 kg me siento muy bien atlético, rápido, en buena forma física."*

`goals.md` reescrito con eso. Lo importante de la traducción: **llegar a 80 kg no es llegar al 9% de
grasa** — parte de los 7,1 kg será masa magra incluso haciéndolo bien, así que lo esperable es
**~10,5-11%**. Sigue siendo magro y es un objetivo legítimo; la sensación subjetiva a ese peso es un
dato válido y además pesar menos ayuda a correr.

**7,1 kg a ~0,5%/semana = 16-18 semanas** (corregido el 19-ago: 12 semanas exigirían ~650 kcal/día de
déficit, por encima de la banda del sistema). Y lo que decide si se llega *atlético* o *flaco* no es
la dieta: es el estímulo de fuerza. Con 1-2 sesiones/semana se llega blando; con 4, atlético. Por eso
la variante Viaje importa tanto como el déficit.

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

## 4 · ✅ Pliometría, trineo y SkiErg — HECHO (v11.42)

**Decisión de Julian:** *"agregar pliometría + trineo + skierg o lo que consideres que es bueno para
entrenar y mezclar."*

**Pliometría — en `lowerA`, al principio, en fresco.** Pogo hops 2×20 + box jump 3×5 = **55
contactos**, dentro del rango 40-80 que marca la regla. Sólo en ese día para empezar: el tendón
adapta despacio y se introduce tras la base, no de golpe. Del cajón **se baja caminando** — la caída
es donde está la lesión. Era el hueco con mejor evidencia de todo el plan (fuerza pesada +
pliometría mejoran la economía de carrera, graduado `strong`).

**Híbrido trineo + SkiErg — sustituye el cardio del sábado, no lo suma.** Trineo 6×20 m + SkiErg
5×250 m + farmer carry 4×40 m. Aparece como alternativa del día de cardio, que es literalmente lo
que dice la regla ("en lugar de un cardio, no además"). El trineo es **concéntrico puro**: sin fase
excéntrica no hay daño muscular apreciable, así que da mucho estímulo con pocas agujetas y casi no
interfiere con la sentadilla ni con correr — probablemente la mejor herramienta de acondicionamiento
para un historial lumbar. Todo de baja skill a propósito: bajo fatiga no se hacen ejercicios técnicos.

**SkiErg** ya tiene sus dos workouts en el catálogo desde v11.39 (Z2 25 min y 8×1 min Z4).

Honestidad sobre la evidencia: la programación híbrida es lo más débil del corpus (no hay ensayos de
HYROX). Por eso la dosis es conservadora y va como alternativa, no como obligación.

<details>
<summary>Recomendación original</summary>

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

</details>

## 5 · Analítica de sangre — ✅ analizada y en la app (v11.43) · **pedir la nueva sigue siendo tuyo**

**Hecho el 2026-08-20.** Las 6 analíticas están puntuadas contra **objetivos de guía**, no contra el
rango del laboratorio, en
[`../data/processed/2026-08-20_analitica-puntuada.md`](../data/processed/2026-08-20_analitica-puntuada.md)
y en la app (**Ajustes → Mis marcadores**).

Los tres hallazgos que el rango del laboratorio escondía:

| | |
|---|---|
| **ApoB 110 "dentro de rango" es un 2 de 5** | El `66-133` que imprime IACA es un intervalo **poblacional**, no un umbral de riesgo. Todo su tramo alto queda por encima de cualquier objetivo de guía |
| **Ferritina 191 está a 9 unidades de un flag** | La OMS marca >200 µg/L en hombres sanos como riesgo de sobrecarga de hierro. El rango `30-400` del laboratorio lo tapa |
| **El "óptimo" de vitamina D no existe** | El 40-60 ng/mL que se repite en todas partes es de la guía de 2011 de la Endocrine Society; **la vigente (2024) dice que no hay evidencia que defina el nivel óptimo**. Que 11,2 sea deficiencia sigue siendo cierto por todas las definiciones |

Y dos cosas que dije mal y quedan corregidas: el HDL de 65 **no** es un "✅ bueno" (esa convención,
NCEP ATP III, no sobrevivió a la evidencia y ninguna guía vigente fija diana de HDL hacia arriba), y
la serie de LDL 149 → 170 → 143 **mezcla dos laboratorios y dos ecuaciones** — el descenso es real y
está en el colesterol total medido (−30 mg/dL), pero no soporta una narrativa de "oscilación".

**Lo que sigue siendo tuyo: pedir la analítica nueva.** La app tiene la lista lista para copiar, con
las condiciones (en ayunas, 48 h sin sesión dura, bien hidratado). Prioridad: **vitamina D**, que
lleva 36 meses sin re-control.

<details>
<summary>Estado anterior del punto (18-ago)</summary>

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

</details>

## 6 · Las revisiones semanales que faltaban — HECHO (2026-08-19)

**15 revisiones escritas (W19 a W33)** con datos reales de Supabase, en
[`../tracking/weekly-reviews/`](../tracking/weekly-reviews/). Lo que salio del analisis:

1. **La fuerza progreso pese a 10 sesiones en 15 semanas.** Banca 80 -> 90 kg, sentadilla 90 -> 100,
   OHP 50 -> 55, con el RPE clavado entre 7,0 y 7,4. Era margen que venia de antes del paron, y ya
   esta casi agotado: con 0,67 sesiones por semana no se sostiene.
2. **El peso muerto lleva sin tocarse desde el 3 de mayo** — cero sesiones de `lowerB` en 15 semanas.
   El hueco mas grande del historial.
3. **La semana 29 conecta sueno y rendimiento.** Readiness 48,3 y sueno 6,04 h (los dos minimos del
   periodo) es exactamente la semana del **unico retroceso de carga** de todo el tramo: el remo cayo
   de 60 a 50 kg. La sentadilla del dia siguiente aguanto — bajo fatiga cae antes lo accesorio.
4. **La mejor semana fisiologica fue de cero entrenamientos** (W30: frecuencia en reposo 43,5, la
   minima del ano). Estar descansado y estar en forma no son lo mismo.
5. **El sueno subio ~24 min por noche** entre el primer y el ultimo tramo. La mejora mas solida del
   periodo, y la unica que no depende de entrenar.
6. **Carreras: Z2 cumplido 3 de 6, y las tres ultimas fuera** (HR 147-149 contra un techo de 143).
   Pero **19 s/km mas rapido a la misma frecuencia cardiaca** que en mayo: la base aerobica mejoro.

`latest.json` programa **W35** (24-30 ago): el peso muerto vuelve **a 90 kg con gate de RPE**, no a
110; sentadilla 102,5; OHP 57,5; dominadas BW+2,5; remo de vuelta a 60; banca mantiene 90; y carreras
en Z2 estricto por debajo de 143.

<details>
<summary>Descripcion original del punto</summary>

Sin registro desde la semana 18 (4 de mayo). Merece su propia pasada con `/weekly-review-auto`.

</details>

## 7 · Deuda que no bloquea nada — **Claude, al final**

- **No existe una variante sin gimnasio.** Ninguna de las cuatro funciona sin rack y barra, aunque
  la de 3 días se llamara "viaje / sin gym" hasta el 17-ago. La librería ya tiene flexiones,
  dominadas, sentadilla búlgara, puente de glúteo y plancha con patrón asignado; faltan un empuje
  vertical y un tirón horizontal sin equipo, y una quinta opción en el selector. Es diseño nuevo.
- **Movilidad: 2 registros en total, el último del 27 de abril.** Con dos contracturas lumbares
  detrás y una regla que pide 2-3 sesiones por semana. O la haces y no la registras, o no la haces:
  las dos cosas importan y ninguna se ve desde aquí.
- ✅ **Perfil y plan de nutrición recalibrados** (19-ago, con la Tanita del 11-ago): metabolismo basal
  por tres métodos (Katch-McArdle 1.942 como referencia, que es el único que usa la masa magra
  medida), **calorías cicladas 2.700 entreno / 2.400 descanso** para que la disponibilidad energética
  no caiga por debajo de 30 los días de entreno, **proteína 170 → 185 g**, y la periodización de
  carbohidrato con los días corregidos (estaban invertidos: Lower es Lun/Jue, no Mar/Vie).
  **Corregido también el plazo: 16-18 semanas, no 12-16** — las 12 exigían un déficit por encima de
  la banda que fija el propio sistema.
  **Lo único que no se puede calibrar sin ti: pesarte.** Los números son de fórmula; la media móvil
  de 7 días es el único árbitro. Último registro: 27 de mayo.

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
| 2026-08-19 | Ninguna variante funcionaba sin gimnasio, así que un viaje equivalía a no entrenar. Variante Viaje + pliometría + híbrido trineo/SkiErg | v11.42 |
| 2026-08-20 | **Los rangos del laboratorio escondían tres cosas** (ApoB, ferritina, vitamina D). Analítica puntuada contra objetivos de guía, documento + sección en la app, y los tests que impiden que documento y código divergan | v11.43 |

### El patrón que se repite

Cuatro de los fallos de arriba comparten forma: **el sistema no podía ver su propio incumplimiento.**
La cola descartaba en silencio, el filtro de actividades descartaba en silencio, la pantalla de
ajustes decía "backed up automatically" pasara lo que pasara, y la taxonomía de core no sabía
expresar la regla que debía cumplir.

No fue falta de evidencia ni de reglas. Fue que **nada dejaba rastro al fallar**. De ahí la
prioridad de los diagnósticos visibles y de los tests: el fallo de la variante de 6 días lo encontró
un test, no la lectura del código.
