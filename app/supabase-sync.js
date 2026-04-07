// ============================================================
// Supabase Sync Module — Training App v3.2
// ============================================================
// This module is optional. The app works fully offline without it.
// To enable cloud sync:
// 1. Create a free project at supabase.com
// 2. Fill in SUPABASE_URL and SUPABASE_ANON_KEY below
// 3. Run the SQL schema (see bottom of this file) in Supabase SQL Editor
// ============================================================

const SUPABASE_URL = 'https://ycfodifvpvosukepcxie.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InljZm9kaWZ2cHZvc3VrZXBjeGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzQ2MDMsImV4cCI6MjA5MTE1MDYwM30.3nDHWD2IJh2SZ283QuorC60O1KDGxad2LA_jk1aOwW4';

let supabaseClient = null;

// ==================== INIT ====================
function initSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('[Sync] Supabase not configured — offline only mode');
    return null;
  }
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    console.warn('[Sync] Supabase JS library not loaded');
    return null;
  }

  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    }
  });

  // Listen for auth changes
  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_IN') {
      syncAll();
      renderAuthUI();
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.classList.add('hidden');
    } else if (event === 'SIGNED_OUT') {
      renderAuthUI();
      const loginScreen = document.getElementById('login-screen');
      if (loginScreen) loginScreen.classList.remove('hidden');
    }
  });

  // Sync when coming online
  window.addEventListener('online', () => {
    if (getUser()) drainSyncQueue();
  });

  // Initial sync if logged in
  setTimeout(async () => {
    const user = await getUser();
    if (user) syncAll();
    renderAuthUI();
  }, 500);

  return supabaseClient;
}

// ==================== AUTH ====================
async function getUser() {
  if (!supabaseClient) return null;
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  } catch {
    return null;
  }
}

async function supaSignUp(email, password) {
  if (!supabaseClient) return { error: { message: 'Supabase not configured' } };
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (!error && data.user) {
    toast('Account created! Check email to confirm.');
  }
  return { data, error };
}

async function supaSignIn(email, password) {
  if (!supabaseClient) return { error: { message: 'Supabase not configured' } };
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (!error) {
    toast('Signed in!');
    await syncAll();
  }
  return { data, error };
}

async function supaSignOut() {
  if (!supabaseClient) return;
  await supabaseClient.auth.signOut();
  toast('Signed out');
  renderAuthUI();
}

// ==================== AUTH UI ====================
function renderAuthUI() {
  const section = document.getElementById('auth-section');
  if (!section) return;

  if (!supabaseClient) {
    section.innerHTML = `
      <p class="muted" style="font-size:13px;margin:0">Cloud sync not configured.<br>
      Edit <code>supabase-sync.js</code> with your Supabase credentials to enable.</p>
    `;
    return;
  }

  getUser().then(user => {
    if (user) {
      section.innerHTML = `
        <div class="form-row inline">
          <label style="font-size:13px">${user.email}</label>
          <button id="btn-signout" class="btn-secondary" style="width:auto;padding:8px 16px">Sign Out</button>
        </div>
        <div class="muted" style="font-size:12px;margin-top:8px">
          Synced to cloud. Data backed up automatically.
        </div>
        <button id="btn-force-sync" class="btn-secondary" style="margin-top:8px;width:100%;text-align:center">Force Sync Now</button>
      `;
      document.getElementById('btn-signout').addEventListener('click', supaSignOut);
      document.getElementById('btn-force-sync').addEventListener('click', async () => {
        await syncAll();
        toast('Sync complete');
      });
    } else {
      section.innerHTML = `
        <div class="form-row"><label>Email</label><input type="email" id="auth-email" placeholder="you@email.com" autocomplete="email"></div>
        <div class="form-row" style="margin-top:10px"><label>Password</label><input type="password" id="auth-password" placeholder="Min 6 characters" autocomplete="current-password"></div>
        <div id="auth-error" style="color:var(--red);font-size:12px;margin-top:8px;min-height:16px"></div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button id="btn-signin" class="btn-primary" style="flex:1">Sign In</button>
          <button id="btn-signup" class="btn-secondary" style="flex:1;text-align:center">Sign Up</button>
        </div>
        <p class="muted" style="font-size:11px;margin-top:10px">Sign in to sync data across devices.</p>
      `;
      const errEl = document.getElementById('auth-error');
      document.getElementById('btn-signin').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        const pass = document.getElementById('auth-password').value;
        if (!email || !pass) { errEl.textContent = 'Enter email and password'; return; }
        errEl.textContent = '';
        const { error } = await supaSignIn(email, pass);
        if (error) errEl.textContent = error.message;
      });
      document.getElementById('btn-signup').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value.trim();
        const pass = document.getElementById('auth-password').value;
        if (!email || pass.length < 6) { errEl.textContent = 'Email + password (min 6 chars)'; return; }
        errEl.textContent = '';
        const { error } = await supaSignUp(email, pass);
        if (error) errEl.textContent = error.message;
      });
    }
  });
}

// ==================== SYNC QUEUE ====================
// Queue operations for when offline. Stored in IndexedDB 'sync_queue' store.

async function enqueueSync(store, action, data) {
  if (!supabaseClient) return;
  try {
    await dbPut('sync_queue', {
      id: uid(),
      store,
      action, // 'upsert' or 'delete'
      data,
      timestamp: Date.now(),
    });
  } catch (e) {
    console.warn('[Sync] Failed to enqueue:', e);
  }
}

async function drainSyncQueue() {
  if (!supabaseClient) return;
  const user = await getUser();
  if (!user) return;

  let queue;
  try {
    queue = await dbGetAll('sync_queue');
  } catch {
    return; // sync_queue store may not exist yet
  }

  if (!queue || queue.length === 0) return;

  // Sort by timestamp
  queue.sort((a, b) => a.timestamp - b.timestamp);

  for (const item of queue) {
    try {
      if (item.action === 'upsert') {
        const { error } = await supabaseClient
          .from(item.store)
          .upsert({
            user_id: user.id,
            record_id: item.data.id || item.data.date || item.data.key,
            data: item.data,
            updated_at: new Date(item.timestamp).toISOString(),
          }, { onConflict: 'user_id,record_id' });
        if (error) throw error;
      } else if (item.action === 'delete') {
        const { error } = await supabaseClient
          .from(item.store)
          .delete()
          .eq('user_id', user.id)
          .eq('record_id', item.data.id || item.data.date || item.data.key);
        if (error) throw error;
      }
      // Remove from queue on success
      await dbDelete('sync_queue', item.id);
    } catch (e) {
      console.warn('[Sync] Failed to sync item:', item, e);
      // Leave in queue for retry
      break;
    }
  }
}

// ==================== FULL SYNC ====================
async function syncAll() {
  if (!supabaseClient || !navigator.onLine) return;
  const user = await getUser();
  if (!user) return;

  console.log('[Sync] Starting full sync...');

  // First drain any pending local changes
  await drainSyncQueue();

  // Pull from cloud for each store
  const stores = ['workouts', 'runs', 'nutrition', 'settings'];
  const lastSync = await dbGet('settings', 'lastSyncTimestamp');
  const since = lastSync ? lastSync.data : '1970-01-01T00:00:00Z';

  for (const store of stores) {
    try {
      const { data: remoteRows, error } = await supabaseClient
        .from(store)
        .select('*')
        .eq('user_id', user.id)
        .gte('updated_at', since);

      if (error) { console.warn(`[Sync] Pull error for ${store}:`, error); continue; }
      if (!remoteRows || remoteRows.length === 0) continue;

      for (const row of remoteRows) {
        const localKey = row.data.id || row.data.date || row.data.key;
        const local = await dbGet(store, localKey);

        // Last-write-wins: compare updated_at
        const remoteTime = new Date(row.updated_at).getTime();
        const localTime = local && local._updated_at ? local._updated_at : 0;

        if (remoteTime > localTime) {
          const merged = { ...row.data, _updated_at: remoteTime };
          await dbPut(store, merged);
        }
      }
    } catch (e) {
      console.warn(`[Sync] Error syncing ${store}:`, e);
    }
  }

  // Update last sync timestamp
  await dbPut('settings', { key: 'lastSyncTimestamp', data: new Date().toISOString() });
  console.log('[Sync] Sync complete');
}

// ==================== SYNCED WRAPPERS ====================
// These wrap dbPut/dbDelete to also enqueue for cloud sync

async function syncedPut(store, data) {
  data._updated_at = Date.now();
  await dbPut(store, data);
  await enqueueSync(store, 'upsert', data);
}

async function syncedDelete(store, key) {
  const item = await dbGet(store, key);
  await dbDelete(store, key);
  if (item) {
    await enqueueSync(store, 'delete', item);
  }
}

// Expose globally
window.initSupabase = initSupabase;
window.syncedPut = syncedPut;
window.syncedDelete = syncedDelete;
window.renderAuthUI = renderAuthUI;
window.supaSignOut = supaSignOut;

// ==================== SQL SCHEMA ====================
// Run this in your Supabase SQL Editor to set up the database:
//
// -- Enable RLS
// alter database postgres set "app.jwt_secret" to '';
//
// -- Workouts table
// create table if not exists workouts (
//   id bigint generated always as identity primary key,
//   user_id uuid references auth.users(id) on delete cascade not null,
//   record_id text not null,
//   data jsonb not null,
//   updated_at timestamptz default now(),
//   unique(user_id, record_id)
// );
// alter table workouts enable row level security;
// create policy "Users see own workouts" on workouts for all using (auth.uid() = user_id);
//
// -- Runs table
// create table if not exists runs (
//   id bigint generated always as identity primary key,
//   user_id uuid references auth.users(id) on delete cascade not null,
//   record_id text not null,
//   data jsonb not null,
//   updated_at timestamptz default now(),
//   unique(user_id, record_id)
// );
// alter table runs enable row level security;
// create policy "Users see own runs" on runs for all using (auth.uid() = user_id);
//
// -- Nutrition table
// create table if not exists nutrition (
//   id bigint generated always as identity primary key,
//   user_id uuid references auth.users(id) on delete cascade not null,
//   record_id text not null,
//   data jsonb not null,
//   updated_at timestamptz default now(),
//   unique(user_id, record_id)
// );
// alter table nutrition enable row level security;
// create policy "Users see own nutrition" on nutrition for all using (auth.uid() = user_id);
//
// -- Settings table
// create table if not exists settings (
//   id bigint generated always as identity primary key,
//   user_id uuid references auth.users(id) on delete cascade not null,
//   record_id text not null,
//   data jsonb not null,
//   updated_at timestamptz default now(),
//   unique(user_id, record_id)
// );
// alter table settings enable row level security;
// create policy "Users see own settings" on settings for all using (auth.uid() = user_id);
