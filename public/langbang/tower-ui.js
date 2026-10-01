// 랑방 대전 — 진상의 탑 화면: 탑 로비(움직이는 배경 · 층 사다리 · 다음 층 카드) · 오르기 연출 · 전투 HUD · 결과 · 상점 · 랭킹 · 명예의 전당
// game.js 가 initTower(도우미) 로 부르고, 돌려받은 함수들을 화면 곳곳에 끼운다 (게임 코드는 최소한만 건드리게)
import { HEROES, ATTRS, GEAR, GEAR_IDS, GEAR_RARITY, LEGEND_HEROES, SKILL_AUG, ENEMIES, CHAPTERS } from './data.js';
import * as TW from './tower.js';
import * as L from './live.js';

let C = null; // game.js 도우미 (app · P · show · popup · toast · …)
const st = { f: 0, hero: null, board: null, boardAt: 0, hud: null, hudT: 0, last: null };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* 무시 */ } };
const P = () => C.P();
const hsIc = (cls = '') => `<img class="tw-hsi ${cls}" src="${TW.TOWER_ART.hellstone}" alt="" draggable="false">`;
const ruleIc = (r, cls = '') => `<img class="tw-ric ${cls}" src="${TW.ruleIcon(r)}" alt="" draggable="false" style="--rc:${TW.RULES[r].color}">`;
const face = (id, cls = '') => (HEROES[id] ? `<span class="tw-face ${cls}" style="--c:${ATTRS[HEROES[id].attr].color}"><img class="fz" data-face="${id}" data-fc="1" src="${C.thumbSrc(id) || HEROES[id].img}" alt="" draggable="false" style="${C.faceCircStyle(id)}" onerror="this.onerror=null;this.className='';this.removeAttribute('style');this.src='${HEROES[id].img}'"></span>` : '');
const zoneName = (z) => `${z.id}구역 · ${z.name}`;

export function initTower(ctx) {
  C = ctx;
  C.R.awakeAuraSrc = TW.TOWER_ART.aura; // 지옥 각성 오라 그림
  return { show: showTower, acts: ACTS, gameOpt, ensureMap, hudTick, onEvent, onVictory, onFail, result, lobbyButton, cardBadge, heroInfoHtml, awake: (p) => TW.awakeMap(p || P()), isTowerEvent: (t) => t === 'twCurse' || t === 'twTimeout' || t === 'skillAug' };
}

// ─── 멤버 · 층 고르기 ───
function owned() { const p = P(); return Object.keys(HEROES).filter((h) => C.API.heroUnlocked(p, h)); }
function curHero() {
  const own = owned();
  let h = st.hero || lsGet('langbang:towerHero');
  if (!h || !own.includes(h)) h = own.slice().sort((a, b) => C.heroPower(P(), b) - C.heroPower(P(), a))[0] || 'bangjang';
  st.hero = h;
  return h;
}
function curFloor() { const mx = TW.maxFloor(P()); st.f = clamp(st.f || mx, 1, mx); return st.f; }
const tw = () => P().tower || TW.emptyTower();

// 전투 옵션 (game.js startRun 이 createGame 에 덧붙인다): 한 명 · 층 규칙 · 지옥 각성
function gameOpt(t, p) {
  const def = TW.floorDef(t.f);
  return { mode: 'stage', stage: def.stage, deck: [null, null, t.hero, null, null, null], join: false, leader: t.hero, slots: 1, tower: def, towerExp: TW.TOWER.exp, awake: TW.awakeMap(p), weekly: null, hell: false, unlocked: [] };
}

// 구역 맵 (전투 배경): 처음 들어갈 때만 불러온다 (로비에서는 안 받는다)
function ensureMap(z) {
  const R = C.R, key = 'map_tower' + z;
  if (R.images[key]) return;
  const im = new Image(); im.decoding = 'async';
  im.onload = () => R.bakeBg();
  im.src = TW.ZONES[z - 1].img;
  R.images[key] = im;
}
// ─── 탑 로비 ───
function embers(n) { return Array.from({ length: n }, (_, i) => `<i style="--x:${(i * 37 + 11) % 100}%;--d:${((i * 0.73) % 6).toFixed(2)}s;--s:${(0.6 + ((i * 7) % 10) / 10).toFixed(2)};--t:${(5 + (i % 5) * 1.3).toFixed(1)}s"></i>`).join(''); }
function ladderHtml(best, cur) {
  const rows = [];
  for (let f = TW.TOWER.floors; f >= 1; f--) {
    const z = TW.zoneOf(f);
    const cls = [f <= best ? 'done' : '', f === cur ? 'cur' : '', f === best + 1 ? 'next' : '', TW.isBossFloor(f) ? 'boss' : '', TW.MILES[f] ? 'mile' : ''].join(' ');
    rows.push(`<i class="tl-f ${cls}" style="--zc:${z.color}" data-f="${f}">${TW.MILES[f] || f === best ? `<b>${f}</b>` : ''}</i>`);
  }
  return `<div class="tw-ladder" aria-label="층 사다리">${rows.join('')}<em class="tl-me" style="--p:${((cur - 0.5) / TW.TOWER.floors) * 100}%">${face(curHero(), 'xs')}</em></div>`;
}
function rewardChips(f, best) {
  if (f <= best) return '<div class="tw-rw again"><small>다시 오르기 · 층 보상 없음</small><span>주간 랭킹 · 이 멤버 각성 기록에 올라가요</span></div>';
  const r = TW.floorReward(f), m = TW.MILES[f];
  return `<div class="tw-rw"><span><i class="ci"></i>${fmt(r.coins)}</span><span>${hsIc()}${r.hell}</span>${r.stones ? `<span>${C.ic('gem', '', 'sm')}${r.stones}</span>` : ''}${r.tickets ? `<span>${C.ic('ticket', '', 'sm')}${r.tickets}</span>` : ''}${m ? `<span class="mile">${C.ic('crown', '', 'sm')}${esc(m.label)}</span>` : ''}</div>`;
}
function floorCard(f, best, main) {
  const i = TW.floorInfo(f), z = i.zone;
  const boss = i.boss && ENEMIES[i.boss];
  const rules = i.rules.map((r) => `<span class="tw-rule" style="--rc:${TW.RULES[r].color}">${ruleIc(r)}<b>${TW.RULES[r].short}</b></span>`).join('');
  if (!main) return `<button class="tw-fc mini ${boss ? 'boss' : ''} ${f <= best ? 'done' : ''}" data-act="twFloor" data-f="${f}" style="--zc:${z.color}"><em class="fc-no">${f}<small>F</small></em><span class="fc-rules">${rules}</span>${boss ? `<span class="fc-boss">${C.av(boss)}</span>` : ''}${TW.MILES[f] && f > best ? `<i class="fc-mile">${C.ic('crown', '', 'sm')}</i>` : ''}</button>`;
  const lines = i.rules.map((r) => `<li style="--rc:${TW.RULES[r].color}">${ruleIc(r)}<span><b>${esc(TW.RULES[r].name)}</b><small>${esc(TW.ruleDesc(r, f))}</small><em>${esc(TW.ruleHint(r, f))}</em></span></li>`).join('');
  const lim = Math.round(30 + 80 * TW.floorDef(f).waves.length);
  return `<div class="tw-fc main ${boss ? 'boss' : ''}" style="--zc:${z.color}">
    <div class="fc-head"><em class="fc-no">${f}<small>F</small></em><span class="fc-zone">${esc(zoneName(z))}</span>${boss ? `<span class="fc-bossart">${C.av(boss)}<b>${esc(boss.name)}</b></span>` : ''}</div>
    <ul class="fc-lines">${lines}</ul>
    <div class="fc-meta"><span>${C.ic('speed', '', 'sm')}제한 ${Math.floor(lim / 60)}분 ${lim % 60 ? `${lim % 60}초` : ''}</span><span>${C.ic('wave', '', 'sm')}웨이브 ${TW.floorDef(f).waves.length}</span></div>
    ${rewardChips(f, best)}
  </div>`;
}
function partyHtml(hero) {
  const p = P(), b = (tw().hb || {})[hero] | 0, aw = TW.awakeLv(p, hero);
  const slots = [0, 1, 2, 3, 4, 5].map((i) => (i === 2 ? `<button class="tw-slot on" data-act="twPick">${face(hero, 'big')}${aw ? `<i class="tw-awk l${aw}">${aw >= 3 ? '지옥 각성' : `각성 ${'I'.repeat(aw)}`}</i>` : ''}</button>` : `<span class="tw-slot lock">${C.ic('lock', '', 'sm')}</span>`)).join('');
  const nextA = TW.AWAKE.find((a) => b < a.f);
  return `<div class="tw-party">
    <div class="tw-slots">${slots}</div>
    <button class="tw-who" data-act="twPick"><b>${esc(HEROES[hero].name)}</b><small>이 멤버 최고 ${b}F${nextA ? ` · ${nextA.f}F 에서 ${esc(nextA.name)}` : ' · 지옥 각성 완료'}</small><i class="tw-abar"><b style="width:${Math.round((b / 60) * 100)}%"></b>${TW.AWAKE.map((a) => `<u style="left:${(a.f / 60) * 100}%" class="${b >= a.f ? 'on' : ''}"></u>`).join('')}</i><em>멤버 바꾸기</em></button>
  </div>`;
}
function hallHtml() {
  const bd = st.board;
  const list = bd && Array.isArray(bd.hall) ? bd.hall : [];
  const me = tw().hall;
  const rows = list.map((r) => `<span class="th-row">${face(r.hero, 'xs')}<b>${esc(r.nickname)}</b><small>${esc((HEROES[r.hero] || {}).name || '')}</small></span>`);
  if (C.app.guest && me) rows.unshift(`<span class="th-row me">${face(me.hero, 'xs')}<b>나 (손님)</b><small>${esc(HEROES[me.hero].name)}</small></span>`);
  return `<div class="tw-hall"><span class="th-tag">${C.ic('trophy', '', 'sm')}명예의 전당</span><div class="th-list">${rows.length ? `<div class="th-track">${rows.join('')}${rows.length > 2 ? rows.join('') : ''}</div>` : '<small class="th-empty">아직 60층 정복자가 없어요 — 첫 이름을 새기세요</small>'}</div></div>`;
}
function showTower() {
  const p = P();
  if (!TW.towerOpen(p)) { C.toast(`진상의 탑은 1-${TW.TOWER.unlock}을 깨면 열려요`, 2400); return; }
  const app = C.app;
  app.screen = 'tower';
  app.g = null; app.demo = null; app.paused = false;
  C.hud.hidden = true;
  if (C.A.setMode) C.A.setMode('tower');
  C.A.setBoss(false);
  if (app.touched) C.A.playBgm();
  renderLobby();
  loadBoard();
  claimWeek();
}
function renderLobby() {
  const p = P(), t = tw();
  const hero = curHero(), f = curFloor(), best = t.best | 0;
  const z = TW.zoneOf(f);
  const left = TW.triesLeft(p);
  const free = p.master && !p.testNormal;
  const list = [];
  for (let k = 1; k <= 4 && f + k <= TW.TOWER.floors; k++) list.push(f + k);
  const el = C.show(`
    <div class="tw-scene z${z.id}" style="--zc:${z.color}">
      <div class="tw-bg"><i class="tw-far"></i><i class="tw-near"></i><i class="tw-vortex"></i><i class="tw-bolt"></i><i class="tw-heat"></i><i class="tw-vig"></i></div>
      <div class="tw-embers">${embers(26)}</div>
    </div>
    <div class="tw-top"><button class="back" data-act="menu">‹ 로비</button>
      <div class="tw-cur"><button class="tw-pill hs" data-act="twShop">${hsIc()}<b>${fmt(t.stone | 0)}</b></button><span class="tw-pill tries ${left ? '' : 'none'}">${C.ic('energy', '', 'sm')}<b>${free ? '∞' : `${left}/${TW.TOWER.tries}`}</b></span></div></div>
    <div class="tw-title"><small>${esc(z.sub)}</small><h2>진상의 탑</h2><em>최고 <b>${best}F</b> · ${esc(zoneName(TW.zoneOf(Math.max(1, best || 1))))}</em></div>
    <div class="tw-main">
      ${ladderHtml(best, f)}
      <div class="tw-col">
        <div class="tw-step"><button class="tw-arrow" data-act="twStep" data-d="-1" ${f <= 1 ? 'disabled' : ''} aria-label="아래층">‹</button><span>${f > best ? '다음 층' : '다시 오르기'}</span><button class="tw-arrow" data-act="twStep" data-d="1" ${f >= TW.maxFloor(p) ? 'disabled' : ''} aria-label="위층">›</button></div>
        ${floorCard(f, best, true)}
        <div class="tw-next"><small>위로 이어지는 층</small>${list.map((x) => floorCard(x, best, false)).join('') || '<span class="tw-top-done">꼭대기!</span>'}</div>
      </div>
    </div>
    ${partyHtml(hero)}
    <button class="tw-go ${left || free ? '' : 'off'}" data-act="twGo" ${left || free ? '' : 'disabled'}><i class="tg-fire"></i><span><b>${f}층 오르기</b><small>${left || free ? '도전 1번 · 깨면 돌려받아요' : '오늘 도전을 다 썼어요 · 자정에 초기화'}</small></span></button>
    <div class="tw-menu"><button data-act="twShop">${hsIc()}<small>탑 상점</small>${t.picks && (t.picks.legend || t.picks.hero) ? '<i class="rd"></i>' : ''}</button><button data-act="twRank">${C.ic('trophy', '', 'sm')}<small>주간 랭킹</small></button><button data-act="twAwake">${C.ic('fire', '', 'sm')}<small>지옥 각성</small></button><button data-act="twInfo">${C.ic('book', '', 'sm')}<small>보상 안내</small></button></div>
    ${hallHtml()}
  `, 'tower-screen');
  bindParallax(el);
  const cur = el.querySelector('.tl-f.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
}
// 손가락 · 기울이기에 따라 배경 층이 따로 움직인다 (깊이감)
function bindParallax(el) {
  const sc = el.querySelector('.tw-scene');
  if (!sc) return;
  const set = (x, y) => { sc.style.setProperty('--px', x.toFixed(3)); sc.style.setProperty('--py', y.toFixed(3)); };
  el.addEventListener('pointermove', (ev) => { const r = el.getBoundingClientRect(); set((ev.clientX - r.left) / r.width - 0.5, (ev.clientY - r.top) / r.height - 0.5); }, { passive: true });
  if (!bindParallax.ori) { bindParallax.ori = true; window.addEventListener('deviceorientation', (e) => { const s0 = document.querySelector('.tw-scene'); if (!s0 || e.gamma == null) return; s0.style.setProperty('--px', clamp(e.gamma / 60, -0.5, 0.5).toFixed(3)); s0.style.setProperty('--py', clamp((e.beta - 45) / 90, -0.5, 0.5).toFixed(3)); }, { passive: true }); }
}
async function loadBoard(force) {
  if (!force && st.board && Date.now() - st.boardAt < 60e3) return st.board;
  const bd = await C.API.towerBoard().catch(() => null);
  if (bd) { st.board = bd; st.boardAt = Date.now(); if (C.app.screen === 'tower') { const h = document.querySelector('.tw-hall'); if (h) h.outerHTML = hallHtml(); } }
  return bd;
}
// 지난주 순위 보상: 탑 로비에 들어오면 알아서 받는다
async function claimWeek() {
  if (C.app.guest) return;
  const bd = await loadBoard();
  if (!bd || !bd.prev || !bd.prev.reward || bd.prev.claimed) return;
  const r = await C.liveAct(C.API.towerClaim());
  if (r) { C.A.sfx.reward && C.A.sfx.reward(); C.popup(`<h3>${C.ic('trophy', '', 'sm')}지난주 탑 랭킹 ${r.rank}위!</h3><p class="ip big-got">${esc(r.label || '')}</p><p class="ip">${esc(gotLine(r.got))}</p><button class="btn primary" data-x>받았어요</button>`, 'tw-pop'); st.board = null; }
}
function gotLine(got) {
  if (!got) return '';
  const a = [C.gotText(got)];
  if (got.hell) a.push(`염화석 ${got.hell}`);
  if (got.legendPick) a.push(`전설 장비 선택권 ${got.legendPick}`);
  if (got.heroPick) a.push(`LEGEND 멤버 카드 묶음 ${got.heroPick}`);
  return a.filter(Boolean).join(' · ');
}

// ─── 멤버 고르기 · 각성 · 안내 ───
function pickPop() {
  const p = P(), t = tw(), cur = curHero();
  const list = owned().sort((a, b) => C.heroPower(p, b) - C.heroPower(p, a));
  const rows = list.map((h) => { const b = (t.hb || {})[h] | 0, aw = TW.awakeLv(p, h); return `<button class="tw-pk ${h === cur ? 'on' : ''} ${aw >= 3 ? 'aw3' : ''}" data-act="twPickHero" data-h="${h}">${face(h)}<b>${esc(HEROES[h].name)}</b><small>최고 ${b}F</small><i class="tw-pips">${[1, 2, 3].map((k) => `<u class="${aw >= k ? 'on' : ''}"></u>`).join('')}</i><em>${C.ic('swords', '', 'sm')}${fmt(C.heroPower(p, h))}</em></button>`; }).join('');
  C.popup(`<h3>${C.ic('duo', '', 'sm')}탑에 오를 멤버</h3><p class="ip">탑에서는 <b>한 명만</b> 싸워요 · 층 규칙에 맞는 멤버를 골라요 · 각성은 멤버마다 따로</p><div class="tw-pkgrid">${rows}</div>`, 'tw-pop tw-pick');
}
function awakePop() {
  const p = P(), t = tw();
  const list = owned().sort((a, b) => ((t.hb || {})[b] | 0) - ((t.hb || {})[a] | 0));
  const rows = list.map((h) => { const b = (t.hb || {})[h] | 0, aw = TW.awakeLv(p, h); return `<div class="tw-awr ${aw >= 3 ? 'aw3' : ''}">${face(h)}<span><b>${esc(HEROES[h].name)}</b><i class="tw-abar"><b style="width:${Math.round((b / 60) * 100)}%"></b>${TW.AWAKE.map((a) => `<u style="left:${(a.f / 60) * 100}%" class="${b >= a.f ? 'on' : ''}"></u>`).join('')}</i></span><em>${b}F</em></div>`; }).join('');
  C.popup(`<h3>${C.ic('fire', '', 'sm')}지옥 각성</h3><div class="tw-awk-info">${TW.AWAKE.map((a, i) => `<div><b>${a.f}F · ${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div><p class="ip">그 멤버로 오른 최고 층으로 각성해요 · 깬 층을 다른 멤버로 다시 올라도 기록돼요</p><div class="tw-awlist">${rows}</div>`, 'tw-pop');
}
function infoPop() {
  const rules = Object.keys(TW.RULES).map((r) => `<div class="tw-ir">${ruleIc(r)}<span><b>${esc(TW.RULES[r].name)}</b><small>${esc(TW.RULES[r].desc)}</small><em>${esc(TW.RULES[r].hint)}</em></span></div>`).join('');
  const miles = Object.entries(TW.MILES).map(([f, m]) => `<p class="ip">${C.ic('crown', '', 'sm')}<b>${f}F</b> ${esc(m.label)}</p>`).join('');
  C.popup(`<h3>${C.ic('book', '', 'sm')}진상의 탑 안내</h3>
    <p class="ip">60층 · 15층마다 구역 · 5층마다 보스 · 46층부터 규칙 둘 · 멤버 <b>한 명</b>만 · 위로 갈수록 진상 체력 ×${TW.TOWER.hpGrow} (복리)</p>
    <p class="ip">하루 도전 <b>${TW.TOWER.tries}번</b> (자정 초기화) · 깬 판은 도전을 돌려받아요 · 체력은 안 써요</p>
    <h4 class="gl-h">층 규칙</h4>${rules}
    <h4 class="gl-h">보상 (층을 처음 깰 때)</h4><p class="ip">코인 · 염화석 · 강화석 · 보스 층 모집권 · 구역 끝 모집권 3</p>${miles}
    <h4 class="gl-h">주간 탑 랭킹</h4><p class="ip">이번 주에 깬 가장 높은 층 (같으면 더 빨리 깬 기록) · 1위 칭호 "이번 주 탑의 주인" (다음 한 주) + 코인 5,000 · 모집권 3 · 염화석 40 · TOP 10 작은 보상</p>
    <h4 class="gl-h">명예의 전당</h4><p class="ip">60층을 정복하면 닉네임과 함께 오른 멤버가 탑 로비에 영원히 새겨져요</p>
    <button class="btn primary" data-x>알겠어요</button>`, 'tw-pop rw-info');
}

// ─── 랭킹 ───
async function rankPop() {
  const draw = (bd) => {
    const top = bd && bd.top ? bd.top.map((r) => `<div class="wrow tw-wr ${r.rank <= 3 ? 'top' + r.rank : ''}"><span class="rk">${r.rank <= 3 ? C.ic('medal' + r.rank, '', 'sm') : r.rank}</span>${face(r.hero, 'xs')}<span class="nm ${C.frameCls(r.frame)}" style="${C.frameStyle(r.frame)}">${C.whoHtml(r.nickname, r.title)}</span><span class="wv">${fmtSec(r.sec)}</span><b>${r.f}F</b></div>`).join('') || '<div class="empty-msg">이번 주 기록이 아직 없어요 — 첫 등반가!</div>'
      : `<div class="empty-msg">${C.app.guest ? '로그인하면 친구들과 탑 순위 경쟁!' : '<span class="spin"></span> 불러오는 중…'}</div>`;
    const me = bd && bd.me;
    const wk = tw().wk && tw().wk.wi === L.weekIndex() ? tw().wk : null;
    C.popup(`<h3>${C.ic('trophy', '', 'sm')}주간 탑 랭킹</h3><p class="ip">${L.leftText(L.msToWeekEnd())} 남음 · 1위는 다음 한 주 "이번 주 탑의 주인"</p>
      <div class="wmy"><div><small>이번 주 최고</small><b>${wk ? `${wk.f}F` : '-'}</b></div><div><small>걸린 시간</small><b>${wk ? fmtSec(wk.sec) : '-'}</b></div><div><small>내 순위</small><b>${me && me.rank ? me.rank + '위' : '-'}</b></div></div>
      <div class="panel wboard">${top}</div>`, 'tw-pop tw-rank');
  };
  draw(st.board);
  const bd = await loadBoard(true);
  if (document.querySelector('.tw-rank')) draw(bd);
}
const fmtSec = (s) => `${Math.floor((s | 0) / 60)}:${String((s | 0) % 60).padStart(2, '0')}`;

// ─── 탑 상점 · 지옥 세트 · 선택권 ───
function shopPop() {
  const p = P(), t = tw(), hero = curHero();
  const hs = t.hs || {};
  const onHero = TW.HELL_IDS.filter((id) => hs[id] && hs[id].on === hero).length;
  const pieces = TW.HELL_IDS.map((id) => {
    const s = TW.HELL_SET[id], it = hs[id];
    const v = it ? TW.hellValue(id, it.lv) : s.base;
    const btns = !it ? `<button class="btn primary sm" data-act="twBuy" data-id="${id}" ${t.stone >= s.cost ? '' : 'disabled'}>${hsIc()}${s.cost} 사기</button>`
      : `${it.lv < TW.HELL_MAX ? `<button class="btn sm" data-act="twUp" data-id="${id}" ${t.stone >= TW.hellUpCost(it.lv) ? '' : 'disabled'}>${hsIc()}${TW.hellUpCost(it.lv)} 강화</button>` : '<span class="tw-max">MAX</span>'}<button class="btn sm ${it.on === hero ? 'on' : 'primary'}" data-act="twEquip" data-id="${id}">${it.on === hero ? '빼기' : `${esc(HEROES[hero].name)} 끼기`}</button>`;
    return `<div class="tw-hg ${it ? 'own' : ''} ${it && it.on === hero ? 'worn' : ''}"><i class="tw-hgi"><img src="${TW.hellImg(id)}" alt="" draggable="false"></i><span><b>${esc(s.name)}${it && it.lv ? ` +${it.lv}` : ''}</b><small>${esc(s.desc)} +${(v * 100).toFixed(1)}%${it && it.on && it.on !== hero ? ` · ${esc(HEROES[it.on].name)} 착용 중` : ''}</small></span><div class="tw-hgb">${btns}</div></div>`;
  }).join('');
  const shop = TW.TOWER_SHOP.map((s) => {
    const left = TW.shopLeft(p, s.id);
    const name = s.kind === 'cons' ? L.CONS[s.id].name : s.name;
    const icon = s.kind === 'cons' ? C.consIc(s.id) : C.ic(s.kind === 'tickets' ? 'ticket' : 'gem', '', '');
    return `<div class="tw-si">${icon}<span><b>${esc(name)}</b><small>${s.per === 'week' ? '이번 주' : '오늘'} ${left}/${s.n}</small></span><button class="btn sm ${left && t.stone >= s.cost ? 'primary' : ''}" data-act="twBuy" data-id="${s.id}" ${left && t.stone >= s.cost ? '' : 'disabled'}>${hsIc()}${s.cost}</button></div>`;
  }).join('');
  const picks = t.picks || {};
  const pickRow = (picks.legend ? `<button class="tw-pickbtn" data-act="twPickGear">${C.ic('gift', '', 'sm')}<b>전설 장비 선택권 ${picks.legend}</b><small>원하는 장비를 전설 등급으로</small></button>` : '')
    + (picks.hero ? `<button class="tw-pickbtn legend" data-act="twPickLegend">${C.ic('crown', '', 'sm')}<b>LEGEND 멤버 카드 묶음 ${picks.hero}</b><small>이호찬 · 강병화 중 한 명 합류</small></button>` : '');
  C.popup(`<h3>${hsIc('big')}탑 상점</h3><p class="ip">염화석 <b>${fmt(t.stone | 0)}</b> · 층을 처음 깨면 (보스 층은 세 배) · 주간 랭킹 보상</p>
    ${pickRow ? `<div class="tw-picks">${pickRow}</div>` : ''}
    <h4 class="gl-h">지옥 세트 <small>${esc(HEROES[hero].name)} ${onHero}/4 착용</small></h4>
    <div class="tw-setb"><span class="${onHero >= 2 ? 'on' : ''}">${esc(TW.HELL_BONUS[2].label)}</span><span class="${onHero >= 4 ? 'on' : ''}">${esc(TW.HELL_BONUS[4].label)}</span></div>
    <div class="tw-hglist">${pieces}</div>
    <p class="ip">지옥 세트는 탑 밖(스테이지 · 무한 · 대전)에서도 그 멤버에게 그대로 적용돼요</p>
    <h4 class="gl-h">소모품 · 재료</h4><div class="tw-silist">${shop}</div>`, 'tw-pop tw-shop');
}
function pickGearPop() {
  const rows = GEAR_IDS.map((t) => `<button class="tw-gpk" data-act="twPickGearDo" data-t="${t}"><i class="gico r-legend" style="--rc:${GEAR_RARITY.legend.color}"><img src="${GEAR[t].img}" alt="" draggable="false"></i><b>${esc(GEAR[t].name)}</b><small>${esc((C.GEAR_STATS[GEAR[t].stat] || {}).name || '')}</small></button>`).join('');
  C.popup(`<h3>${C.ic('gift', '', 'sm')}전설 장비 선택권</h3><p class="ip">고른 장비가 <b>전설</b> 등급으로 가방에 들어가요</p><div class="tw-gpgrid">${rows}</div>`, 'tw-pop tw-gp');
}
function pickLegendPop() {
  const rows = LEGEND_HEROES.map((h) => `<button class="tw-lpk" data-act="twPickLegendDo" data-h="${h}">${face(h, 'big')}<b>${esc(HEROES[h].name)}</b><small>${C.API.heroUnlocked(P(), h) ? `이미 합류 · 조각 +${L.DUP_SHARDS.legendHero}` : '바로 합류!'}</small></button>`).join('');
  C.popup(`<h3>${C.ic('crown', '', 'sm')}LEGEND 멤버 카드 묶음</h3><p class="ip">60층 정복 보상 · 한 명을 골라요</p><div class="tw-lpgrid">${rows}</div>`, 'tw-pop');
}

// ─── 오르기: 시작 → 엘리베이터 연출 → 전투 ───
async function go(f, hero) {
  const app = C.app;
  if (st.busy) return;
  st.busy = true;
  try {
    const r = await C.API.towerStart(f, hero, app.guest);
    if (!r.ok) { C.toast(r.message || '오를 수 없어요', 2400); return; }
    if (r.profile) app.profile = r.profile;
    app.towerRun = { runId: r.runId, f, hero };
    lsSet('langbang:towerHero', hero);
    const from = st.last && st.last.f ? st.last.f : Math.max(0, f - 1);
    await climb(from, f);
    C.startRun({ mode: 'tower', force: true, tower: { f, hero, runId: r.runId } });
  } finally { st.busy = false; }
}
// 엘리베이터 연출: 벽이 아래로 지나가고 · 층 숫자가 올라가고 · 붉은 빛 · 쿵 (구역이 바뀌면 큰 컷인)
function climb(from, to) {
  return new Promise((res) => {
    const z = TW.zoneOf(to), zc = from > 0 && TW.zoneOf(from).id !== z.id;
    const rules = TW.floorRules(to);
    const reduce = document.body.classList.contains('rm');
    const d = document.createElement('div');
    d.className = `tw-climb z${z.id} ${zc ? 'zc' : ''}`;
    d.style.setProperty('--zc', z.color);
    const digits = (n) => String(n).padStart(2, '0');
    d.innerHTML = `<div class="tc-shaft" style="background-image:url('${z.img}')"><i style="background-image:url('${z.img}')"></i></div><div class="tc-wall l"></div><div class="tc-wall r"></div><div class="tc-sweep"></div><div class="tc-dark"></div>
      <div class="tc-counter"><span class="tc-roll"><b>${digits(from || to - 1 || 0)}</b><b>${digits(to)}</b></span><em>F</em></div>
      ${zc ? `<div class="tc-zone"><small>${z.id}구역</small><b>${esc(z.name)}</b><em>${esc(z.sub)}</em></div>` : `<div class="tc-zsub">${esc(zoneName(z))}</div>`}
      <div class="tc-rules">${rules.map((r) => `<span style="--rc:${TW.RULES[r].color}">${ruleIc(r)}${esc(TW.RULES[r].name)}</span>`).join('')}${TW.isBossFloor(to) ? `<span class="boss">${esc((ENEMIES[TW.floorBoss(to)] || {}).name || '')}</span>` : ''}</div>`;
    C.stage.appendChild(d);
    try { C.A.sfx.rise && C.A.sfx.rise(); } catch { /* 무시 */ }
    const T0 = reduce ? 600 : zc ? 3300 : 2300;
    setTimeout(() => { d.classList.add('roll'); try { C.A.sfx.slam(); } catch { /* 무시 */ } }, reduce ? 0 : 650);
    setTimeout(() => { d.classList.add('thud'); try { C.A.sfx.thud(); } catch { /* 무시 */ } }, reduce ? 100 : 1150);
    if (zc && !reduce) setTimeout(() => { d.classList.add('cut'); try { C.A.sfx.horn ? C.A.sfx.horn() : C.A.sfx.boss(); } catch { /* 무시 */ } }, 1500);
    setTimeout(() => { d.classList.add('out'); res(); setTimeout(() => d.remove(), 600); }, T0);
  });
}

// ─── 전투 중 ───
// HUD: "지옥 13F" 배지 · 규칙 아이콘 · 남은 시간
function hudTick(g) {
  let el = st.hud;
  if (!g || !g.tower) { if (el) { el.remove(); st.hud = null; } return; }
  if (!el || !el.isConnected) {
    el = document.createElement('div'); el.className = 'tw-hud';
    el.innerHTML = `<b class="th-f" style="--zc:${TW.zoneOf(g.tower.f).color}">지옥 <em>${g.tower.f}F</em></b><span class="th-r">${g.tower.rules.map((r) => ruleIc(r)).join('')}</span><i class="th-t"></i>`;
    C.stage.appendChild(el); st.hud = el;
  }
  const left = Math.max(0, Math.ceil(g.tower.limit - g.t));
  const tt = el.querySelector('.th-t');
  const txt = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (tt.textContent !== txt) { tt.textContent = txt; tt.classList.toggle('warn', left <= 30); }
  el.hidden = C.app.screen !== 'play';
}
// 탑 전용 이벤트 연출 (game.js handleEvents 에서)
const CURSE_TXT = { stun: '저주: 기절!', silence: '저주: 침묵', charm: '저주: 홀림', slow: '저주: 손이 굳는다' };
function onEvent(g, e, loud) {
  const fx = C.fx;
  if (e.type === 'twCurse') {
    for (let k = 1; k <= 7; k++) fx.part('spark', e.ex + ((e.x - e.ex) * k) / 8, e.ey + ((e.y - 40 - e.ey) * k) / 8, 0, 0, 0.35, 4, '#c77dff');
    fx.text(e.x, e.y - 84, CURSE_TXT[e.kind] || '저주!', '#d9a8ff', 14, 1.0, -20);
    C.R.vfx(e.kind === 'silence' ? 'silence' : e.kind === 'slow' ? 'aura_blue' : 'aura_red', e.x, e.y - (e.kind === 'silence' ? 86 : 0), { anim: 'pulse', dur: 900, sz: e.kind === 'silence' ? 46 : 110, flat: e.kind !== 'silence' });
    if (loud) C.A.sfx.charm();
  } else if (e.type === 'twTimeout') {
    fx.banner('시간 초과!', '탑의 문이 닫혔다', '#5a0a1a', 1.8, 'big');
  } else if (e.type === 'skillAug') {
    fx.banner(`${(HEROES[e.hero] || {}).name || ''} 전용 증강`, e.name, '#8a1a2a', 1.4, 'wave', 'h_' + e.hero);
    fx.ring(e.x, e.y - 30, 10, 80, 0.6, '#ff6a3c', 5);
    for (let k = 0; k < 10; k++) fx.part('flame', e.x + (Math.random() - 0.5) * 40, e.y, (Math.random() - 0.5) * 60, -90 - Math.random() * 60, 0.8, 12, null);
    if (loud) C.A.sfx.reveal ? C.A.sfx.reveal('epic') : C.A.sfx.levelUp();
  }
}
function onVictory(g) {
  const fx = C.fx;
  fx.banner(`${g.tower.f}층 돌파!`, g.tower.f >= TW.TOWER.floors ? '진상 대왕을 쓰러뜨렸다!' : '다음 층이 열렸다', '#a0200a', 2.6, 'big');
  fx.flash('#ffb070', 0.5);
  for (let k = 0; k < 26; k++) fx.part('flame', 30 + Math.random() * 300, g.H * 0.55 + Math.random() * 160, (Math.random() - 0.5) * 50, -120 - Math.random() * 140, 1.4, 10 + Math.random() * 8, null);
}
function onFail(g) {
  const fx = C.fx;
  fx.banner(g.tower && g.t >= g.tower.limit ? '시간 초과…' : '탑에서 떨어졌다…', '다시 올라가자', '#3a0612', 2.2, 'big');
  C.stage.classList.add('tw-falling');
  setTimeout(() => C.stage.classList.remove('tw-falling'), 2600);
}

// ─── 결과: 돌파 · 보상 상자 / 추락 ───
function result(g, victory, quit) {
  const app = C.app;
  app.screen = 'result';
  C.hud.hidden = true;
  hudTick(null);
  const sum = C.S.summary(g, g.t);
  const f = g.tower.f, run = app.towerRun || {};
  const hero = run.hero || (g.heroes.find((h) => !h.def.summon) || {}).id || curHero();
  const time = fmtSec(g.t);
  const z = TW.zoneOf(f);
  const win = !!victory;
  const el = C.show(`
    <div class="tw-scene z${z.id} res ${win ? 'win' : 'lose'}" style="--zc:${z.color}"><div class="tw-bg"><i class="tw-far"></i><i class="tw-near"></i><i class="tw-heat"></i><i class="tw-vig"></i></div><div class="tw-embers">${embers(win ? 30 : 10)}</div></div>
    <div class="tw-res ${win ? 'win' : 'lose'}">
      <em class="tr-floor">${f}<small>F</small></em>
      <h2>${win ? `${f}층 돌파!` : quit ? '오늘은 여기까지' : g.tower && g.t >= g.tower.limit ? '시간 초과…' : '탑에서 떨어졌다…'}</h2>
      <p class="sub">${win ? `${esc(HEROES[hero].name)} · ${time}` : `${esc(TW.zoneOf(f).name)} · 웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}`}</p>
      <div class="tr-chest ${win ? 'wait' : 'none'}" id="twChest">${win ? '<i class="tc-box"></i><i class="tc-lid"></i><i class="tc-glow"></i>' : ''}</div>
      <div class="tr-rw" id="twRw">${win ? '<span class="spin"></span> 보상 받는 중…' : ''}</div>
      <div class="stats"><div><small>처치</small><b>${fmt(sum.kills)}</b></div><div><small>시간</small><b>${time}</b></div><div><small>레벨</small><b>${g.level}</b></div></div>
    </div>
    <div class="tw-resbtns" id="twBtns"></div>
  `, `tower-screen result-tw ${win ? 'win' : 'lose'}`);
  void el;
  const btns = (r) => {
    const p = P(), left = TW.triesLeft(p), free = p.master && !p.testNormal;
    const nf = Math.min(TW.TOWER.floors, f + 1);
    const canNext = win && f < TW.TOWER.floors && nf <= TW.maxFloor(p);
    const b = [];
    if (canNext) b.push(`<button class="tw-go" data-act="twNext" data-f="${nf}" data-h="${hero}" ${left || free ? '' : 'disabled'}><i class="tg-fire"></i><span><b>${nf}층으로 오르기</b><small>${left || free ? `남은 도전 ${free ? '∞' : left}` : '오늘 도전을 다 썼어요'}</small></span></button>`);
    else if (!win && !quit) b.push(`<button class="tw-go retry" data-act="twNext" data-f="${f}" data-h="${hero}" ${left || free ? '' : 'disabled'}><span><b>다시 도전</b><small>${left || free ? `남은 도전 ${free ? '∞' : left}` : '오늘 도전을 다 썼어요 · 자정에 초기화'}</small></span></button>`);
    b.push('<div class="grid2"><button class="btn" data-act="tower">탑 로비</button><button class="btn ghost" data-act="menu">메인 메뉴</button></div>');
    const box = document.getElementById('twBtns'); if (box) box.innerHTML = b.join('');
    void r;
  };
  btns();
  st.last = { f, win };
  if (app.debugRun) { const rw = document.getElementById('twRw'); if (rw) rw.innerHTML = '<div class="guest-note">디버그 판은 기록을 저장하지 않아요</div>'; return; }
  Promise.resolve(C.API.towerFinish({ runId: run.runId, clear: win, durationSec: Math.round(g.t), kills: sum.kills, bossKills: sum.bossKills, skills: sum.skills }, app.guest)).then((r) => {
    app.towerRun = null;
    if (r && r.ok && r.profile) app.profile = r.profile;
    btns(r);
    const rw = document.getElementById('twRw'), ch = document.getElementById('twChest');
    if (!rw) return;
    if (!r || !r.ok) { rw.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc((r && r.message) || '')}</div>`; return; }
    if (!win) { rw.innerHTML = `<div class="tr-lines"><span>도전 ${r.left}/${TW.TOWER.tries} 남음</span><span>층 규칙에 맞는 다른 멤버로도 도전해 봐요</span></div>`; return; }
    const lines = [];
    const got = r.reward;
    if (got) {
      lines.push(`<span class="g"><i class="ci"></i>+${fmt(got.coins || 0)}</span>`, `<span class="g">${hsIc()}염화석 +${got.hell || 0}</span>`);
      if (got.stones) lines.push(`<span class="g">${C.ic('gem', '', 'sm')}강화석 +${got.stones}</span>`);
      if (got.tickets) lines.push(`<span class="g">${C.ic('ticket', '', 'sm')}모집권 +${got.tickets}</span>`);
    } else lines.push('<span>다시 오른 층 · 층 보상 없음</span>');
    if (r.weekBest) lines.push(`<span class="hl">${C.ic('trophy', '', 'sm')}이번 주 최고 기록!</span>`);
    for (const m of r.miles || []) lines.push(`<span class="mile">${C.ic('crown', '', 'sm')}${m.f}F 달성 보상 — ${esc(m.label)}</span>`);
    if (r.awake) lines.push(`<span class="awk">${C.ic('fire', '', 'sm')}${esc(HEROES[r.awake.hero].name)} ${esc(TW.AWAKE[r.awake.to - 1].name)}! ${esc(TW.AWAKE[r.awake.to - 1].desc)}</span>`);
    if (r.hall) lines.push(`<span class="mile">${C.ic('trophy', '', 'sm')}명예의 전당에 이름이 새겨졌다!</span>`);
    setTimeout(() => {
      if (ch) { ch.classList.remove('wait'); ch.classList.add('open'); }
      try { C.A.sfx.reward ? C.A.sfx.reward() : C.A.sfx.levelUp(); } catch { /* 무시 */ }
      rw.innerHTML = `<div class="tr-lines">${lines.join('')}</div>`;
      if (r.awake && r.awake.to >= 1) { C.fx.flash('#ff6a3c', 0.4); }
      if ((r.miles || []).length || r.hall) setTimeout(() => milePop(r), 900);
    }, 650);
  });
}
function milePop(r) {
  const parts = (r.miles || []).map((m) => `<p class="ip big-got">${C.ic('crown', '', 'sm')}${m.f}F · ${esc(m.label)}</p>`);
  if (r.hall) parts.push(`<p class="ip big-got">${C.ic('trophy', '', 'sm')}명예의 전당 등록 — ${esc(HEROES[r.hero].name)}와 함께</p>`);
  C.popup(`<h3>${C.ic('sparkle', '', 'sm')}탑 달성 보상!</h3>${parts.join('')}${(r.miles || []).some((m) => m.got && (m.got.legendPick || m.got.heroPick)) ? '<p class="ip">선택권은 탑 상점에서 써요</p>' : ''}<button class="btn primary" data-x>좋아요</button>`, 'tw-pop tw-mile');
  try { C.A.sfx.reveal ? C.A.sfx.reveal('legend') : C.A.sfx.levelUp(); } catch { /* 무시 */ }
}

// ─── 로비 버튼 · 카드 배지 · 멤버 상세 ───
function lobbyButton(p) {
  const open = TW.towerOpen(p), t = p.tower || {};
  const left = TW.triesLeft(p);
  return `<button class="tw-entry ${open ? '' : 'locked'} ${p.master ? 'm' : ''}" data-act="tower"><i class="te-glow"></i><span class="te-ico"><img src="${TW.TOWER_ART.tile}" alt="" draggable="false"></span><span class="te-txt"><b>진상의 탑</b><small>${open ? `최고 ${t.best | 0}F · 도전 ${p.master && !p.testNormal ? '∞' : left}` : `1-${TW.TOWER.unlock} 클리어`}</small></span>${open && left === TW.TOWER.tries && !(t.best | 0) ? '<i class="rd"></i>' : ''}</button>`;
}
function cardBadge(id) { const v = TW.awakeLv(P(), id); return v >= 3 ? '<i class="tw-awk3">지옥 각성</i>' : v ? `<i class="tw-awkpip">${'I'.repeat(v)}</i>` : ''; }
function heroInfoHtml(id) {
  const p = P(), b = ((p.tower || {}).hb || {})[id] | 0, aw = TW.awakeLv(p, id);
  const augs = (SKILL_AUG[id] || []).map((a) => `<li><b>${esc(a.name)}</b> ${esc(a.desc)}</li>`).join('');
  return `<div class="hm-sec tw-hm"><h4>${C.ic('fire', '', 'sm')}진상의 탑 · 지옥 각성 <small>최고 ${b}F</small></h4>
    <i class="tw-abar"><b style="width:${Math.round((b / 60) * 100)}%"></b>${TW.AWAKE.map((a) => `<u style="left:${(a.f / 60) * 100}%" class="${b >= a.f ? 'on' : ''}"></u>`).join('')}</i>
    <ul>${TW.AWAKE.map((a, i) => `<li class="${aw > i ? 'on' : ''}"><b>${a.f}F ${esc(a.name)}</b> ${esc(a.desc)}</li>`).join('')}</ul>
    ${augs ? `<h4>${C.ic('sparkle', '', 'sm')}전용 스킬 증강 <small>레벨업 카드로 나와요</small></h4><ul>${augs}</ul>` : ''}</div>`;
}

// ─── 버튼 ───
const ACTS = {
  tower: () => showTower(),
  twStep: (b) => { st.f = clamp(curFloor() + Number(b.dataset.d), 1, TW.maxFloor(P())); C.A.sfx.tabSw && C.A.sfx.tabSw(); renderLobby(); },
  twFloor: (b) => { const f = Number(b.dataset.f); if (f <= TW.maxFloor(P())) { st.f = f; renderLobby(); } else C.toast('아래층을 먼저 깨야 열려요', 1400); },
  twPick: () => pickPop(),
  twPickHero: (b) => { st.hero = b.dataset.h; lsSet('langbang:towerHero', st.hero); C.closeInfoCard(); renderLobby(); },
  twGo: () => go(curFloor(), curHero()),
  twNext: (b) => go(Number(b.dataset.f), b.dataset.h || curHero()),
  twShop: () => shopPop(),
  twRank: () => rankPop(),
  twAwake: () => awakePop(),
  twInfo: () => infoPop(),
  twBuy: async (b) => { const r = await C.liveAct(C.API.towerShop(b.dataset.id, C.app.guest)); if (r) { C.A.sfx.reward ? C.A.sfx.reward() : C.A.sfx.levelUp(); C.toast(r.got && r.got.hellGear ? `${TW.HELL_SET[r.got.hellGear].name} 획득!` : `샀어요! ${C.gotText(r.got)}`, 1800); shopPop(); if (C.app.screen === 'tower') renderLobby(); } },
  twUp: async (b) => { const r = await C.liveAct(C.API.towerHellUp(b.dataset.id, C.app.guest)); if (r) { C.A.sfx.levelUp(); C.toast(`${TW.HELL_SET[b.dataset.id].name} +${r.lv}!`, 1600); shopPop(); if (C.app.screen === 'tower') renderLobby(); } },
  twEquip: async (b) => { const id = b.dataset.id, hero = curHero(), it = (tw().hs || {})[id]; const r = await C.liveAct(C.API.towerHellEquip(id, it && it.on === hero ? null : hero, C.app.guest)); if (r) { C.A.sfx.tap(); shopPop(); } },
  twPickGear: () => pickGearPop(),
  twPickGearDo: async (b) => { const r = await C.liveAct(C.API.towerPickGear(b.dataset.t, C.app.guest)); if (r) { C.A.sfx.reveal ? C.A.sfx.reveal('legend') : C.A.sfx.levelUp(); C.toast(`전설 ${GEAR[b.dataset.t].name} 획득!`, 2200); C.closeInfoCard(); } },
  twPickLegend: () => pickLegendPop(),
  twPickLegendDo: async (b) => { const r = await C.liveAct(C.API.towerPickHero(b.dataset.h, C.app.guest)); if (r) { C.closeInfoCard(); if (r.got && r.got.new) C.showJoinReveal(b.dataset.h, 'legend'); else C.toast(`${HEROES[b.dataset.h].name} 조각 +${L.DUP_SHARDS.legendHero}`, 2000); } },
};
void CHAPTERS;
