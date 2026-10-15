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

const AVATAR_COUNT = 10;
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
  const src = p.photo && S.code ? `/api/photo/${encodeURIComponent(S.code)}/${encodeURIComponent(p.id)}?v=${Number(p.photo)}` : `/img/avatars/a${avatarIndex(p)}.webp?v=2`;
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
          <span class="avatar"><img src="/img/avatars/a${n}.webp?v=2" alt="캐릭터 ${n}"></span></label>`).join('')}
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

// 내 캐릭터 · 사진 바꾸기 (첫 화면 '내 정보'에서): 방에 들어갈 때 이 캐릭터·사진으로 앉는다
function openAvatarModal() {
  openModal('내 캐릭터 · 사진', `<form class="form" id="av-form">${avatarPickerHTML()}
    <p class="muted small">「내 사진」을 누르면 폰 사진에서 고를 수 있어요. 사진은 이 폰에만 저장되고, 방에 있는 동안만 친구에게 보여요.</p>
    <button class="btn btn-gold btn-lg" type="submit">저장</button></form>`, (b) => {
    const f = b.querySelector('#av-form');
    bindAvatarPicker(f);
    f.onsubmit = (e) => {
      e.preventDefault();
      if (new FormData(f).get('avatar') === 'photo' && !LS.get('chandem:photo', '')) { toast('사진을 먼저 골라 주세요', 'error'); return; }
      readAvatar(f);
      closeModal(); toast('캐릭터를 바꿨어요', 'ok');
      document.querySelectorAll('.hl-av').forEach((img) => { img.src = myAvatarSrc(); });
    };
  });
}
document.addEventListener('click', (e) => { if (e.target.closest('[data-av-edit]')) openAvatarModal(); });

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

// 화면 맨 위 공유 버튼: 방 안이면 참가·관전·게임 링크 중에서, 아니면 찬덤 주소
function shareTop() {
  const code = S.state && S.state.room && S.state.room.code;
  if (code) shareRoomPick(code, gameOf(S.state));
  else sharePick();
}
const GAME_SHARE = {
  holdem: ['♠ 찬덤 홀덤', '링크 누르고 바로 홀덤 한 판!'],
  seotda: ['섯다', '링크 누르고 바로 섯다 한 판!'],
  omok: ['오목', '링크 누르고 바로 오목 한 판!'],
};
const gameLink = (g) => `${siteUrl().replace(/\/$/, '')}/${g}`;
// 방 안 공유: 이 방 참가 링크 · 관전 링크 · 이 게임 바로가기
function shareRoomPick(code, g) {
  document.querySelectorAll('.share-pick').forEach((m) => m.remove());
  const box = document.createElement('div');
  box.className = 'share-pick';
  const gname = GAME_NAMES[g] || '게임';
  box.innerHTML = `<div class="sp-card"><h3>공유하기</h3>
    <button class="sp-opt" data-sp="join"><img src="/img/og-${g === 'holdem' ? 'holdem2' : g}.jpg" alt="" draggable="false"><span><b>이 방 참가 링크</b><small>방 ${code} · 누르면 바로 이 방으로</small></span></button>
    ${g === 'omok' ? '' : `<button class="sp-opt" data-sp="watch"><img src="/img/og-${g === 'holdem' ? 'holdem2' : g}.jpg" alt="" draggable="false"><span><b>이 방 관전 링크</b><small>자리에 앉지 않고 구경만</small></span></button>`}
    <button class="sp-opt" data-sp="game"><img src="/img/og-${g === 'holdem' ? 'holdem2' : g}.jpg" alt="" draggable="false"><span><b>${gname} 바로가기</b><small>방을 직접 만들거나 고르는 링크</small></span></button>
    <button class="sp-x" data-sp="x">닫기</button></div>`;
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sp]');
    if (ev.target === box || (b && b.dataset.sp === 'x')) { box.remove(); return; }
    if (!b) return;
    box.remove();
    if (b.dataset.sp === 'join') shareLink(inviteUrl(code), '찬이의 게임월드 초대', `찬이의 게임월드 ${gname} 방 ${code}에 들어와!`);
    else if (b.dataset.sp === 'watch') shareLink(`${inviteUrl(code)}?watch=1`, '찬이의 게임월드 관전', `${gname} 방 ${code} 구경하러 와!`);
    else shareLink(gameLink(g), GAME_SHARE[g][0], GAME_SHARE[g][1]);
  });
  document.body.appendChild(box);
}
// 방 밖 공유: 찬이의 게임월드 · 랑방 대전 링크 중에서 고른다 (카톡 미리보기는 각 페이지의 og:image)
function sharePick() {
  document.querySelectorAll('.share-pick').forEach((m) => m.remove());
  const box = document.createElement('div');
  box.className = 'share-pick';
  box.innerHTML = `<div class="sp-card"><h3>공유하기</h3>
    <button class="sp-opt" data-sp="gw"><img src="/img/og-gw5.jpg" alt="" draggable="false"><span><b>찬이의 게임월드</b><small>랑방 대전 · 홀덤 · 섯다 · 오목 모음</small></span></button>
    <button class="sp-opt" data-sp="lb"><img src="/img/og-lb5.jpg" alt="" draggable="false"><span><b>랑방 대전</b><small>바로 게임으로 들어오는 링크</small></span></button>
    <button class="sp-opt" data-sp="holdem"><img src="/img/og-holdem3.jpg" alt="" draggable="false"><span><b>♠ 찬덤 홀덤</b><small>홀덤 화면으로 바로 들어오는 링크</small></span></button>
    <button class="sp-x" data-sp="x">닫기</button></div>`;
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-sp]');
    if (ev.target === box || (b && b.dataset.sp === 'x')) { box.remove(); return; }
    if (!b) return;
    box.remove();
    if (b.dataset.sp === 'holdem') shareLink(gameLink('holdem'), GAME_SHARE.holdem[0], GAME_SHARE.holdem[1]);
    else if (b.dataset.sp === 'lb') shareLink(siteUrl().replace(/\/?$/, '/') + 'langbang/', '랑방 대전', '랑방 대전 도전장! 진상들로부터 우리 아지트 랑방을 같이 지키자');
    else shareLink(siteUrl(), '찬이의 게임월드', '우리 모임 친구들과 폰으로 랑방 대전 · 홀덤 · 섯다 · 오목 한 판 하자!');
  });
  document.body.appendChild(box);
}

const ICON_NOTE = '<p class="muted tiny install-note">이미 설치한 앱 아이콘은 앱을 지우고 다시 설치해야 새 아이콘으로 바뀌어요</p>';
const SHARE_BTN_ONLY = `<button class="btn btn-sm btn-gold share-top" id="share-top" aria-label="공유하기">${P.hubIcon('link', 'hic-sm')}<span class="ib-text"> 공유</span></button>`;
// 앱 설치 버튼(이미 앱으로 열었으면 숨김) + 공유 버튼
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// 앱 설치 버튼: 그 앱 안이 아니면 늘 보인다. 찬이의 게임월드 앱 안의 홀덤 화면에선 '홀덤 앱 설치' (따로 설치)
const installBtnHTML = () => {
  if (!isStandalone() && !HOLDEM_APP && S.view === 'gamehome' && (S.game || 'holdem') === 'holdem') return '<button class="btn btn-sm btn-outline install-btn" id="install-holdem" aria-label="찬덤 홀덤 앱 설치">홀덤 앱 설치</button>'; // 게임월드 주소의 홀덤 화면: 홀덤 앱(/holdem)으로
  if (isStandalone() && HOLDEM_APP && S.view === 'gamehome') return '<button class="btn btn-sm btn-outline install-btn" id="install-gw" aria-label="찬이의 게임월드 앱 설치">게임월드 앱 설치</button>'; // 홀덤 앱 안: 게임월드 앱도 따로
  if (isStandalone() && (HOLDEM_APP || (S.game || 'holdem') !== 'holdem' || S.view !== 'gamehome')) return '';
  if (isStandalone()) return '<button class="btn btn-sm btn-outline install-btn" id="install-holdem" aria-label="찬덤 홀덤 앱 설치">홀덤 앱 설치</button>';
  return '<button class="btn btn-sm btn-outline install-btn" id="install-btn" aria-label="앱 설치">앱 설치</button>';
};
// 게임 첫 화면(홀덤·섯다·오목)에도 설정 톱니: 게임 안에서 음소거한 뒤 배경음악을 다시 켤 수 있게
const GEAR_BTN = () => (S.view === 'gamehome' ? `<button class="btn btn-sm btn-outline gh-gear" id="gh-gear" aria-label="설정 (소리·배경음악)">${P.hubIcon('gear', 'hic-sm')}</button>` : '');
const SHARE_BTN = { toString: () => `<span class="top-btns">${installBtnHTML()}${SHARE_BTN_ONLY}${GEAR_BTN()}</span>` };

// ── 아이폰 사파리 확대 막기 (두 손가락 확대 · 두 번 톡 확대는 CSS touch-action 으로) ──
['gesturestart', 'gesturechange'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

// ── 앱 설치 (PWA) ──────────────────────────────────
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); S.installEvt = e; });
window.addEventListener('appinstalled', () => { S.installEvt = null; LS.set('chandem:installed:' + (HOLDEM_APP ? 'holdem' : 'gw'), Date.now()); installDone(); });
// 홀덤 전용 앱 주소(/holdem)로 열렸는지: 설치하면 '찬덤 홀덤' 앱
const HOLDEM_APP = document.documentElement.dataset.app === 'holdem';
const APP_NAME = HOLDEM_APP ? '찬덤 홀덤' : '찬이의 게임월드';
// 설치했는데 아이콘이 안 보일 때 찾는 법 (삼성·크롬)
const INSTALL_FIND = `<div class="inst-find"><b>바탕화면에 아이콘이 안 보이면?</b><ol>
  <li>홈 화면을 위로 밀어 <b>앱 목록(모든 앱)</b>에서 「${APP_NAME}」를 찾아요</li>
  <li>아이콘을 <b>길게 눌러 → 홈 화면에 추가</b></li>
  <li>그래도 없으면 크롬 <b>⋮ → 「앱 설치」</b>로 다시 해 주세요 (「설치 및 바로가기 만들기」는 크롬 바로가기라 앱이 아니에요)</li></ol></div>`;
function installDone() {
  S.installing = null;
  document.querySelectorAll('#install-bar').forEach((b) => b.remove());
  openModal('설치 완료 ', `<div class="install-wait"><div class="install-ok"></div><p><b>${APP_NAME}${HOLDEM_APP ? '이' : '가'} 설치됐어요!</b></p>
    <p class="muted small">바탕화면이나 앱 목록의 아이콘으로 열면 전체 화면으로 즐길 수 있어요.</p>
    ${INSTALL_FIND}
    ${ICON_NOTE}<button class="btn btn-gold btn-lg" data-close>확인</button></div>`);
  sound.play('fanfare');
}
// ── 기기 판별 (아이패드는 요즘 'Mac + 터치'로 보여서 따로 본다) ──
const UA = navigator.userAgent;
const IS_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh|MacIntel/.test(UA + navigator.platform) && navigator.maxTouchPoints > 1);
const IS_KAKAO = /KAKAOTALK/i.test(UA);
const IS_SAMSUNG = /SamsungBrowser/i.test(UA);
const IN_APP = IS_KAKAO || /NAVER|Instagram|FBAN|FBAV|FB_IAB|Line\/|DaumApps|everytimeApp/i.test(UA);
const IOS_VER = (() => { const m = UA.match(/OS (\d+)[_.](\d+)/); return m ? Number(m[1]) * 100 + Number(m[2]) : 0; })(); // 16.4 → 1604
const IOS_OTHER = IS_IOS && /CriOS|FxiOS|EdgiOS|OPiOS|Whale/i.test(UA); // 아이폰 크롬·파이어폭스 등 (16.4부터 홈 화면 추가 가능)
// 사파리 버전: iOS 26부터 사파리는 주소에 OS 18_6 을 그대로 두고 'Version/26' 만 올린다 → 이걸로 본다
const SAFARI_VER = (() => { const m = !IOS_OTHER && UA.match(/Version\/(\d+)/); return m ? Number(m[1]) : 0; })();
// 삼성 인터넷 '다크 모드'는 사이트가 막을 수 없게 화면 색을 강제로 뒤집는다 (흰 카드 → 검은 카드).
// 사이트 쪽 표시(color-scheme)를 무시해서, 사용자가 설정을 바꾸는 수밖에 없다 → 알기 쉽게 안내
function openColorHelp() {
  openModal('카드가 검게 보이나요?', `<div class="hih">
    <p class="hih-why">${IS_SAMSUNG ? '<b>삼성 인터넷의 「다크 모드」</b>가' : '폰 브라우저의 <b>「어두운 모드(웹페이지 어둡게)」</b>가'} 화면 색을 강제로 뒤집어서 그래요. 흰 카드가 검게, 금색 버튼이 어둡게 보여요. 사이트에서는 막을 수 없어서 설정을 한 번만 바꿔 주세요.</p>
    ${IS_SAMSUNG ? `<div class="hih-way"><b class="hih-tag">방법 1 · 추천</b>
      <ol><li><b>삼성 인터넷</b> 앱을 열어요</li><li>아래 <b>≡ 메뉴 → 설정</b></li><li><b>실험실(Labs)</b> → <b>「웹사이트 다크 테마 사용」</b>을 켜요</li></ol>
      <p class="muted tiny">다크 모드는 그대로 쓰면서 이 게임은 원래 색으로 보여요</p></div>
    <div class="hih-way"><b class="hih-tag">방법 2</b>
      <ol><li>삼성 인터넷 아래 <b>≡ 메뉴</b>를 눌러요</li><li><b>「다크 모드」</b>를 꺼요 (해 모양 · 라이트 모드)</li></ol></div>`
    : `<div class="hih-way"><b class="hih-tag">크롬</b>
      <ol><li>크롬 오른쪽 위 <b>⋮ → 설정 → 테마</b></li><li><b>「웹사이트 어둡게」</b> 체크를 풀어요</li></ol></div>`}
    <p class="muted tiny">바꾼 뒤 이 앱을 완전히 닫았다가 다시 열어 주세요.</p>
    <button class="btn btn-gold btn-lg" data-close type="button">알겠어요</button></div>`);
}
// 삼성 인터넷이면 처음 한 번 알려 준다 (다크 모드가 켜져 있는지는 알아낼 방법이 없어서 '검게 보이면'으로 묻는다)
// (예전에는 삼성 인터넷이면 처음 한 번 띄웠지만, 모두에게 뜨면 번잡해서 없앰 · 메뉴의 '카드가 검게 보여요'로만)
function maybeColorHelp() { return false; }
async function copySiteLink() {
  const url = location.origin + (HOLDEM_APP ? '/holdem' : '/');
  try { await navigator.clipboard.writeText(url); toast('링크를 복사했어요. 사파리 주소창에 붙여 넣어 주세요', 'ok'); }
  catch { prompt('이 주소를 복사해서 사파리에서 열어 주세요', url); }
}
// 아이폰 설치 안내 그림 (SVG)
const SVG_SHARE = '<svg class="ios-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="9" y="14" width="22" height="20" rx="3" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 4v19M13 10l7-7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><rect x="15" y="12" width="10" height="4" fill="var(--ios-bg, #1b1f2a)"/></svg>';
const SVG_ADD = '<svg class="ios-ico" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="6" width="28" height="28" rx="7" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M20 13v14M13 20h14" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';
const SVG_MORE = '<svg class="ios-ico" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="2.4"/><circle cx="13" cy="20" r="2.2" fill="currentColor"/><circle cx="20" cy="20" r="2.2" fill="currentColor"/><circle cx="27" cy="20" r="2.2" fill="currentColor"/></svg>';
// 아이폰: 사파리 26(iOS 26)은 공유 버튼이 ⋯ 메뉴 안으로 들어가고 '웹 앱으로 열기' 스위치가 생겼다 · 그 전 버전은 아래 막대의 공유 버튼
function iosStepsHTML() {
  const notFound = '<p class="muted tiny">목록에 없으면 맨 아래 <b>「동작 편집…」</b>을 눌러 「홈 화면에 추가」를 켜 주세요</p>';
  const lastStep = (n, webApp) => `<li><div class="ios-shot ios-shot-top"><span class="ios-cancel">취소</span><span class="ios-title">홈 화면에 추가</span><b class="ios-hl ios-add">추가</b></div>
        <p><b>${n}</b> ${webApp ? '<b>「웹 앱으로 열기」</b>가 켜져 있는지 확인하고, ' : ''}오른쪽 위 <b>「추가」</b>를 누르면 끝!</p></li>`;
  if (IOS_OTHER) {
    return `<ol class="ios-steps">
      <li><div class="ios-shot ios-shot-bar"><span class="ios-bar"><i></i><i></i><b class="ios-hl">${SVG_SHARE}</b></span></div>
        <p><b>①</b> 주소창 오른쪽의 <b>공유</b> 버튼(네모에 위쪽 화살표)을 눌러요</p></li>
      <li><div class="ios-shot ios-shot-sheet"><span class="ios-row">복사</span><span class="ios-row ios-hl">${SVG_ADD}<b>홈 화면에 추가</b></span></div>
        <p><b>②</b> 목록을 아래로 내려서 <b>「홈 화면에 추가」</b>를 눌러요</p>${notFound}</li>
      ${lastStep('③', false)}
    </ol><p class="muted tiny">안 되면 <b>사파리</b>로 열어서 해 주세요</p>`;
  }
  if (SAFARI_VER >= 26) {
    return `<ol class="ios-steps">
      <li><div class="ios-shot ios-shot-bar"><span class="ios-bar"><i></i><i class="ios-addr"></i><b class="ios-hl">${SVG_MORE}</b></span></div>
        <p><b>①</b> 화면 아래 주소창 오른쪽의 <b>⋯</b> 버튼을 눌러요</p>
        <p class="muted tiny">아래에 <b>공유</b> 버튼(네모에 위쪽 화살표)이 바로 보이면 그걸 눌러도 돼요</p></li>
      <li><div class="ios-shot ios-shot-sheet"><span class="ios-row ios-hl">${SVG_SHARE}<b>공유</b></span><span class="ios-row">즐겨찾기에 추가</span></div>
        <p><b>②</b> 메뉴에서 <b>「공유」</b>를 눌러요</p></li>
      <li><div class="ios-shot ios-shot-sheet"><span class="ios-row">복사</span><span class="ios-row ios-hl">${SVG_ADD}<b>홈 화면에 추가</b></span></div>
        <p><b>③</b> 목록을 아래로 내려서 <b>「홈 화면에 추가」</b>를 눌러요</p>${notFound}</li>
      ${lastStep('④', true)}
    </ol>`;
  }
  return `<ol class="ios-steps">
      <li><div class="ios-shot ios-shot-bar"><span class="ios-bar"><i></i><i></i><b class="ios-hl">${SVG_SHARE}</b><i></i><i></i></span></div>
        <p><b>①</b> 화면 아래 막대 가운데의 <b>공유</b> 버튼(네모에 위쪽 화살표)을 눌러요</p></li>
      <li><div class="ios-shot ios-shot-sheet"><span class="ios-row">복사</span><span class="ios-row">즐겨찾기에 추가</span><span class="ios-row ios-hl">${SVG_ADD}<b>홈 화면에 추가</b></span></div>
        <p><b>②</b> 목록을 아래로 내려서 <b>「홈 화면에 추가」</b>를 눌러요</p>${notFound}</li>
      ${lastStep('③', false)}
    </ol>`;
}
function openIosInstall() {
  if (IN_APP) {
    openModal('아이폰에 앱 설치', `
      <p><b>${IS_KAKAO ? '카카오톡' : '앱'} 안의 브라우저</b>에서는 설치할 수 없어요. <b>사파리로 열어야 설치할 수 있어요.</b></p>
      <p class="muted small">${IS_KAKAO ? '오른쪽 아래 <b>⋯</b> → <b>「다른 브라우저로 열기」</b>를 누르거나, ' : '메뉴(⋯)에서 <b>「Safari로 열기」</b>를 누르거나, '}아래 링크를 복사해서 사파리 주소창에 붙여 넣어 주세요.</p>
      <div class="row"><button class="btn btn-gold grow" id="ios-copy">링크 복사</button>${IS_KAKAO ? `<a class="btn btn-outline grow" href="kakaotalk://web/openExternal?url=${encodeURIComponent(location.origin + (HOLDEM_APP ? '/holdem' : '/'))}">사파리로 열기</a>` : ''}</div>`,
    (b) => { b.querySelector('#ios-copy').onclick = copySiteLink; });
    return;
  }
  if (IOS_OTHER && IOS_VER && IOS_VER < 1604) {
    openModal('아이폰에 앱 설치', `<p>이 브라우저(iOS ${Math.floor(IOS_VER / 100)})에서는 홈 화면에 추가가 안 돼요. <b>사파리로 열어서</b> 다시 앱 설치를 눌러 주세요.</p>
      <button class="btn btn-gold btn-lg" id="ios-copy">링크 복사</button>`, (b) => { b.querySelector('#ios-copy').onclick = copySiteLink; });
    return;
  }
  openModal(`아이폰에 ${APP_NAME} 설치`, `<p class="ios-lead">아이폰은 <b>다운로드가 아니라 「홈 화면에 추가」</b>로 설치해요. 앱스토어에서 받는 게 아니에요.</p>${iosStepsHTML()}
    <p class="muted small">바탕화면에 생긴 ${APP_NAME} 아이콘으로 열면 주소창 없이 전체 화면이에요. 사파리 화면 그대로 열리면, 아이콘을 지우고 「웹 앱으로 열기」를 켠 채 다시 추가해 주세요.</p>${ICON_NOTE}`, null, { wide: true });
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

// 크롬 설치 창 띄우기 (안내를 본 뒤 버튼으로)
async function promptInstall() {
  if (!S.installEvt) { toast('크롬 ⋮ 메뉴 → 「앱 설치」를 눌러 주세요', 'info'); return; }
  S.installEvt.prompt();
  const r = await S.installEvt.userChoice.catch(() => null);
  if (r && r.outcome === 'accepted') {
    S.installEvt = null;
    // 크롬은 진행률을 알려 주지 않아서, 끝났다는 신호(appinstalled)가 올 때까지 '설치 중'을 보여 준다
    S.installing = Date.now();
    openModal('앱 설치 중', `<div class="install-wait"><div class="spinner" aria-hidden="true"></div>
      <p><b>설치하고 있어요…</b></p><p class="small"><b>「안전하지 않은 앱 차단됨」</b>이 뜨면 <b>자세히 → 무시하고 설치</b>를 눌러 주세요</p><p class="muted small">보통 10~30초 걸려요. 끝나면 바탕화면과 앱 목록에 아이콘이 생겨요.</p>
      <p class="muted small" data-install-sec>0초</p>${ICON_NOTE}</div>`);
    const t = setInterval(() => {
      const el = document.querySelector('[data-install-sec]');
      if (!el || !S.installing) { clearInterval(t); return; }
      const sec = Math.round((Date.now() - S.installing) / 1000);
      el.textContent = sec < 60 ? `${sec}초` : '오래 걸리면 알림창이나 바탕화면을 확인해 주세요';
    }, 1000);
  }
}
// 안드로이드: 플레이 스토어 앱이 아니라서 '안전하지 않은 앱 차단됨'(플레이 프로텍트)이 뜰 수 있다 → '무시하고 설치'
function protectHTML() {
  return `<div class="protect">
    <p>설치하다가 아래처럼 <b>「안전하지 않은 앱 차단됨」</b> 창이 뜰 수 있어요. 플레이 스토어를 거치지 않은 앱이라 휴대폰이 보여 주는 안내예요. 찬덤 앱은 안전해요.</p>
    <div class="pt-mock" aria-hidden="true"><b>안전하지 않은 앱 차단됨</b><small>Play 프로텍트에서 이 앱을 인식하지 못했어요…</small>
      <div class="pt-btns"><span class="pt-more">자세히 ▾</span><span>확인</span></div>
      <div class="pt-ignore">무시하고 설치</div></div>
    <ol class="install-steps"><li><b>「확인」은 누르지 마세요</b> (설치가 취소돼요)</li><li><b>「자세히」</b>를 눌러 펼쳐요</li><li><b>「무시하고 설치」</b>를 누르면 끝!</li></ol>
  </div>`;
}
async function installApp() {
  const ua = UA;
  const url = location.origin + (HOLDEM_APP ? '/holdem' : '/');
  const ios = IS_IOS;
  const kakao = IS_KAKAO;
  const inApp = IN_APP;
  if (ios) { openIosInstall(); return; }
  if (S.installEvt && !inApp && !ios) {
    openModal('앱 설치 전에 꼭 보세요', `${protectHTML()}
      <button class="btn btn-gold btn-lg" id="go-install" type="button">알겠어요 · 설치하기</button>`, (b) => {
      b.querySelector('#go-install').onclick = () => { closeModal(); promptInstall(); };
    });
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
  // 크롬이 '설치할 수 있어요' 신호를 안 줬다: 메뉴로 직접 · 「설치 및 바로가기 만들기」만 있으면 다른 찬덤 앱이 이 주소를 맡고 있는 것
  const otherOn = HOLDEM_APP ? LS.get('chandem:installed:gw', 0) : LS.get('chandem:installed:holdem', 0);
  const chromeBtn = !/Chrome\//.test(ua) || IS_SAMSUNG || /EdgA|Whale|OPR/i.test(ua)
    ? `<a class="btn btn-gold btn-lg" href="intent://${location.host}${HOLDEM_APP ? '/holdem' : '/'}#Intent;scheme=https;package=com.android.chrome;end">크롬으로 열기</a><p class="muted tiny center">설치는 <b>크롬</b>에서 하는 게 가장 잘 돼요</p>` : '';
  openModal(`${APP_NAME} 앱 설치`, `${chromeBtn}
    <ol class="install-steps">
      <li>크롬 오른쪽 위 <b>⋮</b> 를 눌러요</li>
      <li>메뉴에서 <b>「앱 설치」</b>를 눌러요</li>
      <li>뜨는 창에서 <b>「설치」</b>를 누르면 바탕화면과 앱 목록에 ${APP_NAME}${HOLDEM_APP ? '이' : '가'} 생겨요</li>
    </ol>
    <details class="hih-more" ${otherOn ? 'open' : ''}><summary>메뉴에 「앱 설치」가 없고 <b>「설치 및 바로가기 만들기」</b>만 있어요</summary>
      <p class="small">크롬이 이 주소를 <b>이미 깔린 ${HOLDEM_APP ? '찬이의 게임월드' : '찬덤 홀덤(예전 방식)'} 앱</b> 것으로 봐서 그래요. 그 메뉴로 만들면 앱이 아니라 <b>크롬 바로가기</b>(주소창이 보이는 화면)만 생겨요.</p>
      ${(HOLDEM_APP ? holdemInstallHelpHTML() : gwInstallHelpHTML()).replace(protectHTML(), '')}</details>
    ${protectHTML()}${ICON_NOTE}`,
  (b) => { const c = b.querySelector('#copy-holdem'); if (c) c.onclick = copyHoldemLink; const g = b.querySelector('#copy-gw'); if (g) g.onclick = copyGwLink; });
}
document.addEventListener('click', (e) => { if (e.target.closest('#install-btn')) installApp(); else if (e.target.closest('#install-pick')) installPick(); else if (e.target.closest('#install-holdem')) installHoldemApp(); else if (e.target.closest('#install-gw')) installGwApp(); else if (e.target.closest('#gh-gear')) P.openSettings(); });
// 찬덤 홀덤 앱 안에서 '게임월드 앱 설치': 크롬(아이폰은 사파리)으로 첫 화면(/?install=gw)을 열어 거기서 설치
function installGwApp() {
  const url = `${location.origin}/?install=gw`;
  if (IS_KAKAO) { location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`; return; }
  if (!isStandalone() && !IN_APP) { location.href = url; return; }
  if (IS_IOS) {
    openModal('찬이의 게임월드 앱 설치', `<p>아이폰은 <b>사파리</b>에서 설치해요.</p>
      <ol class="small"><li>아래 버튼으로 링크를 복사해요</li><li>사파리를 열고 주소창에 붙여 넣어요</li><li>아래 공유 버튼 → <b>홈 화면에 추가</b></li></ol>
      <button class="btn btn-gold btn-lg" id="copy-gw">링크 복사</button>`, (b) => { b.querySelector('#copy-gw').onclick = copyGwLink; });
    return;
  }
  location.href = `intent://${location.host}/?install=gw#Intent;scheme=https;package=com.android.chrome;end`; // 안드로이드: 크롬으로 연다
}
async function copyGwLink() {
  const url = `${location.origin}/?install=gw`;
  try { await navigator.clipboard.writeText(url); toast('복사했어요. 브라우저 주소창에 붙여 넣어 주세요', 'ok'); } catch { prompt('이 주소를 브라우저에서 열어 주세요', url); }
}
// 안드로이드: 예전(10/15 전)에 깐 찬덤 홀덤 앱은 사이트 주소 전체(/)를 맡고 있어서, 크롬이 게임월드 첫 화면도 '홀덤 앱'으로 연다 → 홀덤 앱을 지우고 새로 깔면 된다
function gwInstallHelpHTML() {
  return `<div class="hih">
    <p class="hih-why">찬덤 홀덤 앱을 <b>예전 방식</b>으로 설치한 폰은, 크롬이 게임월드 화면도 홀덤 앱으로 열어서 설치 버튼이 나오지 않아요.</p>
    <div class="hih-way"><b class="hih-tag">이렇게 하면 돼요</b>
      <ol><li>찬덤 홀덤 아이콘을 길게 눌러 <b>삭제</b>해요 <small class="muted">(로그인한 칩·기록은 그대로예요)</small></li>
      <li>크롬에서 <b>chandem.onrender.com/holdem</b> 을 열고 <b>⋮ → 「앱 설치」 → 설치</b>로 홀덤 앱을 <b>먼저</b> 깔아요</li>
      <li>그다음 아래 <b>링크 복사</b> → 크롬 주소창에 붙여 넣고 같은 방법으로 게임월드를 깔아요 <small class="muted">(홀덤 → 게임월드 순서여야 둘 다 깔려요)</small></li></ol></div>
    ${protectHTML()}
    <button class="btn btn-gold btn-lg" id="copy-gw" type="button">게임월드 링크 복사</button></div>`;
}

// 앱 설치 고르기: 찬이의 게임월드 / 찬덤 홀덤 (게임월드 앱 안에서도 홀덤 앱을 깔 수 있게)
function installPick() {
  document.querySelectorAll('.share-pick').forEach((m) => m.remove());
  const box = document.createElement('div');
  box.className = 'share-pick';
  const gwDone = isStandalone() && !HOLDEM_APP;
  box.innerHTML = `<div class="sp-card"><h3>앱 설치</h3>
    <button class="sp-opt sp-app" data-ap="holdem"><img src="/img/holdem-icon-192.png" alt="" draggable="false"><span><b>찬덤 홀덤</b><small>홀덤만 바로 여는 앱 · 토너먼트</small></span></button>
    <button class="sp-opt sp-app" data-ap="gw" ${gwDone ? 'disabled' : ''}><img src="/img/gw2-icon-192.png" alt="" draggable="false"><span><b>찬이의 게임월드</b><small>${gwDone ? '이미 설치됨' : '랑방 대전 · 홀덤 · 섯다 · 오목 모음'}</small></span></button>
    <button class="sp-x" data-ap="x">닫기</button></div>`;
  box.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ap]');
    if (ev.target === box || (b && b.dataset.ap === 'x')) { box.remove(); return; }
    if (!b || b.disabled) return;
    box.remove();
    if (b.dataset.ap === 'gw') installApp(); else installHoldemApp();
  });
  document.body.appendChild(box);
}
// 홀덤 앱은 /holdem 주소에서 설치된다 (그 페이지가 홀덤 앱 정보를 갖고 있음)
function installHoldemApp() {
  const url = `${location.origin}/holdem?install=1`;
  if (HOLDEM_APP && !isStandalone()) { installApp(); return; }
  if (IS_KAKAO) { location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`; return; }
  if (!isStandalone() && !IN_APP) { location.href = url; return; }
  if (IS_IOS) {
    // 아이폰 앱(홈 화면)에서는 사파리를 바로 못 열어서 링크 복사 + 안내
    openModal('찬덤 홀덤 앱 설치', `<p>아이폰은 <b>사파리</b>에서 설치해요.</p>
      <ol class="small"><li>아래 버튼으로 링크를 복사해요</li><li>사파리를 열고 주소창에 붙여 넣어요</li><li>아래 공유 버튼 → <b>홈 화면에 추가</b></li></ol>
      <button class="btn btn-gold btn-lg" id="copy-holdem">링크 복사</button>`, (body) => {
      body.querySelector('#copy-holdem').onclick = async () => { try { await navigator.clipboard.writeText(url); toast('복사했어요. 사파리에 붙여 넣어 주세요', 'ok'); } catch { prompt('이 주소를 사파리에서 열어 주세요', url); } };
    });
    return;
  }
  // 안드로이드 게임월드 앱 안: 게임월드 앱이 이 사이트 주소 전체(/)를 맡고 있어서 크롬이 /holdem 도 '이미 설치됨'으로 본다
  //  → 브라우저로 넘겨도 다시 게임월드 앱이 열리고 설치 버튼이 안 나온다. 되는 방법 두 가지를 안내
  openModal('찬덤 홀덤 앱 설치', holdemInstallHelpHTML(), (b) => { b.querySelector('#copy-holdem').onclick = copyHoldemLink; });
}
async function copyHoldemLink() {
  const url = `${location.origin}/holdem?install=1`;
  try { await navigator.clipboard.writeText(url); toast('복사했어요. 크롬 주소창에 붙여 넣어 주세요', 'ok'); } catch { prompt('이 주소를 크롬에서 열어 주세요', url); }
}
// 안드로이드: 찬이의 게임월드 앱이 깔린 폰에서 홀덤 앱 만들기
function holdemInstallHelpHTML() {
  return `<div class="hih">
    <p class="hih-why">찬이의 게임월드 앱이 깔린 폰은 크롬이 홀덤 화면도 <b>'이미 설치된 앱'</b>으로 봐서, 설치 버튼이 나오지 않아요.</p>
    <div class="hih-way"><b class="hih-tag">이렇게 하면 돼요</b>
      <ol><li>찬이의 게임월드 아이콘을 길게 눌러 <b>삭제</b>해요 <small class="muted">(로그인한 칩·기록은 그대로예요)</small></li>
      <li>아래 <b>링크 복사</b> → 크롬 주소창에 붙여 넣고 <b>⋮ → 「앱 설치」 → 설치</b></li>
      <li>홀덤 앱이 깔리면, 크롬에서 찬이의 게임월드도 다시 설치해요</li></ol></div>
    ${protectHTML()}
    <button class="btn btn-gold btn-lg" id="copy-holdem" type="button">홀덤 앱 링크 복사</button></div>`;
}

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
  // 찬덤 홀덤 앱은 범위가 /holdem 이라 그 안의 주소로 (밖으로 나가면 주소창이 생김)
  if (HOLDEM_APP) { if (url === '/') url = '/holdem'; else if (url.startsWith('/r/')) url = '/holdem' + url; }
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
  const m = location.pathname.match(/^(?:\/holdem)?\/r\/([A-Za-z0-9]{4,8})/);
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
  mergeGuest(r.token);
  { let nx = null; try { nx = sessionStorage.getItem('chandem:next'); sessionStorage.removeItem('chandem:next'); } catch { /* 무시 */ } if (nx === '/langbang/') { setTimeout(() => { location.href = '/langbang/'; }, 400); return; } if (nx === 'sunggu') { S.sgNext = true; setTimeout(() => { if (S.sgNext && !document.getElementById('rc-code')) goSunggu(); }, 1800); } } // 랑방에서 로그인하러 왔으면 바로 돌아간다
  bindSeatToAccount(quiet);
}
// ── 찬덤 홀덤 로비: 이 기기 손님 열쇠 · 지갑 · 티어 ──
function guestCred() {
  let g = LS.get('chandem:guest', null);
  if (!g || !g.id || !g.key) {
    const rnd = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 56]).join('');
    g = { id: 'g' + rnd(15), key: rnd(28) };
    LS.set('chandem:guest', g);
  }
  return g;
}
// 초대 링크(/holdem?ref=코드)로 들어오면 기억해 두었다가 처음 프로필을 만들 때 보낸다
try { const rf = new URLSearchParams(location.search).get('ref'); if (rf && /^[A-Z0-9]{6}$/i.test(rf)) LS.set('chandem:ref', rf.toUpperCase()); } catch { /* 무시 */ }
async function hApi(path, body = {}) {
  try {
    const r = await fetch('/api/holdem' + path, { method: body === null ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(S.auth ? { authorization: 'Bearer ' + S.auth } : {}) }, body: body === null ? undefined : JSON.stringify({ guest: guestCred(), ref: LS.get('chandem:ref', null), ...body }) });
    return await r.json();
  } catch { return { ok: false, message: '서버와 연결할 수 없어요' }; }
}
// 손님으로 쌓은 지갑·기록 → 로그인한 계정으로 (한 번만)
async function mergeGuest(token) {
  const g = LS.get('chandem:guest', null);
  if (!g || LS.get('chandem:guestMerged:' + g.id, false)) return;
  try {
    const r = await (await fetch('/api/holdem/merge', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ guest: g }) })).json();
    LS.set('chandem:guestMerged:' + g.id, true);
    if (r.ok && r.merged) toast(`손님으로 쌓은 칩·기록을 계정으로 옮겼어요 (${fmt(r.stats.hands)}판)`, 'ok');
  } catch { /* 다음에 다시 */ }
}
// 게임 아이콘 (Gemini 로 그린 그림 · /img/icons)
const IC = (n, cls = '') => `<img class="ic3 ${cls}" src="/img/icons/${n}.webp" alt="" draggable="false">`;
// 게임 제목 로고 (Gemini 로 그린 글씨 그림)
const GAME_LOGO = { holdem: '/img/logo/holdem.webp?v=2', seotda: '/img/logo/seotda.webp?v=1', omok: '/img/logo/omok.webp?v=1' };
const tierBadge = (t, sm = '') => (t ? `<span class="tier-badge ${sm}" style="--tc:${t.color}"><i></i>${esc(t.name)}</span>` : `<span class="tier-badge ${sm} placing"><i></i>배치 중</span>`);
function myAvatarSrc() {
  const a = LS.get('chandem:avatar', 0); const ph = LS.get('chandem:photo', '');
  if (a === 'photo' && ph) return ph;
  return `/img/avatars/a${Number(a) >= 1 && Number(a) <= AVATAR_COUNT ? Number(a) : 1}.webp?v=2`;
}
// 연습 테이블 상주 플레이어 (서버 bot.js 의 BOTS 와 같은 순서·그림)
const RESIDENTS = [
  ['냥프로', 1, '신중', '좋은 패가 올 때까지 기다리는 고양이 프로'], ['시바사장', 2, '공격', '레이즈부터 하고 보는 시바 사장님'], ['판다형님', 3, '콜 많음', '웬만하면 따라오는 느긋한 판다'],
  ['토순이', 4, '신중', '조용하지만 쇼다운에선 무서운 토끼'], ['여우신', 5, '공격', '블러핑의 신, 여우'], ['코알라', 6, '콜 많음', '끝까지 따라가 보는 코알라'],
  ['펭펭', 7, '신중', '선글라스 뒤로 패를 숨기는 펭귄'], ['호돌이', 8, '공격', '칩을 걸면 물러서지 않는 호랑이'], ['햄찌', 9, '콜 많음', '작은 팟도 놓치지 않는 햄스터'], ['곰돌이', 10, '신중', '묵직하게 기다리는 곰'],
];
// 오늘의 홀덤 팁 (날마다 바뀜)
const HOLDEM_TIPS = [
  '딜러 자리(버튼)는 가장 늦게 행동해서 제일 유리해요. 여기선 더 넓게 들어가도 돼요.',
  '들어갈 땐 콜보다 레이즈! 먼저 레이즈하면 상대가 접어서 바로 이길 수도 있어요.',
  '팟 오즈: 콜할 금액 ÷ (팟 + 콜할 금액). 내 승률이 이보다 높으면 콜해도 손해가 아니에요.',
  '플랍에서 플러시 드로우(같은 무늬 4장)는 리버까지 약 35% 완성돼요.',
  '양쪽 스트레이트 드로우(예: 5-6-7-8)는 리버까지 약 31% 완성돼요.',
  '큰 판을 진 직후엔 한두 판 쉬어 가요. 흔들릴 때 막 치면 칩이 더 새요.',
  '포켓 페어가 플랍에서 트리플이 될 확률은 약 12%예요.',
  '상대가 갑자기 크게 걸면 강한 패일 때가 많아요. 내 패가 애매하면 접는 것도 실력!',
  '같은 패라도 자리가 앞일수록(먼저 행동할수록) 더 좁게 들어가요.',
  'A-K는 강하지만 아직 완성된 패가 아니에요. 플랍에서 못 맞으면 무리하지 마세요.',
  '블러핑은 상대가 한두 명일 때, 보드가 무서울 때 잘 통해요.',
  '스몰 블라인드 자리는 플랍 뒤 먼저 행동해서 불리해요. 애매한 패는 접어요.',
  '같은 무늬 두 장(수딧)은 다른 무늬보다 승률이 2~3% 정도 높아요. 생각보다 크지 않아요.',
  'A-A는 가장 강한 시작 패지만, 상대가 여럿이면 지는 일도 꽤 있어요. 일찍 키워서 사람을 줄여요.',
  '7-2 다른 무늬는 가장 약한 시작 패로 유명해요. 대부분 접어요.',
  '턴에서 아웃츠(나를 이기게 해 줄 카드) 수 × 2 ≈ 리버에 맞을 확률(%)이에요.',
  '플랍에서 아웃츠 수 × 4 ≈ 리버까지 맞을 확률(%)이에요. 플러시 드로우 9장 → 약 36%.',
  '바닥에 같은 무늬가 3장 깔리면 누군가 플러시일 수 있어요. 조심!',
  '바닥에 페어가 깔리면 풀하우스·포카드가 나올 수 있어요.',
  '체크는 공짜로 다음 카드를 보는 것. 아무도 안 걸었으면 체크해도 돼요.',
  '콜만 계속하면(콜링 스테이션) 블러프에 당하기 쉬워요. 가끔은 레이즈나 폴드로!',
  '베팅 크기는 팟의 ½~¾ 정도가 무난해요. 너무 작으면 상대가 싸게 따라와요.',
  '칩이 빅 블라인드의 10배 아래로 줄면 올인 아니면 폴드가 더 나을 때가 많아요.',
  '프리플랍 레이즈는 보통 빅 블라인드의 2.5~3배 정도로 해요.',
  '내가 먼저 레이즈했으면 플랍에서 한 번 더 거는 것(C벳)이 잘 통해요.',
  '상대가 오래 고민하다 체크하면 약한 패일 때가 많아요.',
  '토너먼트에선 살아남는 게 먼저! 큰 승부는 확실할 때만.',
  '좋은 패가 안 올 땐 기다리는 것도 실력이에요. 대부분의 판은 접는 게 맞아요.',
  '킥커: 같은 페어끼리는 남은 카드가 높은 쪽이 이겨요. A-K의 K가 킥커예요.',
  '스트레이트에서 A는 가장 높게(10-J-Q-K-A)도, 가장 낮게(A-2-3-4-5)도 쓸 수 있어요.',
  '같은 족보면 더 높은 카드로 비교하고, 완전히 같으면 팟을 나눠 가져요(찹).',
  '모르는 말이 나오면 내 정보 탭의 「용어집」을 열어 보세요.',
];
const todayTip = () => HOLDEM_TIPS[Math.floor(Math.random() * HOLDEM_TIPS.length)];
// 첫 화면 팁 한 줄: 8초마다 다른 팁으로 (화면을 떠나면 멈춤)
function rotateTip() {
  clearInterval(S.tipT);
  let i = Math.floor(Math.random() * HOLDEM_TIPS.length);
  const show = () => { const el = document.querySelector('.hl-tip1 span'); if (!el) { clearInterval(S.tipT); return; } i = (i + 1) % HOLDEM_TIPS.length; el.style.opacity = '0'; setTimeout(() => { el.textContent = HOLDEM_TIPS[i]; el.style.opacity = '1'; }, 250); };
  S.tipT = setInterval(show, 8000);
  const el = document.querySelector('.hl-tip1'); if (el) el.onclick = show; // 누르면 바로 다음 팁
}
function residentsHTML() {
  return `<div class="hl-res">${RESIDENTS.map(([n, a, st, d]) => `<div class="hr-card"><img src="/img/avatars/a${a}.webp?v=2" alt="" loading="lazy"><b>${n}</b><span class="hr-style hr-${st === '신중' ? 'tight' : st === '공격' ? 'aggro' : 'loose'}">${st}</span><small>${d}</small></div>`).join('')}</div>`;
}
const recentDots = (s) => (s ? `<span class="hl-recent" title="최근 10판">${[...s].map((c) => `<i class="${c === 'W' ? 'w' : 'l'}"></i>`).join('')}</span>` : '');
function hlMeHTML(me) {
  if (!me) return '<p class="muted small">불러오는 중…</p>';
  const ev = me;
  const name = esc(me.name || LS.get('chandem:name', '') || '닉네임 정하기');
  return `<div class="hl-me-top">
      <button class="hl-av-edit" type="button" data-av-edit aria-label="캐릭터 · 사진 바꾸기"><img class="hl-av" src="${myAvatarSrc()}" alt=""><i>바꾸기</i></button>
      <div class="hl-who"><b>${name}</b>${tierBadge(ev.tier)}${ev.tier ? `<small class="hl-score">${ev.score}점</small>` : ''}
        ${(me.titles || []).length ? `<span class="hl-title">${IC('crown', 'ic-in')}${esc(me.titles[me.titles.length - 1])}</span>` : ''}
        <span class="hl-sub">${ev.placement ? `배치까지 ${ev.placement}판` : `${ev.rank ? `전체 ${fmt(ev.rank.rank)}위 · ` : ''}${fmt(ev.stats.hands)}판 · 승률 ${ev.stats.winRate}%`}${ev.style ? ` · ${esc(ev.style)}` : ''}</span>${recentDots(me.recent)}</div>
      <button class="hl-ana" id="hl-ana" type="button">실력<br>분석</button>
    </div>
    <div class="hl-wallet">
      <span class="chip-icon"></span><b>${fmt(me.wallet)}</b><small>내 칩</small>
      <button class="btn btn-sm ${me.canRefill ? 'btn-gold' : 'btn-outline'}" id="hl-refill" ${me.canRefill ? '' : 'disabled'}>충전 ${me.refillsLeft}/3</button>
    </div>
    <p class="hl-note">칩이 기본금 ${fmt(me.base)} 아래로 떨어지면 하루 3번 기본금으로 충전돼요 · 매일 0시에 다시 3번${me.key === 'guest' && !S.user ? ' · <a href="#" id="hl-login">로그인하면 이 기록이 계정으로 옮겨져요</a>' : ''}</p>`;
}
function hlTablesHTML(tables, me) {
  return tables.map((t) => {
    const can = me && me.wallet >= t.buy[0];
    return `<button class="hl-table ${can ? '' : 'locked'}" data-table="${t.id}" type="button">
      <span class="ht-felt"><b>${fmt(t.sb)}/${fmt(t.bb)}</b><small>${t.seats}인</small></span>
      <span class="ht-main"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small><small class="ht-buy">바이인 ${fmt(t.buy[0])} ~ ${fmt(t.buy[1])}${t.playing ? ` · ${t.playing}명 치는 중` : ''}</small></span>
      <span class="ht-go">${can ? '입장' : '칩 부족'}</span></button>`;
  }).join('');
}
function openAnalysis(me) {
  const p = me.parts || {}; const s = me.stats || {};
  const bar = (k, label, v, tip) => `<div class="ana-row"><span>${label}</span><div class="ana-bar"><i style="width:${v}%"></i></div><b>${v}</b><small>${tip}</small></div>`;
  openModal('내 실력 분석', `<div class="ana">
    <div class="ana-head">${tierBadge(me.tier)}<b>${me.score}점</b>${me.style ? `<span class="ana-style">${esc(me.style)}</span>` : ''}</div>
    <p class="muted small">연습 테이블에서 친 판으로 계산해요. ${me.placement ? `<b>${me.placement}판</b> 더 치면 티어가 정해져요.` : ''} 판이 적을 땐 점수를 중간으로 당겨서 운이 덜 섞이게 해요.</p>
    ${bar('P', '시작 패 고르기', p.P || 0, '자리에 맞는 패로만 들어갔나 · 콜로만 들어가는 판은 적게')}
    ${bar('D', '큰 결정', p.D || 0, '리버·올인 앞에서 팟 오즈대로 콜/폴드 했나')}
    ${bar('A', '공격성', p.A || 0, '좋은 패는 콜보다 베팅·레이즈로')}
    ${bar('S', '끝까지 승부', p.S || 0, '끝까지 갈 때 이기는가 · 너무 자주 따라가지 않나')}
    ${bar('R', '결과', p.R || 0, '판당 손익 (운을 고려해 천천히 반영)')}
    <div class="stat-grid pc-grid">
      <span>판 수</span><b>${fmt(s.hands || 0)}</b><span>승률</span><b>${s.winRate || 0}%</b>
      <span>판 참여율</span><b>${s.vpip || 0}%</b><span>먼저 레이즈한 비율</span><b>${s.pfr || 0}%</b>
      <span>공격 비율 (베팅÷콜)</span><b>${s.af || 0}</b><span>끝까지 간 비율 / 거기서 이김</span><b>${s.wtsd || 0}% / ${s.wsd || 0}%</b>
      <span>100판당 손익</span><b class="${s.bb100 > 0 ? 'plus' : s.bb100 < 0 ? 'minus' : ''}">빅블라인드 ${s.bb100 > 0 ? '+' : ''}${s.bb100 || 0}개</b><span>큰 결정 정확도</span><b>${s.decRate == null ? '-' : s.decRate + '%'}</b>
      <span>흔들림 지수</span><b>${s.tilt || 0}</b><span>최고 족보</span><b>${s.best ? esc(s.best) : '-'}</b>
    </div>
    ${(me.tips || []).length ? `<h3 class="sub-title">이렇게 해 보세요</h3><ul class="ana-tips">${me.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
    <p class="muted tiny">티어: 브론즈 → 실버 → 골드 → 플래티넘 → 다이아(150판↑) → 마스터(400판↑) → 그랜드마스터(800판↑)</p>
  </div>`, null, { wide: true });
}
// ── 출석 ──
function renderCheckin(me) {
  const el = document.getElementById('hl-checkin');
  if (!el || !me || !me.checkin) return;
  const c = me.checkin;
  el.innerHTML = `<div class="sec-head"><h2 class="sec-title">출석 보상</h2><small class="muted">${c.streak ? `${c.streak}일 연속` : '오늘부터 시작'}</small></div>
    <div class="ci-days">${c.rewards.map((v, i) => `<div class="ci-day ${i + 1 < c.day || (c.done && i + 1 === c.day) ? 'done' : ''} ${i + 1 === c.day && !c.done ? 'today' : ''} ${i === 6 ? 'big' : ''}"><small>${i + 1}일</small><b>${v >= 10000 ? v / 10000 + '만' : fmt(v)}</b></div>`).join('')}</div>
    ${c.done ? '<p class="muted small center">오늘 출석 완료! 내일 또 와요</p>' : `<button class="btn btn-gold" id="ci-go">출석 체크 · +${fmt(c.rewards[c.day - 1])}칩</button>`}`;
  const b = el.querySelector('#ci-go');
  if (b) b.onclick = async () => { b.disabled = true; const r = await hApi('/checkin'); if (r.ok) { sound.play('collect'); toast(`출석 ${r.streak}일째! +${fmt(r.reward)}칩`, 'ok'); } else toast(r.message, 'error'); loadHoldemLobby(); };
}
// ── 정기 토너먼트 ──
const left = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
async function renderDaily() {
  const el = document.getElementById('hl-daily');
  if (!el) return;
  let d = null;
  try { d = await (await fetch('/api/holdem/daily', { cache: 'no-store' })).json(); } catch { return; }
  if (!d || !d.ok) return;
  const now = Date.now() + (S.clockSkew || 0);
  const open = !!d.code;
  el.innerHTML = `<div class="dl-top"><span class="dl-badge">매일 밤 9시</span><b>정기 토너먼트</b></div>
    <p class="dl-sub">${open ? (d.phase === 'playing' ? `진행 중 · ${d.players}명 참가` : `등록 중 · ${d.players}명 · ${left(d.start - now)} 뒤 시작`) : `시작까지 ${left(d.start - now)} · 10분 전에 방이 열려요`}</p>
    <div class="dl-prize"><span>${IC('trophy')}1등 ${fmt(d.prizes[0])}</span><span>${IC('medal')}2등 ${fmt(d.prizes[1])}</span><span>${IC('ribbon')}3등 ${fmt(d.prizes[2])}</span><small>칩 · 시작 칩 ${fmt(d.startChips)} · ${d.levelMinutes}분마다 블라인드↑ · 2레벨까지 리바이 1번</small></div>
    ${open ? `<button class="btn btn-gold" id="dl-go">${d.phase === 'playing' ? '관전하기' : '참가하기'}</button>` : `<button class="btn btn-outline" id="dl-bell">${IC('bell')}10분 전에 알림 받기</button>`}`;
  const go = el.querySelector('#dl-go');
  if (go) go.onclick = () => { S.wantSpectate = d.phase === 'playing'; nav('/r/' + d.code); boot(); };
  const bell = el.querySelector('#dl-bell');
  if (bell) bell.onclick = () => subscribeDaily(bell);
}
async function subscribeDaily(btn) {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast(IS_IOS ? '아이폰은 홈 화면에 앱을 설치한 뒤에 알림을 받을 수 있어요' : '이 브라우저에서는 알림을 받을 수 없어요', 'error'); return; }
    const k = await (await fetch('/api/push/key')).json();
    if (!k.ok) { toast('지금은 알림 기능이 꺼져 있어요', 'error'); return; }
    const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (perm !== 'granted') { toast('알림이 막혀 있어요 · 브라우저 설정에서 허용해 주세요', 'error'); return; }
    const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;
    const pad = '='.repeat((4 - (k.key.length % 4)) % 4);
    const raw = atob((k.key + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)) }));
    const r = await (await fetch('/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json', ...(S.auth ? { authorization: 'Bearer ' + S.auth } : {}) }, body: JSON.stringify({ subscription: sub.toJSON(), add: ['holdemTour'] }) })).json();
    if (r.ok) { toast('매일 밤 8시 50분에 알려 드릴게요', 'ok'); if (btn) { btn.innerHTML = `${IC('bell')}알림 켜짐`; btn.disabled = true; } }
    else toast(r.message || '알림을 켜지 못했어요', 'error');
  } catch (e) { toast('알림을 켜지 못했어요', 'error'); }
}
// ── 꾸미기: 카드 뒷면 · 테이블 색 (게임 화면에도) ──
function saveCosmetic(items) { if (!items) return; LS.set('chandem:cos', { back: items.back, felt: items.felt }); applyCosmetic(); }
function applyCosmetic() { const c = LS.get('chandem:cos', {}) || {}; document.body.dataset.back = c.back || 'back-red'; document.body.dataset.felt = c.felt || 'felt-red'; }
applyCosmetic();
// ── 미션 · 업적 · 상점 · 명장면 · 초대 창 ──
function openLife(kind) {
  const me = S.hl && S.hl.me;
  if (!me) return;
  if (kind === 'missions') {
    openModal('오늘의 미션', `<p class="muted small">연습 테이블에서 친 판으로 채워져요 · 매일 0시에 새 미션</p><div class="mis-list">${me.missions.map((m) => `<div class="mis ${m.claimed ? 'claimed' : ''}"><div class="mis-top"><b>${esc(m.name)}</b><span>+${fmt(m.reward)}칩</span></div>
      <div class="ana-bar"><i style="width:${Math.round((m.prog / m.goal) * 100)}%"></i></div>
      <div class="mis-bot"><small>${m.prog} / ${m.goal}</small>${m.claimed ? '<small class="muted">받음</small>' : m.prog >= m.goal ? `<button class="btn btn-sm btn-gold" data-claim="${m.id}">받기</button>` : ''}</div></div>`).join('')}</div>`, (b) => {
      b.querySelectorAll('[data-claim]').forEach((x) => { x.onclick = async () => { x.disabled = true; const r = await hApi('/mission', { id: x.dataset.claim }); if (r.ok) { sound.play('collect'); toast(`미션 완료! +${fmt(r.reward)}칩`, 'ok'); S.hl.me = r.me; openLife('missions'); loadHoldemLobby(); } else toast(r.message, 'error'); }; });
    });
  } else if (kind === 'ach') {
    const got = me.ach.filter((a) => a.at).length;
    openModal(`업적 ${got} / ${me.ach.length}`, `<div class="ach-grid">${me.ach.map((a) => `<div class="ach ${a.at ? 'got' : ''}"><span>${IC(a.icon)}</span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small>${a.reward ? `<em>+${fmt(a.reward)}</em>` : ''}</div>`).join('')}</div>
      ${(me.titles || []).length ? `<h3 class="sub-title">칭호</h3><ul class="ana-tips">${me.titles.map((t) => `<li>${IC('crown', 'ic-in')}${esc(t)}</li>`).join('')}</ul>` : ''}`, null, { wide: true });
  } else if (kind === 'shop') {
    const it = me.items;
    const card = (x) => `<button class="shop-it ${it.owned.includes(x.id) ? 'owned' : ''} ${it[x.kind] === x.id ? 'on' : ''}" data-buy="${x.id}" type="button">
      <span class="shop-prev k-${x.kind}" data-v="${x.id}">${x.kind === 'back' ? '<i class="card card-md card-back"><span class="card-back-mark">찬</span></i>' : '<i></i>'}</span>
      <b>${esc(x.name)}</b><small>${it[x.kind] === x.id ? '사용 중' : it.owned.includes(x.id) ? '가지고 있음 · 끼우기' : x.price ? `${fmt(x.price)}칩` : '기본'}</small></button>`;
    openModal('꾸미기 상점', `<p class="muted small">칩으로 사면 바로 적용돼요 · 내 칩 <b>${fmt(me.wallet)}</b></p>
      <h3 class="sub-title">카드 뒷면</h3><div class="shop-grid">${it.shop.filter((x) => x.kind === 'back').map(card).join('')}</div>
      <h3 class="sub-title">테이블 색</h3><div class="shop-grid">${it.shop.filter((x) => x.kind === 'felt').map(card).join('')}</div>`, (b) => {
      b.querySelectorAll('[data-buy]').forEach((x) => { x.onclick = async () => {
        const item = it.shop.find((y) => y.id === x.dataset.buy);
        if (!it.owned.includes(item.id) && !confirm(`${item.name}을(를) ${fmt(item.price)}칩에 살까요?`)) return;
        const r = await hApi('/shop', { item: item.id });
        if (r.ok) { if (r.bought) { toast(`${r.bought} 샀어요!`, 'ok'); sound.play('collect'); } S.hl.me = r.me; saveCosmetic(r.me.items); openLife('shop'); loadHoldemLobby(); } else toast(r.message, 'error');
      }; });
    }, { wide: true });
  } else if (kind === 'replays') {
    openModal('명장면 다시보기', me.replays.length ? `<p class="muted small">큰 팟 · 올인 승부 · 스트레이트 이상 판이 자동으로 남아요 (최근 20개)</p><div class="rp-list">${me.replays.map((r) => `<button class="rp-it ${r.won ? 'won' : ''}" data-rp="${r.id}" type="button"><span>${IC(r.won ? 'trophy' : 'fire')}</span><b>${esc(r.title)}</b><small>${hhmm(r.at)} · 팟 ${fmt(r.pot)}</small></button>`).join('')}</div>`
      : '<p class="muted">아직 명장면이 없어요. 연습 테이블에서 큰 판을 쳐 보세요!</p>', (b) => {
      b.querySelectorAll('[data-rp]').forEach((x) => { x.onclick = () => openReplay(x.dataset.rp); });
    });
  } else if (kind === 'invite') {
    const url = `${location.origin}/holdem?ref=${me.refCode}`;
    openModal('친구 초대', `<div class="inv-box"><p>이 링크로 친구가 들어와 <b>연습 테이블에서 첫 판</b>을 치면<br><b>나와 친구 모두 ${fmt(me.referReward)}칩</b>!</p>
      <div class="inv-code">${esc(me.refCode)}</div><p class="muted small">지금까지 초대한 친구 <b>${me.refCount}명</b> (최대 20명까지 보상)</p>
      <button class="btn btn-gold btn-lg" id="inv-share">초대 링크 보내기</button></div>`, (b) => {
      b.querySelector('#inv-share').onclick = () => shareLink(url, '찬덤 홀덤', `찬덤 홀덤에서 같이 홀덤 치자! 이 링크로 들어오면 둘 다 ${fmt(me.referReward)}칩 🎁`);
    });
  }
}
// ── 다시보기 화면: 한 수씩 재생 ──
async function openReplay(id) {
  let r;
  try { r = await (await fetch('/api/holdem/replay/' + encodeURIComponent(id), { cache: 'no-store' })).json(); } catch { r = null; }
  if (!r || !r.ok) { toast((r && r.message) || '다시보기를 불러오지 못했어요', 'error'); return; }
  const x = r.replay;
  const nameOf = (pid) => (x.seats.find((s) => s.id === pid) || {}).name || '?';
  const W = { blind: '블라인드', ante: '앤티', fold: '폴드', check: '체크', call: '콜', bet: '베팅', raise: '레이즈', allin: '올인', return: '돌려받음' };
  let step = 0; let timer = null;
  const frame = () => {
    let board = []; let pot = 0; const lines = []; const folded = new Set(); const stacks = Object.fromEntries(x.seats.map((s) => [s.id, s.start]));
    for (let i = 0; i < Math.min(step, x.log.length); i++) {
      const e = x.log[i];
      if (e.t === 'street') { board = e.b || board; lines.push(`— ${({ 3: '플랍', 4: '턴', 5: '리버' })[board.length] || ''} —`); continue; }
      if (e.t === 'return') { pot -= e.a || 0; stacks[e.id] += e.a || 0; continue; }
      if (e.t === 'fold') folded.add(e.id);
      pot += e.a || 0; if (e.a) stacks[e.id] -= e.a;
      lines.push(`${nameOf(e.id)} ${W[e.t] || e.t}${e.a ? ` ${fmt(e.t === 'raise' || e.t === 'bet' ? e.to : e.a)}` : ''}`);
    }
    const end = step >= x.log.length;
    if (end) board = x.board;
    return `<div class="rp-view">
      <div class="rp-title">${esc(x.title)}<small>${esc(x.table)} · ${fmt(x.sb)}/${fmt(x.bb)} · ${esc(x.owner)}</small></div>
      <div class="rp-felt"><div class="rp-board">${[0, 1, 2, 3, 4].map((k) => cardHTML(board[k] || null, { size: 'sm' })).join('')}</div><b class="rp-pot">팟 ${fmt(Math.max(0, pot))}</b></div>
      <div class="rp-seats">${x.seats.map((s) => `<div class="rp-seat ${folded.has(s.id) ? 'folded' : ''} ${end && (x.winners || []).includes(s.id) ? 'win' : ''} ${s.me ? 'me' : ''}"><img src="/img/avatars/a${s.avatar || 1}.webp?v=2" alt=""><b>${esc(s.name)}</b><span>${(s.hole || ['??', '??']).map((c) => cardHTML(c || '??', { size: 'xs' })).join('')}</span><small>${end && x.deltas ? signed(x.deltas[s.id] || 0) : fmt(stacks[s.id])}</small></div>`).join('')}</div>
      <ol class="rp-log">${lines.slice(-6).map((l) => `<li>${esc(l)}</li>`).join('')}</ol>
      <div class="rp-ctl"><button class="btn btn-sm btn-outline" data-rc="prev">◀</button><button class="btn btn-sm btn-gold" data-rc="play">${timer ? '⏸ 멈춤' : '▶ 재생'}</button><button class="btn btn-sm btn-outline" data-rc="next">▶</button><button class="btn btn-sm btn-outline" data-rc="share">공유</button></div>
      <div class="rp-prog"><i style="width:${Math.round((step / x.log.length) * 100)}%"></i></div></div>`;
  };
  const draw = () => {
    const body = document.querySelector('#modal-root .modal-body');
    if (!body || !body.querySelector('.rp-view')) { clearInterval(timer); timer = null; return; }
    body.innerHTML = frame();
    bind(body);
  };
  const bind = (body) => body.querySelectorAll('[data-rc]').forEach((b) => { b.onclick = () => {
    const k = b.dataset.rc;
    if (k === 'prev') step = Math.max(0, step - 1);
    if (k === 'next') step = Math.min(x.log.length, step + 1);
    if (k === 'play') { if (timer) { clearInterval(timer); timer = null; } else { if (step >= x.log.length) step = 0; timer = setInterval(() => { step++; if (step >= x.log.length) { clearInterval(timer); timer = null; sound.play('collect'); } else sound.play(x.log[step - 1].t === 'street' ? 'flip1' : x.log[step - 1].t === 'fold' ? 'fold' : x.log[step - 1].t === 'check' ? 'knock' : 'chips'); draw(); }, 700); } }
    if (k === 'share') { shareLink(`${location.origin}/holdem?replay=${x.id}`, '찬덤 홀덤 명장면', `${x.title} · 찬덤 홀덤 명장면 다시보기`); return; }
    draw();
  }; });
  openModal('명장면 다시보기', frame(), (body) => bind(body), { wide: true });
}
function bindRankTabs(rk) {
  document.querySelectorAll('[data-rt]').forEach((b) => { b.onclick = () => { S.rankTab = b.dataset.rt; const box = document.getElementById('hl-rank-box'); if (box) { box.innerHTML = hlRankHTML(rk); bindRankTabs(rk); } }; });
}
// 시즌 마감 D-day: 7일 남으면 'D-7' 표시 · 3일 안이면 빨갛게 깜빡 · 마지막 날은 'D-DAY'
function seasonDday(endsAt) {
  const ms = endsAt - Date.now();
  if (!(ms > 0) || ms > 7 * 864e5) return '';
  const d = Math.ceil(ms / 864e5);
  return `<span class="dday ${d <= 3 ? 'hot' : ''}">${ms < 864e5 ? 'D-DAY' : 'D-' + d}</span>`;
}
function hlRankHTML(r) {
  if (!r || !r.ok) return '<p class="muted small">순위를 불러오지 못했어요</p>';
  const tab = S.rankTab || 'season';
  const tabs = `<div class="hist-tabs"><button type="button" class="${tab === 'season' ? 'on' : ''}" data-rt="season">이번 시즌</button><button type="button" class="${tab === 'all' ? 'on' : ''}" data-rt="all">전체</button></div>`;
  if (tab === 'season' && r.season) {
    const s = r.season;
    const [y, m] = s.id.split('-');
    return `${tabs}<p class="season-head">${seasonDday(s.endsAt)}<b>${y}년 ${Number(m)}월 시즌</b> · ${left(s.endsAt - Date.now())} 남음<br><small>시즌 끝 1~3등: 칭호 + ${s.prizes.map(fmt).join(' / ')}칩</small></p>
      ${s.prev && s.prev.top && s.prev.top.length ? `<p class="muted small">지난 시즌: ${s.prev.top.map((x, i) => `${i + 1}위 ${esc(x.name)}`).join(' · ')}</p>` : ''}
      ${s.top.length ? `<ol class="hl-rank">${s.top.slice(0, 15).map((x) => `<li><span class="hr-n">${x.rank}</span><b>${esc(x.name)}</b>${tierBadge(x.tier, 'sm')}<small>${x.score}점 · 승률 ${x.winRate}% · ${fmt(x.hands)}판</small></li>`).join('')}</ol>` : '<p class="muted small">이번 시즌 배치를 마친 사람이 아직 없어요 · 30판이면 순위에 올라요</p>'}`;
  }
  return tabs + hlRankAll(r);
}
function hlRankAll(r) {
  const dist = r.dist.filter((d) => d.count).map((d) => `<span class="tier-badge sm" style="--tc:${d.color}"><i></i>${esc(d.name)} ${d.count}</span>`).join('');
  return `${dist ? `<div class="hl-dist">${dist}</div>` : ''}
    ${r.top.length ? `<ol class="hl-rank">${r.top.slice(0, 15).map((x) => `<li><span class="hr-n">${x.rank}</span><b>${esc(x.name)}</b>${tierBadge(x.tier, 'sm')}<small>${x.score}점 · 승률 ${x.winRate}% · ${fmt(x.hands)}판</small></li>`).join('')}</ol>` : `<p class="muted small">아직 배치를 마친 사람이 없어요. 연습 테이블 ${30}판이면 첫 티어가 나와요!</p>`}`;
}
async function enterTable(t, me) {
  const max = Math.min(t.buy[1], me.wallet);
  if (me.wallet < t.buy[0]) { toast(me.canRefill ? '칩이 모자라요 · 충전을 눌러 기본금을 채워 주세요' : `칩이 모자라요 · 이 테이블은 최소 ${fmt(t.buy[0])}`, 'error'); return; }
  const def = Math.max(t.buy[0], Math.min(max, Math.round((t.buy[0] * 2) / t.bb) * t.bb));
  const needName = !S.user && !LS.get('chandem:name', '');
  openModal(`${t.name} 입장`, `<form class="form" id="buyin-form">
    <p class="muted small">블라인드 ${fmt(t.sb)}/${fmt(t.bb)} · ${t.seats}인 테이블 · 상주 플레이어들이 저마다 다른 칩을 들고 있어요</p>
    ${needName ? '<label class="field"><span>닉네임 <small class="req">필수</small></span><input class="input" name="name" maxlength="10" required placeholder="닉네임을 입력해 주세요"></label>' : ''}
    <label class="field"><span>가져갈 칩 <b id="bi-val">${fmt(def)}</b> <small class="muted">(지갑 ${fmt(me.wallet)})</small></span>
      <input type="range" name="buy" min="${t.buy[0]}" max="${max}" step="${t.bb}" value="${def}"></label>
    <div class="row"><small class="muted">최소 ${fmt(t.buy[0])}</small><div class="spacer"></div><small class="muted">최대 ${fmt(max)}</small></div>
    <button class="btn btn-gold btn-lg">앉기</button>
    <p class="muted tiny">일어나면 남은 칩은 지갑으로 돌아가요. 리바이도 지갑에서 꺼내요.</p></form>`, (body) => {
    const f = body.querySelector('#buyin-form');
    f.buy.oninput = () => { body.querySelector('#bi-val').textContent = fmt(f.buy.value); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const name = needName ? String(f.name.value || '').trim() : (S.user ? S.user.nickname : LS.get('chandem:name', ''));
      if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
      if (needName) LS.set('chandem:name', name);
      f.querySelector('button').disabled = true;
      const av = LS.get('chandem:avatar', 0);
      const res = await emit('room:practice', { name, table: t.id, buyIn: Number(f.buy.value), guest: guestCred(), auth: S.auth, avatar: av === 'photo' ? 0 : av, photo: av === 'photo' ? LS.get('chandem:photo', '') : '' });
      f.querySelector('button').disabled = false;
      if (!res.ok) return;
      closeModal();
      S.code = res.code;
      S.session = { token: res.token, playerId: res.playerId };
      LS.set(sessKey(res.code), S.session);
      nav('/r/' + res.code);
      S.view = 'room';
      render();
    };
  });
}
async function loadHoldemLobby() {
  const [r, rk] = await Promise.all([hApi('/me', { name: S.user ? S.user.nickname : LS.get('chandem:name', '') }), fetch('/api/holdem/rank', { cache: 'no-store' }).then((x) => x.json()).catch(() => null)]);
  if (S.view !== 'gamehome' || (S.game || 'holdem') !== 'holdem') return;
  const meBox = document.getElementById('hl-me'); const tb = document.getElementById('hl-tables'); const rb = document.getElementById('hl-rank-box');
  if (!r.ok) { if (meBox) meBox.innerHTML = `<p class="muted small">${esc(r.message || '불러오지 못했어요')}</p>`; return; }
  S.hl = r;
  if (meBox) meBox.innerHTML = hlMeHTML(r.me);
  if (tb) tb.innerHTML = hlTablesHTML(r.tables, r.me);
  if (rb) rb.innerHTML = hlRankHTML(rk);
  const pd = document.getElementById('hl-podium'); if (pd) pd.innerHTML = hlPodiumHTML(rk, r.me);
  const pds = document.getElementById('pd-sub'); if (pds && rk && rk.ok && rk.season && rk.season.top && rk.season.top.length) { const [, mo] = rk.season.id.split('-'); pds.innerHTML = `${seasonDday(rk.season.endsAt)}${Number(mo)}월 시즌 · ${left(rk.season.endsAt - Date.now())} 남음`; }
  const mb = document.getElementById('hl-mebar'); if (mb) mb.innerHTML = hlMeBarHTML(r.me);
  const myr = document.getElementById('hl-myrank'); if (myr) myr.innerHTML = r.me.rank ? `<p class="pd-me">내 전체 순위 <b>${fmt(r.me.rank.rank)}위</b> · ${r.me.score}점</p>` : r.me.placement ? `<p class="pd-me">나는 <b>${r.me.placement}판</b> 더 치면 순위에 올라요</p>` : '';
  const cid = document.getElementById('ci-dot'); const ciTodo = !!(r.me.checkin && !r.me.checkin.done); if (cid) cid.hidden = !ciTodo;
  if (ciTodo && document.getElementById('hl-mebar') && !document.querySelector('#modal-root .modal')) { // 그날 처음 들어오면 출석 창 한 번
    const day = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
    if (LS.get('chandem:ciAuto', '') !== day) { LS.set('chandem:ciAuto', day); setTimeout(() => { if (S.view === 'gamehome' && !document.querySelector('#modal-root .modal')) openCheckin(); }, 500); }
  }
  renderCheckin(r.me);
  renderDaily();
  saveCosmetic(r.me.items);
  const md = document.getElementById('mis-dot');
  if (md) { const n = (r.me.missions || []).filter((m) => m.prog >= m.goal && !m.claimed).length; md.hidden = !n; md.textContent = n; }
  document.querySelectorAll('[data-hl]').forEach((b) => { b.onclick = () => openLife(b.dataset.hl); });
  bindRankTabs(rk);
  // 다시보기 링크로 들어왔으면 바로 열기
  try { const rp = new URLSearchParams(location.search).get('replay'); if (rp && !S.replayOpened) { S.replayOpened = true; openReplay(rp); } } catch { /* 무시 */ }
  const rf = document.getElementById('hl-refill');
  if (rf) rf.onclick = async () => { rf.disabled = true; const x = await hApi('/refill'); if (x.ok) { toast(`기본금으로 충전했어요 (+${fmt(x.me.added)})`, 'ok'); sound.play('collect'); } else toast(x.message, 'error'); loadHoldemLobby(); };
  const an = document.getElementById('hl-ana');
  if (an) an.onclick = () => openAnalysis(r.me);
  const lg = document.getElementById('hl-login');
  if (lg) lg.onclick = (e) => { e.preventDefault(); openLogin(); };
  document.querySelectorAll('[data-table]').forEach((b) => { b.onclick = () => enterTable(r.tables.find((t) => t.id === b.dataset.table), r.me); });
}
// 앱 설치 권하기: 홀덤 로비를 설치 안 한 브라우저로 열면 하루 한 번
function maybeInstallPrompt() {
  if (maybeColorHelp()) return;
  if ((isStandalone() && HOLDEM_APP) || IS_KAKAO || S.installAsked) return;
  const inGw = isStandalone() && !HOLDEM_APP; // 찬이의 게임월드 앱 안: 홀덤 앱을 따로 깔 수 있게
  const day = new Date().toISOString().slice(0, 10);
  if (LS.get('chandem:installAsk', '') === day) return;
  S.installAsked = true;
  setTimeout(() => {
    if (S.view !== 'gamehome' || document.querySelector('#modal-root .modal')) return;
    LS.set('chandem:installAsk', day);
    openModal('찬덤 홀덤 앱 설치', `<div class="inst-ask"><img src="/img/holdem-icon-192.png" alt="" width="72" height="72">
      <p>${inGw ? '바탕화면에 <b>홀덤만 바로 여는 「찬덤 홀덤」 아이콘</b>을 하나 더 만들 수 있어요.' : '<b>홈 화면에 앱으로 설치</b>하면 주소창 없이 전체 화면으로, 링크 없이 바로 열려요. 설치는 몇 초면 끝나요.'}</p>
      <button class="btn btn-gold btn-lg" id="ia-go">지금 설치하기</button><button class="btn btn-ghost" id="ia-no">다음에</button></div>`, (b) => {
      b.querySelector('#ia-go').onclick = () => { closeModal(); if (inGw || !HOLDEM_APP) installHoldemApp(); else installApp(); };
      b.querySelector('#ia-no').onclick = () => closeModal();
    });
  }, 1800);
}
function renderHoldemLobby() {
  // 탭 4개 (홈 · 테이블 · 순위 · 내 정보): 홈은 스크롤 없이 한 화면 — 바로 한 판 · 순위 시상대 · 아이콘 줄 / 나머지는 탭과 창으로
  const tab = ['home', 'tables', 'rank', 'me'].includes(S.hlTab) ? S.hlTab : 'home';
  $app.innerHTML = `
  <main class="home game-home hl-lobby hl-v2">
    <div class="top-bar">${HOLDEM_APP ? `${hubAcctHTML()}` : '<button class="btn btn-sm btn-outline" id="to-hub">‹ 게임 선택</button>'}${SHARE_BTN}</div>
    <div class="hl-pane ${tab === 'home' ? 'on' : ''}" data-pane="home">
      <div class="hl-head"><h1 class="hl-logo"><img src="${GAME_LOGO.holdem}" alt="찬덤 홀덤" draggable="false"></h1>
        <button class="hl-mebar" id="hl-mebar" type="button" data-go-tab="me"><span class="muted small">불러오는 중…</span></button></div>
      <section class="panel hl-podium-box" data-go-tab="rank"><div class="pd-head"><b>${IC('trophy', 'ic-in')}티어 순위</b><small id="pd-sub">연습 테이블 실력 점수</small><span class="pd-more">전체 ›</span></div><div id="hl-podium"><p class="muted small">불러오는 중…</p></div></section>
      <div class="hl-play">
        <button class="hl-quick" id="hl-quick" type="button"><span>${IC('cards')}</span><b>바로 한 판</b><small>상주 플레이어들과 · 내 칩으로</small></button>
        <div class="hl-play2">
          <button class="hf-btn hf-create" id="go-create" type="button"><span>${IC('chip')}</span><b>방 만들기</b><small>친구 부르기</small></button>
          <button class="hf-btn hf-code" id="go-code" type="button"><span>${IC('key')}</span><b>코드로 참가</b><small>받은 방 코드</small></button>
        </div>
      </div>
      <div class="hl-icons hl-icons6">
        <button class="hl-ico" data-hlx="checkin" type="button">${IC('calendar')}출석<i class="dot" id="ci-dot" hidden>!</i></button>
        <button class="hl-ico" data-hl="missions" type="button">${IC('target')}미션<i class="dot" id="mis-dot" hidden></i></button>
        <button class="hl-ico" data-hlx="daily" type="button">${IC('medal')}토너먼트</button>
        <button class="hl-ico" data-hl="shop" type="button">${IC('bag')}꾸미기</button>
        <button class="hl-ico" data-hl="replays" type="button">${IC('clapper')}명장면</button>
        <button class="hl-ico" data-hl="invite" type="button">${IC('handshake')}초대</button>
      </div>
      <div class="live-rooms hf-live" id="live-rooms"><div class="hf-live-head"><b>지금 열린 친구 방</b><i class="live-dot"></i></div><div class="lr-list"><p class="muted small">불러오는 중…</p></div></div>
      <p class="hl-tip1">${IC('bulb', 'ic-in')}<span>${esc(todayTip())}</span></p>
    </div>
    <div class="hl-pane ${tab === 'tables' ? 'on' : ''}" data-pane="tables">
      <section class="panel"><div class="sec-head"><h2 class="sec-title">혼자 연습 테이블</h2></div><p class="muted small hl-tsub">친구가 없을 땐 귀여운 상주 플레이어들과 · 내 칩으로</p><div class="hl-tables" id="hl-tables"><p class="muted small">불러오는 중…</p></div></section>
      <section class="panel"><div class="sec-head"><h2 class="sec-title">상주 플레이어</h2><small class="muted">옆으로 밀어 보기</small></div>${residentsHTML()}</section>
      <button class="btn btn-outline hl-wide" id="go-practice" type="button">${IC('medal', 'ic-in')}토너먼트 연습 (혼자)</button>
    </div>
    <div class="hl-pane ${tab === 'rank' ? 'on' : ''}" data-pane="rank">
      <section class="panel hl-rank-top"><div class="sec-head"><h2 class="sec-title">${IC('trophy', 'ic-in')}티어 순위</h2><small class="muted">연습 테이블 실력 점수</small></div><div id="hl-myrank"></div><div id="hl-rank-box" class="hl-rank-box open"><p class="muted small">불러오는 중…</p></div></section>
    </div>
    <div class="hl-pane ${tab === 'me' ? 'on' : ''}" data-pane="me">
      <section class="panel hl-me" id="hl-me">${hlMeHTML(null)}</section>
      <div class="hl-icons hl-icons4">
        <button class="hl-ico" data-hl="ach" type="button">${IC('ribbon')}업적</button>
        <button class="hl-ico" data-hl="missions" type="button">${IC('target')}미션</button>
        <button class="hl-ico" data-hl="replays" type="button">${IC('clapper')}명장면</button>
        <button class="hl-ico" data-hl="shop" type="button">${IC('bag')}꾸미기</button>
      </div>
      <div class="hl-more"><button class="btn btn-ghost" data-learn="tut" type="button">처음이에요 (튜토리얼)</button><button class="btn btn-ghost" data-learn="gloss" type="button">홀덤 용어집</button><button class="btn btn-ghost" data-av-edit type="button">캐릭터·사진</button><button class="btn btn-ghost" id="go-rules">게임 방법</button><button class="btn btn-ghost" id="go-chart">족보표</button><button class="btn btn-ghost" data-hl="invite" type="button">친구 초대</button></div>
      <p class="fine">칩은 현금 가치가 없는 친목용 점수예요. 입금·출금·환전 기능은 없어요.</p>
    </div>
  </main>
  <nav class="hl-tabs" id="hl-tabs">
    ${[['home', 'house', '홈'], ['tables', 'cards', '테이블'], ['rank', 'trophy', '순위'], ['me', 'crown', '내 정보']].map(([k, ic, t]) => `<button type="button" data-tab="${k}" class="${tab === k ? 'on' : ''}">${IC(ic)}<span>${t}</span></button>`).join('')}
  </nav>`;
  bindCommon();
  const goTab = (k) => {
    S.hlTab = k;
    $app.querySelectorAll('.hl-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === k));
    $app.querySelectorAll('#hl-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === k));
    window.scrollTo(0, 0); const m = $app.querySelector('main'); if (m) m.scrollTop = 0;
    sound.play('tap');
  };
  $app.querySelectorAll('#hl-tabs [data-tab]').forEach((b) => { b.onclick = () => goTab(b.dataset.tab); });
  $app.querySelectorAll('[data-go-tab]').forEach((b) => { b.onclick = (e) => { if (e.target.closest('[data-av-edit]')) return; goTab(b.dataset.goTab); }; });
  $app.querySelectorAll('[data-hlx]').forEach((b) => { b.onclick = () => (b.dataset.hlx === 'checkin' ? openCheckin() : openDaily()); });
  startRoomList('holdem');
  loadHoldemLobby();
  rotateTip();
  if (!LS.get('chandem:hlTut', 0)) setTimeout(() => { if (S.view === 'gamehome' && !document.querySelector('#modal-root .modal')) openHoldemTutorial(); }, 700); // 처음 온 사람: 튜토리얼 한 번
  else maybeInstallPrompt();
  const hub = $app.querySelector('#to-hub');
  if (hub) hub.onclick = () => { S.view = 'home'; nav('/'); render(); };
  const ab = $app.querySelector('#acct-btn');
  if (ab) ab.onclick = () => (S.user ? openProfile() : openLogin());
  $app.querySelector('#go-create').onclick = () => { nav('/'); S.view = 'create'; render(); };
  $app.querySelector('#go-practice').onclick = () => { nav('/'); S.view = 'practice'; render(); };
  $app.querySelector('#go-rules').onclick = () => openModal('찬덤 홀덤 게임 방법', `<div class="rules">${GAME_RULES.holdem}</div>`);
  $app.querySelector('#go-chart').onclick = () => openModal('족보표', handChartHTML(), null, { wide: true });
  $app.querySelector('#go-code').onclick = () => openModal('방 코드로 참가', `<form class="form" id="code-form"><p class="muted small">친구가 보낸 방 코드(6자리)를 넣어 주세요</p>
    <input class="input code-in" name="c" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="예: AB12CD" required>
    <button class="btn btn-gold btn-lg">참가하기</button></form>`, (b) => {
    const f = b.querySelector('#code-form'); f.c.focus();
    f.onsubmit = async (e) => {
      e.preventDefault();
      const c = String(f.c.value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (c.length < 4) { toast('방 코드를 확인해 주세요', 'error'); return; }
      const r = await (await fetch('/api/room/' + c)).json().catch(() => ({ ok: false }));
      if (!r.ok) { toast(r.message || '방을 찾을 수 없어요', 'error'); return; }
      closeModal(); nav('/r/' + c); boot();
    };
  });
  $app.querySelector('#hl-quick').onclick = () => {
    const r = S.hl;
    if (!r || !r.ok) return;
    const me = r.me;
    const ok = r.tables.filter((t) => t.seats > 2 && t.buy[0] <= me.wallet * 0.5).sort((a, b) => b.bb - a.bb)[0] || r.tables.find((t) => t.buy[0] <= me.wallet);
    if (!ok) { toast(me.canRefill ? '칩이 모자라요 · 내 정보에서 충전을 눌러 주세요' : '오늘 충전을 다 썼어요 · 친구 방에서 놀아 보세요', 'error'); return; }
    enterTable(ok, me);
  };
}
// ── 홀덤 용어집 (내 정보 탭 · 게임 메뉴 · 팁 줄에서) ──
const HOLDEM_GLOSSARY = [
  ['자리 · 블라인드', [
    ['딜러 버튼 (D)', '이번 판의 딜러 자리 표시. 판마다 왼쪽으로 한 칸씩 옮겨 가요. 플랍부터는 가장 늦게 행동해서 제일 유리해요.'],
    ['스몰 블라인드 (SB)', '딜러 왼쪽 자리. 카드 받기 전에 빅 블라인드의 절반을 미리 내요.'],
    ['빅 블라인드 (BB)', '스몰 블라인드 왼쪽 자리. 정해진 기본 금액을 미리 내요. 판의 기본 단위예요.'],
    ['앤티', '블라인드와 따로 모두(또는 BB 자리)가 조금씩 내는 돈. 팟이 커져요.'],
    ['포지션', '행동하는 순서. 늦게 행동할수록(딜러 쪽) 상대를 보고 정할 수 있어 유리해요.'],
    ['UTG', '프리플랍에서 가장 먼저 행동하는 자리 (빅 블라인드 왼쪽).'],
  ]],
  ['진행 순서', [
    ['홀 카드', '나만 보는 내 카드 2장.'],
    ['프리플랍', '바닥 카드가 깔리기 전, 내 카드 2장만 보고 하는 첫 베팅.'],
    ['플랍', '바닥에 처음 깔리는 카드 3장.'],
    ['턴', '네 번째 바닥 카드.'],
    ['리버', '다섯 번째(마지막) 바닥 카드.'],
    ['보드 · 커뮤니티 카드', '모두가 같이 쓰는 바닥 카드 5장.'],
    ['쇼다운', '마지막 베팅이 끝나고 남은 사람들이 패를 보여 승부하는 것.'],
    ['팟', '이번 판에 모인 칩 전체. 이긴 사람이 가져가요.'],
    ['사이드 팟', '누가 올인했을 때, 그 사람이 낼 수 없는 만큼 따로 모인 팟.'],
  ]],
  ['행동', [
    ['체크', '아무도 안 걸었을 때 돈을 안 내고 넘기기.'],
    ['벳', '이번 라운드에서 처음으로 칩을 거는 것.'],
    ['콜', '앞사람이 건 만큼 똑같이 내고 따라가기.'],
    ['레이즈', '앞사람이 건 것보다 더 올려서 걸기.'],
    ['리레이즈 · 3벳', '레이즈에 다시 레이즈하는 것.'],
    ['폴드', '이번 판을 포기하고 카드 버리기. 이미 낸 칩은 돌려받지 못해요.'],
    ['올인', '가진 칩을 전부 거는 것.'],
    ['림프', '프리플랍에서 레이즈 없이 빅 블라인드만큼만 콜하고 들어가기.'],
    ['C벳', '프리플랍에 레이즈한 사람이 플랍에서 또 거는 것 (컨티뉴에이션 벳).'],
    ['블러프', '약한 패로 강한 척 크게 걸어 상대를 접게 만드는 것.'],
    ['머크', '쇼다운에서 진 패를 보여 주지 않고 덮는 것.'],
  ]],
  ['패 · 족보', [
    ['포켓 페어', '내 카드 2장이 같은 숫자 (예: 7-7).'],
    ['수딧', '내 카드 2장이 같은 무늬. 다르면 오프수트.'],
    ['킥커', '같은 족보끼리 비교할 때 승부를 가르는 남은 높은 카드.'],
    ['탑 페어', '바닥에서 가장 높은 카드와 내 카드가 페어가 된 것.'],
    ['오버 페어', '바닥의 어떤 카드보다 높은 포켓 페어.'],
    ['셋 · 트립스', '같은 숫자 3장(트리플). 포켓 페어 + 바닥 1장이면 셋, 바닥 2장 + 내 1장이면 트립스.'],
    ['너츠', '지금 바닥에서 나올 수 있는 가장 강한 패.'],
    ['찹 · 스플릿', '같은 족보로 비겨서 팟을 나눠 가지는 것.'],
  ]],
  ['확률 · 전략', [
    ['드로우', '한 장만 더 오면 완성되는 패 (예: 같은 무늬 4장 = 플러시 드로우).'],
    ['아웃츠', '내 패를 이기게 만들어 줄 남은 카드 수.'],
    ['팟 오즈', '콜할 금액 대비 팟 크기. 승률이 팟 오즈보다 높으면 콜해도 손해가 아니에요.'],
    ['배드 빗', '거의 이긴 판을 마지막 카드 때문에 지는 것.'],
    ['틸트', '큰 판을 진 뒤 흔들려서 막 치는 상태.'],
    ['바이인', '테이블에 앉을 때 가져가는 칩.'],
    ['리바이', '칩을 다 잃었을 때 다시 사서 들어오기.'],
  ]],
];
function openGlossary() {
  openModal('홀덤 용어집', `<div class="gloss">
    <input class="input gloss-q" type="search" placeholder="찾을 말 (예: 콜, 킥커)" aria-label="용어 찾기">
    ${HOLDEM_GLOSSARY.map(([g, list]) => `<section class="gloss-sec"><h3>${g}</h3><dl>${list.map(([t, d]) => `<div class="gloss-row"><dt>${t}</dt><dd>${d}</dd></div>`).join('')}</dl></section>`).join('')}
    <p class="muted small gloss-none" hidden>찾는 말이 없어요</p></div>`, (b) => {
    const q = b.querySelector('.gloss-q');
    q.oninput = () => {
      const v = q.value.trim().toLowerCase(); let any = false;
      b.querySelectorAll('.gloss-sec').forEach((sec) => { let n = 0; sec.querySelectorAll('.gloss-row').forEach((r) => { const on = !v || r.textContent.toLowerCase().includes(v); r.hidden = !on; if (on) n++; }); sec.hidden = !n; if (n) any = true; });
      b.querySelector('.gloss-none').hidden = any;
    };
  }, { wide: true });
}
// ── 처음 하는 사람 튜토리얼 (처음 홀덤에 들어오면 한 번 · 내 정보 탭에서 다시 보기) ──
function openHoldemTutorial(i = 0) {
  const C = (cs) => `<div class="tut-cards">${cs.map((c) => (c ? cardHTML(c, { size: 'sm' }) : '<span class="tut-blank"></span>')).join('')}</div>`;
  const steps = [
    ['홀덤이 뭐예요?', `<p>내 카드 <b>2장</b>과 모두가 같이 쓰는 바닥 카드 <b>5장</b>, 합쳐서 7장 중 <b>가장 좋은 5장</b>으로 족보를 겨뤄요.</p>
      <div class="tut-pair"><div><small>내 카드</small>${C(['As', 'Kd'])}</div><div><small>바닥 카드</small>${C(['Ah', '7c', 'Kc', '2s', '9d'])}</div></div>
      <p class="tut-ok">→ A 페어 + K 페어 = <b>투 페어</b></p>`],
    ['칩을 미리 내요 (블라인드)', `<p>판마다 <b>D(딜러)</b> 왼쪽 두 사람이 카드 받기 전에 칩을 미리 내요.</p>
      <ul class="tut-list"><li><span class="blind-tag">SB</span> 스몰 블라인드: 기본 금액의 절반</li><li><span class="blind-tag is-bb">BB</span> 빅 블라인드: 기본 금액</li></ul>
      <p class="muted small">그래서 팟에 처음부터 칩이 있어요. D는 판마다 한 칸씩 옮겨 가요.</p>`],
    ['4번 베팅해요', `<ol class="tut-list"><li><b>프리플랍</b> — 내 카드 2장만 보고${C(['Qs', 'Qh'])}</li>
      <li><b>플랍</b> — 바닥 3장이 깔린 뒤${C(['Qd', '8c', '3h', '', ''])}</li><li><b>턴</b> — 4번째 카드 뒤</li><li><b>리버</b> — 마지막 5번째 카드 뒤</li></ol>
      <p class="muted small">끝까지 남은 사람끼리 패를 보여 승부해요 (쇼다운).</p>`],
    ['내 차례에 할 수 있는 것', `<ul class="tut-list tut-acts"><li><b>체크</b> 아무도 안 걸었으면 그냥 넘기기</li><li><b>콜</b> 앞사람이 건 만큼 따라가기</li>
      <li><b>레이즈</b> 더 올려서 걸기 (½팟·팟 버튼이나 막대를 끌어서)</li><li><b>폴드</b> 이번 판 포기 (낸 칩은 못 돌려받아요)</li><li><b>올인</b> 가진 칩 전부</li></ul>
      <p class="muted small">모두 폴드하고 나만 남으면 패를 안 보여 줘도 이겨요!</p>`],
    ['족보 (강한 순서)', `<ol class="tut-rank"><li>로열 플러시 <small>같은 무늬 10-J-Q-K-A</small></li><li>스트레이트 플러시 <small>같은 무늬 연속 5장</small></li><li>포카드 <small>같은 숫자 4장</small></li>
      <li>풀하우스 <small>트리플 + 페어</small></li><li>플러시 <small>같은 무늬 5장</small></li><li>스트레이트 <small>연속 숫자 5장</small></li><li>트리플 <small>같은 숫자 3장</small></li>
      <li>투 페어</li><li>원 페어</li><li>하이 카드 <small>아무것도 없을 때 가장 높은 카드</small></li></ol>
      <p class="muted small">게임 중에도 메뉴 → <b>족보표</b>에서 볼 수 있어요.</p>`],
    ['이제 한 판 해 봐요!', `<p><b>「바로 한 판」</b>을 누르면 귀여운 상주 플레이어들과 바로 연습할 수 있어요. 잃어도 칩은 매일 충전돼요.</p>
      <ul class="tut-list"><li>처음엔 <b>좋은 패만</b> 들어가 보세요 (A·K·Q 같은 높은 카드, 페어)</li><li>모르는 말은 내 정보 → <b>홀덤 용어집</b></li><li>이 설명은 내 정보 → <b>처음이에요</b>에서 다시 볼 수 있어요</li></ul>`],
  ];
  const [t, body] = steps[i];
  openModal(`홀덤 배우기 ${i + 1}/${steps.length}`, `<div class="tut">
    <h3 class="tut-h">${t}</h3>${body}
    <div class="tut-dots">${steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tut-nav">${i ? '<button class="btn btn-ghost" id="tut-prev" type="button">이전</button>' : '<button class="btn btn-ghost" id="tut-skip" type="button">건너뛰기</button>'}
      <button class="btn btn-gold" id="tut-next" type="button">${i === steps.length - 1 ? '시작하기!' : '다음'}</button></div></div>`, (b) => {
    const done = () => { LS.set('chandem:hlTut', 1); closeModal(); };
    const pv = b.querySelector('#tut-prev'); if (pv) pv.onclick = () => openHoldemTutorial(i - 1);
    const sk = b.querySelector('#tut-skip'); if (sk) sk.onclick = done;
    b.querySelector('#tut-next').onclick = () => { if (i === steps.length - 1) { done(); const q = document.getElementById('hl-quick'); if (q) q.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 600, iterations: 2 }); } else openHoldemTutorial(i + 1); };
  }, { onClose: () => LS.set('chandem:hlTut', 1) });
}
document.addEventListener('click', (e) => { const l = e.target.closest('[data-learn]'); if (!l) return; if (l.dataset.learn === 'tut') openHoldemTutorial(); else openGlossary(); });
// 출석 · 정기 토너먼트: 홈 아이콘을 누르면 창으로 (출석은 그날 처음 들어올 때 한 번 저절로)
function openCheckin() { if (!S.hl || !S.hl.me) return; openModal('출석 보상', '<div class="hl-checkin" id="hl-checkin"></div>', () => renderCheckin(S.hl.me)); }
function openDaily() { openModal('정기 토너먼트', '<div class="hl-daily" id="hl-daily"><p class="muted small">불러오는 중…</p></div>', () => renderDaily()); }
// 홈 맨 위: 내 정보 한 줄 (누르면 내 정보 탭)
function hlMeBarHTML(me) {
  const name = esc(me.name || LS.get('chandem:name', '') || '닉네임 정하기');
  return `<span class="mb-av" data-av-edit role="button" aria-label="캐릭터 · 사진 바꾸기"><img class="hl-av" src="${myAvatarSrc()}" alt=""><i>✎</i></span><span class="mb-who"><b>${name}</b>${me.tier ? tierBadge(me.tier, 'sm') : `<small class="muted">배치까지 ${me.placement || 0}판</small>`}</span><span class="mb-chip"><span class="chip-icon"></span>${fmt(me.wallet)}</span><i class="mb-go">›</i>`;
}
// 홈 순위 시상대: 1~3등 크게 + 4·5등 한 줄 + 내 순위
function hlPodiumHTML(rk, me) {
  if (!rk || !rk.ok) return '<p class="muted small">순위를 불러오지 못했어요</p>';
  const ss = rk.season && rk.season.top && rk.season.top.length ? rk.season : null;
  const list = ss ? ss.top : rk.top || [];
  const mine = me && me.rank ? `<p class="pd-me">내 순위 <b>${fmt(me.rank.rank)}위</b>${me.score ? ` · ${me.score}점` : ''}</p>` : me && me.placement ? `<p class="pd-me">나는 <b>${me.placement}판</b> 더 치면 순위에 올라요</p>` : '';
  if (!list.length) return `<div class="pd-empty"><b>아직 순위에 오른 사람이 없어요</b><small>연습 테이블 30판이면 첫 순위! 1등 자리가 비어 있어요</small></div>${mine}`;
  const slot = (x, n) => (x ? `<div class="pd pd${n}">${n === 1 ? `<span class="pd-crown">${IC('crown')}</span><i class="pd-spark s1"></i><i class="pd-spark s2"></i><i class="pd-spark s3"></i>` : ''}<span class="pd-name"><i class="pd-medal">${n}</i><b>${esc(x.name)}</b></span>${tierBadge(x.tier, 'sm')}<small>${x.score}점 · 승률 ${x.winRate}%</small><span class="pd-step">${n}</span></div>` : `<div class="pd pd${n} pd-none"><span class="pd-name"><i class="pd-medal">${n}</i><b>비어 있음</b></span><span class="pd-step">${n}</span></div>`);
  const rest = list.slice(3, 5).map((x) => `<span><i>${x.rank}</i>${esc(x.name)} <small>${x.score}점</small></span>`).join('');
  return `<div class="pd-row">${slot(list[1], 2)}${slot(list[0], 1)}${slot(list[2], 3)}</div>${rest ? `<p class="pd-rest">${rest}</p>` : ''}${mine}`;
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
  }, { onClose: () => { if (S.sgNext) goSunggu(); } });
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
    ${game(s.holdem, '♠ 찬덤 홀덤')}
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
  // 랑방 대전(앱)에서 [로그인] → /?login=1&next=langbang : 로그인 창을 바로 열고, 끝나면 랑방으로 돌아간다
  { const q0 = new URLSearchParams(location.search); if (q0.get('next') === 'langbang') { try { sessionStorage.setItem('chandem:next', '/langbang/'); } catch { /* 무시 */ } } if (q0.get('next') === 'sunggu') { if (S.auth) S.sgNext = true; else try { sessionStorage.setItem('chandem:next', 'sunggu'); } catch { /* 무시 */ } } if (q0.get('login') === '1' && !S.auth) setTimeout(() => openLogin(), 300); }
  if (S.sgNext) { loadMe().then(() => { if (S.user) goSunggu(); else { S.sgNext = false; try { sessionStorage.setItem('chandem:next', 'sunggu'); } catch { /* 무시 */ } openLogin(); } }); } // 강성구 키우기에서 로그인하러 왔는데 이미 로그인돼 있으면 바로 돌려보낸다
  // 홀덤 앱 안 [게임월드 앱 설치] → 크롬에서 /?install=gw : 설치 안내를 바로. 그런데 앱 화면으로 열렸다면(예전 홀덤 앱이 / 까지 맡음) 지우고 다시 까는 법
  if (new URLSearchParams(location.search).get('install') === 'gw') {
    nav('/');
    setTimeout(() => { if (isStandalone()) openModal('찬이의 게임월드 앱 설치', gwInstallHelpHTML(), (b) => { b.querySelector('#copy-gw').onclick = copyGwLink; }); else installApp(); }, 900);
  }
  loadMe().then(() => { if (S.view === 'home') render(); else refreshAcctBtn(); });
  fetch('/api/info').then((r) => r.json()).then((d) => { S.info = d; if (S.view === 'room' || S.view === 'home') render(); }).catch(() => {});
  const code = routeCode();
  // 게임 바로가기 링크(/holdem 등): 그 게임 화면으로 바로
  const gLink = /^\/(holdem|seotda|omok)\/?$/.exec(location.pathname);
  if (!code && gLink) { if (/[?&]install=1\b/.test(location.search)) S.wantInstall = true; enterGame(gLink[1]); if (HOLDEM_APP) nav('/holdem'); return; }
  // 관전 링크(/r/코드?watch=1): 들어올 때 '관전만 할래요'를 미리 체크
  if (code && /[?&]watch=1/.test(location.search)) S.wantSpectate = true;
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
    if (res.code && res.code !== S.code) { S.code = res.code; LS.set(sessKey(res.code), S.session); nav('/r/' + res.code); } // 다른 테이블로 옮겨져 있었음
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
  if (!first && S.state) {
    const seatsOf = (x) => x.players.filter((p) => p.role === 'player' && !p.leaving).map((p) => p.id).sort().join();
    if (seatsOf(S.state) !== seatsOf(st)) sound.play('sit');
    const rb = (x) => ((x.hand && x.hand.result && x.hand.result.rabbit) || []).length;
    if (rb(st) > rb(S.state)) sound.play('flip');
    const sh = (x) => ((x.hand && x.hand.result && x.hand.result.shown) || []).length + x.players.filter((p) => p.cards && p.cards.some((c) => c !== '??') && x.hand && x.hand.finished).length;
    if (st.hand && S.state.hand && st.hand.no === S.state.hand.no && st.hand.finished && sh(st) > sh(S.state)) sound.play('flip');
  }
  S.state = st;
  S.wasInRoom = st.room.code;
  sound.setQuietRoom(!st.room.practice && st.players.filter((p) => !p.isBot && !p.leaving).length >= 2);
  S.clockSkew = st.serverTime - Date.now();
  if (S.view !== 'room') S.view = 'room';
  processEvents(st, first);
  onChat(st, first);
  if (!first) guestHandNudge(st);
  render();
});
// 여러 테이블 토너먼트: 다른 테이블로 옮겨짐 → 새 방 정보로 바꾸고 주소도 새 방으로
socket.on('room:moved', (d) => {
  S.code = d.code;
  S.session = { token: d.token, playerId: d.playerId };
  LS.set(sessKey(d.code), S.session);
  nav('/r/' + d.code);
  S.seenCards = new Set();
  toast(`테이블 ${d.tableNo}(으)로 자리를 옮겼어요`, 'ok');
  sound.play('chips');
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
  RK.openPlayerCard({ game: gameOf(S.state), code: S.state.room.code, pid, name: p && p.name, extra: p ? roomStatsHTML(p, S.state) : '' });
});

function roomStatsHTML(p, st) {
  if (gameOf(st) === 'omok' || st.room.phase !== 'playing' && !p.rs) return '';
  const rs = p.rs || { hands: 0, vpip: 0, won: 0, sd: 0, best: null, bigPot: 0 };
  const net = p.buyIn ? p.stack - p.buyIn : null;
  const holdem = gameOf(st) === 'holdem';
  const rows = [['참여한 판', fmt(rs.hands)], ['이긴 판', `${fmt(rs.won)}${rs.hands ? ` <small class="muted">(${Math.round((rs.won / rs.hands) * 100)}%)</small>` : ''}`]];
  if (holdem) rows.push(['참여율', rs.hands ? Math.round((rs.vpip / rs.hands) * 100) + '%' : '-']);
  rows.push(['바이인', p.buyIn ? fmt(p.buyIn) : '-'], ['손익', net === null ? '-' : `<span class="${net > 0 ? 'plus' : net < 0 ? 'minus' : ''}">${signed(net)}</span>`]);
  if (holdem) rows.push(['보여 준 최고 족보', rs.best ? esc(rs.best) : '-']);
  return `<div class="pc-room"><div class="pc-room-h">이번 방 기록 <small class="muted">· 모두 볼 수 있어요</small></div><div class="stat-grid pc-grid">${rows.map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('')}</div></div>`;
}

// ── 감정 표현 ───────────────────────────────────────
// 감정 표현: 이모지 대신 짧은 말 (말풍선 색으로 구분)
// [키, 말풍선, 이름, 소리] — 그림은 /img/emotes/<키>.webp
const EMOTES = [['goodfold', '굿폴드!', '굿폴드', 'ding'], ['nice', '나이스!', '나이스', 'e_happy'], ['laugh', 'ㅋㅋㅋ', '웃음', 'e_laugh'], ['clap', '짝짝짝', '박수', 'clap'], ['think', '흠…', '고민', 'hmm'],
  ['sweat', '쫄린다…', '쫄림', 'gulp'], ['angry', '화났어!', '화남', 'e_angry'], ['cry', '엉엉', '울음', 'e_cry'], ['mock', '메롱~', '메롱', 'e_mock'], ['gg', 'GG', 'GG', 'ding']];
const EMOTE_ALIAS = { happy: 'nice' }; // 예전 이름
const emoteImg = (k) => `<img class="emo-img" src="/img/emotes/${k}.webp" alt="" draggable="false" onerror="this.remove()">`;
document.addEventListener('click', (e) => {
  const tray = document.getElementById('emote-tray');
  if (tray && !e.target.closest('#emote-tray') && !e.target.closest('#emote-btn')) tray.hidden = true;
});
socket.on('emote', (e) => {
  const kind = EMOTE_ALIAS[e.kind] || e.kind;
  const def = EMOTES.find((x) => x[0] === kind);
  if (!def || S.view !== 'room' || (S.muted && S.muted.has(e.id))) return;
  // 오목: 판을 가리지 않게 그 사람 이름표 오른쪽에 작게 / 카드 게임: 자리 위에
  const chip = document.querySelector(`.omok-player[data-id="${e.id}"]`);
  const seat = chip || document.querySelector(`.seat[data-id="${e.id}"] .seat-av`) || (S.state && S.state.me && S.state.me.id === e.id ? document.querySelector('.me-name') : null);
  if (!seat) return;
  const el = document.createElement('div');
  el.className = `fx-emote fx-emote-${kind} ${chip ? 'fx-emote-side' : ''}`;
  el.innerHTML = `${emoteImg(kind)}<span class="emote-say">${def[1]}</span>`;
  const r = seat.getBoundingClientRect();
  el.style.left = (chip ? Math.min(innerWidth - 30, r.right + 26) : r.left + r.width / 2) + 'px';
  el.style.top = (r.top + r.height / 2) + 'px';
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 2400);
  sound.play('pop');
  if (def[3]) setTimeout(() => sound.play(def[3]), 120);
});

// 홀덤 앱 설치 막대: 설치하기 전까지 방 밖 화면 아래에 늘 보인다
function syncInstallBar() {
  let bar = document.getElementById('install-bar');
  const want = HOLDEM_APP && !isStandalone() && S.view !== 'room';
  if (!want) { if (bar) bar.remove(); document.body.classList.remove('has-install-bar'); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'install-bar'; bar.className = 'install-bar';
    bar.innerHTML = `<img src="/img/holdem-icon-192.png" alt="" width="40" height="40"><span><b>찬덤 홀덤 앱 설치</b><small>${IS_IOS ? '사파리 공유 → 홈 화면에 추가' : '홈 화면에서 전체 화면으로 바로'}</small></span><button class="btn btn-gold btn-sm" type="button">설치</button>`;
    bar.querySelector('button').onclick = installApp;
    document.body.appendChild(bar);
    if (/[?&]install=1\b/.test(location.search) || S.wantInstall) { S.wantInstall = true; bar.classList.add('install-bar-hl'); }
  }
  document.body.classList.add('has-install-bar');
}

// ── 글 채팅: 떠 있는 '채팅' 버튼 · 채팅 창 · 자리 위 말풍선 ──
function syncChatFab() {
  const b = document.getElementById('chat-btn');
  if (S.view !== 'room' || !S.state || !b) return;
  const unread = Math.max(0, ((S.state.chat || []).slice(-1)[0] || { seq: 0 }).seq - (S.chatRead || 0));
  const d = b.querySelector('.dot');
  d.hidden = !unread || !!document.getElementById('chat-list');
  d.textContent = unread > 9 ? '9+' : String(unread);
}
document.addEventListener('click', (e) => { if (e.target.closest('#chat-btn')) openChat(); });
// 채팅 음소거한 사람 (이 기기에서만)
S.muted = new Set(LS.get('chandem:muted', []));
// 채팅 끄기(뮤트 모드): 말풍선·알림 소리·아래 채팅 줄을 모두 숨김 (이 기기에서만)
S.chatOff = !!LS.get('chandem:chatOff', false);
function setChatOff(on) { S.chatOff = !!on; LS.set('chandem:chatOff', S.chatOff); syncChatMini(); const b = document.getElementById('cs-off'); if (b) { b.textContent = S.chatOff ? '채팅 켜기' : '채팅 끄기'; b.classList.toggle('on', S.chatOff); } }
function setMute(id, on) { if (on) S.muted.add(id); else S.muted.delete(id); LS.set('chandem:muted', [...S.muted].slice(-50)); }
const nameHue = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % 360; };
const hhmm = (t) => { const d = new Date(t || Date.now()); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
function chatListHTML(st) {
  const meId = st.me && st.me.id;
  const list = (st.chat || []).filter((m) => !S.muted.has(m.id));
  if (!list.length) return '<li class="muted small chat-empty">아직 대화가 없어요. 먼저 한마디 해 보세요!</li>';
  return list.map((m) => `<li class="${m.id === meId ? 'mine' : ''}"><span class="cs-name" style="--h:${nameHue(m.name)}">${esc(m.name)}</span><span class="cs-time">${hhmm(m.at)}</span>
    ${m.id !== meId ? `<button type="button" class="cs-mute" data-mute="${esc(m.id)}" aria-label="${esc(m.name)} 음소거">음소거</button>` : ''}<p>${esc(m.text)}</p></li>`).join('');
}
// 게임 화면 아래 왼쪽: 최근 채팅 두 줄 (누르면 채팅 창)
function chatMiniHTML(st) {
  if (S.chatOff) return '<span class="cm-empty">채팅 꺼 둠 · 눌러서 다시 켤 수 있어요</span>';
  const list = ((st && st.chat) || []).filter((m) => !S.muted.has(m.id)).slice(orientOf() === 'land' ? -12 : -2);
  if (!list.length) return '<span class="cm-empty">채팅을 눌러 한마디 해 보세요</span>';
  return list.map((m) => `<span class="cm-line"><b style="--h:${nameHue(m.name)}">${esc(m.name)}</b> ${esc(m.text)}<i class="cm-time">${hhmm(m.at)}</i></span>`).join('');
}
function syncChatMini() { const el = document.getElementById('chat-mini'); if (el && S.state) el.innerHTML = chatMiniHTML(S.state); }
function closeChat() {
  const sh = document.getElementById('chat-sheet');
  if (!sh) return;
  if (sh._off) sh._off();
  sh.classList.add('out');
  const sc = document.getElementById('chat-scrim'); if (sc) sc.remove();
  setTimeout(() => sh.remove(), 160);
  syncChatFab();
}
function openChat() {
  const st = S.state;
  if (!st || document.getElementById('chat-sheet')) return;
  const scrim = document.createElement('div');
  scrim.id = 'chat-scrim'; scrim.className = 'chat-scrim';
  scrim.onclick = closeChat;
  const sh = document.createElement('section');
  sh.id = 'chat-sheet'; sh.className = 'chat-sheet';
  sh.innerHTML = `<div class="cs-head"><b>채팅</b><small class="muted">${esc(st.room.code)}</small><button type="button" class="cs-off ${S.chatOff ? 'on' : ''}" id="cs-off" aria-label="채팅 끄기 켜기">${S.chatOff ? '채팅 켜기' : '채팅 끄기'}</button><button type="button" class="cs-x" id="cs-x" aria-label="닫기">닫기</button></div>
    <ol class="chat-list cs-list" id="chat-list">${chatListHTML(st)}</ol>
    <div class="cs-quick">${['굿폴드', '나이스 핸드', 'ㅋㅋㅋ', '블러핑이지?', '잠깐만요', 'GG', '한 판만 더'].map((t) => `<button type="button" data-q="${t}">${t}</button>`).join('')}</div>
    <form class="cs-form" id="chat-form" autocomplete="off"><input class="input" name="t" maxlength="80" placeholder="메시지 (Enter로 보내기)" enterkeyhint="send"><button class="btn btn-gold">보내기</button></form>`;
  document.body.append(scrim, sh);
  const list = sh.querySelector('#chat-list');
  list.scrollTop = list.scrollHeight;
  const form = sh.querySelector('#chat-form');
  const send = async (t) => { const r = await emit('room:chat', { text: t }); if (r.ok) form.t.value = ''; };
  form.onsubmit = (e) => { e.preventDefault(); const t = form.t.value.trim(); if (t) send(t); };
  sh.querySelectorAll('[data-q]').forEach((q) => { q.onclick = () => send(q.dataset.q); });
  sh.querySelector('#cs-x').onclick = closeChat;
  sh.querySelector('#cs-off').onclick = () => { setChatOff(!S.chatOff); toast(S.chatOff ? '채팅을 껐어요 · 말풍선과 알림 소리가 안 나와요' : '채팅을 다시 켰어요', 'info'); };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mute]');
    if (!b) return;
    const m = (S.state.chat || []).find((x) => x.id === b.dataset.mute);
    setMute(b.dataset.mute, true);
    list.innerHTML = chatListHTML(S.state); syncChatMini();
    toast(`${m ? m.name : '그 사람'}님의 채팅·표정을 가렸어요 (메뉴 → 참가자에서 다시 보기)`, 'info');
  });
  // 키보드가 올라오면 채팅 창도 같이 올린다
  const vv = window.visualViewport;
  const fit = () => { if (vv) sh.style.bottom = Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px'; };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); sh._off = () => { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }; }
  S.chatRead = ((st.chat || []).slice(-1)[0] || { seq: 0 }).seq;
  syncChatFab();
}
function onChat(st, first) {
  const list = st.chat || [];
  const last = (list.slice(-1)[0] || { seq: 0 }).seq;
  if (first || S.chatSeen === undefined) { S.chatSeen = last; S.chatRead = Math.max(S.chatRead || 0, last); syncChatFab(); return; }
  const fresh = list.filter((m) => m.seq > S.chatSeen);
  S.chatSeen = last;
  const box = document.getElementById('chat-list');
  if (box) { box.innerHTML = chatListHTML(st); box.scrollTop = box.scrollHeight; S.chatRead = last; }
  const shown = S.chatOff ? [] : fresh.filter((m) => !S.muted.has(m.id));
  for (const m of shown) chatBubble(m);
  // 다른 사람이 채팅하면 '띠링' (채팅 창을 열어 둬도)
  if (shown.some((m) => !(st.me && m.id === st.me.id))) sound.play('msg');
  syncChatFab();
  syncChatMini();
}
function chatBubble(m) {
  if (S.view !== 'room') return;
  const seat = document.querySelector(`.seat[data-id="${m.id}"] .seat-av`) || (S.state && S.state.me && S.state.me.id === m.id ? document.querySelector('.me-name') : null);
  document.querySelectorAll(`.fx-chat[data-from="${CSS.escape(String(m.id))}"]`).forEach((x) => x.remove()); // 같은 사람 말풍선은 새 것만
  const el = document.createElement('div');
  el.className = 'fx-chat';
  el.dataset.from = m.id;
  el.innerHTML = `<b>${esc(m.name)}</b> ${esc(m.text)}`;
  if (seat) {
    const r = seat.getBoundingClientRect();
    el.style.left = Math.max(70, Math.min(innerWidth - 70, r.left + r.width / 2)) + 'px';
    el.style.top = Math.max(50, r.top - 6) + 'px';
  } else { el.style.left = '50%'; el.style.top = '22%'; }
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

// ── 소리·애니메이션 트리거 ─────────────────────────────
function tourneyEffects(st) {
  const tn = st.room.tournament;
  if (!tn) return;
  if (tn.running) {
    if (S.lastLevel && tn.level > S.lastLevel) {
      banner('⬆ 블라인드 상승!', `레벨 ${tn.level} · <b>${fmt(tn.sb)}/${fmt(tn.bb)}</b>`, 'level', 2200);
      sound.play(gameOf(st) === 'holdem' ? 'turn' : 'stamp');
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
    const pz = st.room.settings.prizes || [];
    const last = tn.result.ranking.length;
    const prizeOf = (place) => (place <= 3 && pz[place - 1]) || (place === last && place > 1 && pz[3]) || ''; // 꼴찌 벌칙은 맨 마지막 순위에
    openModal('토너먼트 결과', `
      <ol class="rank-list">${tn.result.ranking.map((r) => `<li class="${r.id === meId ? 'is-me' : ''}"><span class="rank-medal">${medal[r.place - 1] || r.place + '위'}</span><b>${esc(r.name)}</b>${r.id === meId ? ' <span class="muted small">(나)</span>' : ''}${prizeOf(r.place) ? `<span class="rank-prize">${esc(prizeOf(r.place))}</span>` : ''}</li>`).join('')}</ol>
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
        if (gameOf(st) === 'holdem') sound.play('shuffle');
        const d0 = gameOf(st) === 'holdem' ? 650 : 150;
        for (let i = 0; i < n; i++) setTimeout(() => sound.play('deal'), delay + d0 + i * 85);
      }
      continue;
    }
    if (e.type === 'allin') setTimeout(() => allinStamp(e.id), delay);
    if (e.type === 'fold' && gameOf(st) === 'holdem') foldFly(e.id);
    if (e.type === 'check' && gameOf(st) === 'holdem') setTimeout(() => knockFx(e.id), delay);
    const iWon = e.type === 'end' && e.winners && e.winners.includes(meId);
    if (e.type === 'street' || e.type === 'end') S.sdLastTo = 0;
    if (e.type === 'street' && gameOf(st) === 'holdem' && e.board) setTimeout(() => dealerBurn(e.board.length), delay);
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

// 폴드: 카드를 테이블 가운데(머크)로 휙 던지면 돌면서 스르륵 사라진다 (다시 그리기 전 화면에서 복사)
function foldFly(id) {
  if (gws.reduceMotion()) return;
  const seat = document.querySelector(`#g-table .seat[data-id="${id}"]`);
  const src = seat && seat.querySelector('.seat-cards, .seat-mycards');
  const board = document.querySelector('#g-table .board') || document.getElementById('g-table');
  if (!src || !board) return;
  const to = centerOf(board);
  [...src.querySelectorAll('.card')].forEach((c, i) => {
    const r = c.getBoundingClientRect();
    if (!r.width) return;
    const g = c.cloneNode(true);
    g.classList.remove('card-deal', 'card-flip', 'card-hl');
    g.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;--w:${r.width}px;margin:0;z-index:5;pointer-events:none;animation:none`;
    fxLayer().appendChild(g);
    const dx = to.x - (r.left + r.width / 2) + (i ? 10 : -10); const dy = to.y - (r.top + r.height / 2);
    const spin = (i ? 1 : -1) * (150 + Math.random() * 60);
    g.animate([
      { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.8}px,${dy * 0.8}px) rotate(${spin * 0.8}deg) scale(.85)`, opacity: 0.95, offset: 0.6 },
      { transform: `translate(${dx}px,${dy}px) rotate(${spin}deg) scale(.7)`, opacity: 0 },
    ], { duration: 720, delay: i * 70, easing: 'cubic-bezier(.2,.75,.3,1)', fill: 'both' }).onfinish = () => g.remove();
  });
}
// 체크: 주먹으로 테이블을 탁탁 (자리 아래 물결 두 번)
function knockFx(id) {
  if (gws.reduceMotion()) return;
  const av = document.querySelector(`#g-table .seat[data-id="${id}"] .seat-av`);
  if (!av) return;
  const c = centerOf(av);
  // 오프라인처럼: 손가락으로 테이블을 '톡, 톡' (주먹 그림 없이, 펠트에 작은 물결만)
  const t = document.getElementById('g-table');
  const tc = t ? centerOf(t) : c;
  const hx = c.x + (tc.x - c.x) * 0.28; const hy = c.y + (tc.y - c.y) * 0.28 + 6;
  [0, 165].forEach((d) => setTimeout(() => {
    const r = document.createElement('div');
    r.className = 'fx-knock';
    r.style.left = hx + 'px'; r.style.top = (hy + 10) + 'px';
    fxLayer().appendChild(r);
    setTimeout(() => r.remove(), 650);
  }, d));
}

// 딜러가 카드 한 장을 버리고(번) 바닥 카드를 펼치는 모습 + '플랍 · 턴 · 리버' 안내
function dealerBurn(n) {
  if (gws.reduceMotion()) return;
  const board = document.querySelector('#g-table .board');
  if (!board) return;
  const b = board.getBoundingClientRect();
  const card = document.createElement('div');
  card.className = 'fx-burn card card-sm card-back';
  card.innerHTML = '<span class="card-back-mark">찬</span>';
  card.style.left = (b.left + b.width / 2) + 'px'; card.style.top = (b.top - 30) + 'px';
  fxLayer().appendChild(card);
  card.animate([{ transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1, offset: 0.2 }, { transform: `translate(calc(-50% + ${b.width / 2 + 10}px), -50%) rotate(25deg) scale(.8)`, opacity: 0 }], { duration: 600, easing: 'ease-in', fill: 'both' }).onfinish = () => card.remove();
  const tag = document.createElement('div');
  tag.className = 'fx-street';
  tag.textContent = { 3: '플랍', 4: '턴', 5: '리버' }[n] || '';
  tag.style.left = (b.left + b.width / 2) + 'px'; tag.style.top = (b.top - 8) + 'px';
  fxLayer().appendChild(tag);
  setTimeout(() => tag.remove(), 1300);
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
  if (S.view !== 'room' && S.fsOn) { S.fsOn = false; try { screen.orientation.unlock(); } catch {} if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  document.body.dataset.theme = S.view === 'room' && S.state ? gameOf(S.state) : S.view === 'home' || S.view === 'admin' ? 'hub' : (S.game || 'holdem');
  document.body.classList.toggle('in-room', S.view === 'room');
  syncChatFab();
  syncInstallBar();
  // 배경음악: 메인은 메인 곡, 게임 화면·게임방은 그 게임 곡
  const th = document.body.dataset.theme;
  sound.setTrack(th === 'hub' ? 'bgm_hub' : th === 'holdem' ? 'bgm_holdem' : 'bgm_' + th);
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
  // 찬덤 홀덤 앱(또는 홀덤 방): 게임월드 대신 찬덤 홀덤 이름표
  if (HOLDEM_APP || (S.state && gameOf(S.state) === 'holdem')) return `<div class="logo ${small ? 'logo-sm' : ''}"><img class="logo-icon" src="/img/holdem-icon-192.png" alt="" onerror="this.remove()"><div class="logo-text"><span class="logo-ko">찬덤 홀덤</span>${small ? '' : '<span class="logo-en">CHANDEM HOLDEM</span>'}</div></div>`;
  return `<div class="logo ${small ? 'logo-sm' : ''}">
    <img class="logo-icon" src="/img/gw2-icon-192.png" alt="" onerror="this.remove()">
    <div class="logo-text">${small ? '<span class="logo-ko">게임월드</span>' : '<span class="logo-ko logo-pop" data-text="찬이의 게임월드">찬이의 게임월드</span>'}<span class="logo-en">CHAN'S GAME WORLD</span></div>
  </div>`;
}

const GAME_INFO = {
  langbang: { name: '랑방 대전', icon: '', sub: '스테이지 디펜스 · 30스테이지 · 랭킹', tag: '우리 모임에 쳐들어오는 진상들을 때려잡자', href: '/langbang/', best: true },
  holdem: { name: '찬덤 홀덤', icon: '♠', sub: '노리밋 홀덤 · 연습 테이블 · 실력 티어', tag: '카드 2장 + 바닥 5장, 최고의 5장으로 승부' },
  seotda: { name: '섯다', icon: '', sub: '화투 두 장 · 광땡 · 땡잡이', tag: '두 장의 화투로 끗발 대결, 기세로 밀어붙여라' },
  omok: { name: '오목', icon: '', sub: '1:1 대국 · AI · 티어', tag: '다섯 알을 먼저 잇는 사람이 승리' },
  // 강성구 키우기: 따로 있는 사이트(Vercel)로 이동 · 같은 탭 (뒤로 가기로 게임월드에 돌아옴)
  sunggu: { name: '강성구 키우기', icon: '', sub: '외모 65세 서울역 거지 강성구를 28세 존잘로! 육성 시뮬 · 결말 86개 · 게임월드 계정 랭킹', tag: '외모 65세 서울역 거지 강성구를 28세 존잘로!', href: 'https://sunggu-game.vercel.app' },
};
const GAME_RULES = {
  holdem: '<p>각자 카드 2장을 받고, 바닥에 5장이 차례로 깔려요. 7장 중 가장 좋은 5장으로 족보를 겨뤄요.</p><p>베팅: 체크(넘기기) · 콜(따라가기) · 레이즈(올리기) · 폴드(포기) · 올인</p><p>토너먼트는 시간마다 블라인드가 올라가고, 칩을 다 잃으면 탈락해요.</p>',
  seotda: '<p><b>두 장 섯다</b>: 모두 판돈을 내고 화투 두 장씩 받아요. 한 바퀴 베팅한 뒤 족보가 높은 사람이 판돈을 가져가요.</p><p><b>세 장 섯다</b>: 두 장을 받고 1차 베팅, 한 장을 더 받고 2차 베팅. 세 장 중 가장 좋은 두 장으로 승부해요(자동으로 골라 줘요). 방 설정 <b>세장섯다 공개</b>가 <b>한 장 공개</b>(기본)면: 두 장을 받자마자 한 장을 골라 모두에게 공개(10초, 안 고르면 낮은 카드), 1차 베팅 → 세 번째 카드(뒷면) → 2차 베팅 → 세 장 중 두 장을 직접 골라 승부(10초, 안 고르면 가장 좋은 두 장). <b>공개 없음</b>이면 쇼다운 전까지 아무 카드도 공개되지 않고 두 장은 자동으로 골라요. 내 화면에 앞면으로 보이는 카드는 나만 봐요.</p><p>베팅: 다이(포기) · 체크 · 삥(판돈만큼) · 콜 · 따당(두 배) · 하프(판의 절반 더) · 올인</p><p>족보는 게임 안의 <b>족보표</b>에서 볼 수 있어요. 구사가 나오면 판돈을 걸고 재경기해요.</p>',
  omok: '<p>흑이 먼저 두고, 가로·세로·대각선으로 <b>정확히 다섯 알</b>을 먼저 이으면 이겨요.</p><p>흑은 <b>삼삼</b>(열린 3이 두 개 생기는 자리)에 둘 수 없어요. 흑의 여섯 알(장목)은 승리가 아니에요.</p><p>로그인하면 대국마다 점수가 오르내리고 티어가 정해져요.</p>',
};
// ── 게임 그림: 랑방 대전은 내 진행 챕터(langbang:chapter, 랑방 화면이 저장)에 맞는 키 아트 ──
const lbChapter = () => { const n = Math.trunc(Number(LS.get('langbang:chapter', 1))); return n >= 1 && n <= 8 ? n : 1; }; // (8장까지 · 키 아트가 없으면 뒤의 기본 그림)
// 시즌 테마 (할로윈 등): 랑방 화면이 적어 둔 시즌 키 아트 — 끝나는 시각이 지나면 원래 챕터 그림
const lbSeasonArt = () => { const v = LS.get('langbang:seasonArt', null); return v && typeof v.art === 'string' && /^\/img\/lb\/season\/[a-z0-9_]+\.webp(\?v=\d+)?$/.test(v.art) && Date.now() < Number(v.until) ? v.art : ''; };
const gameArt = (g) => (g === 'langbang' ? lbSeasonArt() || `/img/lb/keyart${lbChapter()}.webp` : `/img/games/${g}.webp`);
// 키 아트가 없으면 뒤에 깔린 기본 그림이 보인다
const gameArtCSS = (g) => (g === 'langbang' ? `url('${gameArt(g)}'), url('/img/games/langbang.webp')` : `url('${gameArt(g)}')`);
function gameCardArtHTML(k) {
  if (k !== 'langbang' || lbSeasonArt()) return `<span class="gc-art" style="background-image:${gameArtCSS(k)}"></span>`;
  // 챕터가 바뀌었으면 예전 그림에서 새 그림으로 부드럽게 바뀌게
  const cur = lbChapter();
  const prev = Number(LS.get('gw:lbArtShown', 0));
  LS.set('gw:lbArtShown', cur);
  if (!prev || prev === cur || prev < 1 || prev > 8) return `<span class="gc-art" style="background-image:${gameArtCSS(k)}"></span>`;
  return `<span class="gc-art" style="background-image:url('/img/lb/keyart${prev}.webp'), url('/img/games/langbang.webp')"></span>`
    + `<span class="gc-art gc-art-next" style="background-image:${gameArtCSS(k)}"></span>`;
}
// 다른 탭·뒤로 오기로 챕터가 바뀐 채 메인이 보이면 카드 그림만 다시
window.addEventListener('storage', (e) => { if ((e.key === 'langbang:chapter' || e.key === 'langbang:seasonArt') && S.view === 'home') render(); });

// ── 게임 들어가기: 메인이 살짝 작아지며 사라지고 → 게임 그림 로딩 화면 → 게임 화면 ──
const GAME_ASSETS = { holdem: ['/img/felt.webp'], seotda: ['/img/bg-seotda.webp', '/img/felt-seotda.webp'], omok: ['/img/bg-omok.webp'], langbang: [] };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const preloadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = () => res(); i.src = src; });
function enterGame(g) { S.game = g; LS.set('chandem:game', g); nav('/'); S.view = 'gamehome'; render(); }
// 강성구 키우기(따로 있는 사이트): 게임월드 로그인으로 만든 출입증을 주소 # 뒤에 붙여 넘긴다 (서버로는 안 감)
async function sungguPass() {
  if (!S.auth) return null;
  try {
    const r = await Promise.race([fetch('/api/sunggu/pass', { method: 'POST', headers: { authorization: 'Bearer ' + S.auth }, cache: 'no-store' }).then((x) => x.json()), wait(4000).then(() => null)]);
    return r && r.ok ? r : null;
  } catch { return null; }
}
async function goSunggu() {
  S.sgNext = false;
  const r = await sungguPass();
  if (!r) { toast('강성구 키우기로 로그인을 넘기지 못했어요. 다시 해 주세요', 'error'); return; }
  toast(`${r.nickname}님으로 강성구 키우기에 로그인해요`, 'ok');
  setTimeout(() => { location.href = GAME_INFO.sunggu.href + '#sgt=' + encodeURIComponent(r.pass); }, 500);
}
async function launchGame(g) {
  const info = GAME_INFO[g];
  if (!info || S.launching) return;
  if (g === 'sunggu' && S.auth) { S.launching = true; const r = await sungguPass(); S.launching = false; location.href = info.href + (r ? '#sgt=' + encodeURIComponent(r.pass) : ''); return; }
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
  const status = r.practice ? '연습 테이블 · 상주 플레이어와' : r.phase === 'playing' ? (r.tournament ? '토너먼트 중' : `게임 중${r.handNo ? ` · ${r.handNo}판째` : ''}`) : '대기 중';
  const sub = r.game === 'seotda' ? ` · ${r.cards === 3 ? '세 장' : '두 장'}` : '';
  const canJoin = !r.practice && !full && !(r.tournament && r.phase === 'playing');
  return `<div class="lr-item">
    <span class="lr-icon">${P.hubIcon(HUB_GAME_ICON[r.game] || 'spade')}</span>
    <div class="lr-main"><b>${esc(r.hostName || '방장')}님의 ${info.name}${sub}</b>${r.hasPassword ? P.hubIcon('lock', 'hic-xs') : ''}
      <small>${status} · ${r.players}/${r.maxPlayers}명${r.spectators ? ` · 관전 ${r.spectators}` : ''}${r.bots ? ` · ${r.game === 'holdem' ? '상주' : '봇'} ${r.bots}` : ''}</small></div>
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
    const friends = game === 'holdem' ? list.filter((x) => !x.practice) : list;
    box.innerHTML = friends.length ? friends.map(roomItemHTML).join('') : `<p class="muted small">${game === 'holdem' ? '지금 열린 친구 방이 없어요 · <b>방 만들기</b>를 누르고 카톡으로 링크를 보내 보세요!' : '지금 열린 방이 없어요. 방을 만들어 친구를 불러 보세요!'}</p>`;
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
  if (g === 'holdem') { renderHoldemLobby(); return; }
  const info = GAME_INFO[g];
  $app.innerHTML = `
  <main class="home game-home">
    <div class="top-bar"><button class="btn btn-sm btn-outline" id="to-hub">‹ 게임 선택</button>${SHARE_BTN}</div>
    ${g === 'holdem' ? '' : S.info && S.info.accounts === false ? '' : RK.hallHTML(g)}
    <div class="gh-hero" style="background-image:url('${g === 'holdem' ? '/img/holdem/hero2.webp' : `/img/games/${g}.webp`}')"><div class="gh-shade"></div>
      <div class="gh-title"><span class="gh-icon">${P.hubIcon(HUB_GAME_ICON[g] || 'cards', 'hic-lg')}</span><h1>${info.name}</h1><p>${info.tag}</p>
      ${g === 'holdem' ? '<div class="gh-chips"><span>토너먼트</span><span>최대 9명</span><span>채팅</span><span>AI 연습</span></div>' : ''}</div>
    </div>
    <section class="panel">
      <button class="btn btn-gold btn-lg" id="go-create">친구와 방 만들기</button>
      <button class="btn btn-outline btn-lg" id="go-practice">${g === 'omok' ? '혼자 대국하기' : '혼자 연습하기'}</button>
      <div class="row">
        <button class="btn btn-ghost grow" id="go-rules">게임 방법</button>
        ${g === 'omok' ? '<button class="btn btn-ghost grow" id="go-rank">랭킹</button>' : ''}
      </div>
    </section>
    <section class="panel live-rooms" id="live-rooms"><h2 class="sec-title">지금 열린 ${info.name} 방</h2><div class="lr-list"><p class="muted small">불러오는 중…</p></div></section>
    ${g === 'holdem' && !(S.info && S.info.accounts === false) ? RK.hallHTML(g) : ''}
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
const HUB_GAME_ICON = { holdem: 'spade', seotda: 'hwatu', omok: 'omok', langbang: 'cards', sunggu: 'sunggu' };
// 홀덤 앱처럼 첫 화면이 로그인 확인보다 먼저 그려지면 '로그인' 버튼이 남는다 → 확인 끝나면 그 버튼만 바꾼다
function refreshAcctBtn() {
  const ab = document.getElementById('acct-btn');
  if (!ab) return;
  const t = document.createElement('div'); t.innerHTML = hubAcctHTML();
  const nb = t.firstElementChild; if (!nb) return;
  ab.replaceWith(nb);
  nb.onclick = () => (S.user ? openProfile() : openLogin());
}
function hubAcctHTML() {
  if (S.info && S.info.accounts === false) return '<span></span>';
  if (!S.user) return `<button class="hub-acct tap" id="acct-btn">${P.hubIcon('lock')}<b>로그인</b></button>`;
  const t = tierOf(S.user.stats.omok.rating);
  return `<button class="hub-acct tap is-user ${S.user.isMaster ? 'is-master' : ''}" id="acct-btn" title="내 전적">${S.user.isMaster ? P.hubIcon('crown') : `<span class="acct-dot" style="--tc:${t.color}"></span>`}<b class="acct-name">${esc(S.user.nickname)}</b></button>`;
}
// (랑방 시즌 키 아트가 걸려 있으면 평소 타이틀 영상은 덮지 않게 뺀다)
// 첫 화면 게임 카드: 랑방 대전(크게) → 찬덤 홀덤 · 강성구 키우기(반반 'pair') → 섯다 · 오목(작게 'mini') — 스크롤 없이 한눈에
function hubCardHTML(k, g, size = '') {
  const hero = k === 'langbang';
  const rm = gws.reduceMotion();
  const media = hero
    ? `${gameCardArtHTML(k)}${rm || lbSeasonArt() ? '' : '<video class="gc-video" muted loop playsinline preload="metadata" poster="/img/lb/title_poster.jpg?v=3" aria-hidden="true" disablepictureinpicture><source src="/img/lb/title_loop.mp4?v=3" type="video/mp4"></video>'}`
    : gameCardArtHTML(k);
  const title = hero
    ? '<img class="gc-logo" src="/img/lb/logo_langbang.webp" alt="랑방 대전" onerror="this.replaceWith(Object.assign(document.createElement(\'b\'),{className:\'gc-title\',textContent:\'랑방 대전\'}))">'
    : GAME_LOGO[k] ? `<img class="gc-logo gc-logo-${k}" src="${GAME_LOGO[k]}" alt="${esc(g.name)}" draggable="false">` : `<b class="gc-title">${esc(g.name)}</b>`;
  return `
    <button class="game-card hub-card game-card-${k} ${hero ? 'is-hero' : ''} ${size ? 'is-' + size : ''} ${g.best ? 'is-best' : ''} tap" data-game="${k}">
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
    <div class="top-bar hub-top">${hubAcctHTML()}<span class="top-btns"><button class="hub-pill-btn tap install-btn" id="install-pick" aria-label="앱 설치">앱 설치</button><button class="hub-ico tap" id="share-top" aria-label="공유하기">${P.hubIcon('link')}</button>${P.topIconsHTML()}</span></div>
    <header class="hub-hero">
      <img class="hub-logo" src="/img/hub/logo_world.webp" width="1100" height="594" alt="찬이의 게임월드 CHAN'S GAME WORLD" onerror="this.hidden=true;this.nextElementSibling.hidden=false">
      <div class="hub-logo-text" hidden><span class="logo-pop hub-logo-ko" data-text="찬이의 게임월드">찬이의 게임월드</span><span class="hub-logo-en">CHAN'S GAME WORLD</span></div>
      <p class="hub-tagline">친구들과 휴대폰으로 즐기는 우리들의 게임월드</p>
    </header>
    ${iosInAppBannerHTML()}
    <section class="game-cards hub-cards hub-top3">
      ${S.info && S.info.langbang ? hubCardHTML('langbang', GAME_INFO.langbang) : ''}
      <div class="hub-pair">${['holdem', 'sunggu'].map((k) => hubCardHTML(k, GAME_INFO[k], 'pair')).join('')}</div>
      <div class="hub-minis">${['seotda', 'omok'].map((k) => hubCardHTML(k, GAME_INFO[k], 'mini')).join('')}</div>
    </section>
    <div id="hub-extras">${P.hubExtrasHTML()}</div>
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

const GAME_NAMES = { holdem: '♠ 찬덤 홀덤', seotda: '섯다', omok: '오목' };
const gameOf = (st) => (st && st.room && st.room.settings && st.room.settings.game) || 'holdem';
function gamePickHTML(cur, name = 'game') {
  return `<div class="seg game-pick">${Object.entries(GAME_NAMES).map(([k, t]) => `<label class="seg-opt"><input type="radio" name="${name}" value="${k}" ${cur === k ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>`;
}

function settingsFormHTML(s, { forCreate = false } = {}) {
  return `
  ${forCreate ? `
  <fieldset class="fieldset ${S.game ? 'hidden-pick' : ''}"><legend>게임</legend>${gamePickHTML(S.game || s.game || 'holdem')}
    <p class="muted small" data-game-note></p></fieldset>
  ${nickFieldHTML('내 닉네임')}
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
    <label class="field tourney-only"><span>토너먼트 블라인드 오르는 간격</span>
      <select class="input" name="levelMinutes">${[3, 5, 7, 10, 15, 20].map((m) => `<option value="${m}" ${Number(s.levelMinutes || 7) === m ? 'selected' : ''}>${m}분마다</option>`).join('')}</select></label>
    <p class="tourney-est tourney-only" data-tourney-est></p>
    <label class="field tourney-only"><span>테이블당 자리 <small class="muted">(이보다 많이 모이면 시작할 때 테이블을 나눠요)</small></span>
      <select class="input" name="tableSize">${[6, 8, 9, 10].map((v) => `<option value="${v}" ${Number(s.tableSize || 9) === v ? 'selected' : ''}>${v}명</option>`).join('')}</select></label>
    <label class="field tourney-only"><span>리바이 · 늦은 참가</span>
      <select class="input" name="reentryLevels">${[[0, '없음 (처음 앉은 사람만)'], [2, '레벨 2까지'], [3, '레벨 3까지'], [4, '레벨 4까지'], [6, '레벨 6까지']].map(([v, t]) => `<option value="${v}" ${Number(s.reentryLevels || 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="field tourney-only"><span>1인당 리바이 횟수 <small class="muted">(리바이를 받을 때만)</small></span>
      <select class="input" name="rebuyMaxT">${[[1, '1번'], [2, '2번'], [3, '3번'], [5, '5번'], [99, '제한 없음']].map(([v, t]) => `<option value="${v}" ${Number(s.rebuyMax || 3) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="prize-grid tourney-only"><span class="prize-head">순위별 상품 · 벌칙 <small class="muted">(선택 · 결과 화면에 나와요)</small></span>
      ${[['1등', '예: 치킨 쏘기 면제'], ['2등', '예: 음료수'], ['3등', ''], ['꼴찌', '예: 커피 쏘기']].map(([t, ph], i) => `<label class="prize-row"><b>${t}</b><input class="input" name="prize${i}" maxlength="24" placeholder="${ph}" value="${esc((s.prizes || [])[i] || '')}" autocomplete="off"></label>`).join('')}</div>
    <label class="field tourney-only"><span>블라인드 표 직접 정하기 <small class="muted">(비우면 자동)</small></span>
      <input class="input" name="blindLevels" placeholder="예: 10/20, 15/30, 25/50, 50/100" value="${esc((s.blindLevels || []).map((x) => x.join('/')).join(', '))}" autocomplete="off"></label>
    <p class="muted small tourney-only">토너먼트는 정해진 시간마다 블라인드가 올라가고, 칩을 다 잃으면 탈락해요. 마지막까지 남은 사람이 우승이에요. 리바이 시간 안에는 다 잃어도 시작 칩으로 다시 들어오고, 늦게 온 친구도 앉을 수 있어요.</p>
  </fieldset>
  <fieldset class="fieldset holdem-only-f">
    <legend>앤티 · 타임뱅크</legend>
    <label class="switch"><input type="checkbox" name="ante" ${s.ante === 'bb' ? 'checked' : ''}><span>BB 앤티 <small class="muted">(빅 블라인드 자리가 BB만큼 더 내서 팟이 커져요)</small></span></label>
    <label class="field"><span>타임뱅크 <small class="muted">(턴 시간이 끝나면 자동으로 더 생각할 시간)</small></span>
      <select class="input" name="timeBank">${[[0, '없음'], [15, '15초'], [30, '30초'], [60, '60초'], [90, '90초']].map(([v, t]) => `<option value="${v}" ${Number(s.timeBank === undefined ? 30 : s.timeBank) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
  </fieldset>
  <div class="grid2 chips-only">
    <label class="field"><span>시작 칩</span><input class="input" type="number" inputmode="numeric" name="startChips" min="100" value="${s.startChips}"></label>
    <label class="field"><span>턴 제한시간(초)</span><input class="input" type="number" inputmode="numeric" name="turnSeconds" min="10" max="120" value="${s.turnSeconds}"></label>
    <label class="field holdem-only-f"><span>스몰 블라인드</span><input class="input" type="number" inputmode="numeric" name="sb" min="1" value="${s.sb}"></label>
    <label class="field"><span><span class="holdem-only-f">빅 블라인드</span><span class="seotda-only-f">기본 판돈 (삥)</span></span><input class="input" type="number" inputmode="numeric" name="bb" min="1" value="${s.bb}"></label>
    <label class="field"><span>최소 인원</span><input class="input" type="number" inputmode="numeric" name="minPlayers" min="2" max="9" value="${s.minPlayers}"></label>
    <label class="field"><span>최대 인원 <small class="muted">(토너먼트는 30명까지)</small></span><input class="input" type="number" inputmode="numeric" name="maxPlayers" min="2" max="30" value="${s.maxPlayers}"></label>
  </div>
  <fieldset class="fieldset chips-only cash-only">
    <legend>게임 시간 · 정산</legend>
    <label class="field"><span>게임 시간 <small class="muted">(지나면 그 판이 끝난 뒤 자동으로 정산)</small></span>
      <select class="input" name="sessionMinutes">${[[0, '정하지 않음 (방장이 끝낼 때 정산)'], [30, '30분'], [60, '1시간'], [90, '1시간 30분'], [120, '2시간'], [180, '3시간']].map(([v, t]) => `<option value="${v}" ${Number(s.sessionMinutes || 0) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="field"><span>정산 환산 <small class="muted">(선택 · 친구끼리 정한 값을 정산표에 같이 보여 줘요)</small></span>
      <div class="settle-rate">칩 <input class="input" type="number" inputmode="numeric" name="settlePer" min="1" value="${s.settlePer || 1000}"> = <input class="input" type="number" inputmode="numeric" name="settleValue" min="0" value="${s.settleValue || ''}" placeholder="0"> <input class="input" name="settleUnit" maxlength="6" value="${esc(s.settleUnit || '')}" placeholder="단위"></div></div>
  </fieldset>
  <fieldset class="fieldset chips-only cash-only">
    <legend>리바인</legend>
    <label class="switch"><input type="checkbox" name="rebuyEnabled" ${s.rebuyEnabled ? 'checked' : ''}><span>리바인 허용</span></label>
    <div class="grid2">
      <label class="field"><span>리바인 금액</span><input class="input" type="number" inputmode="numeric" name="rebuyAmount" min="1" value="${s.rebuyAmount}"></label>
      <label class="field"><span>1인당 최대 횟수</span><input class="input" type="number" inputmode="numeric" name="rebuyMax" min="1" max="99" value="${s.rebuyMax}"></label>
    </div>
    <label class="switch"><input type="checkbox" name="rebuyFlex" ${s.rebuyFlex ? 'checked' : ''}><span>리바인 금액을 각자 정하기 <small class="muted">(아래 범위 안에서 신청하는 사람이 골라요)</small></span></label>
    <div class="grid2 rebuy-range">
      <label class="field"><span>최소 금액</span><input class="input" type="number" inputmode="numeric" name="rebuyLo" min="1" value="${s.rebuyLo || Math.round((s.rebuyAmount || 1000) / 2)}"></label>
      <label class="field"><span>최대 금액</span><input class="input" type="number" inputmode="numeric" name="rebuyHi" min="1" value="${s.rebuyHi || (s.rebuyAmount || 1000) * 2}"></label>
    </div>
    <p class="muted small">칩이 시작 칩의 절반보다 적거나 다 떨어졌을 때 신청할 수 있어요. 진행 중인 판에는 영향이 없고 다음 판부터 적용돼요.</p>
  </fieldset>
  <fieldset class="fieldset">
    <legend>입장 제한 (선택)</legend>
    <label class="field"><span>비밀번호</span><input class="input" name="password" maxlength="20" value="${esc(s.password || '')}" placeholder="비워두면 없음" autocomplete="off"></label>
    <label class="switch"><input type="checkbox" name="approval" ${s.approval ? 'checked' : ''}><span>방장이 참가를 승인</span></label>
  </fieldset>`;
}

// 토너먼트 예상 시간: 서버와 같은 블라인드 표로 '칩 합계 ÷ 25 ≥ BB'가 되는 레벨까지 (사람끼리 한 판 ≈ 1분)
const LEVEL_MULT = [1, 1.5, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400];
const stepOf = (v) => (v < 20 ? 1 : v < 100 ? 5 : v < 1000 ? 25 : v < 10000 ? 100 : 1000);
function blindLadder(sb, bb, custom) {
  const c = String(custom || '').split(/[,\n;]+/).map((t) => t.trim().split(/[\/\s]+/).map(Number)).filter((x) => x[0] > 0 && x[1] > 0);
  if (c.length) return c.map(([s, b]) => ({ sb: s, bb: b }));
  const out = [];
  for (const m of LEVEL_MULT) {
    const prev = out[out.length - 1];
    let s = m === 1 ? sb : Math.max(1, Math.round((sb * m) / stepOf(sb * m)) * stepOf(sb * m));
    if (prev && s <= prev.sb) s = prev.sb + stepOf(prev.sb);
    let b = m === 1 ? bb : Math.round(s * (bb / sb));
    if (prev && b <= prev.bb) b = prev.bb + stepOf(prev.bb);
    out.push({ sb: s, bb: b });
  }
  return out;
}
function bindTourneyEst(form) {
  const el = form.querySelector('[data-tourney-est]');
  if (!el) return;
  const upd = () => {
    const fd = new FormData(form);
    form.dataset.mode = fd.get('mode') === 'tournament' ? 'tournament' : 'cash';
    const start = Number(fd.get('startChips')) || 1000; const sb = Number(fd.get('sb')) || 10; const bb = Number(fd.get('bb')) || 20;
    const mins = Number(fd.get('levelMinutes')) || 7;
    const L = blindLadder(sb, bb, fd.get('blindLevels'));
    const est = (n) => { const tot = n * start; let i = L.findIndex((x) => x.bb >= tot / 25); if (i < 0) i = L.length - 1; return (i + 1) * mins; };
    const fmtM = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ''}` : `${m}분`);
    el.innerHTML = `예상 시간 · 4명 <b>${fmtM(est(4))}</b> · 6명 <b>${fmtM(est(6))}</b> · 9명 <b>${fmtM(est(9))}</b><br><span class="muted">시작 칩 ${fmt(start)} = ${Math.round(start / bb)}BB · 블라인드 ${L.slice(0, 6).map((x) => `${fmt(x.sb)}/${fmt(x.bb)}`).join(' → ')} …</span>`;
  };
  form.addEventListener('input', upd); form.addEventListener('change', upd);
  upd();
}

// 게임 고르기에 따라 설정 칸 보이기/숨기기
function bindGamePick(form, name = 'game') {
  bindTourneyEst(form);
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
    rebuyEnabled: fd.get('rebuyEnabled') === 'on', rebuyAmount: num('rebuyAmount'), rebuyFlex: fd.get('rebuyFlex') === 'on', rebuyLo: num('rebuyLo') || undefined, rebuyHi: num('rebuyHi') || undefined, rebuyMax: fd.get('mode') === 'tournament' && fd.get('rebuyMaxT') ? num('rebuyMaxT') : num('rebuyMax'),
    password: String(fd.get('password') || ''), approval: fd.get('approval') === 'on',
    mode: fd.get('mode') === 'tournament' ? 'tournament' : 'cash', levelMinutes: num('levelMinutes') || 7,
    ante: fd.get('ante') === 'on' ? 'bb' : 'none', timeBank: fd.get('timeBank') === null ? 30 : num('timeBank'),
    reentryLevels: num('reentryLevels') || 0, blindLevels: String(fd.get('blindLevels') || '').trim(),
    prizes: [0, 1, 2, 3].map((i) => String(fd.get('prize' + i) || '').trim()),
    tableSize: num('tableSize') || 9,
    sessionMinutes: num('sessionMinutes') || 0, settlePer: num('settlePer') || 1000, settleValue: num('settleValue') || 0, settleUnit: String(fd.get('settleUnit') || '').trim(),
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
  if (s.mode !== 'tournament' && s.maxPlayers > 10) return '일반 게임은 한 테이블 10명까지예요 (10명 넘게는 토너먼트로)';
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
    if (!name || BAD_NICK.test(name)) { toast('친구들이 알아볼 수 있는 닉네임을 입력해 주세요', 'error'); return; }
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
    <header class="page-head"><button class="icon-btn" id="back" aria-label="뒤로">←</button><h1>${S.game === 'holdem' ? '토너먼트 연습' : `${S.game ? GAME_INFO[S.game].name + ' · ' : ''}혼자 연습`}</h1></header>
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
        <div class="seg">${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `<label class="seg-opt"><input type="radio" name="bots" value="${n}" ${cnt === n ? 'checked' : ''}><span>${n}명</span></label>`).join('')}</div>
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

// 닉네임 칸: 친구들과 하는 방은 손님(비회원)이 꼭 직접 입력 (지난번 이름은 한 번 눌러 채우기)
function nickFieldHTML(label = '닉네임') {
  if (S.user) return `<input type="hidden" name="name" value="${esc(S.user.nickname)}"><p class="nick-member">${esc(S.user.nickname)}님으로 참가해요</p>`;
  const last = LS.get('chandem:name', '');
  return `<label class="field"><span>${label} <small class="req">필수 · 친구들이 알아볼 이름</small></span><input class="input" name="name" maxlength="10" required value="" placeholder="닉네임을 입력해 주세요" autocomplete="nickname"></label>
    ${last ? `<button type="button" class="nick-last" onclick="this.previousElementSibling.querySelector('input').value=this.dataset.n;this.remove()" data-n="${esc(last)}">지난번 이름 <b>${esc(last)}</b> 쓰기</button>` : ''}`;
}
const BAD_NICK = /^(손님|게스트|guest|player|플레이어|익명|이름|닉네임|nickname|name|[ㅇ?.\-_~!]+)$/i;
function joinSeatMapHTML(d) {
  const N = Math.max(2, Math.min(10, d.tableSeats || 9));
  const pos = landPositions(N, 40, 38, 50);
  return `<div class="seat-map join-map"><div class="sm-felt"></div>${pos.map((xy, seat) => {
    const p = d.seats.find((x) => x.seat === seat);
    return `<button type="button" class="sm-seat ${p ? 'taken' : 'open'}" ${p ? 'disabled' : `data-jseat="${seat}"`} style="left:${xy.x}%;top:${xy.y}%">${p ? `<span class="avatar avatar-sm"><img src="/img/avatars/a${p.avatar || 1}.webp?v=2" alt=""></span><b>${esc(p.name)}</b>` : `<span>+</span><small>${seat + 1}번 빈자리</small>`}</button>`;
  }).join('')}</div>`;
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
        ${nickFieldHTML()}
        ${d.game !== 'omok' && d.seats && d.tableSeats <= 10 ? `<div class="field"><span>자리 고르기 <small>빈자리를 누르면 그 자리로 들어가요 (안 고르면 알아서 앉혀 드려요)</small></span>${joinSeatMapHTML(d)}</div>` : ''}
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
  S.joinSeat = undefined;
  form.querySelectorAll('[data-jseat]').forEach((b) => {
    b.onclick = () => {
      S.joinSeat = Number(b.dataset.jseat);
      form.querySelectorAll('[data-jseat]').forEach((x) => x.classList.toggle('picked', x === b));
      const sp = form.querySelector('input[name=spectator]'); if (sp) sp.checked = false;
      sound.play('tap');
    };
  });
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name || BAD_NICK.test(name)) { toast('친구들이 알아볼 수 있는 닉네임을 입력해 주세요', 'error'); form.name && form.name.focus(); return; }
    if (!S.user) LS.set('chandem:name', name);
    const res = await emit('room:join', { guest: guestCred(), seat: S.joinSeat === undefined ? undefined : S.joinSeat, code: d.code, name, password: fd.get('password') || '', spectator: fd.get('spectator') === 'on' || !!(S.user && S.user.isMaster && (d.hasPassword || d.approval) && !fd.get('password')), avatar: readAvatar(form), photo: readPhoto(form), auth: S.auth });
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
    <li><span>리바인</span><b>${s.mode === 'tournament' ? (s.reentryLevels > 0 ? `레벨 ${s.reentryLevels}까지 · 1인 ${s.rebuyMax >= 99 ? '제한 없음' : `최대 ${s.rebuyMax}번`}` : '없음') : s.rebuyEnabled ? `${fmt(s.rebuyAmount)} · 최대 ${s.rebuyMax}번` : '없음'}</b></li>
    <li><span>게임</span><b>${GAME_NAMES[s.game || 'holdem']}${s.game === 'seotda' ? ` (${s.cards === 3 ? `세 장 · ${s.sdOpen === 'one' ? '한 장 공개' : '공개 없음'}` : '두 장'})` : ''}</b></li>
    <li><span>방식</span><b>${s.mode === 'tournament' ? `토너먼트 · ${s.levelMinutes}분마다 블라인드 상승` : '일반'}</b></li>
    ${s.mode === 'tournament' && (s.prizes || []).some(Boolean) ? `<li><span>상품·벌칙</span><b>${(s.prizes || []).map((t, i) => (t ? `${['1등', '2등', '3등', '꼴찌'][i]} ${esc(t)}` : '')).filter(Boolean).join(' · ')}</b></li>` : ''}
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

// 여러 테이블 토너먼트에서 파이널로 합쳐져 닫힌 테이블
async function goFinalTable(code) { await emit('room:leave'); LS.del(sessKey(S.code)); S.state = null; S.session = null; S.code = null; S.wantSpectate = true; nav('/r/' + code); boot(); }
function renderClosedTable(st) {
  const m = st.room.tournament.mtt;
  $app.innerHTML = `<main class="home"><section class="panel closed-table">
    <h2 class="sec-title">🏆 파이널 테이블로 합쳐졌어요</h2>
    <p>이 테이블(테이블 ${m.tableNo})의 남은 사람은 모두 파이널 테이블로 옮겼어요. 토너먼트는 거기서 계속돼요.</p>
    <button class="btn btn-gold btn-lg" id="go-final">파이널 테이블 구경하기</button>
    <button class="btn btn-ghost" id="leave-closed">나가기</button></section></main>`;
  $app.querySelector('#go-final').onclick = () => goFinalTable(m.mainCode);
  $app.querySelector('#leave-closed').onclick = async () => { await emit('room:leave'); LS.del(sessKey(S.code)); S.state = null; S.code = null; nav('/'); S.view = 'gamehome'; render(); };
}
function renderLobby() {
  const st = S.state;
  if (st.room.tournament && st.room.tournament.mtt && st.room.tournament.mtt.closed) { renderClosedTable(st); return; }
  const me = st.me;
  const s = st.room.settings;
  const players = st.players.filter((p) => p.role === 'player').sort((a, b) => a.seat - b.seat);
  const specs = st.players.filter((p) => p.role === 'spectator');
  const isHost = me && me.isHost;
  $app.innerHTML = `
  <main class="page lobby">
    <header class="page-head">${logoHTML(true)}<div class="spacer"></div>
      ${SHARE_BTN}
      <button class="icon-btn txt-btn snd-btn" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? '음소거' : '소리'}</button>
      <button class="btn btn-sm btn-ghost" id="chart-btn">족보표</button>
    </header>
    ${guestNudgeHTML(st)}
    ${st.room.settlement ? settlementHTML(st.room.settlement, isHost) : ''}
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
    ${gameOf(st) !== 'omok' && s.maxPlayers <= 10 ? `<section class="panel"><h2 class="sec-title">자리 고르기</h2>${seatMapHTML(st)}<p class="muted small center">${me && me.role === 'player' ? '빈자리를 누르면 그 자리로 옮겨요' : '빈자리를 누르면 그 자리에 앉아요'} · 딜러 버튼은 번호 순서(시계 방향)로 돌아요</p></section>` : ''}
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
  const cp = $app.querySelector('#settle-copy');
  if (cp) cp.onclick = async () => { try { await navigator.clipboard.writeText(settlementText(st.room.settlement)); toast('정산표를 복사했어요 · 단톡방에 붙여 넣어 보세요', 'ok'); } catch { toast('복사하지 못했어요', 'error'); } };
  // 게임이 끝나면: 참여했던 사람에게 정산표(딴 돈·잃은 돈)를 바로 띄운다 (한 번만)
  const stl = st.room.settlement;
  if (stl && S.settleSeen !== stl.at && st.me && stl.rows.some((r) => r.id === st.me.id)) {
    S.settleSeen = stl.at;
    openModal('게임 끝 · 정산표', settlementHTML(stl, false).replace('<section class="panel settle">', '<section class="settle settle-pop">'), (b) => {
      const c = b.querySelector('#settle-copy');
      if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(settlementText(stl)); toast('정산표를 복사했어요 · 단톡방에 붙여 넣어 보세요', 'ok'); } catch { toast('복사하지 못했어요', 'error'); } };
    }, { wide: true });
    sound.play('collect');
  }
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

function seatMapHTML(st) {
  const N = Math.max(2, Math.min(10, st.room.tableSeats || st.room.settings.maxPlayers));
  const seated = st.players.filter((p) => p.role === 'player' && p.seat !== null);
  const mine = st.me && seated.find((p) => p.id === st.me.id);
  const base = mine && mine.seat < N ? mine.seat : 0;
  const pos = landPositions(N, 40, 38, 50);
  return `<div class="seat-map"><div class="sm-felt"></div>${pos.map((xy, r) => {
    const seat = (base + r) % N;
    const p = seated.find((x) => x.seat === seat);
    const me = p && st.me && p.id === st.me.id;
    return `<button type="button" class="sm-seat ${p ? 'taken' : ''} ${me ? 'me' : ''}" ${p ? 'disabled' : `data-sit="${seat}"`} style="left:${xy.x}%;top:${xy.y}%">${p ? `${avatarHTML(p, 'avatar-sm')}<b>${esc(p.name)}</b>` : `<span>${seat + 1}</span><small>빈자리</small>`}</button>`;
  }).join('')}</div>`;
}

// ── 정산표 ──
const settleMoney = (chips, v) => (v ? `${Math.round((chips / v.per) * v.value).toLocaleString('ko-KR')}${esc(v.unit)}` : '');
async function doRebuy(amount) {
  const r = await emit('game:rebuy', amount ? { amount } : {});
  if (r.ok) { toast(`리바인 신청 완료${amount ? ` (+${fmt(amount)})` : ''}! 다음 판부터 적용돼요`, 'ok'); sound.play('chips'); }
}
// 리바인 금액 고르기 (방장이 '각자 정하기'를 켠 방)
function openRebuyPick(st) {
  const s = st.room.settings;
  const lo = s.rebuyLo; const hi = s.rebuyHi;
  const step = Math.max(1, s.bb || 1);
  const start = Math.min(hi, Math.max(lo, s.rebuyAmount));
  openModal('리바인 금액', `<div class="rebuy-pick">
    <p class="muted small">${fmt(lo)} ~ ${fmt(hi)} 사이에서 골라요 · 다음 판부터 적용돼요</p>
    <div class="rp-amt"><b id="rp-v">${fmt(start)}</b> 칩</div>
    <input type="range" id="rp-r" min="${lo}" max="${hi}" step="${step}" value="${start}">
    <div class="rp-quick">${[['최소', lo], ['기본', s.rebuyAmount], ['최대', hi]].filter(([, v]) => v >= lo && v <= hi).map(([t, v]) => `<button type="button" class="btn btn-sm btn-outline" data-rp="${v}">${t} ${fmt(v)}</button>`).join('')}</div>
    <button class="btn btn-gold btn-lg" id="rp-go" type="button">리바인 신청</button></div>`, (b) => {
    const r = b.querySelector('#rp-r'); const v = b.querySelector('#rp-v');
    const set = (x) => { r.value = x; v.textContent = fmt(Number(r.value)); };
    r.oninput = () => set(r.value);
    b.querySelectorAll('[data-rp]').forEach((q) => { q.onclick = () => set(q.dataset.rp); });
    b.querySelector('#rp-go').onclick = () => { const a = Number(r.value); closeModal(); doRebuy(a); };
  });
}
function settlementHTML(x, isHost) {
  const v = x.value;
  const cls = (n) => (n > 0 ? 'plus' : n < 0 ? 'minus' : '');
  return `<section class="panel settle">
    <div class="sec-head"><h2 class="sec-title">정산 결과</h2><small class="muted">${x.hands}판 · ${hhmm(x.at)}${x.reason ? ` · ${esc(x.reason)}` : ''}</small></div>
    <table class="ledger"><thead><tr><th>이름</th><th>바이인</th><th>최종 칩</th><th>손익</th>${v ? `<th>${esc(v.unit) || '환산'}</th>` : ''}</tr></thead><tbody>
    ${x.rows.map((r) => `<tr><td>${esc(r.name)}${r.left ? ' <small class="muted">중간에 나감</small>' : ''}</td><td>${fmt(r.buyIn)}</td><td>${fmt(r.out)}</td><td class="${cls(r.net)}">${signed(r.net)}</td>${v ? `<td class="${cls(r.net)}">${r.net > 0 ? '+' : r.net < 0 ? '−' : ''}${settleMoney(Math.abs(r.net), v)}</td>` : ''}</tr>`).join('')}
    </tbody></table>
    ${x.transfers.length ? `<h3 class="sub-title">누가 누구에게</h3><ul class="settle-list">${x.transfers.map((t) => `<li><b>${esc(t.from)}</b> → <b>${esc(t.to)}</b><span>${fmt(t.chips)}칩${v ? ` · ${settleMoney(t.chips, v)}` : ''}</span></li>`).join('')}</ul>` : `<p class="muted small">${x.rows.some((r) => r.net) ? '사람끼리 주고받을 칩은 없어요 (봇과 오간 칩은 정산에서 빠져요)' : '모두 본전이에요!'}</p>`}
    ${v ? `<p class="muted tiny">환산: 칩 ${fmt(v.per)} = ${fmt(v.value)}${esc(v.unit)} (방장이 정한 값을 보여 주기만 해요. 이 앱에는 돈을 주고받는 기능이 없어요)</p>` : ''}
    <button class="btn btn-gold" id="settle-copy">정산표 복사하기</button>
    ${isHost ? '<p class="muted tiny">방장: 다시 시작하면 정산표는 사라지고 새 게임이 시작돼요</p>' : ''}
  </section>`;
}
function settlementText(x) {
  const v = x.value;
  const lines = [`[찬덤 홀덤 정산] ${x.hands}판`];
  for (const r of x.rows) lines.push(`${r.name}: ${signed(r.net)}칩${v ? ` (${r.net >= 0 ? '+' : '−'}${settleMoney(Math.abs(r.net), v)})` : ''}`);
  if (x.transfers.length) { lines.push('— 보내기 —'); for (const t of x.transfers) lines.push(`${t.from} → ${t.to} ${fmt(t.chips)}칩${v ? ` (${settleMoney(t.chips, v)})` : ''}`); }
  return lines.join('\n');
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
    bindTourneyEst(form); // 일반·토너먼트에 맞는 칸만
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
  // 토너먼트 중(칩이 남은 사람): 관전 대신 '자리 비우기'(칩 그대로) · 나가면 기권
  const inTourney = !!(st.room.tournament && st.room.tournament.running && me && me.role === 'player' && (me.stack || 0) > 0);
  openModal('게임을 나가시겠습니까?', `
    <p class="muted small">${inHand ? '진행 중인 판은 다이(폴드) 처리돼요. ' : ''}${st.room.practice ? '연습 방은 나가면 사라져요.' : inTourney ? '<b style="color:#ff8a7a">토너먼트 중에 방을 나가면 기권이에요.</b> 칩이 사라지고 지금 순위로 기록돼요. 잠깐 자리를 뜨는 거면 ‘자리 비우기’를 눌러 주세요.' : '방을 나가도 초대 링크로 다시 들어올 수 있어요.'}</p>
    <div class="stack">
      ${canWatch ? (inTourney ? '<button class="btn btn-gold" data-act="watch">자리 비우기 <small class="muted">(칩 그대로 · 차례엔 자동 체크/다이)</small></button>' : '<button class="btn btn-outline" data-act="watch">관전으로 남기 <small class="muted">(자리만 비우고 구경)</small></button>') : ''}
      <button class="btn btn-gold" data-act="lobby">방 나가기 → ${GAME_INFO[g].name} 대기 화면</button>
      <button class="btn btn-ghost" data-act="home">메인으로</button>
      <button class="btn btn-ghost" data-act="stay">계속 있을게요</button>
    </div>`, (body) => {
    body.querySelector('[data-act="stay"]').onclick = closeModal;
    const w = body.querySelector('[data-act="watch"]');
    if (w) w.onclick = async () => { const r = await emit('lobby:role', { spectator: true }); if (r.ok) { closeModal(); toast(r.sittingOut ? '자리 비움 · 돌아오면 ‘자리로 돌아가기’를 눌러 주세요' : r.later ? '이번 판은 다이, 다음 판부터 관전해요' : '관전으로 바꿨어요. 언제든 다시 앉을 수 있어요', 'ok'); } };
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
      <label class="switch"><input type="checkbox" id="snd-friend" ${p.friendLoud ? 'checked' : ''}><span>친구 방에서도 음성·큰 연출 소리 <small class="muted">(기본 꺼짐 · 배경음악은 작게 나와요)</small></span></label>
      <label class="field"><span>배경음악 볼륨 <b id="mvol-val">${Math.round(p.musicVolume * 100)}%</b></span>
        <input type="range" id="snd-mvol" min="0" max="100" value="${Math.round(p.musicVolume * 100)}"></label>
      <button class="btn btn-outline" id="snd-test">소리 들어보기</button>
      <p class="muted small">휴대폰 무음 모드에서는 소리가 나지 않을 수 있어요.</p>
    </div>`, (body) => {
    body.querySelector('#snd-mute').onchange = (e) => { sound.setMuted(e.target.checked); updateSoundIcon(); };
    body.querySelector('#snd-voice').onchange = (e) => sound.setVoice(e.target.checked);
    body.querySelector('#snd-vol').oninput = (e) => { sound.setVolume(e.target.value / 100); body.querySelector('#vol-val').textContent = e.target.value + '%'; };
    body.querySelector('#snd-music').onchange = (e) => { sound.unlock(); sound.setMusic(e.target.checked); };
    body.querySelector('#snd-friend').onchange = (e) => { sound.unlock(); sound.setFriendLoud(e.target.checked); };
    body.querySelector('#snd-mvol').oninput = (e) => { sound.setMusicVolume(e.target.value / 100); body.querySelector('#mvol-val').textContent = e.target.value + '%'; };
    body.querySelector('#snd-test').onclick = () => { sound.unlock(); sound.play('chips'); setTimeout(() => sound.play('v_call'), 200); };
  });
}
function updateSoundIcon() {
  const b = document.getElementById('sound-btn');
  if (b && b.classList.contains('tb-ico')) b.innerHTML = sound.getPrefs().muted ? TI.mute : TI.sound;
  else if (b) b.textContent = sound.getPrefs().muted ? '음소거' : '소리';
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
  7: [[14, 87], [10, 64], [10, 24], [50, 7], [90, 24], [90, 64], [87, 85]],
  8: [[14, 87], [10, 64], [10, 25], [30, 7], [70, 7], [90, 25], [90, 64], [87, 85]],
  9: [[14, 87], [10, 64], [10, 25], [25, 7], [50, 5], [75, 7], [90, 25], [90, 64], [87, 85]],
};
// 키 작은 폰(테이블 높이 470px 미만): 옆자리를 가운데 줄보다 더 위·아래로
const LAYOUTS_COMPACT = {
  1: [[50, 7]],
  2: [[20, 10], [80, 10]],
  3: [[10, 21], [50, 6], [90, 21]],
  4: [[10, 22], [31, 6], [69, 6], [90, 22]],
  5: [[10, 72], [10, 21], [50, 6], [90, 21], [90, 72]],
  6: [[10, 72], [10, 21], [31, 6], [69, 6], [90, 21], [90, 72]],
  7: [[13, 90], [9, 66], [9, 22], [50, 6], [91, 22], [91, 66], [88, 88]],
  8: [[13, 90], [9, 66], [9, 23], [30, 6], [70, 6], [91, 23], [91, 66], [88, 88]],
  9: [[13, 90], [9, 66], [9, 23], [25, 6], [50, 4], [75, 6], [91, 23], [91, 66], [88, 88]],
};
function seatPositions(n, compact = false) {
  const others = (compact ? LAYOUTS_COMPACT : LAYOUTS)[Math.max(1, Math.min(9, n - 1))];
  return [{ x: S.state && gameOf(S.state) === 'holdem' ? 40 : 50, y: 90 }, ...others.map(([x, y]) => ({ x, y }))];
}

// 가로 화면인가 (폰을 눕히거나 넓은 컴퓨터 화면)
function isLand() { return innerWidth > innerHeight * 1.15; }
function orientOf() { return S.state && gameOf(S.state) !== 'omok' && isLand() ? 'land' : 'port'; }
function mountGame() {
  $app.innerHTML = `
  <div class="game" data-orient="${orientOf()}">
    <header class="g-top" id="g-top"></header>
    <div class="g-banner" id="g-banner"></div>
    <div class="g-main">
      <div class="table-wrap"><div class="table" id="g-table"></div>
        <div class="emote-tray" id="emote-tray" hidden>${EMOTES.map(([k, e, t]) => `<button data-emote="${k}" class="emote-${k}" aria-label="${t}">${emoteImg(k)}<small>${t}</small></button>`).join('')}</div>
      </div>
      <div class="g-side">
        <section class="g-me" id="g-me"></section>
        <section class="g-actions" id="g-actions"></section>
      </div>
    </div>
    <div id="fx-layer" aria-hidden="true"></div>
  </div>`;
  S.gameMounted = true;
  S.actionSig = '';
  prefetchFx();
  const tray = document.getElementById('emote-tray');
  document.getElementById('g-me').addEventListener('click', (e) => {
    if (e.target.closest('#emote-btn')) { e.stopPropagation(); tray.hidden = !tray.hidden; }
  });
  tray.querySelectorAll('[data-emote]').forEach((b) => {
    b.onclick = () => { tray.hidden = true; emit('game:emote', { kind: b.dataset.emote }); };
  });
}

// 화면을 돌리면(가로↔세로) 테이블 모양을 다시 맞춘다
let orientT = 0;
window.addEventListener('resize', () => {
  clearTimeout(orientT);
  orientT = setTimeout(() => {
    const g = document.querySelector('.game');
    if (!g || S.view !== 'room' || !S.state || S.state.room.phase === 'lobby') return;
    const o = orientOf();
    if (g.dataset.orient !== o) { g.dataset.orient = o; S.actionSig = ''; renderGame(); }
    else if (gameOf(S.state) !== 'omok') renderTable(S.state);
  }, 160);
});
// 가로/세로 바꾸기: 설치한 앱은 방향만 바로 잠근다 (전체 화면 없이)
// 브라우저에선 방향 잠금이 전체 화면을 요구하는데, 그러면 크롬이 '전체 화면을 종료하려면…' 알림을 매번 띄운다(사이트가 못 끔) → 브라우저에선 전체 화면을 쓰지 않고 폰을 돌리라고 안내
async function toggleOrient() {
  const wantLand = !isLand();
  try {
    if (!isStandalone()) throw new Error('browser');
    await screen.orientation.lock(wantLand ? 'landscape' : 'portrait');
    S.fsOn = true;
    return;
  } catch {}
  toast(wantLand ? '폰을 가로로 눕혀 주세요 (자동 회전을 켜 두면 테이블이 가로로 바뀌어요 · 앱으로 설치하면 이 버튼으로 바로 돌아가요)' : '폰을 세로로 세워 주세요', 'info');
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

// 게임 화면 아이콘 (선 아이콘, 글자색 따라감)
const TI = {
  menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  cards: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="10" height="14" rx="2"/><path d="M10 4.5l7.6 2.2a2 2 0 0 1 1.4 2.5l-3 10.3"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7h12M8 12h12M8 17h12"/><circle cx="4" cy="7" r=".8"/><circle cx="4" cy="12" r=".8"/><circle cx="4" cy="17" r=".8"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2"/><path d="M3 14a9 9 0 0 0 5 6.5M21 10a9 9 0 0 0-5-6.5"/><path d="M3 18v-4h4M21 6v4h-4"/></svg>',
  chat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 10h8"/></svg>',
};
function renderTop(st) {
  const el = document.getElementById('g-top');
  const pendingCount = st.pending ? st.pending.length : 0;
  const holdem = gameOf(st) === 'holdem';
  el.classList.toggle('top2', holdem);
  if (holdem) {
    const tn = st.room.tournament;
    const mid = tn && tn.running ? `<b>레벨 ${tn.level} · ${fmt(tn.sb)}/${fmt(tn.bb)}${st.room.settings.ante === 'bb' ? ' · 앤티' : ''}</b><small>${tn.paused ? '⏸ 멈춤' : `다음 <i data-level-at="${tn.nextAt}">-</i>`}</small>`
      : `<b>${st.room.practiceTable ? esc(st.room.practiceTable) + ' · ' : ''}${fmt(st.room.settings.sb)}/${fmt(st.room.settings.bb)}${st.room.settings.ante === 'bb' ? ' · 앤티' : ''}</b><small>${st.room.endsAt ? `⏰ 정산까지 <i data-level-at="${st.room.endsAt}">-</i>` : `${st.room.practiceTable ? '연습 테이블' : `방 ${esc(st.room.code)}`}${st.room.handNo ? ` · ${st.room.handNo}번째 판` : ''}`}</small>`;
    // 관전 중인 사람: 위 줄에 '관전 N명' (누르면 이름 목록)
    const specs = st.players.filter((p) => p.role === 'spectator' && !p.leaving && !p.isBot);
    el.innerHTML = `
      <button class="tb-ico" id="menu-btn" aria-label="메뉴">${TI.menu}${pendingCount ? `<span class="dot">${pendingCount}</span>` : ''}</button>
      <div class="tb-mid">${mid}${specs.length ? `<button type="button" class="tb-spec" id="tb-spec">관전 ${specs.length}명 · ${esc(specs.slice(0, 2).map((p) => p.name).join(', '))}${specs.length > 2 ? ' 외' : ''}</button>` : ''}</div>
      <button class="tb-ico" id="log-btn" aria-label="기록 · 칩 장부">${TI.list}</button>
      <button class="tb-ico" id="orient-btn" aria-label="가로 세로 바꾸기">${TI.rotate}</button>
      <button class="tb-ico" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? TI.mute : TI.sound}</button>`;
    bindCommon();
    el.querySelector('#log-btn').onclick = () => openHistory();
    const sp = el.querySelector('#tb-spec');
    if (sp) sp.onclick = () => openModal(`관전 중 ${specs.length}명`, `<div class="spec-list">${specs.map((p) => `<div class="list-row">${avatarHTML(p, 'avatar-sm')}<div class="grow"><b>${esc(p.name)}</b>${p.connected ? '' : ' <small class="muted">연결 끊김</small>'}</div></div>`).join('')}</div>`);
    el.querySelector('#orient-btn').onclick = toggleOrient;
    el.querySelector('#menu-btn').onclick = openMenuModal;
    tickLevel();
    return;
  }
  el.innerHTML = `
    ${logoHTML(true)}
    <div class="g-info"><span class="mono">${esc(st.room.code)}</span><span>${st.room.handNo ? `${st.room.handNo}번째 판` : ''}</span></div>
    <div class="spacer"></div>
    <button class="icon-btn share-icon" id="share-top" aria-label="초대 링크 공유">${P.hubIcon('link')}</button>
    <button class="btn btn-sm btn-ghost" id="chart-btn">족보표</button>
    <button class="icon-btn txt-btn" id="log-btn" aria-label="베팅 내역">기록</button>
    <button class="icon-btn txt-btn snd-btn" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? '음소거' : '소리'}</button>
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
      msgs.push(['gold', `칩이 ${me.stack === 0 ? '모두 떨어졌어요' : '부족해요'} · 리바인 ${s.rebuyFlex && s.mode !== 'tournament' ? `${fmt(s.rebuyLo)}~${fmt(s.rebuyHi)} 중 선택` : '+' + fmt(s.rebuyAmount)} (남은 횟수 ${s.rebuyMax - me.rebuys}번)`, '<button class="btn btn-sm btn-gold" id="rebuy-btn">리바인</button>']);
    } else if (me.stack === 0 && !(st.hand && !st.hand.result && st.players.find((p) => p.id === me.id)?.status === 'allin')) {
      msgs.push(['info', '칩이 모두 떨어졌어요. 이제 관전하며 응원해 주세요']);
    }
    if (me.sittingOut) msgs.push(['away', '자리 비움 중 · 내 차례엔 자동으로 체크/다이해요 (화면을 누르면 돌아와요)', '<button class="btn btn-sm btn-gold" id="sitin-btn">자리로 돌아가기</button>']);
    const myRow = st.players.find((p) => p.id === me.id);
    if (st.room.phase === 'playing' && myRow && myRow.status === 'waiting' && !me.sittingOut) msgs.push(['info', '다음 판부터 참여해요 · 이번 판은 구경 중']);
  }
  if (st.room.waiting) msgs.push(['info', '카드를 받을 수 있는 참가자가 2명 이상이 되면 다음 판이 시작돼요']);
  const holdemPlaying = gameOf(st) === 'holdem' && st.room.phase === 'playing';
  const nudge = holdemPlaying ? '' : guestNudgeHTML(st, true);
  const tn = st.room.tournament;
  if (tn && tn.mtt && tn.mtt.closed) msgs.push(['gold', '🏆 파이널 테이블로 합쳐졌어요. 이 테이블은 끝났어요', '<button class="btn btn-sm btn-gold" id="to-final">파이널 테이블 구경</button>']);
  if (tn && tn.running) {
    const canPause = me && (tn.mtt ? tn.mtt.director === me.id : me.isHost);
    const pauseBtn = canPause ? `<button class="btn btn-sm ${tn.paused ? 'btn-gold' : 'btn-outline'}" id="pause-btn">${tn.paused ? '▶ 다시 시작' : '⏸ 멈춤'}</button>` : '';
    if (gameOf(st) === 'holdem') msgs.push(['tourney tn-slim', `${tn.mtt && tn.mtt.tables > 1 ? `테이블 ${tn.mtt.tableNo}/${tn.mtt.tables} · ` : ''}남은 ${tn.mtt ? tn.mtt.alive : tn.alive}/${tn.mtt ? tn.mtt.entrants : tn.entrants}명 · 다음 ${fmt(tn.nextSb)}/${fmt(tn.nextBb)}`, pauseBtn]);
    else msgs.push(['tourney', `레벨 ${tn.level} · ${fmt(tn.sb)}/${fmt(tn.bb)} · ${tn.mtt && tn.mtt.tables > 1 ? `테이블 ${tn.mtt.tableNo}/${tn.mtt.tables} · 전체 남은 ${tn.mtt.alive}/${tn.mtt.entrants}명` : tn.mtt ? `파이널 · 남은 ${tn.mtt.alive}/${tn.mtt.entrants}명` : `남은 ${tn.alive}/${tn.entrants}명`}`, `<span class="lvl-next">다음 ${fmt(tn.nextSb)}/${fmt(tn.nextBb)} · ${tn.paused ? '<b>멈춤</b>' : `<b data-level-at="${tn.nextAt}">-</b>`}</span>${pauseBtn}`]);
    if (tn.paused) msgs.push(['gold', me && me.isHost ? '⏸ 잠깐 멈춤 중 · 블라인드 시계도 멈춰 있어요' : '⏸ 방장이 잠깐 멈췄어요 · 곧 다시 시작해요']);
  }
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
  if (rb) rb.onclick = () => (st.room.settings.rebuyFlex && st.room.settings.mode !== 'tournament' && !st.room.practice ? openRebuyPick(st) : doRebuy());
  const tf = el.querySelector('#to-final');
  if (tf && tn && tn.mtt) tf.onclick = () => goFinalTable(tn.mtt.mainCode);
  const pb = el.querySelector('#pause-btn');
  if (pb) pb.onclick = () => emit('host:pause', { on: !(st.room.tournament && st.room.tournament.paused) });
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
    meEl.innerHTML = '<button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button><button class="chat-fab" id="chat-btn" aria-label="채팅">채팅<span class="dot" hidden></span></button>';
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
    <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button><button class="chat-fab" id="chat-btn" aria-label="채팅">채팅<span class="dot" hidden></span></button>`;
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

// 다시 그리기 전 베팅 칩 위치를 기억해 둔다 (라운드가 끝나면 그 자리에서 팟으로 모이게)
function snapBets() {
  const out = {};
  document.querySelectorAll('#g-table .bet[data-id]').forEach((b) => { out[b.dataset.id] = { at: centerOf(b), amt: Number(b.dataset.amt) || 0 }; });
  return out;
}
function flyChip(from, to, { delay = 0, dur = 420, cls = '' } = {}) {
  if (gws.reduceMotion()) return;
  const c = document.createElement('div');
  c.className = 'fx-chip fx-chip-sm ' + cls;
  c.style.left = from.x + 'px'; c.style.top = from.y + 'px';
  fxLayer().appendChild(c);
  c.animate([{ transform: 'translate(0,0) scale(.9)', opacity: 1 }, { transform: `translate(${to.x - from.x}px,${to.y - from.y}px) scale(.7)`, opacity: 0.95 }],
    { duration: dur, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).onfinish = () => c.remove();
}
function tableMotion(st, before) {
  if (gws.reduceMotion()) return;
  const h = st.hand;
  if (!h || h.game === 'seotda') return;
  const table = document.getElementById('g-table');
  const center = document.querySelector('#g-table .board') || table;
  const c0 = centerOf(center);
  // 카드 돌리기: 새로 받은 카드는 테이블 가운데에서 자기 자리로 (돌리는 순서대로 조금씩 늦게)
  const seatEls = [...table.querySelectorAll('.seat[data-id]')]; // 화면 순서 = 시계방향
  const dIdx = Math.max(0, seatEls.findIndex((s) => s.querySelector('.dealer-btn')));
  const N = seatEls.length || 1;
  const fresh = [...table.querySelectorAll('.seat-cards .card-deal, .seat-mycards .card-deal')].map((card) => {
    const si = seatEls.indexOf(card.closest('.seat'));
    const k = [...card.parentElement.querySelectorAll('.card')].indexOf(card);
    return { card, key: k * N + ((si - dIdx - 1 + N) % N) };
  }).sort((a, b) => a.key - b.key).map((x) => x.card);
  fresh.forEach((card, i) => {
    const r = card.getBoundingClientRect();
    const dx = c0.x - (r.left + r.width / 2); const dy = c0.y - (r.top + r.height / 2);
    card.style.animation = 'none';
    card.animate([{ transform: `translate(${dx}px,${dy}px) rotate(-30deg) scale(.5)`, opacity: 0 }, { opacity: 1, offset: 0.2 }, { transform: getComputedStyle(card).transform === 'none' ? 'none' : getComputedStyle(card).transform, opacity: 1 }],
      { duration: 420, delay: 60 + (i % 20) * 75, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'both' });
  });
  // 딜러 버튼: 판이 바뀌면 이전 자리에서 다음 자리로 미끄러진다
  const btn = table.querySelector('.dealer-btn');
  if (btn) {
    const at = centerOf(btn);
    if (S.btnAt && S.btnHand !== h.no && (Math.abs(S.btnAt.x - at.x) + Math.abs(S.btnAt.y - at.y)) > 8) {
      btn.animate([{ transform: `translate(${S.btnAt.x - at.x}px,${S.btnAt.y - at.y}px)` }, { transform: 'translate(0,0)' }], { duration: 600, easing: 'cubic-bezier(.3,.7,.3,1)' });
      sound.play('button');
    }
    S.btnAt = at; S.btnHand = h.no;
  }
  // 베팅: 금액이 늘어난 사람은 자기 자리에서 칩이 날아간다
  const now = {};
  table.querySelectorAll('.bet[data-id]').forEach((b) => { now[b.dataset.id] = { at: centerOf(b), amt: Number(b.dataset.amt) || 0 }; });
  for (const [id, v] of Object.entries(now)) {
    const prev = before[id];
    if (prev && prev.amt >= v.amt) continue;
    const seat = table.querySelector(`.seat[data-id="${id}"] .seat-av`);
    if (seat) {
      const s0 = centerOf(seat);
      const bb = (st.room.tournament && st.room.tournament.running ? st.room.tournament.bb : st.room.settings.bb) || 1;
      const n = Math.max(1, Math.min(6, 1 + Math.round(Math.log2(Math.max(1, (v.amt - (prev ? prev.amt : 0)) / bb)))));
      for (let c = 0; c < n; c++) flyChip(s0, { x: v.at.x + (Math.random() - 0.5) * 8, y: v.at.y - c * 2 }, { delay: c * 55 });
    }
  }
  // 라운드가 끝남(베팅 칩이 사라짐): 그 자리에서 팟으로 모은다
  const pot = table.querySelector('.pot');
  const gone = Object.entries(before).filter(([id]) => !now[id]);
  if (pot && gone.length && !h.finished) {
    const p0 = centerOf(pot);
    gone.forEach(([, v], i) => { flyChip(v.at, p0, { delay: i * 40, dur: 380 }); flyChip(v.at, p0, { delay: i * 40 + 60, dur: 380 }); });
    sound.play('chips');
  }
}
// 아래 버튼 영역 높이 고정: 내 차례(버튼 3줄)·남의 차례·판 끝남마다 높이가 달라 테이블·바닥 카드가
// 줄었다 늘었다 하던 것 → 지금까지 가장 컸던 높이를 최소 높이로 붙잡아 둔다 (화면 크기·방향이 바뀌면 새로 잼)
function holdActionsHeight(st) {
  const a = document.getElementById('g-actions');
  if (!a || gameOf(st) !== 'holdem') return;
  const key = `${innerWidth}x${innerHeight}:${orientOf()}`;
  if (S.actH && S.actH.key !== key) { S.actH = null; a.style.minHeight = ''; }
  if (!a._ro) {
    a._ro = new ResizeObserver(() => {
      const k = `${innerWidth}x${innerHeight}:${orientOf()}`;
      const hh = a.offsetHeight;
      if (!S.actH || S.actH.key !== k) S.actH = { key: k, h: 0 };
      if (hh > S.actH.h) { S.actH.h = hh; a.style.minHeight = hh + 'px'; }
    });
    a._ro.observe(a);
  }
}
function renderTable(st) {
  holdActionsHeight(st);
  const el = document.getElementById('g-table');
  const betsBefore = snapBets();
  try { renderTableInner(st, el); } finally { requestAnimationFrame(() => tableMotion(st, betsBefore)); }
}
// 가로 화면: 넓은 타원 둘레에 고르게 (0번 = 아래 가운데, 시계방향)
function landPositions(n, rx = 43, ry = 38, cy = 48) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = Math.PI / 2 + (i * 2 * Math.PI) / n; out.push({ x: 50 + rx * Math.cos(a), y: cy + ry * Math.sin(a) }); }
  return out;
}
// 테이블 자리 칸: 방의 자리 수만큼 (빈자리 포함). 내가 앉아 있으면 내 자리가 아래 가운데
function tableSlots(st, compact, land) {
  const seated = st.players.filter((p) => (p.role === 'player' || p.leaving) && p.seat !== null && p.seat !== undefined);
  const N = Math.max(2, Math.min(10, st.room.tableSeats || st.room.settings.maxPlayers || 9));
  const posOf = (n) => (land ? landPositions(n) : seatPositions(n, compact));
  if (seated.some((p) => p.seat >= N)) { // 예외(자리 번호가 테이블보다 큼): 예전처럼 앉은 순서대로
    const seats = orderedSeats(st);
    const pos = posOf(Math.max(seats.length, 2));
    return seats.map((p, i) => ({ p, ...pos[i], seat: p.seat }));
  }
  const mine = st.me && seated.find((p) => p.id === st.me.id);
  const base = mine ? mine.seat : 0;
  if (!canSitNow(st)) { // 앉을 수 없는 사람(이미 앉은 사람 포함)에겐 빈자리를 안 보여 주고, 앉은 사람끼리 테이블에 고르게
    const ring = seated.slice().sort((a, b) => ((a.seat - base + N) % N) - ((b.seat - base + N) % N));
    const pos2 = posOf(Math.max(ring.length, 2));
    return ring.map((p, i) => ({ p, ...pos2[i], seat: p.seat }));
  }
  const pos = posOf(N);
  const slots = [];
  for (let r = 0; r < N; r++) { const seat = (base + r) % N; slots.push({ p: seated.find((p) => p.seat === seat) || null, ...pos[r], seat }); }
  return slots;
}
function canSitNow(st) {
  const me = st.me; const tn = st.room.tournament; const s = st.room.settings;
  if (!me || me.role === 'player' || me.masterPeek || (tn && tn.mtt && tn.mtt.closed)) return false;
  return !tn || !tn.running || (s.reentryLevels > 0 && tn.level <= s.reentryLevels);
}
function emptySeatHTML(st, sl, canSit) {
  return `<button type="button" class="seat seat-empty ${canSit ? 'can-sit' : ''}" data-sit="${sl.seat}" style="left:${sl.x}%;top:${sl.y}%" aria-label="${sl.seat + 1}번 빈자리"><i class="se-plus">+</i><b>${canSit ? '앉기' : '빈자리'}</b><small>${sl.seat + 1}번</small></button>`;
}
// 빈자리 누르기: 관전 중이면 그 자리에 앉고, 대기실에서는 자리를 옮긴다
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-sit]');
  if (!b || S.view !== 'room' || !S.state) return;
  const st = S.state;
  const lobby = st.room.phase === 'lobby';
  if (!lobby && !canSitNow(st)) { toast(st.me && st.me.role === 'player' ? `${Number(b.dataset.sit) + 1}번 빈자리예요 · 자리는 대기실에서 옮길 수 있어요` : '지금은 앉을 수 없어요 (늦은 참가 시간이 끝났어요)', 'info'); return; }
  const r = await emit('lobby:seat', { seat: Number(b.dataset.sit) });
  if (r.ok && r.requested) toast('방장에게 자리 요청을 보냈어요. 수락되면 다음 판부터 참가해요', 'ok');
  else if (r.ok && !lobby) toast(`${Number(b.dataset.sit) + 1}번 자리에 앉았어요 · 다음 판부터 참가해요`, 'ok');
  if (r.ok) sound.play('chips');
});
function myHandName(cards, h) {
  if (!cards || !h || h.game === 'seotda' || cards[0] === '??') return '';
  const all = cards.concat(h.board || []);
  if (all.length >= 5) return bestHand(all).name;
  return cards[0][0] === cards[1][0] ? '포켓 페어' : '';
}
function renderTableInner(st, el) {
  const h = st.hand;
  const compact = el.clientHeight > 0 && el.clientHeight < 470;
  const land = orientOf() === 'land';
  const slots = tableSlots(st, compact, land);
  const canSit = canSitNow(st);
  const handNo = h ? h.no : 0;
  const result = h && h.result;
  const winners = new Set(result ? result.winners : []);

  const seatHTML = slots.map((sl) => {
    if (!sl.p) return emptySeatHTML(st, sl, canSit);
    const p = sl.p;
    const { x, y } = sl;
    const isMe = st.me && p.id === st.me.id;
    const cls = ['seat'];
    if (isMe) cls.push('seat-me');
    if (p.isTurn) cls.push('seat-turn');
    if (p.status === 'folded') cls.push('seat-folded');
    if (p.status === 'allin') cls.push('seat-allin');
    if (winners.has(p.id)) cls.push('seat-winner');
    if (!p.connected) cls.push('seat-offline');
    if (y < 30) cls.push('seat-top');
    if (x > 60) cls.push('seat-right'); // 오른쪽 자리는 카드를 안쪽(왼쪽)에
    let cards = '';
    if (isMe && h && h.game !== 'seotda' && p.cards && p.cards[0] !== '??') {
      const mine = result && result.hands && result.hands[p.id];
      const best = mine ? new Set(mine.best) : null;
      const hn = p.status === 'folded' || result ? '' : myHandName(p.cards, h);
      const meS = S.state && S.state.me; const pubAll = result && meS && !meS.canShow && S.shownHand === handNo; const pubSet = new Set(result && meS ? meS.shownOne || [] : []); // 판이 끝난 뒤 내가 공개한 장
      const nPub = pubAll ? p.cards.length : pubSet.size;
      cards = `<div class="seat-mycards ${p.status === 'folded' ? 'folded' : ''} ${nPub ? 'has-pub' : ''}">${p.cards.map((c, k) => cardHTML(c, { size: 'lg', anim: markCard(`${handNo}:me:${k}`), delay: k * 120, highlight: best && best.has(c), cls: pubAll || pubSet.has(k) ? 'card-pub' : '' })).join('')}${nPub ? `<i class="pub-tag">${EYE_SVG}${nPub < p.cards.length ? '1장 ' : ''}공개됨</i>` : ''}${hn ? `<span class="my-hand-lbl">${esc(hn)}</span>` : ''}</div>`;
    } else if (p.cards && !isMe) {
      const reveal = result && result.hands && result.hands[p.id];
      const best = reveal ? new Set(reveal.best) : null;
      cards = `<div class="seat-cards">${p.cards.map((c, k) => {
        const fresh = markCard(`${handNo}:${p.id}:${k}:${c === '??' ? 'b' : 'f'}`);
        const flip = fresh && c !== '??'; // 쇼다운에서 패를 까는 순간
        if (flip && result && !h.reveal) (S.showFx = S.showFx || new Set()).add(p.id); // 판이 끝난 뒤 '내 패 보여주기'
        return cardHTML(c, { size: 'xs', anim: fresh && !flip, cls: flip ? (result && !h.reveal ? 'card-flip card-pop' : 'card-flip') : '', highlight: best && best.has(c), delay: k * 90 });
      }).join('')}</div>`;
    }
    const tags = [];
    if (p.isTurn) tags.push(`<span class="tag tag-turn" data-deadline>차례</span>`);
    else if (STATUS_TEXT[p.status] && p.status !== 'waiting') tags.push(`<span class="tag tag-${p.status}">${STATUS_TEXT[p.status]}</span>`);
    else if (p.lastAction && h && !h.finished && !(p.bet > 0)) tags.push(`<span class="tag tag-act">${ACTION_TEXT[p.lastAction] || ''}</span>`); // 베팅이 있으면 칩에 '레이즈 1,000' 으로
    if (st.room.phase === 'playing' && p.status === 'waiting' && !p.sittingOut) tags.push('<span class="tag">다음 판 대기</span>');
    if (!p.connected) tags.push('<span class="tag tag-off">연결 끊김</span>');
    else if (p.sittingOut && st.room.phase === 'playing' && !tags.some((t) => t.includes('자리 비움'))) tags.push('<span class="tag tag-away">자리 비움</span>');
    const ht = S.seatHands && S.seatHands[handNo + ':' + p.id];
    if (ht) tags.unshift(`<span class="tag tag-hand ${ht.big ? 'tag-hand-big' : ''}">${esc(ht.text)}</span>`);
    if (result && result.deltas && result.deltas[p.id] !== undefined) {
      const d = result.deltas[p.id];
      tags.push(`<span class="tag ${d > 0 ? 'tag-plus' : d < 0 ? 'tag-minus' : ''}">${signed(d)}</span>`);
    }
    const pos2 = [];
    if (p.isDealer && h && h.game === 'seotda') pos2.push('<span class="dealer-btn" title="딜러">D</span>');
    if (h && h.game !== 'seotda' && !h.finished && (p.isSB || p.isBB)) pos2.push(`<span class="blind-tag ${p.isBB ? 'is-bb' : ''}" title="${p.isBB ? '빅 블라인드' : '스몰 블라인드'}">${p.isBB ? 'BB' : 'SB'}</span>`); // 작게 · 판 끝나면 숨김
    const bet = p.bet > 0 ? (() => {
      const k = y < 30 ? 0.52 : x < 20 || x > 80 ? 0.5 : 0.4; const bx = x + (50 - x) * k; let by = isMe && h && h.game !== 'seotda' ? 63 : y + (47 - y) * k;
      let bx2 = bx;
      if ((isMe || (y > 80 && x > 30 && x < 70)) && h && h.game !== 'seotda') { bx2 = x - 3; by = y - (orientOf() === 'land' ? 26 : 17); } // 아래 가운데 자리: 얼굴 바로 위 // 내 베팅: 내 얼굴 바로 위 (가운데 안내 줄과 안 겹치게)
      if (y < 30 && h && h.game !== 'seotda') { bx2 = x + (x < 45 ? 10 : x > 55 ? -10 : 13); by = y + 13; } // 윗자리: 바닥 카드에 안 겹치게 자기 옆 아래로
      if (!isMe && y > 80 && h && h.game !== 'seotda') { bx2 = x + (50 - x) * 0.15; by = y - 15; } // 아래 양옆 자리: 내 카드에 안 가리게 자기 머리 위로
      return `<div class="bet" data-id="${p.id}" data-amt="${p.bet}" style="left:${bx2}%;top:${by}%" title="${esc(p.name)} 이번 라운드 베팅"><span class="chip-icon sm"></span><small>${(p.lastAction && p.lastAction !== 'check' && p.lastAction !== 'fold' && ACTION_TEXT[p.lastAction]) || (p.isBB ? 'BB' : p.isSB ? 'SB' : '베팅')}</small><b>${fmt(p.bet)}</b></div>`;
    })() : '';
    return `
      <div class="${cls.join(' ')}" data-id="${p.id}" style="left:${x}%;top:${y}%">
        ${cards}
        ${p.isDealer && h && h.game !== 'seotda' ? '<div class="dealer-chip" title="딜러 버튼 (이번 판의 선)"><b>D</b></div>' : ''}
        <div class="seat-body">
          <div class="seat-av">${avatarHTML(p)}<div class="seat-pos">${pos2.join('')}</div>
            ${p.isTurn ? '<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" data-ring></circle></svg>' : ''}</div>
          <div class="seat-name">${P.masterBadge(p.master, true)}${esc(p.name)}</div>
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
        // 1:1 승부의 리버는 베팅 중이어도 '쪼듯이' 천천히 (두 사람만 남은 판)
        const heads = st.players.filter((p) => ['inhand', 'allin'].includes(p.status)).length === 2;
        const slow = fresh && ((S.runoutHand === handNo && i >= S.runoutFrom) || (i === 4 && heads));
        if (fresh && i === 4) S.riverFx = { hand: handNo, slow };
        if (fresh && i === 4 && heads && S.runoutHand !== handNo) { sound.play('heartbeat'); const a = document.getElementById('app'); a.classList.add('tension'); setTimeout(() => { a.classList.remove('tension'); sound.play('impact'); }, 1400); }
        board.push(cardHTML(c, {
          size: compact ? 'sm' : 'md', anim: fresh && !slow, delay: (i < 3 && !slow ? i : 0) * 120,
          cls: slow ? (i === 4 ? 'card-squeeze' : 'card-flip-slow') : '',
          highlight: winBest && winBest.has(c), dim: winBest && !winBest.has(c),
        }));
      } else if (rv && rv.squeeze && i === h.board.length) {
        board.push(cardHTML('??', { size: compact ? 'sm' : 'md', cls: 'card-squeeze-wait' }));
      } else if (h.result && h.result.rabbit && h.result.rabbit[i - h.board.length]) {
        // 토끼 사냥: 계속했다면 나왔을 카드 (흐리게)
        board.push(cardHTML(h.result.rabbit[i - h.board.length], { size: compact ? 'sm' : 'md', anim: markCard(`${handNo}:rabbit:${i}`), delay: (i - h.board.length) * 160, cls: 'card-rabbit' }));
      } else board.push(cardHTML(null, { size: compact ? 'sm' : 'md' }));
    }
    const potText = `<small>팟</small>${fmt(h.totalPot)}`;
    const sidePots = h.pots && h.pots.length > 1
      ? `<div class="side-pots">${h.pots.map((pt, i) => `<span>${i === 0 ? '메인' : `사이드${i}`} ${fmt(pt.amount)}</span>`).join('')}</div>` : '';
    center = `
      <div class="table-center">
        <div class="stage-lbl ${h.stage === 'allin' ? 'stage-allin' : ''}" ${h.game === 'seotda' ? '' : 'hidden'}>${(h.game === 'seotda' ? '' : { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', allin: '올인 승부' }[h.stage] || '')}</div>
        ${h.game === 'seotda' ? `<div class="sd-center">${st.room.settings.cards === 3 ? '세 장' : '두 장'} 섯다${h.stage === 'open' ? ' · 한 장 공개' : h.stage === 'pick' ? ' · 두 장 고르기' : h.stage === 'betting' ? (st.room.settings.cards === 3 ? ' · 1차 베팅' : ' · 베팅') : h.stage === 'betting2' ? ' · 2차 베팅' : ''}</div>` : `<div class="board">${board.join('')}</div>`}
        <div class="pot"><span class="chip-icon pot-chip"></span><b>${potText}</b></div>
        ${sidePots}
        ${h.game === 'seotda' || result ? '' : feltInfoHTML(st)}
        ${result ? resultHTML(st, result) : ''}
      </div>`;
  } else {
    const s0 = st.room.settings;
    center = `<div class="table-center"><div class="table-blinds">${gameOf(st) === 'seotda' ? '섯다' : 'NL 홀덤'} · ${fmt(s0.sb)}/${fmt(s0.bb)}</div><p class="muted small">${st.room.waiting ? (canSit ? '빈자리를 눌러 앉아 주세요' : '참가자를 기다리는 중') : '곧 시작해요'}</p></div>`;
  }
  el.innerHTML = `<div class="felt"><div class="felt-rail"></div>${center}${seatHTML}</div>`;
  requestAnimationFrame(() => clampSeats(el));
  if (S.showFx && S.showFx.size) { const ids = [...S.showFx]; S.showFx.clear(); setTimeout(() => ids.forEach((id, i) => { seatBubble(id, '패 공개!'); sound.play('flip1'); const pl = st.players.find((x) => x.id === id); if (pl && pl.cards) setTimeout(() => showcaseCards(id, pl.cards.filter((c) => c !== '??'), `${pl.name}의 패`), i * 300); }), 120); }
  if (S.riverFx && S.riverFx.hand === handNo && !S.riverFx.done) { S.riverFx.done = true; setTimeout(riverGlint, S.riverFx.slow ? 1500 : 380); }
  requestAnimationFrame(() => { unstackBets(el); fitBoard(el); });
  clearTimeout(S.fitT); S.fitT = setTimeout(() => fitBoard(el), 450); // 자리·이름표가 자리 잡은 뒤 한 번 더
  RK.fitNames(el);
  RK.refreshRoom(st);
}

// 베팅 칩이 자기 자리(이름·칩 수) 위에 겹치면 테이블 가운데 쪽으로 비켜 놓는다
function unstackBets(el) {
  el.querySelectorAll('.bet[data-id]').forEach((b) => {
    const body = el.querySelector(`.seat[data-id="${b.dataset.id}"] .seat-body`);
    if (!body) return;
    b.style.marginTop = '';
    const r = b.getBoundingClientRect(); const s = body.getBoundingClientRect();
    if (r.right < s.left || r.left > s.right || r.bottom < s.top || r.top > s.bottom) return;
    const T = el.getBoundingClientRect();
    const down = (s.top + s.bottom) / 2 < T.top + T.height / 2; // 위쪽 자리면 아래로, 아래쪽 자리면 위로
    b.style.marginTop = Math.round(down ? s.bottom + 3 - r.top : s.top - 3 - r.bottom) + 'px';
  });
}

// 세로·가로 모두: 양옆 윗자리(이름·칩·카드)나 그 베팅 칩이 바닥 카드를 덮으면 → 가운데(바닥 카드·팟)를 그만큼 아래로 내린다 (내 자리는 안 덮게)
function fitBoard(el) {
  const tc = el.querySelector('.table-center');
  const bd = tc && tc.querySelector('.board');
  if (!bd) return;
  tc.style.marginTop = '';
  const B = bd.getBoundingClientRect(); const C = tc.getBoundingClientRect();
  const seats = [...el.querySelectorAll('.seat:not(.seat-empty)')];
  if (!seats.length) return;
  const mid = (B.top + B.bottom) / 2;
  let need = 0; let floor = Infinity;
  for (const s of seats) {
    const sb = s.querySelector('.seat-body'); if (!sb) continue;
    const r0 = sb.getBoundingClientRect();
    if (r0.top > mid) { const cx = (r0.left + r0.right) / 2; if (cx > B.left && cx < B.right) floor = Math.min(floor, r0.top); continue; } // 가운데 아래 자리(나): 여기까지 내려갈 수 있음 (양옆 자리는 상관없음)
    const parts = [...s.children, el.querySelector(`.bet[data-id="${s.dataset.id}"]`)].filter(Boolean);
    for (const c of parts) {
      const r = c.getBoundingClientRect();
      if (!r.width || r.right <= B.left + 2 || r.left >= B.right - 2) continue;
      if (r.bottom > B.top) need = Math.max(need, r.bottom - B.top + 6);
    }
  }
  if (!need) return;
  const room = (Number.isFinite(floor) ? floor : el.getBoundingClientRect().bottom) - 6 - C.bottom;
  const dy = Math.max(0, Math.min(need, room));
  if (dy) tc.style.marginTop = Math.round(dy) + 'px';
}

// 펠트 위 안내: 'NL 홀덤 · 블라인드 10/20 (앤티 20)' + 토너먼트면 '다음 20/40 · 4:31 후'
function feltInfoHTML(st) {
  const tn = st.room.tournament;
  const run = tn && tn.running;
  const next = run && tn.nextAt && (tn.nextBb !== tn.bb) ? `<span class="fi-next">다음 블라인드 ${fmt(tn.nextSb)}/${fmt(tn.nextBb)} · ${tn.paused ? '멈춤' : `<i data-level-at="${tn.nextAt}">-</i> 후`}</span>` : '';
  const h = st.hand;
  const stage = h ? { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', allin: '올인 승부' }[h.stage] || '' : '';
  return `<div class="felt-info">${stage ? `<em class="fi-stage">${stage}</em>` : ''}${next}</div>`;
}

// 리버(마지막 한 장)가 깔릴 때: 카드 위로 AI 영상 빛줄기가 '스윽' 지나간다
function riverGlint() {
  const cards = document.querySelectorAll('#g-table .board .card');
  const c = cards[4];
  if (!c || gws.reduceMotion()) return;
  const r = c.getBoundingClientRect();
  const el = blendVideo('/img/holdem/fx/river.mp4?v=1', 'fx-glint');
  el.style.left = (r.left + r.width / 2) + 'px'; el.style.top = (r.top + r.height / 2) + 'px';
  el.style.width = (r.width * 3) + 'px'; el.style.height = (r.height * 2.2) + 'px';
  document.body.appendChild(el);
  sound.play('fx_river');
  setTimeout(() => el.remove(), 2200);
}

// 가장자리 자리: 이름·태그·순위 배지가 화면 밖으로 잘리지 않게 안쪽으로 살짝 민다
function clampSeats(el) {
  const wrap = el.closest('.table-wrap') || el;
  const W = wrap.getBoundingClientRect();
  const lo = Math.max(W.left, 0) + 3; const hi = Math.min(W.right, innerWidth) - 3;
  el.querySelectorAll('.seat:not(.seat-empty)').forEach((s) => {
    s.style.marginLeft = ''; s.style.marginTop = '';
    let L = Infinity; let Rr = -Infinity; let T = Infinity;
    s.querySelectorAll('.seat-body, .seat-body *').forEach((c) => { const r = c.getBoundingClientRect(); if (!r.width) return; L = Math.min(L, r.left); Rr = Math.max(Rr, r.right); T = Math.min(T, r.top); });
    if (!Number.isFinite(L)) return;
    const dx = L < lo ? lo - L : Rr > hi ? hi - Rr : 0;
    if (dx) s.style.marginLeft = Math.round(dx) + 'px';
    if (T < W.top + 2) s.style.marginTop = Math.round(W.top + 2 - T) + 'px'; // 윗자리: 위 안내 줄을 덮지 않게
  });
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
  if (gameOf(st) === 'holdem') {
    el.className = 'g-me me-tools';
    const spec = me.role === 'spectator' && !mp.cards;
    el.innerHTML = `${spec ? `<div class="me-spec2">${mp.seatRequest ? '방장이 자리 요청을 확인하고 있어요' : canSitNow(st) ? '관전 중 · <b>빈자리를 누르면 앉아요</b>' : '관전 중'}</div>` : ''}
      <button type="button" class="chat-mini" id="chat-mini" aria-label="채팅 열기">${chatMiniHTML(st)}</button>
      <button type="button" class="tool-btn" id="emote-btn" aria-label="감정 표현 보내기">${emoteImg('goodfold')}<span>표정</span></button>
      <button type="button" class="tool-btn" id="chat-btn" aria-label="채팅">${TI.chat}<span>채팅</span><span class="dot" hidden></span></button>`;
    syncChatFab();
    return;
  }
  el.className = 'g-me';
  if (me.role === 'spectator' && !mp.cards) {
    const waitingSeat = mp.seatRequest;
    el.innerHTML = `<div class="me-spec"><span>관전 중이에요${waitingSeat ? ' · 방장이 자리 요청을 확인하고 있어요' : ''}</span>
      ${waitingSeat ? '' : `<button class="btn btn-sm btn-outline" id="sit-btn">${st.room.phase === 'playing' ? '자리 요청하기' : '참가자로 앉기'}</button>`}</div>
      <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button><button class="chat-fab" id="chat-btn" aria-label="채팅">채팅<span class="dot" hidden></span></button>`;
    const sit = el.querySelector('#sit-btn');
    if (sit) sit.onclick = async () => { const r = await emit('lobby:role', { spectator: false }); if (r.ok && r.requested) toast('방장에게 자리 요청을 보냈어요. 수락되면 다음 판부터 참가해요', 'ok'); };
    syncChatFab();
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
  const onTable = h && h.game !== 'seotda' && cards; // 홀덤: 내 카드는 테이블 위 내 자리에
  el.classList.toggle('me-slim', !!(h && h.game !== 'seotda'));
  el.innerHTML = `
    <div class="me-cards ${mp.status === 'folded' ? 'folded' : ''} ${cards && cards.length === 3 ? 'three' : ''}" ${onTable ? 'hidden' : ''}>
      ${onTable ? '' : cards ? cards.map((c, k) => cardHTML(c, { size: 'lg', anim: markCard(`${h.no}:me:${k}`), delay: k * 120, cls: h && h.myOpen === k ? 'card-opened' : '', highlight: result && result.hands && result.hands[me.id] && result.hands[me.id].best.includes(c) })).join('') : `<span class="muted">${st.room.phase === 'playing' ? '이번 판은 쉬는 중이에요' : ''}</span>`}
    </div>
    <div class="me-info">
      <div class="me-name">${avatarHTML(mp, 'avatar-sm')}<b>${esc(me.name)}</b>${P.masterBadge(mp.master, true)}${mp.isDealer ? '<span class="dealer-btn">D</span>' : ''}</div>
      <div class="me-stack"><span class="chip-icon"></span><b>${fmt(me.stack)}</b><span class="muted small">내 칩</span></div>
      ${mp.bet ? `<div class="muted small">이번 베팅 ${fmt(mp.bet)}</div>` : ''}
      ${handName ? `<div class="me-hand">${esc(handName)}</div>` : ''}
      ${mp.status === 'folded' ? '<div class="tag tag-folded">폴드함</div>' : ''}
      ${mp.status === 'allin' ? '<div class="tag tag-allin">올인</div>' : ''}
      ${delta !== undefined ? `<div class="me-delta ${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''}">이번 판 ${signed(delta)}</div>` : ''}
      ${me.canShow && cards ? '<button class="btn btn-sm btn-outline show-btn" id="show-btn">내 패 보여주기</button>' : ''}
      ${h && !h.finished && h.game !== 'seotda' && st.room.settings.timeBank ? `<div class="muted tiny tb-left">⏳ 타임뱅크 ${me.timeBank || 0}초</div>` : ''}
    </div>
    <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">표정</button><button class="chat-fab" id="chat-btn" aria-label="채팅">채팅<span class="dot" hidden></span></button>`;
  const sb = el.querySelector('#show-btn');
  if (sb) sb.onclick = () => emit('game:show');
  syncChatFab();
}

function renderActions(st) {
  const el = document.getElementById('g-actions');
  const h = st.hand;
  const la = h && h.legal;
  const sig = JSON.stringify([la, h && h.toActId, h && h.finished, !!(h && h.result), S.raise.open, h && h.no, st.room.nextHandAt, st.me && [st.me.canShow, (st.me.shownOne || []).join()], h && h.canRabbit, h && h.phase && [h.phase.kind, h.phase.done, h.phase.done || h.phase.watching ? h.phase.waiting : 0], S.pickSel && S.pickSel.cards.join()]); // 고르는 중엔 남은 인원 변화로 다시 그리지 않음 (누른 게 사라지지 않게)
  if (sig === S.actionSig) return;
  S.actionSig = sig;

  if (!h || h.finished) {
    S.raise.open = false;
    el.innerHTML = h && h.finished && !h.result
      ? `<div class="wait-line reveal-line">${h.reveal && h.reveal.allin ? '올인 승부! 카드를 한 장씩 공개하고 있어요' : '패를 공개하고 있어요'}</div>`
      : h && h.finished
      ? `${finishedExtrasHTML(st)}<div class="wait-line"><span data-next>다음 판을 준비하고 있어요</span></div>`
      : `<div class="wait-line">${st.room.waiting ? '참가자를 기다리는 중이에요' : '곧 카드를 나눠 드려요'}</div>`;
    el.querySelectorAll('[data-show]').forEach((b) => { b.onclick = async () => { const v = b.dataset.show; const r = await emit('game:show', { which: v === 'both' ? 'both' : Number(v) }); if (r.ok === false) return; sound.play('flip1'); if (st.me) { seatBubble(st.me.id, '패 공개!'); const mp = st.players.find((x) => x.id === st.me.id); if (mp && mp.cards) showcaseCards(st.me.id, v === 'both' ? mp.cards.filter((c) => !(st.me.shownOne || []).includes(mp.cards.indexOf(c))) : [mp.cards[Number(v)]], '모두에게 공개!', true); } toast(v === 'both' ? '내 패 두 장을 모두에게 보여줬어요' : '고른 한 장을 모두에게 보여줬어요', 'ok'); S.shownHand = st.hand && st.hand.no; }; });
    const rb = el.querySelector('#rabbit-btn');
    if (rb) rb.onclick = () => { rb.disabled = true; emit('game:rabbit'); };
    el.querySelectorAll('[data-manner]').forEach((b) => { b.onclick = () => { b.disabled = true; emit('room:chat', { text: b.dataset.manner }); sound.play('tap'); }; });
    return;
  }
  if (h.phase) { S.raise.open = false; renderSeotdaPhase(el, st); return; }
  if (!la) {
    S.raise.open = false;
    const turnName = nameOf(h.toActId);
    const mineP = st.me && st.players.find((p) => p.id === st.me.id);
    const canPre = h.game !== 'seotda' && mineP && mineP.status === 'inhand';
    // 미리 고르기 (내 차례가 오면 바로): 체크/폴드 · 콜 아무거나
    if (!canPre || (S.pre && S.pre.hand !== h.no)) S.pre = null;
    el.innerHTML = `<div class="wait-line"><b>${esc(turnName)}</b>님 차례예요 · <span data-deadline-text>남은 시간 -</span></div>
      <div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div>
      ${canPre ? `<div class="pre-row"><button class="pre-btn ${S.pre && S.pre.kind === 'cf' ? 'on' : ''}" data-pre="cf">체크 / 폴드</button><button class="pre-btn ${S.pre && S.pre.kind === 'cc' ? 'on' : ''}" data-pre="cc">체크 / 콜</button></div>` : ''}`;
    el.querySelectorAll('[data-pre]').forEach((b) => {
      b.onclick = () => { sound.play('tap'); const k = b.dataset.pre; S.pre = S.pre && S.pre.kind === k ? null : { kind: k, hand: h.no, bet: h.currentBet }; S.actionSig = ''; renderActions(S.state); };
    });
    return;
  }
  // 미리 골라 둔 행동: 내 차례가 오면 바로 (콜은 그 사이 판이 커졌으면 취소)
  if (S.pre && S.pre.hand === h.no && h.game !== 'seotda') {
    const pre = S.pre; S.pre = null;
    if (pre.kind === 'cf') { doAct({ type: la.canCheck ? 'check' : 'fold' }); return; }
    if (pre.kind === 'cc' && (la.canCheck || h.currentBet <= pre.bet)) { doAct({ type: la.canCheck ? 'check' : 'call' }); return; }
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
  renderHoldemActions(el, st, la, { raiseMode, raiseWord, onlyAllIn, clamp, potAfterCall, awayNote });
  return;
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

function finishedExtrasHTML(st) {
  const h = st.hand; const me = st.me;
  if (!h || !h.result || h.game === 'seotda' || !me) return '';
  const mp = st.players.find((p) => p.id === me.id);
  const out = [];
  if (!me.canShow && S.shownHand === h.no) out.push('<div class="shown-note">✓ 내 패를 모두에게 보여줬어요</div>');
  if (me.canShow && mp && mp.cards && mp.cards[0] !== '??') {
    const done = me.shownOne || [];
    if (done.length) out.push('<div class="shown-note">✓ 한 장을 보여줬어요</div>');
    out.push(`<div class="show-row"><span>내 패<br>보여주기</span>${mp.cards.map((c, i) => (done.includes(i) ? '' : `<button type="button" class="show-c" data-show="${i}">${cardHTML(c, { size: 'sm' })}<small>이 장만</small></button>`)).join('')}<button type="button" class="show-both" data-show="both">${done.length ? '나머지도' : '두 장 다'}</button></div>`);
  }
  return out.length ? `<div class="fin-row">${out.join('')}</div>` : '';
}

// 홀덤 내 차례: 금액 고르기(½팟·팟·올인 버튼 + 끌어서 고르는 슬라이더 + −/+ 미세 조정)는 늘 펼쳐 두고, 큰 버튼 3개로 결정
// −/+ 를 꾹 누르고 있으면 반복 (처음 0.35초 쉬고 → 점점 빨라짐) · 짧게 누르면 한 번
function holdRepeat(btn, fn) {
  let t = 0, n = 0;
  const stop = () => { clearTimeout(t); t = 0; window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); };
  const tick = () => { n++; if (fn() === false) return stop(); if (n % 3 === 1) sound.play('tap'); t = setTimeout(tick, Math.max(45, 160 - n * 12)); };
  btn.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); stop(); n = 0; fn(); sound.play('tap'); t = setTimeout(tick, 350); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); });
  btn.addEventListener('click', (e) => { if (e.detail === 0) fn(); }); // 키보드(엔터·스페이스)
  btn.addEventListener('contextmenu', (e) => e.preventDefault()); // 길게 누를 때 폰 메뉴 안 뜨게
}
function renderHoldemActions(el, st, la, o) {
  const h = st.hand;
  const { raiseMode, raiseWord, onlyAllIn, clamp, potAfterCall, awayNote } = o;
  if (!S.raise.to || S.raise.to < la.minTo || S.raise.to > la.maxTo || S.raise.hand !== h.no + ':' + h.currentBet) { S.raise.to = la.minTo; S.raise.hand = h.no + ':' + h.currentBet; S.raise.arm = false; }
  const step = Math.max(1, st.room.tournament && st.room.tournament.running ? st.room.tournament.sb : st.room.settings.sb);
  const nice = (v) => clamp(Math.round(v / step) * step); // 블라인드 단위로 반올림 (103 → 100)
  const sizes = raiseMode && !onlyAllIn ? [
    ['½ 팟', nice(la.canBet ? h.totalPot / 2 : h.currentBet + potAfterCall / 2)],
    ['팟', nice(la.canBet ? h.totalPot : h.currentBet + potAfterCall)],
    ['올인', la.maxTo],
  ] : [];
  el.innerHTML = `${awayNote}
    <div class="act2">
      <div class="act2-head"><span class="act2-turn">내 차례</span><span class="act2-left" data-deadline-text>-</span><div class="timebar"><div class="timebar-fill" data-deadline-bar></div></div></div>
      ${sizes.length ? `<div class="act2-sizes act2-sizes-lite"><button class="sz sl-step" data-step="-1" aria-label="줄이기">−</button>${sizes.map(([t, v]) => `<button class="sz ${S.raise.to === v ? 'on' : ''} ${t === '올인' ? 'sz-allin' : ''}" data-size="${v}">${t}<small>${fmt(v)}</small></button>`).join('')}<button class="sz sl-step" data-step="1" aria-label="늘리기">+</button></div>
      <div class="act2-slide"><span>${fmt(la.minTo)}</span><input type="range" id="raise-range" min="${la.minTo}" max="${la.maxTo}" step="1" value="${S.raise.to}" aria-label="${raiseWord} 금액"><span>올인</span></div>` : ''}
      <div class="act2-row">
        ${la.canFold ? '<button class="ab ab-fold" data-act="fold">폴드</button>' : '<button class="ab ab-fold" data-act="fold" disabled>폴드</button>'}
        ${la.canCheck ? '<button class="ab ab-call" data-act="check">체크</button>' : `<button class="ab ab-call" data-act="call">${la.callAmount < la.toCall ? '올인 콜' : '콜'}<small>${fmt(la.callAmount)}</small></button>`}
        ${raiseMode || la.canAllIn ? `<button class="ab ab-raise" id="raise-go"></button>` : ''}
      </div>
    </div>`;
  const go = el.querySelector('#raise-go');
  const range = el.querySelector('#raise-range');
  const allInPick = () => !raiseMode || onlyAllIn || S.raise.to >= la.maxTo;
  const upd = () => {
    if (!go) return;
    const all = allInPick();
    go.classList.toggle('ab-allin', all);
    go.classList.toggle('armed', all && !!S.raise.arm);
    go.innerHTML = all ? (S.raise.arm ? `올인 확정<small>한 번 더 눌러요</small>` : `올인<small>${fmt(la.stack)}</small>`) : `${raiseWord}<small>${fmt(S.raise.to)}</small>`;
    el.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', Number(b.dataset.size) === S.raise.to));
  };
  upd();
  if (range) range.oninput = () => { const v = Number(range.value); S.raise.to = v >= la.maxTo ? la.maxTo : Math.max(la.minTo, nice(v)); S.raise.arm = false; upd(); };
  el.querySelectorAll('[data-size]').forEach((b) => { b.onclick = () => { S.raise.to = Number(b.dataset.size); S.raise.arm = false; if (range) range.value = S.raise.to; upd(); sound.play('chip'); }; });
  // + − : 금액이 클수록 한 번에 크게 (빅블라인드 ×1 → ×2 → ×5 → ×10) · 꾹 누르면 점점 빨라지며 계속
  const bb = Math.max(step, st.room.settings.bb);
  const inc = (v) => bb * (v < 10 * bb ? 1 : v < 40 * bb ? 2 : v < 100 * bb ? 5 : 10);
  const stepOnce = (dir) => { const cur = S.raise.to; const d = dir > 0 ? inc(cur) : inc(Math.max(0, cur - 1)); const nx = clamp(dir > 0 ? Math.floor((cur + d) / d) * d : Math.ceil((cur - d) / d) * d); if (nx === cur) return false; S.raise.to = nx; S.raise.arm = false; if (range) range.value = S.raise.to; upd(); return true; };
  el.querySelectorAll('[data-step]').forEach((b) => holdRepeat(b, () => stepOnce(Number(b.dataset.step))));
  if (go) go.onclick = () => {
    if (allInPick()) {
      // 올인은 실수 방지로 두 번 눌러 확정 (3초 안에)
      if (!S.raise.arm) { S.raise.arm = true; upd(); clearTimeout(S.raise.armT); S.raise.armT = setTimeout(() => { S.raise.arm = false; upd(); }, 3000); return; }
      S.raise.arm = false; doAct({ type: 'allin' }); return;
    }
    doAct({ type: raiseMode, amount: S.raise.to });
  };
  el.querySelectorAll('[data-act]').forEach((b) => { b.onclick = () => doAct({ type: b.dataset.act }); });
  tickTimers();
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

async function openHistory(tab = S.histTab || 'hands') {
  S.histTab = tab;
  const draw = (r) => {
    const tabs = [['hands', '핸드 기록'], ['ledger', '칩 장부'], ['log', '진행 로그']];
    const head = `<div class="hist-tabs">${tabs.map(([k, t]) => `<button type="button" class="${k === tab ? 'on' : ''}" data-ht="${k}">${t}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'hands') {
      const hs = (r && r.hands) || [];
      body = hs.length ? hs.map((x) => `<div class="hh">
        <div class="hh-head"><b>#${x.no}</b><span>${x.type === 'fold' ? '모두 폴드' : '쇼다운'} · 팟 <b>${fmt(x.pot)}</b></span><span class="muted tiny">${hhmm(x.at)}</span></div>
        <div class="hh-board">${(x.board || []).map((c) => cardHTML(c, { size: 'sm' })).join('')}${(x.rabbit || []).map((c) => cardHTML(c, { size: 'sm', cls: 'card-rabbit' })).join('')}${!(x.board || []).length && !(x.rabbit || []).length ? '<span class="muted small">바닥 카드 없이 끝남</span>' : ''}</div>
        ${(x.hands || []).map((v) => `<div class="hh-hand ${v.won ? 'won' : ''}"><b>${esc(v.name)}</b>${v.cards.map((c) => cardHTML(c || '??', { size: 'xs' })).join('')}<span>${v.hand ? esc(v.hand) : v.self ? '보여 줌' : ''}${v.won ? ' 🏆' : ''}</span></div>`).join('')}
        <div class="hh-deltas">${(x.deltas || []).filter((d) => d.d).map((d) => `<span class="${d.d > 0 ? 'plus' : 'minus'}">${esc(d.name)} ${signed(d.d)}</span>`).join('')}</div>
        <details><summary>진행 보기</summary><ol>${(x.lines || []).map((t) => `<li>${esc(t)}</li>`).join('')}</ol></details></div>`).join('') : '<p class="muted">아직 끝난 판이 없어요</p>';
    } else if (tab === 'ledger') {
      const L = ((r && r.ledger) || []).slice().sort((a, b) => (b.stack - b.buyIn) - (a.stack - a.buyIn));
      body = L.length ? `<table class="ledger"><thead><tr><th>이름</th><th>바이인</th><th>지금 칩</th><th>손익</th><th>판(참여율)</th></tr></thead><tbody>${L.map((p) => {
        const net = p.buyIn ? p.stack - p.buyIn : 0;
        return `<tr><td>${esc(p.name)}${p.isBot ? ' <small class="muted">상주</small>' : ''}${p.leaving ? ' <small class="muted">나감</small>' : ''}${p.rebuys ? ` <small class="muted">리바인 ${p.rebuys}</small>` : ''}</td><td>${fmt(p.buyIn)}</td><td>${fmt(p.stack)}</td><td class="${net > 0 ? 'plus' : net < 0 ? 'minus' : ''}">${p.buyIn ? signed(net) : '-'}</td><td>${p.rs ? `${p.rs.hands}${p.rs.hands ? ` (${Math.round((p.rs.vpip / p.rs.hands) * 100)}%)` : ''}` : '0'}</td></tr>`;
      }).join('')}</tbody></table><p class="muted tiny">참여율: 카드를 받고 스스로 칩을 넣은(콜·레이즈) 판의 비율</p>` : '<p class="muted">아직 기록이 없어요</p>';
    } else {
      const feed = (S.state.feed || []).slice().reverse();
      body = `<ol class="log">${feed.map((e) => `<li class="log-${e.type}">${e.hand ? `<span class="muted tiny">#${e.hand}</span> ` : ''}${esc(e.text)}</li>`).join('') || '<li class="muted">아직 기록이 없어요</li>'}</ol>`;
    }
    return head + `<div class="hist-body">${body}</div>`;
  };
  const bind = (root, r) => root.querySelectorAll('[data-ht]').forEach((b) => { b.onclick = () => { tab = S.histTab = b.dataset.ht; root.innerHTML = draw(r); bind(root, r); }; });
  openModal('기록', '<p class="muted">불러오는 중…</p>', null, { wide: true });
  const r = await emit('room:history');
  const body = document.querySelector('#modal-root .modal-body');
  if (!body) return;
  body.innerHTML = draw(r.ok ? r : null);
  bind(body, r.ok ? r : null);
}

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
      <div class="menu-quick">
        <button class="btn btn-outline" data-m="chart">족보표</button>
        ${gameOf(st) === 'holdem' ? '<button class="btn btn-outline" data-learn="gloss">홀덤 용어집</button>' : ''}
        <button class="btn btn-outline" data-m="hist">기록 · 칩 장부</button>
        <button class="btn btn-outline" data-m="share">초대 링크</button>
        ${me.role === 'player' ? `<button class="btn btn-outline" data-m="${me.sittingOut ? 'sitin' : 'sitout'}">${me.sittingOut ? '자리로 돌아가기' : '자리 비우기'}</button>` : ''}
        <button class="btn btn-outline" data-m="sound">소리 설정</button>
        <button class="btn btn-outline" data-m="color">카드가 검게 보여요</button>
        ${S.muted.size ? `<button class="btn btn-outline" data-m="unmute">가린 채팅 ${S.muted.size}명 다시 보기</button>` : ''}
      </div>
      <section><h3 class="sub-title">친구 초대</h3>${inviteHTML(st.room.code)}</section>
      ${isHost && st.pending && st.pending.length ? `<section class="attention"><h3 class="sub-title">참가 요청</h3>
        ${st.pending.map((p) => `<div class="list-row"><b>${esc(p.name)}</b><div class="spacer"></div>
          <button class="btn btn-sm btn-gold" data-approve="${p.id}">수락</button><button class="btn btn-sm btn-outline" data-reject="${p.id}">거절</button></div>`).join('')}</section>` : ''}
      <section><h3 class="sub-title">참가자</h3><div class="plist">${[st.players.find((p) => p.id === me.id), ...others].filter(Boolean).map((p) => playerRowHTML(p, st, isHost)).join('')}</div></section>
      <section><h3 class="sub-title">방 설정</h3>${settingsSummaryHTML(st.room.settings)}</section>
      <div class="stack">
        ${!inHand && !me.masterPeek ? `<button class="btn btn-outline" data-m="role">${me.role === 'player' ? '관전으로 바꾸기' : '참가자로 앉기'}</button>` : ''}
        ${isHost ? `<button class="btn btn-outline" data-m="end">${st.room.tournament ? '게임 끝내고 대기실로' : '게임 끝내고 정산하기'}</button>` : ''}
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
        if (m === 'chart') { closeModal(); document.getElementById('chart-btn') ? document.getElementById('chart-btn').click() : openModal('족보표', handChartHTML(), null, { wide: true }); return; }
        if (m === 'hist') { openHistory(); return; }
        if (m === 'share') { closeModal(); shareTop(); return; }
        if (m === 'sound') { openSoundModal(); return; }
        if (m === 'color') { openColorHelp(); return; }
        if (m === 'unmute') { S.muted.clear(); LS.set('chandem:muted', []); syncChatMini(); toast('가린 채팅을 다시 보여 줘요', 'ok'); }
        if (m === 'sitin') await emit('game:sitin');
        if (m === 'sitout') await emit('game:sitout');
        if (m === 'role') await emit('lobby:role', { spectator: me.role === 'player' });
        if (m === 'end') { if (!confirm(st.room.settings.mode === 'tournament' ? '게임을 끝내고 대기실로 돌아갈까요?' : '게임을 끝내고 정산할까요? (모두 대기실로 돌아가 정산표를 봐요)')) return; const r = await emit('host:end'); if (r && r.scheduled) toast('이번 판이 끝나면 게임을 끝내고 정산할게요', 'info'); }
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
      if (gameOf(st) === 'holdem') { const pill = document.createElement('div'); pill.className = 'fx-showdown-pill'; pill.textContent = '올인 승부 · 카드 공개'; centerFx(pill); fxLayer().appendChild(pill); setTimeout(() => pill.remove(), 2600); }
      else banner('올인 승부!', '', 'allin');
      sound.play(gameOf(st) === 'holdem' ? 'allinTension' : 'drumroll');
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
  if (S.state && gameOf(S.state) === 'holdem') { allinBadge(id); return; }
  const p = S.state && S.state.players.find((x) => x.id === id);
  const el = document.createElement('div');
  el.className = 'fx-stamp';
  el.innerHTML = `<div class="fx-stamp-main">ALL-IN!</div><div class="fx-stamp-sub">${p ? esc(p.name) + ' 올~인!' : '올~인!'}</div>`;
  centerFx(el);
  fxLayer().appendChild(el);
  sound.play('stamp');
  quake();
  const seat = document.querySelector(`.seat[data-id="${id}"]`);
  if (seat) { seat.classList.add('seat-allin-fx'); setTimeout(() => seat.classList.remove('seat-allin-fx'), 2200); }
  if (sound.isUnlocked()) gws.vibrate([100, 50, 100]);
  setTimeout(() => el.remove(), 1900);
}

// 홀덤 올인: 그 사람 자리 옆에 작고 묵직한 'ALL IN' 판이 찍힌다 (흔들림·화면 가득 연출 없음)
function allinBadge(id) {
  const seat = document.querySelector(`.seat[data-id="${id}"] .seat-av`) || (S.state && S.state.me && S.state.me.id === id ? document.querySelector('.seat-me .seat-av') : null);
  if (!seat) return;
  const at = centerOf(seat);
  const el = document.createElement('div');
  el.className = 'fx-allin2';
  el.innerHTML = '<b>ALL IN</b>';
  el.style.left = at.x + 'px';
  el.style.top = (at.y - 34) + 'px';
  fxLayer().appendChild(el); // 소리는 기록 소리(allinPush) 하나만
  if (sound.isUnlocked()) gws.vibrate(60);
  setTimeout(() => el.remove(), 1700);
}

function quake() {
  const g = document.querySelector('.game');
  if (!g || gws.reduceMotion()) return;
  g.classList.remove('quake'); void g.offsetWidth; g.classList.add('quake');
  setTimeout(() => g.classList.remove('quake'), 700);
}

// 쇼다운: 공개된 패마다 족보를 음성으로. 플러시 이상은 특별 연출
const HAND_TIERS = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시', '로열 스트레이트 플러시'];
const BIG_EN = { 3: 'TRIPLE', 4: 'STRAIGHT', 5: 'FLUSH', 6: 'FULL HOUSE', 7: 'FOUR OF A KIND', 8: 'STRAIGHT FLUSH', 9: 'ROYAL FLUSH' };
const BIG_MIN = 3; // 투페어보다 높은 족보부터 큰 연출
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
    S.annAt = at + (tier >= 4 ? HV_MS[Math.min(9, tier)] - 600 : 1000);
    setTimeout(() => {
      handTag(p.id, HAND_TIERS[tier], tier);
      if (tier >= 4) bigHandVideo(tier, p);
      else if (tier >= BIG_MIN) sound.play('v_h' + tier);
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
  // 족보가 셀수록 더 크게·오래: 트리플/스트레이트 1.8초 · 플러시/풀하우스 2.4초 · 포카드 이상 3.2초 (우주 폭발)
  const ms = tier >= 7 ? 3200 : tier >= 5 ? 2400 : 1800;
  const burst = holdemFxArt(tier);
  const el = document.createElement('div');
  el.className = `fx-bighand fx-tier${tier} ${tier >= 7 ? 'fx-big-max' : tier >= 5 ? 'fx-big-mid' : 'fx-big-low'}`;
  el.innerHTML = `${burst ? `<img class="fx-big-burst" src="${burst}" alt=""><img class="fx-big-burst fx-big-burst2" src="${burst}" alt="">` : ''}<div class="fx-big-rays"></div><div class="fx-big-en">${custom ? custom.en : BIG_EN[tier]}</div><div class="fx-big-ko">${esc(custom ? custom.ko : HAND_TIERS[tier])}!</div><div class="fx-big-who">${esc(p.name)}</div>`;
  fitFx(el);
  fxLayer().appendChild(el);
  sound.play('boom');
  if (!custom) setTimeout(() => sound.play('v_h' + tier, 1.3), 380);
  // 터지는 순간: 충격파 고리 3겹 + 카드 무늬·불꽃이 사방으로
  const fa = fxArea(); const c = { x: fa.cx, y: fa.top + fa.height * 0.45 };
  setTimeout(() => { shockwave(c, tier); sparkBurst(c, tier >= 7 ? 90 : tier >= 5 ? 60 : 40, tier); }, 280);
  if (tier >= 5) setTimeout(() => sparkBurst(c, 40, tier), 900);
  setTimeout(() => { moneyRain(tier >= 8 ? 110 : tier >= 5 ? 70 : 40); quake(); }, 450);
  if (tier >= 7) setTimeout(() => { quake(); sound.play('boom'); }, 1300);
  if (sound.isUnlocked()) gws.vibrate(tier >= 7 ? [80, 40, 200, 60, 300] : [60, 40, 200]);
  setTimeout(() => el.classList.add('out'), ms - 500);
  setTimeout(() => el.remove(), ms);
}
// 홀덤 큰 족보 (스트레이트 이상): AI(Gemini Veo)로 만든 영상을 화면에 겹쳐 틀고, 금빛 족보 글씨를 띄운다
// 영상은 검은 배경이라 '스크린' 섞기로 검은 부분이 투명해진다. 족보가 셀수록 더 화려한 영상.
const HV_MS = { 4: 4000, 5: 4500, 6: 4800, 7: 4600, 8: 5000, 9: 5000 }; // 영상 길이
const FX_VID = { 4: 'straight', 5: 'flush', 6: 'fullhouse', 7: 'quads', 8: 'sf', 9: 'royal' };
function bigHandVideo(tier, p) {
  const key = FX_VID[Math.min(9, tier)];
  const ms = HV_MS[Math.min(9, tier)];
  const el = document.createElement('div');
  el.className = `fx-hv fx-hv${tier}`;
  el.innerHTML = `<img class="fx-hv-title" src="/img/holdem/fx/title_${key}.webp?v=1" alt="${esc(HAND_TIERS[tier])}">
    <div class="fx-hv-who">${esc(p.name)}</div>`;
  const t = el.querySelector('.fx-hv-title');
  t.onerror = () => { t.replaceWith(Object.assign(document.createElement('div'), { className: 'fx-hv-title-txt', textContent: HAND_TIERS[tier] })); };
  // 영상은 페이지에 바로 붙여야 '스크린' 섞기가 테이블과 섞인다 (연출 층 안에 넣으면 검은 화면이 됨)
  const dim = Object.assign(document.createElement('div'), { className: 'fx-hv-dim' });
  const vw = blendVideo(`/img/holdem/fx/${key}.mp4?v=1`, 'fx-hv-vid');
  fitFx(dim, vw, el);
  document.body.append(dim, vw, el);
  const parts = [dim, vw, el];
  sound.play('fx_' + key);
  setTimeout(() => sound.play('v_h' + tier, 1.2), 500);
  if (sound.isUnlocked()) gws.vibrate(tier >= 7 ? [60, 40, 160] : [50]);
  setTimeout(() => parts.forEach((x) => x.classList.add('out')), ms - 600);
  setTimeout(() => parts.forEach((x) => x.remove()), ms);
}
// 검은 배경 영상을 화면에 '스크린'으로 섞어 붙이기 (검은 곳은 투명해짐). 감싼 칸 자체가 섞이도록 body 바로 아래에 둔다
// 연출 영상 미리 받아 두기 (첫 큰 족보 때 영상이 늦게 뜨지 않게) · 한 번만, 천천히
function prefetchFx() {
  if (S.fxPrefetched || !S.state || gameOf(S.state) !== 'holdem') return;
  S.fxPrefetched = true;
  const list = ['river', 'potwin', 'straight', 'flush', 'fullhouse', 'quads', 'sf', 'royal'];
  let i = 0;
  const next = () => { if (i >= list.length) return; const k = list[i++]; fetch(`/img/holdem/fx/${k}.mp4?v=1`).then((r) => r.blob()).catch(() => {}).finally(() => setTimeout(next, 400)); };
  setTimeout(next, 3000);
}
function blendVideo(src, cls) {
  const w = document.createElement('div');
  w.className = 'fx-blend ' + cls;
  const v = document.createElement('video');
  Object.assign(v, { src, muted: true, playsInline: true, autoplay: true, preload: 'auto' });
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  v.onerror = () => w.remove();
  w.appendChild(v);
  setTimeout(() => { if (v.play) v.play().catch(() => {}); }, 0);
  return w;
}
// 큰 족보 연출 그림 (Gemini): 포카드 이상은 우주 폭발, 그 아래는 금빛 폭발
function holdemFxArt(tier) {
  if (tier >= 7 && S.cosmicOk !== false) return '/img/holdem/burst-cosmic.webp';
  return '/img/holdem/burst-gold.webp';
}

function fxLayer() { return document.getElementById('fx-layer') || document.body; }
// 패 공개 연출: 공개한 카드가 자리에서 테이블 가운데로 날아와 뒷면→앞면으로 뒤집히며 크게 보였다가 자리로 돌아간다 (모두에게 보였다는 걸 확실히)
const EYE_SVG = '<svg class="eye-ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C6.5 5 2.4 9.2 1 12c1.4 2.8 5.5 7 11 7s9.6-4.2 11-7c-1.4-2.8-5.5-7-11-7Zm0 11.5A4.5 4.5 0 1 1 12 7.5a4.5 4.5 0 0 1 0 9Zm0-2.3a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z" fill="currentColor"/></svg>';
function showcaseCards(id, cards, label, mine = false) {
  if (!cards || !cards.length) return;
  const seat = (mine && document.querySelector('#g-table .seat-me .seat-mycards')) || document.querySelector(`.seat[data-id="${id}"] .seat-cards`) || document.querySelector(`.seat[data-id="${id}"] .seat-av`);
  const board = document.querySelector('#g-table .board');
  const a = fxArea();
  const to = board ? centerOf(board) : { x: a.cx, y: a.top + a.height * 0.45 };
  const from = seat ? centerOf(seat) : to;
  const el = document.createElement('div');
  el.className = 'fx-showcase' + (mine ? ' mine' : '');
  el.innerHTML = `<div class="sc-cards">${cards.map((c, i) => `<div class="sc-card" style="--i:${i}"><div class="sc-in"><div class="sc-face sc-back">${cardHTML('??', { size: 'lg' })}</div><div class="sc-face sc-front">${cardHTML(c, { size: 'lg' })}</div></div></div>`).join('')}</div><div class="sc-label">${EYE_SVG}<b>${esc(label)}</b></div>`;
  el.style.left = to.x + 'px'; el.style.top = to.y + 'px';
  document.body.appendChild(el); // 판 끝 족보 영상(맨 위 층)보다도 위에
  const dx = from.x - to.x, dy = from.y - to.y;
  if (gws.reduceMotion()) { el.classList.add('still'); setTimeout(() => el.remove(), 1800); return; }
  el.animate([
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45)`, opacity: 0 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: 1, offset: 0.06 },
    { transform: 'translate(-50%, -50%) scale(1.12)', opacity: 1, offset: 0.26 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.34 },
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.8 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.45)`, opacity: 0 },
  ], { duration: 2900, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' }).onfinish = () => el.remove();
  setTimeout(() => sound.play('flip'), 420);
}
// 큰 연출이 덮을 곳: 가로 화면이면 테이블 칸만 (오른쪽 버튼 칸까지 덮거나 글씨가 테이블 밖으로 치우치지 않게) · 세로면 화면 전체
function fxArea() {
  const tw = document.querySelector('.game[data-orient="land"] .table-wrap');
  const r = tw && tw.getBoundingClientRect();
  return r && r.width > 50 ? { left: r.left, top: r.top, width: r.width, height: r.height, cx: r.left + r.width / 2 } : { left: 0, top: 0, width: innerWidth, height: innerHeight, cx: innerWidth / 2 };
}
function fitFx(...els) { // 화면 전체 연출을 테이블 칸에 맞춘다 (세로 화면은 그대로)
  if (!document.querySelector('.game[data-orient="land"]')) return;
  const a = fxArea();
  for (const el of els) Object.assign(el.style, { inset: 'auto', left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' });
}
function centerFx(el) { if (document.querySelector('.game[data-orient="land"]')) el.style.left = fxArea().cx + 'px'; } // 가운데(left:50%) 연출을 테이블 가운데로

function banner(title, sub, kind = '', ms = 1800) {
  const el = document.createElement('div');
  el.className = `fx-banner fx-${kind}`;
  el.innerHTML = `<div class="fx-title">${esc(title)}</div>${sub ? `<div class="fx-sub">${sub}</div>` : ''}`;
  centerFx(el);
  fxLayer().appendChild(el);
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 500);
  return el;
}

function centerOf(el) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

// 팟에서 이긴 사람 자리로 칩이 폭발하듯 날아간다
// 팟 밀어 주기: 가운데 칩 더미 하나가 이긴 사람 자리로 미끄러져 간다 (나눠 가지면 나눠서)
function pushPot(winners) {
  const pot = document.querySelector('#g-table .pot-chip') || document.querySelector('#g-table .board');
  if (!pot || gws.reduceMotion()) return;
  const from = centerOf(pot);
  winners.forEach((w, wi) => {
    const seat = document.querySelector(`.seat[data-id="${w}"] .seat-av`);
    if (!seat) return;
    const to = centerOf(seat);
    const el = document.createElement('div');
    el.className = 'fx-potstack';
    el.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
    el.style.left = from.x + 'px'; el.style.top = from.y + 'px';
    fxLayer().appendChild(el);
    const dx = to.x - from.x; const dy = to.y - from.y + 18;
    el.animate([
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.12 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.9)`, opacity: 1, offset: 0.8 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.85)`, opacity: 0 },
    ], { duration: 1000, delay: 250 + wi * 150, easing: 'cubic-bezier(.3,.6,.25,1)', fill: 'both' }).onfinish = () => el.remove();
  });
}
// 내가 이겼을 때: 화면을 시끄럽게 덮지 않고, 내 자리에 은은한 금빛 (AI 영상이 있으면 그걸로)
function winGlow(huge) {
  if (gws.reduceMotion()) return;
  const me = document.querySelector('#g-table .seat-me .seat-av');
  const c = me ? centerOf(me) : { x: innerWidth / 2, y: innerHeight * 0.7 };
  const el = blendVideo('/img/holdem/fx/potwin.mp4?v=1', 'fx-winglow' + (huge ? ' huge' : ''));
  el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
  document.body.appendChild(el);
  sound.play('fx_potwin');
  setTimeout(() => el.classList.add('out'), 2200);
  setTimeout(() => el.remove(), 2800);
}
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

// 내가 이기면 내 자리에서 돈·칩이 위로 '팡' 솟구쳐 올랐다가 흩어진다 (분수처럼)
function coinFountain(n = 50) {
  if (gws.reduceMotion()) return;
  const me = document.querySelector('#g-table .seat-me .seat-av') || document.querySelector('#g-table');
  if (!me) return;
  const o = centerOf(me);
  const H = window.innerHeight;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    const r = Math.random();
    el.className = r < 0.4 ? 'fx-bill' : r < 0.7 ? 'fx-coin' : 'fx-chip fx-chip-lg';
    el.style.left = o.x + 'px'; el.style.top = o.y + 'px';
    fxLayer().appendChild(el);
    // 위로 쏘아 올린 뒤 중력으로 떨어지는 포물선
    const vx = (Math.random() - 0.5) * 360; const up = H * (0.45 + Math.random() * 0.35);
    const T = 1300 + Math.random() * 700; const spin = (Math.random() - 0.5) * 1080;
    const frames = [];
    for (let k = 0; k <= 10; k++) {
      const t = k / 10;
      const y = -up * (4 * t - 4 * t * t) * (t < 0.5 ? 1 : 1) + (t > 0.5 ? (t - 0.5) * (t - 0.5) * H * 1.6 : 0);
      frames.push({ transform: `translate(${vx * t}px,${y}px) rotate(${spin * t}deg) scale(${0.5 + 0.6 * Math.min(1, t * 4)})`, opacity: t > 0.85 ? (1 - t) / 0.15 : 1 });
    }
    el.animate(frames, { duration: T, delay: i * 22 + Math.random() * 120, easing: 'linear', fill: 'both' }).onfinish = () => el.remove();
  }
}
// (예전) 화면 위에서 금화·칩이 쏟아진다
// 충격파: 화면 가운데서 금빛 고리가 퍼진다
function shockwave(c, tier = 5) {
  if (gws.reduceMotion()) return;
  for (let i = 0; i < 3; i++) {
    const r = document.createElement('div');
    r.className = 'fx-wave' + (tier >= 7 ? ' max' : '');
    r.style.left = c.x + 'px'; r.style.top = c.y + 'px';
    fxLayer().appendChild(r);
    r.animate([{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 0 }], { duration: 900, delay: i * 160, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }).onfinish = () => r.remove();
  }
}
// 불꽃 폭발: ♠♥♦♣ · 별 · 반짝이가 사방으로 날아가며 떨어진다
function sparkBurst(c, n = 50, tier = 5) {
  if (gws.reduceMotion()) return;
  const sym = ['♠', '♥', '♦', '♣', '★', '✦', '💰', '✨'];
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    const s = sym[Math.floor(Math.random() * sym.length)];
    el.className = 'fx-spark ' + (s === '♥' || s === '♦' ? 'red' : s === '♠' || s === '♣' ? 'blk' : 'gold');
    el.textContent = s;
    el.style.left = c.x + 'px'; el.style.top = c.y + 'px';
    el.style.fontSize = (14 + Math.random() * (tier >= 7 ? 26 : 18)) + 'px';
    fxLayer().appendChild(el);
    const a = Math.random() * Math.PI * 2; const d = 120 + Math.random() * Math.min(innerWidth, innerHeight) * 0.55;
    const dx = Math.cos(a) * d; const dy = Math.sin(a) * d;
    el.animate([
      { transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1.1) rotate(${(Math.random() - 0.5) * 540}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 160}px)) scale(.8) rotate(${(Math.random() - 0.5) * 720}deg)`, opacity: 0 },
    ], { duration: 1300 + Math.random() * 700, delay: Math.random() * 120, easing: 'cubic-bezier(.15,.75,.35,1)', fill: 'both' }).onfinish = () => el.remove();
  }
}
// 돈 비: 지폐·금화·칩이 하늘에서 팔랑팔랑 떨어진다 (지폐는 좌우로 흔들리며)
function moneyRain(n = 50) {
  if (gws.reduceMotion()) return;
  const W = innerWidth; const H = innerHeight;
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div');
    const r = Math.random();
    const bill = r < 0.5;
    el.className = bill ? 'fx-bill' : r < 0.8 ? 'fx-coin' : 'fx-chip fx-chip-lg';
    el.style.left = Math.random() * W + 'px';
    el.style.top = '-40px';
    fxLayer().appendChild(el);
    const T = 2200 + Math.random() * 1600; const sway = 40 + Math.random() * 60;
    const frames = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const x = Math.sin(t * Math.PI * (bill ? 3 : 1.5) + i) * (bill ? sway : sway / 3);
      frames.push({ transform: `translate(${x}px, ${t * (H + 80)}px) rotate(${bill ? Math.sin(t * 9 + i) * 35 : t * 720}deg) rotateY(${bill ? t * 540 : 0}deg)`, opacity: t > 0.9 ? 0 : 1 });
    }
    el.animate(frames, { duration: T, delay: Math.random() * 1200, easing: 'linear', fill: 'both' }).onfinish = () => el.remove();
  }
}
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
  const holdem = !st.hand.game || st.hand.game === 'holdem';
  if (holdem) { pushPot(r.winners); setTimeout(() => sound.play('collect'), 150); }
  else {
    burstChips(r.winners, big ? (huge ? 60 : 36) : 18);
    setTimeout(() => sound.play('collect'), 380);
    sound.play('coins');
    if (big || iWon) setTimeout(() => sound.play('fanfare'), 250);
  }
  const names = r.winnerNames.join(', ');
  const handName = big && r.hands[r.winners[0]] ? esc(r.hands[r.winners[0]].name) : '모두 폴드';
  const el = banner(iWon ? '내가 이겼다!' : `${names} 승리`, `<span class="fx-hand">${handName}</span><b class="fx-amt">+0</b>`, iWon ? 'mywin' : 'win', big ? 2600 : 1800);
  countUp(el.querySelector('.fx-amt'), gain);
  if (iWon && holdem) {
    winGlow(huge);
    if (sound.isUnlocked()) gws.vibrate([60]);
  } else if (iWon) {
    coinFountain(huge ? 80 : 50);
    setTimeout(() => moneyRain(huge ? 70 : 36), 700);
    const flash = document.createElement('div');
    flash.className = 'fx-flash';
    fitFx(flash);
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
window.__chandem = { S, cardName, sound, fx: { allinStamp, bigHand, bigHandVideo, riverGlint, showcaseCards, winGlow, pushPot, handTag, goHome, openColorHelp, openRebuyPick, settlementHTML } };
