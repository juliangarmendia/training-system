# Corpus Map — índice maestro de la base científica

Mapa de qué literatura gobierna qué decisión del sistema **Evidence-based hybrid athletic
recomposition for trained adults**. Las reglas accionables viven en
[`evidence-to-rules.md`](./evidence-to-rules.md) (fuente de verdad); aquí se clasifican las **fuentes**
por módulo y se enlazan a los Rule IDs que producen.

**Clasificación de fuentes:**
- **Primaria** — papers, revisiones sistemáticas, meta-análisis, position stands.
- **Secundaria** — libros técnicos y textbooks.
- **Terciaria** — newsletters, research reviews, blogs/podcasts serios (interpretación).
- **Experto** — coaches/práctica aplicada. Útil, no domina sobre evidencia primaria.

**Enum de evidencia** (único): `strong | moderate | weak_extrapolated | expert`. Ver
[`evidence-grading.md`](./evidence-grading.md).

Perfil del usuario para el filtro de aplicabilidad: hombre 33, ~86 kg, ~21% grasa, multi-año
entrenado, vuelta de ~6 semanas de parón, historial lumbar (sumo DL RPE-gated), corredor novato
(~5 km), gimnasio comercial completo (David Lloyd Serrano). Objetivo: recomposición atlética híbrida.

---

## 1. Strength training avanzado

- **Primaria:** Currier et al. **2026** (ACSM RT Position Stand) y Currier et al. **2023** (BJSM Bayesian network meta-analysis — **documento distinto**, doi 10.1136/bjsports-2023-106807, verificado) · Pelland/Robinson 2024 (dosis-respuesta volumen) · **Robinson et al. 2024** (proximidad al fallo, meta-regresiones — antes mal citado como "Refalo 2024"; Refalo es coautor) · Schoenfeld/Grgic (volumen, frecuencia, descansos) · Wolf/Kassiano/Maeo (long muscle length) · Moesgaard 2022 + Williams 2017 (periodización → STR-008).
- **Secundaria:** NSCA Essentials of S&C · Schoenfeld *Science and Development of Muscle Hypertrophy* · Helms *M&S Pyramid – Training*.
- **Terciaria:** Stronger by Science (Nuckols), MASS, RP.
- **Experto:** —
- **Gobierna:** volumen, frecuencia, intensidad por rango, proximidad al fallo, ROM, descansos, orden, progresión, rotación de accesorios.
- **Aplicabilidad al usuario:** alta.
- **Población estudiada:** entrenados y mixta (novatos inflan efectos de volumen/frecuencia).
- **Estado energético:** mayoría en mantenimiento/superávit → caveat de déficit (techo de recuperación más bajo).
- **Nivel de evidencia:** strong (volumen/frecuencia/carga/descansos/fallo dirección); moderate (long-length, periodización).
- **Caveats:** dosis-respuesta derivada fuera de déficit.
- **Reglas derivadas:** STR-001..008, STR-010.

## 2. Recomposition in trained adults

- **Primaria:** Barakat 2020 (recomp en entrenados — **narrative review → expert**, no meta) · Murphy & Koehler 2022 (déficit y masa magra; verificado) · Helms 2014 (proteína en lean en restricción; cifra 2.3-3.1 g/kg es **por masa magra**) · **Nunes 2022** (proteína ≥1.6 g/kg con RT; meta de 74 RCTs, verificado) · ISSN Protein (Jäger 2017) · ISSN Diets & Body Composition (Aragon 2017) · Garthe 2011 · Byrne 2018 (MATADOR).
- **Fuera de alcance de esta fase (`out_of_scope_for_this_phase`):** suplementos — ISSN Creatine Position Stand, AIS Sports Supplement Framework, IOC supplement consensus. Creatina/cafeína ya viven en `research-log.md`; se reincorporarán al corpus en una fase de nutrición/suplementos dedicada. No es olvido.
- **Secundaria:** Helms *M&S Pyramid – Nutrition*.
- **Terciaria:** MASS, Eric Trexler (adaptación metabólica).
- **Experto:** —
- **Gobierna:** tamaño de déficit, proteína, ritmo de pérdida, diet breaks, gestión de expectativas, ventana de retorno.
- **Aplicabilidad:** alta (de las pocas fuentes *trained-specific* — el corazón del perfil).
- **Población:** entrenados/lean athletes.
- **Estado energético:** déficit (específicamente).
- **Nivel de evidencia:** strong (proteína, ritmo lento, fuerza preservada); moderate (magnitud de recomp, diet breaks).
- **Caveats:** "grasa rápida + músculo" es fenómeno de novato/retorno; aprovechar ventana de re-entry.
- **Reglas:** REC-001..005, STR-001.

## 3. Concurrent training

- **Primaria:** Huiberts 2024 (revisión sistemática) · Wilson 2012 (meta clásico) · Schumann 2022 (orden/recuperación) · Fyfe · Coffey & Hawley (base molecular, de marco).
- **Secundaria:** NSCA (capítulo concurrent).
- **Terciaria:** SBS, MASS.
- **Experto:** —
- **Gobierna:** elección de modalidad, espaciado de sesiones, orden intra-sesión, protección de potencia, cap de endurance.
- **Aplicabilidad:** alta.
- **Población:** entrenados/recreacionales.
- **Estado energético:** mantenimiento (mayoría).
- **Nivel de evidencia:** strong (running>bici, potencia, proximidad); el "cardio mata ganancias" es falso.
- **Caveats:** interferencia dosis-dependiente.
- **Reglas:** INT-001..006, GEN-001.

## 4. Endurance / running

- **Primaria:** Seiler 2010 (TID) · Stöggl & Sperlich 2014/2015 · Rosenblat (meta TID) · Milanović 2015 (HIIT vs MICT) · Blagrove 2018 + Berryman (RE vía fuerza) · método de decoupling.
- **Secundaria:** Daniels *Running Formula* (**toolbox de sesiones, no autoridad**) · Magness *Science of Running*.
- **Terciaria:** Scientific Triathlon / That Triathlon Show.
- **Experto:** —
- **Gobierna:** distribución de intensidad, zonas (HR/RPE→pace), progresión de volumen, intervals/threshold, run/walk, métricas de mejora aeróbica, treadmill vs outdoor.
- **Aplicabilidad:** alta (lifter-novato-corredor).
- **Población:** atletas de endurance competitivos (caveat: simplificar para 2-3 carreras/sem).
- **Estado energético:** mayoría mantenimiento.
- **Nivel de evidencia:** strong (mayoría fácil, HIIT/MICT, RE); moderate (zonas/progresión/decoupling).
- **Caveats:** paces VDOT de Daniels demasiado rápidos para novato.
- **Reglas:** END-001..008.

## 5. Hybrid conditioning / HYROX-like

- **Primaria (escasa):** concurrent training (M3) · strength-endurance/resistencia muscular · fisiología de circuit/CrossFit (VO2max, work capacity, lesión) · biomecánica de sled (concéntrico, bajo DOMS) · carries (limitada).
- **Secundaria:** NSCA conditioning · Jamieson *Ultimate MMA Conditioning* (sistemas energéticos — experto).
- **Terciaria:** —
- **Experto:** coaches híbridos/HYROX.
- **Gobierna:** frecuencia, tipos de sesión, dosis, menú de movimientos, espaciado.
- **Aplicabilidad:** media — **explícitamente extrapolada**.
- **Población:** mixta/atletas; nada específico de HYROX en RCT.
- **Estado energético:** n/a.
- **Nivel de evidencia:** weak_extrapolated (programación directa); moderate (componentes sled/erg).
- **Caveats:** engañosamente fatigante; cap de frecuencia, skill baja.
- **Reglas:** HYB-001..005. Ver [`../docs/architecture/hybrid-session-taxonomy.md`](../docs/architecture/hybrid-session-taxonomy.md).

## 6. Athleticism / plyometrics / carries / sled

- **Primaria:** Markovic 2007 + Sáez de Villarreal (pliometría) · Weakley (VBT) · Speirs (unilateral) · McGill (core).
- **Secundaria:** NSCA Essentials · Boyle *New Functional Training* (experto) · Cressey (experto).
- **Terciaria:** —
- **Experto:** ALTIS, EXOS, Boyle, Cressey, Cal Dietz.
- **Gobierna:** pliometría baja dosis, microdosis de potencia, unilateral, core anti-rotación/extensión, movilidad dinámica, CoD básico.
- **Aplicabilidad:** media (mucho de atletas jóvenes; baja dosis es segura y útil).
- **Población:** atletas jóvenes mayormente.
- **Estado energético:** n/a.
- **Nivel de evidencia:** strong (pliometría→potencia/RE, McGill core); moderate (transferencia unilateral); weak (CoD para no-atleta).
- **Caveats:** mayor riesgo tendinoso por historial lumbar; introducir tras base.
- **Reglas:** ATH-001..005, INT-004. (ATH-005 unilateral = Speirs, `pending_research` hasta verificar; González-Badillo / velocity-loss = `pending_research`, futura regla VBT.)

## 7. Recovery / readiness

- **Primaria:** Fullagar 2015 (sueño) · Plews/Javaloyes/Vesterinen (HRV-guided) · Saw 2016 (subjetivo) · Meeusen 2013 (overtraining consensus).
- **Secundaria:** NSCA recovery · Jamieson HRV (experto).
- **Terciaria:** docs Whoop/Intervals.icu · Marco Altini (ciencia HRV).
- **Experto:** —
- **Gobierna:** tendencias 7d, confirmación multi-señal, sueño como palanca, green/yellow/red, triggers de deload.
- **Aplicabilidad:** alta.
- **Población:** entrenados/atletas.
- **Estado energético:** n/a.
- **Nivel de evidencia:** strong (sueño, subjetivo, tendencia); moderate (HRV-guided).
- **Caveats:** falsa precisión de wearables; score = flag.
- **Reglas:** READ-001..008. Ver [`../docs/architecture/readiness-rules.md`](../docs/architecture/readiness-rules.md).

## 8. Load management / injury prevention

- **Primaria:** Nielsen/Bertelsen (running injury) · Soligard 2016 (IOC consensus) · Impellizzeri 2020/2021 (crítica ACWR) · Cook & Purdam + Malliaras (tendón) · Gabbett 2016 (**principio, no dogma**).
- **Secundaria:** revisiones BJSM · NSCA.
- **Terciaria:** E3 Rehab, Barbell Medicine, Running Physio (Tom Goom), Physio Network.
- **Experto:** Jill Cook/Malliaras como divulgadores aplicados.
- **Gobierna:** progresión gradual, rotación de modalidad, carga tendinosa, manejo lumbar, detección de overreaching, cadencia de deload.
- **Aplicabilidad:** alta (ACWR solo laxo).
- **Población:** atletas/recreacionales.
- **Estado energético:** n/a.
- **Nivel de evidencia:** strong (error de carga→lesión, tendón); weak_extrapolated (umbrales ACWR).
- **Caveats:** no eliminar fuerza reflexivamente ante dolor.
- **Reglas:** LOAD-001..004, END-003.

## 9. Exercise selection

- **Primaria:** Haugen 2023 (máquina vs libre) · literatura de long-length (M1).
- **Secundaria:** NSCA.
- **Terciaria:** SBS, MASS.
- **Experto:** SFR framework (RP/Israetel).
- **Gobierna:** selección por ROI/SFR/estrés articular, máquina vs libre, sustituciones, evitar virales/redundantes.
- **Aplicabilidad:** alta.
- **Población:** entrenados.
- **Estado energético:** ambos.
- **Nivel de evidencia:** strong (máquina≈libre); moderate/expert (SFR heurístico); weak (hype por EMG).
- **Reglas:** SEL-001..003, STR-007, STR-010. Schema en [`../docs/architecture/exercise-schema-v1.md`](../docs/architecture/exercise-schema-v1.md).

## 10. Cardio modality selection

- **Primaria:** Wilson 2012 + Huiberts 2024 (interferencia por modalidad) · biomecánica de impacto.
- **Secundaria:** NSCA.
- **Terciaria:** Scientific Triathlon.
- **Experto:** práctica de remo/ski/sled.
- **Gobierna:** elección de modalidad por impacto, interferencia de tren inferior, carga posterior/lumbar/grip, especificidad para correr, fatiga reciente.
- **Aplicabilidad:** alta.
- **Población:** entrenados/recreacionales.
- **Estado energético:** ambos.
- **Nivel de evidencia:** strong (running>bici impacto/interferencia).
- **Caveats:** trade-off especificidad-de-correr vs interferencia.
- **Reglas:** SEL-004, INT-002, HYB-005. Schema en [`../docs/architecture/cardio-modality-schema-v1.md`](../docs/architecture/cardio-modality-schema-v1.md).

## 11. Longevidad y salud

> Módulo añadido **2026-08-16**. Hasta esa fecha el corpus no tenía **ningún** contenido de salud,
> pese a que el usuario tenía 5 analíticas sin procesar desde 2021
> ([`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md)).

- **Primaria:** Mandsager 2018 (fitness cardiorrespiratorio y mortalidad, n=122.007) · Momma 2022 (meta de actividad de fuerza y mortalidad, 16 cohortes) · Leong 2015 (PURE, fuerza de agarre, n=139.691) · Cappuccio 2010 (duración del sueño y mortalidad, meta prospectiva).
- **Secundaria:** —
- **Terciaria:** —
- **Experto:** LONG-003 es una regla de **alcance**, no un hallazgo: define que el sistema registra marcadores y deriva al médico, nunca interpreta ni trata.
- **Gobierna:** por qué se protege el estímulo aeróbico y la frecuencia de fuerza aunque no sean la cualidad dominante; el suelo de sueño; cómo se tratan (y cómo NO se tratan) los marcadores sanguíneos.
- **Aplicabilidad al usuario:** alta en dirección, **baja en dato**: su fitness cardiorrespiratorio nunca se midió con test graduado y la última analítica tiene ~23 meses.
- **Población estudiada:** cohortes poblacionales generales, mucho más amplias y menos entrenadas que el usuario.
- **Estado energético:** n/a (evidencia observacional a largo plazo).
- **Nivel de evidencia:** strong (LONG-001/002, por tamaño y consistencia); moderate (LONG-004); expert (LONG-003, regla de alcance).
- **Caveats:** **todo este módulo es observacional**. Asociación dosis-respuesta, no demostración aleatorizada de que subir el fitness baje la mortalidad; causalidad inversa y confusión residual son preocupaciones reales. La fuerza de agarre es un **marcador** de salud general, no un objetivo a entrenar. Este módulo **no puede prescribir tratamiento** (LONG-003).
- **Reglas derivadas:** LONG-001..004. Datos en [`../data/processed/2026-08-16_blood-markers.md`](../data/processed/2026-08-16_blood-markers.md).

## 12. Ambiente (calor y frío)

> Módulo añadido **2026-08-16**. El único paper ambiental del corpus era el de lesiones por frío,
> y su resumen aún asumía Buenos Aires tras la mudanza a Madrid de junio de 2026.

- **Primaria:** Armstrong 2007 (ACSM Position Stand, exertional heat illness) · ACSM Expert Consensus 2021 (heat illness: reconocimiento, manejo, vuelta a la actividad) · Périard 2015 y 2016 (aclimatación al calor; adaptaciones cardiovasculares) · Coyle & González-Alonso 2001 (deriva cardiovascular, compartido con END-005) · Castellani 2006 (ACSM, lesiones por frío — baja aplicabilidad).
- **Secundaria:** —
- **Terciaria:** —
- **Experto:** la prescripción práctica "mantener la FC y dejar caer el ritmo" es corolario aplicado, no protocolo testeado.
- **Gobierna:** cómo se lee un objetivo de FC en calor, cuándo se pasa a indoor, dosis de hidratación por encima de la basal, y por qué el ritmo a FC fija (END-005) queda confundido en verano.
- **Aplicabilidad:** **alta y ahora mismo** — Madrid en agosto.
- **Población:** atletas de competición y contextos ocupacionales; la transferencia a "mover la carrera fácil a indoor una tarde de calor" es extrapolación prudente.
- **Estado energético:** el déficit agrava el riesgo (menos glucógeno, menos ingesta de líquido).
- **Nivel de evidencia:** moderate (fisiología sólida; prescripción aplicada).
- **Caveats:** **los PDF de Armstrong 2007 y del consenso 2021 no están en `data/ACSM/`**. Se citan desde registro bibliográfico verificado, así que **no se citan umbrales concretos de WBGT**: hacerlo sería inventarlos. Ver lista de adquisición.
- **Reglas derivadas:** ENV-001..002. Interactúa con END-005 (confusor), REC-006 (hidratación), INT-002/HYB-005 (modalidad indoor).

---

## Lista de adquisición priorizada (papers que faltan)

> **Rondas 1-3 de verificación web completadas (2026-06-23/24)** — fichas con DOI/PMID en
> [`source-coverage-audit.md`](./source-coverage-audit.md). ✓ = `included_verified`.
> Ronda 3 verificó: Wolf 2025/Maeo (STR-007), Pelland 2026 (STR-003), Byrne 2018 (REC-005, sin
> preservación de FFM), Pareja-Blanco (ATH-002, trade-off + requiere dispositivo), Bertelsen 2017
> (END-003), Rio 2015 (LOAD-002, n=6), Markovic/Sáez (ATH-001, low-dose no óptimo), Coyle &
> González-Alonso (END-005, decoupling = heurística no validada). Pendiente: Kassiano DOI, Daniels.

1. **Concurrent:** ✓ Huiberts 2024 (*Sports Med*, doi 10.1007/s40279-023-01943-9), ✓ Wilson 2012 (*JSCR*, PMID 22002517), Schumann 2022 (pending), Fyfe (pending).
2. **TID:** ✓ Seiler 2010 (IJSPP), ✓ Stöggl & Sperlich 2014 (PMID 24550842), ✓ Rosenblat 2019 (PMID 29863593, solo 3 estudios), Casado (pending).
3. **HIIT vs MICT / RE:** Milanović 2015 (pending), ✓ Blagrove 2018 (PMID 29249083), ✓ Berryman 2018.
4. **Recomp:** ✓ Barakat 2020 (narrative→expert), ✓ Murphy & Koehler 2022 (PMID/doi 10.1111/sms.14075), ✓ Nunes 2022.
5. **Fuerza:** ✓ **Robinson 2024** (no "Refalo 2024"), ✓ Currier 2023 BJSM, ✓ Moesgaard 2022, ✓ Williams 2017; Pelland/Robinson volumen + Wolf/Kassiano/Maeo (pending).
6. **Readiness:** ✓ Fullagar 2015 (narrative), ✓ Saw 2016 (PMID 26423706), ✓ Plews 2013 + Vesterinen/Javaloyes, ✓ Meeusen 2013 (expert); Altini (pending).
7. **Tendón / carga:** ✓ Cook & Purdam 2009 (PMID 18812414), ✓ Malliaras 2013 (PMID 23494258), ✓ Impellizzeri 2020 (doi 10.1123/ijspp.2019-0864), ✓ Nielsen 2012 (PMID 22389869, **inconcluso**); Bertelsen 2017 + Rio 2015 (isométricos) pending.
8. **Selección / concurrent / misc:** ✓ Haugen 2023 (PMID 37582807), ✓ Schumann 2022 (PMID 34757594), ✓ Fyfe 2014 (PMID 24728927), ✓ Speirs 2016 (PMID 26200193, scope-limitado), ✓ Mah 2011 (PMID 21731144), ✓ Milanović 2015 (PMID 26243014), ✓ Schoenfeld 2016 (PMID 26605807), ✓ Grgic 2022 (PMID 33497853); Markovic/Sáez (pliometría), Wolf/Kassiano/Maeo, Pelland, Weakley/González-Badillo VBT pending.

Los 6 position stands de ACSM ya están en `data/ACSM/` y resumidos en `acsm-summaries.md`.
Re-anclar las entradas "héroe" sueltas de `research-log.md` superadas por las meta-regresiones 2024.

### Ronda 4 — pendientes tras la auditoría del 2026-08-16

9. **Calor (prioridad alta, estacional):** ✓ verificados bibliográficamente Armstrong 2007
   (doi 10.1249/MSS.0b013e31802fa199, PMID 17473783) y el ACSM Expert Consensus 2021
   (doi 10.1249/JSR.0000000000001058), pero **ninguno de los dos PDF está en `data/ACSM/`**. Hasta
   tenerlos, ENV-002 no puede citar umbrales concretos (WBGT, tiempos de exposición) y se queda en
   la recomendación cualitativa. **Descargarlos es la adquisición de mayor valor inmediato.**
10. **Longevidad:** ✓ verificados Mandsager 2018, Momma 2022, Leong 2015, Cappuccio 2010. Pendiente
    de considerar: Kodama 2009 (VO₂max y mortalidad, meta) y García-Hermoso 2018 (fuerza muscular y
    mortalidad) para reforzar LONG-001/002; ninguno es necesario para las reglas actuales.
11. **Aclimatación al calor:** Périard 2015 (doi 10.1111/sms.12408) y 2016 verificados por registro;
    Périard 2017 (heat acclimation decay, *Sports Med*) sin verificar → `pending_research`.
