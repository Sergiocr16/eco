// Service worker mínimo de Eco. Su razón de ser es que iOS trate a la app
// instalada como una app de verdad; NO da modo offline y no debe simularlo:
// Eco necesita el backend local (por Tailscale) y el refresh del ID token de
// Firebase contra Google. Sin red la app no sirve, y una cáscara cacheada que
// arranca y después falla en todo es peor que no arrancar.
//
// Por eso la única estrategia es cache-first sobre assets con hash de
// contenido — que son inmutables por definición — y passthrough para todo lo
// demás: HTML, API, WebSockets y Firebase nunca se tocan.

const CACHE = 'eco-assets-v1';

// Directorios servidos con `Cache-Control: immutable` por el backend. El
// nombre lleva el hash del contenido, así que una entrada vieja nunca puede
// devolver contenido equivocado: un rebuild cambia el nombre del archivo.
const IMMUTABLE_PREFIXES = ['/assets/', '/icons/', '/brand/'];

self.addEventListener('install', (event) => {
  // Sin precache: los nombres con hash no se conocen desde un archivo estático.
  self.skipWaiting();
  void event;
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.origin !== self.location.origin) return;
  if (!IMMUTABLE_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    // Solo respuestas completas y propias: un 206 o un opaque no se cachean.
    if (res.ok && res.status === 200 && res.type === 'basic') {
      cache.put(req, res.clone()).catch(() => { /* cuota llena, seguimos */ });
    }
    return res;
  })());
});
