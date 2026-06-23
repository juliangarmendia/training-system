# Interference Rules — combinar fuerza, running, cardio e híbrido

Vista operativa del Interference Engine (constraint resolver). Las reglas viven en
[`evidence-to-rules.md`](../../research/evidence-to-rules.md); aquí se **referencian por id**, no se
reescriben.

## Restricciones duras (referencia)

- **INT-001** — no running duro <24h antes de pierna pesada.
- **INT-002 / SEL-004** — running > bici/remo/ski en interferencia e impacto; elegir modalidad de baja interferencia cuando el tren inferior está cargado.
- **INT-003** — si fuerza y endurance comparten sesión, levantar primero (salvo objetivo aeróbico dominante).
- **INT-004** — proteger potencia: fresco, al inicio, nunca tras endurance.
- **HYB-002** — híbrido cuenta como día duro y estresor parcial de pierna; espaciar de pierna pesada y run duro.
- **BUD-001 / BUD-002** — techo de días duros (ver [`hard-day-budget.md`](./hard-day-budget.md)).
- **READ-007** — un día rojo puede forzar el reordenamiento (ver [`readiness-rules.md`](./readiness-rules.md)).

## Decisiones del resolver

### Cuándo separar running duro de pierna pesada
- Mínimo 24h entre run duro (threshold/intervals/long exigente) y lower strength pesado (INT-001).
- Ideal: pierna pesada en día fresco; run duro al menos 24h después de pierna, o en día sin pierna.
- Si la semana obliga a juntarlos: easy Z2 sí puede ir el día antes/después de pierna; duro no.

### Cuándo usar bike/row/ski en vez de running
- Tren inferior cargado (≤24-48h post pierna pesada o post long run) → bici/ski (HYB-005, INT-002).
- Necesidad de volumen aeróbico sin impacto (gestión de tendón/rodilla/lumbar) → bici/ski.
- Objetivo del bloque = **correr** → priorizar running real pese a la interferencia (trade-off SEL-004), pero mantenerlo easy cerca de pierna.

### Cuándo evitar remo (row)
- Fatiga lumbar o de cadena posterior alta (post DL/RDL pesado): el remo carga lumbar/posterior moderado → preferir bici o ski.
- Molestia lumbar activa → evitar remo intenso; bici de elección.

### Cuándo evitar treadmill hard intervals
- Cerca de pierna pesada (impacto + interferencia).
- Readiness yellow/red.
- Preferir intervals en bici/ski si solo se busca el estímulo cardiovascular sin impacto.

### Cuándo colocar híbrido (HYROX-like)
- En día sin pierna pesada y sin run duro adyacente (HYB-002).
- Con budget restante suficiente (peso 1-2; benchmark 3).
- Evitar sled/lunges/wall balls pesados en las 24-48h alrededor de pierna pesada (solapan tren inferior).

### Proteger potencia/pliometría
- Siempre fresco, al inicio de la sesión, antes de cualquier endurance o trabajo fatigante (INT-004, ATH-002).

## Layout semanal de referencia (plantilla, no rutina)

Ejemplo de colocación factible para 4 fuerza + 2-3 cardio, déficit, cap de budget ~6:

| Día | Bloque | Por qué |
|---|---|---|
| Lun | Lower strength (pesado) | Día fresco tras descanso de finde |
| Mar | Upper strength + easy Z2 (bici/ski) | Z2 bajo impacto, no interfiere con pierna del lunes |
| Mié | Easy run Z2 (o run/walk) | ≥24h tras pierna; impacto ok con piernas recuperadas |
| Jue | Lower strength (o híbrido strength-endurance) | ≥48h desde lower del lunes |
| Vie | Upper strength | Bajo coste |
| Sáb | Long easy run / hybrid aerobic | Lejos de pierna; easy |
| Dom | Recovery / off | — |

Reglas que esta plantilla satisface: INT-001 (run duro no pega con pierna), BUD-001 (≤3 duros),
INT-002 (Z2 en bici cuando piernas cargadas), HYB-002 (híbrido separado de pierna).

Si se inserta un día de intervals o threshold, desplaza el run easy y se revalida contra el budget.
