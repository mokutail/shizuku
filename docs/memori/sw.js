// 以前の「めもり」専用のしくみを外すためだけのもの(今は しずく と共通の ../sw.js を使う)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(self.registration.unregister().then(() => self.clients.matchAll()).then((list) => list.forEach((c) => c.navigate(c.url))));
});
