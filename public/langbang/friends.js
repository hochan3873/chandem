// 랑방 대전 — 친구 화면: 친구 목록 · 요청 · 체력(피로도) 선물 · 레이드 도우미 고르기
// 화면 도구(show · popup · toast · 아이콘 …)는 game.js 가 initFriends 로 넘겨준다. 모든 판정은 서버(server/langbang-friends.js).
import * as API from './api.js';
import * as L from './live.js';
import { HEROES } from './data.js';

let C = null; // game.js 화면 도구
let st = { tab: 'list', data: null, loading: false };

const ago = (t) => {
  if (!t) return '-';
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 5) return '접속 중';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.min(99, Math.floor(h / 24))}일 전`;
};
// 대표 멤버 얼굴 + 강화 · 성급
function face(ld) {
  const d = ld && HEROES[ld.hero];
  if (!d) return '<span class="fr-face"></span>';
  return `<span class="fr-face">${C.av(d)}<i>${ld.lv ? '+' + ld.lv : ''}</i><em>${'★'.repeat(Math.max(1, ld.star | 0))}</em></span>`;
}
const nameCell = (f, sub) => `<span class="nm ${C.frameCls(f.frame)}" style="${C.frameStyle(f.frame)}">${C.whoHtml(f.nickname, f.title)}<small>${sub}</small></span>`;

export function initFriends(ctx) { C = ctx; return ACTS; }
export const badge = (p) => (p && !p.guest ? L.friendBadge(p, Date.now()) : 0);

async function load() {
  st.loading = true;
  const r = await API.friendsLoad();
  st.loading = false;
  if (r && r.ok) st.data = r;
  else if (r && r.message) C.toast(r.message);
  return r && r.ok;
}
export async function showFriends(tab) {
  if (tab) st.tab = tab;
  C.app.screen = 'friends';
  if (C.app.guest) { render(); return; }
  if (!st.data) render();
  await load();
  if (C.app.screen === 'friends') render();
}
function render() {
  const p = C.P(), d = st.data, tab = st.tab, now = Date.now();
  const nIn = d ? d.inReq.length : (p.fr ? p.fr.inReq.length : 0);
  const nGift = d ? d.gifts.length : L.giftInbox(p, now).length;
  const cnt = (n) => (n ? `<i class="cnt">${n}</i>` : '');
  let body = '';
  if (C.app.guest) {
    body = `<div class="fr-guest">${C.ic('ic_friends', '', '')}<b>친구는 로그인하면 쓸 수 있어요</b><small>친구와 체력을 주고받고, 레이드에서 친구 멤버를 빌려요</small><a class="btn primary" href="/">로그인하러 가기</a></div>`;
  } else if (!d) body = '<div class="empty-msg"><span class="spin"></span> 불러오는 중…</div>';
  else if (tab === 'list') {
    const canGift = d.friends.filter((f) => !f.sent).length;
    const rows = d.friends.map((f) => `<div class="rank fr-row">${face(f.leader)}${nameCell(f, `Lv.${f.level || 1} · ${ago(f.last)}`)}
      <button class="btn mini ${f.sent ? 'ghost' : 'primary'} fr-gift" data-act="frGift" data-id="${C.esc(f.id)}" ${f.sent ? 'disabled' : ''}>${C.ic('gift_stamina', '', 'sm')}${f.sent ? '보냄' : '+' + L.FRIEND.gift}</button>
      <button class="fr-more" data-act="frMenu" data-id="${C.esc(f.id)}" aria-label="친구 메뉴">···</button></div>`).join('');
    body = `<div class="fr-add"><input id="frQ" maxlength="20" placeholder="닉네임 또는 친구 코드" autocomplete="off" enterkeyhint="send"><button class="btn mini primary" data-act="frAdd">친구 요청</button></div>
      <div class="fr-me"><span>내 친구 코드 <b class="fr-code">${C.esc(d.code)}</b></span><button class="btn mini ghost" data-act="frCopy">복사</button><span class="fr-pts">${C.ic('help_point', '', 'sm')}도움 포인트 <b>${C.fmt(d.pts || 0)}</b></span></div>
      <div class="fr-bar"><small>친구 ${d.friends.length}/${L.FRIEND.max} · 하루 한 번 친구마다 체력 +${L.FRIEND.gift}</small><button class="btn mini ${canGift ? 'primary' : 'ghost'}" data-act="frGift" data-id="all" ${canGift ? '' : 'disabled'}>${C.ic('gift', '', 'sm')}모두 보내기${canGift ? ` (${canGift})` : ''}</button></div>
      <div class="rank-list fr-list">${rows || '<div class="empty-msg">아직 친구가 없어요<br>닉네임이나 친구 코드로 요청해 봐요</div>'}</div>`;
  } else if (tab === 'gifts') {
    const rows = d.gifts.map((g) => `<div class="mail-row fr-g"><div><b>${C.ic('gift_stamina', '', 'sm')}체력 +${L.FRIEND.gift}</b><i class="mail-from">보낸 사람 ${C.esc(g.nick || '친구')}</i><small>${ago(g.at)} · ${Math.max(1, Math.ceil((g.at + L.FRIEND.giftDays * 86400e3 - now) / 86400e3))}일 남음</small></div><button class="btn mini primary" data-act="frClaim" data-k="${g.k}" ${d.recvLeft > 0 ? '' : 'disabled'}>받기</button></div>`).join('');
    body = `<div class="fr-bar"><small>오늘 더 받을 수 있는 선물 <b>${d.recvLeft}/${L.FRIEND.recvPerDay}</b> · 체력 ${L.staminaNow(p, now).v}/${L.STAMINA.max} (최대 ${L.STAMINA.cap})</small>${d.gifts.length > 1 ? `<button class="btn mini primary" data-act="frClaim" data-k="all" ${d.recvLeft > 0 ? '' : 'disabled'}>${C.ic('gift', '', 'sm')}모두 받기</button>` : ''}</div>
      <div class="mail-list fr-gifts">${rows || '<div class="empty-msg">받은 선물이 없어요</div>'}</div><p class="ip">선물은 ${L.FRIEND.giftDays}일 동안 보관돼요 · 하루 ${L.FRIEND.recvPerDay}개까지 받아요</p>`;
  } else {
    const rin = d.inReq.map((f) => `<div class="rank fr-row">${face(f.leader)}${nameCell(f, `Lv.${f.level || 1}`)}<button class="btn mini primary" data-act="frAccept" data-id="${C.esc(f.id)}">수락</button><button class="btn mini ghost" data-act="frDecline" data-id="${C.esc(f.id)}">거절</button></div>`).join('');
    const rout = d.outReq.map((f) => `<div class="rank fr-row">${face(f.leader)}${nameCell(f, '수락을 기다리는 중')}<button class="btn mini ghost" data-act="frCancel" data-id="${C.esc(f.id)}">취소</button></div>`).join('');
    body = `<h4 class="fr-h">받은 요청 ${d.inReq.length}</h4><div class="rank-list">${rin || '<div class="empty-msg sm">받은 요청이 없어요</div>'}</div>
      <h4 class="fr-h">보낸 요청 ${d.outReq.length}</h4><div class="rank-list">${rout || '<div class="empty-msg sm">보낸 요청이 없어요</div>'}</div><p class="ip">오늘 보낼 수 있는 요청 ${d.reqLeft}/${L.FRIEND.reqPerDay}</p>`;
  }
  C.show(`${C.topbar(true)}
    <h2 class="title">${C.ic('ic_friends', '', 'sm')} 친구</h2>
    <div class="tabs"><button class="${tab === 'list' ? 'on' : ''}" data-act="frTab" data-tab="list">친구 목록</button><button class="${tab === 'gifts' ? 'on' : ''}" data-act="frTab" data-tab="gifts">받은 선물${cnt(nGift)}</button><button class="${tab === 'req' ? 'on' : ''}" data-act="frTab" data-tab="req">요청${cnt(nIn)}</button></div>
    <div class="fr-body">${body}</div>`, 'dim friends');
  const q = document.getElementById('frQ');
  if (q) q.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); ACTS.frAdd(); } });
}
// 서버 응답 처리: 프로필 갱신 · 목록 다시
async function act(kind, body, okMsg) {
  const r = await API.friendAct(kind, body);
  if (r.ok && r.profile) C.setProfile(r.profile);
  if (!r.ok) { C.toast(r.message || '못 했어요', 2400); return null; }
  if (okMsg) C.toast(okMsg(r), 2400);
  await load();
  if (C.app.screen === 'friends') render();
  return r;
}
function friendOf(id) { return st.data && st.data.friends.find((f) => f.id === id); }
const ACTS = {
  friends: () => showFriends(),
  frTab: (b) => { st.tab = b.dataset.tab; render(); },
  frAdd: () => {
    const el = document.getElementById('frQ');
    const q = el ? el.value.trim() : '';
    if (!q) { C.toast('닉네임이나 친구 코드를 입력해 주세요'); return; }
    act('request', { q }, (r) => (r.accepted ? `${r.nickname}님과 친구가 됐어요!` : `${r.nickname}님에게 친구 요청을 보냈어요`));
  },
  frCopy: () => {
    const code = st.data && st.data.code;
    if (!code) return;
    const done = () => C.toast(`친구 코드 ${code} 복사했어요`);
    try { navigator.clipboard.writeText(code).then(done, () => C.toast(`내 친구 코드: ${code}`, 3000)); } catch { C.toast(`내 친구 코드: ${code}`, 3000); }
  },
  frAccept: (b) => act('accept', { id: b.dataset.id }, (r) => (r.nickname ? `${r.nickname}님과 친구가 됐어요!` : '요청을 정리했어요')),
  frDecline: (b) => act('decline', { id: b.dataset.id }, () => '요청을 거절했어요'),
  frCancel: (b) => act('cancel', { id: b.dataset.id }, () => '요청을 취소했어요'),
  frGift: (b) => act('gift', { id: b.dataset.id }, (r) => (r.sent > 1 ? `친구 ${r.sent}명에게 체력을 보냈어요` : '체력을 보냈어요')),
  frClaim: (b) => act('claim', { k: b.dataset.k === 'all' ? 'all' : Number(b.dataset.k) }, (r) => `체력 +${r.gotSta} 받았어요 (오늘 ${Math.max(0, r.left)}개 더)`),
  frMenu: (b) => {
    const f = friendOf(b.dataset.id);
    if (!f) return;
    const d = f.leader && HEROES[f.leader.hero];
    C.popup(`<div class="fr-card"><div class="pc-head ${C.frameCls(f.frame)}" style="--fr:${(f.frame && L.FRAMES[f.frame] && L.FRAMES[f.frame].color) || '#ffd23f'}"><b>${C.esc(f.nickname)}</b>${C.titleChip(f.title)}<small>Lv.${f.level || 1} · ${ago(f.last)}</small></div>
      ${d ? `<div class="fr-lead">${face(f.leader)}<span><small>대표 멤버</small><b>${C.esc(d.name)}</b><i>레이드에서 하루 한 번 빌릴 수 있어요${f.borrowed ? ' · 오늘 빌림' : ''}</i></span></div>` : ''}
      <p class="ip">${C.ic('help_point', '', 'sm')}도움 포인트 ${C.fmt(f.pts || 0)}</p>
      <div class="confirm-row"><button class="btn ghost danger-t" data-act="frRemove" data-id="${C.esc(f.id)}">친구 삭제</button><button class="btn primary" data-x>닫기</button></div></div>`, 'fr-pop');
  },
  frRemove: async (b) => {
    const f = friendOf(b.dataset.id);
    const ok = await C.confirmBox({ title: '친구를 삭제할까요?', sub: f ? `${f.nickname}님이 친구 목록에서 빠져요` : '', ok: '삭제', cancel: '취소', danger: true });
    if (!ok) return;
    const pop = document.querySelector('.info-modal.fr-pop'); if (pop) pop.remove();
    act('remove', { id: b.dataset.id }, () => '친구를 삭제했어요');
  },
};

// ─── 레이드 도우미 고르기: 친구 대표 멤버 한 명 (빌릴 수 있는 친구가 없으면 바로 혼자) ───
// 돌려주는 값: 친구 아이디 · null(혼자) · false(취소)
export async function pickHelper(myDeck) {
  if (C.app.guest) return null;
  const r = await API.friendsLoad();
  if (!r || !r.ok || !r.friends.length) return null;
  const mine = new Set(myDeck || []);
  const ok = r.friends.filter((f) => !f.borrowed && f.leader && HEROES[f.leader.hero] && !mine.has(f.leader.hero));
  if (!ok.length) return null;
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const rows = r.friends.map((f) => {
      const why = f.borrowed ? '오늘 빌림' : !f.leader || !HEROES[f.leader.hero] ? '멤버 없음' : mine.has(f.leader.hero) ? '내 덱에 같은 멤버' : '';
      const d = f.leader && HEROES[f.leader.hero];
      return `<div class="rank fr-row ${why ? 'off' : ''}">${face(f.leader)}${nameCell(f, d ? `${C.esc(d.name)} · ${ago(f.last)}` : ago(f.last))}<button class="btn mini ${why ? 'ghost' : 'primary'}" data-pick="${C.esc(f.id)}" ${why ? 'disabled' : ''}>${why || '데려가기'}</button></div>`;
    }).join('');
    const m = C.popup(`<h3>${C.ic('ic_friends', '', 'sm')}도와줄 친구 고르기</h3><p class="ip">친구의 대표 멤버가 강화 · 성급 · 장비 그대로 한 명 더 와요 · 친구마다 하루 한 번 · 빌려준 친구는 코인 ${L.FRIEND.lendRw.coins}과 도움 포인트를 받아요</p>
      <div class="rank-list fr-pick">${rows}</div><button class="btn" data-pick="">혼자 도전</button>`, 'fr-pop fr-pick-pop');
    m.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pick]');
      if (b && !b.disabled) { m.remove(); fin(b.dataset.pick || null); return; }
      if (ev.target === m || ev.target.closest('[data-x]')) fin(false);
    });
    new MutationObserver((_, o) => { if (!m.isConnected) { o.disconnect(); fin(false); } }).observe(m.parentNode || document.body, { childList: true });
  });
}
