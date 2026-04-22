const CACHE = 'affivi-v1';
const ASSETS = [
  './',
  'index.html',
  'manifest.json',
  'styles.css',
  'js/app.js',
  'js/db.js',
  'js/gps.js',
  'js/wake-lock.js',
  'js/countries.js',
  'js/ui-drive.js',
  'js/ui-profiles.js',
  'js/ui-calibration.js',
  'js/ui-country.js',
  'js/ui-settings.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      const copy = resp.clone();
      if (e.request.method === 'GET' && resp.ok) {
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      }
      return resp;
    }).catch(() => caches.match('index.html')))
  );
});
