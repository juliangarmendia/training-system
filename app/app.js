// ============================================================
// Training App — v4.0
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
        { id: 'chinups', name: 'Chin-ups', muscle: 'Back', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Add weight when you get 4×8. Use lat pulldown if <5 reps.', bw: true },
        { id: 'ohp', name: 'Overhead Press', muscle: 'Shoulders', sets: 4, reps: '5-8', rpe: '7-8', defaultRest: 150, notes: 'Standing. Strict form, no leg drive.' },
        { id: 'landmine-row', name: 'Landmine Row', muscle: 'Back', sets: 3, reps: '8-12/side', rpe: '7', defaultRest: 90, notes: 'Unilateral. Use landmine attachment.' },
        { id: 'incline-curl', name: 'Incline DB Curl', muscle: 'Biceps', sets: 3, reps: '10-12', rpe: '7', defaultRest: 60, notes: 'Stretch at bottom.', superset: 'A' },
        { id: 'cable-lateral', name: 'Cable Lateral Raise', muscle: 'Shoulders', sets: 3, reps: '12-15', rpe: '7', defaultRest: 60, notes: 'Constant tension throughout ROM.', superset: 'A' },
        { id: 'hanging-leg-raise', name: 'Hanging Leg Raise', muscle: 'Core', sets: 3, reps: '8-12', rpe: '-', defaultRest: 60, notes: 'Scale to knee raises if needed.', bw: true },
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

// Rolling number animation — digits roll up/down when value changes
function animateNumber(el, newValue, suffix = '') {
  if (!el) return;
  const text = String(newValue) + suffix;
  if (el.textContent === text) return;
  el.classList.add('num-roll');
  el.style.setProperty('--from', `"${el.textContent}"`);
  el.textContent = text;
  el.addEventListener('animationend', () => el.classList.remove('num-roll'), { once: true });
}

// RPE color mapping
function rpeColor(rpe) {
  if (!rpe || rpe <= 0) return 'var(--text3)';
  if (rpe <= 6) return 'var(--accent)';
  if (rpe <= 7) return '#86efac';
  if (rpe <= 7.5) return 'var(--yellow)';
  if (rpe <= 8.5) return 'var(--orange)';
  return 'var(--red)';
}

// Muscle badge colors
const MUSCLE_COLORS = {
  'Chest': '#60a5fa', 'Back': '#34d399', 'Shoulders': '#a78bfa', 'Rear Delt': '#a78bfa',
  'Triceps': '#fb923c', 'Biceps': '#f472b6', 'Quads': '#4ade80', 'Hamstrings': '#fbbf24',
  'Calves': '#94a3b8', 'Core': '#e2e8f0', 'Glutes': '#f472b6', 'Posterior': '#fbbf24',
};

// Key lifts for strength chart tracking
const KEY_LIFTS = ['bench-press', 'back-squat', 'sumo-dl', 'ohp', 'barbell-row', 'chinups'];

// Exercise alternatives by muscle group (for swapping)
const EXERCISE_ALTERNATIVES = {
  'Chest': [
    { id: 'bench-press', name: 'Barbell Bench Press' },
    { id: 'incline-db-press', name: 'Incline DB Press' },
    { id: 'db-bench', name: 'DB Bench Press' },
    { id: 'machine-chest-press', name: 'Machine Chest Press' },
    { id: 'cable-fly', name: 'Cable Fly' },
    { id: 'pushup', name: 'Push-ups' },
    { id: 'dips', name: 'Dips (Chest)' },
  ],
  'Back': [
    { id: 'barbell-row', name: 'Barbell Row' },
    { id: 'chinups', name: 'Chin-ups' },
    { id: 'lat-pulldown', name: 'Lat Pulldown' },
    { id: 'landmine-row', name: 'Landmine Row' },
    { id: 'cable-row', name: 'Cable Row' },
    { id: 'db-row', name: 'DB Row' },
    { id: 't-bar-row', name: 'T-Bar Row' },
    { id: 'pullups', name: 'Pull-ups' },
  ],
  'Shoulders': [
    { id: 'ohp', name: 'Overhead Press' },
    { id: 'lateral-raise', name: 'DB Lateral Raise' },
    { id: 'cable-lateral', name: 'Cable Lateral Raise' },
    { id: 'db-shoulder-press', name: 'DB Shoulder Press' },
    { id: 'machine-shoulder-press', name: 'Machine Shoulder Press' },
    { id: 'arnold-press', name: 'Arnold Press' },
  ],
  'Rear Delt': [
    { id: 'face-pull', name: 'Cable Face Pull' },
    { id: 'rear-delt-fly', name: 'Rear Delt Fly' },
    { id: 'band-pull-apart', name: 'Band Pull-Apart' },
    { id: 'reverse-pec-deck', name: 'Reverse Pec Deck' },
  ],
  'Quads': [
    { id: 'back-squat', name: 'Barbell Back Squat' },
    { id: 'front-squat', name: 'Front Squat' },
    { id: 'leg-press', name: 'Leg Press' },
    { id: 'leg-extension', name: 'Leg Extension' },
    { id: 'bss', name: 'Bulgarian Split Squat' },
    { id: 'goblet-squat', name: 'Goblet Squat' },
    { id: 'hack-squat', name: 'Hack Squat' },
  ],
  'Hamstrings': [
    { id: 'rdl', name: 'Barbell RDL' },
    { id: 'leg-curl-a', name: 'Leg Curl' },
    { id: 'db-rdl', name: 'DB RDL' },
    { id: 'good-morning', name: 'Good Morning' },
    { id: 'nordic-curl', name: 'Nordic Curl' },
  ],
  'Posterior': [
    { id: 'sumo-dl', name: 'Sumo Deadlift' },
    { id: 'conv-dl', name: 'Conventional Deadlift' },
    { id: 'trap-bar-dl', name: 'Trap Bar Deadlift' },
    { id: 'rdl', name: 'Barbell RDL' },
  ],
  'Glutes': [
    { id: 'hip-thrust', name: 'Barbell Hip Thrust' },
    { id: 'cable-kickback', name: 'Cable Kickback' },
    { id: 'glute-bridge', name: 'Glute Bridge' },
  ],
  'Triceps': [
    { id: 'tricep-pushdown', name: 'Tricep Pushdown' },
    { id: 'overhead-ext', name: 'Overhead Tricep Extension' },
    { id: 'skull-crusher', name: 'Skull Crusher' },
    { id: 'close-grip-bench', name: 'Close-Grip Bench' },
  ],
  'Biceps': [
    { id: 'incline-curl', name: 'Incline DB Curl' },
    { id: 'barbell-curl', name: 'Barbell Curl' },
    { id: 'hammer-curl', name: 'Hammer Curl' },
    { id: 'cable-curl', name: 'Cable Curl' },
    { id: 'preacher-curl', name: 'Preacher Curl' },
  ],
  'Core': [
    { id: 'ab-wheel', name: 'Ab Wheel Rollout' },
    { id: 'hanging-leg-raise', name: 'Hanging Leg Raise' },
    { id: 'pallof-press', name: 'Cable Pallof Press' },
    { id: 'cable-crunch', name: 'Cable Crunch' },
    { id: 'plank', name: 'Plank' },
    { id: 'dead-bug', name: 'Dead Bug' },
  ],
  'Calves': [
    { id: 'calf-raise', name: 'Standing Calf Raise' },
    { id: 'seated-calf-raise', name: 'Seated Calf Raise' },
    { id: 'leg-press-calf', name: 'Leg Press Calf Raise' },
  ],
};

// Standard plate weights (kg) for plate calculator
const PLATE_WEIGHTS = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_WEIGHT = 20; // Standard Olympic bar

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

// ==================== DYNAMIC PLAN SYSTEM ====================
// Module-level state — loaded from IDB at startup, fallback to hardcoded PLAN
let activePlan = null;           // { sessions, weekTemplate, version, ... }
let activeWeekTemplate = null;   // shortcut to activePlan.weekTemplate
let exerciseLibrary = {};        // { exerciseId: { id, name, muscle, movementPattern, ... } }

// Movement pattern mapping for every known exercise
const MOVEMENT_PATTERNS = {
  // Horizontal press
  'bench-press': 'horizontal-press', 'incline-db-press': 'horizontal-press',
  'db-bench': 'horizontal-press', 'machine-chest-press': 'horizontal-press',
  'cable-fly': 'horizontal-press', 'pushup': 'horizontal-press',
  'dips': 'horizontal-press', 'close-grip-bench': 'horizontal-press',
  'floor-press': 'horizontal-press',
  // Vertical press
  'ohp': 'vertical-press', 'db-shoulder-press': 'vertical-press',
  'machine-shoulder-press': 'vertical-press', 'arnold-press': 'vertical-press',
  // Horizontal pull
  'barbell-row': 'horizontal-pull', 'landmine-row': 'horizontal-pull',
  'cable-row': 'horizontal-pull', 'db-row': 'horizontal-pull',
  't-bar-row': 'horizontal-pull',
  // Vertical pull
  'chinups': 'vertical-pull', 'pullups': 'vertical-pull',
  'lat-pulldown': 'vertical-pull',
  // Squat pattern
  'back-squat': 'squat', 'front-squat': 'squat', 'leg-press': 'squat',
  'goblet-squat': 'squat', 'hack-squat': 'squat', 'bss': 'single-leg',
  // Hinge
  'sumo-dl': 'hinge', 'conv-dl': 'hinge', 'trap-bar-dl': 'hinge',
  'rdl': 'hinge', 'db-rdl': 'hinge', 'good-morning': 'hinge',
  // Isolation legs
  'leg-extension': 'isolation-quad', 'leg-curl-a': 'isolation-ham',
  'leg-curl-b': 'isolation-ham', 'nordic-curl': 'isolation-ham',
  'calf-raise': 'isolation-calf', 'seated-calf-raise': 'isolation-calf',
  'leg-press-calf': 'isolation-calf',
  // Glute
  'hip-thrust': 'glute', 'cable-kickback': 'glute', 'glute-bridge': 'glute',
  // Isolation shoulder
  'lateral-raise': 'isolation-shoulder', 'cable-lateral': 'isolation-shoulder',
  'face-pull': 'isolation-rear-delt', 'rear-delt-fly': 'isolation-rear-delt',
  'band-pull-apart': 'isolation-rear-delt', 'reverse-pec-deck': 'isolation-rear-delt',
  // Isolation arms
  'tricep-pushdown': 'isolation-tricep', 'overhead-ext': 'isolation-tricep',
  'skull-crusher': 'isolation-tricep',
  'incline-curl': 'isolation-bicep', 'barbell-curl': 'isolation-bicep',
  'hammer-curl': 'isolation-bicep', 'cable-curl': 'isolation-bicep',
  'preacher-curl': 'isolation-bicep',
  // Core
  'ab-wheel': 'core', 'hanging-leg-raise': 'core', 'pallof-press': 'core',
  'cable-crunch': 'core', 'plank': 'core', 'dead-bug': 'core',
};

// Seed the plans store with the hardcoded PLAN if empty
async function ensurePlanSeeded() {
  const plans = await dbGetAll('plans');
  if (plans.length > 0) return;
  const seedPlan = {
    id: 'plan_v1',
    version: 1,
    createdAt: new Date().toISOString(),
    weekNumber: null,
    label: 'Upper/Lower 4-Day Split',
    sessions: JSON.parse(JSON.stringify(PLAN.sessions)),
    weekTemplate: JSON.parse(JSON.stringify(WEEK_TEMPLATE)),
  };
  await dbPut('plans', seedPlan);
  console.log('[Plan] Seeded plan_v1 from hardcoded PLAN');
}

// Build the exercise library from PLAN sessions + EXERCISE_ALTERNATIVES
async function ensureExerciseLibrarySeeded() {
  const existing = await dbGetAll('exercises');
  if (existing.length > 0) return;
  const exMap = {};
  // From PLAN sessions
  for (const s of Object.values(PLAN.sessions)) {
    for (const ex of s.exercises) {
      if (!exMap[ex.id]) {
        exMap[ex.id] = {
          id: ex.id, name: ex.name, muscle: ex.muscle,
          movementPattern: MOVEMENT_PATTERNS[ex.id] || 'other',
          bw: !!ex.bw, defaultNotes: ex.notes || '', custom: false,
        };
      }
    }
  }
  // From EXERCISE_ALTERNATIVES
  for (const [muscle, alts] of Object.entries(EXERCISE_ALTERNATIVES)) {
    for (const alt of alts) {
      if (!exMap[alt.id]) {
        exMap[alt.id] = {
          id: alt.id, name: alt.name, muscle,
          movementPattern: MOVEMENT_PATTERNS[alt.id] || 'other',
          bw: false, defaultNotes: '', custom: false,
        };
      }
    }
  }
  for (const ex of Object.values(exMap)) {
    await dbPut('exercises', ex);
  }
  console.log(`[Plan] Seeded ${Object.keys(exMap).length} exercises`);
}

// Load the highest-version plan into memory
async function loadActivePlan() {
  const plans = await dbGetAll('plans');
  if (plans.length > 0) {
    plans.sort((a, b) => b.version - a.version);
    activePlan = plans[0];
    activeWeekTemplate = activePlan.weekTemplate;
  } else {
    // Fallback to hardcoded (should not happen after seed)
    activePlan = { sessions: PLAN.sessions, weekTemplate: WEEK_TEMPLATE, version: 0, label: 'Fallback' };
    activeWeekTemplate = WEEK_TEMPLATE;
  }
  console.log(`[Plan] Active: v${activePlan.version} "${activePlan.label}"`);
}

// Load exercise library into memory for fast lookups
async function loadExerciseLibrary() {
  const all = await dbGetAll('exercises');
  exerciseLibrary = {};
  all.forEach(ex => { exerciseLibrary[ex.id] = ex; });
  console.log(`[Plan] Exercise library: ${all.length} exercises loaded`);
}

// Create a new plan version (for weekly updates)
async function createNewPlanVersion(modifications) {
  const plans = await dbGetAll('plans');
  const currentVersion = Math.max(...plans.map(p => p.version), 0);
  const newPlan = {
    id: `plan_v${currentVersion + 1}`,
    version: currentVersion + 1,
    createdAt: new Date().toISOString(),
    weekNumber: modifications.weekNumber || getWeekNumber(),
    label: modifications.label || activePlan.label,
    sessions: JSON.parse(JSON.stringify(modifications.sessions || activePlan.sessions)),
    weekTemplate: JSON.parse(JSON.stringify(modifications.weekTemplate || activeWeekTemplate)),
  };
  await smartPut('plans', newPlan);
  activePlan = newPlan;
  activeWeekTemplate = newPlan.weekTemplate;
  console.log(`[Plan] Created v${newPlan.version} "${newPlan.label}"`);
  return newPlan;
}

// ==================== DATABASE ====================
const DB_NAME = 'TrainingApp';
const DB_VERSION = 5;
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
      if (!d.objectStoreNames.contains('bodyweight')) d.createObjectStore('bodyweight', { keyPath: 'date' });
      // Trash: soft-deleted items kept locally for 2 days
      if (!d.objectStoreNames.contains('trash')) d.createObjectStore('trash', { keyPath: 'trashId' });
      // Dynamic plans (versioned snapshots) and exercise library
      if (!d.objectStoreNames.contains('plans')) d.createObjectStore('plans', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('exercises')) d.createObjectStore('exercises', { keyPath: 'id' });
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
  viewingCompleted: false,
  workoutStartTime: null,
  workoutTimerInterval: null,
  restTimerInterval: null,
  restTimerRemaining: 0,
  restTimerTotal: 0,
  settings: { unit: 'kg', proteinTarget: 170, calorieTarget: 2500, startDate: null, userName: '' },
  sessionQuality: 3,
  selectedStrengthLift: 'bench-press',
};

// ==================== ONE-SHOT MIGRATION: tz date fix ====================
// Previous versions used toISOString() which is UTC. For users east/west of
// UTC, evening workouts were saved to the next day. This runs once: for each
// workout/run from the last 90 days, if the stored `date` is exactly 1 day
// ahead of what the id's epoch converts to in local time, fix it.
//
// v1 had a slice bug (took 9 chars when Date.now().toString(36) is 8) so the
// parsed epoch was garbage — v2 rolls a new flag and re-runs correctly.
// One-shot: reset the cloud-sync watermark so the next syncAll re-pulls ALL
// rows from Supabase. Used to recover workouts that were locally deleted but
// still exist in cloud (e.g. accidental tap on the old delete X).
async function oneShotCloudRecovery() {
  if (localStorage.getItem('cloud_recovery_v1')) return;
  try {
    await dbDelete('settings', 'lastSyncTimestamp');
    localStorage.setItem('cloud_recovery_v1', String(Date.now()));
    console.log('[Recovery] lastSyncTimestamp reset — next sync will full-pull');
  } catch (e) { console.warn('[Recovery] Failed:', e); }
}

// Scan local sync_queue for pending delete entries and restore them.
// If a delete was enqueued but never drained to cloud (offline, app closed,
// error), the full item data is still sitting in the queue — we can recover
// it and cancel the delete.
async function recoverFromSyncQueue() {
  const restored = [];
  try {
    const queue = await dbGetAll('sync_queue');
    for (const q of queue) {
      if (q.action !== 'delete' || q.store !== 'workouts') continue;
      if (!q.data || !q.data.id) continue;
      // Make sure it's not already present locally
      const existing = await dbGet('workouts', q.data.id);
      if (!existing) {
        const clean = { ...q.data };
        delete clean._updated_at;
        await dbPut('workouts', clean);
        restored.push({ id: clean.id, session: clean.session, date: clean.date });
      }
      // Cancel the pending delete either way
      await dbDelete('sync_queue', q.id);
    }
  } catch (e) { console.warn('[Recovery] sync_queue scan failed:', e); }
  return restored;
}

// Force-pull every workout from Supabase and merge into local.
// Returns an array of summaries of anything that was new or different.
async function forceCloudPull() {
  const added = [];
  if (!window.supabaseClient && !window.initSupabase) return added;
  // Use the global set in supabase-sync.js
  const client = window.__supabaseClient || null;
  // Fallback: call syncAll after resetting the watermark
  try {
    await dbDelete('settings', 'lastSyncTimestamp');
  } catch {}
  if (typeof window.syncAll === 'function') {
    await window.syncAll();
  }
  // After sync, re-check local count
  const local = await dbGetAll('workouts');
  return local;
}

async function listCloudWorkouts() {
  // Directly query Supabase for all workouts for this user
  const client = window.__supabaseClient;
  if (!client) return { error: 'Supabase client not initialized' };
  const user = typeof window.getSupaUser === 'function' ? await window.getSupaUser() : null;
  if (!user) return { error: 'Not logged in' };
  const { data, error } = await client
    .from('workouts')
    .select('*')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });
  if (error) return { error: error.message };
  return { rows: data || [] };
}

async function migrateWorkoutDatesToLocal() {
  if (localStorage.getItem('tz_date_migration_v2')) return;
  try {
    let fixed = 0;
    const details = [];
    const minEpoch = new Date('2020-01-01').getTime();
    const maxEpoch = Date.now() + 86400000;
    const fixCollection = async (storeName) => {
      const items = await dbGetAll(storeName);
      for (const item of items) {
        if (!item.id || !item.date) continue;
        // uid() = Date.now().toString(36) + random. Date.now() is 8 base36 chars.
        const epochMs = parseInt(item.id.slice(0, 8), 36);
        if (!isFinite(epochMs) || epochMs < minEpoch || epochMs > maxEpoch) continue;
        if (Date.now() - epochMs > 90 * 86400000) continue;
        const localDate = dateStr(new Date(epochMs));
        if (localDate === item.date) continue;
        const stored = new Date(item.date + 'T00:00:00');
        const inferred = new Date(localDate + 'T00:00:00');
        const diffDays = Math.round((stored - inferred) / 86400000);
        // Only auto-fix the classic +1 day UTC drift
        if (diffDays === 1) {
          details.push(`${storeName} ${item.session || ''} ${item.date}→${localDate}`);
          item.date = localDate;
          await smartPut(storeName, item);
          fixed++;
        }
      }
    };
    await fixCollection('workouts');
    await fixCollection('runs');
    localStorage.setItem('tz_date_migration_v2', String(Date.now()));
    if (fixed > 0) {
      console.log(`[migration v2] Fixed ${fixed}:`, details);
      setTimeout(() => {
        if (typeof toast === 'function') toast(`Fixed ${fixed} workout date${fixed === 1 ? '' : 's'}`);
      }, 1800);
    } else {
      console.log('[migration v2] No records needed fixing');
    }
  } catch (e) {
    console.warn('[migration v2] tz date fix failed:', e);
  }
}

// ==================== UTILITIES ====================
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
// Local-date YYYY-MM-DD (NOT UTC — toISOString() drifts by tz and breaks streaks
// for users east/west of UTC. Julian is in UTC-3 so evening workouts were
// getting logged as the next day.)
function today() { return dateStr(new Date()); }

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
  // Local YYYY-MM-DD — must NOT use toISOString() (it converts to UTC and drops
  // evening workouts into the wrong day for any non-UTC user).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Plate breakdown: total weight per side — "bar + 25 /side"
function plateBreakdown(weight, unit) {
  const bar = unit === 'lb' ? 45 : 20;
  if (weight <= bar) return 'bar only';
  const perSide = (weight - bar) / 2;
  // Show clean number: drop ".0" but keep real decimals like 18.75
  const display = perSide % 1 === 0 ? perSide.toFixed(0) : perSide;
  return `bar + ${display} /side`;
}

// Epley formula: 1RM = weight × (1 + reps/30)
function estimate1RM(weight, reps) {
  if (!weight || !reps || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

// Get exercise name from ID
function getExerciseName(exId) {
  if (exerciseLibrary[exId]) return exerciseLibrary[exId].name;
  for (const s of Object.values(activePlan.sessions)) {
    const ex = s.exercises.find(e => e.id === exId);
    if (ex) return ex.name;
  }
  return exId;
}

// ==================== LOGIN SCREEN ====================
function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
}

function hideLoginScreen() {
  document.getElementById('login-screen').classList.add('hidden');
}

function bindLoginEvents() {
  const errEl = document.getElementById('login-error');

  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    if (!email || !pass) { errEl.textContent = 'Enter email and password'; return; }
    errEl.textContent = '';
    const { error } = await supaSignIn(email, pass);
    if (error) {
      errEl.textContent = error.message;
    } else {
      hideLoginScreen();
    }
  });

  // Toggle name field for registration
  let registerMode = false;
  document.getElementById('btn-register').addEventListener('click', async () => {
    const nameRow = document.getElementById('login-name-row');
    if (!registerMode) {
      // First click: show name field and switch to register mode
      registerMode = true;
      nameRow.style.display = 'flex';
      document.getElementById('btn-register').textContent = 'Create Account';
      document.getElementById('btn-login').textContent = 'Back to Sign In';
      return;
    }
    const name = document.getElementById('login-name').value.trim();
    const email = document.getElementById('login-email').value.trim();
    const pass = document.getElementById('login-password').value;
    if (!name) { errEl.textContent = 'Enter your name'; return; }
    if (!email || pass.length < 6) { errEl.textContent = 'Email + password (min 6 chars)'; return; }
    errEl.textContent = '';
    // Save name to settings after signup
    state.settings.userName = name;
    await dbPut('settings', { key: 'userSettings', data: state.settings });
    const { error } = await supaSignUp(email, pass);
    if (error) {
      errEl.textContent = error.message;
    } else {
      errEl.style.color = 'var(--accent)';
      errEl.textContent = 'Check your email to confirm, then sign in.';
      registerMode = false;
      nameRow.style.display = 'none';
      document.getElementById('btn-register').textContent = 'Create Account';
      document.getElementById('btn-login').textContent = 'Sign In';
    }
  });

  // Allow Enter key to submit
  document.getElementById('login-password').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
}

async function checkAuth() {
  if (!supabaseClient) {
    hideLoginScreen();
    return;
  }
  const user = await getUser();
  if (user) {
    // If no userName saved, derive from email
    if (!state.settings.userName && user.email) {
      state.settings.userName = user.email.split('@')[0];
      await dbPut('settings', { key: 'userSettings', data: state.settings });
    }
    hideLoginScreen();
    showWelcomeScreen();
  } else {
    showLoginScreen();
  }
}

// ==================== WELCOME SCREEN ====================
async function showWelcomeScreen() {
  const name = state.settings.userName || 'there';
  const jsDay = new Date().getDay();
  const plan = activeWeekTemplate[jsDay];
  const wk = getWeekNumber();

  let todayText = '';
  let headsUpHTML = '';
  if (plan.type === 'gym') {
    const session = activePlan.sessions[plan.session];
    const deload = isDeloadWeek(wk);
    const numEx = session.exercises ? session.exercises.length : 0;
    const estMin = Math.max(35, numEx * 9);
    todayText = `Let's train`;
    headsUpHTML = `
      <div class="wh-title">Today</div>
      <div class="wh-session">${session.icon || ''} ${session.name}${deload ? ' · Deload' : ''}</div>
      <div class="wh-meta">${numEx} exercises · ~${estMin} min · ${session.subtitle}</div>
    `;
  } else if (plan.type === 'run') {
    const runsAllowed = getRunsThisWeek(wk);
    if ((jsDay === 3 && runsAllowed < 2) || (jsDay === 0 && runsAllowed < 3)) {
      todayText = 'Rest day — recover well.';
    } else {
      todayText = `Let's run`;
      headsUpHTML = `
        <div class="wh-title">Today</div>
        <div class="wh-session">🏃 Zone 2 Run</div>
        <div class="wh-meta">Conversational pace · easy effort</div>
      `;
    }
  } else {
    todayText = 'Rest day — recover well.';
    if (jsDay === 0 && getRunsThisWeek(wk) >= 3) {
      todayText = 'Optional run today — or rest.';
    }
  }

  document.getElementById('welcome-greeting').textContent = `Hola, ${name}`;
  document.getElementById('welcome-today').textContent = todayText;

  const headsUp = document.getElementById('welcome-headsup');
  if (headsUpHTML) {
    headsUp.innerHTML = headsUpHTML;
    headsUp.classList.remove('hidden');
  } else {
    headsUp.classList.add('hidden');
  }

  // Streak line — only if streak >= 2
  try {
    const workouts = await dbGetAll('workouts');
    const runs = await dbGetAll('runs');
    const trainingDates = new Set();
    workouts.forEach(w => trainingDates.add(w.date));
    runs.forEach(r => trainingDates.add(r.date));
    let streak = 0;
    const d = new Date();
    for (let i = 0; i < 365; i++) {
      const ds = dateStr(d);
      if (trainingDates.has(ds)) streak++;
      else if (i !== 0) break;
      d.setDate(d.getDate() - 1);
    }
    const streakEl = document.getElementById('welcome-streak');
    if (streak >= 2) {
      const fire = streak >= 7 ? '🔥🔥🔥' : streak >= 4 ? '🔥🔥' : '🔥';
      streakEl.innerHTML = `<span class="welcome-streak-icon">${fire}</span><span class="welcome-streak-text"><strong>${streak}-day streak</strong> — keep it going</span>`;
      streakEl.classList.remove('hidden');
    } else {
      streakEl.classList.add('hidden');
    }
  } catch (e) { /* noop */ }

  document.getElementById('welcome-screen').classList.remove('hidden');

  document.getElementById('btn-welcome-go').addEventListener('click', () => {
    document.getElementById('welcome-screen').classList.add('hidden');
  }, { once: true });

  // Auto-dismiss after 6 seconds
  setTimeout(() => {
    document.getElementById('welcome-screen').classList.add('hidden');
  }, 6000);
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
    // Use activeSession (not currentView) — currentView gets overwritten by other tabs
    const inWorkout = !!state.activeSession;
    showView(inWorkout ? 'workout' : 'gym');
    if (!inWorkout) { renderWeekStrip(); renderRecentWorkouts(); renderStreakBanner(); }
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
  title.classList.remove('ctx');
  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);
  // Day number since program start (used as lightweight phase marker)
  const startDate = state.settings.programStart ? new Date(state.settings.programStart) : null;
  let dayNum = null;
  if (startDate) {
    dayNum = Math.max(1, Math.floor((Date.now() - startDate.getTime()) / 86400000) + 1);
  }
  if (tab === 'gym') {
    // When actively in a workout, title was set by startWorkout — leave it.
    if (state.currentView === 'workout' && state.activeSession) return;
    title.textContent = 'Training';
    sub.textContent = deload ? `Week ${wk} · Deload` : (dayNum ? `Day ${dayNum} · Cut` : `Week ${wk} · Cut`);
  } else if (tab === 'run') {
    title.textContent = 'Running';
    sub.textContent = `Week ${wk} · Zone 2`;
  } else if (tab === 'nutrition') {
    title.textContent = 'Nutrition';
    sub.textContent = `Target: ${state.settings.proteinTarget}g protein`;
  } else if (tab === 'stats') {
    title.textContent = dayNum ? `Day ${dayNum}` : 'Stats';
    title.classList.add('ctx');
    sub.textContent = deload ? `Week ${wk} · Deload` : `Week ${wk} · Cut Phase`;
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

// Get custom week schedule (overrides per date)
async function getWeekSchedule() {
  const saved = await dbGet('settings', 'weekSchedule');
  return (saved && saved.data) || {};
}

async function saveWeekSchedule(schedule) {
  await smartPut('settings', { key: 'weekSchedule', data: schedule });
}

// Get the planned gym session for a specific date
function getPlannedSession(jsDay, customSchedule, ds) {
  // Custom override for this specific date
  if (customSchedule[ds] !== undefined) return customSchedule[ds]; // null = empty, string = sessionId
  const plan = activeWeekTemplate[jsDay];
  return plan.type === 'gym' ? plan.session : null;
}

async function renderWeekStrip() {
  renderWeekBanner();
  const container = document.getElementById('week-strip');
  const weekDates = getWeekDates();
  const todayStr = today();
  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const wk = getWeekNumber();
  const deload = isDeloadWeek(wk);
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const customSchedule = await getWeekSchedule();

  // Build two-row layout
  container.innerHTML = `
    <div class="ws-label">Strength</div>
    <div class="ws-row" id="ws-gym-row"></div>
    <div class="ws-label">Running</div>
    <div class="ws-row" id="ws-run-row"></div>
  `;

  const gymRow = document.getElementById('ws-gym-row');
  const runRow = document.getElementById('ws-run-row');

  weekDates.forEach((date, i) => {
    const ds = dateStr(date);
    const jsDay = date.getDay();
    const isToday = ds === todayStr;
    const dayWorkout = workouts.find(w => w.date === ds);
    const dayRun = runs.find(r => r.date === ds);
    const isPast = ds < todayStr;
    // Don't show "planned" on past days that the user didn't train — those
    // should read as empty/rest, not as "you were supposed to do X".
    const plannedSession = isPast ? null : getPlannedSession(jsDay, customSchedule, ds);

    // --- GYM CELL ---
    const gymCell = document.createElement('div');
    gymCell.className = `ws-cell${isToday ? ' today' : ''}`;

    let gymLabel = '', gymDone = false;
    if (dayWorkout) {
      const s = activePlan.sessions[dayWorkout.session];
      gymLabel = s ? s.name.replace(/Upper |Lower /, '').charAt(0) + s.name.slice(-1) : '✓';
      gymDone = true;
      gymCell.classList.add('done');
    } else if (plannedSession) {
      const s = activePlan.sessions[plannedSession];
      gymLabel = s ? s.name.replace('Upper ', 'U').replace('Lower ', 'L') : '?';
    } else {
      gymLabel = isPast ? 'rest' : '—';
      gymCell.classList.add('empty');
    }

    // Determine icon for the cell
    let cellIcon = '';
    if (gymDone && dayWorkout && activePlan.sessions[dayWorkout.session]) {
      cellIcon = activePlan.sessions[dayWorkout.session].icon;
    } else if (!gymDone && plannedSession && activePlan.sessions[plannedSession]) {
      cellIcon = activePlan.sessions[plannedSession].icon;
    }

    gymCell.innerHTML = `
      <div class="ws-day">${dayNames[i]}</div>
      ${cellIcon ? `<div class="ws-icon">${cellIcon}</div>` : ''}
      <div class="ws-session${gymDone ? ' ws-done' : ''}">${gymDone ? '✓' : gymLabel}</div>
      <div class="ws-sub">${gymDone && dayWorkout ? (activePlan.sessions[dayWorkout.session]?.name.replace('Upper ', 'U').replace('Lower ', 'L') || '') : ''}</div>
    `;

    // Click handler
    if (gymDone && dayWorkout) {
      gymCell.addEventListener('click', () => viewCompletedWorkout(dayWorkout));
    } else if (plannedSession) {
      gymCell.addEventListener('click', () => showSessionPicker(plannedSession));
    } else {
      gymCell.addEventListener('click', () => showSessionPicker(Object.keys(activePlan.sessions)[0], ds));
    }

    // Long-press to change/clear assignment
    let pressTimer;
    gymCell.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => {
        e.preventDefault();
        changeGymDay(ds, jsDay, customSchedule);
      }, 600);
    }, { passive: false });
    gymCell.addEventListener('touchend', () => clearTimeout(pressTimer));
    gymCell.addEventListener('touchmove', () => clearTimeout(pressTimer));

    gymRow.appendChild(gymCell);

    // --- RUN CELL ---
    const runCell = document.createElement('div');
    runCell.className = `ws-cell ws-run-cell${isToday ? ' today' : ''}`;

    const runKey = 'run_' + ds;
    const customRun = customSchedule[runKey];
    const defaultRun = activeWeekTemplate[jsDay].type === 'run';
    const planRun = customRun !== undefined ? customRun === true : defaultRun;

    if (dayRun) {
      runCell.classList.add('done');
      runCell.innerHTML = `<div class="ws-day">${dayNames[i]}</div><div class="ws-run-dot done">✓</div>`;
      runCell.addEventListener('click', () => { switchTab('run'); });
    } else {
      runCell.innerHTML = `<div class="ws-day">${dayNames[i]}</div><div class="ws-run-dot${planRun ? ' planned' : ''}"></div>`;
      runCell.addEventListener('click', () => { switchTab('run'); });
    }

    // Long-press to toggle run day
    let runPressTimer;
    runCell.addEventListener('touchstart', (e) => {
      runPressTimer = setTimeout(async () => {
        e.preventDefault();
        const dayLabel = new Date(ds + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
        const choice = await showActionSheet(dayLabel + ' — Running', [
          { value: 'run', label: 'Zone 2 Run', icon: '🏃', selected: planRun },
          { value: 'rest', label: 'No run', icon: '😴', selected: !planRun },
        ]);
        if (choice === null) return;
        customSchedule[runKey] = choice === 'run';
        await saveWeekSchedule(customSchedule);
        renderWeekStrip();
        toast(choice === 'run' ? 'Run day set' : 'Run day cleared');
      }, 600);
    }, { passive: false });
    runCell.addEventListener('touchend', () => clearTimeout(runPressTimer));
    runCell.addEventListener('touchmove', () => clearTimeout(runPressTimer));

    runRow.appendChild(runCell);
  });
}

// Generic action sheet — returns a Promise that resolves with the chosen value or null
function showActionSheet(title, options) {
  return new Promise(resolve => {
    const sheet = document.getElementById('action-sheet');
    const titleEl = document.getElementById('action-sheet-title');
    const optionsEl = document.getElementById('action-sheet-options');
    const cancelBtn = document.getElementById('action-sheet-cancel');
    const backdrop = sheet.querySelector('.action-sheet-backdrop');

    titleEl.textContent = title;
    optionsEl.innerHTML = options.map(o => `
      <button class="action-sheet-btn${o.selected ? ' selected' : ''}" data-value="${o.value}">
        ${o.icon ? `<span class="as-icon">${o.icon}</span>` : ''}
        <span class="as-label">${o.label}</span>
        ${o.selected ? '<span class="as-check">✓</span>' : ''}
      </button>
    `).join('');

    sheet.classList.remove('hidden');

    function close(val) {
      sheet.classList.add('hidden');
      cancelBtn.removeEventListener('click', onCancel);
      backdrop.removeEventListener('click', onCancel);
      resolve(val);
    }
    function onCancel() { close(null); }

    cancelBtn.addEventListener('click', onCancel);
    backdrop.addEventListener('click', onCancel);
    optionsEl.querySelectorAll('.action-sheet-btn').forEach(btn => {
      btn.addEventListener('click', () => close(btn.dataset.value));
    });
  });
}

async function changeGymDay(ds, jsDay, customSchedule) {
  const sessions = Object.entries(activePlan.sessions);
  const current = customSchedule[ds] !== undefined ? customSchedule[ds] : (activeWeekTemplate[jsDay].type === 'gym' ? activeWeekTemplate[jsDay].session : null);
  const dayLabel = new Date(ds + 'T12:00:00').toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });

  const options = [
    { value: 'empty', label: 'Rest day', icon: '😴', selected: current === null },
    ...sessions.map(([id, s]) => ({ value: id, label: s.name + ' — ' + s.subtitle, icon: s.icon, selected: current === id }))
  ];

  const choice = await showActionSheet(dayLabel, options);
  if (choice === null) return; // cancelled

  const newVal = choice === 'empty' ? null : choice;
  if (newVal === current) return; // no change

  customSchedule[ds] = newVal;
  await saveWeekSchedule(customSchedule);
  renderWeekStrip();
  toast(newVal ? `Set to ${activePlan.sessions[newVal].name}` : 'Set to rest day');
}

function showSkeleton(container, count = 3) {
  container.innerHTML = Array(count).fill('<div class="skeleton skeleton-card"></div>').join('');
  container.classList.remove('morph-in');
}

function showEmptyState(container, icon, title, text) {
  container.innerHTML = `<div class="empty-state-box"><div class="empty-state-icon">${icon}</div><div class="empty-state-title">${title}</div><div class="empty-state-text">${text}</div></div>`;
  morphIn(container);
}

function morphIn(container) {
  container.classList.remove('morph-in');
  void container.offsetWidth; // force reflow
  container.classList.add('morph-in');
}

async function renderRecentWorkouts() {
  const container = document.getElementById('recent-workouts');
  showSkeleton(container, 3);
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  if (!workouts.length) {
    showEmptyState(container, '🏋️', 'No workouts yet', 'Tap a day in the schedule above to start your first session.');
    return;
  }

  container.innerHTML = workouts.map(w => {
    const session = activePlan.sessions[w.session];
    const totalSets = w.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
    return `
      <div class="history-item" data-edit-workout="${w.id}">
        <div class="hi-left">
          <div class="hi-title">${session ? session.name : w.session}</div>
          <div class="hi-sub">${formatDate(w.date)} · ${totalSets} sets · ${w.duration || ''}</div>
        </div>
        <div class="hi-right" style="display:flex;align-items:center">
          <div>
            <div class="hi-stat">${w.quality || '-'}/5</div>
            <div class="hi-stat-sub">quality</div>
          </div>
          <span class="hi-chev" aria-hidden="true">›</span>
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-edit-workout]').forEach(item => {
    item.addEventListener('click', () => openEditWorkout(item.dataset.editWorkout));
  });
  morphIn(container);
}

// ==================== EDIT WORKOUT MODAL ====================
let _editWorkoutId = null;

async function openEditWorkout(id) {
  const w = await dbGet('workouts', id);
  if (!w) { toast('Workout not found'); return; }
  _editWorkoutId = id;

  const session = activePlan.sessions[w.session];
  const sessionName = session ? session.name : (w.sessionName || w.session);
  document.getElementById('ew-title').textContent = sessionName;
  document.getElementById('ew-date').value = w.date || '';
  document.getElementById('ew-quality').value = w.quality || '';
  document.getElementById('ew-notes').value = w.notes || '';

  const appUnit = state.settings.unit || 'kg';
  const unit = w.inputUnit || appUnit;
  const titleEl = document.getElementById('ew-title');
  if (w.inputUnit && w.inputUnit !== appUnit) {
    titleEl.innerHTML = `${sessionName} <span style="font-size:11px;color:var(--accent);font-weight:600">· input: ${unit.toUpperCase()}</span>`;
  }

  // Load previous workouts for this session (for ghost sets / 1RM)
  const allSessionWorkouts = (await dbGetAll('workouts'))
    .filter(wk => wk.session === w.session && wk.id !== w.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const previous = allSessionWorkouts[0] || null;

  const exHost = document.getElementById('ew-exercises');
  exHost.innerHTML = w.exercises.map((ex, exi) => {
    const exName = getExerciseName(ex.exerciseId);
    const muscle = getExerciseMuscle(ex.exerciseId);
    const muscleColor = MUSCLE_COLORS[muscle] || '#666';

    // Find plan exercise definition for target info + notes
    const planEx = session ? session.exercises.find(e => e.id === ex.exerciseId) : null;
    const targetHTML = planEx
      ? `<div class="exercise-target">${planEx.sets} × ${planEx.reps} @ RPE ${planEx.rpe} · Rest ${Math.floor((planEx.defaultRest || 120) / 60)}:${((planEx.defaultRest || 120) % 60).toString().padStart(2, '0')}</div>`
      : '';
    const notesHTML = planEx && planEx.notes
      ? `<div class="exercise-notes" style="margin-top:6px">${planEx.notes}</div>`
      : '';

    // Previous workout ghost data
    const prevEx = previous ? previous.exercises.find(e => e.exerciseId === ex.exerciseId) : null;
    const prevDoneSets = prevEx ? prevEx.sets.filter(s => s.done && (s.weight > 0 || (planEx && planEx.bw))) : [];
    const prevSummary = prevDoneSets.length > 0
      ? prevDoneSets.map(s => `${planEx && planEx.bw ? '+' : ''}${s.weight}×${s.reps}`).join('  ')
      : '';
    const prevHeaderHTML = prevSummary ? `<div class="prev-header">Last: ${prevSummary}</div>` : '';

    // Est 1RM from all history
    let best1RM = 0;
    allSessionWorkouts.concat([w]).forEach(wk => {
      const wex = wk.exercises.find(e => e.exerciseId === ex.exerciseId);
      if (wex) wex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0).forEach(s => {
        const e1rm = estimate1RM(s.weight, s.reps);
        if (e1rm > best1RM) best1RM = e1rm;
      });
    });
    const e1rmHTML = best1RM > 0 ? `<div class="exercise-1rm">Est. 1RM: ${best1RM} ${appUnit}</div>` : '';

    const rows = ex.sets.map((s, i) => {
      const ghostSet = prevEx && prevEx.sets[i];
      const ghostHTML = ghostSet && ghostSet.done
        ? `<div class="ghost-set ew-ghost"><span>${planEx && planEx.bw ? '+' : ''}${ghostSet.weight}</span><span>${ghostSet.reps}</span><span>${ghostSet.rpe || ''}</span></div>`
        : '';
      return `
        ${ghostHTML}
        <div class="ew-set" data-ex="${exi}" data-set="${i}">
          <div class="ew-num">${i + 1}</div>
          <input type="number" inputmode="decimal" step="0.5" data-f="weight" value="${s.weight || ''}" placeholder="${unit}">
          <input type="number" inputmode="numeric" data-f="reps" value="${s.reps || ''}" placeholder="reps">
          <select data-f="rpe" class="ew-rpe-select" style="${s.rpe ? 'color:' + rpeColor(s.rpe) : ''}">
            <option value="">RPE</option>
            ${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(v => `<option value="${v}"${s.rpe == v ? ' selected' : ''}>${v}</option>`).join('')}
          </select>
          <button class="ew-done ${s.done ? 'checked' : ''}" data-f="done" type="button">✓</button>
        </div>
      `;
    }).join('');

    const supersetTag = planEx && planEx.superset
      ? `<span class="ew-superset-tag">SS ${planEx.superset}</span>` : '';

    return `
      <div class="ew-ex">
        <div class="exercise-name-row" style="margin-bottom:4px">
          <span class="exercise-name" style="font-size:14px;font-weight:700">${exName}</span>
          ${muscle ? `<span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${muscle}</span>` : ''}
          ${supersetTag}
        </div>
        ${targetHTML}
        ${prevHeaderHTML}
        ${e1rmHTML}
        <div class="ew-set-head"><span></span><span>${planEx && planEx.bw ? '+' + unit : unit}</span><span>Reps</span><span>RPE</span><span>Done</span></div>
        ${rows}
        ${notesHTML}
      </div>
    `;
  }).join('');

  // Toggle done buttons
  exHost.querySelectorAll('.ew-done').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('checked'));
  });

  // RPE color on change
  exHost.querySelectorAll('.ew-rpe-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const val = parseFloat(sel.value);
      sel.style.color = val ? rpeColor(val) : '';
    });
  });

  document.getElementById('edit-workout-modal').classList.remove('hidden');
}

function closeEditWorkout() {
  document.getElementById('edit-workout-modal').classList.add('hidden');
  _editWorkoutId = null;
}

async function saveEditWorkout() {
  if (!_editWorkoutId) return;
  const w = await dbGet('workouts', _editWorkoutId);
  if (!w) { toast('Workout not found'); return; }

  const newDate = document.getElementById('ew-date').value;
  const newQuality = parseInt(document.getElementById('ew-quality').value, 10);
  const newNotes = document.getElementById('ew-notes').value.trim();

  if (newDate) w.date = newDate;
  if (!isNaN(newQuality)) w.quality = Math.max(1, Math.min(5, newQuality));
  w.notes = newNotes;

  const appUnit = state.settings.unit || 'kg';
  // If the workout was drafted in a different input unit, convert on save so
  // internal values stay in the app's canonical unit.
  const inputUnit = w.inputUnit || appUnit;
  const convert = (v) => {
    if (inputUnit === appUnit) return v;
    if (inputUnit === 'lb' && appUnit === 'kg') return +(v * 0.453592).toFixed(2);
    if (inputUnit === 'kg' && appUnit === 'lb') return +(v * 2.20462).toFixed(2);
    return v;
  };
  document.querySelectorAll('#ew-exercises .ew-set').forEach(row => {
    const exi = parseInt(row.dataset.ex, 10);
    const si = parseInt(row.dataset.set, 10);
    const s = w.exercises[exi] && w.exercises[exi].sets[si];
    if (!s) return;
    const rawWeight = parseFloat(row.querySelector('[data-f="weight"]').value) || 0;
    s.weight = convert(rawWeight);
    s.reps = parseInt(row.querySelector('[data-f="reps"]').value, 10) || 0;
    const rpeEl = row.querySelector('[data-f="rpe"]');
    const rpeVal = parseFloat(rpeEl.value);
    s.rpe = isNaN(rpeVal) ? null : rpeVal;
    s.done = row.querySelector('[data-f="done"]').classList.contains('checked');
  });
  // Record the unit weights are stored in (after conversion).
  w.unit = appUnit;
  // One-time conversion only: strip inputUnit after saving so future edits
  // use the app's canonical unit directly.
  delete w.inputUnit;

  await smartPut('workouts', w);
  closeEditWorkout();
  toast('Workout updated');
  renderRecentWorkouts();
  if (state.currentView === 'stats') renderStats();
  renderWeekStrip();
  renderStreakBanner();
}

async function deleteEditWorkout() {
  if (!_editWorkoutId) return;
  const confirmed = confirm('Delete this workout? It will be kept in Trash for 2 days so you can restore it.');
  if (!confirmed) return;
  const wId = _editWorkoutId;
  const w = await dbGet('workouts', wId);
  closeEditWorkout();
  if (!w) return;
  await moveToTrash('workouts', w);
  await smartDelete('workouts', wId);
  renderRecentWorkouts();
  renderWeekStrip();
  renderStreakBanner();
  toast('Moved to Trash (2 days)', {
    label: 'Undo',
    callback: async () => {
      await restoreFromTrash(w.id);
      renderRecentWorkouts();
      renderWeekStrip();
      renderStreakBanner();
      toast('Workout restored');
    }
  });
}

// ==================== TRASH (soft delete) ====================
const TRASH_TTL_MS = 2 * 24 * 60 * 60 * 1000;

async function moveToTrash(store, item) {
  const clone = { ...item };
  delete clone._updated_at;
  const entry = {
    trashId: `${store}:${item.id}`,
    store,
    originalId: item.id,
    data: clone,
    deletedAt: Date.now(),
  };
  await dbPut('trash', entry);
}

async function restoreFromTrash(originalId) {
  const all = await dbGetAll('trash');
  const entry = all.find(t => t.originalId === originalId);
  if (!entry) return false;
  await smartPut(entry.store, entry.data);
  await dbDelete('trash', entry.trashId);
  return true;
}

async function purgeExpiredTrash() {
  try {
    const all = await dbGetAll('trash');
    const now = Date.now();
    for (const t of all) {
      if (now - t.deletedAt > TRASH_TTL_MS) {
        await dbDelete('trash', t.trashId);
      }
    }
  } catch (e) { console.warn('[Trash] Purge failed:', e); }
}

async function renderTrashList() {
  const host = document.getElementById('trash-list');
  if (!host) return;
  const all = (await dbGetAll('trash')).sort((a, b) => b.deletedAt - a.deletedAt);
  if (!all.length) {
    host.innerHTML = '<p class="muted" style="font-size:12px">Trash is empty.</p>';
    return;
  }
  const now = Date.now();
  host.innerHTML = all.map(t => {
    const remainingMs = TRASH_TTL_MS - (now - t.deletedAt);
    const hoursLeft = Math.max(0, Math.floor(remainingMs / (60 * 60 * 1000)));
    const d = t.data || {};
    const session = activePlan.sessions[d.session];
    const name = session ? session.name : (d.session || t.store);
    return `
      <div class="trash-item">
        <div class="ti-left">
          <div class="ti-title">${name}</div>
          <div class="ti-sub">${d.date || ''} · expires in ${hoursLeft}h</div>
        </div>
        <button class="btn-secondary" data-restore="${t.originalId}" style="padding:6px 10px;font-size:12px">Restore</button>
      </div>
    `;
  }).join('');
  host.querySelectorAll('[data-restore]').forEach(btn => {
    btn.addEventListener('click', async () => {
      await restoreFromTrash(btn.dataset.restore);
      renderTrashList();
      renderRecentWorkouts();
      renderWeekStrip();
      renderStreakBanner();
      toast('Restored');
    });
  });
}

// ==================== LOG PAST WORKOUT ====================
async function logPastWorkout() {
  const sessions = Object.values(activePlan.sessions);

  // Step 1: Pick session via action sheet buttons
  const sessionOptions = sessions.map(s => ({
    value: s.id, label: s.name + ' — ' + s.subtitle, icon: s.icon
  }));
  const sessionId = await showActionSheet('Which session?', sessionOptions);
  if (!sessionId) return;
  const session = activePlan.sessions[sessionId];
  if (!session) return;

  // Step 2: Pick unit via action sheet buttons
  const appUnit = state.settings.unit || 'kg';
  const unitOptions = [
    { value: 'kg', label: 'Kilograms (kg)', icon: '🏋️', selected: appUnit === 'kg' },
    { value: 'lb', label: 'Pounds (lb)', icon: '🏋️', selected: appUnit === 'lb' },
  ];
  const inputUnit = await showActionSheet('Enter weights in', unitOptions);
  if (!inputUnit) return;

  const workout = {
    id: uid(),
    date: today(),
    session: session.id,
    sessionName: session.name,
    planVersion: activePlan.version || 1,
    week: getWeekNumber(),
    startTime: '00:00',
    duration: '',
    exercises: session.exercises.map(ex => ({
      exerciseId: ex.id,
      sets: Array.from({ length: ex.sets }, () => ({ weight: 0, reps: 0, rpe: null, done: false })),
    })),
    quality: null,
    notes: '',
    inputUnit,
  };
  await smartPut('workouts', workout);
  renderRecentWorkouts();
  toast('Draft created — edit the details');
  openEditWorkout(workout.id);
}

// ==================== STREAK COUNTER ====================
// ==================== ACTIVITY RINGS (Apple Watch style) ====================
async function renderActivityRings() {
  const container = document.getElementById('activity-rings');
  if (!container) return;

  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const nutrition = await dbGetAll('nutrition');
  const todayStr = today();
  const weekDates = getWeekDates().map(d => dateStr(d));

  // Ring 1: Training sessions this week (target: planned gym days)
  const planned = Object.values(activeWeekTemplate).filter(d => d.type === 'gym').length;
  const sessionsThisWeek = workouts.filter(w => weekDates.includes(w.date)).length;
  const sessionPct = Math.min(sessionsThisWeek / planned, 1);

  // Ring 2: Protein — days this week where goal was met
  const proteinTarget = state.settings.proteinTarget || 170;
  const daysWithData = weekDates.filter(d => d <= todayStr);
  const proteinDaysMet = daysWithData.filter(d => {
    const dayNut = nutrition.filter(n => n.date === d);
    const total = dayNut.reduce((s, n) => s + (n.protein || 0), 0);
    return total >= proteinTarget;
  }).length;
  const proteinPct = daysWithData.length > 0 ? Math.min(proteinDaysMet / daysWithData.length, 1) : 0;

  // Ring 3: Running this week (target: planned run days)
  const plannedRuns = Object.values(activeWeekTemplate).filter(d => d.type === 'run').length;
  const runsThisWeek = runs.filter(r => weekDates.includes(r.date)).length;
  const runPct = plannedRuns > 0 ? Math.min(runsThisWeek / plannedRuns, 1) : 0;

  function ringArc(cx, cy, r, pct, color, width) {
    const circ = 2 * Math.PI * r;
    const offset = circ - circ * pct;
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" style="transition:stroke-dashoffset 0.8s ease-out"/>`;
  }

  const cx = 60, cy = 60;
  container.innerHTML = `
    <div class="activity-rings-card">
      <svg width="120" height="120" viewBox="0 0 120 120" style="transform:rotate(-90deg)">
        <circle cx="${cx}" cy="${cy}" r="48" fill="none" stroke="rgba(251,146,60,0.15)" stroke-width="9"/>
        ${ringArc(cx, cy, 48, sessionPct, 'var(--orange)', 9)}
        <circle cx="${cx}" cy="${cy}" r="36" fill="none" stroke="rgba(74,222,128,0.15)" stroke-width="9"/>
        ${ringArc(cx, cy, 36, proteinPct, 'var(--accent)', 9)}
        <circle cx="${cx}" cy="${cy}" r="24" fill="none" stroke="rgba(96,165,250,0.15)" stroke-width="9"/>
        ${ringArc(cx, cy, 24, runPct, 'var(--blue)', 9)}
      </svg>
      <div class="activity-rings-legend">
        <div class="arl-row"><span class="arl-dot" style="background:var(--orange)"></span><span class="arl-label">Training</span><span class="arl-val">${sessionsThisWeek}/${planned}</span></div>
        <div class="arl-row"><span class="arl-dot" style="background:var(--accent)"></span><span class="arl-label">Protein</span><span class="arl-val">${proteinDaysMet}/${daysWithData.length} days</span></div>
        <div class="arl-row"><span class="arl-dot" style="background:var(--blue)"></span><span class="arl-label">Running</span><span class="arl-val">${runsThisWeek}/${plannedRuns}</span></div>
      </div>
    </div>
  `;
}

async function renderStreakBanner() {
  const container = document.getElementById('streak-banner');
  if (!container) return;
  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');

  // Get all unique training dates
  const trainingDates = new Set();
  workouts.forEach(w => trainingDates.add(w.date));
  runs.forEach(r => trainingDates.add(r.date));

  if (trainingDates.size === 0) { container.innerHTML = ''; return; }

  // Calculate current streak (consecutive days with training, ending today or yesterday)
  let streak = 0;
  const d = new Date();
  // Start from today and go backwards
  for (let i = 0; i < 365; i++) {
    const ds = dateStr(d);
    if (trainingDates.has(ds)) {
      streak++;
    } else if (i === 0) {
      // Today has no training yet — that's ok, check from yesterday
    } else {
      break;
    }
    d.setDate(d.getDate() - 1);
  }

  // Also count total this week
  const weekDates = getWeekDates();
  const thisWeek = weekDates.filter(wd => trainingDates.has(dateStr(wd))).length;

  if (streak <= 1 && thisWeek <= 1) { container.innerHTML = ''; return; }

  const fireLevel = streak >= 7 ? '🔥🔥🔥' : streak >= 4 ? '🔥🔥' : streak >= 2 ? '🔥' : '';

  container.innerHTML = `
    <div class="streak-fire">
      <div class="streak-fire-icon">${fireLevel || '💪'}</div>
      <div class="streak-fire-info">
        <div class="streak-fire-count">${streak} day${streak !== 1 ? 's' : ''} streak</div>
        <div class="streak-fire-label">${thisWeek} session${thisWeek !== 1 ? 's' : ''} this week</div>
      </div>
    </div>
  `;
}

// ==================== SESSION PROGRESS ====================
function updateSessionProgress() {
  const allChecks = document.querySelectorAll('#workout-exercises .set-check');
  const allChecked = document.querySelectorAll('#workout-exercises .set-check.checked');
  const total = allChecks.length;
  const done = allChecked.length;
  const pct = total > 0 ? (done / total) * 100 : 0;

  // Update bar
  document.getElementById('sp-fill').style.width = pct + '%';
  document.getElementById('sp-text').textContent = `${done} / ${total} sets`;

  // Update progress ring if present
  const ring = document.getElementById('sp-ring-fill');
  if (ring) {
    const circumference = 2 * Math.PI * 38; // r=38
    ring.style.strokeDashoffset = circumference - (circumference * pct / 100);
  }
  const ringText = document.getElementById('sp-ring-pct');
  if (ringText) animateNumber(ringText, Math.round(pct), '%');
}

// ==================== SESSION PICKER (day swap) ====================
async function showSessionPicker(defaultSession, dateOverride) {
  const sessions = Object.entries(activePlan.sessions);
  const options = sessions.map(([id, s]) => ({
    value: id, label: s.name + ' — ' + s.subtitle, icon: s.icon, selected: id === defaultSession
  }));

  const choice = await showActionSheet('Start workout', options);
  if (choice === null) return;

  // Persist the day swap in weekSchedule so the strip updates
  if (choice !== defaultSession) {
    const ds = dateOverride || today();
    const customSchedule = await getWeekSchedule();
    customSchedule[ds] = choice;
    await saveWeekSchedule(customSchedule);
  }

  startWorkout(choice);
}

// ==================== VIEW COMPLETED WORKOUT (read-only) ====================
function viewCompletedWorkout(workout) {
  state.viewingCompleted = true;
  const session = activePlan.sessions[workout.session];
  const sessionName = session ? session.name : workout.session;

  document.getElementById('workout-timer').textContent = workout.duration || '--:--';
  document.getElementById('sp-fill').style.width = '100%';
  document.getElementById('sp-text').textContent = 'Completed';

  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';

  const unit = state.settings.unit;
  for (const ex of workout.exercises) {
    const exName = getExerciseName(ex.exerciseId);
    const muscle = getExerciseMuscle(ex.exerciseId);
    const muscleColor = MUSCLE_COLORS[muscle] || '#666';

    const setsHTML = ex.sets.map((s, i) => `
      <div class="set-row" style="opacity:${s.done ? 1 : 0.4}${s.rpe ? ';border-left:3px solid ' + rpeColor(s.rpe) : ''}">
        <div class="set-num">${i + 1}</div>
        <div class="set-input" style="text-align:center;font-weight:700">${s.weight || '-'}</div>
        <div class="set-input" style="text-align:center">${s.reps || '-'}</div>
        <div class="set-input" style="text-align:center;font-size:12px;${s.rpe ? 'color:' + rpeColor(s.rpe) : ''}">${s.rpe || ''}</div>
        <div class="set-check ${s.done ? 'checked' : ''}" style="pointer-events:none">✓</div>
      </div>
    `).join('');

    const card = document.createElement('div');
    card.className = 'exercise-card expanded';
    card.dataset.exerciseId = ex.exerciseId;
    card.innerHTML = `
      <div class="exercise-header" style="cursor:default">
        <div class="exercise-info">
          <div class="exercise-name-row">
            <span class="exercise-name tappable" data-ex-id="${ex.exerciseId}">${exName} <span class="tap-hint">history</span></span>
            <span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${muscle || ''}</span>
          </div>
          <div class="exercise-target" style="color:var(--accent)">Completed · ${workout.date}</div>
        </div>
      </div>
      <div class="exercise-body" style="display:block">
        <div class="exercise-body-inner">
          <div class="set-table">
            <div class="set-table-header">
              <div>Set</div><div>${unit}</div><div>Reps</div><div>RPE</div><div></div>
            </div>
            ${setsHTML}
          </div>
        </div>
      </div>
    `;
    container.appendChild(card);
  }

  // Wire exercise name taps for history
  container.querySelectorAll('.exercise-name.tappable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openExerciseHistory(el.dataset.exId);
    });
  });

  // Hide finish button, show back only
  document.getElementById('btn-finish-workout').style.display = 'none';
  document.getElementById('workout-notes').style.display = 'none';

  // Show warmup section collapsed with workout notes if any
  const warmupBody = document.getElementById('warmup-body');
  if (workout.notes) {
    warmupBody.innerHTML = `<div style="padding:8px 0;color:var(--text2);font-size:13px">${workout.notes}</div>`;
  } else {
    warmupBody.innerHTML = '';
  }
  document.getElementById('warmup-section').classList.remove('expanded');

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-workout').classList.add('active');
}

// ==================== WORKOUT ====================
async function startWorkout(sessionId) {
  const session = activePlan.sessions[sessionId];
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

  // Set unit toggle to current unit
  const curUnit = state.settings.unit || 'kg';
  document.querySelectorAll('#unit-toggle .unit-opt').forEach(b => b.classList.toggle('active', b.dataset.unit === curUnit));

  // Render warm-up with auto warm-up sets
  const warmupBody = document.getElementById('warmup-body');
  let warmupHTML = `<ul class="warmup-list">${session.warmup.map(w => `<li>${w}</li>`).join('')}</ul>`;

  // Auto warm-up ramp: full for 1st compound, short for 2nd, none for accessories
  if (previous) {
    const bar = state.settings.unit === 'lb' ? 45 : 20;
    let compoundIdx = 0;
    for (const ex of session.exercises) {
      const prevEx = previous.exercises.find(e => e.exerciseId === ex.id);
      const topWeight = prevEx ? Math.max(...prevEx.sets.filter(s => s.done && s.weight > 0).map(s => s.weight), 0) : 0;
      if (topWeight <= bar) continue;
      // Only compounds (sets >= 3 and has RPE >= 7) get warm-up ramps
      const isCompound = ex.sets >= 3 && ex.rpe !== '-' && parseFloat(ex.rpe) >= 7;
      if (!isCompound) continue;
      compoundIdx++;
      let warmupSets;
      if (compoundIdx === 1) {
        // First compound: full ramp (bar → 40% → 60% → 80%)
        warmupSets = [
          { pct: 0, w: bar, reps: 10 },
          { pct: 40, w: Math.round(topWeight * 0.4 / 2.5) * 2.5, reps: 6 },
          { pct: 60, w: Math.round(topWeight * 0.6 / 2.5) * 2.5, reps: 4 },
          { pct: 80, w: Math.round(topWeight * 0.8 / 2.5) * 2.5, reps: 2 },
        ];
      } else if (compoundIdx === 2) {
        // Second compound: short ramp (60% → 80%) — already warm
        warmupSets = [
          { pct: 60, w: Math.round(topWeight * 0.6 / 2.5) * 2.5, reps: 4 },
          { pct: 80, w: Math.round(topWeight * 0.8 / 2.5) * 2.5, reps: 2 },
        ];
      } else {
        break; // No ramp for 3rd+ compound
      }
      warmupSets = warmupSets.filter(s => s.w >= bar && s.w < topWeight);
      if (warmupSets.length > 0) {
        warmupHTML += `
          <div class="warmup-auto">
            <div class="warmup-auto-title">${ex.name} (${topWeight}${state.settings.unit})</div>
            ${warmupSets.map(s => {
              const pb = plateBreakdown(s.w, state.settings.unit);
              return `<div class="warmup-auto-set"><span class="warmup-pct">${s.pct === 0 ? 'Bar' : s.pct + '%'}</span><span class="warmup-weight">${s.w}${state.settings.unit}</span><span class="warmup-reps">× ${s.reps}</span><span class="warmup-plates">${pb}</span></div>`;
            }).join('')}
          </div>`;
      }
    }
  }

  warmupBody.innerHTML = warmupHTML;
  document.getElementById('warmup-section').classList.remove('expanded');

  // Group exercises by superset
  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';
  // Trigger fadeSlideIn stagger only on this initial render — not on reloads
  container.classList.add('initial-animate');
  setTimeout(() => container.classList.remove('initial-animate'), 700);

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

  // Drag-to-reorder exercises (long-press + drag)
  initExerciseDrag(container);

  // Event: set check (+ auto rest timer with superset awareness)
  container.querySelectorAll('.set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('checked');
      const card = btn.closest('.exercise-card');
      const row = btn.closest('.set-row');
      // Row flash feedback + haptic (Android only; iOS no-op)
      if (btn.classList.contains('checked')) {
        if (row) {
          row.classList.remove('flashed');
          // Force reflow so the animation restarts
          void row.offsetWidth;
          row.classList.add('flashed');
        }
        if (navigator.vibrate) navigator.vibrate(12);
      }
      updateExerciseStatus(card);
      updateSessionProgress();
      updateNowNext();
      saveActiveWorkout();
      // Auto-start rest timer when checking a set (not unchecking)
      if (btn.classList.contains('checked')) {
        const inSuperset = card.closest('.superset-group');
        const fullRest = parseInt(card.dataset.rest) || 120;
        // In a superset: short rest (15s) between exercises, full rest after last exercise in group
        if (inSuperset) {
          const cards = inSuperset.querySelectorAll('.exercise-card');
          const lastCard = cards[cards.length - 1];
          const isLastExercise = card === lastCard;
          const setIdx = parseInt(btn.dataset.setCheck);
          const allChecked = card.querySelectorAll('.set-check.checked').length === card.querySelectorAll('.set-check').length;
          // If all sets of this exercise done and it's not the last exercise in superset, short rest
          if (!isLastExercise) {
            startRestTimer(15, true);
          } else {
            startRestTimer(fullRest, true);
          }
        } else {
          startRestTimer(fullRest, true);
        }
      }
    });
  });

  // Event: per-exercise notes auto-save
  container.querySelectorAll('.ex-note').forEach(textarea => {
    textarea.addEventListener('input', () => saveActiveWorkout());
  });

  // Event: RPE color on change + auto-save
  container.querySelectorAll('[data-field="rpe"]').forEach(select => {
    select.addEventListener('change', () => {
      const val = parseFloat(select.value);
      const row = select.closest('.set-row');
      if (val) {
        row.style.borderLeft = `3px solid ${rpeColor(val)}`;
        select.style.color = rpeColor(val);
      } else {
        row.style.borderLeft = '';
        select.style.color = '';
      }
      saveActiveWorkout();
    });
  });

  // Auto-save on weight/reps input change
  container.querySelectorAll('[data-field="weight"], [data-field="reps"]').forEach(input => {
    input.addEventListener('change', () => saveActiveWorkout());
  });

  // Event: tappable exercise names
  container.querySelectorAll('.exercise-name.tappable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      openExerciseHistory(el.dataset.exId);
    });
  });

  // Event: swap buttons
  container.querySelectorAll('.btn-swap').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = btn.closest('.exercise-card');
      const muscle = btn.dataset.swapMuscle;
      const exId = btn.dataset.swapExId;
      const ex = session.exercises.find(e => e.id === exId) || { id: exId, name: getExerciseName(exId), muscle };
      showSwapUI(card, ex, session);
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
  updateNowNext();
  startWorkoutTimer();
  showView('workout');
  document.getElementById('header-title').textContent = session.name;
  document.getElementById('header-subtitle').textContent = session.subtitle + (deload ? ' (Deload)' : '');
  saveActiveWorkout();
}

// Generate a smart coach note for an exercise based on recent performance
function generateCoachNote(ex, allWorkouts) {
  // Get last 2 sessions for this exercise (most recent first)
  const history = allWorkouts
    .map(w => ({ date: w.date, ex: w.exercises.find(e => e.exerciseId === ex.id) }))
    .filter(h => h.ex && h.ex.sets.some(s => s.done && s.weight > 0))
    .slice(0, 2);

  if (history.length === 0) return ex.notes; // no data yet, keep static note

  const last = history[0].ex;
  const doneSets = last.sets.filter(s => s.done && s.weight > 0);
  if (doneSets.length === 0) return ex.notes;

  // Parse rep range: "5-8" → [5, 8], "10-12" → [10, 12]
  const repRange = ex.reps.toString().replace(/\/side/, '').split('-').map(Number);
  const minReps = repRange[0] || 0;
  const maxReps = repRange[1] || repRange[0] || 0;
  const targetRpe = parseFloat(ex.rpe) || 0;

  const topWeight = Math.max(...doneSets.map(s => s.weight));
  const avgReps = Math.round(doneSets.reduce((sum, s) => sum + s.reps, 0) / doneSets.length);
  const avgRpe = doneSets.filter(s => s.rpe).length > 0
    ? doneSets.filter(s => s.rpe).reduce((sum, s) => sum + s.rpe, 0) / doneSets.filter(s => s.rpe).length
    : 0;

  const allHitMax = doneSets.every(s => s.reps >= maxReps);
  const allHitMin = doneSets.every(s => s.reps >= minReps);
  const rpeControlled = avgRpe > 0 && avgRpe <= (targetRpe || 8);
  const rpeHigh = avgRpe > 8.5;

  // Decision logic
  if (allHitMax && rpeControlled) {
    const bump = state.settings.unit === 'lb' ? '5lb' : '2.5kg';
    return `↑ All sets hit ${maxReps} reps @ RPE ${avgRpe.toFixed(1)}. Increase to ${topWeight + (state.settings.unit === 'lb' ? 5 : 2.5)}${state.settings.unit}, aim for ${minReps} reps.`;
  }
  if (allHitMax && rpeHigh) {
    return `⚡ Hit ${maxReps} reps but RPE was ${avgRpe.toFixed(1)}. Stay at ${topWeight}${state.settings.unit} — bring RPE down to ${targetRpe || 8} before increasing.`;
  }
  if (!allHitMin) {
    return `↓ Didn't hit min ${minReps} reps on all sets. Consider dropping to ${topWeight - (state.settings.unit === 'lb' ? 5 : 2.5)}${state.settings.unit} or repeat same weight.`;
  }
  if (history.length >= 2) {
    const prev = history[1].ex;
    const prevDone = prev.sets.filter(s => s.done && s.weight > 0);
    const prevTop = Math.max(...prevDone.map(s => s.weight));
    const prevAvgReps = Math.round(prevDone.reduce((sum, s) => sum + s.reps, 0) / prevDone.length);
    if (topWeight === prevTop && avgReps === prevAvgReps) {
      return `→ Same weight and reps as last time. Push for +1 rep per set to progress.`;
    }
    if (topWeight > prevTop) {
      return `✓ Weight up from ${prevTop} to ${topWeight}. Solid — build reps at this weight.`;
    }
  }
  return `→ ${topWeight}${state.settings.unit} × ${avgReps} avg. Keep building reps within ${ex.reps} range.`;
}

function buildExerciseCard(ex, exIdx, previous, restSettings, exerciseNotes, deload, session, allWorkouts) {
  const prevEx = previous ? previous.exercises.find(e => e.exerciseId === ex.id) : null;
  const customRest = (restSettings.data && restSettings.data[ex.id]) || ex.defaultRest;
  const numSets = deload ? Math.ceil(ex.sets / 2) : ex.sets;
  const rpeDisplay = deload && ex.rpe !== '-' ? 'RPE 5-6' : `RPE ${ex.rpe}`;
  const muscleColor = MUSCLE_COLORS[ex.muscle] || '#666';

  const coachNote = deload
    ? '<strong>Deload:</strong> lighter weight, focus on form.'
    : generateCoachNote(ex, allWorkouts);

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
    const ghostHTML = prevSet && prevSet.done ? `<div class="ghost-set"><span>${ex.bw ? '+' : ''}${prevSet.weight}</span><span>${prevSet.reps}</span><span>${prevSet.rpe || ''}</span></div>` : '';
    setsHTML += `
      ${ghostHTML}
      <div class="set-row" data-set="${i}">
        <div class="set-num">${i + 1}</div>
        <input type="number" class="set-input" data-field="weight" placeholder="${prevSet ? prevSet.weight : (ex.bw ? '0' : '-')}" inputmode="decimal" step="0.5">
        <input type="number" class="set-input" data-field="reps" placeholder="${prevSet ? prevSet.reps : '-'}" inputmode="numeric" step="1">
        <select class="set-input" data-field="rpe" style="padding:8px 2px;font-size:12px">
          <option value="">RPE</option>
          ${[6,6.5,7,7.5,8,8.5,9,9.5,10].map(v => `<option value="${v}">${v}</option>`).join('')}
        </select>
        <button class="set-check" data-set-check="${i}">✓</button>
      </div>
    `;
  }

  const prevDoneSets = prevEx ? prevEx.sets.filter(s => s.done && (s.weight > 0 || ex.bw)) : [];
  const prevSummary = prevDoneSets.length > 0
    ? prevDoneSets.map(s => `${ex.bw ? '+' + s.weight : s.weight}×${s.reps}`).join('  ')
    : '';
  const prevHeaderHTML = prevSummary
    ? `<div class="prev-header">Last: ${prevSummary}</div>`
    : '';

  const e1rmHTML = best1RM > 0 ? `<div class="exercise-1rm">Est. 1RM: ${best1RM} ${state.settings.unit}</div>` : '';

  card.innerHTML = `
    <div class="exercise-header">
      <div class="exercise-info">
        <div class="exercise-name-row">
          <span class="exercise-name tappable" data-ex-id="${ex.id}">${ex.name} <span class="tap-hint">history</span></span>
          <span class="muscle-badge" style="background:${muscleColor}20;color:${muscleColor}">${ex.muscle}</span>
        </div>
        <div class="exercise-target">${numSets} × ${ex.reps} @ ${rpeDisplay} · Rest ${Math.floor(customRest / 60)}:${(customRest % 60).toString().padStart(2, '0')}</div>
        ${prevHeaderHTML}
        ${e1rmHTML}
      </div>
      <div class="exercise-status" data-status="${ex.id}"></div>
    </div>
    <div class="exercise-body">
      <div class="exercise-body-inner">
        <div class="set-table">
          <div class="set-table-header">
            <div>Set</div>
            <div>${ex.bw ? '+' + state.settings.unit : state.settings.unit}</div>
            <div>Reps</div>
            <div>RPE</div>
            <div></div>
          </div>
          ${setsHTML}
        </div>
        <div class="exercise-notes">${coachNote}</div>
        <textarea class="ex-note" data-ex-note="${ex.id}" placeholder="Notes for this exercise..." rows="1"></textarea>
        <button class="btn-swap" data-swap-muscle="${ex.muscle}" data-swap-ex-id="${ex.id}">↔ Swap exercise</button>
      </div>
    </div>
  `;
  card.dataset.rest = customRest;
  return card;
}

function updateExerciseStatus(card) {
  const checks = card.querySelectorAll('.set-check');
  const done = card.querySelectorAll('.set-check.checked');
  const statusEl = card.querySelector('.exercise-status');
  if (done.length === checks.length && checks.length > 0) {
    statusEl.className = 'exercise-status done';
    statusEl.textContent = '✓';
    // Find next incomplete card across the entire workout (handles supersets too)
    const allCards = [...document.querySelectorAll('#workout-exercises .exercise-card')];
    const myIdx = allCards.indexOf(card);
    const nextCard = allCards.slice(myIdx + 1).find(c => {
      const cDone = c.querySelectorAll('.set-check.checked').length;
      const cTotal = c.querySelectorAll('.set-check').length;
      return cTotal > 0 && cDone < cTotal;
    });
    if (nextCard && !nextCard.classList.contains('expanded')) {
      card.classList.remove('expanded');
      nextCard.classList.add('expanded');
    } else if (!nextCard) {
      card.classList.remove('expanded');
    }
  } else if (done.length > 0) {
    statusEl.className = 'exercise-status partial';
    statusEl.textContent = `${done.length}`;
  } else {
    statusEl.className = 'exercise-status';
    statusEl.textContent = '';
  }
}

// Highlight the current (first incomplete) set across all exercises and
// update the Now / Next bar at the top of the workout view.
function updateNowNext() {
  const container = document.getElementById('workout-exercises');
  if (!container) return;
  // Clear current markers
  container.querySelectorAll('.set-row.current').forEach(r => r.classList.remove('current'));
  container.querySelectorAll('.set-row.completed').forEach(r => r.classList.remove('completed'));

  const cards = [...container.querySelectorAll('.exercise-card')];
  let nowExName = '—';
  let nextExName = '—';
  let foundCurrent = false;

  for (const card of cards) {
    const rows = [...card.querySelectorAll('.set-row')];
    const allDone = rows.length > 0 && rows.every(r => r.querySelector('.set-check').classList.contains('checked'));
    if (allDone) continue;

    // Mark completed rows in this card
    rows.forEach(r => {
      if (r.querySelector('.set-check').classList.contains('checked')) r.classList.add('completed');
    });

    if (!foundCurrent) {
      // First incomplete set in the first incomplete card
      const firstOpen = rows.find(r => !r.querySelector('.set-check').classList.contains('checked'));
      if (firstOpen) firstOpen.classList.add('current');
      const nameEl = card.querySelector('.exercise-name');
      nowExName = nameEl ? nameEl.childNodes[0].textContent.trim() : '—';
      foundCurrent = true;
      continue;
    }
    // Next incomplete exercise after the current
    const nameEl = card.querySelector('.exercise-name');
    nextExName = nameEl ? nameEl.childNodes[0].textContent.trim() : '—';
    break;
  }

  const nowEl = document.getElementById('nn-now-val');
  const nextEl = document.getElementById('nn-next-val');
  if (nowEl) nowEl.textContent = nowExName;
  if (nextEl) nextEl.textContent = nextExName === '—' ? 'Last one 💪' : nextExName;
}

// ==================== WORKOUT PERSISTENCE ====================
function captureWorkoutState() {
  const exercises = [];
  document.querySelectorAll('#workout-exercises .exercise-card').forEach(card => {
    const exId = card.dataset.exerciseId;
    const expanded = card.classList.contains('expanded');
    const sets = [];
    card.querySelectorAll('.set-row').forEach(row => {
      sets.push({
        weight: row.querySelector('[data-field="weight"]').value,
        reps: row.querySelector('[data-field="reps"]').value,
        rpe: row.querySelector('[data-field="rpe"]').value,
        done: row.querySelector('.set-check').classList.contains('checked'),
      });
    });
    const noteEl = card.querySelector('.ex-note');
    const note = noteEl ? noteEl.value : '';
    exercises.push({ exerciseId: exId, sets, expanded, note });
  });
  return {
    key: 'activeWorkout',
    sessionId: state.activeSession,
    startTime: state.workoutStartTime,
    quality: state.sessionQuality,
    notes: '',
    exercises,
  };
}

async function saveActiveWorkout() {
  if (!state.activeSession) return;
  const data = captureWorkoutState();
  await dbPut('settings', data);
}

async function clearActiveWorkout() {
  await dbDelete('settings', 'activeWorkout');
  const banner = document.getElementById('resume-workout-banner');
  if (banner) { banner.classList.add('hidden'); banner.innerHTML = ''; }
  const weekBanner = document.getElementById('week-banner');
  if (weekBanner) weekBanner.classList.remove('hidden');
}

async function showResumeBanner() {
  const banner = document.getElementById('resume-workout-banner');
  if (!banner) return;
  const saved = await dbGet('settings', 'activeWorkout');
  const weekBanner = document.getElementById('week-banner');
  if (!saved || !saved.sessionId) {
    banner.classList.add('hidden');
    if (weekBanner) weekBanner.classList.remove('hidden');
    return;
  }
  const session = activePlan.sessions[saved.sessionId];
  if (!session) { await clearActiveWorkout(); return; }
  if (weekBanner) weekBanner.classList.add('hidden');

  const elapsed = Math.floor((Date.now() - saved.startTime) / 1000);
  const completedSets = saved.exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.done).length, 0);
  const totalSets = saved.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);

  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="resume-banner" id="resume-banner-tap">
      <div class="resume-banner-icon">💪</div>
      <div class="resume-banner-info">
        <div class="resume-banner-title">${session.name} in progress</div>
        <div class="resume-banner-sub">${completedSets}/${totalSets} sets · ${formatDuration(elapsed)} elapsed</div>
      </div>
      <button class="resume-banner-discard" id="resume-discard">Discard</button>
    </div>
  `;

  document.getElementById('resume-banner-tap').addEventListener('click', async (e) => {
    if (e.target.id === 'resume-discard') {
      e.stopPropagation();
      if (confirm('Discard this workout? All progress will be lost.')) {
        await clearActiveWorkout();
        state.activeSession = null;
      }
      return;
    }
    await restoreActiveWorkout();
    banner.classList.add('hidden');
  });
}

async function restoreActiveWorkout() {
  const saved = await dbGet('settings', 'activeWorkout');
  if (!saved || !saved.sessionId) return false;
  const session = activePlan.sessions[saved.sessionId];
  if (!session) { await clearActiveWorkout(); return false; }

  // Restore state
  state.activeSession = saved.sessionId;
  state.workoutStartTime = saved.startTime;
  state.sessionQuality = saved.quality || 3;

  // Rebuild the workout UI (reuse startWorkout rendering)
  await startWorkout(saved.sessionId);

  // Now restore the saved input values on top of the freshly rendered UI
  const cards = document.querySelectorAll('#workout-exercises .exercise-card');
  saved.exercises.forEach((savedEx, i) => {
    // Find the card with matching exerciseId
    const card = [...cards].find(c => c.dataset.exerciseId === savedEx.exerciseId);
    if (!card) return;
    if (savedEx.expanded) card.classList.add('expanded');
    else card.classList.remove('expanded');
    const rows = card.querySelectorAll('.set-row');
    savedEx.sets.forEach((s, j) => {
      const row = rows[j];
      if (!row) return;
      if (s.weight) row.querySelector('[data-field="weight"]').value = s.weight;
      if (s.reps) row.querySelector('[data-field="reps"]').value = s.reps;
      if (s.rpe) {
        const sel = row.querySelector('[data-field="rpe"]');
        sel.value = s.rpe;
        sel.style.color = rpeColor(parseFloat(s.rpe));
        row.style.borderLeft = `3px solid ${rpeColor(parseFloat(s.rpe))}`;
      }
      if (s.done) {
        row.querySelector('.set-check').classList.add('checked');
      }
    });
  });

  // Restore per-exercise notes
  saved.exercises.forEach(savedEx => {
    const card = [...cards].find(c => c.dataset.exerciseId === savedEx.exerciseId);
    if (!card) return;
    const noteEl = card.querySelector('.ex-note');
    if (noteEl && savedEx.note) noteEl.value = savedEx.note;
  });

  // Restore quality
  document.querySelectorAll('#quality-stars button').forEach(b => {
    b.classList.toggle('selected', parseInt(b.dataset.v) === state.sessionQuality);
  });

  // Restore start time for timer (don't reset it)
  state.workoutStartTime = saved.startTime;
  updateSessionProgress();
  updateNowNext();
  // This is a restore, not a first render — drop the stagger animation
  const wc = document.getElementById('workout-exercises');
  if (wc) wc.classList.remove('initial-animate');

  return true;
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
    const noteEl = card.querySelector('.ex-note');
    const note = noteEl ? noteEl.value.trim() : '';
    exercises.push({ exerciseId: exId, sets, note });
  });

  // Use the date the workout was started, not when it was finished (local tz)
  const startDate = dateStr(new Date(state.workoutStartTime));
  const workout = {
    id: uid(),
    date: startDate,
    session: state.activeSession,
    sessionName: activePlan.sessions[state.activeSession]?.name || state.activeSession,
    planVersion: activePlan.version || 1,
    week: getWeekNumber(),
    startTime: new Date(state.workoutStartTime).toTimeString().slice(0, 5),
    duration,
    exercises,
    quality: state.sessionQuality,
    notes: '',
    unit: state.settings.unit || 'kg',
  };

  await smartPut('workouts', workout);
  await clearActiveWorkout();

  // PR detection
  await detectPRs(workout);

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

  // Show 1RM summary
  const latest1RM = history.length > 0 ? history[history.length - 1].best1RM : 0;
  const peak1RM = history.reduce((max, h) => Math.max(max, h.best1RM), 0);
  document.getElementById('modal-1rm').innerHTML = latest1RM > 0
    ? `<span>Est. 1RM: <strong>${latest1RM}</strong> ${state.settings.unit}</span>${peak1RM > latest1RM ? `<span style="color:var(--text3);font-size:11px;margin-left:8px">Peak: ${peak1RM} ${state.settings.unit}</span>` : '<span style="color:var(--accent);font-size:11px;margin-left:8px">= All-time best</span>'}`
    : '<span>No data yet</span>';

  // 1RM progression chart
  const e1rmChart = document.getElementById('modal-1rm-chart');
  const e1rmData = history.filter(h => h.best1RM > 0).slice(-16);
  if (e1rmData.length >= 2) {
    e1rmChart.innerHTML = renderLineChart(
      e1rmData.map(h => formatDate(h.date)),
      e1rmData.map(h => h.best1RM),
      { color: 'var(--accent)', height: 130, showDots: true }
    );
  } else {
    e1rmChart.innerHTML = '<span class="chart-empty">Need 2+ sessions for 1RM trend</span>';
  }

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

  // Gradient fill area
  const gradientId = 'grad-' + Math.random().toString(36).slice(2, 7);
  const areaD = pathD + ` L${points[points.length - 1].x.toFixed(1)},${pad.top + chartH} L${points[0].x.toFixed(1)},${pad.top + chartH} Z`;

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient>
      </defs>
      ${yLabels}
      ${xLabels}
      <path d="${areaD}" fill="url(#${gradientId})"/>
      <path d="${pathD}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${dotsHTML}
    </svg>
  `;
}

// ==================== STATS MODULE ====================
function switchStatsGroup(group) {
  document.querySelectorAll('#stats-tabs .stats-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.statsGroup === group);
  });
  document.querySelectorAll('#view-stats .view-scroll > [data-group]').forEach(el => {
    el.classList.toggle('active-group', el.dataset.group === group);
  });
  const scroll = document.querySelector('#view-stats .view-scroll');
  if (scroll) scroll.scrollTop = 0;
}

async function renderStats() {
  // Ensure a stats group is active (default: today)
  const anyActive = document.querySelector('#view-stats .view-scroll > [data-group].active-group');
  if (!anyActive) switchStatsGroup('today');
  await renderActivityRings();
  await renderBodyWeightChart();
  if (window.renderWhoopRecoveryCard) await renderWhoopRecoveryCard();
  await renderStreaks();
  await renderFatigueScore();
  await renderDeloadReminder();
  await renderWeeklySummary();
  await renderWeeklyReport();
  await renderWeekComparison();
  await renderStreakCalendar();
  await renderMuscleVolume();
  await renderSwimlaneTL();
  renderBodyCompEstimator();
  await renderProteinChart();
  renderMacroCalculator();
  await renderStrengthChart();
  await renderVolumeChart();
  await renderTemplateUI();
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

  // Average RPE from recent workouts (0-20 points)
  const allRpes = [];
  recentWorkouts.forEach(w => {
    w.exercises.forEach(ex => {
      ex.sets.filter(s => s.done && s.rpe).forEach(s => allRpes.push(s.rpe));
    });
  });
  if (allRpes.length > 0) {
    const avgRpe = allRpes.reduce((a, b) => a + b, 0) / allRpes.length;
    fatigue += Math.round(Math.max(0, avgRpe - 6) * 5); // RPE 6→0, 10→20
  }

  // Integrate WHOOP recovery if available
  let whoopLabel = '';
  if (window.whoopIsConnected && whoopIsConnected()) {
    try {
      const whoopData = await whoopSyncData();
      if (whoopData && whoopData.recovery.length > 0) {
        const latest = whoopData.recovery[whoopData.recovery.length - 1];
        if (latest.score != null) {
          const whoopFatigue = Math.round((100 - latest.score) * 0.3);
          fatigue = Math.round(fatigue * 0.55 + whoopFatigue + fatigue * 0.15);
          whoopLabel = ` · WHOOP ${latest.score}%`;
        }
      }
    } catch { /* ignore whoop errors */ }
  }

  fatigue = Math.min(100, Math.max(0, fatigue));

  let color, tip;
  if (fatigue <= 30) { color = 'var(--accent)'; tip = 'Recovery looks good. Push hard today.'; }
  else if (fatigue <= 55) { color = 'var(--yellow)'; tip = 'Moderate fatigue. Train normally but monitor.'; }
  else if (fatigue <= 75) { color = 'var(--orange)'; tip = 'Elevated fatigue. Consider reducing volume or intensity.'; }
  else { color = 'var(--red)'; tip = 'High fatigue. Consider a rest day or very light session.'; }

  container.innerHTML = `
    <div class="fatigue-header">
      <span class="fatigue-title">Readiness Score</span>
      <span class="fatigue-score" style="color:${color}">${100 - fatigue}</span>
    </div>
    <div class="fatigue-bar"><div class="fatigue-bar-fill" style="width:${100 - fatigue}%;background:${color}"></div></div>
    <div class="fatigue-tip">${tip}${whoopLabel}</div>
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

// ==================== STREAK CALENDAR (GitHub style) ====================
async function renderStreakCalendar() {
  const container = document.getElementById('streak-calendar');
  if (!container) return;

  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');

  // Build set of active dates (last 12 weeks = 84 days)
  const activeDates = new Set();
  workouts.forEach(w => activeDates.add(w.date));
  runs.forEach(r => activeDates.add(r.date));

  const today = new Date();
  const days = 84; // 12 weeks
  const cells = [];

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const ds = dateStr(d);
    const active = activeDates.has(ds);
    const isToday = i === 0;
    cells.push({ date: ds, active, isToday, day: d.getDay() });
  }

  // Arrange in columns (weeks), rows (days 0-6)
  const weeks = [];
  let currentWeek = [];
  cells.forEach((c, i) => {
    if (i === 0) {
      // Pad first week
      for (let j = 0; j < c.day; j++) currentWeek.push(null);
    }
    currentWeek.push(c);
    if (c.day === 6 || i === cells.length - 1) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  });

  const totalActive = activeDates.size;
  const last7 = cells.slice(-7).filter(c => c && c.active).length;

  container.innerHTML = `
    <div class="streak-cal-stats">
      <span>${totalActive} total sessions</span>
      <span>${last7}/7 this week</span>
    </div>
    <div class="streak-cal-grid">
      ${weeks.map(week => `<div class="streak-cal-col">${week.map(c => {
        if (!c) return '<div class="streak-cal-cell empty"></div>';
        return `<div class="streak-cal-cell${c.active ? ' active' : ''}${c.isToday ? ' today' : ''}" title="${c.date}"></div>`;
      }).join('')}</div>`).join('')}
    </div>
    <div class="streak-cal-legend"><span class="streak-cal-cell"></span> Rest <span class="streak-cal-cell active"></span> Active</div>
  `;
}

// ==================== BODY COMPOSITION ESTIMATOR ====================
function renderBodyCompEstimator() {
  const container = document.getElementById('bodycomp-section');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px">
      <div style="flex:1"><label class="muted" style="font-size:11px">Weight (kg)</label><input type="number" id="bc-weight" inputmode="decimal" step="0.1" placeholder="82" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px"></div>
      <div style="flex:1"><label class="muted" style="font-size:11px">Waist (cm)</label><input type="number" id="bc-waist" inputmode="decimal" step="0.5" placeholder="85" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px"></div>
      <div style="flex:1"><label class="muted" style="font-size:11px">Neck (cm)</label><input type="number" id="bc-neck" inputmode="decimal" step="0.5" placeholder="38" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px"></div>
      <div style="flex:1"><label class="muted" style="font-size:11px">Height (cm)</label><input type="number" id="bc-height" inputmode="decimal" step="1" placeholder="178" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px"></div>
    </div>
    <button id="btn-calc-bf" class="btn-secondary" style="width:100%;text-align:center">Calculate</button>
    <div id="bc-result" style="margin-top:10px"></div>
  `;

  document.getElementById('btn-calc-bf').addEventListener('click', () => {
    const weight = parseFloat(document.getElementById('bc-weight').value);
    const waist = parseFloat(document.getElementById('bc-waist').value);
    const neck = parseFloat(document.getElementById('bc-neck').value);
    const height = parseFloat(document.getElementById('bc-height').value);

    if (!weight || !waist || !neck || !height) {
      document.getElementById('bc-result').innerHTML = '<span class="muted">Fill all fields</span>';
      return;
    }

    // US Navy method (male)
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
    const bfPct = Math.round(bf * 10) / 10;
    const leanMass = Math.round(weight * (1 - bfPct / 100) * 10) / 10;
    const fatMass = Math.round(weight * (bfPct / 100) * 10) / 10;

    let category;
    if (bfPct < 6) category = 'Essential';
    else if (bfPct < 14) category = 'Athletic';
    else if (bfPct < 18) category = 'Fitness';
    else if (bfPct < 25) category = 'Average';
    else category = 'Above average';

    document.getElementById('bc-result').innerHTML = `
      <div class="bc-result-grid">
        <div class="bc-stat"><span class="bc-val">${bfPct}%</span><span class="bc-label">Body Fat</span></div>
        <div class="bc-stat"><span class="bc-val">${leanMass} kg</span><span class="bc-label">Lean Mass</span></div>
        <div class="bc-stat"><span class="bc-val">${fatMass} kg</span><span class="bc-label">Fat Mass</span></div>
        <div class="bc-stat"><span class="bc-val">${category}</span><span class="bc-label">Category</span></div>
      </div>
    `;
  });
}

// ==================== WEEKLY TRAINING SUMMARY ====================
async function renderWeeklySummary() {
  const container = document.getElementById('weekly-summary');
  if (!container) return;

  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const wk = getWeekNumber();

  const thisWeek = workouts.filter(w => w.week === wk);
  const thisWeekRuns = runs.filter(r => {
    const d = new Date(r.date);
    const now = new Date();
    const diffDays = Math.floor((now - d) / 86400000);
    return diffDays <= 7;
  });

  // Total volume
  let totalVolume = 0;
  let totalSets = 0;
  const muscleSets = {};
  const prs = [];

  thisWeek.forEach(w => {
    w.exercises.forEach(ex => {
      const exName = getExerciseName(ex.exerciseId);
      const muscle = getExerciseMuscle(ex.exerciseId);
      ex.sets.filter(s => s.done).forEach(s => {
        totalVolume += (s.weight || 0) * (s.reps || 0);
        totalSets++;
        if (muscle) muscleSets[muscle] = (muscleSets[muscle] || 0) + 1;
      });
    });
  });

  const totalKm = thisWeekRuns.reduce((sum, r) => sum + (r.distance || 0), 0);
  const adherence = thisWeek.length;
  const planned = Object.values(activeWeekTemplate).filter(d => d.type === 'gym').length;

  container.innerHTML = `
    <div class="ws-grid">
      <div class="ws-stat"><span class="ws-val">${adherence}/${planned}</span><span class="ws-label">Sessions</span></div>
      <div class="ws-stat"><span class="ws-val">${totalSets}</span><span class="ws-label">Total Sets</span></div>
      <div class="ws-stat"><span class="ws-val">${Math.round(totalVolume / 1000)}k</span><span class="ws-label">Volume (${state.settings.unit})</span></div>
      <div class="ws-stat"><span class="ws-val">${totalKm.toFixed(1)}</span><span class="ws-label">Run km</span></div>
    </div>
  `;
}

// ==================== MACRO CALCULATOR ====================
function renderMacroCalculator() {
  const container = document.getElementById('macro-calc-section');
  if (!container) return;

  container.innerHTML = `
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
      <div style="flex:1;min-width:70px"><label class="muted" style="font-size:11px">Weight (kg)</label><input type="number" id="mc-weight" inputmode="decimal" step="0.1" placeholder="82" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px"></div>
      <div style="flex:1;min-width:100px"><label class="muted" style="font-size:11px">Goal</label>
        <select id="mc-goal" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px">
          <option value="cut">Fat Loss</option>
          <option value="maintain">Maintain</option>
          <option value="bulk">Muscle Gain</option>
        </select>
      </div>
      <div style="flex:1;min-width:100px"><label class="muted" style="font-size:11px">Activity</label>
        <select id="mc-activity" style="width:100%;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-size:14px;padding:8px 10px">
          <option value="1.4">Sedentary</option>
          <option value="1.55" selected>Moderate (3-4x/wk)</option>
          <option value="1.7">Active (5-6x/wk)</option>
          <option value="1.9">Very Active</option>
        </select>
      </div>
    </div>
    <button id="btn-calc-macros" class="btn-secondary" style="width:100%;text-align:center">Calculate Macros</button>
    <div id="mc-result" style="margin-top:10px"></div>
  `;

  document.getElementById('btn-calc-macros').addEventListener('click', () => {
    const weight = parseFloat(document.getElementById('mc-weight').value);
    const goal = document.getElementById('mc-goal').value;
    const activity = parseFloat(document.getElementById('mc-activity').value);

    if (!weight) {
      document.getElementById('mc-result').innerHTML = '<span class="muted">Enter your weight</span>';
      return;
    }

    // Mifflin-St Jeor estimate (male, assume height ~178, age ~30)
    const bmr = 10 * weight + 6.25 * 178 - 5 * 30 + 5;
    const tdee = Math.round(bmr * activity);
    const deficit = goal === 'cut' ? -400 : (goal === 'bulk' ? 300 : 0);
    const calories = tdee + deficit;

    // Macros
    const protein = Math.round(weight * 2); // 2g/kg
    const fat = Math.round(weight * 0.9); // 0.9g/kg
    const proteinCal = protein * 4;
    const fatCal = fat * 9;
    const carbCal = calories - proteinCal - fatCal;
    const carbs = Math.max(0, Math.round(carbCal / 4));

    document.getElementById('mc-result').innerHTML = `
      <div class="mc-summary">Target: <strong>${calories} kcal/day</strong> (TDEE ${tdee} ${deficit > 0 ? '+' : ''}${deficit})</div>
      <div class="mc-macros">
        <div class="mc-macro"><div class="mc-bar" style="background:var(--accent);height:${Math.round(proteinCal/calories*60)}px"></div><span class="mc-val">${protein}g</span><span class="mc-label">Protein</span></div>
        <div class="mc-macro"><div class="mc-bar" style="background:var(--yellow);height:${Math.round(fatCal/calories*60)}px"></div><span class="mc-val">${fat}g</span><span class="mc-label">Fat</span></div>
        <div class="mc-macro"><div class="mc-bar" style="background:var(--blue);height:${Math.round(carbCal/calories*60)}px"></div><span class="mc-val">${carbs}g</span><span class="mc-label">Carbs</span></div>
      </div>
    `;
  });
}

// ==================== WORKOUT TEMPLATES ====================
async function renderTemplateUI() {
  const container = document.getElementById('template-section');
  if (!container) return;

  const templates = (await dbGet('settings', 'workoutTemplates')) || { key: 'workoutTemplates', data: [] };
  const list = templates.data || [];

  container.innerHTML = `
    <div id="template-list">
      ${list.length === 0 ? '<div class="muted" style="font-size:12px;padding:8px 0">No saved templates yet. Finish a workout and save it as a template.</div>' : ''}
      ${list.map((t, i) => `
        <div class="template-item">
          <div class="template-info">
            <span class="template-name">${t.name}</span>
            <span class="template-detail">${t.exercises.length} exercises · ${t.exercises.reduce((s, e) => s + e.sets, 0)} sets</span>
          </div>
          <div class="template-actions">
            <button class="btn-template-load" data-template-idx="${i}">Load</button>
            <button class="btn-template-delete" data-template-idx="${i}">✕</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  container.querySelectorAll('.btn-template-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.templateIdx);
      const templates = (await dbGet('settings', 'workoutTemplates')) || { key: 'workoutTemplates', data: [] };
      templates.data.splice(idx, 1);
      await dbPut('settings', templates);
      toast('Template deleted');
      renderTemplateUI();
    });
  });

  container.querySelectorAll('.btn-template-load').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.templateIdx);
      const templates = (await dbGet('settings', 'workoutTemplates')) || { key: 'workoutTemplates', data: [] };
      const t = templates.data[idx];
      if (t) {
        toast(`Loaded template: ${t.name}`);
        startCustomWorkout(t);
      }
    });
  });
}

async function saveWorkoutAsTemplate(workout) {
  const name = prompt('Template name:', workout.session || 'Custom Workout');
  if (!name) return;

  const exercises = workout.exercises.map(ex => ({
    exerciseId: ex.exerciseId,
    sets: ex.sets.length,
    lastWeight: ex.sets.filter(s => s.done && s.weight > 0).map(s => s.weight).pop() || 0,
    lastReps: ex.sets.filter(s => s.done && s.reps > 0).map(s => s.reps).pop() || 0,
  }));

  const templates = (await dbGet('settings', 'workoutTemplates')) || { key: 'workoutTemplates', data: [] };
  if (!templates.data) templates.data = [];
  templates.data.push({ name, exercises, createdAt: today() });
  await dbPut('settings', templates);
  toast('Template saved!');
}

async function startCustomWorkout(template) {
  state.activeSession = 'custom';
  state.workoutStartTime = Date.now();
  state.sessionQuality = 3;

  const warmupBody = document.getElementById('warmup-body');
  warmupBody.innerHTML = '<ul class="warmup-list"><li>5 min general warm-up</li><li>Dynamic stretches</li><li>Warm-up sets for first exercise</li></ul>';

  const container = document.getElementById('workout-exercises');
  container.innerHTML = '';

  const restSettings = await dbGet('settings', 'restTimes') || { key: 'restTimes', data: {} };
  const exerciseNotes = await dbGet('settings', 'exerciseNotes') || { key: 'exerciseNotes', data: {} };
  const workouts = await dbGetAll('workouts');

  template.exercises.forEach((tex, idx) => {
    // Find exercise in PLAN
    let exDef = null;
    Object.values(activePlan.sessions).forEach(s => {
      const found = s.exercises.find(e => e.id === tex.exerciseId);
      if (found) exDef = found;
    });
    // Also check EXERCISE_ALTERNATIVES
    if (!exDef) {
      Object.values(EXERCISE_ALTERNATIVES).forEach(alts => {
        const found = alts.find(a => a.id === tex.exerciseId);
        if (found) exDef = { ...found, sets: tex.sets, reps: '6-12', rpe: '7-8', defaultRest: 90, notes: '' };
      });
    }
    if (!exDef) return;

    const ex = { ...exDef, sets: tex.sets };
    const card = buildExerciseCard(ex, idx, null, restSettings, exerciseNotes, false, { exercises: template.exercises.map(t => exDef) }, workouts);
    container.appendChild(card);
  });

  // Re-bind events
  container.querySelectorAll('.exercise-header').forEach(h => {
    h.addEventListener('click', (e) => {
      if (e.target.classList.contains('tappable')) return;
      h.closest('.exercise-card').classList.toggle('expanded');
    });
  });

  container.querySelectorAll('.set-check').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('checked');
      const card = btn.closest('.exercise-card');
      updateExerciseStatus(card);
      if (btn.classList.contains('checked')) {
        const exId = card.dataset.exerciseId;
        const restInput = card.querySelector(`[data-rest-config="${exId}"]`);
        const fullRest = restInput ? parseInt(restInput.value) || 90 : 90;
        startRestTimer(fullRest);
      }
    });
  });

  container.querySelectorAll('.btn-rest').forEach(btn => {
    btn.addEventListener('click', () => {
      const seconds = parseInt(btn.dataset.restStart) || 90;
      startRestTimer(seconds);
    });
  });

  container.querySelectorAll('.exercise-name.tappable').forEach(el => {
    el.addEventListener('click', () => openExerciseHistory(el.dataset.exId));
  });

  switchTab('workout');
  startWorkoutTimer();
}

function getExerciseMuscle(exId) {
  if (exerciseLibrary[exId]) return exerciseLibrary[exId].muscle;
  for (const session of Object.values(activePlan.sessions)) {
    const ex = session.exercises.find(e => e.id === exId);
    if (ex) return ex.muscle;
  }
  return null;
}

// ==================== REST TIMER ====================
// Beep using Web Audio API
function playTimerBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const beep = (freq, start, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq;
      gain.gain.value = 0.3;
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur);
    };
    beep(880, 0, 0.15);
    beep(880, 0.25, 0.15);
    beep(1320, 0.5, 0.3);
  } catch { /* audio not available */ }
}

function startRestTimer(seconds, autoStart = false) {
  state.restTimerTotal = seconds;
  state.restTimerRemaining = seconds;
  state.restTimerRunning = false;
  state.restTimerEndAt = null; // wall-clock target (set when countdown begins)

  const overlay = document.getElementById('rest-timer-overlay');
  const textEl = document.getElementById('timer-text');
  const labelEl = document.getElementById('timer-label');
  const ringFill = document.getElementById('timer-ring-fill');
  const timerDisplay = document.getElementById('timer-display');
  const circumference = 2 * Math.PI * 90;

  overlay.classList.remove('hidden');
  if (state.restTimerInterval) clearInterval(state.restTimerInterval);

  // Remove previous visibility handler if any
  if (state._timerVisHandler) {
    document.removeEventListener('visibilitychange', state._timerVisHandler);
    state._timerVisHandler = null;
  }

  function syncFromClock() {
    if (!state.restTimerEndAt) return;
    const remaining = Math.round((state.restTimerEndAt - Date.now()) / 1000);
    state.restTimerRemaining = Math.max(remaining, 0);
  }

  function updateDisplay() {
    const min = Math.floor(state.restTimerRemaining / 60);
    const sec = state.restTimerRemaining % 60;
    textEl.textContent = `${min}:${sec.toString().padStart(2, '0')}`;
    const progress = 1 - (state.restTimerRemaining / state.restTimerTotal);
    ringFill.style.strokeDashoffset = circumference * (1 - progress);
  }

  function finishTimer() {
    clearInterval(state.restTimerInterval);
    state.restTimerRemaining = 0;
    state.restTimerRunning = false;
    state.restTimerEndAt = null;
    updateDisplay();
    labelEl.textContent = 'DONE';
    playTimerBeep();
    if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
    setTimeout(() => overlay.classList.add('hidden'), 1500);
  }

  function beginCountdown() {
    if (state.restTimerRunning) return;
    state.restTimerRunning = true;
    state.restTimerEndAt = Date.now() + seconds * 1000;
    labelEl.textContent = 'REST';
    timerDisplay.style.cursor = 'default';

    state.restTimerInterval = setInterval(() => {
      syncFromClock();
      if (state.restTimerRemaining <= 0) {
        finishTimer();
        return;
      }
      updateDisplay();
    }, 1000);

    // When app returns from background, immediately sync with real clock
    state._timerVisHandler = () => {
      if (document.visibilityState === 'visible' && state.restTimerRunning) {
        syncFromClock();
        if (state.restTimerRemaining <= 0) {
          finishTimer();
        } else {
          updateDisplay();
        }
      }
    };
    document.addEventListener('visibilitychange', state._timerVisHandler);
  }

  updateDisplay();

  // Remove old listener if any
  if (state._timerTapHandler) timerDisplay.removeEventListener('click', state._timerTapHandler);

  if (autoStart) {
    // Auto-triggered by set check: start immediately
    beginCountdown();
  } else {
    // Manual trigger: wait for tap
    labelEl.textContent = '▶ TAP TO START';
    timerDisplay.style.cursor = 'pointer';
    state._timerTapHandler = beginCountdown;
    timerDisplay.addEventListener('click', state._timerTapHandler);
  }
}

function stopRestTimer() {
  if (state.restTimerInterval) clearInterval(state.restTimerInterval);
  if (state._timerVisHandler) {
    document.removeEventListener('visibilitychange', state._timerVisHandler);
    state._timerVisHandler = null;
  }
  state.restTimerRunning = false;
  state.restTimerEndAt = null;
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
    showEmptyState(container, '🏃', 'No runs yet', 'Log your runs in the Run tab to track distance and pace.');
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
    setStarValue('nut-energy', entry.energy || 3);
    document.getElementById('nut-alcohol').value = entry.alcohol || 0;
    setStarValue('nut-hunger', entry.hunger || 3);
    document.getElementById('nut-calories').value = entry.calories || '';
    document.getElementById('nut-notes').value = entry.notes || '';
  }

  renderMealList();
  renderNutritionHistory();
}

async function renderMealList() {
  const entry = await dbGet('nutrition', today());
  const meals = (entry && entry.meals) || [];
  const totalProtein = meals.reduce((sum, m) => sum + (m.protein || 0), 0);

  updateProteinRing(totalProtein);

  const container = document.getElementById('meal-list');
  if (meals.length === 0) {
    showEmptyState(container, '🍽️', 'No meals today', 'Add what you ate to track your protein intake.');
    return;
  }

  container.innerHTML = meals.map((m, i) => `
    <div class="history-item" style="padding:10px 12px">
      <div class="hi-left">
        <div class="hi-title" style="font-size:13px">${m.name}</div>
        <div class="hi-sub">${m.time || ''}</div>
      </div>
      <div class="hi-right" style="display:flex;align-items:center">
        <div class="hi-stat" style="font-size:14px">${m.protein}g</div>
        <button class="hi-delete" data-delete-meal="${i}">&times;</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('[data-delete-meal]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.deleteMeal);
      const entry = await dbGet('nutrition', today()) || { date: today(), meals: [] };
      const removed = entry.meals.splice(idx, 1)[0];
      entry.protein = entry.meals.reduce((sum, m) => sum + (m.protein || 0), 0);
      await smartPut('nutrition', entry);
      renderMealList();
      toast('Meal removed', {
        label: 'Undo',
        callback: async () => {
          const e = await dbGet('nutrition', today()) || { date: today(), meals: [] };
          e.meals.splice(idx, 0, removed);
          e.protein = e.meals.reduce((sum, m) => sum + (m.protein || 0), 0);
          await smartPut('nutrition', e);
          renderMealList();
        }
      });
    });
  });
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

// Common foods protein lookup (per typical serving)
const PROTEIN_DB = [
  { name: 'Chicken Breast', g: 40, serving: '200g' },
  { name: 'Steak', g: 50, serving: '200g' },
  { name: 'Ground Beef', g: 40, serving: '200g' },
  { name: 'Salmon Fillet', g: 35, serving: '180g' },
  { name: 'Tuna Can', g: 25, serving: '1 can' },
  { name: 'Eggs', g: 6, serving: '1 egg' },
  { name: 'Eggs x2', g: 12, serving: '2 eggs' },
  { name: 'Eggs x3', g: 18, serving: '3 eggs' },
  { name: 'Eggs x4', g: 24, serving: '4 eggs' },
  { name: 'Protein Shake', g: 30, serving: '1 scoop' },
  { name: 'Greek Yogurt', g: 15, serving: '170g' },
  { name: 'Cottage Cheese', g: 14, serving: '100g' },
  { name: 'Milk', g: 8, serving: '1 glass' },
  { name: 'Cheese', g: 7, serving: '1 slice' },
  { name: 'Turkey Breast', g: 35, serving: '150g' },
  { name: 'Pork Chop', g: 30, serving: '150g' },
  { name: 'Shrimp', g: 24, serving: '150g' },
  { name: 'Tofu', g: 15, serving: '150g' },
  { name: 'Lentils', g: 18, serving: '1 cup cooked' },
  { name: 'Chickpeas', g: 15, serving: '1 cup' },
  { name: 'Rice & Chicken', g: 45, serving: 'plate' },
  { name: 'Pasta & Meat', g: 35, serving: 'plate' },
  { name: 'Hamburger', g: 25, serving: '1 burger' },
  { name: 'Bife de Chorizo', g: 55, serving: '250g' },
  { name: 'Milanesa', g: 30, serving: '1 piece' },
  { name: 'Empanadas x3', g: 18, serving: '3 units' },
  { name: 'Protein Bar', g: 20, serving: '1 bar' },
  { name: 'Almonds', g: 6, serving: 'handful' },
  { name: 'Peanut Butter', g: 8, serving: '2 tbsp' },
];

function setupProteinAutocomplete() {
  const nameInput = document.getElementById('meal-name');
  const proteinInput = document.getElementById('meal-protein');
  const datalist = document.getElementById('protein-suggestions');

  // Populate datalist
  datalist.innerHTML = PROTEIN_DB.map(f =>
    `<option value="${f.name}" label="${f.g}g protein (${f.serving})">`
  ).join('');

  // Auto-fill protein when a known food is selected/typed
  nameInput.addEventListener('change', () => {
    const val = nameInput.value.trim().toLowerCase();
    const match = PROTEIN_DB.find(f => f.name.toLowerCase() === val);
    if (match && !proteinInput.value) {
      proteinInput.value = match.g;
    }
  });
}

async function addMeal(name, protein) {
  if (!name || !protein) { toast('Enter meal name and protein'); return; }

  const now = new Date();
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  const entry = await dbGet('nutrition', today()) || { date: today(), meals: [], energy: 3 };
  if (!entry.meals) entry.meals = [];
  entry.meals.push({ name, protein, time });
  entry.protein = entry.meals.reduce((sum, m) => sum + (m.protein || 0), 0);

  await smartPut('nutrition', entry);

  // Clear inputs
  document.getElementById('meal-name').value = '';
  document.getElementById('meal-protein').value = '';

  toast(`${name} — ${protein}g logged`);
  renderMealList();
}

async function logNutrition() {
  const entry = await dbGet('nutrition', today()) || { date: today(), meals: [] };
  entry.energy = getStarValue('nut-energy');
  entry.alcohol = parseInt(document.getElementById('nut-alcohol').value) || 0;
  entry.hunger = getStarValue('nut-hunger');
  entry.calories = parseInt(document.getElementById('nut-calories').value) || null;
  entry.notes = document.getElementById('nut-notes').value.trim();
  entry.protein = (entry.meals || []).reduce((sum, m) => sum + (m.protein || 0), 0);

  await smartPut('nutrition', entry);
  toast('Saved!');
  renderNutritionHistory();
}

async function renderNutritionHistory() {
  const container = document.getElementById('nutrition-history');
  const entries = (await dbGetAll('nutrition')).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  if (!entries.length) {
    showEmptyState(container, '📊', 'No nutrition history', 'Your daily protein totals will appear here.');
    return;
  }

  container.innerHTML = entries.map(e => {
    const totalProtein = e.protein || (e.meals || []).reduce((sum, m) => sum + (m.protein || 0), 0);
    const mealCount = (e.meals || []).length;
    const hitTarget = totalProtein >= state.settings.proteinTarget;
    return `
      <div class="history-item">
        <div class="hi-left">
          <div class="hi-title">${formatDate(e.date)}</div>
          <div class="hi-sub">${totalProtein}g protein · ${mealCount} meals${e.alcohol ? ` · ${e.alcohol} drinks` : ''}${e.calories ? ` · ${e.calories} kcal` : ''}</div>
        </div>
        <div class="hi-right">
          <div class="hi-stat" style="color:${hitTarget ? 'var(--accent)' : 'var(--orange)'}">${hitTarget ? '✓' : '✗'}</div>
          <div class="hi-stat-sub">protein</div>
        </div>
      </div>
    `;
  }).join('');
}

// ==================== PR DETECTION ====================
async function detectPRs(workout) {
  const allWorkouts = (await dbGetAll('workouts')).filter(w => w.id !== workout.id);
  const prs = [];

  for (const ex of workout.exercises) {
    const doneSets = ex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0);
    if (doneSets.length === 0) continue;

    // Find best previous 1RM for this exercise
    let prevBest1RM = 0;
    allWorkouts.forEach(w => {
      const wex = w.exercises.find(e => e.exerciseId === ex.exerciseId);
      if (wex) {
        wex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0).forEach(s => {
          const e1rm = estimate1RM(s.weight, s.reps);
          if (e1rm > prevBest1RM) prevBest1RM = e1rm;
        });
      }
    });

    // Check if any set in this workout beats the previous best
    const todayBest = doneSets.reduce((best, s) => {
      const e1rm = estimate1RM(s.weight, s.reps);
      return e1rm > best.e1rm ? { e1rm, weight: s.weight, reps: s.reps } : best;
    }, { e1rm: 0, weight: 0, reps: 0 });

    if (todayBest.e1rm > prevBest1RM && prevBest1RM > 0) {
      prs.push({ exerciseId: ex.exerciseId, e1rm: todayBest.e1rm, weight: todayBest.weight, reps: todayBest.reps });
    }
  }

  if (prs.length > 0) {
    const names = prs.map(pr => `${getExerciseName(pr.exerciseId)} (${pr.weight}×${pr.reps})`).join(', ');
    setTimeout(() => toast(`🏆 New PR! ${names}`), 500);
  }
}

// ==================== EXERCISE SWAP ====================
function getAlternatives(muscle, currentId) {
  const alts = EXERCISE_ALTERNATIVES[muscle] || [];
  return alts.filter(a => a.id !== currentId);
}

function showSwapUI(card, ex, session) {
  const existing = card.querySelector('.swap-panel');
  if (existing) { existing.remove(); return; }

  const alts = getAlternatives(ex.muscle, ex.id);
  if (alts.length === 0) { toast('No alternatives available'); return; }

  const panel = document.createElement('div');
  panel.className = 'swap-panel';
  panel.innerHTML = `
    <div class="swap-title">Swap ${ex.name} for:</div>
    ${alts.map(a => `<button class="swap-option" data-swap-id="${a.id}" data-swap-name="${a.name}">${a.name}</button>`).join('')}
    <button class="swap-cancel">Cancel</button>
  `;

  panel.querySelector('.swap-cancel').addEventListener('click', () => panel.remove());
  panel.querySelectorAll('.swap-option').forEach(btn => {
    btn.addEventListener('click', () => {
      const newId = btn.dataset.swapId;
      const newName = btn.dataset.swapName;
      // Update the card
      card.dataset.exerciseId = newId;
      card.querySelector('.exercise-name').textContent = newName;
      card.querySelector('.exercise-name').dataset.exId = newId;
      // Update header display
      const notesEl = card.querySelector('.exercise-notes');
      if (notesEl) notesEl.textContent = `Swapped from ${ex.name}`;
      panel.remove();
      toast(`Swapped to ${newName}`);
    });
  });

  card.querySelector('.exercise-body-inner').appendChild(panel);
}

// ==================== BODY WEIGHT TRACKING ====================
async function logBodyWeight() {
  const input = document.getElementById('bw-input');
  const weight = parseFloat(input.value);
  if (!weight || weight < 20 || weight > 300) { toast('Enter a valid weight'); return; }

  await smartPut('bodyweight', { date: today(), weight, timestamp: Date.now() });
  input.value = '';
  toast(`${weight} kg logged`);
  renderBodyWeightChart();
}

async function renderBodyWeightChart() {
  const container = document.getElementById('bw-chart');
  const currentEl = document.getElementById('bw-current');
  const entries = (await dbGetAll('bodyweight')).sort((a, b) => a.date.localeCompare(b.date));

  if (entries.length === 0) {
    currentEl.textContent = '--';
    showEmptyState(container, '⚖️', 'No weigh-ins yet', 'Log your weight above to start tracking trends.');
    return;
  }

  const latestWeight = entries[entries.length - 1].weight;
  currentEl.textContent = latestWeight + ' kg';

  // Rate of change: compare 7-day average now vs 7 days ago
  const rateEl = document.getElementById('bw-rate');
  if (entries.length >= 3) {
    const now = new Date();
    const weekAgo = new Date(now - 7 * 86400000);
    const recentEntries = entries.filter(e => new Date(e.date + 'T12:00:00') > weekAgo);
    const olderEntries = entries.filter(e => {
      const d = new Date(e.date + 'T12:00:00');
      return d <= weekAgo && d > new Date(now - 14 * 86400000);
    });
    if (recentEntries.length > 0 && olderEntries.length > 0) {
      const avgRecent = recentEntries.reduce((s, e) => s + e.weight, 0) / recentEntries.length;
      const avgOlder = olderEntries.reduce((s, e) => s + e.weight, 0) / olderEntries.length;
      const weeklyChange = avgRecent - avgOlder;
      const pctChange = (weeklyChange / avgOlder) * 100;
      const absPct = Math.abs(pctChange).toFixed(1);
      const sign = weeklyChange > 0 ? '+' : '';
      let color, label;
      if (pctChange <= -0.5 && pctChange >= -1.0) { color = 'var(--accent)'; label = 'on target'; }
      else if (pctChange < -1.0) { color = 'var(--orange)'; label = 'too fast'; }
      else if (pctChange < 0) { color = 'var(--yellow)'; label = 'slow'; }
      else { color = 'var(--red)'; label = 'gaining'; }
      rateEl.innerHTML = `<span style="color:${color}">${sign}${weeklyChange.toFixed(1)} kg/wk (${sign}${pctChange.toFixed(1)}%) — ${label}</span> <span style="color:var(--text3)">target: -0.5 to -1%</span>`;
    } else {
      rateEl.textContent = 'Need 2+ weeks of data for rate';
    }
  } else {
    rateEl.textContent = '';
  }

  if (entries.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ entries for chart</span>';
    return;
  }

  // Show last 30 entries max
  const recent = entries.slice(-30);

  // Calculate 7-day moving average
  const avgValues = recent.map((_, i) => {
    const window = recent.slice(Math.max(0, i - 6), i + 1);
    return Math.round(window.reduce((s, e) => s + e.weight, 0) / window.length * 10) / 10;
  });

  container.innerHTML = renderLineChart(
    recent.map(e => formatDate(e.date)),
    recent.map(e => e.weight),
    { color: 'var(--blue)', height: 150 }
  );

  // Overlay moving average if enough data
  if (recent.length >= 7) {
    const svgEl = container.querySelector('svg');
    if (svgEl) {
      const width = 320, pad = { top: 20, right: 15, bottom: 30, left: 40 };
      const chartW = width - pad.left - pad.right;
      const chartH = 150 - pad.top - pad.bottom;
      const vals = recent.map(e => e.weight);
      const dataMin = Math.min(...vals) * 0.99;
      const dataMax = Math.max(...vals) * 1.01;
      const range = dataMax - dataMin || 1;
      const pts = avgValues.map((v, i) => {
        const x = pad.left + (i / Math.max(avgValues.length - 1, 1)) * chartW;
        const y = pad.top + chartH - ((v - dataMin) / range) * chartH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      });
      const avgPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      avgPath.setAttribute('d', `M${pts.join(' L')}`);
      avgPath.setAttribute('fill', 'none');
      avgPath.setAttribute('stroke', 'var(--orange)');
      avgPath.setAttribute('stroke-width', '2');
      avgPath.setAttribute('stroke-dasharray', '4 3');
      avgPath.setAttribute('opacity', '0.7');
      svgEl.appendChild(avgPath);
    }
  }
}

// ==================== PLATE CALCULATOR ====================
let plateCalcUnit = 'kg';

function calculatePlates(targetWeight, unit) {
  const barWeight = unit === 'lb' ? 45 : BAR_WEIGHT;
  const plates = unit === 'lb' ? [45, 35, 25, 10, 5, 2.5] : PLATE_WEIGHTS;

  if (targetWeight <= barWeight) return { bar: barWeight, perSide: [], total: barWeight };

  let remaining = (targetWeight - barWeight) / 2;
  const perSide = [];

  for (const plate of plates) {
    while (remaining >= plate) {
      perSide.push(plate);
      remaining -= plate;
    }
  }

  const actual = barWeight + perSide.reduce((s, p) => s + p * 2, 0);
  return { bar: barWeight, perSide, total: actual };
}

function renderPlateCalculator() {
  const input = document.getElementById('plate-calc-input');
  const result = document.getElementById('plate-calc-result');
  const target = parseFloat(input.value);

  if (!target || target <= 0) { result.innerHTML = ''; return; }

  const unit = plateCalcUnit;
  const { bar, perSide, total } = calculatePlates(target, unit);

  if (perSide.length === 0) {
    result.innerHTML = `<div class="plate-result">Just the bar: ${bar} ${unit}</div>`;
    return;
  }

  // Count plates
  const counts = {};
  perSide.forEach(p => { counts[p] = (counts[p] || 0) + 1; });

  const plateList = Object.entries(counts).map(([w, c]) => `${c}× ${w}${unit}`).join(' + ');

  result.innerHTML = `
    <div class="plate-result">
      <div class="plate-bar">Bar: ${bar} ${unit}</div>
      <div class="plate-each">Each side: ${plateList}</div>
      <div class="plate-visual">${perSide.map(p => `<span class="plate-disc" style="height:${Math.max(20, p * (unit === 'lb' ? 0.8 : 2))}px">${p}</span>`).join('')}</div>
      ${total !== target ? `<div class="plate-note">Closest: ${total} ${unit} (${target - total > 0 ? '-' : '+'}${Math.abs(target - total).toFixed(1)})</div>` : ''}
    </div>
  `;
}

// ==================== DELOAD REMINDER ====================
async function checkDeloadNeeded() {
  const workouts = (await dbGetAll('workouts')).sort((a, b) => b.date.localeCompare(a.date));
  const wk = getWeekNumber();
  const reasons = [];

  // If already on a deload week, no reminder needed
  if (isDeloadWeek(wk)) return null;

  // Check for 2 consecutive sessions with quality decline
  const recent = workouts.slice(0, 4);
  if (recent.length >= 2) {
    const q1 = recent[0].quality || 3;
    const q2 = recent[1].quality || 3;
    if (q1 <= 2 && q2 <= 2) {
      reasons.push('2 consecutive low-quality sessions');
    }
  }

  // Check RPE trend: if average RPE of last 3 sessions > 8.5, fatigue is accumulating
  if (recent.length >= 3) {
    const sessionRpes = recent.slice(0, 3).map(w => {
      const rpes = [];
      w.exercises.forEach(ex => ex.sets.filter(s => s.done && s.rpe).forEach(s => rpes.push(s.rpe)));
      return rpes.length > 0 ? rpes.reduce((a, b) => a + b) / rpes.length : 0;
    }).filter(r => r > 0);
    if (sessionRpes.length >= 2) {
      const avgRpe = sessionRpes.reduce((a, b) => a + b) / sessionRpes.length;
      if (avgRpe >= 8.5) {
        reasons.push(`RPE averaging ${avgRpe.toFixed(1)} over last ${sessionRpes.length} sessions`);
      }
    }
  }

  // Check WHOOP recovery: if last 3 days average recovery < 34% (red zone)
  if (window.whoopIsConnected && whoopIsConnected()) {
    try {
      const whoopData = await whoopSyncData();
      if (whoopData && whoopData.recovery.length >= 2) {
        const last3 = whoopData.recovery.slice(-3);
        const avgRecovery = last3.reduce((s, r) => s + r.score, 0) / last3.length;
        if (avgRecovery < 34) {
          reasons.push(`WHOOP recovery averaging ${Math.round(avgRecovery)}% (red zone)`);
        }
      }
    } catch { /* ignore */ }
  }

  // Check if it's been 5+ weeks without a deload
  if (wk >= 5) {
    const lastDeloadWeek = Math.floor((wk - 1) / 4) * 4 + (isDeloadWeek(wk) ? wk : 0);
    const weeksSinceLast = wk - lastDeloadWeek;
    if (weeksSinceLast >= 5) {
      reasons.push(`${weeksSinceLast} weeks without a deload`);
    }
  }

  if (reasons.length > 0) {
    return { reasons, message: reasons.join(' + ') + '. Consider a deload.' };
  }
  return null;
}

async function renderDeloadReminder() {
  const container = document.getElementById('deload-reminder');
  if (!container) return;

  const reminder = await checkDeloadNeeded();
  if (reminder) {
    const severity = reminder.reasons.length >= 3 ? 'var(--red)' : reminder.reasons.length >= 2 ? 'var(--orange)' : 'var(--yellow)';
    container.innerHTML = `
      <div class="deload-banner" style="border-color:${severity}">
        <span class="deload-icon">⚠️</span>
        <div>
          <div class="deload-text" style="font-weight:700">Deload recommended</div>
          <div style="font-size:11px;color:var(--text2);margin-top:2px">${reminder.reasons.join(' · ')}</div>
        </div>
      </div>
    `;
    container.classList.remove('hidden');
  } else {
    container.classList.add('hidden');
  }
}

// ==================== CSV EXPORT ====================
async function exportCSV() {
  const workouts = (await dbGetAll('workouts')).sort((a, b) => a.date.localeCompare(b.date));
  const runs = (await dbGetAll('runs')).sort((a, b) => a.date.localeCompare(b.date));
  const nutrition = (await dbGetAll('nutrition')).sort((a, b) => a.date.localeCompare(b.date));
  const bodyweight = (await dbGetAll('bodyweight')).sort((a, b) => a.date.localeCompare(b.date));

  let csv = '';

  // Workouts sheet
  csv += '=== WORKOUTS ===\n';
  csv += 'Date,Session,Exercise,Set,Weight,Reps,RPE,Done,Quality,Duration\n';
  workouts.forEach(w => {
    const session = activePlan.sessions[w.session];
    w.exercises.forEach(ex => {
      ex.sets.forEach((s, i) => {
        csv += `${w.date},${session ? session.name : w.session},${getExerciseName(ex.exerciseId)},${i + 1},${s.weight},${s.reps},${s.rpe || ''},${s.done},${w.quality || ''},${w.duration || ''}\n`;
      });
    });
  });

  // Runs
  csv += '\n=== RUNS ===\n';
  csv += 'Date,Distance(km),Duration(min),Pace,AvgHR,Feel,Notes\n';
  runs.forEach(r => {
    csv += `${r.date},${r.distance},${r.duration},${r.avgPace},${r.avgHR || ''},${r.feel || ''},"${(r.notes || '').replace(/"/g, '""')}"\n`;
  });

  // Nutrition
  csv += '\n=== NUTRITION ===\n';
  csv += 'Date,Protein(g),Meals,Energy,Calories,Alcohol,Notes\n';
  nutrition.forEach(n => {
    const protein = n.protein || (n.meals || []).reduce((s, m) => s + (m.protein || 0), 0);
    const mealCount = (n.meals || []).length;
    csv += `${n.date},${protein},${mealCount},${n.energy || ''},${n.calories || ''},${n.alcohol || ''},"${(n.notes || '').replace(/"/g, '""')}"\n`;
  });

  // Body weight
  csv += '\n=== BODY WEIGHT ===\n';
  csv += 'Date,Weight(kg)\n';
  bodyweight.forEach(b => {
    csv += `${b.date},${b.weight}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const fileName = `training-export-${today()}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('CSV exported!');
}

// ==================== NUTRITION PROTEIN CHART ====================
async function renderProteinChart() {
  const container = document.getElementById('protein-chart');
  if (!container) return;

  const entries = (await dbGetAll('nutrition')).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  if (entries.length < 2) {
    container.innerHTML = '<span class="chart-empty">Need 2+ days of data</span>';
    return;
  }

  const labels = entries.map(e => formatDate(e.date));
  const values = entries.map(e => e.protein || (e.meals || []).reduce((s, m) => s + (m.protein || 0), 0));

  // Draw chart with target line
  const chartHTML = renderLineChart(labels, values, { color: 'var(--accent)', height: 150 });
  container.innerHTML = chartHTML;

  // Add target line
  const svgEl = container.querySelector('svg');
  if (svgEl && state.settings.proteinTarget) {
    const width = 320, pad = { top: 20, right: 15, bottom: 30, left: 40 };
    const chartH = 150 - pad.top - pad.bottom;
    const allVals = [...values, state.settings.proteinTarget];
    const dataMin = Math.min(...allVals) * 0.9;
    const dataMax = Math.max(...allVals) * 1.1;
    const range = dataMax - dataMin || 1;
    const targetY = pad.top + chartH - ((state.settings.proteinTarget - dataMin) / range) * chartH;

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', pad.left);
    line.setAttribute('y1', targetY);
    line.setAttribute('x2', width - pad.right);
    line.setAttribute('y2', targetY);
    line.setAttribute('stroke', 'var(--red)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '5 3');
    line.setAttribute('opacity', '0.6');
    svgEl.appendChild(line);

    const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', width - pad.right);
    label.setAttribute('y', targetY - 4);
    label.setAttribute('fill', 'var(--red)');
    label.setAttribute('font-size', '9');
    label.setAttribute('text-anchor', 'end');
    label.setAttribute('opacity', '0.7');
    label.textContent = `Target ${state.settings.proteinTarget}g`;
    svgEl.appendChild(label);
  }
}

// ==================== VOLUME PER MUSCLE GROUP (HEATMAP) ====================
async function renderMuscleVolume() {
  const container = document.getElementById('muscle-volume');
  if (!container) return;

  const weekDates = getWeekDates();
  const weekStrs = weekDates.map(d => dateStr(d));
  const workouts = (await dbGetAll('workouts')).filter(w => weekStrs.includes(w.date));

  if (workouts.length === 0) {
    showEmptyState(container, '📊', 'No data yet', 'Complete workouts to see your volume heatmap');
    return;
  }

  // Count sets per muscle group per day
  const muscleDay = {}; // { muscle: { '2026-04-07': 4, ... } }
  const muscleTotals = {};
  workouts.forEach(w => {
    w.exercises.forEach(ex => {
      let muscle = null;
      for (const s of Object.values(activePlan.sessions)) {
        const found = s.exercises.find(e => e.id === ex.exerciseId);
        if (found) { muscle = found.muscle; break; }
      }
      if (!muscle) {
        for (const [m, alts] of Object.entries(EXERCISE_ALTERNATIVES)) {
          if (alts.some(a => a.id === ex.exerciseId)) { muscle = m; break; }
        }
      }
      if (!muscle) muscle = 'Other';

      const doneSets = ex.sets.filter(s => s.done).length;
      if (!muscleDay[muscle]) muscleDay[muscle] = {};
      muscleDay[muscle][w.date] = (muscleDay[muscle][w.date] || 0) + doneSets;
      muscleTotals[muscle] = (muscleTotals[muscle] || 0) + doneSets;
    });
  });

  // Sort muscles by total sets descending
  const sorted = Object.keys(muscleTotals).sort((a, b) => muscleTotals[b] - muscleTotals[a]);
  // Find max sets in any single cell for intensity scaling
  let maxCell = 0;
  sorted.forEach(m => weekStrs.forEach(d => { maxCell = Math.max(maxCell, (muscleDay[m] && muscleDay[m][d]) || 0); }));
  if (maxCell === 0) maxCell = 1;

  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const todayStr = today();

  let html = `<div class="heatmap-grid" style="grid-template-columns: 72px repeat(7, 1fr) 40px">`;
  // Header row
  html += `<div class="hm-corner"></div>`;
  dayLabels.forEach((d, i) => {
    const isToday = weekStrs[i] === todayStr;
    html += `<div class="hm-day${isToday ? ' hm-today' : ''}">${d}</div>`;
  });
  html += `<div class="hm-day">Σ</div>`;

  // Muscle rows
  sorted.forEach(muscle => {
    const color = MUSCLE_COLORS[muscle] || '#666';
    const total = muscleTotals[muscle];
    const inRange = total >= 10 && total <= 14;
    html += `<div class="hm-muscle" style="color:${color}">${muscle}</div>`;
    weekStrs.forEach(d => {
      const sets = (muscleDay[muscle] && muscleDay[muscle][d]) || 0;
      const intensity = sets / maxCell;
      const bg = sets > 0 ? `${color}${Math.round(intensity * 0.6 * 255).toString(16).padStart(2, '0')}` : 'transparent';
      html += `<div class="hm-cell" style="background:${bg}" title="${muscle}: ${sets} sets">${sets || ''}</div>`;
    });
    html += `<div class="hm-total" style="color:${inRange ? 'var(--accent)' : total < 10 ? 'var(--orange)' : 'var(--yellow)'}">${total}</div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// ==================== SWIMLANE TIMELINE ====================
async function renderSwimlaneTL() {
  const container = document.getElementById('swimlane-timeline');
  if (!container) return;

  const weekDates = getWeekDates();
  const weekStrs = weekDates.map(d => dateStr(d));
  const workouts = await dbGetAll('workouts');
  const runs = await dbGetAll('runs');
  const customSchedule = await getWeekSchedule();
  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const todayStr = today();

  const lanes = [
    { id: 'gym', label: 'Gym', color: 'var(--orange)', icon: '🏋️' },
    { id: 'run', label: 'Run', color: 'var(--blue)', icon: '🏃' },
    { id: 'rest', label: 'Rest', color: 'var(--text3)', icon: '😴' },
  ];

  // Build day data
  const dayData = weekStrs.map((ds, i) => {
    const w = workouts.find(w => w.date === ds);
    const r = runs.find(r => r.date === ds);
    const sched = customSchedule || activeWeekTemplate;
    const jsDay = weekDates[i].getDay();
    const planned = sched[jsDay] || { type: 'rest' };
    return { date: ds, day: dayNames[i], workout: w, run: r, planned };
  });

  let html = `<div class="swimlane">`;
  // Day headers
  html += `<div class="sl-header"><div class="sl-lane-label"></div>`;
  dayData.forEach(d => {
    const isToday = d.date === todayStr;
    html += `<div class="sl-day${isToday ? ' sl-today' : ''}">${d.day}</div>`;
  });
  html += `</div>`;

  // Lanes
  lanes.forEach(lane => {
    html += `<div class="sl-row"><div class="sl-lane-label">${lane.icon} ${lane.label}</div>`;
    dayData.forEach(d => {
      let active = false, label = '';
      if (lane.id === 'gym') {
        if (d.workout) {
          active = true;
          const sess = activePlan.sessions[d.workout.session];
          label = sess ? sess.name.replace(/Upper |Lower /, '').charAt(0) : '✓';
        } else if (d.planned.type === 'gym' && d.date >= todayStr) {
          label = '·';
        }
      } else if (lane.id === 'run') {
        if (d.run) {
          active = true;
          label = d.run.distance ? d.run.distance + 'k' : '✓';
        } else if (d.planned.type === 'run' && d.date >= todayStr) {
          label = '·';
        }
      } else if (lane.id === 'rest') {
        if (!d.workout && !d.run && d.date <= todayStr) {
          active = true;
          label = '✓';
        } else if (d.planned.type === 'rest') {
          label = '·';
        }
      }
      const bg = active ? lane.color : 'transparent';
      html += `<div class="sl-cell${active ? ' sl-active' : ''}" style="${active ? 'background:' + lane.color + '20;color:' + lane.color : ''}"><span>${label}</span></div>`;
    });
    html += `</div>`;
  });
  html += `</div>`;
  container.innerHTML = html;
}

// ==================== DRAG-TO-REORDER EXERCISES ====================
function initExerciseDrag(container) {
  let dragEl = null, placeholder = null, startY = 0, offsetY = 0, longPressTimer = null;

  const getSwappable = () => [...container.children].filter(el => el.classList.contains('exercise-card') || el.classList.contains('superset-group'));

  container.addEventListener('touchstart', (e) => {
    const header = e.target.closest('.exercise-header');
    if (!header) return;
    const card = header.closest('.exercise-card, .superset-group') || header.closest('.exercise-card');
    if (!card || !container.contains(card)) return;
    const touch = e.touches[0];
    startY = touch.clientY;
    longPressTimer = setTimeout(() => {
      dragEl = card.parentElement.classList.contains('superset-group') ? card.parentElement : card;
      const rect = dragEl.getBoundingClientRect();
      offsetY = startY - rect.top;
      dragEl.classList.add('dragging');
      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.height = rect.height + 'px';
      dragEl.parentNode.insertBefore(placeholder, dragEl);
      dragEl.style.position = 'fixed';
      dragEl.style.top = (startY - offsetY) + 'px';
      dragEl.style.left = rect.left + 'px';
      dragEl.style.width = rect.width + 'px';
      dragEl.style.zIndex = '999';
      navigator.vibrate && navigator.vibrate(30);
    }, 400);
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    if (longPressTimer && Math.abs(e.touches[0].clientY - startY) > 10) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (!dragEl) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    dragEl.style.top = (y - offsetY) + 'px';
    // Find swap target
    const items = getSwappable().filter(el => el !== dragEl);
    for (const item of items) {
      const r = item.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (y < mid && container.children.length > 0) {
        container.insertBefore(placeholder, item);
        break;
      }
      if (item === items[items.length - 1]) {
        container.appendChild(placeholder);
      }
    }
  }, { passive: false });

  const endDrag = () => {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (!dragEl) return;
    dragEl.classList.remove('dragging');
    dragEl.style.position = '';
    dragEl.style.top = '';
    dragEl.style.left = '';
    dragEl.style.width = '';
    dragEl.style.zIndex = '';
    if (placeholder && placeholder.parentNode) {
      placeholder.parentNode.insertBefore(dragEl, placeholder);
      placeholder.remove();
    }
    // Spring animation
    dragEl.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
    dragEl.style.transform = 'scale(1.02)';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dragEl.style.transform = '';
        setTimeout(() => { dragEl.style.transition = ''; }, 300);
      });
    });
    dragEl = null;
    placeholder = null;
  };

  container.addEventListener('touchend', endDrag, { passive: true });
  container.addEventListener('touchcancel', endDrag, { passive: true });
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
  const { unit, proteinTarget, calorieTarget, startDate, userName } = state.settings;
  document.getElementById('unit-kg').classList.toggle('selected', unit === 'kg');
  document.getElementById('unit-lb').classList.toggle('selected', unit === 'lb');
  document.getElementById('setting-protein-target').value = proteinTarget;
  document.getElementById('setting-calorie-target').value = calorieTarget;
  document.getElementById('setting-start-date').value = startDate || today();
  document.getElementById('setting-name').value = userName || '';
}

async function saveSettings() {
  const unit = document.getElementById('unit-kg').classList.contains('selected') ? 'kg' : 'lb';
  const proteinTarget = parseInt(document.getElementById('setting-protein-target').value) || 170;
  const calorieTarget = parseInt(document.getElementById('setting-calorie-target').value) || 2500;
  const startDate = document.getElementById('setting-start-date').value || today();
  const userName = document.getElementById('setting-name').value.trim();

  state.settings = { unit, proteinTarget, calorieTarget, startDate, userName };
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

  // Stats sub-tabs
  document.querySelectorAll('#stats-tabs .stats-tab').forEach(btn => {
    btn.addEventListener('click', () => switchStatsGroup(btn.dataset.statsGroup));
  });

  // Settings button
  document.getElementById('btn-settings').addEventListener('click', () => {
    showView('settings');
    updateHeader('settings');
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    renderTrashList();
  });

  // Unit toggle in workout header (segmented control)
  document.getElementById('unit-toggle').addEventListener('click', async (e) => {
    const btn = e.target.closest('.unit-opt');
    if (!btn) return;
    const newUnit = btn.dataset.unit;
    if (newUnit === state.settings.unit) return;
    state.settings.unit = newUnit;
    document.querySelectorAll('#unit-toggle .unit-opt').forEach(b => b.classList.toggle('active', b.dataset.unit === newUnit));
    await dbPut('settings', { key: 'userSettings', data: state.settings });
    // Update column headers to reflect new unit
    document.querySelectorAll('#workout-exercises .set-table-header').forEach(header => {
      const cols = header.children;
      if (cols[1]) {
        const ex = header.closest('.exercise-card');
        const isBw = ex && ex.querySelector('.set-input[data-field="weight"]')?.placeholder === '0';
        cols[1].textContent = isBw ? '+' + newUnit : newUnit;
      }
    });
    // Update warm-up plate breakdowns
    document.querySelectorAll('.warmup-plates').forEach(el => {
      const setEl = el.closest('.warmup-auto-set');
      if (!setEl) return;
      const weightSpan = setEl.querySelector('.warmup-weight');
      if (!weightSpan) return;
      const w = parseFloat(weightSpan.textContent);
      if (!isNaN(w)) el.textContent = plateBreakdown(w, newUnit);
    });
  });

  // Back from workout
  document.getElementById('btn-back-gym').addEventListener('click', () => {
    if (state.viewingCompleted) {
      // Viewing saved workout: just go back, no prompt needed
      state.viewingCompleted = false;
      document.getElementById('btn-finish-workout').style.display = '';
      document.getElementById('workout-notes').style.display = '';
      state.currentView = 'gym';
      switchTab('gym');
    } else if (state.activeSession) {
      if (confirm('Abandon workout? Progress will be lost.')) {
        if (state.workoutTimerInterval) clearInterval(state.workoutTimerInterval);
        state.activeSession = null;
        clearActiveWorkout();
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

  // Add meal button
  document.getElementById('btn-add-meal').addEventListener('click', () => {
    const name = document.getElementById('meal-name').value.trim();
    const protein = parseInt(document.getElementById('meal-protein').value) || 0;
    if (!name && !protein) return;
    addMeal(name || 'Meal', protein);
    document.getElementById('meal-name').value = '';
    document.getElementById('meal-protein').value = '';
  });

  // Quick-add meal buttons
  document.querySelectorAll('[data-meal]').forEach(btn => {
    btn.addEventListener('click', () => {
      addMeal(btn.dataset.meal, parseInt(btn.dataset.g));
    });
  });

  // Protein autocomplete
  setupProteinAutocomplete();

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

  // Force update
  document.getElementById('btn-force-update').addEventListener('click', async () => {
    toast('Updating...');
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.unregister();
      }
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    window.location.reload(true);
  });

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

  // Star selectors
  ['run-feel', 'nut-hunger', 'nut-energy'].forEach(setupStarGroup);

  // Rest timer controls
  document.getElementById('timer-skip').addEventListener('click', stopRestTimer);
  document.getElementById('timer-minus').addEventListener('click', () => {
    state.restTimerRemaining = Math.max(0, state.restTimerRemaining - 15);
    if (state.restTimerEndAt) state.restTimerEndAt -= 15000;
  });
  document.getElementById('timer-plus').addEventListener('click', () => {
    state.restTimerRemaining += 15;
    state.restTimerTotal = Math.max(state.restTimerTotal, state.restTimerRemaining);
    if (state.restTimerEndAt) state.restTimerEndAt += 15000;
  });

  // Body weight
  document.getElementById('btn-log-bw').addEventListener('click', logBodyWeight);
  document.getElementById('bw-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') logBodyWeight();
  });

  // Plate calculator
  document.getElementById('plate-calc-input').addEventListener('input', renderPlateCalculator);
  document.querySelectorAll('#plate-unit-toggle .toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      plateCalcUnit = btn.dataset.plateUnit;
      document.querySelectorAll('#plate-unit-toggle .toggle-btn').forEach(b => {
        b.classList.toggle('selected', b === btn);
      });
      renderPlateCalculator();
    });
  });

  // Backup / Restore / CSV
  document.getElementById('btn-backup').addEventListener('click', exportBackup);
  document.getElementById('btn-export-csv').addEventListener('click', exportCSV);
  document.getElementById('file-restore').addEventListener('change', (e) => {
    if (e.target.files[0]) importBackup(e.target.files[0]);
  });

  // Exercise modal close
  document.getElementById('modal-close').addEventListener('click', closeExerciseModal);

  // Edit workout modal
  document.getElementById('ew-close').addEventListener('click', closeEditWorkout);
  document.getElementById('ew-save').addEventListener('click', saveEditWorkout);
  document.getElementById('ew-delete').addEventListener('click', deleteEditWorkout);

  // Log past workout
  document.getElementById('btn-log-past').addEventListener('click', logPastWorkout);

  // Data recovery buttons (Settings)
  const recoveryOut = document.getElementById('recovery-output');
  const showOut = (txt) => { recoveryOut.style.display = 'block'; recoveryOut.textContent = txt; };
  document.getElementById('btn-recover-data').addEventListener('click', async () => {
    showOut('Scanning…');
    const lines = [];
    // 1) Pending-delete recovery from sync queue
    const restoredQ = await recoverFromSyncQueue();
    lines.push(`Sync queue: restored ${restoredQ.length}`);
    restoredQ.forEach(r => lines.push(`  + ${r.session} · ${r.date}`));
    // 2) Force cloud pull
    const beforeCount = (await dbGetAll('workouts')).length;
    await forceCloudPull();
    const afterCount = (await dbGetAll('workouts')).length;
    lines.push(`Cloud pull: ${beforeCount} → ${afterCount} workouts`);
    lines.push(`(net change: ${afterCount - beforeCount})`);
    showOut(lines.join('\n'));
    renderRecentWorkouts();
    renderWeekStrip();
    renderStreakBanner();
    toast(`Recovery: +${restoredQ.length} queue, ${afterCount - beforeCount} cloud`);
  });
  document.getElementById('btn-scan-cloud').addEventListener('click', async () => {
    showOut('Fetching cloud workouts…');
    const res = await listCloudWorkouts();
    if (res.error) { showOut('Error: ' + res.error); return; }
    const lines = [`Cloud has ${res.rows.length} workouts:`];
    res.rows.forEach(r => {
      const w = r.data || {};
      const sessKey = w.session || '?';
      const session = activePlan.sessions[sessKey];
      const name = session ? session.name : sessKey;
      lines.push(`  ${w.date || '?'} · ${name} · id=${(w.id || '').slice(0, 6)}`);
    });
    showOut(lines.join('\n'));
  });

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
  const plan = activeWeekTemplate[jsDay];

  // Morning training reminder (7-10 AM)
  if (hour >= 7 && hour <= 10 && plan.type !== 'rest') {
    const label = plan.type === 'gym' ? activePlan.sessions[plan.session].name : 'Zone 2 Run';
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
      .then(reg => {
        console.log('[SW] Registered:', reg.scope);
        // Check for updates every 5 minutes
        setInterval(() => reg.update(), 5 * 60 * 1000);
        // When a new SW is found, auto-reload once it activates
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              console.log('[SW] New version available, reloading...');
              toast('App updated! Reloading...');
              setTimeout(() => window.location.reload(), 1000);
            }
          });
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));

    // Also reload if controller changes (new SW took over)
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }
}

// ==================== INIT ====================
// One-time data migrations
async function runMigrations() {
  const migKey = 'migrations_done';
  const done = (await dbGet('settings', migKey)) || { key: migKey, data: [] };
  if (!done.data) done.data = [];

  // Migration: backfill `unit` on all workouts + convert known lb workouts to kg
  if (!done.data.includes('backfill-unit')) {
    const appUnit = state.settings.unit || 'kg';
    const workouts = await dbGetAll('workouts');
    // These workouts were saved in lb without conversion (known from initial data audit)
    const lbWorkoutIds = ['mnuj7m3zh2anjq', 'mns1m5s1j5yrol'];
    for (const w of workouts) {
      if (w.unit) continue; // already tagged
      if (lbWorkoutIds.includes(w.id) && appUnit === 'kg') {
        // Convert lb weights to kg
        w.exercises.forEach(ex => {
          ex.sets.forEach(s => {
            if (s.weight) s.weight = +(s.weight * 0.453592).toFixed(2);
          });
        });
        console.log(`[Migration] Converted workout ${w.id} from lb to kg`);
      }
      w.unit = appUnit;
      await smartPut('workouts', w);
    }
    done.data.push('backfill-unit');
    await dbPut('settings', done);
  }

  // Migration: fix duplicate workouts on 2026-04-08 — move Upper A to 2026-04-07
  if (!done.data.includes('fix-apr8-dup')) {
    const workouts = await dbGetAll('workouts');
    const apr8 = workouts.filter(w => w.date === '2026-04-08');
    if (apr8.length >= 2) {
      const upperA = apr8.find(w => w.session === 'upperA');
      if (upperA) {
        upperA.date = '2026-04-07';
        await smartPut('workouts', upperA);
        console.log('[Migration] Moved Upper A workout to 2026-04-07');
      }
    }
    done.data.push('fix-apr8-dup');
    await dbPut('settings', done);
  }
}

async function init() {
  await openDB();
  await loadSettings();
  loadTheme();

  // Seed and load dynamic plan + exercise library
  await ensurePlanSeeded();
  await ensureExerciseLibrarySeeded();
  await loadActivePlan();
  await loadExerciseLibrary();

  bindEvents();

  // Run data migrations
  await runMigrations();
  await migrateWorkoutDatesToLocal();
  await oneShotCloudRecovery();
  await purgeExpiredTrash();

  // Service Worker
  registerServiceWorker();

  // Supabase auth
  if (window.initSupabase) {
    window.initSupabase();
    bindLoginEvents();
    await checkAuth();
  } else {
    hideLoginScreen();
    const authSection = document.getElementById('auth-section');
    if (authSection) {
      authSection.innerHTML = '<p class="muted" style="font-size:13px;margin:0">Cloud sync not configured.</p>';
    }
  }

  renderWeekStrip();
  renderRecentWorkouts();
  renderStreakBanner();
  updateHeader('gym');

  // Check for in-progress workout
  await showResumeBanner();

  // WHOOP
  if (window.renderWhoopUI) renderWhoopUI();

  // Notifications
  initNotifications();

  // Sticky compressed section headers
  document.querySelectorAll('.view-scroll').forEach(scroll => {
    const labels = scroll.querySelectorAll(':scope > .section-label');
    if (!labels.length) return;
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        entry.target.classList.toggle('stuck', entry.intersectionRatio < 1);
      });
    }, { root: scroll, threshold: [1] });
    labels.forEach(l => {
      l.style.top = '-1px'; // needed so it triggers when fully stuck
      observer.observe(l);
    });
  });
}

document.addEventListener('DOMContentLoaded', init);

// Save workout state when app goes to background (iOS kills PWAs aggressively)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && state.activeSession) {
    saveActiveWorkout();
  }
});
window.addEventListener('pagehide', () => {
  if (state.activeSession) saveActiveWorkout();
});
