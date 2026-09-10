// Volcado de intervals.icu → `wellness`, `bodyweight`, `steps`, `runs` y `sessions`.
// La parte con red y con base; la traducción pura vive en `intervals-wellness.ts` y en
// `cardio-types.ts`, las dos con test propio.
//
// A-7 (2026-09-10). Esto es lo que hacía el NAVEGADOR: `intervalsFetchWellness()` en
// `app/whoop.js` e `intervalsIcuSync()` en `app/app.js`, los dos con la API key en
// `state.settings`. Además de sacar la credencial del teléfono, moverlo al servidor arregla dos
// cosas que no se podían arreglar en el cliente:
//
//   · **Los datos entran sin abrir la app.** El pull de intervals.icu sólo ocurría en `init()`:
//     tres días sin abrir la PWA eran tres días sin CTL/ATL, sin pasos y sin peso suavizado en
//     Supabase — justo los días que el cron semanal del coach necesita para razonar.
//   · **El merge deja de ser una reconstrucción.** El cliente hacía `put` de la fila entera y
//     tenía que volver a meter a mano lo que hubieran escrito WHOOP, Withings y el check-in
//     (`_whoopMergePrevRow`); esa lista blanca ya se dejó fuera las claves de Withings una vez
//     (D-1). Aquí se escribe con `merge_generic_row`, que es aditivo por construcción.
//
// SIN WEBHOOK. intervals.icu no ofrece notificaciones push, así que la única vía es el cron
// (`intervals-sync-daily`) más el botón "Sync now". Por eso NO se toca `integration_events`:
// esa bitácora es de webhooks, y una fila `received` que nadie va a cerrar sería un huérfano
// permanente para el job de C-12.

import { clip, maskSecret } from "./http.ts";
import { dayOf } from "./dates.ts";
import { importActivities, type ImportResult } from "./activity-import.ts";
import {
  getExternalUserId,
  loadTokenRow,
  markSynced,
  serviceClient,
  type Supa,
  withProviderFetch,
} from "./tokens.ts";
import { ATHLETE_ID_RE, INTERVALS_API_BASE } from "./intervals.ts";
import {
  buildIntervalsWellnessPatch,
  buildStepsRow,
  decideBodyweightWrite,
  decodeWeights,
  filterForeignKeys,
  hasSignal,
  type BodyweightLike,
  type IntervalsWellnessRow,
  type PrevWellnessRow,
} from "./intervals-wellness.ts";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 365;

export interface IntervalsWindow {
  days?: number;
  /** `YYYY-MM-DD` exactos; ganan sobre `days`. */
  oldest?: string;
  newest?: string;
  /** ¿Traer también actividades? Por defecto sí (es la vía de cardio de los COROS). */
  activities?: boolean;
}

export interface IntervalsSyncResult {
  /** Días de `wellness` escritos. */
  dates: string[];
  rows: number;
  wellnessWrites: number;
  weightWrites: number;
  stepsWrites: number;
  /** Claves que se dejaron fuera por pertenecer a WHOOP o a Withings, por si el readiness "no se mueve". */
  deferred: Record<string, number>;
  activities?: ImportResult;
  window: { oldest: string; newest: string };
}

/** `YYYY-MM-DD` local (zona del propio usuario vía `INTEGRATION_TZ`, no UTC). */
function localDay(offsetDays = 0): string {
  return dayOf(Date.now() - offsetDays * 86_400_000);
}

/** El día anterior a `date`, sin pasar por UTC (mediodía local − 1 día, como en la app). */
function previousDay(date: string): string {
  const t = Date.parse(`${date}T12:00:00Z`);
  if (!Number.isFinite(t)) return date;
  const d = new Date(t - 86_400_000);
  return d.toISOString().slice(0, 10);
}

function resolveWindow(win: IntervalsWindow): { oldest: string; newest: string } {
  const days = Math.max(1, Math.min(MAX_DAYS, Number(win.days) || DEFAULT_DAYS));
  const oldest = win.oldest && /^\d{4}-\d{2}-\d{2}$/.test(win.oldest) ? win.oldest : localDay(days);
  const newest = win.newest && /^\d{4}-\d{2}-\d{2}$/.test(win.newest) ? win.newest : localDay(0);
  return { oldest, newest };
}

/** El id de atleta guardado. Sin él no se puede construir una sola URL de la API. */
async function athleteIdOf(supa: Supa, userId: string): Promise<string> {
  const id = await getExternalUserId(supa, "intervals", userId);
  if (!id || !ATHLETE_ID_RE.test(id)) {
    throw new Error("intervals.icu: no hay id de atleta guardado (volver a guardar la API key)");
  }
  return id;
}

async function getJsonArray(
  userId: string,
  url: string,
  supa: Supa,
  what: string,
): Promise<Record<string, unknown>[]> {
  const res = await withProviderFetch("intervals", userId, url, {}, supa);
  if (res.status !== 200) {
    // 401/403 (credencial rechazada), 429 y 5xx los ha traducido ya `withProviderFetch`.
    throw new Error(`intervals.icu ${what} → ${res.status} ${clip(res.text, 200)}`);
  }
  if (!Array.isArray(res.json)) {
    // Una respuesta con otra forma es un cambio de API, no un día sin datos: se dice.
    throw new Error(`intervals.icu ${what}: la respuesta no es un array`);
  }
  return res.json as Record<string, unknown>[];
}

export async function fetchWellness(
  userId: string,
  win: { oldest: string; newest: string },
  supa: Supa = serviceClient(),
): Promise<IntervalsWellnessRow[]> {
  const athlete = await athleteIdOf(supa, userId);
  const url = `${INTERVALS_API_BASE}/athlete/${encodeURIComponent(athlete)}/wellness` +
    `?oldest=${win.oldest}&newest=${win.newest}`;
  return await getJsonArray(userId, url, supa, "wellness") as IntervalsWellnessRow[];
}

export async function fetchActivities(
  userId: string,
  win: { oldest: string; newest: string },
  supa: Supa = serviceClient(),
): Promise<Record<string, unknown>[]> {
  const athlete = await athleteIdOf(supa, userId);
  const url = `${INTERVALS_API_BASE}/athlete/${encodeURIComponent(athlete)}/activities` +
    `?oldest=${win.oldest}&newest=${win.newest}`;
  return await getJsonArray(userId, url, supa, "activities");
}

/** Lee de golpe las filas que hacen falta de una tabla genérica. Devuelve record_id → data. */
async function readRows(
  supa: Supa,
  table: string,
  userId: string,
  recordIds: string[],
): Promise<Record<string, Record<string, unknown>>> {
  const out: Record<string, Record<string, unknown>> = {};
  if (!recordIds.length) return out;
  // UNA consulta y no una por día: 90 días de backfill eran 180 lecturas en serie dentro de un
  // isolate con presupuesto de segundos, y el cron va detrás de otros dos syncs.
  const { data, error } = await supa
    .from(table)
    .select("record_id,data")
    .eq("user_id", userId)
    .in("record_id", recordIds);
  if (error) throw new Error(`${table} select: ${error.message}`);
  for (const row of (data || []) as { record_id: string; data: Record<string, unknown> }[]) {
    out[row.record_id] = row.data || {};
  }
  return out;
}

async function mergeRow(
  supa: Supa,
  table: string,
  userId: string,
  recordId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await supa.rpc("merge_generic_row", {
    p_table: table,
    p_user: userId,
    p_record_id: recordId,
    p_patch: patch,
  });
  if (error) throw new Error(`merge_generic_row(${table} ${recordId}): ${error.message}`);
}

/**
 * Volcado completo. `wellness` siempre; actividades salvo que se pidan explícitamente fuera.
 *
 * El `user_id` viene del JWT (modo usuario) o del recorrido de tokens activos (modo cron).
 * NUNCA de un cuerpo de petición.
 */
export async function syncIntervals(
  userId: string,
  win: IntervalsWindow = {},
  supa: Supa = serviceClient(),
): Promise<IntervalsSyncResult> {
  // `range`, no `window`: sombrear un global con un const es legal pero es la clase de
  // detalle que confunde en una revisión rápida.
  const range = resolveWindow(win);
  const rows = await fetchWellness(userId, range, supa);
  const now = Date.now();

  const dates = rows
    .map((r) => String(r.id || ""))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();

  // Las filas previas, de una vez. Para el peso hace falta además el día ANTERIOR al primero:
  // la regla del forward-fill compara con él.
  const bwIds = dates.slice();
  if (dates.length) bwIds.push(previousDay(dates[0]));
  const prevWellness = await readRows(supa, "wellness", userId, dates);
  const prevBodyweight = await readRows(supa, "bodyweight", userId, bwIds);

  const written: string[] = [];
  const deferred: Record<string, number> = {};
  let wellnessWrites = 0;
  let weightWrites = 0;
  let stepsWrites = 0;

  for (const r of rows) {
    const date = String(r.id || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    // ── wellness ────────────────────────────────────────────────────────────────────────
    const built = buildIntervalsWellnessPatch(r);
    const { patch, dropped } = filterForeignKeys(built, prevWellness[date] as PrevWellnessRow);
    for (const k of dropped) deferred[k] = (deferred[k] || 0) + 1;
    if (hasSignal(patch)) {
      patch.ts = now;
      await mergeRow(supa, "wellness", userId, date, patch);
      wellnessWrites++;
      written.push(date);
    }

    // ── bodyweight ──────────────────────────────────────────────────────────────────────
    const { measured, projected } = decodeWeights(r);
    const prevDay = prevBodyweight[previousDay(date)] as BodyweightLike | undefined;
    const prevDayWeight = prevDay && typeof prevDay.weight === "number" ? prevDay.weight : null;
    const decision = decideBodyweightWrite(
      date,
      measured,
      projected,
      prevBodyweight[date] as BodyweightLike | undefined,
      prevDayWeight,
      now,
    );
    if (decision.patch) {
      await mergeRow(supa, "bodyweight", userId, date, decision.patch);
      weightWrites++;
      // La fila recién escrita es el "día anterior" del día siguiente del bucle.
      prevBodyweight[date] = decision.patch;
    }

    // ── steps ───────────────────────────────────────────────────────────────────────────
    const steps = buildStepsRow(r, now);
    if (steps) {
      await mergeRow(supa, "steps", userId, date, steps);
      stepsWrites++;
    }
  }

  // ── actividades ───────────────────────────────────────────────────────────────────────
  let activities: ImportResult | undefined;
  if (win.activities !== false) {
    const list = await fetchActivities(userId, range, supa);
    activities = await importActivities(supa, userId, list, {
      source: "intervals.icu",
      idPrefix: "icu_",
    });
  }

  const summary: IntervalsSyncResult = {
    dates: [...new Set(written)].sort(),
    rows: rows.length,
    wellnessWrites,
    weightWrites,
    stepsWrites,
    deferred,
    activities,
    window: range,
  };
  await markSynced(supa, userId, "intervals", summary as unknown as Record<string, unknown>);
  console.log(
    `[intervals-sync] ${userId.slice(0, 8)}… ${wellnessWrites} wellness, ${weightWrites} peso, ` +
      `${stepsWrites} pasos, ${activities ? `${activities.runs}+${activities.sessions} actividades` : "sin actividades"} ` +
      `(${range.oldest} → ${range.newest})`,
  );
  return summary;
}

/**
 * Los campos de FRECUENCIA CARDIACA del atleta, para que el cliente siga derivando sus zonas
 * sin tener la clave.
 *
 * POR QUÉ ESTO EXISTE. `fetchIntervalsIcuZones()` en app.js lee `sportSettings[]` de
 * intervals.icu y de ahí saca las bandas de zona 1-5 (con tres caminos: umbrales absolutos en
 * bpm, % de LTHR o % de FC máxima, y una heurística para distinguirlos). Ese cálculo es del
 * cliente y ahí se queda — moverlo al servidor sería reescribir un algoritmo probado por el
 * gusto de moverlo. Lo único que el cliente pierde al quedarse sin la clave es la LLAMADA, y
 * eso es lo que devuelve esta función: los campos crudos, tal cual, sin interpretar.
 *
 * Se devuelve una forma RECORTADA y no el JSON entero del atleta: la respuesta completa trae
 * nombre, correo y ajustes que nadie de este lado necesita, y reenviarla sin mirar es cómo un
 * endpoint se convierte en un proxy de datos personales por accidente.
 */
export interface IntervalsZoneFields {
  athleteId: string;
  lthr: number | null;
  maxHr: number | null;
  hrZones: number[] | null;
  sportSettings: { types: unknown[]; lthr: unknown; max_hr: unknown; hr_zones: unknown }[];
}

export async function athleteZones(
  userId: string,
  supa: Supa = serviceClient(),
): Promise<IntervalsZoneFields> {
  const athlete = await athleteIdOf(supa, userId);
  const res = await withProviderFetch(
    "intervals",
    userId,
    `${INTERVALS_API_BASE}/athlete/${encodeURIComponent(athlete)}`,
    {},
    supa,
  );
  if (res.status !== 200) throw new Error(`intervals.icu athlete → ${res.status} ${clip(res.text, 160)}`);
  const a = (res.json || {}) as Record<string, unknown>;
  const settings = Array.isArray(a.sportSettings) ? (a.sportSettings as Record<string, unknown>[]) : [];
  const numOrNull = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const zones = Array.isArray(a.icu_hr_zones) ? (a.icu_hr_zones as unknown[]).map(Number).filter(Number.isFinite) : null;
  return {
    athleteId: athlete,
    lthr: numOrNull(a.icu_lthr ?? a.lthr),
    maxHr: numOrNull(a.icu_max_hr ?? a.max_hr),
    hrZones: zones && zones.length ? zones : null,
    sportSettings: settings.map((s) => ({
      types: Array.isArray(s.types) ? s.types : [],
      lthr: s.lthr ?? null,
      max_hr: s.max_hr ?? null,
      hr_zones: Array.isArray(s.hr_zones) ? s.hr_zones : null,
    })),
  };
}

/** Lo ÚNICO que la app puede saber de la credencial: que existe y cuál de ellas es. */
export interface IntervalsCredentialStatus {
  status: "active" | "needs_reconnect" | "disconnected";
  athleteId: string | null;
  /** `••••1234`. La clave completa no sale de aquí nunca, ni en una respuesta ni en un log. */
  keyHint: string;
  lastError: string | null;
}

/**
 * Las marcas de tiempo del sync NO se devuelven aquí: viven en `integration_status`, que la PWA
 * ya lee directa con su propio RLS (`integrationsGetStatus`). Duplicarlas en esta respuesta
 * abriría dos fuentes para el mismo dato y una de las dos acabaría mintiendo.
 */
/** Forma inválida en lo que manda el cliente: 400, no 500, y sin tocar la credencial. */
export class PushBadRequest extends Error {
  constructor(message: string) { super(message); this.name = "PushBadRequest"; }
}

/**
 * Empuja eventos ya construidos al calendario de intervals.icu (y de ahí al COROS).
 *
 * POR QUÉ ES UN PROXY Y NO UN GENERADOR. La semana de carrera se arma en el cliente a partir del
 * plan activo, de `weekTemplate[dow].cardio` que escribe el coach y de la regla de fase, y el DSL
 * de cada sesión se manda VERBATIM porque un bloque de trote/caminata no se puede aplanar a
 * "35m Z2" sin perder la prescripción. Reconstruir todo eso aquí sería una segunda
 * implementación de la semana de carrera, que es el fallo que este repo ya pagó una vez (L-1:
 * dos contadores de volumen). Lo ÚNICO que el cliente pierde al quedarse sin la clave es la
 * llamada HTTP, así que eso es lo que se mueve: la validación de forma es de aquí, la decisión
 * de qué entrenar sigue siendo del cliente.
 *
 * Idempotente por `external_id` (prefijo `pwa-`), como el push que hacía la app: la misma semana
 * empujada dos veces actualiza los mismos eventos en vez de duplicarlos.
 */
export const PUSH_MAX_EVENTS = 24;
const PUSH_CATEGORIES = new Set(["WORKOUT", "NOTE", "RACE_A", "RACE_B", "RACE_C"]);
const PUSH_EXTERNAL_ID = /^pwa-[A-Za-z0-9._:-]{1,60}$/;
const PUSH_LOCAL_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;
const PUSH_MAX_NAME = 120;
const PUSH_MAX_TYPE = 24;
const PUSH_MAX_DESC = 4000;

export interface PushResult {
  pushed: number;
  dropped: string[];
}

export async function pushEvents(
  userId: string,
  events: unknown,
  supa: Supa = serviceClient(),
): Promise<PushResult> {
  if (!Array.isArray(events) || !events.length) throw new PushBadRequest("events: se esperaba una lista no vacía");
  if (events.length > PUSH_MAX_EVENTS) throw new PushBadRequest(`events: ${events.length} supera el máximo de ${PUSH_MAX_EVENTS}`);

  const dropped: string[] = [];
  const clean: Record<string, unknown>[] = [];
  for (const raw of events) {
    const e = (raw || {}) as Record<string, unknown>;
    const id = String(e.external_id ?? "");
    // El prefijo `pwa-` acota lo que esta función puede tocar: un `external_id` ajeno podría
    // sobreescribir un evento que Julian creó a mano en intervals.icu.
    if (!PUSH_EXTERNAL_ID.test(id)) { dropped.push(`external_id inválido: ${clip(id, 40) || "(vacío)"}`); continue; }
    const start = String(e.start_date_local ?? "");
    if (!PUSH_LOCAL_DATE.test(start)) { dropped.push(`${id}: start_date_local inválido`); continue; }
    const category = String(e.category ?? "WORKOUT");
    if (!PUSH_CATEGORIES.has(category)) { dropped.push(`${id}: category ${clip(category, 20)}`); continue; }
    clean.push({
      external_id: id,
      start_date_local: start,
      category,
      name: clip(String(e.name ?? "Programmed session"), PUSH_MAX_NAME),
      type: clip(String(e.type ?? "Run"), PUSH_MAX_TYPE),
      description: clip(String(e.description ?? ""), PUSH_MAX_DESC),
    });
  }
  if (!clean.length) throw new PushBadRequest(`ningún evento válido (${dropped.length} descartados)`);

  const athlete = await athleteIdOf(supa, userId);
  const res = await withProviderFetch(
    "intervals",
    userId,
    `${INTERVALS_API_BASE}/athlete/${encodeURIComponent(athlete)}/events/bulk?upsert=true`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(clean) },
    supa,
  );
  // El cuerpo crudo de intervals.icu al log, nunca al cliente (C-29): nombra campos de NUESTRA
  // configuración cuando algo va mal.
  if (res.status >= 400) {
    console.error(`[intervals] events/bulk → ${res.status} ${clip(res.text, 400)}`);
    throw new Error(`intervals.icu rejected the push (${res.status})`);
  }
  return { pushed: clean.length, dropped };
}

export async function credentialStatus(supa: Supa, userId: string): Promise<IntervalsCredentialStatus> {
  const row = await loadTokenRow(supa, userId, "intervals");
  if (!row) return { status: "disconnected", athleteId: null, keyHint: "", lastError: null };
  return {
    status: row.status === "needs_reconnect" ? "needs_reconnect" : "active",
    athleteId: row.external_user_id,
    keyHint: maskSecret(row.access_token),
    lastError: row.last_error,
  };
}
