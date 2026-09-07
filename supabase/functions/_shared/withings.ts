// Adaptador de Withings (báscula Body+ / Body Smart). Misma forma que `whoop.ts`.
//
// LA TRAMPA DE WITHINGS: la API responde 200 SIEMPRE y el error va dentro del JSON
// (`{status: 401, error: "..."}`), así que mirar `res.ok` no detecta nada. Toda la
// clasificación pasa por `readWithingsBody`.
//
// Los secretos se leen PEREZOSAMENTE (dentro de las funciones): Julian aún no ha creado la app
// en developer.withings.com, y si este módulo leyera el entorno al importarse tumbaría también
// el flujo de WHOOP, que no tiene nada que ver.

import type { TokenSet } from "./tokens.ts";
import { ConfigError, ProviderFatalAuthError, ProviderTransientError, clip, readEnvOptional } from "./http.ts";

export const WITHINGS_AUTH_URL = "https://account.withings.com/oauth2_user/authorize2";
export const WITHINGS_TOKEN_URL = "https://wbsapi.withings.net/v2/oauth2";
export const WITHINGS_API_BASE = "https://wbsapi.withings.net";
export const WITHINGS_SCOPES = "user.metrics";

function creds(): { id: string; secret: string } {
  const id = readEnvOptional("WITHINGS_CLIENT_ID");
  const secret = readEnvOptional("WITHINGS_CLIENT_SECRET");
  if (!id || !secret) {
    throw new ConfigError(
      "Withings sin configurar: faltan WITHINGS_CLIENT_ID / WITHINGS_CLIENT_SECRET " +
        "(crear la app en developer.withings.com y cargarlos como secretos de Supabase)",
    );
  }
  return { id, secret };
}

export interface WithingsEnvelope {
  status?: number;
  body?: Record<string, unknown>;
  error?: string;
}

/**
 * Devuelve `body` o lanza el error de la taxonomía.
 * · `status: 401` en el REFRESH → FATAL (refresh token muerto). En el exchange no: ahí un 401
 *   suele ser el código caducado — Withings da 30 segundos para canjearlo — y reconectar
 *   es justo lo que hay que hacer, pero sin marcar la integración como rota.
 * · `601` (demasiadas peticiones) y `503`/5xx → transitorio.
 */
export function readWithingsBody(
  httpStatus: number,
  data: WithingsEnvelope,
  phase: string,
): Record<string, unknown> {
  const status = Number(data?.status ?? -1);
  if (status === 0) return (data.body || {}) as Record<string, unknown>;

  const detail = `Withings ${phase}: status=${status} ${clip(String(data?.error || ""), 160)}`;
  if (status === 401) {
    if (phase === "refresh") throw new ProviderFatalAuthError(detail, "withings_401");
    throw new Error(detail);
  }
  if (status === 601 || status === 503 || httpStatus === 429 || httpStatus >= 500) {
    throw new ProviderTransientError(detail, httpStatus || status);
  }
  if (status === 342 || status === 343) {
    // Firma exigida/incorrecta: es configuración nuestra, no del usuario.
    throw new ConfigError(`${detail} — la app de Withings exige signature/nonce`);
  }
  throw new Error(detail);
}

async function postForm(url: string, body: URLSearchParams, phase: string, bearer?: string) {
  let res: Response;
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  try {
    res = await fetch(url, { method: "POST", headers, body: body.toString() });
  } catch (err) {
    throw new ProviderTransientError(`Withings ${phase}: red — ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  let data: WithingsEnvelope = {};
  try {
    data = JSON.parse(text) as WithingsEnvelope;
  } catch {
    throw new ProviderTransientError(`Withings ${phase}: respuesta no-JSON (${res.status}) ${clip(text, 160)}`, res.status);
  }
  return readWithingsBody(res.status, data, phase);
}

function toTokenSet(body: Record<string, unknown>): TokenSet {
  const accessToken = String(body.access_token || "");
  if (!accessToken) throw new Error("Withings: respuesta sin access_token");
  return {
    access_token: accessToken,
    refresh_token: body.refresh_token ? String(body.refresh_token) : null,
    expires_in: Number(body.expires_in) || 10800,
    scope: body.scope ? String(body.scope) : null,
    external_user_id: body.userid === undefined || body.userid === null ? null : String(body.userid),
  };
}

export const withingsAdapter = {
  id: "withings" as const,
  apiBase: WITHINGS_API_BASE,
  scopes: WITHINGS_SCOPES,

  authorizeUrl(state: string, redirectUri: string): string {
    const { id } = creds();
    const p = new URLSearchParams({
      response_type: "code",
      client_id: id,
      state,
      scope: WITHINGS_SCOPES,
      redirect_uri: redirectUri,
    });
    return `${WITHINGS_AUTH_URL}?${p.toString()}`;
  },

  async exchange(code: string, redirectUri: string): Promise<TokenSet> {
    const { id, secret } = creds();
    const body = await postForm(
      WITHINGS_TOKEN_URL,
      new URLSearchParams({
        action: "requesttoken",
        grant_type: "authorization_code",
        client_id: id,
        client_secret: secret,
        code,
        redirect_uri: redirectUri,
      }),
      "exchange",
    );
    return toTokenSet(body);
  },

  async refresh(refreshToken: string): Promise<TokenSet> {
    const { id, secret } = creds();
    const body = await postForm(
      WITHINGS_TOKEN_URL,
      new URLSearchParams({
        action: "requesttoken",
        grant_type: "refresh_token",
        client_id: id,
        client_secret: secret,
        refresh_token: refreshToken,
      }),
      "refresh",
    );
    return toTokenSet(body);
  },

  /** El `userid` viene ya en la respuesta del token; no hace falta una llamada de perfil. */
  fetchExternalUserId(_accessToken: string): Promise<string | null> {
    return Promise.resolve(null);
  },

  /** Best-effort: `notify revoke` de la suscripción de notificaciones. */
  async revoke(accessToken: string): Promise<boolean> {
    const callbackUrl = withingsCallbackUrl();
    if (!callbackUrl) return false;
    try {
      const res = await fetch(`${WITHINGS_API_BASE}/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${accessToken}`,
        },
        body: new URLSearchParams({ action: "revoke", callbackurl: callbackUrl, appli: "1" }).toString(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /** El código HTTP no sirve: el 401 de Withings viaja dentro del JSON. */
  isAuthFailure(status: number, body: unknown): boolean {
    if (status === 401) return true;
    const s = (body as { status?: unknown } | null)?.status;
    return Number(s) === 401;
  },
};

/** URL de notificaciones que registra `notify subscribe` (A-5 la usa; aquí sólo para `revoke`). */
export function withingsCallbackUrl(): string | null {
  const base = readEnvOptional("SUPABASE_URL");
  const token = readEnvOptional("WITHINGS_WEBHOOK_TOKEN");
  if (!base || !token) return null;
  return `${base.replace(/\/+$/, "")}/functions/v1/withings-webhook?t=${encodeURIComponent(token)}`;
}
