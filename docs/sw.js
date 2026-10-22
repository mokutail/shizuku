// オフラインでも開けるようにするのと、通知を表示するためのもの
const CACHE = 'shizuku-v5';
const SHELL = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/app.js', './js/cycle.js', './js/pill.js', './js/icons.js', './js/config.js', './js/store-demo.js', './js/store-firebase.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/badge-96.png',
  './js/switch.js', './css/switch.css',
  './memori/', './memori/index.html', './memori/css/style.css',
  './memori/js/app.js', './memori/js/calc.js', './memori/js/items.js', './memori/js/icons.js', './memori/js/photo.js',
  './memori/js/store-demo.js', './memori/js/store-firebase.js',
  './memori/icons/icon-192.png', './memori/icons/badge-96.png',
];
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    // 自分のファイル:新しいものを優先し、つながらないときは保存分
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match(url.pathname.includes('/memori/') ? './memori/index.html' : './index.html'))),
    );
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    // フォントとFirebaseの読みこみ:保存分を先に使う
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok || res.type === 'opaque') caches.open(CACHE).then((c) => c.put(req, res.clone()));
        return res;
      })),
    );
  }
});

self.addEventListener('push', (e) => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch { payload = { body: e.data && e.data.text() }; }
  const d = payload.data || payload.notification || payload;
  const isPill = d.tag === 'pill' && /^\d{4}-\d{2}-\d{2}$/.test(d.date || '');
  const weigh = d.tag === 'weigh';
  const memori = weigh || /\/memori\//.test(d.url || '');
  e.waitUntil(
    self.registration.showNotification(d.title || 'しずく', {
      body: d.body || '',
      icon: memori ? 'memori/icons/icon-192.png' : 'icons/icon-192.png',
      badge: memori ? 'memori/icons/badge-96.png' : 'icons/badge-96.png',
      tag: d.tag || undefined,
      renotify: isPill,
      actions: isPill ? [{ action: 'taken', title: '飲んだ' }] : weigh ? [{ action: 'record', title: '記録する' }] : [],
      data: { url: d.url || './', date: isPill ? d.date : null, weigh },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const target = new URL(data.url || './', self.registration.scope);
  // 「飲んだ」ボタン:アプリを開いて、その日の記録をつける
  if (e.action === 'taken' && data.date) target.searchParams.set('pill', data.date);
  // 体重の通知:アプリを開いて、記録する画面を出す
  if (data.weigh) target.searchParams.set('record', '1');
  const url = target.href;
  const move = target.search !== '' || target.pathname.includes('/memori/');
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        if ((move || !open.url.startsWith(target.origin + target.pathname)) && 'navigate' in open) return open.navigate(url).then((c) => (c || open).focus());
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
