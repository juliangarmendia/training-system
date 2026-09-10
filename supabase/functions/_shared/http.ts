// Primitivas compartidas por las funciones de integraciones: CORS, respuestas, entorno,
// comparación en tiempo constante y la TAXONOMÍA DE ERRORES.
//
// Los errores viven aquí y no en `tokens.ts` para que los adaptadores (`whoop.ts`,
// `withings.ts`) puedan lanzarlos sin importar `tokens.ts`, que a su vez los importa a ellos:
// un ciclo de módulos con clases dentro es exactamente el tipo de fallo que sólo aparece en
// producción. `tokens.ts` los reexporta, así que las funciones importan de un solo sitio.

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function redirect(url: string): Response {
  // 302 y no 303: el proveedor nos manda un GET y devolvemos un GET.
  return new Response(null, { status: 302, headers: { Location: url } });
}

/** Variable de entorno obligatoria. Falla con un mensaje que dice QUÉ falta, no "undefined". */
export function readEnv(name: string): string {
  const v = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(name);
  if (!v) throw new ConfigError(`Falta el secreto ${name} (Supabase → Functions → Secrets)`);
  return v;
}

export function readEnvOptional(name: string, fallback = ""): string {
  const v = (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(name);
  return v || fallback;
}

/**
 * Error de configuración NUESTRA (secreto ausente o mal). NUNCA implica reconectar al usuario:
 * `invalid_client` significa que nuestro client_secret está mal, y mandar a Julian a reconectar
 * no lo arregla — sólo le hace repetir un OAuth que volverá a fallar.
 */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * El refresh token está muerto de verdad (WHOOP `invalid_grant`; Withings `status: 401` en el
 * refresh). Es el ÚNICO caso que justifica pedir una reconexión.
 */
export class ProviderFatalAuthError extends Error {
  code: string;
  constructor(message: string, code = "invalid_grant") {
    super(message);
    this.name = "ProviderFatalAuthError";
    this.code = code;
  }
}

/** 5xx, red o 429: se reintenta más tarde y los tokens se CONSERVAN intactos. */
export class ProviderTransientError extends Error {
  status: number;
  retryAfter: string | null;
  constructor(message: string, status = 0, retryAfter: string | null = null) {
    super(message);
    this.name = "ProviderTransientError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Hay que volver a pasar por OAuth. Lo lanza `tokens.ts` DESPUÉS de persistir el estado. */
export class ReconnectRequired extends Error {
  provider: string;
  constructor(provider: string, message: string) {
    super(message);
    this.name = "ReconnectRequired";
    this.provider = provider;
  }
}

/** Otro proceso tiene el lease y no soltó a tiempo. El llamador responde 503 y se reintenta. */
export class RefreshInProgress extends Error {
  provider: string;
  constructor(provider: string, message = "Refresco en curso en otra instancia") {
    super(message);
    this.name = "RefreshInProgress";
    this.provider = provider;
  }
}

/**
 * Comparación en tiempo constante para secretos compartidos y firmas.
 * `a === b` sale antes en el primer byte distinto y filtra el prefijo correcto byte a byte.
 * Se recorre siempre la longitud máxima y la diferencia de longitud se acumula en el mismo
 * XOR para no filtrarla por el tiempo de salida.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ba.length, bb.length);
  let diff = ba.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  }
  return diff === 0;
}

/**
 * `base64( HMAC_SHA256(secret, message) )` — el formato exacto con el que WHOOP firma sus
 * webhooks (`message` = cabecera de timestamp + cuerpo CRUDO).
 *
 * Vive aquí, y no dentro de la función del webhook, porque es la ÚNICA autenticación de un
 * endpoint público: así Node puede importarlo y contrastarlo contra `node:crypto` en el test.
 * Usa sólo WebCrypto y `btoa`, presentes tanto en Deno como en Node.
 */
export async function hmacBase64(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  const bytes = new Uint8Array(mac);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Recorta un cuerpo de error para el log sin arrastrar el payload entero. */
export function clip(text: string, max = 300): string {
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

// ── Timeouts de red (C-11, auditoría 2026-09-09) ───────────────────────────────────────────
//
// EL FALLO QUE ESTO EXISTE PARA IMPEDIR. `fetch` no tiene tope por defecto: un proveedor que
// acepta la conexión TCP y luego no contesta deja la promesa colgada hasta que el runtime mata
// el isolate. En el modo usuario eso es un spinner eterno en el teléfono; bajo `waitUntil` es
// peor — la instancia se queda ocupada, el cron siguiente entra encima y el evento del webhook
// se queda en `received` para siempre (justo los huérfanos de C-12).
//
// UN TIMEOUT ES SIEMPRE TRANSITORIO. Cada llamador traduce el abort a `ProviderTransientError`:
// los tokens se conservan intactos y NUNCA se marca `needs_reconnect`. Reconectar no arregla
// una red lenta, y obligar a Julian a rehacer el OAuth por un 12 s es el peor final posible.

/** Refresco/canje de token: la llamada es corta y el usuario suele estar esperando. */
export const TOKEN_TIMEOUT_MS = 12_000;
/** API del proveedor (listados, perfil, revoke, upserts REST): algo más de margen. */
export const PROVIDER_TIMEOUT_MS = 15_000;

/**
 * `fetch` con tope de tiempo. `AbortSignal.timeout` aborta también la lectura del cuerpo, no
 * sólo el handshake — que es donde de verdad se cuelgan estas APIs. El respaldo con
 * `AbortController` cubre cualquier runtime sin el helper: la alternativa sería quedarse sin
 * tope, y eso es exactamente lo que se está arreglando.
 */
export function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms: number = TOKEN_TIMEOUT_MS,
): Promise<Response> {
  const hasHelper = typeof AbortSignal !== "undefined" &&
    typeof (AbortSignal as { timeout?: unknown }).timeout === "function";
  if (hasHelper) return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  return fetch(url, { ...init, signal: ac.signal }).finally(() => clearTimeout(timer));
}

/** ¿Este error es nuestro timeout (o un abort)? Sirve para decirlo en el mensaje del log. */
export function isTimeoutError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

/** Texto de un fallo de red para el log, distinguiendo el timeout del resto. */
export function netErrorText(err: unknown, ms: number): string {
  if (isTimeoutError(err)) return `timeout tras ${ms} ms`;
  return err instanceof Error ? err.message : String(err);
}
