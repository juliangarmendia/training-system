// ════════════════════════════════════════════════════════════════════════════════════
// verify-run-dedupe.mjs — una carrera es una carrera, llegue por donde llegue
// ════════════════════════════════════════════════════════════════════════════════════
//
// Cada carrera del COROS entra DOS veces en `runs`: `strava_<id>` y `icu_<id>`. Es a propósito
// (cardio-types.ts:156) — la base guarda una fila por fuente y la app fusiona AL LEER con
// `dedupeRuns`. `verify-dedupe-reads.mjs` obliga a que toda lectura pase por ahí; este test
// comprueba que la fusión en sí acierta, con el `dedupeRuns` REAL de app.js (hasta v11.82 sólo
// lo probaba una copia simplificada dentro de verify-coach-facts).
//
// Lo que protege:
//   1. Las parejas reales de septiembre 2026 quedan en una carrera cada una, y gana intervals.icu.
//   2. Strava guarda `sport_type` (TrailRun, VirtualRun) e intervals `type` (Run): la misma carrera
//      con nombres distintos se fusiona igual. Antes de v11.82 la comparación era exacta y contaba doble.
//   3. Lo que NO es la misma actividad no se fusiona: otro día, otra distancia, otra modalidad.
//   4. El `feel` puesto a mano sobrevive aunque gane la fila importada.
//
// Ejecutar desde la raíz del repo: node tests/verify-run-dedupe.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (cond, m) => (cond ? ok(m) : bad(m));
const eq = (got, want, m) =>
  (JSON.stringify(got) === JSON.stringify(want) ? ok(m) : bad(`${m} — esperaba ${JSON.stringify(want)}, obtuve ${JSON.stringify(got)}`));

// app.js no es un módulo: se recortan los dos bloques puros que hacen falta y se ejecutan en vm.
const APP = readFileSync('app/app.js', 'utf8');
const slice = (from, to) => {
  const i = APP.indexOf(from);
  const j = APP.indexOf(to, i);
  if (i < 0 || j < 0) throw new Error(`no encuentro el bloque ${from} … ${to} en app.js`);
  return APP.slice(i, j);
};
const SRC = [
  slice('const CARDIO_TYPE_MAP = {', 'function _activityModality('),
  slice('function _activityModality(', '\n}\n') + '\n}\n',
  slice('function _runSportFamily(', '// Deduped accessor'),
].join('\n');
const ctx = { console };
vm.createContext(ctx);
new vm.Script(SRC + '\nthis.dedupeRuns = dedupeRuns;').runInContext(ctx);
const { dedupeRuns } = ctx;

console.log('verify-run-dedupe');
yes(typeof dedupeRuns === 'function', 'dedupeRuns se carga desde app.js');

// ── 1. Las filas reales de Supabase, 2026-09-07 → 2026-09-21 ──
sec('1 · septiembre real: 12 filas, 6 carreras');
const R = (id, date, km, dur, source, sport = 'Run') => ({ id, date, distance: km, duration: dur, source, sport });
const sept = [
  R('icu_i184370895', '2026-09-07', 5.31, 39, 'intervals.icu'), R('strava_20080185580', '2026-09-07', 5.31, 39, 'strava'),
  R('icu_i185072914', '2026-09-09', 4.84, 32, 'intervals.icu'), R('strava_20107941976', '2026-09-09', 4.84, 32, 'strava'),
  R('icu_i186188839', '2026-09-13', 3.52, 26, 'intervals.icu'), R('strava_20155523600', '2026-09-13', 3.52, 26, 'strava'),
  // El 16 son dos actividades distintas en el propio Strava (duplicado de origen), sin fila de intervals.
  R('strava_20195738506', '2026-09-16', 4.9, 27, 'strava'), R('strava_20195743445', '2026-09-16', 4.82, 27, 'strava'),
  R('icu_i188046502', '2026-09-18', 5.09, 36, 'intervals.icu'), R('strava_20231245016', '2026-09-18', 5.09, 36, 'strava'),
  R('icu_i189002433', '2026-09-21', 2.94, 19, 'intervals.icu'), R('strava_20272751068', '2026-09-21', 2.94, 19, 'strava'),
];
const out = dedupeRuns(sept);
eq(out.length, 6, '12 filas → 6 carreras');
eq(out.map(r => r.date), ['2026-09-07', '2026-09-09', '2026-09-13', '2026-09-16', '2026-09-18', '2026-09-21'], 'una por día');
yes(out.filter(r => r.date !== '2026-09-16').every(r => r.source === 'intervals.icu'), 'con pareja, gana intervals.icu');
eq(Math.round(out.reduce((s, r) => s + r.distance, 0) * 100) / 100, 26.6, 'km de la ventana: 26,6 y no el doble');

// ── 2. Mismo deporte con distinto nombre ──
sec('2 · TrailRun / VirtualRun / Run son la misma familia');
eq(dedupeRuns([R('icu_1', '2026-10-01', 8.0, 50, 'intervals.icu', 'Run'), R('strava_1', '2026-10-01', 8.0, 50, 'strava', 'TrailRun')]).length, 1, 'Run (intervals) + TrailRun (Strava) → 1');
eq(dedupeRuns([R('icu_2', '2026-10-01', 6.0, 35, 'intervals.icu', 'Treadmill'), R('strava_2', '2026-10-01', 6.0, 35, 'strava', 'VirtualRun')]).length, 1, 'Treadmill + VirtualRun → 1');
eq(dedupeRuns([R('icu_3', '2026-10-01', 6.0, 35, 'intervals.icu'), R('strava_3', '2026-10-01', 6.0, 35, 'strava', undefined)]).length, 1, 'sin sport = Run');

// ── 3. Lo que no es la misma actividad ──
sec('3 · no fusiona lo distinto');
eq(dedupeRuns([R('a', '2026-10-01', 5, 30, 'intervals.icu'), R('b', '2026-10-02', 5, 30, 'strava')]).length, 2, 'otro día');
eq(dedupeRuns([R('a', '2026-10-01', 5, 30, 'intervals.icu'), R('b', '2026-10-01', 5.5, 30, 'strava')]).length, 2, '0,5 km de diferencia');
eq(dedupeRuns([R('a', '2026-10-01', 5, 30, 'intervals.icu'), R('b', '2026-10-01', 5, 40, 'strava')]).length, 2, '10 min de diferencia');
eq(dedupeRuns([R('a', '2026-10-01', 5, 30, 'intervals.icu', 'Run'), R('b', '2026-10-01', 5, 30, 'strava', 'Ride')]).length, 2, 'carrera y bici no se fusionan');

// ── 4. El feel manual sobrevive ──
sec('4 · feel');
const withFeel = dedupeRuns([{ ...R('strava_9', '2026-10-01', 5, 30, 'strava'), feel: 4 }, R('icu_9', '2026-10-01', 5, 30, 'intervals.icu')]);
eq([withFeel.length, withFeel[0].source, withFeel[0].feel], [1, 'intervals.icu', 4], 'gana intervals.icu y conserva feel 4');

function sec(t) { console.log(''); console.log(t); }

console.log('');
if (failed) { console.log(`${failed} FALLO(S)`); process.exit(1); }
console.log('todo ok');
