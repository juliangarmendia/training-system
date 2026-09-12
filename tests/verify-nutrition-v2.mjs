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

// ── 16. Coste del parseo por foto ─────────────────────────────────
// El modelo se eligio a mano sobre una ESTIMACION de ~4 $/mes. Si el numero medido no es
// correcto, la decision no se puede revisar con datos y vuelve a depender de mi aritmetica.
console.log('');
console.log('16. Coste del parseo por foto');
eq(N.NUT_AI_MODEL, 'claude-opus-5', 'los precios van atados al modelo que usa la edge function');
// 3.900 entrada + 600 salida a 5/25 $ por millon.
near(N.photoCostUsd({ input: 3900, output: 600 }), 0.0345, 0.0001, 'foto tipica ~ $0,0345');
eq(N.photoCostUsd(null), 0, 'sin usage el coste es 0, no NaN');
eq(N.photoCostUsd({}), 0, 'usage vacio es 0');
// Solo cuenta el mes en curso, y solo las comidas que trajeron usage (las manuales no).
const comidasCoste = [
  { date: '2026-09-01', usage: { input: 4000, output: 600 } },
  { date: '2026-09-02', usage: { input: 4000, output: 600 } },
  { date: '2026-08-30', usage: { input: 4000, output: 600 } },  // mes anterior
  { date: '2026-09-03' },                                        // manual, sin IA
];
const res = N.photoCostSummary(comidasCoste, '2026-09-04');
eq(res.fotos, 2, 'cuenta solo las fotos del mes en curso');
eq(res.mes, '2026-09', 'mes correcto');
near(res.totalUsd, 0.07, 0.0001, 'total del mes');
near(res.mediaUsd, 0.035, 0.0001, 'media por foto');
eq(N.photoCostSummary([], '2026-09-04').fotos, 0, 'sin comidas no revienta');
eq(N.photoCostSummary(null, '2026-09-04').totalUsd, 0, 'null no revienta');
// La comprobacion que importa: a 4 fotos/dia la proyeccion tiene que salir cerca de los
// ~4,2 $/mes que estime al recomendar el modelo. Si no, la estimacion estaba mal.
const proyeccion = N.photoCostUsd({ input: 3900, output: 600 }) * 4 * 30;
yes(proyeccion > 3.5 && proyeccion < 5,
   `4 fotos/dia proyecta $${proyeccion.toFixed(2)}/mes, coherente con la estimacion de ~$4,2`);

// ── E-11 · PINTAR NO ESCRIBE, Y LA EA SÓLO SE JUZGA EN DÍAS CERRADOS ────────────
//
// LOS DOS FALLOS QUE ESTE BLOQUE IMPIDE (auditoría 2026-09-08, E-11; antes F-11 y F-12):
//
//   1. `renderNutricionV2()` llamaba a `recomputeNutritionDay()` en CADA pintado. Abrir una
//      pestaña escribía en IndexedDB y encolaba una sincronización, con `updatedAt` nuevo cada
//      vez — así que el último dispositivo que MIRASE la pantalla ganaba el merge sin haber
//      registrado nada. Un render no puede ser un escritor.
//   2. La disponibilidad energética se pintaba con su semáforo también intradía. La EA es una
//      magnitud DIARIA (REC-008): a las 11:00, con un desayuno registrado, el numerador es casi
//      cero y sale siempre "crítica". Un rojo que aparece todos los días a media mañana enseña
//      a ignorar el único semáforo que sí importa.
console.log('\n13. E-11 · recompute sólo en escritura, EA sólo en días cerrados');

/**
 * El cuerpo de UNA función, cortado en su cierre a nivel de fichero (`\n}`), no por un número
 * de caracteres. Una ventana fija se derrama en la función siguiente, y entonces "esta función
 * no escribe" se vuelve mentira en cuanto la de abajo escribe.
 */
const fnSrcN = (anchor) => {
  const i = SRC.indexOf(anchor);
  if (i < 0) return '';
  const j = SRC.indexOf('\n}', i);
  return j < 0 ? SRC.slice(i) : SRC.slice(i, j + 2);
};

// 13.a El render no escribe.
const RENDER = fnSrcN('async function renderNutricionV2(');
yes(!!RENDER, 'renderNutricionV2() existe');
yes(!/await recomputeNutritionDay\(date\)/.test(RENDER),
  'renderNutricionV2() ya NO llama a recomputeNutritionDay(date)');
yes(/await nutDayForRender\(date\)/.test(RENDER), 'lee con nutDayForRender() (calcula en memoria)');
const FOR_RENDER = fnSrcN('async function nutDayForRender(');
yes(!!FOR_RENDER, 'nutDayForRender() existe');
yes(!/smartPut/.test(FOR_RENDER), '…y no escribe nada: ni smartPut ni dbPut');
yes(/computeNutritionDay\(date\)/.test(FOR_RENDER), '…calcula con computeNutritionDay()');
const COMPUTE = fnSrcN('async function computeNutritionDay(');
yes(!!COMPUTE, 'computeNutritionDay() existe (el cálculo, separado de la escritura)');
yes(!/smartPut\('nutrition'/.test(COMPUTE), '…y tampoco escribe');
const RECOMP = fnSrcN('async function recomputeNutritionDay(');
yes(/await smartPut\('nutrition', row\)/.test(RECOMP),
  'recomputeNutritionDay() es el ÚNICO escritor: calcula y guarda');

// 13.b Las rutas de escritura sí recalculan.
for (const [anchor, nombre] of [
  ['async function saveMeal(', 'saveMeal() (registro a mano y confirmación de la foto)'],
  ['async function deleteMeal(', 'deleteMeal()'],
  ['async function nutCloseDay(', 'nutCloseDay() (el cierre del día)'],
]) {
  yes(/recomputeNutritionDay\(/.test(fnSrcN(anchor, 900)), `${nombre} recalcula`);
}
// El cierre es idempotente: si no lo fuera, sería el recompute-por-render otra vez.
const CLOSE = fnSrcN('async function nutCloseDay(');
yes(/String\(date\) >= today\(\)/.test(CLOSE), 'nutCloseDay() no cierra el día en curso');
yes(/existing\.closed === true/.test(CLOSE), '…y no reescribe una fila ya cerrada (idempotente)');
yes(/if \(!existing\) return null;/.test(CLOSE), '…ni inventa una fila para un día sin registro');
// La confirmación de la foto entra por saveMeal, así que hereda el recompute.
const FOTO = fnSrcN('async function nutSaveConfirmed(');
yes(/await saveMeal\(/.test(FOTO), 'la importación por foto escribe con saveMeal() (y recalcula ahí)');
yes(!/recomputeNutritionDay/.test(FOTO), '…sin una segunda llamada suelta');

// 13.c La EA sólo lleva color y "te faltan N kcal" cuando el día está cerrado.
yes(/closed: String\(date\) < today\(\)/.test(COMPUTE), 'la fila del día lleva su bandera `closed`');
const TODAY_CARD = fnSrcN('function renderNutToday(');
yes(/const eaClosed = day\.closed === true;/.test(TODAY_CARD), 'la tarjeta de Hoy mira `closed`');
yes(/eaCls = eaClosed/.test(TODAY_CARD), '…y sin cerrar no pinta semáforo (nut-neutral)');
yes(/eaFaltan = \(eaClosed && ea != null/.test(TODAY_CARD),
  '…ni el "faltan N kcal", que sobre un día a medias es un número inventado');
yes(/in progress/.test(TODAY_CARD), 'y la línea de hoy dice "in progress" (en inglés, V-1)');
yes(/judged when the day closes/.test(TODAY_CARD), '…explicando cuándo se juzga');

// ── E-9 · LA FFM, DE UNA SOLA FUENTE ────────────────────────────────────────────
//
// Había TRES respuestas a la misma pregunta: los 72,8 kg declarados, la lectura de Withings y
// la derivada `peso × (1 − %grasa)` que calculaba este fichero por su cuenta. Con la EA
// dividiendo por una u otra, el mismo día salía 26,4 (bajo el suelo REC-008) o 28,9, que
// parece otro problema. La precedencia vive ahora en `ffmKg()` (coach-engine.js).
console.log('\n14. E-9 · la FFM sale del motor, con su procedencia');
const FFM = fnSrcN('async function nutFfmKg(');
yes(/typeof ffmKg === 'function'/.test(FFM), 'nutFfmKg() delega en ffmKg() del motor');
yes(/bodyweightRows: rows/.test(FFM), '…pasándole las filas de `bodyweight`');
yes(/NUT_FFM_KG_FALLBACK/.test(FFM),
  '…y conserva el respaldo declarado si el motor no cargó (nunca devuelve null)');
yes(/async function nutFfmDetail\(/.test(SRC), 'nutFfmDetail() expone también el `source`');
yes(/ffmSource: ffmInfo\.source/.test(COMPUTE),
  'la fila del día sella de dónde salió la FFM (medida o declarada)');

// La precedencia en sí se prueba sobre el motor, que es donde vive.
{
  const ENGINE_SRC = readFileSync('app/coach-engine.js', 'utf8');
  const box = { module: { exports: {} }, console };
  box.exports = box.module.exports;
  vm.createContext(box);
  new vm.Script(ENGINE_SRC).runInContext(box);
  const ffmKg = box.module.exports.ffmKg;
  yes(typeof ffmKg === 'function', 'coach-engine.js exporta ffmKg()');
  const HOY = '2026-09-08';
  const withings = { date: '2026-09-06', weight: 85.6, source: 'withings', ffmKg: 66.2, bfPct: 22.6 };
  const tanita = { date: '2026-09-01', weight: 86.0, bfPct: 24.0 };
  let r = ffmKg({ bodyweightRows: [tanita, withings], todayStr: HOY });
  eq(r.kg, 66.2, 'Withings de hace 2 días manda: 66,2 kg');
  eq(r.source, 'withings', '…y lo dice');
  eq(r.ageDays, 2, '…con la edad del dato');
  const viejo = { date: '2026-08-01', weight: 87.4, source: 'withings', ffmKg: 66.3 };
  r = ffmKg({ bodyweightRows: [viejo, tanita], todayStr: HOY });
  eq(r.source, 'derived', 'una Withings de hace 38 días cede a la derivada');
  eq(r.kg, 65.4, '…86,0 × (1 − 0,24) = 65,4 kg');
  r = ffmKg({ bodyweightRows: [{ date: '2026-09-01', weight: 86.0 }], todayStr: HOY });
  eq(r.source, 'declared', 'una pesada sin %grasa no permite derivar: FFM declarada');
  eq(r.kg, 72.8, '…los 72,8 kg de docs/profile.md');
  r = ffmKg({ bodyweightRows: [], settings: { goals: { preserve: { ffmKg: 70.5 } } }, todayStr: HOY });
  eq(r.kg, 70.5, 'y la declarada sale de settings.goals cuando el usuario la ajustó');
  r = ffmKg({ bodyweightRows: [{ date: '2026-09-20', weight: 84, bfPct: 21, source: 'withings', ffmKg: 66.4 }], todayStr: HOY });
  eq(r.source, 'declared', 'una fila del FUTURO no se usa (no se prescribe sobre lo que no pasó)');
  yes(ffmKg({}).kg > 0, 'sin entrada no revienta y devuelve un número usable');
}

// ── F-20 · el carbohidrato por tipo de día deja de estar muerto ─────────────────
//
// EL FALLO. `NUT_CARB_TARGETS` llevaba tres versiones sin un solo lector, y detrás hay una
// regla con fuente: REC-007 ("periodizar el carbohidrato por tipo de día en vez de subir el
// total"; Thomas/Erdman/Burke 2016, Tabla 2). Su `consumerNote` en evidence-to-rules.md decía
// literalmente que era "el siguiente incremento de nutrición". Lo que este test protege es la
// parte que se puede equivocar en silencio: que el TIPO de día salga de lo que pasó y no del
// día de la semana — el caveat de la propia regla avisa de que la tabla de nutrition-notes.md
// nombra Lun/Jue del plan de abril, que está retirado.
console.log('\nF-20. Carbohidrato por tipo de día (REC-007)');
{
  eq(JSON.stringify(N.NUT_CARB_TARGETS), '{"lower":350,"upper":285,"longrun":310,"rest":250}',
    'los cuatro objetivos, como en plans/nutrition-notes.md v3.0');
  yes(typeof N.nutDayType === 'function', 'existe nutDayType()');

  // Se reconstruye el módulo con los colaboradores de app.js fingidos: `nutDayType` los
  // consulta con `typeof`, así que sin ellos cae al baseline y hay que probar las dos cosas.
  const conEntorno = (env) => {
    const box = Object.assign({ module: { exports: {} }, console, Date }, env);
    box.exports = box.module.exports;
    vm.createContext(box);
    new vm.Script(SRC).runInContext(box);
    return box.module.exports;
  };
  const CLASES = {
    lowerA: { family: 'strength', subtype: 'lower' },
    upperA: { family: 'strength', subtype: 'upper' },
    hyroxA: { family: 'hybrid', subtype: 'conditioning' },
  };
  const base = {
    sessionClassMap: () => CLASES,
    activeWeekTemplate: { 1: { type: 'gym', session: 'lowerA' }, 2: { type: 'gym', session: 'upperA' }, 3: { type: 'rest' } },
    state: { settings: { proteinTarget: 185, calorieTargetTraining: 2700, calorieTargetRest: 2400 } },
  };
  const mk = (workouts, runs, sess) => conEntorno(Object.assign({}, base, {
    dbGetAll: (store) => Promise.resolve(store === 'workouts' ? workouts : []),
    getRunsDeduped: () => Promise.resolve(runs || []),
    getSessionsDeduped: () => Promise.resolve(sess || []),
  }));

  // 2026-09-07 es lunes; 09 miércoles (descanso en la plantilla); 08 martes.
  let M = mk([{ date: '2026-09-07', session: 'lowerA' }], [], []);
  eq(await M.nutDayType('2026-09-07'), 'lower', 'una sesión de pierna REGISTRADA → lower');
  eq((await M.nutDayTargets('2026-09-07')).carbTarget, 350, '…y 350 g de carbohidrato');

  M = mk([{ date: '2026-09-08', session: 'upperA' }], [], []);
  eq(await M.nutDayType('2026-09-08'), 'upper', 'una de tren superior → upper (el baseline)');
  eq((await M.nutDayTargets('2026-09-08')).carbTarget, 285, '…y 285 g');

  M = mk([{ date: '2026-09-08', session: 'hyroxA' }], [], []);
  eq(await M.nutDayType('2026-09-08'), 'lower',
    'el híbrido cuenta como pierna (concéntrico dominante), igual que en RUN-BEFORE-LEGS');

  M = mk([], [{ date: '2026-09-12', distance: 8.4, duration: 52 }], []);
  eq(await M.nutDayType('2026-09-12'), 'longrun', 'un rodaje de 8,4 km → longrun');
  eq((await M.nutDayTargets('2026-09-12')).carbTarget, 310, '…y 310 g');

  M = mk([], [{ date: '2026-09-12', distance: 3.1, duration: 22 }], []);
  eq(await M.nutDayType('2026-09-12'), 'upper',
    'un trote corto NO es longrun (< 5 km y < 40 min): el día se juzga por la fuerza');

  M = mk([], [], [{ date: '2026-09-12', family: 'cardio', durationMin: 45 }]);
  eq(await M.nutDayType('2026-09-12'), 'longrun',
    '45 min de remo en `sessions` también son cardio largo (la modalidad no manda, la dosis sí)');

  M = mk([], [], []);
  eq(await M.nutDayType('2026-09-09'), 'rest', 'un miércoles sin nada y con `rest` en la plantilla → rest');
  eq((await M.nutDayTargets('2026-09-09')).carbTarget, 250, '…y 250 g (menos carbo, más grasa)');
  eq(await M.nutDayType('2026-09-07'), 'lower', 'sin nada registrado, la plantilla del lunes ya dice lower');

  // Y sin los globales de app.js: baseline, nunca un día de pierna inventado.
  const SOLO = conEntorno({ dbGetAll: () => Promise.resolve([]) });
  eq(await SOLO.nutDayType('2026-09-07'), 'rest',
    'sin sessionClassMap ni plantilla no inventa: cae a rest, que es el baseline conservador');

  // La etiqueta que se pinta, en inglés (la UI es toda inglés desde v11.67).
  eq(N._nutDayTypeLabel('lower'), 'lower-body', 'la etiqueta de pantalla es inglesa');
  eq(N._nutDayTypeLabel('longrun'), 'long-cardio', '…también la de cardio largo');
  eq(N._nutDayTypeLabel('marciano'), 'training', 'y un tipo desconocido no rompe la frase');

  // Es INFORMACIÓN, no semáforo: no entra en NUT_BANDS ni cambia el objetivo de kcal.
  yes(!Object.prototype.hasOwnProperty.call(N.NUT_BANDS, 'carbs'),
    'el carbohidrato NO tiene banda de color: informa, no puntúa');
  const t = await mk([{ date: '2026-09-07', session: 'lowerA' }], [], []).nutDayTargets('2026-09-07');
  eq(t.kcalTarget, 2700, 'y el objetivo de kcal del día de entreno no se toca');
  eq(t.proteinFloor, 185, '…ni el suelo de proteína');
}

// ── F-21 · proteína POR COMIDA, no sólo el total ────────────────────────────────
//
// El total diario se cumple casi siempre; lo que decide la síntesis proteica es la DOSIS por
// comida (umbral de leucina, ~30-50 g a este peso: Moore 2009, Schoenfeld & Aragon 2018).
// 185 g en dos comidas y 185 g en cuatro dan el mismo número en pantalla y no son lo mismo,
// y hasta ahora la app sólo publicaba el número que no distingue.
console.log('\nF-21. Proteína por comida');
{
  eq(N.NUT_PROTEIN_MEAL_MIN, 30, 'el suelo por comida son 30 g');
  eq(N.NUT_PROTEIN_MEAL_MAX, 50, 'y el techo útil 50');
  const comida = (p) => ({ items: [{ kcal: 300, protein: p, nova: 1 }] });
  let a = N.aggregateMeals([comida(45), comida(50), comida(40), comida(50)]);
  eq(a.protein, 185, 'cuatro comidas: 185 g de total');
  eq(a.proteinPerMealAvg, 46, '…y 46 g de media por comida');
  eq(a.mealsUnderProteinMin, 0, '…ninguna por debajo del umbral');
  eq(JSON.stringify(a.proteinPerMeal), '[45,50,40,50]', '…con el desglose, no sólo la media');

  a = N.aggregateMeals([comida(160), comida(25)]);
  eq(a.protein, 185, 'el mismo total en dos comidas');
  eq(a.proteinPerMealAvg, 93, '…da 93 g de media: la media sola tampoco basta');
  eq(a.mealsUnderProteinMin, 1, '…y el contador señala la comida que se queda en 25 g');

  a = N.aggregateMeals([]);
  eq(a.proteinPerMealAvg, null, 'sin comidas es null y no 0 (0 g/comida sería mentir)');
  eq(a.mealsUnderProteinMin, 0, '…y ninguna comida floja, porque no hay ninguna');

  // Una comida con varios items suma dentro de la comida, no cuenta como varias.
  a = N.aggregateMeals([{ items: [{ kcal: 200, protein: 20 }, { kcal: 150, protein: 18 }] }]);
  eq(a.mealCount, 1, 'dos alimentos en un plato siguen siendo UNA comida');
  eq(a.proteinPerMealAvg, 38, '…con 38 g de proteína, por encima del umbral');
  eq(a.mealsUnderProteinMin, 0, '…así que no se marca como floja');
}

// ── F-20 · F-21 · y llegan a la pantalla ────────────────────────────────────────
// Los dos números se calculan en `computeNutritionDay` y se pintan en `renderNutToday`. Un
// campo que se calcula y no se pinta es el bug que F-20 viene a cerrar, así que se comprueba
// el otro extremo del cable.
console.log('\nF-20/F-21. Publicados en la fila del día y en la vista');
{
  const fila = SRC.slice(SRC.indexOf('async function computeNutritionDay('), SRC.indexOf('async function recomputeNutritionDay('));
  for (const k of ['proteinPerMeal: agg.proteinPerMeal', 'proteinPerMealAvg: agg.proteinPerMealAvg',
                   'mealsUnderProteinMin: agg.mealsUnderProteinMin',
                   'dayType: targets.dayType', 'carbTarget: targets.carbTarget']) {
    yes(fila.includes(k), `la fila del día publica ${k.split(':')[0]}`);
  }
  const vista = SRC.slice(SRC.indexOf('function renderNutToday(day) {'), SRC.indexOf('async function renderNutMeals('));
  yes(/\$\{perMealNote\}/.test(vista), 'la vista pinta la nota de proteína por comida');
  yes(/leucine threshold/.test(vista), '…nombrando el umbral, no un número suelto');
  yes(/day\.mealCount/.test(vista), '…y sólo cuando hay comidas registradas');
  yes(/day\.carbTarget \? ` \/ \$\{day\.carbTarget\}`/.test(vista),
    'y los carbos se pintan contra su objetivo del día');
  yes(/REC-007/.test(vista), '…citando la regla, como el resto de la tarjeta');
  yes(/redistribution, not more calories/.test(vista),
    '…y diciendo que la palanca es redistribuir, no subir el total (el caveat de REC-007)');
}

// ── v11.76 · LA COMIDA EN TRES CAMINOS ──────────────────────────────────────────
//
// Hasta aquí había UN embudo: foto → hoja de confirmación → saveMeal. Y la biblioteca era
// sólo por 100 g, así que registrar un batido de proteína pedía teclear "30" cada vez y
// registrar el mismo bowl de Honest Greens pedía sacarle una foto por quinta vez.
//
// LOS FALLOS QUE ESTE BLOQUE IMPIDE:
//   · Una fila de `foods` sin `serving` (todas las que ya están en el teléfono) dejando de
//     comportarse como antes. La migración es PEREZOSA: sin `serving`, 100 g, como siempre.
//   · Las medidas convirtiéndose en un SEGUNDO juego de macros. La verdad sigue siendo
//     `*100`; la medida es un multiplicador y nada más. Si alguien guarda kcal por ración,
//     el día deja de cuadrar con la suma de sus comidas.
//   · `useCount` contando comidas borradas, o `lastUsedAt` moviéndose al borrar.
//   · La línea de contexto de los chips cambiando de formato en silencio: es lo que lee el
//     prompt del servidor, así que su formato es un contrato, no una decoración.
console.log('\nv11.76. Medidas, uso, picker y chips');
{
  // ── A · La medida, con migración perezosa ────────────────────────────────────
  const viejo = { id: 'whey', name: 'Proteína whey (polvo)', kcal100: 380, protein100: 80,
                  carbs100: 8, fat100: 4, fiber100: 0, nova: 4 };
  const s0 = N.foodServings(viejo);
  eq(s0.length, 1, 'una fila sin `serving` tiene UNA medida');
  eq(s0[0].grams, 100, '…de 100 g, exactamente como antes de v11.76');
  eq(s0[0].label, '100 g', '…y así etiquetada');

  const whey = { ...viejo, serving: { label: '1 scoop', grams: 30 } };
  eq(N.foodServings(whey)[0].grams, 30, 'con `serving` la medida por defecto son 30 g');
  const multi = { ...whey, servings: [{ label: '1 scoop', grams: 30 }, { label: '2 scoops', grams: 60 }] };
  eq(N.foodServings(multi).length, 2, '`servings[]` publica todas las medidas');
  eq(N.foodServings(multi)[0].label, '1 scoop', '…con la de `serving` primero');
  eq(N.foodServings({ ...viejo, serving: { label: 'x', grams: 0 } })[0].grams, 100,
     'una medida de 0 g no se acepta: cae al respaldo de 100 g');

  // ── B · La medida es un MULTIPLICADOR, nunca un segundo juego de macros ───────
  const c1 = N.servingCost(whey, 0, 1);
  eq(c1.grams, 30, '1 scoop = 30 g');
  eq(c1.kcal, 114, '…114 kcal, calculadas desde kcal100');
  eq(c1.protein, 24, '…24 g de proteína');
  const c2 = N.servingCost(whey, 0, 2);
  eq(c2.grams, 60, '2 medidas = 60 g');
  eq(c2.kcal, 228, '…y las kcal escalan, no se duplica una cifra guardada');
  eq(N.nutServingLine(whey, 0, 1), '1 scoop · 30 g · 114 kcal · 24 g P',
     'la fila del picker dice qué cuesta la medida');
  eq(N.nutServingLine(whey, 0, 2), '2 × 1 scoop · 60 g · 228 kcal · 48 g P',
     '…y con varias medidas lo dice sin inventar un plural');
  eq(N.nutServingLine(viejo, 0, 1), '100 g · 380 kcal · 80 g P',
     'un alimento sin medida sigue leyéndose en gramos, sin repetirlos dos veces');
  // Lo que persiste son GRAMOS: el item que entra en la comida es el de siempre.
  const it = N.itemFromFood(whey, N.servingGrams(whey, 0, 1));
  eq(it.grams, 30, 'lo que se guarda en la comida son gramos');
  eq(it.kcal, 114, '…con los macros de la regla de tres de siempre');
  eq(it.serving, undefined, '…y sin un segundo juego de macros pegado al item');

  // ── C · Uso: un campo, no un escaneo de todas las comidas en cada pintado ─────
  const comidasUso = [
    { date: '2026-09-10', time: '08:00', items: [{ foodId: 'whey', kcal: 114 }, { foodId: 'avena', kcal: 300 }] },
    { date: '2026-09-11', time: '08:10', items: [{ foodId: 'whey', kcal: 114 }, { kcal: 50 }] },
  ];
  const mapa = N.nutFoodUsageMap(comidasUso);
  eq(mapa.get('whey').count, 2, 'la whey aparece en dos comidas');
  eq(mapa.get('whey').kcal, 228, '…con sus kcal acumuladas');
  eq(mapa.get('whey').lastUsedAt, '2026-09-11T08:10', '…y la última vez, con su hora');
  eq(mapa.get('avena').count, 1, 'la avena, una');
  eq(mapa.size, 2, 'y nada más: un item sin foodId ni nombre no inventa una fila');
  eq(N.nutFoodUsageMap([{ date: '2026-09-10', items: [{ name: 'Skyr natural', kcal: 63 }] }]).get('skyr-natural').count,
     1, 'un item viejo sin foodId se atribuye por nombre, como hacía el ranking antes');
  eq(N.nutFoodUsageMap(null).size, 0, 'null no revienta');

  let f = N.nutBumpFood(viejo, 1, '2026-09-12T13:00', 114);
  eq(f.useCount, 1, 'registrar una comida sube el contador');
  eq(f.lastUsedAt, '2026-09-12T13:00', '…y sella cuándo');
  eq(f.useKcal, 114, '…y acumula las kcal');
  f = N.nutBumpFood(f, -1, '2026-09-13T13:00', 114);
  eq(f.useCount, 0, 'borrar la comida lo baja');
  eq(f.lastUsedAt, '2026-09-12T13:00', '…y NO mueve la última vez hacia el futuro');
  eq(N.nutBumpFood(f, -1, '2026-09-14T09:00', 999).useCount, 0, 'el contador nunca baja de 0');
  eq(N.nutBumpFood(f, -1, '2026-09-14T09:00', 999).useKcal, 0, '…ni las kcal');

  // ── D · El picker: Recent y Frequent arriba, el resto por score ───────────────
  const lib = [
    { id: 'whey', name: 'Proteína whey (polvo)', aliases: ['protein shake'], kcal100: 380, protein100: 80, fiber100: 0, nova: 4, useCount: 9, lastUsedAt: '2026-09-01T08:00' },
    { id: 'skyr', name: 'Skyr natural', aliases: [], kcal100: 63, protein100: 11, fiber100: 0, nova: 1, useCount: 2, lastUsedAt: '2026-09-12T09:00' },
    { id: 'pollo', name: 'Pechuga de pollo', aliases: ['chicken breast'], kcal100: 165, protein100: 31, fiber100: 0, nova: 1 },
    { id: 'hg-bowl', name: 'Honest Greens · Spicy Feta Bowl', aliases: [], kcal100: 130, protein100: 7, fiber100: 3, nova: 3, useCount: 4, lastUsedAt: '2026-09-11T14:00', source: 'dish' },
  ];
  const sec = N.nutPickerSections(lib, '');
  eq(sec.recent.map(f2 => f2.id).join(','), 'skyr,hg-bowl,whey', 'Recent va por `lastUsedAt`, lo último primero');
  eq(sec.frequent.length, 0, 'con la biblioteca corta, Frequent no repite lo que ya está en Recent');
  eq(sec.rest.map(f2 => f2.id).join(','), 'pollo', 'el resto, por score, sin duplicar');
  eq(sec.matches.length, 0, 'sin búsqueda no hay lista de coincidencias');

  const sec2 = N.nutPickerSections(lib, 'chicken');
  eq(sec2.matches.map(f2 => f2.id).join(','), 'pollo', 'la búsqueda encuentra por alias');
  eq(sec2.recent.length, 0, '…y con búsqueda no se pintan las secciones');
  eq(N.nutPickerSections(lib, 'greens').matches[0].id, 'hg-bowl',
     'y un plato guardado desde una foto se busca por su nombre');
  eq(N.nutPickerSections(lib, 'zzz').matches.length, 0, 'sin coincidencias, lista vacía');
  eq(N.nutPickerSections(null, '').rest.length, 0, 'null no revienta');
  // Frecuencia por delante del score cuando hay historial: es lo que uno quiere teclear menos.
  const muchos = Array.from({ length: 12 }, (_, k) => ({
    id: 'f' + k, name: 'Food ' + k, kcal100: 100, protein100: 5, fiber100: 0, nova: 1,
    useCount: k, lastUsedAt: k ? `2026-08-${String(k + 10)}T12:00` : null,
  }));
  const sec3 = N.nutPickerSections(muchos, '');
  eq(sec3.recent.length, 6, 'Recent se corta en 6 filas');
  eq(sec3.frequent.length, 5, '…y Frequent recoge los siguientes por uso, sin repetir');
  yes(sec3.frequent.every(f2 => !sec3.recent.some(r => r.id === f2.id)),
     '…sin que un alimento salga en las dos secciones');

  // ── E · La línea de contexto de los chips (camino C) ──────────────────────────
  eq(N.nutChipLine({ portion: '1 plate', cooking: 'grilled, little oil' }, { time: '14:20', dayType: 'lower' }),
     'Context — Portion: 1 plate · Cooking: grilled, little oil · Time: 14:20 · Day: lower-body day',
     'la línea estructurada que se añade a la nota');
  eq(N.nutChipLine({}, {}), '', 'sin chips ni contexto no se añade nada');
  eq(N.nutChipLine({}, { time: '09:10', dayType: 'rest' }),
     'Context — Time: 09:10 · Day: rest day',
     'la hora y el tipo de día los pone el cliente solo, sin preguntar');
  eq(N.nutChipLine({ drink: 'beer 330 ml' }, {}), 'Context — Drink: beer 330 ml',
     'el alcohol entra por su chip: es la cuarta macro y ya se modela');
  eq(N.nutChipLine(null, null), '', 'null no revienta');
  // Los cinco datos que de verdad mueven el número, cada uno con su regla.
  eq(N.NUT_CHIP_DEFS.map(d => d.key).join(','), 'portion,cooking,protein,place,drink',
     'los cinco chips, en el orden en que se leen');
  yes(N.NUT_CHIP_DEFS.every(d => d.label && d.options && d.options.length >= 3),
     'cada chip tiene etiqueta y al menos tres opciones');
  yes(N.NUT_CHIP_DEFS.every(d => /^(REC-\d{3}|all)$/.test(d.rule)),
     'cada chip cita la regla que consume su dato');
}

// ── v11.76 · TODO CAMINO TERMINA EN saveMeal() ──────────────────────────────────
// La invariante del módulo: `recomputeNutritionDay` es el único escritor de `nutrition`, y
// sólo lo alcanzan `saveMeal` / `deleteMeal` / `nutCloseDay`. Tres caminos de entrada
// multiplican por tres las ocasiones de saltársela.
console.log('\nv11.76. Los tres caminos desembocan en saveMeal()');
{
  const escrituras = (SRC.match(/smartPut\('meals'/g) || []).length;
  eq(escrituras, 1, "una sola escritura de 'meals' en todo el módulo");
  const SAVE = fnSrcN('async function saveMeal(');
  yes(/smartPut\('meals', m\)/.test(SAVE), '…y está dentro de saveMeal()');
  yes(/recomputeNutritionDay\(m\.date\)/.test(SAVE), '…que recalcula el día');
  yes(/nutApplyFoodUsage\(m\.items, 1/.test(SAVE),
     'saveMeal() es también donde se actualiza el uso de la biblioteca (useCount/lastUsedAt)');
  const DEL = fnSrcN('async function deleteMeal(');
  yes(/nutApplyFoodUsage\([^,]+, -1/.test(DEL), 'y borrar una comida lo deshace');
  // El picker no puede escribir la comida por su cuenta: mete items en la hoja y ya.
  const PICK = fnSrcN('async function nutAddItemManual(');
  yes(!/smartPut\(/.test(PICK), 'el picker no escribe nada: sólo añade items a la hoja');
  yes(/nutOpenFoodPicker\(/.test(PICK), '…y se apoya en la hoja inferior nueva');
  // Guardar un plato escribe en `foods`, nunca en `meals` ni en `nutrition`.
  const DISH = fnSrcN('async function nutSaveItemAsFood(');
  yes(/smartPut\('foods'/.test(DISH), '"Save to my foods" escribe en la biblioteca');
  yes(!/smartPut\('meals'|smartPut\('nutrition'/.test(DISH), '…y en ningún otro store');
  yes(/serving:/.test(DISH), '…con la medida realmente comida como medida por defecto');
  yes(/photoPath/.test(DISH), '…y con la foto que ya estaba subida');
  yes(/source: 'dish'/.test(DISH), "…marcado como source:'dish'");
}

// ── Resultado ───────────────────────────────────────────────────────────────────
console.log(failed === 0
  ? '\n✅ Nutrición v2: todas las métricas derivadas son reproducibles.'
  : `\n❌ ${failed} comprobación(es) fallaron.`);
process.exit(failed === 0 ? 0 : 1);
