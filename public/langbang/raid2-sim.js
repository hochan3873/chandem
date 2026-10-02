// 랑방 대전 — 건물주 레이드 전투 규칙 (DOM 없음 · Node 에서도 돈다)
//  sim.js 는 훅 세 줄만 (g.r2.hitMul · g.r2.onHit · g.r2.tick) — 나머지는 전부 여기
//  - 진상은 안 나온다. 옥상 위 거대한 건물주 대마왕 혼자 → 멤버들이 대마왕을 때리고, 대마왕은 직접 입구 · 멤버를 때린다
//  - 패턴은 전부 예고가 있다 (빨간 구역 · 표시) · 내려찍기 · 휩쓸기 · 분노 연타는 예고 중에 스킬을 맞히거나 기절시키면 끊기고 빈틈 (피해 ×1.5)
//  - 입구 붙잡기: 붙잡고 흔드는 동안 계속 피해 · 대신 빈틈 · 스킬 두 번이나 기절이면 손을 놓는다
//  - 시간이 갈수록 화가 쌓여 세지고 빨라진다 → 입구가 부서지면 판 끝 (그동안 준 피해가 기록) · R2.sec 까지 버티면 "철거"로 끝
//  - 진상을 안 잡으니 경험치 · 총공지 게이지는 시간 + 끊기로 채운다 (멤버 합류 · 카드는 그대로)
import { RULES } from './data.js';
import { spawnEnemy, damageBase, debuffSec, gainExp } from './sim.js';
import { R2, BOSS, PATTERNS, phaseAt } from './raid2.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 패턴 숫자 (pct = 입구 최대 체력 대비)
export const PAT = {
  slam: { wind: 2.0, wind3: 1.5, pct: 0.085, stun: 1.6, zone: 62, gap: 3.5, w: [5, 5, 4] },
  sweep: { wind: 1.7, pct: 0.035, stun: 1.1, gap: 2.5, w: [3, 3, 3] },
  bills: { n: [3, 4, 5], fly: 1.2, step: 0.28, pct: 0.016, w: [4, 3, 3] },
  seal: { n: 2, sec: 3.5, w: [3, 2, 2] },
  cash: { n: [2, 2, 3], fuse: 1.7, r: 46, stun: 1.3, pct: 0.012, w: [0, 3, 3] },
  grab: { wind: 1.0, hold: 4.5, dps: 0.024, hits: 2, w: [0, 3, 3] },
  combo: { n: 3, wind: 1.05, w: [0, 0, 4] },
};
export const SLAM = PAT.slam; // (예전 이름)
export const TEMPO_R2 = {
  gap: [5.0, 4.2, 3.5], // 패턴 사이 쉬는 시간 (페이즈별)
  angryEvery: 35, angryPow: 0.45, angryFast: 0.13, // 35초마다 화 +1: 패턴 피해 +45% · 간격 −13%
  first: 4, // 첫 패턴
  exp: 7, expLv: 0.55, // 레벨업 간격 (초) = 7 + 레벨×0.55 → 대략 웨이브 판과 비슷하게 합류 · 카드
  ult: 2.6, // 총공지 게이지 초당
  heal: 0.7, // 입구 수리 효과 (대마왕 한 방이 워낙 세서 수리로 끝없이 버티지 않게)
  dmgK: 1.3, // 대마왕이 받는 피해 배율 (진상 없이 혼자 다 맞으니까 — 한 판 피해를 예전 레이드와 비슷하게)
};
const VIS = 'boss_gapjil'; // 체력 · 상태만 빌린다 (그림은 raid2-ui 가 따로)

// 판 정의: 진상 없음 (웨이브는 18초마다 숫자만 넘어간다 → 증강 선택은 그대로)
export function waveDef(tier = 1) {
  const waves = [];
  for (let w = 1; w <= 12; w++) waves.push({ g: [], level: 6 + 1.6 * (w - 1), hpScale: 1, kind: 'R' });
  return { wi: 0, r2: true, waves, sec: R2.sec + 10, tier };
}

function bossDef() {
  return { id: 'raid2_body', cls: 'raid2', name: BOSS.name, gender: 'm', color: '#ff2d45', boss: true, hp: 1, speed: 0, atk: 0, atkInterval: 9, exp: 0, r: 84, size: 300, shouts: ['월세 내!', '계약 갱신 없다!', '보증금 못 돌려줘!'], img: '' };
}
// 판에 붙이기: o = { tier, rally: bool, hp, max } (hp · max: 서버 체력 → 시작 페이즈)
export function attach(g, o = {}) {
  const left = o.hp && Number.isFinite(o.hp.body) ? o.hp.body : 1, max = o.max && o.max.body > 0 ? o.max.body : 1;
  const r = g.r2 = {
    tier: Math.max(1, o.tier | 0 || 1), phase: Math.min(3, phaseAt(left, max)), buff: o.rally ? R2.rallyBuff : 0,
    dmg: { body: 0 }, parts: {}, act: null, nextT: TEMPO_R2.first, angry: 0, angryT: TEMPO_R2.angryEvery, last: '', finale: false,
    marks: [], cuts: 0, slams: 0, pats: {}, hits: {}, gate: { slam: 0, bill: 0, other: 0 },
    hitMul, onHit, tick,
  };
  r.pow0 = 1 + 0.15 * (r.tier - 1);
  if (g.raid) g.raid.sec = R2.sec + 10;
  if (g.mods) g.mods.healMul = (g.mods.healMul || 1) * TEMPO_R2.heal;
  const e = spawnEnemy(g, VIS, g.W / 2, g.ropeY - 150, { keep: true }); // 몸 가운데 (발은 입구 줄 조금 위)
  if (g.seen) delete g.seen[VIS];
  e.def = bossDef(); e.type = 'raid2_body'; e.r2 = 'body';
  e.maxHp = e.hp = 1e12; e.shield = 0; e.armor = 0; e.speed = e.baseSpeed = 0; e.atk = e.baseAtk = 0; e.bai = null;
  e.r = e.def.r; e.stopY = 1e6; e.ax = e.x; e.ay = e.y; e.lift = 0; e.lean = 0; e.cloak = false; e.unveiled = true; e.pShield = 0;
  r.parts.body = e;
  g.events.push({ type: 'r2Start', tier: r.tier, phase: r.phase });
  return r;
}
// 서버에서 페이즈가 바뀌었다는 걸 알게 됨 (다른 사람이 깎음) → 이 판도 그 페이즈로
export function setPhase(g, ph) {
  const r = g.r2;
  if (!r || g.over || !(ph > r.phase) || ph > 3) return false;
  r.phase = ph;
  g.events.push({ type: 'r2Phase', phase: ph });
  return true;
}
// (예전 이름 · 화면이 아직 부를 수 있게) 서버가 준 부위 목록 → 아무것도 안 떨어진다
export function syncParts() { return []; }

const boss = (g) => g.r2.parts.body;
const pow = (g) => g.r2.pow0 * (1 + TEMPO_R2.angryPow * g.r2.angry + 0.22 * g.r2.angry * g.r2.angry) * (g.r2.phase === 3 ? 1.15 : 1);
const alive = (g) => g.heroes.filter((h) => !h.gone && !h.def.summon);
function pickHeroes(g, n) {
  const hs = alive(g), out = [];
  let guard = 0;
  while (out.length < n && out.length < hs.length && guard++ < 40) { const h = hs[(g.rng() * hs.length) | 0]; if (!out.includes(h)) out.push(h); }
  return out;
}
function gateHit(g, frac, key) {
  const r = g.r2, b0 = g.base.hp;
  damageBase(g, g.base.max * frac * pow(g), boss(g));
  r.gate[key] = (r.gate[key] || 0) + (b0 - g.base.hp);
}

// 피해 배율 (sim damageEnemy 맨 앞) — 빈틈 ×1.5 는 sim 이 weakT 로 이미 준다
function hitMul(g, e, dmg) {
  return dmg * (1 + g.r2.buff) * TEMPO_R2.dmgK;
}
// 피해 기록 · 예고 중 스킬 → 끊기 · 붙잡기 중 스킬 → 손 놓기
function onHit(g, e, dmg, src) {
  const r = g.r2;
  r.dmg.body += dmg;
  if (g.raid) g.raid.dmg += dmg;
  if (src && src.id) r.hits[src.id] = (r.hits[src.id] || 0) + dmg;
  const a = r.act;
  if (!a || !g._inSkill) return;
  if (a.st === 'wind' && (a.k === 'slam' || a.k === 'sweep' || a.k === 'combo')) cut(g, '스킬로 끊었다!');
  else if (a.k === 'grab' && a.st === 'hold' && g.t - (a.lastHit || -9) > 0.25) { a.lastHit = g.t; if (++a.hits >= PAT.grab.hits) release(g, '스킬로 떼어냈다!'); }
}
function cut(g, why) {
  const r = g.r2, a = r.act, e = boss(g);
  r.act = null; r.cuts++;
  e.weakT = Math.max(e.weakT || 0, 4); e.lift = 0;
  g.ult = Math.min(RULES.ultMax, g.ult + 8);
  r.nextT = Math.max(r.nextT, 2.2);
  g.events.push({ type: 'r2Cut', k: a.k, x: a.x || e.x, y: e.y, text: why });
}
function release(g, why) {
  const r = g.r2, e = boss(g);
  r.act = null; r.cuts++;
  e.weakT = Math.max(e.weakT || 0, 3);
  r.nextT = Math.max(r.nextT, 2.5);
  g.events.push({ type: 'r2Release', x: e.x, y: e.y, text: why });
}
// 다음 패턴 고르기 (페이즈 · 바로 앞 패턴은 피해서)
function choose(g) {
  const r = g.r2, i = r.phase - 1;
  const list = PATTERNS.filter((p) => PAT[p.id].w[i] > 0 && p.id !== r.last);
  let sum = list.reduce((a, p) => a + PAT[p.id].w[i], 0), x = g.rng() * sum;
  for (const p of list) { x -= PAT[p.id].w[i]; if (x <= 0) return p.id; }
  return list[0].id;
}
const laneX = (g) => { const hs = alive(g); const h = hs.length ? hs[(g.rng() * hs.length) | 0] : null; return clamp(h ? h.x : 60 + g.rng() * (g.W - 120), PAT.slam.zone, g.W - PAT.slam.zone); };
function begin(g, k) {
  const r = g.r2, e = boss(g);
  r.last = k; r.pats[k] = (r.pats[k] || 0) + 1;
  const name = (PATTERNS.find((p) => p.id === k) || {}).name || '';
  if (k === 'slam' || k === 'combo') {
    const x = laneX(g);
    r.act = { k, st: 'wind', t: k === 'combo' ? PAT.combo.wind : r.phase === 3 ? PAT.slam.wind3 : PAT.slam.wind, x, n: k === 'combo' ? PAT.combo.n : 1 };
    g.events.push({ type: 'r2Wind', k, x, y: e.y, sec: r.act.t, zone: PAT.slam.zone, name });
  } else if (k === 'sweep') {
    const side = g.rng() < 0.5 ? -1 : 1;
    r.act = { k, st: 'wind', t: PAT.sweep.wind, side, x: g.W / 2 + side * g.W / 4 };
    g.events.push({ type: 'r2Wind', k, side, x: r.act.x, y: e.y, sec: PAT.sweep.wind, name });
  } else if (k === 'bills') {
    const n = PAT.bills.n[r.phase - 1];
    for (let j = 0; j < n; j++) r.marks.push({ k: 'bill', x: 30 + g.rng() * (g.W - 60), y: g.ropeY, t: PAT.bills.fly + j * PAT.bills.step, t0: PAT.bills.fly + j * PAT.bills.step });
    r.act = { k, st: 'throw', t: 0.9 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, n, name });
  } else if (k === 'seal') {
    const hit = [];
    for (const h of pickHeroes(g, PAT.seal.n)) { const sc = debuffSec(h, PAT.seal.sec); if (sc > 0) { h.silenceT = Math.max(h.silenceT || 0, sc); hit.push({ x: h.x, y: h.y }); } }
    r.act = { k, st: 'throw', t: 0.8 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, hits: hit, name });
  } else if (k === 'cash') {
    const hs = pickHeroes(g, PAT.cash.n[r.phase - 1]);
    for (const h of hs) r.marks.push({ k: 'cash', x: h.x, y: h.y, t: PAT.cash.fuse, t0: PAT.cash.fuse });
    r.act = { k, st: 'throw', t: 0.9 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, n: hs.length, name });
  } else if (k === 'grab') {
    r.act = { k, st: 'wind', t: PAT.grab.wind, x: g.W / 2, hits: 0 };
    g.events.push({ type: 'r2Wind', k, x: g.W / 2, y: e.y, sec: PAT.grab.wind, name });
  }
}
function land(g, a) {
  const r = g.r2, e = boss(g);
  if (a.k === 'slam' || a.k === 'combo') {
    r.slams++;
    gateHit(g, PAT.slam.pct * (a.k === 'combo' ? 0.7 : 1), 'slam');
    const hit = [];
    for (const h of g.heroes) if (!h.gone && Math.abs(h.x - a.x) <= PAT.slam.zone + 16) { const sc = debuffSec(h, PAT.slam.stun); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); hit.push({ x: h.x, y: h.y }); } }
    g.events.push({ type: 'r2Slam', k: a.k, x: a.x, y: g.ropeY, hits: hit });
    if (a.k === 'combo' && --a.n > 0) { const x = laneX(g); a.st = 'wind'; a.t = PAT.combo.wind * 0.85; a.x = x; a.chain = true; g.events.push({ type: 'r2Wind', k: 'combo', x, y: e.y, sec: a.t, zone: PAT.slam.zone, name: '분노 연타', chain: true }); return; }
    a.st = 'gap'; a.t = PAT.slam.gap; e.weakT = Math.max(e.weakT || 0, PAT.slam.gap);
    g.events.push({ type: 'r2Gap', x: e.x, y: e.y });
  } else if (a.k === 'sweep') {
    gateHit(g, PAT.sweep.pct, 'other');
    const hit = [];
    for (const h of g.heroes) if (!h.gone && (h.x - g.W / 2) * a.side >= -6) { const sc = debuffSec(h, PAT.sweep.stun); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); hit.push({ x: h.x, y: h.y }); } }
    g.events.push({ type: 'r2Sweep', side: a.side, x: a.x, y: g.rowY, hits: hit });
    a.st = 'gap'; a.t = PAT.sweep.gap; e.weakT = Math.max(e.weakT || 0, PAT.sweep.gap * 0.6);
  } else if (a.k === 'grab') {
    a.st = 'hold'; a.t = PAT.grab.hold; e.weakT = Math.max(e.weakT || 0, PAT.grab.hold);
    g.events.push({ type: 'r2Grab', x: e.x, y: g.ropeY, sec: PAT.grab.hold });
  }
}

// 매 프레임 (sim step · updateEnemies 바로 뒤)
function tick(g, dt) {
  const r = g.r2, e = boss(g);
  if (g.over || g.phase === 'victory' || !e) return;
  g.waveT = Math.min(g.waveT, 17.9 + (g.wave < 4 ? 1 : 0)); // 4웨이브(증강 3번)까지만 숫자를 넘긴다
  // 경험치 · 총공지 (진상이 없으니 시간으로)
  if (g.phase === 'wave' || g.phase === 'break') {
    gainExp(g, (g.need / (TEMPO_R2.exp + TEMPO_R2.expLv * g.level)) * dt);
    g.ult = Math.min(RULES.ultMax, g.ult + TEMPO_R2.ult * (g.mods.ultCharge || 1) * dt);
  }
  // 화 쌓기
  if ((r.angryT -= dt) <= 0) { r.angryT = TEMPO_R2.angryEvery; r.angry++; g.events.push({ type: 'r2Angry', n: r.angry, x: e.x, y: e.y }); }
  // 철거 (최대 시간)
  if (!r.finale && g.t >= R2.sec) {
    r.finale = true; r.act = null;
    g.events.push({ type: 'r2Final', x: e.x, y: g.ropeY });
    g.sigRevived = true; g.doorShield = 0;
    damageBase(g, g.base.max * 99, e);
    if (!g.over) { g.base.hp = 0; g.over = true; g.phase = 'over'; g.events.push({ type: 'gameover' }); }
    return;
  }
  // 몸: 좌우로 천천히 · 예고 땐 몸을 젖히고 · 내려찍은 뒤엔 앞으로 숙인다 (빈틈)
  const a = r.act;
  const wantLift = !a ? 0 : a.st === 'wind' ? (a.k === 'grab' ? 30 : -12) : a.st === 'down' ? 70 : a.k === 'grab' && a.st === 'hold' ? 92 : a.st === 'gap' ? 26 : 0;
  const wantLean = a && (a.k === 'slam' || a.k === 'combo') && a.x ? clamp((a.x - g.W / 2) * 0.5, -60, 60) : a && a.k === 'sweep' ? a.side * 40 : 0;
  e.lift += (wantLift - e.lift) * Math.min(1, dt * (a && a.st === 'down' ? 16 : 5));
  e.lean += (wantLean - e.lean) * Math.min(1, dt * 4);
  e.x = e.ax + e.lean + Math.sin(g.t * 0.5) * 18; e.y = e.ay + e.lift; e.kbv = 0; e.atRope = false;
  // 표시물 (고지서 · 돈다발)
  if (r.marks.length) {
    for (const m of r.marks) {
      if ((m.t -= dt) > 0) continue;
      m.done = true;
      if (m.k === 'bill') { const b0 = g.base.hp; damageBase(g, g.base.max * PAT.bills.pct * pow(g), e); r.gate.bill += b0 - g.base.hp; g.events.push({ type: 'r2Bill', x: m.x, y: m.y }); }
      else if (m.k === 'cash') {
        gateHit(g, PAT.cash.pct, 'other');
        const hit = [];
        for (const h of g.heroes) if (!h.gone && Math.hypot(h.x - m.x, h.y - m.y) <= PAT.cash.r) { const sc = debuffSec(h, PAT.cash.stun); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); hit.push({ x: h.x, y: h.y }); } }
        g.events.push({ type: 'r2Cash', x: m.x, y: m.y, hits: hit });
      }
      if (g.over) return;
    }
    r.marks = r.marks.filter((m) => !m.done);
  }
  if (g.phase !== 'wave' && g.phase !== 'break') return;
  // 패턴 진행
  if (!a) {
    if ((r.nextT -= dt) <= 0) begin(g, choose(g));
  } else if (a.st === 'wind') {
    if (e.stunT > 0 && a.k !== 'grab') cut(g, '기절시켜 끊었다!');
    else if ((a.t -= dt) <= 0) { if (a.k === 'grab') land(g, a); else { a.st = 'down'; a.t = 0.3; land(g, a); } }
  } else if (a.st === 'hold') {
    if (e.stunT > 0) release(g, '기절시켜 떼어냈다!');
    else { gateHit(g, PAT.grab.dps * dt, 'other'); if ((a.t -= dt) <= 0) { r.act = null; e.weakT = 0; } }
  } else if ((a.t -= dt) <= 0) r.act = null;
  if (!r.act && a) r.nextT = Math.max(r.nextT, TEMPO_R2.gap[r.phase - 1] / (1 + TEMPO_R2.angryFast * r.angry) * (0.85 + g.rng() * 0.3));
}
// 판 결과에 붙일 숫자 (서버로)
export function report(g) {
  const r = g.r2;
  if (!r) return null;
  const v = Math.floor(r.dmg.body || 0);
  return { parts: v > 0 ? { body: v } : {}, total: v, cuts: r.cuts, slams: r.slams, angry: r.angry, gate: { slam: Math.round(r.gate.slam), bill: Math.round(r.gate.bill), other: Math.round(r.gate.other || 0) } };
}
