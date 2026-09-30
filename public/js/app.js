import { cardHTML, cardsHTML, cardName, setDeckStyle } from './cards.js';
import { rankSeotda, seotdaChartHTML, bestPairSeotda } from './seotda.js';
import * as sound from './sound.js';
import { handChartHTML } from './handchart.js';
import { bestHand } from './evaluator.js';
import * as P from './platform.js';
import * as gws from './settings.js';
import * as RK from './ranks.js';

/* global io */
const $app = document.getElementById('app');
const $modal = document.getElementById('modal-root');
const $toast = document.getElementById('toast');
const socket = io({ transports: ['websocket', 'polling'] });

const AVATAR_COUNT = 8;
const S = {
  view: 'boot',          // boot | home | create | join | pending | message | room
  code: null,
  session: null,         // { token, playerId }
  state: null,
  roomInfo: null,
  info: null,            // /api/info
  message: null,
  connected: false,
  lastSeq: null,
  seenCards: new Set(),
  raise: { open: false, to: 0 },
  actionSig: '',
  gameMounted: false,
  lastTurnId: null,
  resultShownFor: 0,
};

// ── 유틸 ─────────────────────────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + fmt(Math.abs(n));
const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const sessKey = (code) => 'chandem:session:' + code;

function toast(msg, kind = 'info') {
  $toast.textContent = msg;
  $toast.className = 'show ' + kind;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { $toast.className = ''; }, 2600);
}

function emit(ev, data) {
  return new Promise((resolve) => {
    if (!socket.connected) { toast('서버와 연결이 끊겼어요. 다시 연결하는 중이에요', 'error'); resolve({ ok: false }); return; }
    socket.emit(ev, data || {}, (res) => {
      if (res && res.ok === false && res.message) toast(res.message, 'error');
      resolve(res || { ok: false });
    });
  });
}

function avatarIndex(p) {
  if (p.avatar >= 1 && p.avatar <= AVATAR_COUNT) return p.avatar;
  let h = 0;
  for (const ch of String(p.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % AVATAR_COUNT) + 1;
}
function avatarHTML(p, size = '') {
  const initial = esc((p.name || '?').trim().charAt(0));
  const src = p.photo && S.code ? `/api/photo/${encodeURIComponent(S.code)}/${encodeURIComponent(p.id)}?v=${Number(p.photo)}` : `/img/avatars/a${avatarIndex(p)}.webp`;
  return `<span class="avatar ${size}"><span class="avatar-initial">${initial}</span>`
    + `<img src="${src}" alt="" loading="lazy" onerror="this.remove()"></span>`;
}

// 선수 캐릭터 고르기 (0 = 자동)
function avatarPickerHTML() {
  const cur = LS.get('chandem:avatar', 0);
  const photo = LS.get('chandem:photo', '');
  return `<fieldset class="fieldset"><legend>내 캐릭터</legend>
    <div class="av-pick">
      <label class="av-opt av-photo" title="내 사진으로">
        <input type="radio" name="avatar" value="photo" ${cur === 'photo' && photo ? 'checked' : ''}>
        <span class="avatar avatar-photo">${photo ? `<img src="${photo}" alt="내 사진">` : '<small>내 사진</small>'}</span>
        <input type="file" accept="image/*" data-photo-file hidden>
      </label>
      <label class="av-opt"><input type="radio" name="avatar" value="0" ${!cur ? 'checked' : ''}><span class="avatar avatar-auto">자동</span></label>
      ${Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map((n) => `
        <label class="av-opt"><input type="radio" name="avatar" value="${n}" ${cur === n ? 'checked' : ''}>
          <span class="avatar"><img src="/img/avatars/a${n}.webp" alt="캐릭터 ${n}"></span></label>`).join('')}
    </div></fieldset>`;
}
function readAvatar(form) {
  const raw = new FormData(form).get('avatar');
  if (raw === 'photo') { LS.set('chandem:avatar', 'photo'); return undefined; }
  const v = Number(raw) || 0;
  LS.set('chandem:avatar', v);
  return v || undefined;
}
function readPhoto(form) {
  return new FormData(form).get('avatar') === 'photo' ? LS.get('chandem:photo', '') || undefined : undefined;
}
// 사진을 가운데 기준 정사각형 128px JPEG로 줄인다 (보통 5~10KB)
async function fileToPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const s = Math.min(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 128, 128);
    return c.toDataURL('image/jpeg', 0.82);
  } finally { URL.revokeObjectURL(url); }
}
function bindAvatarPicker(root) {
  applyMemberName(root);
  const opt = root.querySelector('.av-photo');
  if (!opt) return;
  const radio = opt.querySelector('input[type=radio]');
  const file = opt.querySelector('[data-photo-file]');
  opt.querySelector('.avatar-photo').addEventListener('click', (e) => {
    // 사진이 없거나 이미 사진을 고른 상태에서 누르면 사진 고르기
    if (!LS.get('chandem:photo', '') || radio.checked) { e.preventDefault(); file.click(); }
  });
  file.onchange = async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      const data = await fileToPhoto(f);
      LS.set('chandem:photo', data);
      opt.querySelector('.avatar-photo').innerHTML = `<img src="${data}" alt="내 사진">`;
      radio.checked = true;
    } catch { toast('사진을 읽지 못했어요. 다른 사진으로 해 주세요', 'error'); }
  };
}

function siteUrl() {
  const info = S.info || {};
  let base = location.origin;
  if (info.publicUrl) base = info.publicUrl.replace(/\/$/, '');
  else if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && info.lan && info.lan.length) base = info.lan[0];
  return base;
}

function inviteUrl(code) {
  return `${siteUrl()}/r/${code}`;
}

// 링크 공유: 휴대폰은 공유 시트, 안 되면 복사
async function shareLink(url, title, text) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); } catch {}
    return;
  }
  try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요', 'ok'); }
  catch { prompt('이 링크를 복사해서 보내 주세요', url); }
}

// 화면 맨 위 공유 버튼: 방 안이면 초대 링크, 아니면 찬덤 주소
function shareTop() {
  const code = S.state && S.state.room && S.state.room.code;
  if (code) shareLink(inviteUrl(code), '찬이의 게임월드 초대', `찬이의 게임월드 ${GAME_NAMES[gameOf(S.state)]} 방 ${code}에 들어와!`);
  else shareLink(siteUrl(), '찬이의 게임월드', '친구들이랑 휴대폰으로 홀덤 · 섯다 · 오목 한 판 하자!');
}

const ICON_NOTE = '<p class="muted tiny install-note">이미 설치한 앱 아이콘은 앱을 지우고 다시 설치해야 새 아이콘으로 바뀌어요</p>';
const SHARE_BTN_ONLY = `<button class="btn btn-sm btn-gold share-top" id="share-top" aria-label="공유하기">${P.hubIcon('link', 'hic-sm')}<span class="ib-text"> 공유</span></button>`;
// 앱 설치 버튼(이미 앱으로 열었으면 숨김) + 공유 버튼
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const installBtnHTML = () => (isStandalone() ? '' : '<button class="btn btn-sm btn-outline install-btn" id="install-btn" aria-label="앱 설치">앱 설치</button>');
const SHARE_BTN = { toString: () => `<span class="top-btns">${installBtnHTML()}${SHARE_BTN_ONLY}</span>` };

// ── 아이폰 사파리 확대 막기 (두 손가락 확대 · 두 번 톡 확대는 CSS touch-action 으로) ──
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

// ── 앱 설치 (PWA) ──────────────────────────────────
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
window.addEventListener('appinstalled', () => { S.installEvt = null; installDone(); document.querySelectorAll('#install-btn').forEach((b) => b.remove()); });
function installDone() {
  S.installing = null;
  document.querySelectorAll('#install-btn').forEach((b) => b.remove());
  openModal('설치 완료 ', `<div class="install-wait"><div class="install-ok"></div><p><b>찬이의 게임월드가 설치됐어요!</b></p>
    <p class="muted small">바탕화면이나 앱 목록의 아이콘으로 열면 전체 화면으로 즐길 수 있어요.</p>
    ${ICON_NOTE}<button class="btn btn-gold btn-lg" data-close>확인</button></div>`);
  sound.play('fanfare');
}
// ── 기기 판별 (아이패드는 요즘 'Mac + 터치'로 보여서 따로 본다) ──
const UA = navigator.userAgent;
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh|MacIntel/.test(UA + navigator.platform) && navigator.maxTouchPoints > 1);
const IS_KAKAO = /KAKAOTALK/i.test(UA);
const IN_APP = IS_KAKAO || /NAVER|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp/i.test(UA);
const IOS_VER = (() => { const m = UA.match(/OS (\d+)[_.](\d+)/); return m ? Number(m[1]) * 100 + Number(m[2]) : 0; })(); // 16.4 → 1604
const IOS_OTHER = IS_IOS && /CriOS|FxiOS|EdgiOS|OPiOS|Whale/i.test(UA); // 아이폰 크롬·파이어폭스 등 (16.4부터 홈 화면 추가 가능)
async function copySiteLink() {
  const url = location.origin + '/';
  try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요. 사파리 주소창에 붙여 넣어 주세요', 'ok'); }
  catch { prompt('이 주소를 복사해서 사파리에서 열어 주세요', url); }
}
// 아이폰 설치 안내 그림 (SVG)
const SVG_SHARE = '<svg class="ios-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="14" width="22" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 4v19M13 10l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="15" y="12" width="10" height="4" fill="var(--ios-bg, #1b1f2a)"/></svg>';
const SVG_ADD = '<svg class="ios-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="6" width="28" height="28" rx="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 13v14M13 20h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
function iosStepsHTML() {
  const bar = IOS_OTHER ? '주소창 오른쪽의' : '화면 아래 막대의';
  return `
    <ol class="ios-steps">
      <li><div class="ios-shot ios-shot-bar"><span class="ios-bar"><i></i><i></i><b class="ios-hl">${SVG_SHARE}</b><i></i><i></i></span></div>
        <p><b>①</b> ${bar} <b>공유</b> 버튼(네모에 위쪽 화살표)을 눌러요</p></li>
      <li><div class="ios-shot ios-shot-sheet"><span class="ios-row">복사</span><span class="ios-row">즐겨찾기에 추가</span><span class="ios-row ios-hl">${SVG_ADD}<b>홈 화면에 추가</b></span></div>
        <p><b>②</b> 목록을 아래로 내려서 <b>「홈 화면에 추가」</b>를 눌러요</p>
        <p class="muted tiny">iOS 17 이상에서는 맨 아래 <b>「더 보기」</b>(또는 <b>「작업 편집」</b>) 안에 있을 수 있어요</p></li>
      <li><div class="ios-shot ios-shot-top"><span class="ios-cancel">취소</span><span class="ios-title">홈 화면에 추가</span><b class="ios-hl ios-add">추가</b></div>
        <p><b>③</b> 오른쪽 위 <b>「추가」</b>를 누르면 끝! 바탕화면 아이콘으로 열면 전체 화면이에요</p></li>
    </ol>`;
}
function openIosInstall() {
  if (IN_APP) {
    openModal('아이폰에 앱 설치', `
      <p><b>${IS_KAKAO ? '카카오톡' : '앱'} 안의 브라우저</b>에서는 설치할 수 없어요. <b>사파리로 열어야 설치할 수 있어요.</b></p>
      <p class="muted small">${IS_KAKAO ? '오른쪽 아래 <b>⋯</b> → <b>「다른 브라우저로 열기」</b>를 누르거나, ' : '메뉴(⋯)에서 <b>「Safari로 열기」</b>를 누르거나, '}아래 링크를 복사해서 사파리 주소창에 붙여 넣어 주세요.</p>
      <div class="row"><button class="btn btn-gold grow" id="ios-copy">링크 복사</button>${IS_KAKAO ? `<a class="btn btn-outline grow" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.origin + '/')}">바깥 브라우저로</a>` : ''}</div>`,
    (b) => { b.querySelector('#ios-copy').onclick = copySiteLink; });
    return;
  }
  if (IOS_OTHER && IOS_VER && IOS_VER < 1604) {
    openModal('아이폰에 앱 설치', `<p>이 브라우저(iOS ${Math.floor(IOS_VER / 100)})에서는 홈 화면에 추가가 안 돼요. <b>사파리로 열어서</b> 다시 앱 설치를 눌러 주세요.</p>
      <button class="btn btn-gold btn-lg" id="ios-copy">링크 복사</button>`, (b) => { b.querySelector('#ios-copy').onclick = copySiteLink; });
    return;
  }
  openModal('아이폰에 앱 설치', `${iosStepsHTML()}
    <p class="muted small">아이폰은 애플 정책상 버튼 하나로 바로 설치할 수 없어서, 위 3단계로 홈 화면에 추가해요.</p>${ICON_NOTE}`, null, { wide: true });
}
/** 아이폰 + 카톡·네이버 등 앱 안 브라우저: 메인 위에 "사파리로 열어야 설치할 수 있어요" 띠 */
function iosInAppBannerHTML() {
  if (!IS_IOS || !IN_APP || isStandalone()) return '';
  return `<div class="ios-banner" role="note"><b>사파리로 열어야 설치할 수 있어요</b>
    <small>${IS_KAKAO ? '카카오톡은 오른쪽 아래 <b>⋯</b> → <b>「다른 브라우저로 열기」</b>' : '메뉴(⋯) → <b>「Safari로 열기」</b>'} · 또는 링크를 복사해서 사파리에 붙여 넣기</small>
    <button class="btn btn-sm btn-gold" id="ios-banner-copy">링크 복사</button></div>`;
}
document.addEventListener('click', (e) => { if (e.target.closest('#ios-banner-copy')) copySiteLink(); });

// ── 설치한 앱(홈 화면)으로 열었을 때: 화면 높이 맞추기 ──
// 아이폰 설치 앱 + 상태 막대 비침(black-translucent)에서는 innerHeight 가 위쪽 상태 막대만큼 짧게 나와
// 아래에 빈 띠가 생긴다 → 실제 화면 높이(screen)를 쓰고, 위·아래는 CSS 의 safe-area 여백으로 비킨다
function fitAppHeight() {
  if (!isStandalone()) { document.documentElement.classList.remove('gw-standalone'); return; }
  let h = window.innerHeight;
  if (window.visualViewport) h = Math.max(h, window.visualViewport.height);
  if (IS_IOS && window.screen) {
    const land = window.matchMedia && matchMedia('(orientation: landscape)').matches;
    const sh = land ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height);
    if (sh > 0) h = Math.max(h, sh);
  }
  document.documentElement.classList.add('gw-standalone');
  document.documentElement.style.setProperty('--app-h', Math.round(h) + 'px');
}
fitAppHeight();
// 아이폰 사파리·카카오톡 안 브라우저: 아래 도구 막대가 화면을 덮을 수 있어서 '실제로 보이는 높이'로 게임 화면을 맞춘다
function fitVisibleHeight() {
  if (!IS_IOS || isStandalone() || !window.visualViewport) return;
  document.documentElement.style.setProperty('--vv-h', Math.round(window.visualViewport.height) + 'px');
  document.documentElement.classList.add('gw-vv');
}
fitVisibleHeight();
if (window.visualViewport) { visualViewport.addEventListener('resize', fitVisibleHeight); visualViewport.addEventListener('scroll', fitVisibleHeight); }
['resize', 'orientationchange', 'pageshow'].forEach((ev) => window.addEventListener(ev, () => setTimeout(fitAppHeight, 60)));

async function installApp() {
  const ua = UA;
  const url = location.origin + '/';
  const ios = IS_IOS;
  const kakao = IS_KAKAO;
  const inApp = IN_APP;
  if (ios) { openIosInstall(); return; }
  if (S.installEvt && !inApp && !ios) {
    S.installEvt.prompt();
    const r = await S.installEvt.userChoice.catch(() => null);
    if (r && r.outcome === 'accepted') {
      S.installEvt = null;
      // 크롬은 진행률을 알려 주지 않아서, 끝났다는 신호(appinstalled)가 올 때까지 '설치 중'을 보여 준다
      S.installing = Date.now();
      openModal('앱 설치 중', `<div class="install-wait"><div class="spinner" aria-hidden="true"></div>
        <p><b>설치하고 있어요…</b></p><p class="muted small">보통 10~30초 걸려요. 끝나면 바탕화면과 앱 목록에 아이콘이 생겨요.</p>
        <p class="muted small" data-install-sec>0초</p>${ICON_NOTE}</div>`);
      const t = setInterval(() => {
        const el = document.querySelector('[data-install-sec]');
        if (!el || !S.installing) { clearInterval(t); return; }
        const sec = Math.round((Date.now() - S.installing) / 1000);
        el.textContent = sec < 60 ? `${sec}초` : '오래 걸리면 알림창이나 바탕화면을 확인해 주세요';
      }, 1000);
    }
    return;
  }
  if (inApp) {
    const outer = kakao ? `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`
      : ios ? null : `intent://${location.host}/#Intent;scheme=https;package=com.android.chrome;end`;
    openModal('앱 설치', `
      <p>지금은 <b>${kakao ? '카카오톡' : '앱'} 안의 브라우저</b>라서 설치할 수 없어요.</p>
      <p class="muted small">${ios ? '사파리' : '크롬·삼성 인터넷 같은 브라우저'}로 연 다음 <b>앱 설치</b>를 다시 눌러 주세요.</p>
      ${outer ? `<a class="btn btn-gold btn-lg" href="${outer}">${kakao ? '바깥 브라우저로 열기' : ios ? '사파리로 열기' : '크롬으로 열기'}</a>` : `<p class="muted small">오른쪽 아래(또는 위) <b>⋯ → 다른 브라우저로 열기</b>를 눌러 주세요.</p>`}`);
    return;
  }
  if (ios) {
    openModal('아이폰에 앱 설치', `
      <ol class="install-steps">
        <li>화면 아래(또는 위)의 <b>공유 버튼</b> <span class="ios-share">⬆︎</span> 을 눌러요</li>
        <li>목록을 내려서 <b>「홈 화면에 추가」</b>를 눌러요</li>
        <li>오른쪽 위 <b>추가</b>를 누르면 바탕화면에 찬이의 게임월드 앱이 생겨요</li>
      </ol>
      <p class="muted small">아이폰은 애플 정책상 버튼 하나로 바로 설치할 수 없어요. 사파리에서 해 주세요.</p>${ICON_NOTE}`);
    return;
  }
  openModal('앱 설치', `
    <ol class="install-steps">
      <li>크롬 오른쪽 위 <b>⋮</b> 메뉴를 눌러요</li>
      <li><b>「앱 설치」</b> 또는 <b>「홈 화면에 추가」</b>를 눌러요</li>
      <li><b>설치</b>를 누르면 바탕화면과 앱 목록에 찬이의 게임월드가 생겨요</li>
    </ol>
    <p class="muted small">이미 설치했다면 바탕화면의 찬이의 게임월드 아이콘으로 열어 주세요.</p>${ICON_NOTE}`);
}
document.addEventListener('click', (e) => { if (e.target.closest('#install-btn')) installApp(); });

// ── 모달 ─────────────────────────────────────────────
let modalOnClose = null; // 이 모달이 닫힐 때 한 번 (다른 모달로 바뀌면 부르지 않음)
function openModal(title, html, onMount, { wide = false, onClose = null } = {}) {
  modalOnClose = onClose;
  $modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="닫기">✕</button></div>
      <div class="modal-body">${html}</div>
    </div>`;
  $modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  if (onMount) onMount($modal.querySelector('.modal-body'));
}
function closeModal() {
  $modal.innerHTML = '';
  const f = modalOnClose; modalOnClose = null;
  if (f) f();
}

// ── 라우팅 · 뒤로가기 보호 ─────────────────────────────
// 앱 안에서 화면을 옮길 때는 방문 기록을 쌓지 않고 주소만 바꾼다(nav). 대신 맨 위에 '보호용' 기록 하나를 둬서
// 휴대폰·브라우저 뒤로가기를 누르면 바로 떠나지 않고 → 방 안: 나가기 메뉴 · 하위 화면: 한 단계 위 · 메인: 종료 확인.
// (보호 기록은 사용자가 화면을 한 번 누른 뒤에 만든다 — 브라우저 규칙상 그래야 뒤로가기에 걸린다)
// 뒤로가기를 계속 눌러도 이전 페이지(랑방 대전·예전 메인 기록 등)로 가지 않고 메인까지만 올라온다.
// '종료'를 골랐을 때만, 이 탭에서 사이트에 처음 들어온 기록(gw:startIdx) 바로 앞으로 한 번에 돌아가 사이트를 떠난다.
// 기록 상태: { gw: 'base'|'guard', i: 사이트 첫 기록 위치(base), n: 지금 기록 위치 }
// 크롬(안드로이드·설치 앱 포함)은 '손가락이 닿지 않은 채 쌓은 기록'을 뒤로 가기에서 건너뛰어 바로 앱이 닫힐 수 있다.
// → 화면을 누를 때마다(아직 누른 채 건 보호 기록이 없으면) 보호 기록을 하나 더 쌓아 둔다 (랑방 대전과 같은 방식)
const H = { url: location.pathname + location.search, armed: false, gesture: false, exiting: false, base: history.length - 1, n: history.length - 1 };
(() => {
  const st = history.state;
  if (st && (st.gw === 'guard' || st.gw === 'base') && Number.isFinite(st.i)) { H.base = st.i; H.armed = st.gw === 'guard'; H.n = Number.isFinite(st.n) ? st.n : H.base + (H.armed ? 1 : 0); }
  else { try { history.replaceState({ gw: 'base', i: H.base, n: H.base }, '', H.url); } catch {} }
  try {
    const navType = ((performance.getEntriesByType && performance.getEntriesByType('navigation')[0]) || {}).type || 'navigate';
    let outside = true;
    try { outside = !document.referrer || new URL(document.referrer).origin !== location.origin; } catch {}
    // 바깥(다른 사이트·앱 아이콘·새 탭)에서 들어왔으면 여기가 시작. 랑방 대전에서 location.replace('/') 로 오면 시작점은 그대로
    if ((navType === 'navigate' && outside) || sessionStorage.getItem('gw:startIdx') === null) sessionStorage.setItem('gw:startIdx', String(H.base));
    if (sessionStorage.getItem('gw:exitHint')) { sessionStorage.removeItem('gw:exitHint'); H.exitHint = true; }
  } catch {}
})();
function nav(url) {
  H.url = url;
  try { history.replaceState(history.state, '', url); } catch {}
}
function pushGuard(gesture) {
  try { history.pushState({ gw: 'guard', i: H.base, n: H.n + 1 }, '', H.url); H.n++; H.armed = true; H.gesture = gesture; } catch {}
}
function armGuard(e) {
  if (H.exiting) return;
  // 진짜 사용자 입력(브라우저가 '누름'으로 인정한 순간)일 때만 '누른 채 건 기록'으로 친다
  const gesture = !!(e && e.isTrusted && (!navigator.userActivation || navigator.userActivation.isActive));
  if (H.armed && (H.gesture || !gesture)) return; // 이미 걸려 있음 (누른 채 건 게 아니면 누를 때 한 번 더)
  if (e && e.target && e.target.closest && e.target.closest('[data-exit-go]')) return; // '종료'를 누른 터치로는 다시 걸지 않음
  pushGuard(gesture);
}
['pointerdown', 'click', 'pointerup', 'touchend', 'keydown'].forEach((ev) => window.addEventListener(ev, armGuard, { capture: true, passive: true }));
// 처음부터 보호를 걸어 둔다 (한 번 누르기 전이면 브라우저가 건너뛸 수도 있어서, 누를 때 다시 확인). 종료 직후 돌아온 화면은 제외
if (!H.exitHint) armGuard();
function routeCode() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

// ── 계정 ───────────────────────────────────────────
const TIERS = [
  [1800, '그랜드마스터', 'crown', '#ff5d73'], [1650, '마스터', 'crown', '#c77dff'], [1500, '다이아몬드', 'trophy', '#6fd3ff'],
  [1350, '플래티넘', 'trophy', '#4fe0c1'], [1200, '골드', 'trophy', '#ffd35a'], [1050, '실버', 'coin', '#cfd8e3'],
  [900, '브론즈', 'coin', '#d59a6a'], [-Infinity, '아이언', 'omok', '#9aa1a8'],
];
function tierOf(r) { const t = TIERS.find((x) => r >= x[0]); return { name: t[1], icon: t[2], color: t[3] }; }
// 계급·등급 아이콘: 서버가 주는 아이콘 이름(crown·trophy…)을 그린 아이콘으로 (예전 이모지 값이면 안 보임)
const tierIco = (icon, cls = 'hic-sm') => (/^[a-z_]+$/.test(String(icon || '')) ? P.hubIcon(icon, cls) : '');
S.auth = LS.get('chandem:auth', null);
S.user = null;
async function api(path, body) {
  const opt = body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { headers: S.auth ? { authorization: 'Bearer ' + S.auth } : {} };
  try { return await (await fetch('/api/auth' + path, opt)).json(); } catch { return { ok: false, message: '서버와 연결할 수 없어요' }; }
}
async function loadMe() {
  if (!S.auth) { S.user = null; return; }
  const r = await api('/me');
  if (r.ok) { S.user = r.user; return; }
  if (!r.message) return;
  S.user = null; S.auth = null; LS.del('chandem:auth');
  // 이 기기 계정(자동으로 만든 계정)이면 저장된 아이디·비밀번호로 다시 로그인
  const dev = LS.get('gw:device', null);
  if (dev && dev.username && dev.password) {
    const l = await api('/login', { username: dev.username, password: dev.password });
    if (l.ok) setAuth(l, { quiet: true });
  }
}
function logout() {
  S.auth = null; S.user = null; S.checkin = null;
  LS.del('chandem:auth');
  closeModal();
  render();
}
function setAuth(r, { quiet = false } = {}) {
  S.auth = r.token; S.user = r.user;
  LS.set('chandem:auth', r.token);
  LS.set('chandem:name', r.user.nickname);
  bindSeatToAccount(quiet);
}
// 방 안에서 로그인하면: 손님으로 앉은 이 자리를 계정에 묶는다 (지난 판은 소급 안 함, 다음 판부터 기록)
async function bindSeatToAccount(quiet = false) {
  if (!S.auth || !S.session || !S.state || S.view !== 'room') return;
  const meRow = S.state.players.find((p) => S.state.me && p.id === S.state.me.id);
  if (!meRow || meRow.member) return;
  const r = await new Promise((res) => socket.emit('room:bindAccount', { auth: S.auth }, res));
  if (r && r.ok && !quiet) toast(r.from === 'next' ? '로그인됐어요! 다음 판부터 전적·순위가 쌓여요' : '로그인됐어요! 이제부터 전적·순위가 쌓여요', 'ok');
  else if (r && !r.ok && r.message && !quiet) toast(r.message, 'error');
}
// ── 이 기기로 계속하기: 닉네임만 적으면 바로 계정 (아이디·비밀번호는 서버가 만들어 이 기기에 저장) ──
function openQuickAccount() {
  const name = (S.state && S.state.me && S.state.players.find((p) => p.id === S.state.me.id) || {}).name || LS.get('chandem:name', '');
  openModal('이 기기로 바로 시작', `
    <form class="form" id="quick-form">
      <p class="small">가입 없이 <b>닉네임만</b> 정하면 끝! 이 휴대폰에 계정이 저장되고, 오늘부터 <b>전적·순위</b>가 쌓여요.</p>
      <label class="field"><span>닉네임</span><input class="input" name="nickname" maxlength="10" required value="${esc(String(name).replace(/ \(\d+\)$/, ''))}" placeholder="게임에서 보일 이름" autocomplete="nickname"></label>
      <button class="btn btn-gold btn-lg">이 기기로 계속하기</button>
      <p class="muted tiny">다른 휴대폰에서도 쓰려면 나중에 설정 → 계정 관리에서 비밀번호만 정하면 돼요. 휴대폰을 바꾸거나 기록을 지우면 복구 코드가 필요해요 (처음 한 번 보여 줘요).</p>
    </form>`, (b) => {
    const f = b.querySelector('#quick-form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true;
      const r = await siteApi('/device-account', { nickname: new FormData(f).get('nickname') });
      btn.disabled = false;
      if (!r.ok) { toast(r.message || '다시 해 주세요', 'error'); return; }
      LS.set('gw:device', { username: r.username, password: r.password });
      setAuth(r);
      toast(`${r.user.nickname}님, 반가워요! 이제 전적이 쌓여요`, 'ok');
      showRecoveryCode(r.code, { fresh: true });
      render();
    };
  });
}
function acctBtnHTML() {
  if (S.info && S.info.accounts === false) return '<span></span>';
  if (!S.user) return '<button class="btn btn-sm btn-outline acct-btn" id="acct-btn">로그인</button>';
  const t = tierOf(S.user.stats.omok.rating);
  return `<button class="btn btn-sm btn-outline acct-btn is-user ${S.user.isMaster ? 'is-master' : ''}" id="acct-btn" title="내 전적">${S.user.isMaster ? P.hubIcon('crown', 'hic-sm') : tierIco(t.icon)} <span class="acct-name">${esc(S.user.nickname)}</span></button>`;
}
function openLogin(tab = 'login') {
  openModal(tab === 'login' ? '로그인' : '회원가입', `
    <div class="seg auth-tabs">
      <label class="seg-opt"><input type="radio" name="authtab" value="login" ${tab === 'login' ? 'checked' : ''}><span>로그인</span></label>
      <label class="seg-opt"><input type="radio" name="authtab" value="signup" ${tab === 'signup' ? 'checked' : ''}><span>회원가입</span></label>
    </div>
    <button type="button" class="btn btn-gold btn-lg quick-start" id="quick-start">가입 없이 이 기기로 바로 시작</button>
    ${LS.get('gw:device', null) ? '<button type="button" class="btn btn-outline" id="device-login">이 기기 계정으로 다시 로그인</button>' : ''}
    <div class="divider"><span>아이디로 ${tab === 'login' ? '로그인' : '가입'}</span></div>
    <form class="form" id="auth-form" autocomplete="on">
      <label class="field"><span>아이디</span><input class="input" name="username" maxlength="16" required autocomplete="username" autocapitalize="off" placeholder="영어 소문자·숫자 3~16자"></label>
      <label class="field"><span>비밀번호</span><input class="input" type="password" name="password" maxlength="64" required autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}" placeholder="6자 이상"></label>
      ${tab === 'signup' ? `
      <label class="field"><span>비밀번호 확인</span><input class="input" type="password" name="password2" maxlength="64" required autocomplete="new-password"></label>
      <label class="field"><span>닉네임</span><input class="input" name="nickname" maxlength="10" required value="${esc(LS.get('chandem:name', ''))}" placeholder="게임에서 보일 이름"></label>` : ''}
      <button class="btn btn-gold btn-lg" type="submit">${tab === 'login' ? '로그인' : '가입하고 시작'}</button>
      ${tab === 'login' ? '<div class="auth-links"><button type="button" id="find-id">아이디 찾기</button><span>·</span><button type="button" id="find-pw">비밀번호 찾기</button></div>' : ''}
      <p class="muted small">로그인 없이도 그대로 게임할 수 있어요. 로그인하면 전적·승률과 <b>오목 티어</b>가 쌓여요.</p>
    </form>`, (body) => {
    body.querySelectorAll('input[name=authtab]').forEach((r) => { r.onchange = () => openLogin(r.value); });
    const fi = body.querySelector('#find-id'); if (fi) fi.onclick = openFindId;
    body.querySelector('#quick-start').onclick = openQuickAccount;
    const dl = body.querySelector('#device-login');
    if (dl) dl.onclick = async () => {
      const dev = LS.get('gw:device', null);
      const l = dev ? await api('/login', { username: dev.username, password: dev.password }) : { ok: false };
      if (!l.ok) { toast('이 기기 계정으로 로그인하지 못했어요. 비밀번호를 바꿨다면 아이디로 로그인해 주세요', 'error'); return; }
      setAuth(l); closeModal(); toast(`${l.user.nickname}님, 반가워요!`, 'ok'); render();
    };
    const fp = body.querySelector('#find-pw'); if (fp) fp.onclick = () => openFindPw();
    const f = body.querySelector('#auth-form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      if (tab === 'signup' && fd.get('password') !== fd.get('password2')) { toast('비밀번호가 서로 달라요', 'error'); return; }
      const r = await api(tab === 'login' ? '/login' : '/signup', { username: fd.get('username'), password: fd.get('password'), nickname: fd.get('nickname') });
      if (!r.ok) { toast(r.message || '다시 해 주세요', 'error'); return; }
      setAuth(r);
      closeModal();
      toast(tab === 'login' ? `${r.user.nickname}님, 반가워요!` : '가입 완료! 이제 전적이 쌓여요', 'ok');
      if (tab === 'signup') {
        // 비밀번호를 잊었을 때 쓸 복구 코드를 바로 한 번 보여 준다
        const rc = await siteApi('/account/recovery', { password: fd.get('password') }, r.token);
        if (rc.ok) showRecoveryCode(rc.code, { fresh: true });
      }
      render();
    };
  });
}

async function siteApi(path, body, token) {
  try {
    const r = await fetch('/api/site' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}), cache: 'no-store' });
    return await r.json();
  } catch { return { ok: false, message: '서버와 연결할 수 없어요' }; }
}
/** 복구 코드 보여 주기 (지금 한 번만) */
function showRecoveryCode(code, { fresh = false, renewed = false } = {}) {
  openModal('복구 코드', `
    <p>${fresh ? '<b>가입 완료!</b> ' : renewed ? '<b>비밀번호를 바꿨어요.</b> 쓴 코드는 끝났고, ' : ''}비밀번호를 잊었을 때 쓰는 ${renewed ? '새 ' : ''}<b>복구 코드</b>예요. <b>지금 한 번만</b> 보여요.</p>
    <div class="rc-code mono" id="rc-code">${esc(code)}</div>
    <p class="small"><b>꼭 캡처해 두세요!</b> 이메일·전화번호를 받지 않아서, 이 코드가 있어야 혼자서 비밀번호를 바꿀 수 있어요.</p>
    <div class="row"><button class="btn btn-outline grow" id="rc-copy">복사하기</button><button class="btn btn-gold grow" data-close>저장했어요</button></div>
    <p class="muted tiny">잃어버렸다면 로그인한 뒤 설정 → 계정 관리에서 새로 받을 수 있어요 (새로 받으면 예전 코드는 못 써요).</p>`, (b) => {
    b.querySelector('#rc-copy').onclick = async () => { try { await navigator.clipboard.writeText(code); toast('복사했어요. 메모장 같은 곳에 붙여 두세요', 'ok'); } catch { prompt('복사해 두세요', code); } };
    b.querySelectorAll('[data-close]').forEach((x) => { x.onclick = closeModal; });
  });
}
function openFindId() {
  openModal('아이디 찾기', `
    <form class="form" id="fid-form">
      <p class="muted small">가입할 때 정한(또는 지금 쓰는) <b>닉네임</b>을 적으면 아이디 일부를 알려 줘요.</p>
      <label class="field"><span>닉네임</span><input class="input" name="nickname" maxlength="10" required autocomplete="off" placeholder="게임에서 보이는 이름"></label>
      <button class="btn btn-gold btn-lg">아이디 찾기</button>
      <div id="fid-out"></div>
      <div class="auth-links"><button type="button" data-go="login">로그인하기</button><span>·</span><button type="button" data-go="pw">비밀번호 찾기</button></div>
    </form>`, (body) => {
    const f = body.querySelector('#fid-form');
    body.querySelector('[data-go=login]').onclick = () => openLogin();
    body.querySelector('[data-go=pw]').onclick = () => openFindPw();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const r = await siteApi('/find-id', { nickname: new FormData(f).get('nickname') });
      const out = body.querySelector('#fid-out');
      if (!r.ok) { out.innerHTML = `<p class="find-result small">${esc(r.message || '찾지 못했어요')}</p>`; return; }
      out.innerHTML = `<div class="find-result">내 아이디는 <b class="mono">${esc(r.masked)}</b><br><small class="muted">가려진(***) 부분은 직접 떠올려 주세요 · ${new Date(r.createdAt).toLocaleDateString('ko-KR')} 가입</small></div>`;
    };
  });
}
function openFindPw(username = '') {
  openModal('비밀번호 찾기', `
    <form class="form" id="fpw-form">
      <p class="muted small">가입할 때 받은 <b>복구 코드</b>(ABCDE-FGHJK 모양)로 새 비밀번호를 정해요.</p>
      <label class="field"><span>아이디</span><input class="input" name="username" maxlength="16" required autocomplete="username" autocapitalize="off" value="${esc(username)}"></label>
      <label class="field"><span>복구 코드</span><input class="input mono" name="code" maxlength="14" required autocomplete="off" autocapitalize="characters" placeholder="ABCDE-FGHJK"></label>
      <label class="field"><span>새 비밀번호</span><input class="input" type="password" name="next" maxlength="64" required autocomplete="new-password" placeholder="6자 이상"></label>
      <label class="field"><span>새 비밀번호 확인</span><input class="input" type="password" name="next2" maxlength="64" required autocomplete="new-password"></label>
      <button class="btn btn-gold btn-lg">비밀번호 바꾸기</button>
      <p class="muted tiny">복구 코드를 5번 틀리면 1시간 동안 잠겨요.</p>
    </form>
    <div class="divider"><span>복구 코드가 없어요</span></div>
    <button class="btn btn-outline" id="fpw-ask">운영자에게 초기화 요청하기</button>
    <div class="auth-links"><button type="button" data-go="id">아이디 찾기</button><span>·</span><button type="button" data-go="login">로그인하기</button></div>`, (body) => {
    const f = body.querySelector('#fpw-form');
    body.querySelector('[data-go=id]').onclick = openFindId;
    body.querySelector('[data-go=login]').onclick = () => openLogin();
    body.querySelector('#fpw-ask').onclick = () => openResetRequest(new FormData(f).get('username') || '');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      if (fd.get('next') !== fd.get('next2')) { toast('새 비밀번호가 서로 달라요', 'error'); return; }
      const btn = f.querySelector('button:not([type=button])'); btn.disabled = true;
      const r = await siteApi('/reset-password', { username: fd.get('username'), code: fd.get('code'), next: fd.get('next') });
      btn.disabled = false;
      if (!r.ok) { toast(r.message || '다시 해 주세요', 'error'); return; }
      setAuth(r);
      toast(`${r.user.nickname}님, 비밀번호를 바꿨어요! 다른 기기는 로그아웃됐어요`, 'ok');
      showRecoveryCode(r.code, { renewed: true });
      render();
    };
  });
}
function openResetRequest(username = '') {
  openModal('운영자에게 요청', `
    <form class="form" id="rr-form">
      <p class="muted small">운영자(찬)가 확인하고 <b>임시 비밀번호</b>를 만들어 줘요. 누구인지 알아볼 수 있게 적어 주세요.</p>
      <label class="field"><span>아이디</span><input class="input" name="username" maxlength="16" required autocomplete="username" autocapitalize="off" value="${esc(username)}"></label>
      <label class="field"><span>연락 방법 · 메모</span><textarea class="input" name="note" maxlength="200" rows="3" required placeholder="예: 카톡 아이디 chan123 / 찬이 친구 민수예요"></textarea></label>
      <button class="btn btn-gold btn-lg">요청 보내기</button>
      <p class="muted tiny">받은 임시 비밀번호로 로그인한 뒤 설정 → 계정 관리에서 꼭 새 비밀번호로 바꿔 주세요.</p>
    </form>`, (body) => {
    const f = body.querySelector('#rr-form');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const r = await siteApi('/reset-request', { username: fd.get('username'), note: fd.get('note') });
      if (!r.ok) { toast(r.message || '다시 해 주세요', 'error'); return; }
      openModal('보냈어요', '<div class="empty-note"><p><b>요청을 보냈어요!</b><br>운영자가 확인하면 적어 준 연락처로 임시 비밀번호를 알려 줄 거예요.</p><button class="btn btn-gold btn-lg" data-close>확인</button></div>', (b) => { b.querySelector('[data-close]').onclick = closeModal; });
    };
  });
}
function pct(a, b) { return b ? Math.round((a / b) * 100) + '%' : '-'; }
async function openProfile() {
  await loadMe();
  if (!S.user) { openLogin(); return; }
  const s = S.user.stats;
  const o = s.omok;
  const t = tierOf(o.rating);
  const next = TIERS.slice().reverse().find((x) => x[0] > o.rating);
  const game = (g, label) => `
    <div class="stat-card"><h3>${label}</h3>
      <div class="stat-grid"><span>판 수</span><b>${fmt(g.hands)}</b><span>이긴 판</span><b>${fmt(g.wins)} (${pct(g.wins, g.hands)})</b>
      <span>누적 칩</span><b class="${g.net > 0 ? 'plus' : g.net < 0 ? 'minus' : ''}">${signed(g.net)}</b><span>가장 큰 팟</span><b>${fmt(g.bestPot)}</b>
      <span>최고 족보</span><b>${esc(g.bestHand || '-')}</b></div></div>`;
  openModal('내 전적', `
    <div class="profile-head"><b>${esc(S.user.nickname)}</b>${P.masterBadge(S.user.isMaster)}<span class="muted small">@${esc(S.user.username)}</span></div>
    <div class="tier-card" style="--tc:${t.color}">
      <div class="tier-icon">${tierIco(t.icon, '')}</div>
      <div class="tier-main"><div class="tier-name">오목 ${t.name}</div><div class="tier-rating">${fmt(o.rating)}점 <small>최고 ${fmt(o.peak)}</small></div>
        ${next ? `<div class="tier-next">다음 티어 ${next[2]} ${next[1]}까지 ${fmt(next[0] - o.rating)}점</div>` : '<div class="tier-next">최고 티어!</div>'}</div>
    </div>
    <div class="stat-card"><h3>오목</h3>
      <div class="stat-grid"><span>대국</span><b>${fmt(o.games)}</b><span>승 / 패 / 무</span><b>${o.wins} / ${o.losses} / ${o.draws}</b>
      <span>승률</span><b>${pct(o.wins, o.games)}</b><span>연속</span><b>${o.streak > 0 ? `${o.streak}연승 ` : o.streak < 0 ? `${-o.streak}연패` : '-'}</b></div></div>
    ${game(s.holdem, '♠ 텍사스 홀덤')}
    ${game(s.seotda, '섯다')}
    ${s.langbang ? `<div class="stat-card"><h3>랑방 대전 · Lv.${s.langbang.level}</h3>
      <div class="stat-grid"><span>최고 스테이지</span><b>${s.langbang.maxStage ? `${Math.ceil(s.langbang.maxStage / 10)}-${((s.langbang.maxStage - 1) % 10) + 1} · ★${fmt(s.langbang.totalStars || 0)}` : '-'}</b><span>무한 도전</span><b>${s.langbang.bestWave ? `W${fmt(s.langbang.bestWave)} · ${fmt(s.langbang.bestScore)}점` : '-'}</b>
      <span>플레이</span><b>${fmt(s.langbang.runs)}판</b><span>코인</span><b>${fmt(s.langbang.coins)}</b></div></div>` : ''}
    <div class="stat-card"><h3>토너먼트</h3><div class="stat-grid"><span>참가</span><b>${fmt(s.tourney.played)}</b><span>우승</span><b>${fmt(s.tourney.wins)}</b></div></div>
    <div class="row">
      <button class="btn btn-outline grow" id="rank-btn">오목 랭킹</button>
      <button class="btn btn-outline grow" id="acct-mng">계정 관리</button>
      <button class="btn btn-ghost danger" id="logout-btn">로그아웃</button>
    </div>`, (body) => {
    body.querySelector('#rank-btn').onclick = openRanking;
    body.querySelector('#acct-mng').onclick = P.openAccount;
    body.querySelector('#logout-btn').onclick = () => { logout(); toast('로그아웃했어요'); };
  }, { wide: true });
}
async function openRanking() {
  const r = await api('/ranking/omok');
  const list = r.ok ? r.ranking : [];
  openModal('오목 랭킹', list.length ? `<ol class="rank-table">${list.map((x) => `
    <li class="${S.user && x.username === S.user.username ? 'is-me' : ''}" data-user="${esc(x.username)}"><span class="rk">${x.rank}</span>
      <span class="rt" style="color:${x.tier.color}" title="${x.tier.name}">${tierIco(x.tier.icon)}</span>
      <b>${esc(x.nickname)}</b>${P.masterBadge(x.isMaster, true)}<span class="spacer"></span><span class="rr">${fmt(x.rating)}</span><small class="muted">${x.wins}승/${x.games}</small></li>`).join('')}</ol>`
    : '<p class="muted">아직 랭킹이 없어요. 로그인하고 오목을 둬 보세요!</p>', (b) => { RK.fitNames(b); b.querySelectorAll('[data-user]').forEach((li) => { li.onclick = () => RK.openPlayerCard({ game: 'omok', username: li.dataset.user }); }); }, { wide: true });
}
// 폼: 로그인했으면 계정 닉네임으로 고정
function applyMemberName(root) {
  const input = root.querySelector('input[name=name]');
  if (!input || !S.user) return;
  input.value = S.user.nickname;
  input.readOnly = true;
  input.classList.add('is-member');
  if (!root.querySelector('.member-note')) input.insertAdjacentHTML('afterend', `<small class="muted member-note">✓ 로그인한 닉네임으로 참가해요 · 전적이 기록돼요</small>`);
}
document.addEventListener('click', (e) => {
  if (e.target.closest('#acct-btn')) { if (S.user) openProfile(); else openLogin(); }
});
socket.on('rating', (list) => {
  const meId = S.state && S.state.me && S.state.me.id;
  const mine = list.find((x) => x.id === meId);
  if (!mine) return;
  const before = tierOf(mine.before), after = tierOf(mine.after);
  if (S.user) S.user.stats.omok.rating = mine.after;
  setTimeout(() => {
    if (after.name !== before.name) {
      banner(mine.delta > 0 ? '⬆ 티어 상승!' : '⬇ 티어 하락', `${after.name} · ${fmt(mine.after)}점`, mine.delta > 0 ? 'mywin' : 'level', 2600);
      if (mine.delta > 0) { sound.play('fanfare'); coinRain(30); }
    } else toast(`오목 점수 ${mine.delta >= 0 ? '+' : ''}${mine.delta} → ${fmt(mine.after)}점 · ${after.name}`, mine.delta >= 0 ? 'ok' : 'info');
  }, 2600);
});

async function boot() {
  loadMe().then(() => { if (S.view === 'home') render(); });
  fetch('/api/info').then((r) => r.json()).then((d) => { S.info = d; if (S.view === 'room' || S.view === 'home') render(); }).catch(() => {});
  const code = routeCode();
  if (!code) { S.view = 'home'; render(); return; }
  S.code = code;
  // 테스트 도구(scripts/bots.js --start)가 준 링크: ?t=토큰&p=아이디 → 저장 후 주소에서 지움
  const qs = new URLSearchParams(location.search);
  if (qs.get('t') && qs.get('p')) {
    LS.set(sessKey(code), { token: qs.get('t'), playerId: qs.get('p') });
    nav('/r/' + code);
  }
  S.session = LS.get(sessKey(code));
  if (S.session) {
    S.view = 'boot';
    render();
    if (socket.connected) resume(); // 아니면 connect 이벤트에서
    return;
  }
  await showJoin(code);
}

async function showJoin(code) {
  S.view = 'join';
  S.roomInfo = null;
  render();
  try {
    const r = await fetch('/api/room/' + code);
    const d = await r.json();
    if (!d.ok) { S.view = 'message'; S.message = d.message || '방을 찾을 수 없어요'; }
    else S.roomInfo = d;
  } catch {
    S.view = 'message'; S.message = '서버에 연결할 수 없어요';
  }
  render();
}

// ── 재연결: 서버가 잠깐 꺼지거나(배포) 연결이 끊겨도 방으로 자동 복귀 (최대 약 90초) ──
const RECONNECT_MS = 90 * 1000;
function reconnectOverlay(on, text) {
  let el = document.getElementById('reconnect');
  if (!on) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'reconnect';
    el.className = 'reconnect';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = text || `<div class="spinner" aria-hidden="true"></div><b>${S.restartMsg ? esc(S.restartMsg) : '재연결 중…'}</b><small>자리와 칩은 그대로 지켜 두고 있어요</small>`;
}
function reconnectGiveUp() {
  reconnectOverlay(true, `<div class="rc-icon"></div><b>방에 다시 들어가지 못했어요</b><small>인터넷 연결을 확인해 주세요. 방이 정리됐을 수도 있어요.</small>
    <div class="row"><button class="btn btn-gold" id="rc-retry">다시 시도</button><button class="btn btn-outline" id="rc-lobby">로비로</button></div>`);
  document.getElementById('rc-retry').onclick = () => { S.rcStart = Date.now(); reconnectOverlay(true); if (socket.connected) resume(); else socket.connect(); };
  document.getElementById('rc-lobby').onclick = () => {
    reconnectOverlay(false);
    S.rcStart = 0; S.restartMsg = '';
    if (S.code) LS.del(sessKey(S.code));
    S.session = null; S.state = null; S.code = null;
    nav('/'); S.view = S.game ? 'gamehome' : 'home'; render();
  };
}
async function resume() {
  if (!S.code || !S.session) return;
  const res = await new Promise((r) => socket.timeout(8000).emit('room:resume', { code: S.code, token: S.session.token }, (err, x) => r(err ? { ok: false, retry: true } : x)));
  if (res && res.ok) {
    S.rcStart = 0; S.restartMsg = '';
    reconnectOverlay(false);
    if (res.pending) { S.view = 'pending'; render(); }
    else S.view = 'room';
    return;
  }
  // 방에 있던 중이면(또는 방금 서버가 다시 켜졌으면) 바로 포기하지 않고 잠시 뒤 다시
  const inRoom = S.view === 'room' || S.view === 'boot' || S.rcStart;
  const gone = res && /만료|내보내/.test(res.message || '');
  if (inRoom && !gone) {
    S.rcStart = S.rcStart || Date.now();
    // 방에서 놀던 중이면 90초, 새로 연 링크(예전 방일 수 있음)는 10초만 기다린다
    if (Date.now() - S.rcStart < (S.wasInRoom === S.code ? RECONNECT_MS : 10000)) {
      reconnectOverlay(true);
      const tries = (S.rcTries = (S.rcTries || 0) + 1);
      setTimeout(() => { if (S.rcStart) resume(); }, Math.min(8000, 800 * 2 ** Math.min(tries, 4)));
      return;
    }
    reconnectGiveUp();
    return;
  }
  LS.del(sessKey(S.code));
  S.session = null;
  toast((res && res.message) || '다시 참가해 주세요', 'error');
  await showJoin(S.code);
}
socket.on('server:restarting', (m) => {
  S.restartMsg = (m && m.message) || '서버 업데이트 중 — 잠시 후 자동으로 돌아와요';
  if (S.view === 'room') { S.rcStart = Date.now(); reconnectOverlay(true); }
});

socket.on('connect', () => {
  S.connected = true;
  document.body.classList.remove('offline');
  clearTimeout(S.dcTimer);
  if (S.session && S.code) resume();
  else reconnectOverlay(false);
});
socket.on('disconnect', () => {
  S.connected = false;
  document.body.classList.add('offline');
  // 방 안에서 끊기면 1.5초 뒤에도 안 붙으면 "재연결 중…" (잠깐 끊김은 조용히)
  clearTimeout(S.dcTimer);
  if (S.view === 'room') S.dcTimer = setTimeout(() => { if (!S.connected) { S.rcStart = S.rcStart || Date.now(); reconnectOverlay(true); } }, 1500);
});
socket.on('state', (st) => {
  const first = !S.state || S.state.room.code !== st.room.code;
  if (!first && S.state.room.hostId && st.room.hostId && S.state.room.hostId !== st.room.hostId) {
    const nh = st.players.find((p) => p.id === st.room.hostId);
    if (nh) toast(nh.id === (st.me && st.me.id) ? '내가 새 방장이에요' : `${nh.name}님이 새 방장이에요`, 'ok');
  }
  if (!first && S.state.me && S.state.me.sittingOut && st.me && !st.me.sittingOut) toast('자리로 돌아왔어요', 'ok');
  S.state = st;
  S.wasInRoom = st.room.code;
  S.clockSkew = st.serverTime - Date.now();
  if (S.view !== 'room') S.view = 'room';
  processEvents(st, first);
  if (!first) guestHandNudge(st);
  render();
});
socket.on('joined', (d) => {
  S.session = { token: d.token, playerId: d.playerId };
  LS.set(sessKey(d.code), S.session);
  toast('참가가 승인됐어요!', 'ok');
});
socket.on('rejected', (d) => {
  LS.del(sessKey(S.code));
  S.session = null;
  S.view = 'message';
  S.message = d.message;
  render();
});
socket.on('kicked', (d) => {
  LS.del(sessKey(S.code));
  S.session = null;
  S.state = null;
  S.view = 'message';
  S.message = d.message || '방에서 나왔어요';
  render();
});

// ── 자리 비움 자동 복귀: 화면을 다시 보거나 아무 데나 누르면 (시간 초과·연결 끊김으로 비운 경우만) ──
function autoSitIn() {
  const me = S.state && S.state.me;
  if (S.view !== 'room' || !me || !me.sittingOut || me.awayReason === 'self' || S.sitInAt > Date.now() - 1500) return;
  S.sitInAt = Date.now();
  emit('game:sitin');
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(autoSitIn, 300); });
window.addEventListener('pointerdown', () => autoSitIn(), { capture: true, passive: true });

// ── 말하기: 섯다 "삥!" "따당!" "하프!" … · 홀덤 "콜" "레이즈" … + 말풍선 ──
const SD_CALL = { bbing: '삥', ddadang: '따당', half: '하프', call: '콜', die: '다이', check: '체크', allin: '올인', bet: '베팅', raise: '레이즈' };
const HD_CALL = { fold: '폴드', check: '체크', call: '콜', bet: '베팅', raise: '레이즈', allin: '올인' };
function actionCallout(st, e) {
  const game = gameOf(st);
  if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(e.type)) return;
  let key = e.type, text;
  if (game === 'seotda') {
    const bb = (st.room.tournament && st.room.tournament.running ? st.room.tournament.bb : st.room.settings.bb) || 0;
    if (e.type === 'fold') key = 'die';
    else if (e.type === 'bet') key = e.to <= bb ? 'bbing' : 'half';
    else if (e.type === 'raise') key = S.sdLastTo && e.to <= S.sdLastTo * 2 ? 'ddadang' : 'half';
    if (e.to) S.sdLastTo = Math.max(S.sdLastTo || 0, e.to);
    text = SD_CALL[key];
    sound.callout('seotda_' + key, text);
  } else {
    text = HD_CALL[e.type];
    // 홀덤은 원래 있던 음성(v_call 등)이 나옴 — 말풍선만
  }
  seatBubble(e.id, text + '!');
}
function seatBubble(id, text) {
  const seat = document.querySelector(`.seat[data-id="${id}"] .seat-av`) || document.querySelector(`.omok-player[data-id="${id}"]`);
  if (!seat || !text) return;
  const r = seat.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fx-say';
  el.textContent = text;
  el.style.left = Math.max(40, Math.min(innerWidth - 40, r.left + r.width / 2)) + 'px';
  el.style.top = Math.max(20, r.top - 6) + 'px';
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

// ── 손님에게 로그인 권하기 (막지 않음 · 닫으면 이 방에서는 안 뜸) ──
function guestNudgeHTML(st, compact = false) {
  if (!st || (S.info && S.info.accounts === false)) return '';
  const meRow = st.me && st.players.find((p) => p.id === st.me.id);
  if (!meRow) return '';
  if (meRow.memberNext) return `<div class="banner banner-info guest-nudge"><span>다음 판부터 전적·순위가 쌓여요</span></div>`;
  if (S.user || meRow.member) return '';
  let off = false;
  try { off = sessionStorage.getItem('gw:nudgeOff:' + st.room.code) === '1'; } catch {}
  if (off) return '';
  return `<div class="banner banner-gold guest-nudge ${compact ? 'is-compact' : ''}"><span>${compact ? '로그인하면 전적·순위가 쌓여요' : '로그인하면 이 판부터 전적·순위가 쌓여요'}</span>
    <button class="btn btn-sm btn-gold" data-nudge="quick">바로 시작</button><button class="btn btn-sm btn-outline" data-nudge="login">로그인</button><button class="icon-btn nudge-x" data-nudge="off" aria-label="닫기">✕</button></div>`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nudge]');
  if (!b) return;
  const k = b.dataset.nudge;
  if (k === 'quick') openQuickAccount();
  else if (k === 'login') openLogin();
  else if (k === 'off') {
    try { sessionStorage.setItem('gw:nudgeOff:' + (S.state && S.state.room.code), '1'); } catch {}
    b.closest('.guest-nudge').remove();
  }
});
// 손님이 판을 5번 끝낼 때마다 한 번 살짝 권하기
function guestHandNudge(st) {
  const h = st.hand;
  if (!h || !h.result || S.user || (S.info && S.info.accounts === false)) return;
  const key = st.room.code + ':' + h.no;
  if (S.nudgeHand === key) return;
  S.nudgeHand = key;
  S.guestHands = (S.guestHands || 0) + 1;
  if (S.guestHands % 5 === 0) setTimeout(() => toast('지금 로그인하면 순위에 올라가요 · 가입 없이 바로 시작도 돼요', 'info'), 3200);
}

// 사람을 누르면 선수 카드 (버튼은 제외)
document.addEventListener('click', (e) => {
  if (S.view !== 'room' || !S.state) return;
  if (e.target.closest('button, a, input, .emote-tray')) return;
  const el = e.target.closest('.seat[data-id], .omok-player[data-id], .list-row[data-pid]');
  if (!el) return;
  const pid = el.dataset.id || el.dataset.pid;
  const p = S.state.players.find((x) => x.id === pid);
  RK.openPlayerCard({ game: gameOf(S.state), code: S.state.room.code, pid, name: p && p.name });
});

// ── 감정 표현 ───────────────────────────────────────
// 감정 표현: 이모지 대신 짧은 말 (말풍선 색으로 구분)
const EMOTES = [['angry', '화났어!', '화남'], ['happy', '신난다!', '신남'], ['mock', '메롱~', '조롱'], ['laugh', 'ㅋㅋㅋ', '웃음'], ['cry', '엉엉', '울음'], ['clap', '짝짝짝', '박수']];
document.addEventListener('click', (e) => {
  const tray = document.getElementById('emote-tray');
  if (tray && !e.target.closest('#emote-tray') && !e.target.closest('#emote-btn')) tray.hidden = true;
});
socket.on('emote', (e) => {
  const def = EMOTES.find((x) => x[0] === e.kind);
  if (!def || S.view !== 'room') return;
  // 오목: 판을 가리지 않게 그 사람 이름표 오른쪽에 작게 / 카드 게임: 자리 위에
  const chip = document.querySelector(`.omok-player[data-id="${e.id}"]`);
  const seat = chip || document.querySelector(`.seat[data-id="${e.id}"] .seat-av`) || (S.state && S.state.me && S.state.me.id === e.id ? document.querySelector('.me-name') : null);
  if (!seat) return;
  const el = document.createElement('div');
  el.className = `fx-emote fx-emote-${e.kind} ${chip ? 'fx-emote-side' : ''}`;
  el.innerHTML = `<span class="emote-say">${def[1]}</span>`;
  const r = seat.getBoundingClientRect();
  el.style.left = (chip ? Math.min(innerWidth - 30, r.right + 26) : r.left + r.width / 2) + 'px';
  el.style.top = (r.top + r.height / 2) + 'px';
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 2100);
  if (e.kind === 'clap') sound.play('clap'); else { sound.play('pop'); sound.play('e_' + e.kind); }
});

// ── 소리·애니메이션 트리거 ─────────────────────────────
function tourneyEffects(st) {
  const tn = st.room.tournament;
  if (!tn) return;
  if (tn.running) {
    if (S.lastLevel && tn.level > S.lastLevel) {
      banner('⬆ 블라인드 상승!', `레벨 ${tn.level} · <b>${fmt(tn.sb)}/${fmt(tn.bb)}</b>`, 'level', 2200);
      sound.play('stamp');
    }
    S.lastLevel = tn.level;
  }
  if (tn.result && tn.result.at !== S.tourneyShown) {
    const fresh = S.tourneyShown !== undefined || Date.now() + (S.clockSkew || 0) - tn.result.at < 60000;
    S.tourneyShown = tn.result.at;
    S.lastLevel = 0;
    if (!fresh) return;
    const medal = ['', '', ''];
    const meId = st.me && st.me.id;
    openModal('토너먼트 결과', `
      <ol class="rank-list">${tn.result.ranking.map((r) => `<li class="${r.id === meId ? 'is-me' : ''}"><span class="rank-medal">${medal[r.place - 1] || r.place + '위'}</span><b>${esc(r.name)}</b>${r.id === meId ? ' <span class="muted small">(나)</span>' : ''}</li>`).join('')}</ol>
      <button class="btn btn-gold btn-lg" data-close>확인</button>`);
    sound.play('fanfare');
    if (tn.result.ranking[0] && tn.result.ranking[0].id === meId) { coinRain(70); sound.play('coins'); }
  }
}

function processEvents(st, first) {
  tourneyEffects(st);
  const feed = st.feed || [];
  const maxSeq = feed.length ? feed[feed.length - 1].seq : 0;
  if (first || S.lastSeq === null) { S.lastSeq = maxSeq; return; }
  const meId = st.me && st.me.id;
  const fresh = feed.filter((e) => e.seq > S.lastSeq);
  S.lastSeq = Math.max(S.lastSeq, maxSeq);
  let delay = 0;
  for (const e of fresh) {
    if (e.type === 'info') {
      if (/번째 판 시작/.test(e.text)) {
        const n = Math.min(18, (st.hand ? st.players.filter((p) => ['inhand', 'allin'].includes(p.status)).length : 2) * 2);
        for (let i = 0; i < n; i++) setTimeout(() => sound.play('deal'), delay + 150 + i * 85);
      }
      continue;
    }
    if (e.type === 'allin') setTimeout(() => allinStamp(e.id), delay);
    const iWon = e.type === 'end' && e.winners && e.winners.includes(meId);
    if (e.type === 'street' || e.type === 'end') S.sdLastTo = 0;
    const sd = gameOf(st) === 'seotda';
    setTimeout(() => { if (!sd || !['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(e.type)) sound.playForEvent(e, { isMe: e.id === meId, iWon }); else sound.play(e.type === 'fold' ? 'fold' : e.type === 'check' ? 'check' : e.type === 'allin' ? 'allin' : 'chips'); actionCallout(st, e); }, delay);
    delay += 160;
  }
  const turnId = st.hand && st.hand.toActId;
  if (turnId && turnId === meId && S.lastTurnId !== meId) {
    sound.play('turn');
    if (sound.isUnlocked()) gws.vibrate(60);
  }
  S.lastTurnId = turnId;
}

function flyPotTo(winners) {
  setTimeout(() => {
    const pot = document.querySelector('.pot-chip');
    if (!pot) return;
    for (const w of winners || []) {
      const seat = document.querySelector(`.seat[data-id="${w}"]`);
      if (!seat) continue;
      const a = pot.getBoundingClientRect();
      const b = seat.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'fly-chip';
      el.style.left = a.left + a.width / 2 + 'px';
      el.style.top = a.top + a.height / 2 + 'px';
      document.body.appendChild(el);
      requestAnimationFrame(() => {
        el.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.7)`;
        el.style.opacity = '0.2';
      });
      setTimeout(() => el.remove(), 900);
    }
  }, 350);
}

// ── 화면 그리기 ───────────────────────────────────────
// 다른 화면으로 바뀔 때만 살짝 페이드 인 (같은 화면을 다시 그릴 때는 그대로)
function animateIn(soft) {
  if (gws.reduceMotion()) return;
  const cls = soft ? 'view-in-soft' : 'view-in';
  $app.classList.remove('view-in', 'view-in-soft');
  void $app.offsetWidth;
  $app.classList.add(cls);
  clearTimeout(animateIn.t);
  animateIn.t = setTimeout(() => $app.classList.remove(cls), 400);
}
function render() {
  const vkey = S.view === 'room' ? 'room:' + (S.state ? S.state.room.phase : '-') : S.view;
  if (vkey !== S.lastVKey) { const first = !S.lastVKey || S.lastVKey === 'boot'; S.lastVKey = vkey; if (!first || vkey !== 'home') animateIn(S.view === 'room'); }
  if (S.view !== 'room') S.gameMounted = false;
  document.body.dataset.theme = S.view === 'room' && S.state ? gameOf(S.state) : S.view === 'home' || S.view === 'admin' ? 'hub' : (S.game || 'holdem');
  document.body.classList.toggle('in-room', S.view === 'room');
  // 배경음악: 메인은 메인 곡, 게임 화면·게임방은 그 게임 곡
  const th = document.body.dataset.theme;
  sound.setTrack(th === 'hub' ? 'bgm_hub' : th === 'holdem' ? 'bgm' : 'bgm_' + th);
  switch (S.view) {
    case 'boot': $app.innerHTML = `<div class="center-screen">${logoHTML()}<p class="muted">불러오는 중…</p></div>`; break;
    case 'home': renderHome(); break;
    case 'gamehome': renderGameHome(); break;
    case 'create': renderCreate(); break;
    case 'practice': renderPractice(); break;
    case 'join': renderJoin(); break;
    case 'pending': renderPending(); break;
    case 'message': renderMessage(); break;
    case 'admin': P.renderAdmin(); break;
    case 'room':
      if (!S.state) { $app.innerHTML = `<div class="center-screen">${logoHTML()}<p class="muted">방에 들어가는 중…</p></div>`; break; }
      if (S.state.room.phase === 'lobby') renderLobby(); else renderGame();
      break;
    default: break;
  }
}

function logoHTML(small = false) {
  return `<div class="logo ${small ? 'logo-sm' : ''}">
    <img class="logo-icon" src="/img/gw2-icon-192.png" alt="" onerror="this.remove()">
    <div class="logo-text">${small ? '<span class="logo-ko">게임월드</span>' : '<span class="logo-ko logo-pop" data-text="찬이의 게임월드">찬이의 게임월드</span>'}<span class="logo-en">CHAN'S GAME WORLD</span></div>
  </div>`;
}

const GAME_INFO = {
  langbang: { name: '랑방 대전', icon: '', sub: '스테이지 디펜스 · 30스테이지 · 랭킹', tag: '우리 모임에 쳐들어오는 진상들을 때려잡자', href: '/langbang/', best: true },
  holdem: { name: '텍사스 홀덤', icon: '♠', sub: '노리밋 홀덤 · 토너먼트', tag: '카드 2장 + 바닥 5장, 최고의 5장으로 승부' },
  seotda: { name: '섯다', icon: '', sub: '화투 두 장 · 광땡 · 땡잡이', tag: '두 장의 화투로 끗발 대결, 기세로 밀어붙여라' },
  omok: { name: '오목', icon: '', sub: '1:1 대국 · AI · 티어', tag: '다섯 알을 먼저 잇는 사람이 승리' },
};
const GAME_RULES = {
  holdem: '<p>각자 카드 2장을 받고, 바닥에 5장이 차례로 깔려요. 7장 중 가장 좋은 5장으로 족보를 겨뤄요.</p><p>베팅: 체크(넘기기) · 콜(따라가기) · 레이즈(올리기) · 폴드(포기) · 올인</p><p>토너먼트는 시간마다 블라인드가 올라가고, 칩을 다 잃으면 탈락해요.</p>',
  seotda: '<p><b>두 장 섯다</b>: 모두 판돈을 내고 화투 두 장씩 받아요. 한 바퀴 베팅한 뒤 족보가 높은 사람이 판돈을 가져가요.</p><p><b>세 장 섯다</b>: 두 장을 받고 1차 베팅, 한 장을 더 받고 2차 베팅. 세 장 중 가장 좋은 두 장으로 승부해요(자동으로 골라 줘요). 방 설정 <b>세장섯다 공개</b>가 <b>한 장 공개</b>(기본)면: 두 장을 받자마자 한 장을 골라 모두에게 공개(10초, 안 고르면 낮은 카드), 1차 베팅 → 세 번째 카드(뒷면) → 2차 베팅 → 세 장 중 두 장을 직접 골라 승부(10초, 안 고르면 가장 좋은 두 장). <b>공개 없음</b>이면 쇼다운 전까지 아무 카드도 공개되지 않고 두 장은 자동으로 골라요. 내 화면에 앞면으로 보이는 카드는 나만 봐요.</p><p>베팅: 다이(포기) · 체크 · 삥(판돈만큼) · 콜 · 따당(두 배) · 하프(판의 절반 더) · 올인</p><p>족보는 게임 안의 <b>족보표</b>에서 볼 수 있어요. 구사가 나오면 판돈을 걸고 재경기해요.</p>',
  omok: '<p>흑이 먼저 두고, 가로·세로·대각선으로 <b>정확히 다섯 알</b>을 먼저 이으면 이겨요.</p><p>흑은 <b>삼삼</b>(열린 3이 두 개 생기는 자리)에 둘 수 없어요. 흑의 여섯 알(장목)은 승리가 아니에요.</p><p>로그인하면 대국마다 점수가 오르내리고 티어가 정해져요.</p>',
};
// ── 게임 그림: 랑방 대전은 내 진행 챕터(langbang:chapter, 랑방 화면이 저장)에 맞는 키 아트 ──
const lbChapter = () => { const n = Math.trunc(Number(LS.get('langbang:chapter', 1))); return n >= 1 && n <= 6 ? n : 1; };
const gameArt = (g) => (g === 'langbang' ? `/img/lb/keyart${lbChapter()}.webp` : `/img/games/${g}.webp`);
// 키 아트가 없으면 뒤에 깔린 기본 그림이 보인다
const gameArtCSS = (g) => (g === 'langbang' ? `url('${gameArt(g)}'), url('/img/games/langbang.webp')` : `url('${gameArt(g)}')`);
function gameCardArtHTML(k) {
  if (k !== 'langbang') return `<span class="gc-art" style="background-image:${gameArtCSS(k)}"></span>`;
  // 챕터가 바뀌었으면 예전 그림에서 새 그림으로 부드럽게 바뀌게
  const cur = lbChapter();
  const prev = Number(LS.get('gw:lbArtShown', 0));
  LS.set('gw:lbArtShown', cur);
  if (!prev || prev === cur || prev < 1 || prev > 6) return `<span class="gc-art" style="background-image:${gameArtCSS(k)}"></span>`;
  return `<span class="gc-art" style="background-image:url('/img/lb/keyart${prev}.webp'), url('/img/games/langbang.webp')"></span>`
    + `<span class="gc-art gc-art-next" style="background-image:${gameArtCSS(k)}"></span>`;
}
// 다른 탭·뒤로 오기로 챕터가 바뀐 채 메인이 보이면 카드 그림만 다시
window.addEventListener('storage', (e) => { if (e.key === 'langbang:chapter' && S.view === 'home') render(); });

// ── 게임 들어가기: 메인이 살짝 작아지며 사라지고 → 게임 그림 로딩 화면 → 게임 화면 ──
const GAME_ASSETS = { holdem: ['/img/felt.webp'], seotda: ['/img/bg-seotda.webp', '/img/felt-seotda.webp'], omok: ['/img/bg-omok.webp'], langbang: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const preloadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = src; });
function enterGame(g) { S.game = g; LS.set('chandem:game', g); nav('/'); S.view = 'gamehome'; render(); }
async function launchGame(g) {
  const info = GAME_INFO[g];
  if (!info || S.launching) return;
  if (gws.reduceMotion()) { if (info.href) location.href = info.href; else enterGame(g); return; }
  S.launching = true;
  if (info.href) {
    // 랑방 대전은 자기 로딩 화면이 있어서: 메인 로딩 화면 없이 짧게 어두워졌다가 바로 이동 (하얀 번쩍임 없게)
    document.documentElement.classList.add('gw-leave-dark');
    setTimeout(() => { location.href = info.href; }, 220);
    return;
  }
  $app.classList.add('view-out');
  const ov = document.createElement('div');
  ov.className = 'gw-loader';
  ov.setAttribute('role', 'status');
  ov.innerHTML = `<div class="gl-art" style="background-image:${gameArtCSS(g)}"></div><div class="gl-shade"></div>
    <div class="gl-box"><span class="gl-icon">${P.hubIcon(HUB_GAME_ICON[g] || 'cards', 'hic-lg')}</span><span class="logo-pop gl-name" data-text="${esc(info.name)}">${esc(info.name)}</span>
      <div class="gl-bar"><i></i></div><small>${esc(info.tag)}</small></div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('show'));
  const bar = ov.querySelector('.gl-bar i');
  const jobs = [gameArt(g), ...(GAME_ASSETS[g] || [])].map(preloadImg);
  if (info.href) jobs.push(fetch(info.href).then((r) => r.text()).catch(() => {})); // 랑방 대전 페이지를 미리 받아 둔다
  let n = 0;
  jobs.forEach((j) => j.then(() => { n++; bar.style.width = Math.round((n / jobs.length) * 85) + '%'; }));
  requestAnimationFrame(() => { bar.style.width = '12%'; });
  await Promise.all([Promise.race([Promise.all(jobs), wait(2500)]), wait(info.href ? 750 : 650)]);
  bar.style.width = '100%';
  if (info.href) { await wait(140); location.href = info.href; return; } // 로딩 화면은 그대로 두고 이동 (랑방 쪽이 페이드 인)
  await wait(120);
  ov.classList.add('hide'); // 먼저 터치를 통과시키고
  $app.classList.remove('view-out');
  enterGame(g);
  setTimeout(() => ov.remove(), 320);
  S.launching = false;
}

// 게임별 입장 화면
// ── 지금 열린 방 목록 (5초마다 새로고침) ──────────────
function roomItemHTML(r) {
  const info = GAME_INFO[r.game] || GAME_INFO.holdem;
  const full = r.players >= r.maxPlayers;
  const status = r.practice ? 'AI와 연습 중' : r.phase === 'playing' ? (r.tournament ? '토너먼트 중' : `게임 중${r.handNo ? ` · ${r.handNo}판째` : ''}`) : '대기 중';
  const sub = r.game === 'seotda' ? ` · ${r.cards === 3 ? '세 장' : '두 장'}` : '';
  const canJoin = !r.practice && !full && !(r.tournament && r.phase === 'playing');
  return `<div class="lr-item">
    <span class="lr-icon">${P.hubIcon(HUB_GAME_ICON[r.game] || 'spade')}</span>
    <div class="lr-main"><b>${esc(r.hostName || '방장')}님의 ${info.name}${sub}</b>${r.hasPassword ? P.hubIcon('lock', 'hic-xs') : ''}
      <small>${status} · ${r.players}/${r.maxPlayers}명${r.spectators ? ` · 관전 ${r.spectators}` : ''}${r.bots ? ` · 봇 ${r.bots}` : ''}</small></div>
    <div class="lr-btns">
      <button class="btn btn-sm btn-outline" data-watch="${esc(r.code)}">관전</button>
      ${canJoin ? `<button class="btn btn-sm btn-gold" data-enter="${esc(r.code)}">${r.phase === 'playing' ? '참가 신청' : '참가'}</button>` : ''}
    </div></div>`;
}
async function loadRoomList(game) {
  const box = document.querySelector('#live-rooms .lr-list');
  if (!box) return false;
  try {
    const r = await (await fetch('/api/rooms' + (game ? `?game=${encodeURIComponent(game)}` : ''), { cache: 'no-store' })).json();
    const list = (r.rooms || []).filter((x) => !x.practice || x.phase === 'playing');
    box.innerHTML = list.length ? list.map(roomItemHTML).join('') : `<p class="muted small">지금 열린 방이 없어요. 방을 만들어 친구를 불러 보세요!</p>`;
  } catch { box.innerHTML = '<p class="muted small">목록을 불러오지 못했어요</p>'; }
  box.querySelectorAll('[data-watch],[data-enter]').forEach((b) => {
    b.onclick = () => {
      S.wantSpectate = !!b.dataset.watch;
      nav('/r/' + (b.dataset.watch || b.dataset.enter));
      boot();
    };
  });
  return true;
}
function startRoomList(game) {
  clearInterval(S.roomListTimer);
  loadRoomList(game);
  S.roomListTimer = setInterval(async () => { if (!(await loadRoomList(game))) clearInterval(S.roomListTimer); }, 5000);
}

function renderGameHome() {
  const g = S.game || 'holdem';
  const info = GAME_INFO[g];
  $app.innerHTML = `
  <main class="home game-home">
    <div class="top-bar"><button class="btn btn-sm btn-outline" id="to-hub">‹ 게임 선택</button>${SHARE_BTN}</div>
    ${S.info && S.info.accounts === false ? '' : RK.hallHTML(g)}
    <div class="gh-hero" style="background-image:url('/img/games/${g}.webp')"><div class="gh-shade"></div>
      <div class="gh-title"><span class="gh-icon">${P.hubIcon(HUB_GAME_ICON[g] || 'cards', 'hic-lg')}</span><h1>${info.name}</h1><p>${info.tag}</p></div>
    </div>
    <section class="panel">
      <button class="btn btn-gold btn-lg" id="go-create">친구와 방 만들기</button>
      <button class="btn btn-outline btn-lg" id="go-practice">${g === 'omok' ? 'AI와 대국하기' : 'AI와 연습하기'}</button>
      <div class="row">
        <button class="btn btn-ghost grow" id="go-rules">게임 방법</button>
        ${g === 'omok' ? '<button class="btn btn-ghost grow" id="go-rank">랭킹</button>' : ''}
      </div>
    </section>
    <section class="panel live-rooms" id="live-rooms"><h2 class="sec-title">지금 열린 ${info.name} 방</h2><div class="lr-list"><p class="muted small">불러오는 중…</p></div></section>
    <p class="fine">${g === 'omok' ? '로그인하면 대국 결과로 티어가 올라가요.' : '칩은 현금 가치가 없는 친목용 점수예요. 입금·출금·환전 기능은 없어요.'}</p>
  </main>`;
  bindCommon();
  startRoomList(g);
  if (document.getElementById('hall')) RK.loadHall(g);
  $app.querySelector('#to-hub').onclick = () => { S.view = 'home'; nav('/'); render(); };
  $app.querySelector('#go-create').onclick = () => { nav('/'); S.view = 'create'; render(); };
  $app.querySelector('#go-practice').onclick = () => { nav('/'); S.view = 'practice'; render(); };
  $app.querySelector('#go-rules').onclick = () => openModal(`${info.name} 게임 방법`, `<div class="rules">${GAME_RULES[g]}</div>`);
  const rk = $app.querySelector('#go-rank');
  if (rk) rk.onclick = () => (S.info && S.info.accounts === false ? toast('랭킹은 로그인 기능이 켜지면 볼 수 있어요') : openRanking());
}

// ── 메인(허브): 모바일 게임 런처처럼 ──
const HUB_GAME_ICON = { holdem: 'spade', seotda: 'hwatu', omok: 'omok', langbang: 'cards' };
function hubAcctHTML() {
  if (S.info && S.info.accounts === false) return '<span></span>';
  if (!S.user) return `<button class="hub-acct tap" id="acct-btn">${P.hubIcon('lock')}<b>로그인</b></button>`;
  const t = tierOf(S.user.stats.omok.rating);
  return `<button class="hub-acct tap is-user ${S.user.isMaster ? 'is-master' : ''}" id="acct-btn" title="내 전적">${S.user.isMaster ? P.hubIcon('crown') : `<span class="acct-dot" style="--tc:${t.color}"></span>`}<b class="acct-name">${esc(S.user.nickname)}</b></button>`;
}
function hubCardHTML(k, g) {
  const hero = k === 'langbang';
  const rm = gws.reduceMotion();
  const media = hero
    ? `${gameCardArtHTML(k)}${rm ? '' : '<video class="gc-video" muted loop playsinline preload="metadata" poster="/img/lb/title_poster.jpg?v=3" aria-hidden="true" disablepictureinpicture><source src="/img/lb/title_loop.mp4?v=3" type="video/mp4"></video>'}`
    : gameCardArtHTML(k);
  const title = hero
    ? '<img class="gc-logo" src="/img/lb/logo_langbang.webp" alt="랑방 대전" onerror="this.replaceWith(Object.assign(document.createElement(\'b\'),{className:\'gc-title\',textContent:\'랑방 대전\'}))">'
    : `<b class="gc-title">${esc(g.name)}</b>`;
  return `
    <button class="game-card hub-card game-card-${k} ${hero ? 'is-hero' : ''} ${g.best ? 'is-best' : ''} tap" data-game="${k}">
      ${media}
      <span class="gc-shade"></span>
      ${g.best ? '<span class="gc-ribbon" aria-label="베스트 게임"><span>BEST</span></span>' : ''}
      <span class="gc-body">
        <span class="gc-head">${hero ? '' : `<span class="gc-badge">${P.hubIcon(HUB_GAME_ICON[k])}</span>`}${title}</span>
        <small class="gc-sub">${esc(g.sub)}</small>
        <span class="gc-chips" data-live="${k}">${hero ? '<span class="gc-chip">혼자 즐기는 스테이지 디펜스</span>' : '<span class="gc-chip">지금 바로 시작</span>'}</span>
      </span>
      <span class="gc-enter">입장${P.hubIcon('arrow', 'hic-sm')}</span>
    </button>`;
}
// 게임 카드에 '지금 열린 방 · 몇 명' 표시
async function loadHubLive() {
  try {
    const r = await (await fetch('/api/rooms', { cache: 'no-store' })).json();
    const by = {};
    for (const x of r.rooms || []) {
      if (x.practice) continue;
      const g = (by[x.game] = by[x.game] || { rooms: 0, players: 0 });
      g.rooms++; g.players += x.players - (x.bots || 0);
    }
    for (const k of ['holdem', 'seotda', 'omok']) {
      const el = document.querySelector(`[data-live="${k}"]`);
      if (!el) continue;
      const v = by[k];
      el.innerHTML = v ? `<span class="gc-chip is-live"><i class="live-dot"></i>방 ${v.rooms}개</span><span class="gc-chip">${v.players}명 플레이 중</span>` : '<span class="gc-chip">지금 바로 시작</span>';
    }
  } catch {}
}
// 누를 때: 살짝 눌리고 물결 + 딸깍 소리 (메인 화면)
document.addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.hub2 .tap');
  if (!el) return;
  if (!gws.reduceMotion()) {
    const r = el.getBoundingClientRect();
    const d = Math.max(r.width, r.height) * 1.2;
    const rip = document.createElement('span');
    rip.className = 'ripple';
    rip.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    el.appendChild(rip);
    setTimeout(() => rip.remove(), 520);
  }
  sound.play('tap');
}, { passive: true });

function renderHome() {
  const last = LS.get('chandem:name', '');
  $app.innerHTML = `
  <main class="home hub2">
    <div class="top-bar hub-top">${hubAcctHTML()}<span class="top-btns">${isStandalone() ? '' : '<button class="hub-pill-btn tap install-btn" id="install-btn" aria-label="앱 설치">앱 설치</button>'}<button class="hub-ico tap" id="share-top" aria-label="공유하기">${P.hubIcon('link')}</button>${P.topIconsHTML()}</span></div>
    <header class="hub-hero">
      <img class="hub-logo" src="/img/hub/logo_world.webp" width="1100" height="594" alt="찬이의 게임월드 CHAN'S GAME WORLD" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
      <div class="hub-logo-text" hidden><span class="logo-pop hub-logo-ko" data-text="찬이의 게임월드">찬이의 게임월드</span><span class="hub-logo-en">CHAN'S GAME WORLD</span></div>
      <p class="hub-tagline">친구들과 휴대폰으로 즐기는 우리들의 게임월드</p>
    </header>
    ${iosInAppBannerHTML()}
    <div id="hub-extras">${P.hubExtrasHTML()}</div>
    <section class="game-cards hub-cards">
      ${Object.entries(GAME_INFO).filter(([k]) => k !== 'langbang' || (S.info && S.info.langbang)).map(([k, g]) => hubCardHTML(k, g)).join('')}
    </section>
    <section class="panel live-rooms" id="live-rooms"><h2 class="sec-title hub-sec"><i class="live-dot"></i>지금 열린 방</h2><div class="lr-list"><p class="muted small">불러오는 중…</p></div></section>
    <section class="panel">
      <div class="divider"><span>초대 코드로 참가</span></div>
      <form id="code-form" class="row">
        <label class="sr-only" for="code-in">방 코드</label>
        <input id="code-in" class="input code-input" maxlength="6" placeholder="방 코드 6자리" autocomplete="off" autocapitalize="characters">
        <button class="btn btn-outline">참가</button>
      </form>
      ${last ? `<p class="muted small">최근 닉네임: ${esc(last)}</p>` : ''}
    </section>
    <p class="fine">칩은 현금 가치가 없는 친목용 점수예요. 입금·출금·환전 기능은 없어요.</p>
  </main>`;
  bindCommon();
  P.bindHub($app);
  P.afterHome();
  if (!(S.info && S.info.accounts === false)) RK.loadHubChamps();
  startRoomList('');
  loadHubLive();
  // 영상이 재생되지 않는 기기(절전 모드 등): 멈춘 첫 장면(포스터)만 보이게
  // 랑방 대전 타이틀 영상: 카드가 화면에 보일 때만 재생 (안 보이면 멈춤 · 데이터 아끼기)
  const v = $app.querySelector('.gc-video');
  if (v) {
    v.muted = true;
    v.addEventListener('playing', () => v.classList.add('on'), { once: true });
    const go = (on) => { if (on) { const pl = v.play(); if (pl && pl.catch) pl.catch(() => {}); } else v.pause(); };
    if ('IntersectionObserver' in window) {
      const io2 = new IntersectionObserver((es) => { for (const e of es) go(e.isIntersecting && !document.hidden); }, { threshold: 0.35 });
      io2.observe(v.closest('.hub-card'));
      document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); }, { once: false });
    } else go(true);
  }
  $app.querySelectorAll('[data-game]').forEach((b) => { b.onclick = () => launchGame(b.dataset.game); });
  $app.querySelector('#code-form').onsubmit = (e) => {
    e.preventDefault();
    const code = $app.querySelector('#code-in').value.trim().toUpperCase();
    if (code.length < 4) { toast('방 코드를 확인해 주세요', 'error'); return; }
    nav('/r/' + code);
    boot();
  };
}

const GAME_NAMES = { holdem: '♠ 텍사스 홀덤', seotda: '섯다', omok: '오목' };
const gameOf = (st) => (st && st.room && st.room.settings && st.room.settings.game) || 'holdem';
function gamePickHTML(cur, name = 'game') {
  return `<div class="seg game-pick">${Object.entries(GAME_NAMES).map(([k, t]) => `<label class="seg-opt"><input type="radio" name="${name}" value="${k}" ${cur === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
}

function settingsFormHTML(s, { forCreate = false } = {}) {
  return `
  ${forCreate ? `
  <fieldset class="fieldset ${S.game ? 'hidden-pick' : ''}"><legend>게임</legend>${gamePickHTML(S.game || s.game || 'holdem')}
    <p class="muted small" data-game-note></p></fieldset>
  <label class="field"><span>내 닉네임</span>
    <input class="input" name="name" maxlength="10" required value="${esc(LS.get('chandem:name', ''))}" placeholder="최대 10자"></label>
  ${avatarPickerHTML()}` : ''}
  <fieldset class="fieldset seotda-only">
    <legend>섯다 방식</legend>
    <div class="seg">
      <label class="seg-opt"><input type="radio" name="cards" value="2" ${Number(s.cards || 2) !== 3 ? 'checked' : ''}><span>두 장 섯다<small>두 장 받고 한 번 베팅</small></span></label>
      <label class="seg-opt"><input type="radio" name="cards" value="3" ${Number(s.cards) === 3 ? 'checked' : ''}><span>세 장 섯다<small>한 장 더 받고 좋은 두 장</small></span></label>
    </div>
    <div class="sd3-only">
      <div class="field-lbl">세장섯다 공개</div>
      <div class="seg">
        <label class="seg-opt"><input type="radio" name="sdOpen" value="one" ${s.sdOpen !== 'none' ? 'checked' : ''}><span>한 장 공개<small>기본 · 한게임·피망 방식</small></span></label>
        <label class="seg-opt"><input type="radio" name="sdOpen" value="none" ${s.sdOpen === 'none' ? 'checked' : ''}><span>공개 없음<small>두 장 자동 선택</small></span></label>
      </div>
      <p class="muted tiny">한 장 공개: 두 장 중 한 장을 골라 모두에게 보여 준 뒤 베팅, 세 번째 카드를 받고 다시 베팅, 마지막에 세 장 중 두 장을 골라 승부 (한게임·피망 방식). 공개 없음: 공개·고르기 없이 가장 좋은 두 장이 자동</p>
    </div>
  </fieldset>
  <fieldset class="fieldset chips-only">
    <legend>게임 방식</legend>
    <div class="seg">
      <label class="seg-opt"><input type="radio" name="mode" value="cash" ${s.mode !== 'tournament' ? 'checked' : ''}><span>일반<small>리바인 가능</small></span></label>
      <label class="seg-opt"><input type="radio" name="mode" value="tournament" ${s.mode === 'tournament' ? 'checked' : ''}><span>토너먼트<small>블라인드 상승·탈락</small></span></label>
    </div>
    <label class="field"><span>토너먼트 블라인드 오르는 간격</span>
      <select class="input" name="levelMinutes">${[3, 5, 7, 10, 15].map((m) => `<option value="${m}" ${Number(s.levelMinutes || 5) === m ? 'selected' : ''}>${m}분마다</option>`).join('')}</select></label>
    <p class="muted small">토너먼트는 정해진 시간마다 블라인드가 올라가고, 칩을 다 잃으면 탈락해요. 마지막까지 남은 사람이 우승이에요.</p>
  </fieldset>
  <div class="grid2 chips-only">
    <label class="field"><span>시작 칩</span><input class="input" type="number" inputmode="numeric" name="startChips" min="100" value="${s.startChips}"></label>
    <label class="field"><span>턴 제한시간(초)</span><input class="input" type="number" inputmode="numeric" name="turnSeconds" min="10" max="120" value="${s.turnSeconds}"></label>
    <label class="field holdem-only-f"><span>스몰 블라인드</span><input class="input" type="number" inputmode="numeric" name="sb" min="1" value="${s.sb}"></label>
    <label class="field"><span><span class="holdem-only-f">빅 블라인드</span><span class="seotda-only-f">기본 판돈 (삥)</span></span><input class="input" type="number" inputmode="numeric" name="bb" min="1" value="${s.bb}"></label>
    <label class="field"><span>최소 인원</span><input class="input" type="number" inputmode="numeric" name="minPlayers" min="2" max="9" value="${s.minPlayers}"></label>
    <label class="field"><span>최대 인원</span><input class="input" type="number" inputmode="numeric" name="maxPlayers" min="2" max="9" value="${s.maxPlayers}"></label>
  </div>
  <fieldset class="fieldset chips-only">
    <legend>리바인</legend>
    <label class="switch"><input type="checkbox" name="rebuyEnabled" ${s.rebuyEnabled ? 'checked' : ''}><span>리바인 허용</span></label>
    <div class="grid2">
      <label class="field"><span>리바인 금액</span><input class="input" type="number" inputmode="numeric" name="rebuyAmount" min="1" value="${s.rebuyAmount}"></label>
      <label class="field"><span>1인당 최대 횟수</span><input class="input" type="number" inputmode="numeric" name="rebuyMax" min="1" max="99" value="${s.rebuyMax}"></label>
    </div>
    <p class="muted small">칩이 시작 칩의 절반보다 적거나 다 떨어졌을 때 신청할 수 있어요. 진행 중인 판에는 영향이 없고 다음 판부터 적용돼요.</p>
  </fieldset>
  <fieldset class="fieldset">
    <legend>입장 제한 (선택)</legend>
    <label class="field"><span>비밀번호</span><input class="input" name="password" maxlength="20" value="${esc(s.password || '')}" placeholder="비워두면 없음" autocomplete="off"></label>
    <label class="switch"><input type="checkbox" name="approval" ${s.approval ? 'checked' : ''}><span>방장이 참가를 승인</span></label>
  </fieldset>`;
}

// 게임 고르기에 따라 설정 칸 보이기/숨기기
function bindGamePick(form, name = 'game') {
  const notes = { holdem: '노리밋 텍사스 홀덤. 개인 카드 2장 + 바닥 5장.', seotda: '화투 두 장 섯다. 판돈(빅 블라인드 금액)을 걸고 한 바퀴 베팅해요.', omok: '두 사람이 오목을 둬요. 나머지는 관전해요. 흑은 삼삼 금지.' };
  const upd = () => {
    const g = (form.querySelector(`input[name=${name}]:checked`) || {}).value || 'holdem';
    form.dataset.game = g;
    const n = form.querySelector('[data-game-note]');
    if (n) n.textContent = notes[g];
  };
  form.querySelectorAll(`input[name=${name}]`).forEach((r) => { r.onchange = upd; });
  upd();
  bindSd3(form);
}
// 세 장 섯다를 고르면 '세장섯다 공개' 칸을 보인다
function bindSd3(form) {
  const upd = () => { const c = form.querySelector('input[name=cards]:checked, input[name=pcards]:checked'); if (c && c.value === '3') form.dataset.sd3 = '1'; else delete form.dataset.sd3; };
  form.querySelectorAll('input[name=cards], input[name=pcards]').forEach((r) => r.addEventListener('change', upd));
  upd();
}

function readSettings(form) {
  const fd = new FormData(form);
  const num = (k) => Number(fd.get(k));
  // 섯다는 스몰 블라인드가 없다: 기본 판돈(삥) = 빅 블라인드 칸
  if ((fd.get('game') || form.dataset.game) === 'seotda') fd.set('sb', fd.get('bb'));
  return {
    startChips: num('startChips'), turnSeconds: num('turnSeconds'), sb: num('sb'), bb: num('bb'),
    minPlayers: num('minPlayers'), maxPlayers: num('maxPlayers'),
    rebuyEnabled: fd.get('rebuyEnabled') === 'on', rebuyAmount: num('rebuyAmount'), rebuyMax: num('rebuyMax'),
    password: String(fd.get('password') || ''), approval: fd.get('approval') === 'on',
    mode: fd.get('mode') === 'tournament' ? 'tournament' : 'cash', levelMinutes: num('levelMinutes') || 5,
    ...(fd.get('game') ? { game: fd.get('game') } : {}),
    cards: Number(fd.get('cards')) === 3 ? 3 : 2,
    sdOpen: fd.get('sdOpen') === 'none' ? 'none' : 'one',
  };
}

function validateSettings(s) {
  if (!(s.startChips >= 100)) return '시작 칩은 100 이상이어야 해요';
  if (!(s.sb >= 1) || !(s.bb >= 1)) return '블라인드는 1 이상이어야 해요';
  if (s.sb > s.bb) return '스몰 블라인드는 빅 블라인드보다 클 수 없어요';
  if (s.bb > s.startChips) return '빅 블라인드는 시작 칩보다 클 수 없어요';
  if (s.minPlayers > s.maxPlayers) return '최소 인원이 최대 인원보다 많아요';
  if (s.turnSeconds < 10 || s.turnSeconds > 120) return '턴 제한시간은 10~120초로 정해 주세요';
  return null;
}

const DEFAULTS = { startChips: 1000, sb: 10, bb: 20, minPlayers: 2, maxPlayers: 9, turnSeconds: 20, rebuyEnabled: true, rebuyAmount: 1000, rebuyMax: 3, password: '', approval: false, mode: 'cash', levelMinutes: 5, game: 'holdem' };

function renderCreate() {
  $app.innerHTML = `
  <main class="page">
    <header class="page-head"><button class="icon-btn" id="back" aria-label="뒤로">←</button><h1>${S.game ? GAME_INFO[S.game].name + ' ' : ''}방 만들기</h1></header>
    <form id="create-form" class="panel form">
      ${settingsFormHTML(DEFAULTS, { forCreate: true })}
      <button class="btn btn-gold btn-lg" type="submit">방 만들고 초대하기</button>
    </form>
  </main>`;
  $app.querySelector('#back').onclick = () => { S.view = S.game ? 'gamehome' : 'home'; render(); };
  const form = $app.querySelector('#create-form');
  bindAvatarPicker(form);
  bindGamePick(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = String(new FormData(form).get('name') || '').trim();
    if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
    const settings = readSettings(form);
    const bad = validateSettings(settings);
    if (bad) { toast(bad, 'error'); return; }
    LS.set('chandem:name', name);
    const res = await emit('room:create', { name, settings, avatar: readAvatar(form), photo: readPhoto(form), auth: S.auth });
    if (!res.ok) return;
    S.code = res.code;
    S.session = { token: res.token, playerId: res.playerId };
    LS.set(sessKey(res.code), S.session);
    nav('/r/' + res.code);
    S.view = 'room';
    render();
  };
}

// 혼자 연습: 봇들과 바로 한 판
function renderPractice() {
  const cnt = LS.get('chandem:bots', 3);
  $app.innerHTML = `
  <main class="page">
    <header class="page-head"><button class="icon-btn" id="back" aria-label="뒤로">←</button><h1>${S.game ? GAME_INFO[S.game].name + ' · ' : ''}AI와 연습</h1></header>
    <form id="practice-form" class="panel form">
      <p class="muted small">친구가 없어도 봇들과 바로 칠 수 있어요. 일반 방식에선 봇 칩이 떨어지면 알아서 다시 채워요.</p>
      <label class="field"><span>닉네임</span><input class="input" name="name" maxlength="10" required value="${esc(LS.get('chandem:name', ''))}" placeholder="최대 10자"></label>
      ${avatarPickerHTML()}
      <fieldset class="fieldset ${S.game ? 'hidden-pick' : ''}"><legend>게임</legend>${gamePickHTML(S.game || LS.get('chandem:pgame', 'holdem'), 'pgame')}</fieldset>
      <fieldset class="fieldset seotda-only"><legend>섯다 방식</legend>
        <div class="seg">
          <label class="seg-opt"><input type="radio" name="pcards" value="2" ${LS.get('chandem:pcards', 2) !== 3 ? 'checked' : ''}><span>두 장 섯다</span></label>
          <label class="seg-opt"><input type="radio" name="pcards" value="3" ${LS.get('chandem:pcards', 2) === 3 ? 'checked' : ''}><span>세 장 섯다</span></label>
        </div>
        <div class="sd3-only">
          <div class="field-lbl">세장섯다 공개</div>
          <div class="seg">
            <label class="seg-opt"><input type="radio" name="psdOpen" value="one" ${LS.get('chandem:psdOpen', 'one') !== 'none' ? 'checked' : ''}><span>한 장 공개<small>기본</small></span></label>
            <label class="seg-opt"><input type="radio" name="psdOpen" value="none" ${LS.get('chandem:psdOpen', 'one') === 'none' ? 'checked' : ''}><span>공개 없음</span></label>
          </div>
        </div>
      </fieldset>
      <fieldset class="fieldset ai-only"><legend>AI 실력</legend>
        <div class="seg">${[['easy', '쉬움'], ['normal', '보통'], ['hard', '어려움']].map(([k, t]) => `<label class="seg-opt"><input type="radio" name="ailevel" value="${k}" ${LS.get('chandem:ailevel', 'normal') === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="fieldset chips-only"><legend>상대 봇 수</legend>
        <div class="seg">${[1, 2, 3, 4, 5].map((n) => `<label class="seg-opt"><input type="radio" name="bots" value="${n}" ${cnt === n ? 'checked' : ''}><span>${n}명</span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="fieldset chips-only"><legend>시작 칩 · 블라인드</legend>
        <div class="seg">${[[1000, 10, 20], [5000, 25, 50], [10000, 50, 100]].map(([c, sb, bb], i) => `<label class="seg-opt"><input type="radio" name="level" value="${i}" ${i === 0 ? 'checked' : ''}><span>${fmt(c)}<small>${sb}/${bb}</small></span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="fieldset chips-only"><legend>방식</legend>
        <div class="seg">
          <label class="seg-opt"><input type="radio" name="pmode" value="cash" ${LS.get('chandem:pmode', 'cash') !== 'tournament' ? 'checked' : ''}><span>일반<small>봇 칩 자동 충전</small></span></label>
          <label class="seg-opt"><input type="radio" name="pmode" value="tournament" ${LS.get('chandem:pmode', 'cash') === 'tournament' ? 'checked' : ''}><span>토너먼트<small>3분마다 블라인드↑</small></span></label>
        </div>
      </fieldset>
      <button class="btn btn-gold btn-lg" type="submit">연습 시작</button>
    </form>
  </main>`;
  $app.querySelector('#back').onclick = () => { S.view = S.game ? 'gamehome' : 'home'; render(); };
  const form = $app.querySelector('#practice-form');
  bindAvatarPicker(form);
  bindGamePick(form, 'pgame');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
    const bots = Number(fd.get('bots')) || 3;
    const [startChips, sb, bb] = [[1000, 10, 20], [5000, 25, 50], [10000, 50, 100]][Number(fd.get('level')) || 0];
    LS.set('chandem:name', name);
    LS.set('chandem:bots', bots);
    const tourney = fd.get('pmode') === 'tournament';
    const game = fd.get('pgame') || 'holdem';
    LS.set('chandem:pgame', game);
    LS.set('chandem:pmode', tourney ? 'tournament' : 'cash');
    const settings = { ...DEFAULTS, startChips, sb, bb, rebuyAmount: startChips, rebuyMax: 99, mode: tourney && game !== 'omok' ? 'tournament' : 'cash', levelMinutes: 3, game, ...(game === 'seotda' ? { sb: bb } : {}), aiLevel: fd.get('ailevel') || 'normal' };
    if (game !== 'holdem') LS.set('chandem:ailevel', settings.aiLevel);
    if (game === 'seotda') { settings.cards = Number(fd.get('pcards')) === 3 ? 3 : 2; LS.set('chandem:pcards', settings.cards); settings.sdOpen = fd.get('psdOpen') === 'none' ? 'none' : 'one'; LS.set('chandem:psdOpen', settings.sdOpen); }
    const res = await emit('room:practice', { name, bots, settings, avatar: readAvatar(form), photo: readPhoto(form), auth: S.auth });
    if (!res.ok) return;
    S.code = res.code;
    S.session = { token: res.token, playerId: res.playerId };
    LS.set(sessKey(res.code), S.session);
    nav('/r/' + res.code);
    S.view = 'room';
    render();
  };
}

function renderJoin() {
  const d = S.roomInfo;
  $app.innerHTML = `
  <main class="page">
    <div class="home-hero compact">${logoHTML()}</div>
    <section class="panel form">
      ${!d ? '<p class="muted">방 정보를 불러오는 중…</p>' : `
      <h1 class="join-title">방 <b class="mono">${esc(d.code)}</b>에 초대받았어요</h1>
      <ul class="facts">
        <li><span>방장</span><b>${esc(d.hostName || '-')}</b></li>
        <li><span>참가 인원</span><b>${d.players} / ${d.maxPlayers}명</b></li>
        <li><span>시작 칩</span><b>${fmt(d.settings.startChips)}</b></li>
        <li><span>블라인드</span><b>${fmt(d.settings.sb)} / ${fmt(d.settings.bb)}</b></li>
        <li><span>상태</span><b>${d.phase === 'lobby' ? '대기실' : '게임 중 (다음 판부터 참가)'}</b></li>
      </ul>
      <form id="join-form">
        <label class="field"><span>닉네임</span><input class="input" name="name" maxlength="10" required value="${esc(LS.get('chandem:name', ''))}" placeholder="최대 10자"></label>
        ${d.hasPassword ? `<label class="field"><span>비밀번호</span><input class="input" name="password" maxlength="20" ${S.user && S.user.isMaster ? 'placeholder="마스터는 비워 두고 관전 가능"' : 'required'} autocomplete="off"></label>` : ''}
        ${S.user && S.user.isMaster && (d.hasPassword || d.approval) ? '<p class="muted small">마스터는 비밀번호·승인 없이 <b>관전</b>으로 바로 들어갈 수 있어요</p>' : ''}
        ${avatarPickerHTML()}
        <label class="switch"><input type="checkbox" name="spectator" ${S.wantSpectate || d.phase === 'playing' || (S.user && S.user.isMaster && (d.hasPassword || d.approval)) ? 'checked' : ''}><span>관전만 할래요${d.phase === 'playing' ? ' (게임 중에는 바로 관전, 참가는 방장 승인)' : ''}</span></label>
        ${d.approval || d.phase === 'playing' ? `<p class="muted small">${d.phase === 'playing' ? '게임이 진행 중이라 ' : ''}방장이 승인하면 들어갈 수 있어요.</p>` : ''}
        <button class="btn btn-gold btn-lg" type="submit">참가하기</button>
      </form>`}
      <button class="btn btn-ghost" id="home">처음 화면으로</button>
    </section>
  </main>`;
  $app.querySelector('#home').onclick = () => { nav('/'); S.code = null; S.view = 'home'; render(); };
  const form = $app.querySelector('#join-form');
  if (!form) return;
  bindAvatarPicker(form);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
    LS.set('chandem:name', name);
    const res = await emit('room:join', { code: d.code, name, password: fd.get('password') || '', spectator: fd.get('spectator') === 'on' || !!(S.user && S.user.isMaster && (d.hasPassword || d.approval) && !fd.get('password')), avatar: readAvatar(form), photo: readPhoto(form), auth: S.auth });
    if (!res.ok) return;
    S.code = res.code;
    S.session = { token: res.token, playerId: res.playerId };
    LS.set(sessKey(res.code), S.session);
    S.view = res.pending ? 'pending' : 'room';
    render();
  };
}

function renderPending() {
  $app.innerHTML = `
  <main class="center-screen">
    ${logoHTML()}
    <div class="spinner" aria-hidden="true"></div>
    <p>방장의 승인을 기다리고 있어요…</p>
    <button class="btn btn-ghost" id="cancel">요청 취소</button>
  </main>`;
  $app.querySelector('#cancel').onclick = async () => {
    await emit('room:leave');
    LS.del(sessKey(S.code));
    S.session = null;
    nav('/');
    S.view = 'home';
    render();
  };
}

function renderMessage() {
  $app.innerHTML = `
  <main class="center-screen">
    ${logoHTML()}
    <p class="message">${esc(S.message)}</p>
    <button class="btn btn-gold" id="home">처음 화면으로</button>
  </main>`;
  $app.querySelector('#home').onclick = () => { nav('/'); S.code = null; S.view = 'home'; render(); };
}

// ── 대기실 ───────────────────────────────────────────
function statusBadges(p, st) {
  const b = [];
  if (p.isHost) b.push('<span class="badge badge-gold">방장</span>');
  if (p.isBot) b.push('<span class="badge">봇</span>');
  if (p.role === 'spectator') b.push('<span class="badge">관전</span>');
  else if (st.room.phase === 'lobby' && !p.isBot) b.push(p.isHost ? '<span class="badge badge-ok">준비 완료</span>' : p.ready ? '<span class="badge badge-ok">준비 완료</span>' : '<span class="badge badge-wait">준비 전</span>');
  if (!p.connected) b.push('<span class="badge badge-warn">연결 끊김</span>');
  if (p.sittingOut) b.push('<span class="badge badge-wait">자리 비움</span>');
  return b.join('');
}

function settingsSummaryHTML(s) {
  return `<ul class="facts">
    <li><span>시작 칩</span><b>${fmt(s.startChips)}</b></li>
    <li><span>블라인드</span><b>${fmt(s.sb)} / ${fmt(s.bb)}</b></li>
    <li><span>인원</span><b>${s.minPlayers}~${s.maxPlayers}명</b></li>
    <li><span>턴 제한</span><b>${s.turnSeconds}초</b></li>
    <li><span>리바인</span><b>${s.rebuyEnabled ? `${fmt(s.rebuyAmount)} · 최대 ${s.rebuyMax}번` : '없음'}</b></li>
    <li><span>게임</span><b>${GAME_NAMES[s.game || 'holdem']}${s.game === 'seotda' ? ` (${s.cards === 3 ? `세 장 · ${s.sdOpen === 'one' ? '한 장 공개' : '공개 없음'}` : '두 장'})` : ''}</b></li>
    <li><span>방식</span><b>${s.mode === 'tournament' ? `토너먼트 · ${s.levelMinutes}분마다 블라인드 상승` : '일반'}</b></li>
    <li><span>입장</span><b>${[s.hasPassword ? '비밀번호' : '', s.approval ? '방장 승인' : ''].filter(Boolean).join(' + ') || '링크만 있으면 누구나'}</b></li>
  </ul>`;
}

function inviteHTML(code) {
  const url = inviteUrl(code);
  const local = /\/\/(192\.168|10\.|172\.)/.test(url);
  return `
  <div class="invite">
    <img class="qr" src="/api/qr.svg?text=${encodeURIComponent(url)}" alt="방 참가 QR코드" width="168" height="168">
    <div class="invite-side">
      <div class="muted small">방 코드</div>
      <div class="room-code mono">${esc(code)}</div>
      <div class="invite-url mono small">${esc(url)}</div>
      <div class="row">
        <button class="btn btn-sm btn-gold" data-share>공유하기</button>
        <button class="btn btn-sm btn-outline" data-copy>링크 복사</button>
      </div>
      ${local ? '<p class="muted tiny">같은 와이파이에 연결된 휴대폰에서 열려요.</p>' : ''}
    </div>
  </div>`;
}

function bindInvite(root, code) {
  const url = inviteUrl(code);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); toast('초대 링크를 복사했어요', 'ok'); }
    catch { prompt('이 링크를 복사해서 보내 주세요', url); }
  };
  root.querySelectorAll('[data-copy]').forEach((b) => { b.onclick = copy; });
  root.querySelectorAll('[data-share]').forEach((b) => {
    b.onclick = () => shareLink(url, '찬이의 게임월드 초대', `찬이의 게임월드 ${GAME_NAMES[gameOf(S.state)]} 방 ${code}에 들어와!`);
  });
}

function renderLobby() {
  const st = S.state;
  const me = st.me;
  const s = st.room.settings;
  const players = st.players.filter((p) => p.role === 'player').sort((a, b) => a.seat - b.seat);
  const specs = st.players.filter((p) => p.role === 'spectator');
  const isHost = me && me.isHost;
  $app.innerHTML = `
  <main class="page lobby">
    <header class="page-head">${logoHTML(true)}<div class="spacer"></div>
      ${SHARE_BTN}
      <button class="icon-btn" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? '음소거' : '소리'}</button>
      <button class="btn btn-sm btn-ghost" id="chart-btn">족보표</button>
    </header>
    ${guestNudgeHTML(st)}
    <section class="panel">
      <h2 class="sec-title">친구 초대</h2>
      ${inviteHTML(st.room.code)}
    </section>
    ${isHost && st.pending && st.pending.length ? `
    <section class="panel attention">
      <h2 class="sec-title">참가 요청 ${st.pending.length}건</h2>
      ${st.pending.map((p) => `<div class="list-row"><b>${esc(p.name)}</b><div class="spacer"></div>
        <button class="btn btn-sm btn-gold" data-approve="${p.id}">수락</button>
        <button class="btn btn-sm btn-outline" data-reject="${p.id}">거절</button></div>`).join('')}
    </section>` : ''}
    <section class="panel">
      <h2 class="sec-title">참가자 ${players.length} / ${s.maxPlayers}명</h2>
      <div class="plist">
        ${players.map((p) => playerRowHTML(p, st, isHost)).join('') || '<p class="muted">아직 참가자가 없어요</p>'}
      </div>
      ${isHost && players.length < s.maxPlayers ? '<button class="btn btn-sm btn-outline add-bot" id="add-bot">봇 추가</button>' : ''}
      ${specs.length ? `<h3 class="sub-title">관전자 ${specs.length}명</h3><div class="plist">${specs.map((p) => playerRowHTML(p, st, isHost)).join('')}</div>` : ''}
    </section>
    <section class="panel">
      <div class="sec-head"><h2 class="sec-title">방 설정</h2>${isHost ? '<button class="btn btn-sm btn-outline" id="edit-settings">설정 바꾸기</button>' : ''}</div>
      ${settingsSummaryHTML(s)}
    </section>
    ${P.roomMasterHTML()}
    <div class="lobby-actions">
      ${me && me.role === 'player' && !isHost ? `<button class="btn btn-lg ${me.ready ? 'btn-outline' : 'btn-gold'}" id="ready">${me.ready ? '준비 취소' : '준비 완료'}</button>` : ''}
      ${isHost ? `<button class="btn btn-lg btn-gold" id="start" ${st.room.startBlocker ? 'disabled' : ''}>게임 시작</button>
        <p class="muted small center">${st.room.startBlocker ? esc(st.room.startBlocker) : '모두 준비됐어요. 시작할 수 있어요!'}</p>` : `<p class="muted small center">방장이 게임을 시작하면 바로 테이블로 이동해요.</p>`}
      <div class="row center">
        ${me && !me.masterPeek ? `<button class="btn btn-sm btn-ghost" id="role">${me.role === 'player' ? '관전으로 바꾸기' : '참가자로 앉기'}</button>` : ''}
        <button class="btn btn-sm btn-ghost danger" id="leave">방 나가기</button>
      </div>
    </div>
  </main>`;
  bindInvite($app, st.room.code);
  bindCommon();
  RK.fitNames($app);
  RK.refreshRoom(st);
  $app.querySelectorAll('[data-approve]').forEach((b) => { b.onclick = () => emit('host:approve', { id: b.dataset.approve, ok: true }); });
  $app.querySelectorAll('[data-reject]').forEach((b) => { b.onclick = () => emit('host:approve', { id: b.dataset.reject, ok: false }); });
  bindPlayerMenus($app);
  const addBot = $app.querySelector('#add-bot');
  if (addBot) addBot.onclick = () => emit('host:bot');
  const ready = $app.querySelector('#ready');
  if (ready) ready.onclick = () => emit('lobby:ready', { ready: !me.ready });
  const start = $app.querySelector('#start');
  if (start) start.onclick = () => emit('lobby:start');
  const role = $app.querySelector('#role');
  if (role) role.onclick = () => emit('lobby:role', { spectator: me.role === 'player' });
  $app.querySelector('#leave').onclick = leaveRoom;
  P.bindRoomMaster($app, st.room.code);
  const edit = $app.querySelector('#edit-settings');
  if (edit) edit.onclick = () => openSettingsModal();
}

function playerRowHTML(p, st, isHost) {
  const me = st.me && st.me.id === p.id;
  return `<div class="list-row ${me ? 'is-me' : ''}" data-pid="${esc(p.id)}">
    ${avatarHTML(p, 'avatar-sm')}
    <div class="grow"><b>${esc(p.name)}</b>${RK.badgeHTML(p.id)}${P.masterBadge(p.master)}${me ? ' <span class="muted small">(나)</span>' : ''}
      ${st.room.phase === 'playing' && p.role === 'player' ? `<div class="muted small">칩 ${fmt(p.stack)}${p.rebuys ? ` · 리바인 ${p.rebuys}회` : ''}</div>` : ''}</div>
    <div class="badges">${statusBadges(p, st)}</div>
    ${isHost && !me ? `<button class="icon-btn" data-pmenu="${p.id}" aria-label="${esc(p.name)} 관리">⋯</button>` : ''}
  </div>`;
}

function bindPlayerMenus(root) {
  root.querySelectorAll('[data-pmenu]').forEach((b) => {
    b.onclick = () => {
      const p = S.state.players.find((x) => x.id === b.dataset.pmenu);
      if (!p) return;
      openModal(`${p.name}님 관리`, `
        <div class="stack">
          ${p.isBot ? '' : '<button class="btn btn-outline" data-act="transfer">방장 넘기기</button>'}
          <button class="btn btn-outline danger" data-act="kick">방에서 내보내기</button>
        </div>`, (body) => {
        const tr = body.querySelector('[data-act="transfer"]');
        if (tr) tr.onclick = async () => { const r = await emit('host:transfer', { id: p.id }); if (r.ok) { toast('방장을 넘겼어요', 'ok'); closeModal(); } };
        body.querySelector('[data-act="kick"]').onclick = async () => {
          if (!confirm(`${p.name}님을 내보낼까요?`)) return;
          const r = await emit('host:kick', { id: p.id }); if (r.ok) closeModal();
        };
      });
    };
  });
}

function openSettingsModal() {
  const s = S.state.room.settings;
  openModal('방 설정 바꾸기', `<form class="form" id="set-form">${settingsFormHTML(s)}<button class="btn btn-gold btn-lg">저장</button></form>`, (body) => {
    const form = body.querySelector('#set-form');
    form.dataset.game = s.game || 'holdem'; // 게임에 맞는 칸만 (섯다: 기본 판돈)
    bindSd3(form);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const next = readSettings(form);
      const bad = validateSettings(next);
      if (bad) { toast(bad, 'error'); return; }
      const r = await emit('lobby:settings', { settings: next });
      if (r.ok) { toast('설정을 저장했어요', 'ok'); closeModal(); }
    };
  });
}

// 나가기: 바로 밖으로 튕기지 않고 — 관전으로 남기 / 이 게임 대기 화면으로 / 메인으로
function leaveRoom() { openExitMenu(); }
function openExitMenu() {
  const st = S.state;
  if (!st) return;
  const me = st.me;
  const g = gameOf(st);
  const inHand = st.hand && !st.hand.finished && st.players.some((p) => p.id === me?.id && ['inhand', 'allin'].includes(p.status));
  const canWatch = me && me.role === 'player' && !st.room.practice;
  openModal('게임을 나가시겠습니까?', `
    <p class="muted small">${inHand ? '진행 중인 판은 다이(폴드) 처리돼요. ' : ''}${st.room.practice ? '연습 방은 나가면 사라져요.' : '방을 나가도 초대 링크로 다시 들어올 수 있어요.'}</p>
    <div class="stack">
      ${canWatch ? '<button class="btn btn-outline" data-act="watch">관전으로 남기 <small class="muted">(자리만 비우고 구경)</small></button>' : ''}
      <button class="btn btn-gold" data-act="lobby">방 나가기 → ${GAME_INFO[g].name} 대기 화면</button>
      <button class="btn btn-ghost" data-act="home">메인으로</button>
      <button class="btn btn-ghost" data-act="stay">계속 있을게요</button>
    </div>`, (body) => {
    body.querySelector('[data-act="stay"]').onclick = closeModal;
    const w = body.querySelector('[data-act="watch"]');
    if (w) w.onclick = async () => { const r = await emit('lobby:role', { spectator: true }); if (r.ok) { closeModal(); toast(r.later ? '이번 판은 다이, 다음 판부터 관전해요' : '관전으로 바꿨어요. 언제든 다시 앉을 수 있어요', 'ok'); } };
    const out = async (toLobby) => {
      await emit('room:leave');
      LS.del(sessKey(S.code));
      S.session = null; S.state = null; S.code = null;
      S.game = toLobby ? g : S.game;
      nav('/');
      S.view = toLobby ? 'gamehome' : 'home';
      closeModal();
      render();
    };
    body.querySelector('[data-act="lobby"]').onclick = () => out(true);
    body.querySelector('[data-act="home"]').onclick = () => out(false);
  });
}

function bindCommon() {
  const chart = document.getElementById('chart-btn');
  if (chart) chart.onclick = () => (gameOf(S.state) === 'seotda' ? openModal('섯다 족보', `<div class="sd-chart">${seotdaChartHTML()}</div>`, null, { wide: true }) : openModal('족보표', handChartHTML(), null, { wide: true }));
  const sb = document.getElementById('sound-btn');
  if (sb) sb.onclick = openSoundModal;
  const sh = document.getElementById('share-top');
  if (sh) sh.onclick = shareTop;
}

function openSoundModal() {
  const p = sound.getPrefs();
  openModal('소리 설정', `
    <div class="form">
      <label class="switch"><input type="checkbox" id="snd-mute" ${p.muted ? 'checked' : ''}><span>음소거</span></label>
      <label class="switch"><input type="checkbox" id="snd-voice" ${p.voice ? 'checked' : ''}><span>콜·다이 음성 듣기</span></label>
      <label class="field"><span>효과음·음성 볼륨 <b id="vol-val">${Math.round(p.volume * 100)}%</b></span>
        <input type="range" id="snd-vol" min="0" max="100" value="${Math.round(p.volume * 100)}"></label>
      <label class="switch"><input type="checkbox" id="snd-music" ${p.music ? 'checked' : ''}><span>배경음악 듣기</span></label>
      <label class="field"><span>배경음악 볼륨 <b id="mvol-val">${Math.round(p.musicVolume * 100)}%</b></span>
        <input type="range" id="snd-mvol" min="0" max="100" value="${Math.round(p.musicVolume * 100)}"></label>
      <button class="btn btn-outline" id="snd-test">소리 들어보기</button>
      <p class="muted small">휴대폰 무음 모드에서는 소리가 나지 않을 수 있어요.</p>
    </div>`, (body) => {
    body.querySelector('#snd-mute').onchange = (e) => { sound.setMuted(e.target.checked); updateSoundIcon(); };
    body.querySelector('#snd-voice').onchange = (e) => sound.setVoice(e.target.checked);
    body.querySelector('#snd-vol').oninput = (e) => { sound.setVolume(e.target.value / 100); body.querySelector('#vol-val').textContent = e.target.value + '%'; };
    body.querySelector('#snd-music').onchange = (e) => { sound.unlock(); sound.setMusic(e.target.checked); };
    body.querySelector('#snd-mvol').oninput = (e) => { sound.setMusicVolume(e.target.value / 100); body.querySelector('#mvol-val').textContent = e.target.value + '%'; };
    body.querySelector('#snd-test').onclick = () => { sound.unlock(); sound.play('chips'); setTimeout(() => sound.play('v_call'), 200); };
  });
}
function updateSoundIcon() {
  const b = document.getElementById('sound-btn');
  if (b) b.textContent = sound.getPrefs().muted ? '음소거' : '소리';
}

// ── 게임 테이블 ───────────────────────────────────────
// 인원수별 자리 좌표 (퍼센트). 0번은 나(아래 가운데), 이후 시계방향: 왼쪽 아래 → 위 → 오른쪽.
// 바닥 카드·팟이 있는 가운데 띠(세로 38~58%)는 비워 둔다.
const LAYOUTS = {
  1: [[50, 9]],
  2: [[20, 12], [80, 12]],
  3: [[11, 24], [50, 8], [89, 24]],
  4: [[11, 26], [31, 8], [69, 8], [89, 26]],
  5: [[11, 70], [11, 24], [50, 8], [89, 24], [89, 70]],
  6: [[11, 70], [11, 24], [31, 7], [69, 7], [89, 24], [89, 70]],
  7: [[20, 89], [10, 67], [10, 24], [50, 7], [90, 24], [90, 67], [80, 89]],
  8: [[20, 89], [10, 67], [10, 25], [30, 7], [70, 7], [90, 25], [90, 67], [80, 89]],
};
// 키 작은 폰(테이블 높이 470px 미만): 옆자리를 가운데 줄보다 더 위·아래로
const LAYOUTS_COMPACT = {
  1: [[50, 7]],
  2: [[20, 10], [80, 10]],
  3: [[10, 21], [50, 6], [90, 21]],
  4: [[10, 22], [31, 6], [69, 6], [90, 22]],
  5: [[10, 72], [10, 21], [50, 6], [90, 21], [90, 72]],
  6: [[10, 72], [10, 21], [31, 6], [69, 6], [90, 21], [90, 72]],
  7: [[25, 94], [9, 68], [9, 22], [50, 6], [91, 22], [91, 68], [75, 94]],
  8: [[25, 94], [9, 68], [9, 23], [30, 6], [70, 6], [91, 23], [91, 68], [75, 94]],
};
function seatPositions(n, compact = false) {
  const others = (compact ? LAYOUTS_COMPACT : LAYOUTS)[Math.max(1, Math.min(8, n - 1))];
  return [{ x: 50, y: 90 }, ...others.map(([x, y]) => ({ x, y }))];
}

function mountGame() {
  $app.innerHTML = `
  <div class="game">
    <header class="g-top" id="g-top"></header>
    <div class="g-banner" id="g-banner"></div>
    <div class="table-wrap"><div class="table" id="g-table"></div>
      <div class="emote-tray" id="emote-tray" hidden>${EMOTES.map(([k, e, t]) => `<button data-emote="${k}" class="emote-${k}" aria-label="${t}"><span class="emote-txt">${e}</span><small>${t}</small></button>`).join('')}</div>
    </div>
    <div id="fx-layer" aria-hidden="true"></div>
    <section class="g-me" id="g-me"></section>
    <section class="g-actions" id="g-actions"></section>
  </div>`;
  S.gameMounted = true;
  S.actionSig = '';
  const tray = document.getElementById('emote-tray');
  document.getElementById('g-me').addEventListener('click', (e) => {
    if (e.target.closest('#emote-btn')) { e.stopPropagation(); tray.hidden = !tray.hidden; }
  });
  tray.querySelectorAll('[data-emote]').forEach((b) => {
    b.onclick = () => { tray.hidden = true; emit('game:emote', { kind: b.dataset.emote }); };
  });
}

function renderGame() {
  setDeckStyle(gameOf(S.state) === 'seotda' ? 'hwatu' : 'poker');
  if (gameOf(S.state) === 'omok') {
    if (!S.gameMounted || !document.getElementById('g-table')) mountGame();
    const st = S.state;
    renderTop(st);
    renderBanner(st);
    renderOmok(st);
    tickTimers();
    omokEffects(st);
    return;
  }
  if (!S.gameMounted || !document.getElementById('g-table')) mountGame();
  const st = S.state;
  renderTop(st);
  renderBanner(st);
  renderTable(st);
  renderMe(st);
  renderActions(st);
  tickTimers();
  runEffects(st);
}

function renderTop(st) {
  const el = document.getElementById('g-top');
  const pendingCount = st.pending ? st.pending.length : 0;
  el.innerHTML = `
    ${logoHTML(true)}
    <div class="g-info"><span class="mono">${esc(st.room.code)}</span><span>${st.room.handNo ? `${st.room.handNo}번째 판` : ''}</span></div>
    <div class="spacer"></div>
    <button class="icon-btn share-icon" id="share-top" aria-label="초대 링크 공유">${P.hubIcon('link')}</button>
    <button class="btn btn-sm btn-ghost" id="chart-btn">족보표</button>
    <button class="icon-btn txt-btn" id="log-btn" aria-label="베팅 내역">기록</button>
    <button class="icon-btn" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? '음소거' : '소리'}</button>
    <button class="icon-btn" id="menu-btn" aria-label="메뉴"><i class="burger" aria-hidden="true"><i></i></i>${pendingCount ? `<span class="dot">${pendingCount}</span>` : ''}</button>`;
  bindCommon();
  el.querySelector('#log-btn').onclick = openLogModal;
  el.querySelector('#menu-btn').onclick = openMenuModal;
}

function renderBanner(st) {
  const el = document.getElementById('g-banner');
  const me = st.me;
  const msgs = [];
  if (!S.connected) msgs.push(['warn', '서버와 연결이 끊겼어요. 다시 연결하는 중…']);
  if (me && me.role === 'player') {
    if (me.pendingRebuy > 0) msgs.push(['info', `리바인 대기 중 · 다음 판부터 +${fmt(me.pendingRebuy)}`]);
    else if (me.canRebuy) {
      const s = st.room.settings;
      msgs.push(['gold', `칩이 ${me.stack === 0 ? '모두 떨어졌어요' : '부족해요'} · 리바인 +${fmt(s.rebuyAmount)} (남은 횟수 ${s.rebuyMax - me.rebuys}번)`, '<button class="btn btn-sm btn-gold" id="rebuy-btn">리바인</button>']);
    } else if (me.stack === 0 && !(st.hand && !st.hand.result && st.players.find((p) => p.id === me.id)?.status === 'allin')) {
      msgs.push(['info', '칩이 모두 떨어졌어요. 이제 관전하며 응원해 주세요']);
    }
    if (me.sittingOut) msgs.push(['away', '자리 비움 중 · 내 차례엔 자동으로 체크/다이해요 (화면을 누르면 돌아와요)', '<button class="btn btn-sm btn-gold" id="sitin-btn">자리로 돌아가기</button>']);
    const myRow = st.players.find((p) => p.id === me.id);
    if (st.room.phase === 'playing' && myRow && myRow.status === 'waiting' && !me.sittingOut) msgs.push(['info', '다음 판부터 참여해요 · 이번 판은 구경 중']);
  }
  if (st.room.waiting) msgs.push(['info', '카드를 받을 수 있는 참가자가 2명 이상이 되면 다음 판이 시작돼요']);
  const nudge = guestNudgeHTML(st, true);
  const tn = st.room.tournament;
  if (tn && tn.running) msgs.push(['tourney', `레벨 ${tn.level} · ${fmt(tn.sb)}/${fmt(tn.bb)} · 남은 ${tn.alive}/${tn.entrants}명`, `<span class="lvl-next">다음 ${fmt(tn.nextSb)}/${fmt(tn.nextBb)} · <b data-level-at="${tn.nextAt}">-</b></span>`]);
  // 방장: 게임 중 들어오고 싶은 사람
  if (me && me.isHost && st.pending) {
    for (const p of st.pending) msgs.push(['gold', p.seat ? `${p.name}님이 관전하다 자리에 앉고 싶어해요` : `${p.name}님이 들어오고 싶어해요`, `<button class="btn btn-sm btn-gold" data-approve="${p.id}">수락</button><button class="btn btn-sm btn-outline" data-reject="${p.id}">거절</button>`]);
    const ids = st.pending.map((p) => p.id).join(',');
    if (ids && ids !== S.pendingSeen) { S.pendingSeen = ids; sound.play('turn'); }
  }
  el.innerHTML = msgs.map(([k, t, btn]) => `<div class="banner banner-${k}"><span>${esc(t)}</span>${btn || ''}</div>`).join('') + nudge;
  tickLevel();
  el.querySelectorAll('[data-approve]').forEach((b) => { b.onclick = () => emit('host:approve', { id: b.dataset.approve, ok: true }); });
  el.querySelectorAll('[data-reject]').forEach((b) => { b.onclick = () => emit('host:approve', { id: b.dataset.reject, ok: false }); });
  const rb = el.querySelector('#rebuy-btn');
  if (rb) rb.onclick = async () => { const r = await emit('game:rebuy'); if (r.ok) toast('리바인 신청 완료! 다음 판부터 적용돼요', 'ok'); };
  const si = el.querySelector('#sitin-btn');
  if (si) si.onclick = () => emit('game:sitin');
}

// ── 오목 ────────────────────────────────────────────
function omokStone(c, x, y, extra = '') {
  return `<circle class="stone stone-${c} ${extra}" cx="${x + 0.5}" cy="${y + 0.5}" r="0.44"></circle>`;
}
function omokBoardSVG(o, preview, myColor) {
  const lines = [];
  for (let i = 0; i < 15; i++) {
    lines.push(`<line x1="0.5" y1="${i + 0.5}" x2="14.5" y2="${i + 0.5}"></line><line x1="${i + 0.5}" y1="0.5" x2="${i + 0.5}" y2="14.5"></line>`);
  }
  const stars = [[3, 3], [11, 3], [7, 7], [3, 11], [11, 11]].map(([x, y]) => `<circle class="star" cx="${x + 0.5}" cy="${y + 0.5}" r="0.11"></circle>`).join('');
  const win = new Set((o.winLine || []).map(([x, y]) => y * 15 + x));
  const stones = [];
  for (let i = 0; i < 225; i++) {
    const c = o.cells[i];
    if (c === '.') continue;
    const x = i % 15, y = Math.floor(i / 15);
    const last = o.lastMove && o.lastMove.x === x && o.lastMove.y === y;
    stones.push(omokStone(c, x, y, `${win.has(i) ? 'stone-win' : ''} ${last ? 'stone-last' : ''}`));
    if (last) stones.push(`<circle class="last-dot" cx="${x + 0.5}" cy="${y + 0.5}" r="0.12"></circle>`);
  }
  const pv = preview ? omokStone(myColor, preview.x, preview.y, 'stone-preview') : '';
  return `<svg class="omok-board" id="omok-board" viewBox="0 0 15 15" role="img" aria-label="오목판">
    <rect x="0" y="0" width="15" height="15" class="omok-wood"></rect>
    <g class="omok-grid">${lines.join('')}</g>${stars}${stones.join('')}${pv}</svg>`;
}
function omokPlayerHTML(p, color, st, label) {
  if (!p) return `<div class="omok-player"><span class="muted">상대를 기다리는 중</span></div>`;
  const turn = st.hand && !st.hand.finished && st.hand.toActId === p.id;
  return `<div class="omok-player ${turn ? 'is-turn' : ''}" data-id="${esc(p.id)}">
    ${avatarHTML(p, 'avatar-sm')}<span class="omok-stone-icon stone-${color}"></span>
    <b>${esc(p.name)}</b>${RK.badgeHTML(p.id)}${P.masterBadge(p.master, true)}${p.member && !p.master ? ' <span class="member-mark">✓</span>' : ''}${p.rating ? `<span class="tier-chip" style="color:${tierOf(p.rating).color}" title="${tierOf(p.rating).name} ${p.rating}점">${tierIco(tierOf(p.rating).icon)}${fmt(p.rating)}</span>` : ''}${label ? `<span class="muted small">${label}</span>` : ''}
    ${turn ? '<span class="tag tag-turn" data-deadline>차례</span>' : ''}</div>`;
}
function renderOmok(st) {
  const h = st.hand;
  const table = document.getElementById('g-table');
  const meEl = document.getElementById('g-me');
  const actEl = document.getElementById('g-actions');
  const meId = st.me && st.me.id;
  const o = h && h.omok;
  if (!o) {
    table.innerHTML = `<div class="omok-wait"><div class="table-brand">오목</div><p class="muted">${st.room.waiting ? '상대를 기다리는 중이에요' : '곧 시작해요'}</p></div>`;
    meEl.innerHTML = '<button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button>';
    actEl.innerHTML = '';
    return;
  }
  const ids = Object.keys(o.colors);
  const myColor = o.colors[meId];
  const oppId = myColor ? ids.find((id) => id !== meId) : ids.find((id) => o.colors[id] === 'w');
  const bottomId = myColor ? meId : ids.find((id) => o.colors[id] === 'b');
  const pOf = (id) => st.players.find((p) => p.id === id);
  if (S.omokPreview && (h.no !== S.omokPreview.no || o.cells[S.omokPreview.y * 15 + S.omokPreview.x] !== '.' || !h.legal)) S.omokPreview = null;
  const preview = S.omokPreview;
  table.innerHTML = `
    <div class="omok-wrap">
      ${omokPlayerHTML(pOf(oppId), o.colors[oppId], st, myColor ? '' : '')}
      <div class="omok-board-box">${omokBoardSVG(o, preview, myColor)}</div>
      ${h.result ? `<div class="omok-result">${h.result.type === 'draw' ? '무승부예요' : `${esc(h.result.winnerNames.join(', '))} 승리${h.result.reason === 'resign' ? ' (기권)' : ''}`}<small>곧 흑백을 바꿔 다음 판을 시작해요</small></div>` : ''}
    </div>`;
  meEl.innerHTML = `${omokPlayerHTML(pOf(bottomId), o.colors[bottomId], st, myColor ? '(나)' : '')}
    <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button>`;
  RK.fitNames(table); RK.fitNames(meEl);
  RK.refreshRoom(st);
  const la = h.legal;
  if (la) {
    actEl.innerHTML = `
      <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>
      <div class="act-info"><span class="my-turn">내 차례 (${myColor === 'b' ? '흑' : '백'}) · <span data-deadline-text>남은 시간 -</span></span><span>${preview ? '한 번 더 누르면 둬요' : '둘 곳을 누르세요'}${myColor === 'b' ? ' · 흑은 삼삼 금지' : ''}</span></div>
      <div class="act-row">
        <button class="btn act act-fold" id="omok-resign">기권</button>
        <button class="btn act act-raise grow" id="omok-place" ${preview ? '' : 'disabled'}>${preview ? `여기에 두기 (${String.fromCharCode(65 + preview.x)}${preview.y + 1})` : '자리를 고르세요'}</button>
      </div>`;
  } else if (h.finished) {
    actEl.innerHTML = '<div class="wait-line"><span data-next>다음 판을 준비하고 있어요</span></div>';
  } else {
    actEl.innerHTML = `<div class="wait-line"><b>${esc(nameOf(h.toActId))}</b>님이 생각 중이에요 · <span data-deadline-text>남은 시간 -</span></div>
      <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>`;
  }
  const place = (x, y) => { S.omokPreview = null; doAct({ type: 'place', x, y }); };
  const board = document.getElementById('omok-board');
  board.onclick = (e) => {
    if (!h.legal) return;
    const r = board.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * 15);
    const y = Math.floor((e.clientY - r.top) / r.height * 15);
    if (x < 0 || y < 0 || x > 14 || y > 14 || o.cells[y * 15 + x] !== '.') return;
    if (S.omokPreview && S.omokPreview.x === x && S.omokPreview.y === y) { place(x, y); return; }
    S.omokPreview = { x, y, no: h.no };
    sound.play('tick');
    renderOmok(S.state);
    tickTimers();
  };
  const pb = document.getElementById('omok-place');
  if (pb) pb.onclick = () => { if (S.omokPreview) place(S.omokPreview.x, S.omokPreview.y); };
  const rb = document.getElementById('omok-resign');
  if (rb) rb.onclick = () => { if (confirm('기권할까요?')) doAct({ type: 'resign' }); };
}
function omokEffects(st) {
  const h = st.hand;
  if (!h || !h.omok) return;
  const key = `${h.no}:${h.omok.moves}`;
  if (S.omokLast !== key) { if (S.omokLast && h.omok.moves) sound.play('stone'); S.omokLast = key; }
  if (h.result && S.omokDone !== h.no) {
    S.omokDone = h.no;
    const iWon = h.result.winners.includes(st.me && st.me.id) && h.result.type !== 'draw';
    if (h.result.type === 'draw') banner('무승부', '', 'win', 1800);
    else {
      banner(iWon ? '내가 이겼다!' : `${h.result.winnerNames.join(', ')} 승리`, h.result.reason === 'resign' ? '상대 기권' : '오목 완성!', iWon ? 'mywin' : 'win', 2400);
      sound.play('fanfare');
      if (iWon) coinRain(40);
    }
  }
}

function orderedSeats(st) {
  const seated = st.players.filter((p) => p.role === 'player' || p.leaving).filter((p) => p.seat !== null).sort((a, b) => a.seat - b.seat);
  const meIdx = st.me ? seated.findIndex((p) => p.id === st.me.id) : -1;
  if (meIdx <= 0) return seated;
  return seated.slice(meIdx).concat(seated.slice(0, meIdx));
}

const STATUS_TEXT = { folded: '폴드', allin: '올인', busted: '칩 소진', away: '자리 비움', waiting: '다음 판 대기' };
const ACTION_TEXT = { check: '체크', call: '콜', bet: '베팅', raise: '레이즈', allin: '올인', fold: '폴드' };

function renderTable(st) {
  const el = document.getElementById('g-table');
  const h = st.hand;
  const seats = orderedSeats(st);
  const compact = el.clientHeight > 0 && el.clientHeight < 470;
  const pos = seatPositions(Math.max(seats.length, 2), compact);
  const handNo = h ? h.no : 0;
  const result = h && h.result;
  const winners = new Set(result ? result.winners : []);

  const seatHTML = seats.map((p, i) => {
    const { x, y } = pos[i];
    const isMe = st.me && p.id === st.me.id;
    const cls = ['seat'];
    if (isMe) cls.push('seat-me');
    if (p.isTurn) cls.push('seat-turn');
    if (p.status === 'folded') cls.push('seat-folded');
    if (p.status === 'allin') cls.push('seat-allin');
    if (winners.has(p.id)) cls.push('seat-winner');
    if (!p.connected) cls.push('seat-offline');
    if (y < 30) cls.push('seat-top');
    let cards = '';
    if (p.cards && !isMe) {
      const reveal = result && result.hands && result.hands[p.id];
      const best = reveal ? new Set(reveal.best) : null;
      cards = `<div class="seat-cards">${p.cards.map((c, k) => {
        const fresh = markCard(`${handNo}:${p.id}:${k}:${c === '??' ? 'b' : 'f'}`);
        const flip = fresh && c !== '??'; // 쇼다운에서 패를 까는 순간
        return cardHTML(c, { size: 'xs', anim: fresh && !flip, cls: flip ? 'card-flip' : '', highlight: best && best.has(c), delay: k * 90 });
      }).join('')}</div>`;
    }
    const tags = [];
    if (p.isTurn) tags.push(`<span class="tag tag-turn" data-deadline>차례</span>`);
    else if (STATUS_TEXT[p.status] && p.status !== 'waiting') tags.push(`<span class="tag tag-${p.status}">${STATUS_TEXT[p.status]}</span>`);
    else if (p.lastAction && h && !h.finished) tags.push(`<span class="tag tag-act">${ACTION_TEXT[p.lastAction] || ''}</span>`);
    if (st.room.phase === 'playing' && p.status === 'waiting' && !p.sittingOut) tags.push('<span class="tag">다음 판 대기</span>');
    if (!p.connected) tags.push('<span class="tag tag-off">연결 끊김</span>');
    else if (p.sittingOut && st.room.phase === 'playing') tags.push('<span class="tag tag-away">자리 비움</span>');
    const ht = S.seatHands && S.seatHands[handNo + ':' + p.id];
    if (ht) tags.unshift(`<span class="tag tag-hand ${ht.big ? 'tag-hand-big' : ''}">${esc(ht.text)}</span>`);
    if (result && result.deltas && result.deltas[p.id] !== undefined) {
      const d = result.deltas[p.id];
      tags.push(`<span class="tag ${d > 0 ? 'tag-plus' : d < 0 ? 'tag-minus' : ''}">${signed(d)}</span>`);
    }
    const pos2 = [];
    if (p.isDealer) pos2.push('<span class="dealer-btn" title="딜러">D</span>');
    if (p.isSB) pos2.push('<span class="blind-lbl">SB</span>');
    if (p.isBB) pos2.push('<span class="blind-lbl">BB</span>');
    const bet = p.bet > 0 ? (() => {
      const k = y < 30 ? 0.52 : 0.4; const bx = x + (50 - x) * k; const by = y + (47 - y) * k;
      return `<div class="bet" style="left:${bx}%;top:${by}%" title="${esc(p.name)} 이번 라운드 베팅"><span class="chip-icon sm"></span><small>베팅</small><b>${fmt(p.bet)}</b></div>`;
    })() : '';
    return `
      <div class="${cls.join(' ')}" data-id="${p.id}" style="left:${x}%;top:${y}%">
        ${cards}
        <div class="seat-body">
          <div class="seat-av">${avatarHTML(p)}${RK.badgeHTML(p.id)}<div class="seat-pos">${pos2.join('')}</div>
            ${p.isTurn ? '<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" data-ring></circle></svg>' : ''}</div>
          <div class="seat-name">${P.masterBadge(p.master, true)}${esc(p.name)}${p.member && !p.master ? ' <span class="member-mark" title="회원">✓</span>' : ''}${p.isHost ? ' <span class="crown" title="방장">★</span>' : ''}</div>
          <div class="seat-stack"><span class="chip-icon sm"></span>${fmt(p.stack)}</div>
          <div class="seat-tags">${tags.join('')}</div>
        </div>
      </div>${bet}`;
  }).join('');

  let center = '';
  if (h) {
    const board = [];
    const winBest = result && result.type === 'showdown' ? new Set(result.winners.flatMap((w) => (result.hands[w] ? result.hands[w].best : []))) : null;
    const rv = h.reveal;
    if (rv && rv.allin && S.runoutHand !== handNo) { S.runoutHand = handNo; S.runoutFrom = h.board.length; }
    for (let i = 0; i < 5; i++) {
      const c = h.board[i];
      if (c) {
        const fresh = markCard(`${handNo}:board:${i}`);
        // 올인 승부에서 새로 깔리는 카드는 천천히 뒤집고, 리버는 '쪼듯이' 더 천천히
        const slow = fresh && S.runoutHand === handNo && i >= S.runoutFrom;
        board.push(cardHTML(c, {
          size: compact ? 'sm' : 'md', anim: fresh && !slow, delay: (i < 3 && !slow ? i : 0) * 120,
          cls: slow ? (i === 4 ? 'card-squeeze' : 'card-flip-slow') : '',
          highlight: winBest && winBest.has(c), dim: winBest && !winBest.has(c),
        }));
      } else if (rv && rv.squeeze && i === h.board.length) {
        board.push(cardHTML('??', { size: compact ? 'sm' : 'md', cls: 'card-squeeze-wait' }));
      } else board.push(cardHTML(null, { size: compact ? 'sm' : 'md' }));
    }
    const potText = `<small>팟</small>${fmt(h.totalPot)}`;
    const sidePots = h.pots && h.pots.length > 1
      ? `<div class="side-pots">${h.pots.map((pt, i) => `<span>${i === 0 ? '메인' : `사이드${i}`} ${fmt(pt.amount)}</span>`).join('')}</div>` : '';
    center = `
      <div class="table-center">
        <div class="stage-lbl ${h.stage === 'allin' ? 'stage-allin' : ''}">${(h.game === 'seotda' ? '' : { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', allin: '올인 승부' }[h.stage] || '')}</div>
        ${h.game === 'seotda' ? `<div class="sd-center">${st.room.settings.cards === 3 ? '세 장' : '두 장'} 섯다${h.stage === 'open' ? ' · 한 장 공개' : h.stage === 'pick' ? ' · 두 장 고르기' : h.stage === 'betting' ? (st.room.settings.cards === 3 ? ' · 1차 베팅' : ' · 베팅') : h.stage === 'betting2' ? ' · 2차 베팅' : ''}</div>` : `<div class="board">${board.join('')}</div>`}
        <div class="pot"><span class="chip-icon pot-chip"></span><b>${potText}</b>${h.totalPot > h.pot ? `<span class="pot-note">이번 라운드 ${fmt(h.totalPot - h.pot)} 포함</span>` : ''}</div>
        ${sidePots}
        ${result ? resultHTML(st, result) : ''}
      </div>`;
  } else {
    center = `<div class="table-center"><div class="table-brand">GAME WORLD</div><p class="muted small">${st.room.waiting ? '참가자를 기다리는 중' : '곧 시작해요'}</p></div>`;
  }
  el.innerHTML = `<div class="felt"><div class="felt-rail"></div>${center}${seatHTML}</div>`;
  RK.fitNames(el);
  RK.refreshRoom(st);
}

function markCard(key) {
  if (S.seenCards.has(key)) return false;
  S.seenCards.add(key);
  if (S.seenCards.size > 400) S.seenCards = new Set([...S.seenCards].slice(-200));
  return true;
}

function resultHTML(st, r) {
  const names = r.winnerNames.map(esc).join(', ');
  const nextIn = '';
  if (r.redeal) {
    return `<div class="result"><div class="result-title">${esc(r.redeal)}! 재경기</div><p>판돈 ${fmt(r.carry)}을 걸고 살아 있는 사람끼리 다시 쳐요</p></div>`;
  }
  if (r.type === 'fold') {
    return `<div class="result"><div class="result-title">${names}</div><p>다른 사람이 모두 폴드해서 팟을 가져갔어요</p>${nextIn}</div>`;
  }
  const w = r.hands[r.winners[0]];
  const split = r.winners.length > 1;
  return `<div class="result">
    <div class="result-title">${names}${split ? ' <span class="small">(나눠 가짐)</span>' : ''}</div>
    <div class="result-hand">${esc(w ? w.name : '')}</div>
    ${r.pots.length > 1 ? `<div class="result-pots">${r.pots.map((p, i) => `<span>${p.returned ? '돌려받음' : i === 0 ? '메인 팟' : `사이드 팟${i}`} ${fmt(p.amount)} → ${p.winners.map((id) => esc(nameOf(id))).join(', ')}</span>`).join('')}</div>` : ''}
    ${nextIn}
  </div>`;
}

function nameOf(id) { const p = S.state.players.find((x) => x.id === id); return p ? p.name : '(나간 사람)'; }

function renderMe(st) {
  const el = document.getElementById('g-me');
  const me = st.me;
  const mp = me && st.players.find((p) => p.id === me.id);
  if (!me || !mp) { el.innerHTML = ''; return; }
  if (me.role === 'spectator' && !mp.cards) {
    const waitingSeat = mp.seatRequest;
    el.innerHTML = `<div class="me-spec"><span>관전 중이에요${waitingSeat ? ' · 방장이 자리 요청을 확인하고 있어요' : ''}</span>
      ${waitingSeat ? '' : `<button class="btn btn-sm btn-outline" id="sit-btn">${st.room.phase === 'playing' ? '자리 요청하기' : '참가자로 앉기'}</button>`}</div>
      <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button>`;
    const sit = el.querySelector('#sit-btn');
    if (sit) sit.onclick = async () => { const r = await emit('lobby:role', { spectator: false }); if (r.ok && r.requested) toast('방장에게 자리 요청을 보냈어요. 수락되면 다음 판부터 참가해요', 'ok'); };
    return;
  }
  const h = st.hand;
  const cards = mp.cards && mp.cards[0] !== '??' ? mp.cards : null;
  let handName = '';
  if (cards && h && h.game === 'seotda') {
    const bp = bestPairSeotda(cards);
    handName = rankSeotda(bp[0], bp[1]).name + (cards.length === 3 ? ' (가장 좋은 두 장)' : '');
  } else if (cards && h) {
    const all = cards.concat(h.board);
    if (all.length >= 5) handName = bestHand(all).name;
    else handName = cards[0][0] === cards[1][0] ? '포켓 페어' : '';
  }
  const result = h && h.result;
  const delta = result && result.deltas ? result.deltas[me.id] : undefined;
  el.innerHTML = `
    <div class="me-cards ${mp.status === 'folded' ? 'folded' : ''} ${cards && cards.length === 3 ? 'three' : ''}">
      ${cards ? cards.map((c, k) => cardHTML(c, { size: 'lg', anim: markCard(`${h.no}:me:${k}`), delay: k * 120, cls: h && h.myOpen === k ? 'card-opened' : '', highlight: result && result.hands && result.hands[me.id] && result.hands[me.id].best.includes(c) })).join('') : `<span class="muted">${st.room.phase === 'playing' ? '이번 판은 쉬는 중이에요' : ''}</span>`}
    </div>
    <div class="me-info">
      <div class="me-name">${avatarHTML(mp, 'avatar-sm')}<b>${esc(me.name)}</b>${P.masterBadge(mp.master, true)}${mp.isDealer ? '<span class="dealer-btn">D</span>' : ''}</div>
      <div class="me-stack"><span class="chip-icon"></span><b>${fmt(me.stack)}</b><span class="muted small">내 칩</span></div>
      ${mp.bet ? `<div class="muted small">이번 베팅 ${fmt(mp.bet)}</div>` : ''}
      ${handName ? `<div class="me-hand">${esc(handName)}</div>` : ''}
      ${mp.status === 'folded' ? '<div class="tag tag-folded">폴드함</div>' : ''}
      ${mp.status === 'allin' ? '<div class="tag tag-allin">올인</div>' : ''}
      ${delta !== undefined ? `<div class="me-delta ${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''}">이번 판 ${signed(delta)}</div>` : ''}
    </div>
    <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button>`;
}

function renderActions(st) {
  const el = document.getElementById('g-actions');
  const h = st.hand;
  const la = h && h.legal;
  const sig = JSON.stringify([la, h && h.toActId, h && h.finished, !!(h && h.result), S.raise.open, h && h.no, st.room.nextHandAt, h && h.phase && [h.phase.kind, h.phase.done, h.phase.done || h.phase.watching ? h.phase.waiting : 0], S.pickSel && S.pickSel.cards.join()]); // 고르는 중엔 남은 인원 변화로 다시 그리지 않음 (누른 게 사라지지 않게)
  if (sig === S.actionSig) return;
  S.actionSig = sig;

  if (!h || h.finished) {
    S.raise.open = false;
    el.innerHTML = h && h.finished && !h.result
      ? `<div class="wait-line reveal-line">${h.reveal && h.reveal.allin ? '올인 승부! 카드를 한 장씩 공개하고 있어요' : '패를 공개하고 있어요'}</div>`
      : h && h.finished
      ? `<div class="wait-line"><span data-next>다음 판을 준비하고 있어요</span></div>`
      : `<div class="wait-line">${st.room.waiting ? '참가자를 기다리는 중이에요' : '곧 카드를 나눠 드려요'}</div>`;
    return;
  }
  if (h.phase) { S.raise.open = false; renderSeotdaPhase(el, st); return; }
  if (!la) {
    S.raise.open = false;
    const turnName = nameOf(h.toActId);
    el.innerHTML = `<div class="wait-line"><b>${esc(turnName)}</b>님 차례예요 · <span data-deadline-text>남은 시간 -</span></div>
      <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>`;
    return;
  }

  const potAfterCall = h.totalPot + la.toCall;
  const clamp = (v) => Math.max(la.minTo, Math.min(la.maxTo, Math.round(v)));
  const raiseMode = la.canBet ? 'bet' : la.canRaise ? 'raise' : null;
  const raiseWord = la.canBet ? '베팅' : '레이즈';
  const onlyAllIn = raiseMode && la.minTo >= la.maxTo;
  if (!S.raise.to || S.raise.to < la.minTo || S.raise.to > la.maxTo) S.raise.to = la.minTo;

  const info = [];
  if (la.toCall > 0) info.push(`콜 금액 <b>${fmt(la.callAmount)}</b>${la.callAmount < la.toCall ? ' (칩이 부족해 올인 콜)' : ''}`);
  else info.push('체크할 수 있어요');
  if (raiseMode && !onlyAllIn) info.push(`최소 ${raiseWord} <b>${fmt(la.minTo)}</b>까지`);
  if (la.toCall > 0 && !la.canRaise && la.stack > la.toCall) info.push('레이즈는 할 수 없어요 (불완전 레이즈)');
  info.push(`내 칩 <b>${fmt(la.stack)}</b>`);

  if (S.raise.open && raiseMode && !onlyAllIn) {
    const presets = [
      ['최소', la.minTo],
      ['½ 팟', clamp(la.canBet ? h.totalPot / 2 : h.currentBet + potAfterCall / 2)],
      ['팟', clamp(la.canBet ? h.totalPot : h.currentBet + potAfterCall)],
      ['올인', la.maxTo],
    ];
    const step = Math.max(1, st.room.settings.sb);
    const mine = st.players.find((p) => st.me && p.id === st.me.id);
    const myCards = mine && mine.cards && mine.cards[0] !== '??' ? mine.cards : null;
    el.innerHTML = `
      <div class="raise-sheet">
        <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>
        <div class="raise-top">${myCards ? `<span class="raise-mine">${myCards.map((c) => cardHTML(c, { size: 'sm' })).join('')}</span>` : ''}<span class="grow">${raiseWord} 금액<br><small>이번 라운드 총액</small></span><b class="raise-val" id="raise-val">${fmt(S.raise.to)}</b></div>
        <input type="range" id="raise-range" min="${la.minTo}" max="${la.maxTo}" step="${step}" value="${S.raise.to}" aria-label="${raiseWord} 금액">
        <div class="raise-row"><span class="muted small">${fmt(la.minTo)}</span><span class="muted small">${fmt(la.maxTo)} (올인)</span></div>
        <div class="presets">${presets.map(([t, v]) => `<button class="btn btn-sm btn-outline" data-preset="${v}">${t}</button>`).join('')}</div>
        <div class="act-row raise-actions">
          <button class="btn btn-ghost" id="raise-cancel">취소</button>
          <button class="btn btn-outline step-btn" data-step="-${st.room.settings.bb}" aria-label="${fmt(st.room.settings.bb)} 줄이기">−</button>
          <button class="btn btn-outline step-btn" data-step="${st.room.settings.bb}" aria-label="${fmt(st.room.settings.bb)} 늘리기">+</button>
          <button class="btn btn-gold grow" id="raise-ok"></button>
        </div>
      </div>`;
    const range = el.querySelector('#raise-range');
    const ok = el.querySelector('#raise-ok');
    const upd = () => {
      el.querySelector('#raise-val').textContent = fmt(S.raise.to);
      ok.textContent = S.raise.to >= la.maxTo ? `올인 ${fmt(la.maxTo)}` : `${raiseWord} ${fmt(S.raise.to)}${la.canBet ? '' : '까지'}`;
    };
    upd();
    range.oninput = () => { S.raise.to = Number(range.value); upd(); };
    el.querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => { S.raise.to = Number(b.dataset.preset); range.value = S.raise.to; upd(); }; });
    el.querySelectorAll('[data-step]').forEach((b) => { b.onclick = () => { S.raise.to = clamp(S.raise.to + Number(b.dataset.step)); range.value = S.raise.to; upd(); }; });
    el.querySelector('#raise-cancel').onclick = () => { S.raise.open = false; S.actionSig = ''; renderActions(S.state); tickTimers(); };
    ok.onclick = () => {
      const to = S.raise.to;
      S.raise.open = false;
      if (to >= la.maxTo) doAct({ type: 'allin' });
      else doAct({ type: raiseMode, amount: to });
    };
    tickTimers();
    return;
  }

  const awayNote = st.me && st.me.sittingOut ? '<div class="away-turn">자리 비움 중이에요 — 아래 버튼을 누르면 <b>자리로 돌아가며 바로 행동</b>해요</div>' : '';
  if (h.game === 'seotda') { renderSeotdaActions(el, st, la, info, awayNote); return; }
  el.innerHTML = `${awayNote}
    <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>
    <div class="act-info"><span class="my-turn">내 차례 · <span data-deadline-text>남은 시간 -</span></span><span>${info.join(' · ')}</span></div>
    <div class="act-row">
      <button class="btn act act-fold" data-act="fold" ${la.canFold ? '' : 'disabled'} aria-label="폴드${la.canFold ? '' : ' (체크할 수 있어 불가)'}">폴드<small>다이</small></button>
      ${la.canCheck
        ? '<button class="btn act act-check" data-act="check">체크<small>넘기기</small></button>'
        : `<button class="btn act act-call" data-act="call">${la.callAmount < la.toCall ? '올인 콜' : '콜'}<small>${fmt(la.callAmount)}</small></button>`}
      <button class="btn act act-raise" data-act="raise" ${raiseMode ? '' : 'disabled'}>${onlyAllIn ? '올인' : raiseWord}<small>${raiseMode ? (onlyAllIn ? fmt(la.maxTo) : `${fmt(la.minTo)}~`) : '불가'}</small></button>
      <button class="btn act act-allin" data-act="allin" ${la.canAllIn ? '' : 'disabled'}>올인<small>${fmt(la.stack)}</small></button>
    </div>`;
  el.querySelectorAll('[data-act]').forEach((b) => {
    b.onclick = () => {
      const t = b.dataset.act;
      if (t === 'raise') {
        if (onlyAllIn) { doAct({ type: 'allin' }); return; }
        S.raise.open = true; S.raise.to = la.minTo; S.actionSig = ''; renderActions(S.state); return;
      }
      if (t === 'allin' && !confirm(`${fmt(la.stack)} 올인할까요?`)) return;
      doAct({ type: t });
    };
  });
}

// 세 장 섯다(한 장 공개): 공개할 카드 고르기 · 마지막에 두 장 고르기
function renderSeotdaPhase(el, st) {
  const h = st.hand;
  const ph = h.phase;
  const mine = st.players.find((p) => st.me && p.id === st.me.id);
  const cards = mine && mine.cards && mine.cards[0] !== '??' ? mine.cards : null;
  const bar = '<div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>';
  if (ph.watching || !cards || ph.done) {
    el.innerHTML = `${bar}<div class="wait-line">${ph.kind === 'open' ? '모두 공개할 카드를 고르는 중' : '모두 두 장을 고르는 중'}${ph.done ? ' · 나는 골랐어요' : ''} (${ph.waiting}명 남음) · <span data-deadline-text>남은 시간 -</span></div>`;
    return;
  }
  if (ph.kind === 'open') {
    el.innerHTML = `${bar}
      <div class="act-info"><span class="my-turn">공개할 카드를 한 장 고르세요 · <span data-deadline-text>남은 시간 -</span></span><span>안 고르면 낮은 카드가 자동으로 공개돼요</span></div>
      <div class="sd-pick-row">${cards.slice(0, 2).map((c, i) => `<button class="sd-pick-card" data-open="${i}">${cardHTML(c, { size: 'md' })}<small>이 카드 공개</small></button>`).join('')}</div>`;
    el.querySelectorAll('[data-open]').forEach((b) => { b.onclick = () => { S.pickSel = null; doAct({ type: 'open', index: Number(b.dataset.open) }); }; });
    return;
  }
  // 두 장 고르기: 가장 좋은 두 장이 미리 골라져 있음
  const key = h.no + ':pick';
  if (!S.pickSel || S.pickSel.key !== key) S.pickSel = { key, cards: (ph.best || cards.slice(0, 2)).slice() };
  const sel = S.pickSel.cards;
  const bp = sel.length === 2 ? rankSeotda(sel[0], sel[1]).name : '';
  el.innerHTML = `${bar}
    <div class="act-info"><span class="my-turn">승부할 두 장을 고르세요 · <span data-deadline-text>남은 시간 -</span></span><span>가장 좋은 두 장이 미리 골라져 있어요</span></div>
    <div class="sd-pick-row three">${cards.map((c) => `<button class="sd-pick-card ${sel.includes(c) ? 'on' : ''}" data-pick="${esc(c)}">${cardHTML(c, { size: 'md' })}<small>${sel.includes(c) ? '✔ 선택' : '빼기'}</small></button>`).join('')}</div>
    <button class="btn btn-gold btn-lg sd-pick-ok" id="pick-ok" ${sel.length === 2 ? '' : 'disabled'}>${sel.length === 2 ? `이 두 장으로 승부 · ${esc(bp)}` : '두 장을 골라 주세요'}</button>`;
  el.querySelectorAll('[data-pick]').forEach((b) => {
    b.onclick = () => {
      const c = b.dataset.pick;
      const i = sel.indexOf(c);
      if (i >= 0) sel.splice(i, 1); else { if (sel.length >= 2) sel.shift(); sel.push(c); }
      S.actionSig = ''; renderActions(S.state); tickTimers();
    };
  });
  el.querySelector('#pick-ok').onclick = () => { if (sel.length === 2) doAct({ type: 'pick', cards: sel.slice() }); };
}

// 섯다 베팅: 다이 · 체크 · 삥 · 콜 · 따당 · 하프 · 올인
function renderSeotdaActions(el, st, la, info, awayNote = '') {
  const h = st.hand;
  const bb = h.pot !== undefined ? st.room.tournament && st.room.tournament.running ? st.room.tournament.bb : st.room.settings.bb : st.room.settings.bb;
  const canUp = la.canBet || la.canRaise;
  const clampTo = (v) => Math.max(la.minTo, Math.min(la.maxTo, Math.round(v)));
  const btns = [];
  btns.push(['fold', '다이', '포기', la.canFold || la.canCheck ? { type: la.canFold ? 'fold' : 'check' } : null, 'act-fold']);
  if (la.canCheck) btns.push(['check', '체크', '넘기기', { type: 'check' }, 'act-check']);
  else btns.push(['call', la.callAmount < la.toCall ? '올인 콜' : '콜', fmt(la.callAmount), { type: 'call' }, 'act-call']);
  if (canUp && la.canBet) btns.push(['bbing', '삥', fmt(la.minTo), { type: 'bet', amount: la.minTo }, 'act-raise']);
  if (canUp && la.canRaise) {
    const dd = clampTo(la.currentBet * 2);
    btns.push(['ddadang', '따당', `${fmt(dd)}까지`, dd >= la.maxTo ? { type: 'allin' } : { type: 'raise', amount: dd }, 'act-raise']);
  }
  if (canUp) {
    const half = clampTo(la.currentBet + (h.totalPot + la.toCall) / 2);
    btns.push(['half', '하프', `${fmt(half)}까지`, half >= la.maxTo ? { type: 'allin' } : { type: la.canBet ? 'bet' : 'raise', amount: Math.max(half, la.minTo) }, 'act-raise']);
  }
  btns.push(['allin', '올인', fmt(la.stack), la.canAllIn ? { type: 'allin' } : null, 'act-allin']);
  // 금액을 직접: 슬라이더·½팟·팟·올인 (레이즈 창)
  if (canUp && la.minTo < la.maxTo) btns.push(['custom', '금액 ', '직접 정하기', { custom: true }, 'act-custom']);
  void bb;
  el.innerHTML = `${awayNote}
    <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>
    <div class="act-info"><span class="my-turn">내 차례 · <span data-deadline-text>남은 시간 -</span></span><span>${info.join(' · ')}</span></div>
    <div class="act-row sd-acts ${btns.length > 4 ? 'sd-acts-6' : ''} ${btns.length > 6 ? 'sd-acts-7' : ''}">${btns.map(([k, t, sub, a, c]) => `<button class="btn act ${c}" data-sd="${k}" ${a ? '' : 'disabled'}>${t}<small>${sub}</small></button>`).join('')}</div>`;
  el.querySelectorAll('[data-sd]').forEach((b) => {
    const def = btns.find((x) => x[0] === b.dataset.sd);
    b.onclick = () => {
      if (!def[3]) return;
      if (def[3].custom) { S.raise.open = true; S.raise.to = la.minTo; S.actionSig = ''; renderActions(S.state); return; }
      if (def[3].type === 'allin' && !confirm(`${fmt(la.stack)} 올인할까요?`)) return;
      doAct(def[3]);
    };
  });
}

async function doAct(action) {
  document.querySelectorAll('#g-actions button').forEach((b) => { b.disabled = true; });
  const r = await emit('game:act', action);
  if (!r.ok) { S.actionSig = ''; renderActions(S.state); }
}

// 남은 시간 표시: 글자 + 막대 + 자리 테두리
// 토너먼트 다음 레벨까지 남은 시간
function tickLevel() {
  const now = Date.now() + (S.clockSkew || 0);
  document.querySelectorAll('[data-level-at]').forEach((el) => {
    const left = Math.max(0, Number(el.dataset.levelAt) - now);
    const m = Math.floor(left / 60000); const sec = Math.floor(left / 1000) % 60;
    el.textContent = left > 0 ? `${m}:${String(sec).padStart(2, '0')}` : '다음 판부터';
  });
}
setInterval(tickLevel, 1000);

function tickTimers() {
  const st = S.state;
  if (!st || S.view !== 'room') return;
  const h = st.hand;
  const now = Date.now() + (S.clockSkew || 0);
  if (h && !h.finished && h.deadline) {
    const left = Math.max(0, h.deadline - now);
    const sec = Math.ceil(left / 1000);
    const frac = Math.max(0, Math.min(1, left / (h.turnSeconds * 1000)));
    document.querySelectorAll('[data-deadline-text]').forEach((e) => { e.textContent = `남은 시간 ${sec}초`; });
    document.querySelectorAll('[data-deadline]').forEach((e) => { e.textContent = `차례 ${sec}초`; });
    document.querySelectorAll('[data-deadline-bar]').forEach((e) => {
      e.style.width = (frac * 100) + '%';
      e.classList.toggle('low', sec <= 5);
    });
    document.querySelectorAll('[data-ring]').forEach((e) => {
      e.style.strokeDashoffset = String(126 * (1 - frac));
      e.classList.toggle('low', sec <= 5);
    });
    const meTurn = st.me && h.toActId === st.me.id;
    if (meTurn && sec <= 5 && sec > 0 && S.lastTick !== sec) { S.lastTick = sec; sound.play('tick'); }
    // 5초 남으면 한 번 진동 (설정에서 켜 둔 경우만)
    const vkey = `${h.no}:${h.deadline}`;
    if (meTurn && sec <= 5 && sec > 0 && S.vib5 !== vkey) { S.vib5 = vkey; gws.vibrate([120, 80, 120]); }
  }
  if (st.room.nextHandAt) {
    const s2 = Math.max(0, Math.ceil((st.room.nextHandAt - now) / 1000));
    document.querySelectorAll('[data-next]').forEach((e) => { e.textContent = s2 > 0 ? `다음 판까지 ${s2}초` : '곧 다음 판을 시작해요'; });
  }
}
setInterval(tickTimers, 250);

function openLogModal() {
  const feed = (S.state.feed || []).slice().reverse();
  openModal('베팅 내역', `<ol class="log">${feed.map((e) => `<li class="log-${e.type}">${e.hand ? `<span class="muted tiny">#${e.hand}</span> ` : ''}${esc(e.text)}</li>`).join('') || '<li class="muted">아직 기록이 없어요</li>'}</ol>`);
}

function openMenuModal() {
  const st = S.state;
  const me = st.me;
  const isHost = me && me.isHost;
  const inHand = st.hand && !st.hand.finished && st.players.some((p) => p.id === me.id && p.cards);
  const others = st.players.filter((p) => p.id !== me.id);
  openModal('메뉴', `
    <div class="stack">
      <section><h3 class="sub-title">친구 초대</h3>${inviteHTML(st.room.code)}</section>
      ${isHost && st.pending && st.pending.length ? `<section class="attention"><h3 class="sub-title">참가 요청</h3>
        ${st.pending.map((p) => `<div class="list-row"><b>${esc(p.name)}</b><div class="spacer"></div>
          <button class="btn btn-sm btn-gold" data-approve="${p.id}">수락</button><button class="btn btn-sm btn-outline" data-reject="${p.id}">거절</button></div>`).join('')}</section>` : ''}
      <section><h3 class="sub-title">참가자</h3><div class="plist">${[st.players.find((p) => p.id === me.id), ...others].filter(Boolean).map((p) => playerRowHTML(p, st, isHost)).join('')}</div></section>
      <section><h3 class="sub-title">방 설정</h3>${settingsSummaryHTML(st.room.settings)}</section>
      <div class="stack">
        ${me.role === 'player' ? (me.sittingOut
          ? '<button class="btn btn-outline" data-m="sitin">자리로 돌아가기</button>'
          : '<button class="btn btn-outline" data-m="sitout">자리 비우기 (다음 판부터 빠짐)</button>') : ''}
        ${!inHand && !me.masterPeek ? `<button class="btn btn-outline" data-m="role">${me.role === 'player' ? '관전으로 바꾸기' : '참가자로 앉기'}</button>` : ''}
        ${isHost ? '<button class="btn btn-outline" data-m="end">게임 끝내고 대기실로</button>' : ''}
        <button class="btn btn-outline danger" data-m="leave">방 나가기</button>
        ${P.roomMasterHTML()}
      </div>
    </div>`, (body) => {
    bindInvite(body, st.room.code);
    P.bindRoomMaster(body, st.room.code);
    bindPlayerMenus(body);
    body.querySelectorAll('[data-approve]').forEach((b) => { b.onclick = async () => { await emit('host:approve', { id: b.dataset.approve, ok: true }); closeModal(); }; });
    body.querySelectorAll('[data-reject]').forEach((b) => { b.onclick = async () => { await emit('host:approve', { id: b.dataset.reject, ok: false }); closeModal(); }; });
    body.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = async () => {
        const m = b.dataset.m;
        if (m === 'sitin') await emit('game:sitin');
        if (m === 'sitout') await emit('game:sitout');
        if (m === 'role') await emit('lobby:role', { spectator: me.role === 'player' });
        if (m === 'end') { if (!confirm('게임을 끝내고 대기실로 돌아갈까요?')) return; await emit('host:end'); }
        if (m === 'leave') { await leaveRoom(); return; }
        closeModal();
      };
    });
  }, { wide: true });
}

// ── 연출: 올인 배너, 리버 쪼기, 승리 폭죽 ─────────────────
S.fx = {};
function runEffects(st) {
  const h = st.hand;
  if (!h) return;
  const k = h.no;
  const app = document.getElementById('app');
  const once = (name) => { const key = `${k}:${name}`; if (S.fx[key]) return false; S.fx[key] = 1; return true; };
  if (h.reveal) {
    if (h.reveal.allin && once('allin')) {
      banner('올인 승부!', '', 'allin');
      sound.play('drumroll');
      if (sound.isUnlocked()) gws.vibrate([40, 40, 40]);
    }
    if (!h.reveal.allin && h.reveal.shown > 0 && once(`shown${h.reveal.shown}`)) sound.play('flip');
    if (h.reveal.squeeze && once('squeeze')) {
      sound.play('heartbeat');
      app.classList.add('tension');
    }
    if (h.board.length === 5 && S.runoutHand === k && S.runoutFrom < 5 && once('river')) {
      setTimeout(() => sound.play('impact'), 700);
      app.classList.remove('tension');
    }
  }
  announceHands(st, once);
  if (h.result && once('win')) {
    app.classList.remove('tension');
    celebrate(st);
  }
  for (const key of Object.keys(S.fx)) if (Number(key.split(':')[0]) < k - 2) delete S.fx[key];
}

// 누가 올인하면 화면에 '올~인!' 도장이 쾅
function allinStamp(id) {
  const p = S.state && S.state.players.find((x) => x.id === id);
  const el = document.createElement('div');
  el.className = 'fx-stamp';
  el.innerHTML = `<div class="fx-stamp-main">ALL-IN!</div><div class="fx-stamp-sub">${p ? esc(p.name) + ' 올~인!' : '올~인!'}</div>`;
  fxLayer().appendChild(el);
  sound.play('stamp');
  quake();
  const seat = document.querySelector(`.seat[data-id="${id}"]`);
  if (seat) { seat.classList.add('seat-allin-fx'); setTimeout(() => seat.classList.remove('seat-allin-fx'), 2200); }
  if (sound.isUnlocked()) gws.vibrate([100, 50, 100]);
  setTimeout(() => el.remove(), 1900);
}

function quake() {
  const g = document.querySelector('.game');
  if (!g || gws.reduceMotion()) return;
  g.classList.remove('quake'); void g.offsetWidth; g.classList.add('quake');
  setTimeout(() => g.classList.remove('quake'), 700);
}

// 쇼다운: 공개된 패마다 족보를 음성으로. 플러시 이상은 특별 연출
const HAND_TIERS = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 스트레이트 플러시'];
const BIG_EN = { 5: 'FLUSH', 6: 'FULL HOUSE', 7: 'FOUR OF A KIND', 8: 'STRAIGHT FLUSH', 9: 'ROYAL FLUSH' };
function handTier(cards, board) {
  const sc = bestHand(cards.concat(board)).score;
  return sc.category === 8 && sc.tiebreak[0] === 14 ? 9 : sc.category;
}
const SD_BIG = { '38광땡': 9, '18광땡': 8, '13광땡': 8, '장땡': 7 };
function announceSeotda(st, once) {
  const h = st.hand;
  if (!h || !h.reveal) return;
  const shown = st.players.filter((p) => p.cards && p.cards.length >= 2 && p.cards[0] !== '??' && ['inhand', 'allin'].includes(p.status));
  for (const p of shown) {
    if (!once('ann:' + p.id)) continue;
    const bp = bestPairSeotda(p.cards);
    const r = rankSeotda(bp[0], bp[1]);
    const big = r.tier === 'gwang' || r.tier === 'ddaeng';
    const at = Math.max(Date.now() + 250, S.annAt || 0);
    S.annAt = at + (big ? 2400 : 1000);
    setTimeout(() => {
      handTag(p.id, r.name, big ? 6 : 0);
      if (big) bigHand(SD_BIG[r.name] || 6, p, { en: r.tier === 'gwang' ? 'GWANG-DDAENG' : 'DDAENG', ko: r.name });
      sound.say(r.name);
    }, at - Date.now());
  }
}
function announceHands(st, once) {
  const h = st.hand;
  if (h && h.game === 'seotda') { announceSeotda(st, once); return; }
  if (!h || !h.reveal || h.board.length < 5) return;
  const shown = st.players.filter((p) => p.cards && p.cards.length === 2 && p.cards[0] !== '??' && ['inhand', 'allin'].includes(p.status));
  for (const p of shown) {
    if (!once('ann:' + p.id)) continue;
    const tier = handTier(p.cards, h.board);
    const at = Math.max(Date.now() + 250, S.annAt || 0);
    S.annAt = at + (tier >= 5 ? 2400 : 1000);
    setTimeout(() => {
      handTag(p.id, HAND_TIERS[tier], tier);
      if (tier >= 5) bigHand(tier, p);
      else sound.play('v_h' + tier);
    }, at - Date.now());
  }
}
function handTag(id, text, tier) {
  const handNo = S.state && S.state.hand ? S.state.hand.no : 0;
  const seatEl = document.querySelector(`.seat[data-id="${id}"]`);
  if (seatEl) {
    S.seatHands = S.seatHands || {};
    for (const k of Object.keys(S.seatHands)) if (!k.startsWith(handNo + ':')) delete S.seatHands[k];
    S.seatHands[handNo + ':' + id] = { text, big: tier >= 5 };
    const tagsEl = seatEl.querySelector('.seat-tags');
    if (tagsEl && !tagsEl.querySelector('.tag-hand')) tagsEl.insertAdjacentHTML('afterbegin', `<span class="tag tag-hand tag-hand-in ${tier >= 5 ? 'tag-hand-big' : ''}">${esc(text)}</span>`);
    return;
  }
  const seat = S.state && S.state.me && S.state.me.id === id ? document.querySelector('.me-cards') : null;
  if (!seat) return;
  const at = centerOf(seat);
  const el = document.createElement('div');
  el.className = `fx-handtag ${tier >= 5 ? 'fx-handtag-big' : ''}`;
  el.textContent = text;
  el.style.left = at.x + 'px';
  el.style.top = at.y + 'px';
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 2800);
}
function bigHand(tier, p, custom = null) {
  const el = document.createElement('div');
  el.className = `fx-bighand fx-tier${tier}`;
  el.innerHTML = `<div class="fx-big-rays"></div><div class="fx-big-en">${custom ? custom.en : BIG_EN[tier]}</div><div class="fx-big-ko">${esc(custom ? custom.ko : HAND_TIERS[tier])}!</div><div class="fx-big-who">${esc(p.name)}</div>`;
  fxLayer().appendChild(el);
  sound.play('boom');
  if (!custom) setTimeout(() => sound.play('v_h' + tier, 1.3), 380);
  setTimeout(() => { coinRain(tier >= 8 ? 70 : 36); quake(); }, 450);
  if (sound.isUnlocked()) gws.vibrate([60, 40, 200]);
  setTimeout(() => el.classList.add('out'), 2000);
  setTimeout(() => el.remove(), 2500);
}

function fxLayer() { return document.getElementById('fx-layer') || document.body; }

function banner(title, sub, kind = '', ms = 1800) {
  const el = document.createElement('div');
  el.className = `fx-banner fx-${kind}`;
  el.innerHTML = `<div class="fx-title">${esc(title)}</div>${sub ? `<div class="fx-sub">${sub}</div>` : ''}`;
  fxLayer().appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 500);
  return el;
}

function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

// 팟에서 이긴 사람 자리로 칩이 폭발하듯 날아간다
function burstChips(winners, count) {
  const pot = document.querySelector('.pot-chip') || document.querySelector('.board');
  if (!pot) return;
  const from = centerOf(pot);
  winners.forEach((w, wi) => {
    const seat = document.querySelector(`.seat[data-id="${w}"] .seat-av`);
    if (!seat) return;
    const to = centerOf(seat);
    const n = Math.round(count / winners.length);
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div');
      el.className = 'fx-chip';
      el.style.left = from.x + 'px';
      el.style.top = from.y + 'px';
      fxLayer().appendChild(el);
      const ang = Math.random() * Math.PI * 2;
      const pop = 60 + Math.random() * 90;
      const mx = Math.cos(ang) * pop; const my = Math.sin(ang) * pop - 40;
      const dx = to.x - from.x + (Math.random() - 0.5) * 24; const dy = to.y - from.y + (Math.random() - 0.5) * 24;
      const dur = 900 + Math.random() * 500;
      el.animate([
        { transform: 'translate(0,0) scale(.4) rotate(0deg)', opacity: 0 },
        { transform: `translate(${mx}px,${my}px) scale(1.15) rotate(${180 + Math.random() * 180}deg)`, opacity: 1, offset: 0.35 },
        { transform: `translate(${dx}px,${dy}px) scale(.55) rotate(540deg)`, opacity: 0.9, offset: 0.92 },
        { transform: `translate(${dx}px,${dy}px) scale(.3)`, opacity: 0 },
      ], { duration: dur, delay: wi * 120 + i * 18, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' }).onfinish = () => el.remove();
    }
  });
}

// 내가 이기면 화면 가득 금화·칩이 쏟아진다
function coinRain(n = 46) {
  const W = window.innerWidth; const H = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    el.className = Math.random() < 0.55 ? 'fx-coin' : 'fx-chip fx-chip-lg';
    el.style.left = Math.random() * W + 'px';
    el.style.top = '-40px';
    fxLayer().appendChild(el);
    const drift = (Math.random() - 0.5) * 160;
    el.animate([
      { transform: 'translate(0,0) rotateY(0deg) rotate(0deg)', opacity: 1 },
      { transform: `translate(${drift}px,${H + 80}px) rotateY(${720 + Math.random() * 720}deg) rotate(${Math.random() * 360}deg)`, opacity: 0.9 },
    ], { duration: 1600 + Math.random() * 1400, delay: Math.random() * 900, easing: 'cubic-bezier(.4,.1,.8,.6)', fill: 'both' }).onfinish = () => el.remove();
  }
}

function countUp(el, to, ms = 1200) {
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = '+' + fmt(Math.round(to * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function celebrate(st) {
  const r = st.hand.result;
  if (r.redeal) { banner(`${r.redeal}!`, '판돈을 걸고 재경기', 'level', 2200); sound.play('stamp'); return; }
  const meId = st.me && st.me.id;
  const iWon = r.winners.includes(meId);
  const big = r.type === 'showdown';
  const gain = Math.max(0, ...r.winners.map((w) => r.deltas[w] || 0));
  const huge = st.hand.totalPot >= st.room.settings.startChips; // 시작 칩 이상 걸린 큰 판
  burstChips(r.winners, big ? (huge ? 60 : 36) : 18);
  sound.play('coins');
  if (big || iWon) setTimeout(() => sound.play('fanfare'), 250);
  const names = r.winnerNames.join(', ');
  const handName = big && r.hands[r.winners[0]] ? esc(r.hands[r.winners[0]].name) : '모두 폴드';
  const el = banner(iWon ? '내가 이겼다!' : `${names} 승리`, `<span class="fx-hand">${handName}</span><b class="fx-amt">+0</b>`, iWon ? 'mywin' : 'win', big ? 2600 : 1800);
  countUp(el.querySelector('.fx-amt'), gain);
  if (iWon) {
    coinRain(huge ? 70 : 44);
    const flash = document.createElement('div');
    flash.className = 'fx-flash';
    fxLayer().appendChild(flash);
    setTimeout(() => flash.remove(), 900);
    if (sound.isUnlocked()) gws.vibrate([80, 60, 140]);
  }
}

// 뒤로가기: 보호 기록이 빠지면(= 뒤로가기를 눌렀으면) 화면에 맞게 처리하고 다시 보호를 건다
window.addEventListener('popstate', (e) => {
  if (H.exiting) return;
  const st = e.state || {};
  const n = Number.isFinite(st.n) ? st.n : H.base;
  if (n > H.n) { H.n = n; H.armed = true; return; } // 앞으로 가기로 돌아옴
  H.n = n;
  H.armed = false; H.gesture = false;
  try { history.replaceState({ gw: n > H.base ? 'guard' : 'base', i: H.base, n }, '', H.url); } catch {}
  handleBack();
});
function handleBack() {
  const stay = () => armGuard();
  if (S.launching) { stay(); return; } // 게임 들어가는 중
  if ($modal.querySelector('.modal')) {
    if ($modal.querySelector('[data-exit-ask]')) {
      // 종료 확인 창이 뜬 뒤 2초 안에 또 뒤로 → 진짜 나가기. 늦으면 다시 안내
      if (Date.now() - (H.askAt || 0) < 2000) { reallyExit(); return; }
      H.askAt = Date.now(); toast('한 번 더 누르면 종료돼요'); stay(); return;
    }
    closeModal(); stay(); return;
  }
  const raise = document.getElementById('raise-cancel');
  if (raise) { raise.click(); stay(); return; }
  switch (S.view) {
    case 'room':
      if (S.state) openExitMenu(); else toHome();
      break;
    case 'create': case 'practice':
      S.view = S.game ? 'gamehome' : 'home'; nav('/'); render();
      break;
    case 'pending': {
      const c = $app.querySelector('#cancel');
      if (c) c.click(); else toHome();
      break;
    }
    case 'home': askExit(); break; // 확인 창이 떠 있는 동안에도 보호 (또 뒤로 → 종료)
    case 'boot': break;
    default: toHome(); // gamehome · admin · join · message
  }
  stay();
}
function toHome() { S.code = null; S.view = 'home'; nav('/'); render(); }
function askExit() {
  H.askAt = Date.now();
  toast('한 번 더 누르면 종료돼요');
  openModal('종료하시겠습니까?', `<div class="exit-ask" data-exit-ask>
      <p class="center">조금 더 놀다 가요!<br><span class="muted small">뒤로 가기를 한 번 더 누르면 종료돼요 · 다시 들어오면 로그인은 그대로예요</span></p>
      <div class="row"><button class="btn btn-outline grow" data-close>취소</button><button class="btn btn-gold grow" data-exit-go>종료</button></div>
    </div>`, (body) => { body.querySelector('[data-exit-go]').onclick = reallyExit; }, { onClose: () => armGuard() });
}
function reallyExit() {
  H.exiting = true;
  modalOnClose = null; closeModal();
  let left = false;
  window.addEventListener('pagehide', () => { left = true; }, { once: true });
  const gone = () => left || document.visibilityState === 'hidden';
  let start = NaN;
  try { start = Number(sessionStorage.getItem('gw:startIdx')); } catch {}
  const cur = H.n; // 지금 있는 기록 위치
  if (!Number.isFinite(start) || start > H.base) start = H.base;
  // 사이트에 들어오기 전 페이지가 있으면 거기로 한 번에 (중간의 메인·랑방 대전 기록은 건너뜀)
  if (start > 0) { try { history.go(-(cur - start + 1)); } catch {} }
  setTimeout(() => {
    if (gone()) return;
    try { window.close(); } catch {} // 앱으로 바로 연 경우: 창 닫기 시도
    setTimeout(() => {
      if (gone()) return;
      // 이 탭의 첫 기록이 사이트라 더 뒤로 갈 곳이 없음 → 첫 기록으로 가서, 거기서 뒤로 한 번 더 누르면 종료
      if (cur > 0) {
        try { sessionStorage.setItem('gw:exitHint', '1'); } catch {}
        try { history.go(-cur); } catch {}
        setTimeout(() => { if (!gone()) { try { sessionStorage.removeItem('gw:exitHint'); } catch {} H.exiting = false; H.base = 0; H.n = 0; H.armed = false; toast('뒤로 가기를 한 번 더 누르면 종료돼요'); } }, 400);
        return;
      }
      H.exiting = false;
      toast('뒤로 가기를 한 번 더 누르면 종료돼요');
    }, 250);
  }, 400);
}
if (H.exitHint) setTimeout(() => toast('뒤로 가기를 한 번 더 누르면 종료돼요'), 300);
// 다른 페이지(랑방 대전 등)에서 뒤로 와서 저장된 화면이 그대로 복원될 때: 로딩 화면 · 전환 상태 정리
window.addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  H.exiting = false;
  H.armed = !!(history.state && history.state.gw === 'guard');
  if (history.state && Number.isFinite(history.state.n)) H.n = history.state.n;
  S.launching = false;
  document.querySelectorAll('.gw-loader').forEach((x) => x.remove());
  document.documentElement.classList.remove('gw-leave-dark');
  $app.classList.remove('view-out');
  if (S.view === 'home' && Number(LS.get('gw:lbArtShown', 0)) !== lbChapter()) render(); // 랑방 챕터가 바뀌었으면 카드 그림 갱신
});
// 로고(찬덤)를 누르면 메인으로
document.addEventListener('click', (e) => {
  if (e.target.closest('.logo') && S.view !== 'home') goHome();
});

function goHome() {
  if (S.view !== 'room' || !S.state) { toHome(); return; }
  openExitMenu();
}
RK.init({ S, esc, fmt, signed, openModal, closeModal, render: () => render(), openLogin: () => openLogin() });
P.init({
  S, openModal, closeModal, toast, esc, fmt, signed, render, loadMe, openLogin, setAuth, logout, sound, LS, app: $app,
  watchRoom: (code) => { S.wantSpectate = true; nav('/r/' + code); boot(); },
  showRecoveryCode, nav,
});
boot();

// 디버그/검증용 (자동 테스트에서 상태 확인)
window.__chandem = { S, cardName, sound, fx: { allinStamp, bigHand, handTag, goHome } };
