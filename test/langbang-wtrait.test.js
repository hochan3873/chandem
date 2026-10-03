'use strict';
// 주간 진상 특성 · 스킬 쿨 카드 상한 · 큰 레벨 카드 보너스 표시 · 고아라 탑 망치
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S, L;
test.before(async () => {
  D = await load('data.js');
  S = await load('sim.js');
  L = await load('live.js');
});
function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const DECK = [null, 'staff', 'youngjun', 'gunman', 'bangjang', null];

test('주간 진상 특성: 주마다 차례로 · 같은 주는 늘 같다 · 8주에 한 바퀴', () => {
  const n = D.WEEK_TRAITS.length;
  assert.ok(n >= 8);
  for (const t of D.WEEK_TRAITS) { assert.ok(t.id && t.name && t.icon && t.desc, t.id); assert.ok(t.rec.length >= 3 && t.rec.every((id) => D.HEROES[id]), t.id + ' 추천 멤버'); }
  const ids = new Set();
  for (let wi = 0; wi < n; wi++) { assert.equal(L.weekTrait(wi), L.weekTrait(wi)); ids.add(L.weekTrait(wi).id); assert.equal(L.weekTrait(wi + n).id, L.weekTrait(wi).id); }
  assert.equal(ids.size, n, '한 바퀴에 전부 한 번씩');
  assert.notEqual(L.weekTrait(3).id, L.weekTrait(4).id, '다음 주는 다른 특성');
  assert.equal(L.weekTrait(-1).id, L.weekTrait(n - 1).id, '음수 주도 안전');
  const now = Date.UTC(2026, 9, 3, 12);
  assert.equal(L.weekTrait(L.weekIndex(now)).id, L.weekTrait(L.weekIndex(now + 3600e3)).id, '같은 주 안에서는 같은 특성');
});

test('주간 진상 특성: 일반 스테이지 · 헬에만 · 1:1 대전 · 레이드 · 주간 도전 · 무한에는 없음', () => {
  const mk = (o) => S.createGame({ rng: seeded(5), mode: 'stage', stage: 12, deck: DECK, wtrait: 'near', ...o });
  const g = mk({});
  assert.equal(g.wtr && g.wtr.id, 'near');
  assert.equal(mk({ hell: true }).wtr.id, 'near', '헬도');
  assert.equal(mk({ pvp: { seed: 3, hp: 1 } }).wtr, null, '1:1 대전엔 없다');
  assert.equal(mk({ raid: { sec: 60 } }).wtr, null, '레이드엔 없다');
  assert.equal(mk({ weekly: L.weeklyDef(0) }).wtr, null, '주간 도전엔 없다');
  assert.equal(S.createGame({ rng: seeded(5), mode: 'endless', deck: DECK, wtrait: 'near' }).wtr, null, '무한엔 없다');
  // 근접 +30% · 원거리 −20%
  const g0 = S.createGame({ rng: seeded(5), mode: 'stage', stage: 12, deck: DECK });
  const yj = (x) => x.heroes.find((h) => h.id === 'youngjun'), gm = (x) => x.heroes.find((h) => h.id === 'gunman');
  assert.ok(Math.abs(S.heroDamage(g, yj(g)) / S.heroDamage(g0, yj(g0)) - 1.3) < 1e-9, '근접 김영준 +30%');
  assert.ok(Math.abs(S.heroDamage(g, gm(g)) / S.heroDamage(g0, gm(g0)) - 0.8) < 1e-9, '원거리 건전남 −20%');
  const gp = S.createGame({ rng: seeded(5), mode: 'stage', stage: 12, deck: DECK, pvp: { seed: 3, hp: 1 }, wtrait: 'near' });
  const gp0 = S.createGame({ rng: seeded(5), mode: 'stage', stage: 12, deck: DECK, pvp: { seed: 3, hp: 1 } });
  assert.equal(S.heroDamage(gp, gm(gp)), S.heroDamage(gp0, gm(gp0)), '1:1 대전 피해는 그대로');
  // 이어하기: 특성이 따라온다
  assert.equal(S.restoreGame(S.snapshot(g), { rng: seeded(1) }).wtr.id, 'near');
});

test('주간 진상 특성: 진상에게 걸린다 (체력 · 속도 · 수 · 보호막)', () => {
  const sp = (wtrait) => { const g = S.createGame({ rng: seeded(9), mode: 'stage', stage: 12, deck: DECK, wtrait }); return S.spawnEnemy(g, 'drunk', 100, 0); };
  const e0 = sp(undefined), ef = sp('fast'), eb = sp('boss');
  assert.ok(Math.abs(ef.maxHp / e0.maxHp - 0.85) < 1e-9, '빠른 주간: 체력 −15%');
  assert.ok(ef.speed > e0.speed * 1.2, '빠른 주간: 이동 +25%');
  assert.ok(Math.abs(eb.maxHp / e0.maxHp - 0.85) < 1e-9, '보스 주간: 일반 진상은 −15%');
  const gs = S.createGame({ rng: () => 0.01, mode: 'stage', stage: 12, deck: DECK, wtrait: 'shield' });
  const es = S.spawnEnemy(gs, 'drunk', 100, 0);
  assert.ok(es.cLay > 0, '보호막 주간: 보호막 진상');
  const waveN = (wtrait) => { const g = S.createGame({ rng: seeded(2), mode: 'stage', stage: 12, deck: DECK, wtrait }); S.startWave(g, 3); return g.spawnQ.length; };
  assert.ok(waveN('swarm') > waveN(undefined), '떼거리 주간: 진상 수 +');
});

test('스킬 연습 카드: 큰 카드 두 장이어도 쿨 감소는 50% 를 넘지 않는다', () => {
  const g = S.createGame({ rng: seeded(3), mode: 'stage', stage: 12, deck: DECK });
  assert.ok(g.grow);
  const c0 = g.cdMul;
  const card = D.CARDS.find((c) => c.id === 'cdCut');
  for (let i = 0; i < 4; i++) S.applyCard(g, { kind: 'global', id: 'cdCut', ...card });
  assert.ok(g.cdMul / c0 >= 1 - D.GROW.cdMax - 1e-9, `쿨 ×${(g.cdMul / c0).toFixed(3)}`);
});

test('큰 레벨 카드: 멤버 공격력 + 를 카드에 따로 보여 준다', () => {
  const g = S.createGame({ rng: seeded(3), mode: 'stage', stage: 12, deck: DECK });
  const lv = S.cardPool(g).find((c) => c.kind === 'heroLv');
  assert.equal(lv.lvAtk, D.GROW.lv);
  const gw = S.createGame({ rng: seeded(3), mode: 'stage', stage: 12, deck: DECK, pvp: { seed: 3, hp: 1 } });
  const lv2 = S.cardPool(gw).find((c) => c.kind === 'heroLv');
  assert.ok(!lv2 || !lv2.lvAtk, '큰 카드가 아닌 판엔 없음');
});
