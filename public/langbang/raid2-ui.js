// 랑방 대전 — 건물주 레이드 화면: 로비(거대 보스 · 팔 상태 · 서버 체력 · 주간 시계 · 추천 멤버 · 부르기 · 기여 순위 · 세트)
//  · 전투(보스 몸통 + 팔 8개를 캔버스에 따로 그려 흔들기 · 들어올리기 · 내려찍기 · 부서져 떨어지기) · 전투 HUD(서버 체력 · 지금 때리는 사람 · 소식) · 결과
//  game.js 는 initRaid2(도우미) 로 부르고 돌려받은 함수들을 몇 군데에만 끼운다 (게임 코드는 최소한만 건드리게)
import { HEROES, ATTRS, GEAR_RARITY, STAT_HELP } from './data.js';
import * as R2 from './raid2.js';
import * as RS from './raid2-sim.js';

let C = null;
const st = { board: null, boardAt: 0, run: null, live: null, pollT: 0, feedT: 0, fx: [], art: {}, artTried: false, hud: null, hudT: 0, spam: null };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const P = () => C.P();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const big = (n) => (n >= 1e8 ? `${(n / 1e8).toFixed(n >= 1e9 ? 0 : 1)}억` : n >= 1e4 ? `${fmt(Math.round(n / 1e4))}만` : fmt(n));

export function initRaid2(ctx) {
  C = ctx;
  C.R.r2Draw = (g, t, layer) => draw(g, t, layer);
  return { show, acts: ACTS, sec: R2.R2.sec, waveDef: (o) => RS.waveDef((o && o.tier) || 1), attach, onEvent, hudTick, resultTop, save, modeCard, hot, dot, leave, R2 };
}

// ─── 그림 (없으면 가장 가까운 진짜 그림으로) ───
// 서버 /api/langbang/anim 의 files 에 있는 그림만 진짜 주소로 (없는 파일을 요청해 404 를 쏟지 않게)
let have = null;
const listReady = () => have ? Promise.resolve(have) : fetch('/api/langbang/anim').then((x) => x.json()).then((m) => { have = new Set((m && m.files) || []); return have; }).catch(() => { have = new Set(); return have; });
const hasFile = (src) => !!(have && have.has(src));
const src = (real, fb) => (hasFile(real) ? real : fb);
const armSrc = (id) => src(R2.R2_ART.arm(id), (R2.armOf(id) || {}).fb);
const bodySrc = (rage) => (rage ? src(R2.R2_ART.rage, src(R2.R2_ART.body, R2.R2_ART.rageFb)) : src(R2.R2_ART.body, R2.R2_ART.bodyFb));
async function loadArt() {
  if (st.artTried) return;
  st.artTried = true;
  await listReady();
  const one = (key, real, fb) => {
    const im = new Image(); im.decoding = 'async';
    const o = st.art[key] = { img: im, ok: false, real: !!real && hasFile(real), fb: !(real && hasFile(real)) };
    im.onload = () => { o.ok = true; };
    im.src = o.real ? real : fb;
  };
  one('body', R2.R2_ART.body, R2.R2_ART.bodyFb);
  one('rage', R2.R2_ART.rage, hasFile(R2.R2_ART.body) ? R2.R2_ART.body : R2.R2_ART.rageFb);
  for (const a of R2.ARMS) { if (hasFile(R2.R2_ART.arm(a.id))) one('arm_' + a.id, R2.R2_ART.arm(a.id), null); one('item_' + a.id, null, a.fb); }
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
const realArt = (k) => artOk(k) && st.art[k].real;

// ─── 몸통 · 어깨 (그림 규격: 보고서 참고) ───
// 몸통 그림 1024×1024 · 아래 가운데가 기준점 · 어깨 = 몸통 그림 안 비율 위치 (x 0~1 왼→오, y 0~1 위→아래)
export const SHOULDER = { mega: [0.30, 0.62], bill: [0.70, 0.62], bottle: [0.24, 0.52], golf: [0.76, 0.52], contract: [0.27, 0.42], keys: [0.73, 0.42], bag: [0.33, 0.33], phone: [0.67, 0.33] };
// 팔 그림 256×640 · 어깨 관절(회전 중심) = (128, 56) · 손(물건) 가운데 = (128, 560)
export const ARM_IMG = { w: 256, h: 640, px: 128, py: 56, hy: 560 };
const BODY_W = 330;
const bodyBox = (g) => ({ cx: g.W / 2, bottom: g.rowY - 140, w: BODY_W, h: BODY_W });
function shoulderAt(g, id, t) {
  const b = bodyBox(g), s = SHOULDER[id];
  const breath = Math.sin(t * 1.4) * 3;
  return { x: b.cx - b.w / 2 + s[0] * b.w, y: b.bottom - b.h + s[1] * b.h + breath };
}

// ─── 전투 그리기 (render.js draw 안에서: back = 진상 뒤 · top = 입자 위) ───
function draw(g, t, layer) {
  const r = g.r2;
  if (!r) return;
  const R = C.R, cx = R.cx;
  if (layer === 'back') {
    const b = bodyBox(g);
    const rage = r.rage;
    const key = rage && artOk('rage') ? 'rage' : 'body';
    if (artOk(key)) {
      const im = st.art[key].img;
      const sq = 1 + Math.sin(t * 1.4) * 0.015 + (r.slam && r.slam.st === 'down' ? 0.03 : 0);
      const sh = rage ? Math.sin(t * 30) * 1.5 : 0;
      cx.save();
      cx.translate(b.cx + sh, b.bottom);
      cx.scale(1 / sq * (rage ? 1.04 : 1), sq * (rage ? 1.04 : 1));
      cx.globalAlpha = st.art[key].fb ? 0.92 : 1;
      if (rage) { cx.shadowColor = 'rgba(255,40,30,0.8)'; cx.shadowBlur = 24; }
      cx.drawImage(im, -b.w / 2, -b.h, b.w, b.h);
      cx.restore();
    }
    // 내려찍기 예고 구역 (빨간 띠 · 깜빡)
    if (r.slam && r.slam.st === 'wind') {
      const z = RS.SLAM.zone, k = 1 - r.slam.t / RS.SLAM.wind;
      cx.save();
      cx.globalAlpha = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(t * 18)) + 0.25 * k;
      cx.fillStyle = '#ff2a1a';
      cx.fillRect(r.slam.x - z, g.ropeY - 36, z * 2, g.rowY - g.ropeY + 80);
      cx.globalAlpha = 0.9; cx.strokeStyle = '#ffd23f'; cx.lineWidth = 2; cx.setLineDash([6, 5]);
      cx.strokeRect(r.slam.x - z, g.ropeY - 36, z * 2, g.rowY - g.ropeY + 80);
      cx.restore();
    }
    // 팔: 드러난 팔은 손 = 부위 자리 · 나머지 살아 있는 팔은 몸통 옆에서 대기 · 부서진 팔은 안 그림
    const live = st.live || (st.run ? { hp: st.run.hp, max: st.run.max } : null);
    R2.ARMS.forEach((a, i) => {
      const e = r.parts[a.id];
      const dead = live && live.hp && (live.hp[a.id] | 0) <= 0 && !e;
      if (dead) return;
      const s = shoulderAt(g, a.id, t);
      const side = SHOULDER[a.id][0] < 0.5 ? -1 : 1;
      let hx, hy, idle = !e;
      if (e) { hx = e.x + Math.sin(t * 1.7 + i) * 4; hy = e.y + Math.cos(t * 1.3 + i) * 3; if (r.slam && r.slam.p === a.id && r.slam.st === 'wind') { hx += Math.sin(t * 60) * 2; } }
      else { hx = s.x + side * (62 + Math.sin(t * 1.2 + i) * 8); hy = s.y + 96 + Math.cos(t * 1.5 + i) * 10; }
      drawArm(g, a.id, s, hx, hy, idle, t, e);
    });
    if (r.parts.body && !r.parts.body.dead) drawPartBar(g, r.parts.body, 'body');
  } else if (layer === 'top') {
    // 부서져 떨어지는 팔
    const now = performance.now() / 1000;
    st.fx = st.fx.filter((f) => now - f.t0 < 1.6);
    for (const f of st.fx) {
      const a = now - f.t0;
      const x = f.x + f.vx * a, y = f.y + f.vy * a + 420 * a * a;
      cx.save();
      cx.globalAlpha = clamp(1.6 - a, 0, 1);
      cx.translate(x, y); cx.rotate(f.rot + f.vr * a);
      const im = artOk('arm_' + f.p) ? st.art['arm_' + f.p].img : artOk('item_' + f.p) ? st.art['item_' + f.p].img : null;
      if (im) { if (im === (st.art['arm_' + f.p] || {}).img) { const k = 0.32; cx.drawImage(im, -ARM_IMG.px * k, -ARM_IMG.py * k, ARM_IMG.w * k, ARM_IMG.h * k); } else cx.drawImage(im, -34, -34, 68, 68); }
      cx.restore();
    }
  }
}
function drawArm(g, id, s, hx, hy, idle, t, e) {
  const R = C.R, cx = R.cx;
  const dx = hx - s.x, dy = hy - s.y, len = Math.hypot(dx, dy);
  if (realArt('arm_' + id)) {
    const im = st.art['arm_' + id].img;
    const k = clamp(len / (ARM_IMG.hy - ARM_IMG.py), 0.22, 0.7) * (idle ? 0.85 : 1);
    cx.save();
    cx.translate(s.x, s.y);
    cx.rotate(Math.atan2(dy, dx) - Math.PI / 2);
    if (idle) cx.globalAlpha = 0.85;
    if (e && e.weakT > 0) { cx.shadowColor = '#ffd23f'; cx.shadowBlur = 18; }
    if (e && e.flash > 0) cx.filter = 'brightness(1.8)';
    cx.drawImage(im, -ARM_IMG.px * k, -ARM_IMG.py * k, ARM_IMG.w * k, ARM_IMG.h * k);
    cx.restore();
  } else if (artOk('item_' + id)) {
    // 팔 그림이 오기 전: 손에 든 물건 그림만 (손 자리에서 흔들림)
    const im = st.art['item_' + id].img, sz = idle ? 40 : 62;
    cx.save();
    cx.translate(hx, hy);
    cx.rotate(Math.sin(t * 2.2 + sz) * 0.18 + (e && e.lift < -10 ? -0.4 : e && e.lift > 30 ? 0.5 : 0));
    if (idle) cx.globalAlpha = 0.7;
    if (e && e.weakT > 0) { cx.shadowColor = '#ffd23f'; cx.shadowBlur = 20; }
    else { cx.shadowColor = (R2.armOf(id) || {}).color || '#fff'; cx.shadowBlur = idle ? 6 : 14; }
    if (e && e.flash > 0) cx.filter = 'brightness(1.8)';
    cx.drawImage(im, -sz / 2, -sz / 2, sz, sz);
    cx.restore();
  }
  if (e) drawPartBar(g, e, id);
}
// 부위 머리 위: 서버 체력 (마지막으로 받은 값 − 이 판에서 넣은 피해)
function drawPartBar(g, e, id) {
  const cx = C.R.cx, live = st.live || st.run;
  if (!live || !live.max || !live.max[id]) return;
  const left = Math.max(0, (live.hp[id] || 0) - ((g.r2.dmg[id] || 0) - (st.dmgAtPoll[id] || 0)));
  const p = clamp(left / live.max[id], 0, 1);
  const w = id === 'body' ? 120 : 56, x = e.x - w / 2, y = e.y - (id === 'body' ? 120 : 46);
  cx.save();
  cx.fillStyle = 'rgba(12,4,10,0.8)'; cx.fillRect(x - 1.5, y - 1.5, w + 3, 8);
  cx.fillStyle = e.weakT > 0 ? '#ffd23f' : (R2.armOf(id) || R2.BODY).color; cx.fillRect(x, y, w * p, 5);
  cx.restore();
}
st.dmgAtPoll = {};

// ─── 판에 붙이기 (game.js startRun · createGame 바로 뒤) ───
function attach(g, o) {
  loadArt();
  st.run = o; st.live = { hp: { ...o.hp }, max: { ...o.max }, exposed: o.exposed.slice(), by: {}, hitting: 0, feed: [] };
  st.dmgAtPoll = {}; st.feedT = Date.now(); st.fx = []; st.pollT = 0;
  RS.attach(g, { tier: o.tier, exposed: o.exposed, rally: !!o.rally });
  mountHud(g);
  if (o.rally) setTimeout(() => C.toast(`${o.rally.n}님의 부름에 응답! 피해 +${Math.round(R2.R2.rallyBuff * 100)}% · 둘 다 협동 기여`, 3000), 800);
  return g.r2;
}
function leave() { if (st.hud) { st.hud.remove(); st.hud = null; } clearSpam(); st.run = null; }

// ─── 전투 HUD: 서버 체력 · 지금 때리는 사람 · 소식 ───
function mountHud(g) {
  if (st.hud) st.hud.remove();
  const d = document.createElement('div');
  d.className = 'r2-hud';
  d.innerHTML = `<div class="r2h-top"><b class="r2h-name">${esc(R2.BOSS.name)} <em>${st.run.tier}단계</em></b><span class="r2h-live"></span></div><div class="r2h-bar"><b></b><i></i></div><div class="r2h-feed"></div>`;
  C.stage.appendChild(d);
  st.hud = d;
}
function hudTick(g) {
  if (!g.r2 || !st.hud) return;
  const now = performance.now();
  if (now - st.hudT > 250) {
    st.hudT = now;
    const L0 = st.live, max = (st.run && R2.PARTS.reduce((a, p) => a + (st.run.max[p] || 0), 0)) || 1;
    const left = R2.PARTS.reduce((a, p) => a + Math.max(0, (L0.hp[p] || 0) - ((g.r2.dmg[p] || 0) - (st.dmgAtPoll[p] || 0))), 0);
    st.hud.querySelector('.r2h-bar b').style.width = `${clamp((left / max) * 100, 0, 100).toFixed(2)}%`;
    const mine = Object.values(g.r2.dmg).reduce((a, b) => a + b, 0);
    const cap = Math.round(max * R2.R2.runCapPct);
    st.hud.querySelector('.r2h-bar i').style.width = `${clamp((Math.min(mine, cap) / max) * 100, 0, 100).toFixed(2)}%`;
    st.hud.querySelector('.r2h-live').textContent = `지금 ${Math.max(1, L0.hitting | 0)}명이 때리는 중 · 내 피해 ${big(mine)}${mine >= cap ? ' (한 판 최대)' : ''}`;
  }
  // 15초마다 서버 상태 (다른 사람이 부순 팔 · 소식)
  if (!g.over && now - st.pollT > 15000) { st.pollT = now; poll(g); }
}
async function poll(g) {
  const b = await C.API.r2Board(true).catch(() => null);
  if (!b || C.app.g !== g || !g.r2) return;
  st.dmgAtPoll = { ...g.r2.dmg };
  st.live = { hp: b.hp, max: b.max, exposed: b.exposed, by: b.by, hitting: b.hitting, feed: b.feed };
  const gone = RS.syncParts(g, b.exposed, b.by);
  if (b.killed && g.raid) g.raid.sec = Math.min(g.raid.sec, g.t + 4); // 다른 사람이 잡았다 → 이 판도 곧 끝
  for (const f of (b.feed || []).slice().reverse()) {
    if (f.t <= st.feedT) continue;
    st.feedT = f.t;
    feedLine(feedText(f), f.k);
    if (f.k === 'kill') C.fx.banner('건물주 대마왕 쓰러짐!', `${f.n}님이 마지막 일격!`, '#7a1020', 3, 'boss');
  }
  if (gone.length) C.A.sfx.slam();
}
const feedText = (f) => (f.k === 'break' ? `${f.n}님이 ${R2.partName(f.p)}을 부쉈다!` : f.k === 'kill' ? `${f.n}님이 건물주 대마왕을 쓰러뜨렸다!` : `${f.n}님 큰 한 방 ${big(f.d || 0)}`);
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
function onEvent(g, e, loud) {
  const fx = C.fx, A = C.A;
  switch (e.type) {
    case 'r2Start':
      fx.banner(R2.BOSS.name, R2.BOSS.sub, '#7a1020', 2.6, 'boss');
      if (loud) A.sfx.rage();
      break;
    case 'r2Wind':
      fx.text(e.x, e.y - 60, `${e.name} 내려찍기!`, '#ff5a3a', 17, 1.6);
      if (loud) { A.sfx.heartbeat(); if (!st.windTip) { st.windTip = true; C.showTip('빨간 구역 = 내려찍기! 그 손에 스킬을 맞히거나 기절시키면 끊겨요', 4200); } }
      break;
    case 'r2Slam':
      fx.addShake(16); fx.flash('#ff3020', 0.28);
      fx.blast(e.x, e.y, 84, 'fire', 0.5);
      fx.ring(e.x, e.y, 12, 130, 0.55, '#ff7a3a', 6);
      fx.burst(e.x, e.y, 26, '#c9a27a', 240, 'dot', 4, 0.8, 360);
      for (const h of e.hits || []) fx.text(h.x, h.y - 70, '기절', '#ffd23f', 13, 1);
      if (loud) A.sfx.slam();
      break;
    case 'r2Cut':
      fx.text(e.x, e.y - 50, `${e.text} 빈틈!`, '#ffd23f', 19, 1.6);
      fx.ring(e.x, e.y, 10, 70, 0.5, '#ffd23f', 4);
      fx.burst(e.x, e.y, 18, '#ffe27a', 200, 'star', 5, 0.6);
      if (loud) A.sfx.reveal();
      break;
    case 'r2Gap': fx.ring(e.x, e.y, 20, 60, 0.4, '#ffd23f', 3); break;
    case 'r2Bill': fx.addShake(8); fx.flash('#ffcf3f', 0.16); fx.text(e.x, g.ropeY - 30, e.half ? '고지서 폭탄 (반감)' : '고지서 폭탄!', '#ffcf3f', 15, 1.2); if (loud) A.sfx.hit(); break;
    case 'r2Pat': patFx(g, e, loud); break;
    case 'r2Break': {
      const now = performance.now() / 1000;
      st.fx.push({ p: e.p, x: e.x, y: e.y, t0: now, vx: (Math.random() - 0.5) * 60, vy: -120, rot: 0, vr: (Math.random() < 0.5 ? -1 : 1) * 4 });
      fx.addShake(14); fx.flash('#ffffff', 0.3);
      fx.blast(e.x, e.y, 70, 'gold', 0.5); fx.burst(e.x, e.y, 34, (R2.armOf(e.p) || R2.BODY).color, 260, 'star', 5, 0.8, 200);
      fx.banner(`${R2.partName(e.p)} 부서짐!`, e.by ? `${e.by}님의 막타!` : '서버 모두의 힘!', '#5a2aa0', 2.2, 'big');
      feedLine(e.by ? `${e.by}님이 ${R2.partName(e.p)}을 부쉈다!` : `${R2.partName(e.p)} 부서짐!`, 'break');
      if (loud) A.sfx.levelUp();
      break;
    }
    case 'r2Phase':
      fx.banner(e.parts.includes('body') ? '본체 등장! 분노!' : '다음 팔들이 나왔다!', e.parts.includes('body') ? '건물이 흔들린다' : e.parts.map((p) => (R2.armOf(p) || {}).item).join(' · '), '#7a1020', 2.4, 'boss');
      if (loud) A.sfx.rage();
      break;
  }
}
const SPAM = ['[건물주] 이번 달 월세 입금 확인 바랍니다', '[건물주] 관리비 인상 안내 (필독)', '[건물주] 보일러 고장 신고는 받지 않습니다', '[건물주] 계약서 다시 씁시다', '[건물주] 반려동물 금지 재공지', '[건물주] 주차 자리 없어요'];
function patFx(g, e, loud) {
  const fx = C.fx, A = C.A, a = R2.armOf(e.p) || R2.BODY;
  fx.text(e.x, e.y - 58, `${a.item}${e.half ? ' (추천 멤버로 반감)' : ''}`, a.color, 13, 1.3);
  if (e.p === 'mega') { fx.ring(e.x, e.y, 10, 260, 0.6, '#ff6b4a', 5); if (loud) A.sfx.horn(); }
  else if (e.p === 'bill') { fx.text(e.x, g.ropeY - 60, '고지서 날아온다!', '#ffcf3f', 14, 1.4); }
  else if (e.p === 'bottle') { fx.burst(e.x, e.y, 14, '#4fd18b', 140, 'dot', 4, 0.5); if (loud) A.sfx.whoosh(); }
  else if (e.p === 'golf') { for (const h of e.hits || []) fx.text(h.x, h.y - 70, '풀스윙!', '#6fd3ff', 14, 1.1); if (loud) A.sfx.whoosh(); }
  else if (e.p === 'contract') { fx.ring(e.x, e.y, 10, 320, 0.7, '#c77dff', 4); }
  else if (e.p === 'keys') { if (e.hx) fx.text(e.hx, e.hy - 70, '자리 잠김!', '#e8a25a', 14, 1.4); }
  else if (e.p === 'bag') { fx.text(e.x, e.y - 30, `총공지 −${e.ult | 0}`, '#ff6fd8', 14, 1.4); if (loud) A.sfx.coin(); }
  else if (e.p === 'phone') { spam(e.sec || 5); }
}
function spam(sec) {
  clearSpam();
  const box = document.createElement('div');
  box.className = 'r2-spam';
  const n = 4;
  box.innerHTML = Array.from({ length: n }, (_, i) => `<div class="r2-noti" style="--x:${(8 + Math.random() * 30).toFixed(0)}%;--y:${(14 + i * 13 + Math.random() * 6).toFixed(0)}%;--d:${(i * 0.12).toFixed(2)}s"><b>알림</b><span>${esc(SPAM[(Math.random() * SPAM.length) | 0])}</span><small>지금</small></div>`).join('');
  box.addEventListener('pointerdown', (ev) => { const n0 = ev.target.closest('.r2-noti'); if (n0) n0.remove(); });
  C.stage.appendChild(box);
  st.spam = box;
  st.spamT = setTimeout(clearSpam, sec * 1000);
}
function clearSpam() { clearTimeout(st.spamT); if (st.spam) { st.spam.remove(); st.spam = null; } }

// ─── 결과 ───
function resultTop(g) {
  const rep = RS.report(g) || { total: 0 };
  return { title: '건물주 레이드 끝!', sub: `${Math.round(Math.min(g.t, R2.R2.sec))}초 동안 건물주에게 준 피해 · 끊은 내려찍기 ${rep.cuts | 0}번`, top: `<div class="score-big"><small>건물주 피해</small><b>${fmt(rep.total)}</b></div>` };
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
      <div class="rw"><span>서버 체력에 들어간 양</span><b>${fmt(x.counted || 0)}${x.clipped ? ' <small>(한 판 최대)</small>' : ''}</b></div>
      ${x.coop ? `<div class="rw"><span>협동 기여 (${esc(x.rally)}님 부름)</span><b>+${fmt(x.coop)}</b></div>` : ''}
      <div class="rw"><span>이번 주 내 기여</span><b>${fmt((m.dmg || 0) + (m.coop || 0))}${m.rank ? ` · ${m.rank}위` : ''}</b></div>
      <div class="rw total"><span><i class="ci"></i>참가 보상</span><b>+100 · ${C.ic('gem', '', 'sm')}2</b></div>
    </div>
    ${(x.broke || []).map((p) => `<div class="r2-broke">${partImg(p)}<b>${esc(R2.partName(p))} 막타!</b><small>${p === 'body' ? '칭호 "막타왕" · 전설 장비 · 모집권 5 (우편)' : '코인 · 강화석 · 모집권 (우편)'}</small></div>`).join('')}
    ${x.killed ? '<div class="r2-killed">건물주 대마왕을 쓰러뜨렸다! 참가자 모두 토벌 보상</div>' : ''}
    ${x.help && HEROES[x.help.hero] ? `<div class="fr-helped">${C.av(HEROES[x.help.hero])}<span><b>${esc(x.help.nick)}님의 멤버가 도와줬어요</b><small>${esc(HEROES[x.help.hero].name)}</small></span></div>` : ''}
    ${x.test ? '<div class="guest-note">마스터 테스트 판은 서버 체력에 안 들어가요</div>' : ''}`;
  if (x.broke && x.broke.length) C.A.sfx.levelUp();
}

// ─── 로비 ───
const partImg = (p, cls = '') => (p === 'body' ? `<img class="r2-pi ${cls} ${hasFile(R2.R2_ART.body) ? '' : 'fb'}" src="${bodySrc(false)}" alt="" draggable="false">` : `<img class="r2-pi ${cls} ${hasFile(R2.R2_ART.arm(p)) ? '' : 'fb'}" src="${armSrc(p)}" alt="" draggable="false">`);
function owned(id) { return C.API.heroUnlocked(P(), id); }
// 추천 멤버 얼굴: 가진 멤버만 얼굴 + 이름 · 없는 멤버는 이름 없이 실루엣
function recFace(id) {
  const h = HEROES[id];
  if (!h) return '';
  if (owned(id)) return `<span class="r2-rf" title="${esc(h.name)}"><span class="r2-face" style="--c:${ATTRS[h.attr].color}"><img src="${C.thumbSrc(id) || h.img}" alt="" draggable="false" style="${C.faceCircStyle(id)}" onerror="this.onerror=null;this.removeAttribute('style');this.src='${h.img}'"></span><small>${esc(h.name)}</small></span>`;
  return `<span class="r2-rf no"><span class="r2-face sil"><img src="${h.img}" alt="" draggable="false"></span><small>???</small></span>`;
}
function bossStage(b) {
  const arms = R2.ARMS.map((a, i) => {
    const dead = b && (b.hp[a.id] | 0) <= 0;
    const on = b && b.exposed.includes(a.id);
    const [sx, sy] = SHOULDER[a.id];
    return `<i class="r2-arm a-${a.id} ${dead ? 'gone' : ''} ${on ? 'on' : ''} ${hasFile(R2.R2_ART.arm(a.id)) ? 'real' : 'item'}" style="--i:${i};--sx:${sx};--sy:${sy};--side:${sx < 0.5 ? -1 : 1};--c:${a.color}">${partImg(a.id)}</i>`;
  }).join('');
  const rage = b && b.phase >= 3;
  return `<div class="r2-boss ${rage ? 'rage' : ''} ${b && b.killed ? 'dead' : ''}"><div class="r2-bb"><img class="r2-body ${hasFile(R2.R2_ART.body) ? '' : 'fb'}" src="${bodySrc(rage)}" alt="" draggable="false">${arms}</div></div>`;
}
function armChips(b) {
  return R2.ARMS.map((a) => {
    const dead = b && (b.hp[a.id] | 0) <= 0, on = b && b.exposed.includes(a.id);
    const pct = b ? Math.round(((b.hp[a.id] || 0) / (b.max[a.id] || 1)) * 100) : 100;
    return `<div class="r2-chip ${dead ? 'gone' : ''} ${on ? 'on' : ''}" style="--c:${a.color}">${partImg(a.id)}<b>${esc(a.item)}</b>${dead ? `<small>부서짐${b.by[a.id] ? ` · ${esc(b.by[a.id])}` : ''}</small>` : `<small>${on ? `${pct}% 남음` : `${a.phase}페이즈`}</small><i class="r2-mini"><em style="width:${pct}%"></em></i>`}</div>`;
  }).join('');
}
function recHtml(b) {
  const ex = b ? b.exposed : ['mega', 'bill', 'bottle', 'golf'];
  if (ex.includes('body')) return `<div class="r2-rec-row"><span class="r2-rec-h">${partImg('body')}<span><b>${esc(R2.BODY.name)}</b><small>${esc(R2.BODY.pat)}</small></span></span><p class="r2-rec-tip">${esc(R2.BODY.tip)} · 약점 멤버 없음 — 다 같이!</p></div>`;
  return ex.map((p) => { const a = R2.armOf(p); return `<div class="r2-rec-row" style="--c:${a.color}"><span class="r2-rec-h">${partImg(p)}<span><b>${esc(a.item)} 팔 · ${esc(a.pat)}</b><small>약점: ${esc(a.role)} ${p === 'contract' ? '×3' : '×2.5'} · 추천 멤버가 있으면 패턴 절반</small></span></span><div class="r2-rec-f">${a.weak.map(recFace).join('')}</div></div>`; }).join('');
}
function feedHtml(b) {
  const list = (b && b.feed) || [];
  if (!list.length) return '<div class="r2-feed-e">아직 소식이 없어요 — 첫 팔을 부숴 봐요!</div>';
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
    const top = b && b.top ? b.top.map((r) => `<div class="wrow ${r.rank <= 3 ? 'top' + r.rank : ''} ${r.me ? 'me' : ''}"><span class="rk">${r.rank}</span><span class="nm">${esc(r.nickname)}</span><b>${fmt(r.score)}</b></div>`).join('') || '<div class="empty-msg">아직 아무도 안 때렸어요 — 첫 타!</div>' : `<div class="empty-msg">${C.app.guest ? '건물주 레이드는 로그인하면 참가해요' : '<span class="spin"></span> 불러오는 중…'}</div>`;
    const phaseTxt = !b ? '' : b.killed ? `쓰러짐! · ${esc(b.killer)}님 막타` : b.phase === 3 ? '3페이즈 · 본체 (분노)' : `${b.phase}페이즈 · 팔 ${b.phase === 1 ? '1~4' : '5~8'}`;
    const canGo = b && !b.killed && me && me.left > 0 && !C.app.guest;
    C.show(`
      <div class="r2-scene"><i class="r2-bg" style="background-image:url('${src(R2.R2_ART.lobby, R2.R2_ART.lobbyFb)}')"></i><i class="r2-vig"></i></div>
      <div class="r2-top"><button class="back" data-act="menu">‹ 로비</button><span class="r2-pill">${C.ic('crown', '', 'sm')}<b>${b ? b.tier : 1}단계</b></span><span class="r2-pill">${C.ic('clock', '', 'sm')}<b>${esc(R2.weekLeftText())}</b></span></div>
      <h2 class="r2-title">${esc(R2.BOSS.name)}</h2>
      <p class="r2-sub">${esc(R2.BOSS.sub)} · 서버 모두가 같은 보스를 때려요</p>
      ${bossStage(b)}
      <div class="r2-hp"><div class="r2-hpbar"><b style="width:${pct.toFixed(2)}%"></b></div><em>${b ? `${big(left)} / ${big(max)}` : ''}</em><small>${phaseTxt}</small></div>
      <div class="r2-live">${C.ic('party', '', 'sm')}<b>지금 ${b ? b.hitting : 0}명이 때리는 중</b><small>이번 주 ${b ? b.players : 0}명 참가 · 활동 ${b ? Math.max(b.active, R2.R2.floor) : 0}명 기준 체력</small></div>
      <div class="r2-feed">${feedHtml(b)}</div>
      <div class="r2-arms">${armChips(b)}</div>
      ${rinHtml(me)}
      <div class="wmy r2-me"><div><small>남은 입장</small><b>${me ? me.left : '-'}</b></div><div><small>내 기여</small><b>${me ? big((me.dmg || 0) + (me.coop || 0)) : '-'}</b></div><div><small>기여 순위</small><b>${me && me.rank ? me.rank + '위' : '-'}</b></div></div>
      <div class="r2-cta"><button class="btn primary" data-act="raidGo" ${canGo ? '' : 'disabled'}>${b && b.killed ? '이번 주는 쓰러뜨렸어요!' : '도전!'} <small>${b && b.killed ? '다음 주 월요일 더 세져서 등장' : `${R2.R2.sec}초 · 한 판 최대 ${big(b ? b.runCap : 0)}`}</small></button>
        <button class="btn r2-rally" data-act="r2Rally" ${b && !b.killed && !C.app.guest ? '' : 'disabled'}>${C.ic('megaphone', '', 'sm')}같이 때려줘 <small>친구 부르기</small></button></div>
      <div class="panel r2-recs"><h4>${C.ic('target', '', 'sm')}지금 드러난 부위 · 추천 멤버</h4>${recHtml(b)}</div>
      <div class="panel wboard"><h4>${C.ic('trophy', '', 'sm')}이번 주 기여 순위 <small>피해 + 협동</small></h4>${top}</div>
      ${setHtml()}
      <button class="chip rw-i" data-act="r2Info">${C.ic('book', '', 'sm')} 레이드 안내 · 보상</button>
      ${b && b.prev ? `<p class="ip r2-prev">지난주: ${b.prev.tier}단계 ${b.prev.killed ? `토벌 성공 (막타 ${esc(b.prev.killer)})` : '못 잡음 → 남은 체력 그대로 이어서'}${b.prev.top.length ? ` · 1위 ${esc(b.prev.top[0])}` : ''}</p>` : ''}
    `, 'dim r2-screen');
  };
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
  const r = await C.API.r2Start(rally ? { rally } : fid ? { friend: fid } : {});
  if (!r.ok) { C.toast(r.message || '건물주 레이드를 시작할 수 없어요', 2600); return; }
  if (r.profile) C.app.profile = r.profile;
  C.app.r2Run = r.runId; st.lastRunId = r.runId;
  st.board = null;
  C.startRun({ mode: 'raid', force: true, r2: { runId: r.runId, tier: r.tier, exposed: r.exposed, hp: r.hp, max: r.max, rally: r.rally }, help: r.help || null });
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
    <p class="ip">${C.ic('target', '', 'sm')}1페이즈 팔 1~4 → 2페이즈 팔 5~8 → 3페이즈 본체(분노). 팔마다 패턴이 있고 약점 멤버는 피해 ×2.5 (계약서 팔은 저격 ×3)</p>
    <p class="ip">${C.ic('shield', '', 'sm')}빨간 구역 = 내려찍기. 예고 중에 그 손에 스킬을 맞히거나 기절시키면 끊기고 빈틈 (피해 ×1.5)</p>
    <p class="ip">${C.ic('scale', '', 'sm')}한 판에 깎을 수 있는 건 최대 체력의 1% — 혼자서는 절대 못 잡아요</p>
    <p class="ip">${C.ic('gift', '', 'sm')}한 번이라도 때리면 참가 상자: ${rw(R2.JOIN_RW)}</p>
    <p class="ip">${C.ic('crown', '', 'sm')}잡으면 참가자 모두 토벌 보상: ${rw(R2.SLAY_RW)} · 건물주 세트 조각 · 다음 주엔 한 단계 더 센 건물주</p>
    <p class="ip">${C.ic('dragon', '', 'sm')}팔 막타: ${rw(R2.PART_RW)} · 본체 막타: ${rw(R2.KILL_RW)}</p>
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
  r2SetPick: (b) => setPick(b.dataset.id),
  r2SetOn: async (b) => { const r = await C.liveAct(C.API.r2Set(b.dataset.id, b.dataset.hero || null)); if (r) { C.closeInfoCard(); C.toast(b.dataset.hero ? `${HEROES[b.dataset.hero].name}에게 끼웠어요` : '뺐어요'); show(); } },
};

// ─── 도전 창 카드 · 로비 표시 ───
function modeCard(p, card, art) {
  const left = R2.entriesLeft(p);
  const k = st.board && st.board.killed;
  const unlocked = R2.r2Unlocked(p) || p.master;
  return card('raid', art, '건물주 레이드', '서버 모두가 거대 보스 하나를', unlocked ? (k ? '이번 주 토벌 성공!' : `${C.ic('clock', '', 'sm')}입장 ${left}번 · ${esc(R2.weekLeftText())}`) : '1-5 클리어', { locked: !unlocked, hot: unlocked && !k && left > 0, dot: dot(p) });
}
function hot(p) { return (R2.r2Unlocked(p) || p.master) && !(st.board && st.board.killed) && R2.entriesLeft(p) > 0; }
// 빨간 점: 친구가 불렀거나 · 이번 주에 아직 한 번도 안 때렸을 때
function dot(p) { const r = p.raid2 || {}; return !!(R2.r2Unlocked(p) && ((r.rin || []).length > 0 || (hot(p) && R2.entriesLeft(p) >= R2.R2.entries))); }
