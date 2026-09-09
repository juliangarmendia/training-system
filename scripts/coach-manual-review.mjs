#!/usr/bin/env node
// La revisión semanal del coach A MANO, con el MISMO contrato que la edge function.
//
// "Quiero poder hacerla con el API (desde la web) o desde aquí para no gastar API, debería ser lo
// mismo, ¿no?" (Julian, 2026-09-09). Este script es lo que hace que sea lo mismo: la única pieza
// que cambia es quién escribe el JSON — Claude Code en la sesión en vez de Opus en la función.
// Todo lo demás es idéntico y viene de los mismos ficheros:
//
//   · El PACK. En modo manual, "Cerrar la semana" en la app deja una fila `requested` en
//     `coach_reviews` con `facts` (el pack determinista de `buildCoachFacts`) y `request`
//     (`currentPlan`, `allowed`, `priorReviews`, `lowerSessionIds`): exactamente el `body` que
//     viajaría a `coach-weekly-review`. Sin fila `requested`, el pack sale de `--facts` (el JSON
//     de "Export facts JSON" en Ajustes) o de la fila que sea (`--row`), y el plan/vocabulario se
//     derivan de `plans` y `exercises` con las mismas reglas que `_coachCurrentPlan`/`_coachAllowed`.
//   · El PROMPT. `prompt.ts` se importa tal cual (Node ≥ 23 borra los tipos): `SYSTEM_STATIC` +
//     `buildDynamicSystem` + `buildUserMessage`. Lo que lee el modelo es lo que lee la sesión.
//   · El VALIDADOR. `coach-facts.generated.js` (el mismo `validatePlanVersion` que corre en la
//     función y en el teléfono) con el mismo `ctx` que `runGuardrails` en `index.ts`.
//   · La FILA. Misma forma que `finish()` en `index.ts`: `status:'proposed'`, `output`,
//     `guardrails`, `guardrailsMeta`, `factsHash` (con `promptVersion`), y las marcas
//     `usage.source:'manual'`, `prompt.model:'manual-claude'` para distinguirla.
//
// LO QUE NO HACE: escribir en `plans`. Aplicar sigue siendo el toque de Julian en la app.
//
// Uso (desde la raíz del repo; la service_role se lee EN MEMORIA con la CLI de Supabase):
//   node scripts/coach-manual-review.mjs pending
//   node scripts/coach-manual-review.mjs pack     --week 2026-W38 [--out DIR] [--facts f.json | --row 2026-W38#1]
//   node scripts/coach-manual-review.mjs validate --week 2026-W38 --output DIR/output.json
//   node scripts/coach-manual-review.mjs write    --week 2026-W38 --output DIR/output.json [--row ID] [--allow-hard]
//
// `pack` deja en DIR: pack.json (facts+plan+allowed+prior), prompt.md (el prompt completo, para
// leerlo) y output.template.json (el esqueleto del contrato). Se escribe `output.json` a mano,
// `validate` lo pasa por el contrato y el validador, y `write` lo sube.

import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FN_DIR = path.join(ROOT, 'supabase', 'functions', 'coach-weekly-review');
const REF = process.env.SUPABASE_PROJECT_REF || 'ycfodifvpvosukepcxie';
const URL_BASE = `https://${REF}.supabase.co`;

// Mismos valores que `index.ts`. Si allí cambian, aquí también (verify-coach-manual-mode lo vigila).
const PROMPT_VERSION = 2;
const PHASES = ['base', 'build', 'intensify', 'deload', 'maintenance'];
const WS_STATUS = ['kept', 'changed', 'new', 'removed'];
const MAX_SESSIONS = 6;
const MAX_EX_PER_SESSION = 10;
const MAX_FOCUS = 160;
const MAX_WHY = 600;
const MAX_SUMMARY_LINE = 160;
const VERBOSE_LASTWEEK = 1500;
const VERBOSE_NEXTWEEK = 2500;
// v11.70 (C-3): los topes de SANEADO de `index.ts`. Antes el script validaba y no saneaba: un
// `kg: 82.3` manual llegaba al plan tal cual y `suggestSetTarget` progresaba desde un peso que no
// existe en discos. `verify-coach-manual-mode` compara cada uno con su gemelo de la función.
const MAX_NOTE = 240;
const N_PRIORITIES = 3;
const MAX_CARDIO_SLOTS = 10;
const MAX_DECISIONS = 12;
const MAX_TEMPLATE_CHANGES = 7;
const MAX_REQUESTED_DATA = 8;
const ROUND_KG = 1.25;
const MAX_LASTWEEK_BULLETS = 3;
const MAX_WEEK_SUMMARY = 12;
const VOICE_LASTWEEK = 900;
const VOICE_NEXTWEEK = 1400;
const VOICE_WHY = 350;
const HEADERS = {
  lastWeek: ['## What happened', '## Previous decisions'],
  nextWeek: ['## What I am changing', '## Why it changes', '## Why it holds', '## What I am watching', '## What I need from you'],
};
const LOWER_MUSCLE_RE = /quad|ham|glute|calf|adduct|abduct|pierna|leg|hip/i;
const LOWER_PATTERN_RE =
  /squat|deadlift|-dl$|-dl-|\brdl\b|rdl$|leg-(curl|press|extension)|lunge|^bss$|step-up|hip-thrust|glute|calf|good-morning|split-squat|nordic|ghr/i;
// `measureUnitFor` en app.js: ejercicios que se registran en cm/reps y cuyo kg va SIEMPRE null.
const MEASURE_IDS = new Set(['box-jump']);

// ── CLI ───────────────────────────────────────────────────────────────────────────────
const [, , cmd = 'help', ...argv] = process.argv;
const args = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const k = a.slice(2);
    const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
    args[k] = v;
  }
}

function usage() {
  console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).slice(0, 32).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}

if (cmd === 'help' || cmd === '--help' || cmd === '-h') { usage(); process.exit(0); }

// ── Supabase (service role en memoria; nunca se imprime) ─────────────────────────────
let SR = null;
function serviceRole() {
  if (SR) return SR;
  const out = execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const keys = JSON.parse(out);
  SR = (keys.find((k) => k.name === 'service_role') || {}).api_key;
  if (!SR) throw new Error('No se pudo leer la service_role con la CLI de Supabase');
  return SR;
}

async function rest(pathq, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathq}`, {
    method,
    headers: { apikey: serviceRole(), Authorization: `Bearer ${serviceRole()}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`${method} ${pathq} → ${res.status} ${txt.slice(0, 300)}`);
  return txt ? JSON.parse(txt) : null;
}

let USER = process.env.COACH_USER_ID || args.user || null;
async function userId() {
  if (USER) return USER;
  const rows = await rest('plans?select=user_id&limit=1');
  if (!rows || !rows.length) throw new Error('No hay filas en `plans`: pasa --user <uuid>');
  USER = rows[0].user_id;
  return USER;
}

const enc = (s) => encodeURIComponent(s);

async function loadWeekRows(week) {
  const u = await userId();
  const rows = await rest(`coach_reviews?user_id=eq.${u}&record_id=like.${enc(`${week}#*`)}&select=record_id,data`);
  return (rows || []).sort((a, b) => Number(a.data?.attempt || 0) - Number(b.data?.attempt || 0));
}
async function loadAllReviews() {
  const u = await userId();
  return (await rest(`coach_reviews?user_id=eq.${u}&select=record_id,data`)) || [];
}
async function loadPlan() {
  const u = await userId();
  const rows = (await rest(`plans?user_id=eq.${u}&select=record_id,data`)) || [];
  if (!rows.length) throw new Error('No hay filas en `plans`');
  return rows.map((r) => r.data).sort((a, b) => Number(b.version || 0) - Number(a.version || 0))[0];
}
async function loadExercises() {
  const u = await userId();
  return ((await rest(`exercises?user_id=eq.${u}&select=data`)) || []).map((r) => r.data).filter((e) => e && e.id);
}

// ── Réplicas de coach.js (mismas reglas, para el caso sin fila `requested`) ──────────
function compactPlan(p) {
  const sessions = {};
  for (const [sid, s] of Object.entries(p.sessions || {})) {
    sessions[sid] = {
      id: sid, name: s.name || sid, focus: s.focus || null,
      exercises: (s.exercises || []).map((ex) => ({
        id: ex.id, name: ex.name || ex.id, muscle: ex.muscle || null,
        sets: ex.sets != null ? ex.sets : null, reps: ex.reps || null, rpe: ex.rpe || null,
        optional: !!ex.optional, superset: ex.superset || null, target: ex.target || null,
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
function deriveAllowed(plan, library) {
  const planEx = {};
  const ids = [];
  const seen = new Set();
  const push = (id) => { if (id && !seen.has(id)) { seen.add(id); ids.push(id); } };
  for (const s of Object.values(plan.sessions || {})) {
    for (const ex of (s.exercises || [])) if (ex && ex.id) { if (!planEx[ex.id]) planEx[ex.id] = ex; push(ex.id); }
  }
  const lib = Object.fromEntries((library || []).map((e) => [e.id, e]));
  for (const id of Object.keys(lib)) push(id);
  return {
    sessionIds: Object.keys(plan.sessions || {}).slice(0, 12),
    exerciseIds: ids.slice(0, 150).map((id) => {
      const p = planEx[id] || {};
      const l = lib[id] || {};
      return { id, name: p.name || l.name || id, muscle: p.muscle || l.muscle || null, db: !!(p.db || l.db), bw: !!(p.bw || l.bw), measure: MEASURE_IDS.has(id) || !!l.measure };
    }),
  };
}
function priorReviewsFrom(rows) {
  return (rows || []).map((r) => r.data || r).filter((r) => r && r.output)
    .sort((a, b) => String(b.weekKey || '').localeCompare(String(a.weekKey || '')) || (Number(b.attempt || 0) - Number(a.attempt || 0)))
    .slice(0, 6)
    .map((r) => ({
      weekKey: r.weekKey || null, status: r.status || null, applied: r.status === 'applied',
      priorities: (((r.output || {}).briefing || {}).priorities || []).slice(0, 3),
      decisions: ((r.output || {}).decisions || []).slice(0, 12).map((d) => ({ id: d.id, type: d.type, what: d.what })),
    }));
}
function deriveLowerSessionIds(plan, allowed) {
  const byId = new Map((allowed.exerciseIds || []).map((e) => [e.id, e]));
  const out = [];
  for (const [sid, s] of Object.entries(plan.sessions || {})) {
    if (/full|hybrid/i.test(sid)) { out.push(sid); continue; }
    const isLower = (s.exercises || []).some((ex) => {
      const id = String(ex?.id ?? '');
      const muscle = String(ex?.muscle ?? byId.get(id)?.muscle ?? '');
      return LOWER_MUSCLE_RE.test(muscle) || LOWER_PATTERN_RE.test(id);
    });
    if (isLower) out.push(sid);
  }
  return out;
}

// ── El pack ───────────────────────────────────────────────────────────────────────────
function outDir(week) {
  const d = args.out || process.env.COACH_MANUAL_OUT || path.join(tmpdir(), 'coach-manual', week);
  mkdirSync(d, { recursive: true });
  return d;
}
const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

async function buildPack(week) {
  const rows = await loadWeekRows(week);
  let row = null;
  if (args.row) row = rows.find((r) => r.record_id === args.row) || null;
  else row = rows.filter((r) => r.data?.status === 'requested').pop() || null;

  let facts, currentPlan, allowed, priorReviews, lowerSessionIds, userNote = null, source;
  if (row && row.data && row.data.request) {
    // El camino bueno: la app dejó el body entero.
    facts = row.data.facts;
    currentPlan = row.data.request.currentPlan;
    allowed = row.data.request.allowed;
    priorReviews = row.data.request.priorReviews || [];
    lowerSessionIds = row.data.request.lowerSessionIds || [];
    userNote = row.data.userNote || null;
    source = `fila ${row.record_id} (${row.data.status}, request de la app)`;
  } else {
    if (args.facts) facts = readJson(args.facts);
    else if (row && row.data && row.data.facts) facts = row.data.facts;
    else throw new Error(`No hay fila requested para ${week} ni --facts/--row: cierra la semana en la app (modo manual) o exporta el facts JSON`);
    const [plan, library, all] = await Promise.all([loadPlan(), loadExercises(), loadAllReviews()]);
    currentPlan = compactPlan(plan);
    allowed = deriveAllowed(plan, library);
    priorReviews = priorReviewsFrom(all.filter((r) => !String(r.record_id).startsWith(`${week}#`)));
    lowerSessionIds = deriveLowerSessionIds(plan, allowed);
    userNote = (row && row.data && row.data.userNote) || null;
    source = args.facts ? `--facts ${args.facts} + plan v${plan.version} de \`plans\`` : `fila ${row.record_id} (${row.data.status}) + plan v${plan.version} de \`plans\``;
  }
  return { week, row, rows, facts, currentPlan, allowed, priorReviews, lowerSessionIds, userNote, source };
}

async function cmdPack() {
  const week = mustWeek();
  const pack = await buildPack(week);
  const dir = outDir(week);
  const P = await import(pathToFileURL(path.join(FN_DIR, 'prompt.ts')).href);
  const todayStr = new Date().toISOString().slice(0, 10);
  const prompt = [
    '# ===== SYSTEM (estático, cacheable) =====', P.SYSTEM_STATIC,
    '# ===== SYSTEM (dinámico) =====', P.buildDynamicSystem({ allowed: pack.allowed, todayStr, weekKey: week }),
    '# ===== USER =====', P.buildUserMessage({ facts: pack.facts, currentPlan: pack.currentPlan, priorReviews: pack.priorReviews, userNote: pack.userNote || undefined, weekKey: week }),
  ].join('\n\n');
  writeFileSync(path.join(dir, 'pack.json'), JSON.stringify({ week: pack.week, source: pack.source, rowId: pack.row?.record_id || null, facts: pack.facts, currentPlan: pack.currentPlan, allowed: pack.allowed, priorReviews: pack.priorReviews, lowerSessionIds: pack.lowerSessionIds, userNote: pack.userNote }, null, 1));
  writeFileSync(path.join(dir, 'prompt.md'), prompt);
  writeFileSync(path.join(dir, 'output.template.json'), JSON.stringify(template(pack), null, 2));
  console.log(`pack: ${pack.source}`);
  console.log(`  semana ${week} · plan v${pack.currentPlan?.version} · ${pack.allowed.sessionIds.length} sesiones · ${pack.allowed.exerciseIds.length} ejercicios · ${pack.priorReviews.length} revisiones previas · reglas ${P.RULES_COUNT}`);
  console.log(`  facts ${JSON.stringify(pack.facts).length} B · prompt ${prompt.length} chars`);
  console.log(`  → ${dir}\\pack.json · prompt.md · output.template.json`);
  console.log('Siguiente: leer prompt.md, escribir output.json en ese directorio y ejecutar `validate`.');
}

function template(pack) {
  const sessions = pack.allowed.sessionIds;
  return {
    briefing: {
      focus: '', phase: 'base',
      lastWeek: '## What happened (week W, n days of data)\n\n\n## Previous decisions\n',
      lastWeekSummary: ['', '', ''], whyChanged: '', whyKept: '',
      nextWeek: '## What I am changing — max 3 priorities\n\n## Why it changes\n\n## Why it holds\n\n## What I am watching\n\n## What I need from you\n',
      priorities: ['', '', ''],
    },
    decisions: [{ id: `${pack.week}-…`, type: 'progression|structure|running|nutrition|recovery', what: '', why: '', evidence: { numbers: {} }, ruleIds: [], confidence: 'medium' }],
    proposal: {
      label: '', phase: 'base',
      weekSummary: sessions.map((sessionId) => ({ sessionId, status: 'kept', line: '' })),
      sessions: [], cardio: [], running: { weeklyKmTarget: 0, longRunKm: null, hardSessions: 0 }, weekTemplateChanges: [],
    },
    requestedData: [],
  };
}

// ── Saneado: lo que `sanitizeOutput` hace en la función, aquí ─────────────────────────
// Devuelve una COPIA saneada y las notas (van a `sanitized[]` de la fila, como en la función).
function sanitizeLite(raw, pack) {
  const notes = [];
  const o = JSON.parse(JSON.stringify(raw));
  const b = o.briefing = o.briefing || {};
  const p = o.proposal = o.proposal || {};
  const clipS = (v, max) => { const t = String(v ?? ''); return t.length > max ? t.slice(0, max) : t; };
  const roundKg = (v) => Math.round(Number(v) / ROUND_KG) * ROUND_KG;
  const trim = (arr, max, label) => {
    if (!Array.isArray(arr)) return arr;
    if (arr.length > max) { notes.push(`${label}: ${arr.length} → keeping the first ${max}`); return arr.slice(0, max); }
    return arr;
  };
  const sessionIds = new Set((pack?.allowed?.sessionIds) || []);

  b.focus = clipS(b.focus, MAX_FOCUS);
  b.whyChanged = clipS(b.whyChanged, MAX_WHY);
  b.whyKept = clipS(b.whyKept, MAX_WHY);
  b.lastWeekSummary = (trim(b.lastWeekSummary || [], MAX_LASTWEEK_BULLETS, 'lastWeekSummary')).map((l) => clipS(l, MAX_SUMMARY_LINE));
  if (Array.isArray(b.priorities) && b.priorities.length > N_PRIORITIES) { notes.push(`priorities: ${b.priorities.length} → ${N_PRIORITIES}`); b.priorities = b.priorities.slice(0, N_PRIORITIES); }

  o.decisions = trim(o.decisions || [], MAX_DECISIONS, 'decisions');
  o.requestedData = trim(o.requestedData || [], MAX_REQUESTED_DATA, 'requestedData');
  p.weekSummary = (trim(p.weekSummary || [], MAX_WEEK_SUMMARY, 'weekSummary')).map((w) => ({ ...w, line: clipS(w.line, MAX_SUMMARY_LINE) }));
  p.sessions = trim(p.sessions || [], MAX_SESSIONS, 'sessions');
  for (const sess of p.sessions) {
    sess.exercises = trim(sess.exercises || [], MAX_EX_PER_SESSION, `${sess.id}.exercises`);
    for (const ex of sess.exercises) {
      if (!ex.target) continue;
      if (ex.target.kg != null && Number.isFinite(Number(ex.target.kg))) {
        const r = roundKg(ex.target.kg);
        if (Math.abs(r - Number(ex.target.kg)) > 1e-9) { notes.push(`${sess.id}/${ex.id}: kg ${ex.target.kg} → ${r} (ROUND_KG ${ROUND_KG})`); ex.target.kg = r; }
      }
      if (String(ex.target.note ?? '').length > MAX_NOTE) { notes.push(`${sess.id}/${ex.id}: target.note clipped to ${MAX_NOTE}`); ex.target.note = clipS(ex.target.note, MAX_NOTE); }
    }
    for (const c of (sess.changes || [])) if (String(c.why ?? '').length > MAX_NOTE) { notes.push(`${sess.id}: change.why clipped`); c.why = clipS(c.why, MAX_NOTE); }
  }
  const cardioIn = Array.isArray(p.cardio) ? p.cardio : [];
  p.cardio = cardioIn.filter((c) => {
    const okDow = Number.isInteger(c?.dow) && c.dow >= 0 && c.dow <= 6;
    const okDur = Number(c?.durationMin) > 0;
    if (!okDow || !okDur) notes.push(`cardio slot dropped (dow ${c?.dow}, ${c?.durationMin} min)`);
    return okDow && okDur;
  }).map((c) => ({ ...c, note: clipS(c.note, MAX_NOTE) }));
  p.cardio = trim(p.cardio, MAX_CARDIO_SLOTS, 'cardio');
  const tplIn = Array.isArray(p.weekTemplateChanges) ? p.weekTemplateChanges : [];
  p.weekTemplateChanges = trim(tplIn.filter((t) => {
    const okDow = Number.isInteger(t?.dow) && t.dow >= 0 && t.dow <= 6;
    const okSid = t?.type !== 'gym' || (t.sessionId && sessionIds.has(t.sessionId));
    if (!okDow || !okSid) notes.push(`weekTemplateChanges entry dropped (dow ${t?.dow}, session ${t?.sessionId})`);
    return okDow && okSid;
  }).map((t) => ({ ...t, why: clipS(t.why, MAX_NOTE) })), MAX_TEMPLATE_CHANGES, 'weekTemplateChanges');
  return { output: o, notes };
}

// ── Validación: contrato + validador de la función ───────────────────────────────────
async function loadValidator() {
  const src = readFileSync(path.join(FN_DIR, 'coach-facts.generated.js'), 'utf8');
  const dir = mkdtempSync(path.join(tmpdir(), 'coach-manual-gen-'));
  const tmp = path.join(dir, 'coach-facts.generated.mjs');
  writeFileSync(tmp, src);
  return import(pathToFileURL(tmp).href);
}

function contractIssues(output, pack, ruleIds) {
  const hard = [];   // incumplimientos del contrato: la función los sanearía o los marcaría
  const soft = [];   // voz y longitudes recomendadas
  const b = output.briefing || {};
  const p = output.proposal || {};
  const str = (v) => String(v ?? '');
  if (!str(b.focus).trim()) hard.push('briefing.focus vacío');
  if (str(b.focus).length > MAX_FOCUS) hard.push(`briefing.focus ${str(b.focus).length} > ${MAX_FOCUS}`);
  if (!PHASES.includes(b.phase)) hard.push(`briefing.phase '${b.phase}' no es una fase`);
  if (b.phase !== p.phase) hard.push(`briefing.phase (${b.phase}) ≠ proposal.phase (${p.phase})`);
  if (pack.facts?.block?.isDeload === true && p.phase !== 'deload') hard.push('facts.block.isDeload y la fase no es deload (G-H3)');
  for (const [field, hs] of Object.entries(HEADERS)) {
    const missing = hs.filter((h) => !str(b[field]).includes(h));
    if (missing.length) hard.push(`briefing.${field} sin cabeceras: ${missing.join(', ')}`);
  }
  if (!Array.isArray(b.priorities) || b.priorities.length !== 3) hard.push(`priorities: ${Array.isArray(b.priorities) ? b.priorities.length : 0} (deben ser 3)`);
  if (!Array.isArray(b.lastWeekSummary) || b.lastWeekSummary.length > 3) hard.push('lastWeekSummary: máximo 3 líneas');
  for (const l of (b.lastWeekSummary || [])) if (str(l).length > MAX_SUMMARY_LINE) hard.push(`lastWeekSummary línea > ${MAX_SUMMARY_LINE}: "${str(l).slice(0, 40)}…"`);
  if (str(b.whyChanged).length > MAX_WHY) hard.push(`whyChanged ${str(b.whyChanged).length} > ${MAX_WHY}`);
  if (str(b.whyKept).length > MAX_WHY) hard.push(`whyKept ${str(b.whyKept).length} > ${MAX_WHY}`);
  if (!str(b.whyKept).trim()) hard.push('whyKept vacío (nunca lo es)');
  const gaps = Array.isArray(pack.facts?.dataGaps) ? pack.facts.dataGaps.map((g) => str(g).trim()).filter(Boolean) : [];
  const text = `${str(b.lastWeek)}\n${str(b.nextWeek)}`;
  const missingGaps = gaps.filter((g) => !text.includes(g));
  if (missingGaps.length) soft.push(`el briefing no repite ${missingGaps.length} de ${gaps.length} dataGaps literalmente`);

  // voz
  if (str(b.lastWeek).length > VERBOSE_LASTWEEK) hard.push(`lastWeek ${str(b.lastWeek).length} chars: la función lo marcaría como informe (> ${VERBOSE_LASTWEEK})`);
  else if (str(b.lastWeek).length > VOICE_LASTWEEK) soft.push(`lastWeek ${str(b.lastWeek).length} chars (voz: ≤${VOICE_LASTWEEK})`);
  if (str(b.nextWeek).length > VERBOSE_NEXTWEEK) hard.push(`nextWeek ${str(b.nextWeek).length} chars: la función lo marcaría como informe (> ${VERBOSE_NEXTWEEK})`);
  else if (str(b.nextWeek).length > VOICE_NEXTWEEK) soft.push(`nextWeek ${str(b.nextWeek).length} chars (voz: ≤${VOICE_NEXTWEEK})`);
  if (str(b.whyChanged).length > VOICE_WHY) soft.push(`whyChanged ${str(b.whyChanged).length} chars (voz: ≤${VOICE_WHY})`);
  if (str(b.whyKept).length > VOICE_WHY) soft.push(`whyKept ${str(b.whyKept).length} chars (voz: ≤${VOICE_WHY})`);
  if (str(b.focus).length > 120) soft.push(`focus ${str(b.focus).length} chars (voz: ≤120)`);

  // proposal
  const sessionIds = new Set(pack.allowed.sessionIds || []);
  const exIds = new Set((pack.allowed.exerciseIds || []).map((e) => e.id));
  const exById = new Map((pack.allowed.exerciseIds || []).map((e) => [e.id, e]));
  const planSessions = Object.keys(pack.currentPlan?.sessions || {});
  const ws = Array.isArray(p.weekSummary) ? p.weekSummary : [];
  const wsIds = new Set(ws.map((w) => w.sessionId));
  for (const sid of planSessions) if (!wsIds.has(sid)) hard.push(`weekSummary sin fila para ${sid} (la función rellena "(no reason…)")`);
  const changedIds = new Set((p.sessions || []).map((s) => s.id));
  for (const w of ws) {
    if (!sessionIds.has(w.sessionId)) hard.push(`weekSummary.sessionId '${w.sessionId}' no está en allowed`);
    if (!WS_STATUS.includes(w.status)) hard.push(`weekSummary status '${w.status}' inválido (${w.sessionId})`);
    if (str(w.line).length > MAX_SUMMARY_LINE) hard.push(`weekSummary.line > ${MAX_SUMMARY_LINE} (${w.sessionId})`);
    if (!str(w.line).trim()) hard.push(`weekSummary.line vacía (${w.sessionId})`);
    if (changedIds.has(w.sessionId) && w.status === 'kept') hard.push(`${w.sessionId} está en sessions[] pero weekSummary dice kept`);
    if (!changedIds.has(w.sessionId) && (w.status === 'changed' || w.status === 'new')) hard.push(`${w.sessionId} dice ${w.status} pero no está en sessions[]`);
  }
  if ((p.sessions || []).length > MAX_SESSIONS) hard.push(`sessions: ${(p.sessions || []).length} > ${MAX_SESSIONS}`);
  for (const s of (p.sessions || [])) {
    if (!sessionIds.has(s.id)) hard.push(`sessions[].id '${s.id}' no está en allowed`);
    if ((s.exercises || []).length > MAX_EX_PER_SESSION) hard.push(`${s.id}: ${(s.exercises || []).length} ejercicios > ${MAX_EX_PER_SESSION}`);
    for (const ex of (s.exercises || [])) {
      if (!exIds.has(ex.id)) hard.push(`${s.id}: ejercicio '${ex.id}' no está en allowed`);
      const meta = exById.get(ex.id);
      if (meta?.measure && ex.target && ex.target.kg != null) hard.push(`${s.id}/${ex.id}: es measure y lleva kg`);
      if (!ex.target) hard.push(`${s.id}/${ex.id}: sin target`);
      else if (str(ex.target.note).length > 240) hard.push(`${s.id}/${ex.id}: target.note > 240`);
    }
  }
  if (p.running && Number(p.running.hardSessions) > 1) hard.push('running.hardSessions > 1 (G-H4)');
  for (const d of (output.decisions || [])) {
    if (!Array.isArray(d.ruleIds) || !d.ruleIds.length) hard.push(`decisión ${d.id}: ruleIds vacío (G-H15)`);
    else for (const r of d.ruleIds) if (ruleIds && !ruleIds.has(r)) hard.push(`decisión ${d.id}: ruleId '${r}' no está en el corpus`);
    if (!d.evidence || !d.evidence.numbers || !Object.keys(d.evidence.numbers).length) hard.push(`decisión ${d.id}: evidence.numbers vacío (G-H15)`);
    if (!['progression', 'structure', 'running', 'nutrition', 'recovery'].includes(d.type)) hard.push(`decisión ${d.id}: type '${d.type}' inválido`);
  }
  // Rule IDs en la prosa: la voz pide como mucho uno por sección.
  const idsInProse = (str(b.lastWeek) + str(b.nextWeek) + str(b.whyChanged) + str(b.whyKept)).match(/\b[A-Z]{3,4}-\d{3}\b/g) || [];
  if (idsInProse.length > 6) soft.push(`${idsInProse.length} Rule IDs en la prosa del briefing (voz: uno por sección como máximo)`);
  return { hard, soft };
}

async function runValidator(output, pack) {
  const V = await loadValidator();
  const proposal = output.proposal || {};
  const briefing = output.briefing || {};
  const decisions = Array.isArray(output.decisions) ? output.decisions : [];
  const base = pack.currentPlan || pack.facts?.plan || {};
  const merged = V.mergeProposal(base, proposal);
  const f = pack.facts || {};
  const block = f.block ?? null;
  const libraryIds = new Set((pack.allowed.exerciseIds || []).map((e) => e.id));
  for (const s of Object.values(base.sessions || {})) for (const ex of (s.exercises || [])) if (ex?.id) libraryIds.add(String(ex.id));
  const candidate = {
    ...merged,
    block: merged.block ?? block,
    nutrition: proposal.nutrition ?? base.nutrition ?? null,
    decisions, briefing,
    coachBrief: { focus: briefing.focus ?? null, phase: briefing.phase ?? null, whyChanged: briefing.whyChanged ?? null, whyKept: briefing.whyKept ?? null, weekSummary: Array.isArray(proposal.weekSummary) ? proposal.weekSummary : [] },
  };
  const ctx = {
    basedOn: base && Object.keys(base).length ? base : null,
    facts: f,
    variant: f?.plan?.idealVariant ?? null,
    libraryIds,
    lowerSessionIds: new Set(pack.lowerSessionIds || []),
    block,
    isDeload: block?.isDeload === true,
    bodyweightKg: f?.progress?.weight?.latestKg ?? f?.trajectory?.weight?.latestKg ?? null,
    goals: f?.goals ?? null,
    zones: f?.cardio?.z2Ceiling ?? null,
    decisions, briefing,
    todayStr: new Date().toISOString().slice(0, 10),
  };
  const out = V.validatePlanVersion(candidate, ctx);
  const guardrails = (Array.isArray(out) ? out : []).filter((g) => g && g.id && (g.level === 'hard' || g.level === 'warn'));
  let structural = null;
  try { const d = V.diffPlanVersions(base, merged); structural = Number.isFinite(Number(d?.structural)) ? Number(d.structural) : null; } catch (_e) { structural = null; }
  return { guardrails, structural };
}

async function validate(week) {
  if (!args.output) throw new Error('falta --output output.json');
  const pack = await buildPack(week);
  const { output, notes: sanitizeNotes } = sanitizeLite(readJson(args.output), pack);
  const P = await import(pathToFileURL(path.join(FN_DIR, 'prompt.ts')).href);
  const { hard: cHard, soft } = contractIssues(output, pack, P.RULE_IDS);
  for (const n of sanitizeNotes) soft.unshift(`sanitized: ${n}`);
  const { guardrails, structural } = await runValidator(output, pack);
  const hard = guardrails.filter((g) => g.level === 'hard');
  const warn = guardrails.filter((g) => g.level === 'warn');
  console.log(`validate ${week} · pack: ${pack.source}`);
  console.log(`  saneado: ${sanitizeNotes.length ? sanitizeNotes.length + ' correcciones' : 'nada que tocar'}`);
  console.log(`  contrato: ${cHard.length ? cHard.length + ' fallos' : 'ok'}`);
  for (const x of cHard) console.log(`    ✗ ${x}`);
  console.log(`  voz: ${soft.length ? soft.length + ' avisos' : 'ok'}`);
  for (const x of soft) console.log(`    · ${x}`);
  console.log(`  validador: ${hard.length} duros · ${warn.length} avisos · cambios estructurales ${structural}`);
  for (const g of guardrails) console.log(`    ${g.level === 'hard' ? '✗' : '·'} [${g.id}] ${g.text}${g.ruleIds?.length ? ` (${g.ruleIds.join(', ')})` : ''}`);
  return { output, pack, P, cHard, soft, guardrails, hard, warn, structural };
}

function stableStringify(v) {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return Number.isFinite(v) ? JSON.stringify(v) : 'null';
  if (typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function cmdWrite() {
  const week = mustWeek();
  const r = await validate(week);
  if (r.cHard.length) { console.error('\nNo se escribe: el contrato no se cumple.'); process.exit(1); }
  if (r.hard.length && !args['allow-hard']) { console.error('\nNo se escribe: hay guardarraíles duros (usa --allow-hard sólo si Julian lo decide).'); process.exit(1); }
  const u = await userId();
  const nowIso = new Date().toISOString();
  const prev = r.pack.row ? r.pack.row.data : null;
  const id = (r.pack.row && r.pack.row.record_id) || `${week}#${r.pack.rows.length + 1}`;
  const attempt = Number(String(id).split('#')[1]) || 1;
  const sanitized = r.soft.map((s) => (s.startsWith('sanitized: ') ? s.slice('sanitized: '.length) : `voice: ${s}`));
  const data = {
    id, weekKey: week, attempt, status: 'proposed',
    createdAt: prev?.createdAt ?? nowIso, updatedAt: nowIso, requestedAt: prev?.requestedAt ?? null,
    factsHash: sha256(`promptVersion:${PROMPT_VERSION}\n${stableStringify(r.pack.facts)}`),
    facts: r.pack.facts,
    userNote: r.pack.userNote || null,
    clientVersion: prev?.clientVersion ?? null,
    prompt: { model: 'manual-claude', effort: null, rulesVersion: r.P.RULES_VERSION, rulesCount: r.P.RULES_COUNT, promptVersion: PROMPT_VERSION, source: 'manual' },
    output: r.output,
    sanitized,
    guardrails: r.guardrails,
    guardrailsMeta: { hard: r.hard.length, warn: r.warn.length, regenerated: false, attempts: 1, ids: r.guardrails.map((g) => g.id), hardIds: r.hard.map((g) => g.id), structuralChanges: r.structural },
    usage: { source: 'manual', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0 },
    latencyMs: null,
  };
  await rest('coach_reviews?on_conflict=user_id,record_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: [{ user_id: u, record_id: id, data, updated_at: nowIso }],
  });
  console.log(`\nescrita coach_reviews/${id} · proposed · ${JSON.stringify(data).length} B · duros ${r.hard.length} · avisos ${r.warn.length} · source manual`);
  console.log('La app la enseña en Home al sincronizar; aplicar sigue siendo el toque de Julian.');
}

async function cmdPending() {
  const u = await userId();
  const rows = (await rest(`coach_reviews?user_id=eq.${u}&data->>status=eq.requested&select=record_id,data->weekKey,data->requestedAt,data->userNote`)) || [];
  if (!rows.length) { console.log('No hay semanas cerradas esperando revisión manual.'); return; }
  for (const r of rows) console.log(`${r.record_id} · pedida ${r.requestedAt || '?'}${r.userNote ? ` · nota: ${String(r.userNote).slice(0, 80)}` : ''}`);
}

function mustWeek() {
  const w = args.week;
  if (!w || !/^\d{4}-W\d{2}$/.test(String(w))) throw new Error('falta --week YYYY-Wnn');
  return String(w);
}

try {
  if (cmd === 'pending') await cmdPending();
  else if (cmd === 'pack') await cmdPack();
  else if (cmd === 'validate') { const r = await validate(mustWeek()); process.exit(r.cHard.length || r.hard.length ? 1 : 0); }
  else if (cmd === 'write') await cmdWrite();
  else { usage(); process.exit(2); }
} catch (e) {
  console.error(`error: ${e.message}`);
  process.exit(1);
}
