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
// v11.60 (incremento 6) trae `renderGoalsCard`, la tarjeta "Objetivos".
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
        ? 'sin series'
        : `${it.done.topKg != null ? fmt(it.done.topKg) + u : '—'}×${(it.done.reps || []).join('/')}` +
          (it.done.avgRpe ? ` @${fmt(it.done.avgRpe)}` : '');
      const next = it.next && it.next.kg != null
        ? `<span class="coach-readout-next" title="${escapeHtml(it.next.reason || '')}">→ ${fmt(it.next.kg)}</span>`
        : (it.outcome === 'skipped' ? '<span class="coach-readout-next">saltado</span>' : '');
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
          <span class="coach-readout-title">Lectura del coach · ${escapeHtml(nombre)}${mins ? ' · ' + mins : ''}</span>
          <button class="coach-readout-close" id="coach-readout-close" aria-label="Cerrar">✕</button>
        </div>
        <div class="coach-readout-summary">${escapeHtml(R.line || '')}</div>
        ${rows}
        <div class="coach-readout-foot">Próxima vez ya está aplicado en la tarjeta.</div>
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

  const ES = { green: 'verde', yellow: 'amarilla', red: 'roja', unknown: 'sin dato de hoy' };
  const COL = { green: 'var(--accent)', yellow: 'var(--yellow)', red: 'var(--red)', unknown: 'var(--text3)' };
  const CONF = { high: 'confianza alta', medium: 'confianza media', low: 'confianza baja' };
  const color = COL[r.color] || 'var(--text3)';

  const rows = (r.signals || []).map(s => {
    const cls = s.status === 'insufficient' ? 'rs-none' : (s.fired ? 'rs-fired' : 'rs-ok');
    const txt = s.status === 'insufficient'
      ? `${s.label || s.id}: sin dato — ${s.reason || ''}`
      : s.text;
    const dot = s.status === 'insufficient' ? '○' : '●';
    return `<div class="rs-row ${cls}"><span class="rs-dot"${s.fired ? ` style="color:${color}"` : ''}>${dot}</span><span class="rs-text">${escapeHtml(String(txt))}</span></div>`;
  }).join('');

  // La honestidad de v11.58: si hay un dato pero NO es de hoy, se dice de cuándo es. Nunca se
  // pinta el de ayer como si fuera de hoy (F-6).
  const last = r.whoopLastAvailable;
  const whoopSig = (r.signals || []).find(s => s.id === 'whoop') || {};
  const lastLine = (whoopSig.status === 'insufficient' && last && last.score != null)
    ? `<div class="rs-foot">Último dato de WHOOP: ${last.score}% (${(typeof whoopDayLabel === 'function' ? whoopDayLabel(last.date, today()) : last.date)}) — no cuenta como hoy.</div>`
    : '';

  el.innerHTML = `
    <div class="rs-head">
      <span class="rs-title">Recuperación</span>
      <span class="rs-color" style="color:${color}">${ES[r.color] || r.color}</span>
      <span class="rs-conf">${CONF[r.confidence] || ''}</span>
    </div>
    <div class="rs-rows">${rows}</div>
    ${lastLine}`;
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
// VIVE EN STATS HASTA QUE EXISTA LA VISTA COACH (incremento 9), donde será la sección
// `#coach-goals` del scroll — de ahí el id, que no cambiará al mudarse.

/** Sólo pesadas MEDIDAS: los valores suavizados de intervals.icu meterían pendiente 0. */
const GOALS_WEIGH_DAYS = 90;
const GOALS_RUN_DAYS = 28;
const GOALS_WORKOUT_DAYS = 56;

async function renderGoalsCard() {
  const el = document.getElementById('coach-goals');
  if (!el) return;
  if (typeof goalProgress !== 'function') { el.innerHTML = ''; return; }
  try {
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

    const gp = goalProgress(
      (state.settings && state.settings.goals)
        || (typeof COACH_GOALS_DEFAULT !== 'undefined' ? COACH_GOALS_DEFAULT : {}),
      {
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
      },
    );

    // Estado por fila. `-na` (gris) es un estado de primera clase: "no hay señal" no se pinta
    // ni de verde ni de rojo, porque no es ninguna de las dos cosas.
    const WSTATE = {
      'at-target': 'ok', 'on-track': 'ok', slow: 'warn', stalled: 'warn',
      fast: 'warn', insufficient: 'na',
    };
    const WLABEL = {
      'at-target': 'en la banda', 'on-track': 'en rumbo', slow: 'lento',
      stalled: 'estancado', fast: 'muy rápido', insufficient: 'sin señal',
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
      row('Peso',
        gp.weight.trend7d != null ? `${String(gp.weight.trend7d).replace('.', ',')} kg` : '—',
        WSTATE[gp.weight.status] || 'na',
        gp.weight.text,
        WLABEL[gp.weight.status] || gp.weight.status),
      row('10k cómodo',
        `${pct10k} %`,
        gp.running.phase === 'ready10k' ? 'ok' : (gp.running.runCount === 0 ? 'na' : 'warn'),
        gp.running.text,
        (typeof RW_PHASE_ES !== 'undefined' && RW_PHASE_ES[gp.running.phase]) || gp.running.phase),
      row('Fuerza mantenida',
        `${mantenidas}/${anclas.length}`,
        gp.strength.allMaintained === null ? 'na' : (gp.strength.allMaintained ? 'ok' : 'warn'),
        gp.strength.text,
        // "mantenida" en verde sólo si TODAS las anclas tienen dato. Con 1 de 6 medidas, un
        // verde diría "la fuerza se mantiene" sobre cinco ejercicios que nadie ha tocado.
        gp.strength.allMaintained === null
          ? 'sin ventana'
          : (!gp.strength.allMaintained ? 'ojo'
            : (conDato.length === anclas.length ? 'mantenida' : `${conDato.length} de ${anclas.length} con dato`))),
    ].join('');

    const senales = (gp.signals || []).length
      ? `<div class="coach-goal-sigs">
           <div class="coach-goal-sigs-title">Señales para el coach</div>
           ${gp.signals.map(s => `
             <div class="coach-goal-sig coach-goal-sig-${s.severity}">
               <span class="coach-goal-sig-dot">●</span>${escapeHtml(s.text)}
             </div>`).join('')}
         </div>`
      : '<div class="coach-goal-sigs"><div class="coach-goal-sigs-title">Señales para el coach</div><div class="coach-goal-sig coach-goal-sig-info">Ninguna esta semana.</div></div>';

    el.innerHTML = `<div class="coach-goals-head">Objetivos</div>${filas}${senales}`;
  } catch (e) {
    // Patrón `renderHomeView`: cada sección con su try/catch. Un resumen no tumba la pestaña.
    console.warn('[Coach] renderGoalsCard:', e);
    el.innerHTML = '';
  }
}

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderCoachReadout, renderReadinessSignals, renderGoalsCard };
}
