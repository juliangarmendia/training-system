// ============================================================
// Coach v2 — motores deterministas del día (app/coach-engine.js)
// ============================================================
//
// QUÉ ES. Los motores puros del coach: sin DOM, sin IndexedDB, sin red. Reciben datos y
// devuelven datos. Son la mitad "hechos deterministas" del principio de diseño del plan
// (`docs/architecture/coach-v2-implementation-plan.md`, §Principios 1): los números los
// calcula código testeado y el LLM sólo decide y explica sobre ellos. Al playbook actual del
// cron le pedimos aritmética y falla (F-2 del audit: confunde rampRate con TSB); aquí no.
//
// POR QUÉ UN FICHERO APARTE. app.js son ~11.700 líneas de estado global y renderizado; nada
// de eso se puede cargar en Node. Estas funciones se prueban con `vm` sobre el fuente entero
// y su bloque `module.exports`, como `nutrition.js`. Un motor que no se puede probar sin un
// navegador acaba sin pruebas.
//
// SE CARGA ANTES DE app.js (index.html) y entra en el APP_SHELL del service worker. Sin
// bundler, las dos cosas son el contrato de carga: `verify-coach-wiring.mjs` las vigila.
//
// v11.55 (incremento 1) trajo los cimientos: los objetivos por defecto y la clave de semana
// ISO. v11.56 (incremento 2) añade la semana del bloque anclada a fecha (`blockWeekFromDates`,
// `mondayOf`, `anchorDateFromWeek`) y la progresión de cardio (`progressCardioMin`). v11.57
// (inc. 3) el kg del set (`suggestSetTarget`, `sessionReadout`). v11.59 (inc. 5) el readiness
// único (`computeReadinessFrom`) y el ajuste de la sesión (`adjustSessionForReadiness`,
// `_coachTrimAccessories`). El incremento 6 añade `suggestRunningWeek` / `goalProgress`.

// ==================== OBJETIVOS ====================
//
// El modelo de objetivos explícito que hasta ahora vivía repartido entre `docs/goals.md`,
// el prompt del cron y la cabeza del usuario. Se siembra en `settings.goals` la primera vez
// que arranca la app (`ensureGoals()` en app.js) y desde ahí lo leen el facts pack y
// `goalProgress`. Los valores de partida (87,1 kg el 2026-08-19; FFM 72,8 kg) son medidas
// reales, no supuestos: cambiarlos a mano invalida la pendiente y el ETA.
//
// `targetWeightKg` es un RANGO a propósito. Un número exacto convierte 80,4 kg en un fracaso
// y empuja a apretar el déficit justo cuando toca dejar de apretarlo.
// `daysPerWeek: null` → lo resuelve `settings.idealVariant`, que es donde el usuario ya
// elige 3/4/5/6 días. Dos fuentes para el mismo dato es cómo se desincronizan.
const COACH_GOALS_DEFAULT = {
  version: 1,
  source: 'user',
  primary: {
    type: 'fat-loss',
    targetWeightKg: [79, 81],
    rateKgPerWeek: 0.45,
    // Hito intermedio dicho por Julian el 2026-09-07: "bajar 5 kg en el corto plazo" → ~82 kg.
    // El coach mide el progreso contra el hito antes que contra el objetivo final.
    milestoneKg: 82,
    milestoneLabel: '−5 kg a corto plazo (2026-09-07)',
    waistCm: null,
    startWeightKg: 87.1,
    startDate: '2026-08-19',
  },
  preserve: {
    ffmKg: 72.8,
    anchorLifts: ['back-squat', 'bench-press', 'sumo-dl', 'ohp', 'barbell-row', 'chinups'],
  },
  secondary: {
    run10k: { targetKm: 10, comfortable: true, horizonWeeks: null },
  },
  constraints: {
    daysPerWeek: null,       // → settings.idealVariant
    sessionMaxMin: 75,
    lumbar: true,
    stepsFloor: 8000,
    proteinG: 185,
  },
};

// ==================== SEMANA ISO ====================
//
// Clave de semana canónica del sistema: 'YYYY-Www'. La usan `coach_reviews[id]`, el
// `weekKey` del plan (que decide si el objetivo del coach sigue vigente), el registro de
// decisiones y las fechas que `pushRunningPlanToIntervalsIcu` resuelve desde el lunes.
//
// ARITMÉTICA EN UTC A PROPÓSITO, igual que `nutShiftDate`/`nutIsoWeekStart` en nutrition.js.
// La app ya pagó una migración por fechas desplazadas (`tz_date_migration_v2`): construir un
// Date desde 'YYYY-MM-DD' y sumar días en local vuelve a pisar ese charco en los cambios de
// horario. Y un desplazamiento de un día aquí no es cosmético: mueve la frontera
// domingo/lunes, así que el objetivo del coach se declararía vencido un día antes de tiempo
// y la sesión del lunes caería en la semana anterior.
//
// Definición ISO 8601: la semana empieza en LUNES y la semana 1 es la que contiene el 4 de
// enero (equivalentemente: la que contiene el primer jueves del año). De ahí que 2026-01-01
// (jueves) sea 2026-W01 y 2027-01-03 (domingo) sea 2026-W53 — 2026 tiene 53 semanas.
function isoWeekKey(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dow = new Date(t).getUTCDay() || 7;               // domingo = 7, no 0
  const monday = t - (dow - 1) * 86400000;                // lunes de esta semana
  const thursday = new Date(monday + 3 * 86400000);       // el jueves fija el año ISO
  const isoYear = thursday.getUTCFullYear();
  const jan4 = Date.UTC(isoYear, 0, 4);
  const jan4Dow = new Date(jan4).getUTCDay() || 7;
  const week1Monday = jan4 - (jan4Dow - 1) * 86400000;    // lunes de la semana 1
  // Los dos extremos son lunes, así que la división es exacta (sin redondeos que arrastren).
  const week = Math.round((monday - week1Monday) / 604800000) + 1;
  return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// ==================== SEMANA DEL BLOQUE ====================
//
// El bloque es 4 semanas de carga + 1 de descarga (LOAD-004). Hasta v11.55 sólo existía la
// descarga: `isDeloadWeek()` en app.js hacía `((weekNum − anchorWeek) % 5) === 4` sobre el
// número de semana de app, y NADIE sabía si estaba en la semana 1 o en la 4 — las cuatro eran
// idénticas (audit Change 11, F-0). Con el índice explícito, el cardio puede progresar y la
// pantalla puede decir dónde estás.
//
// ANCLA POR FECHA, NO POR NÚMERO DE SEMANA (audit F-13). `getWeekNumber()` cuenta semanas
// desde `settings.startDate`, que se edita en Ajustes: mover esa fecha un día que cruce el
// lunes desplazaba `weekNum` en 1 y el deload cambiaba de semana **sin aviso**. Anclando a un
// lunes ISO, `startDate` vuelve a ser lo que debería haber sido siempre — una etiqueta.
//
// ARITMÉTICA EN UTC, igual que `isoWeekKey`: sumar días en local vuelve a pisar el charco de
// `tz_date_migration_v2` en los cambios de horario, y aquí un día de desplazamiento mueve la
// frontera domingo/lunes, o sea la semana del bloque entera.

/** 'YYYY-MM-DD' desde un timestamp UTC (inverso de Date.UTC, sin pasar por hora local). */
function _utcDayStr(ms) {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Timestamp UTC de medianoche de una fecha 'YYYY-MM-DD' (o null si no lo es). */
function _utcMs(dateStr) {
  const s = String(dateStr == null ? '' : dateStr).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d);
  return isFinite(t) ? t : null;
}

/**
 * El LUNES ISO de la semana a la que pertenece `dateStr`.
 * Domingo cuenta como último día de SU semana, no como primero de la siguiente.
 * @param {string} dateStr 'YYYY-MM-DD' (tolera un ISO completo; usa sólo los 10 primeros).
 * @returns {string|null} 'YYYY-MM-DD' del lunes, o null si la entrada no es una fecha.
 */
function mondayOf(dateStr) {
  const t = _utcMs(dateStr);
  if (t == null) return null;
  const dow = new Date(t).getUTCDay() || 7;      // domingo = 7, no 0
  return _utcDayStr(t - (dow - 1) * 86400000);
}

/**
 * En qué semana del bloque cae una fecha, contando desde un ancla.
 *
 * @param {string} dateStr          Fecha a situar, 'YYYY-MM-DD'. Se normaliza a su lunes ISO.
 * @param {string} anchorMondayStr  Ancla del bloque (`settings.deloadAnchorDate`), lunes ISO.
 *                                  Se normaliza también: `settings` es editable a mano.
 * @param {number} [blockWeeks=5]   Longitud del bloque (`DELOAD_BLOCK_WEEKS`).
 * @returns {{index: number|null, isDeload: boolean, weeksIntoBlock: number|null,
 *            label: 'build'|'deload'|'sin ancla', blockStartMonday: string|null,
 *            deloadMonday: string|null}}
 *
 * `index` va de 1 a `blockWeeks`; la ÚLTIMA es la descarga (4 build + 1 deload). Antes del
 * ancla, o sin ancla, devuelve `index: null` — no se extrapola hacia atrás: el ancla se pone
 * la primera vez que arranca la app y las semanas anteriores no pertenecen a ningún bloque.
 */
function blockWeekFromDates(dateStr, anchorMondayStr, blockWeeks = 5) {
  const n = Math.max(2, Math.floor(Number(blockWeeks)) || 5);
  const monday = mondayOf(dateStr);
  const anchor = mondayOf(anchorMondayStr);
  const none = {
    index: null, isDeload: false, weeksIntoBlock: null,
    label: 'sin ancla', blockStartMonday: null, deloadMonday: null,
  };
  if (!monday || !anchor) return none;
  // Los dos extremos son lunes, así que la división es exacta (sin redondeos que arrastren).
  const weeksIntoBlock = Math.round((_utcMs(monday) - _utcMs(anchor)) / 604800000);
  if (weeksIntoBlock < 0) return Object.assign({}, none, { weeksIntoBlock });
  const index = (weeksIntoBlock % n) + 1;
  const isDeload = index === n;
  const blockStartMs = _utcMs(anchor) + Math.floor(weeksIntoBlock / n) * n * 604800000;
  return {
    index,
    isDeload,
    weeksIntoBlock,
    label: isDeload ? 'deload' : 'build',
    blockStartMonday: _utcDayStr(blockStartMs),
    deloadMonday: _utcDayStr(blockStartMs + (n - 1) * 604800000),
  };
}

/**
 * Migración del ancla vieja: número de semana de app → lunes ISO.
 *
 * `settings.deloadAnchorWeek` era un número de `getWeekNumber()`, o sea "semanas desde
 * `startDate`". La fecha de esa semana es `startDate + (anchorWeek − 1) × 7 días`.
 *
 * ELECCIÓN DE ALINEACIÓN, documentada porque no es neutra: si `startDate` NO es lunes, las
 * semanas de app empiezan el día de la semana de `startDate` y no coinciden con las ISO. El
 * resultado se normaliza al **lunes ISO de la semana que contiene el inicio de esa semana de
 * app**, que es el lunes anterior o el mismo día. El deload puede quedar desplazado hasta 6
 * días respecto a la numeración vieja; a cambio, deja de moverse cada vez que alguien toca
 * `startDate` en Ajustes (F-13), que es el problema que esto viene a cerrar.
 *
 * @returns {string|null} lunes ISO 'YYYY-MM-DD', o null si falta cualquiera de los dos datos.
 */
function anchorDateFromWeek(startDateStr, anchorWeek) {
  const w = Math.floor(Number(anchorWeek));
  const t = _utcMs(startDateStr);
  if (t == null || !isFinite(w) || w < 1) return null;
  return mondayOf(_utcDayStr(t + (w - 1) * 604800000));
}

// ==================== PROGRESIÓN DE CARDIO ====================
//
// El problema que resuelve: `IDEAL_BLOCK_V1` lleva 40'/50' de cardio y 20' de finisher
// CONSTANTES desde junio. END-003 ("subir volumen aeróbico ~10 %/semana, con semanas de
// bajada") no estaba implementado en ningún sitio.
//
// EL 10 % ES UNA HEURÍSTICA PRUDENTE, NO UN HALLAZGO. Buist 2008 (n=532) comparó rampas de
// 10,5 % y 23,7 % por semana y **no encontró diferencia** en lesiones. Así que el 10 % no
// está aquí porque el 20 % lesione: está porque el techo real de esta persona no se conoce y
// una rampa lenta cuesta poco (`research/evidence-to-rules.md`, END-003 marcada `expert`).
// El techo ×1,35 es del mismo tipo: impide que un bloque largo convierta 40' en 115'.
//
// SÓLO VOLUMEN. La zona, la FC objetivo y el ritmo NO progresan (END-002): la base aeróbica
// se construye con minutos fáciles. Esta función devuelve minutos y nada más — si algún día
// devolviera intensidad, dejaría de ser base aeróbica. `verify-block-week.mjs` lo fija.

/** Redondeo al paso más cercano (5' si la dosis es grande, 2' si es un finisher corto). */
function roundStep(x, step) {
  const s = Number(step) > 0 ? Number(step) : 5;
  return Math.round(Number(x) / s) * s;
}

/**
 * Minutos de cardio de hoy: coach > regla > base.
 *
 * @param {number|null} baseMin  Duración base del slot (`IDEAL_BLOCK_V1.durationMin` /
 *                               `z2Finisher`). El dato base NO se edita nunca: la progresión
 *                               es una función sobre él.
 * @param {object} block         Salida de `blockWeekFromDates` (`{index, isDeload}`).
 * @param {object} [opts]
 * @param {number} [opts.variant]            `settings.idealVariant`. 0 = viaje.
 * @param {number|null} [opts.lastCardioDaysAgo] Días desde el último cardio registrado;
 *                                            null = nunca se registró.
 * @param {number|null} [opts.coachMin]       Objetivo del coach para este día, si lo hay.
 * @returns {{min: number|null, source: 'coach'|'rule'|'base', note: string|null}}
 */
function progressCardioMin(baseMin, block, opts = {}) {
  const o = opts || {};
  const b = block || {};
  // 1. El coach manda (plan §Principios 3). Incluso en deload, viaje o tras una pausa: si el
  //    coach fijó minutos para este día, ya conocía el contexto al fijarlos.
  if (o.coachMin != null && isFinite(Number(o.coachMin))) {
    return { min: Math.round(Number(o.coachMin)), source: 'coach', note: 'objetivo del coach' };
  }
  const base = Number(baseMin);
  if (!isFinite(base) || base <= 0) return { min: null, source: 'base', note: null };
  const step = base >= 30 ? 5 : 2;   // 2' en el finisher: a paso de 5 la progresión desaparece
  // 2. Las cuatro puertas que devuelven la base tal cual.
  if (o.variant === 0) {
    return { min: base, source: 'base', note: 'viaje: repite base' };
  }
  if (b.index == null) {
    return { min: base, source: 'base', note: 'sin ancla de bloque: repite base' };
  }
  if (o.lastCardioDaysAgo == null) {
    // Sin historial no se inventa una rampa: progresar sobre la nada es prescribir a ciegas.
    return { min: base, source: 'base', note: 'sin cardio registrado: repite base' };
  }
  if (Number(o.lastCardioDaysAgo) > 14) {
    return { min: base, source: 'base', note: `${o.lastCardioDaysAgo} d sin cardio: repite base` };
  }
  // 3. Descarga: −30 %. Es el punto entero del bloque; progresar aquí sería lo peor de los dos
  //    mundos (series de fuerza al 50 % Y pico de cardio en la misma semana).
  if (b.isDeload) {
    return { min: roundStep(base * 0.7, step), source: 'rule', note: 'deload: −30 %' };
  }
  // 4. Regla: +10 % por semana desde la 1 (la semana 1 ES la base), con techo.
  const raw = Math.min(base * Math.pow(1.1, b.index - 1), base * 1.35);
  return { min: roundStep(raw, step), source: 'rule', note: `semana ${b.index} del bloque` };
}

// ==================== PROGRESIÓN: EL KG DEL SET ====================
//
// EL PROBLEMA QUE RESUELVE (audit Change 7, F-0/F-4). Hasta v11.56 la pantalla de entreno
// mostraba TRES números para una sola decisión: el placeholder del set (el peso de la sesión
// anterior), una frase de `generateCoachNote` ("sube a 92,5") y, en otra pestaña, el objetivo
// que el cron del domingo había calculado. Ninguno estaba en el hueco donde se escribe el peso,
// y la regla de doble progresión, escrita desde hacía meses, sólo emitía texto.
//
// Ahora la app PRESCRIBE: `suggestSetTarget` devuelve un kg y ese kg es el placeholder de todas
// las series. La prioridad es explícita y única (plan §Principios 3): **coach > regla >
// último**. El coach semanal manda mientras su objetivo esté vigente; sin coach, la regla
// progresa sola; sin historial, la tarjeta se queda como está y no inventa nada.
//
// LO QUE NUNCA HACE (plan §B.9): no progresa en semana de descarga, ni tras más de 21 días de
// pausa, ni en ejercicios que se miden (altura de cajón en cm), ni con reps no numéricas
// (AMRAP, metros). Y no bloquea: el número es un placeholder, el usuario escribe lo que
// levante de verdad.
//
// EL INCREMENTO DE CARGA ES HEURÍSTICA DE PRÁCTICA, NO EVIDENCIA. STR-001 (en déficit,
// mantener la intensidad) respalda la doble progresión como método; que el salto sean 2,5 kg en
// barra y 1,25 en polea no sale de ningún ensayo, sale de los discos que hay en el gimnasio y
// del siguiente par de mancuernas. Por eso las constantes son editables y se dice aquí.

/** Pares de mancuernas REALES del gimnasio (David Lloyd Serrano), en kg. Editable. */
const COACH_DB_PAIRS_KG = [2, 4, 6, 8, 10, 12.5, 15, 17.5, 20, 22.5, 25, 27.5, 30, 32.5, 35, 40];
/** Disco más pequeño útil: todo kg prescrito es múltiplo de esto. */
const COACH_STEP_KG = 1.25;
/**
 * Salto por tipo de carga. HEURÍSTICA DE PRÁCTICA, NO EVIDENCIA: son los discos disponibles,
 * no un hallazgo. La polea sube la mitad porque su recorrido de carga útil es más corto y un
 * +2,5 en un face pull es un +10 % de golpe.
 */
const COACH_INC = { barbell: 2.5, machine: 2.5, cable: 1.25, bw: 2.5 };
/**
 * Ejercicios de polea que existen de verdad en `PLAN.sessions` / `EXERCISE_ALTERNATIVES`.
 * Cualquier id que empiece por `cable-` cuenta también (cable-crossover, cable-curl…): la
 * lista explícita está para los que NO lo llevan en el id (face pull, pushdown, jalón).
 */
const COACH_CABLE_IDS = {
  'face-pull': 1, 'tricep-pushdown': 1, 'lat-pulldown': 1,
  'pallof-press': 1, 'cable-row': 1, 'cable-crunch': 1,
};
/**
 * Potencia/pliometría: la variable de progresión es la altura del cajón o la intención, nunca
 * el kg. `box-jump` además está en `_MEASURE_EXERCISES` (columna en cm); `pogo-hops` no lo
 * está, y sin esta lista la regla le prescribiría carga.
 */
const COACH_POWER_IDS = { 'box-jump': 1, 'pogo-hops': 1 };
/** Más de 3 semanas sin hacer el ejercicio: se repite la carga, no se sube (LOAD-004). */
const COACH_PAUSE_DAYS = 21;
/** Vida del objetivo del coach cuando no trae semana ISO (plan §Reconciliaciones). */
const COACH_TARGET_TTL_DAYS = 14;
/** Descarga: −10 % sobre la última carga real. */
const COACH_DELOAD_FACTOR = 0.9;
/** Por encima de este RPE medio no se sube carga aunque salgan todas las reps. */
const COACH_RPE_HIGH = 8.5;

/**
 * Rango de repeticiones de una prescripción.
 *
 * `numeric: false` es la puerta que impide progresar sobre lo que no es un rango de reps:
 * 'AMRAP', '20 m' (trineo), '250 m' (SkiErg), '30-40 s'. Sin ella, "20 m" se leería como
 * "20 reps" y la regla pediría +2,5 kg a un empuje de trineo medido en distancia.
 *
 * @param {string|number} reps '5-8' · '8-10/side' · '10-15/pierna' · '5' · 'AMRAP' · '20 m'
 * @returns {{min:number|null, max:number|null, suffix:string, numeric:boolean, raw:string}}
 */
function _coachParseReps(reps) {
  const raw = reps == null ? '' : String(reps).trim();
  const out = { min: null, max: null, suffix: '', numeric: false, raw };
  // Sólo cuenta como rango si TODA la cadena es un número (o dos) con un sufijo por lado.
  const m = /^(\d+)\s*(?:-\s*(\d+))?\s*(\/\S+)?$/.exec(raw);
  if (!m) return out;
  out.min = Number(m[1]);
  out.max = m[2] != null ? Number(m[2]) : Number(m[1]);
  out.suffix = m[3] || '';
  out.numeric = true;
  return out;
}

/**
 * Tope del rango de RPE prescrito: '7-8' → 8 · '7' → 7 · '-' → null (no se puntúa).
 * Es el umbral contra el que se compara el RPE medio de la última sesión.
 */
function _coachParseRpeTop(rpe) {
  const s = rpe == null ? '' : String(rpe).trim();
  if (!s || s === '-') return null;
  const nums = s.match(/\d+(?:[.,]\d+)?/g);
  if (!nums || !nums.length) return null;
  return Number(String(nums[nums.length - 1]).replace(',', '.'));
}

/** Redondeo al múltiplo de `step` más cercano, sin arrastrar errores de coma flotante. */
function _coachRound(kg, step = COACH_STEP_KG) {
  const s = Number(step) > 0 ? Number(step) : COACH_STEP_KG;
  const n = Number(kg);
  if (!isFinite(n)) return null;
  return +(Math.round(n / s) * s).toFixed(2);
}

/** El par de mancuernas de la tabla más cercano a `kg` (empate → el de abajo). */
function _coachSnapDbPair(kg) {
  const n = Number(kg);
  if (!isFinite(n)) return null;
  const top = COACH_DB_PAIRS_KG[COACH_DB_PAIRS_KG.length - 1];
  // Por encima de la tabla la progresión es de 2,5 en 2,5 (mancuerna cargable).
  if (n > top) return _coachRound(n, 2.5);
  let best = COACH_DB_PAIRS_KG[0];
  let bestD = Infinity;
  for (const p of COACH_DB_PAIRS_KG) {
    const d = Math.abs(p - n);
    if (d < bestD - 1e-9) { best = p; bestD = d; }   // `<` estricto: el empate se queda abajo
  }
  return best;
}

/** El par de la tabla inmediatamente ≤ `kg` (el que se puede coger de verdad). */
function _coachSnapDbDown(kg) {
  const n = Number(kg);
  if (!isFinite(n)) return null;
  const top = COACH_DB_PAIRS_KG[COACH_DB_PAIRS_KG.length - 1];
  if (n >= top) return _coachRound(n, 2.5);
  let best = null;
  for (const p of COACH_DB_PAIRS_KG) if (p <= n + 1e-9) best = p;
  return best == null ? COACH_DB_PAIRS_KG[0] : best;
}

/**
 * Siguiente par de mancuernas. Un peso fuera de la tabla (11 kg de un registro viejo, o 21,25
 * de un redondeo) se AJUSTA A LA TABLA primero: si no, sumar el incremento devolvería 12,25 o
 * 21,25 kg, pares que no existen en ningún gimnasio. Es el fallo que el test vigila.
 */
function _coachNextDbPair(kg) {
  const snapped = _coachSnapDbPair(kg);
  if (snapped == null) return null;
  for (const p of COACH_DB_PAIRS_KG) if (p > snapped + 1e-9) return p;
  return _coachRound(snapped + 2.5, 2.5);
}

/** Par de mancuernas anterior (mismo ajuste a la tabla que `_coachNextDbPair`). */
function _coachPrevDbPair(kg) {
  const snapped = _coachSnapDbPair(kg);
  if (snapped == null) return null;
  let prev = null;
  for (const p of COACH_DB_PAIRS_KG) if (p < snapped - 1e-9) prev = p;
  if (prev != null) return prev;
  return Math.max(0, _coachRound(snapped - 2.5, 2.5));
}

/**
 * Cómo se carga un ejercicio, que es lo que decide el tamaño del salto.
 * Compuesto sin mancuerna ni peso corporal → barra; el resto que no es polea → máquina.
 * @returns {'measure'|'db'|'bw'|'cable'|'barbell'|'machine'}
 */
function _coachLoadType(ex, measureUnit) {
  const e = ex || {};
  if (measureUnit || COACH_POWER_IDS[e.id]) return 'measure';
  if (e.db) return 'db';
  if (e.bw) return 'bw';
  if (COACH_CABLE_IDS[e.id] || /^cable-/.test(String(e.id || ''))) return 'cable';
  if (e.compound) return 'barbell';
  return 'machine';
}

/**
 * La carga siguiente (o anterior) para este ejercicio.
 * @param {object} ex
 * @param {number} kg  Carga de partida (la última real).
 * @param {1|-1} dir   +1 sube, −1 baja.
 * @returns {number|null} null si el ejercicio no se carga en kg.
 */
function _coachIncrement(ex, kg, dir, measureUnit) {
  const type = _coachLoadType(ex, measureUnit);
  if (type === 'measure') return null;
  const n = Number(kg);
  if (!isFinite(n)) return null;
  if (type === 'db') return dir > 0 ? _coachNextDbPair(n) : _coachPrevDbPair(n);
  const inc = COACH_INC[type] != null ? COACH_INC[type] : COACH_INC.machine;
  return Math.max(0, _coachRound(n + dir * inc, COACH_STEP_KG));
}

/**
 * Número → texto español: coma decimal, y los enteros sin decimales ('95', no '95,0').
 * La app se lee en castellano; un '92.5' en la línea del objetivo canta.
 */
function _coachFmtKg(kg) {
  const n = Number(kg);
  if (!isFinite(n)) return '';
  const s = (Math.round(n * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/**
 * RPE siempre con un decimal ('7,0', '9,0'): es como se ha escrito siempre en la app y en las
 * revisiones del coach, y un '7' pelado se confunde con el tope del rango prescrito.
 */
function _coachFmtRpe(v) {
  const n = Number(v);
  if (!isFinite(n)) return '';
  return n.toFixed(1).replace('.', ',');
}

/** 'YYYY-MM-DD' desde lo que venga (ISO completo, ms, o ya una fecha). */
function _coachDayStr(v) {
  if (v == null) return null;
  if (typeof v === 'number' && isFinite(v)) return _utcDayStr(v);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Días enteros entre dos fechas (b − a). null si falta cualquiera de las dos. */
function _coachDaysBetween(a, b) {
  const ta = _utcMs(_coachDayStr(a));
  const tb = _utcMs(_coachDayStr(b));
  if (ta == null || tb == null) return null;
  return Math.round((tb - ta) / 86400000);
}

/**
 * El lunes de una clave de semana ISO ('2026-W37' → '2026-09-07').
 *
 * La vigencia se compara por FECHAS y no restando números de semana: en el cruce de año
 * ('2027-W01' menos '2026-W53') la resta daría −52 y un objetivo de la semana pasada se
 * declararía vencido justo en Nochevieja.
 */
function _coachWeekKeyMonday(weekKey) {
  const m = /^(\d{4})-W(\d{1,2})$/.exec(String(weekKey == null ? '' : weekKey).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const w = Number(m[2]);
  const jan4 = Date.UTC(y, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7;
  const week1Monday = jan4 - (dow - 1) * 86400000;
  return _utcDayStr(week1Monday + (w - 1) * 7 * 86400000);
}

/**
 * El objetivo del coach para UN ejercicio, tal y como lo escribe el cron semanal en texto
 * libre (`weekly_reviews[].nextWeekPlan`). Adaptador LEGACY: el plan v2 traerá el objetivo ya
 * estructurado y esto se podrá borrar (incremento 9).
 *
 * REGEX CONSERVADORA A PROPÓSITO. Un número mal extraído de una frase en prosa se convierte en
 * el placeholder del set, o sea en el peso que acaba en la barra. Ante la duda devuelve
 * `kg: null` y la regla de doble progresión toma el mando: progresar solo es mejor que
 * prescribir un número inventado. Sólo cuenta un número que ABRE la cadena (o el lastre tras
 * 'BW+'), más la única forma en prosa que el cron usa de verdad ('empezar en 60 kg, …').
 *
 * @param {string} str '95 kg × 5-8' · '62,5 kg × 6-10' · '32 kg/mano × 8-12' · '20 kg/DB' ·
 *                     'BW +7,5 kg × 5-8' · 'BW+2,5' · '3 × 12' · 'empezar en 60 kg, ajustar…'
 * @returns {{kg:number|null, reps:string|null, bw:boolean, perHand:boolean, raw:string}}
 */
function parseCoachTarget(str) {
  const raw = str == null ? '' : String(str).trim();
  const out = { kg: null, reps: null, bw: false, perHand: false, raw };
  if (!raw) return out;
  const num = (s) => {
    const n = Number(String(s).replace(',', '.'));
    return isFinite(n) ? n : null;
  };
  // Reps: lo que sigue al × (o x). Un rango, o un número, con su sufijo por lado si lo trae.
  const mReps = /[×x]\s*(\d+(?:\s*-\s*\d+)?(?:\/\S+)?)/i.exec(raw);
  if (mReps) out.reps = mReps[1].replace(/\s*-\s*/, '-');
  // Por mancuerna / por mano: el número es POR MANO, no el total.
  if (/\/\s*(mano|db|hand)\b/i.test(raw)) out.perHand = true;
  // Peso corporal + lastre. 'BW × 8-12' (sin lastre) se queda en kg null a propósito.
  if (/^bw\b/i.test(raw) || /\bbw\s*\+/i.test(raw)) {
    out.bw = true;
    const mBw = /bw\s*\+\s*(\d+(?:[.,]\d+)?)/i.exec(raw);
    if (mBw) out.kg = num(mBw[1]);
    return out;
  }
  // 'empezar en 60 kg, ajustar a RPE 7' — la única forma en prosa que el cron usa.
  const mProse = /^empezar en\s+(\d+(?:[.,]\d+)?)\s*kg\b/i.exec(raw);
  if (mProse) { out.kg = num(mProse[1]); return out; }
  // Número (o rango de kg, '8-9 kg/mano') al PRINCIPIO de la cadena. En un rango manda el
  // suelo: es la carga con la que se empieza la serie.
  const mKg = /^(\d+(?:[.,]\d+)?)(?:\s*-\s*\d+(?:[.,]\d+)?)?\s*kg\b/i.exec(raw);
  if (mKg) out.kg = num(mKg[1]);
  return out;
}

/**
 * EL MOTOR. Qué kg toca hoy en este ejercicio, y por qué, en una línea en castellano.
 *
 * @param {object} ex  Ejercicio del plan: `{id, name, reps, rpe, sets, db, bw, compound}`.
 * @param {Array<{date:string, sets:Array<{weight:number,reps:number,rpe:number|null,done:boolean}>}>} history
 *        Sesiones de ESTE ejercicio, la más reciente primero, **pesos ya en kg**: la conversión
 *        desde lb de los registros pre-España la hace el llamador (`convertWeight`).
 * @param {object} [opts]
 * @param {object|null} [opts.coachTarget]   `{kg, reps, rpe, note, bw}` del coach, si lo hay.
 * @param {string|null} [opts.coachWeekKey]  Semana ISO en que el coach lo fijó.
 * @param {string|null} [opts.todayWeekKey]  Semana ISO de hoy.
 * @param {string|number|null} [opts.planCreatedAt] Fallback de vigencia si no hay semana.
 * @param {boolean} [opts.deload]            Semana de descarga.
 * @param {string} [opts.today]              'YYYY-MM-DD'.
 * @param {string|null} [opts.measureUnit]   'cm' si la columna de carga es una medida.
 * @returns {{kg:number|null, reps:string, rpe:string, source:'coach'|'rule'|'last'|'none',
 *           reason:string, delta:number|null, ruleIds:string[],
 *           basis:{lastKg:number|null, lastReps:number[], avgRpe:number|null, daysSince:number|null}|null}}
 */
function suggestSetTarget(ex, history, opts = {}) {
  const e = ex || {};
  const o = opts || {};
  const hist = Array.isArray(history) ? history : [];
  const todayStr = _coachDayStr(o.today) || _coachDayStr(new Date().toISOString());
  const range = _coachParseReps(e.reps);
  const type = _coachLoadType(e, o.measureUnit);
  const baseReps = range.raw || String(e.reps == null ? '' : e.reps);
  const baseRpe = e.rpe == null ? '-' : String(e.rpe);
  const mk = (kg, source, reason, extra = {}) => ({
    kg: kg == null ? null : +Number(kg).toFixed(2),
    reps: baseReps,
    rpe: baseRpe,
    source,
    reason,
    delta: null,
    ruleIds: [],
    basis: null,
    ...extra,
  });

  // ── (1) Se mide, no se carga ──────────────────────────────────────────────────────
  if (type === 'measure') {
    if (o.measureUnit) return mk(null, 'none', `Se mide en ${o.measureUnit}, no en kg`);
    // Pliometría sin columna de medida (pogo hops): la intención es la carga.
    return mk(null, 'none', 'Salto: progresa la intención y la altura, no el kg');
  }

  // Sesiones utilizables: las que tienen alguna serie hecha con carga. En peso corporal una
  // serie hecha con 0 kg SÍ cuenta (unas dominadas sin lastre son un dato, no un hueco).
  const usable = hist.filter(h => Array.isArray(h && h.sets) && h.sets.some(
    s => s && s.done && (Number(s.weight) > 0 || type === 'bw')));
  const lastSession = usable[0] || null;
  const doneSets = lastSession
    ? lastSession.sets.filter(s => s && s.done && (Number(s.weight) > 0 || type === 'bw'))
    : [];
  const lastTopKg = doneSets.length ? Math.max(...doneSets.map(s => Number(s.weight) || 0)) : null;
  const lastReps = doneSets.map(s => Number(s.reps) || 0);
  const rpes = doneSets.map(s => Number(s.rpe)).filter(v => isFinite(v) && v > 0);
  const avgRpe = rpes.length ? +(rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(2) : null;
  const daysSince = lastSession ? _coachDaysBetween(lastSession.date, todayStr) : null;
  const basis = lastSession ? { lastKg: lastTopKg, lastReps, avgRpe, daysSince } : null;
  const withBasis = (t) => Object.assign(t, { basis });
  const deltaFrom = (kg) => (kg == null || lastTopKg == null ? null : +(kg - lastTopKg).toFixed(2));

  // ── (2) Sin rango de reps no hay doble progresión ─────────────────────────────────
  // AMRAP, '20 m' de trineo, '250 m' de SkiErg: lo que progresa no es la carga.
  if (!range.numeric) {
    const reason = lastTopKg != null
      ? `Sin rango de reps (${baseReps}): repite ${_coachFmtKg(lastTopKg)} kg y ajusta por sensación`
      : `Sin rango de reps (${baseReps}): elige la carga por sensación, 2-3 reps en reserva`;
    return withBasis(mk(lastTopKg, 'last', reason, { delta: 0 }));
  }

  // ── (3) El coach manda mientras su objetivo esté vigente ─────────────────────────
  // Vigencia por FECHA (plan §Reconciliaciones): la semana ISO en que lo fijó tiene que ser
  // ésta o la anterior; sin semana, vale un plan creado hace ≤ 14 días. Un objetivo de hace
  // tres semanas describe un cuerpo que ya no existe, así que cede el paso a la regla.
  const ct = o.coachTarget;
  let expiredPrefix = '';
  if (ct && ct.kg != null && isFinite(Number(ct.kg))) {
    const ctMonday = _coachWeekKeyMonday(o.coachWeekKey);
    const todayMonday = _coachWeekKeyMonday(o.todayWeekKey) || mondayOf(todayStr);
    let vigente = false;
    let ageDays = null;
    if (ctMonday && todayMonday) {
      const d = _coachDaysBetween(ctMonday, todayMonday);
      vigente = d != null && d >= 0 && d <= 7;          // esta semana o la anterior
      ageDays = _coachDaysBetween(ctMonday, todayStr);
    } else if (!o.coachWeekKey && o.planCreatedAt != null) {
      ageDays = _coachDaysBetween(o.planCreatedAt, todayStr);
      vigente = ageDays != null && ageDays >= 0 && ageDays <= COACH_TARGET_TTL_DAYS;
    }
    if (vigente) {
      const kg = +Number(ct.kg).toFixed(2);
      return withBasis({
        kg,
        reps: ct.reps || baseReps,
        rpe: ct.rpe || baseRpe,
        source: 'coach',
        reason: ct.note || 'Objetivo del coach para esta semana',
        delta: deltaFrom(kg),
        ruleIds: Array.isArray(ct.ruleIds) ? ct.ruleIds.slice() : [],
        basis,
      });
    }
    expiredPrefix = ageDays != null
      ? `Objetivo del coach de hace ${ageDays} días — aplico la regla. `
      : 'Objetivo del coach sin fecha — aplico la regla. ';
  }

  // ── (4) Sin historial no se inventa un número ────────────────────────────────────
  if (!lastSession) {
    return mk(null, 'none',
      expiredPrefix + 'Primera vez: elige un peso que deje 2-3 reps en reserva');
  }

  // ── (5) Pausa larga: repetir, nunca subir (LOAD-004) ─────────────────────────────
  if (daysSince != null && daysSince > COACH_PAUSE_DAYS) {
    return withBasis(mk(lastTopKg, 'last',
      `${expiredPrefix}Pausa de ${daysSince} días: repite la carga; si sale fácil, sube la próxima`,
      { delta: 0, ruleIds: ['LOAD-004'] }));
  }

  // ── (6) Descarga: −10 % y RPE 5-6. NO se evalúa progresión ───────────────────────
  // Es el punto entero de la semana 5/5. Evaluar la doble progresión aquí y recortar después
  // sería prescribir dos cosas contradictorias sobre el mismo set.
  if (o.deload) {
    let kg;
    if (type === 'bw' && (lastTopKg == null || lastTopKg <= 0)) {
      kg = null;                                   // peso corporal sin lastre: no hay qué bajar
    } else if (type === 'db') {
      kg = _coachSnapDbDown(lastTopKg * COACH_DELOAD_FACTOR);
    } else {
      kg = _coachRound(lastTopKg * COACH_DELOAD_FACTOR, COACH_STEP_KG);
    }
    return withBasis({
      kg: kg == null ? null : +Number(kg).toFixed(2),
      reps: baseReps,
      rpe: '5-6',
      source: 'rule',
      reason: expiredPrefix + 'Deload · semana 5/5: −10 % y RPE 5-6',
      delta: deltaFrom(kg),
      ruleIds: ['LOAD-004'],
      basis,
    });
  }

  // ── (7) Doble progresión sobre la última sesión (STR-001) ────────────────────────
  const rpeTopParsed = _coachParseRpeTop(e.rpe);
  const rpeTop = rpeTopParsed != null ? rpeTopParsed : 8;
  const allHitMax = doneSets.length > 0 && lastReps.every(r => r >= range.max);
  const allHitMin = doneSets.length > 0 && lastReps.every(r => r >= range.min);
  const rule = (kg, reason, ruleIds = ['STR-001']) => withBasis({
    kg: kg == null ? null : +Number(kg).toFixed(2),
    reps: baseReps,
    rpe: baseRpe,
    source: 'rule',
    reason: expiredPrefix + reason,
    delta: deltaFrom(kg),
    ruleIds,
    basis,
  });

  // Peso corporal SIN puntuar (ab wheel, elevación de piernas): lo que progresa es el
  // recorrido y las reps, nunca el lastre. Prescribir disco aquí es cómo se arquea una lumbar
  // con dos contracturas en el historial.
  if (type === 'bw' && baseRpe === '-') {
    return rule(null, allHitMax
      ? 'Al tope del rango: sube el recorrido o +1 rep, no el lastre'
      : 'Completa el rango antes de tocar nada más');
  }

  if (allHitMax && (avgRpe == null || avgRpe <= rpeTop)) {
    // Peso corporal al tope y sin lastre: el salto es empezar a colgar disco.
    if (type === 'bw' && (lastTopKg == null || lastTopKg <= 0)) {
      return rule(COACH_INC.bw,
        `${doneSets.length}×${range.max} a peso corporal → añade ${_coachFmtKg(COACH_INC.bw)} kg de lastre`);
    }
    const next = _coachIncrement(e, lastTopKg, 1, o.measureUnit);
    const rpeTxt = avgRpe == null ? '(sin RPE anotado)' : `@${_coachFmtRpe(avgRpe)}`;
    return rule(next,
      `Todas las series al tope (${range.max}) ${rpeTxt} → +${_coachFmtKg((next || 0) - (lastTopKg || 0))} kg. Apunta al mínimo del rango.`);
  }

  if (allHitMax) {
    // Al tope pero con el RPE por encima del objetivo: la carga ya está donde tiene que estar;
    // lo que falta es que ese mismo peso se sienta más fácil.
    const reason = avgRpe > COACH_RPE_HIGH
      ? `Al tope pero RPE ${_coachFmtRpe(avgRpe)}: mismo kg hasta bajar a ${_coachFmtKg(rpeTop)}`
      : `Al tope con RPE ${_coachFmtRpe(avgRpe)} sobre el objetivo (${_coachFmtKg(rpeTop)}): mismo kg hasta que baje`;
    return rule(lastTopKg, reason);
  }

  if (!allHitMin) {
    const short = lastReps.filter(r => r < range.min).length;
    const mitad = Math.ceil(doneSets.length / 2);
    if (short >= mitad || (avgRpe != null && avgRpe >= 9)) {
      const down = _coachIncrement(e, lastTopKg, -1, o.measureUnit);
      return rule(down,
        `No llegaste al mínimo en ${short} ${short === 1 ? 'serie' : 'series'} → −${_coachFmtKg((lastTopKg || 0) - (down || 0))} kg`);
    }
    return rule(lastTopKg,
      `Una serie corta: repite ${_coachFmtKg(lastTopKg)} kg y completa el rango`);
  }

  // Dentro del rango pero sin llegar al tope: lo que progresa son reps, no kg.
  const prev = usable[1] || null;
  const mean = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  if (prev) {
    const prevDone = prev.sets.filter(s => s && s.done && (Number(s.weight) > 0 || type === 'bw'));
    const prevTop = prevDone.length ? Math.max(...prevDone.map(s => Number(s.weight) || 0)) : null;
    if (prevTop != null && prevTop === lastTopKg
        && mean(prevDone.map(s => Number(s.reps) || 0)) === mean(lastReps)) {
      return rule(lastTopKg,
        `Dos sesiones iguales: hoy +1 rep o RPE ${_coachFmtKg(rpeTop)} en la última`);
    }
  }
  const bump = lastReps.map(r => Math.min(r + 1, range.max));
  return rule(lastTopKg, `+1 rep por serie (${lastReps.join('/')} → ${bump.join('/')})`);
}

/**
 * LECTURA DE LA SESIÓN: qué se prescribió, qué se hizo y qué toca la próxima vez.
 *
 * Es la mitad que cierra el lazo. Sin ella el objetivo es una sugerencia que nadie revisa: el
 * facts pack (incremento 7) lee esto para poder decir "te propuse 95 en banca, hiciste
 * 92,5×8/8/7" y para que el coach retire una decisión que no funcionó.
 *
 * PURA: el `next` de cada ejercicio lo calcula el llamador con `suggestSetTarget` sobre
 * `[esta sesión, ...historial]` y lo pasa en `nextById`. Aquí no se lee IDB ni el reloj.
 *
 * @param {object} workout      El registro tal y como lo escribe `finishWorkout`.
 * @param {object} targetsById  `{[exerciseId]: target}` que se mostró en la tarjeta.
 * @param {object} exDefs       `{[exerciseId]: {name, reps, rpe, db, bw, compound, measureUnit}}`.
 * @param {object} [nextById]   `{[exerciseId]: target}` de la próxima vez.
 * @returns {{items:Array<object>, summary:{progressed:number,held:number,regressed:number,skipped:number}, line:string}}
 */
function sessionReadout(workout, targetsById, exDefs, nextById) {
  const w = workout || {};
  const T = targetsById || {};
  const D = exDefs || {};
  const N = nextById || {};
  const items = [];
  const summary = { progressed: 0, held: 0, regressed: 0, skipped: 0 };

  for (const we of (w.exercises || [])) {
    const id = we.exerciseId;
    const def = D[id] || {};
    const target = T[id] || null;
    const type = _coachLoadType(Object.assign({ id }, def), def.measureUnit);
    const done = (we.sets || []).filter(s => s && s.done
      && (Number(s.weight) > 0 || type === 'bw' || type === 'measure'));
    const reps = done.map(s => Number(s.reps) || 0);
    const topKg = done.length ? Math.max(...done.map(s => Number(s.weight) || 0)) : null;
    const rpes = done.map(s => Number(s.rpe)).filter(v => isFinite(v) && v > 0);
    const avgRpe = rpes.length ? +(rpes.reduce((a, b) => a + b, 0) / rpes.length).toFixed(1) : null;
    const range = _coachParseReps(def.reps != null ? def.reps : (target && target.reps));

    let outcome;
    if (!done.length) {
      outcome = 'skipped';                                  // no se hizo: no se juzga
    } else if (!target || target.kg == null) {
      outcome = 'no-target';                                // medida, primera vez o ab wheel
    } else {
      const min = range.numeric ? range.min : 0;
      const short = reps.filter(r => r < min).length;
      if (topKg >= target.kg - 0.01 && short === 0) outcome = 'progressed';
      else if (topKg < target.kg - COACH_STEP_KG || short >= Math.ceil(done.length / 2)) outcome = 'regressed';
      else if (Math.abs(topKg - target.kg) <= COACH_STEP_KG && reps.every(r => r >= min - 2)) outcome = 'held';
      else outcome = 'regressed';
    }
    if (summary[outcome] != null) summary[outcome] += 1;

    const nx = N[id];
    items.push({
      exerciseId: id,
      name: def.name || id,
      target: target && target.kg != null
        ? { kg: target.kg, reps: target.reps, source: target.source }
        : null,
      done: { topKg, reps, avgRpe },
      outcome,
      // La unidad viaja con el item: en `box-jump` el número son CENTÍMETROS, y pintarlo sin
      // unidad al lado de kilos es cómo el 3-sep quedó un 0×5@6 en el registro (v11.48).
      measureUnit: def.measureUnit || null,
      next: nx && nx.kg != null ? { kg: nx.kg, reason: nx.reason } : null,
    });
  }

  // Una línea, en castellano, con lo único que se lee de un vistazo: cuántas subieron y qué
  // sube la próxima vez.
  const plural = (n, sing, pl) => `${n} ${n === 1 ? sing : pl}`;
  const trozos = [];
  if (summary.progressed) trozos.push(plural(summary.progressed, 'subida', 'subidas'));
  if (summary.held) trozos.push(plural(summary.held, 'mantenida', 'mantenidas'));
  if (summary.regressed) trozos.push(plural(summary.regressed, 'corta', 'cortas'));
  if (summary.skipped) trozos.push(plural(summary.skipped, 'saltado', 'saltados'));
  const suben = items.filter(it => it.next && it.target && it.next.kg > it.target.kg);
  const cola = suben.length
    ? ` ${suben[0].name} sube a ${_coachFmtKg(suben[0].next.kg)} kg la próxima.`
    : '';
  const line = (trozos.length ? trozos.join(', ') + '.' : 'Sin series registradas.') + cola;

  return { items, summary, line };
}

// ==================== READINESS: UN SOLO ESTADO PARA TODO ====================
//
// EL PROBLEMA QUE RESUELVE (audit 2026-09-05, F-5 + F-6 + F-8, Change 6). Hasta v11.58 había
// TRES lecturas de recuperación, cada una con sus inputs y su criterio:
//
//   Home  · `computeTrainingAdvisory` → color WHOOP de un día + 2 flags → keep/modify/…
//   Stats · `renderFatigueScore`      → score 0-100 compuesto (frecuencia + calidad + energía +
//                                       días bajo proteína ×3 + RPE medio + WHOOP) → "Push hard"
//   Stats · `checkDeloadNeeded`       → quality ≤2 ×2, RPE ≥8,5 ×3, media WHOOP 3d, + una rama
//                                       muerta ("N semanas sin deload", inalcanzable — F-8)
//
// El usuario podía ver a la vez "Mantener", "Moderate fatigue" y ningún deload: tres lecturas de
// la MISMA noche, y ninguna sabía cuál mandaba. Peor: la fatigue card derivaba un consejo de un
// score compuesto, que es READ-003 al revés (el % de WHOOP es una bandera, nunca una calculadora
// de dosis), y ponderaba "días bajo proteína ×3" como fatiga aguda.
//
// Ahora hay UNA función. Devuelve un color, la LISTA de señales que lo justifican (cada una con
// su valor y su base) y una confianza. Los tres consumidores leen de aquí.
//
// LAS REGLAS QUE LA GOBIERNAN (`docs/architecture/readiness-rules.md`):
//   READ-001 · tendencias de 7 días, nunca un día suelto.
//   READ-002 · ≥2 señales CONCORDANTES antes de cambiar el plan. Una mala noche sola es amarillo
//              como máximo — es la corrección explícita del comportamiento anterior.
//   READ-003 · el Recovery de WHOOP es una bandera (verde/amarillo/rojo), no una dosis.
//   READ-004 · la HRV se compara con la base PROPIA (media de los días 7..34), nunca con valores
//              poblacionales ni con el día anterior.
//   READ-005 · el subjetivo y el rendimiento pesan cuando el wearable falta o discrepa: de ahí
//              `sleepSelf`/`feelSelf` (check-in de 2 toques) y `rpe2`/`quality2`.
//   READ-006 · el sueño es la palanca primaria.
//   READ-008 · el deload reactivo sale de un declive multi-señal SOSTENIDO, no de un mal día.
//
// LO QUE NO HACE, NUNCA: ni un score, ni una media ponderada, ni un número del que salga una
// dosis. Tampoco mira la HRV de un solo día (su ruido diario es del orden del efecto que se
// busca) ni la compara con nada que no sea el propio historial.
//
// LOS UMBRALES SON HEURÍSTICA PRUDENTE, NO UN HALLAZGO. −10 % de HRV 7d, +5 bpm de FC de reposo,
// 6,5 h de sueño y RPE ≥9 son los que usa la práctica y los que el corpus cita como órdenes de
// magnitud; ninguno sale de un ensayo con este sujeto. Están aquí, juntos y con nombre, para
// poder discutirlos y cambiarlos — que es lo contrario de un score con pesos inventados
// repartidos por 40 líneas de render.

/** Corte de color de WHOOP. EL MISMO que `getRecoveryColor` (whoop.js): 67 / 34. No se toca. */
const READ_CUTOFFS = { green: 67, yellow: 34 };
/** Caída de la media de HRV de 7 días respecto a la base propia que cuenta como señal. */
const READ_HRV_DROP_PCT = -10;
/** Subida de la FC de reposo de 7 días sobre la base propia que cuenta como señal. */
const READ_RHR_RISE_BPM = 5;
/** Media de sueño de 7 días por debajo de la cual el sueño es señal (6,5 h). READ-006. */
const READ_SLEEP_FLOOR_SECS = 23400;
/** RPE medio de sesión a partir del cual la sesión cuenta como "al límite". */
const READ_RPE_FLOOR = 9;
/** Calidad de sesión (1-5) en o por debajo de la cual la sesión cuenta como mala. */
const READ_QUALITY_CEIL = 2;
/** Ventana reciente (0 = hoy .. 6) y base propia (7 .. 34). READ-001 + READ-004. */
const READ_TREND_TO = 6;
const READ_BASE_FROM = 7;
const READ_BASE_TO = 34;
/** Mínimos para que una tendencia cuente. Por debajo: `insufficient`, y se dice por qué. */
const READ_MIN_TREND_VALUES = 5;
const READ_MIN_BASE_VALUES = 14;
const READ_MIN_SLEEP_NIGHTS = 4;
/** Reglas que gobiernan el CÁLCULO. READ-007 gobierna el ajuste, no el cálculo. */
const READ_RULE_IDS = ['READ-001', 'READ-002', 'READ-003', 'READ-004', 'READ-005', 'READ-006', 'READ-008'];

const _READ_COLOR_ES = { green: 'verde', yellow: 'amarillo', red: 'rojo', unknown: 'sin dato' };

/** Media aritmética, o null si no hay nada que promediar. */
function _readMean(values) {
  if (!values || !values.length) return null;
  let s = 0;
  for (const v of values) s += v;
  return s / values.length;
}

/** '−13 %' / '+4 %' con el menos tipográfico (U+2212), como el resto de la UI en castellano. */
function _readPct(pct) {
  const n = Math.round(Number(pct));
  return (n < 0 ? '−' : '+') + Math.abs(n) + ' %';
}

/** '+5' / '−2' para una diferencia absoluta (bpm). */
function _readDelta(d) {
  const n = Math.round(Number(d));
  return (n < 0 ? '−' : '+') + Math.abs(n);
}

/** Nombre corto de cada señal, para la UI. El motivo (`reason`) NO lo repite. */
const _READ_LABELS = {
  whoop: 'WHOOP hoy', hrv7v28: 'HRV 7d', rhr7v28: 'FC reposo 7d', sleep7: 'Sueño 7d',
  rpe2: 'RPE', quality2: 'Calidad', sleepSelf: 'Sueño (check-in)', feelSelf: 'Sensación (check-in)',
};

/** Señal sin dato suficiente. Lleva SIEMPRE el motivo: "no hay dato" no es una explicación. */
function _readInsufficient(id, unit, reason) {
  const label = _READ_LABELS[id] || id;
  return {
    id, label, fired: false, dir: null, value: null, baseline: null, unit,
    text: label + ': sin dato — ' + reason, status: 'insufficient', reason,
  };
}

/**
 * El estado de recuperación de hoy, desde los datos y nada más.
 *
 * @param {object} inputs
 * @param {string} inputs.today                'YYYY-MM-DD' LOCAL (nunca derivado de UTC — F-14).
 * @param {Array}  inputs.wellness             Filas del store `wellness` de los últimos ~35 días:
 *                                             `{date, readiness, hrv, restingHR, sleepSecs, subjective?}`.
 *                                             Fuente: intervals.icu (histórico) + WHOOP directo (hoy).
 * @param {object|null} inputs.whoopToday      `{score, source, fetchedAt}` SÓLO si es de HOY (F-6).
 * @param {string} [inputs.whoopMissingReason] Por qué falta el dato de hoy, en castellano.
 * @param {Array}  inputs.workouts             `workouts` en orden DESCENDENTE de fecha.
 * @param {object} [inputs.cutoffs]            `{green:67, yellow:34}`.
 * @returns {{color:'green'|'yellow'|'red'|'unknown',
 *            signals:Array<{id:string, fired:boolean, dir:string|null, value:number|null,
 *                           baseline:number|null, unit:string, text:string,
 *                           status:'ok'|'insufficient', reason?:string}>,
 *            fired:number, confidence:'high'|'medium'|'low', deloadHint:boolean, ruleIds:string[]}}
 */
function computeReadinessFrom(inputs = {}) {
  const inp = inputs || {};
  const day = _coachDayStr(inp.today);
  const cut = Object.assign({}, READ_CUTOFFS, inp.cutoffs || {});
  const rows = (Array.isArray(inp.wellness) ? inp.wellness : []).filter(r => r && _coachDayStr(r.date));
  const workouts = (Array.isArray(inp.workouts) ? inp.workouts : []).filter(w => w && Array.isArray(w.exercises));

  // Edad en días de una fila: 0 = hoy, 1 = ayer. Negativa = futuro (se descarta).
  const age = (d) => (day ? _coachDaysBetween(d, day) : null);
  const pick = (field, fromAgo, toAgo) => {
    const out = [];
    for (const r of rows) {
      const a = age(r.date);
      if (a == null || a < fromAgo || a > toAgo) continue;
      const v = Number(r[field]);
      if (isFinite(v) && v > 0) out.push(v);
    }
    return out;
  };

  const signals = [];

  // ---- 1. WHOOP de HOY (READ-003). Rojo dispara; amarillo fija un suelo de color -----------
  // El dato es de hoy o NO EXISTE (F-6). Lo garantiza quien llama: aquí nunca se coge "el último
  // que haya" — ese bug decidía el entreno del martes con la noche del domingo.
  const wt = (inp.whoopToday && inp.whoopToday.score != null) ? inp.whoopToday : null;
  const whoopColor = wt
    ? (wt.score >= cut.green ? 'green' : wt.score >= cut.yellow ? 'yellow' : 'red')
    : null;
  if (wt) {
    const sc = Math.round(Number(wt.score));
    signals.push({
      id: 'whoop', label: _READ_LABELS.whoop, fired: whoopColor === 'red', dir: 'level',
      value: sc, baseline: cut.yellow, unit: '%',
      text: 'WHOOP hoy ' + sc + ' % · ' + _READ_COLOR_ES[whoopColor],
      status: 'ok',
    });
  } else {
    signals.push(_readInsufficient('whoop', '%', inp.whoopMissingReason || 'Sin dato de recuperación de hoy'));
  }

  // ---- 2. HRV: media 7d vs base propia de los días 7..34 (READ-001 + READ-004) -------------
  {
    const w = pick('hrv', 0, READ_TREND_TO);
    const b = pick('hrv', READ_BASE_FROM, READ_BASE_TO);
    if (w.length < READ_MIN_TREND_VALUES) {
      signals.push(_readInsufficient('hrv7v28', 'ms', 'sólo ' + w.length + ' de 7 días'));
    } else if (b.length < READ_MIN_BASE_VALUES) {
      signals.push(_readInsufficient('hrv7v28', 'ms', 'base propia incompleta (' + b.length + ' de 28 días)'));
    } else {
      const m = _readMean(w);
      const base = _readMean(b);
      const pct = (m / base - 1) * 100;
      signals.push({
        id: 'hrv7v28', label: _READ_LABELS.hrv7v28, fired: pct <= READ_HRV_DROP_PCT, dir: pct < 0 ? 'down' : 'up',
        value: Math.round(m), baseline: Math.round(base), unit: 'ms',
        text: 'HRV 7d ' + Math.round(m) + ' ms vs ' + Math.round(base) + ' de base (' + _readPct(pct) + ')',
        status: 'ok',
      });
    }
  }

  // ---- 3. FC de reposo: media 7d − base propia (READ-001) ---------------------------------
  {
    const w = pick('restingHR', 0, READ_TREND_TO);
    const b = pick('restingHR', READ_BASE_FROM, READ_BASE_TO);
    if (w.length < READ_MIN_TREND_VALUES) {
      signals.push(_readInsufficient('rhr7v28', 'bpm', 'sólo ' + w.length + ' de 7 días'));
    } else if (b.length < READ_MIN_BASE_VALUES) {
      signals.push(_readInsufficient('rhr7v28', 'bpm', 'base propia incompleta (' + b.length + ' de 28 días)'));
    } else {
      const m = _readMean(w);
      const base = _readMean(b);
      const d = m - base;
      signals.push({
        id: 'rhr7v28', label: _READ_LABELS.rhr7v28, fired: d >= READ_RHR_RISE_BPM, dir: d > 0 ? 'up' : 'down',
        value: Math.round(m), baseline: Math.round(base), unit: 'bpm',
        text: 'FC reposo 7d ' + Math.round(m) + ' vs ' + Math.round(base) + ' (' + _readDelta(d) + ')',
        status: 'ok',
      });
    }
  }

  // ---- 4. Sueño: media 7d (READ-006, palanca primaria) ------------------------------------
  // Una noche de 4 h con la semana en 7 h NO dispara: es literalmente el "no obsesionarse con un
  // mal día" de la tabla de señales de readiness-rules.md.
  {
    const w = pick('sleepSecs', 0, READ_TREND_TO);
    if (w.length < READ_MIN_SLEEP_NIGHTS) {
      signals.push(_readInsufficient('sleep7', 'h', 'sólo ' + w.length + ' de 7 noches'));
    } else {
      const m = _readMean(w);
      const hrs = Math.round((m / 3600) * 10) / 10;
      signals.push({
        id: 'sleep7', label: _READ_LABELS.sleep7, fired: m < READ_SLEEP_FLOOR_SECS, dir: 'down',
        value: hrs, baseline: Math.round((READ_SLEEP_FLOOR_SECS / 3600) * 10) / 10, unit: 'h',
        text: 'Sueño 7d ' + _coachFmtKg(hrs) + ' h', status: 'ok',
      });
    }
  }

  // ---- 5. RPE de las 2 últimas sesiones de fuerza (READ-005: manda el rendimiento) --------
  // Sólo cuentan las sesiones con al menos 3 series con RPE: dos series sueltas no son una sesión
  // "al límite", son dos series con el RPE apuntado.
  const rped = [];
  for (const w of workouts) {
    const rpes = [];
    for (const ex of (w.exercises || [])) {
      for (const s of ((ex && ex.sets) || [])) {
        const v = Number(s && s.rpe);
        if (s && s.done && isFinite(v) && v > 0) rpes.push(v);
      }
    }
    if (rpes.length >= 3) rped.push({ date: w.date, avg: _readMean(rpes) });
    if (rped.length === 2) break;
  }
  if (rped.length < 2) {
    signals.push(_readInsufficient('rpe2', 'RPE', 'sólo ' + rped.length + ' sesión(es) con RPE apuntado'));
  } else {
    const both = rped[0].avg >= READ_RPE_FLOOR && rped[1].avg >= READ_RPE_FLOOR;
    signals.push({
      id: 'rpe2', label: _READ_LABELS.rpe2, fired: both, dir: 'up',
      value: Math.round(rped[0].avg * 10) / 10, baseline: READ_RPE_FLOOR, unit: 'RPE',
      text: both
        ? 'RPE ≥9 en las 2 últimas sesiones'
        : 'RPE medio ' + _coachFmtRpe(rped[0].avg) + ' y ' + _coachFmtRpe(rped[1].avg) + ' en las 2 últimas',
      status: 'ok',
    });
  }

  // ---- 6. Calidad percibida de las 2 últimas sesiones -------------------------------------
  const quals = [];
  for (const w of workouts) {
    const q = Number(w.quality);
    if (isFinite(q) && q > 0) quals.push(q);
    if (quals.length === 2) break;
  }
  if (quals.length < 2) {
    signals.push(_readInsufficient('quality2', '/5', 'sólo ' + quals.length + ' sesión(es) puntuada(s)'));
  } else {
    const both = quals[0] <= READ_QUALITY_CEIL && quals[1] <= READ_QUALITY_CEIL;
    signals.push({
      id: 'quality2', label: _READ_LABELS.quality2, fired: both, dir: 'down',
      value: quals[0], baseline: READ_QUALITY_CEIL, unit: '/5',
      text: both ? 'Calidad ≤2 en las 2 últimas' : 'Calidad ' + quals[0] + ' y ' + quals[1] + ' en las 2 últimas',
      status: 'ok',
    });
  }

  // ---- 7-8. Check-in de 2 toques (READ-005) ----------------------------------------------
  // Cuando el wearable no tiene el dato de hoy, esto es lo único que habla de HOY. Es opcional:
  // sin responder queda `insufficient` y no pasa nada.
  const todayRow = day ? rows.find(r => _coachDayStr(r.date) === day) : null;
  const subj = (todayRow && todayRow.subjective) || null;
  if (!subj || !subj.sleepBand) {
    signals.push(_readInsufficient('sleepSelf', 'h', 'sin responder hoy'));
  } else {
    const bad = String(subj.sleepBand) === '<6h';
    signals.push({
      id: 'sleepSelf', label: _READ_LABELS.sleepSelf, fired: bad, dir: 'down', value: null, baseline: null, unit: 'h',
      // `band` es la respuesta CRUDA ('<6h', '6-7'…). La lleva la señal para que la UI pueda
      // marcar el botón elegido sin volver a leer IndexedDB ni parsear su propio texto.
      band: String(subj.sleepBand),
      text: bad ? 'Dormiste <6 h (check-in)' : 'Dormiste ' + subj.sleepBand + ' (check-in)',
      status: 'ok',
    });
  }
  if (!subj || subj.feel == null || !isFinite(Number(subj.feel))) {
    signals.push(_readInsufficient('feelSelf', '/5', 'sin responder hoy'));
  } else {
    const feel = Number(subj.feel);
    signals.push({
      id: 'feelSelf', label: _READ_LABELS.feelSelf, fired: feel <= 2, dir: 'down', value: feel, baseline: 2, unit: '/5',
      text: 'Te sientes ' + _coachFmtKg(feel) + '/5 (check-in)', status: 'ok',
    });
  }

  // ---- Color: ≥2 concordantes = rojo; 1 = amarillo (READ-002) -----------------------------
  const byId = (id) => signals.find(s => s.id === id) || null;
  const isFired = (id) => { const s = byId(id); return !!(s && s.fired); };
  const fired = signals.filter(s => s.fired).length;
  // "Sin tendencias" = las tres señales de wearable insuficientes. Con tendencias, la mañana sin
  // dato de hoy da un color por TENDENCIA (§B.2.b) en vez de un `unknown` inútil.
  const trendsInsufficient = ['hrv7v28', 'rhr7v28', 'sleep7']
    .every(id => { const s = byId(id); return !s || s.status === 'insufficient'; });
  let color;
  if (fired >= 2) color = 'red';
  else if (fired === 1) color = 'yellow';
  else if (whoopColor === 'yellow') color = 'yellow';
  else if (!wt && trendsInsufficient) color = 'unknown';
  else color = 'green';

  // ---- Confianza: de dónde sale el color, sin adornos -------------------------------------
  const baseDates = new Set();
  for (const r of rows) {
    const a = age(r.date);
    if (a == null || a < READ_BASE_FROM || a > READ_BASE_TO) continue;
    if (Number(r.hrv) > 0 || Number(r.restingHR) > 0 || Number(r.sleepSecs) > 0) baseDates.add(_coachDayStr(r.date));
  }
  const hasBase = baseDates.size >= READ_MIN_BASE_VALUES;
  const confidence = (wt && hasBase) ? 'high' : (wt || hasBase) ? 'medium' : 'low';

  // ---- Deload reactivo (READ-008 + LOAD-004): declive SOSTENIDO, no un mal día ------------
  const deloadHint = fired >= 3
    || isFired('rpe2')
    || (isFired('hrv7v28') && isFired('rhr7v28') && isFired('quality2'));

  return { color, signals, fired, confidence, deloadHint, ruleIds: READ_RULE_IDS.slice() };
}

// ==================== EL AJUSTE DE LA SESIÓN (READ-007) ====================
//
// READ-007 dice que un día rojo cambia el OBJETIVO de la sesión, no sólo la carga. Esta función
// es esa frase hecha código: devuelve la MISMA sesión con menos accesorios y un tope de RPE
// (amarillo), o una sesión distinta (rojo + día exigente).
//
// LO QUE NO TOCA, NUNCA:
//   · Los kg. La carga la fija `suggestSetTarget` (doble progresión) y la fatiga se gestiona por
//     RPE y volumen — STR-001. Un readiness que mueve el kg es un score convertido en dosis, que
//     es exactamente lo que READ-003 prohíbe.
//   · Los compuestos en amarillo. En déficit lo que preserva fuerza es la intensidad de los
//     compuestos (STR-001); lo primero que sobra son los accesorios.
//   · El Z2 finisher ni los días de descanso/recuperación: ya son la parte fácil.
//
// Y NO BLOQUEA: esto devuelve una PROPUESTA. Los dos botones de Home arrancan, y las dos
// decisiones quedan registradas (`logDecision`).

/** Redondeo a 5 minutos: la duración de una sesión no se prescribe en minutos sueltos. */
function _readRound5(x) { return Math.round(Number(x) / 5) * 5; }

/** Copia superficial de la sesión + copia de cada ejercicio. `planned` NUNCA se muta. */
function _readCopySession(planned) {
  const s = Object.assign({}, planned || {});
  if (Array.isArray(s.exercises)) s.exercises = s.exercises.map(e => Object.assign({}, e));
  return s;
}

/**
 * Recorte de accesorios por PERMANENCIA, no por orden de aparición.
 *
 * Permanencia (de más a menos): `compuesto > Core > miembro de superserie > accesorio suelto`.
 * Se quita desde el FINAL dentro del grupo menos permanente que quede. Los ejercicios de
 * potencia/pliometría salen SIEMPRE (INT-004: la potencia va en fresco y con intención máxima;
 * en amarillo no hay intención máxima) y NO cuentan contra `n`.
 *
 * DOS PREDICADOS, NO UNO, y la diferencia importa:
 *   · `isCompound` = la flag `compound` del plan. Es lo que el resto de app.js entiende por
 *     compuesto (quick mode, bloques, `deriveExerciseFlags`) y lo que decide quién sobrevive a un
 *     día rojo ("sólo compuestos y core").
 *   · `isMainLift` = uno de los seis patrones del plan (sentadilla, bisagra, los dos empujes, los
 *     dos tirones). PROTEGE del recorte de accesorios a movimientos que el plan no marca como
 *     compuestos aunque lo sean: el RDL de `lowerA` no lleva la flag, y sin este predicado un
 *     recorte de 2 accesorios se llevaría el peso muerto y dejaría el gemelo.
 * Añadir la flag que falta en `PLAN` sería más limpio, pero `compound` también controla el
 * recorte de quick mode: cambiarla movería series en la pantalla más usada por un motivo que no
 * tiene nada que ver. Se arregla aquí, donde se necesita, y se dice por qué.
 *
 * @param {Array} exercises Ejercicios de la sesión, en orden.
 * @param {number} n        Cuántos accesorios recortar.
 * @param {object} [opts]
 * @param {object|Set} [opts.powerIds] Ids de potencia (`COACH_POWER_IDS`).
 * @param {function} [opts.isCore]     `(ex) => bool`. Por defecto `muscle === 'Core'`.
 * @param {function} [opts.isCompound] `(ex) => bool`. Por defecto la flag `compound` del plan.
 * @param {function} [opts.isMainLift] `(ex) => bool`. Por defecto ninguno.
 * @returns {{kept:Array, dropped:Array, power:Array}}
 */
function _coachTrimAccessories(exercises, n, opts = {}) {
  const o = opts || {};
  const pw = o.powerIds || {};
  const isPower = (ex) => !!(ex && ex.id && (pw instanceof Set ? pw.has(ex.id) : pw[ex.id]));
  const isCore = typeof o.isCore === 'function' ? o.isCore : (ex) => !!(ex && ex.muscle === 'Core');
  const isCompound = typeof o.isCompound === 'function' ? o.isCompound : (ex) => !!(ex && ex.compound);
  const isMainLift = typeof o.isMainLift === 'function' ? o.isMainLift : () => false;
  const list = Array.isArray(exercises) ? exercises : [];
  const power = list.filter(isPower);
  const rest = list.filter(ex => !isPower(ex));
  const rank = (ex) => ((isCompound(ex) || isMainLift(ex)) ? 3 : isCore(ex) ? 2 : (ex && ex.superset) ? 1 : 0);
  const slots = rest.map(ex => ({ ex, rank: rank(ex) }));
  const dropped = [];
  let left = Math.max(0, Math.floor(Number(n) || 0));
  for (let tier = 0; tier <= 1 && left > 0; tier++) {          // 0 = suelto, 1 = superserie
    for (let i = slots.length - 1; i >= 0 && left > 0; i--) {
      if (slots[i] && slots[i].rank === tier) { dropped.push(slots[i].ex); slots[i] = null; left--; }
    }
  }
  return { kept: slots.filter(Boolean).map(s => s.ex), dropped, power };
}

/**
 * La sesión ajustada a la recuperación de hoy. Matriz completa en §B.2 del plan.
 *
 * @param {object} planned   Salida de `getPlannedSessionForDate`.
 * @param {object} readiness Salida de `computeReadinessFrom`.
 * @param {object} ctx
 * @param {object} ctx.stress      Salida de `classifySessionStress` (`{level, family, subtype}`).
 * @param {Array}  [ctx.alts]      Alternativas de `ALT_LIBRARY` (`getReplacementOptions`).
 * @param {object|Set} [ctx.powerIds]
 * @param {function} [ctx.isCore]
 * @param {function} [ctx.isCompound] Quién es compuesto (flag del plan): decide el esqueleto del
 *                                    día rojo y a quién se le quita una serie.
 * @param {function} [ctx.isMainLift] Quién está protegido del recorte de accesorios (los seis
 *                                    patrones). Ver `_coachTrimAccessories`.
 * @param {number} [ctx.flags]     Nº de flags de interferencia NO redundantes (HYB-002…).
 * @returns {{mode:'keep'|'modify'|'replace'|'recovery', session:object,
 *            changes:Array<{type:string, exerciseId?:string, from:*, to:*, why:string, ruleIds:string[]}>,
 *            reason:string[], alternatives:Array, confidence:string, ruleIds:string[]}}
 */
function adjustSessionForReadiness(planned, readiness, ctx = {}) {
  const c = ctx || {};
  const stress = c.stress || {};
  const alts = Array.isArray(c.alts) ? c.alts : [];
  const trimOpts = { powerIds: c.powerIds, isCore: c.isCore, isCompound: c.isCompound, isMainLift: c.isMainLift };
  const color = (readiness && readiness.color) || 'unknown';
  const confidence = color === 'unknown' ? 'low' : ((readiness && readiness.confidence) || 'low');
  const level = stress.level || 'easy';
  const family = stress.family
    || (planned && planned.type === 'run' ? 'cardio' : (planned && planned.type === 'gym' ? 'strength' : 'recovery'));
  const name = (planned && planned.name) || 'la sesión';

  const session = _readCopySession(planned);
  const changes = [];
  const reason = [];
  const rules = new Set();
  let mode = 'keep';

  const add = (ch) => { changes.push(ch); (ch.ruleIds || []).forEach(r => rules.add(r)); };
  const out = () => ({
    mode, session, changes, reason,
    alternatives: mode === 'keep' ? [] : alts,
    confidence, ruleIds: Array.from(rules),
  });

  const señales = (readiness && readiness.fired) || 0;
  const plural = señales === 1 ? 'señal' : 'señales';
  const firedText = ((readiness && readiness.signals) || []).filter(s => s.fired).map(s => s.text);

  // ---- Descanso / recuperación: no hay nada que ajustar ----------------------------------
  if (!planned || planned.type === 'rest' || planned.type === 'recovery' || family === 'recovery') {
    rules.add('READ-007');
    reason.push('Día de descanso o recuperación: ya es la parte fácil, no se toca.');
    return out();
  }

  // ---- Sin dato de hoy: se mantiene el plan y se dice por qué (F-6) ----------------------
  if (color === 'unknown') {
    rules.add('READ-001'); rules.add('READ-003');
    reason.push('Sin dato de recuperación de hoy: dejo el plan tal cual.');
    return out();
  }

  if (color === 'green') {
    rules.add('READ-002');
    reason.push('Recuperación en verde: la sesión va tal cual.');
    return out();
  }

  // ---- CARDIO ---------------------------------------------------------------------------
  if (family === 'cardio') {
    const dur = Number(session.durationMin) || null;
    if (level === 'easy') {
      // El Z2 fácil es la sesión que MENOS conviene quitar: mantiene el hábito y la base aeróbica
      // sin coste de recuperación (END-001). En rojo sólo se le pone un tope.
      rules.add('READ-007');
      if (color === 'red' && dur && dur > 30) {
        session.durationMin = 30;
        add({
          type: 'durationScale', from: dur, to: 30,
          why: 'Tope de 30′ hoy: mantener el hábito sin sumar fatiga',
          ruleIds: ['READ-007', 'END-001'],
        });
        reason.push('Recuperación en rojo: el Z2 se queda, con tope de 30′.');
      } else {
        reason.push('Cardio fácil: se mantiene igual.');
      }
      return out();
    }
    if (color === 'yellow') {
      mode = 'modify';
      if (dur) {
        const to = Math.max(20, _readRound5(dur * 0.8));
        session.durationMin = to;
        add({
          type: 'durationScale', from: dur, to,
          why: 'Misma zona y mismo objetivo, 20 % menos de minutos',
          ruleIds: ['END-002', 'READ-007'],
        });
      }
      reason.push('Recuperación amarilla (' + señales + ' ' + plural + '): recorto la duración, no la zona.');
      if (firedText.length) reason.push(firedText[0]);
      return out();
    }
    // Rojo + cardio con carga: cambia el objetivo (READ-007), no los minutos.
    mode = 'replace';
    const alt = alts[0] || null;
    session.type = 'recovery';
    session.name = alt ? alt.label : 'Cardio muy suave';
    session.durationMin = (alt && alt.durationMin) ? alt.durationMin : (dur ? Math.min(dur, 30) : 30);
    session.replacedFrom = name;
    if (alt && alt.subtype) session.subtype = alt.subtype;
    add({
      type: 'replaceSession', from: name, to: session.name,
      why: 'Con la recuperación en rojo el día cambia de objetivo, no de carga',
      ruleIds: ['READ-007', 'INT-002'],
    });
    reason.push('Recuperación en rojo (' + señales + ' ' + plural + '): cambio la sesión de calidad por algo de bajo impacto.');
    if (firedText.length) reason.push(firedText[0]);
    return out();
  }

  // ---- FUERZA / HÍBRIDO ------------------------------------------------------------------
  const exs = Array.isArray(session.exercises) ? session.exercises : [];

  if (level === 'easy') {                    // un día de fuerza clasificado como suave
    reason.push('Sesión suave: se mantiene igual.');
    return out();
  }

  const dropPower = (list) => {
    for (const ex of list) {
      add({
        type: 'dropExercise', exerciseId: ex.id, from: ex.name || ex.id, to: null,
        why: 'La potencia sólo en fresco: hoy pierde intención y sube el riesgo',
        ruleIds: ['INT-004', 'ATH-004'],
      });
    }
  };
  const dropAccessory = (list) => {
    for (const ex of list) {
      add({
        type: 'dropExercise', exerciseId: ex.id, from: ex.name || ex.id, to: null,
        why: 'Menos volumen accesorio: el estímulo que preserva fuerza lo dan los compuestos',
        ruleIds: ['STR-001', 'LOAD-004'],
      });
    }
  };
  const capRpe = () => {
    add({
      type: 'rpeCap', from: null, to: 7,
      why: 'Sin llegar al fallo: mismos kg, menos fatiga',
      ruleIds: ['STR-001', 'READ-007'],
    });
  };

  if (color === 'yellow') {
    mode = 'modify';
    const n = level === 'hard' ? 2 : 1;      // exigente recorta 2 accesorios; moderada, 1
    const t = _coachTrimAccessories(exs, n, trimOpts);
    session.exercises = t.kept;
    // Orden de los cambios = orden en que se leen en la tarjeta: primero qué desaparece, después
    // cómo se hace lo que queda.
    dropPower(t.power);
    dropAccessory(t.dropped);
    capRpe();
    reason.push('Recuperación amarilla (' + señales + ' ' + plural + '): compuestos intactos, menos accesorios y tope de RPE 7.');
    if (firedText.length) reason.push(firedText[0]);
    return out();
  }

  // ---- ROJO ------------------------------------------------------------------------------
  if (level === 'hard') {
    // Pierna pesada, full body o híbrido con la recuperación en rojo: el objetivo del día cambia.
    // Con una segunda bandera de interferencia (familia híbrida, HYB-002) se propone un CAMBIO de
    // modalidad; sin ella, recuperación activa de 30′.
    const alt = alts[0] || null;
    mode = (Number(c.flags) || 0) >= 1 ? 'replace' : 'recovery';
    const min = mode === 'recovery' ? 30 : ((alt && alt.durationMin) ? alt.durationMin : 30);
    session.type = 'recovery';
    session.name = alt ? alt.label : 'Recuperación activa';
    session.durationMin = min;
    session.replacedFrom = name;
    delete session.exercises;
    add({
      type: 'replaceSession', from: name, to: session.name + ' · ' + min + '′',
      why: 'Un día rojo cambia el objetivo de la sesión, no sólo el peso de la barra',
      ruleIds: ['READ-007', 'LOAD-004'],
    });
    reason.push('Recuperación en rojo (' + señales + ' ' + plural + ') con una sesión exigente: cambio el objetivo del día.');
    if (firedText.length) reason.push(firedText[0]);
    return out();
  }

  // Rojo + sesión moderada (upper): se mantiene, pero sólo el esqueleto.
  mode = 'modify';
  const isCore = typeof c.isCore === 'function' ? c.isCore : (ex) => !!(ex && ex.muscle === 'Core');
  const isCompound = typeof c.isCompound === 'function' ? c.isCompound : (ex) => !!(ex && ex.compound);
  const pw = c.powerIds || {};
  const isPower = (ex) => !!(ex && ex.id && (pw instanceof Set ? pw.has(ex.id) : pw[ex.id]));
  const kept = [];
  const fuera = [];
  const potencia = [];
  for (const ex of exs) {
    if (isPower(ex)) { potencia.push(ex); continue; }
    if (isCompound(ex) || isCore(ex)) kept.push(ex); else fuera.push(ex);
  }
  // −1 serie en los compuestos, con suelo de 2: por debajo de 2 series no queda estímulo que
  // mantener, y el objetivo del día sigue siendo mantener (STR-001).
  for (const ex of kept) {
    if (!isCompound(ex)) continue;
    const from = Number(ex.sets) || 0;
    const to = Math.max(2, from - 1);
    if (to !== from) {
      ex.sets = to;
      add({
        type: 'setDelta', exerciseId: ex.id, from, to,
        why: 'Una serie menos en los compuestos: mantener, no progresar',
        ruleIds: ['STR-001', 'LOAD-004'],
      });
    }
  }
  session.exercises = kept;
  dropPower(potencia);
  dropAccessory(fuera);
  capRpe();
  reason.push('Recuperación en rojo (' + señales + ' ' + plural + '): sólo compuestos y core, una serie menos y tope de RPE 7.');
  if (firedText.length) reason.push(firedText[0]);
  return out();
}

// ==================== EXPORTS PARA LOS TESTS ====================
// tests/verify-coach-wiring.mjs, verify-block-week.mjs y verify-set-target.mjs cargan este
// fichero con `vm` y leen este bloque. En el navegador no estorba (no hay `module`).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COACH_GOALS_DEFAULT,
    isoWeekKey,
    mondayOf,
    blockWeekFromDates,
    anchorDateFromWeek,
    roundStep,
    progressCardioMin,
    // Progresión (incremento 3, v11.57)
    COACH_DB_PAIRS_KG,
    COACH_STEP_KG,
    COACH_INC,
    COACH_CABLE_IDS,
    COACH_POWER_IDS,
    COACH_PAUSE_DAYS,
    COACH_TARGET_TTL_DAYS,
    COACH_DELOAD_FACTOR,
    COACH_RPE_HIGH,
    _coachParseReps,
    _coachParseRpeTop,
    _coachRound,
    _coachNextDbPair,
    _coachPrevDbPair,
    _coachSnapDbPair,
    _coachSnapDbDown,
    _coachLoadType,
    _coachIncrement,
    _coachFmtKg,
    _coachFmtRpe,
    _coachWeekKeyMonday,
    _coachDaysBetween,
    parseCoachTarget,
    suggestSetTarget,
    sessionReadout,
    // Readiness (incremento 5, v11.59)
    READ_CUTOFFS,
    READ_HRV_DROP_PCT,
    READ_RHR_RISE_BPM,
    READ_SLEEP_FLOOR_SECS,
    READ_RPE_FLOOR,
    READ_QUALITY_CEIL,
    READ_MIN_TREND_VALUES,
    READ_MIN_BASE_VALUES,
    READ_MIN_SLEEP_NIGHTS,
    READ_RULE_IDS,
    _readMean,
    _readPct,
    _readDelta,
    _readRound5,
    _readCopySession,
    _coachTrimAccessories,
    computeReadinessFrom,
    adjustSessionForReadiness,
  };
}
