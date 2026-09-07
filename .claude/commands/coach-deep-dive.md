---
description: Lectura profunda de una semana a mano — lee coach_reviews y los stores por MCP y escribe prosa en tracking/. No programado, no toca el plan.
---

# /coach-deep-dive — lectura profunda, a mano

**No está programado; se invoca a mano** cuando Julian quiere una lectura profunda o un informe en el
repo. Sustituye a `/weekly-review-auto`, retirado el 2026-09-07: el coach semanal vive ahora **dentro
de la app** (edge function `coach-weekly-review`, Opus 5, ~$0,50-0,70 por revisión), se dispara al
abrir la semana nueva y Julian aprueba la propuesta con un toque (v11.61).

> **Pendiente de Julian:** el trabajo de los domingos 21:30 EDT sigue vivo en el programador de Claude
> Code hasta que lo borre a mano (el programador no está en el repo, así que renombrar este fichero no
> lo apaga). Ver `docs/pendientes.md` → *Coach v2 · lo que queda para Julian*.

## Qué es y qué no es

| | |
|---|---|
| **Es** | un segundo par de ojos sobre lo que ya decidió el coach de la app: más historia (todas las semanas, no 3), aritmética que se puede auditar línea a línea, y prosa larga que en una tarjeta del móvil no cabe |
| **No es** | el coach. No propone el plan de la semana, no prescribe kg y no escribe nada que la app lea |
| **Fuente de verdad** | la fila de `coach_reviews` de esa semana. Si no existe, se dice y el informe se etiqueta *"sin revisión del coach — lectura independiente"* |

### Prohibido (invariantes, no preferencias)

- **No escribir `plans`.** El plan vivo es la fila de mayor `version` y sólo la escribe la app al
  aplicar una propuesta (`docs/architecture/plan-v2-schema.md`). Una fila escrita desde aquí sería el
  plan del teléfono sin que nadie lo aprobara.
- **No escribir `coach_reviews`** (ni `decisions`, ni `settings`, ni ningún store). Lectura pura.
- **No empujar a intervals.icu.** El push sale del plan, desde la PWA
  (`pushCardioToIntervalsIcu` / `pushRunningPlanToIntervalsIcu`; el DSL lo genera
  `_generateCardioDsl`, `app/app.js:6268`).
- **No tocar `app/`, `tests/`, `supabase/` ni `scripts/`.**
- Escribe **sólo prosa**: `tracking/weekly-reviews/YYYY-WNN-deep-dive.md`, y opcionalmente el
  resumen al principio de `tracking/weekly-checkins.md` y una fila en `tracking/progress-log.md`.
  Commit de `tracking/` y nada más.

## Pre-flight

1. **MCP de Supabase vivo:** `mcp__claude_ai_Supabase__list_projects`. Si falla (401, red), decir
   exactamente esto y **parar**: *"El MCP de Supabase no responde. Reconectar en Claude Code →
   ajustes → MCP → Supabase, y volver a lanzar `/coach-deep-dive`."*
   Proyecto: **`ycfodifvpvosukepcxie`**.
2. **Semana objetivo:** por defecto la última semana ISO **completa** anterior a hoy (lunes-domingo,
   UTC). `weekKey = 'YYYY-WNN'`. Si el usuario nombra otra semana, esa.
3. **Idempotencia:** si `tracking/weekly-reviews/{weekKey}-deep-dive.md` ya existe y se generó hoy,
   preguntar antes de sobrescribir. Nunca se borran informes anteriores.
4. **Leer el repo** (completo, sin truncar): `tracking/weekly-reviews/*.md`, `tracking/weekly-checkins.md`,
   `tracking/progress-log.md`, `plans/*.md`, `docs/goals.md`, `docs/profile.md`, `CLAUDE.md`,
   `.claude/rules/*.md`. Los tres `plans/*.md` llevan aviso de obsoleto: **el plan es dato**, no ese
   documento.

## Fuentes — SQL por MCP (`mcp__claude_ai_Supabase__execute_sql`)

Todas las tablas comparten forma genérica `{user_id, record_id, data jsonb, updated_at}`: el registro
real está en `data`.

```sql
-- 1. La revisión del coach de esa semana (el último intento gana)
SELECT record_id, data, updated_at
FROM coach_reviews
WHERE data->>'weekKey' = '2026-W37'
ORDER BY (data->>'attempt')::int DESC NULLS LAST, updated_at DESC
LIMIT 1;
```

De esa fila se leen: `facts` (el pack determinista que vio el modelo), `output.briefing`,
`output.decisions[]`, `output.proposal`, `guardrails[]`, `usage` (coste y latencia) y `status`
(`running|proposed|applied|rejected|expired|failed`). **Los números del `facts` no se recalculan
distinto**: si tu aritmética no coincide, eso es un hallazgo del informe, no un número que corregir en
silencio.

```sql
-- 2. El plan vivo (versión más alta) y el registro de decisiones
SELECT data FROM plans ORDER BY (data->>'version')::int DESC LIMIT 1;
SELECT data FROM decisions ORDER BY data->>'ts' DESC LIMIT 60;

-- 3. Entrenos, carreras, sesiones, peso, nutrición, pasos, movilidad
--    (misma consulta por tabla; la semana objetivo y las 4 anteriores)
SELECT record_id, data
FROM workouts
WHERE (data->>'date')::date BETWEEN '2026-08-10' AND '2026-09-06'
ORDER BY data->>'date';
-- idem: runs · sessions · bodyweight · nutrition · steps · mobility_sessions

-- 4. Wellness: el blob entero, no columnas sueltas (record_id = fecha)
SELECT record_id AS date, data
FROM wellness
WHERE (record_id)::date BETWEEN '2026-08-10' AND '2026-09-06'
ORDER BY record_id;

-- 5. Ajustes: el registro está anidado un nivel (`{key, data, _updated_at}`)
SELECT data->'data'->>'deloadAnchorDate'          AS deload_anchor,
       data->'data'->'icuZones'->'z'->'zone2'     AS z2,
       data->'data'->>'idealVariant'              AS variant,
       data->'data'->>'coachAutoApply'            AS auto_apply,
       data->'data'->'goals'                      AS goals
FROM settings WHERE record_id = 'userSettings';
```

**El anidamiento de `settings` importa:** `data->>'X'` devuelve `null` para todo; hay que pasar por
`data->'data'`. Y el techo de Z2 vive en `icuZones.z.zone2[1]` — **hoy 143**. Si falta, usar 143 y
decirlo; nunca 140 (F-9: tres valores distintos para una constante).

## Unidades y deduplicación

> **lb → kg, antes de cualquier comparación.** Cada fila de `workouts` trae `data.unit` (`'lb'` |
> `'kg'`). Hasta ~2026-05 es **lb**; desde 2026-06-20, **kg**. `kg = lb × 0,453592`. Nunca comparar un
> número en lb contra uno en kg (top set, e1RM, volumen semanal, diagnóstico de estancamiento). Todo
> el informe va en **kg**. Mancuernas: el kg es **por mano**; lastradas: el kg es el **lastre**;
> ejercicios de medida (cm): **sin kg y sin e1RM**.

Carreras y sesiones **dedupeadas** siempre (COROS y Strava suben la misma carrera dos veces, F-10):
misma actividad si la fecha coincide y la distancia y la duración caen dentro de la tolerancia; bici,
remo y ski **no suman km de carrera**.

## El análisis — orden estricto (§C.2 del plan aprobado)

Es el mismo procedimiento que ejecuta el coach de la app
(`supabase/functions/coach-weekly-review/prompt.ts`). No lo contradigas: si llegas a otra conclusión,
di **por qué** y con qué número.

**0. Posición en el bloque.** Del `facts.block`, o de `deloadAnchorDate` (lunes ISO; bloques de 5
semanas, 4 de carga + 1 de descarga). Si el ajuste no lo trae aún, el ancla es el **lunes 2026-09-07**
por decisión de Julian, primer deload la **semana del 2026-10-05**. **Nunca "semana 5 o 9"** — ese
calendario era del programa de abril. En semana de descarga **nada progresa**.

**1. Suficiencia de datos (gates).** Si un gate falla, la conclusión es *"no hay señal"*, y se
escribe así. Peso: ≥4 medidas en 7 días para tendencia, ≥10 de 14 para tocar kcal, ventana sin diet
break, ≥14 días desde el último ajuste, no antes del **24-sep** · nutrición ≥10 de 14 días o manda la
báscula · carreras ≥1 con FC; cero carreras → sin rampa · fuerza: ≥1 exposición en 14 días para mover
un objetivo, ≥21 días → reentrada · wellness ≥5 de 7 días y el último dato de hoy o de ayer · cintura
≥2 medidas separadas ≥7 días.

**2. Estado de recuperación, contra la baseline propia** (7d vs 28d; READ-001/002/004/008). Señales:
HRV ≤ −10 % · RHR ≥ +5 bpm · sueño <6,5 h o ≥3 noches <6 h · readiness ≥3 de 7 días amarillo/rojo ·
rendimiento (−2 reps a la misma carga en 2 sesiones, o RPE ≥9 en un anchor) · dolor lumbar o articular
= **override a rojo**. Verde 0-1 · amarillo 2 · rojo ≥3 (o 2 si una es rendimiento, o dolor).

> **Las dos correcciones del audit que este comando existe para no repetir:**
> - **`form = ctl − atl`.** `rampRate` es ΔCTL/semana y **no es TSB**: nunca se le aplican los
>   umbrales de la literatura (−20/−10/+5). El rango real de este atleta es pequeño (CTL ~2-5), así
>   que `form` se lee contra su propia historia y jamás decide solo.
> - **CTL/ATL/`form` sólo ven cardio** (intervals.icu no recibe las sesiones de fuerza). La señal de
>   fuerza es **RPE, top set y calidad de sesión** — series hechas vs prescritas, reps a la misma
>   carga, ejercicios saltados. Y cuando el wearable dice fatiga pero el rendimiento y lo subjetivo
>   dicen bien, **gana lo segundo** (READ-005). La jerarquía "wellness > RPE" del playbook viejo era
>   falsa para fuerza y está retirada.

**3. Adherencia.** ≥75 % de fuerza y ≥2 carreras en 4 semanas → rampa permitida; 50-75 % → mantener;
<50 % → **simplificar**, nunca añadir. Un ejercicio con `done=false` en 2 de 3 → reordenar antes o
quitar; no "recordarlo". Sesión >75' con saltos → recortar; <45' con saltos → es tiempo, reordenar.

**4. Progresión por lift (doble progresión).** Tope de reps con RPE ≤ objetivo → +2,5 kg barra /
+1,25 accesorio / siguiente par de mancuernas / +2,5 de lastre. Tope con RPE >8,5 → mismo kg. No
llega al mínimo → −2,5 o repetir. En medio → +1 rep. Reentrada (≥21 días) → repetir el último dato
conocido. Bisagra desde el suelo: serie 1 a RPE ≥8 congela la semana (LOAD-003). Un accesorio
estancado 3 semanas rota **en la semana 1 del bloque** (STR-010, `expert`); un **anchor nunca rota por
estancamiento** — se cambia el esquema. Formato de tendencia:
`Bench: W34 92,5×8@7 → W35 92,5×8@7,5 → W36 95×7@8,5 → estancado con deriva de RPE`.
El tamaño del incremento (2,5 / 1,25) es **heurística de práctica, no evidencia**.

**5. Carrera.** Z2 cumplida = FC media ≤ techo (143) **y** (máximo ≤ techo+12 o ≤10 % del tiempo por
encima). Salir de run/walk con 2 carreras seguidas ≥30' bajo el techo y ≤10 % caminando (END-006,
`expert`). Rampa sólo con verde (o amarillo de 1 señal) + adherencia ≥75 % + las 2 últimas en Z2. El
**~10 %/semana es heurística prudente, no un hallazgo** (END-003; Buist 2008, n=532, no encontró
diferencia entre 10,5 % y 23,7 %). Entre junio y septiembre **el ritmo no mide progreso** (ENV-001):
leer FC a ritmo fijo o deriva.

**6. Piloto del déficit** (cada 2 semanas, sobre la pendiente de la media de 7 días). > −0,30 kg/sem
→ −200 kcal, **pero** si la cintura baja ≥1 cm/2 semanas no se toca, y con registro <10 de 14 la
palanca es la adherencia; **la primera palanca son los pasos** (8.000 → 9-10.000, REC-009), no las
kcal · −0,30 a −0,70 → nada · < −0,70 → +150 kcal (REC-002). Suelos: proteína 185 g, 2.500 kcal en día
de entreno, 2.300 en descanso. La semana 1 de un déficit (agua) **no es señal**.

**7. Deload / diet break.** El calendario manda. Reactivo (LOAD-004 + READ-008) sólo si el rendimiento
cae 2 sesiones **y** hay ≥2 señales. Sueño <6,5 h → el sueño primero (READ-006). Deload y
mantenimiento calórico van juntos (REC-005, `weak_extrapolated`); esa semana + 5 días **no cuentan**
para la pendiente del peso.

**8. Colocación.** Los días los dice el **`weekTemplate` del plan vivo**, nunca la memoria: hoy
**Lun `lowerA` y Jue `lowerB` son pierna**, Mar/Vie tren superior. (El playbook viejo los tenía
invertidos y colocaba las carreras duras justo antes de pierna creyendo evitarla, F-9.) Plyo primero y
en fresco en la sesión de pierna A; cinta en los días de tren superior, bici o ski en los de pierna;
remo nunca tras bisagra; una carrera fácil puede ir <24 h antes de pierna, una dura **no**; el largo y
el híbrido nunca la misma semana (INT-001/002/004, HYB-002).

**9. Lo que nunca hace este informe.** Añadir series o sesiones sin adherencia ≥75 % **y** verde **y**
nutrición ≥10/14 · progresar en descarga · rotar un anchor por variedad o estancamiento · concluir
sobre 1 señal o 1 día · dosificar desde un % de un wearable · inventar un kg o un km (sin dato:
"ajustar por RPE, sin dato") · >1 sesión dura por semana · saltos >10 %/semana · separar diet break y
deload · bajar la proteína de 185 · plyo tras cardio · usar CTL/ATL como carga total o para dosificar
fuerza · leer progreso aeróbico por ritmo en verano · más de 3 prioridades.

## El informe — `tracking/weekly-reviews/{weekKey}-deep-dive.md`

Mismas secciones que el briefing del coach (§C.6) más una que sólo tiene sentido aquí:

```markdown
# {weekKey} · lectura profunda — {weekStart} a {weekEnd}

## Qué pasó (n = {días de datos})      ← 2-4 frases con números; la n va siempre
## Decisiones anteriores               ← "Te dije X el {fecha}. Los datos dicen Y (n=Z). Retiro / mantengo / ajusto."
## Qué cambiaría — máx 3 prioridades   ← **{cambio}** — {número}. Cierra con "todo lo demás se mantiene"
## Por qué                             ← dato → decisión; si la regla es expert/weak: "es práctica, no evidencia fuerte"
## Qué vigilo                          ← 2-3 señales, cada una con su umbral
## Qué necesito de ti (≤3)             ← acciones concretas

## Contraste con el coach de la app
| Tema | El coach ({reviewId}, {status}) | Esta lectura | Con qué número |
|---|---|---|---|
| ... | ... | **coincide** / **discrepa** | ... |
Los guardarraíles que la app pintó: {guardrails}. Coste de la revisión: ${usage.costUsd}.

---
*Generado a mano con /coach-deep-dive el {fecha}. Prosa, no plan: el plan vivo es la versión más
alta de `plans` y sólo la cambia la app.*
```

Reglas de honestidad (idénticas a las del coach, y son la mitad del trabajo): **tamaño de muestra
siempre** · grado de evidencia cuando la regla es `expert` o `weak_extrapolated` (GEN-001, STR-010,
REC-005, HYB-\*, END-005/006, READ-003/007/008) · **medido vs modelado vs estimado** (báscula = medida;
TDEE = modelo; e1RM y EA = estimaciones) · los `dataGaps` del pack se repiten **literalmente** ·
"no hay señal" es una respuesta completa · **mantener en déficit se llama progreso** (STR-001) · sin
fechas sin condición ("82 kg si la pendiente aguanta") · **propone, Julian decide**.

## Escrituras

1. `tracking/weekly-reviews/{weekKey}-deep-dive.md` — el informe.
2. *(opcional)* resumen de 4-6 líneas **al principio** de `tracking/weekly-checkins.md` (más reciente
   primero, según `CLAUDE.md`).
3. *(opcional)* una fila en las tablas de `tracking/progress-log.md` (peso, marcadores de fuerza,
   carrera, recuperación).
4. `git add tracking/ && git commit -m "docs: lectura profunda {weekKey}"`. **Sólo `tracking/`.** Si
   hay que empujar, `gh auth switch --user juliangarmendia` primero.

Cierra con: semana analizada, ficheros escritos (rutas completas), los 3 hallazgos principales (una
línea cada uno), y en qué **discrepa** del coach de la app y con qué número.
