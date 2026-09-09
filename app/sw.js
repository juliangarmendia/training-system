// ============================================================
// Service Worker — Training App v4.1
// ============================================================
//
// V-6 (auditoría 2026-09-08). Lo que estaba mal y lo que hace ahora:
//
//   • Faltaban en el shell la hoja de Google Fonts (las tres familias de la identidad),
//     `favicon.svg`, `privacy.html` y `strava-callback.html`: sin red la app abría con las
//     fuentes del sistema y el callback de Strava daba 404.
//   • Precacheaba `app-icon.png` (1,9 MB) y `intro.mp4` (348 KB) — 2,2 MB que hay que bajar
//     ANTES de que el service worker active, en la primera visita y en cada versión nueva.
//     Ahora se sirven por el manejador de runtime: red primero, caché si no hay red.
//   • `cache.addAll` es atómico: un solo 404 (o un timeout en 4G) abortaba TODO el install y
//     la app se quedaba sin caché. Ahora van dos tandas: CRITICAL (si falla, el install
//     falla — sin esto no hay app offline) y OPTIONAL (`allSettled`: lo que entre, entra).
//   • `fetch` era network-first para todo, así que con red lenta cada asset del shell
//     esperaba el timeout de la red antes de mirar la caché. Ahora:
//
//     ┌───────────────────────────────┬──────────────────────────────────────────────────┐
//     │ Petición                      │ Estrategia                                       │
//     ├───────────────────────────────┼──────────────────────────────────────────────────┤
//     │ navegación (index.html)       │ network-first, caché de reserva                   │
//     │ asset del shell               │ cache-first + revalidación en segundo plano       │
//     │ fonts.gstatic.com (woff2)     │ cache-first (los ficheros de fuente son inmutables)│
//     │ resto (imágenes, mp4, otros)  │ network-first, caché de reserva                   │
//     └───────────────────────────────┴──────────────────────────────────────────────────┘
//
// `CACHE_NAME` NO cambia en este incremento: el bump de versión lo hace Julian al integrar.

const CACHE_NAME = 'training-v11.70';

// La hoja de estilos de Google Fonts que pide `index.html`. Tiene que ser la MISMA URL,
// carácter por carácter, o el `cache.match` no acierta.
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';

// El shell, en un solo sitio y con la distinción que importa:
//   `critical` -> sin esto la app no arranca offline; si una falla, el install falla.
//   `optional` -> se agradecen, no se exigen; si una no baja, la app funciona igual.
const APP_SHELL = {
  critical: [
    './',
    './index.html',
    './style.css',
    './app.js',
    './supabase-sync.js',
    './integrations.js',
    './whoop.js',
    './strava.js',
    './bloodwork.js',
    './nutrition.js',
    './coach-engine.js',
    './coach-facts.js',
    './coach-rules.js',
    './coach.js',
  ],
  optional: [
    './manifest.json',
    './favicon.svg',
    './privacy.html',
    './strava-callback.html',
    GOOGLE_FONTS_CSS,
    './img/hero-pull.jpg',
    './img/session-legs.jpg',
    './img/session-push.jpg',
    './img/session-rest.jpg',
  ],
};

// Lo que el manejador de fetch trata como "shell" (cache-first + revalidación).
const SHELL_URLS = APP_SHELL.critical.concat(APP_SHELL.optional);

// Rutas de runtime: se cachean cuando se piden, nunca en el install.
//   `app-icon.png` (1,9 MB) e `intro.mp4` entran aquí por peso.
const RUNTIME_CACHE_FIRST = [
  'fonts.gstatic.com',   // los woff2 llevan hash en la URL: inmutables
];

function isShellRequest(url) {
  if (url.href === GOOGLE_FONTS_CSS) return true;
  if (url.origin !== self.location.origin) return false;
  const scope = new URL('./', self.location.href).pathname;
  const rel = url.pathname.startsWith(scope) ? './' + url.pathname.slice(scope.length) : null;
  if (!rel) return false;
  return SHELL_URLS.includes(rel) || (rel === './' && url.pathname === scope);
}

function isCacheFirstRuntime(url) {
  return RUNTIME_CACHE_FIRST.some(host => url.hostname === host);
}

// Install: dos tandas. La crítica aborta el install si falla; la opcional nunca.
self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL.critical);
    const results = await Promise.allSettled(
      APP_SHELL.optional.map(u => cache.add(new Request(u, { mode: u.startsWith('http') ? 'cors' : 'same-origin' })))
    );
    const failed = results.filter(r => r.status === 'rejected').length;
    if (failed) console.warn('[sw] optional shell: %d/%d no cacheados', failed, APP_SHELL.optional.length);
    await self.skipWaiting();
  })());
});

// Activate: clean old caches, claim all clients
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const clone = res.clone();
      caches.open(CACHE_NAME).then(c => c.put(request, clone)).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw err;
  }
}

// Cache-first con revalidación en segundo plano: se responde con lo que hay (instantáneo,
// también en 4G mala) y la copia nueva se guarda para la siguiente carga.
async function cacheFirstRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(request);
  if (hit) {
    fetch(request).then(res => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    }).catch(() => {});
    return hit;
  }
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Skip non-GET and chrome-extension requests
  if (e.request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // Navegación (index.html): red primero. Es el único sitio donde importa ver la versión
  // nueva en cuanto existe — de ahí sale el `<script>` con el resto.
  // `destination` como respaldo: en algún WebKit viejo `mode` llega vacío, y sin esto el
  // documento caería en la rama cache-first y abriría una versión por detrás.
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(networkFirst(e.request));
    return;
  }

  if (isShellRequest(url) || isCacheFirstRuntime(url)) {
    e.respondWith(cacheFirstRevalidate(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request));
});

// Push notification
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : { title: 'Training', body: 'Time to train!' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏋️</text></svg>',
      badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🏋️</text></svg>',
      vibrate: [200, 100, 200],
      tag: 'training-reminder',
      renotify: true,
    })
  );
});

// Notification click: open/focus app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.includes('index.html') || client.url.endsWith('/')) {
          return client.focus();
        }
      }
      return clients.openWindow('./');
    })
  );
});
