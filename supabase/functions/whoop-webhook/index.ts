import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { clip, corsHeaders, hmacBase64, json, readEnvOptional, timingSafeEqual } from "../_shared/http.ts";
import { serviceClient, TABLE_STATUS, TABLE_TOKENS, type Supa } from "../_shared/tokens.ts";
import { syncWhoopSleep } from "../_shared/whoop-sync.ts";

// Webhook de WHOOP. `verify_jwt = false`: quien llama es WHOOP, no un usuario.
//
// LA AUTENTICACIÓN ES LA FIRMA, y hay que calcularla sobre el cuerpo CRUDO:
//   firma = base64( HMAC_SHA256( client_secret, X-WHOOP-Signature-Timestamp + cuerpo ) )
// Parsear el JSON y volver a serializarlo cambia un byte (orden de claves, espacios) y la
// firma deja de cuadrar para siempre. Por eso se lee `req.text()` una sola vez y se compara
// ANTES de tocar el contenido.
//
// El timestamp va en MILISEGUNDOS y se exige ±5 min: sin esa ventana, quien capture una
// petición válida puede repetirla mañana. La comparación de la firma es en tiempo constante.
//
// SE RESPONDE 200 ENSEGUIDA y el trabajo va bajo `waitUntil`: WHOOP reintenta cinco veces en
// una hora si tardamos o fallamos, y cada reintento sería otro sync completo del mismo sueño.
// La deduplicación real la da el índice único `(provider, trace_id)` de `integration_events`.
//
// Entorno: WHOOP_CLIENT_SECRET (la misma que firma el OAuth) + claves de Supabase.

const MAX_BODY_BYTES = 16 * 1024;
const TOLERANCE_MS = 5 * 60 * 1000;
const SIG_HEADER = "X-WHOOP-Signature";
const TS_HEADER = "X-WHOOP-Signature-Timestamp";

/** Tipos que sí traen datos nuevos. En v2 su `id` es el UUID del SUEÑO en ambos casos. */
const HANDLED = new Set(["sleep.updated", "recovery.updated"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  // Algunas comprobaciones del panel hacen un GET/HEAD antes de dar la URL por buena.
  if (req.method === "GET" || req.method === "HEAD") return new Response("ok", { status: 200 });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const secret = readEnvOptional("WHOOP_CLIENT_SECRET");
    if (!secret) return json({ error: "Función sin configurar: falta WHOOP_CLIENT_SECRET" }, 500);

    // Tope de tamaño antes de leer nada: un cuerpo enorme no debe llegar a memoria.
    const declared = Number(req.headers.get("content-length") || "0");
    if (declared > MAX_BODY_BYTES) return json({ error: "Cuerpo demasiado grande" }, 413);

    const sig = req.headers.get(SIG_HEADER) || "";
    const ts = req.headers.get(TS_HEADER) || "";
    if (!sig || !ts) {
      console.warn("[whoop-webhook] sin cabeceras de firma");
      return json({ error: "Falta la firma" }, 401);
    }

    const tsMs = Number(ts); // WHOOP lo manda en MILISEGUNDOS
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > TOLERANCE_MS) {
      console.warn(`[whoop-webhook] timestamp fuera de ventana (${ts})`);
      return json({ error: "Firma caducada" }, 401);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return json({ error: "Cuerpo demasiado grande" }, 413);
    }

    const expected = await hmacBase64(secret, ts + raw);
    if (!timingSafeEqual(expected, sig)) {
      console.warn("[whoop-webhook] firma inválida");
      return json({ error: "Firma inválida" }, 401);
    }

    let payload: { user_id?: unknown; id?: unknown; type?: unknown; trace_id?: unknown } = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "JSON inválido" }, 400);
    }
    const type = String(payload.type || "");
    const externalUserId = payload.user_id === undefined || payload.user_id === null
      ? null
      : String(payload.user_id);
    const externalId = payload.id === undefined || payload.id === null ? null : String(payload.id);
    // v11.70 (C-9): sin `trace_id` la clave del índice único era NULL y cada uno de los cinco
    // reintentos de WHOOP era una fila y un sync distintos. Clave sintética, como hace Withings.
    const traceId = payload.trace_id
      ? String(payload.trace_id)
      : `${type}:${externalUserId}:${externalId ?? "noid"}`;
    if (!type || !externalUserId) return json({ error: "Payload incompleto" }, 400);

    const supa = serviceClient();

    // Deduplicación: `on conflict (provider, trace_id) do nothing` + `.select()`. Si vuelve
    // vacío es que ya lo habíamos recibido — WHOOP reintenta, y procesarlo dos veces
    // dispararía dos syncs del mismo sueño.
    const { data: inserted, error: insErr } = await supa
      .from("integration_events")
      .upsert(
        {
          provider: "whoop",
          type,
          external_user_id: externalUserId,
          external_id: externalId,
          trace_id: traceId,
          payload,
          status: "received",
        },
        { onConflict: "provider,trace_id", ignoreDuplicates: true },
      )
      .select("id");
    if (insErr) {
      console.error(`[whoop-webhook] integration_events: ${insErr.message}`);
      return json({ error: "No se pudo registrar el evento" }, 500);
    }
    const eventId = (inserted && inserted[0] ? (inserted[0] as { id: number }).id : null);
    if (eventId === null) {
      console.log(`[whoop-webhook] duplicado ${type} trace=${clip(traceId || "", 20)}`);
      return json({ ok: true, duplicate: true });
    }

    // ¿De quién es? Se resuelve por el id del usuario en WHOOP.
    const { data: tokenRow } = await supa
      .from(TABLE_TOKENS)
      .select("user_id")
      .eq("provider", "whoop")
      .eq("external_user_id", externalUserId)
      .maybeSingle();
    const userId = tokenRow ? String((tokenRow as { user_id: string }).user_id) : null;

    // Usuario desconocido → 200 + `ignored`. Un 404 aquí sería un oráculo: diría desde fuera
    // qué cuentas de WHOOP están conectadas a este proyecto.
    if (!userId) {
      await closeEvent(supa, eventId, "ignored", "usuario de WHOOP desconocido");
      return json({ ok: true, ignored: "unknown_user" });
    }

    if (!HANDLED.has(type) || !externalId) {
      // `workout.*` no se importa: las carreras entran por intervals.icu y duplicarlas aquí
      // rompería `runs`. `*.deleted` tampoco: no borramos días del diario por un evento.
      await closeEvent(supa, eventId, "ignored", `tipo no manejado: ${type}`);
      return json({ ok: true, ignored: type });
    }

    // 200 YA; el sync va detrás.
    EdgeRuntime.waitUntil(process(supa, eventId, userId, externalId, type));
    return json({ ok: true, queued: type });
  } catch (err) {
    console.error(`[whoop-webhook] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: "Error interno" }, 500);
  }
});

async function process(
  supa: Supa,
  eventId: number,
  userId: string,
  sleepId: string,
  type: string,
): Promise<void> {
  try {
    // En v2 el `id` de `sleep.updated` Y el de `recovery.updated` son el UUID del SUEÑO.
    const out = await syncWhoopSleep(userId, sleepId, supa);
    await closeEvent(supa, eventId, "processed", out.skipped ? `omitido: ${out.skipped}` : null);
    await supa
      .from(TABLE_STATUS)
      .update({ last_event_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", "whoop");
    console.log(`[whoop-webhook] ${type} → ${out.dates.join(",") || out.skipped || "sin día"}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[whoop-webhook] ${type} falló: ${msg}`);
    await closeEvent(supa, eventId, "error", msg);
  }
}

async function closeEvent(
  supa: Supa,
  eventId: number,
  status: "processed" | "ignored" | "error",
  error: string | null,
): Promise<void> {
  const { error: err } = await supa
    .from("integration_events")
    .update({ status, processed_at: new Date().toISOString(), error: error ? clip(error, 400) : null })
    .eq("id", eventId);
  if (err) console.warn(`[whoop-webhook] no se pudo cerrar el evento ${eventId}: ${err.message}`);
}
