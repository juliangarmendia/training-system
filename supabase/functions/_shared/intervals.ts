// Adaptador de intervals.icu. Misma forma que `whoop.ts`, `withings.ts` y `strava.ts`, con UNA
// diferencia estructural: la credencial es una API KEY personal usada con HTTP Basic
// (`API_KEY:<clave>`), no un par OAuth. **No hay refresco, no hay rotación y no hay caducidad.**
//
// A-7 (2026-09-10) — EL FALLO QUE ESTO CIERRA (C-8 de la auditoría 2026-09-09). La clave vivía
// en `state.settings.intervalsIcuApiKey`, es decir:
//
//   · en el store `settings` de IndexedDB, que `smartPut` SINCRONIZA a Supabase en la tabla
//     genérica `settings` — legible por el propio usuario, sí, pero también arrastrada a
//     cualquier copia de seguridad;
//   · y dentro del JSON de "exportar copia de seguridad", que es un fichero compartible. Una
//     credencial de acceso total a intervals.icu (lectura Y escritura: la app empuja semanas de
//     entreno al COROS por esa API) viajando en un adjunto.
//
// El 09-sep se filtró del `smartPut` como parche (`LOCAL_ONLY_KEYS`); A-7 la saca del teléfono.
// Ahora vive en `integration_tokens`, que es sólo service role, y la app NUNCA la recupera: las
// lecturas devuelven un indicio enmascarado (`••••1234`).
//
// DÓNDE SE GUARDA Y POR QUÉ. En la columna `access_token`, con `refresh_token` y `expires_at` a
// null. Tres razones:
//   1. `access_token` es NOT NULL. Poner la clave en `refresh_token` obligaría a inventar un
//      valor de relleno con forma de secreto en `access_token`, que cualquier herramienta (y
//      cualquier persona) trataría como un token de verdad.
//   2. Semánticamente `access_token` es "la credencial que se manda en cada petición", y la API
//      key ES exactamente eso. `refresh_token` es "la credencial que sirve para emitir otras",
//      y aquí no existe.
//   3. `refresh_token = null` es lo que hace que un refresco sea IMPOSIBLE por construcción:
//      `refreshWithLock` marca `needs_reconnect` cuando no hay refresh token, así que si alguna
//      vez alguien mandara `intervals` por el camino OAuth, el fallo sería inmediato y ruidoso
//      en vez de silencioso. Y `getValidToken` lo rechaza antes, por `kind`.
//
// `expires_at = null` (la clave no caduca) y `external_user_id` = el id de atleta, que hace
// falta en TODAS las URLs de la API — es literalmente "el id de este usuario en el proveedor",
// que es para lo que existe la columna.

import type { TokenSet } from "./tokens.ts";
import {
  PROVIDER_TIMEOUT_MS,
  ProviderFatalAuthError,
  ProviderTransientError,
  clip,
  fetchWithTimeout,
  netErrorText,
} from "./http.ts";

export const INTERVALS_API_BASE = "https://intervals.icu/api/v1";

/**
 * `0` es el alias de "el atleta autenticado" en la API de intervals.icu, y se usa SÓLO como
 * respaldo: `set_key` acepta el `athleteId` y la app ya lo tiene guardado
 * (`intervalsIcuAthleteId`), así que el camino normal no depende de este alias. Si algún día
 * intervals.icu deja de admitirlo, `set_key` con el id explícito sigue funcionando.
 */
export const INTERVALS_SELF = "0";

/** Ids de atleta de intervals.icu: `i123456` o numéricos. Se valida porque va en la RUTA. */
export const ATHLETE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Cabecera Basic de intervals.icu. El usuario es la cadena literal `API_KEY` y la contraseña es
 * la clave: así lo documenta intervals.icu y así lo hacía `app/app.js`.
 */
export function basicAuth(apiKey: string): string {
  return `Basic ${btoa(`API_KEY:${apiKey}`)}`;
}

export interface IntervalsAthlete {
  id?: string | number | null;
  name?: string | null;
  timezone?: string | null;
  /** Campos de zonas de FC: los lee el cliente para derivar sus bandas (ver `athleteZones`). */
  [k: string]: unknown;
}

/**
 * `GET /athlete/{id}` con la clave EN LA MANO. Es la validación del `set_key`: en ese momento no
 * hay fila en `integration_tokens` todavía, así que no se puede pasar por `withProviderFetch`.
 * Mismo papel que `getAthlete` en `strava.ts`.
 *
 * Se usa esta ruta y no `/athlete/{id}/profile` porque es la que la app ya usaba EN PRODUCCIÓN
 * (`fetchIntervalsIcuZones` en app.js): devuelve el `id` y además `sportSettings`, que es de
 * donde salen el LTHR y las zonas de FC. Elegir una ruta "más limpia" sin evidencia habría sido
 * cambiar lo único que se sabe que funciona.
 *
 * 401/403 → FATAL (la clave no vale). El resto de la clasificación, como siempre: 429 y 5xx
 * transitorios, red transitoria.
 */
export async function fetchAthlete(
  apiKey: string,
  athleteId: string,
): Promise<IntervalsAthlete | null> {
  if (!ATHLETE_ID_RE.test(athleteId)) {
    throw new Error(`intervals.icu: id de atleta inválido "${clip(athleteId, 40)}"`);
  }
  let res: Response;
  const url = `${INTERVALS_API_BASE}/athlete/${encodeURIComponent(athleteId)}`;
  try {
    // C-11: 15 s (API del proveedor). Sin tope, un intervals.icu detrás de un portal cautivo
    // dejaba la petición viva hasta que el runtime mataba el isolate.
    res = await fetchWithTimeout(url, { headers: { Authorization: basicAuth(apiKey) } }, PROVIDER_TIMEOUT_MS);
  } catch (err) {
    throw new ProviderTransientError(`intervals.icu perfil: red — ${netErrorText(err, PROVIDER_TIMEOUT_MS)}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new ProviderFatalAuthError("intervals.icu: la API key no es válida", "invalid_api_key");
  }
  if (res.status === 429 || res.status >= 500) {
    throw new ProviderTransientError(`intervals.icu perfil: ${res.status}`, res.status);
  }
  if (res.status === 404) {
    throw new Error("intervals.icu: ese id de atleta no existe para esta clave");
  }
  if (!res.ok) {
    throw new Error(`intervals.icu perfil: ${res.status}`);
  }
  const data = await res.json().catch(() => null) as
    | { athlete?: IntervalsAthlete; id?: string | number; name?: string }
    | null;
  if (!data) return null;
  // La respuesta envuelve el atleta en `athlete`; algunas rutas lo devuelven plano. Se aceptan
  // las dos formas: adivinar una sola y equivocarse dejaría el id a null y todas las URLs rotas.
  return (data.athlete || (data as IntervalsAthlete)) || null;
}

/**
 * Adaptador registrado en `tokens.ts`. Los métodos de OAuth existen para cumplir el contrato y
 * LANZAN: nadie debe llegar a ellos (los llamadores comprueban `kind` antes), y si alguien lo
 * hace, el fallo tiene que ser inmediato y con nombre, no un `undefined is not a function`.
 */
export const intervalsAdapter = {
  id: "intervals" as const,
  kind: "apikey" as const,
  apiBase: INTERVALS_API_BASE,
  scopes: "",

  authorizeUrl(_state: string, _redirectUri: string): string {
    throw new Error("intervals.icu no usa OAuth: la clave se manda a `intervals-sync` (action: set_key)");
  },
  exchange(_code: string, _redirectUri: string): Promise<TokenSet> {
    throw new Error("intervals.icu no usa OAuth: no hay código que canjear");
  },
  refresh(_refreshToken: string): Promise<TokenSet> {
    throw new Error("intervals.icu no usa OAuth: la API key no se refresca");
  },

  async fetchExternalUserId(apiKey: string): Promise<string | null> {
    const a = await fetchAthlete(apiKey, INTERVALS_SELF);
    return a && a.id !== null && a.id !== undefined ? String(a.id) : null;
  },

  /** No hay endpoint de revocación: la clave se revoca en intervals.icu/settings → API. */
  revoke(_apiKey: string): Promise<boolean> {
    return Promise.resolve(false);
  },

  /** intervals.icu devuelve 401 con clave mala y 403 cuando la clave no cubre a ese atleta. */
  isAuthFailure(status: number, _body: unknown): boolean {
    return status === 401 || status === 403;
  },

  /** HTTP Basic, no Bearer. Es la razón de ser del gancho `authHeader` en el adaptador. */
  authHeader(apiKey: string): string {
    return basicAuth(apiKey);
  },
};
