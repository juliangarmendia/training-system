---
description: Review the past week (gym + run + mobility + body + nutrition), propose plan adjustments interactively, save the review file. Run on Sunday night.
---

# Weekly Review (interactive)

You are about to run a weekly review of Julian's training. Follow this playbook in order. **Confirm with the user before each write.**

## Phase 1 — Pre-flight & data gathering

### 1.1 Verify Supabase MCP auth is alive
Call `mcp__claude_ai_Supabase__list_projects`. If it fails (401, network), surface this exact message and STOP:
> Supabase MCP auth has expired or is unavailable. To restore: open Claude Code settings → MCP → reconnect Supabase. Once reconnected, re-run `/weekly-review`.

The project ID for training-system is `ycfodifvpvosukepcxie`. Use this for all subsequent Supabase calls.

### 1.2 Determine the week range
- "This week" = the most recently **completed** ISO week (Mon–Sun) **strictly before today**.
- If today is Sunday, "this week" is Mon–today. If today is Monday, "this week" is the prior Mon–Sun.
- Compute `weekStart` (YYYY-MM-DD), `weekEnd` (YYYY-MM-DD), and ISO week number `WNN`.
- Also compute the prior 4 weeks for trend analysis.

### 1.3 Query Supabase for the week's data
Use `mcp__claude_ai_Supabase__execute_sql` with project_id `ycfodifvpvosukepcxie`. The shape of every row is `{user_id, record_id, data: jsonb, updated_at}`. The actual record lives inside `data`. You'll get all of Julian's records (he's the only user); no need to filter by user_id.

For each of these tables, query rows where `(data->>'date')::date BETWEEN '$weekStart' AND '$weekEnd'`:
- `workouts`
- `runs`
- `mobility_sessions`
- `bodyweight`
- `nutrition`

Also fetch the prior 4 weeks of `workouts` (for RPE trends) and `bodyweight` (for rate-of-change).

### 1.4 Read repo files
- `plans/training-plan.md` (current plan)
- `plans/changelog.md` (if exists)
- `tracking/weekly-reviews/*.md` — read the last 4 reviews if they exist (use Glob)
- `tracking/progress-log.md` (if exists)
- `docs/profile.md` and `docs/goals.md`
- `CLAUDE.md` and `.claude/rules/training-rules.md` for the coaching rules

## Phase 2 — Analysis

Do not be lazy. Compute the actual numbers from the data.

### 2.1 Adherence
- Gym: planned sessions for the week (from training-plan.md or activeWeekTemplate) vs completed (count of workouts rows). Note any missed days.
- Run: km logged this week vs target km/week (from running-plan.md or recent average).
- Mobility: count of sessions, distinct days with sessions, target was 3-5 days/week.

### 2.2 Performance per key lift
For each of `bench-press`, `back-squat`, `sumo-dl`, `ohp`, `barbell-row`, `chinups`:
- Find the top set this week (highest weight × reps with done=true).
- Find the same lift's top set in the most recent prior week that had it.
- Format: `Lift: WT × R @ RPE X (last: WT × R @ RPE X) → progressing | stalled | regressing`.
- Note any missed lift.

### 2.3 Body weight
- Latest bodyweight entry this week.
- Δ vs the latest entry from the prior week.
- 4-week trend (slope or simple delta).
- Compare rate of change (% per week) against the target zone (-0.5 to -1.0% / week per goals.md).

### 2.4 Mobility & pain
- Count by routine (hip-reset / lumbar / thoracic).
- Average painBefore and painAfter across all this week's sessions.
- Δ pain (before − after).
- 4-week trend of painAfter (improving / stable / worsening).

### 2.5 Nutrition
- Days this week with logged nutrition.
- Days that hit protein target (from settings.proteinTarget or 170g default).
- Average protein.

### 2.6 Apply the coaching rules
Per `.claude/rules/training-rules.md` and CLAUDE.md, the priority order for progression is **reps → load → add a set** (the last is paused during a deficit). Flag:

For each main compound (`bench-press`, `back-squat`, `sumo-dl`, `ohp`, `barbell-row`, `chinups`):
- Avg RPE ≤ 7 AND minimum reps below the prescribed top of range → "**+1 rep next session**, hold weight" (do NOT propose load yet).
- Avg RPE ≤ 7 AND minimum reps at the top of range → "**+2.5 kg / +5 lb** next session".
- Avg RPE 7.5–8.5 → "hold weight, push 1 rep within range if possible" (no load change).
- Avg RPE ≥ 9 → "**hold or reduce reps**; do not add load".
- Avg RPE ≥ 9 across 2 consecutive sessions → "**flag deload** next week (-40% volume)".

For accessories (target RPE 6–8, non-compound exercises):
- Same rep/load logic but use smaller increments (+1.25 kg / +2.5 lb) and DB exercises move by next available DB pair.

Cross-cutting flags:
- 2 consecutive sessions with quality ≤ 2 → suppress load increases; flag possible deload.
- Body weight loss > 1% / week sustained → flag too-aggressive deficit.
- Pain not trending down across 2+ weeks → re-evaluate mobility approach.
- Adherence < 70% → flag program sustainability.
- Deficit is the default state (per `docs/goals.md`); never propose **adding sets** unless adherence and recovery both look strong.

Distinguish compound vs accessory using the `compound: true` flag on plan exercises. Volume calculations should already account for dumbbells (peso × reps × 2).

## Phase 3 — Compose the review file (in memory first)

Build the markdown for `tracking/weekly-reviews/2026-W{NN}.md` using this exact structure:

```markdown
# Week {NN} — {weekStart} to {weekEnd}

## Adherence
- Gym: X/Y planned sessions completed (Z%)
- Run: X km / Y target
- Mobility: X sessions across Y days

## Performance
- Bench Press: 82.5 × 6 @ RPE 8 (last week: 82.5 × 5 @ RPE 8.5) → progressing
- [...per key lift...]

## Body
- Body weight: 84.2 kg (Δ vs last week: -0.4 kg, 4-week: -1.1 kg)
- Rate: -0.5% / week (target zone)

## Mobility & Pain
- Sessions: 4 (hip-reset 3, lumbar 1)
- Avg pain before/after: 2.5 → 1.8 (Δ -0.7)
- 4-week pain trend: 2.8 → 2.3 → 2.0 → 1.8 (improving)

## Nutrition
- Days logged: 6/7
- Days hit protein target: 5/7 (avg 168g)

## What worked
- [signal-driven, concrete observations from the data]

## What didn't
- [red flags, missed sessions, regressions]

## Proposed adjustments for week {NN+1}
- [specific, actionable, with rationale]

## Open questions for Julian
- [things that the data can't answer]

---
*Generated by /weekly-review on {ISO timestamp}*
```

## Phase 4 — Interactive confirmations

Present to the user in chat (do NOT write files yet):
1. The full review markdown.
2. The list of proposed plan changes (load adjustments per exercise, deload flags, etc.).

Use AskUserQuestion to ask which changes to apply. Group as:
- "Apply review file?" (yes/no — saves the file to `tracking/weekly-reviews/`)
- "Apply plan changes?" (yes / yes-with-edits / no)
- "Update progress-log.md?" (yes/no)
- "Update weekly-checkins.md?" (yes/no)

## Phase 5 — Apply confirmed changes

For each "yes":
- **Review file**: write to `tracking/weekly-reviews/2026-W{NN}.md`. Create the folder if it doesn't exist (use Bash `mkdir -p`).
- **Bridge to PWA**: ALSO write `tracking/weekly-reviews/latest.json` with the structure below — the deployed PWA fetches it on Stats > Today and renders the "Coach Review" card. This must be written every time a review is generated; otherwise the in-app card stays stale.
  ```json
  {
    "weekKey": "2026-W{NN}",
    "generatedAt": <Date.now() ms>,
    "source": "auto",
    "observed": "- bullet markdown of 'What worked' + 'What didn't'\n- ...",
    "planNext": "- bullet markdown of 'Proposed adjustments for week {NN+1}'\n- ..."
  }
  ```
  The `observed` and `planNext` fields are markdown — keep them concise (3-6 bullets each) and prefer `**bold**` for the key change. The PWA renders a tiny markdown subset (bullets + bold + paragraphs).
- **Plan changes**: BEFORE editing `plans/training-plan.md`, copy the current version to `plans/archive/training-plan-2026-W{NN}.md` (mkdir archive folder if needed). Then apply the edits to `plans/training-plan.md`. Append a 1-line entry to `plans/changelog.md` (create file if missing): `- W{NN} ({date}): [summary], reason: [signal]`.
- **Progress log**: append the latest metrics row to `tracking/progress-log.md`.
- **Weekly checkins**: append a brief 4-6 line summary to the TOP of `tracking/weekly-checkins.md` (newest first per CLAUDE.md).

## Phase 6 — Final summary

Output a short summary to the user:
- Files created/modified
- Key insights from the review (1-3 bullets)
- The most important adjustment (1 sentence)
- "Run /weekly-review again next Sunday."

## Notes for execution
- Always parse dates carefully (data->>'date' is YYYY-MM-DD local).
- If a table has zero rows for the week, note "No X this week" instead of empty sections.
- If `tracking/weekly-reviews/` doesn't exist or is empty, this is the FIRST review — say so explicitly and skip the 4-week trends with "Need 2+ reviews for trends".
- Be direct and evidence-based per CLAUDE.md. No motivational filler.
- If the data contradicts the current plan (e.g., user did a different session than planned), flag it but don't moralize.
