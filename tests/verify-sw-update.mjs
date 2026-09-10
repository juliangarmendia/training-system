// C-6 · El flujo de actualización del service worker no puede recargar a mitad de una serie.
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR (auditoría 2026-09-09). `registerServiceWorker()`
// tenía cuatro problemas a la vez, y los cuatro se notan con el teléfono en la mano:
//
//   1. DOS caminos de recarga — `updatefound` (cuando el worker nuevo activa) y
//      `controllerchange` (cuando toma el control). Con `skipWaiting()` + `clients.claim()` en
//      `sw.js` los dos disparan en la misma actualización: la página se recargaba dos veces.
//   2. `controllerchange` salta también en la PRIMERA instalación, cuando la página todavía no
//      tenía controlador. Era el "se recarga sola la primera vez que la abro".
//   3. `reg.installing` sin comprobar null. `updatefound` también salta cuando el que cambia es
//      `reg.waiting`, y ahí `installing` es null: el `addEventListener` lanzaba un TypeError
//      dentro del `.then`, se perdía, y esa pestaña no volvía a aplicar una actualización.
//   4. `reg.update()` cada 5 minutos, y cada comprobación podía acabar en `location.reload()`
//      con el entreno abierto — el borrador se persiste, pero el sitio en la sesión se pierde,
//      y pasa exactamente cuando el teléfono está apoyado en el banco.
//
// Lo que se protege: UN camino, con la comprobación de null, sin recarga sin controlador, y con
// `state.activeSession` abierto un chip pulsable en vez de una recarga. El chip se EJECUTA en un
// sandbox: que la cadena esté en el fichero no prueba que el DOM la reciba.
//
// Ejecutar desde la raíz del repo: node tests/verify-sw-update.mjs

import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const APP = readFileSync('app/app.js', 'utf8');
const SW = readFileSync('app/sw.js', 'utf8');
const CSS = readFileSync('app/style.css', 'utf8');

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { console.log(`  FAIL ${m}`); failed++; };
const yes = (c, m) => (c ? ok(m) : bad(m));
const eq = (got, want, m) => (String(got) === String(want) ? ok(m) : bad(`${m} — esperaba ${want}, obtuve ${got}`));

// Cuerpo de una función por emparejado de llaves desde el `) {` de los parámetros.
function body(src, name) {
  const i = src.indexOf(name);
  if (i === -1) return '';
  const open = src.indexOf(') {', i);
  if (open === -1) return '';
  let depth = 0, start = open + 2, j = start;
  for (; j < src.length; j++) { if (src[j] === '{') depth++; else if (src[j] === '}' && --depth === 0) break; }
  return src.slice(start, j + 1);
}

// ── 1. Un solo camino de recarga ────────────────────────────────────────────────────
console.log('1. Un solo camino');
const REG = body(APP, 'function registerServiceWorker()');
yes(REG.length > 0, 'se localiza registerServiceWorker()');
// Se mira el CÓDIGO, no los comentarios: el comentario que explica qué camino se retiró tiene
// que poder nombrarlo.
const sinComentarios = (src) => src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const APP_CODE = sinComentarios(APP);
yes(!/controllerchange/.test(APP_CODE), "no queda NINGÚN listener de 'controllerchange' en app.js");
eq((APP_CODE.match(/location\.reload\(/g) || []).length, 2,
  'sólo dos `location.reload()` en app.js: el de _swApplyUpdate() y el de "Force update"');
yes(/function _swApplyUpdate\(\)/.test(APP), 'la recarga está detrás de _swApplyUpdate()');
yes(/if \(_swReloading\) return;\s*\n\s*_swReloading = true;/.test(APP),
  '_swApplyUpdate() es idempotente (el chip y el camino automático comparten salida)');

// ── 2. La comprobación de null y la primera instalación ─────────────────────────────
console.log('');
console.log('2. installing || waiting, y nada sin controlador');
yes(/const w = reg\.installing \|\| reg\.waiting;/.test(REG),
  'toma `reg.installing || reg.waiting` (updatefound también salta con `waiting`)');
yes(/const w = reg\.installing \|\| reg\.waiting;\s*\n\s*if \(!w\) return;/.test(REG),
  'y vuelve si no hay ninguno de los dos (era el TypeError silencioso)');
yes(/if \(!navigator\.serviceWorker\.controller\) return;/.test(REG),
  'sin controlador (primera instalación) no hace nada');
yes(REG.indexOf('if (!w) return;') < REG.indexOf('addEventListener(\'statechange\''),
  'la comprobación va ANTES de colgar el statechange');
yes(!/reg\.installing\.addEventListener/.test(APP), 'nunca se usa `reg.installing` sin comprobar');

// ── 3. El intervalo ─────────────────────────────────────────────────────────────────
console.log('');
console.log('3. La comprobación periódica no es cada 5 minutos');
const iv = /setInterval\([\s\S]{0,120}?reg\.update\(\)[\s\S]{0,60}?, (\d+) \* 60 \* 1000\)/.exec(REG);
yes(!!iv, 'el `setInterval` de reg.update() es localizable');
if (iv) yes(Number(iv[1]) >= 30, `cada ${iv[1]} min (>= 30: cada comprobación puede acabar en recarga)`);
yes(/Promise\.resolve\(reg\.update\(\)\)\.catch\(\(\) => \{\}\)/.test(REG),
  'y su rechazo no queda sin manejar (sin red, `update()` rechaza)');

// ── 4. Con la sesión abierta: chip, no recarga ──────────────────────────────────────
console.log('');
console.log('4. Con `state.activeSession` abierto se ofrece, no se recarga');
const READY = body(APP, 'function _swVersionReady()');
yes(READY.length > 0, 'se localiza _swVersionReady()');
yes(/if \(state\.activeSession\)/.test(READY), 'mira state.activeSession');
yes(READY.indexOf('state.activeSession') < READY.indexOf('_swUpdateChip()'),
  'y la rama de la sesión abierta pinta el chip');
const iChip = READY.indexOf('_swUpdateChip()');
const iReload = READY.indexOf('_swApplyUpdate');
yes(iChip > 0 && iReload > iChip, 'la recarga automática queda DESPUÉS del `return` de esa rama');
yes(/_swUpdateChip\(\);\s*\n\s*return;/.test(READY), 'y esa rama vuelve sin recargar');

// El chip, EJECUTADO. Sin esto sólo se comprueba que la cadena existe en el fichero.
{
  const src = body(APP, 'function _swUpdateChip()');
  const nodos = [];
  const nuevo = () => {
    const el = {
      id: '', className: '', innerHTML: '', _clases: new Set(), _clicks: [],
      classList: { add(c) { el._clases.add(c); } },
      addEventListener(t, fn) { if (t === 'click') el._clicks.push(fn); },
    };
    nodos.push(el);
    return el;
  };
  let aplicado = 0;
  const ctx = {
    console,
    document: {
      getElementById: () => (nodos.length ? nodos[0] : null),
      createElement: nuevo,
      body: { appendChild() {} },
    },
    _swApplyUpdate: () => { aplicado++; },
  };
  vm.createContext(ctx);
  vm.runInContext(`function _swUpdateChip() ${src}\nglobalThis.__chip = _swUpdateChip;`, ctx);
  ctx.__chip();
  const el = nodos[0];
  yes(!!el, 'el chip crea su elemento');
  if (el) {
    eq(el.id, 'sw-update-chip', 'con id propio (para que toast() no lo reutilice)');
    yes(/\btoast\b/.test(el.className) && /toast-sticky/.test(el.className),
      `reutiliza el CSS del toast y se marca sticky (class="${el.className}")`);
    yes(el._clases.has('show'), 'y se muestra (.show)');
    yes(/New version/.test(el.innerHTML), 'el texto dice que hay una versión nueva');
    yes(/toast-action/.test(el.innerHTML) && />Reload</.test(el.innerHTML),
      'con el botón "Reload" del CSS que ya existe');
    yes(el._clicks.length === 1, 'y un solo handler de click en toda la superficie');
    if (el._clicks.length) { el._clicks[0](); eq(aplicado, 1, 'pulsarlo recarga'); }
    // Segunda llamada: no debe duplicar el elemento ni el handler.
    ctx.__chip();
    eq(nodos.length, 1, 'llamarlo dos veces no crea un segundo chip');
    eq(el._clicks.length, 1, 'ni un segundo handler');
  }
}

// ── 5. `toast()` no puede robarle el contenedor ─────────────────────────────────────
console.log('');
console.log('5. toast() ignora el chip');
yes(/document\.querySelector\('\.toast:not\(\.toast-sticky\)'\)/.test(APP),
  "toast() busca `.toast:not(.toast-sticky)` — sin esto el primer toast borraría el aviso");
yes(/\.toast\.toast-sticky\s*\{/.test(CSS), '.toast.toast-sticky existe en style.css');
yes(/\.toast\.toast-sticky\s*\{[^}]*cursor:\s*pointer/.test(CSS), 'y es pulsable');

// ── 6. sw.js: `clients.claim()` se QUEDA ────────────────────────────────────────────
console.log('');
console.log('6. sw.js');
yes(/self\.clients\.claim\(\)/.test(SW),
  'clients.claim() se queda: sin él la primera visita no tiene controlador y no hay app offline');
yes(/self\.skipWaiting\(\)/.test(SW), 'y skipWaiting() también (el worker nuevo no se queda esperando)');
yes(!/location\.reload/.test(SW), 'sw.js no recarga clientes por su cuenta');

console.log('');
if (failed) { console.log(`${failed} FALLOS`); process.exit(1); }
console.log('TODO OK');
