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
| STR-007 | ROM completo + énfasis en posición alargada | **Wolf 2025 ✓ + Maeo 2021/2023 ✓** (ronda 3, strong) |
| STR-003 | Volumen 10-20 sets/músculo (cap 10-14 en déficit) | **Pelland 2026 ✓** (ronda 3; el "10+" es convención práctica, no anclada por la meta) |
| REC-006 | Hidratación 5-10 mL/kg pre-sesión | **Thomas 2016 ✓** (ronda 4; PDF completo en `data/ACSM/`) |
| REC-009 | Suelo de pasos/NEAT en déficit | **Garber 2011 ✓ + Jakicic 2024 ✓** (ronda 4; el dato `steps` YA se ingiere) |
| LONG-001 | El fitness cardiorrespiratorio es un outcome de salud en sí mismo | **Mandsager 2018 ✓** (ronda 4; n=122.007). Gobierna *proteger* el mínimo aeróbico, nunca subir volumen |
| LONG-002 | Mantener fuerza por salud, aparte de estética | **Momma 2022 ✓ + Leong 2015 ✓** (ronda 4). Justifica el mínimo de 2 sesiones/sem incluso en semanas comprimidas |
| LONG-004 | Sueño 7-8 h como objetivo de longevidad | **Cappuccio 2010 ✓** (ronda 4). Mismo objetivo accionable que READ-006 → **no contar como evidencia independiente** |

## `provisional_needs_verification`
Citada pero la fuente o el claim aún no verificado. No gobierna hasta verificar.

| Rule | Pendiente |
|---|---|
| END-002 | Daniels como toolbox (secundaria, no requiere verificación de claim) |
| END-004 | Cap de intervals — Seiler ✓ pero el "máx 1/sem" es razonamiento |
| END-005 | Decoupling = heurística (Friel, no validada) **y el dato NO se extrae hoy** → advisory + data-blocked |
| END-006 | Run/walk = práctica aplicada |
| INT-006 | Wilson ✓ (volumen) + Fyfe expert (no prueba reducción de interferencia) |
| LOAD-004 | Periodización aplicada |

## `expert_or_extrapolated_use_with_guardrails`
Reglas útiles basadas en práctica experta o evidencia indirecta. Pueden usarse, **con guardrail**.

| Rule | Base | Guardrail obligatorio |
|---|---|---|
| GEN-001 | **REATRIBUIDA (ronda 4)**: heurística de presupuesto de fatiga, `expert`/medium. Sus fuentes anteriores (Huiberts 2024, Soligard 2016) **no** la sostenían — Huiberts es INT-005 y apunta al revés para este perfil | Nunca automática. El constraint real es BUD-001, no el número de cualidades. **Dos cualidades en progresión NO son una violación** |
| REC-007 | CHO por tipo de día (Thomas 2016, banda por encima de lo que permite el déficit) | Redistribuir, nunca subir el total; leer "Lower/Upper" como tipo de día, no como día de la semana |
| REC-008 | Energy availability ≥30 kcal/kg FFM/d (umbral de literatura RED-S femenina) | Extrapolación de dirección, no del número; requiere ≥2 síntomas concordantes (READ-002); nunca derivar calorías del cálculo |
| ATH-006 | Suelo de movilidad 2-3 d/sem (Garber 2011) | Garber prescribe dosis pero **no prueba** prevención de lesiones; el caso fuerte aquí es el historial personal, no la evidencia general |
| LONG-003 | Regla de **alcance**, no hallazgo empírico | El sistema registra y deriva; **nunca** interpreta ni trata. Ninguna regla se dispara sobre una analítica de ~23 meses |
| ENV-001 | Fisiología del calor sólida (Périard 2015/2016); la prescripción "mantener FC, dejar caer el ritmo" es corolario aplicado | Suprimir claims de progreso aeróbico basados en ritmo durante los meses calurosos (confunde END-005) |
| ENV-002 | Armstrong 2007 + consenso ACSM 2021, **sin PDF** | **Prohibido citar umbrales numéricos** (WBGT, tiempos) hasta tener el texto completo |
| GEN-003 | resolución de conflictos (proceso) | Registrar conflicto+decisión en research-log |
| STR-010 | rotación de accesorios (experto) | Solo en frontera de bloque; compuestos estables |
| REC-003 | recomp en entrenados — Barakat narrative (`expert`) | Expectativas conservadoras; no prometer recomp rápida |
| REC-004 | muscle-memory (sin paper nombrado) | Ventana temporal de re-entry; no extrapolar más allá |
| HYB-001 | frecuencia híbrida (`weak_extrapolated`) | Cap 0-1/sem en déficit; el usuario sube a 2 solo en bloque dedicado |
| HYB-002 | híbrido = día duro (extrapolado) | Cuenta en hard-day budget; separar de pierna/run duro |
| HYB-003 | baja skill bajo fatiga (experto) | Filtro duro por skillRequirement |
| HYB-004 | benchmarks ≤1/4-6 sem (experto) | Solo en frontera de bloque |
| HYB-005 | indoor low-impact (moderate/extrapolado) | Cuando tren inferior cargado |
| ATH-002 | power microdosing / velocity loss | **Pareja-Blanco ✓** (ronda 3): low-VL preserva fuerza+menos fatiga, high-VL más hipertrofia (trade-off); **requiere dispositivo de velocidad — no disponible hoy** → advisory. Fresco, volumen bajo, intención máxima |
| READ-003 | Whoop recovery = flag (experto) | Nunca derivar dosis numérica del score |
| READ-007 | día rojo cambia objetivo (experto) | Cambio de objetivo, no solo carga; reversible |
| READ-008 | Meeusen consensus (`expert`) | Deload propuesto, confirma el usuario; nunca por un solo marcador |
| SEL-002 | SFR (heurística experta) | Buckets cualitativos, no números precisos |
| SEL-003 | EMG ≠ hipertrofia (refuta) | Marcar como guardrail anti-hype, no como driver positivo |
| BUD-002 | pesos de budget (heurística) | Pesos refinables con datos; no falsa precisión |
| LOAD-003 | dolor lumbar → modificar (aplicado) | Modificar variante/ROM/carga, nunca eliminar fuerza reflexivamente |
| END-003 | progresión running gradual | **Bertelsen 2017 ✓** (ronda 3): mecanismo carga-vs-capacidad sólido (moderate); la progresión gradual es implicación del modelo, no testeada; el ~10% es heurístico |
| INT-003 | lift-first favorece fuerza | **Schumann débil para el orden** (ronda 2); same-session sí, orden no probado |
| ATH-005 | unilateral ≈ bilateral | **Speirs ✓ pero n=18 rugby juvenil** (ronda 2); sustituto joint-friendly, no equivalencia probada |
| REC-005 | diet breaks / MATADOR | **Byrne 2018 ✓** (ronda 3): eficiencia de pérdida + menos adaptación metabólica; **NO preserva más FFM**; población obesa-sedentaria → extrapolado |
| ATH-001 | pliometría baja dosis | **Markovic/Sáez ✓** (ronda 3): eficaz, pero la dosis-respuesta favorece MÁS volumen; usar low-dose como mantenimiento de bajo coste en déficit |

---

## Ronda 4 (2026-08-16) — qué cambió

Auditoría del sistema ([`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md)):

- **+10 reglas**: `REC-006..009`, `ATH-006` (operacionalizan acciones ACSM que ya se practicaban sin
  Rule ID), `LONG-001..004` (módulo 11), `ENV-001..002` (módulo 12). Total **70** (59 + 11).
- **GEN-001 degradada** de `moderate`/high a `expert`/medium y movida de facto a este bloque, que ya
  era donde `rule-readiness.md` la tenía. Se resuelve así la contradicción entre los dos documentos.
- **Nota de implementación:** el hueco no es de evidencia sino de *aplicación*. REC-001..005 tenían
  cero presencia en `app.js` pese a ser la pérdida de grasa el objetivo #1; REC-006..009 nacen con
  el mismo riesgo si nadie las cablea. LONG-001/002 no piden código: piden **no** recortar el
  mínimo aeróbico ni la frecuencia de fuerza cuando la semana se comprime.

## Resumen (tras ronda 3)
- **`ready_to_govern_code`: ~30 reglas** — núcleo de fuerza (+ STR-003/006/007 verificadas),
  interferencia, readiness, recomp, selección (+ SEL-001), cardio (+ END-008), carga/tendón
  (+ LOAD-001/002, ATH-004), sueño (READ-006). El cimiento del motor.
- **`provisional_needs_verification`: ~6 reglas** — END-002/004/005/006, INT-006, LOAD-004. END-005
  está además **bloqueada por datos** (decoupling no se extrae hoy). Pendientes menores: Kassiano DOI.
- **`expert_or_extrapolated_use_with_guardrails`: ~23 reglas** — TODO lo híbrido/HYROX-like, SFR,
  capa de juicio readiness/recovery, + END-003/INT-003/ATH-005/REC-005/ATH-001/ATH-002 (verificadas
  pero débiles/extrapoladas o bloqueadas por dispositivo/dato). Nunca automáticas sin guardrail.

> **Tras 3 rondas de verificación, casi todo el corpus está verificado contra la fuente.** Lo que
> queda provisional es mayormente heurística de práctica (Daniels, run/walk, caps de razonamiento) o
> está bloqueado por DATOS no extraídos, no por evidencia ausente.

**Implicación para implementación:** el Readiness Engine v1 + hard-day budget se apoyan casi
enteramente en `ready_to_govern_code` (READ-001/002/004/005/006, BUD-001) **y** en datos confirmados
como disponibles hoy (ver `data-sources-audit.md`: sueño, RHR, recovery flag, CTL/ATL, sesiones
completadas, RPE). Lo híbrido y lo aeróbico-fino (decoupling/zonas) quedan bloqueados por datos no
extraídos, no por evidencia. Lo híbrido NO se automatiza: guardrails + confirmación.
