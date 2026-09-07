// EL GESTOR DE TOKENS. Todo lo que toca `integration_tokens` pasa por aquí.
//
// EL FALLO QUE ESTE MÓDULO EXISTE PARA IMPEDIR. WHOOP **rota** el refresh token: cada refresco
// correcto devuelve uno nuevo y **invalida el anterior**. Con los tokens en `localStorage`, la
// PWA instalada y Safari (almacenamientos separados en iOS) refrescaban cada una por su cuenta;
// la segunda mandaba el token ya quemado, recibía `invalid_grant` y la integración "se
// desconectaba sola". Eso es lo que arregla este fichero, con cuatro reglas:
//
//   1. **Un solo refresco a la vez por usuario y proveedor**: lease-lock en la propia fila
//      (`refresh_lock_until`), reclamado con un UPDATE atómico (`claim_refresh_lock`).
//   2. **La rotación se persiste en un ÚNICO update** junto al access token y la caducidad.
//      Nunca se escribe el access token nuevo con el refresh token viejo.
//   3. **Nadie quema una rotación de más**: si al ganar el lease el token ya es fresco y
//      distinto del que falló, otro acabó de refrescar y usamos el suyo.
//   4. **`needs_reconnect` sólo por `invalid_grant` real** (o un 401 que sobrevive al refresco).
//      5xx, red, 429 e `invalid_client` conservan los tokens: reconectar no arregla nada de eso.

import { createClient } from "npm:@supabase/supabase-js@2";
import { whoopAdapter } from "./whoop.ts";
import { withingsAdapter } from "./withings.ts";
import {
  ConfigError,
  ProviderFatalAuthError,
  ProviderTransientError,
  ReconnectRequired,
  RefreshInProgress,
  clip,
  readEnv,
} from "./http.ts";

export { ConfigError, ProviderFatalAuthError, ProviderTransientError, ReconnectRequired, RefreshInProgress };

export type Supa = ReturnType<typeof createClient>;
export type ProviderId = "whoop" | "withings";

export interface TokenSet {
  access_token: string;
  refresh_token?: string | null;
  expires_in: number;
  scope?: string | null;
  external_user_id?: string | null;
}

export interface ProviderAdapter {
  id: ProviderId;
  apiBase: string;
  scopes: string;
  authorizeUrl(state: string, redirectUri: string): string;
  exchange(code: string, redirectUri: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  fetchExternalUserId(accessToken: string): Promise<string | null>;
  revoke(accessToken: string): Promise<boolean>;
  isAuthFailure(status: number, body: unknown): boolean;
}

export interface TokenRow {
  user_id: string;
  provider: ProviderId;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  scope: string | null;
  external_user_id: string | null;
  status: "active" | "needs_reconnect";
  last_refresh_at: string | null;
  last_error: string | null;
  refresh_lock_until: string | null;
  created_at?: string;
  updated_at?: string;
}

export const TABLE_TOKENS = "integration_tokens";
export const TABLE_STATUS = "integration_status";

/** Debe coincidir con el `interval '30 seconds'` de `claim_refresh_lock`. */
export const LOCK_TTL_MS = 30_000;
/** Se refresca antes de caducar para que ninguna llamada salga con un token al límite. */
export const PREEMPTIVE_MS = 5 * 60_000;
/** "Ya lo refrescó otro": caduca a más de 2 minutos vista. */
export const FRESH_ENOUGH_MS = 2 * 60_000;
/** Margen que se resta a `expires_in` al guardar (reloj y latencia). */
export const EXPIRY_MARGIN_S = 60;
const POLL_MS = 300;
const POLL_MAX_MS = 5_000;

const ADAPTERS: Record<string, ProviderAdapter> = {
  whoop: whoopAdapter as unknown as ProviderAdapter,
  withings: withingsAdapter as unknown as ProviderAdapter,
};

export function getAdapter(provider: string): ProviderAdapter {
  const a = ADAPTERS[provider];
  if (!a) throw new Error(`Proveedor desconocido: ${provider}`);
  return a;
}

export function isProvider(p: unknown): p is ProviderId {
  return p === "whoop" || p === "withings";
}

let _svc: Supa | null = null;
export function serviceClient(): Supa {
  if (!_svc) {
    _svc = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _svc;
}

/** La redirect URI que se registra en el panel del proveedor y se manda en cada paso OAuth. */
export function callbackUrl(provider: ProviderId): string {
  const base = readEnv("SUPABASE_URL").replace(/\/+$/, "");
  return `${base}/functions/v1/integrations-callback/${provider}`;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Lectura y escritura de la fila ────────────────────────────────────────────────────────

export async function loadTokenRow(supa: Supa, userId: string, provider: ProviderId): Promise<TokenRow | null> {
  const { data, error } = await supa
    .from(TABLE_TOKENS)
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw new Error(`integration_tokens select: ${error.message}`);
  return (data as TokenRow | null) || null;
}

/** Alta o reconexión: deja la fila `active`, sin error y sin lock. */
export async function upsertTokens(
  supa: Supa,
  userId: string,
  provider: ProviderId,
  tokens: TokenSet,
  externalUserId: string | null,
): Promise<void> {
  const now = new Date();
  const row = {
    user_id: userId,
    provider,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || null,
    expires_at: new Date(now.getTime() + (Number(tokens.expires_in || 3600) - EXPIRY_MARGIN_S) * 1000).toISOString(),
    scope: tokens.scope || null,
    external_user_id: externalUserId,
    status: "active",
    last_refresh_at: now.toISOString(),
    last_error: null,
    refresh_lock_until: null,
    updated_at: now.toISOString(),
  };
  const { error } = await supa.from(TABLE_TOKENS).upsert(row, { onConflict: "user_id,provider" });
  if (error) throw new Error(`integration_tokens upsert: ${error.message}`);
}

/** Campos de `integration_status` que NO derivan de los tokens (los del trigger no se tocan). */
export async function markSynced(
  supa: Supa,
  userId: string,
  provider: ProviderId,
  summary: Record<string, unknown>,
): Promise<void> {
  const { error } = await supa
    .from(TABLE_STATUS)
    .update({ last_sync_at: new Date().toISOString(), last_sync_summary: summary, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) console.warn(`[${provider}] no se pudo escribir last_sync_at: ${error.message}`);
}

async function releaseLock(supa: Supa, userId: string, provider: ProviderId, lastError?: string | null): Promise<void> {
  const fields: Record<string, unknown> = { refresh_lock_until: null };
  if (lastError !== undefined) fields.last_error = lastError;
  const { error } = await supa.from(TABLE_TOKENS).update(fields).eq("user_id", userId).eq("provider", provider);
  if (error) console.error(`[${provider}] no se pudo soltar el lock: ${error.message}`);
}

async function markNeedsReconnect(supa: Supa, userId: string, provider: ProviderId, reason: string): Promise<void> {
  const { error } = await supa
    .from(TABLE_TOKENS)
    .update({ status: "needs_reconnect", last_error: clip(reason, 400), refresh_lock_until: null })
    .eq("user_id", userId)
    .eq("provider", provider);
  if (error) console.error(`[${provider}] no se pudo marcar needs_reconnect: ${error.message}`);
}

// ── El mutex ──────────────────────────────────────────────────────────────────────────────

/**
 * Refresca con lease-lock y devuelve el access token vigente.
 *
 * `staleAccessToken` = el token que teníamos en la mano (el que la API rechazó, o el que
 * leímos antes de refrescar preventivamente). Es lo que permite distinguir "otro ya refrescó"
 * de "hay que refrescar": sin él, el chequeo de frescura saltaría el refresco preventivo.
 */
export async function refreshWithLock(
  supa: Supa,
  provider: ProviderId,
  userId: string,
  staleAccessToken: string | null = null,
  attempt = 0,
): Promise<string> {
  const adapter = getAdapter(provider);

  // Un solo UPDATE atómico: `refresh_lock_until = now()+30s` where (null or vencido) RETURNING *.
  // La condición OR no se puede expresar en un `.update()` de PostgREST, así que vive en la
  // función SQL (ver la migración 20260908_integrations_tokens.sql).
  const { data, error } = await supa.rpc("claim_refresh_lock", { p_user: userId, p_provider: provider });
  if (error) throw new Error(`claim_refresh_lock: ${error.message}`);
  const row = (Array.isArray(data) ? data[0] : data) as TokenRow | undefined;

  if (!row) {
    // El lease es de otro. Esperar y reutilizar SU token nuevo antes que quemar otra rotación.
    return await waitForOtherRefresh(supa, provider, userId, staleAccessToken, attempt);
  }

  if (row.status === "needs_reconnect") {
    await releaseLock(supa, userId, provider);
    throw new ReconnectRequired(provider, row.last_error || `${provider} necesita reconectarse`);
  }
  if (!row.refresh_token) {
    await markNeedsReconnect(supa, userId, provider, "sin refresh_token (scope offline no concedido)");
    throw new ReconnectRequired(provider, "sin refresh_token: hay que reconectar con scope offline");
  }

  const expMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  if (expMs > Date.now() + FRESH_ENOUGH_MS && row.access_token !== staleAccessToken) {
    // Otra instancia refrescó mientras esperábamos: su par es el bueno.
    await releaseLock(supa, userId, provider);
    return row.access_token;
  }

  let tokens: TokenSet;
  try {
    tokens = await adapter.refresh(row.refresh_token);
  } catch (err) {
    if (err instanceof ProviderFatalAuthError) {
      // ÚNICO camino a needs_reconnect por refresco: el refresh token está muerto de verdad.
      await markNeedsReconnect(supa, userId, provider, err.message);
      throw new ReconnectRequired(provider, err.message);
    }
    // Transitorio o de configuración: soltar el lock y CONSERVAR los tokens tal cual.
    await releaseLock(supa, userId, provider, err instanceof Error ? clip(err.message, 400) : String(err));
    throw err;
  }

  // COMMIT ATÓMICO DEL PAR ROTADO. Un solo update: si se partiera en dos, un fallo entre ambos
  // dejaría el access token nuevo con el refresh token viejo (ya invalidado por WHOOP) y la
  // siguiente renovación moriría con invalid_grant.
  const now = new Date();
  const patch: Record<string, unknown> = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token || row.refresh_token,
    expires_at: new Date(now.getTime() + (Number(tokens.expires_in || 3600) - EXPIRY_MARGIN_S) * 1000).toISOString(),
    status: "active",
    last_refresh_at: now.toISOString(),
    last_error: null,
    refresh_lock_until: null,
  };
  if (tokens.scope) patch.scope = tokens.scope;

  const { error: upErr } = await supa.from(TABLE_TOKENS).update(patch).eq("user_id", userId).eq("provider", provider);
  if (upErr) {
    // Grave: el proveedor ya rotó y no hemos podido guardar el par nuevo. Se registra alto y
    // claro porque el síntoma llegará después, como un invalid_grant sin causa aparente.
    console.error(`[${provider}] ROTACIÓN PERDIDA al guardar: ${upErr.message}`);
    throw new Error(`No se pudo persistir la rotación: ${upErr.message}`);
  }
  console.log(`[${provider}] refresh ok (rotado=${tokens.refresh_token ? "sí" : "no"})`);
  return tokens.access_token;
}

async function waitForOtherRefresh(
  supa: Supa,
  provider: ProviderId,
  userId: string,
  staleAccessToken: string | null,
  attempt: number,
): Promise<string> {
  const deadline = Date.now() + POLL_MAX_MS;
  let ownerFailed = false;

  // Leer ANTES de dormir: si la fila no existe (nunca conectado, o desconectado hace un
  // momento) el error correcto sale ya, sin 5 segundos de espera inútil.
  while (Date.now() < deadline) {
    const row = await loadTokenRow(supa, userId, provider);
    if (!row) throw new ReconnectRequired(provider, `${provider} no está conectado`);
    if (row.status === "needs_reconnect") {
      throw new ReconnectRequired(provider, row.last_error || `${provider} necesita reconectarse`);
    }
    const expMs = row.expires_at ? Date.parse(row.expires_at) : 0;
    if (expMs > Date.now() + FRESH_ENOUGH_MS && row.access_token !== staleAccessToken) {
      return row.access_token; // el dueño terminó: su token, sin rotación extra
    }
    const lockMs = row.refresh_lock_until ? Date.parse(row.refresh_lock_until) : 0;
    if (!lockMs || lockMs <= Date.now()) {
      ownerFailed = true; // soltó el lease sin dejar token nuevo
      break;
    }
    await sleep(POLL_MS);
  }

  // Un único reintento: si el dueño falló, lo intentamos nosotros. Sin este guard, dos
  // instancias podrían turnarse indefinidamente.
  if (ownerFailed && attempt === 0) {
    return await refreshWithLock(supa, provider, userId, staleAccessToken, 1);
  }
  throw new RefreshInProgress(provider);
}

// ── API pública ───────────────────────────────────────────────────────────────────────────

/** Access token válido, refrescando preventivamente si caduca en menos de 5 minutos. */
export async function getValidToken(supa: Supa, provider: ProviderId, userId: string): Promise<string> {
  const row = await loadTokenRow(supa, userId, provider);
  if (!row) throw new ReconnectRequired(provider, `${provider} no está conectado`);
  if (row.status === "needs_reconnect") {
    throw new ReconnectRequired(provider, row.last_error || `${provider} necesita reconectarse`);
  }
  const expMs = row.expires_at ? Date.parse(row.expires_at) : 0;
  if (!expMs || expMs < Date.now() + PREEMPTIVE_MS) {
    return await refreshWithLock(supa, provider, userId, row.access_token);
  }
  return row.access_token;
}

export interface ProviderResponse {
  status: number;
  headers: Headers;
  text: string;
  json: unknown;
}

async function rawFetch(url: string, init: RequestInit, token: string, provider: string): Promise<ProviderResponse> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    throw new ProviderTransientError(`[${provider}] red: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  return { status: res.status, headers: res.headers, text, json: parsed };
}

/**
 * Llamada autenticada a la API del proveedor con la política 401 → un refresco → un reintento.
 *
 * `init.body` debe ser una cadena (no un stream): el reintento reenvía el mismo `init`.
 */
export async function withProviderFetch(
  provider: ProviderId,
  userId: string,
  url: string,
  init: RequestInit = {},
  supa: Supa = serviceClient(),
): Promise<ProviderResponse> {
  const adapter = getAdapter(provider);
  let token = await getValidToken(supa, provider, userId);
  let out = await rawFetch(url, init, token, provider);

  // GUARD DE UN SOLO REINTENTO (`MAX_AUTH_RETRIES`). Si tras refrescar la API sigue diciendo
  // 401, el problema no es el token sino el permiso: reintentar en bucle sólo gasta rate limit
  // y, con rotación, cada vuelta quema un refresh token más.
  const MAX_AUTH_RETRIES = 1;
  let authRetries = 0;
  while (adapter.isAuthFailure(out.status, out.json)) {
    if (authRetries >= MAX_AUTH_RETRIES) {
      await markNeedsReconnect(supa, userId, provider, "API 401 tras refresh");
      throw new ReconnectRequired(provider, "API 401 tras refresh");
    }
    authRetries++;
    console.log(`[${provider}] 401 → refresh → retry`);
    token = await refreshWithLock(supa, provider, userId, token);
    out = await rawFetch(url, init, token, provider);
  }

  if (out.status === 429) {
    throw new ProviderTransientError(
      `[${provider}] 429 rate limit`,
      429,
      out.headers.get("X-RateLimit-Reset") || out.headers.get("Retry-After"),
    );
  }
  if (out.status >= 500) {
    throw new ProviderTransientError(`[${provider}] ${out.status} ${clip(out.text, 160)}`, out.status);
  }
  return out;
}
