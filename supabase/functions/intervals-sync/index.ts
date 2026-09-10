import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ConfigError,
  ProviderFatalAuthError,
  ProviderTransientError,
  ReconnectRequired,
  RefreshInProgress,
  corsHeaders,
  json,
  maskSecret,
  readEnv,
} from "../_shared/http.ts";
import { handleCronMode } from "../_shared/cron.ts";
import { deleteTokens, serviceClient, upsertApiKey, type Supa } from "../_shared/tokens.ts";
import { ATHLETE_ID_RE, INTERVALS_SELF, fetchAthlete } from "../_shared/intervals.ts";
import { athleteZones, credentialStatus, pushEvents, PushBadRequest, syncIntervals } from "../_shared/intervals-sync.ts";

// intervals.icu al servidor (A-7, cierra C-8 de la auditoría 2026-09-09).
//
// LA DIFERENCIA CON LAS OTRAS TRES INTEGRACIONES. WHOOP, Withings y Strava son OAuth: el
// usuario autoriza en el proveedor y nosotros nunca vemos una contraseña. intervals.icu no
// ofrece OAuth para esto: la credencial es una API KEY personal que se copia de
// intervals.icu/settings → API y se usa con HTTP Basic. Eso obliga a que la clave PASE por
// nuestras manos una vez, y define exactamente el contrato de esta función:
//
//   · La clave SUBE una sola vez, por TLS, en `action: 'set_key'`, con el JWT del usuario.
//   · La clave NO BAJA NUNCA. Ni en esta respuesta, ni en `status`, ni en un log. Lo único que
//     sale es un indicio enmascarado (`••••1234`) para que la tarjeta de Ajustes pueda decir
//     "hay una clave guardada, y es ésta y no otra".
//   · La clave vive en `integration_tokens`, que es SÓLO service role (RLS sin políticas +
//     GRANT revocado a anon/authenticated). Antes vivía en `state.settings.intervalsIcuApiKey`,
//     que `smartPut` sincronizaba a la tabla `settings` Y metía en el JSON de la copia de
//     seguridad exportable. Una credencial con permiso de ESCRITURA (la app empuja semanas de
//     entreno al COROS por esa misma API) viajando en un adjunto.
//
// DOS MODOS, como sus gemelas:
//   · **Usuario** (JWT de la PWA): síncrono, devuelve el resultado.
//   · **Cron** (`x-cron-secret`): todos los usuarios con clave activa, 202 inmediato + waitUntil.
//
// SIN WEBHOOK: intervals.icu no notifica. El cron diario ES la vía, y el botón "Sync now" es el
// atajo. Por eso no hay nada que apuntar en `integration_events`.
//
// Contrato: POST
//   { days?, activities?, mode:'sync' }        → volcado (acción por defecto)
//   { action:'set_key', apiKey, athleteId? }   → guarda la clave; devuelve athleteId + keyHint
//   { action:'clear_key' }                     → borra la credencial (deja 'disconnected')
//   { action:'status' }                        → { status, athleteId, keyHint, lastError }
//   { action:'athlete' }                       → campos crudos de FC para las zonas del cliente
//   { action:'push_events', events:[…] }       → empuja la semana al calendario (→ COROS)
//
// Entorno: CRON_SECRET (modo cron) y las claves de Supabase. **No hay secreto de intervals.icu
// a nivel de aplicación**: la credencial es del usuario y por eso está en la base y no en Vault.

const MAX_DAYS = 365;
const DEFAULT_DAYS = 7;
/** Ventana del primer volcado tras guardar la clave: el histórico vale mucho para el coach. */
const INITIAL_DAYS = 90;

/** Cotas de forma de la clave. No valida que SEA válida (eso lo dice intervals.icu). */
const KEY_MIN = 8;
const KEY_MAX = 200;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "sync");
    const days = Math.max(1, Math.min(MAX_DAYS, Number(body?.days) || DEFAULT_DAYS));
    const supa = serviceClient();

    // ── Modo cron ────────────────────────────────────────────────────────────────────────
    // C-22: bloque compartido (`_shared/cron.ts`). Devuelve null si no es el cron y seguimos.
    // Se comprueba ANTES de resolver el JWT porque el cron manda el JWT anon, que no identifica
    // a nadie: si el orden se invirtiera, el cron acabaría sincronizando "el usuario anon".
    const cronRes = await handleCronMode(req, "intervals", supa, (userIds) => runForAll(userIds, days), { days });
    if (cronRes) return cronRes;

    // ── Modo usuario: el usuario SIEMPRE del JWT, nunca del cuerpo ───────────────────────
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Falta la cabecera Authorization" }, 401);
    const asUser = createClient(readEnv("SUPABASE_URL"), readEnv("SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Token inválido" }, 401);
    const userId = userData.user.id;

    // ── set_key ──────────────────────────────────────────────────────────────────────────
    if (action === "set_key") {
      const apiKey = typeof body?.apiKey === "string" ? body.apiKey.trim() : "";
      if (apiKey.length < KEY_MIN || apiKey.length > KEY_MAX || /\s/.test(apiKey)) {
        // El mensaje NO repite la clave ni su longitud real.
        return json({ ok: false, code: "invalid_shape", error: "That does not look like an intervals.icu API key" }, 400);
      }
      const asked = typeof body?.athleteId === "string" ? body.athleteId.trim() : "";
      if (asked && !ATHLETE_ID_RE.test(asked)) {
        return json({ ok: false, code: "invalid_athlete", error: "Athlete id must be letters, digits, - or _" }, 400);
      }

      try {
        // Se VALIDA antes de guardar. Guardar primero y validar después dejaría la tarjeta en
        // "Connected" con una clave mal copiada y el fallo aparecería al día siguiente, en el
        // log del cron, donde nadie mira.
        const athlete = await fetchAthlete(apiKey, asked || INTERVALS_SELF);
        const resolved = athlete && athlete.id !== null && athlete.id !== undefined
          ? String(athlete.id)
          : (asked || "");
        if (!resolved || !ATHLETE_ID_RE.test(resolved)) {
          return json({
            ok: false,
            code: "no_athlete",
            error: "The key works but intervals.icu did not return an athlete id — enter it manually",
          }, 400);
        }

        await upsertApiKey(supa, userId, "intervals", apiKey, resolved);
        console.log(`[intervals-sync] clave guardada para ${userId.slice(0, 8)}… (atleta ${resolved})`);

        // Primer volcado en segundo plano: tarda varios segundos y el usuario está esperando un
        // "guardado", no 90 días de wellness. Si falla, la credencial ya está y el cron recoge.
        EdgeRuntime.waitUntil(initialSync(userId));

        return json({
          ok: true,
          status: "active",
          athleteId: resolved,
          // Lo único que se devuelve de la clave, y a propósito.
          keyHint: maskSecret(apiKey),
        });
      } catch (err) {
        if (err instanceof ProviderFatalAuthError) {
          console.warn(`[intervals-sync] set_key rechazado para ${userId.slice(0, 8)}…`);
          return json({ ok: false, code: "invalid_key", error: "intervals.icu rejected that API key" }, 400);
        }
        if (err instanceof ProviderTransientError) {
          console.warn(`[intervals-sync] set_key transitorio: ${err.message}`);
          return json({ ok: false, code: "provider_down", error: "intervals.icu did not answer — try again" }, 503);
        }
        throw err;
      }
    }

    // ── clear_key ────────────────────────────────────────────────────────────────────────
    // Hace lo mismo que `integrations-oauth {action:'disconnect', provider:'intervals'}`: las
    // dos borran la fila y el trigger deja `integration_status` en 'disconnected'. Existe aquí
    // porque el ciclo de vida de ESTA credencial (que no pasa por OAuth) vive en esta función.
    if (action === "clear_key" || action === "disconnect") {
      await deleteTokens(supa, userId, "intervals");
      console.log(`[intervals-sync] credencial borrada para ${userId.slice(0, 8)}…`);
      return json({ ok: true, status: "disconnected" });
    }

    // ── athlete (campos de FC para las zonas del cliente) ───────────────────────────────
    // La derivación de zonas se queda en el cliente (`fetchIntervalsIcuZones` en app.js): es un
    // algoritmo probado con tres caminos y una heurística, y moverlo aquí sería reescribirlo por
    // el gusto de moverlo. Lo único que el cliente pierde al quedarse sin la clave es la
    // LLAMADA, y eso es lo que devuelve esta acción: los campos crudos, sin interpretar.
    if (action === "athlete") {
      try {
        return json({ ok: true, ...(await athleteZones(userId, supa)) });
      } catch (err) {
        if (err instanceof ReconnectRequired) {
          return json({ ok: false, status: "needs_reconnect", error: err.message });
        }
        throw err;
      }
    }

    // ── push_events (la semana de carrera al calendario → COROS) ─────────────────────────
    // El cliente sigue ARMANDO la semana (plan activo + cardio del coach + regla de fase, con el
    // DSL verbatim); aquí sólo se valida la forma y se pone la credencial. Ver `pushEvents`.
    if (action === "push_events") {
      try {
        const out = await pushEvents(userId, body?.events, supa);
        return json({ ok: true, ...out });
      } catch (err) {
        if (err instanceof PushBadRequest) return json({ ok: false, code: "invalid_events", error: err.message }, 400);
        if (err instanceof ReconnectRequired) return json({ ok: false, status: "needs_reconnect", error: err.message });
        throw err;
      }
    }

    // ── status ───────────────────────────────────────────────────────────────────────────
    if (action === "status") {
      return json({ ok: true, ...(await credentialStatus(supa, userId)) });
    }

    // ── sync (acción por defecto) ────────────────────────────────────────────────────────
    if (action !== "sync") return json({ error: "action inválida: sync | set_key | clear_key | status | athlete | push_events" }, 400);

    try {
      const out = await syncIntervals(userId, {
        days,
        oldest: typeof body?.oldest === "string" ? body.oldest : undefined,
        newest: typeof body?.newest === "string" ? body.newest : undefined,
        activities: body?.activities !== false,
      }, supa);
      return json({ ok: true, ...out, status: "active" });
    } catch (err) {
      if (err instanceof ReconnectRequired) {
        console.warn(`[intervals-sync] needs_reconnect: ${err.message}`);
        return json({ ok: false, status: "needs_reconnect", error: err.message });
      }
      if (err instanceof RefreshInProgress) {
        return json({ ok: false, status: "refresh_in_progress" }, 503);
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[intervals-sync] configuración: ${err.message}`);
      return json({ error: err.message, code: "config" }, 500);
    }
    console.error(`[intervals-sync] ${err instanceof Error ? err.stack || err.message : String(err)}`);
    return json({ error: "intervals_sync_failed" }, 500);
  }
});

/** Primer volcado tras guardar la clave: 90 días de wellness, peso, pasos y actividades. */
async function initialSync(userId: string): Promise<void> {
  try {
    const out = await syncIntervals(userId, { days: INITIAL_DAYS }, serviceClient());
    console.log(`[intervals-sync] initialSync → ${out.wellnessWrites} días de wellness`);
  } catch (err) {
    console.error(`[intervals-sync] initialSync falló: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Un usuario con la clave revocada no puede tumbar el sync de los demás. */
async function runForAll(userIds: string[], days: number): Promise<void> {
  const supa: Supa = serviceClient();
  for (const userId of userIds) {
    try {
      const out = await syncIntervals(userId, { days }, supa);
      console.log(`[intervals-sync] cron ${userId.slice(0, 8)}… → ${out.wellnessWrites} días`);
    } catch (err) {
      const name = err instanceof Error ? err.name : "Error";
      console.warn(
        `[intervals-sync] cron ${userId.slice(0, 8)}… falló (${name}): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
