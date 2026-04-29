import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Endpoint that accepts step counts pushed from iOS Shortcuts (or manual
// curl tests). Auth is via a shared secret env var so the iPhone Shortcut
// can call it without a Supabase user JWT. Single-user app: writes are
// always upserted under STEPS_USER_ID.
//
// Required env vars (set via Supabase dashboard → Functions → Secrets):
//   STEPS_INGEST_SECRET — random 32+ char string, also embedded in the Shortcut
//   STEPS_USER_ID       — Julian's auth.users UUID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-injected by the runtime.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { secret, date, steps, source } = body;

    const expected = Deno.env.get("STEPS_INGEST_SECRET");
    const userId = Deno.env.get("STEPS_USER_ID");
    if (!expected || !userId) {
      return json({ error: "Function not configured: missing STEPS_INGEST_SECRET or STEPS_USER_ID" }, 500);
    }
    if (secret !== expected) {
      return json({ error: "Invalid secret" }, 401);
    }
    if (!date || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ error: "Invalid date (expected YYYY-MM-DD)" }, 400);
    }
    const stepsNum = Number(steps);
    if (!Number.isFinite(stepsNum) || stepsNum < 0 || stepsNum > 200000) {
      return json({ error: "Invalid steps value" }, 400);
    }

    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { error } = await supa.from("steps").upsert({
      user_id: userId,
      record_id: date,
      data: { steps: Math.round(stepsNum), source: source || "shortcut", ts: Date.now() },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,record_id" });

    if (error) {
      return json({ error: error.message }, 500);
    }
    return json({ ok: true, date, steps: Math.round(stepsNum) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
