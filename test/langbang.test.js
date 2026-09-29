'use strict';
// 랑방 대전 순수 로직 테스트 (public/langbang/data.js · sim.js 는 ES 모듈이라 동적 import)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S;
test.before(async () => {
  D = await load('data.js');
  S = await load('sim.js');
});

// 결정적인 난수 (테스트 재현용)
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const run = (g, sec) => { for (let t = 0; t < sec; t += 1 / 60) S.step(g, 1 / 60); };

test('웨이브 1~20 정의, 보스는 5·10·15·20', () => {
  assert.equal(D.WAVES.length, 20);
  for (let w = 1; w <= 20; w++) {
    const def = D.waveDef(w);
    assert.ok(def.g.length > 0, `웨이브 ${w} 비어 있음`);
    for (const [type, n] of def.g) { assert.ok(D.ENEMIES[type], type); assert.ok(n > 0); }
    const isBoss = [5, 10, 15, 20].includes(w);
    assert.equal(!!def.boss, isBoss, `웨이브 ${w} 보스 여부`);
    if (def.boss) assert.ok(D.ENEMIES[def.boss].boss);
  }
  assert.deepEqual(D.RULES.bossWaves, [5, 10, 15, 20]);
  assert.ok(D.waveDef(21).g.length > 0, '무한 모드 웨이브');
});

test('카드는 서로 다른 3장이 나온다', () => {
  const g = S.createGame({ rng: seeded(7), noWaves: true });
  for (let i = 0; i < 300; i++) {
    g.wave = 1 + (i % 20);
    const cards = S.rollCards(g, 3);
    assert.equal(cards.length, 3);
    assert.equal(new Set(cards.map((c) => c.key)).size, 3, '중복 카드');
    // 가끔 적용해서 풀 상태를 바꿔 본다
    if (i % 3 === 0) S.applyCard(g, cards[0]);
  }
});

test('히든 영웅은 한 런에 두 번 나오지 않는다', () => {
  const g = S.createGame({ rng: seeded(3), noWaves: true });
  g.wave = 5;
  const seen = {};
  for (let i = 0; i < 50; i++) {
    const cards = S.rollCards(g, 3, { hiddenChance: 1 });
    const hidden = cards.filter((c) => c.rarity === 'hidden');
    assert.equal(new Set(hidden.map((c) => c.hero)).size, hidden.length, '한 번에 같은 히든 2장');
    for (const c of hidden) assert.ok(!seen[c.hero], `${c.hero} 두 번 등장`);
    if (hidden.length) { S.applyCard(g, hidden[0]); seen[hidden[0].hero] = true; }
  }
  assert.ok(Object.keys(seen).length >= 1);
  // 히든 확률 0 이면 절대 안 나온다
  const g2 = S.createGame({ rng: seeded(4), noWaves: true });
  g2.wave = 10;
  for (let i = 0; i < 100; i++) assert.ok(!S.rollCards(g2, 3, { hiddenChance: 0 }).some((c) => c.rarity === 'hidden'));
  // 웨이브 3 이하에서는 기본 확률로도 안 나온다
  g2.wave = 3;
  for (let i = 0; i < 200; i++) assert.ok(!S.rollCards(g2).some((c) => c.rarity === 'hidden'));
});

test('이한나 윙크 넉백은 남자 적에게만', () => {
  const g = S.createGame({ rng: seeded(5), noWaves: true, heroes: ['hanna'] });
  const h = g.heroes[0];
  const male = S.spawnEnemy(g, 'yeokko', h.x, 250, { hpMul: 100 });
  male.speed = 0;
  const mp = { hitIds: [], hero: h, dmg: 1, kb: 100, pierce: 0, critBonus: 0 };
  const y0 = male.y;
  S.hitEnemy(g, mp, male);
  run(g, 0.05); // 넉백 적용
  g.heroes.length = 0; // 추가 공격 방지
  run(g, 1);
  assert.ok(male.y < y0 - 60, `남자는 뒤로 밀려야 함 (${y0} → ${male.y})`);

  const g2 = S.createGame({ rng: seeded(5), noWaves: true, heroes: [] });
  const fem = S.spawnEnemy(g2, 'namkko', 150, 250, { hpMul: 100 });
  fem.speed = 0;
  const hh = { dmgDone: 0, kills: 0 };
  const hpBefore = fem.hp;
  S.hitEnemy(g2, { hitIds: [], hero: hh, dmg: 5, kb: 100, pierce: 0, critBonus: 0 }, fem);
  run(g2, 1);
  assert.equal(fem.y, 250, '여자는 밀리지 않음');
  assert.ok(fem.hp < hpBefore, '여자도 피해는 받음');
});

test('강성구 지팡이는 한 줄의 여러 적을 관통한다', () => {
  const g = S.createGame({ rng: seeded(9), noWaves: true, heroes: ['sunggu'] });
  const h = g.heroes[0];
  h.cd = 0;
  const line = [];
  for (let i = 0; i < 5; i++) {
    const e = S.spawnEnemy(g, 'thug', h.x, h.y - 120 - i * 50, { hpMul: 100 });
    e.speed = 0;
    line.push(e);
  }
  run(g, 1.6); // 한 번만 던질 시간
  const hit = line.filter((e) => e.hp < e.maxHp).length;
  assert.ok(hit >= 4, `지팡이가 ${hit}명만 맞춤`);
});

test('최은옥은 타이머가 지나면 분노 모드에 들어간다', () => {
  const g = S.createGame({ rng: seeded(2), noWaves: true, heroes: ['eunok'] });
  const h = g.heroes[0];
  const sober = D.HEROES.eunok.soberSec[0];
  run(g, sober - 1);
  assert.equal(h.rage, false);
  const normal = S.heroDamage(g, h);
  run(g, 1.5);
  assert.equal(h.rage, true, '분노 모드 진입');
  assert.ok(g.events.some((e) => e.type === 'rage'));
  assert.ok(S.heroDamage(g, h) > normal * 2);
  run(g, D.HEROES.eunok.rageSec[0] + 0.5);
  assert.equal(h.rage, false, '술 깸');
});

test('꼬충은 반대 성별 영웅을 홀린다', () => {
  const g = S.createGame({ rng: seeded(11), noWaves: true, heroes: ['gunman', 'gunnyeo'] });
  const e = S.spawnEnemy(g, 'yeokko', 150, g.ropeY - 50, { hpMul: 1000 }); // 여꼬충(남) → 여자 영웅
  run(g, 0.1);
  assert.ok(g.heroes.find((h) => h.id === 'gunnyeo').charmT > 0);
  assert.ok(!(g.heroes.find((h) => h.id === 'gunman').charmT > 0));
  assert.ok(e);
});

test('먹튀는 코인을 훔쳐 도망가고, 잡으면 돌려받는다', () => {
  const g = S.createGame({ rng: seeded(12), noWaves: true, heroes: [] });
  g.stats.coins = 50;
  g.wave = 2;
  const m = S.spawnEnemy(g, 'mukti', 150, g.ropeY - 10);
  run(g, 0.3);
  assert.ok(m.fleeing);
  assert.ok(g.stats.coins < 50);
  const stolen = m.stolen;
  S.damageEnemy(g, m, 9999, false, null);
  assert.ok(g.stats.coins >= 50 - stolen + stolen);
});

test('결과 요약은 서버 허용 범위 안 (점수·처치·코인 상한)', () => {
  const g = S.createGame({ rng: seeded(1), noWaves: true });
  g.stats.wavesCleared = 20; g.wave = 20; g.victory = true;
  g.stats.kills = 1500; g.stats.score = 150000; g.stats.coins = 3000;
  const s = S.summary(g, 900);
  assert.equal(s.wave, 20);
  assert.ok(s.score <= (s.wave + 1) * 50000);
  assert.ok(s.kills <= (s.wave + 1) * 400);
  assert.ok(Array.isArray(s.heroesUsed));
});
