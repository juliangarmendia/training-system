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

// Fases del bloque (contrato v2, 2026-09-07). El coach trabaja por SEMANAS y la Home enseña en
// qué etapa está: `base` (1-2 tras un deload) · `build` (3-4) · `intensify` (sólo con adherencia
// ≥75 % y rendimiento verde 2 semanas) · `deload` (obligatoria si `facts.block.isDeload`) ·
// `maintenance` (la grasa manda y la fuerza aguanta). El enum vive aquí y el saneado de
// `index.ts` lo vuelve a comprobar: el decodificador restringido no puede emitir otra cosa,
// pero una revisión v1 en caché sí, y esa también pasa por el saneado.
export const PHASES = ["base", "build", "intensify", "deload", "maintenance"] as const;

// Estado de cada sesión de la semana en `proposal.weekSummary`. `kept` es el caso normal y por
// eso lleva línea igual que los demás: mantener también se justifica.
export const WEEK_SUMMARY_STATUS = ["kept", "changed", "new", "removed"] as const;

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

  // Una fila por CADA sesión del plan activo, también las que no cambian. Es el campo que hace
  // visible "por qué sigue igual" en Home: sin él, una semana estable se lee como una semana en
  // la que el coach no miró nada.
  const WeekSummaryRow = z.object({
    sessionId: SessionId.describe("Id EXACTO de una de las sesiones permitidas"),
    status: z.enum(WEEK_SUMMARY_STATUS).describe(
      "'kept' si la sesión no cambia · 'changed' si cambia (y entonces va en `sessions`) · " +
        "'new' si se añade · 'removed' si sale de la semana",
    ),
    line: z.string().describe(
      "Una línea, máximo 160 caracteres, CON EL NÚMERO que la justifica. " +
        "Ej: 'Upper A igual: 8/8/7 @7,5 el 1-sep, un dato más antes de subir'",
    ),
  });

  const Proposal = z.object({
    label: z.string().describe("Nombre corto de la semana, p. ej. 'B1 · S3 — base aeróbica'"),
    phase: z.enum(PHASES).describe(
      "Fase del bloque, la misma que `briefing.phase`. 'deload' es OBLIGATORIA si " +
        "`facts.block.isDeload` es true o LOAD-004 la dispara",
    ),
    weekSummary: z.array(WeekSummaryRow).describe(
      "UNA FILA POR CADA SESIÓN del plan activo, también las que NO cambian. Máximo 12. " +
        "Es lo que la app enseña como 'qué cambia y qué sigue igual, y por qué'.",
    ),
    sessions: z.array(Session).describe(
      "SÓLO las sesiones que cambian respecto al plan activo. Máximo 6. " +
        "Una sesión que se mantiene igual NO se incluye: el servidor conserva la del plan activo byte a byte. " +
        "Su motivo va igualmente en `weekSummary` con status 'kept'.",
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
    focus: z.string().describe(
      "El enfoque de la semana en UNA frase, máximo 160 caracteres, con su número. " +
        "Es el titular de la Home. Ej: 'Mantener los 6 anclas y subir el largo a 6,5 km'",
    ),
    phase: z.enum(PHASES).describe("La etapa de esta semana. La misma que `proposal.phase`"),
    lastWeek: z.string().describe(
      "Markdown con EXACTAMENTE dos secciones y en este orden: '## Qué pasó (semana {W}, {n} días de datos)' " +
        "y '## Decisiones anteriores'. Números en todas las frases; n siempre. " +
        "Al menos un número de recorrido (desde el inicio) sacado de `facts.trajectory`.",
    ),
    lastWeekSummary: z.array(z.string()).describe(
      "Máximo 3 líneas de ≤160 caracteres: hecho vs planificado y el número que importa. " +
        "Ej: '3 de 4 sesiones · banca 95×8 ↑'. Es lo que se ve en la Home sin abrir nada",
    ),
    whyChanged: z.string().describe(
      "Markdown, máximo 600 caracteres: POR QUÉ cambia lo que cambia, con el dato que lo dispara y " +
        "al menos un número de recorrido de `facts.trajectory`. CADENA VACÍA si esta semana no cambia nada",
    ),
    whyKept: z.string().describe(
      "Markdown, máximo 600 caracteres: POR QUÉ se mantiene lo que se mantiene, con el dato que lo sostiene " +
        "y al menos un número de recorrido de `facts.trajectory`. NUNCA vacío: mantener también se justifica",
    ),
    nextWeek: z.string().describe(
      "Markdown con EXACTAMENTE cinco secciones y en este orden: '## Qué cambio — máx 3 prioridades', " +
        "'## Por qué cambia', '## Por qué se mantiene', '## Qué vigilo esta semana', '## Qué necesito de ti'.",
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
