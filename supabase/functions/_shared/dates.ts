// Atribución de fecha para los datos de los proveedores. MÓDULO PURO.
//
// POR QUÉ ES PURO Y SIN GLOBALS DE DENO EN EL TOP LEVEL. Estas funciones deciden a qué día del
// diario va cada noche de sueño, y equivocarse desplaza una semana entera de tendencias. Se
// prueban con `node tests/verify-integrations-pure.mjs`, que importa este `.ts` directamente
// (Node 25 borra los tipos sin build), así que aquí no puede haber `enum`, `namespace`,
// parámetros-propiedad, imports `jsr:`/`npm:` ni ningún acceso a `Deno` al cargar el módulo.
// La variable de entorno se lee PEREZOSAMENTE dentro de una función y detrás de un guard.
//
// LA REGLA. El día de un dato de WHOOP es la fecha LOCAL DEL DESPERTAR (`sleep.end`) con el
// `timezone_offset` que el propio proveedor adjunta al registro — no `created_at` (hora de
// puntuación: si la correa sincroniza a mediodía, el recovery se apuntaría al día siguiente) y
// no una constante de zona horaria (rompe en los cambios de hora y en cada viaje).

const DEFAULT_TZ = "Europe/Madrid";

export interface SleepLike {
  id?: string | number;
  start?: string;
  end?: string;
  nap?: boolean;
  timezone_offset?: string | null;
}

/** Zona horaria de respaldo: `INTEGRATION_TZ` si existe, `Europe/Madrid` si no. */
export function integrationTz(): string {
  const g = globalThis as { Deno?: { env?: { get(k: string): string | undefined } } };
  try {
    // Guard: en Node (tests) `Deno` no existe y esto devuelve el valor por defecto.
    const v = typeof g.Deno !== "undefined" ? g.Deno?.env?.get("INTEGRATION_TZ") : undefined;
    return v || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

/**
 * Minutos de un offset tipo `'+02:00' | '-05:00' | '+0200' | '+02' | 'Z'`.
 * Devuelve `null` si no hay offset utilizable (entonces se usa la zona de respaldo).
 */
export function parseOffsetMinutes(offset?: string | null): number | null {
  if (offset === null || offset === undefined) return null;
  const raw = String(offset).trim();
  if (!raw) return null;
  if (raw === "Z" || raw === "z") return 0;
  const m = /^([+-])(\d{2}):?(\d{2})?$/.exec(raw);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const mins = Number(m[3] || "0");
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours > 23 || mins > 59) return null;
  return sign * (hours * 60 + mins);
}

function toEpochMs(instant: string | number | Date): number {
  if (instant instanceof Date) return instant.getTime();
  if (typeof instant === "number") return instant;
  return Date.parse(String(instant));
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function ymdUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function ymdInTz(ms: number, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  let y = "", mo = "", d = "";
  for (const p of parts) {
    if (p.type === "year") y = p.value;
    else if (p.type === "month") mo = p.value;
    else if (p.type === "day") d = p.value;
  }
  return `${y}-${mo}-${d}`;
}

/**
 * Fecha local (`YYYY-MM-DD`) de un instante ISO.
 * Con `timezoneOffset` ('+02:00') se usa ese offset — el que el proveedor adjunta al registro.
 * Sin él, se cae a `fallbackTz` (o `INTEGRATION_TZ`) vía `Intl`, que sí conoce los cambios de hora.
 */
export function dayOf(
  isoInstant: string | number | Date,
  timezoneOffset?: string | null,
  fallbackTz?: string,
): string {
  const ms = toEpochMs(isoInstant);
  if (!Number.isFinite(ms)) throw new Error(`dayOf: instante inválido ${String(isoInstant)}`);
  const off = parseOffsetMinutes(timezoneOffset);
  if (off !== null) return ymdUtc(ms + off * 60_000);
  return ymdInTz(ms, fallbackTz || integrationTz());
}

/** Duración en ms de un registro con `start`/`end`. 0 si falta alguno. */
export function durationMs(sleep: SleepLike): number {
  if (!sleep || !sleep.start || !sleep.end) return 0;
  const a = Date.parse(sleep.start);
  const b = Date.parse(sleep.end);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, b - a);
}

/**
 * La noche de un conjunto de sueños: descarta siestas (`nap:true`) y, si quedan varias,
 * se queda con la MÁS LARGA. Sin esto, una siesta de 25 minutos con puntuación alta puede
 * sustituir a la noche real en el diario del día.
 */
export function pickNight<T extends SleepLike>(sleeps: T[] | null | undefined): T | null {
  const nights = (sleeps || []).filter((s) => s && s.nap !== true && s.start && s.end);
  if (!nights.length) return null;
  let best = nights[0];
  let bestMs = durationMs(best);
  for (let i = 1; i < nights.length; i++) {
    const d = durationMs(nights[i]);
    if (d > bestMs) {
      best = nights[i];
      bestMs = d;
    }
  }
  return best;
}

/** Agrupa sueños por día de despertar y devuelve la noche elegida de cada día. */
export function pickNightsByDay<T extends SleepLike>(
  sleeps: T[] | null | undefined,
  fallbackTz?: string,
): Record<string, T> {
  const byDay: Record<string, T[]> = {};
  for (const s of sleeps || []) {
    if (!s || !s.end) continue;
    const day = dayOf(s.end, s.timezone_offset, fallbackTz);
    (byDay[day] || (byDay[day] = [])).push(s);
  }
  const out: Record<string, T> = {};
  for (const day of Object.keys(byDay)) {
    const night = pickNight(byDay[day]);
    if (night) out[day] = night;
  }
  return out;
}

/** Instante ISO de hace `days` días (ventanas de sync). */
export function isoDaysAgo(days: number, from: number = Date.now()): string {
  return new Date(from - days * 86_400_000).toISOString();
}
