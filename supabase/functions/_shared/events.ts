// La bitácora de webhooks: abrir y cerrar una fila de `integration_events`.
//
// C-22 (auditoría 2026-09-09). `whoop-webhook` y `withings-webhook` tenían la misma función
// `closeEvent` BYTE A BYTE y el mismo bloque de alta deduplicada. Dos copias de una regla de
// idempotencia es la peor clase de duplicado: se arregla una, la otra sigue mintiendo, y el
// síntoma (un sueño sincronizado dos veces, una pesada que no entra) aparece días después.
//
// C-12 (auditoría 2026-09-09) — LOS HUÉRFANOS. El evento se inserta `received` ANTES de
// procesar, porque hay que responder 2xx antes de trabajar. Si la instancia muere durante el
// `waitUntil` (deploy, OOM, timeout del isolate), la fila se queda en `received` para siempre:
//
//   · El proveedor reintenta → el `insert … ignoreDuplicates` lo trata como duplicado y
//     responde 200 sin hacer NADA. El reintento, que era justo la segunda oportunidad, se
//     convierte en el mecanismo que garantiza que el dato no entre nunca.
//   · El GC a 60 días la borra sin haberla procesado. Nadie mira, nadie se entera.
//
// El arreglo tiene dos mitades y las dos hacen falta:
//   1. **En la base** (`integration_events_requeue_orphans`, migración 20260910): un job cada
//      30 minutos marca `received` de más de 30 minutos como `error`. Eso los saca del limbo.
//   2. **Aquí**: cuando el alta choca con un duplicado cuya fila está en `error`, se REABRE y
//      se procesa. Un `error` es un evento que no llegó a completarse; el reintento del
//      proveedor (o el siguiente aviso con el mismo trace) es la ocasión de arreglarlo.
//      `processed` e `ignored` no se tocan (ya se hizo) y `received` tampoco (o hay otra
//      instancia trabajando, o el job de huérfanos aún no ha pasado).
//
// El reclamo de la reapertura es un UPDATE condicionado a `status = 'error'`: dos reintentos
// simultáneos no pueden reabrir la misma fila y disparar dos syncs del mismo dato.

import { clip } from "./http.ts";
import type { Supa } from "./tokens.ts";

export const TABLE_EVENTS = "integration_events";

export type EventStatus = "processed" | "ignored" | "error";

export interface NewEvent {
  provider: string;
  type: string;
  external_user_id: string | null;
  external_id: string | null;
  trace_id: string;
  payload: unknown;
}

export interface OpenEventResult {
  /** Id de la fila que hay que procesar, o `null` si no hay nada que hacer. */
  eventId: number | null;
  /** `true` si era un huérfano en `error` que este reintento ha reabierto. */
  reprocessed: boolean;
  /** `true` si el alta falló de verdad (el llamador responde 500). */
  failed: boolean;
}

/**
 * Alta deduplicada por `(provider, trace_id)`. Devuelve el id a procesar, o `null` cuando el
 * evento ya se recibió y no hay que repetirlo.
 */
export async function openEvent(supa: Supa, tag: string, row: NewEvent): Promise<OpenEventResult> {
  const { data: inserted, error: insErr } = await supa
    .from(TABLE_EVENTS)
    .upsert({ ...row, status: "received" }, { onConflict: "provider,trace_id", ignoreDuplicates: true })
    .select("id");
  if (insErr) {
    console.error(`[${tag}] integration_events: ${insErr.message}`);
    return { eventId: null, reprocessed: false, failed: true };
  }
  const id = inserted && inserted[0] ? Number((inserted[0] as { id: number }).id) : null;
  if (id !== null && Number.isFinite(id)) return { eventId: id, reprocessed: false, failed: false };

  // Duplicado. C-12: ¿es un huérfano que el job marcó `error`, o un reintento de algo que ya
  // se hizo? Sólo el primero merece trabajo.
  const { data: existing, error: selErr } = await supa
    .from(TABLE_EVENTS)
    .select("id,status")
    .eq("provider", row.provider)
    .eq("trace_id", row.trace_id)
    .maybeSingle();
  if (selErr || !existing) {
    if (selErr) console.warn(`[${tag}] no se pudo releer el duplicado: ${selErr.message}`);
    return { eventId: null, reprocessed: false, failed: false };
  }
  const prev = existing as { id: number; status: string };
  if (prev.status !== "error") return { eventId: null, reprocessed: false, failed: false };

  // Reclamo atómico: el `.eq("status","error")` dentro del UPDATE es lo que impide que dos
  // reintentos a la vez reabran la misma fila y sincronicen dos veces.
  const { data: claimed, error: updErr } = await supa
    .from(TABLE_EVENTS)
    .update({ status: "received", error: null, processed_at: null, payload: row.payload })
    .eq("id", prev.id)
    .eq("status", "error")
    .select("id");
  if (updErr) {
    console.warn(`[${tag}] no se pudo reabrir el evento ${prev.id}: ${updErr.message}`);
    return { eventId: null, reprocessed: false, failed: false };
  }
  if (!claimed || !claimed.length) return { eventId: null, reprocessed: false, failed: false };
  console.log(`[${tag}] reintento de un evento en error: ${prev.id} reabierto`);
  return { eventId: Number(prev.id), reprocessed: true, failed: false };
}

/** Cierra la fila. Nunca lanza: un fallo aquí no puede tumbar un sync que ya salió bien. */
export async function closeEvent(
  supa: Supa,
  tag: string,
  eventId: number,
  status: EventStatus,
  error: string | null,
): Promise<void> {
  const { error: err } = await supa
    .from(TABLE_EVENTS)
    .update({ status, processed_at: new Date().toISOString(), error: error ? clip(error, 400) : null })
    .eq("id", eventId);
  if (err) console.warn(`[${tag}] no se pudo cerrar el evento ${eventId}: ${err.message}`);
}
