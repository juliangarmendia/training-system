import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { clip, corsHeaders, json, readEnvOptional, timingSafeEqual } from "../_shared/http.ts";
import { closeEvent, openEvent } from "../_shared/events.ts";
import { serviceClient, TABLE_STATUS, TABLE_TOKENS, type Supa } from "../_shared/tokens.ts";
import { syncWithings } from "../_shared/withings-sync.ts";

// Notificaciones de Withings. `verify_jwt = false`: quien llama es Withings.
//
// EL PROBLEMA: WITHINGS NO FIRMA SUS NOTIFICACIONES. No hay HMAC como en WHOOP, así que la
// URL misma tiene que ser el secreto: la suscripción registra
// `…/withings-webhook?t=<WITHINGS_WEBHOOK_TOKEN>` y aquí se exige ese token (comparado en
// tiempo constante). Sin `t` válido, 401 y no se toca la base.
//
// Segunda capa: el `userid` del cuerpo tiene que existir en `integration_tokens` como
// `external_user_id`. Si no, 200 + `ignored` — nunca un 404, que diría desde fuera qué cuentas
// de Withings están conectadas a este proyecto.
//
// `HEAD`/`GET` → 200 sin más: Withings comprueba la URL así antes de aceptar la suscripción.
// Si esto devolviera 401, `notify subscribe` fallaría con un error que no dice nada.
//
// Sólo interesa `appli = 1` (pesadas). El resto se registra como `ignored` y se responde 200,
// que es lo que Withings espera para no reintentar.

const TOLERATED_APPLI = "1";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Comprobación de la suscripción: Withings exige que la URL conteste antes de registrarla.
  if (req.method === "HEAD" || req.method === "GET") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const expected = readEnvOptional("WITHINGS_WEBHOOK_TOKEN");
    if (!expected) return json({ error: "Función sin configurar: falta WITHINGS_WEBHOOK_TOKEN" }, 500);

    const url = new URL(req.url);
    const t = url.searchParams.get("t") || "";
    if (!t || !timingSafeEqual(t, expected)) {
      console.warn("[withings-webhook] token de callback inválido");
      return json({ error: "No autorizado" }, 401);
    }

    // Withings manda `application/x-www-form-urlencoded`.
    const raw = await req.text();
    const form = new URLSearchParams(raw);
    const externalUserId = (form.get("userid") || "").trim();
    const startdate = (form.get("startdate") || "").trim();
    const enddate = (form.get("enddate") || "").trim();
    const appli = (form.get("appli") || "").trim();
    if (!externalUserId) return json({ error: "Falta userid" }, 400);

    const supa = serviceClient();
    const traceId = `${externalUserId}:${startdate}:${enddate}:${appli}`;

    // Deduplicación por (provider, trace_id): Withings reintenta. C-22: el alta compartida con
    // `whoop-webhook` (`_shared/events.ts`); C-12: un duplicado en `error` (huérfano marcado por
    // `integration_events_requeue_orphans`) se reabre y se procesa en vez de tragarse el aviso.
    const opened = await openEvent(supa, "withings-webhook", {
      provider: "withings",
      type: `notify.appli${appli || "?"}`,
      external_user_id: externalUserId,
      external_id: null,
      trace_id: traceId,
      payload: { userid: externalUserId, startdate, enddate, appli },
    });
    if (opened.failed) return json({ error: "No se pudo registrar el evento" }, 500);
    const eventId = opened.eventId;
    if (eventId === null) {
      console.log(`[withings-webhook] duplicado ${clip(traceId, 40)}`);
      return json({ ok: true, duplicate: true });
    }

    if (appli !== TOLERATED_APPLI) {
      await closeEvent(supa, "withings-webhook", eventId, "ignored", `appli no manejado: ${appli}`);
      return json({ ok: true, ignored: `appli_${appli}` });
    }

    const { data: tokenRow } = await supa
      .from(TABLE_TOKENS)
      .select("user_id")
      .eq("provider", "withings")
      .eq("external_user_id", externalUserId)
      .maybeSingle();
    const userId = tokenRow ? String((tokenRow as { user_id: string }).user_id) : null;
    if (!userId) {
      await closeEvent(supa, "withings-webhook", eventId, "ignored", "usuario de Withings desconocido");
      return json({ ok: true, ignored: "unknown_user" });
    }

    // 200 YA; el volcado va detrás.
    EdgeRuntime.waitUntil(process(supa, eventId, userId, startdate, enddate));
    return json({ ok: true, queued: traceId, reprocessed: opened.reprocessed });
  } catch (err) {
    console.error(`[withings-webhook] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: "Error interno" }, 500);
  }
});

async function process(
  supa: Supa,
  eventId: number,
  userId: string,
  startdate: string,
  enddate: string,
): Promise<void> {
  try {
    const start = Number(startdate);
    const end = Number(enddate);
    // El rango del aviso es estrecho (la pesada). Se ensancha un poco por si la báscula
    // sincroniza con retraso y la medida cae justo fuera.
    const win = Number.isFinite(start) && Number.isFinite(end) && start > 0
      ? { start: start - 3600, end: end + 3600 }
      : { days: 3 };
    const out = await syncWithings(userId, win, supa);
    await closeEvent(supa, "withings-webhook", eventId, "processed", null);
    await supa
      .from(TABLE_STATUS)
      .update({ last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", "withings");
    console.log(`[withings-webhook] → ${out.dates.join(",") || "sin día"}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[withings-webhook] falló: ${msg}`);
    await closeEvent(supa, "withings-webhook", eventId, "error", msg);
  }
}
