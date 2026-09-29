// 랑방 대전 — 메인: 게임 루프(고정 60Hz) · 입력 · HUD · 메뉴/스테이지/상점/카드/결과 화면
import {
  HEROES, ENEMIES, RULES, FIELD, BASE_HEROES, UNLOCK_HEROES, HIDDEN_HEROES, LOCKED_HEROES, RARITY, SCORE,
  CHAPTERS, STAGE_COUNT, STAGE_WAVES, STAGES_PER_CHAPTER, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS,
  chapterOf, stageNo, stageLabel, stageName, parseStage, stageEnemies, stageBosses, stageReward, clearCoins, itemValue, starsFor,
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
try { app.partner = localStorage.getItem('langbang:partner') || 'gunman'; } catch { /* 무시 */ }

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
    localStorage.setItem(SNAP_KEY, JSON.stringify({ v: 1, acct: API.accountKey(), partner: app.partner, at: Date.now(), snap: g.lastSnap }));
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
function guardOff() {
  if (!guarded) return;
  guarded = false;
  ignorePop++;
  try { history.back(); } catch { ignorePop--; }
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  guarded = false;
  if (app.screen !== 'play' || !app.g || app.g.over) return;
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
  if (!heroOk(app.partner)) app.partner = 'gunman';
  app.mode = mode;
  app.stage = st;
  const p = P();
  const unlocked = DEBUG.hidden ? LOCKED_HEROES.slice() : p.unlocked || [];
  layoutForNewRun();
  const g = S.createGame({
    H: app.logicalH, meta: p.heroes || {}, items: p.items || {}, partner: app.partner, god: DEBUG.god || DEBUG.stress > 0,
    mode, stage: st, unlocked, startWave: DEBUG.wave || 0,
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
  app.partner = d.partner || app.partner;
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
        fx.ring(e.x, e.y, 20, e.r, 0.7, '#7fe7ff', 5);
        if (e.n) fx.text(e.x, e.y - 80, '여왕의 보호막!', '#9feaff', 15, 1);
        break;
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
        if (g.mode === 'stage') fx.banner(`${stageLabel(g.stage)} 클리어!!`, starStr(e.stars), '#c77a00', 2.4, 'big');
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
const PROJ_COL = { notice: '#ffd23f', warn: '#ff6b5a', bullet: '#6dffb0', flower: '#ff9fd0', bottle: '#7be38f', wink: '#ff5fcf', cane: '#e0b27a', swear: '#ff9a3c' };
const BOSS_COL = { queen: '#b01e8c', boss_thug: '#9a1a1a', boss_gapjil: '#5a1ec0', boss_inpi: '#137a4a' };
const POOF = ['퍽!', '빡!', '뿅', '컷!', '퇴장~', '아웃!'];
const CONFETTI = ['#ffd23f', '#ff4fd8', '#6ff0ff', '#7dff9a', '#ff8a00', '#ffffff'];

// ─── HUD ─────────────────────────────────────────────
const H$ = {
  wave: $('#h-wave'), left: $('#h-left'), kills: $('#h-kills'), score: $('#h-score'), xp: $('#h-xp'), lv: $('#h-lv'),
  hp: $('#h-hp'), hpLag: $('#h-hp-lag'), hpText: $('#h-hptext'), stars: $('#h-stars'), ult: $('#btn-ult'), boss: $('#bossbar'), bossName: $('#boss-name'), bossFill: $('#boss-fill'),
  mute: $('#btn-mute'), baseBox: document.querySelector('.base-hp'),
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
    const ts = fx.slowmo > 0 ? 0.22 : 1;
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
  if (live && hudT <= 0) { hudT = 1 / 15; updateHud(); }
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
  const types = ['yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'scammer', 'inpi_clique'];
  while (alive < DEBUG.stress) {
    const e = S.spawnEnemy(g, types[alive % types.length], undefined, -20 - Math.random() * 200, { hpMul: 40 });
    e.stopY -= Math.random() * 260;
    alive++;
  }
}

// ─── 입력 ────────────────────────────────────────────
// 화면 탭 = 그 적 집중 공격 (경험치 보석은 저절로 모인다)
canvas.addEventListener('pointerdown', (ev) => {
  A.unlock();
  const g = app.g;
  if (!g || app.paused || app.cardsOpen || g.over) return;
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * FIELD.W;
  const y = ((ev.clientY - r.top) / r.height) * g.H;
  const f = S.setFocus(g, x, y);
  fx.ring(x, y, 4, 40, 0.3, f ? '#ff3b5c' : '#ffffff', 2);
  if (f) { fx.text(f.x, f.y - f.def.size * 0.8, '집중!', '#ff6b80', 12, 0.6); A.sfx.tap(); }
});
document.addEventListener('pointerdown', () => { A.unlock(); if (app.screen !== 'result') A.playBgm(); }, { passive: true });

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
  ui.innerHTML = `<div class="screen ${cls}">${html}</div>`;
  return ui.firstElementChild;
}
ui.addEventListener('click', (ev) => {
  // 게임 중 '‹ 게임월드' 로 나가기 전에 한 번 묻는다 (지금 판은 이어하기로 남는다)
  const link = ev.target.closest('a.back[href="/"]');
  if (link && app.g && !app.g.over && app.screen === 'play') {
    ev.preventDefault();
    const d = app.g.lastSnap;
    confirmBox({ title: '게임월드로 나갈까요?', sub: `지금 판은 웨이브 ${Math.max(1, d ? d.wave : 1)} 처음부터 이어할 수 있어요`, ok: '나가기', cancel: '취소' })
      .then((ok) => { if (ok) { saveSnap(); guardOff(); setTimeout(() => { location.href = '/'; }, 60); } });
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
  partner: (b) => {
    const id = b.dataset.id;
    if (!heroOk(id)) { toast(unlockText(id) || '아직 합류하지 않았어요'); return; }
    app.partner = id;
    try { localStorage.setItem('langbang:partner', id); } catch { /* 무시 */ }
    A.sfx.card();
    for (const el of ui.querySelectorAll('.pcard[data-id]')) el.classList.toggle('on', el.dataset.id === app.partner);
    const d = HEROES[id];
    const box = $('#pdesc');
    if (box) box.innerHTML = partnerDesc(d);
  },
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
  guardOff();
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
    <div class="logo"><small>진상 컷! 스테이지 디펜스</small><h1>랑방 대전</h1><div class="tag">3개 챕터 30스테이지 — 우리 아지트 "랑방"을 지켜라!</div></div>
    <div class="hero-parade">${heroParade()}</div>
    <div class="panel">${app.profileLoaded ? prof : '<div class="empty-msg" style="padding:8px"><span class="spin">⏳</span> 불러오는 중…</div>'}</div>
    <div class="spacer"></div>
    ${snap ? `<button class="btn pink resume-btn" data-act="resumeSnap">⏯ 이어하기 <small>${esc(snapLabel(snap))} 부터</small></button><div class="gap"></div>` : ''}
    <button class="btn primary" data-act="next">${allDone ? '▶ 3-10 다시 도전' : `▶ 다음 스테이지 ${stageLabel(next)}`}<small>${esc(stageName(next))}${stageBosses(next).length ? ' · 👑 보스' : ''}</small></button>
    <div class="gap"></div>
    <div class="grid2">
      <button class="btn" data-act="stages"><i>🗺️</i>스테이지</button>
      <button class="btn ${endlessOn ? '' : 'locked'}" data-act="endless"><i>${endlessOn ? '♾️' : '🔒'}</i>무한 도전<small>${endlessOn ? `최고 W${p.bestWave || 0}` : `${stageLabel(ENDLESS_UNLOCK)} 클리어`}</small></button>
    </div>
    <div class="gap"></div>
    <div class="grid3">
      <button class="btn" data-act="shop"><i>🛒</i>강화 상점</button>
      <button class="btn" data-act="ranking"><i>🏆</i>랭킹</button>
      <button class="btn" data-act="howto"><i>📖</i>게임 방법</button>
    </div>
  `, 'menu dim-soft');
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
  const enemies = en.map((id) => `<span class="en ${ENEMIES[id].boss ? 'b' : ''}">${av(ENEMIES[id])}${!prevEn.has(id) && s > 1 ? '<em>NEW</em>' : ''}</span>`).join('');
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
      <div class="si-reward">${rewardTxt}</div>
      ${unlockHero && !API.heroUnlocked(p, unlockHero) ? `<div class="si-unlock">${HEROES[unlockHero].hidden ? '✨ 처음 깨면 HIDDEN 멤버가 합류!' : '🦊 처음 깨면 새 멤버가 합류!'}</div>` : ''}
      <div class="si-tip">★★★ 입구 70% 이상 · ★★ 35% 이상 · ★ 클리어</div>
    </div>
    <div class="spacer"></div>
    <button class="btn primary" data-act="prep">출전 준비 ▶</button>
  `, 'dim stages-screen');
}

// ─── 출전 준비: 동료 고르기 ──────────────────────────
function partnerDesc(d) {
  const meta = (P().heroes || {})[d.id] || 0;
  return `<b>${d.name}</b> <span class="role">${esc(d.role)}</span>${meta ? ` <em>강화 +${meta}</em>` : ''}<p>${esc(d.desc)}</p>`;
}
function showPrep(mode, s) {
  if (mode === 'stage' && !stageUnlocked(s)) s = nextStage();
  app.mode = mode;
  app.stage = s;
  app.screen = 'prep';
  hud.hidden = true;
  if (!heroOk(app.partner)) app.partner = 'gunman';
  const p = P();
  R.setTheme(mode === 'stage' ? chapterOf(s) : 'endless');
  const cards = partnerList().map((id) => {
    const d = HEROES[id];
    const ok = heroOk(id);
    const meta = p.heroes[id] || 0;
    if (!ok) {
      return `<button class="pcard locked ${d.hidden ? 'hid' : ''}" data-act="partner" data-id="${id}">${av(d, 'sil')}<b>???</b><small>${esc(stageLabel(HERO_UNLOCK[id]))} 클리어</small></button>`;
    }
    return `<button class="pcard ${d.hidden ? 'hid' : ''} ${app.partner === id ? 'on' : ''}" data-act="partner" data-id="${id}">${av(d)}<b>${d.name}</b><small>강화 +${meta}</small></button>`;
  }).join('');
  const bj = HEROES.bangjang;
  const drink = mode === 'stage' ? p.items.drink || 0 : 0;
  const head = mode === 'stage'
    ? `<h2 class="title">${stageLabel(s)} ${esc(stageName(s))}</h2><p class="sub">${STAGE_WAVES}웨이브${stageBosses(s).length ? ' · 👑 보스 등장' : ''} · 최고 기록 ${starStr(p.stages[s] || 0)}</p>`
    : `<h2 class="title">♾️ 무한 도전</h2><p class="sub">어디까지 버틸까? 최고 웨이브 W${p.bestWave || 0} · 점수 ${fmt(p.bestScore || 0)}</p>`;
  const buffs = [];
  if (p.items.door) buffs.push(`🚪 내구도 +${Math.round(itemValue('door', p.items.door) * 100)}%`);
  if (p.items.charm) buffs.push(`🍀 치명타 +${(itemValue('charm', p.items.charm) * 100).toFixed(1)}%`);
  if (p.items.battery) buffs.push(`🔋 총공지 +${Math.round(itemValue('battery', p.items.battery) * 100)}%`);
  if (drink) buffs.push(`🍹 시작 카드 ${drink}장`);
  show(`
    <div class="topbar"><button class="back" data-act="${mode === 'stage' ? 'stages' : 'menu'}">‹ 뒤로</button>${coinsPill()}</div>
    ${head}
    <div class="prep-leader">${av(bj)}<div><b>방장 <em>기본 출전</em>${p.heroes.bangjang ? ` <em class="c">강화 +${p.heroes.bangjang}</em>` : ''}</b><p>${esc(bj.role)} — 곁에 있으면 모두의 손이 빨라진다</p></div></div>
    <h3 class="sec">같이 갈 동료 한 명</h3>
    <div class="pgrid">${cards}</div>
    <div class="pdesc" id="pdesc">${partnerDesc(HEROES[app.partner])}</div>
    ${buffs.length ? `<div class="buffs">${buffs.map((b) => `<span>${b}</span>`).join('')}</div>` : `<div class="buffs dim"><span>🛒 강화 상점에서 아이템을 사면 더 강해져요</span></div>`}
    <div class="spacer"></div>
    <button class="btn primary" data-act="go">출동! 🚪</button>
  `, 'dim prep-screen');
}

// ─── 레벨업 카드 (고르고 → 선택 버튼, 뜬 직후 0.7초는 눌러도 무시) ─────
function openCards() {
  const g = app.g;
  app.cardsOpen = true;
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
  if (c.hero) icon = av(HEROES[c.hero]);
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
         <div class="star-rule">${g.stars >= 3 ? '완벽 방어! ★★★' : g.stars === 2 ? '★★★ 까지 입구 70% 이상 남기기' : '★★ 는 입구 35% 이상 남기면!'}</div>`
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
    ? { stage: sum.stage, stars: sum.stars, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, durationSec: sum.durationSec, hpPct: sum.hpPct }
    : { wave: sum.wave, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, durationSec: sum.durationSec };
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
  box.innerHTML = `<div class="rewards">${lines.join('')}</div>${unlocks}${endless}
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
      return `<div class="up ${d.hidden ? 'hid' : ''}">${av(d)}<div class="mid"><b>${d.name}${d.hidden ? '<em>HIDDEN</em>' : ''}<span class="lvtag">+${lv}</span></b>
        <small>공격력 +${Math.round(lv * RULES.metaDmgPerLevel * 100)}%${cost !== null ? ` → +${Math.round((lv + 1) * RULES.metaDmgPerLevel * 100)}%` : ''} · ${lv}/${max}</small>
        <div class="pbar"><div style="width:${(lv / max) * 100}%"></div></div></div>
        <button class="btn ${can ? 'primary' : ''}" data-act="buy" data-id="${id}" ${can ? '' : 'disabled'}>${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button></div>`;
    }).join('');
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
    <div class="tabs"><button class="${tab === 'heroes' ? 'on' : ''}" data-act="shopTab" data-tab="heroes">💪 영웅 강화</button><button class="${tab === 'items' ? 'on' : ''}" data-act="shopTab" data-tab="items">🎒 아이템</button></div>
    <p class="sub">${tab === 'heroes' ? `코인으로 영구 강화 · 1단계마다 공격력 +${Math.round(RULES.metaDmgPerLevel * 100)}% (최대 ${max})` : '한 번 사면 모든 스테이지에 계속 적용돼요'}</p>
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
  const enemies = Object.values(ENEMIES).map((e) => `<div>${av(e)}<span><b>${e.name}</b>${e.boss ? ' 👑' : ''}<br>${ENEMY_TIPS[e.id] || ''}</span></div>`).join('');
  show(`
    <div class="topbar"><button class="back" data-act="${back}">‹ ${fromPlay ? '게임으로' : '뒤로'}</button></div>
    <h2 class="title">게임 방법</h2>
    <div class="howto">
      <div class="it"><i>🗺️</i><div><b>스테이지</b>를 하나씩 깨요. 3챕터 × 10스테이지, 한 스테이지는 ${STAGE_WAVES}웨이브. x-5 · x-10 은 <b>보스</b>!</div></div>
      <div class="it"><i>⭐</i><div>클리어할 때 입구 내구도가 70% 이상이면 <b>★★★</b>, 35% 이상이면 ★★, 그 밖엔 ★. 처음 깰 때와 별을 새로 받을 때 코인 보너스!</div></div>
      <div class="it"><i>🚪</i><div>진상들이 골목 위에서 몰려와요. 우리 멤버들이 <b>자동으로 공격</b>해요. 벨벳 로프까지 온 진상은 <b>랑방 입구</b>를 두드려요.</div></div>
      <div class="it"><i>👆</i><div>진상을 <b>탭하면 집중 공격</b>. 경험치는 <b>저절로</b> 모여요. 게이지가 차면 <b>📣 총공지</b>로 화면 전체 공격!</div></div>
      <div class="it"><i>🃏</i><div>레벨이 오르면 카드 3장! 카드를 <b>눌러 고르고 → 선택</b>. 새 멤버 합류 · 멤버 레벨업(3·5레벨에 특수 능력) · 전체 강화. 카드는 스테이지마다 새로 시작해요.</div></div>
      <div class="it"><i>🛒</i><div>코인으로 <b>강화 상점</b>에서 멤버를 영구 강화(최대 20)하고 아이템(튼튼한 문 · 단골 쿠폰 · 확성기 배터리 · 행운 부적 · 웰컴 드링크)을 사요.</div></div>
      <div class="it"><i>✨</i><div>1-10 · 2-3 · 2-5 · 2-10 을 처음 깨면 <b>새 멤버</b>가 합류해요 (<b>HIDDEN</b> 멤버도 있어요!). 출전 동료로 고를 수 있고, 가끔 카드로도 나와요.</div></div>
      <div class="it"><i>♾️</i><div>1-10을 깨면 <b>무한 도전</b>이 열려요. 어디까지 버티나 랭킹 경쟁!</div></div>
      <div class="it"><i>⏯</i><div>게임 중에 뒤로 가기를 눌러도 괜찮아요 — 일시정지가 떠요. 앱을 닫아도 메뉴에서 <b>이어하기</b>로 그 웨이브부터 다시!</div></div>
    </div>
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
};

// ─── 시작 ────────────────────────────────────────────
async function boot() {
  layout();
  app.demo = makeDemo();
  syncMute();
  showMenu();
  requestAnimationFrame((t) => { last = t; frame(t); });
  // 한글 글꼴이 늦게 오면 자리표시자 스프라이트를 다시 굽는다
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
