import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.123.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.123.0/helpers/zod";
import {
  buildDynamicSystem,
  buildUserMessage,
  RULE_IDS,
  RULES_COUNT,
  RULES_VERSION,
  SYSTEM_STATIC,
} from "./prompt.ts";
import {
  type Allowed,
  CARDIO_SUBTYPES,
  CHANGE_KINDS,
  CoachOutputSchema,
  DECISION_TYPES,
  enumsAreOpen,
  SLOT_TYPES,
} from "./schema.ts";
// C-22: `corsHeaders` y `json` compartidos con el resto de funciones (había cuatro copias).
import { corsHeaders, json } from "../_shared/http.ts";
// El validador de planes, generado desde `app/coach-facts.js` por `scripts/build-fn-assets.mjs`.
// Una sola implementación: dos validadores (uno en el teléfono, otro aquí) divergirían y nadie
// sabría cuál manda. `tests/verify-fn-assets.mjs` falla si la copia se queda atrás.
import {
  diffPlanVersions,
  mergeProposal,
  // C-23: había CUATRO copias de `stableStringify` (aquí, en la PWA, en el script manual y en
  // el generador). El `factsHash` es la idempotencia de la revisión: dos implementaciones que
  // ordenen distinto producen hashes distintos para el MISMO pack, la caché deja de acertar y
  // el modo manual y el de API dejan de poder compararse. Una sola, la de `app/coach-facts.js`.
  stableStringify,
  validatePlanVersion,
} from "./coach-facts.generated.js";

// Revisión semanal del coach: convierte el facts pack determinista de la PWA en una PROPUESTA
// de plan v2 + briefing + decisiones trazadas a Rule IDs.
//
// LOS TRES INVARIANTES, y por qué están aquí y no en el prompt:
//
//   1. **NUNCA escribe en `plans`.** `loadActivePlan()` toma la versión más alta, así que una
//      fila escrita desde aquí sería el plan vivo en cualquier dispositivo antes de que nadie
//      la haya mirado. La propuesta vive en `coach_reviews[id].output.proposal` y sólo la PWA
//      la copia a `plans` cuando Julian pulsa Aplicar.
//   2. **La fila nunca se queda en `running`.** Refusal, JSON inválido o excepción se escriben
//      como `status: 'failed'` con su motivo. Un `running` eterno es peor que un fallo: la PWA
//      hace polling 5 minutos y luego no sabe si reintentar.
//   3. **El saneado se hace en código.** Los topes (≤6 sesiones, ≤10 ejercicios, notas ≤240,
//      3 prioridades, ids ∈ allowed, kg redondeado, ruleIds del corpus) no se confían al
//      decodificador — mismo criterio que `MAX_ITEMS` en parse-meal-photo. Lo que se recorta
//      se anota en `sanitized[]` para que se vea en la app en vez de desaparecer.
//
// ASÍNCRONA POR DEFECTO. Opus 5 a `effort: 'high'` con ~20k tokens de salida tarda 60-180 s;
// iOS suspende la PWA en segundo plano y la respuesta HTTP se pierde. Se devuelve 202 con el
// `reviewId`, el trabajo sigue bajo `EdgeRuntime.waitUntil()` y la PWA lee su fila por RLS.
// `mode: 'sync'` existe para probar desde curl con un pack real.
//
// Variables de entorno (Supabase → Functions → Secrets):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta el runtime.

const TABLE = "coach_reviews";
// 2 = contrato v2 (2026-09-07): fases de 5 valores, `weekSummary` con una fila por sesión,
// `focus`/`whyChanged`/`whyKept`/`lastWeekSummary` en el briefing, prompt rendimiento-primero.
// Va DENTRO del `factsHash` a propósito: con el mismo pack, una revisión v1 en caché no puede
// devolverse como si fuera v2 — le faltarían justo los campos que la Home nueva lee.
const PROMPT_VERSION = 2;
const MODEL = "claude-opus-5";
// `effort: "high"` — la revisión semanal es la decisión más caras de deshacer del sistema y
// corre una vez por semana, así que aquí se paga esfuerzo. La misma constante viaja a
// `prompt.effort` de la fila para que una revisión vieja diga con qué esfuerzo se generó.
const EFFORT = "high" as const;
const MAX_TOKENS = 24000;
const API_TIMEOUT_MS = 170_000;

// TTL de la caché del prefijo estático. A una llamada por semana el acierto entre semanas es
// imposible (el TTL máximo es 1 h), pero dentro de una misma ejecución hay hasta 3 llamadas
// (reintento por JSON nulo, regeneración por guardarraíl) y ésas sí leen de caché.
const CACHE_TTL = "5m" as const;   // 1 llamada/semana: la cache solo sirve al reintento del mismo run; 1h cuesta 2x en escritura sin ganar lecturas

// Precios de Claude Opus 5, $/millón de tokens. Entrada 5, salida 25; lectura de caché 0,1x;
// escritura de caché 1,25x con TTL de 5 min. C-30: había una segunda constante para el TTL de
// 1 h (2x) y un ternario que la elegía, con un comentario que decía lo contrario del código.
// `CACHE_TTL` es `"5m" as const`, así que la rama de 1 h era inalcanzable y `deno check` la
// marcaba como comparación imposible. Si algún día se sube el TTL, vuelven las dos.
const PRICE_INPUT = 5.00;
const PRICE_OUTPUT = 25.00;
const PRICE_CACHE_READ = 0.50;
const PRICE_CACHE_WRITE_5M = 6.25;

// Límites de entrada.
const MAX_FACTS_BYTES = 200_000;
const MAX_SESSION_IDS = 12;
const MAX_EXERCISE_IDS = 150;
// 6 revisiones: el coach v2.1 razona sobre el RECORRIDO, y con 4 no se ve un bloque entero
// (5 semanas). Las filas llegan ya compactas desde la PWA, así que el coste es marginal.
const MAX_PRIOR_REVIEWS = 6;
const MAX_USER_NOTE = 1200;

// Límites de saneado de la salida.
const MAX_SESSIONS = 6;
const MAX_EX_PER_SESSION = 10;
const MAX_NOTE = 240;
const N_PRIORITIES = 3;
const MAX_CARDIO_SLOTS = 10;
const MAX_DECISIONS = 12;
const MAX_TEMPLATE_CHANGES = 7;
const MAX_REQUESTED_DATA = 8;
const ROUND_KG = 1.25;

// Contrato v2 (2026-09-07). `focus` es el titular de la Home; `whyChanged`/`whyKept` son el
// "por qué cambia o por qué sigue igual"; `weekSummary` lleva UNA fila por sesión del plan.
const MAX_FOCUS = 160;
const MAX_WHY = 600;
// Voz (2026-09-09): la concisión se PIDE en el prompt (≤900 / ≤1.400) y se MIDE aquí con margen.
// No se recorta —truncar markdown rompe las cabeceras que la app busca—; se anota en `sanitized`
// para que una revisión que vuelve a ser un informe se vea como tal en la fila y en la app.
const VERBOSE_LASTWEEK = 1500;
const VERBOSE_NEXTWEEK = 2500;
const MAX_LASTWEEK_BULLETS = 3;
const MAX_WEEK_SUMMARY = 12;
const MAX_SUMMARY_LINE = 160;

// Las 5 fases del bloque. Duplicadas a propósito respecto a `schema.ts`: el esquema restringe al
// modelo, esto sanea lo que llegue (una revisión vieja, un enum abierto, un reintento raro).
const PHASES = ["base", "build", "intensify", "deload", "maintenance"];

// C-13 (auditoría 2026-09-09). Los otros CUATRO enums del contrato salían del saneado con un
// `String(...)` y un valor por defecto, sin comprobar nada. El decodificador restringido no
// puede emitir otra cosa HOY, pero el saneado también procesa lo que no viene de él: una
// revisión guardada con un contrato viejo, un `enumsAreOpen` (cuando el vocabulario llega
// vacío el esquema deja el campo libre) y el reintento por JSON nulo. Un `type: "cardio"` o un
// `kind: "modify"` inventado atraviesa el servidor, se guarda en la fila y llega a la app, que
// filtra por esos valores: la decisión no se pinta y desaparece sin que nada falle.
//
// `enumOr` devuelve el PRIMER valor del enum y lo anota en `sanitized[]` — recortar en silencio
// sería peor que el fallo. `clip()` va siempre: un enum abierto puede traer 4 KB de texto.
function enumOr(
  raw: unknown,
  allowedValues: readonly string[],
  fallback: string,
  where: string,
  sanitized: Sanitized,
): string {
  const v = clip(String(raw ?? ""), 40);
  if (allowedValues.includes(v)) return v;
  sanitized.push(`${where}: '${v || "(empty)"}' is not a valid value; set to '${fallback}'`);
  return fallback;
}
const WEEK_SUMMARY_STATUSES = ["kept", "changed", "new", "removed"];
// La línea que se pinta cuando el coach dejó una sesión sin motivo. Se ve en la app en vez de
// desaparecer: una sesión sin razón es un fallo del coach, no un hueco del formato. En INGLÉS
// desde el 2026-09-08: la app es entera en inglés y esta frase se pinta tal cual en la Home.
const WEEK_SUMMARY_FILL = "(no reason — the coach did not give one)";

// ── Guardarraíles: UNA regeneración ───────────────────────────────────────────────────
// Tope de intentos del bucle de guardarraíles. UNO, y el número es la decisión, no un detalle:
//   · Cero era lo que había (auditoría E-13): los `hard` se calculaban en el teléfono al
//     aplicar, cuando la propuesta ya estaba escrita y pagada.
//   · Dos o tres convertirían un `hard` persistente —una regla que el modelo no puede cumplir
//     con este pack, que existe— en 3 × $0,60 por semana y 3 × 90 s de latencia, para acabar en
//     el mismo sitio: la app pinta los `hard` en rojo y Julian decide. El coste sube y la
//     información no.
// El coste extra se paga SÓLO cuando algún `hard` falla, y con `cached: false` porque el
// prefijo estático es el mismo (la caché de 5 min sí acierta dentro de la misma ejecución).
const MAX_GUARDRAIL_ATTEMPTS = 2;
// Cuántos `hard` se le enumeran al modelo en el mensaje de corrección. Con más de 6 el mensaje
// deja de ser "corrige esto" y se convierte en otra propuesta.
const MAX_GUARDRAIL_LIST = 6;
// Músculos de tren inferior, para deducir qué sesiones son "de pierna" y poder ejecutar
// `RUN-BEFORE-LEGS` en el servidor. La PWA lo saca de `sessionClassMap()`; aquí, del propio plan.
const LOWER_MUSCLE_RE = /quad|ham|glute|calf|adduct|abduct|pierna|leg|hip/i;
// Por ID, para los casos en que el ejercicio llega sin `muscle`. Los ids reales de la librería
// (`trap-bar-dl`, `leg-curl-a`, `bss`) no contienen la palabra del patrón, así que se enumeran.
const LOWER_PATTERN_RE =
  /squat|deadlift|-dl$|-dl-|\brdl\b|rdl$|leg-(curl|press|extension)|lunge|^bss$|step-up|hip-thrust|glute|calf|good-morning|split-squat|nordic|ghr/i;

const WEEK_KEY_RE = /^\d{4}-W\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Sólo POST" }, 405);

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "Función sin configurar: falta ANTHROPIC_API_KEY" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader) return json({ error: "Falta la cabecera Authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente con el JWT del usuario, sólo para resolver quién es.
    const asUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await asUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Token inválido" }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));

    // ── Validación de entrada ───────────────────────────────────────────────────────
    const weekKey = String(body?.weekKey || "");
    if (!WEEK_KEY_RE.test(weekKey)) {
      return json({ error: "weekKey inválido: se espera YYYY-Wnn" }, 400);
    }

    const facts = body?.facts;
    if (!facts || typeof facts !== "object") {
      return json({ error: "Falta el facts pack" }, 400);
    }
    const factsJson = JSON.stringify(facts);
    if (factsJson.length > MAX_FACTS_BYTES) {
      return json({
        error: `El facts pack son ${factsJson.length} bytes; el tope es ${MAX_FACTS_BYTES}`,
      }, 413);
    }

    const rawAllowed = body?.allowed || {};
    const sessionIds: string[] = Array.isArray(rawAllowed.sessionIds)
      ? rawAllowed.sessionIds.filter((x: unknown) => typeof x === "string" && x)
      : [];
    const exerciseIds: Allowed["exerciseIds"] = Array.isArray(rawAllowed.exerciseIds)
      ? rawAllowed.exerciseIds.filter((x: unknown) =>
        x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string"
      )
      : [];

    if (sessionIds.length > MAX_SESSION_IDS) {
      return json({ error: `Demasiadas sesiones permitidas (${sessionIds.length} > ${MAX_SESSION_IDS})` }, 400);
    }
    if (exerciseIds.length > MAX_EXERCISE_IDS) {
      return json({ error: `Demasiados ejercicios permitidos (${exerciseIds.length} > ${MAX_EXERCISE_IDS})` }, 400);
    }

    // Si la PWA no manda el vocabulario, se deduce del plan que viaja en el pack. Es peor que
    // recibirlo (el plan sólo tiene los ejercicios que ya están programados), pero mejor que
    // dejar el esquema abierto.
    const derived = deriveAllowedFromFacts(facts);
    const allowed: Allowed = {
      sessionIds: sessionIds.length ? sessionIds : derived.sessionIds,
      exerciseIds: exerciseIds.length ? exerciseIds : derived.exerciseIds,
    };

    const currentPlan = body?.currentPlan ?? (facts as { plan?: unknown })?.plan ?? null;
    const priorReviews = Array.isArray(body?.priorReviews)
      ? body.priorReviews.slice(0, MAX_PRIOR_REVIEWS)
      : (Array.isArray((facts as { priorReviews?: unknown[] })?.priorReviews)
        ? (facts as { priorReviews: unknown[] }).priorReviews.slice(0, MAX_PRIOR_REVIEWS)
        : []);
    const userNote = typeof body?.userNote === "string"
      ? body.userNote.trim().slice(0, MAX_USER_NOTE)
      : "";
    // Ids de sesión de PIERNA, para que `RUN-BEFORE-LEGS` funcione aquí igual que en la PWA.
    // La app los saca de `sessionClassMap()` (que sabe de `full` e `hybrid`, no sólo de `lower`)
    // y puede mandarlos en el body con una línea; si no llegan, se deducen del plan por músculo
    // y por patrón. La deducción es peor —no reconoce una sesión `full` sin ejercicios de
    // pierna— pero es mejor que saltarse la regla dura que más cuesta cuando falla.
    const lowerIdsFromBody: string[] = Array.isArray(body?.lowerSessionIds)
      ? body.lowerSessionIds.filter((x: unknown) => typeof x === "string" && x).slice(0, MAX_SESSION_IDS)
      : [];
    const regenerate = body?.regenerate === true;
    const mode: "async" | "sync" = body?.mode === "sync" ? "sync" : "async";
    const clientVersion = typeof body?.clientVersion === "string" ? body.clientVersion.slice(0, 40) : null;

    const admin = createClient(supabaseUrl, serviceKey);

    // ── Idempotencia por hash de los hechos ─────────────────────────────────────────
    // El hash se calcula sobre un stringify determinista: si el pack es byte a byte el mismo,
    // no se paga otra revisión. Un `JSON.stringify` normal no sirve — el orden de claves de un
    // objeto construido en otro orden cambiaría el hash y cada carga de la app costaría $0,60.
    //
    // `PROMPT_VERSION` entra en el hash: al subir el contrato, el mismo pack tiene que producir
    // una revisión NUEVA. Sin esto, la primera semana de v2 devolvería la fila v1 cacheada — sin
    // `focus`, sin `whyKept` y sin `weekSummary` — y la Home nueva se quedaría muda.
    const factsHash = await sha256Hex(`promptVersion:${PROMPT_VERSION}\n${stableStringify(facts)}`);

    const { data: existingRows, error: listErr } = await admin
      .from(TABLE)
      .select("record_id, data")
      .eq("user_id", userId)
      .like("record_id", `${weekKey}#%`);
    if (listErr) return json({ error: `No se pudo leer coach_reviews: ${listErr.message}` }, 500);

    const existing = existingRows || [];
    if (!regenerate) {
      const hit = existing
        .map((r) => r.data as Record<string, unknown>)
        .filter((d) =>
          d && d.factsHash === factsHash &&
          (d.status === "proposed" || d.status === "applied")
        )
        .sort((a, b) => Number(b?.attempt || 0) - Number(a?.attempt || 0))[0];
      if (hit) {
        console.log(`[coach-weekly-review] cached ${hit.id} status=${hit.status}`);
        return json({ cached: true, ...rowResponse(hit) });
      }
    }

    const attempt = existing.length + 1;
    const id = `${weekKey}#${attempt}`;
    const nowIso = new Date().toISOString();

    const openEnums = enumsAreOpen(allowed);

    const baseData: Record<string, unknown> = {
      id,
      weekKey,
      attempt,
      status: "running",
      createdAt: nowIso,
      updatedAt: nowIso,
      factsHash,
      facts,
      userNote: userNote || null,
      clientVersion,
      prompt: {
        model: MODEL,
        effort: EFFORT,
        rulesVersion: RULES_VERSION,
        rulesCount: RULES_COUNT,
        promptVersion: PROMPT_VERSION,
      },
    };

    const { error: upsertErr } = await admin.from(TABLE).upsert({
      user_id: userId,
      record_id: id,
      data: baseData,
      updated_at: nowIso,
    }, { onConflict: "user_id,record_id" });
    if (upsertErr) return json({ error: `No se pudo crear la revisión: ${upsertErr.message}` }, 500);

    // ── El trabajo ──────────────────────────────────────────────────────────────────
    /** Escribe el estado final. Nunca lanza: si esto falla, la fila se queda en `running` y
     * eso es justo lo que el invariante 2 quiere evitar, así que al menos queda en el log. */
    const finish = async (patch: Record<string, unknown>) => {
      const data = { ...baseData, ...patch, updatedAt: new Date().toISOString() };
      try {
        const { error } = await admin.from(TABLE).upsert({
          user_id: userId,
          record_id: id,
          data,
          updated_at: data.updatedAt as string,
        }, { onConflict: "user_id,record_id" });
        if (error) console.error(`[coach-weekly-review] ${id} upsert final falló: ${error.message}`);
      } catch (err) {
        console.error(`[coach-weekly-review] ${id} upsert final lanzó`, err);
      }
      return data;
    };

    // C-14: el día del USUARIO, no el del servidor. `nowIso` es UTC: entre las 00:00 y las
    // 02:00 de Madrid en verano el servidor ya está en el día siguiente, y `todayStr` alimenta
    // `SUMMER-PACE` y el `ctx` del validador — un domingo por la noche la revisión razonaba
    // sobre el lunes. El pack trae `meta.todayStr` calculado en el teléfono, que es la fecha
    // que Julian ve. Se valida la forma antes de usarla: una cadena rara aquí desplaza la
    // ventana entera del validador sin que nada falle.
    const packToday = String((facts as { meta?: { todayStr?: unknown } })?.meta?.todayStr ?? "");
    const todayStr = /^\d{4}-\d{2}-\d{2}$/.test(packToday) ? packToday : nowIso.slice(0, 10);
    const lowerIds = lowerIdsFromBody.length
      ? lowerIdsFromBody
      : deriveLowerSessionIds(currentPlan, facts, allowed);
    const anthropic = new Anthropic({ apiKey });

    const run = async (): Promise<Record<string, unknown>> => {
      const t0 = Date.now();
      try {
        const format = zodOutputFormat(CoachOutputSchema(allowed));
        const userMessage = buildUserMessage({ facts, currentPlan, priorReviews, userNote, weekKey });
        const dynamicSystem = buildDynamicSystem({ allowed, todayStr, weekKey });

        // El bloque estático va PRIMERO y con `cache_control`: el prefijo cacheable tiene que
        // ser byte a byte el mismo entre llamadas. Todo lo del request va después del punto
        // de corte. Si la tipificación del SDK rechazara `ttl`, quitarlo deja un TTL de 5 min
        // (y entonces el precio de escritura es PRICE_CACHE_WRITE_5M).
        const system = [
          {
            type: "text" as const,
            text: SYSTEM_STATIC,
            cache_control: { type: "ephemeral" as const, ttl: CACHE_TTL },
          },
          { type: "text" as const, text: dynamicSystem },
        ];

        const call = (extraUserTurn?: string) =>
          anthropic.messages.parse({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            thinking: { type: "adaptive" },
            output_config: { effort: EFFORT, format },
            system,
            messages: [{
              role: "user" as const,
              content: [
                { type: "text" as const, text: userMessage },
                ...(extraUserTurn ? [{ type: "text" as const, text: extraUserTurn }] : []),
              ],
            }],
          }, { timeout: API_TIMEOUT_MS, maxRetries: 1 });

        let response = await call();

        // Los clasificadores de seguridad declinan con HTTP 200. Hay que mirar `stop_reason`
        // ANTES de leer el contenido, o se lee un objeto vacío como si fuera una propuesta.
        if (response.stop_reason === "refusal") {
          const category = (response as { stop_details?: { category?: string | null } })
            .stop_details?.category ?? null;
          const out = await finish({
            status: "failed",
            error: { kind: "refusal", category },
            usage: usageOf(response, Date.now() - t0),
            latencyMs: Date.now() - t0,
          });
          console.log(`[coach-weekly-review] ${id} status=failed kind=refusal category=${category}`);
          return out;
        }

        let parsed = response.parsed_output;
        let retried = false;
        if (!parsed) {
          retried = true;
          response = await call(
            "Tu respuesta anterior no era JSON válido del esquema. Devuelve sólo el JSON del esquema.",
          );
          if (response.stop_reason === "refusal") {
            const category = (response as { stop_details?: { category?: string | null } })
              .stop_details?.category ?? null;
            const out = await finish({
              status: "failed",
              error: { kind: "refusal", category },
              usage: usageOf(response, Date.now() - t0),
              latencyMs: Date.now() - t0,
            });
            console.log(`[coach-weekly-review] ${id} status=failed kind=refusal category=${category}`);
            return out;
          }
          parsed = response.parsed_output;
        }

        if (!parsed) {
          const out = await finish({
            status: "failed",
            error: { kind: "parse", message: "El modelo no devolvió JSON del esquema en 2 intentos" },
            usage: usageOf(response, Date.now() - t0),
            latencyMs: Date.now() - t0,
          });
          console.log(`[coach-weekly-review] ${id} status=failed kind=parse`);
          return out;
        }

        let { output, sanitized } = sanitizeOutput(
          parsed as Record<string, any>,
          allowed,
          facts,
          currentPlan,
        );

        // ── Guardarraíles: validar y, si hay `hard`, UNA regeneración ─────────────────
        //
        // EL FALLO QUE ESTO CIERRA (auditoría 2026-09-08, E-13). `plan-v2-schema.md:284-287` y
        // `coach-facts-schema.md:499-503` decían desde el diseño que un `hard` le cuesta al
        // coach una regeneración. No era verdad: aquí sólo se saneaba (topes, ids, redondeos) y
        // los guardarraíles se calculaban en el teléfono AL APLICAR — cuando la propuesta ya
        // estaba escrita y la llamada ya estaba pagada. Una propuesta con un sexto día de gym o
        // un salto de 300 kcal llegaba entera a la pantalla, en rojo, y la única salida era
        // rechazarla y volver a pagar la revisión a mano.
        //
        // El validador se ejecuta sobre el plan MERGEADO, no sobre la propuesta: la propuesta es
        // un diff (sólo las sesiones que cambian) y la mitad de los chequeos —series por músculo,
        // exposiciones de patrón, minutos de cardio, días de fuerza— sólo tienen sentido sobre la
        // semana completa. Es la misma llamada que hace `applyCoachProposal` en la PWA, con el
        // mismo `ctx`, para que el rojo que ve Julian sea el mismo que vio el servidor.
        let guardrails = runGuardrails(output, facts, currentPlan, allowed, todayStr, lowerIds, sanitized);
        let attempts = 1;
        let regenerated = false;
        let hard = guardrails.filter((g) => g.level === "hard");

        if (hard.length && attempts < MAX_GUARDRAIL_ATTEMPTS) {
          attempts++;
          regenerated = true;
          console.log(
            `[coach-weekly-review] ${id} guardrails hard=${hard.length} (${
              hard.map((g) => g.id).join(", ")
            }) → regenerando 1 vez`,
          );
          response = await call(buildGuardrailTurn(hard));
          if (response.stop_reason === "refusal") {
            // Un refusal en la SEGUNDA llamada no invalida la primera propuesta: se guarda la
            // que había, con sus `hard` visibles. Perderla para dejar la fila en `failed` sería
            // cambiar una propuesta mejorable por ninguna.
            sanitized.push(
              "The guardrail regeneration was declined by the safety classifier; the first proposal is kept with its hard warnings",
            );
          } else {
            const reparsed = response.parsed_output;
            if (!reparsed) {
              sanitized.push(
                "The guardrail regeneration did not return schema JSON; the first proposal is kept with its hard warnings",
              );
            } else {
              const second = sanitizeOutput(
                reparsed as Record<string, any>,
                allowed,
                facts,
                currentPlan,
              );
              const secondGuards = runGuardrails(
                second.output,
                facts,
                currentPlan,
                allowed,
                todayStr,
                lowerIds,
                second.sanitized,
              );
              const secondHard = secondGuards.filter((g) => g.level === "hard");
              // Se queda la mejor de las dos por número de `hard`. Si la segunda no mejora, la
              // primera se conserva: regenerar no puede empeorar la propuesta que se entrega.
              if (secondHard.length < hard.length) {
                output = second.output;
                sanitized = second.sanitized;
                sanitized.push(
                  `Regenerated once for hard guardrails: ${
                    hard.map((g) => g.id).join(", ")
                  } → ${secondHard.length ? secondHard.map((g) => g.id).join(", ") : "all clear"}`,
                );
                guardrails = secondGuards;
                hard = secondHard;
              } else {
                sanitized.push(
                  `Regenerated once for hard guardrails (${
                    hard.map((g) => g.id).join(", ")
                  }) and the second attempt did not improve on it (${secondHard.length} hard); keeping the first proposal`,
                );
              }
            }
          }
        }

        if (retried) sanitized.push("The first attempt did not return schema JSON; retried once");
        if (openEnums.sessions) sanitized.push("No allowed session ids: the schema ran without a session enum");
        if (openEnums.exercises) {
          sanitized.push("No allowed exercise ids: the schema ran without an exercise enum");
        }
        if (RULES_VERSION === "placeholder" || RULES_COUNT === 0) {
          sanitized.push("rules-compact.json is the placeholder: the prompt ran without the rules corpus");
        }

        const latencyMs = Date.now() - t0;
        const usage = usageOf(response, latencyMs);
        const out = await finish({
          status: "proposed",
          output,
          sanitized,
          // `guardrails` es el ARRAY que la PWA ya lee (`coach.js:1617` hace `Array.isArray`, y
          // `_coachGuardChipsHtml` filtra por `g.level`). No se cambia de forma: un objeto aquí
          // dejaría a la app recalculándolo en el teléfono y perdiendo el trabajo del servidor.
          guardrails,
          // Y el resumen que la fila necesita para poder responder "¿regeneró?" sin recorrer el
          // array: es lo que la vista Coach y el informe semanal van a querer contar.
          guardrailsMeta: {
            hard: hard.length,
            warn: guardrails.length - hard.length,
            regenerated,
            attempts,
            ids: guardrails.map((g) => g.id),
            hardIds: hard.map((g) => g.id),
            // Cuántos cambios estructurales trae de verdad la propuesta frente al plan activo.
            // Es el mismo número que audita `CHURN` y el que la vista Coach necesita para poder
            // decir "esta semana cambian 2 cosas" sin recorrer el diff en el teléfono.
            structuralChanges: structuralChangeCount(currentPlan, facts, output),
          },
          usage,
          latencyMs,
        });
        console.log(
          `[coach-weekly-review] ${id} status=proposed in=${usage.input} out=${usage.output} ` +
            `cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite} cost=$${usage.costUsd} ` +
            `latency=${latencyMs}ms sanitized=${sanitized.length} ` +
            `guardrails=${guardrails.length} hard=${hard.length} regenerated=${regenerated}`,
        );
        return out;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[coach-weekly-review] ${id}`, err);
        const out = await finish({
          status: "failed",
          error: { kind: "api", message: message.slice(0, 600) },
          latencyMs: Date.now() - t0,
        });
        console.log(`[coach-weekly-review] ${id} status=failed kind=api`);
        return out;
      }
    };

    if (mode === "async") {
      // Sin `waitUntil` el runtime mata el aislamiento al devolver la respuesta y la fila se
      // queda en `running` para siempre.
      EdgeRuntime.waitUntil(run());
      return json({ ok: true, reviewId: id, status: "running" }, 202);
    }

    const finalRow = await run();
    return json(rowResponse(finalRow));
  } catch (err) {
    console.error("[coach-weekly-review]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// ── Guardarraíles ─────────────────────────────────────────────────────────────────────

type Guardrail = { id: string; level: "hard" | "warn"; text: string; ruleIds: string[] };

/**
 * Merge + validación, con el MISMO `ctx` que usa `applyCoachProposal` en la PWA.
 *
 * Por qué importa que sea el mismo: si el servidor validara con un contexto más pobre, un `hard`
 * que aquí no se ve aparecería en el teléfono al aplicar, y el rojo llegaría después de la única
 * oportunidad de corregirlo. Los trozos del `ctx` que el request no trae se derivan del pack:
 *   · `variant`         ← `facts.plan.idealVariant` (la PWA lo mete en el pack, B.2).
 *   · `libraryIds`      ← el vocabulario `allowed` + los ids que ya están en el plan activo.
 *   · `lowerSessionIds` ← `body.lowerSessionIds`, o deducido del plan por músculo/patrón.
 *   · `block`, `goals`, `zones`, `bodyweightKg` ← del pack.
 *   · `exerciseLibrary` NO viaja (el pack no lleva `movementPattern`): el validador cae a sus
 *     tablas por id (`VP_PATTERN_IDS`, `FACTS_PRESS_IDS`), que cubren la librería real.
 *
 * NUNCA LANZA. Un validador que revienta en el servidor dejaría la fila en `failed` por un aviso,
 * que es exactamente al revés de para qué está: se anota el fallo en `sanitized[]` y la propuesta
 * sigue su camino sin guardarraíles, como antes de este incremento.
 */
function runGuardrails(
  output: Record<string, unknown>,
  facts: unknown,
  currentPlan: unknown,
  allowed: Allowed,
  todayStr: string,
  lowerSessionIds: string[],
  sanitized: Sanitized,
): Guardrail[] {
  try {
    const proposal = (output?.proposal ?? {}) as Record<string, unknown>;
    const briefing = (output?.briefing ?? {}) as Record<string, unknown>;
    const decisions = Array.isArray(output?.decisions) ? output.decisions : [];
    const base = (currentPlan ?? (facts as { plan?: unknown })?.plan ?? {}) as Record<string, unknown>;

    const merged = mergeProposal(base, proposal) as Record<string, unknown>;
    const f = (facts ?? {}) as Record<string, any>;
    const block = f?.block ?? null;

    const libraryIds = new Set<string>((allowed.exerciseIds || []).map((e) => e.id));
    for (const s of Object.values((base?.sessions ?? {}) as Record<string, any>)) {
      for (const ex of (s?.exercises ?? [])) if (ex?.id) libraryIds.add(String(ex.id));
    }

    // El plan que se valida = el merge + la cabecera que el merge no lleva (bloque, nutrición) +
    // el brief, para que `WEEK-SUMMARY` pueda dispararse. Idéntico a `applyCoachProposal`.
    const candidate = {
      ...merged,
      block: (merged as { block?: unknown }).block ?? block,
      nutrition: (proposal as { nutrition?: unknown }).nutrition ??
        (base as { nutrition?: unknown }).nutrition ?? null,
      decisions,
      briefing,
      coachBrief: {
        focus: briefing?.focus ?? null,
        phase: briefing?.phase ?? null,
        whyChanged: briefing?.whyChanged ?? null,
        whyKept: briefing?.whyKept ?? null,
        weekSummary: Array.isArray(proposal?.weekSummary) ? proposal.weekSummary : [],
      },
    };

    const ctx = {
      basedOn: base && Object.keys(base).length ? base : null,
      facts: f,
      variant: f?.plan?.idealVariant ?? null,
      libraryIds,
      lowerSessionIds: new Set(lowerSessionIds || []),
      block,
      isDeload: block?.isDeload === true,
      bodyweightKg: f?.progress?.weight?.latestKg ?? f?.trajectory?.weight?.latestKg ?? null,
      goals: f?.goals ?? null,
      zones: f?.cardio?.z2Ceiling ?? null,
      decisions,
      briefing,
      todayStr,
    };

    const out = validatePlanVersion(candidate, ctx);
    if (!Array.isArray(out)) return [];
    return out.filter((g: Guardrail) => g && g.id && (g.level === "hard" || g.level === "warn"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[coach-weekly-review] guardrails", err);
    sanitized.push(`The guardrail validator failed (${message.slice(0, 200)}): this proposal ships unvalidated`);
    return [];
  }
}

/** Cambios estructurales de la propuesta frente al plan activo, con el mismo `diffPlanVersions`
 *  que usa la PWA (un cambio de kg NO es estructural: la progresión normal no es churn). */
function structuralChangeCount(currentPlan: unknown, facts: unknown, output: Record<string, unknown>): number | null {
  try {
    const base = (currentPlan ?? (facts as { plan?: unknown })?.plan ?? null) as Record<string, unknown> | null;
    if (!base) return null;
    const merged = mergeProposal(base, (output?.proposal ?? {}) as Record<string, unknown>);
    const d = diffPlanVersions(base, merged) as { structural?: number };
    return Number.isFinite(Number(d?.structural)) ? Number(d.structural) : null;
  } catch (_err) {
    return null;
  }
}

/**
 * El turno de corrección. Se le da al modelo EXACTAMENTE lo que rompió y nada más: el mensaje de
 * usuario original sigue en la conversación, así que repetir el contexto sólo invitaría a
 * reescribir la propuesta entera. "Corrige sólo eso" es la mitad importante de la instrucción —
 * una regeneración que cambia la semana completa no se puede comparar con la primera.
 */
export function buildGuardrailTurn(hard: Guardrail[]): string {
  const list = hard.slice(0, MAX_GUARDRAIL_LIST)
    .map((g, i) => `${i + 1}. [${g.id}] ${g.text}${g.ruleIds?.length ? ` (${g.ruleIds.join(", ")})` : ""}`)
    .join("\n");
  const extra = hard.length > MAX_GUARDRAIL_LIST
    ? `\n(y ${hard.length - MAX_GUARDRAIL_LIST} más del mismo tipo)`
    : "";
  return `Tu propuesta anterior incumple estas reglas duras:

${list}${extra}

Corrige sólo eso; no cambies nada más. Devuelve el JSON completo del esquema con el resto de la
propuesta IDÉNTICO al anterior: los mismos ejercicios, los mismos kg, el mismo briefing y las
mismas decisiones, salvo lo que haga falta tocar para arreglar los puntos de arriba. Si el
arreglo cambia una decisión, actualiza su \`why\` y sus \`evidence.numbers\`; si cambia una sesión,
actualiza su fila de \`weekSummary\`. Si crees que una de estas reglas no debería aplicar a este
caso, cúmplela igualmente y dilo en \`requestedData\`.`;
}

/**
 * Qué sesiones son "de pierna", deducido del plan. Respaldo de `body.lowerSessionIds`.
 *
 * Dos señales, y las dos son del propio plan porque el pack no trae `movementPattern`: el
 * MÚSCULO de los ejercicios (`Quads`, `Hamstrings`, `Glutes`, `Calves`) y el ID mapeado a un
 * patrón de pierna. Con una sola exposición basta: una sesión `full` con sentadilla carga las
 * piernas igual que una `lower`, y para `RUN-BEFORE-LEGS` es lo que cuenta.
 */
export function deriveLowerSessionIds(currentPlan: unknown, facts: unknown, allowed: Allowed): string[] {
  const sessions = ((currentPlan as { sessions?: unknown })?.sessions ??
    (facts as { plan?: { sessions?: unknown } })?.plan?.sessions ?? null) as Record<string, any> | null;
  const out: string[] = [];
  if (!sessions || typeof sessions !== "object") return out;
  const byId = new Map((allowed.exerciseIds || []).map((e) => [e.id, e]));
  for (const [sid, s] of Object.entries(sessions)) {
    const list = (s?.exercises ?? []) as Array<Record<string, unknown>>;
    const isLower = list.some((ex) => {
      const id = String(ex?.id ?? "");
      const muscle = String(ex?.muscle ?? byId.get(id)?.muscle ?? "");
      return LOWER_MUSCLE_RE.test(muscle) || LOWER_PATTERN_RE.test(id);
    });
    if (isLower) out.push(sid);
  }
  return out;
}

// ── Saneado ───────────────────────────────────────────────────────────────────────────
type Sanitized = string[];

function sanitizeOutput(
  parsed: Record<string, any>,
  allowed: Allowed,
  facts: unknown,
  currentPlan?: unknown,
): { output: Record<string, unknown>; sanitized: Sanitized } {
  const sanitized: Sanitized = [];
  const sessionSet = new Set(allowed.sessionIds || []);
  const exById = new Map((allowed.exerciseIds || []).map((e) => [e.id, e]));
  const planSessionIds = planSessionIdsOf(currentPlan, facts, allowed);

  // ── fase (contrato v2) ──
  // Una sola fuente: se resuelve una vez y se estampa en `proposal` y en `briefing`, que el
  // esquema deja declarar por separado y podrían discrepar. El deload del calendario NO es
  // negociable: si el bloque dice deload, la semana es deload aunque el coach opine otra cosa
  // (G-H3, LOAD-004) — progresar en deload es el fallo más caro que puede colarse.
  const isDeloadBlock = (facts as { block?: { isDeload?: unknown } })?.block?.isDeload === true;
  const rawPhase = String(parsed?.proposal?.phase ?? "");
  const rawBriefPhase = String(parsed?.briefing?.phase ?? "");
  let phase = PHASES.includes(rawPhase) ? rawPhase : "";
  if (!phase) {
    phase = PHASES.includes(rawBriefPhase) ? rawBriefPhase : "";
    if (!phase) {
      sanitized.push(`proposal.phase '${rawPhase || "(empty)"}' is not a known phase; set to 'build'`);
      phase = "build";
    }
  }
  if (rawBriefPhase && rawBriefPhase !== rawPhase) {
    sanitized.push(
      `briefing.phase ('${rawBriefPhase}') and proposal.phase ('${rawPhase}') disagreed; both set to '${phase}'`,
    );
  }
  if (isDeloadBlock && phase !== "deload") {
    sanitized.push(
      `facts.block.isDeload = true but the phase came back '${phase}': forced to 'deload' (G-H3, LOAD-004)`,
    );
    phase = "deload";
  }

  // ── briefing ──
  const rawPriorities: string[] = Array.isArray(parsed?.briefing?.priorities)
    ? parsed.briefing.priorities.map((p: unknown) => String(p ?? "").trim()).filter(Boolean)
    : [];
  let priorities = rawPriorities.slice(0, N_PRIORITIES);
  if (rawPriorities.length > N_PRIORITIES) {
    sanitized.push(`The coach returned ${rawPriorities.length} priorities; keeping the first 3`);
  }
  while (priorities.length < N_PRIORITIES) {
    sanitized.push(
      `The coach returned ${rawPriorities.length} priorities; ${N_PRIORITIES - rawPriorities.length} missing`,
    );
    priorities.push("(no priority — the coach did not give one)");
  }
  priorities = priorities.slice(0, N_PRIORITIES);

  // `lastWeekSummary`: lo que la Home enseña sin abrir nada. ≤3 líneas, cada una ≤160.
  const rawLastWeekSummary: string[] = Array.isArray(parsed?.briefing?.lastWeekSummary)
    ? parsed.briefing.lastWeekSummary.map((s: unknown) => clip(String(s ?? ""), MAX_SUMMARY_LINE)).filter(Boolean)
    : [];
  if (rawLastWeekSummary.length > MAX_LASTWEEK_BULLETS) {
    sanitized.push(
      `briefing.lastWeekSummary came back with ${rawLastWeekSummary.length} lines; keeping the first ${MAX_LASTWEEK_BULLETS}`,
    );
  }
  const lastWeekSummary = rawLastWeekSummary.slice(0, MAX_LASTWEEK_BULLETS);

  const focus = clip(String(parsed?.briefing?.focus ?? ""), MAX_FOCUS);
  if (!focus) sanitized.push("briefing.focus is empty: Home has no headline for the week");

  // `whyChanged` puede ir vacío (una semana en la que no cambia nada es una respuesta legítima).
  // `whyKept` NO: mantener también se justifica, y es justo el punto del contrato v2.
  const whyChanged = clip(String(parsed?.briefing?.whyChanged ?? ""), MAX_WHY);
  const whyKept = clip(String(parsed?.briefing?.whyKept ?? ""), MAX_WHY);
  if (!whyKept) {
    sanitized.push("briefing.whyKept is empty: the coach did not justify what stays (it must never be)");
  }

  const briefing = {
    focus,
    phase,
    lastWeek: String(parsed?.briefing?.lastWeek ?? ""),
    lastWeekSummary,
    whyChanged,
    whyKept,
    nextWeek: String(parsed?.briefing?.nextWeek ?? ""),
    priorities,
  };
  // Las cabeceras se comprueban LITERALMENTE, y desde el 2026-09-08 en INGLES: el prompt las
  // pide en ingles (la app es entera en ingles) y una comprobacion en castellano marcaria las
  // cinco secciones como ausentes en cada revision, que es peor que no comprobarlas.
  for (const [field, headers] of [
    ["lastWeek", ["## What happened", "## Previous decisions"]],
    ["nextWeek", [
      "## What I am changing",
      "## Why it changes",
      "## Why it holds",
      "## What I am watching",
      "## What I need from you",
    ]],
  ] as const) {
    const text = briefing[field];
    const missing = headers.filter((h) => !text.includes(h));
    if (missing.length) sanitized.push(`briefing.${field} is missing the sections: ${missing.join(", ")}`);
  }
  if (briefing.lastWeek.length > VERBOSE_LASTWEEK) {
    sanitized.push(`briefing.lastWeek is ${briefing.lastWeek.length} characters (the voice guide asks for ≤900): this reads as a report, not a review`);
  }
  if (briefing.nextWeek.length > VERBOSE_NEXTWEEK) {
    sanitized.push(`briefing.nextWeek is ${briefing.nextWeek.length} characters (the voice guide asks for ≤1,400): this reads as a report, not a review`);
  }

  // Los `dataGaps` del pack tienen que aparecer literalmente en el briefing (ethos).
  const gaps = Array.isArray((facts as { dataGaps?: unknown[] })?.dataGaps)
    ? ((facts as { dataGaps: unknown[] }).dataGaps).map((g) => String(g ?? "").trim()).filter(Boolean)
    : [];
  const briefingText = `${briefing.lastWeek}\n${briefing.nextWeek}`;
  const missingGaps = gaps.filter((g) => !briefingText.includes(g));
  if (missingGaps.length) {
    sanitized.push(`The briefing does not repeat ${missingGaps.length} of the ${gaps.length} dataGaps in the pack`);
  }

  // ── decisions ──
  const decisionsIn: any[] = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
  if (decisionsIn.length > MAX_DECISIONS) {
    sanitized.push(`${decisionsIn.length} decisions; keeping the first ${MAX_DECISIONS}`);
  }
  const decisions = decisionsIn.slice(0, MAX_DECISIONS).map((d, i) => {
    const idIn = String(d?.id ?? `d${i + 1}`).slice(0, 80);
    const ruleIdsIn: string[] = Array.isArray(d?.ruleIds) ? d.ruleIds.map((x: unknown) => String(x ?? "").trim()) : [];
    const ruleIds = ruleIdsIn.filter((r) => RULE_IDS.has(r));
    const unknownRules = ruleIdsIn.filter((r) => r && !RULE_IDS.has(r));
    if (unknownRules.length) {
      sanitized.push(`Decision ${idIn}: Rule IDs that are not in the corpus, dropped: ${unknownRules.join(", ")}`);
    }
    const numbers: Record<string, string> = {};
    const rawNumbers = d?.evidence?.numbers;
    if (rawNumbers && typeof rawNumbers === "object" && !Array.isArray(rawNumbers)) {
      for (const [k, v] of Object.entries(rawNumbers)) {
        numbers[String(k).slice(0, 80)] = clip(String(v ?? ""), MAX_NOTE);
      }
    }
    // G-H14: sin número o sin regla no es una decisión. No se borra (Julian la ve), se marca.
    if (!ruleIds.length) sanitized.push(`Decision ${idIn} has no ruleIds from the corpus (G-H15)`);
    if (!Object.keys(numbers).length) sanitized.push(`Decision ${idIn} has no evidence.numbers (G-H15)`);
    return {
      id: idIn,
      // C-13: contra DECISION_TYPES de schema.ts, no `String(...)` a pelo.
      type: enumOr(d?.type, DECISION_TYPES, DECISION_TYPES[0], `Decision ${idIn}: type`, sanitized),
      what: clip(String(d?.what ?? ""), 400),
      why: clip(String(d?.why ?? ""), 800),
      evidence: { numbers },
      ruleIds,
      confidence: ["low", "medium", "high"].includes(String(d?.confidence)) ? String(d.confidence) : "medium",
    };
  });

  // ── proposal.sessions ──
  const sessionsIn: any[] = Array.isArray(parsed?.proposal?.sessions) ? parsed.proposal.sessions : [];
  const seenSessions = new Set<string>();
  const sessions: Record<string, unknown>[] = [];
  for (const s of sessionsIn) {
    const sid = String(s?.id ?? "");
    if (sessionSet.size && !sessionSet.has(sid)) {
      sanitized.push(`Session '${sid}' is not in the allowed ids; dropped`);
      continue;
    }
    if (seenSessions.has(sid)) {
      sanitized.push(`Session '${sid}' is duplicated; keeping the first`);
      continue;
    }
    if (sessions.length >= MAX_SESSIONS) {
      sanitized.push(`More than ${MAX_SESSIONS} sessions; '${sid}' dropped`);
      continue;
    }
    seenSessions.add(sid);

    const exIn: any[] = Array.isArray(s?.exercises) ? s.exercises : [];
    const exercises: Record<string, unknown>[] = [];
    const seenEx = new Set<string>();
    for (const ex of exIn) {
      const exId = String(ex?.id ?? "");
      const meta = exById.get(exId);
      if (exById.size && !meta) {
        sanitized.push(`Exercise '${exId}' (session ${sid}) is not in the library; dropped`);
        continue;
      }
      if (seenEx.has(exId)) {
        sanitized.push(`Exercise '${exId}' is duplicated in ${sid}; keeping the first`);
        continue;
      }
      if (exercises.length >= MAX_EX_PER_SESSION) {
        sanitized.push(`Session ${sid} has more than ${MAX_EX_PER_SESSION} exercises; '${exId}' dropped`);
        continue;
      }
      seenEx.add(exId);

      // Semántica del kg por tipo de ejercicio, y es la parte que más fácil se rompe:
      //   · normal   → kg absoluto en la barra o la máquina.
      //   · `db`     → kg POR MANO (la app dobla al calcular volumen).
      //   · `bw`     → **lastre** (+kg). 0 = peso corporal. NO se anula: la dominada lastrada
      //                es uno de los 6 anchors y su progresión ES el lastre (+2,5). Anularlo
      //                borraría en silencio la única palanca que tiene ese ejercicio.
      //   · `measure`→ se registra en cm o repeticiones. `kg` va SIEMPRE null; un número aquí
      //                se renderiza como carga y se ejecuta mal.
      const isMeasure = Boolean(meta?.measure);
      let kg: number | null = null;
      if (isMeasure) {
        if (ex?.target?.kg !== null && ex?.target?.kg !== undefined) {
          sanitized.push(`Exercise '${exId}' is a measure (cm/reps): target.kg forced to null`);
        }
      } else if (Number.isFinite(Number(ex?.target?.kg))) {
        const raw = Number(ex.target.kg);
        if (raw < 0) {
          sanitized.push(`Exercise '${exId}' had a negative target.kg (${raw}); set to null`);
        } else {
          kg = roundKg(raw);
        }
      }

      const note = clip(String(ex?.target?.note ?? ""), MAX_NOTE);
      exercises.push({
        id: exId,
        name: meta?.name ?? null,
        muscle: meta?.muscle ?? null,
        sets: clampInt(ex?.sets, 1, 10, 3),
        reps: clip(String(ex?.reps ?? ""), 24),
        rpe: clip(String(ex?.rpe ?? ""), 24),
        optional: ex?.optional === true,
        superset: ex?.superset ? clip(String(ex.superset), 24) : null,
        order: exercises.length,
        target: {
          kg,
          reps: clip(String(ex?.target?.reps ?? ex?.reps ?? ""), 24),
          rpe: clip(String(ex?.target?.rpe ?? ex?.rpe ?? ""), 24),
          // Sin nota y sin kg, la tarjeta del ejercicio se queda muda. La frase es la que el
          // ethos exige para un objetivo sin dato de origen.
          note: note || (kg === null && !isMeasure ? "adjust by RPE, no data" : note),
          source: "coach",
          evidence: filterRuleIds(ex?.target?.evidence, sanitized, `target of ${exId}`),
          decisionId: ex?.target?.decisionId ? String(ex.target.decisionId).slice(0, 80) : null,
        },
      });
    }

    const changesIn: any[] = Array.isArray(s?.changes) ? s.changes : [];
    const changes = changesIn.slice(0, MAX_EX_PER_SESSION).map((c) => ({
      // C-13: contra CHANGE_KINDS. La app dibuja el icono del cambio por este valor.
      kind: enumOr(c?.kind, CHANGE_KINDS, CHANGE_KINDS[0], `Session ${sid}: change.kind`, sanitized),
      exId: c?.exId ? String(c.exId).slice(0, 80) : null,
      why: clip(String(c?.why ?? ""), MAX_NOTE),
      decisionId: c?.decisionId ? String(c.decisionId).slice(0, 80) : null,
    }));

    sessions.push({
      id: sid,
      focus: clip(String(s?.focus ?? ""), MAX_NOTE),
      exercises,
      changes,
    });
  }

  // ── proposal.weekSummary ──
  // `sessions` es un DIFF (sólo lo que cambia); `weekSummary` es la foto completa. Las dos
  // tienen que contar la misma historia o la Home miente: una sesión listada como 'kept' que en
  // realidad cambió, o una semana en la que faltan filas y parece que el coach no miró.
  const weekSummary = reconcileWeekSummary(
    parsed?.proposal?.weekSummary,
    planSessionIds,
    seenSessions,
    sanitized,
  );

  // ── proposal.cardio ──
  const cardioIn: any[] = Array.isArray(parsed?.proposal?.cardio) ? parsed.proposal.cardio : [];
  const cardio: Record<string, unknown>[] = [];
  for (const c of cardioIn) {
    const dow = Number(c?.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      sanitized.push(`Cardio slot with dow=${c?.dow} outside 0..6; dropped`);
      continue;
    }
    if (cardio.length >= MAX_CARDIO_SLOTS) {
      sanitized.push(`More than ${MAX_CARDIO_SLOTS} cardio slots; the rest dropped`);
      break;
    }
    cardio.push({
      dow,
      // C-13: contra CARDIO_SUBTYPES. El subtipo decide el peso en el presupuesto de días duros
      // y la banda de HR de la tarjeta: uno desconocido deja el día sin intensidad ni zona.
      subtype: enumOr(c?.subtype, CARDIO_SUBTYPES, CARDIO_SUBTYPES[0], `Cardio slot dow ${dow}: subtype`, sanitized),
      durationMin: Math.max(0, Math.round(Number(c?.durationMin) || 0)),
      distanceKm: Number.isFinite(Number(c?.distanceKm)) ? round1(Number(c.distanceKm)) : null,
      note: clip(String(c?.note ?? ""), MAX_NOTE),
      source: "coach",
    });
  }

  // ── proposal.running ──
  const kmRaw = Number(parsed?.proposal?.running?.weeklyKmTarget);
  const weeklyKmTarget = Number.isFinite(kmRaw) ? Math.max(0, round1(kmRaw)) : 0;
  if (Number.isFinite(kmRaw) && kmRaw < 0) sanitized.push(`Negative weeklyKmTarget (${kmRaw}); set to 0`);
  const hardRaw = Number(parsed?.proposal?.running?.hardSessions);
  const hardSessions = clampInt(hardRaw, 0, 1, 0);
  if (Number.isFinite(hardRaw) && hardRaw > 1) {
    sanitized.push(`${hardRaw} hard cardio sessions; trimmed to 1 (G-H4, END-004)`);
  }

  // ── proposal.weekTemplateChanges ──
  const tplIn: any[] = Array.isArray(parsed?.proposal?.weekTemplateChanges)
    ? parsed.proposal.weekTemplateChanges
    : [];
  const weekTemplateChanges: Record<string, unknown>[] = [];
  for (const t of tplIn.slice(0, MAX_TEMPLATE_CHANGES)) {
    const dow = Number(t?.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      sanitized.push(`Week-template change with dow=${t?.dow} outside 0..6; dropped`);
      continue;
    }
    const sid = t?.sessionId ? String(t.sessionId) : null;
    if (sid && sessionSet.size && !sessionSet.has(sid)) {
      sanitized.push(`Week-template change (dow ${dow}) points at session '${sid}', which does not exist; dropped`);
      continue;
    }
    weekTemplateChanges.push({
      dow,
      // C-13: contra SLOT_TYPES. Un tipo de hueco desconocido rompe la semana en el calendario.
      // El respaldo NO es el primer valor del enum (`gym`) sino `rest`, que es el que ya había y
      // el único seguro: un `gym` inventado con `sessionId` nulo programa un día de fuerza
      // vacío en el calendario, mientras que `rest` no hace nada y el aviso queda en
      // `sanitized[]` para que se vea. En los otros tres enums el primer valor SÍ es el neutro.
      type: enumOr(t?.type, SLOT_TYPES, "rest", `Week-template change dow ${dow}: type`, sanitized),
      sessionId: sid,
      label: t?.label ? clip(String(t.label), 60) : null,
      why: clip(String(t?.why ?? ""), MAX_NOTE),
    });
  }

  const output = {
    briefing,
    decisions,
    proposal: {
      label: clip(String(parsed?.proposal?.label ?? ""), 80),
      phase,
      weekSummary,
      sessions,
      cardio,
      running: {
        weeklyKmTarget,
        longRunKm: Number.isFinite(Number(parsed?.proposal?.running?.longRunKm))
          ? round1(Number(parsed.proposal.running.longRunKm))
          : null,
        hardSessions,
      },
      weekTemplateChanges,
    },
    requestedData: (Array.isArray(parsed?.requestedData) ? parsed.requestedData : [])
      .slice(0, MAX_REQUESTED_DATA)
      .map((r: unknown) => clip(String(r ?? ""), 300))
      .filter(Boolean),
  };

  return { output, sanitized };
}

/** Los ids de sesión del plan ACTIVO — los que `weekSummary` tiene que cubrir enteros.
 *
 * No vale `allowed.sessionIds`: ése es el vocabulario (la librería), y puede traer sesiones que
 * no están programadas esta semana. La cobertura se mide contra el plan que viaja en el request
 * (`currentPlan.sessions`, objeto indexado por id), con el plan del pack como respaldo y el
 * vocabulario como último recurso para no dejar la comprobación muerta. */
function planSessionIdsOf(currentPlan: unknown, facts: unknown, allowed: Allowed): string[] {
  const fromObj = (v: unknown): string[] => {
    const s = (v as { sessions?: unknown })?.sessions;
    if (Array.isArray(s)) {
      return s.map((x) => String((x as { id?: unknown })?.id ?? "")).filter(Boolean);
    }
    if (s && typeof s === "object") return Object.keys(s as Record<string, unknown>);
    return [];
  };
  const ids = fromObj(currentPlan);
  if (ids.length) return [...new Set(ids)];
  const fromFacts = fromObj((facts as { plan?: unknown })?.plan);
  if (fromFacts.length) return [...new Set(fromFacts)];
  return [...new Set(allowed?.sessionIds || [])];
}

/** Cobertura y consistencia de `proposal.weekSummary`.
 *
 * Tres invariantes, y cada uno tapa una forma distinta de que la Home mienta:
 *   1. **Cobertura.** Toda sesión del plan lleva fila, también las que no cambian. Sin esto,
 *      "por qué sigue igual" desaparece justo en la semana estable, que es cuando más falta hace.
 *   2. **Consistencia con el diff.** `sessions` manda: si una sesión está ahí, cambió; si no
 *      está, no cambió. Una fila que diga lo contrario se corrige, no se descarta.
 *   3. **Tope.** ≤12 filas y ≤160 caracteres por línea.
 * Todo lo que se toca se anota en `sanitized[]`: recortar en silencio sería peor que el fallo.
 *
 * Exportada (y sin dependencias del runtime de Deno) para que el test la ejecute con un fixture. */
export function reconcileWeekSummary(
  raw: unknown,
  planSessionIds: string[],
  changedIds: Set<string>,
  sanitized: Sanitized,
): Array<{ sessionId: string; status: string; line: string }> {
  const rowsIn: any[] = Array.isArray(raw) ? raw : [];
  const rows: Array<{ sessionId: string; status: string; line: string }> = [];
  const seen = new Set<string>();

  for (const r of rowsIn) {
    const sessionId = String(r?.sessionId ?? "").trim();
    if (!sessionId) {
      sanitized.push("weekSummary had a row with no sessionId; dropped");
      continue;
    }
    if (seen.has(sessionId)) {
      sanitized.push(`weekSummary: duplicate row for '${sessionId}'; keeping the first`);
      continue;
    }
    seen.add(sessionId);

    let status = String(r?.status ?? "").trim();
    if (!WEEK_SUMMARY_STATUSES.includes(status)) {
      sanitized.push(`weekSummary: '${sessionId}' had unknown status '${status || "(empty)"}'; set to 'kept'`);
      status = "kept";
    }
    // El diff es la verdad: `proposal.sessions` es lo que la app va a copiar al plan.
    if (changedIds.has(sessionId) && status === "kept") {
      sanitized.push(
        `weekSummary: '${sessionId}' is in proposal.sessions but came back as 'kept'; corrected to 'changed'`,
      );
      status = "changed";
    } else if ((status === "changed" || status === "new") && !changedIds.has(sessionId)) {
      sanitized.push(
        `weekSummary: '${sessionId}' came back as '${status}' but is not in proposal.sessions; corrected to 'kept'`,
      );
      status = "kept";
    }

    rows.push({ sessionId, status, line: clip(String(r?.line ?? ""), MAX_SUMMARY_LINE) });
  }

  // Cobertura: una sesión del plan sin fila se rellena con la razón de que no hay razón. El
  // estado lo dicta el diff (si está en `sessions`, cambió), para no añadir una mentira encima
  // de un hueco. Una nota por sesión: "faltan 3" no dice cuál mirar.
  for (const sid of planSessionIds || []) {
    if (!sid || seen.has(sid)) continue;
    seen.add(sid);
    const status = changedIds.has(sid) ? "changed" : "kept";
    rows.push({ sessionId: sid, status, line: WEEK_SUMMARY_FILL });
    sanitized.push(`weekSummary had no row for '${sid}': added as '${status}' ${WEEK_SUMMARY_FILL}`);
  }

  if (rows.length > MAX_WEEK_SUMMARY) {
    sanitized.push(`weekSummary came back with ${rows.length} rows; keeping the first ${MAX_WEEK_SUMMARY}`);
  }
  return rows.slice(0, MAX_WEEK_SUMMARY);
}

function filterRuleIds(raw: unknown, sanitized: Sanitized, where: string): string[] {
  const list = Array.isArray(raw) ? raw.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const good = list.filter((r) => RULE_IDS.has(r));
  const bad = list.filter((r) => !RULE_IDS.has(r));
  if (bad.length) sanitized.push(`${where}: Rule IDs outside the corpus, dropped: ${bad.join(", ")}`);
  return good;
}

/** Redondeo al múltiplo de 1,25 kg. En ejercicios `db` el valor es POR MANO. */
function roundKg(v: number) {
  return Math.round((v / ROUND_KG)) * ROUND_KG;
}

function round1(v: number) {
  return Math.round(v * 10) / 10;
}

function clip(s: string, n: number) {
  const t = String(s ?? "").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

// ── Utilidades ────────────────────────────────────────────────────────────────────────

/** Deduce el vocabulario del plan que viene en el pack cuando la PWA no manda `allowed`. */
function deriveAllowedFromFacts(facts: unknown): Allowed {
  const out: Allowed = { sessionIds: [], exerciseIds: [] };
  const plan = (facts as { plan?: { sessions?: Record<string, unknown> } })?.plan;
  const sessions = plan?.sessions;
  if (!sessions || typeof sessions !== "object") return out;
  const seen = new Set<string>();
  for (const [sid, s] of Object.entries(sessions)) {
    out.sessionIds.push(sid);
    const list = (s as { exercises?: unknown[] })?.exercises;
    if (!Array.isArray(list)) continue;
    for (const ex of list) {
      const id = (ex as { id?: unknown })?.id;
      if (typeof id !== "string" || !id || seen.has(id)) continue;
      seen.add(id);
      const e = ex as Record<string, unknown>;
      out.exerciseIds.push({
        id,
        name: typeof e.name === "string" ? e.name : undefined,
        muscle: typeof e.muscle === "string" ? e.muscle : undefined,
        db: e.db === true,
        bw: e.bw === true,
        measure: e.measure === true,
      });
    }
  }
  out.sessionIds = out.sessionIds.slice(0, MAX_SESSION_IDS);
  out.exerciseIds = out.exerciseIds.slice(0, MAX_EXERCISE_IDS);
  return out;
}

function usageOf(response: unknown, latencyMs: number) {
  const u = (response as { usage?: Record<string, unknown> })?.usage || {};
  const input = Number(u.input_tokens ?? 0) || 0;
  const output = Number(u.output_tokens ?? 0) || 0;
  const cacheRead = Number(u.cache_read_input_tokens ?? 0) || 0;
  const cacheWrite = Number(u.cache_creation_input_tokens ?? 0) || 0;
  // C-30: `CACHE_TTL` es `"5m"`, así que el precio de escritura es siempre el de 5 min.
  const costUsd = Math.round(
    ((input * PRICE_INPUT + output * PRICE_OUTPUT + cacheRead * PRICE_CACHE_READ +
      cacheWrite * PRICE_CACHE_WRITE_5M) / 1_000_000) * 10000,
  ) / 10000;
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: cacheWrite,
    // Alias cortos: es la forma que ya lee la tarjeta de Stats (A.2 `usage:{input, output, cacheRead}`).
    input,
    output,
    cacheRead,
    cacheWrite,
    costUsd,
    latencyMs,
  };
}

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** La fila sin `facts`: el pack lo mandó el cliente, devolverlo son 30 KB de eco por nada, y
 * en `mode:'sync'` desde curl entierra la respuesta. `ok` refleja el estado real de la fila. */
function rowResponse(data: Record<string, unknown>) {
  const { facts: _facts, ...rest } = data;
  return { ok: data?.status !== "failed", reviewId: data?.id ?? null, ...rest };
}
