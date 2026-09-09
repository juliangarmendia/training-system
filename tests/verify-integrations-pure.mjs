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

console.log(failed === 0 ? '\nTODO OK' : `\n${failed} FALLOS`);
process.exit(failed === 0 ? 0 : 1);
