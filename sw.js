/* Réseau d'abord, cache en secours : l'application se met à jour dès qu'il y a
   du réseau, et reste utilisable sans. Incrémenter CACHE à chaque changement
   de la liste FICHIERS. */
const CACHE = 'carnet-v16';
const FICHIERS = [
  './',
  './index.html',
  './styles.css',
  './donnees.js',
  './echeances.js',
  './app.js',
  './manifest.webmanifest',
  './icone-192.png',
  './icone-512.png',
  './icone-512-maskable.png',
];

self.addEventListener('install', evenement => {
  evenement.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FICHIERS.map(f => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
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

  // « cache: no-store » est indispensable : sans lui, le navigateur peut répondre
  // à ce fetch depuis son propre cache HTTP — GitHub Pages le fixe à dix minutes —
  // et le « réseau d'abord » sert alors une version périmée sans jamais le savoir.
  evenement.respondWith(
    fetch(requete.url, { cache: 'no-store', credentials: 'same-origin' })
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
