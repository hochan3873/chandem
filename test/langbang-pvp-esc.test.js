'use strict';
// 랑방 대전 1:1: 늘어지는 판 막기 (과열 · 폭주 · 서든데스) 일정 · 두 사람 똑같이 · 상대 미니 화면 (점 넘기기 · 간격)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lb = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
const WEAK = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'];
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('단계 일정: 90초 과열 · 150초 폭주 · 210초 서든데스 — 보내기 배수 · 자동 중간 보스 · 정해진 웨이브 수', async () => {
  const PV = await lb('pvp.js');
  assert.deepEqual([0, 89.9, 90, 149.9, 150, 209.9, 210, 299].map(PV.pvpPhase), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([0, 90, 150, 210].map(PV.pvpSendMul), [1, 2, 2, 3]);
  // 자동 중간 보스: 폭주 전엔 없음 · 폭주 시작 때 처치 수부터 세서 25명마다
  assert.deepEqual(PV.pvpAutoBig(149, 400, null), { from: null, n: 0 });
  let r = PV.pvpAutoBig(150, 400, null); assert.deepEqual(r, { from: 400, n: 0 }, '폭주 전에 잡은 건 안 센다');
  r = PV.pvpAutoBig(160, 424, r.from); assert.equal(r.n, 0);
  r = PV.pvpAutoBig(161, 451, r.from); assert.deepEqual(r, { from: 450, n: 2 }, '51명 → 2번 · 남은 1명은 다음에');
  // 서든데스 웨이브: 210초부터 8초마다 · 300초 판정까지
  assert.equal(PV.pvpSdCount(209.9), 0); assert.equal(PV.pvpSdCount(210), 1); assert.equal(PV.pvpSdCount(218), 2);
  assert.equal(PV.pvpSdCount(400), PV.pvpSdCount(299.9));
  assert.equal(PV.pvpBunchCount(149), 0); assert.equal(PV.pvpBunchCount(150), 1); assert.equal(PV.pvpBunchCount(180), 2);
  // 미니 화면 점: 정수 하나로 (보여 주기만)
  for (const [x, y, k] of [[0, 0, 0], [63, 63, 3], [31, 7, 2], [99, -5, 1]]) { const d = PV.pvpUndot(PV.pvpDot(x, y, k)); assert.deepEqual(d, { x: Math.max(0, Math.min(63, x)), y: Math.max(0, Math.min(63, y)), k }); }
});

test('단계는 두 사람 똑같이: 같은 시계면 같은 보스 묶음 · 같은 수의 정해진 웨이브 · 입구 피해 ×1.5 · 다시 들어온 판은 지난 것을 쏟지 않음', async () => {
  const PV = await lb('pvp.js'), S = await lb('sim.js');
  const mk = (r) => { const g = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 77, hp: 1 }, deck: WEAK, rng: seeded(r) }); g.god = true; return g; };
  const a = mk(1), b = mk(999); // 화면마다 rng 는 달라도
  const log = (g) => { const out = { phase: [], bunch: [], waves: 0 }; return out; };
  const la = log(a), lbb = log(b);
  for (let t = 0; t <= 240; t += 0.5) {
    for (const [g, l] of [[a, la], [b, lbb]]) {
      g.pvp.clock = t; S.step(g, 1 / 30);
      for (const e of g.events) { if (e.type === 'pvpPhase') l.phase.push(e.p); if (e.type === 'bossSpawn' && e.bunch) l.bunch.push(e.enemy); if (e.type === 'pvpWave') l.waves++; }
      g.events.length = 0;
    }
  }
  assert.deepEqual(la.phase, [1, 2, 3], '과열 → 폭주 → 서든데스 한 번씩');
  assert.deepEqual(la.phase, lbb.phase);
  assert.equal(la.bunch.length, 2 + 3, '보스 묶음 2명 + 3명');
  assert.deepEqual(la.bunch, lbb.bunch, '같은 보스 (판 시드로 고름)');
  assert.equal(la.waves, PV.pvpSdCount(240)); assert.equal(la.waves, lbb.waves);
  assert.ok(Math.abs(a.pvp.doorMul - (1 + PV.PVP_END.doorStep * a.pvp.n) * PV.PVP_ESC.sdDoor) < 1e-9, '서든데스: 입구 피해 ×1.5 더');
  // 다시 들어온 판 (230초에 새로 시작): 지난 보스 묶음 · 웨이브를 한꺼번에 쏟지 않는다
  const c = mk(5); c.pvp.clock = 230; S.step(c, 1 / 30);
  assert.equal(c.events.filter((e) => e.type === 'bossSpawn' && e.bunch).length, 0);
  assert.equal(c.events.filter((e) => e.type === 'pvpWave').length, 0);
  assert.equal(c.pvp.phase, 3);
});

test('보내기 배수 · 화면 진상 한도: 넘치면 수 대신 체력으로', async () => {
  const PV = await lb('pvp.js'), S = await lb('sim.js');
  const g = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  S.pvpIncoming(g, 'small', 2); assert.equal(g.enemies.filter((x) => x.sent).length, PV.PVP_END.sendSmall * 2, '과열: 진상 두 묶음');
  S.pvpIncoming(g, 'big', 3); assert.equal(g.enemies.filter((x) => x.sent && x.mid).length, 3, '중간 보스 3명');
  // 화면이 꽉 차면: 수는 한도까지 · 모자란 만큼 체력
  const h = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  for (let i = 0; i < PV.PVP_ESC.cap - 2; i++) S.spawnEnemy(h, 'mukti', 100, 100);
  const one = S.spawnEnemy(h, 'mukti', 100, 100), base = one.maxHp; one.dead = true;
  const before = h.enemies.length;
  S.pvpIncoming(h, 'small', 3);
  const got = h.enemies.slice(before).filter((x) => x.sent && x.type === 'mukti');
  assert.equal(h.enemies.length - before, 4, '최소 4명만');
  assert.ok(got.every((x) => x.maxHp > base * 3), '대신 체력이 몇 배');
  // 미니 화면 점: 40개까지 · 보스가 먼저
  const v = S.pvpView(h);
  assert.equal(v.length, PV.PVP_DOTS);
  const boss = S.spawnEnemy(h, 'boss_loan', 180, 50); void boss;
  assert.equal(PV.pvpUndot(S.pvpView(h)[0]).k, 2, '보스가 맨 앞');
});

// ─── 서버: 미니 화면 넘기기 (간격 · 정리) · 단계 배수 · 자동 중간 보스 ───
