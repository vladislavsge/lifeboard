// Простой service worker: приложение работает офлайн после первого открытия.
// Файлы сборки имеют хэши в имени, поэтому их можно кэшировать «навсегда»,
// а index.html берём из сети (если есть) — так обновления подтягиваются сами.
const CACHE = 'lifeboard-v3';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  // запросы к серверу аккаунтов мимо кэша — ответы зависят от сессии
  if (url.pathname.endsWith('/graphql') || url.pathname.endsWith('/healthz')) return;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});

/* ---------- Уведомления ---------- */

self.addEventListener('push', (e) => {
  const d = { title: 'Трекер', body: '', url: '/', tag: 'lifeboard' };
  try {
    Object.assign(d, e.data ? e.data.json() : {});
  } catch {
    if (e.data) d.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: d.tag || 'lifeboard',
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const path = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) {
        if (w.url.startsWith(self.registration.scope)) {
          await w.focus();
          // приложение на hash-роутере, поэтому путь передаём сообщением
          w.postMessage({ type: 'navigate', path });
          return;
        }
      }
      await self.clients.openWindow('./#' + path);
    })(),
  );
});
