// 랑방 대전 — 진상의 탑 리메이크 (10/07): 멤버 3명 · 끌어서 자리 옮기기 · 바닥 예고 피하기 · 탑 전용 체력 · 상태이상 저항 · 기 모으기 끊기
//  DOM 없음 (Node 에서도 돈다 — scripts/lb-tower-sim.js 가 그대로 쓴다)
//  sim.js 는 훅 한 줄 (g.twa.tick) — 나머지는 전부 여기
//  - 멤버는 영웅 줄 앞 띠(입구 줄 위 ~ 영웅 줄) 안에서 끌어 옮긴다 · 걸어가는 데 시간이 걸린다 (바로 순간이동 아님)
//  - 진상이 바닥에 경고 모양(원 · 세로 줄 · 가로 띠 · 부채꼴 · 십자 · 고리)을 띄우고, 시간이 다 차면 터진다 → 안에 있던 멤버는 피해 + 상태이상 (기절은 2~3초 넘게)
//  - 탑 안에서만 멤버마다 체력 (= 쓰러짐 게이지 크기 × 10: 탱커는 크고 딜러는 작다) · 0이면 쓰러짐 → 10초 뒤 일어남 (건전녀가 있으면 빨리) · 모두 쓰러지면 실패
//  - 상태이상 저항: data.js HERO_RES (+ 서포터 팀 면역 KD_SUP) 에 탑 전용 저항(감전 · 넉백 등)을 더한다 → 층에 맞는 멤버를 고르는 맛
//  - 감전: 맞은 멤버 곁(88)으로 번진다 → 흩어져야 / 기 모으기(51층~): 진상이 크게 기를 모으면 안전한 곳으로 모이거나, 기절 · 빙결 · 큰 피해로 끊는다
import { HEROES, HERO_RES, KD_HERO, KD_SUP } from './data.js';
import * as S from './sim.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * clamp(k, 0, 1);

// ─── 숫자 ───
export const SQUAD = { max: 3, hp: [1, 1.75, 2.35], fat: [1, 0.6, 0.45] }; // 데려간 수에 따라: 진상 체력 배율 · 멤버 한 명당 피로 배율
export const ARENA = {
  move: 125, slow: 0.45, charm: 70, // 걷는 속도 (초당) · 감속 중 × · 홀림에 끌려가는 속도
  up: 80, down: 10, side: 22, // 움직일 수 있는 띠: 입구 줄(ropeY) 위 80 ~ 영웅 줄(rowY) 아래 10 · 양옆 22
  hpK: 10, // 체력 = 쓰러짐 게이지 크기(sim kdMax) × 10
  regen: { wait: 4, per: 0.008 }, // 마지막으로 맞고 4초 뒤부터 초당 최대 체력 0.8%
  down: { sec: 10, back: 0.35, grace: 2, quick: 0.6 }, // 쓰러짐 10초 → 체력 35% 로 일어남 · 2초 무적 · 건전녀가 있으면 ×0.6
  heal: { gunnyeo: 0.025, jungmin: 0.008, firstaid: 0.35, bandage: 0.15 }, // 건전녀: 가장 아픈 멤버 초당 2.5% · 홍정민: 모두 초당 0.8% · 스킬 쓰면 모두 회복
  guard: { bangjang: 0.15 }, // 방장 지휘: 받는 피해 −15%
  shock: { r: 88, k: 0.7, depth: 2 }, // 감전: 곁 88 안 멤버로 번진다 (번질 때마다 ×0.7 · 두 번까지)
  knock: { d: 70, stun: 0.6 }, // 넉백: 70 밀려나고 0.6초 휘청
  pool: { sec: 5, tick: 0.5, poison: 2.5 }, // 독 웅덩이: 5초 · 밟으면 독
  poison: 0.12, // 독: 초당 기준 피해 × 0.12
  dmg0: 120, dmgGrow: 0.035, // 기준 피해 = 120 × (1 + 0.035 × (층 − 1))
};
// 위험 종류 (경고 모양 · 색 · 상태이상) — cc: 층 기절 시간 대비 배율 · dmg: 기준 피해 대비
export const HZ = {
  hit: { id: 'hit', name: '충격', color: '#ff9a3c', shapes: ['circle', 'line'], dmg: 0.6, cc: 0, desc: '피해만 — 끌어서 옮겨 보세요' },
  stun: { id: 'stun', name: '기절', color: '#ffd23f', shapes: ['circle', 'cross', 'line'], dmg: 0.8, cc: 1, desc: '맞으면 한참 기절 (공격 · 이동 못 함)' },
  shock: { id: 'shock', name: '감전', color: '#5ff2ff', shapes: ['circle', 'line'], dmg: 0.7, cc: 0.65, desc: '맞으면 곁 멤버에게 번진다 — 흩어져요' },
  freeze: { id: 'freeze', name: '빙결', color: '#a8e4ff', shapes: ['ring', 'band'], dmg: 0.6, cc: 1.1, desc: '얼어붙어 꼼짝 못 함 · 고리는 안쪽이 안전' },
  poison: { id: 'poison', name: '독', color: '#7be36a', shapes: ['circle'], dmg: 0.4, cc: 0, desc: '독 웅덩이가 남는다 · 체력이 계속 깎임' },
  charm: { id: 'charm', name: '홀림', color: '#ff6fd0', shapes: ['cone'], dmg: 0.3, cc: 0.9, desc: '진상 쪽으로 끌려간다 (조종 불가)' },
  silence: { id: 'silence', name: '침묵', color: '#b9a6ff', shapes: ['line', 'band'], dmg: 0.6, cc: 1.8, desc: '스킬을 못 쓴다' },
  knock: { id: 'knock', name: '넉백', color: '#ff7a5a', shapes: ['band', 'circle'], dmg: 0.8, cc: 0, desc: '멀리 밀려나 휘청 — 다른 경고 위로 밀릴 수도' },
  slow: { id: 'slow', name: '감속', color: '#7aa8ff', shapes: ['circle'], dmg: 0.4, cc: 1.6, desc: '걸음 · 공격이 느려진다' },
};
export const HZ_IDS = ['stun', 'shock', 'freeze', 'poison', 'charm', 'silence', 'knock', 'slow']; // 31층부터 층마다 돌아가며
// 모양 크기 (원은 원근 때문에 위아래로 납작: ry = r × 0.62)
export const SHAPE = { circle: 44, big: 60, line: 24, band: 20, cross: 22, ring: [40, 112], cone: [0.36, 420], flat: 0.62 };
// 탑 전용 저항 (HERO_RES 에 없는 것만 더한다 · %) — 성격대로: 서명훈 욕 번개 = 감전에 강함 · 정섭 벽 = 안 밀림 …
export const TW_RES = {
  myunghoon: { shock: 70 }, donghan: { shock: 50 }, hochan: { shock: 50, knock: 40 }, gunman: { shock: 40 }, staff: { shock: 40, silence: 30 }, junseo: { shock: 30, charm: 40 },
  jeongseob: { knock: 80 }, wonsik: { knock: 70 }, hyungyeong: { knock: 70, poison: 40 }, ingyu: { knock: 60 }, ara: { knock: 50, stun: 30 }, baul: { knock: 30 },
  eunok: { freeze: 50, poison: 50 }, jieun: { freeze: 40, slow: 40 }, dragon: { shock: 30 },
  jiwon: { silence: 50 }, bangjang: { silence: 40 }, dohoon: { silence: 40 }, gunnyeo: { poison: 30, silence: 30 },
  youngjun: { poison: 40 }, sanghwa: { charm: 50 }, jungmin: { stun: 30 }, soyoung: { slow: 30 }, sunggu: { freeze: 30 }, byunghwa: { shock: 30 }, hanna: { slow: 30 }, subin: { freeze: 30 },
};
// 멤버 저항 % (화면 · 추천용: 본인 것만 · 팀 면역은 따로)
export function resOf(id, kind) { return Math.min(100, ((HERO_RES[id] || {})[kind] || 0) + ((TW_RES[id] || {})[kind] || 0)); }
// 팀 면역 · 반감 (덱에 있으면 모두) — KD_SUP.res
export function teamRes(kind) { const out = []; for (const [id, s] of Object.entries(KD_SUP)) if (s.res && s.res[kind]) out.push({ id, v: s.res[kind] }); return out; }

// ─── 층 설계 ───
//  1~3 연습 (예고 없음) · 4~10 피해만 (가만히 있어도 이김 · 끌어 옮기기 배우기) · 11~30 기절 예고 (피하기 배우기)
//  31~50 층마다 위험 하나 (저항 멤버가 편함) · 51~80 위험 둘 + 기 모으기 끊기 · 81~ 위험 셋 + 짧은 예고 (랭킹)
export function floorPlan(f) {
  f = Math.max(1, Math.floor(f) || 1);
  const tier = f <= 3 ? 0 : f <= 10 ? 1 : f <= 30 ? 2 : f <= 50 ? 3 : f <= 80 ? 4 : 5;
  let kinds = [], warn = 2.6, every = 99, multi = 0, cc = 0, wind = null;
  if (tier === 1) { kinds = ['hit']; warn = 2.6; every = 7; }
  else if (tier === 2) { const k = (f - 11) / 19; kinds = f >= 21 ? ['stun', f % 2 ? 'knock' : 'slow'] : ['stun']; warn = lerp(2.1, 1.6, k); every = lerp(6, 4.6, k); cc = lerp(2.2, 2.5, k); }
  else if (tier === 3) { const k = (f - 31) / 19; kinds = [HZ_IDS[(f - 31) % 8]]; warn = lerp(1.6, 1.3, k); every = lerp(4.6, 3.9, k); cc = lerp(2.6, 2.9, k); }
  else if (tier === 4) { const k = (f - 51) / 29, i = (f - 51) % 8; kinds = [HZ_IDS[i], HZ_IDS[(i + 3) % 8]]; warn = lerp(1.3, 1.05, k); every = lerp(3.8, 3.1, k); multi = lerp(0.15, 0.3, k); cc = lerp(2.9, 3.2, k); wind = { every: lerp(17, 13, k), dur: lerp(3.4, 2.9, k), safe: 50, cut: 0.07, dmg: 2.2, stun: 3.5 }; }
  else if (tier === 5) { const k = Math.min(1, (f - 81) / 19), i = (f - 81) % 8; kinds = [HZ_IDS[i], HZ_IDS[(i + 3) % 8], HZ_IDS[(i + 5) % 8]]; warn = lerp(1.0, 0.8, k); every = lerp(3.0, 2.5, k); multi = lerp(0.35, 0.5, k); cc = lerp(3.2, 3.6, k); wind = { every: lerp(12.5, 10, k), dur: lerp(2.8, 2.4, k), safe: 46, cut: 0.08, dmg: 2.6, stun: 4 }; }
  if (wind && f % 5 === 0) { wind.every *= 0.8; wind.cut *= 0.7; } // 보스 층: 더 자주 · 보스는 끊기가 어렵다 (최대 체력 대비)
  return { f, tier, kinds, warn: +warn.toFixed(2), every: +every.toFixed(2), multi: +multi.toFixed(2), cc: +cc.toFixed(2), dmg: Math.round(ARENA.dmg0 * (1 + ARENA.dmgGrow * (f - 1))), wind };
}
export const TIER_TXT = ['연습 층 · 예고 없음', '튜토리얼 · 바닥 경고는 피해만 (멤버를 끌어 옮겨 보세요)', '예고 층 · 맞으면 한참 기절 — 피하세요', '위험 층 · 이 층의 위험에 강한 멤버가 편해요', '위험 둘 + 기 모으기 (안전한 곳으로 모이거나 기절 · 큰 피해로 끊기)', '지옥 · 위험 셋 · 짧은 예고 (랭킹)'];
// 이 층에 추천하는 멤버 (가진 멤버 중): 위험마다 저항 합 + 팀 면역 서포터 + 회복
export function recommend(f, owned, n = 3) {
  const p = floorPlan(f);
  const cc = p.kinds.filter((k) => k !== 'hit');
  const score = (id) => {
    let s = 0;
    for (const k of cc) { s += resOf(id, k); const sup = KD_SUP[id]; if (sup && sup.res && sup.res[k]) s += 60; }
    if (KD_SUP[id] && KD_SUP[id].heal) s += 25; // 회복은 어디서나
    return s + (KD_HERO[id] || 1) * 8; // 단단할수록 조금
  };
  return owned.filter((id) => HEROES[id]).map((id) => ({ id, s: score(id) })).filter((x) => x.s > 20).sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.id);
}

// ─── 체력 ───
export function hpMaxOf(h) { return Math.round(S.kdMax(h) * ARENA.hpK * (1 + ((h.gear && h.gear.hp) || 0)) * ((h._g && h._g.tower && h._g.tower.fatK) || 1)); }
// 로비 미리보기 (전투 밖): 레벨 1 기준
export function hpPreview(id, meta = 0, star = 1, gear = {}) { return Math.round(100 * (KD_HERO[id] || 1) * (1 + 0.025 * meta) * (1 + 0.08 * (star - 1)) * (1 + (gear.res || 0)) * ARENA.hpK * (1 + (gear.hp || 0))); }

// ─── 붙이기: createGame 뒤에 (game.js · 시뮬 스크립트) ───
//  o: { squad: [멤버 id …] (첫째는 이미 덱에 있음), plan: floorPlan(f) }
export function attach(g, o = {}) {
  if (!g.tower) return null;
  const plan = o.plan || floorPlan(g.tower.f);
  const squad = (o.squad || []).filter((id, i, a) => HEROES[id] && a.indexOf(id) === i).slice(0, SQUAD.max);
  g.maxHeroes = Math.max(1, squad.length);
  const slots = [2, 3, 1];
  squad.forEach((id, i) => { if (!S.hasHero(g, id)) S.addHero(g, id, slots[i] !== undefined ? slots[i] : undefined); });
  const n = g.heroes.filter((h) => !h.def.summon).length;
  // 데려간 수만큼 진상이 단단 (혼자 탑에 맞춘 체력 기준)
  const hk = SQUAD.hp[Math.max(0, Math.min(SQUAD.hp.length, n) - 1)] || 1;
  for (const w of g.tower.def.waves) w.hpScale *= hk;
  if (g.hpScale && g.wave >= 1) g.hpScale *= hk;
  g.tower.curse = false; // 예전 저주(무작위 상태이상)는 바닥 예고로 바뀌었다
  const A = {
    plan, n, tele: [], pools: [], wind: null, nextT: plan.tier >= 1 ? 3.5 : 1e9, windT: plan.wind ? plan.wind.every * 0.7 : 1e9, seq: 0,
    drag: null, stat: { tele: 0, hit: 0, dodge: 0, cut: 0, wind: 0, down: 0, shock: 0, heal: 0 },
    tick: (gg, dt) => tick(gg, dt),
  };
  g.twa = A;
  for (const h of members(g)) { h.twMax = hpMaxOf(h); h.twHp = h.twMax; h.twHitT = -9; h.twDown = 0; h.twTo = null; h.twCd0 = h.skillCd; h.homeX = h.x; h.homeY = h.y; }
  return A;
}
export const members = (g) => g.heroes.filter((h) => !h.def.summon && !h.gone);
const alive = (h) => !(h.twDown > 0);
export function zoneOf(g) { return { x0: ARENA.side, x1: g.W - ARENA.side, y0: g.ropeY - ARENA.up, y1: g.rowY + ARENA.down }; }
const inZone = (g, x, y) => { const z = zoneOf(g); return { x: clamp(x, z.x0, z.x1), y: clamp(y, z.y0, z.y1) }; };

// 손가락으로 옮기기: 그 자리까지 걸어간다 (기절 · 빙결 · 쓰러짐 중엔 못 움직이고 풀리면 이어서)
export function moveTo(g, h, x, y) {
  if (!g.twa || !h || h.def.summon || !Number.isFinite(x) || !Number.isFinite(y)) return false;
  const p = inZone(g, x, y);
  h.twTo = p;
  g.events.push({ type: 'twaMove', hero: h.id, x: p.x, y: p.y });
  return true;
}
const canMove = (h) => alive(h) && !(h.stunT > 0) && !(h.freezeT > 0) && !(h.charmT > 0) && !h.out && !(h.twKbT > 0);

// ─── 모양 ───
// s: { shape, x, y, r, w, h, ang, sp, len, r1, r2 } — 발 위치(px, py)가 안에 있나
export function inShape(s, px, py, g) {
  const F = SHAPE.flat;
  switch (s.shape) {
    case 'circle': { const dx = (px - s.x) / s.r, dy = (py - s.y) / (s.r * F); return dx * dx + dy * dy <= 1; }
    case 'ring': { const dx = px - s.x, dy = (py - s.y) / F, d = Math.hypot(dx, dy); return d >= s.r1 && d <= s.r2; }
    case 'line': return Math.abs(px - s.x) <= s.w;
    case 'band': return Math.abs(py - s.y) <= s.h;
    case 'cross': return Math.abs(px - s.x) <= s.w || Math.abs(py - s.y) <= s.w;
    case 'cone': { const dx = px - s.x, dy = py - s.y, d = Math.hypot(dx, dy); if (d > s.len || d < 1) return d < 1; let a = Math.atan2(dy, dx) - s.ang; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return Math.abs(a) <= s.sp; }
    case 'quake': { if (g) { const z = zoneOf(g); if (px < z.x0 - 30 || px > z.x1 + 30) return false; } const dx = (px - s.x) / s.r, dy = (py - s.y) / (s.r * F); return dx * dx + dy * dy > 1; } // 기 모으기: 안전한 원 밖은 전부
    default: return false;
  }
}

// ─── 예고 만들기 ───
function rnd(g) { return g.rng(); }
function pickTarget(g) {
  const list = members(g).filter(alive);
  if (!list.length) return null;
  const busy = new Set(g.twa.tele.map((s) => s.tgt));
  const free = list.filter((h) => !busy.has(h.id));
  const pool = free.length ? free : list;
  return pool[(rnd(g) * pool.length) | 0];
}
function caster(g) {
  const es = g.enemies.filter((e) => !e.dead && e.y > 30 && e.y < g.ropeY + 10);
  if (!es.length) return null;
  return es[(rnd(g) * es.length) | 0];
}
export function spawnTele(g, kind, tgt) {
  const A = g.twa, P = A.plan, H = HZ[kind] || HZ.hit;
  const h = tgt || pickTarget(g);
  if (!h) return null;
  const shape = H.shapes[(rnd(g) * H.shapes.length) | 0];
  const jit = () => (rnd(g) - 0.5) * 16;
  const s = { id: ++A.seq, kind, shape, t: 0, warn: P.warn * (shape === 'ring' || shape === 'band' ? 1.1 : 1), tgt: h.id, x: h.x + jit(), y: h.y + jit() * 0.5 };
  const z = zoneOf(g);
  if (shape === 'circle') s.r = kind === 'slow' || kind === 'knock' ? SHAPE.big : SHAPE.circle;
  else if (shape === 'line') s.w = SHAPE.line;
  else if (shape === 'band') { s.h = SHAPE.band; s.y = clamp(s.y, z.y0 + 6, z.y1 - 6); }
  else if (shape === 'cross') s.w = SHAPE.cross;
  else if (shape === 'ring') { const ms = members(g).filter(alive); s.x = ms.reduce((a, o) => a + o.x, 0) / ms.length; s.y = ms.reduce((a, o) => a + o.y, 0) / ms.length; s.r1 = SHAPE.ring[0]; s.r2 = SHAPE.ring[1]; }
  else if (shape === 'cone') {
    const e = caster(g);
    s.x = e ? e.x : clamp(h.x + (rnd(g) - 0.5) * 120, 40, g.W - 40); s.y = e ? e.y : z.y0 - 140;
    s.ang = Math.atan2(h.y - s.y, h.x - s.x); s.sp = SHAPE.cone[0] * 0.5; s.len = Math.hypot(h.x - s.x, h.y - s.y) + 120; s.from = e ? e.uid : 0;
  }
  const src = caster(g); if (src && shape !== 'cone') { s.ex = src.x; s.ey = src.y - src.def.size * 0.5; }
  A.tele.push(s); A.stat.tele++;
  g.events.push({ type: 'twaWarn', kind, shape, x: s.x, y: s.y, id: s.id });
  return s;
}
function startWind(g) {
  const A = g.twa, W = A.plan.wind;
  const es = g.enemies.filter((e) => !e.dead && e.y > 30 && e.y < g.ropeY + 10);
  if (!es.length) return false;
  const e = es.find((x) => x.boss) || es.find((x) => x.titan || x.elite) || es.reduce((a, b) => (b.maxHp > a.maxHp ? b : a));
  const z = zoneOf(g);
  const sx = lerp(z.x0 + W.safe, z.x1 - W.safe, rnd(g)), sy = lerp(z.y0 + 20, z.y1 - 10, rnd(g));
  A.wind = { e, t: 0, dur: W.dur, hp0: e.hp, need: e.maxHp * W.cut * (e.boss ? 0.6 : 1), shape: 'quake', x: sx, y: sy, r: W.safe, kind: A.plan.kinds[(rnd(g) * A.plan.kinds.length) | 0] };
  A.stat.wind++;
  g.events.push({ type: 'twaWind', x: e.x, y: e.y - e.def.size * 0.6, sx, sy, r: W.safe, dur: W.dur, name: e.def.name });
  return true;
}

// ─── 맞히기 ───
function hurt(g, h, v, why) {
  if (!alive(h) || h.twGrace > 0 || !(v > 0)) return 0;
  if (members(g).some((o) => o.id === 'bangjang' && alive(o))) v *= 1 - ARENA.guard.bangjang;
  h.twHp -= v; h.twHitT = g.t;
  if (h.twHp <= 0) {
    h.twHp = 0; h.twDown = ARENA.down.sec * (members(g).some((o) => o.id === 'gunnyeo' && o !== h && alive(o)) ? ARENA.down.quick : 1); h.twTo = null;
    g.twa.stat.down++;
    g.events.push({ type: 'twaDown', hero: h.id, x: h.x, y: h.y, sec: h.twDown, why });
  }
  return v;
}
// 상태이상 (sim 의 저항 · 면역 계산 debuffSec + 탑 전용 저항)
function ccSec(h, sec, kind) {
  const base = kind === 'shock' || kind === 'knock' ? 'none' : kind;
  let s = S.debuffSec(h, sec, base);
  const ex = (TW_RES[h.id] || {})[kind] || 0;
  if (ex) s *= 1 - ex / 100;
  return s;
}
function afflict(g, h, kind, s, P, k = 1) {
  const H = HZ[kind];
  if (!alive(h)) return;
  hurt(g, h, P.dmg * H.dmg * k, kind);
  if (!alive(h)) return;
  const sec = P.cc * H.cc * k;
  let got = 0;
  if (kind === 'stun' || kind === 'shock') { got = ccSec(h, Math.max(1.2, sec), kind); if (got > 0) { h.stunT = Math.max(h.stunT, got); if (kind === 'shock') h.twShockT = Math.max(h.twShockT || 0, got); h.twTo = null; } }
  else if (kind === 'freeze') { got = ccSec(h, Math.max(1.4, sec), 'freeze'); if (got > 0) { h.stunT = Math.max(h.stunT, got); h.freezeT = Math.max(h.freezeT || 0, got); h.twTo = null; } }
  else if (kind === 'silence') { got = ccSec(h, Math.max(3, sec), 'silence'); if (got > 0) h.silenceT = Math.max(h.silenceT || 0, got); }
  else if (kind === 'slow') { got = ccSec(h, Math.max(3, sec), 'slow'); if (got > 0) { h.twSlowT = Math.max(h.twSlowT || 0, got); h.aspdDebT = Math.max(h.aspdDebT || 0, got); h.aspdDebCut = 0.3; } }
  else if (kind === 'charm') { got = ccSec(h, Math.max(1.5, sec), 'charm'); if (got > 0) { h.charmT = Math.max(h.charmT, got); h.twCharm = { x: s.x, y: s.y }; h.twTo = null; } }
  else if (kind === 'poison') { got = S.poisonHero(g, h, 5); }
  else if (kind === 'knock') {
    const r = 1 - ccSec(h, 1, 'knock'); // 저항만큼 덜 밀림
    const d = ARENA.knock.d * (1 - r);
    let dx = h.x - s.x, dy = h.y - s.y;
    if (s.shape === 'band') { dx = 0; dy = h.y >= s.y ? 1 : -1; } else if (s.shape === 'line') { dx = h.x >= s.x ? 1 : -1; dy = 0; }
    const L = Math.hypot(dx, dy) || 1;
    if (d > 2) { h.twKb = { x: h.x + (dx / L) * d, y: h.y + (dy / L) * d * 0.7 }; h.twKbT = ARENA.knock.stun * (1 - r); h.twTo = null; got = d; }
  }
  g.events.push({ type: 'twaHit', kind, hero: h.id, x: h.x, y: h.y, sec: +got.toFixed(2), res: got <= 0 && kind !== 'hit' && kind !== 'poison' });
}
function resolve(g, s) {
  const A = g.twa, P = A.plan;
  const hitL = [], dodged = [];
  for (const h of members(g)) {
    if (!alive(h)) continue;
    if (inShape(s, h.x, h.y, g)) hitL.push(h);
    else if (s.tgt === h.id) dodged.push(h);
  }
  g.events.push({ type: 'twaBoom', kind: s.kind, shape: s.shape, x: s.x, y: s.y, r: s.r, w: s.w, h: s.h, r1: s.r1, r2: s.r2, ang: s.ang, sp: s.sp, len: s.len, n: hitL.length });
  for (const h of dodged) { A.stat.dodge++; g.events.push({ type: 'twaDodge', hero: h.id, x: h.x, y: h.y }); }
  for (const h of hitL) { A.stat.hit++; afflict(g, h, s.kind, s, P); }
  if (s.kind === 'shock') { // 번개가 곁 멤버로 번진다
    let wave = hitL.slice(), seen = new Set(hitL.map((h) => h.id)), k = 1;
    for (let d = 0; d < ARENA.shock.depth && wave.length; d++) {
      k *= ARENA.shock.k;
      const next = [];
      for (const a of wave) for (const b of members(g)) {
        if (seen.has(b.id) || !alive(b) || Math.hypot(b.x - a.x, (b.y - a.y) / SHAPE.flat) > ARENA.shock.r) continue;
        seen.add(b.id); next.push(b); A.stat.shock++;
        g.events.push({ type: 'twaChain', from: a.id, hero: b.id, x0: a.x, y0: a.y, x1: b.x, y1: b.y });
        afflict(g, b, 'shock', s, P, k);
      }
      wave = next;
    }
  }
  if (s.kind === 'poison') A.pools.push({ x: s.x, y: s.y, r: s.r || SHAPE.circle, t: ARENA.pool.sec, tick: 0 });
}
function windEnd(g, ok) {
  const A = g.twa, W = A.wind, P = A.plan;
  A.wind = null;
  if (!ok) { // 끊었다 → 빈틈
    A.stat.cut++;
    if (!W.e.dead) { W.e.weakT = Math.max(W.e.weakT || 0, 3); W.e.stunT = Math.max(W.e.stunT || 0, 1.2); }
    g.events.push({ type: 'twaCut', x: W.e.x, y: W.e.y - W.e.def.size * 0.6 });
    A.windT = Math.max(A.windT, 4);
    return;
  }
  const s = { shape: 'quake', x: W.x, y: W.y, r: W.r, kind: W.kind };
  g.events.push({ type: 'twaQuake', x: W.x, y: W.y, r: W.r, kind: W.kind });
  for (const h of members(g)) {
    if (!alive(h) || !inShape(s, h.x, h.y, g)) continue;
    A.stat.hit++;
    hurt(g, h, P.dmg * P.wind.dmg, 'wind');
    if (!alive(h)) continue;
    const got = ccSec(h, P.wind.stun, 'stun');
    if (got > 0) { h.stunT = Math.max(h.stunT, got); h.twTo = null; }
    if (W.kind && W.kind !== 'stun') afflict(g, h, W.kind, s, P, 0.5);
    g.events.push({ type: 'twaHit', kind: 'wind', hero: h.id, x: h.x, y: h.y, sec: +got.toFixed(2) });
  }
}

// ─── 매 스텝 ───
function tick(g, dt) {
  const A = g.twa;
  if (!A || g.over || g.phase === 'victory') return;
  const ms = members(g);
  // 체력 최대치 (레벨업 카드로 Lv 이 오르면 비율 그대로 늘어난다)
  for (const h of ms) {
    if (h.twMax === undefined) { h.twMax = hpMaxOf(h); h.twHp = h.twMax; h.twDown = 0; h.twCd0 = h.skillCd; }
    const mx = hpMaxOf(h); if (mx !== h.twMax) { h.twHp *= mx / h.twMax; h.twMax = mx; }
    if (h.twGrace > 0) h.twGrace -= dt;
    if (h.twSlowT > 0) h.twSlowT -= dt;
    if (h.twShockT > 0) h.twShockT -= dt;
    if (h.twDown > 0) { // 쓰러짐: 누워 있는 동안 아무것도 못 함
      h.twDown -= dt; h.stunT = Math.max(h.stunT, 0.1); h.silenceT = Math.max(h.silenceT || 0, 0.1);
      if (h.twDown <= 0) { h.twDown = 0; h.stunT = 0; h.silenceT = 0; h.twHp = h.twMax * ARENA.down.back; h.twGrace = ARENA.down.grace; g.events.push({ type: 'twaUp', hero: h.id, x: h.x, y: h.y }); }
      continue;
    }
    // 독: 체력이 계속 깎인다
    if (h.poisonT > 0) hurt(g, h, A.plan.dmg * ARENA.poison * dt, 'poison');
    // 저절로 회복 (맞지 않은 지 잠깐 지나면)
    if (g.t - h.twHitT > ARENA.regen.wait && h.twHp < h.twMax) h.twHp = Math.min(h.twMax, h.twHp + h.twMax * ARENA.regen.per * dt);
  }
  // 모두 쓰러지면 실패
  if (ms.length && ms.every((h) => !alive(h))) {
    g.base.hp = 0; g.over = true; g.phase = 'over';
    g.events.push({ type: 'twaWipe' }); g.events.push({ type: 'gameover', wipe: true });
    return;
  }
  heal(g, ms, dt);
  // 움직이기 (넉백 · 홀림 · 손가락)
  for (const h of ms) {
    if (!alive(h)) continue;
    let tx = null, ty = null, sp = ARENA.move;
    if (h.twKbT > 0) { h.twKbT -= dt; if (h.twKb) { tx = h.twKb.x; ty = h.twKb.y; sp = 420; } }
    else if (h.charmT > 0 && h.twCharm) { tx = h.twCharm.x; ty = h.twCharm.y; sp = ARENA.charm; }
    else if (h.twTo && canMove(h)) { tx = h.twTo.x; ty = h.twTo.y; if (h.twSlowT > 0) sp *= ARENA.slow; }
    if (tx === null) continue;
    const p = inZone(g, tx, ty), dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy), st = sp * dt;
    if (d <= st) { h.x = p.x; h.y = p.y; if (h.twTo && !(h.twKbT > 0) && !(h.charmT > 0)) h.twTo = null; if (h.twKbT > 0) h.twKb = null; }
    else { h.x += (dx / d) * st; h.y += (dy / d) * st; }
    if (!h.out) { h.px = h.x; h.py = h.y; }
    h.twWalk = g.t;
  }
  if (g.phase !== 'wave') { A.tele.length = 0; A.wind = null; return; }
  // 예고 → 터짐
  for (const s of A.tele) { s.t += dt; if (s.t >= s.warn && !s.done) { s.done = true; resolve(g, s); } }
  if (A.tele.some((s) => s.done)) A.tele = A.tele.filter((s) => !s.done);
  // 독 웅덩이
  if (A.pools.length) {
    for (const q of A.pools) {
      q.t -= dt;
      if ((q.tick -= dt) <= 0) { q.tick = ARENA.pool.tick; for (const h of ms) if (alive(h) && inShape({ shape: 'circle', x: q.x, y: q.y, r: q.r }, h.x, h.y)) S.poisonHero(g, h, ARENA.pool.poison); }
    }
    A.pools = A.pools.filter((q) => q.t > 0);
  }
  // 새 예고
  if ((A.nextT -= dt) <= 0 && A.plan.kinds.length) {
    A.nextT = A.plan.every * (0.85 + rnd(g) * 0.3);
    const k = A.plan.kinds[(rnd(g) * A.plan.kinds.length) | 0];
    spawnTele(g, k);
    if (A.plan.multi && rnd(g) < A.plan.multi) spawnTele(g, A.plan.kinds[(rnd(g) * A.plan.kinds.length) | 0]);
  }
  // 기 모으기 (51층~)
  if (A.plan.wind) {
    if (A.wind) {
      const W = A.wind;
      W.t += dt;
      const lost = W.hp0 - (W.e.dead ? 0 : W.e.hp);
      if (W.e.dead || W.e.stunT > 0 || W.e.frozenT > 0 || W.e.danceT > 0 || lost >= W.need) windEnd(g, false);
      else if (W.t >= W.dur) windEnd(g, true);
    } else if ((A.windT -= dt) <= 0) { A.windT = A.plan.wind.every * (0.9 + rnd(g) * 0.2); if (!startWind(g)) A.windT = 2; }
  }
}
function heal(g, ms, dt) {
  const A = g.twa;
  const live = ms.filter(alive);
  for (const h of live) {
    // 스킬을 썼나 (쿨이 다시 찼으면) → 회복 멤버의 스킬은 탑에서 모두 회복 · 해제
    const cast = h.skillCd > (h.twCd0 || 0) + 0.5;
    h.twCd0 = h.skillCd;
    if (!cast) continue;
    if (h.id === 'gunnyeo') { for (const o of live) { o.twHp = Math.min(o.twMax, o.twHp + o.twMax * ARENA.heal.firstaid); o.stunT = 0; o.freezeT = 0; o.charmT = 0; o.silenceT = 0; o.poisonT = 0; o.twSlowT = 0; } A.stat.heal++; g.events.push({ type: 'twaHeal', hero: h.id, x: h.x, y: h.y, all: true }); }
    else if (h.id === 'jungmin') { for (const o of live) { o.twHp = Math.min(o.twMax, o.twHp + o.twMax * ARENA.heal.bandage); o.poisonT = 0; } A.stat.heal++; g.events.push({ type: 'twaHeal', hero: h.id, x: h.x, y: h.y, all: true }); }
  }
  const gn = live.find((h) => h.id === 'gunnyeo' && !(h.stunT > 0) && !(h.charmT > 0));
  if (gn) { let lo = null; for (const o of live) if (o.twHp < o.twMax && (!lo || o.twHp / o.twMax < lo.twHp / lo.twMax)) lo = o; if (lo) { const v = lo.twMax * ARENA.heal.gunnyeo * (1 + 0.06 * ((gn.lv || 1) - 1)) * dt; lo.twHp = Math.min(lo.twMax, lo.twHp + v); gn.twHealN = (gn.twHealN || 0) + v; if (gn.twHealN > lo.twMax * 0.12) { gn.twHealN = 0; g.events.push({ type: 'twaHeal', hero: lo.id, by: gn.id, x: lo.x, y: lo.y }); } } }
  const jm = live.find((h) => h.id === 'jungmin' && !(h.stunT > 0));
  if (jm) for (const o of live) o.twHp = Math.min(o.twMax, o.twHp + o.twMax * ARENA.heal.jungmin * dt);
}

// ─── 봇 (시뮬 · 테스트): 반응 시간 뒤에 피한다 — 괜찮은 사람 흉내 ───
//  o: { react: 0.45 (초), miss: 0.1 (놓칠 확률), spread: true (감전 층에서 흩어지기), rng }
export function botTick(g, o = {}) {
  const A = g.twa;
  if (!A || g.phase !== 'wave') return;
  const rng = o.rng || Math.random, react = o.react === undefined ? 0.45 : o.react, miss = o.miss === undefined ? 0.1 : o.miss;
  const ms = members(g).filter(alive);
  for (const s of A.tele) {
    if (s.bot) continue;
    if (s.rt === undefined) s.rt = react * (0.8 + rng() * 0.4);
    if (s.t < s.rt) continue;
    s.bot = true;
    if (rng() < miss) continue;
    for (const h of ms) { const at = h.twTo || h; if (inShape(s, at.x, at.y, g)) escape(g, h, o); }
  }
  if (A.wind && !A.wind.bot) {
    const W = A.wind;
    if (W.rt === undefined) W.rt = react * (0.8 + rng() * 0.4);
    if (W.t >= W.rt) {
      W.bot = true;
      if (rng() >= miss) for (const h of ms) { const a = (h.id.length * 1.7) % (2 * Math.PI), rr = W.r * 0.45; moveTo(g, h, W.x + Math.cos(a) * rr, W.y + Math.sin(a) * rr * SHAPE.flat); }
    }
  }
  // 감전 층: 너무 붙어 있으면 조금 벌린다 (가끔)
  if (o.spread !== false && A.plan.kinds.includes('shock') && !A.wind && (A.spreadT = (A.spreadT || 0) - 1 / 60) <= 0) {
    A.spreadT = 1.5;
    for (const h of ms) { if (h.twTo || !canMove(h)) continue; const near = ms.find((b) => b !== h && Math.hypot(b.x - h.x, (b.y - h.y) / SHAPE.flat) < ARENA.shock.r); if (near) escape(g, h, o, true); }
  }
}
function threat(g, x, y, h, horizon) {
  const A = g.twa;
  let v = 0;
  for (const s of A.tele) if (inShape(s, x, y, g)) v += s.warn - s.t < horizon + 0.3 ? 1000 : 600; // 곧 터질 예고 · 나중에 터질 예고
  if (A.wind && inShape({ shape: 'quake', x: A.wind.x, y: A.wind.y, r: A.wind.r }, x, y, g)) v += 800;
  for (const q of A.pools) if (inShape({ shape: 'circle', x: q.x, y: q.y, r: q.r }, x, y)) v += 300;
  if (A.plan.kinds.includes('shock')) for (const b of members(g)) if (b !== h && alive(b)) { const bp = b.twTo || b; if (Math.hypot(bp.x - x, (bp.y - y) / SHAPE.flat) < ARENA.shock.r) v += 40; }
  return v;
}
function escape(g, h, o, soft) {
  const z = zoneOf(g);
  let best = null, bv = Infinity;
  const sp = ARENA.move * (h.twSlowT > 0 ? ARENA.slow : 1);
  const left = Math.min(...g.twa.tele.filter((s) => inShape(s, h.x, h.y, g)).map((s) => s.warn - s.t), 9);
  for (const r of [26, 44, 64, 88, 115]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, x = clamp(h.x + Math.cos(a) * r, z.x0, z.x1), y = clamp(h.y + Math.sin(a) * r * 0.7, z.y0, z.y1);
    const d = Math.hypot(x - h.x, y - h.y);
    let v = threat(g, x, y, h, d / sp) + d * 0.6 + Math.hypot(x - h.homeX, y - h.homeY) * 0.12;
    if (!soft && d / sp > left - 0.05) v += 250; // 제때 못 닿는 곳
    if (v < bv) { bv = v; best = { x, y }; }
  }
  if (best && (!soft || bv < 200)) moveTo(g, h, best.x, best.y);
}
// 결과 요약 (시뮬 · 결과 화면)
export function report(g) { const A = g.twa; return A ? Object.assign({}, A.stat, { hp: members(g).map((h) => ({ id: h.id, hp: Math.round(h.twHp), max: h.twMax })) }) : null; }
