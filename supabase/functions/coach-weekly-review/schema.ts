// Esquema de salida del coach semanal — zod dinámico por request.
//
// POR QUÉ ES DINÁMICO. Los `z.enum(...)` de ids de sesión y de ejercicio se construyen con
// el vocabulario que la PWA manda en `allowed`. Es la única forma de que el modelo no invente
// un `trap-bar-deadlift-v2` que la app no sabe renderizar: el decodificador restringido no
// puede emitir un id fuera del enum, así que el problema desaparece en el origen en vez de
// arreglarse en el saneado. Si `allowed` llega vacío (primer arranque, librería sin cargar)
// se cae a `z.string()` y el saneado de `index.ts` hace el filtro — pero eso se anota en
// `sanitized[]`, porque significa que el modelo estuvo sin barandilla.
//
// COMPATIBILIDAD CON `zodOutputFormat`. Nada de `.transform()`, `.refine()`, `.optional()`
// ni `.min()/.max()`: el decodificador restringido no expresa esas formas y los límites se
// imponen en código (mismo criterio que `MAX_ITEMS` en parse-meal-photo). Todo campo que
// pueda faltar es `.nullable()`, no `.optional()` — la salida estructurada exige que la clave
// esté presente. Los topes ("máximo 3", "≤240 caracteres") viajan en `.describe()` porque
// el modelo los lee; el que los hace ciertos es el saneado.

import { z } from "npm:zod@^3.25.0";

export type AllowedExercise = {
  id: string;
  name?: string;
  muscle?: string;
  db?: boolean;
  bw?: boolean;
  measure?: boolean;
};

export type Allowed = {
  sessionIds: string[];
  exerciseIds: AllowedExercise[];
};

/** `z.enum` necesita al menos un valor y una tupla no vacía; si no hay ids, cae a string. */
function idEnum(ids: string[]) {
  const clean = [...new Set(ids.filter((x) => typeof x === "string" && x.trim()))];
  if (clean.length === 0) return z.string();
  return z.enum(clean as [string, ...string[]]);
}

/** Para que `index.ts` pueda anotar en `sanitized[]` que se corrió sin enum. */
export function enumsAreOpen(allowed: Allowed) {
  return {
    sessions: !(allowed?.sessionIds?.length > 0),
    exercises: !(allowed?.exerciseIds?.length > 0),
  };
}

export const DECISION_TYPES = [
  "progression",
  "structure",
  "running",
  "nutrition",
  "recovery",
] as const;

export const CARDIO_SUBTYPES = [
  "zone2",
  "long_easy",
  "zone3",
  "threshold",
  "intervals",
  "recovery",
] as const;

export const CHANGE_KINDS = ["reorder", "remove", "add", "swap", "sets"] as const;

export const SLOT_TYPES = ["gym", "run", "recovery", "rest"] as const;

export function CoachOutputSchema(allowed: Allowed) {
  const SessionId = idEnum(allowed?.sessionIds || []);
  const ExerciseId = idEnum((allowed?.exerciseIds || []).map((e) => e?.id).filter(Boolean) as string[]);

  const Target = z.object({
    kg: z.number().nullable().describe(
      "Kg objetivo del top set. POR MANO en ejercicios `db`. `+kg` de lastre en `bw`. " +
        "SIEMPRE null en ejercicios `measure` y cuando no hay dato de origen: en ese caso " +
        "note dice 'ajustar por RPE, sin dato'. Nunca inventes un número.",
    ),
    reps: z.string().describe("Rango o número de reps objetivo, p. ej. '5-8' o '8'"),
    rpe: z.string().describe("RPE objetivo, p. ej. '7-8'"),
    note: z.string().describe(
      "Una frase, máximo 240 caracteres, con el número que justifica el objetivo. " +
        "Ej: '105x5 @7,0 el 6-sep: mismo kg hasta 8 reps'",
    ),
    evidence: z.array(z.string()).describe("Rule IDs que soportan este objetivo, p. ej. ['STR-001']"),
    decisionId: z.string().nullable().describe("Id de la decisión de `decisions[]` que lo explica, o null"),
  });

  const Exercise = z.object({
    id: ExerciseId.describe("Id EXACTO de la lista de ejercicios permitidos"),
    sets: z.number().describe("Series de trabajo"),
    reps: z.string().describe("Rango prescrito, p. ej. '5-8'"),
    rpe: z.string().describe("RPE prescrito, p. ej. '7-8'"),
    optional: z.boolean().describe("true si se puede saltar cuando falta tiempo"),
    superset: z.string().nullable().describe("Etiqueta del superserie compartida, o null"),
    target: Target,
  });

  const Change = z.object({
    kind: z.enum(CHANGE_KINDS).describe("Qué tipo de cambio estructural es"),
    exId: z.string().nullable().describe("Ejercicio afectado (id permitido), o null si el cambio es de sesión"),
    why: z.string().describe("Motivo con el número que lo justifica. Máximo 240 caracteres"),
    decisionId: z.string().nullable().describe("Id de la decisión que lo explica, o null"),
  });

  const Session = z.object({
    id: SessionId.describe("Id EXACTO de una de las sesiones permitidas"),
    focus: z.string().describe("Una frase de qué se juega esta sesión. Ej: 'Banca mantiene 95. El remo sube.'"),
    exercises: z.array(Exercise).describe("Orden de ejecución. Máximo 10 ejercicios"),
    changes: z.array(Change).describe("Cambios respecto al plan activo. Vacío si la sesión no cambia"),
  });

  const CardioSlot = z.object({
    dow: z.number().describe("Día de la semana, 0 = domingo … 6 = sábado"),
    subtype: z.enum(CARDIO_SUBTYPES).describe("Tipo de sesión de cardio"),
    durationMin: z.number().describe("Duración en minutos"),
    distanceKm: z.number().nullable().describe("Km objetivo, o null si la sesión se prescribe por tiempo"),
    note: z.string().describe("Instrucción concreta con el techo de FC. Máximo 240 caracteres"),
  });

  const WeekTemplateChange = z.object({
    dow: z.number().describe("Día de la semana, 0 = domingo … 6 = sábado"),
    type: z.enum(SLOT_TYPES).describe("Qué pasa a ser ese día"),
    sessionId: SessionId.nullable().describe("Sesión de fuerza si type = gym; null en el resto"),
    label: z.string().nullable().describe("Etiqueta corta para los días que no son gym, o null"),
    why: z.string().describe("Por qué se mueve el día. Máximo 240 caracteres"),
  });

  const Decision = z.object({
    id: z.string().describe("Id estable y legible, p. ej. 'W37-banca-frecuencia'"),
    type: z.enum(DECISION_TYPES),
    what: z.string().describe("Qué cambia, en una frase, con el número"),
    why: z.string().describe(
      "Dato → decisión. Si la regla citada es `expert` o `weak_extrapolated`, dilo: " +
        "'es práctica, no evidencia fuerte'",
    ),
    evidence: z.object({
      numbers: z.record(z.string()).describe(
        "Los números que sostienen la decisión, como pares clave→valor en texto. " +
          "Ej: { 'banca top set': '95x7 @8,0 el 24-ago', 'exposiciones de press/sem': '5 en 10 días' }. " +
          "NUNCA vacío.",
      ),
    }),
    ruleIds: z.array(z.string()).describe("Rule IDs del corpus que la soportan. NUNCA vacío"),
    confidence: z.enum(["low", "medium", "high"]).describe("Confianza en la decisión dado el tamaño de muestra"),
  });

  const Proposal = z.object({
    label: z.string().describe("Nombre corto de la semana, p. ej. 'B1 · S3 — base aeróbica'"),
    phase: z.enum(["build", "deload"]).describe("Fase del bloque. 'deload' sólo si el bloque o LOAD-004 lo piden"),
    sessions: z.array(Session).describe(
      "SÓLO las sesiones que cambian respecto al plan activo. Máximo 6. " +
        "Una sesión que se mantiene igual NO se incluye: el servidor conserva la del plan activo byte a byte.",
    ),
    cardio: z.array(CardioSlot).describe("Slots de cardio de la semana"),
    running: z.object({
      weeklyKmTarget: z.number().describe("Km objetivo de la semana. 0 si la semana se prescribe por tiempo"),
      longRunKm: z.number().nullable().describe("Km del largo, o null si va por tiempo"),
      hardSessions: z.number().describe("Sesiones duras de cardio. Máximo 1"),
    }),
    weekTemplateChanges: z.array(WeekTemplateChange).describe(
      "Cambios de calendario. Vacío si la semana mantiene la plantilla activa",
    ),
  });

  const Briefing = z.object({
    lastWeek: z.string().describe(
      "Markdown con EXACTAMENTE dos secciones y en este orden: '## Qué pasó (semana {W}, {n} días de datos)' " +
        "y '## Decisiones anteriores'. Números en todas las frases; n siempre.",
    ),
    nextWeek: z.string().describe(
      "Markdown con EXACTAMENTE cuatro secciones y en este orden: '## Qué cambio — máx 3 prioridades', " +
        "'## Por qué', '## Qué vigilo esta semana', '## Qué necesito de ti'.",
    ),
    priorities: z.array(z.string()).describe(
      "Exactamente 3. Cada una una línea con su número. Son las mismas 3 que la sección 'Qué cambio'",
    ),
  });

  return z.object({
    briefing: Briefing,
    decisions: z.array(Decision).describe("Una por cada cambio estructural o de carga. Cada una con números y ruleIds"),
    proposal: Proposal,
    requestedData: z.array(z.string()).describe(
      "Qué dato falta y para qué decisión lo necesitas. Vacío si no falta nada",
    ),
  });
}

export type CoachOutput = z.infer<ReturnType<typeof CoachOutputSchema>>;
