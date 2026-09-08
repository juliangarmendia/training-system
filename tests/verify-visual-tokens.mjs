// verify-visual-tokens.mjs — v11.68 (auditoría 2026-09-08, incremento 5: visual + UX + ledger)
//
// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR: que la identidad visual vuelva a ser una
// sugerencia. Los tokens de `:root` existen desde v11.0 y en septiembre de 2026 la auditoría
// contó, en el mismo fichero que los declara: **cinco** paddings distintos para `.card`,
// **cuatro** tamaños para el mismo *eyebrow*, 473 `font-size` literales y hexes de la paleta
// por defecto de Tailwind conviviendo con los de la identidad. Ninguna de esas cinco cosas
// rompe nada: la app se ve "casi bien", y esa es exactamente la razón de que nadie las
// arregle. Cada familia nueva copia la anterior y el drift se hereda.
//
// Las seis formas concretas de que vuelva, y su comprobación aquí:
//
//   1. **Una familia nueva se pone su propio padding de tarjeta.** Fue así ocho veces entre
//      v11.55 y v11.65 (`14px 16px` copiado de la familia de al lado), y el resultado en Home
//      era una columna de tarjetas cuyo texto no arrancaba en la misma vertical. §1.
//   2. **Una etiqueta mono nueva elige su tamaño a ojo.** Había 8,5 / 9 / 10 / 11 px para lo
//      mismo. La regla `.eyebrow` es ahora el único sitio donde ese estilo se declara. §2.
//   3. **Un `font-size` literal en las familias del coach.** No se persiguen las 470 legacy —
//      reescribirlas a ciegas es cómo se rompe una pantalla que nadie está mirando — pero las
//      familias tocadas desde v11.55 ya están migradas y no pueden retroceder. §3.
//   4. **Un hex fuera de paleta.** `#a78bfa`, `#f59e0b`, el `#666` de fallback, la paleta de
//      Tailwind por músculo en JS. Con una sola excepción documentada: el naranja de marca de
//      Strava, que es de Strava y no nuestro. §4.
//   5. **CSS muerto que alguien vuelve a usar sin querer.** 165 líneas de familias con cero
//      usos (los anillos de nutrición, `.todays-plan-*`, el vídeo de login, los anillos de
//      actividad…). Borrarlas no basta: hay que vigilar que no vuelvan. §5.
//   6. **Un renderer que vuelve a fallar en silencio o a inventarse un dato.** El Strain con
//      fallback 7 (un contador de series disfrazado de carga interna), el nombre
//      'Julian Garmendia' escrito en el fuente, la campana que no notifica nada, y los
//      sesenta `typeof X === 'function'` sin criterio. §6, §7.
//
// Y §8: el ledger de evidencia (R-11), que es el único de este incremento con lógica de
// verdad — se ejecuta con un fixture, no se grep-ea.
//
// Uso: node tests/verify-visual-tokens.mjs

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

let fails = 0;
let checks = 0;
function yes(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error('  FAIL ' + msg); }
}
function eq(a, b, msg) { yes(a === b, `${msg} (esperado ${JSON.stringify(b)}, fue ${JSON.stringify(a)})`); }
function section(t) { console.log('\n' + t); }

const CSS = readFileSync('app/style.css', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const COACHJS = readFileSync('app/coach.js', 'utf8');
const WHOOP = readFileSync('app/whoop.js', 'utf8');
const INTEG = readFileSync('app/integrations.js', 'utf8');
const HTML = readFileSync('app/index.html', 'utf8');
const ENGINE = readFileSync('app/coach-engine.js', 'utf8');

/** El cuerpo de una función de nivel superior, por conteo de llaves. */
function fnSrc(src, header) {
  const i = src.indexOf(header);
  if (i < 0) return '';
  let depth = 0;
  let started = false;
  for (let k = src.indexOf('{', i); k < src.length; k++) {
    if (src[k] === '{') { depth++; started = true; } else if (src[k] === '}') { depth--; }
    if (started && depth === 0) return src.slice(i, k + 1);
  }
  return '';
}

/** Todas las reglas CSS de nivel superior como `{ selector, body }`, sin comentarios. */
function cssRules(src) {
  const limpio = src.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(limpio)) !== null) {
    const sel = m[1].trim().split('\n').map((l) => l.trim()).join(' ');
    if (!sel || sel.startsWith('@')) continue;
    out.push({ sel, body: m[2] });
  }
  return out;
}
const RULES = cssRules(CSS);

// ---------------------------------------------------------------------------
// 1 · UN padding de tarjeta
// ---------------------------------------------------------------------------
section('1 · V-2 · un solo padding de `.card`');

const CARD_RULES = RULES.filter((r) => /(^|,)\s*\.card\s*(,|$)/.test(r.sel));
eq(CARD_RULES.length, 1, 'hay exactamente UNA regla `.card`');
const cardPad = (CARD_RULES[0] || { body: '' }).body.match(/(^|;)\s*padding\s*:\s*([^;]+)/);
yes(!!cardPad, '`.card` declara padding');
eq(cardPad ? cardPad[2].trim() : null, '16px', 'y es 16px (el valor de consenso de las nueve familias)');

// Las nueve familias que lo pisaban. Ninguna puede volver a declarar padding: el contenedor
// lleva `class="card <familia>"`, así que un padding propio gana por orden de cascada.
const SIN_PADDING = [
  't3-card', 'coach-readout', 'readiness-signals', 'coach-goals', 'coach-week-card',
  'coach-brief', 'coach-decs-card', 'coach-vers-card', 'cardio-rx',
];
for (const fam of SIN_PADDING) {
  const propias = RULES.filter((r) => new RegExp(`(^|,)\\s*\\.${fam}\\s*(,|$)`).test(r.sel))
    .filter((r) => /(^|;)\s*padding\s*:/.test(r.body));
  eq(propias.length, 0, `.${fam} no declara padding propio (hereda el de .card)`);
}
// `.stat-card` NO es un `.card` (vive en `.stat-trio`) y conserva padding compacto a propósito:
// con el eyebrow a 10px, "READINESS" mide 64,8 px y la tarjeta sólo tiene 83,5 px de ancho.
const STAT = RULES.find((r) => /(^|,)\s*\.stat-card\s*(,|$)/.test(r.sel));
yes(!!STAT && /padding:\s*12px 8px/.test(STAT.body),
  '.stat-card mantiene su padding compacto 12px 8px (la fila de 4 tiles en 390 px lo necesita)');
yes(!!STAT && /border-radius:\s*var\(--radius-lg\)/.test(STAT.body),
  'y su radio es var(--radius-lg), no un 16px literal');
yes(!!STAT && /border:\s*1px solid var\(--border\)/.test(STAT.body),
  'y su borde var(--border), no un rgba literal');

// ---------------------------------------------------------------------------
// 2 · UNA clase de eyebrow
// ---------------------------------------------------------------------------
section('2 · V-2 · una sola clase `.eyebrow`');

const EYEBROW_FAMS = ['eyebrow', 't3-eyebrow', 'coach-week-title', 'coach-brief-title',
                      'coach-goals-head', 'cwc-label', 'stat-card-label'];
const EY = RULES.find((r) => /(^|,)\s*\.eyebrow\s*(,|$)/.test(r.sel));
yes(!!EY, 'existe una regla `.eyebrow`');
for (const fam of EYEBROW_FAMS) {
  yes(!!EY && new RegExp(`(^|,)\\s*\\.${fam}\\s*(,|$)`).test(EY.sel),
    `.${fam} resuelve a la regla .eyebrow`);
}
yes(!!EY && /font-size:\s*var\(--fs-eyebrow\)/.test(EY.body), 'la regla usa var(--fs-eyebrow)');
yes(/--fs-eyebrow:\s*10px/.test(CSS), 'y el token vale 10px');
yes(!!EY && /letter-spacing:\s*0\.12em/.test(EY.body), 'tracking 0.12em');
yes(!!EY && /text-transform:\s*uppercase/.test(EY.body), 'mayúsculas');
yes(!!EY && /color:\s*var\(--text3\)/.test(EY.body), 'color var(--text3)');
yes(!!EY && /font-family:\s*var\(--font-mono\)/.test(EY.body), 'y la mono de la identidad');

// Ninguna de las seis familias puede redeclarar la tipografía por su cuenta: sería el cuarto
// tamaño de eyebrow otra vez. Sólo se les permite hueco vertical (`margin`), que no es tipografía.
const TIPO = /(^|;)\s*(font-size|font-family|letter-spacing|text-transform|color)\s*:/;
for (const fam of EYEBROW_FAMS.filter((f) => f !== 'eyebrow')) {
  const rebeldes = RULES
    .filter((r) => r !== EY)
    .filter((r) => new RegExp(`(^|,)\\s*\\.${fam}\\s*(,|$)`).test(r.sel))
    .filter((r) => TIPO.test(r.body));
  eq(rebeldes.length, 0, `.${fam} no vuelve a declarar su propia tipografía`);
}

// ---------------------------------------------------------------------------
// 3 · `--fs-*` en las familias tocadas desde v11.55
// ---------------------------------------------------------------------------
section('3 · V-2 · `--fs-*` en las familias del coach / integraciones / stat-card');

for (const tok of ['--fs-3xs: 9px', '--fs-2xs: 10px', '--fs-xs: 11px', '--fs-sm: 13px']) {
  yes(CSS.includes(tok), `el token ${tok.split(':')[0]} existe con su valor`);
}
// Sólo las familias nuevas: las 470 legacy se migran cuando se toca la pantalla, no a ciegas.
//
// `.wcc-*` queda FUERA a propósito y no por descuido: es la tarjeta del cron semanal retirado
// en v11.61 (`weekly_reviews`, hoy sólo lectura), y la mitad de sus tamaños son 12px, un paso
// que la escala `--fs-*` no tiene. Añadir un token para poder migrar el CSS de una pantalla en
// retirada sería inventarse la escala al revés. Cuando esa tarjeta se borre, se borra entera.
const FAM_NUEVAS = /^\.(coach-|rs-|cgl-|crl-|integ-|integrations-|stat-card|readiness-signals|t3-|evl-|queue-next|ht-status|sync-warning)/;
const literales = [];
for (const r of RULES) {
  const sels = r.sel.split(',').map((x) => x.trim()).filter(Boolean);
  if (!sels.length || !sels.every((x) => FAM_NUEVAS.test(x))) continue;
  const m = r.body.match(/(^|;)\s*font-size\s*:\s*(\d[\d.]*px)/);
  if (m) literales.push(`${r.sel} → ${m[2]}`);
}
if (literales.length) literales.forEach((l) => console.error('  FAIL font-size literal: ' + l));
checks++;
if (literales.length) fails++;
yes(literales.length === 0, `cero font-size literales en las familias nuevas (encontrados: ${literales.length})`);

// ---------------------------------------------------------------------------
// 4 · Cero hex fuera de paleta
// ---------------------------------------------------------------------------
section('4 · V-2 · hex fuera de paleta');

// En CSS sólo se permiten hexes DENTRO del bloque de tokens de `:root` (que es donde la
// paleta se define), más los grises absolutos #000/#fff/#0a0a0a… de sombras y scrims.
const ROOT_END = CSS.indexOf('\n}', CSS.indexOf(':root, [data-theme="dark"]'));
// Sin comentarios: un comentario que explica de qué token sale un rgba CITA el hex, y esa
// cita es documentación, no un color aplicado.
const CSS_FUERA = CSS.slice(ROOT_END).replace(/\/\*[\s\S]*?\*\//g, '');
const GRISES_OK = /^#(0{3,8}|f{3,8}|1a1a1a|0a0a0a)$/i;
const hexCss = [...CSS_FUERA.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0])
  .filter((h) => !GRISES_OK.test(h));
if (hexCss.length) console.error('  FAIL hex fuera de la paleta en style.css: ' + [...new Set(hexCss)].join(' '));
checks++;
if (hexCss.length) fails++;
yes(hexCss.length === 0, `cero hex de color fuera del bloque de tokens (encontrados: ${hexCss.length})`);
yes(/--brand-strava:\s*#fc4c02/.test(CSS),
  'el naranja de Strava vive como token de marca documentado (--brand-strava)');
yes(/EXCEPCIÓN DE MARCA/.test(CSS), 'y con su excepción escrita al lado');
yes(/--tint-purple-strong:/.test(CSS), 'el violeta opaco del flash de movilidad también es token');
yes(/--bg-grad-1:/.test(CSS) && /var\(--bg-grad-1\)/.test(CSS),
  'y los tres tonos del suelo OLED, que estaban escritos dos veces');

// En JS: la paleta por músculo, el color por RPE y el trío de Home.
const MUSCLE_BLOCK = APP.slice(APP.indexOf('const MUSCLE_COLORS = {'), APP.indexOf('const MUSCLE_FALLBACK'));
yes(MUSCLE_BLOCK.length > 0, 'MUSCLE_COLORS es localizable');
yes(!/#[0-9a-fA-F]{3,8}/.test(MUSCLE_BLOCK), 'la paleta por músculo NO tiene un solo hex (V-2)');
eq((MUSCLE_BLOCK.match(/var\(--/g) || []).length, 12, 'sus doce entradas son tokens');
yes(/const MUSCLE_FALLBACK = 'var\(--text3\)'/.test(APP), "y el fallback ya no es '#666'");
yes(!/\|\| '#666'/.test(APP), 'ningún sitio conserva el fallback #666');

const TRIO = fnSrc(APP, 'async function renderHomeStatTrio(');
yes(TRIO.length > 0, 'renderHomeStatTrio es localizable');
yes(!/#[0-9a-fA-F]{3,8}/.test(TRIO), 'y no pinta un solo hex (todo por tokens)');
yes(!/#[0-9a-fA-F]{3,8}/.test(fnSrc(APP, 'function rpeColor(')), 'rpeColor tampoco (era #86efac)');

// whoop.js: el color del anillo y los puntos de las fases de sueño.
const WH_CODE = WHOOP.replace(/\/\/.*/g, '');
const hexWhoop = [...WH_CODE.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
if (hexWhoop.length) console.error('  FAIL hex en whoop.js: ' + hexWhoop.join(' '));
checks++;
if (hexWhoop.length) fails++;
yes(hexWhoop.length === 0, `cero hex en whoop.js (encontrados: ${hexWhoop.length})`);
// Un token en un ATRIBUTO de presentación de SVG no resuelve: tiene que ir en `style`.
yes(!/stroke="\$\{color\}"/.test(WHOOP),
  'el anillo de WHOOP no pinta el token en el atributo `stroke` (allí no resuelve)');
yes(/style="stroke:\$\{color\}/.test(WHOOP), 'lo pinta en `style`, donde sí resuelve');

const hexInteg = [...INTEG.replace(/\/\/.*/g, '').matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0]);
eq(hexInteg.length, 0, 'cero hex en integrations.js');
yes(/var\(--brand-strava\)/.test(APP), 'el botón de Strava usa el token de marca');
yes(!/#fc4c02/.test(APP), 'y no el hex suelto');

// ---------------------------------------------------------------------------
// 5 · El CSS muerto no vuelve
// ---------------------------------------------------------------------------
section('5 · V-3 · las familias borradas devuelven 0');

// Cada entrada: [familia, por qué se fue]. La comprobación es sobre SELECTORES, no sobre el
// texto del fichero: los comentarios pueden nombrarlas para explicar por qué no están.
const BORRADAS = [
  ['todays-plan', 'la sustituyó el hero de sesión `.sh-*`'],
  ['ring-bg', 'los anillos de macros de nutrición'],
  ['ring-fill', 'idem'],
  ['ring-label', 'idem'],
  ['ring-value', 'idem'],
  ['ring-unit', 'idem'],
  ['ring-name', 'idem'],
  ['macro-ring', 'idem'],
  ['protein-ring-container', 'idem'],
  ['activity-rings-card', 'los anillos de actividad, retirados con E-12 en v11.66'],
  ['activity-rings-legend', 'idem'],
  ['arl-row', 'idem — su leyenda'],
  ['arl-dot', 'idem'],
  ['arl-val', 'idem'],
  ['ar-ring-bg', 'idem'],
  ['ar-legend', 'idem'],
  ['pin-box', 'el PIN de bloqueo, retirado'],
  ['pin-icon', 'idem'],
  ['pin-prompt', 'idem'],
  ['login-video', 'el vídeo de la pantalla de login (intro.mp4 no se referencia en ningún sitio)'],
  ['login-video-card', 'idem'],
  ['welcome-video-card', 'idem'],
  ['quick-add', 'los botones de añadir rápido de nutrición v1'],
  ['quick-add-grid', 'idem'],
  ['meal-input-row', 'el formulario manual de comidas, sustituido por la foto'],
  ['meal-protein-input', 'idem'],
  ['nutrition-card', 'idem'],
  ['skeleton-chart', 'nunca se usó'],
  ['metric-hero', 'las tarjetas de métrica estilo Apple Health'],
  ['metric-display', 'idem'],
  ['report-card', 'el informe semanal del cron retirado'],
  ['hero-num', 'sustituida por `.stat-card-val`'],
  ['hero-num-sub', 'idem'],
  ['steps-card-wrap', '`renderStepsCard` pinta en `#steps-card.card`'],
  ['rest-config', 'la configuración de descanso por ejercicio, retirada'],
  ['rest-btn-row', 'idem'],
  ['btn-rest', 'idem'],
  ['expand-btn', 'sustituidas por <details>'],
  ['expand-content', 'idem'],
  ['previous-data', 'la sustituyó `.prev-header`'],
  ['setup-steps', 'las instrucciones del Shortcut de pasos'],
  ['btn-danger-sm', 'sin un solo uso'],
  ['coach-signals', 'las señales se pintan con `.rs-*`'],
  ['coach-signals-note', 'idem'],
  ['deload-banner', 'V-3: `renderSyncWarning` tiene su propia familia `.sync-warning-*`'],
  ['deload-icon', 'idem'],
  ['deload-text', 'idem'],
  ['session-hero-rest', 'V-5: el día de descanso lo pinta `showEmptyState`'],
  ['sh-rest-emoji', 'idem'],
  ['queue-row', 'V-4: la cola es una línea, `.queue-next`'],
  ['queue-thumb', 'idem'],
  ['queue-title', 'idem'],
  ['queue-sub', 'idem'],
  ['queue-empty', 'idem — el estado vacío es `showEmptyState`'],
  ['home-queue', 'idem — ya no hay <ul>'],
];
let vivas = 0;
for (const [fam, why] of BORRADAS) {
  const re = new RegExp(`\\.${fam}(?![\\w-])`);
  const hit = RULES.find((r) => re.test(r.sel));
  if (hit) { vivas++; console.error(`  FAIL .${fam} sigue en style.css ("${hit.sel}") — ${why}`); }
}
checks++;
if (vivas) fails++;
yes(vivas === 0, `las ${BORRADAS.length} familias borradas devuelven 0 selectores (vivas: ${vivas})`);

// Y las que las sustituyen existen.
for (const fam of ['sync-warning-banner', 'sync-warning-icon', 'sync-warning-title',
                   'sync-warning-text', 'queue-next', 'queue-next-txt', 'ht-status',
                   'ht-status-ok', 'ht-status-wait', 'ht-status-off', 'skeleton-line',
                   'empty-state-box', 'evl-row', 'evl-num', 'evl-grade']) {
  yes(RULES.some((r) => new RegExp(`\\.${fam}(?![\\w-])`).test(r.sel)), `.${fam} existe en style.css`);
}
// `.skeleton-line` se queda porque V-8 la usa de verdad, en JS y en el HTML estático.
yes(/skeleton skeleton-line/.test(APP), 'showSkeleton(el, n, "line") pinta `.skeleton-line`');
yes(/skeleton skeleton-line/.test(HTML), 'y los placeholders de Ajustes también');
yes(!/>Loading/.test(HTML), 'los "Loading…" estáticos de index.html se fueron (V-8)');
yes(!/deload-banner|deload-icon|deload-text/.test(APP), 'app.js ya no emite clases `.deload-*`');
const SW_SRC = fnSrc(APP, 'async function renderSyncWarning(');
yes(/sync-warning-banner/.test(SW_SRC), 'renderSyncWarning emite su familia propia');

// ---------------------------------------------------------------------------
// 6 · V-5 · el Strain no se inventa, el nombre no está escrito
// ---------------------------------------------------------------------------
section('6 · V-5 · Strain, nombre e estados vacíos');

// Sin comentarios: los comentarios de este incremento CITAN el código retirado para explicar
// por qué se fue, y esa cita es justo lo que hay que conservar.
const TRIO_CODE = TRIO.replace(/\/\/.*/g, '');
yes(!/parseFloat\(s\.rpe\) \|\| 7/.test(TRIO_CODE),
  'el Strain ya NO cuenta 7 cuando falta el RPE (era un contador de series disfrazado)');
yes(!/\|\| 7;/.test(TRIO_CODE), 'ni ningún otro fallback 7');
yes(/Number\.isFinite\(rpe\) && rpe > 0/.test(TRIO), 'sólo suma las series con un RPE real');
yes(/strainSets\+\+/.test(TRIO), 'y cuenta cuántas hay, para saber si el número significa algo');
yes(/'RPE LOAD'/.test(TRIO), "el sub dice 'RPE LOAD' (no es el strain 0-21 de WHOOP)");
yes(/'LOG RPE'/.test(TRIO), "y sin una sola serie con RPE dice 'LOG RPE'");
yes(/strainSets \? String\(Math\.round\(strain\)\) : '—'/.test(TRIO),
  'con "—" como valor: la ausencia de dato no se pinta como un número');
// Los cuatro tiles y su orden no se tocan (es la petición literal del usuario en v11.65).
const CARDS = (TRIO.match(/\{ label: '([A-Za-z]+)'/g) || []).map((m) => m.split("'")[1]);
eq(CARDS.join(' > '), 'Readiness > Strain > Streak > Volume', 'los cuatro tiles y su orden, intactos');

yes(!/'Julian Garmendia'/.test(APP.replace(/\/\/.*/g, '')),
  "el literal 'Julian Garmendia' no está en el código de app.js");
const INI = fnSrc(APP, 'function homeAvatarInitials(');
yes(INI.length > 0, 'homeAvatarInitials() existe');
yes(/settings && state\.settings\.name/.test(INI), 'primero `settings.name`');
yes(/state\._authEmail/.test(INI), 'después las iniciales del email de la sesión');
yes(/return 'JG'/.test(INI), "y 'JG' sólo como último recurso");
yes(/async function primeAuthEmail\(/.test(APP), 'primeAuthEmail() cachea el email en state');
yes(/getSupaUser/.test(fnSrc(APP, 'async function primeAuthEmail(')),
  'leyéndolo de la sesión de Supabase');

// `showEmptyState` en los bloques que escribían su propio HTML.
yes(/showEmptyState\(container, '😴'/.test(APP), 'la cola vacía pasa por showEmptyState');
yes(/showEmptyState\(container, '😌', 'Rest day'/.test(APP), 'y el día de descanso también');
yes(!/queue-empty/.test(APP), 'la cadena ad hoc `.queue-empty` ya no se emite');
yes((APP.match(/showEmptyState\(/g) || []).length >= 8,
  'showEmptyState se usa en ≥ 8 sitios de app.js');

// ---------------------------------------------------------------------------
// 7 · V-8 y V-9 · el punto de estado y una sola guarda
// ---------------------------------------------------------------------------
section('7 · V-8 · punto de estado, esqueletos · V-9 · safeCall');

const TOPBAR = fnSrc(APP, 'function renderHomeTopbar(');
yes(TOPBAR.length > 0, 'renderHomeTopbar es localizable');
yes(!/ht-bell/.test(APP) && !/ht-bell/.test(HTML), 'la campana del topbar no existe (V-4)');
yes(!/Notifications/.test(TOPBAR), 'ni su aria-label, que prometía algo que la app no manda');
yes(/id="ht-status"/.test(TOPBAR), 'el punto de estado está en el topbar');
yes(TOPBAR.indexOf('ht-status') < TOPBAR.indexOf('ht-settings'),
  'y va a la IZQUIERDA del engranaje');
const DOT = fnSrc(APP, 'async function renderTopbarStatusDot(');
yes(DOT.length > 0, 'renderTopbarStatusDot() existe');
yes(/navigator\.onLine === false/.test(DOT), 'lee navigator.onLine');
// La clase se compone (`ht-status-${tone}`), así que lo que se comprueba es el tono y su
// motivo aquí; que las tres reglas de color existan en el CSS ya lo comprueba §5.
yes(/tone = 'off'/.test(DOT) && /Offline/.test(DOT), 'gris + "Offline" sin conexión');
yes(/syncPendingCount/.test(DOT), 'cuenta la cola con syncPendingCount()');
yes(/tone = 'wait'/.test(DOT) && /waiting to upload/.test(DOT), 'ámbar con cola pendiente');
yes(/tone = 'ok'/.test(DOT) && /Up to date/.test(DOT), 'verde al día');
yes(/`ht-status ht-status-\$\{tone\}`/.test(DOT), 'y la clase sale del tono, no de tres ramas');
yes(/setAttribute\('title'/.test(DOT), 'y el motivo va en el `title`');
yes(/addEventListener\('online', \(\) => \{ renderTopbarStatusDot\(\); \}\)/.test(APP),
  'se repinta con el evento `online`');
yes(/addEventListener\('offline', \(\) => \{ renderTopbarStatusDot\(\); \}\)/.test(APP),
  'y con `offline`');
const SYNC = readFileSync('app/supabase-sync.js', 'utf8');
yes(/async function syncPendingCount\(\)/.test(SYNC), 'syncPendingCount() vive en supabase-sync.js');
yes(/window\.syncPendingCount = syncPendingCount/.test(SYNC), 'y está expuesta en window');
yes(/safeCall\('renderTopbarStatusDot'\)/.test(SYNC), 'y syncAll repinta el punto al terminar');

yes(/function showSkeleton\(container, count = 3, kind = 'card'\)/.test(APP),
  "showSkeleton acepta kind ('line' usa .skeleton-line)");
yes(/function showHomeSkeletons\(/.test(APP), 'showHomeSkeletons() existe');
yes(/function showStatsSkeletons\(/.test(APP), 'showStatsSkeletons() existe');
yes(/showHomeSkeletons\(\)/.test(fnSrc(APP, 'async function renderHomeView(')),
  'renderHomeView pinta esqueleto antes de leer IndexedDB');
yes(/showStatsSkeletons\(\)/.test(fnSrc(APP, 'async function renderStats(')),
  'y renderStats también');

yes(/function safeCall\(name, \.\.\.args\)/.test(APP), 'safeCall(name, ...args) existe');
const SC = fnSrc(APP, 'function safeCall(name, ...args)');
yes(/typeof fn !== 'function'/.test(SC), 'sale sola si la función no está');
yes(/console\.warn\(`\[safeCall\] \$\{name\}/.test(SC), 'y anota el throw con el nombre');
const usos = (APP.match(/safeCall\('/g) || []).length;
yes(usos >= 6, `safeCall se usa en ≥ 6 sitios (usos: ${usos})`);
for (const fn of ['renderCoachReadout', 'renderCoachWeekCard', 'renderCoachGoalLine',
                  'renderReadinessSignals', 'renderRecoveryLine', 'renderGoalsCard',
                  'renderIntegrationsCard', 'seedFoods', 'maybeRunWeeklyCoach']) {
  yes(APP.includes(`safeCall('${fn}')`), `${fn} entra por safeCall`);
}
// Los catch de rutas de usuario avisan; los de fondo siguen callados a propósito.
for (const path of ['saving the workout', 'logging the session', 'saving the weigh-in',
                    'creating the draft', 'saving the measurement']) {
  yes(APP.includes(path), `la ruta "${path}" avisa con un toast si falla (V-9)`);
}
yes((APP.match(/Something went wrong/g) || []).length >= 5,
  'cinco rutas de usuario con "Something went wrong: …"');

// ---------------------------------------------------------------------------
// 8 · R-11 · el ledger de evidencia, EJECUTADO
// ---------------------------------------------------------------------------
section('8 · R-11 · ledger de evidencia');

const ENG = require('../app/coach-engine.js');
yes(typeof ENG.buildEvidenceLedger === 'function', 'buildEvidenceLedger está exportada');
yes(/function buildEvidenceLedger\(decisions, rules\)/.test(ENGINE), 'y es pura (decisions, rules)');
yes(!/dbGetAll|indexedDB|fetch\(/.test(fnSrc(ENGINE, 'function buildEvidenceLedger(')),
  'sin tocar IndexedDB, sin red: agrega lo que se le pasa');

// EL FIXTURE. Tres decisiones: STR-001 citada dos veces, REC-005 una, y UNA declinada
// (el `outcome` más cercano a "retirada" en el vocabulario de COACH_OUTCOME_LABEL).
const RULES_FX = {
  'STR-001': { rule: 'In a deficit, maintain load and cut volume first.', evidenceLevel: 'strong' },
  'REC-005': { rule: 'Deload + diet break together.', evidenceLevel: 'weak_extrapolated' },
};
const DEC_FX = [
  { id: 'a', date: '2026-08-31', weekKey: '2026-W36', type: 'plan-apply', ruleIds: ['STR-001'], outcome: 'accepted' },
  { id: 'b', date: '2026-09-07', weekKey: '2026-W37', type: 'plan-reject', ruleIds: ['STR-001', 'REC-005'], outcome: 'declined' },
  { id: 'c', date: '2026-09-02', weekKey: '2026-W36', type: 'session-readout', ruleIds: [], outcome: 'done' },
];
const LED = ENG.buildEvidenceLedger(DEC_FX, RULES_FX);
eq(LED.length, 2, 'el fixture produce DOS filas (la decisión sin ruleIds no crea ninguna)');
eq(LED[0].ruleId, 'STR-001', 'ordenado por citas descendente: STR-001 primero');
eq(LED[0].cited, 2, 'STR-001 citada 2 veces');
eq(LED[0].retired, 1, 'y retirada 1 (la propuesta declinada)');
eq(LED[0].lastWeek, '2026-W37', 'su última semana es la más alta, no la última leída');
eq(LED[0].grade, 'strong', 'con el grado del corpus');
eq(LED[0].known, true, 'y marcada como conocida');
eq(LED[1].ruleId, 'REC-005', 'REC-005 después');
eq(LED[1].cited, 1, 'citada 1 vez');
eq(LED[1].retired, 1, 'retirada 1 (misma decisión declinada)');
eq(LED[1].grade, 'weak_extrapolated', 'con su grado real');

// Un id que el corpus local no conoce se ENSEÑA, no se esconde: puede ser un id alucinado que
// se colase, o una regla retirada del corpus. Las dos cosas son información sobre el bucle.
const LED2 = ENG.buildEvidenceLedger([
  { id: 'x', weekKey: '2026-W37', ruleIds: ['ZZZ-999'], outcome: 'accepted' },
], RULES_FX);
eq(LED2.length, 1, 'un Rule ID desconocido produce su fila');
eq(LED2[0].known, false, 'marcada known:false');
eq(LED2[0].grade, null, 'y sin grado inventado');

// Un id repetido dentro de la MISMA decisión cuenta una vez.
const LED3 = ENG.buildEvidenceLedger([
  { id: 'y', weekKey: '2026-W37', ruleIds: ['STR-001', 'STR-001'], outcome: 'done' },
], RULES_FX);
eq(LED3[0].cited, 1, 'citar la misma regla dos veces en una decisión cuenta UNA vez');

// Sin `weekKey`, la semana sale de la fecha (ISO 8601, el jueves manda el año).
const LED4 = ENG.buildEvidenceLedger([
  { id: 'z', date: '2026-09-07', ruleIds: ['STR-001'], outcome: 'done' },
], RULES_FX);
eq(LED4[0].lastWeek, '2026-W37', 'sin weekKey la semana se deduce de la fecha');
const LED5 = ENG.buildEvidenceLedger([{ id: 'w', ruleIds: ['STR-001'] }], RULES_FX);
eq(LED5[0].lastWeek, null, 'y sin fecha se queda en null, no en una semana inventada');
eq(LED5[0].retired, 0, 'un outcome ausente no cuenta como retirada');

// Entradas basura no revientan la tabla.
eq(ENG.buildEvidenceLedger(null, null).length, 0, 'sin decisiones devuelve []');
eq(ENG.buildEvidenceLedger([null, {}, { ruleIds: 'STR-001' }], RULES_FX).length, 0,
  'filas malformadas se ignoran en silencio');

// La vista: sección, estado vacío y "show all".
yes(/async function _coachRenderLedger\(el\)/.test(COACHJS), '_coachRenderLedger() vive en coach.js');
const LEDV = fnSrc(COACHJS, 'async function _coachRenderLedger(el)');
yes(/buildEvidenceLedger\(all \|\| \[\], corpus\)/.test(LEDV), 'y usa el builder puro');
yes(/COACH_RULES/.test(LEDV), 'con el corpus local (coach-rules.js)');
yes(/Evidence ledger/.test(LEDV), 'la sección se llama "Evidence ledger"');
yes(/No decisions yet — the ledger fills in as the coach cites rules\./.test(LEDV),
  'con su estado vacío exacto');
yes(/COACH_LEDGER_TOP/.test(LEDV) && /const COACH_LEDGER_TOP = 15/.test(COACHJS),
  'top 15 por defecto');
yes(/Show all \$\{filas\.length\}/.test(LEDV), 'y un "Show all N" para el resto');
yes(/coach-ledger/.test(fnSrc(COACHJS, 'async function renderCoachView(')),
  'renderCoachView pinta la sección');
yes(HTML.indexOf('id="coach-ledger"') > HTML.indexOf('id="coach-decisions"'),
  '#coach-ledger va DESPUÉS del log de decisiones (es su agregado)');
yes(HTML.indexOf('id="coach-ledger"') < HTML.indexOf('id="coach-versions"'),
  'y antes de las versiones del plan');
yes(!/[A-Z]{3}-\d{3}/.test(LEDV.replace(/\/\/.*/g, '')),
  'sin Rule IDs escritos a mano en la plantilla (§B.9: salen del dato)');

// ---------------------------------------------------------------------------
console.log('');
if (fails) {
  console.error(`verify-visual-tokens: ${fails} de ${checks} comprobaciones FALLAN`);
  process.exit(1);
}
console.log(`verify-visual-tokens: ${checks} comprobaciones OK`);
