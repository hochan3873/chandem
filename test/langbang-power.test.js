'use strict';
// 랑방 전투력 한 잣대 (data.js heroPowerOf): 시뮬로 잰 기본 × 강화 × ★ × 장비(모든 능력치)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const lb = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);

test('전투력 기본: 모든 멤버에 값이 있고 · 등급이 오를수록 평균 기본이 높다 (등급 체급)', async () => {
  const D = await lb('data.js');
  const ids = Object.keys(D.HEROES).filter((id) => !D.HEROES[id].summon);
  for (const id of ids) assert.ok(D.POWER_BASE[id] > 0, `${id} 기본 전투력`);
  const avg = (t) => { const v = ids.filter((id) => D.heroTier(id) === t).map((id) => D.POWER_BASE[id]); return v.reduce((a, b) => a + b, 0) / v.length; };
  for (let t = 1; t < 5; t++) assert.ok(avg(t) < avg(t + 1), `T${t} 평균 < T${t + 1} 평균`);
  // 같은 등급 안에서는 공격 멤버가 서포터보다 조금 위 (주인 요청) — 평균으로
  const grp = (f) => { const v = ids.filter(f).map((id) => D.POWER_BASE[id] / avg(D.heroTier(id))); return v.reduce((a, b) => a + b, 0) / v.length; };
  const atk = grp((id) => ['aoe', 'single'].includes(D.heroRole(id))), sup = grp((id) => ['support', 'tank'].includes(D.heroRole(id)));
  assert.ok(atk > sup, `공격 멤버 ${atk.toFixed(2)} > 서포터 · 탱커 ${sup.toFixed(2)}`);
  assert.ok(sup > 0.75, '서포터도 쓸모없어 보이면 안 된다');
});

test('전투력: 강화 · ★ · 장비마다 오르고, 장비를 빼면 그만큼 내려간다 (모든 장비 능력치)', async () => {
  const D = await lb('data.js'), live = await lb('live.js');
  assert.equal(D.POWER_STAR, live.STAR_ATK, '★ 배율은 전투와 같다');
  const id = 'gunnyeo', p0 = D.heroPowerOf(id, 0, 1, {});
  assert.ok(D.heroPowerOf(id, 10, 1, {}) > p0 && D.heroPowerOf(id, 20, 1, {}) > D.heroPowerOf(id, 10, 1, {}), '강화');
  assert.ok(D.heroPowerOf(id, 0, 3, {}) > p0, '★');
  for (const t of Object.keys(D.GEAR)) {
    const g = D.GEAR[t], who = g.hero || id;
    const st = D.gearStats([{ t, r: g.myth ? 'myth' : 'epic', lv: 3 }]);
    const on = D.heroPowerOf(who, 5, 1, st), off = D.heroPowerOf(who, 5, 1, {});
    assert.ok(on > off, `${g.name} (${g.stat}) 끼면 오르고 빼면 내려간다: ${off} → ${on}`);
  }
});

test('전투력: 낮은 등급도 많이 키우면 갓 들어온 높은 등급을 넘을 수 있다 · 같은 강화면 등급 평균이 위', async () => {
  const D = await lb('data.js');
  const ids = Object.keys(D.HEROES).filter((id) => !D.HEROES[id].summon);
  const avgAt = (t, m) => { const v = ids.filter((id) => D.heroTier(id) === t).map((id) => D.heroPowerOf(id, m, 1, {})); return v.reduce((a, b) => a + b, 0) / v.length; };
  assert.ok(avgAt(1, 20) > avgAt(5, 0), 'T1 +20 > 전설 +0 (평균)');
  for (const m of [0, 10]) for (let t = 1; t < 5; t++) assert.ok(avgAt(t, m) < avgAt(t + 1, m), `+${m}: T${t} < T${t + 1}`);
});

test('전투력: 화면 · 1:1 대전 · 서버 AI 가 같은 식 (대전은 강화 +10 · ★3 한도 · 각성 없이)', async () => {
  const D = await lb('data.js'), PV = await lb('pvp.js');
  for (const id of ['bangjang', 'hochan', 'wonsik', 'jieun']) {
    assert.equal(PV.pvpHeroPower(id, 20, 5, { atk: 0.2, crit: 0.05 }), D.heroPowerOf(id, 10, 3, { atk: 0.2, crit: 0.05 }, { mile: false }));
  }
  const { createLbPvp } = require('../server/langbang-pvp');
  const k = createLbPvp({ accounts: {}, normLb: (x) => x, eloDelta: () => 10, live: {}, countdownMs: 10, botTickMs: 1000 });
  await k.simReady;
  assert.equal(Math.round(k.aiPower('ara', 7)), D.heroPowerOf('ara', 7, 1, null, { mile: false }));
});

test('장비 비교: 스킬 위주 멤버(방장)는 쿨타임 장비를 공격력 장비보다 높게 친다', async () => {
  const D = await lb('data.js');
  // 주인이 본 장면: 방장 모래시계 키링 +1 (쿨타임 −22.4%) vs 헬스장 리프팅 벨트 +2 (공격력 +10.5%)
  const cd = { cd: 0.224 }, atk = { atk: 0.105 };
  assert.ok(D.heroPowerOf('bangjang', 5, 1, cd) > D.heroPowerOf('bangjang', 5, 1, atk), '방장: 쿨타임 −22.4% > 공격력 +10.5%');
  assert.ok(D.heroPowerOf('gunman', 5, 1, { cd: 0.05 }) < D.heroPowerOf('gunman', 5, 1, { atk: 0.105 }), '건전남(평타 딜러): 공격력이 낫다');
});
