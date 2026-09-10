import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ConfigError,
  corsHeaders,
  json,
  readEnv,
  ReconnectRequired,
  RefreshInProgress,
} from "../_shared/http.ts";
import { handleCronMode } from "../_shared/cron.ts";
import { serviceClient } from "../_shared/tokens.ts";
import { syncWhoop } from "../_shared/whoop-sync.ts";

// Volcado de WHOOP a `wellness`. DOS MODOS, y la diferencia importa:
//
//   · **Usuario** (la PWA pulsa "Sincronizar ahora"): JWT de Supabase, trabajo SÍNCRONO, se
//     devuelve el resultado. Julian está mirando la pantalla.
//   · **Cron** (`x-cron-secret`, A-4): recorre todos los usuarios activos, responde **202** al
//     instante y trabaja bajo `EdgeRuntime.waitUntil`. pg_net corta la conexión a los 5 s: si
//     se esperara al resultado, el job aparecería como fallido cada vez aunque el sync fuera
//     bien, y peor, se reintentaría encima del que sigue corriendo.
//
// `verify_jwt = true` en ambos: el cron manda el JWT anon (que satisface la puerta) MÁS el
// secreto compartido, comparado en tiempo constante. El JWT anon es público; el secreto no.
//
// Entorno: CRON_SECRET (modo cron), WHOOP_CLIENT_ID/SECRET y las claves de Supabase.

const MAX_DAYS = 30;
const DEFAULT_DAYS = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(MAX_DAYS, Number(body?.days) || DEFAULT_DAYS));
    const supa = serviceClient();

    // ── Modo cron ────────────────────────────────────────────────────────────────────────
    // C-22: el bloque (secreto en tiempo constante + tokens activos + 202 + waitUntil) vive en
    // `_shared/cron.ts`, compartido con `withings-sync`. Devuelve null si no es una llamada del
    // cron y entonces seguimos con el modo usuario.
    const cronRes = await handleCronMode(req, "whoop", supa, (userIds) => runForAll(userIds, days), { days });
    if (cronRes) return cronRes;

    // ── Modo usuario ─────────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Falta la cabecera Authorization" }, 401);
    const asUser = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Token inválido" }, 401);
    const userId = userData.user.id;

    try {
      const out = await syncWhoop(userId, { days }, supa);
      return json({ ok: true, ...out, status: "active" });
    } catch (err) {
      // Reconexión necesaria NO es un error de servidor: la PWA tiene que poder pintar
      // "Reconectar" sin tratar la respuesta como una caída.
      if (err instanceof ReconnectRequired) {
        console.warn(`[whoop-sync] needs_reconnect: ${err.message}`);
        return json({ ok: false, status: "needs_reconnect", error: err.message });
      }
      if (err instanceof RefreshInProgress) {
        return json({ ok: false, status: "refresh_in_progress" }, 503);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[whoop-sync] configuración: ${err.message}`);
      return json({ error: err.message, code: "config" }, 500);
    }
    console.error(`[whoop-sync] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/** Un usuario que necesita reconexión no puede tumbar el sync de los demás. */
async function runForAll(userIds: string[], days: number): Promise<void> {
  const supa = serviceClient();
  for (const userId of userIds) {
    try {
      const out = await syncWhoop(userId, { days }, supa);
      console.log(`[whoop-sync] cron ${userId.slice(0, 8)}… → ${out.dates.length} días`);
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.warn(`[whoop-sync] cron ${userId.slice(0, 8)}… falló (${name}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
