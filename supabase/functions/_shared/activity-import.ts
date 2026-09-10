// Escritura de actividades importadas en `runs` y `sessions`. Una sola vez, para las DOS vías
// (Strava y intervals.icu): la clasificación pura vive en `cardio-types.ts`, aquí sólo está el
// merge contra la base.
//
// POR QUÉ ESTE MÓDULO Y NO UNA COPIA EN CADA FUNCIÓN. `strava-sync` e `intervals-sync` traen la
// misma clase de objeto (los dos proveedores hablan el vocabulario de tipos de Strava, porque
// intervals.icu lo importa de allí) y lo escriben en las mismas dos tablas con las mismas
// reglas. Es exactamente el duplicado que C-22 quitó de los webhooks: dos copias de una regla
// de merge son la peor clase de duplicado, porque se arregla una y la otra sigue mintiendo
// durante semanas.
//
// DOS DECISIONES QUE SE PAGAN SI SE CAMBIAN:
//
//   1. **`merge_generic_row`, no un upsert que reemplaza.** El upsert de PostgREST sustituye la
//      columna `data` entera, así que borraría la sensación (`feel`) que el usuario haya
//      escrito sobre una carrera importada y cualquier campo que aportara el otro importador.
//      Con `data || patch` cada escritor aporta sus claves y no toca las demás — la misma regla
//      que ya usan `wellness` y `bodyweight`.
//
//   2. **Conflicto por `(user_id, record_id)`.** `strava-sync` usaba
//      `on_conflict=user_id,source,source_id`, que apunta a `runs_source_id_idx`... un índice
//      único PARCIAL (`where source is not null`). Postgres NO infiere un índice parcial desde
//      un `ON CONFLICT (cols)` sin repetir su predicado, así que TODOS los upserts de carreras
//      de Strava fallaban con `42P10: there is no unique or exclusion constraint matching the
//      ON CONFLICT specification` — comprobado contra la base el 2026-09-10, donde no hay una
//      sola fila de `runs` con `source = 'strava'`. El fallo iba al array `errors[]` de la
//      respuesta, que nadie mira, y el contador `synced` se quedaba en 0: la función respondía
//      200 y "0 carreras" para siempre. `record_id` es una clave real (`runs_user_id_record_id_key`).

import { buildRunRow, buildSessionRow, normalizeActivity } from "./cardio-types.ts";
import type { Supa } from "./tokens.ts";

export interface ImportOptions {
  /** Valor de `data.source`: `'strava'` o `'intervals.icu'`. */
  source: string;
  /** Prefijo del `record_id`: `'strava_'` o `'icu_'`. */
  idPrefix: string;
}

export interface ImportResult {
  runs: number;
  sessions: number;
  total: number;
  dates: string[];
  /** modalidad → cuántas entraron. */
  kept: Record<string, number>;
  /** tipo crudo → cuántas se descartaron. Un descarte SILENCIOSO es lo que escondió VirtualSki. */
  skipped: Record<string, number>;
  errors: string[];
}

async function mergeRow(
  supa: Supa,
  table: "runs" | "sessions",
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
 * Clasifica y escribe. Las carreras van a `runs` (esa tabla es la dueña de distancia, ritmo y
 * GAP, y el historial de carrera lee de ella); el resto del cardio va a `sessions`, el sobre
 * unificado. La fuerza se queda FUERA a propósito: duplicaría las sesiones de gimnasio que se
 * registran a mano en la app.
 *
 * Un error por actividad no tumba el resto: se apunta en `errors` y se sigue. La alternativa
 * (propagar) haría que una sola fila mal formada dejara sin importar el resto de la semana.
 */
export async function importActivities(
  supa: Supa,
  userId: string,
  activities: unknown[],
  opts: ImportOptions,
): Promise<ImportResult> {
  const now = Date.now();
  const out: ImportResult = {
    runs: 0,
    sessions: 0,
    total: Array.isArray(activities) ? activities.length : 0,
    dates: [],
    kept: {},
    skipped: {},
    errors: [],
  };
  const seenDates = new Set<string>();

  for (const raw of Array.isArray(activities) ? activities : []) {
    const a = (raw || {}) as Record<string, unknown>;
    const n = normalizeActivity(a, opts.idPrefix);
    if (!n) {
      const t = String(a.sport_type || a.type || a.sport || "unknown");
      out.skipped[t] = (out.skipped[t] || 0) + 1;
      continue;
    }
    out.kept[n.modality] = (out.kept[n.modality] || 0) + 1;

    try {
      if (n.isRun) {
        await mergeRow(supa, "runs", userId, n.recordId, buildRunRow(n, opts.source, now));
        out.runs++;
      } else {
        await mergeRow(supa, "sessions", userId, n.recordId, buildSessionRow(n, opts.source, now));
        out.sessions++;
      }
      seenDates.add(n.date);
    } catch (err) {
      // El id del proveedor y una etiqueta. NUNCA el texto crudo de PostgREST (C-29): nombra
      // tablas, columnas y restricciones, y eso es un oráculo de esquema para el cliente.
      console.error(`[${opts.source}] ${n.recordId}: ${err instanceof Error ? err.message : String(err)}`);
      out.errors.push(`${n.sourceId}: merge_failed`);
    }
  }

  out.dates = [...seenDates].sort();
  return out;
}
