# Personal Training System

Claude Code project for managing a structured fat loss and strength training program.

## How to use

1. Open this folder as its own project in VS Code (not inside a parent workspace)
2. Drop raw data (old routines, lifting logs, running exports, body metrics) into `data/raw/`
3. Ask Claude to analyze the data and build the initial assessment
4. Follow the training and running plans in `plans/`
5. Do weekly check-ins by telling Claude your numbers and how things felt
6. Claude updates tracking files and flags when the plan needs adjustment

## Structure

| Folder | Purpose |
|--------|---------|
| `data/raw/` | Unmodified uploads |
| `data/processed/` | Cleaned, standardized versions |
| `docs/` | Profile, goals, constraints |
| `assessments/` | Formal assessments |
| `plans/` | Active training, running, nutrition plans |
| `tracking/` | Weekly check-ins, progress metrics |
| `research/` | Evidence and references |

## Web app

The companion web app (to be built) provides a mobile-friendly interface for:
- Viewing today's workout
- Logging weights, reps, RPE per set
- Quick weekly check-ins
- Progress dashboard

The web app stores session data that feeds back into this project for analysis and plan updates.
