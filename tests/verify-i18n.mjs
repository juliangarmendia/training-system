// EL FALLO QUE ESTE TEST EXISTE PARA IMPEDIR: una cadena en castellano vuelve a colarse en una
// UI que es entera en inglés (decisión de Julian, 2026-09-08). La app estuvo a mitad y mitad
// durante meses —Home con tiles en inglés sobre la tarjeta del coach en español, 36 de 100 toasts
// en castellano, Nutrición entera en español— y esa costura no se arregla una vez: se arregla y se
// vigila, porque el siguiente incremento escribe `toast('Guardado')` sin pensarlo.
//
// QUÉ SE VIGILA Y QUÉ NO:
//   · SÍ: los literales de cadena de `app/*.js` (fuera de comentarios) y el texto y los atributos
//     visibles (`placeholder` / `aria-label` / `title`) de `app/index.html`.
//   · NO: los comentarios del código ni los mensajes de `console.*`. Los comentarios son
//     castellano por decisión explícita (no son UI) y los diagnósticos de consola son código:
//     nadie los lee en la pantalla del teléfono.
//   · NO: los ids, las claves de store, los valores de `data-*`, los nombres de clase CSS ni los
//     ids de ejercicio/sesión. Cambiarlos rompería datos ya guardados; están en la lista blanca.
//
// El diccionario es de palabras función y de vocabulario de entrenamiento que NO existe en inglés.
// Ambigüedades reales (`serie`, `total`, `no`, `error`) se quedan fuera a propósito: un test que
// grita en falso se acaba desactivando.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const BS = String.fromCharCode(92);

let failed = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => { failed++; console.log(`  FAIL ${m}`); };
const yes = (c, m) => c ? ok(m) : bad(m);

// ==================== EL DICCIONARIO ====================
const SPANISH = [
  // artículos, preposiciones y conjunciones
  'el', 'la', 'los', 'las', 'una', 'unos', 'unas', 'del', 'al',
  'con', 'sin', 'para', 'por', 'pero',
  // tiempo
  'semana', 'semanas', 'hoy', 'ayer', 'mañana', 'aún', 'todavía', 'nunca',
  // v11.70 (V-1): "Backup completo (JSON)" sobrevivió a V-1 porque ninguna de estas estaba.
  'completo', 'completa', 'cerrar', 'resumen', 'abrir',
  'última', 'último', 'próxima', 'siguiente',
  // entrenamiento
  'entreno', 'entrenos', 'sesión', 'sesiones', 'peso', 'carrera', 'carreras',
  'descanso', 'descarga', 'objetivo', 'series', 'repeticiones',
  // acciones
  'hecho', 'añadir', 'guardar', 'borrar', 'cargando', 'conectado', 'conectar',
  'ninguna', 'ningún',
];
const RE_ES = new RegExp(
  '(?<![\\p{L}\\p{N}_-])(' + SPANISH.join('|') + ')(?![\\p{L}\\p{N}_-])', 'iu');

// ==================== LA LISTA BLANCA ====================
// Cada entrada lleva su por qué. Sin excepción: una lista blanca sin motivos deja de ser una
// lista blanca y pasa a ser un cajón donde esconder deuda.
const ALLOW = [
  // — Claves de datos y de CSS que NO se pueden traducir sin romper filas ya guardadas —
  // `nutrition.js`: los tipos de comida son la clave del registro (`meal.type`), y las
  // sub-vistas viajan en `data-nut-group` / `data-group`. La ETIQUETA sí está en inglés
  // (`NUT_MEAL_LABELS`), la clave no.
  'desayuno', 'comida', 'comidas', 'cena', 'snack',
  // `nutrition.js`: los ids de las tres sub-vistas. Viajan en `data-nut-group` / `data-group`
  // (index.html) y en `_nutGroup`; las etiquetas que se ven son Today / Trends / Foods.
  'hoy', 'tendencias', 'alimentos',
  // `nutrition.js` (`adherenceMode`): quién pilota las kcal. Es un valor que se COMPARA
  // (`adh.pilot === 'tracker'`) y que afirman los tests, no un texto de pantalla.
  'peso', 'tracker',
  // `bloodwork.js`: `family` de cada marcador y `stale.level`, que además son nombres de clase
  // CSS (`.an-stale.fresco`, `.caducado`, `.historico` en style.css).
  'lipidos', 'metabolico', 'micronutrientes', 'inflamacion', 'organos',
  'fresco', 'caducado', 'historico',
  // `nutrition.js`: estados y veredictos internos que se comparan en código y en los tests.
  'calibrado', 'sobreestima', 'subestima', 'pocos-datos', 'bajo', 'critico', 'sin-datos',
  'biblioteca', 'nuevo', 'etiqueta', 'plato', 'componentes', 'foto', 'nota', 'manual',
  // `app.js`: subtipos de sesión y clases de color del semáforo de nutrición.
  'nut-verde', 'nut-ambar', 'nut-rojo', 'nut-neutral', 'nut-tbar-hueco',
  'nut-tag-nuevo', 'nut-tag-dudoso', 'nut-item-chip-dudoso', 'nut-kind-ok', 'nut-kind-warn',
  // — La semilla de alimentos (`FOODS_SEED`, nutrition.js) —
  // Se queda en castellano A PROPÓSITO: la biblioteca se siembra UNA vez y es idempotente por
  // `id`, así que renombrar `name` no toca las filas que ya están en el teléfono y partiría el
  // corpus en dos (español en su dispositivo, inglés en una instalación nueva). Además los
  // `aliases` son el vocabulario con el que el parseo de fotos y notas resuelve lo que el
  // usuario escribe en español. Traducirlo es una migración de datos, no una traducción.
  '__FOODS_SEED__',
  // — Falsos positivos verificados a mano —
  // 'Al terminar' no existe: se tradujo. Pero 'SkiErg', 'Withings' y 'COROS' llevan mayúsculas
  // y no chocan con el diccionario. Lo que sí choca:
  'unas',              // 'unas' aparece sólo en el pattern CSS `pull-aparts` → sin límite de palabra, no dispara
];
const ALLOW_SET = new Set(ALLOW.map(s => s.toLowerCase()));

// Un literal está permitido si es exactamente una entrada de la lista blanca, o si es un
// selector/identificador puro (sin espacios ni acentos): ids, claves, clases CSS, rutas.
function allowed(text) {
  const t = String(text).trim();
  if (!t) return true;
  if (ALLOW_SET.has(t.toLowerCase())) return true;
  // Identificadores y selectores: sin espacios, ASCII de código, y con al menos un carácter que
  // una palabra suelta NO tiene (`-`, `_`, `.`, `#`, `[`, `/`, …). El requisito es deliberado:
  // sin él, `toast('Guardar')` pasaría por "identificador" y el test no valdría para nada.
  if (/^[A-Za-z0-9_.:#[\]()>*=/-]+$/.test(t) && /[_.:#[\]()>*=/-]/.test(t)) return true;
  // Un selector CSS con espacios sigue siendo código (`#view-nutrition .view-scroll > [data-group]`).
  if (/^[#.[]/.test(t) && !/[áéíóúñ¿¡]/i.test(t)) return true;
  return false;
}

// ==================== TOKENIZADOR DE JS ====================
// Extrae los literales de cadena (', ", `) que NO están dentro de un comentario, y anota el
// trozo de código que los precede para poder distinguir un argumento de `console.*`.
//
// LOS LITERALES DE EXPRESIÓN REGULAR IMPORTAN, Y LA INTERPOLACIÓN TAMBIÉN. Sin reconocer las
// regex, una sola línea desincroniza el fichero entero: en `app.js:4773` hay
// `.replace(/'/g, '&#39;')` DENTRO de un `${…}`, así que una comilla queda abierta y desde ahí
// el código se lee como cadena y las cadenas como código (43 falsos positivos, todos comentarios).
// De ahí que el tokenizador sea UNA sola máquina con pila: el interior de un `${…}` es código
// normal —con sus comentarios, sus regex y sus cadenas— y no un caso aparte.
//
// Una regex se distingue de una división por POSICIÓN: tras un operador o una apertura, `/`
// empieza una regex; tras un identificador o un cierre, es una división.
const REGEX_OK_AFTER = /(?:^|[({[,;:!&|?+\-*%~^=<>]|=>|\breturn|\btypeof|\bcase|\bin|\bof|\bdo|\belse)\s*$/;

export function extractStrings(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  // 240 caracteres de contexto: una llamada a `console.log` con plantilla y dos niveles de
  // interpolación (app.js:1627) mide más de 100, y con una ventana corta su literal interno
  // parecería UI.
  const push = (l, text, from) => out.push({ line: l, text, ctx: src.slice(Math.max(0, from - 240), from) });
  let prev = '';   // código significativo ya visto (para decidir si un `/` abre una regex)
  const seen = (s) => { prev = (prev + s).slice(-40); };
  // Pila de plantillas abiertas. Cada entrada: el texto acumulado, su línea de inicio, su
  // posición, y la profundidad de llaves del `${…}` en el que estamos dentro de ella.
  const stack = [];
  const top = () => stack.length ? stack[stack.length - 1] : null;

  while (i < n) {
    const c = src[i];
    const t = top();
    const inTemplateText = t && t.braces === 0;

    // ---- Dentro del TEXTO de una plantilla: sólo se busca su cierre o un `${` ----
    if (inTemplateText) {
      if (c === BS) { t.buf += ' '; if (src[i + 1] === '\n') line++; i += 2; continue; }
      if (c === '\n') { line++; t.buf += '\n'; i++; continue; }
      if (c === '`') { i++; push(t.line, t.buf, t.from); stack.pop(); seen('"s"'); continue; }
      if (c === '$' && src[i + 1] === '{') { t.braces = 1; t.buf += ' '; i += 2; seen('('); continue; }
      t.buf += c; i++; continue;
    }

    // ---- Código (nivel superior o dentro de un `${…}`) ----
    if (c === '\n') { line++; i++; seen('\n'); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      i += 2; continue;
    }
    // Literal de expresión regular: se consume completo (con sus clases [...] y sus escapes).
    if (c === '/' && REGEX_OK_AFTER.test(prev)) {
      i++;
      let inClass = false;
      while (i < n) {
        const d = src[i];
        if (d === BS) { i += 2; continue; }
        if (d === '\n') break;                       // regex sin cerrar: no era una regex
        if (d === '[') inClass = true;
        else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) { i++; break; }
        i++;
      }
      while (i < n && /[a-z]/.test(src[i])) i++;     // banderas (g, i, u, s, y, m)
      seen('/re/');
      continue;
    }
    // Cadena simple (no plantilla): termina en su comilla o en el salto de línea.
    if (c === "'" || c === '"') {
      const q = c; const startLine = line; const startIdx = i; let buf = ''; i++;
      while (i < n) {
        const d = src[i];
        if (d === BS) { buf += ' '; i += 2; continue; }
        if (d === q) { i++; break; }
        if (d === '\n') { line++; break; }
        buf += d; i++;
      }
      push(startLine, buf, startIdx);
      seen('"s"');
      continue;
    }
    // Apertura de plantilla: se apila y se pasa a modo texto.
    if (c === '`') { stack.push({ buf: '', line, from: i, braces: 0 }); i++; continue; }
    // Llaves: sólo cuentan para saber cuándo se cierra el `${…}` en curso.
    if (t && c === '{') { t.braces++; seen('{'); i++; continue; }
    if (t && c === '}') {
      t.braces--;
      if (t.braces === 0) { seen(')'); i++; continue; }   // vuelve al texto de la plantilla
      seen('}'); i++; continue;
    }
    seen(/\s/.test(c) ? ' ' : c);
    i++;
  }
  // Plantillas sin cerrar (no debería pasar): se emiten igual para no perder su texto.
  for (const s of stack) push(s.line, s.buf, s.from);
  return out;
}

// Un literal que es argumento de `console.log/warn/error/info/debug` no es UI.
// Un literal que es argumento de `console.log/warn/error/info/debug` no es UI: es un
// diagnóstico, y los diagnósticos son código (como los comentarios). Se decide con el contexto:
// hay un `console.X(` abierto y desde entonces no ha terminado la sentencia.
function isConsoleArg(ctx) {
  const tail = String(ctx || '');
  // Desde el último `;` (o el principio): si ahí dentro se abre un console.X(, es su argumento.
  const from = Math.max(tail.lastIndexOf(';'), tail.lastIndexOf('\n\n'));
  const stmt = tail.slice(from + 1);
  return /console\.\w+\s*\(/.test(stmt);
}

// ==================== HTML: texto y atributos visibles ====================
function htmlStrings(src) {
  const out = [];
  const noComments = src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '));
  const lineOf = (idx) => noComments.slice(0, idx).split('\n').length;
  // 1. atributos visibles
  const attrRe = /(placeholder|aria-label|title)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = attrRe.exec(noComments)) !== null) out.push({ line: lineOf(m.index), text: m[2], what: m[1] });
  // 2. nodos de texto (fuera de <script> y <style>)
  const stripped = noComments
    .replace(/<script[\s\S]*?<\/script>/gi, (s) => s.replace(/[^\n]/g, ' '))
    .replace(/<style[\s\S]*?<\/style>/gi, (s) => s.replace(/[^\n]/g, ' '));
  const textRe = />([^<>]+)</g;
  while ((m = textRe.exec(stripped)) !== null) {
    const t = m[1].replace(/&[a-z]+;/g, ' ').trim();
    if (t) out.push({ line: lineOf(m.index), text: t, what: 'text' });
  }
  return out;
}

// Sólo corre las comprobaciones cuando es el punto de entrada: así otro script puede
// importar `extractStrings` sin disparar el test entero.
const IS_MAIN = /verify-i18n.mjs$/.test(String(process.argv[1] || ""));
if (IS_MAIN) {
  // ==================== 1. CONTROL: el test detecta de verdad ====================
  console.log('1. Control: una cadena en castellano SÍ se detecta');
  {
    const fixture = `function f() { toast('Cargando…'); }`;
    const hits = extractStrings(fixture).filter(s => RE_ES.test(s.text) && !allowed(s.text));
    yes(hits.length === 1 && /Cargando/.test(hits[0].text),
      'el fixture con "Cargando…" dispara el detector (si esto falla, el test no vale nada)');
    const cmt = extractStrings(`// Cargando la semana del usuario\nconst a = 1;`);
    yes(cmt.every(s => !RE_ES.test(s.text)), 'y el MISMO texto dentro de un comentario no dispara');
    const cons = extractStrings(`console.warn('[wellness] lectura local:', e);`);
    yes(cons.length === 1 && isConsoleArg(cons[0].ctx), 'un argumento de console.* se reconoce como diagnóstico');
    const noCons = extractStrings(`toast('lectura local');`);
    yes(!isConsoleArg(noCons[0].ctx), 'y un toast NO se confunde con un console.*');
    // Una palabra suelta NO es un identificador: `toast('Guardar')` tiene que caer.
    const oneWord = extractStrings(`toast('Guardar');`);
    yes(RE_ES.test(oneWord[0].text) && !allowed(oneWord[0].text),
      'una palabra suelta en castellano no se cuela como "identificador"');
    // …pero un id, una clase o un selector sí están permitidos.
    for (const id of ['nut-tbar-hueco', 'data-del-meal', '#view-nutrition .view-scroll']) {
      yes(allowed(id), `"${id}" se reconoce como código, no como UI`);
    }
    // Un literal dentro de una interpolación es UI y se revisa igual.
    const interp = extractStrings('const h = `<b>${x}</b> ${y ? "sin datos" : ""}`;');
    yes(interp.some(s => /sin datos/.test(s.text)),
      'un literal dentro de un ${…} también se extrae (ahí vive media UI)');
    // Y una regex con comillas dentro de una interpolación no desincroniza nada.
    const regexInside = extractStrings("const a = `x ${JSON.stringify(p).replace(/'/g, '&#39;')}`;\ntoast('Cargando');");
    yes(regexInside.some(s => s.text === 'Cargando'),
      "una regex /'/ dentro de un ${…} no rompe el tokenizador (el fallo de app.js:4773)");
  }

  // ==================== 2. app/*.js ====================
  console.log('\n2. app/*.js: ni un literal de UI en castellano');
  const jsFiles = fs.readdirSync(path.join(ROOT, 'app'))
    .filter(f => f.endsWith('.js'))
    .sort();
  const offenders = [];
  // Rango de líneas de un bloque `const NOMBRE = [ … ];`, para poder exceptuar la semilla de
  // alimentos entera en vez de listar sus 55 nombres a mano.
  function blockLines(src, marker, closer) {
    const at = src.indexOf(marker);
    if (at < 0) return null;
    const end = src.indexOf(closer, at);
    if (end < 0) return null;
    return [src.slice(0, at).split('\n').length, src.slice(0, end).split('\n').length];
  }

  for (const f of jsFiles) {
    const rel = `app/${f}`;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Ver la entrada `__FOODS_SEED__` de la lista blanca: la semilla es dato de usuario ya
    // sembrado, no cadenas de UI.
    const seedRange = f === 'nutrition.js' ? blockLines(src, 'const FOODS_SEED = [', '\n];') : null;
    const hits = [];
    for (const s of extractStrings(src)) {
      if (!/[A-Za-zÀ-ÿ]/.test(s.text)) continue;
      if (allowed(s.text)) continue;
      if (isConsoleArg(s.ctx)) continue;
      if (seedRange && s.line >= seedRange[0] && s.line <= seedRange[1]) continue;
      const m = s.text.match(RE_ES);
      if (m) hits.push({ line: s.line, word: m[1], text: s.text.trim().slice(0, 120) });
    }
    if (hits.length) {
      offenders.push({ rel, hits });
      bad(`${rel}: ${hits.length} literal(es) en castellano`);
      for (const h of hits.slice(0, 12)) console.log(`         ${rel}:${h.line}  [${h.word}]  ${JSON.stringify(h.text)}`);
      if (hits.length > 12) console.log(`         … y ${hits.length - 12} más`);
    } else {
      ok(`${rel} — limpio`);
    }
  }

  // ==================== 3. app/index.html ====================
  console.log('\n3. app/index.html: texto visible y placeholder/aria-label/title');
  {
    const src = fs.readFileSync(path.join(ROOT, 'app/index.html'), 'utf8');
    const hits = [];
    for (const s of htmlStrings(src)) {
      if (!/[A-Za-zÀ-ÿ]/.test(s.text)) continue;
      if (allowed(s.text)) continue;
      const m = s.text.match(RE_ES);
      if (m) hits.push({ line: s.line, word: m[1], what: s.what, text: s.text.slice(0, 120) });
    }
    if (hits.length) {
      bad(`index.html: ${hits.length} cadena(s) visibles en castellano`);
      for (const h of hits.slice(0, 12)) console.log(`         index.html:${h.line}  (${h.what}) [${h.word}]  ${JSON.stringify(h.text)}`);
    } else {
      ok('index.html — limpio');
    }
  }

  // ==================== 4. Formato de números en inglés ====================
  // La coma decimal y el punto de millar eran la otra mitad de la costura: "92,5 kg" bajo una
  // etiqueta en inglés. Un solo formateador por fichero y en `en-US`.
  console.log('\n4. Formato numérico: punto decimal y millar en inglés');
  for (const f of jsFiles) {
    const rel = `app/${f}`;
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const noComments = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    yes(!/toLocaleString\(\s*['"]es-/.test(noComments), `${rel} sin toLocaleString('es-…')`);
    yes(!/replace\(\s*['"]\.\s*['"]\s*,\s*['"],['"]\s*\)/.test(noComments),
      `${rel} sin replace('.', ',') (coma decimal a mano)`);
  }

  console.log(failed === 0
    ? '\nPASS — la UI está entera en inglés\n'
    : `\nFAIL — ${failed} problema(s)\n`);
  process.exit(failed === 0 ? 0 : 1);

}
