# Source Coverage Audit

Auditoría de cobertura fuente→regla del corpus. Artefacto vivo: la sección de fichas se actualiza al
verificar fuentes. Reglas en [`evidence-to-rules.md`](./evidence-to-rules.md); clasificación en
[`corpus-map.md`](./corpus-map.md); readiness de reglas en [`rule-readiness.md`](./rule-readiness.md).

## Modelo de verificación

Dos flags independientes; **ambos** requeridos para `included_verified`:
- **`source_verified`** — el paper existe y fue localizado: DOI/PMID · journal · año · tipo · población · n.
- **`claim_verified`** — el claim concreto que usa la regla está realmente respaldado por ese paper.

`Status` ∈ `included_verified` (source ∧ claim) · `included_provisional` (citado sin verificar) ·
`pending_research` · `out_of_scope_for_this_phase` · `excluded_with_reason` · `not_found`.

Regla dura: una fuente NO es `included_verified` solo porque exista (`source_verified`); el claim debe
estar respaldado (`claim_verified`).

---

## Fichas de fuentes verificadas (ronda 1 — 2026-06-23)

> Verificadas vía búsqueda web por agentes; DOIs/PMIDs confirmados en PubMed/editor. Ninguna inventada.

### M1 — Strength / hypertrophy

**Currier 2023 (BJSM)** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Currier BS, McLeod JC, Banfield L, et al. *Resistance training prescription for muscle strength and hypertrophy in healthy adults: a systematic review and Bayesian network meta-analysis.* Br J Sports Med 2023;57(18):1211–1220. **DOI 10.1136/bjsports-2023-106807 · PMID 37414459.**
- Tipo: systematic review + Bayesian network meta-analysis. Población: healthy adults, mixed training status, ~45-47% mujeres. n: strength 178 estudios/5097; hypertrophy 119/3364.
- Claim (STR-002/003/004/005): SUPPORTED. Fuerza favorece alta intensidad (>80%1RM, multiset, **3×/sem** ligeramente mejor para fuerza máxima); hipertrofia dirigida por volumen/sets; 2×/sem es frecuencia baseline/hipertrofia.
- Aplicabilidad: **indirecta** (sin brazos en déficit). evidenceLevel **strong**, confidence high.
- **Distinto del ACSM 2026 Position Stand** (Med Sci Sports Exerc 2026;58(4):851-872, doi 10.1249/MSS.0000000000003897) — confirmado.

**Robinson 2024 (antes mal citado como "Refalo 2024")** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Robinson ZP, Pelland JC, Remmert JF, **Refalo MC**, Jukic I, Steele J, Zourdos MD. *Exploring the Dose–Response Relationship Between Estimated RT Proximity to Failure, Strength Gain, and Muscle Hypertrophy: A Series of Meta-Regressions.* Sports Med 2024;54(9):2209–2231. **DOI 10.1007/s40279-024-02069-2.**
- Tipo: serie de meta-regresiones. Población: trained+untrained, mixto. n: 55 hipertrofia / 67 fuerza.
- Claim (STR-004): SUPPORTED. Hipertrofia aumenta modestamente cerca del fallo; **fuerza insensible al RIR** (CIs incluyen el nulo). evidenceLevel **moderate** (RIR estimado, ajuste modesto), confidence **high** para la dirección.
- **Corrección de cita:** la meta-regresión que cubre fuerza+hipertrofia es Robinson 2024, no Refalo. Refalo 2023 (Sports Med, doi 10.1007/s40279-022-01784-y, PMID 36334240) es solo-hipertrofia; Refalo 2024 es un RCT (PMID 38970765).

**Moesgaard 2022** — `source_verified ✓ · claim_verified ⚠ parcial · included_verified`
- Moesgaard L, Beck MM, Christiansen L, Aagaard P, Lundbye-Jensen J. *Effects of Periodization on Strength and Muscle Hypertrophy in Volume-Equated RT Programs: A Systematic Review and Meta-analysis.* Sports Med 2022;52(7):1647–1666. **DOI 10.1007/s40279-021-01636-1 · PMID 35044672.**
- Claim (STR-008): hipertrofia LP≈UP a volumen igualado = **SUPPORTED**. Fuerza LP≈UP = **NOT SUPPORTED**: UP modestamente *superior* a LP para 1RM, efecto impulsado por **entrenados**. evidenceLevel moderate, confidence medium. Aplicabilidad: directa (subgrupo entrenado).

**Williams 2017** — `source_verified ✓ · claim_verified ✗ (reatribuido) · included_verified`
- Williams TD, Tolusso DV, Fedewa MV, Esco MR. *Comparison of Periodized and Non-Periodized RT on Maximal Strength: A Meta-Analysis.* Sports Med 2017;47(10):2083–2100. **DOI 10.1007/s40279-017-0734-y · PMID 28497285.**
- Claim: compara **periodizado vs NO-periodizado** (no LP vs UP). Periodizado > no-periodizado para fuerza (d~0.43→0.23). **No soporta** la equivalencia LP≈UP; reatribuido a "periodizar > no periodizar".

### M2 — Recomposition / nutrition

**Barakat 2020** — `source_verified ✓ · claim_verified ✓ · included_verified` (evidenceLevel **expert**)
- Barakat C, Pearson J, Escalante G, Campbell B, De Souza EO. *Body Recomposition: Can Trained Individuals Build Muscle and Lose Fat at the Same Time?* Strength Cond J 2020;42(5):7–21. **DOI 10.1519/SSC.0000000000000584.**
- Tipo: **narrative review** (no meta). Claim (REC-003): SUPPORTED — recomp posible en entrenados, magnitud decrece con edad de entrenamiento. evidenceLevel **expert** (narrativa), confidence medium. **Cifra 2.3-3.1 g/kg es por masa magra (Helms 2014), NO por peso corporal.**

**Murphy & Koehler 2022** — `source_verified ✓ · claim_verified ✓ (con corrección) · included_verified`
- Murphy C, Koehler K. *Energy deficiency impairs resistance training gains in lean mass but not strength: A meta-analysis and meta-regression.* Scand J Med Sci Sports 2022;32(1):125–137. **DOI 10.1111/sms.14075.**
- Tipo: meta-análisis + meta-regresión. Población: mixta, RT+ED skew IMC alto (~32.7). n: 38 estudios.
- Claim (STR-001/REC-002): SUPPORTED — déficit frena masa magra (ES −0.57) no fuerza; escala con severidad; umbral ~500 kcal/día. **NO SUPPORTED: "los más lean pierden más músculo"** — encontró que IMC más alto ganó MENOS masa magra (posible confusión por IMC). evidenceLevel moderate, confidence high (fuerza/umbral), low (claim de leanness).

**Nunes 2022** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Nunes EA, Colenso-Semple L, McKellar SR, et al. *Systematic review and meta-analysis of protein intake to support muscle mass and function in healthy adults.* J Cachexia Sarcopenia Muscle 2022;13(2):795–810. **PMID 35187864 · DOI 10.1002/jcsm.12922.**
- Tipo: SR + meta (3-level) + GRADE. Población: healthy non-obese. n: 74 RCTs.
- Claim (REC-001): SUPPORTED — proteína ≥1.6 g/kg/día **con RT** mejora masa magra; **contingente a RT**. evidenceLevel **strong**, confidence high. Aplicabilidad: directa, pero estudios mayormente en mantenimiento → déficit es extrapolación.

### M3 — Concurrent training

**Huiberts 2024** — `source_verified ✓ · claim_verified ⚠ parcial · included_verified`
- Huiberts RO, Wüst RCI, van der Zwaard S. *Concurrent Strength and Endurance Training: A Systematic Review and Meta-Analysis on the Impact of Sex and Training Status.* Sports Med 2024;54(2):485–503. **DOI 10.1007/s40279-023-01943-9 · PMID 37847373.**
- Tipo: SR + meta. Población: adultos 18-50 (media 27), mayormente **untrained**. n: 59 estudios/1346.
- Claim (GEN-001/INT-005): interferencia real pero modesta, modulada por **sexo y training status** = SUPPORTED. **Modalidad/intensidad/volumen/proximidad NO los testea este paper** (eso es Wilson 2012). Fuerza inferior afectada en hombres SMD −0.43; potencia −0.27 a −0.52; superior no afectado; entrenados protegidos en VO2max. evidenceLevel moderate, confidence medium. Aplicabilidad indirecta.

**Wilson 2012** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Wilson JM, Marín PJ, Rhea MR, et al. *Concurrent training: a meta-analysis examining interference of aerobic and resistance exercises.* J Strength Cond Res 2012;26(8):2293–2307. **PMID 22002517 · DOI 10.1519/JSC.0b013e31823a3e2d.**
- Tipo: meta-análisis. n: 21 estudios, 422 ES. Población mixta/no-bien-entrenada.
- Claim (INT-001/002/004/006, SEL-004): SUPPORTED — running (no ciclismo) deprime hipertrofia y fuerza; **potencia lo más afectado** (ES 0.91→0.55); frecuencia/duración de endurance correlacionan negativo. "Lower-body" es inferencia. evidenceLevel moderate, confidence high (medium aplicabilidad).

### M4 — Endurance / running

**Seiler 2010** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Seiler S. *What is best practice for training intensity and duration distribution in endurance athletes?* Int J Sports Physiol Perform 2010;5(3):276–291. **DOI 10.1123/ijspp.5.3.276.**
- Tipo: invited review. Población: **elite/competitivos** (10-13 sesiones/sem). Claim (END-001/004, BUD-001): SUPPORTED 80/20, específicamente **polarizado** (≠ piramidal). evidenceLevel moderate, confidence medium. Aplicabilidad **extrapolada** (el principio transfiere; los % exactos no). Nota: Festa 2020 (38 corredores recreacionales) no halló diferencia polarizado vs threshold → atempera para este perfil.

**Stöggl & Sperlich 2014** — `included_verified` — Front Physiol 5:33, **DOI 10.3389/fphys.2014.00033 · PMID 24550842.** RCT, 48 well-trained. Polarizado superior (VO2peak +11.7%). moderate/medium.

**Rosenblat 2019** — `source_verified ✓ · claim_verified ⚠ · included_verified` — JSCR 33(12):3491–3500, **DOI 10.1519/JSC.0000000000002618 · PMID 29863593.** Meta de solo **3 estudios** (~65 atletas). Polarizado > threshold (ES −0.66, CI amplio). evidenceLevel **weak_extrapolated**, confidence low-medium.

**Blagrove 2018** — `included_verified` — Sports Med 2018;48(5):1117–1149, **PMID 29249083 · DOI 10.1007/s40279-017-0835-7.** SR, 24 estudios/~469 corredores entrenados. RE mejora 2-8% con fuerza pesada+pliometría; VO2max sin cambio. Claim (END-007): SUPPORTED. moderate/high.

**Berryman 2018** — `included_verified` — IJSPP 2018;13(1):57–63, **DOI 10.1123/ijspp.2017-0032.** Meta 28 estudios multi-deporte. Performance SMD 0.52, economía 0.65. SUPPORTED. moderate/high.

### M7 — Recovery / readiness

**Fullagar 2015** — `source_verified ✓ · claim_verified ⚠ parcial · included_verified`
- Fullagar HHK, Skorski S, Duffield R, et al. *Sleep and Athletic Performance...* Sports Med 2015;45(2):161–186. **DOI 10.1007/s40279-014-0260-0.**
- Tipo: **narrative review**. Claim (READ-006): la falta de sueño tiende a deteriorar rendimiento = SUPPORTED, pero el paper marca evidencia **equívoca**; no prueba "sueño = LA palanca primaria" (es inferencia razonable). evidenceLevel moderate, confidence medium.

**Saw 2016** — `source_verified ✓ · claim_verified ✓ · included_verified` (la mejor respaldada)
- Saw AE, Main LC, Gastin PB. *Monitoring the athlete training response: subjective self-reported measures trump commonly used objective measures: a systematic review.* Br J Sports Med 2016;50(5):281–291. **DOI 10.1136/bjsports-2015-094758 · PMID 26423706.**
- Tipo: systematic review. n: 56 estudios. Claim (READ-002/005): SUPPORTED — medidas subjetivas más sensibles que objetivas; subjetivo y objetivo no correlacionan. evidenceLevel moderate-to-strong, confidence high.

**Plews 2013 (+ Vesterinen 2016, Javaloyes 2019)** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Plews DJ, Laursen PB, Stanley J, Kilding AE, Buchheit M. *Training Adaptation and HRV in Elite Endurance Athletes...* Sports Med 2013;43(9):773–781. **DOI 10.1007/s40279-013-0071-8.** (+ Plews 2012 case study, PMID 22367011.)
- HRV-guided RCTs: Vesterinen 2016 (MSSE, **DOI 10.1249/MSS.0000000000000910**, n=40 recreacionales); Javaloyes 2019 (IJSPP, **PMID 29809080**, n=17 ciclistas); meta Granero-Gallegos 2020 (IJERPH 17(21):7999).
- Claim (READ-001/004): rolling 7d + baseline individual = SUPPORTED; HRV-guided ≥ predefinido = SUPPORTED (beneficio mayor en amateurs, menor en elite). evidenceLevel moderate, confidence medium-high (rolling), medium ("beats predefined"). **Caveat clave: Whoop reporta HRV de sueño propietaria, NO RMSSD matinal estandarizado — no intercambiable con la literatura.**

**Meeusen 2013** — `source_verified ✓ · claim_verified ✓ · included_verified` (evidenceLevel **expert**)
- Meeusen R, Duclos M, Foster C, et al. *Prevention, diagnosis and treatment of the overtraining syndrome: Joint consensus statement ECSS/ACSM.* Eur J Sport Sci 2013;13(1):1–24. **DOI 10.1080/17461391.2012.730061** (también MSSE 2013;45(1):186-205).
- Tipo: consensus statement. Claim (READ-008): framework FOR→NFOR→OTS, declive de rendimiento prolongado como signo cardinal = SUPPORTED. evidenceLevel **expert** (consenso), confidence high. Caveat: **advierte contra fiarse de un solo marcador** — no avala un readiness score como diagnóstico.

---

## Fichas de fuentes verificadas (ronda 2 — 2026-06-23)

### M8 — Load management / tendón

**Cook & Purdam 2009** — `source_verified ✓ · claim_verified ✓ · included_verified` (evidenceLevel **expert/model**)
- Cook JL, Purdam CR. *Is tendon pathology a continuum?* Br J Sports Med 2009;43(6):409-416. **doi 10.1136/bjsm.2008.051193 · PMID 18812414.** Narrative/model. Claim (LOAD-002/ATH-004): continuum reactivo→disrepair→degenerativo; load management fundamental; reposo total contraproducente = SUPPORTED (el "no reposo" es inferencia razonable del énfasis en load management). Aplicabilidad indirecta-directa.

**Malliaras 2013** — `source_verified ✓ · claim_verified ⚠ parcial · included_verified` (moderate)
- Malliaras P, et al. *Achilles and patellar tendinopathy loading programmes: SR.* Sports Med 2013;43(4):267-286. **doi 10.1007/s40279-013-0019-z · PMID 23494258.** 32 estudios. SUPPORTED para HSR/carga progresiva; **NO cubre isométricos** (re-fuente a Rio 2015, pending). Aplicabilidad directa.

**Impellizzeri 2020** — `source_verified ✓ · claim_verified ✓ · included_verified` (moderate)
- Impellizzeri FM, et al. *ACWR: Conceptual Issues and Fundamental Pitfalls.* IJSPP 2020;15(6):907-913. **doi 10.1123/ijspp.2019-0864.** Crítica metodológica. Claim (LOAD-001): ACWR defectuoso, umbrales rígidos inválidos = SUPPORTED. **No citar Coyne 2019 (PMID 31672929) — argumenta lo contrario.** Aplicabilidad indirecta.

**Nielsen 2012** — `source_verified ✓ · claim_verified ✗ · included_verified` (debilita la regla)
- Nielsen RO, et al. *Training errors and running related injuries: SR.* Int J Sports Phys Ther 2012;7(1):58-75. **PMID 22389869 · PMC3290924.** 31 estudios, ~24k. **INCONCLUSIVO**: no identifica qué errores causan lesión; el RCT de Buist no halló diferencia entre ~10.5% y ~23.7% de progresión. → END-003/LOAD-001 ablandadas; re-anclar a **Bertelsen 2017** (pending). evidenceLevel weak_extrapolated para el claim de spikes.

### M3 — Concurrent training

**Schumann 2022** — `source_verified ✓ · claim_verified ⚠ parcial · included_verified` (moderate)
- Schumann M, et al. *Compatibility of Concurrent Aerobic and Strength Training: updated SR+meta.* Sports Med 2022;52(3):601-612. **doi 10.1007/s40279-021-01587-7 · PMID 34757594.** ~43 estudios. SUPPORTED: interferencia **same-session** (potencia lo más afectado, SMD −0.28 explosiva); **orden lift-first débilmente soportado aquí** → INT-003 a weak_extrapolated. Aplicabilidad directa.

**Fyfe 2014** — `source_verified ✓ · claim_verified ⚠ parcial · included_verified` (**expert**, narrative)
- Fyfe JJ, Bishop DJ, Stepto NK. *Interference... Role of Individual Training Variables.* Sports Med 2014;44(6):743-762. **doi 10.1007/s40279-014-0162-1 · PMID 24728927.** Narrative/mecanístico. NOMBRA las palancas pero **no prueba** que gestionarlas reduzca interferencia; su propio 2016 halló que la intensidad NO mediaba. → INT-006 no sobre-interpretar. expert/medium.

### M9 — Selección · M6 — Athleticism · M4 — Cardio · M1 — Fuerza

**Haugen 2023** — `source_verified ✓ · claim_verified ✓ · included_verified` (moderate-high)
- Haugen ME, et al. *Free-weight vs machine-based strength training: SR+meta.* BMC Sports Sci Med Rehabil 2023;15(1):103. **doi 10.1186/s13102-023-00713-4 · PMID 37582807.** 13 estudios, n=1016. SUPPORTED (SEL-001): sin diferencia en hipertrofia/fuerza/salto; única diferencia fiable = **especificidad del test**. Aplicabilidad directa.

**Speirs 2016** — `source_verified ✓ · claim_verified ⚠ scope-limited · included_verified` (**weak_extrapolated**)
- Speirs DE, et al. *Unilateral vs Bilateral Squat Training...* JSCR 2016;30(2):386-392. **doi 10.1519/JSC.0000000000001096 · PMID 26200193.** RCT 5wk, **n=18 rugby juvenil masculino**. SUPPORTED pero scope-limitado (deporte/edad/sexo no coinciden; outcomes sprint/agility). → ATH-005 weak_extrapolated, confidence medium.

**Milanović 2015** — `source_verified ✓ · claim_verified ✓ · included_verified` (strong)
- Milanović Z, et al. *HIIT vs Continuous for VO2max: SR+meta.* Sports Med 2015;45(10):1469-1481. **doi 10.1007/s40279-015-0365-0 · PMID 26243014.** 28 trials, n=723. SUPPORTED (END-008): ambos suben VO2max; HIIT +1.2 ml/kg/min. Aplicabilidad directa-indirecta.

**Schoenfeld 2016 + Grgic 2022** — `source_verified ✓ · claim_verified ✓ · included_verified`
- Schoenfeld BJ, et al. *Longer Interset Rest Periods Enhance Strength and Hypertrophy in RT Men.* JSCR 2016;30(7):1805-1812. **doi 10.1519/JSC.0000000000001272 · PMID 26605807.** RCT n=21 entrenados. → STR-006 (descanso ≥2-3 min). moderate/medium-high. (Grgic 2017 es solo-hipertrofia/equívoco — no es la fuente principal.)
- Grgic J, Schoenfeld BJ, Orazem J, Sabol F. *Training to failure or not: SR+meta.* J Sport Health Sci 2022;11(2):202-211. **doi 10.1016/j.jshs.2021.01.007 · PMID 33497853.** 15 RCTs. SUPPORTED (STR-004): el fallo no es necesario para fuerza/hipertrofia. strong/high. (Ojo: PMID 33555822 es Vieira, no Grgic.)

## Correcciones aplicadas (ronda 2)
1. **STR-006** → fuente principal Schoenfeld 2016 (no Grgic 2017 solo).
2. **STR-004** → añadido Grgic 2022 (fallo no necesario).
3. **INT-003** → weak_extrapolated (Schumann débil para el ORDEN).
4. **INT-006** → caveat: Fyfe no prueba que gestionar palancas reduzca interferencia (Fyfe 2016 lo contradice).
5. **END-003** → weak_extrapolated (Nielsen inconcluso; Buist RCT nulo); re-anclar a Bertelsen 2017 (pending).
6. **LOAD-001** → Impellizzeri 2020 verificado (no-ACWR strong); spikes débil; no citar Coyne 2019.
7. **LOAD-002** → Cook&Purdam + Malliaras verificados; isométricos requieren Rio 2015 (pending).
8. **SEL-001** → Haugen 2023 verificado; caveat de especificidad del test.
9. **ATH-005** → Speirs verificado pero weak_extrapolated (n=18 rugby juvenil).
10. **END-008** → Milanović verificado (strong). **READ-006** → Mah verificado (moderate, n=11 sin control).

## Fuentes aún no verificadas (tras ronda 2)

| Source | Status | Notes |
|---|---|---|
| Bertelsen 2017 (running-injury framework) | pending_research | Mejor fuente para spikes→lesión que Nielsen 2012; re-anclar END-003/LOAD-001. |
| Rio 2015 (isometric analgesia) | pending_research | Necesaria para el sub-claim de isométricos en LOAD-002. |
| González-Badillo / velocity loss | pending_research | VBT no es regla núcleo; futura. |
| Wolf/Kassiano/Maeo (long-length), Pelland (volumen) | pending_research | STR-007/STR-003 sin verificar individualmente. |
| NSCA Essentials, Schoenfeld libro, Helms Pyramid, Nuckols/SBS, MASS, Trexler | included_provisional | Secundarias/terciarias; no requieren verificación de claim individual. |
| Coffey & Hawley | included_provisional | Mecanístico, de marco. |
| ISSN Creatine Position Stand | **out_of_scope_for_this_phase** | Suplementos fuera de alcance; viven en `research-log.md`. |
| AIS Sports Supplement Framework | **out_of_scope_for_this_phase** | Ídem. |
| ACSM GETP 12th ed., Currier 2023 (ya verificado), IOC supplement consensus | not_found / out_of_scope | GETP no incorporado; IOC supplement fuera de alcance. |
| ACSM 2026 RT Position Stand (Currier 2026) | included_verified | PDF en `data/ACSM/`, resumido en `acsm-summaries.md`. |

## Correcciones aplicadas al corpus (ronda 1)

1. **STR-004**: cita corregida de "Refalo 2024" → **Robinson et al. 2024** (Refalo coautor); evidenceLevel strong→moderate, confidence high para la dirección.
2. **STR-008** (nueva): claim de periodización reescrito — hipertrofia model-insensible (Moesgaard); fuerza favorece ondulante en entrenados; periodizado > no-periodizado (Williams).
3. **REC-003** (Barakat): evidenceLevel → **expert** (narrative review); nota proteína por LBM ≠ peso corporal.
4. **REC-002**: caveat corregido — "más lean → más pérdida de músculo" NO respaldado por Murphy & Koehler; lo respaldado es umbral ~500 kcal/día y que el déficit escala la pérdida.
5. **REC-001**: añadido Nunes 2022 (verificado, ≥1.6 g/kg con RT).
6. **Huiberts 2024**: reatribuido a modulación por sexo+training status; modalidad/timing → Wilson 2012.
7. **END-001**: caveat polarizado ≠ piramidal; Festa 2020 atempera para recreacionales.
8. **READ-001/004**: caveat Whoop = HRV de sueño, no RMSSD matinal.
9. **READ-008** (Meeusen): evidenceLevel → expert; caveat anti-marcador-único.
10. **STR-002/003/005**: añadido Currier 2023 BJSM como soporte.

## Gaps remanentes

- **Reglas sin paper nombrado:** REC-004 (muscle-memory), END-005 (decoupling = método), END-006 (práctica), READ-003/007 (experto), STR-010 (experto), GEN-003 (proceso), BUD-002 (experto), HYB-001..005 (extrapolado).
- **Pendientes de verificar:** Speirs (ATH-005), Mah, Fyfe, Schumann, González-Badillo.
- **Extrapolación poblacional explícita:** Seiler/Stöggl/Rosenblat (atletas elite → recreacional); Markovic/Sáez (atletas jóvenes); Wilson/Huiberts (mayormente no-entrenados); todas las fuentes carecen de brazos en déficit → el contexto de déficit es extrapolado en todo el corpus.
- **Suplementos:** fuera de alcance de esta fase (no olvidados).
