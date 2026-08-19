# Weekly Check-ins

> Newest first. Append at the top.

## What to report each week

1. **Weight:** morning, fasted, post-bathroom. Average of 3+ days preferred
2. **Training:** PRs, misses, struggles
3. **Energy/recovery:** 1-10 plus context
4. **Adherence:** what was followed, what was skipped or changed
5. **Running:** how did it feel, any issues
6. **Other:** mood, motivation, life stuff

---

### Backfill W19-W33 — analizado el 2026-08-19

**Peso:** sin serie. Dos registros en 15 semanas (W19, W22). La referencia valida es la Tanita del
11-ago: **87,1 kg, 16,4% de grasa, 72,8 kg de masa magra**.

**Entrenamiento:** 10 sesiones de gimnasio en 15 semanas (0,67/semana contra 4 planificadas). Y aun
asi **la fuerza subio**: banca 80 -> 90 kg, sentadilla 90 -> 100, OHP 50 -> 55, con el RPE clavado
entre 7,0 y 7,4. **El peso muerto no se ha tocado desde el 3 de mayo**: cero sesiones de lowerB en 15
semanas, y con el toda la cadena posterior.

**Recuperacion:** mejoro en todo (readiness 62,8 -> 77,3; sueno 6,89 -> 7,29 h; frecuencia en reposo
49,5 -> 47,2) porque la carga fue casi nula. **W29 fue la peor semana** (readiness 48,3, sueno 6,04 h)
y es exactamente la semana en que el remo retrocedio de 60 a 50 kg. **W30 fue la mejor** — con cero
entrenamientos.

**Adherencia:** movilidad **0/15 semanas**, con dos contracturas lumbares en el historial. Nutricion: 1
registro. Cinco semanas completamente vacias.

**Carreras:** 6 reales. Cumplimiento de Z2 3 de 6, y **las tres ultimas por encima del techo** (HR
147-149 contra 143). Senal buena: 19 s/km mas rapido a la misma frecuencia cardiaca que en mayo.

**Causa de los huecos, confirmada por Julian: viajes.** Ninguna variante del plan funcionaba sin
gimnasio hasta v11.42.

**Notas del coach:** el margen de progresion que venia de antes del paron esta casi agotado — con
0,67 sesiones/semana no se sostiene. Prioridad de W35, en orden: (1) **el peso muerto vuelve, a 90 kg
con gate de RPE**, no a 110; (2) subir donde el RPE lo pide (sentadilla 102,5, OHP 57,5, dominadas
+2,5, remo de vuelta a 60); (3) banca mantiene 90; (4) **carreras en Z2 de verdad, HR <143**. Y lo
que no es entrenamiento pero decide mas: pesarse a diario y mirar la vitamina D (11,2 ng/mL en 2023,
nunca re-controlada).

---

### ⚠️ HUECO W19–W32 (2026-05-04 → 2026-08-09) — sin registro

Documentado el **2026-08-16** durante la auditoría del sistema. **14 semanas completas sin revisión.**
Esto no es un olvido de redacción: es que no hay datos con los que escribirla.

**Qué se sabe con certeza** (consulta directa a Supabase `ycfodifvpvosukepcxie`, 2026-08-16):

| Tabla | Filas | Último registro |
|---|---|---|
| `workouts` | 15 | **2026-06-25** |
| `runs` | 8 | 2026-05-24 |
| `wellness` | 61 | 2026-06-30 |
| `steps` | 58 | 2026-06-29 |
| `bodyweight` | 15 | 2026-05-27 |
| `nutrition` | 11 | 2026-05-28 |
| `sessions` | **0** | — |

`wellness` y `steps` se rellenan solos en cada sync, así que su última fecha marca **el último sync
correcto: ~2026-06-30** — justo cuando el plan IDEAL pasó a ser el default (v11.28).

**✅ RESUELTO el mismo día.** Julian confirmó que ha entrenado con normalidad (dos sesiones esa
semana y una carrera el 16-ago), lo que descartó la hipótesis de "no entrenó" y apuntó a un fallo
de sync. Y lo era:

La cola de salida estaba **congelada desde el 2026-06-30** por un mensaje envenenado.
`drainSyncQueue()` hacía `break` ante el primer fallo, y el elemento que fallaba era un upsert al
store `plans`, cuya **tabla nunca se creó en Supabase**. `applyIdealPlan()` lo encoló el día que
salió v11.28 (2026-06-30) y bloqueó todo lo posterior durante siete semanas. El fallo sólo se
registraba en un `console.warn` mientras Settings decía *"Data backed up automatically"*.

**No se perdió nada.** IndexedDB en el iPhone conserva el registro completo, y las carreras además
viven en COROS, Strava e intervals.icu. Corregido en v11.35: tablas creadas, la cola ya no se
bloquea ante un elemento roto, y el estado del sync es visible.

**El backfill de W19–W32 ya es posible** en cuanto el backlog suba (basta abrir la app). Merece su
propia pasada con `/weekly-review-auto`, con datos reales en vez de inventados. Detalle completo en
[`../assessments/2026-08-16_system-audit.md`](../assessments/2026-08-16_system-audit.md) §3.

---

### Week 18 (Program Wk 4 — final push before deload) — 2026-04-27 to 2026-05-03

**Weight:** ~86.7 kg today (manual baseline 4/24). 4-week trend −0.59%/wk on target. W18 sampling collapsed (intervals.icu pulls all forward-fills) — manual weigh-in 4-7×/wk needed.

**Training:** 4/4 gym sessions. **Three lifts progressed cleanly:** Row +5 (150×10×4 RPE 8 across), Squat +1 rep × 4 sets at SAME RPE (215×9), OHP all 4 sets done at 115. **Sumo DL +20 lb landed** (245×4-6 with conservative first-set ramp, no back symptoms). Chins auto-progressed +15→+20 lb mid-session. Bench at ceiling (205×8×4, RPE 9 on set 4) → hold load.

**Wellness (NEW — first full week of intervals.icu data):** Readiness avg 56 (range 21-92, two crash days 4/29 + 5/02). HRV ↓14% vs baseline. RHR +5 bpm sustained. Sleep avg 6.3h (excl 16.6h Sun outlier). Pattern = over-reaching → W19 deload validated by data.

**Adherence:** Gym 4/4 ✓ · Run 3 (5/01 @ HR 146 above new Z2 ceiling 143 = 1 hard session) · Mobility 2 (up from 0) · Nutrition 3/7 (43% < 50% threshold → logging is the bottleneck, no macro adjustments until 5/7).

**What didn't:** Sleep avg 6.3h drove the wellness crashes. Hip Thrust + Pallof skipped 2 weeks running (W17 reorder not enforced). Bodyweight measurement reliability collapsed.

**Coach notes:** W19 = pre-programmed deload (plan v4.0). Lock it in. Sumo DL DOWN to 200 × 4 × 2 (post-W16 contracture protocol). Activate Cable Fly + 3s eccentric tempo + Hip Thrust to position #1 in Lower B. Diet break to ~2,900 kcal. Sleep ≥7h every night = priority #1.

---

### Week 17 (Program Wk 3) — 2026-04-20 to 2026-04-26

**Weight:** 86.5 → 86.7 kg over the week (down from 87.7 two weeks ago, −0.5 kg/wk trend on target).

**Training:** 4/4 gym sessions. Sumo DL 225 × 6 × 4 ALL at RPE 7 — clearly under-loaded. Squat 215 × 8 × 4 @ 7.9 (Q5, best session). Bench RPE crept (8.0 → 8.5 last sets). OHP missed 4th set again.

**Adherence:** Gym 4/4 ✓ · Run 2 (Z2 ✓) · Mobility **0** ✗ · Nutrition 2/7 days.

**What didn't:** Late-session accessories collapsing (Upper B 3/6, Lower B 2/6 done). Mobility = 0 for the 4th week running.

**Backfilled on 2026-05-01.**

---

### Week 16 (Program Wk 2) — 2026-04-13 to 2026-04-19

**Weight:** 87.7 kg (Apr 14).

**Training:** 1/4 sessions. Apr 14 Upper A abandoned mid-session — back contracture. Bench had pushed to 205 × 8 @ RPE 9 just before injury. Rest of week missed.

**Adherence:** Gym 1/4 · Run 0 · Mobility 0 · Nutrition 2/7.

**What didn't:** Back injury — direct consequence of zero mobility under heavy compounds. De facto deload week, unplanned.

**Backfilled on 2026-05-01.**

---

### Week 1 — 2026-04-07 to 2026-04-12

**Weight:** 88.3 kg (April 12, single data point)

**Training:**
- Upper A (Apr 7): Bench topped at 88.45 kg × 8 @ RPE 8.5. Row 65.77 kg × 10. Solid session, 59 min
- Lower A (Apr 8): First squat baseline — 97.5 kg × 8 @ RPE 8. RDL 70.3 kg × 10 @ RPE 7. Ab wheel skipped
- Upper B (Apr 9): Chin-ups 4×8 BW @ RPE 7-7.5 — ready to add weight. OHP baseline 52.2 kg × 8 @ RPE 7.5
- Lower B: **Missed** — no deadlift, BSS, hip thrust baseline

**Energy (1-10):** 4/5 quality rating across all sessions (app quality score)

**Adherence:**
- 3/4 gym sessions completed (75%)
- 0/1 runs completed (0%)
- Ab wheel skipped on Lower A
- Cable lateral weight inconsistent — still finding load

**Running:**
- No runs logged. Plan called for 1 zone 2 run

**Other:**
- Logged sessions retroactively on some days (noted in Upper B)
- Mixed kg/lb units in app logging

**Coach notes:**
- Week 1 is acceptable as a baseline week. RPE well-controlled (7-8.5 range), not overshooting
- Bench 88.45 kg is a reasonable starting point given old floor press of 107 kg. ~83% of previous best, expected after restart
- Squat 97.5 kg × 8 is the first real data point ever — good foundation to build from
- Chin-ups 4×8 at 88 kg BW is strong. Ready for added weight
- OHP 52.2 kg × 8 — first baseline, conservative. Room to push
- **Week 2 must-dos:** Complete Lower B (deadlift baseline), do at least 1 run, decide on ab wheel substitute
- Weight drop of 0.3 kg in 10 days is within noise. Need 2-3 weeks to see real trend

---

### Week X - YYYY-MM-DD

**Weight:** kg

**Training:**
-

**Energy (1-10):**

**Adherence:**
-

**Running:**
-

**Other:**
-

**Coach notes:**
-

---
