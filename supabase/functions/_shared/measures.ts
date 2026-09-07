// Decodificación de las medidas de Withings. MÓDULO PURO (mismas reglas que `dates.ts`:
// sintaxis borrable, import relativo `.ts`, cero globals de Deno — Node lo importa en los tests).
//
// Withings no devuelve kilos: devuelve `{value, unit}` con `real = value × 10^unit`
// (`{value: 84350, unit: -3}` = 84,350 kg). Un `unit` ignorado convierte 84 kg en 84.350 kg y
// la pendiente de peso del facts pack se vuelve basura, así que la decodificación vive en un
// módulo con test propio.

import { dayOf } from "./dates.ts";

export interface WithingsMeasure {
  value: number;
  type: number;
  unit: number;
  algo?: number;
  fm?: number;
}

export interface WithingsGroup {
  grpid?: number;
  attrib?: number;
  date?: number; // epoch en SEGUNDOS
  created?: number;
  category?: number;
  measures?: WithingsMeasure[];
}

export interface BodyweightRow {
  date: string;
  weight?: number;
  measured?: boolean;
  source?: string;
  timestamp?: number;
  fatPct?: number;
  bfPct?: number;
  fatMassKg?: number;
  ffmKg?: number;
  muscleKg?: number;
  waterKg?: number;
  boneKg?: number;
  heartRateBpm?: number;
  visceralFat?: number;
  bmrKcal?: number;
  metabolicAge?: number;
  extracellularWaterKg?: number;
  intracellularWaterKg?: number;
  vascularAge?: number;
  weightWithings?: number;
  withingsTimestamp?: number;
  withingsGrpId?: number;
  withingsN?: number;
  [k: string]: unknown;
}

/** meastype → clave de la fila de `bodyweight`. Códigos de la API `getmeas` de Withings
 *  (verificados contra el enum MeasurementType de aiowithings, 2026-09-08). La Body Smart
 *  reporta, además de la composición clásica, pulso en pie (11), grasa visceral (170, índice
 *  sin unidad), metabolismo basal (226, kcal/día) y edad metabólica (227, años). 168/169 y 155
 *  son de Body Comp/Cardio: si no llegan, no pasa nada; si llegan, se guardan. */
export const MEAS_TYPES: Record<number, string> = {
  1: "weight", // kg
  5: "ffmKg", // masa libre de grasa
  6: "fatPct", // % de grasa
  8: "fatMassKg", // masa grasa
  11: "heartRateBpm", // pulso medido en la báscula (de pie, en reposo)
  76: "muscleKg",
  77: "waterKg",
  88: "boneKg",
  155: "vascularAge", // Body Cardio
  168: "extracellularWaterKg",
  169: "intracellularWaterKg",
  170: "visceralFat", // índice 1-30 de Withings, sin unidad
  226: "bmrKcal", // metabolismo basal estimado por la báscula (kcal/día)
  227: "metabolicAge", // años
};

/** Claves de composición que un dato de báscula aporta a una pesada manual del mismo día. */
export const COMPOSITION_KEYS = [
  "fatPct",
  "bfPct",
  "fatMassKg",
  "ffmKg",
  "muscleKg",
  "waterKg",
  "boneKg",
  "heartRateBpm",
  "visceralFat",
  "bmrKcal",
  "metabolicAge",
  "extracellularWaterKg",
  "intracellularWaterKg",
  "vascularAge",
] as const;

/** `value × 10^unit`, redondeado a 3 decimales para no arrastrar el ruido del binario. */
export function decodeMeasure(m: { value: number; unit: number }): number {
  const raw = Number(m.value) * Math.pow(10, Number(m.unit));
  return Math.round(raw * 1000) / 1000;
}

/**
 * Una fila de `bodyweight` por día local.
 *
 * · `attrib === 1` fuera: "medida no atribuida al usuario". En una Body+ compartida es
 *   literalmente otra persona; sin este filtro el peso de la casa entra en la tendencia.
 * · Varias pesadas el mismo día → la MÁS TEMPRANA para todos los valores (la de ayunas es la
 *   comparable día a día), y `withingsN` cuenta cuántas hubo.
 */
export function groupByDay(
  measuregrps: WithingsGroup[] | null | undefined,
  tz?: string,
): Record<string, BodyweightRow> {
  const byDay: Record<string, WithingsGroup[]> = {};
  for (const g of measuregrps || []) {
    if (!g || typeof g.date !== "number") continue;
    if (g.attrib === 1) continue; // no atribuida: otra persona en la misma báscula
    const day = dayOf(g.date * 1000, null, tz);
    (byDay[day] || (byDay[day] = [])).push(g);
  }

  const out: Record<string, BodyweightRow> = {};
  for (const day of Object.keys(byDay)) {
    const groups = byDay[day].slice().sort((a, b) => (a.date || 0) - (b.date || 0));
    const first = groups[0];
    const row: BodyweightRow = {
      date: day,
      measured: true,
      source: "withings",
      timestamp: (first.date || 0) * 1000,
      withingsN: groups.length,
    };
    if (typeof first.grpid === "number") row.withingsGrpId = first.grpid;
    for (const m of first.measures || []) {
      const key = MEAS_TYPES[Number(m.type)];
      if (!key) continue;
      row[key] = decodeMeasure(m);
    }
    // `bfPct` es la clave que ya leen `nutFfmKg` y la tarjeta de cintura: el % de la báscula
    // sustituye al estimado Navy del día, pero las medidas de cinta se conservan aparte.
    if (typeof row.fatPct === "number") row.bfPct = row.fatPct;
    out[day] = row;
  }
  return out;
}

/**
 * ¿Escribió Julian este peso a mano?
 *
 * Las filas de `bodyweight` vienen de tres sitios y sólo una de las tres manda sobre la
 * báscula:
 *   · `logBodyWeight()` escribe `{date, weight, timestamp}` — SIN `source`: es a mano.
 *   · El formulario de composición escribe `{...fila previa, measured:true, …}`, así que puede
 *     ARRASTRAR el `source:'intervals.icu'` del día. También es a mano (él tecleó ese peso).
 *   · intervals.icu escribe `{source:'intervals.icu', measured:false}` — es el peso suavizado
 *     con forward-fill, no una pesada: la báscula lo sustituye sin pensarlo.
 * De ahí la regla: manual = no es de Withings Y (no tiene `source` O está marcada `measured`).
 */
export function isManualRow(row: BodyweightRow | null | undefined): boolean {
  if (!row) return false;
  if (row.source === "withings") return false;
  return !row.source || row.measured === true;
}

/**
 * Fusión con lo que ya hay en `bodyweight[date]`.
 *
 * El peso MANUAL gana y la báscula añade su propio peso como `weightWithings` más toda la
 * composición, que la pesada manual no tiene. Sin esta regla, sincronizar la báscula pisa en
 * silencio un dato que el usuario introdujo a propósito — y ver cambiar solo un número que
 * tecleaste es la forma más rápida de dejar de fiarte de la app.
 */
export function mergeBodyweight(
  manualRow: BodyweightRow | null | undefined,
  withingsRow: BodyweightRow,
): BodyweightRow {
  if (!withingsRow) return (manualRow || null) as BodyweightRow;
  if (!manualRow) return { ...withingsRow };

  // Ni Withings previo ni pesada a mano (p. ej. el forward-fill de intervals): se reemplaza.
  if (!isManualRow(manualRow)) return { ...manualRow, ...withingsRow };

  // Fila manual SIN peso (sólo cintura, por ejemplo): no hay nada que preservar, la báscula
  // aporta el número y las medidas de cinta se conservan por el spread.
  if (typeof manualRow.weight !== "number") return { ...manualRow, ...withingsRow };

  const merged: BodyweightRow = { ...manualRow };
  merged.weight = manualRow.weight; // explícito: el manual manda
  if (typeof withingsRow.weight === "number") merged.weightWithings = withingsRow.weight;
  if (typeof withingsRow.timestamp === "number") merged.withingsTimestamp = withingsRow.timestamp;
  if (typeof withingsRow.withingsGrpId === "number") merged.withingsGrpId = withingsRow.withingsGrpId;
  if (typeof withingsRow.withingsN === "number") merged.withingsN = withingsRow.withingsN;
  for (const k of COMPOSITION_KEYS) {
    const v = withingsRow[k];
    if (typeof v === "number") merged[k] = v;
  }
  return merged;
}

export interface BodyweightPatchResult {
  /** Lo que se manda a `merge_generic_row('bodyweight', …)`: SÓLO lo que cambia. */
  patch: BodyweightRow;
  /** El peso que queda en la fila (el manual si ganó, el de la báscula si no). */
  weightUsed?: number;
  /** true si se conservó un peso escrito a mano. */
  manualKept: boolean;
}

/**
 * Parche de `bodyweight[date]` a partir de la lectura de la báscula y de lo que ya había.
 *
 * Devuelve el DELTA, no la fila entera: el merge en SQL es `data || patch`, así que mandar
 * claves que no cambian sólo hace ruido en `updated_at` y en el sync de la PWA.
 */
export function buildBodyweightPatch(
  withingsRow: BodyweightRow,
  existingRow: BodyweightRow | null | undefined,
): BodyweightPatchResult {
  const merged = mergeBodyweight(existingRow, withingsRow);
  const manualKept = isManualRow(existingRow) && typeof existingRow?.weight === "number";

  const patch: BodyweightRow = { date: merged.date };
  for (const k of Object.keys(merged)) {
    const v = merged[k];
    if (v === undefined || v === null) continue;
    if (existingRow && JSON.stringify(existingRow[k]) === JSON.stringify(v)) continue;
    patch[k] = v;
  }
  return { patch, weightUsed: typeof merged.weight === "number" ? merged.weight : undefined, manualKept };
}
