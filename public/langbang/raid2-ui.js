// 랑방 대전 — 건물주 레이드 화면: 로비(의자에 앉은 거대 보스 · 서버 체력 · 페이즈 · 패턴 안내 · 주간 시계 · 부르기 · 기여 순위 · 세트)
//  · 전투(옥상 위 거대 건물주 혼자 — 자세 그림을 바꿔 끼우고 늘이기 · 찌그러뜨리기 · 흔들기 · 예고 구역 · 날아오는 고지서 · 돈다발) · 전투 HUD(서버 체력 · 지금 때리는 사람 · 소식) · 결과
//  game.js 는 initRaid2(도우미) 로 부르고 돌려받은 함수들을 몇 군데에만 끼운다 (게임 코드는 최소한만 건드리게)
import { HEROES, ATTRS, GEAR_RARITY, STAT_HELP } from './data.js';
import * as R2 from './raid2.js';
import * as RS from './raid2-sim.js';

let C = null;
const st = { board: null, boardAt: 0, run: null, live: null, pollT: 0, feedT: 0, fx: [], art: {}, artTried: false, hud: null, hudT: 0, hit: 0, diff: 'normal' };
// 고른 난이도 (이 기기에서만 기억 · 서버가 열렸는지 다시 확인한다)
try { st.diff = R2.diffOf(localStorage.getItem('lb:r2diff')); } catch { st.diff = 'normal'; }
const saveDiff = (id) => { st.diff = R2.diffOf(id); try { localStorage.setItem('lb:r2diff', st.diff); } catch { /* 저장 안 돼도 괜찮음 */ } };
const D = (id) => R2.DIFF[R2.diffOf(id)];
const mulTxt = (m) => `×${Number(m).toFixed(1).replace(/\.0$/, '')}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const P = () => C.P();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const big = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(n >= 1e9 ? 0 : 1)}억` : n >= 1e4 ? `${fmt(Math.round(n / 1e4))}만` : fmt(n));

export function initRaid2(ctx) {
  C = ctx;
  C.R.r2Draw = (g, t, layer) => draw(g, t, layer);
  return { show, acts: ACTS, sec: R2.R2.sec, waveDef: (o) => RS.waveDef((o && o.tier) || 1), attach, onEvent, hudTick, resultTop, stats, save, modeCard, hot, dot, leave, R2 };
}

// ─── 그림 (없으면 가장 가까운 진짜 그림으로) ───
// 서버 /api/langbang/anim 의 files 에 있는 그림만 진짜 주소로 (없는 파일을 요청해 404 를 쏟지 않게)
let have = null;
const listReady = () => have ? Promise.resolve(have) : fetch('/api/langbang/anim').then((x) => x.json()).then((m) => { have = new Set((m && m.files) || []); return have; }).catch(() => { have = new Set(); return have; });
const hasFile = (src) => !!(have && have.has(src));
const src = (real, fb) => (hasFile(real) ? real : fb);
const POSES = ['idle', 'wind', 'slam', 'throw', 'rage'];
const poseSrc = (k) => src(R2.R2_ART[k], k === 'rage' ? src(R2.R2_ART.idle, R2.R2_ART.rageFb) : src(R2.R2_ART.idle, R2.R2_ART.bodyFb));
const lobbySrc = (rage) => (rage ? poseSrc('rage') : src(R2.R2_ART.throne, poseSrc('idle')));

async function loadArt() {
  if (st.artTried) return;
  st.artTried = true;
  await listReady();
  const one = (key, url) => { const im = new Image(); im.decoding = 'async'; const o = st.art[key] = { img: im, ok: false }; im.onload = () => { o.ok = true; }; im.src = url; };
  for (const k of POSES) one(k, poseSrc(k));
  // 전투 맵 (없으면 예전 레이드 맵)
  const R = C.R;
  if (!R.images.map_raid2) {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => R.bakeBg();
    im.src = src(R2.R2_ART.map, R2.R2_ART.mapFb);
    R.images.map_raid2 = im;
  }
}
const artOk = (k) => st.art[k] && st.art[k].ok && st.art[k].img.naturalWidth > 0;

// ─── 전투 그리기 (render.js draw 안에서: back = 진상 뒤 · top = 입자 위) ───
// 자세 그림은 768×768 · 발이 맨 아래 가운데 · 몸 크기는 그림마다 맞춰 둠 → 캔버스에서 BOSS_H 크기로 (화면 높이에 맞춤)
function poseOf(r) {
  const a = r.act;
  if (a) {
    if (a.st === 'wind' && a.k !== 'grab') return 'wind';
    if (a.st === 'down' || a.st === 'gap' || a.st === 'hold' || (a.k === 'grab' && a.st === 'wind')) return 'slam';
    if (a.st === 'throw') return 'throw';
  }
  return r.phase >= 3 || r.angry >= 4 ? 'rage' : 'idle';
}
function draw(g, t, layer) {
  const r = g.r2;
  if (!r) return;
  const e = r.parts.body;
  const cx = C.R.cx;
  if (layer === 'back') {
    // 예고 구역 (먼저 — 보스 뒤 바닥에)
    const a = r.act;
    const blink = 0.5 + 0.5 * Math.sin(t * 18);
    if (a && a.st === 'wind' && (a.k === 'slam' || a.k === 'combo')) {
      const z = RS.PAT.slam.zone, k = 1 - a.t / (a.t0 || RS.PAT.slam.wind);
      zone(cx, a.x - z, g.ropeY - 40, z * 2, g.rowY - g.ropeY + 90, 0.16 + 0.2 * blink + 0.3 * clamp(k, 0, 1));
    } else if (a && a.st === 'wind' && a.k === 'sweep') {
      const x0 = a.side < 0 ? 0 : g.W / 2;
      zone(cx, x0, g.rowY - 70, g.W / 2, 130, 0.14 + 0.18 * blink);
    } else if (a && a.st === 'wind' && a.k === 'evict') {
      zone(cx, 6, g.ropeY - 40, g.W - 12, g.rowY - g.ropeY + 90, 0.12 + 0.16 * blink + 0.25 * clamp(1 - a.t / (a.t0 || 1), 0, 1), '#b04dff');
    } else if (a && a.k === 'grab') {
      zone(cx, 20, g.ropeY - 26, g.W - 40, 40, a.st === 'hold' ? 0.3 + 0.2 * blink : 0.18 + 0.2 * blink);
    }
    // 돈다발 · 고지서 떨어질 자리
    for (const m of r.marks) {
      const k = 1 - m.t / m.t0;
      cx.save();
      cx.globalAlpha = 0.35 + 0.35 * blink;
      cx.strokeStyle = m.k === 'cash' ? '#7dff9a' : '#ffcf3f'; cx.lineWidth = 2.5; cx.setLineDash([5, 4]);
      const rad = m.k === 'cash' ? RS.PAT.cash.r : 18;
      cx.beginPath(); cx.ellipse(m.x, m.y + (m.k === 'cash' ? 14 : 0), rad, rad * 0.45, 0, 0, Math.PI * 2); cx.stroke();
      cx.globalAlpha = 0.25 + 0.3 * k; cx.fillStyle = m.k === 'cash' ? '#2fbf5a' : '#ff9a2a';
      cx.beginPath(); cx.ellipse(m.x, m.y + (m.k === 'cash' ? 14 : 0), rad * k, rad * 0.45 * k, 0, 0, Math.PI * 2); cx.fill();
      cx.restore();
    }
    if (!e) return;
    // 거대 보스: 자세 그림 하나 (늘이기 · 찌그러뜨리기 · 기울이기 · 분노 떨림)
    const pose = poseOf(r);
    const key = artOk(pose) ? pose : artOk('idle') ? 'idle' : null;
    const feet = e.y + 100;
    const BOSS_H = clamp(feet - e.lift - 112, 220, 320); // 위 HUD 아래로 머리가 들어오게 (화면 높이에 맞춰)
    const breath = Math.sin(t * 1.6);
    let sx = 1 + breath * 0.012, sy = 1 - breath * 0.012;
    if (pose === 'wind') { sx = 0.96; sy = 1.05 + Math.sin(t * 40) * 0.004; }
    if (a && a.st === 'down') { sx = 1.1; sy = 0.9; }
    if (a && a.k === 'grab' && a.st === 'hold') { const w = Math.sin(t * 22); sx = 1.04 + w * 0.02; sy = 0.97 - w * 0.02; }
    const shake = pose === 'rage' || (a && a.st === 'wind') ? Math.sin(t * 47) * 1.6 : 0;
    const lean = (e.lean || 0) * 0.0035;
    if (key) {
      const im = st.art[key].img;
      cx.save();
      cx.translate(e.x + shake, feet);
      cx.rotate(lean);
      cx.scale(sx, sy);
      if (e.weakT > 0) { cx.shadowColor = '#ffd23f'; cx.shadowBlur = 26; }
      else if (pose === 'rage') { cx.shadowColor = 'rgba(255,40,30,0.85)'; cx.shadowBlur = 24; }
      if (st.hit > 0) cx.filter = 'brightness(1.6)';
      const ph = key === 'wind' ? BOSS_H * 0.84 : BOSS_H; // 팔을 든 자세는 작게 (머리 위 주먹이 위 HUD 체력 줄에 안 겹치게)
      cx.drawImage(im, -ph / 2, -ph, ph, ph);
      cx.restore();
    }
    // 빈틈 표시
    if (e.weakT > 0) {
      cx.save(); cx.globalAlpha = 0.85 + 0.15 * blink; cx.fillStyle = '#ffd23f'; cx.font = '900 13px sans-serif'; cx.textAlign = 'center';
      cx.strokeStyle = '#2a1200'; cx.lineWidth = 3; cx.strokeText('빈틈! 피해 ×1.5', e.x, feet - BOSS_H * 0.62); cx.fillText('빈틈! 피해 ×1.5', e.x, feet - BOSS_H * 0.62); cx.restore();
    }
    // 끊기 게이지: 예고 중 (내려찍기 · 휩쓸기 · 연타 · 퇴거) / 붙잡는 중 — 스킬을 몇 번 더 맞혀야 하는지
    if (a && ((a.st === 'wind' && a.k !== 'grab') || (a.k === 'grab' && a.st === 'hold'))) pips(cx, a, g, t);
  } else if (layer === 'top') {
    // 날아가는 고지서 · 돈다발 (보스 손 → 떨어질 자리)
    if (e) {
      for (const m of r.marks) {
        const k = clamp(1 - m.t / m.t0, 0, 1);
        const x0 = e.x + (m.k === 'cash' ? 60 : -60), y0 = e.y - 40; // 고지서는 던지는 손(왼쪽) · 돈다발은 오른손
        const x = x0 + (m.x - x0) * k, y = y0 + (m.y - y0) * k - Math.sin(k * Math.PI) * 90;
        cx.save(); cx.translate(x, y); cx.rotate(m.k === 'cash' ? Math.sin(k * 12) * 0.5 : k * 9 + m.x);
        cx.strokeStyle = '#2a1a14'; cx.lineWidth = 1.5;
        if (m.k === 'cash') { // 돈다발: 초록 지폐 뭉치 + 띠
          cx.fillStyle = '#3f9a52'; cx.fillRect(-15, -9, 30, 18); cx.strokeRect(-15, -9, 30, 18);
          cx.fillStyle = '#7fd08a'; cx.fillRect(-13, -7, 26, 5);
          cx.fillStyle = '#f2e3b0'; cx.fillRect(-4, -9, 8, 18); cx.strokeRect(-4, -9, 8, 18);
        } else { // 고지서: 흰 종이 + 빨간 도장 줄
          cx.fillStyle = '#fbf6e8'; cx.fillRect(-9, -12, 18, 24); cx.strokeRect(-9, -12, 18, 24);
          cx.fillStyle = '#9a8f80'; for (let l = 0; l < 4; l++) cx.fillRect(-6, -8 + l * 4, 12, 1.5);
          cx.fillStyle = '#e0302a'; cx.fillRect(1, 6, 6, 4);
        }
        cx.restore();
      }
    }
    // 끊기 · 붙잡기 떼기 때 튀는 별 (짧게)
    const now = performance.now() / 1000;
    st.fx = st.fx.filter((f) => now - f.t0 < 1);
  }
}
function zone(cx, x, y, w, h, alpha, col = '#ff2a1a') {
  cx.save();
  cx.globalAlpha = alpha; cx.fillStyle = col; cx.fillRect(x, y, w, h);
  cx.globalAlpha = 0.9; cx.strokeStyle = '#ffd23f'; cx.lineWidth = 2; cx.setLineDash([6, 5]); cx.strokeRect(x, y, w, h);
  cx.restore();
}
// 끊기 게이지 (빨간 구역 위): 맞힌 수 / 남은 수
function pips(cx, a, g, t) {
  const fx = g.r2.fx, need = a.k === 'grab' ? fx.grab : fx.cut, n = Math.min(need, a.hits | 0);
  const x0 = clamp(a.x || g.W / 2, 70, g.W - 70), y = g.ropeY - 104, gap = 17;
  cx.save();
  cx.font = '900 11px sans-serif'; cx.textAlign = 'center'; cx.lineWidth = 3; cx.strokeStyle = '#1a0606';
  const label = a.k === 'grab' ? '스킬로 떼어내기' : '스킬로 끊기';
  cx.strokeText(label, x0, y - 13); cx.fillStyle = '#fff2c0'; cx.fillText(label, x0, y - 13);
  for (let i = 0; i < need; i++) {
    const x = x0 + (i - (need - 1) / 2) * gap, on = i < n;
    cx.beginPath(); cx.arc(x, y, on ? 6.5 : 5.5, 0, Math.PI * 2);
    cx.fillStyle = on ? '#ffd23f' : 'rgba(30,8,10,0.75)'; cx.fill();
    cx.lineWidth = 2; cx.strokeStyle = on ? '#fff' : `rgba(255,210,63,${0.6 + 0.4 * Math.sin(t * 10)})`; cx.stroke();
  }
  cx.restore();
}
st.dmgAtPoll = 0;

// ─── 판에 붙이기 (game.js startRun · createGame 바로 뒤) ───
function attach(g, o) {
  loadArt();
  st.run = o; st.live = { hp: { ...o.hp }, max: { ...o.max }, hitting: 0, feed: [] };
  st.dmgAtPoll = 0; st.feedT = Date.now(); st.fx = []; st.pollT = 0; st.hit = 0;
  RS.attach(g, { tier: o.tier, diff: o.diff, rally: !!o.rally, hp: o.hp, max: o.max });
  mountHud(g);
  if (o.rally) setTimeout(() => C.toast(`${o.rally.n}님의 부름에 응답! 피해 +${Math.round(R2.R2.rallyBuff * 100)}% · 둘 다 협동 기여`, 3000), 800);
  return g.r2;
}
function leave() { if (st.hud) { st.hud.remove(); st.hud = null; } const ck = document.getElementById('h-hp-crack'); if (ck) ck.remove(); st.run = null; }

// ─── 전투 HUD: 서버 체력 · 페이즈 · 지금 때리는 사람 · 소식 ───
function mountHud(g) {
  if (st.hud) st.hud.remove();
  const d = document.createElement('div');
  d.className = 'r2-hud';
  d.innerHTML = `<div class="r2h-top"><b class="r2h-name">${esc(R2.BOSS.name)} <i class="r2h-df" style="--c:${D(g.r2.diff).color}">${esc(D(g.r2.diff).name)}</i> <em>${st.run.tier}단계 · <span class="r2h-ph">${g.r2.phase}페이즈</span></em></b><span class="r2h-live"></span></div><div class="r2h-bar"><b></b><i></i><s style="left:${(R2.R2.phaseAt[1] * 100).toFixed(1)}%"></s><s style="left:${(R2.R2.phaseAt[0] * 100).toFixed(1)}%"></s></div><div class="r2h-feed"></div>`;
  C.stage.appendChild(d);
  st.hud = d;
}
function hudTick(g) {
  if (!g.r2 || !st.hud) return;
  if (st.hit > 0) st.hit -= 1 / 60;
  const now = performance.now();
  if (now - st.hudT > 250) {
    st.hudT = now;
    const L0 = st.live, max = (st.run && st.run.max && st.run.max.body) || 1;
    const mul = R2.diffMul(g.r2.diff), mine = (g.r2.dmg.body || 0) * mul; // 서버에 들어갈 양 (난이도 배율)
    const left = Math.max(0, (L0.hp.body || 0) - (mine - st.dmgAtPoll));
    st.hud.querySelector('.r2h-bar b').style.width = `${clamp((left / max) * 100, 0, 100).toFixed(2)}%`;
    const cap = Math.round(max * R2.R2.runCapPct * mul);
    st.hud.querySelector('.r2h-bar i').style.width = `${clamp((Math.min(mine, cap) / max) * 100, 0, 100).toFixed(2)}%`;
    st.hud.querySelector('.r2h-live').textContent = `지금 ${Math.max(1, L0.hitting | 0)}명이 때리는 중 · 내 기여 ${big(mine)}${mul > 1 ? ` (${mulTxt(mul)})` : ''}${mine >= cap ? ' · 한 판 최대' : ''}`;
    st.hud.querySelector('.r2h-ph').textContent = `${g.r2.phase}페이즈${g.r2.angry ? ` · 화 ${g.r2.angry}` : ''}`;
    crackBar(g);
  }
  // 15초마다 서버 상태 (다른 사람이 넘긴 페이즈 · 소식)
  if (!g.over && now - st.pollT > 15000) { st.pollT = now; poll(g); }
}
async function poll(g) {
  const b = await C.API.r2Board(true).catch(() => null);
  if (!b || C.app.g !== g || !g.r2) return;
  st.dmgAtPoll = (g.r2.dmg.body || 0) * R2.diffMul(g.r2.diff);
  st.live = { hp: b.hp, max: b.max, hitting: b.hitting, feed: b.feed };
  if (b.phase <= 3) RS.setPhase(g, b.phase);
  if (b.killed && g.raid) g.raid.sec = Math.min(g.raid.sec, g.t + 4); // 다른 사람이 잡았다 → 이 판도 곧 끝
  for (const f of (b.feed || []).slice().reverse()) {
    if (f.t <= st.feedT) continue;
    st.feedT = f.t;
    feedLine(feedText(f), f.k);
    if (f.k === 'kill') C.fx.banner('건물주 대마왕 쓰러짐!', `${f.n}님이 마지막 일격!`, '#7a1020', 3, 'boss');
  }
}
// 입구 체력 줄 오른쪽에 "금" (수리로 못 메우는 만큼) — 입구 체력 줄(#h-hp) 옆에 붙인다
function crackBar(g) {
  const hp = document.getElementById('h-hp');
  if (!hp || !hp.parentNode) return;
  let el = document.getElementById('h-hp-crack');
  if (!el) { el = document.createElement('div'); el.id = 'h-hp-crack'; el.className = 'r2-crack'; hp.parentNode.appendChild(el); }
  const p = clamp((g.r2.crack || 0) / (g.base.max || 1), 0, 1) * 100;
  el.style.width = `${p.toFixed(1)}%`;
  if (p > 0 && !st.crackTip) { st.crackTip = true; C.showTip('입구에 금이 갔어요! 검은 칸만큼은 수리로 못 메워요', 3600); }
}
const feedText = (f) => (f.k === 'kill' ? `${f.n}님이 건물주 대마왕을 쓰러뜨렸다!`
  : f.k === 'phase' ? `${f.n}님이 건물주를 ${f.p === 'p3' ? '분노(3페이즈)' : '짜증(2페이즈)'}로 몰아넣었다!`
    : f.k === 'break' ? `${f.n}님이 건물주에게 큰 타격!` // (예전 기록: 팔 부숨)
      : `${f.n}님 큰 한 방 ${big(f.d || 0)}${f.df && f.df !== 'normal' ? ` (${D(f.df).name})` : ''}`);
function feedLine(text, k) {
  if (!st.hud) return;
  const box = st.hud.querySelector('.r2h-feed');
  const el = document.createElement('div');
  el.className = 'r2h-line ' + (k || '');
  el.textContent = text;
  box.prepend(el);
  while (box.children.length > 2) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 5200);
  setTimeout(() => el.remove(), 5800);
}

// ─── 전투 이벤트 → 연출 ───
const PATN = Object.fromEntries(R2.PATTERNS.map((p) => [p.id, p.name]));
function onEvent(g, e, loud) {
  const fx = C.fx, A = C.A;
  switch (e.type) {
    case 'r2Start':
      fx.banner(`${R2.BOSS.name} · ${D(e.diff).name}`, `${R2.BOSS.sub} · 입구가 부서질 때까지!`, '#7a1020', 2.8, 'boss');
      fx.addShake(10);
      if (loud) A.sfx.rumble();
      break;
    case 'r2Wind': {
      const col = e.k === 'grab' ? '#ff9a3a' : '#ff5a3a';
      fx.text(e.x, g.ropeY - 70, e.chain ? '한 번 더!' : `${e.name}!`, col, e.chain ? 16 : 18, 1.3);
      if (loud) { if (!e.chain) A.sfx.heartbeat(); else A.sfx.warn(); }
      if (!st.windTip && e.k !== 'grab') { st.windTip = true; C.showTip(`빨간 구역 = 대마왕 공격 예고! 예고 중에 스킬을 ${g.r2.fx.cut}번 맞히거나 기절 · 총공지로 끊어요`, 4200); }
      if (e.k === 'grab' && !st.grabTip) { st.grabTip = true; C.showTip(`입구를 붙잡으면 계속 피해! 스킬 ${g.r2.fx.grab}번 · 기절 · 총공지면 손을 놓아요`, 4200); }
      if (e.k === 'evict' && !st.evictTip) { st.evictTip = true; C.showTip('퇴거 명령! 못 끊으면 멤버 모두 스킬이 봉인돼요 — 지금 스킬을 몰아 쓰세요', 4200); }
      break;
    }
    case 'r2Slam':
      fx.addShake(e.k === 'combo' ? 12 : 18); fx.flash('#ff3020', 0.26);
      fx.blast(e.x, e.y, 84, 'fire', 0.5);
      fx.ring(e.x, e.y, 12, 130, 0.55, '#ff7a3a', 6);
      fx.burst(e.x, e.y, 26, '#c9a27a', 240, 'dot', 4, 0.8, 360);
      for (const h of e.hits || []) fx.text(h.x, h.y - 70, '기절', '#ffd23f', 13, 1);
      if (loud) A.sfx.slam();
      break;
    case 'r2Stagger':
      fx.text(e.x, g.ropeY - 128, `${e.n} / ${e.need}`, '#ffe27a', 15, 0.7);
      if (loud) A.sfx.hit();
      break;
    case 'r2Evict':
      fx.addShake(14); fx.flash('#a040ff', 0.3);
      fx.text(g.W / 2, g.ropeY - 60, '퇴거 명령! 스킬 봉인', '#d9a0ff', 18, 1.6);
      for (const h of e.hits || []) fx.text(h.x, h.y - 70, '봉인!', '#c77dff', 13, 1.2);
      if (loud) { if (A.sfx.mzSlam) A.sfx.mzSlam(); else A.sfx.slam(); }
      break;
    case 'r2Sweep':
      fx.addShake(10);
      fx.burst(e.x, e.y, 30, '#ffb07a', 300, 'dot', 4, 0.6, 180);
      fx.text(e.x, e.y - 90, '휩쓸기!', '#ff9a5a', 16, 1.1);
      for (const h of e.hits || []) fx.text(h.x, h.y - 70, '기절', '#ffd23f', 13, 1);
      if (loud) A.sfx.whoosh();
      break;
    case 'r2Cut':
      fx.text(e.x, e.y - 60, `${e.text} 빈틈!`, '#ffd23f', 19, 1.6);
      fx.ring(e.x, e.y, 10, 90, 0.5, '#ffd23f', 4);
      fx.burst(e.x, e.y, 18, '#ffe27a', 200, 'star', 5, 0.6);
      st.hit = 0.15;
      if (loud) A.sfx.reveal ? A.sfx.reveal() : A.sfx.pick();
      break;
    case 'r2Release':
      fx.text(e.x, e.y - 60, e.text, '#7dffb0', 18, 1.5);
      fx.ring(e.x, g.ropeY, 10, 120, 0.5, '#7dffb0', 4);
      if (loud) A.sfx.pick();
      break;
    case 'r2Grab':
      fx.addShake(14); fx.flash('#ff7a3a', 0.2);
      fx.text(g.W / 2, g.ropeY - 40, '입구를 붙잡았다!', '#ff9a3a', 17, 1.6);
      if (loud) A.sfx.rumble();
      break;
    case 'r2Gap': fx.ring(e.x, e.y, 20, 70, 0.4, '#ffd23f', 3); break;
    case 'r2Bill': fx.addShake(5); fx.burst(e.x, e.y, 10, '#fff3c0', 150, 'dot', 3, 0.5); if (loud) A.sfx.hit(); break;
    case 'r2Cash':
      fx.blast(e.x, e.y, 46, 'gold', 0.4); fx.burst(e.x, e.y, 20, '#7dff9a', 200, 'dot', 4, 0.6);
      for (const h of e.hits || []) fx.text(h.x, h.y - 70, '기절', '#ffd23f', 13, 1);
      if (loud) { A.sfx.explode(); A.sfx.coin(); }
      break;
    case 'r2Pat': patFx(g, e, loud); break;
    case 'r2Angry':
      fx.banner('건물주가 더 화났다!', `화 ${e.n} · 공격이 더 세고 빨라져요`, '#9a1a1a', 1.8, 'wave');
      fx.addShake(8);
      if (loud) A.sfx.rage();
      break;
    case 'r2Final':
      fx.banner('철거 개시!', '건물주가 입구를 통째로 뜯어냈다', '#5a0a10', 2.6, 'boss');
      fx.addShake(26); fx.flash('#ff2010', 0.5);
      if (loud) A.sfx.slam();
      break;
    case 'r2Phase':
      fx.banner(e.phase >= 3 ? '건물주 분노! 3페이즈' : '건물주 짜증! 2페이즈', R2.PHASES[e.phase - 1].text, '#7a1020', 2.4, 'boss');
      if (loud) A.sfx.rage();
      break;
  }
}
function patFx(g, e, loud) {
  const fx = C.fx, A = C.A;
  fx.text(e.x, e.y - 150, `${PATN[e.k] || ''}!`, '#ffcf3f', 15, 1.2);
  if (e.k === 'seal') { for (const h of e.hits || []) { fx.text(h.x, h.y - 70, '봉인!', '#c77dff', 14, 1.3); fx.ring(h.x, h.y - 20, 6, 34, 0.5, '#c77dff', 3); } if (loud) A.sfx.mzSlam ? A.sfx.mzSlam() : A.sfx.hit(); }
  else if (e.k === 'bills') { if (loud) A.sfx.whoosh(); }
  else if (e.k === 'cash') { if (loud) A.sfx.coin(); }
}

// ─── 결과 ───
function resultTop(g) {
  const rep = RS.report(g) || { total: 0 };
  const sec = Math.round(Math.min(g.t, R2.R2.sec));
  const df = D(g.r2 && g.r2.diff), mul = df.mul;
  return { title: g.r2 && g.r2.finale ? '철거당했다!' : '입구가 무너졌다!', sub: `${df.name} · ${sec}초 버팀 · 끊은 공격 ${rep.cuts | 0}번`, top: `<div class="score-big"><small>건물주 기여${mul > 1 ? ` (${df.name} ${mulTxt(mul)})` : ''}</small><b>${fmt(rep.total * mul)}</b></div>` };
}
// 결과 숫자 칸 (진상 처치 · 웨이브 대신 레이드 숫자)
function stats(g, time) {
  const r = g.r2 || {}, rep = RS.report(g) || {};
  return `<div class="stats">
      <div><small>버틴 시간</small><b>${time}</b></div>
      <div><small>끊은 공격</small><b>${rep.cuts | 0}</b></div>
      <div><small>맞은 내려찍기</small><b>${rep.slams | 0}</b></div>
      <div><small>난이도</small><b>${esc(D(r.diff).name)}</b></div>
      <div><small>입구 금</small><b>${Math.round((rep.crack || 0) * 100)}%</b></div>
      <div><small>팀 레벨</small><b>${g.level | 0}</b></div>
    </div>`;
}
async function save(sum, g, box) {
  leave();
  const rep = RS.report(g) || { parts: {} };
  const runId = (g.r2 && st.lastRunId) || (C.app.r2Run || '');
  const r = await C.API.r2Finish({ runId, parts: rep.parts, durationSec: sum.durationSec, kills: sum.kills, skills: sum.skills, seen: sum.seen, heroesUsed: sum.heroesUsed });
  C.app.r2Run = null;
  if (r.ok && r.profile) C.app.profile = r.profile;
  if (!box || !box.isConnected) return;
  if (!r.ok) { box.innerHTML = `<div class="err">기록을 저장하지 못했어요: ${esc(r.message || '')}</div>`; return; }
  const x = r.raid2 || {}, m = r.mine || {};
  st.board = null;
  box.innerHTML = `<div class="rewards r2-res">
      <div class="rw hl"><span>${C.ic('dragon', '', 'sm')}이번 판 피해</span><b>${fmt(x.dmg || 0)}</b></div>
      ${(x.mul || 1) > 1 ? `<div class="rw"><span>난이도 배율 (${esc(D(x.diff).name)})</span><b>${mulTxt(x.mul)}</b></div>` : ''}
      <div class="rw"><span>서버 체력 · 기여에 들어간 양</span><b>${fmt(x.counted || 0)}${x.clipped ? ' <small>(한 판 최대)</small>' : ''}</b></div>
      ${x.coop ? `<div class="rw"><span>협동 기여 (${esc(x.rally)}님 부름)</span><b>+${fmt(x.coop)}</b></div>` : ''}
      <div class="rw"><span>이번 주 내 기여</span><b>${fmt((m.dmg || 0) + (m.coop || 0))}${m.rank ? ` · ${m.rank}위` : ''}</b></div>
      <div class="rw total"><span><i class="ci"></i>${esc(D(x.diff).name)} 판 보상</span><b>+${fmt((x.rw || R2.DIFF.normal.rw).coins)} · ${C.ic('gem', '', 'sm')}${(x.rw || R2.DIFF.normal.rw).stones}</b></div>
    </div>
    ${(x.broke || []).map((p) => `<div class="r2-broke">${bossImg(p === 'body' ? 'rage' : p === 'p3' ? 'rage' : 'wind')}<b>${p === 'body' ? '건물주 대마왕 막타!' : `${esc(R2.partName(p))} 막타!`}</b><small>${p === 'body' ? '칭호 "막타왕" · 전설 장비 · 모집권 5 (우편)' : '코인 · 강화석 · 모집권 (우편)'}</small></div>`).join('')}
    ${x.killed ? '<div class="r2-killed">건물주 대마왕을 쓰러뜨렸다! 참가자 모두 토벌 보상</div>' : ''}
    ${x.help && HEROES[x.help.hero] ? `<div class="fr-helped">${C.av(HEROES[x.help.hero])}<span><b>${esc(x.help.nick)}님의 멤버가 도와줬어요</b><small>${esc(HEROES[x.help.hero].name)}</small></span></div>` : ''}
    ${x.hellNew ? `<div class="r2-killed r2-hellnew">지옥 난이도가 열렸어요! (어려움 ${R2.R2.hellSec}초 버티기 성공)</div>` : ''}
    ${x.test ? '<div class="guest-note">마스터 테스트 판은 서버 체력에 안 들어가요</div>' : ''}`;
  if (x.hellNew) C.toast('지옥 난이도가 열렸어요!', 2600);
  if (x.broke && x.broke.length) C.A.sfx.levelUp();
}

// ─── 로비 ───
const bossImg = (pose, cls = '') => `<img class="r2-pi ${cls}" src="${poseSrc(pose)}" alt="" draggable="false">`;
function owned(id) { return C.API.heroUnlocked(P(), id); }
// 멤버 얼굴 (세트 끼우기 창): 가진 멤버만 얼굴 + 이름
function recFace(id) {
  const h = HEROES[id];
  if (!h) return '';
  if (owned(id)) return `<span class="r2-rf" title="${esc(h.name)}"><span class="r2-face" style="--c:${ATTRS[h.attr].color}"><img src="${C.thumbSrc(id) || h.img}" alt="" draggable="false" style="${C.faceCircStyle(id)}" onerror="this.onerror=null;this.removeAttribute('style');this.src='${h.img}'"></span><small>${esc(h.name)}</small></span>`;
  return `<span class="r2-rf no"><span class="r2-face sil"><img src="${h.img}" alt="" draggable="false"></span><small>???</small></span>`;
}
// 의자에 앉은 거대 보스 (3페이즈는 일어나서 분노) · 숨쉬기 · 쓰러지면 회색
function bossStage(b) {
  const ph = b ? b.phase : 1;
  const rage = ph === 3;
  return `<div class="r2-boss ph${ph} ${rage ? 'rage' : ''} ${b && b.killed ? 'dead' : ''}"><i class="r2-glow"></i><div class="r2-bb"><img class="r2-body" src="${lobbySrc(rage)}" alt="" draggable="false"></div></div>`;
}
// 페이즈 줄: 1 여유만만 → 2 짜증 (66%) → 3 분노 (33%) · 누가 넘겼는지
function phaseHtml(b) {
  const ph = b ? b.phase : 1;
  return `<div class="r2-phases">${R2.PHASES.map((p) => {
    const on = ph === p.n, done = ph > p.n;
    const by = b && b.by && b.by['p' + p.n];
    const at = p.n === 1 ? '100%' : `${Math.round(R2.R2.phaseAt[p.n - 2] * 100)}%`;
    return `<div class="r2-ph ${on ? 'on' : ''} ${done ? 'done' : ''}" style="--c:${p.color}"><b>${p.n}페이즈 · ${esc(p.name)}</b><small>${on ? '지금!' : done ? '지나감' : `체력 ${at} 부터`}${by ? ` · ${esc(by)}님` : ''}</small></div>`;
  }).join('')}</div>`;
}
// 패턴 안내: 지금 페이즈에 나오는 것 · 다음 페이즈부터 나오는 것 · 버티는 법
//  (고른 난이도 기준 — 어려움 · 지옥은 패턴이 더 일찍 나온다)
function patHtml(b) {
  const ph = b ? Math.min(3, b.phase) : 1, df = st.diff;
  return R2.PATTERNS.map((p) => {
    const from = RS.patFrom(p.id, df), later = !from || from > ph;
    const tag = !from ? (RS.patFrom(p.id, 'hard') ? '어려움부터' : '지옥부터') : from > ph ? `${from}페이즈부터` : '';
    return `<div class="r2-pat ${later ? 'later' : ''}"><img src="${p.img}" alt="" draggable="false"><span><b>${esc(p.name)}${tag ? ` <em>${tag}</em>` : ''}</b><small>${esc(p.text)}</small><i>${esc(p.tip)}</i></span></div>`;
  }).join('');
}
// 난이도 고르기: 보통 · 어려움 · 지옥 (배율 · 판 보상 · 잠금)
function diffOk(me, id) { return me && me.diffs ? !!me.diffs[id] : R2.diffOpen(P(), id, !!P().master).ok; }
function diffHtml(me) {
  if (!diffOk(me, st.diff)) saveDiff('normal');
  const cur = D(st.diff);
  const cells = R2.DIFF_IDS.map((id) => {
    const d = R2.DIFF[id], ok = diffOk(me, id), on = id === st.diff;
    return `<button class="r2-d ${on ? 'on' : ''} ${ok ? '' : 'lock'}" data-act="r2Diff" data-id="${id}" style="--c:${d.color}"><b>${ok ? '' : C.ic('lock', '', 'sm')}${esc(d.name)}</b><em>기여 ${mulTxt(d.mul)}</em><small>코인 ${fmt(d.rw.coins)} · 강화석 ${d.rw.stones}</small></button>`;
  }).join('');
  const lockTxt = R2.DIFF_IDS.filter((id) => !diffOk(me, id)).map((id) => `${R2.DIFF[id].name}: ${R2.DIFF[id].open}`).join(' · ');
  return `<div class="r2-diff"><div class="r2-dh"><b>난이도</b><small>어려울수록 기여 배율 · 판 보상이 커져요</small></div><div class="r2-dg">${cells}</div><p class="r2-dt" style="--c:${cur.color}"><b>${esc(cur.name)}</b> ${esc(cur.text)}</p>${lockTxt ? `<p class="r2-dl">${esc(lockTxt)}${me && me.hardSec ? ` (내 기록 ${me.hardSec}초)` : ''}</p>` : ''}</div>`;
}
function feedHtml(b) {
  const list = (b && b.feed) || [];
  if (!list.length) return '<div class="r2-feed-e">아직 소식이 없어요 — 첫 한 방을 먹여 봐요!</div>';
  return list.slice(0, 6).map((f) => `<div class="r2-feed-l ${f.k}"><b>${esc(feedText(f))}</b><small>${ago(f.t)}</small></div>`).join('');
}
const ago = (t) => { const s = Math.max(0, (Date.now() - t) / 1000); return s < 60 ? '방금' : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : `${Math.floor(s / 86400)}일 전`; };
function setHtml() {
  const p = P(), set = (p.raid2 && p.raid2.set) || {};
  const cells = R2.SET_IDS.map((id) => {
    const s = R2.SET[id], it = set[id];
    return `<button class="r2-set-c ${it ? '' : 'no'}" data-act="r2SetPick" data-id="${id}"><img src="${src(R2.setImg(id), s.fb)}" alt="" draggable="false"><b>${esc(s.name)}</b><small>${it ? `Lv${it.lv} · ${(STAT_HELP[s.stat] || [s.desc])[0]} +${Math.round(R2.setValue(id, it.lv) * 100)}%` : '레이드 보상으로'}</small>${it && it.on && HEROES[it.on] ? `<em>${esc(HEROES[it.on].name)}</em>` : ''}</button>`;
  }).join('');
  return `<div class="panel r2-set"><h4>${C.ic('gear_set', '', 'sm')}건물주 세트 <small>레이드 전용 · ${GEAR_RARITY.legend.name}급 · 멤버 한 명에게</small></h4><div class="r2-set-g">${cells}</div><p class="ip">${esc(R2.SET_BONUS2.label)} · ${esc(R2.SET_BONUS4.label)}</p></div>`;
}
function rinHtml(me) {
  if (!me || !me.rin || !me.rin.length) return '';
  return `<div class="panel r2-rin"><h4>${C.ic('megaphone', '', 'sm')}같이 때려 달래요!</h4>${me.rin.map((x) => `<div class="r2-rin-r"><span><b>${esc(x.n)}</b>님이 불렀어요 <small>${ago(x.at)}</small></span><button class="btn mini primary" data-act="r2Answer" data-id="${esc(x.id)}">응답하고 도전 <small>+1 입장</small></button></div>`).join('')}<p class="ip">응답하면 입장 +1 (주마다 ${R2.R2.bonusMax}번까지) · 그 판 피해 +${Math.round(R2.R2.rallyBuff * 100)}% · 둘 다 협동 기여 +${Math.round(R2.R2.coopPct * 100)}%</p></div>`;
}
async function show() {
  const p = P();
  if (!R2.r2Unlocked(p) && !p.master) { C.toast('건물주 레이드는 1-5를 깨면 참가할 수 있어요'); return; }
  await loadArt();
  C.app.screen = 'raid';
  C.hud.hidden = true;
  const render = (b) => {
    const me = b && b.me;
    const left = b ? b.left : 0, max = b ? b.hpMax : 1;
    const pct = b ? (left / max) * 100 : 100;
    const top = b && b.top ? b.top.map((r) => `<div class="wrow ${r.rank <= 3 ? 'top' + r.rank : ''} ${r.me ? 'me' : ''}"><span class="rk">${r.rank}</span><span class="nm">${esc(r.nickname)}${r.df && r.df !== 'normal' ? ` <i class="r2-dbadge" style="--c:${D(r.df).color}">${esc(D(r.df).name)}</i>` : ''}</span><b>${fmt(r.score)}</b></div>`).join('') || '<div class="empty-msg">아직 아무도 안 때렸어요 — 첫 타!</div>' : `<div class="empty-msg">${C.app.guest ? '건물주 레이드는 로그인하면 참가해요' : '<span class="spin"></span> 불러오는 중…'}</div>`;
    const phaseTxt = !b ? '' : b.killed ? `쓰러짐! · ${esc(b.killer)}님 막타` : `${b.phase}페이즈 · ${esc(R2.PHASES[b.phase - 1].name)}`;
    const canGo = b && !b.killed && me && me.left > 0 && !C.app.guest && diffOk(me, st.diff);
    C.show(`
      <div class="r2-scene"><i class="r2-bg" style="background-image:url('${src(R2.R2_ART.lobby, R2.R2_ART.lobbyFb)}')"></i><i class="r2-vig"></i></div>
      <div class="r2-top"><button class="back" data-act="menu">‹ 로비</button><span class="r2-pill">${C.ic('crown', '', 'sm')}<b>${b ? b.tier : 1}단계</b></span><span class="r2-pill">${C.ic('clock', '', 'sm')}<b>${esc(R2.weekLeftText())}</b></span></div>
      <h2 class="r2-title">${esc(R2.BOSS.name)}</h2>
      <p class="r2-sub">${esc(R2.BOSS.sub)} · 서버 모두가 같은 보스를 때려요</p>
      ${bossStage(b)}
      <div class="r2-hp"><div class="r2-hpbar"><b style="width:${pct.toFixed(2)}%"></b><s style="left:${(R2.R2.phaseAt[1] * 100).toFixed(1)}%"></s><s style="left:${(R2.R2.phaseAt[0] * 100).toFixed(1)}%"></s></div><em>${b ? `${big(left)} / ${big(max)}` : ''}</em><small>${phaseTxt}</small></div>
      ${phaseHtml(b)}
      <div class="r2-live">${C.ic('party', '', 'sm')}<b>지금 ${b ? b.hitting : 0}명이 때리는 중</b><small>이번 주 ${b ? b.players : 0}명 참가 · 활동 ${b ? Math.max(b.active, R2.R2.floor) : 0}명 기준 체력</small></div>
      <div class="r2-feed">${feedHtml(b)}</div>
      ${rinHtml(me)}
      <div class="wmy r2-me"><div><small>남은 입장</small><b>${me ? me.left : '-'}</b></div><div><small>내 기여</small><b>${me ? big((me.dmg || 0) + (me.coop || 0)) : '-'}</b></div><div><small>기여 순위</small><b>${me && me.rank ? me.rank + '위' : '-'}</b></div></div>
      ${b && !b.killed && !C.app.guest ? diffHtml(me) : ''}
      <div class="r2-cta"><button class="btn primary" data-act="raidGo" ${canGo ? '' : 'disabled'}>${b && b.killed ? '이번 주는 쓰러뜨렸어요!' : `${esc(D(st.diff).name)} 도전!`} <small>${b && b.killed ? '다음 주 월요일 더 세져서 등장' : `입구가 부서질 때까지 · 한 판 최대 ${big(b ? b.runCap * D(st.diff).mul : 0)}`}</small></button>
        <button class="btn r2-rally" data-act="r2Rally" ${b && !b.killed && !C.app.guest ? '' : 'disabled'}>${C.ic('megaphone', '', 'sm')}같이 때려줘 <small>친구 부르기</small></button></div>
      <div class="panel r2-pats"><h4>${C.ic('target', '', 'sm')}건물주 패턴 · 버티는 법 <small>${esc(D(st.diff).name)} 기준</small></h4>${patHtml(b)}</div>
      <div class="panel wboard"><h4>${C.ic('trophy', '', 'sm')}이번 주 기여 순위 <small>피해 × 난이도 배율 + 협동</small></h4>${top}</div>
      ${setHtml()}
      <button class="chip rw-i" data-act="r2Info">${C.ic('book', '', 'sm')} 레이드 안내 · 보상</button>
      ${b && b.prev ? `<p class="ip r2-prev">지난주: ${b.prev.tier}단계 ${b.prev.killed ? `토벌 성공 (막타 ${esc(b.prev.killer)})` : '못 잡음 → 남은 체력 그대로 이어서'}${b.prev.top.length ? ` · 1위 ${esc(b.prev.top[0])}` : ''}</p>` : ''}
    `, 'dim r2-screen');
  };
  st.render = render;
  render(st.board && Date.now() - st.boardAt < 20000 ? st.board : null);
  if (C.app.guest) return;
  const pr = C.API.r2Board(false);
  C.TR.hold(pr);
  const b = await pr;
  if (!b) return;
  st.board = b; st.boardAt = Date.now();
  if (b.profile) C.app.profile = b.profile;
  if (b.mailed && b.mailed.length) C.toast(`우편 도착! ${b.mailed.join(' · ')}`, 3400);
  if (C.app.screen === 'raid') render(b);
}
// 도전: 친구 멤버 (고르면 한 명 더) → 서버에 입장 → 전투
async function go(rally) {
  if (C.app.guest) { C.toast('건물주 레이드는 로그인하면 참가해요'); return; }
  const fid = rally ? null : await C.FRX.pickHelper((C.curDeck() || []).filter(Boolean));
  if (fid === false) return;
  const r = await C.API.r2Start({ ...(rally ? { rally } : fid ? { friend: fid } : {}), diff: st.diff });
  if (!r.ok) { C.toast(r.message || '건물주 레이드를 시작할 수 없어요', 2600); return; }
  if (r.profile) C.app.profile = r.profile;
  C.app.r2Run = r.runId; st.lastRunId = r.runId;
  st.board = null;
  C.startRun({ mode: 'raid', force: true, r2: { runId: r.runId, tier: r.tier, diff: r.diff || 'normal', exposed: r.exposed, hp: r.hp, max: r.max, rally: r.rally }, help: r.help || null });
}
// 친구 부르기 (같이 때려줘): 친구 목록 + 링크 공유
function rallyPop() {
  const b = st.board, me = b && b.me;
  const list = me && me.friends && me.friends.length ? me.friends.map((f) => `<div class="rank fr-row"><span class="r2-fn"><b>${esc(f.n)}</b></span><button class="btn mini ${f.sent ? 'ghost' : 'primary'}" data-act="r2RallySend" data-id="${esc(f.id)}" ${f.sent || !me.rallyLeft ? 'disabled' : ''}>${f.sent ? '오늘 부름' : '부르기'}</button></div>`).join('') : '<div class="empty-msg">아직 친구가 없어요 · 친구 화면에서 추가해 봐요</div>';
  C.popup(`<h3>${C.ic('megaphone', '', 'sm')}같이 때려줘!</h3><p class="ip">친구가 응답하면 친구는 입장 +1 · 피해 +${Math.round(R2.R2.rallyBuff * 100)}% · 둘 다 협동 기여 +${Math.round(R2.R2.coopPct * 100)}% (오늘 ${me ? me.rallyLeft : 0}번 더)</p><div class="rank-list">${list}</div><button class="btn" data-act="r2Share">${C.ic('share', '', 'sm')}카톡으로 링크 보내기</button>`, 'fr-pop r2-rally-pop');
}
async function shareLink() {
  const url = `${location.origin}/langbang/?raid=1`;
  const b = st.board;
  const text = `건물주 대마왕 ${b ? b.tier : 1}단계가 랑방을 점령했다! 체력 ${b ? Math.round((b.left / b.hpMax) * 100) : 100}% 남음 · 같이 때려줘! `;
  if (navigator.share) { try { await navigator.share({ title: '건물주 레이드', text, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  try { await navigator.clipboard.writeText(text + url); C.toast('링크를 복사했어요! 카톡방에 붙여 넣어 주세요', 2600); } catch { C.toast(`이 주소를 보내 주세요: ${url}`, 3200); }
}
function setPick(id) {
  const p = P(), it = ((p.raid2 || {}).set || {})[id], s = R2.SET[id];
  if (!it) { C.toast('건물주 레이드 보상으로 받을 수 있어요'); return; }
  const heroes = Object.keys(HEROES).filter(owned);
  C.popup(`<h3>${esc(s.name)} <small>Lv${it.lv}</small></h3><p class="ip">${esc((STAT_HELP[s.stat] || [s.desc, ''])[1] || s.desc)} · +${Math.round(R2.setValue(id, it.lv) * 100)}%</p>
    <div class="r2-hpick">${heroes.map((h) => `<button class="r2-hp-b ${it.on === h ? 'on' : ''}" data-act="r2SetOn" data-id="${id}" data-hero="${h}">${recFace(h)}</button>`).join('')}</div>${it.on ? `<button class="btn ghost" data-act="r2SetOn" data-id="${id}" data-hero="">빼기</button>` : ''}`, 'r2-set-pop');
}
function info() {
  const rw = (o) => C.gotText(o);
  C.popup(`<h3>${C.ic('book', '', 'sm')}건물주 레이드</h3><div class="ilist">
    <p class="ip">${C.ic('clock', '', 'sm')}월요일 0시 등장 → 일요일 밤까지. 서버 모두가 같은 체력을 깎아요</p>
    <p class="ip">${C.ic('energy', '', 'sm')}입장 주마다 ${R2.R2.entries}번 (체력 안 씀) · 친구 부름에 응답하면 +1 (주 ${R2.R2.bonusMax}번까지)</p>
    <p class="ip">${C.ic('target', '', 'sm')}진상은 안 나와요. 거대한 건물주 혼자 입구와 멤버를 직접 때려요 — 입구가 부서지면 그 판 끝, 그동안 준 피해가 기록돼요</p>
    <p class="ip">${C.ic('fire', '', 'sm')}시간이 갈수록 화가 쌓여 공격이 세지고 빨라져요 (${R2.R2.sec}초가 되면 "철거"로 입구가 무너져요) · 이 레이드에선 입구 수리 효과가 줄어요</p>
    <p class="ip">${C.ic('shield', '', 'sm')}빨간 구역 = 공격 예고. 예고 중에 스킬을 여러 번 맞히거나(보통 2 · 어려움 3 · 지옥 4번) 기절 · 총공지로 끊으면 빈틈 (피해 ×1.5)</p>
    <p class="ip">${C.ic('door', '', 'sm')}대마왕에게 맞으면 입구에 금이 가요. 금 간 만큼은 수리로 못 메워서, 힐러가 있어도 결국 입구는 부서져요</p>
    <p class="ip">${C.ic('crown', '', 'sm')}난이도: ${R2.DIFF_IDS.map((id) => `${R2.DIFF[id].name} 기여 ${mulTxt(R2.DIFF[id].mul)} · 판 보상 코인 ${fmt(R2.DIFF[id].rw.coins)} · 강화석 ${R2.DIFF[id].rw.stones}`).join(' / ')}</p>
    <p class="ip">${C.ic('lock', '', 'sm')}어려움: ${R2.DIFF.hard.open} · 지옥: ${R2.DIFF.hell.open}. 어려울수록 예고가 빠르고, 패턴이 일찍 나오고, 기절이 길고, 입구 피해가 세요. 준 피해에 배율을 곱해 서버 체력 · 기여 순위에 들어가요 (한 판 최대도 배율만큼)</p>
    <p class="ip">${C.ic('help_point', '', 'sm')}서버 체력 66% · 33% 아래로 → 2페이즈(짜증) · 3페이즈(분노): 새 패턴이 나오고 더 빨라져요</p>
    <p class="ip">${C.ic('scale', '', 'sm')}한 판에 깎을 수 있는 건 최대 체력의 1% — 혼자서는 절대 못 잡아요</p>
    <p class="ip">${C.ic('gift', '', 'sm')}한 번이라도 때리면 참가 상자: ${rw(R2.JOIN_RW)}</p>
    <p class="ip">${C.ic('crown', '', 'sm')}잡으면 참가자 모두 토벌 보상: ${rw(R2.SLAY_RW)} · 건물주 세트 조각 · 다음 주엔 한 단계 더 센 건물주</p>
    <p class="ip">${C.ic('dragon', '', 'sm')}페이즈를 넘긴 판(2 · 3페이즈 막타): ${rw(R2.PART_RW)} · 마지막 일격: ${rw(R2.KILL_RW)}</p>
    <p class="ip">${C.ic('trophy', '', 'sm')}주간 기여 순위(피해 + 협동): 1위 신화 장비 · 칭호 "건물주 저승사자" · 세트 조각 2 / 2~3위 전설 장비 · 조각 2 / 4~10위 영웅 장비 · 조각 1 / 상위 50% 조각 1 — 우편으로</p>
    <p class="ip">${C.ic('help_point', '', 'sm')}못 잡으면 다음 주에 남은 체력 그대로 이어서</p></div>`, 'r2-info-pop');
}
const ACTS = {
  raid: () => show(),
  raidGo: () => go(null),
  r2Answer: (b) => go(b.dataset.id),
  r2Rally: () => rallyPop(),
  r2RallySend: async (b) => { const r = await C.liveAct(C.API.r2Rally(b.dataset.id)); if (r) { C.toast(`${r.nickname}님을 불렀어요!`, 2200); b.disabled = true; b.textContent = '오늘 부름'; if (st.board && st.board.me) { const f = st.board.me.friends.find((x) => x.id === b.dataset.id); if (f) f.sent = true; st.board.me.rallyLeft = Math.max(0, st.board.me.rallyLeft - 1); } } },
  r2Share: () => shareLink(),
  r2Info: () => info(),
  r2Diff: (b) => {
    const id = b.dataset.id, me = st.board && st.board.me;
    if (!diffOk(me, id)) { C.toast(`${R2.DIFF[id].name}: ${R2.DIFF[id].open}`, 2400); return; }
    saveDiff(id);
    if (C.app.screen === 'raid' && st.render) { const sc = document.querySelector('.r2-screen'), y = sc ? sc.scrollTop : 0; st.render(st.board); const s2 = document.querySelector('.r2-screen'); if (s2) s2.scrollTop = y; }
  },
  r2SetPick: (b) => setPick(b.dataset.id),
  r2SetOn: async (b) => { const r = await C.liveAct(C.API.r2Set(b.dataset.id, b.dataset.hero || null)); if (r) { C.closeInfoCard(); C.toast(b.dataset.hero ? `${HEROES[b.dataset.hero].name}에게 끼웠어요` : '뺐어요'); show(); } },
};

// ─── 도전 창 카드 · 로비 표시 ───
function modeCard(p, card, art) {
  const left = R2.entriesLeft(p);
  const k = st.board && st.board.killed;
  const unlocked = R2.r2Unlocked(p) || p.master;
  return card('raid', art, '건물주 레이드', '거대 보스 혼자 · 서버 모두가 같이', unlocked ? (k ? '이번 주 토벌 성공!' : `${C.ic('clock', '', 'sm')}입장 ${left}번 · ${esc(R2.weekLeftText())}`) : '1-5 클리어', { locked: !unlocked, hot: unlocked && !k && left > 0, dot: dot(p) });
}
function hot(p) { return (R2.r2Unlocked(p) || p.master) && !(st.board && st.board.killed) && R2.entriesLeft(p) > 0; }
// 빨간 점: 친구가 불렀거나 · 이번 주에 아직 한 번도 안 때렸을 때
function dot(p) { const r = p.raid2 || {}; return !!(R2.r2Unlocked(p) && ((r.rin || []).length > 0 || (hot(p) && R2.entriesLeft(p) >= R2.R2.entries))); }
