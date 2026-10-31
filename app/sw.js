// Service worker: funzionamento offline. Mette in cache all'installazione tutti i file dell'app
// (elenco e versione in precache.js, generato da strumenti/aggiorna_app.mjs) e li serve dalla cache.
// Nessuna richiesta verso altri siti. Il nuovo service worker si attiva solo quando l'app lo chiede.

// Versione dei file: 84387caf30083d77 (scritta da strumenti/aggiorna_app.mjs: cambia sw.js a ogni versione, così Safari la vede sempre)
importScripts('./precache.js');

const CACHE = `perito40-${self.VERSIONE}`;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(self.FILE_APP.map(f => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('perito40-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'attiva') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    if (req.mode === 'navigate') return (await c.match('./index.html')) || fetch(req);
    return (await c.match(req, { ignoreSearch: true })) || fetch(req);
  })());
});
