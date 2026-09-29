// 사이트 공용 화면: 공지 · 출석 체크 · 설정 · 계정 관리 · 건의/버그 신고 · 도움말 · 마스터 관리실
import * as settings from './settings.js';

let C = null; // app.js 가 넘겨주는 도구들 { S, openModal, closeModal, toast, esc, fmt, render, loadMe, openLogin, setAuth, logout, sound, LS, app }
export function init(ctx) { C = ctx; }

const esc = (s) => C.esc(s);
const fmt = (n) => C.fmt(n);
const fmtDate = (t) => new Date(Number(t)).toLocaleString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDay = (t) => new Date(Number(t)).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
const para = (t) => esc(t).replace(/\n/g, '<br>');
const COIN = '<i class="coin-ico" aria-hidden="true"></i>';
const loggedIn = () => !!(C.S.user && C.S.auth);
const accountsOn = () => !(C.S.info && C.S.info.accounts === false);

async function call(method, url, body) {
  const headers = { 'content-type': 'application/json' };
  if (C.S.auth) headers.authorization = 'Bearer ' + C.S.auth;
  try {
    const r = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    const j = await r.json().catch(() => ({ ok: false, message: '서버 응답을 읽지 못했어요' }));
    return { status: r.status, ...j };
  } catch { return { ok: false, message: '서버와 연결할 수 없어요' }; }
}
const site = { get: (p) => call('GET', '/api/site' + p), post: (p, b) => call('POST', '/api/site' + p, b || {}) };
const admin = {
  get: (p) => call('GET', '/api/admin' + p),
  post: (p, b) => call('POST', '/api/admin' + p, b || {}),
  put: (p, b) => call('PUT', '/api/admin' + p, b || {}),
  del: (p) => call('DELETE', '/api/admin' + p),
};

// ── 마스터 표시 ─────────────────────────────────────
export const masterBadge = (on, small = false) => (on ? `<span class="mbadge ${small ? 'mbadge-sm' : ''}" title="마스터(운영자)">👑${small ? '' : ' MASTER'}</span>` : '');

const needLoginHTML = (what = '') => `<div class="need-login"><p>🔒 ${what ? esc(what) + ' — ' : ''}로그인하면 쓸 수 있어요</p>
  ${accountsOn() ? '<button class="btn btn-gold" data-login>로그인 / 회원가입</button>' : '<p class="muted small">로그인 기능이 켜지면 쓸 수 있어요</p>'}</div>`;
function bindNeedLogin(body) { const b = body.querySelector('[data-login]'); if (b) b.onclick = () => C.openLogin(); }

// ── 허브(메인) 조각 ─────────────────────────────────
export function topIconsHTML() {
  return `<button class="icon-btn hub-ico" id="bell-btn" aria-label="공지사항">🔔<span class="ping" ${hasUnread() ? '' : 'hidden'}></span></button>
    <button class="icon-btn hub-ico" id="gear-btn" aria-label="설정">⚙️</button>`;
}
export function hubExtrasHTML() {
  const S = C.S;
  const m = S.info && S.info.maintenance;
  const ck = S.checkin;
  const ckSub = !loggedIn() ? '로그인하고 받기' : !ck ? '확인 중…' : ck.claimed ? `${ck.streak}일 연속 ✓` : `코인 ${fmt(ck.reward)} 받기!`;
  const ckReady = loggedIn() && ck && !ck.claimed;
  return `
    ${m && m.on ? `<div class="maint-banner" role="status"><b>🛠️ 점검 중이에요</b><span>${esc(m.message || '잠시 후 더 좋아져서 돌아올게요!')}</span><small>새 방 만들기만 잠시 쉬어요 · 열린 방은 그대로 놀 수 있어요</small></div>` : ''}
    <nav class="quick" aria-label="바로가기">
      <button class="quick-item ${ckReady ? 'is-ready' : ''}" id="q-checkin"><span class="qi-ico">📅</span><b>출석 체크</b><small>${esc(ckSub)}</small>${ckReady ? '<span class="qi-dot">받기</span>' : ''}</button>
      <button class="quick-item" id="q-notice"><span class="qi-ico">📢</span><b>공지사항</b><small>${S.notices && S.notices[0] ? esc(S.notices[0].title) : '새 소식'}</small>${hasUnread() ? '<span class="qi-dot new">N</span>' : ''}</button>
      <button class="quick-item" id="q-feedback"><span class="qi-ico">💌</span><b>건의·신고</b><small>의견 보내기</small></button>
      <button class="quick-item" id="q-help"><span class="qi-ico">❓</span><b>도움말</b><small>이용 안내</small></button>
    </nav>
    ${S.user && S.user.isMaster ? '<button class="btn btn-master btn-lg" id="q-admin">👑 마스터 관리실</button>' : ''}`;
}
export function bindHub(root) {
  const on = (sel, fn) => { const el = root.querySelector(sel); if (el) el.onclick = fn; };
  on('#bell-btn', openNotices);
  on('#gear-btn', openSettings);
  on('#q-checkin', openCheckin);
  on('#q-notice', openNotices);
  on('#q-feedback', () => openFeedback());
  on('#q-help', openHelp);
  on('#q-admin', () => { C.S.view = 'admin'; C.S.adminTab = C.S.adminTab || 'notices'; C.render(); });
}
// 메인 화면을 그린 뒤: 공지·출석 상태를 받아 와서 점만 갱신 (화면 전체를 다시 그리지 않음)
let hubLoadAt = 0, hubLoadKey = null;
export async function afterHome() {
  // 로그인 상태가 바뀌었으면 바로 다시 받고, 아니면 4초 안에 또 부르지 않는다
  const key = (C.S.auth || '') + ':' + (C.S.user ? C.S.user.id : '');
  if (key === hubLoadKey && Date.now() - hubLoadAt < 4000) { refreshHubBits(); return; }
  hubLoadAt = Date.now(); hubLoadKey = key;
  const [n, c] = await Promise.all([
    site.get('/notices'),
    loggedIn() ? site.get('/checkin') : Promise.resolve(null),
  ]);
  if (n && n.ok) C.S.notices = n.notices;
  C.S.checkin = c && c.ok ? c.checkin : null;
  refreshHubBits();
  maybePopupNotice();
}
function refreshHubBits() {
  if (C.S.view !== 'home') return;
  const box = document.getElementById('hub-extras');
  if (box) { box.innerHTML = hubExtrasHTML(); bindHub(box); }
  const ping = document.querySelector('#bell-btn .ping');
  if (ping) ping.hidden = !hasUnread();
}

// ── 공지사항 ─────────────────────────────────────────
const seenAt = () => Number(C.LS.get('gw:noticeSeenAt', 0)) || 0;
const noticeTime = (n) => Math.max(n.createdAt || 0, n.updatedAt || 0);
function hasUnread() { return (C.S.notices || []).some((n) => noticeTime(n) > seenAt()); }
function markSeen() {
  const latest = Math.max(0, ...(C.S.notices || []).map(noticeTime));
  if (latest) C.LS.set('gw:noticeSeenAt', latest);
}
function maybePopupNotice() {
  if (!settings.get('popups') || C.S.view !== 'home' || document.querySelector('#modal-root .modal')) return;
  const imp = (C.S.notices || []).filter((n) => n.important).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (!imp) return;
  const key = `${imp.id}:${imp.updatedAt}`;
  const popped = C.LS.get('gw:noticePopped', []);
  if (popped.includes(key)) return;
  C.LS.set('gw:noticePopped', [key, ...popped].slice(0, 20));
  openNoticeDetail(imp, { popup: true });
}
function noticeItemHTML(n) {
  const unread = noticeTime(n) > seenAt();
  return `<button class="notice-item" data-nid="${esc(n.id)}">
    ${n.important ? '<span class="n-tag">중요</span>' : '<span class="n-tag n-tag-plain">공지</span>'}
    <span class="n-main"><b>${esc(n.title)}</b><small>${fmtDate(n.createdAt)}${n.updatedAt > n.createdAt + 1000 ? ' · 수정됨' : ''}</small></span>
    ${unread ? '<span class="n-new">N</span>' : ''}<span class="n-go">›</span></button>`;
}
export async function openNotices() {
  C.openModal('📢 공지사항', '<p class="muted">불러오는 중…</p>');
  const r = await site.get('/notices');
  if (r.ok) C.S.notices = r.notices;
  const list = C.S.notices || [];
  const body = document.querySelector('#modal-root .modal-body');
  if (!body) return;
  body.innerHTML = list.length ? `<div class="notice-list">${list.map(noticeItemHTML).join('')}</div>` : '<div class="empty-note">📭<p>아직 공지가 없어요</p></div>';
  body.querySelectorAll('[data-nid]').forEach((b) => { b.onclick = () => openNoticeDetail(list.find((n) => n.id === b.dataset.nid)); });
  markSeen();
  refreshHubBits();
}
function openNoticeDetail(n, { popup = false } = {}) {
  if (!n) return;
  C.openModal(popup ? '📢 새 공지' : '📢 공지사항', `
    <article class="notice-detail">
      ${n.important ? '<span class="n-tag">중요</span>' : ''}
      <h3>${esc(n.title)}</h3>
      <p class="muted small">${fmtDate(n.createdAt)}${n.author ? ` · ${esc(n.author)}` : ''}${n.updatedAt > n.createdAt + 1000 ? ` · ${fmtDate(n.updatedAt)} 수정` : ''}</p>
      <div class="notice-body">${para(n.body)}</div>
    </article>
    <div class="row">
      ${popup ? '<button class="btn btn-gold grow" data-close>확인했어요</button>' : '<button class="btn btn-outline grow" id="n-back">‹ 목록</button>'}
    </div>
    ${popup ? '<p class="muted tiny center">알림 팝업은 ⚙️ 설정에서 끌 수 있어요</p>' : ''}`, (body) => {
    const back = body.querySelector('#n-back');
    if (back) back.onclick = openNotices;
    body.querySelectorAll('[data-close]').forEach((b) => { b.onclick = C.closeModal; });
  });
  if (popup) { markSeen(); refreshHubBits(); }
}

// ── 출석 체크 ─────────────────────────────────────────
export async function openCheckin() {
  if (!loggedIn()) { C.openModal('📅 출석 체크', `${needLoginHTML()}<p class="muted small center">매일 들어오면 랑방 코인을 받아요. 7일째엔 ${COIN} 300!</p>`, bindNeedLogin); return; }
  C.openModal('📅 출석 체크', '<p class="muted">불러오는 중…</p>');
  const r = await site.get('/checkin');
  if (!r.ok) { C.toast(r.message || '다시 해 주세요', 'error'); C.closeModal(); return; }
  C.S.checkin = r.checkin;
  drawCheckin();
}
function drawCheckin(justGot = 0) {
  const ck = C.S.checkin;
  const body = document.querySelector('#modal-root .modal-body');
  if (!body || !ck) return;
  body.innerHTML = `
    <div class="ck-head"><div><b>${ck.claimed ? `${ck.streak}일 연속 출석 중! 🔥` : ck.streak ? `${ck.streak}일 연속 · 오늘도 받아 가요` : '오늘부터 출석 시작!'}</b>
      <small class="muted">하루 한 번(한국 시간 자정에 초기화) · 빠지면 1일차부터 · 누적 ${fmt(ck.total)}일</small></div></div>
    <ol class="ck-grid">${ck.days.map((d) => `
      <li class="ck-day ck-${d.state} ${d.day === 7 ? 'ck-big' : ''} ${justGot && d.day === ck.day ? 'ck-pop' : ''}">
        <span class="ck-n">${d.day}일</span><span class="ck-coin">${COIN}</span><b>${fmt(d.coins)}</b>
        ${d.state === 'done' ? '<span class="ck-stamp">출석</span>' : ''}</li>`).join('')}</ol>
    ${ck.claimed
      ? `<button class="btn btn-outline btn-lg" disabled>오늘은 받았어요 · 내일 또 와요!</button>`
      : `<button class="btn btn-gold btn-lg" id="ck-go">오늘 출석하고 ${COIN} ${fmt(ck.reward)} 받기</button>`}
    <p class="muted small center">받은 코인은 🥊 랑방 대전에서 캐릭터 강화·아이템에 쓸 수 있어요</p>`;
  const go = body.querySelector('#ck-go');
  if (go) go.onclick = async () => {
    go.disabled = true;
    const r = await site.post('/checkin');
    if (!r.ok) { C.toast(r.message || '다시 해 주세요', 'error'); go.disabled = false; return; }
    C.S.checkin = r.checkin;
    if (r.gained) { C.toast(`출석 완료! 코인 ${fmt(r.gained)} 개 받았어요 (보유 ${fmt(r.coins)})`, 'ok'); C.sound.play('coins'); }
    drawCheckin(r.gained || 0);
    refreshHubBits();
  };
}

// ── 설정 ─────────────────────────────────────────────
export function openSettings() {
  const p = C.sound.getPrefs();
  const s = settings.all();
  const sw = (id, on, label, sub = '') => `<label class="set-row"><span><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" class="toggle" id="${id}" ${on ? 'checked' : ''}></label>`;
  C.openModal('⚙️ 설정', `
    <section class="set-group"><h3>🔊 소리</h3>
      ${sw('st-music', p.music, '배경음악')}
      <label class="set-slider"><span>배경음악 크기 <b id="st-mv">${Math.round(p.musicVolume * 100)}%</b></span><input type="range" id="st-mvol" min="0" max="100" value="${Math.round(p.musicVolume * 100)}"></label>
      ${sw('st-sfx', !p.muted, '효과음 · 음성')}
      <label class="set-slider"><span>효과음 크기 <b id="st-sv">${Math.round(p.volume * 100)}%</b></span><input type="range" id="st-svol" min="0" max="100" value="${Math.round(p.volume * 100)}"></label>
    </section>
    <section class="set-group"><h3>📱 화면 · 알림</h3>
      ${sw('st-vib', s.vibrate, '진동', '내 차례가 오면 살짝 진동')}
      ${sw('st-pop', s.popups, '알림 팝업', '중요 공지를 처음 한 번 띄워 줘요')}
      ${sw('st-rm', s.reduceMotion, '화면 흔들림 줄이기', '흔들림·번쩍이는 연출을 줄여요')}
    </section>
    <section class="set-group"><h3>👤 계정</h3>
      ${loggedIn() ? `<button class="set-link" id="st-acct"><span>계정 관리</span><small>${esc(C.S.user.nickname)} · 닉네임·비밀번호·탈퇴</small><i>›</i></button>`
        : `<div class="set-note">로그인하면 쓸 수 있어요 ${accountsOn() ? '<button class="btn btn-sm btn-gold" data-login>로그인</button>' : ''}</div>`}
    </section>
    <section class="set-group"><h3>💁 도움</h3>
      <button class="set-link" id="st-fb"><span>건의 · 버그 신고</span><i>›</i></button>
      <button class="set-link" id="st-help"><span>도움말 · 이용 안내</span><i>›</i></button>
      <button class="set-link" id="st-priv"><span>개인정보 안내</span><i>›</i></button>
    </section>
    <p class="muted tiny center">설정은 이 기기에만 저장돼요 · 찬이의 게임월드</p>`, (body) => {
    const $ = (id) => body.querySelector('#' + id);
    $('st-music').onchange = (e) => { C.sound.unlock(); C.sound.setMusic(e.target.checked); };
    $('st-mvol').oninput = (e) => { C.sound.setMusicVolume(e.target.value / 100); $('st-mv').textContent = e.target.value + '%'; };
    $('st-sfx').onchange = (e) => { C.sound.setMuted(!e.target.checked); if (e.target.checked) { C.sound.unlock(); C.sound.play('chips'); } };
    $('st-svol').oninput = (e) => { C.sound.setVolume(e.target.value / 100); $('st-sv').textContent = e.target.value + '%'; };
    $('st-svol').onchange = () => { C.sound.unlock(); C.sound.play('chips'); };
    $('st-vib').onchange = (e) => { settings.set('vibrate', e.target.checked); if (e.target.checked) settings.vibrate(40); };
    $('st-pop').onchange = (e) => settings.set('popups', e.target.checked);
    $('st-rm').onchange = (e) => settings.set('reduceMotion', e.target.checked);
    const a = $('st-acct'); if (a) a.onclick = openAccount;
    bindNeedLogin(body);
    $('st-fb').onclick = () => openFeedback();
    $('st-help').onclick = openHelp;
    $('st-priv').onclick = openPrivacy;
  });
}

// ── 계정 관리 ─────────────────────────────────────────
export function openAccount() {
  if (!loggedIn()) { C.openModal('👤 계정 관리', needLoginHTML(), bindNeedLogin); return; }
  const u = C.S.user;
  C.openModal('👤 계정 관리', `
    <div class="acct-head"><b>${esc(u.nickname)}</b>${masterBadge(u.isMaster)}<span class="muted small">@${esc(u.username)} · ${fmtDay(u.createdAt)} 가입</span></div>
    <form class="acct-sec" id="f-nick">
      <h3>닉네임 바꾸기</h3>
      <div class="row"><input class="input grow" name="nickname" maxlength="10" required value="${esc(u.nickname)}" autocomplete="off"><button class="btn btn-gold">바꾸기</button></div>
      <p class="muted tiny">최대 10자 · 다른 사람과 겹치면 안 돼요 · 하루에 한 번 바꿀 수 있어요</p>
    </form>
    <form class="acct-sec" id="f-pw">
      <h3>비밀번호 바꾸기</h3>
      <input type="text" name="username" value="${esc(u.username)}" autocomplete="username" hidden>
      <input class="input" type="password" name="current" required placeholder="지금 비밀번호" autocomplete="current-password" maxlength="64">
      <input class="input" type="password" name="next" required placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password" maxlength="64">
      <input class="input" type="password" name="next2" required placeholder="새 비밀번호 한 번 더" autocomplete="new-password" maxlength="64">
      <button class="btn btn-outline">비밀번호 바꾸기</button>
      <p class="muted tiny">바꾸면 다른 기기에서는 로그아웃돼요</p>
    </form>
    <form class="acct-sec" id="f-rc">
      <h3>🔐 복구 코드 <small class="muted" id="rc-state"></small></h3>
      <p class="muted tiny">비밀번호를 잊었을 때 아이디 + 복구 코드로 새 비밀번호를 정할 수 있어요. 새로 받으면 예전 코드는 못 써요.</p>
      <input type="text" name="username" value="${esc(u.username)}" autocomplete="username" hidden>
      <div class="row"><input class="input grow" type="password" name="password" required placeholder="확인용 지금 비밀번호" autocomplete="current-password" maxlength="64"><button class="btn btn-outline">새 코드 받기</button></div>
    </form>
    <div class="acct-sec">
      <h3>로그아웃</h3>
      <div class="row"><button class="btn btn-outline grow" id="a-logout">이 기기에서 로그아웃</button><button class="btn btn-outline grow" id="a-logout-all">모든 기기에서 로그아웃</button></div>
    </div>
    <details class="acct-sec acct-danger">
      <summary>회원 탈퇴</summary>
      <p class="small">탈퇴하면 계정과 모든 전적(홀덤·섯다·오목·랑방 대전 기록과 코인)이 <b>바로 지워지고 되돌릴 수 없어요.</b></p>
      <form id="f-del" class="stack">
        <input class="input" type="password" name="password" required placeholder="확인을 위해 비밀번호 입력" autocomplete="current-password">
        <button class="btn btn-danger">탈퇴하기</button>
      </form>
    </details>`, (body) => {
    body.querySelector('#f-nick').onsubmit = async (e) => {
      e.preventDefault();
      const r = await site.post('/account/nickname', { nickname: new FormData(e.target).get('nickname') });
      if (!r.ok) { C.toast(r.message, 'error'); return; }
      C.S.user = r.user; C.LS.set('chandem:name', r.user.nickname);
      C.toast(`이제 '${r.user.nickname}'(으)로 보여요!`, 'ok');
      openAccount();
    };
    body.querySelector('#f-pw').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (fd.get('next') !== fd.get('next2')) { C.toast('새 비밀번호가 서로 달라요', 'error'); return; }
      const r = await site.post('/account/password', { current: fd.get('current'), next: fd.get('next') });
      if (!r.ok) { C.toast(r.message, 'error'); return; }
      C.S.auth = r.token; C.LS.set('chandem:auth', r.token);
      C.toast('비밀번호를 바꿨어요. 다른 기기는 로그아웃됐어요', 'ok');
      e.target.reset();
    };
    const rcState = body.querySelector('#rc-state');
    site.get('/account/recovery').then((r) => { if (r.ok && rcState) rcState.textContent = r.hasCode ? `· ${fmtDay(r.issuedAt)} 받음` : '· 아직 없어요'; });
    body.querySelector('#f-rc').onsubmit = async (e) => {
      e.preventDefault();
      const r = await site.post('/account/recovery', { password: new FormData(e.target).get('password') });
      if (!r.ok) { C.toast(r.message, 'error'); return; }
      C.showRecoveryCode(r.code);
    };
    body.querySelector('#a-logout').onclick = () => { C.logout(); C.toast('로그아웃했어요'); };
    body.querySelector('#a-logout-all').onclick = async () => {
      if (!confirm('이 기기를 포함해 모든 기기에서 로그아웃할까요?')) return;
      const r = await site.post('/account/logout-all');
      if (!r.ok) { C.toast(r.message, 'error'); return; }
      C.logout();
      C.toast('모든 기기에서 로그아웃했어요', 'ok');
    };
    body.querySelector('#f-del').onsubmit = async (e) => {
      e.preventDefault();
      if (!confirm('정말 탈퇴할까요? 되돌릴 수 없어요.')) return;
      const r = await site.post('/account/delete', { password: new FormData(e.target).get('password') });
      if (!r.ok) { C.toast(r.message, 'error'); return; }
      C.logout();
      C.toast('탈퇴했어요. 그동안 함께해 줘서 고마워요 🙏', 'ok');
    };
  });
}

// ── 건의 · 버그 신고 ──────────────────────────────────
const FB_CATS = [['bug', '🐞 버그'], ['idea', '💡 건의'], ['game', '⚖️ 밸런스'], ['etc', '💬 기타']];
const FB_GAMES = [['', '선택 안 함'], ['holdem', '♠ 홀덤'], ['seotda', '🎴 섯다'], ['omok', '⚫ 오목'], ['langbang', '🥊 랑방 대전'], ['site', '🏠 사이트 전체']];
export function openFeedback(game = '') {
  C.openModal('💌 건의 · 버그 신고', `
    <form class="form" id="f-fb">
      <div class="seg fb-cats">${FB_CATS.map(([k, t], i) => `<label class="seg-opt"><input type="radio" name="category" value="${k}" ${i === 0 ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <label class="field"><span>어느 게임?</span><select class="input" name="game">${FB_GAMES.map(([k, t]) => `<option value="${k}" ${k === game ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>내용 <b id="fb-count">0 / 500</b></span>
        <textarea class="input fb-text" name="text" maxlength="500" rows="6" required placeholder="어떤 일이 있었는지, 어떻게 바뀌면 좋을지 편하게 적어 주세요. 버그라면 어떤 화면에서 뭘 눌렀는지 알려 주면 금방 고쳐요!"></textarea></label>
      <button class="btn btn-gold btn-lg">보내기</button>
      <p class="muted tiny">${loggedIn() ? `${esc(C.S.user.nickname)} 이름으로 보내져요` : '로그인 안 하면 이름 없이 보내져요'} · 운영자(찬)만 볼 수 있어요</p>
    </form>`, (body) => {
    const f = body.querySelector('#f-fb');
    const ta = f.querySelector('textarea');
    ta.oninput = () => { body.querySelector('#fb-count').textContent = `${ta.value.length} / 500`; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(f);
      const r = await site.post('/feedback', { category: fd.get('category'), game: fd.get('game') || null, text: fd.get('text') });
      if (!r.ok) { C.toast(r.message, 'error'); return; }
      C.openModal('💌 보냈어요', '<div class="empty-note">💌<p><b>고마워요!</b><br>잘 읽어 보고 더 재밌게 만들게요.</p><button class="btn btn-gold btn-lg" data-close>확인</button></div>', (b) => { b.querySelector('[data-close]').onclick = C.closeModal; });
    };
  });
}

// ── 도움말 · 개인정보 ──────────────────────────────────
export function openHelp() {
  C.openModal('❓ 도움말 · 이용 안내', `
    <div class="help">
      <h3>🎮 어떻게 놀아요?</h3>
      <p>메인에서 게임을 고르고 <b>친구와 방 만들기</b>를 누른 뒤, 초대 링크(또는 QR)를 친구에게 보내면 끝! 친구는 링크만 누르면 가입 없이 바로 들어와요.</p>
      <p>혼자일 땐 <b>🤖 AI와 연습하기</b>로 봇과 한 판 할 수 있어요. 🥊 랑방 대전은 혼자 하는 스테이지 디펜스 게임이에요.</p>
      <h3>🔑 로그인하면 뭐가 좋아요?</h3>
      <p>전적·승률, 오목 티어, 랑방 대전 기록·코인이 저장되고 랭킹에 올라가요. 매일 <b>📅 출석 체크</b>로 랑방 코인도 받아요.</p>
      <h3>💰 칩과 코인</h3>
      <p>게임 안의 칩과 코인은 <b>현금 가치가 없는 친목용 점수</b>예요. 입금·출금·환전·거래 기능은 없어요.</p>
      <h3>🙏 함께 지켜요</h3>
      <p>욕설·도배·다른 사람 사칭은 하지 말아 주세요. 운영자가 경고 없이 이용을 정지할 수 있어요.</p>
      <h3>📲 앱처럼 쓰기</h3>
      <p>메인 오른쪽 위 <b>📲</b>를 누르면 바탕화면에 설치할 수 있어요.</p>
      <p class="muted small">💡 이미 설치한 앱 아이콘은 앱을 지우고 다시 설치해야 새 아이콘으로 바뀌어요.</p>
      <h3>💌 문제가 생기면</h3>
      <p>⚙️ 설정 → <b>건의 · 버그 신고</b>로 알려 주세요.</p>
      <h3>🔑 아이디 · 비밀번호를 잊었어요</h3>
      <p>로그인 창 아래 <b>아이디 찾기 · 비밀번호 찾기</b>를 눌러요. 아이디는 닉네임으로 찾고, 비밀번호는 가입할 때 받은 <b>복구 코드</b>로 바꿀 수 있어요. 코드가 없으면 거기서 <b>운영자에게 요청</b>하면 임시 비밀번호를 만들어 줘요.</p>
      <button class="btn btn-outline" id="h-priv">개인정보 안내 보기 ›</button>
    </div>`, (body) => { body.querySelector('#h-priv').onclick = openPrivacy; });
}
export function openPrivacy() {
  C.openModal('🔐 개인정보 안내', `
    <div class="help">
      <p>찬이의 게임월드는 친구끼리 즐기려고 만든 작은 사이트라 <b>꼭 필요한 것만</b> 저장해요.</p>
      <h3>저장하는 것 (로그인한 경우)</h3>
      <ul>
        <li><b>아이디 · 닉네임</b></li>
        <li><b>비밀번호 · 복구 코드</b> — 원래 글자가 아니라 되돌릴 수 없게 암호화(해시)한 값만</li>
        <li><b>게임 기록</b> — 홀덤·섯다·오목 전적, 랑방 대전 진행도·코인, 출석 기록</li>
        <li>건의·신고에 직접 적은 내용</li>
      </ul>
      <h3>저장하지 않는 것</h3>
      <ul><li>실명 · 전화번호 · 이메일 · 위치 · 결제 정보</li>
        <li>프로필 사진과 소리·진동 설정은 <b>내 휴대폰에만</b> 저장돼요 (방에 있는 동안만 친구에게 보여요)</li></ul>
      <h3>지우고 싶다면</h3>
      <p>⚙️ 설정 → 계정 관리 → <b>회원 탈퇴</b>를 누르면 계정과 전적이 바로 지워져요. 로그인 없이 논 기록은 따로 남지 않아요.</p>
    </div>`);
}

// ── 방 안: 마스터 도구 ─────────────────────────────────
export const roomMasterHTML = () => (C.S.user && C.S.user.isMaster ? '<button class="btn btn-master" data-m-close>👑 운영자: 이 방 닫기</button>' : '');
export function bindRoomMaster(root, code) {
  const b = root.querySelector('[data-m-close]');
  if (b) b.onclick = async () => {
    if (!confirm(`방 ${code}을(를) 닫을까요? 안에 있는 사람은 모두 나가게 돼요.`)) return;
    const r = await admin.post(`/rooms/${encodeURIComponent(code)}/close`);
    if (!r.ok) C.toast(r.message, 'error'); else C.toast('방을 닫았어요', 'ok');
  };
}

// ── 마스터 관리실 ───────────────────────────────────
const TABS = [['notices', '📢 공지'], ['users', '👥 유저'], ['rooms', '🎲 방'], ['feedback', '💌 건의함'], ['maint', '🛠️ 점검'], ['log', '📜 기록']];
const ACTIONS = {
  'notice.create': '공지 작성', 'notice.update': '공지 수정', 'notice.delete': '공지 삭제', 'maintenance.on': '점검 켬', 'maintenance.off': '점검 끔',
  'user.password_reset': '비밀번호 초기화', 'user.ban': '이용 정지', 'user.unban': '정지 해제', 'user.nickname': '닉네임 변경', 'user.coins': '코인 조정',
  'user.reset_stats': '전적 초기화', 'room.close': '방 닫기', 'room.kick': '내보내기', 'feedback.done': '건의 처리', 'feedback.delete': '건의 삭제',
};
const CAT_NAME = { bug: '🐞 버그', idea: '💡 건의', game: '⚖️ 밸런스', etc: '💬 기타', pwreset: '🔑 비밀번호 초기화 요청' };
const GAME_NAME = { holdem: '♠ 홀덤', seotda: '🎴 섯다', omok: '⚫ 오목', langbang: '🥊 랑방', site: '🏠 전체' };

export function renderAdmin() {
  const S = C.S;
  if (!S.user || !S.user.isMaster) { S.view = 'home'; C.render(); return; }
  const tab = S.adminTab || 'notices';
  C.app.innerHTML = `
  <main class="page admin">
    <header class="admin-head">
      <button class="btn btn-sm btn-outline" id="ad-back">‹ 메인</button>
      <h1>👑 마스터 관리실</h1>
    </header>
    <div class="ad-stats" id="ad-stats"><span>불러오는 중…</span></div>
    <nav class="ad-tabs" role="tablist">${TABS.map(([k, t]) => `<button role="tab" class="ad-tab ${k === tab ? 'on' : ''}" data-tab="${k}" aria-selected="${k === tab}">${t}</button>`).join('')}</nav>
    <section class="panel ad-body" id="ad-body"><p class="muted">불러오는 중…</p></section>
  </main>`;
  C.app.querySelector('#ad-back').onclick = () => { S.view = 'home'; C.render(); };
  C.app.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { S.adminTab = b.dataset.tab; S.adminUser = null; S.adminRoom = null; renderAdmin(); }; });
  loadOverview();
  ({ notices: adNotices, users: adUsers, rooms: adRooms, feedback: adFeedback, maint: adMaint, log: adLog })[tab]();
}
const $body = () => document.getElementById('ad-body');
function failed(r) {
  if (r.ok) return false;
  C.toast(r.message || '실패했어요', 'error');
  if (r.status === 403 || r.status === 401) { C.S.view = 'home'; C.render(); }
  return true;
}
async function loadOverview() {
  const r = await admin.get('/overview');
  const el = document.getElementById('ad-stats');
  if (!el || !r.ok) return;
  el.innerHTML = `<span>👥 가입 <b>${fmt(r.users)}</b></span><span>🎲 방 <b>${fmt(r.rooms)}</b> (접속 ${fmt(r.online)})</span><span>💌 새 건의 <b>${fmt(r.openFeedback)}</b></span>${r.maintenance.on ? '<span class="warn">🛠️ 점검 중</span>' : ''}`;
}

async function adNotices(editing = null) {
  const r = await admin.get('/notices');
  if (failed(r)) return;
  const body = $body();
  if (!body) return;
  const e = editing || { title: '', body: '', important: false };
  body.innerHTML = `
    <form class="form ad-form" id="ad-nf">
      <h2 class="sec-title">${editing ? '공지 고치기' : '새 공지 쓰기'}</h2>
      <input class="input" name="title" maxlength="60" required placeholder="제목 (60자까지)" value="${esc(e.title)}">
      <textarea class="input" name="body" maxlength="2000" rows="5" required placeholder="내용">${esc(e.body)}</textarea>
      <label class="switch"><input type="checkbox" name="important" ${e.important ? 'checked' : ''}><span>중요 공지 (처음 들어올 때 한 번 팝업)</span></label>
      <div class="row">${editing ? '<button type="button" class="btn btn-ghost" id="ad-ncancel">취소</button>' : ''}<button class="btn btn-gold grow">${editing ? '고친 내용 저장' : '공지 올리기'}</button></div>
    </form>
    <h3 class="sub-title">올린 공지 ${r.notices.length}개</h3>
    <div class="ad-list">${r.notices.map((n) => `<div class="ad-row">
      <div class="grow"><b>${n.important ? '<span class="n-tag">중요</span> ' : ''}${esc(n.title)}</b><small class="muted">${fmtDate(n.createdAt)}</small></div>
      <button class="btn btn-sm btn-outline" data-edit="${esc(n.id)}">수정</button><button class="btn btn-sm btn-ghost danger" data-del="${esc(n.id)}">삭제</button></div>`).join('') || '<p class="muted small">아직 없어요</p>'}</div>`;
  const f = body.querySelector('#ad-nf');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(f);
    const data = { title: fd.get('title'), body: fd.get('body'), important: fd.get('important') === 'on' };
    const res = editing ? await admin.put(`/notices/${encodeURIComponent(editing.id)}`, data) : await admin.post('/notices', data);
    if (failed(res)) return;
    C.toast(editing ? '공지를 고쳤어요' : '공지를 올렸어요', 'ok');
    adNotices();
  };
  const cancel = body.querySelector('#ad-ncancel'); if (cancel) cancel.onclick = () => adNotices();
  body.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => adNotices(r.notices.find((n) => n.id === b.dataset.edit)); });
  body.querySelectorAll('[data-del]').forEach((b) => {
    b.onclick = async () => {
      if (!confirm('이 공지를 지울까요?')) return;
      if (failed(await admin.del(`/notices/${encodeURIComponent(b.dataset.del)}`))) return;
      C.toast('지웠어요', 'ok'); adNotices();
    };
  });
}

async function adUsers() {
  const S = C.S;
  if (S.adminUser) return adUserDetail(S.adminUser);
  const body = $body();
  body.innerHTML = `
    <form class="row" id="ad-us"><input class="input grow" name="q" placeholder="아이디 또는 닉네임" value="${esc(S.adminQuery || '')}" autocomplete="off" autocapitalize="off"><button class="btn btn-gold">검색</button></form>
    <div class="ad-list" id="ad-ulist"><p class="muted small">불러오는 중…</p></div>`;
  const f = body.querySelector('#ad-us');
  const load = async () => {
    const r = await admin.get('/users?q=' + encodeURIComponent(S.adminQuery || ''));
    if (failed(r)) return;
    const box = body.querySelector('#ad-ulist');
    box.innerHTML = r.users.map((u) => `<button class="ad-row ad-user" data-u="${esc(u.username)}">
      <div class="grow"><b>${esc(u.nickname)} ${masterBadge(u.isMaster, true)}${u.banned ? ' <span class="badge badge-warn">정지</span>' : ''}</b>
        <small class="muted">@${esc(u.username)} · ${COIN} ${fmt(u.coins)} · 랑방 Lv.${u.lbLevel}${u.omok ? ` · 오목 ${fmt(u.omok.rating)}` : ''}</small></div><span class="n-go">›</span></button>`).join('')
      || '<p class="muted small">찾는 사람이 없어요</p>';
    box.querySelectorAll('[data-u]').forEach((b) => { b.onclick = () => { S.adminUser = b.dataset.u; adUserDetail(b.dataset.u); }; });
  };
  f.onsubmit = (e) => { e.preventDefault(); S.adminQuery = new FormData(f).get('q'); load(); };
  load();
}
async function adUserDetail(username) {
  const r = await admin.get('/users/' + encodeURIComponent(username));
  if (failed(r)) { C.S.adminUser = null; return; }
  const u = r.user;
  const s = u.stats || {};
  const lb = s.langbang || {};
  const body = $body();
  if (!body) return;
  const g = (x) => x || {};
  body.innerHTML = `
    <button class="btn btn-sm btn-ghost" id="ad-uback">‹ 목록</button>
    <div class="ad-user-head"><b>${esc(u.nickname)}</b>${masterBadge(u.isMaster)}<small class="muted">@${esc(u.username)} · ${fmtDay(u.createdAt)} 가입</small></div>
    ${u.banned ? `<div class="ad-banned">⛔ 이용 정지 중 · 사유: ${esc(u.banned.reason)} <small>(${fmtDate(u.banned.at)} · ${esc(u.banned.by)})</small></div>` : ''}
    <div class="ad-grid">
      <span>⚫ 오목</span><b>${fmt(g(s.omok).rating)}점 · ${fmt(g(s.omok).games)}판 ${fmt(g(s.omok).wins)}승</b>
      <span>♠ 홀덤</span><b>${fmt(g(s.holdem).hands)}판 · ${C.signed(g(s.holdem).net || 0)}</b>
      <span>🎴 섯다</span><b>${fmt(g(s.seotda).hands)}판 · ${C.signed(g(s.seotda).net || 0)}</b>
      <span>🥊 랑방</span><b>Lv.${lb.level || 1} · ${COIN} ${fmt(u.coins)} · 최고 ${u.maxStage ? `${Math.ceil(u.maxStage / 10)}-${((u.maxStage - 1) % 10) + 1}` : '-'}</b>
      <span>📅 출석</span><b>${u.checkin.streak}일 연속 · 누적 ${fmt(u.checkin.total)}일${u.checkin.claimed ? ' · 오늘 ✓' : ''}</b>
      <span>🏆 토너</span><b>${fmt(g(s.tourney).played)}회 · 우승 ${fmt(g(s.tourney).wins)}</b>
    </div>
    <div class="ad-actions">
      <form class="row" id="ad-coin"><input class="input grow" name="delta" type="number" inputmode="numeric" placeholder="코인 (+지급 / −회수)" required><button class="btn btn-gold">💰 적용</button></form>
      <form class="row" id="ad-nick"><input class="input grow" name="nickname" maxlength="10" placeholder="새 닉네임" required><button class="btn btn-outline">닉네임 변경</button></form>
      ${u.isMaster ? '' : u.banned ? '<button class="btn btn-outline" id="ad-unban">✅ 정지 풀기</button>'
        : '<form class="row" id="ad-ban"><input class="input grow" name="reason" maxlength="100" placeholder="정지 사유 (보이는 문구)"><button class="btn btn-danger">⛔ 정지</button></form>'}
      <div class="row"><button class="btn btn-outline grow" id="ad-pw">🔑 비밀번호 초기화</button><button class="btn btn-outline grow danger" id="ad-reset">🧹 전적 초기화</button></div>
      <p class="muted tiny">전적 초기화는 홀덤·섯다·오목·토너먼트 기록만 지워요 (랑방 진행도·코인은 그대로)</p>
    </div>`;
  const q = (sel) => body.querySelector(sel);
  q('#ad-uback').onclick = () => { C.S.adminUser = null; adUsers(); };
  q('#ad-coin').onsubmit = async (e) => {
    e.preventDefault();
    const delta = Number(new FormData(e.target).get('delta'));
    if (!confirm(`${u.nickname}님에게 코인 ${delta > 0 ? '+' : ''}${fmt(delta)} 할까요?`)) return;
    const res = await admin.post(`/users/${encodeURIComponent(u.username)}/coins`, { delta });
    if (failed(res)) return;
    C.toast(`코인 적용! 지금 ${fmt(res.coins)}개`, 'ok'); adUserDetail(u.username);
  };
  q('#ad-nick').onsubmit = async (e) => {
    e.preventDefault();
    const res = await admin.post(`/users/${encodeURIComponent(u.username)}/nickname`, { nickname: new FormData(e.target).get('nickname') });
    if (failed(res)) return;
    C.toast('닉네임을 바꿨어요', 'ok'); adUserDetail(u.username);
  };
  const ban = q('#ad-ban');
  if (ban) ban.onsubmit = async (e) => {
    e.preventDefault();
    if (!confirm(`${u.nickname}님을 정지할까요? 바로 로그아웃되고 로그인할 수 없어요.`)) return;
    const res = await admin.post(`/users/${encodeURIComponent(u.username)}/ban`, { reason: new FormData(e.target).get('reason') });
    if (failed(res)) return;
    C.toast('정지했어요', 'ok'); adUserDetail(u.username);
  };
  const unban = q('#ad-unban');
  if (unban) unban.onclick = async () => { if (failed(await admin.post(`/users/${encodeURIComponent(u.username)}/unban`))) return; C.toast('정지를 풀었어요', 'ok'); adUserDetail(u.username); };
  q('#ad-pw').onclick = () => issueTempPassword(u.username, u.nickname);
  q('#ad-reset').onclick = async () => {
    if (!confirm(`${u.nickname}님의 홀덤·섯다·오목·토너먼트 전적을 처음으로 되돌릴까요?`)) return;
    if (failed(await admin.post(`/users/${encodeURIComponent(u.username)}/reset-stats`))) return;
    C.toast('전적을 초기화했어요', 'ok'); adUserDetail(u.username);
  };
}

// 임시 비밀번호 발급 (유저 상세 · 건의함의 '비밀번호 초기화 요청'에서 같이 씀) → 성공하면 true
async function issueTempPassword(username, nickname) {
  if (!confirm(`${nickname || username}님의 비밀번호를 임시 비밀번호로 바꿀까요? (그 사람은 모든 기기에서 로그아웃돼요)`)) return false;
  const res = await admin.post(`/users/${encodeURIComponent(username)}/password`);
  if (failed(res)) return false;
  C.openModal('🔑 임시 비밀번호', `<p>이 비밀번호는 <b>지금 한 번만</b> 보여요. ${esc(nickname || username)}님(@${esc(username)})에게 전달해 주세요.</p>
    <div class="temp-pw mono">${esc(res.tempPassword)}</div>
    <div class="row"><button class="btn btn-gold grow" id="tp-copy">복사하기</button><button class="btn btn-ghost" data-close>닫기</button></div>
    <p class="muted tiny">로그인한 뒤 ⚙️ 설정 → 계정 관리에서 새 비밀번호로 바꾸고, 복구 코드도 새로 받으라고 알려 주세요.</p>`, (b) => {
    b.querySelector('#tp-copy').onclick = async () => { try { await navigator.clipboard.writeText(res.tempPassword); C.toast('복사했어요', 'ok'); } catch { prompt('복사해 주세요', res.tempPassword); } };
    b.querySelectorAll('[data-close]').forEach((x) => { x.onclick = C.closeModal; });
  });
  return true;
}

const PHASE = { lobby: '⏳ 대기', playing: '🎮 게임 중' };
async function adRooms() {
  const S = C.S;
  if (S.adminRoom) return adRoomDetail(S.adminRoom);
  const r = await admin.get('/rooms');
  if (failed(r)) return;
  const body = $body();
  if (!body) return;
  body.innerHTML = `<div class="sec-head"><h2 class="sec-title">방 ${r.rooms.length}개</h2><button class="btn btn-sm btn-outline" id="ad-rre">새로고침</button></div>
    <div class="ad-list">${r.rooms.map((x) => `<div class="ad-row">
      <div class="grow"><b>${GAME_NAME[x.game] || x.game} <span class="mono">${esc(x.code)}</span>${x.hasPassword ? ' 🔒' : ''}${x.approval ? ' ✋' : ''}${x.practice ? ' 🤖' : ''}</b>
        <small class="muted">${PHASE[x.phase] || x.phase} · ${x.players}/${x.maxPlayers}명${x.spectators ? ` · 관전 ${x.spectators}` : ''} · ${x.online ? '🟢 접속 중' : '⚪ 비어 있음'}<br>${esc((x.names || []).join(', ') || '-')}</small></div>
      <div class="ad-rbtns"><button class="btn btn-sm btn-outline" data-view="${esc(x.code)}">보기</button><button class="btn btn-sm btn-outline" data-watch="${esc(x.code)}">관전</button><button class="btn btn-sm btn-ghost danger" data-close="${esc(x.code)}">닫기</button></div></div>`).join('') || '<p class="muted small">지금 열린 방이 없어요</p>'}</div>`;
  body.querySelector('#ad-rre').onclick = adRooms;
  body.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { S.adminRoom = b.dataset.view; adRoomDetail(b.dataset.view); }; });
  body.querySelectorAll('[data-watch]').forEach((b) => { b.onclick = () => C.watchRoom(b.dataset.watch); });
  body.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => closeRoom(b.dataset.close, adRooms); });
}
async function closeRoom(code, then) {
  if (!confirm(`방 ${code}을(를) 닫을까요? 안에 있는 사람은 모두 나가게 돼요.`)) return;
  if (failed(await admin.post(`/rooms/${encodeURIComponent(code)}/close`))) return;
  C.toast('방을 닫았어요', 'ok');
  C.S.adminRoom = null;
  then();
}
async function adRoomDetail(code) {
  const r = await admin.get('/rooms/' + encodeURIComponent(code));
  if (failed(r)) { C.S.adminRoom = null; adRooms(); return; }
  const x = r.room;
  const body = $body();
  if (!body) return;
  body.innerHTML = `
    <button class="btn btn-sm btn-ghost" id="ad-rback">‹ 방 목록</button>
    <h2 class="sec-title">${GAME_NAME[x.game] || x.game} 방 <span class="mono">${esc(x.code)}</span></h2>
    <p class="muted small">${PHASE[x.phase] || x.phase}${x.handNo ? ` · ${x.handNo}판째` : ''} · ${x.settings.hasPassword ? '🔒 비밀번호' : '공개'}${x.settings.approval ? ' · ✋ 승인제' : ''}${x.game !== 'omok' ? ` · 블라인드 ${fmt(x.settings.sb)}/${fmt(x.settings.bb)}` : ''}</p>
    <div class="ad-list">${x.players.map((p) => `<div class="ad-row">
      <div class="grow"><b>${esc(p.name)} ${masterBadge(p.master, true)}${p.isHost ? ' <span class="badge badge-gold">방장</span>' : ''}${p.isBot ? ' <span class="badge">🤖</span>' : ''}${p.member ? ' <span class="member-mark">✓</span>' : ''}</b>
        <small class="muted">${p.role === 'player' ? '참가' : '관전'} · ${p.connected || p.isBot ? '🟢' : '⚪ 끊김'}${p.role === 'player' && x.game !== 'omok' ? ` · 칩 ${fmt(p.stack)}` : ''}</small></div>
      ${p.master ? '' : `<button class="btn btn-sm btn-ghost danger" data-kick="${esc(p.id)}">내보내기</button>`}</div>`).join('')}</div>
    ${x.pending.length ? `<p class="muted small">승인 대기: ${x.pending.map((p) => esc(p.name)).join(', ')}</p>` : ''}
    <h3 class="sub-title">최근 기록</h3>
    <ol class="log">${x.feed.slice().reverse().map((e) => `<li class="log-info">${esc(e.text)}</li>`).join('')}</ol>
    <div class="row"><button class="btn btn-outline grow" id="ad-rwatch">👀 관전하러 가기</button><button class="btn btn-danger grow" id="ad-rclose">방 닫기</button></div>`;
  body.querySelector('#ad-rback').onclick = () => { C.S.adminRoom = null; adRooms(); };
  body.querySelector('#ad-rwatch').onclick = () => C.watchRoom(x.code);
  body.querySelector('#ad-rclose').onclick = () => closeRoom(x.code, adRooms);
  body.querySelectorAll('[data-kick]').forEach((b) => {
    b.onclick = async () => {
      const p = x.players.find((y) => y.id === b.dataset.kick);
      if (!confirm(`${p ? p.name : '이 사람'}님을 방에서 내보낼까요?`)) return;
      const res = await admin.post(`/rooms/${encodeURIComponent(x.code)}/kick`, { id: b.dataset.kick });
      if (failed(res)) return;
      C.toast('내보냈어요', 'ok');
      if (res.room) adRoomDetail(x.code); else { C.S.adminRoom = null; adRooms(); }
    };
  });
}

async function adFeedback() {
  const r = await admin.get('/feedback');
  if (failed(r)) return;
  const body = $body();
  if (!body) return;
  const open = r.feedback.filter((f) => !f.done).length;
  body.innerHTML = `<h2 class="sec-title">건의함 · 새 글 ${open}개</h2>
    <div class="ad-list">${r.feedback.map((f) => `<div class="ad-fb ${f.done ? 'is-done' : ''} ${f.category === 'pwreset' ? 'is-pwreset' : ''}">
      <div class="ad-fb-head"><span class="badge">${CAT_NAME[f.category] || f.category}</span>${f.game ? `<span class="badge">${GAME_NAME[f.game] || f.game}</span>` : ''}
        <small class="muted">${f.nickname ? `${esc(f.nickname)} @${esc(f.username)}` : '손님'} · ${fmtDate(f.createdAt)}</small></div>
      <p>${para(f.text)}</p>
      <div class="row">${f.category === 'pwreset' && f.username && !f.done ? `<button class="btn btn-sm btn-gold" data-temppw="${esc(f.username)}" data-fid="${esc(f.id)}" data-nick="${esc(f.nickname || '')}">🔑 임시 비밀번호 발급</button>` : ''}
        <button class="btn btn-sm btn-outline" data-done="${esc(f.id)}" data-v="${f.done ? '0' : '1'}">${f.done ? '↩ 다시 열기' : '✅ 처리 완료'}</button>
        ${f.username ? `<button class="btn btn-sm btn-ghost" data-user="${esc(f.username)}">유저 보기</button>` : ''}
        <button class="btn btn-sm btn-ghost danger" data-del="${esc(f.id)}">삭제</button></div></div>`).join('') || '<div class="empty-note">📭<p>아직 받은 건의가 없어요</p></div>'}</div>`;
  body.querySelectorAll('[data-done]').forEach((b) => { b.onclick = async () => { if (!failed(await admin.post(`/feedback/${encodeURIComponent(b.dataset.done)}/done`, { done: b.dataset.v === '1' }))) { adFeedback(); loadOverview(); } }; });
  body.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => { if (!confirm('이 건의를 지울까요?')) return; if (!failed(await admin.del(`/feedback/${encodeURIComponent(b.dataset.del)}`))) { adFeedback(); loadOverview(); } }; });
  body.querySelectorAll('[data-user]').forEach((b) => { b.onclick = () => { C.S.adminTab = 'users'; C.S.adminUser = b.dataset.user; renderAdmin(); }; });
  body.querySelectorAll('[data-temppw]').forEach((b) => {
    b.onclick = async () => {
      if (!(await issueTempPassword(b.dataset.temppw, b.dataset.nick))) return;
      await admin.post(`/feedback/${encodeURIComponent(b.dataset.fid)}/done`, { done: true }); // 요청은 처리 완료로
      loadOverview();
      adFeedback().then(() => {}); // 목록 새로 고침 (임시 비밀번호 창은 그대로)
    };
  });
}

async function adMaint() {
  const r = await admin.get('/overview');
  if (failed(r)) return;
  const m = r.maintenance;
  const body = $body();
  if (!body) return;
  body.innerHTML = `<form class="form" id="ad-mf">
    <h2 class="sec-title">점검 모드 ${m.on ? '<span class="badge badge-warn">켜짐</span>' : '<span class="badge">꺼짐</span>'}</h2>
    <p class="muted small">켜면 메인에 점검 안내가 뜨고, <b>새 방 만들기</b>가 막혀요 (마스터는 예외). 이미 열린 방은 계속 할 수 있어요.</p>
    <input class="input" name="message" maxlength="120" placeholder="안내 문구 (예: 새 게임 준비 중! 10시에 열어요)" value="${esc(m.message)}">
    <div class="row">${m.on ? '<button class="btn btn-gold grow" name="on" value="0">점검 끝내기</button><button class="btn btn-outline" name="on" value="1">문구만 바꾸기</button>'
      : '<button class="btn btn-danger grow" name="on" value="1">🛠️ 점검 시작</button>'}</div></form>`;
  const f = body.querySelector('#ad-mf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const on = (e.submitter && e.submitter.value) === '1';
    const res = await admin.post('/maintenance', { on, message: new FormData(f).get('message') });
    if (failed(res)) return;
    if (C.S.info) C.S.info.maintenance = res.maintenance;
    C.toast(on ? '점검 모드를 켰어요' : '점검 모드를 껐어요', 'ok');
    adMaint(); loadOverview();
  };
}

async function adLog() {
  const r = await admin.get('/log');
  if (failed(r)) return;
  const body = $body();
  if (!body) return;
  const detail = (d) => (d ? Object.entries(d).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(',') : v}`).join(' · ') : '');
  body.innerHTML = `<h2 class="sec-title">운영 기록</h2><ol class="ad-log">${r.log.map((e) => `<li><small class="muted">${fmtDate(e.at)} · ${esc(e.actor)}</small>
    <b>${esc(ACTIONS[e.action] || e.action)}</b>${e.target ? ` <span class="mono">${esc(e.target)}</span>` : ''}${e.detail ? `<small class="muted"> ${esc(detail(e.detail))}</small>` : ''}</li>`).join('') || '<li class="muted">아직 기록이 없어요</li>'}</ol>`;
}
