import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ConfigError,
  corsHeaders,
  json,
  readEnv,
  readEnvOptional,
  ReconnectRequired,
  RefreshInProgress,
  timingSafeEqual,
} from "../_shared/http.ts";
import { serviceClient, TABLE_TOKENS } from "../_shared/tokens.ts";
import { subscribeWithingsNotify, syncWithings } from "../_shared/withings-sync.ts";

// Gemela de `whoop-sync`: mismos dos modos, misma forma de respuesta. La PWA llama a las dos
// con `{days, mode:'sync'}` y espera lo mismo, así que cualquier divergencia aquí se convierte
// en un `if (provider === 'withings')` en el cliente.
//
//   · **Usuario** (JWT de la PWA): síncrono, devuelve el resultado.
//   · **Cron** (`x-cron-secret`): todos los usuarios activos, 202 inmediato + `waitUntil`.
//
// `resubscribe: true` renueva la suscripción de notificaciones antes de sincronizar. Withings
// la cancela tras 20 días de entregas fallidas y no avisa: renovarla a diario es una línea.

const MAX_DAYS = 365;
const DEFAULT_DAYS = 3;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.max(1, Math.min(MAX_DAYS, Number(body?.days) || DEFAULT_DAYS));
    const resubscribe = body?.resubscribe === true;
    const supa = serviceClient();

    // ── Modo cron ────────────────────────────────────────────────────────────────────────
    const cronHeader = req.headers.get("x-cron-secret");
    if (cronHeader) {
      const expected = readEnvOptional("CRON_SECRET");
      if (!expected) return json({ error: "Función sin configurar: falta CRON_SECRET" }, 500);
      if (!timingSafeEqual(cronHeader, expected)) {
        console.warn("[withings-sync] x-cron-secret inválido");
        return json({ error: "Secreto de cron inválido" }, 401);
      }

      const { data: rows, error } = await supa
        .from(TABLE_TOKENS)
        .select("user_id")
        .eq("provider", "withings")
        .eq("status", "active");
      if (error) return json({ error: `integration_tokens: ${error.message}` }, 500);
      const userIds = (rows || []).map((r) => String((r as { user_id: string }).user_id));

      EdgeRuntime.waitUntil(runForAll(userIds, days, resubscribe));
      return json({ ok: true, mode: "cron", users: userIds.length, days, resubscribe }, 202);
    }

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
      let subscribed: string | undefined;
      if (resubscribe) {
        const sub = await subscribeWithingsNotify(userId, supa);
        subscribed = sub.ok ? "ok" : sub.reason || "fallo";
      }
      const out = await syncWithings(userId, { days }, supa);
      return json({ ok: true, ...out, subscribed, status: "active" });
    } catch (err) {
      if (err instanceof ReconnectRequired) {
        console.warn(`[withings-sync] needs_reconnect: ${err.message}`);
        return json({ ok: false, status: "needs_reconnect", error: err.message });
      }
      if (err instanceof RefreshInProgress) {
        return json({ ok: false, status: "refresh_in_progress" }, 503);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[withings-sync] configuración: ${err.message}`);
      return json({ error: err.message, code: "config" }, 500);
    }
    console.error(`[withings-sync] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

async function runForAll(userIds: string[], days: number, resubscribe: boolean): Promise<void> {
  const supa = serviceClient();
  for (const userId of userIds) {
    try {
      if (resubscribe) await subscribeWithingsNotify(userId, supa);
      const out = await syncWithings(userId, { days }, supa);
      console.log(`[withings-sync] cron ${userId.slice(0, 8)}… → ${out.dates.length} días`);
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.warn(
        `[withings-sync] cron ${userId.slice(0, 8)}… falló (${name}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
