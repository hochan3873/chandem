// 랑방 대전 — 메인: 게임 루프(고정 60Hz) · 입력 · HUD · 메뉴/스테이지/상점/카드/결과 화면
import {
  HEROES, ENEMIES, RULES, FIELD, BASE_HEROES, UNLOCK_HEROES, HIDDEN_HEROES, LOCKED_HEROES, RARITY, SCORE,
  CHAPTERS, STAGE_COUNT, STAGE_WAVES, STAGES_PER_CHAPTER, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS, itemCost,
  chapterOf, stageNo, stageLabel, stageName, parseStage, stageEnemies, stageBosses, stageReward, clearCoins, itemValue, starsFor,
  ATTRS, CLASSES, TYPE_CHART, TYPE_STRONG, TYPE_WEAK, typeMul, stageClasses, recommendAttrs, recommendTeam, stageFx, MAP_FX, partnerSlots,
  GEAR, GEAR_RARITY, GEAR_STATS, GEAR_MAX_LV, gearValue, gearEnhanceCost, gearSellValue, SLOT_X, SLOT_X7,
  attrScores, DECK_BASE, GACHA_HEROES, LEGEND_HEROES, openSlots, TAGS, HERO_TAGS, ATTR_SET, EVO, HELL, hellOpen, heroTier, TIER_NAME, TIER_MUL, tierPower, metaMaxOf, SKILL_EVO, stageMid, WAVE_KINDS, stageWaveKinds, stageStory,
} from './data.js';
import * as L from './live.js';
import * as S from './sim.js';
import { Renderer } from './render.js';
import * as A from './audio.js';
import * as API from './api.js';
import * as SH from './share.js';

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
  if (!g || app.debugRun || g.over || g.victory || app.ending || !g.lastSnap || g.weekly || g.pvp || g.raid) return;
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
// 뒤로 가기: 브라우저 기록은 한 칸만 걸어 두고(화면마다 쌓지 않는다), 뒤로 = 한 단계 위로
//  팝업 → 닫기 · 게임 중 → 일시정지/그만두기 · 하위 화면 → 로비 · 로비 → "게임월드로 나갈까요?" → location.replace('/')
// 크롬은 "사용자가 누르지 않은 채 쌓은 기록"을 뒤로 가기에서 건너뛴다 → 손가락이 닿을 때 한 번 더 걸어 둔다
let guardGesture = false;
function guardOn(fromGesture = false) {
  if (guarded && (guardGesture || !fromGesture)) return;
  try { history.pushState({ lb: 'guard' }, ''); guarded = true; guardGesture = fromGesture; } catch { /* 무시 */ }
}
for (const t of ['pointerdown', 'keydown']) window.addEventListener(t, () => guardOn(true), { capture: true, passive: true });
function leaveToHub() {
  saveSnap();
  document.body.classList.add('leaving');
  setTimeout(() => { location.replace('/'); }, 180);
}
function guardOff() { /* 기록은 계속 한 칸만 유지 (예전 history.back 은 다른 페이지로 새는 일이 있어서 안 쓴다) */ }
function closeTopLayer() {
  if (app.confirmOpen) { closeConfirm(false); return true; }
  const top = [...stage.querySelectorAll('.reveal, .gacha-res, .info-modal')].pop();
  if (top && top.classList.contains('pvp-wait')) { if (PVP.sock) PVP.sock.emit('cancel'); top.remove(); return true; }
  if (top) { if (top.classList.contains('reveal')) top.click(); else if (top.classList.contains('gacha-res')) { const ok = top.querySelector('.gr-ok'); if (ok && !ok.hidden) ok.click(); } else { top.remove(); if (top.classList.contains('dexpage') && app.screen === 'dex') showDex(); } return true; }
  return false;
}
window.addEventListener('popstate', () => {
  if (ignorePop > 0) { ignorePop--; return; }
  guarded = false; guardGesture = false;
  guardOn(); // 다시 걸어 둔다 — 뒤로 가기로 다른 페이지로 새지 않게 (다음 터치 때 한 번 더)
  if (closeTopLayer()) return;
  if (app.screen === 'play' && app.g && !app.g.over) {
    if (app.g.pvp) { askForfeit(); return; } // 실시간 대전은 멈출 수 없다 → 기권 확인
    if (app.paused) askQuit();
    else pauseGame();
    return;
  }
  if (app.screen === 'play' || app.screen === 'result') { app.g = null; showMenu(); return; }
  if (app.screen !== 'menu') { showMenu(); return; }
  confirmBox({ title: '랑방 대전을 나갈까요?', sub: '게임월드로 돌아가요', ok: '나가기', cancel: '더 할래요' }).then((ok) => { if (ok) leaveToHub(); });
});

// ─── 데모(메뉴 뒤에서 돌아가는 구경용 판) ─────────────
// ─── 진행 도우미 ─────────────────────────────────────
const P = () => app.profile;
const nextStage = () => Math.min(STAGE_COUNT, (P().maxStage || 0) + 1);
const stageUnlocked = (s) => !!P().master || s <= (P().maxStage || 0) + 1;
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
  if (raid) weekly = L.raidDef(opt.raidWi !== undefined ? opt.raidWi : L.weekIndex());
  const pvp = mode === 'pvp' ? { seed: opt.pvpSeed | 0 } : null;
  if (mode === 'weekly') {
    const r = await API.weeklyStart(app.guest);
    if (!r.ok) { toast(r.message || '주간 도전을 시작할 수 없어요'); return; }
    weekly = L.weeklyDef(r.wi);
    app.weeklyRun = r.runId;
  }
  clearSnap();
  app.mode = mode;
  app.stage = st;
  fixDeck();
  const p = P();
  // 2배속: 이미 깬 스테이지만
  app.runSpeed = mode === 'stage' && app.speed2 && (p.stages[st] | 0) > 0 ? 2 : 1;
  const unlocked = DEBUG.hidden ? LOCKED_HEROES.slice() : p.unlocked || [];
  layoutForNewRun();
  const deck = curDeck();
  const g = S.createGame({
    H: app.logicalH, meta: p.heroes || {}, items: p.items || {}, deck, positions: nPosNow(), slots: deckSlotsNow(), gear: API.gearFor(p, deck.filter(Boolean)), stars: p.hstars || {},
    guestPool: [...UNLOCK_HEROES, ...HIDDEN_HEROES].filter((id) => !API.heroUnlocked(p, id)),
    god: DEBUG.god || DEBUG.stress > 0, mode: weekly || pvp ? 'stage' : mode, stage: pvp ? 12 + (pvp.seed % 17) : st, weekly, raid, pvp, hell, unlocked, trialAll: mode === 'endless', startWave: DEBUG.wave || 0,
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
  app.rerollsRun = 5; app.rerollsG = g;
  app.g = g;
  app.demo = null;
  app.paused = false;
  app.cardsOpen = false;
  app.ending = false;
  app.hudCache = {};
  app.ultTipShown = false;
  fx.reset();
  R.setTheme(g.mode === 'stage' ? chapterOf(g.stage) : 'endless');
  if (A.setChapter) A.setChapter(g.mode === 'stage' ? chapterOf(g.stage) : 3);
  app.screen = 'play';
  skillbar.dataset.key = '';
  cancelAim(); hideBubble(); app.drag = null;
  if (g.mapFx.id !== 'none') setTimeout(() => { if (app.g === g) fx.banner(`${g.mapFx.icon} ${g.mapFx.name}`, g.mapFx.desc, '#23336a', 2.2, 'big'); }, 300);
  ui.innerHTML = '';
  hud.hidden = false;
  hud.classList.toggle('endless', g.mode !== 'stage' || !!g.weekly);
  hud.classList.toggle('fast', app.runSpeed > 1);
  hud.classList.toggle('hell', !!g.hell);
  hud.classList.toggle('pvp', !!g.pvp);
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
  const busy = fx.nums.items.length > 45;
  const live = g === app.g;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'shot': if (loud) A.sfx.shot(HEROES[e.hero].proj); break;
      case 'dmg':
        if (!busy || e.crit || e.eff > 0) fx.num(e.x, e.y, e.v, e.crit, e.shield ? '#9feaff' : null, e.eff);
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
        fx.banner(`✨ ${HEROES[e.hero].name} 진화!`, e.name, '#8a4a00', 2, 'big', 'h_' + e.hero);
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
      case 'multikill': if (loud) multiKillFx(g, e); break;
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
      case 'stall': fx.text(e.x, e.y, '퍼졌다! 💨', '#c8c8d8', 14, 1.0, -24); fx.burst(e.x, e.y + 20, 8, 'rgba(90,90,100,0.8)', 80, 'puff', 10, 0.6); if (loud) A.sfx.explode(); break;
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
        fx.banner('😡 ' + e.text, '보스가 분노했다 — 더 빠르고 아프다!', '#8a1010', 1.8, 'wave');
        fx.flash('#ff4040', 0.35); fx.addShake(8);
        if (loud) A.sfx.rage();
        break;
      case 'disco':
        fx.banner('🪩 파티 타임!', e.block ? '건전녀의 철벽! 홀림 막음' : '멤버 전원 잠깐 홀림!', '#8a2a8a', 1.4, 'wave');
        for (let k = 0; k < 20; k++) fx.part('confetti', 40 + Math.random() * 280, 60 + Math.random() * 120, (Math.random() - 0.5) * 120, 120, 1.6, 6, ['#ff4fd8', '#6ff0ff', '#ffd23f', '#7dff9a'][k % 4], { grav: 80 });
        if (loud) A.sfx.charm();
        break;
      case 'confetti': for (let k = 0; k < 12; k++) fx.part('confetti', e.x + (Math.random() - 0.5) * 80, e.y, (Math.random() - 0.5) * 220, 160, 1.2, 6, ['#ff4fd8', '#6ff0ff', '#ffd23f'][k % 3], { grav: 120 }); break;
      case 'jusaPhase': fx.text(e.x, e.y, ['엉엉엉 (눈물 웅덩이)', '2차 가자!! (질주)', 'zzz… (회복 중 — 지금이야!)', '집에 갈래~ (경험치 훔침)'][e.phase], '#ffb3a8', 15, 1.3, -24); break;
      case 'wind': fx.text(180, g.H * 0.25, e.dir > 0 ? '바람 → ' : '← 바람', '#dff4ff', 14, 1.0, -10); break;
      case 'strobe': if (loud) A.sfx.card(); break;
      case 'slotOpen':
        fx.banner('🔓 임시 칸 개방!', '이번 판만 자리 하나가 열렸어요', '#1a6a8a', 1.8, 'big');
        fx.burst(e.x, e.y - 10, 26, '#c8ccd8', 260, 'shard', 6, 0.7, 300);
        fx.ring(e.x, e.y, 8, 80, 0.5, '#6ff0ff', 6);
        fx.flash('#bff4ff', 0.4); fx.addShake(6);
        if (loud) A.sfx.reveal('epic');
        break;
      case 'guestJoin':
        fx.banner(`🎫 게스트 ${HEROES[e.hero].name} 합류!`, '이번 판만 함께해요 — 스테이지를 깨면 정식 합류하는 멤버', '#0a5a6e', 2, 'hidden', 'h_' + e.hero);
        if (live) showReveal(e.hero, 'new');
        break;
      case 'lockedSlot': break;
      case 'midSpawn': {
        const d = ENEMIES[e.enemy];
        fx.banner('⚡ 중간 보스 등장!', d.name, '#6a1a8a', 1.8, 'wave');
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
          fx.text(e.x, e.y, '효과 굉장!', '#ffb02e', 16, 0.9, -34);
          fx.burst(e.x, e.y + 20, 8, '#ff9a1a', 190, 'spark', 4, 0.35);
          fx.ring(e.x, e.y + 22, 6, 34, 0.25, '#ffb02e', 3);
        } else if (!busy) {
          fx.text(e.x, e.y, '별로…', '#8a90a0', 11, 0.7, -22);
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
      case 'diet':
        fx.text(e.x, e.y - 80, '다이어트 주사!', '#ff7fb8', 17, 1.1, -24);
        fx.ring(e.x, e.y, 10, 70, 0.5, '#ff7fb8', 5);
        fx.burst(e.x, e.y - 30, 14, '#ff9fd0', 200, 'star', 8, 0.6);
        if (loud) A.sfx.levelUp();
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
      case 'langbang':
        fx.banner('👑 랑방을 위하여!!', '모든 멤버 공격력 UP', '#8a6400', 1.6, 'wave');
        fx.flash('#fff1a8', 0.4);
        for (const h of g.heroes) fx.ring(h.x, h.y, 6, 44, 0.5, '#ffd84a', 4);
        if (loud) A.sfx.levelUp();
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
      case 'wave':
        // 김도훈 마이크 음파: 겹겹이 퍼지는 굵은 고리 + 음표
        fx.ring(e.x, e.y, 10, e.r, 0.5, 'rgba(111,240,255,0.95)', 5);
        fx.ring(e.x, e.y, 6, e.r * 0.72, 0.42, 'rgba(255,111,216,0.95)', 4);
        fx.ring(e.x, e.y, 4, e.r * 0.45, 0.34, 'rgba(255,255,255,0.9)', 3);
        for (let k = 0; k < (busy ? 2 : 5); k++) { const a = Math.random() * TAU_; fx.part('note', e.x + Math.cos(a) * 20, e.y + Math.sin(a) * 14, Math.cos(a) * 60, -50 - Math.random() * 40, 1.0, 11, k % 2 ? '#6ff0ff' : '#ff9fe6'); }
        fx.ring(e.x, e.y + 30, 4, 26, 0.25, 'rgba(111,240,255,0.9)', 3); // 마이크 번쩍
        break;
      case 'encore':
        fx.pillar(e.x, 120, g.rowY + 30, 1.2); // 무대 조명
        for (const [c, k] of [['#ff4f7a', 0], ['#ffd23f', 0.12], ['#5de07a', 0.24], ['#6ff0ff', 0.36], ['#c77dff', 0.48]]) setTimeout(() => fx.ring(e.x, e.y - 60, 20, e.r * (0.7 + k), 0.9, c, 7), k * 400);
        for (let k = 0; k < 18; k++) fx.part('note', e.x + (Math.random() - 0.5) * 300, e.y - 260 - Math.random() * 120, (Math.random() - 0.5) * 40, 90 + Math.random() * 60, 2.2, 13, k % 3 ? '#ffe14d' : '#ff9fe6');
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
      case 'puke':
        if (e.cry) { fx.text(e.x, e.y, '엉엉…', '#9fd8ff', 13, 0.9, -20); break; } fx.text(e.x, e.y, '우웩!', '#b8e04a', 16, 0.9); fx.burst(e.hx, g.rowY + 18, 10, '#9acd32', 120, 'dot', 5, 0.5, 200); break;
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
        if (g.weekly) fx.banner('📅 주간 도전 완주!!', `${g.totalWaves}웨이브 전부 막아냈다`, '#c77a00', 2.6, 'big');
        else if (g.mode === 'stage' && !g.baseHit) {
          fx.banner('💎 PERFECT!!', '입구가 한 번도 안 맞았다!', '#1a6aa0', 2.6, 'big');
          fx.flash('#bff4ff', 0.9);
          for (let k = 0; k < 20; k++) fx.part('star', 40 + Math.random() * 280, g.H * 0.2 + Math.random() * 200, (Math.random() - 0.5) * 80, -60, 1.4, 12, null, { grav: 60 });
        } else if (g.mode === 'stage') fx.banner(`${stageLabel(g.stage)} 클리어!!`, starStr(e.stars), '#c77a00', 2.4, 'big');
        else fx.banner('랑방 수호 성공!!', '20웨이브 전부 막아냈다', '#c77a00', 2.6, 'big');
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
        fx.repairT = 1.2; // 방어선 수리 연출
        if (e.v > 0) fx.text(e.x, e.y - 60, `+${e.v} 수리`, '#7dff9a', 14, 1);
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
const BOSS_COL = { queen: '#b01e8c', boss_thug: '#9a1a1a', boss_gapjil: '#5a1ec0', boss_inpi: '#137a4a', boss_loan: '#8a6a00', boss_union: '#5a0a9a', boss_kkondol: '#4a3a6a', boss_queenmom: '#8a2a9a', boss_sales: '#8a6a00', boss_otaku: '#1a7a4a', boss_jusa: '#9a2a1a', boss_soloparty: '#a0158a' };
const POOF = ['퍽!', '빡!', '뿅', '컷!', '퇴장~', '아웃!'];
const CONFETTI = ['#ffd23f', '#ff4fd8', '#6ff0ff', '#7dff9a', '#ff8a00', '#ffffff'];

// ─── HUD ─────────────────────────────────────────────
const H$ = {
  wave: $('#h-wave'), left: $('#h-left'), kills: $('#h-kills'), score: $('#h-score'), xp: $('#h-xp'), lv: $('#h-lv'),
  hp: $('#h-hp'), hpLag: $('#h-hp-lag'), hpText: $('#h-hptext'), stars: $('#h-stars'), ult: $('#btn-ult'), boss: $('#bossbar'), bossName: $('#boss-name'), bossFill: $('#boss-fill'),
  mute: $('#btn-mute'), baseBox: document.querySelector('.base-hp'), fx: $('#h-fx'),
  time: $('#h-time'), speed: $('#btn-speed'), syn: $('#h-syn'),
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
  setText(H$.wave, 'wave', g.pvp ? `⚔️ 대전 · WAVE ${w}${g.pvp.sudden ? ' 🔥서든데스' : ''}` : g.raid ? `🐉 레이드 · ${Math.max(0, Math.ceil(g.raid.sec - g.t))}초` : g.weekly ? `주간 · WAVE ${w}/${g.totalWaves}` : stageMode ? `${g.hell ? '🔥HELL ' : ''}${stageLabel(g.stage)} · WAVE ${w}/${g.totalWaves}` : `WAVE ${w} ∞`);
  setText(H$.time, 'time', `${Math.floor(g.t / 60)}:${String(Math.floor(g.t % 60)).padStart(2, '0')}`);
  // 방어선 위험 경고
  const low = g.base.hp / g.base.max < 0.15 && !g.over;
  if (low && !app.hudCache.lowWarn && g.base.hp > 0) { fx.banner('⚠️ 방어선 위험!', '입구가 곧 뚫려요 — 회복 스킬!', '#a3121e', 1.6, 'wave'); fx.flash('#ff2030', 0.35); }
  app.hudCache.lowWarn = low;
  hud.classList.toggle('danger', low);
  H$.wave.classList.toggle('boss', bossWave && g.phase !== 'break');
  setText(H$.left, 'left', g.phase === 'break' ? (g.wave === 0 ? '준비!' : '잠깐 숨 돌리기') : `남은 진상 ${S.enemiesLeft(g)}`);
  setText(H$.fx, 'fx', g.mapFx.id === 'none' ? '' : g.mapFx.icon);
  setText(H$.kills, 'kills', fmt(g.stats.kills));
  setText(H$.score, 'score', fmt(g.stats.score));
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
  let midOnly = true;
  for (const e of g.enemies) if ((e.boss || e.mid) && !e.dead) { hp += Math.max(0, e.hp); max += e.maxHp; name = name ? name + ' · ' + e.def.name : e.def.name; if (e.boss) midOnly = false; }
  if (max > 0) {
    if (H$.boss.hidden) H$.boss.hidden = false;
    setText(H$.bossName, 'bn', `${midOnly ? '⚡ 중간 보스' : '👑'} ${name}`);
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
  if (app.hitStop > 0) { app.hitStop -= dt; dt = 0; }
  if (g && !app.paused && !app.confirmOpen) {
    const ts = (fx.slowmo > 0 ? 0.22 : 1) * (app.aim ? 0.3 : 1) * (live && app.cardsOpen && performance.now() - app.cardsAt < 2000 ? 0.7 : 1) * (live && app.infoHero && !bubble.hidden ? 0.5 : 1);
    const speed = live ? DEBUG.speed * (app.runSpeed || 1) : 1;
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
      if (live && g.pendingLevels > 0 && !g.over && !app.cardsOpen) { openCards(); break; }
    }
    if (n >= maxSteps) acc = 0;
    perf.steps += n;
  }
  fx.update(dt);
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
    // 자동 화질: 게임 중 1초 평균 프레임이 20ms 넘게 2번 연속이면 캔버스 해상도를 한 단계 낮춘다 (2 → 1.6 → 1.3)
    if (live && perf.frame > 20) { perf.slow = (perf.slow || 0) + 1; if (perf.slow >= 2 && (R.maxDpr || 2) > 1.3) { R.maxDpr = (R.maxDpr || 2) > 1.6 ? 1.6 : 1.3; perf.slow = 0; layout(); } } else perf.slow = 0;
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
    if (g.heroes.includes(a.h) && S.castSkill(g, a.h, a.x, a.y)) { skillFx(a.h); handleEvents(g, true); }
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
  if (S.castSkill(g, h)) { skillFx(h); handleEvents(g, true); }
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
// 필드 멤버 정보 카드: 지금 능력치 · 공격 방식 · 레벨 효과 · 버프/디버프 (열려 있는 동안 게임 50% 속도)
const PROJ_TXT = {
  cone: '부채꼴 음파 (여러 명 동시)', warn: '유도탄 (감속 · 경고 누적)', bullet: '직선 저격 (자기 줄만)', heart: '포물선 폭탄 (떨어진 곳 범위)', swear: '연쇄 번개 (3~5명 튕김)',
  wave: '둥근 음파 (주변 전부 · 감속)', dumbbell: '포물선 덤벨 (범위) + 오토바이 돌진', snack: '유도 과자 + 한 줄 빔', dash: '뛰어들어 연속 베기', bottle: '포물선 소주병 (범위 · 분노 중 불바다)',
  beam: '레이저 (계속 쏘면 세짐)', cane: '관통 지팡이 (자기 줄 전부)', gf: '핀볼 여사친 (3~4명 튕김 · 밀어내기)', slam: '몸통 박치기 충격파 / 날씬 모드 연타', hammer: '무거운 유도 망치 (보스 우선)', crown: '황금 파동 (자기 줄 전부 관통)',
};
function heroStatsHtml(g, h) {
  const d = h.def;
  const iv = S.heroInterval(g, h) / (1 + (h.gear.spd || 0));
  const crit = (g.mods.crit + (h.gear.crit || 0) + (d.critBonus || 0)) * 100;
  const gearTxt = Object.entries(h.gear || {}).filter(([, v]) => v).map(([k, v]) => `${GEAR_STATS[k] ? GEAR_STATS[k].name : k} +${(v * 100).toFixed(0)}%`).join(' · ');
  const flags = [d.lane ? '↕ 자기 줄만' : '', d.splash || d.slamR ? '💥 범위' : '', d.proj === 'cane' || d.proj === 'crown' || (h.lv >= 3 && d.proj === 'bullet') ? '🗡️ 관통' : '', d.bounces || d.ricochet ? '⚡ 튕김' : '', d.slow ? '🐢 감속' : ''].filter(Boolean).join(' ');
  const st = [];
  if (g.rallyT > 0) st.push('📢 집합! 공속↑');
  if (g.hcT > 0) st.push(`👑 랑방을 위하여 +${Math.round(g.hcBuff * 100)}%`);
  if (g.hcSkT > 0) st.push(`👑 공격력 +${Math.round(g.hcSkAtk * 100)}%`);
  if (h.evo) st.push(`✨ 진화: ${EVO[h.id].name}`);
  if (h.rage) st.push('🔥 분노');
  if (h.alt && d.diet) st.push('💉 날씬 모드');
  if (h.alt && d.age) st.push('👵 폭삭 늙음 (힘 반토막)');
  for (const [k, t] of [['stunT', '😵 기절'], ['charmT', '💘 홀림'], ['rumorT', '🗣️ 뒷담 공속↓'], ['paperT', '📄 차용증 공속↓'], ['fearT', '😱 공포'], ['vomitT', '🤢 토 공속↓'], ['blindT', '📸 눈부심'], ['drowsyT', '💤 라떼 공속↓'], ['grabT', '🙌 붙잡힘']]) if (h[k] > 0) st.push(t);
  const perks = Object.entries(d.perks || {}).map(([k, v]) => `<li class="${h.lv >= +k ? 'on' : ''}"><b>Lv${k}</b> ${esc(v)}</li>`).join('');
  return `<div class="hi-head">${av(d)}<div><b>${d.name} <small>Lv.${h.lv}${h.evo ? ' ✨' : ''} · ${'★'.repeat(h.star || 1)}</small></b>${attrTag(d.attr)}${(HERO_TAGS[h.id] || []).map((t) => `<span class="tg">${TAGS[t].icon}${TAGS[t].name}</span>`).join('')}</div><button class="hi-x" data-hix>✕</button></div>
    <div class="hi-stats"><span>⚔️ 공격력 <b>${fmt(S.heroDamage(g, h))}</b></span><span>⏱️ 공속 <b>${(1 / iv).toFixed(2)}/초</b></span><span>📏 사거리 <b>${Math.round(S.heroRange(g, h))}</b></span><span>🎯 치명타 <b>${crit.toFixed(0)}%</b></span></div>
    <p class="hi-row">🔫 ${esc(PROJ_TXT[d.proj] || d.attack)} ${flags ? `<em>${flags}</em>` : ''}</p>
    ${gearTxt ? `<p class="hi-row">🎒 ${esc(gearTxt)}</p>` : ''}
    <p class="hi-row">✨ ${esc(d.skill.name)}: ${esc(d.skill.desc)}</p>
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
  return `<div class="ih"><b>✨ ${esc(sk.name)}</b><small>${h.def.name} · 쿨타임 ${Math.round(sk.cd * (1 - (h.gear.cd || 0)) * (h.evo ? 0.7 : 1))}초 · ${sk.target ? '👆 찍는 스킬 (누른 뒤 필드 탭)' : '바로 발동'}</small></div>
    <p class="ia">${esc(sk.desc)}</p>${scal.length ? `<p class="ip">레벨별: ${scal.join(' · ')}</p>` : ''}<p class="ip">${S.skillReady(h) ? '✅ 준비됨 — 짧게 누르면 사용' : `⏳ ${Math.ceil(h.skillCd)}초 남음`}</p>`;
}
let skPress = null;
skillbar.addEventListener('pointerdown', (ev) => {
  const b = ev.target.closest('[data-slot]');
  if (!b) return;
  const slot = Number(b.dataset.slot);
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
const skEnd = () => { if (skPress) clearTimeout(skPress.t); };
skillbar.addEventListener('pointerup', skEnd);
skillbar.addEventListener('pointercancel', skEnd);
skillbar.addEventListener('pointerleave', skEnd);
skillbar.addEventListener('contextmenu', (e) => e.preventDefault());
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
  if (!S.useUlt(g)) { toast(`총공지 충전 중… ${Math.floor(g.ult)}%`, 1000); return; }
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
  if (link) { ev.preventDefault(); leaveToHub(); return; }
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  if (ui.dataset.noclick) return;
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
  playerCard: (b) => showPlayerCard(b.dataset.u),
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
  rosterPick: (b) => deckQuick(b.dataset.id),
  waveHelp: () => popup(`<h3>🌊 웨이브 성격</h3>${['S', 'E', 'M', 'B'].map((k) => `<p class="ip"><b>${WAVE_KINDS[k].icon} ${WAVE_KINDS[k].name}</b> — ${esc(WAVE_KINDS[k].desc)}</p>`).join('')}<p class="ip">한꺼번에 3명 이상 잡으면 <b>트리플! · 5킬! · 싹쓸이!! · 대학살!!!</b> · 계속 잡으면 콤보 경험치 보너스</p>`),
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
const coinsPill = () => `<span class="coins-pill"><i class="ci"></i>${fmt(P().coins || 0)}</span>`;

// ─── 로비 (메인 화면) ─────────────────────────────────
// 뒤에는 데모 전투가 계속 돌고(어둡게), 가운데 챕터 디오라마, 아래 출격 버튼 · 왼쪽 이벤트 · 오른쪽 메뉴 · 맨 아래 탭
const uid = () => API.liveUid();
function uiIco(name, emoji, cls = '') {
  return `<span class="uic ${cls}"><img src="/img/lb/ui/${name}.webp" alt="" draggable="false" onerror="this.parentNode.classList.add('noimg');this.remove()"><em>${emoji}</em></span>`;
}
const rdot = (on) => (on ? '<i class="rd"></i>' : '');
function lobbyStage() {
  if (!app.lobbyStage || !stageUnlocked(app.lobbyStage)) app.lobbyStage = nextStage();
  return app.lobbyStage;
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
  return { missions: mis > 0, season, weekly: wk, checkin: !L.checkinState(p, now).done, recruit: (p.tickets | 0) > 0, members, shop: (p.tickets | 0) > 0 };
}
function navHtml(on) {
  const d = dots();
  const tabs = [['shop', '상점', '🛒'], ['bag', '가방', '🎒'], ['battle', '전투', '⚔️'], ['members', '멤버', '👥'], ['missions', '미션', '📜']];
  return `<nav class="lb-nav">${tabs.map(([k, n, e]) => `<button class="nv ${k === on ? 'on' : ''} ${k === 'battle' ? 'mid' : ''}" data-act="nav" data-tab="${k}">${uiIco(k === 'members' ? 'members' : k, e)}<b>${n}</b>${rdot(d[k])}</button>`).join('')}</nav>`;
}
function topPills() {
  const p = P();
  const expPct = p.expToNext ? Math.round((p.exp / p.expToNext) * 100) : 0;
  const fr = p.frame && L.FRAMES[p.frame] ? L.FRAMES[p.frame].color : '';
  const title = p.title ? L.titleName(p.title) : '';
  return `<div class="lb-top">
    <button class="pill me" data-act="settings" style="${fr ? `--fr:${fr}` : ''}"><span class="ava ${fr ? 'framed' : ''}">${av(HEROES.bangjang)}</span>
      <span class="who"><b>${app.guest ? '손님' : `Lv.${p.level}`}</b><em>${esc(app.guest ? '로그인하면 랭킹 등록' : app.nickname || '랑방 멤버')}</em>${title ? `<u>${esc(title)}</u>` : ''}<i class="xp"><b style="width:${app.guest ? 0 : expPct}%"></b></i></span></button>
    <div class="curs"><span class="pill cur"><i class="ci"></i><b>${fmt(p.coins || 0)}</b></span><button class="pill cur tk" data-act="nav" data-tab="shop">🎟️<b>${fmt(p.tickets || 0)}</b><em>+</em></button></div>
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
  if (st && st.ranking.length) lines.push(`🗺️ 스테이지 — ${top(st.ranking, (r) => `${r.stageLabel} ★${r.totalStars}`)}${st.me && st.me.rank ? ` · 내 순위 ${st.me.rank}위` : ''}`);
  if (pv && pv.ranking.length) lines.push(`⚔️ 1:1 대전 — ${top(pv.ranking, (r) => `${r.rating}점`)}`);
  if (wk && wk.board && wk.board.length) lines.push(`📅 주간 도전 — ${top(wk.board, (r) => fmt(r.best))}${wk.me && wk.me.rank ? ` · 내 순위 ${wk.me.rank}위` : ''}`);
  if (!lines.length) lines.push('🏆 아직 랭킹이 비었어요 — 1등 할 기회!');
  rankTicker.lines = lines;
}
function tickRank() {
  const el = document.getElementById('lbRank');
  if (!el || app.screen !== 'menu' || !rankTicker.lines.length) return;
  const line = rankTicker.lines[rankTicker.i++ % rankTicker.lines.length];
  el.innerHTML = `<span class="rk-in">${line}</span>`;
}
setInterval(tickRank, 4000);
function showMenu() {
  app.screen = 'menu';
  app.g = null;
  app.paused = false;
  app.cardsOpen = false;
  hud.hidden = true;
  guardOn();
  layout();
  const s = lobbyStage();
  const ch = chapterOf(s);
  R.setTheme(ch);
  A.setBoss(false);
  A.setChapter(ch);
  if (app.touched) A.playBgm(); // 전투 · 대전 · 레이드에서 돌아오면 로비 음악 다시 (같은 곡이면 그대로)
  setTimeout(() => { loadRankTicker().then(tickRank).catch(() => {}); }, 0);
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
    return `<button class="chest ${st}" data-act="chest" data-ch="${ch}" data-n="${n}"><span>${st === 'open' ? '📭' : '🎁'}</span><small>★${n}</small></button>`;
  }).join('');
  const now = Date.now();
  const wkOpen = (p.maxStage | 0) >= L.WEEKLY_UNLOCK;
  const boss = stageBosses(s).length > 0;
  const left = [
    `<button class="tile ${wkOpen ? '' : 'locked'}" data-act="weekly">${uiIco('weekly', '📅')}<b>주간 도전</b><small>${wkOpen ? L.leftText(L.msToWeekEnd(now)) : `${stageLabel(L.WEEKLY_UNLOCK)}`}</small>${rdot(d.weekly)}</button>`,
    `<button class="tile ${p.endlessUnlocked ? '' : 'locked'}" data-act="endless">${uiIco('battle', '♾️', 'inf')}<b>무한 도전</b><small>${p.endlessUnlocked ? `W${p.bestWave || 0}` : stageLabel(ENDLESS_UNLOCK)}</small></button>`,
    `<button class="tile" data-act="season">${uiIco('season', '🏆')}<b>시즌</b><small>${L.seasonTier(p)}/${L.SEASON_TIERS}</small>${rdot(d.season)}</button>`,
    `<button class="tile" data-act="recruit">${uiIco('recruit', '🎰')}<b>모집</b><small>🎟️${p.tickets | 0}</small>${rdot(d.recruit)}</button>`,
    `<button class="tile ${L.raidState(now).open ? 'hot' : ''}" data-act="raid">${uiIco('raid', '🐉')}<b>레이드</b><small>${L.raidState(now).open ? '진행 중!' : '금 18시'}</small>${rdot(L.raidState(now).open && !(p.raid && p.raid.wi === L.weekIndex(now) && p.raid.runs))}</button>`,
    `<button class="tile" data-act="pvp">${uiIco('pvp', '⚔️')}<b>1:1 대전</b><small>${(p.pvp && p.pvp.rating) || 1000}점</small></button>`,
  ].join('');
  const right = [['share', '공유', '📤', 'share'], ['checkin', '출석', '📆', 'checkin'], ['ranking', '랭킹', '🏆', 'ranking'], ['dex', '도감', '📚', 'dex'], ['mail', '공지', '📮', 'notice'], ['settings', '설정', '⚙️', 'settings']]
    .map(([ic, n, e, act]) => `<button class="rb" data-act="${act}">${uiIco(ic, e)}<small>${n}</small>${rdot((act === 'dex' && dexHasNew()) || (act === 'checkin' && d.checkin))}</button>`).join('');
  try { localStorage.setItem('langbang:chapter', String(chapterOf(nextStage()))); } catch { /* 무시 */ } // 허브 카드용 (진행 챕터 1~6)
  const sparks = Array.from({ length: 10 }, (_, i) => `<i style="--i:${i};--x:${(i * 37) % 100}%;--d:${(i % 5) * 0.7}s"></i>`).join('');
  show(`
    <div class="lb-key" style="background-image:url('/img/lb/keyart${ch}.webp')"></div>
    <div class="lb-dim"></div>
    ${topPills()}
    ${p.master ? '<button class="lb-master" data-act="settings">🛠️ MASTER 테스트 모드</button>' : ''}
    <div class="lb-logo"><img src="/img/lb/emblem.webp" alt="" onerror="this.remove()"><b>랑방 대전</b></div>
    <button class="lb-rank" data-act="ranking" id="lbRank" aria-label="랭킹 보기"><span>🏆 랭킹 불러오는 중…</span></button>
    <button class="lb-stage" data-act="stages">
      <h2>${stageLabel(s)} ${esc(stageName(s))}</h2>
      <span class="lb-chip" style="--cc:${c.color}">${ch}장 ${esc(c.name)} · ${fxd.icon} ${esc(fxd.name)}${boss ? ' · 👑 보스' : ''}</span>
      <span class="lb-st">${starStr(p.stages[s] || 0)}${p.perfects && p.perfects[s] ? ' 💎' : ''}</span>
    </button>
    <div class="lb-dio">
      <button class="chev l" data-act="lbStep" data-d="-1" ${s <= 1 ? 'disabled' : ''} aria-label="이전 스테이지"><i></i>${s > 1 ? `<small>◂ ${stageLabel(s - 1)}</small>` : ''}</button>
      <div class="dio-wrap ch${ch}" data-act="stages"><img class="dio" src="/img/lb/dio${ch}.webp" alt="" draggable="false" onerror="this.remove()"><span class="sparks">${sparks}</span></div>
      ${(() => { const lock = s >= (p.master ? STAGE_COUNT : nextStage()); const nx = Math.min(STAGE_COUNT, s + 1); return `<button class="chev r ${lock && s < STAGE_COUNT ? 'lockd' : ''}" data-act="lbStep" data-d="1" ${lock ? 'disabled' : ''} aria-label="다음 스테이지"><i></i>${s < STAGE_COUNT ? `<small>${lock ? '🔒' : ''}${stageLabel(nx)} ▸</small>` : ''}</button>`; })()}
    </div>
    <div class="lb-chests"><div class="cbar"><b style="width:${Math.min(100, (cs / 30) * 100)}%"></b></div>${chests}<em>${ch}장 ★${cs}/30</em></div>
    ${snap ? `<button class="lb-resume" data-act="resumeSnap">⏯ 이어하기 <small>${esc(snapLabel(snap))}</small></button>` : ''}
    <button class="lb-start" data-act="lbGo"><b>출격!</b><small>${stageLabel(s)} ${esc(stageName(s))}</small></button>
    <div class="lb-left">${left}</div>
    <div class="lb-right">${right}</div>
    ${navHtml('battle')}
    ${app.profileLoaded ? '' : '<div class="lb-loading"><span class="spin">⏳</span></div>'}
  `, 'lobby');
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
ui.addEventListener('pointerdown', (ev) => {
  const c = ev.target.closest('.pcard[data-id], .dslot[data-id]');
  if (!c || app.screen !== 'prep') return;
  clearTimeout(lpT);
  lpT = setTimeout(() => { ui.dataset.noclick = '1'; setTimeout(() => { delete ui.dataset.noclick; }, 400); vibrate(12); showDexCard('hero', c.dataset.id); }, 480);
});
for (const t of ['pointerup', 'pointercancel', 'pointermove']) ui.addEventListener(t, (ev) => { if (t !== 'pointermove' || (ev.movementX * ev.movementX + ev.movementY * ev.movementY) > 16) clearTimeout(lpT); });
let lbSwipe = null;
ui.addEventListener('pointerdown', (ev) => {
  const dio = ev.target.closest('.lb-dio');
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
function lobbyStep(d) {
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
  if (tab === 'members') return showMembers();
  if (tab === 'missions') return showMissions();
}

// ─── 공용: 보상 글자 · 팝업 ───────────────────────────
function gotText(got) {
  if (!got) return '';
  const a = [];
  if (got.coins) a.push(`${fmt(got.coins)} 코인`);
  if (got.tickets) a.push(`🎟️ 모집권 ${got.tickets}`);
  if (got.sp) a.push(`⭐ 시즌 +${got.sp}`);
  if (got.gear) a.push(`${GEAR[got.gear.t].icon} ${GEAR_RARITY[got.gear.r].name} 장비${got.gear.sold ? ' (가방 꽉 참 → 코인)' : ''}`);
  if (got.title) a.push(`🏷️ 칭호 "${L.titleName(got.title)}"`);
  if (got.frame) a.push(`🖼️ ${L.FRAMES[got.frame].name}`);
  return a.join(' · ');
}
function popup(html, cls = '') {
  closeInfoCard();
  const m = document.createElement('div');
  m.className = 'info-modal pop ' + cls;
  m.innerHTML = `<div class="pop-box">${html}<button class="pop-x" data-x>✕</button></div>`;
  stage.appendChild(m);
  m.addEventListener('click', (ev) => {
    if (ev.target === m || ev.target.closest('[data-x]')) { m.remove(); return; }
    const b = ev.target.closest('[data-act]');
    if (!b || b.disabled) return;
    A.unlock(); A.sfx.tap();
    if (ACTS[b.dataset.act]) ACTS[b.dataset.act](b);
  });
  return m;
}
async function liveAct(promise, okMsg) {
  const r = await promise;
  if (r.ok && r.profile) app.profile = r.profile;
  if (!r.ok) { toast(r.message || '못 했어요'); return null; }
  if (okMsg) toast(okMsg(r), 2600);
  return r;
}
function refresh() {
  const f = { menu: showMenu, shop: showShop, bag: showBag, members: showMembers, missions: showMissions, season: showSeason, weekly: showWeekly, prep: () => showPrep(app.mode, app.stage) }[app.screen];
  if (f) f();
}

// ─── 상점: 모집 · 아이템 ─────────────────────────────
function showShop() {
  app.screen = 'shop';
  hud.hidden = true;
  const p = P();
  const tab = app.shopTab === 'items' ? 'items' : 'recruit';
  let body;
  if (tab === 'recruit') {
    const pity = L.PITY_HERO - (p.pity.hero | 0);
    const lopen = L.legendOpen(p);
    const cost1 = (p.tickets | 0) >= 1 ? '🎟️ 1' : `<i class="ci"></i>${fmt(L.GACHA_COST.one)}`;
    const cost10 = (p.tickets | 0) >= 10 ? '🎟️ 10' : `<i class="ci"></i>${fmt(L.GACHA_COST.ten)}`;
    const faces = ['junseo', 'hochan', 'hyungyeong', 'ara'].map((id) => `<span class="gf-hero ${HEROES[id].legend ? 'lg' : ''} ${API.heroUnlocked(p, id) ? 'own' : ''}">${av(HEROES[id], lopen || !HEROES[id].legend ? '' : 'sil')}</span>`).join('');
    body = `<div class="gacha-banner">
        <div class="gb-title"><b>랑방 멤버 모집</b><small>코인·모집권만 사용 (현금 결제 없음)</small></div>
        <div class="gb-faces">${faces}</div>
        <div class="gb-pity"><span>💜 영웅 멤버 확정까지 <b>${pity}</b>회</span><span>${lopen ? `👑 LEGEND 확정까지 <b>${L.PITY_LEGEND - (p.pity.legend | 0)}</b>회` : `👑 LEGEND 이호찬은 ${stageLabel(L.HOCHAN_GATE)} 클리어 후 등장`}</span></div>
      </div>
      <div class="grid2 gacha-btns">
        <button class="btn" data-act="pull" data-n="1"><b>1회 모집</b><small>${cost1}</small></button>
        <button class="btn primary" data-act="pull" data-n="10"><b>10회 모집</b><small>${cost10} · 영웅 등급 이상 1개 확정</small></button>
      </div>
      <button class="btn ghost rates-btn" data-act="rates">📊 확률 공개 · 보유 모집권 🎟️${p.tickets | 0}</button>
      <div class="card-prog">${[...GACHA_HEROES, ...LEGEND_HEROES].map((h) => { const pr = L.cardProgress(p, h); const d = HEROES[h]; const lock = LEGEND_HEROES.includes(h) && !L.legendOpen(p); return `<div class="cp ${pr ? '' : 'done'} ${lock ? 'lock' : ''}" style="--c:${d.color}">${av(d, pr ? 'sil' : '')}<b>${esc(d.name)}</b>${pr ? `<i><b style="width:${Math.round((pr[0] / pr[1]) * 100)}%"></b></i><small>${lock ? `${stageLabel(L.HOCHAN_GATE)} 뒤` : `${pr[0]}/${pr[1]}장`}</small>` : '<small>합류 ✔</small>'}</div>`; }).join('')}</div>
      <p class="sub">모집 멤버는 <b>카드</b>를 모아 합류 (영웅 ${L.UNLOCK_CARDS.epic}장 · LEGEND ${L.UNLOCK_CARDS.legend}장) · 합류한 뒤 카드와 조각으로 <b>★ 승급</b> (공격력 +${Math.round(L.STAR_ATK * 100)}% / ★)</p>`;
  } else {
    body = `<div class="up-list">${ITEM_IDS.map((id) => {
      const it = ITEMS[id];
      const lv = (p.items || {})[id] || 0;
      const cost = API.itemCostOf(p, id);
      const can = cost !== null && p.coins >= cost && !(it.needs && !(p.items[it.needs] | 0));
      const cur = id === 'drink' ? it.desc(lv) : lv ? it.desc(itemValue(id, lv)) : '아직 없음';
      const nxt = cost === null ? '' : id === 'drink' ? `${lv + 1}장` : /slot/.test(id) ? '' : '+' + it.desc(itemValue(id, lv + 1)).split('+').pop();
      const pips = Array.from({ length: it.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      return `<div class="up item"><span class="it-ico" data-act="itemInfo" data-id="${id}">${it.icon}</span><div class="mid" data-act="itemInfo" data-id="${id}"><b>${it.name}<span class="lvtag">Lv.${lv}/${it.max}</span></b>
        <small class="eff">${esc(ITEM_EFFECT[id] || '')}</small>
        <small>지금: ${esc(/slot/.test(id) ? it.desc(lv) : cur)}${nxt ? ` → 다음: <span class="nx">${esc(nxt)}</span>` : ' (최대)'}</small>
        <div class="pips">${pips}</div></div>
        <button class="btn ${can ? 'primary' : ''}" data-act="buyItem" data-id="${id}" ${can ? '' : 'disabled'}>${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button></div>`;
    }).join('')}</div>
    <p class="sub" style="margin-top:10px">덱 칸이 많을수록 뒤 챕터가 쉬워져요 · 기본 ${DECK_BASE}칸</p>`;
  }
  show(`
    ${subTop('상점')}
    <div class="tabs"><button class="${tab === 'recruit' ? 'on' : ''}" data-act="shopTab" data-tab="recruit">🎰 모집</button><button class="${tab === 'items' ? 'on' : ''}" data-act="shopTab" data-tab="items">🎒 아이템</button></div>
    ${app.guest ? '<div class="guest-note">손님 기록은 이 기기에만 · <a href="/">로그인</a>하면 어디서든!</div>' : ''}
    ${body}
    ${navHtml('shop')}
  `, 'dim withnav');
}
// 상점 아이템: 한 줄 효과 설명 + 자세히
const ITEM_EFFECT = {
  door: '랑방 입구 최대 내구도가 늘어요 (별 받기가 쉬워짐)', coupon: '스테이지를 깰 때 받는 코인이 늘어요', battery: '📣 총공지 게이지가 더 빨리 차요',
  charm: '모든 멤버 치명타(2배 피해) 확률이 올라가요', drink: '스테이지 시작 전에 레벨업 카드를 먼저 골라요', slot5: '덱에 멤버를 5명까지 넣을 수 있어요', slot6: '덱에 멤버를 6명까지 넣을 수 있어요 (5번째 칸 먼저)',
};
function showItemInfo(id) {
  const it = ITEMS[id], p = P();
  const lv = (p.items || {})[id] | 0;
  const rows = Array.from({ length: it.max }, (_, i) => `<div class="irow ${i + 1 <= lv ? 'on' : ''} ${i === lv ? 'next' : ''}"><span>Lv.${i + 1}</span><b>${esc(id === 'drink' || /slot/.test(id) ? it.desc(i + 1) : it.desc(itemValue(id, i + 1)))}</b><em>${fmt(itemCost(id, i) || 0)}코인</em></div>`).join('');
  popup(`<h3>${it.icon} ${esc(it.name)}</h3><p class="ip">${esc(ITEM_EFFECT[id] || '')}</p><div class="ilist">${rows}</div>${it.needs ? `<p class="ip">먼저 필요: ${esc(ITEMS[it.needs].name)}</p>` : ''}`);
}
function subTop(title) {
  return `${topPills()}<h2 class="title sub-title">${esc(title)}</h2>`;
}
function showRates() {
  const p = P();
  const lopen = L.legendOpen(p);
  const lk = (k) => k === 'legendHero' || k === 'legendCard';
  const sum = L.GACHA_RATES.filter((r) => lopen || !lk(r.k)).reduce((a, r) => a + r.w, 0);
  popup(`<h3>📊 모집 확률</h3>
    <div class="rates">${L.GACHA_RATES.map((r) => `<div class="${!lopen && lk(r.k) ? 'off' : ''}"><span style="color:${r.color}">${esc(r.name)}</span><b>${!lopen && lk(r.k) ? `${stageLabel(L.HOCHAN_GATE)} 클리어 후` : ((r.w / sum) * 100).toFixed(2) + '%'}</b></div>`).join('')}</div>
    <p class="ip">· 10회 모집: 영웅 등급(영웅 장비·멤버) 이상 1개 확정<br>· 모집 멤버는 <b>카드를 모아서 합류</b>: 영웅 ${L.UNLOCK_CARDS.epic}장 · LEGEND ${L.UNLOCK_CARDS.legend}장<br>· 영웅 카드 묶음(×${L.CARD_BUNDLE.epicHero}): ${L.PITY_HERO}회 안에 확정 (천장)<br>· LEGEND 묶음(×${L.CARD_BUNDLE.legendHero}): ${L.PITY_LEGEND}회 안에 확정 (열린 뒤부터 셈)<br>· 합류한 뒤 카드는 ★승급 조각이 돼요<br>· 모든 모집은 게임 코인·모집권으로만 해요</p>`);
}
async function doPull(n) {
  const p = P();
  const pay = (p.tickets | 0) >= n ? 'ticket' : 'coin';
  const cost = n === 10 ? L.GACHA_COST.ten : L.GACHA_COST.one;
  if (pay === 'coin' && p.coins < cost) { toast(`코인이 부족해요 (${fmt(cost)} 필요) · 모집권은 미션·시즌·출석에서!`); return; }
  const r = await liveAct(API.gacha(n, pay, app.guest));
  if (!r) return;
  await gachaShow(r.results || []);
  refresh();
}
// 모집 결과: 카드가 한 장씩 뒤집힌다. 영웅·LEGEND 멤버는 큰 연출
function gachaShow(list) {
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'gacha-res';
    const rar = (x) => (x.k === 'legendHero' || x.k === 'legendCard' ? 'lg' : x.k === 'epicHero' || x.k === 'epicCard' ? 'ep' : x.k === 'legendGear' ? 'lgear' : x.k === 'epicGear' ? 'egear' : x.k === 'rareGear' ? 'rgear' : 'sh');
    m.innerHTML = `<div class="gr-grid n${list.length}">${list.map((x, i) => `<div class="gcard ${rar(x)}" style="--i:${i}"><div class="gc-in"><div class="gc-back">?</div><div class="gc-front">${gachaFace(x)}</div></div></div>`).join('')}</div>
      <button class="btn primary gr-ok" hidden>확인</button><p class="gr-skip">탭하면 빨리 넘어가요</p>`;
    stage.appendChild(m);
    const cards = [...m.querySelectorAll('.gcard')];
    let i = 0, fast = false, done = false, busy = false;
    const finish = () => { if (done) return; done = true; m.remove(); resolve(); };
    const next = async () => {
      if (busy) return;
      busy = true;
      while (i < cards.length) {
        const x = list[i], c = cards[i];
        c.classList.add('flip');
        A.sfx.card();
        if (x.card) { await sleep(fast ? 80 : 260); if (x.new) await showJoinReveal(x.hero, LEGEND_HEROES.includes(x.hero) ? 'legend' : 'epic'); else if (x.k === 'legendHero' || x.k === 'epicHero') A.sfx.levelUp(); }
        else if (x.k === 'legendGear') { fx.flash('#ffd23f', 0.3); A.sfx.levelUp(); }
        i++;
        await sleep(fast ? 40 : list.length > 1 ? 150 : 300);
      }
      m.querySelector('.gr-ok').hidden = false;
      m.querySelector('.gr-skip').hidden = true;
      busy = false;
    };
    m.addEventListener('click', (ev) => { if (ev.target.closest('.gr-ok')) { finish(); return; } fast = true; });
    next();
  });
}
function gachaFace(x) {
  if (x.hero && x.card) {
    const d = HEROES[x.hero];
    const pr = x.new ? '합류!' : x.dup ? `★조각 +${x.shards}` : `${x.have}/${x.need}`;
    return `${av(d)}<b>${d.name} 카드</b><small>+${x.shards}장 · ${pr}</small>${!x.dup && x.need ? `<i class="gc-prog"><b style="width:${Math.round(((x.new ? x.need : x.have) / x.need) * 100)}%"></b></i>` : ''}`;
  }
  if (x.gear) return `<span class="gi">${GEAR[x.gear.t].icon}</span><b>${esc(GEAR[x.gear.t].name)}</b><small style="color:${GEAR_RARITY[x.gear.r].color}">${GEAR_RARITY[x.gear.r].name}${x.gear.sold ? ' → 코인' : ''}</small>`;
  const d = HEROES[x.hero];
  return `${av(d)}<b>${d.name} 조각</b><small>+${x.shards}</small>`;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── 새 멤버 합류 연출 (모집 카드가 다 모였을 때 · 스테이지 클리어 합류) ─────────
// 카드 조각이 모여 → 빛으로 깨지고 → 어두운 화면에 빛기둥 → 큰 전신 그림이 확대되며 등장 → 이름 · "NEW MEMBER 합류!" 쾅
const DEX_CATCH = {
  bangjang: '"공지! 오늘도 랑방은 내가 지킨다!"', staff: '"경고 한 번, 두 번… 세 번이면 아웃이에요."', gunman: '"건전하게, 정확하게."', gunnyeo: '"다친 사람 먼저! 입구는 제가 고칠게요."',
  myunghoon: '"#@!% … 아, 미안. 조용히 해 줄래?"', dohoon: '"앵콜! 앵콜! 마이크는 안 놔!"', ingyu: '"오 그거 근육 자극 좋다."', donghan: '"…이제 좀 해볼까?"', youngjun: '"들어간다. 따라오지 마."',
  eunok: '"한 잔만… 딱 한 잔만 할게."', hanna: '"윙크 ♥ 받을 준비 됐어?"', sunggu: '"요즘 것들은… 내가 보여 주마."', junseo: '"잠깐, 내 친구 소개해 줄게!"', hyungyeong: '"다이어트는 내일부터! 오늘은 박치기!"',
  ara: '"공주님 등장~ 아이고 허리야…"', hochan: '"랑방을 위하여!!"',
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
      <div class="jr-art"><img src="/img/lb/dexhq/${id}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='/img/lb/dex/${id}.webp'">${lg ? '<span class="jr-crown"></span>' : ''}</div>
      <div class="jr-text"><div class="jr-tag">NEW MEMBER 합류!</div><div class="jr-name">${esc(d.name)}</div><div class="jr-title">${lg ? 'LEGEND · ' : kind === 'hidden' ? 'HIDDEN · ' : ''}${esc(d.role.replace(/^(HIDDEN|LEGEND) · /, ''))}</div><p class="jr-catch">${esc(DEX_CATCH[id] || '')}</p></div>
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
      <div class="rv-card"><div class="rv-in"><div class="rv-back">${kind === 'legend' ? '👑' : '✨'}</div><div class="rv-front">${av(d)}${kind === 'legend' ? '<span class="rv-crown">👑</span>' : ''}</div></div></div>
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
    const tag = d.legend ? 'LEGEND' : d.hidden ? 'HIDDEN' : d.gacha ? '모집' : '';
    return `<button class="mcard ${ok ? '' : 'locked'} ${d.legend ? 'lg' : d.hidden ? 'hid' : d.gacha ? 'ep' : ''}" data-act="heroCard" data-id="${id}" style="--c:${d.color}">
      ${av(d, ok ? '' : 'sil')}<span class="chips">${tag ? `<em class="tg">${tag}</em>` : ''}${d.legend ? '' : `<i class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]}</i>`}<span class="pa">${ATTRS[d.attr].icon}</span></span>
      <b>${ok ? d.name : '???'}</b><small>${ok ? `<span class="st">${'★'.repeat(st)}</span> +${p.heroes[id] | 0}` : esc(HERO_UNLOCK[id] ? `${stageLabel(HERO_UNLOCK[id])} 클리어` : d.gacha ? '모집에서' : '')}</small>${rdot(can)}</button>`;
  }).join('');
  show(`
    ${subTop('멤버')}
    <p class="sub">멤버를 누르면 자세한 설명 · 강화 · ★승급 · 장비</p>
    <div class="mgrid">${cards}</div>
    ${navHtml('members')}
  `, 'dim withnav');
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
  const slot = (k) => { const it = (p.gear || []).find((g) => g.id === eq[k]); return `<button class="gslot ${it ? 'r-' + it.r : ''}" data-act="gearSlot" data-hero="${id}" data-slot="${k}" ${ok ? '' : 'disabled'} style="--rc:${it ? GEAR_RARITY[it.r].color : '#555'}">${it ? GEAR[it.t].icon : k === 'w' ? '🗡️' : '💍'}<small>${it ? esc(GEAR[it.t].name) + (it.lv ? ` +${it.lv}` : '') : k === 'w' ? '무기' : '액세서리'}</small></button>`; };
  const inDeck = curDeck().includes(id);
  const perks = Object.entries(d.perks || {}).map(([k, v]) => `<li><b>Lv${k}</b> ${esc(v)}</li>`).join('');
  popup(`<div class="hm ${d.legend ? 'lg' : d.hidden ? 'hid' : d.gacha ? 'ep' : ''}" style="--c:${d.color}">
    <div class="hm-art hq ${ok ? '' : 'sil'}" data-act="heroInfo" data-id="${id}"><img src="/img/lb/dexhq/${id}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='/img/lb/dex/${id}.webp'"><small class="hm-more">🔍 크게 보기</small></div>
    <div class="hm-head"><b>${ok ? d.name : '???'}</b>${d.legend ? '<em class="lgd">LEGEND</em>' : d.hidden ? '<em class="hdn">HIDDEN</em>' : ''}${attrTag(d.attr)}
      <div class="hm-star">${'★'.repeat(st)}<i>${'★'.repeat(L.STAR_MAX - st)}</i> <span>강화 +${lv}/${metaMaxOf(id)}</span> <em class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]} · 기본 ×${tierPower(heroTier(id), 0).toFixed(2)}</em></div><small>${esc(d.role)}</small></div>
    <div class="hm-match ${m.cls}"><b>${m.arrow} 이번 적 상성 ${m.text}</b><small>${esc(sw)}</small></div>
    <div class="hm-sec"><h4>⚔️ 기본 공격</h4><p>${esc(d.attack)}</p></div>
    <div class="hm-sec"><h4>✨ 스킬 · ${esc(d.skill.name)} <small>쿨 ${d.skill.cd}초</small></h4><p>${esc(d.skill.desc)}</p></div>
    ${perks ? `<div class="hm-sec"><h4>📈 레벨 효과</h4><ul>${perks}</ul></div>` : ''}
    <div class="hm-sec"><h4>🎒 장비</h4><div class="grow">${slot('w')}${slot('a')}</div></div>
    <p class="hm-desc">${esc(d.desc)}</p>
    ${ok ? `<div class="grid2 hm-btns">
      <button class="btn ${cost !== null && p.coins >= cost ? 'primary' : ''}" data-act="buy" data-id="${id}" ${cost !== null && p.coins >= cost ? '' : 'disabled'}>강화 +${lv + 1}<small>${cost === null ? 'MAX' : `${fmt(cost)}코인 · 공격력 +${Math.round(RULES.metaDmgPerLevel * 100)}%`}</small></button>
      <button class="btn ${st < L.STAR_MAX && (p.shards[id] | 0) >= needS ? 'pink' : ''}" data-act="starUp" data-id="${id}" ${st < L.STAR_MAX && (p.shards[id] | 0) >= needS ? '' : 'disabled'}>★ 승급<small>${st >= L.STAR_MAX ? '최대 ★5' : `조각 ${p.shards[id] | 0}/${needS} · ${fmt(L.STAR_COINS[st])}코인`}</small></button>
    </div>` : `<p class="ip">🔒 ${esc(unlockText(id) || (d.legend ? `${stageLabel(L.HOCHAN_GATE)}를 깨면 모집에 등장 (아주 낮은 확률)` : d.gacha ? '상점 → 모집에서 만날 수 있어요' : ''))}</p>`}
    ${ok ? `<button class="btn ${inDeck ? 'ghost' : 'primary'}" data-act="deckToggle" data-id="${id}">${inDeck ? `덱 ${app.deckI + 1}에서 빼기` : `덱 ${app.deckI + 1}에 넣기`}</button>` : ''}
  </div>`, 'hero-pop');
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
    const rw = [m.coins ? `${fmt(m.coins)}코인` : '', m.tickets ? `🎟️${m.tickets}` : '', m.sp ? `⭐${m.sp}` : '', m.title ? '🏷️칭호' : ''].filter(Boolean).join(' ');
    return `<div class="mrow ${m.done ? 'done' : ready ? 'ready' : ''}"><span class="mi">${m.icon}</span><div class="mm"><b>${esc(m.name)}</b>
      <div class="pbar"><div style="width:${Math.round((Math.min(m.have, m.n) / m.n) * 100)}%"></div><em>${fmt(Math.min(m.have, m.n))}/${fmt(m.n)}</em></div><small>${rw}</small></div>
      <button class="btn ${ready ? 'primary' : ''}" data-act="claimMis" data-kind="${m.kind}" data-id="${m.id}" ${ready ? '' : 'disabled'}>${m.done ? '완료' : ready ? '받기' : '진행 중'}</button></div>`;
  };
  let body;
  if (tab === 'daily') body = `<p class="sub">⏰ 초기화까지 ${L.leftText(v.dayLeft)}</p>${row(v.all)}${v.daily.map(row).join('')}`;
  else if (tab === 'weekly') body = `<p class="sub">⏰ 초기화까지 ${L.leftText(v.weekLeft)}</p>${v.weekly.map(row).join('')}`;
  else body = `<p class="sub">한 번만 받는 업적 보상</p>${v.ach.map(row).join('')}`;
  const cnt = (list) => list.filter((m) => !m.done && m.have >= m.n).length;
  show(`
    ${subTop('미션')}
    <div class="tabs">${[['daily', '일일', cnt(v.daily) + (v.all.ready && !v.all.done ? 1 : 0)], ['weekly', '주간', cnt(v.weekly)], ['ach', '업적', cnt(v.ach)]].map(([k, n, c]) => `<button class="${tab === k ? 'on' : ''}" data-act="misTab" data-tab="${k}">${n}${c ? `<i class="cnt">${c}</i>` : ''}</button>`).join('')}</div>
    <div class="mlist">${body}</div>
    ${navHtml('missions')}
  `, 'dim withnav');
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
      <button class="btn ${ready ? 'primary' : ''}" data-act="claimSeason" data-t="${t}" ${ready ? '' : 'disabled'}>${got ? '✓' : ready ? '받기' : '🔒'}</button></div>`;
  }).join('');
  show(`
    ${topPills()}
    <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
    <h2 class="title">🏆 시즌 ${s.id} 무료 보상</h2>
    <p class="sub">남은 시간 ${L.leftText(left)} · 미션·주간 도전으로 시즌 포인트(⭐)를 모아요</p>
    <div class="season-bar"><b>단계 ${tier}/${L.SEASON_TIERS}</b><div class="pbar"><div style="width:${tier >= L.SEASON_TIERS ? 100 : (inTier / L.SP_PER_TIER) * 100}%"></div><em>⭐ ${inTier}/${L.SP_PER_TIER}</em></div></div>
    <button class="btn primary" data-act="claimSeason" data-t="all" ${Array.from({ length: tier }, (_, i) => i + 1).some((t) => !s.claimed.includes(t)) ? '' : 'disabled'}>받을 수 있는 보상 모두 받기</button>
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
  const bosses = def.bosses.map((b) => `<span class="wb">${av(ENEMIES[b])}<small>${esc(ENEMIES[b].name)}</small></span>`).join('');
  const my = p.weekly && p.weekly.wi === wi ? p.weekly : null;
  const render = (bd) => {
    const board = bd ? bd.board.map((r) => `<div class="wrow ${r.rank <= 3 ? 'top' + r.rank : ''}"><span class="rk">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span><span class="nm">${esc(r.nickname)}${r.title ? `<u>${esc(r.title)}</u>` : ''}</span><span class="wv">W${r.waves}</span><b>${fmt(r.best)}</b></div>`).join('') || '<div class="empty-msg">아직 기록이 없어요 — 1등 할 기회!</div>' : `<div class="empty-msg">${app.guest ? '로그인하면 친구들과 순위 경쟁!' : '<span class="spin">⏳</span> 순위 불러오는 중…'}</div>`;
    const prev = bd && bd.prev;
    const prevBox = prev ? `<div class="panel wprev"><b>지난주 결과: ${prev.rank ? `${prev.rank}위` : '-'} · ${fmt(prev.best)}점</b><small>${prev.reward ? esc(prev.reward.label) + ' · ' + gotText(prev.reward) : ''}</small>
      <button class="btn ${prev.claimed ? '' : 'primary'}" data-act="weeklyClaim" ${prev.claimed ? 'disabled' : ''}>${prev.claimed ? '받았어요' : '보상 받기'}</button></div>` : '';
    show(`
      ${topPills()}
      <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
      <h2 class="title">📅 주간 도전전</h2>
      <p class="sub">${L.weekLabel(wi)} · 끝까지 ${L.leftText(L.msToWeekEnd())} · 몇 번이든 도전, 최고 점수가 남아요</p>
      <div class="wmod"><span class="wi">${mod.icon}</span><div><b>${esc(mod.name)}</b><small>${esc(mod.desc)}</small><small>${fxd.icon} ${esc(fxd.name)} · ${L.WEEKLY_WAVES}웨이브 · 뒤로 갈수록 확 세져요</small></div></div>
      <div class="wbosses">${bosses}</div>
      <div class="wmy"><div><small>내 최고</small><b>${fmt(my ? my.best : 0)}</b></div><div><small>순위</small><b>${bd && bd.me && bd.me.rank ? `${bd.me.rank}위` : '-'}</b></div><div><small>도전</small><b>${my ? my.runs : 0}회</b></div></div>
      ${prevBox}
      <button class="btn primary" data-act="weeklyGo">도전! <small>점수 = 웨이브×1000 + 처치×10 + 보스×500 + 클리어 보너스</small></button>
      <div class="gap"></div>
      <div class="panel wboard"><h4>🏆 이번 주 순위 ${bd ? `<small>${bd.total}명 참가</small>` : ''}</h4>${board}</div>
      <p class="sub" style="margin-top:8px">순위 보상 (다음 주에 받기): 1위 5,000코인·🎟️5·영웅 장비·칭호 / 2~3위 3,000코인·🎟️3 / 4~10위 1,500코인·🎟️2 / 참가 600코인·🎟️1</p>
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
    return `<div class="cday ${got ? 'got' : ''} ${today ? 'today' : ''}"><small>${i + 1}일</small><b>${rw.tickets ? '🎟️' : '<i class="ci big"></i>'}</b><em>${rw.tickets ? `${fmt(rw.coins)}+🎟️${rw.tickets}` : fmt(rw.coins)}</em></div>`;
  }).join('');
  popup(`<h3>📆 출석 체크</h3><p class="ip">매일 들어오면 보상! 하루 빠지면 1일부터 다시 (연속 ${st.streak}일)</p><div class="cdays">${days}</div>
    <button class="btn primary" data-act="doCheckin" ${st.done ? 'disabled' : ''}>${st.done ? '내일 또 만나요' : '출석하기'}</button>`);
}
const NOTICES = [
  ['🆕', '새 멤버 4명!', '윤준서 · 배현경 · 고아라, 그리고 LEGEND 이호찬 — 상점 → 모집에서 만나요'],
  ['📅', '주간 도전전', '매주 월요일 새 판! 모두 같은 판으로 점수 경쟁, 순위 보상은 다음 주에'],
  ['📜', '미션 · 업적 · 시즌', '일일/주간 미션과 무료 시즌(30단계)으로 모집권·장비·칭호를 받아요'],
  ['🃏', '덱 칸 변경', `기본 덱 ${DECK_BASE}칸 · 5·6번째 칸은 상점 아이템에서 (예전에 산 칸은 한 칸씩 남아요)`],
  ['⚔️', '상성 강화', `유리한 속성 ×${TYPE_STRONG} · 불리한 속성 ×${TYPE_WEAK} — 덱 짤 때 ▲▼ 를 보세요`],
];
function showNotice() {
  popup(`<h3>📮 공지</h3><div class="nlist">${NOTICES.map(([i, t, d]) => `<div class="nrow"><span>${i}</span><div><b>${esc(t)}</b><small>${esc(d)}</small></div></div>`).join('')}</div>`);
}
function showSettings() {
  const p = P();
  const titles = (p.titles || []).map((t) => `<button class="chip ${p.title === t ? 'on' : ''}" data-act="setTitle" data-v="${t}">${esc(L.titleName(t))}</button>`).join('') || '<small class="dimtxt">시즌·주간 도전·업적에서 칭호를 얻어요</small>';
  const frames = (p.frames || []).map((f) => `<button class="chip ${p.frame === f ? 'on' : ''}" data-act="setFrame" data-v="${f}" style="--fc:${L.FRAMES[f].color}">${esc(L.FRAMES[f].name)}</button>`).join('') || '<small class="dimtxt">시즌 20·30단계에서 프레임을 얻어요</small>';
  popup(`<h3>⚙️ 설정</h3>
    <div class="set-row"><span>🔊 소리</span><button class="btn ghost" data-act="mute">${A.isMuted() ? '🔇 꺼짐' : '🔊 켜짐'}</button></div>
    <div class="set-row col"><span>🏷️ 칭호</span><div class="chips"><button class="chip ${!p.title ? 'on' : ''}" data-act="setTitle" data-v="">없음</button>${titles}</div></div>
    <div class="set-row col"><span>🖼️ 프레임</span><div class="chips"><button class="chip ${!p.frame ? 'on' : ''}" data-act="setFrame" data-v="">없음</button>${frames}</div></div>
    <div class="grid2"><button class="btn" data-act="howto">📖 게임 방법</button><button class="btn" data-act="toHub">‹ 게임월드</button></div>
    ${p.master ? `<div class="master-panel"><h4>🛠️ 마스터 테스트 도구 <small>(서버 확인 · 랭킹 제외)</small></h4>
      <div class="grid2"><button class="btn mini" data-act="mst" data-a="coins">코인 +10만</button><button class="btn mini" data-act="mst" data-a="tickets">모집권 +100</button></div>
      <div class="set-row"><span>강화 Lv</span><input id="mstLv" type="number" min="0" max="20" value="20"><label><input id="mstStar" type="checkbox" checked> ★5</label></div>
      <button class="btn primary mini" data-act="mst" data-a="allclear">⚡ 올클리어 (전 스테이지 ★★★ · 전 멤버 · 장비 · 코인)</button>
      <div class="set-row"><span>진행</span><input id="mstStage" type="number" min="0" max="${STAGE_COUNT}" value="10"><button class="btn mini" data-act="mst" data-a="stage">여기까지 클리어</button></div>
      <div class="set-row"><span>테스트 판</span><select id="mstEnemy">${Object.keys(ENEMIES).filter((k) => !ENEMIES[k].dot).map((k) => `<option value="${k}">${esc(ENEMIES[k].name)}</option>`).join('')}</select><button class="btn mini" data-act="mstWave">소환</button></div>
      <button class="btn danger mini" data-act="mst" data-a="reset">초기화 (신규 유저 상태로)</button></div>` : ''}`);
}
async function claimChestAct(ch, n) {
  const r = await liveAct(API.claimChest(ch, n, app.guest));
  if (!r) return;
  A.sfx.levelUp(); fx.flash('#ffd23f', 0.35);
  toast(`🎁 ${ch}장 ★${n} 상자! ${gotText(r.got)}`, 3000);
  showMenu();
}

Object.assign(ACTS, {
  nav: (b) => goNav(b.dataset.tab),
  lbStep: (b) => lobbyStep(Number(b.dataset.d)),
  lbGo: () => showPrep('stage', lobbyStage()),
  weekly: () => showWeekly(),
  weeklyGo: () => showPrep('weekly', 0),
  weeklyClaim: async () => { const r = await liveAct(API.weeklyClaim()); if (r) { A.sfx.levelUp(); toast(`지난주 ${r.label || ''} 보상! ${gotText(r.got)}`, 3200); showWeekly(); } },
  season: () => showSeason(),
  recruit: () => { app.shopTab = 'recruit'; showShop(); },
  checkin: () => showCheckin(),
  doCheckin: async () => { const r = await liveAct(API.checkin(app.guest)); if (r) { closeInfoCard(); A.sfx.levelUp(); toast(`📆 출석 ${r.day}일째! ${gotText(r.got)}`, 2600); refresh(); } },
  notice: () => showNotice(),
  toHub: () => { closeInfoCard(); leaveToHub(); },
  toLobby: async () => {
    const g = app.g;
    const sure = !g || g.over || app.screen !== 'play' || await confirmBox({ title: '메인 메뉴로 갈까요?', sub: g && (g.pvp || g.weekly || g.raid) ? '이 판은 여기서 끝나요' : '지금 판은 이어하기로 남아요', ok: '메인 메뉴로', cancel: '취소' });
    if (!sure) return;
    if (g && !g.over && (g.pvp || g.weekly || g.raid)) { quitRun(); showMenu(); return; }
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
    const extra = a === 'allclear' ? { level: Number(($('#mstLv') || {}).value || 20), star5: !!($('#mstStar') || {}).checked } : a === 'stage' ? { value: Number(($('#mstStage') || {}).value || 0) } : {};
    const r = await liveAct(API.masterAct(a, extra));
    if (!r) return;
    if (a === 'reset') { try { localStorage.removeItem(DECK_KEY); localStorage.removeItem('langbang:gearSeen'); } catch { /* 무시 */ } app.decks = [[], [], []]; }
    app.lobbyStage = 0;
    toast(`🛠️ ${{ coins: '코인 지급', tickets: '모집권 지급', allclear: '올클리어!', stage: '진행 설정', reset: '초기화했어요' }[a] || '완료'}`, 1800);
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
      toast(`🛠️ 테스트: ${ENEMIES[type].name} 소환 (무적 · 기록 저장 안 함)`, 2200);
    });
  },
  settings: () => showSettings(),
  setTitle: async (b) => { if (await liveAct(API.setCosmetic(b.dataset.v, undefined, app.guest))) { showSettings(); refreshBehind(); } },
  setFrame: async (b) => { if (await liveAct(API.setCosmetic(undefined, b.dataset.v, app.guest))) { showSettings(); refreshBehind(); } },
  chest: (b) => {
    const ch = Number(b.dataset.ch), n = Number(b.dataset.n);
    if (b.classList.contains('open')) { toast('이미 연 상자예요'); return; }
    if (!b.classList.contains('ready')) { const rw = L.chestReward(ch, n); toast(`${ch}장 별 ${n}개 모으면: ${gotText({ coins: rw.coins, tickets: rw.tickets, gear: rw.gear ? { t: 'megaphone', r: rw.gear } : null }).replace(/📣 /, '')}`, 2600); return; }
    claimChestAct(ch, n);
  },
  pull: (b) => doPull(Number(b.dataset.n)),
  rates: () => showRates(),
  itemInfo: (b) => showItemInfo(b.dataset.id),
  heroCard: (b) => showHeroModal(b.dataset.id, app.screen === 'prep' ? 'prep' : ''),
  starUp: (b) => doStarUp(b.dataset.id),
  misTab: (b) => { app.misTab = b.dataset.tab; showMissions(); },
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
    const top = bd ? bd.top.map((r) => `<div class="wrow ${r.rank <= 3 ? 'top' + r.rank : ''}"><span class="rk">${r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}</span><span class="nm">${esc(r.nickname)}</span><b>${fmt(r.dmg)}</b></div>`).join('') || '<div class="empty-msg">아직 아무도 안 때렸어요 — 첫 타!</div>' : `<div class="empty-msg">${app.guest ? '레이드는 로그인하면 참가해요' : '<span class="spin">⏳</span> 불러오는 중…'}</div>`;
    const open = bd ? bd.open : st.open;
    show(`
      ${topPills()}
      <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
      <h2 class="title">🐉 주말 모임 레이드</h2>
      <p class="sub">${open ? `끝까지 ${L.leftText(st.endsAt - Date.now())} · 모두의 피해를 합쳐 잡아요` : `금요일 18:00 에 열려요 (${L.leftText(st.opensAt - Date.now())} 뒤)`}</p>
      <div class="raid-boss"><div class="rb-art">${av(boss)}</div><b>${esc(boss.name)}</b>
        <div class="rb-hp"><div style="width:${100 - pct}%"></div><em>${bd && bd.killed ? '🎉 처치 성공!' : `${fmt(Math.max(0, L.RAID.hp - total))} / ${fmt(L.RAID.hp)}`}</em></div>
        <small>${bd ? `${bd.players}명 참가 · 하루 ${L.RAID.tries}번 · 한 판 ${L.RAID.sec}초` : ''}</small></div>
      <div class="wmy"><div><small>내 피해</small><b>${fmt(me ? me.dmg : 0)}</b></div><div><small>기여 순위</small><b>${me && me.rank ? me.rank + '위' : '-'}</b></div><div><small>남은 도전</small><b>${me ? me.tries : L.RAID.tries}</b></div></div>
      ${me && me.reward ? `<div class="panel wprev"><b>${esc(me.reward.label)}</b><small>${gotText(me.reward)}</small><button class="btn ${me.canClaim && !me.claimed ? 'primary' : ''}" data-act="raidClaim" ${me.canClaim && !me.claimed ? '' : 'disabled'}>${me.claimed ? '받았어요' : me.canClaim ? '보상 받기' : '잡거나 끝나면 받기'}</button></div>` : ''}
      <button class="btn primary" data-act="raidGo" ${open && !app.guest && (!me || me.tries > 0) ? '' : 'disabled'}>도전! <small>150초 동안 보스에게 최대한 피해를</small></button>
      <div class="gap"></div>
      <div class="panel wboard"><h4>🏆 기여도 순위</h4>${top}</div>
    `, 'dim');
  };
  render(null);
  if (!app.guest) { const bd = await API.raidBoard(); if (app.screen === 'raid') render(bd); }
}
async function startRaid() {
  const r = await API.raidStart();
  if (!r.ok) { toast(r.message || '레이드를 시작할 수 없어요'); return; }
  app.raidRun = r.runId;
  startRun({ mode: 'raid', force: true, raidWi: r.wi });
}
async function saveRaid(sum, g, box) {
  const r = await API.postRaid(sum, app.raidRun, g.raid.dmg);
  app.raidRun = null;
  if (r.ok && r.profile) app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '')}</div>`; return; }
  const rd = r.raid || {};
  box.innerHTML = `<div class="rewards"><div class="rw hl"><span>🐉 이번 판 피해</span><b>${fmt(rd.dmg || 0)}</b></div><div class="rw"><span>이번 주 내 피해</span><b>${fmt(rd.mine || 0)}</b></div>
    <div class="rw"><span>모두 합계</span><b>${fmt(rd.total || 0)} / ${fmt(rd.hp || L.RAID.hp)}</b></div></div>${r.rank ? `<div class="own"><span class="badge">기여 ${r.rank}위</span></div>` : ''}${rd.master ? '<div class="guest-note">마스터 테스트 판은 순위에 안 들어가요</div>' : ''}`;
}

// ─── 실시간 1:1 대전 ──────────────────────────────────
const PVP = { sock: null, match: null, opp: null, kills: 0, spent: 0, lastHp: 0 };
function loadSocketIo() {
  if (window.io) return Promise.resolve(window.io);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = '/socket.io/socket.io.js'; s.onload = () => res(window.io); s.onerror = rej; document.head.appendChild(s); });
}
async function pvpSocket() {
  if (PVP.sock && PVP.sock.connected) return PVP.sock;
  const io = await loadSocketIo();
  const sock = io('/lbpvp', { transports: ['websocket', 'polling'], auth: { token: API.authToken() || '' } });
  PVP.sock = sock;
  sock.on('match', (m) => pvpMatched(m));
  sock.on('rejoin', (m) => { toast('대전으로 다시 들어왔어요', 1400); });
  sock.on('opp', (o) => { PVP.opp = Object.assign(PVP.opp || {}, o); renderOppStrip(); });
  sock.on('incoming', (x) => { if (app.g && app.g.pvp) { S.pvpIncoming(app.g, x.kind); handleEvents(app.g, true); } });
  sock.on('sent', (x) => { fx.text(180, 120, x.kind === 'big' ? '💥 중간 보스 보냈다!' : '📤 진상 보냈다!', '#9ff4ff', 15, 1, -20); });
  sock.on('end', (r) => pvpEnded(r));
  return sock;
}
async function showPvp() {
  app.screen = 'pvp';
  hud.hidden = true;
  const p = P();
  const tierOf = (r) => (r >= 1800 ? '👑 그랜드마스터' : r >= 1650 ? '🔮 마스터' : r >= 1500 ? '💎 다이아' : r >= 1350 ? '🛡️ 플래티넘' : r >= 1200 ? '🥇 골드' : r >= 1050 ? '🥈 실버' : r >= 900 ? '🥉 브론즈' : '⚙️ 아이언');
  const pv = p.pvp || { rating: 1000, games: 0, wins: 0 };
  show(`
    ${topPills()}
    <div class="topbar"><button class="back" data-act="menu">‹ 로비</button></div>
    <h2 class="title">⚔️ 실시간 1:1 대전</h2>
    <p class="sub">같은 진상이 동시에 몰려온다 — 처치로 게이지를 모아 상대에게 진상을 보내요! 먼저 방어선이 뚫리면 패배</p>
    <div class="pvp-card"><b>${app.guest ? '손님 (연습만)' : tierOf(pv.rating)}</b><span>${app.guest ? '로그인하면 점수 경쟁' : `${pv.rating}점 · ${pv.games}판 ${pv.wins}승`}</span></div>
    <button class="btn primary" data-act="pvpQueue">🔍 빠른 매칭 <small>20초 안에 상대가 없으면 연습 상대 🤖</small></button>
    <div class="gap"></div>
    <div class="grid2"><button class="btn" data-act="pvpRoom">🏠 방 만들기</button><button class="btn" data-act="pvpJoin">🔑 코드로 참가</button></div>
    <div class="gap"></div>
    <div class="panel wboard" id="pvpRank"><h4>🏆 대전 순위</h4><div class="empty-msg"><span class="spin">⏳</span></div></div>
    <p class="sub" style="margin-top:8px">보내기: 처치 ${L.PVP.sendSmall}명마다 빠른 진상 5명 · ${L.PVP.sendBig}명이면 중간 보스 · ${L.PVP.sudden}초부터 서든데스 (진상 빨라짐)</p>
  `, 'dim');
  const rk = await API.pvpRanking();
  const box = $('#pvpRank');
  if (box && rk) box.innerHTML = `<h4>🏆 대전 순위</h4>${rk.ranking.map((r) => `<div class="wrow" data-act="playerCard" data-u="${esc(r.username || '')}"><span class="rk">${r.rank}</span><span class="nm">${esc(r.nickname)}</span><span class="wv">${r.wins}/${r.games}</span><b>${r.rating}</b></div>`).join('') || '<div class="empty-msg">아직 대전 기록이 없어요</div>'}`;
}
// 선수 카드: 스테이지 진행 · 대전 등급 · 승률 · 덱
const PVP_TIERS = [[1800, '그랜드마스터', '👑', '#ff5d73'], [1650, '마스터', '🔮', '#c77dff'], [1500, '다이아몬드', '💎', '#6fd3ff'], [1350, '플래티넘', '🛡️', '#4fe0c1'], [1200, '골드', '🥇', '#ffd35a'], [1050, '실버', '🥈', '#cfd8e3'], [900, '브론즈', '🥉', '#d59a6a'], [-Infinity, '아이언', '⚙️', '#9aa1a8']];
async function showPlayerCard(u) {
  if (!u) { toast('손님이라 기록이 없어요'); return; }
  popup('<p class="ip"><span class="spin">⏳</span> 불러오는 중…</p>', 'pcard');
  const pl = await API.playerCard(u);
  const box = stage.querySelector('.pcard .pop-box');
  if (!box) return;
  if (!pl) { box.innerHTML = '<p class="ip">선수 정보를 불러오지 못했어요</p><button class="pop-x" data-x>✕</button>'; return; }
  const t = PVP_TIERS.find((x) => pl.pvp.rating >= x[0]);
  const fr = pl.frame && L.FRAMES[pl.frame] ? L.FRAMES[pl.frame].color : '#ffd23f';
  const deck = pl.deck.map((h) => HEROES[h.id] ? `<span class="pc-h" style="--c:${ATTRS[HEROES[h.id].attr].color}">${dexImg(h.id, HEROES[h.id].img)}<i class="tier t${heroTier(h.id)}">${TIER_NAME[heroTier(h.id)]}</i><small>${'★'.repeat(h.star)} ${h.lv ? '+' + h.lv : ''}</small><b>${esc(HEROES[h.id].name)}</b></span>` : '').join('');
  box.innerHTML = `<div class="pc-head" style="--fr:${fr}"><b>${esc(pl.nickname)}</b>${pl.master ? '<em class="lb-master">MASTER</em>' : ''}<small>Lv.${pl.level || 1}${pl.title ? ` · 🏷️ ${esc(L.titleName(pl.title))}` : ''}</small></div>
    <div class="pc-stats">
      <div><small>최고 스테이지</small><b>${esc(pl.stageLabel)}</b><i>★ ${pl.totalStars || 0}</i></div>
      <div><small>대전 등급</small><b style="color:${t[3]}">${t[2]} ${t[1]}</b><i>${pl.pvp.rating}점</i></div>
      <div><small>승률</small><b>${pl.pvp.games ? pl.pvp.winRate + '%' : '-'}</b><i>${pl.pvp.wins}승 ${pl.pvp.games - pl.pvp.wins}패</i></div>
    </div>
    <h4 class="pc-dt">🃏 대표 덱</h4><div class="pc-deck">${deck || '<p class="ip">아직 덱이 없어요</p>'}</div>
    ${pl.bestWave ? `<p class="ip">♾️ 무한 도전 최고 W${pl.bestWave}</p>` : ''}
    <button class="pop-x" data-x>✕</button>`;
}
function pvpWaiting(text, code) {
  popup(`<h3>⚔️ ${esc(text)}</h3>${code ? `<div class="pvp-code">${code}</div><p class="ip">친구에게 코드를 알려 주세요</p>` : '<p class="ip"><span class="spin">⏳</span> 상대를 찾는 중…</p>'}<button class="btn ghost" data-act="pvpCancel">취소</button>`, 'pvp-wait');
}
async function pvpQueue() {
  const sock = await pvpSocket().catch(() => null);
  if (!sock) { toast('서버에 연결할 수 없어요'); return; }
  fixDeck();
  sock.emit('queue', { deck: curDeck().filter(Boolean) }, (r) => { if (!r || !r.ok) toast((r && r.message) || '매칭할 수 없어요'); else if (r.waiting) pvpWaiting('상대 찾는 중'); });
}
async function pvpRoom(join) {
  const sock = await pvpSocket().catch(() => null);
  if (!sock) { toast('서버에 연결할 수 없어요'); return; }
  fixDeck();
  if (join) {
    const code = prompt('방 코드 4자리'); // 간단히 (모바일 키보드)
    if (!code) return;
    sock.emit('room:join', { code: code.trim(), deck: curDeck().filter(Boolean) }, (r) => { if (!r || !r.ok) toast((r && r.message) || '참가할 수 없어요'); });
  } else sock.emit('room:create', { deck: curDeck().filter(Boolean) }, (r) => { if (r && r.ok) pvpWaiting('방을 만들었어요', r.code); });
}
function pvpMatched(m) {
  closeInfoCard();
  PVP.match = m; PVP.opp = Object.assign({ hp: 1, max: 1, kills: 0, wave: 0 }, m.opp); PVP.kills = 0; PVP.spent = 0;
  fx.banner('⚔️ 대전 시작!', `vs ${m.opp.nickname}${m.opp.bot ? ' (연습 상대)' : ` · ${m.opp.rating}점`}`, '#1a3a8a', 2.4, 'big');
  setTimeout(() => startRun({ mode: 'pvp', force: true, pvpSeed: m.seed }), Math.max(0, (m.startIn || 3000) - 800));
}
document.getElementById('oppstrip').addEventListener('click', (ev) => { const u = ev.currentTarget.dataset.u; if (u) showPlayerCard(u); else toast(PVP.opp && PVP.opp.bot ? '연습 상대예요 🤖' : '손님이라 기록이 없어요'); });
function renderOppStrip() {
  const el = $('#oppstrip');
  if (!el || !PVP.opp) return;
  const o = PVP.opp;
  el.hidden = false;
  el.dataset.u = o.username || '';
  el.innerHTML = `<b>${esc(o.nickname || '상대')}${o.bot ? ' 🤖' : ''}</b><div class="ohp"><div style="width:${Math.round((o.hp / Math.max(1, o.max)) * 100)}%"></div></div><small>W${o.wave || 0} · 처치 ${o.kills || 0}</small>`;
}
function pvpTick() {
  const g = app.g;
  if (!g || !g.pvp || !PVP.sock) return;
  PVP.sock.emit('hp', { hp: Math.round(g.base.hp), max: g.base.max, kills: g.stats.kills, wave: g.wave });
  const gauge = g.stats.kills - PVP.spent;
  const b = $('#btn-send');
  if (b) { b.hidden = false; b.innerHTML = `📤 보내기 <small>${Math.min(gauge, L.PVP.sendBig)}/${gauge >= L.PVP.sendBig ? L.PVP.sendBig : L.PVP.sendSmall}</small>`; b.classList.toggle('ready', gauge >= L.PVP.sendSmall); b.classList.toggle('big', gauge >= L.PVP.sendBig); }
}
function pvpSend() {
  const g = app.g;
  if (!g || !g.pvp) return;
  const gauge = g.stats.kills - PVP.spent;
  const kind = gauge >= L.PVP.sendBig ? 'big' : gauge >= L.PVP.sendSmall ? 'small' : null;
  if (!kind) { toast(`처치 ${L.PVP.sendSmall}명이 모이면 보낼 수 있어요`, 1000); return; }
  PVP.sock.emit('send', { kind }, (r) => { if (r && r.ok) { PVP.spent += kind === 'big' ? L.PVP.sendBig : L.PVP.sendSmall; A.sfx.levelUp(); } else if (r && r.message) toast(r.message, 900); });
}
function pvpEnded(r) {
  const g = app.g;
  PVP.match = null;
  const el = $('#oppstrip'); if (el) el.hidden = true;
  const sb = $('#btn-send'); if (sb) sb.hidden = true;
  if (g && g.pvp && !g.over) { g.over = true; g.phase = 'over'; }
  app.pvpResult = r;
  if (g && g.pvp) { app.ending = false; endRun(r.win); }
  API.loadProfile().then((x) => { if (x && x.profile) app.profile = x.profile; });
}
setInterval(pvpTick, 1000);
Object.assign(ACTS, {
  raid: () => showRaid(),
  raidGo: () => startRaid(),
  raidClaim: async () => { const r = await liveAct(API.raidClaim()); if (r) { A.sfx.levelUp(); toast(`🐉 ${r.label || '레이드 보상'} ${gotText(r.got)}`, 3200); showRaid(); } },
  pvp: () => showPvp(),
  pvpQueue: () => pvpQueue(),
  pvpRoom: () => pvpRoom(false),
  pvpJoin: () => pvpRoom(true),
  pvpCancel: () => { if (PVP.sock) PVP.sock.emit('cancel'); closeInfoCard(); },
});

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
    const hs = (p.hell || {})[s] || 0;
    const hOpen = hellOpen(p.stages, s);
    nodes.push(`<button class="node ${open ? '' : 'locked'} ${boss ? 'boss' : ''} ${cur ? 'cur' : ''} ${s === app.selStage ? 'sel' : ''} ${st ? 'done' : ''} ${app.hellMode && hOpen ? 'hellnode' : ''}" data-act="selStage" data-s="${s}">
      <span class="nb">${open ? (boss ? '👑' : '') : '🔒'}<b>${stageLabel(s)}</b></span>
      <span class="ns">${open ? (app.hellMode ? (hOpen ? '🔥' + starStr(hs) : '<small>★3 필요</small>') : starStr(st)) : ''}</span></button>`);
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
    ${Object.values(p.stages).some((v) => v >= 3) ? `<div class="mode-tog"><button class="${app.hellMode ? '' : 'on'}" data-act="hellModeS" data-v="0">일반</button><button class="${app.hellMode ? 'on hell' : ''}" data-act="hellModeS" data-v="1">🔥 헬 모드</button></div>` : ''}
    <div class="nodes">${nodes.join('')}</div>
    <div class="panel stage-info">
      <div class="si-head"><b>${stageLabel(s)} ${esc(stageName(s))}</b><span class="si-stars">${starStr(st)}</span></div>
      <p class="story">📖 ${esc(stageStory(s))}</p>
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
function saveDecks() {
  try { localStorage.setItem(DECK_KEY, JSON.stringify({ decks: app.decks, i: app.deckI })); } catch { /* 무시 */ }
  if (!app.guest && app.profileLoaded) { clearTimeout(saveDecks.t); saveDecks.t = setTimeout(() => API.saveDecksRemote(app.decks, app.deckI).catch(() => {}), 1500); }
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
  showPrep(app.mode, app.stage);
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
    if (i >= max) { cells.push(`<button class="dslot lockd" data-act="shop" aria-label="덱 칸 늘리기"><span class="lk">🔒</span><small>${i === max ? `${fmt(ITEMS[max < 5 ? 'slot5' : 'slot6'].costs[0])}` : ''}</small></button>`); continue; }
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
function showPrep(mode, s) {
  if (mode === 'stage' && !stageUnlocked(s)) s = nextStage();
  app.mode = mode;
  app.stage = mode === 'stage' ? s : 0;
  app.screen = 'prep';
  hud.hidden = true;
  fixDeck();
  const p = P();
  const max = deckSlotsNow();
  const d = curDeck();
  const inDeck = new Set(d.filter(Boolean));
  const wk = mode === 'weekly' ? L.weeklyDef(L.weekIndex()) : null;
  const st = prepStage();
  R.setTheme(st ? chapterOf(st) : 'endless');
  const roster = ['bangjang', ...partnerList()].map((id) => {
    const h = HEROES[id];
    const tag = h.legend ? 'lg' : h.hidden ? 'hid' : h.gacha ? 'ep' : '';
    if (!API.heroUnlocked(p, id)) return `<button class="pcard locked ${tag}" data-act="rosterPick" data-id="${id}"><span class="ii" data-act="heroInfo" data-id="${id}">i</span>${av(h, 'sil')}<b>???</b><small>${esc(HERO_UNLOCK[id] ? stageLabel(HERO_UNLOCK[id]) + ' 클리어' : '모집')}</small></button>`;
    return `<button class="pcard ${tag} ${inDeck.has(id) ? 'on' : ''}" data-act="rosterPick" data-id="${id}"><span class="ii" data-act="heroInfo" data-id="${id}">i</span>${av(h)}<span class="pa">${ATTRS[h.attr].icon}</span>${matchTag(id)}<b>${h.name}</b><small>${'★'.repeat(L.heroStar(p, id))} +${p.heroes[id] || 0}</small></button>`;
  }).join('');
  const fxd = wk ? MAP_FX[wk.fx] || MAP_FX.none : mode === 'stage' ? stageFx(s) : MAP_FX.none;
  const cw = st ? stageClasses(st) : {};
  const cls = Object.keys(cw).sort((a, b) => cw[b] - cw[a]).slice(0, 3).map((c) => `${clsTag(c)}<small>${Math.round(cw[c] * 100)}%</small>`).join('');
  const cleared = mode === 'stage' && (p.stages[s] | 0) > 0;
  const hellOk = mode === 'stage' && hellOpen(p.stages, s);
  const hellOn = hellOk && app.hellMode;
  const head = mode === 'stage'
    ? `<h2 class="title">${hellOn ? '<em class="hellb">HELL</em> ' : ''}${stageLabel(s)} ${esc(stageName(s))}</h2><p class="sub">${STAGE_WAVES}웨이브${stageBosses(s).length ? ' · 👑 보스' : ''} · ${fxd.icon} ${esc(fxd.name)} · 최고 ${starStr(p.stages[s] || 0)}${p.perfects && p.perfects[s] ? ' · 💎' : ''}${hellOk ? ` · 🔥 ${starStr((p.hell || {})[s] || 0)}` : ''}</p>
       ${hellOk ? `<div class="mode-tog"><button class="${hellOn ? '' : 'on'}" data-act="hellMode" data-v="0">일반</button><button class="${hellOn ? 'on hell' : ''}" data-act="hellMode" data-v="1">🔥 헬 모드</button></div>${hellOn ? `<p class="sub hellsub">진상 체력 ×${HELL.hp} · 속도 ×${HELL.speed} · 공격 ×${HELL.atk} · 수 ×${HELL.count} · 보스 분노 — 보상 코인 ×${HELL.coin} · 희귀 이상 장비 확정</p>` : ''}` : ''}`
    : wk ? `<h2 class="title">📅 주간 도전 · ${esc(L.WEEKLY_MODS[wk.mod].name)}</h2><p class="sub">${L.WEEKLY_WAVES}웨이브 · ${fxd.icon} ${esc(fxd.name)} · ${esc(L.WEEKLY_MODS[wk.mod].desc)}</p>`
      : `<h2 class="title">♾️ 무한 도전</h2><p class="sub">어디까지 버틸까? 최고 W${p.bestWave || 0} · 점수 ${fmt(p.bestScore || 0)}</p>`;
  show(`
    <div class="topbar"><button class="back" data-act="${mode === 'stage' ? 'menu' : mode === 'weekly' ? 'weekly' : 'menu'}">‹ 뒤로</button>${coinsPill()}</div>
    ${head}
    ${cls ? `<div class="si-cls prep-cls">적 ${cls}</div>` : ''}
    ${st && app.mode === 'stage' ? `<p class="story">📖 ${esc(stageStory(st))}</p>${waveRowHtml(st)}` : ''}
    <div class="deck-top">
      <div class="deck-tabs">${[0, 1, 2].map((k) => `<button class="${k === app.deckI ? 'on' : ''}" data-act="deckPreset" data-k="${k}">덱 ${k + 1}</button>`).join('')}</div>
      <button class="btn ghost auto" data-act="autoDeck">✨ 추천 덱</button>
    </div>
    <div class="deck-wrap"><div class="deck-rope"></div>${renderDeckField()}</div>
    <div class="teamline" id="deckline">${inDeck.size}/${max}명${max < 6 ? ` <span class="lkcnt" data-act="shop">${'🔒'.repeat(6 - max)}</span>` : ''} · ${deckLine()}</div>
    <p class="sub deck-help">멤버를 누르면 덱에 쏙 · 덱에서 누르면 빠져요 · ⓘ 길게 누르면 멤버 카드 · ▲ 유리 ▼ 불리 · 자리는 전투에서 끌어서 바꿔요</p>
    <div class="pgrid roster">${roster}</div>
    <div class="spacer"></div>
    ${cleared ? `<label class="speed-opt"><input type="checkbox" data-act="speedOpt" ${app.speed2 ? 'checked' : ''}> ⏩ 2배속으로 하기 <small>(깬 스테이지만)</small></label>` : ''}
    <button class="btn primary ${inDeck.size ? '' : 'dim'}" data-act="go">출동! 🚪</button>
  `, 'dim prep-screen');
}
function deckTapSlot(i) {
  if (lockedPos().includes(i)) { const it = ITEMS[deckSlotsNow() < 5 ? 'slot5' : 'slot6']; toast(`🔒 상점에서 열 수 있어요 — ${it.name} ${fmt(it.costs[0])}코인`, 2000); return; }
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
  app.cardsAt = performance.now();
  if (app.rerollsRun === undefined || app.rerollsG !== g) { app.rerollsRun = 5; app.rerollsG = g; }
  app.cards = rollFor(g);
  renderCards(true);
  if (DEBUG.autopick) setTimeout(() => { if (app.cardsOpen) pickCard(0); }, 120);
}
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
    out.push(`<span class="sy ${on ? 'on' : ''}" title="${ATTRS[a].name}">${ATTRS[a].icon}${n}${on ? `<small>+${Math.round(ATTR_SET[Math.min(ATTR_SET.length - 1, n)] * 100)}%</small>` : ''}</span>`);
  }
  for (const t of Object.keys(TAGS)) { const k = g.stacks['tag_' + t] || 0; if (k) out.push(`<span class="sy tag on">${TAGS[t].icon}${k > 1 ? '×' + k : ''}</span>`); }
  const evo = g.heroes.filter((h) => h.evo).length;
  if (evo) out.push(`<span class="sy evo on">✨${evo}</span>`);
  return out.length ? `<div class="syn-tray ${big ? 'big' : ''}">${out.join('')}</div>` : '';
}
// 레벨업 카드: 세로로 긴 종이 카드 + 둥근 메달 아이콘 + NEW 리본 + 시너지 아이콘
function cardHtml(c, i) {
  const r = RARITY[c.rarity];
  let icon = `<span class="em">${c.icon}</span>`;
  if (c.hero) icon = av(HEROES[c.hero]);
  const isNew = (c.kind === 'global' && !c.stack) || c.kind === 'addHero' || c.kind === 'evo';
  const syn = [];
  if (c.attr) syn.push(ATTRS[c.attr].icon);
  if (c.tag) syn.push(TAGS[c.tag].icon);
  if (c.hero) { syn.push(ATTRS[HEROES[c.hero].attr].icon); for (const t of HERO_TAGS[c.hero] || []) syn.push(TAGS[t].icon); }
  if (c.risk) syn.push('⚠️');
  const stack = c.kind === 'global' && c.stack ? `<span class="stk">${c.stack}→${c.stack + 1}</span>` : '';
  return `<button class="card ${c.rarity} k-${c.kind} ${c.risk ? 'risk' : ''} ${app.cardSel === i ? 'sel' : ''}" data-act="pick" data-i="${i}" style="--i:${i}">
    ${isNew ? '<em class="new">NEW</em>' : ''}${stack}
    <div class="medal">${icon}</div>
    <div class="band"><b>${esc(c.title)}</b></div>
    <p>${esc(c.desc)}</p>
    <div class="cfoot"><span class="rar">${r.name}</span>${syn.length ? `<span class="syn">${[...new Set(syn)].join('')}</span>` : ''}</div>
  </button>`;
}
// 레벨업 카드 띠: 게임은 계속 흘러간다 — 한 번 누르면 바로 선택 (뜬 뒤 0.4초는 무시)
// 12초 안에 안 고르면 맨 왼쪽(추천) 카드를 자동으로 고른다 (8초부터 테두리가 깜빡이며 알림)
const cardStrip = document.createElement('div');
cardStrip.id = 'cardstrip'; cardStrip.hidden = true;
stage.appendChild(cardStrip);
cardStrip.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  A.unlock();
  if (b.dataset.act === 'pick') tapCard(Number(b.dataset.i));
  else if (b.dataset.act === 'reroll') rerollCards();
});
function renderCards(fresh) {
  const g = app.g;
  if (fresh) { app.cardSel = -1; app.cardLockUntil = performance.now() + 400; app.cardsAt = performance.now(); clearTimeout(renderCards.auto); renderCards.auto = setTimeout(() => { if (app.cardsOpen && app.g === g && !app.paused) pickCard(0); }, 12000); }
  const welcome = g.welcomePicks > 0;
  cardStrip.hidden = false;
  cardStrip.className = 'fresh';
  cardStrip.innerHTML = `<div class="cs-head"><b>${welcome ? '🍹 웰컴 드링크' : `LEVEL UP! Lv.${g.level}`}</b>${g.pendingLevels > 1 ? `<small>남은 선택 ${g.pendingLevels}</small>` : ''}<button class="cs-re" data-act="reroll" ${app.rerollsRun > 0 ? '' : 'disabled'}>🎲 ${app.rerollsRun}</button></div>
    <div class="card-list v2 strip n${app.cards.length}">${app.cards.map(cardHtml).join('')}</div>`;
  clearTimeout(renderCards.nag); renderCards.nag = setTimeout(() => cardStrip.classList.add('nag'), 8000);
  if (fresh) A.sfx.card();
  if (fresh && app.cards.some((c) => c.rarity === 'hidden')) { fx.flash('#ff9ff0', 0.3); A.sfx.join(); }
  return;
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
  if (c.kind === 'addHero' && (c.rarity === 'hidden' || HEROES[c.hero].legend)) showReveal(c.hero, HEROES[c.hero].legend ? 'legend' : 'hidden');
  g.pendingLevels = Math.max(0, g.pendingLevels - 1);
  if (g.welcomePicks > 0) g.welcomePicks--;
  A.sfx.pick();
  handleEvents(g, true);
  if (c.kind === 'global') fx.text(180, g.rowY - 90, c.title + '!', RARITY[c.rarity].color, 18, 1.2, -20);
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
  clearTimeout(renderCards.auto); clearTimeout(renderCards.nag);
  cardStrip.hidden = true; cardStrip.innerHTML = '';
}

// ─── 일시정지 ────────────────────────────────────────
function pauseGame() {
  if (!app.g || app.g.over || app.ending) return;
  app.paused = true;
  cancelAim(); hideBubble();
  const g = app.g;
  const w = Math.max(1, g.lastSnap ? g.lastSnap.wave : g.wave);
  show(`
    <div class="topbar"><button class="back" data-act="toLobby">‹ 메인 메뉴</button><div class="tb-right"><button class="share-btn" data-act="share">📤 공유하기</button><button class="icon-btn" data-act="mute">${A.isMuted() ? '🔇' : '🔊'}</button></div></div>
    <div class="pause-box">
      <h2>일시정지</h2>
      <p class="sub">${g.mode === 'stage' ? `스테이지 ${stageLabel(g.stage)} · 웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}` : `무한 도전 · 웨이브 ${Math.max(1, g.wave)}`}</p>
      <button class="btn primary" data-act="resume">계속하기</button>
      <button class="btn" data-act="toLobby">🏠 메인 메뉴로 <small>이어하기 저장 · 웨이브 ${w} 처음부터 이어서</small></button>
      ${g.pvp || g.weekly || g.raid ? '' : '<button class="btn" data-act="restart">🔁 다시 하기 <small>이 스테이지 처음부터</small></button>'}
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
  const wk = !!g.weekly && !g.raid;
  const stageMode = g.mode === 'stage' && !wk && !g.pvp && !g.raid;
  const win = victory && stageMode;
  let title, sub, top;
  if (stageMode) {
    title = win ? `${g.hell ? '🔥 HELL ' : ''}${stageLabel(g.stage)} 클리어!` : quit ? '오늘은 여기까지' : `${g.hell ? 'HELL ' : ''}${stageLabel(g.stage)} 실패…`;
    sub = win ? `입구 내구도 ${sum.hpPct}% 로 지켜냈다!` : `웨이브 ${Math.max(1, g.wave)}/${g.totalWaves}에서 막혔어요 · ${quit ? '다음엔 끝까지!' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0]}`;
    top = win
      ? `<div class="big-stars">${[1, 2, 3].map((k) => `<span class="${k <= g.stars ? 'on' : ''}" style="animation-delay:${0.25 + k * 0.28}s">★</span>`).join('')}</div>
         <div class="star-rule">${sum.perfect ? '<b class="perfect">💎 PERFECT! 입구가 한 번도 안 맞았다</b>' : g.stars >= 3 ? '완벽 방어! ★★★ (입구 무피해면 PERFECT)' : g.stars === 2 ? '★★★ 까지 입구 70% 이상 남기기' : '★★ 는 입구 35% 이상 남기면!'}</div>`
      : `<div class="fail-tip">💡 ${FAIL_TIPS[(Math.random() * FAIL_TIPS.length) | 0]}</div>`;
  } else if (g.raid) {
    title = '🐉 레이드 끝!';
    sub = `${Math.round(Math.min(g.t, g.raid.sec))}초 동안 보스에게 준 피해`;
    top = `<div class="score-big"><small>보스 피해</small><b>${fmt(g.raid.dmg)}</b></div>`;
  } else if (g.pvp) {
    const pr = app.pvpResult || {};
    title = pr.win ? '⚔️ 대전 승리!' : '⚔️ 대전 패배…';
    sub = pr.reason === 'forfeit' ? '상대가 나가서 기권승' : pr.win ? '상대 방어선이 먼저 뚫렸다!' : '방어선이 먼저 뚫렸어요';
    top = `<div class="score-big"><small>${pr.ranked ? '점수' : pr.bot ? '연습 상대' : '친선전'}</small><b>${pr.ranked ? `${pr.delta >= 0 ? '+' : ''}${pr.delta} → ${pr.rating}` : pr.win ? 'WIN' : 'LOSE'}</b></div>`;
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
  if (win && g.hell) buttons.push('<button class="btn primary" data-act="again">🔥 헬 다시 하기</button>');
  else if (win && g.stage < STAGE_COUNT) buttons.push(`<button class="btn primary" data-act="nextStage">다음 스테이지 ${stageLabel(g.stage + 1)} ▶</button>`);
  if (g.raid) buttons.push('<button class="btn primary" data-act="raid">🐉 레이드 현황</button>', '<div class="gap"></div><button class="btn ghost" data-act="menu">로비로</button>');
  else if (g.pvp) buttons.push('<button class="btn primary" data-act="pvpQueue">⚔️ 한 판 더</button>', '<div class="gap"></div><button class="btn ghost" data-act="pvp">대전 화면</button>');
  else if (wk) buttons.push('<button class="btn primary" data-act="weeklyGo">다시 도전</button>', '<div class="gap"></div><button class="btn ghost" data-act="weekly">📅 주간 순위 보기</button>');
  else if (stageMode && !win) buttons.push('<button class="btn primary" data-act="again">다시 도전</button>', '<div class="gap"></div><div class="grid2"><button class="btn" data-act="shop"><i>🛒</i>강화하러 가기</button><button class="btn" data-act="stages"><i>🗺️</i>스테이지 선택</button></div>');
  else if (stageMode) buttons.push('<div class="gap"></div><div class="grid2"><button class="btn" data-act="again"><i>🔁</i>다시 하기</button><button class="btn" data-act="stages"><i>🗺️</i>스테이지 선택</button></div>');
  else if (!wk) buttons.push('<button class="btn primary" data-act="again">다시 도전</button>', '<div class="gap"></div><button class="btn ghost" data-act="menu">메뉴로</button>');
  if (!buttons.some((b) => /data-act="menu"/.test(b))) buttons.push('<div class="gap"></div><button class="btn ghost" data-act="menu">🏠 메인 메뉴로</button>');
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
    time, nickname: app.guest ? '' : app.nickname, chapter: g.mode === 'stage' ? chapterOf(g.stage) : 3,
    heroes: heroes.slice(0, 6).map((h) => ({ img: h.def.img, name: h.def.name, color: h.def.color })),
  };
  if (win || !stageMode || wk || g.raid || g.pvp) saveResult(sum, g);
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

async function saveWeekly(sum, g, box) {
  const r = await API.postWeekly(sum, app.weeklyRun, app.guest);
  app.weeklyRun = null;
  if (r.ok && r.profile) app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '알 수 없는 오류')}</div>`; return; }
  const w = r.weekly || {};
  const sc = $('#wkscore');
  if (sc && w.score !== undefined) sc.textContent = fmt(w.score);
  box.innerHTML = `<div class="rewards"><div class="rw hl"><span>📅 이번 주 최고</span><b>${fmt(w.best || 0)}${w.newBest ? ' 🆕' : ''}</b></div>
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
    : { wave: sum.wave, score: sum.score, kills: sum.kills, bossKills: sum.bossKills, skills: sum.skills, durationSec: sum.durationSec, seen: sum.seen };
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
    if (rw.mid) lines.push(`<div class="rw"><span>⚡ 중간 보스 처치</span><b>+${fmt(rw.mid)}</b></div>`);
    if (rw.hell) lines.push(`<div class="rw hl hellrw"><span>🔥 헬 모드 보상 ×${HELL.coin}</span><b>포함</b></div>`);
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
  for (const id of r.unlockedHeroes || []) await showJoinReveal(id, HEROES[id].legend ? 'legend' : HEROES[id].hidden ? 'hidden' : 'new');
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
  if (stage.querySelector('.hero-pop')) { showHeroModal(id, app.screen === 'prep' ? 'prep' : ''); refreshBehind(); } else refresh();
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
  refresh();
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
  youngjun: '파티장에 흑표범처럼 뛰어드는 전사. 뛰어든 동안엔 아무것도 안 통한다.',
  eunok: '처음엔 얌전히 홀짝홀짝. 20초 뒤엔… 소주병이 날아다니기 시작한다.',
  hanna: '랑방 공식 윙크 담당. 남자 진상은 윙크 한 방에 정신 못 차리고 날아간다.',
  sunggu: '"요즘 것들은…"이 입버릇인 최고참. 지팡이 하나로 한 줄을 통째로 정리한다.',
  junseo: '여사친이 유난히 많은 남자. "잠깐, 내 친구 소개해 줄게!" 하면 여사친이 굴러간다.',
  hyungyeong: '"다이어트는 내일부터!" 통통할 땐 벽, 주사 한 방이면 복서. 그리고… 요요.',
  ara: '목소리 맑은 랑방 공주님. 가끔 폭삭 늙어서 "아이고 허리야"를 외치지만 망치는 여전히 무겁다.',
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
  selfie: '모임 사진은 전부 자기 얼굴만 나오는 인플루언서. 플래시에 멤버 눈이 멀어 버린다.',
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
};
// 도감 카드 세로 영문 이름 · 얼굴 위치 (dexhq 전신 그림 기준: 가운데 x, y, 얼굴 폭 — 그림 폭 대비)
const DEX_EN = { bangjang: 'BANGJANG', staff: 'STAFF', gunman: 'MR. CLEAN', gunnyeo: 'MS. CLEAN', myunghoon: 'SEO MYUNGHOON', dohoon: 'KIM DOHOON', ingyu: 'BAEK INGYU', donghan: 'MOON DONGHAN', youngjun: 'KIM YOUNGJUN', eunok: 'CHOI EUNOK', hanna: 'LEE HANNA', sunggu: 'KANG SUNGGU', junseo: 'YOON JUNSEO', hyungyeong: 'BAE HYUNGYEONG', ara: 'KO ARA', hochan: 'LEE HOCHAN' };
const DEX_FACE = { hochan: [0.49, 0.125, 0.19], bangjang: [0.45, 0.1, 0.17], staff: [0.47, 0.085, 0.14], gunnyeo: [0.47, 0.09, 0.14], eunok: [0.44, 0.078, 0.13], hyungyeong: [0.52, 0.135, 0.2], ara: [0.34, 0.29, 0.15], donghan: [0.56, 0.09, 0.17], junseo: [0.55, 0.075, 0.14], hanna: [0.47, 0.083, 0.14], sunggu: [0.49, 0.09, 0.15], gunman: [0.59, 0.085, 0.14], dohoon: [0.56, 0.09, 0.14], myunghoon: [0.56, 0.1, 0.17], youngjun: [0.5, 0.085, 0.14], ingyu: [0.47, 0.085, 0.14] }; // 없으면 [0.48, 0.09, 0.15]
// 변신 그림 (그림을 누르면 바뀜)
const DEX_ALT = { eunok: ['eunok_rage'], hyungyeong: ['hyungyeong_slim'], ara: ['ara_old'], donghan: ['donghan_on'], youngjun: ['youngjun_dash'], scammer: ['scammer_ugly', 'scammer_fat'] };
const DEX_FORM = { eunok: '평소', eunok_rage: '분노 모드', hyungyeong: '통통 모드', hyungyeong_slim: '날씬 모드', ara: '공주', ara_old: '폭삭 늙음', donghan: '누워서 간보기', donghan_on: '진심 모드', youngjun: '대기', youngjun_dash: '돌격!', scammer: '프사', scammer_ugly: '실물 (공포)', scammer_fat: '실물 (뚱뚱)' };
// 캐릭터별 가만히 있을 때 움직임
const DEX_ANIM = { dohoon: 'notes', eunok: 'flame', donghan: 'sleepy', hochan: 'gold', hanna: 'hearts', junseo: 'hearts', youngjun: 'bouncy', ingyu: 'flex', hyungyeong: 'bouncy', sunggu: 'sway', ara: 'breathe', drunk_sleep: 'sleepy', boss_soloparty: 'party' };
function dexAnim(kind, d, id) {
  if (DEX_ANIM[id]) return DEX_ANIM[id];
  if (kind === 'hero') return 'breathe';
  const b = d.base || (d.fuse && d.fuse[0]) || id;
  if (/^drunk|^boss_jusa|vomit/.test(b)) return 'wobble';
  return d.boss || d.mid ? 'menace big' : 'menace';
}
const DEX_FX = {
  notes: () => Array.from({ length: 6 }, (_, i) => `<i class="nt" style="--x:${12 + i * 15}%;--d:${i * 0.55}s">${i % 2 ? '♫' : '♪'}</i>`).join(''),
  hearts: () => Array.from({ length: 5 }, (_, i) => `<i class="nt ht" style="--x:${14 + i * 17}%;--d:${i * 0.7}s">♥</i>`).join(''),
  sleepy: () => '<i class="zz">Z</i><i class="zz" style="--d:.8s">z</i><i class="zz" style="--d:1.6s">z</i>',
  flame: () => Array.from({ length: 7 }, (_, i) => `<i class="fl" style="--x:${8 + i * 13}%;--d:${(i * 0.23) % 1}s"></i>`).join(''),
  gold: () => '<i class="sh"></i>' + Array.from({ length: 8 }, (_, i) => `<i class="sp" style="--x:${(i * 37) % 90 + 5}%;--y:${(i * 53) % 70 + 10}%;--d:${i * 0.35}s">✦</i>`).join(''),
  party: () => Array.from({ length: 8 }, (_, i) => `<i class="sp cf" style="--x:${(i * 41) % 90 + 5}%;--y:${(i * 29) % 60 + 5}%;--d:${i * 0.3}s;color:${['#ff6fd8', '#ffd23f', '#6fe3ff', '#8dff7a'][i % 4]}">✦</i>`).join(''),
};
// 도감 그림: 큰 그림(dex/) → 없으면 원래 그림
function dexImg(id, fb, cls = '') { return `<img class="dx-art ${cls}" src="/img/lb/dex/${id}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='${fb}'">`; }
function dexArt(d, id, form) {
  if (d.fuse) return `<span class="dx-fuse">${d.fuse.map((f) => dexImg(f, ENEMIES[f].img)).join('')}</span>`;
  const base = d.base || id;
  return dexImg(form || base, d.img);
}
function dexColor(kind, d) { return kind === 'hero' ? ATTRS[d.attr].color : d.boss ? '#ff5a5a' : d.mid ? '#ff9d3f' : CLASSES[d.cls].color; }
function dexChapter(kind, id) { const s = kind === 'hero' ? HERO_UNLOCK[id] || 1 : firstStageOf(id) || STAGE_COUNT; return clamp(chapterOf(s), 1, 6); }
function heroHow(id) {
  if (!LOCKED_HEROES.includes(id)) return '처음부터 함께하는 멤버';
  if (HERO_UNLOCK[id]) return `${stageLabel(HERO_UNLOCK[id])} 클리어하면 합류`;
  if (LEGEND_HEROES.includes(id)) { const pr = L.cardProgress(P(), id); return `마지막 스테이지(${stageLabel(STAGE_COUNT)}) 클리어 후 모집에서 카드 ${L.UNLOCK_CARDS.legend}장을 모으면 합류${pr ? ` — 지금 ${pr[0]}/${pr[1]}장` : ''}`; }
  const pr = L.cardProgress(P(), id);
  return `모집에서 카드를 모아 합류${pr ? ` — 지금 ${pr[0]}/${pr[1]}장` : ''}`;
}
function dexList(kind) { return kind === 'hero' ? DEX_HEROES() : DEX_ENEMIES(); }
function showDex() {
  app.screen = 'dex';
  hud.hidden = true;
  const tab = app.dexTab || 'hero';
  const kind = tab === 'hero' ? 'hero' : 'enemy';
  const ids = dexList(kind);
  const nH = DEX_HEROES().filter((id) => dexKnown('hero', id)).length, nE = DEX_ENEMIES().filter((id) => dexKnown('enemy', id)).length;
  const v = dexViewed();
  const cards = ids.map((id) => {
    const d = kind === 'hero' ? HEROES[id] : ENEMIES[id];
    const ok = dexKnown(kind, id);
    const isNew = ok && !v.has((kind === 'hero' ? 'h:' : 'e:') + id);
    const tag = kind === 'hero' ? ATTRS[d.attr].icon : CLASSES[d.cls].icon;
    const fr = kind === 'hero' ? `fr-t${heroTier(id)}` : d.boss ? 'fr-boss' : d.mid ? 'fr-mid' : 'fr-e';
    const badge = kind === 'hero' ? `<i class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]}</i>` : d.boss ? '<i class="dxb bs">보스</i>' : d.mid ? `<i class="dxb md">${d.fuse ? '합체' : '각성'}</i>` : '';
    return `<button class="dexc2 ${fr} ${ok ? '' : 'lock'}" data-act="dexCard" data-kind="${kind}" data-id="${id}" style="--c:${dexColor(kind, d)}">
      <span class="dx-pic">${dexArt(d, id)}</span>${badge}<span class="dt">${tag}</span>
      <b>${ok ? esc(d.name) : '???'}</b>${isNew ? '<span class="newdot">N</span>' : ''}${!ok && kind === 'hero' && (GACHA_HEROES.includes(id) || LEGEND_HEROES.includes(id)) ? (() => { const pr = L.cardProgress(P(), id); return pr ? `<span class="dx-cards"><i style="width:${Math.round((pr[0] / pr[1]) * 100)}%"></i><em>${pr[0]}/${pr[1]}</em></span>` : ''; })() : ''}</button>`;
  }).join('');
  show(`
    ${topbar(true)}
    <h2 class="title">📚 랑방 도감</h2>
    <div class="tabs"><button class="${tab === 'hero' ? 'on' : ''}" data-act="dexTab" data-tab="hero">🙋 아군 ${nH}/${DEX_HEROES().length}</button><button class="${tab === 'enemy' ? 'on' : ''}" data-act="dexTab" data-tab="enemy">😈 악당 ${nE}/${DEX_ENEMIES().length}</button></div>
    <p class="sub">${tab === 'hero' ? '눌러서 멤버 소개 보기 · 옆으로 밀면 다음 멤버' : '만나 본 진상만 기록돼요 · 눌러서 약점 확인! · 🐜 떼거리엔 범위 공격 · 💀 정예엔 한 방 공격'}</p>
    <div class="dex-grid v2">${cards}</div>
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
    plate = `<div class="dp-plate"><small>🔒 ${kind === 'hero' ? '아직 합류하지 않은 멤버' : '아직 만나지 못한 진상'}</small></div>`;
    body = `<p class="dp-flavor">${kind === 'hero' ? '아직 합류하지 않은 멤버예요' : '아직 만나지 못한 진상이에요'}</p>
      <section><h4>🔓 만나는 법</h4><p>${esc(kind === 'hero' ? heroHow(id) : (firstStageOf(id) ? `${stageLabel(firstStageOf(id))} 부터 나와요` : '무한 도전에서 나와요'))}</p></section>`;
  } else if (kind === 'hero') {
    const t = heroTier(id), sk = d.skill, rg = Array.isArray(d.range) ? d.range[0] : d.range;
    const meta = (P().heroes || {})[id] || 0, st = L.heroStar(P(), id);
    plate = `<div class="dp-plate"><small>${esc(d.role)}</small>
      <div class="dp-star">${'★'.repeat(st)}<i>${'★'.repeat(L.STAR_MAX - st)}</i>${meta ? ` · 강화 +${meta}` : ''} · 기본 ×${tierPower(t, 0).toFixed(2)}</div></div>`;
    body = `<p class="dp-flavor">“${esc(DEX_FLAVOR[id] || d.desc.replace(/^"|"$/g, ""))}”</p>
      <div class="sbars">${bar('사거리', rg / 620)}${bar('공격 속도', 0.42 / d.interval)}${bar('한 방', d.dmg / 62)}</div>
      <section><h4>⚔️ 기본 공격</h4><p>${esc(d.attack || d.desc)}</p></section>
      ${sk ? `<section><h4>✨ 스킬 · ${esc(sk.name)} <span class="rg">쿨 ${sk.cd}초${sk.target ? ' · 찍어서 사용' : ''}</span></h4><p>${esc(sk.desc)}</p>${SKILL_EVO[id] ? `<p class="evo">🌟 진화 카드: <b>${esc(SKILL_EVO[id])}</b></p>` : ''}</section>` : ''}
      ${d.perks ? `<section><h4>📈 성장</h4><p>Lv3 ${esc(d.perks[3])}</p><p>Lv5 ${esc(d.perks[5])}</p></section>` : ''}
      <section><h4>⚖️ 상성</h4><p>${attrTag(d.attr)} ${esc(strongWeak(d.attr))}</p></section>
      <section><h4>📍 합류</h4><p>${esc(heroHow(id))}</p></section>`;
  } else {
    const fs = firstStageOf(id);
    const tipId = ENEMY_TIPS[id] ? id : d.base || (d.fuse && d.fuse[0]) || id;
    const good = Object.keys(ATTRS).filter((a) => typeMul(a, d.cls) > 1).map((a) => ATTRS[a].icon + ATTRS[a].name);
    const bad = Object.keys(ATTRS).filter((a) => typeMul(a, d.cls) < 1).map((a) => ATTRS[a].icon + ATTRS[a].name);
    const flav = DEX_FLAVOR[id] || (d.fuse ? `${ENEMIES[d.fuse[0]].name} + ${ENEMIES[d.fuse[1]].name} 이 합체했다! 두 진상의 기술을 모두 쓴다.` : d.base ? `평범한 ${ENEMIES[d.base].name} 이 각성했다! 훨씬 크고 단단하다.` : '');
    const shout = (d.shouts || []).slice(0, 2).map((s) => `“${esc(s)}”`).join(' ');
    plate = `<div class="dp-plate"><small>${d.mid ? `중간 보스 · ${d.fuse ? '합체' : '각성'} · ` : d.boss ? '보스 · ' : ''}${shout || esc(CLASSES[d.cls].name)}</small></div>`;
    body = `<p class="dp-flavor">“${esc(flav)}”</p>
      <div class="sbars">${bar('체력', Math.log10(d.hp) / Math.log10(4000))}${bar('속도', d.speed / 95)}${bar('입구 피해', d.atk / 36)}</div>
      <section><h4>🧨 특징</h4>${(d.fuse ? d.fuse : [tipId]).map((t) => `<p>${d.fuse ? `<b>${esc(ENEMIES[t].name)}</b> · ` : ''}${esc(ENEMY_TIPS[t] || '')}</p>`).join('')}</section>
      <section><h4>⚖️ 상성</h4><p>잘 먹힘 ${good.join(' ')} <span class="rg">×${TYPE_STRONG}</span></p><p>안 먹힘 ${bad.join(' ')} <span class="rg">×${TYPE_WEAK}</span></p></section>
      <section><h4>📍 등장</h4><p>${fs ? `${stageLabel(fs)} 부터` : '무한 도전'}${d.boss ? ' · 보스' : d.mid ? ' · 3웨이브 중간 보스' : ''}</p></section>`;
  }
  // 뽑기 캐릭터 카드 느낌: NO. 번호 · 대각선 두 색 배경 · 큰 전신 그림 · 세로 영문 이름 · 오른쪽 아래 큰 이름
  const hero = kind === 'hero';
  const hqForm = hero && (!cur || cur === id);
  const art = hero && hqForm
    ? (duo
      // 두 모습 그림(가로, dexhq/<id>_duo) — 없으면 한 장으로
      ? `<img class="dx-art hq duo" src="/img/lb/dexhq/${id}_duo.webp" alt="" draggable="false" onerror="this.onerror=null;this.classList.remove('duo');this.src='/img/lb/dexhq/${id}.webp'">`
      : `<img class="dx-art hq" src="/img/lb/dexhq/${id}.webp" alt="" draggable="false" onerror="this.onerror=null;this.src='/img/lb/dex/${id}.webp';var c=this.closest('.gc');if(c)c.classList.add('nohq')">`)
    : dexArt(d, id, cur);
  const fb = DEX_FACE[id] || [0.48, 0.09, 0.15];
  const faces = hero && hqForm && ok ? `<div class="gc-faces">${[1, 1.5, 2.2].map((z) => { const w = (100 / fb[2]) * z; return `<span><img src="/img/lb/dexhq/${id}.webp" alt="" draggable="false" style="width:${w.toFixed(1)}%;left:${(50 - fb[0] * w).toFixed(1)}%;top:${(50 - fb[1] * 1.5 * w).toFixed(1)}%" onerror="this.closest('.gc-faces').remove()"></span>`; }).join('')}</div>` : '';
  const badges = hero ? `<i class="tier t${heroTier(id)}">${TIER_NAME[heroTier(id)]}</i>${attrTag(d.attr)}` : `${d.boss ? '<i class="dxb bs">보스</i>' : d.mid ? `<i class="dxb md">${d.fuse ? '합체' : '각성'}</i>` : ''}${clsTag(d.cls)}`;
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
        ${alts ? `<span class="dp-form">👆 ${esc(DEX_FORM[cur] || '')} <small>눌러서 변신</small></span>` : ''}
      </div>
      ${hero && ok && DEX_ALT[id] ? `<button class="gc-duo" data-dp="duo" hidden>${duo ? '👤 한 명만' : '👥 두 모습 보기'}</button><img class="gc-probe" src="/img/lb/dexhq/${id}_duo.webp" alt="" hidden onload="var b=this.parentNode.querySelector('.gc-duo');if(b)b.hidden=false">` : ''}
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
  const st = { kind, id, form: null, duo: false };
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
    else if (act === 'lock') { const set = gearLocked(); const id = Number(a1); if (set.has(id)) set.delete(id); else set.add(id); lsSave('langbang:gearLock', set); closeInfoCard(); showGearCard(id); refreshBehind(); return; }
    if (r && r.ok && r.profile) { app.profile = r.profile; A.sfx.levelUp(); toast(act === 'sell' ? `+${r.sold} 코인` : act === 'enh' ? '강화 성공!' : '장착!', 1200); }
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
  const list = (p.gear || []).filter((x) => GEAR[x.t].slot === slot).sort((a, b) => gearValue(b.t, b.r, b.lv) * GEAR_RARITY[b.r].mul - gearValue(a.t, a.r, a.lv) * GEAR_RARITY[a.r].mul);
  const rows = list.map((it) => `<button class="gpick ${it.id === cur ? 'on' : ''}" data-g="equip:${hero}:${slot}:${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${gearName(it)}<small>${GEAR_RARITY[it.r].name} · ${esc(gearStatText(it))}${equippedBy(p, it.id) && equippedBy(p, it.id) !== hero ? ` · ${HEROES[equippedBy(p, it.id)].name}` : ''}</small></button>`).join('');
  gearModal(`<div class="ih"><b>${HEROES[hero].name} · ${slot === 'w' ? '무기' : '액세서리'}</b></div>
    <div class="gpick-list">${rows || '<p class="sub">이 칸에 낄 장비가 없어요</p>'}</div>
    ${cur ? `<button class="btn" data-g="equip:${hero}:${slot}:x">빼기</button>` : ''}`);
}

// ─── 가방 (장비 화면): 위 = 멤버 + 무기/액세서리 칸 + 능력치, 아래 = 가방 격자 ─────
const GEAR_W = { atk: 1, spd: 1, crit: 1.3, skill: 0.6, cd: 0.7, attr: 0.8, strip: 0.4, hp: 0.6, range: 0.7 };
const gearScore = (it) => gearValue(it.t, it.r, it.lv) * (GEAR_W[GEAR[it.t].stat] || 0.5);
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
  const items = ['w', 'a'].map((k) => (p.gear || []).find((g) => g.id === sl[k])).filter(Boolean);
  const st = {};
  for (const it of items) { const k = GEAR[it.t].stat; st[k] = (st[k] || 0) + gearValue(it.t, it.r, it.lv); }
  return st;
}
function statLines(st) {
  const ks = Object.keys(st);
  return ks.length ? ks.map((k) => `<span>${GEAR_STATS[k].name} <b>+${(st[k] * 100).toFixed(1)}%</b></span>`).join('') : '<span class="dimtxt">장비 효과 없음</span>';
}
function showBag() {
  app.screen = 'bag';
  hud.hidden = true;
  const p = P();
  const id = bagHero();
  const d = HEROES[id];
  const sl = (p.equip || {})[id] || {};
  const find = (gid) => (p.gear || []).find((x) => x.id === gid);
  const slot = (k) => { const it = find(sl[k]); return `<button class="bslot ${k} ${it ? 'r-' + it.r : 'empty'}" data-act="gearSlot" data-hero="${id}" data-slot="${k}" style="--rc:${it ? GEAR_RARITY[it.r].color : '#4a4060'}">${it ? `<span class="gi">${GEAR[it.t].icon}</span>${it.lv ? `<em>+${it.lv}</em>` : ''}` : `<span class="gi ph">${k === 'w' ? '🗡️' : '💍'}</span>`}<small>${k === 'w' ? '무기' : '액세서리'}</small></button>`; };
  const filt = app.bagFilter || 'all';
  const locks = gearLocked();
  const seenMax = gearSeenMax();
  const list = (p.gear || []).filter((it) => filt === 'all' || GEAR[it.t].slot === filt).slice()
    .sort((a, b) => (app.bagSort === 'lv' ? b.lv - a.lv : 0) || GEAR_RARITY[b.r].mul - GEAR_RARITY[a.r].mul || b.lv - a.lv || b.id - a.id);
  const cells = list.map((it) => {
    const eq = equippedBy(p, it.id);
    return `<button class="bitem r-${it.r}" data-act="gearItem" data-id="${it.id}" style="--rc:${GEAR_RARITY[it.r].color}">${GEAR[it.t].icon}${it.lv ? `<small class="lv">+${it.lv}</small>` : ''}${eq ? `<small class="eq">${HEROES[eq].name}</small>` : ''}${it.id > seenMax ? '<i class="nb">N</i>' : ''}${locks.has(it.id) ? '<i class="lk">⭐</i>' : ''}</button>`;
  }).join('');
  const maxId = Math.max(0, ...(p.gear || []).map((x) => x.id));
  show(`
    ${subTop('가방')}
    <div class="bag-top" style="--c:${d.color}">
      <button class="bnav l" data-act="bagHero" data-d="-1">‹</button>
      <div class="bag-art">${av(d)}<b>${d.name}</b><span>${attrTag(d.attr)} ${'★'.repeat(L.heroStar(p, id))} +${p.heroes[id] | 0}</span></div>
      <button class="bnav r" data-act="bagHero" data-d="1">›</button>
      ${slot('w')}${slot('a')}
    </div>
    <div class="bag-stats">${statLines(heroGearStats(p, id))}</div>
    <div class="bag-bar">
      <div class="chips">${[['all', '전체'], ['w', '무기'], ['a', '액세서리']].map(([k, n]) => `<button class="chip ${filt === k ? 'on' : ''}" data-act="bagFilter" data-v="${k}">${n}</button>`).join('')}
        <button class="chip" data-act="bagSort">${app.bagSort === 'lv' ? '강화순' : '등급순'} ⇅</button></div>
      <button class="btn mini auto-eq" data-act="autoEquip">✨ 추천 장착</button>
    </div>
    <p class="sub">가방 ${(p.gear || []).length}/80 · 장비를 누르면 끼기·강화·팔기·잠금</p>
    <div class="bag-grid">${cells || `<div class="empty-state"><span>🎒</span><b>${filt === 'all' ? '아직 장비가 없어요' : '이 칸에 맞는 장비가 없어요'}</b><small>스테이지를 깨면 장비가 떨어져요</small></div>`}</div>
    ${navHtml('bag')}
  `, 'dim withnav bag-screen');
  if (maxId > seenMax) setTimeout(() => { try { localStorage.setItem('langbang:gearSeen', String(maxId)); } catch { /* 무시 */ } }, 1500);
}
// 장비 상세: 지금 고른 멤버 기준으로 끼면 어떻게 바뀌는지 미리 보기
function showGearCard(gid) {
  const p = P();
  const it = (p.gear || []).find((x) => x.id === gid);
  if (!it) return;
  const cost = gearEnhanceCost(it.r, it.lv);
  const eq = equippedBy(p, gid);
  const hero = app.screen === 'bag' ? bagHero() : eq || owned()[0];
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
  gearModal(`<div class="gc-head" style="--rc:${GEAR_RARITY[it.r].color}"><span class="gc-ico">${GEAR[it.t].icon}</span><div><b>${esc(GEAR[it.t].name)}${it.lv ? ` +${it.lv}` : ''} ${locked ? '⭐' : ''}</b><small>${GEAR_RARITY[it.r].name} · ${k === 'w' ? '무기' : '액세서리'}${eq ? ` · ${HEROES[eq].name} 장착 중` : ''}</small></div></div>
    <p class="ia">${esc(gearStatText(it))}${cost !== null ? ` → 강화하면 +${(gearValue(it.t, it.r, it.lv + 1) * 100).toFixed(1)}%` : ' (MAX)'}</p>
    <div class="gdiff"><small>${HEROES[hero].name}에게 끼면</small>${diff}</div>
    <div class="gc-row">${eq === hero ? `<button class="btn" data-g="equip:${hero}:${k}:x">빼기</button>` : `<button class="btn primary" data-g="equip:${hero}:${k}:${gid}">${HEROES[hero].name}에게 끼기</button>`}
      <button class="btn ${cost !== null && p.coins >= cost ? 'pink' : ''}" data-g="enh:${gid}" ${cost === null || p.coins < cost ? 'disabled' : ''}>강화 ${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button></div>
    <div class="gc-row"><button class="btn ghost" data-g="lock:${gid}">${locked ? '⭐ 잠금 풀기' : '☆ 잠그기 (팔기 방지)'}</button><button class="btn ghost" data-g="sell:${gid}" ${locked ? 'disabled' : ''}>팔기 +${fmt(gearSellValue(it.r, it.lv))}</button></div>`);
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
  toast(n ? `✨ ${HEROES[id].name}에게 좋은 장비를 끼웠어요` : '이미 제일 좋은 장비예요', 1600);
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
    ? res.ranking.map((r) => `<div class="rank r${r.rank} ${res.me && res.me.username === r.username ? 'me' : ''}" data-act="playerCard" data-u="${esc(r.username || '')}"><span class="no">${medal[r.rank - 1] || r.rank}</span>
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
      <div class="it"><i>🌊</i><div><b>웨이브 성격</b>: 🐜 떼거리(약한 진상이 떼로 → 범위 공격) · 💀 정예(적지만 단단, 범위 피해 -35% → 한 방 공격) · ⚔️ 혼합(떼거리 + 정예 호위) · 👑 보스. 출전 준비 화면에서 미리 보고 덱을 짜요!</div></div>
      <div class="it"><i>💥</i><div>한꺼번에 3명 이상 잡으면 <b>트리플! · 5킬! · 싹쓸이!! · 대학살!!!</b> 계속 잡으면 <b>콤보</b> — 경험치 최대 +15% (2초 못 잡으면 끊겨요)</div></div>
      <div class="it"><i>🗺️</i><div><b>스테이지</b>를 하나씩 깨요. 3챕터 × 10스테이지, 한 스테이지는 ${STAGE_WAVES}웨이브. x-5 · x-10 은 <b>보스</b>!</div></div>
      <div class="it"><i>⭐</i><div>클리어할 때 입구 내구도가 70% 이상이면 <b>★★★</b>, 35% 이상이면 ★★, 그 밖엔 ★. 처음 깰 때와 별을 새로 받을 때 코인 보너스! 입구가 <b>한 번도 안 맞고</b> 깨면 <b>💎 PERFECT</b> — 코인 더 + 첫 퍼펙트는 희귀 이상 장비 확정!</div></div>
      <div class="it"><i>🃏</i><div>출동 전에 <b>덱</b>을 짜요. 5명(상점에서 6·7번째 칸 구매)을 원하는 <b>자리</b>에 세우고, 덱은 3개까지 저장. 스테이지 정보에 나오는 진상 유형을 보고 속성을 맞추면 유리!</div></div>
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
  boss_soloparty: '마지막 보스. 디스코볼로 전원 홀림 · 꽃가루 눈부심 · 체력 30%면 분노',
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
const GATE_TIPS = ['속성 상성이 맞으면 피해 ×2! 덱 짤 때 ▲▼ 를 보세요', '보스가 큰 기술을 쓴 뒤 금빛 "빈틈"에 스킬을 몰아 써요', '같은 속성 2명 이상이면 자동 시너지', '레벨업 카드는 게임이 멈추지 않아요 — 빨리 골라요!', '멤버 조각을 모아 ★ 승급', '주간 도전은 매주 월요일 새 판', '헬 모드는 ★★★ 스테이지에서 열려요', '처치 10명마다 1:1 대전에서 진상을 보낼 수 있어요'];
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
      ${id === 'hochan' && !sil ? '<i class="cw-halo"></i>' : ''}<img src="/img/lb/dex/${id}.webp" alt="" draggable="false" decoding="async" onerror="this.onerror=null;this.src='${d.img}'">${sil ? '<b>???</b>' : ''}</span>`;
  }).join('');
}
function startGate(quick = false) {
  let ok = false;
  try { ok = sessionStorage.getItem('langbang:gate') === '1'; } catch { ok = false; }
  if (Q.has('autostart') || DEBUG.stage || Q.has('nogate')) return;
  // 이번 세션에 이미 봤으면 건너뛰되, 음악이 정말 나오는지 확인 — 막혔으면 짧은 "터치해서 시작"
  if (ok && !quick) {
    A.unlock(); A.playBgm();
    setTimeout(() => { if (!A.bgmActive() && !A.isMuted() && !app.touched) startGate(true); }, 450);
    return;
  }
  const MIN_MS = quick ? 700 : 3000;
  const box = document.createElement('div');
  box.className = 'gate crowd-gate';
  const owned = crowdOwned();
  const ch = Math.max(1, Math.min(6, Number(localStorage.getItem('langbang:chapter')) || 1));
  box.innerHTML = `<div class="gate-bg"><img src="/img/lb/loading_bg.webp" alt="" onerror="this.onerror=null;this.src='/img/lb/keyart${ch}.webp';this.parentNode.classList.add('fb')"></div>
    <span class="gate-fw">${[[22, 22, 0], [76, 16, 1.1], [55, 30, 2.2], [12, 36, 3]].map(([x, y, d]) => `<i style="left:${x}%;top:${y}%;--d:${d}s"></i>`).join('')}</span>
    <span class="gate-spot l"></span><span class="gate-spot r"></span>
    <span class="gate-carpet"></span>
    <div class="gate-crowd">${crowdHtml(owned)}</div>
    <span class="gate-conf">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${((i * 0.29) % 3).toFixed(2)}s;--t:${(2.6 + (i % 5) * 0.35).toFixed(2)}s;background:${['#ffd23f', '#ff4fd8', '#6fe3ff', '#8dff7a', '#ff7a4f'][i % 5]}"></i>`).join('')}</span>
    <div class="gate-in"><img class="emblem" src="/img/lb/emblem.webp" alt="" onerror="this.remove()"><h1>랑방 대전</h1></div>
    <div class="gate-foot"><div class="gate-bar"><i></i></div><p class="gate-txt">멤버들 모으는 중… 0%</p><p class="gate-tip">💡 ${esc(GATE_TIPS[(Math.random() * GATE_TIPS.length) | 0])}</p><button class="btn primary gate-btn" disabled>👆 터치해서 시작</button></div>`;
  stage.appendChild(box);
  // 그림을 다 풀어 놓은 뒤(최대 0.9초) 입장 연출 시작 — 버벅임 없이
  const imgs = [...box.querySelectorAll('.gate-crowd img')];
  const go = () => box.classList.add('enter');
  Promise.race([Promise.all(imgs.map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()))), new Promise((r) => setTimeout(r, 900))]).then(go);
  const bar = box.querySelector('.gate-bar i'), txt = box.querySelector('.gate-txt'), btn = box.querySelector('.gate-btn');
  const t0 = performance.now();
  let synced = false, tipAt = 0;
  const tick = () => {
    if (!box.isConnected) return;
    const all = Object.values(R.images);
    const done = all.filter((im) => !im.src || im.complete).length;
    const pct = Math.round((done / Math.max(1, all.length)) * 100);
    const el = performance.now() - t0;
    const shown = Math.min(pct, Math.round((el / MIN_MS) * 100)); // 최소 3초는 보여 준다 (다시 볼 땐 짧게)
    bar.style.width = shown + '%';
    // 프로필이 오면 가진 멤버를 컬러로 (없던 멤버는 실루엣 그대로)
    if (!synced && app.profileLoaded) {
      synced = true;
      saveCrowd();
      const now = crowdOwned();
      if ([...now].sort().join() !== [...owned].sort().join()) {
        // 처음 온 기기: 실제로 가진 멤버로 다시 세운다 (이호찬은 가운데 앞)
        box.querySelector('.gate-crowd').innerHTML = crowdHtml(now);
        box.classList.remove('enter'); void box.offsetWidth; box.classList.add('enter');
      }
    }
    if (el - tipAt > 2200) { tipAt = el; const tp = box.querySelector('.gate-tip'); if (tp && el > 100) tp.textContent = '💡 ' + GATE_TIPS[(Math.random() * GATE_TIPS.length) | 0]; }
    if (shown >= 100 || el > 8000) { txt.textContent = '준비 완료! 소리를 켜고 시작해요'; btn.disabled = false; box.classList.add('ready'); if (synced || el > 8000) return; }
    else txt.textContent = `멤버들 모으는 중… ${shown}%`;
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
  const r = await API.loadProfile();
  app.profile = r.profile;
  app.guest = r.guest;
  app.profileLoaded = true;
  saveCrowd();
  // 로그인: 서버에 저장된 덱이 있고 이 기기에 덱이 없으면 서버 덱으로
  try { if (app.profile.decks && !localStorage.getItem(DECK_KEY)) { app.decks = app.profile.decks.decks.map((d) => d.slice()); app.deckI = app.profile.decks.i; } } catch { /* 무시 */ }
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
  reveal: (id, kind) => showReveal(id, kind),
  join: (id, kind) => showJoinReveal(id, kind),
  multi: (n) => multiKillFx(app.g, { n, x: 180, y: 300 }),
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
