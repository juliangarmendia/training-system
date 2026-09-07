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
import { type Allowed, CoachOutputSchema, enumsAreOpen } from "./schema.ts";

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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
// escritura de caché 1,25x con TTL de 5 min y 2x con TTL de 1 h (por eso hay dos constantes:
// usamos la de 1 h porque `CACHE_TTL` es '1h').
const PRICE_INPUT = 5.00;
const PRICE_OUTPUT = 25.00;
const PRICE_CACHE_READ = 0.50;
const PRICE_CACHE_WRITE_5M = 6.25;
const PRICE_CACHE_WRITE_1H = 10.00;

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
const MAX_LASTWEEK_BULLETS = 3;
const MAX_WEEK_SUMMARY = 12;
const MAX_SUMMARY_LINE = 160;

// Las 5 fases del bloque. Duplicadas a propósito respecto a `schema.ts`: el esquema restringe al
// modelo, esto sanea lo que llegue (una revisión vieja, un enum abierto, un reintento raro).
const PHASES = ["base", "build", "intensify", "deload", "maintenance"];
const WEEK_SUMMARY_STATUSES = ["kept", "changed", "new", "removed"];
// La línea que se pinta cuando el coach dejó una sesión sin motivo. Se ve en la app en vez de
// desaparecer: una sesión sin razón es un fallo del coach, no un hueco del formato.
const WEEK_SUMMARY_FILL = "(sin motivo — el coach no lo dio)";

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

    const todayStr = nowIso.slice(0, 10);
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

        const { output, sanitized } = sanitizeOutput(
          parsed as Record<string, any>,
          allowed,
          facts,
          currentPlan,
        );
        if (retried) sanitized.push("El primer intento no devolvió JSON del esquema; se reintentó una vez");
        if (openEnums.sessions) sanitized.push("Sin ids de sesión permitidos: el esquema corrió sin enum de sesiones");
        if (openEnums.exercises) {
          sanitized.push("Sin ids de ejercicio permitidos: el esquema corrió sin enum de ejercicios");
        }
        if (RULES_VERSION === "placeholder" || RULES_COUNT === 0) {
          sanitized.push("rules-compact.json es el placeholder: el prompt corrió sin corpus de reglas");
        }

        const latencyMs = Date.now() - t0;
        const usage = usageOf(response, latencyMs);
        const out = await finish({ status: "proposed", output, sanitized, usage, latencyMs });
        console.log(
          `[coach-weekly-review] ${id} status=proposed in=${usage.input} out=${usage.output} ` +
            `cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite} cost=$${usage.costUsd} ` +
            `latency=${latencyMs}ms sanitized=${sanitized.length}`,
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
      sanitized.push(`proposal.phase '${rawPhase || "(vacía)"}' no es una fase conocida; a 'build'`);
      phase = "build";
    }
  }
  if (rawBriefPhase && rawBriefPhase !== rawPhase) {
    sanitized.push(
      `briefing.phase ('${rawBriefPhase}') y proposal.phase ('${rawPhase}') no coincidían; ambas a '${phase}'`,
    );
  }
  if (isDeloadBlock && phase !== "deload") {
    sanitized.push(
      `facts.block.isDeload = true y la fase venía '${phase}': forzada a 'deload' (G-H3, LOAD-004)`,
    );
    phase = "deload";
  }

  // ── briefing ──
  const rawPriorities: string[] = Array.isArray(parsed?.briefing?.priorities)
    ? parsed.briefing.priorities.map((p: unknown) => String(p ?? "").trim()).filter(Boolean)
    : [];
  let priorities = rawPriorities.slice(0, N_PRIORITIES);
  if (rawPriorities.length > N_PRIORITIES) {
    sanitized.push(`El coach devolvió ${rawPriorities.length} prioridades; se quedan las 3 primeras`);
  }
  while (priorities.length < N_PRIORITIES) {
    sanitized.push(`El coach devolvió ${rawPriorities.length} prioridades; falta${
      N_PRIORITIES - rawPriorities.length > 1 ? "n" : ""
    } ${N_PRIORITIES - rawPriorities.length}`);
    priorities.push("(sin prioridad — el coach no la dio)");
  }
  priorities = priorities.slice(0, N_PRIORITIES);

  // `lastWeekSummary`: lo que la Home enseña sin abrir nada. ≤3 líneas, cada una ≤160.
  const rawLastWeekSummary: string[] = Array.isArray(parsed?.briefing?.lastWeekSummary)
    ? parsed.briefing.lastWeekSummary.map((s: unknown) => clip(String(s ?? ""), MAX_SUMMARY_LINE)).filter(Boolean)
    : [];
  if (rawLastWeekSummary.length > MAX_LASTWEEK_BULLETS) {
    sanitized.push(
      `briefing.lastWeekSummary con ${rawLastWeekSummary.length} líneas; se quedan las ${MAX_LASTWEEK_BULLETS} primeras`,
    );
  }
  const lastWeekSummary = rawLastWeekSummary.slice(0, MAX_LASTWEEK_BULLETS);

  const focus = clip(String(parsed?.briefing?.focus ?? ""), MAX_FOCUS);
  if (!focus) sanitized.push("briefing.focus vacío: la Home se queda sin titular de la semana");

  // `whyChanged` puede ir vacío (una semana en la que no cambia nada es una respuesta legítima).
  // `whyKept` NO: mantener también se justifica, y es justo el punto del contrato v2.
  const whyChanged = clip(String(parsed?.briefing?.whyChanged ?? ""), MAX_WHY);
  const whyKept = clip(String(parsed?.briefing?.whyKept ?? ""), MAX_WHY);
  if (!whyKept) {
    sanitized.push("briefing.whyKept vacío: el coach no justificó lo que se mantiene (nunca debe estarlo)");
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
  for (const [field, headers] of [
    ["lastWeek", ["## Qué pasó", "## Decisiones anteriores"]],
    ["nextWeek", [
      "## Qué cambio",
      "## Por qué cambia",
      "## Por qué se mantiene",
      "## Qué vigilo",
      "## Qué necesito",
    ]],
  ] as const) {
    const text = briefing[field];
    const missing = headers.filter((h) => !text.includes(h));
    if (missing.length) sanitized.push(`briefing.${field} sin las secciones: ${missing.join(", ")}`);
  }

  // Los `dataGaps` del pack tienen que aparecer literalmente en el briefing (ethos).
  const gaps = Array.isArray((facts as { dataGaps?: unknown[] })?.dataGaps)
    ? ((facts as { dataGaps: unknown[] }).dataGaps).map((g) => String(g ?? "").trim()).filter(Boolean)
    : [];
  const briefingText = `${briefing.lastWeek}\n${briefing.nextWeek}`;
  const missingGaps = gaps.filter((g) => !briefingText.includes(g));
  if (missingGaps.length) {
    sanitized.push(`El briefing no repite ${missingGaps.length} de ${gaps.length} dataGaps del pack`);
  }

  // ── decisions ──
  const decisionsIn: any[] = Array.isArray(parsed?.decisions) ? parsed.decisions : [];
  if (decisionsIn.length > MAX_DECISIONS) {
    sanitized.push(`${decisionsIn.length} decisiones; se quedan las ${MAX_DECISIONS} primeras`);
  }
  const decisions = decisionsIn.slice(0, MAX_DECISIONS).map((d, i) => {
    const idIn = String(d?.id ?? `d${i + 1}`).slice(0, 80);
    const ruleIdsIn: string[] = Array.isArray(d?.ruleIds) ? d.ruleIds.map((x: unknown) => String(x ?? "").trim()) : [];
    const ruleIds = ruleIdsIn.filter((r) => RULE_IDS.has(r));
    const unknownRules = ruleIdsIn.filter((r) => r && !RULE_IDS.has(r));
    if (unknownRules.length) {
      sanitized.push(`Decisión ${idIn}: Rule IDs que no están en el corpus, descartados: ${unknownRules.join(", ")}`);
    }
    const numbers: Record<string, string> = {};
    const rawNumbers = d?.evidence?.numbers;
    if (rawNumbers && typeof rawNumbers === "object" && !Array.isArray(rawNumbers)) {
      for (const [k, v] of Object.entries(rawNumbers)) {
        numbers[String(k).slice(0, 80)] = clip(String(v ?? ""), MAX_NOTE);
      }
    }
    // G-H14: sin número o sin regla no es una decisión. No se borra (Julian la ve), se marca.
    if (!ruleIds.length) sanitized.push(`Decisión ${idIn} sin ruleIds del corpus (G-H14)`);
    if (!Object.keys(numbers).length) sanitized.push(`Decisión ${idIn} sin evidence.numbers (G-H14)`);
    return {
      id: idIn,
      type: String(d?.type ?? "structure"),
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
      sanitized.push(`Sesión '${sid}' no está en los ids permitidos; descartada`);
      continue;
    }
    if (seenSessions.has(sid)) {
      sanitized.push(`Sesión '${sid}' duplicada; se queda la primera`);
      continue;
    }
    if (sessions.length >= MAX_SESSIONS) {
      sanitized.push(`Más de ${MAX_SESSIONS} sesiones; '${sid}' descartada`);
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
        sanitized.push(`Ejercicio '${exId}' (sesión ${sid}) no está en la librería; descartado`);
        continue;
      }
      if (seenEx.has(exId)) {
        sanitized.push(`Ejercicio '${exId}' duplicado en ${sid}; se queda el primero`);
        continue;
      }
      if (exercises.length >= MAX_EX_PER_SESSION) {
        sanitized.push(`Sesión ${sid} con más de ${MAX_EX_PER_SESSION} ejercicios; '${exId}' descartado`);
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
          sanitized.push(`Ejercicio '${exId}' es measure (cm/reps): target.kg forzado a null`);
        }
      } else if (Number.isFinite(Number(ex?.target?.kg))) {
        const raw = Number(ex.target.kg);
        if (raw < 0) {
          sanitized.push(`Ejercicio '${exId}' con target.kg negativo (${raw}); a null`);
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
          note: note || (kg === null && !isMeasure ? "ajustar por RPE, sin dato" : note),
          source: "coach",
          evidence: filterRuleIds(ex?.target?.evidence, sanitized, `target de ${exId}`),
          decisionId: ex?.target?.decisionId ? String(ex.target.decisionId).slice(0, 80) : null,
        },
      });
    }

    const changesIn: any[] = Array.isArray(s?.changes) ? s.changes : [];
    const changes = changesIn.slice(0, MAX_EX_PER_SESSION).map((c) => ({
      kind: String(c?.kind ?? "sets"),
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
      sanitized.push(`Slot de cardio con dow=${c?.dow} fuera de 0..6; descartado`);
      continue;
    }
    if (cardio.length >= MAX_CARDIO_SLOTS) {
      sanitized.push(`Más de ${MAX_CARDIO_SLOTS} slots de cardio; el resto descartado`);
      break;
    }
    cardio.push({
      dow,
      subtype: String(c?.subtype ?? "zone2"),
      durationMin: Math.max(0, Math.round(Number(c?.durationMin) || 0)),
      distanceKm: Number.isFinite(Number(c?.distanceKm)) ? round1(Number(c.distanceKm)) : null,
      note: clip(String(c?.note ?? ""), MAX_NOTE),
      source: "coach",
    });
  }

  // ── proposal.running ──
  const kmRaw = Number(parsed?.proposal?.running?.weeklyKmTarget);
  const weeklyKmTarget = Number.isFinite(kmRaw) ? Math.max(0, round1(kmRaw)) : 0;
  if (Number.isFinite(kmRaw) && kmRaw < 0) sanitized.push(`weeklyKmTarget negativo (${kmRaw}); a 0`);
  const hardRaw = Number(parsed?.proposal?.running?.hardSessions);
  const hardSessions = clampInt(hardRaw, 0, 1, 0);
  if (Number.isFinite(hardRaw) && hardRaw > 1) {
    sanitized.push(`${hardRaw} sesiones duras de cardio; recortado a 1 (G-H4, END-004)`);
  }

  // ── proposal.weekTemplateChanges ──
  const tplIn: any[] = Array.isArray(parsed?.proposal?.weekTemplateChanges)
    ? parsed.proposal.weekTemplateChanges
    : [];
  const weekTemplateChanges: Record<string, unknown>[] = [];
  for (const t of tplIn.slice(0, MAX_TEMPLATE_CHANGES)) {
    const dow = Number(t?.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      sanitized.push(`Cambio de plantilla con dow=${t?.dow} fuera de 0..6; descartado`);
      continue;
    }
    const sid = t?.sessionId ? String(t.sessionId) : null;
    if (sid && sessionSet.size && !sessionSet.has(sid)) {
      sanitized.push(`Cambio de plantilla (dow ${dow}) apunta a la sesión '${sid}', que no existe; descartado`);
      continue;
    }
    weekTemplateChanges.push({
      dow,
      type: String(t?.type ?? "rest"),
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
      sanitized.push("weekSummary con una fila sin sessionId; descartada");
      continue;
    }
    if (seen.has(sessionId)) {
      sanitized.push(`weekSummary: fila duplicada para '${sessionId}'; se queda la primera`);
      continue;
    }
    seen.add(sessionId);

    let status = String(r?.status ?? "").trim();
    if (!WEEK_SUMMARY_STATUSES.includes(status)) {
      sanitized.push(`weekSummary: '${sessionId}' con status '${status || "(vacío)"}' desconocido; a 'kept'`);
      status = "kept";
    }
    // El diff es la verdad: `proposal.sessions` es lo que la app va a copiar al plan.
    if (changedIds.has(sessionId) && status === "kept") {
      sanitized.push(
        `weekSummary: '${sessionId}' está en proposal.sessions pero venía como 'kept'; corregido a 'changed'`,
      );
      status = "changed";
    } else if ((status === "changed" || status === "new") && !changedIds.has(sessionId)) {
      sanitized.push(
        `weekSummary: '${sessionId}' venía como '${status}' pero no está en proposal.sessions; corregido a 'kept'`,
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
    sanitized.push(`weekSummary sin fila para '${sid}': añadida como '${status}' ${WEEK_SUMMARY_FILL}`);
  }

  if (rows.length > MAX_WEEK_SUMMARY) {
    sanitized.push(`weekSummary con ${rows.length} filas; se quedan las ${MAX_WEEK_SUMMARY} primeras`);
  }
  return rows.slice(0, MAX_WEEK_SUMMARY);
}

function filterRuleIds(raw: unknown, sanitized: Sanitized, where: string): string[] {
  const list = Array.isArray(raw) ? raw.map((x) => String(x ?? "").trim()).filter(Boolean) : [];
  const good = list.filter((r) => RULE_IDS.has(r));
  const bad = list.filter((r) => !RULE_IDS.has(r));
  if (bad.length) sanitized.push(`${where}: Rule IDs fuera del corpus, descartados: ${bad.join(", ")}`);
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
  const writePrice = CACHE_TTL === "1h" ? PRICE_CACHE_WRITE_1H : PRICE_CACHE_WRITE_5M;
  const costUsd = Math.round(
    ((input * PRICE_INPUT + output * PRICE_OUTPUT + cacheRead * PRICE_CACHE_READ +
      cacheWrite * writePrice) / 1_000_000) * 10000,
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

/** Stringify determinista: claves ordenadas en todos los niveles. Sin esto el `factsHash`
 * cambiaría según el orden en que la PWA construyó el objeto y la caché no serviría. */
function stableStringify(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? JSON.stringify(v) : "null";
  if (typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
