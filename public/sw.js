// 찬덤 서비스 워커: 앱 설치(홈 화면)용. 항상 새 버전을 먼저 받고, 인터넷이 끊겼을 때만 저장본을 쓴다.
const CACHE = 'gameworld-v5';
const SHELL = ['/', '/css/style.css', '/js/app.js', '/js/platform.js', '/js/settings.js', '/js/cards.js', '/js/sound.js', '/js/seotda.js', '/js/evaluator.js', '/js/handchart.js', '/img/emblem.webp', '/img/gw-icon-192.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // 실시간 게임(소켓)·API·다른 사이트는 건드리지 않는다
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/socket.io') || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (req.mode === 'navigate' || SHELL.includes(url.pathname) || /\.(webp|png|mp3|css|js)$/.test(url.pathname))) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then((r) => r || new Response('인터넷 연결을 확인해 주세요', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }))),
  );
});
