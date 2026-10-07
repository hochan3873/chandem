// 랑방 대전 — 진상의 탑 화면: 탑 로비(움직이는 배경 · 층 사다리 · 다음 층 카드) · 오르기 연출 · 전투 HUD · 결과 · 상점 · 랭킹 · 명예의 전당
// game.js 가 initTower(도우미) 로 부르고, 돌려받은 함수들을 화면 곳곳에 끼운다 (게임 코드는 최소한만 건드리게)
import { HEROES, ATTRS, GEAR, GEAR_IDS, GEAR_RARITY, LEGEND_HEROES, SKILL_AUG, ENEMIES, CHAPTERS } from './data.js';
import * as TW from './tower.js';
import * as L from './live.js';
import * as TWA from './tower-arena.js';
import { initArenaUi } from './tower-arena-ui.js';
import * as TG from './tower-guide.js';
import { createTutor } from './tutorial.js';

let C = null; // game.js 도우미 (app · P · show · popup · toast · …)
const st = { f: 0, hero: null, squad: null, board: null, boardAt: 0, hud: null, hudT: 0, last: null };
let AUI = null; // 리메이크 전투 화면 (tower-arena-ui.js)
let TT = null, ttKey = ''; // 탑 튜토리얼 (tower-guide.js TOWER_LESSONS · 말풍선은 tutorial.js 그대로) — 로비 처음 + 연습 층
const TT_ON = (() => { try { const q = new URLSearchParams(location.search); return !(q.has('notut') || q.has('autostart') || (navigator.webdriver && !q.has('tut'))); } catch { return true; } })();
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
  AUI = initArenaUi(ctx);
  TT = createTutor({ stage: C.stage, lessons: TG.TOWER_LESSONS, lsKey: TG.TOWER_TUT_LS, noEnroll: true, ctx: () => (TT_ON ? ttCtx() : null), fieldRect: (sp) => ttField(sp), toast: (m) => C.toast(m, 2400),
    face: () => `<img class="fz" style="${C.faceCircStyle('bangjang', 0.62, 0.5)}" src="${C.thumbSrc('bangjang')}" alt="" draggable="false" onerror="this.onerror=null;this.className='';this.removeAttribute('style');this.src='${HEROES.bangjang.img}'">` });
  return { tutScale: () => (TT ? TT.scale() : 1), tutReplay: () => ttReplay(false), tut: () => TT, show: showTower, acts: ACTS, gameOpt, afterCreate, moveTo: (g, h, x, y) => TWA.moveTo(g, h, x, y), ensureMap, hudTick, onEvent, onVictory, onFail, result, lobbyButton, cardBadge, heroInfoHtml, awake: (p) => TW.awakeMap(p || P()), isTowerEvent: (t) => t === 'twCurse' || t === 'twTimeout' || t === 'skillAug' || AUI.isEvent(t) };
}

// ─── 멤버 · 층 고르기 ───
function owned() { const p = P(); return Object.keys(HEROES).filter((h) => C.API.heroUnlocked(p, h)); }
// 탑 파티 (리메이크): 최대 3명 · 첫째가 대장 (랭킹 · 명예의 전당에 남는 멤버) — 이 기기에 기억
function curSquad() {
  const own = owned(), byPow = own.slice().sort((a, b) => C.heroPower(P(), b) - C.heroPower(P(), a));
  let sq = st.squad, saved = true;
  if (!sq) { try { sq = JSON.parse(lsGet('langbang:towerSquad') || 'null'); } catch { sq = null; } }
  if (!Array.isArray(sq)) { saved = false; sq = [st.hero || lsGet('langbang:towerHero')]; }
  sq = sq.slice(0, TW.SQUAD.max).map((h) => (h && own.includes(h) ? h : null));
  sq = sq.map((h, i) => (h && sq.indexOf(h) === i ? h : null));
  if (!sq[0]) { sq[0] = sq.find(Boolean) || byPow[0] || 'bangjang'; sq = sq.map((h, i) => (i && h === sq[0] ? null : h)); }
  while (sq.length < TW.SQUAD.max) sq.push(null);
  if (!saved) for (let i = 1; i < sq.length; i++) if (!sq[i]) sq[i] = byPow.find((h) => !sq.includes(h)) || null; // 처음: 강한 멤버로 채워 둔다
  st.squad = sq; st.hero = sq[0];
  return sq;
}
const squadIds = () => curSquad().filter(Boolean);
function saveSquad() { lsSet('langbang:towerSquad', JSON.stringify(st.squad || [])); if (st.squad && st.squad[0]) lsSet('langbang:towerHero', st.squad[0]); }
function curHero() { return curSquad()[0]; }
function curFloor() { const mx = TW.maxFloor(P()); st.f = clamp(st.f || mx, 1, mx); return st.f; }
const tw = () => P().tower || TW.emptyTower();
// 피로 (마스터 무료 모드는 안 쌓이고 안 막힌다)
const freeMode = () => { const p = P(); return !!(p.master && !p.testNormal); };
const fatOf = (h) => (freeMode() ? 0 : TW.fatigueOf(P(), h));
const fatBlocked = (h) => !freeMode() && TW.fatigueLocked(P(), h); // 100을 찍으면 70 아래로 풀릴 때까지
const fatWait = (h) => TW.fatigueTimeText(TW.fatigueOkMs(P(), h));
const fatLv = (v) => (v >= TW.FATIGUE.max ? 'full' : v >= 70 ? 'hi' : v >= 35 ? 'mid' : 'lo');
// 피로 게이지: 막대 (초록 → 노랑 → 빨강) · "피로 n% · 전투력 −x%" · 다 풀릴 때까지
function fatGauge(h, cls = '') {
  const v = fatOf(h), pow = Math.round(v * TW.FATIGUE.pow * 100);
  const tail = !v ? '쌩쌩해요' : fatBlocked(h) ? `지쳐서 쉬어야 해요 · ${fatWait(h)} 뒤 회복` : `${TW.fatigueTimeText(TW.fatigueRestMs(v))} 뒤 다 풀려요`;
  return `<span class="tw-fat ${fatLv(v)} ${cls}"><i class="tf-bar"><b style="width:${v}%"></b></i><small>피로 ${v}%${pow ? ` · 전투력 −${pow}%` : ''}</small><em>${tail}</em></span>`;
}

// 전투 옵션 (game.js startRun 이 createGame 에 덧붙인다): 대장 · 층 규칙 · 지옥 각성 (같이 간 멤버는 afterCreate 에서)
function gameOpt(t, p) {
  const def = t.practice ? practiceDef() : TW.floorDef(t.f);
  const fs = t.fats ? Object.values(t.fats) : [t.fat | 0];
  const fat = Math.round(fs.reduce((a, v) => a + (v | 0), 0) / Math.max(1, fs.length)); // 피로: 파티 평균
  return { mode: 'stage', stage: def.stage, deck: [null, null, t.hero, null, null, null], join: false, leader: t.hero, slots: 1, tower: def, towerExp: t.practice ? 1e-6 : TW.TOWER.exp, towerFat: fat, towerFatPow: TW.FATIGUE.pow, awake: TW.awakeMap(p), weekly: null, hell: false, unlocked: [] };
}
// createGame 다음: 같이 간 멤버 · 바닥 예고 · 체력 (tower-arena.js)
function afterCreate(g, t) {
  const sq = (t.squad && t.squad.length ? t.squad : [t.hero]).filter((h) => HEROES[h]);
  TWA.attach(g, { squad: sq });
  if (t.practice) { practiceSetup(g); return; }
  const pl = g.twa && g.twa.plan;
  if (pl && pl.tier <= 2) setTimeout(() => C.toast(pl.tier <= 1 ? '멤버를 끌어서 옮길 수 있어요 · 바닥 경고를 피해 보세요' : '바닥 경고가 차오르면 터져요 — 멤버를 끌어서 피하세요!', 3200), 900);
  else if (pl && pl.wind) setTimeout(() => C.toast('기 모으기: 초록 원으로 모이거나 · 기절 · 큰 피해로 끊어요', 3200), 900);
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
    ${guideHtml(f)}
    <ul class="fc-lines">${lines}</ul>
    <div class="fc-meta"><span>${C.ic('speed', '', 'sm')}제한 ${Math.floor(lim / 60)}분 ${lim % 60 ? `${lim % 60}초` : ''}</span><span>${C.ic('wave', '', 'sm')}웨이브 ${TW.floorDef(f).waves.length}</span></div>
    ${rewardChips(f, best)}
  </div>`;
}
// 멤버 체력 (탑 전용) 미리보기 · 이 층 위험에 대한 저항 칩
const hpOf = (h) => { const p = P(); return TWA.hpPreview(h, (p.heroes || {})[h] | 0, (p.hstars || {})[h] | 0 || 1); };
function resChips(h, f, max = 3) {
  const kinds = TWA.floorPlan(f).kinds.filter((k) => k !== 'hit');
  const out = [];
  for (const k of kinds) { const v = TWA.resOf(h, k), team = TWA.teamRes(k).find((x) => x.id === h); if (v || team) out.push(`<i class="tw-res" style="--hc:${TWA.HZ[k].color}">${esc(TWA.HZ[k].name)} ${team ? (team.v >= 100 ? '팀 면역' : `팀 −${team.v}%`) : `−${v}%`}</i>`); }
  return out.slice(0, max).join('');
}
// 이 층 공략 (초보 가이드 · tower-guide.js): 쉬운 말 한 줄 · 위험마다 할 일 · 내 멤버 중 추천 파티 (한 번에 넣기) · 자세히
const guideOf = (f) => TG.floorGuide(f, owned(), (h) => C.heroPower(P(), h));
const actChip = (a) => `<i class="tg-act" style="--ac:${TG.ACTS[a].color}">${TG.ACTS[a].name}</i>`;
const roleChip = (k, txt) => `<i class="tg-role r-${k}">${esc(txt || (TG.ROLES[k] || {}).name || '')}</i>`;
function guideHtml(f) {
  const G = guideOf(f), pl = TWA.floorPlan(f);
  const items = [...G.hazards.filter((h) => h.kind !== 'hit' || G.tier <= 1), ...(G.wind ? [G.wind] : [])];
  const rows = items.map((h) => `<li style="--hc:${h.color}"><span class="tg-hn"><b>${esc(h.name)}</b>${h.act.map(actChip).join('')}</span><small>${esc(h.what)}</small></li>`).join('');
  const sq = squadIds(), hint = TG.partyHint(f, sq), same = G.party.length && G.party.every((h) => sq.includes(h));
  const picks = G.picks.map((x) => `<span class="tg-pk">${face(x.id, 'xs')}<b>${esc(HEROES[x.id].name)}</b><small>${esc(x.why)}</small></span>`).join('');
  return `<div class="fc-guide">
    <div class="tg-head"><b>${C.ic('bulb', '', 'sm')}이 층 공략</b><em class="fc-tier t${pl.tier}">${esc(G.easy)}${pl.tier >= 2 ? ` · 경고 ${pl.warn.toFixed(1)}초` : ''}</em></div>
    ${rows ? `<ul class="tg-hz">${rows}</ul>` : ''}
    ${picks ? `<div class="tg-picks"><small class="tg-lbl">추천 (내 멤버 중)</small>${picks}</div>` : ''}
    ${hint ? `<p class="tg-warn">${esc(hint)}</p>` : ''}
    <div class="tg-btns">${G.party.length ? `<button class="tg-b go ${same ? 'on' : ''}" data-act="twRecAll" ${same ? 'disabled' : ''}>${same ? '추천 파티 그대로예요' : '추천 파티 넣기'}</button>` : ''}<button class="tg-b" data-act="twGuide">자세히 보기</button></div>
  </div>`;
}
function partyHtml() {
  const p = P(), sq = curSquad(), f = curFloor();
  const slot = (h, i) => {
    if (!h) return `<button class="tw-mem empty" data-act="twPick" data-s="${i}"><span class="tw-plus">+</span><small>${i ? '빈자리' : '대장'}</small></button>`;
    const aw = TW.awakeLv(p, h), v = fatOf(h);
    return `<button class="tw-mem ${fatBlocked(h) ? 'tired' : ''}" data-act="twPick" data-s="${i}">${i === 0 ? '<i class="tw-lead">대장</i>' : ''}${roleChip(TG.roleOf(h))}${face(h, 'big')}${aw ? `<i class="tw-awk l${aw}">${aw >= 3 ? '지옥' : 'I'.repeat(aw)}</i>` : ''}<b>${esc(HEROES[h].name)}</b><small class="tw-hp">체력 ${fmt(hpOf(h))}</small><span class="tw-rs">${resChips(h, f, 2)}</span><i class="tf-bar ${fatLv(v)}" title="피로 ${v}%"><b style="width:${v}%"></b></i></button>`;
  };
  return `<div class="tw-party sq"><div class="tw-phd"><b>파티</b><button class="tw-phb" data-act="twRoles">${C.ic('ic_party', '', 'sm')}역할 가이드</button><button class="tw-phb prac" data-act="twPractice">${C.ic('target', '', 'sm')}연습 층</button></div><div class="tw-mems">${sq.map(slot).join('')}</div></div>`;
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
  st.lobbyAt = performance.now();
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
  const hero = curHero(), f = curFloor(), best = t.best | 0, sq = squadIds();
  const z = TW.zoneOf(f);
  const left = TW.triesLeft(p);
  const free = p.master && !p.testNormal;
  const tiredH = sq.find((h) => fatBlocked(h)), tired = !!tiredH, canGo = (left || free) && !tired;
  const list = [];
  for (let k = 1; k <= 4 && f + k <= TW.TOWER.floors; k++) list.push(f + k);
  const el = C.show(`
    <div class="tw-scene z${z.id}" style="--zc:${z.color}">
      <div class="tw-bg"><i class="tw-far"></i><i class="tw-near"></i><i class="tw-vortex"></i><i class="tw-bolt"></i><i class="tw-heat"></i><i class="tw-vig"></i></div>
      <div class="tw-embers">${embers(26)}</div>
    </div>
    <div class="tw-top"><button class="back" data-act="menu">‹ 로비</button>
      <div class="tw-cur"><button class="tw-pill hs" data-act="twShop">${hsIc()}<b>${fmt(t.stone | 0)}</b></button><span class="tw-pill tries ${left ? '' : 'none'}">${C.ic('energy', '', 'sm')}<b>${free ? '∞' : `${left}/${TW.TOWER.tries}`}</b></span><button class="tw-pill help" data-act="twHelp" aria-label="탑 도움말"><b>?</b></button></div></div>
    <div class="tw-title"><small>${esc(z.sub)}</small><h2>진상의 탑</h2><em>최고 <b>${best}F</b> · ${esc(zoneName(TW.zoneOf(Math.max(1, best || 1))))}</em></div>
    <div class="tw-main">
      ${ladderHtml(best, f)}
      <div class="tw-col">
        <div class="tw-step"><button class="tw-arrow" data-act="twStep" data-d="-1" ${f <= 1 ? 'disabled' : ''} aria-label="아래층">‹</button><span>${f > best ? '다음 층' : '다시 오르기'}</span><button class="tw-arrow" data-act="twStep" data-d="1" ${f >= TW.maxFloor(p) ? 'disabled' : ''} aria-label="위층">›</button></div>
        ${floorCard(f, best, true)}
        <div class="tw-next"><small>위로 이어지는 층</small>${list.map((x) => floorCard(x, best, false)).join('') || '<span class="tw-top-done">꼭대기!</span>'}</div>
      </div>
    </div>
    ${partyHtml()}
    <button class="tw-go ${canGo ? '' : 'off'}" data-act="twGo" ${canGo ? '' : 'disabled'}><i class="tg-fire"></i><span><b>${f}층 오르기 · ${sq.length}명</b><small>${tired ? `${esc(HEROES[tiredH].name)} 지쳐서 쉬어야 해요 · ${fatWait(tiredH)} 뒤 회복` : left || free ? `도전 1번 · 깨면 돌려받아요${free ? '' : ` · 피로 +${TW.squadFat(sq.length, TW.fatigueGain(f, true, f <= best))}씩`}` : '오늘 도전을 다 썼어요 · 자정에 초기화'}</small></span></button>
    <div class="tw-menu"><button data-act="twShop">${hsIc()}<small>탑 상점</small>${t.picks && (t.picks.legend || t.picks.hero) ? '<i class="rd"></i>' : ''}</button><button data-act="twRank">${C.ic('trophy', '', 'sm')}<small>주간 랭킹</small></button><button data-act="twAwake">${C.ic('fire', '', 'sm')}<small>지옥 각성</small></button><button data-act="twRules">${C.ic('target', '', 'sm')}<small>새 규칙</small></button><button data-act="twInfo">${C.ic('book', '', 'sm')}<small>보상 안내</small></button></div>
    ${hallHtml()}
  `, 'tower-screen');
  bindParallax(el);
  const cur = el.querySelector('.tl-f.cur');
  if (cur) cur.scrollIntoView({ block: 'center' });
  ttLoad();
  if (!lsGet('langbang:twRemake')) { lsSet('langbang:twRemake', '1'); if (!TT_ON || (TT && TT.done('twlobby'))) setTimeout(() => { if (C.app.screen === 'tower') rulesPop(); }, 400); } // 리메이크 첫 방문: 새 규칙 안내 (처음 온 사람은 방장 튜토리얼이 대신)
}
// 새 규칙 (리메이크) 안내
function rulesPop() {
  const kinds = TWA.HZ_IDS.map((k) => { const H = TWA.HZ[k], team = TWA.teamRes(k), good = Object.keys(HEROES).filter((h) => TWA.resOf(h, k) >= 40 && !team.some((x) => x.id === h)).slice(0, 4); return `<div class="tw-ir hz" style="--hc:${H.color}"><i class="tw-hzdot"></i><span><b>${esc(H.name)}</b><small>${esc(H.desc)}</small><em>${good.length || team.length ? `강한 멤버: ${[...team.map((x) => `${HEROES[x.id].name}(팀 ${x.v >= 100 ? '면역' : `−${x.v}%`})`), ...good.map((h) => `${HEROES[h].name} ${TWA.resOf(h, k)}%`)].join(' · ')}` : ''}</em></span></div>`; }).join('');
  C.popup(`<h3>${C.ic('target', '', 'sm')}진상의 탑 · 새 규칙</h3>
    <div class="tw-rules"><div><b>① 멤버 3명</b><small>대장 + 두 명 · 피로는 한 명당 덜 쌓여요</small></div><div><b>② 끌어서 옮기기</b><small>멤버를 끌면 그 자리로 걸어가요 (순간이동 아님)</small></div><div><b>③ 바닥 경고</b><small>모양이 차오르면 터져요 — 맞으면 2~3초 넘게 기절 · 빙결…</small></div><div><b>④ 탑 전용 체력</b><small>탱커는 크고 딜러는 작아요 · 0이면 10초 쓰러짐 · 모두 쓰러지면 실패 · 건전녀 · 홍정민이 회복</small></div></div>
    <p class="ip">1~10층 연습 · 11~30층 기절 예고 · 31~50층 층마다 위험 하나 · 51~80층 위험 둘 + <b>기 모으기</b>(초록 원으로 모이거나 기절 · 큰 피해로 끊기) · 81층부터 위험 셋 · 짧은 예고 (랭킹)</p>
    <h4 class="gl-h">위험 · 저항</h4>${kinds}
    <p class="ip">감전은 곁 멤버에게 번져요 — 흩어지기 · 강성구 곁은 기절 · 침묵 면역 — 모이기. 층에 맞는 멤버를 고르세요</p>
    <button class="btn primary" data-x>알겠어요</button>`, 'tw-pop rw-info');
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
function pickPop(slot = 0) {
  const p = P(), t = tw(), sq = curSquad(), cur = sq[slot], f = curFloor();
  const rec = TWA.recommend(f, owned(), 6);
  const list = owned().sort((a, b) => (rec.includes(b) ? 1 : 0) - (rec.includes(a) ? 1 : 0) || C.heroPower(p, b) - C.heroPower(p, a));
  const rows = list.map((h) => { const b = (t.hb || {})[h] | 0, aw = TW.awakeLv(p, h), at = sq.indexOf(h); return `<button class="tw-pk ${h === cur ? 'on' : ''} ${aw >= 3 ? 'aw3' : ''} ${rec.includes(h) ? 'rec' : ''}" data-act="twPickHero" data-h="${h}" data-s="${slot}">${face(h)}<b>${esc(HEROES[h].name)}${at >= 0 && h !== cur ? `<u class="tw-in">${at ? `${at + 1}번` : '대장'}</u>` : ''}</b><small>체력 ${fmt(hpOf(h))} · 최고 ${b}F</small><span class="tw-rs">${resChips(h, f, 3)}</span><em>${C.ic('swords', '', 'sm')}${fmt(C.heroPower(p, h))}</em>${fatGauge(h, 'sm')}</button>`; }).join('');
  C.popup(`<h3>${C.ic('duo', '', 'sm')}${slot ? `${slot + 1}번 멤버` : '대장'} 고르기</h3><p class="ip">최대 <b>3명</b> · 이 층 위험에 강한 멤버가 위에 있어요 · 체력은 탑 전용 · 피로 · 각성은 멤버마다</p>${slot ? `<button class="btn sm ghost tw-clear" data-act="twPickHero" data-h="" data-s="${slot}">이 자리 비우기</button>` : ''}<div class="tw-pkgrid">${rows}</div>`, 'tw-pop tw-pick');
}
function awakePop() {
  const p = P(), t = tw();
  const list = owned().sort((a, b) => ((t.hb || {})[b] | 0) - ((t.hb || {})[a] | 0));
  const rows = list.map((h) => { const b = (t.hb || {})[h] | 0, aw = TW.awakeLv(p, h); return `<div class="tw-awr ${aw >= 3 ? 'aw3' : ''}">${face(h)}<span><b>${esc(HEROES[h].name)}</b><i class="tw-abar"><b style="width:${Math.min(100, Math.round((b / 60) * 100))}%"></b>${TW.AWAKE.map((a) => `<u style="left:${(a.f / 60) * 100}%" class="${b >= a.f ? 'on' : ''}"></u>`).join('')}</i></span><em>${b}F</em></div>`; }).join('');
  C.popup(`<h3>${C.ic('fire', '', 'sm')}지옥 각성</h3><div class="tw-awk-info">${TW.AWAKE.map((a, i) => `<div><b>${a.f}F · ${esc(a.name)}</b><small>${esc(a.desc)}</small></div>`).join('')}</div><p class="ip">그 멤버로 오른 최고 층으로 각성해요 · 깬 층을 다른 멤버로 다시 올라도 기록돼요</p><div class="tw-awlist">${rows}</div>`, 'tw-pop');
}
function infoPop() {
  const rules = Object.keys(TW.RULES).map((r) => `<div class="tw-ir">${ruleIc(r)}<span><b>${esc(TW.RULES[r].name)}</b><small>${esc(TW.RULES[r].desc)}</small><em>${esc(TW.RULES[r].hint)}</em></span></div>`).join('');
  const miles = Object.entries(TW.MILES).map(([f, m]) => `<p class="ip">${C.ic('crown', '', 'sm')}<b>${f}F</b> ${esc(m.label)}</p>`).join('');
  C.popup(`<h3>${C.ic('book', '', 'sm')}진상의 탑 안내</h3>
    <p class="ip">${TW.TOWER.floors}층 · 15층마다 구역 (61층부터 왕좌가 이어진다) · 5층마다 보스 · 46층부터 규칙 둘 · 멤버 <b>최대 3명</b> · 바닥 경고를 피하며 오른다 (<b>새 규칙</b> 버튼)</p>
    <p class="ip">하루 도전 <b>${TW.TOWER.tries}번</b> (자정 초기화) · 깬 판은 도전을 돌려받아요 · 체력은 안 써요</p>
    <h4 class="gl-h">피로</h4><p class="ip">탑에 오를 때마다 그 멤버의 피로가 쌓여요 · 깨면 <b>+${TW.FATIGUE.clear}</b> (${TW.FATIGUE.highFrom}층부터 <b>+${TW.FATIGUE.clearHigh}</b>) · 이미 깬 층 다시 깨기 +${TW.FATIGUE.replay} · 실패 +${TW.FATIGUE.fail}</p>
    <p class="ip">피로한 멤버는 탑에서 공격력 · 입구 내구도가 줄어요 (피로 100 = <b>−${Math.round(TW.FATIGUE.max * TW.FATIGUE.pow * 100)}%</b>) · 100이 되면 지쳐서 ${TW.FATIGUE.unlock} 아래로 풀릴 때까지 (약 5시간) 못 들어가요 · 한 시간에 ${TW.FATIGUE.perHour}씩 저절로 풀려요 (다 풀리기까지 약 ${Math.round(TW.FATIGUE.max / TW.FATIGUE.perHour)}시간) · 탑 상점 피로 회복제 −${TW.FATIGUE.potion} · 여러 멤버를 번갈아 데려가요</p>
    <h4 class="gl-h">층 규칙</h4>${rules}
    <h4 class="gl-h">보상 (층을 처음 깰 때)</h4><p class="ip">코인 · 염화석 · 강화석 · 보스 층 모집권 · 구역 끝 모집권 3</p>${miles}
    <h4 class="gl-h">주간 탑 랭킹</h4><p class="ip">이번 주에 깬 가장 높은 층 (같으면 더 빨리 깬 기록) · 1위 칭호 "이번 주 탑의 주인" (다음 한 주) + 코인 5,000 · 모집권 3 · 염화석 40 · TOP 10 작은 보상</p>
    <h4 class="gl-h">명예의 전당</h4><p class="ip">${TW.TOWER.hall}층을 정복하면 닉네임과 함께 오른 멤버가 탑 로비에 영원히 새겨져요</p>
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
    if (s.kind === 'fat') return `<div class="tw-si"><img class="cs-ic" src="${TW.POTION_ART}" alt="" draggable="false"><span><b>${esc(s.name)}</b><small>${esc(s.desc)} · 오늘 ${left}/${s.n}</small></span><button class="btn sm ${left && t.stone >= s.cost ? 'primary' : ''}" data-act="twPotion" ${left && t.stone >= s.cost ? '' : 'disabled'}>${hsIc()}${s.cost}</button></div>`;
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
// 피로 회복제: 피로가 있는 멤버 고르기
function potionPop() {
  const p = P(), s = TW.TOWER_SHOP.find((x) => x.id === 'potion');
  const list = owned().filter((h) => TW.fatigueOf(p, h) > 0).sort((a, b) => TW.fatigueOf(p, b) - TW.fatigueOf(p, a));
  if (!list.length) { C.toast('피로한 멤버가 없어요', 1600); return; }
  const rows = list.map((h) => `<button class="tw-pk" data-act="twPotionDo" data-h="${h}">${face(h)}<b>${esc(HEROES[h].name)}</b>${fatGauge(h, 'sm')}</button>`).join('');
  C.popup(`<h3><img class="tw-poti" src="${TW.POTION_ART}" alt="" draggable="false">피로 회복제</h3><p class="ip">고른 멤버 피로 <b>−${s.amount}</b> · ${hsIc()}${s.cost} · 오늘 ${TW.shopLeft(p, 'potion')}/${s.n}</p><div class="tw-pkgrid">${rows}</div>`, 'tw-pop tw-pick');
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
async function go(f, squad) {
  const app = C.app;
  if (st.busy) return;
  const sq = (squad && squad.length ? squad : squadIds()).filter(Boolean);
  const hero = sq[0];
  st.busy = true;
  try {
    const r = await C.API.towerStart(f, hero, app.guest, sq.slice(1));
    if (!r.ok) { C.toast(r.message || '오를 수 없어요', 2400); return; }
    if (r.profile) app.profile = r.profile;
    const team = r.squad && r.squad.length ? r.squad : sq;
    app.towerRun = { runId: r.runId, f, hero, squad: team, fat: r.fat | 0, fats: r.fats || null };
    saveSquad();
    const from = st.last && st.last.f ? st.last.f : Math.max(0, f - 1);
    await climb(from, f);
    C.startRun({ mode: 'tower', force: true, tower: { f, hero, squad: team, runId: r.runId, fat: r.fat | 0, fats: r.fats || null } });
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
  if (g.twPrac) practiceTick(g);
  if (!el || !el.isConnected) {
    el = document.createElement('div'); el.className = 'tw-hud';
    const pl = g.twa ? g.twa.plan : null;
    el.innerHTML = `<b class="th-f" style="--zc:${TW.zoneOf(g.tower.f).color}">${g.twPrac ? '<em>연습 층</em>' : `지옥 <em>${g.tower.f}F</em>`}</b><span class="th-r">${g.tower.rules.map((r) => ruleIc(r)).join('')}</span>${pl && pl.kinds.length ? `<span class="th-hz">${pl.kinds.map((k) => `<i style="--hc:${TWA.HZ[k].color}">${esc(TWA.HZ[k].name)}</i>`).join('')}</span>` : ''}<i class="th-t"></i>`;
    C.stage.appendChild(el); st.hud = el;
  }
  const left = Math.max(0, Math.ceil(g.tower.limit - g.t));
  const tt = el.querySelector('.th-t');
  const txt = g.twPrac ? '시간 제한 없음' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  if (tt.textContent !== txt) { tt.textContent = txt; tt.classList.toggle('warn', left <= 30); }
  el.hidden = C.app.screen !== 'play';
}
// 탑 전용 이벤트 연출 (game.js handleEvents 에서)
const CURSE_TXT = { stun: '저주: 기절!', silence: '저주: 침묵', charm: '저주: 홀림', slow: '저주: 손이 굳는다' };
function onEvent(g, e, loud) {
  const fx = C.fx;
  if (AUI.isEvent(e.type)) { AUI.onEvent(g, e, loud); if (TT) TT.emit(e.type); return; }
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
  if (g.twPrac) { fx.banner('연습 끝!', '이제 진짜 탑으로', '#a0200a', 2.2, 'big'); return; }
  fx.banner(`${g.tower.f}층 돌파!`, g.tower.f >= TW.TOWER.floors ? '진상 대왕을 쓰러뜨렸다!' : '다음 층이 열렸다', '#a0200a', 2.6, 'big');
  fx.flash('#ffb070', 0.5);
  for (let k = 0; k < 26; k++) fx.part('flame', 30 + Math.random() * 300, g.H * 0.55 + Math.random() * 160, (Math.random() - 0.5) * 50, -120 - Math.random() * 140, 1.4, 10 + Math.random() * 8, null);
}
function onFail(g) {
  const fx = C.fx;
  if (g.twPrac) { fx.banner('연습 끝', '탑 로비로 돌아가요', '#3a0612', 2, 'big'); return; }
  fx.banner(g.tower && g.t >= g.tower.limit ? '시간 초과…' : '탑에서 떨어졌다…', '다시 올라가자', '#3a0612', 2.2, 'big');
  C.stage.classList.add('tw-falling');
  setTimeout(() => C.stage.classList.remove('tw-falling'), 2600);
}

// ─── 결과: 돌파 · 보상 상자 / 추락 ───
function result(g, victory, quit) {
  const app = C.app;
  if (g.twPrac) { practiceResult(g, victory, quit); return; }
  app.screen = 'result';
  C.hud.hidden = true;
  hudTick(null);
  const sum = C.S.summary(g, g.t);
  const f = g.tower.f, run = app.towerRun || {};
  const hero = run.hero || (g.heroes.find((h) => !h.def.summon) || {}).id || curHero();
  const team = (run.squad && run.squad.length ? run.squad : g.heroes.filter((h) => !h.def.summon).map((h) => h.id)).filter((h) => HEROES[h]);
  const names = team.map((h) => HEROES[h].name).join(' · ');
  const rep = TWA.report(g);
  const wiped = !!(g.twa && TWA.members(g).length && TWA.members(g).every((h) => h.twDown > 0)); // 멤버가 모두 쓰러짐
  const time = fmtSec(g.t);
  const z = TW.zoneOf(f);
  const win = !!victory;
  const el = C.show(`
    <div class="tw-scene z${z.id} res ${win ? 'win' : 'lose'}" style="--zc:${z.color}"><div class="tw-bg"><i class="tw-far"></i><i class="tw-near"></i><i class="tw-heat"></i><i class="tw-vig"></i></div><div class="tw-embers">${embers(win ? 30 : 10)}</div></div>
    <div class="tw-res ${win ? 'win' : 'lose'}">
      <em class="tr-floor">${f}<small>F</small></em>
      <h2>${win ? `${f}층 돌파!` : quit ? '오늘은 여기까지' : wiped ? '모두 쓰러졌다…' : g.tower && g.t >= g.tower.limit ? '시간 초과…' : '탑에서 떨어졌다…'}</h2>
      <p class="sub">${win ? `${esc(names)} · ${time}` : `${esc(TW.zoneOf(f).name)} · 웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}`}</p>
      <div class="tr-chest ${win ? 'wait' : 'none'}" id="twChest">${win ? '<i class="tc-glow"></i><img class="tc-img tc-shut" src="/img/lb/fx/tower_chest.webp" alt="" draggable="false"><img class="tc-img tc-open" src="/img/lb/fx/tower_chest_open.webp" alt="" draggable="false">' : ''}</div>
      <div class="tr-rw" id="twRw">${win ? '<span class="spin"></span> 보상 받는 중…' : ''}</div>
      <div class="stats"><div><small>처치</small><b>${fmt(sum.kills)}</b></div><div><small>시간</small><b>${time}</b></div>${rep && rep.tele ? `<div><small>회피</small><b>${rep.dodge}/${rep.tele}</b></div>${rep.wind ? `<div><small>끊기</small><b>${rep.cut}/${rep.wind}</b></div>` : ''}` : `<div><small>레벨</small><b>${g.level}</b></div>`}</div>
    </div>
    <div class="tw-resbtns" id="twBtns"></div>
  `, `tower-screen result-tw ${win ? 'win' : 'lose'}`);
  void el;
  const btns = (r) => {
    const p = P(), left = TW.triesLeft(p), free = p.master && !p.testNormal;
    const nf = Math.min(TW.TOWER.floors, f + 1);
    const canNext = win && f < TW.TOWER.floors && nf <= TW.maxFloor(p);
    const tiredH = team.find((h) => fatBlocked(h)), tired = !!tiredH, ok = (left || free) && !tired;
    const why = tired ? `${esc(HEROES[tiredH].name)} 지쳐서 쉬어야 해요 · ${fatWait(tiredH)} 뒤 회복` : '';
    const fz = fatOf(hero) ? ` · 피로 ${fatOf(hero)}%` : '';
    const b = [];
    if (canNext) b.push(`<button class="tw-go" data-act="twNext" data-f="${nf}" data-h="${hero}" ${ok ? '' : 'disabled'}><i class="tg-fire"></i><span><b>${nf}층으로 오르기</b><small>${why || (left || free ? `남은 도전 ${free ? '∞' : left}${fz}` : '오늘 도전을 다 썼어요')}</small></span></button>`);
    else if (!win && !quit) b.push(`<button class="tw-go retry" data-act="twNext" data-f="${f}" data-h="${hero}" ${ok ? '' : 'disabled'}><span><b>다시 도전</b><small>${why || (left || free ? `남은 도전 ${free ? '∞' : left}${fz}` : '오늘 도전을 다 썼어요 · 자정에 초기화')}</small></span></button>`);
    b.push('<div class="grid2"><button class="btn" data-act="tower">탑 로비</button><button class="btn ghost" data-act="menu">메인 메뉴</button></div>');
    const box = document.getElementById('twBtns'); if (box) box.innerHTML = b.join('');
    void r;
  };
  btns();
  st.last = { f, win };
  app.lastTowerSquad = team;
  if (app.debugRun) { const rw = document.getElementById('twRw'); if (rw) rw.innerHTML = '<div class="guest-note">디버그 판은 기록을 저장하지 않아요</div>'; return; }
  Promise.resolve(C.API.towerFinish({ runId: run.runId, clear: win, durationSec: Math.round(g.t), kills: sum.kills, bossKills: sum.bossKills, skills: sum.skills }, app.guest)).then((r) => {
    app.towerRun = null;
    if (r && r.ok && r.profile) app.profile = r.profile;
    btns(r);
    const rw = document.getElementById('twRw'), ch = document.getElementById('twChest');
    if (!rw) return;
    if (!r || !r.ok) { rw.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc((r && r.message) || '')}</div>`; return; }
    const fats = r.fats && Object.keys(r.fats).length ? r.fats : { [r.hero]: r.fat };
    const fatLine = r.fatAdd ? `<span class="fat ${fatLv(Math.max(...Object.values(fats)))}">피로 +${r.fatAdd}씩 · ${Object.entries(fats).map(([h, v]) => `${esc((HEROES[h] || {}).name || '')} ${v}%${v >= TW.FATIGUE.max ? '(휴식)' : ''}`).join(' · ')}</span>` : '';
    if (!win) { rw.innerHTML = `<div class="tr-lines"><span>도전 ${r.left}/${TW.TOWER.tries} 남음</span>${fatLine}<span>${wiped ? '바닥 경고를 피해 끌어 옮기고 · 이 층 위험에 강한 멤버로 도전해 봐요' : '층 규칙 · 위험에 맞는 다른 멤버로도 도전해 봐요'}</span></div>`; return; }
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
    if (fatLine) lines.push(fatLine);
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
    <i class="tw-abar"><b style="width:${Math.min(100, Math.round((b / 60) * 100))}%"></b>${TW.AWAKE.map((a) => `<u style="left:${(a.f / 60) * 100}%" class="${b >= a.f ? 'on' : ''}"></u>`).join('')}</i>
    <ul>${TW.AWAKE.map((a, i) => `<li class="${aw > i ? 'on' : ''}"><b>${a.f}F ${esc(a.name)}</b> ${esc(a.desc)}</li>`).join('')}</ul>
    ${augs ? `<h4>${C.ic('sparkle', '', 'sm')}전용 스킬 증강 <small>레벨업 카드로 나와요</small></h4><ul>${augs}</ul>` : ''}</div>`;
}

// ─── 초보 가이드: 이 층 공략 (자세히) · 역할 가이드 · 도움말 ───
function guidePop(f = curFloor()) {
  const G = guideOf(f), i = TW.floorInfo(f), sq = squadIds();
  const hzBlock = (h) => `<div class="tg-blk" style="--hc:${h.color}"><div class="tg-bh"><i class="tw-hzdot"></i><b>${esc(h.name)}</b>${h.act.map(actChip).join('')}</div><p>${esc(h.what)}</p><p class="tg-how"><b>이렇게:</b> ${esc(h.how)}</p>${h.best && h.best.length ? `<div class="tg-best"><small>강한 내 멤버</small>${h.best.map((b) => `<span>${face(b.id, 'xs')}${esc(HEROES[b.id].name)} <em>${b.team ? `팀 ${b.v >= 100 ? '면역' : `−${b.v}%`}` : `−${b.v}%`}</em></span>`).join('')}</div>` : h.alt ? `<p class="tg-alt">${esc(h.alt)}</p>` : ''}</div>`;
  const hz = [...G.hazards.filter((h) => h.kind !== 'hit' || G.tier <= 1), ...(G.wind ? [G.wind] : [])].map(hzBlock).join('');
  const rules = i.rules.map((r) => `<div class="tg-rule" style="--rc:${TW.RULES[r].color}">${ruleIc(r)}<span><b>${esc(TW.RULES[r].name)}</b><small>${esc(TW.ruleDesc(r, f))}</small><em>${esc(TW.ruleHint(r, f))}</em></span></div>`).join('');
  const picks = G.picks.map((x) => `<div class="tg-prow">${face(x.id)}<span><b>${esc(HEROES[x.id].name)}</b>${roleChip(x.role)}<small>${esc(x.why)}</small></span></div>`).join('');
  const same = G.party.length && G.party.every((h) => sq.includes(h));
  C.popup(`<h3>${C.ic('bulb', '', 'sm')}${f}층 공략</h3>
    <p class="tg-easy">${esc(G.easy)}</p>
    ${hz || '<p class="tg-easy">바닥 경고가 없어요 — 편하게 진상만 잡아요</p>'}
    <h4 class="gl-h">추천 파티 (내 멤버 중)</h4><div class="tg-plist">${picks || '<p class="ip">멤버를 더 모으면 추천해 드려요</p>'}</div>
    ${G.party.length ? `<button class="btn primary tg-apply" data-act="twRecAll" ${same ? 'disabled' : ''}>${same ? '지금 파티가 추천 파티예요' : '이 파티로 넣기'}</button>` : ''}
    ${G.alts.length ? `<h4 class="gl-h">없으면 이렇게</h4><ul class="tg-alts">${G.alts.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
    <h4 class="gl-h">층 규칙</h4>${rules}
    <button class="btn ghost tg-more" data-act="twRoles">역할 가이드 보기</button>`, 'tw-pop tg-pop');
}
function rolesPop() {
  const own = owned(), byPow = own.slice().sort((a, b) => C.heroPower(P(), b) - C.heroPower(P(), a));
  const ART = { tank: '앞에서 버티는 든든한 벽', healer: '쓰러지기 전에 채워 주는 구급상자', dealer: '진상을 빨리 치우는 공격수', support: '기절 · 독 · 홀림을 막는 방패막이' };
  const card = (k) => {
    const R = TG.ROLES[k], list = byPow.filter((h) => TG.roleOf(h) === k);
    return `<div class="tg-rc r-${k}" style="--rc:${R.color}"><div class="tg-rh"><i class="tg-ri">${C.ic(R.icon, '', '')}</i><span><b>${R.name}</b><em>${esc(R.short)}</em></span></div><p>${esc(R.desc)}</p><small class="tg-art">${esc(ART[k])}</small>
      <div class="tg-rm">${list.length ? list.map((h) => `<span title="${esc(TG.roleLine(h))}">${face(h, 'xs')}<b>${esc(HEROES[h].name)}</b></span>`).join('') : '<small class="tg-none">아직 없어요</small>'}</div></div>`;
  };
  const cut = byPow.filter((h) => TG.CUTTERS.includes(h));
  C.popup(`<h3>${C.ic('ic_party', '', 'sm')}탑에서 꼭 필요한 역할</h3>
    <p class="tg-easy">탑에는 <b>멤버 3명</b>이 같이 가요. 역할을 섞으면 훨씬 편해요!</p>
    <div class="tg-combo"><span class="r-tank">탱커 1</span><i>+</i><span class="r-healer">힐러 1</span><i>+</i><span class="r-dealer">딜러 1</span></div>
    <div class="tg-rcs">${TG.ROLE_IDS.map(card).join('')}</div>
    <div class="tg-rc r-cut" style="--rc:#ff6a7a"><div class="tg-rh"><i class="tg-ri">${C.ic('cc_stun', '', '')}</i><span><b>끊기 멤버</b><em>51층부터</em></span></div><p>진상이 <b>기를 모을 때</b> 기절 · 묶기 스킬로 끊어요. 없으면 초록 원 안으로 모이면 돼요</p><div class="tg-rm">${cut.length ? cut.map((h) => `<span>${face(h, 'xs')}<b>${esc(HEROES[h].name)}</b></span>`).join('') : '<small class="tg-none">아직 없어요</small>'}</div></div>
    <p class="ip">층마다 위험이 달라요 — 로비의 <b>이 층 공략</b>이 맞는 멤버를 골라 줘요</p>
    <button class="btn primary" data-x>알겠어요</button>`, 'tw-pop tg-pop tg-roles');
}
function helpPop() {
  C.popup(`<h3>${C.ic('book', '', 'sm')}진상의 탑 도움말</h3>
    <div class="tg-help">
      <button data-act="twTutReplay">${C.ic('bulb', '', '')}<span><b>튜토리얼 다시 보기</b><small>방장이 처음부터 · 연습 층까지</small></span></button>
      <button data-act="twPractice">${C.ic('target', '', '')}<span><b>연습 층</b><small>도전 횟수 · 피로 안 써요</small></span></button>
      <button data-act="twGuide">${C.ic('map', '', '')}<span><b>이 층 공략</b><small>조심할 것 · 할 일 · 추천 멤버</small></span></button>
      <button data-act="twRoles">${C.ic('ic_party', '', '')}<span><b>역할 가이드</b><small>탱커 · 힐러 · 딜러 · 해제/면역</small></span></button>
      <button data-act="twRules">${C.ic('help_point', '', '')}<span><b>규칙 한눈에</b><small>위험 8가지 · 저항</small></span></button>
      <button data-act="twInfo">${C.ic('gift', '', '')}<span><b>보상 · 피로 안내</b><small>층 보상 · 랭킹 · 피로</small></span></button>
    </div>`, 'tw-pop tg-pop');
}
function applyRec() {
  const G = guideOf(curFloor()), own = owned();
  const party = G.party.filter((h) => own.includes(h));
  if (!party.length) { C.toast('추천할 멤버가 없어요', 1400); return; }
  const tired = party.find((h) => fatBlocked(h));
  const sq = party.slice(0, TW.SQUAD.max);
  while (sq.length < TW.SQUAD.max) sq.push(null);
  st.squad = sq; st.hero = sq[0]; saveSquad();
  C.closeInfoCard(); try { C.A.sfx.pick ? C.A.sfx.pick() : C.A.sfx.tap(); } catch { /* 무시 */ }
  C.toast(tired ? `추천 파티를 넣었어요 · ${HEROES[tired].name}는 지쳐서 쉬어야 해요` : `추천 파티: ${party.map((h) => HEROES[h].name).join(' · ')}`, 2000);
  if (C.app.screen === 'tower') renderLobby();
}

// ─── 탑 튜토리얼 (말풍선 · 손가락) ───
function ttLoad() {
  if (!TT) return;
  const k = String((C.API.accountKey && C.API.accountKey()) || 'guest');
  if (k !== ttKey) { ttKey = k; TT.load(k, [], P()); }
}
function ttReplay(go = true) {
  if (!TT) return;
  ttLoad(); TT.forget(['twlobby', 'twprac']);
  if (go) { C.closeInfoCard(); if (C.app.screen === 'tower') renderLobby(); C.toast('방장이 처음부터 다시 알려 드려요', 1800); }
}
function ttCtx() {
  const app = C.app, g = app.g, has = (q) => !!C.stage.querySelector(q);
  if (!app.profileLoaded) return null;
  const c = { where: app.screen, blocked: !!app.confirmOpen || has('.confirm-modal, .reveal, .gacha-res, .gate, #bootld, .tw-climb') || (app.screen === 'play' && app.paused), modal: has('.info-modal') };
  if (app.screen === 'tower') { c.hasRes = has('.tw-mem .tw-res'); c.ready = performance.now() - (st.lobbyAt || 0) > 1100 && has('.tw-party'); } // 로비가 다 나타난 뒤에
  if (app.screen === 'play' && g && g.twPrac) { c.prac = true; c.step = g.twPrac.step; c.t = g.t; if (app.cardsOpen || g.augOffer) c.blocked = true; }
  return c;
}
// 필드 위 대상 → 무대 좌표 (tutorial.js 가 링 · 손가락 · 말풍선을 그린다)
function ttField(sp) {
  const g = C.app.g; if (!g || !g.twa) return null;
  const cv = C.stage.querySelector('canvas'); if (!cv) return null;
  const cr = cv.getBoundingClientRect(), sr = C.stage.getBoundingClientRect(), k = sr.width / (C.stage.offsetWidth || sr.width) || 1;
  const X = (x) => (cr.left - sr.left + (x / g.W) * cr.width) / k, Y = (y) => (cr.top - sr.top + (y / g.H) * cr.height) / k;
  const box = (x0, y0, x1, y1, px, py) => ({ x: X(x0), y: Y(y0), w: X(x1) - X(x0), h: Y(y1) - Y(y0), px: X(px), py: Y(py) });
  const P0 = g.twPrac || {}, ms = TWA.members(g);
  const at = (h) => { const p = TWA.posOf(h); return { x: h.out || h.restT > 0 || h.rx === undefined ? p.x : h.rx, y: p.y }; };
  if (sp.f === 'member') { const h = ms.find((o) => o.id === P0.mover) || ms[0]; if (!h) return null; const p = at(h); return box(p.x - 30, p.y - 70, p.x + 30, p.y + 30, p.x, p.y - 20); }
  if (sp.f === 'tele') { const s = g.twa.tele[0]; if (!s) return null; const r = s.r || 44; return box(s.x - r - 4, s.y + 22 - r * 0.62 - 4, s.x + r + 4, s.y + 22 + r * 0.62 + 4, s.x, s.y + 4); }
  if (sp.f === 'hpbar') { const h = ms.find((o) => o.id === P0.hurt) || ms[0]; if (!h) return null; const p = at(h); return box(p.x - 26, p.y + 36, p.x + 26, p.y + 50, p.x, p.y + 43); }
  if (sp.f === 'down') { const h = ms.find((o) => o.twDown > 0); if (!h) return null; const p = at(h); return box(p.x - 32, p.y - 76, p.x + 32, p.y + 30, p.x, p.y - 30); }
  if (sp.f === 'wind') { const W = g.twa.wind; if (!W || W.e.dead) return null; const e = W.e, z = (e.def.size || 50) * 0.6; return box(e.x - z, e.y - z * 1.9, e.x + z, e.y + z * 0.2, e.x, e.y - z * 0.8); }
  return null;
}

// ─── 연습 층: 도전 · 피로 · 기록 없이 · 경고는 튜토리얼이 하나씩 띄운다 ───
function practiceDef() { // 1층 구성을 길게 (튜토리얼을 다 볼 때까지 진상이 끊기지 않게)
  const d = TW.floorDef(1);
  d.waves = d.waves.map((w) => Object.assign({}, w, { g: w.g.map((x) => [x[0], Math.max(2, x[1] * 2), x[2] * 1.6, x[3], x[4]]) }));
  d.practice = true;
  return d;
}
function practiceSetup(g) {
  const A = g.twa;
  g.twPrac = { step: '', mover: null, hurt: null };
  g.god = true; g.pendingLevels = 0; g.welcomePicks = 0;
  if (g.tower) g.tower.limit = 1e9;
  A.nextT = 1e9; A.windT = 1e9;
  A.plan = Object.assign({}, A.plan, { warn: 3, dmg: 60, cc: 0 });
  const ms = TWA.members(g); g.twPrac.mover = (ms[0] || {}).id || null;
}
function practiceTick(g) {
  const P0 = g.twPrac, A = g.twa;
  if (!A) return;
  g.pendingLevels = 0; g.augOffer = null; g.welcomePicks = 0;
  const ms = TWA.members(g);
  const n = TT ? TT.now() : null, beat = n && n.les === 'twprac' ? n.beat : null;
  // 튜토리얼이 끝났거나 꺼졌으면 → 연습 끝
  if (!P0.ended && (!TT || !TT_ON || TT.done('twprac')) && g.phase === 'wave' && g.t > 2) { P0.ended = true; g.phase = 'victory'; g.events.push({ type: 'victory', stars: 3 }); return; }
  if (g.phase !== 'wave') return;
  if (beat === 'tele' && P0.step !== 'tele') { // 빨간 원: 끌어 본 멤버 발밑에 · 밖으로 나갈 때까지 안 터진다
    const h = ms.find((o) => o.id === P0.mover) || ms[0];
    if (h) { A.tele.length = 0; const s = TWA.spawnTele(g, 'hit', h); if (s) { s.shape = 'circle'; s.r = 46; const p = TWA.posOf(h); s.x = p.x; s.y = p.y; s.warn = 3; s.prac = true; P0.step = 'tele'; } }
  }
  if (P0.step === 'tele') {
    const s = A.tele.find((q) => q.prac);
    if (s) { const h = ms.find((o) => o.id === s.tgt); const p0 = h ? TWA.posOf(h) : null; const p1 = h && h.twTo ? h.twTo : p0; if (p0 && (TWA.inShape(s, p0.x, p0.y, g) || TWA.inShape(s, p1.x, p1.y, g))) s.t = Math.min(s.t, s.warn * 0.82); }
  }
  if (beat === 'hp' && P0.step !== 'hp') { const h = ms.find((o) => !o.twDown) || ms[0]; if (h) { h.twHp = Math.round(h.twMax * 0.45); h.twHitT = g.t; P0.hurt = h.id; } P0.step = 'hp'; }
  if (beat === 'down' && P0.step !== 'down') {
    const h = ms.length >= 2 ? ms.slice().reverse().find((o) => !TG.HEALERS.includes(o.id) && !o.twDown) || ms[ms.length - 1] : null;
    if (h) { h.twHp = 1; h.twGrace = 0; const s = TWA.spawnTele(g, 'hit', h); if (s) { s.shape = 'circle'; s.r = 40; const p = TWA.posOf(h); s.x = p.x; s.y = p.y; s.warn = 0.15; } }
    P0.step = 'down';
  }
  if (beat === 'wind' && P0.step !== 'wind') { // 화면 가운데쯤 내려온 진상 (위 HUD 버튼과 안 겹치게)
    P0.windWait = P0.windWait || performance.now();
    const y0 = performance.now() - P0.windWait > 2500 ? 110 : 230; // 가운데쯤 진상이 없으면 조금 위도
    const e = g.enemies.filter((q) => !q.dead && q.y > y0 && q.y < g.ropeY - 30 && !(q.stunT > 0)).sort((a, b) => b.y - a.y)[0]; // 가장 앞에 온 진상 (잘 보이고 탭하기 쉽게)
    if (e && TWA.windNow(g, { dur: 40, cut: 0.02, dmg: 0.2, stun: 0.6, safe: 56 }, e)) { P0.step = 'wind'; g.twa.wind.hold = true; }
  }
  if (P0.step === 'wind' && A.wind) { // 연습: 끊을 때까지 안 터진다 · 저절로 끊기지 않게 (탭해서 집중 공격 · 기절 스킬로 끊기)
    const W = A.wind;
    W.t = Math.min(W.t, W.dur * 0.8);
    if (!W.prac) { W.prac = 1; W.e.maxHp *= 8; W.e.hp *= 8; P0.windAt = performance.now(); }
    if (!P0.armed && (g.focus === W.e || performance.now() - P0.windAt > 9000)) { P0.armed = true; W.hp0 = W.e.hp; W.need = W.e.maxHp * 0.04; }
    W.hold = !P0.armed;
    if (!P0.armed) { W.hp0 = W.e.hp; W.need = Infinity; }
  }
  if (P0.step !== 'down') for (const h of ms) if (h.twDown > 3) h.twDown = 3; // 연습: 오래 누워 있지 않게
}
function practiceResult(g, victory, quit) {
  const app = C.app;
  app.screen = 'result'; C.hud.hidden = true; hudTick(null); app.towerRun = null;
  const z = TW.zoneOf(1), rep = TWA.report(g) || {};
  C.show(`
    <div class="tw-scene z1 res win" style="--zc:${z.color}"><div class="tw-bg"><i class="tw-far"></i><i class="tw-near"></i><i class="tw-heat"></i><i class="tw-vig"></i></div><div class="tw-embers">${embers(16)}</div></div>
    <div class="tw-res win tg-pres">
      <h2>${quit ? '연습 그만' : '연습 끝!'}</h2>
      <p class="sub">끌어서 옮기기 · 경고 피하기 · 체력 · 끊기 — 이제 진짜 탑으로!</p>
      <div class="stats"><div><small>회피</small><b>${rep.dodge | 0}</b></div><div><small>끊기</small><b>${rep.cut | 0}</b></div><div><small>시간</small><b>${fmtSec(g.t)}</b></div></div>
      <p class="tg-easy">층마다 <b>이 층 공략</b>을 보고 · <b>추천 파티 넣기</b>를 눌러 보세요</p>
    </div>
    <div class="tw-resbtns"><button class="tw-go" data-act="tower"><i class="tg-fire"></i><span><b>탑 로비로</b><small>도전 횟수 그대로예요</small></span></button></div>
  `, 'tower-screen result-tw win');
  void victory;
}
function startPractice() {
  const sq = squadIds();
  if (!sq.length) { C.toast('파티에 멤버를 넣어 주세요', 1400); return; }
  C.closeInfoCard();
  const t = { f: 1, hero: sq[0], squad: sq, runId: 'practice', fat: 0, fats: null, practice: true };
  C.app.towerRun = Object.assign({}, t);
  C.startRun({ mode: 'tower', force: true, tower: t });
}

// ─── 버튼 ───
const ACTS = {
  tower: () => showTower(),
  twStep: (b) => { st.f = clamp(curFloor() + Number(b.dataset.d), 1, TW.maxFloor(P())); C.A.sfx.tabSw && C.A.sfx.tabSw(); renderLobby(); },
  twFloor: (b) => { const f = Number(b.dataset.f); if (f <= TW.maxFloor(P())) { st.f = f; renderLobby(); } else C.toast('아래층을 먼저 깨야 열려요', 1400); },
  twPick: (b) => pickPop(Number((b && b.dataset.s) || 0)),
  twPickHero: (b) => { // 그 자리에 앉히기 (다른 자리에 있던 멤버면 자리 바꾸기 · 빈 값이면 비우기)
    const sq = curSquad().slice(), s = Number(b.dataset.s || 0), h = b.dataset.h || null;
    if (!h) { if (s) sq[s] = null; } else { const at = sq.indexOf(h); if (at >= 0) sq[at] = sq[s]; sq[s] = h; if (!sq[0]) { sq[0] = h; if (s) sq[s] = null; } }
    st.squad = sq; st.hero = sq[0]; saveSquad(); C.closeInfoCard(); renderLobby();
  },
  twRec: (b) => { const h = b.dataset.h, sq = curSquad().slice(); if (sq.includes(h)) { C.toast(`${HEROES[h].name} 이미 파티에 있어요`, 1200); return; } const i = sq.indexOf(null); sq[i >= 0 ? i : sq.length - 1] = h; st.squad = sq; saveSquad(); renderLobby(); },
  twRules: () => rulesPop(),
  twHelp: () => helpPop(),
  twGuide: () => guidePop(),
  twRoles: () => rolesPop(),
  twRecAll: () => applyRec(),
  twPractice: () => startPractice(),
  twTutReplay: () => ttReplay(true),
  twGo: () => go(curFloor(), squadIds()),
  twNext: (b) => go(Number(b.dataset.f), C.app.lastTowerSquad && C.app.lastTowerSquad.length ? C.app.lastTowerSquad : squadIds()),
  twShop: () => shopPop(),
  twPotion: () => potionPop(),
  twPotionDo: async (b) => { const h = b.dataset.h; const r = await C.liveAct(C.API.towerShop('potion', C.app.guest, h)); if (r) { C.A.sfx.reward ? C.A.sfx.reward() : C.A.sfx.levelUp(); const fv = r.got && r.got.fat; C.toast(`${HEROES[h].name} 피로 −${fv ? fv.cut : TW.FATIGUE.potion} · 지금 ${fv ? fv.v : TW.fatigueOf(P(), h)}%`, 1800); shopPop(); if (C.app.screen === 'tower') renderLobby(); } },
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
