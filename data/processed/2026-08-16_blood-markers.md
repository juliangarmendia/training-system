# Marcadores sanguíneos — serie longitudinal 2021-2024

> Procesado: 2026-08-16. Fuente: los 5 PDF de `data/raw/Blood Tests/` (laboratorio IACA, Bahía
> Blanca / Buenos Aires, Argentina). Extraídos con `pdftotext -layout`.

## ⚠️ Estos datos NO describen tu estado actual

La analítica más reciente es del **2024-09-20**: hace ~23 meses. Desde entonces hubo un cut
completo, ~6 semanas de parón, una mudanza a España y un cambio de dieta y de volumen de
entrenamiento. **Sirve como baseline histórico, no como estado presente.**

Ninguna regla del sistema debe dispararse sobre estos valores. Su único uso legítimo hoy es
(a) señalar qué conviene volver a medir y (b) dar un punto de partida contra el que comparar la
próxima analítica.

## Analíticas disponibles

| Fecha | Informe | Alcance |
|---|---|---|
| 2021-05-14 | 013-63849-1194 | Hemograma, glucemia, **perfil lipídico**, ionograma, hepatograma, TSH, orina |
| 2023-06-28 | — | Hemograma, ESR, glucemia, urea, PCR, ionograma, Ca/Mg, hepatograma, CK, LDH, TSH, T4L, β2-microglobulina |
| 2023-08-04 | 002-66690-1817 | **El más completo**: HbA1c, ApoA/ApoB, PCR, ferritina, B12, folato, vit. D, cortisol salival, insulina, HOMA, homocisteína, selenio, zinc, B6, gases en sangre |
| 2024-06-04 | — | Hemograma, **ESR**, glucemia, urea, hepatograma |
| 2024-09-20 | 014-67103-527 | Hemograma, glucemia, urea, creatinina, **TFGe**, **perfil lipídico**, ionograma, hepatograma, TSH, T4L, insulina, **HOMA**, orina |

`—` = no medido en esa fecha.

## Lípidos y riesgo cardiovascular

| Marcador | 2021-05-14 | 2023-08-04 | 2024-09-20 | Referencia | Lectura |
|---|---|---|---|---|---|
| Colesterol total (mg/dL) | 226 | — | **260** | deseable <200 · elevado ≥240 | ⚠️ elevado y subiendo |
| Colesterol LDL (mg/dL) | 149 | — | **170** | deseable <130 | ⚠️ elevado y subiendo |
| Colesterol HDL (mg/dL) | 66 | — | 68 | elevado ≥60 | ✅ bueno y estable |
| Triglicéridos (mg/dL) | 54 | — | 101 | deseable <175 | ✅ dentro de rango |
| Colesterol no-HDL (mg/dL) | 160 | — | *(no informado)* | — | — |
| **Apolipoproteína B** (mg/dL) | — | **110** | — | 66-133 (rango del lab) | ⚠️ ver nota |
| Apolipoproteína A (mg/dL) | — | 141 | — | 104-202 | ✅ |

**Nota sobre ApoB.** El rango del laboratorio (66-133) es un intervalo poblacional, no un objetivo
de riesgo. Las guías de prevención cardiovascular manejan umbrales bastante más bajos para riesgo
óptimo. 110 mg/dL no es una alarma, pero tampoco es "normal, todo bien": es el marcador aterogénico
más informativo del panel y conviene volver a medirlo junto a Lp(a).

**Este es el hallazgo más relevante de las 5 analíticas.** LDL +21 mg/dL y colesterol total
+34 mg/dL en 3,4 años, con HDL y triglicéridos intactos. El patrón (HDL alto, TG bajos, LDL alto)
no es el del síndrome metabólico — la glucemia y el HOMA lo confirman. Merece una analítica nueva
y conversación médica, no un cambio de entrenamiento.

## Glucemia e insulina

| Marcador | 2021-05-14 | 2023-06-28 | 2023-08-04 | 2024-06-04 | 2024-09-20 | Referencia |
|---|---|---|---|---|---|---|
| Glucosa (mg/dL) | 91 | 95 | 106 | 98 | 95 | 70-100 |
| HbA1c NGSP (%) | — | — | 5,3 | — | — | ≤5,6 (prediabetes 5,7-6,4) |
| HbA1c IFCC (mmol/mol) | — | — | 34 | — | — | ≤38 |
| Insulina (mU/L) | — | — | 10,6 | — | **5,5** | 3,0-24,0 |
| **HOMA-IR** | — | — | **2,8** | — | **1,3** | <2,5 |

✅ **Mejora clara.** HOMA de 2,8 (por encima del corte) a 1,3 entre ago-2023 y sep-2024, con la
insulina en ayunas casi a la mitad. La HbA1c de 5,3% descarta prediabetes en 2023. La glucemia de
106 de ago-2023 es un valor aislado que no se repite.

## Inflamación

| Marcador | 2023-06-28 | 2023-08-04 | 2024-06-04 | Referencia |
|---|---|---|---|---|
| PCR (mg/dL) | 0,09 | 0,24 | — | <0,80 |
| Eritrosedimentación (mm) | 5 | — | **21** | hombres 0-15 |

⚠️ La ESR pasa de 5 a 21 mm entre jun-2023 y jun-2024. Está por encima del rango, pero es un
marcador **inespecífico** y una medición aislada: sube por infección reciente, ejercicio intenso
en días previos, o sin causa identificable. No hay PCR simultánea para contrastar. Vale la pena
repetir ESR + PCR en la próxima analítica; no vale la pena preocuparse hoy con este dato solo.

## Riñón y estado de hidratación

| Marcador | 2021-05-14 | 2023-06-28 | 2024-06-04 | 2024-09-20 | Referencia |
|---|---|---|---|---|---|
| Urea (mg/dL) | 35,0 | 40,0 | 32,0 | **59,0** | 16,6-48,5 |
| Creatinina (mg/dL) | — | — | — | 1,15 | hombres 0,70-1,20 |
| TFGe CKD-EPI (mL/min/1,73m²) | — | — | — | 84 | — |
| Densidad urinaria | 1.022 | — | — | **1.036** | — |

⚠️ La urea de 59 y la densidad urinaria de 1.036 son de **la misma extracción**. Una densidad de
1.036 indica orina muy concentrada, es decir, deshidratación en el momento de la muestra. Con dieta
alta en proteína, eso explica bien una urea alta con creatinina y filtrado glomerular normales. Es
una lectura razonable, **no una confirmación**: para separarlo haría falta repetir en estado
hidratado. Se relaciona directamente con la regla de hidratación pre-sesión (REC-006).

## Hepatograma

| Marcador | 2021-05-14 | 2023-06-28 | 2024-06-04 | 2024-09-20 | Referencia (hombres) |
|---|---|---|---|---|---|
| TGO/AST (U/L) | 25 | 27 | 27 | 27 | <40 |
| TGP/ALT (U/L) | 19 | 33 | 25 | 29 | <41 |
| FAL (U/L) | 64 | 59 | 58 | 63 | 40-129 |
| Bilirrubina total (mg/dL) | 1,1 | 0,8 | 0,3 | 0,9 | ≤1,2 |
| Bilirrubina conjugada (mg/dL) | 0,4 | 0,3 | 0,2 | 0,3 | ≤0,2 |

✅ Estable y dentro de rango en 4 analíticas a lo largo de 3,4 años. La bilirrubina conjugada roza
el límite de forma consistente, con la total siempre normal — patrón habitual y sin significado
clínico por sí solo.

## Tiroides

| Marcador | 2021-05-14 | 2023-06-28 | 2024-09-20 | Referencia |
|---|---|---|---|---|
| TSH (mUI/L) | 2,45 | 3,33 | 3,07 | 0,27-4,20 |
| T4 libre (ng/dL) | — | 1,22 | 1,28 | 0,93-1,70 |

✅ Normal y estable. Relevante para el seguimiento de déficit prolongado: la adaptación metabólica
puede mover la TSH, así que estos valores son un buen punto de comparación tras un cut largo.

## Vitaminas, minerales y cortisol (solo 2023-08-04)

| Marcador | Valor | Referencia | Lectura |
|---|---|---|---|
| **25-OH Vitamina D (ng/mL)** | **11,2** | óptimo >30 · insuficiencia 20-30 · **deficiencia <20** | 🔴 **deficiencia** |
| Vitamina B12 (pg/mL) | 682 | 197-771 | ✅ |
| Ácido fólico (ng/mL) | 7,2 | 4,6-34,8 | ✅ (mitad baja) |
| Homocisteína (µmol/L) | 9 | <15 | ✅ |
| Ferritina (ng/mL) | 191 | hombres 30-400 | ✅ |
| Selenio (ng/mL) | 82 | >1 año: 70-150 | ✅ (mitad baja) |
| Zinc (µg/mL) | 1,11 | ≥11 años: 0,66-1,10 | ✅ (justo en el límite alto, sin relevancia) |
| Vitamina B6 (piridoxal-P, µg/L) | 42 | *(rango no legible en el PDF)* `uncertain` | — |
| Cortisol libre matutino, saliva (µg/dL) | 0,56 | <0,74 (8 h) | ✅ |
| Cortisol libre nocturno, saliva (µg/dL) | <0,11 | <0,28 (23 h) | ✅ ritmo conservado |

🔴 **La vitamina D en 11,2 ng/mL es deficiencia franca**, no insuficiencia. Es el segundo hallazgo
importante y nunca se volvió a medir. Nota operativa: `plans/nutrition-notes.md` recomienda vitamina
D en Tier 2 a **1.000-2.000 UI/día** con la coletilla "get blood levels tested if possible" — ya se
midió, y con una deficiencia documentada esa dosis es de mantenimiento, no de corrección. Corregir
una deficiencia real es decisión médica, con dosis y control posterior. Añadido a los pendientes.

## Hemograma (2024-09-20, el más reciente)

Serie roja: eritrocitos 4.730.000/mm³ · hematocrito 43% · hemoglobina 14,5 g/dL · VCM 90,1 fL ·
HCM 30,7 pg · CHCM 34,0% · RDW 11,9%.
Serie blanca: leucocitos 6.400/mm³ — neutrófilos segmentados 43% (2.752) · eosinófilos 8% (512) ·
basófilos 2% (128) · linfocitos 40% (2.560) · monocitos 7% (448). Plaquetas 362.000/mm³.
Observación del laboratorio: *"Serie eritrocitaria sin observaciones. Eosinofilia absoluta leve."*

Leucocitos totales por año: 6.000 (2021) · 7.300 (jun-2023) · 6.000 (jun-2024) · 6.400 (sep-2024).

> **Reconstrucción del hemograma.** En el volcado de texto los valores del hemograma aparecen
> desplazados una fila respecto de su etiqueta. La correspondencia de arriba se verificó por dos
> vías independientes: las unidades (`/mm³`, `%`, `g/dL`, `fL`, `pg`) y la aritmética de la serie
> blanca — los porcentajes suman 100% y cada absoluto coincide con `6.400 × %` (43%→2.752,
> 8%→512, 2%→128, 40%→2.560, 7%→448). Con esa doble comprobación la reconstrucción es fiable.

## Nunca medido

| Marcador | Por qué importa aquí |
|---|---|
| **Testosterona total y libre, SHBG** | Ninguna de las 5 analíticas la incluye. El corpus vigila la baja disponibilidad energética por sus efectos endocrinos (Burke 2021) y `nutrition-notes.md` usa la **libido como proxy** en el seguimiento semanal — pero el marcador real nunca se midió. Es la ausencia más llamativa para alguien en déficit prolongado |
| **Lp(a)** | Se mide una vez en la vida (es genética). Con LDL 170 y ApoB 110, es la pieza que falta para estratificar riesgo de verdad |
| **VO₂max medido** | El predictor de mortalidad por cualquier causa mejor estudiado. Estimaciones de Whoop/COROS no son lo mismo |
| Vitamina D de control | Deficiencia documentada en 2023 sin re-medición |
| Perfil lipídico post-cut | El último es de sep-2024, antes del cut de 2026 |

## Recomendación

Una analítica nueva es el requisito para que el módulo de longevidad haga algo útil. Lo mínimo:
**perfil lipídico + ApoB + Lp(a) · glucosa + HbA1c + insulina (HOMA) · testosterona total y libre +
SHBG · 25-OH vitamina D · PCR ultrasensible + ESR · hepatograma · urea/creatinina/TFGe (bien
hidratado) · TSH.** En ayunas, sin entrenamiento fuerte las 48 h previas (mueve CK, AST/ALT y ESR)
y bien hidratado (la urea de sep-2024 muestra por qué).

## Trazabilidad

- Los PDF originales quedan intactos en `data/raw/Blood Tests/` (regla de `data-handling.md`).
- Todo valor de este documento procede del texto extraído. No hay ninguna cifra inferida: lo que
  no se pudo leer con certeza está marcado `uncertain` y lo no medido aparece como `—`.
- Las lecturas clínicas son orientativas y no sustituyen a un médico. Los rangos citados son los
  que imprime el propio laboratorio.
