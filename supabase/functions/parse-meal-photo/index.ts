import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.123.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.123.0/helpers/zod";
import { z } from "npm:zod@^3.25.0";

// Convierte la foto de un plato en items estructurados con gramos.
//
// EL PRINCIPIO DE DISEÑO, y la corrección a Caltrack:
//   El LLM estima GRAMOS, no macros. Cuando un alimento ya existe en la biblioteca
//   `foods` del usuario, sus macros por 100 g se toman de ahí y se ignora lo que diga
//   el modelo. Así la precisión del sistema crece con el uso en vez de quedarse
//   clavada en "lo que la IA cree que lleva un pollo a la plancha", que es la
//   debilidad que Caltrack admite a medias con su prefijo `~`.
//   La resolución se hace AQUÍ y no en el prompt porque un modelo al que le pides
//   "usa estos macros" a veces los reescribe; si el servidor los sobrescribe, no puede.
//
// NO ESCRIBE EN LA BASE DE DATOS. Devuelve items para que el usuario confirme o corrija
// en la PWA, y es la PWA la que escribe (en IndexedDB primero, offline-first). Guardar
// aquí convertiría una estimación en un hecho sin que nadie la haya mirado.
//
// Auth: verify_jwt = true, así que el gateway ya validó el token. Aun así se comprueba
// que la ruta de la foto empiece por el uid del usuario: la URL firmada se genera con la
// service role, que se salta el RLS del bucket.
//
// Variables de entorno (Supabase → Functions → Secrets):
//   ANTHROPIC_API_KEY
//   SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta el runtime.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKET = "meal-photos";
const SIGNED_URL_TTL = 120;      // segundos: sólo tiene que vivir lo que dura la llamada
const MAX_LIBRARY = 400;         // techo de alimentos en el prompt
const MAX_ITEMS = 20;            // un plato con más de 20 items no es un plato

// Cada item: el modelo estima nombre, gramos y confianza. Los macros por 100 g SÓLO se
// piden para alimentos que no estén en la biblioteca; para el resto van a null y el
// servidor los rellena desde `foods`.
const ItemSchema = z.object({
  name: z.string().describe("Nombre del alimento en español, en singular y sin marca"),
  matchedFoodId: z.string().nullable()
    .describe("El id EXACTO de la biblioteca si este alimento ya está en ella; null si no"),
  grams: z.number().describe("Gramos (o mililitros para líquidos) servidos en el plato"),
  confidence: z.number().describe("Confianza en la estimación de gramos, 0 a 1"),
  kcal100: z.number().nullable().describe("kcal por 100 g. Sólo si matchedFoodId es null"),
  protein100: z.number().nullable().describe("Proteína g/100 g. Sólo si matchedFoodId es null"),
  carbs100: z.number().nullable().describe("Carbohidratos g/100 g, fibra incluida. Sólo si matchedFoodId es null"),
  fat100: z.number().nullable().describe("Grasa g/100 g. Sólo si matchedFoodId es null"),
  fiber100: z.number().nullable().describe("Fibra g/100 g. Sólo si matchedFoodId es null"),
  alcohol100: z.number().nullable().describe("Alcohol g/100 g. Sólo si matchedFoodId es null"),
  nova: z.number().nullable().describe("Clasificación NOVA 1-4. Sólo si matchedFoodId es null"),
});

const MealSchema = z.object({
  items: z.array(ItemSchema),
  mealType: z.enum(["desayuno", "comida", "cena", "snack"])
    .describe("Qué comida del día parece, por el contenido del plato"),
  notes: z.string().describe("Qué se ve y en qué te has apoyado para estimar la cantidad. Máximo 2 frases"),
});

const SYSTEM = `Eres un nutricionista deportivo estimando la composición de un plato a partir de una foto.

TU ÚNICA TAREA DIFÍCIL ES ESTIMAR GRAMOS. Los macros de los alimentos conocidos ya los tiene el sistema.

Reglas:
1. Si un alimento del plato está en la BIBLIOTECA, pon su id exacto en matchedFoodId y deja
   TODOS los campos de macros a null. No los rellenes "por ayudar": el sistema usa los suyos
   y los tuyos se descartan.
2. Si no está en la biblioteca, matchedFoodId va a null y rellenas los macros por 100 g.
   Usa valores de tabla de composición. carbs100 incluye la fibra. alcohol100 sólo para
   bebidas alcohólicas, en gramos de etanol por 100 ml.
3. Estima los gramos apoyándote en referencias visibles: un plato llano son 26-28 cm, un
   tenedor 19-20 cm, una cuchara sopera colmada 15 g, un vaso de agua 250 ml. Di en qué te
   apoyaste en el campo notes.
4. Sé honesto con la confianza: 0.9 si el alimento está pesado o envasado y se ve la etiqueta,
   0.6-0.7 si es una ración estándar bien visible, 0.3-0.4 si hay salsas, capas o el plato
   está a medio comer.
5. Cuenta el aceite de cocción si el plato brilla o está claramente frito. Es la fuente de
   calorías que más se olvida.
6. NO inventes alimentos que no ves. Si la foto está borrosa o no es comida, devuelve items
   vacío y explícalo en notes.
7. Nombres en español, en singular y sin marca comercial.`;

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
    const photoPath: string = body.photoPath || "";
    if (!photoPath || typeof photoPath !== "string") {
      return json({ error: "Falta photoPath" }, 400);
    }
    // La URL firmada se crea con la service role, que ignora el RLS del bucket. Sin esta
    // comprobación, un usuario podría pedir la foto de otro.
    if (!photoPath.startsWith(`${userId}/`)) {
      return json({ error: "photoPath fuera de tu carpeta" }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: signed, error: signErr } = await admin
      .storage.from(BUCKET).createSignedUrl(photoPath, SIGNED_URL_TTL);
    if (signErr || !signed?.signedUrl) {
      return json({ error: `No se pudo firmar la foto: ${signErr?.message || "desconocido"}` }, 404);
    }

    // La biblioteca del usuario, para que resuelva contra ella en vez de inventar nombres.
    const { data: foodRows } = await admin
      .from("foods").select("record_id, data").eq("user_id", userId).limit(MAX_LIBRARY);

    type Food = {
      id: string; name: string; aliases?: string[];
      kcal100: number; protein100: number; carbs100: number;
      fat100: number; fiber100: number; alcohol100?: number; nova: number;
    };
    const library: Food[] = (foodRows || [])
      .map((r) => ({ ...(r.data as Food), id: (r.data as Food)?.id || r.record_id }))
      .filter((f) => f && f.name);

    const libraryText = library.length
      ? library.map((f) =>
          `${f.id} | ${f.name}${f.aliases?.length ? ` (${f.aliases.join(", ")})` : ""}` +
          ` | ${f.kcal100} kcal, ${f.protein100}P ${f.carbs100}C ${f.fat100}G por 100 g | NOVA ${f.nova}`
        ).join("\n")
      : "(vacía — resuelve todos los alimentos con matchedFoodId null)";

    const anthropic = new Anthropic({ apiKey });

    const response = await anthropic.messages.parse({
      model: "claude-opus-5",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // Identificar comida y estimar una ración no necesita razonamiento profundo, y el
      // esfuerzo bajo mantiene la latencia por debajo de lo que se tolera con el móvil
      // en la mano delante del plato.
      output_config: { effort: "low", format: zodOutputFormat(MealSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: signed.signedUrl } },
          {
            type: "text",
            text: `BIBLIOTECA DE ALIMENTOS (id | nombre (alias) | macros | NOVA):\n${libraryText}\n\n` +
                  `Analiza la foto y devuelve los items del plato.`,
          },
        ],
      }],
    });

    // Los clasificadores de seguridad pueden declinar con HTTP 200. Hay que mirar
    // stop_reason ANTES de leer el contenido, o se lee un objeto vacío como si fuera un
    // plato sin comida.
    if (response.stop_reason === "refusal") {
      return json({
        error: "El modelo declinó analizar esta imagen",
        category: response.stop_details?.category ?? null,
      }, 422);
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      return json({ error: "El modelo no devolvió JSON válido. Prueba otra foto." }, 502);
    }

    // ── Resolución contra la biblioteca ────────────────────────────────────────────
    // Aquí es donde la foto deja de decidir los macros. Para todo alimento que resuelva
    // contra `foods`, los macros salen de la biblioteca y los del modelo se descartan.
    const byId = new Map(library.map((f) => [f.id, f]));
    const byName = new Map<string, Food>();
    for (const f of library) {
      byName.set(norm(f.name), f);
      for (const a of f.aliases || []) byName.set(norm(a), f);
    }

    const items = (parsed.items || []).slice(0, MAX_ITEMS).map((it) => {
      const grams = Math.max(0, Math.round(Number(it.grams) || 0));
      const known = (it.matchedFoodId && byId.get(it.matchedFoodId)) || byName.get(norm(it.name)) || null;

      if (known) {
        const per = (v: number | undefined) =>
          Math.round(((Number(v) || 0) * grams / 100) * 10) / 10;
        return {
          foodId: known.id,
          name: known.name,
          grams,
          kcal: Math.round((Number(known.kcal100) || 0) * grams / 100),
          protein: per(known.protein100),
          carbs: per(known.carbs100),
          fat: per(known.fat100),
          fiber: per(known.fiber100),
          alcohol: per(known.alcohol100),
          nova: known.nova || 3,
          estimated: true,          // los GRAMOS son estimados; los macros no
          confidence: clamp01(it.confidence),
          resolved: "biblioteca" as const,
        };
      }

      // Alimento nuevo: se acepta la estimación del modelo, marcada como tal para que la
      // UI la distinga y el coach no la use hasta que el usuario la verifique.
      const per100 = (v: number | null) => Math.max(0, Number(v) || 0);
      const kcal100 = per100(it.kcal100);
      const g = (v: number | null) => Math.round((per100(v) * grams / 100) * 10) / 10;
      return {
        foodId: null,
        name: String(it.name || "").slice(0, 80),
        grams,
        kcal: Math.round(kcal100 * grams / 100),
        protein: g(it.protein100),
        carbs: g(it.carbs100),
        fat: g(it.fat100),
        fiber: g(it.fiber100),
        alcohol: g(it.alcohol100),
        nova: clampNova(it.nova),
        estimated: true,
        confidence: clamp01(it.confidence),
        resolved: "nuevo" as const,
        // Se devuelven los valores por 100 g para que la PWA pueda crear el alimento.
        per100: {
          kcal100: Math.round(kcal100),
          protein100: per100(it.protein100),
          carbs100: per100(it.carbs100),
          fat100: per100(it.fat100),
          fiber100: per100(it.fiber100),
          alcohol100: per100(it.alcohol100),
          nova: clampNova(it.nova),
        },
      };
    }).filter((it) => it.grams > 0);

    return json({
      ok: true,
      photoPath,
      mealType: parsed.mealType,
      notes: parsed.notes,
      items,
      totals: {
        kcal: items.reduce((s, i) => s + i.kcal, 0),
        protein: Math.round(items.reduce((s, i) => s + i.protein, 0)),
      },
      usage: {
        input: response.usage?.input_tokens ?? null,
        output: response.usage?.output_tokens ?? null,
      },
    });
  } catch (err) {
    console.error("[parse-meal-photo]", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

function norm(s: string) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clamp01(v: unknown) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.5;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

function clampNova(v: unknown) {
  const n = Math.round(Number(v));
  return n >= 1 && n <= 4 ? n : 3;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
