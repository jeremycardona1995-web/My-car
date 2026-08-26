/* Réseau d'abord, cache en secours : l'application se met à jour dès qu'il y a
   du réseau, et reste utilisable sans. Incrémenter CACHE à chaque changement
   de la liste FICHIERS. */
const CACHE = 'carnet-v3';
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icone-192.png',
  './icone-512.png',
  './icone-512-maskable.png',
];

self.addEventListener('install', evenement => {
  evenement.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FICHIERS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', evenement => {
  evenement.waitUntil(
    caches.keys()
      .then(noms => Promise.all(noms.filter(n => n !== CACHE).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', evenement => {
  const requete = evenement.request;
  if (requete.method !== 'GET' || new URL(requete.url).origin !== self.location.origin) return;

  evenement.respondWith(
    fetch(requete)
      .then(reponse => {
        if (reponse && reponse.ok) {
          const copie = reponse.clone();
          caches.open(CACHE).then(cache => cache.put(requete, copie));
        }
        return reponse;
      })
      .catch(() => caches.match(requete).then(c => c || caches.match('./index.html')))
  );
});
