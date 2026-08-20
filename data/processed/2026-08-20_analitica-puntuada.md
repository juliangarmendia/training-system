# Analítica puntuada — rangos, puntajes 1-5 y suplementación

> Procesado: **2026-08-20**. Seis paneles (2021-2025), 344 marcadores extraídos.
> Método: `pdftotext` sobre los PDF originales + investigación de rangos con jerarquía de fuentes
> estricta + tres revisiones adversariales (frontera clínica · citas · consistencia de la rúbrica).
>
> Complementa a [`2026-08-16_blood-markers.md`](2026-08-16_blood-markers.md), que sigue siendo el
> registro de la extracción. Este documento añade lo que aquel no tenía: **rangos óptimos frente a
> rangos de laboratorio**, puntajes, variabilidad biológica y suplementación.

## Lo que este documento es y no es

**No interpreta clínicamente y no prescribe.** El puntaje describe dónde cae tu valor frente a
objetivos publicados. Nada más. Es la regla `LONG-003` del propio sistema: registrar y derivar,
nunca derivar tratamiento.

Tres revisiones adversariales encontraron **74 problemas (16 críticos)** en el borrador de la
investigación, y la mayoría eran de este tipo exacto: menús de dosificación junto a un valor
deficiente, algoritmos diagnósticos, diagnósticos por exclusión. Todos corregidos antes de escribir
esto. Lo anoto porque explica por qué varias secciones dicen menos de lo que podrían: no es
cautela decorativa, es que la primera versión sí cruzó la línea y hubo que traerla de vuelta.

## Jerarquía de fuentes usada

**Nivel 1** — guías vigentes de sociedades mayores (ESC/EAS, ACC/AHA, ADA, KDIGO, WHO, NLA,
Endocrine Society), revisiones sistemáticas y meta-análisis indexados, Cochrane, ECA y cohortes
grandes, position stands (ACSM, ISSN, COI, AIS). Para variabilidad biológica: EuBIVAS y la EFLM
Biological Variation Database.

**Nivel 2** — revisiones narrativas, estudios mecanísticos, estudios de intervalos de referencia.
Etiquetados como tales cuando se usan.

**Excluido**: blogs, podcasts, sitios de venta de suplementos, laboratorios que venden paneles y
sitios de "medicina funcional". Esto último importa más de lo que parece: **buena parte de los
"rangos óptimos" que circulan por internet vienen de ahí y no tienen base evidencial.**

---

## ⚠️ La limitación que atraviesa todo: la antigüedad

| Panel | Fecha | Antigüedad | Estado |
|---|---|---|---|
| LabCorp — lípidos | 2025-02-04 | 18 meses | caducado |
| IACA — completo | 2024-09-20 | 23 meses | caducado |
| IACA | 2024-06-04 | 26 meses | histórico |
| IACA — **el más rico** | 2023-08-07 | 36 meses | histórico |
| IACA | 2023-06-28 | 38 meses | histórico |
| IACA | 2021-05-14 | 63 meses | histórico |

**Ningún valor de aquí describe tu estado actual.** La vitamina D, el ApoB, la HbA1c, la ferritina
y el cortisol son de **hace tres años**. Sirven para saber qué volver a medir, no para saber cómo
estás.

Corrección de fecha: el panel "más completo" es del **2023-08-07** (fecha de extracción), no del
04-08 como decía el documento anterior — el 4 de agosto fue la admisión, la sangre se sacó el 7.

---

## 1 · La rúbrica: cómo se construyó el puntaje

### Las tres formas de un marcador

Una escala que trate igual a los tres casos está mal hecha:

| Tipo | Ejemplo | Cómo se puntúa |
|---|---|---|
| **Menos es mejor** | LDL, ApoB, no-HDL | Intervalos con techo, sin suelo |
| **Más es mejor** | vitamina D | Intervalos con suelo, sin techo |
| **Banda óptima, dos colas malas** | TSH, ferritina, HbA1c | **Intervalos concéntricos** que se ensanchan |

La implementación es una sola función para los tres: los intervalos se **anidan** del 5 al 1 y se
devuelve el primero que contiene el valor. Un marcador de una cola deja un extremo abierto; uno de
dos colas usa intervalos concéntricos, y así **las dos colas penalizan simétricamente**. Con una
escala mal diseñada, una TSH baja saldría 5.

### Dos reglas que quitan más puntajes de los que ponen

**Regla A — el 5 sólo existe si hay un objetivo publicado que cumplir.** Si ninguna guía define una
diana, el marcador no tiene 5: tiene "en rango" y punto. Esto evita el error de pintar de verde un
HDL de 65 como si fuera un logro.

**Regla B — el número de bandas no puede exceder el número de cortes publicados más uno.** Antes de
fabricar una gradación, se deja el nivel vacío. Seis marcadores perdieron bandas por esta regla.

### Marcadores que NO se puntúan, y por qué

| Marcador | Por qué no |
|---|---|
| **Insulina en ayunas** | No existe rango óptimo publicado, y la **ADLM recomienda explícitamente no medirla con esta finalidad** |
| **HOMA-IR** | Quien lo dice es el grupo que inventó el modelo: *"There is no absolute value for HOMA indices"* (Oxford, Diabetes Trials Unit). Además es glucosa × insulina / 405 — no es un tercer dato |
| **HDL** | Ninguna guía fija un objetivo hacia arriba. Se sustituye por un indicador de tres estados |
| **LDL calculado, no-HDL, VLDL, ratios** | Son funciones aritméticas de colesterol total, HDL y triglicéridos. Puntuarlos cuenta los mismos tres números varias veces |
| **Orina (cilindros, cristales, bacterias)** | El volcado de texto no permite leerlos con certeza |
| **CK, LDH, AST, ALT** | Puntuables sólo con la marca de confusor: el entrenamiento de fuerza los mueve |

---

## 2 · Tabla maestra

Puntaje `—` = no se puntúa por las reglas de arriba.
Antigüedad: **C** = caducado (12-24 meses) · **H** = histórico (>24 meses).

### Lípidos y riesgo cardiovascular

| Marcador | Último valor | Fecha | Rango del laboratorio | Objetivo por guías | Puntaje | Antig. |
|---|---|---|---|---|---|---|
| Colesterol total | 230 mg/dL | 2025-02 | 100-199 | *sin objetivo propio; se usa vía no-HDL* | — | C |
| **Colesterol no-HDL** | **165 mg/dL** | 2025-02 | *no impreso* | **<85** (muy alto riesgo) · <100 (alto) · <130 (moderado) — ESC/EAS 2019, mantenido en el Focused Update 2025 | **2** | C |
| **Apolipoproteína B** | **110 mg/dL** | 2023-08 | 66-133 (hombres) | **<65** (muy alto) · <80 (alto) · <100 (moderado) — ESC/EAS 2019 | **2** | H |
| Triglicéridos | 126 mg/dL | 2025-02 | 0-149 | <135 (por debajo de la banda "elevada" 135-499 de ESC/EAS 2025) | **5** | C |
| Colesterol LDL (calc.) | 143 mg/dL | 2025-02 | 0-99 | <55 / <70 / <100 / <116 según riesgo | *(derivado)* | C |
| HDL | 65 mg/dL | 2025-02 | >39 | **sin objetivo definido por guías** | *ver abajo* | C |
| Apolipoproteína A-I | 141 mg/dL | 2023-08 | 104-202 | sin objetivo | — | H |
| **Lp(a)** | **nunca medida** | — | — | se mide **una vez en la vida** | — | — |

**El hallazgo más importante de esta familia:** el `66-133` que imprime el laboratorio para el ApoB
es un **intervalo de referencia poblacional** —el 95% central de una población— **no un umbral de
riesgo**. Todo su tramo superior está por encima de cualquier objetivo terapéutico de guía. Un
ApoB de 110 "dentro de rango" es, contra los objetivos publicados, un **2 de 5**.

**Sobre el HDL, que cambia respecto al documento anterior.** El `≥60 = elevado` que imprime IACA es
la vieja convención del NCEP ATP III, que trataba el HDL alto como factor protector. **Esa
convención no sobrevivió a la evidencia** (randomización mendeliana), y ninguna guía vigente
—ni ESC/EAS 2019, ni su Focused Update 2025, ni ACC/AHA— fija un objetivo de HDL hacia arriba.
Por eso el HDL pasa a un indicador de tres estados: **bajo (<40, marcador de riesgo) · sin señal ·
muy alto**. Tu 65 cae en "sin señal". Llamarlo "bueno ✅", como hacía el doc anterior, era heredar
una convención retirada.

### Metabólico

| Marcador | Último valor | Fecha | Rango del laboratorio | Objetivo por guías | Puntaje | Antig. |
|---|---|---|---|---|---|---|
| **HbA1c** | **5,3 %** | 2023-08 | ≤5,6 | **5,0-5,4 %** — banda de menor riesgo en ARIC | **5** | H |
| Glucosa en ayunas | 95 mg/dL | 2024-09 | 70-100 | <100 (ADA 2026) | **5** | C |
| Insulina en ayunas | 5,5 mU/L | 2024-09 | 3,0-24,0 | **sin objetivo; ADLM recomienda no medirla así** | — | C |
| HOMA-IR | 1,3 | 2024-09 | <2,5 | **sin umbral definido, según sus propios autores** | — | C |

**La HbA1c es el resultado más contraintuitivo de todo el trabajo.** "Cuanto más baja, mejor" es
**falso**. En el estudio ARIC (Selvin 2010, n=11.092 adultos sin diabetes, ~14 años de seguimiento)
la banda de menor riesgo es **5,0-5,4 %**, y por debajo de ese suelo reaparece exceso de
mortalidad. Tu 5,3 % cae justo en la banda óptima. No es "normal": es el valor que uno querría.

### Micronutrientes

| Marcador | Valor | Fecha | Rango del laboratorio | Objetivo por guías | Puntaje | Antig. |
|---|---|---|---|---|---|---|
| **25-OH vitamina D** | **11,2 ng/mL** | 2023-08 | óptimo >30 · insuf. 20-30 · **deficiencia <20** | por debajo del umbral de **todas** las definiciones publicadas (IOM 2011, ES 2011, ESCEO 2022). **El "óptimo" NO está definido**: la guía vigente (Demay 2024) lo dice explícitamente — ver §4 | **1** | **H (36 m)** |
| Vitamina B12 | 682 pg/mL | 2023-08 | 197-771 | sin objetivo | — | H |
| Ácido fólico | 7,2 ng/mL | 2023-08 | 4,6-34,8 | sin objetivo | — | H |
| Homocisteína | 9 µmol/L | 2023-08 | <15 | **sin diana terapéutica** (ver abajo) | **4** | H |
| Ferritina | 191 ng/mL | 2023-08 | 30-400 | suelo <15 µg/L = deficiencia (OMS 2020); riesgo también por arriba | **4** | H |
| Selenio | 82 ng/mL | 2023-08 | 70-150 | sin objetivo | — | H |
| Zinc | 1,11 µg/mL | 2023-08 | 0,66-1,10 | sin objetivo | — | H |

**Vitamina D — el punto más accionable, dicho sin cruzar la línea.** 11,2 ng/mL está por debajo del
umbral de deficiencia de todas las definiciones publicadas. **Nunca se re-midió: hace 36 meses.**

Dos matices que la primera versión de este análisis se saltó y la revisión adversarial rescató:
- Se midió en **agosto en Argentina**, es decir en el **nadir invernal austral**. Una parte del
  valor es estacional y no es directamente comparable con un valor de verano en Madrid.
- **No pongo dosis aquí.** Corregir una deficiencia documentada es decisión médica, con pauta y
  control posterior. El borrador incluía tres menús de dosificación de guías junto a tu valor, y
  eso es exactamente lo que un sistema de entrenamiento no debe hacer.

Nota operativa: `plans/nutrition-notes.md` sugiere vitamina D a 1.000-2.000 UI/día con la coletilla
*"get blood levels tested if possible"*. **Ya se midió.** Esa cifra es de mantenimiento
poblacional, no de corrección de una deficiencia. Es conversación con tu médico.

**Homocisteína — por qué un 4 y no un 5.** No hay diana terapéutica, y la razón es de fondo: la
revisión **Cochrane 2017 (15 ECA, 71.422 participantes, evidencia de calidad ALTA)** encontró que
**bajar la homocisteína no cambia los desenlaces duros**. Un marcador sin diana no puede tener un 5.

### Órganos y hormonas

| Marcador | Último valor | Fecha | Rango del laboratorio | Objetivo por guías | Puntaje | Antig. |
|---|---|---|---|---|---|---|
| TSH | 3,07 mUI/L | 2024-09 | 0,27-4,20 | sin objetivo en eutiroideo → **tope en 4** por la Regla A | **4** | C |
| T4 libre | 1,28 ng/dL | 2024-09 | 0,93-1,70 | sin objetivo | — | C |
| Creatinina | 1,15 mg/dL | 2024-09 | 0,70-1,20 | **KDIGO 2024: sólo interesa como insumo de la TFGe** | **4** | C |
| TFGe (CKD-EPI) | 84 mL/min/1,73m² | 2024-09 | — | G2 (60-89) | **4** | C |
| **Urea** | **59,0 mg/dL** | 2024-09 | 16,6-48,5 | **KDIGO 2024 no usa urea** para estadificar | **2** | C |
| AST / ALT | 27 / 29 U/L | 2024-09 | <40 / <41 | sin objetivo | en rango* | C |
| FAL | 63 U/L | 2024-09 | 40-129 | sin objetivo | en rango | C |
| Bilirrubina total | 0,9 mg/dL | 2024-09 | ≤1,2 | sin objetivo | en rango | C |
| Cortisol salival matutino | 0,56 µg/dL | 2023-08 | <0,74 | sin objetivo | en rango | H |
| **Testosterona total y libre, SHBG** | **nunca medidas** | — | — | — | — | — |

`*` con marca de confusor: el entrenamiento de fuerza mueve AST, ALT, CK y LDH.

### Inflamación

| Marcador | Último valor | Fecha | Rango del laboratorio | Objetivo por guías | Puntaje | Antig. |
|---|---|---|---|---|---|---|
| PCR | 0,24 mg/dL | 2023-08 | <0,80 | **estratos no aplicables** (ver abajo) | — | H |
| **ESR** | **21 mm** | 2024-06 | 0-15 (hombres) | sin diana; marcador inespecífico | **2** | H |

**Por qué la PCR no se puntúa aunque exista una escala de riesgo famosa.** Los estratos
`<1 / 1-3 / >3 mg/L` son de **PCR ultrasensible**. El intervalo que imprime IACA (<0,80 **mg/dL**)
es de PCR estándar. Aplicar unos estratos de un ensayo a los valores de otro es un error de método,
no un atajo — así que no se aplican. Para poder usarlos hace falta pedir **PCR ultrasensible**, que
nunca se ha medido.

**La ESR pasa de 5 mm (jun-2023) a 21 mm (jun-2024)** sin PCR simultánea con la que contrastar. Es
un marcador inespecífico, en una medición aislada, y el ejercicio intenso en días previos lo sube.
Repetir junto a PCR ultrasensible; no es un dato con el que preocuparse hoy, pero tampoco uno que
convenga dejar sin cerrar.

### 🔧 Dos puntajes corregidos al implementar la rúbrica en código

Escribir `app/bloodwork.js` y el test que lo compara con esta tabla encontró dos filas que **mi
propia rúbrica no soportaba**. Se corrigen aquí:

| Marcador | Decía | Dice | Por qué |
|---|---|---|---|
| TSH 3,07 | 3 | **4** | El 3 venía de un "óptimo <2,5" que **no sale de ninguna guía vigente** — es de los rangos de medicina funcional que esta jerarquía de fuentes excluye por escrito. Sin diana publicada, estar dentro del intervalo es un 4 (Regla A) y no hay 5 que ganar |
| Urea 59,0 | 4 | **2** | Un 4 a un valor **por encima del intervalo de referencia** es incoherente con la propia escala. Que KDIGO no use urea explica por qué no hay diana —y por eso topa en 4— pero no convierte un valor fuera de rango en uno dentro |

El test [`tests/verify-bloodwork.mjs`](../../tests/verify-bloodwork.mjs) compara **fila a fila** los
valores, las fechas y los puntajes de esta tabla con los que produce `app/bloodwork.js`. Si vuelven
a divergir, falla. Se corre desde la raíz del repo:

```bash
node tests/verify-bloodwork.mjs
node tests/verify-analytics-render.mjs
```

**La urea, reformulada.** El borrador titulaba *"es un hallazgo dietético y de hidratación, no
renal"* — eso es un diagnóstico por exclusión y la revisión lo marcó como crítico. El hecho
descriptivo, que es lo que corresponde: **urea 59,0 por encima del intervalo (16,6-48,5), con
creatinina 1,15 en rango, TFGe 84, tira de proteínas negativa y densidad urinaria 1.036 en la misma
extracción.** Una densidad de 1.036 indica orina muy concentrada. Qué explica ese conjunto es una
pregunta para tu médico; lo que sí es una acción concreta es **repetirla en ayunas, bien hidratado y
con 48 h sin sesión dura**.

**Creatinina — un dato nuevo que el procesado anterior se perdió.** Hay tres mediciones, no una:
**1,44 (2021) → 1,40 (2023-06) → 1,15 (2024-09)**. El documento anterior sólo registraba la de 2024.

Y una sugerencia con respaldo de guía: **KDIGO 2024 recomienda que, cuando la creatinina puede no
ser fiable, la TFG se estime con la ecuación que combina creatinina y cistatina C** (`eGFRcr-cys`).
Con 72,8 kg de masa magra medida y una TFGe de 84 (categoría G2), es exactamente ese caso — la
creatinina alta-normal en alguien con mucha masa muscular es el resultado **esperado**, no una
desviación. **Cistatina C nunca se ha medido**, y sin ella no se puede leer "función renal
disminuida" a partir de ese 84.

---

## 3 · Correlaciones y causalidad: lo que estos datos no permiten

Pediste correlaciones. La respuesta honesta es que **no se pueden calcular**, y el motivo es el
tamaño de la muestra, no la técnica.

**Mediciones por marcador:** glucosa 5 · urea 4 · ALT 4 · AST 4 · hemoglobina 4 · LDL 3 ·
colesterol total 3 · HDL 3 · triglicéridos 3 · creatinina 3 · TSH 3 · insulina 2 · HOMA 2 · ESR 2 ·
HbA1c 1 · ApoB 1 · CK 1 · LDH 1 · vitamina D 1 · ferritina 1 · cortisol 1 · **Lp(a) 0**.

Para correlacionar dos marcadores hacen falta ambos en la misma extracción, y ahí el n conjunto cae
a 2 o 3 en casi todos los pares. **ApoB y LDL coinciden en cero extracciones. Insulina y LDL, en
cero.** Con n=2 el coeficiente de correlación sale ±1 por geometría, no por biología. Con n=3 el
intervalo de confianza de una r abarca casi todo el rango [−1, +1]: sería compatible a la vez con
"no hay relación" y con "relación perfecta". Publicar ese número sería fabricar rigor.

**Tampoco se pueden ajustar pendientes temporales**, por tres razones que se acumulan:
1. Los intervalos entre paneles son 25,5 · 1,3 · 9,9 · 3,5 · 4,5 meses. Una pendiente sobre puntos
   así la domina qué dos puntos quedan más separados, no la trayectoria.
2. **Confusión perfecta entre tiempo y laboratorio**: los cinco primeros paneles son de IACA y el
   último de LabCorp. El coeficiente de "tiempo" *es* el coeficiente de "laboratorio, país y
   plataforma analítica". No hay ninguna extracción medida por los dos a la vez.
3. Los propios laboratorios cambiaron de convención dentro de la serie: IACA imprimió glucosa
   70-110 en 2021 y 70-100 después; triglicéridos deseables <150 en 2021 y <175 en 2024.

**Y no se puede atribuir causalidad**, que no es una debilidad de inferencia sino ausencia de
variable independiente: no hay contrafactual, ni aleatorización, ni exposición encendida-apagada. A
lo que se suma que los datos de entrenamiento del sistema **empiezan en abril de 2026** y las
analíticas acaban en febrero de 2025: **no hay solape**.

### Marcadores acoplados: no son hallazgos independientes

Verificado reproduciendo la aritmética:

| Acoplamiento | Verificación |
|---|---|
| HOMA-IR = glucosa × insulina / 405 | (106×10,6)/405 = 2,77 ≈ **2,8** · (95×5,5)/405 = 1,29 ≈ **1,3** ✓ |
| no-HDL = total − HDL | 226−66 = **160** · 260−68 = **192** · 230−65 = **165** ✓ |
| LDL calculado = f(total, HDL, TG) | Ecuación NIH/Sampson sobre los números de 2025 → 142,8, frente al **143** informado (error 0,2) ✓ |
| VLDL = no-HDL − LDL | 22 mg/dL en los dos paneles recientes: es el residuo de la ecuación |
| Ratios LDL/HDL y total/HDL | 143/65 = **2,20** · 230/65 = **3,54** ✓ |

Consecuencia práctica: contar "glucosa + insulina + HOMA" como tres hallazgos **triplica el peso de
una sola extracción**. Y de los cuatro marcadores lipídicos "puntuables", tres son funciones de los
mismos tres números medidos.

### La corrección que me debo a mí mismo

Te dije que el cambio de ecuación de LDL debilitaba la lectura de 149 → 170 → 143. **Era incorrecto,
y la verificación lo demostró reproduciendo la aritmética:**

- Números de 2025 (total 230, HDL 65, TG 126): Sampson da **143** (el informado); Friedewald daría
  140. Diferencia: 3 mg/dL.
- Números de 2024 (total 260, HDL 68, TG 101): Sampson daría 175, Friedewald 172 — pero IACA
  informó **170**.

**La ecuación explica como máximo 5 de los 27 mg/dL.** El descenso vive en el **colesterol total
medido** (−30 mg/dL), que es el analito lipídico mejor estandarizado y trazable a CDC/NIST, o sea el
menos achacable a un cambio de laboratorio. El descenso es real en lo medido.

Pero apareció algo mejor: **ninguna ecuación publicada reproduce el 170 de IACA** a partir de sus
propios total/HDL/TG (Friedewald daría 172, Sampson 175). Así que **el método de IACA está sin
identificar**, y la hipótesis principal es que **midiera el LDL directamente** con un ensayo
homogéneo, práctica corriente en laboratorios latinoamericanos. Un LDL medido y un LDL calculado no
son comparables — por razones distintas y peores que dos ecuaciones distintas.

**Acción concreta:** preguntar a IACA si el LDL del 2024-09-20 fue medido o calculado, y con qué
método.

Y el veredicto de fondo se mantiene: **−15,9 % de colesterol total no supera el valor de cambio de
referencia, así que no se dibuja ninguna tendencia.** Tres extracciones en cinco años y dos
laboratorios no son una trayectoria.

### Variabilidad biológica: las fuentes usadas

Los coeficientes de variación intraindividual salen de estudios identificables, no de estimaciones:

| Fuente | Aporta |
|---|---|
| Carobene 2017 · *Clin Chem* 63(6):1141-50 · DOI 10.1373/clinchem.2016.269811 · PMID 28428356 | CVI de ALT 9,3 % · AST 9,5 % · FAL 5,3 % · LDH 5,2 % · CK 14,5 % |
| EuBIVAS · *Clin Chem* 2017;63(9):1527-36 · DOI 10.1373/clinchem.2017.275115 | CVI creatinina 4,4-4,7 % |
| Clouet-Foraison 2020 · *Clin Chem* 66(5):727-36 · DOI 10.1093/clinchem/hvaa054 | CVI ApoB 6,7 % · ApoA-I 4,8 % · Lp(a) 8,9 % |
| Selvin 2007 · *Arch Intern Med* 167(14):1545-51 · DOI 10.1001/archinte.167.14.1545 · PMID 17646610 | CV glucosa en ayunas 5,7 % · HbA1c 3,6 % |

---

## 4 · Suplementación

**Distinción que gobierna esta sección.** Un suplemento de rendimiento deportivo con evidencia
(creatina, cafeína) es nutrición deportiva y sus dosis están publicadas en position stands: se
pueden citar. **Corregir una deficiencia documentada de vitamina D es medicina** y sus dosis no
aparecen aquí. No es la misma cosa y tratarlas igual sería un error en cualquiera de las dos
direcciones.

### Lo que sí tiene evidencia

**Creatina monohidrato — la mejor apuesta, con un detalle que choca con tu objetivo.**

`Grupo A del AIS` · uno de los cinco que el COI reconoce con *"good evidence of benefits"*

| | |
|---|---|
| Dosis | 3-5 g/día. La fase de carga (~0,3 g/kg = ~26 g/día, 5-7 días) es **opcional**: con 5 g/día se llega a saturación más despacio |
| Magnitud | Masa libre de grasa **+1,39 kg** (IC 1,07-1,70); en **entrenados +1,82 kg** (IC 1,10-2,55) |
| Evidencia | La más sólida del mercado de suplementos |
| Seguridad | La ISSN no encuentra evidencia convincente de daño hasta 30 g/día durante 5 años en sanos |

Fuentes: Kreider 2017, position stand de la ISSN · DOI 10.1186/s12970-017-0173-z · PMID 28615996 [N1].
Meta-análisis dosis-respuesta: Ashtary-Larky 2025, *JISSN*, 61 ensayos, 1.457 participantes ·
DOI 10.1080/15502783.2025.2586523 · PMID 41433021 [N1].

⚠️ **El detalle que choca con tu objetivo:** el COI documenta **1-2 kg de aumento de masa corporal
por retención de agua intracelular** tras la carga. Con la báscula como objetivo declarado (79-81 kg),
eso es 1-2 kg que aparecen y que **no son grasa**. No es motivo para no tomarla — es motivo para
saltarse la carga, ir directo a 5 g/día, y no interpretar el salto inicial de la báscula como un
retroceso.

**Cafeína — efecto real, pequeño, y con un coste que tu sistema sí paga.**

`Grupo A del AIS` · ISSN 2021 (Guest) · DOI 10.1186/s12970-020-00383-4 · PMID 33388079 [N1]

Dosis estudiada: 3-6 mg/kg unos 60 min antes; la mínima eficaz puede ser 2 mg/kg; 9 mg/kg no añade
beneficio y sí efectos adversos. Magnitudes: resistencia aeróbica **2-4 %** (el dominio más
consistente) · resistencia muscular 6-7 % · **fuerza 2-7 %** (tamaño de efecto 0,16-0,20, o sea
pequeño) · salto 2-4 %.

Dos razones para tratarla con cabeza, no como café gratis:

1. **La genética manda más que la dosis.** Con el gen CYP1A2, el genotipo AA ("metabolizadores
   rápidos") mejoró un **6,8 %** con 4 mg/kg, mientras el CC **empeoró un 13,7 %**. No es un
   suplemento universalmente útil.
2. **En tu sistema tiene un coste concreto.** La arquitectura usa la recuperación de Whoop como
   puerta previa al entrenamiento. Para 87,1 kg, 3-6 mg/kg son **261-523 mg**: una dosis así por la
   tarde compromete el sueño, y el sueño es la puerta del día siguiente. Ya viste en la semana 29
   qué pasa cuando el sueño cae a 6,04 h. La cafeína no es gratis en un sistema que gestiona
   recuperación.

**Proteína en polvo — logística, no intervención.**

Morton 2018, *BJSM*, 49 ECA, 1.863 participantes · DOI 10.1136/bjsports-2017-097608 [N1]:
+2,49 kg en 1RM (IC 0,64-4,33) y +0,30 kg de masa libre de grasa (IC 0,09-0,52). El efecto es
**mayor en entrenados** (+0,75 kg), lo cual te favorece.

Pero el punto de inflexión: **por encima de 1,62 g/kg/día de proteína total no hubo más ganancias**.
Para 87,1 kg son 141 g/día — y tu suelo ya está en 185 g. Si llegas con comida, **el polvo es una
comodidad, no una intervención**. El AIS lo clasifica precisamente como *sports food*, no como
suplemento de rendimiento.

⚠️ **Y una limitación que casi nadie cita:** Morton **excluyó explícitamente a sujetos en
restricción energética** (*"Only trials with humans who were healthy and not energy-restricted were
accepted"*). El punto de inflexión de 1,62 g/kg **no se derivó en déficit**, que es exactamente tu
situación. Es la razón por la que el suelo de 185 g del plan de nutrición no contradice a Morton:
se apoya en literatura de déficit, que es otra.

**Omega-3** — 2-3 g/día, efecto moderado sobre el daño inducido por el ejercicio.
`Grupo B del AIS` (evidencia emergente o mixta). No es prioritario.

### Lo que no vale la pena, con fuente

| | Por qué |
|---|---|
| **Magnesio** | `Grupo C del AIS` (*"evidencia científica no favorable"*). Cochrane 2020 (Garrison, DOI 10.1002/14651858.CD009402.pub3): improbable que dé profilaxis de calambres clínicamente significativa |
| **BCAA y HMB** | `Grupo C del AIS`. Relevante porque **se venden como protectores de masa magra en déficit**, que es justo tu caso, y el AIS los pone donde corresponde |
| **Vitamina E** | Doble negativa independiente: `Grupo C del AIS` **y** recomendación **grado D** (en contra) de la USPSTF 2022 · DOI 10.1001/jama.2022.8970 · PMID 35727271 |
| **Multivitamínicos** | `Grupo B`, y la USPSTF 2022 concluye evidencia **insuficiente (grado I)** para prevención cardiovascular y de cáncer |
| **Vitaminas B sin déficit** | Cochrane 2017: sin reducción de infarto ni mortalidad, evidencia de **alta** calidad |
| Ácido alfa-lipoico, fosfato, SAMe, tirosina | `Grupo C del AIS` |

**Un riesgo transversal que no es el gasto.** El consenso del COI 2018 recuerda que en el estudio
seminal **~15 % de más de 600 productos** comprados en todo el mundo **contenían prohormonas no
declaradas**, que el problema persiste, y que la FDA ha retirado suplementos con dosis
potencialmente tóxicas de vitaminas A, D, **B6** y **selenio** — dos marcadores de tu propio panel.
Cada suplemento añadido es una superficie de riesgo, no sólo una línea de gasto.

**Nota concreta sobre la B6.** La EFSA **rebajó en 2023 el nivel máximo tolerable de 25 a 12 mg/día**
(DOI 10.2903/j.efsa.2023.8006 · PMID 37207271), con la neuropatía periférica como efecto crítico, y
señala que en Europa sólo lo superan quienes usan suplementos con dosis altas. Multivitamínicos,
pre-entrenos y bebidas energéticas suelen llevar B6 muy por encima de la necesidad. **Acción no
clínica y concreta: revisa las etiquetas de lo que tomas.** La interpretación de tu valor es médica.

### Vitamina D: qué se puede decir y qué no

**Lo que es un hecho:** 11,2 ng/mL = 28,0 nmol/L está por debajo del umbral de **todas** las
definiciones publicadas — IOM 2011 (20 ng/mL, y su EAR de 16), banda de deficiencia de la Endocrine
Society 2011 (<20), y objetivo de ≥50 nmol/L del grupo ESCEO 2022 [todas N1]. No hay ninguna lectura
razonable en la que sea normal.

**Lo que no se puede afirmar es cuál sería tu óptimo** — y esto corrige una cifra que circula por
todas partes, incluida la tabla de arriba de este documento. La guía **vigente** de la Endocrine
Society (Demay 2024 · DOI 10.1210/clinem/dgae290) dice literalmente que no hay *"clear evidence
defining the optimal target level of 25(OH)D required for disease prevention"*. La banda de
**40-60 ng/mL** que se repite en todas partes viene de la versión de **2011** de esa misma sociedad,
y la sociedad se ha desdicho. El consenso del COI 2018 va más allá: no hay consenso sobre las
concentraciones que definen deficiencia, insuficiencia ni suficiencia en deportistas, ni guías de
suplementación establecidas.

**Y dos matices más:** se midió en **agosto en Argentina**, es decir en el nadir invernal austral, y
hace **36 meses**.

**No hay dosis en esta sección.** Corregir una deficiencia documentada lleva pauta, duración y
control posterior, y es de tu médico. Lo que corresponde aquí es que el dato esté visible, con su
antigüedad, y que aparezca primero en la lista de qué volver a medir.

### Un flag que el rango del laboratorio te esconde

**Ferritina 191 ng/mL.** El laboratorio dice 30-400, así que "no da nada". La **OMS 2020** dice otra
cosa: en hombres sanos, **>200 µg/L indica riesgo de sobrecarga de hierro** [N1]. Estás a **nueve
unidades**.

A favor de que sea reserva real y no inflamación: en el mismo panel la PCR era 0,24 mg/dL (normal) y
la ESR de junio de 2023 era 5 mm. Es contexto para la próxima analítica, no una alarma — pero es
exactamente el tipo de cosa que un rango de laboratorio ancho oculta y un objetivo de guía no.

---

## 5 · Qué pedir en la próxima analítica

Ordenado por lo que más cambiaría la lectura:

1. **25-OH vitamina D** — deficiencia documentada hace 36 meses, nunca re-controlada. Lo más
   accionable de toda la lista.
2. **Lp(a)** — se mide **una sola vez en la vida** (es genética) y nunca se ha medido. Con no-HDL
   165 y ApoB 110, es la pieza que falta para estratificar riesgo.
3. **ApoB** — el marcador aterogénico más informativo del panel; el único dato es de hace 3 años.
4. **Testosterona total y libre + SHBG** — nunca medidas, en alguien con déficit prolongado. El
   sistema usa la libido como *proxy* en el seguimiento semanal; el marcador real no existe.
5. **Cistatina C con `eGFRcr-cys`** — para resolver si la TFGe de 84 refleja función renal o
   simplemente 72,8 kg de masa magra. Recomendación de KDIGO 2024 para este caso exacto.
6. **Perfil lipídico completo** — el último es de antes del cut de 2026.
7. **Urea, creatinina, tira de orina** — repetidas **en condiciones controladas** (ver abajo).
8. **PCR ultrasensible + ESR** — la ESR de 21 mm (2024-06) nunca tuvo una PCR simultánea con la
   que contrastarla.
9. **HbA1c** — el único dato es de 2023, y es el marcador glucémico con menos ruido.

### Condiciones de la extracción, que importan más de lo que parece

- **En ayunas.**
- **Bien hidratado** — la urea de 59 con densidad urinaria 1.036 en la misma muestra es la
  demostración de por qué.
- **Sin entrenamiento fuerte 48 h antes** — mueve CK, AST, ALT y la ESR.
- **Mismo laboratorio** para todo lo que quieras comparar en el futuro. La confusión
  tiempo-laboratorio de esta serie es irreparable hacia atrás; hacia adelante es evitable.

---

## Trazabilidad

- Los PDF originales quedan intactos en `data/raw/Blood Tests/` y `data/00. Blood Tests/`.
- 8 registros de panel extraídos → **6 paneles únicos**. `Analisis 2024.pdf` de la carpeta `00.` es
  el mismo informe que `Sept 20 2024.pdf` (nro. 014-67103-527); la única diferencia es que uno es
  una reemisión de 2026 con distinta paginación. No se cuenta dos veces.
- **Reconstrucción del hemograma**: el volcado con `-layout` desplaza los valores una fila respecto
  de su etiqueta. Validado por dos vías independientes — coherencia de unidades y aritmética de los
  índices (VCM = Hct×10/GR = 90,9 ≈ 90,1 · HCM = Hb×10/GR = 30,66 ≈ 30,7 · CHCM = Hb/Hct = 33,7 ≈
  34,0) y de la fórmula leucocitaria (2.752+512+128+2.560+448 = 6.400 exacto).
- **8 valores marcados como inciertos** y por tanto sin puntuar, todos del sedimento urinario
  (cilindros, cristales, bacterias) de 2021 y 2024.
- Ninguna cifra de este documento es inferida. Lo no medido aparece como "nunca medido".
