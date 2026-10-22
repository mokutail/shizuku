// めもり:オフラインで開けるようにするのと、通知を表示するためのもの
const CACHE = 'memori-v1';
const SHELL = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/app.js', './js/calc.js', './js/items.js', './js/icons.js', './js/photo.js', './js/store-demo.js', './js/store-firebase.js',
  '../js/config.js', '../js/cycle.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png',
];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('memori-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    })));
  }
});
self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch { payload = { body: e.data && e.data.text() }; }
  const d = payload.data || payload.notification || payload;
  const weigh = d.tag === 'weigh';
  e.waitUntil(self.registration.showNotification(d.title || 'めもり', {
    body: d.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    tag: d.tag || undefined,
    actions: weigh ? [{ action: 'record', title: '記録する' }] : [],
    data: { url: d.url || './', weigh },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const target = new URL(data.url || './', self.registration.scope);
  if (data.weigh) target.searchParams.set('record', '1');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const open = list.find((c) => c.url.startsWith(self.registration.scope));
    if (open && 'navigate' in open) return open.navigate(target.href).then((c) => (c || open).focus());
    if (open) return open.focus();
    return self.clients.openWindow(target.href);
  }));
});
