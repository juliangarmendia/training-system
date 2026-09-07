# Running Plan — Cut Phase 1

> ## 📍 DÓNDE ESTÁ EL PLAN VIVO DE CARRERA (2026-09-07)
>
> **La carrera también es dato.** Sale de la fila de **`plans`** con la `version` más alta:
>
> | Qué | Dónde sale |
> |---|---|
> | La semana de carrera | `plans` → `running` cuando el coach la fijó; si no, **`suggestRunningWeek`** (`app/coach-engine.js`, v11.60) como fallback — coach > regla > base |
> | La duración del cardio del día | `progressCardioMin` (v11.56): los minutos suben dentro del bloque (END-003) sobre la base de `IDEAL_BLOCK_V1`. La intensidad **nunca** progresa (END-002) |
> | El techo de Z2 | `settings.icuZones` → **143 bpm** hoy (`icuZones.z.zone2`). No 140: ese número era de tres sitios que no coincidían |
> | Bloque y descarga | anclado al **lunes 2026-09-07**; **primer deload: semana del 2026-10-05** (el volumen de carrera baja ~30 %) |
> | Lo que llega al reloj | el DSL lo genera `_generateCardioDsl` desde el plan y se empuja a intervals.icu → COROS. Ya **no** lo escribe ningún cron |
>
> **El dato de partida manda**: las cuatro últimas carreras (1,9 / 3,2 / 5,0 / 4,1 km) fueron a 152,
> 149, 155 y 147 bpm de media sobre una Z2 que acaba en 143 — **cero carreras en Z2**. El problema no
> es el volumen, es la intensidad. Por eso el arco arranca en **run/walk por tiempo**, no en
> kilómetros.
>
> ### Arco B1-B4 — del run/walk al 10k cómodo (§C.1 del plan de Coach v2)
>
> | Bloque | Semanas | Dominante | Miércoles | Sábado (largo) | km/sem | Duras |
> |---|---|---|---|---|---|---|
> | **B1** Reentrada y base | W37-41 | Déficit + hábito. Correr: **cumplir Z2**, no volumen | 30-40' run/walk por FC (END-006) | 35' → 50' run/walk | ~11 → 15,5 (por tiempo) · deload ~7 | **0** |
> | **B2** Base aeróbica | W42-46 | Déficit + volumen de carrera | 5-5,5 km Z2 | 6 → 7,5 km | 16 → 18 · deload 9 | **0** |
> | **B3** Largo hacia 10 km | W47-51 | Déficit + largo | 5-6 km | 8 → **10 km (test W50)** | 19 → 20,5 · deload 9 | **0** |
> | **B4** Consolidación | W52-W03 | Cierre del déficit o mantenimiento; 10k consolidado | 5-6 km | 10 km Z2, o ≤1 dura con criterios | 20-24 | **≤1/sem** (END-004), sábado |
>
> **Rampa:** +5'/semana en el largo (B1) → +0,5 km/semana (~7-8 %) en B2-B3. El **10 %/semana de
> END-003 es tope prudente, no un hallazgo validado** (Buist 2008, n=532, no encontró diferencia entre
> 10,5 % y 23,7 %). **Cuando el déficit y la carrera chocan, cede la carrera** (decisión de Julian,
> 6-sep): primero se congela el ramp de km, luego sale el híbrido, luego −1 serie en accesorios, y sólo
> al final se afloja el déficit.
>
> **"10k cómodo"** = 10 km continuos, FC media ≤143, deriva de la 2ª mitad <5 bpm, RPE ≤5, sin dolor,
> RHR al día siguiente ≤ +3. Primer intento **W50** si la adherencia va ≥80 % y no hay semanas rojas;
> **lo probable es W02-W04 de 2027**, ya a mantenimiento — llega a la vez que los 79-81 kg.
>
> Detalle del motor y sus cuatro honestidades:
> [`../docs/architecture/ideal-plan-engine-v1.md`](../docs/architecture/ideal-plan-engine-v1.md)
> (sección v11.60).

> ## 🛑 OBSOLETO — su tesis central ya no es la del sistema (2026-08-16)
>
> Es el documento más desfasado del repo. Se conserva por su valor de razonamiento, pero **no
> describe el plan actual y varias de sus afirmaciones contradicen directamente al sistema vigente**:
>
> | Afirma | Realidad |
> |---|---|
> | *"Why Not HIIT During a Cut"*, *"Zone 3 NOT during this plan"* | `CARDIO_LIBRARY` ofrece Z3/Z4/Z5 y **END-008** (`strong`, Milanović 2015) dice que HIIT y MICT suben ambos el VO₂max: se elige por coste de fatiga, no por dogma |
> | *"Running: secondary modality... gym wins"* | `CLAUDE.md`: cardio y carrera son **cualidades co-iguales** |
> | Zona 2 = 120-140 bpm, techo MAF 142 | Las zonas se traen de intervals.icu (`fetchIntervalsIcuZones`) y son las del atleta, no una fórmula |
> | Estructura semanas 1-9, 1→3 carreras | El IDEAL prescribe Z2 casi diario + 1 sesión más larga el sábado |
> | Peso 88,6 kg, ritmo 7:40/km | De abril de 2026 |
>
> **Lo que sí sigue valiendo:** el razonamiento sobre interferencia (Wilson 2012), las reglas de
> colocación respecto a los días de pierna, la sección de **NEAT/pasos** (ahora formalizada como
> **REC-009**) y las banderas rojas para recortar carrera.
>
> **Falta y no está aquí:** el efecto del **calor** — reglas nuevas `ENV-001/002`. En verano en
> Madrid, mantener la FC significa correr más lento, y el ritmo a FC fija no es leíble como
> progreso. → [`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md)

> Version: 2.0
> Created: 2026-04-06
> Estado revisado: 2026-08-16 (auditoría del sistema — ver aviso de arriba)

---

## Role

Secondary modality. Running serves three purposes during this cut:

1. **Energy expenditure** — adds ~200-350 kcal per session without significant recovery cost
2. **Cardiovascular health** — zone 2 builds aerobic base, improves fat oxidation capacity, supports recovery between lifting sessions
3. **Habit formation** — establishing a sustainable running practice that continues after the cut

Running must NOT compromise gym performance. If there's ever a conflict, gym wins.

---

## Current Baseline

| Metric | Value | Date |
|--------|-------|------|
| Easy pace | 7:40 min/km | 2026-04 |
| Avg HR at easy pace | 129 bpm | 2026-04 |
| Typical distance | 5 km | — |
| Frequency | ~1x/week | — |
| Zone | 2 (conversational) | — |
| Experience | Beginner-recreational | — |
| Body weight | 88.6 kg | 2026-04-02 |

**Assessment:** 7:40/km at 129 bpm is a reasonable zone 2 effort at this body weight. The pace will improve naturally as (a) aerobic base develops and (b) body weight decreases. Do not chase pace — it is an output, not an input.

---

## The Science Behind This Plan

### Why Zone 2 (Almost) Exclusively

**Fat oxidation:** Zone 2 maximizes the *percentage* of calories from fat oxidation (~60-70% from fat vs ~40-50% at higher intensities). This isn't because zone 2 burns more total fat than HIIT — it doesn't per unit time. The reason zone 2 is chosen is that it provides aerobic adaptation at minimal recovery cost. During a deficit where you're also lifting 4x/week, recovery cost is the binding constraint, not calorie burn.

**Mitochondrial density:** Zone 2 preferentially develops Type I fiber mitochondrial density (San-Millan & Brooks, 2018). This improves your body's capacity to oxidize fat at all intensities over time — an adaptation that takes 8-12+ weeks of consistent training.

**Seiler's polarized model:** Elite endurance athletes spend ~80% of training at low intensity. For a recreational runner doing 2-3 runs/week alongside lifting, this simplifies to: just run easy. The volume is too low for meaningful "zone 3" (tempo) work to matter, and the recovery cost of tempo/threshold work is too high during a deficit.

**Recovery compatibility:** Zone 2 running activates the parasympathetic nervous system, actually *aiding* recovery between lifting sessions. Higher intensity running (zone 3-5) does the opposite — it adds sympathetic stress and competes for recovery resources.

### Why Not HIIT During a Cut

Meta-analyses (Keating et al., 2017; Wewege et al., 2017) show **no significant difference in fat loss** between HIIT and moderate-intensity cardio when calorie expenditure is matched. HIIT generates more EPOC, but the additional calorie burn is only ~50-80 kcal — negligible. Meanwhile, HIIT adds substantial neuromuscular fatigue and CNS stress on top of 4 lifting sessions/week. The cost-benefit ratio is poor during a cut.

**Exception:** After week 6, one optional short HIIT session (4-6 × 30 sec strides with full recovery) can maintain anaerobic capacity if recovery supports it. This replaces a zone 2 run, not adds to it.

### Concurrent Training Interference

**Wilson et al. (2012) meta-analysis:** Running produces more interference than cycling due to eccentric muscle damage per stride. However, at 10-15 km/week of easy running, interference with hypertrophy is negligible and interference with strength is small.

**2024 concurrent training review (Medicine journal):** Interference is minimized when: sessions are separated by ≥6 hours, cardio volume is moderate, lifting is prioritized, and protein intake is adequate.

**Practical implication:** Don't run the day before heavy lower body. Don't run immediately after lower body. Upper body days or rest days are ideal for running.

### Body Weight and Running

At 88.6 kg, each stride generates significant ground reaction forces (~2.5-3x body weight = ~220-265 kg per foot strike). This increases injury risk compared to lighter runners. Mitigations:
- Keep pace easy (reduces impact force)
- Run on softer surfaces when available (track, grass, treadmill)
- Proper shoes (get fitted at a running store if you haven't)
- Volume caps — no need to run 30+ km/week at this weight

---

## Weekly Structure

### Weeks 1-3: Adaptation Phase

| Day | Session | Distance | Duration | Intensity | Notes |
|-----|---------|----------|----------|-----------|-------|
| Wed | Easy run | 4-5 km | 30-40 min | Zone 2 (HR < 140) | Only run of the week. Build the habit |
| Sat | Optional walk | 30-45 min | — | Easy | If legs are fresh. Not mandatory |

**Total: 4-5 km/week**

Why only 1 run: You're simultaneously starting a new lifting program AND a caloric deficit. Adding training stress from both modalities at once is how people burn out in week 3. One run per week establishes the habit with zero recovery risk.

### Weeks 4-6: Build Phase

| Day | Session | Distance | Duration | Intensity | Notes |
|-----|---------|----------|----------|-----------|-------|
| Wed | Easy run | 5 km | 38-42 min | Zone 2 (HR < 140) | Primary run |
| Sat | Easy run | 3-4 km | 25-32 min | Zone 2 (HR < 140) | Second run. Shorter. Ease into it |

**Total: 8-9 km/week**

### Weeks 7-9: Maintained Volume

| Day | Session | Distance | Duration | Intensity | Notes |
|-----|---------|----------|----------|-----------|-------|
| Wed | Easy run | 5 km | 38-42 min | Zone 2 (HR < 140) | Primary run |
| Sat | Easy run | 5 km | 38-42 min | Zone 2 (HR < 140) | Matched distance |
| **Sun** | **Optional 3rd run** | **3-4 km** | **25-30 min** | **Zone 2** | **Only if: (a) gym performance is not declining, (b) no persistent leg soreness, (c) you genuinely want to** |

**Total: 10-14 km/week**

### Deload Weeks (5 and 9)

| Day | Session | Distance | Duration | Intensity |
|-----|---------|----------|----------|-----------|
| Sat | Easy run | 3 km | 25 min | Zone 2 |

**Total: 3 km/week.** One short, easy run. This is a recovery week — let the body adapt.

---

## Heart Rate Guidelines

| Zone | HR Range (estimated) | Feel | When to Use |
|------|---------------------|------|-------------|
| Zone 1 | < 120 bpm | Very easy, could hold a phone conversation | Recovery walks |
| **Zone 2** | **120-140 bpm** | **Conversational. Can speak full sentences.** | **All runs during this plan** |
| Zone 3 | 140-155 bpm | Uncomfortable to talk. Breathing heavy | NOT during this plan |
| Zone 4-5 | > 155 bpm | Can't talk. All-out effort | NOT during this plan |

**Your MAF ceiling (Maffetone formula):** 180 - 33 (age) - 5 (returning to consistent training) = **142 bpm**. Stay under this.

**The talk test:** If you can't hold a conversation, slow down. If you need to walk to keep HR below 140, walk. There is zero shame in walk-run intervals during base building. You're building an aerobic engine, not racing.

**Important:** A 2025 study (Meixner et al.) found HR-based zones have 6-29% individual variation in actual metabolic response. Your exact zone 2 ceiling might be 135 or 145, not exactly 140. The talk test is the most reliable practical indicator.

---

## Pace Expectations

**Do not target a specific pace.** Pace is an *outcome* of fitness and conditions, not an input.

However, for context:

| Timeframe | Expected Easy Pace | Why |
|-----------|-------------------|-----|
| Now (88.6 kg, beginner base) | 7:30-8:00 min/km | Current aerobic fitness + body weight |
| After 8-12 weeks (83-85 kg, developed base) | 6:45-7:15 min/km | Weight loss + aerobic adaptation |
| After 6+ months | 6:00-6:30 min/km | Continued development |

These are estimates. If your pace improves faster or slower, it doesn't matter — HR and perceived effort are the guides, not pace.

---

## Scheduling Rules

1. **Never run the day before Lower A (squat day)** — quads need to be fresh for heavy squats
2. **Never run the day before Lower B (hinge day)** — hamstrings and glutes need to be fresh
3. **Best days for running:** the day after upper body sessions, or rest days
4. **If same day as upper body:** run ≥6 hours after lifting, or in the morning before an evening lift
5. **If legs are notably sore from gym work:** walk 30 min instead, or skip entirely. No guilt
6. **If you missed a gym session this week:** do the gym session on the run day instead. Gym > running during a cut

---

## Progression Rules

1. **Weeks 1-3:** No volume increases. One run per week. Adapt to the new program + deficit
2. **Week 4:** Add second run (3-4 km). Only if gym performance is maintained
3. **Week 7+:** Optional third run. Only if:
   - Gym strength is not declining
   - No persistent soreness or fatigue beyond 24h
   - Sleep quality is maintained
   - You want to
4. **Volume increases:** Max +1 km per run per week. Never increase total weekly volume by more than 10-15%
5. **Volume cap during the cut:** 15 km/week. Beyond this, the recovery cost exceeds the benefit at your current training load
6. **If gym performance drops for 2+ sessions:** reduce running volume first (drop the optional 3rd run, then shorten runs), before changing anything in the gym program

---

## What to Log Every Run

1. **Date**
2. **Distance** (km)
3. **Duration** (min:sec)
4. **Average pace** (min/km) — auto-calculated from distance and time
5. **Average HR** (if wearing a monitor)
6. **How it felt** (1-5 scale)
   - 1 = Terrible, legs dead, wanted to stop
   - 2 = Hard, had to walk sections
   - 3 = Fine, normal effort
   - 4 = Good, felt smooth
   - 5 = Effortless, could have gone much longer
7. **Notes** (weather, surface, anything unusual)

---

## NEAT: The Hidden Running Plan

Beyond structured runs, daily walking is the highest-ROI activity for energy expenditure during a cut.

| Parameter | Target | Why |
|-----------|--------|-----|
| Daily steps | 8,000-10,000 | Walking burns ~60-80 kcal/km at your weight. 10,000 steps ≈ 7-8 km ≈ 420-560 kcal/day. That's 2,940-3,920 kcal/week — far more than your structured running contributes |
| Steps from running | Count toward daily total | A 5 km run ≈ 5,500-6,000 steps |
| How to get steps | Walk after meals, take calls walking, park far, stairs | Low-effort habits, not heroic efforts |

**Evidence (Levine, 2002):** NEAT can vary by 2,000 kcal/day between individuals. During a deficit, NEAT spontaneously decreases (you fidget less, move less, sit more). A step count target counteracts this adaptive thermogenesis.

**The step target is arguably more important for fat loss than the structured running.** Running builds your cardiovascular system. Walking burns the calories.

---

## Red Flags — When to Reduce Running

- Gym performance declining for 2+ sessions (especially squat/deadlift)
- Persistent knee, shin, or Achilles pain (not soreness — pain)
- Resting HR elevated >5 bpm above normal for 3+ days
- Persistent fatigue or poor sleep for >1 week
- Running feels significantly harder at the same pace/HR (cardiac drift beyond normal)

If any of these appear: drop the optional 3rd run first. If still present, shorten remaining runs. If still present after 2 weeks, stop running entirely and reassess.

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-04-06 | v1.0 created | Initial assessment |
| 2026-04-06 | v2.0 rewrite | Full evidence-based review. Added science rationale, HR guidelines, MAF calculation, pace expectations, NEAT section, phased progression, 3rd optional run per user request, interference evidence |
