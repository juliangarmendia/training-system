# Rule Readiness — qué puede gobernar código

Clasifica cada regla de [`evidence-to-rules.md`](./evidence-to-rules.md) por su disposición a gobernar
el generador en la fase de implementación. Basado en la verificación de la ronda 1
([`source-coverage-audit.md`](./source-coverage-audit.md)).

**Criterio duro:** una regla solo entra en `ready_to_govern_code` si su claim está respaldado
(`claim_verified`), no por la mera existencia de la fuente (`source_verified`). Ninguna regla
`expert`/`extrapolated` gobierna automáticamente: requiere guardrail explícito.

---

## `ready_to_govern_code`
Claim verificado o robustamente establecido + fuente verificada + aplicabilidad directa/alta.

| Rule | Claim | Fuente verificada |
|---|---|---|
| STR-001 | En déficit: mantener carga, recortar volumen (no perseguir hipertrofia) | Murphy & Koehler 2022 ✓ |
| STR-002 | 2×/sem por patrón | Currier 2023 BJSM ✓ + 2026 |
| STR-003 | Volumen 10-20 sets/músculo; cap 10-14 en déficit | Currier 2023 ✓ (cap deficit = razonamiento de recuperación) |
| STR-004 | RIR 1-3 default; fuerza insensible al RIR | Robinson 2024 ✓ (moderate, dirección high) |
| STR-005 | ≥1 slot pesado 3-6 reps por patrón | Currier 2023/2026 ✓ |
| STR-008 | Periodización: hipertrofia model-insensible; ondulante > lineal para fuerza en entrenados | Moesgaard 2022 ✓ (moderate) |
| REC-001 | Proteína ≥1.6-2.7 g/kg con RT | Nunes 2022 ✓ (caveat: estudiado en mantenimiento) |
| REC-002 | Ritmo 0.5-1%/sem; déficit ≤~500 kcal/día | Murphy & Koehler 2022 ✓ (umbral). Sub-claim "más lento cuanto más lean" = provisional |
| INT-001 | No running duro <24h pre-pierna pesada | Huiberts 2024 ✓ + Wilson 2012 ✓ |
| INT-002 | Running > bici/remo/ski en interferencia/impacto | Wilson 2012 ✓ |
| INT-004 | Proteger potencia (fresco, al inicio) | Wilson 2012 ✓ (potencia lo más afectado) |
| INT-005 | Cardio moderado no mata ganancias si se dosifica | Huiberts 2024 ✓ |
| END-001 | 80/20 fácil/duro en la semana completa | Seiler 2010 ✓ (caveat: polarizado≠piramidal; Festa 2020) |
| END-007 | Mantener fuerza+pliometría mejora running economy | Blagrove 2018 ✓ + Berryman 2018 ✓ |
| READ-001 | Tendencias rolling 7d, no días sueltos | Plews 2013 ✓ (caveat: Whoop≠RMSSD matinal) |
| READ-002 | Confirmación multi-señal (≥2) | Saw 2016 ✓ |
| READ-004 | HRV vs baseline individual | Plews 2013 ✓ |
| READ-005 | Performance + subjetivo > score diario en conflicto | Saw 2016 ✓ |
| ATH-003 | Core anti-rotación/anti-extensión (historial lumbar) | McGill (alta aplicabilidad) |
| SEL-004 | Modalidad cardio por impacto/interferencia/carga | Wilson 2012 ✓ |
| BUD-001 | ≤2-3 días duros/sem contando TODO | Seiler 2010 ✓ (aplicado a la semana) |
| GEN-002 | No aplicar evidencia de novato/obeso/elite sin marcar extrapolación | meta-principio (salvaguarda transversal) |
| SEL-001 | Máquina ≈ libre; solo difiere especificidad del test | **Haugen 2023 ✓** (ronda 2) |
| END-008 | HIIT y MICT ambos suben VO2max | **Milanović 2015 ✓** (ronda 2) |
| STR-006 | Descanso ≥2-3 min en compuestos | **Schoenfeld 2016 RCT ✓** (ronda 2) |
| LOAD-001 | No usar umbrales rígidos de ACWR (principio, no fórmula) | **Impellizzeri 2020 ✓** (ronda 2; el sub-claim de spikes baja a extrapolado) |
| LOAD-002 | Tendón: cargar progresivamente, no descansar a cero | **Cook&Purdam ✓ + Malliaras ✓** (ronda 2; isométricos→Rio pending) |
| ATH-004 | Introducir plyo tras base (tendón adapta lento) | **Cook&Purdam ✓ + Malliaras ✓** (ronda 2) |
| READ-006 | Sueño como palanca primaria de recuperación | **Mah 2011 ✓** + Fullagar (narrative); sueño-importa robusto |

## `provisional_needs_verification`
Citada pero la fuente o el claim aún no verificado. No gobierna hasta verificar.

| Rule | Pendiente |
|---|---|
| STR-007 | Wolf/Kassiano/Maeo long-length (no verificada) |
| STR-003 | Pelland/Robinson volumen (Currier ✓ cubre, Pelland sin verificar) |
| REC-005 | Byrne 2018 MATADOR (no verificada) |
| END-002 | Daniels como toolbox (no verificada) |
| END-004 | Cap de intervals — Seiler ✓ pero el "máx 1/sem" es razonamiento |
| END-005 | Decoupling = método; **además el dato no se extrae hoy** (ver data-sources-audit) |
| END-006 | Run/walk = práctica aplicada |
| INT-006 | Wilson ✓ (volumen) + Fyfe expert (no prueba reducción de interferencia) |
| LOAD-004 | Periodización aplicada |
| ATH-001 | Markovic/Sáez pliometría (no verificada) |

## `expert_or_extrapolated_use_with_guardrails`
Reglas útiles basadas en práctica experta o evidencia indirecta. Pueden usarse, **con guardrail**.

| Rule | Base | Guardrail obligatorio |
|---|---|---|
| GEN-001 | una cualidad/bloque (síntesis) | Solo el Block Planner la aplica; revisable por el usuario |
| GEN-003 | resolución de conflictos (proceso) | Registrar conflicto+decisión en research-log |
| STR-010 | rotación de accesorios (experto) | Solo en frontera de bloque; compuestos estables |
| REC-003 | recomp en entrenados — Barakat narrative (`expert`) | Expectativas conservadoras; no prometer recomp rápida |
| REC-004 | muscle-memory (sin paper nombrado) | Ventana temporal de re-entry; no extrapolar más allá |
| HYB-001 | frecuencia híbrida (`weak_extrapolated`) | Cap 0-1/sem en déficit; el usuario sube a 2 solo en bloque dedicado |
| HYB-002 | híbrido = día duro (extrapolado) | Cuenta en hard-day budget; separar de pierna/run duro |
| HYB-003 | baja skill bajo fatiga (experto) | Filtro duro por skillRequirement |
| HYB-004 | benchmarks ≤1/4-6 sem (experto) | Solo en frontera de bloque |
| HYB-005 | indoor low-impact (moderate/extrapolado) | Cuando tren inferior cargado |
| ATH-002 | power microdosing (VBT moderate) | Fresco, volumen bajo, intención máxima |
| READ-003 | Whoop recovery = flag (experto) | Nunca derivar dosis numérica del score |
| READ-007 | día rojo cambia objetivo (experto) | Cambio de objetivo, no solo carga; reversible |
| READ-008 | Meeusen consensus (`expert`) | Deload propuesto, confirma el usuario; nunca por un solo marcador |
| SEL-002 | SFR (heurística experta) | Buckets cualitativos, no números precisos |
| SEL-003 | EMG ≠ hipertrofia (refuta) | Marcar como guardrail anti-hype, no como driver positivo |
| BUD-002 | pesos de budget (heurística) | Pesos refinables con datos; no falsa precisión |
| LOAD-003 | dolor lumbar → modificar (aplicado) | Modificar variante/ROM/carga, nunca eliminar fuerza reflexivamente |
| END-003 | progresión running ~10%/sem | **Nielsen 2012 inconcluso** (ronda 2); usar como default prudente, no regla; re-anclar a Bertelsen 2017 (pending) |
| INT-003 | lift-first favorece fuerza | **Schumann débil para el orden** (ronda 2); same-session sí, orden no probado |
| ATH-005 | unilateral ≈ bilateral | **Speirs ✓ pero n=18 rugby juvenil** (ronda 2); usar como sustituto joint-friendly, no como equivalencia probada |

---

## Resumen (tras ronda 2)
- **`ready_to_govern_code`: ~28 reglas** — núcleo de fuerza (+ STR-006), interferencia, readiness,
  recomp, selección (+ SEL-001), cardio (+ END-008), carga/tendón (+ LOAD-001/002, ATH-004), sueño
  (READ-006). El cimiento del motor, ahora más ancho tras verificar ronda 2.
- **`provisional_needs_verification`: ~10 reglas** — STR-007/STR-003 (volumen/long-length), END-002/
  004/005/006, INT-006, LOAD-004, ATH-001, REC-005. Ronda 3 pendiente: Bertelsen, Rio 2015,
  Wolf/Kassiano/Maeo, Pelland, González-Badillo.
- **`expert_or_extrapolated_use_with_guardrails`: ~21 reglas** — TODO lo híbrido/HYROX-like, SFR,
  capa de juicio readiness/recovery, + END-003/INT-003/ATH-005 (verificadas pero débiles/extrapoladas).
  Nunca automáticas sin guardrail.

**Implicación para implementación:** el Readiness Engine v1 + hard-day budget se apoyan casi
enteramente en `ready_to_govern_code` (READ-001/002/004/005/006, BUD-001) **y** en datos confirmados
como disponibles hoy (ver `data-sources-audit.md`: sueño, RHR, recovery flag, CTL/ATL, sesiones
completadas, RPE). Lo híbrido y lo aeróbico-fino (decoupling/zonas) quedan bloqueados por datos no
extraídos, no por evidencia. Lo híbrido NO se automatiza: guardrails + confirmación.
