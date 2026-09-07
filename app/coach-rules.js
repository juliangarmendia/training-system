// ============================================================
// coach-rules.js — texto de las reglas para la vista Coach
// ============================================================
//
// GENERADO — no editar. Lo escribe scripts/build-rules-compact.mjs desde
// research/evidence-to-rules.md (fuente de verdad). Para regenerarlo:
//
//   node scripts/build-rules-compact.mjs
//
// sourceSha256: 7dde7a0311412ec78d56bea0857f56837a5baf5df61ad762b5199907ff4779a8
// count: 70
//
// POR QUÉ EXISTE. La vista Coach escribe "Regla STR-001 (evidencia fuerte): <texto>" debajo de
// cada decisión del coach. Los Rule ID crudos en pantalla son ruido (§B.9) y el texto no puede
// venir por fetch: la app entrena sin conexión, así que el corpus va en el APP_SHELL. Sólo
// viajan `rule` y `evidenceLevel`; el resto de campos son para el prompt, no para la pantalla.
// El texto de la regla se queda en el idioma del corpus (inglés); la etiqueta de evidencia la
// traduce COACH_EVIDENCE_ES en app/coach.js.

const COACH_RULES = {
  "GEN-001": { rule: "Prefer ONE dominant quality per block when weekly hard-stress is already at cap; two qualities may progress together at moderate loads. This is a fatigue-budgeting heuristic, not an interference finding.", evidenceLevel: "expert" },
  "GEN-002": { rule: "Do not apply beginner, obese, or elite-athlete evidence to this user without explicitly flagging it as extrapolated.", evidenceLevel: "strong" },
  "GEN-003": { rule: "When sources conflict, resolve by evidence grade x population fit; ties break toward lower fatigue/injury cost; log the conflict and decision.", evidenceLevel: "expert" },
  "STR-001": { rule: "In a deficit, maintain load/intensity and cut volume first; do not chase net hypertrophy.", evidenceLevel: "strong" },
  "STR-002": { rule: "Train each muscle group / movement pattern 2x per week.", evidenceLevel: "strong" },
  "STR-003": { rule: "Weekly volume 10-20 sets/muscle outside a deficit; cap at 10-14 sets/muscle during a deficit.", evidenceLevel: "strong" },
  "STR-004": { rule: "Default proximity to failure 1-3 RIR; reserve 0-1 RIR for isolation/machine work; never to failure on compounds in a deficit.", evidenceLevel: "moderate" },
  "STR-005": { rule: "Include at least one heavy slot (3-6 reps) per main movement pattern.", evidenceLevel: "strong" },
  "STR-006": { rule: "Rest at least 2 min on compounds (2-3 min), 1-2 min on accessories.", evidenceLevel: "strong" },
  "STR-007": { rule: "Use full ROM and emphasize lengthened (long muscle length) positions where joint-safe.", evidenceLevel: "strong" },
  "STR-008": { rule: "Periodization model is hypertrophy-insensitive when volume/intensity are equated; for strength, undulating is modestly superior to linear in trained lifters, and any periodization beats none. Periodize for strength, variety and adherence, not for a hypertrophy advantage.", evidenceLevel: "moderate" },
  "STR-010": { rule: "Keep main compounds stable for progression; rotate accessories at block boundaries (4-6 wk) with purpose, not weekly.", evidenceLevel: "expert" },
  "REC-001": { rule: "Protein 1.8-2.7 g/kg bodyweight; bias higher when leaner or in a larger deficit.", evidenceLevel: "strong" },
  "REC-002": { rule: "Rate of loss is a dial of 0.5-1.0% bodyweight/week, governed by performance and wellness; go slower the leaner/more trained.", evidenceLevel: "strong" },
  "REC-003": { rule: "Recomposition magnitude decreases with training age and leanness; set realistic expectations (slow simultaneous gain/loss in trained adults).", evidenceLevel: "expert" },
  "REC-004": { rule: "Exploit the return-from-layoff window: muscle-memory favors recomposition for the first weeks back.", evidenceLevel: "moderate" },
  "REC-005": { rule: "Schedule maintenance diet breaks aligned with training deloads to improve fat-loss efficiency and blunt metabolic adaptation (NOT to preserve more lean mass).", evidenceLevel: "weak_extrapolated" },
  "REC-006": { rule: "Drink 5-10 mL/kg bodyweight of fluid in the 2-4 h before a session (~500 mL for this user); keep within-session losses under 2% bodyweight.", evidenceLevel: "strong" },
  "REC-007": { rule: "Periodise carbohydrate by day type rather than raising total intake: more on heavy-lower and long-cardio days, less on rest days, protein and weekly calories unchanged.", evidenceLevel: "moderate" },
  "REC-008": { rule: "Keep energy availability above ~30 kcal/kg FFM/day; treat sustained low EA as an upstream gate on training load, confirmed by symptoms rather than by the arithmetic alone.", evidenceLevel: "moderate" },
  "REC-009": { rule: "Hold a daily step floor (~7,000-10,000) through the deficit; NEAT falls spontaneously as energy intake drops.", evidenceLevel: "moderate" },
  "INT-001": { rule: "Avoid hard running within 24h before heavy lower-body strength sessions.", evidenceLevel: "moderate" },
  "INT-002": { rule: "Running produces more lower-limb interference and impact than cycling/rowing/ski; prefer low-interference modality when legs are fatigued or impact must be limited.", evidenceLevel: "strong" },
  "INT-003": { rule: "If strength and endurance share a session, lift first when strength is the priority.", evidenceLevel: "weak_extrapolated" },
  "INT-004": { rule: "Protect power/explosive work: place it fresh, early, never after endurance or under accumulated fatigue.", evidenceLevel: "strong" },
  "INT-005": { rule: "Reject the claim that cardio inherently kills strength/hypertrophy; moderate cardio does not meaningfully blunt gains if volume is managed and not placed immediately pre-lift.", evidenceLevel: "strong" },
  "INT-006": { rule: "Cap total endurance volume during strength-priority blocks.", evidenceLevel: "moderate" },
  "END-001": { rule: "Keep roughly 80/20 easy/hard intensity distribution across the WHOLE week, not just running.", evidenceLevel: "strong" },
  "END-002": { rule: "Anchor running zones to HR/RPE early; introduce pace targets later. Daniels VDOT paces are too fast for a 5k-novice.", evidenceLevel: "moderate" },
  "END-003": { rule: "Progress running volume by ~10%/week soft cap with periodic down weeks.", evidenceLevel: "moderate" },
  "END-004": { rule: "Intervals max 1 session/week, never colliding with heavy legs.", evidenceLevel: "moderate" },
  "END-005": { rule: "Measure Z2 aerobic improvement by aerobic decoupling (<5%) and pace-at-fixed-HR, not raw speed.", evidenceLevel: "expert" },
  "END-006": { rule: "Use run/walk intervals when aerobic base is low or HR drift is high.", evidenceLevel: "moderate" },
  "END-007": { rule: "Maintain heavy strength and low-dose plyometrics during running blocks; they improve running economy.", evidenceLevel: "strong" },
  "END-008": { rule: "HIIT and MICT both raise VO2max; choose by fatigue cost, time, and specificity rather than dogma.", evidenceLevel: "strong" },
  "HYB-001": { rule: "Hybrid/HYROX-like frequency: 0-1 session/week in a cut or strength block; up to 2 only in a dedicated work-capacity block.", evidenceLevel: "weak_extrapolated" },
  "HYB-002": { rule: "Hybrid conditioning counts as a hard day and a partial leg/systemic stressor; space it from heavy legs and hard runs.", evidenceLevel: "weak_extrapolated" },
  "HYB-003": { rule: "Under fatigue, use only low-skill movements in hybrid sessions (sled, carries, lunges, wall ball, ergs); no Olympic lifts or gymnastics.", evidenceLevel: "expert" },
  "HYB-004": { rule: "Hybrid benchmarks no more than once every 4-6 weeks; not a weekly session type.", evidenceLevel: "expert" },
  "HYB-005": { rule: "Use indoor low-impact hybrid (row/ski/bike/sled) when impact or lower-limb load must be limited.", evidenceLevel: "moderate" },
  "ATH-001": { rule: "Plyometrics at low dose (~40-80 contacts/session), progress slowly, introduce after an aerobic/strength base.", evidenceLevel: "moderate" },
  "ATH-002": { rule: "Microdose power work fresh at session start, low volume, maximal intent.", evidenceLevel: "moderate" },
  "ATH-003": { rule: "Prioritize anti-rotation / anti-extension core work (Pallof, dead bug, carries, ab wheel).", evidenceLevel: "strong" },
  "ATH-004": { rule: "Introduce plyometrics only after aerobic and strength base; tendons adapt slowly.", evidenceLevel: "moderate" },
  "ATH-005": { rule: "Unilateral lower-body training transfers comparably to bilateral for strength and adds knee/hip resilience and athletic carryover.", evidenceLevel: "weak_extrapolated" },
  "ATH-006": { rule: "Hold a mobility/flexibility floor of 2-3 sessions per week, ~60 s total per major muscle-tendon unit.", evidenceLevel: "moderate" },
  "READ-001": { rule: "Use 7-day rolling trends for HRV/RHR, not isolated daily values.", evidenceLevel: "strong" },
  "READ-002": { rule: "Require multi-signal confirmation (>=2 concordant signals) before changing the plan.", evidenceLevel: "strong" },
  "READ-003": { rule: "Treat Whoop Recovery score as a yellow/red flag, never as an exact dose calculator.", evidenceLevel: "expert" },
  "READ-004": { rule: "Interpret HRV against the individual's own baseline; never compare across people.", evidenceLevel: "strong" },
  "READ-005": { rule: "When wearable scores conflict with actual performance and subjective state, prioritize performance + subjective feedback.", evidenceLevel: "strong" },
  "READ-006": { rule: "Treat sleep (duration + consistency) as the primary recovery lever.", evidenceLevel: "strong" },
  "READ-007": { rule: "A red day changes the session OBJECTIVE (downgrade/replace), not merely the load.", evidenceLevel: "expert" },
  "READ-008": { rule: "Trigger a deload on sustained multi-signal decline (HRV down + RHR up + performance down + wellness down).", evidenceLevel: "expert" },
  "LOAD-001": { rule: "Avoid abrupt load spikes and build chronic capacity as a PRINCIPLE; do not apply rigid ACWR thresholds.", evidenceLevel: "strong" },
  "LOAD-002": { rule: "For tendon issues, load progressively (isometrics/heavy-slow resistance); do not rest to zero.", evidenceLevel: "strong" },
  "LOAD-003": { rule: "On low-back pain, modify variant/ROM/load; do not reflexively remove strength training.", evidenceLevel: "moderate" },
  "LOAD-004": { rule: "Deload every 4-6 weeks, or reactively after two consecutive sessions of performance decline.", evidenceLevel: "moderate" },
  "SEL-001": { rule: "Machines and free weights produce similar hypertrophy/strength when matched; choose by ROI, stability, joint comfort, and fatigue.", evidenceLevel: "strong" },
  "SEL-002": { rule: "Select exercises by stimulus-to-fatigue ratio and joint-stress profile, not novelty or variety for its own sake.", evidenceLevel: "expert" },
  "SEL-003": { rule: "Do not use EMG amplitude as a direct proxy for hypertrophy; ignore EMG-based exercise hype.", evidenceLevel: "weak_extrapolated" },
  "SEL-004": { rule: "Select cardio modality by impact + interference + recent lower-limb load + goal specificity.", evidenceLevel: "strong" },
  "BUD-001": { rule: "No more than 2-3 truly hard sessions per week counting ALL modalities (heavy strength, intervals, threshold, hard hybrid, demanding long run).", evidenceLevel: "moderate" },
  "BUD-002": { rule: "Assign each session a hard-stress weight and keep the weekly sum under the block's budget cap.", evidenceLevel: "expert" },
  "LONG-001": { rule: "Treat cardiorespiratory fitness as a health outcome in its own right, not only as a means to body composition: the fitness-mortality gradient is steep and shows no upper limit of benefit.", evidenceLevel: "strong" },
  "LONG-002": { rule: "Keep resistance training in the plan for health reasons independent of hypertrophy or aesthetics; ~30-60 min/week of muscle-strengthening activity carries most of the mortality benefit.", evidenceLevel: "strong" },
  "LONG-003": { rule: "Track health markers longitudinally and surface them as context; never derive treatment from them. Abnormal markers are a referral, not a programming input.", evidenceLevel: "expert" },
  "LONG-004": { rule: "Protect habitual sleep duration in the 7-8 h range as a longevity target, not only a recovery lever; both short and long sleep associate with higher mortality.", evidenceLevel: "moderate" },
  "ENV-001": { rule: "In the heat, hold the HR target and let pace fall; do not chase the usual pace. For the same power output, heart rate rises with heat strain, so an HR-anchored easy run is simply slower in August.", evidenceLevel: "moderate" },
  "ENV-002": { rule: "Move hard or long sessions indoors, or to the cooler ends of the day, when heat is high; raise fluid intake above the REC-006 baseline and treat heat as a hard-day cost multiplier.", evidenceLevel: "moderate" },
};

if (typeof module !== 'undefined' && module.exports) module.exports = { COACH_RULES };
