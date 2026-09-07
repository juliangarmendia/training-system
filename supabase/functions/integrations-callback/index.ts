import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { ConfigError, clip, corsHeaders, readEnvOptional, redirect } from "../_shared/http.ts";
import {
  callbackUrl,
  getAdapter,
  isProvider,
  type ProviderId,
  serviceClient,
  upsertTokens,
} from "../_shared/tokens.ts";
import { syncWhoop } from "../_shared/whoop-sync.ts";

// EL CALLBACK OAUTH ATERRIZA AQUÍ, NO EN UNA PÁGINA DE LA PWA.
//
// En el iPhone la PWA instalada y Safari tienen almacenamiento separado: cuando WHOOP redirige,
// se abre Safari, donde NO hay sesión de Supabase — y donde los tokens que escribía
// `whoop-callback.html` eran invisibles para la PWA. Ésa es una de las causas probables de las
// desconexiones históricas. Withings, además, da 30 segundos para canjear el código: hacerlo
// desde el móvil, con la app arrancando, es una carrera perdida.
//
// Por eso `verify_jwt = false`: quien llega aquí es el navegador del proveedor, sin JWT. La
// AUTENTICACIÓN ES LA FILA `oauth_states`: la creó un `authorize` autenticado, lleva el user_id,
// es de un solo uso (se BORRA al canjearla, en la misma sentencia que la lee) y caduca a los
// 10 minutos. Sin fila válida no se canjea nada.
//
// Todo camino de error redirige a la app con `connect_error=<código>`; el detalle se queda en
// el log del servidor. Aquí no sale nunca un token, ni en la respuesta ni en un log.

const STATE_TTL_MS = 10 * 60 * 1000;
const DEFAULT_APP_URL = "https://juliangarmendia.github.io/training-system";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const appUrl = (readEnvOptional("APP_URL", DEFAULT_APP_URL) || DEFAULT_APP_URL).replace(/\/+$/, "");
  const fail = (code: string) => redirect(`${appUrl}/index.html#settings?connect_error=${code}`);

  let provider: ProviderId | null = null;
  try {
    const url = new URL(req.url);

    // Proveedor por segmento de ruta (`/integrations-callback/whoop`), con `?provider=` de
    // respaldo por si el gateway de Supabase no enrutara la sub-ruta.
    const segs = url.pathname.split("/").filter(Boolean);
    const i = segs.indexOf("integrations-callback");
    const fromPath = i >= 0 ? segs[i + 1] : undefined;
    const candidate = fromPath || url.searchParams.get("provider") || "";
    if (!isProvider(candidate)) {
      console.warn(`[callback] proveedor irreconocible en ${url.pathname}`);
      return fail("provider");
    }
    provider = candidate;

    if (req.method !== "GET" && req.method !== "HEAD") return fail("method");

    // El usuario pulsó "Cancelar" en el panel del proveedor.
    const providerError = url.searchParams.get("error");
    if (providerError) {
      console.warn(`[callback] ${provider} devolvió error=${clip(providerError, 80)}`);
      return fail("denied");
    }

    const state = url.searchParams.get("state") || "";
    const code = url.searchParams.get("code") || "";
    if (!state) return fail("state");
    if (!code) return fail("code");

    const supa = serviceClient();

    // (1) UN SOLO USO: el DELETE … RETURNING lee y consume la fila en la misma sentencia. Si se
    // comprobara primero y se borrara después, dos redirecciones simultáneas del proveedor
    // canjearían el mismo state.
    const { data: states, error: stateErr } = await supa
      .from("oauth_states")
      .delete()
      .eq("state", state)
      .eq("provider", provider)
      .gt("created_at", new Date(Date.now() - STATE_TTL_MS).toISOString())
      .select("user_id");
    if (stateErr) {
      console.warn(`[callback] ${provider} state inválido: ${stateErr.message}`);
      return fail("state");
    }
    const userId = states?.[0]?.user_id as string | undefined;
    if (!userId) {
      console.warn(`[callback] ${provider}: state no encontrado, caducado o ya usado`);
      return fail("state");
    }

    // (2) Canje en SERVIDOR.
    const adapter = getAdapter(provider);
    const tokens = await adapter.exchange(code, callbackUrl(provider));

    // Sin refresh token no hay integración persistente: es exactamente el fallo viejo (WHOOP
    // sin scope `offline` caduca en una hora). Mejor fallar visible al conectar que "conectar"
    // y desconectarse solo esa tarde.
    if (!tokens.refresh_token) {
      console.error(`[callback] ${provider}: la respuesta no trae refresh_token (¿falta el scope offline?)`);
      return fail("no_refresh_token");
    }

    // (3) Id del usuario en el proveedor: es la clave por la que llegan los webhooks.
    let externalUserId = tokens.external_user_id || null;
    if (!externalUserId) {
      externalUserId = await adapter.fetchExternalUserId(tokens.access_token);
    }

    // (4) Alta de los tokens (el trigger deja `integration_status` en 'active').
    await upsertTokens(supa, userId, provider, tokens, externalUserId);
    console.log(`[callback] ${provider} conectado (ext=${externalUserId ? "sí" : "no"}, scope=${tokens.scope || "?"})`);

    // (5) Withings: suscripción a notificaciones. TODO(A-5).
    if (provider === "withings") {
      const sub = await subscribeWithingsNotify(tokens.access_token);
      if (!sub.skipped) console.log(`[callback] withings notify subscribe → ${sub.ok ? "ok" : "fallo"}`);
    }

    // (6) Primer volcado en segundo plano (30 días de WHOOP; Withings en A-5).
    EdgeRuntime.waitUntil(initialSync(userId, provider));

    // (7) De vuelta a la app. En el iPhone esto abre Safari: el usuario lo cierra y la PWA
    // relee `integration_status` al volver a primer plano.
    return redirect(`${appUrl}/index.html#settings?connected=${provider}`);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[callback] configuración: ${err.message}`);
      return fail("config");
    }
    console.error(`[callback] ${provider || "?"}: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return fail("server");
  }
});

// ── Stubs cableados (se rellenan en los incrementos siguientes) ─────────────────────────────

/**
 * TODO(A-5): `POST wbsapi.withings.net/notify action=subscribe&callbackurl=…&appli=1`.
 * Se deja CABLEADO y no pendiente de recordar: cuando A-5 rellene el cuerpo, la suscripción
 * ocurre en la conexión, que es el único momento en que seguro hay un token recién emitido.
 */
async function subscribeWithingsNotify(_accessToken: string): Promise<{ ok: boolean; skipped: boolean }> {
  await Promise.resolve();
  return { ok: false, skipped: true };
}

/**
 * Primer volcado tras conectar: 30 días de historia de WHOOP. Va bajo `waitUntil` porque
 * tarda varios segundos (tres colecciones paginadas) y el usuario está esperando una
 * redirección, no un JSON. Si falla, no rompe la conexión: los tokens ya están guardados y
 * el cron de A-4 recogerá los datos en la siguiente pasada.
 * TODO(A-5): el equivalente de Withings (`syncWithings(userId, {days:90})`).
 */
async function initialSync(userId: string, provider: ProviderId): Promise<void> {
  if (provider !== "whoop") {
    console.log(`[callback] initialSync de ${provider} pendiente — lo rellena A-5`);
    return;
  }
  try {
    const out = await syncWhoop(userId, { days: 30 });
    console.log(`[callback] initialSync whoop → ${out.dates.length} días`);
  } catch (err) {
    console.error(`[callback] initialSync whoop falló: ${err instanceof Error ? err.message : String(err)}`);
  }
}
