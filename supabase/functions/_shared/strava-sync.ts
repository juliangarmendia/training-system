// Volcado de Strava → `runs` / `sessions`. La parte con red; la clasificación pura vive en
// `cardio-types.ts` y la escritura en `activity-import.ts`, los dos con test propio.
//
// `listActivities` vive AQUÍ y no en `strava.ts` por una razón concreta: necesita
// `withProviderFetch` (la política 401 → un refresco → un reintento, que además saca el token
// de la base), y ese helper está en `tokens.ts`, que a su vez importa `strava.ts` para
// registrar el adaptador. Pedirlo desde `strava.ts` sería un ciclo de módulos con clases
// dentro — el tipo de fallo que sólo aparece en producción. Es la misma partición que
// `withings.ts` / `withings-sync.ts`.

import { clip } from "./http.ts";
import { importActivities, type ImportResult } from "./activity-import.ts";
import { markSynced, serviceClient, type Supa, withProviderFetch } from "./tokens.ts";
import { STRAVA_API_BASE } from "./strava.ts";

/** 200 es el máximo que acepta `per_page`; pedir más lo ignora y devuelve 200. */
export const PAGE_LIMIT = 200;
/** Tope de seguridad: 10 páginas × 200 = 2000 actividades. Una paginación infinita es un bug. */
const MAX_PAGES = 10;
const DEFAULT_DAYS = 30;
const MAX_DAYS = 400;

export interface StravaWindow {
  days?: number;
  /** Epoch en SEGUNDOS (el parámetro `after` de Strava es exclusivo). */
  after?: number;
  before?: number;
}

export interface StravaSyncResult extends ImportResult {
  window: { after: number; before?: number };
}

/**
 * `GET /athlete/activities` paginado. Strava pagina con `page`/`per_page` (no con cursor), así
 * que el final es "una página con menos de `per_page` elementos". Sin el tope de páginas, una
 * respuesta que devolviera siempre 200 elementos dejaría el bucle vivo hasta el límite del
 * isolate.
 */
export async function listActivities(
  userId: string,
  win: { after: number; before?: number },
  supa: Supa = serviceClient(),
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(`${STRAVA_API_BASE}/athlete/activities`);
    url.searchParams.set("after", String(win.after));
    if (win.before) url.searchParams.set("before", String(win.before));
    url.searchParams.set("page", String(page));
    url.searchParams.set("per_page", String(PAGE_LIMIT));

    const res = await withProviderFetch("strava", userId, url.toString(), {}, supa);
    if (res.status !== 200) {
      // 401 y 429/5xx ya los ha traducido `withProviderFetch`. Lo que llega aquí es un 4xx raro
      // (un 400 por parámetros, un 403 por scope insuficiente): el detalle al log, no al cliente.
      throw new Error(`Strava activities → ${res.status} ${clip(res.text, 200)}`);
    }
    const records = Array.isArray(res.json) ? (res.json as Record<string, unknown>[]) : [];
    out.push(...records);
    if (records.length < PAGE_LIMIT) break;
  }
  return out;
}

/**
 * Volcado. Dos formas de acotar:
 *   · `{days}`   — ventana de N días hacia atrás (conexión, "sincronizar ahora", cron).
 *   · `{after}`  — epoch exacto (el `since_epoch` que mandaba el cliente viejo).
 *
 * `runs`/`sessions` se escriben con el `user_id` que viene del JWT o del recorrido del cron —
 * NUNCA de un cuerpo de petición (S-1, v11.70).
 */
export async function syncStrava(
  userId: string,
  win: StravaWindow = {},
  supa: Supa = serviceClient(),
): Promise<StravaSyncResult> {
  const nowSecs = Math.floor(Date.now() / 1000);
  const days = Math.max(1, Math.min(MAX_DAYS, Number(win.days) || DEFAULT_DAYS));
  const after = Number.isFinite(Number(win.after)) && Number(win.after) > 0
    ? Math.floor(Number(win.after))
    : nowSecs - days * 86_400;
  const before = Number.isFinite(Number(win.before)) && Number(win.before) > 0
    ? Math.floor(Number(win.before))
    : undefined;

  const activities = await listActivities(userId, { after, before }, supa);
  const imported = await importActivities(supa, userId, activities, {
    source: "strava",
    idPrefix: "strava_",
  });

  const summary: StravaSyncResult = { ...imported, window: { after, before } };
  await markSynced(supa, userId, "strava", summary as unknown as Record<string, unknown>);
  console.log(
    `[strava-sync] ${userId.slice(0, 8)}… ${imported.runs} carreras + ${imported.sessions} sesiones ` +
      `de ${imported.total} actividades (desde ${new Date(after * 1000).toISOString().slice(0, 10)})`,
  );
  return summary;
}
