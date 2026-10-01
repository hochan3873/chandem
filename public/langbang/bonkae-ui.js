// 랑방 대전 — 본캐 화면: 멤버 카드 배지 · 멤버 정보의 "본캐: 닉네임" · 출연료 창 · 주간 인기 멤버 랭킹 · 출연료 알림
// 화면 도구(show · popup · toast …)는 game.js 가 initBonkae 로 넘겨준다. 판정은 전부 서버(server/langbang-bonkae.js).
import * as API from './api.js';
import * as B from './bonkae.js';
import { HEROES } from './data.js';

let C = null; // game.js 화면 도구
const st = { data: null, at: 0, loading: null, toasted: 0, timer: 0 };
const TOAST_KEY = 'langbang:bkToast';

const ago = (t) => {
  const m = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.min(99, Math.floor(h / 24))}일 전`;
};
const short = (s, n = 5) => { const a = [...String(s || '')]; return a.length > n ? a.slice(0, n).join('') + '…' : a.join(''); };

export function initBonkae(ctx) {
  C = ctx;
  try { st.toasted = Number(localStorage.getItem(TOAST_KEY + ':' + API.liveUid())) || 0; } catch { /* 무시 */ }
  return ACTS;
}
// 모두의 본캐 · 순위 (1분 캐시)
export async function load(force = false) {
  if (!force && st.data && Date.now() - st.at < 60e3) return st.data;
  if (st.loading) return st.loading;
  st.loading = API.bonkaeLoad().then((r) => { st.loading = null; if (r && r.ok) { st.data = r; st.at = Date.now(); } return st.data; }).catch(() => { st.loading = null; return st.data; });
  return st.loading;
}
const owner = (id) => (st.data && st.data.owners && st.data.owners[id]) || null;
const myHero = () => { const p = C && C.P(); return (p && !C.app.guest && p.bk && p.bk.hero) || null; };
const isMine = (id) => myHero() === id;
const rowOf = (id) => (st.data && st.data.week ? st.data.week.find((r) => r.hero === id) : null);
const isGem = (id) => !!(st.data && st.data.gems && st.data.gems.includes(id));

// 처음 켤 때: 출연료 정산(반나절 지난 것 → 우편) · 인기 스타 보너스 · 알림 → 메뉴에 있을 땐 90초마다 다시
export async function boot() {
  if (C.app.guest) { await load(true); redraw(); return; }
  await syncNow();
  clearInterval(st.timer);
  st.timer = setInterval(() => { if (!document.hidden && C.app.screen === 'menu' && !C.app.guest) poll(); }, 90e3);
}
// 메뉴에 있는 동안: 읽기만 (저장 없음) → 반나절이 지난 출연료가 있을 때만 정산
async function poll() {
  const d = await load(true);
  const p = C.P();
  if (!d || !d.me || !p || C.app.screen !== 'menu') return;
  const was = dot(p);
  p.bk = Object.assign({}, p.bk || {}, { hero: d.me.hero, pend: d.me.pend, news: d.me.news, seen: d.me.seen, seq: d.me.seq });
  if (d.me.pend && B.slotIndex(Date.now()) > d.me.pend.slot) { await syncNow(); return; }
  notify();
  if (dot(p) !== was) redraw();
}
async function syncNow() {
  const r = await API.bonkaeSync().catch(() => null);
  if (r && r.ok && r.profile && C.app.screen !== 'play') C.setProfile(r.profile);
  await load(true);
  if (r && r.ok && r.star) C.toast('지난주 인기 1위가 내 본캐예요! 우편함에 보너스가 왔어요', 3600);
  else if (r && r.ok && r.fee && r.fee.mail) C.toast(`출연료 정산 · ${r.fee.text} (우편함)`, 3600);
  else notify();
  redraw();
}
// 새 출연 소식: 한 번에 묶어서 토스트 하나 (같은 소식은 다시 안 띄움)
export function notify() {
  const p = C.P();
  if (!p || C.app.guest || C.app.screen === 'play') return;
  const fresh = B.newsUnseen(p).filter((x) => x.s > st.toasted);
  if (!fresh.length) return;
  const last = fresh[fresh.length - 1];
  const sum = fresh.reduce((a, x) => a + x.coins, 0);
  C.toast(`${last.nick}님이 나를 데리고 ${last.act}!${fresh.length > 1 ? ` 외 ${fresh.length - 1}번` : ''} (출연료 +${sum})`, 3800);
  st.toasted = last.s;
  try { localStorage.setItem(TOAST_KEY + ':' + API.liveUid(), String(st.toasted)); } catch { /* 무시 */ }
}
function redraw() {
  if (['menu', 'deck', 'members'].includes(C.app.screen)) C.refresh();
  else if (C.app.screen === 'ranking' && C.app.rankTab === 'popular') draw(document.getElementById('rk'), document.getElementById('myrk'));
}
// 빨간 점: 받을 출연료 또는 아직 안 본 출연 소식
export const dot = (p) => !!(p && !C.app.guest && (B.pendCoins(p) > 0 || B.newsUnseen(p).length > 0));
// 할 일 목록 한 줄
export function todo(p) {
  const c = p && !C.app.guest ? B.pendCoins(p) : 0;
  return c ? { txt: `출연료 +${c} 받기 (내 본캐)`, ic: 'party', go: 'bonkae' } : null;
}

// ─── 멤버 카드 배지 · 멤버 정보 칸 ───
export function cardBadge(id) {
  const o = owner(id);
  if (!o) return '';
  return `<i class="bk-cb ${isMine(id) ? 'me' : ''}">${isMine(id) ? '내 본캐' : C.esc(short(o.nickname))}</i>`;
}
export function heroHtml(id) {
  if (!B.isBkHero(id)) return '';
  const o = owner(id), p = C.P(), now = Date.now();
  const r = rowOf(id);
  const gem = isGem(id);
  const lines = [];
  if (r && r.players) lines.push(`이번 주 인기 ${r.rank}위 · ${r.players}명이 ${r.uses}번 데려갔어요`);
  else lines.push('이번 주엔 아직 아무도 안 데려갔어요');
  let btns = '';
  if (C.app.guest) btns = '<small class="bk-note">로그인하면 이 멤버를 내 본캐로 정할 수 있어요</small>';
  else if (isMine(id)) btns = `<button class="btn mini primary" data-act="bkFees">${C.ic('party', '', 'sm')}출연료 보기</button><button class="btn mini ghost" data-act="bkRelease">내려놓기</button>`;
  else if (!o) {
    const next = B.nextChangeAt(p.bk);
    if (next > now) btns = `<small class="bk-note">본캐는 ${B.BONKAE.cooldownDays}일에 한 번 바꿀 수 있어요 (${Math.max(1, Math.ceil((next - now) / 86400e3))}일 뒤)</small>`;
    else btns = `<button class="btn mini primary" data-act="bkClaim" data-id="${id}">${C.ic('pin', '', 'sm')}${myHero() ? '내 본캐를 이 멤버로' : '이 멤버가 나야'}</button>`;
  }
  if (p && p.master) btns += `<button class="btn mini ghost" data-act="bkMaster" data-id="${id}">마스터: 본캐 지정</button>`;
  return `<div class="bk-box ${isMine(id) ? 'me' : ''}">
    <div class="bk-h">${C.ic('pin', '', 'sm')}<span>본캐: <b>${o ? C.esc(o.nickname) : '아직 없음'}</b></span>${gem ? `<em class="bk-gem">${C.ic('gem', '', 'sm')}숨은 보석 · 출연료 +50%</em>` : ''}</div>
    <small class="bk-sub">${C.esc(lines.join(' · '))}</small>
    <div class="bk-btns">${btns}</div></div>`;
}

// ─── 출연료 창 ───
export async function showFees() {
  if (C.app.guest) { C.toast('본캐 · 출연료는 로그인하면 쓸 수 있어요'); return; }
  const p = C.P(), bk = p.bk || {}, now = Date.now();
  const h = bk.hero, d = h && HEROES[h];
  const pend = bk.pend || null;
  const dayLeft = Math.max(0, B.dayLeft(bk, now));
  const news = (bk.news || []).slice().reverse();
  const R = B.BONKAE;
  const head = d ? `<div class="bk-me">${C.av(d)}<div><b>${C.esc(d.name)}</b><small>내 본캐${bk.by === 'master' ? ' (마스터 지정)' : ''} · 지금까지 ${C.fmt(bk.totN | 0)}번 출연 · 받은 출연료 ${C.fmt(bk.tot | 0)}</small></div></div>`
    : `<div class="bk-me none"><div><b>아직 본캐가 없어요</b><small>멤버 정보 화면에서 "이 멤버가 나야"를 눌러 정해요 (멤버마다 한 사람 · 먼저 정한 사람)</small></div></div>`;
  const pendBox = `<div class="bk-pend"><div><small>쌓인 출연료</small><b><i class="ci"></i>${C.fmt((pend && pend.coins) || 0)}</b><em>${pend ? `${pend.n}번 출연 · ${pend.who.length}명${pend.gem ? ` · 숨은 보석 +${pend.gem}` : ''}` : '아직 없어요'}</em></div>
    <button class="btn primary" data-act="bkCollect" ${pend && pend.coins ? '' : 'disabled'}>지금 받기</button></div>
    <p class="bk-tip">0시 · 12시가 지나면 우편함으로도 정산돼요 · 오늘 더 받을 수 있는 출연료 <b>${C.fmt(dayLeft)}</b>/${C.fmt(R.dayCap)}</p>`;
  const rows = news.map((x) => `<div class="bk-news ${x.s > (bk.seen | 0) ? 'new' : ''}">${HEROES[x.hero] ? C.av(HEROES[x.hero]) : ''}<span><b>${C.esc(x.nick)}</b>님이 나를 데리고 ${C.esc(x.act)}<small>${ago(x.at)}</small></span><em>+${x.coins}${x.gem ? ` ${C.ic('gem', '', 'sm')}` : ''}</em></div>`).join('');
  C.popup(`<h3 class="bk-t">${C.ic('party', '', 'sm')} 출연료</h3>${head}${pendBox}
    <h4 class="bk-h4">출연 소식</h4><div class="bk-list">${rows || '<div class="empty-msg sm">아직 소식이 없어요<br>친구가 내 본캐를 데리고 깨면 여기에 떠요</div>'}</div>
    <div class="bk-rule"><b>출연료 규칙</b><small>다른 친구가 내 본캐를 덱에 넣고 깨면 한 번에 스테이지 ${R.fee.stage} · 헬 ${R.fee.hell} · 탑 ${R.fee.tower} · 레이드 ${R.fee.raid} · 1:1 승리 ${R.fee.pvp} · 주간 ${R.fee.weekly} · 무한 ${R.fee.endless}<br>같은 친구에게서 하루 ${R.pairCap}까지 · 하루 ${C.fmt(R.dayCap)}까지 · 내가 내 본캐를 쓰면 없어요<br>덜 쓰이는 멤버(아래 1/3)는 숨은 보석 · 출연료 +50%</small></div>`, 'bk-pop');
  if (B.newsUnseen(p).length) { const r = await API.bonkaeSeen(bk.seq | 0); if (r && r.ok && r.profile) C.setProfile(r.profile); }
}

// ─── 랭킹: 주간 인기 멤버 탭 ───
export async function renderRanking(box, my) {
  await load(true);
  draw(box, my);
}
// 아직 못 만난 HIDDEN 멤버는 이름을 가린다
const shown = (h) => { const d = HEROES[h]; return !d.hidden || API.heroUnlocked(C.P(), h); };
function draw(box, my) {
  const data = st.data;
  if (!box || !box.isConnected) return;
  if (!data) { box.innerHTML = '<div class="empty-msg">불러오지 못했어요<br>잠시 후 다시 해 주세요</div>'; return; }
  const star = data.star;
  const head = star ? `<div class="bk-star">${C.av(HEROES[star.hero], shown(star.hero) ? '' : 'sil')}<span><small>지난주 인기 스타</small><b>${shown(star.hero) ? C.esc(HEROES[star.hero].name) : '???'}</b><em>${star.owner ? `본캐 ${C.esc(star.owner.nickname)} · 이번 주 인기 스타 칭호` : '본캐 주인이 없어요'}</em></span><i>${star.players}명</i></div>` : '';
  const rows = data.week.map((r) => `<div class="rank bk-row r${r.rank} ${isMine(r.hero) ? 'me' : ''}" data-act="heroCard" data-id="${r.hero}"><span class="no">${r.rank}</span>${C.av(HEROES[r.hero], shown(r.hero) ? '' : 'sil')}
    <span class="nm"><b>${shown(r.hero) ? C.esc(HEROES[r.hero].name) : '???'}</b>${r.gem ? `<em class="bk-gem">${C.ic('gem', '', 'sm')}숨은 보석</em>` : ''}<small>${r.owner ? `본캐 ${C.esc(r.owner.nickname)}` : '본캐 없음'}</small></span>
    <span class="w"><b>${r.players}명</b><small>${r.uses}번</small></span></div>`).join('');
  const gemNote = `<p class="bk-tip bk-gemnote">${C.ic('gem', '', 'sm')}숨은 보석: ${data.gemBasis === 'prev' ? '지난주' : '이번 주'} 덜 쓰인 아래 1/3 멤버 · 본캐 주인 출연료 +50%</p>`;
  box.innerHTML = head + gemNote + rows;
  if (!my) return;
  if (C.app.guest) { my.innerHTML = '<div class="guest-note" style="margin:0">손님의 판은 집계에 안 들어가요 · <a href="/">로그인</a>하고 본캐를 정해 봐요!</div>'; return; }
  const h = myHero(), p = C.P(), c = B.pendCoins(p);
  my.innerHTML = h ? `<button class="rank me bk-mine" data-act="bkFees"><span class="no">${C.ic('pin', '', 'sm')}</span><span class="nm">내 본캐 ${C.esc(HEROES[h].name)}<small>${rowOf(h) && rowOf(h).players ? `이번 주 ${rowOf(h).rank}위` : '이번 주 아직 출연 없음'}</small></span><span class="w"><b>${c ? `+${C.fmt(c)}` : '출연료'}</b><small>${c ? '받기' : '보기'}</small></span>${dot(p) ? '<i class="rd"></i>' : ''}</button>`
    : '<div class="guest-note" style="margin:0">멤버 정보에서 "이 멤버가 나야"를 눌러 본캐를 정하면, 친구가 데려갈 때마다 출연료가 쌓여요</div>';
}
export const rankSub = () => '이번 주 몇 명이 데려갔나 → 총 출전 수 · 지난주 1위 본캐 주인은 "이번 주 인기 스타" 칭호';

// ─── 버튼 ───
const after = async (r, msg) => {
  if (!r || !r.ok) { C.toast((r && r.message) || '못 했어요'); return null; }
  if (r.profile) C.setProfile(r.profile);
  await load(true);
  if (msg) C.toast(msg, 2600);
  return r;
};
const reopen = (id) => { if (id && C.reopenHero) C.reopenHero(id); else redraw(); };
const ACTS = {
  async bkClaim(b) {
    const id = b.dataset.id, d = HEROES[id];
    if (!d) return;
    const ok = await C.confirmBox({ title: `${d.name}, 이 멤버가 나야?`, sub: `멤버마다 한 사람만 정할 수 있어요 · 정하면 ${B.BONKAE.cooldownDays}일 동안 못 바꿔요 · 친구가 데려가면 출연료가 쌓여요`, ok: '내 본캐로' });
    if (!ok) return;
    if (await after(await API.bonkaeClaim(id), `${d.name}을(를) 내 본캐로 정했어요`)) reopen(id);
  },
  async bkRelease() {
    const h = myHero(); if (!h) return;
    const ok = await C.confirmBox({ title: '본캐를 내려놓을까요?', sub: `다른 멤버는 정한 날로부터 ${B.BONKAE.cooldownDays}일이 지나야 고를 수 있어요 (쌓인 출연료는 그대로)`, ok: '내려놓기', danger: true });
    if (!ok) return;
    if (await after(await API.bonkaeClaim(null), '본캐를 내려놓았어요')) reopen(h);
  },
  bkFees() { C.closeInfoCard(); showFees(); },
  async bkCollect() {
    const r = await after(await API.bonkaeCollect());
    if (r && r.got) { C.toast(`출연료 +${C.fmt(r.got.coins)} 받았어요 · ${r.got.n}번 출연`, 2800); showFees(); }
  },
  bkMaster(b) {
    const id = b.dataset.id, o = owner(id);
    C.popup(`<h3 class="bk-t">마스터 · ${C.esc(HEROES[id].name)} 본캐 지정</h3>
      <p class="bk-tip">지금 본캐: <b>${o ? `${C.esc(o.nickname)} (${C.esc(o.username)})` : '없음'}</b> · 지정하면 그 계정의 다른 본캐와 이 멤버의 지금 주인은 풀려요 (30일 제한 없음)</p>
      <div class="fr-add"><input id="bkMU" maxlength="40" placeholder="아이디 또는 닉네임" autocomplete="off"><button class="btn mini primary" data-act="bkMasterGo" data-id="${id}">지정</button></div>
      ${o ? `<button class="btn ghost" data-act="bkMasterOff" data-id="${id}" style="margin-top:8px">본캐 해제</button>` : ''}`, 'bk-pop');
  },
  async bkMasterGo(b) {
    const u = (document.getElementById('bkMU') || {}).value || '';
    if (!u.trim()) { C.toast('아이디나 닉네임을 넣어 주세요'); return; }
    const r = await after(await API.bonkaeMaster(b.dataset.id, u.trim()));
    if (r) { C.toast(`${HEROES[b.dataset.id].name} 본캐 → ${r.owner ? r.owner.nickname : '없음'}`); await C.resync(); reopen(b.dataset.id); }
  },
  async bkMasterOff(b) {
    const r = await after(await API.bonkaeMaster(b.dataset.id, ''));
    if (r) { C.toast(`${HEROES[b.dataset.id].name} 본캐를 해제했어요`); await C.resync(); reopen(b.dataset.id); }
  },
};
