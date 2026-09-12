import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.123.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.123.0/helpers/zod";
import { z } from "npm:zod@^3.25.0";
// C-22: `corsHeaders` y `json` compartidos. Había cuatro copias divergentes del mismo par.
import { corsHeaders, json } from "../_shared/http.ts";

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

// ── Configuración del modelo (C-21, auditoría 2026-09-09) ──────────────────────────────────
// Estaban clavadas dentro de la llamada. El modelo, sobre todo: la PWA calcula el coste con su
// propia constante (`NUT_AI_MODEL`) y, con el nombre enterrado en el cuerpo del request, los
// dos podían separarse sin que nada avisara — el coste mostrado sería el de otro modelo.
const MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;
// `medium` y no `low`: la percepción no mejora con más esfuerzo, pero la estimación de
// cantidad sí tiene razonamiento — qué hay debajo de la capa de arriba, si el plato lleva
// aceite invisible, cruzar el tamaño contra el tenedor. Y decidir entre componentes / plato /
// etiqueta es justo el paso que más afecta a la precisión. Coste: ~1,5x y algo más de latencia.
// El gramaje es el único dato que el sistema no puede derivar de ninguna otra fuente.
// El valor vive dentro del objeto (que es la forma exacta que la API recibe) y `EFFORT` es el
// nombre con el que se usa: un solo sitio que cambiar si algún día se sube o se baja.
const REASONING = { effort: "medium" } as const;
const EFFORT = REASONING.effort;
// Versión del SYSTEM de abajo. Viaja en la respuesta para que una comida registrada con un
// prompt viejo se pueda distinguir cuando el prompt cambie (mismo criterio que
// `PROMPT_VERSION` en coach-weekly-review, donde además entra en el hash de caché).
// v2 (v11.76): el caso SIN FOTO deja de ser dos frases injertadas y tiene su propia sección.
const PROMPT_VERSION = 2;

// Precios de Claude Opus 5, $/millón de tokens. Copiados de `coach-weekly-review/index.ts` a
// propósito: importar `index.ts` de otra función arrastraría su `Deno.serve` a este bundle.
const PRICE_INPUT = 5.00;
const PRICE_OUTPUT = 25.00;
const PRICE_CACHE_READ = 0.50;
const PRICE_CACHE_WRITE_5M = 6.25;

const BUCKET = "meal-photos";
const SIGNED_URL_TTL = 120;      // segundos: sólo tiene que vivir lo que dura la llamada
const MAX_LIBRARY = 400;         // techo de alimentos en el prompt
const MAX_ITEMS = 20;            // un plato con más de 20 items no es un plato
const MAX_IMAGES = 4;            // carta + plato + un par de angulos; mas no aporta

// Cada item: el modelo estima nombre, gramos y confianza. Los macros por 100 g se piden
// SOLO cuando el alimento no está en la biblioteca — o cuando es un plato compuesto, que
// entra en la biblioteca como una unidad (ver el bloque DECIDE PRIMERO del prompt).
const ItemSchema = z.object({
  name: z.string().describe("Nombre en español, singular. Para un plato compuesto de un sitio concreto: 'Sitio · Nombre del plato'"),
  matchedFoodId: z.string().nullable()
    .describe("El id EXACTO de la biblioteca si este alimento ya está en ella; null si no"),
  grams: z.number().describe("Gramos (o mililitros para líquidos) servidos. Para un plato compuesto, el peso TOTAL del plato"),
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
  kind: z.enum(["componentes", "plato", "etiqueta"])
    .describe("componentes = alimentos separables y pesables por separado; plato = compuesto que va como UNA unidad; etiqueta = hay macros publicados a la vista"),
  items: z.array(ItemSchema),
  mealType: z.enum(["desayuno", "comida", "cena", "snack"])
    .describe("Qué comida del día parece, por el contenido del plato"),
  notes: z.string().describe("Qué se ve y en qué te has apoyado para estimar la cantidad. Máximo 2 frases"),
});

const SYSTEM = `Eres un nutricionista deportivo estimando la composición de una comida a partir de una foto, de una descripción escrita, o de las dos.

TU ÚNICA TAREA DIFÍCIL ES ESTIMAR CANTIDAD. Los macros de los alimentos que ya están en la
biblioteca los pone el sistema, no tú.

## PUEDES RECIBIR VARIAS FOTOS Y UNA NOTA. Son de la MISMA comida.

Varias fotos NO son varias comidas: combínalas en un solo registro. La combinación más útil
es **carta o etiqueta + plato**: la carta da los macros publicados, la foto del plato dice
cuánto hay servido de verdad. Úsalas así — macros de la carta, cantidad del plato.

**La NOTA DEL USUARIO tiene prioridad sobre lo que veas.** Describe lo que la foto no puede
mostrar: 'me comí la mitad', 'sin la salsa', 'el pan no', 'doble ración de pollo'. Él estuvo
delante del plato y tú no. Si la nota contradice tu estimación visual, gana la nota, y lo
dices en notes.

## SI NO HAY FOTO: el registro por texto. Es un camino de primera, no un apaño.

Es un caso legítimo y frecuente: comidas ya comidas, o donde sacar el móvil no tocaba. El
texto es TODA la evidencia que tienes. Léelo literalmente y no añadas alimentos que no
nombra: en una foto puedes ver el pan que no te dijeron, en un texto no hay nada que ver.

**Cuando falte la cantidad**, no te quedes bloqueado ni la inventes en silencio: asume UNA
ración estándar de adulto de ese alimento, di en notes cuántos gramos has asumido y con qué
referencia, y BAJA la confianza a 0.3-0.4. Una ración asumida y dicha se corrige en dos
segundos; una ración asumida y callada se queda en el histórico para siempre.

**La confianza sin foto no pasa de 0.6**, salvo que haya un peso explícito ("180 g de pollo")
o un producto envasado con datos publicados — ahí sube a 0.9. Si dudas, la confianza es baja:
no la suavices para que el registro parezca mejor de lo que es. Una confianza inflada es lo
único que este sistema no puede corregir después, porque nadie vuelve a mirar lo que parecía
seguro. Y si el texto nombra un producto con etiqueta, usa sus datos publicados: un dato
publicado gana a tu mejor estimación también aquí.

**Medidas caseras → gramos.** Usa esta tabla y DI en notes cuál has aplicado:
- palma de la mano (carne o pescado, sin dedos) ≈ 110 g ya cocinado
- puño (arroz, pasta o patata cocidos) ≈ 150 g
- mano ahuecada (frutos secos, cereal seco) ≈ 30 g · un puñado ≈ 30 g
- taza ≈ 240 ml · vaso de agua ≈ 250 ml
- plato llano lleno ≈ 350-400 g · medio plato ≈ 180 g · bowl de restaurante ≈ 450 g
- cucharada sopera de aceite ≈ 14 g (125 kcal) · cucharadita ≈ 5 g
- rebanada de pan ≈ 35 g · loncha de queso ≈ 20 g
- copa de vino ≈ 150 ml · caña o botellín ≈ 330 ml

**La nota puede traer una línea que empieza por "Context —".** La escribe la app cuando el
usuario toca los atajos, y sus campos MANDAN sobre tus valores por defecto:
- *Portion*: es la cantidad. Sustituye a tu estimación de ración.
- *Cooking*: decide la grasa añadida. "grilled, no oil" → no añadas aceite. "a little oil"
  → 5 g. "pan-fried in oil" → 10 g. "deep-fried" → 15-20 g. "with butter" o "with a creamy
  sauce" → cuenta la salsa como parte del plato, no la ignores.
- *Protein*: fuente y cantidad de proteína. Si dice la cantidad, úsala tal cual.
- *Place*: "restaurant" o "takeaway" → sube la grasa añadida un 20-30% sobre lo mismo hecho
  en casa, porque fuera se cocina con más aceite y más sal; "home-cooked" → no la subas.
- *Drink*: regístrala como un item más. Si lleva alcohol, va en alcohol100, en gramos de
  etanol por 100 ml.
- *Time* y *Day*: son contexto para el resto del sistema. NO cambian ningún número tuyo: la
  hora no engorda un plato.

## DECIDE QUÉ TIPO DE COMIDA ES. Es la decisión que más afecta a la precisión.

**etiqueta** — se ven macros PUBLICADOS: etiqueta de un envase, carta de un restaurante,
captura de una app. Manda sobre todo lo demás: usa esos números tal cual, no estimes nada.
Un dato publicado siempre gana a tu mejor estimación. Confianza 0.95.
Devuelve UN item con los macros por 100 g (convierte si vienen por ración) y los gramos de
lo que vas a comer.

**plato** — un compuesto que NO puedes separar ni pesar por partes: un bowl mezclado, pasta
con salsa, un guiso, una ensalada aliñada, un wrap, un sándwich montado.
Devuelve **UN SOLO item con el plato entero**, con sus macros por 100 g de la mezcla y el
peso TOTAL del plato. NO lo descompongas en ingredientes.
Esto es una regla dura y va contra el instinto. Un bowl con 19 ingredientes tiene datos para
19 filas y verdad para ninguna: nadie puede decir cuántos gramos de hummus hay debajo del
kale. Diecinueve gramajes inventados multiplicados por macros reales dan un total con falsa
precisión, que es peor que un solo número honesto. Un número aproximado se puede corregir
después; diecinueve, no.
Nombra el plato como 'Sitio · Nombre' cuando reconozcas el establecimiento o esté escrito
('Honest Greens · Spicy Feta Bowl'). Así entra en la biblioteca como unidad, se corrige una
vez y la próxima vez es exacto.
Confianza 0.4-0.6: es una estimación de densidad, y lo sabes.

**componentes** — alimentos identificables y separables: la pechuga aquí, el arroz allá, el
aceite por encima. Es el caso de la comida cocinada en casa.
Devuelve un item por alimento. Si está en la BIBLIOTECA, pon su id exacto en matchedFoodId y
deja TODOS los macros a null: el sistema usa los suyos y descarta los tuyos, así que
rellenarlos "por ayudar" sólo gasta tokens.

## Reglas para todos los casos

1. Si no está en la biblioteca, matchedFoodId va a null y rellenas los macros por 100 g con
   valores de tabla de composición. carbs100 INCLUYE la fibra. alcohol100 sólo para bebidas
   alcohólicas, en gramos de etanol por 100 ml.
2. Estima la cantidad con referencias visibles y di en notes en cuál te apoyaste: plato llano
   26-28 cm, bowl de restaurante 400-600 g de contenido, tenedor 19-20 cm, cuchara sopera
   colmada 15 g, vaso de agua 250 ml, lata 330 ml.
3. Sé honesto con la confianza. 0.9 pesado o con etiqueta · 0.6-0.7 ración estándar bien
   visible · 0.3-0.4 con salsas, capas o a medio comer. Una confianza inflada es peor que una
   baja: la baja se marca en la app y se corrige, la inflada se cuela.
4. Cuenta las grasas invisibles: aceite de cocción si el plato brilla o está frito, aliño en
   una ensalada, salsa cremosa. Es la fuente de calorías que más se olvida y la que más
   descuadra el día.
5. NO inventes lo que no ves. Si la foto está borrosa o no es comida ni etiqueta, devuelve
   items vacío y dilo en notes.
6. Nombres en español, en singular. Sin marca comercial, EXCEPTO en el nombre de un plato
   compuesto de un sitio concreto, donde el sitio es lo que lo identifica.`;

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

    // Varias fotos de la MISMA comida: tipico carta + plato, o dos angulos. Se acepta
    // `photoPath` suelto por compatibilidad con la version anterior.
    const rawPaths: string[] = Array.isArray(body.photoPaths)
      ? body.photoPaths
      : (body.photoPath ? [body.photoPath] : []);
    const photoPaths = rawPaths.filter((x) => typeof x === "string" && x).slice(0, MAX_IMAGES);

    // La nota es lo que la foto NO puede mostrar ("me comi la mitad", "sin la salsa"). Es la
    // mejora de precision mas barata que existe aqui: informacion que no esta en los pixeles.
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 600) : "";

    if (!photoPaths.length && !note) {
      return json({ error: "Hace falta al menos una foto o una nota" }, 400);
    }
    // La URL firmada se crea con la service role, que ignora el RLS del bucket. Sin esta
    // comprobación, un usuario podría pedir la foto de otro.
    for (const path of photoPaths) {
      if (!path.startsWith(`${userId}/`)) {
        return json({ error: "photoPath fuera de tu carpeta" }, 403);
      }
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const signedUrls: string[] = [];
    for (const path of photoPaths) {
      const { data: signed, error: signErr } = await admin
        .storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
      if (signErr || !signed?.signedUrl) {
        return json({ error: `No se pudo firmar la foto: ${signErr?.message || "desconocido"}` }, 404);
      }
      signedUrls.push(signed.signedUrl);
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
      model: MODEL,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: EFFORT, format: zodOutputFormat(MealSchema) },
      system: SYSTEM,
      messages: [{
        role: "user",
        content: [
          ...signedUrls.map((url) => ({
            type: "image" as const,
            source: { type: "url" as const, url },
          })),
          {
            type: "text" as const,
            text: `BIBLIOTECA DE ALIMENTOS (id | nombre (alias) | macros | NOVA):
${libraryText}

` +
                  (signedUrls.length > 1
                    ? `Recibes ${signedUrls.length} fotos de la MISMA comida. Combinalas en UN solo registro.

`
                    : signedUrls.length === 0 ? `No hay foto: registra a partir de la nota, con las reglas de la sección SIN FOTO.

` : ``) +
                  (note ? `NOTA DEL USUARIO: ${note}

` : ``) +
                  `Devuelve los items de esta comida.`,
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
      photoPaths,
      photoPath: photoPaths[0] || null,
      note,
      kind: parsed.kind,
      mealType: parsed.mealType,
      notes: parsed.notes,
      items,
      totals: {
        kcal: items.reduce((s, i) => s + i.kcal, 0),
        protein: Math.round(items.reduce((s, i) => s + i.protein, 0)),
      },
      // C-21: el coste se calcula AQUÍ, donde se conocen el modelo y los tokens reales. La PWA
      // lo recalculaba con su propia tabla de precios y su propia idea del modelo; con `usage`
      // completo puede guardarlo tal cual y el número deja de depender de dos sitios.
      usage: usageOf(response),
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

/** Tokens, coste y de qué modelo/prompt salieron. Gemelo del de `coach-weekly-review`. */
function usageOf(response: unknown) {
  const u = (response as { usage?: Record<string, unknown> })?.usage || {};
  const input = Number(u.input_tokens ?? 0) || 0;
  const output = Number(u.output_tokens ?? 0) || 0;
  const cacheRead = Number(u.cache_read_input_tokens ?? 0) || 0;
  const cacheWrite = Number(u.cache_creation_input_tokens ?? 0) || 0;
  const costUsd = Math.round(
    ((input * PRICE_INPUT + output * PRICE_OUTPUT + cacheRead * PRICE_CACHE_READ +
      cacheWrite * PRICE_CACHE_WRITE_5M) / 1_000_000) * 10000,
  ) / 10000;
  return { input, output, cacheRead, cacheWrite, costUsd, model: MODEL, promptVersion: PROMPT_VERSION };
}
