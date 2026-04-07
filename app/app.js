// ============================================================
// Training App — v3.2
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
        { id: 'incline-db-press', name: 'Incline DB Press', muscle: 'Chest', sets: 3, reps: '8-12', rpe: '7', defaultRest: 90, notes: '30-45° angle.', superset: 'A' },
        { id: 'face-pull', name: 'Cable Face Pull', muscle: 'Rear Delt', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Shoulder health. Non-negotiable.', superset: 'A' },
        { id: 'lateral-raise', name: 'DB Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Light, controlled, full ROM.', superset: 'B' },
        { id: 'tricep-pushdown', name: 'Tricep Pushdown', muscle: 'Triceps', sets: 2, reps: '10-15', rpe: '7', defaultRest: 60, notes: 'Optional — skip if short on time.', superset: 'B' },
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
        { id: 'leg-curl-a', name: 'Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'Focus on contraction quality.', superset: 'A' },
        { id: 'calf-raise', name: 'Standing Calf Raise', muscle: 'Calves', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Full ROM, pause at stretch.', superset: 'A' },
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
        { id: 'incline-curl', name: 'Incline DB Curl', muscle: 'Biceps', sets: 3, reps: '10-12', rpe: '7', defaultRest: 60, notes: 'Stretch at bottom.', superset: 'A' },
        { id: 'cable-lateral', name: 'Cable Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Constant tension throughout ROM.', superset: 'A' },
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
        { id: 'leg-extension', name: 'Leg Extension', muscle: 'Quads', sets: 3, reps: '10-15', rpe: '7-8', defaultRest: 90, notes: 'Controlled 2-3 sec eccentric.', superset: 'A' },
        { id: 'leg-curl-b', name: 'Leg Curl', muscle: 'Hamstrings', sets: 3, reps: '10-12', rpe: '7', defaultRest: 90, notes: 'Second hit of the week.', superset: 'A' },
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

// Key lifts for strength chart tracking
const KEY_LIFTS = ['bench-press', 'back-squat', 'sumo-dl', 'ohp', 'barbell-row', 'chinups'];

// Weekly schedule template: 0=Sun, 1=Mon, ..., 6=Sat
const WEEK_TEMPLATE = {
  1: { type: 'gym', session: 'upperA' },
  2: { type: 'gym', session: 'lowerA' },
  3: { type: 'run', label: 'Zone 2 Run' },
  4: { type: 'gym', session: 'upperB' },
  5: { type: 'gym', session: 'lowerB' },
  6: { type: 'run', label: 'Zone 2 Run' },
  0: { type: 'rest', label: 'Rest' },
};

// ==================== DATABASE ====================
const DB_NAME = 'TrainingApp';
const DB_VERSION = 2;
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
      if (!d.objectStoreNames.contains('sync_queue')) d.createObjectStore('sync_queue', { keyPath: 'id' });
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

// ==================== SYNCED DB HELPERS ====================
function smartPut(store, data) {
  if (window.syncedPut) return window.syncedPut(store, data);
  return dbPut(store, data);
}
function smartDelete(store, key) {
  if (window.syncedDelete) return window.syncedDelete(store, key);
  return dbDelete(store, key);
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
  pinMode: 'check',
  pinTemp: '',
  selectedStrengthLift: 'bench-press',
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

let _toastTimeout = null;
function toast(msg, action) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  if (_toastTimeout) clearTimeout(_toastTimeout);

  if (action) {
    el.innerHTML = `<span>${msg}</span><button class="toast-action">${action.label}</button>`;
    el.querySelector('.toast-action').addEventListener('click', () => {
      action.callback();
      el.classList.remove('show');
    });
    el.classList.add('show');
    _toastTimeout = setTimeout(() => {
      el.classList.remove('show');
      if (action.onExpire) action.onExpire();
    }, 5000);
  } else {
    el.innerHTML = `<span>${msg}</span>`;
    el.classList.add('show');
    _toastTimeout = setTimeout(() => el.classList.remove('show'), 2200);
  }
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
  return 3;
}

function getWeekDates() {
  const now = new Date();
  const day = now.getDay();
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

// Epley formula: 1RM = weight × (1 + reps/30)
function estimate1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Get exercise name from ID
function getExerciseName(exId) {
  for (const s of Object.values(PLAN.sessions)) {
    const ex = s.exercises.find(e => e.id === exId);
    if (ex) return ex.name;
  }
  return exId;
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
    d.offsetHeight;
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

// ==================== THEME ====================
function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('training_theme', theme);
  document.getElementById('theme-dark').classList.toggle('selected', theme === 'dark');
  document.getElementById('theme-light').classList.toggle('selected', theme === 'light');
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#0a0a0a' : '#f2f2f7';
}

function loadTheme() {
  const saved = localStorage.getItem('training_theme') || 'dark';
  setTheme(saved);
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
  else if (tab === 'stats') { showView('stats'); renderStats(); }

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
  } else if (tab === 'stats') {
    title.textContent = 'Stats';
    sub.textContent = `Week ${wk}`;
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
    const jsDay = date.getDay();
    const plan = WEEK_TEMPLATE[jsDay];
    const isToday = ds === todayStr;

    let icon = '', activity = '', type = plan.type;
    if (plan.type === 'gym') {
      const session = PLAN.sessions[plan.session];
      icon = session.icon;
      activity = session.name;
      if (deload) activity += ' (DL)';
    } else if (plan.type === 'run') {
      if (jsDay === 3 && runsAllowed < 2) { type = 'rest'; icon = '😴'; activity = 'Rest'; }
      else if (jsDay === 0 && runsAllowed < 3) { type = 'rest'; icon = '😴'; activity = 'Rest'; }
      else { icon = '🏃'; activity = plan.label; }
    } else {
      icon = '😴'; activity = 'Rest';
      if (jsDay === 0 && runsAllowed >= 3) { icon = '🏃'; activity = 'Run (opt)'; type = 'run'; }
    }

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
        <div class="hi-right" style="display:flex;align-items:center">
          <div>
            <div class="hi-stat">${w.quality || '-'}/5</div>
            <div class="hi-stat-sub">quality</div>
          </div>
          <button class="hi-delete" data-delete-workout="${w.id}">&times;</button>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-delete-workout]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const wId = btn.dataset.deleteWorkout;
      const deletedW = await dbGet('workouts', wId);
      await smartDelete('workouts', wId);
      renderRecentWorkouts();
      toast('Workout deleted', {
        label: 'Undo',
        callback: async () => {
          if (deletedW) {
            await smartPut('workouts', deletedW);
            renderRecentWorkouts();
          }
        }
      });
    });
  });
}

// ==================== SESSION PROGRESS BAR ====================
function updateSessionProgress() {
  const cards = document.querySelectorAll('#workout-exercises .exercise-card');
  const total = cards.length;
  let done = 0;
  cards.forEach(card => {
    const checks = card.querySelectorAll('.set-check');
    const checked = card.querySelectorAll('.set-check.checked');
    if (checks.length > 0 && checked.length === checks.length) done++;
  });
  const pct = total > 0 ? (done / total) * 100 : 0;
  document.getElementById('sp-fill').style.width = pct + '%';
  document.getElementById('sp-text').textContent = `${done} / ${total} exercises`;
}

// ==================== WORKOUT ====================
async function startWorkout(sessionId) {
  const session = PLAN.sessions[sessionId];
  if (!session) return;

  state.activeSession = sessionId;
  state.workoutStartTime = Date.now();
  state.sessionQuality = 3;

  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);

  const workouts = (await dbGetAll('workouts')).filter(w => w.session === sessionId).sort((a, b) => b.date.localeCompare(a.date));
  const previous = workouts[0] || null;

  const restSettings = await dbGet('settings', 'restTimes') || { key: 'restTimes', data: {} };
  const exerciseNotes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };

  // Render warm-up
  const warmupBody = document.getElementById('warmup-body');
  warmupBody.innerHTML = `<ul class="warmup-list">${session.warmup.map(w => `<li>${w}</li>`).join('')}</ul>`;
  document.getElementById('warmup-section').classList.remove('expanded');

  // Group exercises by superset
  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';

  // Build groups: standalone exercises and superset groups
  const groups = [];
  let currentSuperset = null;
  session.exercises.forEach((ex, idx) => {
    if (ex.superset) {
      if (currentSuperset && currentSuperset.label === ex.superset) {
        currentSuperset.exercises.push({ ex, idx });
      } else {
        currentSuperset = { type: 'superset', label: ex.superset, exercises: [{ ex, idx }] };
        groups.push(currentSuperset);
      }
    } else {
      currentSuperset = null;
      groups.push({ type: 'single', ex, idx });
    }
  });

  groups.forEach(group => {
    if (group.type === 'superset') {
      const wrapper = document.createElement('div');
      wrapper.className = 'superset-group';
      wrapper.innerHTML = `<div class="superset-label">Superset ${group.label}</div>`;
      group.exercises.forEach(({ ex, idx }) => {
        wrapper.appendChild(buildExerciseCard(ex, idx, previous, restSettings, exerciseNotes, deload, session, workouts));
      });
      container.appendChild(wrapper);
    } else {
      container.appendChild(buildExerciseCard(group.ex, group.idx, previous, restSettings, exerciseNotes, deload, session, workouts));
    }
  });

  // Event: expand/collapse
  container.querySelectorAll('.exercise-header').forEach(h => {
    h.addEventListener('click', (e) => {
      // Don't toggle if clicking the exercise name (tappable) link
      if (e.target.classList.contains('tappable')) return;
      h.closest('.exercise-card').classList.toggle('expanded');
    });
  });

  // Event: set check (+ auto rest timer)
  container.querySelectorAll('.set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('checked');
      const card = btn.closest('.exercise-card');
      updateExerciseStatus(card);
      updateSessionProgress();
      // Auto-start rest timer when checking a set (not unchecking)
      if (btn.classList.contains('checked')) {
        const configInput = card.querySelector('[data-rest-config]');
        const seconds = parseInt(configInput.value) || 120;
        startRestTimer(seconds);
      }
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
    });
  });

  // Event: tappable exercise names
  container.querySelectorAll('.exercise-name.tappable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openExerciseHistory(el.dataset.exId);
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

  updateSessionProgress();
  startWorkoutTimer();
  showView('workout');
  document.getElementById('header-title').textContent = session.name;
  document.getElementById('header-subtitle').textContent = session.subtitle + (deload ? ' (Deload)' : '');
}

function buildExerciseCard(ex, exIdx, previous, restSettings, exerciseNotes, deload, session, allWorkouts) {
  const prevEx = previous ? previous.exercises.find(e => e.exerciseId === ex.id) : null;
  const customRest = (restSettings.data && restSettings.data[ex.id]) || ex.defaultRest;
  const numSets = deload ? Math.ceil(ex.sets / 2) : ex.sets;
  const rpeDisplay = deload && ex.rpe !== '-' ? 'RPE 5-6' : `RPE ${ex.rpe}`;
  const muscleColor = MUSCLE_COLORS[ex.muscle] || '#666';
  const userNote = (exerciseNotes.data && exerciseNotes.data[ex.id]) || '';

  // Calculate est. 1RM from all history for this exercise
  let best1RM = 0;
  allWorkouts.forEach(w => {
    const wex = w.exercises.find(e => e.exerciseId === ex.id);
    if (wex) {
      wex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0).forEach(s => {
        const e1rm = estimate1RM(s.weight, s.reps);
        if (e1rm > best1RM) best1RM = e1rm;
      });
    }
  });

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

  const e1rmHTML = best1RM > 0 ? `<div class="exercise-1rm">Est. 1RM: ${best1RM} ${state.settings.unit}</div>` : '';
  const userNoteHTML = userNote ? `<div class="exercise-notes" style="border-left-color:var(--purple)">${userNote}</div>` : '';

  card.innerHTML = `
    <div class="exercise-header">
      <div class="exercise-info">
        <div class="exercise-name-row">
          <span class="exercise-name tappable" data-ex-id="${ex.id}">${ex.name}</span>
          <span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${ex.muscle}</span>
        </div>
        <div class="exercise-target">${numSets} × ${ex.reps} @ ${rpeDisplay} · Rest ${Math.floor(customRest / 60)}:${(customRest % 60).toString().padStart(2, '0')}</div>
        ${e1rmHTML}
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
        ${userNoteHTML}
      </div>
    </div>
  `;
  return card;
}

function updateExerciseStatus(card) {
  const checks = card.querySelectorAll('.set-check');
  const done = card.querySelectorAll('.set-check.checked');
  const statusEl = card.querySelector('.exercise-status');
  if (done.length === checks.length && checks.length > 0) {
    statusEl.className = 'exercise-status done';
    statusEl.textContent = '✓';
    const next = card.nextElementSibling;
    if (next && next.classList.contains('exercise-card') && !next.classList.contains('expanded')) {
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

  await smartPut('workouts', workout);

  if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
  state.activeSession = null;
  state.workoutStartTime = null;
  state.currentView = 'gym';
  document.getElementById('workout-notes').value = '';

  toast('Workout saved!');
  switchTab('gym');
}

// ==================== EXERCISE HISTORY MODAL ====================
async function openExerciseHistory(exId) {
  const modal = document.getElementById('exercise-modal');
  const exName = getExerciseName(exId);
  document.getElementById('modal-ex-name').textContent = exName;

  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));

  // Gather history for this exercise
  const history = [];
  workouts.forEach(w => {
    const ex = w.exercises.find(e => e.exerciseId === exId);
    if (ex) {
      const doneSets = ex.sets.filter(s => s.done && s.weight > 0);
      if (doneSets.length > 0) {
        const bestSet = doneSets.reduce((best, s) => estimate1RM(s.weight, s.reps) > estimate1RM(best.weight, best.reps) ? s : best);
        const avgRpe = doneSets.filter(s => s.rpe).reduce((sum, s, _, arr) => sum + s.rpe / arr.length, 0);
        history.push({
          date: w.date,
          sets: doneSets,
          best1RM: estimate1RM(bestSet.weight, bestSet.reps),
          bestWeight: bestSet.weight,
          bestReps: bestSet.reps,
          avgRpe: avgRpe || null,
        });
      }
    }
  });

  // Show 1RM
  const latest1RM = history.length > 0 ? history[history.length - 1].best1RM : 0;
  const peak1RM = history.reduce((max, h) => Math.max(max, h.best1RM), 0);
  document.getElementById('modal-1rm').innerHTML = latest1RM > 0
    ? `<span>Est. 1RM</span><span class="val">${latest1RM} ${state.settings.unit}</span>`
    : '<span>No data yet</span>';

  // RPE trend chart
  const rpeChart = document.getElementById('modal-rpe-chart');
  const rpeData = history.filter(h => h.avgRpe > 0).slice(-12);
  if (rpeData.length >= 2) {
    rpeChart.innerHTML = renderLineChart(
      rpeData.map(h => formatDate(h.date)),
      rpeData.map(h => Math.round(h.avgRpe * 10) / 10),
      { min: 5, max: 10, color: 'var(--orange)', height: 120 }
    );
  } else {
    rpeChart.innerHTML = '<span class="chart-empty">Need 2+ sessions for RPE trend</span>';
  }

  // History list
  const histList = document.getElementById('modal-history-list');
  const recentHistory = history.slice().reverse().slice(0, 20);
  if (recentHistory.length === 0) {
    histList.innerHTML = '<div class="empty-state">No history for this exercise</div>';
  } else {
    histList.innerHTML = recentHistory.map(h => `
      <div class="modal-history-row">
        <span class="mhr-date">${formatDate(h.date)}</span>
        <span class="mhr-data">${h.sets.map(s => `${s.weight}×${s.reps}`).join(', ')}</span>
        <span class="mhr-rpe">${h.avgRpe ? `RPE ${h.avgRpe.toFixed(1)}` : ''}</span>
      </div>
    `).join('');
  }

  // Load exercise notes
  const exerciseNotes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };
  document.getElementById('modal-ex-notes').value = (exerciseNotes.data && exerciseNotes.data[exId]) || '';

  // Save notes handler
  const saveBtn = document.getElementById('modal-save-notes');
  saveBtn.onclick = async () => {
    const notes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };
    if (!notes.data) notes.data = {};
    notes.data[exId] = document.getElementById('modal-ex-notes').value.trim();
    await dbPut('settings', notes);
    toast('Notes saved');
  };

  modal.classList.remove('hidden');
}

function closeExerciseModal() {
  document.getElementById('exercise-modal').classList.add('hidden');
}

// ==================== SVG CHART RENDERING ====================
function renderLineChart(labels, values, opts = {}) {
  const { min, max, color = 'var(--accent)', height = 150, showDots = true } = opts;
  const width = 320;
  const pad = { top: 20, right: 15, bottom: 30, left: 40 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  if (values.length === 0) return '<span class="chart-empty">No data</span>';

  const dataMin = min !== undefined ? min : Math.min(...values) * 0.9;
  const dataMax = max !== undefined ? max : Math.max(...values) * 1.1;
  const range = dataMax - dataMin || 1;

  const points = values.map((v, i) => {
    const x = pad.left + (i / Math.max(values.length - 1, 1)) * chartW;
    const y = pad.top + chartH - ((v - dataMin) / range) * chartH;
    return { x, y, v };
  });

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Y-axis labels
  const ySteps = 4;
  let yLabels = '';
  for (let i = 0; i <= ySteps; i++) {
    const val = dataMin + (range * i / ySteps);
    const y = pad.top + chartH - (i / ySteps) * chartH;
    yLabels += `<text x="${pad.left - 6}" y="${y + 4}" fill="var(--text3)" font-size="10" text-anchor="end">${Math.round(val * 10) / 10}</text>`;
    yLabels += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="var(--border)" stroke-width="0.5" stroke-dasharray="3"/>`;
  }

  // X-axis labels (show max 6)
  let xLabels = '';
  const step = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((label, i) => {
    if (i % step === 0 || i === labels.length - 1) {
      const x = pad.left + (i / Math.max(labels.length - 1, 1)) * chartW;
      xLabels += `<text x="${x}" y="${height - 4}" fill="var(--text3)" font-size="9" text-anchor="middle">${label}</text>`;
    }
  });

  // Dots
  let dotsHTML = '';
  if (showDots) {
    dotsHTML = points.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="${color}"/>`).join('');
  }

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      ${yLabels}
      ${xLabels}
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dotsHTML}
    </svg>
  `;
}

// ==================== STATS MODULE ====================
async function renderStats() {
  await renderStreaks();
  await renderFatigueScore();
  await renderWeeklyReport();
  await renderWeekComparison();
  await renderStrengthChart();
  await renderVolumeChart();
}

async function renderStreaks() {
  const container = document.getElementById('streak-row');
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date));
  const runs = (await dbGetAll('runs')).sort((a, b) => b.date.localeCompare(a.date));
  const nutrition = (await dbGetAll('nutrition')).sort((a, b) => b.date.localeCompare(a.date));

  // Gym streak: consecutive weeks with 3+ workouts
  const gymWeeks = {};
  workouts.forEach(w => {
    const wk = w.week || 1;
    gymWeeks[wk] = (gymWeeks[wk] || 0) + 1;
  });
  let gymStreak = 0;
  const currentWk = getWeekNumber();
  for (let wk = currentWk; wk >= 1; wk--) {
    if ((gymWeeks[wk] || 0) >= 3) gymStreak++;
    else if (wk < currentWk) break; // allow current week to be incomplete
    else if (wk === currentWk) continue; // current week in progress
  }

  // Protein streak: consecutive days hitting target
  let proteinStreak = 0;
  const todayD = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(todayD);
    d.setDate(todayD.getDate() - i);
    const ds = dateStr(d);
    const entry = nutrition.find(n => n.date === ds);
    if (entry && entry.protein >= state.settings.proteinTarget) {
      proteinStreak++;
    } else if (i > 0) {
      break; // allow today to be missing
    }
  }

  // Total sessions
  const totalSessions = workouts.length + runs.length;

  container.innerHTML = `
    <div class="streak-card">
      <div class="streak-num">${gymStreak}</div>
      <div class="streak-label">Gym Weeks</div>
    </div>
    <div class="streak-card">
      <div class="streak-num">${proteinStreak}</div>
      <div class="streak-label">Protein Days</div>
    </div>
    <div class="streak-card">
      <div class="streak-num">${totalSessions}</div>
      <div class="streak-label">Total Sessions</div>
    </div>
  `;
}

async function renderFatigueScore() {
  const container = document.getElementById('fatigue-card');
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date));
  const runs = (await dbGetAll('runs')).sort((a, b) => b.date.localeCompare(a.date));
  const nutrition = (await dbGetAll('nutrition')).sort((a, b) => b.date.localeCompare(a.date));

  // Last 7 days data
  const last7 = [];
  const now = new Date();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    last7.push(dateStr(d));
  }

  const recentWorkouts = workouts.filter(w => last7.includes(w.date));
  const recentRuns = runs.filter(r => last7.includes(r.date));
  const recentNutrition = nutrition.filter(n => last7.includes(n.date));

  // Fatigue score: 0-100 (higher = more fatigued)
  let fatigue = 0;

  // Training frequency (0-30 points)
  const sessions = recentWorkouts.length + recentRuns.length;
  if (sessions >= 6) fatigue += 30;
  else if (sessions >= 5) fatigue += 22;
  else if (sessions >= 4) fatigue += 15;
  else fatigue += sessions * 3;

  // Session quality (0-30 points, lower quality = more fatigue)
  const qualities = recentWorkouts.map(w => w.quality).filter(q => q);
  if (qualities.length > 0) {
    const avgQuality = qualities.reduce((a, b) => a + b, 0) / qualities.length;
    fatigue += Math.round((5 - avgQuality) * 6); // 5→0, 1→24
  }

  // Energy from nutrition (0-20 points)
  const energies = recentNutrition.map(n => n.energy).filter(e => e);
  if (energies.length > 0) {
    const avgEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
    fatigue += Math.round((5 - avgEnergy) * 4);
  }

  // Protein deficit (0-20 points)
  const proteinDays = recentNutrition.filter(n => n.protein < state.settings.proteinTarget).length;
  fatigue += proteinDays * 3;

  fatigue = Math.min(100, Math.max(0, fatigue));

  let color, tip;
  if (fatigue <= 30) { color = 'var(--accent)'; tip = 'Recovery looks good. Push hard today.'; }
  else if (fatigue <= 55) { color = 'var(--yellow)'; tip = 'Moderate fatigue. Train normally but monitor.'; }
  else if (fatigue <= 75) { color = 'var(--orange)'; tip = 'Elevated fatigue. Consider reducing volume or intensity.'; }
  else { color = 'var(--red)'; tip = 'High fatigue. Consider a rest day or very light session.'; }

  container.innerHTML = `
    <div class="fatigue-header">
      <span class="fatigue-title">Fatigue Score</span>
      <span class="fatigue-score" style="color:${color}">${fatigue}</span>
    </div>
    <div class="fatigue-bar"><div class="fatigue-bar-fill" style="width:${fatigue}%;background:${color}"></div></div>
    <div class="fatigue-tip">${tip}</div>
  `;
}

async function renderWeeklyReport() {
  const container = document.getElementById('weekly-report');
  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const nutrition = await dbGetAll('nutrition');

  // This week
  const weekDates = getWeekDates().map(d => dateStr(d));
  const weekWorkouts = workouts.filter(w => weekDates.includes(w.date));
  const weekRuns = runs.filter(r => weekDates.includes(r.date));
  const weekNutrition = nutrition.filter(n => weekDates.includes(n.date));

  // Total volume this week
  let totalVolume = 0;
  weekWorkouts.forEach(w => {
    w.exercises.forEach(ex => {
      ex.sets.filter(s => s.done).forEach(s => {
        totalVolume += (s.weight || 0) * (s.reps || 0);
      });
    });
  });

  // Avg protein
  const avgProtein = weekNutrition.length > 0
    ? Math.round(weekNutrition.reduce((sum, n) => sum + (n.protein || 0), 0) / weekNutrition.length)
    : 0;

  // Avg quality
  const avgQuality = weekWorkouts.length > 0
    ? (weekWorkouts.reduce((sum, w) => sum + (w.quality || 3), 0) / weekWorkouts.length).toFixed(1)
    : '-';

  // Total run km
  const totalKm = weekRuns.reduce((sum, r) => sum + (r.distance || 0), 0).toFixed(1);

  container.innerHTML = `
    <div class="report-row"><span class="rr-label">Gym sessions</span><span class="rr-value">${weekWorkouts.length}</span></div>
    <div class="report-row"><span class="rr-label">Runs</span><span class="rr-value">${weekRuns.length}</span></div>
    <div class="report-row"><span class="rr-label">Total volume</span><span class="rr-value">${totalVolume.toLocaleString()} kg</span></div>
    <div class="report-row"><span class="rr-label">Running distance</span><span class="rr-value">${totalKm} km</span></div>
    <div class="report-row"><span class="rr-label">Avg protein</span><span class="rr-value">${avgProtein}g</span></div>
    <div class="report-row"><span class="rr-label">Avg session quality</span><span class="rr-value">${avgQuality}/5</span></div>
  `;
}

async function renderStrengthChart() {
  const tabsContainer = document.getElementById('strength-tabs');
  const chartContainer = document.getElementById('strength-chart');

  // Build tabs for key lifts
  tabsContainer.innerHTML = KEY_LIFTS.map(liftId => {
    const name = getExerciseName(liftId);
    const short = name.replace('Barbell ', '').replace('Sumo ', '');
    return `<button class="chart-tab${liftId === state.selectedStrengthLift ? ' active' : ''}" data-lift="${liftId}">${short}</button>`;
  }).join('');

  tabsContainer.querySelectorAll('.chart-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedStrengthLift = btn.dataset.lift;
      tabsContainer.querySelectorAll('.chart-tab').forEach(b => b.classList.toggle('active', b.dataset.lift === state.selectedStrengthLift));
      drawStrengthChart(state.selectedStrengthLift, chartContainer);
    });
  });

  await drawStrengthChart(state.selectedStrengthLift, chartContainer);
}

async function drawStrengthChart(liftId, container) {
  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));

  const data = [];
  workouts.forEach(w => {
    const ex = w.exercises.find(e => e.exerciseId === liftId);
    if (ex) {
      const doneSets = ex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0);
      if (doneSets.length > 0) {
        const best = doneSets.reduce((b, s) => estimate1RM(s.weight, s.reps) > estimate1RM(b.weight, b.reps) ? s : b);
        data.push({ date: w.date, e1rm: estimate1RM(best.weight, best.reps) });
      }
    }
  });

  if (data.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ sessions to chart progress</span>';
    return;
  }

  container.innerHTML = renderLineChart(
    data.map(d => formatDate(d.date)),
    data.map(d => d.e1rm),
    { color: 'var(--accent)', height: 160 }
  );
}

async function renderVolumeChart() {
  const container = document.getElementById('volume-chart');
  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));

  if (workouts.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ weeks of data</span>';
    return;
  }

  // Group by week
  const weekVolumes = {};
  workouts.forEach(w => {
    const wk = w.week || 1;
    if (!weekVolumes[wk]) weekVolumes[wk] = 0;
    w.exercises.forEach(ex => {
      ex.sets.filter(s => s.done).forEach(s => {
        weekVolumes[wk] += (s.weight || 0) * (s.reps || 0);
      });
    });
  });

  const weeks = Object.keys(weekVolumes).sort((a, b) => a - b);
  if (weeks.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ weeks of data</span>';
    return;
  }

  container.innerHTML = renderLineChart(
    weeks.map(w => `Wk ${w}`),
    weeks.map(w => Math.round(weekVolumes[w])),
    { color: 'var(--blue)', height: 160 }
  );
}

// ==================== WEEK vs WEEK COMPARISON ====================
async function renderWeekComparison() {
  const container = document.getElementById('week-compare');
  if (!container) return;

  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const nutrition = await dbGetAll('nutrition');

  // Current week dates
  const curWeekDates = getWeekDates().map(d => dateStr(d));

  // Previous week dates
  const prevWeekDates = getWeekDates().map(d => {
    const pd = new Date(d);
    pd.setDate(pd.getDate() - 7);
    return dateStr(pd);
  });

  function weekMetrics(dates) {
    const wk = workouts.filter(w => dates.includes(w.date));
    const rn = runs.filter(r => dates.includes(r.date));
    const nt = nutrition.filter(n => dates.includes(n.date));

    let volume = 0;
    wk.forEach(w => w.exercises.forEach(ex => ex.sets.filter(s => s.done).forEach(s => { volume += (s.weight || 0) * (s.reps || 0); })));

    const avgProtein = nt.length > 0 ? Math.round(nt.reduce((s, n) => s + (n.protein || 0), 0) / nt.length) : 0;
    const avgQuality = wk.length > 0 ? +(wk.reduce((s, w) => s + (w.quality || 3), 0) / wk.length).toFixed(1) : 0;
    const totalKm = +rn.reduce((s, r) => s + (r.distance || 0), 0).toFixed(1);

    return { sessions: wk.length, runs: rn.length, volume, totalKm, avgProtein, avgQuality };
  }

  const curr = weekMetrics(curWeekDates);
  const prev = weekMetrics(prevWeekDates);

  function delta(c, p, higherIsBetter = true) {
    if (p === 0 && c === 0) return '<span class="wc-delta flat">=</span>';
    if (p === 0) return '<span class="wc-delta up">NEW</span>';
    const diff = c - p;
    if (diff === 0) return '<span class="wc-delta flat">=</span>';
    const positive = higherIsBetter ? diff > 0 : diff < 0;
    const arrow = diff > 0 ? '↑' : '↓';
    const cls = positive ? 'up' : 'down';
    return `<span class="wc-delta ${cls}">${arrow}${Math.abs(Math.round(diff))}</span>`;
  }

  const rows = [
    { label: 'Gym sessions', c: curr.sessions, p: prev.sessions },
    { label: 'Runs', c: curr.runs, p: prev.runs },
    { label: 'Volume (kg)', c: curr.volume.toLocaleString(), p: prev.volume.toLocaleString(), cRaw: curr.volume, pRaw: prev.volume },
    { label: 'Run km', c: curr.totalKm, p: prev.totalKm },
    { label: 'Avg protein', c: curr.avgProtein + 'g', p: prev.avgProtein + 'g', cRaw: curr.avgProtein, pRaw: prev.avgProtein },
    { label: 'Avg quality', c: curr.avgQuality + '/5', p: prev.avgQuality + '/5', cRaw: curr.avgQuality, pRaw: prev.avgQuality },
  ];

  container.innerHTML = `
    <div class="wc-header">
      <span></span><span>Prev</span><span>This</span><span>Δ</span>
    </div>
    ${rows.map(r => `
      <div class="wc-row">
        <span class="wc-label">${r.label}</span>
        <span class="wc-val" style="color:var(--text3)">${r.p}</span>
        <span class="wc-val">${r.c}</span>
        ${delta(r.cRaw !== undefined ? r.cRaw : r.c, r.pRaw !== undefined ? r.pRaw : r.p)}
      </div>
    `).join('')}
  `;
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

  await smartPut('runs', run);

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
      const runId = btn.dataset.deleteRun;
      const deletedRun = await dbGet('runs', runId);
      await smartDelete('runs', runId);
      renderRunHistory();
      toast('Run deleted', {
        label: 'Undo',
        callback: async () => {
          if (deletedRun) {
            await smartPut('runs', deletedRun);
            renderRunHistory();
          }
        }
      });
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

  await smartPut('nutrition', entry);
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
    version: 3.1,
    exportDate: new Date().toISOString(),
    workouts: await dbGetAll('workouts'),
    runs: await dbGetAll('runs'),
    nutrition: await dbGetAll('nutrition'),
    settings: await dbGetAll('settings'),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const fileName = `training-backup-${today()}.json`;

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

  // Theme toggles
  document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
  document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));

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

  // Exercise modal close
  document.getElementById('modal-close').addEventListener('click', closeExerciseModal);

  // Notification toggles
  document.getElementById('notif-on').addEventListener('click', () => toggleNotifications(true));
  document.getElementById('notif-off').addEventListener('click', () => toggleNotifications(false));
}

// ==================== NOTIFICATIONS ====================
let _notifInterval = null;

async function initNotifications() {
  const enabled = localStorage.getItem('training_notif') === 'on';
  document.getElementById('notif-on').classList.toggle('selected', enabled);
  document.getElementById('notif-off').classList.toggle('selected', !enabled);

  if (enabled && 'Notification' in window) {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') startNotificationChecks();
  }
}

function toggleNotifications(on) {
  localStorage.setItem('training_notif', on ? 'on' : 'off');
  document.getElementById('notif-on').classList.toggle('selected', on);
  document.getElementById('notif-off').classList.toggle('selected', !on);

  if (on && 'Notification' in window) {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        startNotificationChecks();
        toast('Notifications enabled');
      } else {
        toast('Permission denied by browser');
        localStorage.setItem('training_notif', 'off');
        document.getElementById('notif-on').classList.remove('selected');
        document.getElementById('notif-off').classList.add('selected');
      }
    });
  } else {
    if (_notifInterval) clearInterval(_notifInterval);
    toast('Notifications disabled');
  }
}

function startNotificationChecks() {
  if (_notifInterval) clearInterval(_notifInterval);
  checkAndNotify(); // immediate check
  _notifInterval = setInterval(checkAndNotify, 30 * 60 * 1000); // every 30 min
}

async function checkAndNotify() {
  if (localStorage.getItem('training_notif') !== 'on') return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const hour = now.getHours();
  const todayStr = today();
  const lastNotif = localStorage.getItem('training_last_notif');
  if (lastNotif === todayStr) return; // one notification per day max

  const jsDay = now.getDay();
  const plan = WEEK_TEMPLATE[jsDay];

  // Morning training reminder (7-10 AM)
  if (hour >= 7 && hour <= 10 && plan.type !== 'rest') {
    const label = plan.type === 'gym' ? PLAN.sessions[plan.session].name : 'Zone 2 Run';
    new Notification('Training Day', { body: `Today: ${label}. Let's go!`, tag: 'training-day' });
    localStorage.setItem('training_last_notif', todayStr);
    return;
  }

  // Evening protein reminder (8-10 PM)
  if (hour >= 20 && hour <= 22) {
    try {
      const entry = await dbGet('nutrition', todayStr);
      if (!entry || (entry.protein || 0) < state.settings.proteinTarget) {
        const current = entry ? entry.protein || 0 : 0;
        new Notification('Protein Check', {
          body: `${current}g / ${state.settings.proteinTarget}g today. Log your protein!`,
          tag: 'protein-reminder'
        });
        localStorage.setItem('training_last_notif', todayStr);
      }
    } catch (e) { /* ignore */ }
  }
}

// ==================== SERVICE WORKER ====================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  }
}

// ==================== INIT ====================
async function init() {
  await openDB();
  await loadSettings();
  loadTheme();
  bindEvents();
  checkPin();
  renderWeekStrip();
  renderRecentWorkouts();
  updateHeader('gym');

  // Service Worker
  registerServiceWorker();

  // Supabase (optional)
  if (window.initSupabase) {
    window.initSupabase();
  } else {
    // No sync module — render auth section as offline only
    const authSection = document.getElementById('auth-section');
    if (authSection) {
      authSection.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Cloud sync not configured.</p>';
    }
  }

  // Notifications
  initNotifications();
}

document.addEventListener('DOMContentLoaded', init);
