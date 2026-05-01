---
description: Same as /weekly-review but applies all writes automatically without asking. Used by the scheduled remote agent every Sunday night.
---

# Weekly Review (autonomous)

Same playbook as `/weekly-review` but no questions — apply your best judgment per the rules and write everything. Follow this in strict order.

## Phase 1 — Pre-flight & full-history gather

### 1.1 Verify Supabase MCP auth is alive
Call `mcp__claude_ai_Supabase__list_projects`. If it fails (401, network), surface this exact message and STOP:
> Supabase MCP auth has expired or is unavailable. To restore: open Claude Code settings → MCP → reconnect Supabase. Once reconnected, re-run `/weekly-review-auto`.

The project ID for training-system is `ycfodifvpvosukepcxie`. Use it for all subsequent Supabase calls.

### 1.2 Determine the week range and idempotency
- "This week" = the most recently **completed** ISO week (Mon–Sun) **strictly before today** (UTC).
- If today is Sunday UTC, "this week" is Mon–today. If today is Monday, "this week" is the prior Mon–Sun.
- Compute `weekStart` (YYYY-MM-DD), `weekEnd` (YYYY-MM-DD), and ISO week number `WNN`.

**Idempotency check (NEW):** read `tracking/weekly-reviews/latest.json` if it exists. If `weekKey === "2026-W{thisWeekNN}"` AND `generatedAt` is within the last 12 hours → exit early with a one-line message. The cron already ran today.

### 1.3 Read ALL historical files (NEW — was "last 4 reviews")

Glob and read in full — every match, no truncation:
- `tracking/weekly-reviews/*.md` (all of them — collect existing weekKeys)
- `tracking/weekly-checkins.md`
- `tracking/progress-log.md`
- `plans/training-plan.md` — extract the `Created:` line to find program-start date, and the `Current week:` line to validate
- `plans/running-plan.md`
- `plans/nutrition-notes.md`
- `plans/changelog.md` (create with header `# Plan Changelog\n\n` if missing)
- `docs/profile.md`, `docs/goals.md`
- `CLAUDE.md`, `.claude/rules/training-rules.md`, `.claude/rules/data-handling.md`

### 1.4 Backfill missing weeks first (NEW — runs before processing the latest)

Compute every ISO week between **program start** and the just-completed week (inclusive). Diff against the existing review files. For every **missing** week, in **chronological order (oldest first)**:
1. Run Phase 2 + Phase 3 + Phase 4.1 (writes the .md and ancillary files) scoped to that week's date range.
2. **Skip** Phase 4.2 (do not overwrite `latest.json`) — only the most recent processed week owns `latest.json`.
3. Note in your write-up that this is a backfill (`*Backfilled on YYYY-MM-DD — original cron did not run this week*`).

After backfill is complete, run Phase 2 + Phase 3 + Phase 4 once more for the just-completed week. This time Phase 4.2 writes `latest.json`.

### 1.5 Query Supabase for the week being processed

For the active week, use `mcp__claude_ai_Supabase__execute_sql` with project_id `ycfodifvpvosukepcxie`. Every row shape is `{user_id, record_id, data: jsonb, updated_at}`; the actual record is in `data`.

Query rows where `(data->>'date')::date BETWEEN '$weekStart' AND '$weekEnd'`:
- `workouts`, `runs`, `mobility_sessions`, `bodyweight`, `nutrition`, `steps`

Also fetch the prior **4 weeks** (not just one) of the same tables for trend context.

## Phase 2 — Multi-week analysis (NEW emphasis)

Compute and reference these in the review. Don't be lazy — actually compute them from the data:

### 2.1 Adherence
- Gym: planned sessions for the week vs completed. 4-week rolling average. Cumulative since start.
- Run: km logged this week vs target. 4-week rolling km average.
- Mobility: count + distinct days. 4-week trend (improving / flat / declining).

### 2.2 Performance per key lift (`bench-press`, `back-squat`, `sumo-dl`, `ohp`, `barbell-row`, `chinups`)
For each lift in this week + each of the prior 4 weeks:
- Top working set (highest weight × reps with done=true)
- Avg RPE across done sets
- Total weekly volume (sum of weight × reps × done × DB-factor where DB-factor=2 for dumbbell exercises)

Format the trend as a sparkline-style line: `Bench Press: W14 175×8@7 → W15 185×8@7.5 → W16 195×8@8 → W17 205×8@8 (stalling, RPE creep)`.

Diagnose stall / progression / regression for each key lift.

### 2.3 Body weight
- Latest entry. Δ vs latest entry of prior week. 4-week linear slope (kg/wk and %/wk). Compare against target zone (-0.5 to -1.0% / week per goals.md).

### 2.4 Mobility & pain
- Routine breakdown (hip-reset / lumbar / thoracic). Avg pain before/after. 4-week pain trend per routine.

### 2.5 Nutrition + steps
- Days logged. Days hitting protein target. Avg protein. Avg steps if `steps` table has rows. Days hitting steps target.

### 2.6 Behavioral patterns (NEW)
Across the prior 4 weeks (including this week), find which **specific exercises consistently get cut** (done=false at end of session). Examples: "Lateral Raise skipped 3 of 4 weeks", "Lower B accessories collapse — only 2 of 6 done in 2 of 4 weeks". This is a real signal — call it out.

### 2.7 Evaluate exercise rotation (NEW — every week)

For each exercise in the current plan, decide **keep / swap / cycle**:

- **Stalled** (3+ consecutive weeks no top-set progression and no rep gain) → consider **swap** to an alternative that hits the same pattern (use the Substitution Table in `plans/training-plan.md`). Example: if Bench has stalled 4 weeks running, consider rotating to Floor Press for a block.
- **Joint stress / repetitive use** (4+ consecutive weeks of the same accessory) → consider **cycle** to a different angle (DB → cable, machine → free-weight). The training-plan already specifies Block A vs Block B accessory swaps at the W5/W6 boundary — apply that explicitly.
- **Consistently skipped** (the user marks done=false for the same exercise 2+ weeks in a row) → consider **swap** to something they'll actually do (different equipment, different angle, lower setup cost).
- **Progressing well** (top set + reps moving up, RPE in target zone) → **keep**. Do not change for variety's sake.

Output the rotation decisions in the review markdown under a `## Exercise rotation` section. If no changes proposed, state "No rotations this week — keep the program as-is" and explain briefly why (e.g., "Compounds all progressing, accessories well within Block A scope").

### 2.8 Apply the coaching rules per `.claude/rules/training-rules.md`

For each main compound (`bench-press`, `back-squat`, `sumo-dl`, `ohp`, `barbell-row`, `chinups`):
- Avg RPE ≤ 7 AND minimum reps below the prescribed top of range → "**+1 rep next session**, hold weight" (do NOT propose load yet).
- Avg RPE ≤ 7 AND minimum reps at the top of range → "**+2.5 kg / +5 lb** next session".
- Avg RPE 7.5–8.5 → "hold weight, push 1 rep within range if possible".
- Avg RPE ≥ 9 → "**hold or reduce reps**; do not add load".
- Avg RPE ≥ 9 across 2 consecutive sessions → "**flag deload** (-40% volume) for next week".

For accessories (target RPE 6–8): same rep/load logic but smaller increments (+1.25 kg / +2.5 lb), DB exercises advance by next available DB pair.

Cross-cutting:
- 2 consecutive sessions with quality ≤ 2 → flag possible deload.
- Body weight loss > 1% / week sustained → flag too-aggressive deficit.
- Pain not trending down across 2+ weeks → re-evaluate mobility approach.
- Adherence < 70% → flag program sustainability.
- Deficit is the default state. Never propose **adding sets** unless adherence and recovery look strong.

Distinguish compound vs accessory using the `compound: true` flag on plan exercises. Volume calc accounts for dumbbells (peso × reps × 2).

## Phase 3 — Compose outputs

### 3.1 The full review markdown

Write to `tracking/weekly-reviews/2026-W{NN}.md` with this exact structure:

```markdown
# Week {NN} — {weekStart} to {weekEnd}

## Adherence
- Gym: X/Y planned sessions completed (Z%) · 4-week avg: A%
- Run: X km / Y target · 4-week avg: A km
- Mobility: X sessions / Y days · 4-week trend: improving|flat|declining

## Performance
- Bench Press: W{NN-3} 175×8@7 → W{NN-2} 185×8@7.5 → W{NN-1} 195×8@8 → W{NN} 205×8@8 → **stalling, RPE creep**
- Back Squat: ... → **progressing**
- Sumo DL: ... → **too easy, add load**
- [...per key lift...]

## Body
- Body weight: 84.2 kg (Δ vs last week: -0.4 kg, 4-week slope: -0.5 kg/wk = -0.6%/wk)
- Rate: in target zone | too fast | too slow | gaining

## Mobility & Pain
- Sessions: 4 (hip-reset 3, lumbar 1)
- Avg pain before/after: 2.5 → 1.8 (Δ -0.7)
- 4-week pain trend: 2.8 → 2.3 → 2.0 → 1.8 (improving)

## Nutrition & Steps
- Days logged: 6/7 · Days hit protein: 5/7 (avg 168g)
- Steps: 4-day average 7800/day (target hit 1/4)

## Behavioral patterns
- [Specific exercises being skipped, sessions running short, etc.]

## What worked
- [signal-driven, concrete observations from the data]

## What didn't
- [red flags, missed sessions, regressions]

## Proposed adjustments for week {NN+1}
1. [specific, actionable, with rationale tied to data]
2. ...

## Open questions for Julian
- [things that the data can't answer]

---
*Generated by /weekly-review-auto on {ISO timestamp}*
```

### 3.2 The Coach Review + structured next-week plan (NEW schema for `latest.json`)

Compose the in-app Coach Review as a real coach talking to Julian — direct, evidence-based, no motivational filler (per CLAUDE.md). Reference specific numbers from the data. Then build a programmed plan for the upcoming week with concrete targets per session/exercise.

`tracking/weekly-reviews/latest.json` shape:

```json
{
  "weekKey": "2026-W{NN}",
  "generatedAt": <Date.now() ms as a number>,
  "source": "auto",
  "coachVoice": {
    "lastWeek": "Markdown body — 4-6 short paragraphs or bullets. Direct, evidence-based, references specific numbers. Example tone: '4/4 gym this week, clean execution. The big signal is **Sumo DL across all 4 sets at RPE 7** — that's not heavy enough; you've got more in the tank. Bench is the opposite story: RPE crept 8 → 8.5 across the working sets, you dropped from 8 reps to 7 by set 3. Hold the load.\\n\\nMobility went to **zero** again. Two weeks in a row. With heavy DL/squat phase + a deficit, this is the highest-priority fix — non-negotiable for week {NN+1}.\\n\\n[Body weight, nutrition, etc.]'",
    "nextWeek": "Markdown body — 3-5 short paragraphs explaining the upcoming week's priorities and why. Example: 'Week {NN+1} is the last hard week before deload. Three priorities:\\n\\n1. **Sumo DL +10-15 lb.** RPE 7 across all 4 sets is the body asking for more.\\n2. **Mobility 3 sessions, scheduled.** Pin them — Wed Hip Reset, Sat Lumbar, Sun Hip Reset.\\n3. **Lower B accessory protection.** Start the session with Hip Thrust BEFORE BSS. The accessories are getting cut when you run out of gas — flip the order.'"
  },
  "nextWeekPlan": {
    "weekNumber": <NN+1>,
    "weekLabel": "Block A · Week {NN+1} (final push before deload)",
    "phase": "push" | "build" | "deload" | "baseline",
    "summary": "1-line summary, e.g. 'Sumo DL +10-15 lb. Squat +5. Bench hold. Mobility 3x mandatory.'",
    "sessions": [
      {
        "id": "upperA",
        "label": "Upper A — Mon",
        "focus": "Bench hold, Row +5",
        "exercises": [
          {"id": "bench-press", "name": "Bench Press", "target": "205 lb × 5-8", "rpe": "7-8", "note": "Hold load — RPE was creeping in last 2 sets last week"},
          {"id": "barbell-row", "name": "Barbell Row", "target": "150 lb × 6-10", "rpe": "7-8", "note": "+5 lb"},
          {"id": "incline-db-press", "name": "Incline DB Press", "target": "50 lb/DB × 8-12", "rpe": "7"},
          {"id": "face-pull", "name": "Face Pull", "target": "47.5 lb × 12-15", "rpe": "7"},
          {"id": "lateral-raise", "name": "DB Lateral Raise", "target": "15 lb/DB × 12-15", "rpe": "7", "note": "Don't skip — start before the row"},
          {"id": "tricep-pushdown", "name": "Tricep Pushdown", "target": "47.5 lb × 10-15", "rpe": "7"}
        ]
      },
      { "id": "lowerA", "label": "Lower A — Tue", "focus": "...", "exercises": [/* same shape */] },
      { "id": "upperB", "label": "Upper B — Thu", "focus": "...", "exercises": [/* ... */] },
      { "id": "lowerB", "label": "Lower B — Fri", "focus": "...", "exercises": [/* ... */] }
    ],
    "mobility": "3 sessions: Hip Reset Wed, Lumbar Sat, Hip Reset Sun",
    "running": "2 × Z2 (Wed easy 4-5 km, Sat Z2 4-5 km, HR < 140)"
  },
  "observed": "(copy of coachVoice.lastWeek — for backwards compat with v10.13-v10.16 PWA)",
  "planNext": "(copy of coachVoice.nextWeek — for backwards compat)"
}
```

Use real exercise IDs from `plans/training-plan.md` and the PLAN constant in `app/app.js`. Exercise targets must be derived from the analysis (Phase 2.7), not invented. Round weights to plate-friendly increments.

If the upcoming week is a **deload week** (week 5 or 9 per the program structure), set `phase: "deload"`, halve sets, drop RPE to 6, and write the targets accordingly.

## Phase 4 — Apply ALL writes (no questions, no confirmation)

### 4.1 For each processed week (backfill + most-recent)

1. **Review file**: `tracking/weekly-reviews/2026-W{NN}.md` — full markdown from Phase 3.1. Create folder if missing (`mkdir -p`).
2. **Plan archive**: copy current `plans/training-plan.md` to `plans/archive/training-plan-2026-W{NN}.md` (mkdir archive folder if needed). Skip if no plan changes will be applied.
3. **Plan update**: append a `## Week {NN+1} Targets` section to the bottom of `plans/training-plan.md`. Update the `Current week:` line at the top. Update the internal Change Log section with a new row.
4. **Changelog**: append `- W{NN} ({date}): [summary], reason: [signal]` to `plans/changelog.md` (create with header if missing).
5. **Progress log**: append a new metrics row to the relevant tables in `tracking/progress-log.md` (body weight + strength markers + running + recovery).
6. **Weekly checkins**: prepend a 4-6 line summary to the TOP of `tracking/weekly-checkins.md` (newest-first per CLAUDE.md). Use the established template (Weight / Training / Energy / Adherence / Running / Other / Coach notes).

### 4.2 Only for the most recent processed week

7. **`tracking/weekly-reviews/latest.json`** — full JSON from Phase 3.2.

### 4.3 Commit + push

```bash
git add tracking/ plans/
git commit -m "weekly review W{NN} + program W{NN+1}"
git push origin main
```

If multiple weeks were backfilled, batch them into one commit at the end (don't commit between iterations of Phase 4.1).

## Phase 5 — Final summary

Output to the user:
- Weeks processed (backfilled vs current)
- Files created/modified (full paths)
- Top 3 insights from the multi-week analysis (1 line each)
- Key plan changes applied (concise list)
- Any flags worth surfacing (deload, deficit too aggressive, pain not trending down, adherence < 70%, behavioral patterns)
- "Next review: cron fires Sunday at 21:30 EDT (next Mon 01:30 UTC)."

## Notes for execution

- All dates: parse `data->>'date'` as local YYYY-MM-DD.
- If a table has zero rows for the week, write "No X this week" — don't skip the section.
- If `tracking/weekly-reviews/` is empty, this is the FIRST review — backfill from program start (find the date in `plans/training-plan.md` "Created:" line) up to the most recent completed week.
- Be direct, evidence-based, critical (per CLAUDE.md). Zero motivational filler.
- If the data contradicts the plan (different session done than planned), flag it but don't moralize.
- Auto mode = no questions. Apply the coaching rules and write the files.
