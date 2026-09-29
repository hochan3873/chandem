// 랑방 대전 — 메인: 게임 루프(고정 60Hz) · 입력 · HUD · 메뉴/스테이지/상점/카드/결과 화면
import {
  HEROES, ENEMIES, RULES, FIELD, BASE_HEROES, UNLOCK_HEROES, HIDDEN_HEROES, LOCKED_HEROES, RARITY, SCORE,
  CHAPTERS, STAGE_COUNT, STAGE_WAVES, STAGES_PER_CHAPTER, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS,
  chapterOf, stageNo, stageLabel, stageName, parseStage, stageEnemies, stageBosses, stageReward, clearCoins, itemValue, starsFor,
  ATTRS, CLASSES, TYPE_CHART, TYPE_STRONG, TYPE_WEAK, typeMul, stageClasses, recommendAttrs, recommendTeam, stageFx, MAP_FX, partnerSlots,
  GEAR, GEAR_RARITY, GEAR_STATS, GEAR_MAX_LV, gearValue, gearEnhanceCost, gearSellValue, SLOT_X, SLOT_X7,
} from './data.js';
import * as S from './sim.js';
import { Renderer } from './render.js';
import * as A from './audio.js';
import * as API from './api.js';
import * as SH from './share.js';

const $ = (s) => document.querySelector(s);
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
};
const STEP = 1 / 60;
const SNAP_KEY = 'langbang:snap';
const CARD_LOCK_MS = 700; // 카드가 뜬 직후 잘못 누르는 것 방지

const stage = $('#stage');
const canvas = $('#cv');
const ui = $('#ui');
const hud = $('#hud');
const R = new Renderer(canvas);
const fx = R.fx;

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
  nickname: '',
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

// ─── 화면 크기 맞추기 (세로 화면을 가운데에, 남는 곳은 레터박스) ─────
function layout() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const H = app.g ? app.g.H : clamp(Math.round(FIELD.W * vh / vw), FIELD.minH, FIELD.maxH);
  let cw = vw, ch = cw * H / FIELD.W;
  if (ch > vh) { ch = vh; cw = ch * FIELD.W / H; }
  cw = Math.floor(cw); ch = Math.floor(ch);
  stage.style.width = cw + 'px';
  stage.style.height = ch + 'px';
  stage.style.setProperty('--u', (cw / FIELD.W) + 'px');
  app.logicalH = H;
  R.resize(cw, ch, H);
}
window.addEventListener('resize', () => { clearTimeout(layout.t); layout.t = setTimeout(layout, 80); });

// ─── 이미지(없으면 이모지) 태그 ──────────────────────
function av(def, extra = '') {
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
function confirmBox({ title, sub = '', ok = '확인', cancel = '취소', danger = false }) {
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
  if (!g || app.debugRun || g.over || g.victory || app.ending || !g.lastSnap) return;
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
let guarded = false;
let ignorePop = 0;
function guardOn() {
  if (guarded) return;
  try { history.pushState({ lb: 'play' }, ''); guarded = true; } catch { /* 무시 */ }
}
function leaveToHub() {
  saveSnap();
  document.body.classList.add('leaving');
  setTimeout(() => { location.href = '/'; }, 180);
}
function guardOff() {
  if (!guarded) return;
  guarded = false;
  ignorePop++;
  try { history.back(); } catch { ignorePop--; }
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  guarded = false;
  if (app.screen !== 'play' || !app.g || app.g.over) {
    // 메뉴·상점 등: 나가기 전에 한 번 묻는다
    guardOn();
    if (app.confirmOpen) { closeConfirm(false); return; }
    closeInfoCard();
    confirmBox({ title: '랑방 대전을 나갈까요?', sub: '게임월드로 돌아가요', ok: '나가기', cancel: '더 할래요' }).then((ok) => { if (ok) leaveToHub(); });
    return;
  }
  guardOn(); // 다시 걸어 둔다 — 뒤로 가기로는 절대 안 나가진다
  if (app.confirmOpen) closeConfirm(false);
  else if (app.cardsOpen) toast('카드를 먼저 골라 주세요', 1400);
  else if (app.paused) askQuit();
  else pauseGame();
});

// ─── 데모(메뉴 뒤에서 돌아가는 구경용 판) ─────────────
function makeDemo() {
  const g = S.createGame({ H: app.logicalH, god: true, heroes: ['staff', 'bangjang', 'gunman', 'gunnyeo'], rng: Math.random });
  for (const h of g.heroes) h.lv = 3;
  g.phaseT = 0.5;
  return g;
}

// ─── 진행 도우미 ─────────────────────────────────────
const P = () => app.profile;
const nextStage = () => Math.min(STAGE_COUNT, (P().maxStage || 0) + 1);
const stageUnlocked = (s) => s <= (P().maxStage || 0) + 1;
const heroOk = (id) => HEROES[id] && id !== 'bangjang' && API.heroUnlocked(P(), id);
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
function partnerList() { return ['staff', 'gunman', 'gunnyeo', ...UNLOCK_HEROES, ...HIDDEN_HEROES]; }

// ─── 게임 시작/끝 ─────────────────────────────────────
async function startRun(opt = {}) {
  const mode = opt.mode || app.mode;
  const st = mode === 'stage' ? opt.stage || app.stage : 0;
  const snap = loadSnap();
  if (snap && !opt.force) {
    const ok = await confirmBox({ title: '새로 시작할까요?', sub: `이어하던 판(${snapLabel(snap)})은 사라져요`, ok: '새로 시작', cancel: '취소', danger: true });
    if (!ok) return;
  }
  clearSnap();
  app.mode = mode;
  app.stage = st;
  fixDeck();
  const p = P();
  const unlocked = DEBUG.hidden ? LOCKED_HEROES.slice() : p.unlocked || [];
  layoutForNewRun();
  const deck = curDeck();
  const g = S.createGame({
    H: app.logicalH, meta: p.heroes || {}, items: p.items || {}, deck, positions: nPosNow(), gear: API.gearFor(p, deck.filter(Boolean)),
    god: DEBUG.god || DEBUG.stress > 0, mode, stage: st, unlocked, trialAll: mode === 'endless', startWave: DEBUG.wave || 0,
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
  g.lastSnap = S.snapshot(g); // 첫 웨이브 전에 나가도 이어할 수 있게
  const locked = mode === 'stage' && !stageUnlocked(st);
  app.debugRun = DEBUG.wave > 1 || DEBUG.god || DEBUG.stress > 0 || Q.has('nosave') || locked;
  beginPlay(g);
  saveSnap();
  if (app.firstRunTip) {
    showTip('적을 탭하면 집중 공격! 경험치는 저절로 모여요', 4500);
    app.firstRunTip = false;
  }
}
function resumeRun() {
  const d = loadSnap();
  if (!d) { toast('이어할 판이 없어요'); showMenu(); return; }
  app.mode = d.snap.mode;
  app.stage = d.snap.stage || 0;
  if (Array.isArray(d.partners)) app.partners = d.partners;
  app.partner = app.partners[0];
  app.debugRun = false;
  layoutForNewRun();
  const g = S.restoreGame(d.snap, { H: app.logicalH });
  beginPlay(g);
  fx.banner('이어하기!', `웨이브 ${Math.max(1, d.snap.wave)} 처음부터 다시 시작해요`, '#1a7a9a', 2, 'big');
}
function beginPlay(g) {
  app.g = g;
  app.demo = null;
  app.paused = false;
  app.cardsOpen = false;
  app.ending = false;
  app.hudCache = {};
  app.ultTipShown = false;
  fx.reset();
  R.setTheme(g.mode === 'stage' ? chapterOf(g.stage) : 'endless');
  app.screen = 'play';
  skillbar.dataset.key = '';
  cancelAim(); hideBubble(); app.drag = null;
  if (g.mapFx.id !== 'none') setTimeout(() => { if (app.g === g) fx.banner(`${g.mapFx.icon} ${g.mapFx.name}`, g.mapFx.desc, '#23336a', 2.2, 'big'); }, 300);
  ui.innerHTML = '';
  hud.hidden = false;
  hud.classList.toggle('endless', g.mode !== 'stage');
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
  app.ending = true;
  clearSnap();
  setTimeout(() => showResult(victory), victory ? 2200 : 1700);
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
  const busy = fx.nums.items.length > 45;
  const live = g === app.g;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'shot': if (loud) A.sfx.shot(HEROES[e.hero].proj); break;
      case 'dmg':
        if (!busy || e.crit) fx.num(e.x, e.y, e.v, e.crit, e.shield ? '#9feaff' : null);
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
        if (Math.random() < 0.25) fx.text(e.x, e.y - 20, POOF[(Math.random() * POOF.length) | 0], '#fff', 13, 0.6, -40);
        if (loud) A.sfx.kill();
        fx.combo = g.combo;
        fx.comboPop = 1;
        if (g.combo > 0 && g.combo % 25 === 0) fx.text(180, g.H * 0.22, `${g.combo} COMBO!!`, '#ffd23f', 24, 1.1, -20);
        break;
      }
      case 'shout': fx.bubble(e.x, e.y, e.text); break;
      case 'explode':
        fx.ring(e.x, e.y, 6, e.r, 0.35, '#8dff9a', 5);
        fx.burst(e.x, e.y, 14, '#5fd07a', 200, 'shard', 6, 0.6, 300);
        fx.burst(e.x, e.y, 6, 'rgba(255,200,120,0.8)', 60, 'puff', 12, 0.4);
        if (Math.random() < 0.35) fx.text(e.x, e.y - 12, '와장창!', '#b6ffb0', 14, 0.7);
        if (loud) A.sfx.explode();
        break;
      case 'splash':
        fx.ring(e.x, e.y, 4, e.r, 0.3, e.proj === 'warn' ? '#ff8a7a' : e.proj === 'bottle' ? '#ff5a3a' : e.proj === 'swear' ? '#ff9a3c' : '#ffd23f', 4);
        if (loud) A.sfx.explode();
        break;
      case 'kick': fx.text(e.x, e.y, '강퇴!', '#ff6b5a', 17, 0.8); if (loud) A.sfx.kick(); break;
      case 'freeze':
        if (!busy || Math.random() < 0.4) fx.text(e.x, e.y, Math.random() < 0.5 ? '#@!%' : '얼음!', '#ffb46b', 15, 0.7);
        fx.burst(e.x, e.y, 4, '#9fe8ff', 90, 'spark', 3, 0.35);
        if (loud) A.sfx.kick();
        break;
      case 'chain':
        for (let k = 1; k <= 5; k++) fx.part('spark', e.x + (e.x2 - e.x) * k / 6, e.y + (e.y2 - e.y) * k / 6, 0, 0, 0.25, 3, '#ff9a3c');
        break;
      case 'miss': if (!busy) fx.text(e.x, e.y, '빗나감!', '#ffc6e4', 12, 0.6); break;
      case 'reveal':
        fx.text(e.x, e.y, '들켰다!', '#ffe14d', 16, 1.0, -30);
        fx.ring(e.x, e.y + 30, 6, 46, 0.4, '#ffe14d', 3);
        break;
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
        if (e.boss) fx.addShake(6);
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
      case 'waveStart': {
        const n = S.enemiesLeft(g);
        const stageMode = g.mode === 'stage';
        const last = stageMode && e.wave >= g.totalWaves;
        if (!e.boss) fx.banner(last ? '마지막 웨이브!' : `WAVE ${e.wave}${stageMode ? '/' + g.totalWaves : ''}`, `진상 ${n}명 접근 중!`, '#ffd23f', 1.7, 'wave');
        if (loud) A.sfx.wave();
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
      case 'bossSpawn': {
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
        if (!busy) fx.text(e.x, e.y, e.strong ? '효과 굉장!' : '별로…', e.strong ? '#ffe14d' : '#9aa8c8', e.strong ? 14 : 12, 0.8, -30);
        break;
      case 'cone':
        fx.arc(e.x, e.y, e.a, e.half, e.r, e.big ? 0.45 : 0.28, e.big ? 'rgba(255,160,40,0.9)' : 'rgba(255,220,90,0.8)');
        if (e.big) fx.text(e.x, e.y - 40, '전체공지!', '#ffb347', 16, 0.8);
        break;
      case 'skill':
        if (e.target) { fx.ring(e.x, e.y, 10, e.r, 0.5, HEROES[e.hero].color, 6); fx.ring(e.x, e.y, 6, e.r * 0.6, 0.4, '#fff', 3); fx.addShake(5); }
        if (e.skill === 'rally') { fx.flash('#ffe08a', 0.3); fx.banner('집합!!', '모두 공격 속도 UP', '#b86b00', 1.2, 'big'); }
        if (e.skill === 'curse') fx.text(e.x, e.y - 30, '#@!%&!!', '#ff7a2e', 24, 1, -20);
        if (e.skill === 'winkbomb') for (let k = 0; k < 10; k++) fx.part('heart', e.x, e.y, (Math.random() - 0.5) * 260, -60 - Math.random() * 160, 0.9, 10, null, { grav: 200 });
        if (e.skill === 'redcard') fx.text(e.x, e.y - 30, '레드카드!', '#ff4b3a', 20, 1, -20);
        break;
      case 'cleanse': fx.text(e.x, e.y - 90, '응급처치! 상태이상 해제', '#9dffb0', 15, 1.1); break;
      case 'wave': fx.ring(e.x, e.y, 10, e.r, 0.4, 'rgba(190,150,255,0.9)', 4); break;
      case 'encore':
        fx.ring(e.x, e.y - 60, 20, e.r, 0.8, '#c9a8ff', 8);
        fx.banner('무한 앵콜!!', '다 같이 떼창~ 진상들 춤추느라 멈춤', '#5a2aa0', 1.6, 'big');
        for (let k = 0; k < 14; k++) fx.part('star', e.x + (Math.random() - 0.5) * 300, e.y - 100 - Math.random() * 200, 0, -30, 1, 9, null);
        if (loud) A.sfx.win();
        break;
      case 'moto': fx.text(e.x, e.y - 80, e.n > 1 ? '3대 500!!' : '부릉부릉!', '#ff8a4f', e.n > 1 ? 22 : 15, 1, -24); fx.addShake(e.n > 1 ? 8 : 4); if (loud) A.sfx.slam(); break;
      case 'dash': fx.part('star', e.x, e.y - 30, 0, -60, 0.4, 10, null); break;
      case 'slash': if (!busy) { fx.burst(e.x, e.y, 5, '#c8b0ff', 170, 'spark', 3, 0.25); if (Math.random() < 0.3) fx.text(e.x, e.y - 10, '샤샥!', '#e0d0ff', 12, 0.5); } break;
      case 'crossfit': fx.text(e.x, e.y - 76, '크로스핏!', '#c8b0ff', 13, 1); break;
      case 'rush': {
        let px = e.x, py = e.y;
        for (const [x, y] of e.pts) { for (let k = 1; k <= 4; k++) fx.part('spark', px + (x - px) * k / 5, py + (y - py) * k / 5, 0, 0, 0.35, 4, '#b08aff'); fx.ring(x, y, 4, 34, 0.3, '#b08aff', 3); px = x; py = y; }
        fx.banner('블랙 러시!!', `${e.pts.length}명 연속 돌파`, '#3a1a8a', 1.3, 'big', 'h_youngjun_rage');
        fx.addShake(8);
        if (loud) A.sfx.crit();
        break;
      }
      case 'lazyUp': fx.text(e.x, e.y - 80, '이제 좀 해볼까?', '#c8ffe0', 15, 1.1, -20); break;
      case 'burst':
        fx.pillar(e.x, e.w, g.rowY - 20, 0.7);
        fx.flash('#e8fff4', 0.35); fx.addShake(12);
        fx.text(e.hx, e.hy - 80, e.big ? '진심이다…!' : '귀찮아…', '#c8ffe0', 14, 1.2, -16);
        if (loud) A.sfx.ult();
        break;
      case 'swap': fx.ring(e.x, e.y, 6, 50, 0.35, '#6ff0ff', 4); break;
      case 'blackout': fx.text(180, g.H * 0.3, '💡 정전!', '#ffe9a0', 22, 1.2, -10); fx.flash('#000000', 0.6); break;
      case 'lightsOn': fx.flash('#fff8d0', 0.25); break;
      case 'megaphone': fx.text(180, g.H * 0.26, '📢 인피 확성기! 진상 가속', '#ff8a8a', 17, 1.2, -10); break;
      case 'puke': fx.text(e.x, e.y, '우웩!', '#b8e04a', 16, 0.9); fx.burst(e.hx, g.rowY + 18, 10, '#9acd32', 120, 'dot', 5, 0.5, 200); break;
      case 'cuddle': fx.text(e.x, e.y, '꽁냥꽁냥♡', '#ffb0d0', 12, 0.8); fx.part('heart', e.x, e.y, 0, -40, 0.8, 9, null); break;
      case 'breakup': fx.text(e.x, e.y, '헤어져!!', '#ff7fa8', 18, 1.1, -20); fx.burst(e.x, e.y + 20, 12, '#ff9ecb', 160, 'shard', 5, 0.6, 300); break;
      case 'grab': fx.text(e.hx, e.hy - 70, '붙잡힘!', '#ffc08a', 15, 1); if (loud) A.sfx.charm(); break;
      case 'release': fx.text(e.x, e.y - 70, '풀려났다!', '#9dffb0', 13, 0.9); break;
      case 'gaoBreak': fx.text(e.x, e.y, '가오 깨짐!', '#ffe14d', 18, 1.1, -24); fx.burst(e.x, e.y + 20, 14, '#ffd23f', 180, 'shard', 5, 0.6, 300); if (loud) A.sfx.crit(); break;
      case 'flash': fx.flash('#ffffff', 0.2); fx.text(e.x, e.y, '찰칵!', '#fff', 15, 0.8); fx.text(e.hx, e.hy - 70, '눈부셔!', '#ffe9a0', 13, 0.9); break;
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
        if (!e.last) fx.text(180, g.H * 0.36, `WAVE ${e.wave} 클리어!`, '#7dff9a', 24, 1.5, -12);
        if (loud) A.sfx.clear();
        break;
      case 'victory':
        fx.flash('#fff3b0', 0.8);
        for (let k = 0; k < 4; k++) setTimeout(() => {
          fx.burst(60 + Math.random() * 240, g.H * 0.3, 40, null, 380, 'confetti', 8, 2, 240);
          for (const p of fx.parts.items) if (p.type === 'confetti' && !p.color) p.color = CONFETTI[(Math.random() * CONFETTI.length) | 0];
        }, k * 350);
        if (g.mode === 'stage' && !g.baseHit) {
          fx.banner('💎 PERFECT!!', '입구가 한 번도 안 맞았다!', '#1a6aa0', 2.6, 'big');
          fx.flash('#bff4ff', 0.9);
          for (let k = 0; k < 20; k++) fx.part('star', 40 + Math.random() * 280, g.H * 0.2 + Math.random() * 200, (Math.random() - 0.5) * 80, -60, 1.4, 12, null, { grav: 60 });
        } else if (g.mode === 'stage') fx.banner(`${stageLabel(g.stage)} 클리어!!`, starStr(e.stars), '#c77a00', 2.4, 'big');
        else fx.banner('랑방 수호 성공!!', '20웨이브 전부 막아냈다', '#c77a00', 2.6, 'big');
        if (loud) A.sfx.win();
        if (live) endRun(true);
        break;
      case 'gameover':
        fx.slowmo = 1.4;
        fx.zoomTarget = 1.12;
        fx.zx = 180; fx.zy = g.ropeY;
        fx.flash('#ff2040', 0.6);
        fx.addShake(16);
        fx.banner('랑방 함락…', '진상들이 들이닥쳤다', '#7a0a1a', 2.2, 'big');
        if (loud) { A.sfx.lose(); A.pauseBgm(); }
        if (live) endRun(false);
        break;
      case 'rage':
        fx.banner('최은옥 분노 모드!!', '"다 덤벼!!!" 🔥', '#c01010', 1.8, 'rage', 'h_eunok_rage');
        fx.addShake(8);
        fx.ring(e.x, e.y, 10, 160, 0.6, '#ff3b30', 8);
        for (let k = 0; k < 16; k++) fx.part('flame', e.x + (Math.random() - 0.5) * 40, e.y + 10, (Math.random() - 0.5) * 60, -80 - Math.random() * 80, 0.8, 14, null);
        if (loud) A.sfx.rage();
        break;
      case 'sober': fx.text(e.x, e.y - 60, '술 깼다… 한 잔 더?', '#ffd6a8', 12, 1.3); break;
      case 'heal':
        fx.text(e.x, e.y - 60, `+${e.v} 수리`, '#7dff9a', 14, 1);
        for (let k = 0; k < 6; k++) fx.part('star', 40 + Math.random() * 280, g.rowY + 60 + Math.random() * 40, 0, -40, 0.8, 7, null);
        if (loud) A.sfx.heal();
        break;
      case 'join': {
        const h = HEROES[e.hero];
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
        const h = HEROES[e.hero];
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
          if (Math.random() < 0.4) fx.text(e.x, e.y, '♥ 두근!', '#ff7fd8', 14, 0.7);
          for (let k = 0; k < 3; k++) fx.part('heart', e.x, e.y, (Math.random() - 0.5) * 90, -60 - Math.random() * 60, 0.8, 9, null, { drag: 1 });
        } else if (Math.random() < 0.3) fx.text(e.x, e.y, '흥!', '#ffd0f0', 12, 0.6);
        break;
    }
  }
  ev.length = 0;
}
const SHIELD_TXT = { queen: '여왕의 보호막!', inpi_treasurer: '회비 지원!', boss_union: '회장님 회비 지원!' };
const UNION_PHASE = {
  kneel: ['갑질 타임!', '"전원 무릎 꿇어!" 멤버가 기절해요'],
  feast: ['오리고기 회식!', '진상들이 체력을 회복해요'],
  aura: ['독재 정치!', '곁의 진상이 단단하고 빨라져요'],
  interest: ['이자 폭탄!', '입구 내구도가 계속 떼여요'],
  shieldAura: ['회비 지원!', '진상들에게 보호막'],
};
const PROJ_COL = { notice: '#ffd23f', warn: '#ff6b5a', bullet: '#6dffb0', flower: '#ff9fd0', bottle: '#7be38f', wink: '#ff5fcf', cane: '#e0b27a', swear: '#ff9a3c' };
const BOSS_COL = { queen: '#b01e8c', boss_thug: '#9a1a1a', boss_gapjil: '#5a1ec0', boss_inpi: '#137a4a', boss_loan: '#8a6a00', boss_union: '#5a0a9a' };
const POOF = ['퍽!', '빡!', '뿅', '컷!', '퇴장~', '아웃!'];
const CONFETTI = ['#ffd23f', '#ff4fd8', '#6ff0ff', '#7dff9a', '#ff8a00', '#ffffff'];

// ─── HUD ─────────────────────────────────────────────
const H$ = {
  wave: $('#h-wave'), left: $('#h-left'), kills: $('#h-kills'), score: $('#h-score'), xp: $('#h-xp'), lv: $('#h-lv'),
  hp: $('#h-hp'), hpLag: $('#h-hp-lag'), hpText: $('#h-hptext'), stars: $('#h-stars'), ult: $('#btn-ult'), boss: $('#bossbar'), bossName: $('#boss-name'), bossFill: $('#boss-fill'),
  mute: $('#btn-mute'), baseBox: document.querySelector('.base-hp'), fx: $('#h-fx'),
};
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
  setText(H$.wave, 'wave', stageMode ? `${stageLabel(g.stage)} · WAVE ${w}/${g.totalWaves}` : `WAVE ${w} ∞`);
  H$.wave.classList.toggle('boss', bossWave && g.phase !== 'break');
  setText(H$.left, 'left', g.phase === 'break' ? (g.wave === 0 ? '준비!' : '잠깐 숨 돌리기') : `남은 진상 ${S.enemiesLeft(g)}`);
  setText(H$.fx, 'fx', g.mapFx.id === 'none' ? '' : g.mapFx.icon);
  setText(H$.kills, 'kills', fmt(g.stats.kills));
  setText(H$.score, 'score', fmt(g.stats.score));
  setText(H$.lv, 'lv', `Lv.${g.level}`);
  const xp = Math.round((g.exp / g.need) * 100);
  if (app.hudCache.xp !== xp) { app.hudCache.xp = xp; H$.xp.style.width = xp + '%'; }
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
    const st = starsFor(frac);
    if (setText(H$.stars, 'stars', starStr(st))) { H$.stars.classList.remove('bump'); void H$.stars.offsetWidth; H$.stars.classList.add('bump'); }
  }
  const up = Math.floor(g.ult);
  if (app.hudCache.ult !== up) {
    app.hudCache.ult = up;
    H$.ult.style.setProperty('--p', up);
    H$.ult.classList.toggle('ready', up >= RULES.ultMax);
    if (up >= RULES.ultMax && !app.ultTipShown) { app.ultTipShown = true; showTip('📣 총공지 준비 완료! 오른쪽 아래 버튼을 눌러요', 3500); }
  }
  // 보스 체력바
  let hp = 0, max = 0, name = '';
  for (const e of g.enemies) if (e.boss && !e.dead) { hp += Math.max(0, e.hp); max += e.maxHp; name = name ? name + ' · ' + e.def.name : e.def.name; }
  if (max > 0) {
    if (H$.boss.hidden) H$.boss.hidden = false;
    setText(H$.bossName, 'bn', `👑 ${name}`);
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
  H$.mute.textContent = m ? '🔇' : '🔊';
  for (const b of document.querySelectorAll('[data-act="mute"]')) b.textContent = m ? '🔇' : '🔊';
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
  if (g && !app.paused && !app.cardsOpen && !app.confirmOpen) {
    const ts = (fx.slowmo > 0 ? 0.22 : 1) * (app.aim ? 0.3 : 1);
    const speed = live ? DEBUG.speed : 1;
    acc += dt * ts * speed;
    const maxSteps = Math.ceil(10 * Math.max(1, speed));
    let n = 0;
    while (acc >= STEP && n < maxSteps) {
      if (live && DEBUG.stress) stressFill(g);
      S.step(g, STEP);
      acc -= STEP;
      n++;
      if (!live) { g.pendingLevels = 0; if (g.base.hp < g.base.max) g.base.hp = g.base.max; }
      handleEvents(g, !!live);
      if (live && g.pendingLevels > 0 && !g.over) { openCards(); acc = 0; break; }
    }
    if (n >= maxSteps) acc = 0;
    perf.steps += n;
  }
  fx.update(dt);
  R.draw(g, app);
  hudT -= dt;
  if (live && hudT <= 0) { hudT = 1 / 15; updateHud(); renderSkillbar(); checkNewEnemies(live); }
  const work = performance.now() - t0;
  perf.frames++;
  perf.workSum += work;
  perf.frameSum += dt * 1000;
  if (work > perf.maxWork) perf.maxWork = work;
  if (perf.frames >= 60) {
    perf.work = perf.workSum / perf.frames;
    perf.frame = perf.frameSum / perf.frames;
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
  if (!g || app.paused || app.cardsOpen || g.over || app.confirmOpen) return;
  const { x, y } = fieldPos(ev);
  // 1) 스킬 조준 중이면 그 자리에 시전
  if (app.aim) {
    const a = app.aim;
    const h = a.h;
    if (g.heroes.includes(h) && S.castSkill(g, h, x, y)) { skillFx(h); handleEvents(g, true); }
    cancelAim();
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
function endPress(ev) {
  const g = app.g;
  if (!press || !g) { press = null; return; }
  const p0 = press;
  press = null;
  if (app.drag) {
    const d = app.drag;
    app.drag = null;
    if (d.slot !== undefined && S.swapHeroes(g, d.h, d.slot)) { A.sfx.card(); vibrate(10); } else if (g.swapCd > 0) toast('자리 바꾸기는 잠깐 뒤에 다시!', 1000);
    return;
  }
  if (ev.type === 'pointerup') showHeroBubble(p0.h);
}
canvas.addEventListener('pointerup', endPress);
canvas.addEventListener('pointercancel', endPress);
const SLOT_XS = [34, 92, 150, 210, 268, 326];
function vibrate(ms) { if (!app.touched) return; try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* 무시 */ } }

// ─── 스킬 바 · 조준 ─────────────────────────────────
const skillbar = $('#skillbar');
$('#h-fx').addEventListener('click', () => ACTS.fxInfo());
const aimbar = $('#aimbar');
function useSkillBtn(slot) {
  const g = app.g;
  if (!g || app.paused || app.cardsOpen || g.over) return;
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
  if (S.castSkill(g, h)) { skillFx(h); handleEvents(g, true); }
}
function cancelAim() { app.aim = null; aimbar.hidden = true; }
aimbar.addEventListener('click', (ev) => { if (ev.target.closest('[data-aim]')) { A.sfx.tap(); cancelAim(); } });
skillbar.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-slot]');
  if (!b) return;
  A.unlock();
  useSkillBtn(Number(b.dataset.slot));
});
function skillFx(h) {
  const sk = h.def.skill;
  fx.text(h.x, h.y - 80, sk.name + '!', h.def.color, 20, 1.1, -26);
  fx.ring(h.x, h.y, 10, 80, 0.5, h.def.color, 5);
  A.sfx.join();
  app.tutSkillDone = true;
}
function renderSkillbar() {
  const g = app.g;
  if (!g) return;
  const list = g.heroes.filter((h) => h.def.skill).sort((a, b) => a.slot - b.slot);
  const key = list.map((h) => h.id + h.lv).join(',');
  if (skillbar.dataset.key !== key) {
    skillbar.dataset.key = key;
    skillbar.dataset.n = list.length;
    skillbar.innerHTML = list.map((h) => `<button class="sk" data-slot="${h.slot}" style="--c:${h.def.color}"><span class="ring"></span>${av(h.def)}<em>${esc(h.def.skill.name)}</em><i class="cd"></i></button>`).join('');
  }
  let ready = false;
  for (const b of skillbar.children) {
    const h = g.heroes.find((o) => o.slot === Number(b.dataset.slot));
    if (!h) continue;
    const sk = h.def.skill;
    const pct = Math.round((1 - Math.max(0, h.skillCd) / sk.cd) * 100);
    b.style.setProperty('--p', pct);
    const r = h.skillCd <= 0;
    if (r && !b.classList.contains('ready')) vibrate(12);
    b.classList.toggle('ready', r);
    b.classList.toggle('aiming', !!(app.aim && app.aim.h === h));
    b.querySelector('.cd').textContent = r ? 'READY' : Math.ceil(h.skillCd);
    if (r) ready = true;
  }
  // 튜토리얼: 1-1 에서 처음 스킬이 준비되면 알려 준다 · 1-2 에서는 지목
  if (ready && !tutDone('skill') && g.mode === 'stage' && g.stage <= 2) { setTut('skill'); showTip('⬇ 스킬 버튼이 반짝! 눌러서 필살기를 써 봐요', 5000); skillbar.classList.add('tut'); setTimeout(() => skillbar.classList.remove('tut'), 5000); }
  if (!tutDone('focus') && g.mode === 'stage' && g.stage === 2 && g.wave >= 1 && g.enemies.length > 3) { setTut('focus'); showTip('👆 진상을 탭하면 "지목"! 모두가 그 진상부터 때려요', 5000); }
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
function showHeroBubble(h) {
  const g = app.g;
  if (!g) return;
  app.infoHero = h;
  app.infoRange = S.heroRange(g, h);
  bubble.className = 'bubble hero';
  bubble.innerHTML = heroInfoHtml(h.def, false) + `<p class="ip">Lv.${h.lv}${h.lv < 3 ? ` → Lv3 ${esc(h.def.perks[3])}` : h.lv < 5 ? ` → Lv5 ${esc(h.def.perks[5])}` : ' MAX'} · 끌어서 자리 바꾸기</p>`;
  placeBubble(h.x, h.y - 110);
  bubble.hidden = false;
  clearTimeout(showHeroBubble.t);
  showHeroBubble.t = setTimeout(hideBubble, 3200);
  A.sfx.tap();
}
function showEnemyBubble(e) {
  bubble.className = 'bubble enemy';
  bubble.innerHTML = `<div class="ih"><em class="new">NEW</em><b>${e.def.name}</b>${clsTag(e.def.cls)}</div><p class="ia">${esc(ENEMY_TIPS[e.type] || '')}</p>`;
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
$('#btn-mute').addEventListener('click', () => { A.setMuted(!A.isMuted()); syncMute(); });
$('#btn-ult').addEventListener('click', () => {
  const g = app.g;
  if (!g || app.paused || app.cardsOpen) return;
  if (!S.useUlt(g)) { toast(`총공지 충전 중… ${Math.floor(g.ult)}%`, 1000); return; }
  handleEvents(g, true);
});
document.addEventListener('keydown', (e) => {
  if (app.confirmOpen) { if (e.key === 'Escape') closeConfirm(false); return; }
  if (e.key === 'Escape' || e.key === 'p') { if (app.screen === 'play' && !app.cardsOpen) { if (app.paused) resumeGame(); else pauseGame(); } }
  if (e.key === ' ' && app.g && !app.paused && !app.cardsOpen) { S.useUlt(app.g); handleEvents(app.g, true); }
  if (app.cardsOpen && ['1', '2', '3'].includes(e.key) && performance.now() >= app.cardLockUntil) pickCard(Number(e.key) - 1);
});
// 화면을 떠나면(홈 버튼·앱 전환·뒤로) 이어하기 저장 + 일시정지
function onHide() {
  if (app.screen === 'play' && app.g && !app.g.over) {
    saveSnap();
    if (!app.cardsOpen && !app.paused && !app.ending) pauseGame();
  }
  A.pauseBgm();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) onHide();
  else if (app.screen === 'play' || app.screen === 'menu') last = performance.now();
});
window.addEventListener('pagehide', onHide);

// ─── 화면들 ──────────────────────────────────────────
function show(html, cls = '') {
  SH.closeShare();
  const same = ui.firstElementChild && ui.firstElementChild.dataset.scr === app.screen;
  ui.innerHTML = `<div class="screen ${cls} ${same ? 'same' : 'enter'}" data-scr="${app.screen}">${html}</div>`;
  return ui.firstElementChild;
}
ui.addEventListener('click', (ev) => {
  // 게임 중 '‹ 게임월드' 로 나가기 전에 한 번 묻는다 (지금 판은 이어하기로 남는다)
  const link = ev.target.closest('a.back[href="/"]');
  if (link && app.g && !app.g.over && app.screen === 'play') {
    ev.preventDefault();
    const d = app.g.lastSnap;
    confirmBox({ title: '게임월드로 나갈까요?', sub: `지금 판은 웨이브 ${Math.max(1, d ? d.wave : 1)} 처음부터 이어할 수 있어요`, ok: '나가기', cancel: '취소' })
      .then((ok) => { if (ok) leaveToHub(); });
    return;
  }
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  A.unlock();
  const act = b.dataset.act;
  if (act !== 'pick' && act !== 'partner' && act !== 'confirmPick') A.sfx.tap();
  ACTS[act] && ACTS[act](b);
});
const ACTS = {
  menu: () => showMenu(),
  stages: () => showStages(),
  next: () => showPrep('stage', nextStage()),
  shop: () => showShop(),
  shopTab: (b) => { app.shopTab = b.dataset.tab; showShop(); },
  ranking: () => showRanking(),
  rankTab: (b) => { app.rankTab = b.dataset.tab; showRanking(); },
  howto: () => showHowto(),
  mute: () => { A.setMuted(!A.isMuted()); syncMute(); },
  share: () => SH.shareInvite(),
  shareResult: () => { if (app.shareData) SH.openResultShare(app.shareData, stage); },
  chapter: (b) => {
    const c = Number(b.dataset.ch);
    const first = (c - 1) * STAGES_PER_CHAPTER + 1;
    if (!stageUnlocked(first)) { toast(`${stageLabel(first - 1)}을 깨면 열려요`); return; }
    app.chapterTab = c;
    app.selStage = chapterOf(nextStage()) === c ? nextStage() : first;
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
  endless: () => {
    if (!P().endlessUnlocked) { toast(`무한 도전은 ${stageLabel(ENDLESS_UNLOCK)}을 깨면 열려요`); return; }
    showPrep('endless', 0);
  },
  deckSlot: (b) => deckTapSlot(Number(b.dataset.i)),
  rosterPick: (b) => deckPickHero(b.dataset.id),
  deckPreset: (b) => { app.deckI = Number(b.dataset.k); app.deckSel = -1; saveDecks(); showPrep(app.mode, app.stage); },
  autoDeck: () => { autoDeck(); A.sfx.levelUp(); toast('상성에 맞춰 덱을 짰어요!', 1400); showPrep(app.mode, app.stage); },
  gearItem: (b) => showGearCard(Number(b.dataset.id)),
  gearSlot: (b) => showGearPicker(b.dataset.hero, b.dataset.slot),
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
  dexCard: (b) => showDexCard(b.dataset.kind, b.dataset.id),
  skill: (b) => useSkillBtn(Number(b.dataset.slot)),
  aimCancel: () => cancelAim(),
  fxInfo: () => { const g = app.g; if (g) toast(`${g.mapFx.icon} ${g.mapFx.name} — ${g.mapFx.desc}`, 2600); },
  go: () => startRun({ mode: app.mode, stage: app.stage }),
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
const coinsPill = () => `<span class="coins-pill"><i class="ci"></i>${fmt(P().coins || 0)}</span>`;

function showMenu() {
  app.screen = 'menu';
  app.g = null;
  app.paused = false;
  app.cardsOpen = false;
  hud.hidden = true;
  guardOn();
  layout();
  R.setTheme(1);
  if (!app.demo) app.demo = makeDemo();
  fx.reset();
  const p = P();
  const next = nextStage();
  const allDone = (p.maxStage || 0) >= STAGE_COUNT;
  const expPct = p.expToNext ? Math.round((p.exp / p.expToNext) * 100) : 0;
  const progress = `<span>진행 <b>${p.maxStage ? stageLabel(p.maxStage) : '-'}</b></span><span class="st">★ <b>${p.totalStars || 0}</b>/${STAGE_COUNT * 3}</span>`;
  const prof = app.guest
    ? `<div class="profile"><div class="lv">🙂</div><div class="info"><div class="name">손님</div>
        <div class="meta"><span><i class="ci"></i><b>${fmt(p.coins)}</b></span>${progress}</div></div></div>
       <div class="guest-note">손님 기록은 이 기기에만 · <a href="/">로그인</a>하면 랭킹 등록!</div>`
    : `<div class="profile"><div class="lv"><span><small>LV</small>${p.level}</span></div><div class="info">
        <div class="name">${esc(app.nickname || '랑방 멤버')}</div>
        <div class="meta"><span><i class="ci"></i><b>${fmt(p.coins)}</b></span>${progress}</div>
        <div class="pexp"><div style="width:${expPct}%"></div></div></div></div>`;
  const snap = loadSnap();
  const endlessOn = p.endlessUnlocked;
  show(`
    <div class="topbar"><a class="back" href="/">‹ 게임월드</a><div class="tb-right"><button class="share-btn" data-act="share">📤 공유하기</button><button class="icon-btn" data-act="mute">${A.isMuted() ? '🔇' : '🔊'}</button></div></div>
    <div class="keyart"><img src="/img/lb/keyart.webp" alt="" onerror="this.parentNode.classList.add('noart');this.remove()"></div>
    <div class="logo"><img class="emblem" src="/img/lb/emblem.webp" alt="" onerror="this.remove()"><h1>랑방 대전</h1><div class="tag">덱을 짜고 진상을 막아라! · 30스테이지 디펜스</div></div>
    <div class="spacer"></div>
    <div class="menu-panel">
    <div class="panel">${app.profileLoaded ? prof : '<div class="empty-msg" style="padding:8px"><span class="spin">⏳</span> 불러오는 중…</div>'}</div>
    <div class="gap"></div>
    ${snap ? `<button class="btn pink resume-btn" data-act="resumeSnap">⏯ 이어하기 <small>${esc(snapLabel(snap))} 부터</small></button><div class="gap"></div>` : ''}
    <button class="btn primary" data-act="next">${allDone ? '▶ 3-10 다시 도전' : `▶ 다음 스테이지 ${stageLabel(next)}`}<small>${esc(stageName(next))}${stageBosses(next).length ? ' · 👑 보스' : ''}</small></button>
    <div class="gap"></div>
    <div class="grid2">
      <button class="btn" data-act="stages"><i>🗺️</i>스테이지</button>
      <button class="btn ${endlessOn ? '' : 'locked'}" data-act="endless"><i>${endlessOn ? '♾️' : '🔒'}</i>무한 도전<small>${endlessOn ? `최고 W${p.bestWave || 0}` : `${stageLabel(ENDLESS_UNLOCK)} 클리어`}</small></button>
    </div>
    <div class="gap"></div>
    <div class="grid4">
      <button class="btn" data-act="shop"><i>🛒</i>강화 상점</button>
      <button class="btn dexbtn" data-act="dex"><i>📚</i>도감${dexHasNew() ? '<span class="newdot">N</span>' : ''}</button>
      <button class="btn" data-act="ranking"><i>🏆</i>랭킹</button>
      <button class="btn" data-act="howto"><i>📖</i>방법</button>
    </div>
    </div>
  `, 'menu');
}

// ─── 스테이지 선택 ───────────────────────────────────
function showStages() {
  app.screen = 'stages';
  hud.hidden = true;
  if (!app.demo) { layout(); app.demo = makeDemo(); }
  const p = P();
  if (!app.selStage || !stageUnlocked(app.selStage)) app.selStage = nextStage();
  if (chapterOf(app.selStage) !== app.chapterTab) app.chapterTab = chapterOf(app.selStage);
  const ch = CHAPTERS[app.chapterTab - 1];
  R.setTheme(app.chapterTab);
  const tabs = CHAPTERS.map((c) => {
    const first = (c.id - 1) * STAGES_PER_CHAPTER + 1;
    const open = stageUnlocked(first);
    let stars = 0;
    for (let i = 0; i < STAGES_PER_CHAPTER; i++) stars += p.stages[first + i] || 0;
    return `<button class="ch-tab ${c.id === app.chapterTab ? 'on' : ''} ${open ? '' : 'locked'}" data-act="chapter" data-ch="${c.id}" style="--cc:${c.color}">
      <b>${open ? '' : '🔒 '}${c.id}장</b><small>${esc(c.name)}</small><em>★${stars}/30</em></button>`;
  }).join('');
  const nodes = [];
  for (let i = 0; i < STAGES_PER_CHAPTER; i++) {
    const s = (app.chapterTab - 1) * STAGES_PER_CHAPTER + i + 1;
    const open = stageUnlocked(s);
    const st = p.stages[s] || 0;
    const boss = stageBosses(s).length > 0;
    const cur = s === nextStage() && !st;
    nodes.push(`<button class="node ${open ? '' : 'locked'} ${boss ? 'boss' : ''} ${cur ? 'cur' : ''} ${s === app.selStage ? 'sel' : ''} ${st ? 'done' : ''}" data-act="selStage" data-s="${s}">
      <span class="nb">${open ? (boss ? '👑' : '') : '🔒'}<b>${stageLabel(s)}</b></span>
      <span class="ns">${open ? starStr(st) : ''}</span></button>`);
  }
  const s = app.selStage;
  const st = p.stages[s] || 0;
  const en = stageEnemies(s);
  const prevEn = s > 1 ? new Set(stageEnemies(s - 1)) : new Set();
  const enemies = en.filter((id) => !ENEMIES[id].dot).map((id) => `<button class="en ${ENEMIES[id].boss ? 'b' : ''}" data-act="info" data-kind="enemy" data-id="${id}">${av(ENEMIES[id])}${!prevEn.has(id) && s > 1 ? '<em>NEW</em>' : ''}</button>`).join('');
  const cw = stageClasses(s);
  const clsLine = Object.keys(cw).sort((a, b) => cw[b] - cw[a]).map((c) => `${clsTag(c)}<small>${Math.round(cw[c] * 100)}%</small>`).join('');
  const rec = recommendAttrs(s);
  const fxd = stageFx(s);
  const rw = stageReward(s, 3, st, p.items.coupon);
  const rewardTxt = st
    ? `<span>다시 깨면 <i class="ci"></i><b>${fmt(stageReward(s, st, st, p.items.coupon).total)}</b>~</span>${st < 3 ? `<span>★ 더 받으면 +${fmt(Math.round(clearCoins(s) * 0.5))}/개</span>` : '<span class="ok">★★★ 완벽!</span>'}`
    : `<span>첫 클리어 최대 <i class="ci"></i><b>${fmt(rw.total)}</b></span><span>(첫 보너스 +${fmt(rw.first)} · 별 보너스 포함)</span>`;
  const unlockHero = Object.keys(HERO_UNLOCK).find((h) => HERO_UNLOCK[h] === s);
  show(`
    ${topbar(true, coinsPill())}
    <h2 class="title">스테이지</h2>
    <div class="ch-tabs">${tabs}</div>
    <div class="ch-banner" style="--cc:${ch.color}"><b>${ch.id}장 · ${esc(ch.name)}</b><span>${esc(ch.desc)}</span></div>
    <div class="nodes">${nodes.join('')}</div>
    <div class="panel stage-info">
      <div class="si-head"><b>${stageLabel(s)} ${esc(stageName(s))}</b><span class="si-stars">${starStr(st)}</span></div>
      <div class="si-meta"><span>🌊 ${STAGE_WAVES}웨이브</span>${stageBosses(s).length ? `<span class="boss">👑 ${stageBosses(s).map((b) => ENEMIES[b].name).join(' + ')}</span>` : ''}</div>
      <div class="si-enemies">${enemies}</div>
      <div class="si-cls">${clsLine}</div>
      <div class="si-rec">추천 속성 ${rec.length ? rec.map(attrTag).join('') : '<small>아무나 OK</small>'}</div>
      <div class="si-fx">${fxd.icon} <b>${esc(fxd.name)}</b> <small>${esc(fxd.desc)}</small></div>
      <div class="si-reward">${rewardTxt}</div>
      ${unlockHero && !API.heroUnlocked(p, unlockHero) ? `<div class="si-unlock">${HEROES[unlockHero].hidden ? '✨ 처음 깨면 HIDDEN 멤버가 합류!' : '🦊 처음 깨면 새 멤버가 합류!'}</div>` : ''}
      <div class="si-tip">★★★ 입구 70% 이상 · ★★ 35% 이상 · ★ 클리어</div>
    </div>
    <div class="spacer"></div>
    <button class="btn primary" data-act="prep">출전 준비 ▶</button>
  `, 'dim stages-screen');
}

// ─── 출전 준비: 동료 고르기 ──────────────────────────
const attrTag = (a) => (ATTRS[a] ? `<span class="attr" style="--ac:${ATTRS[a].color}">${ATTRS[a].icon}${ATTRS[a].name}</span>` : '');
const clsTag = (c) => (CLASSES[c] ? `<span class="attr cls" style="--ac:${CLASSES[c].color}">${CLASSES[c].icon}${CLASSES[c].name}</span>` : '');
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
    <p class="ia">⚔️ ${esc(d.attack || d.desc)} <span class="rg">사거리 ${Array.isArray(d.range) ? d.range[0] : d.range}</span></p>
    ${sk ? `<p class="is">✨ <b>${esc(sk.name)}</b> ${esc(sk.desc)} <span class="rg">쿨 ${sk.cd}초${sk.target ? ' · 찍어서 사용' : ''}</span></p>` : ''}
    ${full ? `<p class="ip">Lv3 ${esc(d.perks[3])} · Lv5 ${esc(d.perks[5])}</p><p class="ip">${attrTag(d.attr)} ${esc(strongWeak(d.attr))}</p>` : ''}`;
}
function enemyInfoHtml(e) {
  const good = Object.keys(ATTRS).filter((a) => typeMul(a, e.cls) > 1).map((a) => ATTRS[a].icon + ATTRS[a].name);
  const bad = Object.keys(ATTRS).filter((a) => typeMul(a, e.cls) < 1).map((a) => ATTRS[a].icon + ATTRS[a].name);
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
  return `팀: ${ids.map((id) => `${HEROES[id].name}${ATTRS[HEROES[id].attr].icon}`).join(' + ')}${rec.length ? ` · 추천 속성 ${rec.map((a) => ATTRS[a].icon).join('')} ${hit ? `<b class="ok">${hit}명 맞음</b>` : '<b class="no">0명</b>'}` : ''}${best.length ? `<br><small>💡 추천 팀: 방장 + ${best.map((id) => HEROES[id].name).join(' + ')}</small>` : ''}`;
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
function saveDecks() { try { localStorage.setItem(DECK_KEY, JSON.stringify({ decks: app.decks, i: app.deckI })); } catch { /* 무시 */ } }
// 자리 우선순위: 가운데부터 (7칸이면 3 → 2 → 4 …)
const posOrder = () => (nPosNow() >= 7 ? [3, 2, 4, 1, 5, 0, 6] : [2, 3, 1, 4, 0, 5]);
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
  const n = nPosNow(), max = deckSlotsNow();
  const mine = new Set(owned());
  for (let k = 0; k < 3; k++) {
    let d = (app.decks[k] || []).slice(0, n).map((id) => (id && mine.has(id) ? id : null));
    while (d.length < n) d.push(null);
    const seenIds = new Set();
    d = d.map((id) => (id && !seenIds.has(id) && seenIds.add(id) ? id : null));
    let cnt = d.filter(Boolean).length;
    for (let i = n - 1; i >= 0 && cnt > max; i--) if (d[i]) { d[i] = null; cnt--; }
    if (!cnt) d = placeDeck(owned().filter((id) => ['bangjang', 'staff', 'gunman', 'gunnyeo'].includes(id) || true).slice(0, max));
    app.decks[k] = d;
  }
  saveDecks();
}
function autoDeck() {
  const s = app.mode === 'stage' ? app.stage : 20;
  const ids = recommendTeam(s, owned(), deckSlotsNow());
  app.decks[app.deckI] = placeDeck(ids);
  saveDecks();
}
function deckLine() {
  const ids = curDeck().filter(Boolean);
  const rec = app.mode === 'stage' ? recommendAttrs(app.stage) : [];
  const hit = ids.filter((id) => rec.includes(HEROES[id].attr)).length;
  const cnt = {};
  for (const id of ids) cnt[HEROES[id].attr] = (cnt[HEROES[id].attr] || 0) + 1;
  return `속성 ${Object.keys(ATTRS).map((a) => `${ATTRS[a].icon}${cnt[a] || 0}`).join(' ')}${rec.length ? ` · 추천 ${rec.map((a) => ATTRS[a].icon).join('')} ${hit ? `<b class="ok">${hit}명 맞음</b>` : '<b class="no">0명</b>'}` : ''}`;
}
function renderDeckField() {
  const n = nPosNow();
  const d = curDeck();
  const sel = app.deckSel;
  const selHero = sel >= 0 ? d[sel] : null;
  const lane = selHero && HEROES[selHero].lane;
  return `<div class="deck-field n${n}">${Array.from({ length: n }, (_, i) => {
    const id = d[i];
    const h = id && HEROES[id];
    return `<button class="dslot ${i === sel ? 'sel' : ''} ${h ? '' : 'empty'} ${i === sel && lane ? 'lane' : ''}" data-act="deckSlot" data-i="${i}" style="--c:${h ? h.color : '#555'}">
      ${h ? `${av(h)}<b>${h.name}</b><span class="pa">${ATTRS[h.attr].icon}</span>` : '<i>+</i>'}<em>${i + 1}</em></button>`;
  }).join('')}</div>`;
}
function showPrep(mode, s) {
  if (mode === 'stage' && !stageUnlocked(s)) s = nextStage();
  app.mode = mode;
  app.stage = s;
  app.screen = 'prep';
  hud.hidden = true;
  fixDeck();
  const p = P();
  const max = deckSlotsNow();
  const d = curDeck();
  const inDeck = new Set(d.filter(Boolean));
  R.setTheme(mode === 'stage' ? chapterOf(s) : 'endless');
  const roster = ['bangjang', ...partnerList()].map((id) => {
    const h = HEROES[id];
    if (!API.heroUnlocked(p, id)) return `<button class="pcard locked ${h.hidden ? 'hid' : ''}" data-act="rosterPick" data-id="${id}">${av(h, 'sil')}<b>???</b><small>${esc(stageLabel(HERO_UNLOCK[id]))} 클리어</small></button>`;
    return `<button class="pcard ${h.hidden ? 'hid' : ''} ${inDeck.has(id) ? 'on' : ''}" data-act="rosterPick" data-id="${id}">${av(h)}<span class="pa">${ATTRS[h.attr].icon}</span><b>${h.name}</b><small>+${p.heroes[id] || 0}</small></button>`;
  }).join('');
  const fxd = mode === 'stage' ? stageFx(s) : MAP_FX.none;
  const cw = mode === 'stage' ? stageClasses(s) : {};
  const cls = Object.keys(cw).sort((a, b) => cw[b] - cw[a]).slice(0, 3).map((c) => `${clsTag(c)}<small>${Math.round(cw[c] * 100)}%</small>`).join('');
  const head = mode === 'stage'
    ? `<h2 class="title">${stageLabel(s)} ${esc(stageName(s))}</h2><p class="sub">${STAGE_WAVES}웨이브${stageBosses(s).length ? ' · 👑 보스' : ''} · ${fxd.icon} ${esc(fxd.name)} · 최고 ${starStr(p.stages[s] || 0)}${p.perfects && p.perfects[s] ? ' · 💎' : ''}</p>`
    : `<h2 class="title">♾️ 무한 도전</h2><p class="sub">어디까지 버틸까? 최고 W${p.bestWave || 0} · 점수 ${fmt(p.bestScore || 0)}</p>`;
  show(`
    <div class="topbar"><button class="back" data-act="${mode === 'stage' ? 'stages' : 'menu'}">‹ 뒤로</button>${coinsPill()}</div>
    ${head}
    ${cls ? `<div class="si-cls prep-cls">적 ${cls}</div>` : ''}
    <div class="deck-top">
      <div class="deck-tabs">${[0, 1, 2].map((k) => `<button class="${k === app.deckI ? 'on' : ''}" data-act="deckPreset" data-k="${k}">덱 ${k + 1}</button>`).join('')}</div>
      <button class="btn ghost auto" data-act="autoDeck">✨ 추천 덱</button>
    </div>
    <div class="deck-wrap"><div class="deck-rope"></div>${renderDeckField()}</div>
    <div class="teamline" id="deckline">${inDeck.size}/${max}명 · ${deckLine()}</div>
    <p class="sub deck-help">자리를 누르고 멤버를 고르세요 · 두 자리를 차례로 누르면 바꿔요 · 새총·지팡이는 <b>자기 줄</b>만 쏴요</p>
    <div class="pgrid roster">${roster}</div>
    <div class="pdesc" id="pdesc">${app.deckFocus ? heroInfoHtml(HEROES[app.deckFocus], true) : '<p class="ip">멤버를 누르면 설명이 나와요</p>'}</div>
    <div class="spacer"></div>
    <button class="btn primary" data-act="go" ${inDeck.size ? '' : 'disabled'}>출동! 🚪</button>
  `, 'dim prep-screen');
}
function deckTapSlot(i) {
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
function openCards() {
  const g = app.g;
  app.cardsOpen = true;
  cancelAim(); hideBubble(); app.drag = null; press = null;
  app.rerolls = 1;
  app.cards = rollFor(g);
  renderCards(true);
  if (DEBUG.autopick) setTimeout(() => { if (app.cardsOpen) pickCard(0); }, 120);
}
function rollFor(g) {
  return DEBUG.hidden ? S.rollCards(g, 3, { hiddenChance: 0.5 }) : S.rollCards(g);
}
function cardHtml(c, i) {
  const r = RARITY[c.rarity];
  let icon = `<span>${c.icon}</span>`;
  if (c.hero) icon = av(HEROES[c.hero]) + `<span class="cattr">${ATTRS[HEROES[c.hero].attr].icon}</span>`;
  let stack = '';
  if (c.kind === 'global') stack = `<span class="stack">${c.stack}→${c.stack + 1}</span>`;
  return `<button class="card ${c.rarity} ${app.cardSel === i ? 'sel' : ''}" data-act="pick" data-i="${i}">
    <div class="ico">${icon}</div>
    <div class="body"><span class="rar">${r.name}</span><b>${esc(c.title)}</b><p>${esc(c.desc)}</p>${c.sub ? `<span class="role">${esc(c.sub)}</span>` : ''}</div>
    ${stack}</button>`;
}
function renderCards(fresh) {
  const g = app.g;
  if (fresh) { app.cardSel = -1; app.cardLockUntil = performance.now() + CARD_LOCK_MS; }
  const slots = [];
  const bySlot = {};
  for (const h of g.heroes) bySlot[h.slot] = h;
  for (let s = 0; s < 6; s++) {
    const h = bySlot[s];
    slots.push(h ? `<div class="mini">${av(h.def)}<span>${h.lv >= 5 ? 'MAX' : 'Lv' + h.lv}</span></div>` : '<div class="mini empty">+</div>');
  }
  const welcome = g.welcomePicks > 0;
  const locked = performance.now() < app.cardLockUntil;
  const sel = app.cards[app.cardSel];
  show(`
    <div class="lvup">${welcome ? '<h2 class="welcome">🍹 웰컴 드링크!</h2><p>시작 전에 카드 한 장 먼저 골라요</p>' : `<h2>LEVEL UP!</h2><p>Lv.${g.level} — 카드를 누르고 선택!${g.pendingLevels > 1 ? ` (남은 선택 ${g.pendingLevels})` : ''}</p>`}</div>
    <div class="card-list ${locked ? 'locked' : ''}">${app.cards.map(cardHtml).join('')}</div>
    <div class="card-foot">
      <button class="btn ghost" data-act="reroll" ${app.rerolls > 0 ? '' : 'disabled'}>🎲 다시 뽑기 (${app.rerolls})</button>
      <button class="btn primary pick-btn" data-act="confirmPick" ${sel ? '' : 'disabled'}>${sel ? '선택!' : '카드를 골라요'}</button>
    </div>
    <div class="team">${slots.join('')}</div>
  `, 'cards-screen');
  if (locked) {
    clearTimeout(renderCards.t);
    renderCards.t = setTimeout(() => { const l = ui.querySelector('.card-list'); if (l) l.classList.remove('locked'); }, app.cardLockUntil - performance.now() + 10);
  }
  if (fresh) A.sfx.card();
  if (fresh && app.cards.some((c) => c.rarity === 'hidden')) { fx.flash('#ff9ff0', 0.3); }
}
function tapCard(i) {
  if (!app.cardsOpen || !app.cards || !app.cards[i]) return;
  if (performance.now() < app.cardLockUntil) return; // 막 떴을 때 잘못 누른 것
  if (app.cardSel === i) { pickCard(i); return; } // 고른 카드를 한 번 더 누르면 확정
  app.cardSel = i;
  A.sfx.card();
  for (const el of ui.querySelectorAll('.card[data-i]')) el.classList.toggle('sel', Number(el.dataset.i) === i);
  const b = ui.querySelector('.pick-btn');
  if (b) { b.disabled = false; b.textContent = '선택!'; }
}
function rerollCards() {
  if (app.rerolls <= 0 || !app.cardsOpen) return;
  app.rerolls--;
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
  g.pendingLevels = Math.max(0, g.pendingLevels - 1);
  if (g.welcomePicks > 0) g.welcomePicks--;
  A.sfx.pick();
  handleEvents(g, true);
  if (c.kind === 'global') fx.text(180, g.rowY - 90, c.title + '!', RARITY[c.rarity].color, 18, 1.2, -20);
  if (g.pendingLevels > 0) {
    app.rerolls = 1;
    app.cards = rollFor(g);
    renderCards(true);
    if (DEBUG.autopick) setTimeout(() => { if (app.cardsOpen) pickCard(0); }, 120);
  } else {
    app.cardsOpen = false;
    app.cards = null;
    app.cardSel = -1;
    ui.innerHTML = '';
    last = performance.now();
  }
}

// ─── 일시정지 ────────────────────────────────────────
function pauseGame() {
  if (!app.g || app.g.over || app.cardsOpen || app.ending) return;
  app.paused = true;
  cancelAim(); hideBubble();
  const g = app.g;
  const w = Math.max(1, g.lastSnap ? g.lastSnap.wave : g.wave);
  show(`
    <div class="topbar"><a class="back" href="/">‹ 게임월드</a><div class="tb-right"><button class="share-btn" data-act="share">📤 공유하기</button><button class="icon-btn" data-act="mute">${A.isMuted() ? '🔇' : '🔊'}</button></div></div>
    <div class="pause-box">
      <h2>일시정지</h2>
      <p class="sub">${g.mode === 'stage' ? `스테이지 ${stageLabel(g.stage)} · 웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}` : `무한 도전 · 웨이브 ${Math.max(1, g.wave)}`}</p>
      <button class="btn primary" data-act="resume">계속하기</button>
      <button class="btn" data-act="howto">게임 방법</button>
      <button class="btn" data-act="later">나중에 이어하기 <small>메뉴로 나가요 · 웨이브 ${w} 처음부터 이어서</small></button>
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
  guardOff();
  app.screen = 'result';
  hud.hidden = true;
  const sum = S.summary(g, g.t);
  const mins = Math.floor(g.t / 60), secs = Math.floor(g.t % 60);
  const time = `${mins}:${String(secs).padStart(2, '0')}`;
  const totalDmg = g.heroes.reduce((a, h) => a + h.dmgDone, 0) || 1;
  const heroes = g.heroes.slice().sort((a, b) => b.dmgDone - a.dmgDone);
  const mvp = heroes.map((h, i) => `<div class="row ${i === 0 ? 'top' : ''}">${av(h.def)}<span class="nm">${h.def.name}</span>
    <div class="bar"><div style="width:${Math.round((h.dmgDone / totalDmg) * 100)}%"></div></div><span class="pc">${Math.round((h.dmgDone / totalDmg) * 100)}%</span></div>`).join('');
  const stageMode = g.mode === 'stage';
  const win = victory && stageMode;
  let title, sub, top;
  if (stageMode) {
    title = win ? `${stageLabel(g.stage)} 클리어!` : quit ? '오늘은 여기까지' : `${stageLabel(g.stage)} 실패…`;
    sub = win ? `입구 내구도 ${sum.hpPct}% 로 지켜냈다!` : `웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}에서 막혔어요 · ${quit ? '다음엔 끝까지!' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0]}`;
    top = win
      ? `<div class="big-stars">${[1, 2, 3].map((k) => `<span class="${k <= g.stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s">★</span>`).join('')}</div>
         <div class="star-rule">${sum.perfect ? '<b class="perfect">💎 PERFECT! 입구가 한 번도 안 맞았다</b>' : g.stars >= 3 ? '완벽 방어! ★★★ (입구 무피해면 PERFECT)' : g.stars === 2 ? '★★★ 까지 입구 70% 이상 남기기' : '★★ 는 입구 35% 이상 남기면!'}</div>`
      : `<div class="fail-tip">💡 ${FAIL_TIPS[(Math.random() * FAIL_TIPS.length) | 0]}</div>`;
  } else {
    title = `무한 도전 W${sum.wave}`;
    sub = quit ? '다음엔 더 멀리!' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0];
    top = `<div class="score-big"><small>점수</small><b>${fmt(sum.score)}</b></div>`;
  }
  const buttons = [];
  if (win && g.stage < STAGE_COUNT) buttons.push(`<button class="btn primary" data-act="nextStage">다음 스테이지 ${stageLabel(g.stage + 1)} ▶</button>`);
  if (stageMode && !win) buttons.push('<button class="btn primary" data-act="again">다시 도전</button>', '<div class="gap"></div><div class="grid2"><button class="btn" data-act="shop"><i>🛒</i>강화하러 가기</button><button class="btn" data-act="stages"><i>🗺️</i>스테이지 선택</button></div>');
  else if (stageMode) buttons.push('<div class="gap"></div><div class="grid2"><button class="btn" data-act="again"><i>🔁</i>다시 하기</button><button class="btn" data-act="stages"><i>🗺️</i>스테이지 선택</button></div>');
  else buttons.push('<button class="btn primary" data-act="again">다시 도전</button>', '<div class="gap"></div><button class="btn ghost" data-act="menu">메뉴로</button>');
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
    <div class="panel mvp">${mvp}</div>
    <div class="server" id="srv">${win || !stageMode ? '<span class="spin">⏳</span> 보상 받는 중…' : ''}</div>
    <div class="spacer"></div>
    <button class="btn share-result" data-act="shareResult">📤 결과 공유하기 <small>친구에게 기록 카드 보내고 도전장 날리기</small></button>
    <div class="gap"></div>
    ${buttons.join('')}
  `, `result ${stageMode ? 'compact' : ''} ${win || (!stageMode && sum.wave >= 10) ? 'win' : 'lose'}`);
  app.shareData = {
    title, win, mode: g.mode, stageLabel: stageMode ? stageLabel(g.stage) : '', stars: win ? g.stars : 0,
    score: sum.score, wave: sum.wave, waves: g.totalWaves, kills: sum.kills, bossKills: sum.bossKills,
    time, nickname: app.guest ? '' : app.nickname,
    heroes: heroes.slice(0, 6).map((h) => ({ img: h.def.img, name: h.def.name, color: h.def.color })),
  };
  if (win || !stageMode) saveResult(sum, g);
}
const LOSE_LINES = ['진상들이 랑방을 점령했다… 다음엔 꼭!', '"한 잔만 더~" 술진상이 문을 열고 들어왔다', '먹튀 인간들이 경험치를 털어 갔다…', '인피: "랑방? 이제 우리 아지트야~"', '여왕벌: "여기 이제 내 가게야~"'];
const FAIL_TIPS = [
  '강화 상점에서 동료와 방장을 강화하면 훨씬 쉬워져요',
  '🚪 튼튼한 문을 사면 입구 내구도가 늘어요',
  '독재자를 먼저 잡으세요 — 곁의 진상들이 덜 아파해요',
  '사기꾼이 "들켰다!" 할 때가 기회! 서명훈의 욕이 특히 잘 먹혀요',
  '뭉쳐 다니는 패거리는 범위 공격·관통 공격에 약해요',
  '총공지는 적이 몰려올 때 아껴 뒀다가 쓰세요',
];

async function saveResult(sum, g) {
  const box = $('#srv');
  if (app.debugRun) {
    if (box) box.innerHTML = '<div class="guest-note">디버그 판(?wave · ?god · ?stress · ?nosave · 잠긴 스테이지)은 기록을 저장하지 않아요</div>';
    return;
  }
  const stageMode = g.mode === 'stage';
  const body = stageMode
    ? { stage: sum.stage, stars: sum.stars, perfect: sum.perfect, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, durationSec: sum.durationSec, hpPct: sum.hpPct, seen: sum.seen }
    : { wave: sum.wave, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, durationSec: sum.durationSec, seen: sum.seen };
  const r = stageMode ? await API.postStage(body, app.guest) : await API.postEndless(body, app.guest);
  if (r.ok && r.profile) app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '알 수 없는 오류')}</div>`; return; }
  const p = P();
  const rw = r.reward || {};
  const lines = [];
  if (stageMode) {
    lines.push(`<div class="rw"><span>클리어 보상</span><b>+${fmt(rw.clear || 0)}</b></div>`);
    if (rw.first) lines.push(`<div class="rw hl"><span>🎉 첫 클리어 보너스</span><b>+${fmt(rw.first)}</b></div>`);
    if (rw.star) lines.push(`<div class="rw hl"><span>⭐ 새 별 ${rw.newStars}개 보너스</span><b>+${fmt(rw.star)}</b></div>`);
    if (rw.perfect) lines.push(`<div class="rw hl perf"><span>💎 PERFECT${rw.firstPerfect ? ' (첫 퍼펙트!)' : ''}</span><b>+${fmt(rw.perfect)}</b></div>`);
    if (rw.bonus) lines.push(`<div class="rw"><span>🎟️ 단골 쿠폰</span><b>+${fmt(rw.bonus)}</b></div>`);
  }
  lines.push(`<div class="rw total"><span><i class="ci"></i>${stageMode ? '받은 코인' : `웨이브 ${sum.wave} 보상`}</span><b>+${fmt(rw.total || 0)}</b></div>`);
  const badges = [];
  if (r.levelUp) badges.push(`<span class="badge pink">계정 레벨 업! Lv.${p.level}</span>`);
  if (r.newBestWave) badges.push('<span class="badge">최고 웨이브 갱신!</span>');
  if (r.newBestScore) badges.push('<span class="badge">최고 점수 갱신!</span>');
  if (r.rank) badges.push(`<span class="badge">랭킹 ${r.rank}위</span>`);
  const unlocks = (r.unlockedHeroes || []).map((id) => {
    const d = HEROES[id];
    return `<div class="unlock ${d.hidden ? 'hid' : ''}">${av(d)}<div><small>${d.hidden ? 'HIDDEN 멤버 합류!' : '새 멤버 합류!'}</small><b>${d.name}</b><span>${esc(d.role.replace('HIDDEN · ', ''))} — 이제 출전 동료로 고를 수 있어요</span></div></div>`;
  }).join('');
  const endless = r.endlessUnlocked ? '<div class="unlock"><span class="big-ico">♾️</span><div><small>새 모드 열림!</small><b>무한 도전</b><span>어디까지 버티나 랭킹 경쟁!</span></div></div>' : '';
  const drops = (rw.drops || []).map((it) => `<span class="drop r-${it.r}" style="--rc:${GEAR_RARITY[it.r].color}">${GEAR[it.t].icon}<b>${esc(GEAR[it.t].name)}</b><small>${GEAR_RARITY[it.r].name}${it.sold ? ` · 가방 꽉 참 → +${it.sold}` : ''}</small></span>`).join('');
  box.innerHTML = `<div class="rewards">${lines.join('')}</div>${drops ? `<div class="drops"><small>🎁 장비 획득</small>${drops}</div>` : ''}${unlocks}${endless}
    <div class="own">${badges.join('')}<span>보유 <i class="ci"></i>${fmt(p.coins)}</span>${app.guest ? ' · <span class="dimtxt">손님 기록은 이 기기에만</span>' : ''}</div>`;
  if (unlocks) { fx.flash('#ff9ff0', 0.4); A.sfx.join(); }
}

// ─── 강화 상점 (영웅 강화 · 아이템) ─────────────────
function showShop() {
  app.screen = 'shop';
  hud.hidden = true;
  const p = P();
  const tab = app.shopTab;
  const max = p.maxMeta || 20;
  let body;
  if (tab === 'heroes') {
    body = ['bangjang', ...partnerList()].map((id) => {
      const d = HEROES[id];
      const lv = (p.heroes || {})[id] || 0;
      const ok = API.heroUnlocked(p, id);
      if (!ok) {
        return `<div class="up locked ${d.hidden ? 'hid' : ''}">${av(d, 'sil')}<div class="mid"><b>???${d.hidden ? '<em>HIDDEN</em>' : ''}</b>
          <small>🔒 ${esc(unlockText(id))}</small></div><button class="btn" disabled>잠김</button></div>`;
      }
      const cost = API.costOf(p, id);
      const can = cost !== null && p.coins >= cost;
      return `<div class="up ${d.hidden ? 'hid' : ''}"><span class="upav" data-act="info" data-kind="hero" data-id="${id}">${av(d)}</span><div class="mid"><b>${d.name}${d.hidden ? '<em>HIDDEN</em>' : ''}${attrTag(d.attr)}<span class="lvtag">+${lv}</span></b>
        <small>공격력 +${Math.round(lv * RULES.metaDmgPerLevel * 100)}%${cost !== null ? ` → +${Math.round((lv + 1) * RULES.metaDmgPerLevel * 100)}%` : ''} · ${lv}/${max}</small>
        <div class="pbar"><div style="width:${(lv / max) * 100}%"></div></div></div>
        <button class="btn ${can ? 'primary' : ''}" data-act="buy" data-id="${id}" ${can ? '' : 'disabled'}>${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button></div>`;
    }).join('');
  } else if (tab === 'gear') {
    body = gearTabHtml();
  } else {
    body = ITEM_IDS.map((id) => {
      const it = ITEMS[id];
      const lv = (p.items || {})[id] || 0;
      const cost = API.itemCostOf(p, id);
      const can = cost !== null && p.coins >= cost;
      const cur = id === 'drink' ? it.desc(lv) : lv ? it.desc(itemValue(id, lv)) : '아직 없음';
      const nxt = cost === null ? '' : id === 'drink' ? `${lv + 1}장` : '+' + it.desc(itemValue(id, lv + 1)).split('+').pop();
      const pips = Array.from({ length: it.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="up item"><span class="it-ico">${it.icon}</span><div class="mid"><b>${it.name}<span class="lvtag">Lv.${lv}</span></b>
        <small>${esc(cur)}${nxt ? ` → <span class="nx">${esc(nxt)}</span>` : ''}</small>
        <div class="pips">${pips}</div></div>
        <button class="btn ${can ? 'primary' : ''}" data-act="buyItem" data-id="${id}" ${can ? '' : 'disabled'}>${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button></div>`;
    }).join('');
  }
  show(`
    ${topbar(true, coinsPill())}
    <h2 class="title">강화 상점</h2>
    <div class="tabs"><button class="${tab === 'heroes' ? 'on' : ''}" data-act="shopTab" data-tab="heroes">💪 영웅</button><button class="${tab === 'gear' ? 'on' : ''}" data-act="shopTab" data-tab="gear">🗡️ 장비</button><button class="${tab === 'items' ? 'on' : ''}" data-act="shopTab" data-tab="items">🎒 아이템</button></div>
    <p class="sub">${tab === 'heroes' ? `코인으로 영구 강화 · 1단계마다 공격력 +${Math.round(RULES.metaDmgPerLevel * 100)}% (최대 ${max})` : tab === 'gear' ? `스테이지를 깨면 장비가 떨어져요 · 멤버마다 무기·액세서리 한 칸씩 (가방 ${(p.gear || []).length}/80)` : '한 번 사면 모든 스테이지에 계속 적용돼요 · 덱 칸도 여기서!'}</p>
    ${app.guest ? '<div class="guest-note" style="margin:0 0 10px">손님 코인·강화는 이 기기에만 · <a href="/">로그인</a>하면 어디서든!</div>' : ''}
    <div class="up-list">${body}</div>
    <p class="sub" style="margin-top:12px">코인은 스테이지를 깨면 받아요 · 처음 깰 때와 별을 새로 받을 때 보너스!</p>
  `, 'dim');
}
async function buyUpgrade(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⏳</span>';
  const r = await API.upgradeHero(id, app.guest);
  if (r.ok && r.profile) {
    app.profile = r.profile;
    A.sfx.levelUp();
    toast(`${HEROES[id].name} 강화 완료! (+${app.profile.heroes[id]})`);
  } else toast(r.message || '강화하지 못했어요');
  if (app.screen === 'shop') showShop();
}
async function buyItemAct(id, btn) {
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⏳</span>';
  const r = await API.buyItem(id, app.guest);
  if (r.ok && r.profile) {
    app.profile = r.profile;
    A.sfx.levelUp();
    toast(`${ITEMS[id].icon} ${ITEMS[id].name} Lv.${app.profile.items[id]}!`);
  } else toast(r.message || '사지 못했어요');
  if (app.screen === 'shop') showShop();
}

// ─── 도감 (아군 · 악당) ──────────────────────────────
const DEX_ENEMIES = () => Object.keys(ENEMIES).filter((id) => !ENEMIES[id].dot);
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
function firstStageOf(id) { for (let s = 1; s <= STAGE_COUNT; s++) if (stageEnemies(s).includes(id)) return s; return 0; }
function showDex() {
  app.screen = 'dex';
  hud.hidden = true;
  const tab = app.dexTab || 'hero';
  const ids = tab === 'hero' ? DEX_HEROES() : DEX_ENEMIES();
  const kind = tab === 'hero' ? 'hero' : 'enemy';
  const nH = DEX_HEROES().filter((id) => dexKnown('hero', id)).length, nE = DEX_ENEMIES().filter((id) => dexKnown('enemy', id)).length;
  const v = dexViewed();
  const cards = ids.map((id) => {
    const d = kind === 'hero' ? HEROES[id] : ENEMIES[id];
    const ok = dexKnown(kind, id);
    const isNew = ok && !v.has((kind === 'hero' ? 'h:' : 'e:') + id);
    const tag = kind === 'hero' ? ATTRS[d.attr].icon : CLASSES[d.cls].icon;
    return `<button class="dexc ${ok ? '' : 'unknown'} ${d.boss ? 'boss' : ''} ${d.hidden ? 'hid' : ''}" data-act="dexCard" data-kind="${kind}" data-id="${id}">
      ${av(d, ok ? '' : 'sil')}<b>${ok ? d.name : '???'}</b>${ok ? `<span class="dt">${tag}</span>` : ''}${isNew ? '<span class="newdot">N</span>' : ''}</button>`;
  }).join('');
  show(`
    ${topbar(true)}
    <h2 class="title">📚 랑방 도감</h2>
    <div class="tabs"><button class="${tab === 'hero' ? 'on' : ''}" data-act="dexTab" data-tab="hero">🙋 아군 ${nH}/${DEX_HEROES().length}</button><button class="${tab === 'enemy' ? 'on' : ''}" data-act="dexTab" data-tab="enemy">😈 악당 ${nE}/${DEX_ENEMIES().length}</button></div>
    <p class="sub">${tab === 'hero' ? '스테이지를 깨면 새 멤버가 합류해요' : '만나 본 진상만 기록돼요 · 눌러서 약점 확인!'}</p>
    <div class="dex-grid">${cards}</div>
  `, 'dim');
}
function bar(label, v) { return `<div class="sbar"><span>${label}</span><i><b style="width:${Math.round(clamp(v, 0.05, 1) * 100)}%"></b></i></div>`; }
function showDexCard(kind, id) {
  const d = kind === 'hero' ? HEROES[id] : ENEMIES[id];
  if (!d) return;
  const ok = dexKnown(kind, id);
  closeInfoCard();
  const box = document.createElement('div');
  box.className = 'info-modal';
  let body;
  if (!ok) {
    body = `<div class="ih"><b>???</b></div><p class="ia">${kind === 'hero' ? `🔒 ${esc(unlockText(id))}` : '아직 만나지 못한 진상이에요'}</p>`;
  } else if (kind === 'hero') {
    const rg = Array.isArray(d.range) ? d.range[0] : d.range;
    body = `${heroInfoHtml(d, true)}
      <div class="sbars">${bar('사거리', rg / 620)}${bar('공격 속도', 0.42 / d.interval)}${bar('한 방', d.dmg / 62)}</div>
      <p class="ip">${esc(d.desc)}</p>
      <p class="ip">${HERO_UNLOCK[id] ? `합류: ${stageLabel(HERO_UNLOCK[id])} 클리어` : '처음부터 함께'}</p>`;
    markViewed(['h:' + id]);
  } else {
    const fs = firstStageOf(id);
    body = `${enemyInfoHtml(d)}
      <div class="sbars">${bar('체력', d.hp / 320)}${bar('속도', d.speed / 95)}${bar('입구 피해', d.atk / 36)}</div>
      <p class="ip">등장: ${fs ? `${stageLabel(fs)} 부터` : '무한 도전'}${d.boss ? ' · 보스' : ''}</p>`;
    markViewed(['e:' + id]);
  }
  box.innerHTML = `<div class="info-card">${av(d, ok ? '' : 'sil')}<div class="ic-body">${body}</div><button class="btn ghost" data-ic="x">닫기</button></div>`;
  stage.appendChild(box);
  box.addEventListener('click', (ev) => { if (ev.target === box || ev.target.closest('[data-ic]')) { closeInfoCard(); if (app.screen === 'dex') showDex(); } });
  A.sfx.tap();
}

// ─── 장비 ────────────────────────────────────────────
const gearName = (it) => `${GEAR[it.t].icon} ${GEAR[it.t].name}${it.lv ? ` +${it.lv}` : ''}`;
function gearStatText(it) {
  const g = GEAR[it.t];
  return `${GEAR_STATS[g.stat].name} +${(gearValue(it.t, it.r, it.lv) * 100).toFixed(1)}%`;
}
function equippedBy(p, gid) { for (const [h, sl] of Object.entries(p.equip || {})) for (const k of ['w', 'a']) if (sl[k] === gid) return h; return null; }
function gearTabHtml() {
  const p = P();
  const heroes = owned();
  const find = (gid) => (p.gear || []).find((x) => x.id === gid);
  const rows = heroes.map((id) => {
    const d = HEROES[id];
    const sl = (p.equip || {})[id] || {};
    const cell = (k) => { const it = find(sl[k]); return `<button class="gslot ${it ? 'r-' + it.r : 'empty'}" data-act="gearSlot" data-hero="${id}" data-slot="${k}" ${it ? `style="--rc:${GEAR_RARITY[it.r].color}"` : ''}>${it ? `${GEAR[it.t].icon}<small>${it.lv ? '+' + it.lv : ''}</small>` : `<i>${k === 'w' ? '🗡️' : '💍'}</i>`}</button>`; };
    return `<div class="grow">${av(d)}<b>${d.name}</b>${cell('w')}${cell('a')}</div>`;
  }).join('');
  const bag = (p.gear || []).slice().sort((a, b) => GEAR_RARITY[b.r].mul - GEAR_RARITY[a.r].mul || b.lv - a.lv).map((it) => {
    const eq = equippedBy(p, it.id);
    return `<button class="gitem" data-act="gearItem" data-id="${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${GEAR[it.t].icon}${it.lv ? `<small class="lv">+${it.lv}</small>` : ''}${eq ? `<small class="eq">${HEROES[eq].name}</small>` : ''}</button>`;
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
    let r;
    if (act === 'equip') r = await API.equipGear(a1, a2, a3 === 'x' ? null : Number(a3), app.guest);
    else if (act === 'enh') r = await API.enhanceGear(Number(a1), app.guest);
    else if (act === 'sell') { if (!(await confirmBox({ title: '이 장비를 팔까요?', ok: '팔기', cancel: '취소', danger: true }))) { b.disabled = false; return; } r = await API.sellGear(Number(a1), app.guest); }
    if (r && r.ok && r.profile) { app.profile = r.profile; A.sfx.levelUp(); toast(act === 'sell' ? `+${r.sold} 코인` : act === 'enh' ? '강화 성공!' : '장착!', 1200); }
    else if (r) toast(r.message || '못 했어요');
    closeInfoCard();
    if (app.screen === 'shop') showShop();
    if (act === 'enh' && r && r.ok) showGearCard(Number(a1));
  });
  A.sfx.tap();
}
function showGearCard(gid) {
  const p = P();
  const it = (p.gear || []).find((x) => x.id === gid);
  if (!it) return;
  const cost = gearEnhanceCost(it.r, it.lv);
  const eq = equippedBy(p, gid);
  const heroes = owned().map((h) => `<button class="btn mini" data-g="equip:${h}:${GEAR[it.t].slot}:${gid}">${HEROES[h].name}</button>`).join('');
  gearModal(`<div class="gc-head" style="--rc:${GEAR_RARITY[it.r].color}"><span class="gc-ico">${GEAR[it.t].icon}</span><div><b>${esc(GEAR[it.t].name)}${it.lv ? ` +${it.lv}` : ''}</b><small>${GEAR_RARITY[it.r].name} · ${GEAR[it.t].slot === 'w' ? '무기' : '액세서리'}${eq ? ` · ${HEROES[eq].name} 장착 중` : ''}</small></div></div>
    <p class="ia">${esc(gearStatText(it))}${cost !== null ? ` → +${(gearValue(it.t, it.r, it.lv + 1) * 100).toFixed(1)}%` : ' (MAX)'}</p>
    <div class="gc-row"><button class="btn primary" data-g="enh:${gid}" ${cost === null || p.coins < cost ? 'disabled' : ''}>강화 ${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button><button class="btn" data-g="sell:${gid}">팔기 +${fmt(gearSellValue(it.r, it.lv))}</button></div>
    <h3 class="sec">누구에게 낄까요?</h3><div class="gc-heroes">${heroes}</div>`);
}
function showGearPicker(hero, slot) {
  const p = P();
  const cur = ((p.equip || {})[hero] || {})[slot];
  const list = (p.gear || []).filter((x) => GEAR[x.t].slot === slot).sort((a, b) => gearValue(b.t, b.r, b.lv) * GEAR_RARITY[b.r].mul - gearValue(a.t, a.r, a.lv) * GEAR_RARITY[a.r].mul);
  const rows = list.map((it) => `<button class="gpick ${it.id === cur ? 'on' : ''}" data-g="equip:${hero}:${slot}:${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${gearName(it)}<small>${GEAR_RARITY[it.r].name} · ${esc(gearStatText(it))}${equippedBy(p, it.id) && equippedBy(p, it.id) !== hero ? ` · ${HEROES[equippedBy(p, it.id)].name}` : ''}</small></button>`).join('');
  gearModal(`<div class="ih"><b>${HEROES[hero].name} · ${slot === 'w' ? '무기' : '액세서리'}</b></div>
    <div class="gpick-list">${rows || '<p class="sub">이 칸에 낄 장비가 없어요</p>'}</div>
    ${cur ? `<button class="btn" data-g="equip:${hero}:${slot}:x">빼기</button>` : ''}`);
}

// ─── 랭킹 ────────────────────────────────────────────
async function showRanking() {
  app.screen = 'ranking';
  const tab = app.rankTab;
  show(`
    ${topbar(true)}
    <h2 class="title">🏆 랑방 명예의 전당</h2>
    <div class="tabs"><button class="${tab === 'stage' ? 'on' : ''}" data-act="rankTab" data-tab="stage">🗺️ 스테이지</button><button class="${tab === 'endless' ? 'on' : ''}" data-act="rankTab" data-tab="endless">♾️ 무한 도전</button></div>
    <p class="sub">${tab === 'stage' ? '최고 스테이지 → 총 별 → 먼저 도달한 순' : '최고 웨이브 → 최고 점수 순'}</p>
    <div class="rank-list" id="rk"><div class="empty-msg"><span class="spin">⏳</span> 불러오는 중…</div></div>
    <div class="spacer"></div>
    <div class="my-rank" id="myrk"></div>
  `, 'dim');
  const res = await API.loadRanking(tab);
  const box = $('#rk');
  if (!box || app.screen !== 'ranking' || app.rankTab !== tab) return;
  const my = $('#myrk');
  if (!res) { box.innerHTML = '<div class="empty-msg">랭킹을 불러오지 못했어요<br>잠시 후 다시 해 주세요</div>'; return; }
  const cell = (r) => (tab === 'stage'
    ? `<span class="w"><b>${r.stageLabel}</b><small>★ ${r.totalStars}</small></span>`
    : `<span class="w"><b>W${r.bestWave}</b><small>${fmt(r.bestScore)}점</small></span>`);
  const medal = ['🥇', '🥈', '🥉'];
  box.innerHTML = res.ranking.length
    ? res.ranking.map((r) => `<div class="rank r${r.rank} ${res.me && res.me.username === r.username ? 'me' : ''}"><span class="no">${medal[r.rank - 1] || r.rank}</span>
      <span class="nm">${esc(r.nickname)}<small>Lv.${r.level || 1}</small></span>${cell(r)}</div>`).join('')
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
  const enemies = Object.values(ENEMIES).filter((e) => !e.dot).map((e) => `<div data-act="info" data-kind="enemy" data-id="${e.id}">${av(e)}<span><b>${e.name}</b> ${CLASSES[e.cls] ? CLASSES[e.cls].icon : ''}${e.boss ? ' 👑' : ''}<br>${ENEMY_TIPS[e.id] || ''}</span></div>`).join('');
  show(`
    <div class="topbar"><button class="back" data-act="${back}">‹ ${fromPlay ? '게임으로' : '뒤로'}</button></div>
    <h2 class="title">게임 방법</h2>
    <div class="howto">
      <div class="it"><i>🗺️</i><div><b>스테이지</b>를 하나씩 깨요. 3챕터 × 10스테이지, 한 스테이지는 ${STAGE_WAVES}웨이브. x-5 · x-10 은 <b>보스</b>!</div></div>
      <div class="it"><i>⭐</i><div>클리어할 때 입구 내구도가 70% 이상이면 <b>★★★</b>, 35% 이상이면 ★★, 그 밖엔 ★. 처음 깰 때와 별을 새로 받을 때 코인 보너스! 입구가 <b>한 번도 안 맞고</b> 깨면 <b>💎 PERFECT</b> — 코인 더 + 첫 퍼펙트는 희귀 이상 장비 확정!</div></div>
      <div class="it"><i>🧩</i><div>출동 전에 <b>덱</b>을 짜요. 5명(상점에서 6·7번째 칸 구매)을 원하는 <b>자리</b>에 세우고, 덱은 3개까지 저장. 스테이지 정보에 나오는 진상 유형을 보고 속성을 맞추면 유리!</div></div>
      <div class="it"><i>↕️</i><div><b>줄 공격</b> 멤버(건전남 새총 · 강성구 지팡이)는 <b>자기 앞 줄</b>만 쏴요. 진상이 많이 오는 가운데 줄에 세우면 좋아요. 끌어서 옮길 때 줄이 빛나요.</div></div>
      <div class="it"><i>🎒</i><div>스테이지를 깨면 <b>장비</b>가 떨어져요 (일반 · 희귀 · 영웅 · 전설). 멤버마다 무기 · 액세서리 한 칸씩 — 상점 <b>장비</b> 탭에서 끼우고, 강화하고, 남는 건 팔아요.</div></div>
      <div class="it"><i>✨</i><div>보스가 큰 기술을 쓴 뒤엔 잠깐 <b>빈틈</b>(금빛)! 그때 스킬을 몰아 쓰면 1.5배로 들어가요.</div></div>
      <div class="it"><i>🚪</i><div>진상들이 골목 위에서 몰려와요. 우리 멤버들이 <b>자동으로 공격</b>해요. 벨벳 로프까지 온 진상은 <b>랑방 입구</b>를 두드려요.</div></div>
      <div class="it"><i>👆</i><div>진상을 <b>탭하면 집중 공격</b>. 경험치는 <b>저절로</b> 모여요. 게이지가 차면 <b>📣 총공지</b>로 화면 전체 공격!</div></div>
      <div class="it"><i>🃏</i><div>레벨이 오르면 카드 3장! 카드를 <b>눌러 고르고 → 선택</b>. 덱 멤버 레벨업(3·5레벨에 특수 능력) · 전체 강화. 카드는 스테이지마다 새로 시작해요.</div></div>
      <div class="it"><i>🛒</i><div>코인으로 <b>강화 상점</b>에서 멤버를 영구 강화(최대 20)하고 아이템(튼튼한 문 · 단골 쿠폰 · 확성기 배터리 · 행운 부적 · 웰컴 드링크)을 사요.</div></div>
      <div class="it"><i>✨</i><div>1-6 · 1-10 · 2-3 · 2-5 · 2-7 · 2-10 · 3-2 · 3-3 을 처음 깨면 <b>새 멤버</b>가 합류해요 (<b>HIDDEN</b> 멤버도 있어요!). 힐러·탱커·한 방 딜러까지 — 덱에 넣어 써요.</div></div>
      <div class="it"><i>♾️</i><div>1-10을 깨면 <b>무한 도전</b>이 열려요. 어디까지 버티나 랭킹 경쟁! 무한 도전에선 아직 못 만난 멤버도 카드로 <b>체험 합류</b>해요. 25웨이브부터는 <b>진상 연합 회장</b>이 10웨이브마다 찾아와요.</div></div>
      <div class="it"><i>💸</i><div>사채업자는 살아 있는 동안 <b>이자</b>로 입구를 떼어 가요. 빨리 잡으면 <b>빚 탕감</b>! 뒤에 숨은 <b>인피 총무</b>는 보호막을 뿌리니 탭해서 먼저 잡아요.</div></div>
      <div class="it"><i>⏯</i><div>게임 중에 뒤로 가기를 눌러도 괜찮아요 — 일시정지가 떠요. 앱을 닫아도 메뉴에서 <b>이어하기</b>로 그 웨이브부터 다시!</div></div>
    </div>
    <h2 class="title" style="font-size:calc(var(--u)*18);margin-top:14px">조작법</h2>
    <div class="howto">
      <div class="it"><i>✨</i><div>아래 <b>스킬 바</b>의 멤버 얼굴이 반짝이면(READY) 눌러서 필살기! 찍는 스킬은 누른 다음 <b>필드를 탭</b>해서 위치를 정해요 (그동안 시간이 느려져요).</div></div>
      <div class="it"><i>🎯</i><div>진상을 탭하면 <b>지목</b> — 모두가 그 진상부터 때려요. 총무·독재자·들킨 사기꾼에게 딱!</div></div>
      <div class="it"><i>🔁</i><div>필드의 멤버를 <b>끌어다 놓으면</b> 자리를 바꿔요. 짧게 누르면 공격 방식·스킬·사거리를 보여 줘요.</div></div>
    </div>
    <h2 class="title" style="font-size:calc(var(--u)*18);margin-top:14px">속성 상성</h2>
    <p class="sub">머리 쓰는 진상(유혹·정치)엔 🗣️말빨 · 🍶술, 몸 쓰는 진상(폭력·진상)엔 👊힘 · 💖매력! (×${TYPE_STRONG} / ×${TYPE_WEAK})</p>
    <table class="tchart"><tr><th></th>${Object.values(CLASSES).map((c) => `<th>${c.icon}<br>${c.name}</th>`).join('')}</tr>
      ${Object.values(ATTRS).map((a) => `<tr><th>${a.icon} ${a.name}</th>${Object.keys(CLASSES).map((c) => { const m = typeMul(a.id, c); return `<td class="${m > 1 ? 'st' : m < 1 ? 'wk' : ''}">${m > 1 ? '◎' : m < 1 ? '△' : '·'}</td>`; }).join('')}</tr>`).join('')}
    </table>
    <p class="sub" style="margin-top:6px">스테이지마다 <b>맵 효과</b>(🌧️비 · 🌫️안개 · 💡정전 · 🎤노래방 …)도 있어요. 스테이지 정보에서 추천 속성을 보고 팀을 짜요!</p>
    <h2 class="title" style="font-size:calc(var(--u)*18);margin-top:14px">진상 도감</h2>
    <div class="enemy-grid">${enemies}</div>
  `, 'dim');
}
const ENEMY_TIPS = {
  yeokko: '빠름. 가까이 오면 여자 멤버를 홀린다',
  namkko: '빠름. 가까이 오면 남자 멤버를 홀린다',
  drunk: '갈지자 걸음. 죽으면 술병이 터져 주변 진상에게 피해',
  thug: '느리지만 단단함. 약한 공격은 덜 아프다',
  mukti: '엄청 빠름. 경험치를 훔쳐 도망! 잡으면 되찾는다',
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
  boss_union: '무한 도전 25웨이브부터. 갑질·회식·독재·이자·회비를 번갈아 쓴다',
  vomit: '"우웩!" 멤버 발밑에 토 → 공속↓. 죽으면 토 웅덩이가 진상을 빠르게 — 멀리서 잡자',
  couple: '안 맞으면 "꽁냥꽁냥" 회복, 윙크 안 통함. 반쯤 때리면 "헤어져!" 둘로',
  handsy: '로프에 닿으면 멤버를 붙잡아 못 쏘게 한다. 잡으면 풀려요 — 먼저 지목!',
  gao: '가오 중엔 피해 -60%. 말빨 공격이나 치명타로 "가오 깨짐!" → 더 아프다',
  selfie: '멀리서 "찰칵!" 멤버 눈부심 → 절반은 빗나감. 체력 낮음',
  cutter: '엄청 빠르고, 앞줄 근처에서 한 번 훌쩍 새치기',
  kkondae: '느리고 튼튼. "라떼는 말이야~" 근처 멤버 공속↓. 기절시키면 조용',
  spam: '가끔 "카톡!" 알림을 풀고, 죽으면 알림 3개가 돌진',
  spam_dot: '작은 알림. 빠르게 돌진',
};

// ─── 시작 ────────────────────────────────────────────
function startGate() {
  let ok = false;
  try { ok = sessionStorage.getItem('langbang:gate') === '1'; } catch { ok = false; }
  if (ok || Q.has('autostart') || DEBUG.stage || Q.has('nogate')) return;
  const box = document.createElement('div');
  box.className = 'gate';
  box.innerHTML = `<div class="gate-in"><img class="emblem" src="/img/lb/emblem.webp" alt="" onerror="this.remove()"><h1>랑방 대전</h1>
    <div class="gate-bar"><i></i></div><p class="gate-txt">멤버들 모으는 중… 0%</p><button class="btn primary gate-btn" disabled>👆 터치해서 시작</button></div>`;
  stage.appendChild(box);
  const bar = box.querySelector('.gate-bar i'), txt = box.querySelector('.gate-txt'), btn = box.querySelector('.gate-btn');
  const t0 = performance.now();
  const tick = () => {
    const imgs = Object.values(R.images);
    const done = imgs.filter((im) => !im.src || im.complete).length;
    const pct = Math.round((done / Math.max(1, imgs.length)) * 100);
    bar.style.width = pct + '%';
    if (pct >= 100 || performance.now() - t0 > 6000) { txt.textContent = '준비 완료! 소리를 켜고 시작해요'; btn.disabled = false; box.classList.add('ready'); return; }
    txt.textContent = `멤버들 모으는 중… ${pct}%`;
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
async function boot() {
  try { if (window.gwSettings && window.gwSettings.reduceMotion) document.body.classList.add('rm'); } catch { /* 무시 */ }
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
  const r = await API.loadProfile();
  app.profile = r.profile;
  app.guest = r.guest;
  app.profileLoaded = true;
  app.nickname = r.nickname || '';
  app.selStage = nextStage();
  app.chapterTab = chapterOf(app.selStage);
  if (r.error) toast(r.error);
  if (app.screen === 'menu') showMenu();
  if (Q.get('partner') && HEROES[Q.get('partner')]) app.partner = Q.get('partner');
  if (DEBUG.stage) startRun({ mode: 'stage', stage: DEBUG.stage, force: true });
  else if (Q.has('autostart')) startRun(Q.has('endless') ? { mode: 'endless', force: true } : { mode: 'stage', stage: nextStage(), force: true });
}

// 테스트/디버그용 핸들
window.__lb = {
  get g() { return app.g; },
  get app() { return app; },
  perf,
  S,
  fx,
  pickCard,
  tapCard,
  resumeRun,
  loadSnap,
  showScreen: (name) => ({ menu: showMenu, stages: showStages, shop: showShop, ranking: showRanking, howto: showHowto }[name] || showMenu)(),
  startRun: (partner, stageNum, mode) => { if (partner) app.partner = partner; return startRun({ mode: mode || (stageNum === 0 ? 'endless' : 'stage'), stage: stageNum || nextStage(), force: true }); },
};
boot();
