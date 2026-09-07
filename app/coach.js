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
// v11.61: la misma tarjeta se pinta también en la vista Coach (`#coach-goals-view`), de ahí el
// parámetro. Dos contenedores y no un id duplicado: `getElementById` sólo encontraría uno.

/** Sólo pesadas MEDIDAS: los valores suavizados de intervals.icu meterían pendiente 0. */
const GOALS_WEIGH_DAYS = 90;
const GOALS_RUN_DAYS = 28;
const GOALS_WORKOUT_DAYS = 56;

async function renderGoalsCard(containerId = 'coach-goals') {
  const el = document.getElementById(containerId);
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
const COACH_APP_VERSION = 'v11.61';

const COACH_MAX_SESSION_IDS = 12;   // el tope que valida la edge function
const COACH_MAX_EXERCISE_IDS = 150; // idem
const COACH_MAX_USER_NOTE = 1200;   // idem
const COACH_POLL_MS = 5000;
const COACH_POLL_MAX_MS = 5 * 60 * 1000;

const COACH_STATUS_ES = {
  running: 'en marcha', proposed: 'propuesta', applied: 'aplicada',
  rejected: 'rechazada', expired: 'vencida', failed: 'falló',
};
const COACH_EVIDENCE_ES = {
  strong: 'fuerte', moderate: 'moderada',
  weak_extrapolated: 'débil/extrapolada', expert: 'opinión experta',
};
const COACH_ERROR_ES = {
  refusal: 'el modelo se negó a responder',
  parse: 'el modelo no devolvió el formato esperado',
  api: 'error de la API del modelo',
  invoke: 'no se pudo llamar a la función',
};
const COACH_DECISION_ES = {
  progression: 'progresión', structure: 'estructura', running: 'carrera',
  nutrition: 'nutrición', recovery: 'recuperación',
  'session-readout': 'lectura de sesión', 'readiness-adjust': 'ajuste por recuperación',
  'plan-apply': 'plan aplicado', 'plan-adjust': 'plan ajustado', 'plan-reject': 'plan rechazado',
  'plan-rollback': 'versión restaurada', 'deload-request': 'descarga', 'running-week': 'semana de carrera',
  'goal-update': 'objetivo', 'target-override': 'objetivo manual', other: 'otra',
};
const COACH_OUTCOME_ES = { accepted: 'aceptada', declined: 'rechazada', done: 'hecha' };
// Los ids de guardarraíl no son Rule IDs, pero tampoco son castellano. Etiqueta corta por id;
// el texto completo (con los números) va en el `title` del chip.
const COACH_GUARD_ES = {
  'LOAD-JUMP': 'salto de carga', 'NO-SOURCE-KG': 'kg sin origen', 'DELOAD-VOLUME': 'volumen en descarga',
  'HARD-CARDIO': 'cardio duro', 'RUN-BEFORE-LEGS': 'dura antes de pierna', 'ANCHOR-SWAP': 'ancla cambiada',
  'VOL-CAP': 'tope de series', 'KM-JUMP': 'salto de km', 'PROTEIN-FLOOR': 'suelo de proteína',
  'KCAL-FLOOR': 'suelo de kcal', 'DELOAD-DIETBREAK': 'diet break', 'PLYO-PLACEMENT': 'colocación del plyo',
  'CORE-PATTERNS': 'patrones de core', 'MIN-STRENGTH': 'mínimo de fuerza', 'DECISION-EVIDENCE': 'decisión sin evidencia',
  'EX-UNKNOWN': 'ejercicio desconocido', 'SESSION-COUNT': 'días de gimnasio', 'EA-GATE': 'energía disponible',
  'MOBILITY-FLOOR': 'suelo de movilidad', 'PRESS-EXPOSURES': 'exposiciones de empuje',
  'SESSION-LENGTH': 'duración de sesión', 'HYBRID-PLUS-LONG': 'híbrido + largo', 'TARGET-N1': 'objetivo con n=1',
  'READINESS-N': 'pocos días de recuperación', 'WEIGHT-WINDOW': 'ventana de peso', 'HARD-BUDGET': 'presupuesto duro',
  'SUMMER-PACE': 'ritmo en verano', 'Z2-CEILING': 'techo de Z2', CHURN: 'demasiados cambios',
  ROTATION: 'rotación fuera de semana 1', 'CTL-FOR-STRENGTH': 'ctl/atl para fuerza',
  'VALIDATOR-ERROR': 'validador incompleto',
};
const COACH_DOW_ES = { 0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb' };

/** "Regla STR-001 (evidencia fuerte): <texto>". El id crudo sólo va en el `title`. */
function COACH_RULE_ES(ruleId) {
  const r = (typeof COACH_RULES !== 'undefined' && COACH_RULES) ? COACH_RULES[ruleId] : null;
  if (!r) return null;
  const nivel = COACH_EVIDENCE_ES[r.evidenceLevel] || r.evidenceLevel || '';
  return { id: ruleId, text: r.rule, level: r.evidenceLevel, levelEs: nivel,
    label: `Regla ${ruleId}${nivel ? ` (evidencia ${nivel})` : ''}` };
}

function _cKg(v) {
  if (v == null || !isFinite(Number(v))) return '—';
  return (typeof _coachFmtKg === 'function') ? _coachFmtKg(Number(v)) : String(v).replace('.', ',');
}
function _cEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s); }
function _cMd(md) {
  if (!md) return '';
  return (typeof markdownToBasicHtml === 'function') ? markdownToBasicHtml(md) : `<p>${_cEsc(md)}</p>`;
}
function _cWeekKey(ds) { return (typeof isoWeekKey === 'function') ? isoWeekKey(ds || today()) : null; }
/** "W37" a partir de "2026-W37": el año sobra en una tarjeta de esta semana. */
function _cWeekShort(wk) { const m = String(wk || '').match(/W(\d{2})$/); return m ? `W${m[1]}` : String(wk || ''); }

// ==================== EL PACK DE HECHOS DESDE LOS STORES ====================
//
// El único sitio de la app que lee los 9 stores a la vez. `buildCoachFacts` es puro y con test
// (`verify-coach-facts.mjs`); esto es exclusivamente el acarreo: leer IDB, inyectar los helpers
// de app.js y pasarle el "hoy" del llamador. Cualquier número que se calculase aquí sería un
// número sin test, que es justo el fallo que el pack existe para corregir.
//
// El contrato exacto de `input`/`deps` está en docs/architecture/coach-facts-schema.md.
async function buildCoachFactsFromStores({ todayStr = today(), weekKey } = {}) {
  if (typeof buildCoachFacts !== 'function') throw new Error('coach-facts.js no cargó');
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

/** Las 3 últimas revisiones, compactas: qué dijo, qué decidió y si se aplicó. */
function _coachPriorReviews(rows) {
  return (rows || [])
    .filter((r) => r && r.output)
    .sort((a, b) => String(b.weekKey || '').localeCompare(String(a.weekKey || ''))
      || (Number(b.attempt || 0) - Number(a.attempt || 0)))
    .slice(0, 3)
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
 */
async function runWeeklyCoach({ weekKey, userNote, regenerate } = {}) {
  const wk = weekKey || _cWeekKey(today());
  if (_coachInvoking) { if (typeof toast === 'function') toast('El coach ya está trabajando'); return null; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (typeof toast === 'function') toast('Sin conexión: se intentará al volver');
    return null;
  }
  const supa = (typeof getSupaClient === 'function') ? getSupaClient() : null;
  const user = (supa && typeof getUser === 'function') ? await getUser() : null;
  if (!supa || !user) {
    if (typeof toast === 'function') toast('Necesitas sesión en la nube para pedir la revisión');
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
    };
    if (userNote) body.userNote = String(userNote).slice(0, COACH_MAX_USER_NOTE);
    if (regenerate) body.regenerate = true;

    // Mismo camino que `parse-meal-photo` (app/nutrition.js): `functions.invoke` pone el token
    // de la sesión en la cabecera Authorization, que es lo que la función valida con
    // `asUser.auth.getUser()`. Un `fetch` a mano tendría que reconstruirlo.
    const { data, error } = await supa.functions.invoke('coach-weekly-review', { body });
    if (error) throw new Error(error.message || 'La función del coach falló');
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
        toast(data.cached ? 'Revisión de esta semana ya hecha (sin coste)' : 'Revisión del coach lista');
      }
      return row;
    }
    throw new Error('Respuesta inesperada del coach');
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
    if (typeof toast === 'function') toast(`El coach falló: ${(e && e.message) || 'error'}`);
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
          ? 'El coach ya tiene la propuesta de la semana'
          : `Revisión del coach: ${COACH_STATUS_ES[row.status] || row.status}`);
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
  if (!review || review.status !== 'proposed') return review;
  const wk = _cWeekKey(today());
  if (!wk || !review.weekKey || String(review.weekKey) >= String(wk)) return review;
  const row = Object.assign({}, review, { status: 'expired', updatedAt: new Date().toISOString() });
  try { await smartPut('coach_reviews', row); } catch (e) { console.warn('[Coach] expirar:', e); }
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
    if (typeof toast === 'function') toast('Esa revisión no trae propuesta');
    return null;
  }
  if (typeof mergeProposal !== 'function' || typeof createNewPlanVersion !== 'function') {
    if (typeof toast === 'function') toast('No se puede aplicar: falta coach-facts.js');
    return null;
  }
  try {
    const prev = (typeof activePlan !== 'undefined') ? activePlan : null;
    const merged = mergeProposal(prev, review.output.proposal);
    const ctx = await _coachValidateCtx(review, prev);
    let guardrails = [];
    try { guardrails = validatePlanVersion(merged, ctx) || []; } catch (e) { console.warn('[Coach] validador:', e); }
    const diff = diffPlanVersions(prev || {}, merged);
    const blk = (typeof blockWeek === 'function') ? blockWeek() : null;

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
        block: merged.block || blk,
        phase: merged.phase || null,
        running: merged.running || null,
        seedRev: (typeof PLAN_REV !== 'undefined') ? PLAN_REV : null,
      },
    });

    // Sólo metadatos sobre la fila anterior: `sessions`/`weekTemplate` se quedan como estaban,
    // que es lo que permite volver a ella. Nunca se borra una versión.
    if (prev && prev.id) {
      try {
        await smartPut('plans', Object.assign({}, prev, { status: 'superseded', supersededBy: nuevo.id }));
      } catch (e) { console.warn('[Coach] superseded:', e); }
    }

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
    try { await smartPut('coach_reviews', row); } catch (e) { console.warn('[Coach] revisión aplicada:', e); }

    const ruleIds = [];
    for (const d of (((review.output || {}).decisions) || [])) {
      for (const r of (d.ruleIds || [])) if (ruleIds.indexOf(r) === -1) ruleIds.push(r);
    }
    if (typeof logDecision === 'function') {
      await logDecision({
        source: 'user', type: 'plan-apply',
        what: `Plan v${nuevo.version} aplicado desde la revisión ${review.weekKey || ''}`.trim(),
        why: 'Aprobado con un toque',
        ruleIds,
        evidence: {
          sesionesTocadas: (merged.touched || []).join(', ') || 'ninguna',
          cambiosEstructurales: diff.structural,
          diasDeTemplate: (diff.weekTemplate || []).length,
          avisos: guardrails.map((g) => g.id).join(', ') || 'ninguno',
          avisosDuros: guardrails.filter((g) => g.level === 'hard').length,
        },
        ref: { planVersion: nuevo.version, reviewId: review.id || null },
        outcome: 'accepted',
      });
    }

    const duros = guardrails.filter((g) => g.level === 'hard').length;
    if (typeof toast === 'function') {
      toast(`Plan v${nuevo.version} activo${guardrails.length ? ` · ${guardrails.length} aviso${guardrails.length === 1 ? '' : 's'}${duros ? ` (${duros} en rojo)` : ''}` : ' · sin avisos'}`);
    }
    try { if (typeof renderHomeView === 'function') await renderHomeView(); } catch (e) {}
    try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
    return nuevo;
  } catch (e) {
    console.warn('[Coach] applyCoachProposal:', e);
    if (typeof toast === 'function') toast(`No se pudo aplicar: ${(e && e.message) || 'error'}`);
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
        what: `Propuesta de ${review.weekKey || 'esta semana'} rechazada`,
        why: reason || 'Sin motivo indicado',
        ruleIds: [],
        evidence: {
          prioridades: ((((review.output || {}).briefing) || {}).priorities || []).join(' · ') || 'ninguna',
          decisiones: (((review.output || {}).decisions) || []).length,
        },
        ref: { reviewId: review.id },
        outcome: 'declined',
      });
    }
    if (typeof toast === 'function') toast('Propuesta rechazada — el plan sigue igual');
    try { await renderCoachWeekCard(); } catch (e) {}
    try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
    return row;
  } catch (e) {
    console.warn('[Coach] rejectCoachProposal:', e);
    if (typeof toast === 'function') toast('No se pudo rechazar');
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
    if (!old) { if (typeof toast === 'function') toast('No encuentro esa versión'); return null; }
    const prev = (typeof activePlan !== 'undefined') ? activePlan : null;
    if (prev && prev.id === toId) { if (typeof toast === 'function') toast('Esa versión ya es la activa'); return null; }
    const base = old.label || old.id;
    const label = /\(restaurada\)\s*$/.test(base) ? base : `${base} (restaurada)`;
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
      },
    });
    if (prev && prev.id) {
      try {
        await smartPut('plans', Object.assign({}, prev, { status: 'superseded', supersededBy: nuevo.id }));
      } catch (e) { console.warn('[Coach] superseded (rollback):', e); }
    }
    if (typeof logDecision === 'function') {
      await logDecision({
        source: 'user', type: 'plan-rollback',
        what: `Vuelta a "${base}" como v${nuevo.version}`,
        why: 'El usuario deshizo el plan activo',
        ruleIds: [],
        evidence: { desde: (prev && prev.label) || null, desdeVersion: (prev && prev.version) != null ? prev.version : null, hasta: toId },
        ref: { planVersion: nuevo.version },
        outcome: 'done',
      });
    }
    if (typeof toast === 'function') toast(`Restaurada como v${nuevo.version}`);
    try { if (typeof renderHomeView === 'function') await renderHomeView(); } catch (e) {}
    try { if (state && state.currentView === 'coach') await renderCoachView(); } catch (e) {}
    return nuevo;
  } catch (e) {
    console.warn('[Coach] rollbackPlanVersion:', e);
    if (typeof toast === 'function') toast('No se pudo restaurar');
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
    console.warn('[Coach] overrides tras aplicar:', e);
  }
}

// ==================== EL DIFF, EN CASTELLANO ====================

function _coachSlotLabel(slot) {
  if (!slot || slot.type === 'rest') return 'descanso';
  if (slot.type === 'gym') {
    const s = (typeof activePlan !== 'undefined' && activePlan && activePlan.sessions) ? activePlan.sessions[slot.session] : null;
    return (s && s.name) || slot.session || 'gimnasio';
  }
  if (slot.type === 'run') return slot.label || 'cardio';
  if (slot.type === 'recovery') return slot.label || 'recuperación';
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
    if (s.reordered) items.push({ kind: 'add', text: 'orden nuevo' });
    for (const c of (s.setsChanged || [])) {
      items.push({ kind: (c.to > c.from ? 'up' : 'down'), text: `${_coachExName(sid, c.exId, prev, merged)} · ${c.from} → ${c.to} series` });
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
    if (s.focusChanged) items.push({ kind: 'add', text: 'foco nuevo' });
    if (s.sessionAdded) items.push({ kind: 'add', text: 'sesión nueva' });
    if (s.sessionRemoved) items.push({ kind: 'remove', text: 'sesión fuera' });
    if (items.length) groups.push({ session: nombreSesion(sid), items });
  }
  const semana = [];
  for (const t of (d.weekTemplate || [])) {
    const sale = !t.to || t.to.type === 'rest';
    semana.push({ kind: sale ? 'remove' : 'add', text: `${COACH_DOW_ES[t.dow]} · ${_coachSlotLabel(t.from)} → ${_coachSlotLabel(t.to)}` });
  }
  if (d.running) {
    const a = d.running.from || {}, b = d.running.to || {};
    if ((a.weeklyKmTarget || null) !== (b.weeklyKmTarget || null)) {
      semana.push({ kind: (Number(b.weeklyKmTarget) > Number(a.weeklyKmTarget || 0) ? 'up' : 'down'), text: `Carrera · ${a.weeklyKmTarget != null ? a.weeklyKmTarget : '—'} → ${b.weeklyKmTarget != null ? b.weeklyKmTarget : '—'} km/sem` });
    }
    if ((a.longRunKm || null) !== (b.longRunKm || null)) {
      semana.push({ kind: (Number(b.longRunKm) > Number(a.longRunKm || 0) ? 'up' : 'down'), text: `Largo · ${a.longRunKm != null ? a.longRunKm : '—'} → ${b.longRunKm != null ? b.longRunKm : '—'} km` });
    }
  }
  for (const dow of (merged && merged.cardioDays) || []) {
    const c = ((merged.weekTemplate || {})[dow] || {}).cardio || {};
    if (c.durationMin != null) semana.push({ kind: 'up', text: `${COACH_DOW_ES[dow]} · ${c.subtype || 'zone2'} ${c.durationMin}′` });
  }
  if (semana.length) groups.push({ session: 'Semana', items: semana });
  return { diff: d, groups };
}

function _coachDiffHtml(groups, max) {
  if (!groups || !groups.length) return '<div class="coach-week-empty">Sin cambios estructurales.</div>';
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
  if (lim && total > pintados) out.push(`<div class="coach-week-more">+${total - pintados} cambio${total - pintados === 1 ? '' : 's'} más en la vista Coach</div>`);
  return out.join('');
}

function _coachGuardChipsHtml(guardrails) {
  const gs = (guardrails || []).filter((g) => g && g.id);
  if (!gs.length) return '';
  return `<div class="coach-week-chips">${gs.map((g) => {
    const dur = g.level === 'hard';
    return `<span class="coach-week-chip ${dur ? '-hard' : '-warn'}" title="${_cEsc(g.text || '')}">${_cEsc(COACH_GUARD_ES[g.id] || g.id)}</span>`;
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
    const out = validatePlanVersion(merged, ctx) || [];
    _coachGuardCache.set(key, out);
    // Un par de entradas bastan (la revisión de esta semana y la anterior); el mapa no crece.
    if (_coachGuardCache.size > 4) _coachGuardCache.delete(_coachGuardCache.keys().next().value);
    return out;
  } catch (e) {
    console.warn('[Coach] guardarraíles (preview):', e);
    return [];
  }
}

// ==================== TARJETA DE HOME ====================
//
// Estados (§A.7): `running` con su contador · `proposed` con las 3 prioridades, el plan de la
// semana plegado, el diff por sesión, los chips de aviso y los tres botones · `applied` con la
// versión y el Deshacer · `failed` con la causa · `expired`/`rejected` con una línea. Sin
// revisión, la tarjeta no se pinta: un hueco vacío en Home es peor que no tener tarjeta.
async function renderCoachWeekCard(opts = {}) {
  const el = document.getElementById('coach-week-card');
  if (!el) return;
  try {
    if (opts.pending) {
      el.classList.remove('hidden');
      el.innerHTML = `<div class="card coach-week-card">
        <div class="coach-week-head"><span class="coach-week-title">Coach · ${_cEsc(_cWeekShort(_cWeekKey(today())))}</span></div>
        <div class="coach-week-line">Preparando los hechos de la semana…</div>
      </div>`;
      return;
    }
    let review = await _coachLatestReview();
    review = await _coachExpireIfStale(review);
    if (!review) { el.classList.add('hidden'); el.innerHTML = ''; return; }

    const wkTxt = _cEsc(_cWeekShort(review.weekKey));
    const head = (extra) => `<div class="coach-week-head">
        <span class="coach-week-title">Coach · ${wkTxt}</span>
        ${extra || ''}
        <button class="coach-week-open" id="coach-week-open">Coach ›</button>
      </div>`;

    let cuerpo = '';
    let acciones = '';

    if (review.status === 'running') {
      const desde = (_coachPoll && _coachPoll.reviewId === review.id) ? _coachPoll.started : Number(review.createdAt || Date.now());
      const rendido = _coachPollGaveUp === review.id;
      cuerpo = rendido
        ? '<div class="coach-week-line">Sigue en marcha; vuelve más tarde. La revisión llegará con la próxima sincronización.</div>'
        : `<div class="coach-week-line">El coach está revisando ${wkTxt}… <span id="coach-week-elapsed" class="coach-week-mono">${_coachElapsed(desde)}</span></div>`;
      if (rendido) acciones = '<button class="coach-btn" id="coach-week-regen">Regenerar</button>';
      else if (!_coachPoll || _coachPoll.reviewId !== review.id) pollCoachReview(review.id);
    } else if (review.status === 'proposed') {
      const prev = (typeof activePlan !== 'undefined') ? activePlan : {};
      const merged = (typeof mergeProposal === 'function') ? mergeProposal(prev, (review.output || {}).proposal || {}) : null;
      const { groups } = merged ? coachDiffGroups(prev, merged) : { groups: [] };
      const guardrails = merged ? await _coachPreviewGuardrails(review, prev, merged) : [];
      const brief = (review.output || {}).briefing || {};
      const prios = (brief.priorities || []).slice(0, 3);
      cuerpo = `
        ${prios.length ? `<ol class="coach-week-prios">${prios.map((p) => `<li>${_cEsc(p)}</li>`).join('')}</ol>` : ''}
        ${brief.nextWeek ? `<details class="coach-week-next"><summary>La semana que viene</summary><div class="coach-week-md">${_cMd(brief.nextWeek)}</div></details>` : ''}
        <div class="coach-week-diff">${_coachDiffHtml(groups, 8)}</div>
        ${_coachGuardChipsHtml(guardrails)}`;
      // NINGÚN BOTÓN DESHABILITADO, tampoco con avisos duros: los duros restringen al coach,
      // no al usuario (principio 4 del plan).
      acciones = `
        <button class="coach-btn coach-btn-primary" id="coach-week-apply">Aplicar</button>
        <button class="coach-btn" id="coach-week-reject">Rechazar</button>
        <button class="coach-btn" id="coach-week-regen-note">Regenerar con nota</button>`;
    } else if (review.status === 'applied') {
      const ver = (typeof activePlan !== 'undefined' && activePlan && activePlan.version != null) ? activePlan.version : null;
      const n = (review.guardrails || []).length;
      cuerpo = `<div class="coach-week-line">Plan ${wkTxt} activo${ver != null ? ` (v${ver})` : ''} · ${n ? `${n} aviso${n === 1 ? '' : 's'}` : 'sin avisos'}</div>`;
      const volver = (typeof activePlan !== 'undefined' && activePlan && activePlan.basedOn) || null;
      if (volver) acciones = `<button class="coach-btn" id="coach-week-undo" data-plan="${_cEsc(volver)}">Deshacer</button>`;
    } else if (review.status === 'failed') {
      const kind = (review.error && review.error.kind) || 'api';
      cuerpo = `<div class="coach-week-line coach-week-bad">La revisión de ${wkTxt} falló: ${_cEsc(COACH_ERROR_ES[kind] || kind)}.</div>`;
      acciones = '<button class="coach-btn" id="coach-week-regen">Regenerar</button>';
    } else if (review.status === 'expired' || review.status === 'rejected') {
      cuerpo = `<div class="coach-week-line">Propuesta de ${wkTxt} ${review.status === 'expired' ? 'vencida (era de una semana anterior)' : 'rechazada'}.</div>`;
      acciones = '<button class="coach-btn" id="coach-week-regen">Regenerar</button>';
    } else {
      el.classList.add('hidden'); el.innerHTML = ''; return;
    }

    el.classList.remove('hidden');
    el.innerHTML = `<div class="card coach-week-card">
      ${head()}
      ${cuerpo}
      ${acciones ? `<div class="coach-actions">${acciones}</div>` : ''}
    </div>`;

    const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    on('coach-week-open', () => openCoachView());
    on('coach-week-apply', async () => { await applyCoachProposal(review); });
    on('coach-week-reject', async () => {
      const why = (typeof prompt === 'function') ? prompt('¿Por qué la rechazas? (opcional)') : null;
      if (why === null) return;   // Cancelar no rechaza
      await rejectCoachProposal(review, (why || '').trim() || null);
    });
    on('coach-week-regen', () => runWeeklyCoach({ weekKey: _cWeekKey(today()), regenerate: true }));
    on('coach-week-regen-note', () => {
      const nota = (typeof prompt === 'function') ? prompt('¿Qué debería tener en cuenta? (una o dos frases)') : null;
      if (!nota) return;
      return runWeeklyCoach({ weekKey: _cWeekKey(today()), userNote: nota.trim(), regenerate: true });
    });
    on('coach-week-undo', (e) => rollbackPlanVersion(e.currentTarget.dataset.plan));
  } catch (e) {
    // Patrón `renderHomeView`: cada sección con su try/catch.
    console.warn('[Coach] renderCoachWeekCard:', e);
    el.classList.add('hidden');
    el.innerHTML = '';
  }
}

// ==================== VISTA COACH ====================

function openCoachView() {
  if (typeof showView === 'function') showView('coach');
  if (typeof updateHeader === 'function') updateHeader('coach');
  renderCoachView().catch((e) => console.warn('[Coach] vista:', e));
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
  await seccion('coach-versions', (el) => _coachRenderVersions(el));
}

async function _coachRenderWeek(el, review) {
  const blk = (typeof blockWeek === 'function') ? blockWeek() : null;
  const lunes = blk && blk.deloadMonday ? blk.deloadMonday : null;
  const total = (typeof DELOAD_BLOCK_WEEKS !== 'undefined') ? DELOAD_BLOCK_WEEKS : (blk && blk.weeksTotal) || 5;
  const bloque = (blk && blk.index)
    ? `Semana ${blk.index}/${total} · ${_cEsc(blk.label || '')}${lunes ? ` · descarga el ${_cEsc(lunes)}` : ''}`
    : 'Sin ancla de bloque';

  let recu = '';
  try {
    const r = (typeof computeReadiness === 'function') ? await computeReadiness() : null;
    if (r) {
      const ES = { green: 'verde', yellow: 'amarilla', red: 'roja', unknown: 'sin dato de hoy' };
      const COL = { green: 'var(--accent)', yellow: 'var(--yellow)', red: 'var(--red)', unknown: 'var(--text3)' };
      recu = `<span class="coach-week-readiness" style="color:${COL[r.color] || 'var(--text3)'}">recuperación ${_cEsc(ES[r.color] || r.color)}</span>`;
    }
  } catch (e) { recu = ''; }

  const prios = ((((review || {}).output) || {}).briefing || {}).priorities || [];
  el.innerHTML = `<div class="card coach-week-card">
    <div class="coach-week-head">
      <span class="coach-week-title">${_cEsc(review && review.weekKey ? _cWeekShort(review.weekKey) : _cWeekShort(_cWeekKey(today())))}</span>
      ${recu}
    </div>
    <div class="coach-week-line">${bloque}</div>
    ${review ? `<div class="coach-week-status">Revisión ${_cEsc(COACH_STATUS_ES[review.status] || review.status || '—')}${review.attempt ? ` · intento ${review.attempt}` : ''}</div>` : '<div class="coach-week-status">Aún no hay revisión de esta semana.</div>'}
    ${prios.length ? `<ol class="coach-week-prios">${prios.slice(0, 3).map((p) => `<li>${_cEsc(p)}</li>`).join('')}</ol>` : ''}
  </div>`;
}

async function _coachRenderBriefing(el, review) {
  const brief = (((review || {}).output) || {}).briefing || null;
  if (brief && (brief.lastWeek || brief.nextWeek)) {
    el.innerHTML = `<div class="card coach-brief">
      ${brief.lastWeek ? `<div class="coach-brief-title">Qué pasó</div><div class="coach-week-md">${_cMd(brief.lastWeek)}</div>` : ''}
      ${brief.nextWeek ? `<div class="coach-brief-title" style="margin-top:12px">Qué cambio</div><div class="coach-week-md">${_cMd(brief.nextWeek)}</div>` : ''}
    </div>`;
    return;
  }
  // Fallback legacy: la prosa del cron retirado (`weekly_reviews`), sólo lectura.
  const all = await dbGetAll('weekly_reviews').catch(() => []);
  const latest = (all || []).slice().sort((a, b) => (b.generatedAt || 0) - (a.generatedAt || 0))[0];
  const cv = latest && latest.coachVoice;
  if (!cv && !(latest && latest.observed)) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card coach-brief">
    <div class="coach-brief-title">Qué pasó <span class="coach-brief-legacy">${_cEsc(latest.weekKey || '')} · revisión antigua</span></div>
    <div class="coach-week-md">${_cMd((cv && cv.lastWeek) || latest.observed || '')}</div>
    ${(cv && cv.nextWeek) || latest.planNext ? `<div class="coach-brief-title" style="margin-top:12px">Qué cambio</div><div class="coach-week-md">${_cMd((cv && cv.nextWeek) || latest.planNext)}</div>` : ''}
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
      const r = COACH_RULE_ES(rid);
      return r
        ? `<li title="${_cEsc(rid)}"><b>${_cEsc(r.label)}:</b> ${_cEsc(r.text)}</li>`
        : `<li title="${_cEsc(rid)}">Regla sin texto en el corpus local.</li>`;
    }).join('');
    return `<div class="coach-dec">
      <div class="coach-dec-what"><b>${_cEsc(d.what || '')}</b>${d.type ? ` <span class="coach-dec-type">${_cEsc(COACH_DECISION_ES[d.type] || d.type)}</span>` : ''}</div>
      ${d.why ? `<div class="coach-dec-why">${_cEsc(d.why)}</div>` : ''}
      ${cifras ? `<div class="coach-dec-nums">${cifras}</div>` : ''}
      ${reglas ? `<details class="coach-dec-rules"><summary>por qué</summary><ul>${reglas}</ul></details>` : ''}
    </div>`;
  }).join('');

  const pedidos = ((review.output || {}).requestedData || []);
  el.innerHTML = `<div class="card coach-week-card">
    <div class="coach-week-head"><span class="coach-week-title">Propuesta · ${_cEsc(_cWeekShort(review.weekKey))}</span></div>
    <div class="coach-week-diff">${_coachDiffHtml(groups)}</div>
    ${decisiones ? `<div class="coach-decs">${decisiones}</div>` : ''}
    ${_coachGuardChipsHtml(guardrails)}
    ${pedidos.length ? `<div class="coach-week-status">Lo que el coach pide: ${_cEsc(pedidos.slice(0, 4).join(' · '))}</div>` : ''}
    ${(review.sanitized || []).length ? `<details class="coach-dec-rules"><summary>saneado al recibir (${review.sanitized.length})</summary><ul>${review.sanitized.slice(0, 12).map((s) => `<li>${_cEsc(s)}</li>`).join('')}</ul></details>` : ''}
    <div class="coach-actions">
      <button class="coach-btn coach-btn-primary" id="coach-view-apply">Aplicar</button>
      <button class="coach-btn" id="coach-view-reject">Rechazar</button>
      <button class="coach-btn" id="coach-view-regen">Regenerar con nota</button>
    </div>
  </div>`;

  const on = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
  on('coach-view-apply', async () => { await applyCoachProposal(review); });
  on('coach-view-reject', async () => {
    const why = (typeof prompt === 'function') ? prompt('¿Por qué la rechazas? (opcional)') : null;
    if (why === null) return;
    await rejectCoachProposal(review, (why || '').trim() || null);
  });
  on('coach-view-regen', () => {
    const nota = (typeof prompt === 'function') ? prompt('¿Qué debería tener en cuenta? (una o dos frases)') : null;
    if (!nota) return;
    return runWeeklyCoach({ weekKey: _cWeekKey(today()), userNote: nota.trim(), regenerate: true });
  });
}

async function _coachRenderDecisions(el) {
  const all = await dbGetAll('decisions').catch(() => []);
  const rows = (all || []).filter((d) => d && d.id)
    .sort((a, b) => (Number(b.ts || 0) - Number(a.ts || 0)) || String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, 20);
  if (!rows.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="card coach-decs-card">
    <div class="coach-brief-title">Decisiones</div>
    ${rows.map((d) => `<div class="coach-dec-row">
      <span class="coach-dec-date">${_cEsc(d.date || '')}</span>
      <span class="coach-dec-kind">${_cEsc(COACH_DECISION_ES[d.type] || d.type || '')}</span>
      <span class="coach-dec-txt">${_cEsc(d.what || '')}</span>
      ${d.outcome ? `<span class="coach-dec-out -${_cEsc(d.outcome)}">${_cEsc(COACH_OUTCOME_ES[d.outcome] || d.outcome)}</span>` : ''}
    </div>`).join('')}
  </div>`;
}

async function _coachRenderVersions(el) {
  const rows = await dbGetAll('plans').catch(() => []);
  const plans = (rows || []).filter((p) => p && p.id)
    .sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))
    .slice(0, 20);
  if (!plans.length) { el.innerHTML = ''; return; }
  const activaId = (typeof activePlan !== 'undefined' && activePlan) ? activePlan.id : null;
  const AUT = { 'coach-llm': 'Coach', 'ideal-seed': 'Ideal', user: 'Tú' };
  el.innerHTML = `<div class="card coach-vers-card">
    <div class="coach-brief-title">Versiones del plan</div>
    ${plans.map((p) => {
      const activa = p.id === activaId;
      const partes = [`v${p.version != null ? p.version : '?'}`];
      if (p.author) partes.push(AUT[p.author] || p.author);
      if (p.weekKey) partes.push(_cWeekShort(p.weekKey));
      return `<div class="coach-ver-row${activa ? ' -active' : ''}">
        <span class="coach-ver-label">${_cEsc(partes.join(' · '))}${activa ? ' · activa' : ''}</span>
        <span class="coach-ver-name">${_cEsc(p.label || '')}</span>
        ${activa ? '' : `<button class="coach-ver-back" data-plan="${_cEsc(p.id)}">Volver a esta</button>`}
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
  if (btn) { btn.disabled = true; btn.textContent = 'Construyendo…'; }
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
        if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Facts del coach' }); copiado = true; }
      } catch (e) { copiado = false; }
    }

    if (out) {
      out.classList.remove('hidden');
      out.innerHTML = copiado
        ? `<p class="muted" style="font-size:11px;margin:0">Copiado · ${kb} KB · ${gaps} hueco${gaps === 1 ? '' : 's'} de datos declarado${gaps === 1 ? '' : 's'}.</p>`
        : `<p class="muted" style="font-size:11px;margin:0 0 6px">No se pudo copiar solo (${kb} KB). Selecciona y copia:</p>
           <textarea readonly rows="6" class="text-input" style="width:100%;font-family:var(--font-mono);font-size:10px">${_cEsc(json)}</textarea>`;
    }
    if (typeof toast === 'function') toast(`Facts: ${kb} KB · ${gaps} hueco${gaps === 1 ? '' : 's'} de datos`);
    return facts;
  } catch (e) {
    console.warn('[Coach] exportCoachFacts:', e);
    if (out) { out.classList.remove('hidden'); out.innerHTML = `<p class="muted" style="font-size:11px;margin:0;color:var(--red)">${_cEsc((e && e.message) || 'error')}</p>`; }
    if (typeof toast === 'function') toast('No se pudo construir el pack');
    return null;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Exportar facts JSON'; }
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
    toast(v === 'ask' ? 'El coach propone, tú apruebas' : 'Guardado — el modo automático llega más adelante');
  }
}

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderCoachReadout, renderReadinessSignals, renderGoalsCard,
    COACH_APP_VERSION, COACH_RULE_ES, COACH_EVIDENCE_ES, COACH_GUARD_ES, COACH_STATUS_ES,
    buildCoachFactsFromStores, maybeRunWeeklyCoach, runWeeklyCoach, pollCoachReview,
    applyCoachProposal, rejectCoachProposal, rollbackPlanVersion,
    renderCoachWeekCard, renderCoachView, openCoachView, coachDiffGroups,
    exportCoachFacts, coachAutoApplyMode, setCoachAutoApply,
  };
}
