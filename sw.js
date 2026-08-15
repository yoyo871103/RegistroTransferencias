/* Service worker: guarda la app para que funcione sin internet.
   Al publicar una versión nueva hay que subir VERSION; si no, la tablet
   seguirá usando la copia vieja que tiene guardada. */
const VERSION = 'v1';
const CACHE = 'transferencias-' + VERSION;
const ARCHIVOS = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-mask.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Primero la copia guardada: la app abre al instante y sin conexión.
// En segundo plano se busca una versión nueva para la próxima vez.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(guardada => {
      const red = fetch(e.request).then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copia = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return resp;
      }).catch(() => guardada);
      return guardada || red;
    })
  );
});
