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
// ARQUITECTURA DE DATOS — tres stores, un solo escritor por store:
//   `foods`      biblioteca canónica, macros por 100 g. Crece con el uso.
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

// Objetivo de carbohidratos por tipo de día (nutrition-notes.md v3.0). Redistribuye
// sin cambiar el total de calorías. Secundario: informa, no puntúa.
const NUT_CARB_TARGETS = { lower: 350, upper: 285, longrun: 310, rest: 250 };

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

// ==================== AGREGADO DEL DÍA ====================
//
// Suma los items de todas las comidas de una fecha. Único sitio donde se calculan
// los totales: si esta función y la UI discrepan alguna vez, es porque alguien
// sumó por su cuenta en otro lado.

function aggregateMeals(meals) {
  const acc = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, alcohol: 0,
                kcalNova12: 0, mealCount: 0, itemCount: 0, estimatedItems: 0 };
  for (const m of meals || []) {
    acc.mealCount++;
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
    }
  }
  // % de las calorías del día que vienen de alimentos sin procesar o mínimamente
  // procesados. null y no 0 cuando no se comió nada: 0% sería mentir.
  acc.nova12Pct = acc.calories > 0 ? Math.round((acc.kcalNova12 / acc.calories) * 100) : null;
  ['calories', 'protein', 'carbs', 'fat', 'fiber', 'alcohol'].forEach(k => { acc[k] = Math.round(acc[k]); });
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

// ==================== CONTEXTO DEL DÍA ====================

// Masa libre de grasa desde la última medición con %grasa. Sin medición, el valor de
// docs/profile.md. Importa que sea FFM y no peso corporal: dividir la EA por 87,1 en vez
// de 72,8 convierte un 26 (bajo el umbral REC-008) en un 21,7 que parece otro problema.
async function nutFfmKg() {
  try {
    const rows = (await dbGetAll('bodyweight')) || [];
    const withBf = rows.filter(r => r.weight > 0 && r.bfPct > 0)
                       .sort((a, b) => a.date.localeCompare(b.date));
    if (withBf.length) {
      const last = withBf[withBf.length - 1];
      return Math.round(last.weight * (1 - last.bfPct / 100) * 10) / 10;
    }
  } catch (e) { /* el store puede no existir todavía */ }
  return NUT_FFM_KG_FALLBACK;
}

// ¿Es día de entreno? Se resuelve por el PLAN y no solo por lo ya registrado, porque el
// objetivo de calorías hay que conocerlo en el desayuno, no al acabar el día. Un entreno
// registrado que el plan no preveía sí manda: eso ya es un hecho, no una previsión.
async function nutIsTrainingDay(date) {
  try {
    const [w, r, s] = await Promise.all([
      dbGetAll('workouts').catch(() => []),
      dbGetAll('runs').catch(() => []),
      dbGetAll('sessions').catch(() => []),
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
    const runs = (await dbGetAll('runs').catch(() => [])) || [];
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

// El "contrato del día": los cuatro números de la cabecera. Salen de settings cuando el
// usuario los ha tocado, y de nutrition-notes.md si no.
async function nutDayTargets(date) {
  const s = (typeof state !== 'undefined' && state.settings) || {};
  const training = await nutIsTrainingDay(date);
  const kcalTarget = training
    ? (Number(s.calorieTargetTraining) || NUT_KCAL_TRAINING)
    : (Number(s.calorieTargetRest) || NUT_KCAL_REST);
  return {
    date,
    training,
    kcalTarget,
    proteinFloor: Number(s.proteinTarget) || NUT_PROTEIN_FLOOR,
    fiberTarget: NUT_FIBER_TARGET,
    fatFloor: NUT_FAT_FLOOR,
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
async function recomputeNutritionDay(date) {
  const meals = await nutMealsForDate(date);
  const agg = aggregateMeals(meals);
  const targets = await nutDayTargets(date);
  const ffm = await nutFfmKg();
  const eee = await nutEeeForDate(date);
  const ea = energyAvailability(agg.calories, eee, ffm);

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
    kcalTarget: targets.kcalTarget,
    proteinFloor: targets.proteinFloor,
    trainingDay: targets.training,
    eee,
    ffm,
    ea: ea == null ? null : Math.round(ea * 10) / 10,
    loggedV2: agg.mealCount > 0,
    updatedAt: Date.now(),
  };
  await smartPut('nutrition', row);
  return row;
}

// ==================== ACCESO A COMIDAS ====================

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
  await recomputeNutritionDay(m.date);
  return m;
}

async function deleteMeal(id, date) {
  await smartDelete('meals', id);
  await recomputeNutritionDay(date);
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
  return n;
}

// ==================== UI: PESTAÑA NUTRICIÓN ====================
//
// Una regla de presentación, tomada de Caltrack y que es la razón de que su dashboard se
// lea bien siendo densísimo: TODO UMBRAL SE IMPRIME JUNTO A SU COLOR. Nunca un semáforo
// cuyo criterio haya que adivinar.

const NUT_MEAL_LABELS = { desayuno: 'Desayuno', comida: 'Comida', cena: 'Cena', snack: 'Snack' };

function nutSupa() {
  return (typeof window !== 'undefined' && window.getSupaClient) ? window.getSupaClient() : null;
}

function nutFmt(n) {
  return (Number(n) || 0).toLocaleString('es-ES');
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
  if (label) label.textContent = 'Hoy — ' + formatDate(date);

  // Recalcular al entrar: los objetivos dependen de si hoy hay sesión y el EEE de lo que
  // se haya registrado desde la última visita.
  const day = await recomputeNutritionDay(date);
  const days = (await dbGetAll('nutrition').catch(() => [])) || [];
  const adh = adherenceMode(days, date);

  renderNutContract(day, adh);
  renderNutToday(day);
  await renderNutMeals(date);

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
    ? `<span class="nut-pill nut-pill-ok">piloto: registro</span>`
    : `<span class="nut-pill nut-pill-warn">piloto: peso · ${adh.perWeek}/7 días</span>`;

  el.innerHTML = `
    <div class="nut-contract-top">
      <span class="nut-contract-day">hoy · ${day.trainingDay ? 'entreno' : 'descanso'}</span>
      ${badge}
    </div>
    <div class="nut-contract-grid">
      <div class="nut-contract-cell">
        <span class="ncc-val">${nutFmt(day.kcalTarget)}</span>
        <span class="ncc-lbl">kcal objetivo</span>
      </div>
      <div class="nut-contract-cell">
        <span class="ncc-val">${day.proteinFloor}</span>
        <span class="ncc-lbl">g proteína suelo</span>
      </div>
      <div class="nut-contract-cell">
        <span class="ncc-val">${NUT_EA_FLOOR}</span>
        <span class="ncc-lbl">EA mínima</span>
      </div>
      <div class="nut-contract-cell">
        <span class="ncc-val">${day.eee ? '−' + nutFmt(day.eee) : '—'}</span>
        <span class="ncc-lbl">kcal de sesión</span>
      </div>
    </div>
    ${pilotoTracker ? '' : `<div class="nut-contract-note">
      Con menos de 5 de 7 días registrados las calorías las decide la pendiente del peso
      (regla de nutrition-notes.md), no este registro.
    </div>`}
  `;
}

// ── Totales del día + disponibilidad energética ─────────────────────────────────────
function renderNutToday(day) {
  const el = document.getElementById('nut-today');
  if (!el) return;

  const kcal = day.calories || 0;
  const restan = day.kcalTarget - kcal;
  const protPct = Math.min((day.protein || 0) / Math.max(day.proteinFloor, 1), 1);
  const protClass = (day.protein || 0) >= day.proteinFloor ? 'nut-verde'
    : protPct >= NUT_BANDS.proteina.ambar ? 'nut-ambar' : 'nut-rojo';

  const ea = day.ea;
  const eaCls = { ok: 'nut-verde', bajo: 'nut-ambar', critico: 'nut-rojo', 'sin-datos': 'nut-neutral' }[eaStatus(ea)];
  const eaFaltan = ea != null && ea < NUT_EA_FLOOR
    ? Math.round((NUT_EA_FLOOR - ea) * (day.ffm || NUT_FFM_KG_FALLBACK)) : 0;

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
      ${kcal === 0 ? 'Sin registrar todavía'
        : restan > 0 ? `quedan ${nutFmt(restan)} kcal` : `${nutFmt(-restan)} kcal por encima`}
      <span class="nut-legend">verde ±${NUT_BANDS.kcal.verde} · ámbar ±${NUT_BANDS.kcal.ambar}</span>
    </div>

    <div class="nut-metric">
      <div class="nut-metric-head">
        <span class="nut-metric-name">Proteína</span>
        <span class="nut-metric-val ${protClass}">${Math.round(day.protein || 0)} / ${day.proteinFloor} g</span>
      </div>
      <div class="nut-bar"><div class="nut-bar-fill ${protClass}" style="width:${Math.round(protPct * 100)}%"></div></div>
    </div>

    <div class="nut-metric">
      <div class="nut-metric-head">
        <span class="nut-metric-name">Disponibilidad energética</span>
        <span class="nut-metric-val ${eaCls}">${ea == null ? '—' : ea.toFixed(1)} kcal/kg FFM</span>
      </div>
      <div class="nut-metric-note">
        suelo ${NUT_EA_FLOOR} (REC-008) · FFM ${day.ffm || NUT_FFM_KG_FALLBACK} kg
        ${eaFaltan > 0 ? ` · <strong>faltan ${nutFmt(eaFaltan)} kcal</strong>` : ''}
      </div>
    </div>

    <div class="nut-metric">
      <div class="nut-metric-head">
        <span class="nut-metric-name">Sin procesar (NOVA 1-2)</span>
        <span class="nut-metric-val ${novaCls}">${nova == null ? '—' : nova + '%'}</span>
      </div>
      <div class="nut-metric-note">de las kcal del día · verde ≥${NUT_BANDS.nova.verde}% · ámbar ≥${NUT_BANDS.nova.ambar}%</div>
    </div>

    <div class="nut-macros">
      <span>carbos <strong>${Math.round(day.carbs || 0)} g</strong></span>
      <span>grasa <strong>${Math.round(day.fat || 0)} g</strong></span>
      <span>fibra <strong>${Math.round(day.fiber || 0)} g</strong> / ${NUT_FIBER_TARGET}</span>
      ${day.alcoholG ? `<span>alcohol <strong>${Math.round(day.alcoholG)} g</strong></span>` : ''}
    </div>
  `;
}

// ── Comidas del día ─────────────────────────────────────────────────────────────────
async function renderNutMeals(date) {
  const container = document.getElementById('nut-meals');
  if (!container) return;
  const meals = await nutMealsForDate(date);

  if (!meals.length) {
    showEmptyState(container, '📷', 'Sin comidas hoy',
      'Haz una foto del plato y corrige los gramos si hace falta.');
    return;
  }

  container.innerHTML = meals.map(m => {
    const agg = aggregateMeals([m]);
    // Los items con poca confianza se marcan: son los que conviene corregir a mano.
    const items = (m.items || []).map(it => {
      const dudoso = (it.confidence != null && it.confidence < 0.5);
      return `<span class="nut-item-chip${dudoso ? ' nut-item-chip-dudoso' : ''}">${it.name} ${Math.round(it.grams)} g</span>`;
    }).join('');
    return `
      <div class="history-item nut-meal-row">
        <div class="hi-left">
          <div class="hi-title">${NUT_MEAL_LABELS[m.type] || 'Comida'} · ${m.time || ''}</div>
          <div class="nut-item-chips">${items}</div>
        </div>
        <div class="hi-right" style="display:flex;align-items:center;gap:6px">
          <div>
            <div class="hi-stat">${nutFmt(agg.calories)}</div>
            <div class="hi-stat-sub">${Math.round(agg.protein)} g P</div>
          </div>
          <button class="hi-delete" data-del-meal="${m.id}">&times;</button>
        </div>
      </div>`;
  }).join('');

  container.querySelectorAll('[data-del-meal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.delMeal;
      const removed = meals.find(m => m.id === id);
      await deleteMeal(id, date);
      renderNutricionV2();
      toast('Comida borrada', {
        label: 'Deshacer',
        callback: async () => { if (removed) { await saveMeal(removed); renderNutricionV2(); } },
      });
    });
  });
}

// ==================== CAPTURA POR FOTO ====================
//
// El flujo completo: foto → Storage → edge function → hoja de confirmación → IndexedDB.
// La foto PROPONE y el usuario DISPONE: nada se guarda sin pasar por la confirmación,
// porque un gramaje estimado que entra solo deja de ser estimación y pasa a ser un dato
// falso que además contamina el déficit semanal y la calibración del wearable.

let _nutPending = null;   // resultado del parseo en espera de confirmación

function nutStatus(msg, kind) {
  const el = document.getElementById('nut-photo-status');
  if (!el) return;
  if (!msg) { el.classList.add('hidden'); el.innerHTML = ''; return; }
  el.classList.remove('hidden');
  el.className = 'nut-status nut-status-' + (kind || 'info');
  el.innerHTML = msg;
}

async function nutHandlePhoto(file) {
  if (!file) return;

  const supa = nutSupa();
  const user = (typeof window !== 'undefined' && window.getSupaUser) ? await window.getSupaUser() : null;

  // El paso de IA necesita red por definición. Cuando no la hay se abre la hoja vacía
  // para registrar a mano desde la biblioteca: así el registro sigue funcionando sin
  // cobertura, que es la mitad del valor de que esto sea una PWA.
  if (!supa || !user || !navigator.onLine) {
    nutStatus('Sin conexión o sin sesión: añade los alimentos a mano desde tu biblioteca.', 'warn');
    openNutConfirm({ items: [], mealType: nutGuessMealType(), notes: '' });
    return;
  }

  try {
    nutStatus('Subiendo la foto…', 'info');
    const ext = (file.name || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const photoPath = `${user.id}/${today()}_${Date.now()}.${ext}`;

    const { error: upErr } = await supa.storage.from('meal-photos')
      .upload(photoPath, file, { contentType: file.type || 'image/jpeg', upsert: false });
    if (upErr) throw new Error('No se pudo subir la foto: ' + upErr.message);

    nutStatus('Analizando el plato…', 'info');
    const { data, error } = await supa.functions.invoke('parse-meal-photo', { body: { photoPath } });
    if (error) throw new Error(error.message || 'La función de análisis falló');
    if (data && data.error) throw new Error(data.error);
    if (!data || !data.ok) throw new Error('Respuesta inesperada del análisis');

    nutStatus(null);
    if (!data.items || !data.items.length) {
      toast('No se reconoció comida en la foto');
      openNutConfirm({ items: [], mealType: nutGuessMealType(), notes: data.notes || '', photoPath });
      return;
    }
    openNutConfirm({ ...data, photoPath });
  } catch (e) {
    console.error('[Nutrición] foto:', e);
    nutStatus(`${e.message}. Puedes añadirlo a mano.`, 'error');
    openNutConfirm({ items: [], mealType: nutGuessMealType(), notes: '' });
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

// ── Hoja de confirmación ────────────────────────────────────────────────────────────

function openNutConfirm(result) {
  _nutPending = {
    photoPath: result.photoPath || null,
    notes: result.notes || '',
    type: result.mealType || nutGuessMealType(),
    items: (result.items || []).map(it => ({ ...it })),
  };
  const sel = document.getElementById('nut-confirm-type');
  if (sel) sel.value = _nutPending.type;
  const notes = document.getElementById('nut-confirm-notes');
  if (notes) {
    notes.innerHTML = _nutPending.notes
      ? `<span class="nut-ai-ico">🤖</span> ${_nutPending.notes}` : '';
    notes.classList.toggle('hidden', !_nutPending.notes);
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
    cont.innerHTML = '<div class="nut-empty-items">Añade los alimentos con el botón de abajo.</div>';
  } else {
    cont.innerHTML = items.map((it, i) => {
      const dudoso = it.confidence != null && it.confidence < 0.5;
      const nuevo = it.resolved === 'nuevo' || !it.foodId;
      return `
        <div class="nut-item-row">
          <div class="nut-item-main">
            <div class="nut-item-name">
              ${it.name}
              ${nuevo ? '<span class="nut-tag nut-tag-nuevo">nuevo</span>' : ''}
              ${dudoso ? '<span class="nut-tag nut-tag-dudoso">poco fiable</span>' : ''}
            </div>
            <div class="nut-item-macros" data-macros="${i}">
              ${nutFmt(it.kcal)} kcal · ${Math.round(it.protein)} g P
              · ${Math.round(it.carbs)} C · ${Math.round(it.fat)} G
            </div>
          </div>
          <div class="nut-item-grams">
            <input type="number" inputmode="numeric" step="10" min="0"
                   value="${Math.round(it.grams)}" data-grams="${i}" class="text-input sm">
            <span class="nut-item-unit">g</span>
          </div>
          <button class="hi-delete" data-del-item="${i}">&times;</button>
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

  renderNutConfirmTotals();
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
    <span><strong>${Math.round(agg.protein)}</strong> g proteína</span>
    <span>${_nutPending.items.length} ${_nutPending.items.length === 1 ? 'alimento' : 'alimentos'}</span>
  `;
}

// Añadir a mano desde la biblioteca: también es la vía cuando no hay red.
async function nutAddItemManual() {
  const foods = (await dbGetAll('foods').catch(() => [])) || [];
  if (!foods.length) { toast('La biblioteca está vacía'); return; }

  // Los mejores por score primero: es la lista que uno quiere ver en un selector corto.
  const ordenados = foods
    .map(f => ({ f, score: foodScore(f) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 40);

  const elegido = await showActionSheet('Añadir alimento', ordenados.map(o => ({
    label: `${o.f.name} · ${o.f.kcal100} kcal/100 g · ${o.score}`,
    value: o.f.id,
  })));
  if (!elegido) return;

  const food = foods.find(f => f.id === elegido);
  if (!food) return;
  const item = itemFromFood(food, 100, { estimated: false, confidence: 1 });
  item.per100 = {
    kcal100: food.kcal100, protein100: food.protein100, carbs100: food.carbs100,
    fat100: food.fat100, fiber100: food.fiber100, alcohol100: food.alcohol100 || 0,
    nova: food.nova,
  };
  item.resolved = 'biblioteca';
  _nutPending.items.push(item);
  renderNutConfirmItems();
}

async function nutSaveConfirmed() {
  if (!_nutPending) return;
  if (!_nutPending.items.length) { toast('Añade al menos un alimento'); return; }

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
    source: _nutPending.photoPath ? 'foto' : 'manual',
    aiNotes: _nutPending.notes || null,
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
  toast(`${NUT_MEAL_LABELS[type]} guardada · ${nutFmt(agg.calories)} kcal · ${Math.round(agg.protein)} g P`);
  renderNutricionV2();
}

// Guardar sólo la energía subjetiva. Sigue siendo un campo a mano porque no hay forma de
// derivarla, y el motor de fatiga la consume.
async function nutSaveEnergy() {
  const date = today();
  const row = (await dbGet('nutrition', date).catch(() => null)) || { date };
  row.energy = typeof getStarValue === 'function' ? getStarValue('nut-energy') : 3;
  await smartPut('nutrition', row);
  toast('Energía guardada');
}

// ==================== BINDINGS ====================
// Se llaman desde bindEvents() de app.js, después de que exista el DOM.
function bindNutricionV2() {
  const btn = document.getElementById('btn-nut-photo');
  const input = document.getElementById('nut-photo-input');
  if (btn && input) {
    btn.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';   // permite repetir la misma foto sin recargar
      await nutHandlePhoto(file);
    });
  }
  const close = document.getElementById('nut-confirm-close');
  if (close) close.addEventListener('click', closeNutConfirm);
  const save = document.getElementById('nut-confirm-save');
  if (save) save.addEventListener('click', nutSaveConfirmed);
  const add = document.getElementById('nut-confirm-add');
  if (add) add.addEventListener('click', nutAddItemManual);
  const energy = document.getElementById('btn-nut-energy');
  if (energy) energy.addEventListener('click', nutSaveEnergy);
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
    NUT_NOVA_PENALTY, NUT_PD_CAP, NUT_EA_FLOOR, NUT_FFM_KG_FALLBACK,
    NUT_PROTEIN_FLOOR, NUT_KCAL_TRAINING, NUT_KCAL_REST, NUT_BANDS,
    NUT_ADHERENCE_MIN, NUT_ADHERENCE_WINDOW, NUT_CALIB_MIN_SIGNAL,
  };
}
