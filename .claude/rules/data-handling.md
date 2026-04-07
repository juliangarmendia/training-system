# Data Handling Rules

## Incoming data

- Classify every upload: gym routine, lifting log, running session, body metrics, nutrition log, or other
- Summarize contents before doing anything else
- Flag gaps: what is missing that would be useful (RPE, rest periods, dates, body weight at time)
- Do not assume missing data. Ask

## Processing

- Raw files stay untouched in `data/raw/`
- Cleaned versions go to `data/processed/` with naming: `YYYY-MM-DD_description.md`
- Strength data must include: exercise, load (kg), sets, reps, RPE/RIR if available
- Running data must include: date, distance (km), duration, average pace, HR if available

## Old routines

- Evaluate critically. Do not copy them as templates
- Note what was good, what was questionable, what should not carry forward
- The new program does not need to resemble old ones

## Updates

- After processing data, update `docs/profile.md` if baselines change
- If data is significant enough to affect the plan, say so explicitly
- All updates include the date they were made
