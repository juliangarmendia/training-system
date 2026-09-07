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

// Exports para los tests (Node los carga con `vm`); en el navegador no estorba.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderCoachReadout, renderReadinessSignals };
}
