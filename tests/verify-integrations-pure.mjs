// Coach v2.1 · A-1/A-2 — los módulos PUROS de las integraciones: atribución de fecha
// (`_shared/dates.ts`), decodificación de la báscula (`_shared/measures.ts`), traducción de
// WHOOP a `wellness` (`_shared/whoop-wellness.ts`) y la firma del webhook (`_shared/http.ts`).
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR: que un dato correcto acabe en el día equivocado
// o con la magnitud equivocada, en silencio y sin que nada falle.
//
//   · `dayOf` con una constante de zona horaria en vez del offset del propio registro: dos
//     veces al año, en el cambio de hora, la noche del sábado se apunta al domingo. Nadie ve un
//     error: sólo una media de 7 días que ya no cuadra con lo que marcaba la app ese día.
//   · `dayOf` sobre `created_at` (hora de PUNTUACIÓN de WHOOP) en vez de sobre el despertar:
//     si la correa sincroniza a mediodía, el recovery de hoy se escribe en el día de hoy... o
//     en el de mañana si la app abre después de medianoche. El readiness se desplaza un día
//     entero y el coach razona sobre la noche que no es.
//   · `pickNight` sin filtrar `nap:true`: una siesta de 25 minutos con puntuación alta
//     sustituye a la noche real. `sleepSecs` cae a 0,4 h y la señal de sueño se dispara.
//   · `decodeMeasure` ignorando `unit`: Withings devuelve `{value: 84350, unit: -3}`, que son
//     84,35 kg. Sin la potencia de diez, el peso entra como 84.350 kg y la pendiente de peso
//     del facts pack (y con ella el ETA del objetivo) se convierte en ruido.
//   · `groupByDay` sin excluir `attrib === 1`: en una Body+ compartida esa medida es de OTRA
//     PERSONA. Entra en la tendencia como si fuera un salto de 12 kg en un día.
//   · `groupByDay` quedándose con la última pesada del día en vez de la primera: pesarse
//     después de cenar y en ayunas no es lo mismo, y mezclarlas añade ±1 kg de ruido diario.
//   · `groupByDay` quedándose con "el primer grupo" del día: la Body Smart manda el pulso en
//     un grupo aparte con el MISMO timestamp y delante del de peso — la fila salía sin `weight`
//     y la app pintaba "NaN kg" (2026-09-09).
//   · `mergeBodyweight` pisando el peso MANUAL con el de la báscula: Julian escribió ese número
//     a propósito; verlo cambiar solo es la forma más rápida de dejar de fiarse de la app.
//
// A-2 añade tres formas más de romperse en silencio:
//
//   · `sleepSecs` escrito como tiempo EN CAMA en vez de tiempo DORMIDO: infla el sueño medio
//     unos 40 min por noche, y la señal de sueño del readiness deja de dispararse nunca.
//   · Un parche de `wellness` que incluya `ctl`, `atl`, `rampRate`, `steps` o `weight`: son de
//     intervals.icu y de Withings. Escribirlos desde WHOOP los pisa con datos que no existen.
//   · La firma del webhook mal formada (hex en vez de base64, cuerpo antes del timestamp, o
//     el JSON reserializado en vez del cuerpo crudo): la comparación falla SIEMPRE y ningún
//     evento entra nunca — o, peor, si se relajara la comprobación, entraría cualquiera.
//
// A-7 añade dos módulos y cinco silencios más:
//
//   · `normalizeActivity` leyendo `start_date` (UTC) en vez de `start_date_local`: la carrera de
//     las 00:30 de Madrid se apunta al día anterior y la semana de carrera cuenta un día que no fue.
//   · Un `feel: null` en el parche de `runs`. El servidor escribe con `merge_generic_row`
//     (`data || patch`), así que un null no dice "no tengo dato": BORRA el que había. La
//     sensación que el usuario tecleó sobre una carrera importada desaparece en el sync siguiente.
//   · El `weight` suavizado de intervals.icu tratado como medida: inventa días de "peso estable"
//     que son una sola pesada repetida, y con ellos una pendiente de peso falsa.
//   · El parche de intervals.icu pisando el readiness de WHOOP o el peso de Withings: llega
//     horas tarde y degradado, sin fases de sueño ni composición (D-1).
//   · `maskSecret` enseñando parte de una clave corta, o un `•` por carácter: lo primero filtra
//     un tercio de la credencial de intervals.icu, lo segundo publica su longitud.
//
// Node 25 borra los tipos de TypeScript sin build, así que el test importa los `.ts` directos.
// Por eso esos dos módulos son de sintaxis borrable, con imports relativos `.ts` y sin tocar
// `Deno` al cargarse: si alguien mete un `enum` o un `Deno.env.get` en el top level, este test
// deja de arrancar y el aviso llega antes del despliegue.
//
// Ejecutar desde la raíz del repo: node tests/verify-integrations-pure.mjs

import { pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';

const dates = await import(pathToFileURL('supabase/functions/_shared/dates.ts').href);
const measures = await import(pathToFileURL('supabase/functions/_shared/measures.ts').href);
const wellnessMod = await import(pathToFileURL('supabase/functions/_shared/whoop-wellness.ts').href);
const http = await import(pathToFileURL('supabase/functions/_shared/http.ts').href);
// A-7: los dos módulos puros nuevos. Que este import funcione ya es una comprobación — si
// alguien mete un `enum`, un import no relativo o un `Deno.env.get` en el top level, el test
// deja de arrancar y el aviso llega antes del despliegue.
const cardio = await import(pathToFileURL('supabase/functions/_shared/cardio-types.ts').href);
const icu = await import(pathToFileURL('supabase/functions/_shared/intervals-wellness.ts').href);

const { dayOf, pickNight, pickNightsByDay, parseOffsetMinutes } = dates;
const { decodeMeasure, groupByDay, mergeBodyweight, buildBodyweightPatch, isManualRow, MEAS_TYPES } = measures;
const { buildWellnessPatch, WELLNESS_KEYS, FORBIDDEN_KEYS } = wellnessMod;
const { hmacBase64, timingSafeEqual } = http;

const TZ = 'Europe/Madrid';
let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// ── 1. dayOf en el cambio de hora de marzo (2026-03-29, +1 → +2 a las 01:00 UTC) ───────────
console.log('1. dayOf · cambio de hora de primavera (2026-03-29)');
eq(dayOf('2026-03-28T23:30:00Z', null, TZ), '2026-03-29',
   'aún en CET (+1): 23:30Z es 00:30 del día 29');
eq(dayOf('2026-03-29T01:30:00Z', null, TZ), '2026-03-29',
   'ya en CEST (+2): 01:30Z es 03:30 del día 29 (la hora que no existió)');
eq(dayOf('2026-03-29T22:30:00Z', null, TZ), '2026-03-30',
   'con +2 la noche del 29 a las 22:30Z ya es día 30 — con una constante +1 saldría el 29');

// ── 2. dayOf en el cambio de hora de otoño (2026-10-25, +2 → +1 a las 01:00 UTC) ───────────
console.log('2. dayOf · cambio de hora de otoño (2026-10-25)');
eq(dayOf('2026-10-24T22:30:00Z', null, TZ), '2026-10-25',
   'aún en CEST (+2): 22:30Z es 00:30 del día 25');
eq(dayOf('2026-10-25T22:30:00Z', null, TZ), '2026-10-25',
   'ya en CET (+1): 22:30Z sigue siendo el 25 — con una constante +2 saldría el 26');
eq(dayOf('2026-10-25T23:30:00Z', null, TZ), '2026-10-26',
   'CET (+1): 23:30Z es 00:30 del día 26');

// ── 3. dayOf con un instante 'Z' y el offset del propio registro ───────────────────────────
console.log('3. dayOf · instante Z + timezone_offset del proveedor');
eq(dayOf('2026-03-28T23:30:00Z', '+02:00'), '2026-03-29',
   "offset '+02:00' sobre un instante Z → día siguiente");
eq(dayOf('2026-03-28T23:30:00Z', '-05:00'), '2026-03-28',
   "el mismo instante con '-05:00' (viaje) → el día anterior: el offset manda, no la constante");
eq(dayOf('2026-03-28T23:30:00Z', 'Z'), '2026-03-28', "offset 'Z' = UTC");
eq(parseOffsetMinutes('+02:00'), 120, "parseOffsetMinutes('+02:00') = 120");
eq(parseOffsetMinutes('-0530'), -330, "parseOffsetMinutes('-0530') = -330");
eq(String(parseOffsetMinutes('')), 'null', 'sin offset → null (se usa la zona de respaldo)');

// ── 4. pickNight ───────────────────────────────────────────────────────────────────────────
console.log('4. pickNight · ignora siestas y elige la más larga');
const nap = { id: 'nap', nap: true, start: '2026-09-08T14:00:00Z', end: '2026-09-08T18:00:00Z' }; // 4 h
const nightShort = { id: 'corta', nap: false, start: '2026-09-07T22:00:00Z', end: '2026-09-08T00:30:00Z' }; // 2,5 h
const nightLong = { id: 'larga', nap: false, start: '2026-09-07T23:00:00Z', end: '2026-09-08T06:30:00Z' }; // 7,5 h
eq(pickNight([nap, nightShort, nightLong])?.id, 'larga',
   'entre dos noches del mismo día gana la más larga');
eq(pickNight([nap, nightShort])?.id, 'corta',
   'la siesta de 4 h no gana a una noche de 2,5 h: `nap:true` está fuera del reparto');
eq(String(pickNight([nap])), 'null', 'sólo siestas → null (no hay noche que atribuir)');
eq(String(pickNight([])), 'null', 'lista vacía → null');
const byDay = pickNightsByDay([nap, nightShort, nightLong], TZ);
eq(byDay['2026-09-08']?.id, 'larga', 'pickNightsByDay agrupa por día de despertar');

// ── 5. decodeMeasure ───────────────────────────────────────────────────────────────────────
console.log('5. decodeMeasure · value × 10^unit');
eq(decodeMeasure({ value: 84350, unit: -3 }), 84.35, '{value:84350, unit:-3} → 84,35 kg');
eq(decodeMeasure({ value: 173, unit: -1 }), 17.3, '{value:173, unit:-1} → 17,3');
eq(decodeMeasure({ value: 84, unit: 0 }), 84, 'unit 0 → el valor tal cual');
eq(MEAS_TYPES[1], 'weight', 'tipo 1 = peso');
eq(MEAS_TYPES[6], 'fatPct', 'tipo 6 = % de grasa');
eq(MEAS_TYPES[5], 'ffmKg', 'tipo 5 = masa libre de grasa');
eq(MEAS_TYPES[8], 'fatMassKg', 'tipo 8 = masa grasa');
eq(MEAS_TYPES[76], 'muscleKg', 'tipo 76 = músculo');
eq(MEAS_TYPES[77], 'waterKg', 'tipo 77 = agua');
eq(MEAS_TYPES[88], 'boneKg', 'tipo 88 = hueso');
// Body Smart (2026-09-08): pulso, grasa visceral, metabolismo basal y edad metabólica también
// viajan por getmeas; sin estos códigos la báscula quedaría reducida a peso + % grasa.
eq(MEAS_TYPES[11], 'heartRateBpm', 'tipo 11 = pulso en la báscula');
eq(MEAS_TYPES[170], 'visceralFat', 'tipo 170 = grasa visceral (índice)');
eq(MEAS_TYPES[226], 'bmrKcal', 'tipo 226 = metabolismo basal');
eq(MEAS_TYPES[227], 'metabolicAge', 'tipo 227 = edad metabólica');
eq(MEAS_TYPES[168], 'extracellularWaterKg', 'tipo 168 = agua extracelular');
eq(MEAS_TYPES[169], 'intracellularWaterKg', 'tipo 169 = agua intracelular');
eq(MEAS_TYPES[155], 'vascularAge', 'tipo 155 = edad vascular');
{
  // La lista que se pide a la API se deriva del mapa: no puede pedirse un tipo que no se decodifica
  // ni decodificarse uno que no se pide.
  const g = [{ grpid: 9, attrib: 0, date: 1757311500, measures: [
    { type: 1, value: 84350, unit: -3 }, { type: 11, value: 58, unit: 0 }, { type: 170, value: 7, unit: 0 },
    { type: 226, value: 1812, unit: 0 }, { type: 227, value: 34, unit: 0 }, { type: 999, value: 1, unit: 0 },
  ] }];
  const rows = groupByDay(g, 'Europe/Madrid');
  const row = rows[Object.keys(rows)[0]];
  eq(row.heartRateBpm, 58, 'el pulso de la báscula entra en la fila');
  eq(row.visceralFat, 7, 'la grasa visceral entra como índice');
  eq(row.bmrKcal, 1812, 'el metabolismo basal entra en kcal/día');
  eq(row.metabolicAge, 34, 'la edad metabólica entra en años');
  yes(!Object.values(row).includes(1) || row.withingsN === 1, 'un tipo desconocido (999) no crea clave alguna');
}

// ── 6. groupByDay ──────────────────────────────────────────────────────────────────────────
console.log('6. groupByDay · la más temprana del día, sin las medidas de otra persona');
const sec = (h, m) => Math.floor(Date.UTC(2026, 8, 8, h, m, 0) / 1000); // UTC; Madrid = +2 ese día
const grps = [
  // 06:00 local pero attrib:1 → OTRA PERSONA: no debe ganar por ser la más temprana ni contar.
  { grpid: 1, attrib: 1, date: sec(4, 0), measures: [{ value: 96200, type: 1, unit: -3 }] },
  // 21:40 local: la de después de cenar.
  { grpid: 3, attrib: 0, date: sec(19, 40), measures: [{ value: 85900, type: 1, unit: -3 }] },
  // 07:05 local, en ayunas: ésta es la buena.
  {
    grpid: 2,
    attrib: 0,
    date: sec(5, 5),
    measures: [
      { value: 84350, type: 1, unit: -3 },
      { value: 173, type: 6, unit: -1 },
      { value: 69750, type: 5, unit: -3 },
      { value: 14600, type: 8, unit: -3 },
      { value: 66200, type: 76, unit: -3 },
      { value: 48300, type: 77, unit: -3 },
      { value: 3550, type: 88, unit: -3 },
    ],
  },
];
const rows = groupByDay(grps, TZ);
const day = rows['2026-09-08'];
yes(!!day, 'hay fila para 2026-09-08');
eq(day?.weight, 84.35, 'toma la pesada de las 07:05 (la más temprana atribuida), no la de las 21:40');
eq(day?.withingsN, 2, 'withingsN = 2: cuenta las dos pesadas del usuario, no la de attrib:1');
eq(day?.withingsGrpId, 2, 'withingsGrpId es el del grupo elegido');
eq(day?.source, 'withings', "source = 'withings'");
eq(day?.measured, true, 'measured = true');
eq(day?.fatPct, 17.3, 'fatPct decodificado');
eq(day?.bfPct, 17.3, 'bfPct espeja fatPct (es la clave que ya leen nutFfmKg y la cintura)');
eq(day?.ffmKg, 69.75, 'ffmKg decodificado');
eq(day?.fatMassKg, 14.6, 'fatMassKg decodificado');
eq(day?.muscleKg, 66.2, 'muscleKg decodificado');
eq(day?.waterKg, 48.3, 'waterKg decodificado');
eq(day?.boneKg, 3.55, 'boneKg decodificado');
eq(day?.timestamp, sec(5, 5) * 1000, 'timestamp en ms del grupo elegido');
yes(Object.keys(rows).length === 1, 'una sola fila: todo cae en el mismo día local');

const soloAttrib1 = groupByDay(
  [{ grpid: 9, attrib: 1, date: sec(4, 0), measures: [{ value: 96200, type: 1, unit: -3 }] }],
  TZ,
);
eq(Object.keys(soloAttrib1).length, 0, 'un día con SÓLO medidas attrib:1 no genera fila');

// ── 6b. La Body Smart manda DOS grupos por pesada (2026-09-09) ────────────────────────────
// Reproducción literal de lo que devolvió la API el 8 y el 9 de septiembre: un grupo con SÓLO
// el pulso (tipo 11) y otro con peso y composición, el MISMO `date`, y el del pulso delante
// (grpid más alto). Quedarse con "el primero del día" dejaba la fila sin `weight` y la app
// pintaba "NaN kg" en Stats › Body.
console.log('6b. groupByDay · dos grupos con el mismo timestamp: el pulso no pisa el peso');
const dobles = [
  { grpid: 8395287124, attrib: 0, date: sec(4, 37), measures: [{ value: 85, type: 11, unit: 0 }] },
  {
    grpid: 8395287115, attrib: 0, date: sec(4, 37),
    measures: [
      { value: 86101, type: 1, unit: -3 }, { value: 68080, type: 5, unit: -3 }, { value: 20917, type: 6, unit: -3 },
      { value: 18010, type: 8, unit: -3 }, { value: 64680, type: 76, unit: -3 }, { value: 47410, type: 77, unit: -3 },
      { value: 3390, type: 88, unit: -3 }, { value: 28, type: 170, unit: -1 }, { value: 1992, type: 226, unit: 0 },
      { value: 31, type: 227, unit: 0 },
    ],
  },
  // Y una pesada de la NOCHE (21:40 local), que no debe ganar a la de la mañana.
  { grpid: 8395299999, attrib: 0, date: sec(19, 40), measures: [{ value: 87400, type: 1, unit: -3 }, { value: 70, type: 11, unit: 0 }] },
];
const doble = groupByDay(dobles, TZ)['2026-09-08'];
yes(!!doble, 'hay fila para 2026-09-08');
eq(doble?.weight, 86.101, 'el peso entra aunque el grupo del pulso vaya delante con el mismo timestamp');
eq(doble?.heartRateBpm, 85, 'y el pulso del grupo aparte entra en la misma fila');
eq(doble?.fatPct, 20.917, 'la composición viaja con el peso de la mañana');
eq(doble?.visceralFat, 2.8, 'grasa visceral con unit -1 decodificada');
eq(doble?.withingsN, 2, 'withingsN cuenta PESADAS (grupos con peso): 2, no 3 grupos');
eq(doble?.withingsGrpId, 8395287115, 'withingsGrpId es el del grupo que trae el peso de la mañana');
eq(doble?.timestamp, sec(4, 37) * 1000, 'timestamp = la pesada de la mañana');
const soloPulso = groupByDay([{ grpid: 1, attrib: 0, date: sec(5, 0), measures: [{ value: 60, type: 11, unit: 0 }] }], TZ)['2026-09-08'];
eq(soloPulso?.weight, undefined, 'un día con SÓLO pulso no inventa peso');
eq(soloPulso?.heartRateBpm, 60, 'pero el pulso se guarda');
eq(soloPulso?.withingsN, 1, 'y withingsN cae al número de grupos cuando no hay pesada');

// ── 7. mergeBodyweight ─────────────────────────────────────────────────────────────────────
console.log('7. mergeBodyweight · el peso manual manda; la báscula añade composición');
const manual = { date: '2026-09-08', weight: 85.4, measured: true, waistCm: 84 };
const merged = mergeBodyweight(manual, day);
eq(merged.weight, 85.4, 'conserva el peso MANUAL');
eq(merged.weightWithings, 84.35, 'añade weightWithings con el de la báscula');
eq(merged.fatPct, 17.3, 'añade la composición que el manual no tiene');
eq(merged.bfPct, 17.3, 'el bfPct del dispositivo sustituye al estimado Navy del día');
eq(merged.waistCm, 84, 'las medidas de cinta se conservan');
eq(String(merged.source), 'undefined', 'la fila sigue siendo manual: no se le pone source');
eq(merged.withingsN, 2, 'arrastra withingsN');

const soloWithings = mergeBodyweight(null, day);
eq(soloWithings.weight, 84.35, 'sin fila previa, la de la báscula entra tal cual');
eq(soloWithings.source, 'withings', "y con source 'withings'");

const previaWithings = { date: '2026-09-08', weight: 84.9, source: 'withings', measured: true };
const resync = mergeBodyweight(previaWithings, day);
eq(resync.weight, 84.35, 'una fila que ya era de Withings SÍ se reemplaza al resincronizar');
eq(String(resync.weightWithings), 'undefined', 'y no se duplica en weightWithings');

// ── 8. buildWellnessPatch · el parche de wellness que escribe WHOOP ────────────────────────
console.log('8. buildWellnessPatch · objetos reales de la API v2 → claves de wellness');
const NOW = 1788800000000;

const SLEEP = {
  id: 'ecfc6a15-4661-442f-a9a4-f160dd7afae8',
  cycle_id: 93845,
  user_id: 10129,
  created_at: '2026-09-08T05:30:00.000Z',
  updated_at: '2026-09-08T05:35:00.000Z',
  start: '2026-09-07T22:10:00.000Z', // 00:10 local del 8 (Madrid, +02:00)
  end: '2026-09-08T05:25:00.000Z',   // 07:25 local del 8 → el día es el 8
  timezone_offset: '+02:00',
  nap: false,
  score_state: 'SCORED',
  score: {
    stage_summary: {
      total_in_bed_time_milli: 26100000, // 7 h 15
      total_awake_time_milli: 1500000,   // 25 min
      total_no_data_time_milli: 0,
      total_light_sleep_time_milli: 13200000,
      total_slow_wave_sleep_time_milli: 5400000,
      total_rem_sleep_time_milli: 6000000,
      sleep_cycle_count: 4,
      disturbance_count: 9,
    },
    sleep_needed: {
      baseline_milli: 27395716,
      need_from_sleep_debt_milli: 352230,
      need_from_recent_strain_milli: 208595,
      need_from_recent_nap_milli: -12312, // WHOOP lo manda NEGATIVO: es un crédito
    },
    respiratory_rate: 14.2578125,
    sleep_performance_percentage: 89,
    sleep_consistency_percentage: 74,
    sleep_efficiency_percentage: 91.69533848,
  },
};

const RECOVERY = {
  cycle_id: 93845,
  sleep_id: 'ecfc6a15-4661-442f-a9a4-f160dd7afae8',
  user_id: 10129,
  created_at: '2026-09-08T05:40:00.000Z',
  updated_at: '2026-09-08T05:45:00.000Z',
  score_state: 'SCORED',
  score: {
    user_calibrating: false,
    recovery_score: 71,
    resting_heart_rate: 47,
    hrv_rmssd_milli: 58.317249,
    spo2_percentage: 95.6875,
    skin_temp_celsius: 33.72,
  },
};

const CYCLE = {
  id: 93846,
  user_id: 10129,
  start: '2026-09-08T05:25:00.000Z',
  end: '2026-09-08T22:00:00.000Z',
  timezone_offset: '+02:00',
  score_state: 'SCORED',
  score: { strain: 12.4571527, kilojoule: 11234.5, average_heart_rate: 68, max_heart_rate: 171 },
};

const full = buildWellnessPatch(SLEEP, RECOVERY, CYCLE, NOW);
eq(full?.date, '2026-09-08', 'el día es la fecha LOCAL del despertar con el offset del registro');
const P = full?.patch || {};
const EXPECTED = {
  date: '2026-09-08',
  whoopSyncedAt: NOW,
  whoopSleepId: 'ecfc6a15-4661-442f-a9a4-f160dd7afae8',
  sleepInBedSecs: 26100,
  sleepAwakeSecs: 1500,
  sleepSecs: 24600,          // en cama − despierto: DORMIDO, no en cama
  sleepRemSecs: 6000,
  sleepDeepSecs: 5400,       // slow wave
  sleepLightSecs: 13200,
  sleepScore: 89,
  sleepEfficiency: 91.7,
  sleepConsistency: 74,
  respiration: 14.26,
  sleepNeedSecs: 27944,      // baseline + deuda + strain − |siesta|
  whoopCycleId: 93845,
  readiness: 71,
  readinessSource: 'whoop',
  hrv: 58.32,
  restingHR: 47,
  spO2: 95.7,
  skinTemp: 33.7,
  whoopCalibrating: false,
  whoopRecoveryUpdatedAt: '2026-09-08T05:45:00.000Z',
  whoopStrain: 12.46,
  whoopKcal: 2685,           // kilojoule / 4,184
};
for (const [k, v] of Object.entries(EXPECTED)) eq(P[k], v, `patch.${k} = ${v}`);
eq(Object.keys(P).sort().join(','), Object.keys(EXPECTED).sort().join(','),
   'el parche tiene EXACTAMENTE esas claves y ninguna más');
yes(Object.keys(P).every((k) => WELLNESS_KEYS.includes(k)),
    'todas las claves están en la lista blanca WELLNESS_KEYS');
for (const k of FORBIDDEN_KEYS) {
  yes(!(k in P), `el parche NO escribe \`${k}\` (es de intervals.icu / Withings / la app)`);
}

console.log('9. buildWellnessPatch · casos parciales');
const pending = buildWellnessPatch(SLEEP, { ...RECOVERY, score_state: 'PENDING_SCORE' }, CYCLE, NOW);
yes(!('readiness' in (pending?.patch || {})), 'recovery PENDING_SCORE → sin `readiness`');
yes(!('readinessSource' in (pending?.patch || {})),
    'y sin `readinessSource`: marcar la fuente sin puntuación dejaría el día sin readiness de nadie');
yes(!('hrv' in (pending?.patch || {})), 'ni `hrv` de una puntuación que no existe');
eq(pending?.patch?.sleepSecs, 24600, 'pero el sueño SÍ se escribe (el merge es aditivo: el evento siguiente completa)');

const inProgress = buildWellnessPatch(SLEEP, RECOVERY, { ...CYCLE, end: null }, NOW);
yes(!('whoopStrain' in (inProgress?.patch || {})), 'ciclo sin `end` (en curso) → sin `whoopStrain`');
yes(!('whoopKcal' in (inProgress?.patch || {})), 'ni `whoopKcal` a medias');
const unscored = buildWellnessPatch(SLEEP, RECOVERY, { ...CYCLE, score_state: 'PENDING_SCORE' }, NOW);
yes(!('whoopStrain' in (unscored?.patch || {})), 'ciclo PENDING_SCORE → sin `whoopStrain`');

eq(String(buildWellnessPatch({ ...SLEEP, nap: true }, null, null, NOW)), 'null',
   'una siesta sola no genera parche: no es la noche de ningún día');
eq(String(buildWellnessPatch(null, null, null, NOW)), 'null', 'sin nada que atribuir → null');
const soloCiclo = buildWellnessPatch(null, null, CYCLE, NOW);
eq(soloCiclo?.date, '2026-09-08', 'sin sueño, el día sale del inicio del ciclo');
eq(soloCiclo?.patch?.whoopStrain, 12.46, 'y el strain se escribe igual');

// ── 10. La firma del webhook de WHOOP ──────────────────────────────────────────────────────
console.log('10. hmacBase64 · la única autenticación del webhook');
const SECRET = 'secreto-de-prueba-no-es-el-real';
const TS = '1788800000000';
const BODY = '{"user_id":10129,"id":"ecfc6a15","type":"sleep.updated","trace_id":"t1"}';
const mine = await hmacBase64(SECRET, TS + BODY);
const oracle = createHmac('sha256', SECRET).update(TS + BODY).digest('base64');
eq(mine, oracle, 'WebCrypto y node:crypto coinciden: HMAC-SHA256 en base64');
yes(!/^[0-9a-f]+$/.test(mine), 'la salida es base64, no hexadecimal');
yes(mine !== await hmacBase64(SECRET, BODY + TS),
    'el orden importa: timestamp + cuerpo, no cuerpo + timestamp');
yes(mine !== await hmacBase64(SECRET, TS + JSON.stringify(JSON.parse(BODY), null, 2)),
    'el cuerpo tiene que ser el CRUDO: reserializar el JSON cambia la firma');
yes(mine !== await hmacBase64(SECRET + 'x', TS + BODY), 'otra clave, otra firma');

console.log('11. timingSafeEqual');
yes(timingSafeEqual('abc', 'abc'), 'iguales → true');
yes(!timingSafeEqual('abc', 'abd'), 'distintos → false');
yes(!timingSafeEqual('abc', 'abcd'), 'longitudes distintas → false');
yes(!timingSafeEqual('', 'a'), 'vacío contra no vacío → false');
yes(timingSafeEqual('', ''), 'dos vacíos → true');

// ── 12. isManualRow · quién manda sobre la báscula ─────────────────────────────────────────
console.log('12. isManualRow · las tres procedencias de una fila de bodyweight');
yes(isManualRow({ date: '2026-09-08', weight: 85.4, timestamp: 1 }),
    'logBodyWeight() escribe sin `source` → es a mano y manda');
yes(isManualRow({ date: '2026-09-08', weight: 85.4, source: 'intervals.icu', measured: true }),
    'el formulario de composición arrastra el `source` de intervals pero marca `measured:true` → a mano');
yes(!isManualRow({ date: '2026-09-08', weight: 88.4, source: 'intervals.icu', measured: false }),
    'el peso suavizado de intervals (measured:false) NO es a mano: la báscula lo sustituye');
yes(!isManualRow({ date: '2026-09-08', weight: 84.3, source: 'withings', measured: true }),
    'una fila que ya era de Withings se resincroniza sin miramientos');
yes(!isManualRow(null), 'sin fila previa → no hay nada manual que respetar');

// ── 13. buildBodyweightPatch · el delta que va a merge_generic_row ─────────────────────────
console.log('13. buildBodyweightPatch');
const scale = rows['2026-09-08']; // la fila de la báscula de la sección 6

const fresh = buildBodyweightPatch(scale, null);
eq(fresh.manualKept, false, 'día sin fila previa: no hay peso manual que conservar');
eq(fresh.weightUsed, 84.35, 'el peso que queda es el de la báscula');
eq(fresh.patch.weight, 84.35, 'el parche lleva `weight`');
eq(fresh.patch.source, 'withings', "y `source: 'withings'`");
eq(fresh.patch.measured, true, 'y `measured: true`');
eq(fresh.patch.date, '2026-09-08', 'y `date`, para que una fila nueva esté completa');
eq(fresh.patch.fatPct, 17.3, 'con la composición entera');
eq(fresh.patch.ffmKg, 69.75, '…');
yes(!('weightWithings' in fresh.patch), 'sin `weightWithings`: no hay conflicto que registrar');

const conManual = buildBodyweightPatch(scale, { date: '2026-09-08', weight: 85.4, timestamp: 111 });
eq(conManual.manualKept, true, 'con pesada manual el día: se conserva');
eq(conManual.weightUsed, 85.4, 'el peso que queda es el MANUAL');
yes(!('weight' in conManual.patch),
    'el parche NO toca `weight`: mandarlo aunque fuera el mismo valor invita a pisarlo mañana');
eq(conManual.patch.weightWithings, 84.35, 'el de la báscula entra como `weightWithings`');
eq(conManual.patch.fatPct, 17.3, 'y la composición, que la pesada manual no tiene');
eq(conManual.patch.bfPct, 17.3, 'incluido el bfPct del dispositivo');
yes(!('source' in conManual.patch), 'la fila sigue siendo manual: no se le pone `source`');

const conIntervals = buildBodyweightPatch(scale, {
  date: '2026-09-08', weight: 88.4, source: 'intervals.icu', measured: false, timestamp: 222,
});
eq(conIntervals.manualKept, false, 'el forward-fill de intervals no cuenta como manual');
eq(conIntervals.patch.weight, 84.35, 'y su peso SÍ se sustituye por el de la báscula');
eq(conIntervals.patch.source, 'withings', "con source 'withings'");

const sinCambios = buildBodyweightPatch(scale, { ...scale });
eq(Object.keys(sinCambios.patch).join(','), 'date',
   'resincronizar el mismo día no genera delta (sólo `date`): nada de churn en updated_at');

// ── A-7 · los módulos puros de Strava e intervals.icu ─────────────────────────────────────
//
// EL FALLO QUE ESTA PARTE EXISTE PARA IMPEDIR: que un dato correcto acabe en el día equivocado,
// con la magnitud equivocada o pisando el de otro proveedor, en silencio y sin que nada falle.
//
//   · `normalizeActivity` tomando la fecha de `start_date` (UTC) en vez de `start_date_local`:
//     una carrera de las 00:30 de Madrid se apunta al día anterior, y la semana de carrera del
//     coach cuenta un día que no fue.
//   · `buildRunRow` mandando `feel: null`: el merge es `data || patch`, así que ese null BORRA
//     la sensación que el usuario escribió sobre la carrera importada. Un número que tecleaste
//     desapareciendo solo es la forma más rápida de dejar de fiarte de la app.
//   · `weight` (la proyección suavizada de intervals.icu) tratado como medida: produce
//     secuencias falsas de "peso estable" — tres días idénticos que son una sola pesada
//     repetida — y con ellas una pendiente de peso y un ETA de objetivo inventados.
//   · El parche de intervals.icu pisando el readiness de WHOOP: llega horas tarde y es una copia
//     degradada del mismo número, sin fases de sueño ni SpO2.
//   · El eco del peso de intervals.icu pisando la pesada de Withings: se pierde la hora, la
//     composición y el decimal reales (D-1 de la auditoría 2026-09-09).
//   · `maskSecret` revelando parte de una clave corta, o un `•` por carácter: lo primero filtra
//     un tercio de la credencial, lo segundo publica su longitud.

console.log('');
console.log('A-7.1 maskSecret · un indicio, no una filtración');
eq(http.maskSecret('abcdefghij1234'), '••••1234', 'clave larga: cuatro puntos y los cuatro últimos');
eq(http.maskSecret('short12'), '••••', 'clave corta: NO se enseña nada de ella');
eq(http.maskSecret('12345678'), '••••', 'ni con exactamente 2×keep caracteres');
eq(http.maskSecret(''), '', 'sin clave, sin indicio');
eq(http.maskSecret(null), '', 'y null no se convierte en la cadena "null"');
yes(!/•{5,}/.test(http.maskSecret('unaClaveMuyMuyLargaDeVerdad')),
    'el número de puntos es fijo: no publica la longitud de la clave');

console.log('');
console.log('A-7.2 normalizeActivity · la fecha LOCAL del proveedor, y nada inventado');
const actNoche = cardio.normalizeActivity({
  id: 99, type: 'Run', name: 'Late run',
  start_date_local: '2026-09-09T00:30:00', start_date: '2026-09-08T22:30:00Z',
  distance: 8000, moving_time: 2400, average_heartrate: 152.4,
}, 'strava_');
eq(actNoche.date, '2026-09-09',
   'la fecha sale de start_date_local: con start_date (UTC) saldría el día 8');
eq(actNoche.recordId, 'strava_99', 'el record_id lleva el prefijo de la vía de importación');
eq(actNoche.sourceId, '99', 'y el id del proveedor va aparte, para la columna source_id');
eq(actNoche.distanceKm, 8, 'metros → km');
eq(actNoche.durationMin, 40, 'segundos → minutos');
eq(actNoche.avgHR, 152, 'el pulso medio se redondea');
eq(cardio.formatPace(actNoche.paceSecPerKm), '5:00', 'y el ritmo sale en m:ss por km');
yes(actNoche.isRun, 'una Run va a `runs`');
yes(!cardio.normalizeActivity({ id: 1, type: 'Ride', start_date_local: '2026-09-09T10:00:00' }, 'icu_').isRun,
    'y una Ride, a `sessions`');
// La MISMA actividad por las dos vías NO comparte record_id: la deduplicación en lectura es la
// que decide cuál se cuenta, y fundirlas aquí borraría la evidencia de que llegaron por dos.
const porIcu = cardio.normalizeActivity({ id: 99, type: 'Run', start_date_local: '2026-09-09T00:30:00', distance: 8000, moving_time: 2400 }, 'icu_');
yes(porIcu.recordId !== actNoche.recordId, 'la misma actividad por Strava y por intervals.icu no colisiona');
// Descartes: sin fecha utilizable y con tipo no importable.
yes(cardio.normalizeActivity({ id: 2, type: 'Run' }, 'strava_') === null, 'sin fecha, no se importa');
yes(cardio.normalizeActivity({ id: 3, type: 'Yoga', start_date_local: '2026-09-09T10:00:00' }, 'strava_') === null,
    'y un tipo que no es cardio tampoco');

console.log('');
console.log('A-7.3 buildRunRow / buildSessionRow · ni un null en el parche');
const runRow = cardio.buildRunRow(actNoche, 'strava', 1700);
yes(!('feel' in runRow), '`feel` NO va en el parche: es del usuario y el merge lo borraría');
yes(Object.values(runRow).every((v) => v !== null && v !== undefined),
    'y no queda ni un null (con `data || patch`, un null es un borrado)');
eq(runRow.source, 'strava', 'la fuente queda escrita en la fila');
eq(runRow.notes, 'Late run', 'en `runs`, `notes` es el nombre de la actividad en el proveedor');
eq(runRow._updated_at, 1700, 'y la marca de tiempo la pone el llamador (test reproducible)');

const sesIntervalos = cardio.normalizeActivity({
  id: 5, type: 'VirtualRide', name: 'Bike VO2', start_date_local: '2026-09-09T18:00:00',
  distance: 20000, moving_time: 3600, icu_intensity: 'VO2 Max', icu_training_load: 88,
}, 'icu_');
const sesRow = cardio.buildSessionRow(sesIntervalos, 'intervals.icu', 1700);
eq(sesRow.sessionType, 'cardio.intervals', 'la etiqueta de intensidad decide el subtipo');
eq(sesRow.budgetWeight, 2, 'y con ella el peso en el presupuesto de días duros (0,5 → 2)');
eq(sesRow.subtypeInferred, false, 'con etiqueta, el subtipo NO es inferido');
yes(!('perceivedEffort' in sesRow) && !('notes' in sesRow),
    'el esfuerzo percibido y las notas son del usuario: no van en el parche');
const sesStrava = cardio.buildSessionRow(
  cardio.normalizeActivity({ id: 6, type: 'Rowing', start_date_local: '2026-09-09T18:00:00', distance: 5000, moving_time: 1200 }, 'strava_'),
  'strava', 1700);
eq(sesStrava.sessionType, 'cardio.zone2', 'Strava no da intensidad → zona 2');
eq(sesStrava.subtypeInferred, true, 'y queda marcado como inferido (GEN-002)');
eq(sesStrava.budgetWeight, 0.5, 'con el peso de zona 2');

console.log('');
console.log('A-7.4 buildIntervalsWellnessPatch · sólo lo que intervals.icu trae de verdad');
const filaIcu = {
  id: '2026-09-09', readiness: 68.6, hrv: 91.2, restingHR: 48, tempRestingHR: 47,
  sleepSecs: 25200, sleepScore: 82.4, ctl: 41.3, atl: 52.8, rampRate: 3.1, steps: 11402,
  tempWeight: 84.35, weight: 84.4, bodyFat: 17.1, carbohydrates: 210, fatTotal: 70,
  hrv_unknown_field: 5, comments: '  buen día  ',
};
const parche = icu.buildIntervalsWellnessPatch(filaIcu);
eq(parche.readiness, 69, 'el readiness se redondea a entero');
eq(parche.restingHRMeasured, 47, 'tempRestingHR entra como restingHRMeasured (la medida cruda)');
eq(parche.weightMeasured, 84.4, 'tempWeight entra como weightMeasured');
eq(parche.weight, 84.4, 'y `weight` sigue siendo la proyección suavizada');
eq(parche.carbs, 210, 'carbohydrates → carbs');
eq(parche.fat, 70, 'fatTotal → fat');
eq(parche.comments, 'buen día', 'los comentarios se recortan');
eq(parche.source, 'intervals.icu', 'la fila dice de quién es');
yes(!('spO2' in parche) && !('lactate' in parche),
    'lo que la fila NO trae no aparece en el parche (un null borraría lo que puso WHOOP)');
yes(!('hrv_unknown_field' in parche),
    'y una clave desconocida del proveedor no se cuela en `wellness` sin pasar por el mapeo');
yes(icu.hasSignal(parche), 'hay señal más allá de `date` y `source`');
yes(!icu.hasSignal({ date: '2026-09-09', source: 'intervals.icu' }),
    'y una fila con sólo metadatos NO se escribe (sería churn de updated_at)');
// Rango de plausibilidad del peso: un 0 o un 900 no es un peso, es basura.
yes(!('weight' in icu.buildIntervalsWellnessPatch({ id: '2026-09-09', weight: 0 })),
    'un peso de 0 kg se descarta');
yes(!('weight' in icu.buildIntervalsWellnessPatch({ id: '2026-09-09', weight: 843.5 })),
    'y uno de 843 kg también (un `unit` mal aplicado en origen)');

console.log('');
console.log('A-7.5 filterForeignKeys · intervals.icu sólo pisa lo que es suyo');
const conWhoop = icu.filterForeignKeys(parche, { readinessSource: 'whoop' });
yes(!('readiness' in conWhoop.patch) && !('hrv' in conWhoop.patch) && !('sleepSecs' in conWhoop.patch),
    'si WHOOP escribió el día, su recuperación y su sueño se quitan del parche');
eq(conWhoop.patch.ctl, 41.3, 'pero CTL/ATL/rampRate siguen entrando: son de intervals.icu');
eq(conWhoop.patch.steps, 11402, 'y los pasos también');
yes(conWhoop.dropped.includes('readiness') && conWhoop.dropped.includes('sleepScore'),
    'y se dice QUÉ se dejó fuera (si no, "7 días escritos" no distingue 7 completos de 7 vacíos)');
const conBascula = icu.filterForeignKeys(parche, { weightSource: 'withings' });
yes(!('weight' in conBascula.patch) && !('weightMeasured' in conBascula.patch) && !('bodyFat' in conBascula.patch),
    'si el peso es de la báscula, el eco de intervals.icu no lo toca (D-1)');
eq(conBascula.patch.readiness, 69, 'y el readiness sí, porque WHOOP no escribió ese día');
const conLosDos = icu.filterForeignKeys(parche, { readinessSource: 'whoop', weightSource: 'withings' });
yes(!('readiness' in conLosDos.patch) && !('weight' in conLosDos.patch),
    'con los dos dueños presentes se respetan los dos');
eq(conLosDos.patch.ctl, 41.3, 'y lo que no es de nadie más sigue entrando');
eq(icu.filterForeignKeys(parche, null).dropped.length, 0, 'sin fila previa no se quita nada');
// La lista de claves de WHOOP incluye el desglose de sueño y las que empiezan por `whoop`.
yes(icu.isWhoopOwnedKey('sleepRemSecs') && icu.isWhoopOwnedKey('whoopStrain') && icu.isWhoopOwnedKey('readinessSource'),
    'isWhoopOwnedKey cubre el desglose de sueño, el prefijo `whoop*` y `readinessSource`');
yes(!icu.isWhoopOwnedKey('ctl') && !icu.isWhoopOwnedKey('steps') && !icu.isWhoopOwnedKey('weight'),
    'y NO cubre lo que WHOOP no da (si lo hiciera, intervals.icu no podría escribir nada útil)');

console.log('');
console.log('A-7.6 decideBodyweightWrite · quién gana en `bodyweight`');
const D = (m, p, ex, prev) => icu.decideBodyweightWrite('2026-09-09', m, p, ex, prev, 900);
eq(D(84.3, 84.4, null, null).patch.weight, 84.3, 'la medida cruda gana a la proyección');
eq(D(84.3, 84.4, null, null).patch.measured, true, 'y se marca como medida');
eq(D(84.3, 84.4, { source: 'withings', weight: 84.1 }, null).patch, null,
   'la pesada de Withings NO se pisa (trae hora y composición)');
eq(D(84.3, 84.4, { weight: 85.0 }, null).patch, null,
   'un peso escrito a mano en la app tampoco (fila sin `source`)');
eq(D(null, 84.4, null, 84.2).patch.weight, 84.4, 'sin medida, la proyección entra si CAMBIA');
eq(D(null, 84.4, null, 84.4).patch, null,
   'y no entra si es idéntica al día anterior: inventaría un día de "peso estable"');
eq(D(null, 84.4, null, 84.4).weightUsed, 84.4,
   'aunque sigue sirviendo como "último peso conocido" para las estimaciones de calorías');
eq(D(null, 84.4, { measured: true, weight: 84.0, source: 'intervals.icu' }, 83.0).patch, null,
   'y una proyección no sustituye una medida real del mismo día');
eq(D(null, null, null, null).patch, null, 'sin peso no se escribe nada');
eq(D(null, null, null, null).reason, 'sin peso', 'con el motivo escrito: un salto silencioso parece un fallo');

console.log('');
console.log('A-7.7 buildStepsRow · rango y nada más');
eq(icu.buildStepsRow({ id: '2026-09-09', steps: 11402.6 }, 900).steps, 11403, 'los pasos se redondean');
eq(icu.buildStepsRow({ id: '2026-09-09', steps: 11402 }, 900).source, 'intervals.icu', 'con su fuente');
yes(icu.buildStepsRow({ id: '2026-09-09' }, 900) === null, 'un día sin pasos no escribe fila');
yes(icu.buildStepsRow({ id: '2026-09-09', steps: 250000 }, 900) === null,
    'y 250.000 pasos no es un día: es basura');

console.log(failed === 0 ? '\nTODO OK' : `\n${failed} FALLOS`);
process.exit(failed === 0 ? 0 : 1);
