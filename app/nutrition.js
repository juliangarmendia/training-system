// ============================================================
// Nutrición v2 — Training App v11.49
//
// Registro de comida por foto (Claude con visión) + las métricas derivadas que
// justifican el registro. Inspirado en caltrack.levels.io, corrigiendo sus cinco
// debilidades: la foto estima GRAMOS (los macros salen de la biblioteca `foods`),
// el score es una fórmula publicada y no un "blend" opaco, la fibra cuenta, la
// calibración del wearable usa medias móviles de 3 días en vez de pesadas
// puntuales, y todo va en gramos — nunca "1 serving".
//
// POR QUÉ ESTO EXISTE, y por qué es una apuesta:
//   El 2026-09-03 `plans/nutrition-notes.md` dejó de contar calorías porque el
//   registro se abandonó dos veces (11 filas en total, ninguna desde el 28-may).
//   `tracking/progress-log.md` diagnostica la causa: "bottleneck is logging, not
//   strategy". Este módulo apuesta a que lo que falló fue la FRICCIÓN, no la
//   estrategia. Por eso NO sustituye al piloto por peso: convive con él bajo el
//   guardarraíl de adherencia (adherenceMode) para que un tercer abandono
//   degrade el sistema en vez de romperlo.
//
// TRES CAMINOS DE ENTRADA (v11.76), un solo destino. Registrar tenía un embudo único —foto—
// y eso hacía caro justo lo que más se repite. Ahora son tres, y los tres terminan en
// `saveMeal()`, que es lo único que llega a `recomputeNutritionDay`:
//   A · foto (+ nota) → hoja de confirmación → y desde ahí "Save to my foods", que mete el
//       plato en la biblioteca con su medida y su foto para no volver a fotografiarlo.
//   B · biblioteca, con medidas de verdad ('1 scoop' → 30 g) y ordenada por uso reciente y
//       frecuente, no por una fórmula de calidad.
//   C · texto libre + chips opcionales que añaden una línea estructurada a la nota.
//
// ARQUITECTURA DE DATOS — tres stores, un solo escritor por store:
//   `foods`      biblioteca canónica, macros por 100 g (la única verdad; `serving` es un
//                multiplicador, nunca un segundo juego de macros). Crece con el uso.
//   `meals`      una fila por comida registrada, items en gramos.
//   `nutrition`  NO se sustituye. Pasa a ser el agregado derivado por día que
//                escribe recomputeNutritionDay(). Los cinco consumidores que ya
//                leían .protein/.calories/.energy siguen funcionando sin cambios
//                (gráfico de proteína, racha, tarjeta del coach, anillo del
//                dashboard, historial). Nunca se escribe a mano.
//
// Fuente y trazabilidad de los números:
//   plans/nutrition-notes.md          objetivos de kcal por tipo de día, proteína 185 g
//   docs/profile.md                   FFM 72,8 kg (Tanita MC-780MA-N, 2026-08-11)
//   research/evidence-to-rules.md     REC-001 proteína, REC-008 disponibilidad energética
//   research/acsm-summaries.md §3     Thomas/Erdman/Burke 2016, umbral EA 30 kcal/kg FFM
// Si un número cambia allí, cambia aquí. Esos documentos son la autoridad.
// ============================================================

// ==================== CONSTANTES DEL PERFIL ====================
//
// Valores por defecto. Los que el usuario puede editar viven en state.settings y
// estas constantes son solo el respaldo; NUT_FFM_KG se recalcula desde la última
// medición de composición corporal cuando existe (ver ffmKg()).

const NUT_FFM_KG_FALLBACK = 72.8;      // docs/profile.md, Tanita 2026-08-11
const NUT_EA_FLOOR = 30;               // kcal/kg FFM/día — REC-008, ACSM §3
const NUT_KCAL_PER_KG = 7700;          // equivalente energético de 1 kg de tejido
const NUT_PROTEIN_FLOOR = 185;         // g/día — nutrition-notes.md 2026-08-19
const NUT_KCAL_TRAINING = 2700;        // día de entreno
const NUT_KCAL_REST = 2400;            // día de descanso
const NUT_FIBER_TARGET = 25;           // g/día
const NUT_FAT_FLOOR = 65;              // g/día

// ── F-20 (auditoría 2026-09-09): CABLEADO, no borrado. La decisión y su por qué ──────
//
// Esta constante llevaba tres versiones sin un solo lector: `nutDayTargets()` calculaba kcal
// y proteína y nada más. La alternativa era borrarla, y NO se borra porque detrás hay una
// regla con fuente y con consumidor pendiente declarado: REC-007 ("periodizar el carbohidrato
// por tipo de día en vez de subir el total"; Thomas/Erdman/Burke 2016, Tabla 2, banda
// moderada 5-7 g/kg/d), cuyo `consumerNote` en `research/evidence-to-rules.md` dice
// literalmente que es "el siguiente incremento de nutrición". Esto es ese incremento.
//
// CÓMO SE PUBLICA: como INFORMACIÓN, no como semáforo. No entra en `NUT_BANDS`, no puntúa el
// día y no cambia el objetivo de kcal — sigue habiendo tres números que juzgan (kcal,
// proteína, EA) y éste sólo dice cuánto carbohidrato pide el día que toca. Es lo que la regla
// autoriza: la banda ACSM está por encima del baseline por decisión deliberada del déficit, y
// la palanca disponible es la redistribución, no subir el total.
//
// LOS DÍAS SON TIPOS, NO DÍAS DE LA SEMANA. La tabla de `plans/nutrition-notes.md` nombra
// Lun/Jue/Mar/Vie del plan de abril, que está retirado — es el caveat de REC-007. `nutDayType`
// resuelve el tipo desde lo REGISTRADO y, si no hay nada, desde la plantilla activa.
const NUT_CARB_TARGETS = { lower: 350, upper: 285, longrun: 310, rest: 250 };

// Un rodaje cuenta como "long run day" a partir de aquí (nutrition-notes.md: "Z2 >= 5 km",
// "subir CHO modesto si la corrida es >= 40 min").
const NUT_LONGRUN_KM = 5;
const NUT_LONGRUN_MIN = 40;

// F-21: proteína por comida. Umbral de leucina para maximizar la síntesis proteica
// (Moore 2009; Schoenfeld & Aragon 2018) — 30-50 g por comida a este peso corporal.
// Fuente: plans/nutrition-notes.md, "Protein Distribution: Why 4 Meals" y la tabla de §615.
const NUT_PROTEIN_MEAL_MIN = 30;
const NUT_PROTEIN_MEAL_MAX = 50;

// Umbrales del semáforo. Se IMPRIMEN en la leyenda de cada gráfico — nunca un
// color sin su número al lado, que es lo que hace legible un dashboard denso.
const NUT_BANDS = {
  kcal:    { verde: 150, ambar: 400 },   // desvío absoluto respecto al objetivo
  proteina:{ verde: 1.0, ambar: 0.85 },  // fracción del suelo alcanzada
  nova:    { verde: 75, ambar: 50 },     // % de kcal desde NOVA 1-2
  ea:      { verde: 30, ambar: 27 },     // kcal/kg FFM
};

// Adherencia: por debajo de este ratio en la ventana, pilota el peso y no el tracker.
// El umbral 5/7 es el que ya usaba el propio sistema ("no macro adjustments until 5/7").
const NUT_ADHERENCE_WINDOW = 14;
const NUT_ADHERENCE_MIN = 10;           // 10/14 ≈ 5/7

// ==================== COSTE DEL PARSEO POR FOTO ====================
//
// El modelo se eligió a mano (Opus 5, por precisión de porción, que es EL dato que importa)
// sobre una ESTIMACIÓN de ~4 $/mes. Una decisión de coste tomada sobre una estimación hay
// que poder revisarla con el número real, así que cada comida guarda los tokens que costó y
// Tendencias muestra el acumulado del mes.
//
// Si cambia el modelo de la edge function, cambian estos precios. Van juntos a propósito.
const NUT_AI_MODEL = 'claude-opus-5';
const NUT_AI_USD_IN = 5 / 1e6;      // $/token de entrada
const NUT_AI_USD_OUT = 25 / 1e6;    // $/token de salida

function photoCostUsd(usage) {
  if (!usage) return 0;
  return ((Number(usage.input) || 0) * NUT_AI_USD_IN)
       + ((Number(usage.output) || 0) * NUT_AI_USD_OUT);
}

// Coste acumulado del mes en curso y media por foto.
function photoCostSummary(meals, hasta) {
  const mes = String(hasta).slice(0, 7);
  const conCoste = (meals || []).filter(m => m.date && m.date.slice(0, 7) === mes && m.usage);
  const total = conCoste.reduce((sum, m) => sum + photoCostUsd(m.usage), 0);
  return {
    mes,
    fotos: conCoste.length,
    totalUsd: total,
    mediaUsd: conCoste.length ? total / conCoste.length : 0,
  };
}

// ==================== LA FÓRMULA DEL SCORE ====================
//
// Un número por alimento, 0-100, reproducible a mano. Caltrack publica un score
// "blended" que nadie puede recalcular; esto es lo contrario: tres términos
// explícitos, impresos en la UI junto al resultado.
//
//   densidad proteica   g de proteína por 100 kcal. La métrica que de verdad
//                       importa en recomposición: no "cuántas calorías tiene"
//                       sino "cuánta proteína me da por caloría". Tope en 20,
//                       que es donde topan el skyr (17,5) y la pechuga (18,8).
//   penalización NOVA   grado de procesado, eje de calidad INDEPENDIENTE de los
//                       macros. Un alimento puede tener macros perfectos y ser
//                       ultraprocesado; el score tiene que poder decirlo.
//   bonus fibra         hasta +10. Caltrack insiste en el procesado pero no
//                       registra fibra, que está mejor respaldada y es más
//                       accionable que la propia clasificación NOVA.
//
// Casos de referencia: skyr 87 · pechuga 94 · lentejas 49 · Coca-Cola 0.
// La proteína whey sale 55 pese a 80 g/100 g: es NOVA 4 y la fórmula lo dice.
// Eso no es un fallo, es el eje de calidad haciendo su trabajo.

const NUT_NOVA_PENALTY = { 1: 0, 2: 10, 3: 25, 4: 45 };
const NUT_PD_CAP = 20;                  // g proteína / 100 kcal
const NUT_FIBER_CAP = 6;                // g fibra / 100 g para el bonus máximo

// g de proteína por 100 kcal. Devuelve 0 cuando el alimento no aporta energía
// (agua, refresco light): sin calorías no hay densidad que medir.
function proteinDensity(food) {
  const kcal = Number(food.kcal100) || 0;
  const prot = Number(food.protein100) || 0;
  if (kcal <= 0) return 0;
  return (prot * 100) / kcal;
}

function foodScore(food) {
  const pd = proteinDensity(food);
  const pdTerm = Math.min(pd / NUT_PD_CAP, 1) * 100;
  const novaTerm = NUT_NOVA_PENALTY[food.nova] != null ? NUT_NOVA_PENALTY[food.nova] : 25;
  const fiberTerm = Math.min((Number(food.fiber100) || 0) / NUT_FIBER_CAP, 1) * 10;
  return Math.max(0, Math.min(100, Math.round(pdTerm - novaTerm + fiberTerm)));
}

// ==================== DISPONIBILIDAD ENERGÉTICA (REC-008) ====================
//
// EA = (ingesta − gasto de ejercicio) / masa libre de grasa, en kcal/kg FFM/día.
// Suelo 30 (ACSM §3, Thomas 2016; Burke 2021). Las summaries ya calcularon ~27
// en días de entreno para este perfil, por debajo del umbral, sin forma de verlo
// en vivo. Es la métrica que Caltrack no tiene y la que más importa aquí: en un
// déficit con 4 sesiones de fuerza más cardio casi diario, la EA baja es el
// riesgo real, no las calorías absolutas.
//
// Guardarraíl que AVISA, nunca bloquea (así funcionan todos los de esta app).

function energyAvailability(kcalIn, eeeKcal, ffm) {
  const mass = Number(ffm) || NUT_FFM_KG_FALLBACK;
  if (mass <= 0) return null;
  return ((Number(kcalIn) || 0) - (Number(eeeKcal) || 0)) / mass;
}

// kcal netas mínimas para no bajar del suelo de EA. Con 72,8 kg de FFM son 2.184.
function eaFloorKcal(ffm) {
  return Math.round((Number(ffm) || NUT_FFM_KG_FALLBACK) * NUT_EA_FLOOR);
}

function eaStatus(ea) {
  if (ea == null) return 'sin-datos';
  if (ea >= NUT_BANDS.ea.verde) return 'ok';
  if (ea >= NUT_BANDS.ea.ambar) return 'bajo';
  return 'critico';
}

// ==================== MANTENIMIENTO MODELADO ====================
//
// POR QUÉ MODELADO Y NO MEDIDO: no hay dato de gasto energético en el pipeline. Las 122
// filas de `wellness` traen readiness, HRV, RHR y sueño, pero cero campos de energía; y
// `whoop.js` pide /v2/cycle solo para sacar recovery — nunca lee `score.kilojoule`, y la
// ruta primaria es intervals.icu, que no expone gasto total. Construir la calibración
// sobre un campo inexistente habría sido peor que no construirla.
//
// LO QUE ESTO RESUELVE, que es más útil que auditar a Whoop: `plans/nutrition-notes.md`
// admite que el TDEE está "entre 2.720 y 3.110 según lo que se entrene de verdad", con lo
// que "el déficit real cae entre ~150 y ~540 kcal" — un factor de casi cuatro. Y remata:
// "el número no se defiende con la fórmula, se corrige con la tendencia". Esto es esa
// corrección, hecha aritmética: el modelo es la hipótesis, la báscula es la evidencia, y
// la calibración devuelve el error en kcal/día.
//
// CADA TÉRMINO ES EXPLÍCITO Y AUDITABLE. Ninguno es un factor de actividad opaco:
//
//   BMR    Katch-McArdle sobre la masa libre de grasa MEDIDA. Se elige esta y no
//          Mifflin porque usa FFM real en vez de estimarla desde peso y altura, que es
//          justo el dato que hay (Tanita MC-780MA-N). Comprobación: con 72,8 kg da
//          370 + 21,6 × 72,8 = 1.942, el mismo número que docs/profile.md.
//   NEAT   dos partes: los pasos (dato real, 115 filas en el store) y un factor sobre el
//          BMR para todo lo que no son pasos — estar de pie, cocinar, postura. Sin ese
//          factor el modelo se queda en ~1,23 × BMR en un día sedentario, cuando la
//          realidad ronda 1,3-1,4.
//   EEE    el gasto de las sesiones, vía estimateCalories() de app.js. La MISMA función
//          que ya se muestra en el editor de entrenos, para que dos pantallas no den
//          números distintos del mismo día.
//   TEF    efecto térmico de los alimentos, ~10% de lo ingerido. Es gasto real y va en el
//          mantenimiento: dejarlo fuera infla el déficit aparente en ~250 kcal.

const NUT_BMR_KATCH_BASE = 370;         // Katch-McArdle: 370 + 21,6 × FFM
const NUT_BMR_KATCH_COEF = 21.6;
const NUT_NEAT_BASE_FACTOR = 1.10;      // NEAT no atribuible a pasos, sobre el BMR
const NUT_KCAL_PER_STEP_PER_KG = 0.00046; // ≈ 0,040 kcal/paso a 87 kg
const NUT_TEF_FRACTION = 0.10;          // efecto térmico de los alimentos

function bmrKatchMcArdle(ffmKg) {
  const ffm = Number(ffmKg) || NUT_FFM_KG_FALLBACK;
  return Math.round(NUT_BMR_KATCH_BASE + NUT_BMR_KATCH_COEF * ffm);
}

// Gasto de mantenimiento del día. Devuelve el desglose además del total, porque un número
// de mantenimiento que no se puede descomponer no se puede discutir — y este se va a
// discutir cada dos semanas contra la báscula.
function maintenanceKcal({ ffmKg, bodyweightKg, steps, eee, kcalIn }) {
  const bmr = bmrKatchMcArdle(ffmKg);
  const kg = Number(bodyweightKg) || 87;
  const neatBase = Math.round(bmr * (NUT_NEAT_BASE_FACTOR - 1));
  const neatSteps = Math.round((Number(steps) || 0) * NUT_KCAL_PER_STEP_PER_KG * kg);
  const exercise = Math.round(Number(eee) || 0);
  const tef = Math.round((Number(kcalIn) || 0) * NUT_TEF_FRACTION);
  return {
    total: bmr + neatBase + neatSteps + exercise + tef,
    bmr, neatBase, neatSteps, exercise, tef,
  };
}

// ==================== CALIBRACIÓN DEL MANTENIMIENTO ====================
//
// Compara el cambio de peso PREDICHO por el balance energético con el REAL de la báscula.
// Si difieren de forma sostenida, el que miente es el mantenimiento modelado — la báscula
// no negocia.
//
// Mejora sobre Caltrack, que hace lo mismo contra el gasto de Whoop: los dos extremos usan
// medias móviles de 3 días. Con pesadas puntuales, 400 g de agua contaminan el veredicto.
//
// Y no emite veredicto cuando la discrepancia cae bajo el ruido: con 14 días y ±0,3 kg de
// error residual en las medias, el suelo de detección ronda ±165 kcal/día. Un "tu
// mantenimiento está 40 kcal alto" sería ruido disfrazado de precisión.
//
// El veredicto se lee así:
//   'sobreestima'  perdiste MENOS de lo predicho → el mantenimiento real es MÁS BAJO
//   'subestima'    perdiste MÁS de lo predicho   → el mantenimiento real es MÁS ALTO
//   'calibrado'    la discrepancia no supera el ruido

function maintenanceCorrection(cal) {
  if (!cal || !cal.ok || cal.veredicto === 'calibrado') return null;
  // El error en kcal/día es directamente cuánto hay que corregir el mantenimiento.
  return -cal.errorKcalDia;
}

// ==================== AGREGADO DEL DÍA ====================
//
// Suma los items de todas las comidas de una fecha. Único sitio donde se calculan
// los totales: si esta función y la UI discrepan alguna vez, es porque alguien
// sumó por su cuenta en otro lado.

function aggregateMeals(meals) {
  const acc = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, alcohol: 0,
                kcalNova12: 0, mealCount: 0, itemCount: 0, estimatedItems: 0 };
  // F-21: la proteína de cada comida por separado. El total diario ya se cumple casi
  // siempre; lo que decide la síntesis proteica es la DOSIS por comida (umbral de leucina,
  // 30-50 g), y 185 g en dos comidas no es lo mismo que en cuatro.
  const porComida = [];
  for (const m of meals || []) {
    acc.mealCount++;
    let pm = 0;
    for (const it of m.items || []) {
      const kcal = Number(it.kcal) || 0;
      acc.itemCount++;
      acc.calories += kcal;
      acc.protein += Number(it.protein) || 0;
      acc.carbs   += Number(it.carbs) || 0;
      acc.fat     += Number(it.fat) || 0;
      acc.fiber   += Number(it.fiber) || 0;
      acc.alcohol += Number(it.alcohol) || 0;
      if (it.nova === 1 || it.nova === 2) acc.kcalNova12 += kcal;
      if (it.estimated) acc.estimatedItems++;
      pm += Number(it.protein) || 0;
    }
    porComida.push(Math.round(pm));
  }
  // % de las calorías del día que vienen de alimentos sin procesar o mínimamente
  // procesados. null y no 0 cuando no se comió nada: 0% sería mentir.
  acc.nova12Pct = acc.calories > 0 ? Math.round((acc.kcalNova12 / acc.calories) * 100) : null;
  ['calories', 'protein', 'carbs', 'fat', 'fiber', 'alcohol'].forEach(k => { acc[k] = Math.round(acc[k]); });
  // F-21. `null` y no 0 sin comidas: 0 g/comida sería mentir igual que el 0 % de NOVA.
  acc.proteinPerMeal = porComida.slice();
  acc.proteinPerMealAvg = porComida.length ? Math.round(acc.protein / porComida.length) : null;
  acc.mealsUnderProteinMin = porComida.filter(g => g < NUT_PROTEIN_MEAL_MIN).length;
  return acc;
}

// ==================== GUARDARRAÍL DE ADHERENCIA ====================
//
// La razón de ser de esta función: el registro de comida ya se abandonó dos veces.
// En vez de fingir que esta vez será distinto, el sistema mide su propia adherencia
// y lo dice en pantalla. Con menos de 10/14 días registrados, la decisión de
// calorías vuelve a la regla de pendiente de peso de nutrition-notes.md, que
// funciona sin registrar nada.

function adherenceMode(days, todayStr) {
  const end = todayStr;
  const start = nutShiftDate(end, -(NUT_ADHERENCE_WINDOW - 1));
  const logged = (days || []).filter(d =>
    d.date >= start && d.date <= end && d.loggedV2 && (d.mealCount || 0) > 0
  ).length;
  return {
    logged,
    window: NUT_ADHERENCE_WINDOW,
    perWeek: Math.round((logged / NUT_ADHERENCE_WINDOW) * 7),
    pilot: logged >= NUT_ADHERENCE_MIN ? 'tracker' : 'peso',
  };
}

// ==================== DÉFICIT SEMANAL Y RACHA ====================

function weeklyDeficits(days) {
  const byWeek = new Map();
  for (const d of days || []) {
    if (!d.loggedV2 || !d.calories) continue;
    const wk = nutIsoWeekStart(d.date);
    if (!byWeek.has(wk)) byWeek.set(wk, { weekStart: wk, days: 0, kcal: 0, target: 0 });
    const w = byWeek.get(wk);
    w.days++;
    w.kcal += d.calories;
    w.target += d.kcalTarget || NUT_KCAL_REST;
  }
  return [...byWeek.values()].map(w => ({
    weekStart: w.weekStart,
    days: w.days,
    avgKcal: Math.round(w.kcal / w.days),
    avgTarget: Math.round(w.target / w.days),
    // Déficit medio frente al objetivo del día, no frente a un mantenimiento fijo:
    // el objetivo ya cicla 2.700/2.400 según haya sesión.
    avgDeficit: Math.round((w.kcal - w.target) / w.days),
  })).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

// Racha de días consecutivos por debajo del objetivo, hacia atrás desde hoy.
// Un día sin registrar CORTA la racha: si no lo mediste, no cuenta.
function deficitStreak(days, todayStr) {
  const byDate = new Map((days || []).map(d => [d.date, d]));
  let current = 0, cursor = todayStr;
  // El día en curso solo cuenta si ya está por debajo; si no, se empieza en ayer
  // para no romper la racha a las 9 de la mañana.
  const hoy = byDate.get(todayStr);
  if (!(hoy && hoy.loggedV2 && hoy.calories && hoy.calories <= (hoy.kcalTarget || NUT_KCAL_REST))) {
    cursor = nutShiftDate(todayStr, -1);
  }
  while (true) {
    const d = byDate.get(cursor);
    if (!d || !d.loggedV2 || !d.calories) break;
    if (d.calories > (d.kcalTarget || NUT_KCAL_REST)) break;
    current++;
    cursor = nutShiftDate(cursor, -1);
  }
  // Mejor racha histórica y déficit medio de la racha en curso.
  const sorted = (days || []).filter(d => d.loggedV2 && d.calories)
    .sort((a, b) => a.date.localeCompare(b.date));
  let best = 0, run = 0, prev = null;
  for (const d of sorted) {
    const consecutive = prev == null || d.date === nutShiftDate(prev, 1);
    const under = d.calories <= (d.kcalTarget || NUT_KCAL_REST);
    run = under ? (consecutive ? run + 1 : 1) : 0;
    if (run > best) best = run;
    prev = d.date;
  }
  return { current, best: Math.max(best, current) };
}

// ==================== CALIBRACIÓN DEL WEARABLE ====================
//
// La pieza más inteligente de Caltrack, y la única que audita el dato en vez de
// creerlo: compara el cambio de peso PREDICHO por el balance energético con el
// cambio REAL de la báscula. Si difieren de forma sostenida, el que miente es el
// gasto estimado del wearable, no la báscula.
//
// Mejora sobre Caltrack: los dos extremos usan medias móviles de 3 días. Con
// pesadas puntuales, 400 g de agua contaminan el veredicto entero.
//
// CUIDADO: es una tendencia, no una medición. Con 14 días y ±0,3 kg de ruido
// residual el error implícito ronda ±165 kcal/día, así que solo se emite veredicto
// cuando la discrepancia supera ese ruido (NUT_CALIB_MIN_SIGNAL).

const NUT_CALIB_WINDOW = 14;
const NUT_CALIB_MIN_SIGNAL = 150;       // kcal/día por debajo de esto: no hay señal

function wearableCalibration(days, weights, todayStr) {
  const end = todayStr;
  const start = nutShiftDate(end, -(NUT_CALIB_WINDOW - 1));

  const inWindow = (days || []).filter(d =>
    d.date >= start && d.date <= end && d.loggedV2 && d.calories && d.burn
  );
  if (inWindow.length < 10) {
    return { ok: false, reason: 'pocos-datos', have: inWindow.length, need: 10 };
  }

  const balance = inWindow.reduce((s, d) => s + (d.calories - d.burn), 0);
  const predichoKg = balance / NUT_KCAL_PER_KG;

  const wNow = nutRollingWeight(weights, end, 3);
  const wThen = nutRollingWeight(weights, start, 3);
  if (wNow == null || wThen == null) {
    return { ok: false, reason: 'sin-peso' };
  }
  const realKg = wNow - wThen;

  // Si perdiste MENOS de lo predicho, el gasto real es menor que el declarado.
  const errorKcalDia = ((realKg - predichoKg) * NUT_KCAL_PER_KG) / inWindow.length;

  let veredicto;
  if (Math.abs(errorKcalDia) < NUT_CALIB_MIN_SIGNAL) veredicto = 'calibrado';
  else if (errorKcalDia > 0) veredicto = 'sobreestima';   // el wearable infla el gasto
  else veredicto = 'subestima';

  return {
    ok: true,
    days: inWindow.length,
    start, end,
    predichoKg: Number(predichoKg.toFixed(2)),
    realKg: Number(realKg.toFixed(2)),
    errorKcalDia: Math.round(errorKcalDia),
    veredicto,
  };
}

// Media móvil de peso centrada en una fecha, mirando `win` días hacia atrás.
// Devuelve null si no hay ninguna pesada en la ventana: mejor sin dato que inventado.
function nutRollingWeight(weights, dateStr_, win) {
  const from = nutShiftDate(dateStr_, -(win - 1));
  const vals = (weights || [])
    .filter(w => w.date >= from && w.date <= dateStr_ && Number(w.weight) > 0)
    .map(w => Number(w.weight));
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ==================== COACH "RESTO DEL DÍA" ====================
//
// Determinista y offline: NO llama al LLM. Con la biblioteca `foods` poblada no
// hace falta — el hueco de proteína y calorías se cierra buscando entre los
// alimentos que el usuario ya come. Instantáneo, gratis, y no propone nada que
// no esté en su cocina. Caltrack gasta una llamada de IA para esto.

function restOfDay(day, foods, opts) {
  const o = opts || {};
  const huecoKcal = (day.kcalTarget || NUT_KCAL_REST) - (day.calories || 0);
  const huecoProt = (day.proteinFloor || NUT_PROTEIN_FLOOR) - (day.protein || 0);

  if (huecoProt <= 0) {
    return { done: true, huecoKcal, huecoProt, sugerencias: [] };
  }

  // Candidatos: densidad proteica suficiente para cerrar el hueco sin gastar todo
  // el presupuesto calórico. Se excluye lo no verificado para no proponer al
  // usuario un gramaje basado en macros que estimó una foto.
  const cand = (foods || [])
    .filter(f => f.verified !== false && proteinDensity(f) >= 8 && (Number(f.protein100) || 0) > 0)
    .map(f => ({ food: f, pd: proteinDensity(f), score: foodScore(f) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, o.pool || 25);

  const sugerencias = [];
  for (const c of cand) {
    // Gramos necesarios para cerrar el hueco de proteína con este alimento solo,
    // redondeados a 10 g (nadie pesa 137 g de pollo).
    const gramos = Math.round((huecoProt / (Number(c.food.protein100) || 1)) * 100 / 10) * 10;
    if (gramos <= 0) continue;
    const kcal = Math.round((Number(c.food.kcal100) || 0) * gramos / 100);
    if (kcal > huecoKcal) continue;             // no cabe en el presupuesto
    if (gramos > (o.maxGrams || 400)) continue; // ración irreal
    sugerencias.push({
      foodId: c.food.id, name: c.food.name, grams: gramos, kcal,
      protein: Math.round((Number(c.food.protein100) || 0) * gramos / 100),
      score: c.score,
    });
    if (sugerencias.length >= (o.limit || 3)) break;
  }

  return { done: false, huecoKcal, huecoProt: Math.round(huecoProt), sugerencias };
}

// ==================== UTILIDADES DE FECHA ====================
//
// Aritmética en UTC a propósito. La app ya sufrió una migración por fechas
// desplazadas (tz_date_migration_v2); construir Date desde 'YYYY-MM-DD' y sumar
// días en local vuelve a pisar ese charco en los cambios de horario.

function nutShiftDate(dateStr_, deltaDays) {
  const [y, m, d] = dateStr_.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + deltaDays * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

// Lunes de la semana ISO a la que pertenece la fecha.
function nutIsoWeekStart(dateStr_) {
  const [y, m, d] = dateStr_.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay() || 7;   // domingo = 7, no 0
  return nutShiftDate(dateStr_, -(dow - 1));
}

// ==================== SEMILLA DE LA BIBLIOTECA ====================
//
// `PROTEIN_DB` (app.js) tenía 28 alimentos con proteína POR RACIÓN y sin kcal, carbos ni
// grasa: servía para autocompletar un número, no para calcular un día. Esta semilla lo
// sustituye con macros por 100 g, que es la única base sobre la que la foto puede estimar
// solo GRAMOS y acertar.
//
// `verified: false` en todos: son valores de tabla de composición, no de la etiqueta del
// producto que compra el usuario. Al confirmar un gramaje en la app el alimento se puede
// marcar verificado, y solo entonces el coach "resto del día" lo propone.
//
// Nombres en español y con los básicos de Mercadona porque es donde compra; se conservan
// los platos argentinos que ya estaban en PROTEIN_DB.
// Convencion USDA: `carbs100` INCLUYE la fibra (no la suma aparte), y `alcohol100` es el
// cuarto macro, a 7 kcal/g. Sin ese campo las kcal del vino y la cerveza no cuadrarian con
// 4P+4C+9F y el desglose del dia mentiria. tests/verify-nutrition-v2.mjs lo comprueba.
// NOVA según Monteiro: 1 sin procesar, 2 ingredientes culinarios, 3 procesado,
// 4 ultraprocesado. El atún en lata y el fiambre de pavo son 3 aunque sean buena proteína;
// la whey es 4 aunque tenga 80 g de proteína. La fórmula lo dice y así debe ser.

const FOODS_SEED = [
  // — Proteína animal —
  { id: 'pechuga-pollo', name: 'Pechuga de pollo', aliases: ['pollo', 'pollo a la plancha', 'chicken breast'], kcal100: 165, protein100: 31, carbs100: 0, fat100: 3.6, fiber100: 0, nova: 1 },
  { id: 'pechuga-pavo', name: 'Pechuga de pavo', aliases: ['pavo'], kcal100: 147, protein100: 29, carbs100: 0, fat100: 2.5, fiber100: 0, nova: 1 },
  { id: 'ternera-magra', name: 'Ternera magra', aliases: ['ternera', 'filete', 'steak'], kcal100: 217, protein100: 26, carbs100: 0, fat100: 12, fiber100: 0, nova: 1 },
  { id: 'carne-picada-5', name: 'Carne picada 5% grasa', aliases: ['carne picada', 'ground beef'], kcal100: 137, protein100: 21, carbs100: 0, fat100: 5, fiber100: 0, nova: 1 },
  { id: 'lomo-cerdo', name: 'Lomo de cerdo', aliases: ['cerdo', 'pork'], kcal100: 143, protein100: 22, carbs100: 0, fat100: 6, fiber100: 0, nova: 1 },
  { id: 'salmon', name: 'Salmón', aliases: ['salmon'], kcal100: 208, protein100: 20, carbs100: 0, fat100: 13, fiber100: 0, nova: 1 },
  { id: 'merluza', name: 'Merluza', aliases: ['pescado blanco'], kcal100: 86, protein100: 17, carbs100: 0, fat100: 2, fiber100: 0, nova: 1 },
  { id: 'gambas', name: 'Gambas', aliases: ['langostinos', 'shrimp'], kcal100: 99, protein100: 24, carbs100: 0.2, fat100: 0.3, fiber100: 0, nova: 1 },
  { id: 'huevo', name: 'Huevo entero', aliases: ['huevos', 'egg', 'eggs'], kcal100: 143, protein100: 13, carbs100: 0.7, fat100: 9.5, fiber100: 0, nova: 1 },
  { id: 'clara-huevo', name: 'Clara de huevo', aliases: ['claras'], kcal100: 52, protein100: 11, carbs100: 0.7, fat100: 0.2, fiber100: 0, nova: 1 },
  { id: 'atun-lata', name: 'Atún en lata al natural', aliases: ['atun', 'tuna'], kcal100: 116, protein100: 26, carbs100: 0, fat100: 1, fiber100: 0, nova: 3 },
  { id: 'fiambre-pavo', name: 'Fiambre de pavo', aliases: ['pavo lonchas'], kcal100: 110, protein100: 18, carbs100: 2, fat100: 3, fiber100: 0, nova: 3 },

  // — Lácteos —
  { id: 'skyr', name: 'Skyr natural', aliases: ['skyr desnatado'], kcal100: 63, protein100: 11, carbs100: 4, fat100: 0.2, fiber100: 0, nova: 1 },
  { id: 'yogur-griego', name: 'Yogur griego natural', aliases: ['yogur griego', 'greek yogurt'], kcal100: 97, protein100: 9, carbs100: 4, fat100: 5, fiber100: 0, nova: 1 },
  { id: 'queso-batido-0', name: 'Queso fresco batido 0%', aliases: ['queso batido'], kcal100: 47, protein100: 8, carbs100: 4, fat100: 0.2, fiber100: 0, nova: 1 },
  { id: 'requeson', name: 'Requesón', aliases: ['cottage', 'cottage cheese'], kcal100: 98, protein100: 11, carbs100: 3.4, fat100: 4.3, fiber100: 0, nova: 1 },
  { id: 'leche-semi', name: 'Leche semidesnatada', aliases: ['leche'], kcal100: 46, protein100: 3.3, carbs100: 4.8, fat100: 1.6, fiber100: 0, nova: 1 },
  { id: 'queso-curado', name: 'Queso curado', aliases: ['queso'], kcal100: 402, protein100: 25, carbs100: 1.3, fat100: 33, fiber100: 0, nova: 3 },
  { id: 'whey', name: 'Proteína whey (polvo)', aliases: ['proteina', 'batido de proteina', 'protein shake', 'whey'], kcal100: 380, protein100: 80, carbs100: 8, fat100: 4, fiber100: 0, nova: 4 },

  // — Legumbres y proteína vegetal —
  { id: 'lentejas', name: 'Lentejas cocidas', aliases: ['lentejas', 'lentils'], kcal100: 116, protein100: 9, carbs100: 20, fat100: 0.4, fiber100: 8, nova: 1 },
  { id: 'garbanzos', name: 'Garbanzos cocidos', aliases: ['garbanzos', 'chickpeas'], kcal100: 164, protein100: 9, carbs100: 27, fat100: 2.6, fiber100: 8, nova: 1 },
  { id: 'tofu', name: 'Tofu firme', aliases: ['tofu'], kcal100: 144, protein100: 15, carbs100: 3, fat100: 9, fiber100: 2, nova: 3 },
  { id: 'edamame', name: 'Edamame', aliases: [], kcal100: 121, protein100: 12, carbs100: 9, fat100: 5, fiber100: 5, nova: 1 },

  // — Carbohidratos —
  { id: 'arroz-basmati', name: 'Arroz basmati cocido', aliases: ['arroz', 'rice'], kcal100: 130, protein100: 2.7, carbs100: 28, fat100: 0.3, fiber100: 0.4, nova: 1 },
  { id: 'pasta', name: 'Pasta cocida', aliases: ['pasta', 'macarrones', 'espaguetis'], kcal100: 158, protein100: 6, carbs100: 31, fat100: 0.9, fiber100: 1.8, nova: 3 },
  { id: 'patata', name: 'Patata cocida', aliases: ['patata', 'patatas'], kcal100: 87, protein100: 2, carbs100: 20, fat100: 0.1, fiber100: 1.8, nova: 1 },
  { id: 'boniato', name: 'Boniato', aliases: ['batata'], kcal100: 90, protein100: 2, carbs100: 21, fat100: 0.2, fiber100: 3.3, nova: 1 },
  { id: 'avena', name: 'Avena', aliases: ['copos de avena', 'oats', 'porridge'], kcal100: 379, protein100: 13, carbs100: 67, fat100: 7, fiber100: 10, nova: 1 },
  { id: 'pan-integral', name: 'Pan integral', aliases: ['pan'], kcal100: 247, protein100: 13, carbs100: 41, fat100: 3.4, fiber100: 7, nova: 3 },
  { id: 'quinoa', name: 'Quinoa cocida', aliases: [], kcal100: 120, protein100: 4.4, carbs100: 21, fat100: 1.9, fiber100: 2.8, nova: 1 },

  // — Fruta y verdura —
  { id: 'brocoli', name: 'Brócoli', aliases: ['brocoli'], kcal100: 34, protein100: 2.8, carbs100: 7, fat100: 0.4, fiber100: 2.6, nova: 1 },
  { id: 'espinacas', name: 'Espinacas', aliases: ['espinaca'], kcal100: 23, protein100: 2.9, carbs100: 3.6, fat100: 0.4, fiber100: 2.2, nova: 1 },
  { id: 'ensalada-mixta', name: 'Ensalada mixta', aliases: ['ensalada', 'lechuga'], kcal100: 20, protein100: 1.4, carbs100: 3, fat100: 0.2, fiber100: 1.8, nova: 1 },
  { id: 'tomate', name: 'Tomate', aliases: ['tomates'], kcal100: 18, protein100: 0.9, carbs100: 3.9, fat100: 0.2, fiber100: 1.2, nova: 1 },
  { id: 'pimiento', name: 'Pimiento', aliases: [], kcal100: 31, protein100: 1, carbs100: 6, fat100: 0.3, fiber100: 2.1, nova: 1 },
  { id: 'champinones', name: 'Champiñones', aliases: ['champinones', 'setas'], kcal100: 22, protein100: 3.1, carbs100: 3.3, fat100: 0.3, fiber100: 1, nova: 1 },
  { id: 'platano', name: 'Plátano', aliases: ['banana', 'platano'], kcal100: 89, protein100: 1.1, carbs100: 23, fat100: 0.3, fiber100: 2.6, nova: 1 },
  { id: 'manzana', name: 'Manzana', aliases: [], kcal100: 52, protein100: 0.3, carbs100: 14, fat100: 0.2, fiber100: 2.4, nova: 1 },
  { id: 'fresas', name: 'Fresas', aliases: ['strawberries'], kcal100: 32, protein100: 0.7, carbs100: 7.7, fat100: 0.3, fiber100: 2, nova: 1 },
  { id: 'arandanos', name: 'Arándanos', aliases: ['arandanos', 'blueberries'], kcal100: 57, protein100: 0.7, carbs100: 14, fat100: 0.3, fiber100: 2.4, nova: 1 },
  { id: 'aguacate', name: 'Aguacate', aliases: ['avocado'], kcal100: 160, protein100: 2, carbs100: 9, fat100: 15, fiber100: 7, nova: 1 },

  // — Grasas —
  { id: 'aove', name: 'Aceite de oliva virgen extra', aliases: ['aceite de oliva', 'aceite', 'aove'], kcal100: 884, protein100: 0, carbs100: 0, fat100: 100, fiber100: 0, nova: 2 },
  { id: 'almendras', name: 'Almendras', aliases: ['almonds', 'frutos secos'], kcal100: 579, protein100: 21, carbs100: 22, fat100: 50, fiber100: 12.5, nova: 1 },
  { id: 'crema-cacahuete', name: 'Crema de cacahuete', aliases: ['mantequilla de cacahuete', 'peanut butter'], kcal100: 588, protein100: 25, carbs100: 20, fat100: 50, fiber100: 6, nova: 3 },

  // — Platos argentinos (venían de PROTEIN_DB) —
  { id: 'bife-chorizo', name: 'Bife de chorizo', aliases: ['bife'], kcal100: 250, protein100: 25, carbs100: 0, fat100: 17, fiber100: 0, nova: 1 },
  { id: 'milanesa', name: 'Milanesa de ternera', aliases: ['milanesa'], kcal100: 220, protein100: 18, carbs100: 12, fat100: 11, fiber100: 0.8, nova: 3 },
  { id: 'empanada-carne', name: 'Empanada de carne', aliases: ['empanada', 'empanadas'], kcal100: 265, protein100: 9, carbs100: 28, fat100: 13, fiber100: 1.5, nova: 3 },

  // — Lo que acaba en "alimentos a evitar" —
  { id: 'barrita-proteina', name: 'Barrita de proteína', aliases: ['barrita', 'protein bar'], kcal100: 350, protein100: 30, carbs100: 35, fat100: 10, fiber100: 5, nova: 4 },
  { id: 'chocolate-85', name: 'Chocolate negro 85%', aliases: ['chocolate'], kcal100: 592, protein100: 10, carbs100: 19, fat100: 50, fiber100: 11, nova: 4 },
  { id: 'pizza', name: 'Pizza', aliases: ['pizza pepperoni'], kcal100: 266, protein100: 11, carbs100: 33, fat100: 10, fiber100: 2.3, nova: 4 },
  { id: 'patatas-fritas-bolsa', name: 'Patatas fritas de bolsa', aliases: ['chips'], kcal100: 536, protein100: 6.6, carbs100: 53, fat100: 34, fiber100: 4.4, nova: 4 },
  { id: 'helado', name: 'Helado', aliases: [], kcal100: 207, protein100: 3.5, carbs100: 24, fat100: 11, fiber100: 0.7, nova: 4 },
  { id: 'cerveza', name: 'Cerveza', aliases: ['beer'], kcal100: 43, protein100: 0.5, carbs100: 3.6, fat100: 0, fiber100: 0, alcohol100: 3.9, nova: 3 },
  { id: 'vino-tinto', name: 'Vino tinto', aliases: ['vino'], kcal100: 85, protein100: 0.1, carbs100: 2.6, fat100: 0, fiber100: 0, alcohol100: 10.6, nova: 3 },
  { id: 'refresco-azucar', name: 'Refresco azucarado', aliases: ['coca-cola', 'cocacola', 'coca cola'], kcal100: 42, protein100: 0, carbs100: 10.6, fat100: 0, fiber100: 0, nova: 4 },
];

// ==================== NORMALIZACIÓN Y RESOLUCIÓN DE ALIMENTOS ====================
//
// Sin esto, "Pollo", "pollo a la plancha" y "POLLO" serían tres alimentos distintos y el
// leaderboard se llenaría de duplicados — el problema que Caltrack resuelve fusionando
// variantes de nombre. Se quitan los acentos porque el usuario teclea y la IA responde
// con y sin ellos indistintamente.

function nutNormalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nutSlug(s) {
  return nutNormalize(s).replace(/\s+/g, '-').slice(0, 48) || ('food-' + Date.now());
}

// Busca en la biblioteca por nombre canónico o alias normalizado. Devuelve null si no hay
// coincidencia exacta: NO adivina por parecido, porque asignar el alimento equivocado
// falsea los macros en silencio, y eso es peor que preguntar.
function findFood(foods, name) {
  const n = nutNormalize(name);
  if (!n) return null;
  for (const f of foods || []) {
    if (nutNormalize(f.name) === n) return f;
    if ((f.aliases || []).some(a => nutNormalize(a) === n)) return f;
  }
  return null;
}

// Calcula los macros de una cantidad concreta de un alimento. Único sitio donde se hace
// la regla de tres gramos→macros.
function itemFromFood(food, grams, extra) {
  const g = Number(grams) || 0;
  const per = (v) => Math.round(((Number(v) || 0) * g / 100) * 10) / 10;
  return {
    foodId: food.id,
    name: food.name,
    grams: g,
    kcal: Math.round(((Number(food.kcal100) || 0) * g) / 100),
    protein: per(food.protein100),
    carbs: per(food.carbs100),
    fat: per(food.fat100),
    fiber: per(food.fiber100),
    alcohol: per(food.alcohol100),
    nova: food.nova || 3,
    ...(extra || {}),
  };
}

// ==================== MEDIDAS, USO Y CHIPS (v11.76) ====================
//
// EL PROBLEMA QUE ESTO RESUELVE. Hasta aquí la biblioteca era SÓLO por 100 g y el registro
// tenía un solo embudo: foto → hoja → saveMeal. Eso hacía caro justo lo que más se repite:
// un batido de whey pedía teclear "30" cada vez, y el mismo bowl de Honest Greens —que se
// repite cuatro o cinco veces al mes— pedía sacarle una foto por quinta vez.
//
// LA DECISIÓN DE DISEÑO, y lo que NO cambia: los macros por 100 g siguen siendo la única
// verdad. Una medida (`serving`) es un MULTIPLICADOR sobre ellos, nunca un segundo juego de
// macros. Si un día alguien guarda "kcal por ración" junto a "kcal por 100 g", los dos
// números se separan en cuanto se corrija uno, y el total del día deja de cuadrar con la
// suma de sus comidas. Lo que persiste en `meals` siguen siendo GRAMOS.
//
// MIGRACIÓN PEREZOSA: una fila sin `serving` (todas las que ya están en el teléfono) se
// comporta exactamente como antes — 100 g. No hay script de migración ni versión de esquema
// que subir; el lector resuelve el respaldo.
//
// Esquema que gana `foods` (todo opcional):
//   serving    { label, grams }   la medida normal en la que viene ('1 scoop' → 30 g)
//   servings   [{ label, grams }] cuando hay más de una ('1 scoop' y '2 scoops')
//   photoPath  string             la foto del plato guardado desde el camino A
//   useCount   number             veces registrado. Antes se recalculaba escaneando TODAS
//   useKcal    number             las comidas en cada pintado del ranking; ahora es un campo
//   lastUsedAt string             la última vez, para la sección Recent del picker

const NUT_DEFAULT_SERVING = { label: '100 g', grams: 100 };
const NUT_PICKER_SECTION_MAX = 6;   // filas por sección antes de "el resto"

/** Todas las medidas de un alimento, la por defecto primero. Sin ninguna, 100 g. */
function foodServings(food) {
  const limpias = [];
  const add = (s) => {
    const g = Number(s && s.grams) || 0;
    const label = String((s && s.label) || '').trim();
    if (g <= 0 || !label) return;
    if (limpias.some(x => x.label === label && x.grams === g)) return;
    limpias.push({ label, grams: g });
  };
  add(food && food.serving);
  for (const s of (food && food.servings) || []) add(s);
  return limpias.length ? limpias : [{ ...NUT_DEFAULT_SERVING }];
}

function foodServing(food, idx) {
  const todas = foodServings(food);
  const i = Math.min(Math.max(Number(idx) || 0, 0), todas.length - 1);
  return todas[i];
}

/** Gramos que persisten en la comida para `qty` medidas. Lo único que se guarda. */
function servingGrams(food, idx, qty) {
  const n = Number(qty) > 0 ? Number(qty) : 1;
  return Math.round(foodServing(food, idx).grams * n);
}

/** Qué cuesta esa cantidad, para poder decidir en la fila del picker sin abrir nada. */
function servingCost(food, idx, qty) {
  const s = foodServing(food, idx);
  const n = Number(qty) > 0 ? Number(qty) : 1;
  const grams = servingGrams(food, idx, n);
  return {
    label: s.label, qty: n, grams,
    kcal: Math.round(((Number(food && food.kcal100) || 0) * grams) / 100),
    protein: Math.round(((Number(food && food.protein100) || 0) * grams) / 100),
  };
}

/** "1 scoop · 30 g · 114 kcal · 24 g P" — la medida y lo que cuesta, en una línea. */
function nutServingLine(food, idx, qty) {
  const c = servingCost(food, idx, qty);
  const medida = c.qty === 1 ? c.label : `${c.qty} × ${c.label}`;
  // Con la medida por defecto (100 g) la etiqueta YA son los gramos: no se dicen dos veces.
  const gramos = (c.qty === 1 && c.label === `${c.grams} g`) ? '' : `${c.grams} g · `;
  return `${medida} · ${gramos}${nutFmt(c.kcal)} kcal · ${c.protein} g P`;
}

/**
 * Veces y kcal por alimento a partir de las comidas. Se usa SÓLO para el backfill de las
 * filas viejas: a partir de v11.76 el dato es un campo que mantiene `saveMeal`.
 */
function nutFoodUsageMap(meals) {
  const mapa = new Map();
  for (const m of meals || []) {
    const cuando = `${m.date || ''}${m.time ? 'T' + m.time : ''}`;
    for (const it of (m && m.items) || []) {
      // El respaldo por nombre es el mismo que usaba el ranking antes de v11.76: sin él, el
      // backfill contaría MENOS que la tabla que sustituye y el histórico parecería encogerse.
      const k = (it && it.foodId) || (it && it.name ? nutSlug(it.name) : null);
      if (!k) continue;
      const u = mapa.get(k) || { count: 0, kcal: 0, lastUsedAt: null };
      u.count++;
      u.kcal += Number(it.kcal) || 0;
      if (cuando && (!u.lastUsedAt || cuando > u.lastUsedAt)) u.lastUsedAt = cuando;
      mapa.set(k, u);
    }
  }
  return mapa;
}

/**
 * Suma (o resta, al borrar una comida) un uso a un alimento. Puro: devuelve la fila nueva.
 * `lastUsedAt` sólo avanza al sumar — borrar una comida no puede mover la última vez hacia
 * el futuro, que es como Recent acabaría lleno de lo que ya no comes.
 */
function nutBumpFood(food, delta, when, kcal) {
  const d = Number(delta) || 0;
  const out = {
    ...food,
    useCount: Math.max(0, (Number(food && food.useCount) || 0) + d),
    useKcal: Math.max(0, Math.round((Number(food && food.useKcal) || 0) + d * (Number(kcal) || 0))),
  };
  if (d > 0 && when) out.lastUsedAt = String(when);
  return out;
}

/**
 * Las secciones del picker. Función pura porque es la decisión que hace o deshace el camino
 * B: si lo que comes a diario no está en las tres primeras filas, vuelves a la foto.
 *
 *   con búsqueda  → una sola lista de coincidencias (nombre o alias), lo más usado primero
 *   sin búsqueda  → Recent (por `lastUsedAt`) · Frequent (por `useCount`) · el resto por score
 */
function nutPickerSections(foods, query) {
  const lib = (foods || []).filter(f => f && f.id && f.name);
  const q = nutNormalize(query);

  if (q) {
    const matches = lib
      .filter(f => nutNormalize(f.name).includes(q)
        || (f.aliases || []).some(a => nutNormalize(a).includes(q)))
      .sort((a, b) => (Number(b.useCount) || 0) - (Number(a.useCount) || 0)
        || foodScore(b) - foodScore(a))
      .slice(0, 40);
    return { query: q, matches, recent: [], frequent: [], rest: [] };
  }

  const recent = lib.filter(f => f.lastUsedAt)
    .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
    .slice(0, NUT_PICKER_SECTION_MAX);
  const enRecent = new Set(recent.map(f => f.id));
  const frequent = lib.filter(f => (Number(f.useCount) || 0) > 0 && !enRecent.has(f.id))
    .sort((a, b) => (Number(b.useCount) || 0) - (Number(a.useCount) || 0))
    .slice(0, NUT_PICKER_SECTION_MAX);
  const arriba = new Set([...enRecent, ...frequent.map(f => f.id)]);
  const rest = lib.filter(f => !arriba.has(f.id)).sort((a, b) => foodScore(b) - foodScore(a));
  return { query: '', matches: [], recent, frequent, rest };
}

/**
 * LOS CHIPS DEL CAMINO C, y por qué son EXACTAMENTE estos cinco.
 *
 * Describir una comida por texto falla casi siempre por lo mismo, y no es por no saber qué
 * comiste. Cada chip es el dato que más mueve el número, atado a la regla que lo consume:
 *
 *   Cantidad   el primer factor de error, por encima de QUÉ era. Peso o medida casera.
 *   Cocción    la misma pechuga a la plancha o salteada difieren ~150 kcal (REC-002)
 *   Proteína   el suelo no negociable, 1,6-2,2 g/kg, y se juzga POR COMIDA, 30-50 g (REC-001)
 *   Sitio      fuera se cocina con más aceite y más sal; el sesgo es sistemático (REC-002)
 *   Bebida     el alcohol es la cuarta macro y ya se modela aparte (REC-002)
 *
 * La hora y el tipo de día NO son chips: el cliente ya los sabe (`nutDayType`) y los añade
 * solo. Preguntar por un dato que ya tienes es fricción, y la fricción es lo que hundió el
 * registro dos veces.
 *
 * Los chips sólo ESCRIBEN TEXTO en la nota. El contrato del servidor (`body.note`) no cambia.
 */
const NUT_CHIP_DEFS = [
  {
    key: 'portion', label: 'Portion', icon: '🖐', rule: 'all', custom: 'weight',
    options: ['1 palm', '2 palms', '1 fist', '1 cupped hand', '1 handful',
              '1 cup', 'half a plate', '1 full plate', '1 bowl'],
  },
  {
    key: 'cooking', label: 'Cooking', icon: '🔥', rule: 'REC-002',
    options: ['grilled, no oil', 'grilled, a little oil', 'pan-fried in oil', 'deep-fried',
              'boiled or steamed', 'baked', 'raw', 'with butter', 'with a creamy sauce'],
  },
  {
    key: 'protein', label: 'Protein', icon: '🥩', rule: 'REC-001',
    options: ['chicken or turkey', 'beef or pork', 'fish or seafood', 'eggs',
              'dairy or whey', 'legumes or tofu', 'no protein source'],
    // Segundo toque: la fuente sin la cantidad no sirve para juzgar los 30-50 g por comida.
    amounts: ['~80 g', '~120 g', '~150 g', '~200 g', '1 palm', '2 palms', '1 scoop', 'not sure'],
  },
  {
    key: 'place', label: 'Place', icon: '📍', rule: 'REC-002',
    options: ['home-cooked', 'restaurant', 'takeaway', 'canteen or work', 'packaged food'],
  },
  {
    key: 'drink', label: 'Drink', icon: '🥤', rule: 'REC-002',
    options: ['water', 'coffee or tea, no sugar', 'soft drink', 'diet soft drink',
              'beer 330 ml', 'wine, 1 glass', 'spirits, 1 measure', 'nothing'],
  },
];

/**
 * La línea estructurada que los chips añaden a la nota. SU FORMATO ES UN CONTRATO: el
 * prompt del servidor la lee por este prefijo, así que cambiarlo aquí sin cambiarlo allí
 * deja los datos dentro de la nota pero fuera de lo que el modelo sabe interpretar.
 */
function nutChipLine(chips, auto) {
  const c = chips || {};
  const partes = [];
  for (const def of NUT_CHIP_DEFS) {
    const v = c[def.key];
    if (v) partes.push(`${def.label}: ${v}`);
  }
  const a = auto || {};
  if (a.time) partes.push(`Time: ${a.time}`);
  if (a.dayType) partes.push(`Day: ${_nutDayTypeLabel(a.dayType)} day`);
  return partes.length ? 'Context — ' + partes.join(' · ') : '';
}

// ==================== CONTEXTO DEL DÍA ====================

// Masa libre de grasa. Importa que sea FFM y no peso corporal: dividir la EA por 87,1 en vez
// de 72,8 convierte un 26 (bajo el umbral REC-008) en un 21,7 que parece otro problema.
//
// LA PRECEDENCIA VIVE EN EL MOTOR (`ffmKg()` en coach-engine.js, E-9): Withings con lectura
// de menos de 14 días → derivada de la última fila con %grasa → declarada. Aquí había una
// TERCERA aritmética (sólo la derivada, ignorando la báscula), así que la tarjeta de nutrición
// y el pack del coach podían dividir la misma EA por números distintos.
async function nutFfmKg() {
  try {
    const rows = (await dbGetAll('bodyweight')) || [];
    if (typeof ffmKg === 'function') {
      const s = (typeof state !== 'undefined' && state.settings) || {};
      return ffmKg({ bodyweightRows: rows, settings: s, todayStr: today() }).kg;
    }
    const withBf = rows.filter(r => r.weight > 0 && r.bfPct > 0)
                       .sort((a, b) => a.date.localeCompare(b.date));
    if (withBf.length) {
      const last = withBf[withBf.length - 1];
      return Math.round(last.weight * (1 - last.bfPct / 100) * 10) / 10;
    }
  } catch (e) { /* el store puede no existir todavía */ }
  return NUT_FFM_KG_FALLBACK;
}

// La misma FFM con su procedencia, para poder decir en pantalla si el número es medido o
// declarado. `recomputeNutritionDay` lo sella en la fila del día (`ffmSource`).
async function nutFfmDetail() {
  try {
    const rows = (await dbGetAll('bodyweight')) || [];
    if (typeof ffmKg === 'function') {
      const s = (typeof state !== 'undefined' && state.settings) || {};
      return ffmKg({ bodyweightRows: rows, settings: s, todayStr: today() });
    }
  } catch (e) { /* ignorar */ }
  return { kg: await nutFfmKg(), source: 'declared', date: null, ageDays: null, note: '' };
}

// ¿Es día de entreno? Se resuelve por el PLAN y no solo por lo ya registrado, porque el
// objetivo de calorías hay que conocerlo en el desayuno, no al acabar el día. Un entreno
// registrado que el plan no preveía sí manda: eso ya es un hecho, no una previsión.
async function nutIsTrainingDay(date) {
  try {
    const [w, r, s] = await Promise.all([
      dbGetAll('workouts').catch(() => []),
      (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
      (typeof getSessionsDeduped === 'function' ? getSessionsDeduped() : dbGetAll('sessions')).catch(() => []),
    ]);
    if ([...(w || []), ...(r || []), ...(s || [])].some(x => x && x.date === date)) return true;
  } catch (e) { /* ignorar */ }
  const jsDay = new Date(date + 'T12:00:00Z').getUTCDay();
  const slot = (typeof activeWeekTemplate !== 'undefined' && activeWeekTemplate)
    ? activeWeekTemplate[jsDay] : null;
  if (slot && slot.type) return slot.type === 'gym' || slot.type === 'run';
  return false;
}

// Gasto de ejercicio del día (EEE), el término que separa la EA de las calorías netas.
// Reutiliza estimateCalories() de app.js — la misma estimación que ya se muestra en el
// editor de entrenos, para que dos pantallas no den números distintos del mismo día.
async function nutEeeForDate(date, bodyweightKg) {
  if (typeof estimateCalories !== 'function') return 0;
  const bw = bodyweightKg || (await getBodyweightLatest()) || 80;
  const age = (typeof state !== 'undefined' && state.settings && state.settings.age) || null;
  let total = 0;
  try {
    const workouts = (await dbGetAll('workouts').catch(() => [])) || [];
    for (const w of workouts.filter(x => x.date === date)) {
      const c = estimateCalories({
        type: 'gym',
        durationMin: typeof durationToMinutes === 'function' ? durationToMinutes(w.duration) : 0,
        bodyweightKg: bw,
        avgRpe: typeof workoutAvgRpe === 'function' ? workoutAvgRpe(w) : null,
        age,
      });
      if (c) total += c.kcal;
    }
    // Dedupeadas (E-10): la misma carrera de COROS llega por Strava y por intervals.icu, y
    // aquí se SUMAN kilocalorías — contarla dos veces infla el EEE y hunde la EA del día.
    const runs = (await (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => [])) || [];
    for (const r of runs.filter(x => x.date === date)) {
      const c = estimateCalories({
        type: 'run',
        durationMin: parseFloat(r.duration) || 0,
        bodyweightKg: bw,
        avgHr: r.avgHR,
        distanceKm: parseFloat(r.distance) || 0,
        age,
      });
      if (c) total += c.kcal;
    }
  } catch (e) { console.warn('[Nutrición] EEE:', e); }
  return Math.round(total);
}

/**
 * F-20 · El TIPO de día, para el objetivo de carbohidrato de REC-007.
 *
 * Orden de resolución, de lo más real a lo más previsto:
 *   1. `rest` si no hay sesión ni registrada ni prevista (`nutIsTrainingDay`).
 *   2. `longrun` si hay cardio registrado de >= 5 km o >= 40 min. Va PRIMERO entre los días
 *      de entreno: un sábado con rodaje largo pide más carbohidrato que la fuerza que lleve.
 *   3. `lower` si la sesión de fuerza del día carga las piernas (`sessionClassMap()`:
 *      subtipo `lower` o `full`, o familia `hybrid` — la misma definición que RUN-BEFORE-LEGS).
 *   4. `upper` como baseline, que es lo que la tabla llama "comer normal".
 *
 * `typeof` en todo lo de app.js: este fichero se carga antes y los tests lo ejecutan solo.
 * Sin esos globales el tipo cae a `upper`/`rest`, que es el baseline — nunca inventa un día
 * de pierna.
 */
async function nutDayType(date) {
  if (!(await nutIsTrainingDay(date))) return 'rest';

  // (2) cardio largo registrado
  try {
    const runs = (await (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => [])) || [];
    const sess = (await (typeof getSessionsDeduped === 'function' ? getSessionsDeduped() : dbGetAll('sessions')).catch(() => [])) || [];
    const cardio = runs.filter(r => r && r.date === date)
      .concat(sess.filter(s => s && s.date === date && s.family === 'cardio'));
    const largo = cardio.some(x => (Number(x.distance) || 0) >= NUT_LONGRUN_KM
      || (Number(x.durationMin != null ? x.durationMin : x.duration) || 0) >= NUT_LONGRUN_MIN);
    if (largo) return 'longrun';
  } catch (e) { /* sin cardio legible, se sigue por fuerza */ }

  // (3) la sesión de fuerza del día: la registrada manda sobre la prevista
  try {
    const clases = (typeof sessionClassMap === 'function') ? (sessionClassMap() || {}) : {};
    const esPierna = (sid) => {
      const c = sid ? clases[sid] : null;
      return !!(c && (c.subtype === 'lower' || c.subtype === 'full' || c.family === 'hybrid'));
    };
    const workouts = (await dbGetAll('workouts').catch(() => [])) || [];
    const hecho = workouts.find(w => w && w.date === date);
    if (hecho) return esPierna(hecho.session) ? 'lower' : 'upper';
    const jsDay = new Date(date + 'T12:00:00Z').getUTCDay();
    const slot = (typeof activeWeekTemplate !== 'undefined' && activeWeekTemplate)
      ? activeWeekTemplate[jsDay] : null;
    if (slot && slot.type === 'gym' && esPierna(slot.session)) return 'lower';
  } catch (e) { /* baseline */ }

  return 'upper';
}

// El "contrato del día": los cuatro números de la cabecera. Salen de settings cuando el
// usuario los ha tocado, y de nutrition-notes.md si no.
async function nutDayTargets(date) {
  const s = (typeof state !== 'undefined' && state.settings) || {};
  const training = await nutIsTrainingDay(date);
  const kcalTarget = training
    ? (Number(s.calorieTargetTraining) || NUT_KCAL_TRAINING)
    : (Number(s.calorieTargetRest) || NUT_KCAL_REST);
  // F-20: el tipo de día y su objetivo de carbohidrato (REC-007). Informativos: no entran en
  // `NUT_BANDS` ni cambian `kcalTarget`.
  const dayType = await nutDayType(date);
  return {
    date,
    training,
    kcalTarget,
    proteinFloor: Number(s.proteinTarget) || NUT_PROTEIN_FLOOR,
    fiberTarget: NUT_FIBER_TARGET,
    fatFloor: NUT_FAT_FLOOR,
    dayType,
    carbTarget: NUT_CARB_TARGETS[dayType] || null,
  };
}

// ============ EL AGREGADO DERIVADO (único escritor de `nutrition`) ============
//
// Recalcula la fila del día desde `meals` y la escribe en `nutrition`. Esta función es la
// que mantiene compatibles a los cinco consumidores que ya leían .protein/.calories: no
// hay que repuntar nada, siguen leyendo el mismo store con los mismos nombres de campo.
//
// MERGE, nunca sobreescritura: `energy` la escribe el usuario a mano y el motor de fatiga
// la consume (app.js:4619). Un put que la pise convierte la fatiga en un número inventado.
async function computeNutritionDay(date) {
  const meals = await nutMealsForDate(date);
  const agg = aggregateMeals(meals);
  const targets = await nutDayTargets(date);
  const ffmInfo = await nutFfmDetail();
  const ffm = ffmInfo.kg;
  const eee = await nutEeeForDate(date);
  const ea = energyAvailability(agg.calories, eee, ffm);
  const steps = await nutStepsForDate(date);
  const bw = (typeof getBodyweightLatest === 'function' ? await getBodyweightLatest() : null) || 87;
  // `burn` es el mantenimiento MODELADO, no medido: no hay dato de gasto en el pipeline
  // (ver maintenanceKcal). La calibracion contra la bascula es lo que lo corrige.
  const maint = maintenanceKcal({ ffmKg: ffm, bodyweightKg: bw, steps, eee, kcalIn: agg.calories });

  let existing = null;
  try { existing = await dbGet('nutrition', date); } catch (e) {}

  const row = {
    ...(existing || {}),
    date,
    // Campos que los consumidores existentes ya leían — ahora derivados, no tecleados.
    protein: agg.protein,
    calories: agg.calories,
    // Nuevos.
    carbs: agg.carbs,
    fat: agg.fat,
    fiber: agg.fiber,
    alcoholG: agg.alcohol,
    nova12Pct: agg.nova12Pct,
    mealCount: agg.mealCount,
    itemCount: agg.itemCount,
    estimatedItems: agg.estimatedItems,
    // F-21 · proteína por comida (dosis, no total) · F-20 · tipo de día y carbohidrato
    proteinPerMeal: agg.proteinPerMeal,
    proteinPerMealAvg: agg.proteinPerMealAvg,
    mealsUnderProteinMin: agg.mealsUnderProteinMin,
    kcalTarget: targets.kcalTarget,
    proteinFloor: targets.proteinFloor,
    dayType: targets.dayType,
    carbTarget: targets.carbTarget,
    trainingDay: targets.training,
    eee,
    ffm,
    ffmSource: ffmInfo.source,
    steps,
    burn: maint.total,
    burnSource: 'modelo',
    burnBreakdown: maint,
    ea: ea == null ? null : Math.round(ea * 10) / 10,
    // LA EA ES UNA MAGNITUD DIARIA (REC-008), así que sólo significa algo cuando el día se
    // acabó: a las 11:00 con un desayuno registrado la EA intradía sale siempre "crítica" y
    // no describe nada (F-12 / E-11). `closed` es lo que la pantalla mira antes de pintarla.
    closed: String(date) < today(),
    loggedV2: agg.mealCount > 0,
    updatedAt: Date.now(),
  };
  return row;
}

/**
 * EL ÚNICO ESCRITOR de `nutrition`: calcula y guarda.
 *
 * SÓLO SE LLAMA DESDE RUTAS DE ESCRITURA (E-11, auditoría 2026-09-08): `saveMeal` (registro a
 * mano y confirmación de la foto), `deleteMeal` y `nutCloseDay`. Antes se llamaba también en
 * cada pintado de la vista de nutrición (F-11), o sea que abrir una pestaña ESCRIBÍA en IDB y
 * encolaba una sincronización — con un `updatedAt` nuevo cada vez, así que el último
 * dispositivo que mirase la pantalla ganaba el merge sin haber registrado nada.
 */
async function recomputeNutritionDay(date) {
  const row = await computeNutritionDay(date);
  await smartPut('nutrition', row);
  return row;
}

/**
 * CIERRE DEL DÍA: la última vez que se recalcula una fecha.
 *
 * Un día se cierra cuando pasa, no cuando el usuario hace algo, así que hace falta un momento
 * en que el sistema lo sella: el entreno registrado por la tarde después de la última comida
 * cambia el EEE y con él la EA, y sin este paso la fila se quedaría con el gasto de antes.
 * Idempotente: si la fila ya está cerrada no vuelve a escribir (es lo que impide que esto se
 * convierta en el recompute-por-render que E-11 viene a quitar).
 */
async function nutCloseDay(date) {
  if (!date || String(date) >= today()) return null;      // hoy todavía no se puede cerrar
  let existing = null;
  try { existing = await dbGet('nutrition', date); } catch (e) {}
  if (existing && existing.closed === true) return existing;
  if (!existing) return null;                              // un día sin fila no se inventa
  return recomputeNutritionDay(date);
}

/**
 * La fila del día PARA PINTAR, sin escribir nada (E-11).
 *
 * Lee lo guardado y, si falta o se ha quedado atrás respecto a las comidas del día (una foto
 * importada en otro dispositivo, una fila vieja de antes del agregado), calcula en memoria. El
 * cálculo cuesta cuatro lecturas de IDB; la escritura costaba además una fila de sincronización
 * por cada vez que se abría la pestaña.
 */
async function nutDayForRender(date) {
  let existing = null;
  try { existing = await dbGet('nutrition', date); } catch (e) {}
  const meals = await nutMealsForDate(date);
  const necesitaCalculo = !existing
    || existing.kcalTarget == null
    || (existing.mealCount || 0) !== meals.length;
  if (!necesitaCalculo) return existing;
  const row = await computeNutritionDay(date);
  // `energy` la escribe el usuario a mano (`nutSaveEnergy`) y el compute la arrastra desde la
  // fila existente; con fila nueva no hay nada que arrastrar.
  return row;
}

// ==================== ACCESO A COMIDAS ====================

// Pasos del dia. Vienen del store `steps` (iOS Shortcut -> steps-ingest, o intervals.icu).
async function nutStepsForDate(date) {
  try {
    const row = await dbGet('steps', date);
    return row && Number(row.steps) > 0 ? Number(row.steps) : 0;
  } catch (e) { return 0; }
}

async function nutMealsForDate(date) {
  const all = (await dbGetAll('meals').catch(() => [])) || [];
  return all.filter(m => m && m.date === date)
            .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
}

// Guarda una comida y recalcula el día. Los items llegan ya resueltos contra `foods`.
async function saveMeal(meal) {
  const m = {
    ...meal,
    id: meal.id || new Date().toISOString(),
    date: meal.date || today(),
    updatedAt: Date.now(),
  };
  await smartPut('meals', m);
  // v11.76: la señal de uso de la biblioteca se actualiza AQUÍ, en el único escritor de
  // `meals`. Antes el ranking la recalculaba escaneando todas las comidas en cada pintado.
  await nutApplyFoodUsage(m.items, 1, `${m.date}${m.time ? 'T' + m.time : ''}`);
  await recomputeNutritionDay(m.date);
  return m;
}

async function deleteMeal(id, date) {
  // Se lee ANTES de borrar: sin los items no hay forma de deshacer el uso que sumó.
  const previa = await dbGet('meals', id).catch(() => null);
  await smartDelete('meals', id);
  if (previa) await nutApplyFoodUsage(previa.items, -1, null);
  await recomputeNutritionDay(date);
}

/**
 * Suma o resta un uso a cada alimento de una comida. Una sola pasada de lectura y tantas
 * escrituras como alimentos distintos haya (dos o tres, no cincuenta).
 *
 * Nunca revienta la escritura de la comida: el uso es una señal para ordenar el picker, no
 * un dato del registro. Si falla, el registro sigue guardado y el orden del picker se queda
 * como estaba.
 */
async function nutApplyFoodUsage(items, delta, when) {
  try {
    const ids = [...new Set((items || []).map(it => it && it.foodId).filter(Boolean))];
    if (!ids.length) return;
    const foods = (await dbGetAll('foods').catch(() => [])) || [];
    for (const id of ids) {
      const food = foods.find(f => f && f.id === id);
      if (!food) continue;
      const kcal = (items || [])
        .filter(it => it.foodId === id)
        .reduce((s, it) => s + (Number(it.kcal) || 0), 0);
      await smartPut('foods', nutBumpFood(food, delta, when, kcal));
    }
  } catch (e) {
    console.warn('[Nutrición] uso de la biblioteca:', e);
  }
}

// Mete en la biblioteca los alimentos que la foto descubrió y que no existían. Se guardan
// con verified:false, así que el coach no los propondrá hasta que el usuario los confirme:
// un gramaje calculado sobre macros que estimó una foto es una estimación al cuadrado.
async function upsertFoodsFromItems(items) {
  const foods = (await dbGetAll('foods').catch(() => [])) || [];
  const nuevos = [];
  for (const it of items || []) {
    if (it.foodId) continue;
    if (findFood([...foods, ...nuevos], it.name)) continue;
    const grams = Number(it.grams) || 0;
    if (grams <= 0) continue;
    const per100 = (v) => Math.round(((Number(v) || 0) * 100 / grams) * 10) / 10;
    nuevos.push({
      id: nutSlug(it.name),
      name: it.name,
      aliases: [],
      kcal100: Math.round(per100(it.kcal)),
      protein100: per100(it.protein),
      carbs100: per100(it.carbs),
      fat100: per100(it.fat),
      fiber100: per100(it.fiber),
      nova: it.nova || 3,
      source: 'ai',
      verified: false,
      createdAt: Date.now(),
    });
  }
  for (const f of nuevos) await smartPut('foods', f);
  return nuevos;
}

// Siembra la biblioteca una sola vez. Idempotente por id, así que no pisa nada que el
// usuario haya editado ni duplica al reinstalar la PWA.
async function seedFoods() {
  const existing = (await dbGetAll('foods').catch(() => [])) || [];
  const known = new Set(existing.map(f => f.id));
  let n = 0;
  for (const f of FOODS_SEED) {
    if (known.has(f.id)) continue;
    await smartPut('foods', { ...f, source: 'seed', verified: false, createdAt: Date.now() });
    n++;
  }
  if (n) console.log(`[Nutricion] Biblioteca sembrada con ${n} alimentos`);
  await nutBackfillFoodUsage();
  return n;
}

/**
 * v11.76 · El uso histórico, UNA vez. `useCount`/`lastUsedAt` nacen ahora, así que sin esto
 * el ranking diría "0 veces" de un alimento registrado treinta veces — un dato que la app
 * tiene y que se leería como que no lo comes.
 *
 * Sólo toca las filas que NO tienen el campo y que aparecen en alguna comida: en la segunda
 * ejecución no escribe nada. Va aquí y no en un render porque un pintado no puede escribir
 * (E-11), y `seedFoods()` ya corre después de `checkAuth()`, así que esto sí sincroniza.
 */
async function nutBackfillFoodUsage() {
  try {
    const foods = (await dbGetAll('foods').catch(() => [])) || [];
    const pendientes = foods.filter(f => f && f.useCount == null);
    if (!pendientes.length) return 0;
    const uso = nutFoodUsageMap((await dbGetAll('meals').catch(() => [])) || []);
    let n = 0;
    for (const f of pendientes) {
      const u = uso.get(f.id);
      if (!u || !u.count) continue;      // nunca comido: se lee como 0 sin ocupar una fila
      await smartPut('foods', { ...f, useCount: u.count, useKcal: Math.round(u.kcal), lastUsedAt: u.lastUsedAt });
      n++;
    }
    if (n) console.log(`[Nutricion] Uso histórico recuperado en ${n} alimentos`);
    return n;
  } catch (e) {
    console.warn('[Nutrición] backfill de uso:', e);
    return 0;
  }
}

// ==================== UI: PESTAÑA NUTRICIÓN ====================
//
// Una regla de presentación, tomada de Caltrack y que es la razón de que su dashboard se
// lea bien siendo densísimo: TODO UMBRAL SE IMPRIME JUNTO A SU COLOR. Nunca un semáforo
// cuyo criterio haya que adivinar.

const NUT_MEAL_LABELS = { desayuno: 'Breakfast', comida: 'Lunch', cena: 'Dinner', snack: 'Snack' };

// Qué decidió el modelo sobre la foto, y qué implica para lo que tienes que corregir.
// Un plato compuesto de 500 g y un ingrediente de 500 g se leen igual en pantalla pero se
// corrigen distinto: en el primero ajustas el tamaño de la ración, en el segundo el peso
// de ese alimento concreto.
const NUT_KIND_INFO = {
  etiqueta: {
    label: 'Published macros', cls: 'nut-kind-ok',
    hint: 'read off the label or the menu, not estimated. Only adjust how much you ate.',
  },
  plato: {
    label: 'Composite dish', cls: 'nut-kind-warn',
    hint: 'it goes in as a single food because its parts cannot be weighed separately. ' +
          'Adjust the TOTAL weight of the dish; if you fix the macros once, it stays in your ' +
          'library and next time it is exact.',
  },
  componentes: {
    label: 'Components', cls: 'nut-kind-ok',
    hint: 'separable foods. The macros come from your library; adjust the grams.',
  },
};

function nutSupa() {
  return (typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : null;
}

function nutFmt(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

// Clase de color según la desviación respecto al objetivo de kcal, con los mismos cortes
// que se imprimen en la leyenda.
function nutKcalClass(kcal, target) {
  if (!kcal) return 'nut-neutral';
  const d = Math.abs(kcal - target);
  if (d <= NUT_BANDS.kcal.verde) return 'nut-verde';
  if (d <= NUT_BANDS.kcal.ambar) return 'nut-ambar';
  return 'nut-rojo';
}

async function renderNutricionV2() {
  const date = today();
  const label = document.getElementById('nutrition-date-label');
  if (label) label.textContent = 'Today — ' + formatDate(date);

  // PINTAR NO ESCRIBE (E-11). Los objetivos dependen de si hoy hay sesión y el EEE de lo que
  // se haya registrado desde la última visita, así que el número se CALCULA al entrar — pero en
  // memoria. La fila la escriben las rutas de escritura (`saveMeal`, `deleteMeal`) y el cierre
  // del día de ayer, que se sella una vez y no en cada pintado.
  try { await nutCloseDay(nutShiftDate(date, -1)); } catch (e) { /* ayer puede no tener fila */ }
  const day = await nutDayForRender(date);
  const days = (await dbGetAll('nutrition').catch(() => [])) || [];
  const adh = adherenceMode(days, date);

  renderNutContract(day, adh);
  renderNutToday(day);
  await renderNutMeals(date);
  await renderNutCoach(day);

  // Sub-vistas. Se pintan siempre: son baratas (leen de IDB) y asi cambiar de pestaña es
  // instantaneo en vez de mostrar un hueco mientras cargan.
  renderNutStreak(days, date);
  renderNutTrends(days, date);
  renderNutWeekly(days);
  await renderNutCalibration(days, date);
  await renderNutFoods();

  // Dejar un grupo activo (por defecto Hoy), como hace renderStats().
  if (!document.querySelector('#view-nutrition .view-scroll > [data-group].active-group')) {
    switchNutGroup('hoy');
  }

  const starEl = document.getElementById('nut-energy');
  if (starEl && typeof setStarValue === 'function') setStarValue('nut-energy', day.energy || 3);

  if (typeof renderNutritionHistory === 'function') renderNutritionHistory();
}

// ── El contrato del día ─────────────────────────────────────────────────────────────
// Los cuatro números que gobiernan el día, más QUIÉN está pilotando. Ese badge no es
// decorativo: es la promesa de que si el registro se cae, el sistema lo dice en vez de
// seguir dando consejos sobre datos que no existen.
function renderNutContract(day, adh) {
  const el = document.getElementById('nut-contract');
  if (!el) return;

  const deficit = day.kcalTarget - (day.maintenance || day.kcalTarget);
  const pilotoTracker = adh.pilot === 'tracker';
  const badge = pilotoTracker
    ? `<span class="nut-pill nut-pill-ok">pilot: log</span>`
    : `<span class="nut-pill nut-pill-warn">pilot: weight · ${adh.perWeek}/7 days</span>`;

  el.innerHTML = `
    <div class="nut-contract-top">
      <span class="nut-contract-day">today · ${day.trainingDay ? 'training' : 'rest'}</span>
      ${badge}
    </div>
    <div class="nut-contract-grid">
      <div class="nut-contract-cell">
        <span class="ncc-val">${nutFmt(day.kcalTarget)}</span>
        <span class="ncc-lbl">kcal target</span>
      </div>
      <div class="nut-contract-cell">
        <span class="ncc-val">${day.proteinFloor}</span>
        <span class="ncc-lbl">g protein floor</span>
      </div>
      <div class="nut-contract-cell">
        <span class="ncc-val">${NUT_EA_FLOOR}</span>
        <span class="ncc-lbl">min EA</span>
      </div>
      <div class="nut-contract-cell">
        <span class="ncc-val">${day.eee ? '−' + nutFmt(day.eee) : '—'}</span>
        <span class="ncc-lbl">session kcal</span>
      </div>
    </div>
    ${pilotoTracker ? '' : `<div class="nut-contract-note">
      With fewer than 5 of 7 days logged, calories are decided by the weight trend
      (nutrition-notes.md rule), not by this log.
    </div>`}
  `;
}

// ── Totales del día + disponibilidad energética ─────────────────────────────────────
// F-20: el tipo de día en inglés y en la lengua del usuario del plan, no la clave.
const NUT_DAY_TYPE_LABEL = { lower: 'lower-body', upper: 'upper-body', longrun: 'long-cardio', rest: 'rest' };
function _nutDayTypeLabel(t) { return NUT_DAY_TYPE_LABEL[t] || 'training'; }

function renderNutToday(day) {
  const el = document.getElementById('nut-today');
  if (!el) return;

  const kcal = day.calories || 0;
  const restan = day.kcalTarget - kcal;
  const protPct = Math.min((day.protein || 0) / Math.max(day.proteinFloor, 1), 1);
  const protClass = (day.protein || 0) >= day.proteinFloor ? 'nut-verde'
    : protPct >= NUT_BANDS.proteina.ambar ? 'nut-ambar' : 'nut-rojo';

  // LA EA SÓLO SE JUZGA EN DÍAS CERRADOS (E-11 · F-12). Es una magnitud diaria (REC-008):
  // intradía sale siempre "crítica" —a las 11:00 con un desayuno registrado el numerador es
  // casi cero— y pintarla en rojo enseña a ignorar el único semáforo que sí importa. Hoy se
  // muestra el número en curso, sin color y sin "te faltan N kcal".
  const eaClosed = day.closed === true;
  const ea = day.ea;
  const eaCls = eaClosed
    ? { ok: 'nut-verde', bajo: 'nut-ambar', critico: 'nut-rojo', 'sin-datos': 'nut-neutral' }[eaStatus(ea)]
    : 'nut-neutral';
  const eaFaltan = (eaClosed && ea != null && ea < NUT_EA_FLOOR)
    ? Math.round((NUT_EA_FLOOR - ea) * (day.ffm || NUT_FFM_KG_FALLBACK)) : 0;

  // F-21: la DOSIS por comida, debajo del total. Sin comidas no se dice nada — un "0 g por
  // comida" leería como "has comido sin proteína", que no es lo mismo que "no hay registro".
  const perMeal = day.proteinPerMealAvg;
  const bajas = day.mealsUnderProteinMin || 0;
  const perMealNote = (perMeal == null || !day.mealCount) ? '' : `<div class="nut-metric-note">`
    + `${perMeal} g per meal across ${day.mealCount} meal${day.mealCount === 1 ? '' : 's'}`
    + ` · target ${NUT_PROTEIN_MEAL_MIN}-${NUT_PROTEIN_MEAL_MAX} g (leucine threshold)`
    + `${bajas ? ` · <strong>${bajas} below ${NUT_PROTEIN_MEAL_MIN} g</strong>` : ''}</div>`;

  const nova = day.nova12Pct;
  const novaCls = nova == null ? 'nut-neutral'
    : nova >= NUT_BANDS.nova.verde ? 'nut-verde'
    : nova >= NUT_BANDS.nova.ambar ? 'nut-ambar' : 'nut-rojo';

  el.innerHTML = `
    <div class="nut-hero">
      <span class="nut-hero-val ${nutKcalClass(kcal, day.kcalTarget)}">${nutFmt(kcal)}</span>
      <span class="nut-hero-sep">/ ${nutFmt(day.kcalTarget)} kcal</span>
    </div>
    <div class="nut-hero-sub">
      ${kcal === 0 ? 'Nothing logged yet'
        : restan > 0 ? `${nutFmt(restan)} kcal left` : `${nutFmt(-restan)} kcal over`}
      <span class="nut-legend">green ±${NUT_BANDS.kcal.verde} · amber ±${NUT_BANDS.kcal.ambar}</span>
    </div>

    <div class="nut-metric">
      <div class="nut-metric-head">
        <span class="nut-metric-name">Protein</span>
        <span class="nut-metric-val ${protClass}">${Math.round(day.protein || 0)} / ${day.proteinFloor} g</span>
      </div>
      <div class="nut-bar"><div class="nut-bar-fill ${protClass}" style="width:${Math.round(protPct * 100)}%"></div></div>
      ${perMealNote}
    </div>

    <div class="nut-metric">
      <div class="nut-metric-head">
        <span class="nut-metric-name">Energy availability</span>
        <span class="nut-metric-val ${eaCls}">${ea == null ? '—' : ea.toFixed(1)} kcal/kg FFM</span>
      </div>
      <div class="nut-metric-note">
        ${eaClosed
          ? `floor ${NUT_EA_FLOOR} (REC-008) · FFM ${day.ffm || NUT_FFM_KG_FALLBACK} kg`
          : `in progress — a daily figure (REC-008); judged when the day closes · FFM ${day.ffm || NUT_FFM_KG_FALLBACK} kg`}
        ${eaFaltan > 0 ? ` · <strong>${nutFmt(eaFaltan)} kcal short</strong>` : ''}
      </div>
    </div>

    <div class="nut-metric">
      <div class="nut-metric-head">
        <span class="nut-metric-name">Unprocessed (NOVA 1-2)</span>
        <span class="nut-metric-val ${novaCls}">${nova == null ? '—' : nova + '%'}</span>
      </div>
      <div class="nut-metric-note">of the day's kcal · green ≥${NUT_BANDS.nova.verde}% · amber ≥${NUT_BANDS.nova.ambar}%</div>
    </div>

    <div class="nut-macros">
      <span>carbs <strong>${Math.round(day.carbs || 0)} g</strong>${day.carbTarget ? ` / ${day.carbTarget}` : ''}</span>
      <span>fat <strong>${Math.round(day.fat || 0)} g</strong></span>
      <span>fiber <strong>${Math.round(day.fiber || 0)} g</strong> / ${NUT_FIBER_TARGET}</span>
      ${day.alcoholG ? `<span>alcohol <strong>${Math.round(day.alcoholG)} g</strong></span>` : ''}
    </div>
    ${day.carbTarget ? `<div class="nut-metric-note">Carbs on a ${_nutDayTypeLabel(day.dayType)}`
      + ` day: ${day.carbTarget} g (REC-007 — redistribution, not more calories).</div>` : ''}
  `;
}

// ── Comidas del día ─────────────────────────────────────────────────────────────────
async function renderNutMeals(date) {
  const container = document.getElementById('nut-meals');
  if (!container) return;
  const meals = await nutMealsForDate(date);

  if (!meals.length) {
    showEmptyState(container, '📷', 'No meals today',
      'Take a photo of the plate and fix the grams if needed.');
    return;
  }

  container.innerHTML = meals.map(m => {
    const agg = aggregateMeals([m]);
    // Los items con poca confianza se marcan: son los que conviene corregir a mano.
    const items = (m.items || []).map(it => {
      const dudoso = (it.confidence != null && it.confidence < 0.5);
      return `<span class="nut-item-chip${dudoso ? ' nut-item-chip-dudoso' : ''}">${escapeHtml(it.name)} ${Math.round(it.grams)} g</span>`;
    }).join('');
    return `
      <div class="history-item nut-meal-row">
        <div class="hi-left">
          <div class="hi-title">${NUT_MEAL_LABELS[m.type] || 'Meal'} · ${m.time || ''}</div>
          <div class="nut-item-chips">${items}</div>
        </div>
        <div class="hi-right" style="display:flex;align-items:center;gap:6px">
          <div>
            <div class="hi-stat">${nutFmt(agg.calories)}</div>
            <div class="hi-stat-sub">${Math.round(agg.protein)} g P</div>
          </div>
          <button class="hi-delete" data-del-meal="${m.id}" aria-label="Delete meal">&times;</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-del-meal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delMeal;
      const removed = meals.find(m => m.id === id);
      await deleteMeal(id, date);
      renderNutricionV2();
      toast('Meal deleted', {
        label: 'Undo',
        callback: async () => { if (removed) { await saveMeal(removed); renderNutricionV2(); } },
      });
    });
  });
}

// ==================== COMPOSITOR: N FOTOS + NOTA ====================
//
// El flujo completo: fotos y/o nota → Storage → edge function → hoja de confirmación →
// IndexedDB. La foto PROPONE y el usuario DISPONE: nada se guarda sin pasar por la
// confirmación, porque un gramaje estimado que entra solo deja de ser estimación y pasa a
// ser un dato falso que además contamina el déficit semanal y la calibración.
//
// POR QUÉ VARIAS FOTOS Y UNA NOTA:
//   · Carta + plato es la mejor combinación que existe aquí. La carta da macros
//     PUBLICADOS —exactos— y la foto del plato dice cuánto hay servido de verdad. Cada
//     imagen aporta lo que la otra no puede.
//   · La nota es la mejora de precisión más barata del sistema: "me comí la mitad" no está
//     en los píxeles y ningún modelo la puede deducir. Cuesta cero tokens de imagen.
//   · Sólo nota, sin foto, es un caso legítimo: comidas ya comidas o donde no pudiste
//     fotografiar. Antes eso no se podía registrar y por tanto se perdía.
//
// Las fotos se quedan EN LOCAL hasta que pulsas Analizar: subir cada una al elegirla
// llenaría Storage de intentos abandonados.

const NUT_MAX_FOTOS = 4;
// 1.400 px en el lado largo. La API reescala por encima de ~1.568 px de todos modos, así que
// más resolución no compra precisión: sólo hace la subida lenta con datos móviles y engorda
// el bucket. Por debajo se empiezan a perder las etiquetas pequeñas de una carta.
const NUT_FOTO_MAX_PX = 1400;

let _nutStaged = [];   // [{ id, blob, url }]
// CAMINO C · Lo que los chips han puesto. Vive aparte del textarea a propósito: el texto es
// del usuario y no se le reescribe debajo del cursor. Se juntan al enviar.
let _nutChips = {};

// Redimensiona en el móvil antes de subir. `imageOrientation: 'from-image'` aplica el EXIF:
// sin eso, una foto hecha en vertical llega girada y el modelo estima sobre un plato tumbado.
async function nutResizeImage(file) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const escala = Math.min(1, NUT_FOTO_MAX_PX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * escala);
    const h = Math.round(bmp.height * escala);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    if (bmp.close) bmp.close();
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.85));
    return blob || file;
  } catch (e) {
    // Un navegador sin createImageBitmap sube el original: peor, pero funciona.
    console.warn('[Nutrición] no se pudo redimensionar:', e);
    return file;
  }
}

async function nutAddFiles(fileList) {
  const files = [...(fileList || [])].filter(f => f && f.type && f.type.startsWith('image/'));
  if (!files.length) return;

  const hueco = NUT_MAX_FOTOS - _nutStaged.length;
  if (hueco <= 0) { toast(`Maximum ${NUT_MAX_FOTOS} photos`); return; }
  if (files.length > hueco) toast(`Only ${hueco} more fit`);

  nutStatus('Preparing the photo…', 'info');
  for (const file of files.slice(0, hueco)) {
    const blob = await nutResizeImage(file);
    _nutStaged.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, blob, url: URL.createObjectURL(blob) });
  }
  nutStatus(null);
  nutOpenComposer();
}

function nutOpenComposer() {
  const c = document.getElementById('nut-composer');
  if (c) c.classList.remove('hidden');
  renderNutStaged();
  renderNutChips();
}

function nutCloseComposer(limpiar) {
  const c = document.getElementById('nut-composer');
  if (c) c.classList.add('hidden');
  if (limpiar !== false) {
    _nutStaged.forEach(s => URL.revokeObjectURL(s.url));
    _nutStaged = [];
    _nutChips = {};
    const nota = document.getElementById('nut-composer-note');
    if (nota) nota.value = '';
  }
  renderNutStaged();
  renderNutChips();
}

// ── CAMINO C · Los chips que ayudan al modelo a interpretar la descripción ───────────
//
// No son un formulario: son atajos que rellenan la nota. Ninguno es obligatorio y el texto
// libre sigue mandando. Por qué EXACTAMENTE estos cinco, y qué regla consume cada uno, está
// en `NUT_CHIP_DEFS`. La hora y el tipo de día no se preguntan: la app ya los sabe.
function renderNutChips() {
  const cont = document.getElementById('nut-chips');
  if (!cont) return;
  cont.innerHTML = NUT_CHIP_DEFS.map(d => {
    const v = _nutChips[d.key];
    return `<button type="button" class="nut-chip ${v ? 'nut-chip-set' : ''}" data-chip="${d.key}">`
      + `<span class="nut-chip-ico">${d.icon}</span>${escapeHtml(v || d.label)}</button>`;
  }).join('');
  cont.querySelectorAll('[data-chip]').forEach(b => {
    b.addEventListener('click', () => nutTapChip(b.dataset.chip));
  });

  const linea = document.getElementById('nut-chip-line');
  if (!linea) return;
  const txt = nutChipLine(_nutChips, {});
  linea.textContent = txt ? `${txt} — the time of day and the day type are added for you.` : '';
  linea.classList.toggle('hidden', !txt);
}

async function nutTapChip(key) {
  const def = NUT_CHIP_DEFS.find(d => d.key === key);
  if (!def) return;

  const opciones = def.options.map(o => ({ label: o, value: o, selected: _nutChips[key] === o }));
  if (def.custom === 'weight') opciones.push({ label: 'Weigh it', value: '__weight__' });
  if (_nutChips[key]) opciones.push({ label: 'Clear', value: '__clear__' });

  const v = await showActionSheet(def.label, opciones);
  if (v == null) return;

  if (v === '__clear__') { delete _nutChips[key]; renderNutChips(); return; }

  if (v === '__weight__') {
    const g = (typeof promptSheet === 'function')
      ? await promptSheet({ title: 'Weight in grams', placeholder: '180', confirmLabel: 'Use it' })
      : null;
    const n = Math.round(parseFloat(g) || 0);
    if (n > 0) { _nutChips[key] = `${n} g`; renderNutChips(); }
    return;
  }

  // La proteína pide un segundo toque: la fuente SIN la cantidad no sirve para juzgar los
  // 30-50 g por comida, que es lo que REC-001 mira y lo único que decide si la comida cumple.
  if (def.amounts && v !== 'no protein source') {
    const cuanto = await showActionSheet('How much protein?',
      def.amounts.map(o => ({ label: o, value: o })));
    _nutChips[key] = (cuanto && cuanto !== 'not sure') ? `${v}, ${cuanto}` : v;
    renderNutChips();
    return;
  }

  _nutChips[key] = v;
  renderNutChips();
}

function renderNutStaged() {
  const cont = document.getElementById('nut-composer-thumbs');
  if (!cont) return;
  if (!_nutStaged.length) {
    cont.innerHTML = `<div class="nut-thumbs-empty">No photos — it will log from what you write only.</div>`;
  } else {
    cont.innerHTML = _nutStaged.map((s, i) => `
      <div class="nut-thumb">
        <img src="${s.url}" alt="Photo ${i + 1}">
        <button class="nut-thumb-del" data-del-foto="${s.id}" aria-label="Remove">&times;</button>
      </div>`).join('') +
      (_nutStaged.length < NUT_MAX_FOTOS
        ? `<button class="nut-thumb-add" id="nut-thumb-add" aria-label="Add another">+</button>` : '');

    cont.querySelectorAll('[data-del-foto]').forEach(b => {
      b.addEventListener('click', () => {
        const idx = _nutStaged.findIndex(s => s.id === b.dataset.delFoto);
        if (idx >= 0) { URL.revokeObjectURL(_nutStaged[idx].url); _nutStaged.splice(idx, 1); }
        renderNutStaged();
      });
    });
    const add = document.getElementById('nut-thumb-add');
    if (add) add.addEventListener('click', () => {
      const inp = document.getElementById('nut-gallery-input');
      if (inp) inp.click();
    });
  }

  const btn = document.getElementById('btn-nut-analyze');
  if (btn) {
    const n = _nutStaged.length;
    btn.textContent = n === 0 ? 'Analyze the note' : n === 1 ? 'Analyze the photo' : `Analyze ${n} photos`;
  }
}

// ==================== ANALIZAR ====================

async function nutAnalyze() {
  const notaEl = document.getElementById('nut-composer-note');
  const texto = (notaEl && notaEl.value.trim()) || '';

  // Los chips solos no son una comida: describen CÓMO era, no QUÉ era. Sin foto y sin texto
  // propio no hay nada que registrar, y una llamada al modelo con "Portion: 1 plate" y nada
  // más devolvería items vacíos y habría costado dinero.
  if (!_nutStaged.length && !texto) { toast('Add a photo or write what you ate'); return; }

  // CAMINO C · La nota que viaja es el texto del usuario MÁS la línea de contexto. El
  // contrato del servidor no cambia: sigue siendo `{ photoPaths, note }`. La hora y el tipo
  // de día los añade el cliente porque ya los sabe (`nutDayType`, REC-007) — preguntarlos
  // sería fricción, y la fricción es lo que hundió el registro dos veces.
  const ahora = new Date();
  const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  let tipoDia = null;
  try { tipoDia = await nutDayType(today()); } catch (e) { /* sin tipo de día se sigue igual */ }
  const contexto = nutChipLine(_nutChips, { time: hora, dayType: tipoDia });
  const note = [texto, contexto].filter(Boolean).join('\n');

  const supa = nutSupa();
  const user = (typeof window !== 'undefined' && window.getSupaUser) ? await window.getSupaUser() : null;

  // El paso de IA necesita red por definición. Sin ella se abre la hoja vacía para registrar
  // a mano desde la biblioteca: así el registro sigue funcionando sin cobertura, que es la
  // mitad del valor de que esto sea una PWA.
  if (!supa || !user || !navigator.onLine) {
    nutStatus('Offline or not signed in: add the foods by hand from your library.', 'warn');
    nutCloseComposer();
    openNutConfirm({ items: [], mealType: nutGuessMealType(), notes: '', note });
    return;
  }

  const btn = document.getElementById('btn-nut-analyze');
  if (btn) { btn.disabled = true; }

  try {
    const photoPaths = [];
    for (let i = 0; i < _nutStaged.length; i++) {
      nutStatus(`Uploading ${i + 1} of ${_nutStaged.length}…`, 'info');
      const path = `${user.id}/${today()}_${Date.now()}_${i}.jpg`;
      const { error } = await supa.storage.from('meal-photos')
        .upload(path, _nutStaged[i].blob, { contentType: 'image/jpeg', upsert: false });
      if (error) throw new Error('Could not upload the photo: ' + error.message);
      photoPaths.push(path);
    }

    nutStatus(photoPaths.length ? 'Analyzing…' : 'Reading the note…', 'info');
    const { data, error } = await supa.functions.invoke('parse-meal-photo', {
      body: { photoPaths, note },
    });
    if (error) throw new Error(error.message || 'The analysis function failed');
    if (data && data.error) throw new Error(data.error);
    if (!data || !data.ok) throw new Error('Unexpected response from the analysis');

    nutStatus(null);
    nutCloseComposer();
    if (!data.items || !data.items.length) {
      toast('No food recognized');
      openNutConfirm({ ...data, items: [] });
      return;
    }
    openNutConfirm(data);
  } catch (e) {
    console.error('[Nutrición] analizar:', e);
    nutStatus(`${e.message}. You can add it by hand.`, 'error');
    nutCloseComposer();
    openNutConfirm({ items: [], mealType: nutGuessMealType(), notes: '', note });
  } finally {
    if (btn) btn.disabled = false;
  }
}

// Tipo de comida por defecto según la hora. Es sólo una propuesta editable.
function nutGuessMealType() {
  const h = new Date().getHours();
  if (h < 11) return 'desayuno';
  if (h < 16) return 'comida';
  if (h < 20) return 'snack';
  return 'cena';
}

let _nutPending = null;   // resultado del parseo en espera de confirmación

function nutStatus(msg, kind) {
  const el = document.getElementById('nut-photo-status');
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.className = 'nut-status nut-status-' + (kind || 'info');
  el.innerHTML = msg;
}

// ── Hoja de confirmación ────────────────────────────────────────────────────────────

function openNutConfirm(result) {
  _nutPending = {
    photoPath: result.photoPath || null,
    photoPaths: result.photoPaths || (result.photoPath ? [result.photoPath] : []),
    userNote: result.note || '',
    usage: result.usage || null,
    kind: result.kind || null,
    notes: result.notes || '',
    type: result.mealType || nutGuessMealType(),
    items: (result.items || []).map(it => ({ ...it })),
  };
  const sel = document.getElementById('nut-confirm-type');
  if (sel) sel.value = _nutPending.type;
  const notes = document.getElementById('nut-confirm-notes');
  if (notes) {
    const k = NUT_KIND_INFO[_nutPending.kind];
    const badge = k ? `<div class="nut-kind ${k.cls}"><strong>${k.label}</strong> — ${k.hint}</div>` : '';
    const tuNota = _nutPending.userNote
      ? `<div class="nut-user-note"><span class="nut-ai-ico">✏️</span> ${escapeHtml(_nutPending.userNote)}</div>` : '';
    notes.innerHTML = (badge || tuNota || _nutPending.notes)
      ? `${badge}${tuNota}${_nutPending.notes ? `<div class="nut-ai-txt"><span class="nut-ai-ico">🤖</span> ${escapeHtml(_nutPending.notes)}</div>` : ''}`
      : '';
    notes.classList.toggle('hidden', !badge && !tuNota && !_nutPending.notes);
  }
  renderNutConfirmItems();
  const modal = document.getElementById('nut-confirm-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeNutConfirm() {
  const modal = document.getElementById('nut-confirm-modal');
  if (modal) modal.classList.add('hidden');
  _nutPending = null;
}

// Los gramos son el único campo editable, y a propósito: es lo único que la foto estima.
// Cambiarlos recalcula los macros desde los valores por 100 g, nunca al revés.
function renderNutConfirmItems() {
  const cont = document.getElementById('nut-confirm-items');
  if (!cont || !_nutPending) return;
  const items = _nutPending.items;

  if (!items.length) {
    cont.innerHTML = '<div class="nut-empty-items">Add the foods with the button below.</div>';
  } else {
    cont.innerHTML = items.map((it, i) => {
      const dudoso = it.confidence != null && it.confidence < 0.5;
      const nuevo = it.resolved === 'nuevo' || !it.foodId;
      return `
        <div class="nut-item-row">
          <div class="nut-item-main">
            <div class="nut-item-name">
              ${escapeHtml(it.name)}
              ${nuevo ? '<span class="nut-tag nut-tag-nuevo">new</span>' : ''}
              ${dudoso ? '<span class="nut-tag nut-tag-dudoso">low confidence</span>' : ''}
            </div>
            <div class="nut-item-macros" data-macros="${i}">
              ${nutFmt(it.kcal)} kcal · ${Math.round(it.protein)} g P
              · ${Math.round(it.carbs)} C · ${Math.round(it.fat)} G
            </div>
            <button type="button" class="nut-item-save" data-save-food="${i}">Save to my foods</button>
          </div>
          <div class="nut-item-grams">
            <input type="number" inputmode="numeric" step="10" min="0"
                   value="${Math.round(it.grams)}" data-grams="${i}" class="text-input sm">
            <span class="nut-item-unit">g</span>
          </div>
          <button class="hi-delete" data-del-item="${i}" aria-label="Remove item">&times;</button>
        </div>`;
    }).join('');
  }

  cont.querySelectorAll('[data-grams]').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = parseInt(inp.dataset.grams);
      nutRescaleItem(i, parseFloat(inp.value) || 0);
      renderNutConfirmItems();
    });
  });
  cont.querySelectorAll('[data-del-item]').forEach(btn => {
    btn.addEventListener('click', () => {
      _nutPending.items.splice(parseInt(btn.dataset.delItem), 1);
      renderNutConfirmItems();
    });
  });
  cont.querySelectorAll('[data-save-food]').forEach(btn => {
    btn.addEventListener('click', () => nutSaveItemAsFood(parseInt(btn.dataset.saveFood, 10)));
  });

  // Guardar la comida ENTERA como un plato sólo tiene sentido con varios items: con uno solo
  // es el mismo botón de la fila, y dos botones que hacen lo mismo es peor que uno.
  const platoBtn = document.getElementById('nut-confirm-save-food');
  if (platoBtn) platoBtn.classList.toggle('hidden', items.length < 2);

  renderNutConfirmTotals();
}

// ── CAMINO A · Guardar el plato en la biblioteca ────────────────────────────────────
//
// EL CASO REAL, en palabras de Julian: pide dos o tres platos distintos en Honest Greens y
// los repite cuatro o cinco veces al mes. Hoy eso son cuatro o cinco fotos del mismo bowl.
// Se fotografía UNA vez, se corrige el gramaje UNA vez, y a partir de ahí se elige por el
// camino B en dos toques.
//
// LA MEDIDA POR DEFECTO ES LA QUE DE VERDAD COMISTE, no 100 g: de un bowl de 420 g, "100 g"
// no es una cantidad que nadie vaya a pedir nunca.
const NUT_DISH_SERVING_LABEL = '1 portion';

async function nutSaveItemAsFood(i) {
  if (!_nutPending) return;
  const it = _nutPending.items[i];
  if (!it || !(Number(it.grams) > 0)) { toast('Set the grams first'); return; }

  const foods = (await dbGetAll('foods').catch(() => [])) || [];
  const id = it.foodId || nutSlug(it.name);
  const existente = foods.find(f => f && f.id === id) || findFood(foods, it.name);

  // Los macros por 100 g: los del item si vinieron con él, y si no, la regla de tres desde
  // lo que se comió. Nunca al revés — el por 100 g sigue siendo la única verdad.
  const g = Number(it.grams);
  const per100 = it.per100 || {
    kcal100: Math.round((Number(it.kcal) || 0) * 100 / g),
    protein100: Math.round(((Number(it.protein) || 0) * 100 / g) * 10) / 10,
    carbs100: Math.round(((Number(it.carbs) || 0) * 100 / g) * 10) / 10,
    fat100: Math.round(((Number(it.fat) || 0) * 100 / g) * 10) / 10,
    fiber100: Math.round(((Number(it.fiber) || 0) * 100 / g) * 10) / 10,
    alcohol100: Math.round(((Number(it.alcohol) || 0) * 100 / g) * 10) / 10,
    nova: it.nova || 3,
  };
  // `verified: false` a propósito aunque el usuario lo esté guardando a mano: los macros
  // salieron de una foto o de una nota, y el coach "resto del día" sólo propone verificados.
  const base = existente || {
    id, name: it.name, aliases: [],
    kcal100: per100.kcal100, protein100: per100.protein100, carbs100: per100.carbs100,
    fat100: per100.fat100, fiber100: per100.fiber100, alcohol100: per100.alcohol100 || 0,
    nova: per100.nova || it.nova || 3,
    source: 'dish',
    verified: false,
    createdAt: Date.now(),
  };

  await smartPut('foods', {
    ...base,
    serving: { label: NUT_DISH_SERVING_LABEL, grams: Math.round(g) },
    photoPath: _nutPending.photoPath || base.photoPath || null,
    updatedAt: Date.now(),
  });
  toast(existente ? `${base.name}: ${Math.round(g)} g saved as your serving`
                  : `${base.name} saved to your foods`);
}

// La comida entera como UN plato. Es el pedido completo ("lo de siempre en Honest Greens"),
// no un ingrediente: se suma todo y se guarda con el peso total como medida.
async function nutSaveMealAsFood() {
  if (!_nutPending || !_nutPending.items.length) return;
  const items = _nutPending.items;
  if (items.length === 1) { await nutSaveItemAsFood(0); return; }

  const sugerido = items.map(x => x.name).slice(0, 2).join(' + ');
  const nombre = (typeof promptSheet === 'function')
    ? await promptSheet({ title: 'Name this dish', placeholder: 'Honest Greens · my usual', value: sugerido, confirmLabel: 'Save' })
    : sugerido;
  if (nombre === null) return;
  const name = String(nombre || sugerido).trim();
  if (!name) return;

  const sum = (k) => items.reduce((s, x) => s + (Number(x[k]) || 0), 0);
  const g = Math.round(sum('grams'));
  if (g <= 0) { toast('Set the grams first'); return; }
  const per = (k) => Math.round((sum(k) * 100 / g) * 10) / 10;

  await smartPut('foods', {
    id: nutSlug(name),
    name,
    aliases: [],
    kcal100: Math.round(sum('kcal') * 100 / g),
    protein100: per('protein'), carbs100: per('carbs'), fat100: per('fat'),
    fiber100: per('fiber'), alcohol100: per('alcohol'),
    // El NOVA del plato es el peor de sus partes: un bowl con un ultraprocesado dentro no
    // deja de tenerlo porque el resto sea verdura.
    nova: Math.max(...items.map(x => Number(x.nova) || 3)),
    serving: { label: NUT_DISH_SERVING_LABEL, grams: g },
    photoPath: _nutPending.photoPath || null,
    source: 'dish',
    verified: false,
    createdAt: Date.now(),
  });
  toast(`${name} saved to your foods · ${g} g`);
}

// Reescala los macros de un item a los gramos nuevos. Se usa `per100` cuando el item lo
// trae (alimento nuevo) y la regla de tres sobre los gramos anteriores cuando no.
function nutRescaleItem(i, grams) {
  const it = _nutPending.items[i];
  if (!it) return;
  const g = Math.max(0, grams);
  const base = it.per100;
  if (base) {
    const per = (v) => Math.round(((Number(v) || 0) * g / 100) * 10) / 10;
    Object.assign(it, {
      grams: g,
      kcal: Math.round((Number(base.kcal100) || 0) * g / 100),
      protein: per(base.protein100), carbs: per(base.carbs100),
      fat: per(base.fat100), fiber: per(base.fiber100), alcohol: per(base.alcohol100),
    });
  } else if (it.grams > 0) {
    const k = g / it.grams;
    const sc = (v) => Math.round(((Number(v) || 0) * k) * 10) / 10;
    Object.assign(it, {
      kcal: Math.round((Number(it.kcal) || 0) * k),
      protein: sc(it.protein), carbs: sc(it.carbs),
      fat: sc(it.fat), fiber: sc(it.fiber), alcohol: sc(it.alcohol),
      grams: g,
    });
  } else {
    it.grams = g;
  }
}

function renderNutConfirmTotals() {
  const el = document.getElementById('nut-confirm-totals');
  if (!el || !_nutPending) return;
  const agg = aggregateMeals([{ items: _nutPending.items }]);
  el.innerHTML = `
    <span><strong>${nutFmt(agg.calories)}</strong> kcal</span>
    <span><strong>${Math.round(agg.protein)}</strong> g protein</span>
    <span>${_nutPending.items.length} ${_nutPending.items.length === 1 ? 'food' : 'foods'}</span>
  `;
}

// ── CAMINO B · La biblioteca, con medidas y por uso ─────────────────────────────────
//
// LO QUE HABÍA Y POR QUÉ NO SERVÍA: un `showActionSheet` con los 40 mejores por `foodScore`
// que insertaba SIEMPRE 100 g. Dos cosas mal, y las dos hacían que uno volviera a la foto:
// cuarenta filas ordenadas por una fórmula de calidad no son la lista de lo que comes, y
// 100 g de whey no son una medida — son tres veces el bote de un scoop.
//
// Ahora: hoja inferior sobre el chasis de `.plate-sheet`, buscador, Recent y Frequent
// arriba, y un stepper que cuenta MEDIDAS. Los gramos siguen por debajo y son lo que
// persiste; la medida sólo decide cuántos.
async function nutAddItemManual() {
  const foods = (await dbGetAll('foods').catch(() => [])) || [];
  if (!foods.length) { toast('Your library is empty'); return; }
  const elegido = await nutOpenFoodPicker(foods);
  if (!elegido || !elegido.food) return;
  nutPushItemFromFood(elegido.food, servingGrams(elegido.food, elegido.idx, elegido.qty));
}

// Mete un alimento de la biblioteca en la hoja de confirmación. Los macros por 100 g viajan
// pegados al item para que corregir los gramos después siga siendo exacto y no una regla de
// tres sobre otra regla de tres.
function nutPushItemFromFood(food, grams) {
  if (!_nutPending) return;
  const item = itemFromFood(food, grams, { estimated: false, confidence: 1 });
  item.per100 = {
    kcal100: food.kcal100, protein100: food.protein100, carbs100: food.carbs100,
    fat100: food.fat100, fiber100: food.fiber100, alcohol100: food.alcohol100 || 0,
    nova: food.nova,
  };
  item.resolved = 'biblioteca';
  _nutPending.items.push(item);
  renderNutConfirmItems();
}

// Estado vivo del picker. Las cantidades y la medida elegida son por sesión de hoja: no se
// guardan, porque "la última vez pusiste 2" es justo el tipo de memoria que hace registrar
// de más sin mirar.
let _nutPickerState = null;

/**
 * La hoja del picker. Devuelve `{ food, idx, qty }` o `null` si se cierra sin elegir — la
 * misma semántica que `showActionSheet`, así que los llamadores no cambian de forma.
 */
function nutOpenFoodPicker(foods) {
  return new Promise((resolve) => {
    const sheet = document.getElementById('nut-picker');
    const backdrop = document.getElementById('nut-picker-backdrop');
    const search = document.getElementById('nut-picker-search');
    const cerrarBtn = document.getElementById('nut-picker-close');
    // Sin la hoja en el DOM (una versión vieja cacheada) no se pierde el gesto.
    if (!sheet || !backdrop || !search) { resolve(null); return; }

    _nutPickerState = { foods: foods || [], qty: new Map(), unit: new Map(), resolve: null };
    search.value = '';
    renderNutPickerList();

    const cerrar = (val) => {
      // Sin el blur, en iOS el teclado se queda levantado sobre la hoja de confirmación a la
      // que se vuelve, tapando justo los gramos que se acaban de añadir.
      search.blur();
      sheet.classList.remove('visible');
      backdrop.classList.remove('visible');
      setTimeout(() => { sheet.classList.add('hidden'); backdrop.classList.add('hidden'); }, 220);
      search.removeEventListener('input', renderNutPickerList);
      backdrop.removeEventListener('click', onCancel);
      if (cerrarBtn) cerrarBtn.removeEventListener('click', onCancel);
      _nutPickerState = null;
      resolve(val);
    };
    function onCancel() { cerrar(null); }
    _nutPickerState.resolve = cerrar;

    search.addEventListener('input', renderNutPickerList);
    backdrop.addEventListener('click', onCancel);
    if (cerrarBtn) cerrarBtn.addEventListener('click', onCancel);

    sheet.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => { sheet.classList.add('visible'); backdrop.classList.add('visible'); });
  });
}

function renderNutPickerList() {
  const cont = document.getElementById('nut-picker-list');
  const st = _nutPickerState;
  if (!cont || !st) return;
  const q = (document.getElementById('nut-picker-search') || {}).value || '';
  const sec = nutPickerSections(st.foods, q);

  const fila = (f) => {
    const idx = st.unit.get(f.id) || 0;
    const qty = st.qty.get(f.id) || 1;
    const varias = foodServings(f).length > 1;
    return `
      <div class="nut-pick-row">
        <button type="button" class="nut-pick-main" data-pick="${f.id}">
          <span class="nut-pick-name">${escapeHtml(f.name)}</span>
          <span class="nut-pick-cost">${nutServingLine(f, idx, qty)}</span>
        </button>
        ${varias ? `<button type="button" class="nut-pick-unit" data-unit="${f.id}" aria-label="Change measure">⇄</button>` : ''}
        <span class="nut-pick-step">
          <button type="button" data-qty="${f.id}" data-delta="-1" aria-label="One less">−</button>
          <b class="nut-pick-qty">${qty}</b>
          <button type="button" data-qty="${f.id}" data-delta="1" aria-label="One more">+</button>
        </span>
      </div>`;
  };
  const bloque = (titulo, filas) => filas.length
    ? `<div class="nut-pick-sec">${titulo}</div>${filas.map(fila).join('')}` : '';

  cont.innerHTML = sec.query
    ? (sec.matches.length ? sec.matches.map(fila).join('')
                          : `<div class="nut-pick-empty">Nothing in your library matches that. Take a photo or write it instead.</div>`)
    : bloque('Recent', sec.recent) + bloque('Frequent', sec.frequent)
      + bloque('All foods · best score first', sec.rest);

  cont.querySelectorAll('[data-qty]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.qty;
      const n = (st.qty.get(id) || 1) + parseInt(b.dataset.delta, 10);
      st.qty.set(id, Math.min(12, Math.max(1, n)));
      renderNutPickerList();
    });
  });
  cont.querySelectorAll('[data-unit]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.unit;
      const f = st.foods.find(x => x.id === id);
      st.unit.set(id, ((st.unit.get(id) || 0) + 1) % foodServings(f).length);
      renderNutPickerList();
    });
  });
  cont.querySelectorAll('[data-pick]').forEach(b => {
    b.addEventListener('click', () => {
      const f = st.foods.find(x => x.id === b.dataset.pick);
      if (!f || !st.resolve) return;
      st.resolve({ food: f, idx: st.unit.get(f.id) || 0, qty: st.qty.get(f.id) || 1 });
    });
  });
}

async function nutSaveConfirmed() {
  if (!_nutPending) return;
  if (!_nutPending.items.length) { toast('Add at least one food'); return; }

  const sel = document.getElementById('nut-confirm-type');
  const type = (sel && sel.value) || _nutPending.type;
  const date = today();

  // Los alimentos que la foto descubrió entran en la biblioteca (verified:false) para que
  // la próxima vez resuelvan contra ella y sólo haya que estimar gramos.
  await upsertFoodsFromItems(_nutPending.items);

  const now = new Date();
  await saveMeal({
    date,
    time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    type,
    photoPath: _nutPending.photoPath || null,
    photoPaths: _nutPending.photoPaths || [],
    // Lo que escribiste tu, separado de lo que dedujo el modelo. Sirve para releer por que
    // un dia salio raro sin confundir tu dato con su inferencia.
    userNote: _nutPending.userNote || null,
    source: (_nutPending.photoPaths && _nutPending.photoPaths.length) ? 'foto'
          : (_nutPending.userNote ? 'nota' : 'manual'),
    aiNotes: _nutPending.notes || null,
    // Tokens que costó parsear esta foto. Es lo que hace medible la decisión de modelo.
    usage: _nutPending.usage || null,
    aiModel: _nutPending.usage ? NUT_AI_MODEL : null,
    items: _nutPending.items.map(it => ({
      foodId: it.foodId || nutSlug(it.name),
      name: it.name,
      grams: Math.round(it.grams),
      kcal: Math.round(it.kcal),
      protein: it.protein, carbs: it.carbs, fat: it.fat,
      fiber: it.fiber, alcohol: it.alcohol || 0,
      nova: it.nova,
      estimated: !!it.estimated,
      confidence: it.confidence != null ? it.confidence : null,
    })),
  });

  const agg = aggregateMeals([{ items: _nutPending.items }]);
  closeNutConfirm();
  nutStatus(null);
  toast(`${NUT_MEAL_LABELS[type]} saved · ${nutFmt(agg.calories)} kcal · ${Math.round(agg.protein)} g P`);
  renderNutricionV2();
}

// Guardar sólo la energía subjetiva. Sigue siendo un campo a mano porque no hay forma de
// derivarla, y el motor de fatiga la consume.
async function nutSaveEnergy() {
  const date = today();
  const row = (await dbGet('nutrition', date).catch(() => null)) || { date };
  row.energy = typeof getStarValue === 'function' ? getStarValue('nut-energy') : 3;
  await smartPut('nutrition', row);
  toast('Energy saved');
}

// ==================== SUB-VISTAS ====================
//
// Mismo patrón que las sub-pestañas de Stats: `data-nut-group` en los botones y
// `data-group` + `.active-group` en el contenido.

function switchNutGroup(group) {
  document.querySelectorAll('#nut-tabs .stats-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.nutGroup === group);
  });
  document.querySelectorAll('#view-nutrition .view-scroll > [data-group]').forEach(el => {
    el.classList.toggle('active-group', el.dataset.group === group);
  });
  const scroll = document.querySelector('#view-nutrition .view-scroll');
  if (scroll) scroll.scrollTop = 0;
  _nutGroup = group;
}

let _nutGroup = 'hoy';

// ==================== BARRAS DE 30 DÍAS ====================
//
// El widget que Caltrack repite para todas sus métricas, y la razón de que su dashboard se
// lea bien siendo densísimo: la misma forma para todo, con las líneas de referencia
// encima. Aquí en CSS y no en SVG porque 30 barras con texto en un móvil de 375 px se
// comportan mejor con flexbox que con un viewBox fijo.
//
// Los umbrales SIEMPRE se imprimen en la leyenda. Un color cuyo criterio hay que adivinar
// no informa: decora.

const NUT_TREND_DAYS = 30;

function renderNutBars(serie, opts) {
  const o = opts || {};
  const vals = serie.map(p => p.v);
  const conDato = vals.filter(v => v != null && v > 0);
  if (conDato.length < 2) {
    return `<div class="nut-bars-empty">Not enough days with data yet</div>`;
  }

  const refs = (o.refs || []).filter(r => r.value != null);
  const techo = Math.max(...conDato, ...refs.map(r => r.value)) * 1.12 || 1;
  const pct = (v) => Math.max(1.5, Math.min(100, (v / techo) * 100));

  const barras = serie.map(p => {
    if (p.v == null || p.v <= 0) {
      // Un día sin dato NO es un cero: se marca como hueco. Pintarlo a cero mentiría.
      return `<div class="nut-tbar nut-tbar-hueco" title="${p.label}: not logged"></div>`;
    }
    const cls = o.colorFor ? o.colorFor(p.v, p) : 'nut-neutral';
    return `<div class="nut-tbar ${cls}" style="height:${pct(p.v)}%"
      title="${p.label}: ${Math.round(p.v)}${o.unit || ''}"></div>`;
  }).join('');

  const lineas = refs.map(r => `
    <div class="nut-ref ${r.dash ? 'nut-ref-dash' : ''}" style="bottom:${pct(r.value)}%">
      <span class="nut-ref-lbl">${r.label}</span>
    </div>`).join('');

  const primero = serie.find(p => p.v != null);
  const ultimo = [...serie].reverse().find(p => p.v != null);

  return `
    <div class="nut-bars">
      <div class="nut-bars-plot">${lineas}${barras}</div>
      <div class="nut-bars-axis">
        <span>${primero ? primero.label : ''}</span>
        <span class="nut-bars-legend">${o.legend || ''}</span>
        <span>${ultimo ? ultimo.label : ''}</span>
      </div>
    </div>`;
}

// Serie de los últimos N días para un campo, con hueco donde no hay registro.
function nutSerie(days, campo, hasta, n) {
  const byDate = new Map((days || []).map(d => [d.date, d]));
  const out = [];
  for (let k = (n || NUT_TREND_DAYS) - 1; k >= 0; k--) {
    const date = nutShiftDate(hasta, -k);
    const d = byDate.get(date);
    const v = d && d.loggedV2 ? d[campo] : null;
    out.push({ date, v: (v == null || Number.isNaN(v)) ? null : v, label: formatDate(date) });
  }
  return out;
}

// ==================== RACHA ====================
function renderNutStreak(days, date) {
  const el = document.getElementById('nut-streak');
  if (!el) return;
  const r = deficitStreak(days, date);
  const semanas = weeklyDeficits(days);
  const ultima = semanas.length ? semanas[semanas.length - 1] : null;
  const adh = adherenceMode(days, date);

  el.innerHTML = `
    <div class="card nut-streak-card">
      <div class="nut-streak-main">
        <span class="nut-streak-ico">🔥</span>
        <div>
          <div class="nut-streak-val">${r.current} ${r.current === 1 ? 'day' : 'days'} in a deficit</div>
          <div class="nut-streak-sub">
            best streak ${r.best}
            ${ultima ? ` · this week ${ultima.avgDeficit > 0 ? '+' : ''}${nutFmt(ultima.avgDeficit)} kcal/day` : ''}
          </div>
        </div>
      </div>
      <div class="nut-streak-note">
        A day without a log breaks the streak: if you did not measure it, it does not count.
        Logged ${adh.perWeek}/7 · piloted by ${adh.pilot === 'tracker' ? 'the log' : 'the weight'}.
      </div>
    </div>`;
}

// ==================== TENDENCIAS ====================
function renderNutTrends(days, date) {
  const el = document.getElementById('nut-trends');
  if (!el) return;

  const ultimo = (days || []).filter(d => d.loggedV2).sort((a, b) => a.date.localeCompare(b.date)).pop();
  const objetivoKcal = (ultimo && ultimo.kcalTarget) || NUT_KCAL_REST;
  const sueloProt = (ultimo && ultimo.proteinFloor) || NUT_PROTEIN_FLOOR;

  const bloques = [
    {
      titulo: 'Calories',
      serie: nutSerie(days, 'calories', date),
      unit: ' kcal',
      refs: [{ value: objetivoKcal, label: `target ${nutFmt(objetivoKcal)}` }],
      legend: `green ±${NUT_BANDS.kcal.verde} · amber ±${NUT_BANDS.kcal.ambar}`,
      colorFor: (v, p) => {
        const byDate = new Map(days.map(d => [d.date, d]));
        const t = (byDate.get(p.date) || {}).kcalTarget || objetivoKcal;
        return nutKcalClass(v, t);
      },
    },
    {
      titulo: 'Protein',
      serie: nutSerie(days, 'protein', date),
      unit: ' g',
      refs: [{ value: sueloProt, label: `floor ${sueloProt} g` }],
      legend: `green ≥ floor · amber ≥ ${Math.round(NUT_BANDS.proteina.ambar * 100)}%`,
      colorFor: (v) => v >= sueloProt ? 'nut-verde'
        : v >= sueloProt * NUT_BANDS.proteina.ambar ? 'nut-ambar' : 'nut-rojo',
    },
    {
      titulo: 'Energy availability',
      serie: nutSerie(days, 'ea', date),
      unit: ' kcal/kg',
      refs: [{ value: NUT_EA_FLOOR, label: `floor ${NUT_EA_FLOOR}` }],
      legend: `REC-008 · green ≥${NUT_BANDS.ea.verde} · amber ≥${NUT_BANDS.ea.ambar}`,
      colorFor: (v) => ({ ok: 'nut-verde', bajo: 'nut-ambar', critico: 'nut-rojo' }[eaStatus(v)] || 'nut-neutral'),
    },
    {
      titulo: 'Unprocessed (NOVA 1-2)',
      serie: nutSerie(days, 'nova12Pct', date),
      unit: '%',
      refs: [{ value: NUT_BANDS.nova.verde, label: `${NUT_BANDS.nova.verde}%` }],
      legend: `% of kcal · green ≥${NUT_BANDS.nova.verde}% · amber ≥${NUT_BANDS.nova.ambar}%`,
      colorFor: (v) => v >= NUT_BANDS.nova.verde ? 'nut-verde'
        : v >= NUT_BANDS.nova.ambar ? 'nut-ambar' : 'nut-rojo',
    },
    {
      titulo: 'Fiber',
      serie: nutSerie(days, 'fiber', date),
      unit: ' g',
      refs: [{ value: NUT_FIBER_TARGET, label: `${NUT_FIBER_TARGET} g` }],
      legend: `target ${NUT_FIBER_TARGET} g/day`,
      colorFor: (v) => v >= NUT_FIBER_TARGET ? 'nut-verde'
        : v >= NUT_FIBER_TARGET * 0.7 ? 'nut-ambar' : 'nut-rojo',
    },
  ];

  el.innerHTML = bloques.map(b => `
    <div class="card nut-trend-block">
      <div class="nut-trend-head">
        <span class="nut-trend-title">${b.titulo}</span>
        <span class="nut-trend-legend">${b.legend}</span>
      </div>
      ${renderNutBars(b.serie, b)}
    </div>`).join('');
}

// ==================== DÉFICIT SEMANAL ====================
function renderNutWeekly(days) {
  const el = document.getElementById('nut-weekly');
  if (!el) return;
  const semanas = weeklyDeficits(days).slice(-8).reverse();
  if (!semanas.length) {
    showEmptyState(el, '📉', 'No complete weeks', 'It will appear once there are logged days.');
    return;
  }
  el.innerHTML = `<div class="recent-list">${semanas.map(w => {
    const bueno = w.avgDeficit < 0;
    return `
      <div class="history-item">
        <div class="hi-left">
          <div class="hi-title">Week of ${formatDate(w.weekStart)}</div>
          <div class="hi-sub">${nutFmt(w.avgKcal)} kcal/day · target ${nutFmt(w.avgTarget)} · ${w.days} ${w.days === 1 ? 'day' : 'days'}</div>
        </div>
        <div class="hi-right">
          <div class="hi-stat ${bueno ? 'nut-verde' : 'nut-rojo'}">${w.avgDeficit > 0 ? '+' : ''}${nutFmt(w.avgDeficit)}</div>
          <div class="hi-stat-sub">kcal/day</div>
        </div>
      </div>`;
  }).join('')}</div>`;
}

// ==================== CALIBRACIÓN DEL MANTENIMIENTO ====================
//
// La pieza que resuelve la incertidumbre que `nutrition-notes.md` declara y no puede
// cerrar: "el TDEE cae entre 2.720 y 3.110 según lo que se entrene de verdad", así que
// "el déficit real cae entre ~150 y ~540 kcal". Casi un factor de cuatro. Aquí la báscula
// arbitra: el modelo es la hipótesis, el peso es la evidencia.
async function renderNutCalibration(days, date) {
  const el = document.getElementById('nut-calibration');
  if (!el) return;
  const weights = (await dbGetAll('bodyweight').catch(() => [])) || [];
  const cal = wearableCalibration(days, weights, date);
  const coste = await renderNutCostLine(date);

  if (!cal.ok) {
    const motivo = cal.reason === 'pocos-datos'
      ? `10 logged days out of the last 14 are needed; there are ${cal.have}.`
      : 'Weigh-ins are needed at the start and the end of the 14-day window.';
    el.innerHTML = `<div class="card nut-calib-card">
      <div class="nut-calib-none">${motivo}</div>
      <div class="nut-calib-note">
        With no signal there is no verdict. A number here without enough data would be
        arithmetic on noise.
      </div>
    </div>` + coste;
    return;
  }

  const correccion = maintenanceCorrection(cal);
  const veredictos = {
    calibrado: {
      cls: 'nut-verde',
      txt: 'Modelled maintenance matches the scale. No correction.',
    },
    sobreestima: {
      cls: 'nut-ambar',
      txt: `You lost less than predicted: your real maintenance is <strong>~${nutFmt(Math.abs(correccion || 0))} kcal/day lower</strong> than the model estimates.`,
    },
    subestima: {
      cls: 'nut-teal',
      txt: `You lost more than predicted: your real maintenance is <strong>~${nutFmt(Math.abs(correccion || 0))} kcal/day higher</strong> than the model estimates.`,
    },
  };
  const v = veredictos[cal.veredicto];

  el.innerHTML = `
    <div class="card nut-calib-card">
      <div class="nut-calib-verdict ${v.cls}">${v.txt}</div>
      <div class="nut-calib-grid">
        <div><span class="ncg-val">${cal.predichoKg > 0 ? '+' : ''}${cal.predichoKg} kg</span><span class="ncg-lbl">predicted by the balance</span></div>
        <div><span class="ncg-val">${cal.realKg > 0 ? '+' : ''}${cal.realKg} kg</span><span class="ncg-lbl">actual (3-day avg)</span></div>
        <div><span class="ncg-val">${cal.days}</span><span class="ncg-lbl">days with data</span></div>
      </div>
      <div class="nut-calib-note">
        Window ${formatDate(cal.start)} – ${formatDate(cal.end)}. Both ends use 3-day rolling
        averages: with single weigh-ins, 400 g of water contaminates the verdict.
        Below ${NUT_CALIB_MIN_SIGNAL} kcal/day no correction is issued — that is the noise
        floor of the window.
        <br><br>
        The expenditure being compared is <strong>modelled, not measured</strong>: there is no
        energy-expenditure field in the pipeline (122 wellness rows, zero energy fields). It is
        built from Katch-McArdle BMR over measured FFM, NEAT from steps, session expenditure and
        the thermic effect. It is a trend, not a measurement.
      </div>
    </div>` + coste;
}

// Lo que cuesta de verdad el parseo por foto. El modelo se eligió sobre una estimación de
// ~4 $/mes; esto la sustituye por el número medido, para poder revisar la decisión con
// datos en vez de con mi aritmética.
async function renderNutCostLine(date) {
  const meals = (await dbGetAll('meals').catch(() => [])) || [];
  const c = photoCostSummary(meals, date);
  if (!c.fotos) return '';
  const eur = (usd) => usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Proyección a mes completo desde el ritmo del mes en curso.
  const dia = Number(String(date).slice(8, 10)) || 1;
  const proyeccion = (c.totalUsd / dia) * 30;
  return `
    <div class="card nut-cost-card">
      <div class="nut-trend-title">Parsing cost</div>
      <div class="nut-cost-grid">
        <div><span class="ncg-val">$${eur(c.totalUsd)}</span><span class="ncg-lbl">this month (${c.fotos} ${c.fotos === 1 ? 'photo' : 'photos'})</span></div>
        <div><span class="ncg-val">$${c.mediaUsd.toFixed(3)}</span><span class="ncg-lbl">per photo</span></div>
        <div><span class="ncg-val">$${eur(proyeccion)}</span><span class="ncg-lbl">30-day projection</span></div>
      </div>
      <div class="nut-calib-note">
        Real tokens returned by the function, at <code>${NUT_AI_MODEL}</code> prices
        ($5 / $25 per million). If the projection runs away, dropping to Haiku 4.5 is one
        constant in the edge function: ~5× cheaper, and the hard part is no longer done by the
        model — the macros come from the library.
      </div>
    </div>`;
}

// ==================== LEADERBOARD DE ALIMENTOS ====================
//
// Lo que convierte tu propia lista de alimentos en herramienta de conducta, que es la mejor
// idea de Caltrack. La diferencia: aquí el score se puede recalcular a mano — su fórmula
// está impresa debajo de la tabla y fijada en tests/verify-nutrition-v2.mjs.

let _nutFoodSort = 'score';

async function renderNutFoods() {
  const el = document.getElementById('nut-foods');
  if (!el) return;

  const foods = (await dbGetAll('foods').catch(() => [])) || [];
  if (!foods.length) {
    showEmptyState(el, '🥩', 'Empty library', 'It is seeded when you sign in.');
    return;
  }

  // v11.76: veces registrado y kcal acumuladas son CAMPOS (`useCount` / `useKcal`), que
  // mantiene `saveMeal`. Antes esto escaneaba todas las comidas —todas, no las del mes— en
  // cada pintado de la pestaña, y el historial sólo crece. El uso histórico de antes de
  // v11.76 lo recupera `nutBackfillFoodUsage()` una vez, al arrancar.
  const filas = foods.map(f => ({
    f, score: foodScore(f), pd: proteinDensity(f),
    kcalPorG: (Number(f.kcal100) || 0) / 100,
    veces: Number(f.useCount) || 0,
    kcalTotal: Math.round(Number(f.useKcal) || 0),
  }));

  const ordenes = {
    score: (a, b) => b.score - a.score,
    pd: (a, b) => b.pd - a.pd,
    veces: (a, b) => b.veces - a.veces || b.score - a.score,
    kcal: (a, b) => b.kcalTotal - a.kcalTotal,
    nova: (a, b) => (a.f.nova || 9) - (b.f.nova || 9) || b.score - a.score,
  };
  const ordenadas = [...filas].sort(ordenes[_nutFoodSort] || ordenes.score);

  // "A evitar": densidad calórica alta y score bajo. Ordenadas por kcal/g, como Caltrack.
  const aEvitar = [...filas]
    .filter(r => r.score <= 25 && r.kcalPorG >= 1.5)
    .sort((a, b) => b.kcalPorG - a.kcalPorG)
    .slice(0, 8);

  const th = (key, label) =>
    `<th data-sort="${key}" class="${_nutFoodSort === key ? 'nut-th-active' : ''}">${label}</th>`;

  const fila = (r) => `
    <tr>
      <td class="nut-food-name">
        ${escapeHtml(r.f.name)}
        ${r.f.verified === false ? '<span class="nut-tag nut-tag-nuevo">unverified</span>' : ''}
        ${r.f.serving ? `<span class="nut-food-serving">${escapeHtml(r.f.serving.label)} · ${Math.round(r.f.serving.grams)} g</span>` : ''}
      </td>
      <td class="nut-food-score"><span class="nut-score-pill ${r.score >= 70 ? 'nut-verde' : r.score >= 40 ? 'nut-ambar' : 'nut-rojo'}">${r.score}</span></td>
      <td>${r.pd.toFixed(1)}</td>
      <td>${r.f.nova}</td>
      <td>${r.veces || '—'}</td>
      <td>${r.kcalTotal ? nutFmt(r.kcalTotal) : '—'}</td>
    </tr>`;

  el.innerHTML = `
    <div class="card">
      <div class="nut-foods-head">
        <span class="nut-trend-title">Your foods</span>
        <span class="nut-trend-legend">${filas.length} · tap a column to sort</span>
      </div>
      <div class="nut-table-wrap">
        <table class="nut-table" id="nut-foods-table">
          <thead><tr>
            <th>Food</th>${th('score', 'Score')}${th('pd', 'g P/100kcal')}${th('nova', 'NOVA')}${th('veces', '×')}${th('kcal', 'kcal tot.')}
          </tr></thead>
          <tbody>${ordenadas.map(fila).join('')}</tbody>
        </table>
      </div>
      <div class="nut-formula">
        <strong>score</strong> = min(density/${NUT_PD_CAP}, 1)×100 − NOVA penalty
        (1:0 · 2:10 · 3:25 · 4:45) + min(fiber/${NUT_FIBER_CAP}, 1)×10, clamped to 0-100.
        Reproducible by hand and pinned in the tests: skyr 87 · chicken breast 94 · lentils 49 ·
        soda 0. Whey comes out at 55 despite its 80 g of protein because it is NOVA 4 — that is
        not a bug, it is the quality axis doing its job.
      </div>
    </div>

    ${aEvitar.length ? `
    <div class="section-label" style="margin-top:20px">To avoid</div>
    <div class="card">
      <div class="nut-trend-legend" style="margin-bottom:10px">
        Low score and a lot of energy per gram — they slip in without filling you. Sorted by kcal/g.
      </div>
      <div class="nut-table-wrap">
        <table class="nut-table">
          <thead><tr><th>Food</th><th>kcal/g</th><th>Score</th><th>NOVA</th></tr></thead>
          <tbody>${aEvitar.map(r => `
            <tr>
              <td class="nut-food-name">${escapeHtml(r.f.name)}</td>
              <td><strong>${r.kcalPorG.toFixed(2)}</strong></td>
              <td><span class="nut-score-pill nut-rojo">${r.score}</span></td>
              <td>${r.f.nova}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>` : ''}
  `;

  el.querySelectorAll('[data-sort]').forEach(h => {
    h.addEventListener('click', () => { _nutFoodSort = h.dataset.sort; renderNutFoods(); });
  });
}

// ==================== COACH "RESTO DEL DÍA" ====================
//
// Determinista y offline: NO llama al LLM. Con la biblioteca poblada no hace falta — el
// hueco se cierra buscando entre los alimentos que ya comes. Instantáneo, gratis, y no
// propone nada que no esté en tu cocina. Caltrack gasta una llamada de IA para esto.
async function renderNutCoach(day) {
  const el = document.getElementById('nut-coach');
  if (!el) return;
  if (!day || !day.loggedV2) { el.innerHTML = ''; return; }

  const foods = (await dbGetAll('foods').catch(() => [])) || [];
  const r = restOfDay(day, foods, {});

  if (r.done) {
    el.innerHTML = `<div class="card nut-coach-card">
      <div class="nut-coach-head"><span>🤖</span> Rest of the day</div>
      <div class="nut-coach-ok">
        Protein floor covered (${Math.round(day.protein)} of ${day.proteinFloor} g).
        ${r.huecoKcal > 0 ? `You have ${nutFmt(r.huecoKcal)} kcal of room left.`
                          : `You are ${nutFmt(-r.huecoKcal)} kcal over target.`}
      </div>
    </div>`;
    return;
  }

  if (!r.sugerencias.length) {
    el.innerHTML = `<div class="card nut-coach-card">
      <div class="nut-coach-head"><span>🤖</span> Rest of the day</div>
      <div class="nut-coach-ok">
        ${r.huecoProt} g of protein short and ${r.huecoKcal > 0 ? `only ${nutFmt(r.huecoKcal)} kcal` : 'no room'} of budget left.
        Nothing in your library closes it without going over: today it is accept the gap or go slightly over.
      </div>
    </div>`;
    return;
  }

  el.innerHTML = `<div class="card nut-coach-card">
    <div class="nut-coach-head"><span>🤖</span> Rest of the day</div>
    <div class="nut-coach-gap">
      <strong>${r.huecoProt} g</strong> of protein short · room <strong>${nutFmt(r.huecoKcal)} kcal</strong>
    </div>
    <div class="nut-coach-list">
      ${r.sugerencias.map(s => `
        <div class="nut-coach-row">
          <div>
            <div class="nut-coach-food">${s.name}</div>
            <div class="nut-coach-macros">${s.grams} g · ${nutFmt(s.kcal)} kcal · ${s.protein} g P</div>
          </div>
          <button class="btn-secondary nut-coach-add" data-coach-food="${s.foodId}" data-coach-g="${s.grams}">Add</button>
        </div>`).join('')}
    </div>
    <div class="nut-coach-note">
      Verified foods from your library only: proposing a gram amount on macros a photo
      estimated would be an estimate squared.
    </div>
  </div>`;

  el.querySelectorAll('[data-coach-food]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const food = foods.find(f => f.id === btn.dataset.coachFood);
      if (!food) return;
      const item = itemFromFood(food, parseFloat(btn.dataset.coachG), { estimated: false, confidence: 1 });
      item.per100 = {
        kcal100: food.kcal100, protein100: food.protein100, carbs100: food.carbs100,
        fat100: food.fat100, fiber100: food.fiber100, alcohol100: food.alcohol100 || 0,
        nova: food.nova,
      };
      item.resolved = 'biblioteca';
      openNutConfirm({ items: [item], mealType: nutGuessMealType(), notes: '' });
    });
  });
}

// ==================== BINDINGS ====================
// Se llaman desde bindEvents() de app.js, después de que exista el DOM.
function bindNutricionV2() {
  // Tres vias de entrada al mismo compositor.
  const abrir = (idBoton, idInput) => {
    const b = document.getElementById(idBoton);
    const i = document.getElementById(idInput);
    if (!b || !i) return;
    b.addEventListener('click', () => i.click());
    i.addEventListener('change', async () => {
      const files = i.files;
      i.value = '';   // permite volver a elegir el mismo fichero sin recargar
      await nutAddFiles(files);
    });
  };
  abrir('btn-nut-photo', 'nut-photo-input');
  abrir('btn-nut-gallery', 'nut-gallery-input');

  const escribir = document.getElementById('btn-nut-write');
  if (escribir) escribir.addEventListener('click', () => {
    nutOpenComposer();
    const n = document.getElementById('nut-composer-note');
    if (n) n.focus();
  });

  const analizar = document.getElementById('btn-nut-analyze');
  if (analizar) analizar.addEventListener('click', nutAnalyze);
  const descartar = document.getElementById('btn-nut-discard');
  if (descartar) descartar.addEventListener('click', () => { nutCloseComposer(); nutStatus(null); });
  const close = document.getElementById('nut-confirm-close');
  if (close) close.addEventListener('click', closeNutConfirm);
  const save = document.getElementById('nut-confirm-save');
  if (save) save.addEventListener('click', nutSaveConfirmed);
  const add = document.getElementById('nut-confirm-add');
  if (add) add.addEventListener('click', nutAddItemManual);
  const guardarPlato = document.getElementById('nut-confirm-save-food');
  if (guardarPlato) guardarPlato.addEventListener('click', nutSaveMealAsFood);
  const energy = document.getElementById('btn-nut-energy');
  if (energy) energy.addEventListener('click', nutSaveEnergy);

  document.querySelectorAll('#nut-tabs .stats-tab').forEach(btn => {
    btn.addEventListener('click', () => switchNutGroup(btn.dataset.nutGroup));
  });
}

// ==================== EXPORTS PARA EL TEST ====================
// tests/verify-nutrition-v2.mjs importa este bloque. En el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    proteinDensity, foodScore, energyAvailability, eaFloorKcal, eaStatus,
    aggregateMeals, adherenceMode, weeklyDeficits, deficitStreak,
    wearableCalibration, nutRollingWeight, restOfDay,
    nutShiftDate, nutIsoWeekStart,
    nutNormalize, nutSlug, findFood, itemFromFood, FOODS_SEED,
    bmrKatchMcArdle, maintenanceKcal, maintenanceCorrection,
    photoCostUsd, photoCostSummary, NUT_AI_MODEL,
    NUT_NEAT_BASE_FACTOR, NUT_KCAL_PER_STEP_PER_KG, NUT_TEF_FRACTION,
    NUT_NOVA_PENALTY, NUT_PD_CAP, NUT_EA_FLOOR, NUT_FFM_KG_FALLBACK,
    NUT_PROTEIN_FLOOR, NUT_KCAL_TRAINING, NUT_KCAL_REST, NUT_BANDS,
    NUT_ADHERENCE_MIN, NUT_ADHERENCE_WINDOW, NUT_CALIB_MIN_SIGNAL,
    // F-20 / F-21 (v11.73): carbohidrato por tipo de día (REC-007) y proteína por comida.
    NUT_CARB_TARGETS, NUT_PROTEIN_MEAL_MIN, NUT_PROTEIN_MEAL_MAX,
    NUT_LONGRUN_KM, NUT_LONGRUN_MIN, nutDayType, nutDayTargets, _nutDayTypeLabel,
    // v11.76: medidas de verdad, señal de uso, picker y chips. Todo puro.
    foodServings, foodServing, servingGrams, servingCost, nutServingLine,
    nutFoodUsageMap, nutBumpFood, nutPickerSections, nutChipLine,
    NUT_DEFAULT_SERVING, NUT_CHIP_DEFS, NUT_PICKER_SECTION_MAX, NUT_DISH_SERVING_LABEL,
  };
}
