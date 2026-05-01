---
description: Review the past week (gym + run + mobility + body + nutrition + steps), propose plan adjustments interactively, save the review file. Run on Sunday night.
---

# Weekly Review (interactive)

You are about to run a weekly review of Julian's training. **Confirm with the user before each write.** Same playbook as `/weekly-review-auto` but pauses before applying changes.

## Phase 1 — Pre-flight & full-history gather

### 1.1 Verify Supabase MCP auth is alive
Call `mcp__claude_ai_Supabase__list_projects`. If it fails (401, network), surface this exact message and STOP:
> Supabase MCP auth has expired or is unavailable. To restore: open Claude Code settings → MCP → reconnect Supabase. Once reconnected, re-run `/weekly-review`.

The project ID for training-system is `ycfodifvpvosukepcxie`. Use it for all subsequent Supabase calls.

### 1.2 Determine the week range and idempotency
- "This week" = the most recently **completed** ISO week (Mon–Sun) **strictly before today** (UTC).
- If today is Sunday, "this week" is Mon–today. If today is Monday, "this week" is the prior Mon–Sun.
- Compute `weekStart`, `weekEnd`, ISO week number `WNN`.

**Idempotency check:** read `tracking/weekly-reviews/latest.json`. If it already has `weekKey === "2026-W{thisWeekNN}"` and `generatedAt` within the last 12 hours → ask the user "already ran today, regenerate anyway?" before proceeding.

### 1.3 Read ALL historical files

Glob and read in full:
- `tracking/weekly-reviews/*.md` — all of them (collect existing weekKeys)
- `tracking/weekly-checkins.md`, `tracking/progress-log.md`
- `plans/training-plan.md`, `plans/running-plan.md`, `plans/nutrition-notes.md`
- `plans/changelog.md` (create with `# Plan Changelog\n\n` header if missing)
- `docs/profile.md`, `docs/goals.md`
- `CLAUDE.md`, `.claude/rules/training-rules.md`, `.claude/rules/data-handling.md`

### 1.4 Backfill missing weeks

Compute every ISO week between **program start** (from `plans/training-plan.md` `Created:` line) and the just-completed week. Diff against existing review files. For each **missing** week, in **chronological order (oldest first)**:
- Run Phase 2 + Phase 3 + Phase 4 scoped to that week's date range.
- Save the review file.
- **Skip** writing `latest.json` (only the most recent week owns it).
- Mark in the file: `*Backfilled on YYYY-MM-DD*`.

### 1.5 Query Supabase for the week being processed

For the active week, query rows where `(data->>'date')::date BETWEEN '$weekStart' AND '$weekEnd'`:
- `workouts`, `runs`, `mobility_sessions`, `bodyweight`, `nutrition`, `steps`

Also fetch the prior **4 weeks** for trend context.

## Phase 2 — Multi-week analysis

Compute (and reference in the review):

| Metric | Window |
|---|---|
| Adherence | This week + 4-week rolling average + cumulative since start |
| Top set per key lift | This week + 4-week sparkline |
| Avg RPE per key lift | Same windows |
| Total weekly volume (kg) | Same windows |
| Body weight | Latest entry + 4-week linear slope (kg/wk and %/wk) |
| Pain (avg before/after) | This week + 4-week trend, per routine |
| Mobility frequency | This week + 4-week average |
| Run weekly km | This week + 4-week average |
| Quality (avg) | This week + 4-week average |
| Steps | Avg/day this week + days hitting target |
| Behavioral patterns | Which sessions/exercises consistently get cut short — derive from done=false sets across weeks |

### Evaluate exercise rotation (NEW — every week)

For each exercise in the plan, decide **keep / swap / cycle**:
- **Stalled** (3+ weeks no progression) → consider **swap** to a same-pattern alternative.
- **Repetitive use** (4+ weeks same accessory) → consider **cycle** per the Block A/B swap table in `plans/training-plan.md`.
- **Consistently skipped** (same exercise done=false 2+ weeks) → consider **swap** to something more sustainable.
- **Progressing well** → **keep**. Don't change for variety's sake.

Output decisions in the review under `## Exercise rotation`. If no changes, state "Keep the program — everything progressing".

### Apply coaching rules per `.claude/rules/training-rules.md`

For each main compound (`bench-press`, `back-squat`, `sumo-dl`, `ohp`, `barbell-row`, `chinups`):
- Avg RPE ≤ 7 AND minimum reps below the prescribed top of range → "**+1 rep next session**, hold weight".
- Avg RPE ≤ 7 AND minimum reps at the top of range → "**+2.5 kg / +5 lb** next session".
- Avg RPE 7.5–8.5 → "hold weight, push 1 rep within range if possible".
- Avg RPE ≥ 9 → "**hold or reduce reps**; do not add load".
- Avg RPE ≥ 9 across 2 consecutive sessions → "**flag deload** (-40% volume) for next week".

For accessories (target RPE 6–8): same rep/load logic but smaller increments (+1.25 kg / +2.5 lb), DB exercises advance by next available DB pair.

Cross-cutting flags:
- 2 consecutive sessions with quality ≤ 2 → flag deload.
- BW loss > 1% / week sustained → flag too-aggressive deficit.
- Pain not trending down across 2+ weeks → re-evaluate mobility.
- Adherence < 70% → flag program sustainability.
- Deficit is the default state. Never propose adding sets unless adherence and recovery look strong.

## Phase 3 — Compose outputs (in memory first)

Same as `/weekly-review-auto` Phase 3.1 + 3.2. The .md review markdown structure and the `latest.json` schema (with `coachVoice.lastWeek`, `coachVoice.nextWeek`, `nextWeekPlan`, plus legacy `observed`/`planNext`) are identical. See that file for the exact shape.

## Phase 4 — Interactive confirmations

Present in chat (do NOT write yet):
1. The full review markdown
2. The Coach Review (`coachVoice.lastWeek` + `coachVoice.nextWeek`)
3. The structured next-week plan (per session, per exercise targets)
4. The list of plan changes (load adjustments, deload flags, etc.)

Use AskUserQuestion grouped as:
- "Apply review files?" (yes/no — saves the .md and `latest.json`)
- "Apply plan changes?" (yes / yes-with-edits / no)
- "Update progress-log.md?" (yes/no)
- "Update weekly-checkins.md?" (yes/no)

## Phase 5 — Apply confirmed writes

For each "yes":

### 5.1 Per processed week (backfill + most-recent)

1. **Review file**: `tracking/weekly-reviews/2026-W{NN}.md`. Create folder if missing.
2. **Plan archive**: copy current `plans/training-plan.md` to `plans/archive/training-plan-2026-W{NN}.md`.
3. **Plan update**: append `## Week {NN+1} Targets` section + update `Current week:` field + update internal Change Log.
4. **Changelog**: append `- W{NN} ({date}): [summary], reason: [signal]` to `plans/changelog.md`.
5. **Progress log**: append metrics row to tables in `tracking/progress-log.md`.
6. **Weekly checkins**: prepend 4-6 line summary to the TOP of `tracking/weekly-checkins.md` (newest-first).

### 5.2 Only for the most recent week
7. **`tracking/weekly-reviews/latest.json`** — full JSON from Phase 3.2 (see auto playbook for schema).

### 5.3 Commit + push (after user confirms)

```bash
git add tracking/ plans/
git commit -m "weekly review W{NN} + program W{NN+1}"
git push origin main
```

## Phase 6 — Final summary

Output:
- Weeks processed (backfilled vs current)
- Files created/modified
- Key insights from the review (1-3 bullets)
- Most important adjustment (1 sentence)
- "Run /weekly-review again next Sunday."

## Notes for execution

- Always parse dates carefully (data->>'date' is YYYY-MM-DD local).
- If a table has zero rows for the week, note "No X this week" instead of empty sections.
- If `tracking/weekly-reviews/` is empty, this is the FIRST review — backfill from program start.
- Be direct and evidence-based per CLAUDE.md. No motivational filler.
- If the data contradicts the current plan, flag it but don't moralize.
