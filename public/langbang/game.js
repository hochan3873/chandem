// 랑방 대전 — 메인: 게임 루프(고정 60Hz) · 입력 · HUD · 메뉴/스테이지/상점/카드/결과 화면
import {
  shortName,
  HEROES, ENEMIES, RULES, FIELD, BASE_HEROES, UNLOCK_HEROES, HIDDEN_HEROES, LOCKED_HEROES, RARITY, SCORE,
  CHAPTERS, STAGE_COUNT, STAGE_WAVES, STAGES_PER_CHAPTER, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS, itemCost,
  chapterOf, stageNo, stageLabel, stageName, parseStage, stageEnemies, stageBosses, stageReward, clearCoins, itemValue, starsFor,
  ATTRS, CLASSES, TYPE_CHART, TYPE_STRONG, TYPE_WEAK, typeMul, stageClasses, recommendAttrs, recommendTeam, stageFx, MAP_FX, partnerSlots,
  GEAR, GEAR_RARITY, GEAR_STATS, GEAR_INFO, STAT_HELP, heroCardNeed, CARD_PICK, gearStoneNeed, gearDismantle, GEAR_NEXT, GEAR_FUSE_FEE, GEAR_MAX_LV, gearValue, gearEnhanceCost, gearEnhanceChance, gearSellValue, SLOT_X, SLOT_X7,
  attrScores, DECK_BASE, GACHA_HEROES, LEGEND_HEROES, openSlots, TAGS, HERO_TAGS, ATTR_SET, EVO, HELL, hellOpen, heroTier, TIER_NAME, TIER_MUL, TIER_GROWTH, tierPower, resOf, metaMaxOf, SKILL_EVO, stageMid, WAVE_KINDS, stageWaveKinds, stageStory, NO_DEX_ART, NO_HQ_ART, NO_DUO_ART, SUMMONS,
  TRAITS, stageMix, CURSES, TECH, SET_BONUS, TIER_NAMES, CC_KINDS,
  FUSE_ART, MYTH, gearStats, WEAPON, PROJ_ART, GEAR_IDS, MYTH_IDS, DROPS, MOMENTUM,
  COND, stageConds, stageMission, condFits, recMeta,
  SIG, SIG_IDS, SIG_PITY, SIG_RATE, SIG_DUP_SHARDS, gearFits, sigOf, sigStatText, HERO_ROLES, heroRole, ENEMY_KINDS, enemyKind,
} from './data.js';
import * as L from './live.js';
import { FLAVOR, TIPS } from './flavor.js';
import * as S from './sim.js';
import { Renderer } from './render.js';
import { SkillFx } from './skillfx.js';
import * as A from './audio.js';
import * as API from './api.js';
import * as SH from './share.js';
import * as FRX from './friends.js';
import * as BKX from './bonkae-ui.js'; // 본캐 · 출연료 · 주간 인기 멤버
import * as PV from './pvp.js';
import { initTower } from './tower-ui.js';
import { initTransit } from './transit.js';

const $ = (s) => document.querySelector(s);
const TAU_ = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const starStr = (n, max = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, max - n));

// ─── 디버그 주소 옵션 ─────────────────────────────────
// ?speed=8 빨리 감기 · ?wave=N 시작 웨이브 · ?god=1 무적 · ?stress=150 적 N마리 유지(성능 측정) · ?autopick=1 카드 자동 선택
// ?hidden 히든 카드 확률 50% · ?nosave 기록 저장 안 함 · ?stage=2-3 바로 그 스테이지 · ?autostart(+&endless) 바로 시작
const Q = new URLSearchParams(location.search);
const DEBUG = {
  speed: clamp(Number(Q.get('speed')) || 1, 0.25, 16),
  wave: clamp(Number(Q.get('wave')) || 0, 0, 99),
  god: Q.has('god'),
  stress: clamp(Number(Q.get('stress')) || 0, 0, 400),
  autopick: Q.has('autopick'),
  hidden: Q.has('hidden'),
  stage: parseStage(Q.get('stage')),
  join: !Q.has('nojoin'), tempo: !Q.has('notempo'), // 합류 모드 · 새 템포 (기본 켜짐 · 개발용으로 ?nojoin ?notempo)
};
const STEP = 1 / 60;
const SNAP_KEY = 'langbang:snap';
const CARD_LOCK_MS = 700; // 카드가 뜬 직후 잘못 누르는 것 방지

const stage = $('#stage');
const canvas = $('#cv');
const ui = $('#ui');
const hud = $('#hud');
const R = new Renderer(canvas);
R.onStep = (h, x, y) => { fx.burst(x + (Math.random() - 0.5) * 20, y - 2, 4, '#cdbfa8', 60, 'dot', 2, 0.4); try { A.sfx.thud(); } catch (e) {} }; // 윤정섭 발걸음: 먼지 + 쿵
const fx = R.fx;
const SKFX = (R.skfx = new SkillFx(R)); // 스킬 전용 연출 (다이어트 주사 · 진심 모드 · 시간 정지 · 붕대 대공사 · 좋은남자)
let TWUI = null; // 진상의 탑 화면 (tower-ui.js · 맨 아래에서 연결)
// 화면 넘김 연출: 탑 · 레이드 · 1:1 대전 · 상점은 전용 전환, 그 밖은 깊이감 있는 밀기 (transit.js)
const TR = initTransit({
  stage, ui, A, tips: TIPS,
  buzz: (p) => { if (!app.touched || !gwPref('vibrate')) return; try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* 무시 */ } },
  shopLabel: () => (app.shopTab === 'recruit' ? '모집' : '상점'),
});

const app = {
  screen: 'menu', // menu | stages | prep | play | result | shop | ranking | howto
  g: null,
  demo: null,
  paused: false,
  cardsOpen: false,
  cards: null,
  cardSel: -1,
  cardLockUntil: 0,
  rerolls: 0,
  mode: 'stage',
  stage: 1,
  partner: 'gunman',
  chapterTab: 1,
  selStage: 1,
  shopTab: 'heroes',
  rankTab: 'stage',
  profile: API.guestProfile(),
  guest: true,
  nickname: ' ',
  profileLoaded: false,
  ending: false,
  logicalH: 720,
  firstRunTip: true,
  confirmOpen: null,
};
app.partners = ['gunman'];
try { const v = JSON.parse(localStorage.getItem('langbang:partners') || 'null'); if (Array.isArray(v) && v.length) app.partners = v; else app.partners = [localStorage.getItem('langbang:partner') || 'gunman']; } catch { /* 무시 */ }
app.partner = app.partners[0];
app.infoHero = null; app.aim = null; app.drag = null;
try { app.autoCards = localStorage.getItem('langbang:autoCards') === '1'; } catch { app.autoCards = false; }

// ─── 화면 크기 맞추기 (세로 화면을 가운데에, 남는 곳은 레터박스) ─────
// 실제로 보이는 크기: visualViewport (아이폰 사파리는 innerHeight 가 떠 있는 주소창 밑까지 포함) · 가로는 절대 화면 폭을 넘지 않게
const IOS_SAFARI = /iP(hone|od|ad)/.test(navigator.userAgent) && !navigator.standalone && !(window.matchMedia && matchMedia('(display-mode: standalone)').matches);
// 아이폰 홈 화면 앱(standalone, 상태 표시줄 black-translucent): innerHeight 가 위쪽 여백만큼 짧게 나오는 버그 + 노치 밑으로 글자가 들어감
const IOS_STANDALONE = /iP(hone|od|ad)/.test(navigator.userAgent) && (!!navigator.standalone || !!(window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const safeProbes = {};
function safeInset(side) {
  try {
    if (!safeProbes[side]) { const d = document.createElement('div'); d.style.cssText = `position:fixed;left:0;${side}:0;width:0;height:env(safe-area-inset-${side},0px);visibility:hidden;pointer-events:none`; document.body.appendChild(d); safeProbes[side] = d; }
    return safeProbes[side].getBoundingClientRect().height || 0;
  } catch { return 0; }
}
const safeBottom = () => safeInset('bottom');
function viewSize() {
  const v = window.visualViewport;
  let w = v ? v.width : window.innerWidth, h = v ? v.height : window.innerHeight;
  const cw0 = document.documentElement.clientWidth; if (cw0) w = Math.min(w, cw0);
  w = Math.min(w, window.innerWidth || w); h = Math.min(h, window.innerHeight || h);
  if (IOS_STANDALONE) {
    // 홈 화면 앱: 화면 끝까지 쓴다 (짧게 나오는 innerHeight 대신 화면 높이) · 위는 상태 표시줄/다이내믹 아일랜드만큼 비운다
    const portrait = (window.innerHeight || 0) >= (window.innerWidth || 0);
    const full = Math.max(h, window.innerHeight || 0, portrait ? screen.height : screen.width);
    const t = safeInset('top');
    return { w, h: full - t, top: t, left: 0 };
  }
  // 사파리 떠 있는 아래 도구 막대가 영웅 줄을 가리지 않게 아래를 조금 비운다
  const pad = IOS_SAFARI ? Math.max(safeBottom(), 12) + 8 : 0;
  return { w, h: h - pad, top: v ? v.offsetTop : 0, left: v ? v.offsetLeft : 0 };
}
function layout() {
  const vs = viewSize();
  const vw = vs.w, vh = vs.h;
  const H = app.g ? app.g.H : clamp(Math.round(FIELD.W * vh / vw), FIELD.minH, FIELD.maxH);
  let cw = vw, ch = cw * H / FIELD.W;
  if (ch > vh) { ch = vh; cw = ch * FIELD.W / H; }
  cw = Math.floor(cw); ch = Math.floor(ch);
  stage.style.width = cw + 'px';
  stage.style.height = ch + 'px';
  stage.style.left = Math.round(vs.left + vw / 2) + 'px'; stage.style.top = Math.round(vs.top + vh / 2) + 'px'; // 보이는 곳 가운데 (남는 곳은 레터박스)
  stage.style.setProperty('--u', (cw / FIELD.W) + 'px');
  app.logicalH = H;
  R.resize(cw, ch, H);
}
{
  const relayout = () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 80); };
  window.addEventListener('resize', relayout);
  window.addEventListener('orientationchange', relayout);
  if (window.visualViewport) { visualViewport.addEventListener('resize', relayout); visualViewport.addEventListener('scroll', relayout); }
}

// 챕터 그림 (keyart · dio): 7장 그림이 아직 없으면 6장 그림이 뒤에 깔려 보인다
const chArtCss = (kind, c) => (c > 6 ? `url('/img/lb/${kind}${c}.webp'), url('/img/lb/${kind}6.webp')` : `url('/img/lb/${kind}${c}.webp')`);
// ─── 이미지(없으면 이모지) 태그 ──────────────────────
// 동그란 얼굴: 멤버는 그림(HQ) 얼굴 맞춤 · 진상은 원래 그림 (꼬마 그림은 전투 화면에서만)
function av(def, extra = ' ') {
  const hq = def && def.id && (HEROES[def.id] || SUMMONS[def.id]) && typeof thumbSrc === 'function' ? thumbSrc(def.id) : ' ';
  if (hq && !/\/h_/.test(hq)) return `<span class="av hq ${extra}" style="--c:${def.color}"><img class="fz" data-face="${def.id}" data-fc="1" style="${faceCircStyle(def.id)}" src="${hq}" alt="" draggable="false" onerror="${def.fb ? `this.onerror=function(){this.onerror=null;this.src='${def.fb}';this.style.filter='hue-rotate(160deg) saturate(1.3)'};` : 'this.onerror=null;'}this.className=' ';this.removeAttribute('style');this.src='${def.img}'"></span>`; // (진상: 전용 그림이 없으면 fb 그림에 색만 바꿔서)
  if (def && def.fb) return `<span class="av ${extra}" style="--c:${def.color}"><img src="${def.img}" alt="" draggable="false" onerror="this.onerror=null;this.src='${def.fb}';this.style.filter='hue-rotate(160deg) saturate(1.3)'"></span>`; // 7장: 그림이 오기 전엔 비슷한 진상 그림에 색만 바꿔서
  return `<span class="av ${extra}" style="--c:${def.color}"><img src="${def.img}" alt="" draggable="false" onerror="this.parentNode.classList.add('noimg');this.remove()"><i>${def.emoji}</i></span>`;
}

let toastT = 0;
SH.setToast((m, ms) => toast(m, ms));
function toast(msg, ms = 2200) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, ms);
}

// ─── 확인 창 (그만두기 · 나가기) ─────────────────────
function confirmBox({ title, sub = ' ', ok = '확인', cancel = '취소', danger = false }) {
  closeConfirm(false);
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'confirm-modal';
    box.innerHTML = `<div class="confirm-box">
        <h3>${esc(title)}</h3>${sub ? `<p>${esc(sub)}</p>` : ''}
        <div class="confirm-row"><button class="btn ghost" data-c="no">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-c="yes">${esc(ok)}</button></div>
      </div>`;
    stage.appendChild(box);
    app.confirmOpen = { box, resolve };
    box.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-c]');
      if (ev.target === box) { closeConfirm(false); return; }
      if (!b) return;
      A.sfx.tap();
      closeConfirm(b.dataset.c === 'yes');
    });
  });
}
function closeConfirm(result) {
  const c = app.confirmOpen;
  if (!c) return;
  app.confirmOpen = null;
  c.box.remove();
  c.resolve(result);
}

// ─── 이어하기 저장본 (웨이브 시작 때마다 · 페이지를 떠날 때) ─────
function saveSnap() {
  const g = app.g;
  if (!g || app.debugRun || g.over || g.victory || app.ending || !g.lastSnap || g.weekly || g.pvp || g.raid || g.tower) return;
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({ v: 1, acct: API.accountKey(), partner: app.partner, partners: app.partners, at: Date.now(), snap: g.lastSnap }));
  } catch { /* 저장소 가득 참 */ }
}
function loadSnap() {
  try {
    const d = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    if (!d || d.v !== 1 || !d.snap || d.acct !== API.accountKey()) return null;
    if (Date.now() - d.at > 3 * 24 * 3600 * 1000) { clearSnap(); return null; } // 사흘 지나면 버림
    return d;
  } catch { return null; }
}
function clearSnap() { try { localStorage.removeItem(SNAP_KEY); } catch { /* 무시 */ } }
function snapLabel(d) {
  const s = d.snap;
  const w = Math.max(1, s.wave || 1);
  return s.mode === 'stage' ? `스테이지 ${stageLabel(s.stage)} · 웨이브 ${w}` : `무한 도전 · 웨이브 ${w}`;
}

// ─── 뒤로 가기 막기: 게임 중 뒤로 = 일시정지 ────────────
const REROLLS = 2; // 전투마다 카드 다시 뽑기 (증강 새로고침 쿠폰으로 +1)
let guarded = false;
let ignorePop = 0;
// 뒤로 가기: 브라우저 기록은 한 칸만 걸어 두고(화면마다 쌓지 않는다), 뒤로 = 한 단계 위로
//  팝업 → 닫기 · 게임 중 → 일시정지/그만두기 · 하위 화면 → 로비 · 로비 → "게임월드로 나갈까요?" → location.replace('/')
// 크롬은 "사용자가 누르지 않은 채 쌓은 기록"을 뒤로 가기에서 건너뛴다 → 손가락이 닿을 때 한 번 더 걸어 둔다
//  → 손가락이 닿을 때마다(한 번에 하나씩) "눌러서 쌓은" 기록을 최대 3칸까지 채워 둔다. 뒤로 가기를 연달아 눌러도 새지 않게
//  history.state.d = 몇 번째 칸인지 (뒤로 · 앞으로 구분)
// iOS 사파리: 두 손가락 확대 · 두 번 탭 확대 막기 (게임 중에 화면이 커져서 지는 일이 있었다)
for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || (e.scale !== undefined && e.scale !== 1)) e.preventDefault(); }, { passive: false });
// (두 번 탭 확대는 CSS touch-action: manipulation 으로 막는다 — touchend 를 막으면 빠른 연속 탭이 씹혀서 안 쓴다)
// 크롬 규칙: 사용자 활성(탭·클릭·키) 없이 쌓은 기록은 뒤로 가기에서 건너뛴다. 한 번의 탭에서 여러 번 쌓으면 첫 칸만 "진짜"
//  → 탭 하나에 기록은 딱 한 칸 (pointerup/touchend/click/keydown 중 먼저 온 것 · 0.5초 안 중복 막기)
//  → "진짜" 칸을 최대 3개까지 쌓아 두고, 뒤로 가기마다 하나씩 쓴다 · 뒤로 가기 처리 중에는 절대 쌓지 않는다 (건너뛰어짐)
let guardGesture = false;
let hDepth = (history.state && history.state.lb === 'guard' && history.state.d) | 0; // 지금 서 있는 칸
let armed = 0; // 지금 칸 위에 쌓아 둔 "진짜" 칸 수
let lastArm = -1e9;
function guardOn(fromGesture = false) {
  if (!fromGesture) { // 활성 없이: 처음 한 번만 (사파리·파이어폭스용 · 크롬은 건너뜀) — 세지 않는다
    if (guarded) return;
    try { history.pushState({ lb: 'guard', d: ++hDepth, soft: 1 }, ''); guarded = true; } catch { /* 무시 */ }
    return;
  }
  const now = performance.now();
  if (now - lastArm < 500 || armed >= 3) return; // 같은 탭에서 두 번째 칸은 건너뛰어지므로 안 쌓는다
  try { history.pushState({ lb: 'guard', d: ++hDepth }, ''); guarded = true; armed++; lastArm = now; guardGesture = true; } catch { /* 무시 */ }
}
for (const t of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(t, (ev) => { if (ev.isTrusted !== false && (t !== 'keydown' || !ev.repeat)) guardOn(true); }, { capture: true, passive: true });
window.addEventListener('pointerdown', (ev) => { if (ev.pointerType === 'mouse') guardOn(true); }, { capture: true, passive: true }); // 마우스는 누르는 순간이 활성
try { sessionStorage.setItem('lb_active', String(Date.now())); } catch { /* 무시 */ }
setInterval(() => { try { sessionStorage.setItem('lb_active', String(Date.now())); } catch { /* 무시 */ } }, 1000);
for (const t of ['pointerdown', 'keydown']) window.addEventListener(t, () => { app.lastInput = performance.now(); }, { capture: true, passive: true });
window.addEventListener('pointerdown', () => { app.downAt = performance.now(); }, { capture: true, passive: true });
function leaveToHub() {
  saveSnap();
  document.body.classList.add('leaving');
  setTimeout(() => { location.replace('/'); }, 180);
}
function guardOff() { /* 기록은 계속 한 칸만 유지 (예전 history.back 은 다른 페이지로 새는 일이 있어서 안 쓴다) */ }
const SCREEN_OPEN = () => ({ shop: showShop, bag: showBag, members: showMembers, deck: showDeckTab, pvp: showPvp, missions: showMissions, season: showSeason, weekly: showWeekly, dex: showDex, stages: showStages, ranking: showRanking, prep: () => showPrep(app.mode, app.stage), tower: () => TWUI.show() });
function noteScreen() { // show() 가 부른다
  const h = app.screenHist || (app.screenHist = []);
  if (app.navBack) { app.navBack = false; return; }
  if (app.screen === 'play' || app.screen === 'result') { h.length = 0; return; }
  if (h[h.length - 1] !== app.screen) h.push(app.screen);
  if (h.length > 12) h.shift();
}
function closeTopLayer() {
  if (app.confirmOpen) { closeConfirm(false); return true; }
  const top = [...stage.querySelectorAll('.reveal, .gacha-res, .info-modal')].pop();
  if (top && top.classList.contains('input-pop') && top._cancel) { top._cancel(); return true; }
  if (top && top.classList.contains('pvp-wait')) { confirmBox({ title: '방에서 나갈까요?', sub: '기다리던 방이 닫혀요', ok: '나가기', cancel: '더 기다리기' }).then((ok) => { if (ok) { if (PVP.sock) PVP.sock.emit('cancel'); top.remove(); } }); return true; }
  if (top) { if (top.classList.contains('reveal')) top.click(); else if (top.classList.contains('gacha-res')) { const ok = top.querySelector('.gr-ok'); if (ok && !ok.hidden) ok.click(); } else { top.remove(); if (top.classList.contains('dexpage') && app.screen === 'dex') showDex(); } return true; }
  return false;
}
window.addEventListener('popstate', (ev) => {
  if (ignorePop > 0) { ignorePop--; return; }
  if (TR) TR.finish();
  const d = (ev.state && ev.state.lb === 'guard' && ev.state.d) | 0;
  if (d > hDepth) { hDepth = d; return; } // 앞으로 가기 — 무시
  hDepth = d;
  armed = Math.max(0, armed - 1);
  guardGesture = false; guarded = false;
  guardOn(); // 부드러운 칸 하나 (사파리·카톡·파이어폭스는 이것으로 버틴다 · 크롬은 건너뛰니 진짜 칸은 다음 탭에서)
  if (closeTopLayer()) return;
  if (app.screen === 'play' && app.g && !app.g.over) {
    if (app.g.pvp) { askForfeit(); return; } // 실시간 대전은 멈출 수 없다 → 기권 확인
    if (app.paused) askQuit();
    else pauseGame();
    return;
  }
  if (app.screen === 'play' || app.screen === 'result') { app.g = null; showMenu(); return; }
  if (app.screen !== 'menu') {
    const h = app.screenHist || [];
    if (h[h.length - 1] === app.screen) h.pop();
    const prev = h[h.length - 1], open = SCREEN_OPEN()[prev];
    if (prev && prev !== 'menu' && open) { app.navBack = true; open(); } else { h.length = 0; showMenu(); }
    return;
  }
  confirmBox({ title: '찬이의 게임월드로 나갈까요?', sub: '랑방 대전을 닫고 게임월드로 돌아가요', ok: '나가기', cancel: '취소' }).then((ok) => { if (ok) leaveToHub(); });
});

// ─── 데모(메뉴 뒤에서 돌아가는 구경용 판) ─────────────
// ─── 진행 도우미 ─────────────────────────────────────
const HD = (id) => HEROES[id] || SUMMONS[id]; // 소환 멤버(성준영)까지
const P = () => app.profile;
const nextStage = () => Math.min(STAGE_COUNT, (P().maxStage || 0) + 1);
const stageUnlocked = (s) => !!P().master || s <= (P().maxStage || 0) + 1;
const heroOk = (id) => HEROES[id] && id !== 'bangjang' && API.heroUnlocked(P(), id);
// 추천 멤버 이름: 아직 합류 안 한 멤버는 ??? 로 (이름 스포 금지)
const heroNm = (id) => (HEROES[id] && (!P() || API.heroUnlocked(P(), id)) ? HEROES[id].name : '???');
// 같이 출전하는 동료 수: 1챕터 1명 · 1-10 깨면 2명 (무한 도전은 2명)
const slotsNow = () => (app.mode === 'endless' ? 2 : partnerSlots(P().maxStage || 0));
function fixPartners() {
  const n = slotsNow();
  let list = [...new Set((app.partners || []).filter(heroOk))];
  for (const d of ['gunman', 'staff', 'gunnyeo']) if (list.length < n && !list.includes(d)) list.push(d);
  list = list.slice(0, n);
  app.partners = list;
  app.partner = list[0];
  try { localStorage.setItem('langbang:partners', JSON.stringify(list)); } catch { /* 무시 */ }
}
function unlockText(id) {
  const s = HERO_UNLOCK[id];
  return s ? `${stageLabel(s)} 클리어하면 합류` : '';
}
function partnerList() { return ['staff', 'gunman', 'gunnyeo', ...UNLOCK_HEROES, ...HIDDEN_HEROES, ...GACHA_HEROES, ...LEGEND_HEROES]; }

// ─── 게임 시작/끝 ─────────────────────────────────────
async function startRun(opt = {}) {
  const mode = opt.mode || app.mode;
  const st = mode === 'stage' ? opt.stage || app.stage : 0;
  const hell = mode === 'stage' && (opt.hell !== undefined ? opt.hell : app.hellMode) && hellOpen(P().stages, st);
  const snap = loadSnap();
  if (snap && !opt.force) {
    const ok = await confirmBox({ title: '새로 시작할까요?', sub: `이어하던 판(${snapLabel(snap)})은 사라져요`, ok: '새로 시작', cancel: '취소', danger: true });
    if (!ok) return;
  }
  let weekly = null;
  app.weeklyRun = null;
  const raid = mode === 'raid' ? { sec: L.RAID.sec } : null;
  if (raid) weekly = L.raidDef(opt.raidWi !== undefined ? opt.raidWi : L.raidState().wi);
  const pvp = mode === 'pvp' ? { seed: Number(opt.pvpSeed) >>> 0, hp: opt.pvpHp || 1 } : null; // hp: 서버가 두 덱 전투력으로 정한 진상 체력
  const tw = mode === 'tower' ? opt.tower : null; // 진상의 탑: { f, hero, runId } (시작은 탑 화면이 서버에 먼저 알린다)
  const dbg = DEBUG.wave > 1 || DEBUG.god || DEBUG.stress > 0 || Q.has('nosave') || (mode === 'stage' && !stageUnlocked(st));
  if (mode === 'stage' && !dbg && !opt.resume) {
    const r = await API.stageStart(st, !!hell, app.guest);
    if (!r.ok) { if (/체력/.test(r.message || '')) showStamina(r.message); else toast(r.message || '시작할 수 없어요'); return; }
    if (r.profile) app.profile = r.profile;
  }
  if (mode === 'endless' && !dbg && !opt.resume) {
    const r = await API.endlessStart(app.guest);
    if (!r.ok) { toast(r.message || '시작할 수 없어요', 2600); return; }
    if (r.profile) app.profile = r.profile;
  }
  if (mode === 'weekly') {
    const r = await API.weeklyStart(app.guest);
    if (!r.ok) { toast(r.message || '주간 도전을 시작할 수 없어요'); return; }
    weekly = L.weeklyDef(r.wi);
    app.weeklyRun = r.runId;
  }
  let consIds = [];
  if (['stage', 'endless', 'weekly', 'raid', 'tower'].includes(mode) && !dbg && !opt.resume) {
    const lo = consLoadout().filter((id) => id && consHave(id) > 0);
    if (lo.length) { const r = await API.consStart(lo, app.guest); if (r && r.ok) { consIds = r.cons || []; if (r.profile) app.profile = r.profile; } }
  }
  clearSnap();
  app.mode = mode;
  app.stage = st;
  fixDeck();
  const p = P();
  // 2배속: 이미 깬 스테이지만
  app.runSpeed = mode === 'stage' && app.speed2 && (p.stages[st] | 0) > 0 ? 2 : 1;
  const unlocked = DEBUG.hidden ? LOCKED_HEROES.slice() : p.unlocked || [];
  R.maxDpr = R.baseDpr = hell ? 1.75 : 2; // 판마다 새로 (지난 판에 낮춘 화질이 남지 않게) · 헬은 진상이 많아 조금 낮게 시작
  layoutForNewRun();
  const deck = tw ? [null, null, tw.hero, null, null, null] : curDeck();
  const g = S.createGame({
    H: app.logicalH, meta: p.heroes || {}, items: p.items || {}, deck, positions: nPosNow(), slots: deckSlotsNow(), gear: API.gearFor(p, deck.filter(Boolean), pvp ? 'pvp' : 1), stars: p.hstars || {},
    guestPool: [...UNLOCK_HEROES, ...HIDDEN_HEROES].filter((id) => !API.heroUnlocked(p, id)),
    god: DEBUG.god || DEBUG.stress > 0, join: DEBUG.join, tempo: DEBUG.tempo, leader: deckLeader(), mode: weekly || pvp ? 'stage' : mode, stage: pvp ? 12 + (pvp.seed % 17) : st, weekly, raid, pvp, hell, unlocked, trialAll: mode === 'endless', startWave: DEBUG.wave || 0,
    awake: TWUI ? TWUI.awake(p) : {}, ...(tw ? TWUI.gameOpt(tw, p) : {}), // 지옥 각성 (모든 모드) · 탑 한 명
  });
  if (DEBUG.wave > 1) {
    // 디버그: 중간 웨이브부터 시작하면 그만큼 강하게
    const n = Math.round((DEBUG.wave - 1) * (mode === 'stage' ? 2 : 1.35));
    for (let i = 0; i < n; i++) { S.applyCard(g, S.rollCards(g)[0]); g.level++; }
    g.need = g.level * 6;
    g.pendingLevels = 0;
    g.welcomePicks = 0;
    g.events.length = 0;
  }
  g.cons = consIds; g.consUsed = {};
  if (pvp) g.pvpMid = (PVP.match && PVP.match.id) || ''; // 이 화면이 돌리는 대전 판 (다시 붙을 때 맞춰 보기)
  if (mode === 'raid' && opt.help) { const sh = S.addSupport(g, { ...opt.help, gear: gearStats(opt.help.gear || []) }); if (sh) toast(`도우미 합류! ${opt.help.nick}님의 ${HEROES[opt.help.hero].name}`, 2600); }
  g.lastSnap = S.snapshot(g); // 첫 웨이브 전에 나가도 이어할 수 있게
  const locked = mode === 'stage' && !stageUnlocked(st);
  app.debugRun = DEBUG.wave > 1 || DEBUG.god || DEBUG.stress > 0 || Q.has('nosave') || locked;
  beginPlay(g);
  saveSnap();
  if ((mode === 'stage' || mode === 'endless' || weekly) && !DEBUG.stage && !Q.has('autostart')) showBattleLoading(g);
  if (app.firstRunTip) {
    showTip('적을 탭하면 집중 공격! 경험치는 저절로 모여요', 4500);
    app.firstRunTip = false;
  } else if (g.joinMode && !tutDone('join')) { setTut('join'); showTip('대장 혼자 시작! 레벨업 카드로 멤버를 합류시켜요', 5000); }
}
// 출격 전 로딩 (1.2~2초): 진짜로 이번 판 그림을 미리 불러오고 · 이번 판 공략 · 덱 상성 · 꿀팁 — 0.8초 뒤부터 누르면 넘김
// 스테이지 상성 한 줄: 가장 많은 진상 종류 → 강한 속성
function stageHint(st) {
  const cw = stageClasses(st); const top = Object.keys(cw).sort((a, b) => cw[b] - cw[a])[0];
  if (!top || !CLASSES[top]) return '누구든 좋아요!';
  const good = Object.keys(ATTRS).filter((a) => typeMul(a, top) > 1).map((a) => ATTRS[a].name);
  return `${CLASSES[top].name} 진상이 ${Math.round(cw[top] * 100)}% · ${good.join(' · ') || '아무'} 멤버가 유리해요`;
}
function showBattleLoading(g) {
  const old = stage.querySelector('.bload'); if (old) old.remove();
  const st = g.stage || 0, ch = st ? chapterOf(st) : 0;
  const foes = st ? prepFoes(st).slice(0, 4) : [];
  const ids = g.heroes.map((h) => h.id).concat((g.joinPool || []).map((x) => x.id)).filter((id) => HEROES[id]);
  const good = st ? ids.filter((id) => attrMatch(HEROES[id].attr, st).cls === 'good').length : 0, bad = st ? ids.filter((id) => attrMatch(HEROES[id].attr, st).cls === 'bad').length : 0;
  const tip = TIPS[(Math.random() * TIPS.length) | 0];
  const d = document.createElement('div');
  d.className = 'bload';
  d.innerHTML = `<div class="bl-art" style="background-image:${chArtCss('dio', Math.max(1, ch || 1))}"></div>
    <div class="bl-box">
      <em class="bl-no">${st ? stageLabel(st) : g.mode === 'endless' ? '무한 도전' : '주간 도전'}</em><b class="bl-name">${st ? esc(stageName(st)) : ''}</b>
      ${foes.length ? `<div class="bl-sec"><small>이번 판 공략</small>${foes.map((t) => { const T = foeTrait(t); const good2 = Object.keys(ATTRS).filter((a) => typeMul(a, ENEMIES[t].cls) > 1); return `<div class="bl-foe">${foeFace(t)}<span><b>${esc(ENEMIES[t].name)}</b><small>${T ? esc(T.tip) : `${good2.map((a) => ATTRS[a].name).join(' · ')} 멤버에게 약해요`}</small></span></div>`; }).join('')}</div>` : ''}
      ${st ? `<div class="bl-match"><span class="ok">${ic('check', '', 'sm')} 유리 ${good}명</span><span class="no">${ic('scale', '', 'sm')} 불리 ${bad}명</span></div>` : ''}
      ${g.conds && g.conds.length ? `<div class="bl-cond">${g.conds.map((c) => `<span>${ic(COND[c].icon, '', 'sm')}${esc(COND[c].name)}</span>`).join('')}</div>` : ''}${g.mission ? `<div class="bl-mis">★★★ 미션 · ${esc(g.mission.text)}</div>` : ''}
      ${st ? `<p class="bl-hint">${ic('target', '', 'sm')}<span>${esc(stageHint(st))}</span></p>` : ''}
      <p class="bl-tip" data-bl="tip">${ic('bulb', '', 'sm')}<span>${esc(tip)}</span><small>다음 팁</small></p>
      <div class="bl-bar"><b></b></div><small class="bl-skip">잠시만요</small>
    </div>`;
  stage.appendChild(d);
  app.paused = true;
  const t0 = performance.now();
  // 미리 불러오기: 이번 판 진상 그림 · 멤버 공격 띠
  const srcs = [...foes.map((t) => ENEMIES[t].img), ...ids.map((id) => HEROES[id].img)];
  let done = 0; const need = srcs.length;
  const bar = d.querySelector('.bl-bar b');
  const MIN = 2800; // 팁을 읽을 시간 (그림이 먼저 다 와도)
  const tick = () => { const k = Math.min(1, Math.min(done / Math.max(1, need), 1) * 0.15 + ((performance.now() - t0) / MIN) * 0.85); bar.style.transform = `scaleX(${Math.min(1, k).toFixed(3)})`; if (performance.now() - t0 > 1200) { const sk = d.querySelector('.bl-skip'); if (sk && !sk.dataset.on) { sk.dataset.on = '1'; sk.textContent = '탭해서 계속'; } } };
  for (const s0 of srcs) { const im = new Image(); im.onload = im.onerror = () => { done++; tick(); }; im.src = s0; }
  let closed = false;
  const close = () => { if (closed) return; closed = true; d.classList.add('out'); setTimeout(() => d.remove(), 250); if (app.g === g && !stage.querySelector('.pause-box')) app.paused = false; last = performance.now(); };
  const iv = setInterval(() => { tick(); const el = performance.now() - t0; if ((done >= need && el > MIN) || el > MIN + 2500) { clearInterval(iv); close(); } }, 50);
  let tipI = TIPS.indexOf(tip);
  d.addEventListener('pointerdown', (ev) => {
    if (ev.target.closest('[data-bl="tip"]')) { tipI = (tipI + 1) % TIPS.length; const s0 = d.querySelector('.bl-tip span'); s0.classList.remove('in'); void s0.offsetWidth; s0.textContent = TIPS[tipI]; s0.classList.add('in'); return; }
    if (performance.now() - t0 > 1200) { clearInterval(iv); close(); }
  });
}
function resumeRun() {
  const d = loadSnap();
  if (!d) { toast('이어할 판이 없어요'); showMenu(); return; }
  app.mode = d.snap.mode;
  app.stage = d.snap.stage || 0;
  app.runSpeed = 1;
  if (Array.isArray(d.partners)) app.partners = d.partners;
  app.partner = app.partners[0];
  app.debugRun = false;
  layoutForNewRun();
  const g = S.restoreGame(d.snap, { H: app.logicalH });
  beginPlay(g);
  fx.banner('이어하기!', `웨이브 ${Math.max(1, d.snap.wave)} 처음부터 다시 시작해요`, '#1a7a9a', 2, 'big');
}
function beginPlay(g) {
  if (app.cardsOpen) closeCards();
  app.rerollsRun = REROLLS; app.rerollsG = g;
  app.g = g;
  app.demo = null;
  app.paused = false;
  app.cardsOpen = false;
  app.ending = false;
  app.hudCache = {};
  app.ultTipShown = false;
  fx.reset();
  // 레이드 · 1:1 대전은 전용 맵 · 전용 곡 (파일이 없으면 지금까지처럼 그 판 챕터 배경 · 챕터 곡)
  const modeArt = g.raid ? 'raid' : g.pvp ? 'pvp' : g.tower ? 'tower' + g.tower.zone : null; // 진상의 탑: 구역 맵
  if (g.tower && TWUI) TWUI.ensureMap(g.tower.zone);
  R.setTheme(g.mode === 'stage' ? chapterOf(g.stage) : 'endless', modeArt);
  if (A.setChapter) A.setChapter(g.mode === 'stage' ? chapterOf(g.stage) : 3);
  if (A.setMode) A.setMode(g.tower ? 'tower' : modeArt);
  app.screen = 'play';
  skillbar.dataset.key = '';
  cancelAim(); hideBubble(); app.drag = null;
  if (g.mapFx.id !== 'none') setTimeout(() => { if (app.g === g) fx.banner(`${g.mapFx.icon} ${g.mapFx.name}`, g.mapFx.desc, '#23336a', 2.2, 'big'); }, 300);
  TR.leave(); // 출전 화면은 잠깐 흐려지며 사라진다 (뚝 끊기지 않게)
  hud.hidden = false;
  hud.classList.toggle('endless', g.mode !== 'stage' || !!g.weekly);
  hud.classList.toggle('fast', app.runSpeed > 1);
  hud.classList.toggle('hell', !!g.hell);
  hud.classList.toggle('pvp', !!g.pvp);
  hud.classList.toggle('tower', !!g.tower);
  if (g.pvp) renderOppStrip(); else { const o = $('#oppstrip'); if (o) o.hidden = true; const sb = $('#btn-send'); if (sb) sb.hidden = true; }
  syncSpeedPill();
  A.playBgm();
  guardOn();
  last = performance.now();
}
function layoutForNewRun() {
  app.g = null;
  layout();
}

function showTip(msg, ms) {
  const t = $('#tip');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showTip.t);
  showTip.t = setTimeout(() => { t.hidden = true; }, ms);
}

function endRun(victory) {
  if (app.ending) return;
  if (app.cardsOpen) closeCards();
  app.ending = true;
  clearSnap();
  setTimeout(() => showResult(victory), victory ? 2200 : 1700);
}

async function askForfeit() {
  if (!app.g || app.g.over) return;
  const ok = await confirmBox({ title: '기권할까요?', sub: '지금 나가면 이 대전은 패배로 기록돼요', ok: '기권', cancel: '계속 싸우기', danger: true });
  if (ok && app.g && !app.g.over) quitRun();
}
async function askQuit() {
  if (!app.g || app.g.over) return;
  const ok = await confirmBox({ title: '정말 그만둘까요?', sub: '지금까지 기록으로 끝나요 (이어하기도 사라져요)', ok: '그만두기', cancel: '취소', danger: true });
  if (ok) quitRun();
}
function quitRun() {
  // 그만두기 = 현재까지 기록으로 패배 처리
  const g = app.g;
  if (!g) return;
  if (g.pvp && PVP.sock) PVP.sock.emit('quit');
  g.over = true;
  g.phase = 'over';
  app.paused = false;
  clearSnap();
  showResult(false, true);
}
// 나중에 이어하기: 지금 웨이브 처음 상태로 저장하고 메뉴로
function leaveForLater() {
  saveSnap();
  const d = loadSnap();
  app.g = null;
  guardOff();
  showMenu();
  if (d) toast(`${snapLabel(d)}부터 이어할 수 있어요`, 2600);
}

// ─── 이벤트 → 연출/소리 ───────────────────────────────
function handleEvents(g, loud) {
  const ev = g.events;
  // 진상이 많으면(80+) 연출을 줄인다: 피해 숫자는 치명타·상성만 · 입자 절반 (느린 폰에서 헬 모드도 부드럽게)
  const crowd = g.enemies.length > 80;
  fx.lite = crowd;
  const busy = crowd || fx.nums.items.length > 45;
  const live = g === app.g;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    if (TWUI && TWUI.isTowerEvent(e.type)) { TWUI.onEvent(g, e, loud); continue; }
    switch (e.type) {
      case 'sudden': case 'suddenUp': case 'pvpDrain': case 'pvpTimeUp': if (live) pvpTimelineEv(g, e); break;
      case 'shot': if (loud) A.sfx.shot(HD(e.hero).proj); if (e.hero === 'hochan' && !busy) { fx.burst(e.x, e.y - 40, 5, '#ffd23f', 90, 'star', 5, 0.5); fx.ring(e.x, e.y - 30, 6, 30, 0.3, '#ffe27a', 2); } break; // 이호찬: 쏠 때마다 금빛 오라 · 왕관 반짝
      case 'dmg':
        if (!busy || ((e.crit || e.eff > 0) && fx.nums.items.length < (crowd ? 14 : 60))) fx.num(e.x, e.y, e.v, e.crit, e.shield ? '#9feaff' : e.sk ? '#ffd23f' : null, e.eff, e.uid);
        break;
      case 'hit': {
        const col = e.crit ? '#ffe14d' : PROJ_COL[e.proj] || '#fff';
        fx.burst(e.x, e.y, e.crit ? 7 : 3, col, e.crit ? 220 : 140, 'spark', e.crit ? 4 : 3, 0.3);
        if (loud) { if (e.crit) A.sfx.crit(); else A.sfx.hit(); }
        break;
      }
      case 'kill': {
        const d = ENEMIES[e.enemy];
        fx.burst(e.x, e.y - 10, e.boss ? 40 : 9, d.color, e.boss ? 260 : 150, 'dot', 4, 0.5);
        fx.burst(e.x, e.y - 6, e.boss ? 16 : 4, 'rgba(230,220,255,0.9)', 50, 'puff', e.boss ? 18 : 9, 0.5);
        R.addCorpse(g, e.enemy, e.x, e.y, e.boss);
        if (d.fuse) { fx.text(e.x, e.y - 60, '합체 해제!', '#ffb0ff', 15, 0.9, -30); for (const k of [-1, 1]) for (let i = 0; i < 4; i++) fx.part('puff', e.x, e.y - 20 - i * 8, k * (160 + i * 30), -30, 0.4, 12, k < 0 ? 'rgba(255,150,220,0.8)' : 'rgba(170,150,255,0.8)'); }
        else if (Math.random() < 0.25) fx.text(e.x, e.y - 20, POOF[(Math.random() * POOF.length) | 0], '#fff', 13, 0.6, -40);
        if (loud) A.sfx.kill();
        fx.combo = g.combo;
        fx.comboPop = 1;
        if (g.combo > 0 && g.combo % 25 === 0) fx.text(180, g.H * 0.22, `${g.combo} COMBO!!`, '#ffd23f', 24, 1.1, -20);
        break;
      }
      case 'shout': fx.bubble(e.x, e.y, e.text); break;
      case 'explode':
        fx.blast(e.x, e.y, e.r, 'fire', 0.5);
        fx.burst(e.x, e.y, 14, '#5fd07a', 200, 'shard', 6, 0.6, 300);
        fx.burst(e.x, e.y, 6, 'rgba(255,200,120,0.8)', 60, 'puff', 12, 0.4);
        if (Math.random() < 0.35) fx.text(e.x, e.y - 12, '와장창!', '#b6ffb0', 14, 0.7);
        if (loud) A.sfx.explode();
        break;
      case 'splash':
        fx.blast(e.x, e.y, e.r, e.proj === 'heart' ? 'heart' : e.proj === 'bottle' ? 'fire' : e.proj === 'swear' ? 'electric' : 'gold');
        if (loud) A.sfx.explode();
        break;
      case 'kick':
        fx.text(e.x, e.y, e.big ? '경고 3번! 강퇴!!' : '강퇴!', '#ff6b5a', e.big ? 19 : 17, 0.9, -30);
        if (e.big) { fx.ring(e.x, e.y + 20, 6, 50, 0.35, '#ff6b5a', 5); fx.burst(e.x, e.y, 10, '#ffd23f', 200, 'spark', 4, 0.4); }
        if (loud) A.sfx.kick();
        break;
      case 'evolve':
        fx.banner(`${HD(e.hero).name} 진화!`, e.name, '#8a4a00', 2, 'big', 'h_' + e.hero);
        fx.flash('#fff1a8', 0.45);
        fx.pillar(e.x, 70, g.rowY + 30, 1.4);
        for (let k = 0; k < 16; k++) fx.part('star', e.x + (Math.random() - 0.5) * 60, e.y - 40, (Math.random() - 0.5) * 200, -140 - Math.random() * 100, 1, 10, null, { grav: 260 });
        if (loud) A.sfx.reveal('epic');
        break;
      case 'freeze':
        if (!busy || Math.random() < 0.4) fx.text(e.x, e.y, Math.random() < 0.5 ? '#@!%' : '얼음!', '#ffb46b', 15, 0.7);
        fx.burst(e.x, e.y, 4, '#9fe8ff', 90, 'spark', 3, 0.35);
        if (loud) A.sfx.kick();
        break;
      case 'chain':
        for (let k = 1; k <= 5; k++) fx.part('spark', e.x + (e.x2 - e.x) * k / 6, e.y + (e.y2 - e.y) * k / 6, 0, 0, 0.25, 3, '#ff9a3c');
        break;
      case 'miss': if (!busy) fx.text(e.x, e.y, '빗나감!', '#ffc6e4', 12, 0.6); break;
      case 'form':
        if (Math.random() < 0.6) fx.text(e.x, e.y - 50, e.form === 'fat' ? '실물은… 뚱!' : e.form === 'ugly' ? '실물 공개…' : '프사 필터 ON♡', e.form === 'pretty' ? '#ffb8e0' : '#d8c8ff', 13, 0.9);
        break;
      case 'rumor': if (Math.random() < 0.5) fx.text(e.x, e.y, '수군수군', '#c9b6ff', 12, 0.8); break;
      case 'rumorHit': fx.text(e.x, e.y - 62, '수군수군… 공속↓', '#c9b6ff', 13, 1.0); break;
      case 'kneel':
        fx.text(e.ex, e.ey - 90, '무릎 꿇어!', '#ff8a5a', 22, 1.1, -20);
        fx.text(e.x, e.y - 60, '털썩…', '#ffd6a8', 13, 1.0);
        fx.ring(e.x, e.y, 6, 60, 0.4, '#ff8a5a', 4);
        fx.addShake(5);
        if (loud) A.sfx.slam();
        break;
      case 'duckThrow': if (Math.random() < 0.35) fx.bubble(e.x, e.y - 80, '오리고기 받아라!'); break;
      case 'duckHit':
        fx.text(e.x, e.y - 62, '오리고기!', '#ffb46b', 15, 1.0);
        fx.burst(e.x, e.y - 30, 8, '#c8742e', 150, 'dot', 4, 0.5, 260);
        if (loud) A.sfx.hit();
        break;
      case 'feast':
        fx.ring(e.x, e.y, 20, e.r, 0.8, '#7dff9a', 6);
        fx.text(e.x, e.y - 100, '오리고기 회식!', '#9dffb0', 19, 1.3, -20);
        for (let k = 0; k < 10; k++) fx.part('star', e.x + (Math.random() - 0.5) * e.r, e.y + (Math.random() - 0.5) * 80, 0, -40, 0.8, 7, null);
        if (loud) A.sfx.heal();
        break;
      case 'baseHit':
        fx.baseHitA = Math.min(1, fx.baseHitA + (e.boss ? 0.8 : 0.35));
        fx.ropeWobble = 1;
        fx.addShake(e.boss ? 6 : 1.5);
        // 문 부수기: 나무 조각 · 불꽃 · 바닥 금 (많을 땐 조각 생략)
        if (!busy) { fx.burst(e.x, e.y - 4, e.boss ? 12 : 6, '#c9a27a', e.boss ? 220 : 160, 'dot', 4, 0.55, 420); fx.burst(e.x, e.y - 8, e.boss ? 6 : 3, '#ffd27a', 130, 'star', 6, 0.35); }
        R.vfx('crack', e.x, e.y + 6, { anim: 'fade', dur: e.boss ? 900 : 520, sz: e.boss ? 130 : 64, flat: true });
        fx.text(e.x, e.y + 20, '-' + e.v, '#ff5a6a', e.boss ? 20 : 13, 0.7, -30);
        hitBaseHud();
        if (loud) A.sfx.baseHit();
        break;
      case 'steal':
        fx.text(e.x, e.y - 30, e.v ? `먹튀!! 경험치 -${e.v}` : '먹튀!!', '#8fe3ff', 17, 1.4, -26);
        fx.burst(e.x, e.y, 6, '#6ff0ff', 150, 'dot', 4, 0.7, 300);
        if (loud) A.sfx.steal();
        break;
      case 'recover': if (e.v) fx.text(e.x, e.y - 20, `경험치 되찾음! +${e.v}`, '#7dff9a', 15, 1.1); if (loud) A.sfx.coin(); break;
      case 'escape': if (e.v) fx.text(clamp(e.x, 60, 300), 110, `먹튀 성공… 경험치 -${e.v}`, '#ffb3b3', 13, 1.3, 10); break;
      case 'gem': if (loud) A.sfx.gem(); break;
      case 'levelup':
        fx.flash('#ffd54a', 0.35);
        fx.ring(180, g.rowY, 20, 260, 0.6, '#ffd23f', 6);
        fx.text(180, g.rowY - 70, 'LEVEL UP!', '#ffd23f', 26, 1.2, -20);
        if (loud) A.sfx.levelUp();
        break;
      case 'multikill': if (loud) multiKillFx(g, e); break;
      case 'goodman': // 박상화 자기 자랑 (분홍 · 금빛 반짝 글자) · 스킬은 조명 + 금화 비 + 금빛 띠 (skillfx.js)
        if (e.big) { SKFX.add('goodman', g, { x: e.x, y: e.y, echo: e.text && e.text.startsWith('끝내') }, busy); fx.burst(e.x, e.y + 6, busy ? 6 : 14, '#ffe27a', 120, 'star', 6, 0.7); if (loud) { A.sfx.coin(); setTimeout(() => A.sfx.reward(), 160); } break; }
        if (!busy) { fx.text(e.x, e.y, e.text, e.big ? '#ffd23f' : '#ff9fd8', e.big ? 17 : 13, e.big ? 1.3 : 0.9, -30); fx.burst(e.x, e.y + 6, e.big ? 10 : 4, '#ffe27a', 90, 'star', 5, 0.6); }
        break;
      case 'grow': if (!busy) fx.text(e.x, e.y - 70, `성장 +${e.v}%`, '#ffd23f', 12, 0.9); break;
      case 'bandage': // 홍정민: 거꾸로 든 소주병으로 탁탁 → 입구에 붕대 · 스킬은 붕대가 입구를 감고 초록 회복 물결 (skillfx.js)
        if (e.big) { SKFX.add('bandage', g, e, busy); for (const t of fx.texts.items) if (t.text === `+${e.v} 수리` && t.max - t.life < 0.05) t.life = 0; if (loud) { A.sfx.heal(); A.sfx.whoosh(); } break; }
        fx.text(e.x, e.y - 6, e.big ? '붕대 대공사!' : '탁탁', e.big ? '#9dffb0' : '#c8ffd4', e.big ? 16 : 12, 0.9, -24);
        fx.burst(e.x, e.y, e.big ? 12 : 5, '#ffffff', 80, 'spark', 3, 0.35);
        if (e.v) fx.text(e.x + 18, e.y - 22, `+${e.v}`, '#7be38f', 12, 0.8);
        if (loud) A.sfx.heal();
        break;
      case 'jyLeave': fx.burst(e.x, e.y - 30, 14, '#ffffff', 120, 'puff', 10, 0.6); fx.text(e.x, e.y - 70, '들어갈게~', '#9fd4ff', 13, 1.0); break;
      case 'allinCall': fx.banner('올인 콜! 준영 등판', `${e.sec}초 동안 진상을 한곳으로 모은다`, '#1a4a8a', 1.3, 'wave'); break;
      case 'jyRage': fx.text(e.x, e.y - 70, '준영 폭주!', '#ff7a4f', 15, 1.0); fx.ring(e.x, e.y - 30, 10, 60, 0.6, '#ff7a4f', 4); break;
      case 'chipRain': if (!busy) fx.burst(e.x, e.y - 20, 5, '#ffd23f', 110, 'spark', 3, 0.35); break;
      case 'summon': fx.text(e.x, e.y - 80, '준영아 나와!', '#ff9fc0', 15, 1.1); fx.burst(e.x, e.y - 30, 16, '#9fd4ff', 160, 'spark', 4, 0.6); fx.ring(e.x, e.y - 30, 10, 60, 0.7, '#ff9fc0', 5); if (loud) A.sfx.join(); break;
      case 'allin': fx.text(e.x, e.y - 20, '올인!', '#ffd23f', 20, 1.0); fx.blast(e.x, e.y, e.r, 'gold'); fx.addShake(5); if (loud) A.sfx.explode(); break;
      case 'nagbomb': fx.text(e.x, e.y - 20, '잔소리 폭격!', '#ff9fc0', 16, 0.9); fx.blast(e.x, e.y, e.r, 'heart'); if (loud) A.sfx.explode(); break;
      case 'timestop': { // 오지은: 색이 빠지는 물결 · 범위 = 큰 시계 · 멈춘 진상 얼음빛 (skillfx.js)
        const jh = g.heroes.find((o) => o.id === 'jieun');
        fx.text(jh ? jh.x : e.x, (jh ? jh.y : e.y) - 70, '…시간아 멈춰라', '#e3d4ff', 14, 1.0); fx.flash('#e8eeff', 0.22);
        SKFX.add('timestop', g, e, busy);
        if (loud) { A.sfx.charm(); for (let k = 0; k < 6; k++) setTimeout(() => A.sfx.tap(), 140 + k * 130); setTimeout(() => A.sfx.thud(), 960); }
        break;
      }
      case 'bossWind': {
        fx.text(e.x, e.y - 20, `${e.name}!`, '#ff5a5a', 15, 1.0, -10); if (loud) A.sfx.charm && A.sfx.charm();
        // 예고 (1초): 기절은 노리는 멤버 발밑 빨간 원 · 충격파는 땅 갈라짐 · 소환은 소환진 · 침묵은 낙서 구름 · 감속은 푸른 기운
        const W = 1000;
        if (e.kind === 'stun') for (const q of e.targets || []) R.vfx('warn', q.x, q.y + 10, { anim: 'grow', dur: W, sz: 90, flat: true });
        else if (e.kind === 'shock') { R.vfx('crack', e.x, e.y + 30, { anim: 'grow', dur: W, sz: 160, flat: true }); R.vfx('warn', e.x, e.y + 20, { anim: 'grow', dur: W, sz: 200, flat: true }); }
        else if (e.kind === 'summon') R.vfx('summon', e.x, e.y + 20, { anim: 'grow', dur: W, sz: 150, flat: true });
        else if (e.kind === 'silence') R.vfx('silence', e.x, e.y - 60, { anim: 'pulse', dur: W, sz: 90 });
        else if (e.kind === 'slow') R.vfx('aura_blue', e.x, e.y, { anim: 'grow', dur: W, sz: 150, flat: true });
        else if (e.kind === 'drain') R.vfx('aura_red', e.x, e.y, { anim: 'grow', dur: W, sz: 150, flat: true });
        else if (BBIKKI_SK[e.kind]) { // 삐끼왕: 처음 한 번은 배너로 무슨 기술인지 알려 주고 · 예고 표시
          if (!g._bbSeen) g._bbSeen = {};
          if (!g._bbSeen[e.kind]) { g._bbSeen[e.kind] = 1; fx.banner(e.name, BBIKKI_SK[e.kind], '#4a7a00', 1.1, 'wave'); }
          if (e.kind === 'flyer') for (const q of e.targets || []) R.vfx('warn', q.x, q.y + 10, { anim: 'grow', dur: W, sz: 90, flat: true });
          else if (e.kind === 'lure') { R.vfx('summon', e.x, e.y + 20, { anim: 'grow', dur: W, sz: 170, flat: true }); R.vfx('warn', e.x, e.y + 20, { anim: 'grow', dur: W, sz: 240, flat: true }); }
          else R.vfx('aura_blue', 180, g.ropeY - 40, { anim: 'grow', dur: W, sz: 300, flat: true });
        }
        break;
      }
      case 'bossSkill': {
        const bossE = g.enemies.find((q) => !q.dead && Math.abs(q.x - e.x) < 2 && Math.abs(q.y - e.y) < 2);
        // 날아가는 물건: 술병 · 계약서/명함 · 폰
        const thrown = /술병|병/.test(e.name) ? 'w_bottle' : /계약서|명함|광고|딱지/.test(e.name) ? 'barrage_card' : /폰|셀카|섬광/.test(e.name) ? 'phone' : null;
        if (e.kind === 'stun') {
          const ts = g.heroes.filter((h) => h.stunT > 0);
          if (/돌진|호통|박치기/.test(e.name)) for (const h of ts) R.vfx('dash', (e.x + h.x) / 2, (e.y + h.y) / 2, { anim: 'streak', dur: 350, sz: Math.hypot(h.x - e.x, h.y - e.y), rot: Math.atan2(h.y - e.y, h.x - e.x) });
          if (thrown) for (const h of ts) R.vfx(thrown, e.x, e.y - 20, { anim: 'fly', dur: 420, sz: 44, tx: h.x, ty: h.y - 30 });
          for (const h of ts) R.vfx('stun', 0, 0, { follow: h, dy: -78, anim: 'pulse', dur: 1300, sz: 56 });
        } else if (e.kind === 'shock') { R.vfx('shock2', e.x, e.y, { anim: 'pop', dur: 650, sz: 260 }); R.vfx('smoke', e.x, e.y + 20, { anim: 'pop', dur: 700, sz: 150 }); }
        else if (e.kind === 'silence') { for (const h of g.heroes) R.vfx('silence', 0, 0, { follow: h, dy: -86, anim: 'pulse', dur: 2800, sz: 46 }); if (thrown) for (const h of g.heroes.slice(0, 3)) R.vfx(thrown, e.x, e.y - 20, { anim: 'fly', dur: 450, sz: 40, tx: h.x, ty: h.y - 30 }); }
        else if (e.kind === 'slow') R.vfx('aura_blue', 180, g.rowY - 10, { anim: 'pulse', dur: 3500, sz: 340, flat: true });
        else if (e.kind === 'summon') { R.vfx('summon', e.x, e.y + 20, { anim: 'pop', dur: 600, sz: 180, flat: true }); R.vfx('smoke', e.x, e.y, { anim: 'pop', dur: 600, sz: 140 }); }
        else if (e.kind === 'drain') R.vfx('aura_red', e.x, e.y, { anim: 'pop', dur: 700, sz: 180 });
        else if (e.kind === 'flyer') for (const q of e.hits || []) { R.vfx('barrage_card', e.x, e.y - 20, { anim: 'fly', dur: 420, sz: 44, tx: q.x, ty: q.y - 30 }); const hh = g.heroes.find((x) => x.id === q.id); if (hh) R.vfx('barrage_card', 0, 0, { follow: hh, dy: -40, anim: 'pulse', dur: q.sec * 1000, sz: 52 }); }
        else if (e.kind === 'lure') { R.vfx('summon', e.x, e.y + 20, { anim: 'pop', dur: 600, sz: 200, flat: true }); R.vfx('dash', e.x, e.y + 120, { anim: 'streak', dur: 500, sz: 220, rot: Math.PI / 2 }); }
        else if (e.kind === 'vip') for (const q of e.pts || []) R.vfx('aura_blue', q.x, q.y, { anim: 'pop', dur: 700, sz: 90, flat: true });
        if (bossE) R.vfx(e.kind === 'drain' || e.kind === 'stun' ? 'aura_red' : 'aura_blue', 0, 0, { follow: bossE, dy: 0, anim: 'pulse', dur: 900, sz: bossE.def.size * 1.3, flat: true });
      }
      // falls through
      case 'bossSkillFx': fx.ring(e.x, e.y - 30, 20, 140, 0.5, e.kind === 'silence' ? '#b48cff' : e.kind === 'slow' ? '#6fb3ff' : e.kind === 'summon' ? '#ffd23f' : '#ff5a5a', 5); fx.addShake(e.kind === 'stun' || e.kind === 'shock' ? 6 : 3); if (e.kind === 'silence') toast('스킬 게이지가 잠깐 멈췄어요', 1500); if (e.kind === 'slow') toast('멤버 공격 속도 ↓ (4초)', 1500); if (e.kind === 'flyer' && e.hits && e.hits.length) toast(`전단지에 가려 ${e.hits.length}명 사거리 −${Math.round(e.cut * 100)}% (${e.sec}초)`, 1500); if (e.kind === 'lure') toast('진상들이 한 줄로 우르르! 범위 공격 기회', 1500); if (e.kind === 'vip') toast('앞줄 진상 보호막 — 운영진으로 깨자', 1500); break;
      case 'bossGap': fx.text(e.x, e.y, '틈! 지금 때려!', '#ffe066', 15, 1.1); break;
      case 'bossRage': fx.banner(`${e.name} 분노!`, e.sub || '빨라지고 새 기술을 쓴다', '#a01020', 1.3, 'big'); fx.flash('#ff2a2a', 0.3); fx.addShake(8); if (loud) A.sfx.explode(); break;
      case 'midRage': fx.text(e.x, e.y, `${e.name} 흥분!`, '#ff7a4f', 14, 1.0); break;
      case 'bossRoar': fx.ring(e.x, e.y - 30, 30, 220, 0.6, '#ff8a3c', 6); fx.text(e.x, e.y - 90, '포효!', '#ff8a3c', 16, 0.8); fx.addShake(5); break;
      case 'heroStun': { if (!busy) fx.text(e.x, e.y - 70, '기절!', '#ffd23f', 12, 0.8); R.vfx('hitspark', e.x, e.y - 30, { anim: 'pop', dur: 300, sz: 70 }); const hh = g.heroes.find((x) => Math.abs(x.x - e.x) < 2 && Math.abs(x.y - e.y) < 2) || g.heroes.find((x) => x.id === e.hero); if (hh) hh._hitAt = performance.now(); fx.addShake(4); app.hitStop = Math.max(app.hitStop || 0, 0.04); break; }
      case 'curseOffer': showCurseOffer(e.opts); break;
      case 'augOffer': showAugOffer(e.opts, e.tier); break;
      case 'aug': fx.banner(`${e.title}`, `${TIER_NAMES[e.tier] || ''} 증강`, e.tier === 'prism' ? '#2a6aa0' : e.tier === 'gold' ? '#a07010' : '#4a5a70', 1.3, 'wave'); fx.flash(e.tier === 'prism' ? '#7df9ff' : '#ffd23f', 0.2); break;
      case 'tech': fx.banner(`${TAGS[e.tag].icon} ${e.title}`, `${TIER_NAMES[e.tier]} 테크`, e.tier === 'prism' ? '#2a6aa0' : '#a07010', 1.1, 'wave'); break;
      case 'setBonus': fx.text(180, 170, `${TAGS[e.tag].icon} ${TAGS[e.tag].name} ${e.n}세트! +${Math.round(SET_BONUS[e.n] * 100)}%`, '#7dff9a', 17, 1.3); break;
      case 'ccGet': fx.text(e.x, e.y - 80, `${CC_KINDS[e.kind].icon} ${CC_KINDS[e.kind].name}!`, CC_KINDS[e.kind].color, 14, 1.0); break;
      case 'cc': if (!busy) R.vfx(({ stun: 'cc_stun', pull: 'cc_pull', kb: 'cc_push', slow: 'cc_slow', freeze: 'cc_freeze' })[e.kind] || 'cc_stun', e.x, e.y, { anim: 'pop', dur: 450, sz: 26 });
        if (e.kind === 'pull') { const jy = g.heroes.find((h) => h.id === 'junyoung'); if (jy && jy.ax !== undefined) { // 성준영 자석: 끌려오는 선 · 기준점 소용돌이 · 첫 번엔 "모여라~!"
          R.vfx('pullLine', e.x, e.y, { anim: 'streak', dur: 420, tx: jy.ax, ty: jy.ay, col: '#c07bff' });
          if (!jy.vortexT || g.t - jy.vortexT > 0.55) { jy.vortexT = g.t; R.vfx('summon', jy.ax, jy.ay, { anim: 'pulse', dur: 600, sz: 120, flat: true, spin: 1 }); R.vfx('cc_pull', jy.ax, jy.ay - 30, { anim: 'pop', dur: 450, sz: 34 }); }
          if (!jy.saidGather) { jy.saidGather = true; fx.text(jy.px || jy.x, (jy.py || jy.y) - 80, '모여라~!', '#e0b4ff', 16, 1.2); }
        } } break;
      case 'curse': fx.banner(`${CURSES[e.id].icon} 계약: ${e.name}`, CURSES[e.id].up, '#5a1a7a', 1.3, 'wave'); closeCurseOffer(); break;
      case 'idleEv': fx.banner(e.kind === 'rush' ? '진상 러시! 스킬 2번!' : '주머니 3개 누르기!', e.kind === 'rush' ? '10초 안에 · 못 하면 벌칙 진상' : '8초 안에 · 성공하면 점수 배율 ↑', '#8a5a00', 1.6, 'wave'); A.sfx.charm && A.sfx.charm(); break;
      case 'idleEnd': if (e.ok) { fx.text(180, 200, `성공! 배율 ×${e.streak.toFixed(2)}`, '#ffe066', 18, 1.2); A.sfx.levelUp(); } else { fx.text(180, 200, '실패… 벌칙 진상!', '#ff5a5a', 18, 1.2); fx.addShake(5); } break;
      case 'bagTap': fx.burst(e.x, e.y, 10, '#ffd23f', 140, 'spark', 4, 0.4); fx.text(e.x, e.y - 20, e.left ? `${3 - e.left}/3` : '3/3!', '#ffe066', 14, 0.7); A.sfx.coin && A.sfx.coin(); break;
      case 'traitSeen': { // 처음 보는 특성 진상: 한 번 안내 (기기마다)
        const d = ENEMIES[e.type]; if (!d || !d.traits) break;
        let seenT = {}; try { seenT = JSON.parse(localStorage.getItem('langbang:traitSeen') || '{}'); } catch { /* 무시 */ }
        if (seenT[e.type]) break;
        seenT[e.type] = 1; try { localStorage.setItem('langbang:traitSeen', JSON.stringify(seenT)); } catch { /* 무시 */ }
        const k = Object.keys(d.traits).find((x) => TRAITS[x]);
        if (k) { const T = TRAITS[k]; toast(`${T.icon} ${d.name} — ${T.tip} (추천: ${T.counter.filter((h) => HEROES[h]).map(heroNm).join('·')})`, 4200); }
        break;
      }
      case 'immune': if (!busy) fx.text(e.x, e.y, '안 들림!', '#9fd4ff', 12, 0.6); break;
      case 'blocked': if (!busy) fx.text(e.x, e.y, `막음! ${e.n}`, '#9feaff', 12, 0.6); break;
      case 'split': fx.burst(e.x, e.y - 20, 8, '#ff9fe6', 120, 'spark', 4, 0.4); if (!busy) fx.text(e.x, e.y - 50, '클럽녀 등장!', '#ff9fe6', 12, 0.8); break;
      case 'praise': if (!busy) { fx.text(e.x, e.y, e.text || '언니 너무 이뻐요~', '#ffb3d9', 11, 0.9); fx.ring(e.x, e.y + 20, 10, 90, 0.5, '#ffb3d9', 3); } break;
      case 'praiseRage': fx.text(e.x, e.y, '(표정 싹 바뀜)', '#ff4f6a', 13, 1.0); break;
      case 'haste': if (!busy) fx.text(e.x, e.y, '빨라짐!', '#ffd23f', 12, 0.7); break;
      case 'unveil': if (!busy) fx.text(e.x, e.y, e.eye ? '찾았다!' : '들켰다!', '#e3d0ff', 12, 0.8); if (e.eye) R.vfx('shock2', e.x, e.y + 10, { anim: 'pop', dur: 420, sz: 70, tint: '#c9a8ff' }); break;
      case 'wallGo': fx.text(e.x, e.y - 90, e.twin ? '정섭이 하나 더!' : '뚜벅뚜벅', e.twin ? '#ffb8ef' : '#dfe8ff', e.twin ? 14 : 12, 1); break;
      case 'sigFx': // 전용 신화 효과 발동: 분홍 무지개 반짝 + 짧은 글자
        fx.burst(e.x, e.y - 40, busy ? 6 : 16, '#ff7ad9', 140, 'star', 6, 0.7); fx.ring(e.x, e.y - 20, 12, 110, 0.5, '#ffb8ef', 4);
        if (!busy && !e.twin) fx.text(e.x, e.y - 110, e.revive ? '무한 붕대! 입구 부활' : '전용 신화!', '#ffb8ef', e.revive ? 17 : 13, 1.1, -30);
        if (e.revive) { fx.flash && fx.flash('#ff7ad9', 0.35); if (loud) A.sfx.reward(); }
        break;
      case 'wallHit': fx.burst(e.x, e.y + 10, 5, '#d8d0c0', 90, 'dot', 2, 0.35); break;
      case 'wallPush': if (e.w) for (const sx of [-1, 1]) fx.burst(e.x + sx * e.w, e.y + 24, 4, '#d8d0c0', 70, 'dot', 2, 0.35); if (loud) A.sfx.kick(); break; // 미는 폭 양 끝에 먼지 (실제 판정 폭과 같게)
      case 'wallTurn': case 'wallTired': fx.addShake(4); fx.text(e.x, e.y - 60, e.type === 'wallTired' ? '헉헉… 쉬러 간다' : '쿵!', '#fff', 14, 0.9); R.vfx('shock', e.x, e.y - 30, { anim: 'pop', dur: 450, sz: 130 }); if (loud) A.sfx.slam(); break;
      case 'wallWalk': fx.text(e.x, e.y - 100, '벽이 걸어온다', '#bfd4ff', 15, 1.2); break;
      case 'lockOn': for (const o of e.list || []) R.vfx('warn', o.x, o.y - 10, { anim: 'grow', dur: 600, sz: 56 }); break;
      case 'curseBolt': R.vfx('w_swear', e.x, e.y, { anim: 'fly', dur: 380, sz: 34, tx: e.tx, ty: e.ty }); break;
      case 'fuckall': fx.banner('쌍뻑큐!', `${e.n}명 방깎 3초`, '#b0203a', 1.0, 'wave'); for (const s0 of [-1, 1]) R.vfx('w_mosaic', e.x + s0 * 14, e.y - 40, { anim: 'line', dur: 520, sz: 78, tx: e.x + s0 * 14, ty: 40, blend: 'source-over' }); setTimeout(() => { for (let k = 0; k < 18; k++) fx.part('dot', e.x + (Math.random() - 0.5) * e.w * 2, 60 + Math.random() * (e.y - 100), (Math.random() - 0.5) * 80, -30, 0.6, 5, Math.random() < 0.5 ? '#ff4fb0' : '#d02070'); }, 200); fx.addShake(3); if (loud) A.sfx.slam(); break;
      case 'marry': fx.banner('결혼정보회사 등록!', '"올해는 꼭…" 진상들이 원식만 바라본다', '#c0307a', 1.3, 'wave'); for (let k = 0; k < 14; k++) fx.part('heart', e.x + (Math.random() - 0.5) * e.r, e.y - 120 - Math.random() * 160, 0, -40, 1.4, 12, '#ff7ac8'); fx.ring(e.x, e.y - 80, 20, e.r, 0.8, '#ff7ac8', 5); if (loud) A.sfx.join(); break;
      case 'heartBeam': fx.banner('하트 레이저 풀파워!', `${e.n}명 꿰뚫기`, '#c0307a', 1.1, 'wave'); fx.flash('#ff7ac8', 0.2); fx.addShake(3); if (loud) A.sfx.slam(); break;
      case 'harley': fx.banner('부릉부릉~!', '백인규의 할리', '#1a3a8a', 1.3, 'wave'); fx.addShake(4); if (loud) A.sfx.slam(); break;
      case 'bhStart': fx.text(e.x, e.y - e.r * 0.7, '지팡이 블랙홀!', '#c9a8ff', 18, 1.2); fx.pillar(e.x, 90, e.y + 10, 0.8); fx.ring(e.x, e.y, e.r, 12, 2, '#9b6bff', 4); if (loud) A.sfx.charm(); break;
      case 'bhBoom': fx.blast(e.x, e.y, e.r * 1.2, 'electric'); fx.ring(e.x, e.y, 10, e.r * 1.6, 0.5, '#e0c8ff', 6); fx.addShake(6 + Math.min(8, e.n)); fx.text(e.x, e.y - 30, e.n >= 6 ? `쾅!! ×${e.mul}` : '쾅!', '#fff', 20, 1); if (loud) A.sfx.explode(); break;
      case 'aimLine': {
        // 줄 스킬 조준선 (0.15초 흐릿하게)
        const cx0 = Math.cos(e.a), cy0 = Math.sin(e.a);
        for (let k = 1; k <= 10; k++) fx.part('spark', e.x + cx0 * e.len * k / 10, e.y + cy0 * e.len * k / 10, 0, 0, 0.18, 3, 'rgba(255,240,180,0.8)');
        break;
      }
      case 'skillHold': if (loud && performance.now() - (app.holdAt || 0) > 1500) { app.holdAt = performance.now(); fx.text(e.x, e.y - 60, '사거리에 진상이 없어요 — 아껴 둘게요', '#cfe3ff', 11, 0.9); } break;
      case 'waveStart': {
        const n = S.enemiesLeft(g);
        const stageMode = g.mode === 'stage';
        const last = stageMode && e.wave >= g.totalWaves;
        const wk = WAVE_KINDS[e.kind] || WAVE_KINDS.N;
        const wsub = e.kind === 'S' ? `${wk.icon} 진상 떼가 몰려온다! (${n}명)` : e.kind === 'E' ? `${wk.icon} 정예 진상 ${n}명 — 한 방 공격으로!` : e.kind === 'M' ? `${wk.icon} 떼거리 + 정예 호위 (${n}명)` : `진상 ${n}명 접근 중!`;
        if (!e.boss) fx.banner(last ? '마지막 웨이브!' : `WAVE ${e.wave}${stageMode ? '/' + g.totalWaves : ''}`, wsub, e.kind === 'E' ? '#ff6b5a' : '#ffd23f', 1.7, 'wave');
        if (loud) { A.sfx.wave(); if (e.kind === 'S' || e.kind === 'B') A.sfx.rumble(); }
        if (live) saveSnap();
        break;
      }
      case 'bossIntro': {
        const b = ENEMIES[e.enemy];
        const col = BOSS_COL[e.enemy] || '#9a1a1a';
        fx.banner(b.title, e.enemy2 ? `${ENEMIES[e.enemy2].name}까지 온다!` : b.subtitle, col, RULES.bossIntroSec, 'boss', 'e_' + e.enemy);
        fx.addShake(8);
        if (loud) A.sfx.boss();
        break;
      }
      case 'reveal':
        if (e.text) { fx.text(e.x, e.y, e.text, '#ffe14d', 15, 1.0, -30); break; }
        fx.text(e.x, e.y, '들켰다!', '#ffe14d', 16, 1.0, -30);
        fx.ring(e.x, e.y + 30, 6, 46, 0.4, '#ffe14d', 3);
        break;
      case 'stall': fx.text(e.x, e.y, '퍼졌다! ', '#c8c8d8', 14, 1.0, -24); fx.burst(e.x, e.y + 20, 8, 'rgba(90,90,100,0.8)', 80, 'puff', 10, 0.6); if (loud) A.sfx.explode(); break;
      case 'insurance':
        fx.text(e.x, e.y, e.boss ? '보험 전부 가입!!' : '보험 드세요!', '#ffe14d', e.boss ? 18 : 13, 1.0, -26);
        fx.ring(e.x, e.y + 30, 10, e.r, 0.6, 'rgba(111,240,255,0.8)', 3);
        break;
      case 'lieBreak': fx.text(e.x, e.y, '거짓말 들켰다!', '#ff9ecb', 16, 1.1, -30); fx.burst(e.x, e.y + 20, 12, '#ffd6f0', 180, 'shard', 5, 0.5, 200); if (loud) A.sfx.explode(); break;
      case 'figures': fx.text(e.x, e.y, '피규어 소환!', '#ffb3d6', 14, 0.9, -24); fx.ring(e.x, e.y + 40, 8, 50, 0.4, '#ffb3d6', 3); break;
      case 'zzz': fx.text(e.x, e.y, 'zzz… (길막)', '#b8c0ff', 14, 1.2, -18); break;
      case 'wake': fx.text(e.x, e.y, '벌떡!', '#ffd08a', 16, 0.8, -30); break;
      case 'goHome': fx.text(e.x, e.y, `집에 갈래~ (경험치 -${e.v})`, '#ffd6a8', 13, 1.1, -24); break;
      case 'cling': fx.text(e.hx, e.hy - 70, '착! (집착)', '#b8c0d8', 13, 1.0, -20); if (loud) A.sfx.charm(); break;
      case 'sarcasm': if (Math.random() < 0.5) fx.bubble(e.x, e.y - 20, ['어머 대단하다~', '역시 너밖에 없어~', '옷 예쁘다 어디서 샀어?'][(Math.random() * 3) | 0]); break;
      case 'sarcHit': fx.text(e.x, e.y - 62, '돌려까기… 공격력↓', '#c9b6ff', 12, 1.0); break;
      case 'reflect':
        fx.text(e.x, e.y - 70, '말빨로 되받아치기!', '#ffd23f', 15, 1.1, -24);
        for (let k = 1; k <= 6; k++) fx.part('spark', e.x + (e.ex - e.x) * k / 7, e.y - 40 + (e.ey - e.y) * k / 7, 0, 0, 0.3, 3, '#ffd23f');
        if (loud) A.sfx.crit();
        break;
      case 'golf': if (Math.random() < 0.6) fx.text(e.x, e.y, '나이스 샷!', '#b8ffb0', 14, 0.9, -24); break;
      case 'toss': fx.text(e.x, e.y, e.text, '#ffcf8a', 16, 1.1, -24); break;
      case 'tossHit': fx.text(e.x, e.y - 62, e.kind === 'glow' ? '눈부셔… 공속↓' : '쾅! 기절', '#ffb46b', 13, 1.0); fx.burst(e.x, e.y - 30, 6, '#ffd23f', 140, 'star', 7, 0.5); if (loud) A.sfx.hit(); break;
      case 'enrage':
        fx.banner('' + e.text, '보스가 분노했다 — 더 빠르고 아프다!', '#8a1010', 1.8, 'wave');
        fx.flash('#ff4040', 0.35); fx.addShake(8);
        if (loud) A.sfx.rage();
        break;
      case 'disco':
        fx.banner('파티 타임!', e.block ? '건전녀의 철벽! 홀림 막음' : '멤버 전원 잠깐 홀림!', '#8a2a8a', 1.4, 'wave');
        for (let k = 0; k < 20; k++) fx.part('confetti', 40 + Math.random() * 280, 60 + Math.random() * 120, (Math.random() - 0.5) * 120, 120, 1.6, 6, ['#ff4fd8', '#6ff0ff', '#ffd23f', '#7dff9a'][k % 4], { grav: 80 });
        if (loud) A.sfx.charm();
        break;
      case 'confetti': for (let k = 0; k < 12; k++) fx.part('confetti', e.x + (Math.random() - 0.5) * 80, e.y, (Math.random() - 0.5) * 220, 160, 1.2, 6, ['#ff4fd8', '#6ff0ff', '#ffd23f'][k % 3], { grav: 120 }); break;
      case 'jusaPhase': fx.text(e.x, e.y, ['엉엉엉 (눈물 웅덩이)', '2차 가자!! (질주)', 'zzz… (회복 중 — 지금이야!)', '집에 갈래~ (경험치 훔침)'][e.phase], '#ffb3a8', 15, 1.3, -24); break;
      case 'wind': fx.text(180, g.H * 0.25, e.dir > 0 ? '바람 → ' : '← 바람', '#dff4ff', 14, 1.0, -10); break;
      case 'strobe': if (loud) A.sfx.card(); break;
      case 'slotOpen':
        fx.banner('임시 칸 개방!', '이번 판만 자리 하나가 열렸어요', '#1a6a8a', 1.8, 'big');
        fx.burst(e.x, e.y - 10, 26, '#c8ccd8', 260, 'shard', 6, 0.7, 300);
        fx.ring(e.x, e.y, 8, 80, 0.5, '#6ff0ff', 6);
        fx.flash('#bff4ff', 0.4); fx.addShake(6);
        if (loud) A.sfx.reveal('epic');
        break;
      case 'guestJoin':
        fx.banner(`게스트 ${HD(e.hero).name} 합류!`, '이번 판만 함께해요 — 스테이지를 깨면 정식 합류하는 멤버', '#0a5a6e', 2, 'hidden', 'h_' + e.hero);
        if (live) showReveal(e.hero, 'new');
        break;
      case 'lockedSlot': break;
      case 'midSpawn': {
        const d = ENEMIES[e.enemy];
        fx.banner('중간 보스 등장!', d.name, '#6a1a8a', 1.8, 'wave');
        fx.flash('#d8a8ff', 0.35);
        fx.addShake(5);
        if (loud) { A.sfx.rage(); }
        break;
      }
      case 'bossSpawn': {
        if (live) A.setBoss(true);
        fx.ring(e.x, 40, 10, 140, 0.8, '#ff4b4b', 6);
        const def = S.waveDefFor(g, g.wave);
        if (def.boss2 === e.enemy && def.boss !== e.enemy) fx.banner(`${ENEMIES[e.enemy].name} 난입!`, ENEMIES[e.enemy].subtitle, BOSS_COL[e.enemy] || '#9a1a1a', 2, 'boss', 'e_' + e.enemy);
        break;
      }
      case 'windup': fx.text(e.x, e.y - 90, '!!', '#ff4b4b', 26, 0.8, -10); break;
      case 'slam':
        fx.addShake(16);
        fx.flash('#ffffff', 0.25);
        fx.ring(e.x, e.y + 30, 20, 420, 0.7, '#ffb36b', 10);
        fx.ring(e.x, e.y + 30, 10, 260, 0.5, '#fff', 5);
        fx.burst(e.x, e.y + 40, 24, '#a58a70', 260, 'shard', 7, 0.8, 500);
        fx.text(e.x, e.y - 70, '쾅!!', '#ffffff', 34, 0.9, -20);
        fx.text(180, g.rowY - 64, '영웅들 기절!', '#ffd23f', 16, 1.1);
        if (loud) A.sfx.slam();
        break;
      case 'summon':
        fx.ring(e.x, e.y, 10, 90, 0.5, '#ff7fd8', 4);
        if (Math.random() < 0.5) fx.bubble(e.x, e.y - 80, e.enemy === 'boss_gapjil' ? '애들아 모여!' : '얘들아~ 나와!');
        break;
      case 'shield':
        fx.ring(e.x, e.y, 20, e.r, 0.7, e.enemy === 'inpi_treasurer' ? '#ffe07a' : '#7fe7ff', 5);
        if (e.n) fx.text(e.x, e.y - (e.enemy === 'inpi_treasurer' ? 50 : 80), SHIELD_TXT[e.enemy] || '보호막!', e.enemy === 'inpi_treasurer' ? '#ffe9a0' : '#9feaff', 15, 1);
        break;
      case 'weak': fx.text(e.x, e.y, '빈틈! 지금이야!', '#ffe14d', 18, 1.2, -20); fx.ring(e.x, e.y + 60, 10, 70, 0.5, '#ffe14d', 5); break;
      case 'strip': if (!busy) fx.text(e.x, e.y, '버프 벗김!', '#9feaff', 13, 0.8); break;
      case 'eff':
        if (e.strong) {
          fx.text(e.x, e.y - 26, '효과 굉장!', '#ffb02e', 14, 0.8, -34); // 피해 숫자(위로 뜨며 커짐)와 겹치지 않게 한 줄 위에
          fx.burst(e.x, e.y + 20, 8, '#ff9a1a', 190, 'spark', 4, 0.35);
          fx.ring(e.x, e.y + 22, 6, 34, 0.25, '#ffb02e', 3);
        } else if (!busy) {
          fx.text(e.x, e.y - 22, '별로…', '#8a90a0', 11, 0.7, -22);
          fx.burst(e.x, e.y + 20, 3, 'rgba(160,165,180,0.7)', 40, 'puff', 6, 0.35);
        }
        break;
      // ── 새 멤버 연출 ──
      case 'ricochet':
        // 여사친 핀볼: "퐁!" · 하트 반짝 · 다음 진상까지 빛줄기
        fx.burst(e.x, e.y, busy ? 3 : 6, '#ff9fd0', 150, 'heart', 7, 0.5);
        if (!busy) fx.text(e.x, e.y - 14, '퐁!', '#ffd6ee', 15, 0.5, -50);
        if (e.x2 !== undefined) for (let k = 1; k <= 6; k++) fx.part('spark', e.x + (e.x2 - e.x) * k / 7, e.y + (e.y2 - e.y) * k / 7, 0, 0, 0.22, 4, k % 2 ? '#ffffff' : '#ff8fd0');
        if (loud) A.sfx.hit();
        break;
      case 'slam':
        fx.blast(e.x, e.y, e.r, 'gold', 0.45);
        fx.burst(e.x, e.y, 10, 'rgba(210,180,140,0.8)', 120, 'puff', 10, 0.45);
        if (Math.random() < 0.3) fx.text(e.x, e.y - 30, '쿵!', '#ffd08a', 16, 0.6);
        fx.addShake(2.5);
        if (loud) A.sfx.slam();
        break;
      case 'diet': // 배현경: 큰 주사기 푹 → 분홍 약물 고리 · 변신 연기 · 근처 진상에 약물 방울 (skillfx.js)
        fx.text(e.x, e.y - 80, '다이어트 주사!', '#ff7fb8', 17, 1.1, -24);
        SKFX.add('diet', g, e, busy);
        if (loud) { A.sfx.whoosh(); setTimeout(() => A.sfx.levelUp(), 300); }
        break;
      case 'yoyo': fx.text(e.x, e.y - 80, '요요…!', '#ffb347', 16, 1.0, -20); fx.burst(e.x, e.y - 20, 8, 'rgba(255,200,150,0.8)', 80, 'puff', 12, 0.5); break;
      case 'aged': fx.text(e.x, e.y - 80, '폭삭… 아이고 허리야', '#c8c8c8', 14, 1.2, -18); fx.burst(e.x, e.y - 30, 10, 'rgba(200,200,200,0.8)', 60, 'puff', 12, 0.6); break;
      case 'young':
        fx.text(e.x, e.y - 80, '다시 공주!', '#ffc4ec', 17, 1.1, -24);
        for (let k = 0; k < 10; k++) fx.part('star', e.x + (Math.random() - 0.5) * 50, e.y - 40, (Math.random() - 0.5) * 120, -80, 0.8, 9, null, { grav: 120 });
        if (loud) A.sfx.levelUp();
        break;
      case 'bigHammer':
        fx.ring(e.x, e.y, 10, 90, 0.4, '#ffc4ec', 8);
        fx.text(e.x, e.y - 60, '공주의 일격!!', '#ff9fd8', 22, 1.2, -24);
        fx.burst(e.x, e.y, 22, '#ffe14d', 260, 'star', 10, 0.6);
        fx.addShake(10); fx.flash('#ffe6f6', 0.35);
        if (loud) A.sfx.slam();
        break;
      case 'crown': if (Math.random() < 0.35) fx.text(e.x, e.y - 50, '랑방을 위하여!', '#ffd84a', 14, 0.9, -20); if (loud) A.sfx.wave(); break;
      case 'grandBus': { // 이호찬 막차 대행진: 컷인 → 화면 어둡게 → 황금 버스 행렬 → 쾅 (0.3초 느리게) · 금빛 꽃가루 · 경적
        grandCutIn();
        fx.flash('#000', 0.55);
        if (loud) A.sfx.horn();
        setTimeout(() => { fx.addShake(18); fx.slowmo = Math.max(fx.slowmo || 0, 0.3); fx.flash('#fff1a8', 0.5); for (let i = 0; i < 5; i++) fx.burst(40 + i * 70, g.H * (0.3 + Math.random() * 0.3), 16, ['#ffd23f', '#fff1a8', '#ff9f1a'][i % 3], 260, 'dot', 4, 1.1, 260); if (loud) A.sfx.slam(); }, 380);
        fx.banner('LEGEND · 막차 대행진!!', '이호찬: "오늘 막차는 내가 쏜다!"', '#8a6400', 2, 'big');
        break;
      }
      case 'langbang':
        if (!e.grand) fx.banner('LEGEND · 랑방을 위하여!!', '모든 멤버 공격력 UP', '#8a6400', 1.8, 'big');
        fx.addShake(8);
        fx.flash('#fff1a8', 0.4);
        for (const h of g.heroes) fx.ring(h.x, h.y, 6, 44, 0.5, '#ffd84a', 4);
        if (loud) A.sfx.levelUp();
        break;
      case 'bhShout': for (let k = 0; k < 2; k++) setTimeout(() => R.vfx('soundring', e.x, e.y, { anim: 'ring', dur: 480, sz: 56 + e.r * 0.45, tx: e.x + Math.cos(e.a) * e.r * 0.85, ty: e.y + Math.sin(e.a) * e.r * 0.85, rot: e.a + Math.PI / 2, blend: 'lighter', norot: true }), k * 120); if (!busy && Math.random() < 0.3) fx.part('heart', e.x, e.y - 20, (Math.random() - 0.5) * 60, -60, 0.8, 9, null); break;
      case 'sled': { fx.banner('팬클럽 썰매 활강!', '한 줄 통째로 쓸어 버린다', '#2f8ac8', 1.1, 'wave', 'h_baul'); R.vfx('dash', e.x, e.y - 30, { anim: 'line', dur: 520, sz: 120, tx: e.x, ty: 30, rot: -Math.PI / 2, blend: 'lighter' }); for (let k = 0; k < 14; k++) setTimeout(() => fx.part('heart', e.x + (Math.random() - 0.5) * 50, e.y - 60 - k * 30, (Math.random() - 0.5) * 80, -30, 0.8, 10, null), k * 30); fx.addShake(6); if (loud) A.sfx.whoosh(); break; }
      case 'oneman': { fx.flash('#ff7ab8', 0.35); fx.banner('원맨쇼!!', '보스 빼고 모두 춤추며 멈춤 · 모든 멤버 공격력 +30%', '#b0306a', 1.6, 'big', 'h_byunghwa'); const hh = g.heroes.find((o) => o.id === 'byunghwa'); if (hh) { hh._castAt = performance.now(); } for (const en of g.enemies) if (!en.dead && !en.boss) fx.part('note', en.x, en.y - 30, (Math.random() - 0.5) * 30, -40, 1.2, 11, '#ffb0e0'); fx.pillar(e.x, 90, g.rowY + 20, 1.2); fx.addShake(8); if (loud) { A.sfx.ult(); setTimeout(() => A.sfx.win(), 400); } break; }
      case 'cone': // 방장 확성기 공지: 금빛 음파 고리 2~3개가 앞으로 퍼져 나간다
        for (let k = 0; k < (e.big ? 3 : 2); k++) setTimeout(() => R.vfx('soundring', e.x, e.y, { anim: 'ring', dur: 520, sz: 60 + e.r * 0.5, tx: e.x + Math.cos(e.a) * e.r * 0.9, ty: e.y + Math.sin(e.a) * e.r * 0.9, rot: e.a + Math.PI / 2, blend: 'lighter', norot: true }), k * 110);
        if (e.big) fx.text(e.x, e.y - 40, '전체공지!', '#ffb347', 16, 0.8);
        break;
      case 'skill': { if (live && !e.echo) { app.hitStop = Math.max(app.hitStop || 0, 0.04); fx.addShake(e.target || MOMENTUM.strong.includes(e.hero) ? 6 : 3); } const hh = g.heroes.find((o) => o.id === e.hero); if (hh) { hh._castAt = performance.now(); R.vfx('sk_' + e.hero, 0, 0, { follow: hh, dy: -96, anim: 'pop', dur: 520, sz: 54, blend: 'source-over' }); } }
        if (e.target) { fx.ring(e.x, e.y, 10, e.r, 0.5, HD(e.hero).color, 6); fx.ring(e.x, e.y, 6, e.r * 0.6, 0.4, '#fff', 3); fx.addShake(5); }
        if (e.skill === 'rally') { fx.flash('#ffe08a', 0.3); fx.banner('집합!!', '8초 동안 모두 공격 속도 +50% · 공격력 +20%', '#b86b00', 1.2, 'big'); R.vfx('banner', g.W / 2, g.ropeY + 6, { anim: 'pulse', dur: (g.rallyT || 8) * 1000, sz: 90, blend: 'source-over', layer: 'ground' }); fx.ring(g.W / 2, g.ropeY, 20, 460, 0.8, '#ffd23f', 8); R.rallyFlashAt = performance.now(); if (loud) { A.sfx.horn(); setTimeout(() => A.sfx.slam(), 180); } }
        if (e.skill === 'curse') fx.text(e.x, e.y - 30, '#@!%&!!', '#ff7a2e', 24, 1, -20);
        if (e.skill === 'winkbomb') for (let k = 0; k < 10; k++) fx.part('heart', e.x, e.y, (Math.random() - 0.5) * 260, -60 - Math.random() * 160, 0.9, 10, null, { grav: 200 });
        if (e.skill === 'redcard') { // 운영진: 거대한 레드카드가 바닥에 쾅 · 파편 · 빨간 도장
          fx.text(e.x, e.y - e.r - 20, '레드카드!', '#ff4b3a', 22, 1.1, -20);
          R.vfx('w_card_r', e.x, e.y - 200, { anim: 'line', dur: 260, sz: 120, tx: e.x, ty: e.y - 10, blend: 'source-over' });
          setTimeout(() => { R.vfx('crack', e.x, e.y + 10, { anim: 'fade', dur: 1200, sz: e.r * 2, flat: true }); R.vfx('w_card_r', e.x, e.y - 10, { anim: 'fade', dur: 900, sz: 120, blend: 'source-over' }); fx.burst(e.x, e.y, 22, '#ff4b3a', 300, 'shard', 5, 0.6, 300); fx.addShake(9); if (loud) A.sfx.slam(); }, 260);
        }
        if (e.skill === 'frenzy') { // 건전남 난사: 부채꼴로 12발 폭풍 + 총구 불빛 고리
          const hh = g.heroes.find((o) => o.id === 'gunman'); fx.banner('난사!!', '3초 동안 폭풍 연사', '#2f6d2f', 0.9, 'wave');
          if (hh) for (let k = 0; k < 12; k++) setTimeout(() => { fx.ring(hh.x, hh.y - 50, 4, 26, 0.18, '#fff3b0', 3); if (k % 3 === 0) R.vfx('hitspark', hh.x, hh.y - 52, { anim: 'pop', dur: 160, sz: 40 }); }, k * 240);
        }
        if (e.skill === 'blinddate') { fx.banner('소개팅 주선!', '여사친 3명 출동', '#c0407a', 0.9, 'wave'); for (let k = 0; k < 16; k++) fx.part('heart', e.x + (Math.random() - 0.5) * 60, e.y - 60, (Math.random() - 0.5) * 240, -80 - Math.random() * 140, 1, 11, null, { grav: 160 }); fx.ring(e.x, e.y - 50, 10, 120, 0.5, '#ff8ac8', 5); }
        if (e.skill === 'goodman') { for (const o of g.heroes) fx.ring(o.x, o.y - 30, 8, 50, 0.5, '#ffd23f', 3); if (loud) A.sfx.coin(); } // 금빛 띠 · 금화 비는 skillfx.js
        if (e.skill === 'bandage') fx.banner('붕대 대공사!', '입구 크게 수리 · 잠깐 피해 -35%', '#2f8a4a', 1, 'wave'); // 붕대 감기 · 초록 물결 · 큰 수리 숫자는 skillfx.js
        break;
      case 'cleanse': fx.text(e.x, e.y - 90, '응급처치! 상태이상 해제', '#9dffb0', 15, 1.1); break;
      case 'wave':
        // 김도훈 마이크 음파: 겹겹이 퍼지는 굵은 고리 + 음표
        fx.ring(e.x, e.y, 10, e.r, 0.5, 'rgba(111,240,255,0.95)', 5);
        fx.ring(e.x, e.y, 6, e.r * 0.72, 0.42, 'rgba(255,111,216,0.95)', 4);
        fx.ring(e.x, e.y, 4, e.r * 0.45, 0.34, 'rgba(255,255,255,0.9)', 3);
        for (let k = 0; k < (busy ? 2 : 5); k++) { const a = Math.random() * TAU_; fx.part('note', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 14, Math.cos(a) * 60, -50 - Math.random() * 40, 1.0, 11, k % 2 ? '#6ff0ff' : '#ff9fe6'); }
        fx.ring(e.x, e.y + 30, 4, 26, 0.25, 'rgba(111,240,255,0.9)', 3); // 마이크 번쩍
        break;
      case 'encore':
        fx.banner('무한 앵콜~!', '입구 회복 · 5초 동안 전원 공속 +25% · 피해 +15%', '#7a3cc8', 1.4, 'wave'); fx.flash('#c77dff', 0.25);
        fx.pillar(e.x, 120, g.rowY + 30, 1.2); // 무대 조명
        for (const [c, k] of [['#ff4f7a', 0], ['#ffd23f', 0.12], ['#5de07a', 0.24], ['#6ff0ff', 0.36], ['#c77dff', 0.48]]) setTimeout(() => fx.ring(e.x, e.y - 60, 20, e.r * (0.7 + k), 0.9, c, 7), k * 400);
        for (let k = 0; k < 18; k++) fx.part('note', e.x + (Math.random() - 0.5) * 300, e.y - 260 - Math.random() * 120, (Math.random() - 0.5) * 40, 90 + Math.random() * 60, 2.2, 13, k % 3 ? '#ffe14d' : '#ff9fe6');
        fx.ring(e.x, e.y - 60, 20, e.r, 0.8, '#c9a8ff', 8);
        fx.banner('무한 앵콜!!', '다 같이 떼창~ 진상들 춤추느라 멈춤', '#5a2aa0', 1.6, 'big');
        for (let k = 0; k < 14; k++) fx.part('star', e.x + (Math.random() - 0.5) * 300, e.y - 100 - Math.random() * 200, 0, -30, 1, 9, null);
        if (loud) A.sfx.win();
        break;
      case 'moto': fx.text(e.x, e.y - 80, e.n > 1 ? '3대 500!!' : '부릉부릉!', '#ff8a4f', e.n > 1 ? 22 : 15, 1, -24); fx.addShake(e.n > 1 ? 8 : 4); if (loud) A.sfx.slam(); break;
      case 'dash': if (e.hero !== 'ara') SKFX.add('ydash', g, e, busy); else fx.part('star', e.x, e.y - 30, 0, -60, 0.4, 10, null); break; // 김영준: 박차고 나가는 흙먼지 · 잔상 줄 (skillfx.js)
      case 'slash': // 김영준 다섯 번째 베기마다: 발톱 자국 + 아주 짧은 멈칫(타격감)
        R.vfx('w_claw', e.x, e.y, { anim: 'pop', dur: 260, sz: 62, rot: (Math.random() - 0.5) * 1.2, blend: 'source-over' });
        if (live && !busy) app.hitStop = Math.max(app.hitStop || 0, 0.035);
        fx.addShake(3);
        if (!busy) { fx.burst(e.x, e.y, 5, '#c8b0ff', 170, 'spark', 3, 0.25); if (Math.random() < 0.3) fx.text(e.x, e.y - 10, '샤샥!', '#e0d0ff', 12, 0.5); } break;
      case 'crossfit': fx.text(e.x, e.y - 76, '크로스핏!', '#c8b0ff', 13, 1); break;
      case 'rush': {
        let px = e.x, py = e.y;
        for (const [x, y] of e.pts) { for (let k = 1; k <= 4; k++) fx.part('spark', px + (x - px) * k / 5, py + (y - py) * k / 5, 0, 0, 0.35, 4, '#b08aff'); fx.ring(x, y, 4, 34, 0.3, '#b08aff', 3); px = x; py = y; }
        fx.banner('블랙 러시!!', `${e.pts.length}명 연속 돌파`, '#3a1a8a', 1.3, 'big', 'h_youngjun_rage');
        fx.addShake(8);
        if (loud) A.sfx.crit();
        break;
      }
      case 'lazyUp': { const sk = SKFX.active('serious'); if (!sk) { fx.flash('#000000', 0.3); fx.text(e.x, e.y - 96, '진심 모드!', '#ffe07a', 19, 1.1, -14); } const hh = g.heroes.find((o) => o.id === 'donghan'); if (hh) R.vfx('sk_donghan', 0, 0, { follow: hh, dy: -120, anim: 'pop', dur: 900, sz: 48, blend: 'source-over' }); for (let k = 0; k < 10; k++) fx.part('dot', e.x + (Math.random() - 0.5) * 40, e.y - 20, (Math.random() - 0.5) * 30, -60 - Math.random() * 60, 1, 5, k % 2 ? '#ffe07a' : '#fff4c8'); if (loud) { A.sfx.whoosh(); setTimeout(() => A.sfx.gem(), 380); } break; }
      case 'burst':
        fx.pillar(e.x, e.w, g.rowY - 20, 0.7);
        fx.flash('#e8fff4', 0.35); fx.addShake(12);
        fx.text(e.hx, e.hy - 80, e.big ? '진심이다…!' : '귀찮아…', '#c8ffe0', 14, 1.2, -16);
        if (loud) A.sfx.ult();
        break;
      case 'swap': fx.ring(e.x, e.y, 6, 50, 0.35, '#6ff0ff', 4); break;
      case 'blackout': fx.text(180, g.H * 0.3, '정전!', '#ffe9a0', 22, 1.2, -10); fx.flash('#000000', 0.6); break;
      case 'lightsOn': fx.flash('#fff8d0', 0.25); break;
      case 'megaphone': fx.text(180, g.H * 0.26, '인피 확성기! 진상 가속', '#ff8a8a', 17, 1.2, -10); break;
      case 'puke':
        if (e.cry) { fx.text(e.x, e.y, '엉엉…', '#9fd8ff', 13, 0.9, -20); break; } fx.text(e.x, e.y, '우웩!', '#b8e04a', 16, 0.9); fx.burst(e.hx, g.rowY + 18, 10, '#9acd32', 120, 'dot', 5, 0.5, 200); break;
      case 'cuddle': fx.text(e.x, e.y, '꽁냥꽁냥♡', '#ffb0d0', 12, 0.8); fx.part('heart', e.x, e.y, 0, -40, 0.8, 9, null); break;
      case 'breakup': fx.text(e.x, e.y, '헤어져!!', '#ff7fa8', 18, 1.1, -20); fx.burst(e.x, e.y + 20, 12, '#ff9ecb', 160, 'shard', 5, 0.6, 300); break;
      case 'grab': { fx.text(e.hx, e.hy - 70, '붙잡힘!', '#ffc08a', 15, 1); R.vfx('slap', e.hx, e.hy - 30, { anim: 'pop', dur: 380, sz: 70 }); const hh = g.heroes.find((x) => Math.abs(x.x - e.hx) < 2 && Math.abs(x.y - e.hy) < 2); if (hh) hh._hitAt = performance.now(); if (loud) A.sfx.charm(); break; }
      case 'release': fx.text(e.x, e.y - 70, '풀려났다!', '#9dffb0', 13, 0.9); break;
      case 'gaoBreak': fx.text(e.x, e.y, '가오 깨짐!', '#ffe14d', 18, 1.1, -24); fx.burst(e.x, e.y + 20, 14, '#ffd23f', 180, 'shard', 5, 0.6, 300); if (loud) A.sfx.crit(); break;
      case 'flash': fx.flash('#ffffff', 0.25); fx.text(e.x, e.y, '찰칵!', '#fff', 15, 0.8); if (e.stun) { fx.text(e.hx, e.hy - 70, '플래시에 눈부셔 기절!', '#ffe9a0', 13, 0.9); R.vfx('stun', 0, 0, { follow: g.heroes.find((h) => Math.abs(h.x - e.hx) < 2) || null, dy: -78, anim: 'pulse', dur: Math.round((e.sec || 1) * 1000), sz: 50 }); } break;
      case 'flashWind': R.vfx('warn', e.x, e.y + 10, { anim: 'grow', dur: 600, sz: 70, flat: true }); fx.text(e.x, e.y - 10, '찰칵 준비…', '#fff4b0', 11, 0.6); break;
      case 'bottleThrow': R.vfx('w_bottle', e.x, e.y, { anim: 'fly', dur: 420, sz: 30, tx: e.hx, ty: e.hy, blend: 'source-over' }); setTimeout(() => fx.text(e.hx, e.hy - 30, '공속 ↓', '#ffb08a', 11, 0.8), 420); break;
      case 'drunkBoom': R.vfx('shock', e.x, e.y + 10, { anim: 'pop', dur: 500, sz: 150 }); fx.addShake(5); fx.text(e.x, e.y - 30, '술병 폭발! 기절', '#ff9a6a', 13, 1); break;
      case 'spamBomb': R.vfx('shock2', e.x, e.y, { anim: 'pop', dur: 450, sz: 220 }); fx.text(e.x, e.y - 20, '알림 폭탄! 공속 -30%', '#9ff4ff', 12, 1); break;
      case 'latteSilence': R.vfx('silence', e.hx, e.hy, { anim: 'pulse', dur: 3000, sz: 44 }); fx.text(e.hx, e.hy - 20, '라떼 훈계… 스킬 막힘', '#d8c8ff', 11, 1.2); break;
      // ── 7장 스키장 ──
      case 'c7freeze': { const hh = g.heroes.find((h) => h.id === e.hero); if (e.block) { if (!busy) fx.text(e.x, e.y - 70, '빙결 막음!', '#9dffb0', 12, 0.8); break; } fx.text(e.x, e.y - 72, e.kind === 'avalanche' ? '꽁꽁!' : '눈덩이에 꽁꽁!', '#bff4ff', 14, 1); fx.burst(e.x, e.y - 30, 10, '#e8fbff', 140, 'dot', 4, 0.5); if (hh) { hh._hitAt = performance.now(); R.vfx('stun', 0, 0, { follow: hh, dy: -78, anim: 'pulse', dur: Math.round((e.sec || 1) * 1000), sz: 50 }); } break; }
      case 'c7snow': if (!busy) fx.text(e.x, e.y - 10, '받아라!', '#e8fbff', 11, 0.6); break;
      case 'c7board': if (!busy) fx.text(e.x, e.y, '휙~ 줄 바꾸기!', '#9fe0ff', 11, 0.7); break;
      case 'c7crash': fx.text(e.x, e.y - 24, '썰매 쾅!', '#ff9fd8', 14, 0.9); fx.burst(e.x, e.y, 12, '#ffffff', 170, 'dot', 4, 0.5, 260); fx.addShake(3); break;
      case 'c7sledOff': if (!busy) fx.text(e.x, e.y, '썰매에서 꽈당!', '#ffd1ec', 12, 0.8); break;
      case 'c7cold': if (!busy) fx.text(e.x, e.y, '핫팩 슬쩍~ 손이 꽁꽁 공속↓', '#ffc08a', 11, 0.9); break;
      case 'c7coach': fx.ring(e.x, e.y + 40, 20, e.r, 0.7, '#ff8a8a', 4); if (e.n) fx.text(e.x, e.y - 20, '제가 알려 드릴게요~ 보호막!', '#ffd0d0', 13, 1); break;
      case 'c7quietWind': fx.text(e.x, e.y - 20, e.text || '소음 금지!', '#ffe08a', 14, 1.3, -10); R.vfx('silence', e.x, e.y - 40, { anim: 'pulse', dur: 1300, sz: 90 }); R.vfx('warn', 180, g.rowY + 10, { anim: 'grow', dur: 1300, sz: 300, flat: true }); if (loud) A.sfx.charm && A.sfx.charm(); break;
      case 'c7quiet': fx.ring(e.x, g.rowY, 20, e.r, 0.7, '#b48cff', 6); for (const h of g.heroes) if (h.muteT > 0) R.vfx('silence', 0, 0, { follow: h, dy: -86, anim: 'pulse', dur: 2800, sz: 46 }); if (e.n) toast('소음 금지! 스킬 침묵 — 응급 방패 · 알디콤으로 풀어요', 1800); break;
      case 'c7quietStop': fx.text(e.x, e.y - 10, '…조용해졌다', '#c8ffd0', 13, 1); break;
      case 'c7muted': fx.text(e.x, e.y - 80, '침묵 중!', '#c8b8ff', 13, 0.8); break;
      case 'c7avaWarn': fx.banner('눈사태 경고!!', `${Math.round(e.sec * 10) / 10}초 뒤 전원 빙결 — 지금 스킬로 끊어요!`, '#1a5a9a', Math.min(2.6, e.sec), 'big', 'e_boss_resort'); fx.flash('#cfefff', 0.25); R.vfx('warn', 180, g.rowY - 40, { anim: 'grow', dur: Math.round(e.sec * 1000), sz: 420, flat: true }); R.vfx('crack', e.x, e.y + 40, { anim: 'grow', dur: Math.round(e.sec * 1000), sz: 220, flat: true }); fx.addShake(4); if (loud) A.sfx.horn && A.sfx.horn(); break;
      case 'c7ava': fx.flash('#ffffff', 0.55); fx.banner('눈사태!!', '멤버 전원 꽁꽁 · 입구가 눈에 묻혔다', '#2a4a7a', 1.6, 'wave'); for (let k = 0; k < 40; k++) fx.part('dot', Math.random() * g.W, Math.random() * g.rowY, (Math.random() - 0.5) * 60, 220 + Math.random() * 200, 1.2, 4 + Math.random() * 5, '#f2fbff'); fx.addShake(12); if (loud) A.sfx.explode(); break;
      case 'c7avaStop': fx.banner('눈사태 저지!', '회장이 비틀 — 빈틈! 지금 몰아쳐요', '#1a7a4a', 1.6, 'wave'); fx.ring(e.x, e.y, 20, 180, 0.6, '#9dffb0', 6); fx.addShake(5); if (loud) A.sfx.crit(); break;
      case 'consUse': {
        const c = L.CONS[e.id];
        if (e.id === 'battery') { fx.banner('보조배터리!', `방어진 ${e.v ? '+' + fmt(e.v) : ''} 가득 충전`, '#7b3fe0', 1.3, 'wave'); fx.repairT = 1.6; for (let k = 0; k < 14; k++) fx.part('star', 30 + Math.random() * 300, g.rowY + 40 + Math.random() * 60, 0, -70, 0.9, 8, null); fx.flash('#b890ff', 0.18); if (loud) A.sfx.heal(); }
        else if (e.id === 'aldicom') { fx.banner('알디콤!', `상태이상 싹 · 5초 면역${e.n ? ` · 버프 ${e.n}개 깨짐` : ''}`, '#2f7fd8', 1.2, 'wave'); for (let k = 0; k < 26; k++) fx.part('dot', 20 + Math.random() * 320, g.ropeY + Math.random() * 40, (Math.random() - 0.5) * 40, -60 - Math.random() * 80, 1.1, 4 + Math.random() * 4, Math.random() < 0.5 ? '#bfe8ff' : '#e8fbff'); fx.ring(g.W / 2, g.ropeY, 20, 260, 0.6, '#9fd8ff', 4); if (loud) A.sfx.heal(); }
        else if (e.id === 'taxi') { fx.banner('막차 택시!', '진상들 두 칸 뒤로 · 3초 느리게', '#c08a10', 1.1, 'wave'); R.vfx('bus', -60, e.y, { anim: 'line', dur: 700, sz: 150, tx: g.W + 60, ty: e.y, blend: 'source-over' }); fx.addShake(8); if (loud) A.sfx.horn(); }
        else if (e.id === 'icewater') { fx.banner('얼음물 한 잔!', '보스 빼고 3초 꽁꽁', '#2f7fd8', 1.1, 'wave'); fx.flash('#cfefff', 0.35); R.vfx('crack', g.W / 2, g.H * 0.4, { anim: 'fade', dur: 1500, sz: 420, flat: true }); for (let k = 0; k < 24; k++) fx.part('dot', Math.random() * g.W, Math.random() * g.ropeY, 0, 20, 1.2, 4, '#e8fbff'); if (loud) A.sfx.crit(); }
        else if (e.id === 'uiriju') { fx.banner('의리!!', '12초 동안 공격력 +60% · 공속 +20%', '#b08a10', 1.5, 'big'); fx.flash('#ffd23f', 0.4); for (const o of g.heroes) { fx.ring(o.x, o.y - 30, 8, 60, 0.7, '#ffd23f', 4); R.vfx('aura_red', 0, 0, { follow: o, anim: 'pulse', dur: 12000, sz: 90, flat: true }); } if (loud) { A.sfx.coin(); setTimeout(() => A.sfx.win(), 200); } }
        else if (e.id === 'reroll') { /* 카드 화면에서 연출 */ }
        else if (c && c.banner) { fx.banner(`${c.name}!`, c.banner, '#c08a10', 1.1, 'wave'); fx.flash('#ffe6a0', 0.2); if (loud) A.sfx.levelUp(); } // 새 소모품 (폭탄주 · 에너지 드링크 · 경호원 호출)
        else if (e.id === 'tambourine') { fx.banner('노래방 탬버린!', '8초 동안 공격 속도 +40%', '#c08a10', 1.1, 'wave'); for (const h of g.heroes) fx.ring(h.x, h.y - 30, 8, 60, 0.5, '#ffd23f', 3); if (loud) A.sfx.levelUp(); }
        void c; break;
      }
      case 'tauntMark': fx.text(e.x, e.y, '!', '#ff8ab8', 18, 0.7, -30); break;
      case 'consultSit': fx.text(e.x, e.y - 90, '결정사 상담 시작!', '#ffb0d0', 15, 1.1); for (let k = 0; k < 8; k++) fx.part('heart', e.x + (Math.random() - 0.5) * 60, e.y - 40, (Math.random() - 0.5) * 60, -60, 0.9, 9, null); break;
      case 'consultEnd': fx.text(e.x, e.y - 90, e.broke ? '상담 끝… 너무 맞았다' : '상담 끝! 돌아갈게요', '#ffd0e0', 13, 1); break;
      case 'dodge': fx.text(e.x + (Math.random() - 0.5) * 16, e.y, 'MISS', '#b8b8c8', 12, 0.6, -30); break;
      case 'condCcWarn': fx.text(e.x, e.y - 18, '!!', '#ff4b4b', 22, 1.0, -10); R.vfx('warn', e.x, e.y + 34, { anim: 'grow', dur: 1000, sz: 90, flat: true }); break; // 스테이지 조건: 기절 예고 (기 모으는 중 — 기절시키면 끊긴다)
      case 'condCcStop': fx.text(e.x, e.y - 10, '끊었다!', '#7dff9a', 14, 0.9); break;
      case 'gunnyeoReact': fx.text(e.x, e.y - 70, '응급처치!', '#7dff9a', 13, 0.9); break;
      case 'condCc': {
        const h = HD(e.hero), nm = { stun: '기절', charm: '홀림', silence: '침묵' }[e.kind] || '';
        for (let k = 0; k < 5; k++) { const q = k / 5; fx.part('dot', e.ex + (e.x - e.ex) * q, e.ey + (e.y - 40 - e.ey) * q, 0, -10, 0.5 + q * 0.4, 5, e.kind === 'charm' ? '#ff8ad8' : e.kind === 'silence' ? '#b9a8ff' : '#ffd23f'); }
        if (e.block) { fx.text(e.x, e.y - 62, '막음!', '#8fd8ff', 14, 0.9); break; }
        fx.text(e.x, e.y - 62, `${h.name} ${nm}!`, e.kind === 'charm' ? '#ff8ad8' : e.kind === 'silence' ? '#c9b8ff' : '#ffd23f', 14, 1.1);
        const fh = g.heroes.find((x) => x.id === e.hero);
        if (fh && e.kind === 'stun') R.vfx('stun', 0, 0, { follow: fh, dy: -78, anim: 'pulse', dur: Math.round(e.sec * 1000), sz: 52 });
        else if (fh && e.kind === 'silence') R.vfx('silence', 0, 0, { follow: fh, dy: -86, anim: 'pulse', dur: Math.round(e.sec * 1000), sz: 44 });
        if (loud && A.sfx.charm) A.sfx.charm();
        break;
      }
      case 'ccBlock': fx.text(e.x, e.y, '막음!', '#8fd8ff', 13, 0.8); R.vfx('hitspark', e.x, e.y + 20, { anim: 'pop', dur: 280, sz: 50 }); break;
      case 'shieldBreak': R.vfx('hitspark', e.x, e.y, { anim: 'pop', dur: 380, sz: 90 }); fx.burst(e.x, e.y, 12, '#cfe9ff', 220, 'dot', 3, 0.5); fx.text(e.x, e.y - 20, '보호막 깨짐!', '#ff6a6a', 13, 0.9); break;
      case 'doorShield': fx.text(e.x, e.y - 40, `방패 +${e.v}`, '#bfe6ff', 16, 1.2); R.vfx('aura_blue', e.x, e.y, { anim: 'pulse', dur: 8000, sz: 320, flat: true }); break;
      case 'doorShieldBreak': fx.text(e.x, e.y - 40, '방패 깨짐', '#bfe6ff', 13, 0.9); fx.burst(e.x, e.y, 16, '#cfe9ff', 260, 'dot', 3, 0.6); break;
      case 'buffAura': for (const h of g.heroes) R.vfx('aura_red', 0, 0, { follow: h, dy: 0, anim: 'pulse', dur: (e.sec || 6) * 1000, sz: 90, flat: true }); fx.text(180, g.rowY - 70, '집합! 공속 +50% · 공격력 +20%', '#ffd23f', 14, 1.3); break;
      case 'hammer': R.vfx('crack', e.x, e.y + 22, { anim: 'fade', dur: 600, sz: 80, flat: true }); fx.addShake(3); break;
      case 'crack': R.vfx('crack', e.x, e.y, { anim: 'fade', dur: 1400, sz: 190, flat: true }); fx.addShake(10); break;
      case 'tip': { const k = 'tip:' + e.text.slice(0, 14); if (live && !tutDone(k)) { setTut(k); showTip(e.text, 4800); } break; } // 처음 한 번만 (기기에 기억)
      case 'vault': fx.text(e.x, e.y, '새치기!', '#8fe3ff', 15, 0.8); break;
      case 'spam': if (e.n > 1) fx.text(e.x, e.y, '카톡카톡카톡!', '#ff6b7a', 15, 0.9); else if (Math.random() < 0.5) fx.text(e.x, e.y, '카톡!', '#ff6b7a', 13, 0.7); break;
      case 'interest':
        if (e.v > 0) {
          fx.text(e.x, e.y - 90, `이자 붙었다! ${e.pct}%`, '#ffd23f', 18, 1.2, -20);
          fx.text(180, g.ropeY + 8, `-${e.v} 이자`, '#ffcf3f', 15, 1.1, -24);
          for (let k = 0; k < 6; k++) fx.part('coin', 60 + Math.random() * 240, g.ropeY + 20, (e.x - 180) * 0.6 + (Math.random() - 0.5) * 60, -220 - Math.random() * 80, 1, 11, null, { grav: 120 });
          if (loud) A.sfx.steal();
        }
        break;
      case 'debtFree':
        fx.banner('빚 탕감!', e.v ? `떼어 간 이자 +${e.v} 돌려받음` : '이제 이자는 없다!', '#1a8a4a', 1.8, 'big');
        if (e.v) fx.text(180, g.rowY - 40, `+${e.v} 수리`, '#7dff9a', 18, 1.3);
        break;
      case 'paperHit': fx.text(e.x, e.y - 62, '차용증… 공속↓', '#ffe9b0', 13, 1.0); break;
      case 'unionPhase': {
        const P = UNION_PHASE[e.phase] || ['연합의 힘!', ''];
        fx.banner(P[0], P[1], '#6a1bb0', 1.6, 'boss', 'e_boss_union');
        fx.ring(e.x, e.y, 10, 180, 0.6, '#c77dff', 6);
        fx.addShake(5);
        if (loud) A.sfx.boss();
        break;
      }
      case 'bossKill':
        if (live && g.bossAlive <= 0) A.setBoss(false);
        fx.slowmo = 1.5;
        fx.zoomTarget = 1.28;
        fx.zx = e.x; fx.zy = e.y;
        fx.flash('#ffffff', 0.7);
        fx.addShake(14);
        fx.ring(e.x, e.y, 10, 300, 1, '#ffd23f', 10);
        fx.burst(e.x, e.y, 60, null, 420, 'confetti', 8, 1.6, 260);
        for (const p of fx.parts.items) if (p.type === 'confetti' && !p.color) p.color = CONFETTI[(Math.random() * CONFETTI.length) | 0];
        fx.banner('보스 격파!!', `${e.name} 퇴장 — 랑방 평화 수호`, '#c77a00', 2.1, 'big', 'e_' + e.enemy);
        if (loud) A.sfx.bossKill();
        break;
      case 'waveClear':
        if (live) A.setBoss(false);
        if (!e.last) fx.text(180, g.H * 0.36, `WAVE ${e.wave} 클리어!`, '#7dff9a', 24, 1.5, -12);
        if (loud) A.sfx.clear();
        break;
      case 'victory':
        fx.flash('#fff3b0', 0.8);
        for (let k = 0; k < 4; k++) setTimeout(() => {
          fx.burst(60 + Math.random() * 240, g.H * 0.3, 40, null, 380, 'confetti', 8, 2, 240);
          for (const p of fx.parts.items) if (p.type === 'confetti' && !p.color) p.color = CONFETTI[(Math.random() * CONFETTI.length) | 0];
        }, k * 350);
        if (g.tower) TWUI.onVictory(g);
        else if (g.weekly) fx.banner('주간 도전 완주!!', `${g.totalWaves}웨이브 전부 막아냈다`, '#c77a00', 2.6, 'big');
        else if (g.mode === 'stage' && !g.baseHit) {
          fx.banner('PERFECT!!', '입구가 한 번도 안 맞았다!', '#1a6aa0', 2.6, 'big');
          fx.flash('#bff4ff', 0.9);
          for (let k = 0; k < 20; k++) fx.part('star', 40 + Math.random() * 280, g.H * 0.2 + Math.random() * 200, (Math.random() - 0.5) * 80, -60, 1.4, 12, null, { grav: 60 });
        } else if (g.mode === 'stage') fx.banner(`${stageLabel(g.stage)} 클리어!!`, starStr(e.stars), '#c77a00', 2.4, 'big');
        else fx.banner('랑방 수호 성공!!', '20웨이브 전부 막아냈다', '#c77a00', 2.6, 'big');
        if (loud) A.sfx.win();
        if (live) endRun(true);
        break;
      case 'raidEnd': // 레이드 시간 끝 → 결과 (예전엔 이 이벤트를 안 받아서 판이 멈춰 있었다)
        fx.banner('레이드 종료!', `보스에게 ${fmt(e.dmg || 0)} 피해`, '#5a2aa0', 2.2, 'big');
        if (loud) A.sfx.win();
        if (live) endRun(true);
        break;
      case 'gameover':
        if (live) A.setBoss(false);
        if (live && g.pvp && PVP.sock) PVP.sock.emit('dead');
        fx.slowmo = 1.4;
        fx.zoomTarget = 1.12;
        fx.zx = 180; fx.zy = g.ropeY;
        fx.flash('#ff2040', 0.6);
        fx.addShake(16);
        if (g.tower) TWUI.onFail(g); else fx.banner('랑방 함락…', '진상들이 들이닥쳤다', '#7a0a1a', 2.2, 'big');
        if (loud) { A.sfx.lose(); A.pauseBgm(); }
        if (live) endRun(false);
        break;
      case 'rage':
        fx.banner('최은옥 분노 모드!!', '"다 덤벼!!!"', '#c01010', 1.8, 'rage', 'h_eunok_rage');
        fx.addShake(8);
        fx.ring(e.x, e.y, 10, 160, 0.6, '#ff3b30', 8);
        for (let k = 0; k < 16; k++) fx.part('flame', e.x + (Math.random() - 0.5) * 40, e.y + 10, (Math.random() - 0.5) * 60, -80 - Math.random() * 80, 0.8, 14, null);
        if (loud) A.sfx.rage();
        break;
      case 'sober': fx.text(e.x, e.y - 60, '술 깼다… 한 잔 더?', '#ffd6a8', 12, 1.3); break;
      case 'heal':
        fx.repairT = 1.2; // 방어선 수리 연출
        if (e.v > 0) fx.text(e.x, e.y - 60, `+${e.v} 수리`, '#7dff9a', 14, 1);
        for (let k = 0; k < 6; k++) fx.part('star', 40 + Math.random() * 280, g.rowY + 60 + Math.random() * 40, 0, -40, 0.8, 7, null);
        if (loud) A.sfx.heal();
        break;
      case 'join': {
        const h = HD(e.hero);
        if (g.joinMode && live && !e.hidden && !SUMMONS[e.hero]) { const W = WEAPON[e.hero]; /* 소환된 성준영은 스킬 배너가 대신 알려 준다 */ fx.banner(`${h.name} 합류!`, W ? `${W.item} — ${KIND_TXT[W.kind] || ''}` : h.role || '', ATTRS[h.attr].color, 1.1, 'wave', 'h_' + e.hero); }
        fx.ring(e.x, e.y, 10, 90, 0.6, h.color, 5);
        fx.burst(e.x, e.y, 18, h.color, 200, 'dot', 4, 0.6);
        for (let k = 0; k < 6; k++) fx.part('star', e.x, e.y, (Math.random() - 0.5) * 200, -100 - Math.random() * 120, 0.9, 9, null, { grav: 300 });
        if (e.hidden && live && g.t > 1) {
          fx.banner(`HIDDEN · ${h.name} 합류!`, h.role.replace('HIDDEN · ', ''), '#a0158a', 2, 'hidden', 'h_' + e.hero);
          fx.flash('#ff9ff0', 0.4);
        }
        if (loud) A.sfx.join();
        break;
      }
      case 'bus': for (const k of [0, 1]) fx.ring(e.x, e.y - 10, 10 + k * 16, 90 + k * 40, 0.45 + k * 0.15, '#ffd84a', 4 - k); fx.banner(e.big ? '2층 막차 버스!' : '막차 버스!', '이호찬: "다들 타! 집에 가자!"', '#8a6a00', 0.9, 'wave'); fx.addShake(e.big ? 8 : 5); break;
      case 'slash': R.addSlash(e.x, e.y); break;
      case 'skillCast': { const h = g.heroes.find((x) => x.id === e.hero); if (h) skillFx(h); if (e.hero === 'donghan') { SKFX.add('serious', g, e, busy); if (loud) A.sfx.rise(); } break; } // 문동한 진심 모드: 어둡게 → 금빛 기운 → 일어서는 순간 쾅 (skillfx.js)
      case 'noMomentum': if (live) toast(e.ult ? '총공지는 기세 2칸이 필요해요' : '기세가 모자라요 — 조금 기다려요', 900); break;
      case 'skillQueued': break;
      case 'weaponEvo': fx.text(e.x, e.y - 96, '무기 진화!', '#ffd23f', 16, 1.3, -30); fx.ring(e.x, e.y - 30, 12, 60, 0.6, '#ffd23f', 4); break;
      case 'reload': if (Math.random() < 0.12 && WEAPON[e.hero]) fx.text(e.x, e.y - 70, WEAPON[e.hero].reload, '#e8e0ff', 10, 0.8, -16); break;
      case 'heroLv':
        fx.ring(e.x, e.y, 8, 60, 0.5, '#ffd23f', 4);
        for (let k = 0; k < 5; k++) fx.part('star', e.x, e.y - 20, (Math.random() - 0.5) * 160, -120 - Math.random() * 80, 0.8, 8, null, { grav: 300 });
        fx.text(e.x, e.y - 64, e.lv >= 5 ? 'MAX!' : `Lv.${e.lv}`, '#ffd23f', 16, 1);
        break;
      case 'ult':
        fx.flash('#fff6c8', 0.8);
        fx.addShake(12);
        fx.ring(180, g.rowY, 10, 700, 0.9, '#ffd23f', 14);
        fx.ring(180, g.rowY, 10, 500, 0.7, '#fff', 6);
        fx.banner('총공지!!', '"전원 퇴장입니다"', '#b86b00', 1.3, 'big');
        if (loud) A.sfx.ult();
        break;
      case 'charm': {
        const h = HD(e.hero);
        fx.text(e.x, e.y - 58, `${h.name} 홀림!`, '#ff8ad8', 14, 1.1);
        for (let k = 0; k < 6; k++) {
          const p = k / 6;
          fx.part('heart', e.ex + (e.x - e.ex) * p, e.ey + (e.y - 30 - e.ey) * p, 0, -20, 0.6 + p * 0.5, 8, null);
        }
        if (loud) A.sfx.charm();
        break;
      }
      case 'charmBlock': fx.text(e.x, e.y - 58, '철벽!', '#9feaff', 15, 0.9); break;
      case 'wink':
        if (e.male) {
          if (Math.random() < 0.4) fx.text(e.x, e.y, '두근!', '#ff7fd8', 14, 0.7);
          for (let k = 0; k < 3; k++) fx.part('heart', e.x, e.y, (Math.random() - 0.5) * 90, -60 - Math.random() * 60, 0.8, 9, null, { drag: 1 });
        } else if (Math.random() < 0.3) fx.text(e.x, e.y, '흥!', '#ffd0f0', 12, 0.6);
        break;
    }
  }
  ev.length = 0;
}
const BBIKKI_SK = { flyer: '전단지가 멤버 시야를 가린다 · 사거리 −30%', lure: '진상을 한 줄로 모아 입구로 우르르 + 손님 호객', vip: '입구 앞줄 진상에게 보호막' }; // 삐끼왕 기술 첫 배너
const SHIELD_TXT = { queen: '여왕의 보호막!', inpi_treasurer: '회비 지원!', boss_union: '회장님 회비 지원!' };
const UNION_PHASE = {
  kneel: ['갑질 타임!', '"전원 무릎 꿇어!" 멤버가 기절해요'],
  feast: ['오리고기 회식!', '진상들이 체력을 회복해요'],
  aura: ['독재 정치!', '곁의 진상이 단단하고 빨라져요'],
  interest: ['이자 폭탄!', '입구 내구도가 계속 떼여요'],
  shieldAura: ['회비 지원!', '진상들에게 보호막'],
};
const PROJ_COL = { notice: '#ffd23f', warn: '#ff6b5a', bullet: '#6dffb0', flower: '#ff9fd0', bottle: '#7be38f', wink: '#ff5fcf', cane: '#e0b27a', swear: '#ff9a3c' };
const BOSS_COL = { boss_resort: '#1a5a9a', mid_pension: '#7a5a2a', boss_bbikki: '#5a8a00', queen: '#b01e8c', boss_thug: '#9a1a1a', boss_gapjil: '#5a1ec0', boss_inpi: '#137a4a', boss_loan: '#8a6a00', boss_union: '#5a0a9a', boss_kkondol: '#4a3a6a', boss_queenmom: '#8a2a9a', boss_sales: '#8a6a00', boss_otaku: '#1a7a4a', boss_jusa: '#9a2a1a', boss_soloparty: '#a0158a' };
const POOF = ['퍽!', '빡!', '뿅', '컷!', '퇴장~', '아웃!'];
const CONFETTI = ['#ffd23f', '#ff4fd8', '#6ff0ff', '#7dff9a', '#ff8a00', '#ffffff'];

// ─── HUD ─────────────────────────────────────────────
const H$ = {
  wave: $('#h-wave'), left: $('#h-left'), kills: $('#h-kills'), score: $('#h-score'), xp: $('#h-xp'), lv: $('#h-lv'),
  hp: $('#h-hp'), hpLag: $('#h-hp-lag'), hpText: $('#h-hptext'), stars: $('#h-stars'), ult: $('#btn-ult'), boss: $('#bossbar'), bossName: $('#boss-name'), bossFill: $('#boss-fill'),
  mute: $('#btn-mute'), baseBox: document.querySelector('.base-hp'), fx: $('#h-fx'),
  time: $('#h-time'), speed: $('#btn-speed'), syn: $('#h-syn'),
};
H$.syn.addEventListener('click', (e) => { if (e.target.closest('[data-act="synMore"]')) ACTS.synMore(); });
function setText(el, key, v) {
  if (app.hudCache[key] === v) return false;
  app.hudCache[key] = v;
  el.textContent = v;
  return true;
}
function updateHud() {
  const g = app.g;
  if (!g) return;
  const w = Math.max(1, g.wave);
  const stageMode = g.mode === 'stage';
  const def = g.wave > 0 ? S.waveDefFor(g, w) : null;
  const bossWave = !!(def && def.boss);
  if (TWUI) TWUI.hudTick(g);
  setText(H$.wave, 'wave', g.tower ? `지옥 ${g.tower.f}F · WAVE ${w}/${g.totalWaves}` : g.pvp ? `대전 · WAVE ${w}${g.pvp.n ? ` · 서든데스 ${g.pvp.n}단계` : ''}` : g.raid ? `레이드 · ${Math.max(0, Math.ceil(g.raid.sec - g.t))}초` : g.weekly ? `주간 · WAVE ${w}/${g.totalWaves}` : stageMode ? `${g.hell ? 'HELL ' : ''}${stageLabel(g.stage)} · WAVE ${w}/${g.totalWaves}` : `WAVE ${w} ∞`);
  setText(H$.time, 'time', `${Math.floor(g.t / 60)}:${String(Math.floor(g.t % 60)).padStart(2, '0')}`);
  if (g.pvp) setText(H$.time, 'time', `남은 ${PV.pvpLeftText(S.pvpTime(g))}`); // 1:1 대전: 5분 판정까지 남은 시간
  // 방어선 위험 경고
  const low = g.base.hp / g.base.max < 0.15 && !g.over;
  if (low && !app.hudCache.lowWarn && g.base.hp > 0) { fx.banner('방어선 위험!', '입구가 곧 뚫려요 — 회복 스킬!', '#a3121e', 1.6, 'wave'); fx.flash('#ff2030', 0.35); }
  app.hudCache.lowWarn = low;
  hud.classList.toggle('danger', low);
  H$.wave.classList.toggle('boss', bossWave && g.phase !== 'break');
  setText(H$.left, 'left', g.phase === 'break' ? (g.wave === 0 ? '준비!' : '잠깐 숨 돌리기') : `남은 진상 ${S.enemiesLeft(g)}`);
  setText(H$.fx, 'fx', g.mapFx.id === 'none' ? '' : g.mapFx.icon);
  setText(H$.kills, 'kills', fmt(g.stats.kills));
  setText(H$.score, 'score', g.mode === 'endless' && ((g.scoreMul || 1) * (g.streak || 1)) > 1.001 ? `${fmt(g.stats.score)} ×${((g.scoreMul || 1) * (g.streak || 1)).toFixed(2)}` : fmt(g.stats.score));
  setText(H$.lv, 'lv', `Lv.${g.level}`);
  const synKey = JSON.stringify([g.attrCount, g.stacks, g.heroes.map((h) => h.evo ? 1 : 0)]);
  if (app.hudCache.syn !== synKey) { app.hudCache.syn = synKey; H$.syn.innerHTML = synTrayHtml(g, false); }
  const xp = Math.round((g.exp / g.need) * 100);
  if (app.hudCache.xp !== xp) {
    app.hudCache.xp = xp; H$.xp.style.width = xp + '%';
    const near = xp >= 85;
    H$.xp.parentNode.classList.toggle('near', near);
    if (near && app.hudCache.nearLv !== g.level) { app.hudCache.nearLv = g.level; fx.text(180, 70, '레벨업 임박!', '#9ff4ff', 12, 0.9, -10); }
  }
  // 건전녀 방패: 체력 막대 위에 흰 칸
  { const sh = g.doorShield > 0 && g.doorShieldT > 0 ? Math.min(1, g.doorShield / g.base.max) : 0; const sp = Math.round(sh * 1000) / 10; if (app.hudCache.sh !== sp) { app.hudCache.sh = sp; let el = document.getElementById('h-hp-sh'); if (!el && H$.hp.parentNode) { el = document.createElement('div'); el.id = 'h-hp-sh'; H$.hp.parentNode.appendChild(el); } if (el) el.style.width = sp + '%'; } }
  const frac = g.base.hp / g.base.max;
  const hpP = Math.round(frac * 1000) / 10;
  if (app.hudCache.hp !== hpP) {
    app.hudCache.hp = hpP;
    H$.hp.style.width = hpP + '%';
    H$.hpLag.style.width = hpP + '%';
    H$.hp.className = hpP < 35 ? 'low' : hpP < 70 ? 'mid' : '';
  }
  setText(H$.hpText, 'hpt', `${Math.ceil(g.base.hp)} / ${g.base.max}`);
  if (stageMode) {
    const ms = g.mission, lost = !!(ms && ms.max && !ms.pct && ((g.cstat || {})[ms.stat] || 0) > ms.n); // '이하' 미션을 넘기면 ★★★ 은 이번 판에 끝
    const st = starsFor(frac, !lost);
    if (setText(H$.stars, 'stars', starStr(st))) { H$.stars.classList.remove('bump'); void H$.stars.offsetWidth; H$.stars.classList.add('bump'); }
  }
  const up = Math.floor(g.ult);
  if (app.hudCache.ult !== up) {
    app.hudCache.ult = up;
    H$.ult.style.setProperty('--p', up);
  }
  // 기세 고리: 3칸이 부드럽게 차고 · 한 칸 꽉 차면 딸깍 · 총공지 = 충전 100% + 기세 2칸
  { const on = g.mom !== null && g.mom !== undefined, m = on ? g.mom : 300;
    for (let i = 0; i < 3; i++) { const el = document.getElementById('ur' + i); if (!el) continue; const f = Math.max(0, Math.min(1, (m - i * 100) / 100)); const v = (f * 100).toFixed(1); if (el.dataset.v !== v) { el.dataset.v = v; el.style.strokeDasharray = `${v} 100`; el.classList.toggle('full', f >= 1); } }
    const full = on ? Math.floor(m / 100) : 3;
    if (app.hudCache.momN !== undefined && full > app.hudCache.momN && on) { try { A.sfx.tap(); } catch { /* 무시 */ } }
    app.hudCache.momN = full;
    H$.ult.classList.toggle('noring', !on);
    const rd = up >= RULES.ultMax && full >= 2;
    if (H$.ult.classList.contains('ready') !== rd) { H$.ult.classList.toggle('ready', rd); if (rd) { const b = document.createElement('span'); b.className = 'ult-bub'; b.textContent = '총공지 준비!'; H$.ult.appendChild(b); setTimeout(() => b.remove(), 1800); } }
    if (rd && !app.ultTipShown) { app.ultTipShown = true; showTip('총공지 준비 완료! 오른쪽 아래 메달을 눌러요', 3500); }
    if (on && !tutDone('mom') && g.mode === 'stage' && g.t > 6) { setTut('mom'); showTip('기세: 스킬을 쓸 때마다 1칸씩 써요 · 시간이 지나고 진상을 잡으면 다시 차요 · 2칸이면 총공지!', 6000); H$.ult.classList.add('tut'); setTimeout(() => H$.ult.classList.remove('tut'), 6000); }
  }
  // 보스 체력바
  let hp = 0, max = 0, name = '';
  let midOnly = true;
  for (const e of g.enemies) if ((e.boss || e.mid) && !e.dead) { hp += Math.max(0, e.hp); max += e.maxHp; name = name ? name + ' · ' + shortName(e.type) : shortName(e.type); if (e.boss) midOnly = false; }
  if (max > 0) {
    if (H$.boss.hidden) H$.boss.hidden = false;
    setText(H$.bossName, 'bn', `${midOnly ? '중간 보스' : ''} ${name}`);
    H$.boss.classList.toggle('mid', midOnly);
    const p = Math.round((hp / max) * 1000) / 10;
    if (app.hudCache.bp !== p) { app.hudCache.bp = p; H$.bossFill.style.width = p + '%'; }
  } else if (!H$.boss.hidden) H$.boss.hidden = true;
}
function hitBaseHud() {
  const b = H$.baseBox;
  b.classList.remove('hit');
  void b.offsetWidth;
  b.classList.add('hit');
}
function syncMute() {
  const m = A.isMuted();
  H$.mute.textContent = m ? '' : '';
  for (const b of document.querySelectorAll('[data-act="mute"]')) b.textContent = m ? '' : '';
}

// ─── 메인 루프 ───────────────────────────────────────
let last = performance.now();
let acc = 0;
let hudT = 0;
const perf = { frames: 0, workSum: 0, work: 0, frameSum: 0, frame: 0, maxWork: 0, steps: 0, window: [] };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.1) dt = 0.1;
  const t0 = performance.now();
  const live = app.g;
  const g = live || app.demo;
  fx.noBanner = !live;
  R.quiet = !live;
  if (!live && !frame.quietCleared) { frame.quietCleared = true; try { fx.texts && fx.texts.items && (fx.texts.items.length = 0); } catch { /* 무시 */ } }
  if (live) frame.quietCleared = false;
  if (app.hitStop > 0) { app.hitStop -= dt; dt = 0; }
  if (live) tickCards((now - (frame.prev || now)) / 1000 > 0.1 ? 0.1 : (now - (frame.prev || now)) / 1000);
  frame.prev = now;
  if (g && !app.paused && !app.confirmOpen) {
    const ts = (fx.slowmo > 0 ? 0.22 : 1) * (app.aim ? 0.3 : 1) * (live && (app.cardsOpen || live.augOffer) ? (live.pvp ? 0.85 : 0.2) : 1) * (live && app.infoHero && !bubble.hidden ? 0.5 : 1);
    const speed = live ? DEBUG.speed * (app.runSpeed || 1) : 1;
    if (live && live.augOffer && !app.paused) { live.augOffer.t -= dt * 0.8; if (DEBUG.autopick) { S.applyAug(live, live.augOffer.opts[0]); handleEvents(live, true); } } // 증강 제한 시간은 실제 시간으로 (고르는 동안 느려져도)
    if (live && live.mode === 'endless' && !live.over && !app.paused) {
      const idle = performance.now() - (app.lastInput || performance.now());
      if (idle > 60000) { live.afkSec = (live.afkSec || 0) + dt; if (!app.afkShown) { app.afkShown = true; fx.banner('자리 비움 — 보상 멈춤', '화면을 누르면 다시 보상이 쌓여요', '#333a55', 2.2, 'big'); } }
      else app.afkShown = false;
    }
    if (live && live.pvp && PVP.t0) live.pvp.clock = (Date.now() - PVP.t0) / 1000; // 1:1 대전: 서든데스 · 판정 시간은 두 사람 똑같이 (실제 시간)
    acc += dt * ts * speed;
    const maxSteps = Math.ceil(10 * Math.max(1, speed));
    let n = 0;
    while (acc >= STEP && n < maxSteps) {
      if (live && DEBUG.stress) stressFill(g);
      S.step(g, STEP);
      acc -= STEP;
      n++;
      if (!live) { g.pendingLevels = 0; if (g.base.hp < g.base.max) g.base.hp = g.base.max; }
      if (live) handleEvents(g, true); else g.events.length = 0; // 로비 배경 전투: 숫자·글자·이펙트 안 띄움
      if (live && g.pendingLevels > 0 && !g.over && !app.cardsOpen) {
        if (app.autoCards && !g.pvp && !DEBUG.autopick) { autoPickAll(g); continue; }
        if (g.welcomePicks > 0 || g.phase !== 'wave' || g.pvp || app.cardQ || DEBUG.autopick) { app.cardQ = false; openCards(); break; }
      }
    }
    if (n >= maxSteps) acc = 0;
    perf.steps += n;
  }
  fx.update(dt);
  if (app.skLink && app.skLink.el && app.g) { const cr = canvas.getBoundingClientRect(), br = app.skLink.el.getBoundingClientRect(); app.skLink.x = ((br.left + br.width / 2 - cr.left) / cr.width) * FIELD.W; app.skLink.y = ((br.top + br.height * 0.3 - cr.top) / cr.height) * app.g.H; app.skLink.h = app.g.heroes.find((o) => o.slot === app.skLink.slot); }
  R.draw(g, app);
  hudT -= dt;
  if (live && hudT <= 0) { hudT = 1 / 15; updateHud(); renderSkillbar(); checkNewEnemies(live); if (app.infoHero && !bubble.hidden && (app.infoTick = (app.infoTick || 0) + 1) % 4 === 0) bubble.innerHTML = heroStatsHtml(live, app.infoHero); }
  const work = performance.now() - t0;
  perf.frames++;
  perf.workSum += work;
  perf.frameSum += dt * 1000;
  if (work > perf.maxWork) perf.maxWork = work;
  if (perf.frames >= 60) {
    perf.work = perf.workSum / perf.frames;
    perf.frame = perf.frameSum / perf.frames;
    // 자동 화질: 프레임 간격이 아니라 "한 프레임 일하는 시간"으로 판단한다
    //  (절전 모드 · 30Hz 화면은 간격이 33ms 라도 일은 가볍다 → 예전엔 이걸 느린 폰으로 보고 1.1까지 내려 캐릭터가 흐릿해졌다)
    //  일이 3초 연속 11ms 넘으면 한 단계 낮추고 (2 → 1.75 → 1.5, 아주 무거우면 1.3) · 5초 연속 6ms 아래면 다시 올린다
    if (live) {
      const d0 = R.maxDpr || 2, floor = perf.work > 20 ? 1.3 : 1.5;
      if (perf.work > 11) { perf.slow = (perf.slow || 0) + 1; perf.fast = 0; if (perf.slow >= 3 && d0 > floor) { R.maxDpr = Math.max(floor, d0 > 1.75 ? 1.75 : 1.5); perf.slow = 0; layout(); } }
      else if (perf.work < 6) { perf.fast = (perf.fast || 0) + 1; perf.slow = 0; if (perf.fast >= 5 && d0 < (R.baseDpr || 2)) { R.maxDpr = Math.min(R.baseDpr || 2, d0 + 0.25); perf.fast = 0; layout(); } }
      else { perf.slow = 0; perf.fast = 0; }
    }
    perf.window.push({ work: +perf.work.toFixed(2), frame: +perf.frame.toFixed(2), max: +perf.maxWork.toFixed(2), enemies: g ? g.enemies.length : 0, projs: g ? g.projs.length : 0, parts: fx.parts.items.length });
    if (perf.window.length > 30) perf.window.shift();
    perf.frames = 0; perf.workSum = 0; perf.frameSum = 0; perf.maxWork = 0;
  }
}

// 성능 측정용: 적 N마리 유지
function stressFill(g) {
  let alive = 0;
  for (const e of g.enemies) if (!e.dead) alive++;
  const types = ['yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'scammer', 'inpi_clique', 'inpi_treasurer'];
  while (alive < DEBUG.stress) {
    const e = S.spawnEnemy(g, types[alive % types.length], undefined, -20 - Math.random() * 200, { hpMul: 40 });
    e.stopY -= Math.random() * 260;
    alive++;
  }
}

// ─── 입력 ────────────────────────────────────────────
// 화면 탭 = 그 적 집중 공격 (경험치 보석은 저절로 모인다)
function fieldPos(ev) {
  const r = canvas.getBoundingClientRect();
  return { x: ((ev.clientX - r.left) / r.width) * FIELD.W, y: ((ev.clientY - r.top) / r.height) * (app.g ? app.g.H : 720) };
}
let press = null;
canvas.addEventListener('pointerdown', (ev) => {
  A.unlock();
  const g = app.g;
  if (!g || app.paused || g.over || app.confirmOpen) return;
  const { x, y } = fieldPos(ev);
  app.lastInput = performance.now();
  if (g.bags && g.bags.length && S.tapBag(g, x, y)) { handleEvents(g, true); return; } // 무한: 떨어지는 코인 주머니
  // 1) 스킬 조준: 누른 채로 끌면 원이 따라오고, 손을 떼면 그 자리에 시전
  if (app.aim) {
    app.aim.x = x; app.aim.y = y; app.aim.hold = true;
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* 무시 */ }
    return;
  }
  // 2) 영웅: 짧게 누르면 정보, 끌면 자리 바꾸기
  const h = S.heroAt(g, x, y);
  if (h) {
    press = { h, x0: x, y0: y, t0: performance.now(), id: ev.pointerId };
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* 무시 */ }
    return;
  }
  // 3) 적: 지목 (모두가 그 적부터)
  const f = S.setFocus(g, x, y);
  fx.ring(x, y, 4, 40, 0.3, f ? '#ff3b5c' : '#ffffff', 2);
  if (f) { fx.text(f.x, f.y - f.def.size * 0.8, '지목!', '#ff6b80', 13, 0.7); A.sfx.tap(); vibrate(8); }
  hideBubble();
});
canvas.addEventListener('pointermove', (ev) => {
  const g = app.g;
  if (!g) return;
  const { x, y } = fieldPos(ev);
  if (app.aim) { app.aim.x = x; app.aim.y = y; return; }
  if (!press) return;
  if (!app.drag && Math.hypot(x - press.x0, y - press.y0) > 14) { app.drag = { h: press.h }; hideBubble(); }
  if (app.drag) {
    const slot = S.nearestSlot(x, g);
    app.drag.x = x; app.drag.y = Math.min(y, g.rowY + 30); app.drag.slot = slot; app.drag.slotX = g.slotX[slot];
  }
});
function aimValid(g, a) { return a.y > 24 && a.y < g.ropeY + 6; } // 방어선 위 필드에만
function endPress(ev) {
  const g = app.g;
  if (app.aim && app.aim.hold && g) {
    const a = app.aim;
    a.hold = false;
    if (ev.type !== 'pointerup') return;
    if (!aimValid(g, a)) { toast('방어선 위 필드에만 쓸 수 있어요', 1100); return; }
    if (g.heroes.includes(a.h)) { S.castSkill(g, a.h, a.x, a.y); handleEvents(g, true); }
    cancelAim();
    return;
  }
  if (!press || !g) { press = null; return; }
  const p0 = press;
  press = null;
  if (app.drag) {
    const d = app.drag;
    app.drag = null;
    if (d.slot !== undefined && S.swapHeroes(g, d.h, d.slot)) { A.sfx.card(); vibrate(10); }
    return;
  }
  if (ev.type === 'pointerup') showHeroBubble(p0.h);
}
canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', endPress);
const SLOT_XS = [34, 92, 150, 210, 268, 326];
// 게임월드 공용 설정 (gw:settings) — 랑방 페이지에는 settings.js 가 없어서 직접 읽는다
function gwPref(k) { try { const v = JSON.parse(localStorage.getItem('gw:settings') || '{}')[k]; return v === undefined ? (k === 'vibrate') : !!v; } catch { return k === 'vibrate'; } }
// 멀티킬 쾌감 연출: 큰 글자 · 잠깐 멈춤 · 흔들림 · 빛 · 코인 분수 · 소리 · 진동 (0.4초에 한 번만 크게)
const MK_TIERS = [[15, '대학살!!!'], [8, '싹쓸이!!'], [5, '5킬!'], [3, '트리플!']];
function multiKillFx(g, e) {
  if (Q.has('nomk')) return;
  const k = MK_TIERS.findIndex(([n]) => e.n >= n);
  if (k < 0) return;
  const tier = 3 - k;
  const now = performance.now();
  if (now - (app.mkAt || 0) < 400 && tier <= (app.mkTier || 0)) return; // 도배 방지
  app.mkAt = now; app.mkTier = tier;
  const label = tier === 1 && e.n > 5 ? `${e.n}킬!` : MK_TIERS[k][1];
  const rm = document.body.classList.contains('rm');
  fx.multi(e.x, e.y - 40, label, tier);
  const heavy = g.enemies.length > 85; // 진상이 많을 땐 가벼운 연출만 (느린 폰)
  if (!rm) {
    app.hitStop = [40, 55, 70, 80][tier] / 1000;
    if (heavy && tier < 2) { fx.addShake(3 + tier * 2); A.sfx.multi(tier); vibrate(10 + tier * 8); return; }
    fx.addShake(3 + tier * 3);
    fx.blast(e.x, e.y, 40 + tier * 22, 'gold', 0.4 + tier * 0.06);
    fx.ring(e.x, e.y, 12, 70 + tier * 30, 0.45, tier >= 3 ? '#ff6fd8' : '#ffd23f', 3 + tier);
    fx.burst(e.x, e.y, (heavy ? 3 : 6) + tier * (heavy ? 2 : 5), '#ffd23f', 150 + tier * 40, 'coin', 7, 0.8, 260);
    if (tier >= 2) fx.flash('#fff2b0', 0.12 + tier * 0.04);
  }
  A.sfx.multi(tier);
  vibrate(10 + tier * 8);
}
function vibrate(ms) { if (!app.touched || !gwPref('vibrate')) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* 무시 */ } }

// ─── 스킬 바 · 조준 ─────────────────────────────────
const skillbar = $('#skillbar');
$('#h-fx').addEventListener('click', () => ACTS.fxInfo());
const aimbar = $('#aimbar');
function useSkillBtn(slot) {
  const g = app.g;
  if (!g || app.paused || g.over) return;
  const h = g.heroes.find((o) => o.slot === slot);
  if (!h || !h.def.skill) return;
  if (!S.skillReady(h)) { toast(`${h.def.skill.name} 충전 중… ${Math.ceil(h.skillCd)}초`, 900); return; }
  const sk = h.def.skill;
  vibrate(15);
  if (sk.target) {
    if (app.aim && app.aim.h === h) { cancelAim(); return; }
    app.aim = { h, r: sk.r[h.lv - 1], color: h.def.color, x: 180, y: g.ropeY - 150 };
    aimbar.hidden = false;
    aimbar.querySelector('b').textContent = `${sk.name} — 찍을 곳을 탭!`;
    hideBubble();
    return;
  }
  if (S.castSkill(g, h)) { const bt = skillbar.querySelector(`[data-slot="${slot}"]`); if (bt) { bt.classList.remove('cast'); void bt.offsetWidth; bt.classList.add('cast'); } }
  handleEvents(g, true);
}
function cancelAim() { app.aim = null; aimbar.hidden = true; }
aimbar.addEventListener('click', (ev) => { if (ev.target.closest('[data-aim]')) { A.sfx.tap(); cancelAim(); } });
skillbar.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-slot]');
  if (!b) return;
  if (skPress && skPress.long) { skPress = null; return; } // 길게 누른 건 설명만
  skPress = null;
  A.unlock();
  useSkillBtn(Number(b.dataset.slot));
});
// 스킬 컷인: 멤버 얼굴 카드가 0.5초 미끄러져 지나간다 (CSS)
function cutIn(h) {
  if (!HEROES[h.id]) return;
  const old = stage.querySelector('.cutin'); if (old) old.remove();
  const d = document.createElement('div');
  d.className = 'cutin';
  d.style.setProperty('--c', h.def.color || '#ffd23f');
  // 얼굴 맞춤 자르기: 썸네일 얼굴 상자(FACE_BOX)로 얼굴이 띠 높이의 46% · 위에서 40% 자리에 오게 (고아라 · 배현경처럼 얼굴이 아래에 있는 그림도)
  const hq = !NO_HQ_ART.has(h.id) && (FACE_BOX[h.id] || DEX_FACE[h.id]);
  d.innerHTML = `<span class="ci-art"><img ${hq ? `class="fz" style="${faceCircStyle(h.id, 0.46, 0.4)}"` : ''} src="${thumbSrc(h.id) || h.def.img}" alt="" onerror="this.onerror=null;this.className='';this.removeAttribute('style');this.src='${h.def.img}'"></span><b>${esc(h.def.skill.name)}</b>`;
  stage.appendChild(d);
  // 긴 이름은 띠 안에 들어가게 글자를 줄인다
  const b = d.querySelector('b'), room = d.clientWidth - d.querySelector('.ci-art').offsetWidth - 14;
  if (b && room > 0 && b.scrollWidth > room) b.style.fontSize = `${(parseFloat(getComputedStyle(b).fontSize) * room / b.scrollWidth).toFixed(1)}px`;
  setTimeout(() => d.remove(), 900);
}
function skillFx(h) {
  // 스킬 이름은 한 번만: 이 스킬이 같은 프레임에 큰 배너를 띄웠으면 배너만, 아니면 컷인 띠만 (머리 위 글자는 없앰 — 스킬 아이콘이 대신 톡 튄다)
  if (!(fx.bannerAt === fx.time && fx.banners.length) && h.id !== 'sanghwa') cutIn(h); // 박상화는 금빛 "좋은 남자!" 띠가 이름 (skillfx.js)
  // 같은 프레임에 스킬별로 띄운 이름 글자("공주의 일격!!" · "다이어트 주사!" · "레드카드!")도 지운다 — 띠나 배너가 이미 이름을 보여 준다
  const nm = h.def.skill.name.replace(/[!\s]+$/, '');
  for (const t of fx.texts.items) if (t.text && t.text.startsWith(nm) && t.max - t.life < 0.05) t.life = 0;
  fx.ring(h.x, h.y, 10, 80, 0.5, h.def.color, 5);
  A.sfx.join();
  app.tutSkillDone = true;
}
const SKILL_SHORT = { baul: '썰매', byunghwa: '원맨쇼', jeongseob: '벽', bangjang: '집합', staff: '레드카드', gunman: '난사', gunnyeo: '방패', myunghoon: '저격', dohoon: '앵콜', ingyu: '할리', donghan: '진심', youngjun: '블랙러시', eunok: '원샷', hanna: '윙크', sunggu: '블랙홀', junseo: '소개팅', hyungyeong: '주사', ara: '일격', hochan: '위하여', soyoung: '올인콜', jieun: '시간정지', sanghwa: '좋은남자', jungmin: '붕대', jiwon: '뻑큐', wonsik: '결정사' };
const skShort = (h) => SKILL_SHORT[h.id] || h.def.skill.name.replace(/[!\s]/g, '').slice(0, 5);
const momBar = document.createElement('div');
momBar.id = 'mombar'; momBar.hidden = true;
momBar.innerHTML = '<small>기세</small><i><b></b></i><i><b></b></i><i><b></b></i>';
stage.appendChild(momBar);
function renderMom(g) {
  momBar.hidden = true; // (기세는 총공지 메달 둘레 고리로 옮김)
  const on = false;
  if (!on) return;
  const bs = momBar.querySelectorAll('b');
  for (let i = 0; i < 3; i++) { const f = Math.max(0, Math.min(1, (g.mom - i * 100) / 100)); bs[i].style.transform = `scaleY(${f.toFixed(3)})`; bs[i].parentElement.classList.toggle('full', f >= 1); }
}
function renderSkillbar() {
  const g = app.g;
  if (!g) return;
  renderMom(g);
  renderConsBar();
  const list = g.heroes.filter((h) => h.def.skill && !h.summon).sort((a, b) => (b.id === g.leader) - (a.id === g.leader) || a.slot - b.slot);
  list.forEach((h, i) => { h._skNo = i + 1; });
  const key = list.map((h) => h.id + h.lv + '@' + h.slot).join(','); // 칸도 (자리를 옮기면 버튼이 옛 칸을 가리키지 않게)
  if (skillbar.dataset.key !== key) {
    skillbar.dataset.key = key;
    skillbar.dataset.n = list.length;
    skillbar.classList.add('v2');
    skillbar.innerHTML = list.map((h, i) => { const nm = h.def.name; return `<button class="sk sk-v2" data-slot="${h.slot}" aria-label="${esc(h.def.name)} · ${esc(h.def.skill.name)}"><span class="ring"></span><span class="sk-face" style="--ac:${(ATTRS[h.def.attr] || {}).color || '#888'}"><img class="fz" data-face="${h.id}" data-fc="1" style="${faceCircStyle(h.id)}" src="${thumbSrc(h.id) || h.def.img}" alt="" draggable="false"></span><i class="sk-no">${i + 1}</i><img class="sk-ic" src="/img/lb/ui2/sk_${h.id}.webp" alt="" draggable="false" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'sk-fb'}))"><em>${esc(nm)}</em><i class="cd"></i><b class="cdn"></b><i class="sk-lv">${h.lv}</i><i class="sk-sweat"></i><i class="sk-lock">기세 부족</i><i class="sk-pip"></i></button>`; }).join('');
  }
  let ready = false;
  for (const b of skillbar.children) {
    const h = g.heroes.find((o) => o.slot === Number(b.dataset.slot));
    if (!h) continue;
    const sk = h.def.skill;
    const pct = Math.round((1 - Math.max(0, h.skillCd) / sk.cd) * 100);
    b.style.setProperty('--p', pct);
    const r = h.skillCd <= 0;
    if (r && !b.classList.contains('ready')) { vibrate(12); if (app.hudCache.skRd && app.hudCache.skRd[h.slot] === false) { const f = document.createElement('span'); f.className = 'sk-rdname'; f.textContent = sk.name; b.appendChild(f); setTimeout(() => f.remove(), 1400); } }
    (app.hudCache.skRd = app.hudCache.skRd || {})[h.slot] = r;
    b.classList.toggle('ready', r);
    b.classList.toggle('aiming', !!(app.aim && app.aim.h === h));
    { const lv = b.querySelector('.sk-lv'); if (lv && lv.textContent !== String(h.lv)) lv.textContent = h.lv; }
    { const need = h.def.skill && h.def.skill.id === 'forlangbang' ? 200 : 100, has = g.mom === null || g.mom === undefined || g.mom >= need; b.classList.toggle('nomom', !has); b.classList.toggle('mompip', has && g.mom !== null && g.mom !== undefined); }
    b.classList.toggle('tired', h.tiredT > 0);
    { const cn = b.querySelector('.cdn'); const v = r ? '' : String(Math.ceil(h.skillCd)); if (cn.textContent !== v) cn.textContent = v; }
    if (r) ready = true;
  }
  // 튜토리얼: 1-1 에서 처음 스킬이 준비되면 알려 준다 · 1-2 에서는 지목
  if (ready && !tutDone('skill') && g.mode === 'stage' && g.stage <= 2) { setTut('skill'); showTip('스킬 버튼이 반짝! 눌러서 필살기를 써 봐요', 5000); skillbar.classList.add('tut'); setTimeout(() => skillbar.classList.remove('tut'), 5000); }
  if (!tutDone('focus') && g.mode === 'stage' && g.stage === 2 && g.wave >= 1 && g.enemies.length > 3) { setTut('focus'); showTip('진상을 탭하면 "지목"! 모두가 그 진상부터 때려요', 5000); }
}
function tutDone(k) { try { return !!localStorage.getItem('langbang:tut:' + k); } catch { return true; } }
function setTut(k) { try { localStorage.setItem('langbang:tut:' + k, '1'); } catch { /* 무시 */ } }

// ─── 필드 말풍선: 영웅 정보 · 처음 보는 진상 ─────────
const bubble = $('#bubble');
function placeBubble(x, y) {
  const g = app.g;
  const sx = (x / FIELD.W) * 100, sy = (y / (g ? g.H : 720)) * 100;
  bubble.style.left = clamp(sx, 29, 71) + '%';
  bubble.style.top = sy + '%';
}
// 필드 멤버 정보 카드: 지금 능력치 · 공격 방식 · 레벨 효과 · 버프/디버프 (열려 있는 동안 게임 50% 속도)
const PROJ_TXT = {
  cone: '부채꼴 음파 (여러 명 동시)', warn: '유도탄 (감속 · 경고 누적)', bullet: '직선 저격 (자기 줄만)', heart: '포물선 폭탄 (떨어진 곳 범위)', swear: '연쇄 번개 (3~5명 튕김)',
  wave: '둥근 음파 (주변 전부 · 감속)', dumbbell: '포물선 덤벨 (범위) + 오토바이 돌진', snack: '유도 과자 + 한 줄 빔', dash: '뛰어들어 연속 베기', bottle: '포물선 소주병 (범위 · 분노 중 불바다)',
  beam: '레이저 (계속 쏘면 세짐)', cane: '관통 지팡이 (자기 줄 전부)', gf: '핀볼 여사친 (3~4명 튕김 · 밀어내기)', slam: '몸통 박치기 충격파 / 날씬 모드 연타', hammer: '무거운 유도 망치 (보스 우선)', crown: '황금 파동 (자기 줄 전부 관통)',
};
function heroStatsHtml(g, h) {
  const d = h.def;
  const iv = S.heroInterval(g, h); // 장비·카드·기진맥진까지 모두 들어간 실제 값
  const crit = (g.mods.crit + (h.gear.crit || 0) + (d.critBonus || 0)) * 100;
  const gearTxt = Object.entries(h.gear || {}).filter(([, v]) => typeof v === 'number' && v).map(([k, v]) => `${GEAR_STATS[k] ? GEAR_STATS[k].name : k} +${(v * 100).toFixed(0)}%`).join(' · ');
  const flags = [d.lane ? '자기 줄만' : '', d.splash || d.slamR ? '범위' : '', d.proj === 'cane' || d.proj === 'crown' || (h.lv >= 3 && d.proj === 'bullet') ? '관통' : '', d.bounces || d.ricochet ? '튕김' : '', d.slow ? '감속' : ''].filter(Boolean).join(' ');
  const st = [];
  const res = resOf(h.meta, h.gear && h.gear.res);
  if (res > 0) st.push(`상태이상 시간 −${Math.round(res * 100)}%`);
  if (g.rallyT > 0) st.push('집합! 공속↑');
  if (g.hcT > 0) st.push(`랑방을 위하여 +${Math.round(g.hcBuff * 100)}%`);
  if (g.hcSkT > 0) st.push(`공격력 +${Math.round(g.hcSkAtk * 100)}%`);
  if (h.evo) st.push(`진화: ${EVO[h.id].name}`);
  if (h.rage) st.push('분노');
  if (h.alt && d.diet) st.push('날씬 모드');
  if (h.alt && d.age) st.push('폭삭 늙음 (힘 반토막)');
  for (const [k, t] of [['stunT', '기절'], ['charmT', '홀림'], ['rumorT', '뒷담 공속↓'], ['paperT', '차용증 공속↓'], ['fearT', '공포'], ['vomitT', '토 공속↓'], ['blindT', '눈부심'], ['drowsyT', '라떼 공속↓'], ['grabT', '붙잡힘']]) if (h[k] > 0) st.push(t);
  const perks = Object.entries(d.perks || {}).map(([k, v]) => `<li class="${h.lv >= +k ? 'on' : ''}"><b>Lv${k}</b> ${esc(v)}</li>`).join('');
  return `<div class="hi-head">${av(d)}<div><b>${d.name} <small>Lv.${h.lv}${h.evo ? '' : ''} · ${'★'.repeat(h.star || 1)}</small></b>${attrTag(d.attr)}${(HERO_TAGS[h.id] || []).map((t) => `<span class="tg">${TAGS[t].icon}${TAGS[t].name}</span>`).join('')}</div><button class="hi-x"data-hix>✕</button></div>
 <div class="hi-stats"><span>${ic('swords', '', 'sm')} 공격력 <b>${fmt(S.heroDamage(g, h))}</b></span><span>${ic('speed', '', 'sm')}공속 <b>${(1 / iv).toFixed(2)}/초</b></span><span>사거리 <b>${Math.round(S.heroRange(g, h))}</b></span><span>${ic('target', '', 'sm')}치명타 <b>${crit.toFixed(0)}%</b></span></div>
 <p class="hi-row"> ${esc(PROJ_TXT[d.proj] || d.attack)} ${flags ? `<em>${flags}</em>` : ''}</p>
    ${gearTxt ? `<p class="hi-row">${ic('bag', '', 'sm')}${esc(gearTxt)}</p>` : ''}
 <p class="hi-row">${ic('sparkle', '', 'sm')} ${esc(d.skill.name)}: ${esc(d.skill.desc)}</p>
    <ul class="hi-perks">${perks}</ul>
    ${st.length ? `<p class="hi-row st">${st.join(' · ')}</p>` : ''}
    <p class="hi-tip">끌어서 자리 바꾸기 · 게임은 느리게 흘러가요</p>`;
}
function showHeroBubble(h) {
  const g = app.g;
  if (!g) return;
  app.infoHero = h;
  app.infoRange = S.heroRange(g, h);
  bubble.className = 'bubble hero hero-info';
  bubble.innerHTML = heroStatsHtml(g, h);
  bubble.style.left = ''; bubble.style.top = '';
  bubble.hidden = false;
  clearTimeout(showHeroBubble.t);
  A.sfx.tap();
}
bubble.addEventListener('click', (ev) => { if (ev.target.closest('[data-hix]')) hideBubble(); });
// 스킬 버튼 길게 누르기 → 설명 (쓰지 않음)
function skillInfoHtml(h) {
  const sk = h.def.skill, lv = h.lv - 1;
  const scal = [];
  for (const k of ['sec', 'spd', 'r', 'n', 'heal', 'stun', 'dance', 'mul', 'atk']) if (Array.isArray(sk[k])) scal.push(`${{ sec: '시간', spd: '공속', r: '범위', n: '개수', heal: '회복', stun: '기절', dance: '멈춤', mul: '배율', atk: '공격력' }[k]} ${sk[k].map((v, i) => (i === lv ? `<b>${v < 2 && k !== 'n' && k !== 'mul' ? Math.round(v * 100) + '%' : v}</b>` : v < 2 && k !== 'n' && k !== 'mul' ? Math.round(v * 100) + '%' : v)).join('→')}`);
  return `<div class="ih"><b>${ic('sparkle', '', 'sm')}${esc(sk.name)}</b><small>${h.def.name} · 쿨타임 ${Math.round(sk.cd * (1 - (h.gear.cd || 0)) * (h.evo ? 0.7 : 1))}초 · ${sk.target ? '찍는 스킬 (누른 뒤 필드 탭)' : '바로 발동'}</small></div>
    <p class="ia">${esc(sk.desc)}</p>${scal.length ? `<p class="ip">레벨별: ${scal.join(' · ')}</p>` : ''}<p class="ip">${S.skillReady(h) ? '준비됨 — 짧게 누르면 사용' : `${Math.ceil(h.skillCd)}초 남음`}</p>`;
}
let skPress = null;
skillbar.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('[data-slot]');
  if (!b) return;
  const slot = Number(b.dataset.slot);
  app.skLink = { slot, t0: performance.now(), el: b };
  skPress = { slot, long: false, t: setTimeout(() => {
    const g = app.g;
    const h = g && g.heroes.find((o) => o.slot === slot);
    if (!h || !h.def.skill) return;
    skPress.long = true;
    bubble.className = 'bubble skill-info';
    bubble.innerHTML = skillInfoHtml(h);
    placeBubble(Math.max(90, Math.min(270, h.x)), g.rowY - 90);
    bubble.hidden = false;
    clearTimeout(showHeroBubble.t);
    showHeroBubble.t = setTimeout(hideBubble, 3500);
    vibrate(12);
  }, 450) };
});
const skEnd = () => { if (skPress) clearTimeout(skPress.t); if (app.skLink) { const L0 = app.skLink; setTimeout(() => { if (app.skLink === L0) app.skLink = null; }, 380); } };
skillbar.addEventListener('pointerup', skEnd);
skillbar.addEventListener('pointercancel', skEnd);
skillbar.addEventListener('pointerleave', skEnd);
skillbar.addEventListener('contextmenu', (e) => e.preventDefault());
function showEnemyBubble(e) {
  bubble.className = 'bubble enemy';
  bubble.innerHTML = `<div class="ih"><em class="new">NEW</em><b>${e.def.name}</b>${clsTag(e.def.cls)}</div><p class="ia">${esc(FLAVOR[e.type] || '')}</p>${ENEMY_TIPS[e.type] ? `<p class="ia tip">${esc(ENEMY_TIPS[e.type])}</p>` : ''}`;
  placeBubble(e.x, Math.max(80, e.y + 50));
  bubble.hidden = false;
  clearTimeout(showHeroBubble.t);
  showHeroBubble.t = setTimeout(hideBubble, 2600);
}
function hideBubble() { bubble.hidden = true; app.infoHero = null; }
let seen = {};
try { seen = JSON.parse(localStorage.getItem('langbang:seen') || '{}') || {}; } catch { seen = {}; }
function checkNewEnemies(g) {
  if (!bubble.hidden && bubble.classList.contains('hero')) return;
  for (const e of g.enemies) {
    if (e.dead || e.y < 40 || seen[e.type] || e.def.dot) continue;
    seen[e.type] = 1;
    try { localStorage.setItem('langbang:seen', JSON.stringify(seen)); } catch { /* 무시 */ }
    if (['yeokko', 'namkko'].includes(e.type)) continue; // 첫 진상은 설명 생략
    showEnemyBubble(e);
    return;
  }
}
document.addEventListener('pointerdown', () => { app.touched = true; A.unlock(); if (app.screen !== 'result') A.playBgm(); }, { passive: true });

$('#btn-pause').addEventListener('click', () => pauseGame());
$('#btn-send').addEventListener('click', () => { A.unlock(); pvpSend(); });
// 2배속 (이미 깬 스테이지만) — 선택은 기억한다
function speedOk() { const g = app.g; return !!(g && g.mode === 'stage' && !g.weekly && (P().stages[g.stage] | 0) > 0); }
function syncSpeedPill() {
  const b = $('#btn-speed');
  b.hidden = !speedOk();
  b.textContent = (app.runSpeed || 1) > 1 ? '×2' : '×1';
  b.classList.toggle('on', (app.runSpeed || 1) > 1);
}
$('#btn-speed').addEventListener('click', () => {
  if (!speedOk()) return;
  app.runSpeed = (app.runSpeed || 1) > 1 ? 1 : 2;
  app.speed2 = app.runSpeed > 1;
  try { localStorage.setItem('langbang:speed2', app.speed2 ? '1' : '0'); } catch { /* 무시 */ }
  syncSpeedPill();
  A.sfx.tap();
});
try { app.speed2 = localStorage.getItem('langbang:speed2') === '1'; } catch { app.speed2 = false; }
try { app.hellMode = localStorage.getItem('langbang:hell') === '1'; } catch { app.hellMode = false; }
$('#btn-mute').addEventListener('click', () => { A.setMuted(!A.isMuted()); syncMute(); });
$('#btn-ult').addEventListener('click', () => {
  const g = app.g;
  if (!g || app.paused || app.cardsOpen) return;
  if (!S.useUlt(g)) { if (g.ult >= RULES.ultMax) handleEvents(g, true); else toast(`총공지 충전 중… ${Math.floor(g.ult)}%`, 1000); return; }
  if (g.pvp) PVP.myUlts = (PVP.myUlts | 0) + 1;
  handleEvents(g, true);
});
// 길게 누르면 뜨는 사진 저장/공유 메뉴 막기 (결과 공유 카드 그림만 예외)
stage.addEventListener('contextmenu', (e) => { if (!e.target.closest('.share-keep')) e.preventDefault(); });
document.addEventListener('keydown', (e) => {
  if (app.confirmOpen) { if (e.key === 'Escape') closeConfirm(false); return; }
  if (e.key === 'Escape' || e.key === 'p') { if (app.screen === 'play' && !app.cardsOpen) { if (app.paused) resumeGame(); else pauseGame(); } }
  if (e.key === ' ' && app.g && !app.paused) { S.useUlt(app.g); handleEvents(app.g, true); }
  if (app.cardsOpen && ['1', '2', '3', '4'].includes(e.key) && performance.now() >= app.cardLockUntil) pickCard(Number(e.key) - 1);
});
// 화면을 떠나면(홈 버튼·앱 전환·뒤로) 이어하기 저장 + 일시정지
function onHide() {
  if (app.screen === 'play' && app.g && !app.g.over) {
    saveSnap();
    if (!app.paused && !app.ending) pauseGame();
  }
  A.pauseBgm();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onHide();
  else {
    if (app.screen === 'play' || app.screen === 'menu') last = performance.now();
    if (app.touched && app.screen !== 'result') A.playBgm(); // 탭으로 돌아오면 음악 다시
  }
});
window.addEventListener('pagehide', onHide);

// ─── 화면들 ──────────────────────────────────────────
function show(html, cls = '') {
  SH.closeShare();
  if (app.screen !== 'play') { try { momBar.hidden = true; } catch { /* 아직 */ } if (app.cardsOpen) closeCards(); app.cardQ = false; const cq = document.getElementById('cardq'); if (cq) cq.hidden = true; const cs = document.getElementById('cardstrip'); if (cs && !app.cardsOpen) { cs.hidden = true; cs.innerHTML = ''; } }
  if (app.screen !== 'bag') { try { dropGhost(); } catch { /* 아직 준비 전 */ } }
  const same = ui.firstElementChild && ui.firstElementChild.dataset.scr === app.screen;
  const keep = same ? ui.firstElementChild.scrollTop : 0;
  // 화면 넘김: 앞으로 = 오른쪽에서 · 뒤로 = 왼쪽에서 · 아래 탭 = 서서히 · 소리
  const prevEl = ui.firstElementChild, prevScr = prevEl && prevEl.dataset.scr;
  const kind = same ? '' : app.navBack || app._goBack ? 'go-back' : app._goTab ? 'go-tab' : 'go-fwd';
  app._goBack = false; app._goTab = false;
  // 목적지마다 다른 넘김 연출 (transit.js): 새 화면 DOM 은 지금 바로 바뀌고 · 이전 화면은 잠깐 잔상으로 남아 물러난다
  const tr = same ? null : TR.begin(prevScr, app.screen, kind, prevEl);
  const body = `<div class="screen ${cls} ${same ? 'same' : tr && tr.themed ? '' : 'enter ' + kind}" data-scr="${app.screen}">${html}</div>`;
  if (tr) { for (const c of [...ui.children]) if (c !== prevEl) c.remove(); ui.insertAdjacentHTML('afterbegin', body); } else ui.innerHTML = body;
  if (!same) app.navAt = performance.now();
  noteScreen();
  // 아래 탭은 스크롤 화면 밖(화면 틀 맨 아래)에 둔다 — 스크롤 안에 있으면 폰에서 화면 가운데에 떠 버린다
  const nav = ui.firstElementChild.querySelector('.lb-nav');
  if (nav) ui.appendChild(nav);
  document.body.classList.toggle('has-nav', !!nav);
  if (keep) ui.firstElementChild.scrollTop = keep;
  if (tr) TR.after(tr, ui.firstElementChild);
  return ui.firstElementChild;
}
ui.addEventListener('click', (ev) => {
  // 게임 중 '‹ 게임월드' 로 나가기 전에 한 번 묻는다 (지금 판은 이어하기로 남는다)
  // 랑방 밖(게임월드)으로 가는 모든 링크는 한 번 묻는다
  const link = ev.target.closest('a[href="/"]');
  if (link) {
    ev.preventDefault();
    const d = app.g && !app.g.over && app.screen === 'play' ? app.g.lastSnap : null;
    confirmBox({ title: '랑방 대전을 종료하시겠습니까?', sub: d ? `지금 판은 웨이브 ${Math.max(1, d.wave || 1)} 처음부터 이어할 수 있어요` : '게임월드로 돌아가요', ok: '종료', cancel: '취소' })
      .then((ok) => { if (ok) leaveToHub(); });
    return;
  }
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (ui.dataset.noclick) return;
  if (ev.isTrusted && ev.detail > 0 && app.downAt < app.navAt) return; // 이전 화면에서 누르기 시작한 탭 (빠른 두 번 탭)
  A.unlock();
  const act = b.dataset.act;
  if (act !== 'pick' && act !== 'partner' && act !== 'confirmPick') uiSound(act, b);
  ACTS[act] && ACTS[act](b);
});
const ACTS = {
  menu: () => showMenu(),
  stages: () => showStages(),
  next: () => showPrep('stage', nextStage()),
  shop: () => showShop(),
  shopTab: (b) => { app.shopTab = b.dataset.tab; showShop(); },
  ranking: () => showRanking(),
  playerCard: (b) => showPlayerCard(b.dataset.u),
  rankTab: (b) => { app.rankTab = b.dataset.tab; showRanking(); },
  howto: () => showHowto(),
  mute: () => { A.setMuted(!A.isMuted()); syncMute(); if (stage.querySelector('.st-v2')) showSettings(); },
  share: () => SH.shareInvite(),
  shareResult: () => { if (app.shareData) SH.openResultShare(app.shareData, stage); },
  chapter: (b) => {
    const c = Number(b.dataset.ch);
    const first = (c - 1) * STAGES_PER_CHAPTER + 1;
    if (!stageUnlocked(first)) { lockTip(b, `${c}장`, `${stageLabel(first - 1)}을 깨면 열려요`); return; }
    app.chapterTab = c;
    app.selStage = chapterOf(nextStage()) === c ? nextStage() : first;
    const sc = ui.querySelector('.chmaps');
    if (sc && app.screen === 'stages') { sc.scrollTo({ left: (c - 1) * sc.clientWidth, behavior: 'smooth' }); R.setTheme(c); for (const d of ui.querySelectorAll('.chd')) d.classList.toggle('on', Number(d.dataset.ch) === c); return; }
    showStages();
  },
  selStage: (b) => {
    const s = Number(b.dataset.s);
    if (!stageUnlocked(s)) { toast('앞 스테이지를 먼저 깨 주세요'); return; }
    app.selStage = s;
    A.sfx.card();
    showStages();
  },
  prep: () => showPrep('stage', app.selStage),
  mapNode: (b) => mapNodeGo(b),
  endless: () => {
    if (!P().endlessUnlocked) { toast(`무한 도전은 ${stageLabel(ENDLESS_UNLOCK)}을 깨면 열려요`); return; }
    showPrep('endless', 0);
  },
  deckSlot: (b) => deckTapSlot(Number(b.dataset.i)),
  rosterPick: (b) => deckQuick(b.dataset.id),
  prepEdit: () => showDeckEditor(),
  edPick: (b) => edPick(b.dataset.id),
  edSlot: (b) => edSlot(b.dataset.id),
  edHole: () => { app.edHole = true; showDeckEditor(); },
  edLead: (b) => { const id = b.dataset.id; setDeckOrder([id, ...deckList().filter((x) => x !== id)]); A.sfx.card(); toast(`${HEROES[id].name} 대장!`, 900); if (stage.querySelector('.pp-editor')) showDeckEditor(); else if (app.screen === 'deck') showDeckTab(); },
  edF: (b) => { app.edF = b.dataset.f; showDeckEditor(); },
  edSort: (b) => { app.edSort = b.dataset.v; showDeckEditor(); },
  edPreset: (b) => { app.deckI = Number(b.dataset.k); saveDecks(); showDeckEditor(); },
  edAuto: () => { autoDeck(); A.sfx.levelUp(); showDeckEditor(); },
  prepHellLock: (b) => lockTip(b, '헬 모드', '이 스테이지를 ★★★로 깨면 열려요'),
  prepFx: () => { const g = app.mode === 'weekly' ? MAP_FX[L.weeklyDef(L.weekIndex()).fx] || MAP_FX.none : app.mode === 'stage' ? stageFx(app.stage) : MAP_FX.none; popup(`<h3>${IC_MAP[g.icon] ? ic(IC_MAP[g.icon], '', 'sm') : ''}${esc(g.name)}</h3><p class="ip">${esc(g.desc || '특별한 효과 없음')}</p>`, 'pp-mini'); },
  prepCond: () => prepCondPopup(),
  prepDiffInfo: () => popup(`<h3>난이도</h3><p class="ip"><b>보통</b> — ${STAGE_WAVES}웨이브. ★은 입구 체력이 많이 남을수록 (70% ★★★ · 35% ★★) · 1-4 부터 ★★★ 은 스테이지 미션도 해야 해요</p><p class="ip"><b>헬</b> — ★★★로 깬 스테이지만. 진상 체력 ×${HELL.hp} · 속도 ×${HELL.speed} · 공격 ×${HELL.atk} · 수 ×${HELL.count} · 보스 분노. 보상 코인 ×${HELL.coin} · 희귀 이상 장비 확정</p>`, 'pp-mini'),
  prepFoe: (b) => {
    const id = b.dataset.id, d = ENEMIES[id]; if (!d) return;
    const T = foeTrait(id), c = CLASSES[d.cls];
    const good = Object.keys(ATTRS).filter((a) => typeMul(a, d.cls) > 1);
    const cnt = T ? T.counter.filter((h) => HEROES[h]).map((h) => esc(heroNm(h))).join(' · ') : '';
    popup(`<div class="pp-fp">${foeFace(id, 'big')}<div><b>${esc(d.name)}</b><small>${c ? `${c.icon} ${c.name}` : ''}${T ? ` · ${T.icon} ${esc(T.name)}` : ''}</small></div></div>
      <p class="pp-tip">${T ? `${esc(T.tip)}${cnt ? ` → <b>${cnt}</b>` : ''}` : `${good.map((a) => `${attrIco(a)}${ATTRS[a].name}`).join(' · ')} 멤버에게 약해요`}</p>
      <button class="chip mini" data-act="info" data-kind="enemy" data-id="${id}">자세히</button>`, 'pp-mini');
  },
  prepRw: () => { const p = P(), s = app.stage, hell = app.hellMode && hellOpen(p.stages, s), r = stageReward(s, 3, hell ? 3 : p.stages[s] | 0); popup(`<h3>${ic('gift', '')} 보상</h3><div class="ilist"><p class="ip">클리어 코인 최대 <b>${fmt(Math.round(r.clear * (hell ? HELL.coin : 1)))}</b>${hell ? ` (헬 ×${HELL.coin})` : ''} · ★ 많을수록 ↑</p>${r.first ? `<p class="ip">첫 클리어 <b>+${fmt(r.first)}</b></p>` : ''}${r.star ? `<p class="ip">새 ★마다 코인 · ★★★까지 <b>+${fmt(r.star)}</b></p>` : ''}${r.mid ? `<p class="ip">중간 보스 처치 <b>+${fmt(r.mid)}</b></p>` : ''}<p class="ip">장비 1개 (★★★면 35%로 1개 더 · 퍼펙트 +1${hell ? ' · 헬 +1 · 희귀 이상' : ''})</p><p class="ip">데려간 멤버 카드 가끔${hell ? ' (헬 ×2)' : ''}</p><p class="ip">기력 ${ic('bolt', '', 'sm')}${L.stageStaminaCost(p, s, hell)} — 실패하면 일부 돌려받아요</p></div>`, 'pp-mini'); },
  prepMore: () => {
    const st = prepStage();
    const cw = st ? stageClasses(st) : {};
    const cls = Object.keys(cw).sort((a, b) => cw[b] - cw[a]).slice(0, 3).map((c) => `${clsTag(c)}<small>${Math.round(cw[c] * 100)}%</small>`).join('');
    popup(`<h3>스테이지 정보</h3>
      ${st && app.mode === 'stage' ? `<p class="story">${ic('book', '', 'sm')}${esc(stageStory(st))}</p>` : ''}
      ${st ? waveRowHtml(st) : ''}
      ${cls ? `<div class="si-cls prep-cls">적 ${cls}</div>` : ''}${st ? traitHintHtml(st) : ''}
      <div class="pp-mbtn"><button class="chip" data-act="nav" data-tab="deck">${ic('duo', '', 'sm')} 덱 화면</button><button class="chip" data-act="nav" data-tab="bag">${ic('hammer', '', 'sm')} 강화·장비</button><button class="chip" data-act="dex">${ic('book', '', 'sm')} 도감</button></div>`, 'pp-more-pop');
  },
  speedTog: () => { app.speed2 = !app.speed2; try { localStorage.setItem('langbang:speed2', app.speed2 ? '1' : '0'); } catch { /* 무시 */ } showPrep(app.mode, app.stage); },
  waveHelp: () => popup(`<h3>${ic('wave', '', 'sm')}웨이브 성격</h3>${['S', 'E', 'M', 'B'].map((k) => `<p class="ip"><b>${WAVE_KINDS[k].icon} ${WAVE_KINDS[k].name}</b> — ${esc(WAVE_KINDS[k].desc)}</p>`).join('')}<p class="ip">한꺼번에 3명 이상 잡으면 <b>트리플! · 5킬! · 싹쓸이!! · 대학살!!!</b> · 계속 잡으면 콤보 경험치 보너스</p>`),
  deckPreset: (b) => { app.deckI = Number(b.dataset.k); app.deckSel = -1; saveDecks(); showPrep(app.mode, app.stage); },
  autoDeck: () => { autoDeck(); A.sfx.levelUp(); toast('상성에 맞춰 덱을 짰어요!', 1400); showPrep(app.mode, app.stage); },
  gearItem: (b) => showGearCard(Number(b.dataset.id)),
  bagPick: (b) => { A.sfx.tap(); showGearCard(Number(b.dataset.id)); }, // 누르면 바로 자세히 (끼기 · 강화 · 합성 · 분해 · 팔기)
  bagTab: (b) => { app.bagTab = b.dataset.v; showBag(); },
  bagSortV: (b) => { app.bagSort = b.dataset.v; showBag(); },
  bagUnsel: () => { app.bagSel = null; showBag(); },
  bagAll: () => { app.bagAll = !app.bagAll; showBag(); },
  autoEquipAll: () => autoEquipAll(),
  bagHeroPick: (b) => { app.bagHero = b.dataset.id; showBag(); },
  hfEquip: async (b) => { const r = await API.equipGear(b.dataset.hero, b.dataset.slot, Number(b.dataset.gid), app.guest); if (r.ok && r.profile) { app.profile = r.profile; A.sfx.pick(); toast('장착!', 900); } else toast(r.message || '못 끼웠어요'); showHeroModal(b.dataset.hero); refreshBehind(); },
  eqSlot: (b) => { if (app.bagSel) equipTo(b.dataset.hero, b.dataset.slot, app.bagSel); else { app.bagHero = b.dataset.hero; showGearPicker(b.dataset.hero, b.dataset.slot); } },
  gearSlot: (b) => showGearPicker(b.dataset.hero, b.dataset.slot),
  eqOpen: (b) => showEquipSheet(b.dataset.hero, b.dataset.slot),
  eqSel: (b) => { const sh = app.eqSheet; if (sh) showEquipSheet(sh.hero, sh.slot, Number(b.dataset.id)); },
  eqDo: (b) => { const sh = app.eqSheet; if (sh) equipMove(sh.hero, sh.slot, Number(b.dataset.id)); },
  eqOff: () => { const sh = app.eqSheet; if (sh) unequip(sh.hero, [sh.slot]); },
  eqUnall: (b) => unequip(b.dataset.hero, ['w', 'a', 'm']),
  eqEnh: (b) => enhanceFx(Number(b.dataset.id)),
  eqLock: (b) => { const set = gearLocked(), id = Number(b.dataset.id); if (set.has(id)) set.delete(id); else set.add(id); lsSave('langbang:gearLock', set); const sh = app.eqSheet; if (sh) showEquipSheet(sh.hero, sh.slot, sh.sel); },
  partner: (b) => {
    const id = b.dataset.id;
    if (!heroOk(id)) { toast(unlockText(id) || '아직 합류하지 않았어요'); return; }
    const n = slotsNow();
    const list = app.partners.slice();
    const i = list.indexOf(id);
    if (i >= 0) { if (list.length > 1) list.splice(i, 1); } else { list.push(id); while (list.length > n) list.shift(); }
    app.partners = list;
    fixPartners();
    A.sfx.card();
    for (const el of ui.querySelectorAll('.pcard[data-id]')) el.classList.toggle('on', app.partners.includes(el.dataset.id));
    const box = $('#pdesc');
    if (box) box.innerHTML = heroInfoHtml(HEROES[id], true);
    const tm = $('#teamline');
    if (tm) tm.innerHTML = teamLine();
  },
  info: (b) => showInfoCard(b.dataset.kind, b.dataset.id),
  dex: () => showDex(),
  dexTab: (b) => { app.dexTab = b.dataset.tab; showDex(); },
  dexRole: (b) => { app.dexRole = b.dataset.v; showDex(); },
  dexKind: (b) => { app.dexKind = b.dataset.v; showDex(); },
  dexCh: (b) => { app.dexCh = Number(b.dataset.v) || 0; showDex(); },
  itemCat: (b) => { app.itemCat = b.dataset.v; showItemDex(); },
  sigEx: () => showSigExchange(),
  sigExDo: (b) => doSigExchange(b.dataset.id),
  itemCard: (b) => showItemCard(b.dataset.id),
  dropTable: () => showDropTable(),
  dexCard: (b) => showDexCard(b.dataset.kind, b.dataset.id),
  skill: (b) => useSkillBtn(Number(b.dataset.slot)),
  aimCancel: () => cancelAim(),
  fxInfo: () => { const g = app.g; if (g) toast(`${g.mapFx.icon} ${g.mapFx.name} — ${g.mapFx.desc}${fxWho(g.mapFx, g)}`, 3200); },
  go: () => { if (app.screen === 'prep' && !curDeck().some(Boolean)) { toast('최소 1명은 데려가야 해요', 1600); A.sfx.tap(); return; } startRun({ mode: app.mode, stage: app.stage }); },
  resumeSnap: () => resumeRun(),
  pick: (b) => tapCard(Number(b.dataset.i)),
  confirmPick: () => { if (app.cardSel >= 0 && performance.now() >= app.cardLockUntil) pickCard(app.cardSel); },
  reroll: () => rerollCards(),
  resume: () => resumeGame(),
  later: () => leaveForLater(),
  quit: () => askQuit(),
  again: () => showPrep(app.mode, app.stage),
  nextStage: () => showPrep('stage', Math.min(STAGE_COUNT, app.stage + 1)),
  buy: (b) => buyUpgrade(b.dataset.id, b),
  buyItem: (b) => buyItemAct(b.dataset.id, b),
};

function heroParade() {
  return ['staff', 'bangjang', 'gunman', 'gunnyeo'].map((id) => av(HEROES[id])).join('');
}

function topbar(back = true, extra = '') {
  return `<div class="topbar">${back ? '<button class="back" data-act="menu">‹ 메뉴</button>' : '<a class="back" href="/">‹ 게임월드</a>'}${extra}</div>`;
}
const coinsPill = () => `<span class="coins-pill"><i class="ci"></i>${P().unlimited ? '∞' : fmt(P().coins || 0)}</span>`;

// ─── 로비 (메인 화면) ─────────────────────────────────
// 뒤에는 데모 전투가 계속 돌고(어둡게), 가운데 챕터 디오라마, 아래 출격 버튼 · 왼쪽 이벤트 · 오른쪽 메뉴 · 맨 아래 탭
const uid = () => API.liveUid();
// ─── 그린 UI 아이콘 (ui2/<이름>.webp) · 없으면 이모지 그대로 ─────
// ic(): 직접 넣을 때 · iconize(): 화면에 붙는 글자 속 이모지를 자동으로 그림으로 (속성·장비 아이콘 · 채팅 · 입력칸은 제외)
const IC_MAP = { '📢': 'megaphone', '📣': 'megaphone', '🃏': 'card_common', '⭐': 'star_gold', '🌟': 'star_gold', '✔': 'check', '✔️': 'check', '📈': 'chart', '🆕': 'badge_new', '📨': 'mail', '📭': 'mail', '🔍': 'target', '🔎': 'target', '🥊': 'swords', '🏁': 'check', '⚠️': 'bolt', 'ℹ️': 'book', '🎨': 'frame', '🍀': 'sparkle', '💡': 'bulb', '👑': 'crown', '⚔️': 'swords', '⚔': 'swords', '🎟️': 'ticket', '🎟': 'ticket', '⏳': 'hourglass', '⌛': 'hourglass', '🔒': 'lock', '🔓': 'unlock', '🔥': 'fire', '🏆': 'trophy', '💎': 'gem', '🪨': 'gem', '📅': 'calendar', '📆': 'calendar', '🐉': 'dragon', '🎁': 'gift', '💡': 'bulb', '🎒': 'bag', '♾️': 'infinity', '♾': 'infinity', '🥇': 'medal1', '🥈': 'medal2', '🥉': 'medal3', '📣': 'megaphone', '📢': 'megaphone', '⚡': 'bolt', '🗡️': 'dagger', '🗡': 'dagger', '🗺️': 'map', '🗺': 'map', '📤': 'share', '🛠️': 'tools', '🛠': 'tools', '🏷️': 'tag', '🏷': 'tag', '🏠': 'home', '💥': 'boom', '🎯': 'target', '✨': 'sparkle', '🧹': 'broom', '⚗️': 'flask', '⚗': 'flask', '📖': 'book', '📚': 'book', '🚪': 'door', '🛒': 'cart', '💍': 'ring', '🖼️': 'frame', '🖼': 'frame', '🛡️': 'shield', '🛡': 'shield', '🔮': 'orb', '🔁': 'retry', '🔊': 'sound', '🔇': 'mute', '👆': 'tap', '✅': 'check', '⚙️': 'gear_set', '⚙': 'gear_set', '🩹': 'heal', '🌊': 'wave', '🎰': 'gacha', '📍': 'pin', '🔨': 'hammer', '👥': 'duo', '📜': 'scroll', '📮': 'mail', '📊': 'chart', '⏰': 'clock', '🧪': 'flask2', '🎉': 'party', '🔑': 'key', '🤖': 'bot', '⚖️': 'scale', '⚖': 'scale', '🎫': 'coupon', '⏱️': 'speed', '⏱': 'speed', '🛍️': 'shop', '🛍': 'shop' };
const IC_RE = new RegExp(Object.keys(IC_MAP).sort((a, b) => b.length - a.length).join('|'), 'gu'); // (이모지엔 정규식 특수문자가 없다)
const icBad = new Set();
// 그림으로 못 바꾼 이모지는 화면 글자에서 지운다 (토스트 · 채팅 · 입력칸 제외) — '이모지 없음' 규칙의 안전망
const EMO_RE = /\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*/gu;
const stripEmo = (t) => t.replace(EMO_RE, '').replace(/  +/g, ' ');
const ic = (name, emoji = '', size = '') => `<img class="ic${size ? ' ' + size : ''}" src="/img/lb/ui2/${name}.webp" alt="${emoji}" draggable="false" onerror="this.replaceWith(document.createTextNode(this.alt))">`;
const IC_SKIP = '.uic, .gico, .aico, .no-ic, .chat, .room-chat, input, textarea, select, canvas, script, style'; // 토스트도 그림으로 (이모지 금지)
function iconize(root) {
  if (!root || root.nodeType !== 1 || (root.closest && root.closest(IC_SKIP))) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => { IC_RE.lastIndex = 0; EMO_RE.lastIndex = 0; if (!IC_RE.test(n.nodeValue) && !EMO_RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT; return n.parentElement && n.parentElement.closest(IC_SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; } });
  const list = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) list.push(n);
  for (const n of list) {
    const frag = document.createDocumentFragment();
    let last = 0; const t = n.nodeValue;
    IC_RE.lastIndex = 0;
    for (let m = IC_RE.exec(t); m; m = IC_RE.exec(t)) {
      const name = IC_MAP[m[0]];
      if (icBad.has(name)) continue;
      if (m.index > last) frag.appendChild(document.createTextNode(stripEmo(t.slice(last, m.index))));
      const img = document.createElement('img');
      img.className = 'ic'; img.src = `/img/lb/ui2/${name}.webp`; img.alt = m[0]; img.draggable = false;
      img.onerror = () => { icBad.add(name); img.replaceWith(document.createTextNode(m[0])); };
      frag.appendChild(img);
      last = m.index + m[0].length;
    }
    if (last === 0) { const s2 = stripEmo(t); if (s2 !== t) n.nodeValue = s2; continue; }
    if (last < t.length) frag.appendChild(document.createTextNode(stripEmo(t.slice(last))));
    n.replaceWith(frag);
  }
}
// 무대에 붙는 모든 화면·팝업·배너를 자동으로 (글자만 바뀐 곳도)
new MutationObserver((ms) => { for (const m of ms) for (const nd of m.addedNodes) { if (nd.nodeType === 1) iconize(nd); else if (nd.nodeType === 3 && nd.parentElement) iconize(nd.parentElement); } })
  .observe(stage, { childList: true, subtree: true });
function uiIco(name, emoji, cls = '') {
  // 그림이 없으면 이모지 대신 ui2 아이콘 (그것도 없으면 빈칸)
  const alt = IC_MAP[emoji] || IC_MAP[emoji + '️'] || IC_MAP[emoji.replace('️', '')];
  return `<span class="uic ${cls}"><img src="/img/lb/ui/${name}.webp" alt="" draggable="false" onerror="${alt ? `this.onerror=function(){this.parentNode.classList.add('noimg');this.remove()};this.src='/img/lb/ui2/${alt}.webp'` : `this.parentNode.classList.add('noimg');this.remove()`}"><em></em></span>`;
}
const rdot = (on) => (on ? '<i class="rd"></i>' : '');
function lobbyStage() {
  if (!app.lobbyStage || !stageUnlocked(app.lobbyStage)) app.lobbyStage = nextStage();
  return app.lobbyStage;
}
// 할 일: 지금 할 수 있는 것 (위에서 세 개) — 누르면 바로 그 자리로
function todoList() {
  const p = P(), now = Date.now(), out = [];
  const mail = L.mailCount(p); if (mail) out.push({ txt: `우편 ${mail}통 받기`, ic: 'mail', go: 'mail' });
  const frb = FRX.badge(p); if (frb) out.push({ txt: `친구 소식 ${frb}개 (선물 · 요청)`, ic: 'gift', go: 'friends' });
  const bkt = BKX.todo(p); if (bkt) out.push(bkt); // 본캐 출연료
  const mis = L.claimable(p, uid(), now); if (mis) out.push({ txt: `미션 보상 ${mis}개 받기`, ic: 'scroll', go: 'missions' });
  if (!L.checkinState(p, now).done) out.push({ txt: '오늘 출석 체크', ic: 'calendar', go: 'checkin' });
  const tier = L.seasonTier(p); if (p.season && Array.from({ length: tier }, (_, i) => i + 1).some((t) => !p.season.claimed.includes(t))) out.push({ txt: '시즌 보상 받기', ic: 'trophy', go: 'season' });
  const up = owned().find((h) => { const c = API.costOf(p, h); const lv = p.heroes[h] | 0; return c !== null && c !== undefined && (p.coins | 0) >= c && ((p.shards || {})[h] | 0) + (p.wild | 0) >= heroCardNeed(lv); });
  if (up) out.push({ txt: `${HEROES[up].name} 강화할 수 있어요`, ic: 'hammer', go: 'hero', id: up });
  const deck = [...new Set((curDeck() || []).filter(Boolean))];
  for (const h of deck) { const k = ['w', 'a'].find((s) => { const cur = (p.gear || []).find((x) => x.id === ((p.equip || {})[h] || {})[s]); return (p.gear || []).some((it) => GEAR[it.t].slot === s && !equippedBy(p, it.id) && (!cur || gearScore(it) > gearScore(cur) + 1e-9)); }); if (k) { out.push({ txt: `${HEROES[h].name}에게 더 좋은 ${k === 'w' ? '무기' : '장신구'}`, ic: 'swords', go: 'gear', id: h, slot: k }); break; } }
  if ((p.tickets | 0) > 0) out.push({ txt: `모집권 ${p.tickets | 0}장 쓰기`, ic: 'ticket', go: 'recruit' });
  return out;
}
function todoGo(t) {
  closeInfoCard();
  if (t.go === 'mail') ACTS.mail();
  else if (t.go === 'friends') FRX.showFriends(L.giftInbox(P()).length ? 'gifts' : 'req');
  else if (t.go === 'bonkae') BKX.showFees();
  else if (t.go === 'missions') { const p = P(), now = Date.now(); const v = L.missionView(p, uid(), now); app.misTab = ['daily', 'weekly', 'ach'].find((k) => v[k].some((m) => !m.done && m.have >= m.n)) || app.misTab; showMissions(); setTimeout(() => { const b = document.querySelector('[data-act="claimMis"]:not([disabled])'); if (b) { b.scrollIntoView({ block: 'center', behavior: 'smooth' }); b.closest('.ms-row, div').classList.add('todo-hl'); } }, 60); }
  else if (t.go === 'checkin') showCheckin();
  else if (t.go === 'season') { showSeason(); setTimeout(() => { const b = document.querySelector('[data-act="claimSeason"]:not([disabled]):not([data-t="all"])'); if (b) b.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 60); }
  else if (t.go === 'hero') { app.hmTab = 'up'; showHeroModal(t.id); }
  else if (t.go === 'gear') { app.bagTab = 'over'; app.bagHero = t.id; showBag(); setTimeout(() => showEquipSheet(t.id, t.slot), 80); }
  else if (t.go === 'recruit') { app.shopTab = 'recruit'; showShop(); }
}
// 누르는 것마다 짧은 소리 (종류별로 다르게 · 소리 끄기 따름 · 너무 자주면 한 번만)
const TAP_SEL = 'button, [data-act], .acard, .mn, .chd, .pill, .tile, .rb, .nv, .card, .sk, .chest, [data-hf], [data-ib], [data-c]';
const TAP_GOLD = '.btn.primary, .pv-cta, .pp-gobtn2, .gate-btn, .lb-start, .hf-auto, .room-row em';
stage.addEventListener('pointerdown', (ev) => {
  if (document.body.classList.contains('rm')) return;
  const el = ev.target.closest(TAP_SEL);
  if (!el || el.disabled || el.closest('canvas')) return;
  const sr = stage.getBoundingClientRect();
  const r = document.createElement('i');
  r.className = 'tap-rip' + (el.matches(TAP_GOLD) || el.closest(TAP_GOLD) ? ' gold' : '');
  r.style.left = (ev.clientX - sr.left) + 'px'; r.style.top = (ev.clientY - sr.top) + 'px';
  stage.appendChild(r); setTimeout(() => r.remove(), 450);
}, { passive: true, capture: true });
function tapSpark(el, n = 8) {
  if (!el || document.body.classList.contains('rm') || !el.getBoundingClientRect) return;
  const sr = stage.getBoundingClientRect(), a = el.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const s = document.createElement('i'); s.className = 'tap-spark';
    const ang = (i / n) * Math.PI * 2, d = 28 + Math.random() * 22;
    s.style.left = (a.left - sr.left + a.width / 2) + 'px'; s.style.top = (a.top - sr.top + a.height / 2) + 'px';
    s.style.setProperty('--dx', Math.cos(ang) * d + 'px'); s.style.setProperty('--dy', Math.sin(ang) * d + 'px');
    stage.appendChild(s); setTimeout(() => s.remove(), 520);
  }
}
function tapDeny(el) { if (!el || !el.classList) return; el.classList.remove('tap-no'); void el.offsetWidth; el.classList.add('tap-no'); setTimeout(() => el.classList.remove('tap-no'), 420); }
function uiSound(act, el) {
  if (/^(menu|back|toLobby)$/.test(act) || (el && el.classList && el.classList.contains('back'))) app._goBack = true;
  if (act === 'nav') app._goTab = true;
  if (el && /^(go|lbGo|pull|buy|staBuy|eqDo|doCheckin|confirm|pvpQuick|mapNode)/.test(act)) tapSpark(el, 8);
  if (el && /^(claim|mailGet|claimAll|claimSeason|chest)/.test(act)) { tapSpark(el, 10); if (!el.classList.contains('lock') && !el.classList.contains('open')) setTimeout(() => coinFly(el, 5), 150); }
  if (!act) return;
  if (/^(go|lbGo|pull|buy|staBuy|eqDo|doCheckin|prepEdit|edPick|confirm)/.test(act)) A.sfx.confirm();
  else if (/^(claim|mailGet|claimAll|claimSeason)/.test(act)) A.sfx.reward();
  else if (/^(menu|back|toLobby|weekly$)/.test(act)) A.sfx.back();
  else if (/Tab$|^nav$|^tab|^dexTab|^dexRole|^dexKind|^dexCh|^itemCat|^bagTab|^shopTab|^misTab|^edF|^edSort|^prepSheetF/.test(act)) A.sfx.tabSw();
  else A.sfx.tap();
}
// 잠김 안내: 누른 자리 위에 작은 자물쇠 말풍선 (토스트 대신)
function lockTip(b, title, sub) {
  A.sfx.deny(); tapDeny(b);
  for (const o of stage.querySelectorAll('.lock-tip')) o.remove();
  const r = b.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const t = document.createElement('div');
  t.className = 'lock-tip';
  t.innerHTML = `${ic('lock', '', 'sm')}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span>`;
  stage.appendChild(t);
  const w = t.offsetWidth;
  t.style.left = Math.max(8, Math.min(sr.width - w - 8, r.left - sr.left + r.width / 2 - w / 2)) + 'px';
  t.style.top = Math.max(8, r.top - sr.top - t.offsetHeight - 8) + 'px';
  setTimeout(() => t.classList.add('out'), 1800); setTimeout(() => t.remove(), 2100);
}
// 이호찬 컷인: 얼굴 카드 + 금빛 빛줄기 (0.9초)
function grandCutIn() {
  const d = document.createElement('div');
  d.className = 'grand-cut';
  d.innerHTML = `<i class="gc-rays"></i><div class="gc-card"><img src="${hqSrc('hochan') || HEROES.hochan.img}" alt="" draggable="false"><b>막차 대행진</b><small>LEGEND · 이호찬</small></div>`;
  stage.appendChild(d);
  setTimeout(() => d.classList.add('out'), 850); setTimeout(() => d.remove(), 1150);
}
function showTodo() {
  const list = todoList();
  popup(`<h3>할 일</h3><div class="todo-list">${list.map((t, i) => `<button class="todo-row" data-act="todoGo" data-i="${i}">${ic(t.ic, '', '')}<span>${esc(t.txt)}</span><i class="todo-go">›</i></button>`).join('') || '<p class="ip">지금은 할 일이 없어요. 출격해 볼까요?</p>'}</div>`, 'pp-mini todo-pop');
}
// 빨간 점: 받을 게 있는 곳
function dots() {
  const p = P();
  const now = Date.now();
  const mis = L.claimable(p, uid(), now);
  const tier = L.seasonTier(p);
  const season = p.season && Array.from({ length: tier }, (_, i) => i + 1).some((t) => !p.season.claimed.includes(t));
  const wk = (p.maxStage | 0) >= L.WEEKLY_UNLOCK && !(p.weekly && p.weekly.wi === L.weekIndex(now) && p.weekly.runs > 0);
  const members = Object.keys(HEROES).some((h) => API.heroUnlocked(p, h) && L.heroStar(p, h) < L.STAR_MAX && (p.shards[h] | 0) >= L.STAR_SHARDS[L.heroStar(p, h)]);
  const upg = owned().some((h) => { const c = API.costOf(p, h); const lv = p.heroes[h] | 0; return c !== null && c !== undefined && (p.coins | 0) >= c && lv < 5 && ((p.shards || {})[h] | 0) + (p.wild | 0) >= heroCardNeed(lv); });
  const gearBetter = (() => { const ids = [...new Set((curDeck() || []).filter(Boolean))]; return ids.some((h) => ['w', 'a'].some((k) => { const cur = (p.gear || []).find((x) => x.id === ((p.equip || {})[h] || {})[k]); return (p.gear || []).some((it) => GEAR[it.t].slot === k && !equippedBy(p, it.id) && (!cur || gearScore(it) > gearScore(cur) + 1e-9)); })); })();
  return { missions: mis > 0, season, weekly: wk, checkin: !L.checkinState(p, now).done, recruit: (p.tickets | 0) > 0, members, shop: (p.tickets | 0) > 0, deck: members || upg, bag: gearBetter };
}
function navHtml(on) {
  const d = dots();
  const tabs = [['shop', '상점', ''], ['deck', '강화', ''], ['battle', '전투', ''], ['bag', '장비', ''], ['pvp', '대전', '']];
  return `<nav class="lb-nav">${tabs.map(([k, n, e]) => `<button class="nv ${k === on ? 'on' : ''} ${k === 'battle' ? 'mid' : ''}" data-act="nav" data-tab="${k}">${uiIco(k === 'deck' ? 'members' : k, e)}<b>${n}</b>${rdot(d[k])}</button>`).join('')}</nav>`;
}
// ─── 칭호 · 프레임 (보이기만 · 능력치 없음) ─────
const titleChip = (id) => { const n = id ? L.titleName(id) : ''; return n ? `<u class="tchip r-${L.cosmeticRarity('title', id)}">${esc(n)}</u>` : ''; };
const frameCls = (id) => (id && L.FRAMES[id] ? `fr r-${L.FRAMES[id].rarity} fr-${id} ` : ''); // fr-<id>: 움직이는 프레임 (진상의 탑 불꽃 · 황금 지옥)
const frameStyle = (id) => (id && L.FRAMES[id] ? `--fr:${L.FRAMES[id].color}` : '');
// 이름 + 칭호 (랭킹 · 방 목록 · 대전 · 선수 카드에서 같이 쓴다)
const whoHtml = (nick, title, extra = '') => `<span class="who2"><b>${esc(nick || '')}</b>${titleChip(title)}${extra}</span>`;
// 체력 표시 (다음 1칸까지 남은 시간)
function staText(p) { const s = L.staminaNow(p, Date.now()); return `${s.v}/${L.STAMINA.max}${s.next ? `<small>${Math.floor(s.next / 60000)}:${String(Math.floor((s.next % 60000) / 1000)).padStart(2, '0')}</small>` : ''}`; }
setInterval(() => { const el = document.getElementById('staV'); if (el && el.isConnected) el.innerHTML = staText(P()); }, 1000);
function showStamina(msg) {
  const p = P(), s = L.staminaNow(p, Date.now()), day = L.dayIndex();
  const n = p.staBuy && p.staBuy.day === day ? p.staBuy.n : 0, left = L.STAMINA.buy.perDay - n, cost = L.STAMINA.buy.cost[n];
  popup(`<h3>${ic('bolt', '', 'sm')}체력 ${msg ? '부족!' : ''}</h3>${msg ? `<p class="ip">${esc(msg)}</p>` : ''}
    <p class="ip big-got">${s.v} / ${L.STAMINA.max}${s.v > L.STAMINA.max ? ' (넘침)' : ''}</p>
    <p class="ip">${Math.round(L.STAMINA.regenMs / 60000)}분마다 1씩 차요${s.next ? ` · 다음까지 ${Math.ceil(s.next / 60000)}분` : ' · 가득!'}</p>
 <div class="ilist"><p class="ip">${ic('map', '', 'sm')} 스테이지 ${L.STAMINA.stage} · 이미 ★★★ 스테이지 ${L.STAMINA.repeat} · ${ic('fire', '', 'sm')}헬 ${L.STAMINA.hell} · 실패하면 절반 돌려받기</p>
 <p class="ip">${ic('calendar', '', 'sm')} 출석 +${L.STAMINA.checkin} · 계정 레벨 업 +${L.STAMINA.lvUp} · 무한 · 레이드 · 1:1 대전은 체력을 안 써요</p></div>
    <button class="btn ${left > 0 && p.coins >= cost ? 'primary' : ''}" data-act="staBuy" ${left > 0 ? '' : 'disabled'}>${ic('bolt', '', 'sm')}+${L.STAMINA.buy.n} 사기 · ${left > 0 ? `<i class="ci"></i>${fmt(cost)}` : '오늘 끝'} <small>(오늘 ${left}/${L.STAMINA.buy.perDay})</small></button>`, 'sta-pop');
}
// 우편함
function showMail() {
  const p = P(), now = Date.now();
  const list = (p.mail || []).filter((m) => m.exp > now).slice().reverse();
  const safe = (rw) => { try { return gotText(rw) || ''; } catch { return ''; } }; // 보상 글자가 깨져도 우편함은 열린다
  const rows = list.map((m) => `<div class="mail-row"><div><b>${esc(m.title)}</b>${m.from ? `<i class="mail-from">보낸 사람 ${esc(m.from)}</i>` : ''}<small>${esc(m.text)} · ${Math.max(1, Math.ceil((m.exp - now) / 86400e3))}일 남음</small><em>${esc(safe(m.rw))}</em></div><button class="btn mini primary" data-act="mailGet" data-id="${m.id}">받기</button></div>`).join('');
  popup(`<h3>${ic('mail', '', 'sm')}우편함</h3>${list.length > 1 ? `<button class="btn primary" data-act="mailGet" data-id="all">${ic('gift', '', 'sm')}모두 받기 (${list.length})</button>` : ''}
    <div class="mail-list">${rows || '<div class="empty-msg">받을 우편이 없어요</div>'}</div><p class="ip">보상 우편은 ${L.MAIL_DAYS}일 뒤 사라져요</p>`, 'mail-pop');
}
// 모드별 보상 안내
const REWARD_INFO = {
  pvpTiers: () => `<h3>1:1 대전 등급 보상</h3><p class="ip">처음 오른 등급마다 한 번씩 우편으로 와요</p><div class="tier-rw">${L.PVP_TIER_LADDER.map(([min, name, rw]) => `<div class="trw">${tierEmb(min, 'sm')}<span><b>${esc(name)}</b><small>${min}점</small></span><em>${gotText({ coins: rw.coins, tickets: rw.tickets })}${rw.gear ? ' · 장비' : ''}</em></div>`).join('')}</div>`,
  endless: () => { const p = P(), left = L.endlessLeft(p); return `<h3>${ic('infinity', '', 'sm')}무한 도전 보상</h3><p class="ip">오늘 남은 도전 <b>${p.master && !p.testNormal ? '∞' : left}/${L.ENDLESS.perDay}</b> (아침 5시 초기화)</p><div class="ilist">${L.ENDLESS.miles.map((w) => `<p class="ip">${ic('check', '', 'sm')}${w}웨이브 첫 달성(주마다) — ${esc(gotText(L.milestoneReward(w)))}${p.ew && p.ew.wi === L.weekIndex() && p.ew.miles.includes(w) ? '' : ''}</p>`).join('')}</div><p class="ip">웨이브 코인은 하루 ${fmt(L.ENDLESS.coinCap)}까지 · 주간 점수 순위: 1위 ${esc(gotText(L.endlessWeekReward(1)))} · 2~3위 영웅 장비 · TOP10 모집권 ${L.endlessWeekReward(4).tickets} · 참가 보상 (우편함)</p>`; },
  pvp: () => { const p = P(), day = L.dayIndex(), d = p.pvpDay && p.pvpDay.day === day ? p.pvpDay : { n: 0, won: false }; return `<h3>${ic('swords', '', 'sm')}1:1 대전 보상</h3><p class="ip">오늘 보상 판 <b>${Math.max(0, L.PVP_REWARD.perDay - d.n)}/${L.PVP_REWARD.perDay}</b> 남음 ${d.won ? '' : '· 첫 승 2배 남음'}</p><div class="ilist"><p class="ip">승리 ${L.PVP_REWARD.win}코인 · 패배 ${L.PVP_REWARD.lose}코인 (보상 판이 끝나면 점수만)</p><p class="ip">30초 안에 끝난 판 · 같은 상대 하루 ${L.PVP_REWARD.sameOpp}판 넘게는 보상 없음</p>${L.PVP_TIER_LADDER.map(([min, name, rw]) => `<p class="ip">${ic('trophy', '', 'sm')}${name} (${min}점) 첫 달성 — ${esc(gotText(rw))}${(p.pvpTiers || []).includes(min) ? '' : ''}</p>`).join('')}</div>`; },
  raid: () => `<h3>${ic('dragon', '', 'sm')}레이드 보상</h3><div class="ilist"><p class="ip">참가: 코인 · 보스 체력을 깎은 만큼 (50% 넘으면 모집권)</p><p class="ip">처치 성공: 모두 코인 2,000 + 기여도 · 1위 전설 장비 + 칭호 "레이드 MVP"· 2~3위 영웅 장비 · TOP10 모집권</p><p class="ip">한 판마다 ${ic('gem', '', 'sm')}강화석 2</p></div>`,
};
// 증강: 셋 중 하나 (15초면 첫 번째) · 등급 빛 · 뒤집히며 등장
const augBox = document.createElement('div');
augBox.className = 'aug-box';
augBox.addEventListener('click', (ev) => { const b = ev.target.closest('[data-aug]'); if (b && app.g && S.applyAug(app.g, b.dataset.aug)) { handleEvents(app.g, true); A.sfx.pick(); } });
const AUG_FX_IC = { dmg: 'swords', spd: 'bolt', hp: 'shield', exp: 'book', crit: 'path_crit', cd: 'speed', swarm: 'path_boom', splash: 'path_boom', boss: 'target', slow: 'path_cc', ctrl: 'path_cc', path: 'path_chain', ult: 'megaphone', echo: 'retry' };
function augIcon(a) {
  if (a.hero && HEROES[a.hero]) return pimg(HEROES[a.hero].img, 'face');
  const k = Object.keys(a.fx || {}).find((x) => AUG_FX_IC[x]);
  return pimg(ui2(k ? AUG_FX_IC[k] : iconName(a.icon, a.desc)));
}
const AUG_TXT = { dmg: '공격력', spd: '공격 속도', crit: '치명타', critMul: '치명타 피해', boss: '보스 피해', swarm: '일반 진상 피해', exp: '경험치' };
function augRealDesc(a) { // 스테이지는 강화 수준에 따라 효과가 줄어든다 → 실제 값을 보여 준다
  const g = app.g; if (!g || a.hero) return a.desc;
  const k = S.augScale(g), parts = [];
  for (const [kk, v] of Object.entries(a.fx || {})) { if (AUG_TXT[kk]) parts.push(`${AUG_TXT[kk]} +${(v * k * 100).toFixed(1)}%`); }
  const rest = a.desc.split(' · ').filter((x) => !Object.values(AUG_TXT).some((n) => x.startsWith(n) || x.startsWith('모든 멤버 ' + n)));
  return [...parts, ...rest].join(' · ') || a.desc;
}
function showAugOffer(opts, tier) {
  augBox.className = 'aug-box v4 t-' + tier;
  augBox.innerHTML = `<div class="ab-head">${pimg(ui2(tier === 'prism' ? 'prism' : 'aug_card'), 'crest')}<b>증강 선택</b><span class="ab-tier">${TIER_NAMES[tier]}</span><small><em id="abT">15</em>초</small></div><div class="ab-list">${opts.map((id, i) => { const a = S.augDef(id); return `<button class="ab-card t-${a.tier}" data-aug="${id}" style="--i:${i}"><span class="ab-ico">${augIcon(a)}</span><b>${esc(a.title)}</b><small>${esc(augRealDesc(a))}</small></button>`; }).join('')}</div>`;
  if (!augBox.isConnected) stage.appendChild(augBox);
  A.sfx.card && A.sfx.card();
}
setInterval(() => { const g = app.g, t = document.getElementById('abT'); if (g && g.augOffer && t) t.textContent = Math.ceil(g.augOffer.t); if ((!g || !g.augOffer) && augBox.isConnected) augBox.remove(); }, 250);
// 무한 저주 계약: 셋 중 하나 (10초 안에 안 고르면 아무거나)
const curseBox = document.createElement('div');
curseBox.className = 'curse-box';
curseBox.addEventListener('click', (ev) => { const b = ev.target.closest('[data-curse]'); if (b && app.g && S.applyCurse(app.g, b.dataset.curse)) { handleEvents(app.g, true); A.sfx.pick(); } });
function showCurseOffer(opts) {
  curseBox.innerHTML = `<div class="cb-head"><b>${ic('scroll', '', 'sm')}저주 계약</b><small>하나는 꼭 골라요 · <em id="cbT">10</em>초 뒤 아무거나</small></div><div class="cb-list">${opts.map((id) => { const c = CURSES[id]; return `<button class="cb-card" data-curse="${id}"><span class="cb-ico">${c.icon}</span><b>${esc(c.name)}</b><small class="bad">${esc(c.desc)}</small><small class="good">${ic('gift', '', 'sm')}${esc(c.up)}</small></button>`; }).join('')}</div>`;
  if (!curseBox.isConnected) stage.appendChild(curseBox);
}
function closeCurseOffer() { if (curseBox.isConnected) curseBox.remove(); }
setInterval(() => { const g = app.g, t = document.getElementById('cbT'); if (g && g.curseOffer && t) t.textContent = Math.ceil(g.curseOffer.t); if ((!g || !g.curseOffer) && curseBox.isConnected) closeCurseOffer(); }, 250);
function topPills() {
  const p = P();
  const expPct = p.expToNext ? Math.round((p.exp / p.expToNext) * 100) : 0;
  const fr = p.frame && L.FRAMES[p.frame] ? L.FRAMES[p.frame].color : '';
  const title = p.title ? L.titleName(p.title) : '';
  return `<div class="lb-top">
    <button class="pill me" data-act="cosmetics" style="${fr ? `--fr:${fr}` : ''}"><span class="ava ${fr ? 'framed ' + frameCls(p.frame) : ''}">${av(HEROES.bangjang)}</span>
      <span class="who"><b>${app.guest ? '손님' : `Lv.${p.level}`}</b><em>${esc(app.guest ? '로그인하면 랭킹 등록' : app.nickname || '랑방 멤버')}</em>${titleChip(p.title)}<i class="xp"><b style="width:${app.guest ? 0 : expPct}%"></b></i></span></button>
    <div class="curs">${p.master && !p.testNormal ? '' : `<button class="pill cur sta ${L.staminaNow(p, Date.now()).v > L.STAMINA.max ? 'over' : ''}" data-act="stamina">${ic('energy', '', 'sm')}<b id="staV">${staText(p)}</b></button>`}<span class="pill cur"><i class="ci"></i><b>${p.unlimited ? '∞' : fmt(p.coins || 0)}</b></span><button class="pill cur tk" data-act="nav" data-tab="shop">${ic('ticket', '', 'sm')}<b>${p.unlimited ? '∞' : fmt(p.tickets || 0)}</b><em class="plus" aria-label="모집권 사러 가기"></em></button></div>
  </div>`;
}
// 로비 랭킹 띠: 스테이지 · 1:1 대전 · 주간 도전 순위를 4초마다 돌아가며 (누르면 전체 랭킹)
const rankTicker = { at: 0, lines: [], i: 0, t: 0 };
async function loadRankTicker() {
  if (Date.now() - rankTicker.at < 60000 && rankTicker.lines.length) return;
  rankTicker.at = Date.now();
  const [st, pv, wk] = await Promise.all([API.loadRanking('stage').catch(() => null), API.pvpRanking().catch(() => null), API.weeklyBoard().catch(() => null)]);
  const top = (list, f) => (list || []).slice(0, 3).map((r, i) => `${i + 1}위 ${esc(r.nickname)} ${f(r)}`).join(' · ');
  const lines = [];
  if (st && st.ranking.length) lines.push(`스테이지 — ${top(st.ranking, (r) => `${r.stageLabel} ★${r.totalStars}`)}${st.me && st.me.rank ? ` · 내 순위 ${st.me.rank}위` : ''}`);
  if (pv && pv.ranking.length) lines.push(`1:1 대전 — ${top(pv.ranking, (r) => `${r.rating}점`)}`);
  if (wk && wk.board && wk.board.length) lines.push(`주간 도전 — ${top(wk.board, (r) => fmt(r.best))}${wk.me && wk.me.rank ? ` · 내 순위 ${wk.me.rank}위` : ''}`);
  if (!lines.length) lines.push('아직 랭킹이 비었어요 — 1등 할 기회!');
  rankTicker.lines = lines;
}
// 로비 소식 띠 (한 줄): 할 일(우편 · 미션 보상 · 출석 …) 다음에 랭킹 — 4초마다 넘어가고 좌우로 밀어도 넘어간다
//  누르면 할 일 목록(todo) / 전체 랭킹(ranking)
function newsItems() {
  let td = [];
  try { td = app.profileLoaded ? todoList() : []; } catch { td = []; }
  return [...td.map((t) => ({ html: `${ic(t.ic, '', 'sm')}${esc(t.txt)}`, act: 'todo', hot: true })),
    ...rankTicker.lines.map((l) => ({ html: `${ic('trophy', '', 'sm')}${l}`, act: 'ranking' }))];
}
function newsInner(it, n, rev) { return `<span class="nw-txt"><span class="rk-in${rev ? ' rev' : ''}">${it.html}</span></span>${n > 1 ? `<i class="nw-pg">${(rankTicker.i % n) + 1}/${n}</i>` : ''}`; }
function newsFirst() { const items = newsItems(); if (!items.length) return ''; rankTicker.i %= items.length; const it = items[rankTicker.i]; return `<button class="lb-news ${it.hot ? 'hot' : ''}" data-act="${it.act}" id="lbRank" aria-label="소식">${newsInner(it, items.length)}</button>`; }
function tickRank(step = 1) {
  let next = 4000;
  try {
    const el = document.getElementById('lbRank');
    if (!el || app.screen !== 'menu') return;
    const items = newsItems();
    if (!items.length) { el.hidden = true; return; }
    el.hidden = false;
    rankTicker.i = (((rankTicker.i + step) % items.length) + items.length) % items.length;
    const it = items[rankTicker.i];
    el.dataset.act = it.act; el.classList.toggle('hot', !!it.hot);
    el.innerHTML = newsInner(it, items.length, step < 0);
    // 한 줄에 다 안 들어가면: 잠깐 멈췄다가 끝까지 부드럽게 흘러간다 (잘리지 않게)
    const box = el.firstElementChild, sp = box.firstElementChild, over = sp.scrollWidth - box.clientWidth + 12;
    if (over > 8) { const sec = Math.max(3, over / 38); sp.classList.add('mq'); sp.style.setProperty('--mq', `-${over}px`); sp.style.setProperty('--mqs', `${sec + 1.6}s`); next = (sec + 2.8) * 1000; }
  } finally { clearTimeout(tickRank.t); tickRank.t = setTimeout(tickRank, next); }
}
tickRank.t = setTimeout(tickRank, 4000);
// 소식 띠 좌우로 밀기 → 다음 / 이전 소식 (미는 건 누르기 아님)
let newsSw = null;
ui.addEventListener('pointerdown', (ev) => { const n = app.screen === 'menu' && ev.target.closest('#lbRank'); newsSw = n ? { x0: ev.clientX, y0: ev.clientY } : null; });
ui.addEventListener('pointerup', (ev) => {
  if (!newsSw) return;
  const dx = ev.clientX - newsSw.x0, dy = ev.clientY - newsSw.y0; newsSw = null;
  if (Math.abs(dx) < 28 || Math.abs(dy) > Math.abs(dx)) return;
  ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 60);
  A.sfx.tabSw(); tickRank(dx < 0 ? 1 : -1);
});
setInterval(() => { if (app.screen === 'menu' && app.profileLoaded && document.visibilityState === 'visible') Promise.resolve(API.mailSync(app.guest)).then((r) => { if (r && r.ok && r.profile) { const before = (P().mail || []).length; app.profile = r.profile; if ((r.profile.mail || []).length > before) { toast('우편이 도착했어요!', 2200); if (app.screen === 'menu') showMenu(); } } }).catch(() => {}); }, 180e3);
// 로비 버튼 그림: 새 그림(ui2/<name>.webp)이 없으면 비슷한 그림으로
const lbArt = (name, alt) => `<span class="uic"><img src="/img/lb/ui2/${name}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='/img/lb/ui2/${alt}.webp'"></span>`;
// 빨간 점 모으기: 도전(모드) 버튼 · 메뉴 버튼
function lobbyModeDot(p, d, now) {
  const rs = L.raidState(now);
  const tw = TWUI ? TWUI.lobbyButton(p).includes('class="rd"') : false;
  return !!(d.weekly || d.season || tw || (rs.open && !(p.raid && p.raid.wi === rs.wi && p.raid.runs)));
}
function lobbyMenuDot(p, d) { return !!(d.checkin || dexHasNew() || FRX.badge(p) > 0 || BKX.dot(p)); }
// 도전 고르기 창: 진상의 탑 · 주간 도전 · 무한 도전 · 레이드 · 1:1 대전 · 시즌 (남은 시간 · 기록 · 빨간 점)
function showModes() {
  const p = P(), now = Date.now(), d = dots();
  const wkOpen = (p.maxStage | 0) >= L.WEEKLY_UNLOCK, rs = L.raidState(now), rl = L.raidLabel(now);
  const pvpN = (p.pvp && p.pvp.rating) || 1000;
  const card = (act, art, name, desc, info, { locked = false, hot = false, dot = false } = {}) => `<button class="md-card ${locked ? 'locked' : ''} ${hot ? 'hot' : ''}" data-act="${act}">${art}<span class="md-t"><b>${name}</b><small>${desc}</small></span><em class="md-i">${info}</em>${locked ? `<i class="md-lock">${ic('lock', '', 'sm')}</i>` : ''}${rdot(dot)}</button>`;
  const cards = [
    card('weekly', uiIco('weekly', ''), '주간 도전', '한 주 최고 점수 겨루기', wkOpen ? `${ic('clock', '', 'sm')}${L.leftText(L.msToWeekEnd(now))} 남음` : `${stageLabel(L.WEEKLY_UNLOCK)} 클리어`, { locked: !wkOpen, dot: d.weekly }),
    card('endless', lbArt('infinity', 'infinity'), '무한 도전', '끝없는 웨이브 버티기', p.endlessUnlocked ? `최고 W${p.bestWave || 0} · 오늘 ${p.master && !p.testNormal ? '∞' : L.endlessLeft(p)}/${L.ENDLESS.perDay}` : `${stageLabel(ENDLESS_UNLOCK)} 클리어`, { locked: !p.endlessUnlocked }),
    card('raid', uiIco('raid', ''), '레이드', '다 같이 거대 보스 잡기', `${ic('clock', '', 'sm')}${esc(rl.text)}`, { hot: rs.open, dot: rs.open && !(p.raid && p.raid.wi === rs.wi && p.raid.runs) }),
    card('pvp', uiIco('pvp', ''), '1:1 대전', '실시간으로 겨루기', `${pvpN}점`),
    card('season', uiIco('season', ''), '시즌', '단계마다 시즌 보상', `${L.seasonTier(p)}/${L.SEASON_TIERS}단계`, { dot: d.season }),
  ].join('');
  const m = popup(`<h3>${lbArt('lobby_mode', 'swords').replace('class="uic"', 'class="uic h3i"')}도전</h3><div class="md-feat">${TWUI ? TWUI.lobbyButton(p) : ''}</div><div class="md-grid">${cards}</div>`, 'lb-sheet md-sheet');
  lobbySheetClose(m);
}
// 메뉴 창: 출석 · 랭킹 · 도감 · 친구 · 모집 · 공유 · 공지 · 설정
function showLobbyMenu() {
  const p = P(), d = dots();
  const IC2 = { notice: 'megaphone', friends: 'ic_friends' };
  const cells = [['checkin', '출석', 'checkin', d.checkin], ['ranking', '랭킹', 'ranking', BKX.dot(p)], ['dex', '도감', 'dex', dexHasNew()], ['friends', '친구', 'friends', FRX.badge(p) > 0], ['recruit', '모집', 'recruit', d.recruit], ['share', '공유', 'share', false], ['notice', '공지', 'notice', false], ['settings', '설정', 'settings', false]]
    .map(([k, n, act, on]) => `<button class="mg-cell" data-act="${act}">${IC2[k] ? lbArt(IC2[k], IC2[k]) : uiIco(k, '')}<b>${n}</b>${rdot(on)}</button>`).join('');
  const m = popup(`<h3>${lbArt('lobby_menu', 'tools').replace('class="uic"', 'class="uic h3i"')}메뉴</h3><div class="mg-grid">${cells}</div>`, 'lb-sheet mg-sheet');
  lobbySheetClose(m);
}
// 창 안에서 고르면 창을 닫고 그 화면으로 (잠긴 칸은 창을 남겨 둔다 → 안내만)
function lobbySheetClose(m) {
  m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act]'); if (b && !b.classList.contains('locked') && !ui.dataset.noclick) m.remove(); }, true);
}
function showMenu() {
  app.screen = 'menu';
  app.g = null;
  app.paused = false;
  app.cardsOpen = false;
  hud.hidden = true;
  guardOn();
  if (app.profileLoaded) setTimeout(() => { if (app.screen === 'menu' && !stage.querySelector('.info-modal, .gacha-res, .reveal')) cosmNewCheck(); }, 600);
  layout();
  const s = lobbyStage();
  const ch = chapterOf(s);
  R.setTheme(ch);
  A.setBoss(false);
  if (A.setMode) A.setMode(null);
  A.setChapter(ch);
  if (app.touched) A.playBgm(); // 전투 · 대전 · 레이드에서 돌아오면 로비 음악 다시 (같은 곡이면 그대로)
  setTimeout(() => { loadRankTicker().then(() => tickRank(0)).catch(() => {}); }, 0);
  if (!app.demo) app.demo = makeDemo();
  fx.reset();
  const p = P();
  const snap = loadSnap();
  const c = CHAPTERS[ch - 1];
  const fxd = stageFx(s);
  const d = dots();
  const cs = L.chapterStars(p, ch);
  const opened = (p.chests || {})[ch] || [];
  const chests = L.CHEST_STARS.map((n) => {
    const st = opened.includes(n) ? 'open' : cs >= n ? 'ready' : 'lock';
    return `<button class="chest ${st}" data-act="chest" data-ch="${ch}" data-n="${n}"><span>${ic(st === 'open' ? 'check' : 'gift', '', '')}</span><small>★${n}</small></button>`;
  }).join('');
  const now = Date.now();
  const boss = stageBosses(s).length > 0;
  const md = lobbyModeDot(p, d, now), mn = lobbyMenuDot(p, d);
  const raidOpen = L.raidState(now).open;
  try { localStorage.setItem('langbang:chapter', String(chapterOf(nextStage()))); } catch { /* 무시 */ } // 허브 카드용 (진행 챕터 1~7)
  const sparks = Array.from({ length: 10 }, (_, i) => `<i style="--i:${i};--x:${(i * 37) % 100}%;--d:${(i % 5) * 0.7}s"></i>`).join('');
  show(`
    <div class="lb-key" style="background-image:${chArtCss('keyart', ch)}"></div>
    <div class="lb-dim"></div>
    ${topPills()}
    ${p.master ? '<button class="lb-master" data-act="settings">MASTER</button>' : ''}
    <div class="lb-bar2">${newsFirst() || '<button class="lb-news" data-act="ranking" id="lbRank" aria-label="소식" hidden></button>'}
      <div class="lb-quick">${[['mail', '우편', 'mail', L.mailCount(p) > 0], ['missions', '미션', 'missionsNav', d.missions], ['settings', '설정', 'settings', false]].map(([k, n, act, on]) => `<button class="qb" data-act="${act}">${uiIco(k, '')}<small>${n}</small>${rdot(on)}</button>`).join('')}</div>
    </div>
    <button class="lb-stage" data-act="stages">
      <h2>${stageLabel(s)} ${esc(stageName(s))}</h2>
      <span class="lb-chip" style="--cc:${c.color}">${ch}장 ${esc(c.name)} · ${esc(fxd.name)}${boss ? ` · ${ic('ic_bosscrown', '', 'sm')}보스` : ''}</span>
      <span class="lb-st">${starStr(p.stages[s] || 0)}${p.perfects && p.perfects[s] ? ic('gem', '', 'sm') : ''}</span>
    </button>
    <div class="lb-dio">
      <button class="chev l" data-act="lbStep" data-d="-1" ${s <= 1 ? 'disabled' : ''} aria-label="이전 스테이지"><i></i>${s > 1 ? `<small>◂ ${stageLabel(s - 1)}</small>` : ''}</button>
      <div class="dio-track">${[-1, 0, 1].map((k) => { const s2 = s + k; if (s2 < 1 || s2 > STAGE_COUNT) return `<div class="dio-pane k${k}"></div>`; const c2 = chapterOf(s2); return `<div class="dio-pane k${k}"><div class="dio-wrap ch${c2}" ${k ? '' : 'data-act="stages"'}><img class="dio" src="/img/lb/dio/s${s2}.webp" alt="" draggable="false" onerror="this.onerror=function(){this.onerror=null;this.src='/img/lb/dio6.webp'};this.src='/img/lb/dio${c2}.webp'">${k ? `<em class="dp-lab">${stageLabel(s2)}</em>` : `<span class="sparks">${sparks}</span>`}</div></div>`; }).join('')}</div>
      ${(() => { const lock = s >= (p.master ? STAGE_COUNT : nextStage()); const nx = Math.min(STAGE_COUNT, s + 1); return `<button class="chev r ${lock && s < STAGE_COUNT ? 'lockd' : ''}" data-act="lbStep" data-d="1" ${lock ? 'disabled' : ''} aria-label="다음 스테이지"><i></i>${s < STAGE_COUNT ? `<small>${lock ? '' : ''}${stageLabel(nx)} ▸</small>` : ''}</button>`; })()}
    </div>
    <div class="lb-chests"><div class="cbar"><b style="width:${Math.min(100, (cs / 30) * 100)}%"></b></div>${chests}<em>${ch}장 ★${cs}/30</em></div>
    ${snap ? `<button class="lb-resume" data-act="resumeSnap">${ic('retry', '', 'sm')}이어하기 <small>${esc(snapLabel(snap))}</small></button>` : ''}
    <button class="lb-start v2" data-act="lbGo"><i class="ls-shine"></i><span class="ls-txt"><b>출격!</b><small>${stageLabel(s)} ${esc(stageName(s))}</small></span><span class="ls-cost">${ic('energy', '', 'sm')}<em>${p.master ? 0 : L.stageStaminaCost(p, s, false)}</em></span></button>
    <button class="lb-side l ${raidOpen ? 'hot' : ''}" data-act="lbModes">${lbArt('lobby_mode', 'swords')}<b>도전</b>${raidOpen ? '<em class="ls-hot">레이드 열림</em>' : ''}${rdot(md)}</button>
    <button class="lb-side r" data-act="lbMenu">${lbArt('lobby_menu', 'tools')}<b>메뉴</b>${rdot(mn)}</button>
    ${navHtml('battle')}
    ${app.profileLoaded ? '' : '<div class="lb-loading"><span class="spin"></span></div>'}
  `, 'lobby');
  lobbySwipe();
}
// 메뉴 뒤 데모 전투: 내 덱 멤버들이 싸운다
function makeDemo() {
  let ids = [];
  try { ids = (app.decks && app.decks[app.deckI] ? app.decks[app.deckI] : []).filter(Boolean); } catch { ids = []; }
  if (ids.length < 3) ids = ['staff', 'bangjang', 'gunman', 'gunnyeo'];
  const g = S.createGame({ H: app.logicalH, god: true, heroes: ids.slice(0, 5), rng: Math.random });
  for (const h of g.heroes) h.lv = 3;
  g.phaseT = 0.5;
  return g;
}
// 출전 준비: 멤버 카드를 길게 누르면 큰 멤버 카드 (도감 카드)
let lpT = 0;
stage.addEventListener('pointerdown', (ev) => {
  const c = ev.target.closest('.pcard[data-id], .dslot[data-id], .acard[data-id]');
  if (!c || (app.screen !== 'prep' && app.screen !== 'deck')) return;
  clearTimeout(lpT);
  lpT = setTimeout(() => { ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 400); vibrate(12); if (app.screen === 'deck') showHeroModal(c.dataset.id); else if (c.closest('.pp-editor') || c.classList.contains('pp-card')) showHeroModal(c.dataset.id, 'prep'); else showDexCard('hero', c.dataset.id); }, 480);
});
for (const t of ['pointerup', 'pointercancel', 'pointermove']) stage.addEventListener(t, (ev) => { if (t !== 'pointermove' || (ev.movementX * ev.movementX + ev.movementY * ev.movementY) > 16) clearTimeout(lpT); });
let lbSwipe = null;
ui.addEventListener('pointerdown', (ev) => {
  const dio = null; // 예전 끌기 — 이제 lobbySwipe 가 한다
  if (!dio || app.screen !== 'menu' || ev.target.closest('.chev')) return;
  lbSwipe = { x0: ev.clientX, t0: performance.now(), el: dio.querySelector('.dio-wrap'), moved: false };
});
ui.addEventListener('pointermove', (ev) => {
  if (!lbSwipe || !lbSwipe.el) return;
  const dx = ev.clientX - lbSwipe.x0;
  if (Math.abs(dx) > 6) lbSwipe.moved = true;
  lbSwipe.el.style.transition = 'none';
  lbSwipe.el.style.transform = `translateX(${dx * 0.6}px) rotate(${dx * 0.01}deg)`;
  lbSwipe.el.style.opacity = String(Math.max(0.4, 1 - Math.abs(dx) / 400));
});
const endSwipe = (ev) => {
  if (!lbSwipe) return;
  const s = lbSwipe; lbSwipe = null;
  const dx = ev.clientX - s.x0, dt = Math.max(1, performance.now() - s.t0);
  const vel = Math.abs(dx) / dt; // px/ms
  if (s.el) { s.el.style.transition = ''; s.el.style.transform = ''; s.el.style.opacity = ''; }
  if (Math.abs(dx) < 45) { s.cancelClick = s.moved; return; }
  ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 50);
  const dir = dx < 0 ? 1 : -1;
  if (Math.abs(dx) > 170 || vel > 1.1) {
    // 챕터 넘기기
    const ch = chapterOf(lobbyStage()) + dir;
    const target = clamp((ch - 1) * STAGES_PER_CHAPTER + 1, 1, P().master ? STAGE_COUNT : nextStage());
    if (target !== lobbyStage()) { app.lobbyStage = target; A.sfx.card(); showMenu(); }
  } else lobbyStep(dir);
};
ui.addEventListener('pointerup', endSwipe);
// 스테이지 지도: 좌우로 밀면 챕터 넘기기
let mapSwipe = null;
ui.addEventListener('pointerdown', (ev) => { if (app.screen === 'stages' && ev.target.closest('.nodes, .ch-banner')) mapSwipe = { x0: ev.clientX, y0: ev.clientY }; });
ui.addEventListener('pointerup', (ev) => {
  if (!mapSwipe) return;
  const dx = ev.clientX - mapSwipe.x0, dy = ev.clientY - mapSwipe.y0;
  mapSwipe = null;
  if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
  const c = clamp(app.chapterTab + (dx < 0 ? 1 : -1), 1, CHAPTERS.length);
  const first = (c - 1) * STAGES_PER_CHAPTER + 1;
  if (c === app.chapterTab || !stageUnlocked(first)) return;
  ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 50);
  app.chapterTab = c; app.selStage = chapterOf(nextStage()) === c ? nextStage() : first;
  A.sfx.card();
  showStages();
});
ui.addEventListener('pointercancel', () => { if (lbSwipe && lbSwipe.el) { lbSwipe.el.style.transform = ''; lbSwipe.el.style.opacity = ''; } lbSwipe = null; });
// 로비 가운데 판 끌기: 손가락 따라 1:1 · 옆 판이 살짝 보임 · 놓으면 스프링 · 끝·잠김은 고무줄 · 세로 스크롤 안 뺏음
function lobbySwipe() {
  const box = ui.querySelector('.lb-dio'), track = box && box.querySelector('.dio-track');
  if (!track) return;
  const head = ui.querySelector('.lb-stage'), chests = ui.querySelector('.lb-chests');
  const s = lobbyStage(), max = P().master ? STAGE_COUNT : nextStage();
  for (const el of [head, chests, track]) if (el) { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; } // 다시 그려도 끌던 자리(translate)가 남지 않게
  let x0 = 0, y0 = 0, t0 = 0, dx = 0, axis = '', id = null, lastX = 0, lastT = 0, vel = 0;
  const W = () => box.clientWidth * 0.62; // 판 사이 거리 (옆 판이 가장자리에 보임)
  const set = (v, anim) => {
    track.style.transition = anim ? 'transform 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.15)' : 'none';
    track.style.transform = `translate3d(${v}px,0,0)`;
    const k = Math.min(1, Math.abs(v) / W());
    for (const el of [head, chests]) if (el) { el.style.transition = anim ? 'transform 0.28s, opacity 0.28s' : 'none'; el.style.transform = el === chests ? `translateX(-50%) translate3d(${v * 0.35}px,0,0)` : `translate3d(${v * 0.35}px,0,0)`; el.style.opacity = String(1 - k * 0.7); }
  };
  box.addEventListener('pointerdown', (ev) => { if (ev.target.closest('.chev')) return; id = ev.pointerId; x0 = lastX = ev.clientX; y0 = ev.clientY; t0 = lastT = performance.now(); dx = 0; axis = ''; vel = 0; });
  box.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== id) return;
    const mx = ev.clientX - x0, my = ev.clientY - y0;
    if (!axis) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; axis = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (axis === 'x') { try { box.setPointerCapture(id); } catch { /* 무시 */ } } }
    if (axis !== 'x') return;
    const now = performance.now(); vel = (ev.clientX - lastX) / Math.max(1, now - lastT); lastX = ev.clientX; lastT = now;
    const canL = s > 1, canR = s < max && s < STAGE_COUNT;
    dx = mx;
    if ((dx > 0 && !canL) || (dx < 0 && !canR)) dx = mx * 0.28; // 고무줄
    set(dx, false);
  });
  const end = (ev) => {
    if (ev.pointerId !== id) return; id = null;
    if (axis !== 'x') return;
    box.dataset.swiped = '1'; setTimeout(() => { delete box.dataset.swiped; }, 80);
    const canL = s > 1, canR = s < max && s < STAGE_COUNT;
    const go = (dx < -W() * 0.25 || vel < -0.5) ? 1 : (dx > W() * 0.25 || vel > 0.5) ? -1 : 0;
    if (go === 1 && !canR) { set(0, true); if (s < STAGE_COUNT) { const r = box.querySelector('.chev.r'); if (r) lockTip(r, stageLabel(s + 1), '이 스테이지를 먼저 깨 주세요'); } return; }
    if (go === -1 && !canL) { set(0, true); return; }
    if (!go) { set(0, true); return; }
    set(-go * W(), true);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* 무시 */ }
    A.sfx.tabSw();
    setTimeout(() => { app.lobbyStage = s + go; showMenu(); }, 260);
  };
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end);
  box.addEventListener('click', (ev) => { if (box.dataset.swiped) { ev.stopPropagation(); ev.preventDefault(); } }, true);
  lobbySwipe.step = (d) => { // 화살표도 같은 움직임
    if ((d > 0 && !(s < max && s < STAGE_COUNT)) || (d < 0 && s <= 1)) return false;
    set(-d * W(), true); A.sfx.tabSw();
    setTimeout(() => { app.lobbyStage = s + d; showMenu(); }, 260);
    return true;
  };
}
function lobbyStep(d) {
  if (lobbySwipe.step && ui.querySelector('.dio-track') && lobbySwipe.step(d)) return;
  const s = clamp(lobbyStage() + d, 1, P().master ? STAGE_COUNT : nextStage());
  if (s === app.lobbyStage) return;
  const ch0 = chapterOf(app.lobbyStage);
  app.lobbyStage = s;
  const el = ui.querySelector('.dio-wrap');
  if (chapterOf(s) !== ch0 && el) { el.classList.add(d > 0 ? 'outL' : 'outR'); setTimeout(showMenu, 200); } else showMenu();
}

// ─── 탭 이동 ─────────────────────────────────────────
function goNav(tab) {
  if (tab === 'battle') return showMenu();
  if (tab === 'shop') { app.shopTab = app.shopTab === 'items' ? 'items' : 'recruit'; return showShop(); }
  if (tab === 'bag') return showBag();
  if (tab === 'members' || tab === 'deck') return showDeckTab();
  if (tab === 'missions') return showMissions();
  if (tab === 'pvp') return showPvp();
}

// ─── 공용: 보상 글자 · 팝업 ───────────────────────────
function gotText(got) {
  if (!got) return '';
  const a = [];
  if (got.coins) a.push(`${fmt(got.coins)} 코인`);
  if (got.tickets) a.push(`모집권 ${got.tickets}`);
  if (got.sp) a.push(`시즌 +${got.sp}`);
  if (got.gear) { const gr = typeof got.gear === 'string' ? { r: got.gear } : got.gear; const R0 = GEAR_RARITY[gr.r] || GEAR_RARITY.common; a.push(`${gr.t && GEAR[gr.t] ? GEAR[gr.t].name + ' · ' : ''}${R0.name} 장비${gr.sold ? ' (가방 꽉 참 → 코인)' : ''}`); } // 우편 보상은 등급 글자("myth")만 · 받은 뒤엔 {t, r}
  if (got.title) a.push(`칭호 "${L.titleName(got.title)}"`);
  if (got.frame) a.push(`${L.FRAMES[got.frame].name}`);
  if (got.gears) a.push(`장비 ${got.gears.length}개`);
  if (got.stones) a.push(`강화석 ${got.stones}`);
  if (got.cons) for (const [k, n] of Object.entries(got.cons)) if (L.CONS[k]) a.push(`${L.CONS[k].name} ${n}개`);
  if (got.sta) a.push(`체력 ${got.sta}`);
  if (got.wild) a.push(`범용 멤버 카드 ${got.wild}`);
  if (got.titles) a.push(`칭호 ${got.titles.length}개`);
  if (got.frames) a.push(`프레임 ${got.frames.length}개`);
  return a.join(' · ');
}
function popup(html, cls = '') {
  const prev = cls ? stage.querySelector(`.info-modal.pop.${cls.split(' ')[0]} .pop-box`) : null;
  const keepY = prev ? prev.scrollTop : 0;
  closeInfoCard();
  const m = document.createElement('div');
  m.className = 'info-modal pop ' + cls + (prev ? ' same' : ''); // 같은 창을 새로 그릴 땐 다시 올라오는 움직임 없이
  m.innerHTML = `<div class="pop-box">${html}<button class="pop-x" data-x>✕</button></div>`;
  stage.appendChild(m);
  if (keepY) m.querySelector('.pop-box').scrollTop = keepY;
  m.addEventListener('click', (ev) => {
    if (ev.target === m || ev.target.closest('[data-x]')) { m.remove(); if (m.classList.contains('pp-editor') && app.screen === 'prep') showPrep(app.mode, app.stage); return; }
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled || ui.dataset.noclick) return; // 길게 누른 건 누르기 아님
    A.unlock(); uiSound(b.dataset.act, b);
    if (ACTS[b.dataset.act]) ACTS[b.dataset.act](b);
  });
  return m;
}
// 서버 프로필로 다시 맞추기 — 실패하면(끊김 등) 지금 값을 그대로 둔다 (예전엔 실패 때 손님 프로필로 바뀌어서
//  화면엔 손님 모집권이 보이는데 서버는 "모집권이 부족해요" 가 되는 일이 있었다)
async function resyncProfile() {
  if (app.guest) return false;
  const x = await API.loadProfile().catch(() => null);
  if (!x || x.guest || !x.profile) return false;
  app.profile = x.profile;
  return true;
}
// 다른 기기·탭에서 쓴 뒤 돌아오면 서버 값으로 (전투 중엔 안 건드림)
document.addEventListener('visibilitychange', () => { if (!document.hidden && app.profileLoaded && !app.guest && app.screen !== 'play') resyncProfile().then((ok) => { if (ok && app.screen !== 'play') { refresh(); BKX.notify(); } }); });
async function liveAct(promise, okMsg) {
  const r = await promise;
  if (r.ok && r.profile) app.profile = r.profile;
  if (!r.ok) {
    toast(r.message || '못 했어요');
    // 부족하다고 하면 서버 값으로 다시 맞추고 화면도 새로 (진짜 개수를 보여 준다)
    if (!app.guest && /부족/.test(r.message || '')) resyncProfile().then((ok) => { if (ok) { refresh(); toast(`${r.message} · 지금 모집권 ${P().tickets | 0} · 코인 ${fmt(P().coins | 0)}`, 2600); } });
    return null;
  }
  if (okMsg) toast(okMsg(r), 2600);
  return r;
}
function refresh() {
  const f = { menu: showMenu, shop: showShop, bag: showBag, members: showMembers, deck: showDeckTab, pvp: showPvp, missions: showMissions, season: showSeason, weekly: showWeekly, prep: () => showPrep(app.mode, app.stage), tower: () => TWUI.show() }[app.screen];
  if (f) f();
}

// ─── 상점: 모집 · 아이템 ─────────────────────────────
function showShop() {
  app.screen = 'shop';
  hud.hidden = true;
  const p = P();
  const tab = app.shopTab === 'items' ? 'items' : app.shopTab === 'gear' ? 'gear' : 'recruit';
  let body;
  if (tab === 'gear') {
    const gp = L.GEAR_PITY - ((p.pity || {}).gear | 0);
    body = `<div class="gacha-banner v2 gg" style="--c:#ffb400">
        <div class="gb-art gg-art"><img class="gg-chest" src="/img/lb/fx/gacha_gear_poster.jpg" alt="" draggable="false"></div>
        <div class="gb-text"><div class="gb-title"><small class="gb-pick">장비 뽑기 · 강화석</small><b>보물 상자</b><small>무기 · 장신구 · 신화 장비</small></div>
        <div class="gb-pity"><span>신화 장비 확정까지 <b>${gp}</b>회</span><span>10회 뽑기: 영웅 이상 1개 보장</span></div></div></div>
      <div class="grid2 gacha-btns">
        <button class="btn" data-act="gpull" data-n="1"><b>1회 뽑기</b><small>${ic('gem', '', 'sm')}${L.GEAR_GACHA_COST.one}</small></button>
        <button class="btn primary" data-act="gpull" data-n="10"><b>10회 뽑기</b><small>${ic('gem', '', 'sm')}${L.GEAR_GACHA_COST.ten} · 영웅 이상 1개</small></button>
      </div>
      <button class="btn ghost rates-btn" data-act="grates">${ic('chart', '', 'sm')} 확률 공개 · 보유 강화석 ${ic('gem', '', 'sm')}${p.stones | 0}</button>
      ${sigBarHtml(p)}
      <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>강화석은 스테이지 보상 · 장비 분해로 모여요</span></p>`;
  } else if (tab === 'recruit') {
    const pity = L.PITY_HERO - (p.pity.hero | 0);
    const lopen = L.legendOpen(p);
    const cost1 = (p.tickets | 0) >= 1 ? '1' : `<i class="ci"></i>${fmt(L.GACHA_COST.one)}`;
    const cost10 = (p.tickets | 0) >= 10 ? '10' : `<i class="ci"></i>${fmt(L.GACHA_COST.ten)}`;
    // 픽업: 아직 없는 모집 멤버 중 하루마다 돌아가며 (다 있으면 전부 중 하나) · 뒤에 셋
    const pick = L.pickupHero(); // 이번 주 픽업 T4 (T4 가 나오면 50% 로 이 멤버)
    const others = [...(lopen ? ['hochan'] : []), ...GACHA_HEROES.filter((id) => id !== pick)].slice(0, 3);
    const face = (id) => { const f = DEX_FACE[id] || [0.48, 0.09, 0.15]; return `${Math.round(f[0] * 100)}% ${Math.min(100, Math.round(f[1] * 100 * 1.4))}%`; };
    // 아직 합류 안 한 멤버는 이름·그림을 가린다 (검은 실루엣 + ???) — 모집해서 만나는 재미
    const own = (id) => API.heroUnlocked(p, id);
    const art = (id, cls) => `<img class="${cls}${own(id) ? '' : ' sil'}" src="${thumbSrc(id) || HEROES[id].img}" alt="" loading="lazy" decoding="async" draggable="false" style="object-position:${face(id)}" onerror="this.onerror=null;this.src='${HEROES[id].img}'">`;
    body = `<div class="gacha-banner v2" style="--c:${ATTRS[HEROES[pick].attr].color}">
        <div class="gb-art">${others.map((id, i) => art(id, `gb-back b${i}`)).join('')}${art(pick, 'gb-main')}</div>
        <div class="gb-text"><div class="gb-title"><small class="gb-pick">이번 주 픽업 · T4</small><b>${own(pick) ? esc(HEROES[pick].name) : '???'}</b><small>${own(pick) ? esc(HEROES[pick].role) : `<span class="gb-attr">${attrIco(HEROES[pick].attr)}</span>정체는 모집해서 확인`} · 코인·모집권만 (현금 결제 없음)</small></div>
        <div class="gb-pity"><span>T4 멤버 확정까지 <b>${pity}</b>회</span><span>${lopen ? `LEGEND 확정까지 <b>${L.PITY_LEGEND - (p.pity.legend | 0)}</b>회${(p.pity.legend | 0) >= L.PITY_SOFT - 1 ? ` · 지금 확률 ${L.legendRate(p.pity.legend | 0).toFixed(1)}%` : ''}` : `LEGEND ${own('hochan') ? '이호찬' : '멤버'}은 ${stageLabel(L.HOCHAN_GATE)} 클리어 후 등장`}</span></div>
      </div></div>
      <div class="grid2 gacha-btns">
        <button class="btn" data-act="pull" data-n="1"><b>1회 모집</b><small>${cost1}</small></button>
        <button class="btn primary" data-act="pull" data-n="10"><b>10회 모집</b><small>${cost10} · ${(p.pulls | 0) === 0 ? '처음 10회는 T4 확정' : 'T3 이상 1개 확정'}</small></button>
 </div>
 <button class="btn ghost rates-btn" data-act="rates">${ic('chart', '', 'sm')} 확률 공개 · 보유 모집권 ${ic('ticket', '', 'sm')}${p.unlimited ? '∞' : p.tickets | 0}</button>
      ${sigBarHtml(p)}
      <div class="card-prog">${[...GACHA_HEROES, ...LEGEND_HEROES].map((h) => { const pr = L.cardProgress(p, h); const d = HEROES[h]; const lock = LEGEND_HEROES.includes(h) && !L.legendOpen(p); const ok = own(h); return `<div class="cp ${pr ? '' : 'done'} ${lock ? 'lock' : ''}" style="--c:${d.color}">${av(d, ok ? '' : 'sil')}<b>${ok ? esc(d.name) : `<span class="cp-attr">${attrIco(d.attr)}</span>???`}</b>${pr ? `<i><b style="width:${Math.round((pr[0] / pr[1]) * 100)}%"></b></i><small>${lock ? `${stageLabel(L.HOCHAN_GATE)} 뒤` : `${pr[0]}/${pr[1]}장`}</small>` : '<small>합류 </small>'}</div>`; }).join('')}</div>
      <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>모집 멤버는 <b>카드</b>를 모아 합류 (영웅 ${L.UNLOCK_CARDS.epic}장 · LEGEND ${L.UNLOCK_CARDS.legend}장) · 합류한 뒤 카드와 조각으로 <b>★ 승급</b> (공격력 +${Math.round(L.STAR_ATK * 100)}% / ★)</span></p>`;
  } else {
    body = `<div class="up-list">${ITEM_IDS.map((id) => {
      const it = ITEMS[id];
      const lv = (p.items || {})[id] || 0;
      const cost = API.itemCostOf(p, id);
      const gate = cost === null ? 0 : API.itemGateOf(p, id); // 진행도 잠금: N장 클리어 필요
      const can = cost !== null && !gate && p.coins >= cost && !(it.needs && !(p.items[it.needs] | 0));
      const cur = id === 'drink' ? it.desc(lv) : lv ? it.desc(itemValue(id, lv)) : '아직 없음';
      const nxt = cost === null ? '' : id === 'drink' ? `${lv + 1}장` : /slot/.test(id) ? '' : '+' + it.desc(itemValue(id, lv + 1)).split('+').pop();
      const pips = Array.from({ length: it.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="up item"><span class="it-ico" data-act="itemInfo" data-id="${id}">${itemIc(id)}</span><div class="mid" data-act="itemInfo" data-id="${id}"><b>${it.name}<span class="lvtag">Lv.${lv}/${it.max}</span></b>
        <small class="eff">${esc(ITEM_EFFECT[id] || '')}</small>
        <small>지금: ${esc(/slot/.test(id) ? it.desc(lv) : cur)}${nxt ? ` → 다음: <span class="nx">${esc(nxt)}</span>` : ' (최대)'}</small>
        <div class="pips">${pips}</div></div>
        <button class="btn ${can ? 'primary' : ''}" data-act="buyItem" data-id="${id}" ${can ? '' : 'disabled'}>${cost === null ? 'MAX' : gate ? `${gate}장 클리어 필요` : `<i class="ci"></i>${fmt(cost)}`}</button></div>`;
    }).join('')}</div>
    <p class="sub" style="margin-top:10px">덱 칸이 많을수록 뒤 챕터가 쉬워져요 · 기본 ${DECK_BASE}칸</p>
    <h3 class="sec-t">소모품</h3><div class="up-list">${Object.keys(L.CONS_SHOP).map((id) => { const c = L.CONS[id], s = L.CONS_SHOP[id], left = L.consShopLeft(p, id), have = (p.cons || {})[id] | 0; const can = left > 0 && (s.stones ? (p.stones | 0) >= s.stones : p.coins >= s.coins); return `<div class="up item cons-shop" style="--rc:${CONS_RC[c.rarity]}">${consIc(id)}<div class="mid"><b>${esc(c.name)} <span class="lvtag">보유 ${have}</span></b><small class="eff">${esc(c.desc)}</small><small>${s.per === 'week' ? '이번 주' : '오늘'} ${left}/${s.n}개 남음</small></div><button class="btn ${can ? 'primary' : ''}" data-act="consBuy" data-id="${id}" ${can ? '' : 'disabled'}>${s.stones ? `${ic('gem', '', 'sm')}${s.stones}` : `<i class="ci"></i>${fmt(s.coins)}`}</button></div>`; }).join('')}</div>
    ${(() => { const wi = L.weekIndex(Date.now()); const n = p.cardPick && p.cardPick.wi === wi ? p.cardPick.n : 0; const left = CARD_PICK.perWeek - n; return `<div class="up item"><span class="it-ico">${ic('card_common', '', 'sm')}</span><div class="mid"><b>멤버 카드 선택권<span class="lvtag">이번 주 ${left}/${CARD_PICK.perWeek}</span></b><small class="eff">고른 멤버 카드 ${CARD_PICK.n}장 (강화·★승급에 써요)</small></div><button class="btn ${left > 0 && p.coins >= CARD_PICK.cost ? 'primary' : ''}" data-act="cardPickOpen" ${left > 0 ? '' : 'disabled'}><i class="ci"></i>${fmt(CARD_PICK.cost)}</button></div>`; })()}
 <button class="btn ghost" data-act="cardConvert" style="margin-top:8px">${ic('retry', '', 'sm')} 다 키운 멤버의 남는 카드 → 범용 카드 (보유 ${p.wild | 0})</button>`;
  }
  show(`
    ${subTop('상점')}
    <div class="tabs"><button class="${tab === 'recruit' ? 'on' : ''}" data-act="shopTab" data-tab="recruit">${ic('gacha', '', 'sm')}모집</button><button class="${tab === 'gear' ? 'on' : ''}" data-act="shopTab" data-tab="gear">${ic('gift', '', 'sm')} 장비 뽑기</button><button class="${tab === 'items' ? 'on' : ''}" data-act="shopTab" data-tab="items">${ic('bag', '', 'sm')} 아이템</button></div>
 ${app.guest ? '<div class="guest-note">손님 기록은 이 기기에만 · <a href="/">로그인</a>하면 어디서든!</div>' : ''}
    ${body}
    ${navHtml('shop')}
  `, 'dim withnav');
}
// 상점 아이템 그림 (ui2/) — data.js 의 icon 은 이모지라 화면엔 안 쓴다 (매핑 없는 🔋🍹💺🛋️ 는 지워져 빈 칸이 됐음)
//   slot5·slot6 는 전용 그림(it_slot5/it_slot6)이 오기 전까지 자물쇠 열림으로
const ITEM_IC = { door: 'door', coupon: 'coupon', battery: 'it_battery', charm: 'it_charm', drink: 'welcome', slot5: 'it_slot5', slot6: 'it_slot6' };
const itemIc = (id, size = '') => ic(ITEM_IC[id] || 'bag', '', size);
// 상점 아이템: 한 줄 효과 설명 + 자세히
const ITEM_EFFECT = {
  door: '랑방 입구 최대 내구도가 늘어요 (별 받기가 쉬워짐)', coupon: '스테이지를 깰 때 받는 코인이 늘어요', battery: '총공지 게이지가 더 빨리 차요',
  charm: '모든 멤버 치명타(2배 피해) 확률이 올라가요', drink: '스테이지 시작 전에 레벨업 카드를 먼저 골라요', slot5: '덱에 멤버를 5명까지 넣을 수 있어요', slot6: '덱에 멤버를 6명까지 넣을 수 있어요 (5번째 칸 먼저)',
};
function showItemInfo(id) {
  const it = ITEMS[id], p = P();
  const lv = (p.items || {})[id] | 0;
  const rows = Array.from({ length: it.max }, (_, i) => `<div class="irow ${i + 1 <= lv ? 'on' : ''} ${i === lv ? 'next' : ''}"><span>Lv.${i + 1}</span><b>${esc(id === 'drink' || /slot/.test(id) ? it.desc(i + 1) : it.desc(itemValue(id, i + 1)))}</b><em>${fmt(itemCost(id, i) || 0)}코인</em></div>`).join('');
  popup(`<h3>${itemIc(id, 'sm')} ${esc(it.name)}</h3><p class="ip">${esc(ITEM_EFFECT[id] || '')}</p><div class="ilist">${rows}</div>${it.needs ? `<p class="ip">먼저 필요: ${esc(ITEMS[it.needs].name)}</p>` : ''}`);
}
function subTop(title) {
  return `${topPills()}<h2 class="title sub-title">${esc(title)}</h2>`;
}
// 신화 조각 막대 (상점 두 탭) — 600개면 교환 버튼
function sigBarHtml(p) {
  const n = (p.pity || {}).sig | 0, ok = n >= SIG_PITY;
  return `<button class="sig-bar ${ok ? 'ready' : ''}" data-act="sigEx">${ic('prism', '', 'sm')}<span><b>신화 조각 ${Math.min(n, SIG_PITY)}/${SIG_PITY}</b><small>${ok ? '원하는 멤버 전용 신화로 바꿀 수 있어요!' : '모집·장비 뽑기 1회마다 1개 · 다 모으면 원하는 멤버 전용 신화'}</small></span><i class="sig-pb"><b style="width:${Math.min(100, Math.round((n / SIG_PITY) * 100))}%"></b></i></button>`;
}
function showSigExchange() {
  const p = P(), n = (p.pity || {}).sig | 0, ok = n >= SIG_PITY;
  const rows = Object.keys(SIG).filter((h) => API.heroUnlocked(p, h)).map((h) => { const t = 'sig_' + h, have = sigHave(p, h); return `<button class="sig-pick ${have ? 'off' : ''}" ${have || !ok ? 'disabled' : ''} data-act="sigExDo" data-id="${h}"><span class="sig-ic">${gearIco({ t, r: 'myth' })}</span><span><b>${esc(HEROES[h].name)} · ${esc(GEAR[t].name)}</b><small>${have ? '가지고 있어요' : esc(GEAR[t].desc)}</small></span></button>`; }).join('');
  popup(`<h3 class="rt-h">${ic('prism', '', '')}전용 신화 교환</h3><p class="ip">신화 조각 <b>${n}</b>/${SIG_PITY} · ${ok ? '멤버를 고르면 바로 그 멤버 전용 신화를 받아요' : `${SIG_PITY - n}개 더 모으면 고를 수 있어요`}</p><div class="sig-list">${rows || '<p class="ip">합류한 멤버가 없어요</p>'}</div><p class="rt-foot">모집 1회 ${SIG_RATE.hero}% · 장비 뽑기 1회 ${SIG_RATE.gear}% 로도 나와요 (가진 멤버 중) · 겹치면 신화 조각 ${SIG_DUP_SHARDS}개</p>`, 'pp-sheet sig-sheet');
}
async function doSigExchange(h) {
  const t = 'sig_' + h;
  if (!GEAR[t]) return;
  const yes = await confirmBox({ title: `${HEROES[h].name} 전용 신화로 바꿀까요?`, sub: `${GEAR[t].name} · 신화 조각 ${SIG_PITY}개를 써요`, ok: '바꾸기', cancel: '취소' });
  if (!yes) return;
  closeInfoCard();
  const r = await liveAct(API.sigExchange(h, app.guest));
  if (!r) return;
  await gachaVideo('gear', 'gold');
  await gachaShow(r.results || []);
  refresh();
}
// 확률 정보: 등급별 막대 · 큰 숫자 · 천장 진행 · 멤버 이름은 숨기고 "N명 · 각 x%"
function showRates() {
  const p = P();
  const lopen = L.legendOpen(p);
  const lk = (k) => k === 'legendHero';
  const rows = L.GACHA_RATES.filter((r) => lopen || !lk(r.k));
  const sum = rows.reduce((a, r) => a + r.w, 0);
  const TIER_OF = { legendHero: [5, 'LEGEND 멤버 합류'], epicHero: [4, 'T4 멤버 합류'], t3Card: [3, 'T3 멤버 카드 ×3'], t2Card: [2, 'T2 멤버 카드 ×3'], sigGear: ['sig', '전용 신화 장비'], mythGear: ['myth', '신화 장비'], legendGear: ['legend', '전설 장비'], epicGear: ['epic', '영웅 장비'], rareGear: ['rare', '희귀 장비'], shard10: ['s', '멤버 조각 ×10'], shard4: ['s', '멤버 조각 ×4'] };
  const nOf = (r) => { const m = /\(([^)]*)\)/.exec(r.name); if (r.k === 'legendHero') return LEGEND_HEROES.length; if (r.k === 'mythGear') return MYTH_IDS.length; if (r.k === 'sigGear') return 0; if (/Gear$/.test(r.k)) return GEAR_IDS.length; if (!m || /^shard/.test(r.k)) return 0; return m[1].split('·').map((s) => s.trim()).filter((s) => s && !/[0-9]/.test(s)).length; };
  const maxW = Math.max(...rows.map((r) => r.w));
  const bar = (r) => { const pct = (r.w / sum) * 100, n = nOf(r), T = TIER_OF[r.k] || [0, r.name]; const unit = /Gear$/.test(r.k) ? '종' : '명'; return `<div class="rt-row" style="--rc:${r.color}"><i class="rt-crest ${typeof T[0] === 'number' ? 'tier t' + T[0] : 'g-' + T[0]}">${typeof T[0] === 'number' ? TIER_NAME[T[0]] : T[0] === 's' ? ic('star_gold', '', 'sm') : ic('gem', '', 'sm')}</i><span class="rt-n"><b>${T[1]}</b>${n ? `<small>${n}${unit} · 각 ${(pct / n).toFixed(pct / n < 0.1 ? 3 : 2)}%</small>` : ''}</span><b class="rt-p">${pct.toFixed(2)}<small>%</small></b><i class="rt-bar"><b style="width:${Math.max(2, (r.w / maxW) * 100)}%"></b></i></div>`; };
  const heroRows = rows.filter((r) => /Hero$|Card$/.test(r.k)).map(bar).join(''), gearRows = rows.filter((r) => /Gear$/.test(r.k)).map(bar).join(''), etcRows = rows.filter((r) => /^shard/.test(r.k)).map(bar).join('');
  const ph = p.pity || {};
  const pityRow = (icn, txt, cur, max) => `<div class="rt-pity">${ic(icn, '', '')}<span><b>${txt}</b>${max ? `<i class="rt-pb"><b style="width:${Math.round((cur / max) * 100)}%"></b></i><small>${cur}/${max}회</small>` : ''}</span></div>`;
  popup(`<h3 class="rt-h">${ic('dice', '', '')}모집 확률</h3>
    <div class="rt-pitys">
      ${pityRow('crown', `${L.PITY_LEGEND}회 안에 LEGEND 확정 · ${L.PITY_SOFT}회부터 확률 상승`, ph.legend | 0, L.PITY_LEGEND)}
      ${pityRow('sparkle', `${L.PITY_HERO}회 안에 T4 멤버 확정`, ph.hero | 0, L.PITY_HERO)}
      ${pityRow('card_epic', '10회 모집: T3 이상 1장 보장 · 처음 10회는 T4 확정', 0, 0)}
      ${pityRow('prism', `신화 조각 ${SIG_PITY}개 = 원하는 멤버 전용 신화 (모집·장비 뽑기 1회마다 1개)`, Math.min(SIG_PITY, ph.sig | 0), SIG_PITY)}
    </div>
    <details class="rt-sec" open><summary>멤버</summary>${heroRows}</details>
    <details class="rt-sec"><summary>장비</summary>${gearRows}</details>
    <details class="rt-sec"><summary>그 밖</summary>${etcRows}</details>
    ${lopen ? '' : `<p class="ip">LEGEND 는 ${stageLabel(L.HOCHAN_GATE)} 클리어 후 나와요</p>`}
    <p class="rt-foot">표시 확률은 1회 기준 · 천장 횟수는 서버에 저장 · 같은 등급 안에서는 모두 같은 확률 · 이미 있는 멤버는 그 멤버 카드로 바뀌어요</p>`, 'rates-pop rt-v2');
}
// 장비 뽑기
async function doGearPull(n) {
  const p = P(), cost = n === 10 ? L.GEAR_GACHA_COST.ten : L.GEAR_GACHA_COST.one;
  if ((p.stones | 0) < cost) { toast(`강화석이 부족해요 (${cost} 필요)`); return; }
  const r = await liveAct(API.gearGacha(n, app.guest));
  if (!r) return;
  const list = r.results || [];
  const best = list.some((x) => x.k === 'mythGear' || x.k === 'sigGear') ? 'gold' : list.some((x) => x.k === 'legendGear') ? 'purple' : 'blue';
  await gachaVideo('gear', best);
  await gachaShow(list);
  refresh();
}
function showGearRates() {
  const p = P(), rs = L.GEAR_GACHA_RATES, sum = rs.reduce((a, r) => a + r.w, 0), maxW = Math.max(...rs.map((r) => r.w));
  const nOf = (k) => (k === 'myth' ? MYTH_IDS.length : k === 'sig' ? 0 : GEAR_IDS.length);
  const row = (r) => { const pct = (r.w / sum) * 100, n = nOf(r.k); return `<div class="rt-row" style="--rc:${r.color}"><i class="rt-crest g-${r.k}">${ic('gem', '', 'sm')}</i><span class="rt-n"><b>${r.name}</b><small>${n ? `${n}종 · 각 ${(pct / n).toFixed(pct / n < 0.1 ? 3 : 2)}%` : '가진 멤버 중 · 아직 없는 멤버 것 먼저'}</small></span><b class="rt-p">${pct.toFixed(2)}<small>%</small></b><i class="rt-bar"><b style="width:${Math.max(2, (r.w / maxW) * 100)}%"></b></i></div>`; };
  const cur = (p.pity || {}).gear | 0;
  popup(`<h3 class="rt-h">${ic('gift', '', '')}장비 뽑기 확률</h3>
    <div class="rt-pitys"><div class="rt-pity">${ic('crown', '', '')}<span><b>${L.GEAR_PITY}회 안에 신화 장비 확정</b><i class="rt-pb"><b style="width:${Math.round((cur / L.GEAR_PITY) * 100)}%"></b></i><small>${cur}/${L.GEAR_PITY}회</small></span></div>
    <div class="rt-pity">${ic('sparkle', '', '')}<span><b>10회 뽑기: 영웅 이상 1개 보장</b></span></div>
    <div class="rt-pity">${ic('prism', '', '')}<span><b>신화 조각 ${SIG_PITY}개 = 원하는 멤버 전용 신화</b><i class="rt-pb"><b style="width:${Math.round((Math.min(SIG_PITY, (p.pity || {}).sig | 0) / SIG_PITY) * 100)}%"></b></i><small>${Math.min(SIG_PITY, (p.pity || {}).sig | 0)}/${SIG_PITY}개</small></span></div></div>
    <details class="rt-sec" open><summary>등급</summary>${rs.map(row).join('')}</details>
    <p class="rt-foot">표시 확률은 1회 기준 · 같은 등급 안에서는 모두 같은 확률 · 천장 횟수와 신화 조각은 서버에 저장돼요 · 전용 신화가 겹치면 신화 조각 ${SIG_DUP_SHARDS}개로</p>`, 'rates-pop rt-v2');
}
// 뽑기 연출 영상: 가장 좋은 등급 색 (금 · 보라 · 파랑) · 금은 보라로 시작해서 3초에 금으로 · 보라는 파랑으로 시작 · 1초 뒤 건너뛰기
const GV_BLOB = {};
async function gvUrl(src) { if (GV_BLOB[src]) return GV_BLOB[src]; try { const r = await fetch(src); if (!r.ok) throw 0; GV_BLOB[src] = URL.createObjectURL(await r.blob()); } catch { GV_BLOB[src] = src; } return GV_BLOB[src]; }
function gachaVideo(kind, best) {
  return new Promise(async (resolve) => {
    const still = document.body.classList.contains('rm') || (navigator.connection && navigator.connection.saveData);
    const d = document.createElement('div');
    d.className = 'gv-wrap ' + best;
    if (still) { d.innerHTML = '<i class="gv-flash"></i>'; stage.appendChild(d); A.sfx.levelUp(); setTimeout(() => { d.remove(); resolve(); }, 1000); return; }
    const tease = best === 'gold' ? 'purple' : best === 'purple' ? 'blue' : null;
    const src = (c) => `/img/lb/fx/gacha_${kind}_${c}.mp4`;
    d.innerHTML = `<video class="gv v0" muted playsinline preload="auto" poster="/img/lb/fx/gacha_${kind}_poster.jpg"></video><video class="gv v1" muted playsinline preload="auto"></video><button class="gv-skip" hidden>건너뛰기</button>`;
    stage.appendChild(d);
    const [v0, v1] = d.querySelectorAll('video');
    let done = false;
    const end = () => { if (done) return; done = true; d.classList.add('flash'); A.sfx.reward(); setTimeout(() => { d.remove(); resolve(); }, 260); };
    d.querySelector('.gv-skip').addEventListener('click', (ev) => { ev.stopPropagation(); end(); });
    setTimeout(() => { const s = d.querySelector('.gv-skip'); if (s) s.hidden = false; }, 1000);
    const [u0, u1] = await Promise.all([gvUrl(src(tease || best)), tease ? gvUrl(src(best)) : Promise.resolve(null)]);
    if (done) return;
    v0.src = u0; if (u1) v1.src = u1;
    A.sfx.heartbeat && A.sfx.heartbeat();
    v0.classList.add('on');
    v0.play().catch(() => end());
    if (u1) { const t = setInterval(() => { if (done) { clearInterval(t); return; } if (v0.currentTime >= 3) { clearInterval(t); v1.currentTime = 3; v1.play().then(() => { v1.classList.add('on'); v0.classList.remove('on'); A.sfx.rise && A.sfx.rise(); fx.flash('#fff', 0.2); }).catch(() => {}); } }, 60); }
    const main = () => (u1 && v1.classList.contains('on') ? v1 : v0);
    const chk = setInterval(() => { if (done) { clearInterval(chk); return; } const v = main(); if (v.duration && v.currentTime >= v.duration - 0.35) { clearInterval(chk); end(); } }, 80);
    setTimeout(() => end(), 10000);
  });
}
async function doPull(n) {
  const p = P();
  const pay = (p.tickets | 0) >= n ? 'ticket' : 'coin';
  const cost = n === 10 ? L.GACHA_COST.ten : L.GACHA_COST.one;
  if (pay === 'coin' && L.gachaCoinLeft(p) < n) { toast(`오늘 코인 모집은 ${L.gachaCoinLeft(p)}번 남았어요 (하루 ${L.GACHA_COIN_DAILY}번 · 모집권은 제한 없음)`); return; }
  if (pay === 'coin' && p.coins < cost) { toast(`코인이 부족해요 (${fmt(cost)} 필요) · 모집권은 미션·시즌·출석에서!`); return; }
  const r = await liveAct(API.gacha(n, pay, app.guest));
  if (!r) return;
  const list = r.results || [];
  const best = list.some((x) => x.k === 'legendHero' || x.k === 'epicHero' || x.k === 'mythGear' || x.k === 'sigGear') ? 'gold' : list.some((x) => x.k === 't3Card' || x.k === 'legendGear' || x.k === 'epicGear') ? 'purple' : 'blue';
  await gachaVideo('hero', best);
  await gachaShow(list);
  refresh();
}
// 모집·장비 결과: 뒷면이 먼저 등급 색으로 빛나고 (살짝 예고) → 탭하면 한 장씩 · "모두 열기"
//   보통·희귀: 휙 + 반짝 한 줄 · 영웅(보라): 들렸다가 보라 고리 + 흔들 · 전설(금): 어두워지고 금빛 기둥 · 천천히 돌며 빛살 + 꽃가루
//   신화·LEGEND 멤버: 전설 + 무지개 빛 + 화면 흔들 + 큰 그림 1.5초 (이름표) — 좋은 카드는 "모두 열기"에도 맨 끝에 제 연출 그대로
const GC_TIER = { sigGear: 'my', legendHero: 'my', mythGear: 'my', epicHero: 'lg', legendGear: 'lg', t3Card: 'ep', epicGear: 'ep', rareGear: 'ra', t2Card: 'ra', shard10: 'co', shard4: 'co' };
const GC_RANK = { co: 0, ra: 1, ep: 2, lg: 3, my: 4 };
function gcSfx(t) { try { ({ co: () => A.sfx.card(), ra: () => A.sfx.confirm(), ep: () => A.sfx.levelUp(), lg: () => { A.sfx.win(); A.sfx.slam(); }, my: () => { A.sfx.ult(); setTimeout(() => A.sfx.win(), 300); } })[t](); } catch { /* 무시 */ } }
function gachaShow(list) {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    const rm = document.body.classList.contains('rm');
    m.className = 'gacha-res v3' + (rm ? ' still' : '');
    const tierOf = (x) => GC_TIER[x.k] || (x.gear ? ({ myth: 'my', legend: 'lg', epic: 'ep', rare: 'ra' })[x.gear.r] || 'co' : 'co');
    // 좋은 카드는 맨 뒤로 (등급 낮은 것부터)
    if (list.length > 1) list.sort((a, b) => GC_RANK[tierOf(a)] - GC_RANK[tierOf(b)]);
    const rar = (x) => (x.k === 'legendHero' ? 'lg' : x.k === 'epicHero' ? 'ep' : x.k === 't3Card' ? 'rgear' : x.k === 'mythGear' || x.k === 'sigGear' ? 'lg' : x.k === 'legendGear' ? 'lgear' : x.k === 'epicGear' ? 'egear' : x.k === 'rareGear' ? 'rgear' : 'sh');
    m.innerHTML = `<div class="gr-dim"></div><div class="gr-grid n${list.length}">${list.map((x, i) => { const t = tierOf(x); return `<div class="gcard ${rar(x)} t-${t} ${x.k === 'sigGear' ? 'sig' : ''}" data-i="${i}" style="--i:${i}"><i class="gc-rays"></i><i class="gc-pillar"></i><div class="gc-in"><div class="gc-back"><img class="gc-bk" src="/img/lb/ui2/${t === 'my' ? 'prism' : 'star_gold'}.webp" alt="" draggable="false"></div><div class="gc-front">${gachaFace(x)}${x.new ? '<img class="gc-newb" src="/img/lb/ui2/badge_new.webp" alt="NEW">' : ''}</div></div><i class="gc-shine"></i></div>`; }).join('')}</div>
      <div class="gr-btns"><button class="btn gr-all">모두 열기</button><button class="btn primary gr-ok" hidden>확인</button></div><p class="gr-skip">카드를 눌러 한 장씩 열어요</p><div class="gr-zoom" hidden></div>`;
    stage.appendChild(m);
    const cards = [...m.querySelectorAll('.gcard')];
    let done = false, busy = false, opened = 0;
    const finish = () => { if (done) return; done = true; m.remove(); resolve(); };
    const shake = (px) => { if (rm) return; m.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${px}px,${-px / 2}px)` }, { transform: `translate(${-px}px,${px / 2}px)` }, { transform: 'translate(0,0)' }], { duration: 280 }); };
    const confetti = (c, n, cols) => { if (rm) return; const r0 = c.getBoundingClientRect(), mr = m.getBoundingClientRect(); for (let k = 0; k < n; k++) { const s = document.createElement('i'); s.className = 'gr-cf'; s.style.left = (r0.left - mr.left + r0.width / 2) + 'px'; s.style.top = (r0.top - mr.top + r0.height / 2) + 'px'; s.style.background = cols[k % cols.length]; s.style.setProperty('--dx', ((Math.random() - 0.5) * 320).toFixed(0) + 'px'); s.style.setProperty('--dy', (-80 - Math.random() * 260).toFixed(0) + 'px'); s.style.setProperty('--r', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg'); m.appendChild(s); setTimeout(() => s.remove(), 1500); } };
    const shardFlow = (c) => { if (rm) return; const r0 = c.getBoundingClientRect(), mr = m.getBoundingClientRect(); for (let k = 0; k < 7; k++) { const s = document.createElement('i'); s.className = 'gr-sh'; s.style.left = (r0.left - mr.left + r0.width / 2) + 'px'; s.style.top = (r0.top - mr.top + r0.height * 0.7) + 'px'; s.style.setProperty('--dx', ((Math.random() - 0.5) * 60).toFixed(0) + 'px'); s.style.animationDelay = (k * 50) + 'ms'; m.appendChild(s); setTimeout(() => s.remove(), 1200); } };
    const zoom = (x, t) => new Promise((ok) => { // 큰 그림 1.5초 (신화 · LEGEND)
      const z = m.querySelector('.gr-zoom');
      if (x.k === 'sigGear' && x.gear && GEAR[x.gear.t]) { // 전용 신화: 큰 "신화 획득!" — 장비 그림 + 주인 멤버 + 새 효과
        const g = GEAR[x.gear.t], hd = HEROES[g.hero];
        z.innerHTML = `<i class="grz-prism"></i><i class="grz-sig"></i><img class="grz-art sig" src="${hqSrc(g.hero) || hd.img}" alt=""><span class="grz-gear sig">${gearIco(x.gear)}</span><div class="grz-plate sig"><em>신화 획득!</em><b>${esc(g.name)}</b><small>${esc(hd.name)} 전용 · ${esc(g.desc)}</small></div>`;
        z.hidden = false; z.className = 'gr-zoom on sig'; fx.flash('#ff4fd8', 0.5);
        setTimeout(() => { z.className = 'gr-zoom out sig'; setTimeout(() => { z.hidden = true; ok(); }, 300); }, rm ? 1400 : 2800);
        return;
      }
      const d = x.hero && HEROES[x.hero];
      const art = d ? `<img class="grz-art" src="${hqSrc(x.hero) || d.img}" alt="">` : x.gear ? `<span class="grz-gear">${gearIco(x.gear)}</span>` : '';
      const nm = d ? `${t === 'my' ? 'LEGEND ' : ''}${esc(d.name)}!` : x.gear ? `신화 ${esc(GEAR[x.gear.t].name)}!` : '';
      z.innerHTML = `<i class="grz-prism"></i>${art}<div class="grz-plate"><b>${nm}</b><small>${d ? esc(d.role.replace(/^(HIDDEN|LEGEND) · /, '')) : '신화 장비'}</small></div>`;
      z.hidden = false; z.className = 'gr-zoom on';
      setTimeout(() => { z.className = 'gr-zoom out'; setTimeout(() => { z.hidden = true; ok(); }, 300); }, rm ? 900 : 1500);
    });
    const flip = async (c, full) => {
      if (c.classList.contains('flip') || c.dataset.busy) return;
      c.dataset.busy = '1';
      const x = list[Number(c.dataset.i)], t = tierOf(x);
      if (!rm && full && (t === 'lg' || t === 'my')) { // 전설·신화: 어두워지고 금빛 기둥 → 천천히 돌며
        m.classList.add('dim'); c.classList.add('pillar'); A.sfx.heartbeat && A.sfx.heartbeat(); await sleep(650);
        c.classList.add('slow');
      } else if (!rm && full && t === 'ep') { c.classList.add('lift'); await sleep(260); }
      c.classList.add('flip');
      gcSfx(t);
      if (!rm) {
        if (t === 'co' || t === 'ra') c.classList.add('shine');
        if (t === 'ep') { c.classList.add('burst'); shake(4); confetti(c, 8, ['#c77dff', '#e8c8ff', '#fff']); }
        if (t === 'lg' || t === 'my') { await sleep(full ? 700 : 250); c.classList.add('rays'); fx.flash('#ffd23f', 0.35); confetti(c, 26, t === 'my' ? ['#ff5f6d', '#ffc371', '#7bff9a', '#5fd4ff', '#b77bff'] : ['#ffd23f', '#fff3b0', '#ff9a2a']); shake(t === 'my' ? 9 : 5); }
      }
      if (x.dup || (!x.new && x.shards)) shardFlow(c);
      if (x.card && x.new) { await sleep(rm ? 100 : 300); await showJoinReveal(x.hero, LEGEND_HEROES.includes(x.hero) ? 'legend' : t === 'lg' || t === 'my' ? 'epic' : 'new'); }
      else if (full && t === 'my') await zoom(x, t);
      m.classList.remove('dim'); c.classList.remove('pillar');
      opened++;
      delete c.dataset.busy;
      if (opened >= cards.length) { m.querySelector('.gr-ok').hidden = false; m.querySelector('.gr-all').hidden = true; m.querySelector('.gr-skip').hidden = true; }
    };
    const openAll = async () => { // 낮은 카드는 빠르게 · 영웅 이상은 맨 끝에 한 장씩 제 연출
      if (busy) return; busy = true;
      for (const c of cards) { const t = tierOf(list[Number(c.dataset.i)]); if (GC_RANK[t] < 2 && !c.classList.contains('flip')) { flip(c, false); await sleep(70); } }
      await sleep(250);
      for (const c of cards) if (!c.classList.contains('flip')) await flip(c, true);
      busy = false;
    };
    m.addEventListener('click', (ev) => {
      if (ev.target.closest('.gr-ok')) { finish(); return; }
      if (ev.target.closest('.gr-all')) { openAll(); return; }
      const c = ev.target.closest('.gcard'); if (c && !busy) flip(c, true);
    });
    if (cards.length === 1) setTimeout(() => flip(cards[0], true), 450); // 1회: 저절로
  });
}
function gachaFace(x) {
  if (x.hero && x.card) {
    const d = HEROES[x.hero];
    const pr = x.new ? '합류!' : x.dup ? `★조각 +${x.shards}` : `${x.have}/${x.need}`;
    return `<span class="gc-thumb">${thumbSrc(x.hero) ? `<img class="fz" data-face="${x.hero}" style="${faceImgStyle(x.hero, 0.3, 0.42)}" src="${thumbSrc(x.hero)}" alt="" onerror="this.onerror=null;this.src='${d.img}'">` : av(d)}</span><b>${d.name} 카드</b><small>+${x.shards}장 · ${pr}</small>${!x.dup && x.need ? `<i class="gc-prog"><b style="width:${Math.round(((x.new ? x.need : x.have) / x.need) * 100)}%"></b></i>` : ''}`;
  }
  if (x.k === 'sigGear' && !x.gear) return `<span class="gi">${ic('prism', '', '')}</span><b>신화 조각</b><small style="color:${SIG_COLOR}">+${x.sigShards} (겹침)</small>`;
  if (x.k === 'sigGear') return `<span class="gi">${gearIco(x.gear)}</span><b>${esc(GEAR[x.gear.t].name)}</b><small style="color:${SIG_COLOR}">전용 신화 · ${esc(HEROES[GEAR[x.gear.t].hero].name)}</small>`;
  if (x.gear) return `<span class="gi">${gearIco(x.gear)}</span><b>${esc(GEAR[x.gear.t].name)}</b><small style="color:${GEAR_RARITY[x.gear.r].color}">${GEAR_RARITY[x.gear.r].name}${x.gear.sold ? ' → 코인' : ''}</small>`;
  const d = HEROES[x.hero];
  return `${av(d)}<b>${d.name} 조각</b><small>+${x.shards}</small>`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 새 멤버 합류 연출 (모집 카드가 다 모였을 때 · 스테이지 클리어 합류) ─────────
// 카드 조각이 모여 → 빛으로 깨지고 → 어두운 화면에 빛기둥 → 큰 전신 그림이 확대되며 등장 → 이름 · "NEW MEMBER 합류!" 쾅
const DEX_CATCH = {
  bangjang: '"공지! 오늘도 랑방은 내가 지킨다!"', staff: '"경고 한 번, 두 번… 세 번이면 아웃이에요."', gunman: '"건전하게, 정확하게."', gunnyeo: '"다친 사람 먼저! 입구는 제가 고칠게요."',
  myunghoon: '"#@!% … 아, 미안. 조용히 해 줄래?"', dohoon: '"앵콜! 앵콜! 마이크는 안 놔!"', ingyu: '"오 그거 근육 자극 좋다."', donghan: '"…이제 좀 해볼까?"', youngjun: '"들어간다. 따라오지 마."',
  eunok: '"한 잔만… 딱 한 잔만 할게."', hanna: '"윙크 받을 준비 됐어?"', sunggu: '"요즘 것들은… 내가 보여 주마."', junseo: '"잠깐, 내 친구 소개해 줄게!"', hyungyeong: '"다이어트는 내일부터! 오늘은 박치기!"',
  ara: '"공주님 등장~ 아이고 허리야…"', hochan: '"랑방을 위하여!!"',
  soyoung: '"그러니까 내가 뭐랬어!"', jieun: '"…시간아 멈춰라."', sanghwa: '"좋은남자 박상화!"', jungmin: '"가만있어 봐, 붙여 줄게."',
};
function showJoinReveal(id, kind = 'new') {
  return new Promise((resolve) => {
    const d = HEROES[id];
    if (!d) { resolve(); return; }
    const rm = document.body.classList.contains('rm');
    const lg = kind === 'legend';
    const col = lg ? '#ffd23f' : kind === 'epic' ? '#c77dff' : kind === 'hidden' ? '#ff4fd8' : ATTRS[d.attr].color;
    const m = document.createElement('div');
    m.className = `reveal join ${kind} ${rm ? 'still' : ''}`;
    m.style.setProperty('--c', col);
    const shards = Array.from({ length: rm ? 0 : 10 }, (_, i) => `<i style="--a:${i * 36}deg;--d:${(i * 0.04).toFixed(2)}s"></i>`).join('');
    const storm = lg && !rm ? Array.from({ length: 36 }, (_, i) => `<i style="--x:${(i * 29) % 100}%;--d:${((i * 0.13) % 2.4).toFixed(2)}s;--s:${(0.6 + (i % 5) * 0.2).toFixed(1)}"></i>`).join('') : '';
    m.innerHTML = `<div class="jr-shards">${shards}</div><img class="jr-flash" src="/img/lb/fx/explo_gold.webp" alt="" onerror="this.remove()"><img class="jr-ring" src="/img/lb/fx/shock_ring.webp" alt="" onerror="this.remove()">
      <div class="jr-pillar"></div>${storm ? `<div class="jr-storm">${storm}</div>` : ''}
      <div class="jr-art ${hasDuo(id) ? 'duo' : ''}">${hqSrc(id) ? `<img src="${hasDuo(id) ? `/img/lb/dexhq/${id}_duo.webp` : hqSrc(id)}" alt="" draggable="false" onerror="this.onerror=null;this.src='${dexSrc(id, d.img)}'">` : `<span class="dx-emo big">${d.emoji}</span>`}${lg ? '<span class="jr-crown"></span>' : ''}</div>
      <div class="jr-text"><div class="jr-tag">NEW MEMBER 합류!</div><div class="jr-name">${esc(d.name)}</div><div class="jr-title">${lg ? 'LEGEND · ' : kind === 'hidden' ? 'HIDDEN · ' : ''}${esc(d.role.replace(/^(HIDDEN|LEGEND) · /, ''))}</div><p class="jr-catch">${esc(FLAVOR[id] || DEX_CATCH[id] || '')}</p></div>
      <p class="rv-skip">탭해서 계속</p>`;
    stage.appendChild(m);
    A.sfx.reveal && A.sfx.reveal(lg ? 'legend' : kind === 'hidden' ? 'hidden' : 'epic');
    setTimeout(() => { fx.addShake(lg ? 16 : 10); if (navigator.vibrate && gwPref('vibrate') && app.touched) { try { navigator.vibrate(lg ? [60, 40, 60, 40, 220] : [50, 30, 140]); } catch { /* 무시 */ } } }, rm ? 0 : 900);
    let closed = false, t0 = performance.now();
    const close = () => { if (closed) return; closed = true; m.classList.add('out'); setTimeout(() => { m.remove(); resolve(); }, 240); };
    m.addEventListener('click', () => { if (performance.now() - t0 > (rm ? 200 : 1300)) close(); else m.classList.add('fast'); });
  });
}
// ─── "와 떴다!" 등장 연출 (HIDDEN · LEGEND · 영웅) ─────────
function showReveal(id, kind) {
  return new Promise((resolve) => {
    const d = HEROES[id];
    if (!d) { resolve(); return; }
    const rm = document.body.classList.contains('rm');
    const m = document.createElement('div');
    m.className = `reveal ${kind}`;
    const word = kind === 'legend' ? 'LEGEND!!' : kind === 'hidden' ? 'HIDDEN 등장!' : kind === 'epic' ? '영웅 등장!' : '새 멤버!';
    const conf = Array.from({ length: rm ? 0 : 26 }, (_, i) => `<i style="--i:${i};--x:${(i * 41) % 100}%;--r:${(i * 67) % 360}deg"></i>`).join('');
    m.innerHTML = `<div class="rv-pillar"></div><div class="rv-burst"></div><div class="rv-conf">${conf}</div>
      <div class="rv-card"><div class="rv-in"><div class="rv-back">${kind === 'legend' ? '' : ''}</div><div class="rv-front">${hqSrc(id) ? `<img class="rv-hq" src="${hqSrc(id)}" alt="" draggable="false">` : av(d)}${kind === 'legend' ? '<span class="rv-crown"></span>' : ''}</div></div></div>
      <div class="rv-word">${word}</div><div class="rv-name">${d.name}<small>${esc(d.role.replace(/^(HIDDEN|LEGEND) · /, ''))}</small></div><p class="rv-skip">탭해서 넘기기</p>`;
    stage.appendChild(m);
    A.sfx.reveal && A.sfx.reveal(kind);
    try {
      if (navigator.vibrate && gwPref('vibrate')) navigator.vibrate(kind === 'legend' ? [60, 40, 60, 40, 200] : [50, 30, 120]);
    } catch { /* 무시 */ }
    fx.addShake(kind === 'legend' ? 14 : 8);
    let closed = false;
    const close = () => { if (closed) return; closed = true; m.classList.add('out'); setTimeout(() => { m.remove(); resolve(); }, 220); };
    m.addEventListener('click', close);
    setTimeout(close, kind === 'legend' ? 3000 : 2400);
  });
}

// ─── 멤버 (강화 · 승급 · 설명) ───────────────────────
function showMembers() {
  app.screen = 'members';
  hud.hidden = true;
  const p = P();
  const list = ['bangjang', ...partnerList()];
  const cards = list.map((id) => {
    const d = HEROES[id];
    const ok = API.heroUnlocked(p, id);
    const st = L.heroStar(p, id);
    const can = ok && st < L.STAR_MAX && (p.shards[id] | 0) >= L.STAR_SHARDS[st];
    return artCard(id, { ok, dot: can });
  }).join('');
  const cardsOld = list.map((id) => {
    const d = HEROES[id];
    const ok = API.heroUnlocked(p, id);
    const st = L.heroStar(p, id);
    const can = ok && st < L.STAR_MAX && (p.shards[id] | 0) >= L.STAR_SHARDS[st];
    const tag = d.legend ? 'LEGEND' : d.hidden ? 'HIDDEN' : d.gacha ? '모집' : '';
    return `<button class="mcard ${ok ? '' : 'locked'} ${d.legend ? 'lg' : d.hidden ? 'hid' : d.gacha ? 'ep' : ''}" data-act="heroCard" data-id="${id}" style="--c:${d.color}">
      ${av(d, ok ? '' : 'sil')}<span class="chips">${tag ? `<em class="tg">${tag}</em>` : ''}${d.legend ? '' : `<i class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]}</i>`}<span class="pa">${ATTRS[d.attr].icon}</span></span>
      <b>${ok ? d.name : '???'}</b><small>${ok ? `<span class="st">${'★'.repeat(st)}</span> +${p.heroes[id] | 0}` : esc(HERO_UNLOCK[id] ? `${stageLabel(HERO_UNLOCK[id])} 클리어` : d.gacha ? '모집에서' : '')}</small>${rdot(can)}</button>`;
  }).join('');
  show(`
    ${subTop('멤버')}
    <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>멤버를 누르면 자세한 설명 · 강화 · ★승급 · 장비</span></p>
    <div class="agrid">${cards}</div>
    ${navHtml('members')}
  `, 'dim withnav');
}
// ─── 그림 카드: 멤버 목록 · 가방 · 덱에서 공용 (dexhq 썸네일, 상반신 · 티어 테두리 · 두 모습이면 번갈아) ───
const thumbSrc = (id, duo) => (NO_HQ_ART.has(id) ? (HEROES[id] || SUMMONS[id] || {}).img || '' : `/img/lb/dexhq/thumb/${id}${duo ? '_duo' : ''}.webp`);
function artCard(id, o = {}) {
  const d = HEROES[id];
  const p = P();
  const ok = o.ok !== undefined ? o.ok : API.heroUnlocked(p, id);
  const t = heroTier(id), lv = (p.heroes || {})[id] | 0, st = L.heroStar(p, id);
  const fb = DEX_FACE[id] || [0.48, 0.09, 0.15];
  // 상반신: 얼굴이 위쪽 1/4 쯤 오게 확대
  const z = Math.max(1.35, Math.min(2.2, 0.32 / fb[2]));
  // 카드(3:4) 안에서 얼굴 가운데가 (50%, 22%) 에 오게 · 그림이 카드 밖으로 비지 않게
  const hRel = 1.5 * z * 0.75; // 그림 높이 ÷ 카드 높이
  void hRel;
  const src = thumbSrc(id), fall = hqSrc(id) || d.img;
  const duo = false; // 작은 카드엔 두 모습 그림을 안 쓴다 (한 모습 · 얼굴 맞춤)
  const art = !src && !fall ? `<span class="dx-emo">${d.emoji}</span>`
    : duo ? `<span class="ac-duo" style="background-image:url('${thumbSrc(id, true)}')"></span><span class="ac-duo b" style="background-image:url('${thumbSrc(id, true)}')"></span>`
      : `<img class="ac-img fz" data-face="${id}" src="${src || fall}" alt="" decoding="async" draggable="false" style="${o.face ? faceCircStyle(id, o.face[0], o.face[1]) : faceImgStyle(id)}"${o.face ? ' data-fc="1"' : ''} onerror="this.onerror=null;this.src='${fall}'">`; // 얼굴 맞춤 (가운데 · 위쪽 36%)
  const pr = !ok && (GACHA_HEROES.includes(id) || LEGEND_HEROES.includes(id)) ? L.cardProgress(p, id) : null;
  const sub = ok ? `${'★'.repeat(st)}${lv ? ` · +${lv}` : ''}` : pr ? `카드 ${pr[0]}/${pr[1]}` : HERO_UNLOCK[id] ? `${stageLabel(HERO_UNLOCK[id])} 클리어` : '모집';
  return `<button class="acard t${t} ${ok ? '' : 'locked'} ${o.on ? 'on' : ''} ${o.cls || ''}" data-act="${o.act || 'heroCard'}" data-id="${id}" style="--c:${ATTRS[d.attr].color}">
    <span class="ac-art">${art}</span>
    <i class="ac-tier" data-gl="tier:${t}">${TIER_NAME[t]}</i><span class="ac-attr" data-gl="attr:${d.attr}" style="--ac:${ATTRS[d.attr].color}">${attrIco(d.attr)}<small>${ATTRS[d.attr].name}</small></span>
    <span class="ac-foot"><b>${ok ? esc(d.name) : '???'}</b><small>${sub}</small>${pr ? `<i class="ac-prog"><b style="width:${Math.round((pr[0] / pr[1]) * 100)}%"></b></i>` : ''}</span>${ok && TWUI ? TWUI.cardBadge(id) : ''}${ok ? BKX.cardBadge(id) : ''}${o.extra || ''}${o.dot ? '<i class="rd"></i>' : ''}</button>`;
}
// ─── 덱 탭: 큰 그림 카드 덱 + 전투력 + 모음 (필터 · 전투력 순) ───
// 역할 배지 그림 · 용어 풀이 (칩·배지를 누르면 말풍선)
const ROLE_IC = { splash: 'role_aoe', boss: 'role_burst', ctrl: 'role_cc', heal: 'role_heal' };
const ROLE_TXT = { splash: ['범위', '여러 진상을 한 번에 때려요 · 떼거리에 강해요'], boss: ['한 방', '센 한 방으로 보스·정예를 잡아요'], ctrl: ['제어', '기절·느리게·끌어오기로 진상을 묶어요'], heal: ['회복', '입구를 고치고 멤버를 지켜요'] };
const CLASS_TXT = { seduce: '꼬시고 홀리는 진상 · 멤버를 홀려 멈추게 해요', violent: '힘으로 밀고 들어오는 진상 · 단단하고 입구를 세게 쳐요', politic: '말과 편 가르기로 괴롭히는 진상 · 버프·방해가 많아요', jerk: '민폐형 진상 · 빠르거나 터지거나 훔쳐 가요' };
const ATTR_TXT = { talk: '말로 몰아붙이는 멤버', power: '힘으로 밀어붙이는 멤버', charm: '매력으로 홀리는 멤버', booze: '술로 판을 뒤집는 멤버' };
const TIER_TXT = { 1: ['T1', '기본 멤버 · 처음부터 함께'], 2: ['T2', '흔한 멤버 · 모집에서 자주 나와요'], 3: ['T3', '희귀 멤버 · 성장 폭이 커요'], 4: ['T4', '영웅 멤버 · 모집 확률 낮음'], 5: ['LEGEND', '전설 · 4-10 클리어 후 모집'] };
function glossLine(key) {
  const [kind, v] = key.split(':');
  if (kind === 'attr' && ATTRS[v]) { const strong = Object.keys(CLASSES).filter((c) => typeMul(v, c) > 1).map((c) => CLASSES[c].name); const weak = Object.keys(CLASSES).filter((c) => typeMul(v, c) < 1).map((c) => CLASSES[c].name); return [ATTRS[v].name, `${strong.join('·') || '-'} 진상에 강하고 ${weak.join('·') || '-'} 진상에 약해요`, ATTR_TXT[v] || '']; }
  if (kind === 'role' && ROLE_TXT[v]) return [ROLE_TXT[v][0], ROLE_TXT[v][1]];
  if (kind === 'cls' && CLASSES[v]) { const at = key.split(':')[2]; const mul = at && ATTRS[at] ? typeMul(at, v) : 1; const who = Object.keys(ENEMIES).filter((e) => ENEMIES[e].cls === v && !ENEMIES[e].boss && !ENEMIES[e].mid && !ENEMIES[e].dot && dexKnown('enemy', e)).slice(0, 5); return [`${CLASSES[v].name} 진상`, CLASS_TXT[v] || '', at && ATTRS[at] ? `${ATTRS[at].name} 멤버는 이 진상에게 피해 ×${mul.toFixed(2)} (${mul > 1 ? `${Math.round((mul - 1) * 100)}% 더` : mul < 1 ? `${Math.round((1 - mul) * 100)}% 덜` : '보통'})` : '', who]; }
  if (kind === 'mul') { const x = Number(v) || 1; return ['이번 스테이지 상성', x > 1.001 ? `이 멤버는 이번 스테이지에서 피해 ${Math.round((x - 1) * 100)}% 더` : x < 0.999 ? `이 멤버는 이번 스테이지에서 피해 ${Math.round((1 - x) * 100)}% 덜` : '이번 스테이지와는 보통이에요', '나오는 진상 종류 비율로 계산해요']; }
  if (kind === 'tier' && TIER_TXT[v]) return [TIER_TXT[v][0], TIER_TXT[v][1], `최대 강화 +${metaMaxOf ? metaMaxOfTier(+v) : 20}`];
  return null;
}
function metaMaxOfTier(t) { const id = Object.keys(HEROES).find((h) => heroTier(h) === t); return id ? metaMaxOf(id) : 20; }
function glossTip(el, key) {
  const L0 = glossLine(key); if (!L0) return false;
  for (const o of stage.querySelectorAll('.gl-tip')) o.remove();
  const r = el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const t = document.createElement('div');
  t.className = 'gl-tip';
  t.innerHTML = `<b>${esc(L0[0])}</b><span>${esc(L0[1])}</span>${L0[2] ? `<small>${esc(L0[2])}</small>` : ''}${Array.isArray(L0[3]) && L0[3].length ? `<span class="gl-faces">${L0[3].map((e) => `<img src="${ENEMIES[e].img}" alt="" title="${esc(ENEMIES[e].name)}"${ENEMIES[e].fb ? ` onerror="this.onerror=null;this.src='${ENEMIES[e].fb}';this.style.filter='hue-rotate(160deg) saturate(1.3)'"` : ''}>`).join('')}</span>` : ''}`;
  t.style.pointerEvents = 'none';
  stage.appendChild(t);
  const w = t.offsetWidth;
  t.style.left = Math.max(8, Math.min(sr.width - w - 8, r.left - sr.left + r.width / 2 - w / 2)) + 'px';
  const top = r.top - sr.top - t.offsetHeight - 8;
  t.style.top = (top < 8 ? r.bottom - sr.top + 8 : top) + 'px';
  clearTimeout(glossTip.t); glossTip.t = setTimeout(() => t.remove(), 2600);
  return true;
}
// 길게 누르면(0.4초) 말풍선 · 짧게 누르면 원래 동작 — 배지·칩 어디서나
let glT = 0;
stage.addEventListener('pointerdown', (ev) => { const el = ev.target.closest('[data-gl]'); if (!el || !el.dataset.gl) return; clearTimeout(glT); glT = setTimeout(() => { if (glossTip(el, el.dataset.gl)) { ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 350); } }, 400); }, { passive: true });
for (const t0 of ['pointerup', 'pointercancel', 'pointerleave']) stage.addEventListener(t0, () => clearTimeout(glT), { passive: true });
function showGlossary() {
  const at = Object.keys(ATTRS);
  const wheel = `<svg class="gl-wheel" viewBox="0 0 200 200" aria-label="속성 상성">${at.map((a, i) => { const ang = -Math.PI / 2 + (i * Math.PI * 2) / at.length, x = 100 + Math.cos(ang) * 70, y = 100 + Math.sin(ang) * 70; return `<g><circle cx="${x}" cy="${y}" r="24" fill="${ATTRS[a].color}" stroke="#000" stroke-width="3"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="14" font-weight="900" fill="#fff" stroke="#000" stroke-width="3" paint-order="stroke">${esc(ATTRS[a].name)}</text></g>`; }).join('')}</svg>`;
  const attrRows = at.map((a) => { const l = glossLine('attr:' + a); return `<div class="gl-row">${attrIco(a)}<span><b>${esc(l[0])}</b><small>${esc(l[1])}</small></span></div>`; }).join('');
  const roleRows = Object.keys(ROLE_IC).map((k) => `<div class="gl-row"><img class="role-ic" src="/img/lb/ui2/${ROLE_IC[k]}.webp" alt=""><span><b>${ROLE_TXT[k][0]}</b><small>${ROLE_TXT[k][1]}</small></span></div>`).join('');
  const tierRows = [1, 2, 3, 4, 5].map((t) => `<div class="gl-row"><i class="tier t${t}">${TIER_NAME[t]}</i><span><b>${TIER_TXT[t][0]}</b><small>${TIER_TXT[t][1]} · 최대 +${metaMaxOfTier(t)}</small></span></div>`).join('');
  const momRow = `<div class="gl-row"><img class="role-ic" src="/img/lb/ui2/megaphone.webp" alt=""><span><b>기세 (총공지 둘레 3칸)</b><small>멤버 스킬을 쓸 때마다 1칸씩 써요 (LEGEND 멤버는 2칸) · 시간이 지나고 진상을 잡으면 다시 차요 · 2칸이 차고 총공지 충전이 끝나면 총공지!</small></span></div>`;
  popup(`<h3>한눈에 보기</h3><h4 class="gl-h">기세</h4>${momRow}<h4 class="gl-h">속성</h4>${attrRows}<h4 class="gl-h">역할</h4>${roleRows}<h4 class="gl-h">등급</h4>${tierRows}<p class="ip">배지나 칩을 꾹 누르면 설명이 떠요</p>`, 'pp-gloss');
  void wheel;
}
const ROLE_CHIPS = [['all', '전체'], ['t1', 'T1'], ['t2', 'T2'], ['t3', 'T3'], ['t4', 'T4'], ['t5', 'LEGEND'], ['a:talk', '말빨'], ['a:power', '힘'], ['a:charm', '매력'], ['a:booze', '술'], ['splash', '범위'], ['boss', '한 방'], ['ctrl', '제어'], ['heal', '회복']];
function refPower(p) { // 비교 기준: 다음 스테이지 추천 전투력 (기본 멤버 4명 · 그 스테이지쯤 강화)
  const s = nextStage(), m = Math.round(s * 0.25);
  const q = Object.assign({}, p, { heroes: Object.fromEntries(['bangjang', 'staff', 'gunman', 'gunnyeo'].map((h) => [h, m])), equip: {}, hstars: {} });
  return deckPower(q, ['bangjang', 'staff', 'gunman', 'gunnyeo']) * (1 + 0.05 * (chapterOf(s) - 1));
}
function showDeckTab() {
  app.screen = 'deck';
  hud.hidden = true;
  fixDeck();
  const p = P();
  const max = deckSlotsNow();
  const ids = deckList();
  const pw = deckPower(p, ids), ref = refPower(p);
  const diff = ref ? Math.round((pw / ref - 1) * 100) : 0;
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const id = ids[i];
    if (i >= max) { slots.push(`<button class="dk-lock" data-act="shop"><span>${ic('lock', '', 'sm')}</span><small>${i === max ? `${fmt(ITEMS[max < 5 ? 'slot5' : 'slot6'].costs[0])}` : ''}</small></button>`); continue; }
    slots.push(id ? `<span class="dk-s" data-dslot="${i}">${artCard(id, { act: 'deckRemove', cls: 'dk ' + (i === 0 ? 'lead ' : '') + (app.deckPop === id ? 'pop' : ''), extra: `<em class="dk-pw">${ic('swords', '', 'sm')}${fmt(heroPower(p, id))}</em>${i === 0 ? `<i class="pp-crown">${pimg(ui2('crown'))}</i>` : ''}` })}</span>` : `<div class="dk-empty" data-dslot="${i}"><i>+</i><small>아래에서 골라요</small></div>`);
  }
  app.deckPop = null;
  const f = app.deckFilter || 'all';
  const pass = (id) => f === 'all' || (f.startsWith('a:') ? HEROES[id].attr === f.slice(2) : f[0] === 't' ? heroTier(id) === Number(f.slice(1)) : (HERO_TAGS[id] || []).includes(f));
  const all = ['bangjang', ...partnerList()].filter(pass);
  const mine = all.filter((id) => API.heroUnlocked(p, id)).sort((a, b) => heroPower(p, b) - heroPower(p, a));
  const locked = all.filter((id) => !API.heroUnlocked(p, id));
  const coll = [...mine, ...locked].map((id) => artCard(id, { act: 'deckColl', on: ids.includes(id), dot: API.heroUnlocked(p, id) && L.heroStar(p, id) < L.STAR_MAX && (p.shards[id] | 0) >= L.STAR_SHARDS[L.heroStar(p, id)] })).join('');
  show(`
    ${subTop('멤버 강화')}
    <div class="dk-top">
      <div class="deck-tabs">${[0, 1, 2].map((k) => `<button class="${k === app.deckI ? 'on' : ''}" data-act="deckPresetT" data-k="${k}">덱 ${k + 1}</button>`).join('')}</div>
 <button class="btn ghost auto" data-act="autoDeckT">${ic('sparkle', '', 'sm')} 추천 덱</button>
 </div>
 <div class="dk-power"><small>덱 전투력</small><b id="dkPow" data-from="${app.lastDeckPow || pw}" data-to="${pw}">${fmt(pw)}</b><em class="${diff >= 0 ? 'up' : 'down'}">다음 스테이지 추천보다 ${diff >= 0 ? '+' : ''}${diff}%</em></div>
    <div class="dk-slots n${max}">${slots.join('')}</div>
    <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>${ids.length}/${max}명 · 누르면 넣기/빼기 · 끌어서 순서 · 1번 칸 = 대장</span></p>
    <div class="chips dk-chips">${ROLE_CHIPS.map(([k, n]) => `<button class="chip ${f === k ? 'on' : ''}" data-act="deckFilter" data-v="${k}" data-gl="${k.startsWith('a:') ? 'attr:' + k.slice(2) : ROLE_IC[k] ? 'role:' + k : /^t\d$/.test(k) ? 'tier:' + k.slice(1) : ''}">${k.startsWith('a:') ? attrIco(k.slice(2)) + ATTRS[k.slice(2)].name : ROLE_IC[k] ? `<img class="role-ic" src="/img/lb/ui2/${ROLE_IC[k]}.webp" alt="" draggable="false">${n.replace(/^\S+\s/, '')}` : n}</button>`).join('')}<button class="chip gl-open" data-act="glossary" aria-label="한눈에 보기">${ic('book', '', 'sm')}한눈에</button></div>
    <div class="agrid three">${coll || '<div class="empty-state"><span></span><b>이 조건의 멤버가 없어요</b></div>'}</div>
    ${navHtml('deck')}
  `, 'dim withnav deck-screen');
  // 전투력 숫자가 바뀌면 또르르
  const el = document.getElementById('dkPow');
  const a0 = Number(el.dataset.from), a1 = Number(el.dataset.to);
  if (a0 !== a1 && !document.body.classList.contains('rm')) { const t0 = performance.now(); const tick = () => { const k = Math.min(1, (performance.now() - t0) / 600); el.textContent = fmt(Math.round(a0 + (a1 - a0) * k)); if (k < 1) requestAnimationFrame(tick); else el.classList.add('bump'); }; tick(); }
  app.lastDeckPow = pw;
}
// 멤버 카드 팝업 (덱 짜기 · 멤버 화면 공용)
function showHeroModal(id, ctx = '') {
  const d = HEROES[id];
  if (!d) return;
  const p = P();
  const ok = API.heroUnlocked(p, id);
  const st = L.heroStar(p, id);
  const lv = p.heroes[id] | 0;
  const cost = ok ? API.costOf(p, id) : null;
  const needS = st < L.STAR_MAX ? L.STAR_SHARDS[st] : 0;
  const s = app.mode === 'weekly' ? L.weeklyDef(L.weekIndex()).stage : app.screen === 'prep' && app.mode === 'stage' ? app.stage : lobbyStage();
  const m = attrMatch(d.attr, s);
  const sw = strongWeak(d.attr);
  const eq = (p.equip || {})[id] || {};
  const t = heroTier(id);
  const tab = app.hmTab || 'info';
  const inDeck = curDeck().includes(id);
  const pw = heroPower(p, id);
  // 강화하면 전투력이 얼마나 오르나 (미리 보기)
  const pwNext = ok && cost !== null ? heroPower(Object.assign({}, p, { heroes: Object.assign({}, p.heroes, { [id]: lv + 1 }) }), id) : pw;
  const res = resOf(lv, heroGearStats(p, id).res);
  const duo = false; // 세로로 긴 칸: 가로 두 모습 그림은 작게 보여서 한 장 그림으로 (두 모습은 도감에서 "두 모습 보기")
  const artSrc = hqSrc(id);
  const rg = Array.isArray(d.range) ? d.range[0] : d.range;
  const legendNum = (v) => (d.legend ? `<b class="lgn">${v}</b>` : `<b>${v}</b>`);
  const perks = Object.entries(d.perks || {}).map(([k, v]) => `<li><b>Lv${k}</b> ${esc(v)}</li>`).join('');
  const slot = (k) => { const it = (p.gear || []).find((g) => g.id === eq[k]); return `<button class="gslot ${it ? 'r-' + it.r : ''}" data-act="gearSlot" data-hero="${id}" data-slot="${k}" ${ok ? '' : 'disabled'} style="--rc:${it ? GEAR_RARITY[it.r].color : '#555'}">${it ? gearIco(it) : ic(k === 'w' ? 'dagger' : k === 'm' ? 'prism' : 'ring', '', '')}<span class="gs-txt"><small>${it ? esc(GEAR[it.t].name) + (it.lv ? ` +${it.lv}` : '') : k === 'w' ? '무기 비었음' : k === 'm' ? '신화 비었음' : '장신구 비었음'}</small>${it ? `<em>${esc(gearStatText(it))}</em>` : ''}</span></button>`; };
  // 이 멤버에게 더 좋은 장비 (칸마다 두 개까지) — 누르면 바로 끼기
  const sugg = ['w', 'a'].map((k) => {
    const cur = (p.gear || []).find((g) => g.id === eq[k]);
    const list = (p.gear || []).filter((it) => GEAR[it.t].slot === k && it.id !== eq[k] && (!cur || gearScore(it) > gearScore(cur) + 1e-9)).sort((a, b) => gearScore(b) - gearScore(a)).slice(0, 2);
    return list.map((it) => `<button class="hf-sug" data-act="hfEquip" data-hero="${id}" data-slot="${k}" data-gid="${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${gearIco(it)}<span>${esc(GEAR[it.t].name)}${it.lv ? ` +${it.lv}` : ''}<small>${esc(gearStatText(it))}${equippedBy(p, it.id) ? ` · ${HEROES[equippedBy(p, it.id)].name} 것` : ''}</small></span><em>끼기</em></button>`).join('');
  }).join('');
  // ─── 강화 탭: 능력치 카드 · 큰 전투력 · 강화 막대 · 카드 칩 · 큰 강화 버튼 (꾹 누르면 연속) ───
  const statCard = (icn, label, a, b, unit = '') => `<div class="hs-card">${ic(icn, '', '')}<span class="hs-l">${label}</span><b class="hs-v">${a}${unit}</b>${b !== null && b !== undefined && b !== a ? `<em class="hs-d">${b}${unit}</em>` : ''}</div>`;
  const upBody = () => {
    if (!ok) return '';
    const a = heroLive(p, id, lv), b = cost !== null ? heroLive(p, id, lv + 1) : a;
    const mx = metaMaxOf(id), free = p.master && !p.testNormal, cn = free || cost === null ? 0 : heroCardNeed(lv), have = (p.shards[id] | 0) + (p.wild | 0);
    const can = cost !== null && (free || (p.coins >= cost && have >= cn));
    const notch = Array.from({ length: mx }, (_, k) => `<i class="${k < lv ? 'on' : ''} ${k === lv ? 'next' : ''}"></i>`).join('');
    app._hsUp = { id, can, cost, free, have, cn, lv, pw };
    return `<div class="hs-pow"><small>전투력</small><b class="hs-pw" data-to="${pw}">${fmt(pw)}</b>${pwNext > pw ? `<em class="hs-d">+${fmt(pwNext - pw)}</em>` : ''}</div>
      <div class="hs-bar"><div class="hs-notch">${notch}</div><span>강화 <b>+${lv}</b> / ${mx}</span></div>
      <div class="hs-grid">
        ${statCard('swords', '공격력', fmt(Math.round(a.dmg)), cost !== null ? fmt(Math.round(b.dmg)) : null)}
        ${statCard('speed', '공격 속도', a.aps.toFixed(2), cost !== null ? b.aps.toFixed(2) : null, '/초')}
        ${statCard('target', '사거리', String(rg), null)}
        ${statCard('shield', '상태이상', res ? `${Math.round(res * 100)}% 덜 걸림` : '-', null)}
      </div>
      <div class="hs-cards">${ic('aug_card', '', 'sm')}<span>카드 <b>${p.shards[id] | 0}</b>장${p.wild ? ` + 범용 <b>${p.wild}</b>` : ''}</span><button class="hs-pill" data-act="cardWhere">${ic('map', '', 'sm')}얻는 곳</button></div>
      <div class="hs-btns solo">
        <button hidden class="hs-up-old ${can ? '' : 'dim'}" data-act="buy" data-id="${id}" data-pw="${pw}" ${can ? '' : 'disabled'}><i class="gb-shine"></i><b>${cost === null ? 'MAX' : `강화 +${lv + 1}`}</b>${cost === null ? '' : `<span class="hs-cost">${free ? '공짜' : `<i class="ci"></i>${fmt(cost)} · ${ic('aug_card', '', 'sm')}${Math.min(have, 99)}/${cn}`}</span>`}</button>
        <button class="hs-star ${st < L.STAR_MAX && (p.shards[id] | 0) >= needS ? '' : 'dim'}" data-act="starUp" data-id="${id}" ${st < L.STAR_MAX && (p.shards[id] | 0) >= needS ? '' : 'disabled'}>${ic('star_gold', '', '')}<b>승급</b><small>${st >= L.STAR_MAX ? 'MAX' : `조각 ${p.shards[id] | 0}/${needS}`}</small></button>
      </div>
      <p class="hs-hint">꾹 누르면 계속 강화해요 · ★마다 공격력 +${Math.round(L.STAR_ATK * 100)}%</p>`;
  };
  // ─── 장비 탭: 캐릭터 둘레에 칸 (종이 인형) ───
  const gearBody = () => `<div class="hs-doll"><div class="hs-sil">${artSrc ? `<img src="${thumbSrc(id) || artSrc}" alt="" draggable="false">` : ''}</div>
      <div class="hs-gs w">${slot('w')}</div><div class="hs-gs a">${slot('a')}</div><div class="hs-gs m">${slot('m')}</div></div>
      ${sugg ? `<h4 class="hs-h">${ic('sparkle', '', 'sm')}더 좋은 장비</h4>${sugg}` : '<p class="ip">지금 제일 좋은 장비를 끼고 있어요</p>'}
      <button class="hs-pill wide" data-act="nav" data-tab="bag">${ic('ic_bag', '', 'sm')}장비 화면으로</button>`;
  // ─── 정보 탭: 한 줄 소개 인용 · 스킬 카드 · 무기 진화 · 상성 칩 ───
  const w = WEAPON[id], ev = EVO[id];
  const strong = Object.keys(CLASSES).filter((c0) => typeMul(d.attr, c0) > 1), weak = Object.keys(CLASSES).filter((c0) => typeMul(d.attr, c0) < 1);
  const infoBody = () => `<blockquote class="hs-quote">${esc(FLAVOR[id] || d.desc)}</blockquote>${ok ? BKX.heroHtml(id) : ''}
      <div class="hs-skill">${ic('swords', '', '')}<span><small>기본 공격</small><b>${esc((w && w.item) || '기본 공격')}</b><p>${esc(d.attack)}</p></span></div>
      <div class="hs-skill sk-ult"><img class="ic hs-skic" src="/img/lb/ui2/sk_${id}.webp" alt="" draggable="false"><span><small>스킬 · 쿨 ${d.skill.cd}초</small><b>${esc(d.skill.name)}</b><p>${esc(d.skill.desc)}</p>${SKILL_EVO[id] ? `<p class="evo">${ic('star_gold', '', 'sm')}진화: ${esc(SKILL_EVO[id])}</p>` : ''}</span></div>
      ${sigRowHtml(id)}
      ${w || ev ? `<div class="hs-tree"><span class="t0">${esc((w && w.item) || '기본')}</span><i></i><span class="t1">${ev ? esc(ev.name) : '진화'}</span></div>` : ''}
      ${(HERO_TAGS[id] || []).filter((t) => ROLE_IC[t]).length ? `<div class="hs-match hs-roles"><span>${ic('target', '', 'sm')}역할</span>${(HERO_TAGS[id] || []).filter((t) => ROLE_IC[t]).map((t) => `<button class="gl-chip role-chip" data-gl="role:${t}"><img class="role-ic" src="/img/lb/ui2/${ROLE_IC[t]}.webp" alt="">${ROLE_TXT[t][0]}</button>`).join('')}</div>` : ''}
      <div class="hs-match"><span class="ok">${ic('check', '', 'sm')}강한 상대</span>${strong.map((c0) => `<button class="gl-chip" data-gl="cls:${c0}:${d.attr}">${clsTag(c0)}</button>`).join('') || '<small>없음</small>'}</div>
      <div class="hs-match"><span class="no">${ic('scale', '', 'sm')}약한 상대</span>${weak.map((c0) => `<button class="gl-chip" data-gl="cls:${c0}:${d.attr}">${clsTag(c0)}</button>`).join('') || '<small>없음</small>'}</div>
      <button class="hm-match ${m.cls}" data-gl="mul:${(m.v || 1).toFixed(2)}"><b>${m.arrow} 이번 스테이지 상성 ${m.text}</b><small>눌러서 설명</small></button>
      ${perks ? `<div class="hm-sec"><h4>${ic('chart', '', 'sm')}레벨 효과</h4><ul>${perks}</ul></div>` : ''}
      ${ok && TWUI ? TWUI.heroInfoHtml(id) : ''}`;
  const body = tab === 'up' ? upBody() : tab === 'gear' ? gearBody() : infoBody();
  closeInfoCard();
  const box = document.createElement('div');
  box.className = `info-modal pop hero-pop hero-full ${d.legend ? 'lg' : ''}`;
  box.style.setProperty('--c', ATTRS[d.attr].color);
  const BG = { power: 'str', talk: 'talk', booze: 'drink', charm: 'charm' };
  box.classList.add('show-v2');
  box.innerHTML = `<div class="hs-stage" style="background-image:url('/img/lb/ui2/bg_attr_${BG[d.attr] || 'talk'}.webp')"><i class="hs-spot"></i><i class="hs-floor"></i><span class="hs-parts">${Array.from({ length: 10 }, (_, k) => `<i style="--x:${(k * 37) % 100}%;--d:${(k * 0.7) % 5}s;--t:${5 + (k % 4)}s"></i>`).join('')}</span></div>
    <div class="hf-art ${ok ? '' : 'sil'}" data-hf="poke">${artSrc ? `<img src="${artSrc}" alt="" draggable="false" onerror="this.onerror=null;this.src='${hqSrc(id) || d.img}'">` : ''}</div>
    <div class="hf-grad"></div>
    <button class="dp-x hf-x" data-hf="x" aria-label="닫기"></button>
    <div class="hf-head v2"><i class="tier t${t}">${TIER_NAME[t]}</i><span class="hn-attr" data-gl="attr:${d.attr}" style="--ac:${ATTRS[d.attr].color}">${attrIco(d.attr)}</span><b>${ok ? esc(d.name) : '???'}</b>${roleChip(id, 'hn-cat')}<small class="hn-role">${esc(d.role.replace(/^(HIDDEN|LEGEND) · /, ''))}</small><span class="hn-stars">${Array.from({ length: L.STAR_MAX }, (_, k) => `<i class="${k < st ? 'on' : ''}">★</i>`).join('')}</span></div>
    <div class="hf-tabs v2">${[['info', '정보'], ['up', '강화'], ['gear', '장비']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-hf="tab" data-k="${k}">${n}</button>`).join('')}</div>
    <div class="hf-body">${ok ? body : `<p class="ip">${ic('lock', '', 'sm')} ${esc(heroHow(id))}</p>${body}`}</div>
    <div class="hf-foot ${tab === 'up' && ok ? 'up' : ''}">${tab === 'up' && ok && app._hsUp && app._hsUp.id === id ? (() => { const u = app._hsUp; return `<button class="btn ghost hf-deck" data-act="${inDeck && deckList()[0] !== id ? 'edLead' : 'deckToggle'}" data-id="${id}">${inDeck ? (deckList()[0] === id ? '덱에서 빼기' : '대장으로') : '덱에 넣기'}</button><button class="hs-up ${u.can ? '' : 'dim'}" data-act="buy" data-id="${id}" data-pw="${u.pw}" ${u.can ? '' : 'disabled'}><i class="gb-shine"></i><b>${u.cost === null ? 'MAX' : `강화 +${u.lv + 1}`}</b>${u.cost === null ? '' : `<span class="hs-cost">${u.free ? '공짜' : `<i class="ci"></i>${fmt(u.cost)} · ${ic('aug_card', '', 'sm')}카드 ${u.cn}장 <small>(보유 ${u.have})</small>`}</span>`}</button>`; })() : `${ok && P().heroes && (P().heroes[id] !== undefined || owned().includes(id)) ? (() => { const pl = bestGearPlan(P(), id, false); return `<button class="btn hf-auto ${pl.length ? '' : 'dim'}" data-hf="auto" ${pl.length ? '' : 'aria-disabled="true"'}>${ic('sparkle', '', 'sm')}${pl.length ? '최적 장비' : '이미 최적'}${pl.length ? '<i class="rd"></i>' : ''}</button>`; })() : ''}${ok ? `<button class="btn ${inDeck ? 'ghost' : 'primary'}" data-act="deckToggle" data-id="${id}">${inDeck ? `덱 ${app.deckI + 1}에서 빼기` : `덱 ${app.deckI + 1}에 넣기`}</button>` : ''}<button class="btn ghost" data-act="heroInfo" data-id="${id}">${ic('ic_dex', '', 'sm')}도감</button>`}</div>`;
  stage.appendChild(box);
  // 최적 장비: 길게 누르면 "다른 멤버 것 포함"
  const ab = box.querySelector('[data-hf="auto"]');
  if (ab) {
    let lt = 0;
    ab.addEventListener('pointerdown', () => { lt = setTimeout(() => { box._lp = true; heroAutoEquip(id, true).then((ch) => { if (ch) showHeroModal(id, ctx); }); }, 550); });
    for (const t of ['pointerup', 'pointerleave', 'pointercancel']) ab.addEventListener(t, () => clearTimeout(lt));
  }
  // 강화 버튼 꾹: 0.45초마다 한 번 더
  let holdIv = 0;
  // 멈춤은 누를 때마다 새로 건다 (화면을 그릴 때 한 번만 걸면 다른 탭에서 먼저 쓰여 버려 한 번 눌러도 계속 강화되던 버그)
  box.addEventListener('pointerdown', (ev) => {
    const bu = ev.target.closest('.hs-up'); if (!bu || bu.disabled) return;
    clearInterval(holdIv); let n = 0;
    const iv = setInterval(() => { const cur = stage.querySelector('.hero-full .hs-up'); if (!cur || cur.disabled || ++n > 30) { clearInterval(iv); return; } if (n > 1) ACTS.buy(cur); }, 450);
    holdIv = iv;
    const stop = () => { clearInterval(iv); for (const t0 of ['pointerup', 'pointercancel', 'blur']) window.removeEventListener(t0, stop, true); };
    for (const t0 of ['pointerup', 'pointercancel', 'blur']) window.addEventListener(t0, stop, true);
  });
  const pwEl = box.querySelector('.hs-pw');
  if (pwEl && app.hsPrev && app.hsPrev.id === id && app.hsPrev.v !== pw) { const a = app.hsPrev.v, bv = pw, t1 = performance.now(); const stp = () => { const k = Math.min(1, (performance.now() - t1) / 700); pwEl.textContent = fmt(Math.round(a + (bv - a) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(stp); else pwEl.classList.add('done'); }; requestAnimationFrame(stp); }
  app.hsPrev = { id, v: pw };
  box.addEventListener('click', (ev) => {
    const gl = ev.target.closest('[data-gl]');
    if (gl && gl.dataset.gl) { glossTip(gl, gl.dataset.gl); A.sfx.tap(); return; }
    const b = ev.target.closest('[data-hf]');
    if (b) {
      if (b.dataset.hf === 'x') { closeInfoCard(); if (app.screen === 'deck') showDeckTab(); return; }
      if (b.dataset.hf === 'poke') { const a1 = box.querySelector('.hf-art'); a1.classList.remove('boing'); void a1.offsetWidth; a1.classList.add('boing'); A.sfx.tap(); const old = box.querySelector('.hs-bub'); if (old) old.remove(); const lines = (FLAVOR[id] || d.desc).split(/(?<=[.!?…~])\s+/).filter(Boolean); const bb = document.createElement('div'); bb.className = 'hs-bub'; bb.textContent = lines[(Math.random() * lines.length) | 0]; box.appendChild(bb); setTimeout(() => bb.remove(), 2600); return; }
      if (b.dataset.hf === 'tab') { app.hmTab = b.dataset.k; A.sfx.tabSw(); showHeroModal(id, ctx); }
      if (b.dataset.hf === 'auto') { if (box._lp) { box._lp = false; return; } heroAutoEquip(id, false).then(() => showHeroModal(id, ctx)); }
      return;
    }
    const a0 = ev.target.closest('[data-act]');
    if (!a0 || a0.disabled) return;
    A.unlock(); A.sfx.tap();
    if (ACTS[a0.dataset.act]) ACTS[a0.dataset.act](a0);
  });
}
// 속성 vs 스테이지 적 구성: ▲ 유리 · ▼ 불리
function attrMatch(attr, s) {
  const sc = s ? attrScores(s)[attr] : 1;
  if (sc >= 1.25) return { cls: 'good', arrow: '▲', text: `유리 ×${sc.toFixed(2)}`, v: sc };
  if (sc <= 0.9) return { cls: 'bad', arrow: '▼', text: `불리 ×${sc.toFixed(2)}`, v: sc };
  return { cls: 'mid', arrow: '■', text: `보통 ×${sc.toFixed(2)}`, v: sc };
}
async function doStarUp(id) {
  const r = await liveAct(API.starUp(id, app.guest));
  if (!r) return;
  A.sfx.levelUp(); fx.flash('#ff9ff0', 0.3);
  toast(`${HEROES[id].name} ★${L.heroStar(P(), id)} 승급!`, 2000);
  showHeroModal(id, app.screen === 'prep' ? 'prep' : '');
  refreshBehind();
}
function refreshBehind() {
  // 팝업 뒤 화면만 새로 (팝업은 그대로)
  const pop = stage.querySelector('.info-modal.pop');
  if (pop) pop.remove();
  const keep = pop;
  refresh();
  if (keep) stage.appendChild(keep);
}

// ─── 미션 · 업적 ─────────────────────────────────────
function showMissions() {
  app.screen = 'missions';
  hud.hidden = true;
  const p = P();
  const v = L.missionView(p, uid());
  const tab = app.misTab || 'daily';
  const row = (m) => {
    const ready = !m.done && (m.ready !== undefined ? m.ready : m.have >= m.n);
    const rw = [m.coins ? `${fmt(m.coins)}코인` : '', m.tickets ? `${m.tickets}` : '', m.wild ? `${m.wild}` : '', m.sp ? `${m.sp}` : '', m.title ? '칭호' : ''].filter(Boolean).join(' ');
    return `<div class="mrow ${m.done ? 'done' : ready ? 'ready' : ''}"><span class="mi">${m.icon}</span><div class="mm"><b>${esc(m.name)}</b>
      <div class="pbar"><div style="width:${Math.round((Math.min(m.have, m.n) / m.n) * 100)}%"></div><em>${fmt(Math.min(m.have, m.n))}/${fmt(m.n)}</em></div><small>${rw}</small></div>
      <button class="btn ${ready ? 'primary' : ''}" data-act="claimMis" data-kind="${m.kind}" data-id="${m.id}" ${ready ? '' : 'disabled'}>${m.done ? '완료' : ready ? '받기' : '진행 중'}</button></div>`;
  };
  let body;
  if (tab === 'daily') body = `<p class="sub">${ic('clock', '', 'sm')}초기화까지 ${L.leftText(v.dayLeft)}</p>${row(v.all)}${v.daily.map(row).join('')}`;
  else if (tab === 'weekly') body = `<p class="sub">${ic('clock', '', 'sm')}초기화까지 ${L.leftText(v.weekLeft)}</p>${v.weekly.map(row).join('')}`;
  else body = `<p class="sub">한 번만 받는 업적 보상</p>${v.ach.map(row).join('')}`;
  const cnt = (list) => list.filter((m) => !m.done && m.have >= m.n).length;
  const nTab = { daily: cnt(v.daily) + (v.all.ready && !v.all.done ? 1 : 0), weekly: cnt(v.weekly), ach: cnt(v.ach) };
  const nAll = nTab.daily + nTab.weekly + nTab.ach;
  show(`
    <div class="topbar"><button class="back" data-act="menu">‹ 로비</button>${nAll > 1 && nAll > nTab[tab] ? `<button class="btn mini pink claim-all" data-act="claimAllMis" data-tab="all">전체 모두 받기 (${nAll})</button>` : ''}</div>
    <h2 class="title sub-title">미션</h2>
    <div class="tabs">${[['daily', '일일', cnt(v.daily) + (v.all.ready && !v.all.done ? 1 : 0)], ['weekly', '주간', cnt(v.weekly)], ['ach', '업적', cnt(v.ach)]].map(([k, n, c]) => `<button class="${tab === k ? 'on' : ''}" data-act="misTab" data-tab="${k}">${n}${c ? `<i class="cnt">${c}</i>` : ''}</button>`).join('')}</div>
    <button class="btn ${nTab[tab] ? 'primary' : ''} claim-tab" data-act="claimAllMis" data-tab="${tab}" ${nTab[tab] ? '' : 'disabled'}>${ic('gift', '', 'sm')}모두 받기${nTab[tab] ? ` (${nTab[tab]})` : ''}</button>
    <div class="mlist">${body}</div>
  `, 'dim');
}

// ─── 시즌 ────────────────────────────────────────────
function showSeason() {
  app.screen = 'season';
  hud.hidden = true;
  const p = P();
  const s = p.season || { id: L.seasonOf(L.weekIndex()), sp: 0, claimed: [] };
  const tier = L.seasonTier(p);
  const left = L.seasonEndMs(s.id) - Date.now();
  const inTier = s.sp % L.SP_PER_TIER;
  const rows = Array.from({ length: L.SEASON_TIERS }, (_, i) => {
    const t = i + 1;
    const rw = L.seasonReward(s.id, t);
    const got = s.claimed.includes(t);
    const ready = !got && t <= tier;
    const big = t % 10 === 0 || t % 5 === 0;
    return `<div class="srow ${got ? 'done' : ready ? 'ready' : t <= tier + 1 ? 'next' : ''} ${big ? 'big' : ''}"><span class="sn">${t}</span><span class="sr">${esc(rw.label)}</span>
      <button class="btn ${ready ? 'primary' : ''}" data-act="claimSeason" data-t="${t}" ${ready ? '' : 'disabled'}>${got ? '✓' : ready ? '받기' : ''}</button></div>`;
  }).join('');
  show(`
    ${topPills()}
 <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
 <h2 class="title">${ic('trophy', '', 'sm')} 시즌 ${s.id} 무료 보상</h2>
    <p class="sub">남은 시간 ${L.leftText(left)} · 미션·주간 도전으로 시즌 포인트(${ic('star_gold', '', 'sm')})를 모아요</p>
 <div class="season-bar"><b>단계 ${tier}/${L.SEASON_TIERS}</b><div class="pbar"><div style="width:${tier >= L.SEASON_TIERS ? 100 : (inTier / L.SP_PER_TIER) * 100}%"></div><em>${ic('star_gold', '', 'sm')}${inTier}/${L.SP_PER_TIER}</em></div></div>
    ${(() => { const n = Array.from({ length: tier }, (_, i) => i + 1).filter((t) => !s.claimed.includes(t)).length; return `<button class="btn primary" data-act="claimSeason" data-t="all" ${n ? '' : 'disabled'}>${ic('gift', '', 'sm')}모두 받기${n ? ` (${n})` : ''}</button>`; })()}
    <div class="gap"></div>
    <div class="slist">${rows}</div>
  `, 'dim');
}

// ─── 주간 도전 ───────────────────────────────────────
async function showWeekly() {
  const p = P();
  if ((p.maxStage | 0) < L.WEEKLY_UNLOCK) { toast(`주간 도전은 ${stageLabel(L.WEEKLY_UNLOCK)}를 깨면 열려요`); return; }
  app.screen = 'weekly';
  hud.hidden = true;
  const wi = L.weekIndex();
  const def = L.weeklyDef(wi);
  const mod = L.WEEKLY_MODS[def.mod];
  const fxd = MAP_FX[def.fx] || MAP_FX.none;
  const bosses = def.bosses.map((b) => `<span class="wb" title="${esc(ENEMIES[b].name)}">${av(ENEMIES[b])}<small>${esc(shortName(b))}</small></span>`).join('');
  const my = p.weekly && p.weekly.wi === wi ? p.weekly : null;
  const render = (bd) => {
    const board = bd ? bd.board.map((r) => `<div class="wrow ${r.rank <= 3 ? 'top' + r.rank : ''}"><span class="rk">${r.rank <= 3 ? ['', '', ''][r.rank - 1] : r.rank}</span><span class="nm ${frameCls(r.frame)}" style="${frameStyle(r.frame)}">${whoHtml(r.nickname, r.title)}</span><span class="wv">W${r.waves}</span><b>${fmt(r.best)}</b></div>`).join('') || '<div class="empty-msg">아직 기록이 없어요 — 1등 할 기회!</div>' : `<div class="empty-msg">${app.guest ? '로그인하면 친구들과 순위 경쟁!' : '<span class="spin"></span> 순위 불러오는 중…'}</div>`;
    const prev = bd && bd.prev;
    const prevBox = prev ? `<div class="panel wprev"><b>지난주 결과: ${prev.rank ? `${prev.rank}위` : '-'} · ${fmt(prev.best)}점</b><small>${prev.reward ? esc(prev.reward.label) + ' · ' + gotText(prev.reward) : ''}</small>
      <button class="btn ${prev.claimed ? '' : 'primary'}" data-act="weeklyClaim" ${prev.claimed ? 'disabled' : ''}>${prev.claimed ? '받았어요' : '보상 받기'}</button></div>` : '';
    show(`
      ${topPills()}
 <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
 <h2 class="title">${ic('calendar', '', 'sm')} 주간 도전전</h2>
 <p class="sub">${L.weekLabel(wi)} · 끝까지 ${L.leftText(L.msToWeekEnd())} · 몇 번이든 도전, 최고 점수가 남아요</p>
      <div class="wmod"><span class="wi">${mod.icon}</span><div><b>${esc(mod.name)}</b><small>${esc(mod.desc)}</small><small>${fxd.icon} ${esc(fxd.name)} · ${L.WEEKLY_WAVES}웨이브 · 뒤로 갈수록 확 세져요</small></div></div>
      <div class="wbosses">${bosses}</div>
      <div class="wmy"><div><small>내 최고</small><b>${fmt(my ? my.best : 0)}</b></div><div><small>순위</small><b>${bd && bd.me && bd.me.rank ? `${bd.me.rank}위` : '-'}</b></div><div><small>도전</small><b>${my ? my.runs : 0}회</b></div></div>
      ${prevBox}
 <button class="btn primary" data-act="weeklyGo">도전! <small>점수 = 웨이브×1000 + 처치×10 + 보스×500 + 클리어 보너스</small></button>
 <div class="gap"></div>
 <div class="panel wboard"><h4>${ic('trophy', '', 'sm')} 이번 주 순위 ${bd ? `<small>${bd.total}명 참가</small>` : ''}</h4>${board}</div>
 <p class="sub" style="margin-top:8px">순위 보상 (다음 주에 받기): 1위 5,000코인·${ic('ticket', '', 'sm')}5·영웅 장비·칭호 / 2~3위 3,000코인·${ic('ticket', '', 'sm')}3 / 4~10위 1,500코인·${ic('ticket', '', 'sm')}2 / 참가 600코인·${ic('ticket', '', 'sm')}1</p>
 `, 'dim');
  };
  render(null);
  if (!app.guest) {
    const bd = await API.weeklyBoard();
    if (app.screen === 'weekly') render(bd);
  }
}

// ─── 출석 · 공지 · 설정 · 상자 ────────────────────────
function showCheckin() {
  const p = P();
  const st = L.checkinState(p);
  const days = L.CHECKIN.map((rw, i) => {
    const got = i < st.streak % 7 || (st.done && i === (st.streak - 1) % 7);
    const today = !st.done && i === st.streak % 7;
    return `<div class="cday ${got ? 'got' : ''} ${today ? 'today' : ''}"><small>${i + 1}일</small><b>${rw.tickets ? '' : '<i class="ci big"></i>'}</b><em>${rw.tickets ? `${fmt(rw.coins)}+${rw.tickets}` : fmt(rw.coins)}</em></div>`;
  }).join('');
  popup(`<h3>${ic('calendar', '', 'sm')}출석 체크</h3><p class="ip">매일 들어오면 보상! 하루 빠지면 1일부터 다시 (연속 ${st.streak}일)</p><div class="cdays">${days}</div>
    <button class="btn primary" data-act="doCheckin" ${st.done ? 'disabled' : ''}>${st.done ? '내일 또 만나요' : '출석하기'}</button>`);
}
const NOTICES = [
  ['', '새 멤버 4명!', 'T4 멤버 3명, 그리고 LEGEND 멤버 1명 — 누군지는 상점 → 모집에서 직접 만나요'],
  ['', '주간 도전전', '매주 월요일 새 판! 모두 같은 판으로 점수 경쟁, 순위 보상은 다음 주에'],
  ['', '미션 · 업적 · 시즌', '일일/주간 미션과 무료 시즌(30단계)으로 모집권·장비·칭호를 받아요'],
  ['', '덱 칸 변경', `기본 덱 ${DECK_BASE}칸 · 5·6번째 칸은 상점 아이템에서 (예전에 산 칸은 한 칸씩 남아요)`],
  ['', '상성 강화', `유리한 속성 ×${TYPE_STRONG} · 불리한 속성 ×${TYPE_WEAK} — 덱 짤 때 ▲▼ 를 보세요`],
];
function showNotice() {
  popup(`<h3>${ic('mail', '', 'sm')}공지</h3><div class="nlist">${NOTICES.map(([i, t, d]) => `<div class="nrow"><span>${i}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></div>`).join('')}</div>`);
}
// 꾸미기: 칭호 · 프레임 전부 (가진 것 · 잠긴 것 · 얻는 법) + 내 카드 미리 보기
function cosmList() {
  const seasonIds = Array.from({ length: 2 }, (_, i) => `s${L.seasonOf(L.weekIndex()) - i}_t30`).filter((x) => /^s\d+_t30$/.test(x));
  const titles = [...new Set([...Object.keys(L.TITLE_INFO), ...(P().titles || []), ...seasonIds])].filter((t) => L.titleName(t));
  return { titles, frames: Object.keys(L.FRAMES) };
}
function showCosmetics() {
  const p = P(), tab = app.cosmTab || 'title', { titles, frames } = cosmList();
  const own = new Set(tab === 'title' ? p.titles || [] : p.frames || []);
  const list = tab === 'title' ? titles : frames;
  const how = (id) => (tab === 'title' ? (L.TITLE_INFO[id] || {}).how || (/_t30$/.test(id) ? '시즌 30단계' : '시즌 10단계') : L.FRAMES[id].how);
  const rows = list.sort((a, b) => (own.has(b) - own.has(a))).map((id) => {
    const on = tab === 'title' ? p.title === id : p.frame === id, have = own.has(id);
    const r = L.cosmeticRarity(tab, id);
    const face = tab === 'title' ? `<u class="tchip r-${r}">${esc(L.titleName(id))}</u>` : `<span class="ava framed ${frameCls(id)}" style="${frameStyle(id)}">${av(HEROES.bangjang)}</span><b>${esc(L.FRAMES[id].name)}</b>`;
    return `<div class="cosm-row ${have ? '' : 'lock'} ${on ? 'on' : ''}">${face}<small>${have ? (on ? '장착 중' : '보유') : '' + esc(how(id))}</small>${have ? `<button class="btn mini ${on ? '' : 'primary'}" data-act="${tab === 'title' ? 'setTitle' : 'setFrame'}" data-v="${on ? '' : id}">${on ? '빼기' : '장착'}</button>` : ''}</div>`;
  }).join('');
  const nT = (p.titles || []).length, nF = (p.frames || []).length;
  popup(`<h3>${ic('frame', '', 'sm')} 꾸미기</h3>
 <div class="cosm-preview"><span class="ava framed ${frameCls(p.frame)}" style="${frameStyle(p.frame)}">${av(HEROES.bangjang)}</span><div>${whoHtml(app.guest ? '손님' : app.nickname || '랑방 멤버', p.title)}<small>랭킹 · 대전 · 방 목록에서 이렇게 보여요</small></div></div>
    <p class="ip">모은 칭호 <b>${nT}</b> · 프레임 <b>${nF}</b> — 치장은 능력치가 없어요 (대전은 공정하게)</p>
    <div class="tabs"><button class="${tab === 'title' ? 'on' : ''}" data-act="cosmTab" data-v="title">${ic('tag', '', 'sm')}칭호</button><button class="${tab === 'frame' ? 'on' : ''}" data-act="cosmTab" data-v="frame">${ic('frame', '', 'sm')} 프레임</button></div>
 <div class="cosm-list">${rows}</div>`, 'cosm');
}
// 새로 얻은 칭호 · 프레임 알림 (한 번) → 바로 장착
function cosmNewCheck() {
  const p = P(); if (app.guest && !(p.titles || []).length) return;
  let seen; try { seen = JSON.parse(localStorage.getItem('langbang:cosmSeen') || 'null'); } catch { seen = null; }
  const now = [...(p.titles || []).map((t) => 't:' + t), ...(p.frames || []).map((f) => 'f:' + f)];
  if (!seen) { try { localStorage.setItem('langbang:cosmSeen', JSON.stringify(now)); } catch { /* 무시 */ } return; }
  const fresh = now.filter((x) => !seen.includes(x));
  if (!fresh.length) return;
  try { localStorage.setItem('langbang:cosmSeen', JSON.stringify(now)); } catch { /* 무시 */ }
  const [k, id] = fresh[0].split(/:(.*)/);
  const name = k === 't' ? L.titleName(id) : L.FRAMES[id].name;
  popup(`<h3>${ic('sparkle', '', 'sm')}새 ${k === 't' ? '칭호' : '프레임'} 획득!</h3><p class="ip big-got">${k === 't' ? titleChip(id) : `<span class="ava framed ${frameCls(id)}" style="${frameStyle(id)}">${av(HEROES.bangjang)}</span> ${esc(name)}`}</p>${fresh.length > 1 ? `<p class="ip">외 ${fresh.length - 1}개 더</p>` : ''}<div class="grid2"><button class="btn" data-x>나중에</button><button class="btn primary" data-act="${k === 't' ? 'setTitle' : 'setFrame'}" data-v="${id}">바로 장착</button></div>`, 'cosm-new');
}
// 설정: 계정 카드 · 소리 · 화면·연출 · 게임 · 꾸미기 · 지원 (한 줄 = 그림 · 이름 · 짧은 설명 한 줄 · 오른쪽 조작)
function setGwPref(k, v) { try { const o = JSON.parse(localStorage.getItem('gw:settings') || '{}'); o[k] = !!v; localStorage.setItem('gw:settings', JSON.stringify(o)); } catch { /* 무시 */ } }
function showSettings() {
  const p = P();
  const leader = (curDeck() || []).find(Boolean) || 'bangjang';
  const uidS = (() => { const k = String(API.accountKey() || 'guest'); let h = 0; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return 'LB-' + h.toString(36).toUpperCase().slice(0, 6).padStart(6, '0'); })();
  const tog = (act, on, extra = '') => `<button class="st-tog ${on ? 'on' : ''}" data-act="${act}" ${extra} role="switch" aria-checked="${on ? 'true' : 'false'}"><i></i></button>`;
  const row = (icn, label, hint, ctrl) => `<div class="st-row">${ic(icn, '', '')}<span class="st-l"><b>${label}</b>${hint ? `<small>${hint}</small>` : ''}</span>${ctrl}</div>`;
  const slider = (k) => `<input class="st-sl" type="range" min="0" max="100" step="5" value="${Math.round(A.getVol(k) * 100)}" style="--pct:${Math.round(A.getVol(k) * 100)}%" data-vol="${k}" aria-label="${k === 'bgm' ? '배경음' : '효과음'} 음량">`;
  const ver = (() => { const s = document.querySelector('script[type="module"][src*="game.js"]'); const m = s && /v=([^&]+)/.exec(s.src); return m ? m[1] : 'dev'; })();
  popup(`<div class="st-head"><b>설정</b></div>
    <div class="st-acct">${av(HEROES[leader] || HEROES.bangjang)}<span class="st-who"><b>${esc(app.guest ? '손님' : app.nickname || '랑방 멤버')}</b><small>${app.guest ? '손님 기록은 이 기기에만' : `Lv.${p.level} · ${uidS}`}</small></span>${app.guest ? '<button class="st-pill" data-act="toHub">로그인</button>' : `<button class="st-copy" data-act="copyUid" data-v="${uidS}" aria-label="아이디 복사">${ic('tag', '', 'sm')}</button>`}</div>
    <section class="st-sec"><h4>사운드</h4>
      ${row('sound', '배경음', '', slider('bgm'))}
      ${row('megaphone', '효과음', '', slider('sfx'))}
      ${row('mute', '전체 음소거', '', tog('mute', A.isMuted()))}
    </section>
    <section class="st-sec"><h4>화면 · 연출</h4>
      ${row('sparkle', '연출 줄이기', '화면 흔들림 · 반짝임 줄이기', tog('rmT', gwPref('reduceMotion')))}
      ${row('bolt', '진동', '', tog('vibT', gwPref('vibrate')))}
      ${row('speed', '기본 2배속', '다시 깬 스테이지에서', tog('speedDefT', !!app.speed2))}
    </section>
    <section class="st-sec"><h4>게임</h4>
      ${row('aug_card', '카드 자동 선택', '1:1 대전 제외', tog('autoCardsT', !!app.autoCards))}
      ${row('coupon', '자동 판매', '일반 등급 장비는 바로 코인', tog('autoSellT', !!p.autoSell))}
      ${row('frame', '꾸미기', '칭호 · 프레임', '<button class="st-pill" data-act="cosmetics">열기</button>')}
    </section>
    <section class="st-sec"><h4>지원</h4>
      ${row('megaphone', '공지', '', '<button class="st-go" data-act="notice" aria-label="공지 열기"></button>')}
      ${row('book', '게임 방법', '', '<button class="st-go" data-act="howto" aria-label="게임 방법"></button>')}
      ${row('home', '게임월드로', '', '<button class="st-go" data-act="toHub" aria-label="게임월드로"></button>')}
    </section>
        ${p.master ? `<div class="master-panel"><h4>${ic('tools', '', 'sm')} 마스터 테스트 도구 <small>(서버 확인 · 랭킹 제외)</small></h4>
 <div class="set-row"><span>${ic('flask2', '', 'sm')} 일반 유저처럼 테스트 <small>켜면 코인·강화·합성 비용과 확률이 보통 유저와 같아요</small></span><button class="btn ghost" data-act="mst" data-a="testNormal">${p.testNormal ? '켜짐' : '꺼짐'}</button></div>
 <div class="grid2"><button class="btn mini" data-act="mst" data-a="coins">코인 +10만</button><button class="btn mini" data-act="mst" data-a="tickets">모집권 +100</button><button class="btn mini" data-act="mst" data-a="stones">${ic('gem', '', 'sm')} 강화석 +50</button></div>
 <div class="set-row"><span>강화 Lv</span><input id="mstLv"type="number"min="0"max="20"value="20"><label><input id="mstStar"type="checkbox"checked> ★5</label></div>
 <button class="btn primary mini" data-act="mst" data-a="allclear">${ic('bolt', '', 'sm')} 올클리어 (전 스테이지 ★★★ · 전 멤버 · 장비 · 코인)</button>
 <div class="set-row"><span>진행</span><input id="mstStage"type="number"min="0"max="${STAGE_COUNT}" value="10"><button class="btn mini" data-act="mst" data-a="stage">여기까지 클리어</button></div>
      <div class="set-row"><span>테스트 판</span><select id="mstEnemy">${Object.keys(ENEMIES).filter((k) => !ENEMIES[k].dot).map((k) => `<option value="${k}">${esc(ENEMIES[k].name)}</option>`).join('')}</select><button class="btn mini" data-act="mstWave">소환</button></div>
      <div class="mst-gift"><h4>${ic('gift', '', 'sm')} 선물 보내기 <small>최근 24시간 접속자 + 앞으로 24시간 안에 들어오는 사람 · 계정마다 한 번 · 우편 14일</small></h4>
        <div class="set-row"><span>소모품</span><select id="mstGiftItem">${L.CONS_IDS.map((k) => `<option value="${k}">${esc(L.CONS[k].name)}</option>`).join('')}</select><input id="mstGiftQty" type="number" min="1" max="99" value="10"></div>
        <div class="set-row"><span>제목</span><input id="mstGiftTitle" maxlength="40" value="이호찬님의 선물"></div>
        <div class="set-row"><span>내용</span><input id="mstGiftText" maxlength="80" value="보조배터리 10개 드려요. 위급할 때 방어진을 가득 채워요!"></div>
        <div class="set-row"><span>선물 번호</span><input id="mstGiftId" maxlength="40" placeholder="비우면 gift_아이템_날짜"></div>
        <button class="btn primary mini" data-act="mst" data-a="gift">${ic('mail', '', 'sm')} 선물 보내기</button>
        ${(p.giftsSent || []).length ? `<p class="ip">보낸 선물: ${(p.giftsSent || []).slice(-5).reverse().map((c) => esc(c.id)).join(' · ')}</p>` : ''}</div>
      <button class="btn danger mini" data-act="mst" data-a="reset">초기화 (신규 유저 상태로)</button></div>` : ''}
    <p class="st-ver">랑방 대전 · ${esc(ver)}</p>`, 'pp-set st-v2');
  const box = stage.querySelector('.st-v2');
  if (box) box.addEventListener('input', (ev) => { const s = ev.target.closest('[data-vol]'); if (!s) return; A.setVol(s.dataset.vol, Number(s.value) / 100); s.style.setProperty('--pct', s.value + '%'); if (s.dataset.vol === 'sfx') A.sfx.tap(); });
}
async function claimChestAct(ch, n) {
  const r = await liveAct(API.claimChest(ch, n, app.guest));
  if (!r) return;
  A.sfx.levelUp(); fx.flash('#ffd23f', 0.35);
  toast(`${ch}장 ★${n} 상자! ${gotText(r.got)}`, 3000);
  if (app.screen === 'stages') showStages(); else showMenu();
}

Object.assign(ACTS, {
  nav: (b) => goNav(b.dataset.tab),
  lbStep: (b) => lobbyStep(Number(b.dataset.d)),
  lbModes: () => showModes(),
  lbMenu: () => showLobbyMenu(),
  lbGo: () => showPrep('stage', lobbyStage()),
  weekly: () => showWeekly(),
  weeklyGo: () => showPrep('weekly', 0),
  weeklyClaim: async () => { const r = await liveAct(API.weeklyClaim()); if (r) { A.sfx.levelUp(); toast(`지난주 ${r.label || ''} 보상! ${gotText(r.got)}`, 3200); showWeekly(); } },
  season: () => showSeason(),
  recruit: () => { app.shopTab = 'recruit'; showShop(); },
  checkin: () => showCheckin(),
  doCheckin: async () => { const r = await liveAct(API.checkin(app.guest)); if (r) { closeInfoCard(); A.sfx.levelUp(); toast(`출석 ${r.day}일째! ${gotText(r.got)}`, 2600); refresh(); } },
  notice: () => showNotice(),
  mail: async () => { await Promise.resolve(API.mailSync(app.guest)).then((r) => { if (r && r.ok && r.profile) app.profile = r.profile; }).catch(() => {}); showMail(); },
  mailGet: async (b) => { const r = await liveAct(API.mailClaim(b.dataset.id === 'all' ? 'all' : Number(b.dataset.id), app.guest)); if (r) { A.sfx.levelUp(); toast(`${r.n}개 받았어요 · ${gotText(r.got)}`, 2400); showMail(); refreshBehind(); } },
  stamina: () => showStamina(),
  staBuy: async () => { const r = await liveAct(API.staminaBuy(app.guest)); if (r) { toast(`체력 +${L.STAMINA.buy.n}!`, 1400); showStamina(); refreshBehind(); } },
  rwInfo: (b) => { const f = REWARD_INFO[b.dataset.v]; if (f) popup(f() + '<button class="btn primary" data-x>알겠어요</button>', 'rw-info'); },
  toHub: () => { closeInfoCard(); leaveToHub(); },
  toLobby: async () => {
    const g = app.g;
    const sure = !g || g.over || app.screen !== 'play' || await confirmBox({ title: '메인 메뉴로 갈까요?', sub: g && (g.pvp || g.weekly || g.raid || g.tower) ? '이 판은 여기서 끝나요' : '지금 판은 이어하기로 남아요', ok: '메인 메뉴로', cancel: '취소' });
    if (!sure) return;
    if (g && !g.over && (g.pvp || g.weekly || g.raid || g.tower)) { quitRun(); if (!g.tower) showMenu(); return; }
    if (g && !g.over) leaveForLater(); else { app.g = null; showMenu(); }
  },
  restart: async () => {
    if (!(await confirmBox({ title: '처음부터 다시 할까요?', sub: '지금 판은 사라져요', ok: '다시 하기', cancel: '취소', danger: true }))) return;
    const g = app.g;
    app.paused = false;
    if (g) { g.over = true; g.phase = 'over'; }
    clearSnap();
    startRun({ mode: app.mode, stage: app.stage, force: true });
  },
  mst: async (b) => {
    const a = b.dataset.a;
    if (a === 'reset' && !(await confirmBox({ title: '정말 초기화할까요?', sub: '랑방 대전 기록이 전부 신규 유저 상태로 돌아가요', ok: '초기화', cancel: '취소', danger: true }))) return;
    const extra = a === 'testNormal' ? { on: !P().testNormal } : a === 'allclear' ? { level: Number(($('#mstLv') || {}).value || 20), star5: !!($('#mstStar') || {}).checked } : a === 'stage' ? { value: Number(($('#mstStage') || {}).value || 0) } : a === 'gift' ? { item: ($('#mstGiftItem') || {}).value, qty: Number(($('#mstGiftQty') || {}).value || 10), title: ($('#mstGiftTitle') || {}).value, text: ($('#mstGiftText') || {}).value, giftId: ($('#mstGiftId') || {}).value || undefined, from: '이호찬' } : {};
    const r = await liveAct(API.masterAct(a, extra));
    if (!r) return;
    if (a === 'reset') { try { localStorage.removeItem(DECK_KEY); localStorage.removeItem('langbang:gearSeen'); } catch { /* 무시 */ } app.decks = [[], [], []]; }
    app.lobbyStage = 0;
    if (a === 'testNormal') { toast(P().testNormal ? '일반 유저처럼: 비용·확률이 보통으로' : '마스터 모드로 돌아왔어요'); showSettings(); return; }
    if (a === 'gift') { toast('선물을 보냈어요! 들어오는 사람 우편함에 도착해요', 2600); closeInfoCard(); return; }
    toast(`${{ coins: '코인 지급', tickets: '모집권 지급', stones: '강화석 지급', allclear: '올클리어!', stage: '진행 설정', reset: '초기화했어요' }[a] || '완료'}`, 1800);
    closeInfoCard();
    showMenu();
  },
  mstWave: () => {
    const type = ($('#mstEnemy') || {}).value;
    closeInfoCard();
    app.debugRun = true;
    startRun({ mode: 'stage', stage: Math.min(STAGE_COUNT, Math.max(1, P().maxStage || 1)), force: true }).then(() => {
      const g = app.g; if (!g) return;
      app.debugRun = true;
      g.god = true;
      for (let i = 0; i < (ENEMIES[type].boss || ENEMIES[type].mid ? 1 : 8); i++) S.spawnEnemy(g, type, 40 + i * 38, 60 + (i % 3) * 30);
      toast(`테스트: ${ENEMIES[type].name} 소환 (무적 · 기록 저장 안 함)`, 2200);
    });
  },
  settings: () => showSettings(),
  setTitle: async (b) => { if (await liveAct(API.setCosmetic(b.dataset.v, undefined, app.guest))) { if (stage.querySelector('.info-modal.cosm')) showCosmetics(); else showSettings(); refreshBehind(); } },
  cosmetics: () => showCosmetics(),
  cosmTab: (b) => { app.cosmTab = b.dataset.v; showCosmetics(); },
  setFrame: async (b) => { if (await liveAct(API.setCosmetic(undefined, b.dataset.v, app.guest))) { if (stage.querySelector('.info-modal.cosm')) showCosmetics(); else showSettings(); refreshBehind(); } },
  bagTabGo: (b) => { app.bagTab = b.dataset.v; showBag(); },
  consBuy: async (b) => { const r = await liveAct(API.consBuy(b.dataset.id, app.guest)); if (r) { A.sfx.coin(); toast(`${L.CONS[b.dataset.id].name} 1개 샀어요`, 1400); showShop(); } },
  rerollCoupon: () => rerollCoupon(),
  consSlot: (b) => showConsPick(Number(b.dataset.k) || 0),
  consPick: (b) => { const k = Number(b.dataset.k) || 0, id = b.dataset.id || null; const lo = consLoadout(); if (id) { const j = lo.indexOf(id); if (j >= 0 && j !== k) lo[j] = lo[k]; } lo[k] = id; consSave(lo); setTut('cons'); closeInfoCard(); A.sfx.pick(); showPrep(app.mode, app.stage); },
  chest: (b) => {
    const ch = Number(b.dataset.ch), n = Number(b.dataset.n);
    if (b.classList.contains('open')) { toast('이미 연 상자예요'); return; }
    if (!b.classList.contains('ready')) { const rw = L.chestReward(ch, n); toast(`${ch}장 별 ${n}개 모으면: ${gotText({ coins: rw.coins, tickets: rw.tickets, gear: rw.gear ? { t: 'megaphone', r: rw.gear } : null }).replace(/📣 /, '')}`, 2600); return; }
    claimChestAct(ch, n);
  },
  pull: (b) => doPull(Number(b.dataset.n)),
  gpull: (b) => doGearPull(Number(b.dataset.n)),
  grates: () => showGearRates(),
  rates: () => showRates(),
  itemInfo: (b) => showItemInfo(b.dataset.id),
  heroCard: (b) => showHeroModal(b.dataset.id, app.screen === 'prep' ? 'prep' : ''),
  starUp: (b) => doStarUp(b.dataset.id),
  misTab: (b) => { app.misTab = b.dataset.tab; showMissions(); },
  cardWhere: () => popup(`<h3>${ic('card_common', '', 'sm')}멤버 카드 얻는 곳</h3><div class="ilist"><p class="ip">${ic('gacha', '', 'sm')}<b>모집</b> — 멤버 조각 ×4 · ×10 (가진 멤버에게)</p><p class="ip">${ic('map', '', 'sm')}<b>스테이지</b> — 데려간 멤버 카드가 가끔 (별 많을수록 · 헬은 2배)</p><p class="ip">${ic('shop', '', 'sm')}<b>상점 선택권</b> — 고른 멤버 ${CARD_PICK.n}장 · 주 ${CARD_PICK.perWeek}번</p><p class="ip">${ic('retry', '', 'sm')}<b>범용 카드</b> — 다 키운 멤버의 남는 카드를 바꾸면 누구 강화에나 써요</p></div><button class="btn primary"data-x>알겠어요</button>`, 'card-where'),
  cardPickOpen: () => popup(`<h3>${ic('card_common', '', 'sm')}누구 카드를 받을까요?</h3><div class="cp-grid">${owned().map((h) => `<button class="cp-h" data-act="cardPickGo" data-id="${h}">${av(HEROES[h])}<b>${esc(HEROES[h].name)}</b><small>${ic('card_common', '', 'sm')}${P().shards[h] | 0}</small></button>`).join('')}</div>`, 'card-pick'),
  cardPickGo: async (b) => { const r = await liveAct(API.cardPick(b.dataset.id, app.guest)); if (r) { closeInfoCard(); toast(`${HEROES[b.dataset.id].name} 카드 +${CARD_PICK.n}`); refresh(); } },
  cardConvert: async () => { const r = await liveAct(API.cardConvert(app.guest)); if (r) { toast(`범용 카드 ${P().wild | 0}장`); refresh(); } },
  synMore: () => { app.synOpen = !app.synOpen; app.hudCache.syn = null; },
  bulkOn: () => { app.bulk = new Set(); app.fuse = null; app.bagSel = null; showBag(); },
  fuseOn: () => { app.bagTab = 'fuse'; app.fuse = []; app.bulk = null; app.bagSel = null; showBag(); },
  fuseOff: () => { app.fuse = null; app.bagTab = 'bag'; showBag(); },
  fusePick: (b) => {
    const id = Number(b.dataset.id), p = P(), it = (p.gear || []).find((g) => g.id === id);
    if (!it) return;
    if (app.fuse.includes(id)) { app.fuse = app.fuse.filter((x) => x !== id); showBag(); return; }
    if (equippedBy(p, id) || gearLocked().has(id)) { toast('장착 중이거나 잠근 장비예요'); return; }
    if (it.r === 'legend') { toast('전설은 더 합성할 수 없어요'); return; }
    if (app.fuse.length && fuseRarity(p) !== it.r) { toast('같은 등급끼리만 합성돼요'); return; }
    if (app.fuse.length >= 3) { toast('3개까지 골라요'); return; }
    app.fuse.push(id); A.sfx.tap(); showBag();
  },
  fuseAuto: (b) => { // 그 등급에서 가장 약한(강화 낮은) 3개 · 같은 종류가 3개 이상이면 그걸로
    const p = P(), r = b.dataset.v, locks = gearLocked();
    const ok = (p.gear || []).filter((it) => it.r === r && !equippedBy(p, it.id) && !locks.has(it.id)).sort((a, c) => a.lv - c.lv || a.id - c.id);
    if (ok.length < 3) { toast(`${GEAR_RARITY[r].name} 장비가 3개 안 돼요`); return; }
    const byT = {}; for (const it of ok) (byT[it.t] = byT[it.t] || []).push(it);
    const trio = Object.values(byT).find((a) => a.length >= 3);
    app.fuse = (trio || ok).slice(0, 3).map((it) => it.id); showBag();
  },
  fuseGo: async () => {
    const ids = app.fuse.slice();
    const r = await liveAct(API.fuseGear(ids, app.guest));
    if (!r) return;
    app.fuse = null; showBag();
    const it = r.made, R0 = GEAR_RARITY[it.r];
    A.sfx.levelUp(); fx.flash(R0.color, 0.35);
    popup(`<div class="fuse-reveal" style="--rc:${R0.color}"><span class="fr-ico">${gearIco(it)}</span><h3>${ic('flask', '', 'sm')}합성 성공!</h3><p class="ip big-got" style="color:${R0.color}">${R0.name} · ${esc(GEAR[it.t].name)}${it.lv ? ` +${it.lv}` : ''}</p>${gearInfoHtml(it)}<button class="btn primary" data-x>좋아요</button></div>`, 'fuse-pop');
  },
  bulkDis: async () => {
    const p = P(), ids = [...app.bulk].filter((id) => !equippedBy(p, id) && !gearLocked().has(id));
    if (!ids.length) return;
    const n = (p.gear || []).filter((g) => ids.includes(g.id)).reduce((a, it) => a + gearDismantle(it.r, it.lv), 0);
    if (!(await confirmBox({ title: `장비 ${ids.length}개를 분해할까요?`, sub: `강화석 +${n} · 되돌릴 수 없어요`, ok: '분해', cancel: '취소', danger: true }))) return;
    const r = await liveAct(API.dismantleGear(ids, app.guest));
    if (r) toast(`${r.n}개 분해 · 강화석 +${r.stones}`);
    app.bulk = null; showBag();
  },
  bulkOff: () => { app.bulk = null; showBag(); },
  bulkPick: (b) => {
    const id = Number(b.dataset.id), p = P();
    if (equippedBy(p, id) || gearLocked().has(id)) { toast('장착 중이거나 잠근 장비예요'); return; }
    if (app.bulk.has(id)) app.bulk.delete(id); else app.bulk.add(id);
    A.sfx.tap(); showBag();
  },
  bulkQuick: (b) => {
    const p = P(), ok = bulkSellable(p, gearLocked()), v = b.dataset.v;
    if (v === 'none') app.bulk = new Set();
    else if (v === 'common') app.bulk = new Set(ok.filter((it) => it.r === 'common').map((it) => it.id));
    else if (v === 'rare') app.bulk = new Set(ok.filter((it) => it.r === 'common' || it.r === 'rare').map((it) => it.id));
    else if (v === 'free') app.bulk = new Set(ok.map((it) => it.id));
    else if (v === 'dup') { // 종류마다 제일 좋은 것 하나(장착 중이면 그것)만 남기고 나머지
      const best = {};
      for (const it of p.gear || []) { const sc = GEAR_RARITY[it.r].mul * (1 + 0.12 * it.lv) + (equippedBy(p, it.id) ? 100 : 0); if (!best[it.t] || sc > best[it.t].sc) best[it.t] = { id: it.id, sc }; }
      app.bulk = new Set(ok.filter((it) => best[it.t].id !== it.id).map((it) => it.id));
    }
    showBag();
  },
  bulkSell: async () => {
    const p = P(), ids = [...app.bulk].filter((id) => !equippedBy(p, id) && !gearLocked().has(id));
    if (!ids.length) return;
    const v = (p.gear || []).filter((g) => ids.includes(g.id)).reduce((a, it) => a + gearSellValue(it.r, it.lv), 0);
    if (!(await confirmBox({ title: `장비 ${ids.length}개를 팔까요?`, sub: `+${fmt(v)} 코인 · 되돌릴 수 없어요`, ok: '팔기', cancel: '취소', danger: true }))) return;
    const r = await liveAct(API.sellGearMany(ids, app.guest));
    if (r) { A.sfx.coin && A.sfx.coin(); toast(`${r.n}개 팔았어요 · +${fmt(r.sold)} 코인`); }
    app.bulk = null; showBag();
  },
  rmT: () => { const v = !gwPref('reduceMotion'); setGwPref('reduceMotion', v); document.body.classList.toggle('rm', v); showSettings(); },
  vibT: () => { const v = !gwPref('vibrate'); setGwPref('vibrate', v); if (v) vibrate(20); showSettings(); },
  speedDefT: () => { app.speed2 = !app.speed2; try { localStorage.setItem('langbang:speed2', app.speed2 ? '1' : '0'); } catch { /* 무시 */ } showSettings(); },
  copyUid: async (b) => { try { await navigator.clipboard.writeText(b.dataset.v); toast('아이디를 복사했어요', 1200); } catch { toast(b.dataset.v, 2000); } },
  glossary: () => showGlossary(),
  autoCardsT: () => { app.autoCards = !app.autoCards; try { localStorage.setItem('langbang:autoCards', app.autoCards ? '1' : '0'); } catch { /* 무시 */ } showSettings(); },
  autoSellT: async () => { const r = await liveAct(API.setAutoSell(!P().autoSell, app.guest)); if (r) toast(P().autoSell ? '자동 판매 켬: 일반 등급 드롭은 바로 코인으로' : '자동 판매 끔'); showSettings(); },
  statHelp: () => popup(`<h3>${ic('book', '', 'sm')}능력치 용어 풀이</h3><div class="ilist">${Object.values(STAT_HELP).map(([n, d]) => `<p class="ip"><b>${esc(n)}</b> — ${esc(d)}</p>`).join('')}</div><button class="btn primary" data-x>알겠어요</button>`, 'stat-help'),
  claimAllMis: async (b) => {
    b.disabled = true;
    const r = await liveAct(API.claimAllMissions(b.dataset.tab, app.guest));
    if (r) { A.sfx.levelUp(); fx.flash('#ffd23f', 0.2); popup(`<h3>${ic('gift', '', 'sm')}모두 받았어요! (${r.n}개)</h3><p class="ip big-got">${esc(gotText(r.got))}</p><button class="btn primary" data-x>확인</button>`, 'claim-pop'); }
    showMissions();
  },
  claimMis: async (b) => { const r = await liveAct(API.claimMission(b.dataset.kind, b.dataset.id, app.guest)); if (r) { A.sfx.levelUp(); toast(`보상! ${gotText(r.got)}`, 2400); showMissions(); } },
  claimSeason: async (b) => {
    const t = b.dataset.t === 'all' ? 'all' : Number(b.dataset.t);
    const r = await liveAct(API.claimSeason(t, app.guest));
    if (!r) return;
    A.sfx.levelUp();
    toast(`시즌 보상! ${(r.got || []).map((x) => gotText(x)).join(' · ')}`, 3200);
    showSeason();
  },
  deckToggle: (b) => deckToggleAct(b.dataset.id),
  deckRemove: (b) => deckQuick(b.dataset.id),
  deckColl: (b) => { app.hmTab = API.heroUnlocked(P(), b.dataset.id) ? 'up' : 'info'; showHeroModal(b.dataset.id); }, // 강화 허브: 누르면 그 멤버 강화 화면 (덱은 출격 화면에서)
  deckFilter: (b) => { app.deckFilter = b.dataset.v; showDeckTab(); },
  deckPresetT: (b) => { app.deckI = Number(b.dataset.k); saveDecks(); showDeckTab(); },
  autoDeckT: () => { const ids = recommendTeam(nextStage(), owned(), deckSlotsNow()); app.decks[app.deckI] = placeDeck(ids); saveDecks(); A.sfx.card(); toast('다음 스테이지 추천 덱으로 바꿨어요', 1400); showDeckTab(); },
  missionsNav: () => showMissions(),
  todo: () => showTodo(),
  todoGo: (b) => { const t = todoList()[Number(b.dataset.i)]; if (t) todoGo(t); },
  heroInfo: (b) => showDexCard('hero', b.dataset.id),
  deckReplace: (b) => deckToggleAct(b.dataset.id, Number(b.dataset.slot)),
  hellModeS: (b) => { app.hellMode = b.dataset.v === '1'; try { localStorage.setItem('langbang:hell', app.hellMode ? '1' : '0'); } catch { /* 무시 */ } showStages(); },
  hellMode: (b) => { app.hellMode = b.dataset.v === '1'; try { localStorage.setItem('langbang:hell', app.hellMode ? '1' : '0'); } catch { /* 무시 */ } showPrep(app.mode, app.stage); },
  speedOpt: (b) => { app.speed2 = !!b.checked; try { localStorage.setItem('langbang:speed2', app.speed2 ? '1' : '0'); } catch { /* 무시 */ } },
});

// ─── 주말 모임 레이드 ─────────────────────────────────
async function showRaid() {
  const p = P();
  if ((p.maxStage | 0) < 5 && !p.master) { toast('레이드는 1-5를 깨면 참가할 수 있어요'); return; }
  app.screen = 'raid';
  hud.hidden = true;
  const st = L.raidState();
  const render = (bd) => {
    const boss = ENEMIES[(bd && bd.boss) || st.boss];
    const total = bd ? bd.total : 0;
    const pct = Math.min(100, (total / L.RAID.hp) * 100);
    const me = bd && bd.me;
    const top = bd ? bd.top.map((r) => `<div class="wrow ${r.rank <= 3 ? 'top' + r.rank : ''}"><span class="rk">${r.rank <= 3 ? ['', '', ''][r.rank - 1] : r.rank}</span><span class="nm ${frameCls(r.frame)}" style="${frameStyle(r.frame)}">${whoHtml(r.nickname, r.title)}</span><b>${fmt(r.dmg)}</b></div>`).join('') || '<div class="empty-msg">아직 아무도 안 때렸어요 — 첫 타!</div>' : `<div class="empty-msg">${app.guest ? '레이드는 로그인하면 참가해요' : '<span class="spin"></span> 불러오는 중…'}</div>`;
    const open = bd ? bd.open : st.open;
    show(`
      ${topPills()}
 <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
 <h2 class="title">${ic('dragon', '', 'sm')} 모임 레이드 · ${esc(st.slot)}</h2>
 <button class="chip rw-i" data-act="rwInfo" data-v="raid">${ic('book', '', 'sm')} 보상 안내</button>
 <p class="sub">${open ? `끝까지 ${L.leftText(st.endsAt - Date.now())} · 모두의 피해를 합쳐 잡아요` : `다음 레이드: ${esc(st.slot)} (${L.leftText(st.opensAt - Date.now())} 뒤) · 매일 12:00~13:30 · 15:00~16:30 · 21:00~23:00`}</p>
      <div class="raid-boss"><div class="rb-art">${av(boss)}</div><b>${esc(boss.name)}</b>
        <div class="rb-hp"><div style="width:${100 - pct}%"></div><em>${bd && bd.killed ? '처치 성공!' : `${fmt(Math.max(0, L.RAID.hp - total))} / ${fmt(L.RAID.hp)}`}</em></div>
        <small>${bd ? `${bd.players}명 참가 · 레이드마다 ${L.RAID.tries}번 · 한 판 ${L.RAID.sec}초 · 매일 12:00 · 15:00 · 21:00` : ''}</small></div>
      <div class="wmy"><div><small>내 피해</small><b>${fmt(me ? me.dmg : 0)}</b></div><div><small>기여 순위</small><b>${me && me.rank ? me.rank + '위' : '-'}</b></div><div><small>남은 도전</small><b>${me ? me.tries : L.RAID.tries}</b></div></div>
      ${me && me.reward ? `<div class="panel wprev"><b>${esc(me.reward.label)}</b><small>${gotText(me.reward)}</small><button class="btn ${me.canClaim && !me.claimed ? 'primary' : ''}" data-act="raidClaim" ${me.canClaim && !me.claimed ? '' : 'disabled'}>${me.claimed ? '받았어요' : me.canClaim ? '보상 받기' : '잡거나 끝나면 받기'}</button></div>` : ''}
      <button class="btn primary" data-act="raidGo" ${open && !app.guest && (!me || me.tries > 0) ? '' : 'disabled'}>도전! <small>150초 동안 보스에게 최대한 피해를</small></button>
 <div class="gap"></div>
 <div class="panel wboard"><h4>${ic('trophy', '', 'sm')} 기여도 순위</h4>${top}</div>
    `, 'dim');
  };
  render(null);
  if (!app.guest) { const pr = API.raidBoard(); TR.hold(pr); const bd = await pr; if (app.screen === 'raid') render(bd); } // 엘리베이터 문이 닫힌 동안 불러온다
}
async function startRaid() {
  // 친구 도우미: 친구 대표 멤버 한 명을 데려간다 (고를 친구가 없으면 바로 혼자 · 취소하면 그만)
  const fid = await FRX.pickHelper((curDeck() || []).filter(Boolean));
  if (fid === false) return;
  const r = await API.raidStart(fid);
  if (!r.ok) { toast(r.message || '레이드를 시작할 수 없어요'); return; }
  if (r.profile) app.profile = r.profile;
  app.raidRun = r.runId;
  startRun({ mode: 'raid', force: true, raidWi: r.wi, help: r.help || null });
}
async function saveRaid(sum, g, box) {
  const r = await API.postRaid(sum, app.raidRun, g.raid.dmg);
  app.raidRun = null;
  if (r.ok && r.profile) app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '')}</div>`; return; }
  const rd = r.raid || {};
  box.innerHTML = `<div class="rewards"><div class="rw hl"><span>${ic('dragon', '', 'sm')}이번 판 피해</span><b>${fmt(rd.dmg || 0)}</b></div><div class="rw"><span>이번 주 내 피해</span><b>${fmt(rd.mine || 0)}</b></div>
    <div class="rw"><span>모두 합계</span><b>${fmt(rd.total || 0)} / ${fmt(rd.hp || L.RAID.hp)}</b></div></div>${r.rank ? `<div class="own"><span class="badge">기여 ${r.rank}위</span></div>` : ''}${rd.help && HEROES[rd.help.hero] ? `<div class="fr-helped">${av(HEROES[rd.help.hero])}<span><b>${esc(rd.help.nick)}님의 멤버가 도와줬어요</b><small>${esc(HEROES[rd.help.hero].name)} · 친구에게 도움 포인트가 쌓였어요</small></span></div>` : ''}${rd.master ? '<div class="guest-note">마스터 테스트 판은 순위에 안 들어가요</div>' : ''}`;
}

// ─── 실시간 1:1 대전 ──────────────────────────────────
const PVP = { sock: null, match: null, opp: null, kills: 0, spent: 0, lastHp: 0 };
function loadSocketIo() {
  if (window.io) return Promise.resolve(window.io);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/socket.io/socket.io.js'; s.onload = () => res(window.io); s.onerror = rej; document.head.appendChild(s); });
}
async function pvpSocket() {
  if (PVP.sock && PVP.sock.connected) { pvpSendLo(PVP.sock); return PVP.sock; }
  const io = await loadSocketIo();
  // auth 는 다시 붙을 때마다 새로: 손님 고정 id (끊겼다 붙어도 같은 선수) · 지금 하던 판 id (끊긴 사이에 끝났으면 결과를 받게)
  const sock = io('/lbpvp', { transports: ['websocket', 'polling'], auth: (cb) => cb({ token: API.authToken() || '', gid: pvpGid(), mid: (PVP.match && PVP.match.id) || '' }) });
  PVP.sock = sock;
  pvpSendLo(sock);
  let first = true;
  sock.on('connect', () => { if (first) { first = false; return; } pvpReconnected(); });
  sock.on('match', (m) => pvpMatched(m));
  sock.on('rejoin', (m) => pvpRejoin(m));
  sock.on('opp', (o) => { const prev = PVP.opp || {}; PVP.opp = Object.assign({}, prev, o); renderOppStrip(); oppPeekCheck(prev, PVP.opp); if (oppView.isConnected) renderOppView(); });
  sock.on('incoming', (x) => { if (app.g && app.g.pvp) { S.pvpIncoming(app.g, x.kind); handleEvents(app.g, true); pvpBanner('in', x.kind === 'big' ? '중간 보스가 온다!' : `진상 ${S.pvpSendCount(app.g)}명이 온다!`, `${oppName()}이(가) 보냈어요`); } });
  sock.on('sent', (x) => { pvpBanner('out', x.kind === 'big' ? '중간 보스 보냈다!' : `진상 ${S.pvpSendCount(app.g)}명 보냈다!`, `${oppName()} 쪽으로 출발`); });
  sock.on('end', (r) => pvpEnded(r));
  sock.on('rooms', (list) => { PVP.rooms = list; if (app.screen === 'pvp') renderRooms(); });
  sock.on('roomClosed', () => { closeInfoCard(); toast('방이 10분 동안 비어서 닫혔어요', 1800); });
  return sock;
}
const PVP_STEPS = [[1050, '실버'], [1200, '골드'], [1350, '플래티넘'], [1500, '다이아'], [1800, '랑방킹']];
async function showPvp() {
  app.screen = 'pvp';
  hud.hidden = true;
  const p = P();
  const pv = p.pvp || { rating: 1000, games: 0, wins: 0 };
  const t = pvpTier(pv.rating);
  const lo = t[0] === -Infinity ? 900 : t[0];
  const next = PVP_STEPS.find(([r]) => r > pv.rating);
  const prog = next ? Math.max(0, Math.min(1, (pv.rating - lo) / Math.max(1, next[0] - lo))) : 1;
  fixDeck();
  const pw = deckPower(p, curDeck().filter(Boolean));
  const now = Date.now(), sid = L.seasonOf(L.weekIndex(now)), left = L.seasonEndMs(sid) - now;
  const day = L.dayIndex(now), d = p.pvpDay && p.pvpDay.day === day ? p.pvpDay : { n: 0, won: false };
  const track = Array.from({ length: L.PVP_REWARD.perDay }, (_, k) => `<i class="${k < d.n ? 'on' : ''} ${k === 0 ? 'fw' : ''}">${k === 0 ? ic(d.won ? 'check' : 'gift', '', 'sm') : ''}</i>`).join('');
  const loss = Math.max(0, (pv.games | 0) - (pv.wins | 0)), streak = pv.streak | 0;
  show(`
    ${subTop('1:1 대전')}
    <div class="pv-season"><b>시즌 ${sid}</b><span>${ic('hourglass', '', 'sm')}${L.leftText(left)} 남음</span><button class="pv-chip" data-act="rwInfo" data-v="pvpTiers">${ic('trophy', '', 'sm')}등급 보상</button></div>
    <div class="pv-hero" style="--tc:${t[3]}">
      <div class="pv-emb">${tierEmb(pv.rating, 'xl')}<i class="pv-rays"></i></div>
      <div class="pv-info">
        <em>${app.guest ? '손님 · 연습만' : esc(t[1])}</em>
        <b class="pv-rt">${app.guest ? '-' : fmt(pv.rating)}<small>점</small></b>
        <div class="pv-bar"><i style="width:${Math.round(prog * 100)}%"></i></div>
        <small class="pv-next">${app.guest ? '로그인하면 점수 경쟁' : next ? `${next[1]}까지 <b>${next[0] - pv.rating}</b>점` : '최고 등급!'}</small>
        <div class="pv-wl"><span><b>${pv.wins | 0}</b>승</span><span><b>${loss}</b>패</span>${streak >= 2 ? `<span class="fire">${ic('fire', '', 'sm')}<b>${streak}</b>연승</span>` : ''}</div>
      </div>
    </div>
    <div class="pv-day"><small>오늘 보상 <b>${Math.min(d.n, L.PVP_REWARD.perDay)}/${L.PVP_REWARD.perDay}</b>판 ${d.won ? '' : '· 첫 승은 2배!'}</small><div class="pv-track">${track}</div></div>
    <button class="pv-cta" data-act="pvpQuick"><i class="pv-ring"></i><b>랭크 매칭</b><small>사람 상대를 먼저 찾아요 · 30초 동안 없으면 비슷한 실력의 AI와 대전해요</small></button>
    <div class="pv-sub"><button class="pv-s" data-act="pvpRoom">${ic('duo', '', '')}<b>친구와 대전</b><small>방 만들기 · 초대 링크</small></button><button class="pv-s" data-act="pvpJoin">${ic('key', '', '')}<b>코드로 참가</b><small>4자리 방 코드</small></button></div>
    <div class="pv-top" id="pvpTop"><div class="empty-msg">순위 불러오는 중</div></div>
    <div class="panel pvp-rooms"><h4>${ic('door', '', 'sm')}열린 방 <small id="roomN"></small></h4><div id="roomList"><div class="empty-msg">방 목록 불러오는 중</div></div></div>
    <div class="panel wboard" id="pvpRank"><h4>${ic('trophy', '', 'sm')}대전 순위</h4><div class="empty-msg">불러오는 중</div></div>
    <p class="sub pv-rule">처치 ${L.PVP.sendSmall}명마다 진상 5명 보내기 · ${L.PVP.sendBig}명이면 중간 보스 · ${L.PVP.sudden}초부터 서든데스 · 5분이면 판정</p>
    <p class="sub pv-rule pv-norm">${PV.PVP_NOTE}</p>
    ${navHtml('pvp')}
  `, 'dim withnav pvp-v2');
  pvpSocket().then((sock) => sock.emit('rooms:list', {}, (r) => { if (r && r.ok) { PVP.rooms = r.rooms; renderRooms(); } })).catch(() => { const el = $('#roomList'); if (el) el.innerHTML = '<div class="empty-msg">서버에 연결할 수 없어요</div>'; });
  const rk = await API.pvpRanking();
  if (app.screen !== 'pvp') return;
  const box = $('#pvpRank'), top = $('#pvpTop');
  const list = (rk && rk.ranking) || [];
  if (top) top.innerHTML = list.length ? list.slice(0, 3).map((r, k) => `<button class="pv-tp r${k + 1} ${frameCls(r.frame)}" style="${frameStyle(r.frame)}" data-act="playerCard" data-u="${esc(r.username || '')}">${ic('medal' + (k + 1), '', '')}${tierEmb(r.rating, 'sm')}<b>${esc(r.nickname)}</b>${r.title ? titleChip(r.title) : ''}<small>${r.rating}점</small></button>`).join('') : '<div class="empty-msg">첫 1등 자리가 비어 있어요</div>';
  if (box) box.innerHTML = `<h4>${ic('trophy', '', 'sm')}대전 순위</h4>${list.map((r) => `<div class="wrow" data-act="playerCard" data-u="${esc(r.username || '')}"><span class="rk">${r.rank}</span>${tierEmb(r.rating, 'xs')}<span class="nm ${frameCls(r.frame)}" style="${frameStyle(r.frame)}">${whoHtml(r.nickname, r.title)}</span><span class="wv">${r.wins}/${r.games}</span><b>${r.rating}</b></div>`).join('') || '<div class="empty-msg">아직 대전 기록이 없어요</div>'}`;
}
// 선수 카드: 스테이지 진행 · 대전 등급 · 승률 · 덱
const PVP_TIERS = [[1800, '랑방킹', 'king', '#ff6a8a'], [1500, '다이아', 'diamond', '#6fd3ff'], [1350, '플래티넘', 'plat', '#4fe0c1'], [1200, '골드', 'gold', '#ffd35a'], [1050, '실버', 'silver', '#cfd8e3'], [-Infinity, '브론즈', 'bronze', '#d59a6a']];
const tierEmb = (r, cls = '') => { const t = PVP_TIERS.find((x) => (r | 0) >= x[0]) || PVP_TIERS[PVP_TIERS.length - 1]; return `<img class="temb ${cls}" src="/img/lb/ui2/tier_${t[2]}.webp" alt="${t[1]}" draggable="false" style="--tc:${t[3]}">`; };
async function showPlayerCard(u) {
  if (!u) { toast('손님이라 기록이 없어요'); return; }
  popup('<p class="ip"><span class="spin"></span> 불러오는 중…</p>', 'pcard');
  const pl = await API.playerCard(u);
  const box = stage.querySelector('.pcard .pop-box');
  if (!box) return;
  if (!pl) { box.innerHTML = '<p class="ip">선수 정보를 불러오지 못했어요</p><button class="pop-x" data-x>✕</button>'; return; }
  const t = PVP_TIERS.find((x) => pl.pvp.rating >= x[0]);
  const fr = pl.frame && L.FRAMES[pl.frame] ? L.FRAMES[pl.frame].color : '#ffd23f';
  const deck = pl.deck.map((h) => HD(h.id) ? `<span class="pc-h" style="--c:${ATTRS[HD(h.id).attr].color}">${dexImg(h.id, HD(h.id).img)}<i class="tier t${heroTier(h.id)}">${TIER_NAME[heroTier(h.id)]}</i><small>${'★'.repeat(h.star)} ${h.lv ? '+' + h.lv : ''}</small><b>${esc(HD(h.id).name)}</b></span>` : '').join('');
  box.innerHTML = `<div class="pc-head ${frameCls(pl.frame)}" style="--fr:${fr}"><b>${esc(pl.nickname)}</b>${pl.master ? '<em class="lb-master">MASTER</em>' : ''}${titleChip(pl.title)}<small>Lv.${pl.level || 1}</small></div>
    <div class="pc-stats">
      <div><small>최고 스테이지</small><b>${esc(pl.stageLabel)}</b><i>★ ${pl.totalStars || 0}</i></div>
      <div><small>대전 등급</small><b style="color:${t[3]}">${tierEmb(pl.pvp.rating, 'xs')} ${t[1]}</b><i>${pl.pvp.rating}점</i></div>
      <div><small>승률</small><b>${pl.pvp.games ? pl.pvp.winRate + '%' : '-'}</b><i>${pl.pvp.wins}승 ${pl.pvp.games - pl.pvp.wins}패</i></div>
 </div>
 <h4 class="pc-dt">${ic('card_common', '', 'sm')} 대표 덱</h4><div class="pc-deck">${deck || '<p class="ip">아직 덱이 없어요</p>'}</div>
    ${pl.bestWave ? `<p class="ip">${ic('infinity', '', 'sm')}무한 도전 최고 W${pl.bestWave}</p>` : ''}
    <button class="pop-x" data-x>✕</button>`;
}
const PVP_TIPS = ['처치 10명마다 상대에게 진상 5명을 보내요', '30명 모으면 중간 보스를 보낼 수 있어요', '150초부터 서든데스! 15초마다 진상이 더 세져요', '5분이 되면 입구가 더 많이 남은 쪽이 이겨요', PV.PVP_NOTE, '상대 입구 줄을 누르면 상대 화면을 볼 수 있어요', '오늘 첫 승은 코인 2배', '같은 상대와는 하루 3판까지만 보상'];
function pvpWaiting(text, code, botIn) {
  closeInfoCard();
  const m = document.createElement('div');
  m.className = 'info-modal pvp-wait pv-search';
  m.innerHTML = `<div class="ps-radar"><i></i><i></i><i></i>${tierEmb((P().pvp || {}).rating || 1000, 'mid')}</div>
    <b class="ps-t">${esc(text)}</b><span class="ps-time">0:00</span>
    <small class="ps-note">사람 상대를 먼저 찾아요 · 30초 동안 없으면 비슷한 실력의 AI와 대전해요</small>${botIn ? `<small class="ps-ai" data-until="${Date.now() + botIn}">AI 대전까지 ${Math.ceil(botIn / 1000)}초</small>` : ''}
    ${code ? `<div class="pvp-code">${code}</div><button class="btn primary big-share" data-act="pvpShare" data-code="${code}">${ic('share', '', 'sm')}초대 링크 보내기</button>` : ''}
    <p class="ps-tip">${ic('bulb', '', 'sm')}<span>${esc(PVP_TIPS[0])}</span></p>
    <p class="sub pv-norm">${esc(PV.PVP_NOTE)}</p>
    <button class="btn ghost ps-x" data-act="pvpCancel">취소</button>`;
  m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-act]'); if (!b) return; A.unlock(); uiSound(b.dataset.act); if (ACTS[b.dataset.act]) ACTS[b.dataset.act](b); });
  stage.appendChild(m);
  const t0 = Date.now(); let k = 0;
  const iv = setInterval(() => {
    if (!m.isConnected) { clearInterval(iv); return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    m.querySelector('.ps-time').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    { const ai = m.querySelector('.ps-ai'); if (ai) { const left = Math.max(0, Math.ceil((Number(ai.dataset.until) - Date.now()) / 1000)); ai.textContent = left ? `AI 대전까지 ${left}초` : 'AI 상대 준비 중…'; } }
    if (s && s % 3 === 0 && s !== k) { k = s; const tp = m.querySelector('.ps-tip span'); tp.textContent = PVP_TIPS[(s / 3) % PVP_TIPS.length]; }
  }, 250);
}
async function pvpQueue() {
  const sock = await pvpSocket().catch(() => null);
  if (!sock) { toast('서버에 연결할 수 없어요'); return; }
  fixDeck();
  PVP.want = { f: pvpQueue };
  sock.emit('queue', { deck: curDeck().filter(Boolean), power: deckPower(P(), curDeck().filter(Boolean)) }, (r) => { if (!r || !r.ok) toast((r && r.message) || '매칭할 수 없어요'); else if (r.waiting) pvpWaiting('상대 찾는 중', null, r.botIn); });
}
function renderRooms() {
  const el = $('#roomList');
  if (!el) return;
  const list = PVP.rooms || [];
  const n = $('#roomN'); if (n) n.textContent = list.length ? `${list.length}개` : '';
  const wait = (sec) => (sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분`);
  el.innerHTML = list.length ? list.map((r) => `<button class="room-row v2" data-act="pvpEnter" data-code="${r.code}">${tierEmb(r.rating, 'sm')}<span class="rr-host"><b>${esc(r.title)}</b><small>${esc(r.host)} · ${esc(r.tier)} · ${r.games}판 ${r.wins}승</small></span><span class="rr-meta"><span>${ic('swords', '', 'sm')}${fmt(r.power)}</span><span>${ic('clock', '', 'sm')}${wait(r.waitSec)}</span></span><em>입장</em></button>`).join('')
    : '<div class="empty-msg">열린 방이 없어요. 친구와 대전으로 방을 열어 봐요!</div>';
}
// 초대 링크 보내기: /langbang/?room=코드 → 열면 바로 그 방으로
async function sharePvpRoom(code) {
  const url = `${location.origin}/langbang/?room=${code}`;
  const text = `랑방 대전 1:1 한판! 방 코드 ${code}`;
  try { if (navigator.share) { await navigator.share({ title: '랑방 대전 1:1', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('초대 링크를 복사했어요! 카톡방에 붙여 넣어 주세요', 2200); } catch { toast(`이 주소를 보내 주세요: ${url}`, 3000); }
}
function pvpEnter(code) {
  pvpSocket().then((sock) => { fixDeck(); sock.emit('room:join', { code, deck: curDeck().filter(Boolean), power: deckPower(P(), curDeck().filter(Boolean)) }, (r) => { if (!r || !r.ok) toast((r && r.message) || '들어갈 수 없어요'); }); }).catch(() => toast('서버에 연결할 수 없어요'));
}
async function pvpQuick() {
  const sock = await pvpSocket().catch(() => null);
  if (!sock) { toast('서버에 연결할 수 없어요'); return; }
  fixDeck();
  PVP.want = { f: pvpQuick };
  sock.emit('quick', { deck: curDeck().filter(Boolean), power: deckPower(P(), curDeck().filter(Boolean)) }, (r) => { if (!r || !r.ok) toast((r && r.message) || '매칭할 수 없어요'); else if (r.waiting) pvpWaiting('상대 찾는 중', r.code, r.botIn); });
}
// 게임 안 입력창 (카톡 인앱 브라우저 · 일부 웹뷰는 prompt() 를 막는다)
const ROOM_TITLES = ['한 판 붙자!', '랑방 최강 가린다', '진상 막기 대결', '초보 환영~', '지는 사람 커피', '딱 한 판만!'];
function inputBox({ title, sub = '', placeholder = '', max = 20, ok = '확인', numeric = false, useHint = false }) {
  return new Promise((resolve) => {
    closeInfoCard();
    const m = document.createElement('div');
    m.className = 'info-modal pop input-pop';
    m.innerHTML = `<div class="pop-box"><h3>${esc(title)}</h3>${sub ? `<p class="ip">${esc(sub)}</p>` : ''}
      <input class="ib-in" type="text" maxlength="${max}" placeholder="${esc(placeholder)}" ${numeric ? 'inputmode="numeric" pattern="[0-9]*"' : ''} autocomplete="off">
      <div class="grid2"><button class="btn ghost" data-ib="no">취소</button><button class="btn primary" data-ib="ok">${esc(ok)}</button></div></div>`;
    stage.appendChild(m);
    const inp = m.querySelector('.ib-in');
    let done = false;
    const end = (v) => { if (done) return; done = true; m.remove(); resolve(v); };
    const submit = () => { const v = inp.value.trim().slice(0, max); if (numeric && !/^\d+$/.test(v)) { inp.classList.add('bad'); A.sfx.tap(); return; } end(v || (useHint ? placeholder : '')); };
    m._cancel = () => end(null); // 뒤로 가기 = 취소
    m.addEventListener('click', (ev) => { const b = ev.target.closest('[data-ib]'); if (ev.target === m || (b && b.dataset.ib === 'no')) end(null); else if (b) submit(); });
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); submit(); } });
    setTimeout(() => inp.focus(), 60);
  });
}
async function pvpRoom(join) {
  const sock = await pvpSocket().catch(() => null);
  if (!sock) { toast('서버에 연결할 수 없어요'); return; }
  fixDeck();
  if (join) {
    const code = await inputBox({ title: '방 코드로 참가', placeholder: '4자리 숫자', max: 4, numeric: true, ok: '참가' });
    if (!code) return;
    sock.emit('room:join', { code: code.trim(), deck: curDeck().filter(Boolean), power: deckPower(P(), curDeck().filter(Boolean)) }, (r) => { if (!r || !r.ok) toast((r && r.message) || '참가할 수 없어요'); });
  } else {
    const title = await inputBox({ title: '방 만들기', placeholder: ROOM_TITLES[(Math.random() * ROOM_TITLES.length) | 0], max: 20, ok: '만들기', sub: '방 제목 (안 써도 돼요)', useHint: true });
    if (title === null) return;
    pvpRoomCreate(sock, title);
  }
}
function pvpRoomCreate(sock, title) {
  PVP.want = { f: () => pvpRoomCreate(PVP.sock, title) };
  sock.emit('room:create', { deck: curDeck().filter(Boolean), title, power: deckPower(P(), curDeck().filter(Boolean)) }, (r) => { if (r && r.ok) pvpWaiting('방을 만들었어요', r.code); });
}
// 손님 고정 id: 연결이 끊겼다 다시 붙어도 서버가 같은 선수로 알아본다 (대전 이어하기 · 끝난 판 결과)
function pvpGid() {
  try { let id = localStorage.getItem('langbang:pvpGid'); if (!id || !/^[A-Za-z0-9_-]{8,40}$/.test(id)) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join(''); localStorage.setItem('langbang:pvpGid', id); } return id; } catch { return ''; }
}
// 다시 붙음 (앱 전환 · 화면 꺼짐 · 신호 끊김): 서버는 끊긴 연결의 대기를 지우므로, 아직 찾는 중이면 다시 찾는다
//  (대전 중이었으면 서버가 'rejoin' 을 보내고, 끊긴 사이에 끝났으면 'end' 를 보낸다)
function pvpReconnected() {
  if (PVP.match || !PVP.want || !stage.querySelector('.pvp-wait.pv-search')) return;
  PVP.want.f();
}
// 서버: "너는 아직 이 판 중이야" — 이 화면에서 그 판이 돌고 있으면 이어서, 아니면 (새로고침 · 'match' 를 못 받음) 그 판으로 들어간다
function pvpRejoin(m) {
  const g = app.g;
  if (PVP.match && PVP.match.id === m.id) {
    if (g && g.pvp && g.pvpMid === m.id) { if (!g.over) { toast('대전에 다시 연결됐어요', 1400); pvpTick(); } else if (PVP.sock) PVP.sock.emit('quit'); } // 끊긴 사이에 그만둔 판
    return; // 아직 VS 화면: 곧 시작한다
  }
  if (app.screen === 'play' && g && !g.over) { if (PVP.sock) PVP.sock.emit('quit'); return; } // 다른 판을 하는 중: 두고 간 대전은 그만둔 것으로
  const left = (Number(m.startAt) || 0) - (Number(m.now) || 0); // 시작까지 남은 ms (지났으면 음수)
  if (left > 900) { pvpMatched(Object.assign({}, m, { startIn: left, aiNotice: 0 })); return; }
  closeInfoCard();
  PVP.t0 = Date.now() + left;
  PVP.match = m; PVP.opp = Object.assign({ hp: 1, max: 1, kills: 0, wave: 0 }, m.opp); PVP.myCards = []; PVP.myUlts = 0;
  PVP.koff = m.kills | 0; PVP.spent = m.spent | 0; // 서버에 쌓인 처치 · 보내기는 그대로 (새 판에서 이어서)
  toast('하던 대전으로 다시 들어왔어요', 1600);
  startRun({ mode: 'pvp', force: true, pvpSeed: m.seed, pvpHp: m.hp });
}
function pvpMatched(m) {
  closeInfoCard();
  PVP.t0 = Date.now() + (m.startIn || 3000); // 서버 시작 시각 (서든데스 · 5분 판정 기준)
  PVP.match = m; PVP.opp = Object.assign({ hp: 1, max: 1, kills: 0, wave: 0 }, m.opp); PVP.kills = 0; PVP.spent = 0; PVP.koff = 0; PVP.myCards = []; PVP.myUlts = 0;
  if (m.opp && m.opp.ai && m.aiNotice) { // 사람 상대가 없어 AI 로: 1.5초 안내 ("다시 찾기" 누르면 취소하고 계속 찾기)
    const n = document.createElement('div');
    n.className = 'info-modal pvp-wait pv-ainote';
    n.innerHTML = `<div class="pa-box"><b>사람 상대가 없어 AI와 대전해요</b><small>비슷한 실력 · 점수는 60%만 오르내려요</small><button class="btn ghost" data-re>다시 찾기</button></div>`;
    stage.appendChild(n);
    let gone = false;
    const tStart = setTimeout(() => { if (gone) return; n.remove(); showVsSplash(Object.assign({}, m, { startIn: (m.startIn || 3000) - m.aiNotice })); setTimeout(() => { if (PVP.match === m) startRun({ mode: 'pvp', force: true, pvpSeed: m.seed, pvpHp: m.hp }); }, Math.max(0, (m.startIn || 3000) - m.aiNotice - 800)); }, m.aiNotice);
    n.querySelector('[data-re]').addEventListener('click', () => { gone = true; clearTimeout(tStart); n.remove(); PVP.match = null; if (PVP.sock) PVP.sock.emit('requeue', {}, (r) => { if (r && r.ok) pvpWaiting('상대 찾는 중', null, r.botIn); else toast((r && r.message) || '다시 찾을 수 없어요'); }); });
    return;
  }
  showVsSplash(m);
  setTimeout(() => startRun({ mode: 'pvp', force: true, pvpSeed: m.seed, pvpHp: m.hp }), Math.max(0, (m.startIn || 3000) - 800));
}
document.getElementById('oppstrip').addEventListener('click', () => openOppView());
// ─── 1:1 상대 보기: 맞대결 화면 · 위쪽 VS 줄 · 미니 화면 · 자동 엿보기 ─────
const pvpTier = (r) => PVP_TIERS.find((t) => (r | 0) >= t[0]) || PVP_TIERS[PVP_TIERS.length - 1];
const oppName = () => (PVP.opp && PVP.opp.nickname) || '상대';
function vsSide(o, me) {
  const t = pvpTier(o.rating);
  const deck = (o.deck || []).filter((id) => HEROES[id]).slice(0, 5).map((id, k) => `<span class="vs-h ${k === 0 ? 'lead' : ''}" style="--k:${k}">${av(HEROES[id])}${k === 0 ? '<i>대장</i>' : ''}</span>`).join('');
  return `<div class="vs-side ${me ? 'me' : 'op'} ${frameCls(o.frame)}" style="--tc:${t[3]};${frameStyle(o.frame)}">
    <div class="vs-emb">${tierEmb(o.rating, 'mid')}</div>
    <b class="vs-name">${esc(o.nickname || '손님')}${o.ai ? '<i class="vs-ai">AI</i>' : ''}</b>${o.title ? titleChip(o.title) : ''}
    <span class="vs-tier">${esc(t[1])} · ${o.rating | 0}점</span>
    <small>${o.bot ? '연습 상대' : o.games ? `${o.wins | 0}승 ${Math.max(0, (o.games | 0) - (o.wins | 0))}패` : '첫 대전'} · 전투력 ${fmt(o.power | 0)}</small>
    <div class="vs-deck">${deck}</div></div>`;
}
function showVsSplash(m) {
  const el = document.createElement('div');
  el.className = 'vs-splash v2';
  const me = Object.assign({}, m.you || {}, { nickname: (m.you && m.you.nickname) || app.nickname || '나', title: (m.you && m.you.title) || P().title, frame: (m.you && m.you.frame) || P().frame, rating: (m.you && m.you.rating) || (P().pvp || {}).rating || 1000, deck: (m.you && m.you.deck) || curDeck().filter(Boolean) });
  const total = Math.max(2200, m.startIn || 3000);
  el.innerHTML = `${vsSide(me, true)}${vsSide(m.opp, false)}<div class="vs-mid"><b>VS</b></div><div class="vs-count"></div>`;
  stage.appendChild(el);
  fx.flash('#ffffff', 0.5);
  A.sfx.confirm();
  setTimeout(() => { el.classList.add('slam'); fx.addShake(10); A.sfx.slam(); }, 420);
  const cnt = el.querySelector('.vs-count');
  const n0 = Math.min(3, Math.floor((total - 700) / 1000));
  for (let k = 0; k < n0; k++) setTimeout(() => { cnt.textContent = String(n0 - k); cnt.classList.remove('pop'); void cnt.offsetWidth; cnt.classList.add('pop'); A.sfx.tabSw(); }, total - 700 - (n0 - k) * 1000 + 200);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, total - 600);
}
const oppView = document.createElement('div');
oppView.className = 'opp-view';
oppView.addEventListener('click', (ev) => { if (ev.target.closest('[data-pc]')) { const u = PVP.opp && PVP.opp.username; if (u) showPlayerCard(u); return; } oppView.remove(); });
function openOppView() { if (!PVP.opp) return; renderOppView(); if (!oppView.isConnected) stage.appendChild(oppView); }
function renderOppView(peek) {
  const o = PVP.opp || {};
  const hp = Math.round(((o.hp || 0) / Math.max(1, o.max || 1)) * 100);
  const heroes = (o.heroes && o.heroes.length ? o.heroes : (o.deck || []).map((id) => ({ id, r: false, lv: 1 }))).filter((h) => HEROES[h.id]);
  oppView.classList.toggle('peek', !!peek);
  oppView.innerHTML = `<div class="ov-box"><div class="ov-head"><b>${esc(oppName())}</b>${titleChip(o.title)}<span class="vs-tier" style="--tc:${pvpTier(o.rating)[3]}">${tierEmb(o.rating, 'xs')} ${o.rating | 0}</span>${o.username ? '<button class="chip mini" data-pc="1">선수 카드</button>' : ''}</div>
 <div class="ov-hp"><span>${ic('door', '', 'sm')} 입구</span><div class="ohp"><div style="width:${hp}%"></div></div><b>${hp}%</b></div>
 <div class="ov-stats"><span>${ic('wave', '', 'sm')} 웨이브 <b>${o.wave | 0}</b></span><span>진상 <b>${o.enemies | 0}</b></span><span>처치 <b>${o.kills | 0}</b></span><span>${ic('megaphone', '', 'sm')}총공지 <b>${o.ults | 0}</b></span></div>
    <div class="ov-heroes">${heroes.map((h) => `<span class="ov-h ${h.r ? 'ready' : ''}">${av(HEROES[h.id])}<small>Lv${h.lv || 1}</small></span>`).join('')}</div>
    ${o.cards && o.cards.length ? `<div class="ov-cards"><small>최근 카드</small>${o.cards.map((c) => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
    ${peek ? '' : '<p class="ov-close">아무 데나 누르면 닫혀요</p>'}</div>`;
}
// 자동 엿보기: 상대 입구 30% 아래로 떨어질 때 · 총공지를 쓸 때 (1.5초)
function oppPeekCheck(prev, o) {
  if (!app.g || !app.g.pvp || oppView.isConnected) return;
  const low = (o.hp || 0) / Math.max(1, o.max || 1) < 0.3 && (prev.hp || 1) / Math.max(1, prev.max || 1) >= 0.3;
  const ult = (o.ults | 0) > (prev.ults | 0);
  if (!low && !ult) return;
  renderOppView(true); stage.appendChild(oppView);
  pvpBanner(low ? 'out' : 'in', low ? `${oppName()} 입구 30% 아래!` : `${oppName()} 총공지!`, low ? '지금 몰아붙여요' : '조심!');
  clearTimeout(oppPeekCheck.t); oppPeekCheck.t = setTimeout(() => { if (oppView.classList.contains('peek')) oppView.remove(); }, 1500);
}
function renderOppStrip() {
  const el = $('#oppstrip');
  if (!el || !PVP.opp) return;
  const o = PVP.opp;
  el.hidden = false;
  el.dataset.u = o.username || '';
  const g = app.g, my = g ? Math.round((g.base.hp / Math.max(1, g.base.max)) * 100) : 100;
  const oh = Math.round((o.hp / Math.max(1, o.max)) * 100);
  el.classList.add('v2');
  const tl = g && g.pvp ? PV.pvpLeftText(S.pvpTime(g)) : 'VS';
  el.innerHTML = `<span class="os-me"><small>나</small><div class="ohp me"><div style="width:${my}%"></div></div><b>${my}%</b></span><em class="${g && g.pvp && g.pvp.n ? 'os-sd' : ''}">${tl}</em><span class="os-op">${tierEmb(o.rating, 'xs')}<span class="os-nm"><b>${esc(o.nickname || '상대')}</b><small>W${o.wave || 0}</small></span><div class="ohp ${oh < 30 ? 'low' : ''}"><div style="width:${oh}%"></div></div><b>${oh}%</b></span>`;
}
function pvpTick() {
  const g = app.g;
  if (!g || !g.pvp || !PVP.sock) return;
  PVP.sock.emit('hp', { hp: Math.round(g.base.hp), max: g.base.max, kills: pvpKills(g), wave: g.wave, enemies: g.enemies.filter((e) => !e.dead).length, heroes: g.heroes.filter((h) => !h.def.summon).map((h) => ({ id: h.id, r: S.skillReady(h), lv: h.lv })), cards: (PVP.myCards || []).slice(-3), ults: PVP.myUlts | 0 });
  renderOppStrip();
  const gauge = pvpKills(g) - PVP.spent;
  const b = $('#btn-send');
  if (b) { b.hidden = false; b.innerHTML = `${ic('share', '', 'sm')}보내기 <small>${Math.min(gauge, L.PVP.sendBig)}/${gauge >= L.PVP.sendBig ? L.PVP.sendBig : L.PVP.sendSmall}</small>`; b.classList.toggle('ready', gauge >= L.PVP.sendSmall); b.classList.toggle('big', gauge >= L.PVP.sendBig); }
}
// 보내기 · 받기 띠 (이모지 없이 · 파랑 = 내가 · 빨강 = 나에게)
function pvpBanner(kind, title, sub) {
  for (const o of stage.querySelectorAll('.pv-ban')) o.remove();
  const d = document.createElement('div');
  d.className = `pv-ban ${kind}`;
  d.innerHTML = `${ic(kind === 'in' ? 'bolt' : 'share', '', '')}<span><b>${esc(title)}</b><small>${esc(sub)}</small></span>`;
  stage.appendChild(d);
  if (kind === 'in') { fx.addShake(6); A.sfx.deny(); } else A.sfx.confirm();
  setTimeout(() => d.classList.add('gone'), 1500); setTimeout(() => d.remove(), 1800);
}
// 결과 연출: 점수 숫자 올라가기 · 등급 바뀌면 옛 엠블럼 깨지고 새 엠블럼 · 코인이 위 코인 칸으로 날아감
function pvpResultFx(tries = 0) {
  const box = ui.querySelector('.pv-res');
  if (tries < 50) setTimeout(() => pvpResultFx(tries + 1), 100);
  if (!box || box.dataset.done) return; box.dataset.done = '1';
  const first = !pvpResultFx.at || performance.now() - pvpResultFx.at > 6000; pvpResultFx.at = first ? performance.now() : pvpResultFx.at;
  const win = box.classList.contains('win');
  if (first) { if (win) { if (A.sfx.win) A.sfx.win(); fx.flash('#fff1a8', 0.35); } else if (A.sfx.lose) A.sfx.lose(); }
  const n = box.querySelector('.pr-rt b[data-from]');
  if (n) {
    const a = +n.dataset.from, b = +n.dataset.to, t0 = performance.now() + 500;
    const step = () => { const k = Math.max(0, Math.min(1, (performance.now() - t0) / 900)); n.textContent = String(Math.round(a + (b - a) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); else if (a !== b) n.classList.add('done'); };
    requestAnimationFrame(step);
  }
  if (box.querySelector('.temb.new')) setTimeout(() => { box.classList.add('tierchg'); if (first) { A.sfx.levelUp(); fx.addShake(8); } }, first ? 1500 : 0);
  const pr = app.pvpResult || {};
  if (first && pr.coins > 0) setTimeout(() => coinFly(box, Math.min(10, 3 + Math.round(pr.coins / 100))), 1100);
}
function coinFly(from, n) {
  const pill = ui.querySelector('.pill.cur .ci') || ui.querySelector('.pill.cur');
  if (!pill || !from.isConnected) return;
  const sr = stage.getBoundingClientRect(), a = from.getBoundingClientRect(), b = pill.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'ci coin-fly';
    c.style.left = (a.left - sr.left + a.width / 2 + (Math.random() - 0.5) * 60) + 'px';
    c.style.top = (a.top - sr.top + a.height / 2) + 'px';
    c.style.setProperty('--dx', (b.left - a.left - a.width / 2) + 'px'); c.style.setProperty('--dy', (b.top - a.top - a.height / 2) + 'px');
    c.style.animationDelay = (i * 0.06) + 's';
    stage.appendChild(c);
    setTimeout(() => { c.remove(); if (i === n - 1) { A.sfx.coin(); const pl = pill.closest('.pill'); if (pl) pl.classList.add('bump'); } }, 800 + i * 60);
  }
}
function pvpSend() {
  const g = app.g;
  if (!g || !g.pvp) return;
  const gauge = pvpKills(g) - PVP.spent;
  const kind = gauge >= L.PVP.sendBig ? 'big' : gauge >= L.PVP.sendSmall ? 'small' : null;
  if (!kind) { toast(`처치 ${L.PVP.sendSmall}명이 모이면 보낼 수 있어요`, 1000); return; }
  PVP.sock.emit('send', { kind }, (r) => { if (r && r.ok) { PVP.spent += kind === 'big' ? L.PVP.sendBig : L.PVP.sendSmall; A.sfx.levelUp(); } else if (r && r.message) toast(r.message, 900); });
}
const pvpKills = (g) => g.stats.kills + (PVP.koff | 0); // 다시 들어온 판: 서버에 쌓인 처치 수부터
function pvpEnded(r) {
  const g = app.g;
  if (r && r.id && (!PVP.match || PVP.match.id !== r.id)) { resyncProfile(); return; } // 지난 판 결과 (이미 끝냈거나 다른 판)
  PVP.match = null;
  const el = $('#oppstrip'); if (el) el.hidden = true; if (oppView.isConnected) oppView.remove();
  const sb = $('#btn-send'); if (sb) sb.hidden = true;
  if (g && g.pvp && !g.over) { g.over = true; g.phase = 'over'; }
  if (g && g.pvp) g.augOffer = null; // 증강 창이 결과 위에 남지 않게
  app.pvpResult = r;
  if (g && g.pvp) { app.ending = false; endRun(r.win); pvpResultFx(); }
  resyncProfile();
}
setInterval(pvpTick, 500);
// ─── 1:1 대전 끝내기 (pvp.js 타임라인) ───
// 손님: 서버에 강화 · 장비 기록이 없어서 덱 멤버 것만 보낸다 (서버가 대전 한도로 잘라서 진상 체력을 정한다)
function pvpSendLo(sock) {
  if (!sock || !app.guest) return;
  const p = P(), ids = curDeck().filter(Boolean), eq = {}, gids = new Set();
  for (const id of ids) { const sl = (p.equip || {})[id]; if (sl) { eq[id] = { w: sl.w, a: sl.a, m: sl.m }; for (const k of ['w', 'a', 'm']) if (sl[k] !== undefined) gids.add(sl[k]); } }
  const pick = (o) => Object.fromEntries(ids.map((id) => [id, (o || {})[id] | 0]));
  sock.emit('loadout', { heroes: pick(p.heroes), hstars: pick(p.hstars), equip: eq, gear: (p.gear || []).filter((it) => gids.has(it.id)).map((it) => ({ id: it.id, t: it.t, r: it.r, lv: it.lv | 0 })) });
}
function pvpTimelineEv(g, e) {
  if (e.type === 'sudden') pvpBanner('in', '서든데스 시작!', '15초마다 진상이 더 세지고 입구 피해가 늘어요');
  else if (e.type === 'suddenUp') { if (e.n % 2 === 0) pvpBanner('in', `서든데스 ${e.n}단계`, `진상 체력 · 속도 +${Math.round(PV.PVP_END.hpStep * e.n * 100)}%`); }
  else if (e.type === 'pvpDrain') pvpBanner('in', '입구가 무너지기 시작!', '매초 내구도 1%씩 · 5분이면 판정');
  else if (e.type === 'pvpTimeUp') {
    pvpTick(); pvpBanner('out', '시간 종료!', '입구가 더 많이 남은 쪽이 이겨요 · 판정 중');
    // 판정이 안 오면 (연결이 끊긴 채로 서버가 판을 끝냄) 멈춘 화면에 갇히지 않게: 결과 없이 끝낸다
    const m = PVP.match;
    setTimeout(() => { if (app.g === g && !g.over && PVP.match === m) pvpEnded({ id: m && m.id, win: false, lost: true, reason: 'lost', coins: 0, delta: 0, ranked: false }); }, 15000);
  }
}
function pvpTimeSub(pr) {
  const a = pr.hp | 0, b = pr.oppHp | 0;
  if (pr.draw) return `시간 종료 · 입구 ${a}% 대 ${b}% · 처치 수도 같았어요`;
  return pr.win ? (a !== b ? `시간 종료 · 입구 ${a}% 대 ${b}% 로 이겼다!` : '시간 종료 · 처치 수로 이겼다!') : (a !== b ? `시간 종료 · 입구 ${a}% 대 ${b}%` : '시간 종료 · 처치 수에서 졌어요');
}
Object.assign(ACTS, {
  raid: () => showRaid(),
  raidGo: () => startRaid(),
  raidClaim: async () => { const r = await liveAct(API.raidClaim()); if (r) { A.sfx.levelUp(); toast(`${r.label || '레이드 보상'} ${gotText(r.got)}`, 3200); showRaid(); } },
  pvp: () => showPvp(),
  pvpQueue: () => pvpQuick(),
  pvpQuick: () => pvpQuick(),
  pvpEnter: (b) => pvpEnter(b.dataset.code),
  pvpShare: (b) => sharePvpRoom(b.dataset.code),
  pvpRoom: () => pvpRoom(false),
  pvpJoin: () => pvpRoom(true),
  pvpCancel: () => { if (PVP.sock) PVP.sock.emit('cancel'); closeInfoCard(); },
});

// ─── 스테이지 선택 ───────────────────────────────────
// 스테이지 지도: 챕터마다 한 장 (옆으로 넘기면 딱 붙음) · 큰 배너 + 구불구불 길 위의 빛나는 칸 · 별 상자
const MAP_XY = [[50, 95], [22, 86.5], [50, 78], [78, 69.5], [50, 60], [22, 50], [50, 41], [78, 32], [50, 23], [50, 9]]; // 아래(1)에서 위(10)로
const MAP_CHEST = { 10: 3.5, 20: 6.5, 30: [80, 10] }; // 숫자 = 길 위 (칸 사이) · 배열 = 옆 자리 // 별 상자: 길 위 자리 (칸 번호 사이)
function mapPt(k) { const i = Math.floor(k), f = k - i; const a = MAP_XY[Math.max(0, i - 1)], b = MAP_XY[Math.min(9, i)]; return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
function chapterMapHtml(p, c) {
  const first = (c.id - 1) * STAGES_PER_CHAPTER + 1;
  const open = stageUnlocked(first);
  const stars = L.chapterStars(p, c.id);
  const nx = nextStage();
  const path = MAP_XY.map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');
  const doneN = Array.from({ length: STAGES_PER_CHAPTER }, (_, i) => (p.stages[first + i] | 0) > 0).lastIndexOf(true) + 1;
  const donePath = MAP_XY.slice(0, Math.max(1, doneN + (doneN < 10 && stageUnlocked(first + doneN) ? 1 : 0))).map(([x, y], i) => (i ? 'L' : 'M') + x + ' ' + y).join(' ');
  const nodes = MAP_XY.map(([x, y], i) => {
    const s = first + i;
    const op = stageUnlocked(s), st = p.stages[s] | 0;
    const bosses = stageBosses(s), boss = bosses.length > 0;
    const mid = !boss && stageEnemies(s).some((id) => ENEMIES[id] && ENEMIES[id].mid);
    const cur = s === nx && !st && op;
    const hOk = hellOpen(p.stages, s), hs = (p.hell || {})[s] | 0;
    return `<button class="mn ${op ? '' : 'lk'} ${boss ? 'boss' : ''} ${mid ? 'mid' : ''} ${cur ? 'cur' : ''} ${st ? 'done' : ''}" style="left:${x}%;top:${y}%" data-act="mapNode" data-s="${s}">
      ${boss ? `<span class="mn-face">${av(ENEMIES[bosses[0]])}</span>` : `<span class="mn-dot"><b>${i + 1}</b></span>`}
      ${op ? '' : `<i class="mn-lock">${ic('lock', '', 'sm')}</i>`}
      ${mid ? '<em class="mn-mid">중간 보스</em>' : ''}${boss ? `<em class="mn-boss">${esc(shortName(bosses[0]))}</em>` : ''}
      ${cur ? '<i class="mn-here">여기!</i>' : ''}
      ${op && st ? `<span class="mn-st">${'<i class="on">★</i>'.repeat(st)}${'<i>★</i>'.repeat(3 - st)}</span>` : ''}
      ${hOk ? `<i class="mn-hell">${ic('fire', '', 'sm')}${hs ? hs : ''}</i>` : ''}
      <small class="mn-no">${stageLabel(s)}</small></button>`;
  }).join('');
  const opened = (p.chests || {})[c.id] || [];
  const chests = L.CHEST_STARS.map((n) => {
    const [x, y] = Array.isArray(MAP_CHEST[n]) ? MAP_CHEST[n] : mapPt(MAP_CHEST[n]);
    const st = opened.includes(n) ? 'open' : stars >= n ? 'ready' : 'lock';
    return `<button class="mchest chest ${st}" style="left:${x}%;top:${y}%" data-act="chest" data-ch="${c.id}" data-n="${n}">${ic(st === 'open' ? 'check' : 'gift', '', '')}<small>★${n}</small></button>`;
  }).join('');
  return `<section class="chmap ${open ? '' : 'lk'}" data-ch="${c.id}" style="--cc:${c.color}">
    <div class="chm-banner"><div class="chm-art" style="background-image:${chArtCss('keyart', c.id)}"></div>
      <div class="chm-txt"><em>CHAPTER ${c.id}${c.hard ? ' · 고난도' : ''}</em><b>${esc(c.name)}</b><span>${esc(c.desc)}</span></div>
      <div class="chm-prog"><div><i style="width:${Math.round((stars / 30) * 100)}%"></i></div><b>★ ${stars}<small>/30</small></b></div>
      ${open ? '' : `<div class="chm-lock">${ic('lock', '', '')}<b>${stageLabel(first - 1)} 깨면 열려요</b></div>`}
    </div>
    <div class="chm-map" style="background-image:${chArtCss('dio', c.id)}">
      <svg class="chm-path" viewBox="0 0 100 100" preserveAspectRatio="none"><path d="${path}" class="p0"/><path d="${donePath}" class="p1"/></svg>
      ${chests}${nodes}
    </div>
  </section>`;
}
function showStages() {
  app.screen = 'stages';
  hud.hidden = true;
  if (!app.demo) { layout(); app.demo = makeDemo(); }
  const p = P();
  if (!app.selStage || !stageUnlocked(app.selStage)) app.selStage = nextStage();
  if (!app.chapterTab) app.chapterTab = chapterOf(app.selStage);
  R.setTheme(app.chapterTab);
  const dots = CHAPTERS.map((c) => `<button class="chd ${c.id === app.chapterTab ? 'on' : ''} ${stageUnlocked((c.id - 1) * STAGES_PER_CHAPTER + 1) ? '' : 'lk'}" data-act="chapter" data-ch="${c.id}" style="--cc:${c.color}"><b>${c.id}</b></button>`).join('');
  const hasHell = Object.values(p.stages).some((v) => v >= 3);
  show(`
    ${topbar(true, coinsPill())}
    <div class="chd-row">${dots}</div>
    <div class="chmaps">${CHAPTERS.map((c) => chapterMapHtml(p, c)).join('')}</div>
    ${hasHell ? `<div class="mode-tog map-tog"><button class="${app.hellMode ? '' : 'on'}" data-act="hellModeS" data-v="0">보통</button><button class="${app.hellMode ? 'on hell' : ''}" data-act="hellModeS" data-v="1">${ic('fire', '', 'sm')}헬 모드</button></div>` : ''}
  `, 'dim stages-screen map-v2');
  // 옆으로 넘기기: 지금 챕터로 바로 · 멈추면 그 챕터로 (점 · 배경 테마)
  const sc = ui.querySelector('.chmaps');
  if (sc) {
    sc.scrollLeft = (app.chapterTab - 1) * sc.clientWidth;
    let tm = 0;
    sc.addEventListener('scroll', () => {
      clearTimeout(tm);
      tm = setTimeout(() => {
        const c = Math.max(1, Math.min(CHAPTERS.length, Math.round(sc.scrollLeft / Math.max(1, sc.clientWidth)) + 1));
        if (c === app.chapterTab) return;
        app.chapterTab = c; R.setTheme(c); A.sfx.tabSw();
        for (const d of ui.querySelectorAll('.chd')) d.classList.toggle('on', Number(d.dataset.ch) === c);
      }, 90);
    }, { passive: true });
    // PC 마우스 휠: 옆으로 넘기는 지도 위에서도 세로 휠은 화면을 내린다
    sc.addEventListener('wheel', (ev) => { if (Math.abs(ev.deltaY) <= Math.abs(ev.deltaX)) return; const s0 = sc.closest('.screen'); if (!s0) return; ev.preventDefault(); s0.scrollTop += ev.deltaY; }, { passive: false });
    // 지금 칸이 보이게
    const cur = sc.querySelector(`.chmap[data-ch="${app.chapterTab}"] .mn.cur`) || sc.querySelector(`.chmap[data-ch="${app.chapterTab}"] .mn[data-s="${app.selStage}"]`);
    const scr = ui.querySelector('#ui > .screen') || ui.firstElementChild;
    if (cur && scr) requestAnimationFrame(() => { const r = cur.getBoundingClientRect(), r0 = scr.getBoundingClientRect(); scr.scrollTop += r.top - r0.top - r0.height * 0.5; });
  }
}
function mapNodeGo(b) {
  const s = Number(b.dataset.s);
  if (!stageUnlocked(s)) { lockTip(b, stageLabel(s), '앞 스테이지를 먼저 깨 주세요'); return; }
  app.selStage = s;
  A.sfx.confirm();
  b.classList.add('zoom');
  const scr = b.closest('.screen'); if (scr) { const r = b.getBoundingClientRect(), r0 = scr.getBoundingClientRect(); scr.style.setProperty('--zx', `${r.left - r0.left + r.width / 2}px`); scr.style.setProperty('--zy', `${r.top - r0.top + r.height / 2}px`); scr.classList.add('zoomout'); }
  setTimeout(() => showPrep('stage', s), 230);
}

// ─── 출전 준비: 동료 고르기 ──────────────────────────
// 맵 효과가 속성을 건드리면: " · 말빨 → 방장·운영진"
function fxWho(fx0, g) { if (!fx0 || !fx0.attr) return ''; return Object.keys(fx0.attr).map((a) => { const w = attrWho(g, a); return ATTRS[a] && w ? ` · ${ATTRS[a].icon}${ATTRS[a].name} → ${w}` : ''; }).join(''); }
const aIco = (id, emoji) => `<img class="aico" src="/img/lb/attr/${id}.webp" alt="${emoji}" draggable="false" onerror="this.replaceWith(document.createTextNode('${emoji}'))">`;
const attrIco = (a) => (ATTRS[a] ? aIco(a, ATTRS[a].icon) : '');
const clsIco = (c) => (CLASSES[c] ? aIco(c, CLASSES[c].icon) : '');
const attrTag = (a) => (ATTRS[a] ? `<span class="attr" style="--ac:${ATTRS[a].color}">${attrIco(a)}${ATTRS[a].name}</span>` : '');
const clsTag = (c) => (CLASSES[c] ? `<span class="attr cls" style="--ac:${CLASSES[c].color}">${clsIco(c)}${CLASSES[c].name}</span>` : '');
function strongWeak(attr) {
  const t = TYPE_CHART[attr] || {};
  const st = Object.keys(t).filter((c) => t[c] > 1).map((c) => CLASSES[c].name);
  const wk = Object.keys(t).filter((c) => t[c] < 1).map((c) => CLASSES[c].name);
  return `강함: ${st.join('·')} · 약함: ${wk.join('·')}`;
}
// 영웅 설명 (출전 준비 · 정보 카드 · 필드 말풍선에서 같이 씀)
function heroInfoHtml(d, full) {
  const meta = (P().heroes || {})[d.id] || 0;
  const sk = d.skill;
  return `<div class="ih"><b>${d.name}</b>${attrTag(d.attr)}${meta ? `<em>강화 +${meta}</em>` : ''}</div>
 <p class="ia">${ic('swords', '', 'sm')} ${esc(d.attack || d.desc)} <span class="rg">사거리 ${Array.isArray(d.range) ? d.range[0] : d.range}</span></p>
    ${sk ? `<p class="is">${ic('sparkle', '', 'sm')}<b>${esc(sk.name)}</b> ${esc(sk.desc)} <span class="rg">쿨 ${sk.cd}초${sk.target ? ' · 찍어서 사용' : ''}</span></p>` : ''}
    ${full ? `<p class="ip">Lv3 ${esc(d.perks[3])} · Lv5 ${esc(d.perks[5])}</p><p class="ip">${attrTag(d.attr)} ${esc(strongWeak(d.attr))}</p>` : ''}`;
}
function enemyInfoHtml(e) {
  const good = Object.keys(ATTRS).filter((a) => typeMul(a, e.cls) > 1).map((a) => attrIco(a) + ATTRS[a].name);
  const bad = Object.keys(ATTRS).filter((a) => typeMul(a, e.cls) < 1).map((a) => attrIco(a) + ATTRS[a].name);
  return `<div class="ih"><b>${e.name}</b>${clsTag(e.cls)}${e.boss ? '<em class="bs">보스</em>' : ''}</div>
    <p class="ia">${esc(ENEMY_TIPS[e.id] || '')}</p>
    <p class="ip">잘 먹힘 ${good.join(' ')} · 안 먹힘 ${bad.join(' ')}</p>`;
}
// 아이콘을 누르면 뜨는 설명 카드
function showInfoCard(kind, id) {
  const d = kind === 'enemy' ? ENEMIES[id] : HEROES[id];
  if (!d) return;
  if (kind === 'hero' && !API.heroUnlocked(P(), id)) { toast(unlockText(id) || '아직 합류하지 않았어요'); return; }
  closeInfoCard();
  const box = document.createElement('div');
  box.className = 'info-modal';
  box.innerHTML = `<div class="info-card">${av(d)}<div class="ic-body">${kind === 'enemy' ? enemyInfoHtml(d) : heroInfoHtml(d, true)}</div><button class="btn ghost" data-ic="x">닫기</button></div>`;
  stage.appendChild(box);
  box.addEventListener('click', (ev) => { if (ev.target === box || ev.target.closest('[data-ic]')) closeInfoCard(); });
  A.sfx.tap();
}
function closeInfoCard() { for (const m of document.querySelectorAll('.info-modal')) m.remove(); }
function teamLine() {
  const ids = ['bangjang', ...app.partners];
  const rec = app.mode === 'stage' ? recommendAttrs(app.stage) : [];
  const hit = ids.filter((id) => rec.includes(HEROES[id].attr)).length;
  const avail = partnerList().filter(heroOk);
  const best = app.mode === 'stage' ? recommendTeam(app.stage, avail, slotsNow()) : [];
  return `팀: ${ids.map((id) => `${HEROES[id].name}${ATTRS[HEROES[id].attr].icon}`).join(' + ')}${rec.length ? ` · 추천 속성 ${rec.map((a) => ATTRS[a].icon).join('')} ${hit ? `<b class="ok">${hit}명 맞음</b>` : '<b class="no">0명</b>'}` : ''}${best.length ? `<br><small>${ic('bulb', '', 'sm')}추천 팀: 방장 + ${best.map((id) => HEROES[id].name).join(' + ')}</small>` : ''}`;
}
// ─── 덱: 자리(줄)마다 멤버. 프리셋 3개 (이 기기에 저장) ───
const DECK_KEY = 'langbang:decks';
app.decks = [[], [], []];
app.deckI = 0;
app.deckSel = -1;
try { const d = JSON.parse(localStorage.getItem(DECK_KEY) || 'null'); if (d && Array.isArray(d.decks)) { app.decks = d.decks.slice(0, 3); app.deckI = d.i | 0; } } catch { /* 무시 */ }
while (app.decks.length < 3) app.decks.push([]);
const deckSlotsNow = () => P().deckSlots || 5;
const nPosNow = () => (deckSlotsNow() >= 7 ? 7 : 6);
const owned = () => ['bangjang', ...partnerList()].filter((id) => API.heroUnlocked(P(), id));
function curDeck() { return app.decks[app.deckI]; }
function saveDecks() {
  try { localStorage.setItem(DECK_KEY, JSON.stringify({ decks: app.decks, i: app.deckI })); } catch { /* 무시 */ }
  if (!app.guest && app.profileLoaded) { clearTimeout(saveDecks.t); saveDecks.t = setTimeout(() => API.saveDecksRemote(app.decks, app.deckI, [0, 1, 2].map((k) => leaders()[k] || null)).catch(() => {}), 1500); }
}
// 멤버 팝업의 "덱에 넣기 / 덱에서 빼기" — 지금 고른 덱 프리셋에 바로 (꽉 차면 바꿀 자리 고르기)
function deckQuick(id) {
  if (!API.heroUnlocked(P(), id)) { toast(unlockText(id) || '아직 합류하지 않았어요'); return; }
  fixDeck();
  const ids = curDeck().filter(Boolean), max = deckSlotsNow();
  if (ids.includes(id)) { app.decks[app.deckI] = placeDeck(ids.filter((x) => x !== id)); A.sfx.tap(); }
  else if (ids.length >= max) {
    A.sfx.tap();
    const f = ui.querySelector('.deck-field'); if (f) { f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); }
    toast(`덱이 꽉 찼어요 (${ids.length}/${max}) — 뺄 멤버를 먼저 눌러요`, 1500);
    return;
  } else { app.decks[app.deckI] = placeDeck([...ids, id]); app.deckPop = id; A.sfx.card(); }
  saveDecks();
  if (app.screen === 'deck') showDeckTab(); else showPrep(app.mode, app.stage);
}
function deckToggleAct(id, replace) {
  if (!API.heroUnlocked(P(), id)) { toast(unlockText(id) || '아직 합류하지 않았어요'); return; }
  fixDeck();
  if (replace !== undefined) { const ids = curDeck().filter(Boolean); const out = ids[replace]; const nx = ids.filter((x) => x !== out); nx.push(id); app.decks[app.deckI] = placeDeck(nx); saveDecks(); closeInfoCard(); refresh(); toast(`${HEROES[id].name}을(를) 넣었어요`, 1200); return; }
  const r = L.deckToggle(curDeck(), id, deckSlotsNow(), posOrder(), replace);
  const name = `덱 ${app.deckI + 1}`;
  if (r.action === 'full') {
    const d = curDeck();
    popup(`<h3>${name}이 꽉 찼어요</h3><p class="ip">누구 대신 ${HEROES[id].name}을(를) 넣을까요?</p>
      <div class="slot-pick">${d.filter(Boolean).map((h, i) => (h ? `<button class="btn" data-act="deckReplace" data-id="${id}" data-slot="${i}">${av(HEROES[h])}<span>${HEROES[h].name} 대신</span></button>` : '')).join('')}</div>`, 'slot-pop');
    return;
  }
  app.decks[app.deckI] = r.deck;
  saveDecks();
  A.sfx.card();
  toast(r.action === 'added' ? `${name}에 넣었어요` : `${name}에서 뺐어요`, 1200);
  closeInfoCard();
  refresh();
}
// 자리 우선순위: 가운데부터 (7칸이면 3 → 2 → 4 …)
const posOrder = () => openSlots(6); // 자리 6칸은 모두 쓸 수 있다 (가운데부터) — 데려갈 수 있는 멤버 수만 산 만큼
const lockedPos = () => [];
// 역할별 좋은 자리: 방장 음파·김도훈 음파·김영준 돌격은 가운데, 줄 공격(새총·지팡이)은 가운데 줄, 나머지는 바깥
function placeDeck(ids) {
  const n = nPosNow();
  const out = new Array(n).fill(null);
  const order = posOrder();
  const center = (id) => ['cone', 'wave', 'dash', 'bullet', 'cane'].includes(HEROES[id].proj) ? 0 : 1;
  ids.slice().sort((a, b) => center(a) - center(b)).forEach((id, i) => { out[order[i]] = id; });
  return out;
}
function fixDeck() {
  // 프로필(서버)이 오기 전엔 손대지 않는다 — 전엔 로그인 전 손님 프로필 기준으로 덱을 정리해서, 손님이 안 가진 멤버(강성구 등)가 덱에서 지워졌다
  if (!app.profileLoaded) return;
  const n = nPosNow(), max = deckSlotsNow();
  const mine = new Set(owned());
  for (let k = 0; k < 3; k++) {
    // 비운 덱은 비운 그대로 (자동으로 채우지 않는다) — 처음 만드는 덱만 기본 멤버로
    app.decks[k] = L.cleanDeck(app.decks[k], mine, n, max, () => placeDeck(owned().slice(0, max)));
  }
  saveDecks();
}
function autoDeck() {
  const s = prepStage() || 20;
  const ids = recommendTeam(s, owned(), deckSlotsNow());
  app.decks[app.deckI] = placeDeck(ids);
  saveDecks();
}
function deckLine() {
  const ids = curDeck().filter(Boolean);
  const rec = prepStage() ? recommendAttrs(prepStage()) : [];
  const hit = ids.filter((id) => rec.includes(HEROES[id].attr)).length;
  const cnt = {};
  for (const id of ids) cnt[HEROES[id].attr] = (cnt[HEROES[id].attr] || 0) + 1;
  return `속성 ${Object.keys(ATTRS).map((a) => `${ATTRS[a].icon}${cnt[a] || 0}`).join(' ')}${rec.length ? ` · 추천 ${rec.map((a) => ATTRS[a].icon).join('')} ${hit ? `<b class="ok">${hit}명 맞음</b>` : '<b class="no">0명</b>'}` : ''}`;
}
function renderDeckField() {
  const max = deckSlotsNow();
  const ids = curDeck().filter(Boolean);
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const id = ids[i], h = id && HEROES[id];
    if (i >= max) { cells.push(`<button class="dslot lockd" data-act="shop" aria-label="덱 칸 늘리기"><span class="lk">${ic('lock', '', 'sm')}</span><small>${i === max ? `${fmt(ITEMS[max < 5 ? 'slot5' : 'slot6'].costs[0])}` : ''}</small></button>`); continue; }
    cells.push(h
      ? `<button class="dslot ${app.deckPop === id ? 'pop' : ''}" data-act="deckRemove" data-id="${id}" style="--c:${h.color}">${av(h)}<b>${h.name}</b><span class="pa">${ATTRS[h.attr].icon}</span>${matchTag(id)}<i class="rm">✕</i></button>`
      : '<div class="dslot empty"><i>+</i></div>');
  }
  app.deckPop = null;
  return `<div class="deck-field list">${cells.join('')}</div>`;
}
// 스테이지 웨이브 성격 한 줄: 떼거리(범위) · 정예(한 방) · 혼합 · 보스
function waveRowHtml(s) {
  const ks = stageWaveKinds(s);
  const nS = ks.filter((k) => k === 'S' || k === 'M' || k === 'B').length, nE = ks.filter((k) => k === 'E' || k === 'M').length;
  const tip = nS > nE + 1 ? '범위 공격 멤버를 챙겨요' : nE > nS ? '한 방 센 멤버를 챙겨요' : '범위 + 한 방 골고루';
  return `<div class="wave-row" data-act="waveHelp">${ks.map((k, i) => `<span class="wk k${k}"><small>${i + 1}</small>${WAVE_KINDS[k].icon}</span>`).join('')}<em>${tip}</em></div>`;
}
function prepStage() { return app.mode === 'weekly' ? L.weeklyDef(L.weekIndex()).stage : app.mode === 'stage' ? app.stage : 0; }
function matchTag(id) {
  const s = prepStage();
  if (!s) return '';
  const m = attrMatch(HEROES[id].attr, s);
  return `<span class="mt ${m.cls}">${m.arrow}</span>`;
}
// ─── 출격 준비: 한 화면에 (스테이지 카드 · 난이도 · 전투력 · 등장 진상 · 덱 · 보상 · 출격) — 긴 설명은 ⋯ / ℹ️ 뒤로 ───
function stagePower(p, s, hell) { // 권장 전투력: 기본 멤버 4명이 그 스테이지쯤 강화했을 때
  const m = Math.round(s * 0.25), base = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
  const q = Object.assign({}, p, { heroes: Object.fromEntries(base.map((h) => [h, m])), equip: {}, hstars: {} });
  return Math.round(deckPower(q, base) * (1 + 0.05 * (chapterOf(s) - 1)) * (hell ? 1.9 : 1));
}
const foeFace = (id, cls = '') => { const d = ENEMIES[id]; return `<span class="pp-face ${cls}" style="--fc:${d.color || '#8a7ab0'}"><img src="${d.img}" alt="" draggable="false" onerror="${d.fb ? `this.onerror=null;this.src='${d.fb}';this.style.filter='hue-rotate(160deg) saturate(1.3)'` : 'this.remove()'}"></span>`; };
const foeTrait = (id) => { const t = ENEMIES[id].traits || {}; const k = Object.keys(t).find((x) => TRAITS[x]); return k ? TRAITS[k] : null; };
// 준비 화면 '이 스테이지' 칸: 맵 효과 한 줄 · 진상 기믹 칩 · ★★★ 미션 (누르면 공략 · 맞는 멤버)
function prepCondHtml(fxd, conds, mis, rec) {
  const chips = [];
  if (fxd && fxd.id !== 'none') chips.push(`<button class="pc-chip fx" data-act="prepFx">${IC_MAP[fxd.icon] ? ic(IC_MAP[fxd.icon], '', 'sm') : ''}${esc(fxd.short || fxd.name)}</button>`);
  for (const c of conds) chips.push(`<button class="pc-chip" data-act="prepCond">${ic(COND[c].icon, '', 'sm')}${esc(COND[c].name)}</button>`);
  if (!chips.length && !mis) return '';
  return `<div class="pp-cond">${chips.length ? `<div class="pc-row"><span class="pp-lab">이 스테이지</span>${chips.join('')}</div>` : ''}${mis ? `<button class="pc-mis" data-act="prepCond"><span class="pc-st">★★★</span>입구 70% + <b>${esc(mis.text)}</b>${rec ? `<small>권장 +${rec}</small>` : ''}</button>` : ''}</div>`;
}
function prepCondPopup() {
  const s = app.stage, hellOn = hellOpen(P().stages, s) && app.hellMode;
  const conds = stageConds(s, hellOn), mis = stageMission(s, hellOn), rec = recMeta(s, hellOn);
  const deck = new Set(curDeck().filter(Boolean)), mine = owned();
  const who = (c) => COND[c].counter.filter((id) => HEROES[id] && mine.includes(id)).map((id) => `<span class="pc-who ${deck.has(id) ? 'on' : ''}">${esc(HEROES[id].name)}</span>`).join('') || '<span class="pc-who">아직 없음</span>';
  popup(`<h3>이 스테이지 공략</h3>
    ${conds.map((c) => `<div class="pc-pop">${ic(COND[c].icon, '', 'sm')}<div><b>${esc(COND[c].name)}</b><p class="ip">${esc(COND[c].tip.replace(/^[^:]+:\s*/, ''))}</p><div class="pc-whos">${who(c)}</div></div></div>`).join('') || '<p class="ip">특별한 진상 기믹은 없어요</p>'}
    ${mis ? `<p class="ip"><b>★★★</b> = 입구 70% 이상 + 미션 「${esc(mis.text)}」 (전에 받은 별은 그대로)</p>` : ''}
    <p class="ip">강화는 이 장 권장 <b>+${rec}</b> 까지 제값 · 넘는 만큼은 절반만 들어가요 — 덱 구성이 먼저!</p>
    <p class="ip dim">초록 이름 = 지금 덱에 있는 맞는 멤버</p>`, 'pp-mini');
}
function prepFoes(st) { return st ? stageMix(st).filter(([t]) => ENEMIES[t] && !ENEMIES[t].dot).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t) : []; }
function prepRecSet(st) {
  const r = new Set();
  if (!st) return r;
  const mine = owned();
  for (const id of recommendTeam(st, mine, deckSlotsNow())) r.add(id);
  for (const t of prepFoes(st)) { const T = foeTrait(t); if (T) for (const h of T.counter) if (mine.includes(h)) r.add(h); }
  return r;
}
function showPrep(mode, s) {
  if (mode === 'stage' && !stageUnlocked(s)) s = nextStage();
  app.mode = mode;
  app.stage = mode === 'stage' ? s : 0;
  app.screen = 'prep';
  hud.hidden = true;
  fixDeck();
  const p = P();
  const max = deckSlotsNow();
  const ids = curDeck().filter(Boolean);
  const wk = mode === 'weekly' ? L.weeklyDef(L.weekIndex()) : null;
  const st = prepStage();
  const ch = st ? chapterOf(st) : 0;
  R.setTheme(st ? ch : 'endless');
  const fxd = wk ? MAP_FX[wk.fx] || MAP_FX.none : mode === 'stage' ? stageFx(s) : MAP_FX.none;
  const cleared = mode === 'stage' && (p.stages[s] | 0) > 0;
  const hellOk = mode === 'stage' && hellOpen(p.stages, s);
  const hellOn = hellOk && app.hellMode;
  const free = p.master && !p.testNormal;
  // 1) 스테이지 카드
  const bossId = st ? stageBosses(st)[0] || stageMid(st) : null;
  const bossTag = st && stageBosses(st).length ? 'BOSS' : '중간 보스';
  const stars = mode === 'stage' ? (hellOn ? (p.hell || {})[s] || 0 : p.stages[s] || 0) : 0;
  const bg = `/img/lb/bg${ch >= 2 && ch <= 7 ? ch : ''}.webp`;
  const head = mode === 'stage'
    ? `<em class="pp-no">${stageLabel(s)}</em><b class="pp-name">${esc(stageName(s))}</b><span class="pp-meta"><i class="pp-stars">${'★'.repeat(stars)}<u>${'★'.repeat(3 - stars)}</u></i>${p.perfects && p.perfects[s] ? ic('gem', '', 'sm') : ''}<button class="pp-fx" data-act="prepFx">${IC_MAP[fxd.icon] ? ic(IC_MAP[fxd.icon], '', 'sm') : ''}${esc(fxd.name)}</button></span>`
    : wk ? `<em class="pp-no sm">${ic('calendar', '')} 주간 도전</em><b class="pp-name">${esc(L.WEEKLY_MODS[wk.mod].name)}</b><span class="pp-meta"><button class="pp-fx" data-act="prepFx">${IC_MAP[fxd.icon] ? ic(IC_MAP[fxd.icon], '', 'sm') : ''}${esc(fxd.name)}</button></span>`
      : `<em class="pp-no sm">${ic('infinity', '')} 무한 도전</em><b class="pp-name">최고 W${p.bestWave || 0} · ${fmt(p.bestScore || 0)}점</b><span class="pp-meta"><button class="pp-fx" data-act="rwInfo" data-v="endless">${ic('gift', '')} 오늘 ${free ? '∞' : L.endlessLeft(p)}/${L.ENDLESS.perDay}</button></span>`;
  const headHtml = `<div class="pp-head ${hellOn ? 'hell' : ''} ${wk ? 'wk' : ''} ${!st ? 'end' : ''}" style="--bg:url('${bg}')">
      <div class="pp-hl">${head}</div>
      ${bossId ? `<button class="pp-boss" data-act="prepFoe" data-id="${bossId}">${foeFace(bossId, 'big')}<i>${bossTag}</i></button>` : ''}
    </div>`;
  // 2) 난이도
  const diffLine = hellOn ? `헬 · 체력 ×${HELL.hp} · 공격 ×${HELL.atk} · 보상 ×${HELL.coin}` : mode === 'stage' ? `보통 · ${STAGE_WAVES}웨이브${stageBosses(s).length ? ' · 보스' : stageMid(s) ? ' · 중간 보스' : ''}` : wk ? L.WEEKLY_MODS[wk.mod].desc : '';
  const diffHtml = mode === 'stage'
    ? `<div class="pp-diff"><div class="pp-seg"><button class="${hellOn ? '' : 'on'}" data-act="hellMode" data-v="0">보통</button><button class="${hellOn ? 'on hell' : ''} ${hellOk ? '' : 'lk'}" data-act="${hellOk ? 'hellMode' : 'prepHellLock'}" data-v="1">${hellOk ? '' : ic('lock', '', 'sm')}헬</button></div><p class="pp-line">${esc(diffLine)}<button class="pp-i" data-act="prepDiffInfo" aria-label="난이도 설명">i</button></p></div>`
    : diffLine ? `<p class="pp-line solo">${esc(diffLine)}</p>` : '';
  // 2-1) 이 스테이지 조건: 맵 효과 · 진상 기믹(보호막 · 은신 · 기절 예고 · 철갑 · 떼거리 · 문 돌격) · ★★★ 미션 · 강화 권장
  const conds = mode === 'stage' ? stageConds(s, hellOn) : [];
  const mis = mode === 'stage' ? stageMission(s, hellOn) : null;
  const condHtml = prepCondHtml(fxd, conds, mis, mode === 'stage' ? recMeta(s, hellOn) : 0);
  // 3) 전투력
  const pw = deckPower(p, ids), need = st ? stagePower(p, st, hellOn) : 0;
  const ok = !need || pw >= need;
  const powHtml = `<div class="pp-pow ${ok ? 'ok' : 'low'}"><div class="pp-pow-t">${ic('swords', '', 'sm')}<span>내 전투력</span><b>${fmt(pw)}</b>${need ? `<small>/ 권장 ${fmt(need)}</small>` : ''}${ok ? '' : '<button class="pp-link" data-act="nav" data-tab="bag">강화하러 가기 ›</button>'}</div>${need ? `<i class="pp-bar"><b style="width:${Math.min(100, Math.round((pw / need) * 100))}%"></b></i>` : ''}</div>`;
  // 4) 등장 진상
  const foes = prepFoes(st);
  const foeHtml = foes.length ? `<div class="pp-foes"><span class="pp-lab">등장 진상</span><div class="pp-chips">${foes.map((t) => { const T = foeTrait(t); return `<button class="pp-foe" data-act="prepFoe" data-id="${t}">${foeFace(t)}${T ? `<i class="pp-tb">${T.icon}</i>` : ''}</button>`; }).join('')}</div></div>` : '';
  // 5) 덱: 2줄 × 3 큰 그림 카드 (대장 왕관) — 누르면 덱 편집 창
  const dl = deckList();
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const id = dl[i];
    if (i >= max) { cells.push(`<button class="pp-slot lock" data-act="shop">${ic('lock', '')}<small>${i === max ? fmt(ITEMS[max < 5 ? 'slot5' : 'slot6'].costs[0]) : ''}</small></button>`); continue; }
    cells.push(id ? deckCard(id, i === 0, 'prepEdit', `${app.deckPop === id ? 'pop' : ''} ${condFits(id, conds).length ? 'fit' : ''}`) : '<button class="pp-slot empty" data-act="prepEdit"><i>+</i></button>');
  }
  app.deckPop = null;
  const deckHtml = `<div class="pp-deck">
      <div class="pp-dh"><span class="pp-lab">내 덱 <b>${ids.length}/${max}</b></span><div class="pp-pre">${[0, 1, 2].map((k) => `<button class="${k === app.deckI ? 'on' : ''}" data-act="deckPreset" data-k="${k}">${k + 1}</button>`).join('')}</div><button class="pp-auto" data-act="prepEdit">${ic('duo', '', 'sm')}덱 편집</button></div>
      <div class="pp-slots g6">${cells.join('')}</div>
    </div>`;
  // 6) 보상
  let rw = '';
  if (mode === 'stage') {
    const prev = hellOn ? 3 : p.stages[s] | 0;
    const r = stageReward(s, 3, prev);
    const items = [`<span><i class="ci"></i>${fmt(Math.round(r.clear * (hellOn ? HELL.coin : 1)))}</span>`];
    if (r.first) items.push(`<span>${ic('gift', '', 'sm')}첫 클리어 +${fmt(r.first)}</span>`);
    if (r.star) items.push(`<span class="st">★3 +${fmt(r.star)}</span>`);
    items.push(`<span>${ic('dagger', '', 'sm')}장비 ×${hellOn ? '2~' : '1~'}</span>`, `<span>${ic('card_rare', '', 'sm')}카드</span>`);
    rw = `<button class="pp-rw" data-act="prepRw">${items.join('')}</button>`;
  } else rw = `<button class="pp-rw" data-act="rwInfo" data-v="${wk ? 'weekly' : 'endless'}"><span>${ic('gift', '', 'sm')}보상 보기</span></button>`;
  // 7) 출격
  const cost = mode === 'stage' && !free ? L.stageStaminaCost(p, s, hellOn) : 0;
  const goHtml = `<div class="pp-go">
      ${cleared ? `<button class="pp-spd ${app.speed2 ? 'on' : ''}" data-act="speedTog" aria-pressed="${app.speed2 ? 'true' : 'false'}" aria-label="2배속">${ic('speed', '')}<b>×2</b><small>${app.speed2 ? 'ON' : 'OFF'}</small></button>` : ''}
      <button class="pp-gobtn2 ${ids.length ? '' : 'dim'} ${hellOn ? 'hell' : ''}" data-act="go"><i class="gb-shine"></i><b>출격!</b>${cost ? `<span class="gb-cost">${ic('energy', '', 'sm')}<em>${cost}</em></span>` : ''}</button>
    </div>`;
  show(`
    <div class="topbar pp-top"><button class="back" data-act="${mode === 'weekly' ? 'weekly' : 'menu'}">‹ 뒤로</button><div class="pp-curs">${free ? '' : `<button class="pill cur sta ${L.staminaNow(p, Date.now()).v > L.STAMINA.max ? 'over' : ''}" data-act="stamina">${ic('energy', '', 'sm')}<b id="staV">${staText(p)}</b></button>`}<span class="pill cur"><i class="ci"></i><b>${p.unlimited ? '∞' : fmt(p.coins || 0)}</b></span><button class="pp-more" data-act="prepMore" aria-label="더 보기">⋯</button></div></div>
    ${headHtml}${diffHtml}${condHtml}${powHtml}${foeHtml}${deckHtml}${consPrepHtml()}${rw}
    <div class="spacer"></div>
    ${goHtml}
  `, 'dim prep-screen pp');
}
// ─── 전투 소모품: 출전 칸 (덱마다 저장) · 전투 버튼 · 끝나면 안 쓴 것 돌려받기 ───
const CONS_KEY = 'langbang:cons';
function consAll() { if (!app.consSel) { try { app.consSel = JSON.parse(localStorage.getItem(CONS_KEY) || '{}') || {}; } catch { app.consSel = {}; } } return app.consSel; }
function consLoadout() { const n = L.consSlots(P().level); const a = (consAll()[app.deckI] || []).slice(0, n); while (a.length < n) a.push(null); return a; }
function consSave(a) { consAll()[app.deckI] = a; try { localStorage.setItem(CONS_KEY, JSON.stringify(app.consSel)); } catch { /* 무시 */ } }
const consHave = (id) => (P().cons || {})[id] | 0;
const consIc = (id, cls = '') => `<img class="cs-ic ${cls}" src="/img/lb/ui2/${L.CONS[id].icon}.webp" alt="" draggable="false">`;
const CONS_RC = { rare: '#4ea8ff', epic: '#c77dff', legend: '#ffd23f' };
function consPrepHtml() {
  const lo = consLoadout(), any = L.CONS_IDS.some((id) => consHave(id) > 0);
  if (!any && !lo.some(Boolean)) return '';
  const tip = any && !tutDone('cons');
  const cells = lo.map((id, k) => {
    if (!id) return `<button class="cq-slot empty" data-act="consSlot" data-k="${k}"><span class="cq-plus">+</span><small>비어 있음</small></button>`;
    const n = consHave(id);
    return `<button class="cq-slot ${n ? '' : 'none'}" data-act="consSlot" data-k="${k}" style="--rc:${CONS_RC[L.CONS[id].rarity]}">${consIc(id)}<b>${esc(L.CONS[id].name)}</b><i class="cq-n">${n}</i></button>`;
  }).join('');
  return `<div class="pp-cons ${tip ? 'tut' : ''}"><div class="cq-h"><span class="pp-lab">소모품</span><small>칸마다 판에 한 번 · 안 쓰면 돌려받아요</small></div><div class="cq-slots">${cells}</div>${tip ? '<p class="cq-tip">보조배터리를 칸에 넣고 전투에서 눌러 쓰세요</p>' : ''}</div>`;
}
function showConsPick(k) {
  const lo = consLoadout();
  const rows = L.CONS_IDS.filter((id) => !L.CONS[id].hidden || consHave(id) > 0).map((id) => { const c = L.CONS[id], n = consHave(id), on = lo.includes(id); return `<button class="cs-row ${n ? '' : 'none'} ${on ? 'on' : ''}" data-act="consPick" data-k="${k}" data-id="${id}" ${n ? '' : 'disabled'} style="--rc:${CONS_RC[c.rarity]}">${consIc(id)}<span><b>${esc(c.name)} <em>×${n}</em></b><small>${esc(c.desc)}</small></span></button>`; }).join('');
  const cur = lo[k] && L.CONS[lo[k]];
  popup(`<h3>소모품 고르기</h3>${cur ? `<p class="ip cs-cur">${consIc(lo[k])}<b>${esc(cur.name)}</b> — ${esc(cur.desc)} <small>(${esc(cur.tip)})</small></p>` : ''}<div class="cs-list">${rows}</div>${lo[k] ? `<button class="btn" data-act="consPick" data-k="${k}" data-id="">칸 비우기</button>` : ''}<p class="ip">전투에 가져간 소모품은 끝나면 안 쓴 것만 돌려받아요 · 1:1 대전에서는 못 써요</p>`, 'pp-mini cons-pop');
}
// 전투 버튼 (스킬 버튼 위)
const consBar = document.createElement('div');
consBar.id = 'consbar'; consBar.hidden = true;
stage.appendChild(consBar);
// 길게 누르면 (0.35초) 설명 말풍선 · 처음 쓰는 소모품은 한 번 눌러 설명 → 한 번 더 누르면 사용
let consPress = null;
function consBubble(b, id, extra) {
  const c = L.CONS[id], g = app.g, left = g && (g.consUsed || {})[id] ? 0 : 1;
  bubble.className = 'bubble skill-info';
  bubble.innerHTML = `<div class="ih">${consIc(id, 'cb-bic')}<b>${esc(c.name)}</b></div><p class="ia">${esc(c.desc)} · 남은 ${left}개</p>${extra ? `<p class="ip">${extra}</p>` : ''}`;
  const cr = canvas.getBoundingClientRect(), br = b.getBoundingClientRect();
  placeBubble(Math.max(90, Math.min(270, ((br.left + br.width / 2 - cr.left) / cr.width) * FIELD.W)), ((br.bottom - cr.top) / cr.height) * (g ? g.H : 720) + 70);
  bubble.hidden = false; clearTimeout(showHeroBubble.t); showHeroBubble.t = setTimeout(hideBubble, 2600);
}
consBar.addEventListener('pointerdown', (ev) => { const b = ev.target.closest('[data-cons]'); if (!b) return; consPress = { long: false, t: setTimeout(() => { consPress.long = true; consBubble(b, b.dataset.cons); vibrate(10); }, 350) }; });
for (const evn of ['pointerup', 'pointercancel', 'pointerleave']) consBar.addEventListener(evn, () => { if (consPress) clearTimeout(consPress.t); });
consBar.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-cons]'); const g = app.g;
  if (!b || !g || app.paused) return;
  if (consPress && consPress.long) { consPress = null; return; }
  A.unlock();
  const id = b.dataset.cons;
  if (id === 'reroll') { if (app.cardsOpen) rerollCoupon(); else toast('레벨업 카드 화면에서 눌러 써요', 1400); return; }
  if (!tutDone('consuse:' + id) && !(g.consUsed || {})[id]) { setTut('consuse:' + id); consBubble(b, id, '한 번 더 누르면 사용'); return; }
  if ((g.consUsed || {})[id]) { toast('이번 판에 이미 썼어요', 900); return; }
  if (g.consCdT > 0) { toast(`소모품은 ${Math.ceil(g.consCdT)}초 뒤에`, 900); return; }
  if (S.useCons(g, id)) { vibrate(20); handleEvents(g, true); renderConsBar(true); }
});
function renderConsBar(force) {
  const g = app.g;
  const on = !!(g && g.cons && g.cons.length && app.screen === 'play');
  consBar.hidden = !on;
  if (!on) return;
  const key = g.cons.join(',') + '|' + Object.keys(g.consUsed || {}).join(',');
  if (force || consBar.dataset.key !== key) {
    consBar.dataset.key = key;
    consBar.innerHTML = g.cons.map((id) => `<button class="cb ${(g.consUsed || {})[id] ? 'used' : ''}" data-cons="${id}" aria-label="${esc(L.CONS[id].name)}" style="--rc:${CONS_RC[L.CONS[id].rarity]}">${consIc(id)}<i class="cb-n">${(g.consUsed || {})[id] ? 0 : 1}</i><i class="cb-cd"></i></button>`).join('');
  }
  const cd = Math.max(0, g.consCdT || 0) / S.CONS_CD;
  for (const b of consBar.children) b.style.setProperty('--cd', cd.toFixed(3));
}
// 전투가 끝나면 (이기든 지든 그만두든) 한 번: 안 쓴 것 돌려받기
function consFinish(g) {
  if (!g || g.consDone || !g.cons || !g.cons.length) return;
  g.consDone = true;
  const used = Object.keys(g.consUsed || {});
  Promise.resolve(API.consEnd(used, app.guest)).then((r) => { if (r && r.ok && r.profile) app.profile = r.profile; }).catch(() => {});
}
// 대장: 덱마다 한 명 (덱 1번 칸 · 왕관) — 없으면 덱 첫 멤버
const LEAD_KEY = 'langbang:leaders';
function leaders() { if (!app.leaders) { try { app.leaders = JSON.parse(localStorage.getItem(LEAD_KEY) || '{}') || {}; } catch { app.leaders = {}; } } return app.leaders; }
function deckLeader() { const ids = curDeck().filter(Boolean), l = leaders()[app.deckI]; return ids.includes(l) ? l : ids[0] || null; }
function setLeader(id) { leaders()[app.deckI] = id; try { localStorage.setItem(LEAD_KEY, JSON.stringify(app.leaders)); } catch { /* 무시 */ } saveDecks(); } // 서버에도 (덱과 같이)
const ORDER_KEY = 'langbang:deckOrder';
function deckOrders() { if (!app.deckOrders) { try { app.deckOrders = JSON.parse(localStorage.getItem(ORDER_KEY) || '{}') || {}; } catch { app.deckOrders = {}; } } return app.deckOrders; }
function deckList() {
  const ids = curDeck().filter(Boolean), l = deckLeader();
  const ord = (deckOrders()[app.deckI] || []).filter((x) => ids.includes(x));
  const rest = [...ord, ...ids.filter((x) => !ord.includes(x))];
  return l ? [l, ...rest.filter((x) => x !== l)] : rest;
}
// 덱을 순서대로 통째로 바꾸기 (1번 = 대장)
function setDeckOrder(list) {
  const ids = list.filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).slice(0, deckSlotsNow());
  app.decks[app.deckI] = placeDeck(ids);
  deckOrders()[app.deckI] = ids;
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(app.deckOrders)); } catch { /* 무시 */ }
  if (ids[0]) setLeader(ids[0]); else saveDecks();
}
// 덱 카드: 얼굴이 잘 보이게 (도감 썸네일 같은 자르기) · 이름 띠 · 구석에 속성 하나 · 대장 왕관
function deckCard(id, lead, act, cls = '') {
  return artCard(id, { act, cls: `pp-card ${lead ? 'lead' : ''} ${cls}`, extra: lead ? `<i class="pp-crown">${pimg(ui2('crown'))}</i>` : '' });
}
function showDeckEditor() {
  const p = P();
  const max = deckSlotsNow();
  const dl = deckList(), lead = dl[0];
  const st = prepStage();
  const rec = prepRecSet(st);
  const f = app.edF || 'all', so = app.edSort || 'pw';
  const pass = (id) => f === 'all' || (f === 'rec' ? rec.has(id) : f.startsWith('a:') ? HEROES[id].attr === f.slice(2) : heroTier(id) === Number(f.slice(1)));
  const key = { pw: (id) => heroPower(p, id), tier: (id) => heroTier(id) * 1e7 + heroPower(p, id), lv: (id) => ((p.heroes || {})[id] | 0) * 1e7 + heroPower(p, id) }[so];
  const list = owned().filter(pass).sort((a, b) => key(b) - key(a));
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const id = dl[i];
    if (i >= max) { slots.push(`<span class="pp-slot lock">${ic('lock', '')}</span>`); continue; }
    slots.push(id ? `<span class="ed-s" data-dslot="${i}">${deckCard(id, i === 0, 'edSlot')}${i ? `<button class="ed-lead" data-act="edLead" data-id="${id}" aria-label="대장으로">${pimg(ui2('crown'))}</button>` : ''}</span>` : `<button class="pp-slot empty ${app.edHole ? 'sel' : ''}" data-act="edHole"><i>+</i></button>`);
  }
  const chips = [['all', '전체'], ...(rec.size ? [['rec', '추천']] : []), ...Object.keys(ATTRS).map((a) => ['a:' + a, attrIco(a)]), ['t1', 'T1'], ['t2', 'T2'], ['t3', 'T3'], ['t4', 'T4'], ['t5', 'LG']];
  popup(`<div class="ed-head"><div class="ed-top"><h3>덱 편집</h3><div class="pp-pre">${[0, 1, 2].map((k) => `<button class="${k === app.deckI ? 'on' : ''}" data-act="edPreset" data-k="${k}">${k + 1}</button>`).join('')}</div><button class="pp-auto" data-act="edAuto">${ic('sparkle', '', 'sm')}자동 편성</button></div>
    <div class="pp-slots g6 ed">${slots.join('')}</div>
    <p class="ed-hint">${lead ? `대장 <b>${esc(HEROES[lead].name)}</b> · 끌어서 순서 바꾸기 · 1번 칸에 놓으면 대장` : '아래에서 멤버를 골라요 · 끌어다 놓아도 돼요'}</p>
    <div class="pp-sf">${chips.map(([k, t]) => `<button class="${k === f ? 'on' : ''}" data-act="edF" data-f="${k}">${t}</button>`).join('')}<span class="ed-sort">${[['pw', '전투력'], ['tier', '등급'], ['lv', '레벨']].map(([k, t]) => `<button class="${k === so ? 'on' : ''}" data-act="edSort" data-v="${k}">${t}</button>`).join('')}</span></div></div>
    <div class="pp-sg">${list.map((id) => artCard(id, { act: 'edPick', on: dl.includes(id), cls: 'mini2', extra: `${rec.has(id) ? '<i class="pp-rec">추천</i>' : ''}` })).join('') || '<p class="ip">조건에 맞는 멤버가 없어요</p>'}</div>
    <div class="ed-done"><button class="btn primary" data-x>완료</button></div>`, 'pp-sheet pp-editor');
}
// 끌기: 0.15초 누르고 있거나 가로로 8px 움직이면 시작 · 유령 카드가 손가락을 따라감 · 칸 위에 놓으면 넣기/바꾸기 · 밖에 놓으면 빼기
const DRAG = { on: false };
function dragSetup() {
  const sel = '.dk-slots [data-dslot] .acard, .pp-slots.ed [data-dslot] .acard, .agrid .acard[data-id], .pp-sg .acard[data-id]';
  stage.addEventListener('pointerdown', (ev) => {
    const card = ev.target.closest(sel); if (!card || !(app.screen === 'deck' || stage.querySelector('.pp-editor'))) return;
    const id = card.dataset.id; if (!id || !API.heroUnlocked(P(), id)) return;
    const slotEl = card.closest('[data-dslot]');
    const st = { x0: ev.clientX, y0: ev.clientY, t0: performance.now(), id, from: slotEl ? Number(slotEl.dataset.dslot) : -1, card, pid: ev.pointerId, started: false };
    DRAG.cand = st;
    DRAG.holdT = setTimeout(() => { if (DRAG.cand === st) st.armed = true; }, 150); // 0.15초 누르면 준비 → 움직이면 시작 (가만히 오래 누르면 자세히 보기)
  }, { passive: true });
  window.addEventListener('pointermove', (ev) => {
    const st = DRAG.cand; if (!st || ev.pointerId !== st.pid) return;
    if (!st.started) { const dx = ev.clientX - st.x0, dy = ev.clientY - st.y0; if (st.armed && Math.hypot(dx, dy) > 6) dragStart(st, ev.clientX, ev.clientY); else if (!st.armed && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { clearTimeout(DRAG.holdT); DRAG.cand = null; return; } else if (Math.abs(dx) > 8) dragStart(st, ev.clientX, ev.clientY); else return; }
    dragMove(st, ev.clientX, ev.clientY);
    if (ev.cancelable) ev.preventDefault();
  }, { passive: false });
  const end = (ev) => { const st = DRAG.cand; if (!st || ev.pointerId !== st.pid) return; clearTimeout(DRAG.holdT); DRAG.cand = null; if (st.started) dragEnd(st, ev.clientX, ev.clientY); };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
}
function dragStart(st, x, y) {
  st.started = true; DRAG.on = true; clearTimeout(lpT);
  ui.dataset.noclick = '1';
  const r = st.card.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const gh = st.card.cloneNode(true); gh.classList.add('drag-ghost'); gh.style.width = r.width + 'px'; gh.style.height = r.height + 'px';
  st.ox = x - r.left; st.oy = y - r.top; st.sr = sr; st.ghost = gh;
  stage.appendChild(gh);
  st.card.classList.add('drag-src');
  document.body.classList.add('dragging');
  vibrate(10); A.sfx.tap();
  dragMove(st, x, y);
}
function dragSlotAt(x, y) {
  const els = [...stage.querySelectorAll('.dk-slots [data-dslot], .pp-slots.ed [data-dslot]')];
  return els.find((e) => { const r = e.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; }) || null;
}
function dragMove(st, x, y) {
  if (!st.ghost) return;
  st.ghost.style.transform = `translate(${x - st.sr.left - st.ox}px, ${y - st.sr.top - st.oy}px) scale(1.06) rotate(${Math.max(-6, Math.min(6, (x - st.x0) * 0.04))}deg)`;
  const hit = dragSlotAt(x, y);
  for (const e of stage.querySelectorAll('.drop-hi')) if (e !== hit) e.classList.remove('drop-hi');
  if (hit) hit.classList.add('drop-hi');
  // 목록 가장자리에서 저절로 내리기
  const sc = st.card.closest('.pop-box, #ui > .screen');
  if (sc) { const r = sc.getBoundingClientRect(); if (y > r.bottom - 50) sc.scrollTop += 12; else if (y < r.top + 50) sc.scrollTop -= 12; }
}
function dragEnd(st, x, y) {
  DRAG.on = false;
  document.body.classList.remove('dragging');
  setTimeout(() => { delete ui.dataset.noclick; }, 60);
  if (st.ghost) st.ghost.remove();
  st.card.classList.remove('drag-src');
  for (const e of stage.querySelectorAll('.drop-hi')) e.classList.remove('drop-hi');
  const hit = dragSlotAt(x, y);
  const list = deckList(), max = deckSlotsNow();
  const arr = Array.from({ length: max }, (_, i) => list[i] || null);
  if (hit) {
    const k = Number(hit.dataset.dslot);
    if (k >= max) return;
    if (st.from >= 0) { [arr[st.from], arr[k]] = [arr[k], arr[st.from]]; } // 칸끼리 바꾸기
    else { const at = arr.indexOf(st.id); if (at >= 0) { [arr[at], arr[k]] = [arr[k], arr[at]]; } else arr[k] = st.id; } // 목록 → 칸 (있던 멤버는 빠짐 · 이미 있으면 자리 바꾸기)
    const ord = arr.filter(Boolean);
    const lead = arr[0] || ord[0];
    setDeckOrder(lead ? [lead, ...ord.filter((x2) => x2 !== lead)] : ord);
    A.sfx.card(); if (k === 0 && lead) toast(`${HEROES[lead].name} 대장!`, 900);
  } else if (st.from >= 0) { // 칸 밖으로: 빼기
    setDeckOrder(arr.filter((x2) => x2 && x2 !== st.id));
    A.sfx.back();
  } else return;
  if (stage.querySelector('.pp-editor')) showDeckEditor(); else if (app.screen === 'deck') showDeckTab();
}
dragSetup();
function edApply(ids, lead) {
  const l = lead || ids[0];
  setDeckOrder(l ? [l, ...ids.filter((x) => x !== l)] : ids);
  showDeckEditor();
}
function edPick(id) {
  if (!API.heroUnlocked(P(), id)) return;
  const ids = deckList();
  if (ids.includes(id)) { edApply(ids.filter((x) => x !== id), id === ids[0] ? ids.find((x) => x !== id) : null); A.sfx.tap(); return; }
  if (ids.length >= deckSlotsNow()) { toast('덱이 꽉 찼어요 — 위에서 뺄 멤버를 눌러요', 1400); A.sfx.tap(); return; }
  const lead = !ids.length || app.edLeadNext ? id : null;
  app.edLeadNext = false; app.edHole = false;
  app.deckPop = id; A.sfx.card();
  edApply([...ids, id], lead);
}
function edSlot(id) {
  const ids = deckList();
  const wasLead = id === ids[0];
  app.edLeadNext = wasLead; app.edHole = true; // 빈 자리를 채우는 멤버가 대장을 이어받는다
  A.sfx.tap();
  edApply(ids.filter((x) => x !== id), wasLead ? null : null);
}
function deckTapSlot(i) {
  if (lockedPos().includes(i)) { const it = ITEMS[deckSlotsNow() < 5 ? 'slot5' : 'slot6']; toast(`상점에서 열 수 있어요 — ${it.name} ${fmt(it.costs[0])}코인`, 2000); return; }
  const d = curDeck();
  if (app.deckSel === -1) { app.deckSel = i; if (d[i]) app.deckFocus = d[i]; }
  else if (app.deckSel === i) { if (d[i]) { d[i] = null; toast('덱에서 뺐어요', 900); } app.deckSel = -1; }
  else { const a = app.deckSel; [d[a], d[i]] = [d[i], d[a]]; app.deckSel = -1; }
  saveDecks();
  A.sfx.card();
  showPrep(app.mode, app.stage);
}
function deckPickHero(id) {
  const p = P();
  if (!API.heroUnlocked(p, id)) { toast(unlockText(id) || '아직 합류하지 않았어요'); return; }
  const d = curDeck();
  app.deckFocus = id;
  const at = d.indexOf(id);
  if (at >= 0) { if (app.deckSel >= 0 && app.deckSel !== at) { [d[at], d[app.deckSel]] = [d[app.deckSel], d[at]]; app.deckSel = -1; } else d[at] = null; }
  else {
    const cnt = d.filter(Boolean).length;
    let i = app.deckSel >= 0 ? app.deckSel : posOrder().find((k) => !d[k]);
    if (i === undefined) { toast('자리가 꽉 찼어요 — 뺄 자리를 먼저 누르세요', 1400); return; }
    if (!d[i] && cnt >= deckSlotsNow()) { toast(`덱은 ${deckSlotsNow()}명까지! 상점에서 칸을 늘릴 수 있어요`, 1600); return; }
    d[i] = id;
    app.deckSel = -1;
  }
  saveDecks();
  A.sfx.card();
  showPrep(app.mode, app.stage);
}

// ─── 레벨업 카드 (고르고 → 선택 버튼, 뜬 직후 0.7초는 눌러도 무시) ─────
// 카드 대기 배지 (웨이브 중 레벨업: 원할 때 누르면 열림 · 웨이브가 끝나면 저절로)
const cardQBtn = document.createElement('button');
cardQBtn.id = 'cardq'; cardQBtn.hidden = true;
stage.appendChild(cardQBtn);
cardQBtn.addEventListener('click', () => { A.unlock(); if (app.g && app.g.pendingLevels > 0 && !app.cardsOpen) { app.cardQ = false; openCards(); } });
function updateCardQ() {
  const g = app.g;
  const n = g && app.screen === 'play' && !g.over && !app.cardsOpen ? g.pendingLevels | 0 : 0;
  if (!n) { if (!cardQBtn.hidden) cardQBtn.hidden = true; return; }
  const t = `${ic('card_common', '', 'sm')}카드 ${n}장 대기 <small>눌러서 고르기</small>`;
  if (cardQBtn.innerHTML !== t) cardQBtn.innerHTML = t;
  cardQBtn.hidden = false;
}
setInterval(updateCardQ, 200);
// 자동 선택(설정): 추천 카드를 바로 (1:1 대전은 꺼짐)
function autoPickAll(g) {
  let n = 0;
  while (g.pendingLevels > 0 && n < 6) { const cs = rollFor(g); const c = cs[recIndex(g, cs)]; S.applyCard(g, c); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; n++; toast(`자동 선택: ${c.title}`, 1400); }
  handleEvents(g, true);
}
// 추천: 지금 덱에 맞는 카드 (히든 · 진화 · 새 멤버 · 레벨업 · 덱 속성/특성 순)
function recIndex(g, cards) {
  let best = 0, bv = -1;
  cards.forEach((c, i) => {
    let v = 1;
    if (c.rarity === 'hidden' || c.kind === 'evo') v = 10;
    else if (c.kind === 'skillEvo') v = 8;
    else if (c.kind === 'addHero') v = g.heroes.length < 4 ? 8 : 5;
    else if (c.kind === 'heroLv') v = 6;
    else if (cardAttr(c) && g.heroes.filter((h) => h.def.attr === cardAttr(c)).length >= 2) v = 7;
    else if (c.tag && g.heroes.some((h) => (HERO_TAGS[h.id] || []).includes(c.tag))) v = 6;
    if (c.risk) v -= 3;
    if (v > bv) { bv = v; best = i; }
  });
  return best;
}
function openCards() {
  const g = app.g;
  if (!g || app.screen !== 'play' || g.over || g.phase === 'victory') return; // 판이 끝났으면 (결과 화면 뒤로 카드가 비치지 않게) 안 연다
  app.cardsOpen = true;
  cardQBtn.hidden = true;
  app.cardsAt = performance.now();
  if (app.rerollsRun === undefined || app.rerollsG !== g) { app.rerollsRun = REROLLS; app.rerollsG = g; }
  app.cards = rollFor(g);
  renderCards(true);
  if (DEBUG.autopick) setTimeout(() => { if (app.cardsOpen) pickCard(0); }, 120);
}
function rerollCoupon() { const g = app.g; if (!g || !app.cardsOpen || !g.cons || !g.cons.includes('reroll') || (g.consUsed || {}).reroll) return; (g.consUsed = g.consUsed || {}).reroll = true; app.cards = rollFor(g); app.cardSel = -1; app.cardLockUntil = performance.now() + 400; renderCards(true); A.sfx.card(); toast('증강 새로고침 쿠폰 사용!', 1200); renderConsBar(true); }
function rollFor(g) {
  return DEBUG.hidden ? S.rollCards(g, RULES.cardChoices, { hiddenChance: 0.5 }) : S.rollCards(g);
}
// 활성 시너지: 같은 속성 인원 · 고른 특성 카드 · 진화
function synTrayHtml(g, big) {
  const out = [];
  for (const a of Object.keys(ATTRS)) {
    const n = g.attrCount[a] || 0;
    if (!n) continue;
    const on = n >= 2;
    out.push(`<span class="sy ${on ? 'on' : ''}" title="${ATTRS[a].name}">${attrIco(a)}${n}${on ? `<small>+${Math.round(ATTR_SET[Math.min(ATTR_SET.length - 1, n)] * 100)}%</small>` : ''}</span>`);
  }
  for (const t of Object.keys(TAGS)) { const k = (g.tagCnt || {})[t] || 0; if (k) out.push(`<span class="sy tag ${k >= 3 ? 'on' : ''}" title="${TAGS[t].name}">${TAGS[t].icon}${k}<small>/${k >= 5 ? '★' : k >= 3 ? 5 : 3}</small></span>`); }
  const evo = g.heroes.filter((h) => h.evo).length;
  if (evo) out.push(`<span class="sy evo on">${ic('sparkle', '', 'sm')}${evo}</span>`);
  if (!big && out.length > 8 && !app.synOpen) { const more = out.length - 7; out.length = 7; out.push(`<span class="sy more" data-act="synMore">+${more}</span>`); }
  return out.length ? `<div class="syn-tray ${big ? 'big' : ''} ${out.length > 4 ? 'grid' : ''}">${out.join('')}</div>` : '';
}
// 속성 카드(말빨·힘·매력·술 +%)가 어느 속성인지 · 지금 판에서 그 속성인 멤버 이름
const cardAttr = (c) => (c && (c.attr || (/^syn_(talk|power|charm|booze)$/.test(c.id || '') ? c.id.slice(4) : ''))) || '';
const attrChip = (a) => (ATTRS[a] ? `<span class="attr mini" style="--ac:${ATTRS[a].color}">${attrIco(a)}${ATTRS[a].name}</span>` : '');
function attrWho(g, a) { const hs = g ? g.heroes.map((h) => h.def) : (curDeck() || []).filter(Boolean).map((id) => HEROES[id]); return hs.filter((d) => d && d.attr === a).map((d) => d.name).join('·'); }
// 레벨업 카드 (프리미엄): 그린 아이콘/멤버 얼굴 · 리본 제목 · 효과 한 줄 + 큰 숫자 · 길 칩 — 이모지 없음
const PATH_IC = { pierce: 'path_pierce', splash: 'path_boom', chain: 'path_chain', kb: 'path_knock', heal: 'path_heal', ctrl: 'path_cc', boss: 'path_crit' };
const CC_IC = { stun: 'cc_stun', slow: 'cc_slow', freeze: 'cc_freeze', kb: 'cc_push', pull: 'cc_pull' };
const ui2 = (n) => `/img/lb/ui2/${n}.webp`;
const pimg = (src, cls = '') => `<img class="${cls}" src="${src}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;
// 글로벌 카드 아이콘: 이모지 → ui2 그림 (없으면 설명 낱말로 · 그래도 없으면 카드 그림)
const KW_IC = [[/쿨타임/, 'speed'], [/공격 속도/, 'bolt'], [/치명/, 'path_crit'], [/경험치/, 'book'], [/보스/, 'target'], [/카드/, 'aug_card'], [/내구도|방어선|피해 -/, 'shield'], [/회복|수리/, 'heal'], [/상태이상|홀림/, 'shield'], [/궁극기|스킬/, 'megaphone'], [/공격력|피해/, 'swords'], [/속도/, 'bolt']];
function iconName(emoji, text) {
  if (emoji && IC_MAP[emoji]) return IC_MAP[emoji];
  for (const [re, n] of KW_IC) if (re.test(text || '')) return n;
  return 'aug_card';
}
function cardIcon(c) {
  const tg = (c.tags || [])[0] || c.tag;
  if (c.kind === 'cc' && CC_IC[c.cc]) return pimg(ui2(CC_IC[c.cc]));
  if (c.hero && HEROES[c.hero]) return `<span class="face fzw"><img class="fz" data-face="${c.hero}" data-fc="1" style="${faceCircStyle(c.hero)}" src="${thumbSrc(c.hero) || HEROES[c.hero].img}" alt="" draggable="false"></span>` + (c.kind === 'skillEvo' || c.kind === 'evo' ? pimg(ui2('star_gold'), 'sub') : '');
  if (cardAttr(c)) return pimg(`/img/lb/attr/${cardAttr(c)}.webp`);
  if (tg && PATH_IC[tg]) return pimg(ui2(PATH_IC[tg]));
  return pimg(ui2(iconName(c.icon, c.desc)));
}
const NUM_END = /^(.*?)\s*([+\-−×]\s?\d+(?:\.\d+)?\s?(?:%p|%|초|배|명|칸|번|발)?)\s*$/;
function cardEffect(c) {
  const main = (c.desc || '').replace(/^★\s*/, '').split(/ · /)[0].trim();
  if (c.kind === 'addHero') return { label: '새 멤버 합류', big: '' };
  if (c.kind === 'heroLv') { const m = /Lv\.\d+→(\d+)/.exec(c.title); return { label: main, big: m ? `Lv.${m[1]}` : '' }; }
  if (c.kind === 'cc') { const m = /(\d+%)/.exec(main); return { label: `맞히면 ${CC_KINDS[c.cc] ? CC_KINDS[c.cc].name : ''}`, big: m ? m[1] : '' }; }
  const m = NUM_END.exec(main);
  if (m && m[1]) return { label: m[1], big: m[2].replace(/\s/g, '') };
  return { label: main, big: '', hl: true };
}
function cardTitle(c) {
  let t = c.title || '';
  if (c.kind === 'heroLv') t = t.replace(/\s*Lv\.\d+→\d+/, '');
  if (t.includes(' · ')) t = t.split(' · ').pop();
  if (c.kind === 'cc' && t.includes(': ')) t = t.split(': ').pop();
  return t;
}
function cardChip(c) {
  const g0 = app.g, tg = (c.tags || [])[0];
  if (tg && TAGS[tg]) { const cnt = g0 ? ((g0.tagCnt || {})[tg] || 0) : 0; return `<span class="c4-chip ${cnt + 1 >= 3 ? 'set' : ''}">${pimg(ui2(PATH_IC[tg]))}${TAGS[tg].name} <b>${cnt}→${cnt + 1}</b></span>`; }
  if (c.kind === 'cc' && CC_KINDS[c.cc]) return `<span class="c4-chip" style="--cc:${CC_KINDS[c.cc].color}">${pimg(ui2(CC_IC[c.cc]))}${c.hero ? esc(HEROES[c.hero].name) : CC_KINDS[c.cc].name}</span>`;
  if (cardAttr(c)) { const a = cardAttr(c), n = g0 ? g0.heroes.filter((h) => h.def.attr === a).length : 0; return `<span class="c4-chip">${pimg(`/img/lb/attr/${a}.webp`)}${ATTRS[a].name} <b>${n}명</b></span>`; }
  if (c.hero && HEROES[c.hero]) { const a = HEROES[c.hero].attr; return `<span class="c4-chip">${pimg(`/img/lb/attr/${a}.webp`)}${esc(HEROES[c.hero].name)}</span>`; }
  if (c.risk) return '<span class="c4-chip risk">위험 부담</span>';
  if (c.kind === 'global' && c.stack) return `<span class="c4-chip">단계 <b>${c.stack}→${c.stack + 1}</b></span>`;
  return '';
}
function cardRar(c) {
  if (c.tier === 'prism') return 'prism';
  if (c.tier === 'gold' || c.rarity === 'hidden' || c.rarity === 'legend') return c.tier === 'gold' ? 'epic' : 'legend';
  if (c.kind === 'cc') return 'rare';
  if (c.rarity === 'rare' && (c.kind === 'heroLv' || c.kind === 'addHero')) return 'epic';
  return c.rarity === 'epic' ? 'epic' : c.rarity === 'rare' ? 'rare' : 'common';
}
const KIND_TXT = { burst: '연달아 던진다', rapid: '쉴 새 없이 날린다', pierce: '한 줄을 꿰뚫는다', chain: '옆으로 튕겨 번진다', lob: '던져서 터뜨린다', heavy: '묵직하게 내리친다', melee: '가까이서 휘두른다', beam: '일직선으로 쏜다', homing: '끝까지 쫓아간다', aura: '주변을 한꺼번에', gauge: '게이지가 차면 막차 버스!' };
// 이 카드의 주인 멤버: 멤버 카드는 그 멤버 · 길/속성 카드는 그 길·속성을 가장 많이 키운 멤버 · 나머지는 대장
function cardOwner(c) {
  const g = app.g;
  if (c.hero && (HEROES[c.hero] || SUMMONS[c.hero])) return c.hero;
  if (!g || !g.heroes.length) return null;
  const hs = g.heroes.filter((h) => HEROES[h.id]);
  const tg = (c.tags || [])[0] || c.tag, a = cardAttr(c);
  const by = (f) => hs.filter(f).sort((x, y) => (y.picks || 0) - (x.picks || 0) || y.lv - x.lv)[0];
  const h = (tg && by((x) => (HERO_TAGS[x.id] || []).includes(tg))) || (a && by((x) => x.def.attr === a)) || hs.find((x) => x.id === g.leader) || by(() => true);
  return h ? h.id : null;
}
function cardRound(c) {
  const tg = (c.tags || [])[0] || c.tag;
  if (c.kind === 'cc' && CC_IC[c.cc]) return ui2(CC_IC[c.cc]);
  if (c.kind === 'join' && PROJ_ART[c.hero]) return `/img/lb/fx/w_${PROJ_ART[c.hero]}.webp`;
  if (c.kind === 'heroLv' || c.kind === 'evo') return ui2('star_gold');
  if (c.kind === 'skillEvo') return ui2('sparkle');
  if (c.kind === 'skillAug' && c.hero) return ui2('sk_' + c.hero); // 멤버 전용 스킬 증강: 그 멤버 스킬 그림
  if (cardAttr(c)) return `/img/lb/attr/${cardAttr(c)}.webp`;
  if (tg && PATH_IC[tg]) return ui2(PATH_IC[tg]);
  if (c.hero && HEROES[c.hero]) return `/img/lb/attr/${HEROES[c.hero].attr}.webp`;
  return ui2(iconName(c.icon, c.desc));
}
function cardHtml(c, i) {
  if (c.kind === 'join' || (app.g && app.g.tempo)) return cardHtml5(c, i);
  return cardHtml4(c, i);
}
function cardHtml5(c, i) {
  const isNew = (c.kind === 'global' && !c.stack) || c.kind === 'addHero' || c.kind === 'evo' || c.kind === 'join';
  const rec = app.cards && app.g && i === recIndex(app.g, app.cards);
  const own = cardOwner(c);
  const ef = cardEffect(c), t = c.kind === 'join' ? HEROES[c.hero].name : cardTitle(c);
  const W = c.kind === 'join' && WEAPON[c.hero];
  const lab = c.kind === 'join' ? `${esc(W ? W.item : '')} — ${esc(W ? KIND_TXT[W.kind] || '' : HEROES[c.hero].role || '')}` : ef.hl || !ef.big ? esc(ef.label).replace(/([+\-−×]?\d+(?:\.\d+)?\s?(?:%p|%|초|배|명|칸|번|발)?)/g, '<em>$1</em>') : `${esc(ef.label)} <em>${esc(ef.big)}</em>`;
  // 멤버 카드만 그 멤버 그림 (얼굴 맞춤) · 일반 증강은 그 카드 그림을 크게
  const heroCard = !!(c.hero && (HEROES[c.hero] || SUMMONS[c.hero]));
  const fb = heroCard ? (DEX_FACE[c.hero] || [0.48, 0.09, 0.14]) : null;
  const art = heroCard ? `<img class="c5-face" data-face="${c.hero}" src="${thumbSrc(c.hero) || (HEROES[c.hero] || SUMMONS[c.hero]).img}" alt="" draggable="false" style="--k:${(1 / fb[2]).toFixed(3)};--fx:-${(fb[0] * 100).toFixed(1)}%;--fy:-${(fb[1] * 100).toFixed(1)}%;--fyv:${(fb[1] / fb[2]).toFixed(3)}">` : `<img class="c5-gen" src="${cardRound(c)}" alt="" draggable="false">`; void own;
  return `<button class="card v4 v5 r-${cardRar(c)} k-${c.kind} ${c.onPath ? 'onpath' : ''} ${c.risk ? 'risk' : ''} ${rec ? 'rec' : ''}" data-act="pick" data-i="${i}" style="--i:${i}">
    <span class="c5-art">${art}</span>
    ${isNew ? `<i class="c5-new">${c.kind === 'join' ? 'NEW · 합류' : 'NEW'}</i>` : ''}${c.kind === 'skillAug' ? '<i class="c5-excl">전용</i>' : ''}${rec ? `<i class="c5-rec">${pimg(ui2('badge_rec'))}</i>` : ''}
    <i class="c5-ico">${pimg(cardRound(c))}</i>
    <span class="c4-rib"><b class="${t.length > 7 ? 'long' : ''}">${esc(t)}</b></span>
    <span class="c5-desc">${lab}</span>
    ${c.kind === 'join' ? `<span class="c4-chip">${pimg(`/img/lb/attr/${HEROES[c.hero].attr}.webp`)}${ATTRS[HEROES[c.hero].attr].name}</span>` : cardChip(c)}
    <i class="c5-shine"></i>
  </button>`;
}
function cardHtml4(c, i) {
  const isNew = (c.kind === 'global' && !c.stack) || c.kind === 'addHero' || c.kind === 'evo';
  const rec = app.cards && app.g && i === recIndex(app.g, app.cards);
  const ef = cardEffect(c), t = cardTitle(c);
  const lab = ef.hl ? esc(ef.label).replace(/([+\-−×]?\d+(?:\.\d+)?\s?(?:%p|%|초|배|명|칸|번|발)?)/g, '<em>$1</em>') : esc(ef.label);
  return `<button class="card v4 r-${cardRar(c)} k-${c.kind} ${c.onPath ? 'onpath' : ''} ${c.risk ? 'risk' : ''}" data-act="pick" data-i="${i}" style="--i:${i}">
    ${isNew ? `<i class="c4-bdg new">${pimg(ui2('badge_new'))}<b>NEW</b></i>` : ''}${rec ? `<i class="c4-bdg rec">${pimg(ui2('badge_rec'))}</i>` : ''}
    <span class="c4-ico">${cardIcon(c)}</span>
    <span class="c4-rib"><b class="${t.length > 7 ? 'long' : ''}">${esc(t)}</b></span>
    <span class="c4-eff"><small class="${ef.big ? '' : 'solo'}">${lab}</small>${ef.big ? `<strong>${esc(ef.big)}</strong>` : ''}</span>
    ${cardChip(c)}
  </button>`;
}
// 레벨업 카드 띠: 게임은 계속 흘러간다 — 한 번 누르면 바로 선택 (뜬 뒤 0.4초는 무시)
// 12초 안에 안 고르면 맨 왼쪽(추천) 카드를 자동으로 고른다 (8초부터 테두리가 깜빡이며 알림)
const cardStrip = document.createElement('div');
cardStrip.id = 'cardstrip'; cardStrip.hidden = true;
stage.appendChild(cardStrip);
let cardPress = null;
cardStrip.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('[data-act="pick"]');
  if (!b) return;
  clearTimeout(cardPress && cardPress.t);
  cardPress = { i: Number(b.dataset.i), long: false, t: setTimeout(() => { cardPress.long = true; const c = app.cards && app.cards[cardPress.i]; if (c) toast(`${c.title} — ${c.desc}`, 3600); }, 450) };
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cardStrip.addEventListener(t, () => { if (cardPress) clearTimeout(cardPress.t); });
cardStrip.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (cardPress && cardPress.long) { cardPress = null; return; } // 길게 누른 건 고르기 아님
  A.unlock();
  if (b.dataset.act === 'pick') tapCard(Number(b.dataset.i));
  else if (b.dataset.act === 'reroll') rerollCards();
  else if (b.dataset.act === 'rerollCoupon') rerollCoupon();
});
function renderCards(fresh) {
  const g = app.g;
  if (fresh) { app.cardSel = -1; app.cardLockUntil = performance.now() + 400; app.cardsAt = performance.now(); app.cardAutoT = app.cardAutoMax = g.pvp ? 12 : 15; }
  const welcome = g.welcomePicks > 0;
  const n = app.cards.length;
  cardStrip.hidden = false;
  cardStrip.className = 'v4' + (fresh ? ' fresh' : '');
  cardStrip.innerHTML = `<div class="cs-panel">
    <div class="cs-head">${pimg(ui2(welcome ? 'welcome' : 'crest'), 'crest')}<b>${welcome ? '웰컴 드링크' : 'LEVEL UP'}</b>${welcome ? '' : `<span class="cs-lv">Lv.${g.level}</span>`}${g.pendingLevels > 1 ? `<small>남은 선택 <b>${g.pendingLevels}</b></small>` : ''}
      <button class="cs-re" data-act="reroll" ${app.rerollsRun > 0 ? '' : 'disabled'} aria-label="다시 뽑기">${pimg(ui2('dice'))}<b>${app.rerollsRun}</b></button></div>
    <i class="cs-timer"><b></b></i>
    <div class="card-list v4 n${n} ${g.tempo || app.cards.some((c) => c.kind === 'join') ? 'v5' : ''}">${app.cards.map(cardHtml).join('')}</div>
    <div class="cs-foot"><small>이번 전투 다시 뽑기 <b>${app.rerollsRun}/${REROLLS}</b></small><button class="cs-re2" data-act="reroll" ${app.rerollsRun > 0 ? '' : 'disabled'}>${pimg(ui2('dice'))}다시 뽑기</button>${app.g && app.g.cons && app.g.cons.includes('reroll') && !(app.g.consUsed || {}).reroll ? `<button class="cs-re2 coupon" data-act="rerollCoupon">${consIc('reroll')}쿠폰</button>` : ''}</div>
  </div>`;
  if (fresh) A.sfx.card();
  if (fresh && app.cards.some((c) => c.rarity === 'hidden')) { fx.flash('#ff9ff0', 0.3); A.sfx.join(); }
}
// 카드 자동 선택 시계: 실제 시간으로 · 일시정지/확인창/증강 선택 중엔 멈춘다
function tickCards(dt) {
  const g = app.g;
  if (!g || !app.cardsOpen || !app.cards) return;
  const behind = !!g.augOffer;
  if (cardStrip.classList.contains('behind') !== behind) cardStrip.classList.toggle('behind', behind);
  if (app.paused || app.confirmOpen || behind) return;
  app.cardAutoT -= dt;
  const bar = cardStrip.querySelector('.cs-timer b');
  if (bar) bar.style.transform = `scaleX(${Math.max(0, app.cardAutoT / (app.cardAutoMax || 15)).toFixed(3)})`;
  cardStrip.classList.toggle('nag', app.cardAutoT < 4);
  if (app.cardAutoT <= 0) pickCard(recIndex(g, app.cards));
}
function tapCard(i) {
  if (!app.cardsOpen || !app.cards || !app.cards[i]) return;
  if (performance.now() < app.cardLockUntil) return; // 막 떴을 때 잘못 누른 것
  pickCard(i);
}
function rerollCards() {
  if (app.rerollsRun <= 0 || !app.cardsOpen) return;
  app.rerollsRun--;
  app.cards = rollFor(app.g);
  app.cardSel = -1;
  app.cardLockUntil = performance.now() + 400;
  renderCards(false);
  A.sfx.card();
}
function pickCard(i) {
  const g = app.g;
  if (!app.cardsOpen || !app.cards || !app.cards[i]) return;
  const c = app.cards[i];
  S.applyCard(g, c);
  if (g.pvp) (PVP.myCards = PVP.myCards || []).push(c.title);
  if (c.kind === 'addHero' && (c.rarity === 'hidden' || HEROES[c.hero].legend)) showReveal(c.hero, HEROES[c.hero].legend ? 'legend' : 'hidden');
  g.pendingLevels = Math.max(0, g.pendingLevels - 1);
  if (g.welcomePicks > 0) g.welcomePicks--;
  A.sfx.pick();
  handleEvents(g, true);
  if (c.kind === 'global') fx.text(180, g.rowY - 90, c.title + '!', RARITY[c.rarity].color, 18, 1.2, -20);
  if (cardAttr(c)) { const a = cardAttr(c); for (const h of g.heroes) if (h.def.attr === a) { fx.ring(h.x, h.y - 30, 10, 46, 0.9, ATTRS[a].color, 5); fx.text(h.x, h.y - 78, ATTRS[a].icon, ATTRS[a].color, 20, 1.1, -26); } }
  if (c.id === 'tag_splash' || (c.kind === 'heroMod' && /범위|반경/.test(c.desc))) for (const h of g.heroes) if (c.kind === 'global' ? (HERO_TAGS[h.id] || []).includes('splash') : h.id === c.hero) { fx.text(h.x, h.y - 70, '+범위!', '#ffd23f', 15, 1.2, -24); fx.blast(h.x, g.ropeY - 120, (h.def.splash || h.def.slamR && h.def.slamR[h.lv - 1] || 60) * g.mods.splashMul * (h.cm.splash || 1), 'gold', 1.2); }
  if (g.pendingLevels > 0) {
    app.cards = rollFor(g);
    renderCards(true);
    if (DEBUG.autopick) setTimeout(() => { if (app.cardsOpen) pickCard(0); }, 120);
  } else closeCards();
}
function closeCards() {
  app.cardsOpen = false;
  app.cards = null;
  app.cardSel = -1;
  cardStrip.hidden = true; cardStrip.innerHTML = ''; cardStrip.className = '';
}

// ─── 일시정지 ────────────────────────────────────────
function pauseGame() {
  if (!app.g || app.g.over || app.ending) return;
  app.paused = true;
  cancelAim(); hideBubble();
  const g = app.g;
  const w = Math.max(1, g.lastSnap ? g.lastSnap.wave : g.wave);
  show(`
 <div class="topbar"><button class="back" data-act="toLobby">‹ 메인 메뉴</button><div class="tb-right"><button class="share-btn" data-act="share">${ic('share', '', 'sm')} 공유하기</button><button class="icon-btn" data-act="mute">${A.isMuted() ? '' : ''}</button></div></div>
    <div class="pause-box">
      <h2>일시정지</h2>
      <p class="sub">${g.tower ? `진상의 탑 ${g.tower.f}F · 웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}` : g.mode === 'stage' ? `스테이지 ${stageLabel(g.stage)} · 웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}` : `무한 도전 · 웨이브 ${Math.max(1, g.wave)}`}</p>
 <button class="btn primary" data-act="resume">계속하기</button>
 <button class="btn" data-act="toLobby">${ic('home', '', 'sm')} 메인 메뉴로 <small>이어하기 저장 · 웨이브 ${w} 처음부터 이어서</small></button>
      ${g.pvp || g.weekly || g.raid || g.tower ? '' : '<button class="btn" data-act="restart">다시 하기 <small>이 스테이지 처음부터</small></button>'}
      <button class="btn" data-act="howto">게임 방법</button>
      <button class="btn ghost" data-act="quit">그만두기 <small>지금까지 기록으로 끝내요</small></button>
    </div>
  `, 'dim');
}
function resumeGame() {
  if (app.screen === 'play' && app.g) {
    app.paused = false;
    ui.innerHTML = '';
    last = performance.now();
    A.playBgm();
  }
}

// ─── 결과 ────────────────────────────────────────────
function showResult(victory, quit) {
  const g = app.g;
  if (!g) return;
  consFinish(g);
  consBar.hidden = true;
  guardOff();
  if (g.tower && TWUI) { TWUI.result(g, victory, quit); return; } // 진상의 탑: 돌파 · 보상 상자 / 추락
  app.screen = 'result';
  hud.hidden = true;
  const sum = S.summary(g, g.t);
  const mins = Math.floor(g.t / 60), secs = Math.floor(g.t % 60);
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  const totalDmg = g.heroes.reduce((a, h) => a + h.dmgDone, 0) || 1;
  const heroes = g.heroes.slice().sort((a, b) => b.dmgDone - a.dmgDone);
  const mvp = heroes.map((h, i) => `<div class="row ${i === 0 ? 'top' : ''}">${av(h.def)}<span class="nm">${h.def.name}</span>
    <div class="bar"><div style="width:${Math.round((h.dmgDone / totalDmg) * 100)}%"></div></div><span class="pc">${Math.round((h.dmgDone / totalDmg) * 100)}%</span></div>`).join('');
  const wk = !!g.weekly && !g.raid;
  const stageMode = g.mode === 'stage' && !wk && !g.pvp && !g.raid;
  const win = victory && stageMode;
  let title, sub, top;
  if (stageMode) {
    title = win ? `${g.hell ? 'HELL ' : ''}${stageLabel(g.stage)} 클리어!` : quit ? '오늘은 여기까지' : `${g.hell ? 'HELL ' : ''}${stageLabel(g.stage)} 실패…`;
    sub = win ? `입구 내구도 ${sum.hpPct}% 로 지켜냈다!` : `웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}에서 막혔어요 · ${quit ? '다음엔 끝까지!' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0]}`;
    top = win
      ? `<div class="big-stars">${[1, 2, 3].map((k) => `<span class="${k <= g.stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s">★</span>`).join('')}</div>
         <div class="star-rule">${sum.perfect ? '<b class="perfect">PERFECT! 입구가 한 번도 안 맞았다</b>' : g.stars >= 3 ? '완벽 방어! ★★★ (입구 무피해면 PERFECT)' : g.stars === 2 ? (sum.hpPct >= 70 && g.mission && !g.mission.ok ? '입구는 지켰는데 미션을 못 했어요 — ★★★ 은 미션까지!' : '★★★ 까지 입구 70% 이상 남기기') : '★★ 는 입구 35% 이상 남기면!'}</div>${missionHtml(g)}`
      : `<div class="fail-tip">${ic('bulb', '', 'sm')}${FAIL_TIPS[(Math.random() * FAIL_TIPS.length) | 0]}</div>`;
  } else if (g.raid) {
    title = '레이드 끝!';
    sub = `${Math.round(Math.min(g.t, g.raid.sec))}초 동안 보스에게 준 피해`;
    top = `<div class="score-big"><small>보스 피해</small><b>${fmt(g.raid.dmg)}</b></div>`;
  } else if (g.pvp) {
    const pr = app.pvpResult || {};
    title = pr.draw ? '무승부' : pr.win ? '승리!' : '패배';
    sub = pr.reason === 'lost' ? '연결이 끊겨 판정 결과를 받지 못했어요' : pr.reason === 'forfeit' ? '상대가 나가서 기권승' : pr.reason === 'time' ? pvpTimeSub(pr) : pr.win ? '상대 방어선이 먼저 뚫렸다!' : '방어선이 먼저 뚫렸어요';
    const b0 = pr.before || (pr.rating - (pr.delta || 0)) || 1000, t0 = pvpTier(b0), t1 = pvpTier(pr.rating || b0);
    top = `<div class="pv-res ${pr.win ? 'win' : pr.draw ? 'lose draw' : 'lose'}"><i class="pr-burst"></i><b class="pr-word">${pr.win ? 'VICTORY' : pr.draw ? 'DRAW' : 'DEFEAT'}</b>
      <div class="pr-emb">${tierEmb(b0, 'xl old')}${t0[1] !== t1[1] ? tierEmb(pr.rating, 'xl new') : ''}</div>
      ${pr.ranked ? `<div class="pr-rt"><b data-from="${b0}" data-to="${pr.rating}">${b0}</b><em class="${pr.delta >= 0 ? 'up' : 'down'}">${pr.delta >= 0 ? '▲' : '▼'}${Math.abs(pr.delta)}</em></div>` : `<div class="pr-rt"><small>${pr.draw ? '무승부 · 점수 변동 없음' : pr.bot ? '연습 상대 · 점수 변동 없음' : '친선전 · 점수 변동 없음'}</small></div>`}
      ${t0[1] !== t1[1] ? `<div class="pr-tier ${t1[0] > t0[0] ? 'up' : 'down'}">${t1[0] > t0[0] ? '등급 올라감!' : '등급 내려감'} <b>${esc(t1[1])}</b></div>` : ''}
      ${pr.win && (pr.streak | 0) >= 2 ? `<div class="pr-streak">${ic('fire', '', 'sm')}${pr.streak}연승 중</div>` : ''}</div>`;
  } else if (wk) {
    title = victory ? '주간 도전 완주!' : `주간 도전 W${sum.wave}`;
    sub = victory ? `${g.totalWaves}웨이브 전부 막았다!` : quit ? '다음엔 더 멀리!' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0];
    top = `<div class="score-big"><small>주간 점수</small><b id="wkscore">${fmt(L.weeklyScore({ waves: sum.wave, kills: sum.kills, bossKills: sum.bossKills, victory, hpPct: sum.hpPct }))}</b></div>`;
  } else {
    title = `무한 도전 W${sum.wave}`;
    sub = quit ? '다음엔 더 멀리!' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0];
    top = `<div class="score-big"><small>점수</small><b>${fmt(sum.score)}</b></div>`;
  }
  const buttons = [];
  if (win && g.hell) buttons.push('<button class="btn primary" data-act="again">헬 다시 하기</button>');
  else if (win && g.stage < STAGE_COUNT) buttons.push(`<button class="btn primary" data-act="nextStage">다음 스테이지 ${stageLabel(g.stage + 1)} </button>`);
  if (g.raid) buttons.push('<button class="btn primary" data-act="raid">레이드 현황</button>', '<div class="gap"></div><button class="btn ghost" data-act="menu">로비로</button>');
  else if (g.pvp) buttons.push('<button class="btn primary pv-again" data-act="pvpQueue">한 판 더</button>', '<div class="gap"></div><button class="btn ghost" data-act="pvp">대전 화면</button>');
  else if (wk) buttons.push('<button class="btn primary" data-act="weeklyGo">다시 도전</button>', '<div class="gap"></div><button class="btn ghost" data-act="weekly">주간 순위 보기</button>');
  else if (stageMode && !win) buttons.push('<button class="btn primary" data-act="again">다시 도전</button>', '<div class="gap"></div><div class="grid2"><button class="btn" data-act="shop"><i></i>강화하러 가기</button><button class="btn" data-act="stages"><i></i>스테이지 선택</button></div>');
  else if (stageMode) buttons.push('<div class="gap"></div><div class="grid2"><button class="btn" data-act="again"><i></i>다시 하기</button><button class="btn" data-act="stages"><i></i>스테이지 선택</button></div>');
  else if (!wk) buttons.push('<button class="btn primary" data-act="again">다시 도전</button>', '<div class="gap"></div><button class="btn ghost" data-act="menu">메뉴로</button>');
  if (!buttons.some((b) => /data-act="menu"/.test(b))) buttons.push('<div class="gap"></div><button class="btn ghost" data-act="menu">메인 메뉴로</button>');
  show(`
    <div class="big">${esc(title)}</div>
    <p class="sub" style="margin-top:6px">${esc(sub)}</p>
    ${top}
    <div class="stats">
      <div><small>${stageMode ? '웨이브' : '도달 웨이브'}</small><b>${stageMode ? `${sum.wave}/${g.totalWaves}` : sum.wave}</b></div>
      <div><small>처치</small><b>${fmt(sum.kills)}</b></div>
      <div><small>보스 처치</small><b>${sum.bossKills}</b></div>
      <div><small>최대 콤보</small><b>${g.stats.maxCombo}</b></div>
      <div><small>플레이 시간</small><b>${time}</b></div>
      <div><small>점수</small><b>${fmt(sum.score)}</b></div>
    </div>
    <div class="panel mvp">${mvp}</div>${teamHtml(g)}
    <div class="server" id="srv">${win || !stageMode ? '<span class="spin"></span> 보상 받는 중…' : ''}</div>
 <div class="spacer"></div>
 <button class="btn share-result" data-act="shareResult">${ic('share', '', 'sm')} 결과 공유하기 <small>친구에게 기록 카드 보내고 도전장 날리기</small></button>
 <div class="gap"></div>
 ${buttons.join('')}
  `, `result ${stageMode ? 'compact' : ''} ${win || (!stageMode && sum.wave >= 10) ? 'win' : 'lose'}`);
  app.shareData = {
    title, win, mode: g.mode, stageLabel: stageMode ? stageLabel(g.stage) : '', stars: win ? g.stars : 0,
    score: sum.score, wave: sum.wave, waves: g.totalWaves, kills: sum.kills, bossKills: sum.bossKills,
    time, nickname: app.guest ? '' : app.nickname, chapter: g.mode === 'stage' ? chapterOf(g.stage) : 3,
    heroes: heroes.slice(0, 6).map((h) => ({ id: h.id, img: h.def.img, thumb: HEROES[h.id] ? thumbSrc(h.id) : '', face: DEX_FACE[h.id], name: h.def.name, color: h.def.color, tier: HEROES[h.id] ? heroTier(h.id) : 1 })),
  };
  if (win || !stageMode || wk || g.raid || g.pvp) saveResult(sum, g);
  else if (stageMode && !app.debugRun) Promise.resolve(API.stageFail(g.stage, app.guest)).then((r) => { if (r && r.ok) { if (r.profile) app.profile = r.profile; if (r.refund) toast(`체력 ${r.refund} 돌려받았어요 (실패하면 절반)`, 1800); } });
}
// 결과: ★★★ 스테이지 미션 (성공 · 실패 · 센 값)
function missionHtml(g) {
  const m = g.mission;
  if (!m || g.mode !== 'stage') return '';
  const st = g.cstat || {};
  const v = m.stat === 'found' ? `${st.found | 0}/${st.hidden | 0}명` : m.stat === 'endDoor' ? `${Math.round((st.endDoor || 0) * 100)}%` : m.stat === 'ccSec' ? `${(st.ccSec || 0).toFixed(1)}초` : m.stat === 'combo' ? `${g.stats.maxCombo | 0}` : `${st[m.stat] | 0}`;
  return `<div class="rs-mis ${m.ok ? 'ok' : 'no'}">${ic(m.ok ? 'check' : 'scale', '', 'sm')}<span>★★★ 미션 · ${esc(m.text)}</span><b>${m.ok ? '성공' : '실패'} <small>${v}</small></b></div>`;
}
// 결과: 팀 기여 — 딜 말고도 입구 수리 · 막은 피해 · 버프로 늘린 피해 (서포터도 MVP)
function teamHtml(g) {
  const by = (g.stats && g.stats.teamBy) || {};
  const rows = g.heroes.filter((h) => by[h.id] && (by[h.id].repair >= 1 || by[h.id].prevent >= 1 || by[h.id].buff >= 1)).map((h) => {
    const t = by[h.id], parts = [];
    if (t.repair >= 1) parts.push(`<span class="tc r">수리 +${fmt(t.repair)}</span>`);
    if (t.prevent >= 1) parts.push(`<span class="tc p">막음 ${fmt(t.prevent)}</span>`);
    if (t.buff >= 1) parts.push(`<span class="tc b">버프 피해 +${fmt(t.buff)}</span>`);
    return { h, html: `<div class="row">${av(h.def)}<span class="nm">${h.def.name}</span><span class="tcs">${parts.join('')}</span></div>`, k: (t.repair + t.prevent) * 60 + t.buff };
  }).sort((a, b) => b.k - a.k);
  if (!rows.length) return '';
  const T = g.stats.team || {};
  return `<div class="panel team"><div class="tm-h">팀 기여 <small>입구 ${fmt(g.base.max)} 중 수리 ${fmt(T.repair || 0)} · 막은 피해 ${fmt(T.prevent || 0)}</small></div>${rows.map((r) => r.html).join('')}</div>`;
}
const LOSE_LINES = ['진상들이 랑방을 점령했다… 다음엔 꼭!', '"한 잔만 더~" 술진상이 문을 열고 들어왔다', '먹튀 인간들이 경험치를 털어 갔다…', '인피: "랑방? 이제 우리 아지트야~"', '여왕벌: "여기 이제 내 가게야~"'];
const FAIL_TIPS = [
  '강화 상점에서 동료와 방장을 강화하면 훨씬 쉬워져요',
  '튼튼한 문을 사면 입구 내구도가 늘어요',
  '독재자를 먼저 잡으세요 — 곁의 진상들이 덜 아파해요',
  '사기꾼이 "들켰다!" 할 때가 기회! 서명훈의 욕이 특히 잘 먹혀요',
  '뭉쳐 다니는 패거리는 범위 공격·관통 공격에 약해요',
  '총공지는 적이 몰려올 때 아껴 뒀다가 쓰세요',
];

async function saveWeekly(sum, g, box) {
  const r = await API.postWeekly(sum, app.weeklyRun, app.guest);
  app.weeklyRun = null;
  if (r.ok && r.profile) app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '알 수 없는 오류')}</div>`; return; }
  const w = r.weekly || {};
  const sc = $('#wkscore');
  if (sc && w.score !== undefined) sc.textContent = fmt(w.score);
  box.innerHTML = `<div class="rewards"><div class="rw hl"><span>${ic('calendar', '', 'sm')}이번 주 최고</span><b>${fmt(w.best || 0)}${w.newBest ? '' : ''}</b></div>
    <div class="rw total"><span><i class="ci"></i>받은 코인</span><b>+${fmt((r.reward || {}).total || 0)}</b></div></div>
    <div class="own">${r.rank ? `<span class="badge">이번 주 ${r.rank}위</span>` : ''}<span>보유 <i class="ci"></i>${fmt(P().coins)}</span>${app.guest ? ' · <span class="dimtxt">손님은 순위에 안 올라가요</span>' : ''}</div>`;
  if (w.newBest) { A.sfx.levelUp(); fx.flash('#ffd23f', 0.3); }
}
async function saveResult(sum, g) {
  const box = $('#srv');
  if (app.debugRun) {
    if (box) box.innerHTML = '<div class="guest-note">디버그 판(?wave · ?god · ?stress · ?nosave · 잠긴 스테이지)은 기록을 저장하지 않아요</div>';
    return;
  }
  if (g.raid) { saveRaid(sum, g, box); return; }
  if (g.pvp) { const pr = app.pvpResult || {}; if (box) box.innerHTML = `<div class="rewards"><div class="rw total"><span><i class="ci"></i>받은 코인</span><b>+${fmt(pr.coins || 0)}</b></div></div>`; return; }
  if (g.weekly) { saveWeekly(sum, g, box); return; }
  const stageMode = g.mode === 'stage';
  const body = stageMode
    ? { stage: sum.stage, stars: sum.stars, perfect: sum.perfect, hell: sum.hell, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, skills: sum.skills, durationSec: sum.durationSec, hpPct: sum.hpPct, seen: sum.seen, speed: app.runSpeed || 1 }
    : { wave: sum.wave, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, skills: sum.skills, durationSec: sum.durationSec, seen: sum.seen, afkSec: sum.afkSec, coinMul: sum.coinMul, curses: sum.curses };
  const r = stageMode ? await API.postStage(body, app.guest) : await API.postEndless(body, app.guest);
  if (r.ok && r.profile) app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '알 수 없는 오류')}</div>`; return; }
  const p = P();
  const rw = r.reward || {};
  const lines = [];
  if (stageMode) {
    lines.push(`<div class="rw"><span>클리어 보상</span><b>+${fmt(rw.clear || 0)}</b></div>`);
    if (rw.first) lines.push(`<div class="rw hl"><span>${ic('party', '', 'sm')}첫 클리어 보너스</span><b>+${fmt(rw.first)}</b></div>`);
    if (rw.star) lines.push(`<div class="rw hl"><span>${ic('star_gold', '', 'sm')}새 별 ${rw.newStars}개 보너스</span><b>+${fmt(rw.star)}</b></div>`);
    if (rw.perfect) lines.push(`<div class="rw hl perf"><span>${ic('gem', '', 'sm')}PERFECT${rw.firstPerfect ? ' (첫 퍼펙트!)' : ''}</span><b>+${fmt(rw.perfect)}</b></div>`);
    if (rw.mid) lines.push(`<div class="rw"><span>${ic('bolt', '', 'sm')}중간 보스 처치</span><b>+${fmt(rw.mid)}</b></div>`);
    if (rw.sanghwa) lines.push(`<div class="rw"><span>능력남 박상화 보너스</span><b>+${fmt(rw.sanghwa)}</b></div>`);
    if (rw.hell) lines.push(`<div class="rw hl hellrw"><span>${ic('fire', '', 'sm')}헬 모드 보상 ×${HELL.coin}</span><b>포함</b></div>`);
    if (rw.bonus) lines.push(`<div class="rw"><span>${ic('ticket', '', 'sm')}단골 쿠폰</span><b>+${fmt(rw.bonus)}</b></div>`);
  }
  lines.push(`<div class="rw total"><span><i class="ci"></i>${stageMode ? '받은 코인' : `웨이브 ${sum.wave} 보상`}</span><b>+${fmt(rw.total || 0)}</b></div>`);
  if (!stageMode && r.endless) { if (r.endless.capped) lines.push('<div class="rw"><span>오늘 무한 코인 상한 도달</span><b>' + fmt(L.ENDLESS.coinCap) + '</b></div>'); if (r.endless.weekBest) lines.push('<div class="rw hl"><span>이번 주 최고 점수!</span><b>주간 순위 ↑</b></div>'); if (L.mailCount(P()) > 0) lines.push('<div class="rw"><span>달성 보상이 우편함에 왔어요</span><b>' + L.mailCount(P()) + '</b></div>'); }
  const badges = [];
  if (r.levelUp) badges.push(`<span class="badge pink">계정 레벨 업! Lv.${p.level}</span>`);
  if (r.newBestWave) badges.push('<span class="badge">최고 웨이브 갱신!</span>');
  if (r.newBestScore) badges.push('<span class="badge">최고 점수 갱신!</span>');
  if (r.rank) badges.push(`<span class="badge">랭킹 ${r.rank}위</span>`);
  const unlocks = (r.unlockedHeroes || []).map((id) => {
    const d = HEROES[id];
    return `<div class="unlock ${d.hidden ? 'hid' : ''}">${av(d)}<div><small>${d.hidden ? 'HIDDEN 멤버 합류!' : '새 멤버 합류!'}</small><b>${d.name}</b><span>${esc(d.role.replace('HIDDEN · ', ''))} — 이제 출전 동료로 고를 수 있어요</span></div></div>`;
  }).join('');
  const endless = r.endlessUnlocked ? '<div class="unlock"><span class="big-ico"></span><div><small>새 모드 열림!</small><b>무한 도전</b><span>어디까지 버티나 랭킹 경쟁!</span></div></div>' : '';
  const drops = (rw.drops || []).map((it) => `<span class="drop r-${it.r}" style="--rc:${GEAR_RARITY[it.r].color}">${gearIco(it)}<b>${esc(GEAR[it.t].name)}</b><small>${GEAR_RARITY[it.r].name}${it.sold ? ` · 가방 꽉 참 → +${it.sold}` : ''}</small></span>`).join('');
  box.innerHTML = `<div class="rewards">${lines.join('')}${rw.stones ? `<div class="rw-stones">${ic('gem', '', 'sm')}강화석 <b>+${rw.stones}</b></div>` : ''}${rw.cons ? Object.entries(rw.cons).map(([k, n]) => (L.CONS[k] ? `<div class="rw-stones">${consIc(k)}${esc(L.CONS[k].name)} <b>+${n}</b></div>` : '')).join('') : ''}${rw.cardDrop && HEROES[rw.cardDrop] ? `<div class="rw-stones">${ic('card_common', '', 'sm')}${esc(HEROES[rw.cardDrop].name)} 카드 <b>+1</b></div>` : ''}</div>${drops ? `<div class="drops"><small>${ic('gift', '', 'sm')}장비 획득</small>${drops}</div>` : ''}${unlocks}${endless}
    <div class="own">${badges.join('')}<span>보유 <i class="ci"></i>${fmt(p.coins)}</span>${app.guest ? ' · <span class="dimtxt">손님 기록은 이 기기에만</span>' : ''}</div>`;
  if (unlocks) { fx.flash('#ff9ff0', 0.4); A.sfx.join(); }
  for (const id of r.unlockedHeroes || []) await showJoinReveal(id, HEROES[id].legend ? 'legend' : HEROES[id].hidden ? 'hidden' : 'new');
}

async function buyUpgrade(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  const r = await API.upgradeHero(id, app.guest);
  if (r.ok && r.profile) {
    app.profile = r.profile;
    A.sfx.levelUp();
    const dp = heroPower(app.profile, id) - (btn.dataset.pw ? Number(btn.dataset.pw) : 0);
    toast(`${HEROES[id].name} 강화 완료! (+${app.profile.heroes[id]})${dp > 0 && btn.dataset.pw ? ` · 전투력 +${fmt(dp)}` : ''}`);
  } else toast(r.message || '강화하지 못했어요');
  if (stage.querySelector('.hero-pop')) { showHeroModal(id, app.screen === 'prep' ? 'prep' : ''); refreshBehind(); } else refresh();
}
async function buyItemAct(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  const r = await API.buyItem(id, app.guest);
  if (r.ok && r.profile) {
    app.profile = r.profile;
    A.sfx.levelUp();
    toast(`${ITEMS[id].name} Lv.${app.profile.items[id]}!`);
  } else toast(r.message || '사지 못했어요');
  refresh();
}

// ─── 도감 (아군 · 악당) ──────────────────────────────
// 인게임 캐릭터(작은 그림) — 모습이 바뀌는 멤버는 둘 다 · 정소영은 성준영까지 · 보스는 공격/분노 모습까지(있으면)
const FORM_SPRITES = { ara: ['h_ara_old'], donghan: ['h_donghan_on'], eunok: ['h_eunok_rage'], hyungyeong: ['h_hyungyeong_slim'], jieun: ['h_jieun_demon'], youngjun: ['h_youngjun_dash'], soyoung: ['h_junyoung'], ingyu: ['h_ingyu_bike'] };
function inGameSprites(kind, id, d) {
  if (kind === 'hero') return [d.img, ...(FORM_SPRITES[id] || []).map((n) => `/img/lb/${n}.webp`)];
  const base = d.img || `/img/lb/e_${id}.webp`;
  return d.boss ? [base, `/img/lb/e_${id}_skill.webp`, `/img/lb/e_${id}_rage.webp`] : [base];
}
const igChip = (list, cls = '') => `<span class="ig-chip ${cls}"><small>인게임</small><span class="ig-row">${list.map((src, i) => `<img src="${src}" alt="" draggable="false" style="--d:${i * 0.35}s" onerror="this.remove()">`).join('')}</span></span>`;
const DEX_ENEMIES = () => Object.keys(ENEMIES).filter((id) => !ENEMIES[id].dot && !ENEMIES[id].towerOnly); // (탑 전용 보스는 도감 밖)
const DEX_HEROES = () => Object.keys(HEROES);
function seenEnemies() {
  const set = new Set(P().seen || []);
  for (const k of Object.keys(seen)) if (ENEMIES[k] && !ENEMIES[k].dot) set.add(k); // 이 기기에서 만난 것 (실패한 판 포함)
  return set;
}
function dexKnown(kind, id) { return kind === 'hero' ? API.heroUnlocked(P(), id) : seenEnemies().has(id); }
function dexViewed() { try { return new Set(JSON.parse(localStorage.getItem('langbang:dexViewed') || '[]')); } catch { return new Set(); } }
function dexHasNew() {
  const v = dexViewed();
  return DEX_HEROES().some((id) => dexKnown('hero', id) && !v.has('h:' + id)) || DEX_ENEMIES().some((id) => dexKnown('enemy', id) && !v.has('e:' + id));
}
function markViewed(keys) {
  const v = dexViewed();
  for (const k of keys) v.add(k);
  try { localStorage.setItem('langbang:dexViewed', JSON.stringify([...v])); } catch { /* 무시 */ }
}
function firstStageOf(id) { for (let s = 1; s <= STAGE_COUNT; s++) if (stageEnemies(s).includes(id) || stageMid(s) === id) return s; return 0; }
function bar(label, v) { return `<div class="sbar"><span>${label}</span><i><b style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></b></i></div>`; }
// 도감 캐릭터 소개 (랑방에서 어떤 사람인지 한두 줄)
const DEX_FLAVOR = {
  bangjang: '랑방 단톡방 공지 담당. 확성기로 "공지!" 한마디 하면 멤버들 손이 저절로 빨라진다.',
  staff: '랑방 규칙집을 통째로 외운 운영진. 경고 세 번이면 누구든 강퇴, 예외는 없다.',
  gunman: '모임 내내 바른 자세로 앉아 있는 건전남. 새총도 옆으로 안 새고 딱 자기 줄로만 쏜다.',
  gunnyeo: '다친 멤버를 제일 먼저 챙기는 간호사 건전녀. 입구가 부서지면 말없이 고쳐 놓는다.',
  myunghoon: '실눈 뜬 티벳여우. 평소엔 조용한데 입을 열면 진상 셋이 한꺼번에 얼어붙는다.',
  dohoon: '노래방에서 마이크를 절대 안 놓는 남자. 앵콜이 끝나지 않는 한 랑방도 무너지지 않는다.',
  ingyu: '3대 500 헬창. 진상이 뭘 던지든 "오 근육 자극 좋다"로 받아친다.',
  donghan: '모임 내내 소파에 누워 간만 보는 사람. 근데 "이제 좀 해볼까?" 하는 순간 한 줄이 사라진다.',
  youngjun: '검은 고양이 후드를 쓰고 파티장에 뛰어드는 전사. 뛰어든 동안엔 아무것도 안 통한다.',
  eunok: '처음엔 얌전히 홀짝홀짝. 20초 뒤엔… 소주병이 날아다니기 시작한다.',
  hanna: '랑방 공식 윙크 담당. 남자 진상은 윙크 한 방에 정신 못 차리고 날아간다.',
  sunggu: '"요즘 것들은…"이 입버릇인 최고참. 지팡이 하나로 한 줄을 통째로 정리한다.',
  junseo: '여사친이 유난히 많은 남자. "잠깐, 내 친구 소개해 줄게!" 하면 여사친이 굴러간다.',
  hyungyeong: '"다이어트는 내일부터!" 통통할 땐 벽, 주사 한 방이면 복서. 그리고… 요요.',
  ara: '목소리 맑은 랑방 공주님. 가끔 폭삭 늙어서 "아이고 허리야"를 외치지만 망치는 여전히 무겁다.',
  soyoung: '랑방 공식 잔소리 담당. 잔소리가 쌓이면 어디선가 성준영이 끌려 나온다.',
  jieun: '보브컷의 순한 막내… 인 줄 알았는데 공격만 하면 악마가 된다. 시간도 멈춘다.',
  sanghwa: '가르마 펌 앞머리에 예쁜 미소. 오래 있을수록 더 멋있어지고 코인도 더 벌어 온다.',
  jungmin: '험한 눈매에 소주병 흉터. 무섭게 생겼지만 입구가 깨지면 제일 먼저 붕대를 붙인다.',
  hochan: '랑방을 처음 만든 진짜 방장. "랑방을 위하여!" 한마디에 금빛 파동이 한 줄을 쓸어 간다.',
  yeokko: '모임마다 나타나 여자 멤버 번호만 모으는 사냥꾼. 오늘도 "우연히" 옆자리.',
  namkko: '"오빠~ 한 잔 사줘" 한마디로 남자 멤버를 홀리는 프로. 계산할 땐 꼭 화장실에 간다.',
  drunk: '첫 잔부터 "내가 누군지 알아?!" 하는 술진상. 쓰러질 때 술병까지 터뜨린다.',
  thug: '괜히 어깨 부딪히고 "뭘 봐?" 하는 폭력배. 웬만한 공격은 간지럽다.',
  mukti: '2차까지 다 먹고 계산할 때만 사라지는 먹튀. 경험치까지 챙겨 도망간다.',
  queen: '모임의 여왕벌. 손짓 한 번에 졸개들이 몰려오고 보호막까지 씌워 준다.',
  boss_thug: '동네 폭력배들의 두목. 땅을 한 번 내려치면 랑방 전체가 흔들린다.',
  vomit: '"우웩!" 소리와 함께 나타나는 민폐. 멀리서 잡는 게 모두를 위한 길.',
  couple: '어디서든 꽁냥꽁냥, 남 눈치 제로. 반쯤 때리면 "헤어져!" 하고 둘로 갈라진다.',
  handsy: '"잠깐만~" 하며 붙잡고 안 놓아 주는 손진상. 붙잡힌 멤버는 아무것도 못 한다.',
  gao: '가오에 살고 가오에 죽는 남자. 가오 깨지기 전까진 뭘 맞아도 안 아픈 척.',
  selfie: '모임 사진은 전부 자기 얼굴만 나오는 인플루언서. "찰칵!" 플래시에 가까운 멤버가 눈부셔 1초 기절한다.',
  cutter: '줄 서는 걸 모르는 새치기꾼. 앞줄 근처에서 한 번 훌쩍 뛰어넘는다.',
  kkondae: '"라떼는 말이야~" 무한 반복. 옆에만 있어도 멤버들 손이 느려진다.',
  spam: '단톡방에 하루 300개씩 공지를 뿌리는 빌런. 잡아도 알림이 셋 더 날아온다.',
  inpi_gossip: '구석에서 "걔 그렇대~" 수군수군. 뒷담을 들은 멤버는 기운이 빠진다.',
  inpi_dictator: '인피 모임의 독재자. "내 말이 곧 법이다" 한마디에 졸개들이 단단해진다.',
  inpi_clique: '끼리끼리 몰려다니며 서로 감싸 주는 패거리. 한꺼번에 날려 버리자.',
  scammer: '프사는 연예인, 실물은… 가입인사부터 수상한 사기꾼. 들키는 순간이 약점.',
  boss_gapjil: '"무릎 꿇어!" 서열 정리가 취미인 인피 행동대장.',
  boss_inpi: '인피 모임의 대장. 오리고기 회식 한 번이면 쓰러진 부하들도 벌떡.',
  boss_loan: '골목 사채업자. 시간이 갈수록 이자가 붙어 입구를 점점 더 뜯어 간다.',
  inpi_treasurer: '인피 총무. 뒤에 숨어 회비로 보호막을 사 뿌린다. 영수증은 없다.',
  boss_union: '전국 진상들을 모은 연합 회장. 보스들 기술을 돌아가며 다 쓴다.',
  boss_bbikki: '형광 조끼에 네온 선글라스, 번화가 호객꾼들의 대장. "VIP 무료입장~" 팻말 하나로 길 가던 진상을 다 끌고 온다.',
  fakesingle: '"저 싱글이에요~" 하고 들어온 돌싱남. 들키는 순간 발이 빨라진다.',
  secretmom: '스무 살이라고 우기며 들어온 싱글맘. 유모차는 "짐"이라고 한다.',
  carpoor: '60개월 할부 외제차로 부아앙 들어오는 카푸어. 꼭 중간에 퍼진다.',
  sales: '"보험 하나 드세요!" 모임을 영업장으로 아는 사람. 다단계로 동료까지 불러온다.',
  sarcasm: '"어머 옷 예쁘다~ 어디서 샀어?" 칭찬인 척 돌려까는 장인.',
  jjijil: '"왜 답장 안 해?" 한 번 붙으면 안 떨어지는 찌질남.',
  otaku: '가방마다 피규어가 가득한 오타쿠. 최애를 건드리면 굿즈 방패가 올라간다.',
  drunk_cry: '세 잔째부터 우는 진상. 눈물 웅덩이에 발이 묶인다.',
  drunk_run: '네 잔째부터 뛰는 진상. "2차 가자!!" 하며 아무 데로나 달린다.',
  drunk_sleep: '다섯 잔째부터 눕는 진상. 길 한복판에 드러누워 총알을 막는다.',
  drunk_home: '마지막 잔에 "집에 갈래…" 경험치를 들고 택시 타러 간다.',
  kkondae2: '주말엔 골프, 평일엔 잔소리. "나이스 샷!" 골프공이 멤버 머리로 날아온다.',
  boss_kkondol: '꼰대 + 돌싱 + 찌질을 모두 가진 최종 진화형. 체력이 절반이면 폭주한다.',
  boss_queenmom: '명품 가방을 휘두르는 여왕 싱글맘. 유모차 탱크가 진짜 무섭다.',
  boss_sales: '영업의 왕. 계약서 도장 한 방이면 멤버가 얼어붙는다.',
  boss_otaku: '오타쿠의 왕. 피규어 부대를 거느리고 응원봉 빔을 쏜다.',
  boss_jusa: '울고, 뛰고, 자고, 집에 가는 주사를 한 몸에 다 가진 왕.',
  boss_soloparty: '매일 밤 솔로파티를 여는 중독자. 디스코볼 한 번에 모두가 홀린다.',
  // 7장 스키장 MT
  snowboard: '시즌권을 자랑하러 MT까지 따라온 보드남. 뒤로 타며 과시하다가 갑자기 옆 줄로 휙 넘어간다.',
  liftcut: '"저희 일행이에요~" 리프트 줄을 두세 명씩 우르르 끼어드는 새치기꾼들.',
  fakecoach: '강사 자격증은 없지만 강습은 한다. "제가 알려 드릴게요~" 하면 옆 진상들 자세가 단단해진다.',
  sledgirl: '브레이크 없는 눈썰매로 입구까지 일직선. 한 번 붙잡히면 썰매에서 굴러떨어진다.',
  hotpack: '남의 핫팩만 골라 슬쩍하는 손. 옆을 지나가기만 해도 손이 꽁꽁 언다.',
  snowball: '과 대항 눈싸움에 목숨 건 대학생. 제일 잘 싸우는 사람 머리부터 노린다.',
  mid_pension: 'MT 펜션 사장님. "여기 밤 10시 이후 소음 금지예요!" 한마디면 모두 입을 다문다. 7-5 보스, 7-10 에 회장님과 다시.',
  boss_resort: '스키장을 통째로 가진 리조트 갑부 회장. 손짓 한 번에 산 위에서 눈사태가 쏟아진다.',
};
// 도감 카드 세로 영문 이름 · 얼굴 위치 (dexhq 전신 그림 기준: 가운데 x, y, 얼굴 폭 — 그림 폭 대비)
const DEX_EN = { baul: 'SONG BAUL', byunghwa: 'KANG BYUNGHWA', jeongseob: 'YOON JEONGSEOB', jiwon: 'YEO JIWON', wonsik: 'JUNG WONSIK', bangjang: 'BANGJANG', staff: 'STAFF', gunman: 'MR. CLEAN', gunnyeo: 'MS. CLEAN', myunghoon: 'SEO MYUNGHOON', dohoon: 'KIM DOHOON', ingyu: 'BAEK INGYU', donghan: 'MOON DONGHAN', youngjun: 'KIM YOUNGJUN', eunok: 'CHOI EUNOK', hanna: 'LEE HANNA', sunggu: 'KANG SUNGGU', junseo: 'YOON JUNSEO', hyungyeong: 'BAE HYUNGYEONG', ara: 'KO ARA', hochan: 'LEE HOCHAN', soyoung: 'JEONG SOYOUNG', jieun: 'OH JIEUN', sanghwa: 'PARK SANGHWA', jungmin: 'HONG JUNGMIN' };
const DEX_FACE = { baul: [0.49, 0.085, 0.12], byunghwa: [0.42, 0.085, 0.11], jeongseob: [0.5, 0.1, 0.13], hochan: [0.49, 0.125, 0.17], bangjang: [0.45, 0.1, 0.15], staff: [0.47, 0.085, 0.13], gunnyeo: [0.47, 0.09, 0.13], eunok: [0.44, 0.078, 0.12], hanna: [0.47, 0.083, 0.13], sunggu: [0.49, 0.09, 0.14], gunman: [0.58, 0.085, 0.13], dohoon: [0.55, 0.09, 0.13], myunghoon: [0.56, 0.1, 0.15], youngjun: [0.49, 0.085, 0.13], donghan: [0.62, 0.11, 0.17], ingyu: [0.48, 0.1, 0.13], junseo: [0.55, 0.11, 0.14], ara: [0.37, 0.32, 0.12], hyungyeong: [0.55, 0.19, 0.2], jungmin: [0.44, 0.11, 0.12], soyoung: [0.47, 0.11, 0.13], jieun: [0.52, 0.12, 0.13], sanghwa: [0.45, 0.07, 0.12], jiwon: [0.48, 0.075, 0.12], wonsik: [0.47, 0.08, 0.12], baul: [0.49, 0.085, 0.12], junyoung: [0.5, 0.2, 0.3] }; // [가로 가운데, 세로 가운데, 얼굴 높이] (그림 대비)
// 얼굴 맞춤 자르기: 얼굴 높이 = 칸 높이의 f · 얼굴 가운데 = (50%, cy) — 그림 비율과 상관없이 (자기 크기 기준 translate)
// 동그란 얼굴용 얼굴 상자 (썸네일 기준 · 이마~턱 · 가운데 x, 가운데 y, 높이) — 그림을 재서 맞춘 값
const FACE_BOX = { byunghwa: [0.42, 0.1, 0.075], hochan: [0.44, 0.115, 0.085], bangjang: [0.47, 0.1, 0.085], staff: [0.47, 0.115, 0.09], gunnyeo: [0.39, 0.135, 0.11], eunok: [0.47, 0.115, 0.1], hanna: [0.49, 0.11, 0.11], sunggu: [0.52, 0.165, 0.1], gunman: [0.55, 0.115, 0.09], dohoon: [0.57, 0.165, 0.095], myunghoon: [0.565, 0.145, 0.13], youngjun: [0.575, 0.18, 0.1], donghan: [0.63, 0.19, 0.12], ingyu: [0.45, 0.105, 0.095], junseo: [0.56, 0.115, 0.095], ara: [0.42, 0.32, 0.1], hyungyeong: [0.55, 0.24, 0.12], jungmin: [0.42, 0.155, 0.09], soyoung: [0.45, 0.145, 0.09], jieun: [0.55, 0.145, 0.11], sanghwa: [0.48, 0.11, 0.085], jiwon: [0.47, 0.095, 0.075], wonsik: [0.6, 0.095, 0.09], baul: [0.49, 0.09, 0.085], jeongseob: [0.52, 0.08, 0.075] };
// 동그라미 안에 얼굴: 얼굴(이마~턱)이 지름의 70% · 가운데
function faceCircStyle(id, f = 0.7, cy = 0.5) {
  const fb = FACE_BOX[id] || DEX_FACE[id] || [0.48, 0.12, 0.1];
  const h = (f / fb[2]) * 100;
  return `--fzh:${h.toFixed(1)}%;--fzy:${(cy * 100).toFixed(1)}%;--fzx:-${(fb[0] * 100).toFixed(1)}%;--fzt:-${(fb[1] * 100).toFixed(1)}%`;
}
function faceImgStyle(id, f = 0.24, cy = 0.36) {
  const fb = DEX_FACE[id] || [0.48, 0.09, 0.14];
  const h = Math.max(100, (f / fb[2]) * 100);
  return `--fzh:${h.toFixed(1)}%;--fzy:${(cy * 100).toFixed(1)}%;--fzx:-${(fb[0] * 100).toFixed(1)}%;--fzt:-${(fb[1] * 100).toFixed(1)}%`; // 실제 배치는 CSS img.fz (다른 규칙보다 우선)
}
// 변신 그림 (그림을 누르면 바뀜)
const DEX_ALT = { jieun: ['jieun_demon'], eunok: ['eunok_rage'], hyungyeong: ['hyungyeong_slim'], ara: ['ara_old'], donghan: ['donghan_on'], youngjun: ['youngjun_dash'], scammer: ['scammer_ugly', 'scammer_fat'] };
const DEX_FORM = { jieun: '순한 막내', jieun_demon: '악마 모드', eunok: '평소', eunok_rage: '분노 모드', hyungyeong: '통통 모드', hyungyeong_slim: '날씬 모드', ara: '공주', ara_old: '폭삭 늙음', donghan: '누워서 간보기', donghan_on: '진심 모드', youngjun: '대기', youngjun_dash: '돌격!', scammer: '프사', scammer_ugly: '실물 (공포)', scammer_fat: '실물 (뚱뚱)' };
// 캐릭터별 가만히 있을 때 움직임
const DEX_ANIM = { baul: 'bouncy', byunghwa: 'gold', jeongseob: 'breathe', jiwon: 'breathe', wonsik: 'flex', sanghwa: 'gold', jieun: 'breathe', soyoung: 'bouncy', jungmin: 'sway', dohoon: 'notes', eunok: 'flame', donghan: 'sleepy', hochan: 'gold', hanna: 'hearts', junseo: 'hearts', youngjun: 'bouncy', ingyu: 'flex', hyungyeong: 'bouncy', sunggu: 'sway', ara: 'breathe', drunk_sleep: 'sleepy', boss_soloparty: 'party' };
function dexAnim(kind, d, id) {
  if (DEX_ANIM[id]) return DEX_ANIM[id];
  if (kind === 'hero') return 'breathe';
  const b = d.base || (d.fuse && d.fuse[0]) || id;
  if (/^drunk|^boss_jusa|vomit/.test(b)) return 'wobble';
  return d.boss || d.mid ? 'menace big' : 'menace';
}
const DEX_FX = {
  notes: () => Array.from({ length: 6 }, (_, i) => `<i class="nt" style="--x:${12 + i * 15}%;--d:${i * 0.55}s">${i % 2 ? '♫' : '♪'}</i>`).join(''),
  hearts: () => Array.from({ length: 5 }, (_, i) => `<i class="nt ht" style="--x:${14 + i * 17}%;--d:${i * 0.7}s"></i>`).join(''),
  sleepy: () => '<i class="zz">Z</i><i class="zz" style="--d:.8s">z</i><i class="zz" style="--d:1.6s">z</i>',
  flame: () => Array.from({ length: 7 }, (_, i) => `<i class="fl" style="--x:${8 + i * 13}%;--d:${(i * 0.23) % 1}s"></i>`).join(''),
  gold: () => '<i class="sh"></i>' + Array.from({ length: 8 }, (_, i) => `<i class="sp" style="--x:${(i * 37) % 90 + 5}%;--y:${(i * 53) % 70 + 10}%;--d:${i * 0.35}s">✦</i>`).join(''),
  party: () => Array.from({ length: 8 }, (_, i) => `<i class="sp cf" style="--x:${(i * 41) % 90 + 5}%;--y:${(i * 29) % 60 + 5}%;--d:${i * 0.3}s;color:${['#ff6fd8', '#ffd23f', '#6fe3ff', '#8dff7a'][i % 4]}">✦</i>`).join(''),
};
// 도감 그림: 큰 그림(dex/) → 없으면 원래 그림
const DUO_HEROES = ['ara', 'eunok', 'donghan', 'hyungyeong', 'youngjun', 'soyoung', 'jieun', 'junseo'];
const hasDuo = (id) => DUO_HEROES.includes(id) && !NO_DUO_ART.has(id);
const hqSrc = (id) => (NO_HQ_ART.has(id) ? (NO_DEX_ART.has(id) ? (HEROES[id] || {}).img || '' : `/img/lb/dex/${id}.webp`) : `/img/lb/dexhq/${id}.webp`);
const dexSrc = (id, fb) => (NO_DEX_ART.has(id) ? fb || '' : `/img/lb/dex/${id}.webp`);
function dexImg(id, fb, cls = '') {
  const src = dexSrc(id, fb);
  if (!src) return `<span class="dx-art dx-emo ${cls}">${esc((HEROES[id] || ENEMIES[id] || {}).emoji || '')}</span>`;
  const fb2 = (ENEMIES[id] && ENEMIES[id].fb) || ''; // 7장: 도감 그림 → 전투 그림 → 비슷한 진상 그림 (색만 바꿔서)
  if (fb2) return `<img class="dx-art ${cls}" src="${src}" alt="" draggable="false" onerror="if(this.dataset.f){this.onerror=null;this.src='${fb2}';this.style.filter='hue-rotate(160deg) saturate(1.3)'}else{this.dataset.f=1;this.src='${fb}'}">`;
  return `<img class="dx-art ${cls}" src="${src}" alt="" draggable="false" onerror="this.onerror=null;this.src='${fb}'">`;
}
function dexArt(d, id, form) {
  if (d.fuse && FUSE_ART.has(id)) return dexImg(id, `/img/lb/e_${id}.webp`);
  if (d.fuse) return `<span class="dx-fuse">${d.fuse.map((f) => dexImg(f, ENEMIES[f].img)).join('')}</span>`;
  const base = d.base || id;
  return dexImg(form || base, d.img);
}
function dexColor(kind, d) { return kind === 'hero' ? ATTRS[d.attr].color : d.boss ? '#ff5a5a' : d.mid ? '#ff9d3f' : CLASSES[d.cls].color; }
function dexChapter(kind, id) { const s = kind === 'hero' ? HERO_UNLOCK[id] || 1 : firstStageOf(id) || STAGE_COUNT; return clamp(chapterOf(s), 1, CHAPTERS.length); }
function heroHow(id) {
  if (!LOCKED_HEROES.includes(id)) return '처음부터 함께하는 멤버';
  if (HERO_UNLOCK[id]) return `${stageLabel(HERO_UNLOCK[id])} 클리어하면 합류`;
  if (LEGEND_HEROES.includes(id)) { const pr = L.cardProgress(P(), id); return `${stageLabel(L.HOCHAN_GATE)} 클리어 후 모집에서 카드 ${L.UNLOCK_CARDS.legend}장을 모으면 합류${pr ? ` — 지금 ${pr[0]}/${pr[1]}장` : ''}`; }
  const pr = L.cardProgress(P(), id);
  return `모집에서 카드를 모아 합류${pr ? ` — 지금 ${pr[0]}/${pr[1]}장` : ''}`;
}
function dexList(kind) { const l = dexFiltered(kind); return l.length ? l : kind === 'hero' ? DEX_HEROES() : DEX_ENEMIES(); }
// ─── 아이템 도감: 모든 장비(신화 포함) · 얻은 적 없으면 실루엣 · 등급별 능력치 · 어디서 나오나 ───
const gearDexSet = () => new Set([...(P().gearDex || []), ...(P().gear || []).map((x) => x.t)]);
const gearDexN = () => gearDexSet().size;
function gearWhere(t) { const g = GEAR[t]; if (g.hero) return `모집 1회 ${SIG_RATE.hero}% · 장비 뽑기 1회 ${SIG_RATE.gear}% · 신화 조각 ${SIG_PITY}개로 교환`; return g.myth ? '무한 50웨이브(주마다) · 시즌 30단계 · 모집 0.3% · 장비 뽑기 1%' : `${g.ch || 1}장부터 스테이지·헬 보상 · 모집 · 시즌 · 순위 보상`; }
function showItemDex() {
  app.screen = 'dex';
  const have = gearDexSet();
  const ITEM_CATS = [['all', '전체'], ['w', '무기'], ['a', '장신구'], ['myth', '신화'], ['sig', '전용 신화'], ['cons', '소모품']];
  const cat = ITEM_CATS.some(([k]) => k === app.itemCat) ? app.itemCat : 'all';
  const inCat = (t, c) => { const g = GEAR[t]; return c === 'all' ? true : c === 'sig' ? !!g.hero : c === 'myth' ? g.myth && !g.hero : c === 'cons' ? false : !g.myth && g.slot === c; };
  const every = [...GEAR_IDS, ...MYTH_IDS, ...SIG_IDS];
  const all = every.filter((t) => inCat(t, cat));
  const RK = ['common', 'rare', 'epic', 'legend', 'myth'];
  const best = (t) => { let b = -1; for (const it of P().gear || []) if (it.t === t) b = Math.max(b, RK.indexOf(it.r)); return b >= 0 ? RK[b] : 'rare'; };
  const cell = (t) => { const ok = have.has(t), g = GEAR[t], r = g.myth ? 'myth' : best(t); return `<button class="dexc2 idx ${ok ? 'r-' + r : 'lock'} ${g.myth ? 'r-myth' : ''} ${g.hero ? 'r-sig' : ''}" data-act="itemCard" data-id="${t}" style="--c:${g.hero ? SIG_COLOR : GEAR_RARITY[r].color}"><span class="dx-pic"><img class="idx-ic ${g.hero ? 'sig-face' : ''}" src="${g.img}" alt="" draggable="false"></span><b>${ok ? esc(g.name) : g.hero ? esc(HEROES[g.hero].name) + ' 전용' : '???'}</b><small class="idx-k">${g.hero ? '전용 신화' : g.myth ? '신화' : g.slot === 'w' ? '무기' : '장신구'}</small></button>`; };
  const nGear = [...GEAR_IDS, ...MYTH_IDS].length, n = [...have].filter((t) => GEAR[t] && !GEAR[t].hero).length, next = [10, 20, nGear].find((x) => n < x);
  const cnt = (c) => (c === 'cons' ? L.CONS_IDS.length : every.filter((t) => inCat(t, c)).length);
  const chips = `<div class="dex-cats">${ITEM_CATS.map(([k, nm]) => `<button class="chip ${k === cat ? 'on' : ''} ${k === 'sig' ? 'c-sig' : ''}" data-act="itemCat" data-v="${k}">${nm} <small>${cnt(k)}</small></button>`).join('')}</div>`;
  const sigN = SIG_IDS.filter((t) => have.has(t)).length;
  show(`
    ${topbar(true)}
    <h2 class="title dex-title">${ic('ic_dex', '')}랑방 도감</h2>
    <div class="tabs"><button data-act="dexTab" data-tab="hero">${ic('ic_party', '')} 모임</button><button data-act="dexTab" data-tab="enemy">${ic('ic_jinsang', '')} 진상</button><button class="on" data-act="dexTab" data-tab="item">${ic('ic_bag', '')} 아이템 ${n}/${nGear}</button></div>
    ${chips}
    <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>${cat === 'sig' ? `멤버마다 하나뿐인 전용 신화 · 모은 것 ${sigN}/${SIG_IDS.length} · 모집 ${SIG_RATE.hero}% · 장비 뽑기 ${SIG_RATE.gear}% · 신화 조각 ${SIG_PITY}개로 교환` : `한 번이라도 얻은 장비가 기록돼요${next ? ` · ${next}종이면 수집 보상 (업적)` : ' · 전부 모았어요!'}`} <button class="chip mini" data-act="dropTable">드롭 표</button></span></p>
    ${cat === 'cons' ? '' : `<div class="dex-grid v2 idx-grid">${all.map(cell).join('')}</div>`}
    ${cat === 'all' || cat === 'cons' ? `<h3 class="sec-t">소모품</h3>
    <div class="dex-grid v2 idx-grid">${L.CONS_IDS.map((id) => { const c = L.CONS[id]; const known = !c.hidden || (P().consDex || []).includes(id); if (!known) return `<button class="dexc2 idx lock" data-act="bagTabGo" data-v="cons"><span class="dx-pic"><img class="idx-ic" src="/img/lb/ui2/${c.icon}.webp" alt="" draggable="false"></span><b>???</b></button>`; return `<button class="dexc2 idx r-${c.rarity}" data-act="bagTabGo" data-v="cons" style="--c:${CONS_RC[c.rarity]}"><span class="dx-pic"><img class="idx-ic" src="/img/lb/ui2/${c.icon}.webp" alt="" draggable="false"></span><b>${esc(c.name)}</b></button>`; }).join('')}</div>` : ''}
  `, 'dim');
}
function showItemCard(t) {
  if (GEAR[t] && GEAR[t].hero) { popup(sigInfoHtml(t), 'pp-mini sig-pop'); return; }
  const g = GEAR[t], ok = gearDexSet().has(t);
  const pct = (v) => `+${(v * 100).toFixed(1)}%`;
  const rows = g.myth ? `<p class="ip"><b>${esc(g.desc)}</b> · 강화 없음 · 멤버마다 신화 칸 하나</p>`
    : `<div class="idx-tab"><div><span></span>${['common', 'rare', 'epic', 'legend'].map((r) => `<b style="color:${GEAR_RARITY[r].color}">${GEAR_RARITY[r].name}</b>`).join('')}</div>${[0, 5, 10].map((lv) => `<div><span>+${lv}</span>${['common', 'rare', 'epic', 'legend'].map((r) => `<i>${pct(gearValue(t, r, lv))}</i>`).join('')}</div>`).join('')}</div>`;
  popup(`<div class="idx-head"><img src="${g.img}" alt="" class="${ok ? '' : 'sil'}"><div><h3>${ok ? esc(g.name) : '??? (아직 못 얻음)'}</h3><small>${g.myth ? '신화' : g.slot === 'w' ? '무기' : '장신구'} · ${esc(GEAR_STATS[g.stat] ? GEAR_STATS[g.stat].name : '')}</small></div></div>
    ${ok && GEAR_INFO[t] ? `<p class="ip">"${esc(GEAR_INFO[t][0])}"</p>` : ''}${rows}
    <p class="ip">얻는 곳: ${esc(gearWhere(t))}</p>`, 'pp-mini');
}
// 전용 신화 소개 (도감 · 장비 카드 · 멤버 상세 공용): 그림 · 이름 · 주인 · 새 효과 · 능력치 · 얻는 법
function sigInfoHtml(t, mine) {
  const g = GEAR[t], h = g.hero, p = P(), ok = mine || sigHave(p, h), d = HEROES[h];
  return `<div class="idx-head sig-head"><span class="sig-ic ${ok ? '' : 'off'}">${gearIco({ t, r: 'myth' })}</span><div><small class="sig-k">전용 신화 · ${esc(d.name)} 전용</small><h3>${esc(g.name)}</h3></div></div>
    <p class="ip sig-fx"><b>새 효과</b> ${esc(g.desc)}</p>
    <p class="ip"><b>능력치</b> ${esc(sigStatText(t))} · 강화 없음 · 신화 칸</p>
    <p class="ip sig-how">${ok ? `${ic('check', '', 'sm')}가지고 있어요` : `${ic('lock', '', 'sm')}아직 없어요`} · 얻는 곳: 모집 1회 ${SIG_RATE.hero}% · 장비 뽑기 1회 ${SIG_RATE.gear}% · 신화 조각 ${SIG_PITY}개로 교환 (지금 ${((p.pity || {}).sig | 0)}개)</p>
    <p class="ip dimtxt">1:1 대전에서는 새 효과 없이 능력치만 적용돼요</p>`;
}
// 멤버 상세: 이 멤버 전용 신화 한 줄 (없으면 흐리게 + 얻는 법)
function sigRowHtml(id) {
  const t = sigOf(id); if (!t) return '';
  const g = GEAR[t], have = sigHave(P(), id);
  return `<div class="hs-sig ${have ? '' : 'off'}"><span class="sig-ic">${gearIco({ t, r: 'myth' })}</span><span><small>신화장비${have ? '' : ' · 아직 없음'}</small><b>${esc(g.name)}</b><p>${esc(g.desc)}</p>${have ? '' : `<em>얻는 법: 모집 ${SIG_RATE.hero}% · 장비 뽑기 ${SIG_RATE.gear}% · 신화 조각 ${SIG_PITY}개로 교환</em>`}</span></div>`;
}
const roleChip = (id, cls = '') => `<i class="role-cat r-${heroRole(id)} ${cls}">${esc(HERO_ROLES[heroRole(id)].name)}</i>`;
// 도감 분류: 멤버 = 역할 · 진상 = 종류 + 장
function dexFiltered(kind) {
  const ids = kind === 'hero' ? DEX_HEROES() : DEX_ENEMIES();
  if (kind === 'hero') { const c = app.dexRole || 'all'; return c === 'all' ? ids : ids.filter((id) => heroRole(id) === c); }
  const k = app.dexKind || 'all', ch = app.dexCh || 0;
  return ids.filter((id) => (k === 'all' || enemyKind(ENEMIES[id]) === k) && (!ch || dexChapter('enemy', id) === ch));
}
function showDropTable() {
  popup(`<h3>드롭 표</h3><div class="ilist">${DROPS.map(([k, a, b, c]) => `<p class="ip"><b>${esc(k)}</b> — ${esc(a)}${b ? ` · ${esc(b)}` : ''}${c ? ` · ${esc(c)}` : ''}</p>`).join('')}</div>`, 'pp-more-pop');
}
function dexCatChips(kind) {
  const chip = (act, v, cur, nm, n, cls = '') => `<button class="chip ${String(v) === String(cur) ? 'on' : ''} ${cls}" data-act="${act}" data-v="${v}">${nm} <small>${n}</small></button>`;
  if (kind === 'hero') {
    const all = DEX_HEROES(), cur = app.dexRole || 'all';
    return `<div class="dex-cats">${chip('dexRole', 'all', cur, '전체', all.length)}${Object.entries(HERO_ROLES).map(([k, r]) => chip('dexRole', k, cur, esc(r.name), all.filter((id) => heroRole(id) === k).length, 'r-' + k)).join('')}</div>`;
  }
  const all = DEX_ENEMIES(), k0 = app.dexKind || 'all', ch0 = app.dexCh || 0;
  const byCh = (c) => all.filter((id) => (k0 === 'all' || enemyKind(ENEMIES[id]) === k0) && dexChapter('enemy', id) === c).length;
  return `<div class="dex-cats">${chip('dexKind', 'all', k0, '전체', all.length)}${Object.entries(ENEMY_KINDS).map(([k, nm]) => chip('dexKind', k, k0, nm, all.filter((id) => enemyKind(ENEMIES[id]) === k).length)).join('')}</div>
    <div class="dex-cats ch">${chip('dexCh', 0, ch0, '모든 장', all.filter((id) => k0 === 'all' || enemyKind(ENEMIES[id]) === k0).length)}${CHAPTERS.map((_, i) => chip('dexCh', i + 1, ch0, `${i + 1}장`, byCh(i + 1))).join('')}</div>`;
}
function showDex() {
  app.screen = 'dex';
  hud.hidden = true;
  const tab = app.dexTab || 'hero';
  if (tab === 'item') { showItemDex(); return; }
  const kind = tab === 'hero' ? 'hero' : 'enemy';
  const ids = dexFiltered(kind);
  const nH = DEX_HEROES().filter((id) => dexKnown('hero', id)).length, nE = DEX_ENEMIES().filter((id) => dexKnown('enemy', id)).length;
  const v = dexViewed();
  const cards = ids.map((id) => {
    const d = kind === 'hero' ? HEROES[id] : ENEMIES[id];
    const ok = dexKnown(kind, id);
    const isNew = ok && !v.has((kind === 'hero' ? 'h:' : 'e:') + id);
    const tag = kind === 'hero' ? attrIco(d.attr) : clsIco(d.cls);
    const fr = kind === 'hero' ? `fr-t${heroTier(id)}` : d.boss ? 'fr-boss' : d.mid ? 'fr-mid' : 'fr-e';
    const badge = kind === 'hero' ? `<i class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]}</i>${roleChip(id, 'dx-role')}${sigHave(P(), id) ? '<i class="dx-sig">전용</i>' : ''}` : d.boss ? '<i class="dxb bs">보스</i>' : d.mid ? `<i class="dxb md">${d.fuse ? '합체' : '각성'}</i>` : '';
    return `<button class="dexc2 ${fr} ${ok ? '' : 'lock'}" data-act="dexCard" data-kind="${kind}" data-id="${id}" style="--c:${dexColor(kind, d)}">
      <span class="dx-pic">${kind === 'hero' && thumbSrc(id) ? `<img class="dx-art hq fz" data-face="${id}" style="${faceImgStyle(id, 0.22, 0.36)}" src="${thumbSrc(id)}" alt="" loading="lazy" decoding="async" draggable="false" onerror="this.onerror=null;this.src='${dexSrc(id, d.img) || d.img}'">` : dexArt(d, id)}${ok ? `<img class="dx-mini" src="${inGameSprites(kind, id, d)[0]}" alt="" loading="lazy" draggable="false" onerror="this.remove()">` : ''}</span>${badge}<span class="dt">${tag}</span>
      <b>${ok ? esc(d.name) : '???'}</b>${isNew ? '<span class="newdot">N</span>' : ''}${!ok && kind === 'hero' && (GACHA_HEROES.includes(id) || LEGEND_HEROES.includes(id)) ? (() => { const pr = L.cardProgress(P(), id); return pr ? `<span class="dx-cards"><i style="width:${Math.round((pr[0] / pr[1]) * 100)}%"></i><em>${pr[0]}/${pr[1]}</em></span>` : ''; })() : ''}</button>`;
  }).join('');
  show(`
    ${topbar(true)}
    <h2 class="title dex-title">${ic('ic_dex', '')}랑방 도감</h2>
    <div class="tabs"><button class="${tab === 'hero' ? 'on' : ''}" data-act="dexTab" data-tab="hero">${ic('ic_party', '')} 모임 ${nH}/${DEX_HEROES().length}</button><button class="${tab === 'enemy' ? 'on' : ''}" data-act="dexTab" data-tab="enemy">${ic('ic_jinsang', '')} 진상 ${nE}/${DEX_ENEMIES().length}</button><button data-act="dexTab" data-tab="item">${ic('ic_bag', '')} 아이템 ${gearDexN()}/${GEAR_IDS.length + MYTH_IDS.length}</button></div>
    ${dexCatChips(kind)}
    <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>${tab === 'hero' ? (app.dexRole && app.dexRole !== 'all' && HERO_ROLES[app.dexRole] ? esc(HERO_ROLES[app.dexRole].desc) : '눌러서 멤버 소개 보기 · 옆으로 밀면 다음 멤버') : '만나 본 진상만 기록돼요 · 눌러서 약점 확인! · 떼거리엔 범위 공격 · 정예엔 한 방 공격'}</span></p>
    <div class="dex-grid v2">${cards || '<p class="sub">이 분류엔 아직 없어요</p>'}</div>
  `, 'dim');
}
function dexPageHtml(kind, id, form, duo) {
  const d = kind === 'hero' ? HEROES[id] : ENEMIES[id];
  const ok = dexKnown(kind, id);
  const list = dexList(kind), i = list.indexOf(id);
  const col = dexColor(kind, d), ch = dexChapter(kind, id);
  const anim = ok ? dexAnim(kind, d, id) : '';
  const fxKey = anim.split(' ')[0];
  const alts = ok && DEX_ALT[d.base || id] && !d.fuse ? [d.base || id, ...DEX_ALT[d.base || id]] : null;
  const cur = form || (alts ? alts[0] : null);
  const rage = cur === 'eunok_rage' ? ' rage' : '';
  let plate, body;
  if (!ok) {
    plate = `<div class="dp-plate"><small>${ic('lock', '', 'sm')}${kind === 'hero' ? '아직 합류하지 않은 멤버' : '아직 만나지 못한 진상'}</small></div>`;
    body = `<p class="dp-flavor">${kind === 'hero' ? '아직 합류하지 않은 멤버예요' : '아직 만나지 못한 진상이에요'}</p>
 <section><h4>${ic('unlock', '', 'sm')} 만나는 법</h4><p>${esc(kind === 'hero' ? heroHow(id) : (firstStageOf(id) ? `${stageLabel(firstStageOf(id))} 부터 나와요` : '무한 도전에서 나와요'))}</p></section>`;
  } else if (kind === 'hero') {
    const t = heroTier(id), sk = d.skill, rg = Array.isArray(d.range) ? d.range[0] : d.range;
    const meta = (P().heroes || {})[id] || 0, st = L.heroStar(P(), id);
    plate = `<div class="dp-plate"><small>${esc(d.role)}</small>
      <div class="dp-star">${'★'.repeat(st)}<i>${'★'.repeat(L.STAR_MAX - st)}</i>${meta ? ` · 강화 +${meta}` : ''} · 기본 ×${tierPower(t, 0).toFixed(2)}</div></div>`;
    body = `<p class="dp-flavor">“${esc(FLAVOR[id] || DEX_FLAVOR[id] || d.desc.replace(/^"|"$/g, ""))}”</p>
      <div class="sbars">${bar('사거리', rg / 620)}${bar('공격 속도', 0.42 / d.interval)}${bar('한 방', d.dmg / 62)}</div>
 <section><h4>${ic('swords', '', 'sm')} 기본 공격</h4><p>${esc(d.attack || d.desc)}</p></section>
      ${sk ? `<section><h4>${ic('sparkle', '', 'sm')}스킬 · ${esc(sk.name)} <span class="rg">쿨 ${sk.cd}초${sk.target ? ' · 찍어서 사용' : ''}</span></h4><p>${esc(sk.desc)}</p>${SKILL_EVO[id] ? `<p class="evo">${ic('star_gold', '', 'sm')}진화 카드: <b>${esc(SKILL_EVO[id])}</b></p>` : ''}</section>` : ''}
      ${d.perks ? `<section><h4>${ic('chart', '', 'sm')}성장</h4><p>Lv3 ${esc(d.perks[3])}</p><p>Lv5 ${esc(d.perks[5])}</p></section>` : ''}
 <section><h4>${ic('scale', '', 'sm')} 상성</h4><p>${attrTag(d.attr)} ${esc(strongWeak(d.attr))}</p></section>
 <section><h4>${ic('prism', '', 'sm')} 신화장비</h4>${sigRowHtml(id)}</section>
 <section><h4>${ic('pin', '', 'sm')} 합류</h4><p>${esc(heroHow(id))}</p></section>`;
  } else {
    const fs = firstStageOf(id);
    const tipId = ENEMY_TIPS[id] ? id : d.base || (d.fuse && d.fuse[0]) || id;
    const good = Object.keys(ATTRS).filter((a) => typeMul(a, d.cls) > 1).map((a) => attrIco(a) + ATTRS[a].name);
    const bad = Object.keys(ATTRS).filter((a) => typeMul(a, d.cls) < 1).map((a) => attrIco(a) + ATTRS[a].name);
    const flav = FLAVOR[id] || DEX_FLAVOR[id] || (d.fuse ? `${ENEMIES[d.fuse[0]].name} + ${ENEMIES[d.fuse[1]].name} 이 합체했다! 두 진상의 기술을 모두 쓴다.` : d.base ? `평범한 ${ENEMIES[d.base].name} 이 각성했다! 훨씬 크고 단단하다.` : '');
    const shout = (d.shouts || []).slice(0, 2).map((s) => `“${esc(s)}”`).join(' ');
    plate = `<div class="dp-plate"><small>${d.mid ? `중간 보스 · ${d.fuse ? '합체' : '각성'} · ` : d.boss ? '보스 · ' : ''}${shout || esc(CLASSES[d.cls].name)}</small></div>`;
    body = `<p class="dp-flavor">“${esc(flav)}”</p>
      <div class="sbars">${bar('체력', Math.log10(d.hp) / Math.log10(4000))}${bar('속도', d.speed / 95)}${bar('입구 피해', d.atk / 36)}</div>
      ${d.traits ? `<div class="dp-sec"><b>${ic('target', '', 'sm')}특성</b>${Object.keys(d.traits).filter((k) => TRAITS[k]).map((k) => `<p>${TRAITS[k].icon} <b>${esc(TRAITS[k].name)}</b> — ${esc(TRAITS[k].tip)} <small>추천: ${TRAITS[k].counter.filter((h) => HEROES[h]).map((h) => esc(heroNm(h))).join('·')}</small></p>`).join('')}</div>` : ''}
 <section><h4> 특징</h4>${(d.fuse ? d.fuse : [tipId]).map((t) => `<p>${d.fuse ? `<b>${esc(ENEMIES[t].name)}</b> · ` : ''}${esc(ENEMY_TIPS[t] || '')}</p>`).join('')}</section>
 <section><h4>${ic('scale', '', 'sm')} 상성</h4><p>잘 먹힘 ${good.join(' ')} <span class="rg">×${TYPE_STRONG}</span></p><p>안 먹힘 ${bad.join(' ')} <span class="rg">×${TYPE_WEAK}</span></p></section>
 <section><h4>${ic('pin', '', 'sm')} 등장</h4><p>${fs ? `${stageLabel(fs)} 부터` : '무한 도전'}${d.boss ? ' · 보스' : d.mid ? ' · 3웨이브 중간 보스' : ''}</p></section>`;
  }
  // 뽑기 캐릭터 카드 느낌: NO. 번호 · 대각선 두 색 배경 · 큰 전신 그림 · 세로 영문 이름 · 오른쪽 아래 큰 이름
  const hero = kind === 'hero';
  const hqForm = hero && (!cur || cur === id) && !NO_HQ_ART.has(id);
  const art = hero && (hqForm || (duo && hasDuo(id) && ok))
    ? (duo
      // 두 모습 그림(가로, dexhq/<id>_duo) — 없으면 한 장으로
      ? `<img class="dx-art hq duo" src="/img/lb/dexhq/${id}_duo.webp" alt="" draggable="false" onerror="this.onerror=null;this.classList.remove('duo');this.src='/img/lb/dexhq/${id}.webp'">`
      : hasDuo(id) && ok && (!cur || cur === id)
        ? `<span class="dx-swap"><img class="dx-art hq half ha" src="/img/lb/dexhq/${id}_duo.webp" alt="" draggable="false" onerror="this.parentNode.outerHTML='<img class=&quot;dx-art hq&quot; src=&quot;/img/lb/dexhq/${id}.webp&quot; alt=&quot;&quot;>'"><img class="dx-art hq half hb" src="/img/lb/dexhq/${id}_duo.webp" alt="" draggable="false"></span>`
        : `<img class="dx-art hq" src="/img/lb/dexhq/${id}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='/img/lb/dex/${id}.webp';var c=this.closest('.gc');if(c)c.classList.add('nohq')">`)
    : dexArt(d, id, cur);
  const fb = DEX_FACE[id] || [0.48, 0.09, 0.15];
  const faces = ''; // 얼굴 확대 칸은 없앴다 (멤버마다 들쭉날쭉 · 주먹·병이 잘려 '컵 두 개'처럼 보였다) — 큰 그림이 그 자리까지 채운다
  const badges = hero ? `<i class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]}</i>${roleChip(id)}${attrTag(d.attr)}` : `${d.boss ? '<i class="dxb bs">보스</i>' : d.mid ? `<i class="dxb md">${d.fuse ? '합체' : '각성'}</i>` : ''}${clsTag(d.cls)}`;
  const en = ok ? (hero ? DEX_EN[id] || id.toUpperCase() : id.replace(/^(boss|mid|fuse)_/, '').replace(/_/g, ' ').toUpperCase()) : '? ? ?';
  return `<div class="dp-bg" style="background-image:url('/img/lb/${ch === 1 ? 'bg' : 'bg' + ch}.webp')"></div><div class="dp-grad"></div>
    <div class="dp-top"><button class="dp-x" data-dp="x">✕</button><span>${i + 1} / ${list.length}</span></div>
    <div class="gc ${hero ? 'hero' : 'foe'} ${hqForm ? '' : 'nohq'} ${duo ? 'isduo' : ''}">
      <span class="gc-bg"></span><span class="gc-dots"></span>
      <div class="gc-no"><small>NO.</small><b>${String(i + 1).padStart(2, '0')}</b></div>
      <div class="gc-badges">${ok ? badges : ''}</div>
      ${faces}
      <div class="dp-stage ${ok ? 'anim-' + anim.replace(' ', ' anim-') : 'lock'}${rage}" ${alts ? 'data-dp="form"' : ''}>
        <span class="dp-glow"></span><span class="dp-shadow"></span>
        <span class="dp-pic">${art}</span>
        ${ok && DEX_FX[fxKey] ? `<span class="dp-fx">${DEX_FX[fxKey]()}</span>` : ''}
        ${alts ? `<span class="dp-form">${ic('tap', '', 'sm')}${esc(DEX_FORM[cur] || '')} <small>눌러서 변신</small></span>` : ''}
      </div>
      ${ok ? igChip(inGameSprites(hero ? 'hero' : 'enemy', id, d)) : ''}
      ${hero && ok && hasDuo(id) ? `<button class="gc-duo" data-dp="duo" hidden>${duo ? '한 명만' : '두 모습 보기'}</button><img class="gc-probe" src="/img/lb/dexhq/${id}_duo.webp" alt="" hidden onload="var b=this.parentNode.querySelector('.gc-duo');if(b)b.hidden=false">` : ''}
      <div class="gc-en">${esc(en)}</div>
      <div class="gc-name"><b>${ok ? esc(d.name) : '???'}</b></div>
    </div>
    <button class="dp-nav l" data-dp="prev" ${i <= 0 ? 'disabled' : ''}>‹</button><button class="dp-nav r" data-dp="next" ${i >= list.length - 1 ? 'disabled' : ''}>›</button>
    ${plate}<div class="dp-body">${body}</div>`;
}
function showDexCard(kind, id) {
  const d = kind === 'hero' ? HEROES[id] : ENEMIES[id];
  if (!d) return;
  closeInfoCard();
  const box = document.createElement('div');
  box.className = 'info-modal dexpage';
  const st = { kind, id, form: null, duo: false }; // 세로 카드엔 한 장 그림이 크게 · 두 모습은 버튼으로
  const draw = (dir = 0) => {
    const dd = st.kind === 'hero' ? HEROES[st.id] : ENEMIES[st.id];
    box.style.setProperty('--c', dexColor(st.kind, dd));
    box.innerHTML = dexPageHtml(st.kind, st.id, st.form, st.duo);
    if (dir) { box.classList.remove('in-l', 'in-r'); void box.offsetWidth; box.classList.add(dir > 0 ? 'in-r' : 'in-l'); }
    if (dexKnown(st.kind, st.id)) markViewed([(st.kind === 'hero' ? 'h:' : 'e:') + st.id]);
  };
  const go = (dir) => {
    const list = dexList(st.kind), j = list.indexOf(st.id) + dir;
    if (j < 0 || j >= list.length) return;
    st.id = list[j]; st.form = null; st.duo = false;
    A.sfx.card();
    draw(dir);
  };
  const close = () => { box.remove(); if (app.screen === 'dex') showDex(); };
  draw();
  stage.appendChild(box);
  box.addEventListener('click', (ev) => {
    if (box.dataset.swiped) return;
    const b = ev.target.closest('[data-dp]');
    if (!b) return;
    const a = b.dataset.dp;
    if (a === 'x') close();
    else if (a === 'prev') go(-1);
    else if (a === 'next') go(1);
    else if (a === 'duo') { st.duo = !st.duo; st.form = null; A.sfx.tap(); draw(); }
    else if (a === 'form') {
      const dd = st.kind === 'hero' ? HEROES[st.id] : ENEMIES[st.id];
      const base = dd.base || st.id, forms = [base, ...DEX_ALT[base]];
      st.form = forms[(forms.indexOf(st.form || base) + 1) % forms.length];
      A.sfx.tap();
      draw();
      const s2 = box.querySelector('.dp-stage');
      if (s2) s2.classList.add('pop');
    }
  });
  // 옆으로 밀어서 다음/이전 캐릭터
  let sw = null;
  box.addEventListener('pointerdown', (ev) => { sw = { x: ev.clientX, y: ev.clientY }; });
  box.addEventListener('pointerup', (ev) => {
    if (!sw) return;
    const dx = ev.clientX - sw.x, dy = ev.clientY - sw.y;
    sw = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      box.dataset.swiped = '1'; setTimeout(() => { delete box.dataset.swiped; }, 60);
      go(dx < 0 ? 1 : -1);
    }
  });
  box.addEventListener('pointercancel', () => { sw = null; });
  A.sfx.tap();
}

// ─── 장비 ────────────────────────────────────────────
// 장비 아이콘: 그린 그림 (없으면 이모지) + 등급 색 테두리 · 빛
const isSig = (t) => !!(GEAR[t] && GEAR[t].hero);
// 전용 신화 그림: gear/myth_<멤버>.webp 가 생기기 전엔 멤버 얼굴 그림 (data.js SIG_ART_TODO)
const gearIco = (it) => `<i class="gico r-${it.r || 'common'} ${isSig(it.t) ? 'sig' : ''}" style="--rc:${isSig(it.t) ? SIG_COLOR : (GEAR_RARITY[it.r] || GEAR_RARITY.common).color}"><img src="${GEAR[it.t].img}" alt="" draggable="false" ${isSig(it.t) ? `class="sig-face" onerror="this.onerror=null;this.src='${HEROES[GEAR[it.t].hero].img}'"` : `onerror="this.replaceWith(document.createTextNode('${GEAR[it.t].icon}'))"`}></i>`;
const SIG_COLOR = '#ff4fd8';
const gearName = (it) => `${GEAR[it.t].icon} ${GEAR[it.t].name}${it.lv ? ` +${it.lv}` : ''}`;
function gearStatText(it) {
  const g = GEAR[it.t];
  if (g.hero) return `${HEROES[g.hero].name} 전용 · ${g.desc}`;
  if (g.myth) return g.desc;
  return `${GEAR_STATS[g.stat].name} +${(gearValue(it.t, it.r, it.lv) * 100).toFixed(1)}%`;
}
function equippedBy(p, gid) { for (const [h, sl] of Object.entries(p.equip || {})) for (const k of ['w', 'a', 'm']) if (sl[k] === gid) return h; return null; }
function gearTabHtml() {
  const p = P();
  const heroes = owned();
  const find = (gid) => (p.gear || []).find((x) => x.id === gid);
  const rows = heroes.map((id) => {
    const d = HEROES[id];
    const sl = (p.equip || {})[id] || {};
    const cell = (k) => { const it = find(sl[k]); return `<button class="gslot ${it ? 'r-' + it.r : 'empty'}" data-act="gearSlot" data-hero="${id}" data-slot="${k}" ${it ? `style="--rc:${GEAR_RARITY[it.r].color}"` : ''}>${it ? `${gearIco(it)}<small>${it.lv ? '+' + it.lv : ''}</small>` : `<i>${k === 'w' ? '' : ''}</i>`}</button>`; };
    return `<div class="grow">${av(d)}<b>${d.name}</b>${cell('w')}${cell('a')}</div>`;
  }).join('');
  const bag = (p.gear || []).slice().sort((a, b) => GEAR_RARITY[b.r].mul - GEAR_RARITY[a.r].mul || b.lv - a.lv).map((it) => {
    const eq = equippedBy(p, it.id);
    return `<button class="gitem" data-act="gearItem" data-id="${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${gearIco(it)}${it.lv ? `<small class="lv">+${it.lv}</small>` : ''}${eq ? `<small class="eq">${HEROES[eq].name}</small>` : ''}</button>`;
  }).join('');
  return `<div class="gear-heroes">${rows}</div><h3 class="sec">가방</h3><div class="gear-bag">${bag || '<p class="sub">아직 장비가 없어요 — 스테이지를 깨 봐요!</p>'}</div>`;
}
function gearModal(html) {
  closeInfoCard();
  const box = document.createElement('div');
  box.className = 'info-modal';
  box.innerHTML = `<div class="info-card gear-card">${html}<button class="btn ghost" data-ic="x">닫기</button></div>`;
  stage.appendChild(box);
  box.addEventListener('click', async (ev) => {
    if (ev.target === box || ev.target.closest('[data-ic]')) { closeInfoCard(); return; }
    const b = ev.target.closest('[data-g]');
    if (!b || b.disabled) return;
    b.disabled = true;
    const [act, a1, a2, a3] = b.dataset.g.split(':');
    if (act === 'help') { b.disabled = false; ACTS.statHelp(); return; }
    let r;
    if (act === 'equip') r = await API.equipGear(a1, a2, a3 === 'x' ? null : Number(a3), app.guest);
    else if (act === 'enh') r = await API.enhanceGear(Number(a1), app.guest);
    else if (act === 'dis') { if (!(await confirmBox({ title: '이 장비를 분해할까요?', sub: '강화석으로 바뀌어요 · 되돌릴 수 없어요', ok: '분해', cancel: '취소', danger: true }))) { b.disabled = false; return; } r = await API.dismantleGear([Number(a1)], app.guest); if (r && r.ok) { closeInfoCard(); toast(`강화석 +${r.stones}`); refreshBehind(); return; } }
    else if (act === 'sell') { if (!(await confirmBox({ title: '이 장비를 팔까요?', ok: '팔기', cancel: '취소', danger: true }))) { b.disabled = false; return; } r = await API.sellGear(Number(a1), app.guest); }
    else if (act === 'lock') { const set = gearLocked(); const id = Number(a1); if (set.has(id)) set.delete(id); else set.add(id); lsSave('langbang:gearLock', set); closeInfoCard(); showGearCard(id); refreshBehind(); return; }
    if (r && r.ok && r.profile && act === 'enh') {
      // 강화: 망치 번쩍 → 성공(금빛) / 실패(회색, 장비는 그대로)
      app.profile = r.profile;
      const card = box.querySelector('.info-card');
      if (card) { card.classList.remove('enh-ok', 'enh-no'); void card.offsetWidth; card.classList.add(r.success === false ? 'enh-no' : 'enh-ok'); }
      if (r.success === false) { A.sfx.tap(); toast(`강화 실패… 비용만 들었어요 (장비는 그대로 · 성공 확률 ${Math.round((r.chance || 0) * 100)}%)`, 1800); }
      else { A.sfx.levelUp(); fx.flash('#ffd23f', 0.2); toast(`+${r.lv || ''} 강화 성공!`, 1400); }
      await sleep(550);
    } else if (r && r.ok && r.profile) { app.profile = r.profile; A.sfx.levelUp(); toast(act === 'sell' ? `+${r.sold} 코인` : '장착!', 1200); }
    else if (r) toast(r.message || '못 했어요');
    closeInfoCard();
    refresh();
    if (act === 'enh' && r && r.ok) showGearCard(Number(a1));
  });
  A.sfx.tap();
}
function showGearPicker(hero, slot) {
  const p = P();
  const cur = ((p.equip || {})[hero] || {})[slot];
  const list = (p.gear || []).filter((x) => GEAR[x.t].slot === slot && gearFits(x.t, hero)).sort((a, b) => gearValue(b.t, b.r, b.lv) * GEAR_RARITY[b.r].mul - gearValue(a.t, a.r, a.lv) * GEAR_RARITY[a.r].mul);
  const rows = list.map((it) => `<button class="gpick ${it.id === cur ? 'on' : ''}" data-g="equip:${hero}:${slot}:${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${gearName(it)}<small>${GEAR_RARITY[it.r].name} · ${esc(gearStatText(it))}${equippedBy(p, it.id) && equippedBy(p, it.id) !== hero ? ` · ${HEROES[equippedBy(p, it.id)].name}` : ''}</small></button>`).join('');
  gearModal(`<div class="ih"><b>${HEROES[hero].name} · ${slot === 'w' ? '무기' : '액세서리'}</b></div>
    <div class="gpick-list">${rows || '<p class="sub">이 칸에 낄 장비가 없어요</p>'}</div>
    ${cur ? `<button class="btn" data-g="equip:${hero}:${slot}:x">빼기</button>` : ''}`);
}

// ─── 가방 (장비 화면): 위 = 멤버 + 무기/액세서리 칸 + 능력치, 아래 = 가방 격자 ─────
const GEAR_W = { atk: 1, spd: 1, crit: 1.3, skill: 0.6, cd: 0.7, attr: 0.8, strip: 0.4, hp: 0.6, range: 0.7 };
// 멤버 전투력: 기본 초당 피해 × 티어·강화 × ★ × 장비 — 화면에 보여 주는 숫자 (대략적인 세기)
// 전투에서 실제로 쓰는 값 (sim 그대로): 한 방 피해 · 초당 공격 — 강화 화면 "지금 → 다음" 표시용
function heroLive(p, id, metaLv) {
  const g = S.createGame({ H: 760, noWaves: true, heroes: [id], tempo: true, meta: { [id]: metaLv }, stars: p.hstars || {}, gear: API.gearFor(p, [id]), rng: () => 0.5, awake: TWUI ? TWUI.awake(p) : {} });
  const h = g.heroes[0];
  return { dmg: S.heroDamage(g, h), aps: 1 / S.heroInterval(g, h) };
}
function heroPower(p, id) {
  const d = HEROES[id];
  if (!d) return 0;
  const st = heroGearStats(p, id);
  const base = (d.dmg / d.interval) * tierPower(heroTier(id), (p.heroes || {})[id] | 0) * (1 + L.STAR_ATK * (L.heroStar(p, id) - 1));
  return Math.round(base * (1 + (st.atk || 0)) * (1 + (st.spd || 0)) * (1 + (st.skill || 0) * 0.3) * (sigOn(p, id) ? 1.25 : 1) * 10); // 전용 신화 새 효과 ≈ +25%
}
// 이 멤버가 자기 전용 신화를 끼고 있나
function sigOn(p, id) { const gid = ((p.equip || {})[id] || {}).m; const it = gid && (p.gear || []).find((g) => g.id === gid); return !!(it && GEAR[it.t] && GEAR[it.t].hero === id); }
const sigHave = (p, id) => (p.gear || []).some((g) => g.t === 'sig_' + id);
const deckPower = (p, ids) => ids.reduce((a, id) => a + heroPower(p, id), 0);
const gearScore = (it) => (isSig(it.t) ? 1 : gearValue(it.t, it.r, it.lv) * (GEAR_W[GEAR[it.t].stat] || 0.5)); // 전용 신화: 그 멤버에겐 늘 제일 좋은 것
function lsSet(key) { try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); } }
function lsSave(key, set) { try { localStorage.setItem(key, JSON.stringify([...set].slice(-400))); } catch { /* 무시 */ } }
const gearLocked = () => lsSet('langbang:gearLock');
function gearSeenMax() { try { return Number(localStorage.getItem('langbang:gearSeen') || 0); } catch { return 0; } }
function bagHero() {
  const list = owned();
  if (!app.bagHero || !list.includes(app.bagHero)) app.bagHero = curDeck().find(Boolean) || list[0];
  return app.bagHero;
}
function heroGearStats(p, id) {
  const sl = (p.equip || {})[id] || {};
  return gearStats(['w', 'a', 'm'].map((k) => (p.gear || []).find((g) => g.id === sl[k])).filter((g) => g && gearFits(g.t, id)));
}
function statLines(st) {
  const ks = Object.keys(st);
  return ks.length ? ks.map((k) => `<span>${GEAR_STATS[k].name} <b>+${(st[k] * 100).toFixed(1)}%</b></span>`).join('') : '<span class="dimtxt">장비 효과 없음</span>';
}
function showBag() {
  app.screen = 'bag';
  hud.hidden = true;
  const p = P();
  const tab = app.bagTab || 'over';
  if (tab === 'fuse' && !app.fuse) app.fuse = [];
  if (tab !== 'fuse' && app.fuse) app.fuse = null;
  if (tab !== 'bag' && app.bulk) app.bulk = null;
  const filt = app.bagFilter || 'all', sort = app.bagSort || 'r';
  const locks = gearLocked();
  const seenMax = gearSeenMax();
  const SORT = {
    r: (a, b) => GEAR_RARITY[b.r].mul - GEAR_RARITY[a.r].mul || b.lv - a.lv || b.id - a.id,
    lv: (a, b) => b.lv - a.lv || GEAR_RARITY[b.r].mul - GEAR_RARITY[a.r].mul || b.id - a.id,
    t: (a, b) => (GEAR[a.t].slot === GEAR[b.t].slot ? 0 : GEAR[a.t].slot === 'w' ? -1 : 1) || a.t.localeCompare(b.t) || GEAR_RARITY[b.r].mul - GEAR_RARITY[a.r].mul || b.lv - a.lv,
    new: (a, b) => b.id - a.id,
  };
  const deckSet = new Set((curDeck() || []).filter(Boolean));
  const list = (p.gear || []).filter((it) => filt === 'all' || (filt === 'free' ? !equippedBy(p, it.id) : filt === 'worn' ? !!equippedBy(p, it.id) : filt === 'deckworn' ? deckSet.has(equippedBy(p, it.id)) : GEAR[it.t].slot === filt)).slice().sort(SORT[sort] || SORT.r);
  const cells = list.map((it) => {
    const eq = equippedBy(p, it.id);
    const bulkOn = (app.bulk && app.bulk.has(it.id)) || (app.fuse && app.fuse.includes(it.id)), bulkNo = (app.bulk || app.fuse) && (eq || locks.has(it.id) || (app.fuse && (it.r === 'legend' || it.r === 'myth' || (app.fuse.length && fuseRarity(p) !== it.r))));
    return `<button class="bitem v2 r-${it.r} ${app.bulk || app.fuse ? 'bulk' : ''} ${bulkOn ? 'chk' : ''} ${bulkNo ? 'nosel' : ''}" data-act="${app.bulk ? 'bulkPick' : app.fuse ? 'fusePick' : 'bagPick'}" data-id="${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">
      <span class="bi-ico">${gIco(it)}</span>${it.lv ? `<em class="bi-lv">+${it.lv}</em>` : ''}${it.id > seenMax ? '<i class="bi-new">N</i>' : ''}${locks.has(it.id) ? '<i class="bi-lock"></i>' : ''}
      <b class="bi-name">${esc(GEAR[it.t].name)}</b>${eq ? `<span class="bi-eq" title="${esc(HEROES[eq].name)}">${av(HEROES[eq])}</span>` : ''}</button>`;
  }).join('');
  const maxId = Math.max(0, ...(p.gear || []).map((x) => x.id));
  const deckIds = [...new Set([...(curDeck() || []).filter(Boolean)])];
  const rows = (app.bagAll ? owned() : deckIds.length ? deckIds : owned().slice(0, 4)).map((h) => eqRowHtml(p, h)).join('');
  const tabs = `<div class="seg bag-seg">${[['over', '장비'], ['bag', `가방 ${(p.gear || []).length}/80`], ['cons', '소모품'], ['fuse', '합성']].map(([k, n]) => `<button class="${tab === k ? 'on' : ''}" data-act="bagTab" data-v="${k}">${n}</button>`).join('')}</div>`;
  const tools = `<div class="bag-tools"><div class="chips">${[['all', '전체'], ['w', '무기'], ['a', '장신구'], ['worn', '착용 중'], ['free', '미착용'], ['deckworn', '출전 멤버 착용']].map(([k, n]) => `<button class="chip ${filt === k ? 'on' : ''}" data-act="bagFilter" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="chips sort">${[['r', '등급'], ['lv', '강화'], ['t', '종류'], ['new', '최근']].map(([k, n]) => `<button class="chip mini ${sort === k ? 'on' : ''}" data-act="bagSortV" data-v="${k}">${n}</button>`).join('')}</div></div>`;
  const grid = `<div class="bag-grid v2">${cells || `<div class="empty-state"><span>${ic('bag', '', 'sm')}</span><b>${filt === 'all' ? '아직 장비가 없어요' : '이 조건에 맞는 장비가 없어요'}</b><small>스테이지를 깨면 장비가 떨어져요</small></div>`}</div>`;
  let body;
  if (tab === 'over') {
    body = equipTabHtml(p);
  } else if (tab === 'overOld') {
    body = `<div class="eq-over v2"><div class="eq-head"><span class="eq-scope">${app.bagAll ? '가진 멤버 전부' : '지금 덱'}</span><button class="chip" data-act="bagAll">${app.bagAll ? '덱만 보기' : '전부 보기'}</button></div>
      <div class="eq-rows">${rows}</div>
 <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>칸을 누르면 끼울 장비를 골라요 · ${ic('gem', '', 'sm')} 강화석 <b>${p.stones | 0}</b></span></p></div>`;
  } else if (tab === 'cons') {
    body = `<div class="cons-inv">${L.CONS_IDS.map((id) => { const c = L.CONS[id], n = (p.cons || {})[id] | 0; if (c.hidden && !(p.consDex || []).includes(id) && !n) return `<div class="ci-row none" style="--rc:#4a3f60">${consIc(id, 'sil')}<span><b>???</b><small>${esc(c.tip)}</small><small class="ci-tip">${esc(c.hint || '')}</small></span></div>`; return `<div class="ci-row ${n ? '' : 'none'}" style="--rc:${CONS_RC[c.rarity]}">${consIc(id)}<span><b>${esc(c.name)} <em>×${n}</em></b><small>${esc(c.desc)}</small><small class="ci-tip">${esc(c.tip)}</small></span></div>`; }).join('')}</div><p class="sub tipbar">${ic('bulb', '', 'sm')}<span>출전 화면 소모품 칸에 넣어 가면 전투 중에 눌러 써요 · 칸마다 판에 한 번</span></p>`;
  } else if (tab === 'bag') {
    body = `${tools}${app.bulk ? bulkBarHtml(p, locks) : ''}${grid}`;
  } else {
    body = `${fuseBarHtml(p)}${tools}${grid}`;
  }
  const actions = tab === 'fuse' || tab === 'cons' ? '' : `<div class="bag-actions">${tab === 'bag' && !app.bulk ? '<button class="btn" data-act="bulkOn">일괄 판매·분해</button>' : ''}<button class="btn primary" data-act="autoEquipAll">${ic('sparkle', '', 'sm')} ${tab === 'over' ? '출전 멤버 우선 자동 장착' : '자동 장착'}</button></div>`;
  show(`
    ${subTop('강화·장비')}
    ${tabs}
    ${body}
    ${actions}
    ${navHtml('bag')}
  `, 'dim withnav bag-screen v2');
  runRolls();
  if (app.flyTo) { const f = app.flyTo; app.flyTo = null; flyIcon(f); }
  if (maxId > seenMax) setTimeout(() => { try { localStorage.setItem('langbang:gearSeen', String(maxId)); } catch { /* 무시 */ } }, 1500);
}
// 장비 상세: 지금 고른 멤버 기준으로 끼면 어떻게 바뀌는지 미리 보기
// 장비 한눈에 한 줄: 그림 카드(작게) · 이름 · 전투력 · 무기/장신구 칸 (+N) · 더 좋은 장비가 있으면 빨간 점
// 일괄 판매: 체크 · 빠른 선택 · 합계 → 확인 → 한 번에 (장착 중 · 🔒잠금은 못 고름)
function bulkSellable(p, locks) { return (p.gear || []).filter((it) => !equippedBy(p, it.id) && !locks.has(it.id)); }
function bulkBarHtml(p, locks) {
  const ids = [...app.bulk];
  const v = (p.gear || []).filter((g) => app.bulk.has(g.id)).reduce((a, it) => a + gearSellValue(it.r, it.lv), 0);
  return `<div class="bulk-bar">
    <div class="chips">${[['common', '일반 전부'], ['rare', '희귀 이하'], ['free', '장착 안 한 것만'], ['dup', '중복만'], ['none', '선택 해제']].map(([k, n]) => `<button class="chip" data-act="bulkQuick" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="bulk-go"><button class="btn ghost" data-act="bulkOff">취소</button><button class="btn ${ids.length ? 'pink' : ''}" data-act="bulkSell" ${ids.length ? '' : 'disabled'}>${ic('broom', '', 'sm')}${ids.length}개 팔기 · <i class="ci"></i>${fmt(v)}</button><button class="btn ${ids.length ? '' : ''}" data-act="bulkDis" ${ids.length ? '' : 'disabled'}>${ic('gem', '', 'sm')}분해 +${(p.gear || []).filter((g) => app.bulk.has(g.id)).reduce((a, it) => a + gearDismantle(it.r, it.lv), 0)}</button></div>
 <small class="bulk-note">장착 중 · ${ic('lock', '', 'sm')}잠금 장비는 고를 수 없어요</small></div>`;
}
// 합성: 같은 등급 3개 → 다음 등급 1개 (셋 다 같은 종류면 그 종류) · 가장 높은 강화 -2 이어 받기 · 수수료
function fuseRarity(p) { const it = (p.gear || []).find((g) => app.fuse && app.fuse[0] === g.id); return it ? it.r : null; }
function fuseBarHtml(p) {
  const list = app.fuse.map((id) => (p.gear || []).find((g) => g.id === id)).filter(Boolean);
  const r0 = list[0] && list[0].r, r1 = r0 && GEAR_NEXT[r0];
  const fee = r1 ? GEAR_FUSE_FEE[r1] : 0, free = p.master && !p.testNormal;
  const same = list.length === 3 && list.every((it) => it.t === list[0].t);
  const lv = list.length ? Math.max(0, Math.max(...list.map((it) => it.lv)) - 2) : 0;
  return `<div class="bulk-bar fuse-bar">
 <b>${ic('flask', '', 'sm')} 합성</b> <small>같은 등급 3개 → 다음 등급 1개 · 셋 다 같은 종류면 그 종류 · 가장 높은 강화 -2 를 이어 받아요</small>
 <div class="fuse-slots">${[0, 1, 2].map((i) => { const it = list[i]; return `<span class="fz ${it ? 'r-' + it.r : ''}" style="--rc:${it ? GEAR_RARITY[it.r].color : '#444'}">${it ? gearIco(it) + (it.lv ? `<small>+${it.lv}</small>` : '') : '+'}</span>`; }).join('<i>+</i>')}<i>→</i><span class="fz out" style="--rc:${r1 ? GEAR_RARITY[r1].color : '#444'}">${r1 ? `<b>${GEAR_RARITY[r1].name}</b><small>${same ? esc(GEAR[list[0].t].name) : '무작위'}${lv ? ` +${lv}` : ''}</small>` : '?'}</span></div>
    <div class="chips">${['common', 'rare', 'epic'].map((r) => `<button class="chip" data-act="fuseAuto" data-v="${r}">${GEAR_RARITY[r].name} 자동 채우기</button>`).join('')}</div>
    <div class="bulk-go"><button class="btn ghost" data-act="fuseOff">취소</button><button class="btn ${list.length === 3 ? 'pink' : ''}" data-act="fuseGo" ${list.length === 3 && (free || p.coins >= fee) ? '' : 'disabled'}>${ic('flask', '', 'sm')}합성${fee && !free ? ` · <i class="ci"></i>${fmt(fee)}` : ''}</button></div>
 <small class="bulk-note">장착 중 · ${ic('lock', '', 'sm')}잠금 · 전설 장비는 합성에 못 넣어요</small></div>`;
}
function eqRowHtml(p, h) {
  const d = HEROES[h];
  const sl = (p.equip || {})[h] || {};
  const find = (gid) => (p.gear || []).find((x) => x.id === gid);
  const better = (k) => { const cur = find(sl[k]); return (p.gear || []).some((it) => GEAR[it.t].slot === k && !equippedBy(p, it.id) && (!cur || gearScore(it) > gearScore(cur) + 1e-9)); };
  const slotB = (k) => { const it = find(sl[k]); return `<button class="eq-slot v2 ${it ? 'r-' + it.r : 'empty'}" data-act="eqSlot" data-hero="${h}" data-slot="${k}" style="--rc:${it ? GEAR_RARITY[it.r].color : '#4a4060'}">${it ? `<span class="es-ico">${gearIco(it)}</span><span class="es-t"><b>${esc(GEAR[it.t].name)}</b><small>${it.lv ? `+${it.lv} · ` : ''}${GEAR_RARITY[it.r].name}</small></span>` : `<span class="es-ico ph">${k === 'w' ? '' : ''}</span><span class="es-t"><b>${k === 'w' ? '무기' : '장신구'}</b><small>비어 있음</small></span>`}${better(k) ? '<i class="rd"></i>' : ''}</button>`; };
  return `<div class="eq-row" data-hero="${h}" style="--c:${ATTRS[d.attr].color}">
    ${artCard(h, { act: 'bagHeroPick', cls: 'mini' })}
    <div class="eq-mid"><b>${esc(d.name)}</b><small>${ic('swords', '', 'sm')}전투력 ${fmt(heroPower(p, h))}</small></div>
    ${slotB('w')}${slotB('a')}</div>`;
}
async function equipTo(hero, slot, gid) {
  const it = (P().gear || []).find((x) => x.id === gid);
  if (!it) return;
  if (GEAR[it.t].slot !== slot) { toast(`${GEAR[it.t].slot === 'w' ? '무기' : '장신구'} 칸에만 낄 수 있어요`, 1400); return; }
  if (!gearFits(it.t, hero)) { toast(`${HEROES[GEAR[it.t].hero].name} 전용이에요`, 1400); return; }
  const r = await API.equipGear(hero, slot, gid, app.guest);
  if (r.ok && r.profile) { app.profile = r.profile; A.sfx.pick(); toast(`${HEROES[hero].name}에게 ${GEAR[it.t].name}!`, 1100); app.bagSel = null; }
  else toast(r.message || '못 끼웠어요');
  showBag();
}
// ─── 멤버 중심 장비 화면 ───
const gMaxed = (it) => it.r === 'myth' || (it.lv | 0) >= GEAR_MAX_LV;
const gIco = (it) => `<span class="gwrap ${gMaxed(it) ? 'gmax' : ''} ${it.r === 'myth' ? 'myth' : ''} ${isSig(it.t) ? 'sig' : ''}">${gearIco(it)}${gMaxed(it) ? `<i class="gmax-b">${isSig(it.t) ? '전용' : it.r === 'myth' ? '신화' : 'MAX'}</i>` : ''}</span>`;
// 이 장비를 끼면 그 멤버 전투력이 얼마가 되나 (다른 멤버가 끼고 있던 것도 옮겨 온다고 치고)
function powerWith(p, hero, slot, gid) {
  const eq = {};
  for (const [h, sl] of Object.entries(p.equip || {})) eq[h] = Object.assign({}, sl);
  for (const h of Object.keys(eq)) for (const k of ['w', 'a', 'm']) if (eq[h][k] === gid) delete eq[h][k];
  (eq[hero] = eq[hero] || {})[slot] = gid;
  if (gid === null) delete eq[hero][slot];
  return heroPower(Object.assign({}, p, { equip: eq }), hero);
}
function snapPow() { const p = P(), h = bagHero(); app.powPrev = { hero: h, v: heroPower(p, h) }; }
function equipTabHtml(p) {
  const deck = [...new Set((curDeck() || []).filter(Boolean))];
  const list = [...deck, ...owned().filter((x) => !deck.includes(x))];
  const sel = bagHero();
  const chips = list.map((id) => `<button class="eqh ${id === sel ? 'on' : ''}" data-act="bagHeroPick" data-id="${id}"><span class="eqh-face">${av(HEROES[id])}</span>${deck.includes(id) ? '<i class="eqh-go">출전</i>' : ''}<b>${esc(HEROES[id].name)}</b></button>`).join('');
  const pw = heroPower(p, sel);
  const prev = app.powPrev && app.powPrev.hero === sel ? app.powPrev.v : pw;
  const st = heroGearStats(p, sel);
  const sl = (p.equip || {})[sel] || {};
  const find = (gid) => (p.gear || []).find((x) => x.id === gid);
  const slot = (k) => {
    const it = find(sl[k]);
    const better = (p.gear || []).some((g) => GEAR[g.t].slot === k && gearFits(g.t, sel) && g.id !== sl[k] && powerWith(p, sel, k, g.id) > pw);
    return `<button class="eq-big ${it ? 'r-' + it.r : 'empty'}" data-act="eqOpen" data-hero="${sel}" data-slot="${k}" style="--rc:${it ? GEAR_RARITY[it.r].color : '#4a4060'}">
      <small class="eqb-k">${k === 'w' ? '무기' : k === 'a' ? '장신구' : '신화'}</small>${better ? '<i class="rd"></i>' : ''}
      ${it ? `${gIco(it)}<b>${esc(GEAR[it.t].name)}${it.lv ? ` <em>+${it.lv}</em>` : ''}</b><small>${esc(gearStatText(it))}</small>` : `<span class="eqb-plus">+</span><b>비어 있음</b><small>${k === 'm' ? '신화 장비 전용' : '눌러서 끼기'}</small>`}</button>`;
  };
  return `<div class="eqv3">
    <div class="eqh-row">${chips}</div>
    <div class="eq-hero" style="--c:${ATTRS[HEROES[sel].attr].color}">
      ${artCard(sel, { act: 'heroCard', cls: 'eq-port', face: [0.3, 0.3] })}
      <div class="eq-info"><b class="eq-nm">${esc(HEROES[sel].name)}</b>
        <div class="eq-pw">${ic('swords', '', 'sm')}<span>전투력</span><b class="roll" data-from="${prev}" data-to="${pw}">${fmt(prev)}</b></div>
        <div class="eq-st">${statLines(st)}</div>
        <button class="chip mini" data-act="eqUnall" data-hero="${sel}" ${sl.w || sl.a || sl.m ? '' : 'disabled'}>전체 해제</button></div>
    </div>
    <p class="sub eq-tip tipbar">${ic('bulb', '', 'sm')}<span>칸을 누르면 비교하며 골라요 · 다른 멤버 장비도 한 번에 "빼서 끼기"</span></p>
    <div class="eq-slots2">${slot('w')}${slot('a')}</div>
    <div class="eq-slots2 myth">${slot('m')}</div>
  </div>`;
}
// 칸 → 아래에서 올라오는 장비 고르기 (전투력 변화순 · 착용자 · 비교 · 장착/해제/강화/잠금)
function showEquipSheet(hero, slot, selId) {
  const p = P();
  const curId = ((p.equip || {})[hero] || {})[slot];
  const cur = (p.gear || []).find((x) => x.id === curId);
  const base = heroPower(p, hero);
  const rows = (p.gear || []).filter((it) => GEAR[it.t].slot === slot && gearFits(it.t, hero)).map((it) => ({ it, d: it.id === curId ? 0 : powerWith(p, hero, slot, it.id) - base, own: equippedBy(p, it.id) }))
    .sort((a, b) => (a.it.id === curId) - (b.it.id === curId) || b.d - a.d);
  const pick = rows.find((r) => r.it.id === selId) || rows.find((r) => r.it.id !== curId) || rows[0];
  app.eqSheet = { hero, slot, sel: pick ? pick.it.id : null };
  const locks = gearLocked();
  const diff = (d) => (d > 0 ? `<em class="up">▲ +${fmt(d)}</em>` : d < 0 ? `<em class="dn">▼ ${fmt(d)}</em>` : '<em class="eq0">—</em>');
  const side = (it, lab) => it ? `<div class="cmp-s" style="--rc:${GEAR_RARITY[it.r].color}"><small>${lab}</small>${gIco(it)}<b>${esc(GEAR[it.t].name)}${it.lv ? ` +${it.lv}` : ''}</b><span>${esc(gearStatText(it))}</span></div>` : `<div class="cmp-s empty"><small>${lab}</small><span class="eqb-plus">+</span><b>비어 있음</b></div>`;
  const s2 = pick && pick.it.id !== curId ? pick.it : null;
  const after = s2 ? powerWith(p, hero, slot, s2.id) : base;
  const owner = s2 && pick.own && pick.own !== hero ? pick.own : null;
  const tgt = s2 || cur;
  const free = p.master && !p.testNormal;
  const cost = tgt ? gearEnhanceCost(tgt.r, tgt.lv) : null;
  const canEnh = tgt && cost !== null && (free || (p.coins >= cost && (p.stones | 0) >= gearStoneNeed(tgt.lv)));
  popup(`<h3>${esc(HEROES[hero].name)} · ${slot === 'w' ? '무기' : slot === 'a' ? '장신구' : '신화'}</h3>
    <div class="cmp">${side(cur, '지금')}<div class="cmp-mid"><i>→</i><b>${fmt(base)}</b><b class="${after > base ? 'up' : after < base ? 'dn' : ''}">${fmt(after)}</b><small>전투력</small></div>${side(s2 || cur, s2 ? '고른 것' : '지금')}</div>
    <div class="cmp-btn">${s2 ? `<button class="btn primary" data-act="eqDo" data-id="${s2.id}">${owner ? '빼서 끼기' : '장착'}</button>` : ''}${cur ? '<button class="btn" data-act="eqOff">해제</button>' : ''}
      ${tgt ? `<button class="btn ${canEnh ? 'pink' : ''}" data-act="eqEnh" data-id="${tgt.id}" ${canEnh ? '' : 'disabled'}>${ic('hammer', '', 'sm')} ${cost === null ? 'MAX' : `+${tgt.lv + 1}`}${cost !== null && !free ? ` <small>${fmt(cost)}</small>` : ''}</button><button class="btn ghost" data-act="eqLock" data-id="${tgt.id}">${locks.has(tgt.id) ? '잠금 풀기' : '잠금'}</button>` : ''}</div>
    <div class="eqs-list">${rows.map((r) => `<button class="eqs ${pick && r.it.id === pick.it.id ? 'sel' : ''} ${r.it.id === curId ? 'cur' : ''}" data-act="eqSel" data-id="${r.it.id}" style="--rc:${GEAR_RARITY[r.it.r].color}">
      ${gIco(r.it)}<span class="eqs-t"><b>${esc(GEAR[r.it.t].name)}${r.it.lv ? ` <em>+${r.it.lv}</em>` : ''}${locks.has(r.it.id) ? ` ${ic('lock', '', 'sm')}` : ''}</b><small>${esc(gearStatText(r.it))}</small></span>
      ${r.it.id === curId ? '<i class="eqs-now">착용 중</i>' : r.own ? `<span class="eqs-own">${av(HEROES[r.own])}<small>${esc(HEROES[r.own].name)} 착용 중</small></span>` : ''}${r.it.id === curId ? '' : diff(r.d)}</button>`).join('') || '<p class="ip">이 칸에 낄 장비가 없어요 — 스테이지를 깨면 떨어져요</p>'}</div>`, 'pp-sheet eq-sheet');
}
async function equipMove(hero, slot, gid) {
  const p = P();
  const it = (p.gear || []).find((x) => x.id === gid);
  if (!it) return;
  const owner = equippedBy(p, gid);
  const prev = ((p.equip || {})[hero] || {})[slot];
  const from = document.querySelector('.eq-sheet .eqs.sel .gwrap');
  const rect = from ? from.getBoundingClientRect() : null;
  snapPow();
  const r = await API.equipGear(hero, slot, gid, app.guest);
  if (!(r && r.ok && r.profile)) { toast((r && r.message) || '못 끼웠어요'); return; }
  app.profile = r.profile;
  if (owner && owner !== hero && prev) { const r2 = await API.equipGear(owner, slot, prev, app.guest); if (r2 && r2.ok && r2.profile) app.profile = r2.profile; }
  A.sfx.pick();
  if (owner && owner !== hero) toast(`${HEROES[owner].name} → ${HEROES[hero].name}으로 이동${prev ? ' (서로 바꿈)' : ''}`, 1500);
  closeInfoCard();
  if (rect) app.flyTo = { rect, sel: `.eq-big[data-slot="${slot}"] .gwrap, .eq-big[data-slot="${slot}"]`, html: gearIco(it) };
  showBag();
}
async function unequip(hero, slots) {
  snapPow();
  let ok = false;
  for (const k of slots) { if (!((P().equip || {})[hero] || {})[k]) continue; const r = await API.equipGear(hero, k, null, app.guest); if (r && r.ok && r.profile) { app.profile = r.profile; ok = true; } }
  if (ok) { A.sfx.tap(); toast('장비를 뺐어요', 900); }
  closeInfoCard();
  showBag();
}
// 강화: 망치가 내리치고 → 불꽃 + "+N" (성공) / 흔들림 + 회색 연기 (실패) · +5 · +10 은 크게
async function enhanceFx(gid) {
  const el = document.querySelector('.eq-sheet .cmp-s:last-child .gwrap') || document.querySelector('.eq-sheet .gwrap');
  const box = el && el.closest('.cmp-s');
  if (box) { box.classList.remove('enh-hit', 'enh-ok', 'enh-no', 'enh-big'); void box.offsetWidth; box.classList.add('enh-hit'); }
  const hm = box && Object.assign(document.createElement('img'), { className: 'enh-hammer', src: ui2('hammer') });
  if (hm) box.appendChild(hm);
  snapPow();
  const [r] = await Promise.all([API.enhanceGear(gid, app.guest), sleep(420)]);
  if (!(r && r.ok && r.profile)) { if (hm) hm.remove(); toast((r && r.message) || '강화 못 했어요'); return; }
  app.profile = r.profile;
  const it = (P().gear || []).find((x) => x.id === gid);
  if (r.success === false) { if (box) box.classList.add('enh-no'); A.sfx.tap(); toast(`강화 실패… 장비는 그대로 (성공 확률 ${Math.round((r.chance || 0) * 100)}%)`, 1600); }
  else {
    const lv = it ? it.lv : r.lv;
    if (box) { box.classList.add('enh-ok'); const pop = document.createElement('b'); pop.className = 'enh-pop'; pop.textContent = `+${lv}`; box.appendChild(pop); if (lv === 5 || lv === 10) box.classList.add('enh-big'); }
    A.sfx.levelUp(); fx.flash(it ? GEAR_RARITY[it.r].color : '#ffd23f', lv === 5 || lv === 10 ? 0.45 : 0.18);
  }
  await sleep(700);
  const sh = app.eqSheet;
  if (sh && document.querySelector('.eq-sheet')) showEquipSheet(sh.hero, sh.slot, sh.sel);
  refreshBehind();
}
// 숫자 굴리기 (0.6초) + 떠오르는 ▲+N / ▼−N + 잠깐 빛
function runRolls() {
  for (const el of document.querySelectorAll('.roll[data-from][data-to]')) {
    const a = Number(el.dataset.from), b = Number(el.dataset.to);
    if (a === b) continue;
    const t0 = performance.now();
    const step = (now) => { const k = Math.min(1, (now - t0) / 600), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(Math.round(a + (b - a) * e)); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
    el.classList.add(b > a ? 'glow-up' : 'glow-dn');
    const f = document.createElement('i'); f.className = 'dfloat ' + (b > a ? 'up' : 'dn'); f.textContent = `${b > a ? '▲ +' : '▼ '}${fmt(b - a)}`;
    el.parentElement.appendChild(f);
    setTimeout(() => { f.remove(); el.classList.remove('glow-up', 'glow-dn'); }, 1300);
  }
  app.powPrev = null;
}
// 장비가 목록에서 칸으로 날아간다 (0.3초)
function flyIcon(f) {
  const to = document.querySelector(f.sel);
  if (!to || !f.rect) return;
  const r2 = to.getBoundingClientRect();
  const g = document.createElement('div');
  g.className = 'gfly'; g.innerHTML = f.html;
  Object.assign(g.style, { left: f.rect.left + 'px', top: f.rect.top + 'px', width: f.rect.width + 'px', height: f.rect.height + 'px' });
  document.body.appendChild(g);
  requestAnimationFrame(() => { g.style.transform = `translate(${r2.left + r2.width / 2 - (f.rect.left + f.rect.width / 2)}px, ${r2.top + r2.height / 2 - (f.rect.top + f.rect.height / 2)}px) scale(1.3)`; g.style.opacity = '0.2'; });
  setTimeout(() => { g.remove(); to.classList.add('eq-land'); setTimeout(() => to.classList.remove('eq-land'), 400); }, 320);
}
// 덱 전체 자동 장착: 전투력 높은 멤버부터 제일 좋은 장비를 (다른 멤버 장비도 옮겨 준다)
// 한 멤버 최적 장비: 무기 · 장신구 · 신화 칸마다 제일 좋은 것 (기본: 아무도 안 낀 것만 · steal: 다른 멤버 것도)
function bestGearPlan(p, id, steal) {
  const plan = [], taken = new Set();
  for (const k of ['w', 'a', 'm']) {
    const cur = ((p.equip || {})[id] || {})[k];
    const curIt = (p.gear || []).find((x) => x.id === cur);
    const cands = (p.gear || []).filter((it) => GEAR[it.t] && GEAR[it.t].slot === k && gearFits(it.t, id) && !taken.has(it.id) && it.id !== cur && (steal || !equippedBy(p, it.id)));
    cands.sort((a, b) => gearScore(b) - gearScore(a));
    const best = cands[0];
    if (best && (!curIt || gearScore(best) > gearScore(curIt) + 1e-9)) { taken.add(best.id); plan.push({ k, it: best, from: equippedBy(p, best.id), prev: curIt || null }); }
  }
  return plan;
}
async function heroAutoEquip(id, steal) {
  const p = P();
  const plan = bestGearPlan(p, id, steal);
  if (!plan.length) { A.sfx.deny(); toast(steal ? '다른 멤버 것까지 봐도 이미 최적이에요' : '이미 최적이에요 · 길게 누르면 다른 멤버 것도 봐요', 1600); return false; }
  const moves = plan.filter((x) => x.from && x.from !== id);
  if (steal && moves.length) {
    const ok = await confirmBox({ title: '다른 멤버 장비를 가져올까요?', sub: moves.map((x) => `${HEROES[x.from] ? HEROES[x.from].name : x.from}의 ${GEAR[x.it.t].name}`).join(' · '), ok: '가져오기', cancel: '취소' });
    if (!ok) return false;
  }
  const before = heroPower(P(), id);
  const done = [];
  for (const x of plan) {
    const r = await API.equipGear(id, x.k, x.it.id, app.guest);
    if (r && r.ok && r.profile) { app.profile = r.profile; done.push(GEAR[x.it.t].name); }
  }
  if (!done.length) return false;
  const after = heroPower(P(), id);
  A.sfx.levelUp();
  powRollToast(before, after);
  toast(`${HEROES[id].name}: ${done.join(' · ')} 착용`, 1800);
  return true;
}
// 전투력 오르는 숫자 (▲+N)
function powRollToast(a, b) {
  const d = document.createElement('div');
  d.className = 'pow-roll';
  d.innerHTML = `<small>전투력</small><b>${fmt(a)}</b><em>${b >= a ? '▲' : '▼'}${fmt(Math.abs(b - a))}</em>`;
  stage.appendChild(d);
  const t0 = performance.now(), el = d.querySelector('b');
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 700); el.textContent = fmt(Math.round(a + (b - a) * (1 - (1 - k) ** 3))); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
  setTimeout(() => d.classList.add('out'), 1500); setTimeout(() => d.remove(), 1900);
}
async function autoEquipAll() {
  snapPow();
  const p = P();
  const ids = [...new Set((curDeck() || []).filter(Boolean))];
  if (!ids.length) { toast('덱에 멤버가 없어요'); return; }
  ids.sort((a, b) => heroPower(p, b) - heroPower(p, a));
  const used = new Set();
  let n = 0;
  for (const h of ids) for (const k of ['w', 'a', 'm']) {
    const best = (P().gear || []).filter((it) => GEAR[it.t].slot === k && gearFits(it.t, h) && !used.has(it.id)).sort((a, b) => gearScore(b) - gearScore(a))[0];
    if (!best) continue;
    used.add(best.id);
    if (((P().equip || {})[h] || {})[k] === best.id) continue;
    const r = await API.equipGear(h, k, best.id, app.guest);
    if (r.ok && r.profile) { app.profile = r.profile; n++; }
  }
  toast(n ? `덱 멤버에게 좋은 장비 ${n}개를 끼웠어요` : '이미 제일 좋은 장비예요', 1600);
  if (n) A.sfx.levelUp();
  showBag();
}
// 끌어다 놓기: 가방 장비를 멤버 줄에 떨어뜨리면 끼운다
let bagDrag = null;
ui.addEventListener('pointerdown', (ev) => {
  const it = ev.target.closest('.bitem[data-id]');
  if (!it || app.screen !== 'bag') return;
  // 폰(터치)은 끌기 없음: 손가락으로 스크롤하면 끌기로 잘못 잡혀 아이콘이 화면에 박혀 남았다 → 누르고 → 칸 누르기만
  if (ev.pointerType === 'touch') return;
  bagDrag = { id: Number(it.dataset.id), x: ev.clientX, y: ev.clientY, ghost: null };
});
function dropGhost() { if (bagDrag && bagDrag.ghost) bagDrag.ghost.remove(); bagDrag = null; document.querySelectorAll('body > .bag-ghost').forEach((e) => e.remove()); }
for (const t of ['pointercancel', 'blur']) window.addEventListener(t, dropGhost);
window.addEventListener('pointerup', (ev) => { if (!ui.contains(ev.target)) dropGhost(); });
ui.addEventListener('pointermove', (ev) => {
  if (!bagDrag) return;
  if (!bagDrag.ghost && Math.hypot(ev.clientX - bagDrag.x, ev.clientY - bagDrag.y) > 14) {
    const it = (P().gear || []).find((x) => x.id === bagDrag.id);
    if (!it) return;
    const g0 = document.createElement('div'); g0.className = 'bag-ghost'; g0.textContent = GEAR[it.t].icon; document.body.appendChild(g0); bagDrag.ghost = g0;
  }
  if (bagDrag.ghost) { bagDrag.ghost.style.left = ev.clientX + 'px'; bagDrag.ghost.style.top = ev.clientY + 'px'; }
});
ui.addEventListener('pointerup', (ev) => {
  const d0 = bagDrag; bagDrag = null;
  if (!d0 || !d0.ghost) return;
  d0.ghost.remove();
  ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 60);
  const el = document.elementFromPoint(ev.clientX, ev.clientY);
  const slotEl = el && el.closest('.eq-slot');
  const row = el && el.closest('.eq-row');
  if (!row) return;
  const it = (P().gear || []).find((x) => x.id === d0.id);
  if (it) equipTo(row.dataset.hero, slotEl ? slotEl.dataset.slot : GEAR[it.t].slot, d0.id);
});
function showGearCard(gid) {
  const p = P();
  const it = (p.gear || []).find((x) => x.id === gid);
  if (!it) return;
  const cost = gearEnhanceCost(it.r, it.lv);
  const eq = equippedBy(p, gid);
  const hero = GEAR[it.t].hero && API.heroUnlocked(p, GEAR[it.t].hero) ? GEAR[it.t].hero : app.screen === 'bag' ? bagHero() : eq || owned()[0];
  const cur = heroGearStats(p, hero);
  const k = GEAR[it.t].slot;
  const old = ((p.equip || {})[hero] || {})[k];
  const after = Object.assign({}, cur);
  const oldIt = (p.gear || []).find((x) => x.id === old);
  if (oldIt) after[GEAR[oldIt.t].stat] -= gearValue(oldIt.t, oldIt.r, oldIt.lv);
  after[GEAR[it.t].stat] = (after[GEAR[it.t].stat] || 0) + gearValue(it.t, it.r, it.lv);
  const keys = [...new Set([...Object.keys(cur), ...Object.keys(after)])].filter((x) => (cur[x] || 0) || (after[x] || 0));
  const diff = keys.map((x) => { const a = cur[x] || 0, b = after[x] || 0; return `<div class="df"><span>${GEAR_STATS[x].name}</span><b>+${(a * 100).toFixed(1)}%</b><i class="${b > a ? 'gu' : b < a ? 'gd' : ''}">→</i><b class="${b > a ? 'gu' : b < a ? 'gd' : ''}">+${(b * 100).toFixed(1)}%</b></div>`; }).join('');
  const locked = gearLocked().has(gid);
  gearModal(`<div class="gc-head" style="--rc:${GEAR_RARITY[it.r].color}"><span class="gc-ico">${gearIco(it)}</span><div><b>${esc(GEAR[it.t].name)}${it.lv ? ` +${it.lv}` : ''} ${locked ? '' : ''}</b><small>${GEAR_RARITY[it.r].name} · ${k === 'w' ? '무기' : '액세서리'}${eq ? ` · ${HEROES[eq].name} 장착 중` : ''}</small></div></div>
    ${gearInfoHtml(it)}
    <div class="gdiff"><small>${HEROES[hero].name}에게 끼면</small>${diff}</div>
    <div class="gc-row">${eq === hero ? `<button class="btn" data-g="equip:${hero}:${k}:x">빼기</button>` : `<button class="btn primary" data-g="equip:${hero}:${k}:${gid}">${HEROES[hero].name}에게 끼기</button>`}
      ${(() => { const free = p.master && !p.testNormal; const stn = free ? 0 : gearStoneNeed(it.lv); const can = cost !== null && (free || (p.coins >= cost && (p.stones | 0) >= stn)); return `<button class="btn ${can ? 'pink' : ''}" data-g="enh:${gid}" ${can ? '' : 'disabled'}>${ic('hammer', '', 'sm')}강화 ${cost === null ? 'MAX' : `+${it.lv + 1} · ${free ? '100' : Math.round(gearEnhanceChance(it.lv) * 100)}% · ${free ? '공짜' : `<i class="ci"></i>${fmt(cost)}${stn ? ` · ${p.stones | 0}/${stn}` : ''}`}`}</button>`; })()}</div>
    ${cost !== null && gearStoneNeed(it.lv) && !(p.master && !p.testNormal) ? `<p class="g-help">${ic('gem', '', 'sm')}강화석: +6 부터 필요 (+6 1개 · +7 2개 · +8 3개 · +9 4개 · +10 5개) · 1-6 이후 스테이지·보스·레이드·<b>분해</b>로 모아요</p>` : ''}
    <div class="gc-row"><button class="btn ghost" data-g="lock:${gid}">${locked ? '잠금 풀기' : '☆ 잠그기 (팔기 방지)'}</button><button class="btn ghost" data-g="sell:${gid}" ${locked || eq ? 'disabled' : ''}>팔기 +${fmt(gearSellValue(it.r, it.lv))}</button><button class="btn ghost" data-g="dis:${gid}" ${locked || eq ? 'disabled' : ''}>분해 ${ic('gem', '', 'sm')}+${gearDismantle(it.r, it.lv)}</button></div>`);
}
function gearInfoHtml(it) {
  if (GEAR[it.t].hero) return sigInfoHtml(it.t, true);
  const g = GEAR[it.t], R0 = GEAR_RARITY[it.r], st = GEAR_STATS[g.stat];
  const info = GEAR_INFO[it.t] || ['', []];
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const v0 = gearValue(it.t, it.r, 0), v = gearValue(it.t, it.r, it.lv), nx = it.lv < GEAR_MAX_LV ? gearValue(it.t, it.r, it.lv + 1) : null;
  const fit = info[1].filter((h) => HEROES[h]).map(heroNm).join('·');
  return `<p class="g-fl">"${esc(info[0])}"</p>
    <div class="g-eff"><b>${esc(STAT_HELP[g.stat] ? STAT_HELP[g.stat][0] : st.name)} +${pct(v)}</b>${it.lv ? ` <small>(기본 +${pct(v0)} · +${it.lv} 강화)</small>` : ''}${nx !== null ? ` <em class="gu">→ +${it.lv + 1}: +${pct(nx)}</em>` : ' <small>(MAX)</small>'}</div>
    <div class="g-meta"><span style="color:${R0.color}">● ${R0.name} 등급 ×${R0.mul}</span>${fit ? `<span>추천: ${esc(fit)}</span>` : ''}<span>${ic('pin', '', 'sm')}${g.ch ? `${g.ch}챕터부터` : '1챕터부터'} 스테이지 보상</span></div>
    <p class="g-help">강화: 레벨당 +12% · +4부터 성공 확률이 조금씩 줄어요 (실패해도 안 깨짐) <button class="lnk" data-g="help">용어 풀이</button></p>`;
}
async function autoEquip() {
  const p = P();
  const id = bagHero();
  let n = 0;
  for (const k of ['w', 'a']) {
    const cur = ((p.equip || {})[id] || {})[k];
    const curIt = (p.gear || []).find((x) => x.id === cur);
    const cands = (P().gear || []).filter((it) => GEAR[it.t].slot === k && (!equippedBy(P(), it.id) || equippedBy(P(), it.id) === id));
    cands.sort((a, b) => gearScore(b) - gearScore(a));
    const best = cands[0];
    if (best && (!curIt || gearScore(best) > gearScore(curIt) + 1e-9) && best.id !== cur) {
      const r = await API.equipGear(id, k, best.id, app.guest);
      if (r.ok && r.profile) { app.profile = r.profile; n++; }
    }
  }
  toast(n ? `${HEROES[id].name}에게 좋은 장비를 끼웠어요` : '이미 제일 좋은 장비예요', 1600);
  if (n) A.sfx.levelUp();
  showBag();
}
Object.assign(ACTS, {
  bagHero: (b) => { const list = owned(); const i = list.indexOf(bagHero()); app.bagHero = list[(i + Number(b.dataset.d) + list.length) % list.length]; showBag(); },
  bagFilter: (b) => { app.bagFilter = b.dataset.v; showBag(); },
  bagSort: () => { app.bagSort = app.bagSort === 'lv' ? 'r' : 'lv'; showBag(); },
  autoEquip: () => autoEquip(),
});

// ─── 랭킹 ────────────────────────────────────────────
async function showRanking() {
  app.screen = 'ranking';
  const tab = app.rankTab;
  show(`
    ${topbar(true)}
 <h2 class="title">${ic('trophy', '', 'sm')} 랑방 명예의 전당</h2>
 <div class="tabs"><button class="${tab === 'stage' ? 'on' : ''}" data-act="rankTab" data-tab="stage">${ic('map', '', 'sm')}스테이지</button><button class="${tab === 'endless' ? 'on' : ''}" data-act="rankTab" data-tab="endless">${ic('infinity', '', 'sm')}무한 도전</button><button class="${tab === 'endlessWeek' ? 'on' : ''}" data-act="rankTab" data-tab="endlessWeek">${ic('calendar', '', 'sm')} 무한 주간</button><button class="${tab === 'popular' ? 'on' : ''}" data-act="rankTab" data-tab="popular">${ic('party', '', 'sm')}인기 멤버${BKX.dot(P()) ? '<i class="rd"></i>' : ''}</button></div>
 <p class="sub">${tab === 'popular' ? BKX.rankSub() : tab === 'stage' ? '최고 스테이지 → 총 별 → 먼저 도달한 순' : tab === 'endlessWeek' ? '이번 주 무한 도전 최고 점수 · 주가 끝나면 순위 보상이 우편함으로' : '최고 웨이브 → 최고 점수 순'}</p>
 <div class="rank-list" id="rk"><div class="empty-msg"><span class="spin">${ic('hourglass', '', 'sm')}</span> 불러오는 중…</div></div>
 <div class="spacer"></div>
 <div class="my-rank" id="myrk"></div>
 `, 'dim');
  if (tab === 'popular') { await BKX.renderRanking($('#rk'), $('#myrk')); return; } // 주간 인기 멤버 (bonkae-ui.js)
  const res = await API.loadRanking(tab);
  const box = $('#rk');
  if (!box || app.screen !== 'ranking' || app.rankTab !== tab) return;
  const my = $('#myrk');
  if (!res) { box.innerHTML = '<div class="empty-msg">랭킹을 불러오지 못했어요<br>잠시 후 다시 해 주세요</div>'; return; }
  const cell = (r) => (tab === 'stage'
    ? `<span class="w"><b>${r.stageLabel}</b><small>★ ${r.totalStars}</small></span>`
    : tab === 'endlessWeek' ? `<span class="w"><b>${fmt(r.weekBest || 0)}</b><small>이번 주</small></span>` : `<span class="w"><b>W${r.bestWave}</b><small>${fmt(r.bestScore)}점</small></span>`);
  const medal = ['', '', ''];
  box.innerHTML = res.ranking.length
    ? res.ranking.map((r) => `<div class="rank r${r.rank} ${res.me && res.me.username === r.username ? 'me' : ''}" data-act="playerCard" data-u="${esc(r.username || '')}"><span class="no">${medal[r.rank - 1] || r.rank}</span>
      <span class="nm ${frameCls(r.frame)}" style="${frameStyle(r.frame)}">${whoHtml(r.nickname, r.title)}<small>Lv.${r.level || 1}</small></span>${cell(r)}</div>`).join('')
    : '<div class="empty-msg">아직 기록이 없어요<br>첫 번째 랑방 수호자가 되어 보세요!</div>';
  if (app.guest) my.innerHTML = '<div class="guest-note" style="margin:0">손님은 랭킹에 안 올라가요 · <a href="/">로그인</a>하고 이름을 올려 봐요!</div>';
  else if (res.me && res.me.rank) my.innerHTML = `<div class="rank me"><span class="no">${res.me.rank}</span><span class="nm">내 순위<small>${esc(app.nickname)}</small></span>${cell(res.me)}</div>`;
  else my.innerHTML = `<div class="guest-note" style="margin:0">${tab === 'stage' ? '스테이지를 깨면 랭킹에 올라가요!' : '무한 도전 기록이 아직 없어요'}</div>`;
}

// ─── 게임 방법 ───────────────────────────────────────
function showHowto() {
  const fromPlay = app.screen === 'play';
  const back = fromPlay ? 'resume' : 'menu';
  if (!fromPlay) app.screen = 'howto';
  const enemies = Object.values(ENEMIES).filter((e) => !e.dot).map((e) => `<div data-act="info" data-kind="enemy" data-id="${e.id}">${av(e)}<span><b>${e.name}</b> ${CLASSES[e.cls] ? CLASSES[e.cls].icon : ''}${e.boss ? '' : ''}<br>${ENEMY_TIPS[e.id] || ''}</span></div>`).join('');
  show(`
    <div class="topbar"><button class="back" data-act="${back}">‹ ${fromPlay ? '게임으로' : '뒤로'}</button></div>
 <h2 class="title">게임 방법</h2>
 <div class="howto">
 <div class="it"><i>${ic('wave', '', 'sm')}</i><div><b>웨이브 성격</b>: 떼거리(약한 진상이 떼로 → 범위 공격) · 정예(적지만 단단, 범위 피해 -35% → 한 방 공격) · ${ic('swords', '', 'sm')} 혼합(떼거리 + 정예 호위) · ${ic('crown', '', 'sm')} 보스. 출전 준비 화면에서 미리 보고 덱을 짜요!</div></div>
 <div class="it"><i>${ic('boom', '', 'sm')}</i><div>한꺼번에 3명 이상 잡으면 <b>트리플! · 5킬! · 싹쓸이!! · 대학살!!!</b> 계속 잡으면 <b>콤보</b> — 경험치 최대 +15% (2초 못 잡으면 끊겨요)</div></div>
 <div class="it"><i>${ic('map', '', 'sm')}</i><div><b>스테이지</b>를 하나씩 깨요. 3챕터 × 10스테이지, 한 스테이지는 ${STAGE_WAVES}웨이브. x-5 · x-10 은 <b>보스</b>!</div></div>
 <div class="it"><i>${ic('star_gold', '', 'sm')}</i><div>클리어할 때 입구 내구도가 70% 이상이면 <b>★★★</b>, 35% 이상이면 ★★, 그 밖엔 ★. 처음 깰 때와 별을 새로 받을 때 코인 보너스! 입구가 <b>한 번도 안 맞고</b> 깨면 <b>${ic('gem', '', 'sm')} PERFECT</b> — 코인 더 + 첫 퍼펙트는 희귀 이상 장비 확정!</div></div>
 <div class="it"><i>${ic('card_common', '', 'sm')}</i><div>출동 전에 <b>덱</b>을 짜요. 5명(상점에서 6·7번째 칸 구매)을 원하는 <b>자리</b>에 세우고, 덱은 3개까지 저장. 스테이지 정보에 나오는 진상 유형을 보고 속성을 맞추면 유리!</div></div>
 <div class="it"><i></i><div><b>줄 공격</b> 멤버(건전남 새총 · 강성구 지팡이)는 <b>자기 앞 줄</b>만 쏴요. 진상이 많이 오는 가운데 줄에 세우면 좋아요. 끌어서 옮길 때 줄이 빛나요.</div></div>
 <div class="it"><i>${ic('bag', '', 'sm')}</i><div>스테이지를 깨면 <b>장비</b>가 떨어져요 (일반 · 희귀 · 영웅 · 전설). 멤버마다 무기 · 액세서리 한 칸씩 — 상점 <b>장비</b> 탭에서 끼우고, 강화하고, 남는 건 팔아요.</div></div>
 <div class="it"><i>${ic('sparkle', '', 'sm')}</i><div>보스가 큰 기술을 쓴 뒤엔 잠깐 <b>빈틈</b>(금빛)! 그때 스킬을 몰아 쓰면 1.5배로 들어가요.</div></div>
 <div class="it"><i>${ic('door', '', 'sm')}</i><div>진상들이 골목 위에서 몰려와요. 우리 멤버들이 <b>자동으로 공격</b>해요. 벨벳 로프까지 온 진상은 <b>랑방 입구</b>를 두드려요.</div></div>
 <div class="it"><i>${ic('tap', '', 'sm')}</i><div>진상을 <b>탭하면 집중 공격</b>. 경험치는 <b>저절로</b> 모여요. 게이지가 차면 <b>${ic('megaphone', '', 'sm')} 총공지</b>로 화면 전체 공격!</div></div>
 <div class="it"><i>${ic('card_common', '', 'sm')}</i><div>레벨이 오르면 카드 3장! 카드를 <b>눌러 고르고 → 선택</b>. 덱 멤버 레벨업(3·5레벨에 특수 능력) · 전체 강화. 카드는 스테이지마다 새로 시작해요.</div></div>
 <div class="it"><i>${ic('cart', '', 'sm')}</i><div>코인으로 <b>강화 상점</b>에서 멤버를 영구 강화(최대 20)하고 아이템(튼튼한 문 · 단골 쿠폰 · 확성기 배터리 · 행운 부적 · 웰컴 드링크)을 사요.</div></div>
 <div class="it"><i>${ic('sparkle', '', 'sm')}</i><div>1-6 · 1-10 · 2-3 · 2-5 · 2-7 · 2-10 · 3-2 · 3-3 을 처음 깨면 <b>새 멤버</b>가 합류해요 (<b>HIDDEN</b> 멤버도 있어요!). 힐러·탱커·한 방 딜러까지 — 덱에 넣어 써요.</div></div>
 <div class="it"><i>${ic('infinity', '', 'sm')}</i><div>1-10을 깨면 <b>무한 도전</b>이 열려요. 어디까지 버티나 랭킹 경쟁! 무한 도전에선 아직 못 만난 멤버도 카드로 <b>체험 합류</b>해요. 25웨이브부터는 <b>진상 연합 회장</b>이 10웨이브마다 찾아와요.</div></div>
 <div class="it"><i></i><div>사채업자는 살아 있는 동안 <b>이자</b>로 입구를 떼어 가요. 빨리 잡으면 <b>빚 탕감</b>! 뒤에 숨은 <b>인피 총무</b>는 보호막을 뿌리니 탭해서 먼저 잡아요.</div></div>
 <div class="it"><i></i><div>게임 중에 뒤로 가기를 눌러도 괜찮아요 — 일시정지가 떠요. 앱을 닫아도 메뉴에서 <b>이어하기</b>로 그 웨이브부터 다시!</div></div>
 </div>
 <h2 class="title" style="font-size:calc(var(--u)*18);margin-top:14px">조작법</h2>
 <div class="howto">
 <div class="it"><i>${ic('sparkle', '', 'sm')}</i><div>아래 <b>스킬 바</b>의 멤버 얼굴이 반짝이면(READY) 눌러서 필살기! 찍는 스킬은 누른 다음 <b>필드를 탭</b>해서 위치를 정해요 (그동안 시간이 느려져요).</div></div>
 <div class="it"><i>${ic('target', '', 'sm')}</i><div>진상을 탭하면 <b>지목</b> — 모두가 그 진상부터 때려요. 총무·독재자·들킨 사기꾼에게 딱!</div></div>
 <div class="it"><i>${ic('retry', '', 'sm')}</i><div>필드의 멤버를 <b>끌어다 놓으면</b> 자리를 바꿔요. 짧게 누르면 공격 방식·스킬·사거리를 보여 줘요.</div></div>
 </div>
 <h2 class="title" style="font-size:calc(var(--u)*18);margin-top:14px">속성 상성</h2>
 <p class="sub tipbar">${ic('bulb', '', 'sm')}<span>머리 쓰는 진상(유혹·정치)엔 말빨 · 술, 몸 쓰는 진상(폭력·진상)엔 힘 · 매력! (×${TYPE_STRONG} / ×${TYPE_WEAK})</span></p>
    <table class="tchart"><tr><th></th>${Object.values(CLASSES).map((c) => `<th>${clsIco(c.id)}<br>${c.name}</th>`).join('')}</tr>
      ${Object.values(ATTRS).map((a) => `<tr><th>${attrIco(a.id)} ${a.name}</th>${Object.keys(CLASSES).map((c) => { const m = typeMul(a.id, c); return `<td class="${m > 1 ? 'st' : m < 1 ? 'wk' : ''}">${m > 1 ? '◎' : m < 1 ? '△' : '·'}</td>`; }).join('')}</tr>`).join('')}
    </table>
    <div class="attr-legend">${Object.values(ATTRS).map((a) => { const st = Object.keys(CLASSES).filter((c) => typeMul(a.id, c) > 1).map((c) => clsIco(c) + CLASSES[c].name).join('·'); const who = Object.values(HEROES).filter((d) => d.attr === a.id && !d.summon).map((d) => d.name).join('·'); return `<p>${attrChip(a.id)} <b>${st} 에게 강함</b><small>${esc(who)}</small></p>`; }).join('')}</div>
 <p class="sub" style="margin-top:6px">스테이지마다 <b>맵 효과</b>(비 · 안개 · ${ic('bulb', '', 'sm')}정전 · 노래방 …)도 있어요. 스테이지 정보에서 추천 속성을 보고 팀을 짜요!</p>
 <h2 class="title" style="font-size:calc(var(--u)*18);margin-top:14px">진상 도감</h2>
 <div class="enemy-grid">${enemies}</div>
  `, 'dim');
}
// 이 스테이지에 나오는 특성 진상 → 잘 맞는 멤버 (출격 준비 · 스테이지 정보)
function traitHintHtml(s) {
  const seenK = new Set();
  const rows = [];
  for (const [t] of stageMix(s)) {
    const d = ENEMIES[t]; if (!d || !d.traits) continue;
    for (const k of Object.keys(d.traits)) { if (!TRAITS[k] || seenK.has(k)) continue; seenK.add(k); const T = TRAITS[k]; rows.push(`<div class="trait-hint"><b>${T.icon} ${esc(T.name)}</b> <small>${esc(d.name)}</small> → 추천 ${T.counter.filter((h) => HEROES[h]).map((h) => esc(heroNm(h))).join('·')}</div>`); }
  }
  return rows.length ? `<div class="trait-hints">${rows.join('')}</div>` : '';
}
const ENEMY_TIPS = {
  earphone: '노이즈 캔슬링 이어폰: 범위 공격이 전혀 안 들린다 — 건전남 · 운영진 같은 한 명씩 치는 공격으로',
  noshow: '길 3/4 까지 안 보인다(은신) · 입구를 세게 친다. 배현경이 찾아내고(표시 +25%) · 범위 공격 · 오지은 시간 정지에 들킨다',
  clubguy: '쓰러지면 데려온 클럽녀가 튀어나온다(분열) — 범위 공격으로 한 번에',
  clubgirl: '클럽남이 데려온 빠른 클럽녀. 약하지만 빠르다',
  praise1: '둘이 붙어 다니며 곁의 진상을 회복시키고 빠르게 한다. 한 명을 잡으면 다른 한 명이 분노 — 한 방에 같이',
  praise2: '둘이 붙어 다니며 곁의 진상을 회복시키고 빠르게 한다. 한 명을 잡으면 다른 한 명이 분노 — 한 방에 같이',
  fakesingle: '처음엔 잘 피하다가, 중간쯤 "사실 돌싱!" 들키면 빨라진다 — 여자 멤버를 홀림',
  secretmom: '거짓말 방패(유모차)가 있다. 방패가 깨지면 들켜서 기절 + 친구 2명 소환',
  carpoor: '외제차로 확 달려오다 중간에 퍼진다! 퍼진 동안은 약점',
  sales: '"보험 드세요!" 주변 진상에게 보호막 + 다단계로 빨라짐 — 먼저 잡자',
  sarcasm: '멀리서 돌려까기 부메랑 → 맞은 멤버 공격력 -25%. 말빨 멤버는 되받아친다!',
  jjijil: '로프에 닿으면 멤버에게 착 달라붙어 공격력 -40%. 잡으면 떨어진다',
  otaku: '피규어를 소환하고, 피규어가 있는 동안 굿즈 보호막(피해 -50%)',
  otaku_fig: '오타쿠의 피규어',
  drunk_cry: '엉엉 울며 눈물 웅덩이 → 그 위 멤버 공격 속도 -30%',
  drunk_run: '엄청 빠르고 제멋대로 뛰어다닌다',
  drunk_sleep: '길 한가운데 드러누워 총알을 막는다 (피해 -65%). 4번 맞으면 벌떡',
  drunk_home: '중간쯤 오면 경험치를 들고 집으로 도망. 잡으면 되찾는다',
  kkondae2: '"라떼는~" 공속↓ + "나이스 샷!" 골프공으로 멤버 기절',
  boss_kkondol: '4장 보스. 라떼 + 골프공, 체력 절반이면 "사실 돌싱!" 분노',
  boss_queenmom: '4장 끝 보스. 보호막 · 싱글맘 소환 · 명품 가방 투척',
  boss_sales: '5장 보스. 보험 보호막 폭탄 · 영업쟁이 소환 · 계약 도장 기절',
  boss_otaku: '5장 끝 보스. 피규어 부대 + 굿즈 보호막 · 응원봉 빔',
  boss_jusa: '6장 보스. 울고(웅덩이) → 뛰고 → 자고(회복, 빈틈!) → 집에 간다(경험치↓)',
  boss_soloparty: '6장 끝 보스. 디스코볼로 전원 홀림 · 꽃가루 눈부심 · 체력 30%면 분노',
  snowboard: '빠르고, 가끔 옆 줄로 휙 넘어간다(줄 바꾸기 · 그 순간 40% 회피). 감속 · 기절이면 못 바꾼다 — 범위 공격으로',
  liftcut: '두세 명이 한 줄로 우르르(떼로 등장) · 입구 앞에서 한 번 새치기 점프 — 관통 · 줄 공격 · 범위로 한 번에',
  fakecoach: '"제가 알려 드릴게요~" 곁의 진상 4명에게 보호막(최대 체력 40%) · 보호막 동안 안 밀림 — 운영진 레드카드 · 버프 벗기기로 먼저',
  sledgirl: '아주 빠른 썰매 돌진, 입구에 처음 부딪히면 크게 아프다. 몸은 약함 — 감속 · 기절에 걸리면 썰매에서 떨어져 느려진다',
  hotpack: '길 절반부터 옆을 지나간 멤버의 공격 속도 -35% (약화) — 멀리서 먼저 잡자',
  snowball: '멀찍이 서서 눈덩이 → 맞은 멤버 1.5초 빙결 (제일 잘 치는 멤버를 노림) — 건전녀 응급 방패 · 강성구 곁 · 도발 탱커로 막는다',
  mid_pension: '7장 보스 (7-5 · 7-10). 예고 뒤 "소음 금지!" 넓은 범위 멤버 스킬 3초 침묵 — 예고 중에 기절시키면 끊긴다 · 응급 방패 · 알디콤으로 풀기 · 퇴실 독촉(공속↓) · 단체 손님 소환',
  boss_resort: '7장 보스. "눈사태 경고!" 3초 예고 뒤 멤버 전원 빙결 + 입구 피해 + 보드남 — 예고 중에 스킬 · 총공지 · 알디콤을 쓰면 끊긴다',
  mid_snowboard: '각성한 보드남. 줄을 더 자주 바꾼다',
  mid_sledgirl: '각성한 썰매 폭주녀. 입구에 부딪히면 크게 아프다',
  yeokko: '빠름. 가까이 오면 여자 멤버를 홀린다',
  namkko: '빠름. 가까이 오면 남자 멤버를 홀린다',
  drunk: '갈지자 걸음. 죽으면 술병이 터져 주변 진상에게 피해',
  thug: '느리지만 단단함. 약한 공격은 덜 아프다',
  mukti: '엄청 빠름 · 잘 피함 (MISS). 입구에 붙으면 세게 친다 — 감속 · 기절 · 범위 · 따라가는 공격으로 잡자',
  queen: '졸개 소환 + 주변에 보호막',
  boss_thug: '땅 내려치기로 멤버 전원 기절',
  inpi_gossip: '멀찍이 서서 "수군수군" 뒷담화 — 맞은 멤버 공격 속도↓',
  inpi_dictator: '곁의 진상들이 덜 아프고 안 밀리고 빨라진다. 먼저 잡자!',
  inpi_clique: '3~5명씩 뭉쳐 다니며 서로 지켜 준다. 범위·관통 공격에 약함',
  scammer: '예쁜 프사(회피·남자 멤버 공격력↓) → 실물(공포/뚱뚱). "들켰다!" 할 때 약점',
  boss_gapjil: '"무릎 꿇어!" 멤버 기절 · 패거리 소환',
  boss_inpi: '오리고기 투척으로 기절 · "오리고기 회식"으로 진상 회복',
  boss_loan: '"이자 붙었다!" 입구 내구도를 점점 더 떼어 간다. 빨리 잡으면 "빚 탕감!"',
  inpi_treasurer: '뒤에 숨어 "회비 지원!" 보호막을 뿌린다. 체력이 낮으니 먼저!',
  boss_union: '3장 보스 (3-5 · 3-10) · 무한 도전 25웨이브부터. 갑질·회식·독재·이자·회비를 번갈아 쓴다',
  boss_bbikki: '2장 끝 보스. 전단지 폭탄(맞은 멤버 사거리 -30%, 4초) · 호객 행위(진상을 한 줄로 모아 우르르 + 손님 호객) · VIP 줄 세우기(앞줄 보호막) · 체력 40%면 분노 — 앞줄 보호막은 운영진으로, 모인 줄은 범위 공격으로',
  vomit: '"우웩!" 멤버 발밑에 토 → 공속↓. 죽으면 토 웅덩이가 진상을 빠르게 — 멀리서 잡자',
  couple: '안 맞으면 "꽁냥꽁냥" 회복, 윙크 안 통함. 반쯤 때리면 "헤어져!" 둘로',
  handsy: '로프에 닿으면 멤버를 붙잡아 못 쏘게 한다. 잡으면 풀려요 — 먼저 지목!',
  gao: '가오 중엔 피해 -60%. 말빨 공격이나 치명타로 "가오 깨짐!" → 더 아프다',
  selfie: '5초마다 "찰칵!" 플래시 — 가장 가까운 멤버 1초 기절. 체력 낮음',
  cutter: '엄청 빠르고, 앞줄 근처에서 한 번 훌쩍 새치기',
  kkondae: '느리고 튼튼. "라떼는 말이야~" 근처 멤버 공속↓. 기절시키면 조용',
  spam: '가끔 "카톡!" 알림을 풀고, 죽으면 알림 3개가 돌진',
  spam_dot: '작은 알림. 빠르게 돌진',
};

// ─── 시작 ────────────────────────────────────────────
const GATE_TIPS = ['속성 상성이 맞으면 피해 ×1.6 (안 맞으면 ×0.7)! 덱 짤 때 ▲▼ 를 보세요', '보스가 큰 기술을 쓴 뒤 금빛 "빈틈"에 스킬을 몰아 써요', '같은 속성 2명 이상이면 자동 시너지', '레벨업 카드는 게임이 멈추지 않아요 — 빨리 골라요!', '멤버 조각을 모아 ★ 승급', '주간 도전은 매주 월요일 새 판', '헬 모드는 ★★★ 스테이지에서 열려요', '처치 10명마다 1:1 대전에서 진상을 보낼 수 있어요'];
// 로딩 화면: 멤버 전원이 레드카펫 위에 모인 장면을 코드로 조합 (그림 ≤16장, 미리 디코딩)
const CROWD_ROWS = [
  { y: 75.5, w: 40, dim: 1, xs: [50, 29, 71, 10, 90] }, // 앞줄
  { y: 64.5, w: 31, dim: 0.85, xs: [39, 61, 19, 81, 50] }, // 가운데 줄
  { y: 54.5, w: 24, dim: 0.7, xs: [10, 27, 44, 61, 78, 94] }, // 뒷줄
];
function crowdOwned() {
  try { const c = JSON.parse(localStorage.getItem('langbang:crowd') || 'null'); if (Array.isArray(c)) return new Set(c.filter((id) => HEROES[id])); } catch { /* 무시 */ }
  return new Set(Object.keys(HEROES).filter((id) => !LOCKED_HEROES.includes(id)));
}
function saveCrowd() {
  try { localStorage.setItem('langbang:crowd', JSON.stringify(Object.keys(HEROES).filter((id) => API.heroUnlocked(P(), id)))); } catch { /* 무시 */ }
}
function crowdHtml(owned) {
  const byTier = (a, b) => heroTier(b) - heroTier(a);
  const have = Object.keys(HEROES).filter((id) => owned.has(id)).sort(byTier);
  if (have.includes('hochan')) have.splice(have.indexOf('hochan'), 1), have.unshift('hochan'); // 이호찬은 가운데 앞
  const not = Object.keys(HEROES).filter((id) => !owned.has(id)).sort(byTier);
  const slots = [];
  CROWD_ROWS.forEach((r, ri) => r.xs.forEach((x) => slots.push({ ri, x, r })));
  const out = [];
  let k = 0;
  for (const id of have) { if (k >= slots.length) break; out.push({ id, s: slots[k++], sil: false }); }
  // 아직 없는 멤버는 뒷줄에만 "???" 실루엣으로 살짝
  const back = slots.slice(k).filter((s) => s.ri === 2);
  not.slice(0, back.length).forEach((id, i) => out.push({ id, s: back[i], sil: true }));
  // 뒷줄부터 그려야 앞줄이 위로 온다
  out.sort((a, b) => b.s.ri - a.s.ri || Math.abs(b.s.x - 50) - Math.abs(a.s.x - 50));
  return out.map(({ id, s, sil }, i) => {
    const d = HEROES[id];
    const delay = (0.15 + (2 - s.ri) * 0.05 + i * 0.09).toFixed(2);
    return `<span class="cw r${s.ri} ${sil ? 'sil' : ''} ${id === 'hochan' && !sil ? 'gold' : ''}" data-id="${id}" style="left:${s.x}%;bottom:${100 - s.r.y}%;--w:${s.r.w}%;--dim:${s.r.dim};--d:${delay}s;--b:${(1.1 + ((i * 7) % 6) * 0.12).toFixed(2)}s">
      ${id === 'hochan' && !sil ? '<i class="cw-halo"></i>' : ''}${dexSrc(id, d.img) ? `<img src="${dexSrc(id, d.img)}" alt="" draggable="false" decoding="async" onerror="this.onerror=null;this.src='${d.img}'">` : `<span class="dx-emo">${d.emoji}</span>`}${sil ? '<b>???</b>' : ''}</span>`;
  }).join('');
}
// 타이틀 영상 이어 붙이기: 하나가 끝나기 0.4초 전에 다른 하나를 처음부터 틀고 서로 흐리게
function gateLoop(box) { // 한 개 · loop 속성 (끝에서 검은 화면 없이) · 못 틀면 포스터
  const v = box.querySelector('.gate-vid');
  if (!v) return;
  const on = () => box.classList.add('vidon');
  if (v.readyState >= 2) on(); else v.addEventListener('playing', on, { once: true });
  const pr = v.play(); if (pr && pr.catch) pr.catch(() => box.classList.add('novid'));
}
function soundChip() {
  if (stage.querySelector('.snd-chip')) return;
  const c = document.createElement('button');
  c.className = 'snd-chip';
  c.innerHTML = `${ic('sound', '', 'sm')}<span>눌러서 소리 켜기</span>`;
  const go = () => { A.unlock(); A.playBgm(); app.touched = true; c.remove(); window.removeEventListener('pointerdown', go, true); };
  window.addEventListener('pointerdown', go, true);
  stage.appendChild(c);
  setTimeout(() => { if (c.isConnected) c.classList.add('fade'); }, 6000);
}
function startGate(quick = false) {
  let ok = false;
  try { ok = sessionStorage.getItem('langbang:gate') === '1'; } catch { ok = false; }
  if (Q.has('autostart') || DEBUG.stage || Q.has('nogate')) return;
  // 뒤로/앞으로 가기로 다시 열린 페이지 · 이번 세션에 이미 본 경우 → 타이틀은 다시 안 보인다 (뒤로 가기로 타이틀에 가지 않게)
  let bf = false;
  try { const nv = performance.getEntriesByType && performance.getEntriesByType('navigation')[0]; bf = !!nv && (nv.type === 'back_forward' || nv.type === 'reload'); } catch { bf = false; }
  if (ok || bf) {
    try { sessionStorage.setItem('langbang:gate', '1'); } catch { /* 무시 */ }
    A.unlock(); A.playBgm();
    // 음악이 막혔으면 (터치 전) 작은 "소리 켜기" 칩만 — 첫 터치에 음악 시작
    setTimeout(() => { if (!A.bgmActive() && !A.isMuted() && !app.touched) soundChip(); }, 450);
    return;
  }
  const MIN_MS = quick ? 2000 : 3000; // 게임월드에서 들어올 때도 최소 2초
  const box = document.createElement('div');
  box.className = 'gate crowd-gate';
  const owned = crowdOwned();
  const ch = Math.max(1, Math.min(6, Number(localStorage.getItem('langbang:chapter')) || 1));
  // 배경: 움직이는 키아트 영상 두 개를 겹쳐 끝 0.4초를 서로 흐리게 이어 붙인다 (끝과 처음이 딱 안 맞아서)
  //   움직임 줄이기 · 데이터 절약 · 자동 재생 막힘(iOS 저전력) → 포스터 그림
  const still = document.body.classList.contains('rm') || (navigator.connection && navigator.connection.saveData);
  const vid = () => `<video class="gate-vid on" muted loop autoplay playsinline preload="metadata" poster="/img/lb/title_poster.jpg?v=3" disablepictureinpicture><source src="/img/lb/title_loop.mp4?v=3" type="video/mp4"></video>`;
  box.innerHTML = `<div class="gate-bg"><img class="gate-poster" src="/img/lb/title_poster.jpg?v=3" alt="" fetchpriority="high" onerror="this.onerror=null;this.src='/img/lb/loading_group.webp'">${still ? '' : vid()}</div>
    <div class="gate-in"><div class="gate-logo"><img src="/img/lb/logo_langbang.webp" alt="랑방대전" draggable="false" onerror="this.parentNode.classList.add('noimg')"><i class="gl-shine"></i><b class="gl-sub">찬이의 게임월드</b><h1 class="gl-txt">랑방 대전</h1></div></div>
    <div class="gate-foot"><div class="gate-load"><div class="gate-bar"><i></i></div><b class="gate-pct">0%</b></div><p class="gate-txt">멤버들 모으는 중</p><p class="gate-tip">${ic('bulb', '', 'sm')}<span>${esc(GATE_TIPS[(Math.random() * GATE_TIPS.length) | 0])}</span></p><button class="gate-btn" disabled><span class="gb-spark"></span><b>터치해서 시작</b><small>TAP TO START</small></button></div>`;
  stage.appendChild(box);
  { const bl = document.getElementById('bootld'); if (bl) { bl.classList.add('out'); setTimeout(() => bl.remove(), 400); } BOOT.gate = true; }
  if (!still) gateLoop(box);
  const go = () => box.classList.add('enter');
  setTimeout(go, 60);
  const bar = box.querySelector('.gate-bar i'), txt = box.querySelector('.gate-txt'), btn = box.querySelector('.gate-btn');
  const t0 = performance.now();
  let synced = false, tipAt = 0;
  const tick = () => {
    if (!box.isConnected) return;
    const all = Object.values(R.images);
    const done = all.filter((im) => !im.src || im.complete).length;
    const pct = Math.round((done / Math.max(1, all.length)) * 100);
    const el = performance.now() - t0;
    const bootPct = BOOT.over ? 100 : BOOT.total ? Math.floor((BOOT.done / BOOT.total) * 100) : 0;
    const shown = Math.min(pct, bootPct, Math.round((el / MIN_MS) * 100)); // 최소 3초는 보여 준다 · 로비 그림·계정까지 다 받아야 100%
    bar.style.width = shown + '%'; box.querySelector('.gate-pct').textContent = shown + '%';
    // 프로필이 오면 가진 멤버를 컬러로 (없던 멤버는 실루엣 그대로)
    if (!synced && app.profileLoaded) {
      synced = true;
      saveCrowd();
      const now = crowdOwned();
      void now; void owned;
    }
    if (el - tipAt > 2200) { tipAt = el; const tp = box.querySelector('.gate-tip span'); if (tp && el > 100) tp.textContent = GATE_TIPS[(Math.random() * GATE_TIPS.length) | 0]; }
    if (shown >= 100 || el > 8000) { txt.textContent = '준비 완료! 소리 켜고 시작해요'; btn.disabled = false; box.classList.add('ready'); if (synced || el > 8000) return; }
    else txt.textContent = '멤버들 모으는 중';
    requestAnimationFrame(tick);
  };
  tick();
  box.addEventListener('click', () => {
    if (btn.disabled) return;
    A.unlock(); A.playBgm(); app.touched = true;
    try { sessionStorage.setItem('langbang:gate', '1'); } catch { /* 무시 */ }
    box.classList.add('out');
    setTimeout(() => box.remove(), 400);
  });
}
// 부팅 로딩: 로비가 다 준비될 때까지 (최소 1.2초 · 최대 8초) — 막대는 실제로 받은 개수
const BOOT = { total: 0, done: 0, shown: 0, t0: performance.now(), over: false, seen: new Set() };
function bootTrack(p) { BOOT.total++; bootPaint(); return Promise.resolve(p).catch(() => {}).then(() => { BOOT.done++; bootPaint(); }); }
function bootImg(url) {
  if (!url || BOOT.seen.has(url)) return null; BOOT.seen.add(url);
  const im = new Image(); im.decoding = 'async'; im.src = url;
  return bootTrack((im.decode ? im.decode() : new Promise((r) => { im.onload = im.onerror = r; })).catch(() => {}));
}
function bootPaint() {
  const el = document.getElementById('bootld'); if (!el || BOOT.over) return;
  const pct = BOOT.total ? Math.floor((BOOT.done / BOOT.total) * 100) : 0;
  BOOT.shown = Math.max(BOOT.shown, pct);
  const f = document.getElementById('bl-fill'), p = document.getElementById('bl-pct');
  if (f) f.style.width = BOOT.shown + '%'; if (p) p.textContent = BOOT.shown + '%';
}
// 화면(#ui)에 실제로 쓰인 그림 (img · 배경 그림) 을 모두 받아서 풀어 둔다 → 페이드 뒤에 튀어나오는 것 없게
function bootScanUi() {
  const root = document.getElementById('ui'); if (!root) return [];
  const out = [];
  for (const im of root.querySelectorAll('img')) { const u = im.currentSrc || im.src; if (u) { const r = bootImg(u); if (r) out.push(r); } }
  for (const el of root.querySelectorAll('*')) { const bg = getComputedStyle(el).backgroundImage; if (bg && bg !== 'none') for (const m of bg.matchAll(/url\(["']?([^"')]+)["']?\)/g)) { const r = bootImg(m[1]); if (r) out.push(r); } }
  return out;
}
function bootDone() {
  if (BOOT.over) return; BOOT.over = true;
  const el = document.getElementById('bootld'); if (!el) return;
  const f = document.getElementById('bl-fill'), p = document.getElementById('bl-pct');
  if (f) f.style.width = '100%'; if (p) p.textContent = '100%';
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 120);
}
async function bootWait(profileP) {
  const el = document.getElementById('bootld');
  if (!el) return;
  const tipT = setInterval(() => { const tp = document.getElementById('bl-tip'); if (tp && typeof GATE_TIPS !== 'undefined') tp.textContent = GATE_TIPS[(Math.random() * GATE_TIPS.length) | 0]; }, 2400);
  const first = [bootImg('/img/lb/title_poster.jpg?v=3'), bootImg('/img/lb/logo_langbang.webp'), bootTrack(document.fonts ? document.fonts.ready : null), bootTrack(profileP)];
  const cap = new Promise((r) => setTimeout(r, 8000));
  const all = (async () => {
    await Promise.all(first);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); // 계정 받아서 로비를 다시 그린 뒤
    await Promise.all(bootScanUi());
    await Promise.all(bootScanUi()); // 한 번 더 (그림이 늦게 붙는 칸)
  })();
  await Promise.race([all, cap]);
  const left = 1200 - (performance.now() - BOOT.t0);
  if (left > 0) await new Promise((r) => setTimeout(r, left));
  clearInterval(tipT);
  bootDone();
}
async function boot() {
  try { if (gwPref('reduceMotion') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) document.body.classList.add('rm'); } catch { /* 무시 */ }
  requestAnimationFrame(() => document.body.classList.add('ready'));
  startGate();
  layout();
  app.demo = makeDemo();
  syncMute();
  showMenu();
  requestAnimationFrame((t) => { last = t; frame(t); });
  // 한글 글꼴이 늦게 오면 자리표시자 스프라이트를 다시 굽는다 (+ 속성 태그가 달린 카드 색)
  if (document.fonts && document.fonts.load) {
    document.fonts.load("900 16px 'Noto Sans KR'").then(() => R.bakeAll()).catch(() => {});
  }
  // 새 진상 프레임 띠 + 있으면 쓰는 그림·음악 목록 (없는 파일은 아예 요청 안 함)
  //  목록을 못 받으면 한 번 더 묻고, 그래도 안 되면 "있으면 쓰는 그림"은 요청하지 않는다 (없는 파일 404 를 쏟지 않게 · 대신 기본 그림)
  const animList = (retry) => fetch('/api/langbang/anim').then((x) => { if (!x.ok) throw new Error('anim ' + x.status); return x.json(); }).then((m) => { if (m && m.enemies) R.addEnemyAnims(m.enemies); const f = m && Array.isArray(m.files) ? m.files : []; R.loadOptional(f); if (A.setAvail) A.setAvail(f); })
    .catch(() => { if (retry) setTimeout(() => animList(false), 2500); else { R.loadOptional([]); if (A.setAvail) A.setAvail([]); } });
  animList(true);
  const profP = API.loadProfile();
  const bootP = bootWait(profP.then(() => new Promise((ok) => setTimeout(ok, 0))));
  const r = await profP;
  app.profile = r.profile;
  app.guest = r.guest;
  app.profileLoaded = true;
  Promise.resolve(API.mailSync(app.guest)).then((r) => { if (r && r.ok && r.profile) { app.profile = r.profile; if (app.screen === 'menu') showMenu(); } }).catch(() => {}).then(() => BKX.boot()).catch(() => {}); // 다음: 본캐 출연료 정산 · 알림
  saveCrowd();
  if (/^\d{4}$/.test(Q.get('room') || '')) setTimeout(() => { showPvp(); pvpEnter(Q.get('room')); }, 400); // 초대 링크
  // 로그인: 서버에 저장된 덱이 있고 이 기기에 덱이 없으면 서버 덱으로
  try { if (app.profile.decks && !localStorage.getItem(DECK_KEY)) { app.decks = app.profile.decks.decks.map((d) => d.slice()); app.deckI = app.profile.decks.i; } } catch { /* 무시 */ }
  try { const sl = app.profile.decks && app.profile.decks.leaders; if (sl) { const loc = leaders(); for (let k = 0; k < 3; k++) if (!loc[k] && sl[k]) loc[k] = sl[k]; localStorage.setItem(LEAD_KEY, JSON.stringify(loc)); } } catch { /* 무시 */ } // 서버 대장 → 이 기기에 없으면 채우기
  app.nickname = r.nickname || '';
  app.selStage = nextStage();
  app.chapterTab = chapterOf(app.selStage);
  if (r.error) toast(r.error);
  if (app.screen === 'menu') showMenu();
  if (Q.get('partner') && HEROES[Q.get('partner')]) app.partner = Q.get('partner');
  void bootP;
  if (DEBUG.stage) startRun({ mode: 'stage', stage: DEBUG.stage, force: true });
  else if (Q.has('autostart')) startRun(Q.has('endless') ? { mode: 'endless', force: true } : { mode: 'stage', stage: nextStage(), force: true });
}

// 친구 화면 (public/langbang/friends.js): 화면 도구를 넘기고 버튼 동작을 합친다
Object.assign(ACTS, FRX.initFriends({
  app, P, setProfile: (p) => { app.profile = p; }, show, popup, toast, confirmBox, topbar, esc, fmt, ic, av, frameCls, frameStyle, whoHtml, titleChip,
}));

// 본캐 · 출연료 · 주간 인기 멤버 (public/langbang/bonkae-ui.js)
Object.assign(ACTS, BKX.initBonkae({
  app, P, setProfile: (p) => { app.profile = p; }, show, popup, toast, confirmBox, esc, fmt, ic, av, refresh: () => refresh(), closeInfoCard: () => closeInfoCard(),
  reopenHero: (id) => { if (stage.querySelector('.hero-full')) showHeroModal(id); else refresh(); }, resync: () => resyncProfile(),
}));

// 진상의 탑 연결 (화면 · 버튼 · 전투 HUD · 결과)
TWUI = initTower({
  app, P, stage, hud, R, fx, A, API, L, S, GEAR_STATS,
  show: (h, c) => show(h, c), popup: (h, c) => popup(h, c), toast: (m, ms) => toast(m, ms), ic: (...a) => ic(...a), av: (d, x) => av(d, x),
  thumbSrc: (id) => thumbSrc(id), faceCircStyle: (id, f, cy) => faceCircStyle(id, f, cy), heroPower: (p, id) => heroPower(p, id), gotText: (g) => gotText(g),
  titleChip: (id) => titleChip(id), whoHtml: (n, t, x) => whoHtml(n, t, x), frameCls: (id) => frameCls(id), frameStyle: (id) => frameStyle(id), consIc: (id, c) => consIc(id, c),
  liveAct: (pr, ok) => liveAct(pr, ok), closeInfoCard: () => closeInfoCard(), showJoinReveal: (id, k) => showJoinReveal(id, k), startRun: (o) => startRun(o),
});
Object.assign(ACTS, TWUI.acts);
// 테스트/디버그용 핸들
window.__lb = {
  tower: () => TWUI.show(),
  face: () => DEX_FACE,
  faceC: () => FACE_BOX,
  gachaShow: (l) => gachaShow(l),
  R,
  pvpUi: { waiting: (t, c) => pvpWaiting(t, c), vs: (m) => showVsSplash(m), banner: (k, t, s) => pvpBanner(k, t, s), strip: (o) => { PVP.opp = o; renderOppStrip(); }, result: (r) => { app.pvpResult = r; }, start: (seed) => startRun({ mode: 'pvp', force: true, pvpSeed: seed === undefined ? 7 : seed }), end: (r) => pvpEnded(r) },
  get g() { return app.g; },
  get app() { return app; },
  perf,
  openCards: () => openCards(),
  renderCards: (f) => renderCards(f),
  reveal: (id, kind) => showReveal(id, kind),
  join: (id, kind) => showJoinReveal(id, kind),
  multi: (n) => multiKillFx(app.g, { n, x: 180, y: 300 }),
  S,
  fx,
  pickCard,
  tapCard,
  resumeRun,
  loadSnap,
  prep: (mode, s) => showPrep(mode, s),
  showScreen: (name) => ({ menu: showMenu, stages: showStages, shop: showShop, ranking: showRanking, howto: showHowto }[name] || showMenu)(),
  startRun: (partner, stageNum, mode) => { if (partner) app.partner = partner; return startRun({ mode: mode || (stageNum === 0 ? 'endless' : 'stage'), stage: stageNum || nextStage(), force: true }); },
};
boot();
