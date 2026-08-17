import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Strava OAuth + activity sync proxy.
// Three actions:
//   - exchange: code → access_token + refresh_token + athlete_id
//   - refresh:  refresh_token → fresh access_token
//   - sync:     access_token + since_epoch + user_id → fetch ALL cardio activities,
//               runs → public.runs, everything else → public.sessions (both source='strava')

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Keep in sync with CARDIO_TYPE_MAP in app/app.js — same type names, same modalities.
const CARDIO_TYPE_MAP: Record<string, string> = {
  Run: "run_outdoor", TrailRun: "run_outdoor",
  VirtualRun: "treadmill", Treadmill: "treadmill",
  Ride: "bike", VirtualRide: "bike", GravelRide: "bike", MountainBikeRide: "bike", EBikeRide: "bike", Handcycle: "bike",
  Rowing: "row", VirtualRow: "row", Kayaking: "row", Canoeing: "row",
  NordicSki: "ski", BackcountrySki: "ski", RollerSki: "ski", AlpineSki: "ski",
  Elliptical: "elliptical", StairStepper: "elliptical",
  Walk: "walk", Hike: "walk",
  Swim: "swim",
};
const RUN_MODALITIES = new Set(["run_outdoor", "treadmill"]);
// Set STRAVA_CLIENT_ID + STRAVA_CLIENT_SECRET in Supabase Function Secrets.
// REDIRECT_URI must match the callback domain registered in your Strava app.
const REDIRECT_URI = "https://juliangarmendia.github.io/training-system/app/strava-callback.html";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

      const res = await fetch(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse({ error: data.message || "Token exchange failed", details: data }, res.status);

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
      const res = await fetch(STRAVA_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse({ error: data.message || "Refresh failed", details: data }, res.status);

      return jsonResponse({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: data.expires_at,
        expires_in: data.expires_in,
      });
    }

    // ---------- ACTIVITY SYNC ----------
    if (action === "sync") {
      const { access_token, since_epoch, user_id } = body;
      if (!access_token || !user_id) return jsonResponse({ error: "Missing access_token or user_id" }, 400);

      // Default to last 30 days if no since provided
      const since = since_epoch || Math.floor((Date.now() - 30 * 86400000) / 1000);
      const url = `${STRAVA_API_BASE}/athlete/activities?after=${since}&per_page=30`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${access_token}` } });
      if (!res.ok) {
        const text = await res.text();
        return jsonResponse({ error: `Strava activities fetch failed: ${res.status}`, body: text.substring(0, 500) }, res.status);
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
        const upsertRes = await fetch(upsertUrl, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify({
            user_id,
            record_id: recordId,
            data,
            source: "strava",
            source_id: stravaId,
            updated_at: new Date().toISOString(),
          }),
        });

        if (!upsertRes.ok) {
          const text = await upsertRes.text();
          errors.push(`${stravaId}: ${upsertRes.status} ${text.substring(0, 200)}`);
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
        const upsertRes = await fetch(`${supabaseUrl}/rest/v1/sessions?on_conflict=user_id,record_id`, {
          method: "POST",
          headers: {
            apikey: serviceKey,
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify({ user_id, record_id: recordId, data, updated_at: new Date().toISOString() }),
        });
        if (!upsertRes.ok) {
          const text = await upsertRes.text();
          errors.push(`${stravaId} (${modality}): ${upsertRes.status} ${text.substring(0, 200)}`);
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
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
