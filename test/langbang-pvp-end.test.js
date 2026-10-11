'use strict';
// 랑방 대전 1:1 대전 끝내기: 전투력 한도 · 진상 체력(두 덱 전투력) · 서든데스 타임라인 · 300초 판정 · 무승부
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lb = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);

function prof(deck, meta, star, r, lv, myth) {
  const p = { heroes: {}, hstars: {}, gear: [], equip: {} };
  let id = 1;
  for (const h of deck) {
    p.heroes[h] = meta; p.hstars[h] = star;
    const w = { id: id++, t: 'megaphone', r, lv }, a = { id: id++, t: 'belt', r, lv };
    p.gear.push(w, a); p.equip[h] = { w: w.id, a: a.id };
    if (myth) { const m = { id: id++, t: 'myth_card', r: 'myth', lv: 0 }; p.gear.push(m); p.equip[h].m = m.id; }
  }
  return p;
}
const STRONG = ['hochan', 'byunghwa', 'ara', 'junseo', 'hyungyeong'], WEAK = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'];

test('대전 전투력 한도: 강화 +10 · ★3 · 전설/신화 장비는 영웅 값 — 약한 사람은 그대로', async () => {
  const PV = await lb('pvp.js'), D = await lb('data.js'), S = await lb('sim.js');
  const lo = PV.pvpLoadout(prof(STRONG, 20, 5, 'legend', 10, true), STRONG);
  for (const id of STRONG) { assert.equal(lo.meta[id], 10); assert.equal(lo.stars[id], 3); }
  const epic = D.gearStats([{ t: 'megaphone', r: 'epic', lv: 10 }, { t: 'belt', r: 'epic', lv: 10 }]);
  const mythAtk = D.MYTH.myth_card.stats.atk * PV.PVP_MYTH_MUL;
  assert.ok(Math.abs(lo.gear.hochan.atk - (epic.atk + mythAtk)) < 1e-9, '전설 +10 → 영웅 +10 값 · 신화는 영웅 비율');
  const weakP = prof(WEAK, 3, 2, 'common', 2, false), wl = PV.pvpLoadout(weakP, WEAK);
  assert.equal(wl.meta.staff, 3); assert.equal(wl.stars.staff, 2);
  assert.deepEqual(wl.gear.staff, D.gearStats([{ t: 'megaphone', r: 'common', lv: 2 }, { t: 'belt', r: 'common', lv: 2 }]), '약한 장비는 그대로');
  // 강화 +20 · ★5 프로필의 전투력 = 강화 +10 · ★3 · 영웅 장비 프로필과 같다
  assert.equal(PV.pvpFirepower(lo), PV.pvpFirepower(PV.pvpLoadout(prof(STRONG, 10, 3, 'epic', 10, true), STRONG)));
  // 전투(sim)에서도: 대전이면 강화 · 성급이 잘리고, 다른 모드는 그대로
  const meta = Object.fromEntries(STRONG.map((id) => [id, 20])), stars = Object.fromEntries(STRONG.map((id) => [id, 5]));
  const gp = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 3 }, deck: STRONG, meta, stars, rng: () => 0.5 });
  for (const h of gp.heroes) { assert.equal(h.meta, 10); assert.equal(h.star, 3); }
  const gs = S.createGame({ H: 760, mode: 'stage', stage: 12, deck: STRONG, meta, stars, rng: () => 0.5 });
  for (const h of gs.heroes) { assert.equal(h.meta, D.softMeta(20, 12)); assert.equal(h.star, 5); } // 스테이지: 장별 권장 강화를 넘는 만큼은 절반 (대전 한도와는 따로)
  const ge = S.createGame({ H: 760, mode: 'endless', deck: STRONG, meta, stars, rng: () => 0.5 });
  for (const h of ge.heroes) { assert.equal(h.meta, 20); assert.equal(h.star, 5); }
  assert.equal(meta.hochan, 20, '프로필 자체는 안 바뀐다');
});

test('진상 체력: 두 덱 전투력으로 · 순서 상관없이 같은 값 · 웨이브마다 ×1.22 (복리)', async () => {
  const PV = await lb('pvp.js'), S = await lb('sim.js'), D = await lb('data.js');
  const fs = PV.pvpFirepower(PV.pvpLoadout(prof(STRONG, 20, 5, 'legend', 10, true), STRONG));
  const fw = PV.pvpFirepower(PV.pvpLoadout(prof(WEAK, 3, 1, 'common', 0, false), WEAK));
  assert.ok(fs > fw * 2);
  assert.equal(PV.pvpHpScale(fs, fw), PV.pvpHpScale(fw, fs), '두 사람 똑같이');
  assert.equal(PV.pvpHpScale(fs, fw), PV.pvpHpScale(fs, fw), '같은 덱 → 같은 값');
  assert.ok(PV.pvpHpScale(fs, fs) > PV.pvpHpScale(fs, fw) && PV.pvpHpScale(fs, fw) > PV.pvpHpScale(fw, fw), '센 덱끼리면 진상도 튼튼');
  // 같은 시드 · 같은 hp → 웨이브 n 의 진상 체력 배율 = 덱 배율(웨이브 5부터 전부) × 1.22^(n-1)
  const hpAt = (hp, n) => { const g = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 9, hp }, deck: WEAK, rng: () => 0.5 }); S.startWave(g, n); return g.hpScale * D.hpMul(g.diff, true); }; // 진상 체력 = hpMul(레벨) × hpScale
  const r = hpAt(2, 7) / hpAt(2, 6);
  assert.ok(Math.abs(r - 1.22) < 1e-9, `웨이브마다 ×1.22 (${r})`);
  assert.ok(Math.abs(hpAt(3, 6) / hpAt(1, 6) - 3) < 1e-9, '웨이브 5 뒤로는 덱 배율 그대로');
  assert.ok(Math.abs(hpAt(3, 1) / hpAt(1, 1) - 1) < 1e-9, '웨이브 1 은 대장 혼자라 덱 배율 없이');
});

test('끝내기 타임라인: 150초 서든데스 · 15초마다 +15% · 입구 피해 +20% · 회복 절반 · 210초(서든데스)부터 1% · 300초 멈춤 · 판정', async () => {
  const PV = await lb('pvp.js'), S = await lb('sim.js');
  assert.equal(PV.pvpStepN(149.9), 0); assert.equal(PV.pvpStepN(150), 1); assert.equal(PV.pvpStepN(165), 2); assert.equal(PV.pvpStepN(299), 10); assert.equal(PV.pvpStepN(400), 10);
  const g = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  g.god = false;
  const spd0 = g.mods.enemySpd, hp0 = g.mods.enemyHp;
  g.pvp.clock = 149; S.step(g, 1 / 60);
  assert.equal(g.pvp.n, 0);
  g.pvp.clock = 150; S.step(g, 1 / 60);
  assert.equal(g.pvp.n, 1); assert.equal(g.pvp.sudden, true);
  assert.ok(g.events.some((e) => e.type === 'sudden'));
  assert.ok(Math.abs(g.mods.enemySpd / spd0 - 1.15) < 1e-9 && Math.abs(g.mods.enemyHp / hp0 - 1.15) < 1e-9);
  g.pvp.clock = 196; S.step(g, 1 / 60); // 4단계
  assert.equal(g.pvp.n, 4);
  assert.ok(Math.abs(g.mods.enemyHp / hp0 - 1.6) < 1e-9, '쌓인다 (1 + 0.15 × 4)');
  assert.ok(Math.abs(g.pvp.doorMul - 1.8) < 1e-9, '입구 피해 +20% × 4');
  // 입구 피해 ×1.8
  const e = S.spawnEnemy(g, 'mukti', 100, 300);
  const b0 = g.base.hp; S.damageBase(g, 10, e); assert.ok(Math.abs(b0 - g.base.hp - 18) < 1e-9);
  // 회복 절반 (틱 사이 스킬 · 카드 회복)
  const b1 = g.base.hp; g.pvp.hpEnd = b1; g.base.hp += 20; S.step(g, 1 / 60);
  assert.ok(Math.abs(g.base.hp - (b1 + 10)) < 0.5, `회복 절반 (${g.base.hp - b1})`);
  // 210초(서든데스)부터 초당 1%
  g.base.hp = g.base.max; g.pvp.hpEnd = g.base.hp;
  g.pvp.clock = 210; S.step(g, 1 / 60);
  g.pvp.clock = 220; S.step(g, 1 / 60);
  assert.ok(Math.abs(g.base.hp - g.base.max * 0.9) < g.base.max * 0.01, `10초 → 10% (${g.base.hp}/${g.base.max})`);
  // 300초: 멈추고 판정 기다림
  g.pvp.clock = 300; S.step(g, 1 / 60);
  assert.equal(g.pvp.timeUp, true); assert.ok(g.events.some((x) => x.type === 'pvpTimeUp'));
  const t = g.t; S.step(g, 1); assert.equal(g.t, t, '시간 끝나면 더 진행 안 함');
  assert.ok(!g.over, '살아 있으면 판정으로');
  // 서든데스 뒤 보내기: 진상 8명 · 중간 보스 체력 ×1.5
  const g2 = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  S.pvpIncoming(g2, 'small'); assert.equal(g2.enemies.filter((x) => x.sent).length, 5);
  S.pvpIncoming(g2, 'big'); const mid0 = g2.enemies.find((x) => x.sent && x.mid);
  const g3 = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  g3.pvp.clock = 150; S.step(g3, 1 / 60);
  const before = g3.enemies.length; S.pvpIncoming(g3, 'small'); assert.equal(g3.enemies.length - before, 8, '서든데스 뒤 작은 보내기 8명');
  S.pvpIncoming(g3, 'big'); const mid1 = g3.enemies.find((x) => x.sent && x.mid);
  if (mid0 && mid1 && mid0.type === mid1.type) assert.ok(Math.abs(mid1.maxHp / mid0.maxHp - 1.5 * 1.15) < 1e-6, '중간 보스 ×1.5 (서든데스 1단계 +15% 포함)');
  // 판정: 입구 % → 처치 → 무승부
  assert.equal(PV.pvpJudge({ hp: 150, max: 300, kills: 1 }, { hp: 100, max: 300, kills: 99 }), 1);
  assert.equal(PV.pvpJudge({ hp: 100, max: 400, kills: 9 }, { hp: 100, max: 300, kills: 1 }), -1, '% 로 (최대가 달라도)');
  assert.equal(PV.pvpJudge({ hp: 100, max: 300, kills: 50 }, { hp: 100, max: 300, kills: 40 }), 1, '같으면 처치 수');
  assert.equal(PV.pvpJudge({ hp: 100, max: 300, kills: 40 }, { hp: 100, max: 300, kills: 40 }), 0, '무승부');
});

test('서버: 손님 전투력은 보낸 강화 · 장비를 대전 한도로 잘라서 · 로그인은 서버 기록으로', async () => {
  const { createLbPvp2 } = require('../server/langbang-pvp2');
  const PV = await lb('pvp.js');
  const k = createLbPvp2({ accounts: {}, normLb: (x) => x, eloDelta: () => 10, live: {} });
  await k.ready;
  const big = prof(STRONG, 20, 5, 'legend', 10, true);
  assert.equal(k.fpOf({ deck: STRONG, guestLo: big }), PV.pvpFirepower(PV.pvpLoadout(prof(STRONG, 10, 3, 'epic', 10, true), STRONG)), '손님: 한도로 잘린 값');
  assert.ok(k.fpOf({ deck: WEAK }) <= PV.pvpFirepower(PV.pvpLoadout({ heroes: Object.fromEntries(WEAK.map((id) => [id, 10])) }, WEAK)), '보낸 게 없으면 강화 0');
  const user = { uid: 'u1', deck: WEAK, lb: prof(WEAK, 3, 1, 'common', 0, false) };
  assert.equal(k.fpOf(user), PV.pvpFirepower(PV.pvpLoadout(user.lb, WEAK)), '로그인: 서버 기록으로');
  k.close();
});
test('1:1 대전: 지옥 각성 · 지옥 세트는 전투력 보정으로 빠진다', async () => {
  const S = await import(require('url').pathToFileURL(require('path').join(__dirname, '../public/langbang/sim.js')).href);
  const g = S.createGame({ mode: 'pvp', pvp: { seed: 3 }, heroes: ['gunman'], awake: { gunman: 3 }, gear: { gunman: { atk: 0.1, hellSet: 4 } }, noWaves: true });
  const h = g.heroes[0];
  assert.equal(h.awake | 0, 0);
  assert.equal(h.gear.hellSet | 0, 0);
  const g2 = S.createGame({ mode: 'stage', stage: 1, heroes: ['gunman'], awake: { gunman: 3 }, gear: { gunman: { atk: 0.1, hellSet: 4 } }, noWaves: true });
  assert.equal(g2.heroes[0].awake, 3); assert.equal(g2.heroes[0].gear.hellSet, 4);
});

test('1:1 대전 시드가 2^31 이상이어도 진상이 나온다 (화면이 seed | 0 → 음수 → stage 0 아래 → 웨이브 표 없음 → 멈춤)', async () => {
  const S = await lb('sim.js'), L = await lb('live.js'), D = await lb('data.js');
  for (const seed of [2 ** 31, 2 ** 32 - 13, 2 ** 32 - 16, 2 ** 32 - 1, 0xdeadbeef, -13, 7]) {
    for (let n = 1; n <= 10; n++) assert.ok(L.pvpWave(seed, n).g.length > 0, `시드 ${seed} 웨이브 ${n}`);
    assert.deepEqual(L.pvpWave(-13, 3), L.pvpWave(2 ** 32 - 13, 3), '음수로 온 시드도 같은 웨이브');
    const sd = Number(seed) >>> 0;
    const g = S.createGame({ H: 760, mode: 'stage', stage: 12 + (sd % 17), pvp: { seed, hp: 1 }, deck: ['bangjang', 'staff', null, null, null, null], leader: 'bangjang', meta: {}, join: true, unlocked: D.LOCKED_HEROES.slice(), rng: () => 0.5 });
    let seen = 0;
    for (let i = 0; i < 30 * 25; i++) { g.pvp.clock = i / 30; S.step(g, 1 / 30); g.events.length = 0; seen = Math.max(seen, g.enemies.length); }
    assert.ok(g.wave >= 1 && seen > 0, `시드 ${seed}: 웨이브 ${g.wave} · 진상 ${seen}`);
  }
});

