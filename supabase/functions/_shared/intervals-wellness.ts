// Traducción de una fila de wellness de intervals.icu a las filas de `wellness`, `bodyweight` y
// `steps`. MÓDULO PURO (sintaxis borrable, cero imports, cero globals de Deno): Node lo importa
// tal cual en `tests/verify-integrations-pure.mjs`.
//
// A-7 (2026-09-10). Esto es lo que hacía `intervalsFetchWellness()` en `app/whoop.js` con la API
// key en el navegador. La lógica se conserva; lo que cambia es QUIÉN escribe y CÓMO:
//
//   · El cliente hacía un `put` de la fila entera, así que tenía que reconstruir a mano lo que
//     ya había en el día (`_whoopMergePrevRow`) o se llevaba por delante al resto de escritores.
//     Ese merge se rompió una vez de verdad: la versión anterior conservaba por LISTA BLANCA, y
//     las claves de Withings se perdían en cada importación de intervals.icu — las filas del 7,
//     8 y 9 de septiembre llegaron a Supabase sin `weightSource` y el pack del coach contó
//     "básculas distintas" que no lo eran (D-1 de la auditoría 2026-09-09).
//   · El servidor escribe con `merge_generic_row` (`data || patch`, una sola sentencia), que ya
//     es aditivo: lo que el parche NO trae, no se toca. El problema se invierte y se vuelve
//     mucho más simple: hay que quitar del parche las claves que son de OTRO, no adivinar las
//     que hay que conservar.
//
// PRECEDENCIA (plan A.4). intervals.icu es el HISTÓRICO y lo que WHOOP no da: CTL/ATL/rampRate,
// pasos, peso suavizado, macros. Cuando la fila del día ya la escribió el servidor desde WHOOP
// (`readinessSource === 'whoop'`), la copia de recuperación y sueño de intervals.icu NO puede
// pisarla: llega horas más tarde, sin fases de sueño y sin SpO2. Y el peso de la báscula
// Withings gana siempre sobre el eco redondeado que intervals.icu devuelve al día siguiente.

// ── Claves ajenas ──────────────────────────────────────────────────────────────────────────

/**
 * Lo que es de WHOOP cuando WHOOP escribió el día. Copia de `WHOOP_OWNED_KEYS` en
 * `app/whoop.js`; `tests/verify-integrations-wiring.mjs` compara las dos listas.
 */
export const WHOOP_OWNED_KEYS = [
  "readiness",
  "hrv",
  "restingHR",
  "spO2",
  "skinTemp",
  "sleepSecs",
  "sleepInBedSecs",
  "sleepAwakeSecs",
  "sleepRemSecs",
  "sleepDeepSecs",
  "sleepLightSecs",
  "sleepScore",
  "sleepEfficiency",
  "sleepConsistency",
  "respiration",
  "sleepNeedSecs",
];

/**
 * Lo que es de la báscula cuando la báscula escribió el día (`weightSource` en el espejo de
 * `withings-sync.ts`). El eco de intervals.icu es el MISMO número, redondeado y un día tarde, y
 * sin hora ni composición: sustituirlo es perder la medida buena.
 */
export const WITHINGS_OWNED_KEYS = ["weight", "weightMeasured", "bodyFat", "weightSource"];

export function isWhoopOwnedKey(k: string): boolean {
  return WHOOP_OWNED_KEYS.indexOf(k) >= 0 || /^whoop/.test(k) || k === "readinessSource";
}

// ── Decodificación ─────────────────────────────────────────────────────────────────────────

export interface IntervalsWellnessRow {
  /** `id` de intervals.icu ES la fecha del día (`YYYY-MM-DD`). */
  id?: string;
  [k: string]: unknown;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.round(n);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Rango plausible de un peso humano en kg: fuera de él, el dato es basura, no un peso. */
function plausibleKg(v: unknown): number | null {
  const n = num(v);
  if (n === null || n <= 20 || n >= 300) return null;
  return round1(n);
}

/**
 * Los dos pesos que da intervals.icu, y NO son lo mismo:
 *   · `tempWeight` = el valor CRUDO introducido ese día. Es una medida real.
 *   · `weight`     = el valor suavizado y propagado hacia delante que intervals.icu proyecta
 *                    cuando no te pesas. Usarlo como medida produce secuencias falsas de
 *                    "estabilidad" — tres días idénticos que son una sola pesada repetida.
 */
export function decodeWeights(r: IntervalsWellnessRow): { measured: number | null; projected: number | null } {
  return { measured: plausibleKg(r.tempWeight), projected: plausibleKg(r.weight) };
}

/**
 * Parche de `wellness` con lo que trae intervals.icu, ya compactado (sin nulos).
 *
 * Los nulos se caen porque el merge es `data || patch`: un `hrv: null` en el parche no diría
 * "no tengo HRV", diría "borra el HRV que hubiera" — y el que hubiera lo puso WHOOP.
 *
 * Convención de nombres para medida contra proyección (la que lee el cron):
 *   `weight` / `restingHR`                  → el valor suavizado de intervals.icu
 *   `weightMeasured` / `restingHRMeasured`  → la medida cruda de ese día (ausente si no la hay)
 */
export function buildIntervalsWellnessPatch(r: IntervalsWellnessRow): Record<string, unknown> {
  const { measured, projected } = decodeWeights(r);
  const comments = typeof r.comments === "string" && r.comments.trim() ? r.comments.trim() : null;

  const raw: Record<string, unknown> = {
    date: String(r.id || ""),
    // Recuperación y sueño (se filtran después si el día es de WHOOP)
    readiness: int(r.readiness),
    hrv: num(r.hrv),
    hrvSDNN: num(r.hrvSDNN),
    restingHR: num(r.restingHR),
    restingHRMeasured: num(r.tempRestingHR),
    avgSleepingHR: num(r.avgSleepingHR),
    sleepSecs: num(r.sleepSecs),
    sleepScore: int(r.sleepScore),
    spO2: num(r.spO2),
    respiration: num(r.respiration),
    // Composición
    weight: projected,
    weightMeasured: measured,
    bodyFat: num(r.bodyFat),
    abdomen: num(r.abdomen),
    // Actividad
    steps: int(r.steps),
    // Carga de entrenamiento (Fitness/Fatigue/Form — el combustible de la periodización)
    ctl: num(r.ctl),
    atl: num(r.atl),
    rampRate: num(r.rampRate),
    ctlLoad: num(r.ctlLoad),
    atlLoad: num(r.atlLoad),
    // Constantes (sólo si se registran en intervals.icu)
    systolic: num(r.systolic),
    diastolic: num(r.diastolic),
    bloodGlucose: num(r.bloodGlucose),
    lactate: num(r.lactate),
    vo2max: num(r.vo2max),
    // Hidratación
    hydration: num(r.hydration),
    hydrationVolume: num(r.hydrationVolume),
    // Nutrición (normalmente null: el store `nutrition` de la app es la fuente de verdad)
    kcalConsumed: num(r.kcalConsumed),
    carbs: num(r.carbohydrates),
    protein: num(r.protein),
    fat: num(r.fatTotal),
    // Subjetivo (sólo si se rellena en intervals.icu)
    fatigue: num(r.fatigue),
    soreness: num(r.soreness),
    stress: num(r.stress),
    mood: num(r.mood),
    motivation: num(r.motivation),
    comments,
    source: "intervals.icu",
  };

  const out: Record<string, unknown> = {};
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (v === null || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/** Fila previa de `wellness`, tal como está guardada en `data`. */
export interface PrevWellnessRow {
  readinessSource?: unknown;
  weightSource?: unknown;
  [k: string]: unknown;
}

/**
 * Quita del parche lo que pertenece a otro escritor de la MISMA fila.
 *
 * Devuelve también qué se quitó: sin eso, "intervals.icu escribió 7 días" no distingue entre
 * "los 7 completos" y "los 7 sin nada porque WHOOP los tenía todos", y esa diferencia es la que
 * hace falta cuando el readiness deja de moverse.
 */
export function filterForeignKeys(
  patch: Record<string, unknown>,
  prev: PrevWellnessRow | null | undefined,
): { patch: Record<string, unknown>; dropped: string[] } {
  if (!prev) return { patch, dropped: [] };
  const whoopOwns = prev.readinessSource === "whoop";
  const withingsOwns = prev.weightSource === "withings";
  if (!whoopOwns && !withingsOwns) return { patch, dropped: [] };

  const out: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const k of Object.keys(patch)) {
    if (whoopOwns && isWhoopOwnedKey(k)) { dropped.push(k); continue; }
    if (withingsOwns && WITHINGS_OWNED_KEYS.indexOf(k) >= 0) { dropped.push(k); continue; }
    out[k] = patch[k];
  }
  return { patch: out, dropped };
}

/** ¿Queda algo además de los metadatos (`date` y `source`)? Si no, no se escribe nada. */
export function hasSignal(patch: Record<string, unknown>): boolean {
  let n = 0;
  for (const k of Object.keys(patch)) {
    if (k === "date" || k === "source") continue;
    n++;
  }
  return n > 0;
}

// ── bodyweight ─────────────────────────────────────────────────────────────────────────────

export interface BodyweightLike {
  weight?: unknown;
  measured?: unknown;
  source?: unknown;
  [k: string]: unknown;
}

export interface BodyweightDecision {
  patch: Record<string, unknown> | null;
  /** Por qué no se escribe. Va al log: un salto silencioso es indistinguible de un fallo. */
  reason: string;
  /** Peso que queda como "último conocido" del día (para las estimaciones de calorías). */
  weightUsed: number | null;
}

/**
 * ¿Se escribe el peso de intervals.icu en `bodyweight[date]`?
 *
 * Reglas, en orden:
 *   1. **La báscula Withings gana siempre.** Trae hora, composición y viene del dispositivo.
 *   2. **Una pesada a mano en la app tampoco se pisa.** Ésta es una regla MÁS ESTRICTA que la
 *      del cliente: `app/whoop.js` sólo comprobaba Withings en el camino de la medida cruda, así
 *      que un `tempWeight` de intervals.icu podía sustituir un número que el usuario había
 *      teclado en la app. Ver cambiar solo un número que escribiste es la forma más rápida de
 *      dejar de fiarte de la app (misma regla que `isManualRow` en `measures.ts`).
 *   3. **Medida cruda (`tempWeight`) → se escribe** como `measured: true`.
 *   4. **Sólo proyección (`weight`) → se escribe únicamente si CAMBIA** respecto al día
 *      anterior (≥ 0,05 kg). El forward-fill repetido crearía días de "peso estable" que en
 *      realidad son una sola pesada copiada, y la pendiente de peso del pack se vuelve mentira.
 */
export function decideBodyweightWrite(
  date: string,
  measured: number | null,
  projected: number | null,
  existing: BodyweightLike | null | undefined,
  prevDayWeight: number | null,
  now: number,
): BodyweightDecision {
  if (measured === null && projected === null) return { patch: null, reason: "sin peso", weightUsed: null };

  const existingWeight = num(existing ? existing.weight : null);
  if (existing && existing.source === "withings") {
    return { patch: null, reason: "la pesada de Withings manda", weightUsed: existingWeight };
  }
  // Fila a mano: sin `source` (la app no lo pone) y con un peso dentro.
  if (existing && !existing.source && existingWeight !== null) {
    return { patch: null, reason: "peso introducido a mano", weightUsed: existingWeight };
  }

  if (measured !== null) {
    return {
      patch: { date, weight: measured, timestamp: now, source: "intervals.icu", measured: true },
      reason: "medida cruda de intervals.icu",
      weightUsed: measured,
    };
  }

  // Sólo proyección.
  if (existing && existing.measured === true) {
    return { patch: null, reason: "ya hay una medida real ese día", weightUsed: existingWeight };
  }
  const isNewSignal = prevDayWeight === null || Math.abs((projected as number) - prevDayWeight) >= 0.05;
  if (!isNewSignal) {
    // Aun así sirve como "último peso conocido" si el día no tiene nada.
    return {
      patch: null,
      reason: "forward-fill idéntico al día anterior",
      weightUsed: existing == null ? projected : existingWeight,
    };
  }
  return {
    patch: { date, weight: projected, timestamp: now, source: "intervals.icu", measured: false },
    reason: "salto respecto al día anterior (pesada sin tempWeight)",
    weightUsed: projected,
  };
}

// ── steps ──────────────────────────────────────────────────────────────────────────────────

/** Fila de `steps`, o `null` si el día no trae pasos plausibles. */
export function buildStepsRow(r: IntervalsWellnessRow, now: number): Record<string, unknown> | null {
  const s = num(r.steps);
  if (s === null || s < 0 || s >= 200000) return null;
  return { date: String(r.id || ""), steps: Math.round(s), source: "intervals.icu", ts: now };
}
