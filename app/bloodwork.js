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
  if (months <= BLOOD_STALE_FRESH_MONTHS) return { level: 'fresco', months: m, label: 'fresco' };
  if (months <= BLOOD_STALE_EXPIRED_MONTHS) return { level: 'caducado', months: m, label: `${m} meses` };
  return { level: 'historico', months: m, label: `${m} meses` };
}

// ==================== MARCADORES ====================
// shape: 'lower' | 'higher' | 'band' | null (null = no se puntúa, con motivo en `noScore`)
// confounder: el entrenamiento o la hidratación mueven el valor → el número solo no basta.

const BLOOD_MARKERS = [
  // ---------- Lípidos y riesgo cardiovascular ----------
  {
    key: 'nonHdl', label: 'Colesterol no-HDL', unit: 'mg/dL', family: 'lipidos', shape: 'lower',
    bands: [{ score: 5, max: 85 }, { score: 4, max: 100 }, { score: 3, max: 130 }, { score: 2, max: null }],
    labRange: 'no lo imprime el laboratorio',
    target: '<85 muy alto riesgo · <100 alto · <130 moderado',
    source: 'ESC/EAS 2019, mantenido en el Focused Update 2025',
    note: 'El marcador aterogénico más útil que se puede calcular con lo que ya tienes medido.',
  },
  {
    key: 'apoB', label: 'Apolipoproteína B', unit: 'mg/dL', family: 'lipidos', shape: 'lower',
    bands: [{ score: 5, max: 65 }, { score: 4, max: 80 }, { score: 3, max: 100 }, { score: 2, max: null }],
    labRange: '66-133 (hombres)',
    target: '<65 muy alto riesgo · <80 alto · <100 moderado',
    source: 'ESC/EAS 2019',
    note: 'El 66-133 del laboratorio es un intervalo POBLACIONAL, no un umbral de riesgo: todo su tramo alto queda por encima de cualquier objetivo de guía. "Dentro de rango" y "buen número" no son lo mismo.',
  },
  {
    key: 'tg', label: 'Triglicéridos', unit: 'mg/dL', family: 'lipidos', shape: 'lower',
    bands: [{ score: 5, max: 135 }, { score: 3, max: 499 }, { score: 1, max: null }],
    labRange: '0-149',
    target: '<135 (por debajo de la banda "elevada" 135-499)',
    source: 'ESC/EAS 2025 Focused Update',
  },
  {
    key: 'totalChol', label: 'Colesterol total', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '100-199', target: 'sin objetivo propio',
    noScore: 'Las guías no le fijan diana: entra en la decisión vía no-HDL y ApoB.',
  },
  {
    key: 'ldlCalc', label: 'LDL (calculado)', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '0-99', target: '<55 / <70 / <100 / <116 según riesgo',
    noScore: 'Es una función aritmética de total, HDL y triglicéridos — puntuarlo cuenta los mismos tres números otra vez. Y OJO con la serie: 149 (IACA) → 170 (IACA) → 143 (LabCorp) mezcla laboratorios y ecuaciones distintas. Ninguna ecuación publicada reproduce el 170.',
  },
  {
    key: 'hdl', label: 'HDL', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '>39 · "elevado" ≥60', target: 'sin objetivo hacia arriba en ninguna guía vigente',
    noScore: 'El "elevado ≥60" del laboratorio es la convención retirada del NCEP ATP III. Ninguna guía vigente fija diana de HDL hacia arriba, así que no hay 5 que ganar. Se lee en tres estados: <40 marcador de riesgo · sin señal · muy alto (>90, cohortes con curva en U).',
    states: [{ max: 40, label: 'bajo — marcador de riesgo' }, { max: 90, label: 'sin señal' }, { max: null, label: 'muy alto' }],
  },
  {
    key: 'apoA1', label: 'Apolipoproteína A-I', unit: 'mg/dL', family: 'lipidos', shape: null,
    labRange: '104-202', target: 'sin objetivo', noScore: 'Ninguna guía le fija diana.',
  },
  {
    key: 'ldlHdlRatio', label: 'Ratio LDL/HDL', unit: '', family: 'lipidos', shape: null,
    labRange: '0,0-3,6', target: '—', noScore: 'Derivado: es LDL dividido por HDL.',
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
    labRange: '≤5,6 · prediabetes 5,7-6,4',
    target: '5,0-5,4 % — banda de MENOR riesgo',
    source: 'ARIC (Selvin 2010, n=11.092 sin diabetes, ~14 años)',
    note: '"Cuanto más baja, mejor" es falso: por debajo de 5,0 % reaparece exceso de mortalidad en ARIC. Es un marcador de banda, con dos colas.',
  },
  {
    key: 'glucose', label: 'Glucosa en ayunas', unit: 'mg/dL', family: 'metabolico', shape: 'band',
    bands: [{ score: 5, min: 70, max: 99 }, { score: 3, min: 70, max: 125 }, { score: 1, min: null, max: null }],
    labRange: '70-100', target: '<100 (IFG 100-125 · diabetes ≥126)', source: 'ADA Standards of Care 2026',
  },
  {
    key: 'insulin', label: 'Insulina en ayunas', unit: 'mU/L', family: 'metabolico', shape: null,
    labRange: '3,0-24,0', target: 'sin objetivo publicado',
    noScore: 'No existe rango óptimo publicado, y la ADLM recomienda explícitamente NO medirla con esta finalidad.',
  },
  {
    key: 'homa', label: 'HOMA-IR', unit: '', family: 'metabolico', shape: null,
    labRange: '<2,5', target: 'sin umbral definido',
    noScore: 'Lo dice el grupo que inventó el modelo (Oxford, Diabetes Trials Unit): "There is no absolute value for HOMA indices". Además es glucosa × insulina / 405 — no es un tercer dato.',
  },

  // ---------- Micronutrientes ----------
  {
    key: 'vitD', label: '25-OH vitamina D', unit: 'ng/mL', family: 'micronutrientes', shape: 'higher',
    bands: [{ score: 4, min: 20 }, { score: 3, min: 16 }, { score: 2, min: 12 }, { score: 1, min: null }],
    labRange: 'óptimo >30 · insuf. 20-30 · deficiencia <20',
    target: '≥20 ng/mL (50 nmol/L) — suficiencia IOM 2011 y objetivo ESCEO 2022',
    source: 'IOM 2011 · ESCEO 2022 · Endocrine Society (Demay 2024)',
    note: 'No tiene 5 a propósito: la guía VIGENTE de la Endocrine Society (Demay 2024) dice que no hay evidencia clara que defina el nivel óptimo. El "40-60" que circula por todas partes es de la versión de 2011, y la propia sociedad se desdijo. Sin diana publicada no hay 5 (Regla A).',
    caution: 'Medida en agosto en Argentina = nadir invernal austral. Parte del valor es estacional.',
  },
  {
    key: 'ferritin', label: 'Ferritina', unit: 'ng/mL', family: 'micronutrientes', shape: 'band',
    bands: [
      { score: 4, min: 30, max: 200 },
      { score: 3, min: 15, max: 300 },
      { score: 2, min: 15, max: 400 },
      { score: 1, min: null, max: null },
    ],
    labRange: '30-400 (hombres)',
    target: '<15 µg/L = deficiencia · >200 µg/L en hombres sanos = riesgo de sobrecarga de hierro',
    source: 'OMS 2020 (WHO guideline on ferritin concentrations)',
    note: 'El rango 30-400 del laboratorio esconde el techo real: la OMS marca >200 µg/L en hombres sanos como riesgo de sobrecarga. 191 está a NUEVE unidades. A favor de que sea reserva real y no inflamación: PCR 0,24 mg/dL en el mismo panel y ESR 5 mm en jun-2023.',
  },
  {
    key: 'homocysteine', label: 'Homocisteína', unit: 'µmol/L', family: 'micronutrientes', shape: 'lower',
    bands: [{ score: 4, max: 15 }, { score: 2, max: 30 }, { score: 1, max: null }],
    labRange: '<15', target: 'sin diana terapéutica',
    source: 'Cochrane 2017 (15 ECA, 71.422 participantes, calidad ALTA)',
    note: 'Tope en 4 por la Regla A: bajar la homocisteína NO cambia los desenlaces duros, así que no hay diana que cumplir.',
  },
  { key: 'b12', label: 'Vitamina B12', unit: 'pg/mL', family: 'micronutrientes', shape: null, labRange: '197-771', target: 'sin objetivo', noScore: 'Sin diana publicada; se lee dentro o fuera del intervalo.' },
  { key: 'folate', label: 'Ácido fólico', unit: 'ng/mL', family: 'micronutrientes', shape: null, labRange: '4,6-34,8', target: 'sin objetivo', noScore: 'Sin diana publicada.' },
  { key: 'selenium', label: 'Selenio', unit: 'ng/mL', family: 'micronutrientes', shape: null, labRange: '70-150', target: 'sin objetivo', noScore: 'Sin diana publicada.' },
  { key: 'zinc', label: 'Zinc', unit: 'µg/mL', family: 'micronutrientes', shape: null, labRange: '0,66-1,10', target: 'sin objetivo', noScore: 'Sin diana publicada.' },
  {
    key: 'b6', label: 'Vitamina B6 (piridoxal-P)', unit: 'µg/L', family: 'micronutrientes', shape: null,
    labRange: 'no legible en el PDF', target: '—', uncertain: true,
    noScore: 'El rango del laboratorio no se pudo leer con certeza, así que no se puntúa. Nota de seguridad relacionada: la EFSA rebajó en 2023 el máximo tolerable de INGESTA de 25 a 12 mg/día (neuropatía periférica). Multivitamínicos y pre-entrenos suelen llevar B6 muy por encima — vale la pena mirar etiquetas.',
  },

  // ---------- Inflamación ----------
  {
    key: 'crp', label: 'PCR', unit: 'mg/dL', family: 'inflamacion', shape: null,
    labRange: '<0,80', target: 'sin estratos aplicables',
    noScore: 'Los estratos de riesgo publicados (<1 / 1-3 / >3 mg/L) son de PCR ULTRASENSIBLE. El intervalo que imprime el laboratorio (<0,80 mg/dL) es de PCR estándar, así que aplicarlos sería un error de método.',
  },
  {
    key: 'esr', label: 'Eritrosedimentación (ESR)', unit: 'mm', family: 'inflamacion', shape: 'lower',
    bands: [{ score: 4, max: 15 }, { score: 2, max: 40 }, { score: 1, max: null }],
    labRange: '0-15 (hombres)', target: 'sin diana; marcador inespecífico',
    confounder: 'Sube con ejercicio intenso en días previos, infección reciente, o sin causa identificable.',
    note: 'Pasó de 5 mm (jun-2023) a 21 mm (jun-2024) sin PCR simultánea con la que contrastar. Una medición aislada de un marcador inespecífico: repetir junto a PCR ultrasensible.',
  },

  // ---------- Órganos y hormonas ----------
  {
    key: 'tsh', label: 'TSH', unit: 'mUI/L', family: 'organos', shape: 'band',
    bands: [{ score: 4, min: 0.27, max: 4.20 }, { score: 2, min: 0.1, max: 10 }, { score: 1, min: null, max: null }],
    labRange: '0,27-4,20', target: 'ninguna guía fija diana en un eutiroideo',
    note: 'Tope en 4 por la Regla A. El "óptimo <2,5" que circula no sale de ninguna guía vigente — y aplicarlo daría un 3 a un valor que simplemente está dentro del intervalo. Relevante para el seguimiento del déficit: la adaptación metabólica puede mover la TSH, así que estos valores son buen punto de comparación.',
  },
  { key: 'ft4', label: 'T4 libre', unit: 'ng/dL', family: 'organos', shape: null, labRange: '0,93-1,70', target: 'sin objetivo', noScore: 'Sin diana publicada.' },
  {
    key: 'egfr', label: 'TFGe (CKD-EPI)', unit: 'mL/min/1,73m²', family: 'organos', shape: 'higher',
    bands: [{ score: 5, min: 90 }, { score: 4, min: 60 }, { score: 3, min: 45 }, { score: 2, min: 30 }, { score: 1, min: null }],
    labRange: 'estadios G1-G5', target: 'G1 ≥90 · G2 60-89 · G3a 45-59 · G3b 30-44 · G4 15-29',
    source: 'KDIGO 2024', note: 'Es la medida que KDIGO usa de verdad para estadificar. 84 = G2.',
  },
  {
    key: 'creatinine', label: 'Creatinina', unit: 'mg/dL', family: 'organos', shape: 'band',
    bands: [{ score: 4, min: 0.70, max: 1.20 }, { score: 2, min: 0.5, max: 1.5 }, { score: 1, min: null, max: null }],
    labRange: '0,70-1,20 (hombres)', target: 'KDIGO 2024: sólo interesa como insumo de la TFGe',
    source: 'KDIGO 2024',
    note: 'Tope en 4: no es una diana en sí misma. Hay TRES mediciones, no una: 1,44 (2021) → 1,40 (2023-06) → 1,15 (2024-09). Con más masa muscular la creatinina sube sin que el riñón cambie.',
  },
  {
    key: 'urea', label: 'Urea', unit: 'mg/dL', family: 'organos', shape: 'lower',
    bands: [{ score: 4, max: 48.5 }, { score: 2, max: 80 }, { score: 1, max: null }],
    labRange: '16,6-48,5', target: 'KDIGO 2024 NO usa urea para estadificar',
    confounder: 'La mueven la ingesta de proteína y el estado de hidratación.',
    note: 'El hecho descriptivo, sin conclusión: 59,0 por encima del intervalo, con creatinina 1,15 en rango, TFGe 84, tira de proteínas negativa y densidad urinaria 1.036 en LA MISMA extracción (orina muy concentrada). Qué explica ese conjunto es pregunta para tu médico. La acción concreta sí es clara: repetirla en ayunas, bien hidratado y con 48 h sin sesión dura.',
  },
  { key: 'ast', label: 'AST (TGO)', unit: 'U/L', family: 'organos', shape: null, labRange: '<40', target: 'sin objetivo', confounder: 'El entrenamiento de fuerza la sube.', noScore: 'Sin diana publicada, y con confusor: sacar sangre 48 h después de una sesión dura mueve el número.' },
  { key: 'alt', label: 'ALT (TGP)', unit: 'U/L', family: 'organos', shape: null, labRange: '<41', target: 'sin objetivo', confounder: 'El entrenamiento de fuerza la sube.', noScore: 'Sin diana publicada, y con confusor.' },
  { key: 'alp', label: 'Fosfatasa alcalina', unit: 'U/L', family: 'organos', shape: null, labRange: '40-129', target: 'sin objetivo', noScore: 'Sin diana publicada.' },
  { key: 'biliTotal', label: 'Bilirrubina total', unit: 'mg/dL', family: 'organos', shape: null, labRange: '≤1,2', target: 'sin objetivo', noScore: 'Sin diana publicada.' },
  { key: 'cortisolAM', label: 'Cortisol salival matutino', unit: 'µg/dL', family: 'organos', shape: null, labRange: '<0,74 (8 h)', target: 'sin objetivo', noScore: 'Sin diana publicada. El nocturno (<0,11 sobre <0,28) indica ritmo conservado.' },
  { key: 'urineSg', label: 'Densidad urinaria', unit: '', family: 'organos', shape: null, labRange: '1.003-1.030', target: '—', noScore: 'Es una foto del estado de hidratación en el momento de la muestra, no un marcador de salud. 1.036 en sep-2024 = orina muy concentrada, y es contexto directo de la urea de ese día.' },
];

const BLOOD_FAMILIES = [
  { key: 'lipidos', label: 'Lípidos y riesgo cardiovascular' },
  { key: 'metabolico', label: 'Metabólico' },
  { key: 'micronutrientes', label: 'Micronutrientes' },
  { key: 'inflamacion', label: 'Inflamación' },
  { key: 'organos', label: 'Órganos y hormonas' },
];

// ==================== PANELES ====================
// Sólo valores leídos del texto extraído de los PDF. Nada inferido: lo que no está, no está.
// `lab` importa: comparar LDL calculado entre laboratorios distintos no es comparar lo mismo.

const BLOOD_PANELS = [
  {
    date: '2021-05-14', lab: 'IACA', scope: 'Hemograma, glucemia, lípidos, ionograma, hepatograma, TSH, orina',
    values: { totalChol: 226, ldlCalc: 149, hdl: 66, tg: 54, nonHdl: 160, glucose: 91, urea: 35.0, creatinine: 1.44, ast: 25, alt: 19, alp: 64, biliTotal: 1.1, tsh: 2.45, urineSg: 1.022 },
  },
  {
    date: '2023-06-28', lab: 'IACA', scope: 'Hemograma, ESR, glucemia, urea, PCR, Ca/Mg, hepatograma, CK, LDH, TSH, T4L',
    values: { glucose: 95, urea: 40.0, creatinine: 1.40, crp: 0.09, esr: 5, ast: 27, alt: 33, alp: 59, biliTotal: 0.8, tsh: 3.33, ft4: 1.22 },
  },
  {
    date: '2023-08-07', lab: 'IACA', scope: 'El más completo: HbA1c, ApoA/ApoB, ferritina, B12, folato, vit. D, cortisol salival, insulina, HOMA, homocisteína, selenio, zinc, B6',
    note: 'Fecha corregida: el 4 de agosto fue la admisión, la sangre se extrajo el 7.',
    values: { hba1c: 5.3, glucose: 106, insulin: 10.6, homa: 2.8, apoB: 110, apoA1: 141, crp: 0.24, ferritin: 191, b12: 682, folate: 7.2, vitD: 11.2, homocysteine: 9, selenium: 82, zinc: 1.11, b6: 42, cortisolAM: 0.56 },
  },
  {
    date: '2024-06-04', lab: 'IACA', scope: 'Hemograma, ESR, glucemia, urea, hepatograma',
    values: { glucose: 98, urea: 32.0, esr: 21, ast: 27, alt: 25, alp: 58, biliTotal: 0.3 },
  },
  {
    date: '2024-09-20', lab: 'IACA', scope: 'Hemograma, glucemia, urea, creatinina, TFGe, lípidos, hepatograma, TSH, T4L, insulina, HOMA, orina',
    values: { totalChol: 260, ldlCalc: 170, hdl: 68, tg: 101, glucose: 95, insulin: 5.5, homa: 1.3, urea: 59.0, creatinine: 1.15, egfr: 84, ast: 27, alt: 29, alp: 63, biliTotal: 0.9, tsh: 3.07, ft4: 1.28, urineSg: 1.036 },
  },
  {
    date: '2025-02-04', lab: 'LabCorp', scope: 'Perfil lipídico con ratio LDL/HDL + cribado infeccioso de rutina (todo no reactivo)',
    values: { totalChol: 230, ldlCalc: 143, hdl: 65, tg: 126, nonHdl: 165, ldlHdlRatio: 2.2 },
  },
];

// ==================== NUNCA MEDIDO ====================
// Lo ausente informa tanto como lo presente.
const BLOOD_NEVER_MEASURED = [
  { label: 'Testosterona total y libre + SHBG', why: 'Ninguno de los 6 paneles la incluye. El sistema vigila la baja disponibilidad energética por sus efectos endocrinos y usa la libido como proxy en el seguimiento semanal — pero el marcador real nunca se midió. Es la ausencia más llamativa en alguien con déficit prolongado.' },
  { label: 'Lp(a)', why: 'Se mide UNA vez en la vida (es genética). Con ApoB 110, es la pieza que falta para estratificar riesgo de verdad.' },
  { label: 'PCR ultrasensible', why: 'La PCR estándar que hay no permite aplicar los estratos de riesgo publicados. Y hace falta para contrastar la ESR de 21.' },
  { label: 'VO₂max medido', why: 'El predictor de mortalidad por cualquier causa mejor estudiado. Las estimaciones de Whoop y COROS no son lo mismo.' },
];

// ==================== QUÉ PEDIR EN LA PRÓXIMA ANALÍTICA ====================
const BLOOD_REQUEST_LIST = [
  'Perfil lipídico + ApoB + Lp(a)',
  'Glucosa + HbA1c',
  '25-OH vitamina D',
  'Testosterona total y libre + SHBG',
  'Ferritina (+ transferrina y saturación si la ferritina vuelve alta)',
  'PCR ultrasensible + ESR',
  'Urea, creatinina y TFGe',
  'TSH + T4 libre',
  'Hepatograma',
];

const BLOOD_REQUEST_CONDITIONS = 'En ayunas · sin entrenamiento fuerte las 48 h previas (mueve CK, AST/ALT y ESR) · bien hidratado (la urea de 59 con densidad 1.036 muestra por qué).';

// ==================== SUPLEMENTACIÓN ====================
// Solo nutrición deportiva con position stand publicado. Corregir una deficiencia documentada
// es medicina y no aparece aquí (LONG-003).
const BLOOD_SUPPLEMENTS = {
  worth: [
    {
      name: 'Creatina monohidrato', tier: 'Grupo A del AIS', dose: '3-5 g/día (la carga es opcional)',
      effect: 'Masa libre de grasa +1,39 kg; en entrenados +1,82 kg',
      source: 'ISSN 2017 (Kreider) · meta-análisis Ashtary-Larky 2025, 61 ensayos, 1.457 participantes',
      caveat: 'El COI documenta 1-2 kg de aumento de masa corporal por agua intracelular tras la carga. Con la báscula como objetivo: saltate la carga, 5 g/día directo, y no leas el salto inicial como retroceso.',
    },
    {
      name: 'Cafeína', tier: 'Grupo A del AIS', dose: '3-6 mg/kg ≈ 261-523 mg, ~60 min antes',
      effect: 'Resistencia aeróbica 2-4 % · fuerza 2-7 % (tamaño de efecto 0,16-0,20, pequeño)',
      source: 'ISSN 2021 (Guest)',
      caveat: 'Manda la genética más que la dosis: con CYP1A2, el genotipo AA mejoró 6,8 % y el CC EMPEORÓ 13,7 %. Y en este sistema tiene coste: una dosis así por la tarde compromete el sueño, y el sueño es la puerta del día siguiente.',
    },
    {
      name: 'Proteína en polvo', tier: 'Sports food (AIS), no suplemento de rendimiento', dose: 'lo que falte para llegar al objetivo diario',
      effect: '+2,49 kg en 1RM y +0,30 kg de masa libre de grasa, con MÁS efecto en entrenados',
      source: 'Morton 2018, BJSM, 49 ECA, 1.863 participantes',
      caveat: 'El plateau de 1,62 g/kg/día NO se derivó en déficit: Morton excluyó explícitamente a sujetos en restricción energética. Si llegas con comida, el polvo es comodidad, no intervención.',
    },
    { name: 'Omega-3', tier: 'Grupo B del AIS (evidencia emergente)', dose: '2-3 g/día', effect: 'Efecto moderado sobre el daño inducido por el ejercicio', source: 'Marco del AIS', caveat: 'No es prioritario.' },
  ],
  notWorth: [
    { name: 'Magnesio', why: 'Grupo C del AIS. Cochrane 2020: improbable que dé profilaxis de calambres clínicamente significativa.' },
    { name: 'BCAA y HMB', why: 'Grupo C del AIS — y se venden precisamente como protectores de masa magra en déficit.' },
    { name: 'Vitamina E', why: 'Doble negativa: Grupo C del AIS y recomendación grado D (EN CONTRA) de la USPSTF 2022.' },
    { name: 'Multivitamínicos', why: 'Grupo B, y la USPSTF 2022 concluye evidencia insuficiente (grado I) para prevención cardiovascular y de cáncer.' },
    { name: 'Vitaminas B sin déficit', why: 'Cochrane 2017: sin reducción de infarto ni mortalidad, evidencia de calidad ALTA.' },
    { name: 'Ácido alfa-lipoico, fosfato, SAMe, tirosina', why: 'Grupo C del AIS.' },
  ],
  risk: 'Consenso del COI 2018: en el estudio seminal ~15 % de más de 600 productos contenían prohormonas no declaradas, el problema persiste, y la FDA ha retirado suplementos con dosis potencialmente tóxicas de vitaminas A, D, B6 y selenio. Cada suplemento añadido es una superficie de riesgo, no sólo una línea de gasto.',
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
