// Traducción de los objetos de la API v2 de WHOOP a un parche de `wellness[YYYY-MM-DD]`.
// MÓDULO PURO (mismas reglas que `dates.ts` y `measures.ts`: sintaxis borrable, imports
// relativos `.ts`, cero globals de Deno, cero fetch). Node lo importa en los tests.
//
// POR QUÉ ESTÁ SEPARADO DE `whoop-sync.ts`. Aquí vive la única parte del sync que se puede
// equivocar en silencio: qué clave se escribe, con qué unidad y en qué día. La parte de red
// (paginar, refrescar el token, reintentar) falla ruidosamente; ésta no. Separándola, un test
// de Node la ejecuta con objetos reales de WHOOP sin tocar la API.
//
// LAS CLAVES SON LAS QUE YA LEE LA PWA. `hrv`, `restingHR`, `sleepSecs`, `readiness`,
// `sleepScore`, `spO2`, `respiration` existen desde intervals.icu; escribir `hrvMs` o
// `resting_hr` sería inventar un dialecto nuevo que ningún gráfico lee. Lo que NUNCA se
// escribe desde aquí: `ctl`, `atl`, `rampRate`, `steps`, `weight`, `bodyFat`, `source`
// — ésos son de intervals.icu y de Withings, y pisarlos rompería la precedencia del plan.

import { dayOf } from "./dates.ts";

export interface WhoopSleepScore {
  stage_summary?: {
    total_in_bed_time_milli?: number;
    total_awake_time_milli?: number;
    total_no_data_time_milli?: number;
    total_light_sleep_time_milli?: number;
    total_slow_wave_sleep_time_milli?: number;
    total_rem_sleep_time_milli?: number;
    sleep_cycle_count?: number;
    disturbance_count?: number;
  };
  sleep_needed?: {
    baseline_milli?: number;
    need_from_sleep_debt_milli?: number;
    need_from_recent_strain_milli?: number;
    need_from_recent_nap_milli?: number;
  };
  respiratory_rate?: number;
  sleep_performance_percentage?: number;
  sleep_consistency_percentage?: number;
  sleep_efficiency_percentage?: number;
}

export interface WhoopSleep {
  id?: string; // v2: UUID
  cycle_id?: number; // v2 lo trae en el propio sueño: evita adivinar el ciclo por proximidad
  v1_id?: number;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  start?: string;
  end?: string;
  timezone_offset?: string | null;
  nap?: boolean;
  score_state?: string;
  score?: WhoopSleepScore | null;
}

export interface WhoopRecovery {
  cycle_id?: number;
  sleep_id?: string;
  user_id?: number;
  created_at?: string;
  updated_at?: string;
  score_state?: string;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  } | null;
}

export interface WhoopCycle {
  id?: number;
  user_id?: number;
  start?: string;
  end?: string | null;
  timezone_offset?: string | null;
  score_state?: string;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  } | null;
}

/** Las ÚNICAS claves que el servidor escribe en `wellness`. El test las comprueba una a una. */
export const WELLNESS_KEYS = [
  "date",
  "readiness",
  "hrv",
  "restingHR",
  "spO2",
  "skinTemp",
  "whoopCalibrating",
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
  "whoopStrain",
  "whoopKcal",
  "readinessSource",
  "whoopCycleId",
  "whoopSleepId",
  "whoopRecoveryUpdatedAt",
  "whoopSyncedAt",
] as const;

/** Claves que este módulo NO debe producir jamás (son de intervals.icu / Withings / la app). */
export const FORBIDDEN_KEYS = ["ctl", "atl", "rampRate", "steps", "weight", "bodyFat", "source"] as const;

const KJ_PER_KCAL = 4.184;

function round(n: number | undefined | null, decimals: number): number | undefined {
  if (typeof n !== "number" || !Number.isFinite(n)) return undefined;
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function secs(milli: number | undefined | null): number | undefined {
  if (typeof milli !== "number" || !Number.isFinite(milli)) return undefined;
  return Math.round(milli / 1000);
}

function put(patch: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined || value === null) return;
  patch[key] = value;
}

/** Día del diario al que pertenece un sueño: la fecha LOCAL del despertar. */
export function dayOfSleep(sleep: WhoopSleep, fallbackTz?: string): string | null {
  if (!sleep || !sleep.end) return null;
  return dayOf(sleep.end, sleep.timezone_offset, fallbackTz);
}

/** Día de un ciclo cuando no hay sueño con el que anclarlo (fecha local del inicio). */
export function dayOfCycle(cycle: WhoopCycle, fallbackTz?: string): string | null {
  if (!cycle || !cycle.start) return null;
  return dayOf(cycle.start, cycle.timezone_offset, fallbackTz);
}

export interface WellnessPatchResult {
  date: string;
  patch: Record<string, unknown>;
}

/**
 * Construye el parche de `wellness[date]` a partir de las tres piezas de WHOOP.
 * Devuelve `null` si no hay nada que atribuir a ningún día.
 *
 * Reglas que este parche encarna:
 * · La fecha sale del DESPERTAR del sueño con el offset del propio registro (no de
 *   `created_at`, que es la hora de puntuación y llega tarde cuando la correa sincroniza mal).
 * · Las siestas no escriben nada: `nap: true` no es la noche de nadie.
 * · `readiness` sólo si el recovery está SCORED. Un `PENDING_SCORE` escribe el sueño y espera:
 *   el merge es aditivo, así que el `recovery.updated` posterior completa el mismo día.
 * · `readinessSource: 'whoop'` viaja SÓLO con `readiness`. Es la bandera con la que la PWA
 *   decide no pisar el dato con el de intervals.icu; ponerla sin puntuación dejaría el día
 *   sin readiness de ninguna de las dos fuentes.
 * · El strain y las kcal sólo de un ciclo TERMINADO y SCORED: un ciclo en curso da un strain
 *   parcial que parece una jornada floja.
 */
export function buildWellnessPatch(
  sleep: WhoopSleep | null,
  recovery: WhoopRecovery | null,
  cycle: WhoopCycle | null,
  now: number = Date.now(),
  fallbackTz?: string,
): WellnessPatchResult | null {
  const usableSleep = sleep && sleep.nap !== true ? sleep : null;
  const date = (usableSleep ? dayOfSleep(usableSleep, fallbackTz) : null) ||
    (cycle ? dayOfCycle(cycle, fallbackTz) : null);
  if (!date) return null;

  const patch: Record<string, unknown> = { date, whoopSyncedAt: now };

  // ── Sueño ────────────────────────────────────────────────────────────────────────────────
  if (usableSleep) {
    put(patch, "whoopSleepId", usableSleep.id);
    const sc = usableSleep.score;
    const stages = sc?.stage_summary;
    if (stages) {
      const inBed = secs(stages.total_in_bed_time_milli);
      const awake = secs(stages.total_awake_time_milli);
      put(patch, "sleepInBedSecs", inBed);
      put(patch, "sleepAwakeSecs", awake);
      // `sleepSecs` = tiempo DORMIDO, no tiempo en cama: es lo que la señal de sueño compara
      // contra las 7 h del baseline. Mezclarlos infla el sueño medio en ~40 min.
      if (inBed !== undefined) put(patch, "sleepSecs", Math.max(0, inBed - (awake || 0)));
      put(patch, "sleepRemSecs", secs(stages.total_rem_sleep_time_milli));
      put(patch, "sleepDeepSecs", secs(stages.total_slow_wave_sleep_time_milli));
      put(patch, "sleepLightSecs", secs(stages.total_light_sleep_time_milli));
    }
    if (sc) {
      put(patch, "sleepScore", round(sc.sleep_performance_percentage, 0));
      put(patch, "sleepEfficiency", round(sc.sleep_efficiency_percentage, 1));
      put(patch, "sleepConsistency", round(sc.sleep_consistency_percentage, 0));
      put(patch, "respiration", round(sc.respiratory_rate, 2));
      const need = sc.sleep_needed;
      if (need && typeof need.baseline_milli === "number") {
        // WHOOP devuelve `need_from_recent_nap_milli` como CRÉDITO (valor negativo en su
        // propia documentación). Se resta su valor absoluto para que una siesta siempre baje
        // la necesidad, venga con el signo que venga.
        const total = (need.baseline_milli || 0) +
          (need.need_from_sleep_debt_milli || 0) +
          (need.need_from_recent_strain_milli || 0) -
          Math.abs(need.need_from_recent_nap_milli || 0);
        put(patch, "sleepNeedSecs", secs(Math.max(0, total)));
      }
    }
  }

  // ── Recuperación ─────────────────────────────────────────────────────────────────────────
  if (recovery) {
    put(patch, "whoopCycleId", recovery.cycle_id);
    if (!patch.whoopSleepId) put(patch, "whoopSleepId", recovery.sleep_id);
    const rs = recovery.score;
    if (recovery.score_state === "SCORED" && rs && typeof rs.recovery_score === "number") {
      put(patch, "readiness", round(rs.recovery_score, 0));
      put(patch, "readinessSource", "whoop");
      put(patch, "hrv", round(rs.hrv_rmssd_milli, 2));
      put(patch, "restingHR", round(rs.resting_heart_rate, 0));
      put(patch, "spO2", round(rs.spo2_percentage, 1));
      put(patch, "skinTemp", round(rs.skin_temp_celsius, 1));
      if (typeof rs.user_calibrating === "boolean") put(patch, "whoopCalibrating", rs.user_calibrating);
      put(patch, "whoopRecoveryUpdatedAt", recovery.updated_at);
    }
  }

  // ── Ciclo (strain y gasto) ───────────────────────────────────────────────────────────────
  if (cycle) {
    if (!patch.whoopCycleId) put(patch, "whoopCycleId", cycle.id);
    const cs = cycle.score;
    // Sólo un ciclo CERRADO (`end`) y SCORED: el de hoy va a medias y su strain parece bajo.
    if (cycle.end && cycle.score_state === "SCORED" && cs) {
      put(patch, "whoopStrain", round(cs.strain, 2));
      if (typeof cs.kilojoule === "number") put(patch, "whoopKcal", Math.round(cs.kilojoule / KJ_PER_KCAL));
    }
  }

  return { date, patch };
}
