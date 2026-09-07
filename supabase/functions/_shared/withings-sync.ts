// Volcado de Withings → `bodyweight` (+ espejo en `wellness`). La parte con red; la
// decodificación pura vive en `measures.ts`, que Node prueba sin tocar la API.
//
// LO QUE DISTINGUE A ESTA INTEGRACIÓN DE LA DE WHOOP: aquí ya hay datos de otras fuentes en
// las mismas filas. `bodyweight[día]` puede tener un peso suavizado de intervals.icu (que la
// báscula debe sustituir) o un peso que Julian tecleó (que la báscula NO debe tocar). Toda esa
// precedencia está en `measures.ts` (`isManualRow` / `mergeBodyweight` / `buildBodyweightPatch`)
// y se prueba con fixtures; aquí sólo se lee la fila previa y se manda el delta.

import { clip } from "./http.ts";
import {
  buildBodyweightPatch,
  groupByDay,
  MEAS_TYPES,
  type BodyweightRow,
  type WithingsGroup,
} from "./measures.ts";
import { markSynced, serviceClient, type Supa, withProviderFetch } from "./tokens.ts";
import { readWithingsBody, WITHINGS_API_BASE, withingsCallbackUrl } from "./withings.ts";

/** Todo lo que la Body Smart reporta por la API: peso (1), masa libre de grasa (5), % grasa (6),
 *  masa grasa (8), pulso (11), músculo (76), agua (77), hueso (88), grasa visceral (170),
 *  metabolismo basal (226) y edad metabólica (227); 155/168/169 por si algún día hay una Body
 *  Comp/Cardio en la cuenta. Derivado de `MEAS_TYPES` para que no puedan desincronizarse. */
export const MEASTYPES = Object.keys(MEAS_TYPES).map(Number).sort((a, b) => a - b).join(",");
/** `category=1` = medidas reales (2 sería objetivos). */
const CATEGORY = "1";
const MAX_PAGES = 20;

export interface WithingsWindow {
  days?: number;
  start?: number | string;
  end?: number | string;
  /** Epoch en segundos: sólo lo modificado desde entonces (cron). */
  lastupdate?: number;
}

export interface WithingsSyncResult {
  dates: string[];
  groups: number;
  manualKept: string[];
  subscribed?: string;
}

function toEpochSecs(v: number | string | undefined, fallback: number): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Date.parse(String(v)) / 1000;
  if (!Number.isFinite(n)) return fallback;
  // Tolerancia: si viene en milisegundos, se convierte.
  return n > 1e11 ? Math.floor(n / 1000) : Math.floor(n);
}

interface MeasureBody {
  updatetime?: number;
  timezone?: string;
  measuregrps?: WithingsGroup[];
  more?: number | boolean;
  offset?: number;
}

/** `POST /measure action=getmeas`, siguiendo `more`/`offset`. */
async function getMeas(
  userId: string,
  params: Record<string, string>,
  supa: Supa,
): Promise<{ groups: WithingsGroup[]; timezone?: string }> {
  const groups: WithingsGroup[] = [];
  let timezone: string | undefined;
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const form = new URLSearchParams({
      action: "getmeas",
      meastypes: MEASTYPES,
      category: CATEGORY,
      ...params,
    });
    if (offset) form.set("offset", String(offset));

    const res = await withProviderFetch(
      "withings",
      userId,
      `${WITHINGS_API_BASE}/measure`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      },
      supa,
    );
    // El 401 de Withings viaja dentro del JSON y ya lo ha resuelto `withProviderFetch`
    // (refresco + un reintento). Aquí sólo queda clasificar el resto de estados.
    const body = readWithingsBody(res.status, (res.json || {}) as MeasureBody, "getmeas") as MeasureBody;

    if (body.timezone && !timezone) timezone = body.timezone;
    const pageGroups = Array.isArray(body.measuregrps) ? body.measuregrps : [];
    groups.push(...pageGroups);

    const more = body.more === 1 || body.more === true;
    if (!more || !pageGroups.length) break;
    offset = Number(body.offset) || 0;
    if (!offset) break;
  }

  return { groups, timezone };
}

/**
 * Volcado de pesadas. Tres formas de acotar:
 *   · `{days}`     — ventana de N días hacia atrás (conexión, "sincronizar ahora").
 *   · `{start,end}`— rango exacto (el que manda el webhook).
 *   · `{lastupdate}`— sólo lo MODIFICADO desde ese instante (más barato para el cron).
 * `lastupdate` y `startdate/enddate` son excluyentes en la API: si vienen los dos, Withings
 * ignora uno de ellos sin avisar, así que aquí se manda uno u otro.
 */
export async function syncWithings(
  userId: string,
  win: WithingsWindow = {},
  supa: Supa = serviceClient(),
): Promise<WithingsSyncResult> {
  const nowSecs = Math.floor(Date.now() / 1000);
  let params: Record<string, string>;

  if (win.lastupdate) {
    params = { lastupdate: String(toEpochSecs(win.lastupdate, nowSecs - 3 * 86400)) };
  } else if (win.start !== undefined || win.end !== undefined) {
    params = {
      startdate: String(toEpochSecs(win.start, nowSecs - 86400)),
      enddate: String(toEpochSecs(win.end, nowSecs)),
    };
  } else {
    const days = Math.max(1, Math.min(365, Number(win.days) || 3));
    params = { startdate: String(nowSecs - days * 86400), enddate: String(nowSecs) };
  }

  const { groups, timezone } = await getMeas(userId, params, supa);
  // La zona horaria del propio usuario (IANA) manda sobre `INTEGRATION_TZ`: si viaja, la
  // pesada de las 07:05 sigue siendo la de su mañana.
  const byDay = groupByDay(groups, timezone);

  const dates: string[] = [];
  const manualKept: string[] = [];

  for (const date of Object.keys(byDay).sort()) {
    const scaleRow = byDay[date];

    // Se lee la fila previa para respetar el peso manual. No es una carrera peligrosa: si
    // alguien escribe entre la lectura y el merge, el merge es aditivo y sólo se perdería el
    // `weightWithings` de esta pasada, que la siguiente vuelve a poner.
    const { data: prev } = await supa
      .from("bodyweight")
      .select("data")
      .eq("user_id", userId)
      .eq("record_id", date)
      .maybeSingle();
    const existing = (prev as { data?: BodyweightRow } | null)?.data || null;

    const built = buildBodyweightPatch(scaleRow, existing);
    if (!Object.keys(built.patch).length) continue;

    const { error } = await supa.rpc("merge_generic_row", {
      p_table: "bodyweight",
      p_user: userId,
      p_record_id: date,
      p_patch: built.patch,
    });
    if (error) throw new Error(`merge_generic_row(bodyweight ${date}): ${error.message}`);

    // Espejo en `wellness`: es de donde leen las tendencias y el facts pack.
    const mirror: Record<string, unknown> = {
      date,
      // `weightSource` dice de quién es el NÚMERO que queda, no quién hizo la escritura: si
      // el peso manual gana, decir 'withings' sería mentirle al coach.
      weightSource: built.manualKept ? "manual" : "withings",
    };
    if (typeof built.weightUsed === "number") mirror.weightMeasured = built.weightUsed;
    if (typeof scaleRow.fatPct === "number") mirror.bodyFat = scaleRow.fatPct;
    const { error: wErr } = await supa.rpc("merge_generic_row", {
      p_table: "wellness",
      p_user: userId,
      p_record_id: date,
      p_patch: mirror,
    });
    if (wErr) throw new Error(`merge_generic_row(wellness ${date}): ${wErr.message}`);

    dates.push(date);
    if (built.manualKept) manualKept.push(date);
  }

  const summary: WithingsSyncResult = { dates, groups: groups.length, manualKept };
  await markSynced(supa, userId, "withings", { ...summary, params });
  console.log(`[withings-sync] ${userId.slice(0, 8)}… ${dates.length} días (${JSON.stringify(params)})`);
  return summary;
}

/**
 * Suscripción a notificaciones (`appli=1` = pesadas). IDEMPOTENTE: repetir un `subscribe` con
 * la misma callback no crea duplicados, así que el cron la renueva a diario — Withings cancela
 * la suscripción tras 20 días de entregas fallidas y nadie se enteraría.
 *
 * Vive aquí y no en `withings.ts` para no crear un ciclo de módulos: necesita
 * `withProviderFetch`, que está en `tokens.ts`, que a su vez importa `withings.ts`.
 *
 * VERIFICAR EN PRODUCCIÓN: si Withings responde `status 342`, esta app exige firmar la
 * llamada con `signature`/`nonce`. No se implementa aún — se registra y se sigue: la
 * suscripción es un extra sobre el cron, no la vía principal.
 */
export async function subscribeWithingsNotify(
  userId: string,
  supa: Supa = serviceClient(),
): Promise<{ ok: boolean; reason?: string }> {
  const callbackUrl = withingsCallbackUrl();
  if (!callbackUrl) {
    console.warn("[withings] notify subscribe omitido: falta WITHINGS_WEBHOOK_TOKEN");
    return { ok: false, reason: "missing_webhook_token" };
  }

  const form = new URLSearchParams({
    action: "subscribe",
    callbackurl: callbackUrl,
    appli: "1",
    comment: "training-system",
  });

  const res = await withProviderFetch(
    "withings",
    userId,
    `${WITHINGS_API_BASE}/notify`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    },
    supa,
  );

  const body = (res.json || {}) as { status?: number; error?: string };
  const status = Number(body.status ?? -1);
  if (status === 0) {
    console.log("[withings] notify subscribe ok");
    return { ok: true };
  }
  if (status === 342) {
    console.error(
      "[withings] notify subscribe → 342: la app exige signature/nonce. " +
        "Las pesadas seguirán entrando por el cron diario; implementar la firma es trabajo aparte.",
    );
    return { ok: false, reason: "signature_required" };
  }
  console.warn(`[withings] notify subscribe → status ${status} ${clip(String(body.error || ""), 120)}`);
  return { ok: false, reason: `status_${status}` };
}
