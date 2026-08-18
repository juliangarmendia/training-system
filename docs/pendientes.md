# Pendientes

> **Esta es la única lista.** Se lee de arriba abajo, un punto a la vez. Todo en castellano, sin
> etiquetas internas ni Rule IDs sin explicar.
>
> El *por qué* de cada cosa vive en [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md).
> Aquí está el *qué sigue*.
>
> Última actualización: **2026-08-18**

## Regla de trabajo

Un punto a la vez, en orden. **Solo interrumpe algo que esté perdiendo datos** — como pasó con el
SkiErg el 18 de agosto, que se estaba descartando en silencio.

Antes de cada tanda de trabajo: leer esta lista. Al cerrar un punto: actualizarla.

---

## Estado de los datos (medido el 2026-08-18)

| Dato | Cantidad | Último | |
|---|---|---|---|
| Entrenamientos de gimnasio | 23 | 2026-08-17 | ✅ |
| Carreras | 13 | 2026-08-16 | ✅ |
| Sueño / HRV / recuperación | 105 | 2026-08-18 | ✅ |
| Cardio no-carrera (bici, remo, SkiErg) | **0** | — | ❌ punto 1 |
| Peso corporal | 15 | **2026-05-27** | ❌ punto 2 |
| Nutrición | 11 | 2026-05-28 | ❌ punto 2 |
| Movilidad | 2 | 2026-04-27 | ❌ punto 7 |

Reproducir: consultar Supabase (proyecto `ycfodifvpvosukepcxie`), tabla por tabla, filtrando por el
`user_id` de Julian. No fiarse de la memoria de nadie.

---

## 1 · Que el cardio no-carrera entre de verdad — **Claude**

**Estado: en curso (v11.40).**

`sessions` sigue en 0. El filtro que descartaba todo lo que no fuera correr se arregló el 16-ago, y
el tipo `VirtualSki` (SkiErg de Concept2) el 18-ago. Pero queda un problema de raíz: **la
recuperación del histórico no volverá a ejecutarse**. Se marca "hecha" con un booleano que ya está
puesto desde antes del arreglo de `VirtualSki`, y la ventana de sync normal solo mira de ayer a hoy.
Sin versionar ese marcador, todo tu histórico de SkiErg y bici queda fuera para siempre.

También: el diagnóstico de importación (qué se importó y qué se descartó) se guarda solo en el
teléfono, así que no se puede revisar en remoto sin pedir capturas.

**Cómo se comprueba:** abrir la app y verificar en Supabase que `sessions` pasa de 0 a más de 0.

## 2 · Pesarte — **Julian**

**Es lo de mayor impacto de toda la lista, y no depende de código.**

Último peso fiable: **27 de mayo**, hace casi tres meses. Sin peso reciente no se puede:

- recalibrar tu gasto calórico — el cálculo actual asume 88,6 kg y una semana de "4 gimnasio + 2
  carreras", que ya no es tu plan;
- saber si el déficit funciona ni a qué ritmo;
- actualizar los kg objetivo de las sesiones, congelados en el baseline del 30 de junio.

**Qué hace falta:** 2 semanas de pesajes diarios, por la mañana, en ayunas, después del baño. Una
medición aislada no sirve — el peso oscila 1-2 kg por agua y sodio. Lo que se usa es la media móvil.

Lo mismo con la nutrición: sin registro no hay forma de ajustar calorías con criterio.

## 3 · Dos decisiones de entrenamiento abiertas — **Julian decide**

### 3a. La "sesión de calidad" del sábado

El plan la llama sesión de calidad y lo que manda al reloj es Z2 fácil. Dos salidas coherentes:

- **que lo sea de verdad** (Z3 o umbral) — pasa a contar como día duro;
- **o quitarle la etiqueta** y asumir que la semana es 100% cardio fácil, que es defendible en
  déficit.

Lo único que no vale es que diga una cosa y haga otra.

### 3b. La semana suma 7,5 puntos de dureza contra un objetivo de 6

Cada sesión lleva una puntuación de dureza (recuperación 0 · cardio fácil 0,5 · tren superior 1 ·
**tren inferior 2** · umbral o intervalos 2 · benchmark 3). La suma semanal debería quedar en 5-6.
Equivale a la regla de siempre: **no más de 2-3 sesiones verdaderamente duras por semana, contándolo
todo** — no solo las carreras.

Tu semana: pierna 2 + upper 1 + Z2 0,5 + pierna 2 + upper 1 + cardio largo 1 = **7,5**.

Dos matices importantes: los pesos son **estimaciones, no medidas**, y hoy la suma solo cuenta lo que
**ya registraste** — el plan nunca se contrasta contra su propio objetivo antes de proponerte la
semana.

**Recomendación: esperar.** Con el cardio real entrando (punto 1), en pocos días habrá un número
medido en vez de estimado. Decidirlo ahora sería a ojo.

Detalle en [`architecture/hard-day-budget.md`](architecture/hard-day-budget.md).

## 4 · Pliometría y trineo — **Julian decide**

- **Pliometría: recomiendo hacerlo.** La evidencia de que fuerza pesada + pliometría de baja dosis
  mejoran la economía de carrera es de las más sólidas del corpus, y la base aeróbica es una de tus
  dos cualidades en progresión. Cuesta ~5 min al inicio de un día de pierna, en fresco. Ahora mismo
  no hay nada de esto en ninguna sesión, y su ausencia no tiene justificación.
- **Trineo: sí, pero sustituyendo un día de cardio, no añadiéndolo** — es literalmente lo que dice
  la regla. Concéntrico puro, pocas agujetas, impacto bajo: de todo lo que falta, es lo que mejor
  encaja con tu historial lumbar.
- **Circuitos híbridos completos: esperar.** La regla permite 0-1 por semana en déficit, así que
  cero está dentro. Y la semana ya va por encima de su objetivo de dureza.

## 5 · Analítica de sangre — **Julian**

La última es de **septiembre de 2024**: 23 meses. Tres cosas concretas:

- **Vitamina D en 11,2 ng/mL** = deficiencia franca (el corte está en 20), medida en 2023 y **nunca
  re-controlada**. El plan de nutrición sugiere una dosis de mantenimiento, no de corrección.
- **Colesterol LDL de 149 → 170 mg/dL** entre 2021 y 2024, con ApoB en 110.
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
