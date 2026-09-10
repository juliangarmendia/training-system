import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, readEnvOptional, timingSafeEqual } from "./http.ts";
import { TABLE_TOKENS, type ProviderId, type Supa } from "./tokens.ts";

// El MODO CRON de las funciones de sync, una sola vez.
//
// C-22 (auditoría 2026-09-09). `whoop-sync` y `withings-sync` tenían el mismo bloque copiado:
// leer `x-cron-secret`, compararlo en tiempo constante, listar los tokens activos del
// proveedor, lanzar el trabajo bajo `waitUntil` y responder 202. Las dos funciones son gemelas
// a propósito (la PWA las llama igual y espera lo mismo), así que cualquier arreglo aplicado a
// una sola de las copias se convierte en un `if (provider === ...)` en el cliente.
//
// LAS TRES REGLAS QUE ESTE BLOQUE PROTEGE Y QUE NO SE PUEDEN RELAJAR:
//
//   1. **El secreto es la auth de verdad.** `verify_jwt = true` sólo garantiza que quien llama
//      trae el JWT anon, que es PÚBLICO (viaja en la PWA). Lo que separa al cron de cualquiera
//      es `x-cron-secret`, y se compara en tiempo constante: un `===` filtra el prefijo
//      correcto byte a byte a quien mida el tiempo de respuesta.
//   2. **202 YA, trabajo detrás.** `net.http_post` corta a los 5 s. Si se esperara al
//      resultado, `cron.job_run_details` marcaría el job como fallido en CADA ejecución
//      correcta — y peor, se reintentaría encima del sync que sigue corriendo.
//   3. **Sólo tokens `active`.** Un usuario en `needs_reconnect` no se reintenta desde el cron:
//      su refresh token está muerto y cada pasada sólo sumaría ruido en los logs.

/**
 * Atiende el modo cron si la petición lo es. Devuelve `null` cuando NO hay `x-cron-secret`
 * (entonces el llamador sigue con el modo usuario) y una `Response` en cualquier otro caso.
 *
 * `run` recibe los ids de usuario activos y corre bajo `waitUntil`: tiene que capturar sus
 * propios errores (un usuario que falla no puede tumbar a los demás).
 */
export async function handleCronMode(
  req: Request,
  provider: ProviderId,
  supa: Supa,
  run: (userIds: string[]) => Promise<void>,
  extra: Record<string, unknown> = {},
): Promise<Response | null> {
  const cronHeader = req.headers.get("x-cron-secret");
  if (!cronHeader) return null;

  const expected = readEnvOptional("CRON_SECRET");
  if (!expected) return json({ error: "Función sin configurar: falta CRON_SECRET" }, 500);
  if (!timingSafeEqual(cronHeader, expected)) {
    console.warn(`[${provider}-sync] x-cron-secret inválido`);
    return json({ error: "Secreto de cron inválido" }, 401);
  }

  const { data: rows, error } = await supa
    .from(TABLE_TOKENS)
    .select("user_id")
    .eq("provider", provider)
    .eq("status", "active");
  if (error) return json({ error: `integration_tokens: ${error.message}` }, 500);
  const userIds = (rows || []).map((r) => String((r as { user_id: string }).user_id));

  // 202 YA. El trabajo sigue por su cuenta.
  EdgeRuntime.waitUntil(run(userIds));
  return json({ ok: true, mode: "cron", users: userIds.length, ...extra }, 202);
}
