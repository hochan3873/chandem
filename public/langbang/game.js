// 랑방 대전 — 메인: 게임 루프(고정 60Hz) · 입력 · HUD · 메뉴/카드/결과 화면
import { HEROES, ENEMIES, RULES, FIELD, STARTER_PARTNERS, HIDDEN_HEROES, BASE_HEROES, RARITY, SCORE } from './data.js';
import * as S from './sim.js';
import { Renderer } from './render.js';
import * as A from './audio.js';
import * as API from './api.js';
import * as SH from './share.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

// ─── 디버그 주소 옵션 ─────────────────────────────────
// ?speed=8 빨리 감기 · ?wave=N 시작 웨이브 · ?god=1 무적 · ?stress=150 적 N마리 유지(성능 측정) · ?autopick=1 카드 자동 선택
const Q = new URLSearchParams(location.search);
const DEBUG = {
  speed: clamp(Number(Q.get('speed')) || 1, 0.25, 16),
  wave: clamp(Number(Q.get('wave')) || 0, 0, 99),
  god: Q.has('god'),
  stress: clamp(Number(Q.get('stress')) || 0, 0, 400),
  autopick: Q.has('autopick'),
  hidden: Q.has('hidden'), // 히든 카드 확률 50% (연출 확인용)
};
const STEP = 1 / 60;

const stage = $('#stage');
const canvas = $('#cv');
const ui = $('#ui');
const hud = $('#hud');
const R = new Renderer(canvas);
const fx = R.fx;

const app = {
  screen: 'menu', // menu | starter | play | result ...
  g: null,
  demo: null,
  paused: false,
  cardsOpen: false,
  cards: null,
  rerolls: 0,
  partner: 'gunman',
  profile: API.guestProfile(),
  guest: true,
  nickname: '',
  profileLoaded: false,
  ending: false,
  posted: null, // 이미 저장한 결과 (무한 모드 이어서 할 때 차이만 보냄)
  logicalH: 720,
  firstRunTip: true,
};

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

// ─── 데모(메뉴 뒤에서 돌아가는 구경용 판) ─────────────
function makeDemo() {
  const g = S.createGame({ H: app.logicalH, god: true, heroes: ['staff', 'bangjang', 'gunman', 'gunnyeo', 'hanna', 'sunggu'], rng: Math.random });
  for (const h of g.heroes) h.lv = 3;
  g.phaseT = 0.5;
  return g;
}

// ─── 게임 시작/끝 ─────────────────────────────────────
function startRun() {
  const meta = app.profile.heroes || {};
  layoutForNewRun();
  const g = S.createGame({
    H: app.logicalH, meta, partner: app.partner, god: DEBUG.god || DEBUG.stress > 0,
    startWave: DEBUG.wave || 0,
  });
  if (DEBUG.wave > 1) {
    // 디버그: 중간 웨이브부터 시작하면 그만큼 강하게
    const n = Math.round((DEBUG.wave - 1) * 1.35);
    for (let i = 0; i < n; i++) { S.applyCard(g, S.rollCards(g)[0]); g.level++; }
    g.need = g.level * 6;
    g.pendingLevels = 0;
    g.events.length = 0;
  }
  app.g = g;
  app.demo = null;
  app.paused = false;
  app.cardsOpen = false;
  app.ending = false;
  app.posted = null;
  app.debugRun = DEBUG.wave > 1 || DEBUG.god || DEBUG.stress > 0 || Q.has('nosave');
  app.hudCache = {};
  fx.reset();
  app.screen = 'play';
  ui.innerHTML = '';
  hud.hidden = false;
  A.playBgm();
  if (app.firstRunTip) {
    showTip('적을 탭하면 집중 공격 · 보석을 탭하면 바로 먹어요', 5000);
    app.firstRunTip = false;
  }
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
  setTimeout(() => showResult(victory), victory ? 2200 : 1700);
}

function quitRun() {
  // 그만두기 = 현재까지 기록으로 패배 처리
  const g = app.g;
  if (!g) return;
  g.over = true;
  g.phase = 'over';
  app.paused = false;
  showResult(false, true);
}

// ─── 이벤트 → 연출/소리 ───────────────────────────────
function handleEvents(g, loud) {
  const ev = g.events;
  const busy = fx.nums.items.length > 45;
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
        fx.part('coin', e.x, e.y - 10, (Math.random() - 0.5) * 60, -140, 0.7, 10, null, { grav: 380 });
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
        fx.ring(e.x, e.y, 4, e.r, 0.3, e.proj === 'warn' ? '#ff8a7a' : e.proj === 'bottle' ? '#ff5a3a' : '#ffd23f', 4);
        if (loud) A.sfx.explode();
        break;
      case 'kick': fx.text(e.x, e.y, '강퇴!', '#ff6b5a', 17, 0.8); if (loud) A.sfx.kick(); break;
      case 'wink':
        if (e.male) {
          if (Math.random() < 0.4) fx.text(e.x, e.y, '♥ 두근!', '#ff7fd8', 14, 0.7);
          for (let k = 0; k < 3; k++) fx.part('heart', e.x, e.y, (Math.random() - 0.5) * 90, -60 - Math.random() * 60, 0.8, 9, null, { drag: 1 });
        } else if (Math.random() < 0.3) fx.text(e.x, e.y, '흥!', '#ffd0f0', 12, 0.6);
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
      case 'baseHit':
        fx.baseHitA = Math.min(1, fx.baseHitA + (e.boss ? 0.8 : 0.35));
        fx.ropeWobble = 1;
        if (e.boss) fx.addShake(6);
        fx.text(e.x, e.y + 20, '-' + e.v, '#ff5a6a', e.boss ? 20 : 13, 0.7, -30);
        hitBaseHud();
        if (loud) A.sfx.baseHit();
        break;
      case 'steal':
        fx.text(e.x, e.y - 30, `먹튀!! -${e.v} 코인`, '#ffcf3f', 19, 1.5, -26);
        fx.burst(e.x, e.y, 8, '#ffcc33', 160, 'coin', 10, 0.8, 300);
        if (loud) A.sfx.steal();
        break;
      case 'recover': if (e.v) fx.text(e.x, e.y - 20, `되찾음! +${e.v}`, '#7dff9a', 16, 1.1); if (loud) A.sfx.coin(); break;
      case 'escape': if (e.v) fx.text(clamp(e.x, 60, 300), 110, `먹튀 성공… -${e.v}`, '#ffb3b3', 13, 1.3, 10); break;
      case 'gem': if (loud) A.sfx.gem(); break;
      case 'levelup':
        fx.flash('#ffd54a', 0.35);
        fx.ring(180, g.rowY, 20, 260, 0.6, '#ffd23f', 6);
        fx.text(180, g.rowY - 70, 'LEVEL UP!', '#ffd23f', 26, 1.2, -20);
        if (loud) A.sfx.levelUp();
        break;
      case 'waveStart': {
        const def = S.enemiesLeft(g);
        if (!e.boss) fx.banner(`WAVE ${e.wave}`, `진상 ${def}명 접근 중!`, '#ffd23f', 1.9, 'wave');
        if (loud) A.sfx.wave();
        break;
      }
      case 'bossIntro': {
        const b = ENEMIES[e.enemy];
        fx.banner(b.title, e.enemy2 ? `최종 웨이브! ${ENEMIES[e.enemy2].name}까지 온다!` : b.subtitle, b.id === 'queen' ? '#b01e8c' : '#9a1a1a', RULES.bossIntroSec, 'boss', 'e_' + e.enemy);
        fx.addShake(8);
        if (loud) A.sfx.boss();
        break;
      }
      case 'bossSpawn':
        fx.ring(e.x, 40, 10, 140, 0.8, '#ff4b4b', 6);
        if (e.enemy === 'boss_thug' && g.wave === 20) fx.banner('폭력배 두목 난입!', '"형님 왔다!!"', '#9a1a1a', 2, 'boss', 'e_boss_thug');
        break;
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
        if (Math.random() < 0.5) fx.bubble(e.x, e.y - 80, '얘들아~ 나와!');
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
        fx.text(180, g.H * 0.36, `WAVE ${e.wave} 클리어!`, '#7dff9a', 24, 1.5, -12);
        fx.text(180, g.H * 0.36 + 28, `+${e.coins} 코인`, '#ffe07a', 15, 1.5, -12);
        if (loud) A.sfx.clear();
        break;
      case 'victory':
        fx.flash('#fff3b0', 0.8);
        for (let k = 0; k < 4; k++) setTimeout(() => {
          fx.burst(60 + Math.random() * 240, g.H * 0.3, 40, null, 380, 'confetti', 8, 2, 240);
          for (const p of fx.parts.items) if (p.type === 'confetti' && !p.color) p.color = CONFETTI[(Math.random() * CONFETTI.length) | 0];
        }, k * 350);
        fx.banner('랑방 수호 성공!!', '20웨이브 전부 막아냈다', '#c77a00', 2.6, 'big');
        if (loud) A.sfx.win();
        if (g === app.g) endRun(true);
        break;
      case 'gameover':
        fx.slowmo = 1.4;
        fx.zoomTarget = 1.12;
        fx.zx = 180; fx.zy = g.ropeY;
        fx.flash('#ff2040', 0.6);
        fx.addShake(16);
        fx.banner('랑방 함락…', '진상들이 들이닥쳤다', '#7a0a1a', 2.2, 'big');
        if (loud) { A.sfx.lose(); A.pauseBgm(); }
        if (g === app.g) endRun(false);
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
        if (e.hidden && g === app.g) {
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
    }
  }
  ev.length = 0;
}
const PROJ_COL = { notice: '#ffd23f', warn: '#ff6b5a', bullet: '#6dffb0', flower: '#ff9fd0', bottle: '#7be38f', wink: '#ff5fcf', cane: '#e0b27a' };
const POOF = ['퍽!', '빡!', '뿅', '컷!', '퇴장~', '아웃!'];
const CONFETTI = ['#ffd23f', '#ff4fd8', '#6ff0ff', '#7dff9a', '#ff8a00', '#ffffff'];

// ─── HUD ─────────────────────────────────────────────
const H$ = {
  wave: $('#h-wave'), left: $('#h-left'), coins: $('#h-coins'), score: $('#h-score'), xp: $('#h-xp'), lv: $('#h-lv'),
  hp: $('#h-hp'), hpLag: $('#h-hp-lag'), hpText: $('#h-hptext'), ult: $('#btn-ult'), boss: $('#bossbar'), bossName: $('#boss-name'), bossFill: $('#boss-fill'),
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
  const bossWave = RULES.bossWaves.includes(w) || (w > 20 && (w - 20) % 5 === 0);
  setText(H$.wave, 'wave', g.endless ? `WAVE ${w} ∞` : `WAVE ${w}/${RULES.waves}`);
  H$.wave.classList.toggle('boss', bossWave && g.phase !== 'break');
  setText(H$.left, 'left', g.phase === 'break' ? (g.wave === 0 ? '준비!' : '잠깐 숨 돌리기') : `남은 진상 ${S.enemiesLeft(g)}`);
  if (setText(H$.coins, 'coins', fmt(g.stats.coins))) { H$.coins.classList.remove('bump'); void H$.coins.offsetWidth; H$.coins.classList.add('bump'); }
  setText(H$.score, 'score', fmt(g.stats.score));
  setText(H$.lv, 'lv', `Lv.${g.level}`);
  const xp = Math.round((g.exp / g.need) * 100);
  if (app.hudCache.xp !== xp) { app.hudCache.xp = xp; H$.xp.style.width = xp + '%'; }
  const hpP = Math.round((g.base.hp / g.base.max) * 1000) / 10;
  if (app.hudCache.hp !== hpP) {
    app.hudCache.hp = hpP;
    H$.hp.style.width = hpP + '%';
    H$.hpLag.style.width = hpP + '%';
    H$.hp.className = hpP < 30 ? 'low' : hpP < 60 ? 'mid' : '';
  }
  setText(H$.hpText, 'hpt', `${Math.ceil(g.base.hp)} / ${g.base.max}`);
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
  if (g && !app.paused && !app.cardsOpen) {
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
  const types = ['yeokko', 'namkko', 'drunk', 'thug', 'mukti'];
  while (alive < DEBUG.stress) {
    const e = S.spawnEnemy(g, types[alive % types.length], undefined, -20 - Math.random() * 200, { hpMul: 40 });
    e.stopY -= Math.random() * 260;
    alive++;
  }
}

// ─── 입력 ────────────────────────────────────────────
canvas.addEventListener('pointerdown', (ev) => {
  A.unlock();
  const g = app.g;
  if (!g || app.paused || app.cardsOpen || g.over) return;
  const r = canvas.getBoundingClientRect();
  const x = ((ev.clientX - r.left) / r.width) * FIELD.W;
  const y = ((ev.clientY - r.top) / r.height) * g.H;
  const n = S.collectAt(g, x, y, 60);
  const f = S.setFocus(g, x, y);
  fx.ring(x, y, 4, 40, 0.3, f ? '#ff3b5c' : '#ffffff', 2);
  if (f) fx.text(f.x, f.y - f.def.size * 0.8, '집중!', '#ff6b80', 12, 0.6);
  if (n || f) A.sfx.tap();
});
document.addEventListener('pointerdown', () => { A.unlock(); if (app.screen === 'play' || app.screen === 'menu') A.playBgm(); }, { passive: true });

$('#btn-pause').addEventListener('click', () => pauseGame());
$('#btn-mute').addEventListener('click', () => { A.setMuted(!A.isMuted()); syncMute(); });
$('#btn-ult').addEventListener('click', () => {
  const g = app.g;
  if (!g || app.paused || app.cardsOpen) return;
  if (!S.useUlt(g)) { toast(`총공지 충전 중… ${Math.floor(g.ult)}%`, 1000); return; }
  handleEvents(g, true);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' || e.key === 'p') { if (app.screen === 'play' && !app.cardsOpen) { if (app.paused) resumeGame(); else pauseGame(); } }
  if (e.key === ' ' && app.g && !app.paused && !app.cardsOpen) { S.useUlt(app.g); handleEvents(app.g, true); }
  if (app.cardsOpen && ['1', '2', '3'].includes(e.key)) pickCard(Number(e.key) - 1);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (app.screen === 'play' && app.g && !app.g.over && !app.cardsOpen && !app.paused && !app.ending) pauseGame();
    A.pauseBgm();
  } else if (app.screen === 'play' || app.screen === 'menu') {
    last = performance.now();
  }
});

// ─── 화면들 ──────────────────────────────────────────
function show(html, cls = '') {
  SH.closeShare();
  ui.innerHTML = `<div class="screen ${cls}">${html}</div>`;
  return ui.firstElementChild;
}
ui.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-act]');
  if (!b || b.disabled) return;
  A.unlock();
  const act = b.dataset.act;
  if (act !== 'pick' && act !== 'partner') A.sfx.tap();
  ACTS[act] && ACTS[act](b);
});
const ACTS = {
  start: () => showStarter(),
  menu: () => showMenu(),
  upgrade: () => showUpgrade(),
  ranking: () => showRanking(),
  howto: () => showHowto(),
  mute: () => { A.setMuted(!A.isMuted()); syncMute(); },
  share: () => SH.shareInvite(),
  shareResult: () => { if (app.shareData) SH.openResultShare(app.shareData, stage); },
  partner: (b) => {
    app.partner = b.dataset.id;
    A.sfx.card();
    for (const el of ui.querySelectorAll('.pick[data-id]')) el.classList.toggle('on', el.dataset.id === app.partner);
  },
  go: () => startRun(),
  pick: (b) => pickCard(Number(b.dataset.i)),
  reroll: () => rerollCards(),
  resume: () => resumeGame(),
  quit: () => quitRun(),
  again: () => showStarter(),
  endless: () => {
    const g = app.g;
    S.continueEndless(g);
    app.ending = false;
    app.screen = 'play';
    ui.innerHTML = '';
    hud.hidden = false;
    fx.banner('무한 모드!', '어디까지 버틸 수 있을까?', '#7a1a9a', 2, 'big');
    A.playBgm();
  },
  buy: (b) => buyUpgrade(b.dataset.id, b),
};

function heroParade() {
  return ['staff', 'bangjang', 'gunman', 'gunnyeo'].map((id) => av(HEROES[id])).join('');
}

function showMenu() {
  app.screen = 'menu';
  app.g = null;
  app.paused = false;
  app.cardsOpen = false;
  hud.hidden = true;
  layout();
  if (!app.demo) app.demo = makeDemo();
  fx.reset();
  const p = app.profile;
  const expPct = p.expToNext ? Math.round((p.exp / p.expToNext) * 100) : 0;
  const prof = app.guest
    ? `<div class="profile"><div class="lv">🙂</div><div class="info"><div class="name">손님</div>
        <div class="meta"><span>최고 웨이브 <b>${p.bestWave || 0}</b></span><span>최고 점수 <b>${fmt(p.bestScore || 0)}</b></span></div></div></div>
       <div class="guest-note">손님은 기록이 저장되지 않아요 · <a href="/">로그인</a>하면 랭킹에 올라가요</div>`
    : `<div class="profile"><div class="lv"><span><small>LV</small>${p.level}</span></div><div class="info">
        <div class="name">${esc(app.nickname || '랑방 멤버')}</div>
        <div class="meta"><span><i class="ci"></i><b>${fmt(p.coins)}</b></span><span>최고 <b>W${p.bestWave}</b></span><span>★ <b>${fmt(p.bestScore)}</b></span></div>
        <div class="pexp"><div style="width:${expPct}%"></div></div></div></div>`;
  show(`
    <div class="topbar"><a class="back" href="/">‹ 게임월드</a><div class="tb-right"><button class="share-btn" data-act="share">📤 공유하기</button><button class="icon-btn" data-act="mute">${A.isMuted() ? '🔇' : '🔊'}</button></div></div>
    <div class="logo"><small>진상 컷! 로그라이크 디펜스</small><h1>랑방 대전</h1><div class="tag">우리들의 아지트 "랑방"을 20웨이브 동안 지켜라!</div></div>
    <div class="hero-parade">${heroParade()}</div>
    <div class="panel">${app.profileLoaded ? prof : '<div class="empty-msg" style="padding:8px"><span class="spin">⏳</span> 불러오는 중…</div>'}</div>
    <div class="spacer"></div>
    <button class="btn primary" data-act="start">▶ 게임 시작</button>
    <div class="gap"></div>
    <div class="grid3">
      <button class="btn" data-act="upgrade"><i>💪</i>캐릭터 강화</button>
      <button class="btn" data-act="ranking"><i>🏆</i>랭킹</button>
      <button class="btn" data-act="howto"><i>📖</i>게임 방법</button>
    </div>
  `, 'menu dim-soft');
}

function showStarter() {
  app.screen = 'starter';
  app.g = null;
  hud.hidden = true;
  if (!app.demo) { layout(); app.demo = makeDemo(); }
  const card = (id, fixed) => {
    const d = HEROES[id];
    const meta = (app.profile.heroes || {})[id] || 0;
    return `<button class="pick ${fixed ? 'fixed on' : ''} ${!fixed && app.partner === id ? 'on' : ''}" ${fixed ? '' : `data-act="partner" data-id="${id}"`}>
      ${av(d)}<div><b>${d.name}${fixed ? '<em>기본 출전</em>' : ''}${meta ? `<em style="background:#6ff0ff">강화 +${meta}</em>` : ''}</b>
      <p>${d.role}<br>${d.desc}</p></div></button>`;
  };
  show(`
    <div class="topbar"><button class="back" data-act="menu">‹ 뒤로</button></div>
    <h2 class="title">오늘 같이 갈 동료는?</h2>
    <p class="sub">방장은 늘 함께! 한 명을 더 골라 출발해요</p>
    <div class="pick-list">${card('bangjang', true)}${STARTER_PARTNERS.map((id) => card(id, false)).join('')}</div>
    <div class="spacer"></div>
    <button class="btn primary" data-act="go">출동! 🚪</button>
  `, 'dim');
}

// ─── 레벨업 카드 ─────────────────────────────────────
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
  return `<button class="card ${c.rarity}" data-act="pick" data-i="${i}">
    <div class="ico">${icon}</div>
    <div class="body"><span class="rar">${r.name}</span><b>${esc(c.title)}</b><p>${esc(c.desc)}</p>${c.sub ? `<span class="role">${esc(c.sub)}</span>` : ''}</div>
    ${stack}</button>`;
}
function renderCards(fresh) {
  const g = app.g;
  const slots = [];
  const bySlot = {};
  for (const h of g.heroes) bySlot[h.slot] = h;
  for (let s = 0; s < 6; s++) {
    const h = bySlot[s];
    slots.push(h ? `<div class="mini">${av(h.def)}<span>${h.lv >= 5 ? 'MAX' : 'Lv' + h.lv}</span></div>` : '<div class="mini empty">+</div>');
  }
  show(`
    <div class="lvup"><h2>LEVEL UP!</h2><p>Lv.${g.level} — 카드 한 장을 골라요${g.pendingLevels > 1 ? ` (남은 선택 ${g.pendingLevels})` : ''}</p></div>
    <div class="card-list">${app.cards.map(cardHtml).join('')}</div>
    <div class="card-foot">
      <button class="btn ghost" data-act="reroll" ${app.rerolls > 0 ? '' : 'disabled'}>🎲 다시 뽑기 (${app.rerolls})</button>
    </div>
    <div class="team">${slots.join('')}</div>
  `, 'cards-screen');
  if (fresh) A.sfx.card();
  if (app.cards.some((c) => c.rarity === 'hidden')) { fx.flash('#ff9ff0', 0.3); }
}
function rerollCards() {
  if (app.rerolls <= 0 || !app.cardsOpen) return;
  app.rerolls--;
  app.cards = rollFor(app.g);
  renderCards(true);
}
function pickCard(i) {
  const g = app.g;
  if (!app.cardsOpen || !app.cards || !app.cards[i]) return;
  const c = app.cards[i];
  S.applyCard(g, c);
  g.pendingLevels = Math.max(0, g.pendingLevels - 1);
  A.sfx.pick();
  handleEvents(g, true);
  if (c.kind === 'global') fx.text(180, g.rowY - 90, c.title + '!', RARITY[c.rarity].color, 18, 1.2, -20);
  if (g.pendingLevels > 0) {
    app.rerolls = 1;
    app.cards = rollFor(g);
    renderCards(true);
  } else {
    app.cardsOpen = false;
    app.cards = null;
    ui.innerHTML = '';
    last = performance.now();
  }
}

// ─── 일시정지 ────────────────────────────────────────
function pauseGame() {
  if (!app.g || app.g.over || app.cardsOpen || app.ending) return;
  app.paused = true;
  show(`
    <div class="topbar"><a class="back" href="/">‹ 게임월드</a><div class="tb-right"><button class="share-btn" data-act="share">📤 공유하기</button><button class="icon-btn" data-act="mute">${A.isMuted() ? '🔇' : '🔊'}</button></div></div>
    <div class="pause-box">
      <h2>일시정지</h2>
      <button class="btn primary" data-act="resume">계속하기</button>
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
  app.screen = 'result';
  hud.hidden = true;
  const sum = S.summary(g, g.t);
  const mins = Math.floor(g.t / 60), secs = Math.floor(g.t % 60);
  const totalDmg = g.heroes.reduce((a, h) => a + h.dmgDone, 0) || 1;
  const heroes = g.heroes.slice().sort((a, b) => b.dmgDone - a.dmgDone);
  const mvp = heroes.map((h, i) => `<div class="row ${i === 0 ? 'top' : ''}">${av(h.def)}<span class="nm">${h.def.name}</span>
    <div class="bar"><div style="width:${Math.round((h.dmgDone / totalDmg) * 100)}%"></div></div><span class="pc">${Math.round((h.dmgDone / totalDmg) * 100)}%</span></div>`).join('');
  const win = victory && !g.endless;
  const title = win ? '랑방 수호 성공!' : g.endless ? `무한 모드 W${g.wave}` : quit ? '오늘은 여기까지' : '랑방 함락…';
  const sub = win ? '진상들은 전부 입구 컷! 오늘도 랑방은 평화롭다' : quit ? '다음엔 끝까지 지켜 봐요' : LOSE_LINES[(Math.random() * LOSE_LINES.length) | 0];
  const el = show(`
    <div class="big">${title}</div>
    <p class="sub" style="margin-top:6px">${sub}</p>
    <div class="score-big"><small>점수</small><b>${fmt(sum.score)}</b></div>
    <div class="stats">
      <div><small>도달 웨이브</small><b>${sum.wave}</b></div>
      <div><small>처치</small><b>${fmt(sum.kills)}</b></div>
      <div><small>보스 처치</small><b>${sum.bossKills}</b></div>
      <div><small>최대 콤보</small><b>${g.stats.maxCombo}</b></div>
      <div><small>플레이 시간</small><b>${mins}:${String(secs).padStart(2, '0')}</b></div>
      <div><small>획득 코인</small><b><i class="ci"></i>${fmt(sum.coins)}</b></div>
    </div>
    <div class="panel mvp">${mvp}</div>
    <div class="server" id="srv">${app.guest ? '' : '<span class="spin">⏳</span> 기록 저장 중…'}</div>
    <div class="spacer"></div>
    <button class="btn share-result" data-act="shareResult">📤 결과 공유하기 <small>친구에게 기록 카드 보내고 도전장 날리기</small></button>
    <div class="gap"></div>
    ${win ? `<button class="btn pink" data-act="endless">∞ 무한 모드 계속 <small>${app.guest || app.debugRun ? '어디까지 버틸 수 있을까?' : '기록은 이미 저장했어요 · 더 버티면 최고 웨이브 갱신'}</small></button><div class="gap"></div>` : ''}
    <button class="btn primary" data-act="again">다시 하기</button>
    <div class="gap"></div>
    <button class="btn ghost" data-act="menu">메뉴로</button>
  `, `result ${win ? 'win' : 'lose'}`);
  void el;
  app.shareData = {
    title, win, score: sum.score, wave: sum.wave, kills: sum.kills, bossKills: sum.bossKills,
    time: `${mins}:${String(secs).padStart(2, '0')}`, nickname: app.guest ? '' : app.nickname,
    heroes: heroes.slice(0, 6).map((h) => ({ img: h.def.img, name: h.def.name, color: h.def.color })),
  };
  saveResult(sum);
}
const LOSE_LINES = ['진상들이 랑방을 점령했다… 다음엔 꼭!', '"한 잔만 더~" 술진상이 문을 열고 들어왔다', '먹튀 인간들이 계산대를 털어 갔다…', '여왕벌: "여기 이제 내 가게야~"'];

async function saveResult(sum) {
  const box = $('#srv');
  if (app.debugRun) {
    if (box) box.innerHTML = '<div class="guest-note">디버그 판(?wave · ?god · ?stress)은 기록을 저장하지 않아요</div>';
    return;
  }
  if (app.guest) {
    API.saveGuestBest(sum.wave, sum.score);
    const p = API.guestProfile();
    app.profile.bestWave = p.bestWave;
    app.profile.bestScore = p.bestScore;
    if (box) box.innerHTML = '<div class="guest-note">손님은 기록이 저장되지 않아요 · <a href="/">로그인</a>하면 랭킹에 올라가요</div>';
    return;
  }
  // 무한 모드로 이어서 한 판이면 처치·코인은 앞서 저장한 뒤의 차이만 보낸다
  const body = Object.assign({}, sum);
  if (app.posted) {
    body.kills = Math.max(0, sum.kills - app.posted.kills);
    body.coins = Math.max(0, sum.coins - app.posted.coins);
    body.bossKills = Math.max(0, sum.bossKills - app.posted.bossKills);
  }
  const r = await API.postResult(body);
  if (!box || !box.isConnected) { if (r.ok && r.profile) app.profile = r.profile; return; }
  if (r.ok) {
    app.posted = { kills: sum.kills, coins: sum.coins, bossKills: sum.bossKills };
    const before = app.profile;
    if (r.profile) app.profile = r.profile;
    const p = app.profile;
    const badges = [];
    if (r.levelUp) badges.push(`<span class="badge pink">계정 레벨 업! Lv.${p.level}</span>`);
    if (r.newBestWave) badges.push('<span class="badge">최고 웨이브 갱신!</span>');
    if (r.newBestScore) badges.push('<span class="badge">최고 점수 갱신!</span>');
    if (r.rank) badges.push(`<span class="badge">랭킹 ${r.rank}위</span>`);
    const gained = Math.max(0, (p.coins || 0) - (before.coins || 0));
    box.innerHTML = `${badges.join('')}<div><i class="ci"></i>+${fmt(gained || body.coins)} 코인 적립 · 보유 ${fmt(p.coins)}</div>
      <div style="color:var(--dim)">계정 Lv.${p.level}${p.expToNext ? ` · 경험치 ${fmt(p.exp)}/${fmt(p.expToNext)}` : ''}</div>`;
  } else {
    box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '알 수 없는 오류')}</div>`;
  }
}

// ─── 캐릭터 강화 ─────────────────────────────────────
function showUpgrade() {
  app.screen = 'upgrade';
  const p = app.profile;
  const ids = [...BASE_HEROES, ...HIDDEN_HEROES];
  const max = p.maxMeta || 10;
  const rows = ids.map((id) => {
    const d = HEROES[id];
    const lv = (p.heroes || {})[id] || 0;
    const cost = API.costOf(p, id);
    const can = !app.guest && cost !== null && p.coins >= cost;
    const pips = Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
    return `<div class="up ${d.hidden ? 'hid' : ''}">${av(d)}<div class="mid"><b>${d.name}${d.hidden ? '<em>HIDDEN</em>' : ''}</b>
      <small>공격력 +${Math.round(lv * RULES.metaDmgPerLevel * 100)}% · 강화 ${lv}/${max}</small><div class="pips">${pips}</div></div>
      <button class="btn ${can ? 'primary' : ''}" data-act="buy" data-id="${id}" ${can ? '' : 'disabled'}>${cost === null ? 'MAX' : `<i class="ci"></i>${fmt(cost)}`}</button></div>`;
  }).join('');
  show(`
    <div class="topbar"><button class="back" data-act="menu">‹ 뒤로</button><span class="coins-pill"><i class="ci"></i>${fmt(p.coins || 0)}</span></div>
    <h2 class="title">캐릭터 강화</h2>
    <p class="sub">코인으로 영구 강화 · 1단계마다 공격력 +${Math.round(RULES.metaDmgPerLevel * 100)}%</p>
    ${app.guest ? '<div class="guest-note" style="margin:0 0 10px">손님은 강화할 수 없어요 · <a href="/">로그인</a>하면 코인이 쌓여요</div>' : ''}
    <div class="up-list">${rows}</div>
  `, 'dim');
}
async function buyUpgrade(id, btn) {
  if (app.guest) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="spin">⏳</span>';
  const r = await API.upgradeHero(id);
  if (r.ok && r.profile) {
    app.profile = r.profile;
    A.sfx.levelUp();
    toast(`${HEROES[id].name} 강화 완료! (+${app.profile.heroes[id]})`);
  } else toast(r.message || '강화하지 못했어요');
  if (app.screen === 'upgrade') showUpgrade();
}

// ─── 랭킹 ────────────────────────────────────────────
async function showRanking() {
  app.screen = 'ranking';
  show(`
    <div class="topbar"><button class="back" data-act="menu">‹ 뒤로</button></div>
    <h2 class="title">🏆 랑방 명예의 전당</h2>
    <p class="sub">최고 웨이브 → 최고 점수 순</p>
    <div class="rank-list" id="rk"><div class="empty-msg"><span class="spin">⏳</span> 불러오는 중…</div></div>
  `, 'dim');
  const list = await API.loadRanking();
  const box = $('#rk');
  if (!box || app.screen !== 'ranking') return;
  if (!list) { box.innerHTML = '<div class="empty-msg">랭킹을 불러오지 못했어요<br>잠시 후 다시 해 주세요</div>'; return; }
  if (!list.length) { box.innerHTML = '<div class="empty-msg">아직 기록이 없어요<br>첫 번째 랑방 수호자가 되어 보세요!</div>'; return; }
  const medal = ['🥇', '🥈', '🥉'];
  box.innerHTML = list.map((r) => `<div class="rank r${r.rank}"><span class="no">${medal[r.rank - 1] || r.rank}</span>
    <span class="nm">${esc(r.nickname)}<small>Lv.${r.level || 1}</small></span>
    <span class="w"><b>W${r.bestWave}</b><small>★ ${fmt(r.bestScore)}</small></span></div>`).join('');
}

// ─── 게임 방법 ───────────────────────────────────────
function showHowto() {
  const back = app.screen === 'play' ? 'resume' : 'menu';
  const fromPlay = app.screen === 'play';
  if (!fromPlay) app.screen = 'howto';
  const enemies = Object.values(ENEMIES).map((e) => `<div>${av(e)}<span><b>${e.name}</b>${e.boss ? ' 👑' : ''}<br>${ENEMY_TIPS[e.id]}</span></div>`).join('');
  show(`
    <div class="topbar"><button class="back" data-act="${back}">‹ ${fromPlay ? '게임으로' : '뒤로'}</button></div>
    <h2 class="title">게임 방법</h2>
    <div class="howto">
      <div class="it"><i>🚪</i><div>진상들이 골목 위에서 몰려와요. 우리 멤버들이 <b>자동으로 공격</b>해요. 벨벳 로프까지 온 진상은 <b>랑방 입구</b>를 두드려요. 내구도가 0이 되면 끝!</div></div>
      <div class="it"><i>👆</i><div>진상을 <b>탭하면 집중 공격</b>, 경험치 보석을 탭하면 바로 먹어요. 게이지가 차면 <b>📣 총공지</b>로 화면 전체 공격!</div></div>
      <div class="it"><i>🃏</i><div>레벨이 오르면 카드 3장 중 1장! 새 멤버 합류 · 멤버 레벨업(3·5레벨에 특수 능력) · 전체 강화. <b>다시 뽑기</b>는 레벨업마다 1번.</div></div>
      <div class="it"><i>✨</i><div>웨이브 4부터 아주 가끔 <b>HIDDEN</b> 카드가 떠요. 최은옥 · 이한나 · 강성구는 이렇게만 만날 수 있어요!</div></div>
      <div class="it"><i>👑</i><div>5·10·15·20 웨이브는 <b>보스</b>. 20웨이브를 버티면 승리! 그 뒤는 무한 모드.</div></div>
      <div class="it"><i>💰</i><div>점수 = 처치 ${SCORE.kill}점(+콤보 보너스) · 웨이브 클리어 웨이브×${SCORE.wavePer} · 보스 ${fmt(SCORE.boss)} · 승리 ${fmt(SCORE.victory)} + 남은 내구도. 코인은 로그인하면 쌓여서 <b>캐릭터 강화</b>에 써요.</div></div>
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
  mukti: '엄청 빠름. 코인을 훔쳐 도망! 잡으면 되찾는다',
  queen: '졸개 소환 + 주변에 보호막',
  boss_thug: '땅 내려치기로 멤버 전원 기절',
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
  if (r.error) toast(r.error);
  if (app.screen === 'menu') showMenu();
  if (Q.has('autostart')) { app.partner = Q.get('partner') || 'gunman'; startRun(); }
}

// 테스트/디버그용 핸들
window.__lb = {
  get g() { return app.g; },
  get app() { return app; },
  perf,
  S,
  fx,
  pickCard,
  startRun: (partner) => { if (partner) app.partner = partner; startRun(); },
};
boot();
