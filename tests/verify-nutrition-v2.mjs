// Las métricas derivadas de Nutrición v2 tienen que ser reproducibles a mano.
//
// Todo el argumento de este módulo es que el score y la disponibilidad energética son
// AUDITABLES — al contrario que el score "blended" de Caltrack, que nadie puede recalcular.
// Un número que la UI imprime y que no se puede verificar aquí no vale nada, así que este
// test fija los casos de referencia que aparecen documentados en app/nutrition.js.
//
// Los fallos que este test existe para impedir:
//   · Un alimento sin calorías (refresco light, agua) reventando la división en la densidad
//     proteica, o peor: saliendo con densidad infinita y colándose en el leaderboard.
//   · La EA calculada contra el peso corporal en vez de la masa libre de grasa — el error
//     silencioso que convierte un 26 (bajo el umbral REC-008) en un 22 aparentemente normal.
//   · La racha de déficit puenteando días sin registrar. Si no lo mediste, no cuenta; una
//     racha que ignora huecos es exactamente la métrica que engaña a quien la mira.
//   · nova12Pct devolviendo 0 en un día sin comer, que se lee como "0% sin procesar" cuando
//     la verdad es "no hay dato".
//   · Aritmética de fechas en local: la app ya sufrió tz_date_migration_v2 por esto.
//
// Ejecutar desde la raíz del repo: node tests/verify-nutrition-v2.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync('app/nutrition.js', 'utf8');
let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const eq = (got, want, m) =>
  (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const near = (got, want, tol, m) =>
  (Math.abs(got - want) <= tol ? ok(m) : bad(`${m} — esperaba ~${want} (±${tol}), obtuve ${got}`));

// Cargar el módulo en un contexto de Node aprovechando su bloque module.exports.
const sandbox = { module: { exports: {} }, console };
sandbox.exports = sandbox.module.exports;
vm.createContext(sandbox);
new vm.Script(SRC).runInContext(sandbox);
const N = sandbox.module.exports;

if (!N || !N.foodScore) { console.log('FAIL — nutrition.js no exportó nada'); process.exit(1); }

// ── 1. Densidad proteica ────────────────────────────────────────────────────────
console.log('\n1. Densidad proteica (g proteína / 100 kcal)');
near(N.proteinDensity({ kcal100: 63, protein100: 11 }), 17.5, 0.1, 'skyr natural ≈ 17,5');
near(N.proteinDensity({ kcal100: 165, protein100: 31 }), 18.8, 0.1, 'pechuga de pollo ≈ 18,8');
eq(N.proteinDensity({ kcal100: 0, protein100: 0 }), 0, 'refresco light (0 kcal) → 0, no división por cero');
eq(Number.isFinite(N.proteinDensity({ kcal100: 0, protein100: 5 })), true, 'kcal 0 con proteína > 0 sigue siendo finito');
eq(N.proteinDensity({}), 0, 'alimento vacío → 0');

// ── 2. El score y sus casos de referencia ───────────────────────────────────────
console.log('\n2. Score de alimento (casos documentados en nutrition.js)');
eq(N.foodScore({ kcal100: 63, protein100: 11, fiber100: 0, nova: 1 }), 87, 'skyr = 87');
eq(N.foodScore({ kcal100: 165, protein100: 31, fiber100: 0, nova: 1 }), 94, 'pechuga = 94');
eq(N.foodScore({ kcal100: 116, protein100: 9, fiber100: 8, nova: 1 }), 49, 'lentejas = 49');
eq(N.foodScore({ kcal100: 42, protein100: 0, fiber100: 0, nova: 4 }), 0, 'Coca-Cola = 0');
eq(N.foodScore({ kcal100: 380, protein100: 80, fiber100: 0, nova: 4 }), 55,
   'whey = 55 (NOVA 4 penaliza aunque los macros sean perfectos)');
// El score nunca puede salir del rango, ni con entradas absurdas.
eq(N.foodScore({ kcal100: 10, protein100: 90, fiber100: 50, nova: 1 }), 100, 'tope superior en 100');
eq(N.foodScore({ kcal100: 900, protein100: 0, fiber100: 0, nova: 4 }), 0, 'suelo inferior en 0');
eq(N.foodScore({ kcal100: 100, protein100: 5, fiber100: 0, nova: 9 }), 0,
   'NOVA inválida usa la penalización por defecto sin reventar');

// ── 3. Disponibilidad energética (REC-008) ──────────────────────────────────────
console.log('\n3. Disponibilidad energética');
eq(N.NUT_EA_FLOOR, 30, 'suelo REC-008 = 30 kcal/kg FFM');
eq(N.eaFloorKcal(72.8), 2184, 'con 72,8 kg de FFM el suelo son 2.184 kcal netas');
// El caso concreto de las summaries: 2.410 ingeridas − 520 de sesión sobre 72,8 kg.
near(N.energyAvailability(2410, 520, 72.8), 25.96, 0.01, 'caso real ≈ 26 kcal/kg FFM');
eq(N.eaStatus(N.energyAvailability(2410, 520, 72.8)), 'critico', '26 → crítico (bajo 27)');
eq(N.eaStatus(31), 'ok', '31 → ok');
eq(N.eaStatus(28.5), 'bajo', '28,5 → bajo');
eq(N.eaStatus(null), 'sin-datos', 'sin dato no se inventa un estado');
// Contra el error silencioso: dividir por peso corporal (87,1) daría ~21,7 y parecería otro
// problema. La firma exige FFM explícita.
near(N.energyAvailability(2700, 0, 72.8), 37.09, 0.01, 'día de descanso a objetivo → 37, holgado');

// ── 4. Agregado del día ─────────────────────────────────────────────────────────
console.log('\n4. Agregado del día');
const comidas = [
  { items: [
    { kcal: 300, protein: 15, carbs: 20, fat: 15, fiber: 2, nova: 1, estimated: true },
    { kcal: 200, protein: 40, carbs: 0,  fat: 4,  fiber: 0, nova: 1 },
  ] },
  { items: [
    { kcal: 500, protein: 10, carbs: 60, fat: 20, fiber: 3, nova: 4 },
  ] },
];
const agg = N.aggregateMeals(comidas);
eq(agg.calories, 1000, 'kcal totales');
eq(agg.protein, 65, 'proteína total');
eq(agg.mealCount, 2, '2 comidas');
eq(agg.itemCount, 3, '3 items');
eq(agg.estimatedItems, 1, '1 item estimado por foto');
eq(agg.nova12Pct, 50, '500 de 1.000 kcal desde NOVA 1-2 → 50%');
const vacio = N.aggregateMeals([]);
eq(vacio.nova12Pct, null, 'día sin comer → nova12Pct null, NUNCA 0%');
eq(vacio.calories, 0, 'día sin comer → 0 kcal');
eq(N.aggregateMeals(null).calories, 0, 'null no revienta');
eq(N.aggregateMeals([{ }]).itemCount, 0, 'comida sin items no revienta');

// ── 5. Aritmética de fechas (UTC, contra tz_date_migration_v2) ──────────────────
console.log('\n5. Fechas');
eq(N.nutShiftDate('2026-09-03', -1), '2026-09-02', 'un día atrás');
eq(N.nutShiftDate('2026-03-01', -1), '2026-02-28', 'cruce de mes');
eq(N.nutShiftDate('2026-01-01', -1), '2025-12-31', 'cruce de año');
// España cambia la hora el 29-mar-2026 y el 25-oct-2026. En local esto se desplazaría.
eq(N.nutShiftDate('2026-03-30', -1), '2026-03-29', 'cruce del cambio de hora de primavera');
eq(N.nutShiftDate('2026-10-26', -1), '2026-10-25', 'cruce del cambio de hora de otoño');
eq(N.nutShiftDate('2026-09-03', -13), '2026-08-21', 'ventana inclusiva de 14 días: 21-ago…3-sep');
eq(N.nutIsoWeekStart('2026-09-03'), '2026-08-31', 'jueves → lunes de su semana ISO');
eq(N.nutIsoWeekStart('2026-08-31'), '2026-08-31', 'lunes → él mismo');
eq(N.nutIsoWeekStart('2026-09-06'), '2026-08-31', 'domingo → lunes anterior, no el siguiente');

// ── 6. Guardarraíl de adherencia ────────────────────────────────────────────────
console.log('\n6. Guardarraíl de adherencia');
const dia = (d, extra) => ({ date: d, loggedV2: true, mealCount: 3, calories: 2300, kcalTarget: 2400, ...extra });
const catorce = Array.from({ length: 14 }, (_, k) => dia(N.nutShiftDate('2026-09-03', -k)));
eq(N.adherenceMode(catorce, '2026-09-03').pilot, 'tracker', '14/14 → pilota el tracker');
eq(N.adherenceMode(catorce.slice(0, 10), '2026-09-03').pilot, 'tracker', '10/14 → justo en el umbral');
eq(N.adherenceMode(catorce.slice(0, 9), '2026-09-03').pilot, 'peso', '9/14 → vuelve al piloto por peso');
eq(N.adherenceMode([], '2026-09-03').pilot, 'peso', 'sin registro → piloto por peso');
eq(N.adherenceMode(catorce.slice(0, 5), '2026-09-03').perWeek, 3, '5/14 se muestra como 3/7');
// Días fuera de la ventana no deben contar.
const viejos = Array.from({ length: 14 }, (_, k) => dia(N.nutShiftDate('2026-07-01', -k)));
eq(N.adherenceMode(viejos, '2026-09-03').logged, 0, 'días de hace dos meses no cuentan');
// Una fila derivada sin comidas no es un día registrado.
eq(N.adherenceMode([dia('2026-09-03', { mealCount: 0 })], '2026-09-03').logged, 0,
   'fila sin comidas no cuenta como registrada');

// ── 7. Racha de déficit ─────────────────────────────────────────────────────────
console.log('\n7. Racha de déficit');
const rachaDias = [
  dia('2026-09-03', { calories: 2300 }),
  dia('2026-09-02', { calories: 2200 }),
  dia('2026-09-01', { calories: 2350 }),
];
eq(N.deficitStreak(rachaDias, '2026-09-03').current, 3, '3 días seguidos por debajo');
// Un día por encima corta.
const cortada = [dia('2026-09-03', { calories: 2300 }), dia('2026-09-02', { calories: 2900 })];
eq(N.deficitStreak(cortada, '2026-09-03').current, 1, 'un día por encima corta la racha');
// Un HUECO corta: si no lo registraste, no cuenta.
const conHueco = [dia('2026-09-03', { calories: 2300 }), dia('2026-09-01', { calories: 2200 })];
eq(N.deficitStreak(conHueco, '2026-09-03').current, 1, 'un día sin registrar corta la racha');
// Aún sin haber comido lo suficiente hoy, la racha de ayer no se pierde.
const hoySinCerrar = [dia('2026-09-03', { calories: 2900 }), dia('2026-09-02', { calories: 2200 })];
eq(N.deficitStreak(hoySinCerrar, '2026-09-03').current, 1,
   'hoy todavía por encima no borra la racha de ayer');
eq(N.deficitStreak([], '2026-09-03').current, 0, 'sin datos → 0');

// ── 8. Déficit semanal ──────────────────────────────────────────────────────────
console.log('\n8. Déficit semanal');
const semana = [
  dia('2026-08-31', { calories: 2300, kcalTarget: 2400 }),
  dia('2026-09-01', { calories: 2500, kcalTarget: 2700 }),
  dia('2026-09-02', { calories: 2100, kcalTarget: 2400 }),
];
const wk = N.weeklyDeficits(semana);
eq(wk.length, 1, 'las tres caen en la misma semana ISO');
eq(wk[0].weekStart, '2026-08-31', 'la semana arranca el lunes');
eq(wk[0].avgKcal, 2300, 'media ingerida (2300+2500+2100)/3');
eq(wk[0].avgDeficit, -200, 'déficit medio frente al objetivo del día, no a un fijo');
eq(N.weeklyDeficits([]).length, 0, 'sin datos → sin semanas');
// Los días sin registrar no deben contaminar la media.
eq(N.weeklyDeficits([...semana, { date: '2026-09-04', loggedV2: false, calories: 0 }])[0].days, 3,
   'un día no registrado no entra en la media');

// ── 9. Calibración del wearable ─────────────────────────────────────────────────
console.log('\n9. Calibración del wearable');
// 14 días comiendo 2.400 con un gasto declarado de 2.900 → balance −500/día = −7.000 kcal
// ≈ −0,91 kg predichos. Si la báscula solo baja 0,20 kg, el gasto declarado está inflado.
const calDias = Array.from({ length: 14 }, (_, k) =>
  ({ date: N.nutShiftDate('2026-09-03', -k), loggedV2: true, calories: 2400, burn: 2900 }));
const pesos = [
  { date: '2026-08-20', weight: 87.0 }, { date: '2026-08-21', weight: 87.1 }, { date: '2026-08-22', weight: 87.0 },
  { date: '2026-09-01', weight: 86.9 }, { date: '2026-09-02', weight: 86.8 }, { date: '2026-09-03', weight: 86.9 },
];
const cal = N.wearableCalibration(calDias, pesos, '2026-09-03');
eq(cal.ok, true, 'con 14 días y pesadas en los dos extremos hay veredicto');
eq(cal.days, 14, 'usa los 14 días');
near(cal.predichoKg, -0.91, 0.02, 'predice ≈ −0,91 kg');
near(cal.realKg, -0.17, 0.02, 'la báscula (media de 3 d) bajó ≈ 0,17 kg');
eq(cal.veredicto, 'sobreestima', 'perder menos de lo predicho → el wearable infla el gasto');
// Sin señal suficiente no se emite veredicto: el ruido de ±0,3 kg en 14 días son ~165 kcal/día.
const calibrado = N.wearableCalibration(
  Array.from({ length: 14 }, (_, k) =>
    ({ date: N.nutShiftDate('2026-09-03', -k), loggedV2: true, calories: 2400, burn: 2450 })),
  [{ date: '2026-08-19', weight: 87.0 }, { date: '2026-08-20', weight: 87.0 }, { date: '2026-08-21', weight: 87.0 },
   { date: '2026-09-01', weight: 86.90 }, { date: '2026-09-02', weight: 86.91 }, { date: '2026-09-03', weight: 86.92 }],
  '2026-09-03');
eq(calibrado.veredicto, 'calibrado', 'discrepancia bajo el ruido → "calibrado", sin veredicto falso');
// Garantías de que no inventa.
eq(N.wearableCalibration(calDias.slice(0, 5), pesos, '2026-09-03').ok, false, 'con 5 días no hay veredicto');
eq(N.wearableCalibration(calDias.slice(0, 5), pesos, '2026-09-03').reason, 'pocos-datos', 'y dice por qué');
eq(N.wearableCalibration(calDias, [], '2026-09-03').reason, 'sin-peso', 'sin pesadas no hay veredicto');
eq(N.wearableCalibration(calDias, [{ date: '2026-08-10', weight: 87.5 },
                                    { date: '2026-09-03', weight: 86.9 }], '2026-09-03').reason,
   'sin-peso',
   'una pesada fuera de la ventana no sirve de línea base: mejor sin veredicto que uno corrupto');
eq(N.nutRollingWeight(pesos, '2026-07-01', 3), null, 'sin pesadas en la ventana → null, no 0');

// ── 10. Coach "resto del día" ───────────────────────────────────────────────────
console.log('\n10. Coach "resto del día"');
const bib = [
  { id: 'pechuga', name: 'Pechuga de pollo', kcal100: 165, protein100: 31, fiber100: 0, nova: 1, verified: true },
  { id: 'skyr',    name: 'Skyr natural',     kcal100: 63,  protein100: 11, fiber100: 0, nova: 1, verified: true },
  { id: 'arroz',   name: 'Arroz basmati',    kcal100: 130, protein100: 2.7, fiber100: 0.4, nova: 1, verified: true },
  { id: 'sinver',  name: 'Plato estimado',   kcal100: 150, protein100: 25, fiber100: 0, nova: 1, verified: false },
];
const rod = N.restOfDay({ calories: 2000, protein: 120, kcalTarget: 2400, proteinFloor: 185 }, bib, {});
eq(rod.done, false, 'quedan 65 g de proteína por cubrir');
eq(rod.huecoProt, 65, 'hueco de proteína correcto');
eq(rod.huecoKcal, 400, 'hueco de calorías correcto');
eq(rod.sugerencias.length > 0, true, 'propone algo');
eq(rod.sugerencias.every(s => s.kcal <= 400), true, 'ninguna sugerencia se pasa del presupuesto');
eq(rod.sugerencias.every(s => s.grams % 10 === 0), true, 'gramajes redondeados a 10 g');
eq(rod.sugerencias.some(s => s.foodId === 'arroz'), false, 'el arroz no cierra huecos de proteína');
eq(rod.sugerencias.some(s => s.foodId === 'sinver'), false,
   'no propone alimentos no verificados: su gramaje se apoyaría en macros estimados por foto');
// Objetivo cumplido → no molesta.
eq(N.restOfDay({ calories: 2300, protein: 190, kcalTarget: 2400, proteinFloor: 185 }, bib, {}).done, true,
   'suelo de proteína alcanzado → nada que sugerir');
// Sin biblioteca no revienta.
eq(N.restOfDay({ calories: 0, protein: 0, kcalTarget: 2400, proteinFloor: 185 }, [], {}).sugerencias.length, 0,
   'biblioteca vacía → sin sugerencias, sin error');

// ── 11. Normalizacion y resolucion de alimentos ─────────────────────────
console.log('');
console.log('11. Normalizacion y resolucion de alimentos');
eq(N.nutNormalize('Pollo a la Plancha'), 'pollo a la plancha', 'minusculas y espacios');
eq(N.nutNormalize('Brócoli'), 'brocoli', 'quita acentos');
eq(N.nutNormalize('  Skyr   natural  '), 'skyr natural', 'colapsa espacios');
eq(N.nutNormalize('Coca-Cola'), 'coca cola', 'los guiones se vuelven espacio');
eq(N.nutNormalize(null), '', 'null no revienta');
eq(N.nutSlug('Aceite de oliva virgen extra'), 'aceite-de-oliva-virgen-extra', 'slug legible');

const bibSeed = N.FOODS_SEED;
// La resolucion tiene que funcionar con lo que teclea el usuario Y con lo que devuelve la IA.
eq(N.findFood(bibSeed, 'pollo').id, 'pechuga-pollo', 'alias "pollo" resuelve a la pechuga');
eq(N.findFood(bibSeed, 'POLLO A LA PLANCHA').id, 'pechuga-pollo', 'alias en mayusculas');
eq(N.findFood(bibSeed, 'Brócoli').id, 'brocoli', 'nombre con acento resuelve');
eq(N.findFood(bibSeed, 'brocoli').id, 'brocoli', 'y sin acento tambien');
eq(N.findFood(bibSeed, 'coca cola').id, 'refresco-azucar', 'alias de marca');
// Lo importante: NO adivinar. Un match aproximado falsea macros en silencio.
eq(N.findFood(bibSeed, 'pollo al curry tailandes'), null, 'no adivina por parecido');
eq(N.findFood(bibSeed, ''), null, 'cadena vacia no resuelve');
eq(N.findFood([], 'pollo'), null, 'biblioteca vacia no resuelve');

// ── 12. Integridad de la semilla ─────────────────────────────────────
// Un digito mal en 55 filas de macros no se ve a ojo y contamina todos los totales.
console.log('');
console.log('12. Integridad de la semilla (' + bibSeed.length + ' alimentos)');
eq(new Set(bibSeed.map(f => f.id)).size, bibSeed.length, 'sin ids duplicados');
eq(bibSeed.every(f => f.name && f.id && f.id === N.nutSlug(f.id)), true, 'ids bien formados');
eq(bibSeed.every(f => [1, 2, 3, 4].includes(f.nova)), true, 'toda clase NOVA es 1-4');
eq(bibSeed.every(f => ['kcal100', 'protein100', 'carbs100', 'fat100', 'fiber100']
     .every(k => typeof f[k] === 'number' && f[k] >= 0)), true, 'macros numericos y no negativos');
// La fibra va DENTRO de carbs100 (convencion USDA), asi que no se suma aparte; el alcohol si.
eq(bibSeed.every(f => f.protein100 + f.carbs100 + f.fat100 + (f.alcohol100 || 0) <= 100), true,
   'los gramos por 100 g no pueden sumar mas de 100');
eq(bibSeed.every(f => (f.fiber100 || 0) <= f.carbs100 + 0.001 || f.carbs100 === 0), true,
   'la fibra nunca supera a los carbos que la contienen');
// Coherencia energetica: kcal ~= 4P + 4C + 9F. Tolerancia amplia (alcohol, polialcoholes,
// fibra que aporta ~2 kcal/g, redondeos de tabla), pero un typo de un digito la rompe.
const malCuadradas = bibSeed.filter(f => {
  const fib = f.fiber100 || 0;
  const teorico = 4 * f.protein100                 // proteina
                + 4 * Math.max(0, f.carbs100 - fib) // carbos disponibles
                + 2 * fib                           // la fibra aporta ~2 kcal/g, no 4
                + 9 * f.fat100                      // grasa
                + 7 * (f.alcohol100 || 0);          // alcohol
  if (f.kcal100 === 0) return false;
  return Math.abs(teorico - f.kcal100) > Math.max(30, f.kcal100 * 0.15);
});
eq(malCuadradas.map(f => f.id).join(',') || 'ninguno', 'ninguno',
   'las kcal cuadran con 4P+4C+9F en todos los alimentos');
// Los alias no deben chocar entre alimentos distintos: un alias ambiguo asigna el alimento
// equivocado sin avisar.
const vistos = new Map();
let choques = [];
for (const f of bibSeed) {
  for (const key of [f.name, ...(f.aliases || [])]) {
    const k = N.nutNormalize(key);
    if (vistos.has(k) && vistos.get(k) !== f.id) choques.push(`${k} (${vistos.get(k)} vs ${f.id})`);
    vistos.set(k, f.id);
  }
}
eq(choques.join(', ') || 'ninguno', 'ninguno', 'ningun alias apunta a dos alimentos');
// La semilla tiene que dar de si para el coach: sin alimentos de densidad alta no propondria nada.
eq(bibSeed.filter(f => N.proteinDensity(f) >= 8).length >= 10, true,
   'al menos 10 alimentos con densidad proteica >= 8 para el coach');

// ── 13. Macros de una cantidad concreta ──────────────────────────────
console.log('');
console.log('13. Macros de una cantidad concreta');
const pollo = N.findFood(bibSeed, 'pollo');
const it200 = N.itemFromFood(pollo, 200);
eq(it200.kcal, 330, '200 g de pechuga = 330 kcal');
eq(it200.protein, 62, '200 g de pechuga = 62 g de proteina');
eq(it200.foodId, 'pechuga-pollo', 'el item queda ligado al alimento canonico');
eq(it200.nova, 1, 'hereda la clase NOVA');
eq(N.itemFromFood(pollo, 0).kcal, 0, '0 g -> 0 kcal');
eq(N.itemFromFood(pollo, 100).protein, 31, '100 g devuelve los macros por 100 g tal cual');
eq(N.itemFromFood(pollo, 150, { estimated: true }).estimated, true, 'marca de estimado se conserva');
// El agregado del dia tiene que cuadrar con la suma de items generados asi.
const dosItems = [N.itemFromFood(pollo, 200), N.itemFromFood(N.findFood(bibSeed, 'arroz'), 150)];
const aggReal = N.aggregateMeals([{ items: dosItems }]);
eq(aggReal.calories, 330 + 195, 'el agregado suma exactamente los items');
eq(aggReal.nova12Pct, 100, 'pollo + arroz son NOVA 1 -> 100%');

// ── 14. Alcohol como cuarto macro ──────────────────────────────
console.log('');
console.log('14. Alcohol como cuarto macro');
const vino = N.findFood(bibSeed, 'vino');
eq(vino.alcohol100, 10.6, 'el vino declara sus gramos de alcohol');
const copa = N.itemFromFood(vino, 150);
eq(copa.kcal, 128, '150 ml de vino = 128 kcal');
eq(copa.alcohol, 15.9, 'y 15,9 g de alcohol');
const conVino = N.aggregateMeals([{ items: [copa] }]);
eq(conVino.alcohol, 16, 'el agregado del dia suma el alcohol');
eq(conVino.calories, 128, 'y sus calorias cuentan para el objetivo');
// Lo que este campo existe para impedir: calorias sin origen en el desglose.
const sinOrigen = conVino.calories - (4 * conVino.protein + 4 * conVino.carbs + 9 * conVino.fat);
eq(sinOrigen > 100, true, 'sin el termino de alcohol, 100+ kcal del dia no tendrian explicacion');
eq(N.aggregateMeals([{ items: [N.itemFromFood(pollo, 200)] }]).alcohol, 0,
   'un dia sin alcohol suma 0, no undefined');

// ── 15. Mantenimiento modelado ────────────────────────────────────
// Si estos numeros no cuadran con docs/profile.md y plans/nutrition-notes.md, el modelo
// no sirve: todo el deficit y toda la calibracion salen de aqui.
console.log('');
console.log('15. Mantenimiento modelado');
// Katch-McArdle sobre la FFM medida. docs/profile.md dice 1.942 kcal.
eq(N.bmrKatchMcArdle(72.8), 1942, 'BMR con 72,8 kg de FFM = 1.942, el numero de docs/profile.md');
eq(N.bmrKatchMcArdle(null), N.bmrKatchMcArdle(N.NUT_FFM_KG_FALLBACK), 'sin FFM usa el respaldo');
// Cada termino por separado, para poder discutirlos uno a uno.
const mDesc = N.maintenanceKcal({ ffmKg: 72.8, bodyweightKg: 87, steps: 8000, eee: 500, kcalIn: 2700 });
eq(mDesc.bmr, 1942, 'desglose: BMR');
eq(mDesc.neatBase, 194, 'desglose: NEAT no atribuible a pasos (10% del BMR)');
eq(mDesc.neatSteps, 320, 'desglose: 8.000 pasos a 87 kg = 320 kcal');
eq(mDesc.exercise, 500, 'desglose: gasto de la sesion');
eq(mDesc.tef, 270, 'desglose: TEF, 10% de 2.700 ingeridas');
eq(mDesc.total, 1942 + 194 + 320 + 500 + 270, 'el total es la suma de los terminos, sin factores ocultos');
// LA COMPROBACION QUE IMPORTA: el modelo tiene que caer dentro del rango que el propio
// plan declara (2.720 con la adherencia medida, 3.110 con adherencia plena).
const diaEntreno = N.maintenanceKcal({ ffmKg: 72.8, bodyweightKg: 87, steps: 8000, eee: 500, kcalIn: 2700 }).total;
const diaDescanso = N.maintenanceKcal({ ffmKg: 72.8, bodyweightKg: 87, steps: 5256, eee: 0, kcalIn: 2400 }).total;
yes(diaEntreno >= 3000 && diaEntreno <= 3300, `dia de entreno ${diaEntreno} kcal, cerca del techo de 3.110 del plan`);
yes(diaDescanso >= 2300 && diaDescanso <= 2650, `dia de descanso ${diaDescanso} kcal (5.256 pasos, la media real de W35)`);
// Y el dia sedentario no puede quedarse por debajo de 1,25 x BMR: seria irreal.
const factor = diaDescanso / N.bmrKatchMcArdle(72.8);
yes(factor >= 1.25 && factor <= 1.45, `dia de descanso = ${factor.toFixed(2)} x BMR, dentro de lo fisiologico`);
// Robustez.
eq(N.maintenanceKcal({}).total > 0, true, 'sin ningun dato sigue devolviendo el BMR de respaldo');
eq(N.maintenanceKcal({ ffmKg: 72.8, steps: 0, eee: 0, kcalIn: 0 }).tef, 0, 'sin comer no hay TEF');

// La correccion que devuelve la calibracion es lo que hay que sumarle al mantenimiento.
console.log('');
console.log('15b. Correccion del mantenimiento');
eq(N.maintenanceCorrection(null), null, 'sin calibracion no hay correccion');
eq(N.maintenanceCorrection({ ok: false }), null, 'calibracion sin datos no corrige');
eq(N.maintenanceCorrection({ ok: true, veredicto: 'calibrado', errorKcalDia: 40 }), null,
   'bajo el ruido no se corrige nada: 40 kcal seria ruido disfrazado de precision');
// Perdiste MENOS de lo predicho -> el mantenimiento real es MAS BAJO -> correccion negativa.
eq(N.maintenanceCorrection({ ok: true, veredicto: 'sobreestima', errorKcalDia: 250 }), -250,
   'perder menos de lo predicho baja el mantenimiento en esa cantidad');
eq(N.maintenanceCorrection({ ok: true, veredicto: 'subestima', errorKcalDia: -300 }), 300,
   'perder mas de lo predicho lo sube');

// ── Resultado ───────────────────────────────────────────────────────────────────
console.log(failed === 0
  ? '\n✅ Nutrición v2: todas las métricas derivadas son reproducibles.'
  : `\n❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
