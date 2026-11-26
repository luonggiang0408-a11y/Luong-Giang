/* Service worker: cho phép mở app khi mất mạng.
   Chiến lược "mạng trước": luôn hỏi máy chủ bản mới nhất (bỏ qua bộ nhớ đệm HTTP 10 phút của GitHub Pages),
   chỉ khi không có mạng mới dùng bản đã lưu. Nhờ vậy cập nhật luôn đến ngay, không bị kẹt bản cũ. */
const VER = 'vocab-v20261126b';
const CORE = ['./', 'index.html', 'style.css', 'srs.js', 'ui.js', 'store.js', 'ai.js', 'sync.js', 'firebase-config.js', 'cloud.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VER).then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VER).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.includes('/audio/')) return;           // mp3 đi thẳng ra mạng (Safari cần Range request)           // Firebase, Google, API… luôn đi thẳng ra mạng
  e.respondWith(
    fetch(req, { cache: 'no-cache' })
      .then((res) => { if (res && res.ok) { const copy = res.clone(); caches.open(VER).then((c) => c.put(req, copy)); } return res; })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('index.html')))
  );
});
