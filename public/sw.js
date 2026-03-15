const CACHE_VERSION = 'wow-player-v2-20260315';
const APP_SHELL = `${CACHE_VERSION}-shell`;
const AUDIO_CACHE = `${CACHE_VERSION}-audio`;

const shellAssets = ['.', './index.html', './offline.html', './manifest.webmanifest', './favicon.svg', './icons.svg'];
const demoTracks = ['./audio/neon-drift.wav', './audio/violet-pulse.wav', './audio/sunrise-glide.wav'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_SHELL).then((cache) => cache.addAll(shellAssets)),
      caches.open(AUDIO_CACHE).then((cache) => cache.addAll(demoTracks)),
    ]),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => ![APP_SHELL, AUDIO_CACHE].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const reqUrl = new URL(event.request.url);
  const isAudio = reqUrl.pathname.includes('/audio/');

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_SHELL).then((cache) => cache.put('./index.html', copy));
          return res;
        })
        .catch(async () => (await caches.match('./index.html')) || (await caches.match('./offline.html'))),
    );
    return;
  }

  if (isAudio) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            const copy = res.clone();
            caches.open(AUDIO_CACHE).then((cache) => cache.put(event.request, copy));
            return res;
          })
          .catch(() => caches.match('./offline.html'));
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(APP_SHELL).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match('./offline.html'));
    }),
  );
});
