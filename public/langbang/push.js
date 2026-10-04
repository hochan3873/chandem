// 랑방 대전 — 알림 받기 (웹 푸시)
//  서버(server/push.js)에 VAPID 열쇠가 없으면 /api/push/key 가 disabled → 카드도 설정 줄도 안 보인다.
//  권한은 꼭 사람이 누른 뒤에만 묻는다: 로비 카드 [알림 받기] 또는 설정의 알림 스위치.
//  로비 카드: 두 번째 방문부터 또는 두 판 이상 깬 뒤 · [나중에] 누르면 3일 동안 안 보임 · 한 번 켜고 끈 사람에겐 다시 안 띄움.
//  아이폰은 홈 화면에 설치한 앱(iOS 16.4+)에서만 알림이 된다 → 사파리에서는 설치 안내로.
const UA = navigator.userAgent || '';
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh|MacIntel/.test(UA + navigator.platform) && navigator.maxTouchPoints > 1);
const K = { dev: 'langbang:pushDev', on: 'langbang:pushOn', later: 'langbang:pushLater', asked: 'langbang:pushAsked', visits: 'langbang:visits' };
const LATER_MS = 3 * 24 * 3600e3;
let C = null; // { popup, toast, closeInfoCard, installOpen, standalone, profile }
let key = null; // 서버 공개 열쇠 (없으면 알림 꺼짐)
let checked = false, shownThisSession = false, synced = false;

const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } }, del: (k) => { try { localStorage.removeItem(k); } catch { /* 무시 */ } } };
const hasApi = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iosNeedsInstall = () => IS_IOS && !C.standalone();
function deviceId() {
  let d = ls.get(K.dev);
  if (!d || !/^[\w-]{6,64}$/.test(d)) { d = 'd' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); ls.set(K.dev, d); }
  return d;
}
function b64ToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function post(path, body) {
  const headers = { 'content-type': 'application/json' };
  let t = null;
  try { t = JSON.parse(localStorage.getItem('chandem:auth')); } catch { /* 손님 */ }
  if (t) headers.authorization = 'Bearer ' + t;
  const r = await fetch('/api/push/' + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  return r.json().catch(() => ({ ok: false }));
}
async function registration() {
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js'));
  return navigator.serviceWorker.ready.then(() => reg).catch(() => reg);
}
async function currentSub() {
  if (!hasApi()) return null;
  try { const reg = await navigator.serviceWorker.getRegistration('/'); return reg ? await reg.pushManager.getSubscription() : null; } catch { return null; }
}

// 처음 한 번: 열쇠 받기 · 방문 세기 · 이미 구독돼 있으면 서버에 다시 알려 두기(로그인이 바뀌었을 수 있어서)
export function initPush(ctx) {
  C = ctx;
  ls.set(K.visits, String((Number(ls.get(K.visits)) || 0) + 1));
  fetch('/api/push/key').then((r) => r.json()).then(async (j) => {
    key = j && j.ok && j.key ? j.key : null;
    checked = true;
    if (!key || !hasApi() || Notification.permission !== 'granted') return;
    const sub = await currentSub();
    if (sub) { ls.set(K.on, '1'); sync(sub); } else ls.del(K.on);
  }).catch(() => { checked = true; });
  return { available, isOn, toggle, maybePrompt, settingHint };
}
async function sync(sub) {
  if (synced) return;
  synced = true;
  await post('subscribe', { subscription: sub.toJSON(), deviceId: deviceId() }).catch(() => {});
}

// 설정에 보일까: 서버가 켜 두었고 · (브라우저가 되거나 · 아이폰 설치 전이라 안내할 수 있으면)
export const available = () => !!key && (hasApi() || iosNeedsInstall());
export const isOn = () => ls.get(K.on) === '1' && hasApi() && Notification.permission === 'granted';
export function settingHint() {
  if (iosNeedsInstall()) return '홈 화면에 설치하면 받을 수 있어요';
  if (hasApi() && Notification.permission === 'denied') return '브라우저 설정에서 알림을 허용해 주세요';
  return '체력 가득 · 출석 · 건물주 출몰';
}

// 켜기 (꼭 사람이 누른 직후에 부를 것)
async function enable() {
  if (iosNeedsInstall()) { iosGuide(); return false; }
  if (!hasApi() || !key) { C.toast('이 브라우저에서는 알림을 받을 수 없어요', 2400); return false; }
  ls.set(K.asked, '1');
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { C.toast(perm === 'denied' ? '알림이 막혀 있어요 · 브라우저 설정에서 허용해 주세요' : '나중에 설정에서 켤 수 있어요', 2800); return false; }
  try {
    const reg = await registration();
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
    const r = await post('subscribe', { subscription: sub.toJSON(), deviceId: deviceId() });
    if (!r || !r.ok) throw new Error((r && r.message) || 'subscribe');
    synced = true;
    ls.set(K.on, '1');
    C.toast('알림을 켰어요! 체력이 차면 알려 드릴게요 🔔', 2600);
    return true;
  } catch {
    C.toast('알림을 켜지 못했어요 · 잠시 후 다시 해 주세요', 2400);
    return false;
  }
}
async function disable() {
  ls.del(K.on);
  ls.set(K.asked, '1');
  const sub = await currentSub();
  if (sub) { await post('unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
  C.toast('알림을 껐어요', 1600);
}
export async function toggle() { if (isOn()) await disable(); else await enable(); }

// 창의 ✕ 도 [나중에] 와 같게
const laterOnX = (m) => { const x = m.querySelector('[data-x]'); if (x) x.addEventListener('click', () => ls.set(K.later, String(Date.now()))); };
function iosGuide() {
  const m = C.popup(`<div class="push-card"><img class="push-bell" src="/img/lb/app/icon-192.png" alt="" draggable="false"><h3>알림 받기</h3>
    <p class="push-txt">아이폰은 <b>홈 화면에 설치한 랑방 대전 앱</b>에서만 알림을 받을 수 있어요</p>
    <p class="push-sub">설치한 앱으로 열고 설정 → 알림을 켜 주세요 (iOS 16.4 이상)</p>
    <div class="push-btns"><button class="btn primary" data-push="install">홈 화면에 설치하기</button><button class="btn" data-push="later">나중에</button></div></div>`, 'lb-sheet push-sheet');
  m.querySelector('[data-push="install"]').onclick = () => { C.closeInfoCard(); C.installOpen(); };
  m.querySelector('[data-push="later"]').onclick = () => { ls.set(K.later, String(Date.now())); C.closeInfoCard(); };
}

// 로비에서 알맞을 때 한 번: 첫 화면은 피하고 · 두 번째 방문부터 또는 두 판 이상 깬 뒤
export function maybePrompt() {
  if (!checked || !available() || shownThisSession || isOn() || ls.get(K.asked)) return false;
  if (hasApi() && Notification.permission === 'denied') return false;
  if (Date.now() - (Number(ls.get(K.later)) || 0) < LATER_MS) return false;
  const p = C.profile() || {};
  if (!((Number(ls.get(K.visits)) || 0) >= 2 || (p.maxStage | 0) >= 2)) return false;
  shownThisSession = true;
  if (iosNeedsInstall()) {
    const m = C.popup(`<div class="push-card"><img class="push-bell" src="/img/lb/app/icon-192.png" alt="" draggable="false"><h3>알림 받기</h3>
      <p class="push-txt">체력 가득 · 출석 · 건물주 출몰을 알려 드려요</p>
      <p class="push-sub">홈 화면에 설치하면 알림을 받을 수 있어요</p>
      <div class="push-btns"><button class="btn primary" data-push="install">설치 방법 보기</button><button class="btn" data-push="later">나중에</button></div></div>`, 'lb-sheet push-sheet');
    m.querySelector('[data-push="install"]').onclick = () => { ls.set(K.later, String(Date.now())); C.closeInfoCard(); C.installOpen(); };
    m.querySelector('[data-push="later"]').onclick = () => { ls.set(K.later, String(Date.now())); C.closeInfoCard(); };
    laterOnX(m);
    return true;
  }
  const m = C.popup(`<div class="push-card"><img class="push-bell" src="/img/lb/app/icon-192.png" alt="" draggable="false"><h3>알림 받기</h3>
    <p class="push-txt">체력 가득 · 출석 · 건물주 출몰을 알려 드려요</p>
    <p class="push-sub">하루 두 번까지만 · 밤 10시~아침 9시엔 조용히 · 설정에서 언제든 끌 수 있어요</p>
    <div class="push-btns"><button class="btn primary" data-push="yes">알림 받기</button><button class="btn" data-push="later">나중에</button></div></div>`, 'lb-sheet push-sheet');
  const yes = m.querySelector('[data-push="yes"]');
  yes.onclick = async () => { yes.disabled = true; C.closeInfoCard(); await enable(); };
  m.querySelector('[data-push="later"]').onclick = () => { ls.set(K.later, String(Date.now())); C.closeInfoCard(); };
  laterOnX(m);
  return true;
}
