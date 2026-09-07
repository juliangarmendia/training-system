import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { ConfigError, corsHeaders, json, readEnv } from "../_shared/http.ts";
import {
  callbackUrl,
  getAdapter,
  isProvider,
  loadTokenRow,
  serviceClient,
  TABLE_TOKENS,
} from "../_shared/tokens.ts";

// Arranque y corte del OAuth de servidor. `verify_jwt = true`: esta función SÍ necesita saber
// quién pregunta, porque la fila de `oauth_states` que crea es la que autenticará después al
// callback (que corre sin JWT porque el proveedor redirige a Safari, no a la PWA).
//
// Contrato: POST { action: 'authorize' | 'disconnect', provider: 'whoop' | 'withings' }
//   authorize  → { url }   (la PWA hace location.href = url)
//   disconnect → { ok: true, status: 'disconnected' }
//
// Aquí NUNCA sale un token en la respuesta ni en un log.

const STATE_PURGE_MS = 60 * 60 * 1000; // los intentos de más de 1 h no se van a completar

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Falta la cabecera Authorization" }, 401);

    const asUser = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Token inválido" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const provider = body?.provider;
    if (!isProvider(provider)) return json({ error: "provider inválido: whoop | withings" }, 400);

    const supa = serviceClient();
    const adapter = getAdapter(provider);

    // ── authorize ────────────────────────────────────────────────────────────────────────
    if (action === "authorize") {
      // Purga antes de insertar: sin esto la tabla acumula un intento por cada vez que alguien
      // abre el flujo y se arrepiente.
      const { error: purgeErr } = await supa
        .from("oauth_states")
        .delete()
        .lt("created_at", new Date(Date.now() - STATE_PURGE_MS).toISOString());
      if (purgeErr) console.warn(`[oauth] purga de oauth_states: ${purgeErr.message}`);

      const state = crypto.randomUUID();
      const { error: insErr } = await supa.from("oauth_states").insert({
        state,
        user_id: userId,
        provider,
        redirect_to: typeof body?.redirectTo === "string" ? body.redirectTo.slice(0, 300) : null,
      });
      if (insErr) return json({ error: `No se pudo crear el state: ${insErr.message}` }, 500);

      const url = adapter.authorizeUrl(state, callbackUrl(provider));
      console.log(`[oauth] authorize ${provider} para ${userId}`);
      return json({ url });
    }

    // ── disconnect ───────────────────────────────────────────────────────────────────────
    if (action === "disconnect") {
      const row = await loadTokenRow(supa, userId, provider);
      let revoked = false;
      if (row?.access_token) {
        // Best-effort: si el proveedor no contesta se borra igual. Un token huérfano en su lado
        // es menos malo que una fila nuestra que la PWA muestra como "Conectado".
        try {
          revoked = await adapter.revoke(row.access_token);
        } catch (err) {
          console.warn(`[oauth] revoke ${provider}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      const { error: delErr } = await supa
        .from(TABLE_TOKENS)
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider);
      if (delErr) return json({ error: `No se pudo desconectar: ${delErr.message}` }, 500);

      // El trigger de la migración deja `integration_status` en 'disconnected'.
      console.log(`[oauth] disconnect ${provider} (revoke=${revoked})`);
      return json({ ok: true, status: "disconnected", revoked });
    }

    return json({ error: "action inválida: authorize | disconnect" }, 400);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[oauth] configuración: ${err.message}`);
      return json({ error: err.message, code: "config" }, 500);
    }
    console.error(`[oauth] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
