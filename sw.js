/* AFFIVI — Version 2.0 — Service Worker
   - Fichiers de l'app : réseau d'abord (les mises à jour arrivent),
     copie locale si pas de réseau.
   - Polices Google : gardées en cache après le premier chargement.
   - Données routières (Overpass) : jamais interceptées. */

const VERSION    = 'affivi-v2.0';
const FONT_CACHE = 'affivi-fonts';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './engine.js',
  './app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== VERSION && k !== FONT_CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Polices : cache d'abord
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FONT_CACHE).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
        return res;
      })
    );
    return;
  }

  // Fichiers de l'app : réseau d'abord (3 s max), sinon cache
  if (url.origin === self.location.origin) {
    e.respondWith(networkFirst(req));
  }
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  const network = fetch(req).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, 3000, null));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch { /* hors ligne */ }
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  return network.catch(() => new Response('Hors ligne', { status: 503 }));
}
