// Volcado de WHOOP → `wellness`. La parte con red: paginar la API v2, agrupar por día y
// fusionar. La traducción a claves (lo que se puede equivocar en silencio) vive aparte, en
// `whoop-wellness.ts`, que es puro y tiene test propio.
//
// PRECEDENCIA (plan A.4). Este módulo escribe SÓLO recuperación, HRV, FC en reposo y sueño.
// `ctl`, `atl`, `rampRate`, `steps` y el peso suavizado siguen siendo de intervals.icu; el peso
// medido y la composición, de Withings. El merge es `data || patch` dentro de una sola
// sentencia SQL (`merge_generic_row`), así que el cron, el webhook y la PWA pueden escribir el
// mismo día sin pisarse: cada uno aporta sus claves.

import { clip } from "./http.ts";
import { isoDaysAgo, pickNightsByDay } from "./dates.ts";
import { markSynced, serviceClient, type Supa, withProviderFetch } from "./tokens.ts";
import { WHOOP_API_BASE } from "./whoop.ts";
import {
  buildWellnessPatch,
  dayOfCycle,
  dayOfSleep,
  type WhoopCycle,
  type WhoopRecovery,
  type WhoopSleep,
} from "./whoop-wellness.ts";

/** 25 es el MÁXIMO que acepta la API v2 (el defecto es 10); pedir más devuelve 400. */
export const PAGE_LIMIT = 25;
/** Tope de seguridad: 40 páginas × 25 = 1000 registros. Un `next_token` que nunca acaba es un bug. */
const MAX_PAGES = 40;
/** Ventana que se mira alrededor de un sueño concreto (webhook). */
const SLEEP_WINDOW_MS = 36 * 60 * 60 * 1000;

export interface SyncWindow {
  days?: number;
  start?: string;
  end?: string;
}

export interface SyncResult {
  dates: string[];
  sleeps: number;
  recoveries: number;
  cycles: number;
  skipped?: string;
}

interface WhoopPage {
  records?: unknown[];
  next_token?: string | null;
}

/** GET paginado sobre una colección v2. `withProviderFetch` se ocupa del token y del 401. */
async function fetchAll<T>(
  userId: string,
  path: string,
  start: string,
  end: string,
  supa: Supa,
  maxPages = MAX_PAGES,
): Promise<T[]> {
  const out: T[] = [];
  let nextToken: string | null = null;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${WHOOP_API_BASE}${path}`);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    url.searchParams.set("start", start);
    url.searchParams.set("end", end);
    // El parámetro de petición es `nextToken`; el de la respuesta, `next_token`. No es una
    // errata: WHOOP mezcla los dos estilos y confundirlos devuelve siempre la primera página.
    if (nextToken) url.searchParams.set("nextToken", nextToken);

    const res = await withProviderFetch("whoop", userId, url.toString(), {}, supa);
    if (res.status !== 200) {
      throw new Error(`WHOOP ${path} → ${res.status} ${clip(res.text, 200)}`);
    }
    const body = (res.json || {}) as WhoopPage;
    const records = Array.isArray(body.records) ? body.records : [];
    out.push(...(records as T[]));
    nextToken = body.next_token || null;
    if (!nextToken || !records.length) break;
  }
  return out;
}

async function getOne<T>(userId: string, path: string, supa: Supa): Promise<T | null> {
  const res = await withProviderFetch("whoop", userId, `${WHOOP_API_BASE}${path}`, {}, supa);
  if (res.status === 404) return null;
  if (res.status !== 200) throw new Error(`WHOOP ${path} → ${res.status} ${clip(res.text, 200)}`);
  return (res.json || null) as T | null;
}

/** Recuperación de un ciclo concreto. Puede venir `PENDING_SCORE` (aún sin puntuar). */
export async function fetchCycleRecovery(
  userId: string,
  cycleId: number | string,
  supa: Supa,
): Promise<WhoopRecovery | null> {
  return await getOne<WhoopRecovery>(userId, `/v2/cycle/${encodeURIComponent(String(cycleId))}/recovery`, supa);
}

/** Un recovery SCORED vale más que uno pendiente; a igualdad, el actualizado más tarde. */
function recoveryRank(r: WhoopRecovery): number {
  const scored = r.score_state === "SCORED" ? 1e15 : 0;
  const t = r.updated_at ? Date.parse(r.updated_at) : 0;
  return scored + (Number.isFinite(t) ? t : 0);
}

interface DayBucket {
  sleep?: WhoopSleep;
  recovery?: WhoopRecovery;
  cycle?: WhoopCycle;
}

/**
 * Reparte sueños, recuperaciones y ciclos por día del diario.
 *
 * · El sueño manda: día = fecha local del despertar; de varias noches que acaban el mismo día
 *   se queda la más larga (`pickNightsByDay`), y las siestas quedan fuera.
 * · Cada recuperación se ancla a SU sueño por `sleep_id`. Sólo si ese sueño no está en la
 *   ventana se cae al ciclo por `cycle_id` (fecha local del inicio del ciclo = el despertar).
 * · El ciclo aporta strain y kcal al día en que empieza.
 */
export function collectByDay(
  sleeps: WhoopSleep[],
  recoveries: WhoopRecovery[],
  cycles: WhoopCycle[],
  fallbackTz?: string,
): Record<string, DayBucket> {
  const byDay: Record<string, DayBucket> = {};
  const bucket = (d: string): DayBucket => (byDay[d] || (byDay[d] = {}));

  const nights = pickNightsByDay(sleeps.filter((s) => s && s.nap !== true), fallbackTz);
  for (const day of Object.keys(nights)) bucket(day).sleep = nights[day];

  const sleepById = new Map<string, WhoopSleep>();
  for (const s of sleeps) if (s?.id) sleepById.set(String(s.id), s);
  const cycleById = new Map<string, WhoopCycle>();
  for (const c of cycles) if (c?.id !== undefined && c?.id !== null) cycleById.set(String(c.id), c);

  for (const c of cycles) {
    const day = dayOfCycle(c, fallbackTz);
    if (!day) continue;
    const b = bucket(day);
    // Entre dos ciclos del mismo día gana el cerrado: el abierto da un strain a medias.
    if (!b.cycle || (!b.cycle.end && c.end)) b.cycle = c;
  }

  for (const r of recoveries) {
    let day: string | null = null;
    const s = r.sleep_id ? sleepById.get(String(r.sleep_id)) : undefined;
    if (s && s.nap !== true) day = dayOfSleep(s, fallbackTz);
    if (!day && r.cycle_id !== undefined && r.cycle_id !== null) {
      const c = cycleById.get(String(r.cycle_id));
      if (c) day = dayOfCycle(c, fallbackTz);
    }
    if (!day) continue;
    const b = bucket(day);
    if (!b.recovery || recoveryRank(r) > recoveryRank(b.recovery)) b.recovery = r;
    // Deliberadamente NO se copia aquí el ciclo del recovery como ciclo del día: el ciclo al
    // que pertenece una recuperación es el que TERMINA con ese sueño, y su strain es el del
    // día anterior. El strain lo asigna el bucle de ciclos por su propia fecha de inicio.
  }

  return byDay;
}

/** Claves que, por sí solas, no justifican escribir una fila. */
const BOOKKEEPING = new Set(["date", "whoopSyncedAt", "whoopCycleId", "whoopSleepId"]);

async function writeDays(
  userId: string,
  buckets: Record<string, DayBucket>,
  supa: Supa,
  now: number,
): Promise<string[]> {
  const written: string[] = [];
  for (const date of Object.keys(buckets).sort()) {
    const b = buckets[date];
    const built = buildWellnessPatch(b.sleep || null, b.recovery || null, b.cycle || null, now);
    if (!built) continue;
    const substantive = Object.keys(built.patch).some((k) => !BOOKKEEPING.has(k));
    if (!substantive) continue; // un ciclo en curso sin sueño ni recovery no aporta nada

    const { error } = await supa.rpc("merge_generic_row", {
      p_table: "wellness",
      p_user: userId,
      p_record_id: built.date,
      p_patch: built.patch,
    });
    if (error) throw new Error(`merge_generic_row(${built.date}): ${error.message}`);
    written.push(built.date);
  }
  return written;
}

/**
 * Volcado por ventana. `{days}` (por defecto 2) o `{start, end}` explícitos.
 * La ventana real es `[now − days − 1d, now]`: el día extra recoge la noche que empieza antes
 * de medianoche y los datos que WHOOP puntúa con retraso.
 */
export async function syncWhoop(
  userId: string,
  win: SyncWindow = {},
  supa: Supa = serviceClient(),
): Promise<SyncResult> {
  const now = Date.now();
  const days = Math.max(1, Math.min(60, Number(win.days) || 2));
  const start = win.start || isoDaysAgo(days + 1, now);
  const end = win.end || new Date(now).toISOString();

  // Secuencial a propósito: la primera llamada puede disparar el refresco del token y las
  // otras dos se quedarían esperando el lease sin ganar nada.
  const sleeps = await fetchAll<WhoopSleep>(userId, "/v2/activity/sleep", start, end, supa);
  const recoveries = await fetchAll<WhoopRecovery>(userId, "/v2/recovery", start, end, supa);
  const cycles = await fetchAll<WhoopCycle>(userId, "/v2/cycle", start, end, supa);

  const buckets = collectByDay(sleeps, recoveries, cycles);
  const dates = await writeDays(userId, buckets, supa, now);

  const summary: SyncResult = { dates, sleeps: sleeps.length, recoveries: recoveries.length, cycles: cycles.length };
  await markSynced(supa, userId, "whoop", { ...summary, window: { start, end } });
  console.log(`[whoop-sync] ${userId.slice(0, 8)}… ${dates.length} días (${start} → ${end})`);
  return summary;
}

/**
 * Volcado de UN sueño, para el webhook. En v2 el `id` del evento `sleep.updated` Y el del
 * `recovery.updated` son ambos el UUID del SUEÑO (cambió respecto a v1, donde el de recovery
 * era el id del ciclo). Y no existe `GET /v2/recovery/{id}`: la recuperación sólo se alcanza
 * por su ciclo.
 *
 * Camino: `GET /v2/activity/sleep/{id}` → `sleep.cycle_id` (v2 lo trae en el propio sueño) →
 * `GET /v2/cycle/{cycle_id}/recovery` (+ el ciclo, para strain y kcal). La recuperación puede
 * venir `PENDING_SCORE`: entonces se escribe sólo el sueño y el evento siguiente completa el
 * día — el merge es aditivo, así que no se pierde nada.
 */
export async function syncWhoopSleep(
  userId: string,
  sleepId: string,
  supa: Supa = serviceClient(),
): Promise<SyncResult> {
  const now = Date.now();
  const empty: SyncResult = { dates: [], sleeps: 0, recoveries: 0, cycles: 0 };

  const sleep = await getOne<WhoopSleep>(userId, `/v2/activity/sleep/${encodeURIComponent(sleepId)}`, supa);
  if (!sleep) return { ...empty, skipped: "sleep_not_found" };
  if (sleep.nap === true) return { ...empty, skipped: "nap" };
  if (!sleep.end) return { ...empty, skipped: "sleep_sin_end" };

  let cycleId: number | string | null = sleep.cycle_id ?? null;
  let cycle: WhoopCycle | null = null;

  if (cycleId === null) {
    // Respaldo si algún día el sueño llegara sin `cycle_id`: el ciclo cuyo `start` cae más
    // cerca del final del sueño.
    const endMs = Date.parse(sleep.end);
    const cycles = await fetchAll<WhoopCycle>(
      userId,
      "/v2/cycle",
      new Date(endMs - SLEEP_WINDOW_MS).toISOString(),
      new Date(Math.max(now, endMs) + 60_000).toISOString(),
      supa,
      3,
    );
    let bestDelta = Number.POSITIVE_INFINITY;
    for (const c of cycles) {
      if (!c?.start) continue;
      const d = Math.abs(Date.parse(c.start) - endMs);
      if (d < bestDelta) {
        cycle = c;
        bestDelta = d;
      }
    }
    cycleId = cycle?.id ?? null;
  } else {
    cycle = await getOne<WhoopCycle>(userId, `/v2/cycle/${encodeURIComponent(String(cycleId))}`, supa);
  }

  let recovery: WhoopRecovery | null = null;
  if (cycleId !== null) {
    recovery = await fetchCycleRecovery(userId, cycleId, supa);
    // Si la recuperación resulta ser de OTRO sueño, no es la de esta noche: fuera.
    if (recovery?.sleep_id && String(recovery.sleep_id) !== String(sleepId)) recovery = null;
  }

  const buckets = collectByDay([sleep], recovery ? [recovery] : [], cycle ? [cycle] : []);
  const dates = await writeDays(userId, buckets, supa, now);

  const summary: SyncResult = {
    dates,
    sleeps: 1,
    recoveries: recovery ? 1 : 0,
    cycles: cycle ? 1 : 0,
  };
  await markSynced(supa, userId, "whoop", { ...summary, sleepId });
  console.log(`[whoop-sync] sueño ${sleepId.slice(0, 8)}… → ${dates.join(",") || "sin día"}`);
  return summary;
}
