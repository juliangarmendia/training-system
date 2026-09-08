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
// único (`computeReadinessFrom`). El incremento 6 añade `suggestRunningWeek` / `goalProgress`.
// v11.62 retira el ajuste diario de la sesión —la recuperación informa, no dosifica— y pone en
// su lugar `performanceLine`: el rendimiento primero.

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

// ==================== UNA FUENTE POR CONCEPTO ====================
//
// EL FALLO QUE ESTA SECCIÓN EXISTE PARA IMPEDIR (E-9, auditoría 2026-09-08). El sistema tenía
// DOS constantes de libras a kilos (`0.453592` en app.js, `0.45359237` aquí, dos veces), dos
// tolerancias de Z2 (+2 bpm en el motor y en el pack, estricta en `performanceLine`) y TRES
// formas de saber la masa libre de grasa (la declarada de 72,8, la de Withings y la derivada
// `peso × (1 − %grasa)`). Dos números para el mismo concepto no son un detalle de estilo: son
// dos pantallas que dicen cosas distintas del mismo dato y una decisión que depende de cuál se
// leyó primero. Cada concepto se define UNA vez aquí y se importa desde donde se use.

/**
 * Libras a kilos, exacto (1 lb = 0,45359237 kg). Los registros anteriores a la mudanza a
 * España están en lb y llevan su `unit`; todo lo que compare cargas históricas con las de
 * hoy pasa por aquí. `0.453592` (el valor truncado que había en app.js) desvía 0,4 g/kg —
 * irrelevante en un peso corporal y visible en un e1RM sobre 200 lb.
 */
const LB_TO_KG = 0.45359237;

/**
 * Tope porcentual del salto de carga entre sesiones (STR-009 / guardarraíl `LOAD-JUMP`).
 *
 * POR QUÉ UN PORCENTAJE Y NO SÓLO EL DISCO. Los saltos absolutos (2,5 kg en barra, el par
 * siguiente de mancuernas) son los que hay en el gimnasio, pero sobre cargas pequeñas son
 * enormes: 4 → 6 kg en una mancuerna es **+50 %**, y +2,5 sobre una máquina de 20 kg es
 * +12,5 %. El validador del coach ya rechazaba esos saltos cuando los proponía el modelo
 * (`VP_LOAD_JUMP_PCT` en coach-facts.js); la regla de la app los prescribía sin mirar. Mismo
 * tope para las dos fuentes, o el coach queda sujeto a un límite que la app se salta.
 */
const LOAD_JUMP_MAX_PCT = 0.10;

/** Días que una lectura de bioimpedancia sigue describiendo el cuerpo de hoy. */
const FFM_FRESH_DAYS = 14;

/**
 * MASA LIBRE DE GRASA, una sola vez y con su procedencia (E-9).
 *
 * Había tres respuestas a la misma pregunta y ninguna decía de dónde venía: los 72,8 kg
 * declarados de `docs/profile.md` (Tanita, 2026-08-11), la lectura de la báscula Withings
 * (`bodyweightRows[].ffmKg`) y la derivada `peso × (1 − %grasa)` que calculaba `nutrition.js`.
 * Con la EA dividiendo por una u otra, el mismo día salía 26,4 (bajo el suelo REC-008) o 28,9
 * (que parece otro problema). Y el pack del coach leía una tercera.
 *
 * PRECEDENCIA, de más medido a más declarado:
 *   1. **Withings ≤ 14 días** — bioimpedancia real y reciente. 14 días porque la FFM se mueve
 *      despacio: una lectura de anteayer describe el cuerpo de hoy, una de hace un mes no.
 *   2. **Derivada de la última fila medida con %grasa** — `peso × (1 − bfPct/100)`. Es la que
 *      cubre la Tanita del gimnasio y cualquier báscula que dé porcentaje.
 *   3. **Declarada** (`settings.goals.preserve.ffmKg` → `COACH_GOALS_DEFAULT`). El último
 *      recurso, y va marcado como tal: una EA calculada sobre una FFM de hace un mes es una
 *      estimación, no una medida.
 *
 * `source` viaja en el retorno a propósito. Sin él, la tarjeta de nutrición y el pack del
 * coach no pueden distinguir "28,9 medido ayer" de "28,9 sobre un número de agosto", que es la
 * diferencia entre un dato y una suposición.
 *
 * @param {object} input
 * @param {Array<object>} [input.bodyweightRows] Filas del store `bodyweight`
 *        (`{date, weight, bfPct|fatPct, ffmKg, measured, source}`), en cualquier orden.
 * @param {object} [input.settings]  `state.settings` (usa `goals.preserve.ffmKg`).
 * @param {string} [input.todayStr]  'YYYY-MM-DD'. Por defecto, hoy.
 * @returns {{kg:number, source:'withings'|'derived'|'declared', date:string|null,
 *           ageDays:number|null, note:string}}
 */
function ffmKg(input) {
  const inp = input || {};
  const rows = Array.isArray(inp.bodyweightRows) ? inp.bodyweightRows : [];
  const todayStr = _coachDayStr(inp.todayStr) || _coachDayStr(new Date().toISOString());
  const declared = (() => {
    const s = inp.settings || {};
    const fromSettings = Number(((s.goals || {}).preserve || {}).ffmKg);
    if (isFinite(fromSettings) && fromSettings > 0) return fromSettings;
    return Number(COACH_GOALS_DEFAULT.preserve.ffmKg);
  })();
  const r1 = (v) => Math.round(Number(v) * 10) / 10;
  const conFecha = rows
    .filter(r => r && r.date && (!todayStr || String(r.date).slice(0, 10) <= todayStr))
    .slice()
    .sort((a, b) => String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10)));

  // 1. Withings con lectura de bioimpedancia dentro de la ventana.
  for (const r of conFecha) {
    if (String(r.source || '').toLowerCase() !== 'withings') continue;
    const kg = Number(r.ffmKg);
    if (!isFinite(kg) || kg <= 0) continue;
    const age = _coachDaysBetween(r.date, todayStr);
    if (age != null && age > FFM_FRESH_DAYS) continue;
    return { kg: r1(kg), source: 'withings', date: String(r.date).slice(0, 10), ageDays: age,
      note: `Withings, hace ${age == null ? '?' : age} d` };
  }

  // 2. Derivada de la última fila con %grasa.
  for (const r of conFecha) {
    const w = Number(r.weight != null ? r.weight : r.kg);
    const bf = Number(r.bfPct != null ? r.bfPct : r.fatPct);
    if (!isFinite(w) || w <= 0 || !isFinite(bf) || bf <= 0 || bf >= 100) continue;
    const age = _coachDaysBetween(r.date, todayStr);
    return { kg: r1(w * (1 - bf / 100)), source: 'derived', date: String(r.date).slice(0, 10),
      ageDays: age, note: `derivada de ${r1(w)} kg y ${r1(bf)} % de grasa` };
  }

  // 3. Declarada.
  return { kg: r1(declared), source: 'declared', date: null, ageDays: null,
    note: 'FFM declarada (docs/profile.md): estimación, no medida' };
}

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

/**
 * La semana PARA LA QUE se pide una revisión (v11.65, plan v2.1 §B.4).
 *
 * LA SEMÁNTICA, que es lo que hay que entender antes que el código: **la revisión es PARA una
 * semana y SOBRE lo anterior**. El domingo por la tarde, "cerrar la semana" significa mirar la
 * que termina y escribir la que empieza mañana; de lunes a sábado significa la semana en curso
 * (se llegó tarde, o se regenera con una nota).
 *
 * Por eso el domingo —y sólo el domingo— la clave que devuelve es la de la semana SIGUIENTE.
 * Sin esto, cerrar el domingo escribiría una propuesta con la clave de la semana que acaba de
 * terminar, `_coachExpireIfStale` la declararía vencida el lunes a las 00:00 y el trabajo del
 * coach moriría antes de que nadie lo aplicase.
 *
 * @param {string} dateStr 'YYYY-MM-DD'
 * @returns {string|null} 'YYYY-Www' o null si la entrada no es una fecha.
 */
function coachTargetWeekKey(dateStr) {
  const s = String(dateStr == null ? '' : dateStr).slice(0, 10);
  const t = _utcMs(s);
  if (t == null) return null;
  // getUTCDay(): domingo = 0. Aritmética en UTC como el resto del fichero.
  return isoWeekKey(new Date(t).getUTCDay() === 0 ? _utcDayStr(t + 86400000) : s);
}

/**
 * Las cinco fases del contrato v2 del coach, en castellano (plan v2.1 §B.3).
 * Vive en el motor y no en el renderer: la usan la tarjeta de Home, la vista Coach y el
 * teaser de Stats, y tres traducciones del mismo enum se desincronizan.
 */
const PHASE_ES = {
  base: 'base',
  build: 'construcción',
  intensify: 'intensificación',
  deload: 'descarga',
  maintenance: 'mantenimiento',
};

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
 * La etiqueta del bloque: 'B1', 'B2', 'B3'… contando desde el ancla (v11.65).
 *
 * MISMA NUMERACIÓN QUE `facts.trajectory.program.blocks` (`coach-facts.js`, `_trajProgram`):
 * el bloque que empieza en el ancla es B1. Si la tarjeta de Home dijera "B2" y el pack que ve
 * el coach dijera "B1", las dos mitades del sistema estarían hablando de semanas distintas.
 *
 * PARÁMETROS Y NO `settings`: el motor es puro (§Principios 1 del plan v2). El llamador pasa
 * `state.settings.deloadAnchorDate`; el plan lo escribe como `blockLabel(todayStr)` porque en
 * la app siempre se llama con el ancla del usuario.
 *
 * @returns {string|null} 'B<n>', o null antes del ancla o sin ancla (no se extrapola atrás).
 */
function blockLabel(dateStr, anchorMondayStr, blockWeeks = 5) {
  const n = Math.max(2, Math.floor(Number(blockWeeks)) || 5);
  const b = blockWeekFromDates(dateStr, anchorMondayStr, n);
  if (!b || b.weeksIntoBlock == null || b.weeksIntoBlock < 0) return null;
  return `B${Math.floor(b.weeksIntoBlock / n) + 1}`;
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
// una rampa lenta cuesta poco (`research/evidence-to-rules.md`, END-003 marcada `moderate`,
// confianza media: Bertelsen 2017 respalda el MECANISMO carga-vs-capacidad, no el 10 %).
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
 * @param {number|null} [opts.lastCardioDaysAgo] Días desde el último cardio registrado EN ESTE
 *                                            HUECO (mismo slot / día de la semana) cuando se
 *                                            pasa `history`; null = nunca se registró.
 * @param {number|null} [opts.coachMin]       Objetivo del coach para este día, si lo hay.
 * @param {Array<{weekKey:string, min:number}>} [opts.history] Minutos ya hechos en este hueco,
 *                                            una entrada por sesión, con su semana ISO. Si se
 *                                            pasa (aunque venga vacío), la rampa sale de la
 *                                            MEDIANA de las dos últimas semanas con dato y el
 *                                            `index` del bloque deja de decidir (E-6).
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
  if (o.lastCardioDaysAgo == null) {
    // Sin historial no se inventa una rampa: progresar sobre la nada es prescribir a ciegas.
    return { min: base, source: 'base', note: 'sin cardio registrado: repite base' };
  }
  if (Number(o.lastCardioDaysAgo) > 14) {
    return { min: base, source: 'base', note: `${o.lastCardioDaysAgo} d sin cardio: repite base` };
  }

  // 3. LA RAMPA SALE DE LO HECHO, NO DEL CALENDARIO (E-6, auditoría 2026-09-08).
  //
  // El fallo que cierra: la rampa iba sobre `block.index`, así que la semana 4 del bloque
  // prescribía base × 1,1³ AUNQUE las tres semanas anteriores no se hubiese corrido — una bici
  // de hace tres días bastaba para pasar la puerta de los 14 días y el número seguía subiendo
  // sobre una base aeróbica que no existía. Ahora la referencia es la MEDIANA de los minutos
  // de las dos últimas semanas ISO CON DATO EN ESTE HUECO: se progresa desde donde se está.
  //
  // La mediana y no la media: un día en que se cortó la sesión a la mitad no debe arrastrar la
  // prescripción de la semana siguiente. Y el techo sigue siendo relativo a la BASE del slot
  // (× 1,35), que es lo que impide que un hueco de 40′ acabe pidiendo 115′.
  if (Array.isArray(o.history)) {
    const ref = _cardioRefMin(o.history);
    if (ref == null) {
      return { min: base, source: 'base', note: 'sin minutos registrados en este hueco: repite base' };
    }
    if (b.isDeload) {
      return { min: roundStep(ref * 0.7, step), source: 'rule', note: `deload: −30 % sobre ${_cardioFmtMin(ref)}′` };
    }
    const rawH = Math.min(ref * 1.1, base * 1.35);
    return {
      min: roundStep(rawH, step),
      source: 'rule',
      note: `+10 % sobre ${_cardioFmtMin(ref)}′ (mediana de las 2 últimas semanas con dato)`,
    };
  }

  if (b.index == null) {
    return { min: base, source: 'base', note: 'sin ancla de bloque: repite base' };
  }
  // 4. Descarga: −30 %. Es el punto entero del bloque; progresar aquí sería lo peor de los dos
  //    mundos (series de fuerza al 50 % Y pico de cardio en la misma semana).
  if (b.isDeload) {
    return { min: roundStep(base * 0.7, step), source: 'rule', note: 'deload: −30 %' };
  }
  // 5. Sin historial del hueco: +10 % por semana desde la 1 (la semana 1 ES la base), con techo.
  //    Es el camino LEGACY, para los llamadores que todavía no pasan `history`.
  const raw = Math.min(base * Math.pow(1.1, b.index - 1), base * 1.35);
  return { min: roundStep(raw, step), source: 'rule', note: `semana ${b.index} del bloque` };
}

/** Minutos con coma decimal y sin ceros de relleno: 42,5 → '42,5' · 45 → '45'. */
function _cardioFmtMin(v) {
  const n = Number(v);
  if (!isFinite(n)) return '';
  return (Math.round(n * 10) / 10).toFixed(1).replace(/[,.]0$/, '').replace('.', ',');
}

/**
 * La referencia de la rampa: la MEDIANA de los minutos de las DOS ÚLTIMAS semanas ISO con dato.
 *
 * Se agrupan las entradas por `weekKey`, se ordenan las semanas de más reciente a más antigua
 * (las claves 'YYYY-Www' ordenan lexicográficamente igual que en el tiempo), se toman las dos
 * primeras que tengan algún minuto útil y se saca la mediana del conjunto de las dos juntas.
 *
 * @returns {number|null} null si no hay ni un minuto utilizable (→ el llamador repite la base).
 */
function _cardioRefMin(history) {
  const porSemana = new Map();
  for (const h of (history || [])) {
    const min = Number(h && h.min);
    const wk = h && h.weekKey ? String(h.weekKey) : null;
    if (!wk || !isFinite(min) || min <= 0) continue;
    if (!porSemana.has(wk)) porSemana.set(wk, []);
    porSemana.get(wk).push(min);
  }
  if (!porSemana.size) return null;
  const semanas = Array.from(porSemana.keys()).sort().reverse().slice(0, 2);
  const pool = [];
  for (const wk of semanas) for (const m of porSemana.get(wk)) pool.push(m);
  if (!pool.length) return null;
  pool.sort((a, b) => a - b);
  const mid = pool.length >> 1;
  return pool.length % 2 ? pool[mid] : (pool[mid - 1] + pool[mid]) / 2;
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
 * UNA FILA POR DÍA (E-3, auditoría 2026-09-08).
 *
 * EL FALLO QUE CIERRA. El historial que llega es "todas las sesiones en que se hizo este
 * ejercicio", y un mismo día puede traer DOS: la sesión del plan y una libre, o un registro
 * reabierto y vuelto a guardar. Con dos filas de la misma fecha, `usable[0]` y `usable[1]`
 * eran el mismo entreno y la regla concluía "dos sesiones iguales: hoy +1 rep" el mismo día en
 * que se levantó por primera vez ese peso. Y `daysSince` salía 0, así que la puerta de la
 * pausa larga se leía sobre un intervalo que no existía.
 *
 * SE QUEDA LA DE MÁS SERIES HECHAS: entre un registro con 3 series y otro con 1, el de 3 es la
 * sesión y el de 1 es el que se abrió y se dejó. A igualdad de series, la primera que venía
 * (el llamador entrega el historial ordenado de más reciente a más antiguo, y dentro del mismo
 * día el orden de `workouts` ya es el que decide todo lo demás).
 *
 * @param {Array} hist  Historial de UN ejercicio.
 * @param {'measure'|'db'|'bw'|'cable'|'barbell'|'machine'} type
 */
function _coachDedupeHistory(hist, type) {
  const porDia = new Map();
  const hechas = (h) => (Array.isArray(h && h.sets) ? h.sets : []).filter(
    s => s && s.done && (Number(s.weight) > 0 || type === 'bw')).length;
  for (const h of (hist || [])) {
    const d = _coachDayStr(h && h.date);
    if (d == null) continue;                       // sin fecha no se puede deduplicar: se cae
    const prev = porDia.get(d);
    if (!prev || hechas(h) > hechas(prev)) porDia.set(d, h);
  }
  const sinFecha = (hist || []).filter(h => _coachDayStr(h && h.date) == null);
  return Array.from(porDia.values())
    .sort((a, b) => String(b.date).slice(0, 10).localeCompare(String(a.date).slice(0, 10)))
    .concat(sinFecha);
}

/**
 * ¿Sigue vigente un objetivo que el coach fijó en la semana ISO `planWeekKey`?
 *
 * Vigente = esa semana es la de hoy o la ANTERIOR. Se compara por FECHAS y no restando números
 * de semana: en el cruce de año ('2027-W01' menos '2026-W53') la resta daría −52 y un objetivo
 * de la semana pasada se declararía vencido justo en Nochevieja.
 *
 * Lo usan `suggestSetTarget` (para el kg) y `_coachCardioMin` en app.js (para los minutos):
 * el mismo objetivo con dos vidas distintas era el fallo E-4 — los kg del coach caducaban y
 * sus minutos de cardio no, así que un plan de hace tres semanas seguía prescribiendo 50′.
 *
 * @param {string|null} planWeekKey   Semana ISO en que el coach lo fijó ('2026-W37').
 * @param {string|null} todayStr      'YYYY-MM-DD'. Por defecto, hoy.
 * @param {string|null} [todayWeekKey] Semana ISO de hoy, si el llamador ya la tiene.
 */
function coachTargetIsCurrent(planWeekKey, todayStr, todayWeekKey) {
  const ds = _coachDayStr(todayStr) || _coachDayStr(new Date().toISOString());
  const ctMonday = _coachWeekKeyMonday(planWeekKey);
  const todayMonday = _coachWeekKeyMonday(todayWeekKey) || mondayOf(ds);
  if (!ctMonday || !todayMonday) return false;
  const d = _coachDaysBetween(ctMonday, todayMonday);
  return d != null && d >= 0 && d <= 7;
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
  // Y UNA POR DÍA (E-3): dos registros del mismo día no son dos sesiones.
  const usable = _coachDedupeHistory(hist, type).filter(
    h => Array.isArray(h && h.sets) && h.sets.some(
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
    let vigente = false;
    let ageDays = null;
    if (ctMonday) {
      // Una sola aritmética de vigencia, compartida con los minutos de cardio (E-4).
      vigente = coachTargetIsCurrent(o.coachWeekKey, todayStr, o.todayWeekKey);
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
  // La penúltima sesión utilizable, que hace falta dos veces: para la puerta del RPE ausente
  // (E-2) y para detectar el estancamiento de "dos sesiones iguales".
  const prev = usable[1] || null;
  const prevDoneSets = prev
    ? prev.sets.filter(s => s && s.done && (Number(s.weight) > 0 || type === 'bw'))
    : [];
  const prevAllHitMax = prevDoneSets.length > 0
    && prevDoneSets.every(s => (Number(s.reps) || 0) >= range.max);

  /**
   * ¿El salto propuesto pasa del 10 % del último top set? (E-1 · STR-009 / LOAD-JUMP)
   *
   * Se mide DESPUÉS del redondeo al disco o al par de mancuernas, que es donde vive el
   * problema: el salto no es "2,5 kg", es el salto que de verdad se va a poner en la barra.
   * 4 → 6 kg en una mancuerna es +50 %; +2,5 sobre una máquina de 20 kg es +12,5 %. Sin este
   * tope, la regla de la app prescribía saltos que el validador del coach rechaza.
   */
  const jumpPct = (from, to) => {
    const a = Number(from);
    const b = Number(to);
    if (!isFinite(a) || a <= 0 || !isFinite(b)) return null;
    return (b - a) / a;
  };
  const tooBigJump = (from, to) => {
    const p = jumpPct(from, to);
    return p != null && p > LOAD_JUMP_MAX_PCT + 1e-9;
  };
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

  // RPE AUSENTE NO ES RPE BAJO (E-2, auditoría 2026-09-08).
  //
  // El fallo que cierra: la condición era `avgRpe == null || avgRpe <= rpeTop`, o sea que
  // "no anoté el esfuerzo" contaba igual que "me sobró". Una sesión llevada al fallo sin RPE
  // apuntado sumaba +2,5 kg a la siguiente. Sin el dato no se puede saber si sobró margen, así
  // que hace falta la otra evidencia que sí existe: haber cerrado el rango DOS veces seguidas.
  // Una sesión al tope puede ser una sesión al límite; dos son una tendencia.
  if (allHitMax && avgRpe == null && !prevAllHitMax) {
    return rule(lastTopKg,
      'sin RPE: subo sólo tras dos sesiones al tope. Hoy: mismo kg, y anota el RPE',
      ['STR-001', 'GEN-002']);
  }

  if (allHitMax && (avgRpe == null || avgRpe <= rpeTop)) {
    // Peso corporal al tope y sin lastre: el salto es empezar a colgar disco.
    if (type === 'bw' && (lastTopKg == null || lastTopKg <= 0)) {
      return rule(COACH_INC.bw,
        `${doneSets.length}×${range.max} a peso corporal → añade ${_coachFmtKg(COACH_INC.bw)} kg de lastre`);
    }
    const next = _coachIncrement(e, lastTopKg, 1, o.measureUnit);
    // EL TOPE PORCENTUAL (E-1) NO BLOQUEA: PIDE UNA SESIÓN MÁS AL TOPE.
    //
    // Con material discreto no siempre se puede subir dentro del 10 %: el par siguiente de una
    // mancuerna de 4 kg es 6 (+50 %) y no hay nada en medio, igual que +2,5 en una máquina de
    // 20 kg es +12,5 %. Prohibir el salto dejaría esas cargas congeladas para siempre; lo que
    // se exige es más evidencia antes de darlo: cerrar el tope del rango DOS veces seguidas.
    // Una sesión al tope puede ser un buen día; dos son margen real (misma lógica que E-2).
    if (tooBigJump(lastTopKg, next) && !prevAllHitMax) {
      const pct = Math.round(jumpPct(lastTopKg, next) * 100);
      return rule(lastTopKg,
        `De ${_coachFmtKg(lastTopKg)} a ${_coachFmtKg(next)} kg serían +${pct} % — salto grande (>10 %): una sesión más al tope antes de subir. Hoy: mismo kg y +reps (+1 por serie)`,
        ['STR-001', 'STR-009']);
    }
    const rpeTxt = avgRpe == null ? '(sin RPE anotado, segunda al tope)' : `@${_coachFmtRpe(avgRpe)}`;
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
  const mean = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);
  if (prev) {
    const prevTop = prevDoneSets.length ? Math.max(...prevDoneSets.map(s => Number(s.weight) || 0)) : null;
    if (prevTop != null && prevTop === lastTopKg
        && mean(prevDoneSets.map(s => Number(s.reps) || 0)) === mean(lastReps)) {
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
//   Home  · el advisory diario        → color WHOOP de un día + 2 flags → mantener/ajustar/…
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
//   READ-005 · el RENDIMIENTO pesa cuando el wearable falta o discrepa: de ahí `rpe2` y
//              `quality2`. (El check-in subjetivo de 2 toques salió en v11.62 con el ajuste
//              diario: un dato que no cambia ninguna decisión no se pide.)
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
  rpe2: 'RPE', quality2: 'Calidad',
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
 *                                             `{date, readiness, hrv, restingHR, sleepSecs}`.
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

  // RETIRADO en v11.62: las señales 7-8 eran el check-in subjetivo de 2 toques (`sleepSelf` /
  // `feelSelf`). Se fueron con el ajuste diario: sin nadie que cambie el entreno por el color
  // del día, preguntar cada mañana "¿cómo dormiste?" es pedir un dato para no hacer nada con
  // él. Nada escribe ya `wellness[hoy].subjective`; las filas históricas que lo tengan se
  // conservan intactas y simplemente no se leen. Quedan SEIS señales.

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

// ==================== LÍNEA DE RENDIMIENTO ====================
//
// QUÉ SUSTITUYE (v11.62). Aquí vivía "EL AJUSTE DE LA SESIÓN (READ-007)": la función que
// devolvía la sesión del día con menos accesorios, un tope de RPE o cambiada por otra cuando la
// recuperación estaba en rojo. Julian la retiró el 2026-09-07 con una frase que no admite
// interpretación: *"eso es muy subjetivo; voy a ser yo y mi cuerpo el que decida skipear un
// ejercicio o bajar los pesos"*. La recuperación se queda como INFORMACIÓN. La app sigue
// prescribiendo el kg del set (dato propio, doble progresión) y no toca nada más del día.
//
// Y LO QUE ENTRA EN SU LUGAR ES LO CONTRARIO DE UN CONSEJO: un resumen de lo que ha pasado de
// verdad. El principio nuevo es **rendimiento primero** (plan v2.1 §Principios 2): la señal que
// dice cómo va la recuperación es el top set, las reps a la misma carga y el pulso a Z2 — el
// wearable es contexto en tendencia, nunca un día suelto y nunca una dosis.
//
// PURA, como todo este fichero: recibe los registros y devuelve un string. El filtrado por
// fechas y la lectura de IndexedDB los hace `renderRecoveryLine()` en coach.js.

/**
 * Nombre corto en castellano de las anclas. `getExerciseName()` devuelve el nombre completo en
 * inglés del plan ("Barbell Back Squat"), que en una línea con tres ejercicios y una carrera no
 * cabe. Sólo las anclas y sus variantes: para todo lo demás vale el nombre que trae la lectura.
 */
const COACH_LIFT_ES = {
  'back-squat': 'sentadilla', 'front-squat': 'sentadilla frontal', 'hack-squat': 'hack',
  'bench-press': 'banca', 'db-bench': 'banca mancuernas', 'incline-db-press': 'inclinado',
  'sumo-dl': 'peso muerto', 'conv-dl': 'peso muerto', 'trap-bar-dl': 'peso muerto hex',
  'rdl': 'peso muerto rumano',
  'ohp': 'press militar', 'barbell-row': 'remo', 'chinups': 'dominadas', 'pullups': 'dominadas',
};

/** Cuántas anclas caben en la línea antes de que deje de leerse de un vistazo. */
const PERF_MAX_LIFTS = 3;
/**
 * La flecha sale del `outcome` que ya calculó `sessionReadout` — no se recalcula aquí. Un
 * segundo criterio de "ha subido" se desincronizaría del de la tarjeta post-sesión, y entonces
 * Home y la lectura dirían cosas distintas de la misma serie.
 */
const PERF_OUTCOME_ARROW = {
  progressed: '↑', held: '→', regressed: '↓', skipped: '○', 'no-target': '○',
};

/** Los registros anteriores a la mudanza están en libras; el registro lleva su unidad. */
function _perfToKg(v, unit) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return String(unit || 'kg').toLowerCase() === 'lb' ? n * LB_TO_KG : n;
}

/**
 * Los items de lectura de una sesión. Si el registro trae `readout` (v11.57 en adelante) se usa
 * tal cual; si no —los registros viejos— se reconstruye lo mínimo desde las series hechas y el
 * objetivo sellado en el ejercicio. El criterio de outcome es el MISMO de `sessionReadout`,
 * simplificado a lo que se puede saber sin las definiciones del plan.
 */
function _perfItems(w) {
  if (w && w.readout && Array.isArray(w.readout.items)) return w.readout.items;
  const out = [];
  for (const ex of ((w && w.exercises) || [])) {
    if (!ex || !ex.exerciseId) continue;
    const done = ((ex.sets) || []).filter(s => s && s.done);
    const reps = done.map(s => Number(s.reps) || 0);
    const topKg = done.length ? Math.max(...done.map(s => Number(s.weight) || 0)) : null;
    const target = (ex.target && ex.target.kg != null) ? ex.target : null;
    let outcome;
    if (!done.length) outcome = 'skipped';
    else if (!target) outcome = 'no-target';
    else if (topKg >= target.kg - 0.01) outcome = 'progressed';
    else if (topKg < target.kg - COACH_STEP_KG) outcome = 'regressed';
    else outcome = 'held';
    out.push({
      exerciseId: ex.exerciseId, name: ex.exerciseId, target,
      done: { topKg, reps, avgRpe: null }, outcome, measureUnit: null, next: null,
    });
  }
  return out;
}

/**
 * "Rendimiento: banca 95×8 ↑ · sentadilla 105×8 → · Z2 5,1 km @141".
 *
 * La última lectura de cada ancla (máximo 3, la más reciente primero) más la última carrera.
 * La carrera se llama "Z2" SÓLO si su pulso medio está en el techo de Z2 (más la tolerancia de
 * la correa) o por debajo: las cuatro carreras de agosto iban a 147-155 sobre un techo de 143,
 * y llamarlas Z2 sería la falsa precisión que este sistema tiene prohibida.
 *
 * @param {Array}  workouts        Registros de fuerza (cualquier orden), con `readout` o sin él.
 * @param {Array}  runs            Carreras `{date, distance, avgHR}` (o `{km}`).
 * @param {object} [opts]
 * @param {string[]} [opts.anchorIds]  Por defecto `COACH_GOALS_DEFAULT.preserve.anchorLifts`.
 * @param {number} [opts.z2Ceiling]    Techo de Z2 en bpm. Por defecto `RW_Z2_DEFAULT[1]`. Se le
 *                                 suma `RW_Z2_TOLERANCE_BPM` (E-9), la misma tolerancia que usan
 *                                 `_rwInZ2` y el facts pack: sin ella, la Home y el pack daban
 *                                 dos veredictos distintos de la misma carrera.
 * @param {number} [opts.maxLifts]     Por defecto 3.
 * @returns {string} '' si no hay ni lecturas ni carreras (Home no pinta un contenedor vacío).
 */
function performanceLine(workouts, runs, opts = {}) {
  const o = opts || {};
  const anchorIds = (Array.isArray(o.anchorIds) && o.anchorIds.length)
    ? o.anchorIds.slice()
    : ((((COACH_GOALS_DEFAULT || {}).preserve || {}).anchorLifts) || []).slice();
  const anchors = new Set(anchorIds);
  const maxLifts = Number(o.maxLifts) > 0 ? Number(o.maxLifts) : PERF_MAX_LIFTS;
  // MISMA TOLERANCIA QUE EL MOTOR Y QUE EL PACK (E-9). Sin ella, una carrera a 144 bpm sobre
  // un techo de 143 se llamaba "carrera" en Home y "Z2 cumplida" en el pack del coach: el mismo
  // dato con dos veredictos, y el que lee la Home concluye que no cumplió cuando sí lo hizo.
  const z2Ceiling = (Number(o.z2Ceiling) > 0 ? Number(o.z2Ceiling) : RW_Z2_DEFAULT[1])
    + RW_Z2_TOLERANCE_BPM;

  const partes = [];
  const vistos = new Set();
  const wks = (Array.isArray(workouts) ? workouts : [])
    .filter(w => w && w.date)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const w of wks) {
    if (vistos.size >= maxLifts) break;
    for (const it of _perfItems(w)) {
      if (vistos.size >= maxLifts) break;
      const id = it && it.exerciseId;
      if (!id || !anchors.has(id) || vistos.has(id)) continue;
      vistos.add(id);
      const nombre = COACH_LIFT_ES[id] || it.name || id;
      const flecha = PERF_OUTCOME_ARROW[it.outcome] || '○';
      const done = it.done || {};
      const kg = _perfToKg(done.topKg, w.unit);
      const reps = Array.isArray(done.reps) ? done.reps : [];
      // `measureUnit` presente = el número son centímetros (box jump), no kilos. Va con su
      // unidad o no va: un "60×5" sin unidad al lado de un 95 kg se lee como carga.
      const u = it.measureUnit ? ' ' + it.measureUnit : '';
      const cuerpo = (kg != null && kg > 0 && reps.length)
        ? _coachFmtKg(Math.round(kg * 10) / 10) + u + '×' + reps[0]
        : 'saltado';
      partes.push(nombre + ' ' + cuerpo + ' ' + flecha);
    }
  }

  const rs = (Array.isArray(runs) ? runs : [])
    .filter(r => r && r.date)
    .slice()
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const last = rs[0] || null;
  if (last) {
    const km = Number(last.distance != null ? last.distance : last.km);
    const hrRaw = Number(last.avgHR);
    const hr = (last.avgHR != null && isFinite(hrRaw) && hrRaw > 0) ? Math.round(hrRaw) : null;
    const etiqueta = (hr != null && hr <= z2Ceiling) ? 'Z2' : 'carrera';
    if (isFinite(km) && km > 0) {
      partes.push(etiqueta + ' ' + _coachFmtKg(Math.round(km * 10) / 10) + ' km' + (hr != null ? ' @' + hr : ''));
    } else if (hr != null) {
      partes.push(etiqueta + ' @' + hr);
    }
  }

  if (!partes.length) return '';
  return 'Rendimiento: ' + partes.join(' · ');
}

// ==================== CARRERA HACIA EL 10K ====================
//
// EL PROBLEMA QUE RESUELVE (plan §B.4, §C.1). `IDEAL_BLOCK_V1` prescribe "Cardio Z2 40'" el
// miércoles y "Cardio calidad Z2 50'" el sábado, y eso es todo lo que el sistema sabía de
// correr. No había fases, no había kilómetros, no había un camino desde donde está esta
// persona hasta un 10 km cómodo. Y el dato real de partida importa: las cuatro últimas
// carreras (1,9 / 3,2 / 5,0 / 4,1 km) van a 152, 149, 155 y 147 bpm de media sobre una Z2
// que acaba en 143. CERO carreras en Z2. El problema no es el volumen: es la intensidad.
//
// POR QUÉ TIEMPO ANTES QUE KILÓMETROS. Prescribir "5,5 km" a alguien que corre a 152 bpm es
// prescribir más de lo mismo. La salida es trote/caminata por FC (END-006, `moderate`): el
// bloque de caminar existe para que la FC media baje, no para acortar la sesión. Cuando dos
// de las tres últimas cumplen Z2 y hay ≥8 km/semana, el volumen pasa a medirse en km.
//
// LO QUE ESTE MOTOR NO HACE, A PROPÓSITO:
//   · **No genera sesiones duras. Nunca.** END-004 permite una a la semana, pero sólo con
//     base construida; y quién y cuándo la mete es decisión del coach, que la propone y
//     Julian la aprueba. Aquí se abre la puerta (`gates.qualityUnlocked`) y se deja abierta.
//   · **No progresa en descarga.** La semana de deload recorta series al 50 %; subir km ahí
//     es lo peor de los dos mundos (LOAD-004).
//   · **No dosifica por recuperación.** Hasta v11.66, `readiness.deloadHint` congelaba la
//     rampa de km y cerraba la puerta de la calidad: una dosis derivada de WHOOP y del RPE,
//     aplicada sin que nadie la aprobara, justo lo que Julian retiró (E-7 de la auditoría
//     2026-09-08). **La recuperación informa; la decisión semanal es del coach y del usuario**
//     (2026-09-07). `deloadHint` sigue viajando en el facts pack y puede aparecer en una NOTA;
//     ningún número del motor sale de él.
//   · **No cuenta bici, remo ni ski como kilómetros de carrera.** Son minutos aeróbicos
//     reales y cuentan en el presupuesto de la semana, pero no construyen tolerancia al
//     impacto. Si sumaran km, el motor creería que hay una base de carrera que no hay.
//   · **No inventa el decoupling.** "10k cómodo" exige deriva <5 % (END-005, `expert` y
//     encima dato que hoy casi nunca llega desde intervals.icu). Sin el dato,
//     `decouplingOk: null` y NO se declara listo. Null no es false: es "no se sabe".
//
// EL ~10 %/SEMANA ES HEURÍSTICA PRUDENTE, NO UN HALLAZGO (END-003, `moderate`/confianza
// media). Buist 2008 (n=532) comparó rampas de 10,5 % y 23,7 % y no encontró diferencia en
// lesiones; Nielsen 2012 quedó inconcluso. El 10 % está aquí porque el techo real de esta
// persona no se conoce y una rampa lenta cuesta poco, no porque el 20 % lesione.

/** Zona 2 por defecto de este atleta (`settings.icuZones.z.zone2`), en bpm. */
const RW_Z2_DEFAULT = [131, 143];
/**
 * Margen de ruido de la correa. Una media de 144 bpm sobre un techo de 143 no es un fallo de
 * ejecución: es la precisión del sensor. Sin este margen, el motor devolvería a run/walk a
 * alguien que corrió bien, y eso es peor que dejarle progresar de más una semana.
 */
const RW_Z2_TOLERANCE_BPM = 2;
/** Alias histórico. Se conserva porque el nombre viejo aparece en comentarios y notas. */
const RW_STRAP_NOISE_BPM = RW_Z2_TOLERANCE_BPM;
/** Modalidades que construyen tolerancia al impacto. El resto no suma km de carrera. */
const RW_RUN_MODALITIES = ['run_outdoor', 'treadmill', 'run', 'trail_run', 'virtualrun'];
const RW_Z2_WINDOW = 3;          // el cumplimiento de Z2 se mide sobre las 3 últimas
const RW_MIN_RUNS = 2;           // n=1 no es una base
const RW_MIN_WEEK_KM = 8;        // por debajo, el volumen se mide en minutos
const RW_PAUSE_DAYS = 14;        // sin correr más de esto → se vuelve por tiempo
const RW_BASE_WEEK_KM = 15;      // qué cuenta como "semana de base" (§B.4)
const RW_BASE_WEEKS_FOR_QUALITY = 3;
const RW_READY_LONG_KM = 8;      // largo mínimo en Z2 antes de hablar de 10 km
const RW_READY_WEEK_KM = 18;
const RW_DECOUPLING_MAX = 5;     // % (END-005)
const RW_DRIFT_MAX_BPM = 5;      // proxy por mitades cuando no hay decoupling
const RW_RAMP = 1.10;            // END-003, tope blando
const RW_RAMP_HARD = 1.20;       // tope duro
const RW_RAMP_MIN_KM = 1;        // con volúmenes bajos, +10 % es +0,8 km: no se nota
const RW_DELOAD_FACTOR = 0.7;
/**
 * Techos de la fase run/walk, en minutos, para los slots de carrera ordenados de menor a
 * mayor base. Arrancan POR DEBAJO de la base del slot (40'/50' en el ideal) porque en
 * trote/caminata la mitad del tiempo se camina: 40' de slot son 40' de estímulo, 40' de
 * run/walk son ~24' de trote. Se toma el mínimo entre la base del slot y este techo, así que
 * la variante de viaje (un slot de 30') no ve su dosis SUBIR por entrar en esta fase.
 */
const RW_WALK_CAPS = [30, 40];
const RW_WALK_OPT_CAP = 20;
const RW_PATTERNS = {
  early: { run: 3, walk: 2, label: '3′ trote / 2′ caminar' },
  later: { run: 5, walk: 1, label: '5′ trote / 1′ caminar' },
};
/** Km mínimos de la carrera suave opcional: por debajo de 2 km no es una sesión. */
const RW_EASY_MIN_KM = 2;

/**
 * Las cuatro fases en castellano. Vive AQUÍ y no en app.js porque los ids de fase los define
 * este módulo y los consumen dos ficheros (`runningPhaseLabel` en app.js y `renderGoalsCard`
 * en coach.js): la etiqueta tiene que estar cargada antes que los dos.
 */
const RW_PHASE_ES = {
  run_walk: 'trote/caminata',
  base: 'base',
  build: 'construcción',
  ready10k: 'listo para 10 km',
};

/** Redondeo del OBJETIVO: hacia arriba, para no quedarse por debajo de la rampa prescrita. */
function _rwCeilHalf(x) { return Math.ceil(Number(x) / 0.5 - 1e-9) * 0.5; }
/** Redondeo del TECHO y del reparto: hacia abajo, para no pasarse del cap. */
function _rwFloorHalf(x) { return Math.floor(Number(x) / 0.5 + 1e-9) * 0.5; }

/**
 * Número para pantalla, en castellano: coma decimal y sin ceros de relleno.
 * 6.5 → "6,5" · 13 → "13" · −0,4407 con 2 decimales → "−0,44".
 */
function _rwFmt(x, dec) {
  const n = Number(x);
  if (x == null || !isFinite(n)) return '—';
  let s = n.toFixed(dec == null ? 1 : dec);
  if (s.indexOf('.') !== -1) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s.replace('.', ',');
}

/** Fecha 'YYYY-MM-DD' desplazada N días, en UTC (misma aritmética que `mondayOf`). */
function _rwShift(dateStr, days) {
  const t = _utcMs(dateStr);
  return t == null ? null : _utcDayStr(t + days * 86400000);
}

/** Días enteros entre dos fechas 'YYYY-MM-DD' (b − a), o null si falta alguna. */
function _rwDaysBetween(a, b) {
  const ta = _utcMs(a), tb = _utcMs(b);
  if (ta == null || tb == null) return null;
  return Math.round((tb - ta) / 86400000);
}

/** Zona 2 usable: `[lo, hi]` de la entrada o el defecto de este atleta. */
function _rwZones(zones) {
  const z = zones && Array.isArray(zones.z2) ? zones.z2.map(Number) : null;
  if (z && z.length === 2 && isFinite(z[0]) && isFinite(z[1]) && z[1] > z[0]) return z;
  return RW_Z2_DEFAULT.slice();
}

/**
 * Normaliza el historial a `{date, km, min, avgHR, decoupling, halves, pctZ2}` ordenado de
 * más reciente a más antiguo, **descartando lo que no es correr**. Acepta las dos formas que
 * llegan de la app: `runs` (`{distance, duration}`) y el sobre de `sessions`
 * (`{durationMin, distance, modality}`).
 *
 * Sin `modality` se asume carrera: las filas del store `runs` no la traen y son carreras por
 * definición. Es la única suposición del módulo y va aquí, en un sitio, con su motivo.
 */
function _rwNormalizeRuns(history) {
  const out = [];
  for (const r of (history || [])) {
    if (!r || !r.date) continue;
    const mod = r.modality ? String(r.modality).toLowerCase() : null;
    if (mod && RW_RUN_MODALITIES.indexOf(mod) === -1) continue;
    const km = Number(r.km != null ? r.km : r.distance);
    const min = Number(r.min != null ? r.min : (r.durationMin != null ? r.durationMin : r.duration));
    const halves = Array.isArray(r.avgHRHalves) && r.avgHRHalves.length === 2
      ? r.avgHRHalves.map(Number).filter(v => isFinite(v)) : null;
    out.push({
      date: String(r.date).slice(0, 10),
      km: isFinite(km) && km > 0 ? km : 0,
      min: isFinite(min) && min > 0 ? min : null,
      avgHR: (r.avgHR != null && isFinite(Number(r.avgHR))) ? Number(r.avgHR) : null,
      decoupling: (r.decoupling != null && isFinite(Number(r.decoupling))) ? Number(r.decoupling) : null,
      halves: (halves && halves.length === 2) ? halves : null,
      pctZ2: (r.pctZ2 != null && isFinite(Number(r.pctZ2))) ? Number(r.pctZ2) : null,
    });
  }
  out.sort((a, b) => b.date.localeCompare(a.date));
  return out;
}

/**
 * ¿Esta carrera cumplió Z2? FC media ≤ techo + ruido de correa (§C.2, paso 5). Con `pctZ2`
 * disponible vale también ≥90 % del tiempo dentro.
 *
 * SIN DATO DE FC → NO CUMPLE, no "no se sabe". Es la decisión conservadora a propósito: una
 * carrera sin pulsómetro no puede demostrar que la intensidad esté controlada, y el coste de
 * equivocarse hacia run/walk (una semana más de trote/caminata) es mucho menor que el de
 * equivocarse hacia km (rampa sobre una base que no existe).
 */
function _rwInZ2(run, z2max) {
  if (!run) return false;
  if (run.avgHR != null) return run.avgHR <= z2max;
  if (run.pctZ2 != null) return run.pctZ2 >= 90;
  return false;
}

/**
 * Las puertas de datos, todas juntas y sin decidir nada todavía.
 * @returns {{z2Compliance, z2Sample, aboveZ2, baseWeeks, longestZ2Km, longestKm,
 *            lastWeekKm, lastWeekKey, lastWeekLongKm, lastRunDaysAgo, runCount,
 *            decouplingOk, decouplingNote}}
 */
function _rwGates(runs, opts) {
  const o = opts || {};
  const z2max = o.z2max;
  const todayStr = o.todayStr;
  const last3 = runs.slice(0, RW_Z2_WINDOW);
  const z2Compliance = last3.filter(r => _rwInZ2(r, z2max)).length;
  const aboveZ2 = last3.filter(r => r.avgHR != null && r.avgHR > z2max).length;

  // Última semana ISO COMPLETA (la anterior a la de hoy). La semana en curso está a medias:
  // leerla el lunes daría 0 km y devolvería a run/walk a alguien que va bien.
  const lastWeekMonday = _rwShift(mondayOf(todayStr), -7);
  const lastWeekKey = lastWeekMonday ? isoWeekKey(lastWeekMonday) : null;
  const inLastWeek = lastWeekKey ? runs.filter(r => isoWeekKey(r.date) === lastWeekKey) : [];
  const lastWeekKm = inLastWeek.reduce((s, r) => s + r.km, 0);
  const lastWeekLongKm = inLastWeek.reduce((m, r) => Math.max(m, r.km), 0);

  // REFERENCIA DE LA RAMPA: la MEJOR de las dos últimas semanas completas, no la última.
  //
  // El motivo es la semana de descarga. Con la última semana como referencia, el bloque se
  // autodestruye: 12 km → deload 8,5 → la semana siguiente rampa DESDE 8,5 y prescribe 9,5,
  // así que cada descarga baja el arco un escalón permanente. Y peor: los 8,5 km de la
  // descarga caen por debajo del suelo de 8 km, así que la semana de después devolvía al
  // atleta a trote/caminata — un oscilador, no una progresión. Con el máximo de dos semanas,
  // la descarga se hace y después el arco se reanuda donde estaba, que es lo que dice §C.1.
  // En una rampa normal la última semana ES la mayor, así que no cambia nada.
  const prevWeekMonday = _rwShift(lastWeekMonday, -7);
  const prevWeekKey = prevWeekMonday ? isoWeekKey(prevWeekMonday) : null;
  const prevWeekKm = prevWeekKey
    ? runs.filter(r => isoWeekKey(r.date) === prevWeekKey).reduce((s, r) => s + r.km, 0) : 0;
  const rampFromKm = Math.max(lastWeekKm, prevWeekKm);

  // Semanas ISO consecutivas hacia atrás con ≥15 km y ≥2/3 de las carreras en Z2.
  let baseWeeks = 0;
  let cursor = lastWeekMonday;
  for (let i = 0; i < 8 && cursor; i++) {
    const wk = isoWeekKey(cursor);
    const inWk = runs.filter(r => isoWeekKey(r.date) === wk);
    const km = inWk.reduce((s, r) => s + r.km, 0);
    const z2n = inWk.filter(r => _rwInZ2(r, z2max)).length;
    const okZ2 = inWk.length > 0 && (z2n / inWk.length) >= (2 / 3);
    if (km >= RW_BASE_WEEK_KM && okZ2) { baseWeeks++; cursor = _rwShift(cursor, -7); } else break;
  }

  const z2Runs = runs.filter(r => _rwInZ2(r, z2max));
  const longestZ2Km = z2Runs.reduce((m, r) => Math.max(m, r.km), 0);
  const longestKm = runs.reduce((m, r) => Math.max(m, r.km), 0);

  // Deriva: sólo se lee de un LARGO en Z2 (≥8 km). Un 5 km no dice nada sobre la deriva de
  // un 10 km, y usarlo sería exactamente el "dato de otra cosa" que END-005 avisa de no usar.
  let decouplingOk = null;
  let decouplingNote = null;
  const largos = z2Runs.filter(r => r.km >= RW_READY_LONG_KM);
  if (!largos.length) {
    decouplingNote = `sin largo de ${RW_READY_LONG_KM} km en Z2: aún no hay dónde medir la deriva`;
  } else {
    const conDato = largos.find(r => r.decoupling != null);
    const conMitades = largos.find(r => r.halves);
    if (conDato) {
      decouplingOk = conDato.decoupling < RW_DECOUPLING_MAX;
      decouplingNote = `deriva ${_rwFmt(conDato.decoupling)} % en el largo del ${conDato.date}`;
    } else if (conMitades) {
      const drift = conMitades.halves[1] - conMitades.halves[0];
      decouplingOk = drift < RW_DRIFT_MAX_BPM;
      decouplingNote = `deriva de FC por mitades ${drift >= 0 ? '+' : ''}${_rwFmt(drift, 0)} bpm (proxy declarado)`;
    } else {
      decouplingNote = 'falta la deriva de FC del largo: sin ese dato no se declara el 10k';
    }
  }

  return {
    z2Compliance, z2Sample: last3.length, aboveZ2, baseWeeks,
    longestZ2Km: Math.round(longestZ2Km * 10) / 10,
    longestKm: Math.round(longestKm * 10) / 10,
    lastWeekKm: Math.round(lastWeekKm * 10) / 10,
    lastWeekKey,
    prevWeekKm: Math.round(prevWeekKm * 10) / 10,
    rampFromKm: Math.round(rampFromKm * 10) / 10,
    lastWeekLongKm: Math.round(lastWeekLongKm * 10) / 10,
    lastRunDaysAgo: runs.length ? _rwDaysBetween(runs[0].date, todayStr) : null,
    runCount: runs.length,
    decouplingOk, decouplingNote,
  };
}

/**
 * En qué fase está la carrera. Cuatro estados y un orden estricto: primero las puertas que
 * mandan de vuelta a `run_walk` (son las que protegen), después las que ascienden.
 */
function _rwPhase(gates, opts) {
  const o = opts || {};
  const deload = !!(o.block && o.block.isDeload);
  // E-7 (auditoría 2026-09-08): `readiness.deloadHint` ya NO congela la rampa ni cierra la
  // calidad. Era una dosis derivada de WHOOP/RPE aplicada sin aprobación — exactamente lo que
  // Julian retiró el 2026-09-07. `hold` se conserva en el retorno para que el llamador pueda
  // NOMBRAR la señal en la nota; ningún número sale de él.
  const hold = !!(o.readiness && o.readiness.deloadHint);
  const needRunWalk = gates.aboveZ2 >= 2
    || gates.runCount < RW_MIN_RUNS
    || gates.lastRunDaysAgo == null
    || gates.lastRunDaysAgo > RW_PAUSE_DAYS
    || gates.rampFromKm < RW_MIN_WEEK_KM;
  let phase;
  if (needRunWalk) phase = 'run_walk';
  else if (gates.longestZ2Km >= RW_READY_LONG_KM && gates.decouplingOk === true
           && gates.rampFromKm >= RW_READY_WEEK_KM) phase = 'ready10k';
  else if (gates.baseWeeks >= RW_BASE_WEEKS_FOR_QUALITY) phase = 'build';
  else phase = 'base';
  // END-004: la sesión de calidad se DESBLOQUEA, nunca se genera. Cerrada en descarga y con
  // señal de fatiga: una dura ahí no es calidad, es la gota.
  const qualityUnlocked = !needRunWalk && !deload
    && gates.baseWeeks >= RW_BASE_WEEKS_FOR_QUALITY;
  return { phase, qualityUnlocked, deload, hold, needRunWalk };
}

/** Los slots de carrera de la semana, normalizados y ordenados: largo primero. */
function _rwSlots(slots) {
  const norm = [];
  for (const s of (slots || [])) {
    if (!s || s.dow == null) continue;
    const base = Number(s.base != null ? s.base : s.durationMin);
    norm.push({
      dow: Number(s.dow),
      base: isFinite(base) && base > 0 ? base : 30,
      subtype: s.subtype || 'zone2',
      optional: !!s.optional || s.subtype === 'recovery',
    });
  }
  const req = norm.filter(s => !s.optional).sort((a, b) => b.base - a.base);
  const opt = norm.filter(s => s.optional).sort((a, b) => b.base - a.base);
  return { all: norm, ordered: req.concat(opt), required: req, optional: opt };
}

/** Reparto del volumen semanal. Con 2 carreras el largo es la mitad; con 3, el 40 % (§B.4). */
function _rwShares(n) {
  if (n <= 1) return [1];
  if (n === 2) return [0.5, 0.5];
  if (n === 3) return [0.40, 0.35, 0.25];
  const rest = (1 - 0.40) / (n - 1);
  const out = [0.40];
  for (let i = 1; i < n; i++) out.push(rest);
  return out;
}

/**
 * Bloque de repeticiones del DSL de intervals.icu. La convención de líneas en blanco es la
 * misma que `_icuRepeat` en app.js y por el mismo motivo: "deja una línea vacía antes y
 * después de cada bloque de repetición" — sin ellas el parser se come el resto del workout
 * (fue el bug de v11.33). Se duplican tres líneas en vez de importar app.js porque este
 * módulo es puro y se prueba sin navegador.
 */
function _rwWalkDsl(reps, pat) {
  return `\n${reps}x\n- ${pat.run}m Z2 HR\n- ${pat.walk}m Z1 HR\n`;
}

/** El DSL nunca lleva bpm absolutos: intervals.icu los interpreta como % de FC máxima. */
function _rwKmDsl(km) { return `- ${Number(km)}km Z2 HR`; }
function _rwMinDsl(min) { return `- ${Math.round(Number(min))}m Z2 HR`; }

/**
 * La semana de carrera cuando el coach NO fijó `activePlan.running` (§B.4).
 *
 * @param {object} input
 * @param {Array}  input.history4w  Carreras dedupeadas de 4 semanas (`{date, km, min, avgHR,
 *                                  decoupling?, avgHRHalves?, pctZ2?, modality?}`).
 *                                  Bici/remo/ski se descartan aquí dentro, no fuera.
 * @param {object} input.block      Salida de `blockWeekFromDates`.
 * @param {object} input.readiness  `{deloadHint}` de `computeReadiness()`. **Sólo informa**:
 *                                  desde v11.67 no cambia ni un kilómetro ni abre o cierra la
 *                                  calidad (E-7). Se conserva en la firma para poder NOMBRAR
 *                                  la señal en `note`, que es lo que la recuperación puede
 *                                  hacer: contar lo que pasa, no dosificar.
 * @param {object} input.goals      `settings.goals` (usa `secondary.run10k.targetKm`).
 * @param {object} input.zones      `{z2:[lo,hi]}` de `settings.icuZones`.
 * @param {Array}  input.slots      `[{dow, base, subtype, optional?}]` del `weekTemplate`.
 * @param {string} input.todayStr   'YYYY-MM-DD'.
 * @param {number} [input.variant]  `settings.idealVariant` (0 = viaje → sin progresión).
 * @returns {{phase, weeklyKmTarget, weeklyMinTarget, sessions, gates, reason, ruleIds}}
 */
function suggestRunningWeek(input) {
  const inp = input || {};
  const zones = _rwZones(inp.zones);
  const z2max = zones[1] + RW_Z2_TOLERANCE_BPM;
  const hrCap = zones[1];
  const todayStr = String(inp.todayStr || '').slice(0, 10) || null;
  const block = inp.block || {};
  const runs = _rwNormalizeRuns(inp.history4w);
  const gates = _rwGates(runs, { z2max, todayStr });
  const ph = _rwPhase(gates, { block, readiness: inp.readiness });
  const slots = _rwSlots(inp.slots);
  const goals = inp.goals || COACH_GOALS_DEFAULT;
  const targetKm = Number(((goals.secondary || {}).run10k || {}).targetKm) || 10;

  // `progressCardioMin` es la ÚNICA fuente de minutos del sistema (coach > regla > base), y
  // aquí se reutiliza tal cual: la fase run/walk sólo cambia la BASE sobre la que progresa.
  const progOpts = { variant: inp.variant, lastCardioDaysAgo: gates.lastRunDaysAgo };
  const progMin = (base) => {
    const p = progressCardioMin(base, block, progOpts);
    return p && p.min != null ? p.min : base;
  };

  const ruleIds = ['END-001', 'END-002'];
  const sessions = [];
  let weeklyKmTarget = null;
  let reason = '';

  if (ph.phase === 'run_walk') {
    ruleIds.push('END-006');
    const pat = (block.index == null || block.index <= 2) ? RW_PATTERNS.early : RW_PATTERNS.later;
    const ciclo = pat.run + pat.walk;
    // Techos por slot, de menor a mayor base: el más corto es el de media semana.
    const asc = slots.required.slice().sort((a, b) => a.base - b.base);
    asc.forEach((slot, i) => {
      const cap = RW_WALK_CAPS[Math.min(i, RW_WALK_CAPS.length - 1)];
      const baseMin = Math.min(slot.base, cap);
      const min = progMin(baseMin);
      const reps = Math.max(1, Math.round(min / ciclo));
      sessions.push({
        dow: slot.dow, type: 'run-walk', min, baseMin, km: null, reps, pattern: pat.label, hrCap,
        dsl: _rwWalkDsl(reps, pat), source: 'rule',
        summary: `${reps} × (${pat.label}) · FC ≤${hrCap}`,
        note: `Por tiempo, no por ritmo: si la FC media pasa de ${hrCap}, alarga el tramo de caminar`,
      });
    });
    slots.optional.forEach((slot) => {
      const baseMin = Math.min(slot.base, RW_WALK_OPT_CAP);
      const min = progMin(baseMin);
      sessions.push({
        dow: slot.dow, type: 'easy-opt', min, baseMin, km: null, hrCap,
        dsl: _rwMinDsl(min), source: 'rule',
        summary: `${min}′ suave (opcional) · FC ≤${hrCap}`,
        note: 'Opcional: caminata rápida o trote muy suave; cuenta igual',
      });
    });
    if (gates.aboveZ2 >= 2) {
      reason = `${gates.aboveZ2} de las ${gates.z2Sample} últimas carreras por encima de ${z2max} bpm: seguimos en trote/caminata por tiempo`;
    } else if (gates.runCount === 0) {
      reason = 'Sin carreras registradas en 4 semanas: se arranca por tiempo con caminata intercalada';
    } else if (gates.lastRunDaysAgo == null || gates.lastRunDaysAgo > RW_PAUSE_DAYS) {
      reason = `${gates.lastRunDaysAgo} días sin correr: se vuelve por tiempo, no por kilómetros`;
    } else if (gates.runCount < RW_MIN_RUNS) {
      reason = `${gates.runCount} carrera en 4 semanas: con n=1 no hay base que rampar, seguimos por tiempo`;
    } else {
      reason = `${_rwFmt(gates.rampFromKm)} km en las dos últimas semanas (menos de ${RW_MIN_WEEK_KM}): la dosis se mide en minutos`;
    }
  } else {
    ruleIds.push('END-003');
    const last = gates.rampFromKm;
    if (ph.deload) {
      weeklyKmTarget = _rwCeilHalf(last * RW_DELOAD_FACTOR);
    } else {
      weeklyKmTarget = Math.min(
        _rwCeilHalf(Math.max(last * RW_RAMP, last + RW_RAMP_MIN_KM)),
        _rwFloorHalf(last * RW_RAMP_HARD),
      );
    }
    const shares = _rwShares(slots.ordered.length);
    let longKm = _rwFloorHalf(weeklyKmTarget * shares[0]);
    if ((ph.phase === 'build' || ph.phase === 'ready10k') && gates.lastWeekLongKm > 0
        && !ph.deload) {
      // El largo es el que manda en build: crece +10 % o +1 km, el MENOR de los dos, y el
      // reparto sigue siendo su techo (nunca más del 40-50 % de la semana).
      const grow = Math.min(gates.lastWeekLongKm * RW_RAMP, gates.lastWeekLongKm + 1);
      longKm = Math.min(_rwCeilHalf(grow), longKm);
    }
    if (ph.phase === 'ready10k') longKm = Math.min(longKm, targetKm);

    let asignado = longKm;
    const kms = [longKm];
    for (let i = 1; i < slots.ordered.length; i++) {
      let km = _rwFloorHalf(weeklyKmTarget * shares[i]);
      if (slots.ordered[i].optional) km = Math.max(km, RW_EASY_MIN_KM);
      km = Math.min(km, longKm);                                       // el largo es el largo
      km = Math.min(km, Math.max(0, _rwFloorHalf(weeklyKmTarget - asignado)));
      km = Math.max(km, 0);
      kms.push(km);
      asignado += km;
    }
    slots.ordered.forEach((slot, i) => {
      const km = kms[i];
      const esLargo = i === 0;
      const tipo = esLargo ? 'long' : (slot.optional ? 'easy-opt' : 'Z2');
      let note = esLargo
        ? 'El largo de la semana: fácil de principio a fin, sin acelerar el último kilómetro'
        : (slot.optional
          ? 'Opcional: si el sábado dejó las piernas cargadas, camina en su lugar'
          : `Fácil y conversacional; si la FC media pasa de ${hrCap}, baja el ritmo`);
      if (esLargo && gates.decouplingOk === null && gates.decouplingNote
          && gates.longestZ2Km >= RW_READY_LONG_KM) {
        note += ` · ${gates.decouplingNote}`;
      }
      sessions.push({
        dow: slot.dow, type: tipo, min: null, km, hrCap,
        dsl: _rwKmDsl(km), source: 'rule',
        summary: `${_rwFmt(km)} km Z2${esLargo ? ' · largo' : (slot.optional ? ' · opcional' : '')} · FC ≤${hrCap}`,
        note,
      });
    });

    if (ph.deload) {
      ruleIds.push('LOAD-004');
      reason = `Semana de descarga: ${_rwFmt(weeklyKmTarget)} km (−30 % sobre ${_rwFmt(last)}), el largo baja con ella`;
    } else if (ph.phase === 'ready10k') {
      reason = `Largo de ${_rwFmt(gates.longestZ2Km)} km en Z2 con deriva bajo control y ${_rwFmt(last)} km/sem: el 10 km cómodo está a tiro`;
    } else if (ph.phase === 'build') {
      reason = `${gates.baseWeeks} semanas de base cumplidas: ${_rwFmt(weeklyKmTarget)} km y largo de ${_rwFmt(longKm)} km`;
    } else {
      // "de referencia" y no "la semana pasada" cuando la referencia viene de dos semanas
      // atrás: decir "la semana pasada" sobre el número de otra semana es mentir en pequeño.
      const ref = last === gates.lastWeekKm ? 'la semana pasada' : 'de referencia';
      reason = `${_rwFmt(last)} km ${ref} con ${gates.z2Compliance} de ${gates.z2Sample} en Z2: ${_rwFmt(weeklyKmTarget)} km esta semana, largo de ${_rwFmt(longKm)} km`;
    }
  }

  // LA RECUPERACIÓN, COMO INFORMACIÓN Y EN UN SOLO SITIO. Va al final de la razón, después
  // del número, y sin cambiarlo: quien decide si esta semana se recorta es el coach con el
  // usuario delante, no una tendencia de HRV leída por el motor.
  if (ph.hold && reason) {
    reason += ' · señal de fatiga acumulada en la recuperación: dato para la revisión semanal, no un recorte automático';
  }

  if (ph.qualityUnlocked) { ruleIds.push('END-004'); ruleIds.push('INT-001'); }
  if (ph.phase === 'ready10k' || gates.longestZ2Km >= RW_READY_LONG_KM) ruleIds.push('END-005');

  // El presupuesto de MINUTOS de los slots de cardio. En fase km no es una prescripción de
  // ritmo (eso sería inventar): es el hueco de tiempo que la semana ya tenía reservado.
  const weeklyMinTarget = ph.phase === 'run_walk'
    ? sessions.reduce((s, x) => s + (x.min || 0), 0)
    : slots.all.reduce((s, x) => s + progMin(x.base), 0);

  const orden = [1, 2, 3, 4, 5, 6, 0];
  sessions.sort((a, b) => orden.indexOf(a.dow) - orden.indexOf(b.dow));

  return {
    phase: ph.phase,
    weeklyKmTarget,
    weeklyMinTarget,
    sessions,
    gates: {
      z2Compliance: gates.z2Compliance,
      z2Sample: gates.z2Sample,
      baseWeeks: gates.baseWeeks,
      qualityUnlocked: ph.qualityUnlocked,
      longestZ2Km: gates.longestZ2Km,
      longestKm: gates.longestKm,
      lastWeekKm: gates.lastWeekKm,
      rampFromKm: gates.rampFromKm,
      runCount: gates.runCount,
      decouplingOk: gates.decouplingOk,
      decouplingNote: gates.decouplingNote,
    },
    reason,
    ruleIds,
  };
}

// ==================== PROGRESO CONTRA OBJETIVOS ====================
//
// EL PROBLEMA QUE RESUELVE (plan §B.5). Los objetivos vivían repartidos entre `docs/goals.md`,
// el prompt del cron y la cabeza del usuario, y la app no sabía si iba bien: pintaba el peso
// de hoy y una tasa de 30 días en la pestaña Body, sin banda objetivo, sin hito y sin
// veredicto sobre las anclas de fuerza. `goalProgress` es el único sitio que responde "¿voy
// bien?" con números y con su tamaño de muestra al lado.
//
// TRES REGLAS DE HONESTIDAD, que son las que este módulo existe para hacer cumplir:
//   1. **La pendiente se calcula sobre la media de 7 días, nunca sobre pesadas crudas.** Una
//      cena salada mueve 1,2 kg en un día; regresar sobre eso decide el déficit por ruido.
//   2. **Sin pendiente no hay ETA.** `etaWeeks: null` es una respuesta; una fecha inventada
//      hace que se apriete el déficit por un número que no existía.
//   3. **"Mantenida" exige las dos ventanas.** Un ancla sin exposición en los últimos 14 días
//      o en los −42..−28 devuelve `maintained: null`, no `true`.
//
// EL DÉFICIT MANDA SOBRE EL 10K (decisión del usuario, §C.1). Por eso el estado del peso va
// primero y `readinessFor10k` se declara INDICADOR, no dosis: es una combinación lineal de
// tres cosas medibles, no un porcentaje de nada fisiológico.

/** Bandas de la pendiente semanal, en kg/semana (REC-002 para el extremo rápido). */
const GP_RATE_FAST = -0.75;
const GP_RATE_ON_TRACK = -0.30;
const GP_RATE_SLOW = -0.10;
const GP_MIN_WEIGHINS_14D = 7;    // por debajo, no hay tendencia que leer
const GP_STALL_MIN_DAYS = 21;
const GP_STALL_MIN_WEIGHINS = 12;
const GP_SLOPE_WINDOW_DAYS = 28;
const GP_ROLL_DAYS = 7;
const GP_STRENGTH_DROP_PCT = -5;
const GP_ANCHOR_NOW_DAYS = 14;    // mejor e1RM de los últimos 14 días
const GP_ANCHOR_THEN_FROM = 42;   // contra el mejor de la ventana −42..−28
const GP_ANCHOR_THEN_TO = 28;

const _GP_STATUS_ES = {
  'at-target': 'en la banda objetivo',
  'on-track': 'en rumbo',
  slow: 'lento',
  stalled: 'estancado',
  fast: 'demasiado rápido',
  insufficient: 'sin señal suficiente',
};

/** Una fila por día (media si hubo varias pesadas), ordenada de antigua a reciente. */
function _gpWeighins(rows, today) {
  const porDia = {};
  for (const r of (rows || [])) {
    if (!r || !r.date) continue;
    const kg = Number(r.kg != null ? r.kg : (r.weight != null ? r.weight : r.weightMeasured));
    if (!isFinite(kg) || kg <= 0) continue;
    const d = String(r.date).slice(0, 10);
    if (today && d > today) continue;
    if (!porDia[d]) porDia[d] = [];
    porDia[d].push(kg);
  }
  return Object.keys(porDia).sort().map(d => ({
    date: d, kg: porDia[d].reduce((a, b) => a + b, 0) / porDia[d].length,
  }));
}

/** Media móvil de `win` días acabando en `dateStr` (misma definición que `nutRollingWeight`). */
function _gpRolling(rows, dateStr, win) {
  const from = _rwShift(dateStr, -(win - 1));
  const vals = rows.filter(r => r.date >= from && r.date <= dateStr).map(r => r.kg);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Pendiente en kg/SEMANA por mínimos cuadrados sobre la MEDIA DE 7 DÍAS de los últimos 28.
 * Devuelve null si no hay al menos 10 días con media y 14 días de recorrido: una recta sobre
 * cuatro puntos no es una tendencia, es un dibujo.
 */
function _gpSlopeKgPerWeek(rows, today) {
  if (!rows.length || !today) return null;
  const xs = [], ys = [];
  for (let i = GP_SLOPE_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = _rwShift(today, -i);
    const m = _gpRolling(rows, d, GP_ROLL_DAYS);
    if (m == null) continue;
    xs.push(GP_SLOPE_WINDOW_DAYS - 1 - i);
    ys.push(m);
  }
  if (xs.length < 10 || (xs[xs.length - 1] - xs[0]) < 14) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  if (den === 0) return null;
  return Math.round((num / den) * 7 * 1000) / 1000;
}

/** Mejor e1RM de un ejercicio dentro de una ventana de fechas, o null si no hubo exposición. */
function _gpBestE1rm(workouts, exId, from, to, e1rm, toKg) {
  let best = null;
  for (const w of (workouts || [])) {
    if (!w || !w.date) continue;
    const d = String(w.date).slice(0, 10);
    if (d < from || d > to) continue;
    for (const ex of (w.exercises || [])) {
      const id = ex && (ex.exerciseId || ex.id);
      if (id !== exId) continue;
      for (const s of (ex.sets || [])) {
        if (!s || s.done === false) continue;
        const kg = toKg(Number(s.weight), w.unit);
        const reps = Number(s.reps);
        if (!isFinite(kg) || kg <= 0 || !isFinite(reps) || reps <= 0) continue;
        const v = Number(e1rm(kg, reps));
        if (isFinite(v) && v > 0 && (best == null || v > best)) best = v;
      }
    }
  }
  return best;
}

/**
 * ¿Voy bien? Peso, carrera y fuerza, cada uno con su tamaño de muestra (§B.5).
 *
 * @param {object} goals `settings.goals` (`COACH_GOALS_DEFAULT` si falta).
 * @param {object} facts `{today, bodyweight:[{date,kg}] (sólo pesadas MEDIDAS, 90 d), runs4w,
 *                        zones, workouts8w, e1rm(kg,reps), exName?(id), toKg?(v,unit),
 *                        block?, readiness?}`
 * @returns {{weight, running, strength, signals}}
 */
function goalProgress(goals, facts) {
  const g = goals || COACH_GOALS_DEFAULT;
  const f = facts || {};
  const today = String(f.today || '').slice(0, 10) || null;
  const e1rm = typeof f.e1rm === 'function' ? f.e1rm : ((kg, reps) => kg * (1 + reps / 30));
  const exName = typeof f.exName === 'function' ? f.exName : ((id) => id);
  const toKg = typeof f.toKg === 'function'
    ? f.toKg
    : ((v, unit) => (String(unit).toLowerCase() === 'lb' ? Number(v) * LB_TO_KG : Number(v)));
  const banda = ((g.primary || {}).targetWeightKg) || [];
  const targetHi = banda.length === 2 ? Number(banda[1]) : null;
  const milestone = Number((g.primary || {}).milestoneKg);
  const signals = [];

  // ---- Peso ----
  const rows = _gpWeighins(f.bodyweight, today);
  const desde14 = _rwShift(today, -(GP_MIN_WEIGHINS_14D * 2 - 1));
  const n14 = rows.filter(r => r.date >= desde14).length;
  const desde28 = _rwShift(today, -(GP_SLOPE_WINDOW_DAYS - 1));
  const en28 = rows.filter(r => r.date >= desde28);
  const spanDays = en28.length >= 2 ? _rwDaysBetween(en28[0].date, en28[en28.length - 1].date) : 0;
  const trend7d = rows.length ? _gpRolling(rows, today, GP_ROLL_DAYS) : null;
  const slope = _gpSlopeKgPerWeek(rows, today);

  let status;
  if (n14 < GP_MIN_WEIGHINS_14D || slope == null || trend7d == null) status = 'insufficient';
  else if (targetHi != null && trend7d <= targetHi) status = 'at-target';
  else if (slope < GP_RATE_FAST) status = 'fast';
  else if (slope < GP_RATE_ON_TRACK) status = 'on-track';
  else if (slope < GP_RATE_SLOW) status = 'slow';
  else if (spanDays >= GP_STALL_MIN_DAYS && en28.length >= GP_STALL_MIN_WEIGHINS) status = 'stalled';
  else status = 'insufficient';

  const bajando = slope != null && slope < GP_RATE_SLOW && status !== 'insufficient';
  const eta = (objetivo) => {
    if (!bajando || trend7d == null || objetivo == null || !isFinite(objetivo)) return null;
    if (trend7d <= objetivo) return 0;
    return Math.round(((trend7d - objetivo) / -slope) * 10) / 10;
  };
  const etaWeeks = eta(targetHi);
  const etaMilestoneWeeks = eta(isFinite(milestone) ? milestone : null);

  let wText;
  if (status === 'insufficient') {
    wText = rows.length
      ? `Peso: ${n14} pesadas en 14 días — hacen falta ${GP_MIN_WEIGHINS_14D} y ${GP_SLOPE_WINDOW_DAYS} días para leer una pendiente`
      : 'Peso: sin pesadas medidas — la báscula diaria es lo que hace legible el resto';
  } else {
    wText = `Peso: ${n14} pesadas en 14 días, media 7d ${_rwFmt(trend7d)} → ${_rwFmt(slope, 2)} kg/sem, ${_GP_STATUS_ES[status]}`;
    if (etaMilestoneWeeks != null && etaMilestoneWeeks > 0) {
      wText += `; hito ${_rwFmt(milestone, 0)} kg en ~${_rwFmt(etaMilestoneWeeks, 0)} sem`;
    } else if (etaWeeks != null && etaWeeks > 0) {
      wText += `; ${_rwFmt(targetHi, 0)} kg en ~${_rwFmt(etaWeeks, 0)} sem`;
    }
  }
  if (status === 'at-target') {
    signals.push({
      id: 'weight-at-target', severity: 'info',
      text: `Media 7d ${_rwFmt(trend7d)} kg: dentro de la banda objetivo — toca decidir si se cierra el déficit`,
    });
  }
  if (trend7d != null && isFinite(milestone) && trend7d <= milestone) {
    signals.push({
      id: 'milestone-reached', severity: 'info',
      text: `Hito de ${_rwFmt(milestone, 0)} kg alcanzado (media 7d ${_rwFmt(trend7d)} kg)`,
    });
  }
  if (slope != null && slope < GP_RATE_FAST && status !== 'insufficient') {
    signals.push({
      id: 'rate-too-fast', severity: 'flag',
      text: `Bajando ${_rwFmt(-slope, 2)} kg/sem, por encima de ${_rwFmt(-GP_RATE_FAST, 2)}: aflojar el déficit antes de perder magra`,
    });
  }
  if (status === 'stalled') {
    signals.push({
      id: 'stalled-3w', severity: 'flag',
      text: `${en28.length} pesadas y la media 7d plana (${_rwFmt(slope, 2)} kg/sem): primero pasos, después kcal`,
    });
  }

  // ---- Carrera ----
  const zones = _rwZones(f.zones);
  const z2max = zones[1] + RW_Z2_TOLERANCE_BPM;
  const runs = _rwNormalizeRuns(f.runs4w);
  const rGates = _rwGates(runs, { z2max, todayStr: today });
  const rPh = _rwPhase(rGates, { block: f.block, readiness: f.readiness });
  const z2Ratio = rGates.z2Sample > 0 ? (rGates.z2Compliance / rGates.z2Sample) : 0;
  const readinessFor10k = Math.round((
    0.5 * Math.min(rGates.longestZ2Km / RW_READY_LONG_KM, 1)
    + 0.3 * Math.min(rGates.lastWeekKm / RW_READY_WEEK_KM, 1)
    + 0.2 * z2Ratio
  ) * 100) / 100;
  const rText = rGates.runCount === 0
    ? 'Correr: sin carreras en 4 semanas; el indicador hacia el 10k parte de cero'
    : `Correr: largo Z2 ${_rwFmt(rGates.longestZ2Km)} km, ${_rwFmt(rGates.lastWeekKm)} km la última semana completa, ${rGates.z2Compliance} de ${rGates.z2Sample} en Z2 → indicador ${_rwFmt(readinessFor10k * 100, 0)} % (indicador, no dosis)`;
  if (rGates.longestZ2Km >= RW_READY_LONG_KM) {
    signals.push({
      id: 'long-run-8k', severity: 'info',
      text: `Largo de ${_rwFmt(rGates.longestZ2Km)} km en Z2: el 10 km deja de ser teórico`,
    });
  }
  if (rPh.qualityUnlocked) {
    signals.push({
      id: 'quality-unlocked', severity: 'info',
      text: `${rGates.baseWeeks} semanas de base: cabe una sesión de calidad a la semana (la propone el coach, no la regla)`,
    });
  }

  // ---- Fuerza ----
  const anchorIds = ((g.preserve || {}).anchorLifts) || [];
  const nowFrom = _rwShift(today, -(GP_ANCHOR_NOW_DAYS - 1));
  const thenFrom = _rwShift(today, -GP_ANCHOR_THEN_FROM);
  const thenTo = _rwShift(today, -GP_ANCHOR_THEN_TO);
  const anchors = anchorIds.map((id) => {
    const now = today ? _gpBestE1rm(f.workouts8w, id, nowFrom, today, e1rm, toKg) : null;
    const then = today ? _gpBestE1rm(f.workouts8w, id, thenFrom, thenTo, e1rm, toKg) : null;
    const pct = (now != null && then != null && then > 0)
      ? Math.round(((now - then) / then) * 1000) / 10 : null;
    return {
      id,
      e1rmNow: now != null ? Math.round(now * 10) / 10 : null,
      e1rm4wAgo: then != null ? Math.round(then * 10) / 10 : null,
      pct,
      maintained: pct == null ? null : pct >= GP_STRENGTH_DROP_PCT,
    };
  });
  const conDato = anchors.filter(a => a.maintained !== null);
  const mantenidas = conDato.filter(a => a.maintained).length;
  const caidas = anchors.filter(a => a.pct != null && a.pct <= GP_STRENGTH_DROP_PCT);
  const allMaintained = conDato.length ? caidas.length === 0 : null;
  const sText = conDato.length
    ? `Fuerza: ${mantenidas}/${anchorIds.length} anclas mantenidas` +
      (anchors.length - conDato.length
        ? ` · ${anchors.length - conDato.length} sin exposición en las dos ventanas`
        : '')
    : `Fuerza: 0/${anchorIds.length} anclas con dato en las dos ventanas — sin veredicto`;
  if (caidas.length) {
    signals.push({
      id: 'strength-drop', severity: 'flag',
      text: `${caidas.length} ancla${caidas.length > 1 ? 's' : ''} por debajo de ${_rwFmt(GP_STRENGTH_DROP_PCT, 0)} %: ` +
        caidas.map(a => `${exName(a.id)} (${_rwFmt(a.pct)} %)`).join(', '),
    });
  }

  return {
    weight: { trend7d: trend7d == null ? null : Math.round(trend7d * 10) / 10, slope, etaWeeks, etaMilestoneWeeks, status, text: wText },
    running: {
      longestZ2Km: rGates.longestZ2Km,
      longestKm: rGates.longestKm,
      weeklyKm: rGates.lastWeekKm,
      runCount: rGates.runCount,
      z2Compliance: rGates.z2Compliance,
      z2Sample: rGates.z2Sample,
      readinessFor10k,
      decouplingOk: rGates.decouplingOk,
      phase: rPh.phase,
      text: rText,
    },
    strength: { anchors, allMaintained, text: sText },
    signals,
  };
}

// ==================== EXPORTS PARA LOS TESTS ====================
// tests/verify-coach-wiring.mjs, verify-block-week.mjs y verify-set-target.mjs cargan este
// fichero con `vm` y leen este bloque. En el navegador no estorba (no hay `module`).
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COACH_GOALS_DEFAULT,
    // Una fuente por concepto (E-9, v11.67)
    LB_TO_KG,
    LOAD_JUMP_MAX_PCT,
    FFM_FRESH_DAYS,
    ffmKg,
    isoWeekKey,
    coachTargetWeekKey,
    PHASE_ES,
    mondayOf,
    blockWeekFromDates,
    blockLabel,
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
    _coachDedupeHistory,
    _cardioRefMin,
    coachTargetIsCurrent,
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
    computeReadinessFrom,
    // Línea de rendimiento (v11.62). Sustituye al motor de ajuste de la sesión: la
    // recuperación informa, no ajusta (decisión del usuario, 2026-09-07).
    COACH_LIFT_ES,
    PERF_MAX_LIFTS,
    PERF_OUTCOME_ARROW,
    _perfItems,
    performanceLine,
    // Carrera hacia el 10k y objetivos (incremento 6, v11.60)
    RW_Z2_DEFAULT,
    RW_Z2_TOLERANCE_BPM,
    RW_STRAP_NOISE_BPM,
    RW_RUN_MODALITIES,
    RW_BASE_WEEK_KM,
    RW_BASE_WEEKS_FOR_QUALITY,
    RW_READY_LONG_KM,
    RW_READY_WEEK_KM,
    RW_DECOUPLING_MAX,
    RW_PATTERNS,
    RW_PHASE_ES,
    _rwCeilHalf,
    _rwFloorHalf,
    _rwFmt,
    _rwNormalizeRuns,
    _rwInZ2,
    _rwGates,
    _rwPhase,
    _rwSlots,
    _rwShares,
    suggestRunningWeek,
    GP_RATE_FAST,
    GP_MIN_WEIGHINS_14D,
    GP_STRENGTH_DROP_PCT,
    _gpWeighins,
    _gpRolling,
    _gpSlopeKgPerWeek,
    _gpBestE1rm,
    goalProgress,
  };
}
