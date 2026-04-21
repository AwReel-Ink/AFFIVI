/**
 * service-worker.js — AffiVi PWA
 * Met en cache tous les assets au premier chargement.
 * Stratégie : Cache First avec fallback réseau.
 */

const CACHE_NAME = 'affivi-v1';

// Liste exhaustive des assets à précacher
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/js/app.js',
  '/js/gps.js',
  '/js/wake-lock.js',
  '/js/ui-drive.js',
  // Étapes suivantes (pré-listés pour éviter de changer la version du SW)
  '/js/db.js',
  '/js/ui-profiles.js',
  '/js/ui-calibration.js',
  '/js/ui-country.js',
  '/js/ui-settings.js',
  '/js/countries.js',
];

// ─── Installation : mise en cache initiale ───────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // On tente de cacher chaque asset individuellement
      // pour qu'un asset manquant ne bloque pas tout le cache
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((url) =>
          cache.add(url).catch((err) => {
            console.warn(`[SW] Impossible de cacher : ${url}`, err);
          })
        )
      );
    }).then(() => {
      console.log('[SW] Installation terminée.');
      // Forcer l'activation immédiate sans attendre la fermeture des onglets
      return self.skipWaiting();
    })
  );
});

// ─── Activation : nettoyage des anciens caches ───────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log(`[SW] Suppression ancien cache : ${name}`);
            return caches.delete(name);
          })
      );
    }).then(() => {
      console.log('[SW] Activation terminée.');
      // Prendre le contrôle immédiat de tous les onglets ouverts
      return self.clients.claim();
    })
  );
});

// ─── Interception des requêtes : Cache First ─────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Ignorer les requêtes non-GET et les requêtes vers des domaines externes
  // (sauf SortableJS CDN qu'on tente de cacher aussi)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Ressource trouvée en cache → retour immédiat
        return cachedResponse;
      }

      // Pas en cache → tentative réseau + mise en cache dynamique
      return fetch(event.request)
        .then((networkResponse) => {
          // Ne cacher que les réponses valides
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type !== 'opaque'
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Réseau indisponible et pas en cache
          // Pour les navigations HTML, retourner index.html depuis le cache
          if (event.request.destination === 'document') {
            return caches.match('/index.html');
          }
          // Sinon, laisser l'erreur se propager
        });
    })
  );
});
