import { cardHTML, cardsHTML, cardName } from './cards.js';
import * as sound from './sound.js';
import { handChartHTML } from './handchart.js';
import { bestHand } from './evaluator.js';

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
  return `<span class="avatar ${size}"><span class="avatar-initial">${initial}</span>`
    + `<img src="/img/avatars/a${avatarIndex(p)}.webp" alt="" loading="lazy" onerror="this.remove()"></span>`;
}

// 선수 캐릭터 고르기 (0 = 자동)
function avatarPickerHTML() {
  const cur = LS.get('chandem:avatar', 0);
  return `<fieldset class="fieldset"><legend>내 캐릭터</legend>
    <div class="av-pick">
      <label class="av-opt"><input type="radio" name="avatar" value="0" ${!cur ? 'checked' : ''}><span class="avatar avatar-auto">자동</span></label>
      ${Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map((n) => `
        <label class="av-opt"><input type="radio" name="avatar" value="${n}" ${cur === n ? 'checked' : ''}>
          <span class="avatar"><img src="/img/avatars/a${n}.webp" alt="캐릭터 ${n}"></span></label>`).join('')}
    </div></fieldset>`;
}
function readAvatar(form) {
  const v = Number(new FormData(form).get('avatar')) || 0;
  LS.set('chandem:avatar', v);
  return v || undefined;
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
  if (code) shareLink(inviteUrl(code), '찬덤 홀덤 초대', `찬덤 홀덤 방 ${code}에 들어와!`);
  else shareLink(siteUrl(), '찬덤 홀덤', '친구들이랑 휴대폰으로 홀덤 한 판 하자!');
}

const SHARE_BTN = '<button class="btn btn-sm btn-gold share-top" id="share-top" aria-label="공유하기">🔗 공유</button>';

// ── 모달 ─────────────────────────────────────────────
function openModal(title, html, onMount, { wide = false } = {}) {
  $modal.innerHTML = `
    <div class="modal-backdrop" data-close></div>
    <div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="닫기">✕</button></div>
      <div class="modal-body">${html}</div>
    </div>`;
  $modal.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeModal));
  if (onMount) onMount($modal.querySelector('.modal-body'));
}
function closeModal() { $modal.innerHTML = ''; }

// ── 라우팅 ───────────────────────────────────────────
function routeCode() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{4,8})/);
  return m ? m[1].toUpperCase() : null;
}

async function boot() {
  fetch('/api/info').then((r) => r.json()).then((d) => { S.info = d; if (S.view === 'room') render(); }).catch(() => {});
  const code = routeCode();
  if (!code) { S.view = 'home'; render(); return; }
  S.code = code;
  // 테스트 도구(scripts/bots.js --start)가 준 링크: ?t=토큰&p=아이디 → 저장 후 주소에서 지움
  const qs = new URLSearchParams(location.search);
  if (qs.get('t') && qs.get('p')) {
    LS.set(sessKey(code), { token: qs.get('t'), playerId: qs.get('p') });
    history.replaceState(null, '', '/r/' + code);
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

async function resume() {
  if (!S.code || !S.session) return;
  const res = await new Promise((r) => socket.emit('room:resume', { code: S.code, token: S.session.token }, r));
  if (res && res.ok) {
    if (res.pending) { S.view = 'pending'; render(); }
    else S.view = 'room';
    return;
  }
  LS.del(sessKey(S.code));
  S.session = null;
  toast((res && res.message) || '다시 참가해 주세요', 'error');
  await showJoin(S.code);
}

socket.on('connect', () => {
  S.connected = true;
  document.body.classList.remove('offline');
  if (S.session && S.code) resume();
});
socket.on('disconnect', () => {
  S.connected = false;
  document.body.classList.add('offline');
});
socket.on('state', (st) => {
  const first = !S.state || S.state.room.code !== st.room.code;
  S.state = st;
  S.clockSkew = st.serverTime - Date.now();
  if (S.view !== 'room') S.view = 'room';
  processEvents(st, first);
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

// ── 감정 표현 ───────────────────────────────────────
const EMOTES = [['angry', '😡', '화남'], ['happy', '🤩', '신남'], ['mock', '😜', '조롱'], ['laugh', '😂', '웃음'], ['cry', '😭', '울음'], ['clap', '👏', '박수']];
document.addEventListener('click', (e) => {
  const tray = document.getElementById('emote-tray');
  if (tray && !e.target.closest('#emote-tray') && !e.target.closest('#emote-btn')) tray.hidden = true;
});
socket.on('emote', (e) => {
  const def = EMOTES.find((x) => x[0] === e.kind);
  if (!def || S.view !== 'room') return;
  const seat = document.querySelector(`.seat[data-id="${e.id}"] .seat-av`) || (S.state && S.state.me && S.state.me.id === e.id ? document.querySelector('.me-name') : null);
  const el = document.createElement('div');
  el.className = `fx-emote fx-emote-${e.kind}`;
  el.innerHTML = `<span>${def[1]}</span>`;
  const at = seat ? centerOf(seat) : { x: innerWidth / 2, y: innerHeight / 2 };
  el.style.left = at.x + 'px';
  el.style.top = at.y + 'px';
  fxLayer().appendChild(el);
  setTimeout(() => el.remove(), 2600);
  if (e.kind === 'clap') sound.play('clap'); else { sound.play('pop'); sound.play('e_' + e.kind); }
});

// ── 소리·애니메이션 트리거 ─────────────────────────────
function processEvents(st, first) {
  const feed = st.feed || [];
  const maxSeq = feed.length ? feed[feed.length - 1].seq : 0;
  if (first || S.lastSeq === null) { S.lastSeq = maxSeq; return; }
  const meId = st.me && st.me.id;
  const fresh = feed.filter((e) => e.seq > S.lastSeq);
  S.lastSeq = Math.max(S.lastSeq, maxSeq);
  let delay = 0;
  for (const e of fresh) {
    if (e.type === 'info') {
      if (/번째 판 시작/.test(e.text)) setTimeout(() => sound.play('deal'), delay);
      continue;
    }
    if (e.type === 'allin') setTimeout(() => allinStamp(e.id), delay);
    const iWon = e.type === 'end' && e.winners && e.winners.includes(meId);
    setTimeout(() => sound.playForEvent(e, { isMe: e.id === meId, iWon }), delay);
    delay += 160;
  }
  const turnId = st.hand && st.hand.toActId;
  if (turnId && turnId === meId && S.lastTurnId !== meId) {
    sound.play('turn');
    if (navigator.vibrate && sound.isUnlocked()) navigator.vibrate(60);
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
function render() {
  if (S.view !== 'room') S.gameMounted = false;
  switch (S.view) {
    case 'boot': $app.innerHTML = `<div class="center-screen">${logoHTML()}<p class="muted">불러오는 중…</p></div>`; break;
    case 'home': renderHome(); break;
    case 'create': renderCreate(); break;
    case 'practice': renderPractice(); break;
    case 'join': renderJoin(); break;
    case 'pending': renderPending(); break;
    case 'message': renderMessage(); break;
    case 'room':
      if (!S.state) { $app.innerHTML = `<div class="center-screen">${logoHTML()}<p class="muted">방에 들어가는 중…</p></div>`; break; }
      if (S.state.room.phase === 'lobby') renderLobby(); else renderGame();
      break;
    default: break;
  }
}

function logoHTML(small = false) {
  return `<div class="logo ${small ? 'logo-sm' : ''}">
    <img class="logo-icon" src="/img/emblem.webp" alt="" onerror="this.remove()">
    <div class="logo-text"><span class="logo-ko">찬덤</span><span class="logo-en">CHAN'DEM HOLD'EM</span></div>
  </div>`;
}

function renderHome() {
  const last = LS.get('chandem:name', '');
  $app.innerHTML = `
  <main class="home">
    <div class="top-bar">${SHARE_BTN}</div>
    <div class="home-hero">
      ${logoHTML()}
      <p class="tagline">친구들과 휴대폰으로 즐기는 노리밋 텍사스 홀덤</p>
    </div>
    <section class="panel">
      <button class="btn btn-gold btn-lg" id="go-create">방 만들기</button>
      <button class="btn btn-outline btn-lg" id="go-practice">🤖 혼자 연습하기</button>
      <div class="divider"><span>또는 초대 코드로 참가</span></div>
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
  $app.querySelector('#go-create').onclick = () => { history.pushState(null, '', '/'); S.view = 'create'; render(); };
  $app.querySelector('#go-practice').onclick = () => { history.pushState(null, '', '/'); S.view = 'practice'; render(); };
  $app.querySelector('#code-form').onsubmit = (e) => {
    e.preventDefault();
    const code = $app.querySelector('#code-in').value.trim().toUpperCase();
    if (code.length < 4) { toast('방 코드를 확인해 주세요', 'error'); return; }
    history.pushState(null, '', '/r/' + code);
    boot();
  };
}

function settingsFormHTML(s, { forCreate = false } = {}) {
  return `
  ${forCreate ? `
  <label class="field"><span>내 닉네임</span>
    <input class="input" name="name" maxlength="10" required value="${esc(LS.get('chandem:name', ''))}" placeholder="최대 10자"></label>
  ${avatarPickerHTML()}` : ''}
  <div class="grid2">
    <label class="field"><span>시작 칩</span><input class="input" type="number" inputmode="numeric" name="startChips" min="100" value="${s.startChips}"></label>
    <label class="field"><span>턴 제한시간(초)</span><input class="input" type="number" inputmode="numeric" name="turnSeconds" min="10" max="120" value="${s.turnSeconds}"></label>
    <label class="field"><span>스몰 블라인드</span><input class="input" type="number" inputmode="numeric" name="sb" min="1" value="${s.sb}"></label>
    <label class="field"><span>빅 블라인드</span><input class="input" type="number" inputmode="numeric" name="bb" min="1" value="${s.bb}"></label>
    <label class="field"><span>최소 인원</span><input class="input" type="number" inputmode="numeric" name="minPlayers" min="2" max="9" value="${s.minPlayers}"></label>
    <label class="field"><span>최대 인원</span><input class="input" type="number" inputmode="numeric" name="maxPlayers" min="2" max="9" value="${s.maxPlayers}"></label>
  </div>
  <fieldset class="fieldset">
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

function readSettings(form) {
  const fd = new FormData(form);
  const num = (k) => Number(fd.get(k));
  return {
    startChips: num('startChips'), turnSeconds: num('turnSeconds'), sb: num('sb'), bb: num('bb'),
    minPlayers: num('minPlayers'), maxPlayers: num('maxPlayers'),
    rebuyEnabled: fd.get('rebuyEnabled') === 'on', rebuyAmount: num('rebuyAmount'), rebuyMax: num('rebuyMax'),
    password: String(fd.get('password') || ''), approval: fd.get('approval') === 'on',
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

const DEFAULTS = { startChips: 1000, sb: 10, bb: 20, minPlayers: 2, maxPlayers: 9, turnSeconds: 30, rebuyEnabled: true, rebuyAmount: 1000, rebuyMax: 3, password: '', approval: false };

function renderCreate() {
  $app.innerHTML = `
  <main class="page">
    <header class="page-head"><button class="icon-btn" id="back" aria-label="뒤로">←</button><h1>방 만들기</h1></header>
    <form id="create-form" class="panel form">
      ${settingsFormHTML(DEFAULTS, { forCreate: true })}
      <button class="btn btn-gold btn-lg" type="submit">방 만들고 초대하기</button>
    </form>
  </main>`;
  $app.querySelector('#back').onclick = () => { S.view = 'home'; render(); };
  const form = $app.querySelector('#create-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = String(new FormData(form).get('name') || '').trim();
    if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
    const settings = readSettings(form);
    const bad = validateSettings(settings);
    if (bad) { toast(bad, 'error'); return; }
    LS.set('chandem:name', name);
    const res = await emit('room:create', { name, settings, avatar: readAvatar(form) });
    if (!res.ok) return;
    S.code = res.code;
    S.session = { token: res.token, playerId: res.playerId };
    LS.set(sessKey(res.code), S.session);
    history.pushState(null, '', '/r/' + res.code);
    S.view = 'room';
    render();
  };
}

// 혼자 연습: 봇들과 바로 한 판
function renderPractice() {
  const cnt = LS.get('chandem:bots', 3);
  $app.innerHTML = `
  <main class="page">
    <header class="page-head"><button class="icon-btn" id="back" aria-label="뒤로">←</button><h1>혼자 연습하기</h1></header>
    <form id="practice-form" class="panel form">
      <p class="muted small">친구가 없어도 봇들과 바로 칠 수 있어요. 봇은 칩이 떨어지면 알아서 다시 채워요.</p>
      <label class="field"><span>닉네임</span><input class="input" name="name" maxlength="10" required value="${esc(LS.get('chandem:name', ''))}" placeholder="최대 10자"></label>
      ${avatarPickerHTML()}
      <fieldset class="fieldset"><legend>상대 봇 수</legend>
        <div class="seg">${[1, 2, 3, 4, 5].map((n) => `<label class="seg-opt"><input type="radio" name="bots" value="${n}" ${cnt === n ? 'checked' : ''}><span>${n}명</span></label>`).join('')}</div>
      </fieldset>
      <fieldset class="fieldset"><legend>시작 칩 · 블라인드</legend>
        <div class="seg">${[[1000, 10, 20], [5000, 25, 50], [10000, 50, 100]].map(([c, sb, bb], i) => `<label class="seg-opt"><input type="radio" name="level" value="${i}" ${i === 0 ? 'checked' : ''}><span>${fmt(c)}<small>${sb}/${bb}</small></span></label>`).join('')}</div>
      </fieldset>
      <button class="btn btn-gold btn-lg" type="submit">연습 시작</button>
    </form>
  </main>`;
  $app.querySelector('#back').onclick = () => { S.view = 'home'; render(); };
  const form = $app.querySelector('#practice-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
    const bots = Number(fd.get('bots')) || 3;
    const [startChips, sb, bb] = [[1000, 10, 20], [5000, 25, 50], [10000, 50, 100]][Number(fd.get('level')) || 0];
    LS.set('chandem:name', name);
    LS.set('chandem:bots', bots);
    const settings = { ...DEFAULTS, startChips, sb, bb, rebuyAmount: startChips, rebuyMax: 99 };
    const res = await emit('room:practice', { name, bots, settings, avatar: readAvatar(form) });
    if (!res.ok) return;
    S.code = res.code;
    S.session = { token: res.token, playerId: res.playerId };
    LS.set(sessKey(res.code), S.session);
    history.pushState(null, '', '/r/' + res.code);
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
        ${d.hasPassword ? '<label class="field"><span>비밀번호</span><input class="input" name="password" maxlength="20" required autocomplete="off"></label>' : ''}
        ${avatarPickerHTML()}
        <label class="switch"><input type="checkbox" name="spectator"><span>관전만 할래요</span></label>
        ${d.approval ? '<p class="muted small">방장이 승인하면 들어갈 수 있어요.</p>' : ''}
        <button class="btn btn-gold btn-lg" type="submit">참가하기</button>
      </form>`}
      <button class="btn btn-ghost" id="home">처음 화면으로</button>
    </section>
  </main>`;
  $app.querySelector('#home').onclick = () => { history.pushState(null, '', '/'); S.code = null; S.view = 'home'; render(); };
  const form = $app.querySelector('#join-form');
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) { toast('닉네임을 입력해 주세요', 'error'); return; }
    LS.set('chandem:name', name);
    const res = await emit('room:join', { code: d.code, name, password: fd.get('password') || '', spectator: fd.get('spectator') === 'on', avatar: readAvatar(form) });
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
    history.pushState(null, '', '/');
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
  $app.querySelector('#home').onclick = () => { history.pushState(null, '', '/'); S.code = null; S.view = 'home'; render(); };
}

// ── 대기실 ───────────────────────────────────────────
function statusBadges(p, st) {
  const b = [];
  if (p.isHost) b.push('<span class="badge badge-gold">방장</span>');
  if (p.isBot) b.push('<span class="badge">🤖 봇</span>');
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
    b.onclick = () => shareLink(url, '찬덤 홀덤 초대', `찬덤 홀덤 방 ${code}에 들어와!`);
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
      <button class="icon-btn" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? '🔇' : '🔊'}</button>
      <button class="btn btn-sm btn-ghost" id="chart-btn">족보표</button>
    </header>
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
      ${isHost && players.length < s.maxPlayers ? '<button class="btn btn-sm btn-outline add-bot" id="add-bot">🤖 봇 추가</button>' : ''}
      ${specs.length ? `<h3 class="sub-title">관전자 ${specs.length}명</h3><div class="plist">${specs.map((p) => playerRowHTML(p, st, isHost)).join('')}</div>` : ''}
    </section>
    <section class="panel">
      <div class="sec-head"><h2 class="sec-title">방 설정</h2>${isHost ? '<button class="btn btn-sm btn-outline" id="edit-settings">설정 바꾸기</button>' : ''}</div>
      ${settingsSummaryHTML(s)}
    </section>
    <div class="lobby-actions">
      ${me && me.role === 'player' && !isHost ? `<button class="btn btn-lg ${me.ready ? 'btn-outline' : 'btn-gold'}" id="ready">${me.ready ? '준비 취소' : '준비 완료'}</button>` : ''}
      ${isHost ? `<button class="btn btn-lg btn-gold" id="start" ${st.room.startBlocker ? 'disabled' : ''}>게임 시작</button>
        <p class="muted small center">${st.room.startBlocker ? esc(st.room.startBlocker) : '모두 준비됐어요. 시작할 수 있어요!'}</p>` : `<p class="muted small center">방장이 게임을 시작하면 바로 테이블로 이동해요.</p>`}
      <div class="row center">
        ${me ? `<button class="btn btn-sm btn-ghost" id="role">${me.role === 'player' ? '관전으로 바꾸기' : '참가자로 앉기'}</button>` : ''}
        <button class="btn btn-sm btn-ghost danger" id="leave">방 나가기</button>
      </div>
    </div>
  </main>`;
  bindInvite($app, st.room.code);
  bindCommon();
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
  const edit = $app.querySelector('#edit-settings');
  if (edit) edit.onclick = () => openSettingsModal();
}

function playerRowHTML(p, st, isHost) {
  const me = st.me && st.me.id === p.id;
  return `<div class="list-row ${me ? 'is-me' : ''}">
    ${avatarHTML(p, 'avatar-sm')}
    <div class="grow"><b>${esc(p.name)}</b>${me ? ' <span class="muted small">(나)</span>' : ''}
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

async function leaveRoom() {
  const inHand = S.state && S.state.hand && !S.state.hand.finished && S.state.players.some((p) => p.id === S.state.me?.id && ['inhand', 'allin'].includes(p.status));
  if (!confirm(inHand ? '진행 중인 판은 폴드 처리돼요. 방을 나갈까요?' : '방을 나갈까요?')) return;
  await emit('room:leave');
  LS.del(sessKey(S.code));
  S.session = null; S.state = null; S.code = null;
  history.pushState(null, '', '/');
  S.view = 'home';
  closeModal();
  render();
}

function bindCommon() {
  const chart = document.getElementById('chart-btn');
  if (chart) chart.onclick = () => openModal('족보표', handChartHTML(), null, { wide: true });
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
  if (b) b.textContent = sound.getPrefs().muted ? '🔇' : '🔊';
}

// ── 게임 테이블 ───────────────────────────────────────
// 인원수별 자리 좌표 (퍼센트). 0번은 나(아래 가운데), 이후 시계방향: 왼쪽 아래 → 위 → 오른쪽.
// 바닥 카드·팟이 있는 가운데 띠(세로 38~58%)는 비워 둔다.
const LAYOUTS = {
  1: [[50, 9]],
  2: [[18, 13], [82, 13]],
  3: [[9, 30], [50, 9], [91, 30]],
  4: [[9, 34], [30, 9], [70, 9], [91, 34]],
  5: [[9, 66], [9, 28], [50, 8], [91, 28], [91, 66]],
  6: [[9, 68], [9, 30], [30, 8], [70, 8], [91, 30], [91, 68]],
  7: [[15, 87], [9, 62], [9, 29], [50, 8], [91, 29], [91, 62], [85, 87]],
  8: [[15, 87], [9, 63], [9, 32], [29, 8], [71, 8], [91, 32], [91, 63], [85, 87]],
};
function seatPositions(n) {
  const others = LAYOUTS[Math.max(1, Math.min(8, n - 1))];
  return [{ x: 50, y: 90 }, ...others.map(([x, y]) => ({ x, y }))];
}

function mountGame() {
  $app.innerHTML = `
  <div class="game">
    <header class="g-top" id="g-top"></header>
    <div class="g-banner" id="g-banner"></div>
    <div class="table-wrap"><div class="table" id="g-table"></div>
      <button class="emote-fab" id="emote-btn" aria-label="감정 표현 보내기">😀</button>
      <div class="emote-tray" id="emote-tray" hidden>${EMOTES.map(([k, e, t]) => `<button data-emote="${k}" aria-label="${t}"><span>${e}</span><small>${t}</small></button>`).join('')}</div>
    </div>
    <div id="fx-layer" aria-hidden="true"></div>
    <section class="g-me" id="g-me"></section>
    <section class="g-actions" id="g-actions"></section>
  </div>`;
  S.gameMounted = true;
  S.actionSig = '';
  const tray = document.getElementById('emote-tray');
  document.getElementById('emote-btn').onclick = (e) => { e.stopPropagation(); tray.hidden = !tray.hidden; };
  tray.querySelectorAll('[data-emote]').forEach((b) => {
    b.onclick = () => { tray.hidden = true; emit('game:emote', { kind: b.dataset.emote }); };
  });
}

function renderGame() {
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
    <button class="icon-btn share-icon" id="share-top" aria-label="초대 링크 공유">🔗</button>
    <button class="btn btn-sm btn-ghost" id="chart-btn">족보표</button>
    <button class="icon-btn" id="log-btn" aria-label="베팅 내역">📜</button>
    <button class="icon-btn" id="sound-btn" aria-label="소리 설정">${sound.getPrefs().muted ? '🔇' : '🔊'}</button>
    <button class="icon-btn" id="menu-btn" aria-label="메뉴">☰${pendingCount ? `<span class="dot">${pendingCount}</span>` : ''}</button>`;
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
    if (me.sittingOut) msgs.push(['warn', '자리 비움 상태예요. 다음 판부터 빠져요', '<button class="btn btn-sm btn-gold" id="sitin-btn">자리로 돌아가기</button>']);
  }
  if (st.room.waiting) msgs.push(['info', '카드를 받을 수 있는 참가자가 2명 이상이 되면 다음 판이 시작돼요']);
  el.innerHTML = msgs.map(([k, t, btn]) => `<div class="banner banner-${k}"><span>${esc(t)}</span>${btn || ''}</div>`).join('');
  const rb = el.querySelector('#rebuy-btn');
  if (rb) rb.onclick = async () => { const r = await emit('game:rebuy'); if (r.ok) toast('리바인 신청 완료! 다음 판부터 적용돼요', 'ok'); };
  const si = el.querySelector('#sitin-btn');
  if (si) si.onclick = () => emit('game:sitin');
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
  const pos = seatPositions(Math.max(seats.length, 2));
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
      return `<div class="bet" style="left:${bx}%;top:${by}%"><span class="chip-icon"></span><b>${fmt(p.bet)}</b></div>`;
    })() : '';
    return `
      <div class="${cls.join(' ')}" data-id="${p.id}" style="left:${x}%;top:${y}%">
        ${cards}
        <div class="seat-body">
          <div class="seat-av">${avatarHTML(p)}<div class="seat-pos">${pos2.join('')}</div>
            ${p.isTurn ? '<svg class="ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="20" data-ring></circle></svg>' : ''}</div>
          <div class="seat-name">${esc(p.name)}${p.isHost ? ' <span class="crown" title="방장">★</span>' : ''}</div>
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
          size: 'md', anim: fresh && !slow, delay: (i < 3 && !slow ? i : 0) * 120,
          cls: slow ? (i === 4 ? 'card-squeeze' : 'card-flip-slow') : '',
          highlight: winBest && winBest.has(c), dim: winBest && !winBest.has(c),
        }));
      } else if (rv && rv.squeeze && i === h.board.length) {
        board.push(cardHTML('??', { size: 'md', cls: 'card-squeeze-wait' }));
      } else board.push(cardHTML(null, { size: 'md' }));
    }
    const potText = `팟 ${fmt(h.totalPot)}`;
    const sidePots = h.pots && h.pots.length > 1
      ? `<div class="side-pots">${h.pots.map((pt, i) => `<span>${i === 0 ? '메인' : `사이드${i}`} ${fmt(pt.amount)}</span>`).join('')}</div>` : '';
    center = `
      <div class="table-center">
        <div class="stage-lbl ${h.stage === 'allin' ? 'stage-allin' : ''}">${{ preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운', allin: '🔥 올인 승부' }[h.stage] || ''}</div>
        <div class="board">${board.join('')}</div>
        <div class="pot"><span class="chip-icon pot-chip"></span><b>${potText}</b></div>
        ${sidePots}
        ${result ? resultHTML(st, result) : ''}
      </div>`;
  } else {
    center = `<div class="table-center"><div class="table-brand">찬덤</div><p class="muted small">${st.room.waiting ? '참가자를 기다리는 중' : '곧 시작해요'}</p></div>`;
  }
  el.innerHTML = `<div class="felt"><div class="felt-rail"></div>${center}${seatHTML}</div>`;
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
  if (r.type === 'fold') {
    return `<div class="result"><div class="result-title">🏆 ${names}</div><p>다른 사람이 모두 폴드해서 팟을 가져갔어요</p>${nextIn}</div>`;
  }
  const w = r.hands[r.winners[0]];
  const split = r.winners.length > 1;
  return `<div class="result">
    <div class="result-title">🏆 ${names}${split ? ' <span class="small">(나눠 가짐)</span>' : ''}</div>
    <div class="result-hand">${esc(w ? w.name : '')}</div>
    ${w ? `<div class="result-cards">${cardsHTML(w.best, { size: 'sm' })}</div>` : ''}
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
    el.innerHTML = `<div class="me-spec"><span>관전 중이에요</span><button class="btn btn-sm btn-outline" id="sit-btn">참가자로 앉기</button></div>`;
    el.querySelector('#sit-btn').onclick = () => emit('lobby:role', { spectator: false });
    return;
  }
  const h = st.hand;
  const cards = mp.cards && mp.cards[0] !== '??' ? mp.cards : null;
  let handName = '';
  if (cards && h) {
    const all = cards.concat(h.board);
    if (all.length >= 5) handName = bestHand(all).name;
    else handName = cards[0][0] === cards[1][0] ? '포켓 페어' : '';
  }
  const result = h && h.result;
  const delta = result && result.deltas ? result.deltas[me.id] : undefined;
  el.innerHTML = `
    <div class="me-cards ${mp.status === 'folded' ? 'folded' : ''}">
      ${cards ? cards.map((c, k) => cardHTML(c, { size: 'lg', anim: markCard(`${h.no}:me:${k}`), delay: k * 120, highlight: result && result.hands && result.hands[me.id] && result.hands[me.id].best.includes(c) })).join('') : `<span class="muted">${st.room.phase === 'playing' ? '이번 판은 쉬는 중이에요' : ''}</span>`}
    </div>
    <div class="me-info">
      <div class="me-name">${avatarHTML(mp, 'avatar-sm')}<b>${esc(me.name)}</b>${mp.isDealer ? '<span class="dealer-btn">D</span>' : ''}</div>
      <div class="me-stack"><span class="chip-icon"></span><b>${fmt(me.stack)}</b><span class="muted small">내 칩</span></div>
      ${mp.bet ? `<div class="muted small">이번 베팅 ${fmt(mp.bet)}</div>` : ''}
      ${handName ? `<div class="me-hand">${esc(handName)}</div>` : ''}
      ${mp.status === 'folded' ? '<div class="tag tag-folded">폴드함</div>' : ''}
      ${mp.status === 'allin' ? '<div class="tag tag-allin">올인</div>' : ''}
      ${delta !== undefined ? `<div class="me-delta ${delta > 0 ? 'plus' : delta < 0 ? 'minus' : ''}">이번 판 ${signed(delta)}</div>` : ''}
    </div>`;
}

function renderActions(st) {
  const el = document.getElementById('g-actions');
  const h = st.hand;
  const la = h && h.legal;
  const sig = JSON.stringify([la, h && h.toActId, h && h.finished, !!(h && h.result), S.raise.open, h && h.no, st.room.nextHandAt]);
  if (sig === S.actionSig) return;
  S.actionSig = sig;

  if (!h || h.finished) {
    S.raise.open = false;
    el.innerHTML = h && h.finished && !h.result
      ? `<div class="wait-line reveal-line">${h.reveal && h.reveal.allin ? '🔥 올인 승부! 카드를 한 장씩 공개하고 있어요' : '🃏 패를 공개하고 있어요'}</div>`
      : h && h.finished
      ? `<div class="wait-line"><span data-next>다음 판을 준비하고 있어요</span></div>`
      : `<div class="wait-line">${st.room.waiting ? '참가자를 기다리는 중이에요' : '곧 카드를 나눠 드려요'}</div>`;
    return;
  }
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

  el.innerHTML = `
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

async function doAct(action) {
  document.querySelectorAll('#g-actions button').forEach((b) => { b.disabled = true; });
  const r = await emit('game:act', action);
  if (!r.ok) { S.actionSig = ''; renderActions(S.state); }
}

// 남은 시간 표시: 글자 + 막대 + 자리 테두리
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
        ${!inHand ? `<button class="btn btn-outline" data-m="role">${me.role === 'player' ? '관전으로 바꾸기' : '참가자로 앉기'}</button>` : ''}
        ${isHost ? '<button class="btn btn-outline" data-m="end">게임 끝내고 대기실로</button>' : ''}
        <button class="btn btn-outline danger" data-m="leave">방 나가기</button>
      </div>
    </div>`, (body) => {
    bindInvite(body, st.room.code);
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
      banner('🔥 올인 승부!', '', 'allin');
      sound.play('drumroll');
      if (navigator.vibrate && sound.isUnlocked()) navigator.vibrate([40, 40, 40]);
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
  if (navigator.vibrate && sound.isUnlocked()) navigator.vibrate([100, 50, 100]);
  setTimeout(() => el.remove(), 1900);
}

function quake() {
  const g = document.querySelector('.game');
  if (!g) return;
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
function announceHands(st, once) {
  const h = st.hand;
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
  const seat = document.querySelector(`.seat[data-id="${id}"] .seat-av`) || (S.state && S.state.me && S.state.me.id === id ? document.querySelector('.me-cards') : null);
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
function bigHand(tier, p) {
  const el = document.createElement('div');
  el.className = `fx-bighand fx-tier${tier}`;
  el.innerHTML = `<div class="fx-big-rays"></div><div class="fx-big-en">${BIG_EN[tier]}</div><div class="fx-big-ko">${HAND_TIERS[tier]}!</div><div class="fx-big-who">${esc(p.name)}</div>`;
  fxLayer().appendChild(el);
  sound.play('boom');
  setTimeout(() => sound.play('v_h' + tier, 1.3), 380);
  setTimeout(() => { coinRain(tier >= 8 ? 70 : 36); quake(); }, 450);
  if (navigator.vibrate && sound.isUnlocked()) navigator.vibrate([60, 40, 200]);
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
  const el = banner(iWon ? '🏆 내가 이겼다!' : `🏆 ${names} 승리`, `<span class="fx-hand">${handName}</span><b class="fx-amt">+0</b>`, iWon ? 'mywin' : 'win', big ? 2600 : 1800);
  countUp(el.querySelector('.fx-amt'), gain);
  if (iWon) {
    coinRain(huge ? 70 : 44);
    const flash = document.createElement('div');
    flash.className = 'fx-flash';
    fxLayer().appendChild(flash);
    setTimeout(() => flash.remove(), 900);
    if (navigator.vibrate && sound.isUnlocked()) navigator.vibrate([80, 60, 140]);
  }
}

// 뒤로가기: 방 안에서는 바로 나가지 않고 물어본다
window.addEventListener('popstate', () => {
  if (S.view === 'room' && S.state) { history.pushState(null, '', '/r/' + S.code); goHome(); return; }
  if (['create', 'practice'].includes(S.view)) { S.view = 'home'; render(); return; }
  S.state = null; boot();
});
// 로고(찬덤)를 누르면 메인으로
document.addEventListener('click', (e) => {
  if (e.target.closest('.logo') && S.view !== 'home') goHome();
});

function goHome() {
  if (S.view !== 'room' || !S.state) {
    S.code = null; S.view = 'home';
    history.pushState(null, '', '/');
    render();
    return;
  }
  const st = S.state;
  const inHand = st.hand && !st.hand.finished && st.players.some((p) => p.id === st.me?.id && ['inhand', 'allin'].includes(p.status));
  openModal('메인으로 갈까요?', `
    <p class="muted">${st.room.practice ? '연습 방은 나가면 사라져요.' : '방에서 나가게 돼요. 초대 링크로 다시 들어올 수 있어요.'}${inHand ? '<br>진행 중인 판은 폴드 처리돼요.' : ''}</p>
    <div class="stack">
      <button class="btn btn-gold" data-act="go">나가고 메인으로</button>
      <button class="btn btn-outline" data-act="stay">계속 있을게요</button>
    </div>`, (body) => {
    body.querySelector('[data-act="stay"]').onclick = closeModal;
    body.querySelector('[data-act="go"]').onclick = async () => {
      await emit('room:leave');
      LS.del(sessKey(S.code));
      S.session = null; S.state = null; S.code = null;
      history.pushState(null, '', '/');
      S.view = 'home';
      closeModal();
      render();
    };
  });
}
boot();

// 디버그/검증용 (자동 테스트에서 상태 확인)
window.__chandem = { S, cardName, sound, fx: { allinStamp, bigHand, handTag, goHome } };
