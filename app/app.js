// ============================================================
// Training App — v3.0
// ============================================================

// ==================== TRAINING PLAN DATA ====================
const PLAN = {
  sessions: {
    upperA: {
      id: 'upperA', name: 'Upper A', subtitle: 'Horizontal Press', icon: '🏋️',
      warmup: [
        '5 min treadmill walk or light bike',
        'Band pull-aparts × 15',
        'Arm circles forward/back × 10 each',
        'Cat-cow × 8',
        'Thoracic rotations × 8/side',
        'Bench press: bar × 10, 50% × 6, 70% × 4, 85% × 2',
      ],
      exercises: [
        { id: 'bench-press', name: 'Barbell Bench Press', muscle: 'Chest', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Main press. Full ROM, control the eccentric.' },
        { id: 'barbell-row', name: 'Barbell Row', muscle: 'Back', sets: 4, reps: '6-10', rpe: '7-8', defaultRest: 150, notes: 'Overhand grip. Strict form, no heaving.' },
        { id: 'incline-db-press', name: 'Incline DB Press', muscle: 'Chest', sets: 3, reps: '8-12', rpe: '7', defaultRest: 90, notes: '30-45° angle.' },
        { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Shoulder health. Non-negotiable.' },
        { id: 'lateral-raise', name: 'DB Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Light, controlled, full ROM.' },
        { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscle: 'Triceps', sets: 2, reps: '10-15', rpe: '7', defaultRest: 60, notes: 'Optional — skip if short on time.' },
      ]
    },
    lowerA: {
      id: 'lowerA', name: 'Lower A', subtitle: 'Squat Focus', icon: '🦵',
      warmup: [
        '5 min treadmill walk or light bike',
        'Leg swings front/back × 10/side',
        'Leg swings lateral × 10/side',
        'Hip circles × 10/side',
        'Bodyweight squats × 10',
        'Glute bridges × 10',
        'Squat: bar × 10, 50% × 6, 70% × 4, 85% × 2',
      ],
      exercises: [
        { id: 'back-squat', name: 'Barbell Back Squat', muscle: 'Quads', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 180, notes: 'Priority #1. Use rack safeties.' },
        { id: 'rdl', name: 'Barbell RDL', muscle: 'Hamstrings', sets: 3, reps: '8-10', rpe: '7', defaultRest: 150, notes: '3 sec eccentric. Stop at mid-shin.' },
        { id: 'leg-press', name: 'Leg Press', muscle: 'Quads', sets: 3, reps: '10-12', rpe: '7-8', defaultRest: 120, notes: 'Quad volume without spinal load.' },
        { id: 'leg-curl-a', name: 'Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'Focus on contraction quality.' },
        { id: 'calf-raise', name: 'Standing Calf Raise', muscle: 'Calves', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Full ROM, pause at stretch.' },
        { id: 'ab-wheel', name: 'Ab Wheel Rollout', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, notes: 'Scale with knees on floor if needed.' },
      ]
    },
    upperB: {
      id: 'upperB', name: 'Upper B', subtitle: 'Pull / Press', icon: '💪',
      warmup: [
        '5 min treadmill walk or light bike',
        'Band pull-aparts × 15',
        'Arm circles forward/back × 10 each',
        'Thoracic rotations × 8/side',
        'Scapular pull-ups × 8',
        'Chin-up: BW × 3-5 easy, or lat pulldown light × 10',
      ],
      exercises: [
        { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Add weight when you get 4×8. Use lat pulldown if <5 reps.' },
        { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Standing. Strict form, no leg drive.' },
        { id: 'landmine-row', name: 'Landmine Row', muscle: 'Back', sets: 3, reps: '8-12/side', rpe: '7', defaultRest: 90, notes: 'Unilateral. Use landmine attachment.' },
        { id: 'incline-curl', name: 'Incline DB Curl', muscle: 'Biceps', sets: 3, reps: '10-12', rpe: '7', defaultRest: 60, notes: 'Stretch at bottom.' },
        { id: 'cable-lateral', name: 'Cable Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Constant tension throughout ROM.' },
        { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, notes: 'Scale to knee raises if needed.' },
      ]
    },
    lowerB: {
      id: 'lowerB', name: 'Lower B', subtitle: 'Hinge Focus', icon: '🔥',
      warmup: [
        '5 min treadmill walk or light bike',
        'Leg swings front/back × 10/side',
        'Hip circles × 10/side',
        'Cat-cow × 8',
        'Glute bridges × 10',
        'Good mornings (bodyweight) × 8',
        'Deadlift: bar × 8, 50% × 5, 70% × 3, 85% × 1',
      ],
      exercises: [
        { id: 'sumo-dl', name: 'Sumo Deadlift', muscle: 'Posterior', sets: 4, reps: '3-6', rpe: '7-8', defaultRest: 210, notes: 'Reset each rep from floor. No touch-and-go.' },
        { id: 'bss', name: 'Bulgarian Split Squat', muscle: 'Quads', sets: 3, reps: '8-10/side', rpe: '7-8', defaultRest: 90, notes: 'DB in each hand, rear foot on bench.' },
        { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7-8', defaultRest: 90, notes: 'Controlled 2-3 sec eccentric.' },
        { id: 'leg-curl-b', name: 'Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'Second hit of the week.' },
        { id: 'hip-thrust', name: 'Barbell Hip Thrust', muscle: 'Glutes', sets: 3, reps: '8-12', rpe: '7', defaultRest: 120, notes: 'Heavy is fine but stay at RPE 7.' },
        { id: 'pallof-press', name: 'Cable Pallof Press', muscle: 'Core', sets: 3, reps: '10-15', rpe: '-', defaultRest: 60, notes: 'Anti-rotation. Alternate with cable crunch weekly.' },
      ]
    }
  }
};

// Muscle badge colors
const MUSCLE_COLORS = {
  'Chest': '#60a5fa', 'Back': '#34d399', 'Shoulders': '#a78bfa', 'Rear Delt': '#a78bfa',
  'Triceps': '#fb923c', 'Biceps': '#f472b6', 'Quads': '#4ade80', 'Hamstrings': '#fbbf24',
  'Calves': '#94a3b8', 'Core': '#e2e8f0', 'Glutes': '#f472b6', 'Posterior': '#fbbf24',
};

// Weekly schedule template: 0=Sun, 1=Mon, ..., 6=Sat
const WEEK_TEMPLATE = {
  1: { type: 'gym', session: 'upperA' },
  2: { type: 'gym', session: 'lowerA' },
  3: { type: 'run', label: 'Zone 2 Run' },     // available from week 4
  4: { type: 'gym', session: 'upperB' },
  5: { type: 'gym', session: 'lowerB' },
  6: { type: 'run', label: 'Zone 2 Run' },     // available from week 1
  0: { type: 'rest', label: 'Rest' },
};

// ==================== DATABASE ====================
const DB_NAME = 'TrainingApp';
const DB_VERSION = 1;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('workouts')) d.createObjectStore('workouts', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('runs')) d.createObjectStore('runs', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('nutrition')) d.createObjectStore('nutrition', { keyPath: 'date' });
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = (e) => { db = e.target.result; resolve(db); };
    req.onerror = (e) => reject(e);
  });
}

function dbPut(store, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function dbGet(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function dbGetAll(store) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

function dbDelete(store, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

// ==================== STATE ====================
const state = {
  currentTab: 'gym',
  currentView: 'gym',
  activeSession: null,
  workoutStartTime: null,
  workoutTimerInterval: null,
  restTimerInterval: null,
  restTimerRemaining: 0,
  restTimerTotal: 0,
  settings: { unit: 'kg', proteinTarget: 170, calorieTarget: 2500, startDate: null },
  sessionQuality: 3,
  pinEntry: '',
  pinMode: 'check', // 'check', 'set', 'confirm'
  pinTemp: '',
};

// ==================== UTILITIES ====================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function today() { return new Date().toISOString().split('T')[0]; }

function formatDate(d) {
  const dt = new Date(d + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function getWeekNumber() {
  const start = state.settings.startDate;
  if (!start) return 1;
  const startDate = new Date(start + 'T00:00:00');
  const now = new Date();
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  return Math.max(1, Math.floor(diffDays / 7) + 1);
}

function isDeloadWeek(weekNum) {
  return weekNum === 5 || weekNum === 9;
}

function getRunsThisWeek(weekNum) {
  if (weekNum <= 3) return 1;
  if (weekNum <= 6) return 2;
  return 3; // 2 + optional 3rd
}

function getWeekDates() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

// ==================== PIN LOCK ====================
function checkPin() {
  const storedPin = localStorage.getItem('training_pin');
  if (!storedPin) {
    document.getElementById('pin-lock').classList.add('hidden');
    return;
  }
  state.pinMode = 'check';
  state.pinEntry = '';
  document.getElementById('pin-lock').classList.remove('hidden');
  document.getElementById('pin-prompt').textContent = 'Enter PIN';
  document.getElementById('pin-msg').textContent = '';
  updatePinDots();
}

function handlePinKey(key) {
  const lock = document.getElementById('pin-lock');
  const msg = document.getElementById('pin-msg');

  if (key === 'del') {
    state.pinEntry = state.pinEntry.slice(0, -1);
    updatePinDots();
    return;
  }

  if (state.pinEntry.length >= 4) return;
  state.pinEntry += key;
  updatePinDots();

  if (state.pinEntry.length === 4) {
    setTimeout(() => {
      if (state.pinMode === 'check') {
        const stored = localStorage.getItem('training_pin');
        if (state.pinEntry === stored) {
          lock.classList.add('hidden');
          state.pinEntry = '';
        } else {
          msg.textContent = 'Wrong PIN';
          shakePinDots();
          state.pinEntry = '';
          setTimeout(() => updatePinDots(), 400);
        }
      } else if (state.pinMode === 'set') {
        state.pinTemp = state.pinEntry;
        state.pinEntry = '';
        state.pinMode = 'confirm';
        document.getElementById('pin-prompt').textContent = 'Confirm PIN';
        updatePinDots();
      } else if (state.pinMode === 'confirm') {
        if (state.pinEntry === state.pinTemp) {
          localStorage.setItem('training_pin', state.pinEntry);
          lock.classList.add('hidden');
          state.pinEntry = '';
          state.pinTemp = '';
          toast('PIN set!');
          updatePinStatus();
        } else {
          msg.textContent = 'PINs don\'t match';
          shakePinDots();
          state.pinEntry = '';
          state.pinMode = 'set';
          document.getElementById('pin-prompt').textContent = 'Set a 4-digit PIN';
          setTimeout(() => updatePinDots(), 400);
        }
      }
    }, 150);
  }
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots span');
  dots.forEach((dot, i) => {
    dot.className = i < state.pinEntry.length ? 'filled' : '';
  });
}

function shakePinDots() {
  const dots = document.querySelectorAll('#pin-dots span');
  dots.forEach(d => {
    d.className = 'error';
    d.style.animation = 'none';
    d.offsetHeight; // force reflow
    d.style.animation = '';
  });
}

function startSetPin() {
  state.pinMode = 'set';
  state.pinEntry = '';
  state.pinTemp = '';
  document.getElementById('pin-prompt').textContent = 'Set a 4-digit PIN';
  document.getElementById('pin-msg').textContent = '';
  document.getElementById('pin-lock').classList.remove('hidden');
  updatePinDots();
}

function removePin() {
  localStorage.removeItem('training_pin');
  toast('PIN removed');
  updatePinStatus();
}

function updatePinStatus() {
  const hasPin = !!localStorage.getItem('training_pin');
  const status = document.getElementById('pin-status');
  const removeBtn = document.getElementById('btn-remove-pin');
  const setBtn = document.getElementById('btn-set-pin');
  status.textContent = hasPin ? 'PIN is set' : 'No PIN configured';
  removeBtn.classList.toggle('hidden', !hasPin);
  setBtn.textContent = hasPin ? 'Change PIN' : 'Set PIN';
}

// ==================== NAVIGATION ====================
function switchTab(tab) {
  state.currentTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  if (tab === 'gym') {
    showView(state.currentView === 'workout' ? 'workout' : 'gym');
    if (state.currentView !== 'workout') { renderWeekStrip(); renderRecentWorkouts(); }
  } else if (tab === 'run') { showView('run'); renderRunPlanBanner(); renderRunHistory(); }
  else if (tab === 'nutrition') { showView('nutrition'); renderNutrition(); }

  updateHeader(tab);
}

function showView(view) {
  state.currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
}

function updateHeader(tab) {
  const title = document.getElementById('header-title');
  const sub = document.getElementById('header-subtitle');
  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);
  if (tab === 'gym') {
    title.textContent = 'Training';
    sub.textContent = deload ? `Week ${wk} · Deload` : `Week ${wk} · Cut Phase 1`;
  } else if (tab === 'run') {
    title.textContent = 'Running';
    sub.textContent = `Week ${wk} · Zone 2`;
  } else if (tab === 'nutrition') {
    title.textContent = 'Nutrition';
    sub.textContent = `Target: ${state.settings.proteinTarget}g protein`;
  } else if (tab === 'settings') {
    title.textContent = 'Settings';
    sub.textContent = '';
  }
}

// ==================== GYM MODULE ====================
function renderWeekBanner() {
  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);
  const totalWeeks = 9;
  const pct = Math.min((wk / totalWeeks) * 100, 100);

  document.getElementById('week-banner').innerHTML = `
    <div class="wb-top">
      <span class="wb-title">Week ${wk} of ${totalWeeks}</span>
      <span class="wb-phase ${deload ? 'wb-deload' : ''}">${deload ? 'Deload' : 'Cut Phase 1'}</span>
    </div>
    <div class="wb-bar"><div class="wb-bar-fill" style="width:${pct}%"></div></div>
  `;
}

async function renderWeekStrip() {
  renderWeekBanner();
  const container = document.getElementById('week-strip');
  const weekDates = getWeekDates();
  const todayStr = today();
  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const wk = getWeekNumber();
  const runsAllowed = getRunsThisWeek(wk);
  const deload = isDeloadWeek(wk);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  container.innerHTML = '';
  weekDates.forEach((date, i) => {
    const ds = dateStr(date);
    const jsDay = date.getDay(); // 0=Sun
    const plan = WEEK_TEMPLATE[jsDay];
    const isToday = ds === todayStr;

    // Determine what's scheduled
    let icon = '', activity = '', type = plan.type;
    if (plan.type === 'gym') {
      const session = PLAN.sessions[plan.session];
      icon = session.icon;
      activity = session.name;
      if (deload) activity += ' (DL)';
    } else if (plan.type === 'run') {
      // Check if this run is available based on week progression
      if (jsDay === 3 && runsAllowed < 2) { type = 'rest'; icon = '😴'; activity = 'Rest'; }
      else if (jsDay === 0 && runsAllowed < 3) { type = 'rest'; icon = '😴'; activity = 'Rest'; }
      else { icon = '🏃'; activity = plan.label; }
    } else {
      icon = '😴'; activity = 'Rest';
      // Optional 3rd run on Sunday
      if (jsDay === 0 && runsAllowed >= 3) { icon = '🏃'; activity = 'Run (opt)'; type = 'run'; }
    }

    // Check completion
    const completed = type === 'gym'
      ? workouts.some(w => w.date === ds && w.session === plan.session)
      : type === 'run'
        ? runs.some(r => r.date === ds)
        : false;

    const card = document.createElement('div');
    card.className = `day-card${isToday ? ' today' : ''}${completed ? ' completed' : ''}`;
    card.innerHTML = `
      <div class="day-name">${dayNames[i]}</div>
      <div class="day-date">${date.getDate()}</div>
      <div class="day-icon">${icon}</div>
      <div class="day-activity">${activity}</div>
      <div class="day-status ${completed ? 'done' : 'upcoming'}">${completed ? '✓' : type === 'rest' ? '' : '—'}</div>
    `;

    if (type === 'gym') {
      card.addEventListener('click', () => startWorkout(plan.session));
    } else if (type === 'run') {
      card.addEventListener('click', () => { switchTab('run'); });
    }
    container.appendChild(card);
  });
}

async function renderRecentWorkouts() {
  const container = document.getElementById('recent-workouts');
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  if (!workouts.length) {
    container.innerHTML = '<div class="empty-state">No workouts logged yet.<br>Tap a day above to start.</div>';
    return;
  }

  container.innerHTML = workouts.map(w => {
    const session = PLAN.sessions[w.session];
    const totalSets = w.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
    return `
      <div class="history-item">
        <div class="hi-left">
          <div class="hi-title">${session ? session.name : w.session}</div>
          <div class="hi-sub">${formatDate(w.date)} · ${totalSets} sets · ${w.duration || ''}</div>
        </div>
        <div class="hi-right">
          <div class="hi-stat">${w.quality || '-'}/5</div>
          <div class="hi-stat-sub">quality</div>
        </div>
      </div>
    `;
  }).join('');
}

async function startWorkout(sessionId) {
  const session = PLAN.sessions[sessionId];
  if (!session) return;

  state.activeSession = sessionId;
  state.workoutStartTime = Date.now();
  state.sessionQuality = 3;

  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);

  // Load previous workout
  const workouts = (await dbGetAll('workouts')).filter(w => w.session === sessionId).sort((a, b) => b.date.localeCompare(a.date));
  const previous = workouts[0] || null;

  // Load custom rest times
  const restSettings = await dbGet('settings', 'restTimes') || { key: 'restTimes', data: {} };

  // Render warm-up
  const warmupBody = document.getElementById('warmup-body');
  warmupBody.innerHTML = `<ul class="warmup-list">${session.warmup.map(w => `<li>${w}</li>`).join('')}</ul>`;
  document.getElementById('warmup-section').classList.remove('expanded');

  // Render exercises
  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';

  session.exercises.forEach((ex, exIdx) => {
    const prevEx = previous ? previous.exercises.find(e => e.exerciseId === ex.id) : null;
    const customRest = (restSettings.data && restSettings.data[ex.id]) || ex.defaultRest;
    const numSets = deload ? Math.ceil(ex.sets / 2) : ex.sets;
    const rpeDisplay = deload && ex.rpe !== '-' ? 'RPE 5-6' : `RPE ${ex.rpe}`;
    const muscleColor = MUSCLE_COLORS[ex.muscle] || '#666';

    const card = document.createElement('div');
    card.className = 'exercise-card';
    card.dataset.exerciseId = ex.id;
    if (exIdx === 0) card.classList.add('expanded');

    let setsHTML = '';
    for (let i = 0; i < numSets; i++) {
      const prevSet = prevEx && prevEx.sets[i];
      setsHTML += `
        <div class="set-row" data-set="${i}">
          <div class="set-num">${i + 1}</div>
          <input type="number" class="set-input" data-field="weight" placeholder="${prevSet ? prevSet.weight : '-'}" inputmode="decimal" step="0.5">
          <input type="number" class="set-input" data-field="reps" placeholder="${prevSet ? prevSet.reps : '-'}" inputmode="numeric" step="1">
          <select class="set-input" data-field="rpe" style="padding:8px 2px;font-size:12px">
            <option value="">RPE</option>
            ${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(v => `<option value="${v}">${v}</option>`).join('')}
          </select>
          <button class="set-check" data-set-check="${i}">✓</button>
        </div>
      `;
    }

    const prevDataHTML = prevEx
      ? `<div class="previous-data">Last time: ${prevEx.sets.filter(s => s.done).map(s => `${s.weight}${state.settings.unit}×${s.reps}`).join(', ') || 'no data'}</div>`
      : '';

    card.innerHTML = `
      <div class="exercise-header">
        <div class="exercise-info">
          <div class="exercise-name-row">
            <span class="exercise-name">${ex.name}</span>
            <span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${ex.muscle}</span>
          </div>
          <div class="exercise-target">${numSets} × ${ex.reps} @ ${rpeDisplay} · Rest ${Math.floor(customRest / 60)}:${(customRest % 60).toString().padStart(2, '0')}</div>
        </div>
        <div class="exercise-status" data-status="${ex.id}"></div>
      </div>
      <div class="exercise-body">
        <div class="exercise-body-inner">
          ${prevDataHTML}
          <div class="set-table">
            <div class="set-table-header">
              <div>Set</div>
              <div>${state.settings.unit}</div>
              <div>Reps</div>
              <div>RPE</div>
              <div></div>
            </div>
            ${setsHTML}
          </div>
          <div class="rest-btn-row">
            <button class="btn-rest" data-rest-start="${customRest}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              Rest Timer
            </button>
            <div class="rest-config">
              <input type="number" value="${customRest}" data-rest-config="${ex.id}" inputmode="numeric" min="0" step="15">
              <span>sec</span>
            </div>
          </div>
          <div class="exercise-notes">${ex.notes}${deload ? '<br><strong>Deload: lighter weight, focus on form.</strong>' : ''}</div>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Event: expand/collapse
  container.querySelectorAll('.exercise-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.exercise-card').classList.toggle('expanded'));
  });

  // Event: set check
  container.querySelectorAll('.set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('checked');
      updateExerciseStatus(btn.closest('.exercise-card'));
    });
  });

  // Event: rest timer
  container.querySelectorAll('.btn-rest').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.exercise-card');
      const configInput = card.querySelector('[data-rest-config]');
      const seconds = parseInt(configInput.value) || 120;
      startRestTimer(seconds);
    });
  });

  // Event: rest config save
  container.querySelectorAll('[data-rest-config]').forEach(input => {
    input.addEventListener('change', async () => {
      const exId = input.dataset.restConfig;
      const val = parseInt(input.value) || 120;
      const rs = await dbGet('settings', 'restTimes') || { key: 'restTimes', data: {} };
      rs.data[exId] = val;
      await dbPut('settings', rs);
      const card = input.closest('.exercise-card');
      const target = card.querySelector('.exercise-target');
      const ex = session.exercises.find(e => e.id === exId);
      if (ex && target) {
        const numSets = deload ? Math.ceil(ex.sets / 2) : ex.sets;
        target.textContent = `${numSets} × ${ex.reps} @ RPE ${ex.rpe} · Rest ${Math.floor(val / 60)}:${(val % 60).toString().padStart(2, '0')}`;
      }
    });
  });

  // Quality stars
  document.querySelectorAll('#quality-stars button').forEach(btn => {
    btn.classList.toggle('selected', parseInt(btn.dataset.v) === 3);
    btn.addEventListener('click', () => {
      state.sessionQuality = parseInt(btn.dataset.v);
      document.querySelectorAll('#quality-stars button').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.v) === state.sessionQuality));
    });
  });

  startWorkoutTimer();
  showView('workout');
  document.getElementById('header-title').textContent = session.name;
  document.getElementById('header-subtitle').textContent = session.subtitle + (deload ? ' (Deload)' : '');
}

function updateExerciseStatus(card) {
  const checks = card.querySelectorAll('.set-check');
  const done = card.querySelectorAll('.set-check.checked');
  const statusEl = card.querySelector('.exercise-status');
  if (done.length === checks.length && checks.length > 0) {
    statusEl.className = 'exercise-status done';
    statusEl.textContent = '✓';
    const next = card.nextElementSibling;
    if (next && !next.classList.contains('expanded')) {
      card.classList.remove('expanded');
      next.classList.add('expanded');
    }
  } else if (done.length > 0) {
    statusEl.className = 'exercise-status partial';
    statusEl.textContent = `${done.length}`;
  } else {
    statusEl.className = 'exercise-status';
    statusEl.textContent = '';
  }
}

function startWorkoutTimer() {
  if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
  const timerEl = document.getElementById('workout-timer');
  state.workoutTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);
    timerEl.textContent = formatDuration(elapsed);
  }, 1000);
}

async function finishWorkout() {
  if (!state.activeSession) return;
  const elapsed = Math.floor((Date.now() - state.workoutStartTime) / 1000);
  const duration = formatDuration(elapsed);

  const exercises = [];
  document.querySelectorAll('#workout-exercises .exercise-card').forEach(card => {
    const exId = card.dataset.exerciseId;
    const sets = [];
    card.querySelectorAll('.set-row').forEach(row => {
      const weight = parseFloat(row.querySelector('[data-field="weight"]').value) || 0;
      const reps = parseInt(row.querySelector('[data-field="reps"]').value) || 0;
      const rpe = parseFloat(row.querySelector('[data-field="rpe"]').value) || null;
      const done = row.querySelector('.set-check').classList.contains('checked');
      sets.push({ weight, reps, rpe, done });
    });
    exercises.push({ exerciseId: exId, sets });
  });

  const workout = {
    id: uid(),
    date: today(),
    session: state.activeSession,
    week: getWeekNumber(),
    startTime: new Date(state.workoutStartTime).toTimeString().slice(0, 5),
    duration,
    exercises,
    quality: state.sessionQuality,
    notes: document.getElementById('workout-notes').value.trim(),
  };

  await dbPut('workouts', workout);

  if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
  state.activeSession = null;
  state.workoutStartTime = null;
  state.currentView = 'gym';
  document.getElementById('workout-notes').value = '';

  toast('Workout saved!');
  switchTab('gym');
}

// ==================== REST TIMER ====================
function startRestTimer(seconds) {
  state.restTimerTotal = seconds;
  state.restTimerRemaining = seconds;
  const overlay = document.getElementById('rest-timer-overlay');
  const textEl = document.getElementById('timer-text');
  const ringFill = document.getElementById('timer-ring-fill');
  const circumference = 2 * Math.PI * 90;

  overlay.classList.remove('hidden');
  if (state.restTimerInterval) clearInterval(state.restTimerInterval);

  function updateDisplay() {
    const min = Math.floor(state.restTimerRemaining / 60);
    const sec = state.restTimerRemaining % 60;
    textEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    const progress = 1 - (state.restTimerRemaining / state.restTimerTotal);
    ringFill.style.strokeDashoffset = circumference * (1 - progress);
  }

  updateDisplay();

  state.restTimerInterval = setInterval(() => {
    state.restTimerRemaining--;
    if (state.restTimerRemaining <= 0) {
      clearInterval(state.restTimerInterval);
      state.restTimerRemaining = 0;
      updateDisplay();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
      setTimeout(() => overlay.classList.add('hidden'), 1500);
    }
    updateDisplay();
  }, 1000);
}

function stopRestTimer() {
  if (state.restTimerInterval) clearInterval(state.restTimerInterval);
  document.getElementById('rest-timer-overlay').classList.add('hidden');
}

// ==================== RUNNING MODULE ====================
function renderRunPlanBanner() {
  const wk = getWeekNumber();
  const runsAllowed = getRunsThisWeek(wk);
  const banner = document.getElementById('run-plan-banner');

  let detail = '';
  if (wk <= 3) detail = '1 run/week (Saturday). Build the habit first.';
  else if (wk <= 6) detail = '2 runs/week (Wednesday + Saturday). Aerobic base building.';
  else detail = '2 runs + optional 3rd (Sunday). Maintain or progress.';

  banner.innerHTML = `
    <div class="rpb-title">Week ${wk} Running Plan</div>
    <div class="rpb-detail">${detail}</div>
    <span class="rpb-badge">${runsAllowed === 3 ? '2-3' : runsAllowed} runs this week · Zone 2 · HR &lt; 140 bpm</span>
  `;
}

async function logRun() {
  const distance = parseFloat(document.getElementById('run-distance').value);
  const duration = parseInt(document.getElementById('run-duration').value);
  const hr = parseInt(document.getElementById('run-hr').value) || null;
  const feel = getStarValue('run-feel');
  const notes = document.getElementById('run-notes').value.trim();

  if (!distance || !duration) { toast('Enter distance and duration'); return; }

  const avgPace = duration / distance;
  const paceMin = Math.floor(avgPace);
  const paceSec = Math.round((avgPace - paceMin) * 60);

  const run = {
    id: uid(),
    date: today(),
    week: getWeekNumber(),
    distance, duration,
    avgPace: `${paceMin}:${paceSec.toString().padStart(2, '0')}`,
    avgHR: hr,
    feel, notes,
  };

  await dbPut('runs', run);

  document.getElementById('run-distance').value = '';
  document.getElementById('run-duration').value = '';
  document.getElementById('run-hr').value = '';
  document.getElementById('run-notes').value = '';
  setStarValue('run-feel', 3);

  toast('Run logged!');
  renderRunHistory();
}

async function renderRunHistory() {
  const container = document.getElementById('run-history');
  const runs = (await dbGetAll('runs')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);

  if (!runs.length) {
    container.innerHTML = '<div class="empty-state">No runs logged yet</div>';
    return;
  }

  container.innerHTML = runs.map(r => `
    <div class="history-item">
      <div class="hi-left">
        <div class="hi-title">${r.distance} km · ${r.avgPace}/km</div>
        <div class="hi-sub">${formatDate(r.date)} · ${r.duration} min${r.avgHR ? ` · ${r.avgHR} bpm` : ''}${r.week ? ` · Wk ${r.week}` : ''}</div>
      </div>
      <div class="hi-right" style="display:flex;align-items:center">
        <div>
          <div class="hi-stat">${r.feel}/5</div>
          <div class="hi-stat-sub">feel</div>
        </div>
        <button class="hi-delete" data-delete-run="${r.id}">&times;</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete-run]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await dbDelete('runs', btn.dataset.deleteRun);
      toast('Run deleted');
      renderRunHistory();
    });
  });
}

// ==================== NUTRITION MODULE ====================
async function renderNutrition() {
  const dateLabel = document.getElementById('nutrition-date-label');
  dateLabel.textContent = 'Today — ' + formatDate(today());
  document.getElementById('protein-target-display').textContent = state.settings.proteinTarget;

  const entry = await dbGet('nutrition', today());
  if (entry) {
    document.getElementById('nut-protein').value = entry.protein || '';
    setStarValue('nut-meals', entry.meals || 4);
    setToggleValue('nut-water', entry.water !== false);
    setStarValue('nut-energy', entry.energy || 3);
    document.getElementById('nut-alcohol').value = entry.alcohol || 0;
    setStarValue('nut-hunger', entry.hunger || 3);
    document.getElementById('nut-calories').value = entry.calories || '';
    document.getElementById('nut-notes').value = entry.notes || '';
    updateProteinRing(entry.protein || 0);
  } else {
    document.getElementById('nut-protein').value = '';
    updateProteinRing(0);
  }

  document.getElementById('nut-protein').oninput = (e) => {
    updateProteinRing(parseInt(e.target.value) || 0);
  };

  renderNutritionHistory();
}

function updateProteinRing(current) {
  const target = state.settings.proteinTarget;
  const pct = Math.min(current / target, 1);
  const circumference = 2 * Math.PI * 52;
  document.getElementById('protein-ring-fill').style.strokeDashoffset = circumference * (1 - pct);
  document.getElementById('protein-current').textContent = current;

  const fill = document.getElementById('protein-ring-fill');
  if (pct >= 1) fill.style.stroke = 'var(--accent)';
  else if (pct >= 0.7) fill.style.stroke = 'var(--yellow)';
  else fill.style.stroke = 'var(--orange)';
}

function quickAddProtein(grams) {
  const input = document.getElementById('nut-protein');
  const current = parseInt(input.value) || 0;
  input.value = current + grams;
  updateProteinRing(current + grams);
}

async function logNutrition() {
  const entry = {
    date: today(),
    protein: parseInt(document.getElementById('nut-protein').value) || 0,
    meals: getStarValue('nut-meals'),
    water: getToggleValue('nut-water'),
    energy: getStarValue('nut-energy'),
    alcohol: parseInt(document.getElementById('nut-alcohol').value) || 0,
    hunger: getStarValue('nut-hunger'),
    calories: parseInt(document.getElementById('nut-calories').value) || null,
    notes: document.getElementById('nut-notes').value.trim(),
  };

  await dbPut('nutrition', entry);
  toast('Saved!');
  renderNutritionHistory();
}

async function renderNutritionHistory() {
  const container = document.getElementById('nutrition-history');
  const entries = (await dbGetAll('nutrition')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  if (!entries.length) {
    container.innerHTML = '<div class="empty-state">No nutrition data yet</div>';
    return;
  }

  container.innerHTML = entries.map(e => {
    const hitTarget = e.protein >= state.settings.proteinTarget;
    return `
      <div class="history-item">
        <div class="hi-left">
          <div class="hi-title">${formatDate(e.date)}</div>
          <div class="hi-sub">${e.protein}g protein · ${e.meals} meals${e.alcohol ? ` · ${e.alcohol} drinks` : ''}${e.calories ? ` · ${e.calories} kcal` : ''}</div>
        </div>
        <div class="hi-right">
          <div class="hi-stat" style="color:${hitTarget ? 'var(--accent)' : 'var(--orange)'}">${hitTarget ? '✓' : '✗'}</div>
          <div class="hi-stat-sub">protein</div>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== STAR & TOGGLE HELPERS ====================
function getStarValue(containerId) {
  const sel = document.querySelector(`#${containerId} button.selected`);
  return sel ? parseInt(sel.dataset.v) : 3;
}

function setStarValue(containerId, val) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('button').forEach(b => b.classList.toggle('selected', parseInt(b.dataset.v) === val));
}

function setToggleValue(prefix, val) {
  document.getElementById(prefix + '-yes').classList.toggle('selected', val);
  document.getElementById(prefix + '-no').classList.toggle('selected', !val);
}

function getToggleValue(prefix) {
  return document.getElementById(prefix + '-yes').classList.contains('selected');
}

function setupToggle(prefix) {
  document.getElementById(prefix + '-yes').addEventListener('click', () => setToggleValue(prefix, true));
  document.getElementById(prefix + '-no').addEventListener('click', () => setToggleValue(prefix, false));
}

function setupStarGroup(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });
}

// ==================== SETTINGS ====================
async function loadSettings() {
  const saved = await dbGet('settings', 'userSettings');
  if (saved) {
    state.settings = { ...state.settings, ...saved.data };
  }
  applySettingsToUI();
}

function applySettingsToUI() {
  const { unit, proteinTarget, calorieTarget, startDate } = state.settings;
  document.getElementById('unit-kg').classList.toggle('selected', unit === 'kg');
  document.getElementById('unit-lb').classList.toggle('selected', unit === 'lb');
  document.getElementById('setting-protein-target').value = proteinTarget;
  document.getElementById('setting-calorie-target').value = calorieTarget;
  document.getElementById('setting-start-date').value = startDate || today();
  updatePinStatus();
}

async function saveSettings() {
  const unit = document.getElementById('unit-kg').classList.contains('selected') ? 'kg' : 'lb';
  const proteinTarget = parseInt(document.getElementById('setting-protein-target').value) || 170;
  const calorieTarget = parseInt(document.getElementById('setting-calorie-target').value) || 2500;
  const startDate = document.getElementById('setting-start-date').value || today();

  state.settings = { unit, proteinTarget, calorieTarget, startDate };
  await dbPut('settings', { key: 'userSettings', data: state.settings });
  toast('Settings saved!');
}

// ==================== BACKUP / RESTORE ====================
async function exportBackup() {
  const data = {
    version: 3,
    exportDate: new Date().toISOString(),
    workouts: await dbGetAll('workouts'),
    runs: await dbGetAll('runs'),
    nutrition: await dbGetAll('nutrition'),
    settings: await dbGetAll('settings'),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const fileName = `training-backup-${today()}.json`;

  // Try Web Share API first (works on iOS)
  if (navigator.share && navigator.canShare) {
    const file = new File([blob], fileName, { type: 'application/json' });
    const shareData = { files: [file], title: 'Training Backup', text: `Backup from ${today()}` };
    try {
      if (navigator.canShare(shareData)) {
        await navigator.share(shareData);
        toast('Backup shared!');
        return;
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Backup downloaded!');
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.workouts) for (const w of data.workouts) await dbPut('workouts', w);
    if (data.runs) for (const r of data.runs) await dbPut('runs', r);
    if (data.nutrition) for (const n of data.nutrition) await dbPut('nutrition', n);
    if (data.settings) for (const s of data.settings) await dbPut('settings', s);

    await loadSettings();
    toast('Backup restored!');
    switchTab(state.currentTab);
  } catch (e) {
    toast('Error restoring backup');
    console.error(e);
  }
}

// ==================== EVENT BINDING ====================
function bindEvents() {
  // Nav tabs
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Settings button
  document.getElementById('btn-settings').addEventListener('click', () => {
    showView('settings');
    updateHeader('settings');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  });

  // Back from workout
  document.getElementById('btn-back-gym').addEventListener('click', () => {
    if (state.activeSession) {
      if (confirm('Leave workout? Data will be lost.')) {
        if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
        state.activeSession = null;
        state.currentView = 'gym';
        switchTab('gym');
      }
    } else {
      state.currentView = 'gym';
      switchTab('gym');
    }
  });

  // Finish workout
  document.getElementById('btn-finish-workout').addEventListener('click', finishWorkout);

  // Warm-up toggle
  document.getElementById('warmup-toggle').addEventListener('click', () => {
    document.getElementById('warmup-section').classList.toggle('expanded');
  });

  // Run logging
  document.getElementById('btn-log-run').addEventListener('click', logRun);

  // Nutrition
  document.getElementById('btn-log-nutrition').addEventListener('click', logNutrition);

  // Quick add protein
  document.querySelectorAll('#quick-add button').forEach(btn => {
    btn.addEventListener('click', () => quickAddProtein(parseInt(btn.dataset.add)));
  });

  // Nutrition expand
  document.getElementById('nut-expand-btn').addEventListener('click', () => {
    const content = document.getElementById('nut-expand');
    const btn = document.getElementById('nut-expand-btn');
    content.classList.toggle('hidden');
    btn.classList.toggle('open');
    btn.textContent = content.classList.contains('hidden') ? 'More details ▾' : 'Less details ▴';
  });

  // Settings save
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Unit toggles
  document.getElementById('unit-kg').addEventListener('click', () => {
    document.getElementById('unit-kg').classList.add('selected');
    document.getElementById('unit-lb').classList.remove('selected');
  });
  document.getElementById('unit-lb').addEventListener('click', () => {
    document.getElementById('unit-lb').classList.add('selected');
    document.getElementById('unit-kg').classList.remove('selected');
  });

  // Water toggle
  setupToggle('nut-water');

  // Star selectors
  ['run-feel', 'nut-meals', 'nut-hunger', 'nut-energy'].forEach(setupStarGroup);

  // Rest timer controls
  document.getElementById('timer-skip').addEventListener('click', stopRestTimer);
  document.getElementById('timer-minus').addEventListener('click', () => {
    state.restTimerRemaining = Math.max(0, state.restTimerRemaining - 15);
  });
  document.getElementById('timer-plus').addEventListener('click', () => {
    state.restTimerRemaining += 15;
    state.restTimerTotal = Math.max(state.restTimerTotal, state.restTimerRemaining);
  });

  // Backup / Restore
  document.getElementById('btn-backup').addEventListener('click', exportBackup);
  document.getElementById('file-restore').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });

  // PIN
  document.getElementById('btn-set-pin').addEventListener('click', startSetPin);
  document.getElementById('btn-remove-pin').addEventListener('click', removePin);
  document.querySelectorAll('#pin-pad button').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      if (key !== undefined && key !== '') handlePinKey(key);
    });
  });
}

// ==================== INIT ====================
async function init() {
  await openDB();
  await loadSettings();
  bindEvents();
  checkPin();
  renderWeekStrip();
  renderRecentWorkouts();
  updateHeader('gym');
}

document.addEventListener('DOMContentLoaded', init);
