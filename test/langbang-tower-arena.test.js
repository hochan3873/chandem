'use strict';
// 진상의 탑 리메이크: 멤버 3명 · 끌어서 이동 · 바닥 예고 · 탑 전용 체력 · 상태이상 저항 · 감전 번짐 · 기 모으기 끊기 · 층 단계 · 서버 파티
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S, T, L, A;
test.before(async () => { D = await load('data.js'); S = await load('sim.js'); T = await load('tower.js'); L = await load('live.js'); A = await load('tower-arena.js'); });

function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const step = (g, sec) => { for (let t = 0; t < sec && !g.over; t += 1 / 60) { S.step(g, 1 / 60); g.augOffer = null; g.pendingLevels = 0; } };
// 탑 판 + 파티 (웨이브가 시작된 뒤 · 자동 예고는 멈춰 둔다)
function arena(f, squad, extra = {}) {
  const g = S.createGame(Object.assign({ H: 760, rng: seeded(f * 3 + 1), mode: 'stage', stage: 35, deck: [null, null, squad[0], null, null, null], tempo: true, join: false, tower: T.floorDef(f), towerExp: T.TOWER.exp }, extra));
  A.attach(g, { squad });
  for (let i = 0; i < 60 * 8 && g.phase !== 'wave'; i++) S.step(g, 1 / 60);
  g.twa.nextT = 1e9; g.twa.windT = 1e9; g.god = true;
  for (const h of A.members(g)) { h.stunT = 0; h.homeX = h.x; h.homeY = h.y; }
  return g;
}
const mem = (g, id) => A.members(g).find((h) => h.id === id);
function lbOf() {
  const raw = { stages: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 3])), maxStage: 10, heroes: {}, coins: 0, tickets: 0, gear: [], gearSeq: 0, titles: [], frames: [] };
  const out = Object.assign({}, raw);
  L.normLive(raw, out); T.normTower(raw, out);
  out.gear = []; out.coins = 0; out.maxStage = 10; out.stages = raw.stages;
  return out;
}

test('층 단계: 1~3 예고 없음 · 4~10 피해만 · 11~30 기절 · 31~50 위험 하나 (8가지 돌아가며) · 51~80 둘 + 기 모으기 · 81~ 셋 · 예고가 점점 짧다', () => {
  assert.equal(T.TOWER.floors, 100);
  for (let f = 1; f <= 3; f++) assert.equal(A.floorPlan(f).kinds.length, 0);
  for (let f = 4; f <= 10; f++) assert.deepEqual(A.floorPlan(f).kinds, ['hit']);
  for (let f = 11; f <= 30; f++) assert.ok(A.floorPlan(f).kinds.includes('stun') && A.floorPlan(f).cc >= 2.2, `${f}층 기절 2초 넘게`);
  const set = new Set();
  for (let f = 31; f <= 50; f++) { const p = A.floorPlan(f); assert.equal(p.kinds.length, 1); set.add(p.kinds[0]); assert.ok(!p.wind); }
  assert.deepEqual([...set].sort(), A.HZ_IDS.slice().sort(), '감전 · 빙결 · 독 · 홀림 · 침묵 · 넉백 · 감속 · 기절 모두');
  for (let f = 51; f <= 80; f++) { const p = A.floorPlan(f); assert.equal(new Set(p.kinds).size, 2); assert.ok(p.wind && p.wind.dur > 2); }
  for (let f = 81; f <= 100; f++) assert.equal(new Set(A.floorPlan(f).kinds).size, 3);
  let w = 9; for (const f of [11, 30, 31, 50, 51, 80, 81, 100]) { const p = A.floorPlan(f); assert.ok(p.warn <= w, `${f}층 예고 ${p.warn}`); w = p.warn; }
  assert.ok(A.floorPlan(100).warn <= 0.85 && A.floorPlan(11).warn >= 2);
  // 추천: 감전 층 → 서명훈 (감전 70%) · 독 층 → 홍정민 (팀 면역)
  const all = Object.keys(D.HEROES);
  assert.equal(A.recommend(32, all, 1)[0], 'myunghoon');
  assert.ok(A.recommend(34, all, 2).includes('jungmin'));
});

test('파티 3명 · 탑 전용 체력 (탱커 크고 딜러 작다) · 진상은 데려간 수만큼 단단', () => {
  const g1 = arena(12, ['gunman']), g3 = arena(12, ['gunman', 'wonsik', 'gunnyeo']);
  assert.equal(A.members(g1).length, 1); assert.equal(A.members(g3).length, 3);
  assert.ok(mem(g3, 'wonsik').twMax > mem(g3, 'gunnyeo').twMax && mem(g3, 'gunnyeo').twMax > mem(g3, 'gunman').twMax, '정원식 > 건전녀 > 건전남');
  assert.ok(mem(g3, 'wonsik').twMax / mem(g3, 'gunman').twMax > 2.5);
  assert.ok(g3.tower.def.waves[0].hpScale > g1.tower.def.waves[0].hpScale * 2, '셋이면 진상 체력 2배 넘게');
  assert.ok(g3.base.max > 300, '입구도 조금 단단');
});

test('예고: 안에 있으면 기절 2초 넘게 · 끌어서 옮기면 걸어가서 (바로 순간이동 아님) 피한다', () => {
  const g = arena(25, ['gunman', 'staff', 'gunnyeo']);
  const h = mem(g, 'gunman'), o = mem(g, 'staff');
  const s = A.spawnTele(g, 'stun', h); s.shape = 'circle'; s.r = 44; s.x = h.x; s.y = h.y; s.warn = 1.5;
  const s2 = A.spawnTele(g, 'stun', o); s2.shape = 'circle'; s2.r = 44; s2.x = o.x; s2.y = o.y; s2.warn = 1.5;
  const x0 = h.x;
  assert.ok(A.moveTo(g, h, h.x - 100, h.y));
  step(g, 0.1);
  assert.ok(Math.abs(h.x - x0) < 30, '바로 가지 않는다');
  step(g, 1.6);
  assert.ok(h.x < x0 - 90, '걸어서 도착');
  assert.ok(!(h.stunT > 0), '피한 멤버는 멀쩡');
  assert.ok(o.stunT > 1.8, `가만히 있던 멤버는 기절 ${o.stunT.toFixed(2)}초`);
  assert.ok(o.twHp < o.twMax, '피해도');
  assert.equal(g.twa.stat.dodge, 1);
  // 기절 중엔 못 움직인다
  const y0 = o.y; A.moveTo(g, o, o.x, o.y - 60); step(g, 0.5); assert.ok(Math.abs(o.y - y0) < 1);
  // 띠 밖으로는 못 간다
  A.moveTo(g, h, -500, -500); step(g, 4); const z = A.zoneOf(g); assert.ok(h.x >= z.x0 && h.y >= z.y0);
});

test('모양 판정: 원(납작) · 세로 줄 · 가로 띠 · 십자 · 고리(안쪽 안전) · 부채꼴 · 기 모으기(안전한 원 밖 전부)', () => {
  const g = arena(12, ['gunman']);
  assert.ok(A.inShape({ shape: 'circle', x: 100, y: 400, r: 44 }, 140, 400));
  assert.ok(!A.inShape({ shape: 'circle', x: 100, y: 400, r: 44 }, 100, 440), '위아래는 납작');
  assert.ok(A.inShape({ shape: 'line', x: 100, w: 24 }, 120, 0) && !A.inShape({ shape: 'line', x: 100, w: 24 }, 130, 0));
  assert.ok(A.inShape({ shape: 'band', y: 400, h: 20 }, 0, 415) && !A.inShape({ shape: 'band', y: 400, h: 20 }, 0, 425));
  assert.ok(A.inShape({ shape: 'cross', x: 100, y: 400, w: 22 }, 300, 410) && A.inShape({ shape: 'cross', x: 100, y: 400, w: 22 }, 110, 100));
  const ring = { shape: 'ring', x: 180, y: 400, r1: 40, r2: 112 };
  assert.ok(!A.inShape(ring, 180, 400) && A.inShape(ring, 260, 400) && !A.inShape(ring, 340, 400));
  const cone = { shape: 'cone', x: 180, y: 100, ang: Math.PI / 2, sp: 0.18, len: 420 };
  assert.ok(A.inShape(cone, 180, 400) && !A.inShape(cone, 300, 400));
  assert.ok(A.inShape({ shape: 'quake', x: 100, y: 400, r: 50 }, 250, 400, g) && !A.inShape({ shape: 'quake', x: 100, y: 400, r: 50 }, 100, 400, g));
});

test('감전: 곁(88) 멤버에게 번진다 · 떨어진 멤버는 안 맞는다 · 서명훈은 감전에 강하다', () => {
  const g = arena(32, ['gunman', 'staff', 'gunnyeo']);
  const [a, b, c] = ['gunman', 'staff', 'gunnyeo'].map((id) => mem(g, id));
  a.x = 150; a.y = g.rowY - 20; b.x = 200; b.y = g.rowY - 20; c.x = 330; c.y = g.rowY - 20; // a · b 붙어 있고 c 멀리
  const s = A.spawnTele(g, 'shock', a); s.shape = 'circle'; s.r = 40; s.x = a.x; s.y = a.y; s.warn = 0.2;
  step(g, 0.3);
  assert.ok(a.stunT > 0 && a.twShockT > 0, '맞은 멤버');
  assert.ok(b.stunT > 0 && b.twShockT > 0, '곁 멤버에게 번짐');
  assert.ok(!(c.stunT > 0), '떨어진 멤버는 멀쩡');
  assert.ok(g.twa.stat.shock >= 1);
  // 저항: 서명훈 감전 70% → 같은 감전이 훨씬 짧다
  const g2 = arena(32, ['myunghoon', 'gunman']);
  const m = mem(g2, 'myunghoon'), gm = mem(g2, 'gunman');
  m.x = 60; gm.x = 300;
  for (const h of [m, gm]) { const t = A.spawnTele(g2, 'shock', h); t.shape = 'circle'; t.r = 40; t.x = h.x; t.y = h.y; t.warn = 0.2; }
  step(g2, 0.3);
  assert.ok(m.stunT < gm.stunT * 0.5, `서명훈 ${m.stunT.toFixed(2)} < 건전남 ${gm.stunT.toFixed(2)}`);
  assert.equal(A.resOf('myunghoon', 'shock'), 70);
  assert.equal(A.resOf('dragon', 'freeze'), 80, 'HERO_RES 그대로');
});

test('저항 · 팀 면역: 홍정민 있으면 독 면역 · 넉백은 정섭이 덜 밀린다 · 강성구 곁은 기절 면역', () => {
  const g = arena(34, ['gunman', 'jungmin']);
  const h = mem(g, 'gunman');
  const s = A.spawnTele(g, 'poison', h); s.shape = 'circle'; s.r = 44; s.x = h.x; s.y = h.y; s.warn = 0.2;
  step(g, 0.3);
  assert.ok(!(h.poisonT > 0), '독 면역 (홍정민 붕대)');
  const g2 = arena(37, ['gunman', 'jeongseob']);
  const a = mem(g2, 'gunman'), b = mem(g2, 'jeongseob');
  a.x = 80; b.x = 280; a.y = b.y = g2.rowY - 30;
  for (const x of [a, b]) { const t = A.spawnTele(g2, 'knock', x); t.shape = 'circle'; t.r = 60; t.x = x.x - 20; t.y = x.y; t.warn = 0.2; }
  step(g2, 1);
  assert.ok(Math.abs(a.x - 80) > Math.abs(b.x - 280) * 2, `건전남 ${Math.abs(a.x - 80).toFixed(0)} 밀림 · 정섭 ${Math.abs(b.x - 280).toFixed(0)}`);
  const g3 = arena(25, ['gunman', 'sunggu']);
  const c = mem(g3, 'gunman'), sg = mem(g3, 'sunggu');
  c.x = sg.x + 50; c.y = sg.y;
  const t3 = A.spawnTele(g3, 'stun', c); t3.shape = 'circle'; t3.r = 30; t3.x = c.x; t3.y = c.y; t3.warn = 0.2;
  step(g3, 0.3);
  assert.ok(!(c.stunT > 0), '강성구 곁 기절 면역 (모이기 vs 흩어지기)');
});

test('체력 0 → 쓰러짐 (건전녀 있으면 빨리) → 35%로 일어남 · 모두 쓰러지면 실패 · 건전녀 응급 방패 = 모두 회복', () => {
  const g = arena(25, ['gunman', 'gunnyeo']);
  const h = mem(g, 'gunman'), gn = mem(g, 'gunnyeo');
  h.twHp = 1;
  const s = A.spawnTele(g, 'hit', h); s.shape = 'circle'; s.r = 44; s.x = h.x; s.y = h.y; s.warn = 0.2;
  step(g, 0.3);
  assert.ok(h.twDown > 0 && h.twDown <= A.ARENA.down.sec * A.ARENA.down.quick + 0.01, '쓰러짐 (건전녀 → 6초)');
  step(g, 1); assert.ok(h.stunT > 0, '쓰러진 동안 아무것도 못 함');
  step(g, A.ARENA.down.sec * A.ARENA.down.quick);
  assert.equal(h.twDown, 0); assert.ok(Math.abs(h.twHp / h.twMax - A.ARENA.down.back) < 0.12, '35% 근처로 일어남');
  // 응급 방패: 모두 회복 · 해제
  h.twHp = h.twMax * 0.2; h.stunT = 3; gn.skillCd = 0; g.mom = 300;
  assert.ok(S.castSkill(g, gn));
  step(g, 0.1);
  assert.ok(h.twHp > h.twMax * 0.5 && !(h.stunT > 0), '모두 회복 · 기절 풀림');
  // 모두 쓰러지면 실패 (입구가 멀쩡해도)
  const g2 = arena(25, ['gunman', 'staff']);
  for (const x of A.members(g2)) { x.twHp = 1; const t = A.spawnTele(g2, 'hit', x); t.shape = 'circle'; t.r = 44; t.x = x.x; t.y = x.y; t.warn = 0.2; }
  g2.god = false;
  step(g2, 0.5);
  assert.ok(g2.over && g2.base.hp === 0, '전멸 = 실패');
});

test('기 모으기 (51층~): 안전한 원 밖은 큰 피해 + 기절 · 기절시키거나 큰 피해로 끊으면 빈틈', () => {
  const g = arena(55, ['gunman', 'staff', 'gunnyeo']);
  step(g, 6);
  assert.ok(g.enemies.some((e) => !e.dead && e.y > 30), '진상이 있다');
  const startW = () => { for (let k = 0; k < 30 && !g.twa.wind; k++) { g.twa.windT = 0; for (const e of g.enemies) { e.stunT = 0; e.frozenT = 0; e.danceT = 0; } step(g, 1 / 60); } return g.twa.wind; };
  const W = startW(); assert.ok(W && W.e, '기 모으기 시작');
  W.e.stunT = 1; step(g, 0.05);
  assert.equal(g.twa.wind, null); assert.equal(g.twa.stat.cut, 1); assert.ok(W.e.weakT > 0 || W.e.dead, '빈틈');
  // 못 끊으면: 원 밖 멤버는 기절 · 원 안은 멀쩡
  const W2 = startW(); assert.ok(W2);
  W2.need = 1e12; W2.e.stunT = 0; W2.e.frozenT = 0; W2.e.danceT = 0;
  const ms = A.members(g); const inside = ms[0];
  inside.x = W2.x; inside.y = W2.y; inside.twTo = null;
  for (const o of ms.slice(1)) { o.x = W2.x > 180 ? 30 : 330; o.y = W2.y; o.twTo = null; }
  W2.t = W2.dur - 0.01; step(g, 0.1);
  assert.ok(!(inside.stunT > 0) && ms.slice(1).every((o) => o.stunT > 2.5 || o.twDown > 0));
});

test('봇: 반응 시간 뒤에 피한다 (시뮬 · 사람 흉내)', () => {
  const g = arena(25, ['gunman', 'staff', 'gunnyeo']);
  const h = mem(g, 'gunman');
  const s = A.spawnTele(g, 'stun', h); s.shape = 'circle'; s.r = 44; s.x = h.x; s.y = h.y; s.warn = 1.6;
  for (let i = 0; i < 100; i++) { S.step(g, 1 / 60); A.botTick(g, { react: 0.4, miss: 0, rng: seeded(2) }); }
  assert.ok(!(h.stunT > 0), '봇이 피했다');
});

test('서버 규칙: 파티 시작 (멤버 확인 · 피로 · 지친 멤버는 못 감) · 끝 (같이 간 멤버 모두 피로 · 각성 기록) · 예전 혼자 시작도 그대로', () => {
  const now = Date.UTC(2026, 9, 7, 3, 0, 0);
  const lb = lbOf();
  assert.ok(T.towerStart(lb, 1, 'bangjang', 'x', now, false, ['hanna']).error, '없는 멤버');
  let s = T.towerStart(lb, 1, 'bangjang', 'r1', now, false, ['gunman', 'gunnyeo', 'gunman', 'staff']);
  assert.ok(!s.error, s.error);
  assert.deepEqual(s.squad, ['bangjang', 'gunman', 'gunnyeo'], '대장 + 최대 2명 · 중복 없음');
  // 저장 → 다시 읽어도 파티가 남는다
  const out = {}; T.normTower({ tower: JSON.parse(JSON.stringify(lb.tower)) }, out);
  assert.deepEqual(out.tower.run.sq, ['gunman', 'gunnyeo']);
  const r = T.towerFinish(lb, { runId: 'r1', clear: true, durationSec: 100, kills: 20 }, 'u', now + 120e3);
  assert.ok(!r.error, r.error);
  assert.deepEqual(r.squad, ['bangjang', 'gunman', 'gunnyeo']);
  const add = T.squadFat(3, T.fatigueGain(1, true, false));
  assert.equal(r.fatAdd, add); assert.ok(add < T.FATIGUE.clear, '셋이면 한 명당 덜');
  for (const h of r.squad) { assert.equal(T.fatigueOf(lb, h, now + 120e3), add); assert.equal(lb.tower.hb[h], 1, '각성 기록'); }
  // 지친 멤버가 끼어 있으면 못 감
  lb.tower.fat.gunnyeo = { v: 100, at: now, lock: 1 };
  assert.ok(T.towerStart(lb, 2, 'bangjang', 'r2', now + 130e3, false, ['gunnyeo']).error);
  // 혼자 (예전 방식)
  s = T.towerStart(lb, 2, 'staff', 'r3', now + 130e3);
  assert.ok(!s.error); assert.deepEqual(s.squad, ['staff']);
  // 명예의 전당은 그대로 60층
  assert.equal(T.TOWER.hall, 60);
});
