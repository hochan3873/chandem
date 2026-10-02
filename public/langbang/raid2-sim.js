// 랑방 대전 — 건물주 레이드 전투 규칙 (DOM 없음 · Node 에서도 돈다)
//  sim.js 는 훅 세 줄만 (g.r2.hitMul · g.r2.onHit · g.r2.tick) — 나머지는 전부 여기
//  - 지금 드러난 부위(팔 1~4 / 팔 5~8 / 본체)가 입구 위에 손을 뻗고 있다 → 멤버들이 손을 때린다 (체력은 서버가 센다)
//  - 팔마다 패턴 하나 (확성기 = 스킬 봉인 · 고지서 = 입구 폭탄 · 술병 = 취객 소환 · 골프채 = 기절 · 계약서 = 보호막 · 열쇠 = 자리 잠금 · 명품백 = 게이지 슬쩍 · 휴대폰 = 알림 폭탄)
//  - 큰 내려찍기: 2.2초 예고(빨간 구역) → 입구에 큰 피해 + 구역 멤버 기절. 예고 중에 그 손에 스킬을 맞히거나 기절시키면 끊긴다 → 빈틈 (피해 ×1.5)
import { ENEMIES, RULES, stageWave } from './data.js';
import { spawnEnemy, damageBase, debuffSec } from './sim.js';
import { ARMS, armOf, R2, WEAK_MUL, CONTRACT_WEAK, CONTRACT_OTHER, partName, BOSS } from './raid2.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 팔 패턴 주기 (초) · 첫 사용
export const PAT = {
  mega: { every: 15, first: 7, sec: 3.5 },
  bill: { every: 14, first: 5, wind: 1.6, pct: 0.045 },
  bottle: { every: 10, first: 4, n: 4 },
  golf: { every: 13, first: 9, n: 2, sec: 2.2 },
  contract: { every: 13, first: 6, frac: 0.3 },
  keys: { every: 14, first: 8, sec: 4.5 },
  bag: { every: 12, first: 10, ult: 0.25, exp: 0.15 },
  phone: { every: 14, first: 6, sec: 5, cut: 0.25 },
  rage: { every: 7, first: 4 },
};
export const SLAM = { every: [17, 14, 11], first: 9, wind: 2.2, pct: 0.09, stun: 1.6, zone: 70, gap: 4, weak: 4 };
const VIS = 'boss_gapjil'; // 부위는 그릴 때 따로 그린다 (진상 그림은 안 씀) — 체력 · 상태만 빌린다

// 판마다 웨이브 (보스 없음 · 졸개만) — 26스테이지 진상을 40%쯤 (막 1-5를 깬 사람도 버티게) · 단계마다 단단해진다
export function waveDef(tier = 1) {
  const waves = [];
  const k = 1 + 0.2 * (Math.max(1, tier) - 1);
  for (let w = 1; w <= 9; w++) {
    const b = stageWave(26, 1 + ((w - 1) % 4));
    waves.push({ g: b.g.map(([t, c, e, d]) => [t, Math.max(1, Math.round(c * 0.42)), e, d]), level: 6 + 1.6 * (w - 1), hpScale: 1.2 * k });
  }
  return { wi: 0, r2: true, waves, sec: R2.sec };
}

// 부위 자리 (논리 좌표): 손은 입구 위 · 본체는 가운데
function anchors(g, list) {
  const n = list.length;
  const xs = n === 1 ? [180] : n === 2 ? [110, 250] : n === 3 ? [80, 180, 280] : [62, 138, 222, 298];
  return list.map((p, i) => (p === 'body' ? { x: 180, y: g.rowY - 250 } : { x: xs[i], y: g.rowY - 172 - (i % 2 ? 0 : 16) }));
}
function partDef(p) {
  const a = armOf(p);
  return { id: 'raid2_' + p, cls: 'raid2', name: p === 'body' ? BOSS.name : `${a.item} 팔`, gender: 'm', color: a ? a.color : '#ff2d45', boss: true, hp: 1, speed: 0, atk: 0, atkInterval: 9, exp: 0, r: p === 'body' ? 70 : 34, size: p === 'body' ? 220 : 110, shouts: ['월세 내!', '계약 갱신 없다!', '보증금 못 돌려줘!'], img: '' };
}
function addPart(g, p, at) {
  const e = spawnEnemy(g, VIS, at.x, at.y, { keep: true });
  if (g.seen && !g.r2.sawVis) delete g.seen[VIS];
  e.def = partDef(p); e.type = 'raid2_' + p; e.r2 = p;
  e.maxHp = e.hp = 1e12; e.shield = 0; e.armor = 0; e.speed = e.baseSpeed = 0; e.atk = e.baseAtk = 0; e.bai = null;
  e.r = e.def.r; e.stopY = 1e6; e.ax = at.x; e.ay = at.y; e.lift = 0; e.cloak = false; e.unveiled = true; e.pShield = 0;
  return e;
}

// 판에 붙이기: o = { tier, exposed: [부위], rally: bool, broken: { 부위: 닉 } }
export function attach(g, o = {}) {
  const r = g.r2 = {
    tier: Math.max(1, o.tier | 0 || 1), parts: {}, dmg: {}, exposed: (o.exposed || []).slice(), buff: o.rally ? R2.rallyBuff : 0,
    pat: {}, slam: null, slamT: SLAM.first, sawVis: !!(g.seen && g.seen[VIS]), rage: false, cuts: 0, slams: 0, hits: {}, gate: { slam: 0, bill: 0 },
    hitMul, onHit, tick,
  };
  r.pow = 1 + 0.15 * (r.tier - 1);
  spawnParts(g, r.exposed);
  g.events.push({ type: 'r2Start', parts: r.exposed.slice(), tier: r.tier });
  return r;
}
function spawnParts(g, list) {
  const r = g.r2;
  const at = anchors(g, list);
  list.forEach((p, i) => {
    if (r.parts[p]) return;
    r.parts[p] = addPart(g, p, at[i]);
    r.dmg[p] = r.dmg[p] || 0;
    const P = PAT[p === 'body' ? 'rage' : p];
    r.pat[p] = P.first + i * 1.7;
  });
  r.rage = list.includes('body');
}
// 다른 사람이 이 판 도중에 부위를 부숨 → 이 판에서도 떨어져 나간다 · 다음 부위가 드러나면 새로 붙는다
export function syncParts(g, exposedNow, by = {}) {
  const r = g.r2;
  if (!r || g.over) return [];
  const gone = [];
  for (const [p, e] of Object.entries(r.parts)) {
    if (exposedNow.includes(p) || e.dead) continue;
    e.dead = true; if (e.boss) g.bossAlive--;
    if (r.slam && r.slam.p === p) r.slam = null;
    gone.push(p);
    g.events.push({ type: 'r2Break', p, x: e.x, y: e.y, by: by[p] || '', remote: true });
  }
  for (const p of gone) delete r.parts[p];
  const fresh = exposedNow.filter((p) => !r.parts[p]);
  if (fresh.length && !Object.keys(r.parts).length) { spawnParts(g, fresh); g.events.push({ type: 'r2Phase', parts: fresh.slice() }); }
  r.exposed = exposedNow.slice();
  return gone;
}
const counter = (g, p) => { const a = armOf(p); return !!a && g.heroes.some((h) => !h.gone && a.weak.includes(h.id)); };
// 피해 배율 (sim damageEnemy 맨 앞)
function hitMul(g, e, dmg, src, aoe) {
  const r = g.r2, a = armOf(e.r2);
  let m = 1 + r.buff;
  if (a && src && src.id) {
    const w = a.weak.includes(src.id);
    if (a.id === 'contract') m *= w ? CONTRACT_WEAK : CONTRACT_OTHER;
    else if (w) m *= WEAK_MUL;
  }
  if (e.r2 === 'body' && !(e.weakT > 0)) m *= aoe ? 0.85 : 1; // 본체는 범위 공격이 조금 덜 먹힌다
  return dmg * m;
}
// 피해 기록 · 예고 중 스킬 · 기절 → 끊기
function onHit(g, e, dmg, src) {
  const r = g.r2;
  r.dmg[e.r2] = (r.dmg[e.r2] || 0) + dmg;
  if (g.raid) g.raid.dmg += dmg;
  if (src && src.id) r.hits[src.id] = (r.hits[src.id] || 0) + dmg;
  if (r.slam && r.slam.p === e.r2 && r.slam.st === 'wind' && g._inSkill) cutSlam(g, '스킬로 끊었다!');
}
function nextSlam(g) { const r = g.r2, n = Object.keys(r.parts).length; r.slamT = SLAM.every[r.rage ? 2 : n >= 3 ? 0 : 1] * (0.85 + g.rng() * 0.3); }
function cutSlam(g, why) {
  const r = g.r2, s = r.slam, e = r.parts[s.p];
  r.slam = null; r.cuts++; nextSlam(g);
  if (e) { e.weakT = Math.max(e.weakT || 0, SLAM.weak); e.lift = 0; }
  g.events.push({ type: 'r2Cut', p: s.p, x: e ? e.x : 180, y: e ? e.y : 200, text: why });
}
function pickHeroes(g, n, pref) {
  const hs = g.heroes.filter((h) => !h.gone && !h.def.summon);
  const out = [];
  const tank = hs.find((h) => h.def.taunt || (pref && pref.includes(h.id)));
  if (tank) out.push(tank);
  let guard = 0;
  while (out.length < n && out.length < hs.length && guard++ < 40) { const h = hs[(g.rng() * hs.length) | 0]; if (!out.includes(h)) out.push(h); }
  return out;
}
// 팔 패턴
function pattern(g, p, e) {
  const r = g.r2, half = counter(g, p) ? 0.5 : 1, pow = r.pow * half;
  const P = PAT[p];
  const out = { type: 'r2Pat', p, x: e.x, y: e.y, half: half < 1, name: (armOf(p) || {}).pat || '' };
  if (p === 'mega') { let n = 0; for (const h of g.heroes) { const sc = debuffSec(h, P.sec * pow); if (sc > 0) { h.silenceT = Math.max(h.silenceT || 0, sc); n++; } } out.n = n; }
  else if (p === 'bill') { r.bill = { t: P.wind, p }; out.wind = P.wind; }
  else if (p === 'bottle') { const n = Math.round(P.n * (half < 1 ? 0.5 : 1) * (1 + 0.25 * (r.tier - 1))); for (let k = 0; k < n; k++) if (ENEMIES.drunk) spawnEnemy(g, 'drunk', clamp(e.x + (k - (n - 1) / 2) * 30, 20, g.W - 20), e.y + 30); out.n = n; }
  else if (p === 'golf') { const hit = []; for (const h of pickHeroes(g, P.n, armOf('golf').weak)) { const sc = debuffSec(h, P.sec * pow); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); hit.push({ x: h.x, y: h.y }); } } out.hits = hit; }
  else if (p === 'contract') { let n = 0; for (const o of g.enemies) if (!o.dead && !o.r2) { o.shield = Math.max(o.shield, o.maxHp * P.frac * pow); n++; } out.n = n; }
  else if (p === 'keys') { const hs = g.heroes.filter((h) => !h.gone && !h.def.summon); if (hs.length) { const h = hs[(g.rng() * hs.length) | 0]; const sc = debuffSec(h, P.sec * pow); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); h.r2Lock = sc; out.hx = h.x; out.hy = h.y; out.sec = sc; } } }
  else if (p === 'bag') { const u = Math.min(g.ult, RULES.ultMax * P.ult * pow); g.ult -= u; const x = Math.floor(g.exp * P.exp * pow); g.exp -= x; out.ult = Math.round(u); out.exp = x; }
  else if (p === 'phone') { for (const h of g.heroes) { const sc = debuffSec(h, P.sec * pow, 'slow'); if (sc > 0) { h.flyerT = Math.max(h.flyerT || 0, sc); h.flyerCut = P.cut; } } out.sec = P.sec * pow; }
  else if (p === 'body') { const k = ['bill', 'bottle', 'golf', 'mega'][(r.rageN = (r.rageN | 0) + 1) % 4]; pattern(g, k, e); return; }
  g.events.push(out);
}
// 매 프레임 (sim step · updateEnemies 바로 뒤)
function tick(g, dt) {
  const r = g.r2;
  if (g.over || g.phase === 'victory') return;
  // 부위는 제자리 (밀려나도 다시) · 예고 땐 손을 들고 · 내려찍은 뒤엔 입구 가까이 (빈틈)
  for (const [p, e] of Object.entries(r.parts)) {
    if (e.dead) continue;
    const s = r.slam && r.slam.p === p ? r.slam : null;
    const want = s ? (s.st === 'wind' ? -40 : s.st === 'down' ? 86 : 0) : 0;
    e.lift += (want - e.lift) * Math.min(1, dt * (s && s.st === 'down' ? 18 : 5));
    e.x = e.ax; e.y = e.ay + e.lift; e.kbv = 0; e.atRope = false;
    if (g.phase === 'wave' || g.phase === 'break') {
      if ((r.pat[p] -= dt) <= 0) { r.pat[p] = PAT[p === 'body' ? 'rage' : p].every * (0.9 + g.rng() * 0.2); pattern(g, p, e); }
    }
  }
  // 고지서 폭탄 (예고 뒤 입구 피해)
  if (r.bill && (r.bill.t -= dt) <= 0) {
    const half = counter(g, 'bill') ? 0.6 : 1;
    const e = r.parts[r.bill.p] || Object.values(r.parts)[0];
    r.bill = null;
    if (e) { const b0 = g.base.hp; damageBase(g, g.base.max * PAT.bill.pct * r.pow * half, e); r.gate.bill += b0 - g.base.hp; g.events.push({ type: 'r2Bill', x: e.x, half: half < 1 }); }
  }
  // 큰 내려찍기
  const alive = Object.keys(r.parts).filter((p) => !r.parts[p].dead);
  if (!r.slam && alive.length && (r.slamT -= dt) <= 0) {
    const p = alive[(g.rng() * alive.length) | 0], e = r.parts[p];
    r.slam = { p, st: 'wind', t: SLAM.wind, x: e.x };
    g.events.push({ type: 'r2Wind', p, x: e.x, y: e.y, sec: SLAM.wind, zone: SLAM.zone, name: partName(p) });
  } else if (r.slam) {
    const s = r.slam, e = r.parts[s.p];
    if (!e || e.dead) r.slam = null;
    else if (s.st === 'wind') {
      if (e.stunT > 0) cutSlam(g, '기절시켜 끊었다!');
      else if ((s.t -= dt) <= 0) {
        s.st = 'down'; s.t = 0.35; r.slams++;
        const b0 = g.base.hp; damageBase(g, g.base.max * SLAM.pct * r.pow, e); r.gate.slam += b0 - g.base.hp;
        const hit = [];
        for (const h of g.heroes) if (!h.gone && Math.abs(h.x - s.x) <= SLAM.zone + 20) { const sc = debuffSec(h, SLAM.stun); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); hit.push({ x: h.x, y: h.y }); } }
        g.events.push({ type: 'r2Slam', p: s.p, x: s.x, y: g.ropeY, hits: hit });
      }
    } else if (s.st === 'down') { if ((s.t -= dt) <= 0) { s.st = 'gap'; s.t = SLAM.gap; e.weakT = Math.max(e.weakT || 0, SLAM.gap); g.events.push({ type: 'r2Gap', p: s.p, x: e.x, y: e.y }); } }
    else if ((s.t -= dt) <= 0) { r.slam = null; }
    if (!r.slam) nextSlam(g);
  }
  for (const h of g.heroes) if (h.r2Lock > 0) h.r2Lock -= dt;
}
// 판 결과에 붙일 숫자 (서버로)
export function report(g) {
  const r = g.r2;
  if (!r) return null;
  const parts = {};
  for (const [p, v] of Object.entries(r.dmg)) if (v > 0) parts[p] = Math.floor(v);
  return { parts, total: Object.values(parts).reduce((a, b) => a + b, 0), cuts: r.cuts, slams: r.slams, gate: { slam: Math.round(r.gate.slam), bill: Math.round(r.gate.bill) } };
}
