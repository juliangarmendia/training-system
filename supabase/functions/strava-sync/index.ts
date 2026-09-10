import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  PROVIDER_TIMEOUT_MS,
  TOKEN_TIMEOUT_MS,
  corsHeaders,
  fetchWithTimeout,
  json as jsonResponse,
  netErrorText,
} from "../_shared/http.ts";

// Strava OAuth + activity sync proxy.
// Three actions:
//   - exchange: code → access_token + refresh_token + athlete_id
//   - refresh:  refresh_token → fresh access_token
//   - sync:     access_token + since_epoch → fetch ALL cardio activities,
//               runs → public.runs, everything else → public.sessions (both source='strava')
//
// v11.70 (auditoría 2026-09-09, S-1). `sync` escribía con el service role el `user_id` QUE LLEGABA EN
// EL CUERPO, y el cliente llamaba con la anon key — pública en GitHub Pages. Cualquiera podía insertar
// carreras en la cuenta de cualquier usuario saltándose el RLS. Ahora el usuario sale SIEMPRE del JWT
// de la sesión (`asUser.auth.getUser()`, el mismo patrón que whoop-sync); el `user_id` del cuerpo se ignora.
// `exchange`/`refresh` siguen aceptando la anon key: la página de callback de Strava corre fuera de la
// PWA (Safari, sin sesión) y sólo pueden devolverle a quien llama tokens de SU PROPIA cuenta de Strava.
// Los textos crudos de PostgREST y de Strava van al log, no al cliente (eran un oráculo de esquema).

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// IDÉNTICO a CARDIO_TYPE_MAP en app/app.js. `tests/verify-strava-steps-fns.mjs` extrae los dos
// literales y FALLA si difieren (C-7): el "keep in sync" a mano ya se había roto dos veces y de
// las dos formas posibles, cada una silenciosa a su manera.
//
//   · Faltaba `VirtualSki` (el tipo que intervals.icu y Strava usan para el SkiErg de Concept2
//     desde el 2025-10-10): toda sesión de SkiErg importada por Strava se descartaba sin ruido.
//   · Sobraban `Walk`/`Hike`. La app NO los importa por decisión de Julian (2026-08-18): un
//     paseo de 15 min al trabajo no es entrenamiento y ensuciaba el historial de sesiones. Por
//     esta vía SÍ entraban, como `recovery.walk`, así que el mismo paseo contaba o no contaba
//     según por dónde llegase. Los pasos siguen entrando por su propia vía (`steps`).
const CARDIO_TYPE_MAP: Record<string, string> = {
  Run: "run_outdoor", TrailRun: "run_outdoor",
  VirtualRun: "treadmill", Treadmill: "treadmill",
  Ride: "bike", VirtualRide: "bike", GravelRide: "bike", MountainBikeRide: "bike", EBikeRide: "bike", Handcycle: "bike",
  Rowing: "row", VirtualRow: "row", Kayaking: "row", Canoeing: "row",
  NordicSki: "ski", BackcountrySki: "ski", RollerSki: "ski", AlpineSki: "ski", VirtualSki: "ski",
  Elliptical: "elliptical", StairStepper: "elliptical",
  Swim: "swim",
};
const RUN_MODALITIES = new Set(["run_outdoor", "treadmill"]);
// Set STRAVA_CLIENT_ID + STRAVA_CLIENT_SECRET in Supabase Function Secrets.
// REDIRECT_URI must match the callback domain registered in your Strava app.
const REDIRECT_URI = "https://juliangarmendia.github.io/training-system/app/strava-callback.html";

// C-22: `corsHeaders` y la respuesta JSON vienen de `_shared/http.ts` (el `json` compartido se
// importa como `jsonResponse` para no tocar las ~20 llamadas de abajo).

function formatPace(secondsPerKm: number): string {
  if (!isFinite(secondsPerKm) || secondsPerKm <= 0) return "";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const clientId = Deno.env.get("STRAVA_CLIENT_ID");
    const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return jsonResponse({ error: "STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET not configured" }, 500);
    }

    // ---------- TOKEN EXCHANGE ----------
    if (action === "exchange") {
      const { code } = body;
      if (!code) return jsonResponse({ error: "Missing code" }, 400);

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      });
      // Strava also supports redirect_uri in the body, but it's optional for token exchange.

      // C-11: 12 s (canje de token). Sin tope, un endpoint de Strava colgado dejaba la
      // pestana del callback girando hasta que iOS mataba la peticion.
      const res = await fetchWithTimeout(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }, TOKEN_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // C-29: el cuerpo crudo de Strava al log. `details` echaba de vuelta al cliente su JSON
        // entero, que nombra el campo de NUESTRA configuracion que esta mal (client_id/secret).
        console.error(`[strava-sync] exchange ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
        return jsonResponse({ error: "strava_exchange_failed", status: res.status }, res.status);
      }

      return jsonResponse({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at, // epoch seconds
        expires_in: data.expires_in,
        athlete_id: data.athlete?.id,
        athlete_firstname: data.athlete?.firstname,
      });
    }

    // ---------- TOKEN REFRESH ----------
    if (action === "refresh") {
      const { refresh_token } = body;
      if (!refresh_token) return jsonResponse({ error: "Missing refresh_token" }, 400);

      const params = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token,
        grant_type: "refresh_token",
      });
      // C-11: 12 s (refresco de token).
      const res = await fetchWithTimeout(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      }, TOKEN_TIMEOUT_MS);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`[strava-sync] refresh ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
        return jsonResponse({ error: "strava_refresh_failed", status: res.status }, res.status);
      }

      return jsonResponse({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
      });
    }

    // ---------- ACTIVITY SYNC ----------
    if (action === "sync") {
      const { access_token, since_epoch } = body;
      if (!access_token) return jsonResponse({ error: "Missing access_token" }, 400);

      // El usuario, del JWT de la sesión. Nunca del cuerpo.
      const authHeader = req.headers.get("Authorization") || "";
      if (!authHeader) return jsonResponse({ error: "Missing Authorization" }, 401);
      const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userErr } = await asUser.auth.getUser();
      if (userErr || !userData?.user) return jsonResponse({ error: "Invalid session" }, 401);
      const userId = userData.user.id;

      // Default to last 30 days if no since provided
      const since = since_epoch || Math.floor((Date.now() - 30 * 86400000) / 1000);
      const url = `${STRAVA_API_BASE}/athlete/activities?after=${since}&per_page=30`;
      // C-11: 15 s (API del proveedor). Bajo `waitUntil` no lo hay, pero el usuario espera.
      const res = await fetchWithTimeout(url, { headers: { Authorization: `Bearer ${access_token}` } }, PROVIDER_TIMEOUT_MS);
      if (!res.ok) {
        const text = await res.text();
        console.error(`[strava-sync] activities ${res.status}: ${text.substring(0, 500)}`);
        return jsonResponse({ error: "strava_fetch_failed", status: res.status }, res.status === 401 ? 401 : 502);
      }
      const activities = await res.json();
      // v11.36: import EVERY cardio modality, not just runs. This filter used to be
      // `type === "Run"`, so every bike/row/ski/walk session Strava recorded was dropped
      // silently — mirrored in app.js CARDIO_TYPE_MAP. Runs go to `runs`; the rest go to
      // `sessions` (the unified envelope). Strength stays out on purpose: it would
      // duplicate the gym sessions logged in-app.
      const kept: Record<string, number> = {};
      const skipped: Record<string, number> = {};
      const typed = (activities as Array<Record<string, unknown>>)
        .map((a) => {
          const t = String(a.sport_type || a.type || "unknown");
          const modality = CARDIO_TYPE_MAP[t] || null;
          if (!modality) { skipped[t] = (skipped[t] || 0) + 1; return null; }
          kept[modality] = (kept[modality] || 0) + 1;
          return { a, modality, rawType: t };
        })
        .filter((x): x is { a: Record<string, unknown>; modality: string; rawType: string } => x !== null);
      const runs = typed.filter((x) => RUN_MODALITIES.has(x.modality));
      const others = typed.filter((x) => !RUN_MODALITIES.has(x.modality));

      // Upsert each run via Supabase REST (service role).
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceKey) {
        return jsonResponse({ error: "SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
      }

      let inserted = 0;
      let updated = 0;
      const errors: string[] = [];

      for (const { a } of runs) {
        const stravaId = String(a.id);
        const recordId = `strava_${stravaId}`;
        const startLocal = String(a.start_date_local || a.start_date || "");
        const date = startLocal.split("T")[0];
        const distanceKm = Number(a.distance || 0) / 1000;
        const movingSec = Number(a.moving_time || 0);
        const durationMin = Math.round(movingSec / 60);
        const paceSecPerKm = distanceKm > 0 ? movingSec / distanceKm : 0;

        const data = {
          id: recordId,
          date,
          distance: Math.round(distanceKm * 100) / 100,
          duration: durationMin,
          avgHR: a.average_heartrate ? Math.round(Number(a.average_heartrate)) : null,
          maxHR: a.max_heartrate ? Math.round(Number(a.max_heartrate)) : null,
          avgPace: formatPace(paceSecPerKm),
          feel: null,
          notes: String(a.name || ""),
          source: "strava",
          source_id: stravaId,
          _updated_at: Date.now(),
        };

        const upsertUrl = `${supabaseUrl}/rest/v1/runs?on_conflict=user_id,source,source_id`;
        const upsertRes = await fetchWithTimeout(upsertUrl, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify({
            user_id: userId,
            record_id: recordId,
            data,
            source: "strava",
            source_id: stravaId,
            updated_at: new Date().toISOString(),
          }),
        }, PROVIDER_TIMEOUT_MS);

        if (!upsertRes.ok) {
          const text = await upsertRes.text();
          console.error(`[strava-sync] runs upsert ${stravaId}: ${upsertRes.status} ${text.substring(0, 300)}`);
          errors.push(`${stravaId}: upsert_failed ${upsertRes.status}`);
          continue;
        }
        // Heuristic: representation array length 1 means inserted-or-updated; we don't differentiate cleanly here.
        // Treat all successes as "synced" for the user-facing count.
        inserted++;
      }

      // Non-run cardio -> `sessions`, the unified T1 envelope (family/subtype/modality).
      let sessionsSynced = 0;
      for (const { a, modality, rawType } of others) {
        const stravaId = String(a.id);
        const recordId = `strava_${stravaId}`;
        const startLocal = String(a.start_date_local || a.start_date || "");
        const date = startLocal.split("T")[0];
        if (!date) continue;
        const distanceKm = Number(a.distance || 0) / 1000;
        const durationMin = Math.round(Number(a.moving_time || 0) / 60);
        // La rama `walk` ya no se alcanza desde el 2026-09-10: `Walk`/`Hike` salieron de
        // CARDIO_TYPE_MAP para igualarlo al de la app (C-7). Se conserva porque el mapa es un
        // dato y la clasificación tiene que seguir siendo correcta si algún día vuelve.
        const family = modality === "walk" ? "recovery" : "cardio";
        const subtype = family === "recovery" ? "walk" : "zone2"; // Strava gives no intensity label
        const data = {
          id: recordId,
          date,
          family,
          subtype,
          sessionType: `${family}.${subtype}`,
          modality,
          title: String(a.name || `${modality} ${subtype}`),
          durationMin: durationMin || null,
          distance: distanceKm > 0 ? Math.round(distanceKm * 100) / 100 : null,
          avgHR: a.average_heartrate ? Math.round(Number(a.average_heartrate)) : null,
          maxHR: a.max_heartrate ? Math.round(Number(a.max_heartrate)) : null,
          perceivedEffort: null,
          budgetWeight: family === "recovery" ? 0 : 0.5,
          subtypeInferred: true, // Strava has no intensity field — never present as measured
          sport: rawType,
          notes: "",
          source: "strava",
          source_id: stravaId,
          _updated_at: Date.now(),
        };
        const upsertRes = await fetchWithTimeout(`${supabaseUrl}/rest/v1/sessions?on_conflict=user_id,record_id`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({ user_id: userId, record_id: recordId, data, updated_at: new Date().toISOString() }),
        }, PROVIDER_TIMEOUT_MS);
        if (!upsertRes.ok) {
          const text = await upsertRes.text();
          console.error(`[strava-sync] sessions upsert ${stravaId}: ${upsertRes.status} ${text.substring(0, 300)}`);
          errors.push(`${stravaId} (${modality}): upsert_failed ${upsertRes.status}`);
          continue;
        }
        sessionsSynced++;
      }

      return jsonResponse({
        synced: inserted, updated, sessions_synced: sessionsSynced,
        total_runs: runs.length, total_sessions: others.length,
        total_activities: (activities as unknown[]).length,
        kept, skipped, errors,
      });
    }

    return jsonResponse({ error: "Invalid action. Use 'exchange', 'refresh', or 'sync'" }, 400);
  } catch (err) {
    // C-11/C-29: un timeout aterriza aqui. El detalle al log; al cliente, una etiqueta.
    console.error(`[strava-sync] ${netErrorText(err, PROVIDER_TIMEOUT_MS)}`);
    return jsonResponse({ error: "strava_sync_failed" }, 500);
  }
});
