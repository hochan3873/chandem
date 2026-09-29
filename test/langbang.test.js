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
  assert.ok(S.heroDamage(g, h) > normal * 1.5);
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

test('스테이지 30개: 5웨이브, x-5·x-10 보스, 난이도는 부드럽게 오르고 20을 넘지 않는다', () => {
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
      assert.ok(def.level <= 20, `${D.stageLabel(s)} 난이도 ${def.level} ≤ 20`);
      prev = def.level;
      const boss = w === 5 && [5, 10].includes(D.stageNo(s));
      assert.equal(!!def.boss, boss, `${D.stageLabel(s)} W${w} 보스`);
      if (def.boss) assert.ok(D.ENEMIES[def.boss].boss);
    }
    if (D.stageNo(s) !== 1) assert.ok(prev >= prevLast - 2.6, `${D.stageLabel(s)} 앞 스테이지보다 너무 쉬워지지 않음`);
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
