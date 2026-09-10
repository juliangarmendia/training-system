import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, json, timingSafeEqual } from "../_shared/http.ts";

// Endpoint that accepts step counts pushed from iOS Shortcuts (or manual
// curl tests). Auth is via a shared secret env var so the iPhone Shortcut
// can call it without a Supabase user JWT. Single-user app: writes are
// always upserted under STEPS_USER_ID.
//
// C-20 (auditoría 2026-09-09). Tres arreglos, y el primero es de seguridad:
//   · El secreto se compara con `timingSafeEqual`, no con `!==`. Un `!==` sale en el primer
//     byte distinto: quien mida el tiempo de respuesta reconstruye el secreto byte a byte, y
//     este endpoint es público (`verify_jwt = false`, lo llama un Atajo de iOS sin JWT).
//   · `corsHeaders` y `json` salen de `_shared/http.ts` en vez de estar copiados aquí. Eran
//     una tercera copia divergente (`Access-Control-Allow-Methods` distinto del resto).
//   · `await req.json().catch(() => ({}))`: un cuerpo vacío o mal formado devolvía un 500 con
//     el mensaje del parser en vez del 400 que corresponde.
//
// Required env vars (set via Supabase dashboard → Functions → Secrets):
//   STEPS_INGEST_SECRET — random 32+ char string, also embedded in the Shortcut
//   STEPS_USER_ID       — Julian's auth.users UUID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY are auto-injected by the runtime.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const secret = typeof body.secret === "string" ? body.secret : "";
    const date = body.date;
    const steps = body.steps;
    const source = body.source;

    const expected = Deno.env.get("STEPS_INGEST_SECRET");
    const userId = Deno.env.get("STEPS_USER_ID");
    if (!expected || !userId) {
      return json({ error: "Function not configured: missing STEPS_INGEST_SECRET or STEPS_USER_ID" }, 500);
    }
    if (!timingSafeEqual(secret, expected)) {
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
      data: { steps: Math.round(stepsNum), source: typeof source === "string" && source ? source : "shortcut", ts: Date.now() },
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,record_id" });

    if (error) {
      // El texto de PostgREST al log, no al cliente (C-29): es un oráculo de esquema.
      console.error(`[steps-ingest] steps upsert: ${error.message}`);
      return json({ error: "steps_upsert_failed" }, 500);
    }
    return json({ ok: true, date, steps: Math.round(stepsNum) });
  } catch (err) {
    console.error(`[steps-ingest] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: "Internal error" }, 500);
  }
});
