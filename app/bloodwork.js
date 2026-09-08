// ============================================================
// Bloodwork Module — Training App v11.43
//
// Datos estáticos de las 6 analíticas (2021-2025) + la lógica de puntaje 1-5.
// No lee de IndexedDB ni de Supabase: son valores de PDF, no telemetría.
//
// LONG-003: registrar y derivar, nunca derivar tratamiento. El puntaje describe dónde cae
// un valor frente a objetivos PUBLICADOS. No diagnostica, no prescribe, y NINGUNA regla de
// programación se dispara con esto.
//
// Fuente y trazabilidad completa:
//   data/processed/2026-08-20_analitica-puntuada.md   (rangos, rúbrica, suplementación)
//   data/processed/2026-08-16_blood-markers.md        (registro de la extracción)
// Si un rango cambia allí, cambia aquí. Los dos documentos son la autoridad.
// ============================================================

// ==================== LA RÚBRICA ====================
//
// Tres formas de marcador y UNA sola función para las tres:
//   'lower'  → menos es mejor  (ApoB, no-HDL): intervalos con techo, sin suelo
//   'higher' → más es mejor    (vitamina D):   intervalos con suelo, sin techo
//   'band'   → banda óptima con DOS colas malas (HbA1c, ferritina): intervalos concéntricos
//
// Los intervalos se ANIDAN del 5 al 1 y gana el primero que contiene el valor. Así las dos
// colas de un marcador de banda penalizan simétricamente. Con una escala mal diseñada, una
// TSH baja saldría 5.
//
// Regla A — el 5 sólo existe si hay un objetivo publicado que cumplir. Sin diana no hay 5:
//           hay "en rango". Por eso la vitamina D, la TSH, la creatinina, la ferritina y la
//           homocisteína topan en 4 aunque el valor sea impecable.
// Regla B — no más bandas que cortes publicados + 1. Antes de inventar una gradación se deja
//           el nivel vacío (de ahí los saltos 5→3→1 en algunos marcadores).

function scoreMarker(bands, value) {
  if (!bands || value == null || !isFinite(value)) return null;
  for (const b of bands) {
    const okMin = b.min == null || value >= b.min;
    const okMax = b.max == null || value <= b.max;
    if (okMin && okMax) return b.score;
  }
  return 1;
}

// Antigüedad: eje SEPARADO del puntaje. Un valor de 2023 no describe hoy, por bueno que sea.
const BLOOD_STALE_FRESH_MONTHS = 12;
const BLOOD_STALE_EXPIRED_MONTHS = 24;

function bloodStaleness(dateISO, todayISO) {
  const today = todayISO ? new Date(todayISO) : new Date();
  const months = (today - new Date(dateISO)) / (1000 * 60 * 60 * 24 * 30.44);
  const m = Math.round(months);
  if (months <= BLOOD_STALE_FRESH_MONTHS) return { level: 'fresco', months: m, label: 'fresh' };
  if (months <= BLOOD_STALE_EXPIRED_MONTHS) return { level: 'caducado', months: m, label: `${m} months` };
  return { level: 'historico', months: m, label: `${m} months` };
}

// ==================== MARCADORES ====================
// shape: 'lower' | 'higher' | 'band' | null (null = no se puntúa, con motivo en `noScore`)
// confounder: el entrenamiento o la hidratación mueven el valor → el número solo no basta.

const BLOOD_MARKERS = [
  // ---------- Lípidos y riesgo cardiovascular ----------
  {
    key: 'nonHdl', label: 'Non-HDL cholesterol', unit: 'mg/dL', family: 'lipidos', shape: 'lower',
    bands: [{ score: 5, max: 85 }, { score: 4, max: 100 }, { score: 3, max: 130 }, { score: 2, max: null }],
    labRange: 'the lab does not print it',
    target: '<85 very high risk · <100 high · <130 moderate',
    source: 'ESC/EAS 2019, kept in the 2025 Focused Update',
    note: 'The most useful atherogenic marker you can compute from what you already have measured.',
  },
  {
    key: 'apoB', label: 'Apolipoprotein B', unit: 'mg/dL', family: 'lipidos', shape: 'lower',
    bands: [{ score: 5, max: 65 }, { score: 4, max: 80 }, { score: 3, max: 100 }, { score: 2, max: null }],
    labRange: '66-133 (men)',
    target: '<65 very high risk · <80 high · <100 moderate',
    source: 'ESC/EAS 2019',
    note: 'The lab\'s 66-133 is a POPULATION interval, not a risk threshold: its whole upper stretch sits above every guideline target. "Within range" and "good number" are not the same thing.',
  },
  {
    key: 'tg', label: 'Triglycerides', unit: 'mg/dL', family: 'lipidos', shape: 'lower',
    bands: [{ score: 5, max: 135 }, { score: 3, max: 499 }, { score: 1, max: null }],
    labRange: '0-149',
    target: '<135 (below the "elevated" 135-499 band)',
    source: 'ESC/EAS 2025 Focused Update',
  },
  {
    key: 'totalChol', label: 'Total cholesterol', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '100-199', target: 'no target of its own',
    noScore: 'Guidelines set no target for it: it enters the decision through non-HDL and ApoB.',
  },
  {
    key: 'ldlCalc', label: 'LDL (calculated)', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '0-99', target: '<55 / <70 / <100 / <116 by risk',
    noScore: 'It is an arithmetic function of total, HDL and triglycerides — scoring it counts the same three numbers again. And WATCH the sequence: 149 (IACA) → 170 (IACA) → 143 (LabCorp) mixes different labs and equations. No published equation reproduces the 170.',
  },
  {
    key: 'hdl', label: 'HDL', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '>39 · "elevated" ≥60', target: 'no upward target in any current guideline',
    noScore: 'The lab\'s "elevated ≥60" is the retired NCEP ATP III convention. No current guideline sets an upward HDL target, so there is no 5 to earn. It reads as three states: <40 risk marker · no signal · very high (>90, cohorts with a U-shaped curve).',
    states: [{ max: 40, label: 'low — risk marker' }, { max: 90, label: 'no signal' }, { max: null, label: 'very high' }],
  },
  {
    key: 'apoA1', label: 'Apolipoprotein A-I', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '104-202', target: 'no target', noScore: 'No guideline sets a target for it.',
  },
  {
    key: 'ldlHdlRatio', label: 'LDL/HDL ratio', unit: '', family: 'lipidos', shape: null,
    labRange: '0.0-3.6', target: '—', noScore: 'Derived: it is LDL divided by HDL.',
  },

  // ---------- Metabólico ----------
  {
    key: 'hba1c', label: 'HbA1c', unit: '%', family: 'metabolico', shape: 'band',
    bands: [
      { score: 5, min: 5.0, max: 5.4 },
      { score: 4, min: 5.0, max: 5.6 },
      { score: 2, min: null, max: 6.4 },
      { score: 1, min: null, max: null },
    ],
    labRange: '≤5.6 · prediabetes 5.7-6.4',
    target: '5.0-5.4 % — LOWEST-risk band',
    source: 'ARIC (Selvin 2010, n=11,092 without diabetes, ~14 years)',
    note: '"The lower the better" is false: below 5.0 % excess mortality reappears in ARIC. It is a band marker, with two tails.',
  },
  {
    key: 'glucose', label: 'Fasting glucose', unit: 'mg/dL', family: 'metabolico', shape: 'band',
    bands: [{ score: 5, min: 70, max: 99 }, { score: 3, min: 70, max: 125 }, { score: 1, min: null, max: null }],
    labRange: '70-100', target: '<100 (IFG 100-125 · diabetes ≥126)', source: 'ADA Standards of Care 2026',
  },
  {
    key: 'insulin', label: 'Fasting insulin', unit: 'mU/L', family: 'metabolico', shape: null,
    labRange: '3.0-24.0', target: 'no published target',
    noScore: 'There is no published optimal range, and the ADLM explicitly recommends NOT measuring it for this purpose.',
  },
  {
    key: 'homa', label: 'HOMA-IR', unit: '', family: 'metabolico', shape: null,
    labRange: '<2.5', target: 'no defined threshold',
    noScore: 'The group that invented the model says so (Oxford, Diabetes Trials Unit): "There is no absolute value for HOMA indices". And it is glucose × insulin / 405 — not a third data point.',
  },

  // ---------- Micronutrientes ----------
  {
    key: 'vitD', label: '25-OH vitamin D', unit: 'ng/mL', family: 'micronutrientes', shape: 'higher',
    bands: [{ score: 4, min: 20 }, { score: 3, min: 16 }, { score: 2, min: 12 }, { score: 1, min: null }],
    labRange: 'optimal >30 · insuff. 20-30 · deficiency <20',
    target: '≥20 ng/mL (50 nmol/L) — IOM 2011 sufficiency and ESCEO 2022 target',
    source: 'IOM 2011 · ESCEO 2022 · Endocrine Society (Demay 2024)',
    note: 'It has no 5 on purpose: the CURRENT Endocrine Society guideline (Demay 2024) says there is no clear evidence defining the optimal level. The "40-60" that circulates everywhere is from the 2011 version, and the society itself walked it back. No published target, no 5 (Rule A).',
    caution: 'Measured in August in Argentina = southern winter nadir. Part of the value is seasonal.',
  },
  {
    key: 'ferritin', label: 'Ferritin', unit: 'ng/mL', family: 'micronutrientes', shape: 'band',
    bands: [
      { score: 4, min: 30, max: 200 },
      { score: 3, min: 15, max: 300 },
      { score: 2, min: 15, max: 400 },
      { score: 1, min: null, max: null },
    ],
    labRange: '30-400 (men)',
    target: '<15 µg/L = deficiency · >200 µg/L in healthy men = iron-overload risk',
    source: 'WHO 2020 (WHO guideline on ferritin concentrations)',
    note: 'The lab\'s 30-400 hides the real ceiling: the WHO flags >200 µg/L in healthy men as overload risk. 191 is NINE units away. In favour of it being real stores and not inflammation: CRP 0.24 mg/dL in the same panel and ESR 5 mm in Jun-2023.',
  },
  {
    key: 'homocysteine', label: 'Homocysteine', unit: 'µmol/L', family: 'micronutrientes', shape: 'lower',
    bands: [{ score: 4, max: 15 }, { score: 2, max: 30 }, { score: 1, max: null }],
    labRange: '<15', target: 'no therapeutic target',
    source: 'Cochrane 2017 (15 RCTs, 71,422 participants, HIGH quality)',
    note: 'Capped at 4 by Rule A: lowering homocysteine does NOT change hard outcomes, so there is no target to hit.',
  },
  { key: 'b12', label: 'Vitamin B12', unit: 'pg/mL', family: 'micronutrientes', shape: null, labRange: '197-771', target: 'no target', noScore: 'No published target; it reads as inside or outside the interval.' },
  { key: 'folate', label: 'Folate', unit: 'ng/mL', family: 'micronutrientes', shape: null, labRange: '4.6-34.8', target: 'no target', noScore: 'No published target.' },
  { key: 'selenium', label: 'Selenium', unit: 'ng/mL', family: 'micronutrientes', shape: null, labRange: '70-150', target: 'no target', noScore: 'No published target.' },
  { key: 'zinc', label: 'Zinc', unit: 'µg/mL', family: 'micronutrientes', shape: null, labRange: '0.66-1.10', target: 'no target', noScore: 'No published target.' },
  {
    key: 'b6', label: 'Vitamin B6 (pyridoxal-P)', unit: 'µg/L', family: 'micronutrientes', shape: null,
    labRange: 'not legible in the PDF', target: '—', uncertain: true,
    noScore: 'The lab range could not be read with certainty, so it is not scored. Related safety note: in 2023 the EFSA cut the tolerable INTAKE maximum from 25 to 12 mg/day (peripheral neuropathy). Multivitamins and pre-workouts often carry B6 far above that — worth reading labels.',
  },

  // ---------- Inflamación ----------
  {
    key: 'crp', label: 'CRP', unit: 'mg/dL', family: 'inflamacion', shape: null,
    labRange: '<0.80', target: 'no applicable strata',
    noScore: 'The published risk strata (<1 / 1-3 / >3 mg/L) are for HIGH-SENSITIVITY CRP. The interval the lab prints (<0.80 mg/dL) is standard CRP, so applying them would be a method error.',
  },
  {
    key: 'esr', label: 'Sedimentation rate (ESR)', unit: 'mm', family: 'inflamacion', shape: 'lower',
    bands: [{ score: 4, max: 15 }, { score: 2, max: 40 }, { score: 1, max: null }],
    labRange: '0-15 (men)', target: 'no target; non-specific marker',
    confounder: 'Rises with hard exercise in the previous days, a recent infection, or for no identifiable reason.',
    note: 'Went from 5 mm (Jun-2023) to 21 mm (Jun-2024) with no simultaneous CRP to contrast it against. A single reading of a non-specific marker: repeat it alongside high-sensitivity CRP.',
  },

  // ---------- Órganos y hormonas ----------
  {
    key: 'tsh', label: 'TSH', unit: 'mUI/L', family: 'organos', shape: 'band',
    bands: [{ score: 4, min: 0.27, max: 4.20 }, { score: 2, min: 0.1, max: 10 }, { score: 1, min: null, max: null }],
    labRange: '0.27-4.20', target: 'no guideline sets a target in a euthyroid person',
    note: 'Capped at 4 by Rule A. The "optimal <2.5" that circulates comes from no current guideline — and applying it would give a 3 to a value that is simply inside the interval. Relevant for tracking the deficit: metabolic adaptation can move TSH, so these values are a good comparison point.',
  },
  { key: 'ft4', label: 'Free T4', unit: 'ng/dL', family: 'organos', shape: null, labRange: '0.93-1.70', target: 'no target', noScore: 'No published target.' },
  {
    key: 'egfr', label: 'eGFR (CKD-EPI)', unit: 'mL/min/1.73m²', family: 'organos', shape: 'higher',
    bands: [{ score: 5, min: 90 }, { score: 4, min: 60 }, { score: 3, min: 45 }, { score: 2, min: 30 }, { score: 1, min: null }],
    labRange: 'stages G1-G5', target: 'G1 ≥90 · G2 60-89 · G3a 45-59 · G3b 30-44 · G4 15-29',
    source: 'KDIGO 2024', note: 'This is the measure KDIGO actually uses for staging. 84 = G2.',
  },
  {
    key: 'creatinine', label: 'Creatinine', unit: 'mg/dL', family: 'organos', shape: 'band',
    bands: [{ score: 4, min: 0.70, max: 1.20 }, { score: 2, min: 0.5, max: 1.5 }, { score: 1, min: null, max: null }],
    labRange: '0.70-1.20 (men)', target: 'KDIGO 2024: only relevant as an input to eGFR',
    source: 'KDIGO 2024',
    note: 'Capped at 4: it is not a target in itself. There are THREE readings, not one: 1.44 (2021) → 1.40 (2023-06) → 1.15 (2024-09). With more muscle mass creatinine rises without the kidney changing.',
  },
  {
    key: 'urea', label: 'Urea', unit: 'mg/dL', family: 'organos', shape: 'lower',
    bands: [{ score: 4, max: 48.5 }, { score: 2, max: 80 }, { score: 1, max: null }],
    labRange: '16.6-48.5', target: 'KDIGO 2024 does NOT use urea for staging',
    confounder: 'Protein intake and hydration status move it.',
    note: 'The descriptive fact, with no conclusion: 59.0 above the interval, with creatinine 1.15 in range, eGFR 84, a negative protein dipstick and urine specific gravity 1.036 in the SAME draw (very concentrated urine). What explains that set is a question for your doctor. The concrete action is clear: repeat it fasted, well hydrated, and with 48 h clear of a hard session.',
  },
  { key: 'ast', label: 'AST (SGOT)', unit: 'U/L', family: 'organos', shape: null, labRange: '<40', target: 'no target', confounder: 'Strength training raises it.', noScore: 'No published target, and confounded: drawing blood 48 h after a hard session moves the number.' },
  { key: 'alt', label: 'ALT (SGPT)', unit: 'U/L', family: 'organos', shape: null, labRange: '<41', target: 'no target', confounder: 'Strength training raises it.', noScore: 'No published target, and confounded.' },
  { key: 'alp', label: 'Alkaline phosphatase', unit: 'U/L', family: 'organos', shape: null, labRange: '40-129', target: 'no target', noScore: 'No published target.' },
  { key: 'biliTotal', label: 'Total bilirubin', unit: 'mg/dL', family: 'organos', shape: null, labRange: '≤1.2', target: 'no target', noScore: 'No published target.' },
  { key: 'cortisolAM', label: 'Morning salivary cortisol', unit: 'µg/dL', family: 'organos', shape: null, labRange: '<0.74 (8 am)', target: 'no target', noScore: 'No published target. The night value (<0.11 against <0.28) shows the rhythm is preserved.' },
  { key: 'urineSg', label: 'Urine specific gravity', unit: '', family: 'organos', shape: null, labRange: '1.003-1.030', target: '—', noScore: 'It is a snapshot of hydration status at the moment of the sample, not a health marker. 1.036 in Sep-2024 = very concentrated urine, and it is direct context for that day\'s urea.' },
];

const BLOOD_FAMILIES = [
  { key: 'lipidos', label: 'Lipids and cardiovascular risk' },
  { key: 'metabolico', label: 'Metabolic' },
  { key: 'micronutrientes', label: 'Micronutrients' },
  { key: 'inflamacion', label: 'Inflammation' },
  { key: 'organos', label: 'Organs and hormones' },
];

// ==================== PANELES ====================
// Sólo valores leídos del texto extraído de los PDF. Nada inferido: lo que no está, no está.
// `lab` importa: comparar LDL calculado entre laboratorios distintos no es comparar lo mismo.

const BLOOD_PANELS = [
  {
    date: '2021-05-14', lab: 'IACA', scope: 'CBC, glucose, lipids, electrolytes, liver panel, TSH, urine',
    values: { totalChol: 226, ldlCalc: 149, hdl: 66, tg: 54, nonHdl: 160, glucose: 91, urea: 35.0, creatinine: 1.44, ast: 25, alt: 19, alp: 64, biliTotal: 1.1, tsh: 2.45, urineSg: 1.022 },
  },
  {
    date: '2023-06-28', lab: 'IACA', scope: 'CBC, ESR, glucose, urea, CRP, Ca/Mg, liver panel, CK, LDH, TSH, free T4',
    values: { glucose: 95, urea: 40.0, creatinine: 1.40, crp: 0.09, esr: 5, ast: 27, alt: 33, alp: 59, biliTotal: 0.8, tsh: 3.33, ft4: 1.22 },
  },
  {
    date: '2023-08-07', lab: 'IACA', scope: 'The most complete: HbA1c, ApoA/ApoB, ferritin, B12, folate, vit. D, salivary cortisol, insulin, HOMA, homocysteine, selenium, zinc, B6',
    note: 'Date corrected: August 4 was the intake, the blood was drawn on the 7th.',
    values: { hba1c: 5.3, glucose: 106, insulin: 10.6, homa: 2.8, apoB: 110, apoA1: 141, crp: 0.24, ferritin: 191, b12: 682, folate: 7.2, vitD: 11.2, homocysteine: 9, selenium: 82, zinc: 1.11, b6: 42, cortisolAM: 0.56 },
  },
  {
    date: '2024-06-04', lab: 'IACA', scope: 'CBC, ESR, glucose, urea, liver panel',
    values: { glucose: 98, urea: 32.0, esr: 21, ast: 27, alt: 25, alp: 58, biliTotal: 0.3 },
  },
  {
    date: '2024-09-20', lab: 'IACA', scope: 'CBC, glucose, urea, creatinine, eGFR, lipids, liver panel, TSH, free T4, insulin, HOMA, urine',
    values: { totalChol: 260, ldlCalc: 170, hdl: 68, tg: 101, glucose: 95, insulin: 5.5, homa: 1.3, urea: 59.0, creatinine: 1.15, egfr: 84, ast: 27, alt: 29, alp: 63, biliTotal: 0.9, tsh: 3.07, ft4: 1.28, urineSg: 1.036 },
  },
  {
    date: '2025-02-04', lab: 'LabCorp', scope: 'Lipid panel with LDL/HDL ratio + routine infectious screening (all non-reactive)',
    values: { totalChol: 230, ldlCalc: 143, hdl: 65, tg: 126, nonHdl: 165, ldlHdlRatio: 2.2 },
  },
];

// ==================== NUNCA MEDIDO ====================
// Lo ausente informa tanto como lo presente.
const BLOOD_NEVER_MEASURED = [
  { label: 'Total and free testosterone + SHBG', why: 'None of the 6 panels includes it. The system watches low energy availability for its endocrine effects and uses libido as a proxy in the weekly check-in — but the real marker was never measured. It is the most glaring absence in someone with a prolonged deficit.' },
  { label: 'Lp(a)', why: 'Measured ONCE in a lifetime (it is genetic). With ApoB 110, it is the missing piece for real risk stratification.' },
  { label: 'High-sensitivity CRP', why: 'The standard CRP on file does not allow the published risk strata to be applied. And it is needed to contrast the ESR of 21.' },
  { label: 'Measured VO₂max', why: 'The best-studied predictor of all-cause mortality. Whoop and COROS estimates are not the same thing.' },
];

// ==================== QUÉ PEDIR EN LA PRÓXIMA ANALÍTICA ====================
const BLOOD_REQUEST_LIST = [
  'Lipid panel + ApoB + Lp(a)',
  'Glucose + HbA1c',
  '25-OH vitamin D',
  'Total and free testosterone + SHBG',
  'Ferritin (+ transferrin and saturation if ferritin comes back high)',
  'High-sensitivity CRP + ESR',
  'Urea, creatinine and eGFR',
  'TSH + free T4',
  'Liver panel',
];

const BLOOD_REQUEST_CONDITIONS = 'Fasted · no hard training in the previous 48 h (it moves CK, AST/ALT and ESR) · well hydrated (the urea of 59 with specific gravity 1.036 shows why).';

// ==================== SUPLEMENTACIÓN ====================
// Solo nutrición deportiva con position stand publicado. Corregir una deficiencia documentada
// es medicina y no aparece aquí (LONG-003).
const BLOOD_SUPPLEMENTS = {
  worth: [
    {
      name: 'Creatine monohydrate', tier: 'AIS Group A', dose: '3-5 g/day (loading is optional)',
      effect: 'Fat-free mass +1.39 kg; in trained lifters +1.82 kg',
      source: 'ISSN 2017 (Kreider) · Ashtary-Larky 2025 meta-analysis, 61 trials, 1,457 participants',
      caveat: 'The IOC documents 1-2 kg of body-mass gain from intracellular water after loading. With the scale as the target: skip the loading phase, 5 g/day straight, and do not read the initial jump as a setback.',
    },
    {
      name: 'Caffeine', tier: 'AIS Group A', dose: '3-6 mg/kg ≈ 261-523 mg, ~60 min before',
      effect: 'Aerobic endurance 2-4 % · strength 2-7 % (effect size 0.16-0.20, small)',
      source: 'ISSN 2021 (Guest)',
      caveat: 'Genetics matter more than dose: with CYP1A2, the AA genotype improved 6.8 % and CC got WORSE by 13.7 %. And in this system it has a cost: a dose like that in the afternoon compromises sleep, and sleep is the gate to the next day.',
    },
    {
      name: 'Protein powder', tier: 'Sports food (AIS), not a performance supplement', dose: 'whatever is missing to hit the daily target',
      effect: '+2.49 kg on 1RM and +0.30 kg of fat-free mass, with MORE effect in trained lifters',
      source: 'Morton 2018, BJSM, 49 RCTs, 1,863 participants',
      caveat: 'The 1.62 g/kg/day plateau was NOT derived in a deficit: Morton explicitly excluded subjects under energy restriction. If you get there with food, powder is convenience, not intervention.',
    },
    { name: 'Omega-3', tier: 'AIS Group B (emerging evidence)', dose: '2-3 g/day', effect: 'Moderate effect on exercise-induced damage', source: 'AIS framework', caveat: 'Not a priority.' },
  ],
  notWorth: [
    { name: 'Magnesium', why: 'AIS Group C. Cochrane 2020: unlikely to give clinically meaningful cramp prophylaxis.' },
    { name: 'BCAAs and HMB', why: 'AIS Group C — and they are sold precisely as lean-mass protectors in a deficit.' },
    { name: 'Vitamin E', why: 'Doubly negative: AIS Group C and a grade D (AGAINST) recommendation from the USPSTF 2022.' },
    { name: 'Multivitamins', why: 'Group B, and the USPSTF 2022 concludes insufficient evidence (grade I) for cardiovascular and cancer prevention.' },
    { name: 'B vitamins without a deficiency', why: 'Cochrane 2017: no reduction in infarction or mortality, HIGH-quality evidence.' },
    { name: 'Alpha-lipoic acid, phosphate, SAMe, tyrosine', why: 'AIS Group C.' },
  ],
  risk: 'IOC 2018 consensus: in the seminal study ~15 % of more than 600 products contained undeclared prohormones, the problem persists, and the FDA has pulled supplements with potentially toxic doses of vitamins A, D, B6 and selenium. Every supplement added is a risk surface, not just a line of spending.',
};

// ==================== LECTORES ====================

function bloodMarkerDef(key) {
  return BLOOD_MARKERS.find(m => m.key === key) || null;
}

// Serie completa de un marcador, de la más antigua a la más nueva.
function bloodMarkerSeries(key) {
  return BLOOD_PANELS
    .filter(p => p.values[key] != null)
    .map(p => ({ date: p.date, lab: p.lab, value: p.values[key] }));
}

// Último valor medido + su puntaje + su antigüedad. null si nunca se midió.
function bloodMarkerLatest(key, todayISO) {
  const series = bloodMarkerSeries(key);
  if (!series.length) return null;
  const last = series[series.length - 1];
  const def = bloodMarkerDef(key);
  return {
    key, def, value: last.value, date: last.date, lab: last.lab,
    score: def && def.shape ? scoreMarker(def.bands, last.value) : null,
    stale: bloodStaleness(last.date, todayISO),
    count: series.length,
    series,
  };
}

// Estado de tres niveles para el HDL, que no se puntúa pero sí se lee.
function bloodMarkerState(key, value) {
  const def = bloodMarkerDef(key);
  if (!def || !def.states || value == null) return null;
  for (const s of def.states) if (s.max == null || value < s.max) return s.label;
  return null;
}

// Resumen de frescura para la cabecera de la vista. El eje que LONG-003 pide vigilar.
function bloodFreshnessSummary(todayISO) {
  const measured = BLOOD_MARKERS.map(m => bloodMarkerLatest(m.key, todayISO)).filter(Boolean);
  const newest = BLOOD_PANELS[BLOOD_PANELS.length - 1];
  const newestStale = bloodStaleness(newest.date, todayISO);
  return {
    total: measured.length,
    scored: measured.filter(m => m.score != null).length,
    expired: measured.filter(m => m.stale.level === 'caducado').length,
    historic: measured.filter(m => m.stale.level === 'historico').length,
    neverMeasured: BLOOD_NEVER_MEASURED.length,
    newestDate: newest.date,
    newestMonths: newestStale.months,
    // LONG-003 pide avisar cuando el panel más nuevo pasa de 12 meses. Hoy pasa.
    overdue: newestStale.months > BLOOD_STALE_FRESH_MONTHS,
  };
}
