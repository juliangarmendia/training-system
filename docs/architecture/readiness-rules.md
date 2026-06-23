# Readiness Rules — uso de Whoop e Intervals

Cómo el Readiness Engine convierte datos de wearables + feedback subjetivo en un estado
`green | yellow | red` **sin caer en falsa precisión**. Las reglas viven en
[`evidence-to-rules.md`](../../research/evidence-to-rules.md) (`READ-001..008`); este documento es la
**vista operativa**, no reescribe reglas.

## Principios (referencia, no duplicar)

- **READ-001** — tendencias 7d, no días sueltos.
- **READ-002** — confirmación multi-señal (≥2 concordantes) antes de cambiar el plan.
- **READ-003** — Whoop Recovery = flag, no calculadora de dosis.
- **READ-004** — HRV contra baseline individual, nunca entre personas.
- **READ-005** — si el wearable contradice el rendimiento real + subjetivo, gana el rendimiento + subjetivo.
- **READ-006** — sueño es la palanca primaria.
- **READ-007** — día rojo cambia el OBJETIVO, no solo la carga.
- **READ-008** — deload por declive multi-señal sostenido.

## Tabla de señales

| Señal | Fuente | Cómo usarla | Trampa a evitar |
|---|---|---|---|
| **HRV** | Whoop | Media móvil 7d vs baseline personal; caída sostenida = bandera | Reaccionar a un día; comparar con otros |
| **RHR** | Whoop | Tendencia; +sostenido confirma fatiga/enfermedad | Ruido diario |
| **Sleep duration** | Whoop | Déficit acumulado = palanca primaria (READ-006) | Obsesión con un mal día |
| **Sleep consistency** | Whoop | Horarios regulares pesan tanto como duración | — |
| **Recovery score** | Whoop | Solo mapear a green/yellow/red | Derivar sets/reps del % |
| **Strain** | Whoop | Contexto descriptivo de carga | Perseguir un "strain target" diario |
| **Fitness (CTL)** | Intervals | Tendencia de capacidad crónica | Confundir con readiness diaria |
| **Fatigue (ATL)** | Intervals | Carga aguda; pico = precaución | — |
| **Form (TSB)** | Intervals | Muy negativo sostenido = bandera de fatiga | Buscar TSB positivo siempre |
| **Pace-to-HR** | Intervals | Mejora aeróbica si pace↑ a HR fija | Ignorar calor/condiciones |
| **HR drift / decoupling** | Intervals | <5% = base Z2 sólida (END-005) | No ajustar por calor de Madrid |
| **Zone distribution** | Intervals | Verificar 80/20 semanal (END-001) | — |
| **Compliance** | logs | Gate de ajustes: <50% logueado bloquea cambios finos | Ajustar sobre datos incompletos |
| **Subjective fatigue/soreness/pain/motivation** | check-in | Muy sensibles (READ-005); dolor articular = override | Descartarlos frente al wearable |

## Cómo se computa green / yellow / red

1. **Recoger señales** (rolling 7d donde aplica).
2. **Contar concordancia** (READ-002): se necesitan ≥2 señales en la misma dirección para actuar.
3. **Mapear:**
   - **GREEN** — sin señales rojas; HRV/RHR/sueño en rango; subjetivo ok → sesión según plan.
   - **YELLOW** — 1-2 señales degradadas (p.ej. HRV↓ + sueño corto) → mantener objetivo pero recortar volumen/intensidad de la parte dura; preferir modalidad de menor impacto.
   - **RED** — ≥2 señales concordantes degradadas + subjetivo malo, o dolor articular → **cambiar el objetivo** (READ-007): hard → easy/recovery; o día off.
4. **Conflicto wearable vs realidad** (READ-005): si el score es malo pero el warm-up sale fuerte y el subjetivo es bueno → seguir; si el score es bueno pero el warm-up se siente plomo → tratar como yellow.

## Qué se automatiza vs qué se sugiere

| Acción | Automatizable | Solo sugerir (confirma el usuario) |
|---|---|---|
| Degradar sesión dura en RED | ✅ | |
| Swap de modalidad por fatiga de tren inferior | ✅ | |
| Recorte de volumen en YELLOW | ✅ | |
| Marcar mejora de decoupling | ✅ | |
| Trigger de deload por declive sostenido (READ-008) | | ✅ (propone, confirma) |
| Terminar/llamar un bloque | | ✅ |
| Interpretar un YELLOW ambiguo | | ✅ |

## Anti-falsa-precisión (no negociable)

- Nunca traducir un Recovery % a una carga exacta.
- Nunca actuar sobre una sola métrica de un solo día.
- Nunca comparar HRV absoluta con valores poblacionales.
- Reusa el trigger LEA ya existente del check-in semanal (sueño/libido/ánimo/enfermedad) en lugar de
  duplicarlo.
