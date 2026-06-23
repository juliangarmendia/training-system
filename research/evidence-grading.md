# Evidence Grading — matriz de confianza

Vocabulario único usado en todo el repo (idéntico en `evidence-to-rules.md` y en los schemas):

| Enum | Significado |
|---|---|
| `strong` | Meta-análisis/revisiones sistemáticas consistentes o position stands recientes, en población aplicable. Lo tratamos como base firme. |
| `moderate` | Evidencia real pero con heterogeneidad, población parcialmente aplicable, o literatura joven. Dirección confiable, magnitud incierta. |
| `weak_extrapolated` | Sin evidencia directa para este caso; inferido de literatura adyacente o de principios. Usar con cautela y autorregulación. |
| `expert` | Opinión experta / práctica aplicada. Solo rompe empates cuando la evidencia primaria calla. |

Un matiz como "moderada-alta" NO crea un enum nuevo: se expresa con `evidenceLevel: moderate` +
`confidence: high` en la regla correspondiente de `evidence-to-rules.md`.

---

## STRONG — lo sabemos con bastante confianza

| Claim | Reglas | Fuentes |
|---|---|---|
| Proteína alta en déficit preserva masa magra (1.8-2.7 g/kg) | REC-001 | Helms 2014, ISSN, Morton 2018 |
| Pérdida lenta (~0.5-1%/sem) preserva LBM mejor que rápida | REC-002 | Garthe 2011 |
| El déficit frena la hipertrofia pero NO la fuerza; mantener carga, recortar volumen | STR-001 | Murphy & Koehler 2022 |
| 2x/semana por patrón; intensidad ~80% para fuerza | STR-002, STR-005 | Currier 2026 |
| Dosis-respuesta de volumen 10-20 sets/músculo (fuera de déficit) | STR-003 | Pelland/Robinson 2024, Schoenfeld |
| Proximidad al fallo: fuerza insensible al RIR; no hace falta entrenar al fallo (dirección robusta) | STR-004 | **Robinson 2024** (meta-regresión; magnitud moderate, dirección high) |
| Descansos ≥2-3 min en compuestos | STR-006 | Schoenfeld 2016 RCT ✓ (Grgic 2017 solo-hipertrofia) |
| Running genera más interferencia/impacto que bici/remo/ski; la potencia es lo más afectado | INT-002, INT-004, SEL-004 | Wilson 2012, Huiberts 2024 |
| "El cardio mata las ganancias" es FALSO si se dosifica | INT-005 | Huiberts 2024 |
| Mayoría del entrenamiento debe ser fácil (~80/20) | END-001, BUD-001 | Seiler 2010, Stöggl/Sperlich |
| HIIT y MICT ambos suben VO2max | END-008 | Milanović 2015 ✓ (28 trials) |
| Fuerza pesada + pliometría mejoran running economy | END-007 | Blagrove 2018, Berryman |
| Máquina ≈ libre igualadas → elegir por ROI/confort/fatiga (solo difiere especificidad del test) | SEL-001 | Haugen 2023 ✓ |
| Sueño es la palanca primaria de recuperación | READ-006 | Fullagar 2015 |
| Tendencias > valores diarios; HRV a baseline individual | READ-001, READ-004 | Plews, Altini |
| Wellness subjetivo muy sensible; confirmación multi-señal | READ-002, READ-005 | Saw 2016 |
| No usar umbrales rígidos de ACWR (es un principio, no fórmula) | LOAD-001 | Impellizzeri 2020 ✓ |
| Tendón: cargar progresivamente, no descansar a cero | LOAD-002 | Cook & Purdam 2009 ✓ + Malliaras 2013 ✓ (HSR; isométricos→Rio pending) |
| Core anti-rotación/anti-extensión para columna | ATH-003 | McGill |
| No aplicar evidencia de novato/obeso/elite sin marcar extrapolación | GEN-002 | meta-principio |

## MODERATE — dirección confiable, magnitud incierta

| Claim | Reglas | Fuentes / caveat |
|---|---|---|
| Énfasis en posición alargada (long muscle length) | STR-007 | Wolf/Kassiano/Maeo — literatura joven |
| Periodización: hipertrofia model-insensible; ondulante > lineal para fuerza en entrenados | STR-008 | Moesgaard 2022 ✓ + Williams 2017 ✓ (periodizado>no-periodizado) |
| HRV-guided training mejora outcomes | READ-001, READ-004 | Plews/Javaloyes ✓ — prometedor, ruidoso |
| Ventana de recomp en re-entry (muscle memory) | REC-004 | literatura muscle-memory (sin paper nombrado) |
| Diet breaks/MATADOR | REC-005 | Byrne 2018 |
| Separar running duro de pierna pesada (24h) | INT-001, INT-003 | Huiberts/Wilson/Schumann — depende de dosis |
| Progresión running ~10%/sem; run/walk; decoupling como métrica | END-003, END-005, END-006 | heurística + método |
| Pliometría baja dosis transfiere a adultos entrenados | ATH-001, ATH-002, ATH-004 | Markovic, Sáez de Villarreal — mucho de atletas jóvenes |
| Cap de endurance en bloque de fuerza | INT-006 | Wilson — volumen-dependiente |
| Deload 4-6 sem o reactivo | LOAD-004 | periodización aplicada |
| Modificar (no eliminar) fuerza ante dolor lumbar | LOAD-003 | BJSM/Barbell Medicine aplicado |

## WEAK_EXTRAPOLATED — inferido, usar con cautela

| Claim | Reglas | Por qué es débil |
|---|---|---|
| Programación directa HYROX-like (frecuencia, dosis, tipos) | HYB-001, HYB-002 | No hay RCTs de HYROX; se infiere de concurrent + strength-endurance + biomecánica de sled/carry |
| Umbrales rígidos de ACWR | (rechazado en) LOAD-001 | Impellizzeri 2020/2021: correlaciones espurias |
| SFR como número exacto | SEL-002 | Es heurística cualitativa, no medida |
| EMG como proxy directo de hipertrofia | SEL-003 (refuta) | EMG ≠ hipertrofia |
| Spikes de carga → lesión / regla del ~10%/sem | END-003, LOAD-001 (parcial) | Nielsen 2012 INCONCLUSO (Buist RCT nulo); re-anclar a Bertelsen 2017 (pending) |
| Orden lift-first favorece fuerza | INT-003 | Schumann 2022 débil para el orden; mecanismo plausible |
| Unilateral ≈ bilateral para mi perfil | ATH-005 | Speirs 2016 verificado pero n=18 rugby juvenil → extrapolado |

## EXPERT — opinión/práctica, solo rompe empates

| Claim | Reglas | Fuente |
|---|---|---|
| Solo movimientos de baja skill bajo fatiga en híbrido | HYB-003 | razonamiento de riesgo |
| Benchmarks ≤1 cada 4-6 sem | HYB-004 | práctica aplicada |
| Día rojo cambia el objetivo, no solo la carga | READ-007 | autorregulación aplicada |
| Recovery score = flag, no calculadora de dosis | READ-003 | metodología wearable |
| Rotar accesorios solo en frontera de bloque | STR-010 | práctica aplicada |
| Budget de hard-stress por pesos | BUD-002 | operacionalización |
| Resolución de conflictos entre fuentes | GEN-003 | regla de proceso |
| Recomp en entrenados (Barakat es narrative review) | REC-003 | Barakat 2020 ✓ (narrative → expert) |
| Trigger de deload / overreaching | READ-008 | Meeusen 2013 ✓ (consensus; advierte contra marcador único) |

> Recursos de divulgación (Stronger by Science, MASS, Renaissance Periodization, Barbell Medicine,
> E3 Rehab) son **terciarios**: útiles como interpretación práctica de la evidencia primaria, nunca
> como sustituto. Cal Dietz (Triphasic), dosificación HRV específica de Jamieson y claims virales por
> EMG quedan en `expert` y no anulan evidencia primaria.
