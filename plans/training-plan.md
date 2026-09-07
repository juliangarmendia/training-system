# Training Plan — Cut Phase 1

> ## 📍 DÓNDE ESTÁ EL PLAN VIVO (2026-09-07)
>
> **El plan es dato, no documento.** Vive en la tabla/store **`plans`** (Supabase + IndexedDB): la
> fila con la **`version` más alta** es el plan activo, y no hay ningún campo que lo decida. Este
> fichero es referencia de razonamiento y **no lo lee ningún código**.
>
> | Qué | Dónde sale |
> |---|---|
> | La semana (qué día, qué sesión) | `plans` → `weekTemplate`. Semilla y fallback: `IDEAL_BLOCK_V1` (`app/app.js`), variante 3/4/5/6 días elegida por Julian |
> | Las sesiones y los ejercicios | `plans` → `sessions[id].exercises[]` |
> | **Los kg de cada serie** | `suggestSetTarget` (`app/coach-engine.js`, v11.57), prioridad **coach > regla > último**. La tarjeta del ejercicio los pinta con un chip que dice de dónde salen |
> | Cambios estructurales | propuestas semanales del coach en **`coach_reviews`**, que Julian aprueba con un toque (v11.61) |
> | Bloque y descarga | bloques de 5 semanas (4 carga + 1 descarga) anclados al **lunes 2026-09-07**; **primer deload: semana del 2026-10-05**. Ancla: `settings.deloadAnchorDate` |
> | Ajuste por recuperación | `computeReadinessFrom` + `adjustSessionForReadiness` (v11.59): quita accesorios y capa el RPE, **nunca cambia los kg** |
>
> Esquema, flujo de aprobación y reglas de prioridad:
> [`../docs/architecture/plan-v2-schema.md`](../docs/architecture/plan-v2-schema.md). Macroplan
> B1-B4: [`../docs/architecture/coach-v2-implementation-plan.md`](../docs/architecture/coach-v2-implementation-plan.md) §C.1.
>
> **Sigue vigente aquí abajo** (y por eso no se borra): los esquemas de series/reps/RPE, los
> descansos, la progresión doble, el protocolo de estancamiento, los warm-ups y la **tabla de
> sustituciones** — es de donde salen los swaps. Lo caducado está marcado en el aviso de agosto.

> ## ⚠️ PARCIALMENTE OBSOLETO — leer esto primero (2026-08-16)
>
> **El plan vivo ya no es este documento.** Desde v11.28 (2026-06-30) la semana la genera
> `IDEAL_BLOCK_V1` en `app/app.js`, no las tablas de aquí. Qué sigue valiendo y qué no:
>
> | Sección | Estado |
> |---|---|
> | Anchors, esquemas series/reps/RPE, descansos, tempo excéntrico | ✅ **Vigente** — es lo que la app ejecuta |
> | Selección de ejercicios "Program v6.0 Block A" | ✅ Vigente (son las sesiones `upperA`/`lowerA`/`upperB`/`lowerB`) |
> | Progresión doble, protocolo de estancamiento, warm-up, sustituciones | ✅ Vigente |
> | **Bloque de reentrada W26-W28** | ❌ **Caducado** el 2026-07-12. Lo reemplazó el IDEAL el 30-jun |
> | **"Current ISO week: 25", "Next review: W29"** | ❌ Caducado. Hoy es W33; la revisión W29 nunca ocurrió |
> | **Estructura semanal (Mon-Sun, 4 días + 2 runs)** | ❌ Superada por el IDEAL (4 fuerza + Z2 diario + 1 cardio + recuperación) |
> | **Deload en semanas 5 y 9** | ⚠️ **No se dispara desde mayo** — ver auditoría, A4 |
> | Targets de W19 y W20+ | ❌ Históricos |
>
> **No se reescribe con números nuevos porque no los hay**: no hay workouts registrados desde el
> 2026-06-25 (espejo de datos caído, ver auditoría §3). Cualquier carga "actual" aquí sería
> inventada. → [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md)

> Version: 6.0
> Created: 2026-04-06
> Updated: 2026-06-20 (v6.0 top-class redesign for David Lloyd Serrano + re-entry block)
> Estado revisado: 2026-08-16 (auditoría del sistema — ver aviso de arriba)
> Phase: RE-ENTRY → Fat Loss / Strength Maintenance
> Gym: David Lloyd Serrano (Madrid) — premium club, kg. Exercise selection upgraded to its machines; volume unchanged.
> Duration: Open-ended cut — calendar weeks ISO. W18 = last trained week (strong). W19 deload + W20-W25 = unplanned layoff (life/schedule, ~6 weeks, zero training, no injury). W26-W28 = 3-week re-entry ramp. W29+ = resume normal cut.
> Current ISO week: 25 (Mon 2026-06-15 to Sun 2026-06-21). Re-entry starts Mon 2026-06-22 (W26). Back is symptom-free, weight roughly stable (~86-88 kg, needs fresh weigh-in).
> Next review: W29 (after the 3-week re-entry ramp — confirm loads back to W18 baseline, then reset deficit + progression)

---

## ⚡ RE-ENTRY BLOCK — W26-W28 (2026-06-22 to 2026-07-12)

**Situación:** ~6 semanas sin entrenar (W19-W25, motivo agenda/viaje, sin lesión). Espalda asintomática, peso estable. Último entreno real = W18 (fuerte). Esto **no es empezar de cero** — hay memoria muscular, los números de W18 vuelven en ~3 semanas. El riesgo no es la fuerza perdida, son las **agujetas severas + tu historial lumbar (contracturas W2 y W16)**. Por eso bajamos carga ~15% y recortamos series las primeras 2 semanas. Reintroducir cargas de W18 de golpe es el error clásico que termina en lesión.

### Reglas del bloque

1. **RPE TAPADO a 7 (3 RIR) en W26.** Si una serie sale más dura, bajas peso. Sin excepciones.
2. **Movilidad obligatoria desde el día 1**, 3×/sem (Wed Hip Reset · Sat Lumbar · Sun Hip Reset). Fue lo que faltó antes de las dos contracturas.
3. **Running tapado:** W26 = 1 run Z2 fácil (3 km) máx. W27 = 2 runs. No subir volumen antes de W28. Gym > running en reentrada.
4. **Nutrición:** W26 comer ~mantenimiento (~2,900 kcal) — el cuerpo está re-adaptándose, no apiles déficit + agujetas + estrés de reinicio. Proteína ≥170 g siempre. Déficit moderado (~2,500) vuelve en W27.
5. **Pésate diario desde mañana** (4-7×/sem) para reconstruir la tendencia limpia — la última cifra fiable es del 4 may.
6. **Sumo DL y Squat: rampa conservadora.** Aunque la espalda esté bien, son los lifts con más riesgo lumbar tras layoff. Primer working set decide: si sale ≥RPE 8, te quedas ahí esa semana.

### Cargas por semana (compounds) — TODO EN KG

> **Cambio:** a partir de ahora todo en **kg** (te mudaste a España, gimnasio David Lloyd Serrano con discos en kg). La app ya está forzada a kg. W18 de referencia en kg: Bench 92.5 · Squat 97.5 · Sumo 110 · OHP 52.5 · Row 67.5 · Chin BW+10.

| Lift | W26 (~85%, RPE 7, 3 sets) | W27 (~93%, RPE 7-8, 3 sets) | W28 (= W18, RPE 7-8, full) |
|------|---------------------------|-------------------------------|-----------------------------|
| Bench Press | 80 kg | 87.5 kg | 92.5 kg |
| Back Squat | 82.5 kg | 90 kg | 97.5 kg |
| Sumo Deadlift | 95 kg | 102.5 kg | 110 kg (RPE-gated) |
| OHP | 45 kg | 47.5 kg | 52.5 kg |
| Barbell Row | 57.5 kg | 62.5 kg | 67.5 kg |
| Chin-ups | solo BW | BW (+5 si 4×8) | BW +10 kg |

Estas cargas están **embebidas en la app** en las notas de cada ejercicio, y el plan **auto-avanza por fecha** (W26→W27→W28→plan normal) sin que tengas que tocar nada.

### Volumen y running por semana

| | Series compound | Series accesorio | Running | Calorías |
|---|---|---|---|---|
| **W26** | 3 | 2 | 1× Z2 3 km | ~2,900 (mantenimiento) |
| **W27** | 3-4 | 3 | 2× Z2 4 km | ~2,500 (déficit) |
| **W28** | 4 | 3 | 2-3× Z2 | ~2,500 (déficit) |

**Accesorios W26-W27:** mantén la estructura del plan (Upper A/B, Lower A/B abajo) pero recorta a las series indicadas y empieza accesorios livianos. Tempo excéntrico 3s en los 4 marcados sigue vigente, pero peso conservador. Espera agujetas fuertes tras W26 — es esperado y deliberado; no lo combatas añadiendo volumen.

**Qué pasa en W29:** si W28 cerró con las cargas de W18 a RPE ≤8 y sin molestia lumbar, se reanuda el cut normal con doble progresión y la reevaluación formal que quedó pendiente (peso, fotos, working weights). Si no, se repite W28 una semana más.

---

## 🏆 Program v6.0 — Top-Class (David Lloyd Serrano)

This is the **authoritative current exercise selection** (live in the app's `PLAN`). It keeps the proven 4-day Upper/Lower structure, the 5 strength anchors, the rep/RPE schemes, eccentric-tempo accessories, and **identical per-session volume** (22/19/20/19 sets) — only the accessory *selection* is upgraded to David Lloyd's machines for better stimulus and joint-friendliness. **No added volume** (deficit + re-entry constraint). During W26–W28 these same exercises run at the conservative re-entry loads above; full loads resume W29.

**Anchors (never rotate):** Barbell Bench · Barbell Back Squat · Sumo Deadlift · OHP · Chin-ups · Barbell Row.

### Block A (live now)

| Session | Exercises (sets × reps @ RPE) |
|---|---|
| **Upper A** | Bench 4×5-8@7-8 · Barbell Row 4×6-10@7-8 · Incline DB Press 3×8-12@7 (3s ecc) · **Lat Pulldown** 3×10-12@7 *(v11.35)* · Face Pull 3×12-15@7 · DB Lateral 3×12-15@7 · Rope Pushdown 2×10-15@7 |
| **Lower A** | Back Squat 4×5-8@7-8 · RDL 3×8-10@7 (3s ecc) · **Hack Squat** 3×10-12@7-8 · **Seated Leg Curl** 3×10-12@7 (3s ecc) · Standing Calf 3×12-15@7 · **Ab Wheel** 3×8-12 *(v11.37)* |
| **Upper B** | Chin-ups 4×5-8@7-8 · OHP 4×5-8@7-8 · **Pec Deck** 3×10-12@7 *(v11.35)* · **Chest-Supported Row** 3×10-12@7 · Incline DB Curl 3×10-12@7 (3s ecc) · **Lateral-Raise Machine** 3×12-15@7 · Hanging Leg Raise 3×8-12 |

### Full Body A / B — variantes de 3 y 4 días

| Sesión | Ejercicios | Series |
|---|---|---|
| **Full Body A** | Back Squat 4×5-8@7-8 · Bench Press 3×6-8@7-8 · Barbell Row 3×8-10@7-8 · **Seated Leg Curl 3×10-12@7** · **Pallof Press 3×10-15** | 16 |
| **Full Body B** | Sumo DL 3×3-6@7-8 (RPE-gated) · OHP 3×5-8@7-8 · Chin-ups 3×6-8@7-8 · **Leg Extension 3×10-15@7-8** · **Ab Wheel 3×8-12** | 15 |

Estructura: **3 compuestos de barra + 1 máquina + 1 core** en A; **2 de barra + dominadas + 1
máquina + 1 core** en B. Un solo lift de carga espinal pesada por sesión (squat en A, sumo en B).

> **Cambio v11.38 (2026-08-18) — corrige un error de v11.37.** v11.37 metió un RDL en `fullA` para
> tapar el hueco de isquios. El hueco era real; la solución no: dejaba **cuatro compuestos de barra
> seguidos** y ponía una bisagra justo después de 4 series de sentadilla pesada, apilando carga
> axial sobre un historial de dos contracturas lumbares.
> - **RDL → Seated Leg Curl.** Mismo estímulo de isquios, **cero** carga espinal. La extensión de
>   cadera ya la cubre el sumo de `fullB`; lo que faltaba aquí era flexión de rodilla.
> - **`fullB` no tenía NADA de cuádriceps.** El cuádriceps dependía entero de las 4 series de
>   sentadilla de `fullA`, un solo día. Con la extensión pasa a **7 series en 2 días** (STR-002).
>
> **Cambio v11.37 (2026-08-17).** Cero anti-rotación / anti-extensión en toda la semana, con dos
> contracturas lumbares detrás. Cable Crunch y Hanging Leg Raise son ambos flexión: lo contrario de
> lo que pide **ATH-003**, que es `strong` y nombra Pallof y ab wheel *por* ese historial. Ahora
> Pallof en A y Ab Wheel en B. El mismo fallo estaba en **Lower A** del plan de 6 días
> (Cable Crunch → Ab Wheel).
>
> Volumen de la semana de 3/4 días: 25 → **31 series**. Sigue siendo dosis de mantenimiento
> deliberada; el aumento viene de dar cuádriceps a `fullB` e isquios a `fullA`, que eran ceros.

> **Cambio v11.35 (D2, 2026-08-16).** Pec Deck se muda de Upper A a Upper B y Lat Pulldown ocupa su
> sitio, para que **empuje horizontal y tirón vertical se entrenen 2×/semana** (STR-002). Antes
> Upper A concentraba 10 series de pecho y Upper B era el único día con dominadas. El pecho sigue
> en 10 series semanales, sólo repartidas. **Coste: la espalda sube de 11 a 14 series/semana y el
> total de 80 a 83** — dentro del rango de STR-003, pero es un aumento de volumen en déficit.
> El press vertical (OHP) se deja a propósito en 1×/semana: es un ancla de fuerza donde la carga
> pesa más que la frecuencia, y el deltoides anterior ya recibe trabajo indirecto los dos días.
| **Lower B** | Sumo DL 4×3-6@7-8 (RPE-gated) · **Glute-Drive machine** 3×8-12@7 · BSS 3×8-10/side@7-8 · Leg Extension 3×10-15@7-8 · Lying Leg Curl 3×10-12@7 (3s ecc) · Cable Pallof 3×10-15 |

### Block B (activate at W29 via plan version — rotation for novel stimulus)

| Session | Exercises |
|---|---|
| **Upper A** | Bench · **Pendlay Row** · **Hammer Strength Chest Press** · Cable Crossover (high-low) · Reverse Pec Deck · DB Lateral · Overhead Rope Ext |
| **Lower A** | Back Squat · **Stiff-Leg Deadlift** · **Linear Leg Press** · Seated Leg Curl · Seated Calf · Cable Crunch |
| **Upper B** | Chin-ups (weighted) · OHP (or Machine Shoulder Press) · Lat Pulldown · **Low/High Row machine** · **Hammer Curl** · Cable Lateral · Hanging Leg Raise |
| **Lower B** | **Trap-Bar Deadlift** (lumbar-friendly rotation) · Glute-Drive · Walking Lunge (DB) · Leg Extension · **GHR (Glute-Ham Raise / GHD)** · Hanging Leg Raise |

> The detailed per-exercise rationale tables further down predate v6.0; the anchors are unchanged, and the accessory swaps above supersede the old accessory rows. The Block A/B rotation table below is updated to v6.0.

---

## Rationale

### Why a 4-day Upper/Lower Split

**Problem to solve:** You have the availability to train daily, but your biggest constraint is *consistency of frequency* — you show up, but how many days per week varies. A 4-day program tolerates missed sessions better than 5-6 days. Miss one day? Still 3 sessions — that works. Miss two? 2 sessions — suboptimal but not a wasted week. A 5-6 day program collapses if you miss 2 days because the split becomes unbalanced.

**Why upper/lower over push/pull/legs:** Upper/lower guarantees 2x frequency per muscle group in 4 sessions. PPL requires 6 sessions for 2x frequency. At your consistency level, 6 sessions/week is aspirational, not realistic. Upper/lower is the highest-frequency-per-session split that fits your constraints.

**Evidence basis:**
- Schoenfeld et al. (2024-2025 meta-regression, n=2058): training frequency has negligible independent effect on hypertrophy when weekly volume is equated. 2x/week per muscle group is sufficient.
- 10-14 sets per muscle group per week is the evidence-based target during a deficit — diminishing returns beyond ~20 sets/week (Schoenfeld et al., 0.38% hypertrophy per additional set with diminishing returns).

### Why These Intensity Targets

**RPE 7-9 (1-3 RIR), never to failure during a cut:**
- Refalo et al. (2024 meta-regression): hypertrophy improves modestly as sets approach failure, but the difference between 1-3 RIR and 0 RIR is small. Strength gains are similar across a wide RIR range.
- 2024 RCT in trained individuals: no significant hypertrophy difference between failure and 2-3 RIR groups, but the failure group accumulated significantly more fatigue and velocity loss.
- During a caloric deficit, recovery is already compromised. The marginal hypertrophy benefit of training to failure does not justify the disproportionate recovery cost. RPE 7-8 on compounds, RPE 7-8 on accessories.

### Why No Metcons / WODs / Bonus Work

Your previous program had 30-40+ working sets per session including CrossFit-style finishers and bonus pump work. This was excessive even at maintenance. During a deficit:
- Recovery capacity drops ~20-30% (estimated from reduced glycogen, elevated cortisol, impaired sleep quality)
- Every set that doesn't contribute to the primary goals (strength maintenance, muscle preservation) is stealing recovery from sets that do
- Conditioning comes from structured running (separate sessions), not from metabolic work bolted onto lifting sessions
- Target: 16-20 hard working sets per session. Done in 50-60 minutes. Walk out.

---

## Block Periodization

The program uses two training blocks with exercise rotation to prevent adaptation and overuse:

### Block A — Weeks 1-4 (Current)
Establish baselines. Same exercises each week to track progression accurately. RPE 7-8.

### Block B — Weeks 6-9
Main compounds stay. Accessories and secondary movements rotate to:
- Provide new stimulus after 4 weeks of the same movement patterns
- Reduce overuse stress on joints (especially shoulders and knees)
- Maintain motivation through variety
- Target muscle groups from different angles

| Block A (Weeks 1-4) | Block B (Weeks 6-9) | Why the swap |
|---|---|---|
| Incline DB Press | Hammer Strength Chest Press | Machine stability lets you push closer to failure safely |
| Pec Deck | Cable Crossover (high-low) | Different resistance curve, peak-contraction emphasis |
| Barbell Row (overhand) | Pendlay Row | Stricter form, more explosive concentric |
| Hack Squat | Linear Leg Press | Different quad loading / knee angle |
| RDL | Stiff-Leg Deadlift | Greater hamstring stretch |
| Seated Leg Curl | Lying Leg Curl | Different hip angle on the hamstring |
| Lying Leg Curl (Lower B) | GHR / Glute-Ham Raise (GHD) | Eccentric-overload hamstring, top-tier stimulus |
| Chest-Supported Row | Low/High Row machine | Angle variation on mid-back |
| Incline DB Curl | Hammer Curl | Brachialis emphasis, forearm development |
| Lateral-Raise Machine | Cable Lateral Raise | Different resistance profile |
| Sumo Deadlift (Lower B anchor) | Trap-Bar Deadlift | Lumbar-friendly rotation given back history |
| Glute-Drive | (stays) | Premium glute machine, keep both blocks |

**Main compounds that DO NOT change:** Bench Press, Back Squat, Sumo Deadlift, OHP, Chin-ups. These are your strength markers — consistency is how you measure progress.

### Week 5 — Deload + Transition
50% volume, RPE 6, eat at maintenance. Use this week to practice Block B exercises at light weight to find working loads before week 6.

---

## Week 1 Baselines (2026-04-07 to 2026-04-12)

**Sessions completed: 3/4** (missed Lower B — no deadlift baseline yet)
**Body weight: 88.3 kg** (down 0.3 from 88.6 baseline)
**Runs: 0** (plan called for 1 zone 2 run)
**Quality: 4/5 across all sessions**

### Upper A Baselines (April 7) — 59 min
| Exercise | Working sets | RPE | Notes |
|---|---|---|---|
| Bench Press | 84 kg × 8, 88.45 kg × 6, 88.45 kg × 8 | 8-8.5 | Good starting point. 88.45 kg ≈ RPE 8.5 on last set — this is the working weight |
| Barbell Row | 60 kg × 10, 60 kg × 10, 65.77 kg × 10, 65.77 kg × 10 | 7.5-8.5 | Ramped well. 65.77 kg working weight |
| Incline DB Press | 20 kg × 12, 22.7 kg × 12, 22.7 kg × 12 | 6.5-7 | Per DB. Room to push harder |
| Face Pull | 17 × 15, 21.55 × 15, 21.55 × 15 | 6.5-8 | Good |
| Lateral Raise | 7 kg × 15 × 3 | 7-7.5 | Stable |
| Tricep Pushdown | 21.55 × 15 × 2 | 7.5-8.5 | Only 2 sets (plan says 2) |

### Lower A Baselines (April 8)
| Exercise | Working sets | RPE | Notes |
|---|---|---|---|
| Back Squat | 93 kg × 8, 97.5 kg × 8, 97.5 kg × 8 | 7-8 | **First real squat baseline.** 97.5 kg × 8 @ RPE 8 is solid for a first week. Logged in lb (205, 215) |
| RDL | 61.2 kg × 10, 70.3 kg × 10, 70.3 kg × 10 | 6.5-7 | Room to increase. Logged in lb (135, 155) |
| Leg Press | 81.6 kg × 12 × 3 | 7 | Stable. Logged in lb (180) |
| Leg Curl | 31.8 kg × 12 × 3 | 7 | Good. Logged in lb (70) |
| Calf Raise | 43.1 kg × 15 × 3 | 7 | Good. Logged in lb (95) |
| Ab Wheel | **Skipped** | — | Needs substitute or commitment. Suggest weighted plank if ab wheel doesn't work |

### Upper B Baselines (April 9)
| Exercise | Working sets | RPE | Notes |
|---|---|---|---|
| Chin-ups | BW × 8 × 4 | 7-7.5 | Excellent — 4×8 at ~88 kg BW. Ready to add weight next session |
| OHP | 43.1 kg × 8, 47.6 kg × 8, 52.2 kg × 8, 52.2 kg × 8 | 6.5-7.5 | **First OHP baseline.** 52.2 kg × 8 @ RPE 7.5. Room to grow. Logged in lb (95, 105, 115) |
| Landmine Row | 40.8 kg × 12, 49.9 kg × 12, 49.9 kg × 12 | 7 | Per side. Good. Logged in lb (90, 110) |
| Incline Curl | 11.3 kg × 12 × 3 | 7 | Per DB. Logged in lb (25) |
| Cable Lateral | Inconsistent (12.5, 7.5, 9.5) | 6.5-8 | Finding the weight. Settle at ~10 for week 2 |
| Hanging Leg Raise | BW × 12 × 3 | 7 | Good |

### Lower B Baselines — NOT DONE
No data. Deadlift, BSS, leg extension, hip thrust baselines still needed. **Priority for week 2.**

---

## Week 2 Targets (2026-04-14 to 2026-04-20)

**Priority: Complete all 4 sessions + 1 zone 2 run**

| Session | Key targets |
|---|---|
| Upper A | Bench: stay at 88.45 kg, aim for 7-8 reps on all working sets. Row: start at 65.77 kg. |
| Lower A | Squat: stay at 97.5 kg, aim for 8 reps × 3 sets @ RPE 7-8. RDL: try 72.5 kg. Do the ab wheel or sub in weighted plank. |
| Upper B | Chin-ups: add 2.5 kg (belt or DB). OHP: start at 52.2 kg, push for consistency. Cable lateral: settle at one weight. |
| Lower B | **Must do.** Find baselines for: Sumo DL, Bulgarian Split Squat, Leg Extension, Hip Thrust. Start conservative (RPE 7). |
| Run | 1 × 4-5 km zone 2 (Wed or Sat). HR < 140 bpm. |

---

## Weekly Structure

| Day | Session | Primary Goal | Duration |
|-----|---------|-------------|----------|
| Mon | **Upper A** — Horizontal Press | Bench strength + upper body volume | 50-60 min |
| Tue | **Lower A** — Squat | Squat strength + quad/ham volume | 50-60 min |
| Wed | Run (zone 2) or Rest | Aerobic base + energy expenditure | 25-40 min |
| Thu | **Upper B** — Vertical Pull/Press | OHP + chin-up strength + upper body volume | 50-60 min |
| Fri | **Lower B** — Hip Hinge | Deadlift strength + posterior chain volume | 50-60 min |
| Sat | Run (zone 2) | Aerobic base + energy expenditure | 25-40 min |
| Sun | Rest | Recovery | — |

### Schedule Rules

1. **Days can shift** — the pattern (U-L-rest/run-U-L-run-rest) matters, not the specific weekday
2. **Never stack two lower sessions back-to-back** — quads and posterior chain need 48h minimum between heavy sessions
3. **If you miss 1 gym day:** skip it, keep going. Don't "make it up" by doubling up
4. **If you miss 2 gym days:** do the 2 sessions you missed next time you're in the gym, keeping at least 1 rest day between them
5. **If you can only train 3 days in a week:** do Upper A + Lower A + Upper B. Alternate: next 3-day week do Upper A + Lower B + Upper B. The squat and deadlift should each appear at least once per week.
6. **Running days are flexible** — can move to any non-lower-body day. Can also skip if recovery demands it. Gym > running during a cut.

---

## Sessions

### Warm-up Protocol (Every Session)

| Step | Activity | Detalle (sets × reps) | Tiempo |
|------|----------|----------------------|--------|
| 1 | Treadmill walk o bike fácil (RPE 4-5, podés hablar normal) | continuo | **5 min** |
| 2a | Leg swings front-back | 1 × 10 cada pierna | 30 s |
| 2b | Leg swings lateral | 1 × 10 cada pierna | 30 s |
| 2c | Arm circles (10 forward + 10 backward) | 1 × 20 total | 30 s |
| 2d | Hip CARs (controlled articular rotations) | 1 × 5 cada lado, ambas direcciones | 60 s |
| 2e | Thoracic rotation (cuadrúpedo, mano detrás de cabeza) | 1 × 8 cada lado | 60 s |
| 2f | Bodyweight squat con hold 3 s en el último | 1 × 8 reps | 30 s |
| 3 | **Ramps del main lift** (ej. para Bench 88 kg working) | 4 sets ascendentes, descanso 60 s entre | **~5 min** |
| 3a | — Barra vacía (20 kg) | 1 × 8 | |
| 3b | — 50% working weight (44 kg) | 1 × 6 | |
| 3c | — 70% working weight (62 kg) | 1 × 4 | |
| 3d | — 85% working weight (75 kg) | 1 × 2 | |

**Tiempo total warm-up: ~12 min** (5 cardio + 4 mobility + 3 ramps).

**Solo se ramps el primer compound de la sesión.** Para los siguientes ejercicios: 1-2 sets de aproximación a peso liviano (~50% working) × 5-8 reps si el patrón cambia significativamente; sino arrancar directo con working weight.

**Mobility post-sesión (Hip Reset / Lumbar / Thoracic) NO va aquí** — son rutinas separadas de 7-10 min, agendadas Wed/Sat/Sun. Ver detalle en la app (cada rutina tiene 5-6 ejercicios con reps explícitas).

**Evidence:** General warm-up increases muscle temperature 1-2°C, improving contraction velocity and reducing injury risk. Specific warm-up sets potentiate the neuromuscular system (post-activation potentiation) for heavier loads. 3-4 progressive sets are sufficient — more than that adds fatigue without benefit (Fradkin et al., 2010).

---

### Upper A — Horizontal Press Focus

| # | Exercise | Sets × Reps | RPE | Rest | Why This Exercise |
|---|----------|-------------|-----|------|-------------------|
| 1 | **Barbell Bench Press** | 4 × 5-8 | 7-8 | 2-3 min | Primary horizontal press. Your strongest pattern — maintain it. Flat barbell > floor press (full ROM, greater pec stretch, better progressive overload). Smith machine removed: free barbell develops stabilizers and transfers to real-world strength |
| 2 | **Barbell Row (overhand grip)** | 4 × 6-10 | 7-8 | 2-3 min | Horizontal pull to match pressing volume. Overhand grip emphasizes upper back, rear delts, rhomboids. Corrects the press-dominant imbalance from your previous program |
| 3 | **Incline DB Press (30-45°)** — *3s eccentric* | 3 × 8-12 | 7 | 90 sec | Upper chest emphasis. DB allows independent arm work, correcting imbalances. **W19 update: bajar 3 segundos controlado en cada rep** (eccentric overload — Currier 2026 confirma como una de las pocas variables con efecto consistente en hipertrofia). Si el peso no permite 3s controlado, bajar 5-10% |
| 4 | **Cable Face Pull** | 3 × 12-15 | 7 | 60 sec | External rotation + rear delt. Critical for shoulder health with heavy pressing. Non-negotiable — replaces upright rows from your old program (impingement risk) |
| 5 | **DB Lateral Raise** | 3 × 12-15 | 7 | 60 sec | Side delt width. Light, controlled, full ROM. Side delts respond well to higher reps and moderate loads |
| 6 | **Cable Fly (high-to-low or mid)** | 3 × 10-12 | 7 | 60 sec | **Añadido W19 →** sube chest de 7 a 10 sets/sem (alinea con Currier 2026 dose-response: 10 sets/musc/sem es el punto donde empieza el beneficio claro). Cable mantiene tensión constante a través del ROM, complementa el barbell/DB que pierden tensión arriba. Stretch profundo abajo |
| 7 | **Tricep Rope Pushdown** | 2 × 10-15 | 7 | 60 sec | Direct tricep work. Triceps get heavy pressing stimulus from bench and incline; this is supplemental isolation. 2 sets is sufficient given pressing volume |

**Total working sets: 22** (20 sin tricep opcional)

**Movement pattern breakdown:**
- Horizontal press: 7 sets (bench 4 + incline 3)
- Chest isolation: 3 sets (cable fly)
- Horizontal pull: 4 sets (row)
- Shoulder isolation: 6 sets (face pull 3 + lateral 3)
- Tricep isolation: 2 sets

---

### Lower A — Squat Focus

| # | Exercise | Sets × Reps | RPE | Rest | Why This Exercise |
|---|----------|-------------|-----|------|-------------------|
| 1 | **Barbell Back Squat** | 4 × 5-8 | 7-8 | 3 min | **Priority #1 this program.** Your squat was never a main lift — box squats and front squats as accessories only. Full back squat is the most effective compound for quad, glute, and total lower body development. Use the rack safeties. Start light weeks 1-2, build from there |
| 2 | **Barbell RDL** — *3s eccentric (formal)* | 3 × 8-10 | 7 | 2-3 min | Posterior chain: hamstrings + glutes. Not a deadlift — **eccentric controlado de 3 segundos (W19: ahora es una regla, no sugerencia)**, hinge at the hip, stop at mid-shin. Eccentric overload aporta hipertrofia adicional (Currier 2026). Develops the hip hinge pattern that feeds into your sumo deadlift on Lower B |
| 3 | **Leg Press** | 3 × 10-12 | 7-8 | 2 min | Additional quad volume without spinal loading. After heavy squats, the spine is fatigued but quads can handle more. Leg press fills that gap. Medium-high foot position for quad emphasis |
| 4 | **Leg Curl (machine)** | 3 × 10-12 | 7 | 90 sec | Isolated hamstring work. Hamstrings need both hip extension (RDL) and knee flexion (leg curl) for complete development. Machine removes stability demands — focus on contraction quality |
| 5 | **Standing Calf Raise** | 3 × 12-15 | 7 | 60 sec | Full ROM: deep stretch at bottom, pause 1 sec at top. Calves respond to higher reps and high frequency but are trained 1x here (deficit volume economy). Control the eccentric |
| 6 | **Ab Wheel Rollout** | 3 × 8-12 | — | 60 sec | Anti-extension core. Superior to sit-ups for building core stability under load (which matters for squat/deadlift bracing). Scale: knees on floor → full rollout from feet |

**Total working sets: 19**

**Movement pattern breakdown:**
- Squat: 7 sets (back squat 4 + leg press 3)
- Hip hinge: 3 sets (RDL)
- Hamstring isolation: 3 sets (leg curl)
- Calf: 3 sets
- Core: 3 sets

---

### Upper B — Vertical Pull/Press Focus

| # | Exercise | Sets × Reps | RPE | Rest | Why This Exercise |
|---|----------|-------------|-----|------|-------------------|
| 1 | **Chin-ups** (or Lat Pulldown if <5 reps) | 4 × 5-8 | 7-8 | 2-3 min | Primary vertical pull. Chin-ups (supinated grip) train lats, biceps, and lower traps under load. At ~89 kg BW with 6 reps baseline, you're in a good range. When you hit 4×8, add weight (DB between feet or belt). If you can't hit 5 reps, use lat pulldown until you can |
| 2 | **Overhead Press (standing, barbell)** | 4 × 5-8 | 7-8 | 2-3 min | Primary vertical press. Missing from your strength data — needs a baseline. Standing barbell engages core more than seated. Strict form: no leg drive. This will likely be your weakest lift initially — that's fine |
| 3 | **Landmine Row** | 3 × 8-12/side | 7 | 90 sec | Unilateral horizontal pull. Uses your landmine attachment. Addresses left-right imbalances. Complements the bilateral barbell row on Upper A |
| 4 | **Incline DB Curl** — *3s eccentric* | 3 × 10-12 | 7 | 60 sec | Bicep isolation at stretch. Incline position emphasizes the long head and provides a deep stretch at the bottom. **W19: bajar 3 segundos** — eccentric con stretch profundo es uno de los mayores drivers de hipertrofia bicep. 3 sets sigue siendo suficiente (chin-ups y rows aportan trabajo indirecto) |
| 5 | **Cable Lateral Raise** | 3 × 12-15 | 7 | 60 sec | Side delts, second hit of the week. Cable provides constant tension throughout ROM (unlike DBs where tension drops at the bottom). Variation from DB laterals on Upper A |
| 6 | **Hanging Leg Raise** (or Knee Raise) | 3 × 8-12 | — | 60 sec | Core: hip flexion emphasis. Complements anti-extension work (ab wheel) from Lower A. Scale: knee raises → straight leg raises → weighted |

**Total working sets: 20**

**Movement pattern breakdown:**
- Vertical pull: 4 sets (chin-ups)
- Vertical press: 4 sets (OHP)
- Horizontal pull: 3 sets (landmine row)
- Bicep isolation: 3 sets
- Shoulder isolation: 3 sets
- Core: 3 sets

---

### Lower B — Hip Hinge Focus

| # | Exercise | Sets × Reps | RPE | Rest | Why This Exercise |
|---|----------|-------------|-----|------|-------------------|
| 1 | **Sumo Deadlift** | 4 × 3-6 | 7-8 | 3-4 min | Your strongest hinge at ~116 kg × 5. Heavier, lower rep range than Lower A's RDL. Sumo reduces spinal loading vs conventional while emphasizing quads and adductors alongside posterior chain. Reset each rep from the floor — no touch-and-go during a cut (fatigue management). **Regla post-contractura W16 (vigente):** primer set de calentamiento + working set 1 deciden si se progresa. Si el primer working set sale RPE ≥8.5 → bajar a 3 sets, no escalar load esa semana. No saltar load más de +5 lb (2.5 kg) por semana hasta tener 4 semanas consecutivas sin síntomas lumbares |
| 2 | **Bulgarian Split Squat (DB)** | 3 × 8-10/side | 7-8 | 90 sec/side | Unilateral squat pattern. Addresses left-right imbalances. High quad + glute activation without heavy spinal loading (you already loaded the spine with deadlift). Rear foot elevated on bench. These are hard — start light |
| 3 | **Leg Extension (machine)** | 3 × 10-15 | 7-8 | 90 sec | Quad isolation. After deadlifts and BSS, add quad volume without additional hip hinge fatigue. Controlled eccentric (2-3 sec), squeeze at top. This is the one place to chase the burn |
| 4 | **Leg Curl (machine)** — *3s eccentric* | 3 × 10-12 | 7 | 90 sec | Hamstring isolation, second hit of the week (paired with Lower A). **W19: bajar 3 segundos en cada rep, squeeze 1s arriba**. Frecuencia suficiente para mantenimiento hamstring en cut |
| 5 | **Barbell Hip Thrust** | 3 × 8-12 | 7 | 2 min | Glute-dominant hip extension. You know this exercise from your old program. Heavy is fine but RPE 7 — don't grind reps. This movement has the highest glute EMG of any exercise (Contreras et al.) |
| 6 | **Cable Pallof Press** or **Cable Crunch** | 3 × 10-15 | — | 60 sec | Core: anti-rotation (Pallof) or flexion (crunch). Alternate between them weekly for variety. Both develop the core stabilization needed for heavy squats and deadlifts |

**Total working sets: 19**

**Movement pattern breakdown:**
- Hip hinge: 4 sets (sumo DL)
- Squat (unilateral): 3 sets (BSS)
- Quad isolation: 3 sets (leg extension)
- Hamstring isolation: 3 sets (leg curl)
- Glute isolation: 3 sets (hip thrust)
- Core: 3 sets

---

## Weekly Volume Summary

| Muscle Group | Sets/Week | Source | Evidence Target | Status |
|-------------|-----------|-------|----------------|--------|
| Chest | **10** | Bench 4 + Incline DB 3 + Cable Fly 3 | 10-14 | **Mid-low (W19 update).** Subido de 7 → 10 sets para alinear con Currier 2026 dose-response. OHP suma estímulo anterior delt indirecto sobre pecho |
| Back (lats/rhomboids) | 11 | Row 4 + Chin-up 4 + Landmine 3 | 10-14 | Mid-range. Pulling volume intentionally matches or exceeds pressing to correct imbalance |
| Shoulders (side/rear) | 9 | Face Pull 3 + DB Lateral 3 + Cable Lateral 3 | 8-12 | Mid-range. OHP adds 4 sets of anterior delt |
| Quads | 13 | Squat 4 + Leg Press 3 + BSS 3 + Leg Ext 3 | 10-14 | Mid-range. Squat is undertrained — needs volume |
| Hamstrings | 9 | RDL 3 + Leg Curl 6 | 8-12 | Mid-range. Sumo DL contributes indirectly |
| Glutes | 7+ | Squat/DL contribute + Hip Thrust 3 | 6-10 | Adequate. Squat + DL + BSS all contribute |
| Biceps | 3 direct + ~8 indirect | Curl 3 + chin-ups/rows | 6-10 | Sufficient. Chin-ups and rows are the primary bicep builders |
| Triceps | 2 direct + ~8 indirect | Pushdown 2 + bench/OHP/incline | 6-10 | Sufficient. Heavy pressing drives tricep growth |
| Core | 9 | Ab wheel 3 + Leg raise 3 + Pallof/crunch 3 | 6-9 | Adequate for stability and aesthetics |
| Calves | 3 | Calf raise 3 | 4-8 | Low end — acceptable during a cut. Increase if priority |

**Total weekly working sets: ~80** across 4 sessions (~20/session average) — Upper A pasa a 22 sets con Cable Fly añadido.

This is approximately **half the volume** of your previous program's estimated 120-160 working sets/week. Every set is purposeful. There is no junk volume.

---

## Progression Rules

### Compounds (Bench, Squat, Deadlift, OHP, Row, Chin-up)

**Double progression model:**

1. Start at the **bottom** of the rep range with a weight you can control at RPE 7
2. Each session, try to add 1 rep to each set while staying at the same RPE
3. When you hit the **top** of the rep range for ALL working sets at RPE 7-8 → add minimum load:
   - Barbell: +2.5 kg (1.25 kg/side)
   - Dumbbells: +1 kg each (or next available pair)
   - Chin-ups: +2.5 kg added weight
4. After adding weight, drop back to the **bottom** of the rep range
5. Repeat

**Example — Bench Press (4 × 5-8):**
- Week 1: 70 kg × 5, 5, 5, 5 @RPE 7 ← finding your working weight
- Week 2: 70 kg × 6, 6, 5, 5 @RPE 7
- Week 3: 70 kg × 7, 7, 6, 6 @RPE 7-8
- Week 4: 70 kg × 8, 8, 7, 7 @RPE 8
- Week 5: DELOAD
- Week 6: 72.5 kg × 5, 5, 5, 5 @RPE 7 ← weight increase, reps reset
- Repeat

**Stall protocol:** If you can't hit the bottom of the rep range for 2 consecutive sessions:
1. Check: sleep, nutrition, stress, missed sessions
2. If all fine: reduce weight by 5-10%, rebuild. This is not failure — it's fatigue management
3. **Maintaining your current numbers IS progress during a cut** — reframe your expectations

### Accessories (Incline DB, Leg Press, Curls, etc.)

Same double progression but with smaller increments:
1. Hit top of rep range for all sets → add 1 rep next session
2. Exceed rep range → add minimum load increment, drop to bottom of rep range
3. Don't chase PRs on accessories. Smooth, controlled reps. The stimulus is in the quality, not the weight.

---

## RPE Targets by Phase

| Phase | Weeks | Compounds RPE | Accessories RPE | Notes |
|-------|-------|--------------|----------------|-------|
| Baseline | 1-2 | 7 (3 RIR) | 6-7 (3-4 RIR) | Find working weights. Nothing should feel hard. Learn the program |
| Build | 3-4 | 7-8 (2-3 RIR) | 7 (3 RIR) | Normal training. Push a little harder on compounds |
| **Deload** | **5** | **6 (4 RIR)** | **6 (4 RIR)** | **50% volume, same load, nothing hard** |
| Push | 6-8 | 8-9 (1-2 RIR) | 7-8 (2-3 RIR) | Highest intensity of the block. Still never to failure |
| **Deload** | **9** | **6 (4 RIR)** | **6 (4 RIR)** | **Deload + full program reassessment** |

**Evidence for reactive vs proactive deloads:** Proactive deloads every 4-6 weeks prevent accumulated fatigue from reaching a point where performance declines meaningfully. During a deficit, err on the side of deloading earlier rather than later. The deload week also aligns with a diet break (see nutrition plan).

---

## Rest Period Guidelines

Based on the 2024 Bayesian meta-analysis: hypertrophy outcomes are similar across 1-3+ min rest intervals. Strength improves modestly with longer rest (≥2 min).

| Exercise Type | Recommended Rest | Rationale |
|--------------|-----------------|-----------|
| Main compounds (Bench, Squat, DL, OHP) | 2-3 min | Strength priority. Full ATP-CP recovery between heavy sets |
| Secondary compounds (Row, Chin-up, RDL, BSS) | 2-3 min | Still heavy enough to warrant full recovery |
| Accessories (Leg press, curls, laterals, etc.) | 60-90 sec | Hypertrophy focus. Moderate loads don't deplete ATP-CP as much. Shorter rest = time efficiency |
| Core work | 60 sec | Stability work. Doesn't need long recovery |

**Note:** These are guidelines, not mandates. You indicated you want to set rest periods yourself in the app — these are the evidence-based defaults. Adjust based on how recovered you feel between sets. If your performance drops significantly set-to-set, you're resting too little.

---

## Deload Protocol

**Weeks 5 and 9:**

| Parameter | Normal Week | Deload Week |
|-----------|------------|-------------|
| Working sets per exercise | 3-4 | 2 |
| Load | Working weight | Same or -5% |
| RPE | 7-9 | 6 |
| Session duration | 50-60 min | 30-40 min |
| Running | Normal | 1 easy run, shorter distance |
| Deficit | Normal | **Eat at maintenance** (diet break — see nutrition plan) |

**Why deload + diet break together:** The MATADOR study (Byrne et al., 2018) showed that intermittent energy restriction (periods at maintenance) reduces adaptive thermogenesis and improves long-term fat loss outcomes. Combining the deload week with a diet break maximizes recovery: reduced training stress + adequate calories = optimal recovery and hormonal normalization.

---

## Substitution Table

Only substitute if equipment is unavailable or an exercise causes *pain* (not discomfort — pain).

| Exercise | Sub 1 (preferred) | Sub 2 (if needed) | Notes |
|----------|-------------------|-------------------|-------|
| Barbell Back Squat | Front Squat | Heel-elevated Goblet Squat (DB) | Front squat if mobility limits back squat. Goblet squat only temporary while building load |
| Sumo Deadlift | Trap Bar Deadlift | Conventional Deadlift | Trap bar reduces lumbar demand. You have a hex bar — good option |
| Barbell Bench Press | DB Bench Press | — | DB bench is a legitimate alternative, not inferior |
| Overhead Press | Landmine Press | Seated DB Press | Landmine if shoulder mobility limits overhead position |
| Chin-ups | Lat Pulldown (close grip, supinated) | Band-assisted Chin-ups | Pulldown until you can do 3×5 chin-ups, then transition |
| Barbell Row | Chest-supported DB Row | Cable Row (seated) | Chest-supported removes lower back fatigue — good option after heavy deadlifts |
| Bulgarian Split Squat | Walking Lunge (DB) | Single-leg Leg Press | If balance is the limiter, use leg press single-leg |
| Ab Wheel Rollout | Plank (weighted) | Dead Bug | Dead bug if rollout causes lower back discomfort |

If substituting, log the substitution and reason. If you substitute the same exercise for 3+ weeks, consider making it the permanent choice and adjusting the plan.

---

## What to Log Every Session

1. **Date**
2. **Session name** (Upper A, Lower A, Upper B, Lower B)
3. For each exercise:
   - Exercise name
   - Load (kg or lb — stay consistent)
   - Reps completed per set
   - RPE felt per set (or at least for the last set)
4. **Session duration** (total time in gym)
5. **Session quality** (1-5: 1=terrible, 5=crushed it)
6. **Notes** (anything unusual: poor sleep night before, felt sluggish, joint discomfort, etc.)

This data feeds into weekly check-ins and progress tracking.

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-09-04 | v7.1 — Calentamientos auditados + pliometria fuera del registro de carga (v11.48) | Lo detecto Julian entrenando: el box jump tenia columna de peso. Pogo hops al calentamiento de Lower A (es preparacion: baja amplitud, sin progresion, y su proposito declarado era preparar el tendon para el salto). Box jump se queda como ejercicio (ATH-002: potencia fresca, intencion maxima) pero su columna mide la ALTURA del cajon en cm, excluida del tonelaje y del 1RM estimado — sin eso 50 cm x 5 x 3 metian 750 kg de tonelaje inventado. Los saltos dejan de contar como volumen de cuadriceps: la app marco 12 series el 3-sep cuando eran 7 (+71%). Retiradas las 6 lineas fijas de porcentajes de los calentamientos, que duplicaban y contradecian la rampa que la app ya calcula sola (fija 50/70/85 vs automatica 40/60/80 con kg y discos); la de Lower B pedia 85% x 1, un single pesado calentando con dos contracturas lumbares detras. Cuatro huecos tapados: prep de overhead en Upper B y Full B (el OHP entraba en frio, el hueco mas grave), dead bug en Lower B, tobillo en Lower A, rotacion externa en Upper A. |
| 2026-09-03 | v7.0 — Reorientacion a perdida de grasa y cintura (W36-37) | Objetivo reformulado por Julian: bajar de peso para reducir cintura. La perdida de grasa pasa a cualidad dominante y la fuerza a mantenimiento; sin anadir volumen. Deficit ~500 kcal pilotado por la media movil de 7 dias de la balanza nueva (regla de ajuste en nutrition-notes.md), proteina 185 g, suelo de 8.000 pasos y cintura semanal. Upper B recortada de 7 a 5 ejercicios con el core al principio (sus 3 ultimos salian done=false en las TRES sesiones de agosto; el 26-ago el bloque final duro 17 segundos). Lower A y Upper A NO se recortan: recorte propuesto, aprobado y RETIRADO tras la sesion del 3-sep (74 min, 8 de 8 ejercicios, cero saltos) — el problema era el tiempo disponible, no el plan. La bisagra vuelve con TRAP BAR y no sumo (LOAD-003, 126 dias sin peso muerto del suelo, dos contracturas lumbares), el lunes 7 y no el sabado, por los 105x4 de sentadilla y 85x10 de RDL del 3-sep. Todas las cargas re-ancladas al ultimo dato registrado: el plan pedia hack squat 80 cuando el dato real era 50 (+60%), y pedia por debajo de lo real en pec deck, lat pulldown, incline DB, leg curl y dominadas. Banca se MANTIENE en 95: su RPE 7,9 era frecuencia (5 sesiones con press en 10 dias, ~19 series de pecho/sem frente a 10 prescritas), no carga. |
| 2026-06-20 | v6.0 — Top-class redesign for David Lloyd Serrano | Moved to Spain → premium club. Upgraded accessory selection to its machines while keeping the 4-day U/L structure, the 5 anchors, rep/RPE schemes, eccentric tempo, and **identical per-session volume** (22/19/20/19 — no added volume in a deficit/re-entry). Block A swaps live in the app `PLAN`: Cable Fly→Pec Deck, Leg Press→Hack Squat, Leg Curl→Seated Leg Curl, Ab Wheel→Cable Crunch, Landmine Row→Chest-Supported Row, Cable Lateral→Lateral-Raise Machine, Hip Thrust→Glute-Drive machine, Lower-B leg curl→Lying. Block B rotation documented (incl. Trap-Bar DL as lumbar-friendly Lower-B anchor rotation, GHR, Hammer chest press, Pendlay, Stiff-Leg DL) — activates W29. Also: exercise library + movement patterns extended; profile equipment inventory replaced with the DL list. See "Program v6.0" section near the top. |
| 2026-04-06 | v1.0 created | Initial assessment |
| 2026-04-06 | v2.0 rewrite | Full evidence-based review. Added research citations, detailed rationale, RPE phase targets, warm-up protocol, rest period guidelines, deload + diet break integration, weekly volume audit |
| 2026-04-13 | v3.0 — Block periodization + Week 1 data | Added Block A/B exercise rotation (accessories swap at week 6, compounds stay). Registered Week 1 baselines from Supabase data (3/4 sessions). Added Week 2 targets. Flagged: app stores weights without unit indicator (kg vs lb mixed) |
| 2026-05-01 | W15-W17 backfill + Week 18 targets | Inline backfill of weekly reviews W15/W16/W17. Sumo DL +15 lb (was flat RPE 7), Squat +5, Row +5, Bench hold, OHP focus on completing all 4 sets. Mobility 3× mandatory after W16 back contracture. Lower B / Upper B accessory reorder (priority work moves earlier in session). Block A week 5 = deload |
| 2026-06-20 | v5.0 — Re-entry block after ~6-week layoff | Last trained week was W18 (Apr 27-May 3, strong). W19 deload + W20-W25 were an unplanned layoff (~6 weeks, life/schedule, zero training, no injury, back symptom-free, weight stable). Added a 3-week re-entry ramp (W26-W28) at the top: loads ~85%→93%→100% of W18, RPE capped at 7 in W26, volume cut to 3+2 sets W26 then restored, running capped (1→2→2-3 Z2 runs), eat at maintenance W26 then resume deficit W27. Mobility 3×/wk mandatory from day 1 (the gap before both prior contractures was zero mobility). Daily weigh-ins to rebuild the trend. W29 = resume normal cut + the W23 reassessment that never happened. Not starting from zero — muscle memory returns W18 numbers in ~3 weeks; the real risk is DOMS + lumbar history, hence the conservative ramp. |
| 2026-05-02 | v4.0 — ACSM 2026 refinements (W19 + Block B) | Cross-check de plan vs. 6 ACSM PDFs (Currier 2026 RT, Garber 2011, Thomas 2016, Jakicic 2024, Burke 2021, Castellani 2006). Cambios: (1) Cable Fly añadido a Upper A → chest 7→10 sets/sem (Currier 2026 dose-response). (2) Eccentric overload 3s formal en 4 accesorios fijos: Incline DB Press, RDL, Incline Curl, Leg Curl. (3) Warm-up con reps explícitas — bug encontrado por usuario: tabla solo nombraba ejercicios sin sets/reps. Tiempo total real ~12 min, no "3-5 min". (4) Sumo DL guidance post-contractura W16: +5 lb max por semana, RPE-gated. W18 había target +15 lb a 240 lb — corregido. (5) W19 = deload + diet break + práctica liviana de Cable Fly y patterns con tempo lento. (6) Header alineado con semanas ISO (no "program weeks") para evitar desincronización con changelog. Cambios complementarios en `nutrition-notes.md`: hidratación pre-sesión 500 mL, carb periodization por día, LEA monitoring (libido/sleep/illness) en weekly review |

---

## Week 19 Targets (2026-05-04 to 2026-05-10) — DELOAD + introducir cambios ACSM

**Theme:** Deload programado (50% volumen, RPE 6) + diet break + introducir 4 cambios estructurales a peso liviano antes de Block B refinado en W20.

### Estructura del deload

| Variable | Normal | W19 deload |
|----------|--------|------------|
| Working sets por ejercicio | 3-4 | **2** |
| Load | Working weight | Mismo o -5% |
| RPE | 7-9 | **6 (4 RIR)** |
| Duración sesión | 50-60 min | **30-40 min** |
| Running | 2× Z2 4-5 km | **1× Z2 3 km, fácil** |
| Calorías | ~2,500 (déficit) | **~2,900 (mantenimiento)** |

### Sesiones W19 (loads conservadores)

| Session | Exercise | Target | RPE | Notas |
|---------|----------|--------|-----|-------|
| Upper A (Mon) | Bench Press | 195 lb × 6 × 2 sets | 6 | -5% del working |
| Upper A | Barbell Row | 140 lb × 8 × 2 | 6 | |
| Upper A | Incline DB Press *(3s ecc — práctica)* | 40 lb/DB × 10 × 2 | 6 | **Probar tempo lento, encontrar peso para W20** |
| Upper A | **Cable Fly** *(NUEVO)* | Liviano × 12 × 2 | 6 | **Ejercicio nuevo — encontrar working load. Empezar liviano (15-25 lb por mano)** |
| Upper A | Face Pull | 40 lb × 12 × 2 | 6 | |
| Upper A | Lateral Raise | 12 lb × 12 × 2 | 6 | |
| Upper A | Tricep Pushdown | (saltar — deload) | — | |
| Lower A (Tue) | Back Squat | 195 lb × 6 × 2 | 6 | -10% del working |
| Lower A | RDL *(3s ecc formal)* | 165 lb × 8 × 2 | 6 | **Practicar tempo, no buscar load** |
| Lower A | Leg Press | 180 lb × 10 × 2 | 6 | |
| Lower A | Leg Curl | 80 lb × 10 × 2 | 6 | |
| Lower A | Calf Raise | 100 lb × 12 × 2 | 6 | |
| Lower A | Ab Wheel | BW × 8 × 2 | — | |
| Upper B (Thu) | Chin-ups | BW × 5 × 2 | 6 | Sin peso adicional |
| Upper B | Overhead Press | 105 lb × 6 × 2 | 6 | -5% |
| Upper B | Cable Lateral | 5 lb × 12 × 2 | 6 | |
| Upper B | Incline Curl *(3s ecc)* | 20 lb/DB × 10 × 2 | 6 | **Practicar tempo lento** |
| Upper B | Landmine Row | 100 lb × 10 × 2 | 6 | |
| Upper B | Hanging Leg Raise | BW × 8 × 2 | — | |
| Lower B (Fri) | **Sumo Deadlift** | **200 lb × 4 × 2** | **6** | **MANTENER LOAD CONSERVADORA — post-contractura W16, deload obligatorio. NO escalar a 240 lb como decía el target W18** |
| Lower B | Hip Thrust | 165 lb × 8 × 2 | 6 | |
| Lower B | BSS | 75 lb × 6/leg × 2 | 6 | |
| Lower B | Leg Extension | 85 lb × 10 × 2 | 6 | |
| Lower B | Leg Curl *(3s ecc)* | 70 lb × 10 × 2 | 6 | **Practicar tempo lento** |
| Lower B | Pallof Press | 25 lb × 10/lado × 2 | — | |

### Cambios estructurales que se activan en W19 y siguen para siempre

1. **Hidratación pre-sesión:** 500 mL de agua dentro de las 2 h previas a cada sesión (gym o running). Thomas 2016: 5-10 mL/kg pre-exercise. Ver `nutrition-notes.md`.
2. **Carb periodization:** días Lower y long-run subir CHO a ~350 g, días rest bajar a ~250 g, días Upper mantener. Calorías totales no cambian. Ver `nutrition-notes.md`.
3. **LEA monitoring:** weekly review ahora incluye libido, sleep quality (1-5) y illness frequency. Si dos caen ≥2 puntos en 2 semanas seguidas → diet break antes de programado.
4. **Cable Fly añadido a Upper A** (3 sets) → chest sube de 7 a 10 sets/sem.
5. **Eccentric overload** (3 segundos en fase excéntrica) en 4 accesorios fijos: Incline DB Press, RDL, Incline Curl, Leg Curl.
6. **Warm-up con reps explícitas** (ver Warm-up Protocol arriba) — tiempo total real ~12 min.

**Mobility (mandatoria, sigue igual):** Wed Hip Reset (7 min) · Sat Lumbar Decompression (10 min) · Sun Hip Reset (7 min). Detalle de ejercicios en la app.

**Running (W19 — modified per user override × 2, 2026-05-04):** 3 corridas Z2 (131-143 bpm) en vez de 1 run.
- Tue 5/05 PM (después del Lower A, regla "lift first"): 3km Z2 HR
- Thu 5/07: 3km Z2 HR
- Sat 5/09: 3km Z2 HR
- Total: 9km (-38% vs W18 14.5km). HR strict 131-143, NO Z3 creep como 5/01 (HR 146).

> **Coach note:** plan v4.0 prescribió 1 run para deload completo. Override #1 (5/04): usuario pidió 3 runs — coach pushed back con wellness data (HRV ↓14%, RHR +5, readiness 56). Override #2 (5/04): coach propuso Z1 strict (recovery zone) como compromiso, usuario eligió Z2 citando "Z2 burns most fat". Coach corrigió el mito: Z2 tiene peak fat OXIDATION rate (g/min) pero total fat LOSS depende del déficit calórico de 24h, no del fuel mix durante el ejercicio. Z3 quema 30% más kcal totales y produce igual o más fat loss en 24h. La razón real para preferir Z2 es base aeróbica (mitochondrial density), no fat burning. Usuario eligió igual Z2. Si la W19 termina con readiness/HRV peor que el Mon 5/05, esto es la causa probable y la próxima deload vuelve a 1 run Z2 estricto.

**Nutrición W19 (diet break):** mantener proteína ≥170 g, subir carbs ~+100 g (a ~385 g) → ~2,900 kcal. Mantener fat 75 g.

---

## Week 20+ (Block B — refinado con cambios ACSM 2026)

A partir de W20 (semana 11-17 mayo), se vuelve a la estructura completa pero con todos los cambios activos:

- Volumen completo restaurado (3-4 sets por ejercicio, RPE 7-8/8-9 según fase)
- Cable Fly se mantiene como parte permanente de Upper A
- Eccentric overload se mantiene en los 4 accesorios marcados
- Sumo DL: progresar +5 lb solo si el primer working set sale ≤ RPE 7.5 y no hay molestia lumbar
- Squat y Bench: doble progresión normal
- Block B exercise rotation (accesorios) según tabla "Block A vs Block B" — pero los cambios ACSM (Cable Fly, eccentric tempo, hidratación, periodización CHO) se mantienen en cualquier bloque

**Reassessment formal en W23 (semana 8 desde inicio del Block B):** medir progreso (peso, fotos, working weights), revisar si EA marginal está afectando recovery, decidir si ir a W24 deload + transición a Phase 2 (recomp/maintenance).

---

## Week 36-37 Targets (2026-08-31 a 2026-09-13) — REORIENTACIÓN A PÉRDIDA DE GRASA Y CINTURA

> Escrito el **2026-09-03** con la W36 en curso. Sustituye la prescripción W35 de `latest.json`, que
> nunca se ejecutó y que además tenía **las cargas de accesorios desancladas** (ver abajo).

### El objetivo cambia de forma

Julian lo formuló el 3-sep: **bajar de peso para reducir cintura** (*"me queda todo chico de
cintura"*). `goals.md` ya pedía 79-81 kg, pero como número de báscula; ahora hay un criterio físico
detrás. Y compró una balanza → habrá peso diario por primera vez desde el 27-may (98 días de hueco).

**Consecuencia de programación:** la pérdida de grasa pasa a ser la cualidad dominante y **la fuerza
va a mantenimiento** — que en déficit ES progreso (`CLAUDE.md`). No se añade volumen. El cardio Z2
entra como herramienta de gasto de baja interferencia, no como cualidad en progresión agresiva.

**Lo que hay que decir claro:** el entrenamiento no crea el déficit, **protege el músculo**. La
cintura baja por el déficit calórico y los pasos. El gimnasio decide si se llega a 81 kg atlético o
blando.

**Dato a favor:** la Tanita del 11-ago sitúa **8,3 de los 14,3 kg de grasa en el torso (58%)**, con
grasa visceral en 5. Es grasa subcutánea abdominal: no se reduce por zonas, pero como más de la
mitad está ahí, la pérdida total se manifestará de forma desproporcionada en la cintura.

### Estado de partida (3-sep)

| | |
|---|---|
| Readiness (media 4 d) | **88,8** |
| HRV | 70,5 ms |
| Frecuencia en reposo | 44,3 bpm — **mínimo histórico de 42 el 1-sep** |
| Sueño | 7,68 h |
| CTL / ATL | 4,9 / 4,9 · ramp negativo |

**No hay fatiga: hay desentrenamiento. No procede deload.**

### Estructura de la semana

| Día | Sesión |
|---|---|
| Jue 3 | ✅ Lower A — hecho (74:21, **8 de 8 ejercicios**) |
| Vie 4 | Upper A |
| Sáb 5 | Cardio Z2 35-40 min · **HR < 143** |
| Dom 6 | Movilidad + caminata + **1ª medición de cintura** |
| Lun 7 | **Lower B — vuelve el peso muerto (trap bar)** |
| Mar 8 | Upper B (recortada a 5) |
| Mié 9 | Cardio Z2 |
| Jue 10 | Lower A |
| Vie 11 | Upper A |
| Sáb 12 | Cardio Z2 largo |
| Dom 13 | Movilidad + cintura |

**Por qué el peso muerto va el lunes y no el sábado:** el 3-sep se cargó sentadilla 105 × 4 y RDL
85 × 10. Meter la primera bisagra desde el suelo en **126 días** a 48 h de eso, con dos contracturas
lumbares en el historial, no compensa. El lunes son 4 días de margen y no cuesta nada — el RDL del
jueves ya dio dosis a la cadena posterior.

### Cargas — todas ancladas al último dato real registrado

| Ejercicio | W36-37 | Último dato | Regla |
|---|---|---|---|
| Back Squat | **105 × 6** | 105 × 5 @7,0 (3-sep) | RPE ≤7, reps en el suelo del rango → +1 repe, misma carga |
| Trap Bar DL | serie 1 **100 × 5**; ≤RPE 6 → 110-120 | sumo 111 × 6 @7,0 (2-may) | Gate de RPE; máx +2,5 kg/sem |
| RDL | **85 × 8-10, 3 series** | 85 × 10 @7,0 × 2 (3-sep) | Completar la 3ª antes de ir a 87,5 |
| Hack Squat | **50 × 12** | 50 × 10 @7,0 (3-sep) | Reps primero |
| Seated Leg Curl | **65** | 60 × 12 @7,0 (3-sep) | +5, reps arriba del rango |
| Seated Calf Raise | **50** | 45 × 15 @7,0 (3-sep) | +5 |
| Bench Press | **95 — MANTENER** | 95 × 7 @8,0 bajando a 90 (24-ago) | RPE 7,5-8,5 → mantener |
| Barbell Row | **62,5** | 60 × 10 @6,5 (24-ago) | RPE ≤7 con reps arriba → +2,5 |
| OHP | **55** | 50 × 8 @7,0 (26-ago) | Recuperar los 55 del 14-ago, NO 57,5 |
| Chin-ups | **BW +7,5** | BW +5 × 8 @7,0 (26-ago) | +2,5 |
| Incline DB Press | **32/mano** | 30 × 12 @7,0 (24-ago) | Siguiente par |
| Lat Pulldown | **70 × 12** | 70 × 10 @7,0 (24-ago) | Reps primero |
| Pec Deck | **90** | 90 × 10 @7,0 (26-ago) | Mantener |
| Cable Row | **73** | 73 × 12 @7,0 (26-ago) | Mantener |
| Glute Drive | **empezar en 60, ajustar a RPE 7** | **sin dato** | No inventar el 80 del plan viejo |

### Cambios estructurales

**1. Upper B: 7 → 5 ejercicios, con el core al principio.**
`incline-curl`, `lateral-raise-machine` y `hanging-leg-raise` salen `done=false` en **las tres**
sesiones de agosto (14, 22, 26): cero de nueve series cada uno. El 26-ago los `blockTimings`
registran el bloque "Superset A" en **17 segundos** — cerró la app. Los dos primeros se retiran
(bíceps y deltoide lateral ya se cubren en Upper A); el core se queda pero sube al principio.

**2. Lower A y Upper A NO se recortan** — recorte propuesto, aprobado y luego **retirado**. La sesión
del 3-sep (74 min, 8 de 8, cero saltos) demuestra que el problema era el tiempo disponible, no el
plan. El sistema ya tiene *quick-mode* para los días cortos.

**3. La bisagra vuelve con trap bar, no sumo.** Torso más vertical y menos momento lumbar a carga
igual; es la variante que `LOAD-003` nombra como lumbar-friendly y el club la tiene. `trap-bar-dl` ya
está en la librería y en el grupo `Posterior`, así que se selecciona desde el swap de la sesión.
Vuelta a sumo en W39, retomando desde ~95.

### Volumen semanal real con el recorte (series de resistencia, variante 6)

| Grupo | Series/sem | De dónde | Banda |
|---|---|---|---|
| Pecho | **10** | Banca 4 + Incline DB 3 + Pec Deck 3 | 10-14 ✅ |
| Espalda | **14** | Remo 4 + Lat Pulldown 3 + Dominadas 4 + Remo apoyado 3 | 10-14 ✅ |
| Cuádriceps | **13** | Sentadilla 4 + Hack 3 + BSS 3 + Leg Ext 3 | 10-14 ✅ |
| Isquios | **9** | RDL 3 + Seated Curl 3 + Lying Curl 3 | 8-12 ✅ |
| Bisagra / posterior | **7** | Trap Bar 4 + RDL 3 | — |
| Hombro (lateral/posterior) | **6** + 4 de OHP | Face Pull 3 + Lateral 3 | 8-12 ✅ |
| Core | **9** | Ab Wheel 3 + Pallof 3 + Leg Raise 3 | 6-9 ✅ |
| Gemelo | 3 | Seated Calf 3 | 4-8 ⚠️ bajo, aceptable en déficit |
| Tríceps | 2 directas + ~11 indirectas | Pushdown 2 + banca/OHP/incline | 6-10 ✅ |
| **Bíceps** | **0 directas** + ~14 indirectas | Dominadas 4 + Pulldown 3 + remos 7 | 6-10 ⚠️ ver abajo |

**Total: 77 series** en 4 sesiones frente a 83 antes del recorte. **Las 6 series que desaparecen son
exactamente las que no se estaban haciendo.** Ningún grupo sale de su banda.

> ### Pliometría (revisado el 2026-09-04) — separada de la carga y del volumen de pierna
>
> Julian, entrenando: *"no hace mucho sentido tener Box Jump con peso y repeticiones cuando es un
> warm up"*. Tenía razón: los dos llevaban la flag `bw`, que significa "peso corporal **más lastre
> opcional**" — correcta en dominadas, sin sentido en un salto. El 3-sep quedó registrado como
> `0x5@6`, donde el 0 es ruido.
>
> **Los pogo hops pasan al calentamiento de Lower A.** Su propósito declarado siempre fue *"prepara
> el tendón para el salto al cajón"*: es preparación, baja amplitud, sin variable de progresión.
>
> **El box jump se queda como ejercicio registrado**, porque **ATH-002** pide la potencia *fresca,
> con poco volumen e intención máxima* — eso es trabajo, no calentamiento. Pero su columna de carga
> pasa a medir la **altura del cajón en cm**, que es su variable de progresión real, y queda excluida
> del tonelaje y del 1RM estimado (50 cm × 5 × 3 habrían inyectado **750 kg de tonelaje inventado**).
>
> **Y los saltos dejan de contar como volumen de cuádriceps.** `renderMuscleVolume` agregaba por el
> campo `muscle`, donde pogos y saltos estaban como `Quads`: **el 3-sep la app marcó 12 series de
> cuádriceps cuando eran 7** (4 sentadilla + 3 hack + 2 pogos + 3 saltos), un **+71%**. Ahora se
> agregan en su propia fila `Power`. La tabla de arriba ya excluía los saltos a mano; desde v11.48 lo
> hace también la app.
>
> **Coste asumido:** los 40 contactos de los pogos dejan de estar en el log, así que la dosis
> registrada baja de 55 a 15 frente al rango 40-80 de **ATH-001**. Se acepta porque nada audita
> contactos hoy y la línea del calentamiento deja la dosis escrita. Si se construye el auditor,
> tendrá que leer también el calentamiento.

> ⚠️ **El bíceps se queda sin trabajo directo.** Al salir `incline-curl` de Upper B, y como **Upper A
> no tiene curl**, el bíceps pasa a depender del indirecto: 4 series de dominadas lastradas (BW+7,5),
> 3 de lat pulldown y 7 de remo. En un bloque de déficit con la fuerza en mantenimiento es
> defendible —las dominadas lastradas son un estímulo de bíceps serio— pero es una **pérdida real,
> no una redistribución**. Si se quiere recuperar, el curl vuelve desde el swap de la sesión sin
> tocar código. Se revisa en W39.

> ⚠️ La tabla **"Weekly Volume Summary"** de más arriba en este documento está **caducada desde
> v6.0** (junio): habla de Cable Fly, Landmine Row, Leg Press y Cable Lateral, que el rediseño para
> David Lloyd ya sustituyó. La tabla de esta sección es la vigente.

### Calentamientos — auditoría de los 9 (2026-09-04)

Preguntó Julian: *"¿el warm up está correcto para cada uno de los días?"*. Auditados los nueve.

**Lo que estaba mal en todos:** cada sesión traía una línea fija de aproximación
(`'Squat: bar × 10, 50% × 6, 70% × 4, 85% × 2'`) mientras la app **ya calcula la rampa sola** en
**bar → 40% → 60% → 80%**, con kg reales y desglose de discos, leyendo la serie top de la última vez
que se hizo esa sesión. Se veían las dos a la vez y decían cosas distintas. Se retiran las 6 líneas
fijas y queda una nota sin tabla, que además cubre el caso en que la automática **no** aparece:
`fullA` y `fullB` nunca se han registrado, así que no tienen historial del que calcularla.

**Y una retirada por seguridad:** la línea de Lower B pedía **`85% × 1`**. Un single pesado
calentando, con dos contracturas lumbares en el historial y el peso muerto volviendo tras 126 días,
es la prescripción equivocada. La automática topa en 80% × 2.

| Sesión | Hueco encontrado | Añadido |
|---|---|---|
| **Upper B** y **Full B** | ⚠️ **El más grave.** El OHP es lift principal a 4 × 5-8 @RPE 7-8 y **no había nada de posición overhead** — el movimiento con más demanda de movilidad de la sesión entraba en frío | Wall slides 2 × 10 + dislocates con banda 2 × 10 (fuera los arm circles, redundantes) |
| **Lower B** | Había cat-cow, que es movilidad, pero **cero anti-extensión ni bracing** antes de la bisagra pesada | Dead bug 2 × 8/lado + swings laterales (era el único día de pierna sin ellos) |
| **Lower A** | Nada de dorsiflexión antes de sentadilla profunda | Tobillo contra la pared 2 × 10/lado |
| **Upper A** | Los pull-aparts cubren retracción escapular, no rotación del manguito, y detrás vienen 4 series de banca a RPE 7-8 | Rotación externa con banda 2 × 12/lado |
| Híbrido · Viaje A · Viaje B | ✅ **Sin cambios.** Su preparación ya es específica del patrón (trineo vacío 2 × 20 m, SkiErg suave) | — |

**Se mantiene el primer de dominadas de Upper B**: la rampa automática las salta, porque su carga es
lastre y cae por debajo del umbral de la barra. Sin esa línea no tendrían aproximación ninguna.

### Lo que explica el estancamiento de los press

Del 17 al 26-ago hubo press en **5 sesiones**: banca el 17, 20 y 24, press de máquina el 22, pec deck
el 26. **~19 series de pecho/semana frente a las 10 que prescribe el plan.** La banca del 24-ago
(95 × 7 @8,0, bajando a 90 a mitad) y el OHP retrocediendo de 55 a 50 no son cargas mal elegidas:
**es frecuencia**. Con la semana rebalanceada a pierna, el problema se resuelve solo.

### Errores de la prescripción W35, para el registro

`latest.json` tenía los accesorios sistemáticamente desanclados del dato real: **Hack Squat 80 cuando
el dato era 50 (+60%)**, Pec Deck 50 cuando hace 90, Lat Pulldown 60 cuando hace 70, Incline DB 24
cuando hace 30, Seated Leg Curl 45 cuando hace 60, dominadas BW+2,5 cuando ya va con +5.

**Datos que NO se deben usar para progresar:** la sesión del **20-ago** tiene incline DB a 10 kg (hace
30) y face pull a 60 (hace 27,5) — valores cruzados o mal introducidos. Los decimales raros
(21,25 · 28,75 · 43,1) son conversiones lb→kg heredadas de la etapa pre-España nunca re-ancladas a
las máquinas del club.
