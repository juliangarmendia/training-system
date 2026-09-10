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
import { syncStrava } from "../_shared/strava-sync.ts";

// Volcado de Strava a `runs` y `sessions`. Gemela de `whoop-sync` y `withings-sync`: MISMOS DOS
// MODOS, misma forma de respuesta, mismo bloque compartido de cron.
//
//   · **Usuario** (la PWA pulsa "Sync now"): JWT de Supabase, trabajo SÍNCRONO, se devuelve el
//     resultado. Julian está mirando la pantalla.
//   · **Cron** (`x-cron-secret`): recorre los usuarios con token activo, responde **202** al
//     instante y trabaja bajo `EdgeRuntime.waitUntil`.
//
// A-7 (2026-09-10) — LO QUE CAMBIA Y POR QUÉ. Hasta v11.70 esta función era un PROXY SIN ESTADO
// y era el último sitio donde una credencial de larga vida viajaba al navegador:
//
//   · `action: 'exchange'` devolvía `access_token` + `refresh_token` a `strava-callback.html`,
//     que los guardaba en `localStorage`.
//   · `action: 'refresh'` recibía el refresh token EN EL CUERPO y devolvía el par rotado.
//     Strava rota igual que WHOOP: con dos almacenamientos (la PWA instalada y Safari, que en
//     iOS están separados) el segundo mandaba el token ya quemado y recibía
//     `{field:"refresh_token", code:"invalid"}` → "Strava se ha desconectado sola".
//   · `action: 'sync'` recibía el access token en el cuerpo. Cualquier XSS, cualquier extensión
//     y cualquier copia de seguridad del teléfono se llevaban la credencial.
//
// Ahora los tokens viven en `integration_tokens` (sólo service role), el refresco se serializa
// con el lease-lock de `_shared/tokens.ts` y **por aquí no entra ni sale un token jamás**. El
// `user_id` sale SIEMPRE del JWT (S-1, v11.70) o del recorrido del cron; el del cuerpo se ignora.
//
// `exchange` y `refresh` siguen ACEPTÁNDOSE para que la PWA sin reescribir no reviente: son
// no-ops que responden 200 con `code: 'server_oauth'`. El cliente viejo lo trata como un fallo
// transitorio (`stravaRefreshToken` sólo marca reconexión con un 401), así que no corrompe
// `localStorage` ni enciende la bandera de reconectar. La conexión de verdad se hace con
// `integrations-oauth` → `integrations-callback`.
//
// Entorno: CRON_SECRET (modo cron), STRAVA_CLIENT_ID/SECRET y las claves de Supabase.

const MAX_DAYS = 400;
const DEFAULT_DAYS = 7;

/** Las dos acciones del proxy viejo. Aceptadas, sin efecto y con un código que lo dice. */
const RETIRED_ACTIONS = ["exchange", "refresh"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const days = Math.max(1, Math.min(MAX_DAYS, Number(body?.days) || DEFAULT_DAYS));
    // `since_epoch` es el parámetro del cliente viejo (epoch en segundos). Se sigue aceptando:
    // acota mejor que `days` cuando la app sabe cuándo fue su última sincronización.
    const after = Number(body?.since_epoch) > 0 ? Math.floor(Number(body.since_epoch)) : undefined;
    const supa = serviceClient();

    // ── Acciones retiradas ───────────────────────────────────────────────────────────────
    if (RETIRED_ACTIONS.indexOf(action) >= 0) {
      console.warn(`[strava-sync] action '${action}' retirada (A-7): el OAuth vive en el servidor`);
      return json({
        ok: false,
        error: "action_retired",
        code: "server_oauth",
        hint: "Connect Strava from Settings: the server now holds the tokens.",
      });
    }

    // ── Modo cron ────────────────────────────────────────────────────────────────────────
    // C-22: el bloque (secreto en tiempo constante + tokens activos + 202 + waitUntil) vive en
    // `_shared/cron.ts`. Devuelve null si no es una llamada del cron.
    const cronRes = await handleCronMode(req, "strava", supa, (userIds) => runForAll(userIds, days), { days });
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
      const out = await syncStrava(userId, { days, after }, supa);
      return json({ ok: true, ...out, status: "active" });
    } catch (err) {
      // Reconexión necesaria NO es un error de servidor: la PWA tiene que poder pintar
      // "Reconnect" sin tratar la respuesta como una caída.
      if (err instanceof ReconnectRequired) {
        console.warn(`[strava-sync] needs_reconnect: ${err.message}`);
        return json({ ok: false, status: "needs_reconnect", error: err.message });
      }
      if (err instanceof RefreshInProgress) {
        return json({ ok: false, status: "refresh_in_progress" }, 503);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[strava-sync] configuración: ${err.message}`);
      return json({ error: err.message, code: "config" }, 500);
    }
    // C-29: el detalle al log; al cliente, una etiqueta. El cuerpo crudo de PostgREST nombra
    // tablas y restricciones, y el de Strava nombra el campo de NUESTRA configuración que falla.
    console.error(`[strava-sync] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: "strava_sync_failed" }, 500);
  }
});

/** Un usuario que necesita reconexión no puede tumbar el sync de los demás. */
async function runForAll(userIds: string[], days: number): Promise<void> {
  const supa = serviceClient();
  for (const userId of userIds) {
    try {
      const out = await syncStrava(userId, { days }, supa);
      console.log(`[strava-sync] cron ${userId.slice(0, 8)}… → ${out.runs} carreras, ${out.sessions} sesiones`);
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.warn(
        `[strava-sync] cron ${userId.slice(0, 8)}… falló (${name}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
