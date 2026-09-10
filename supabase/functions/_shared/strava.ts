// Adaptador de Strava: OAuth (authorize / exchange / refresh / deauthorize) y perfil.
// Misma forma que `whoop.ts` y `withings.ts`: el adaptador NO sabe nada de la base de datos,
// sólo habla con Strava y CLASIFICA los errores. Quién persiste qué y quién marca
// `needs_reconnect` es cosa de `tokens.ts`.
//
// A-7 (2026-09-10). Hasta v11.70 Strava era el ÚLTIMO proveedor con los tokens en el teléfono:
// `app/strava.js` guardaba `strava_access_token` y `strava_refresh_token` en `localStorage` y
// usaba `strava-sync` como proxy sin estado para canjear y refrescar. Strava **rota** el
// refresh token en cada refresco igual que WHOOP, así que arrastraba exactamente los mismos
// fallos que A-1 arregló para WHOOP:
//
//   · La PWA instalada y Safari tienen almacenamiento separado en iOS: los dos refrescaban con
//     el mismo valor viejo y el segundo recibía `{field:"refresh_token", code:"invalid"}`.
//   · iOS desaloja el `localStorage` de una PWA que no se abre en unos días: la integración
//     "se desconectaba sola" sin que nadie hubiera revocado nada.
//   · Un `refresh` que respondía el par nuevo AL NAVEGADOR: cualquier extensión, cualquier XSS
//     y cualquier copia de seguridad del teléfono se llevaba una credencial de larga vida.
//
// LA TRAMPA DE STRAVA: el error NO va en el código HTTP sino en `errors[]`, y el mismo 400
// significa tres cosas distintas según el `resource`/`field` — refresh token muerto (fatal),
// client_id/secret mal (configuración NUESTRA) o código de autorización caducado (transitorio
// del flujo). Sin distinguirlos, un secreto mal cargado mandaría a Julian a reconectar una y
// otra vez sobre un OAuth que va a fallar siempre.

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
  readEnvOptional,
} from "./http.ts";

export const STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize";
export const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
export const STRAVA_DEAUTH_URL = "https://www.strava.com/oauth/deauthorize";
export const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// `activity:read_all` y no `activity:read`, que es lo que pedía `app/strava.js`. Con
// `activity:read` Strava OCULTA las actividades marcadas como privadas o "sólo seguidores" y no
// avisa: la respuesta llega con 200 y sin ellas, así que una carrera desaparece del historial
// sin dejar rastro ni en `skipped` ni en los logs. A-7 obliga a reconectar de todas formas (el
// refresh token viejo se queda en el teléfono y no se puede mover al servidor), así que el
// cambio de scope no cuesta un paso extra.
export const STRAVA_SCOPES = "read,activity:read_all";

function creds(): { id: string; secret: string } {
  const id = readEnvOptional("STRAVA_CLIENT_ID");
  const secret = readEnvOptional("STRAVA_CLIENT_SECRET");
  if (!id || !secret) {
    throw new ConfigError(
      "Strava sin configurar: faltan STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET " +
        "(Supabase → Functions → Secrets)",
    );
  }
  return { id, secret };
}

interface StravaError {
  resource?: string;
  field?: string;
  code?: string;
}

/** Primer `errors[]` de la respuesta, en minúsculas y sin nulos. */
function firstError(data: Record<string, unknown>): StravaError {
  const arr = Array.isArray(data.errors) ? (data.errors as StravaError[]) : [];
  const e = arr[0] || {};
  return {
    resource: String(e.resource || "").toLowerCase(),
    field: String(e.field || "").toLowerCase(),
    code: String(e.code || "").toLowerCase(),
  };
}

/**
 * Traduce la respuesta del endpoint de token a `TokenSet` o al error de la taxonomía.
 *
 * · `resource: RefreshToken` (o `field: refresh_token`) en el REFRESCO → FATAL: el token está
 *   muerto (revocado, o pisado por una rotación que se llevó otro almacenamiento). Único caso
 *   que justifica pedir una reconexión.
 * · `resource: Application` / `field: client_id|client_secret` → ConfigError: el secreto es
 *   NUESTRO. Reconectar no arregla nada y hacerlo sólo repite el fallo.
 * · `resource: AuthorizationCode` en el CANJE → error normal: el código caducó o ya se usó. Hay
 *   que repetir el OAuth, pero la integración no está rota y no se marca nada.
 * · 429 / 5xx / red → transitorio: los tokens se CONSERVAN y se reintenta.
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
    const e = firstError(data);
    if (res.status === 429 || res.status >= 500) {
      throw new ProviderTransientError(
        `Strava ${phase}: ${res.status} ${clip(text, 200)}`,
        res.status,
        res.headers.get("X-RateLimit-Usage") || res.headers.get("Retry-After"),
      );
    }
    if (phase === "refresh" && (e.resource === "refreshtoken" || e.field === "refresh_token")) {
      throw new ProviderFatalAuthError(
        `Strava ${phase}: refresh_token inválido o revocado`,
        "invalid_grant",
      );
    }
    if (e.resource === "application" || e.field === "client_id" || e.field === "client_secret") {
      throw new ConfigError(`Strava ${phase}: ${e.field || e.resource} inválido — revisar STRAVA_CLIENT_ID/SECRET`);
    }
    if (e.resource === "authorizationcode" || e.field === "code") {
      throw new Error(`Strava ${phase}: el código de autorización caducó o ya se usó`);
    }
    // Un 401 que no es ninguno de los anteriores sólo puede ser credencial nuestra.
    if (res.status === 401) {
      throw new ConfigError(`Strava ${phase}: 401 — revisar STRAVA_CLIENT_ID/SECRET`);
    }
    throw new Error(`Strava ${phase}: ${res.status} ${clip(text, 200)}`);
  }

  const accessToken = String(data.access_token || "");
  if (!accessToken) throw new Error(`Strava ${phase}: respuesta sin access_token`);

  // Strava manda `expires_at` (epoch en SEGUNDOS) además de `expires_in`. Se prefiere el
  // absoluto porque no depende de cuánto haya tardado la petición: `tokens.ts` guarda
  // `now + expires_in - margen`, y con una llamada lenta un `expires_in` relativo deja el
  // token vivo unos segundos más de lo que Strava cree. Con `expires_at` el margen es real.
  const expAt = Number(data.expires_at);
  const nowSecs = Math.floor(Date.now() / 1000);
  const expiresIn = Number.isFinite(expAt) && expAt > nowSecs
    ? expAt - nowSecs
    : Number(data.expires_in) || 21_600; // 6 h es la vida del access token de Strava

  const athlete = (data.athlete || null) as { id?: unknown } | null;

  return {
    access_token: accessToken,
    refresh_token: data.refresh_token ? String(data.refresh_token) : null,
    expires_in: expiresIn,
    // Strava no devuelve `scope` en la respuesta del token: el permiso concedido de verdad
    // viaja en el `scope` del CALLBACK. Se guarda desde allí (`integrations-callback`).
    scope: data.scope ? String(data.scope) : null,
    external_user_id: athlete && athlete.id !== undefined && athlete.id !== null ? String(athlete.id) : null,
  };
}

async function postToken(body: URLSearchParams, phase: string): Promise<TokenSet> {
  let res: Response;
  try {
    // C-11: 12 s. Un endpoint de token colgado bloqueaba el lease de refresco los 30 s enteros
    // y toda petición que esperaba detrás moría con `RefreshInProgress`.
    res = await fetchWithTimeout(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    }, TOKEN_TIMEOUT_MS);
  } catch (err) {
    // Fallo de red o timeout: transitorio SIEMPRE. Nunca se toca el refresh token por esto.
    throw new ProviderTransientError(`Strava ${phase}: red — ${netErrorText(err, TOKEN_TIMEOUT_MS)}`);
  }
  return await readTokenResponse(res, phase);
}

export const stravaAdapter = {
  id: "strava" as const,
  kind: "oauth" as const,
  apiBase: STRAVA_API_BASE,
  scopes: STRAVA_SCOPES,

  authorizeUrl(state: string, redirectUri: string): string {
    const { id } = creds();
    const p = new URLSearchParams({
      client_id: id,
      redirect_uri: redirectUri,
      response_type: "code",
      // `auto` no vuelve a pedir permiso si ya está concedido CON ESTE MISMO scope; al subir a
      // `activity:read_all` Strava mostrará la pantalla una vez y luego dejará de molestar.
      approval_prompt: "auto",
      scope: STRAVA_SCOPES,
      state,
    });
    return `${STRAVA_AUTH_URL}?${p.toString()}`;
  },

  /** Canje del código. Nombre largo por simetría con el resto de adaptadores. */
  async exchange(code: string, redirectUri: string): Promise<TokenSet> {
    const { id, secret } = creds();
    return await postToken(
      new URLSearchParams({
        client_id: id,
        client_secret: secret,
        code,
        grant_type: "authorization_code",
        // Opcional en Strava, pero se manda: si algún día se registra otra URL de callback, un
        // canje contra la equivocada falla aquí y no tres pasos más abajo.
        redirect_uri: redirectUri,
      }),
      "exchange",
    );
  },

  async refresh(refreshToken: string): Promise<TokenSet> {
    const { id, secret } = creds();
    // Strava ROTA: la respuesta trae un `refresh_token` nuevo y el anterior deja de valer.
    // `tokens.ts` persiste el par en un ÚNICO update; ver el comentario "COMMIT ATÓMICO".
    return await postToken(
      new URLSearchParams({
        client_id: id,
        client_secret: secret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
      "refresh",
    );
  },

  /** `athlete.id` de Strava. Ya viene en la respuesta del canje; esto es el respaldo. */
  async fetchExternalUserId(accessToken: string): Promise<string | null> {
    const athlete = await getAthlete(accessToken);
    return athlete && athlete.id !== null && athlete.id !== undefined ? String(athlete.id) : null;
  },

  /** Best-effort: si falla, el token se borra igual de nuestra base. */
  async revoke(accessToken: string): Promise<boolean> {
    try {
      // C-11: 15 s. Es best-effort, pero sin tope un deauthorize colgado retrasa el borrado.
      const res = await fetchWithTimeout(STRAVA_DEAUTH_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Bearer ${accessToken}`,
        },
        body: new URLSearchParams({ access_token: accessToken }).toString(),
      }, PROVIDER_TIMEOUT_MS);
      return res.ok;
    } catch {
      return false;
    }
  },

  /** Strava sí usa el código HTTP: 401 es 401. */
  isAuthFailure(status: number, _body: unknown): boolean {
    return status === 401;
  },
};

export interface StravaAthlete {
  id?: number | string | null;
  firstname?: string | null;
  lastname?: string | null;
  username?: string | null;
}

/**
 * `GET /athlete` con un access token EN LA MANO. Se usa en el callback, justo tras el canje,
 * cuando la fila de `integration_tokens` aún no existe y no hay a quién pedirle el token — el
 * mismo papel que `fetchExternalUserId` en `whoop.ts`. El listado de actividades NO va por aquí:
 * necesita la política 401 → refresco → un reintento, que vive en `withProviderFetch`
 * (`tokens.ts`), y ese módulo importa este fichero — pedirlo desde aquí sería un ciclo. Por eso
 * `listActivities` está en `_shared/strava-sync.ts`.
 */
export async function getAthlete(accessToken: string): Promise<StravaAthlete | null> {
  let res: Response;
  try {
    // C-11: 15 s (API del proveedor). El fallo de red se clasifica como transitorio en vez de
    // propagarse crudo; el callback que lo llama ya distingue transitorio de fatal.
    res = await fetchWithTimeout(`${STRAVA_API_BASE}/athlete`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    throw new ProviderTransientError(`Strava perfil: red — ${netErrorText(err, PROVIDER_TIMEOUT_MS)}`);
  }
  if (!res.ok) {
    console.warn(`[strava] perfil → ${res.status}`);
    return null;
  }
  const data = await res.json().catch(() => null);
  return (data || null) as StravaAthlete | null;
}
