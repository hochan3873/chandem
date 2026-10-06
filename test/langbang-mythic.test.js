'use strict';
// 랑방 대전 — 전용 신화(멤버마다 1개) · 도감 분류 테스트
//  1) 그 멤버만 낄 수 있다 (서버 · 손님 둘 다)  2) 드롭 확률 · 신화 조각 천장은 서버(live.js)가 굴린다
//  3) 새 효과는 전투(sim)에서 켜지고, 1:1 대전에서는 꺼진다  4) 역할 분류는 모든 멤버가 정확히 하나
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S, L, PV;
let srv, base;
test.before(async () => {
  D = await load('data.js'); S = await load('sim.js'); L = await load('live.js'); PV = await load('pvp.js');
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });

function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const sigGear = (h) => Object.assign(D.gearStats([{ t: 'sig_' + h, r: 'myth', lv: 0 }]), { sig: h });
const step = (g, sec) => { for (let t = 0; t < sec; t += 1 / 60) S.step(g, 1 / 60); };
const lbPost = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());

test('전용 신화: 모든 멤버(숨은 · 모집 · LEGEND 포함) 하나씩 · 신화 칸 · 서버 규칙과 같은 이름 · 능력치', () => {
  const R = require('../server/langbang-rules');
  const heroes = Object.keys(D.HEROES);
  assert.equal(D.SIG_IDS.length, heroes.length);
  for (const h of heroes) {
    const t = 'sig_' + h, g = D.GEAR[t];
    assert.ok(g && g.myth && g.slot === 'm' && g.hero === h, t);
    assert.ok(g.desc && g.fx && Object.keys(g.fx).length, t + ' 새 효과');
    assert.ok(!D.GEAR_IDS.includes(t) && !D.MYTH_IDS.includes(t), '일반 드롭 · 만능 신화 목록에는 없음');
    assert.deepEqual(R.GEAR[t].stats, g.stats, t + ' 서버 능력치'); assert.equal(R.GEAR[t].name, g.name); assert.equal(R.GEAR[t].hero, h);
    for (const k of Object.keys(g.stats)) assert.ok(D.GEAR_STATS[k], k);
    assert.ok(D.gearFits(t, h) && !D.gearFits(t, h === 'staff' ? 'gunman' : 'staff'), '그 멤버만');
  }
  assert.deepEqual(R.SIG_IDS, D.SIG_IDS);
  assert.ok(D.gearFits('megaphone', 'staff') && D.gearFits('myth_card', 'staff'), '보통 장비 · 만능 신화는 누구나');
  // 능력치는 적당히 (만능 신화 수준: 합 30% 이하)
  for (const t of D.SIG_IDS) assert.ok(Object.values(D.GEAR[t].stats).reduce((a, b) => a + b, 0) <= 0.4 + 1e-9, t);
});

test('도감 역할 분류: 모든 멤버가 정확히 한 분류 · 분류마다 3명 이상 · 진상은 일반/중간 보스/보스', () => {
  const heroes = Object.keys(D.HEROES);
  for (const h of heroes) assert.ok(D.HERO_ROLES[D.HERO_ROLE[h]], h + ' 분류');
  assert.deepEqual(Object.keys(D.HERO_ROLE).sort(), heroes.slice().sort(), '분류표에 없는 멤버 · 없는 id 없음');
  for (const k of Object.keys(D.HERO_ROLES)) assert.ok(heroes.filter((h) => D.heroRole(h) === k).length >= 3, k);
  assert.equal(D.enemyKind({ boss: true }), 'boss'); assert.equal(D.enemyKind({ mid: true }), 'mid'); assert.equal(D.enemyKind({}), 'normal');
  const kinds = new Set(Object.values(D.ENEMIES).map(D.enemyKind));
  assert.deepEqual([...kinds].sort(), ['boss', 'mid', 'normal']);
});

test('전용 신화 드롭: 장비 뽑기 0.1% · 모집 0.05% (서버 live.js 가 굴림) · 확률표 합 100%', () => {
  assert.ok(Math.abs(L.GEAR_GACHA_RATES.reduce((a, r) => a + r.w, 0) - 100) < 1e-9);
  assert.ok(Math.abs(L.GACHA_RATES.reduce((a, r) => a + r.w, 0) - 100) < 1e-9);
  assert.equal(L.GEAR_GACHA_RATES.find((r) => r.k === 'sig').w, 0.1);
  assert.equal(L.GACHA_RATES.find((r) => r.k === 'sigGear').w, 0.05);
  // 장비 뽑기 10만 번 → 0.1% 근처 (약 100번)
  const lb = L.normLive({}, { coins: 0, gear: [], gearSeq: 0, maxStage: 70, stages: {}, heroes: {}, owned: Object.fromEntries([...D.GACHA_HEROES, ...D.LEGEND_HEROES].map((h) => [h, true])) });
  lb.owned = Object.fromEntries([...D.GACHA_HEROES, ...D.LEGEND_HEROES].map((h) => [h, true]));
  let n = 0, pulls = 0;
  for (let i = 0; i < 10000; i++) { lb.stones = 999; lb.gear.length = 0; const r = L.gearGachaPull(lb, 10, 'u1', 0); pulls += 10; n += r.results.filter((x) => x.k === 'sigGear').length; }
  assert.equal(pulls, 100000);
  assert.ok(n >= 60 && n <= 150, `장비 뽑기 전용 신화 ${n}/100000`);
  // 모집 10만 번 → 0.05% 근처 (약 50번)
  let m = 0;
  for (let i = 0; i < 10000; i++) { lb.tickets = 99; lb.gear.length = 0; const r = L.gachaPull(lb, 10, 'ticket', 'u2', 0); m += r.results.filter((x) => x.k === 'sigGear').length; }
  assert.ok(m >= 25 && m <= 85, `모집 전용 신화 ${m}/100000`);
});

test('전용 신화: 뽑기마다 신화 조각 +1 · 600개면 고른 멤버 것 · 가진 멤버만 · 겹치면 조각 300', () => {
  const lb = L.normLive({}, { coins: 0, gear: [], gearSeq: 0, maxStage: 1, stages: {}, heroes: {} });
  assert.equal(lb.pity.sig, 0);
  lb.stones = 400; L.gearGachaPull(lb, 10, 'u', 0);
  assert.equal(lb.pity.sig, 10, '장비 뽑기 10회 = 조각 10');
  lb.tickets = 10; L.gachaPull(lb, 10, 'ticket', 'u', 0);
  assert.equal(lb.pity.sig, 20, '모집 10회 = 조각 10 더');
  assert.ok(L.sigExchange(lb, 'gunman', 'u').error, '조각 부족');
  lb.pity.sig = 600;
  assert.ok(L.sigExchange(lb, 'hochan', 'u').error, '합류 안 한 멤버는 못 고름');
  assert.ok(L.sigExchange(lb, 'nobody', 'u').error);
  const r = L.sigExchange(lb, 'gunman', 'u');
  assert.ok(!r.error, r.error);
  assert.equal(r.results[0].gear.t, 'sig_gunman'); assert.equal(r.results[0].gear.r, 'myth');
  assert.equal(lb.pity.sig, 0);
  lb.pity.sig = 600;
  assert.ok(L.sigExchange(lb, 'gunman', 'u').error, '이미 가진 건 또 못 바꿈');
  // 뽑기로 나왔는데 가진 멤버가 모두 이미 있으면 → 조각 300
  for (const h of Object.keys(D.SIG)) if (L.heroUnlocked(lb, h) && !L.sigOwned(lb, h)) L.addGear(lb, 'sig_' + h, 'myth'); // (처음 10회 모집으로 T4 한 명도 합류해 있다)
  const before = lb.pity.sig;
  const dup = L.grantSig(lb, () => 0.5);
  assert.ok(dup.dup && dup.sigShards === D.SIG_DUP_SHARDS && lb.pity.sig === before + D.SIG_DUP_SHARDS);
  // 가방이 꽉 차도 전용 신화는 들어간다 (코인으로 팔리지 않음)
  const lb2 = L.normLive({}, { coins: 0, gear: Array.from({ length: D.GEAR_BAG }, (_, i) => ({ id: i + 1, t: 'megaphone', r: 'common', lv: 0 })), gearSeq: D.GEAR_BAG, maxStage: 1, stages: {}, heroes: {} });
  const it = L.addGear(lb2, 'sig_staff', 'myth');
  assert.ok(it.id && !it.sold && lb2.gear.length === D.GEAR_BAG + 1);
});

test('서버: 전용 신화는 그 멤버만 장착 · 교환은 서버 조각으로만 (클라이언트 값 무시)', async () => {
  const { token, user } = await srv.accounts.signup({ username: 'sigman', password: 'secret12', nickname: '신화왕' });
  const raw = async () => (await srv.accounts.store.byId(user.id)).stats;
  let r = await lbPost('/api/langbang/sig/exchange', token, { hero: 'gunman', pity: { sig: 9999 } });
  assert.equal(r.ok, false, '조각 0개 → 거절 (보낸 값 무시)');
  const st = await raw();
  st.langbang = Object.assign(st.langbang || {}, { gear: [{ id: 1, t: 'sig_gunman', r: 'myth', lv: 0 }, { id: 2, t: 'myth_card', r: 'myth', lv: 0 }], gearSeq: 2, equip: { staff: { m: 1 } }, pity: { v: 2, sig: 600 } });
  r = await lbPost('/api/langbang/gear/equip', token, { hero: 'staff', slot: 'm', id: 1 });
  assert.equal(r.ok, false, '다른 멤버 전용은 거절');
  r = await lbPost('/api/langbang/gear/equip', token, { hero: 'gunman', slot: 'm', id: 1 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.equip.gunman.m, 1);
  assert.ok(!(r.profile.equip.staff || {}).m, '저장돼 있던 잘못된 장착(운영진)은 불러올 때 버린다');
  r = await lbPost('/api/langbang/gear/equip', token, { hero: 'staff', slot: 'm', id: 2 });
  assert.equal(r.ok, true, '만능 신화는 누구나');
  r = await lbPost('/api/langbang/sig/exchange', token, { hero: 'staff' });
  assert.equal(r.ok, true, r.message);
  assert.ok(r.results[0].gear.t === 'sig_staff' && r.profile.pity.sig === 0);
  assert.ok(r.profile.gear.some((g) => g.t === 'sig_staff'));
  // 장착 중인 신화(m 칸)는 일괄 판매 · 분해에서 빠진다
  r = await lbPost('/api/langbang/gear/dismantle', token, { ids: [1] });
  assert.equal(r.ok, false, '장착 중');
});

test('sim: 전용 신화 효과가 켜진다 — 건전남 두 발 · 김도훈 앵콜 두 번 · 윤정섭 둘 + 기절 2배 · 홍정민 입구 부활', () => {
  // 건전남: 한 번 쏠 때 새총알 2발
  const shots = (on) => {
    const g = S.createGame({ noWaves: true, heroes: ['gunman'], rng: seeded(3), gear: on ? { gunman: sigGear('gunman') } : {} });
    const h = g.heroes[0];
    S.spawnEnemy(g, 'thug', h.x, 300, { hpMul: 1000 }); S.spawnEnemy(g, 'thug', h.x + 60, 320, { hpMul: 1000 });
    S.fire(g, h, g.enemies[0]);
    return g.projs.filter((p) => !p.dead && (p.type === 'bullet' || p.type === 'pistol')).length; // (대개편: 권총)
  };
  assert.equal(shots(true), shots(false) + 1);
  // 김도훈: 무한 앵콜이 3초 뒤 한 번 더
  const g = S.createGame({ noWaves: true, heroes: ['dohoon'], rng: seeded(4), gear: { dohoon: sigGear('dohoon') } });
  const d = g.heroes[0]; assert.ok(d.sig && d.sig.echo === 3);
  d.skillCd = 0; assert.ok(S.castSkill(g, d));
  g.events.length = 0; step(g, 3.2);
  assert.ok(g.events.some((e) => e.type === 'skill' && e.echo && e.hero === 'dohoon'), '앵콜 한 번 더');
  // 윤정섭: 나갈 때 옆 줄 그림자 정섭 · 끝에서 기절 2배
  const stunOf = (on) => {
    const g2 = S.createGame({ noWaves: true, heroes: ['jeongseob'], rng: seeded(5), gear: on ? { jeongseob: sigGear('jeongseob') } : {} });
    const j = g2.heroes[0];
    const e = S.spawnEnemy(g2, 'thug', j.x, j.y - 200, { hpMul: 1000 }); e.speed = 0;
    let twins = 0, best = 0;
    for (let i = 0; i < 60 * 30; i++) { S.step(g2, 1 / 60); twins = Math.max(twins, (g2.twins || []).length); best = Math.max(best, e.stunT || 0); }
    return { twins, best };
  };
  const off = stunOf(false), on = stunOf(true);
  assert.equal(off.twins, 0); assert.equal(on.twins, 1, '옆 줄에 하나 더');
  assert.ok(on.best >= off.best * 1.9 && off.best > 0, `기절 ${off.best.toFixed(2)} → ${on.best.toFixed(2)}`);
  // 홍정민: 입구가 무너지면 한 판에 한 번 50%로
  const g3 = S.createGame({ noWaves: true, heroes: ['jungmin'], rng: seeded(6), gear: { jungmin: sigGear('jungmin') } });
  const foe = S.spawnEnemy(g3, 'thug', 180, g3.ropeY);
  S.damageBase(g3, g3.base.max * 5, foe);
  assert.ok(!g3.over && Math.abs(g3.base.hp - g3.base.max * 0.5) <= 1, '부활');
  S.damageBase(g3, g3.base.max * 5, foe);
  assert.ok(g3.over, '두 번째는 끝');
});

test('전용 신화: 모든 새 효과(fx)를 전투(sim.js)가 실제로 읽는다 — 바뀐 멤버 기술에 안 맞는 죽은 효과 없음', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, '..', 'public', 'langbang', 'sim.js'), 'utf8');
  for (const [h, m] of Object.entries(D.SIG)) for (const k of Object.keys(m.fx)) assert.ok(new RegExp(`sig\\.${k}\\b`).test(src), `${h} 전용 신화 효과 ${k} 를 sim.js 가 안 읽음`);
});

test('sim: 건전녀 전용 신화 — 간호가 더 자주 · 「힘내요!」 3명 / 송바울 — 정비 전에 3번 더', () => {
  const careRun = (on) => {
    const g = S.createGame({ mode: 'stage', stage: 5, deck: [null, 'staff', 'gunnyeo', 'gunman', 'eunok', null], rng: seeded(21), gear: on ? { gunnyeo: sigGear('gunnyeo') } : {} });
    g.phase = 'wave';
    for (const o of g.heroes) o.dmgDone = 10;
    let cheers = 0;
    for (let i = 0; i < 60 * 12; i++) { S.step(g, 1 / 60); g.phase = 'wave'; for (const e of g.events) if (e.type === 'care' && e.cheer) cheers++; g.events.length = 0; }
    return cheers;
  };
  const off = careRun(false), on = careRun(true);
  assert.ok(off > 0 && on >= off * 3, `힘내요 ${off} → ${on}`);
  const g = S.createGame({ noWaves: true, heroes: ['baul'], rng: seeded(22), gear: { baul: sigGear('baul') } });
  const b = g.heroes[0];
  assert.equal(b.sig.boardUses, 3);
});

test('sim: 1:1 대전에서는 전용 신화 새 효과가 꺼진다 (능력치만 영웅 비율로)', () => {
  const g = S.createGame({ pvp: { seed: 7, hp: 1 }, mode: 'stage', stage: 12, deck: [null, null, 'gunman', 'jeongseob', null, null], rng: seeded(7), gear: { gunman: sigGear('gunman'), jeongseob: sigGear('jeongseob') } });
  for (const h of g.heroes) assert.equal(h.sig, null, h.id);
  const g2 = S.createGame({ mode: 'stage', stage: 12, deck: [null, null, 'gunman', 'jeongseob', null, null], rng: seeded(7), gear: { gunman: sigGear('gunman'), jeongseob: sigGear('jeongseob') } });
  for (const h of g2.heroes) assert.ok(h.sig, h.id + ' 보통 판에선 켜짐');
  // 대전 장비 계산(서버 · 화면 같은 pvpLoadout): sig 표시가 없고, 다른 멤버 전용은 아예 안 들어감
  const prof = { heroes: {}, hstars: {}, gear: [{ id: 1, t: 'sig_gunman', r: 'myth', lv: 0 }, { id: 2, t: 'sig_gunman', r: 'myth', lv: 0 }], equip: { gunman: { m: 1 }, staff: { m: 2 } } };
  const lo = PV.pvpLoadout(prof, ['gunman', 'staff']);
  assert.ok(!('sig' in lo.gear.gunman) && lo.gear.gunman.atk > 0, '능력치만');
  assert.deepEqual(lo.gear.staff, {}, '다른 멤버 전용 장착은 무시');
  assert.ok(Math.abs(lo.gear.gunman.atk - D.SIG.gunman.stats.atk * PV.PVP_MYTH_MUL) < 1e-9, '영웅 비율');
});

test('sim: 25명 모두 전용 신화를 끼고 판을 돌려도 멈추지 않는다', () => {
  for (const id of Object.keys(D.HEROES)) {
    const g = S.createGame({ stage: 14, deck: [null, null, id, null, null, null], tempo: true, gear: { [id]: sigGear(id) }, rng: seeded(11), meta: { [id]: 10 }, unlocked: D.LOCKED_HEROES, god: true });
    for (let i = 0; i < 60 * 40 && !g.victory; i++) {
      S.step(g, 1 / 60); g.pendingLevels = 0;
      const h = g.heroes.find((x) => x.id === id);
      if (h && S.skillReady(h)) { const e = g.enemies.find((x) => !x.dead && x.y > 50); if (e) S.castSkill(g, h, e.x, e.y); }
      g.events.length = 0;
    }
    assert.ok(g.heroes.find((x) => x.id === id).sig, id);
  }
});
