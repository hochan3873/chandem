'use strict';
// 도감 수집 보너스: 서버가 저장된 기록으로 계산 (화면 값 안 믿음) · 전투(sim)에 공격력 · 입구 · 경험치 · 1:1 대전은 빠짐 · 스테이지 코인
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let srv, base, L, S, D;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
  [L, S, D] = await Promise.all([lib('live.js'), lib('sim.js'), lib('data.js')]);
  await srv.accounts.ready;
});
test.after(async () => { await srv.close(); });

const post = (url, token, body) => fetch(base + '/api/langbang' + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }).then((x) => x.json());
const get = (url, token) => fetch(base + '/api/langbang' + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((x) => x.json());
let seq = 0;
async function user(fill) {
  const { token, user: u } = await srv.accounts.signup({ username: `cl${Date.now() % 1e6}${seq++}`, password: 'secret12', nickname: '수집' + seq });
  const st = (await srv.accounts.store.byId(u.id)).stats;
  if (fill) fill(st.langbang);
  await srv.accounts.store.saveStats(u.id, st);
  return { token, id: u.id };
}
const DEX_E = () => Object.keys(D.ENEMIES).filter((id) => !D.ENEMIES[id].dot && !D.ENEMIES[id].towerOnly);
const fillAll = (lb) => { lb.stages = Object.fromEntries(Object.values(D.HERO_UNLOCK).map((s) => [s, 1])); lb.owned =Object.fromEntries(D.LOCKED_HEROES.map((h) => [h, true])); lb.seen = DEX_E(); lb.gearDex = [...D.GEAR_IDS, ...D.MYTH_IDS]; };

test('수집 보너스: 단계 계산 · 전부 모으면 공격력 5% · 입구 6% · 경험치 6% · 코인 12%', () => {
  const none = L.collectBonus({});
  assert.equal(none.atk, 0); assert.equal(none.hp, 0); assert.equal(none.tabs.hero.n, Object.keys(D.HEROES).length - D.LOCKED_HEROES.length, '기본 멤버만');
  const full = {}; fillAll(full);
  const b = L.collectBonus(full);
  assert.deepEqual([b.atk, b.hp, b.exp, b.coin], [0.05, 0.06, 0.06, 0.12]);
  assert.equal(b.tabs.enemy.n, b.tabs.enemy.total); assert.equal(b.tabs.item.next, 0);
  const mid = L.collectBonus({ seen: DEX_E().slice(0, 31), gearDex: D.GEAR_IDS.slice(0, 9) });
  assert.equal(mid.hp, 0.02, '진상 31종 → 2단계'); assert.equal(mid.tabs.enemy.next, 45);
  assert.equal(mid.exp, 0.01); assert.equal(mid.coin, 0.02); assert.equal(mid.tabs.item.next, 10);
  // 전용 신화 · 없는 이름은 안 센다
  assert.equal(L.collectBonus({ gearDex: [...D.SIG_IDS, 'nope', 'x'] }).tabs.item.n, 0);
  // 전투에 넘기는 값은 상한으로 다시 자른다
  assert.deepEqual(L.collectMods({ atk: 9, hp: -1, exp: 0.03 }), { atk: 0.05, hp: 0, exp: 0.03 });
});

test('수집 보너스: 전투에 적용 (공격력 · 입구 · 경험치) · 1:1 대전은 빠짐 · 이어하기도 유지', () => {
  const coll = L.collectBonus((() => { const x = {}; fillAll(x); return x; })());
  const mk = (o) => S.createGame({ H: 760, mode: 'stage', stage: 5, deck: [null, null, 'gunman', null, null, null], rng: () => 0.5, ...o });
  const a = mk({}), b = mk({ coll });
  const ha = a.heroes[0], hb = b.heroes[0];
  assert.ok(Math.abs(S.heroDamage(b, hb) / S.heroDamage(a, ha) - 1.05) < 1e-9, '공격력 +5%');
  assert.equal(b.base.max, Math.round(a.base.max * 1.06), '입구 +6%');
  assert.ok(Math.abs(b.mods.expMul / a.mods.expMul - 1.06) < 1e-9, '경험치 +6%');
  // 1:1 대전: 빠짐
  const pa = mk({ pvp: { seed: 3, hp: 1 } }), pb = mk({ pvp: { seed: 3, hp: 1 }, coll });
  assert.equal(pb.coll, null); assert.equal(S.heroDamage(pb, pb.heroes[0]), S.heroDamage(pa, pa.heroes[0])); assert.equal(pb.base.max, pa.base.max);
  // 레이드 · 탑도 같은 길 (opt.coll) — 레이드 판
  const r = mk({ raid: { sec: 60 }, coll });
  assert.equal(r.collAtk, 0.05);
  // 이어하기 (snapshot → restore)
  const g2 = S.restoreGame(S.snapshot(b), { H: 760, rng: () => 0.5 });
  assert.equal(g2.collAtk, 0.05); assert.equal(g2.base.max, b.base.max);
});

test('수집 보너스: 서버가 저장된 기록으로 계산해 프로필에 · 스테이지 코인 보너스', async () => {
  const empty = await user(), full = await user(fillAll);
  const pe = (await get('/me', empty.token)).profile, pf = (await get('/me', full.token)).profile;
  assert.equal(pe.coll.atk, 0); assert.equal(pe.coll.coin, 0);
  assert.deepEqual([pf.coll.atk, pf.coll.hp, pf.coll.exp, pf.coll.coin], [0.05, 0.06, 0.06, 0.12]);
  assert.equal(pf.coll.tabs.hero.n, Object.keys(D.HEROES).length);
  // 같은 판 · 같은 별: 전부 모은 계정만 코인 +12% (화면이 보낸 coll 은 무시)
  const body = { mode: 'stage', stage: 1, stars: 3, score: 1000, kills: 50, durationSec: 120, heroesUsed: ['gunman'], coll: { coin: 5 } };
  const re = await post('/result', empty.token, body), rf = await post('/result', full.token, body);
  assert.ok(re.ok && rf.ok, re.message || rf.message);
  assert.equal(re.reward.coll, undefined);
  assert.equal(rf.reward.coll, Math.round(re.reward.total * 0.12));
  assert.equal(rf.reward.total, re.reward.total + rf.reward.coll);
});

test('수집 보너스: 레이드 피해 상한도 공격력만큼', () => {
  const lb = { maxStage: 30, heroes: {} }, lbF = { maxStage: 30, heroes: {} }; fillAll(lbF);
  assert.ok(Math.abs(L.raidCap(lbF, 150) / L.raidCap(lb, 150) - 1.05) < 0.001);
});
