// ============================================================
// Coach v2 — orquestación y renderers nuevos (app/coach.js)
// ============================================================
//
// QUÉ ES. La capa que junta los motores puros de `coach-engine.js` con la pantalla: lee IDB,
// pinta y guarda lo que el usuario decide. Los renderers que MODIFICAN pantallas existentes
// (`buildExerciseCard`, `renderTodaysPlan`, `renderHomeView`) siguen en app.js, junto a lo que
// sustituyen; aquí viven sólo los NUEVOS, para no engordar más un fichero de 12.000 líneas.
//
// SE CARGA DESPUÉS de coach-engine.js y ANTES de app.js (index.html), y entra en el APP_SHELL
// del service worker. Sin bundler, esas dos cosas son el contrato de carga y
// `verify-coach-wiring.mjs` las vigila: un módulo fuera del APP_SHELL funciona en el navegador
// y falla sin conexión, que es justo donde se entrena (ya pasó con nutrition.js).
//
// v11.60 (incremento 6) trae `renderGoalsCard`, la tarjeta "Objetivos". v11.62 trae
// `renderRecoveryLine`, la línea informativa que sustituye al consejo diario (en Stats › Today
// desde v11.65; el WHOOP de hoy vive en el tile Readiness de Home).
// v11.57 (incremento 3) trae `renderCoachReadout`. v11.59 (incremento 5) trae
// `renderReadinessSignals`, que sustituye al score 0-100 de la fatigue card. Los incrementos
// siguientes añaden aquí `maybeRunWeeklyCoach`, `applyCoachProposal`, `rollbackPlanVersion`,
// `renderCoachWeekCard` y la vista `view-coach` (incremento 9).

// ==================== LECTURA DEL COACH (post-sesión) ====================
//
// EL PROBLEMA QUE RESUELVE. Hasta v11.56 el lazo se quedaba abierto: la app prescribía (bueno,
// insinuaba) y nadie contrastaba nunca lo prescrito con lo hecho. Los toasts de progresión se
// quitaron en v10.14 porque desaparecían antes de poder leerlos, y la revisión semanal del cron
// llegaba el domingo, cinco días después de la sesión.
//
// Esta tarjeta cierra el lazo donde toca: en Home, justo después de terminar, con el detalle por
// ejercicio y el kg de la próxima vez. Se descarta con la ✕ y no vuelve (`coachReadoutSeen`),
// porque una tarjeta que reaparece se convierte en ruido y se aprende a ignorar.
//
// `dbPut` y NO `smartPut` a propósito: "esta tarjeta ya la vi" es estado de interfaz de ESTE
// dispositivo, no un dato del usuario. Sincronizarlo haría que descartarla en el móvil la
// borrase en la web antes de haberla leído — y encolaría una escritura por cada sesión.
async function renderCoachReadout() {
  const el = document.getElementById('coach-readout');
  if (!el) return;
  el.classList.add('hidden');
  el.innerHTML = '';
  try {
    const ds = today();
    const all = await dbGetAll('workouts');
    // La última sesión de HOY que tenga lectura. Sólo hoy: una lectura de anteayer ya no es
    // información, es un recordatorio de algo que no vas a cambiar.
    const mine = (all || [])
      .filter(w => w && w.date === ds && w.readout && Array.isArray(w.readout.items))
      .sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')));
    const w = mine[0];
    if (!w) return;
    const seen = await dbGet('settings', 'coachReadoutSeen');
    if (seen && seen.data === w.id) return;

    const R = w.readout;
    const glyph = { progressed: '●', held: '●', regressed: '●', skipped: '○', 'no-target': '○' };
    const cls = {
      progressed: 'coach-outcome-up', held: 'coach-outcome-hold',
      regressed: 'coach-outcome-down', skipped: 'coach-outcome-skip',
      'no-target': 'coach-outcome-skip',
    };
    const fmt = (kg) => (typeof _coachFmtKg === 'function' ? _coachFmtKg(kg) : String(kg));
    const rows = R.items.map(it => {
      const objetivo = it.target && it.target.kg != null ? `${fmt(it.target.kg)}` : '—';
      // `measureUnit` presente = el número no son kilos (altura del cajón en cm).
      const u = it.measureUnit ? ` ${it.measureUnit}` : '';
      const hecho = it.outcome === 'skipped'
        ? 'no sets'
        : `${it.done.topKg != null ? fmt(it.done.topKg) + u : '—'}×${(it.done.reps || []).join('/')}` +
          (it.done.avgRpe ? ` @${fmt(it.done.avgRpe)}` : '');
      const next = it.next && it.next.kg != null
        ? `<span class="coach-readout-next" title="${escapeHtml(it.next.reason || '')}">→ ${fmt(it.next.kg)}</span>`
        : (it.outcome === 'skipped' ? '<span class="coach-readout-next">skipped</span>' : '');
      return `
        <div class="coach-readout-row">
          <span class="coach-outcome ${cls[it.outcome] || ''}">${glyph[it.outcome] || '○'}</span>
          <span class="coach-readout-name">${escapeHtml(it.name || it.exerciseId)}</span>
          <span class="coach-readout-done"><b>${escapeHtml(objetivo)}</b> → ${escapeHtml(hecho)}</span>
          ${next}
        </div>`;
    }).join('');

    const nombre = w.sessionName || (activePlan.sessions[w.session] && activePlan.sessions[w.session].name) || w.session;
    const mins = w.duration ? `${Math.round(durationToMinutes(w.duration))} min` : '';
    el.innerHTML = `
      <div class="card coach-readout">
        <div class="coach-readout-head">
          <span class="coach-readout-title">Coach readout · ${escapeHtml(nombre)}${mins ? ' · ' + mins : ''}</span>
          <button class="coach-readout-close" id="coach-readout-close" aria-label="Close">✕</button>
        </div>
        <div class="coach-readout-summary">${escapeHtml(R.line || '')}</div>
        ${rows}
        <div class="coach-readout-foot">Next time is already applied on the card.</div>
      </div>`;
    el.classList.remove('hidden');
    const close = document.getElementById('coach-readout-close');
    if (close) {
      close.addEventListener('click', async () => {
        el.classList.add('hidden');
        el.innerHTML = '';
        try { await dbPut('settings', { key: 'coachReadoutSeen', data: w.id }); } catch (e) {}
      });
    }
  } catch (e) {
    // Cada sección de Home tiene su propio try/catch (patrón de `renderHomeView`): un resumen
    // no puede tumbar la pantalla principal.
    console.warn('[Coach] renderCoachReadout:', e);
    el.classList.add('hidden');
  }
}

// ==================== SEÑALES DE RECUPERACIÓN (Stats › Today, v11.59) ====================
//
// LO QUE SUSTITUYE. `renderFatigueScore` pintaba un "Readiness Score" 0-100 con una barra y una
// frase de consejo ("Recovery looks good. Push hard today."). El número salía de sumar
// frecuencia de entrenos, calidad media, energía de nutrición, DÍAS BAJO PROTEÍNA ×3 y RPE
// medio, y de mezclarlo con el % de WHOOP: `fatigue*0.55 + whoopFatigue + fatigue*0.15`.
//
// Eso está mal por dos motivos distintos, los dos en el audit (F-5):
//   · Es una DOSIS DERIVADA DE UN SCORE COMPUESTO, que es READ-003 al revés. Del 73 no se sigue
//     "push hard"; del 41 no se sigue "reduce volumen".
//   · Los pesos eran inventados: "≥6 sesiones = +30" sin distinguir una caminata de una pierna
//     pesada, y la proteína baja no es fatiga aguda.
//
// Y además discrepaba de Home y del banner de deload, porque cada uno calculaba lo suyo.
//
// Ahora esta tarjeta MUESTRA las señales de `computeReadiness()` —el mismo objeto que decide en
// Home— con su valor y su base. Sin número, sin barra, sin consejo. Lo que hay que hacer con
// ellas está en la tarjeta de Home, que es donde se decide el entreno.
async function renderReadinessSignals() {
  const el = document.getElementById('readiness-signals');
  if (!el) return;
  let r;
  try { r = await computeReadiness(); } catch (e) { console.warn('[readiness] card:', e); el.innerHTML = ''; return; }

  const LABEL = { green: 'green', yellow: 'yellow', red: 'red', unknown: 'no data today' };
  const COL = { green: 'var(--accent)', yellow: 'var(--yellow)', red: 'var(--red)', unknown: 'var(--text3)' };
  const CONF = { high: 'high confidence', medium: 'medium confidence', low: 'low confidence' };
  const color = COL[r.color] || 'var(--text3)';

  const rows = (r.signals || []).map(s => {
    const cls = s.status === 'insufficient' ? 'rs-none' : (s.fired ? 'rs-fired' : 'rs-ok');
    const txt = s.status === 'insufficient'
      ? `${s.label || s.id}: no data — ${s.reason || ''}`
      : s.text;
    const dot = s.status === 'insufficient' ? '○' : '●';
    return `<div class="rs-row ${cls}"><span class="rs-dot"${s.fired ? ` style="color:${color}"` : ''}>${dot}</span><span class="rs-text">${escapeHtml(String(txt))}</span></div>`;
  }).join('');

  // La honestidad de v11.58: si hay un dato pero NO es de hoy, se dice de cuándo es. Nunca se
  // pinta el de ayer como si fuera de hoy (F-6).
  const last = r.whoopLastAvailable;
  const whoopSig = (r.signals || []).find(s => s.id === 'whoop') || {};
  const lastLine = (whoopSig.status === 'insufficient' && last && last.score != null)
    ? `<div class="rs-foot">Last WHOOP reading: ${last.score}% (${(typeof whoopDayLabel === 'function' ? whoopDayLabel(last.date, today()) : last.date)}) — it does not count as today.</div>`
    : '';

  el.innerHTML = `
    <div class="rs-head">
      <span class="rs-title">Recovery</span>
      <span class="rs-color" style="color:${color}">${LABEL[r.color] || r.color}</span>
      <span class="rs-conf">${CONF[r.confidence] || ''}</span>
    </div>
    <div class="rs-rows">${rows}</div>
    ${lastLine}`;
}

// ==================== LÍNEA DE RECUPERACIÓN (Stats › Today, v11.62 · v11.65) ====================
//
// QUÉ SUSTITUYE. En Home había tres cosas hablando de recuperación: el hero de WHOOP (anillo
// gigante + "Your body is ready for high strain today"), la tarjeta de consejo diario con sus
// botones, y el banner reactivo de descarga. Julian las retiró el 2026-09-07: *"nada de ajustar
// el entrenamiento del día por WHOOP; eso es muy subjetivo; voy a ser yo y mi cuerpo el que
// decida skipear un ejercicio o bajar los pesos"*.
//
// LO QUE QUEDA SON DOS LÍNEAS APAGADAS, y el orden importa:
//
//   Rendimiento: banca 95×8 ↑ · sentadilla 105×8 → · Z2 5,1 km @141
//   HRV estable (−3 %) · RHR 44 · sueño 7,4 h · WHOOP hoy 71 %
//
// **Rendimiento primero** (plan v2.1 §Principios 2): la recuperación se mira sobre todo en los
// entrenamientos —el top set, las reps a la misma carga, el pulso a Z2— y el wearable es
// contexto en tendencia de 7 días, nunca un día suelto y nunca una dosis.
//
// SIN COLOR POR ESTADO Y SIN BOTONES, a propósito. Un rojo aquí volvería a ser un consejo por
// la puerta de atrás. Quien quiera el detalle lo tiene en Stats › Today, con cada señal, su
// valor y su base.
//
// El contenedor queda VACÍO si no hay nada que decir: una etiqueta "Recuperación" sobre tres
// guiones no es información, es un hueco con nombre.
//
// DÓNDE VIVE (v11.65). Nació en Home, entre la sesión del día y el trío de estadísticas, y ahí
// se veía como lo que era: dos párrafos de texto plano en medio de un dashboard de tarjetas
// —*"está feo, sin nada que ver con la UX"*—. Se muda a **Stats › Today**, detrás de las señales
// y de la carga de la semana, y se pinta como una tarjeta más. El dato que sí tenía que estar en
// Home —el WHOOP de hoy— se fue al tile `Readiness` de `renderHomeStatTrio`, que es un número
// en una fila de números. Un fallo mudo, de paso: las reglas de `.coach-recovery-line` colgaban
// de una clase que el contenedor no tenía (sólo `id`), así que NUNCA se aplicaron y el texto
// salía a tamaño de párrafo. El div lleva ahora también la clase.

/** Ventana de la línea de rendimiento: dos semanas. Más atrás ya no describe "cómo vengo". */
const RECOVERY_LINE_DAYS = 14;

/** "HRV steady (−3 %)" / "RHR 44" / "sleep 7.4 h" desde las señales que SÍ tienen dato. */
function _crlTrendBits(signals) {
  const bits = [];
  const by = (id) => (signals || []).find(s => s && s.id === id && s.status === 'ok') || null;
  const fmt = (v) => (typeof _coachFmtKg === 'function' ? _coachFmtKg(v) : String(v));

  const hrv = by('hrv7v28');
  if (hrv && hrv.value != null && hrv.baseline) {
    const pct = Math.round((hrv.value / hrv.baseline - 1) * 100);
    const signo = (pct < 0 ? '−' : '+') + Math.abs(pct) + ' %';
    bits.push(`HRV ${hrv.fired ? 'down' : 'steady'} (${signo})`);
  }
  const rhr = by('rhr7v28');
  if (rhr && rhr.value != null) {
    const d = rhr.baseline != null ? Math.round(rhr.value - rhr.baseline) : null;
    bits.push(`RHR ${rhr.value}` + (rhr.fired && d != null ? ` (${d < 0 ? '−' : '+'}${Math.abs(d)})` : ''));
  }
  const slp = by('sleep7');
  if (slp && slp.value != null) bits.push(`sleep ${fmt(slp.value)} h`);
  return bits;
}

async function renderRecoveryLine() {
  const el = document.getElementById('coach-recovery-line');
  if (!el) return;
  el.innerHTML = '';
  try {
    const ds = today();
    const desde = dateStr(new Date(Date.parse(ds + 'T12:00:00') - RECOVERY_LINE_DAYS * 86400000));

    // ---- Línea 1: rendimiento ------------------------------------------------------------
    let perf = '';
    if (typeof performanceLine === 'function') {
      const [workouts, runs] = await Promise.all([
        dbGetAll('workouts').catch(() => []),
        (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
      ]);
      const zonas = (typeof _runningZones === 'function') ? _runningZones() : null;
      perf = performanceLine(
        (workouts || []).filter(w => w && w.date && w.date >= desde && w.date <= ds),
        (runs || []).filter(r => r && r.date && r.date >= desde && r.date <= ds),
        { z2Ceiling: (zonas && zonas.z2 && zonas.z2[1]) || null },
      );
    }

    // ---- Línea 2: tendencias de 7 días + el dato de hoy -----------------------------------
    let trend = '';
    let r = null;
    try { r = await computeReadiness(); } catch (e) { r = null; }
    if (r) {
      const bits = _crlTrendBits(r.signals);
      // El dato de HOY o su ausencia, con la fecha del último (F-6): nunca el de ayer como si
      // fuera de hoy. Sin `%` de recomendación al lado: es un número, no una instrucción.
      const whoop = (r.signals || []).find(s => s && s.id === 'whoop') || {};
      if (whoop.status === 'ok' && whoop.value != null) {
        bits.push(`WHOOP today ${whoop.value} %`);
      } else {
        const last = r.whoopLastAvailable;
        bits.push((last && last.score != null)
          ? `no data today (last: ${last.score} % ${(typeof whoopDayLabel === 'function' ? whoopDayLabel(last.date, ds) : last.date)})`
          : 'no data today');
      }
      trend = bits.join(' · ');
    }

    if (!perf && !trend) return;
    // Tarjeta, no párrafo: `card t3-card` + eyebrow, las mismas que la carga de la semana
    // justo encima. La ventana la dice el propio título (RECOVERY_LINE_DAYS = 14 d).
    el.innerHTML =
      `<section class="card t3-card">
        <div class="t3-head"><span class="t3-eyebrow">Performance · ${RECOVERY_LINE_DAYS} d</span></div>
        ${perf ? `<div class="crl-perf">${escapeHtml(perf)}</div>` : ''}
        ${trend ? `<div class="crl-trend">${escapeHtml(trend)}</div>` : ''}
      </section>`;
  } catch (e) {
    // Patrón `renderHomeView`: cada sección con su try/catch. Una línea no tumba Home.
    console.warn('[Coach] renderRecoveryLine:', e);
    el.innerHTML = '';
  }
}

// ==================== OBJETIVOS (Stats › Today, v11.60) ====================
//
// EL PROBLEMA QUE RESUELVE. La app medía muchas cosas y no respondía la única pregunta que
// importa: **¿voy bien?**. El peso tenía gráfico y una tasa de 30 días, pero sin banda
// objetivo, sin hito y sin ETA honesto; la carrera no tenía objetivo ninguno; y la promesa
// central del bloque —"la fuerza se mantiene en déficit" (STR-001)— no se verificaba en
// ninguna pantalla. Tres objetivos, tres filas, cada una con su tamaño de muestra al lado.
//
// SIN GRÁFICOS, a propósito: los de peso y fuerza ya existen en Stats › Body y Stats ›
// Strength, y duplicarlos aquí sólo añadiría dos formas más de calcular lo mismo. Esta
// tarjeta son números y estados.
//
// TODO EL CÁLCULO ESTÁ EN `goalProgress` (coach-engine.js, puro y con test). Aquí sólo se
// leen los stores y se pinta. La regla de la casa: los números no se calculan en el renderer.
//
// v11.61: la misma tarjeta se pinta también en la vista Coach (`#coach-goals-view`), de ahí el
// parámetro. Dos contenedores y no un id duplicado: `getElementById` sólo encontraría uno.

/** Sólo pesadas MEDIDAS: los valores suavizados de intervals.icu meterían pendiente 0. */
const GOALS_WEIGH_DAYS = 90;
const GOALS_RUN_DAYS = 28;
const GOALS_WORKOUT_DAYS = 56;

/**
 * Los tres objetivos, calculados una sola vez desde los stores (v11.65).
 *
 * POR QUÉ SE EXTRAJO. La misma cuenta la necesitan ahora tres sitios: la tarjeta de Stats, la
 * misma tarjeta en la vista Coach y la LÍNEA de Home (`renderCoachGoalLine`). Con el cálculo
 * dentro del renderer, la línea de Home habría acabado con su propia versión del peso y su
 * propia pendiente — que es exactamente el bug que `goalProgress` vino a cerrar (tres sitios
 * calculando la recuperación y discrepando, audit F-5).
 *
 * Devuelve también `weighins` y `todayStr` porque la línea necesita el TAMAÑO DE MUESTRA para
 * su fallback honesto ("sin señal (3 pesadas en 14 d)"), y ese dato no está en `gp`.
 *
 * @returns {Promise<{gp, goals, weighins, todayStr}|null>} null si el motor no cargó.
 */
async function _coachGoalProgressFromStores() {
  if (typeof goalProgress !== 'function') return null;
  const ds = today();
  const desde = (d) => dateStr(new Date(Date.parse(ds + 'T12:00:00') - d * 86400000));
  const desdePeso = desde(GOALS_WEIGH_DAYS);
  const desdeRun = desde(GOALS_RUN_DAYS);
  const desdeWk = desde(GOALS_WORKOUT_DAYS);

  const [bw, wellness, runs, workouts] = await Promise.all([
    dbGetAll('bodyweight').catch(() => []),
    dbGetAll('wellness').catch(() => []),
    (typeof getRunsDeduped === 'function' ? getRunsDeduped() : dbGetAll('runs')).catch(() => []),
    dbGetAll('workouts').catch(() => []),
  ]);

  // `measured !== false` y no `measured === true`: las filas que escribe `logBodyWeight` no
  // llevan el campo y son pesadas reales. Las de intervals.icu sí lo llevan, y las
  // rellenadas hacia delante llegan con `measured: false` — ésas son las que sobran.
  const pesadas = [];
  for (const r of (bw || [])) {
    if (!r || !r.date || r.date < desdePeso || r.date > ds) continue;
    if (r.measured === false || !(Number(r.weight) > 0)) continue;
    pesadas.push({ date: r.date, kg: Number(r.weight) });
  }
  for (const w of (wellness || [])) {
    if (!w || !w.date || w.date < desdePeso || w.date > ds) continue;
    if (!(Number(w.weightMeasured) > 0)) continue;
    pesadas.push({ date: w.date, kg: Number(w.weightMeasured) });
  }

  const runs4w = (runs || [])
    .filter(r => r && r.date && r.date >= desdeRun && r.date <= ds)
    .map(r => ({
      date: r.date, km: Number(r.distance) || 0, min: Number(r.duration) || null,
      avgHR: r.avgHR != null ? Number(r.avgHR) : null,
      decoupling: r.decoupling != null ? Number(r.decoupling) : null,
      modality: r.modality || null,
    }));

  const workouts8w = (workouts || []).filter(w => w && w.date && w.date >= desdeWk && w.date <= ds);

  const goals = (state.settings && state.settings.goals)
    || (typeof COACH_GOALS_DEFAULT !== 'undefined' ? COACH_GOALS_DEFAULT : {});

  const gp = goalProgress(goals, {
    today: ds,
    bodyweight: pesadas,
    runs4w,
    workouts8w,
    zones: (typeof _runningZones === 'function') ? _runningZones() : null,
    e1rm: estimate1RM,
    exName: (id) => (typeof getExerciseName === 'function' ? getExerciseName(id) : id),
    toKg: (v, unit) => (String(unit).toLowerCase() === 'lb'
      ? (typeof convertWeight === 'function' ? convertWeight(Number(v), 'lb', 'kg') : Number(v) * 0.45359237)
      : Number(v)),
    block: (typeof blockWeek === 'function') ? blockWeek() : null,
    readiness: (state._readinessCache && state._readinessCache.value) || null,
  });

  return { gp, goals, weighins: pesadas, todayStr: ds };
}

async function renderGoalsCard(containerId = 'coach-goals') {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (typeof goalProgress !== 'function') { el.innerHTML = ''; return; }
  try {
    const calc = await _coachGoalProgressFromStores();
    if (!calc) { el.innerHTML = ''; return; }
    const gp = calc.gp;
    // Estado por fila. `-na` (gris) es un estado de primera clase: "no hay señal" no se pinta
    // ni de verde ni de rojo, porque no es ninguna de las dos cosas.
    const WSTATE = {
      'at-target': 'ok', 'on-track': 'ok', slow: 'warn', stalled: 'warn',
      fast: 'warn', insufficient: 'na',
    };
    const WLABEL = {
      'at-target': 'in the band', 'on-track': 'on track', slow: 'slow',
      stalled: 'stalled', fast: 'too fast', insufficient: 'no signal',
    };
    const anclas = gp.strength.anchors || [];
    const conDato = anclas.filter(a => a.maintained !== null);
    const mantenidas = conDato.filter(a => a.maintained).length;
    const pct10k = Math.round((gp.running.readinessFor10k || 0) * 100);

    const row = (label, valor, estado, texto, sub) => `
      <div class="coach-goal-row">
        <div class="coach-goal-head">
          <span class="coach-goal-label">${label}</span>
          <span class="coach-goal-val">${valor}</span>
          <span class="coach-goal-status coach-goal-status-${estado}">${sub}</span>
        </div>
        <div class="coach-goal-text">${escapeHtml(texto)}</div>
      </div>`;

    const filas = [
      row('Weight',
        gp.weight.trend7d != null ? `${gp.weight.trend7d} kg` : '—',
        WSTATE[gp.weight.status] || 'na',
        gp.weight.text,
        WLABEL[gp.weight.status] || gp.weight.status),
      row('Comfortable 10k',
        `${pct10k} %`,
        gp.running.phase === 'ready10k' ? 'ok' : (gp.running.runCount === 0 ? 'na' : 'warn'),
        gp.running.text,
        (typeof RW_PHASE_LABEL !== 'undefined' && RW_PHASE_LABEL[gp.running.phase]) || gp.running.phase),
      row('Strength held',
        `${mantenidas}/${anclas.length}`,
        gp.strength.allMaintained === null ? 'na' : (gp.strength.allMaintained ? 'ok' : 'warn'),
        gp.strength.text,
        // "mantenida" en verde sólo si TODAS las anclas tienen dato. Con 1 de 6 medidas, un
        // verde diría "la fuerza se mantiene" sobre cinco ejercicios que nadie ha tocado.
        gp.strength.allMaintained === null
          ? 'no window'
          : (!gp.strength.allMaintained ? 'watch'
            : (conDato.length === anclas.length ? 'held' : `${conDato.length} of ${anclas.length} with data`))),
    ].join('');

    const senales = (gp.signals || []).length
      ? `<div class="coach-goal-sigs">
           <div class="coach-goal-sigs-title">Signals for the coach</div>
           ${gp.signals.map(s => `
             <div class="coach-goal-sig coach-goal-sig-${s.severity}">
               <span class="coach-goal-sig-dot">●</span>${escapeHtml(s.text)}
             </div>`).join('')}
         </div>`
      : '<div class="coach-goal-sigs"><div class="coach-goal-sigs-title">Signals for the coach</div><div class="coach-goal-sig coach-goal-sig-info">None this week.</div></div>';

    el.innerHTML = `<div class="coach-goals-head">Goals</div>${filas}${senales}`;
  } catch (e) {
    // Patrón `renderHomeView`: cada sección con su try/catch. Un resumen no tumba la pestaña.
    console.warn('[Coach] renderGoalsCard:', e);
    el.innerHTML = '';
  }
}

// ==================== LÍNEA DE OBJETIVO (Home, v11.65) ====================
//
// LA PREGUNTA QUE FALTABA EN HOME. La tarjeta "Objetivos" existe desde v11.60, pero vive en
// Stats › Today y en la vista Coach — dos toques desde donde se decide entrenar. Julian pidió
// (2026-09-07) que la Home dijera también **cómo viene el objetivo**. Esto es esa respuesta en
// una o dos líneas apagadas, con su tamaño de muestra al lado y sin un solo botón.
//
//   Weight 85.9 · −0.42 kg/wk · milestone 82 kg in ~9 wk
//   10k: base phase · 12.1 km/wk · Z2 3/4 · Strength 5/6 anchors
//
// NO CALCULA NADA: todo sale de `_coachGoalProgressFromStores()` → `goalProgress`, que es puro
// y con test (`verify-goal-progress.mjs`). La regla de la casa: los números no se calculan en
// el renderer, y menos aún dos veces con dos redondeos distintos.
//
// EL FALLBACK ES HONESTO, no un guion: "no signal (3 weigh-ins in 14 d)" dice por qué no hay
// número. Un "—" haría pensar que el sistema no mira el peso.

/** Número para pantalla: punto decimal y el menos tipográfico (−), no el guion. */
function _cNum(v, dec) {
  const n = Number(v);
  if (v == null || !isFinite(n)) return '—';
  const s = (typeof _rwFmt === 'function') ? _rwFmt(Math.abs(n), dec) : String(Math.abs(n));
  return (n < 0 ? '−' : '') + s;
}

async function renderCoachGoalLine() {
  const el = document.getElementById('coach-goal-line');
  if (!el) return;
  el.innerHTML = '';
  try {
    const calc = await _coachGoalProgressFromStores();
    if (!calc) return;
    const { gp, goals, weighins, todayStr } = calc;

    // ---- Línea 1: peso -------------------------------------------------------------------
    const desde14 = dateStr(new Date(Date.parse(todayStr + 'T12:00:00') - 13 * 86400000));
    const n14 = new Set((weighins || []).filter((w) => w.date >= desde14).map((w) => w.date)).size;
    const w = gp.weight || {};
    const peso = [];
    if (w.status === 'insufficient' || w.trend7d == null) {
      peso.push(`Weight no signal (${n14} weigh-in${n14 === 1 ? '' : 's'} in 14 d)`);
    } else {
      peso.push(`Weight ${_cNum(w.trend7d, 1)}`);
      if (w.slope != null) peso.push(`${_cNum(w.slope, 2)} kg/wk`);
      const hito = Number(((goals || {}).primary || {}).milestoneKg);
      const banda = (((goals || {}).primary || {}).targetWeightKg) || [];
      if (w.etaMilestoneWeeks != null && w.etaMilestoneWeeks > 0 && isFinite(hito)) {
        peso.push(`milestone ${_cNum(hito, 0)} kg in ~${_cNum(w.etaMilestoneWeeks, 0)} wk`);
      } else if (w.etaWeeks != null && w.etaWeeks > 0 && banda.length === 2) {
        peso.push(`${_cNum(banda[1], 0)} kg in ~${_cNum(w.etaWeeks, 0)} wk`);
      }
    }

    // ---- Línea 2: carrera + fuerza -------------------------------------------------------
    const r = gp.running || {};
    const s = gp.strength || {};
    const otros = [];
    if (r.runCount === 0) {
      otros.push('10k: no runs in 4 weeks');
    } else {
      const fase = (typeof RW_PHASE_LABEL !== 'undefined' && RW_PHASE_LABEL[r.phase]) || r.phase;
      otros.push(`10k: ${fase} phase`);
      otros.push(`${_cNum(r.weeklyKm, 1)} km/wk`);
      if (r.z2Sample > 0) otros.push(`Z2 ${r.z2Compliance}/${r.z2Sample}`);
    }
    const anclas = s.anchors || [];
    const conDato = anclas.filter((a) => a.maintained !== null);
    otros.push(conDato.length
      ? `Strength ${conDato.filter((a) => a.maintained).length}/${anclas.length} anchors`
      : `Strength no signal (0 of ${anclas.length} anchors with data)`);

    el.innerHTML =
      `<div class="coach-goal-line" role="button" tabindex="0">` +
      `<div class="cgl-row">${_cEsc(peso.join(' · '))}</div>` +
      `<div class="cgl-row">${_cEsc(otros.join(' · '))}</div>` +
      `</div>`;
    // Un toque lleva al detalle. Es el único gesto: aquí no se decide nada.
    const box = el.querySelector('.coach-goal-line');
    if (box) box.addEventListener('click', () => { try { openCoachView(); } catch (e) {} });
  } catch (e) {
    // Patrón `renderHomeView`: cada sección con su try/catch. Una línea no tumba Home.
    console.warn('[Coach] renderCoachGoalLine:', e);
    el.innerHTML = '';
  }
}

// ============================================================
// COACH SEMANAL (v11.61, incremento 9)
// ============================================================
//
// QUÉ CIERRA. Hasta aquí el coach existía en dos mitades que no se hablaban: los motores
// deterministas dentro de la app (progresión, readiness, bloque, carrera) y una edge function
// desplegada que sabe opinar sobre la semana pero a la que nadie llamaba. Esto es el cable: la
// app construye los hechos, pide la revisión, la refleja, la pinta con su diff y sus avisos, y
// Julian la aplica con un toque — o no.
//
// TRES REGLAS QUE GOBIERNAN TODO ESTE BLOQUE:
//
//   1. **Las propuestas NUNCA entran en `plans`.** El invariante de la app es "plan activo =
//      versión más alta" y lo respetan también los dispositivos con código viejo, que no saben
//      leer `status:'proposed'`. Una propuesta escrita en `plans` sería el plan vivo de todos
//      ellos. Viven en `coach_reviews`; sólo `applyCoachProposal` crea una versión.
//   2. **Nada bloquea.** Los guardarraíles duros se pintan en rojo y "Aplicar" sigue activo.
//      Los duros restringen al COACH (la edge function le pide una regeneración con el aviso);
//      si insiste, la decisión es del usuario. Ningún botón se deshabilita por un aviso.
//   3. **Una llamada por semana, automática.** Cada ejecución cuesta ~$0,50-0,70. Si ya hay
//      fila de esta semana en cualquier estado vivo, no se llama. Un historial de sólo
//      `failed` NO se reintenta solo: reintentar en cada arranque quema el presupuesto de a
//      dólar. El botón "Regenerar" existe para eso y es una decisión explícita.
//
// LA VERSIÓN DE LA APP viaja al servidor (`clientVersion`) y al pack (`meta.appVersion`), que
// es lo que permite luego saber qué código produjo una revisión rara.
// `verify-coach-wiring.mjs` comprueba que coincide con la de index.html y con `CACHE_NAME`.
const COACH_APP_VERSION = 'v11.70';

const COACH_MAX_SESSION_IDS = 12;   // el tope que valida la edge function
const COACH_MAX_EXERCISE_IDS = 150; // idem
const COACH_MAX_USER_NOTE = 1200;   // idem
const COACH_POLL_MS = 5000;
const COACH_POLL_MAX_MS = 5 * 60 * 1000;

const COACH_STATUS_LABEL = {
  running: 'running', proposed: 'proposed', applied: 'applied',
  rejected: 'rejected', expired: 'expired', failed: 'failed',
  requested: 'requested (manual)',
};
// El adjetivo, no el sustantivo: la etiqueta se arma como "<nivel> evidence", así que
// `expert` va suelto aunque el corpus lo llame "expert opinion".
const COACH_EVIDENCE_LABEL = {
  strong: 'strong', moderate: 'moderate',
  weak_extrapolated: 'weak/extrapolated', expert: 'expert',
};
const COACH_ERROR_LABEL = {
  refusal: 'the model refused to answer',
  parse: 'the model did not return the expected format',
  api: 'model API error',
  invoke: 'the function could not be called',
};
const COACH_DECISION_LABEL = {
  progression: 'progression', structure: 'structure', running: 'running',
  nutrition: 'nutrition', recovery: 'recovery',
  'session-readout': 'session readout',
  // v11.62: los dos siguientes ya NO se escriben (el ajuste diario y el banner reactivo de
  // descarga se retiraron). Se conservan para poder leer las decisiones históricas.
  'readiness-adjust': 'recovery adjustment (historical: no longer written)',
  'plan-apply': 'plan applied', 'plan-adjust': 'plan adjusted', 'plan-reject': 'plan rejected',
  'plan-rollback': 'version restored', 'running-week': 'running week',
  'deload-request': 'deload (historical: no longer written)',
  'goal-update': 'goal', 'target-override': 'manual target', other: 'other',
};
const COACH_OUTCOME_LABEL = { accepted: 'accepted', declined: 'declined', done: 'done' };
// Los ids de guardarraíl no son Rule IDs, pero tampoco son frase. Etiqueta corta por id;
// el texto completo (con los números) va en el `title` del chip.
const COACH_GUARD_LABEL = {
  'LOAD-JUMP': 'load jump', 'NO-SOURCE-KG': 'kg with no source', 'DELOAD-VOLUME': 'deload volume',
  'HARD-CARDIO': 'hard cardio', 'RUN-BEFORE-LEGS': 'hard run before legs', 'ANCHOR-SWAP': 'anchor swapped',
  'VOL-CAP': 'set cap', 'KM-JUMP': 'km jump', 'PROTEIN-FLOOR': 'protein floor',
  'KCAL-FLOOR': 'kcal floor', 'DELOAD-DIETBREAK': 'diet break', 'PLYO-PLACEMENT': 'plyo placement',
  'CORE-PATTERNS': 'core patterns', 'MIN-STRENGTH': 'strength minimum', 'DECISION-EVIDENCE': 'decision without evidence',
  'EX-UNKNOWN': 'unknown exercise', 'SESSION-COUNT': 'gym days', 'EA-GATE': 'energy availability',
  'MOBILITY-FLOOR': 'mobility floor', 'PRESS-EXPOSURES': 'press exposures',
  'SESSION-LENGTH': 'session length', 'HYBRID-PLUS-LONG': 'hybrid + long run', 'TARGET-N1': 'target on n=1',
  'READINESS-N': 'few recovery days', 'WEIGHT-WINDOW': 'weight window', 'HARD-BUDGET': 'hard-day budget',
  'SUMMER-PACE': 'summer pace', 'Z2-CEILING': 'Z2 ceiling', CHURN: 'too many changes',
  ROTATION: 'rotation outside week 1', 'CTL-FOR-STRENGTH': 'ctl/atl for strength',
  'VALIDATOR-ERROR': 'validator incomplete',
  // v11.65 (contrato v2): una sesión del plan sin fila en `weekSummary`. Blando: el coach
  // debe justificar también lo que mantiene, pero un hueco no impide aplicar.
  'WEEK-SUMMARY': 'session without summary',
  // fn v4 (auditoría 2026-09-08): los 6 ids que cierran E-14, E-17, E-18 y R-5. Van del 34 al 39.
  'ORDER-SAME-DAY': 'cardio before lifting',      // G-S17, INT-003
  'FREQ-FLOOR': 'pattern 1×/week',                // G-S18, STR-002
  'RECOVERY-ONLY': 'recovery only',               // G-S19, READ-005
  'KCAL-STEP': 'kcal step',                       // G-H14, REC-002
  'MVPA-FLOOR': 'cardio minutes',                 // G-S20, END-009
  'PLYO-CONTACTS': 'plyo contacts',               // G-S16, ATH-001
};
const COACH_DOW_LABEL = { 0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat' };

/** "Rule STR-001 (strong evidence): <texto>". El id crudo sólo va en el `title`. */
function COACH_RULE_LABEL(ruleId) {
  const r = (typeof COACH_RULES !== 'undefined' && COACH_RULES) ? COACH_RULES[ruleId] : null;
  if (!r) return null;
  const nivel = COACH_EVIDENCE_LABEL[r.evidenceLevel] || r.evidenceLevel || '';
  return { id: ruleId, text: r.rule, level: r.evidenceLevel, levelLabel: nivel,
    label: `Rule ${ruleId}${nivel ? ` (${nivel} evidence)` : ''}` };
}

function _cKg(v) {
  if (v == null || !isFinite(Number(v))) return '—';
  return (typeof _coachFmtKg === 'function') ? _coachFmtKg(Number(v)) : String(v);
}
function _cEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function _cMd(md) {
  if (!md) return '';
  return (typeof markdownToBasicHtml === 'function') ? markdownToBasicHtml(md) : `<p>${_cEsc(md)}</p>`;
}
function _cWeekKey(ds) { return (typeof isoWeekKey === 'function') ? isoWeekKey(ds || today()) : null; }
/** "W37" a partir de "2026-W37": el año sobra en una tarjeta de esta semana. */
function _cWeekShort(wk) { const m = String(wk || '').match(/W(\d{2})$/); return m ? `W${m[1]}` : String(wk || ''); }
/** La semana PARA la que se pide la revisión: domingo → la siguiente (motor, con test). */
function _cTargetWeek(ds) {
  return (typeof coachTargetWeekKey === 'function') ? coachTargetWeekKey(ds || today()) : _cWeekKey(ds);
}
function _cPhaseLabel(p) {
  const M = (typeof PHASE_LABEL !== 'undefined' && PHASE_LABEL) || {};
  return M[String(p || '')] || (p ? String(p) : null);
}
/** 'B1', 'B2'… desde el ancla del usuario. El motor hace la cuenta; aquí sólo se lee settings. */
function _cBlockLabel(ds) {
  try {
    if (typeof blockLabel !== 'function') return null;
    const anchor = (typeof state !== 'undefined' && state.settings && state.settings.deloadAnchorDate) || null;
    const n = (typeof DELOAD_BLOCK_WEEKS !== 'undefined') ? DELOAD_BLOCK_WEEKS : 5;
    return blockLabel(ds || today(), anchor, n);
  } catch (e) { return null; }
}

// ==================== EL BRIEF DE LA SEMANA (contrato v2, v11.65) ====================
//
// QUÉ ES. Los seis campos que la Home nueva lee para poder decir **qué pasó la semana pasada,
// en qué etapa estoy, cuál es el enfoque y por qué cambia o por qué sigue igual** (petición de
// Julian, 2026-09-07). Viven en `coach_reviews[…].output` mientras la propuesta está viva, y
// al APLICAR se estampan en la versión del plan como `coachBrief`.
//
// POR QUÉ SE COPIAN AL PLAN Y NO SE LEEN SIEMPRE DE LA REVISIÓN. El plan es la fila que
// sobrevive: la revisión se puede podar, y la vieja de W36 no describe el plan de W38. Con el
// brief dentro del plan, "¿por qué mi Upper A sigue igual?" tiene respuesta mientras ese plan
// esté activo, aunque la revisión ya no esté en el dispositivo.
//
// FALLBACK PARA REVISIONES v1 (las que ya existen, sin `weekSummary`): las filas se derivan
// del diff — `changed` para las sesiones que difieren, `kept` con "sin cambios" para el resto.
// El `focus` sale de la primera prioridad, la fase del campo binario viejo (`build`|`deload`)
// mapeado a `base`|`deload`, y `whyKept` queda vacío: v1 nunca justificó lo que mantenía, y
// inventar un motivo aquí sería exactamente lo que este contrato viene a impedir.

const COACH_PHASES = ['base', 'build', 'intensify', 'deload', 'maintenance'];
const COACH_MAX_WEEK_SUMMARY = 12;
const COACH_WS_STATUS_LABEL = { kept: 'holds', changed: 'changes', new: 'new', removed: 'out' };
const _COACH_V1_LINE = {
  kept: 'no changes',
  changed: 'changes (v1 review: the coach gave no reason)',
  new: 'new session',
  removed: 'session removed',
};

/**
 * El `coachBrief` de una revisión, con fallback para v1.
 *
 * @param {object} review  la fila de `coach_reviews`
 * @param {object} [opts]  `{ prev, next, diff }` — `next` es el plan resultante (mergeado o ya
 *                         aplicado) y `diff` el `diffPlanVersions(prev, next)` si se tiene.
 *                         Sin `diff`, las filas v1 se deducen de `proposal.sessions`.
 */
function coachBriefFromReview(review, opts = {}) {
  const r = review || {};
  const out = r.output || {};
  const brief = out.briefing || {};
  const prop = out.proposal || {};
  const next = opts.next || null;
  const diff = opts.diff || null;
  const esV2 = Array.isArray(prop.weekSummary) && prop.weekSummary.length > 0;

  let weekSummary;
  if (esV2) {
    weekSummary = prop.weekSummary.slice(0, COACH_MAX_WEEK_SUMMARY).map((w) => ({
      sessionId: (w && w.sessionId) || null,
      status: (w && COACH_WS_STATUS_LABEL[w.status]) ? w.status : 'kept',
      line: (w && w.line) ? String(w.line) : '',
    }));
  } else {
    const sesiones = (next && next.sessions) || ((opts.prev || {}).sessions) || {};
    const tocadas = {};
    for (const s of (prop.sessions || [])) if (s && s.id) tocadas[s.id] = 1;
    const dSess = (diff && diff.sessions) || null;
    const ids = Object.keys(sesiones);
    if (dSess) for (const sid of Object.keys(dSess)) if (ids.indexOf(sid) === -1) ids.push(sid);
    weekSummary = ids.slice(0, COACH_MAX_WEEK_SUMMARY).map((sid) => {
      const d = dSess ? dSess[sid] : null;
      let status = 'kept';
      if (d) status = d.sessionAdded ? 'new' : (d.sessionRemoved ? 'removed' : 'changed');
      else if (tocadas[sid]) status = 'changed';
      return { sessionId: sid, status, line: _COACH_V1_LINE[status] };
    });
  }

  const priorities = (brief.priorities || []).slice(0, 3);
  const fase = esV2
    ? (COACH_PHASES.indexOf(brief.phase) !== -1 ? brief.phase : null)
    // v1: el campo era binario ('build'|'deload'). "No es descarga" en el vocabulario v2 es
    // `base`, que es el que menos promete.
    : (String(prop.phase || '') === 'deload' ? 'deload' : 'base');

  return {
    reviewId: r.id || null,
    weekKey: r.weekKey || null,
    appliedAt: null,
    focus: (esV2 && brief.focus) ? String(brief.focus) : (priorities[0] || null),
    phase: fase,
    whyChanged: esV2 ? String(brief.whyChanged || '') : '',
    whyKept: esV2 ? String(brief.whyKept || '') : '',
    priorities,
    lastWeekSummary: esV2 ? (brief.lastWeekSummary || []).slice(0, 3) : [],
    weekSummary,
  };
}

// ==================== EL PACK DE HECHOS DESDE LOS STORES ====================
//
// El único sitio de la app que lee los 9 stores a la vez. `buildCoachFacts` es puro y con test
// (`verify-coach-facts.mjs`); esto es exclusivamente el acarreo: leer IDB, inyectar los helpers
// de app.js y pasarle el "hoy" del llamador. Cualquier número que se calculase aquí sería un
// número sin test, que es justo el fallo que el pack existe para corregir.
//
// El contrato exacto de `input`/`deps` está en docs/architecture/coach-facts-schema.md.
async function buildCoachFactsFromStores({ todayStr = today(), weekKey } = {}) {
  if (typeof buildCoachFacts !== 'function') throw new Error('coach-facts.js did not load');
  const g = (s) => dbGetAll(s).catch(() => []);
  const [workouts, runs, sessions, mobility, wellness, steps, bodyweight, nutrition, decisions, coachReviews] =
    await Promise.all(['workouts', 'runs', 'sessions', 'mobility_sessions', 'wellness', 'steps',
      'bodyweight', 'nutrition', 'decisions', 'coach_reviews'].map(g));
  const [ovDoc, schedDoc] = await Promise.all([
    dbGet('settings', 'exerciseOverrides').catch(() => null),
    dbGet('settings', 'weekSchedule').catch(() => null),
  ]);

  // `weekly_reviews` (el cron retirado) entra como UNA entrada `legacy` y sólo si el pack tiene
  // menos de 3 revisiones reales — lo decide `buildCoachFacts`, no esto. Es prosa sin Rule IDs
  // y su `note` lo dice: sirve para que la primera revisión del coach sepa qué se dijo en W36.
  let legacyLatest = null;
  try {
    const wr = await dbGetAll('weekly_reviews');
    if (wr && wr.length) legacyLatest = wr.slice().sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0))[0];
  } catch (e) { legacyLatest = null; }

  const input = {
    todayStr,
    weekKey: weekKey || _cWeekKey(todayStr),
    generatedAt: new Date().toISOString(),
    appVersion: COACH_APP_VERSION,
    seedRev: (typeof PLAN_REV !== 'undefined') ? PLAN_REV : null,
    weekNumber: (typeof getWeekNumber === 'function') ? getWeekNumber() : null,
    block: (typeof blockWeek === 'function') ? blockWeek(new Date(`${todayStr}T12:00:00`)) : null,
    legacyLatest,
    stores: {
      workouts, runs, sessions, mobility, wellness, steps, bodyweight, nutrition, decisions,
      coachReviews,
      settings: {
        userSettings: (typeof state !== 'undefined' && state.settings) || {},
        exerciseOverrides: (ovDoc && ovDoc.data) || {},
        weekSchedule: (schedDoc && schedDoc.data) || {},
      },
      activePlan: (typeof activePlan !== 'undefined') ? activePlan : null,
      // El mapa en memoria como array: `_libraryMap` acepta las dos formas, y un array deja
      // claro que es una lista de ejercicios y no un objeto de configuración.
      exercisesLibrary: Object.values((typeof exerciseLibrary !== 'undefined' && exerciseLibrary) || {}),
    },
  };

  const deps = {
    convertWeight, estimate1RM, measureUnitFor, dedupeRuns, dedupeSessions, toSession,
    // Los dos de nutrition.js van con guarda: si ese <script> no cargó, el pack se degrada y
    // lo declara en `dataGaps` en vez de reventar la exportación entera.
    nutRollingWeight: (typeof nutRollingWeight === 'function') ? nutRollingWeight : undefined,
    weeklyDeficits: (typeof weeklyDeficits === 'function') ? weeklyDeficits : undefined,
    z2Ceiling: _coachZ2Ceiling(),
    // v11.63 (trajectory): el pack los resuelve también por el global del motor, pero pasarlos
    // explícitos deja la dependencia a la vista y hace el pack testeable sin globals.
    computeReadinessFrom: (typeof computeReadinessFrom === 'function') ? computeReadinessFrom : undefined,
    blockWeekFromDates: (typeof blockWeekFromDates === 'function') ? blockWeekFromDates : undefined,
  };
  return buildCoachFacts(input, deps);
}

/** El techo de Z2 real: zonas de intervals.icu si están, si no el declarado (143). */
function _coachZ2Ceiling() {
  try {
    const t = (typeof cardioHrTarget === 'function') ? cardioHrTarget('zone2') : null;
    if (Array.isArray(t) && isFinite(Number(t[1]))) return Number(t[1]);
  } catch (e) { /* sigue por settings */ }
  const z = state && state.settings && state.settings.icuZones
    && state.settings.icuZones.z && state.settings.icuZones.z.zone2;
  if (Array.isArray(z) && isFinite(Number(z[1]))) return Number(z[1]);
  return 143;
}

// ==================== EL VOCABULARIO QUE SE LE PERMITE AL MODELO ====================
//
// `allowed` se convierte en los `z.enum()` del esquema de salida en la edge function: el modelo
// no puede inventar un id de ejercicio ni de sesión. Los del plan van PRIMERO para que sobrevivan
// al tope de 150 — si el recorte se comiera un ejercicio programado, el coach no podría ni
// hablar de él. `measure` sale de `measureUnitFor` y no del plan (el store `exercises` no
// persiste campos arbitrarios): sin ese flag el modelo podría prescribir "box jump 52,5 kg".
function _coachAllowed() {
  const plan = (typeof activePlan !== 'undefined' && activePlan) || {};
  const lib = (typeof exerciseLibrary !== 'undefined' && exerciseLibrary) || {};
  const planEx = {};
  const ids = [];
  const seen = Object.create(null);
  const push = (id) => { if (id && !seen[id]) { seen[id] = 1; ids.push(id); } };
  for (const s of Object.values(plan.sessions || {})) {
    for (const ex of (s.exercises || [])) { if (ex && ex.id) { if (!planEx[ex.id]) planEx[ex.id] = ex; push(ex.id); } }
  }
  for (const id of Object.keys(lib)) push(id);
  return {
    sessionIds: Object.keys(plan.sessions || {}).slice(0, COACH_MAX_SESSION_IDS),
    exerciseIds: ids.slice(0, COACH_MAX_EXERCISE_IDS).map((id) => {
      const p = planEx[id] || {};
      const l = lib[id] || {};
      return {
        id,
        name: p.name || l.name || id,
        muscle: p.muscle || l.muscle || null,
        db: !!(p.db || l.db),
        bw: !!(p.bw || l.bw),
        measure: !!(typeof measureUnitFor === 'function' && measureUnitFor(id)),
      };
    }),
  };
}

/** El plan activo compacto (sin warmups ni notas largas): lo que el modelo tiene que reescribir. */
function _coachCurrentPlan() {
  const p = (typeof activePlan !== 'undefined' && activePlan) || {};
  const sessions = {};
  for (const [sid, s] of Object.entries(p.sessions || {})) {
    sessions[sid] = {
      id: sid, name: s.name || sid, focus: s.focus || null,
      exercises: (s.exercises || []).map((ex) => ({
        id: ex.id, name: ex.name || ex.id, muscle: ex.muscle || null,
        sets: ex.sets != null ? ex.sets : null, reps: ex.reps || null, rpe: ex.rpe || null,
        optional: !!ex.optional, superset: ex.superset || null,
        target: ex.target || null,
      })),
    };
  }
  return {
    id: p.id || null, version: p.version != null ? p.version : null, label: p.label || null,
    author: p.author || null, weekKey: p.weekKey || null, schema: p.schema || 1,
    weekTemplate: p.weekTemplate || null, running: p.running || null, block: p.block || null,
    sessions,
  };
}

/** Las 6 últimas revisiones, compactas: qué dijo, qué decidió y si se aplicó (v11.63: 3 → 6,
 *  el mismo tope que MAX_PRIOR_REVIEWS en la función; el coach necesita ver el recorrido). */
function _coachPriorReviews(rows) {
  return (rows || [])
    .filter((r) => r && r.output)
    .sort((a, b) => String(b.weekKey || '').localeCompare(String(a.weekKey || ''))
      || (Number(b.attempt || 0) - Number(a.attempt || 0)))
    .slice(0, 6)
    .map((r) => ({
      weekKey: r.weekKey || null,
      status: r.status || null,
      applied: r.status === 'applied',
      priorities: (((r.output || {}).briefing || {}).priorities || []).slice(0, 3),
      decisions: ((r.output || {}).decisions || []).slice(0, 12)
        .map((d) => ({ id: d.id, type: d.type, what: d.what })),
    }));
}

// ==================== DISPARO Y POLLING ====================

let _coachWeeklyTried = false;   // una vez por carga de la app
let _coachInvoking = false;      // una invocación a la vez

/**
 * El disparo automático, desde `init()` tras `checkAuth()`. Con conexión y sesión, si esta
 * semana ISO no tiene revisión, se pide una.
 *
 * EL COSTE ES LA REGLA. Cualquier fila viva de la semana (running/proposed/applied/rejected/
 * expired) corta el disparo. Un historial de sólo `failed` TAMBIÉN lo corta: reintentar
 * automáticamente un fallo en cada arranque es la forma más rápida de gastar $20 sin ver una
 * sola propuesta. Para eso está "Regenerar", que es un toque del usuario.
 */
async function maybeRunWeeklyCoach() {
  try {
    if (_coachWeeklyTried) return;
    if (typeof buildCoachFacts !== 'function') return;   // coach-facts.js no cargó
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const supa = (typeof getSupaClient === 'function') ? getSupaClient() : null;
    if (!supa) return;
    const user = (typeof getUser === 'function') ? await getUser() : null;
    if (!user) return;
    // v11.69: en modo manual la app NUNCA llama al modelo por su cuenta. La revisión la escribe
    // Claude Code desde la sesión (`scripts/coach-manual-review.mjs`) sobre la fila `requested`
    // que deja "Cerrar la semana"; abrir la app un lunes no puede costar $0,60 sin que nadie lo pida.
    if (coachReviewMode() === 'manual') {
      _coachWeeklyTried = true;
      // Sin llamar a nadie, pero una fila `running` (de "Ask the model instead") se sigue vigilando:
      // cerrar la app a mitad de la revisión no puede dejarla huérfana en la tarjeta.
      const filas = (await dbGetAll('coach_reviews').catch(() => [])) || [];
      const enMarcha = filas.find((r) => r && r.status === 'running'
        && (r.weekKey === _cWeekKey(today()) || r.weekKey === _cTargetWeek(today())));
      if (enMarcha) pollCoachReview(enMarcha.id);
      return;
    }

    const wk = _cWeekKey(today());
    const rows = await dbGetAll('coach_reviews').catch(() => []);
    const mine = (rows || []).filter((r) => r && r.weekKey === wk);
    _coachWeeklyTried = true;

    const enMarcha = mine.find((r) => r.status === 'running');
    if (enMarcha) { pollCoachReview(enMarcha.id); return; }
    if (mine.length) return;   // ya hay revisión de esta semana (incl. sólo `failed`)

    await runWeeklyCoach({ weekKey: wk });
  } catch (e) {
    console.warn('[Coach] maybeRunWeeklyCoach:', e);
  }
}

/**
 * Pide la revisión de la semana a la edge function y refleja la fila.
 *
 * `mode:'async'`: el modelo tarda 60-180 s con `effort:'high'` e iOS suspende la PWA en
 * segundo plano, así que la función devuelve 202 con el `reviewId` y sigue trabajando bajo
 * `EdgeRuntime.waitUntil()`. Aquí se guarda un ESPEJO local `running` y se hace polling.
 *
 * EL CAMINO MANUAL NO SE BLOQUEA POR FILAS EXISTENTES (v11.65). El gate del coste vive en
 * `maybeRunWeeklyCoach` (el disparo AUTOMÁTICO); aquí, si Julian pulsa "Cerrar semana y pedir
 * la próxima", una fila `failed`, `rejected` o `expired` de esa semana no puede impedirlo —
 * eran justo los tres estados en los que uno quiere volver a pedirla. Sólo hay dos atajos, y
 * ninguno cuesta dinero: una fila `running` retoma el polling y una `proposed` navega a ella
 * (pedirla otra vez daría la misma respuesta con `cached:true`, que además es gratis).
 * `force` los salta, y `regenerate` también (es una decisión explícita del usuario).
 */
async function runWeeklyCoach({ weekKey, userNote, regenerate, force } = {}) {
  const wk = weekKey || _cWeekKey(today());
  if (_coachInvoking) { if (typeof toast === 'function') toast('The coach is already working'); return null; }
  // v11.69: "Cerrar la semana" en modo manual guarda el MISMO body que viajaría a la función y no
  // llama a nadie. Regenerar (`regenerate`) y "Ask the model instead" (`force`) sí llaman: son una
  // decisión explícita del usuario de gastar la llamada.
  if (!force && !regenerate && coachReviewMode() === 'manual') {
    return requestManualCoachReview({ weekKey: wk, userNote });
  }
  if (!force && !regenerate) {
    const previas = ((await dbGetAll('coach_reviews').catch(() => [])) || []).filter((r) => r && r.weekKey === wk);
    const enMarcha = previas.find((r) => r.status === 'running');
    if (enMarcha) {
      pollCoachReview(enMarcha.id);
      if (typeof toast === 'function') toast('The coach is already on that week');
      return { status: 'running', reviewId: enMarcha.id };
    }
    const propuesta = previas.find((r) => r.status === 'proposed');
    if (propuesta) { try { openCoachView(); } catch (e) {} return propuesta; }
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (typeof toast === 'function') toast('Offline: it will retry when you are back');
    return null;
  }
  const supa = (typeof getSupaClient === 'function') ? getSupaClient() : null;
  const user = (supa && typeof getUser === 'function') ? await getUser() : null;
  if (!supa || !user) {
    if (typeof toast === 'function') toast('You need a cloud session to request the review');
    return null;
  }

  _coachInvoking = true;
  try {
    try { await renderCoachWeekCard({ pending: true }); } catch (e) { /* la tarjeta no bloquea */ }
    const rows = await dbGetAll('coach_reviews').catch(() => []);
    const facts = await buildCoachFactsFromStores({ weekKey: wk });
    const body = {
      weekKey: wk,
      facts,
      currentPlan: _coachCurrentPlan(),
      allowed: _coachAllowed(),
      priorReviews: _coachPriorReviews(rows),
      mode: 'async',
      clientVersion: COACH_APP_VERSION,
      // v11.66 (fn v4): la función valida la propuesta con `validatePlanVersion` antes de
      // guardarla y necesita saber qué sesiones cargan las piernas para RUN-BEFORE-LEGS. El
      // servidor lo deriva del plan si falta, pero sólo `sessionClassMap()` sabe que `full` e
      // `hybrid` también cuentan. Misma lista que usa `_coachPreviewGuardrails` en la app.
      lowerSessionIds: Object.entries((typeof sessionClassMap === 'function' ? sessionClassMap() : {}) || {})
        .filter(([, c]) => c && (c.subtype === 'lower' || c.subtype === 'full' || c.family === 'hybrid'))
        .map(([sid]) => sid),
    };
    if (userNote) body.userNote = String(userNote).slice(0, COACH_MAX_USER_NOTE);
    if (regenerate) body.regenerate = true;

    // Mismo camino que `parse-meal-photo` (app/nutrition.js): `functions.invoke` pone el token
    // de la sesión en la cabecera Authorization, que es lo que la función valida con
    // `asUser.auth.getUser()`. Un `fetch` a mano tendría que reconstruirlo.
    const { data, error } = await supa.functions.invoke('coach-weekly-review', { body });
    if (error) throw new Error(error.message || 'The coach function failed');
    if (data && data.error) throw new Error(data.error);

    if (data && data.status === 'running' && data.reviewId) {
      // ESPEJO LOCAL CON `dbPut`, A PROPÓSITO. La fila de `coach_reviews` es de la FUNCIÓN:
      // ella escribe `running` y luego `proposed`. Un `smartPut` encolaría esta copia
      // `running` y el último-que-escribe-gana la subiría DESPUÉS del `proposed` del
      // servidor, borrando la propuesta que acaba de costar $0,60. Las escrituras del USUARIO
      // (aplicar, rechazar, vencer) sí van con `smartPut`: ésas son suyas y tienen que llegar
      // a la nube. Justificado en la línea base de tests/verify-sync-writes.mjs.
      const attempt = Number(String(data.reviewId).split('#')[1]) || 1;
      await dbPut('coach_reviews', {
        id: data.reviewId, weekKey: wk, attempt, status: 'running',
        createdAt: Date.now(), userNote: userNote || null, local: true,
      });
      try { await renderCoachWeekCard(); } catch (e) {}
      pollCoachReview(data.reviewId);
      return { status: 'running', reviewId: data.reviewId };
    }

    // 200 con `cached:true` (mismo hash de hechos) o una respuesta `mode:'sync'`: la fila ya
    // está terminada, se refleja y se pinta sin esperar.
    if (data && data.id) {
      const row = await _coachMirror(data);
      try { await renderCoachWeekCard(); } catch (e) {}
      try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
      if (typeof toast === 'function') {
        toast(data.cached ? "This week's review was already done (no cost)" : 'Coach review ready');
      }
      return row;
    }
    throw new Error('Unexpected response from the coach');
  } catch (e) {
    console.warn('[Coach] runWeeklyCoach:', e);
    // El fallo queda como FILA, no como un toast que se va. Sin rastro, "el coach no dijo nada
    // esta semana" es indistinguible de "el coach falló" — y son dos problemas distintos.
    try {
      const attempt = ((await dbGetAll('coach_reviews').catch(() => [])) || [])
        .filter((r) => r && r.weekKey === wk).length + 1;
      await dbPut('coach_reviews', {
        id: `${wk}#local-${attempt}`, weekKey: wk, attempt, status: 'failed',
        createdAt: Date.now(), local: true,
        error: { kind: 'invoke', message: String((e && e.message) || e).slice(0, 400) },
      });
    } catch (e2) { /* si ni eso se puede escribir, queda el console.warn */ }
    if (typeof toast === 'function') toast(`The coach failed: ${(e && e.message) || 'error'}`);
    try { await renderCoachWeekCard(); } catch (e2) {}
    return null;
  } finally {
    _coachInvoking = false;
  }
}

/** Refleja en IDB una fila que ESCRIBIÓ la función (siempre `dbPut`, nunca `smartPut`). */
async function _coachMirror(row) {
  if (!row || !row.id) return null;
  const prev = await dbGet('coach_reviews', row.id).catch(() => null);
  const merged = Object.assign({}, prev || {}, row);
  // La respuesta viene SIN `facts` (los mandó el cliente; devolverlos son 30 KB de eco). Si la
  // fila local ya los tenía, se conservan: son el contexto del validador al aplicar.
  if (!merged.facts && prev && prev.facts) merged.facts = prev.facts;
  delete merged.ok;         // envoltorio de la respuesta HTTP, no campos de la fila
  delete merged.reviewId;
  delete merged.cached;
  delete merged.local;
  await dbPut('coach_reviews', merged);
  return merged;
}

let _coachPoll = null;
let _coachPollGaveUp = null;
let _coachVisBound = false;

/**
 * Polling de la fila propia (por RLS) cada 5 s hasta 5 min.
 *
 * SE PARA AL OCULTAR LA PESTAÑA y se retoma al volver: iOS congela los timers de una PWA en
 * segundo plano, así que seguir programando `setTimeout` sólo consigue que al reabrir se
 * disparen todos de golpe. Y si se agota el plazo NO se pierde nada: la fila la trae el pull de
 * `syncAll` en la siguiente apertura.
 */
function pollCoachReview(reviewId) {
  if (!reviewId) return;
  if (_coachPoll && _coachPoll.reviewId === reviewId) return;
  _coachStopPoll();
  _coachPollGaveUp = null;
  _coachPoll = { reviewId, until: Date.now() + COACH_POLL_MAX_MS, started: Date.now(), timer: null };
  _coachBindVisibility();
  _coachSchedulePoll(0);
}

function _coachSchedulePoll(ms) {
  if (!_coachPoll) return;
  _coachPoll.timer = setTimeout(() => { _coachPollTick().catch(() => {}); }, ms);
}

function _coachStopPoll(keepState) {
  if (_coachPoll && _coachPoll.timer) clearTimeout(_coachPoll.timer);
  if (_coachPoll) _coachPoll.timer = null;
  if (!keepState) _coachPoll = null;
}

function _coachBindVisibility() {
  if (_coachVisBound || typeof document === 'undefined' || !document.addEventListener) return;
  _coachVisBound = true;
  document.addEventListener('visibilitychange', () => {
    if (!_coachPoll) return;
    if (document.visibilityState === 'hidden') { _coachStopPoll(true); return; }
    if (!_coachPoll.timer) _coachSchedulePoll(0);
  });
}

async function _coachPollTick() {
  const p = _coachPoll;
  if (!p) return;
  p.timer = null;
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return; // se retoma al volver
  if (Date.now() > p.until) {
    _coachPollGaveUp = p.reviewId;
    _coachStopPoll();
    try { await renderCoachWeekCard(); } catch (e) {}
    return;
  }
  try {
    const supa = (typeof getSupaClient === 'function') ? getSupaClient() : null;
    if (!supa) { _coachStopPoll(); return; }
    const { data, error } = await supa.from('coach_reviews')
      .select('data').eq('record_id', p.reviewId).maybeSingle();
    const row = (!error && data) ? data.data : null;
    if (row && row.status && row.status !== 'running') {
      _coachStopPoll();
      await _coachMirror(row);
      try { await renderCoachWeekCard(); } catch (e) {}
      try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
      if (typeof toast === 'function') {
        toast(row.status === 'proposed'
          ? "The coach has this week's proposal ready"
          : `Coach review: ${COACH_STATUS_LABEL[row.status] || row.status}`);
      }
      return;
    }
  } catch (e) {
    console.warn('[Coach] poll:', e);
  }
  // Repintar sólo el contador de la tarjeta (sin reconstruirla: el usuario podría estar leyendo).
  try {
    const t = document.getElementById('coach-week-elapsed');
    if (t) t.textContent = _coachElapsed(p.started);
  } catch (e) {}
  _coachSchedulePoll(COACH_POLL_MS);
}

function _coachElapsed(sinceMs) {
  const s = Math.max(0, Math.round((Date.now() - (sinceMs || Date.now())) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// ==================== LA REVISIÓN VIGENTE ====================

/** La revisión más reciente: por semana ISO descendente y, dentro de la semana, por intento. */
async function _coachLatestReview() {
  const rows = await dbGetAll('coach_reviews').catch(() => []);
  const ts = (r) => (r.updatedAt ? Date.parse(r.updatedAt) || 0 : 0) || Number(r.createdAt || 0) || 0;
  const sorted = (rows || []).filter((r) => r && r.id).sort((a, b) =>
    String(b.weekKey || '').localeCompare(String(a.weekKey || ''))
    || (Number(b.attempt || 0) - Number(a.attempt || 0))
    || (ts(b) - ts(a)));
  return sorted[0] || null;
}

/**
 * Una propuesta de una semana anterior VENCE. Aplicar el lunes siguiente los kg que el coach
 * calculó con los datos de la semana pasada es prescribir sobre hechos caducados — y peor: sin
 * esto, la tarjeta seguiría ofreciendo "Aplicar" indefinidamente.
 *
 * `smartPut` y no `dbPut`: vencer es una decisión de la APP sobre el dato del usuario, y tiene
 * que llegar al otro dispositivo para que no ofrezca aplicar una propuesta muerta.
 */
async function _coachExpireIfStale(review) {
  if (!review || (review.status !== 'proposed' && review.status !== 'requested')) return review;
  const wk = _cWeekKey(today());
  if (!wk || !review.weekKey || String(review.weekKey) >= String(wk)) return review;
  const row = Object.assign({}, review, { status: 'expired', updatedAt: new Date().toISOString() });
  try { await smartPut('coach_reviews', row); } catch (e) { console.warn('[Coach] expire:', e); }
  return row;
}

// ==================== APROBACIÓN ====================

/** `ctx` del validador. Cada trozo que falte hace que su chequeo se SALTE, nunca que lance. */
async function _coachValidateCtx(review, prev) {
  const lib = (typeof exerciseLibrary !== 'undefined' && exerciseLibrary) || {};
  const plan = prev || {};
  const libraryIds = new Set(Object.keys(lib));
  for (const s of Object.values(plan.sessions || {})) {
    for (const ex of (s.exercises || [])) if (ex && ex.id) libraryIds.add(ex.id);
  }
  // Sesiones "de pierna" para RUN-BEFORE-LEGS: `full` e `hybrid` también cargan las piernas.
  const lowerSessionIds = new Set();
  try {
    const map = (typeof sessionClassMap === 'function') ? sessionClassMap() : {};
    for (const [sid, cls] of Object.entries(map || {})) {
      if (cls && (cls.subtype === 'lower' || cls.subtype === 'full' || cls.family === 'hybrid')) lowerSessionIds.add(sid);
    }
  } catch (e) { /* sin el mapa, el chequeo se salta */ }

  let facts = review && review.facts ? review.facts : null;
  if (!facts) { try { facts = await buildCoachFactsFromStores(); } catch (e) { facts = null; } }

  let bodyweightKg = null;
  try {
    const bw = (await dbGetAll('bodyweight').catch(() => [])) || [];
    const last = bw.filter((r) => r && r.date && Number(r.weight) > 0)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
    if (last) bodyweightKg = Number(last.weight);
  } catch (e) { bodyweightKg = null; }

  const blk = (typeof blockWeek === 'function') ? blockWeek() : null;
  return {
    basedOn: prev || null,
    facts,
    variant: (typeof _idealVariant === 'function') ? _idealVariant() : null,
    libraryIds,
    lowerSessionIds,
    exerciseLibrary: lib,
    block: blk,
    isDeload: !!(blk && blk.isDeload),
    bodyweightKg,
    goals: (state && state.settings && state.settings.goals) || null,
    zones: (typeof _runningZones === 'function') ? _runningZones() : null,
    decisions: ((review || {}).output || {}).decisions || [],
    briefing: ((review || {}).output || {}).briefing || null,
    // E-18: el reloj del piloto de kcal, para que `KCAL-STEP` pueda comprobar los 14 días
    // sin depender de que el pack traiga la ventana calculada.
    kcalTarget: (() => {
      const v = Number((state && state.settings && state.settings.kcalLastAdjustValue));
      return isFinite(v) && v > 0 ? v : null;
    })(),
    kcalLastAdjustDate: (state && state.settings && state.settings.kcalLastAdjustDate) || null,
    daysSinceKcalAdjust: (() => {
      const d = state && state.settings && state.settings.kcalLastAdjustDate;
      if (!d) return null;
      const n = Math.round((Date.parse(today() + 'T12:00:00') - Date.parse(d + 'T12:00:00')) / 86400000);
      return isFinite(n) ? n : null;
    })(),
    todayStr: today(),
  };
}

/**
 * Aplica la propuesta: merge → guardarraíles → NUEVA versión de plan → la anterior a
 * `superseded` → overrides → overrides de calendario → revisión a `applied` → decisión.
 *
 * EL ORDEN IMPORTA. La versión nueva se crea ANTES de marcar la anterior: si el proceso muere
 * en medio, el peor caso es dos filas `active` (y "activa = versión más alta" desempata solo).
 * Al revés, el peor caso sería quedarse sin ninguna.
 */
async function applyCoachProposal(review) {
  if (!review || !review.output || !review.output.proposal) {
    if (typeof toast === 'function') toast('That review carries no proposal');
    return null;
  }
  if (typeof mergeProposal !== 'function' || typeof createNewPlanVersion !== 'function') {
    if (typeof toast === 'function') toast('Cannot apply: coach-facts.js is missing');
    return null;
  }
  try {
    const prev = (typeof activePlan !== 'undefined') ? activePlan : null;

    // ── E-15 · LA BASE PUEDE HABER CAMBIADO DESDE QUE SE PIDIÓ LA REVISIÓN ──────────
    //
    // El diff se mergea contra el `activePlan` DEL MOMENTO DE APLICAR, no contra la versión
    // que el coach tenía delante cuando lo escribió. Entre la propuesta del domingo y el toque
    // del lunes cabe un `setIdealVariant` (pasar de 4 a 5 días) o un rollback: el "sube la
    // banca a 95" se estampa sobre otra base y nadie se entera. Se compara con la versión que
    // viaja en el pack (`facts.plan.version`) y, si no coinciden, se pregunta.
    const baseVersion = (() => {
      const v = review && review.facts && review.facts.plan ? Number(review.facts.plan.version) : NaN;
      return isFinite(v) ? v : null;
    })();
    const nowVersion = (prev && prev.version != null) ? Number(prev.version) : null;
    if (baseVersion != null && nowVersion != null && baseVersion !== nowVersion) {
      const msg = `The plan changed since this review (v${baseVersion} → v${nowVersion}). Apply anyway?`;
      const seguir = (typeof confirm === 'function') ? confirm(msg) : true;
      if (!seguir) {
        if (typeof toast === 'function') toast('Not applied — regenerate the review on the current plan');
        return null;
      }
    }

    const merged = mergeProposal(prev, review.output.proposal);
    const ctx = await _coachValidateCtx(review, prev);
    const diff = diffPlanVersions(prev || {}, merged);
    // EL BRIEF SE CONSTRUYE ANTES DE VALIDAR, a propósito: `WEEK-SUMMARY` comprueba que cada
    // sesión del plan lleve su fila, y sin el brief dentro del objeto que se valida ese aviso
    // no podría dispararse nunca.
    const coachBrief = Object.assign(
      coachBriefFromReview(review, { prev, next: merged, diff }),
      { appliedAt: Date.now() },
    );
    let guardrails = [];
    try {
      guardrails = validatePlanVersion(Object.assign({}, merged, { coachBrief }), ctx) || [];
    } catch (e) { console.warn('[Coach] validator:', e); }
    const blk = (typeof blockWeek === 'function') ? blockWeek() : null;

    // ── E-16 · LO QUE APLICAR VA A BORRAR, GUARDADO ANTES DE BORRARLO ───────────────
    //
    // `_coachReconcileOverrides` limpia los swaps de ejercicio que el plan nuevo absorbió y
    // `clearFutureScheduleOverrides` borra los cambios de día hechos a mano. Las dos cosas
    // están bien al aplicar — y eran irreversibles: el rollback restauraba `sessions` y
    // `weekTemplate` pero no los overrides, así que Deshacer devolvía el plan viejo SIN los
    // cambios manuales que el usuario tenía encima. Se guarda una instantánea en la versión
    // nueva; `rollbackPlanVersion` la restaura si está.
    const preApply = {
      exerciseOverrides: (typeof exerciseOverrides === 'object' && exerciseOverrides)
        ? JSON.parse(JSON.stringify(exerciseOverrides)) : {},
      weekSchedule: await (async () => {
        try {
          return (typeof getWeekSchedule === 'function') ? (await getWeekSchedule()) || {} : {};
        } catch (e) { return {}; }
      })(),
    };

    const nuevo = await createNewPlanVersion({
      label: `Coach · ${review.weekKey || _cWeekKey(today())}`,
      weekNumber: (typeof getWeekNumber === 'function') ? getWeekNumber() : undefined,
      sessions: merged.sessions,
      weekTemplate: merged.weekTemplate,
      meta: {
        schema: 2, status: 'active', author: 'coach-llm',
        basedOn: (prev && prev.id) || null,
        weekKey: review.weekKey || null,
        reviewId: review.id || null,
        // E-15: qué base tenía delante el coach y sobre qué base se aplicó de verdad. Sin las
        // dos, "por qué el plan v16 dice esto" no se puede reconstruir.
        baseVersion,
        appliedOnVersion: nowVersion,
        // E-16: los overrides que este apply está a punto de limpiar.
        preApply,
        block: merged.block || blk,
        phase: merged.phase || null,
        running: merged.running || null,
        seedRev: (typeof PLAN_REV !== 'undefined') ? PLAN_REV : null,
        // v11.65: el brief viaja DENTRO del plan. `meta` se esparce al nivel superior de la
        // versión (`createNewPlanVersion`), así que queda como `activePlan.coachBrief`;
        // `id`/`version`/`createdAt` se reafirman después del spread y no se pueden pisar.
        coachBrief,
      },
    });

    // Sólo metadatos sobre la fila anterior: `sessions`/`weekTemplate` se quedan como estaban,
    // que es lo que permite volver a ella. Nunca se borra una versión.
    if (prev && prev.id) {
      try {
        await smartPut('plans', Object.assign({}, prev, { status: 'superseded', supersededBy: nuevo.id }));
      } catch (e) { console.warn('[Coach] superseded:', e); }
    }

    // ── E-18 · EL PILOTO DE KCAL EMPIEZA A TENER RELOJ ─────────────────────────────
    //
    // `settings.kcalFirstAdjustDate` / `kcalLastAdjustDate` no existían, así que
    // `progress.weight.validWindow.nextEligibleAdjustDate` era `null` SIEMPRE y el gate de los
    // 14 días entre ajustes (`KCAL-STEP`, REC-002) no se podía comprobar: "el ritmo es un dial
    // gobernado por el rendimiento" era prosa. Aplicar una propuesta que toca las kcal es el
    // momento en que el ajuste ocurre, así que es aquí donde se sella la fecha.
    //
    // SÓLO SI EL NÚMERO CAMBIA. Si el coach repite el mismo objetivo cada domingo —lo normal
    // cuando no hay que tocar nada— y esto reescribiera la fecha, el reloj de 14 días se
    // reiniciaría cada semana y el gate no dispararía nunca. Se compara con el último valor
    // sellado (`kcalLastAdjustValue`).
    try {
      const prop = (review.output && review.output.proposal) || {};
      const nut = prop.nutrition || {};
      const kcal = Number(nut.kcalTarget != null ? nut.kcalTarget : nut.kcal);
      if (isFinite(kcal) && kcal > 0 && typeof state !== 'undefined' && state.settings) {
        const anterior = Number(state.settings.kcalLastAdjustValue);
        if (!isFinite(anterior) || anterior !== kcal) {
          const ds = today();
          state.settings = Object.assign({}, state.settings, {
            kcalLastAdjustDate: ds,
            kcalLastAdjustValue: kcal,
            kcalFirstAdjustDate: state.settings.kcalFirstAdjustDate || ds,
          });
          // La misma ruta de escritura que Ajustes: `userSettings` sí se sincroniza, así que
          // el pack del domingo siguiente lee la fecha desde cualquier dispositivo.
          await smartPut('settings', { key: 'userSettings', data: state.settings });
        }
      }
    } catch (e) { console.warn('[Coach] kcal adjust dates:', e); }

    await _coachReconcileOverrides(merged);
    // Los overrides de calendario por fecha sólo se limpian si el TEMPLATE cambió: si el coach
    // sólo tocó kg y series, borrar los cambios de día que el usuario hizo a mano sería
    // deshacerle trabajo por nada.
    if (diff.weekTemplate && diff.weekTemplate.length > 0 && typeof clearFutureScheduleOverrides === 'function') {
      try { await clearFutureScheduleOverrides(); } catch (e) {}
    }

    const row = Object.assign({}, review, {
      status: 'applied', appliedPlanId: nuevo.id, appliedAt: Date.now(),
      updatedAt: new Date().toISOString(), guardrails,
    });
    try { await smartPut('coach_reviews', row); } catch (e) { console.warn('[Coach] review applied:', e); }

    const ruleIds = [];
    for (const d of (((review.output || {}).decisions) || [])) {
      for (const r of (d.ruleIds || [])) if (ruleIds.indexOf(r) === -1) ruleIds.push(r);
    }
    if (typeof logDecision === 'function') {
      await logDecision({
        source: 'user', type: 'plan-apply',
        what: `Plan v${nuevo.version} applied from review ${review.weekKey || ''}`.trim(),
        why: 'Approved with one tap',
        ruleIds,
        evidence: {
          // v11.65: el foco, la fase y el reparto sigue/cambia entran en la decisión. Sin
          // esto, el registro decía "plan v15 aplicado" y no de qué iba la semana.
          focus: coachBrief.focus || 'no focus declared',
          phase: coachBrief.phase || 'no phase',
          kept: (coachBrief.weekSummary || []).filter((w) => w.status === 'kept').length,
          changed: (coachBrief.weekSummary || []).filter((w) => w.status !== 'kept').length,
          sessionsTouched: (merged.touched || []).join(', ') || 'none',
          structuralChanges: diff.structural,
          templateDays: (diff.weekTemplate || []).length,
          warnings: guardrails.map((g) => g.id).join(', ') || 'none',
          hardWarnings: guardrails.filter((g) => g.level === 'hard').length,
        },
        ref: { planVersion: nuevo.version, reviewId: review.id || null },
        outcome: 'accepted',
      });
    }

    const duros = guardrails.filter((g) => g.level === 'hard').length;
    if (typeof toast === 'function') {
      toast(`Plan v${nuevo.version} active${guardrails.length ? ` · ${guardrails.length} warning${guardrails.length === 1 ? '' : 's'}${duros ? ` (${duros} in red)` : ''}` : ' · no warnings'}`);
    }
    try { if (typeof renderHomeView === 'function') await renderHomeView(); } catch (e) {}
    try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
    return nuevo;
  } catch (e) {
    console.warn('[Coach] applyCoachProposal:', e);
    if (typeof toast === 'function') toast(`Could not apply: ${(e && e.message) || 'error'}`);
    return null;
  }
}

/** Rechazo explícito: la propuesta queda archivada con su motivo y entra en `priorReviews`. */
async function rejectCoachProposal(review, reason) {
  if (!review || !review.id) return null;
  try {
    const row = Object.assign({}, review, {
      status: 'rejected', rejectedReason: reason || null, updatedAt: new Date().toISOString(),
    });
    await smartPut('coach_reviews', row);
    if (typeof logDecision === 'function') {
      await logDecision({
        source: 'user', type: 'plan-reject',
        what: `Proposal for ${review.weekKey || 'this week'} rejected`,
        why: reason || 'No reason given',
        ruleIds: [],
        evidence: {
          priorities: ((((review.output || {}).briefing) || {}).priorities || []).join(' · ') || 'none',
          decisions: (((review.output || {}).decisions) || []).length,
        },
        ref: { reviewId: review.id },
        outcome: 'declined',
      });
    }
    if (typeof toast === 'function') toast('Proposal rejected — the plan stays as it is');
    try { await renderCoachWeekCard(); } catch (e) {}
    try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
    return row;
  } catch (e) {
    console.warn('[Coach] rejectCoachProposal:', e);
    if (typeof toast === 'function') toast('Could not reject');
    return null;
  }
}

/**
 * Vuelve a una versión anterior creando una NUEVA versión que la copia.
 *
 * NO re-activa la fila vieja, a propósito: el invariante "plan activo = versión más alta" lo
 * aplican también los dispositivos con código viejo, que no miran `status`. Reactivar la v13
 * dejaría la v14 como plan vivo en el que no se haya actualizado. Copiarla como v15 funciona en
 * todas partes y no borra nada — el historial es la explicación del plan.
 */
async function rollbackPlanVersion(toId) {
  if (!toId) return null;
  try {
    const rows = await dbGetAll('plans').catch(() => []);
    const old = (rows || []).find((p) => p && p.id === toId);
    if (!old) { if (typeof toast === 'function') toast('Cannot find that version'); return null; }
    const prev = (typeof activePlan !== 'undefined') ? activePlan : null;
    if (prev && prev.id === toId) { if (typeof toast === 'function') toast('That version is already active'); return null; }
    const base = old.label || old.id;
    const label = /\(restored\)\s*$/.test(base) ? base : `${base} (restored)`;
    const nuevo = await createNewPlanVersion({
      label,
      weekNumber: (typeof getWeekNumber === 'function') ? getWeekNumber() : undefined,
      sessions: old.sessions,
      weekTemplate: old.weekTemplate,
      meta: {
        schema: 2, status: 'active', author: 'user',
        basedOn: toId,
        rolledBackFrom: (prev && prev.id) || null,
        weekKey: old.weekKey || null,
        block: (typeof blockWeek === 'function') ? blockWeek() : null,
        running: old.running || null,
        seedRev: (typeof PLAN_REV !== 'undefined') ? PLAN_REV : null,
        // v11.65: el brief viaja con la versión que se copia. Deshacer no puede dejar el plan
        // sin explicación: si la v13 tenía su "por qué se mantiene", la v15 que la restaura
        // también lo tiene. Sin esto, un Deshacer vaciaría la Home.
        coachBrief: old.coachBrief || null,
      },
    });
    if (prev && prev.id) {
      try {
        await smartPut('plans', Object.assign({}, prev, { status: 'superseded', supersededBy: nuevo.id }));
      } catch (e) { console.warn('[Coach] superseded (rollback):', e); }
    }

    // ── E-16 · DESHACER DEVUELVE TAMBIÉN LOS OVERRIDES ─────────────────────────────
    //
    // La instantánea la guardó `applyCoachProposal` en la versión que se está deshaciendo
    // (`prev.preApply`): son los swaps de ejercicio y los cambios de día que ese apply borró.
    // Se restauran desde la versión QUE SE DESHACE, no desde la que se restaura: lo que había
    // encima del plan v13 cuando el coach lo sustituyó es lo que hay que devolver.
    let restaurados = null;
    const snap = (prev && prev.preApply) || null;
    if (snap) {
      try {
        if (snap.exerciseOverrides && typeof exerciseOverrides === 'object') {
          for (const k of Object.keys(exerciseOverrides)) delete exerciseOverrides[k];
          Object.assign(exerciseOverrides, JSON.parse(JSON.stringify(snap.exerciseOverrides)));
          await smartPut('settings', { key: 'exerciseOverrides', data: exerciseOverrides });
        }
        if (snap.weekSchedule && typeof saveWeekSchedule === 'function') {
          await saveWeekSchedule(JSON.parse(JSON.stringify(snap.weekSchedule)));
        }
        restaurados = {
          swaps: Object.keys(snap.exerciseOverrides || {}).length,
          dias: Object.keys(snap.weekSchedule || {}).length,
        };
      } catch (e) { console.warn('[Coach] preApply on rollback:', e); }
    }

    if (typeof logDecision === 'function') {
      await logDecision({
        source: 'user', type: 'plan-rollback',
        what: `Rolled back to "${base}" as v${nuevo.version}`,
        why: 'The user undid the active plan',
        ruleIds: [],
        evidence: {
          from: (prev && prev.label) || null,
          fromVersion: (prev && prev.version) != null ? prev.version : null,
          to: toId,
          overridesRestored: restaurados
            ? `${restaurados.swaps} swap(s) and ${restaurados.dias} calendar day(s)`
            : 'no prior snapshot',
        },
        ref: { planVersion: nuevo.version },
        outcome: 'done',
      });
    }
    if (typeof toast === 'function') toast(`Restored as v${nuevo.version}`);
    try { if (typeof renderHomeView === 'function') await renderHomeView(); } catch (e) {}
    try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
    return nuevo;
  } catch (e) {
    console.warn('[Coach] rollbackPlanVersion:', e);
    if (typeof toast === 'function') toast('Could not restore');
    return null;
  }
}

/**
 * Los swaps de ejercicio, después de que el coach reescriba la semana. Tres casos:
 *   · la sesión nueva ya trae el sustituto y no el original → ABSORBIDO, el override se borra;
 *   · el original sigue en la sesión → el swap sigue teniendo sentido, se conserva;
 *   · ni uno ni otro (el hueco desapareció) → se borra.
 * Sin esto, un override sobre un ejercicio que ya no está en la sesión es un fantasma que
 * `resolveSessionExercises` no aplica nunca y que nadie puede quitar desde la interfaz.
 */
async function _coachReconcileOverrides(merged) {
  try {
    if (typeof exerciseOverrides !== 'object' || !exerciseOverrides) return;
    let changed = false;
    for (const sid of Object.keys(exerciseOverrides)) {
      const ov = exerciseOverrides[sid] || {};
      const sess = ((merged && merged.sessions) || {})[sid] || null;
      const ids = sess ? (sess.exercises || []).map((e) => e.id) : [];
      for (const origId of Object.keys(ov)) {
        const sub = ov[origId] || {};
        if (!sess) { delete ov[origId]; changed = true; continue; }
        if (sub.id && ids.indexOf(sub.id) !== -1 && ids.indexOf(origId) === -1) { delete ov[origId]; changed = true; continue; }
        if (ids.indexOf(origId) !== -1) continue;
        delete ov[origId]; changed = true;
      }
      if (!Object.keys(ov).length) { delete exerciseOverrides[sid]; changed = true; }
    }
    if (changed) await smartPut('settings', { key: 'exerciseOverrides', data: exerciseOverrides });
  } catch (e) {
    console.warn('[Coach] overrides after apply:', e);
  }
}

// ==================== EL DIFF, PARA PANTALLA ====================

function _coachSlotLabel(slot) {
  if (!slot || slot.type === 'rest') return 'rest';
  if (slot.type === 'gym') {
    const s = (typeof activePlan !== 'undefined' && activePlan && activePlan.sessions) ? activePlan.sessions[slot.session] : null;
    return (s && s.name) || slot.session || 'gym';
  }
  if (slot.type === 'run') return slot.label || 'cardio';
  if (slot.type === 'recovery') return slot.label || 'recovery';
  return slot.type;
}

function _coachExName(sid, id, prev, merged) {
  const pick = (plan) => (((plan || {}).sessions || {})[sid] || {}).exercises || [];
  const hit = pick(merged).find((e) => e.id === id) || pick(prev).find((e) => e.id === id);
  if (hit && hit.name) return hit.name;
  const lib = (typeof exerciseLibrary !== 'undefined' && exerciseLibrary) || {};
  if (lib[id] && lib[id].name) return lib[id].name;
  return (typeof getExerciseName === 'function') ? getExerciseName(id) : id;
}

/**
 * El diff agrupado por sesión, listo para pintar. `kind` decide el color de la fila:
 * `up` sube, `down` baja, `add` entra, `remove` sale.
 */
function coachDiffGroups(prev, merged) {
  const d = diffPlanVersions(prev || {}, merged || {});
  const groups = [];
  const nombreSesion = (sid) => {
    const a = ((prev || {}).sessions || {})[sid];
    const b = ((merged || {}).sessions || {})[sid];
    return (b && b.name) || (a && a.name) || sid;
  };
  for (const [sid, s] of Object.entries(d.sessions || {})) {
    const items = [];
    for (const id of (s.added || [])) items.push({ kind: 'add', text: `+ ${_coachExName(sid, id, prev, merged)}` });
    for (const id of (s.removed || [])) items.push({ kind: 'remove', text: `− ${_coachExName(sid, id, prev, merged)}` });
    if (s.reordered) items.push({ kind: 'add', text: 'new order' });
    for (const c of (s.setsChanged || [])) {
      items.push({ kind: (c.to > c.from ? 'up' : 'down'), text: `${_coachExName(sid, c.exId, prev, merged)} · ${c.from} → ${c.to} sets` });
    }
    for (const t of (s.targets || [])) {
      const nom = _coachExName(sid, t.exId, prev, merged);
      if (t.fromKg != null || t.toKg != null) {
        const kind = (t.toKg != null && t.fromKg != null && t.toKg < t.fromKg) ? 'down' : 'up';
        const igual = t.toKg != null && t.fromKg === t.toKg;
        items.push({ kind, text: `${nom} · ${_cKg(t.fromKg)} → ${_cKg(t.toKg)} kg${igual ? ' (=)' : ''}` });
      } else if ((t.fromReps || null) !== (t.toReps || null)) {
        items.push({ kind: 'up', text: `${nom} · ${t.fromReps || '—'} → ${t.toReps || '—'} reps` });
      } else {
        items.push({ kind: 'up', text: `${nom} · RPE ${t.fromRpe || '—'} → ${t.toRpe || '—'}` });
      }
    }
    if (s.focusChanged) items.push({ kind: 'add', text: 'new focus' });
    if (s.sessionAdded) items.push({ kind: 'add', text: 'new session' });
    if (s.sessionRemoved) items.push({ kind: 'remove', text: 'session removed' });
    if (items.length) groups.push({ session: nombreSesion(sid), items });
  }
  const semana = [];
  for (const t of (d.weekTemplate || [])) {
    const sale = !t.to || t.to.type === 'rest';
    semana.push({ kind: sale ? 'remove' : 'add', text: `${COACH_DOW_LABEL[t.dow]} · ${_coachSlotLabel(t.from)} → ${_coachSlotLabel(t.to)}` });
  }
  if (d.running) {
    const a = d.running.from || {}, b = d.running.to || {};
    if ((a.weeklyKmTarget || null) !== (b.weeklyKmTarget || null)) {
      semana.push({ kind: (Number(b.weeklyKmTarget) > Number(a.weeklyKmTarget || 0) ? 'up' : 'down'), text: `Running · ${a.weeklyKmTarget != null ? a.weeklyKmTarget : '—'} → ${b.weeklyKmTarget != null ? b.weeklyKmTarget : '—'} km/wk` });
    }
    if ((a.longRunKm || null) !== (b.longRunKm || null)) {
      semana.push({ kind: (Number(b.longRunKm) > Number(a.longRunKm || 0) ? 'up' : 'down'), text: `Long run · ${a.longRunKm != null ? a.longRunKm : '—'} → ${b.longRunKm != null ? b.longRunKm : '—'} km` });
    }
  }
  for (const dow of (merged && merged.cardioDays) || []) {
    const c = ((merged.weekTemplate || {})[dow] || {}).cardio || {};
    if (c.durationMin != null) semana.push({ kind: 'up', text: `${COACH_DOW_LABEL[dow]} · ${c.subtype || 'zone2'} ${c.durationMin}′` });
  }
  if (semana.length) groups.push({ session: 'Week', items: semana });
  return { diff: d, groups };
}

function _coachDiffHtml(groups, max) {
  if (!groups || !groups.length) return '<div class="coach-week-empty">No structural changes.</div>';
  const lim = max || 0;
  let pintados = 0;
  const out = [];
  for (const g of groups) {
    const items = lim ? g.items.slice(0, Math.max(0, lim - pintados)) : g.items;
    if (!items.length) continue;
    pintados += items.length;
    out.push(`<div class="coach-diff-group">
      <div class="coach-diff-session">${_cEsc(g.session)}</div>
      ${items.map((i) => `<div class="coach-diff-row -${i.kind}">${_cEsc(i.text)}</div>`).join('')}
    </div>`);
    if (lim && pintados >= lim) break;
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  if (lim && total > pintados) out.push(`<div class="coach-week-more">+${total - pintados} more change${total - pintados === 1 ? '' : 's'} in the Coach view</div>`);
  return out.join('');
}

function _coachGuardChipsHtml(guardrails) {
  const gs = (guardrails || []).filter((g) => g && g.id);
  if (!gs.length) return '';
  return `<div class="coach-week-chips">${gs.map((g) => {
    const dur = g.level === 'hard';
    return `<span class="coach-week-chip ${dur ? '-hard' : '-warn'}" title="${_cEsc(g.text || '')}">${_cEsc(COACH_GUARD_LABEL[g.id] || g.id)}</span>`;
  }).join('')}</div>`;
}

// Los avisos de una propuesta pendiente, MEMOIZADOS por (reviewId, versión del plan).
//
// POR QUÉ LA CACHÉ. La respuesta HTTP de la función viene sin `facts` (los mandó el cliente), así
// que hasta que `syncAll` traiga la fila completa el contexto del validador hay que
// reconstruirlo — y eso son los 10 stores enteros. Sin memoizar, cada vez que se pinta Home
// (cada cambio de pestaña) se reconstruiría el pack completo para pintar cinco chips.
//
// La clave incluye la versión del plan activo porque los avisos son relativos a ÉL: en cuanto
// se aplica una versión nueva, el diff y los avisos son otros.
const _coachGuardCache = new Map();

/** Los avisos de una propuesta que aún no se ha aplicado. */
async function _coachPreviewGuardrails(review, prev, merged) {
  if (Array.isArray(review.guardrails) && review.guardrails.length) return review.guardrails;
  if (typeof validatePlanVersion !== 'function') return [];
  const key = `${review.id}@${(prev && prev.version) != null ? prev.version : '-'}`;
  if (_coachGuardCache.has(key)) return _coachGuardCache.get(key);
  try {
    const ctx = await _coachValidateCtx(review, prev);
    // Con el brief dentro, para que `WEEK-SUMMARY` se vea ANTES de aplicar y no después.
    const brief = coachBriefFromReview(review, { prev, next: merged, diff: diffPlanVersions(prev || {}, merged) });
    const out = validatePlanVersion(Object.assign({}, merged, { coachBrief: brief }), ctx) || [];
    _coachGuardCache.set(key, out);
    // Un par de entradas bastan (la revisión de esta semana y la anterior); el mapa no crece.
    if (_coachGuardCache.size > 4) _coachGuardCache.delete(_coachGuardCache.keys().next().value);
    return out;
  } catch (e) {
    console.warn('[Coach] guardrails (preview):', e);
    return [];
  }
}

// ==================== CERRAR LA SEMANA ====================
//
// EL BOTÓN QUE FALTABA. Hasta v11.64 la única forma de tener una revisión era esperar a que la
// app se abriera un lunes (`maybeRunWeeklyCoach`). Julian entrena el domingo y quiere cerrar la
// semana cuando la termina, no cuando el calendario lo diga. "Cerrar semana y pedir la próxima"
// es ese gesto: la revisión es PARA `coachTargetWeekKey(hoy)` —el domingo, la que viene— y
// SOBRE todo lo anterior.
//
// El estado `running` va en el propio botón (texto + `disabled`) y no en un spinner aparte:
// la respuesta tarda 60-180 s y sin marca visible el usuario pulsa dos veces.

const COACH_CLOSE_WEEK_LABEL = 'Close the week and ask for the next';

function _coachCloseWeekBtn(id, label) {
  return `<button class="coach-btn coach-close-week" id="${id || 'coach-close-week'}">${_cEsc(label || COACH_CLOSE_WEEK_LABEL)}</button>`;
}

function _coachBindCloseWeek(id) {
  const b = document.getElementById(id || 'coach-close-week');
  if (!b) return;
  b.addEventListener('click', async () => {
    if (b.dataset && b.dataset.running === '1') return;
    const antes = b.textContent;
    if (b.dataset) b.dataset.running = '1';
    b.disabled = true;
    b.textContent = 'Closing the week…';
    try {
      await runWeeklyCoach({ weekKey: _cTargetWeek(today()) });
    } finally {
      // La tarjeta se repinta sola al terminar; restaurar el botón sólo importa si sigue vivo.
      if (b.dataset) b.dataset.running = '0';
      b.disabled = false;
      b.textContent = antes;
    }
  });
}

// ==================== TARJETA DE HOME ====================
//
// Estados: `none` (primera semana, con el botón de cerrar) · `running` con su contador ·
// `proposed` con el foco, las 3 prioridades, el porqué, el diff, los chips y los tres botones ·
// `applied` con SEMANA PASADA / ESTA SEMANA / POR QUÉ y los desplegables · `failed` con la
// causa · `expired`/`rejected` con una línea y el botón de cerrar.
//
// v11.65: LA TARJETA SIEMPRE SE PINTA. Antes, sin revisión, Home no decía nada del coach y no
// había forma de pedirle la primera — el estado vacío era también el callejón sin salida.
//
// DE DÓNDE SALE EL TEXTO. Si el plan activo viene de ESTA revisión (`activePlan.reviewId ===
// review.id`), del `coachBrief` que se estampó al aplicar; si no, del `output` de la revisión
// con el fallback para v1. El plan manda porque es lo que está vigente: la revisión se puede
// podar y el plan no.
async function renderCoachWeekCard(opts = {}) {
  const el = document.getElementById('coach-week-card');
  if (!el) return;
  try {
    el.classList.remove('hidden');
    const objetivo = _cTargetWeek(today());
    if (opts.pending) {
      el.innerHTML = `<div class="card coach-week-card">
        <div class="coach-week-head"><span class="coach-week-title">Coach · ${_cEsc(_cWeekShort(objetivo))}</span></div>
        <div class="coach-week-line">Building this week's facts…</div>
      </div>`;
      return;
    }
    let review = await _coachLatestReview();
    review = await _coachExpireIfStale(review);

    const wkTxt = _cEsc(_cWeekShort((review && review.weekKey) || objetivo));
    const plan = (typeof activePlan !== 'undefined' && activePlan) ? activePlan : null;
    const head = (extra, abrir) => `<div class="coach-week-head">
        <span class="coach-week-title">Coach · ${wkTxt}${extra || ''}</span>
        <button class="coach-week-open" id="coach-week-open">${_cEsc(abrir || 'Coach ›')}</button>
      </div>`;

    let cabecera = head();
    let cuerpo = '';
    let acciones = '';
    let cerrar = null;   // id del botón "cerrar semana" a cablear, si lo hay

    if (!review) {
      // ESTADO `none` — la primera semana, y el único sitio desde el que se puede arrancar.
      cuerpo = '<div class="coach-week-line">First week with the coach. On Sunday it closes the week, reads the trajectory and proposes the next one. Until then the routine does not change.</div>';
      acciones = _coachCloseWeekBtn('coach-close-week', 'Close the week now');
      cerrar = 'coach-close-week';
    } else if (review.status === 'running') {
      const desde = (_coachPoll && _coachPoll.reviewId === review.id) ? _coachPoll.started : Number(review.createdAt || Date.now());
      const rendido = _coachPollGaveUp === review.id;
      cuerpo = rendido
        ? '<div class="coach-week-line">Still running; come back later. The review will arrive with the next sync.</div>'
        : `<div class="coach-week-line">The coach is reviewing ${wkTxt}… <span id="coach-week-elapsed" class="coach-week-mono">${_coachElapsed(desde)}</span></div>`;
      if (rendido) acciones = '<button class="coach-btn" id="coach-week-regen">Regenerate</button>';
      else if (!_coachPoll || _coachPoll.reviewId !== review.id) pollCoachReview(review.id);
    } else if (review.status === 'requested') {
      // ESTADO `requested` (v11.69, modo manual): la semana está cerrada y su pack guardado; la
      // propuesta la escribe Claude Code desde la sesión. Un solo botón, y cuesta dinero a
      // propósito: pedírsela al modelo en vez de esperar.
      const cuando = review.requestedAt ? String(review.requestedAt).slice(0, 10) : null;
      const fecha = (cuando && typeof formatDate === 'function') ? formatDate(cuando) : cuando;
      cuerpo = `<div class="coach-week-line">Week ${wkTxt} closed${fecha ? ` on ${_cEsc(fecha)}` : ''} · waiting for the manual review from Claude Code. The facts pack is saved; the proposal will show up here once it is written.</div>`;
      acciones = '<button class="coach-btn" id="coach-week-ask-api">Ask the model instead</button>';
    } else if (review.status === 'proposed') {
      const prev = plan || {};
      const merged = (typeof mergeProposal === 'function') ? mergeProposal(prev, (review.output || {}).proposal || {}) : null;
      const { groups } = merged ? coachDiffGroups(prev, merged) : { groups: [] };
      const guardrails = merged ? await _coachPreviewGuardrails(review, prev, merged) : [];
      const brief = coachBriefFromReview(review, {
        prev, next: merged,
        diff: merged ? diffPlanVersions(prev, merged) : null,
      });
      const nextWeek = ((review.output || {}).briefing || {}).nextWeek;
      const prios = brief.priorities;
      cuerpo = `
        ${brief.focus ? `<div class="cwc-focus">Focus: ${_cEsc(brief.focus)}</div>` : ''}
        ${prios.length ? `<ol class="coach-week-prios">${prios.map((p) => `<li>${_cEsc(p)}</li>`).join('')}</ol>` : ''}
        ${_coachWhyHtml(brief, { plegado: true })}
        ${nextWeek ? `<details class="coach-week-next"><summary>Next week</summary><div class="coach-week-md">${_cMd(nextWeek)}</div></details>` : ''}
        <div class="coach-week-diff">${_coachDiffHtml(groups, 8)}</div>
        ${_coachGuardChipsHtml(guardrails)}`;
      // NINGÚN BOTÓN DESHABILITADO, tampoco con avisos duros: los duros restringen al coach,
      // no al usuario (principio 4 del plan).
      acciones = `
        <button class="coach-btn coach-btn-primary" id="coach-week-apply">Apply</button>
        <button class="coach-btn" id="coach-week-reject">Reject</button>
        <button class="coach-btn" id="coach-week-regen-note">Regenerate with a note</button>`;
    } else if (review.status === 'applied') {
      const ver = (plan && plan.version != null) ? plan.version : null;
      // El brief del PLAN si el plan salió de esta revisión; si no, el de la revisión (con el
      // fallback v1 dentro). El plan manda porque es lo que está vigente.
      const brief = (plan && plan.coachBrief && plan.reviewId === review.id)
        ? plan.coachBrief
        : coachBriefFromReview(review, { prev: plan, next: plan });
      cabecera = head(ver != null ? ` · plan v${ver}` : '', 'See all ›');
      cuerpo = _coachAppliedHtml(brief, plan, review);
      const volver = (plan && plan.basedOn) || null;
      if (volver) acciones = `<button class="coach-btn" id="coach-week-undo" data-plan="${_cEsc(volver)}">Undo</button>`;
    } else if (review.status === 'failed') {
      const kind = (review.error && review.error.kind) || 'api';
      cuerpo = `<div class="coach-week-line coach-week-bad">The ${wkTxt} review failed: ${_cEsc(COACH_ERROR_LABEL[kind] || kind)}.</div>`;
      acciones = '<button class="coach-btn" id="coach-week-regen">Regenerate</button>';
    } else if (review.status === 'expired' || review.status === 'rejected') {
      cuerpo = `<div class="coach-week-line">Proposal for ${wkTxt} ${review.status === 'expired' ? 'expired (it was from an earlier week)' : 'rejected'}.</div>`;
      acciones = `${_coachCloseWeekBtn('coach-close-week')}<button class="coach-btn" id="coach-week-regen">Regenerate</button>`;
      cerrar = 'coach-close-week';
    } else {
      cuerpo = '<div class="coach-week-line">No usable review for this week.</div>';
      acciones = _coachCloseWeekBtn('coach-close-week');
      cerrar = 'coach-close-week';
    }

    el.innerHTML = `<div class="card coach-week-card">
      ${cabecera}
      ${cuerpo}
      ${acciones ? `<div class="coach-actions">${acciones}</div>` : ''}
    </div>`;

    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    on('coach-week-open', () => openCoachView());
    if (cerrar) _coachBindCloseWeek(cerrar);
    if (review) {
      on('coach-week-apply', async () => { await applyCoachProposal(review); });
      on('coach-week-reject', async () => {
        const why = (typeof prompt === 'function') ? prompt('Why are you rejecting it? (optional)') : null;
        if (why === null) return;   // Cancelar no rechaza
        await rejectCoachProposal(review, (why || '').trim() || null);
      });
      on('coach-week-regen', () => runWeeklyCoach({ weekKey: _cTargetWeek(today()), regenerate: true }));
      on('coach-week-ask-api', () => runWeeklyCoach({ weekKey: review.weekKey || _cTargetWeek(today()), force: true }));
      on('coach-week-regen-note', () => {
        const nota = (typeof prompt === 'function') ? prompt('What should it take into account? (one or two sentences)') : null;
        if (!nota) return;
        return runWeeklyCoach({ weekKey: _cTargetWeek(today()), userNote: nota.trim(), regenerate: true });
      });
      on('coach-week-undo', (e) => rollbackPlanVersion(e.currentTarget.dataset.plan));
    }
  } catch (e) {
    // Patrón `renderHomeView`: cada sección con su try/catch.
    console.warn('[Coach] renderCoachWeekCard:', e);
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

/** El nombre visible de una sesión, del plan activo o del propio id. */
function _coachSessionName(sid, plan) {
  const p = plan || ((typeof activePlan !== 'undefined' && activePlan) ? activePlan : null);
  const s = ((p || {}).sessions || {})[sid];
  return (s && s.name) || sid || '';
}

/**
 * "WHAT CHANGES AND WHY" y "WHY IT HOLDS".
 *
 * EL ORDEN NO ES DECORATIVO: si algo cambia, lo primero que hay que leer es por qué; si no
 * cambia nada (`whyChanged === ''`, que el contrato v2 garantiza cuando la semana sigue igual),
 * lo único que hay que leer es por qué se mantiene, y va ABIERTO. Nunca se pintan los dos
 * abiertos: serían 1.200 caracteres de markdown en la pantalla que se mira antes de entrenar.
 */
function _coachWhyHtml(brief, opts = {}) {
  const b = brief || {};
  const cambia = String(b.whyChanged || '').trim();
  const mantiene = String(b.whyKept || '').trim();
  if (!cambia && !mantiene) return '';
  if (opts.plegado) {
    return `<details class="cwc-why"><summary>What changes · why it holds</summary>
      ${cambia ? `<div class="cwc-label">WHAT CHANGES AND WHY</div><div class="coach-week-md">${_cMd(cambia)}</div>` : ''}
      ${mantiene ? `<div class="cwc-label">WHY IT HOLDS</div><div class="coach-week-md">${_cMd(mantiene)}</div>` : ''}
    </details>`;
  }
  const bloqueCambia = cambia
    ? `<div class="cwc-block"><div class="cwc-label">WHAT CHANGES AND WHY</div><div class="coach-week-md">${_cMd(cambia)}</div></div>`
    : '';
  if (!mantiene) return bloqueCambia;
  const bloqueMantiene = cambia
    ? `<details class="cwc-why"><summary>WHY IT HOLDS</summary><div class="coach-week-md">${_cMd(mantiene)}</div></details>`
    : `<div class="cwc-block"><div class="cwc-label">WHY IT HOLDS</div><div class="coach-week-md">${_cMd(mantiene)}</div></div>`;
  return bloqueCambia + bloqueMantiene;
}

/** Una fila de `weekSummary`: chip de estado + nombre de la sesión + su motivo. */
function _coachWsRowHtml(w, plan) {
  const st = (w && COACH_WS_STATUS_LABEL[w.status]) ? w.status : 'kept';
  return `<div class="ws-row">
    <span class="ws-chip ${_cEsc(st)}">${_cEsc(COACH_WS_STATUS_LABEL[st])}</span>
    <span class="ws-name">${_cEsc(_coachSessionName(w && w.sessionId, plan))}</span>
    <span class="ws-line">${_cEsc((w && w.line) || '')}</span>
  </div>`;
}

/**
 * El cuerpo del estado `applied`: qué pasó la semana pasada, en qué etapa estoy, cuál es el
 * foco y por qué cambia o por qué sigue igual. Es la petición literal de Julian del
 * 2026-09-07, en el orden en que él la dijo.
 *
 * EL DETALLE ACOTADO: aquí sólo caben 3 bullets y dos desplegables. El texto completo
 * (`lastWeek`, `nextWeek`, las decisiones con sus reglas) vive en la vista Coach, a un toque
 * de "Ver todo ›". Una Home de tres pantallas de scroll no se lee antes de entrenar.
 */
function _coachAppliedHtml(brief, plan, review) {
  const b = brief || {};
  const rows = Array.isArray(b.weekSummary) ? b.weekSummary : [];
  const cambian = rows.filter((w) => w && w.status !== 'kept');

  const pasada = (b.lastWeekSummary || []).slice(0, 3);
  const bloquePasada = pasada.length
    ? `<div class="cwc-block"><div class="cwc-label">LAST WEEK</div>
       <ul class="cwc-bullets">${pasada.map((l) => `<li>${_cEsc(l)}</li>`).join('')}</ul></div>`
    : '';

  const blk = (typeof blockWeek === 'function') ? blockWeek() : null;
  const total = (typeof DELOAD_BLOCK_WEEKS !== 'undefined') ? DELOAD_BLOCK_WEEKS : 5;
  const bits = [];
  if (blk && blk.index) bits.push(`Week ${blk.index}/${total}`);
  const bl = _cBlockLabel(today());
  if (bl) bits.push(bl);
  const fase = _cPhaseLabel(b.phase);
  if (fase) bits.push(`${fase} phase`);
  if (b.focus) bits.push(`Focus: ${b.focus}`);
  const bloqueEsta = bits.length
    ? `<div class="cwc-block"><div class="cwc-label">THIS WEEK</div>
       <div class="cwc-line">${_cEsc(bits.join(' · '))}</div></div>`
    : '';

  const n = ((review || {}).guardrails || []).length;
  const pie = `<div class="cwc-foot">${n ? `${n} warning${n === 1 ? '' : 's'}` : 'no warnings'}</div>`;

  return `
    ${bloquePasada}
    ${bloqueEsta}
    ${_coachWhyHtml(b)}
    ${cambian.length ? `<details class="cwc-ws"><summary>What changes (${cambian.length} ${cambian.length === 1 ? 'session' : 'sessions'})</summary>${cambian.map((w) => _coachWsRowHtml(w, plan)).join('')}</details>` : ''}
    ${rows.length ? `<details class="cwc-ws"><summary>All sessions (${rows.length})</summary>${rows.map((w) => _coachWsRowHtml(w, plan)).join('')}</details>` : ''}
    ${pie}`;
}

// ==================== VISTA COACH ====================

function openCoachView() {
  // B-4 (auditoría 2026-09-08): faltaba `body.dataset.tab`, y con `body[data-tab="home"]`
  // la cabecera global está oculta por CSS: abrir Coach desde Home dejaba la vista sin
  // título. `enterSecondaryView` (app.js) hace las tres cosas; `typeof` porque este módulo
  // se carga como <script> aparte y no debe romperse si app.js no llegó.
  if (typeof window.enterSecondaryView === 'function') {
    window.enterSecondaryView('coach');
  } else {
    if (typeof showView === 'function') showView('coach');
    if (typeof updateHeader === 'function') updateHeader('coach');
  }
  renderCoachView().catch((e) => console.warn('[Coach] view:', e));
}

/** Seis secciones, cada una con su try/catch: un fallo en una no vacía el resto del scroll. */
async function renderCoachView() {
  const review = await _coachExpireIfStale(await _coachLatestReview());
  const seccion = async (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    try { await fn(el); } catch (e) { console.warn(`[Coach] ${id}:`, e); el.innerHTML = ''; }
  };
  await seccion('coach-week', (el) => _coachRenderWeek(el, review));
  await seccion('coach-briefing', (el) => _coachRenderBriefing(el, review));
  await seccion('coach-proposal', (el) => _coachRenderProposal(el, review));
  await seccion('coach-goals-view', () => (typeof renderGoalsCard === 'function' ? renderGoalsCard('coach-goals-view') : null));
  await seccion('coach-decisions', (el) => _coachRenderDecisions(el));
  // R-11 (auditoría 2026-09-08): el ledger va DEBAJO del log de decisiones porque es su
  // agregado — primero qué se decidió, después qué reglas lo sostienen y cómo les va.
  await seccion('coach-ledger', (el) => _coachRenderLedger(el));
  await seccion('coach-versions', (el) => _coachRenderVersions(el));
}

async function _coachRenderWeek(el, review) {
  const blk = (typeof blockWeek === 'function') ? blockWeek() : null;
  const lunes = blk && blk.deloadMonday ? blk.deloadMonday : null;
  const total = (typeof DELOAD_BLOCK_WEEKS !== 'undefined') ? DELOAD_BLOCK_WEEKS : (blk && blk.weeksTotal) || 5;
  const bloque = (blk && blk.index)
    ? `Week ${blk.index}/${total} · ${_cEsc(blk.label || '')}${lunes ? ` · deload on ${_cEsc(lunes)}` : ''}`
    : 'No block anchor';

  let recu = '';
  try {
    const r = (typeof computeReadiness === 'function') ? await computeReadiness() : null;
    if (r) {
      const LABEL = { green: 'green', yellow: 'yellow', red: 'red', unknown: 'no data today' };
      const COL = { green: 'var(--accent)', yellow: 'var(--yellow)', red: 'var(--red)', unknown: 'var(--text3)' };
      recu = `<span class="coach-week-readiness" style="color:${COL[r.color] || 'var(--text3)'}">recovery ${_cEsc(LABEL[r.color] || r.color)}</span>`;
    }
  } catch (e) { recu = ''; }

  const prios = ((((review || {}).output) || {}).briefing || {}).priorities || [];
  el.innerHTML = `<div class="card coach-week-card">
    <div class="coach-week-head">
      <span class="coach-week-title">${_cEsc(review && review.weekKey ? _cWeekShort(review.weekKey) : _cWeekShort(_cWeekKey(today())))}</span>
      ${recu}
    </div>
    <div class="coach-week-line">${bloque}</div>
    ${review ? `<div class="coach-week-status">Review ${_cEsc(COACH_STATUS_LABEL[review.status] || review.status || '—')}${review.attempt ? ` · attempt ${review.attempt}` : ''}</div>` : '<div class="coach-week-status">No review for this week yet.</div>'}
    ${prios.length ? `<ol class="coach-week-prios">${prios.slice(0, 3).map((p) => `<li>${_cEsc(p)}</li>`).join('')}</ol>` : ''}
    <div class="coach-actions">${_coachCloseWeekBtn('coach-close-week-view')}</div>
  </div>`;
  // Id propio y no `coach-close-week`: la tarjeta de Home vive en el mismo documento y dos
  // elementos con el mismo id harían que `getElementById` sólo encontrase uno. La clase
  // `.coach-close-week` es la que comparten.
  _coachBindCloseWeek('coach-close-week-view');
}

async function _coachRenderBriefing(el, review) {
  const brief = (((review || {}).output) || {}).briefing || null;
  if (brief && (brief.lastWeek || brief.nextWeek || brief.focus)) {
    // v11.65: el contrato v2 en su sitio largo. Foco y fase arriba (el titular), el porqué
    // completo en medio y la tabla de sesiones abajo — una fila por cada una, también las que
    // no cambian, que es el punto entero del contrato.
    const plan = (typeof activePlan !== 'undefined' && activePlan) ? activePlan : null;
    const cb = coachBriefFromReview(review, { prev: plan, next: plan });
    const fase = _cPhaseLabel(cb.phase);
    const rows = cb.weekSummary || [];
    el.innerHTML = `<div class="card coach-brief">
      ${cb.focus ? `<div class="coach-brief-title">Focus</div><div class="cwc-line">${_cEsc(cb.focus)}</div>` : ''}
      ${fase ? `<div class="coach-brief-title" style="margin-top:12px">Phase</div><div class="cwc-line">${_cEsc(fase)}</div>` : ''}
      ${(cb.lastWeekSummary || []).length ? `<div class="coach-brief-title" style="margin-top:12px">Last week</div><ul class="cwc-bullets">${cb.lastWeekSummary.map((l) => `<li>${_cEsc(l)}</li>`).join('')}</ul>` : ''}
      ${brief.lastWeek ? `<div class="coach-brief-title" style="margin-top:12px">What happened</div><div class="coach-week-md">${_cMd(brief.lastWeek)}</div>` : ''}
      ${String(cb.whyChanged || '').trim() ? `<div class="coach-brief-title" style="margin-top:12px">What changes and why</div><div class="coach-week-md">${_cMd(cb.whyChanged)}</div>` : ''}
      ${String(cb.whyKept || '').trim() ? `<div class="coach-brief-title" style="margin-top:12px">Why it holds</div><div class="coach-week-md">${_cMd(cb.whyKept)}</div>` : ''}
      ${brief.nextWeek ? `<div class="coach-brief-title" style="margin-top:12px">What I am changing</div><div class="coach-week-md">${_cMd(brief.nextWeek)}</div>` : ''}
      ${rows.length ? `<div class="coach-brief-title" style="margin-top:12px">This week's sessions (${rows.length})</div><div class="cwc-ws-table">${rows.map((w) => _coachWsRowHtml(w, plan)).join('')}</div>` : ''}
    </div>`;
    return;
  }
  // Fallback legacy: la prosa del cron retirado (`weekly_reviews`), sólo lectura.
  const all = await dbGetAll('weekly_reviews').catch(() => []);
  const latest = (all || []).slice().sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0))[0];
  const cv = latest && latest.coachVoice;
  if (!cv && !(latest && latest.observed)) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card coach-brief">
    <div class="coach-brief-title">What happened <span class="coach-brief-legacy">${_cEsc(latest.weekKey || '')} · old review</span></div>
    <div class="coach-week-md">${_cMd((cv && cv.lastWeek) || latest.observed || '')}</div>
    ${(cv && cv.nextWeek) || latest.planNext ? `<div class="coach-brief-title" style="margin-top:12px">What I am changing</div><div class="coach-week-md">${_cMd((cv && cv.nextWeek) || latest.planNext)}</div>` : ''}
  </div>`;
}

async function _coachRenderProposal(el, review) {
  if (!review || review.status !== 'proposed' || !((review.output || {}).proposal)) { el.innerHTML = ''; return; }
  const prev = (typeof activePlan !== 'undefined') ? activePlan : {};
  const merged = (typeof mergeProposal === 'function') ? mergeProposal(prev, review.output.proposal) : null;
  if (!merged) { el.innerHTML = ''; return; }
  const { groups } = coachDiffGroups(prev, merged);
  const guardrails = await _coachPreviewGuardrails(review, prev, merged);

  const decisiones = ((review.output || {}).decisions || []).map((d) => {
    const cifras = Object.entries(((d.evidence || {}).numbers) || {})
      .slice(0, 8)
      .map(([k, v]) => `<span class="coach-dec-num">${_cEsc(k)}: ${_cEsc(v)}</span>`).join('');
    const reglas = (d.ruleIds || []).map((rid) => {
      const r = COACH_RULE_LABEL(rid);
      return r
        ? `<li title="${_cEsc(rid)}"><b>${_cEsc(r.label)}:</b> ${_cEsc(r.text)}</li>`
        : `<li title="${_cEsc(rid)}">Rule with no text in the local corpus.</li>`;
    }).join('');
    return `<div class="coach-dec">
      <div class="coach-dec-what"><b>${_cEsc(d.what || '')}</b>${d.type ? ` <span class="coach-dec-type">${_cEsc(COACH_DECISION_LABEL[d.type] || d.type)}</span>` : ''}</div>
      ${d.why ? `<div class="coach-dec-why">${_cEsc(d.why)}</div>` : ''}
      ${cifras ? `<div class="coach-dec-nums">${cifras}</div>` : ''}
      ${reglas ? `<details class="coach-dec-rules"><summary>why</summary><ul>${reglas}</ul></details>` : ''}
    </div>`;
  }).join('');

  const pedidos = ((review.output || {}).requestedData || []);
  el.innerHTML = `<div class="card coach-week-card">
    <div class="coach-week-head"><span class="coach-week-title">Proposal · ${_cEsc(_cWeekShort(review.weekKey))}</span></div>
    <div class="coach-week-diff">${_coachDiffHtml(groups)}</div>
    ${decisiones ? `<div class="coach-decs">${decisiones}</div>` : ''}
    ${_coachGuardChipsHtml(guardrails)}
    ${pedidos.length ? `<div class="coach-week-status">What the coach is asking for: ${_cEsc(pedidos.slice(0, 4).join(' · '))}</div>` : ''}
    ${(review.sanitized || []).length ? `<details class="coach-dec-rules"><summary>sanitized on receipt (${review.sanitized.length})</summary><ul>${review.sanitized.slice(0, 12).map((s) => `<li>${_cEsc(s)}</li>`).join('')}</ul></details>` : ''}
    <div class="coach-actions">
      <button class="coach-btn coach-btn-primary" id="coach-view-apply">Apply</button>
      <button class="coach-btn" id="coach-view-reject">Reject</button>
      <button class="coach-btn" id="coach-view-regen">Regenerate with a note</button>
    </div>
  </div>`;

  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
  on('coach-view-apply', async () => { await applyCoachProposal(review); });
  on('coach-view-reject', async () => {
    const why = (typeof prompt === 'function') ? prompt('Why are you rejecting it? (optional)') : null;
    if (why === null) return;
    await rejectCoachProposal(review, (why || '').trim() || null);
  });
  on('coach-view-regen', () => {
    const nota = (typeof prompt === 'function') ? prompt('What should it take into account? (one or two sentences)') : null;
    if (!nota) return;
    return runWeeklyCoach({ weekKey: _cTargetWeek(today()), userNote: nota.trim(), regenerate: true });
  });
}

async function _coachRenderDecisions(el) {
  const all = await dbGetAll('decisions').catch(() => []);
  const rows = (all || []).filter((d) => d && d.id)
    .sort((a, b) => (Number(b.ts || 0) - Number(a.ts || 0)) || String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 20);
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card coach-decs-card">
    <div class="coach-brief-title">Decisions</div>
    ${rows.map((d) => `<div class="coach-dec-row">
      <span class="coach-dec-date">${_cEsc(d.date || '')}</span>
      <span class="coach-dec-kind">${_cEsc(COACH_DECISION_LABEL[d.type] || d.type || '')}</span>
      <span class="coach-dec-txt">${_cEsc(d.what || '')}</span>
      ${d.outcome ? `<span class="coach-dec-out -${_cEsc(d.outcome)}">${_cEsc(COACH_OUTCOME_LABEL[d.outcome] || d.outcome)}</span>` : ''}
    </div>`).join('')}
  </div>`;
}

// ==================== LEDGER DE EVIDENCIA (R-11) ====================
//
// La tabla que cierra el bucle regla → decisión → resultado. `buildEvidenceLedger` es puro y
// vive en coach-engine.js; aquí sólo se leen las decisiones, se pasa el corpus local y se
// pinta. Top 15 con "show all" porque el corpus tiene 72 reglas y una tabla de 72 filas en
// 390 px no la lee nadie: las que importan son las citadas, y están arriba.
const COACH_LEDGER_TOP = 15;
let _coachLedgerAll = false;

async function _coachRenderLedger(el) {
  if (typeof buildEvidenceLedger !== 'function') { el.innerHTML = ''; return; }
  const all = await dbGetAll('decisions').catch(() => []);
  const corpus = (typeof COACH_RULES !== 'undefined' && COACH_RULES) ? COACH_RULES : {};
  const filas = buildEvidenceLedger(all || [], corpus);
  if (!filas.length) {
    el.innerHTML = `<div class="card coach-decs-card">
      <div class="coach-brief-title">Evidence ledger</div>
      <div class="coach-week-empty">No decisions yet — the ledger fills in as the coach cites rules.</div>
    </div>`;
    return;
  }
  const visibles = _coachLedgerAll ? filas : filas.slice(0, COACH_LEDGER_TOP);
  const mas = filas.length - visibles.length;
  el.innerHTML = `<div class="card coach-decs-card">
    <div class="coach-brief-title">Evidence ledger</div>
    <div class="evl-head">
      <span class="evl-rule">Rule</span>
      <span class="evl-num">Cited</span>
      <span class="evl-num">Retired</span>
      <span class="evl-week">Last</span>
      <span class="evl-grade">Evidence</span>
    </div>
    ${visibles.map((f) => `<div class="evl-row${f.known ? '' : ' -unknown'}">
      <span class="evl-rule" title="${_cEsc((corpus[f.ruleId] || {}).rule || 'Rule with no text in the local corpus.')}">${_cEsc(f.ruleId)}</span>
      <span class="evl-num">${f.cited}</span>
      <span class="evl-num${f.retired ? ' -bad' : ''}">${f.retired || '·'}</span>
      <span class="evl-week">${_cEsc(_cWeekShort(f.lastWeek) || '·')}</span>
      <span class="evl-grade -${_cEsc(f.grade || 'unknown')}">${_cEsc(f.known ? (COACH_EVIDENCE_LABEL[f.grade] || f.grade || '—') : 'not in corpus')}</span>
    </div>`).join('')}
    ${mas > 0 ? `<button class="evl-more" id="coach-ledger-more">Show all ${filas.length}</button>` : ''}
  </div>`;
  const btn = el.querySelector('#coach-ledger-more');
  if (btn) {
    btn.addEventListener('click', () => {
      _coachLedgerAll = true;
      _coachRenderLedger(el).catch((e) => console.warn('[Coach] ledger:', e));
    });
  }
}

async function _coachRenderVersions(el) {
  const rows = await dbGetAll('plans').catch(() => []);
  const plans = (rows || []).filter((p) => p && p.id)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))
    .slice(0, 20);
  if (!plans.length) { el.innerHTML = ''; return; }
  const activaId = (typeof activePlan !== 'undefined' && activePlan) ? activePlan.id : null;
  const AUT = { 'coach-llm': 'Coach', 'ideal-seed': 'Ideal', user: 'You' };
  el.innerHTML = `<div class="card coach-vers-card">
    <div class="coach-brief-title">Plan versions</div>
    ${plans.map((p) => {
      const activa = p.id === activaId;
      const partes = [`v${p.version != null ? p.version : '?'}`];
      if (p.author) partes.push(AUT[p.author] || p.author);
      if (p.weekKey) partes.push(_cWeekShort(p.weekKey));
      return `<div class="coach-ver-row${activa ? ' -active' : ''}">
        <span class="coach-ver-label">${_cEsc(partes.join(' · '))}${activa ? ' · active' : ''}</span>
        <span class="coach-ver-name">${_cEsc(p.label || '')}</span>
        ${activa ? '' : `<button class="coach-ver-back" data-plan="${_cEsc(p.id)}">Roll back to this</button>`}
      </div>`;
    }).join('')}
  </div>`;
  el.querySelectorAll('.coach-ver-back').forEach((b) => {
    b.addEventListener('click', () => rollbackPlanVersion(b.dataset.plan));
  });
}

// ==================== AJUSTES ====================

/**
 * "Exportar facts JSON": construye el pack, dice cuánto pesa y lo copia al portapapeles.
 *
 * POR QUÉ EXISTE. Antes de gastar $0,60 en una llamada, poder mirar en el iPhone QUÉ ve el
 * coach. Los `dataGaps` son la parte que más importa: si el pack declara "no hay cómo evaluar
 * la Z2", cualquier propuesta sobre kilómetros es sospechosa antes de leerla.
 *
 * Tres caminos de salida porque en iOS los dos primeros fallan según el contexto: portapapeles
 * (necesita gesto y https), compartir un fichero, y por último un `<textarea>` para copiar a
 * mano. Sin el tercero, un fallo del portapapeles deja al usuario sin nada.
 */
async function exportCoachFacts() {
  const out = document.getElementById('coach-facts-out');
  const btn = document.getElementById('btn-export-facts');
  if (btn) { btn.disabled = true; btn.textContent = 'Building…'; }
  try {
    const facts = await buildCoachFactsFromStores({});
    const json = JSON.stringify(facts);
    const kb = (new TextEncoder().encode(json).length / 1024).toFixed(1);
    const gaps = (facts.dataGaps || []).length;

    let copiado = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(json);
        copiado = true;
      }
    } catch (e) { copiado = false; }

    if (!copiado && typeof File === 'function' && navigator.share && navigator.canShare) {
      try {
        const f = new File([json], `facts-${facts.meta && facts.meta.weekKey ? facts.meta.weekKey : today()}.json`, { type: 'application/json' });
        if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Coach facts' }); copiado = true; }
      } catch (e) { copiado = false; }
    }

    if (out) {
      out.classList.remove('hidden');
      out.innerHTML = copiado
        ? `<p class="muted" style="font-size:11px;margin:0">Copied · ${kb} KB · ${gaps} data gap${gaps === 1 ? '' : 's'} declared.</p>`
        : `<p class="muted" style="font-size:11px;margin:0 0 6px">Could not copy automatically (${kb} KB). Select and copy:</p>
           <textarea readonly rows="6" class="text-input" style="width:100%;font-family:var(--font-mono);font-size:10px">${_cEsc(json)}</textarea>`;
    }
    if (typeof toast === 'function') toast(`Facts: ${kb} KB · ${gaps} data gap${gaps === 1 ? '' : 's'}`);
    return facts;
  } catch (e) {
    console.warn('[Coach] exportCoachFacts:', e);
    if (out) { out.classList.remove('hidden'); out.innerHTML = `<p class="muted" style="font-size:11px;margin:0;color:var(--red)">${_cEsc((e && e.message) || 'error')}</p>`; }
    if (typeof toast === 'function') toast('Could not build the pack');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Export facts JSON'; }
  }
}

/**
 * `settings.coachAutoApply`: `ask` (por defecto) · `auto-if-clean` · `auto`.
 *
 * Sólo `ask` está implementado. Los otros dos se guardan pero no se despliegan: el plan es
 * explícito en que `auto` NUNCA va por defecto, y darle el interruptor antes de tener tres o
 * cuatro semanas de propuestas revisadas a mano sería pedirle confianza sin evidencia.
 */
function coachAutoApplyMode() {
  const v = state && state.settings && state.settings.coachAutoApply;
  return (v === 'auto' || v === 'auto-if-clean') ? v : 'ask';
}

async function setCoachAutoApply(mode) {
  const v = (mode === 'auto' || mode === 'auto-if-clean') ? mode : 'ask';
  state.settings = Object.assign({}, state.settings, { coachAutoApply: v });
  await smartPut('settings', { key: 'userSettings', data: state.settings });
  if (typeof toast === 'function') {
    toast(v === 'ask' ? 'The coach proposes, you approve' : 'Saved — automatic mode comes later');
  }
}

// ==================== MODO DE REVISIÓN: API O MANUAL (v11.69) ====================
//
// "Quiero poder hacerla con el API (desde la web) o desde aquí para no gastar API, debería ser lo
// mismo, ¿no?" (Julian, 2026-09-09). Lo es, y para que lo sea DE VERDAD el camino manual tiene que
// recibir exactamente lo que recibiría la función: el mismo facts pack, el mismo plan activo, el
// mismo vocabulario permitido y las mismas revisiones previas. Por eso en modo manual "Cerrar la
// semana" no llama a nadie: construye el mismo `body` y lo guarda como fila `requested` en
// `coach_reviews`. La sesión de Claude Code (`scripts/coach-manual-review.mjs`) la lee de
// Supabase, escribe la propuesta con el mismo contrato y el mismo validador, y la fila pasa a
// `proposed`: la app la pinta igual que una de la función. "Regenerar" sigue llamando al modelo.
function coachReviewMode() {
  const v = state && state.settings && state.settings.coachReviewMode;
  return v === 'manual' ? 'manual' : 'api';
}

async function setCoachReviewMode(mode) {
  const v = mode === 'manual' ? 'manual' : 'api';
  state.settings = Object.assign({}, state.settings, { coachReviewMode: v });
  await smartPut('settings', { key: 'userSettings', data: state.settings });
  if (typeof toast === 'function') {
    toast(v === 'manual' ? 'Manual mode: closing the week saves the facts for Claude Code' : 'The app will ask the model');
  }
}

/**
 * Cierra la semana SIN llamar a la función. Guarda el mismo `body` que viajaría a
 * `coach-weekly-review` como fila `requested`, con `smartPut` porque es una escritura del USUARIO
 * que tiene que llegar a la nube: la sesión la lee de Supabase, no del teléfono.
 *
 * El `attempt` sigue la numeración de la función (filas de la semana + 1), así el `proposed` que
 * escriba la sesión ocupa el MISMO id y un "Regenerar" posterior es el intento siguiente.
 */
async function requestManualCoachReview({ weekKey, userNote } = {}) {
  const wk = weekKey || _cWeekKey(today());
  const todas = (await dbGetAll('coach_reviews').catch(() => [])) || [];
  const rows = todas.filter((r) => r && r.weekKey === wk);
  const ya = rows.find((r) => r.status === 'requested');
  if (ya) {
    if (typeof toast === 'function') toast('The week is already closed and waiting for the manual review');
    try { openCoachView(); } catch (e) {}
    return ya;
  }
  try { await renderCoachWeekCard({ pending: true }); } catch (e) { /* la tarjeta no bloquea */ }
  const facts = await buildCoachFactsFromStores({ weekKey: wk });
  const nowIso = new Date().toISOString();
  const row = {
    id: `${wk}#${rows.length + 1}`, weekKey: wk, attempt: rows.length + 1,
    status: 'requested', createdAt: nowIso, updatedAt: nowIso, requestedAt: nowIso,
    facts,
    // Lo que la función recibe además del pack, tal cual lo construye `runWeeklyCoach`.
    request: {
      currentPlan: _coachCurrentPlan(),
      allowed: _coachAllowed(),
      priorReviews: _coachPriorReviews(todas),
      lowerSessionIds: Object.entries((typeof sessionClassMap === 'function' ? sessionClassMap() : {}) || {})
        .filter(([, c]) => c && (c.subtype === 'lower' || c.subtype === 'full' || c.family === 'hybrid'))
        .map(([sid]) => sid),
    },
    userNote: userNote ? String(userNote).slice(0, COACH_MAX_USER_NOTE) : null,
    clientVersion: COACH_APP_VERSION,
    prompt: { model: 'manual-claude', promptVersion: 2 },
  };
  await smartPut('coach_reviews', row);
  try { await renderCoachWeekCard(); } catch (e) {}
  try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
  if (typeof toast === 'function') toast('Week closed. The review is waiting for Claude Code.');
  return row;
}

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderCoachReadout, renderReadinessSignals, renderRecoveryLine, renderGoalsCard,
    renderCoachGoalLine, _coachGoalProgressFromStores,
    COACH_APP_VERSION, COACH_RULE_LABEL, COACH_EVIDENCE_LABEL, COACH_GUARD_LABEL, COACH_STATUS_LABEL,
    COACH_PHASES, COACH_WS_STATUS_LABEL, COACH_CLOSE_WEEK_LABEL,
    coachBriefFromReview, _coachAppliedHtml, _coachWhyHtml,
    buildCoachFactsFromStores, maybeRunWeeklyCoach, runWeeklyCoach, pollCoachReview,
    applyCoachProposal, rejectCoachProposal, rollbackPlanVersion,
    renderCoachWeekCard, renderCoachView, openCoachView, coachDiffGroups,
    _coachRenderLedger, COACH_LEDGER_TOP,
    exportCoachFacts, coachAutoApplyMode, setCoachAutoApply,
    coachReviewMode, setCoachReviewMode, requestManualCoachReview,
  };
}
