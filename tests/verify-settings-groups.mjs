// verify-settings-groups.mjs — v11.79 · Ajustes en cinco grupos
//
// El fallo que este test existe para impedir es el que tiene toda vista agrupada: **un control
// que se queda fuera de todos los grupos y deja de verse desde cualquier pestaña**. Es invisible
// en revisión, porque el HTML sigue ahí y el ojo lo lee; sólo desaparece en el navegador, donde
// `[data-group]:not(.active-group)` lo esconde y nadie vuelve a encontrarlo. Ya pasó una versión
// blanda de esto: `#intervals-icu-section` llevaba meses `hidden` con cuatro controles dentro.
//
// Así que se comprueban las dos mitades del MECE que pidió Julian, por separado:
//   · COLECTIVAMENTE EXHAUSTIVO — todo hijo directo del scroll lleva `data-group`, y todo id de
//     Ajustes cae dentro de alguno.
//   · MUTUAMENTE EXCLUYENTE — ningún id aparece en dos grupos.
//
// Y lo que sostiene que los grupos se vean: la barra, el conmutador COMPARTIDO (esta habría sido
// la tercera copia de las mismas diez líneas) y que el enlace directo abra el grupo ANTES de
// hacer scroll, porque `scrollIntoView` sobre un nodo con `display:none` no hace nada.
//
// Uso: node tests/verify-settings-groups.mjs

import { readFileSync } from 'node:fs';

let fails = 0;
let checks = 0;
function yes(cond, msg) {
  checks++;
  if (!cond) { fails++; console.error('  FAIL ' + msg); }
}
function eq(a, b, msg) { yes(a === b, `${msg} (esperaba ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)})`); }
function section(t) { console.log('\n' + t); }

const HTML = readFileSync('app/index.html', 'utf8');
const APP = readFileSync('app/app.js', 'utf8');
const NUT = readFileSync('app/nutrition.js', 'utf8');
const CSS = readFileSync('app/style.css', 'utf8');

const GRUPOS = ['you', 'sources', 'coach', 'data', 'app'];

// ── El trozo de Ajustes, sin comentarios ──────────────────────────────────────────────────
// Los comentarios se quitan ANTES de mirar etiquetas: el de Integraciones menciona un
// `<details>` en prosa y descuadraría cualquier recuento de profundidad.
const vistaIni = HTML.indexOf('<section id="view-settings"');
const vistaFin = HTML.indexOf('</section>', vistaIni);
const VISTA = HTML.slice(vistaIni, vistaFin).replace(/<!--[\s\S]*?-->/g, '');

const ABRE = '<div class="view-scroll -grouped">';
const scrollIni = VISTA.indexOf(ABRE);
const INTERIOR = VISTA.slice(scrollIni + ABRE.length, VISTA.lastIndexOf('</div>'));

/** Los hijos DIRECTOS del contenedor, por profundidad de etiquetas. */
const VACIAS = new Set(['input', 'br', 'img', 'hr', 'meta', 'link', 'source']);
function hijosDirectos(html) {
  const re = /<(\/?)([a-zA-Z0-9-]+)([^>]*)>/g;
  const out = [];
  let prof = 0;
  let actual = null;
  let m;
  while ((m = re.exec(html))) {
    const cierre = m[1] === '/';
    const tag = m[2].toLowerCase();
    const attrs = m[3] || '';
    if (VACIAS.has(tag) || /\/\s*$/.test(attrs)) continue;   // no cambian la profundidad
    if (!cierre) {
      if (prof === 0) actual = { tag, attrs, desde: m.index };
      prof++;
    } else {
      prof--;
      if (prof === 0 && actual) {
        actual.html = html.slice(actual.desde, re.lastIndex);
        out.push(actual);
        actual = null;
      }
    }
  }
  return out;
}

const hijos = hijosDirectos(INTERIOR);

section('1 · la barra de pestañas');
{
  yes(/id="settings-tabs"/.test(HTML), 'existe #settings-tabs');
  const tabs = [...VISTA.matchAll(/data-settings-group="([a-z]+)"/g)].map((m) => m[1]);
  eq(tabs.join(','), GRUPOS.join(','), 'las cinco pestañas están y en el orden previsto');
  yes(/<div class="stats-tabs" id="settings-tabs">/.test(VISTA),
    'reutiliza el chasis `.stats-tabs` de Stats y Nutrición, no una familia nueva');
  const primera = VISTA.slice(VISTA.indexOf('id="settings-tabs"'), VISTA.indexOf('</div>', VISTA.indexOf('id="settings-tabs"')));
  yes(/class="stats-tab active" data-settings-group="you"/.test(primera),
    'y "You" arranca activa, que es donde cae quien abre Ajustes sin destino');
}

section('2 · MECE, mitad colectivamente exhaustiva');
{
  yes(hijos.length > 5, `el interior del scroll se parsea (${hijos.length} hijos directos)`);
  const barra = hijos.filter((h) => /id="settings-tabs"/.test(h.attrs));
  eq(barra.length, 1, 'la barra es un hijo directo, y sólo hay una');

  const sinGrupo = hijos
    .filter((h) => !/id="settings-tabs"/.test(h.attrs))
    .filter((h) => !/data-group="/.test(h.attrs));
  for (const h of sinGrupo) {
    console.error(`  FAIL hijo directo sin data-group: <${h.tag}${h.attrs}>`);
  }
  checks++;
  if (sinGrupo.length) fails++;
  yes(sinGrupo.length === 0, 'todo hijo directo del scroll lleva data-group (si no, no se ve desde ninguna pestaña)');

  const valores = new Set(hijos.filter((h) => /data-group="/.test(h.attrs))
    .map((h) => h.attrs.match(/data-group="([a-z]+)"/)[1]));
  eq([...valores].sort().join(','), [...GRUPOS].sort().join(','),
    'los valores de data-group son exactamente los cinco grupos, ni uno más');
}

section('3 · MECE, mitad mutuamente excluyente');
{
  // A qué grupo pertenece cada id de la vista. Un id en dos grupos significaría marcado
  // duplicado: dos controles con el mismo id, y `getElementById` quedándose con el primero.
  const porId = new Map();
  let dobles = 0;
  for (const h of hijos) {
    const mg = h.attrs.match(/data-group="([a-z]+)"/);
    if (!mg) continue;
    for (const m of h.html.matchAll(/\sid="([^"]+)"/g)) {
      if (porId.has(m[1])) {
        console.error(`  FAIL id duplicado entre grupos: #${m[1]} en ${porId.get(m[1])} y ${mg[1]}`);
        dobles++;
      } else porId.set(m[1], mg[1]);
    }
  }
  checks++;
  if (dobles) fails++;
  yes(dobles === 0, 'ningún id de Ajustes aparece en dos grupos');
  yes(porId.size >= 30, `y hay controles de verdad repartidos (${porId.size} ids con grupo)`);

  // Los que el resto del código da por sentados, cada uno donde dice el plan.
  const ESPERADO = {
    'setting-name': 'you', 'setting-goal-weight': 'you', 'setting-steps-target': 'you',
    'setting-start-date': 'you', 'btn-save-settings': 'you', 'btn-analytics': 'you',
    'auth-section': 'sources', 'sync-section': 'sources', 'integrations-card': 'sources',
    'setting-coach-review-mode': 'coach', 'setting-coach-auto-apply': 'coach',
    'btn-open-coach': 'coach', 'btn-ideal-preview': 'coach',
    'trash-list': 'data', 'btn-export-json': 'data', 'file-restore': 'data',
    'notif-on': 'app', 'audio-on': 'app',
    // Lo de taller, dentro de Advanced, que vive en el grupo `app`.
    'btn-export-facts': 'app', 'strava-section': 'app', 'btn-recover-data': 'app',
    'btn-force-update': 'app', 'steps-secret': 'app',
  };
  for (const [id, grupo] of Object.entries(ESPERADO)) {
    eq(porId.get(id), grupo, `#${id} está en el grupo ${grupo}`);
  }
}

section('4 · los ocho campos de saveSettings, en UN solo panel con su botón');
{
  // El problema que originó parte de esto: `saveSettings()` lee ocho campos que vivían en tres
  // secciones distintas y el único Save estaba en la tercera. Cambiabas el objetivo de pasos y
  // tenías que buscar el botón dos secciones más abajo.
  const i = APP.indexOf('async function saveSettings()');
  const cuerpo = APP.slice(i, APP.indexOf('\n}', i));
  const leidos = [...cuerpo.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
  yes(leidos.length >= 7, `saveSettings lee ${leidos.length} campos por id`);
  const hijoYou = hijos.filter((h) => /data-group="you"/.test(h.attrs));
  const htmlYou = hijoYou.map((h) => h.html).join('');
  for (const id of leidos) {
    yes(htmlYou.includes(`id="${id}"`), `#${id} está en el panel You, junto a su Save`);
  }
  yes(htmlYou.includes('id="btn-save-settings"'), 'y el botón Save está en ese mismo panel');
}

section('5 · el conmutador es COMPARTIDO, no una tercera copia');
{
  yes(/function switchViewGroup\(vista, barra, attr, grupo\)/.test(APP),
    'existe `switchViewGroup`, el conmutador único');
  yes(/function switchSettingsGroup\(group\)/.test(APP), 'y Ajustes tiene su envoltura');
  for (const [fichero, src, envoltura] of [
    ['app.js · Stats', APP, '_showStatsGroup'],
    ['app.js · Settings', APP, 'switchSettingsGroup'],
    ['nutrition.js', NUT, 'switchNutGroup'],
  ]) {
    const i = src.indexOf(`function ${envoltura}(`);
    const cuerpo = src.slice(i, src.indexOf('\n}', i));
    yes(/switchViewGroup\(/.test(cuerpo), `${fichero} delega en switchViewGroup`);
    yes(!/classList\.toggle\('active-group'/.test(cuerpo),
      `${fichero} ya no lleva su propia copia del toggle`);
  }
  // El CSS, por la misma razón: estaba scopeado a cada id de vista, así que una vista nueva con
  // pestañas no heredaba la regla y se veían todos los grupos a la vez.
  yes(/\.view-scroll\.-grouped > \[data-group\]:not\(\.active-group\)/.test(CSS),
    'la regla de ocultado es una sola, por clase y no por id de vista');
  yes(!/#view-stats \.view-scroll > \[data-group\]/.test(CSS)
    && !/#view-nutrition \.view-scroll > \[data-group\]/.test(CSS),
    'y las dos copias scopeadas por vista ya no están');
  eq((HTML.match(/class="view-scroll -grouped"/g) || []).length, 3,
    'las tres vistas con pestañas llevan la clase `-grouped`');
}

section('6 · el enlace directo abre el grupo ANTES de hacer scroll');
{
  const i = APP.indexOf('function openSettingsAt(anchorId)');
  const cuerpo = APP.slice(i, APP.indexOf('\n}\n', i));
  yes(/closest\('\[data-group\]'\)/.test(cuerpo),
    'openSettingsAt busca el grupo que contiene el ancla');
  // Sobre el CODIGO: el comentario de arriba nombra `scrollIntoView` para explicar POR QUE va
  // despues, y compararlo en crudo medía la prosa en vez del orden real de las llamadas.
  const soloCodigo = cuerpo.split(String.fromCharCode(10))
    .filter((l) => !/^\s*\/\//.test(l))
    .join(String.fromCharCode(10));
  yes(soloCodigo.indexOf('switchSettingsGroup') < soloCodigo.indexOf('scrollIntoView'),
    'y lo activa antes del scroll: scrollIntoView sobre un nodo oculto no hace nada');
  yes(/renderSettingsView\(\)/.test(APP), 'entrar en Ajustes asegura un grupo activo');
  // Las dos puertas de entrada repintan por grupo, no sólo la papelera.
  yes(!/showView\('settings'\); renderTrashList\(\);/.test(APP),
    'la rama de switchTab ya no repinta sólo la papelera');
  const j = APP.indexOf('const SETTINGS_GROUP_RENDER');
  const mapa = APP.slice(j, APP.indexOf('};', j));
  for (const fn of ['renderSyncCard', 'renderIntegrationsCard', 'renderTrashList']) {
    yes(mapa.includes(fn), `${fn} se repinta al abrir su grupo (antes se quedaba como el arranque)`);
  }
}

if (fails) {
  console.error(`\nverify-settings-groups: ${fails} de ${checks} comprobaciones FALLAN`);
  process.exit(1);
}
console.log(`\nverify-settings-groups: ${checks} comprobaciones OK`);
