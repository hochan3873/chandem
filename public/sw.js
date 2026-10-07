// 찬덤 서비스 워커: 앱 설치(홈 화면)용. 항상 새 버전을 먼저 받고, 인터넷이 끊겼을 때만 저장본을 쓴다.
// 랑방 대전 알림(웹 푸시)도 여기서 받는다: push → 알림 띄우기 · 알림 누르기 → 열린 창으로 가거나 새로 연다.
const CACHE = 'gameworld-v10';
const SHELL = ['/', '/css/style.css', '/js/app.js', '/js/splash.js', '/js/platform.js', '/js/settings.js', '/js/cards.js', '/js/sound.js', '/js/seotda.js', '/js/evaluator.js', '/js/handchart.js', '/img/emblem.webp', '/img/splash2.webp', '/img/gw2-icon-192.png', '/manifest.webmanifest'];

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
        caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? url.pathname : req, copy)).catch(() => {}); // 화면 주소마다 따로 (랑방 대전 화면이 게임월드 첫 화면 저장본을 덮어쓰지 않게)
      }
      return res;
    }).catch(() => caches.match(req.mode === 'navigate' ? url.pathname : req).then((r) => r || (req.mode === 'navigate' ? caches.match(url.pathname.startsWith('/langbang') ? '/langbang/' : '/') : null)).then((r) => r || new Response('인터넷 연결을 확인해 주세요', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } }))),
  );
});

// ── 웹 푸시 알림 (server/push.js 가 보냄) ──
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '랑방 대전', {
    body: d.body || '',
    icon: '/img/lb/app/icon-192.png',
    badge: '/img/lb/app/icon-192.png',
    tag: d.tag || 'lb',
    data: { url: d.url || '/langbang/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/langbang/', self.location.origin);
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // 같은 화면(랑방 · 게임월드)이 열려 있으면 그 창으로, 아니면 새로 연다
    const same = list.find((c) => { try { const u = new URL(c.url); return u.origin === url.origin && (url.pathname.startsWith('/langbang') ? u.pathname.startsWith('/langbang') : u.pathname === url.pathname); } catch { return false; } });
    if (same) { const w = await same.focus(); if (url.search && w && w.navigate) w.navigate(url.href).catch(() => {}); return; }
    await self.clients.openWindow(url.href);
  })());
});
