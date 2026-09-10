// Adaptador de WHOOP: OAuth (authorize / exchange / refresh / revoke) y perfil.
// El adaptador NO sabe nada de la base de datos: sólo habla con WHOOP y CLASIFICA los errores.
// Quién persiste qué y quién marca `needs_reconnect` es cosa de `tokens.ts`.

import type { TokenSet } from "./tokens.ts";
import {
  ConfigError,
  PROVIDER_TIMEOUT_MS,
  ProviderFatalAuthError,
  ProviderTransientError,
  TOKEN_TIMEOUT_MS,
  clip,
  fetchWithTimeout,
  netErrorText,
  readEnv,
} from "./http.ts";

export const WHOOP_AUTH_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";

// `offline` es el scope que hace que WHOOP devuelva refresh_token. La integración vieja NO lo
// pedía: por eso caducaba en una hora y "se desconectaba". `read:cycles` tampoco estaba y
// /v2/cycle lo exige (strain y kJ del día).
export const WHOOP_SCOPES = [
  "offline",
  "read:recovery",
  "read:cycles",
  "read:sleep",
  "read:workout",
  "read:body_measurement",
  "read:profile",
].join(" ");

function creds(): { id: string; secret: string } {
  return { id: readEnv("WHOOP_CLIENT_ID"), secret: readEnv("WHOOP_CLIENT_SECRET") };
}

/**
 * Traduce la respuesta del endpoint de token a `TokenSet` o al error de la taxonomía.
 *
 * · `invalid_grant` → FATAL: el refresh token está muerto (revocado, o pisado por una rotación
 *   que otro dispositivo se llevó). Es el único caso que obliga a reconectar.
 * · `invalid_client` → ConfigError: el secreto es NUESTRO. Reconectar no arregla nada.
 * · 5xx / 429 / red → transitorio: se conservan los tokens y se reintenta.
 */
async function readTokenResponse(res: Response, phase: string): Promise<TokenSet> {
  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* respuesta no-JSON: se trata por status */
  }

  if (!res.ok) {
    const code = String(data.error || "");
    if (code === "invalid_grant") {
      throw new ProviderFatalAuthError(`WHOOP ${phase}: invalid_grant (refresh token inválido o revocado)`, "invalid_grant");
    }
    // `invalid_grant` ya salió arriba, así que un 401 aquí sólo puede ser credencial nuestra.
    if (code === "invalid_client" || res.status === 401) {
      throw new ConfigError(`WHOOP ${phase}: ${code || res.status} — revisar WHOOP_CLIENT_ID/SECRET`);
    }
    if (res.status === 429 || res.status >= 500) {
      throw new ProviderTransientError(
        `WHOOP ${phase}: ${res.status} ${clip(text, 200)}`,
        res.status,
        res.headers.get("X-RateLimit-Reset") || res.headers.get("Retry-After"),
      );
    }
    throw new Error(`WHOOP ${phase}: ${res.status} ${clip(text, 200)}`);
  }

  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error(`WHOOP ${phase}: respuesta sin access_token`);
  return {
    access_token: accessToken,
    refresh_token: data.refresh_token ? String(data.refresh_token) : null,
    expires_in: Number(data.expires_in) || 3600,
    scope: data.scope ? String(data.scope) : null,
  };
}

async function postToken(body: URLSearchParams, phase: string): Promise<TokenSet> {
  let res: Response;
  try {
    // C-11: con tope de 12 s. Un endpoint de token colgado bloqueaba el lease de refresco los
    // 30 s enteros y toda petición que esperaba detrás moría con `RefreshInProgress`.
    res = await fetchWithTimeout(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }, TOKEN_TIMEOUT_MS);
  } catch (err) {
    // Fallo de red o timeout: transitorio SIEMPRE. Nunca se toca el refresh token por esto.
    throw new ProviderTransientError(`WHOOP ${phase}: red — ${netErrorText(err, TOKEN_TIMEOUT_MS)}`);
  }
  return await readTokenResponse(res, phase);
}

export const whoopAdapter = {
  id: "whoop" as const,
  apiBase: WHOOP_API_BASE,
  scopes: WHOOP_SCOPES,

  authorizeUrl(state: string, redirectUri: string): string {
    const { id } = creds();
    const p = new URLSearchParams({
      response_type: "code",
      client_id: id,
      redirect_uri: redirectUri,
      scope: WHOOP_SCOPES,
      state,
    });
    return `${WHOOP_AUTH_URL}?${p.toString()}`;
  },

  async exchange(code: string, redirectUri: string): Promise<TokenSet> {
    const { id, secret } = creds();
    return await postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: id,
        client_secret: secret,
        code,
        redirect_uri: redirectUri,
      }),
      "exchange",
    );
  },

  async refresh(refreshToken: string): Promise<TokenSet> {
    const { id, secret } = creds();
    // `scope=offline` en el REFRESH lo exige la documentación de WHOOP: sin él la respuesta
    // puede venir sin refresh_token nuevo y la siguiente rotación se queda sin par válido.
    return await postToken(
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: id,
        client_secret: secret,
        scope: "offline",
      }),
      "refresh",
    );
  },

  /** `user_id` de WHOOP: la clave con la que llegan los webhooks. */
  async fetchExternalUserId(accessToken: string): Promise<string | null> {
    let res: Response;
    try {
      // C-11: 15 s. El fallo de red se clasifica como transitorio en vez de propagarse crudo;
      // el callback que lo llama ya distingue transitorio de fatal.
      res = await fetchWithTimeout(`${WHOOP_API_BASE}/v2/user/profile/basic`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }, PROVIDER_TIMEOUT_MS);
    } catch (err) {
      throw new ProviderTransientError(`WHOOP perfil: red — ${netErrorText(err, PROVIDER_TIMEOUT_MS)}`);
    }
    if (!res.ok) {
      console.warn(`[whoop] perfil → ${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => ({}));
    const id = (data as { user_id?: unknown }).user_id;
    return id === undefined || id === null ? null : String(id);
  },

  /** Best-effort: si falla, el token se borra igual de nuestra base. */
  async revoke(accessToken: string): Promise<boolean> {
    try {
      // C-11: 15 s. Es best-effort, pero sin tope un revoke colgado retrasaba el borrado local.
      const res = await fetchWithTimeout(`${WHOOP_API_BASE}/v2/user/access`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      }, PROVIDER_TIMEOUT_MS);
      return res.ok;
    } catch {
      return false;
    }
  },

  /** WHOOP sí usa el código HTTP: 401 es 401. */
  isAuthFailure(status: number, _body: unknown): boolean {
    return status === 401;
  },
};
