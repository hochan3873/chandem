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
  assert.ok(S.heroDamage(g, h) > normal * 1.4);
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

test('먹튀는 경험치를 훔쳐 도망가고, 잡으면 보석으로 돌려받는다', () => {
  const g = S.createGame({ rng: seeded(12), noWaves: true, heroes: [] });
  g.exp = 5;
  g.need = 100;
  g.diff = 2;
  const m = S.spawnEnemy(g, 'mukti', 150, g.ropeY - 10);
  run(g, 0.3);
  assert.ok(m.fleeing, '도망 중');
  assert.ok(g.exp < 5, '경험치가 줄었다');
  const stolen = m.stolen;
  assert.ok(stolen > 0);
  const before = g.exp;
  S.damageEnemy(g, m, 9999, false, null);
  run(g, 2); // 보석이 저절로 날아와 먹힌다
  assert.ok(g.exp >= before + stolen - 1e-9, `되찾음 ${before} → ${g.exp}`);
});

test('결과 요약은 서버 허용 범위 안 (점수·처치 상한)', () => {
  const g = S.createGame({ rng: seeded(1), noWaves: true });
  g.endless = false;
  g.stats.wavesCleared = 20; g.wave = 20; g.victory = true;
  g.stats.kills = 1500; g.stats.score = 150000;
  const s = S.summary(g, 900);
  assert.equal(s.wave, 20);
  assert.ok(s.score <= (s.wave + 1) * 50000);
  assert.ok(s.kills <= (s.wave + 1) * 400);
  assert.ok(Array.isArray(s.heroesUsed));
});

// ─── 스테이지 모드 ───────────────────────────────────
// 한 판을 끝까지 (카드는 첫 장, 총공지는 바로)
function playOut(g, maxSec = 900) {
  while (!g.over && g.phase !== 'victory' && g.t < maxSec) {
    S.step(g, 1 / 60);
    g.events.length = 0;
    while (g.pendingLevels > 0) { S.applyCard(g, S.rollCards(g)[0]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; }
    if (g.ult >= D.RULES.ultMax) S.useUlt(g);
  }
  return g;
}

test('스테이지 30개: 5웨이브, x-5·x-10 보스, 난이도는 부드럽게 오르고 너무 튀지 않는다', () => {
  assert.equal(D.STAGE_COUNT, 30);
  let prevLast = 0;
  for (let s = 1; s <= 30; s++) {
    assert.equal(D.parseStage(D.stageLabel(s)), s);
    let prev = 0;
    for (let w = 1; w <= D.STAGE_WAVES; w++) {
      const def = D.stageWave(s, w);
      assert.ok(def.g.length > 0);
      for (const [type, n] of def.g) { assert.ok(D.ENEMIES[type], type); assert.ok(n > 0); }
      assert.ok(def.level > prev, `${D.stageLabel(s)} W${w} 난이도 증가`);
      assert.ok(def.level <= 29, `${D.stageLabel(s)} 난이도 ${def.level} ≤ 29 (스테이지는 무한 모드 가산 없음)`);
      assert.ok(D.hpMul(def.level, true) < 32, '체력 배율 32배 미만');
      if (w === 1) assert.ok(def.level <= 12, `${D.stageLabel(s)} 첫 웨이브는 새로 시작한 멤버도 버티게 (${def.level.toFixed(1)})`);
      prev = def.level;
      const boss = w === 5 && [5, 10].includes(D.stageNo(s));
      assert.equal(!!def.boss, boss, `${D.stageLabel(s)} W${w} 보스`);
      if (def.boss) assert.ok(D.ENEMIES[def.boss].boss);
    }
    if (D.stageNo(s) !== 1 && !D.stageBosses(s).length) assert.ok(prev >= prevLast - 2.6, `${D.stageLabel(s)} 앞 스테이지보다 너무 쉬워지지 않음`);
    prevLast = prev;
  }
  // 챕터마다 적이 늘어난다
  const has = (s, t) => D.stageEnemies(s).includes(t);
  assert.ok(!has(1, 'mukti') && has(3, 'mukti') && has(4, 'drunk'));
  assert.ok(!has(7, 'thug') && has(8, 'thug'));
  assert.ok(!has(10, 'scammer') && has(11, 'scammer') && has(12, 'inpi_gossip') && has(14, 'inpi_clique') && has(17, 'inpi_dictator'));
  assert.deepEqual(D.stageBosses(30), ['boss_inpi', 'boss_gapjil']);
  assert.equal(D.parseStage('4-1'), 0);
  assert.equal(D.parseStage('2-11'), 0);
});

test('별: 입구 70% 이상 ★★★, 35% 이상 ★★, 그 밖 ★', () => {
  assert.equal(D.starsFor(1), 3);
  assert.equal(D.starsFor(0.7), 3);
  assert.equal(D.starsFor(0.69), 2);
  assert.equal(D.starsFor(0.35), 2);
  assert.equal(D.starsFor(0.34), 1);
  assert.equal(D.starsFor(0.01), 1);
});

test('1-1 은 새로 시작한 사람도 무난히 ★★★, 5웨이브를 막으면 클리어', () => {
  for (let seed = 1; seed <= 3; seed++) {
    const g = playOut(S.createGame({ rng: seeded(seed), mode: 'stage', stage: 1, partner: 'gunman', unlocked: [] }));
    assert.equal(g.victory, true, `시드 ${seed} 클리어`);
    assert.equal(g.wave, 5);
    assert.equal(g.stars, 3);
    assert.ok(g.t > 40 && g.t < 240, `걸린 시간 ${g.t.toFixed(0)}초`);
    const sum = S.summary(g, g.t);
    assert.equal(sum.mode, 'stage');
    assert.equal(sum.stage, 1);
    assert.equal(sum.stars, 3);
    assert.ok(sum.durationSec >= D.STAGE_WAVES * 8, '서버 최소 시간 검사 통과');
  }
});

test('경험치 보석은 탭하지 않아도 저절로 모인다', () => {
  const g = S.createGame({ rng: seeded(21), noWaves: true, heroes: [] });
  g.need = 1000;
  const e = S.spawnEnemy(g, 'drunk', 180, 200);
  S.damageEnemy(g, e, 99999, false, null);
  assert.equal(g.gems.length, 1);
  assert.equal(typeof S.collectAt, 'undefined', '탭 수집 함수는 없어졌다');
  run(g, 1.5);
  assert.equal(g.gems.length, 0, '보석이 다 날아갔다');
  assert.ok(g.exp >= D.ENEMIES.drunk.exp);
});

test('이어하기: 웨이브 시작 상태를 저장했다가 그대로 복구, 시간은 이어서 센다', () => {
  const g = S.createGame({ rng: seeded(31), mode: 'stage', stage: 4, partner: 'staff', god: true, unlocked: [] });
  while (g.wave < 3) {
    S.step(g, 1 / 60);
    g.events.length = 0;
    while (g.pendingLevels > 0) { S.applyCard(g, S.rollCards(g)[0]); g.pendingLevels--; }
  }
  const snap = JSON.parse(JSON.stringify(g.lastSnap)); // localStorage 왕복
  assert.equal(snap.wave, 3);
  assert.equal(snap.stage, 4);
  assert.ok(snap.t > 20);
  const r = S.restoreGame(snap, { rng: seeded(32), god: true });
  assert.equal(r.mode, 'stage');
  assert.equal(r.stage, 4);
  assert.equal(r.level, snap.level);
  assert.equal(r.t, snap.t);
  assert.equal(r.base.hp, snap.base.hp);
  assert.deepEqual(r.heroes.map((h) => [h.id, h.lv, h.slot]), snap.heroes.map((h) => [h.id, h.lv, h.slot]));
  assert.deepEqual(r.stacks, snap.stacks);
  assert.equal(r.mods.dmg, snap.mods.dmg);
  assert.equal(r.phase, 'break');
  run(r, 4);
  assert.equal(r.wave, 3, '복구하면 저장한 웨이브를 처음부터');
  playOut(r);
  assert.equal(r.victory, true);
  const sum = S.summary(r, r.t);
  assert.ok(sum.durationSec >= Math.floor(snap.t), '앞부분 시간까지 합쳐서 보낸다');
});

test('해금하지 않은 히든·서명훈은 카드로 안 나온다', () => {
  const g = S.createGame({ rng: seeded(41), noWaves: true, unlocked: [] });
  g.wave = 10;
  for (let i = 0; i < 200; i++) {
    const cards = S.rollCards(g, 3, { hiddenChance: 1 });
    assert.ok(!cards.some((c) => c.hero && D.LOCKED_HEROES.includes(c.hero)), '잠긴 영웅 카드');
  }
  const g2 = S.createGame({ rng: seeded(42), noWaves: true, unlocked: ['eunok', 'myunghoon'] });
  g2.wave = 10;
  const seen = new Set();
  for (let i = 0; i < 200; i++) for (const c of S.rollCards(g2, 3, { hiddenChance: 1 })) if (c.hero && D.LOCKED_HEROES.includes(c.hero)) seen.add(c.hero);
  assert.deepEqual([...seen].sort(), ['eunok', 'myunghoon']);
});

test('아이템: 튼튼한 문 · 행운 부적 · 확성기 배터리 · 웰컴 드링크가 판에 적용된다', () => {
  const g = S.createGame({ rng: seeded(51), mode: 'stage', stage: 1, items: { door: 5, charm: 4, battery: 10, drink: 2 } });
  assert.equal(g.base.max, Math.round(D.RULES.baseHp * 1.5));
  assert.ok(Math.abs(g.mods.crit - (D.RULES.crit + 0.06)) < 1e-9);
  assert.ok(Math.abs(g.mods.ultCharge - 1.8) < 1e-9);
  assert.equal(g.pendingLevels, 2, '시작하자마자 카드 2장');
  assert.equal(g.welcomePicks, 2);
  const e = S.createGame({ mode: 'endless', items: { drink: 3 } });
  assert.equal(e.pendingLevels, 0, '웰컴 드링크는 스테이지에서만');
});

test('서명훈: 욕이 적을 기절시키고, 기절한 적에게 더 아프다', () => {
  const g = S.createGame({ rng: seeded(61), noWaves: true, heroes: ['myunghoon'] });
  const h = g.heroes[0];
  let stunned = 0;
  for (let i = 0; i < 40; i++) {
    const e = S.spawnEnemy(g, 'thug', 150, 250, { hpMul: 100 });
    S.hitEnemy(g, { hitIds: [], hero: h, dmg: 1, pierce: 0, critBonus: 0, stunChance: 0.4, stunSec: 1, swear: true, type: 'swear' }, e);
    if (e.stunT > 0) stunned++;
    e.dead = true;
  }
  assert.ok(stunned > 5 && stunned < 30, `기절 ${stunned}/40`);
  g.mods.crit = 0;
  const a = S.spawnEnemy(g, 'yeokko', 150, 250, { hpMul: 100 });
  const b = S.spawnEnemy(g, 'yeokko', 200, 250, { hpMul: 100 });
  b.stunT = 5;
  const p = () => ({ hitIds: [], hero: h, dmg: 10, pierce: 0, critBonus: 0, swear: true, type: 'swear' });
  S.hitEnemy(g, p(), a);
  S.hitEnemy(g, p(), b);
  assert.ok(b.maxHp - b.hp > (a.maxHp - a.hp) * 1.4, '기절한 적 추가 피해');
});

test('인피 독재자 곁의 진상은 덜 아프고, 패거리는 뭉치면 단단하지만 범위 공격에 약하다', () => {
  const g = S.createGame({ rng: seeded(71), noWaves: true, heroes: [] });
  const d = S.spawnEnemy(g, 'inpi_dictator', 180, 200, { hpMul: 100 });
  const near = S.spawnEnemy(g, 'yeokko', 200, 210, { hpMul: 100 });
  const far = S.spawnEnemy(g, 'yeokko', 40, 420, { hpMul: 100 });
  for (const e of [d, near, far]) e.speed = 0;
  run(g, 1 / 60);
  S.damageEnemy(g, near, 100, false, null);
  S.damageEnemy(g, far, 100, false, null);
  assert.ok(near.maxHp - near.hp < (far.maxHp - far.hp) * 0.8, '독재자 오라 피해 감소');

  const g2 = S.createGame({ rng: seeded(72), noWaves: true, heroes: [] });
  const pack = [0, 1, 2, 3].map((i) => { const e = S.spawnEnemy(g2, 'inpi_clique', 150 + i * 16, 200, { hpMul: 100 }); e.speed = 0; return e; });
  run(g2, 1 / 60);
  assert.equal(pack[0].packN, 3);
  const hp0 = pack[0].hp;
  S.damageEnemy(g2, pack[0], 100, false, null);
  const single = hp0 - pack[0].hp;
  const hp1 = pack[1].hp;
  S.damageEnemy(g2, pack[1], 100, false, null, true);
  const aoe = hp1 - pack[1].hp;
  assert.ok(single < 70 && aoe > 95, `단일 ${single.toFixed(0)} · 범위 ${aoe.toFixed(0)}`);
});

test('가입인사 사기꾼: 예쁜 프사 → 들켰다! (약점) → 실물 로 바뀐다', () => {
  const g = S.createGame({ rng: seeded(81), noWaves: true, heroes: [] });
  const e = S.spawnEnemy(g, 'scammer', 180, 150, { hpMul: 100 });
  e.speed = 0; e.baseSpeed = 0;
  assert.equal(e.form, 'pretty');
  const seen = new Set();
  let revealHit = 0, prettyHit = 0;
  for (let t = 0; t < 20; t += 1 / 60) {
    S.step(g, 1 / 60);
    g.events.length = 0;
    seen.add(e.form);
    if (e.form === 'reveal' && !revealHit) { const h0 = e.hp; S.damageEnemy(g, e, 10, false, null); revealHit = h0 - e.hp; }
    if (e.form === 'pretty' && !prettyHit && e.age > 0.5) { const h0 = e.hp; S.damageEnemy(g, e, 10, false, null); prettyHit = h0 - e.hp; }
  }
  assert.ok(seen.has('reveal') && (seen.has('ugly') || seen.has('fat')), [...seen].join(','));
  assert.ok(revealHit > prettyHit * 1.3, '들켰다! 때 더 아프다');
});

test('인피 뒷담러는 멀리서 뒷담화를 던져 멤버 공격 속도를 늦춘다', () => {
  const g = S.createGame({ rng: seeded(91), noWaves: true, heroes: ['gunman'] });
  const e = S.spawnEnemy(g, 'inpi_gossip', 180, g.ropeY - 200, { hpMul: 1000 });
  g.heroes[0].stunT = 99; // 영웅이 쏘지 않게
  run(g, 5);
  assert.ok(e.atRope, '멀찍이 멈춤');
  assert.ok(e.y < g.ropeY - 120, '로프까지 오지 않는다');
  const h = g.heroes[0];
  assert.ok(h.rumorT > 0, '뒷담화에 맞음');
  h.stunT = 0;
  assert.ok(S.heroInterval(g, h) > h.def.interval * 1.3, '공격 속도 느려짐');
});

test('인피 행동대장 "무릎 꿇어!" 기절 · 인피 대장 "오리고기 회식" 회복', () => {
  const g = S.createGame({ rng: seeded(101), noWaves: true, heroes: ['gunman', 'staff'] });
  const b = S.spawnEnemy(g, 'boss_gapjil', 180, 200, { hpMul: 100 });
  b.speed = 0;
  let kneel = false;
  for (let t = 0; t < 6; t += 1 / 60) { S.step(g, 1 / 60); if (g.events.some((x) => x.type === 'kneel')) kneel = true; g.events.length = 0; }
  assert.ok(kneel, '무릎 꿇어!');
  const g2 = S.createGame({ rng: seeded(102), noWaves: true, heroes: [] });
  const boss = S.spawnEnemy(g2, 'boss_inpi', 180, 200, { hpMul: 100 });
  const minion = S.spawnEnemy(g2, 'drunk', 200, 230, { hpMul: 100 });
  boss.speed = 0; minion.speed = 0;
  minion.hp = minion.maxHp * 0.3;
  let feast = false;
  for (let t = 0; t < 8; t += 1 / 60) { S.step(g2, 1 / 60); if (g2.events.some((x) => x.type === 'feast')) feast = true; g2.events.length = 0; }
  assert.ok(feast, '오리고기 회식');
  assert.ok(minion.hp > minion.maxHp * 0.5, '졸개 회복');
});

test('이한나 윙크 넉백: 사거리 밖으로 안 밀리고, 연달아 맞으면 덜 밀리고, 보스는 안 밀린다', () => {
  const g = S.createGame({ rng: seeded(111), noWaves: true, heroes: [] });
  const e = S.spawnEnemy(g, 'thug', 180, g.rowY - 200, { hpMul: 100 });
  e.speed = 0;
  S.applyKnockback(e, 500, g);
  run(g, 1.5);
  assert.ok(e.y >= g.rowY - D.RULES.kbMaxReach - 1, `사거리 안 (${e.y.toFixed(0)})`);
  const e2 = S.spawnEnemy(g, 'thug', 100, g.rowY - 60, { hpMul: 100 });
  e2.speed = 0;
  const y0 = e2.y;
  S.applyKnockback(e2, 60, g); run(g, 1);
  const d1 = y0 - e2.y;
  const y1 = e2.y;
  S.applyKnockback(e2, 60, g); run(g, 1);
  const d2 = y1 - e2.y;
  assert.ok(d2 < d1 * 0.7, `두 번째는 덜 밀림 ${d1.toFixed(0)} → ${d2.toFixed(0)}`);
  const boss = S.spawnEnemy(g, 'boss_thug', 180, 200, { hpMul: 100 });
  S.applyKnockback(boss, 100, g);
  assert.equal(boss.kbv, 0, '보스는 안 밀린다');
});

test('이한나 만렙이어도 웨이브가 제시간에 끝난다 (적이 영원히 밀려나지 않음)', () => {
  const g = S.createGame({ rng: seeded(121), mode: 'endless', heroes: ['hanna'], unlocked: [] });
  g.heroes[0].lv = 5;
  g.god = true;
  while (g.wave < 1) S.step(g, 1 / 60);
  let t = 0;
  while (g.stats.wavesCleared < 1 && t < 120) { S.step(g, 1 / 60); g.events.length = 0; g.pendingLevels = 0; t += 1 / 60; }
  assert.ok(g.stats.wavesCleared >= 1, `웨이브 1이 ${t.toFixed(0)}초 안에 끝나야 함`);
  // 남자만 나오는 웨이브도
  const g2 = S.createGame({ rng: seeded(122), noWaves: true, heroes: ['hanna'] });
  g2.heroes[0].lv = 5;
  for (let i = 0; i < 12; i++) S.spawnEnemy(g2, i % 2 ? 'thug' : 'yeokko', 30 + i * 27, -20 - i * 10);
  let tt = 0;
  while (g2.enemies.some((e) => !e.dead) && tt < 150) { S.step(g2, 1 / 60); g2.events.length = 0; tt += 1 / 60; }
  assert.ok(!g2.enemies.some((e) => !e.dead), `남자 12명을 ${tt.toFixed(0)}초 안에 전부 처리`);
});

// ─── 서버 규칙과 화면 규칙이 같은지 ─────────────────────
test('보상 · 강화 비용 · 아이템 · 해금: 서버(langbang-rules.js)와 화면(data.js) 공식이 같다', () => {
  const R = require('../server/langbang-rules');
  assert.deepEqual(R.LB_HEROES.slice().sort(), Object.keys(D.HEROES).sort(), '영웅 목록');
  assert.deepEqual(R.LOCKED.slice().sort(), D.LOCKED_HEROES.slice().sort());
  assert.deepEqual(R.HERO_UNLOCK, D.HERO_UNLOCK);
  assert.equal(R.META_MAX, D.META_MAX);
  assert.equal(R.STAGE_COUNT, D.STAGE_COUNT);
  assert.equal(R.STAGE_WAVES, D.STAGE_WAVES);
  assert.equal(R.ENDLESS_UNLOCK, D.ENDLESS_UNLOCK);
  for (let lv = 0; lv <= 20; lv++) assert.equal(R.metaCost(lv), D.metaCost(lv), `강화 ${lv}`);
  assert.deepEqual(R.ITEM_IDS, D.ITEM_IDS);
  for (const id of R.ITEM_IDS) {
    assert.equal(R.ITEMS[id].max, D.ITEMS[id].max);
    for (let lv = 0; lv <= 11; lv++) { assert.equal(R.itemCost(id, lv), D.itemCost(id, lv), `${id} ${lv}`); assert.equal(R.itemValue(id, lv), D.itemValue(id, lv)); }
  }
  for (let s = 1; s <= 30; s++) {
    for (let st = 1; st <= 3; st++) for (let prev = 0; prev <= 3; prev++) for (const c of [0, 5, 10]) assert.deepEqual(R.stageReward(s, st, prev, c), D.stageReward(s, st, prev, c));
    assert.equal(R.stageLabel(s), D.stageLabel(s));
  }
  for (const w of [0, 5, 20, 37]) assert.equal(R.endlessReward(w, 3), D.endlessReward(w, 3));
});

test('보상 계산: 첫 클리어 보너스가 크고, 새 별마다 보너스, 다시 깨면 기본 보상만', () => {
  const first = D.stageReward(7, 2, 0);
  const again = D.stageReward(7, 2, 2);
  const more = D.stageReward(7, 3, 2);
  assert.ok(first.first > 0 && first.newStars === 2);
  assert.equal(again.first, 0);
  assert.equal(again.newStars, 0);
  assert.equal(again.total, again.clear);
  assert.equal(more.newStars, 1);
  assert.ok(more.total > again.total && first.total > more.total);
  assert.ok(D.stageReward(30, 3, 3).total > D.stageReward(1, 3, 3).total * 5, '뒤 스테이지일수록 많이');
  assert.ok(D.stageReward(5, 3, 0, 10).total > D.stageReward(5, 3, 0, 0).total * 1.5, '단골 쿠폰');
});

// ─── 새 악당: 골목 사채업자 · 인피 총무 · 진상 연합 회장 ─────────
test('골목 사채업자(1-5 보스): "이자 붙었다!" 입구를 점점 더 떼어 가고, 잡으면 "빚 탕감!"', () => {
  assert.deepEqual(D.stageBosses(5), ['boss_loan']);
  const g = S.createGame({ rng: seeded(131), noWaves: true, heroes: [] });
  const b = S.spawnEnemy(g, 'boss_loan', 180, 200, { hpMul: 100 });
  b.speed = 0;
  const hits = [];
  for (let t = 0; t < 26; t += 1 / 60) { S.step(g, 1 / 60); for (const e of g.events) if (e.type === 'interest') hits.push(e.v); g.events.length = 0; }
  assert.ok(hits.length >= 3, `이자 ${hits.length}번`);
  assert.ok(hits[hits.length - 1] > hits[0], `점점 비싸진다 ${hits.join(',')}`);
  const lost = g.base.max - g.base.hp;
  assert.ok(lost > 0 && lost < g.base.max * 0.2, `떼인 양 ${lost.toFixed(0)} — 너무 가혹하지 않게`);
  S.damageEnemy(g, b, 1e9, false, null);
  assert.ok(g.events.some((e) => e.type === 'debtFree'), '빚 탕감');
  assert.ok(g.base.max - g.base.hp < lost * 0.5, '떼어 간 것의 대부분을 돌려받음');
});

test('사채업자 차용증은 맞은 멤버 공격 속도를 잠깐 늦춘다', () => {
  const g = S.createGame({ rng: seeded(132), noWaves: true, heroes: ['gunman'] });
  const b = S.spawnEnemy(g, 'boss_loan', 180, 200, { hpMul: 100 });
  b.speed = 0;
  const h = g.heroes[0];
  h.stunT = 99;
  run(g, 3.5);
  assert.ok(h.paperT > 0, '차용증 맞음');
  h.stunT = 0;
  assert.ok(S.heroInterval(g, h) > h.def.interval * 1.3);
});

test('인피 총무: 뒤에 멀찍이 서서 주변 진상에게 "회비 지원!" 보호막, 3챕터부터 (2-8부터 가끔)', () => {
  assert.ok(!D.stageEnemies(17).includes('inpi_treasurer') && D.stageEnemies(18).includes('inpi_treasurer') && D.stageEnemies(21).includes('inpi_treasurer'));
  const g = S.createGame({ rng: seeded(141), noWaves: true, heroes: [] });
  const t = S.spawnEnemy(g, 'inpi_treasurer', 180, 100, { hpMul: 100 });
  const o = S.spawnEnemy(g, 'thug', 200, 150, { hpMul: 1 });
  o.speed = 0;
  let sh = false;
  for (let k = 0; k < 4 * 60; k++) { S.step(g, 1 / 60); if (g.events.some((e) => e.type === 'shield' && e.enemy === 'inpi_treasurer')) sh = true; g.events.length = 0; }
  assert.ok(sh, '회비 지원!');
  assert.ok(o.shield > 0, '보호막');
  assert.ok(t.shield === 0, '자기는 안 씌움');
  run(g, 8);
  assert.ok(t.atRope && t.y < g.ropeY - 200, '뒤에 멈춰 선다');
  assert.ok(t.maxHp < ENEMIES_HP_THUG(), '체력은 낮다');
});
function ENEMIES_HP_THUG() { return D.ENEMIES.thug.hp * 100; }

test('진상 연합 회장: 무한 도전 25·35·45웨이브 보스, 단계마다 다른 악당 기술', () => {
  assert.equal(D.waveDef(25).boss, 'boss_union');
  assert.equal(D.waveDef(35).boss, 'boss_union');
  assert.notEqual(D.waveDef(30).boss, 'boss_union');
  assert.notEqual(D.waveDef(20).boss, 'boss_union');
  for (let s = 1; s <= 30; s++) assert.ok(!D.stageEnemies(s).includes('boss_union'), '스테이지엔 안 나옴');
  const g = S.createGame({ rng: seeded(151), noWaves: true, heroes: ['gunman', 'staff'] });
  const b = S.spawnEnemy(g, 'boss_union', 180, 200, { hpMul: 100 });
  b.speed = 0;
  const minion = S.spawnEnemy(g, 'drunk', 200, 230, { hpMul: 100 });
  minion.speed = 0;
  minion.hp = minion.maxHp * 0.2;
  const phases = [], seen = new Set();
  for (let t = 0; t < 42; t += 1 / 60) {
    S.step(g, 1 / 60);
    for (const e of g.events) { if (e.type === 'unionPhase') phases.push(e.phase); seen.add(e.type); }
    g.events.length = 0;
    g.heroes.forEach((h) => { h.cd = 99; }); // 영웅은 쏘지 않게
  }
  assert.deepEqual(phases.slice(0, 5), ['kneel', 'feast', 'aura', 'interest', 'shieldAura']);
  for (const k of ['kneel', 'feast', 'interest', 'shield']) assert.ok(seen.has(k), k);
  assert.ok(g.base.hp < g.base.max, '이자 단계에 입구가 떼였다');
});

// ─── 공격 방식 · 상성 · 스킬 · 맵 효과 · 새 빌런 · 새 멤버 ─────────
const bare = (heroes = [], extra = {}) => S.createGame(Object.assign({ rng: seeded(900 + heroes.length), noWaves: true, heroes, unlocked: D.LOCKED_HEROES }, extra));
const still = (g, type, x, y, hpm = 100) => { const e = S.spawnEnemy(g, type, x, y, { hpMul: hpm }); e.speed = 0; e.baseSpeed = 0; return e; };

test('멤버마다 사거리 · 공격 간격 · 공격 방식 · 스킬이 전부 다르다', () => {
  const H = Object.values(D.HEROES);
  const rng = H.map((h) => (Array.isArray(h.range) ? h.range[0] : h.range));
  assert.equal(new Set(rng).size, H.length, `사거리 겹침 ${rng.join(',')}`);
  assert.equal(new Set(H.map((h) => h.interval)).size, H.length, '공격 간격 겹침');
  assert.equal(new Set(H.map((h) => h.skill.id)).size, H.length, '스킬 겹침');
  assert.ok(new Set(H.map((h) => h.proj)).size >= H.length - 1, '공격 방식');
  for (const h of H) { assert.ok(D.ATTRS[h.attr], h.id); assert.ok(h.attack && h.skill.name && h.skill.cd >= 12 && h.skill.cd <= 30, h.id); }
  const cnt = {};
  for (const h of H) cnt[h.attr] = (cnt[h.attr] || 0) + 1;
  assert.deepEqual(cnt, { talk: 3, power: 3, charm: 3, booze: 3 });
});

test('상성: 속성마다 강한 계열 2개 · 약한 계열 1개, 피해에 강함/약함 배율이 붙는다', () => {
  for (const a of Object.keys(D.ATTRS)) {
    const row = Object.keys(D.CLASSES).map((c) => D.typeMul(a, c));
    assert.equal(row.filter((m) => m > 1).length, 2, a);
    assert.equal(row.filter((m) => m < 1).length, 1, a);
  }
  for (const e of Object.values(D.ENEMIES)) assert.ok(D.CLASSES[e.cls], `${e.id} 계열`);
  const g = bare(['gunman']);
  const h = g.heroes[0];
  const thug = still(g, 'thug', 100, 200), yeo = still(g, 'yeokko', 200, 200);
  thug.armor = 0;
  S.damageEnemy(g, thug, 100, false, h);
  S.damageEnemy(g, yeo, 100, false, h);
  assert.equal(Math.round(thug.maxHp - thug.hp), Math.round(100 * D.TYPE_STRONG), '힘 → 폭력형 효과 굉장');
  assert.equal(Math.round(yeo.maxHp - yeo.hp), Math.round(100 * D.TYPE_WEAK), '힘 → 유혹형 별로');
  assert.ok(g.events.some((e) => e.type === 'eff'));
  // 스테이지마다 추천 속성이 달라진다 (팀을 바꿔 가며)
  const recs = new Set();
  for (let s = 1; s <= 30; s++) recs.add(D.recommendAttrs(s).join('/'));
  assert.ok(recs.size >= 3, [...recs].join(' | '));
  assert.equal(D.partnerSlots(0), 1);
  assert.equal(D.partnerSlots(9), 1);
  assert.equal(D.partnerSlots(10), 2);
});

test('공격 방식: 방장 음파는 여러 명 · 건전녀 폭탄은 떨어진 곳 범위 · 서명훈 욕은 3명 이상 튕김 · 이한나 레이저는 점점 세진다', () => {
  let g = bare(['bangjang']);
  const row = [0, 1, 2, 3].map((i) => still(g, 'yeokko', 130 + i * 14, g.rowY - 150));
  S.fire(g, g.heroes[0], row[0]);
  assert.ok(row.filter((e) => e.hp < e.maxHp).length >= 3, '음파 여러 명');
  g = bare(['gunnyeo']);
  const pack = [0, 1, 2].map((i) => still(g, 'drunk', 170 + i * 12, g.rowY - 200));
  S.fire(g, g.heroes[0], pack[1]);
  assert.ok(pack.every((e) => e.hp === e.maxHp), '던진 직후엔 아직');
  run(g, 0.8);
  assert.ok(pack.filter((e) => e.hp < e.maxHp).length >= 2, '떨어지며 범위 피해');
  g = bare(['myunghoon']);
  const line = [0, 1, 2, 3].map((i) => still(g, 'thug', 150 + i * 40, g.rowY - 180));
  g.heroes[0].lv = 3;
  S.fire(g, g.heroes[0], line[0]);
  run(g, 1);
  assert.ok(line.filter((e) => e.hp < e.maxHp).length >= 3, '연쇄 욕');
  g = bare(['hanna']);
  const t = still(g, 'namkko', 150, g.rowY - 150, 1000);
  run(g, 0.5);
  const d1 = t.maxHp - t.hp;
  run(g, 2);
  const d2 = t.maxHp - t.hp - d1;
  assert.ok(d2 > d1 * 3.2, `레이저가 세진다 ${d1.toFixed(0)} → ${d2.toFixed(0)} (2초 / 0.5초)`);
});

test('스킬: 모든 멤버 스킬이 쿨타임과 효과를 가진다', () => {
  const ids = Object.keys(D.HEROES);
  const g = bare([]);
  g.base.hp = g.base.max * 0.5;
  for (const id of ids.slice(0, 6)) S.addHero(g, id);
  const g2 = bare([]);
  for (const id of ids.slice(6)) S.addHero(g2, id);
  for (const G of [g, g2]) {
    for (let i = 0; i < 8; i++) still(G, i % 2 ? 'yeokko' : 'thug', 120 + i * 18, G.rowY - 160);
    for (const h of G.heroes) {
      assert.ok(h.skillCd > 0, '처음엔 충전 중');
      assert.equal(S.castSkill(G, h, 180, G.rowY - 160), false);
      h.skillCd = 0;
      assert.ok(S.castSkill(G, h, 180, G.rowY - 160), h.id);
      assert.equal(h.skillCd, h.def.skill.cd);
    }
  }
  assert.ok(g.rallyT > 0, '집합!');
  assert.ok(g.base.hp > g.base.max * 0.5, '응급처치 회복');
  assert.ok(g.enemies.some((e) => e.slowT > 0), '레드카드 감속');
  assert.ok(g.enemies.some((e) => e.stunT > 0), '쌍욕 폭격 기절');
  assert.ok(g.heroes.find((h) => h.id === 'gunman').frenzyT > 0, '난사');
  assert.ok(g2.heroes.find((h) => h.id === 'eunok').rage, '원샷');
  assert.ok(g2.projs.filter((p) => p.type === 'cane').length >= 7, '지팡이 회오리');
  assert.ok(g2.projs.filter((p) => p.type === 'moto').length >= 3, '3대 500');
  assert.equal(g2.heroes.find((h) => h.id === 'donghan').meter, 100, '진심 모드');
});

test('자리 바꾸기: 끌어다 놓으면 두 멤버가 자리를 바꾸고, 잠깐 쿨타임', () => {
  const g = bare(['bangjang', 'gunman']);
  const [a, b] = g.heroes;
  const sa = a.slot, sb = b.slot;
  assert.ok(S.swapHeroes(g, a, sb));
  assert.equal(a.slot, sb); assert.equal(b.slot, sa);
  assert.equal(S.swapHeroes(g, a, sa), false, '쿨타임');
  run(g, 1.5);
  assert.ok(S.swapHeroes(g, a, 0));
  assert.equal(a.x, D.SLOT_X[0]);
});

test('맵 효과: 비(느림·사거리↓) · 안개(먼 사거리↓, 말빨 그대로) · 노래방(말빨↑) · 공사 중(가운데로) · 정전 · 확성기', () => {
  const mk = (fx, heroes = ['gunman', 'staff', 'bangjang']) => S.createGame({ rng: seeded(77), mode: 'stage', stage: 3, mapFx: fx, heroes });
  const n = mk('none'), r = mk('rain'), f = mk('fog'), k = mk('karaoke'), c = mk('construction');
  const gm = (g) => g.heroes.find((h) => h.id === 'gunman'), st = (g) => g.heroes.find((h) => h.id === 'staff');
  assert.ok(S.heroRange(r, gm(r)) < S.heroRange(n, gm(n)));
  assert.ok(S.heroRange(f, gm(f)) < S.heroRange(n, gm(n)) * 0.85, '안개: 먼 사거리');
  assert.equal(S.heroRange(f, st(f)), S.heroRange(n, st(n)), '안개: 말빨은 그대로');
  assert.ok(S.heroDamage(k, st(k)) > S.heroDamage(n, st(n)) * 1.2, '노래방: 말빨↑');
  for (let i = 0; i < 20; i++) { const e = S.spawnEnemy(c, 'yeokko'); assert.ok(e.x >= 96 && e.x <= 264, '공사 중: 가운데로'); }
  const e1 = S.spawnEnemy(n, 'thug'), e2 = S.spawnEnemy(r, 'thug');
  assert.ok(e2.speed < e1.speed * 0.97 || e2.speed < 25, '비: 느림');
  const b = mk('blackout');
  b.phase = 'wave'; b.spawnQ = [{ type: 'yeokko', at: 999 }]; b.spawnI = 0;
  for (let t = 0; t < 10.5; t += 1 / 60) S.step(b, 1 / 60);
  assert.ok(b.darkT > 0, '정전');
  assert.ok(S.heroRange(b, gm(b)) <= 190, '정전 중엔 가까운 적만');
  assert.ok(S.heroRange(b, gm(b), true) > 400, '지목은 보인다');
  assert.equal(D.stageFx(1).id, 'none');
  assert.ok(new Set(Array.from({ length: 30 }, (_, i) => D.stageFx(i + 1).id)).size >= 8, '맵 효과 여러 가지');
});

test('새 빌런: 토 · 애정행각 · 손진상 · 가오충 · 셀카 · 새치기 · 꼰대 · 단톡방', () => {
  // 토하는 인간: 멤버 발밑 토 → 공속↓, 죽으면 진상 가속 웅덩이
  let g = bare(['gunman']);
  const v = still(g, 'vomit', 180, g.ropeY - 100);
  g.heroes[0].stunT = 99;
  run(g, 3.5);
  assert.ok(g.puddles.some((q) => !q.enemy), '토');
  assert.ok(g.heroes[0].vomitT > 0);
  S.damageEnemy(g, v, 1e9, false, null);
  assert.ok(g.puddles.some((q) => q.enemy), '죽으면 웅덩이');
  // 애정행각: 안 맞으면 회복, 반 넘게 맞으면 둘로
  g = bare([]);
  const c = still(g, 'couple', 180, 200);
  c.hp = c.maxHp * 0.7;
  run(g, 3);
  assert.ok(c.hp > c.maxHp * 0.72, '꽁냥꽁냥 회복');
  S.damageEnemy(g, c, c.hp - c.maxHp * 0.4, false, null);
  assert.ok(c.dead && g.enemies.filter((e) => !e.dead).length === 2, '헤어져!');
  // 손진상: 붙잡으면 못 쏨, 잡으면 풀림
  g = bare(['gunman', 'staff']);
  const hs = still(g, 'handsy', 180, g.ropeY - 10);
  hs.atRope = true;
  run(g, 0.2);
  const grabbed = g.heroes.find((h) => h.grabT > 0);
  assert.ok(grabbed, '붙잡힘');
  S.damageEnemy(g, hs, 1e9, false, null);
  assert.equal(grabbed.grabT, 0, '풀려남');
  // 가오충: 가오 중 -60%, 말빨 공격에 깨지면 +30%
  g = bare(['gunman', 'staff']);
  const gao = still(g, 'gao', 180, 200);
  gao.armor = 0;
  const gm = g.heroes[0], stf = g.heroes[1];
  g.mods.crit = 0;
  let h0 = gao.hp; S.damageEnemy(g, gao, 100, false, gm); const armored = h0 - gao.hp;
  S.damageEnemy(g, gao, 1, false, stf);
  assert.equal(gao.gaoOn, false, '가오 깨짐');
  h0 = gao.hp; S.damageEnemy(g, gao, 100, false, gm); const broken = h0 - gao.hp;
  assert.ok(broken > armored * 2.5, `${armored.toFixed(0)} → ${broken.toFixed(0)}`);
  // 셀카: 눈부신 멤버는 빗나감
  g = bare(['gunman']);
  const sf = still(g, 'selfie', 180, g.ropeY - 150);
  sf.atRope = true;
  g.heroes[0].stunT = 99;
  run(g, 4.1);
  assert.ok(g.heroes[0].blindT > 0, '찰칵!');
  const dummy = still(g, 'thug', 100, 200);
  let miss = 0;
  for (let i = 0; i < 40; i++) if (S.damageEnemy(g, dummy, 1, false, g.heroes[0]) === 0) miss++;
  assert.ok(miss > 8 && miss < 32, `빗나감 ${miss}/40`);
  // 새치기꾼: 앞줄 근처에서 훌쩍
  g = bare([]);
  const ct = S.spawnEnemy(g, 'cutter', 180, g.ropeY - 300);
  let jumped = false;
  for (let t = 0; t < 3; t += 1 / 60) { S.step(g, 1 / 60); if (g.events.some((x) => x.type === 'vault')) jumped = true; g.events.length = 0; }
  assert.ok(jumped && ct.vaulted);
  // 꼰대: 근처 멤버 졸림, 기절시키면 조용 · 백인규는 안 졸림
  g = bare(['gunman', 'ingyu']);
  const kk = still(g, 'kkondae', 180, g.rowY - 120);
  run(g, 0.1);
  assert.ok(g.heroes[0].drowsyT > 0, '라떼는 말이야~');
  assert.ok(!(g.heroes[1].drowsyT > 0), '운동 루틴');
  kk.stunT = 1;
  run(g, 0.5);
  assert.ok(kk.latteOffT > 0);
  // 단톡방: 죽으면 알림 3개
  g = bare([]);
  const sp = still(g, 'spam', 180, 150);
  S.damageEnemy(g, sp, 1e9, false, null);
  assert.equal(g.enemies.filter((e) => !e.dead && e.type === 'spam_dot').length, 3);
  // 스테이지에 고르게 퍼져 있다
  const first = (t) => { for (let s = 1; s <= 30; s++) if (D.stageEnemies(s).includes(t)) return s; return 99; };
  assert.ok(first('vomit') <= 10 && first('cutter') <= 10);
  for (const t of ['couple', 'selfie', 'handsy', 'gao']) assert.ok(first(t) > 10 && first(t) <= 20, t);
  for (const t of ['kkondae', 'spam']) assert.ok(first(t) > 20, t);
  assert.ok(D.waveDef(24).g.some(([t]) => t === 'kkondae'), '무한 도전에도');
});

test('새 멤버: 백인규(탱커) 가 기술을 대신 맞고 짧게 · 김도훈 떼창 회복 · 문동한 간보다가 한 줄 빔', () => {
  let g = bare(['gunman', 'ingyu']);
  const hs = still(g, 'handsy', 40, g.ropeY - 10);
  hs.atRope = true;
  run(g, 0.2);
  const ing = g.heroes.find((h) => h.id === 'ingyu');
  assert.ok(ing.grabT > 0 && ing.grabT < 2, '백인규가 대신 · 짧게');
  assert.ok(!(g.heroes[0].grabT > 0));
  g = bare(['dohoon']);
  g.phase = 'wave';
  g.base.hp = g.base.max * 0.5;
  run(g, 5);
  assert.ok(g.base.hp > g.base.max * 0.51, '떼창 회복');
  g = bare(['donghan']);
  g.phase = 'wave';
  const col = [0, 1, 2, 3, 4].map((i) => still(g, 'yeokko', 200, 100 + i * 60, 3));
  g.spawnQ = [{ type: 'yeokko', at: 999 }];
  let burst = false;
  for (let t = 0; t < 20 && !burst; t += 1 / 60) { S.step(g, 1 / 60); if (g.events.some((x) => x.type === 'burst')) burst = true; g.events.length = 0; }
  assert.ok(burst, '빔');
  assert.ok(col.filter((e) => e.dead || e.hp < e.maxHp * 0.5).length >= 4, '한 줄이 싹');
});

test('무한 도전: 아직 해금 안 한 멤버도 카드로 "체험 합류"', () => {
  const g = S.createGame({ rng: seeded(501), mode: 'endless', noWaves: true, unlocked: [], trialAll: true });
  g.wave = 10;
  const seen = new Set();
  for (let i = 0; i < 300; i++) for (const c of S.rollCards(g, 3, { hiddenChance: 1 })) if (c.kind === 'addHero' && D.LOCKED_HEROES.includes(c.hero)) { seen.add(c.hero); assert.match(c.title, /체험 합류/); }
  assert.ok(seen.size >= 3, [...seen].join(','));
  const st = S.createGame({ rng: seeded(502), mode: 'stage', stage: 5, noWaves: true, unlocked: [] });
  st.wave = 3;
  for (let i = 0; i < 200; i++) assert.ok(!S.rollCards(st, 3, { hiddenChance: 1 }).some((c) => c.hero && D.LOCKED_HEROES.includes(c.hero)), '스테이지에선 안 나옴');
});

test('도감: 판에서 만난 진상이 결과에 들어가고, 서버 진상 목록이 화면 목록과 같다', () => {
  const R = require('../server/langbang-rules');
  assert.deepEqual(R.ENEMY_IDS.slice().sort(), Object.keys(D.ENEMIES).filter((id) => !D.ENEMIES[id].dot).sort());
  const g = S.createGame({ rng: seeded(503), noWaves: true, heroes: [] });
  S.spawnEnemy(g, 'gao', 100, 100); S.spawnEnemy(g, 'spam_dot', 100, 100);
  assert.deepEqual(S.summary(g, 1).seen, ['gao']);
});

test('김영준: 제일 몰린 곳으로 뛰어들어 연속 베기(가오 무시) → 돌아와 크로스핏, 뛰어든 동안엔 기술 대상이 아님', () => {
  const g = S.createGame({ rng: seeded(601), noWaves: true, heroes: ['youngjun', 'gunman'], unlocked: D.LOCKED_HEROES });
  const yj = g.heroes[0];
  const gao = S.spawnEnemy(g, 'gao', yj.x, g.rowY - 200, { hpMul: 100 });
  gao.speed = 0;
  run(g, 0.3);
  assert.ok(yj.out, '뛰어들었다');
  run(g, 1.2);
  assert.ok(Math.hypot(yj.px - gao.x, yj.py - gao.y) < 60, '적 옆으로 이동');
  assert.ok(gao.hp < gao.maxHp, '베었다');
  assert.equal(gao.gaoOn, true, '측면 공격은 가오를 깨지 않지만');
  const h0 = gao.hp;
  run(g, 0.5);
  assert.ok(h0 - gao.hp > S.heroDamage(g, yj) * 2, '가오 무시 피해');
  run(g, 1.3);
  assert.ok(!yj.out && yj.restT > 0, '돌아와서 크로스핏');
  // 붙잡기는 뛰어든 멤버 말고 줄에 있는 멤버를
  const g2 = S.createGame({ rng: seeded(602), noWaves: true, heroes: ['youngjun', 'gunman'], unlocked: D.LOCKED_HEROES });
  g2.heroes[0].out = true;
  const hs = S.spawnEnemy(g2, 'handsy', g2.heroes[0].x, g2.ropeY - 10);
  hs.atRope = true; hs.speed = 0;
  g2.heroes[0].outT = 9;
  run(g2, 0.1);
  assert.ok(!(g2.heroes[0].grabT > 0) && g2.heroes[1].grabT > 0);
  // 블랙 러시
  const g3 = S.createGame({ rng: seeded(603), noWaves: true, heroes: ['youngjun'], unlocked: D.LOCKED_HEROES });
  const es = [0, 1, 2, 3, 4, 5, 6].map((i) => { const e = S.spawnEnemy(g3, 'thug', 40 + i * 45, 200 + (i % 2) * 40, { hpMul: 100 }); e.speed = 0; return e; });
  g3.heroes[0].skillCd = 0;
  assert.ok(S.castSkill(g3, g3.heroes[0]));
  assert.equal(es.filter((e) => e.hp < e.maxHp).length, 6);
});

test('맵 효과는 스테이지 추천 속성과 어긋나지 않는다 (노래방·안개 = 말빨 추천, 회식 = 술 추천)', () => {
  for (let s = 1; s <= 30; s++) {
    const fx = D.stageFx(s), rec = D.recommendAttrs(s);
    if (fx.attr) for (const [a, m] of Object.entries(fx.attr)) {
      if (m > 1) assert.ok(rec.includes(a), `${D.stageLabel(s)} ${fx.name}: ${a} 추천이어야`);
      else assert.ok(!rec.includes(a), `${D.stageLabel(s)} ${fx.name}: ${a} 가 추천인데 약해짐`);
    }
    if (fx.longRange) assert.ok(rec.includes('talk'), `${D.stageLabel(s)} 안개는 말빨 추천 스테이지에`);
  }
});

test('추천 팀: 상성 × 멤버 역할 — 보스 스테이지는 한 명을 오래 때리는 멤버를 고른다', () => {
  const pool = ['staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan'];
  for (let s = 11; s <= 30; s++) {
    const t = D.recommendTeam(s, pool, 2);
    assert.equal(t.length, 2);
    const rec = D.recommendAttrs(s);
    if (!D.stageBosses(s).length) assert.ok(t.some((id) => rec.includes(D.HEROES[id].attr)), `${D.stageLabel(s)} 추천 속성 멤버 포함`);
  }
  assert.ok(D.recommendTeam(20, pool, 2).includes('gunman') || D.recommendTeam(20, pool, 2).includes('ingyu'), '2-10 보스엔 단일 딜러');
  assert.ok(!D.recommendTeam(20, pool, 2).includes('dohoon'), '힐러만 둘은 아님');
});
