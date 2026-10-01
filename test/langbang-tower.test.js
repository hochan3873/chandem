'use strict';
// 진상의 탑: 층 구성 · 규칙 · 한 명 잠금 · 하루 도전 · 첫 클리어 보상 · 각성 · 지옥 세트 · 주간 랭킹 · 멤버 전용 스킬 증강 · 서버 길
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S, T, L;
let srv, base;
test.before(async () => {
  D = await load('data.js'); S = await load('sim.js'); T = await load('tower.js'); L = await load('live.js');
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });

function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const run = (g, sec) => { for (let t = 0; t < sec && !g.over && g.phase !== 'victory'; t += 1 / 60) S.step(g, 1 / 60); };
// 손님 프로필처럼 정리된 lb (1-10 클리어 · 기본 멤버)
function lbOf(extra = {}) {
  const raw = Object.assign({ stages: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 3])), maxStage: 10, heroes: {}, coins: 0, tickets: 0, gear: [], gearSeq: 0, titles: [], frames: [] }, extra);
  const out = Object.assign({}, raw);
  L.normLive(raw, out);
  T.normTower(raw, out);
  out.gear = []; out.gearSeq = 0; out.coins = 0; out.maxStage = 10; out.stages = raw.stages;
  return out;
}
const towerGame = (f, hero = 'bangjang', extra = {}) => S.createGame(Object.assign({ H: 760, rng: seeded(f * 7 + 1), mode: 'stage', stage: 35, deck: [null, null, hero, null, null, null], tempo: true, join: false, tower: T.floorDef(f), towerExp: T.TOWER.exp }, extra));

test('탑: 60층 · 15층마다 구역 · 5층마다 보스 · 46층부터 규칙 둘 · 구역마다 규칙 7가지 전부', () => {
  for (let f = 1; f <= 60; f++) {
    const r = T.floorRules(f);
    assert.equal(r.includes('boss'), f % 5 === 0, `${f}층 보스 여부`);
    assert.equal(r.length, f >= 46 ? 2 : 1, `${f}층 규칙 수`);
    for (const x of r) assert.ok(T.RULES[x], x);
    const def = T.floorDef(f);
    assert.ok(def.waves.length >= 2 && def.waves.length <= 3, '웨이브 2~3');
    for (const w of def.waves) for (const [t, n] of w.g) { assert.ok(D.ENEMIES[t], t); assert.ok(n > 0); }
    if (f % 5 === 0) { assert.ok(D.ENEMIES[def.boss] && D.ENEMIES[def.boss].boss && D.ENEMIES[def.boss].towerOnly, '탑 전용 보스'); assert.equal(def.waves[def.waves.length - 1].boss, def.boss); }
    assert.equal(T.zoneOf(f).id, Math.ceil(f / 15));
  }
  for (let z = 0; z < 4; z++) {
    const set = new Set();
    for (let f = z * 15 + 1; f <= z * 15 + 15; f++) for (const x of T.floorRules(f)) set.add(x);
    for (const k of ['titan', 'swarm', 'curse', 'rush', 'seal', 'shield', 'dark', 'boss']) assert.ok(set.has(k), `${z + 1}구역에 ${k}`);
  }
  // 속성 봉인: 약해지는 속성과 강해지는 속성이 다르고, 네 속성이 돌아가며 약해진다
  const weak = new Set();
  for (let f = 1; f <= 60; f++) { const s = T.floorSeal(f); assert.notEqual(s.weak, s.strong); weak.add(s.weak); }
  assert.equal(weak.size, 4);
});

test('탑: 층이 오를수록 진상 체력 · 공격력이 복리로 오른다 (같은 층 안에서도 웨이브마다)', () => {
  for (let f = 2; f <= 60; f++) { assert.ok(T.floorHp(f) > T.floorHp(f - 1)); assert.ok(T.floorAtk(f) > T.floorAtk(f - 1)); }
  let m = 1; for (let f = 2; f <= 60; f++) m *= T.growAt(f, 1);
  assert.ok(Math.abs(T.floorHp(60) / T.floorHp(1) - m) < 1e-6, '구간 배율을 층마다 곱한다');
  // 16~35층이 가파르다 (예전 한 줄 ×1.065 보다 35층이 4배 넘게 단단) · 46층부터는 규칙 둘이 벽이라 거의 그대로
  assert.ok(T.floorHp(35) > 0.9 * Math.pow(1.065, 34) * 4, `35층 ${T.floorHp(35).toFixed(1)}`);
  assert.ok(T.floorHp(60) / T.floorHp(46) < 1.15);
  // 실제 진상 체력 (웨이브 배율까지)
  const hp = (f) => { const g = towerGame(f); S.startWave(g, 1); for (let i = 0; i < 400 && !g.enemies.length; i++) S.step(g, 1 / 60); const e = g.enemies[0]; return e.maxHp / e.def.hp / (e.titan ? 1 : 1); };
  assert.ok(hp(40) > hp(10) * 3, '40층 진상이 10층보다 훨씬 단단');
  const def = T.floorDef(30);
  for (let w = 1; w < def.waves.length; w++) assert.ok(def.waves[w].hpScale > def.waves[w - 1].hpScale * 0.999);
});

test('탑: 멤버 한 명만 (덱에 여러 명이어도) · 합류 · 임시 증원 · 게스트 카드 없음', () => {
  const g = S.createGame({ H: 760, rng: seeded(3), mode: 'stage', stage: 35, deck: ['staff', 'gunman', 'bangjang', 'gunnyeo', null, null], tempo: true, join: false, tower: T.floorDef(3), guestPool: ['dohoon'] });
  assert.equal(g.heroes.length, 1, '한 명만');
  assert.equal(g.maxHeroes, 1);
  assert.equal(S.addHero(g, 'hanna'), null, '더 못 들어온다');
  g.wave = 3;
  for (let i = 0; i < 200; i++) {
    const cards = S.rollCards(g, 4, { secretChance: 1, hiddenChance: 1 });
    for (const c of cards) assert.ok(!['join', 'addHero', 'secret'].includes(c.kind), c.kind);
    S.applyCard(g, cards[0]);
  }
  assert.equal(g.heroes.filter((h) => !h.def.summon).length, 1);
});

test('탑 규칙: 보호막 겹 · 속성 봉인 · 어둠 사거리 · 거물 · 저주 · 제한 시간', () => {
  // 보호막: 한 방에 한 겹 막힌다
  const fS = [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f).includes('shield') && f >= 20);
  let g = towerGame(fS, 'staff');
  const e = S.spawnEnemy(g, 'drunk', 180, 200);
  assert.ok(e.tLay >= 2, '보호막 2겹 이상');
  const h = g.heroes[0], lay = e.tLay, hp0 = e.hp;
  assert.equal(S.damageEnemy(g, e, 10, false, h), 0);
  assert.equal(e.tLay, lay - 1); assert.equal(e.hp, hp0);
  // 속성 봉인: 약한 속성은 피해가 줄고 강한 속성은 늘어난다
  const fSeal = 38; const s = T.floorSeal(fSeal);
  assert.ok(T.floorRules(fSeal).includes('seal'));
  const hero = (a) => Object.keys(D.HEROES).find((id) => D.HEROES[id].attr === a && id !== 'hochan' && id !== 'byunghwa');
  const base = (id, tw) => { const g0 = S.createGame({ H: 760, rng: seeded(1), deck: [null, null, id, null, null, null], noWaves: true, tower: tw }); return S.heroDamage(g0, g0.heroes[0]); };
  const plain = T.floorDef(fSeal - 1);
  assert.ok(base(hero(s.weak), T.floorDef(fSeal)) < base(hero(s.weak), plain) * 0.6, '약한 속성 −');
  assert.ok(base(hero(s.strong), T.floorDef(fSeal)) > base(hero(s.strong), plain) * 1.2, '강한 속성 +');
  // 어둠: 사거리 줄어듦 · 진상이 숨는다
  const fD = [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f).includes('dark') && f > 25);
  g = towerGame(fD, 'gunman');
  const g2 = towerGame(fD - 1, 'gunman');
  assert.ok(S.heroRange(g, g.heroes[0]) < S.heroRange(g2, g2.heroes[0]) * 0.8);
  assert.ok(S.isHidden(S.spawnEnemy(g, 'drunk', 100, 50)), '어둠: 숨은 진상');
  // 거물: 정예가 체력 · 공격력 큰 거물이 된다
  const fT = [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f)[0] === 'titan' && f > 25);
  g = towerGame(fT);
  const t1 = S.spawnEnemy(g, 'thug', 180, 50, { elite: true }), t2 = S.spawnEnemy(g, 'thug', 180, 50);
  assert.ok(t1.titan && t1.maxHp > t2.maxHp * 5 && t1.atk > t2.atk * 2 && t1.speed < t2.speed);
  // 저주: 진상이 멤버에게 상태이상을 건다 (강성구는 기절 면역)
  const fC = [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f)[0] === 'curse' && f > 20);
  g = towerGame(fC, 'bangjang');
  let cursed = 0;
  for (let t = 0; t < 60 && !g.over; t += 1 / 60) { S.step(g, 1 / 60); for (const ev of g.events) if (ev.type === 'twCurse') cursed++; g.events.length = 0; }
  assert.ok(cursed >= 3, `저주 ${cursed}번`);
  // 제한 시간: 넘기면 실패
  g = towerGame(1); g.god = true;
  g.t = g.tower.limit + 1; g.phase = 'wave';
  S.step(g, 1 / 60);
  assert.equal(g.over, true, '시간 초과 = 실패');
});

test('탑 김영준: 혼자일 때 공격력 −30% (탑에서만) · 떼거리엔 금방 지치고 · 돌진 진상은 절반 빗나가고 · 저주에 걸리면 돌격이 끊긴다', () => {
  const dmg = (tw) => { const g0 = S.createGame({ H: 760, rng: seeded(1), deck: [null, null, 'youngjun', null, null, null], noWaves: true, tower: tw }); return S.heroDamage(g0, g0.heroes[0]); };
  const fPlain = 5; // 보스 층 (봉인 없음)
  assert.ok(Math.abs(dmg(T.floorDef(fPlain)) / dmg(undefined) - D.TOWER_SIM.solo.youngjun) < 1e-6, '탑에서만 −30%');
  const floorOf = (r) => [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f).length === 1 && T.floorRules(f)[0] === r && f > 25);
  // 떼거리: 돌격 시간 짧게 · 숨 고르기 길게
  const outOf = (f) => { const g = towerGame(f, 'youngjun'); for (let i = 0; i < 60 * 40 && !g.heroes[0].out; i++) { S.step(g, 1 / 60); g.augOffer = null; g.pendingLevels = 0; } return g.heroes[0].outT; };
  const fSw = floorOf('swarm'), fCu = floorOf('curse');
  assert.ok(outOf(fSw) < outOf(fCu) * 0.7, `떼거리 돌격 ${outOf(fSw).toFixed(2)}초`);
  // 돌진: 근접 돌격은 빠른 진상에게 절반이 빗나간다 (다른 멤버는 그대로)
  const miss = (hero) => { const g = towerGame(floorOf('rush'), hero); const h = g.heroes[0]; let n = 0; for (let i = 0; i < 400; i++) { const e = S.spawnEnemy(g, 'mukti', 180, 200); e.tLay = 0; if (S.damageEnemy(g, e, 1, false, h) === 0) n++; e.dead = true; } return n / 400; };
  assert.ok(miss('youngjun') > 0.4 && miss('gunman') < 0.4, `빗나감 김영준 ${miss('youngjun')} · 건전남 ${miss('gunman')}`);
  // 저주: 돌격 중에 기절 · 홀림이 걸리면 돌격이 끊긴다
  const g = towerGame(fCu, 'youngjun'); const h = g.heroes[0];
  let broke = false;
  for (let i = 0; i < 60 * 90 && !broke && !g.over; i++) { const was = h.out; S.step(g, 1 / 60); g.augOffer = null; g.pendingLevels = 0; if (was && !h.out && g.events.some((x) => (x.type === 'twCurse' && (x.kind === 'stun' || x.kind === 'charm')))) broke = true; g.events.length = 0; }
  assert.ok(broke, '저주가 돌격을 끊는다');
});

test('탑 어둠 · 거물: 어둠의 층 드러눕는 진상은 눕지 않고 · 거물은 보인다 · 규칙 둘인 층 거물은 체력 절반', () => {
  const fD = [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f).includes('dark') && T.floorRules(f).includes('titan'));
  const g = towerGame(fD, 'ara');
  const sl = S.spawnEnemy(g, 'drunk_sleep', 180, 50);
  assert.ok(sl.slept && !sl.sleeping, '드러눕지 않는다');
  const ti = S.spawnEnemy(g, 'kkondae2', 120, 50, { elite: true });
  assert.ok(ti.titan && !S.isHidden(ti), '거물은 어둠에서도 보인다');
  const fT1 = [...Array(60).keys()].map((i) => i + 1).find((f) => T.floorRules(f).length === 1 && T.floorRules(f)[0] === 'titan' && f > 30);
  const g1 = towerGame(fT1); const one = S.spawnEnemy(g1, 'kkondae2', 120, 50, { elite: true }), base1 = S.spawnEnemy(g1, 'kkondae2', 120, 50);
  const two = ti, base2 = S.spawnEnemy(g, 'kkondae2', 120, 50);
  assert.ok(Math.abs(two.maxHp / base2.maxHp / (one.maxHp / base1.maxHp) - D.TOWER_SIM.titan.pair) < 0.01, '규칙 둘: 거물 체력 ×0.5');
});

test('탑 자리 옮기기: 손으로 끝 칸에 놓으면 바로 그 자리 · 옆으로 밀리지 않고 · 자동 자리 잡기는 잠깐 쉰다 (이호찬 · 강성구)', () => {
  for (const hero of ['hochan', 'sunggu']) {
    const g = towerGame(3, hero, { meta: { [hero]: 10 } });
    const h = g.heroes[0];
    const walk = (sec) => { for (let i = 0; i < sec * 60; i++) { S.step(g, 1 / 60); g.augOffer = null; g.pendingLevels = 0; } };
    // 진상이 몰린 줄로 알아서 걸어가는 중일 때
    let moved = false;
    for (let i = 0; i < 40 * 60 && !moved; i++) { S.step(g, 1 / 60); g.augOffer = null; g.pendingLevels = 0; moved = h.laneX !== undefined && Math.abs(h.laneX - h.x) > 30; }
    assert.ok(moved, `${hero}: 자동으로 걸어가는 중`);
    for (const slot of [0, g.nPos - 1]) {
      assert.equal(S.swapHeroes(g, h, slot), true, `${hero}: ${slot}번 칸으로 옮겨진다`);
      const x0 = g.slotX[slot];
      for (let t = 0; t < D.TOWER_SIM.laneHold - 0.5; t += 0.5) { walk(0.5); assert.ok(Math.abs(h.x - x0) < 1, `${hero}: ${slot}번 칸 그대로 (${t + 0.5}초 뒤 x=${h.x.toFixed(0)} · 칸 ${x0})`); }
    }
    // 걸어가서 칸을 벗어난 뒤에도, 처음 칸으로 다시 끌어 놓으면 돌아온다 (같은 칸이라고 무시하지 않기)
    h.x = g.slotX[h.slot] + 120; h.laneX = h.x;
    assert.equal(S.swapHeroes(g, h, h.slot), true, `${hero}: 벗어난 같은 칸으로도 돌아온다`);
    assert.equal(h.x, g.slotX[h.slot]);
    assert.equal(S.swapHeroes(g, h, h.slot), false, '이미 그 칸이면 그대로');
  }
});

test('탑: 하루 도전 5번 (실패만 깎임) · 층은 최고+1 까지 · 처음 깬 층만 보상 · 판 번호 · 시간 확인', () => {
  const now = Date.UTC(2026, 9, 1, 3, 0, 0);
  const lb = lbOf();
  assert.ok(T.towerOpen(lb));
  assert.ok(T.towerStart(lb, 2, 'bangjang', 'r0', now).error, '2층은 아직');
  assert.ok(T.towerStart(lb, 1, 'hanna', 'r0', now).error, '없는 멤버');
  // 1층 깨기 → 보상 · 도전 돌려받음
  let s = T.towerStart(lb, 1, 'bangjang', 'r1', now);
  assert.equal(s.left, 4);
  assert.ok(T.towerFinish(lb, { runId: 'zz', clear: true, durationSec: 100 }, 'u', now + 120e3).error, '판 번호 틀림');
  s = T.towerStart(lb, 1, 'bangjang', 'r1', now);
  assert.ok(T.towerFinish(lb, { runId: 'r1', clear: true, durationSec: 5 }, 'u', now + 120e3).error, '너무 빠름');
  s = T.towerStart(lb, 1, 'bangjang', 'r2', now);
  const coins0 = lb.coins | 0;
  let r = T.towerFinish(lb, { runId: 'r2', clear: true, durationSec: 100, kills: 30 }, 'u', now + 120e3);
  assert.ok(!r.error, r.error);
  assert.equal(r.first, true);
  assert.equal(lb.coins - coins0, T.floorReward(1).coins);
  assert.equal(lb.tower.stone, T.floorReward(1).hell);
  assert.equal(lb.tower.best, 1);
  // 다시 오르기: 보상 없음
  T.towerStart(lb, 1, 'bangjang', 'r3', now);
  r = T.towerFinish(lb, { runId: 'r3', clear: true, durationSec: 100 }, 'u', now + 120e3);
  assert.equal(r.first, false); assert.equal(r.reward, null);
  // 깬 판은 돌려받아서 지금 남은 도전 = 5 − (중간에 버린 판 1 + 너무 빨라 거절된 판 1) = 3 → 실패 3번이면 끝
  assert.equal(T.triesLeft(lb, now), 3);
  for (let i = 0; i < 3; i++) { const st = T.towerStart(lb, 2, 'bangjang', 'f' + i, now); assert.ok(!st.error, st.error); T.towerFinish(lb, { runId: 'f' + i, clear: false, durationSec: 30 }, 'u', now + 60e3); }
  assert.equal(T.triesLeft(lb, now), 0);
  assert.ok(T.towerStart(lb, 2, 'bangjang', 'x', now).error, '오늘은 끝');
  assert.equal(T.triesLeft(lb, now + 86400e3), 5, '다음 날 다시 5번');
});

test('탑: 마일스톤 (15 칭호 · 30 프레임 · 45 전설 선택권 · 60 칭호+프레임+LEGEND 묶음 · 명예의 전당) · 멤버별 각성', () => {
  const now = Date.UTC(2026, 9, 1, 3, 0, 0);
  const lb = lbOf();
  lb.tower.best = 14;
  T.towerStart(lb, 15, 'gunman', 'a', now, true);
  let r = T.towerFinish(lb, { runId: 'a', clear: true, durationSec: 100 }, 'u', now + 200e3);
  assert.ok(lb.titles.includes('tower15') && r.miles.length === 1);
  assert.equal(L.titleName('tower15'), '탑 등반가');
  lb.tower.best = 29; T.towerStart(lb, 30, 'gunman', 'b', now, true); T.towerFinish(lb, { runId: 'b', clear: true, durationSec: 100 }, 'u', now + 200e3);
  assert.ok(lb.frames.includes('towerflame') && L.FRAMES.towerflame);
  lb.tower.best = 44; T.towerStart(lb, 45, 'gunman', 'c', now, true); T.towerFinish(lb, { runId: 'c', clear: true, durationSec: 100 }, 'u', now + 200e3);
  assert.equal(lb.tower.picks.legend, 1);
  const g0 = lb.gear.length;
  assert.ok(!T.pickLegendGear(lb, 'scope').error);
  assert.equal(lb.gear.length, g0 + 1); assert.equal(lb.gear[lb.gear.length - 1].r, 'legend'); assert.equal(lb.tower.picks.legend, 0);
  lb.tower.best = 59; T.towerStart(lb, 60, 'gunman', 'd', now, true);
  r = T.towerFinish(lb, { runId: 'd', clear: true, durationSec: 100 }, 'u', now + 200e3);
  assert.ok(lb.titles.includes('tower60') && lb.frames.includes('towergold') && lb.tower.picks.hero === 1 && r.hall && lb.tower.hall.hero === 'gunman');
  assert.ok(!T.pickLegendHero(lb, 'byunghwa').error); assert.ok(lb.owned.byunghwa);
  // 각성: 그 멤버로 오른 최고 층
  assert.equal(T.awakeLv(lb, 'gunman'), 3);
  assert.equal(T.awakeLv(lb, 'bangjang'), 0);
  lb.tower.hb.bangjang = 25; assert.equal(T.awakeLv(lb, 'bangjang'), 1);
  // 각성은 모든 모드에서: 공격력 +5% · 스킬 +15%
  const dmg = (aw) => { const g = S.createGame({ H: 760, rng: seeded(1), heroes: ['gunman'], noWaves: true, awake: { gunman: aw } }); return S.heroDamage(g, g.heroes[0]); };
  assert.ok(Math.abs(dmg(1) / dmg(0) - 1.05) < 1e-9);
});

test('탑: 염화석 상점 · 지옥 세트 (2세트 상태이상 −30% · 4세트 처치 폭발) · 소모품 주간 제한', () => {
  const now = Date.UTC(2026, 9, 1, 3, 0, 0);
  const lb = lbOf();
  lb.tower.stone = 2000;
  for (const id of T.HELL_IDS) { assert.ok(!T.shopBuy(lb, id, now).error); assert.ok(T.shopBuy(lb, id, now).error, '두 번 못 산다'); }
  assert.ok(!T.hellUp(lb, 'hs_horn').error); assert.equal(lb.tower.hs.hs_horn.lv, 1);
  for (const id of T.HELL_IDS) assert.ok(!T.hellEquip(lb, id, 'staff').error);
  const st = T.hellStats(lb, 'staff');
  assert.equal(st.hellSet, 4); assert.ok(st.atk > 0.08 && st.spd > 0 && st.hp > 0 && st.skill > 0);
  assert.deepEqual(T.hellStats(lb, 'gunman'), {});
  // 모집권: 주에 정해진 개수만
  const s = T.TOWER_SHOP.find((x) => x.id === 'tickets');
  for (let i = 0; i < s.n; i++) assert.ok(!T.shopBuy(lb, 'tickets', now).error);
  assert.ok(T.shopBuy(lb, 'tickets', now).error);
  assert.equal(lb.tickets, s.n * s.amount);
  // 2세트: 상태이상이 짧게
  const mk = (gear) => S.createGame({ H: 760, rng: seeded(2), heroes: ['staff'], noWaves: true, gear: { staff: gear } });
  const a = mk({}), b = mk({ hellSet: 2 });
  a.heroes[0].charmT = 0; b.heroes[0].charmT = 0;
  S.tryCharm(Object.assign(a, { stage: 30 }), { def: { charm: 'f' } }); S.tryCharm(Object.assign(b, { stage: 30 }), { def: { charm: 'f' } });
  assert.ok(b.heroes[0].charmT < a.heroes[0].charmT * 0.75);
  // 4세트: 처치하면 주변 진상이 불탄다
  const g = S.createGame({ H: 760, rng: seeded(2), heroes: ['staff'], noWaves: true, gear: { staff: { hellSet: 4 } } });
  const e1 = S.spawnEnemy(g, 'yeokko', 180, 300), e2 = S.spawnEnemy(g, 'drunk', 190, 305);
  const hp2 = e2.hp;
  S.damageEnemy(g, e1, 1e6, false, g.heroes[0]);
  S.step(g, 1 / 60);
  assert.ok(e2.hp < hp2, '화염 폭발');
});

test('탑: 주간 랭킹 (높은 층 → 빠른 기록) · 지난주 1위 "이번 주 탑의 주인" 은 다음 한 주만', () => {
  const wi = L.weekIndex(Date.UTC(2026, 9, 1));
  const now = L.weekStartMs(wi) + 3600e3;
  const lb = lbOf();
  lb.tower.best = 9;
  T.towerStart(lb, 10, 'staff', 'a', now, true);
  T.towerFinish(lb, { runId: 'a', clear: true, durationSec: 150 }, 'u', now + 400e3);
  T.towerStart(lb, 10, 'staff', 'b', now, true);
  const r = T.towerFinish(lb, { runId: 'b', clear: true, durationSec: 90 }, 'u', now + 400e3);
  assert.ok(r.weekBest); assert.equal(lb.tower.wk.sec, 90);
  assert.ok(T.weekScore({ f: 11, sec: 300 }) > T.weekScore({ f: 10, sec: 10 }));
  assert.ok(T.weekScore({ f: 10, sec: 90 }) > T.weekScore({ f: 10, sec: 150 }));
  // 다음 주: 지난주 1위 보상 → 칭호는 그 주 끝까지
  const next = L.weekStartMs(wi + 1) + 3600e3;
  lb.tower.wkPrev = lb.tower.wk; lb.tower.wk = null;
  const c = T.weekClaim(lb, 1, 'u', next);
  assert.ok(!c.error, c.error);
  assert.ok(lb.titles.includes('towerking'));
  assert.ok(T.weekClaim(lb, 1, 'u', next).error, '두 번 못 받음');
  const later = {}; Object.assign(later, lb); later.title = 'towerking';
  T.normTower(lb, later, L.weekStartMs(wi + 2) + 1000);
  assert.ok(!later.titles.includes('towerking') && later.title === '', '그다음 주엔 사라짐');
});

test('멤버 전용 스킬 증강: 모든 멤버 2~3개 · 판에 있는 멤버만 · 스테이지는 Lv3 부터 · 고르면 효과', () => {
  for (const id of Object.keys(D.HEROES)) {
    const list = D.SKILL_AUG[id];
    assert.ok(list && list.length >= 2 && list.length <= 3, `${id} 증강 수`);
    assert.equal(new Set(list.map((a) => a.id)).size, list.length);
    const g = S.createGame({ H: 760, rng: seeded(5), heroes: [id], noWaves: true });
    for (const a of list) {
      assert.ok(S.applySkillAug(g, id, a.id), `${id}:${a.id}`);
      assert.ok(g.heroes.find((h) => h.id === id).sa[a.id]);
    }
    assert.ok(!S.applySkillAug(g, id, list[0].id), '두 번은 안 됨');
    const h = g.heroes.find((x) => x.id === id);
    assert.ok(Math.abs(h.saAtk - D.SKILL_AUG_W.atk * list.length) < 1e-9);
  }
  // 스테이지: Lv1 멤버는 안 나오고 Lv3 이면 나온다 · 탑은 바로
  const g = S.createGame({ H: 760, rng: seeded(9), heroes: ['bangjang', 'staff'], noWaves: true, mode: 'stage', stage: 20 });
  const has = () => S.cardPool(g).some((c) => c.kind === 'skillAug');
  assert.equal(has(), false);
  g.heroes[0].lv = 3;
  assert.equal(has(), true);
  assert.ok(S.cardPool(g).filter((c) => c.kind === 'skillAug').every((c) => c.hero === 'bangjang'));
  const tg = towerGame(5, 'baul');
  assert.ok(S.cardPool(tg).some((c) => c.kind === 'skillAug' && c.hero === 'baul'));
  // 카드로 고르면 적용
  const card = S.cardPool(tg).find((c) => c.kind === 'skillAug');
  S.applyCard(tg, card);
  assert.ok(tg.heroes[0].sa[card.aug]);
  // 효과 예: 송바울 미끄러운 길 → 썰매 뒤 그 줄 진상이 느려진다
  const gb = S.createGame({ H: 760, rng: seeded(4), heroes: ['baul'], noWaves: true, tempo: true });
  const hb = gb.heroes[0];
  S.applySkillAug(gb, 'baul', 'ice');
  hb.skillCd = 0;
  const e = S.spawnEnemy(gb, 'drunk', hb.x, 200);
  e.hp = e.maxHp = 1e9;
  assert.ok(S.castSkill(gb, hb));
  S.step(gb, 1 / 60);
  assert.ok(e.slowT > 0 && e.slowMul < 0.7, '미끄러운 길');
  // 강병화 커튼콜: 원맨쇼 중 처치하면 시간이 늘어난다
  const gw = S.createGame({ H: 760, rng: seeded(4), heroes: ['byunghwa'], noWaves: true, tempo: true });
  S.applySkillAug(gw, 'byunghwa', 'curtain');
  gw.heroes[0].skillCd = 0;
  const v = S.spawnEnemy(gw, 'yeokko', 180, 300);
  S.castSkill(gw, gw.heroes[0]);
  const t0 = gw.onemanT;
  S.damageEnemy(gw, v, 1e6, false, gw.heroes[0]);
  assert.ok(gw.onemanT > t0, '커튼콜 +0.5초');
});

test('탑 서버: 시작 · 끝 (판 번호 · 첫 클리어 보상 서버 계산) · 랭킹 · 상점 · 1-10 전엔 잠김', async () => {
  const lbPost = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());
  const get = (url, token) => fetch(base + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((r) => r.json());
  const { token, user } = await srv.accounts.signup({ username: 'towerman', password: 'secret12', nickname: '탑돌이' });
  let r = await lbPost('/api/langbang/tower/start', token, { f: 1, hero: 'bangjang' });
  assert.equal(r.ok, false, '1-10 전엔 잠김');
  const st = (await srv.accounts.store.byId(user.id)).stats;
  st.langbang = Object.assign(st.langbang || {}, { stages: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 3])) });
  r = await lbPost('/api/langbang/tower/start', token, { f: 3, hero: 'bangjang' });
  assert.equal(r.ok, false, '3층은 아직');
  r = await lbPost('/api/langbang/tower/start', token, { f: 1, hero: 'bangjang' });
  assert.equal(r.ok, true, r.message);
  assert.ok(r.runId);
  // 너무 빨리 끝냈다고 하면 거절 (서버 시간)
  r = await lbPost('/api/langbang/tower/finish', token, { runId: r.runId, clear: true, durationSec: 200, kills: 40 });
  assert.equal(r.ok, false);
  // 시작 시각을 앞당겨 정상 판으로
  r = await lbPost('/api/langbang/tower/start', token, { f: 1, hero: 'bangjang' });
  (await srv.accounts.store.byId(user.id)).stats.langbang.tower.run.at -= 300e3;
  const fin = await lbPost('/api/langbang/tower/finish', token, { runId: r.runId, clear: true, durationSec: 120, kills: 40, coins: 999999 });
  assert.equal(fin.ok, true, fin.message);
  assert.equal(fin.first, true);
  assert.equal(fin.reward.coins, T.floorReward(1).coins, '보상은 서버 계산 (보낸 코인 무시)');
  assert.equal(fin.profile.tower.best, 1);
  assert.equal(fin.profile.tower.stone, T.floorReward(1).hell);
  // 같은 판 두 번 저장 안 됨
  assert.equal((await lbPost('/api/langbang/tower/finish', token, { runId: r.runId, clear: true, durationSec: 120 })).ok, false);
  // 주간 랭킹 · 명예의 전당
  const bd = await get('/api/langbang/tower', token);
  assert.equal(bd.ok, true);
  assert.equal(bd.top[0].nickname, '탑돌이'); assert.equal(bd.top[0].f, 1); assert.equal(bd.me.rank, 1);
  assert.ok(Array.isArray(bd.hall));
  // 상점: 염화석이 모자라면 거절 · 있으면 산다
  r = await lbPost('/api/langbang/tower/shop', token, { id: 'hs_horn' });
  assert.equal(r.ok, false);
  (await srv.accounts.store.byId(user.id)).stats.langbang.tower.stone = 500;
  r = await lbPost('/api/langbang/tower/shop', token, { id: 'hs_horn' });
  assert.equal(r.ok, true, r.message);
  r = await lbPost('/api/langbang/tower/hell/equip', token, { id: 'hs_horn', hero: 'bangjang' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.tower.hs.hs_horn.on, 'bangjang');
});

test('탑 피로: 깨면 +25 (31층부터 +40) · 다시 깨도 +25 · 실패 +15 · 한 시간에 6씩 회복 · 100이면 못 들어감 · 무료 모드는 안 쌓임', () => {
  const now = Date.UTC(2026, 9, 1, 3, 0, 0), H = 3600e3, F = T.FATIGUE;
  assert.equal(F.max, 100); assert.equal(F.perHour, 6); assert.equal(F.pow, 0.004);
  const lb = lbOf();
  const play = (f, hero, clear, at, free = false) => {
    const s = T.towerStart(lb, f, hero, 'p' + f + at, at, free);
    if (s.error) return s;
    return T.towerFinish(lb, { runId: 'p' + f + at, clear, durationSec: 100, kills: 10 }, 'u', at + 200e3, free);
  };
  // 처음 깬 층 +25 · 다시 깨도 +25 · 실패 +15
  let r = play(1, 'bangjang', true, now);
  assert.equal(r.fatAdd, 25); assert.equal(r.fat, 25);
  r = play(1, 'bangjang', true, now + 300e3);
  assert.equal(r.fatAdd, 25, '이미 깬 층'); assert.equal(T.fatigueOf(lb, 'bangjang', now + 500e3), 50);
  r = play(2, 'bangjang', false, now + 600e3);
  assert.equal(r.fatAdd, 15); assert.equal(T.fatigueOf(lb, 'bangjang', now + 800e3), 65);
  assert.equal(T.fatigueOf(lb, 'gunman', now), 0, '멤버마다 따로');
  // 31층부터 처음 깨면 +40 · 그 밑은 +25 · 다시 깨기 +25
  assert.equal(T.fatigueGain(30, true, false), 25); assert.equal(T.fatigueGain(31, true, false), 40); assert.equal(T.fatigueGain(45, true, true), 25); assert.equal(T.fatigueGain(45, false, false), 15);
  lb.tower.best = 30;
  r = play(31, 'gunman', true, now);
  assert.equal(r.fatAdd, 40); assert.equal(lb.tower.best, 31);
  // 회복: 한 시간에 6 (65 → 5시간 뒤 35 → 11시간 뒤 0) · 다 풀리면 기록이 지워진다
  const t0 = lb.tower.fat.bangjang.at;
  assert.equal(T.fatigueOf(lb, 'bangjang', t0 + 5 * H), 35);
  assert.equal(T.fatigueOf(lb, 'bangjang', t0 + 11 * H), 0);
  assert.equal(T.fatigueRestMs(100), Math.ceil((100 / 6) * H), '0 까지 약 17시간');
  const n = {};
  T.normTower({ tower: lb.tower }, n, t0 + 12 * H);
  assert.equal(n.tower.fat.bangjang, undefined, '다 풀린 기록은 버린다');
  const n2 = {}; T.normTower({ tower: lb.tower }, n2, t0 + 5 * H);
  assert.deepEqual(n2.tower.fat.bangjang, lb.tower.fat.bangjang, '아직 남은 피로는 그대로');
  // 100까지만 · 100이면 못 들어간다 (n시간 뒤 회복) · 조금 쉬면 다시
  lb.tower.fat.staff = { v: 100, at: now };
  const blocked = T.towerStart(lb, 1, 'staff', 'b1', now);
  assert.ok(blocked.error && blocked.error.includes('지쳐서 쉬어야 해요') && blocked.error.includes('뒤 회복'), blocked.error);
  assert.ok(T.fatigueOkMs(lb, 'staff', now) > 0);
  assert.ok(!T.towerStart(lb, 1, 'staff', 'b2', now + H).error, '한 시간 쉬면 94');
  lb.tower.fat.staff = { v: 95, at: now };
  T.towerStart(lb, 1, 'staff', 'b3', now);
  r = T.towerFinish(lb, { runId: 'b3', clear: true, durationSec: 100, kills: 10 }, 'u', now + 200e3);
  assert.equal(r.fat, 100, '100 넘게 안 쌓인다');
  // 무료(마스터) 모드: 안 쌓이고 · 안 막힌다
  lb.tower.fat.gunnyeo = { v: 100, at: now };
  const fs = T.towerStart(lb, 1, 'gunnyeo', 'm1', now, true);
  assert.ok(!fs.error, fs.error); assert.equal(fs.fat, 0);
  r = T.towerFinish(lb, { runId: 'm1', clear: true, durationSec: 100, kills: 10 }, 'u', now + 200e3, true);
  assert.equal(r.fatAdd, 0); assert.equal(T.fatigueOf(lb, 'gunnyeo', now), 100);
  delete lb.tower.fat.gunnyeo;
  play(1, 'gunnyeo', false, now, true);
  assert.equal(T.fatigueOf(lb, 'gunnyeo', now + 300e3), 0);
  // 이상한 값은 버린다
  const junk = lbOf({ tower: { fat: { bangjang: { v: 'x', at: now }, nobody: { v: 50, at: now }, gunman: { v: 999, at: Date.now() }, staff: 5 } } });
  assert.deepEqual(Object.keys(junk.tower.fat), ['gunman']);
  assert.equal(junk.tower.fat.gunman.v, 100);
});

test('탑 피로: 전투에서 공격력 · 입구 내구도 × (1 − 피로 × 0.004) — 탑에서만 · 피로 0이면 그대로', () => {
  const dmgOf = (g) => S.heroDamage(g, g.heroes[0]);
  const g0 = towerGame(10, 'gunman'), g0b = towerGame(10, 'gunman', { towerFat: 0 }), g50 = towerGame(10, 'gunman', { towerFat: 50 }), g100 = towerGame(10, 'gunman', { towerFat: 100 });
  assert.equal(dmgOf(g0b), dmgOf(g0)); assert.equal(g0b.base.max, g0.base.max, '피로 0 → 그대로');
  assert.ok(Math.abs(dmgOf(g50) / dmgOf(g0) - 0.8) < 1e-9, '피로 50 → −20%');
  assert.ok(Math.abs(dmgOf(g100) / dmgOf(g0) - 0.6) < 1e-9, '피로 100 → −40%');
  assert.ok(Math.abs(g100.base.max / g0.base.max - 0.6) < 0.01); assert.equal(g100.base.hp, g100.base.max);
  // 탑 밖에서는 피로가 없다
  const s0 = S.createGame({ H: 760, rng: seeded(1), heroes: ['gunman'], noWaves: true }), s1 = S.createGame({ H: 760, rng: seeded(1), heroes: ['gunman'], noWaves: true, towerFat: 100 });
  assert.equal(dmgOf(s1), dmgOf(s0)); assert.equal(s1.base.max, s0.base.max);
  // 화면이 넘기는 값 (tower-ui gameOpt 와 같은 이름)
  assert.equal(T.fatigueMul(100), 0.6); assert.equal(T.fatigueMul(0), 1);
});

test('탑 상점 피로 회복제: 염화석 · 고른 멤버 −50 · 하루 2개 · 피로 없는 멤버는 못 씀', () => {
  const now = Date.UTC(2026, 9, 1, 3, 0, 0);
  const lb = lbOf();
  const s = T.TOWER_SHOP.find((x) => x.id === 'potion');
  assert.ok(s && s.per === 'day' && s.n === 2 && s.amount === 50 && s.cost > 0);
  lb.tower.stone = 1000;
  lb.tower.fat.bangjang = { v: 80, at: now };
  assert.ok(T.shopBuy(lb, 'potion', now).error, '멤버를 골라야');
  assert.ok(T.shopBuy(lb, 'potion', now, 'gunman').error, '피로 없는 멤버');
  assert.ok(T.shopBuy(lb, 'potion', now, 'hanna').error, '없는 멤버');
  assert.equal(lb.tower.stone, 1000, '실패하면 염화석 그대로');
  let r = T.shopBuy(lb, 'potion', now, 'bangjang');
  assert.ok(!r.error, r.error);
  assert.equal(r.got.fat.v, 30); assert.equal(T.fatigueOf(lb, 'bangjang', now), 30); assert.equal(lb.tower.stone, 1000 - s.cost);
  r = T.shopBuy(lb, 'potion', now, 'bangjang');
  assert.equal(r.got.fat.v, 0); assert.equal(lb.tower.fat.bangjang, undefined, '0 아래로는 안 내려간다');
  lb.tower.fat.bangjang = { v: 80, at: now };
  assert.ok(T.shopBuy(lb, 'potion', now, 'bangjang').error.includes('오늘'), '하루 2개');
  lb.tower.fat.bangjang = { v: 80, at: now + 86400e3 };
  assert.ok(!T.shopBuy(lb, 'potion', now + 86400e3, 'bangjang').error, '다음 날 다시');
  lb.tower.stone = 0;
  assert.ok(T.shopBuy(lb, 'potion', now + 86400e3, 'bangjang').error, '염화석 부족');
});

test('탑 서버 피로: 끝나면 서버가 피로를 쌓고 · 100이면 시작을 막고 · 회복제는 멤버를 받는다', async () => {
  const lbPost = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());
  const { token, user } = await srv.accounts.signup({ username: 'tiredman', password: 'secret12', nickname: '피곤이' });
  const lbOfUser = async () => (await srv.accounts.store.byId(user.id)).stats.langbang;
  const st = (await srv.accounts.store.byId(user.id)).stats;
  st.langbang = Object.assign(st.langbang || {}, { stages: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 3])) });
  let r = await lbPost('/api/langbang/tower/start', token, { f: 1, hero: 'bangjang' });
  assert.equal(r.ok, true, r.message); assert.equal(r.fat, 0);
  (await lbOfUser()).tower.run.at -= 300e3;
  r = await lbPost('/api/langbang/tower/finish', token, { runId: r.runId, clear: false, durationSec: 60, kills: 5 });
  assert.equal(r.ok, true, r.message); assert.equal(r.fatAdd, 15); assert.equal(r.profile.tower.fat.bangjang.v, 15);
  (await lbOfUser()).tower.fat.bangjang = { v: 100, at: Date.now() };
  r = await lbPost('/api/langbang/tower/start', token, { f: 1, hero: 'bangjang' });
  assert.equal(r.ok, false); assert.ok(r.message.includes('지쳐서 쉬어야 해요'), r.message);
  (await lbOfUser()).tower.stone = 100;
  r = await lbPost('/api/langbang/tower/shop', token, { id: 'potion', hero: 'bangjang' });
  assert.equal(r.ok, true, r.message); assert.equal(r.profile.tower.fat.bangjang.v, 50);
  r = await lbPost('/api/langbang/tower/start', token, { f: 1, hero: 'bangjang' });
  assert.equal(r.ok, true, r.message); assert.equal(r.fat, 50);
});

test('피로 100을 찍으면 70 아래로 풀릴 때까지 못 들어간다', async () => {
  const TW = await import('../public/langbang/tower.js');
  const lb = { tower: TW.emptyTower() };
  const t0 = 1e12;
  TW.fatigueAdd(lb, 'bangjang', 100, t0);
  assert.equal(TW.fatigueLocked(lb, 'bangjang', t0), true);
  assert.equal(TW.fatigueLocked(lb, 'bangjang', t0 + 3600e3), true); // 94
  assert.equal(TW.fatigueLocked(lb, 'bangjang', t0 + 4.9 * 3600e3), true); // 약 71
  assert.equal(TW.fatigueLocked(lb, 'bangjang', t0 + 5.2 * 3600e3), false); // 69
  const lb2 = { tower: TW.emptyTower() };
  TW.fatigueAdd(lb2, 'bangjang', 90, t0);
  assert.equal(TW.fatigueLocked(lb2, 'bangjang', t0), false); // 100을 안 찍었으면 막지 않는다
});
