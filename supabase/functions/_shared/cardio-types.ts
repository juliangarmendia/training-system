// Tipos de actividad → modalidad de la app, y la construcción de las filas de `runs` y
// `sessions`. MÓDULO PURO (mismas reglas que `dates.ts` y `measures.ts`: sintaxis borrable,
// cero imports, cero globals de Deno — Node lo importa tal cual en los tests).
//
// POR QUÉ ESTE FICHERO EXISTE (C-7, auditoría 2026-09-09, cerrado en A-7). El mismo mapa vivía
// en TRES sitios: `app/app.js` (importación por intervals.icu), `strava-sync/index.ts`
// (importación por Strava) y, a partir de A-7, también la importación por intervals.icu del
// servidor. Un "keep in sync" a mano ya se había roto de las dos formas posibles, cada una
// silenciosa a su manera:
//
//   · Faltaba `VirtualSki` en el servidor (el tipo que intervals.icu y Strava usan para el
//     SkiErg de Concept2 desde el 2025-10-10): toda sesión de SkiErg importada se descartaba
//     sin ruido, en el contador `skipped` que nadie mira.
//   · Sobraban `Walk`/`Hike`. La app NO los importa por decisión de Julian (2026-08-18): un
//     paseo de 15 min al trabajo no es entrenamiento y ensuciaba el historial. Por la vía de
//     Strava SÍ entraban, así que el mismo paseo contaba o no contaba según por dónde llegase.
//     Los pasos siguen entrando por su propia vía (`steps`).
//
// Ahora hay UNA copia en el servidor y `tests/verify-strava-steps-fns.mjs` la compara con la de
// `app/app.js` extrayendo los dos literales: si divergen, falla.

// ── El mapa ────────────────────────────────────────────────────────────────────────────────
// IDÉNTICO a CARDIO_TYPE_MAP en app/app.js. intervals.icu y Strava usan los MISMOS nombres de
// tipo (los dos vienen de Strava), así que un solo mapa sirve a las dos vías de importación.
const CARDIO_TYPE_MAP: Record<string, string> = {
  Run: "run_outdoor", TrailRun: "run_outdoor",
  VirtualRun: "treadmill", Treadmill: "treadmill",
  Ride: "bike", VirtualRide: "bike", GravelRide: "bike", MountainBikeRide: "bike", EBikeRide: "bike", Handcycle: "bike",
  Rowing: "row", VirtualRow: "row", Kayaking: "row", Canoeing: "row",
  NordicSki: "ski", BackcountrySki: "ski", RollerSki: "ski", AlpineSki: "ski", VirtualSki: "ski",
  Elliptical: "elliptical", StairStepper: "elliptical",
  Swim: "swim",
};
const RUN_MODALITIES = new Set(["run_outdoor", "treadmill"]);

export { CARDIO_TYPE_MAP, RUN_MODALITIES };

/**
 * Lookup NORMALIZADO. intervals.icu muestra "Virtual Ski" con espacio en la interfaz mientras
 * la API devuelve `VirtualSki`; un espacio o un guion bajo no puede costar otra ronda de
 * sesiones descartadas en silencio. "Virtual Ski", "VirtualSki", "virtual_ski" y "VIRTUAL-SKI"
 * resuelven todas igual. Misma tabla derivada que `_CARDIO_TYPE_MAP_NORM` en app.js.
 */
const CARDIO_TYPE_MAP_NORM: Record<string, string> = {};
for (const k of Object.keys(CARDIO_TYPE_MAP)) {
  CARDIO_TYPE_MAP_NORM[k.toLowerCase().replace(/[\s_-]/g, "")] = CARDIO_TYPE_MAP[k];
}

/** Tipo crudo de la actividad, como lo dan Strava (`sport_type`/`type`) e intervals (`type`). */
export function rawActivityType(a: Record<string, unknown> | null | undefined): string {
  if (!a) return "";
  const t = a.sport_type || a.type || a.sport;
  return t === undefined || t === null ? "" : String(t);
}

/** Modalidad de la app, o `null` si el tipo no se importa (fuerza, movilidad, paseos…). */
export function activityModality(a: Record<string, unknown> | null | undefined): string | null {
  const raw = rawActivityType(a);
  if (!raw) return null;
  return CARDIO_TYPE_MAP[raw] || CARDIO_TYPE_MAP_NORM[raw.toLowerCase().replace(/[\s_-]/g, "")] || null;
}

/** Los paseos son recuperación, no una dosis de cardio — igual que `logCardio()` en la app. */
export function modalityFamily(modality: string): string {
  return modality === "walk" ? "recovery" : "cardio";
}

/**
 * Etiqueta de intensidad de intervals.icu (`icu_intensity`) → subtipo de sesión.
 * Copia de `_subtypeFromIntensity` en app.js. Strava no da intensidad: cae en `zone2` y la
 * fila se marca `subtypeInferred` para que nada trate una suposición como una medida (GEN-002).
 */
export function subtypeFromIntensity(label: unknown): string {
  const l = String(label || "").toLowerCase();
  if (!l) return "zone2";
  if (l.includes("interval") || l.includes("vo2")) return "intervals";
  if (l.includes("threshold") || l.includes("tempo")) return "threshold";
  if (l.includes("long")) return "long_easy";
  if (l.includes("z3") || l.includes("zone3") || l.includes("zone_3")) return "zone3";
  if (l.includes("recovery")) return "recovery";
  return "zone2"; // easy_run y desconocidos → zona 2
}

/**
 * `budgetWeight` y `evidenceTags` de los subtipos que la importación puede producir.
 * Subconjunto de `SESSION_TYPES` en app.js (`cardio.subtypes` + `recovery.walk`); el test
 * compara los pesos con el literal de app.js para que no puedan separarse.
 *
 * El peso importa de verdad: alimenta el presupuesto de días duros (`hard-day-budget.md`). Un
 * intervalo importado con 0,5 en vez de 2 hace que el motor crea que queda presupuesto libre.
 */
export const CARDIO_SUBTYPE_META: Record<string, { budgetWeight: number; evidenceTags: string[] }> = {
  "cardio.zone2": { budgetWeight: 0.5, evidenceTags: ["END-001", "END-005", "INT-002"] },
  "cardio.zone3": { budgetWeight: 1, evidenceTags: ["END-001"] },
  "cardio.threshold": { budgetWeight: 2, evidenceTags: ["END-001", "END-004", "BUD-001"] },
  "cardio.intervals": { budgetWeight: 2, evidenceTags: ["END-004", "END-008", "INT-001", "BUD-001"] },
  "cardio.long_easy": { budgetWeight: 1, evidenceTags: ["END-001", "END-003"] },
  "cardio.recovery": { budgetWeight: 0, evidenceTags: ["READ-007"] },
  "recovery.walk": { budgetWeight: 0, evidenceTags: [] },
};

export function subtypeMeta(family: string, subtype: string): { budgetWeight: number; evidenceTags: string[] } {
  return CARDIO_SUBTYPE_META[`${family}.${subtype}`] || { budgetWeight: 0.5, evidenceTags: [] };
}

/** `m:ss` por km. Cadena vacía si no hay ritmo calculable (0 km, 0 s). */
export function formatPace(secondsPerKm: number): string {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return "";
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ── Normalización de una actividad ─────────────────────────────────────────────────────────

export interface NormalizedActivity {
  /** `strava_123` / `icu_123`: la identidad de la fila (`record_id`). */
  recordId: string;
  /** Id en el proveedor, para la columna `source_id`. */
  sourceId: string;
  date: string;
  ts: number | null;
  modality: string;
  family: string;
  subtype: string;
  subtypeInferred: boolean;
  rawType: string;
  title: string;
  durationMin: number | null;
  distanceKm: number | null;
  paceSecPerKm: number;
  gapSecPerKm: number | null;
  avgHR: number | null;
  maxHR: number | null;
  intensityLabel: string | null;
  trainingLoad: number | null;
  decoupling: number | null;
  efficiencyFactor: number | null;
  hrZoneTimes: number[] | null;
  isRun: boolean;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Actividad cruda (Strava o intervals.icu) → forma normalizada, o `null` si no se importa.
 *
 * `idPrefix` es lo que separa las dos vías: `strava_` e `icu_`. La misma carrera de un COROS
 * puede llegar por las dos (COROS → Strava → intervals.icu), así que NO comparten `record_id`:
 * la deduplicación en lectura (`validateRunDedup` en la app) es la que decide cuál se cuenta.
 * Fundirlas aquí, con el id de Strava que intervals.icu reexporta, sonaría más limpio y
 * borraría la única evidencia de que llegaron por dos caminos.
 */
export function normalizeActivity(
  a: Record<string, unknown> | null | undefined,
  idPrefix: string,
): NormalizedActivity | null {
  if (!a) return null;
  const modality = activityModality(a);
  if (!modality) return null;

  const rawId = a.id || a.external_id || `${String(a.start_date_local || "")}_${String(a.distance || "")}`;
  const sourceId = String(rawId || "");
  if (!sourceId) return null;

  const startLocal = String(a.start_date_local || a.start_date || "");
  const date = startLocal.split("T")[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const distanceRaw = num(a.distance);
  const distanceKm = distanceRaw !== null && distanceRaw > 0 ? round2(distanceRaw / 1000) : null;
  // `moving_time` es el que Strava e intervals.icu devuelven; `elapsed_time` es el respaldo que
  // usa la app para intervals (una sesión de fuerza en cinta puede no traer moving_time).
  const movingSec = num(a.moving_time) ?? num(a.elapsed_time) ?? 0;
  const durationMin = movingSec > 0 ? Math.round(movingSec / 60) : null;
  const paceSecPerKm = distanceKm && distanceKm > 0 ? movingSec / distanceKm : 0;

  const family = modalityFamily(modality);
  const intensityLabel = typeof a.icu_intensity === "string" && a.icu_intensity ? a.icu_intensity : null;
  const subtype = family === "recovery" ? "walk" : subtypeFromIntensity(intensityLabel);

  const zonesA = Array.isArray(a.icu_hr_zone_times) ? (a.icu_hr_zone_times as number[]) : null;
  const zonesB = Array.isArray(a.icu_zone_times) ? (a.icu_zone_times as number[]) : null;

  return {
    recordId: `${idPrefix}${sourceId}`,
    sourceId,
    date,
    ts: Date.parse(startLocal) || null,
    modality,
    family,
    subtype,
    // El subtipo es INFERIDO siempre que el proveedor no dé etiqueta de intensidad. Strava no
    // la da nunca; intervals.icu, sólo si el análisis la ha puesto.
    subtypeInferred: !intensityLabel,
    rawType: rawActivityType(a) || "unknown",
    title: String(a.name || `${modality} ${subtype}`),
    durationMin,
    distanceKm,
    paceSecPerKm,
    gapSecPerKm: num(a.gap),
    avgHR: num(a.average_heartrate) !== null ? Math.round(num(a.average_heartrate) as number) : null,
    maxHR: num(a.max_heartrate) !== null ? Math.round(num(a.max_heartrate) as number) : null,
    intensityLabel,
    trainingLoad: num(a.icu_training_load),
    decoupling: num(a.decoupling),
    efficiencyFactor: num(a.icu_efficiency),
    hrZoneTimes: zonesA || zonesB,
    isRun: RUN_MODALITIES.has(modality),
  };
}

/**
 * Quita las claves con valor null/undefined. LA RAZÓN NO ES COSMÉTICA.
 *
 * El servidor escribe estas filas con `merge_generic_row`, que hace `data || patch` dentro de
 * una sola sentencia: el parche SÓLO pisa las claves que trae. Un `avgHR: null` en el parche NO
 * es "no tengo pulso", es "borra el pulso que hubiera" — y con dos importadores para la misma
 * carrera (Strava e intervals.icu traen la misma sesión de un COROS por caminos distintos) el
 * segundo en pasar borraría lo que aportó el primero. Compactar convierte el merge en
 * verdaderamente aditivo.
 */
function compact(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) {
    const v = row[k];
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Fila de `runs.data`. Misma forma que la que escribe la app (app.js `intervalsIcuSync`).
 *
 * NO se escriben `feel` ni ningún campo del usuario: son suyos. La app deja teclear una
 * sensación sobre una carrera importada, y con `feel: null` en el parche la importación
 * siguiente la borraría — un número que el usuario escribió desapareciendo solo.
 */
export function buildRunRow(n: NormalizedActivity, source: string, now: number): Record<string, unknown> {
  return compact({
    id: n.recordId,
    date: n.date,
    distance: n.distanceKm,
    duration: n.durationMin,
    avgHR: n.avgHR,
    maxHR: n.maxHR,
    avgPace: formatPace(n.paceSecPerKm) || null,
    // `notes` en `runs` es el NOMBRE de la actividad en el proveedor, no una nota del usuario
    // (así lo escribe la app: `notes: String(a.name || '')`).
    notes: n.title,
    source,
    source_id: n.sourceId,
    // D1 (v11.9): campos aditivos y tolerantes a nulos que alimentan los motores de cardio y
    // del presupuesto de días duros. Strava no da ninguno; intervals.icu, los que tenga.
    sport: n.rawType,
    intensityLabel: n.intensityLabel,
    trainingLoad: n.trainingLoad,
    decoupling: n.decoupling,
    efficiencyFactor: n.efficiencyFactor,
    hrZoneTimes: n.hrZoneTimes,
    gapPace: n.gapSecPerKm ? formatPace(n.gapSecPerKm) : null,
    _updated_at: now,
  });
}

/**
 * Fila de `sessions.data` (el sobre unificado T1: family/subtype/modality).
 *
 * `perceivedEffort` y `notes` NO se escriben, por lo mismo que `feel` en `runs`.
 */
export function buildSessionRow(n: NormalizedActivity, source: string, now: number): Record<string, unknown> {
  const meta = subtypeMeta(n.family, n.subtype);
  return compact({
    id: n.recordId,
    date: n.date,
    ts: n.ts,
    family: n.family,
    subtype: n.subtype,
    sessionType: `${n.family}.${n.subtype}`,
    modality: n.modality,
    title: n.title,
    durationMin: n.durationMin,
    distance: n.distanceKm,
    avgHR: n.avgHR,
    maxHR: n.maxHR,
    evidenceTags: meta.evidenceTags,
    budgetWeight: meta.budgetWeight,
    trainingLoad: n.trainingLoad,
    intensityLabel: n.intensityLabel,
    subtypeInferred: n.subtypeInferred,
    sport: n.rawType,
    source,
    source_id: n.sourceId,
    _updated_at: now,
  });
}
