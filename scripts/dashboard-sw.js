/*
  Dashboard Service Worker
  - Evita cachear HTML de navegación para no reintroducir "no se ven los cambios".
  - Cachea sólo assets estáticos (icon/manifest) y usa SWR para otros GET no-API.
  - /api/* siempre network-only.
*/

const CACHE_NAME = 'seu-dashboard-assets-v2026-01-17.7';
const PRECACHE_URLS = ['/assets/dashboard-icon.svg', '/manifest.webmanifest'];

function offlineHtml() {
  const html = `<!doctype html>
<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Dashboard sin conexión</title>
<style>
  body{margin:0;font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#02030a;color:rgba(240,244,255,.94);display:grid;place-items:center;min-height:100vh;padding:24px}
  .card{max-width:720px;border:1px solid rgba(148,163,184,.22);border-radius:16px;padding:18px 20px;background:rgba(8,10,14,.92);box-shadow:0 22px 56px rgba(0,0,0,.58)}
  h1{margin:0 0 8px;font-size:18px}
  p{margin:0;color:rgba(175,186,210,.92);line-height:1.45}
  .hint{margin-top:12px;font-size:13px}
  a{color:#22e8ff}
</style>
</head><body>
  <div class="card">
    <h1>Sin conexión</h1>
    <p>No se pudo contactar al servidor local del dashboard. Verifica que esté corriendo en este equipo.</p>
    <p class="hint">Tip: abre <a href="/">/</a> cuando vuelva la conexión.</p>
  </div>
</body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
        .catch(() => undefined),
      self.clients.claim()
    ])
  );
});

self.addEventListener('message', (event) => {
  const data = event?.data;
  if (data && typeof data === 'object' && data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (!req || req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // No cachear API.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(req));
    return;
  }

  // Navegación: network-only con fallback.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => offlineHtml()));
    return;
  }

  // Assets y otros GET: stale-while-revalidate.
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    })
  );
});
