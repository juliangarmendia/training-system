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
// `mondayOf`, `anchorDateFromWeek`) y la progresión de cardio (`progressCardioMin`). Los
// incrementos siguientes añaden aquí `suggestSetTarget` (inc. 3), `computeReadinessFrom` /
// `adjustSessionForReadiness` (inc. 5) y `suggestRunningWeek` / `goalProgress` (inc. 6).

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

// ==================== EXPORTS PARA LOS TESTS ====================
// tests/verify-coach-wiring.mjs y tests/verify-block-week.mjs cargan este fichero con `vm` y
// leen este bloque. En el navegador no estorba (no hay `module`).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COACH_GOALS_DEFAULT,
    isoWeekKey,
    mondayOf,
    blockWeekFromDates,
    anchorDateFromWeek,
    roundStep,
    progressCardioMin,
  };
}
