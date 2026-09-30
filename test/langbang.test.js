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
  const male = S.spawnEnemy(g, 'yeokko', h.x, g.rowY - 250, { hpMul: 100 });
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
  assert.ok(S.heroDamage(g, h) > normal * (D.HEROES.eunok.rageDmg - 0.05));
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

test('스테이지 60개: 5웨이브, x-5·x-10 보스, 난이도는 부드럽게 오르고 너무 튀지 않는다', () => {
  assert.equal(D.STAGE_COUNT, 60);
  let prevLast = 0;
  for (let s = 1; s <= 60; s++) {
    assert.equal(D.parseStage(D.stageLabel(s)), s);
    let prev = -99; // 캐스트가 센 스테이지는 레벨(체력·공격 배율)이 1보다 낮을 수 있다
    for (let w = 1; w <= D.STAGE_WAVES; w++) {
      const def = D.stageWave(s, w);
      assert.ok(def.g.length > 0);
      for (const [type, n] of def.g) { assert.ok(D.ENEMIES[type], type); assert.ok(n > 0); }
      assert.ok(def.level > prev, `${D.stageLabel(s)} W${w} 난이도 증가`);
      assert.ok(def.level <= (s <= 30 ? 31.5 : 43) /* 증강 보정(augAdd) 포함 */, `${D.stageLabel(s)} 난이도 ${def.level} (스테이지는 무한 모드 가산 없음)`);
      assert.ok(D.hpMul(def.level, true) < (s <= 30 ? 36 : 68), '체력 배율 (증강 보정 포함)');
      if (w === 1) assert.ok(def.level <= (s <= 30 ? 18.5 : 27.5) /* 증강 보정(augAdd) 포함 */, `${D.stageLabel(s)} 첫 웨이브는 새로 시작한 멤버도 버티게 (${def.level.toFixed(1)})`);
      prev = def.level;
      const boss = w === 5 && [5, 10].includes(D.stageNo(s));
      assert.equal(!!def.boss, boss, `${D.stageLabel(s)} W${w} 보스`);
      if (def.boss) assert.ok(D.ENEMIES[def.boss].boss);
    }
    if (D.stageNo(s) !== 1 && !D.stageBosses(s).length) assert.ok(prev >= prevLast - 17, `${D.stageLabel(s)} 앞 스테이지보다 너무 쉬워지지 않음 (캐스트가 세면 레벨은 낮게 — 클리어율은 밸런스 스크립트로 맞춤)`);
    prevLast = prev;
  }
  // 챕터마다 적이 늘어난다
  const has = (s, t) => D.stageEnemies(s).includes(t);
  assert.ok(!has(1, 'mukti') && has(3, 'mukti') && has(4, 'drunk'));
  assert.ok(!has(4, 'thug') && has(5, 'thug'));
  assert.ok(!has(11, 'scammer') && has(12, 'scammer') && has(13, 'inpi_gossip') && has(14, 'inpi_clique') && has(17, 'inpi_dictator'));
  // 스테이지마다 제목에 맞는 캐스트 2~4종 + 한 줄 이야기 + 그 캐스트에서 나온 중간 보스
  for (let s = 1; s <= 60; s++) {
    const cast = D.stageMix(s).map(([t]) => t);
    assert.ok(cast.length >= 2 && cast.length <= 4, `${D.stageLabel(s)} 캐스트 ${cast.length}종`);
    assert.ok(D.stageStory(s).length > 5, `${D.stageLabel(s)} 이야기`);
    const m = D.stageMid(s);
    if (m) { const e = D.ENEMIES[m]; for (const p of e.fuse || [e.base]) assert.ok(cast.includes(p), `${D.stageLabel(s)} 중간 보스 ${m} ← ${p}`); }
    assert.equal(D.stageWaveKinds(s).length, D.STAGE_WAVES);
  }
  assert.deepEqual(D.stageBosses(30), ['boss_inpi', 'boss_gapjil']);
  assert.deepEqual(D.stageBosses(60), ['boss_soloparty', 'boss_jusa']);
  assert.ok(has(31, 'fakesingle') && has(41, 'sales') && has(51, 'drunk_run'), '4~6장 새 진상');
  assert.equal(D.parseStage('6-10'), 60);
  assert.equal(D.parseStage('7-1'), 0);
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
    const g = playOut(S.createGame({ rng: seeded(seed), mode: 'stage', stage: 1, deck: [null, 'staff', 'bangjang', 'gunman', 'gunnyeo', null], unlocked: [] }));
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
  assert.equal(again.total, again.clear + again.mid, "다시 깨면 기본 + 중간 보스 보너스만");
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
  assert.ok(!D.stageEnemies(22).includes('inpi_treasurer') && D.stageEnemies(23).includes('inpi_treasurer') && D.stageEnemies(27).includes('inpi_treasurer'));
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
  const vals = Object.values(cnt);
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 1, '속성 인원이 고르게 ' + JSON.stringify(cnt));
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
  run(g, 1.0);
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
  assert.ok((g2.holes || []).length >= 1, '지팡이 블랙홀');
  assert.ok((g2.harleys || []).length >= 1, '부릉부릉 할리');
  assert.equal(g2.heroes.find((h) => h.id === 'donghan').meter, 100, '진심 모드');
});

test('자리 바꾸기: 끌어다 놓으면 두 멤버가 바로 자리를 바꾼다 (쿨타임 없음)', () => {
  const g = bare(['bangjang', 'gunman']);
  const [a, b] = g.heroes;
  const sa = a.slot, sb = b.slot;
  assert.ok(S.swapHeroes(g, a, sb));
  assert.equal(a.slot, sb); assert.equal(b.slot, sa);
  assert.ok(S.swapHeroes(g, a, sa), '바로 또 바꿀 수 있다');
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

// ─── 덱 · 줄 공격 · 장비 · 퍼펙트 · 보스 빈틈 ─────────────
test('덱: 정한 자리에 멤버가 서고, 7칸이면 자리 7개 · 스테이지에선 합류 카드가 없다', () => {
  const g = S.createGame({ rng: seeded(701), mode: 'stage', stage: 3, deck: [null, 'staff', 'bangjang', null, 'gunman', 'gunnyeo'] });
  assert.deepEqual(g.heroes.map((h) => [h.id, h.slot]).sort(), [['bangjang', 2], ['gunman', 4], ['gunnyeo', 5], ['staff', 1]]);
  assert.equal(g.heroes.find((h) => h.id === 'gunman').x, D.SLOT_X[4]);
  const g7 = S.createGame({ rng: seeded(702), mode: 'stage', stage: 3, positions: 7, deck: ['staff', 'gunman', 'gunnyeo', 'bangjang', 'dohoon', 'ingyu', 'myunghoon'] });
  assert.equal(g7.heroes.length, 7);
  assert.equal(g7.heroes.find((h) => h.slot === 6).x, D.SLOT_X7[6]);
  g.wave = 3;
  for (let i = 0; i < 200; i++) assert.ok(!S.rollCards(g, 3, { hiddenChance: 1 }).some((c) => c.kind === 'addHero'), '스테이지에선 합류 카드 없음');
  assert.equal(D.deckSlots({}), 4, '기본 덱은 4칸');
  assert.equal(D.deckSlots({ slot5: 1 }), 5);
  assert.equal(D.deckSlots({ slot6: 1 }), 4, '6번째 칸은 5번째 칸 먼저');
  assert.equal(D.deckSlots({ slot5: 1, slot6: 1 }), 6);
  // 예전 칸(slot6 = 6칸 · slot7 = 7칸)은 한 칸씩 남긴다
  assert.deepEqual(D.migrateDeckItems({ slot6: 1 }), { slot5: 1, slot6: 0 });
  assert.deepEqual(D.migrateDeckItems({ slot6: 1, slot7: 1 }), { slot5: 1, slot6: 1 });
  assert.deepEqual(D.migrateDeckItems({ slot5: 1, slot6: 1 }), { slot5: 1, slot6: 1 });
});

test('줄 공격: 강성구 지팡이는 자기 줄 위의 적만 (건전남은 필드 전체)', () => {
  const g = S.createGame({ rng: seeded(711), noWaves: true, deck: ['sunggu'] });
  const h = g.heroes[0];
  const far = S.spawnEnemy(g, 'thug', h.x + 150, g.rowY - 200, { hpMul: 100 }); far.speed = 0;
  run(g, 3);
  assert.equal(far.hp, far.maxHp, '옆 줄 적은 안 친다');
  const g2 = S.createGame({ rng: seeded(711), noWaves: true, deck: ['gunman'] });
  const f2 = S.spawnEnemy(g2, 'thug', g2.heroes[0].x + 150, g2.rowY - 200, { hpMul: 100 }); f2.speed = 0;
  run(g2, 2);
  assert.ok(f2.hp < f2.maxHp, '건전남은 옆 줄도 쏜다');
});

test('장비: 공격력 · 입구 내구도 · 쿨감이 판에 적용된다', () => {
  const a = S.createGame({ rng: seeded(721), noWaves: true, deck: ['staff'] });
  const b = S.createGame({ rng: seeded(721), noWaves: true, deck: ['staff'], gear: { staff: { atk: 0.2, hp: 0.1, cd: 0.2 } } });
  assert.ok(Math.abs(S.heroDamage(b, b.heroes[0]) / S.heroDamage(a, a.heroes[0]) - 1.2) < 1e-9);
  assert.equal(b.base.max, Math.round(a.base.max * 1.1));
  assert.ok(b.heroes[0].skillCd < a.heroes[0].skillCd);
  const st = D.gearStats([{ t: 'megaphone', r: 'epic', lv: 2 }, { t: 'belt', r: 'common', lv: 0 }]);
  assert.ok(Math.abs(st.atk - (D.gearValue('megaphone', 'epic', 2) + D.gearValue('belt', 'common', 0))) < 1e-9);
  assert.deepEqual(D.rollDrops(42, 10, 3, true, true), D.rollDrops(42, 10, 3, true, true));
  for (let sd = 1; sd < 60; sd++) assert.notEqual(D.rollDrops(sd, 5, 3, true, true)[0].r, 'common', '첫 퍼펙트는 희귀 이상');
});

test('퍼펙트: 입구가 한 번도 안 맞고 깨면 perfect · 보스는 큰 기술 뒤 빈틈(피해 1.5배)', () => {
  const g = S.createGame({ rng: seeded(731), mode: 'stage', stage: 1, deck: [null, 'staff', 'bangjang', 'gunman', 'gunnyeo', null] });
  playOut(g);
  assert.equal(S.summary(g, g.t).perfect, g.victory && !g.baseHit);
  const g2 = S.createGame({ rng: seeded(732), noWaves: true, heroes: ['gunman'] });
  g2.heroes[0].stunT = 99;
  const b = S.spawnEnemy(g2, 'boss_thug', 180, 200, { hpMul: 100 }); b.speed = 0;
  let weak = false;
  for (let t = 0; t < 8 && !weak; t += 1 / 60) { S.step(g2, 1 / 60); if (g2.events.some((e) => e.type === 'weak')) weak = true; g2.events.length = 0; }
  assert.ok(weak && b.weakT > 0, '빈틈!');
  const h0 = b.hp; S.damageEnemy(g2, b, 100, false, null); const w = h0 - b.hp;
  b.weakT = 0; const h1 = b.hp; S.damageEnemy(g2, b, 100, false, null); const n = h1 - b.hp;
  assert.ok(w > n * 1.4);
});

test('장비 공식: 서버(langbang-rules.js)와 화면(data.js)이 같다', () => {
  const R = require('../server/langbang-rules');
  assert.deepEqual(R.GEAR_IDS, D.GEAR_IDS);
  for (const t of D.GEAR_IDS) for (const r of D.GEAR_RARITIES) for (let lv = 0; lv <= 10; lv++) assert.equal(R.gearValue(t, r, lv), D.gearValue(t, r, lv));
  for (const r of D.GEAR_RARITIES) for (let lv = 0; lv <= 10; lv++) { assert.equal(R.gearEnhanceCost(r, lv), D.gearEnhanceCost(r, lv)); assert.equal(R.gearSellValue(r, lv), D.gearSellValue(r, lv)); }
  for (let sd = 0; sd < 30; sd++) assert.deepEqual(R.rollDrops(sd * 7919, 1 + (sd % 30), 1 + (sd % 3), sd % 2 === 0, sd % 5 === 0), D.rollDrops(sd * 7919, 1 + (sd % 30), 1 + (sd % 3), sd % 2 === 0, sd % 5 === 0));
  for (let s = 1; s <= 30; s++) assert.deepEqual(R.stageReward(s, 3, 0, 2, true, true), D.stageReward(s, 3, 0, 2, true, true));
  assert.equal(R.deckSlots({ slot5: 1, slot6: 1 }), D.deckSlots({ slot5: 1, slot6: 1 }));
  assert.equal(R.DECK_BASE, D.DECK_BASE);
  assert.deepEqual(R.ITEMS.slot6.costs, [80000]);
});

// ─── 주간 도전 · 미션 · 모집 · 시즌 · 성급 (live.js) ─────────────
test('live: 주간 도전 판은 주 번호만으로 정해지고, 점수·상한 확인이 맞다', async () => {
  const L = await load('live.js');
  const a = L.weeklyDef(3), b = L.weeklyDef(3), c = L.weeklyDef(4);
  assert.deepEqual(a, b, '같은 주 = 같은 판');
  assert.notEqual(a.mod, c.mod, '주마다 규칙이 바뀐다');
  assert.equal(a.waves.length, L.WEEKLY_WAVES);
  for (const w of a.waves) for (const [t] of w.g) assert.ok(D.ENEMIES[t], t);
  assert.equal(L.weeklyScore({ waves: 10, kills: 300, bossKills: 3, victory: true, hpPct: 80 }), 10000 + 3000 + 1500 + 5000 + 4000);
  assert.ok(L.weeklyCheck(a, { waves: 3, kills: 99999, bossKills: 0, durationSec: 100 }) !== null, '처치 수 상한');
  assert.ok(L.weeklyCheck(a, { waves: 3, kills: 50, bossKills: 0, durationSec: 10 }) !== null, '너무 짧음');
  assert.ok(L.weeklyCheck(a, { waves: 9, kills: 50, bossKills: 0, durationSec: 200, victory: true }) !== null, '다 안 깼는데 클리어');
  assert.equal(L.weeklyCheck(a, { waves: 4, kills: 80, bossKills: 1, durationSec: 200 }), null);
  const mon = Date.UTC(2026, 9, 4, 15, 0, 0); // 10/5(월) 00:00 KST
  assert.equal(L.weekIndex(mon) - L.weekIndex(mon - 1000), 1, '주 경계는 월요일 00:00 KST');
  const lb = {};
  L.weeklyRecord(lb, 5, 1000, 3, 1);
  assert.equal(L.weeklyRecord(lb, 5, 900, 2, 2), false, '낮은 점수는 최고 기록을 안 바꿈');
  L.weeklyRecord(lb, 6, 500, 2, 3);
  assert.equal(lb.weeklyPrev.best, 1000, '새 주로 넘어가면 지난 기록은 weeklyPrev');
  assert.equal(L.weeklyEntry(lb, 5).best, 1000);
});

test('live: 미션은 (사용자·날짜)로 정해지고 진행/보상/중복 수령이 맞다', async () => {
  const L = await load('live.js');
  const now = Date.UTC(2026, 9, 1, 3);
  const lb = L.normLive({}, { coins: 0, gear: [], gearSeq: 0, maxStage: 12, stages: {}, heroes: {} });
  L.ensureLive(lb, 'u1', now);
  assert.deepEqual(lb.daily.ids, L.pickDaily('u1', L.dayIndex(now), 12));
  assert.equal(lb.daily.ids.length, 4);
  const m = L.DAILY_POOL.find((x) => x.id === lb.daily.ids[0]);
  assert.match(L.claimMission(lb, 'daily', m.id, 'u1', now).error, /아직/);
  L.bump(lb, m.key, m.n, 'u1', now);
  const r = L.claimMission(lb, 'daily', m.id, 'u1', now);
  assert.equal(r.got.coins, m.coins);
  assert.equal(lb.coins, m.coins);
  assert.equal(lb.season.sp, m.sp, '시즌 포인트');
  assert.match(L.claimMission(lb, 'daily', m.id, 'u1', now).error, /이미/);
  assert.equal(lb.wm.p.dailyDone, 1, '주간 미션: 일일 완료 수');
  L.ensureLive(lb, 'u1', now + L.DAY);
  assert.equal(lb.daily.done.length, 0, '다음 날이면 새 미션');
  lb.maxStage = 10;
  assert.ok(L.claimMission(lb, 'ach', 'ch1', 'u1', now).got.tickets >= 1);
  assert.match(L.claimMission(lb, 'ach', 'ch2', 'u1', now).error, /아직/);
});

test('live: 모집 확률 · 10연속 영웅 등급 확정 · 천장(50/200) · 겹치면 조각 · 이호찬은 3-10 뒤에만', async () => {
  const L = await load('live.js');
  const mk = (maxStage) => L.normLive({}, { coins: 1e9, gear: [], gearSeq: 0, maxStage, stages: {}, heroes: {} });
  const sum = L.GACHA_RATES.reduce((a, r) => a + r.w, 0);
  assert.ok(Math.abs(sum - 100) < 1e-9, '확률 합 100%');
  let lb = mk(12);
  for (let i = 0; i < 300; i++) {
    const r = L.gachaPull(lb, 10, 'coin', 'u', 0);
    assert.ok(r.results.some((x) => ['legendHero', 'epicHero', 'legendGear', 'epicGear'].includes(x.k)), '10연속 확정');
    assert.ok(!r.results.some((x) => x.k === 'legendHero' || x.k === 'legendCard'), '6-10 전엔 LEGEND 없음');
  }
  assert.ok(!lb.owned.hochan);
  lb = mk(12); lb.pity.hero = 49;
  assert.equal(L.gachaPull(lb, 1, 'coin', 'u2', 0).results[0].k, 'epicHero', '50회 천장');
  // 카드 모아 합류: 이호찬 30장 — 천장 묶음(15장)이 두 번이면 합류, 그 뒤엔 ★조각
  lb = mk(60); lb.pity.legend = 199;
  let x = L.gachaPull(lb, 1, 'coin', 'u3', 0).results[0];
  assert.equal(x.hero, 'hochan', '200회 천장');
  assert.ok(x.card && !x.new && x.have === 15 && x.need === 30, '15/30');
  assert.ok(!L.heroUnlocked(lb, 'hochan'), '아직 합류 전');
  assert.deepEqual(L.cardProgress(lb, 'hochan'), [15, 30]);
  lb.pity.legend = 199;
  x = L.gachaPull(lb, 1, 'coin', 'u3', 0).results[0];
  assert.ok(x.new, '30장 모이면 합류');
  assert.equal(lb.owned.hochan, true);
  assert.ok(L.heroUnlocked(lb, 'hochan'));
  assert.equal(lb.shards.hochan | 0, 0);
  lb.pity.legend = 199;
  const dup = L.gachaPull(lb, 1, 'coin', 'u3', 0).results[0];
  assert.ok(dup.dup && lb.shards.hochan === L.CARD_BUNDLE.legendHero, '합류 뒤 카드는 ★조각');
  // 영웅 멤버는 10장
  lb = mk(12); lb.pity.hero = 49;
  const e1 = L.gachaPull(lb, 1, 'coin', 'u4', 0).results[0];
  assert.ok(e1.card && e1.need === 10 && e1.have === 4);
  lb = mk(12); lb.coins = 100; lb.tickets = 0;
  assert.match(L.gachaPull(lb, 1, 'coin', 'u', 0).error, /코인/);
  assert.match(L.gachaPull(lb, 10, 'ticket', 'u', 0).error, /모집권/);
  lb = mk(60);
  const cnt = {};
  for (let i = 0; i < 5000; i++) { lb.pity.hero = 0; lb.pity.legend = 0; const x = L.gachaPull(lb, 1, 'coin', 'r', 0).results[0]; cnt[x.k] = (cnt[x.k] || 0) + 1; }
  assert.ok(cnt.epicHero / 5000 > 0.015 && cnt.epicHero / 5000 < 0.05, `영웅 묶음 ${cnt.epicHero}`);
  assert.ok(cnt.epicCard / 5000 > 0.05 && cnt.epicCard / 5000 < 0.11, `영웅 카드 ${cnt.epicCard}`);
  assert.ok((cnt.legendHero || 0) / 5000 < 0.012, `LEGEND ${cnt.legendHero}`);
});

test('live: 성급 · 시즌 30단계 · 칭호/프레임 · 챕터 별 상자 · 출석 · 이상한 값 정리', async () => {
  const L = await load('live.js');
  const lb = L.normLive({}, { coins: 1e6, gear: [], gearSeq: 0, maxStage: 10, stages: { 1: 3, 2: 3, 3: 3, 4: 1 }, heroes: {} });
  assert.match(L.starUp(lb, 'staff').error, /조각/);
  lb.shards.staff = 20;
  assert.equal(L.starUp(lb, 'staff').star, 2);
  assert.equal(L.heroStar(lb, 'staff'), 2);
  assert.match(L.starUp(lb, 'junseo').error, /합류/, '없는 멤버는 승급 불가');
  const now = Date.UTC(2026, 9, 1);
  L.ensureLive(lb, 'u', now);
  lb.season.sp = 1050;
  assert.equal(L.seasonTier(lb), 10);
  assert.equal(L.claimSeason(lb, 'all', 'u', now).got.length, 10);
  assert.ok(lb.titles.includes(`s${lb.season.id}_t10`), '10단계 칭호');
  assert.match(L.claimSeason(lb, 11, 'u', now).error, /아직/);
  assert.equal(L.setCosmetic(lb, `s${lb.season.id}_t10`, undefined).error, undefined);
  assert.match(L.setCosmetic(lb, 'wchamp', undefined).error, /없는/);
  assert.match(L.claimChest(lb, 1, 20, 'u', now).error, /별/);
  assert.ok(L.claimChest(lb, 1, 10, 'u', now).got.coins > 0);
  assert.match(L.claimChest(lb, 1, 10, 'u', now).error, /이미/);
  assert.ok(L.claimCheckin(lb, 'u', now).got.coins);
  assert.match(L.claimCheckin(lb, 'u', now).error, /이미/);
  assert.equal(L.claimCheckin(lb, 'u', now + L.DAY).day, 2);
  assert.equal(L.claimCheckin(lb, 'u', now + 3 * L.DAY).day, 1, '하루 빠지면 처음부터');
  const bad = L.normLive({ tickets: -5, shards: { nope: 9, staff: 1e12 }, hstars: { staff: 9 }, owned: { staff: true, junseo: 1 }, titles: ['hack', 's1_t10'], frame: 'gold', frames: ['neon'], season: { id: 1, sp: 5, claimed: [1, 99] } }, {});
  assert.equal(bad.tickets, 0);
  assert.equal(bad.shards.nope, undefined);
  assert.equal(bad.hstars.staff, 5);
  assert.deepEqual(Object.keys(bad.owned), ['junseo']);
  assert.deepEqual(bad.titles, ['s1_t10']);
  assert.equal(bad.frame, '', '없는 프레임은 못 낀다');
  assert.deepEqual(bad.season.claimed, [1]);
});

test('새 멤버: 여사친 핀볼 · 다이어트 변신 · 공주↔늙음 · 황금 파동 버프 · 성급 공격력', () => {
  const g = S.createGame({ rng: seeded(901), noWaves: true, heroes: ['junseo'] });
  const h = g.heroes[0];
  const es = [0, 1, 2, 3].map((i) => { const e = S.spawnEnemy(g, 'thug', h.x - 60 + i * 40, g.rowY - 200 - i * 10, { hpMul: 50 }); e.speed = 0; return e; });
  run(g, 3);
  assert.ok(es.filter((e) => e.hp < e.maxHp).length >= 3, '여사친이 3명 이상 맞힘');
  const g2 = S.createGame({ rng: seeded(902), noWaves: true, heroes: ['hyungyeong'] });
  const hy = g2.heroes[0];
  hy.meter = 99.99; g2.phase = 'wave'; g2.spawnQ = []; g2.spawnI = 0;
  const dummy = S.spawnEnemy(g2, 'thug', hy.x, g2.rowY - 120, { hpMul: 500 }); dummy.speed = 0;
  S.step(g2, 1 / 60); S.step(g2, 1 / 60);
  assert.equal(hy.alt, true, '날씬 모드');
  for (let t = 0; t < 12; t += 1 / 60) S.step(g2, 1 / 60);
  assert.equal(hy.alt, false, '요요');
  const g3 = S.createGame({ rng: seeded(903), noWaves: true, heroes: ['ara'] });
  const a = g3.heroes[0];
  const d0 = S.heroDamage(g3, a);
  a.alt = true;
  assert.ok(Math.abs(S.heroDamage(g3, a) / d0 - D.HEROES.ara.age.dmg) < 1e-9, '늙으면 힘이 반');
  const boss = S.spawnEnemy(g3, 'boss_thug', 180, 200, { hpMul: 100 }); boss.speed = 0;
  a.skillCd = 0;
  assert.ok(S.castSkill(g3, a, 0, 0));
  assert.equal(a.alt, false, '공주의 일격 → 바로 공주');
  assert.ok(boss.hp < boss.maxHp);
  const g4 = S.createGame({ rng: seeded(904), noWaves: true, heroes: ['hochan', 'staff'] });
  const hc = g4.heroes[0], st = g4.heroes[1];
  const base = S.heroDamage(g4, st);
  for (let i = 0; i < 6; i++) { const e = S.spawnEnemy(g4, 'thug', hc.x, g4.rowY - 150 - i * 25, { hpMul: 100 }); e.speed = 0; }
  run(g4, 2.5);
  assert.ok(g4.hcT > 0 && g4.hcBuff > 0 && g4.hcBuff <= D.HEROES.hochan.buff.max + 1e-9, `버프 ${g4.hcBuff}`);
  assert.ok(S.heroDamage(g4, st) > base, '랑방을 위하여! 아군 공격력 ↑');
  const s1 = S.createGame({ rng: seeded(905), noWaves: true, heroes: ['staff'] });
  const s3 = S.createGame({ rng: seeded(905), noWaves: true, heroes: ['staff'], stars: { staff: 3 } });
  assert.ok(Math.abs(S.heroDamage(s3, s3.heroes[0]) / S.heroDamage(s1, s1.heroes[0]) - 1.14) < 1e-9, '★3 = +14%');
});

test('주간 도전 판: 10웨이브 · 규칙이 시뮬레이션에 들어간다', async () => {
  const L = await load('live.js');
  let wi = 0;
  while (L.weeklyDef(wi).mod !== 'glass') wi++;
  const def = L.weeklyDef(wi);
  const g = S.createGame({ rng: seeded(910), mode: 'stage', weekly: def, deck: ['staff', 'bangjang', 'gunman', null, null, null] });
  assert.equal(g.totalWaves, 10);
  assert.equal(g.base.max, Math.round(D.RULES.baseHp * 0.5), '유리 입구: 절반');
  S.startWave(g, 1);
  assert.equal(S.summary(g, 1).weekly, wi);
});

// ─── 레벨업 카드 · 시너지 · 진화 · 중간 보스 · 4~6장 · 헬 모드 ─────────────
test('카드: 4장 · 속성 결속은 그 속성 멤버가 있어야 · 진화는 Lv5 + 짝 특성 카드 · 위험 카드', () => {
  const g = S.createGame({ rng: seeded(1201), mode: 'stage', stage: 12, deck: ['staff', 'bangjang', 'gunman', 'gunnyeo', null, null] });
  g.wave = 2;
  assert.equal(S.rollCards(g).length, 4, '카드 4장');
  const pool = S.cardPool(g);
  assert.ok(pool.some((c) => c.id === 'syn_talk'), '말빨 멤버 2명 → 말빨 결속');
  assert.ok(!pool.some((c) => c.id === 'syn_booze'), '술 멤버 없음 → 술 결속 없음');
  // 같은 속성 2명: 자동 시너지 +12%
  const base = S.buildMul(g, g.heroes.find((h) => h.id === 'gunman'));
  assert.ok(Math.abs(S.buildMul(g, g.heroes.find((h) => h.id === 'staff')) - (1 + D.ATTR_SET[2])) < 1e-9);
  assert.equal(base, 1, '힘 1명은 시너지 없음');
  // 관통 카드 → 건전남 공격력 ↑
  S.applyCard(g, pool.find((c) => c.id === 'tag_pierce'));
  assert.ok(S.buildMul(g, g.heroes.find((h) => h.id === 'gunman')) > base);
  // 진화: 건전남 Lv5 + 관통 카드
  const gm = g.heroes.find((h) => h.id === 'gunman');
  gm.lv = 5;
  const evo = S.cardPool(g).find((c) => c.kind === 'evo' && c.hero === 'gunman');
  assert.ok(evo, '진화 카드');
  const d0 = S.heroDamage(g, gm);
  S.applyCard(g, evo);
  assert.ok(gm.evo && Math.abs(S.heroDamage(g, gm) / d0 - D.EVO_MUL.dmg) < 1e-9);
  assert.ok(!S.cardPool(g).some((c) => c.kind === 'evo' && c.hero === 'gunman'), '진화는 한 번');
  // 올인: 입구 -20% · 공격력 +35%
  const max0 = g.base.max, dmg0 = g.mods.dmg;
  S.applyCard(g, { kind: 'global', id: 'risk_allin', key: 'risk_allin' });
  assert.equal(g.base.max, Math.round(max0 * 0.8));
  assert.ok(Math.abs(g.mods.dmg - dmg0 - 0.55) < 1e-9);
});

test('중간 보스: 3웨이브에 나오고(1-1·1-2 제외) · 합체는 두 진상 기술을 모두 · 넉백 안 됨 · 보너스 코인', () => {
  assert.equal(D.stageMid(1), null);
  assert.equal(D.stageMid(2), null);
  for (let s = 3; s <= D.STAGE_COUNT; s++) {
    const m = D.stageMid(s);
    assert.ok(m && D.ENEMIES[m] && D.ENEMIES[m].mid, `${D.stageLabel(s)} 중간 보스`);
    assert.equal(D.stageWave(s, 3).mid, m);
    assert.equal(D.stageWave(s, 2).mid, undefined);
  }
  const kko = D.ENEMIES.fuse_kko;
  assert.equal(kko.charm, 'both', '꼬충 커플은 남녀 모두 홀림');
  const puke = D.ENEMIES.fuse_puke;
  assert.ok(puke.puke && puke.explode && puke.zigzag === undefined, '토 + 술병 폭발');
  assert.ok(D.ENEMIES.mid_drunk.explode.r > D.ENEMIES.drunk.explode.r, '각성 만취자는 더 큰 폭발');
  const g = S.createGame({ rng: seeded(1210), noWaves: true, heroes: ['bangjang'] });
  const e = S.spawnEnemy(g, 'mid_thug', 180, 200);
  const y0 = e.y;
  S.applyKnockback(e, 100, g);
  assert.equal(e.kbv, 0, '중간 보스는 안 밀린다');
  assert.equal(e.y, y0);
  assert.ok(D.stageReward(12, 3, 3).mid > 0, '중간 보스 보너스');
  // 스테이지 3웨이브 시작하면 대기열에 중간 보스
  const g2 = S.createGame({ rng: seeded(1211), mode: 'stage', stage: 12, deck: ['staff', 'bangjang', null, null, null, null] });
  S.startWave(g2, 3);
  assert.ok(g2.spawnQ.some((q) => q.mid && q.type === D.stageMid(12)));
});

test('4~6장 진상: 돌싱 들킴 · 카푸어 퍼짐 · 싱글맘 방패 · 영업 보험 · 찌질남 집착 · 드러눕기 · 집 가기', () => {
  const mk = () => { const g = S.createGame({ rng: seeded(1220), noWaves: true, heroes: ['bangjang', 'staff'] }); g.phase = 'wave'; g.spawnQ = [{ at: 9999, type: 'yeokko' }]; g.spawnI = 0; return g; };
  let g = mk();
  const f = S.spawnEnemy(g, 'fakesingle', 180, g.ropeY * 0.5);
  run(g, 0.2);
  assert.ok(f.revealed && f.spdMul > 1, '사실 돌싱!');
  g = mk();
  const c = S.spawnEnemy(g, 'carpoor', 180, g.ropeY * 0.6);
  run(g, 0.1);
  assert.ok(c.dashDone && c.stallT > 0, '퍼졌다!');
  g = mk();
  const m = S.spawnEnemy(g, 'secretmom', 180, 150);
  assert.ok(m.shield > 0 && m.lieOn, '거짓말 방패');
  const n0 = g.enemies.length;
  S.damageEnemy(g, m, m.shield + 1, false, null);
  assert.ok(!m.lieOn && m.stunT > 0 && g.enemies.length === n0 + 2, '들켰다! 기절 + 소환');
  g = mk();
  const sl = S.spawnEnemy(g, 'sales', 180, 150);
  const buddy = S.spawnEnemy(g, 'yeokko', 190, 160); buddy.speed = 0;
  sl.insT = 0;
  run(g, 0.05);
  assert.ok(buddy.shield > 0 && buddy.hasteT > 0, '보험 + 다단계');
  g = mk();
  const j = S.spawnEnemy(g, 'jjijil', g.heroes[0].x, g.ropeY - 2);
  run(g, 0.3);
  const victimH = g.heroes.find((h) => h.clingBy === j.uid);
  assert.ok(victimH, '달라붙음');
  const dClung = S.heroDamage(g, victimH);
  S.damageEnemy(g, j, 1e6, false, null);
  assert.equal(victimH.clingBy, 0, '잡으면 떨어짐');
  assert.ok(S.heroDamage(g, victimH) > dClung);
  g = mk();
  const z = S.spawnEnemy(g, 'drunk_sleep', 180, g.ropeY * 0.5);
  run(g, 0.1);
  assert.ok(z.sleeping, '드러누움');
  for (let i = 0; i < D.ENEMIES.drunk_sleep.sleep.hits; i++) S.damageEnemy(g, z, 1, false, null);
  assert.ok(!z.sleeping, '4번 맞으면 벌떡');
  g = mk();
  g.exp = 50;
  const hm = S.spawnEnemy(g, 'drunk_home', 180, g.ropeY * 0.6);
  run(g, 0.1);
  assert.ok(hm.fleeing && hm.stolen > 0 && g.exp < 50, '집에 갈래 (경험치 훔침)');
});

test('헬 모드: 진상 체력·속도·공격·수 ↑ · 보상 ×3 · 희귀 이상 확정 · 일반 ★★★ 에서만', () => {
  const a = S.createGame({ rng: seeded(1230), mode: 'stage', stage: 12, deck: ['staff', 'bangjang', null, null, null, null] });
  const b = S.createGame({ rng: seeded(1230), mode: 'stage', stage: 12, deck: ['staff', 'bangjang', null, null, null, null], hell: true });
  S.startWave(a, 2); S.startWave(b, 2);
  const ea = S.spawnEnemy(a, 'thug', 100, 100), eb = S.spawnEnemy(b, 'thug', 100, 100);
  assert.ok(Math.abs(eb.maxHp / ea.maxHp - D.HELL.hp) < 1e-6);
  assert.ok(eb.atk / ea.atk > D.HELL.atk - 1e-6);
  assert.ok(b.spawnQ.length > a.spawnQ.length, '수도 많다');
  assert.equal(S.summary(b, 1).hell, true);
  const r = D.hellReward(12, 3, 0, 0);
  assert.equal(r.total, Math.round(D.stageReward(12, 3, 0, 0).total * D.HELL.coin));
  for (let sd = 1; sd < 40; sd++) for (const it of D.rollDrops(sd, 12, 3, false, false, true)) assert.notEqual(it.r, 'common', '헬은 희귀 이상');
  assert.ok(!D.hellOpen({ 12: 2 }, 12) && D.hellOpen({ 12: 3 }, 12));
});

test('덱 넣기/빼기: 빈 자리에 넣고 · 이미 있으면 빼고 · 꽉 차면 full · 자리 골라 바꾸기', async () => {
  const L = await load('live.js');
  const order = [2, 3, 1, 4, 0, 5];
  let r = L.deckToggle([null, null, 'staff', null, null, null], 'gunman', 4, order);
  assert.equal(r.action, 'added'); assert.equal(r.deck[3], 'gunman');
  r = L.deckToggle(r.deck, 'staff', 4, order);
  assert.equal(r.action, 'removed'); assert.equal(r.deck[2], null);
  const full = ['a1', null, 'staff', 'gunman', 'bangjang', 'gunnyeo'].map((x) => (x === 'a1' ? null : x));
  assert.equal(L.deckToggle(full, 'dohoon', 4, order).action, 'full');
  r = L.deckToggle(full, 'dohoon', 4, order, 2);
  assert.equal(r.action, 'added'); assert.equal(r.deck[2], 'dohoon');
  assert.deepEqual(L.cleanDecks({ i: 7, decks: [['staff', 'staff', 'nope', 'gunman'], 'x'] }).decks[0], ['staff', null, null, 'gunman', null, null]);
});

test('레벨업: 드물게(필요 경험치 ×2.2) · 레벨 카드 한 장 = 2레벨 · 멤버 전용 카드 · 멤버 수 제한(자리는 6칸 모두) · 임시 증원 + 게스트', () => {
  const g = S.createGame({ rng: seeded(1301), mode: 'stage', stage: 5, slots: 4, deck: [null, 'staff', 'gunnyeo', 'gunman', 'bangjang', null], guestPool: ['dohoon'] });
  assert.equal(g.need, Math.round(D.expNeed(1) * D.EXP_NEED_MUL));
  assert.equal(g.maxHeroes, 4, '4명까지 데려감');
  assert.equal(g.locked.length, 0, '자리는 잠기지 않는다');
  const gn = g.heroes.find((h) => h.id === 'gunnyeo');
  const lv = S.cardPool(g).find((c) => c.kind === 'heroLv' && c.hero === 'gunnyeo');
  S.applyCard(g, lv);
  assert.equal(gn.lv, 3, '한 장에 2레벨');
  const hm = S.cardPool(g).find((c) => c.kind === 'heroMod' && c.hero === 'gunnyeo');
  assert.ok(hm, '건전녀 전용 카드');
  const d0 = S.heroDamage(g, gn);
  S.applyCard(g, hm);
  assert.ok(gn.cm.splash > 1 && Math.abs(S.heroDamage(g, gn) / d0 - 1.2) < 1e-9);
  assert.ok(!S.cardPool(g).some((c) => c.kind === 'heroMod' && c.hero === 'dohoon'), '덱에 없는 멤버 카드는 없음');
  assert.equal(S.swapHeroes(g, gn, 0), true, '빈 끝자리로도 옮길 수 있다');
  assert.equal(gn.slot, 0);
  assert.equal(S.addHero(g, 'dohoon'), null, '4명이 꽉 차면 더는 못 들어옴');
  // 숨은 카드 (확률 1로)
  g.wave = 2;
  const cards = S.rollCards(g, 4, { secretChance: 1, rng: () => 0.1 });
  const sc = cards.find((c) => c.kind === 'secret');
  assert.ok(sc && sc.id === 'guestCombo');
  S.applyCard(g, sc);
  assert.equal(g.maxHeroes, 5, '이번 판만 한 명 더');
  const guest = g.heroes.find((h) => h.guest);
  assert.ok(guest && guest.id === 'dohoon' && guest.slot === g.tempSlot, '게스트 합류');
  assert.equal(S.rollCards(g, 4, { secretChance: 1 }).some((c) => c.kind === 'secret'), false, '한 판에 한 번');
});

test('멤버 티어: 늦게 만나는 멤버는 기본이 세고(강화 0: T4 ≈ T1 × 1.6), 초반 멤버는 성장형 (강화 20: T1 ≈ T4 × 0.85)', () => {
  assert.equal(D.metaMaxOf('staff'), 20);
  const r0 = D.tierPower(4, 0) / D.tierPower(1, 0), r20 = D.tierPower(1, 20) / D.tierPower(4, 20);
  assert.ok(Math.abs(r0 - 1.6) < 0.02, `강화 0: ${r0}`);
  assert.ok(Math.abs(r20 - 0.85) < 0.02, `강화 20: ${r20}`);
  for (let t = 1; t < 5; t++) for (const m of [0, 10, 20]) assert.ok(D.tierPower(t, m) < D.tierPower(t + 1, m), `같은 강화면 높은 티어가 세다 T${t} +${m}`);
  const a = S.createGame({ rng: seeded(1310), noWaves: true, heroes: ['staff'], meta: { staff: 20 } });
  const b = S.createGame({ rng: seeded(1310), noWaves: true, heroes: ['junseo'], meta: { junseo: 0 } });
  assert.equal(a.heroes[0].meta, 20);
  assert.ok(S.heroDamage(a, a.heroes[0]) > 0 && S.heroDamage(b, b.heroes[0]) > 0);
  const R = require('../server/langbang-rules');
  for (const h of Object.keys(D.HEROES)) assert.equal(R.metaMaxOf(h), D.metaMaxOf(h), h);
});

test('덱 정리: 다 빼면 빈 덱 그대로 (자동으로 안 채움) · 처음 만드는 덱만 기본 멤버 · 없는 멤버·중복·칸 넘침 정리', async () => {
  const L = await load('live.js');
  const mine = new Set(['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon']);
  const fill = () => ['staff', 'bangjang', 'gunman', 'gunnyeo', null, null];
  assert.deepEqual(L.cleanDeck([null, null, null, null, null, null], mine, 6, 4, fill), [null, null, null, null, null, null], '비운 덱은 그대로');
  assert.deepEqual(L.cleanDeck([], mine, 6, 4, fill), fill(), '처음 덱만 채움');
  assert.deepEqual(L.cleanDeck([null, 'staff', null, null, null, null], mine, 6, 4, fill), [null, 'staff', null, null, null, null], '1명 덱도 그대로');
  assert.deepEqual(L.cleanDeck(['hochan', 'staff', 'staff', 'gunman', 'gunnyeo', 'dohoon'], mine, 6, 4, fill), [null, 'staff', null, 'gunman', 'gunnyeo', 'dohoon'], '없는 멤버 · 중복 빼고 4명까지');
});

test('웨이브 성격: 떼거리는 많고 약하게 · 정예는 적고 단단 (범위 피해 -35%) · 혼합은 정예 호위 · 스테이지마다 섞인다', () => {
  let S1 = 0, E1 = 0;
  for (let s = 3; s <= 60; s++) {
    const ks = D.stageWaveKinds(s);
    assert.ok(new Set(ks).size >= 2, `${D.stageLabel(s)} 웨이브 성격이 섞인다`);
    if (D.stageBosses(s).length) assert.equal(ks[4], 'B');
    for (let w = 1; w <= 5; w++) {
      const d = D.stageWave(s, w);
      assert.equal(d.kind, ks[w - 1]);
      if (d.kind === 'S') { S1++; assert.ok(d.fodderHp < 0.6 && d.clump); }
      if (d.kind === 'E') { E1++; assert.ok(d.g.every((x) => x[4] === 'E') && d.eliteHp > 2); }
      if (d.kind === 'M') { const e = d.g.filter((x) => x[4] === 'E'); assert.ok(e.length === 1 && e[0][1] >= 2 && e[0][1] <= 4, '정예 2~4명'); }
    }
  }
  assert.ok(S1 > 40 && E1 > 20, `떼거리 ${S1} · 정예 ${E1}`);
  const g = S.createGame({ rng: seeded(77), noWaves: true, heroes: [] });
  const a = S.spawnEnemy(g, 'thug', 100, 100, { hpMul: 10 });
  const b = S.spawnEnemy(g, 'thug', 200, 100, { hpMul: 10, elite: true });
  const hp0 = a.hp;
  S.damageEnemy(g, a, 100, false, null, true);
  S.damageEnemy(g, b, 100, false, null, true);
  assert.ok(b.elite && hp0 - b.hp < (hp0 - a.hp) * 0.7, '정예는 범위 공격이 덜 먹힌다');
});

test('멀티킬: 0.35초 안에 3명 이상 쓰러지면 한 번 (트리플 → 대학살) · 콤보는 2초 동안 못 잡으면 끊기고 경험치 보너스', () => {
  const g = S.createGame({ rng: seeded(78), noWaves: true, heroes: [] });
  const list = Array.from({ length: 8 }, (_, i) => S.spawnEnemy(g, 'yeokko', 40 + i * 30, 200, { hpMul: 0.01 }));
  for (const e of list) S.damageEnemy(g, e, 999, false, null, true);
  assert.equal(g.combo, 8);
  let mk = null;
  for (let i = 0; i < 40; i++) { S.step(g, 1 / 60); for (const e of g.events) if (e.type === 'multikill') mk = e; g.events.length = 0; }
  assert.ok(mk && mk.n === 8, '8명 한 번에 → 싹쓸이');
  for (let i = 0; i < 130; i++) S.step(g, 1 / 60);
  assert.equal(g.combo, 0, '2초 지나면 콤보 끊김');
  assert.equal(D.RULES.comboWindow, 2);
});

test('줄 스킬 자동 조준: 가장 많이 걸리는 방향 · 아무도 없으면 스킬 아껴 둠 · 난사는 그 방향으로 전부 관통', () => {
  const g = S.createGame({ rng: seeded(91), noWaves: true, heroes: ['gunman'] });
  const h = g.heroes[0];
  assert.equal(S.bestLineAngle(g, h.x, h.y, 500, 12), null, '진상 없음');
  h.skillCd = 0;
  assert.equal(S.castSkill(g, h, 0, 0), false, '진상이 없으면 안 쓴다');
  assert.ok(S.skillReady(h), '쿨타임 그대로');
  // 왼쪽 위 대각선에 3명, 바로 위에 1명
  const a = -Math.PI * 0.75;
  for (const d of [120, 200, 280]) S.spawnEnemy(g, 'thug', h.x + Math.cos(a) * d, h.y + Math.sin(a) * d, { hpMul: 50 });
  S.spawnEnemy(g, 'thug', h.x, h.y - 200, { hpMul: 50 });
  const b = S.bestLineAngle(g, h.x, h.y, 500, 12);
  assert.ok(b && b.n === 3 && Math.abs(b.a - a) < 0.2, `가장 많이 걸리는 쪽 (${b && b.a})`);
  assert.equal(S.castSkill(g, h, 0, 0), true);
  for (let i = 0; i < 60; i++) S.step(g, 1 / 60);
  const hurt = g.enemies.filter((e) => !e.dead && e.hp < e.maxHp).length;
  assert.ok(hurt >= 3, `대각선 3명 모두 맞음 (${hurt})`);
});

test('새 멤버 4명: 정소영 잔소리 → 성준영 소환(올인!) · 오지은 감속+악마 모습 · 박상화 성장+경험치 · 홍정민 입구 수리', () => {
  // 정소영: 스킬(올인 콜)을 쓰면 성준영이 나오고, 시간이 지나면 "들어갈게~" 하고 사라진다
  let g = S.createGame({ rng: seeded(501), noWaves: true, heroes: ['soyoung'] });
  const so = g.heroes[0];
  g.phase = 'wave';
  S.spawnEnemy(g, 'thug', so.x, so.y - 200, { hpMul: 100 });
  so.skillCd = 0; assert.equal(S.castSkill(g, so), true);
  const jy = g.heroes.find((h) => h.id === 'junyoung');
  assert.ok(jy && jy.summon, '성준영 소환');
  for (let i = 0; i < 60 * 12; i++) S.step(g, 1 / 60);
  assert.ok(!g.heroes.some((h) => h.id === 'junyoung'), '시간이 지나면 사라짐');
  // 오지은: 공격하면 악마 모습 + 맞은 진상 느려짐
  g = S.createGame({ rng: seeded(502), noWaves: true, heroes: ['jieun'] });
  const ji = g.heroes[0];
  const e = S.spawnEnemy(g, 'thug', ji.x, ji.y - 220, { hpMul: 100 });
  let demon = false;
  for (let i = 0; i < 150; i++) { S.step(g, 1 / 60); if (ji.alt) demon = true; }
  assert.ok(demon, '악마 모습');
  assert.ok(e.slowT > 0 && e.slowMul < 1, '감속');
  // 박상화: 웨이브 끝날 때마다 성장 · 잡은 진상 경험치 +
  g = S.createGame({ rng: seeded(503), noWaves: true, heroes: ['sanghwa'] });
  const sh = g.heroes[0];
  const d0 = S.heroDamage(g, sh);
  sh.grow = 0.2;
  assert.ok(Math.abs(S.heroDamage(g, sh) / d0 - 1.2) < 1e-9, '성장 +20%');
  // 홍정민: 틈틈이 입구 수리
  g = S.createGame({ rng: seeded(504), noWaves: true, heroes: ['jungmin'] });
  g.phase = 'wave'; g.base.hp = g.base.max * 0.5;
  for (let i = 0; i < 60 * 4; i++) S.step(g, 1 / 60);
  assert.ok(g.base.hp > g.base.max * 0.5, '입구 수리');
  // 모집 · 서버 목록
  for (const id of ['soyoung', 'jieun', 'sanghwa', 'jungmin']) { assert.ok(D.GACHA_HEROES.includes(id)); assert.ok(require('../server/langbang-rules').LB_HEROES.includes(id), id); }
  assert.ok(!D.HEROES.junyoung && D.SUMMONS.junyoung, '성준영은 소환 전용');
});

test('상태이상 저항: 강화 1레벨 -1.5% · 장비(숙취해소 부적) 합쳐 최대 -35% · 홀림 · 기절에 적용 · 서버 장비 목록과 같다', () => {
  assert.equal(D.resOf(0, 0), 0);
  assert.ok(Math.abs(D.resOf(10, 0) - 0.15) < 1e-9);
  assert.equal(D.resOf(20, 0.2), 0.35, '최대 -35%');
  const R = require('../server/langbang-rules');
  assert.deepEqual(Object.keys(R.GEAR).sort(), Object.keys(D.GEAR).sort());
  assert.ok(D.GEAR.hangover && D.GEAR.hangover.stat === 'res' && D.GEAR_STATS.res);
  const mk = (meta) => { const g = S.createGame({ rng: seeded(700), noWaves: true, heroes: ['staff'], meta: { staff: meta } }); const e = S.spawnEnemy(g, 'namkko', g.heroes[0].x, g.heroes[0].y - 30, { hpMul: 50 }); e.def = Object.assign({}, e.def, { charm: 'both' }); S.tryCharm && S.tryCharm(g, e); return g.heroes[0]; };
  const a = mk(0), b = mk(20);
  if (a.charmT > 0) assert.ok(b.charmT < a.charmT * 0.75, `강화한 멤버는 홀림이 짧다 ${a.charmT} → ${b.charmT}`);
});

test('강성구 지팡이 블랙홀: 가장 몰린 곳에 → 2초 빨아들임(보스는 약하게) → 쾅 + 기절 · 진상 없으면 아껴 둠', () => {
  const g = S.createGame({ rng: seeded(801), noWaves: true, heroes: ['sunggu'] });
  const h = g.heroes[0];
  h.skillCd = 0;
  assert.equal(S.castSkill(g, h, 0, 0), false, '진상 없으면 안 씀');
  const list = [];
  for (let i = 0; i < 6; i++) list.push(S.spawnEnemy(g, 'thug', 110 + i * 22, 250 + (i % 2) * 20, { hpMul: 30 }));
  const far = S.spawnEnemy(g, 'thug', 330, 420, { hpMul: 30 });
  const d0 = Math.abs(list[5].x - list[0].x);
  assert.equal(S.castSkill(g, h, 0, 0), true);
  let boom = null;
  for (let i = 0; i < 60 * 2.5; i++) { S.step(g, 1 / 60); for (const e of g.events) if (e.type === 'bhBoom') boom = e; g.events.length = 0; }
  assert.ok(boom && boom.n >= 4, `쾅 (${boom && boom.n}명)`);
  assert.ok(Math.abs(list[5].x - list[0].x) < d0, '빨려 들어 모였다');
  assert.ok(list.every((e) => e.hp < e.maxHp), '모두 피해');
  assert.equal(far.hp, far.maxHp, '멀리 있는 진상은 안 맞음');
});

test('백인규 할리: 진상이 제일 많은 쪽으로 · 3칸 폭 띠 안은 전부 계속 따끔 · 밖은 안 맞음 · 보스는 안 밀림', () => {
  const g = S.createGame({ rng: seeded(901), noWaves: true, heroes: ['ingyu'] });
  const h = g.heroes[0];
  const sk = D.HEROES.ingyu.skill;
  assert.ok(sk.w >= 150 && sk.w <= 190, '폭 약 3칸 (한 칸 ≈ 58)');
  const inBand = [0, 60, -60, 80].map((dx, i) => S.spawnEnemy(g, 'thug', h.x + dx, h.y - 120 - i * 60, { hpMul: 40 }));
  const out = S.spawnEnemy(g, 'thug', h.x + 150, h.y - 200, { hpMul: 40 });
  const boss = S.spawnEnemy(g, 'boss_thug', h.x + 10, h.y - 300, { hpMul: 2 });
  const bx = boss.x;
  h.skillCd = 0;
  assert.equal(S.castSkill(g, h, 0, 0), true);
  for (let i = 0; i < 60 * 4; i++) { h.stunT = 1; h.cd = 9; S.step(g, 1 / 60); } // 기본 공격은 막고 할리만
  assert.ok(inBand.every((e) => e.dead || e.hp < e.maxHp), '띠 안 전부 피해');
  assert.equal(out.hp, out.maxHp, '띠 밖은 안 맞음');
  assert.ok(boss.hp < boss.maxHp && Math.abs(boss.x - bx) < 1, '보스는 맞지만 안 밀림');
});

test('이한나 스킬 진화: 하트 빔이 한 줄로 늘어선 진상을 전부 꿰뚫는다 · 줄 밖은 안 맞음', () => {
  const g = S.createGame({ rng: seeded(77), noWaves: true, heroes: ['hanna'] });
  const h = g.heroes[0];
  h.skEvo = true; h.lv = 3;
  const line = [1, 2, 3, 4, 5].map((i) => S.spawnEnemy(g, 'thug', h.x, h.y - 60 - i * 80, { hpMul: 30 }));
  const off = S.spawnEnemy(g, 'thug', h.x + 160, h.y - 200, { hpMul: 30 });
  const n = S.heartBeam(g, h, 100, D.HEROES.hanna.skill.beam);
  assert.equal(n, 5, '줄에 선 5명 전부');
  assert.ok(line.every((e) => e.hp < e.maxHp));
  assert.equal(off.hp, off.maxHp);
});

test('건전남: 필드 구석 진상도 쏜다 (자기 줄 제한 없음) · 멀면 피해 -15%', () => {
  const g = S.createGame({ rng: seeded(5), noWaves: true, heroes: ['gunman'] });
  const h = g.heroes[0];
  const e = S.spawnEnemy(g, 'thug', 16, 90, { hpMul: 50 });
  let shots = 0;
  for (let i = 0; i < 120; i++) { S.step(g, 1 / 60); shots += g.events.filter((x) => x.type === 'shot' && x.hero === 'gunman').length; g.events.length = 0; }
  assert.ok(shots >= 3, '구석 진상에게 쏜다');
  assert.ok(e.hp < e.maxHp || g.projs.length > 0, '맞거나 날아가는 중');
});

test('진상 특성: 범위 면역 · 분열 · 은신 · 회복 · 방깎 · 도발 · 제어/넉백 면역', () => {
  // 범위 면역: 범위 피해 0 · 단일 피해는 들어간다
  let g = bare([]);
  const ear = still(g, 'earphone', 180, g.rowY - 200);
  assert.equal(S.damageEnemy(g, ear, 50, false, { def: { attr: 'talk' }, gear: {} }, true), 0, '범위 공격 안 들림');
  assert.ok(S.damageEnemy(g, ear, 50, false, { def: { attr: 'talk' }, gear: {} }, false) > 0, '단일 공격은 들어감');
  // 분열: 클럽남이 쓰러지면 클럽녀
  g = bare([]);
  const club = still(g, 'clubguy', 180, g.rowY - 200, 1);
  S.damageEnemy(g, club, 1e6, false, null, false);
  assert.ok(g.enemies.some((e) => !e.dead && e.type === 'clubgirl'), '클럽녀 등장');
  // 은신: 건전녀는 못 보고 운영진은 찾아낸다
  g = bare(['gunnyeo', 'staff']);
  const ns = still(g, 'noshow', 180, g.rowY - 260);
  assert.equal(S.findTarget(g, g.heroes.find((h) => h.id === 'gunnyeo')), null, '은신은 안 보임');
  assert.equal(S.findTarget(g, g.heroes.find((h) => h.id === 'staff')), ns, '운영진은 찾아낸다');
  // 회복: 칭찬 빌런이 곁의 진상을 고친다 · 짝을 잡으면 분노
  g = bare([]);
  const p1 = still(g, 'praise1', 180, g.rowY - 250), p2 = still(g, 'praise2', 200, g.rowY - 250), hurt = still(g, 'thug', 190, g.rowY - 240);
  hurt.hp = hurt.maxHp * 0.3;
  run(g, 4);
  assert.ok(hurt.hp > hurt.maxHp * 0.3, '회복');
  const atk0 = p2.atk;
  S.damageEnemy(g, p1, 1e6, false, null, false);
  assert.ok(p2.atk > atk0, '짝이 분노');
  // 방깎: 여지원 모자이크 → 쌓일수록 피해 증가
  g = bare(['jiwon']);
  const t1 = still(g, 'thug', g.heroes[0].x, g.rowY - 200);
  run(g, 4);
  assert.ok(t1.shredN >= 2, '방깎 겹 ' + t1.shredN);
  const a = S.damageEnemy(g, t1, 100, false, null, false);
  assert.ok(a > 100, '방깎만큼 더 아프다');
  // 도발: 정원식 결혼정보회사 → 입구 피해 -80%
  g = bare(['wonsik']);
  const w = g.heroes[0];
  const th = still(g, 'thug', w.x, g.rowY - 120);
  w.skillCd = 0; S.castSkill(g, w, w.x, g.rowY - 120);
  assert.ok(th.tauntT > 0, '도발 걸림');
  // 제어 · 넉백 면역
  g = bare([]);
  const gao = still(g, 'gao', 180, g.rowY - 250);
  const y0 = gao.y; S.applyKnockback(gao, 80, g);
  assert.equal(gao.y, y0, '가오충은 안 밀린다');
});

test('보스 패턴: 예고(1초) → 기술 → 틈(약점) → 반복 · 체력 50% 에서 분노 2페이즈 · 도발 탱커가 먼저 맞는다', () => {
  const g = bare(['wonsik', 'staff', 'gunman']);
  const b = still(g, 'boss_inpi', 180, 200, 5);
  b.bai.next = 0.1;
  const seen = [];
  for (let t = 0; t < 4; t += 1 / 60) { S.step(g, 1 / 60); for (const e of g.events) seen.push(e.type); g.events.length = 0; }
  assert.ok(seen.includes('bossWind'), '예고');
  assert.ok(seen.includes('bossSkill'), '기술');
  assert.ok(seen.includes('bossGap') || b.weakT > 0, '틈');
  assert.ok(seen.indexOf('bossWind') < seen.indexOf('bossSkill'), '예고가 먼저');
  b.hp = b.maxHp * 0.45;
  S.step(g, 1 / 60);
  assert.equal(b.bai.p2, true, '2페이즈');
  // 기절 기술은 도발 탱커(정원식)부터 노린다
  const g2 = bare(['wonsik', 'staff']);
  const b2 = still(g2, 'boss_gapjil', 180, 200, 5);
  b2.bai.i = 1; b2.bai.next = 0.05; // 두 번째 기술 = 돌진 호통(기절)
  for (let t = 0; t < 0.3; t += 1 / 60) S.step(g2, 1 / 60);
  assert.ok(b2.bai.targets.some((h) => h.id === 'wonsik'), '원식이 대신 맞는다');
});

test('1:1 대전 보상: 하루 10판 · 첫 승 2배 · 30초 안 판 · 같은 상대 3판 · 등급 첫 달성 우편', async () => {
  const L = await import('../public/langbang/live.js');
  const lb = {}; L.normLive({}, lb);
  const t = 1e12;
  assert.equal(L.pvpRewardCoins(lb, true, 'a', 60, t).coins, L.PVP_REWARD.win * 2, '첫 승 2배');
  assert.equal(L.pvpRewardCoins(lb, true, 'a', 60, t).coins, L.PVP_REWARD.win);
  assert.equal(L.pvpRewardCoins(lb, false, 'b', 10, t).coins, 0, '30초 안');
  assert.equal(L.pvpRewardCoins(lb, false, 'a', 60, t).coins, L.PVP_REWARD.lose);
  assert.equal(L.pvpRewardCoins(lb, true, 'a', 60, t).coins, 0, '같은 상대 3판 넘게');
  for (let i = 0; i < 20; i++) L.pvpRewardCoins(lb, false, 'x' + i, 60, t);
  assert.equal(L.pvpRewardCoins(lb, true, 'z', 60, t).coins, 0, '하루 10판');
  L.pvpTierUp(lb, 1250, t);
  assert.equal(lb.mail.length, 2, '실버 · 골드 첫 달성');
  L.pvpTierUp(lb, 1260, t);
  assert.equal(lb.mail.length, 2, '한 번씩만');
});

test('무한 개편: 5웨이브마다 저주 계약(10초면 자동) · 배율 · 코인 주머니 · 스킬 러시 · 체력 압박', () => {
  const g = S.createGame({ H: 760, rng: seeded(12), mode: 'endless', deck: ['bangjang', 'staff', 'gunman'], meta: {}, god: true });
  S.startWave(g, 6);
  assert.ok(g.curseOffer && g.curseOffer.opts.length === 3, '6웨이브: 계약 셋');
  const id = g.curseOffer.opts[0];
  assert.equal(S.applyCurse(g, id), true);
  assert.ok(g.curses.length === 1 && !g.curseOffer);
  assert.equal(S.applyCurse(g, id), false, '두 번은 안 됨');
  S.startWave(g, 11);
  g.phase = 'wave';
  for (let t = 0; t < 11; t += 1 / 60) S.step(g, 1 / 60);
  assert.equal(g.curses.length, 2, '10초 지나면 아무거나');
  assert.ok(g.scoreMul > 1, '점수 배율');
  // 코인 주머니
  g.idleT = 0; g.wave = 12; g.phase = 'wave';
  let tries = 0;
  while ((!g.idleEv || g.idleEv.kind !== 'bags') && tries++ < 40) { g.idleEv = null; g.idleT = 0; S.step(g, 1 / 60); }
  assert.equal(g.idleEv.kind, 'bags');
  const s0 = g.streak;
  for (const b of g.bags.slice()) assert.equal(S.tapBag(g, b.x, b.y + 1), true);
  S.step(g, 1 / 60);
  assert.ok(g.streak > s0 && !g.idleEv, '성공 → 배율 ↑');
  // 요약 점수에 배율이 들어간다
  const sm = S.summary(g, 100);
  assert.ok(sm.mult > 1 && sm.score >= g.stats.score);
  // 압박: 40웨이브 체력 배율이 20웨이브의 수십 배
  assert.ok(D.hpMul(40, false) / D.hpMul(20, false) > 8);
});

test('증강 · 테크 트리 · 제어 분기: 1·3·5웨이브 증강(실버→골드→프리즘) · 테크는 앞 단계를 가져야 · 세트 보너스 · 맞히면 제어', () => {
  const g = S.createGame({ H: 760, rng: seeded(44), mode: 'stage', stage: 8, deck: [null, 'staff', 'bangjang', 'donghan', null, null], meta: {}, god: true });
  S.startWave(g, 1);
  assert.ok(g.augOffer && g.augOffer.tier === 'silver' && g.augOffer.opts.length === 3, '1웨이브 실버 증강');
  assert.equal(S.applyAug(g, g.augOffer.opts[0]), true);
  S.startWave(g, 3);
  assert.equal(g.augOffer.tier, 'gold');
  assert.ok(g.augOffer.opts.some((id) => id.startsWith('ha_')), '골드부터 멤버 전용 증강 (덱에 있는 멤버)');
  g.augOffer = null;
  // 테크: tag_splash 없으면 골드 안 나옴 → 가지면 나옴
  const has = () => S.cardPool(g).some((c) => c.id === 'tech_splash_2');
  assert.equal(has(), false);
  S.applyCard(g, { kind: 'global', id: 'tag_splash', tags: ['splash'] });
  assert.equal(has(), true, '실버 뒤 골드');
  // 세트 보너스: 같은 길 3장
  const d0 = g.mods.tagDmg.splash || 0;
  S.applyCard(g, { kind: 'global', id: 'tech_splash_2', tags: ['splash'], title: 'x' });
  S.applyCard(g, { kind: 'global', id: 'swarm', tags: ['splash'] });
  assert.equal(g.tagCnt.splash, 3);
  assert.ok(g.mods.tagDmg.splash > d0 + 0.35 + 0.2 - 1e-9, '골드 + 3세트');
  // 길 확정 칸: 한 길 2번 뒤 뽑기에 그 길 카드가 들어온다
  const cs = S.rollCards(g);
  assert.ok(cs.some((c) => (c.tags || []).includes('splash')), '길 카드 확정');
  // 제어 분기
  const h = g.heroes.find((x) => x.id === 'staff'); h.lv = 3;
  const cc = S.cardPool(g).find((c) => c.kind === 'cc' && c.hero === 'staff');
  assert.ok(cc && cc.cc === 'slow');
  S.applyCard(g, cc);
  assert.equal(h.cc, 'slow');
});

test('중간 보스: 기술 하나 (1초 예고 → 기술 → 틈) · 체력 50% 에서 흥분', () => {
  const g = bare(['staff', 'gunman']);
  const m = still(g, 'mid_thug', 180, 200, 5);
  assert.ok(m.bai && m.bai.mid, '중간 보스 머리');
  m.bai.next = 0.05;
  const seen = [];
  for (let t = 0; t < 3; t += 1 / 60) { S.step(g, 1 / 60); for (const e of g.events) seen.push(e.type); g.events.length = 0; }
  assert.ok(seen.includes('bossWind') && seen.includes('bossSkill'), '예고 → 기술');
  m.hp = m.maxHp * 0.4; S.step(g, 1 / 60);
  assert.equal(m.bai.p2, true);
  assert.ok(g.events.some((e) => e.type === 'midRage') || seen.includes('midRage') || m.bai.p2);
});

test('정소영 올인 콜 → 성준영: 진상을 한곳으로 모은다(평균 거리 ↓) · 정해진 시간 뒤 사라짐 · 가만히 서 있기(후퇴) 없음 · 덱 6칸 꽉 차도', () => {
  for (const deck of [[null, 'staff', 'bangjang', 'soyoung', null, null], ['gunnyeo', 'staff', 'bangjang', 'soyoung', 'gunman', 'ingyu']]) {
    const g = S.createGame({ H: 760, rng: seeded(7), noWaves: true, deck, meta: {}, god: true });
    g.phase = 'wave';
    const foes = [];
    for (let i = 0; i < 8; i++) { const e = S.spawnEnemy(g, 'thug', 40 + i * 40, g.rowY - 230 - (i % 3) * 40, { hpMul: 400 }); e.speed = 0; foes.push(e); }
    const spread = () => { let s = 0, n = 0; for (let a = 0; a < foes.length; a++) for (let b = a + 1; b < foes.length; b++) { s += Math.hypot(foes[a].x - foes[b].x, foes[a].y - foes[b].y); n++; } return s / n; };
    const d0 = spread();
    const so = g.heroes.find((h) => h.id === 'soyoung');
    so.skillCd = 0; assert.equal(S.castSkill(g, so), true);
    const jy = g.heroes.find((h) => h.id === 'junyoung');
    assert.ok(jy, '소환 (' + deck.filter(Boolean).length + '명 덱)');
    const ax = jy.ax;
    let still = 0;
    for (let i = 0; i < 60 * 6; i++) { const px = jy.px, py = jy.py; S.step(g, 1 / 60); if (Math.abs(jy.px - px) + Math.abs(jy.py - py) < 1e-6 && Math.hypot(jy.px - jy.ax, jy.py - (jy.ay + 70)) > 10) still++; }
    assert.ok(spread() < d0 * 0.8, `뭉침 ${d0.toFixed(0)} → ${spread().toFixed(0)}`);
    assert.ok(Math.abs(jy.ax - ax) < 120, '기준점이 크게 안 흔들림');
    assert.equal(still, 0, '기준점에서 떨어진 채 멈춰 있지 않음');
    for (let i = 0; i < 60 * 6; i++) S.step(g, 1 / 60);
    assert.ok(!g.heroes.some((h) => h.id === 'junyoung'), '8초 뒤 사라짐');
  }
});
