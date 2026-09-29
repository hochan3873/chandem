'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');
const { eloDelta, tierOf } = require('../server/accounts');

let srv;
let base;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  const port = await srv.listen();
  base = `http://127.0.0.1:${port}`;
});
test.after(async () => { await srv.close(); });

const post = (url, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const get = (url, token) => fetch(base + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((r) => r.json());
function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (v) => { s.last = v; });
  s.call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(20); }
  throw new Error('시간 초과');
}

test('가입 · 로그인 · 내 정보, 중복 아이디와 틀린 비밀번호는 거절', async () => {
  const a = await post('/api/auth/signup', { username: 'chan', password: 'secret12', nickname: '찬' });
  assert.equal(a.ok, true, a.message);
  assert.ok(a.token);
  assert.equal(a.user.nickname, '찬');
  assert.equal(a.user.stats.omok.rating, 1000);
  assert.equal((await post('/api/auth/signup', { username: 'CHAN', password: 'xxxxxx', nickname: '가짜' })).ok, false);
  assert.equal((await post('/api/auth/signup', { username: 'a', password: 'secret12', nickname: 'x' })).ok, false);
  assert.equal((await post('/api/auth/login', { username: 'chan', password: 'wrong!!' })).ok, false);
  const l = await post('/api/auth/login', { username: 'chan', password: 'secret12' });
  assert.equal(l.ok, true);
  const me = await get('/api/auth/me', l.token);
  assert.equal(me.user.username, 'chan');
  assert.equal((await get('/api/auth/me', l.token + 'x')).ok, false);
  // 비밀번호는 암호화되어 저장된다
  const raw = await srv.accounts.store.byName('chan');
  assert.ok(raw.pass.startsWith('scrypt$') && !raw.pass.includes('secret12'));
});

test('로그인한 채로 방에 들어가면 계정 닉네임으로 참가하고, 홀덤 전적이 쌓인다', async () => {
  const { token } = await post('/api/auth/signup', { username: 'holdem1', password: 'secret12', nickname: '홀덤왕' });
  const a = client();
  const r = await a.call('room:practice', { name: '아무거나', bots: 2, auth: token });
  assert.equal(r.ok, true, r.message);
  await until(() => a.last && a.last.players.some((p) => p.id === r.playerId));
  const me = a.last.players.find((p) => p.id === r.playerId);
  assert.equal(me.name, '홀덤왕');
  assert.equal(me.member, true);
  const play = (v) => { const la = v.hand && v.hand.legal; if (la) a.emit('game:act', { type: la.canCheck ? 'check' : 'fold' }, () => {}); };
  a.on('state', play); play(a.last);
  await until(() => a.last.room.handNo >= 4, 20000);
  await wait(200);
  const u = (await get('/api/auth/me', token)).user;
  assert.ok(u.stats.holdem.hands >= 2, `판 수 ${u.stats.holdem.hands}`);
  await a.call('room:leave');
  a.close();
});

test('오목: AI 를 이기면 점수가 오르고 티어가 정해진다, 랭킹에 나온다', async () => {
  const { token, user } = await post('/api/auth/signup', { username: 'omok1', password: 'secret12', nickname: '오목신' });
  const a = client();
  let rating = null;
  a.on('rating', (list) => { rating = list; });
  const r = await a.call('room:practice', { name: 'x', auth: token, settings: { game: 'omok', aiLevel: 'normal' } });
  assert.equal(r.ok, true, r.message);
  await until(() => a.last && a.last.hand && a.last.hand.omok);
  // 내가 기권 → 짐
  await until(() => a.last.hand.legal || a.last.hand.toActId, 5000);
  const rr = await a.call('game:act', { type: 'resign' });
  assert.equal(rr.ok, true, rr.message);
  await until(() => rating, 5000);
  assert.equal(rating[0].id, r.playerId);
  assert.ok(rating[0].delta < 0, `진 판은 점수가 내려감 (${rating[0].delta})`);
  const u = (await get('/api/auth/me', token)).user;
  assert.equal(u.stats.omok.games, 1);
  assert.equal(u.stats.omok.losses, 1);
  assert.equal(u.tier.name, tierOf(u.stats.omok.rating).name);
  const rank = await get('/api/auth/ranking/omok');
  assert.ok(rank.ranking.some((x) => x.username === user.username));
  await a.call('room:leave');
  a.close();
});

test('Elo: 강한 상대를 이기면 많이, 약한 상대를 이기면 조금 오른다', () => {
  assert.ok(eloDelta(1000, 1400, 1, 20) > eloDelta(1000, 800, 1, 20));
  assert.ok(eloDelta(1000, 1000, 0, 20) < 0);
  assert.equal(tierOf(1000).name, '브론즈');
  assert.equal(tierOf(1850).name, '그랜드마스터');
});

test('비로그인(손님)도 그대로 게임할 수 있다', async () => {
  const a = client();
  const r = await a.call('room:create', { name: '손님', settings: {} });
  assert.equal(r.ok, true);
  await until(() => a.last);
  assert.equal(a.last.players[0].member, false);
  a.close();
});

// ─── 랑방 대전 (스테이지) ───────────────────────────────
const R = require('../server/langbang-rules');
const lbPost = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());
async function lbUser(username, nickname) {
  const { token, user } = await srv.accounts.signup({ username, password: 'secret12', nickname }); // (HTTP 가입은 IP당 1분 8번 제한)
  const id = user.id;
  const raw = async () => (await srv.accounts.store.byId(id)).stats; // FileStore(메모리) — 테스트에서 직접 고쳐 쓴다
  const noLimit = async () => { const st = await raw(); if (st.langbang) st.langbang.lastResultAt = 0; }; // 10초 저장 제한 풀기
  return { token, id, raw, noLimit };
}
const clear = (stage, stars, extra = {}) => ({ mode: 'stage', stage, stars, score: 12000, kills: 90, durationSec: 150, ...extra });

test('랑방 대전: 스테이지 보상은 서버가 계산 (클라이언트 코인 무시), 잠긴 스테이지·말 안 되는 기록 거절', async () => {
  const u = await lbUser('lbking', '랑방왕');
  const guest = await get('/api/langbang/me');
  assert.equal(guest.ok, false, '손님은 서버 저장 없음');
  const me0 = await get('/api/langbang/me', u.token);
  assert.equal(me0.profile.coins, 0);
  assert.equal(me0.profile.maxStage, 0);
  assert.equal(me0.profile.maxMeta, 20);
  assert.deepEqual(me0.profile.unlocked, []);
  assert.equal(me0.profile.endlessUnlocked, false);

  // 잠긴 스테이지 (1-1 도 안 깼는데 1-3)
  let r = await lbPost('/api/langbang/result', u.token, clear(3, 3));
  assert.equal(r.ok, false);
  assert.match(r.message, /열리지 않은/);
  // 말 안 되는 값
  for (const bad of [clear(1, 4), clear(1, 0), clear(31, 3), clear(1, 3, { durationSec: 20 }), clear(1, 3, { score: 9e8 })]) {
    const x = await lbPost('/api/langbang/result', u.token, bad);
    assert.equal(x.ok, false, JSON.stringify(bad));
  }
  // 1-1 ★★ 첫 클리어 — 클라이언트가 보낸 coins 는 무시
  r = await lbPost('/api/langbang/result', u.token, clear(1, 2, { coins: 999999 }));
  assert.equal(r.ok, true, r.message);
  const want = R.stageReward(1, 2, 0, 0);
  assert.deepEqual({ total: r.reward.total, first: r.reward.first, star: r.reward.star }, { total: want.total, first: want.first, star: want.star });
  assert.equal(r.reward.firstClear, true);
  assert.equal(r.profile.coins, want.total);
  assert.equal(r.profile.maxStage, 1);
  assert.equal(r.profile.stages[1], 2);
  assert.equal(r.rank, 1);
  // 바로 또 저장 → 속도 제한
  const fast = await lbPost('/api/langbang/result', u.token, clear(1, 3));
  assert.equal(fast.ok, false);
  assert.match(fast.message, /자주/);
  // 같은 스테이지 ★★★ 로 다시: 첫 보너스 없음, 새 별 1개 보너스
  await u.noLimit();
  r = await lbPost('/api/langbang/result', u.token, clear(1, 3));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.reward.first, 0);
  assert.equal(r.reward.newStars, 1);
  assert.equal(r.reward.total, R.stageReward(1, 3, 2, 0).total);
  assert.equal(r.profile.coins, want.total + R.stageReward(1, 3, 2, 0).total);
  assert.equal(r.profile.totalStars, 3);
  // 이제 1-2 는 열림, 1-3 은 아직
  await u.noLimit();
  assert.equal((await lbPost('/api/langbang/result', u.token, clear(2, 1))).ok, true);
  await u.noLimit();
  assert.equal((await lbPost('/api/langbang/result', u.token, clear(4, 1))).ok, false);
});

test('랑방 대전: 영웅 강화(최대 20) · 아이템 구입은 서버가 비용 확인, 잠긴 멤버는 강화 불가', async () => {
  const u = await lbUser('lbshop', '상점왕');
  const st = await u.raw();
  st.langbang = { ...(st.langbang || {}), coins: 5000 };
  let r = await lbPost('/api/langbang/upgrade', u.token, { hero: 'gunman' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.heroes.gunman, 1);
  assert.equal(r.profile.coins, 5000 - R.metaCost(0));
  assert.equal(r.profile.costs.gunman, R.metaCost(1));
  // 잠긴 히든 · 없는 영웅
  assert.equal((await lbPost('/api/langbang/upgrade', u.token, { hero: 'sunggu' })).ok, false);
  assert.equal((await lbPost('/api/langbang/upgrade', u.token, { hero: 'myunghoon' })).ok, false);
  assert.equal((await lbPost('/api/langbang/upgrade', u.token, { hero: 'nobody' })).ok, false);
  // 아이템
  const c0 = r.profile.coins;
  r = await lbPost('/api/langbang/buy', u.token, { item: 'door' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.items.door, 1);
  assert.equal(r.profile.coins, c0 - R.itemCost('door', 0));
  assert.equal(r.profile.itemCosts.door, R.itemCost('door', 1));
  assert.equal((await lbPost('/api/langbang/buy', u.token, { item: 'gold' })).ok, false, '없는 아이템');
  // 코인 부족
  const poor = await lbPost('/api/langbang/buy', u.token, { item: 'drink' });
  (await u.raw()).langbang.coins = 100;
  r = await lbPost('/api/langbang/buy', u.token, { item: 'drink' });
  assert.equal(r.ok, false);
  assert.match(r.message, /부족/);
  assert.equal(poor.profile.items.drink, 1);
  // 최대 레벨
  (await u.raw()).langbang.items.charm = 10;
  (await u.raw()).langbang.coins = 1e6;
  assert.match((await lbPost('/api/langbang/buy', u.token, { item: 'charm' })).message, /최대/);
  (await u.raw()).langbang.heroes.staff = 20;
  assert.match((await lbPost('/api/langbang/upgrade', u.token, { hero: 'staff' })).message, /최대/);
  // 1-10 을 깨면 최은옥 합류 → 강화 가능
  const s = (await u.raw()).langbang;
  s.stages = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, 3]));
  await u.noLimit();
  r = await lbPost('/api/langbang/result', u.token, clear(10, 3));
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.unlockedHeroes, ['eunok']);
  assert.equal(r.endlessUnlocked, true);
  assert.ok(r.profile.unlocked.includes('eunok'));
  assert.equal((await lbPost('/api/langbang/upgrade', u.token, { hero: 'eunok' })).ok, true);
});

test('랑방 대전: 무한 도전은 1-10 뒤에 열리고, 코인은 도달 웨이브로 서버가 계산', async () => {
  const u = await lbUser('lbinf', '무한왕');
  const body = { mode: 'endless', wave: 12, score: 40000, kills: 500, durationSec: 600, coins: 99999 };
  let r = await lbPost('/api/langbang/result', u.token, body);
  assert.equal(r.ok, false);
  assert.match(r.message, /1-10/);
  (await u.raw()).langbang = { stages: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i + 1, 1])) };
  r = await lbPost('/api/langbang/result', u.token, body);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.reward.total, R.endlessReward(12, 0));
  assert.equal(r.profile.coins, R.endlessReward(12, 0));
  assert.equal(r.profile.bestWave, 12);
  assert.equal(r.newBestWave, true);
  await u.noLimit();
  assert.equal((await lbPost('/api/langbang/result', u.token, { ...body, wave: 30, durationSec: 100 })).ok, false, '너무 빠른 무한 도전');
});

test('랑방 대전 랭킹: 스테이지(최고 스테이지 → 별 → 먼저 도달) · 무한 도전(웨이브 → 점수), 내 순위', async () => {
  const mk = async (name, lb) => { const u = await lbUser(name, name.toUpperCase()); (await u.raw()).langbang = lb; return u; };
  const t = Date.now();
  const st = (n, s) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, s]));
  const a = await mk('rka', { stages: st(20, 2), stageAt: t - 5000, bestWave: 5, bestScore: 100 });
  const b = await mk('rkb', { stages: st(20, 3), stageAt: t, bestWave: 30, bestScore: 10 });
  const c = await mk('rkc', { stages: st(20, 2), stageAt: t - 9000, bestWave: 30, bestScore: 900 });
  const d = await mk('rkd', { stages: st(25, 1), stageAt: t + 1000 });
  // maxStage / totalStars 는 저장할 때 계산된다 — 저장된 적 없는 옛 프로필도 정렬되게 한 번씩 저장
  for (const u of [a, b, c, d]) {
    const s = (await u.raw()).langbang;
    s.maxStage = Object.keys(s.stages).length; s.totalStars = Object.values(s.stages).reduce((x, y) => x + y, 0);
  }
  const rk = await get('/api/langbang/ranking?mode=stage', b.token);
  const order = rk.ranking.filter((x) => x.username.startsWith('rk')).map((x) => x.username);
  assert.deepEqual(order, ['rkd', 'rkb', 'rkc', 'rka'], '스테이지 → 별 → 먼저 도달');
  const top = rk.ranking.find((x) => x.username === 'rkd');
  assert.equal(top.stageLabel, '3-5');
  assert.ok(rk.me && rk.me.username === 'rkb');
  assert.equal(rk.me.rank, rk.ranking.findIndex((x) => x.username === 'rkb') + 1);
  const ek = await get('/api/langbang/ranking?mode=endless', a.token);
  const eorder = ek.ranking.filter((x) => x.username.startsWith('rk')).map((x) => x.username);
  assert.deepEqual(eorder, ['rkc', 'rkb', 'rka'], '웨이브 → 점수 (기록 없는 사람은 제외)');
  assert.equal(ek.me.rank, ek.ranking.findIndex((x) => x.username === 'rka') + 1);
  const anon = await get('/api/langbang/ranking');
  assert.equal(anon.me, null);
});

test('랑방 대전: 예전 프로필(코인·강화·최고 웨이브)은 그대로 이어지고 무한 도전 기록이 된다', async () => {
  const u = await lbUser('lbold', '고인물');
  (await u.raw()).langbang = { level: 4, exp: 20, coins: 3210, runs: 9, victories: 1, kills: 800, bestWave: 22, bestScore: 88000, heroes: { bangjang: 6, gunman: 10, hanna: 3 }, lastResultAt: 0 };
  const me = await get('/api/langbang/me', u.token);
  assert.equal(me.ok, true);
  const p = me.profile;
  assert.equal(p.coins, 3210);
  assert.equal(p.heroes.gunman, 10);
  assert.equal(p.heroes.hanna, 3);
  assert.equal(p.heroes.myunghoon, 0);
  assert.equal(p.bestWave, 22);
  assert.equal(p.bestScore, 88000);
  assert.equal(p.maxStage, 0);
  assert.equal(p.endlessUnlocked, true, '예전 기록이 있으면 무한 도전 바로 가능');
  assert.ok(p.unlocked.includes('hanna'), '예전에 강화한 히든은 계속 쓸 수 있다');
  assert.equal(p.costs.gunman, R.metaCost(10), '최대 20까지 계속 강화');
  const ek = await get('/api/langbang/ranking?mode=endless');
  assert.ok(ek.ranking.some((x) => x.username === 'lbold' && x.bestWave === 22));
  const r = await lbPost('/api/langbang/result', u.token, clear(1, 3, { seen: ['yeokko', 'gao', 'hacker', 'yeokko'] }));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.coins, 3210 + R.stageReward(1, 3, 0, 0).total);
  assert.equal(r.profile.bestWave, 22);
  assert.deepEqual(r.profile.seen.sort(), ['gao', 'yeokko'], '도감: 있는 진상 이름만 저장');
  assert.ok(r.profile.unlocked.includes('hanna'));
  assert.equal(r.profile.heroes.dohoon, 0);
});

test('랑방 대전 PgStore: jsonb 안의 기록으로 정렬 · 내 순위는 COUNT 한 번 (가짜 DB 로 쿼리 확인)', async () => {
  const { createAccounts } = require('../server/accounts');
  const acc = createAccounts({ databaseUrl: 'postgres://u:p@127.0.0.1:1/none', secret: 'x' });
  await acc.ready;
  const st = acc.store;
  await st.pool.end().catch(() => {});
  const seen = [];
  const row = { id: 'me', username: 'me', pass: 'x', nickname: '나', created_at: '1', stats: { langbang: { stages: { 1: 3, 2: 2, 3: 1 }, stageAt: 123, bestWave: 9, bestScore: 777 } } };
  st.pool = { query: async (sql, params) => { seen.push({ sql, params }); if (/COUNT/.test(sql)) return { rows: [{ n: 2 }] }; return { rows: [row] }; } };
  const top = await st.topLangbang(10, 'stage');
  assert.equal(top[0].id, 'me');
  assert.match(seen[0].sql, /ORDER BY COALESCE\(\(stats->'langbang'->>'maxStage'\)::int, 0\) DESC, COALESCE\(\(stats->'langbang'->>'totalStars'\)::int, 0\) DESC, COALESCE\(\(stats->'langbang'->>'stageAt'\)::bigint, 0\) ASC LIMIT \$1/);
  assert.deepEqual(seen[0].params, [10]);
  await st.topLangbang(5, 'endless');
  assert.match(seen[1].sql, /bestWave'\)::int, 0\) > 0 ORDER BY .*bestWave.* DESC, .*bestScore.* DESC LIMIT \$1/);
  const rank = await st.rankLangbang('stage', 'me');
  assert.equal(rank, 3, '앞선 2명 + 1');
  assert.deepEqual(seen[seen.length - 1].params, [3, 6, 123], '최고 스테이지·총 별·도달 시각 (옛 프로필도 stages 에서 계산)');
  assert.equal(await st.rankLangbang('endless', 'me'), 3);
  assert.deepEqual(seen[seen.length - 1].params, [9, 777]);
});

test('랑방 대전 장비: 드롭은 서버가 계산 · 장착/강화/팔기 확인 · 퍼펙트는 ★★★일 때만 · 덱 7번째 칸은 6번째 먼저', async () => {
  const R = require('../server/langbang-rules');
  const u = await lbUser('lbgear', '장비왕');
  let r = await lbPost('/api/langbang/result', u.token, clear(1, 2, { perfect: true, gear: [{ t: 'megaphone', r: 'legend', lv: 10 }] }));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.reward.perfect, 0, '★★ 는 퍼펙트 아님');
  assert.ok(r.reward.drops.length >= 1);
  assert.ok(!r.profile.gear.some((g) => g.lv === 10), '클라이언트가 보낸 장비는 무시');
  await u.noLimit();
  r = await lbPost('/api/langbang/result', u.token, clear(1, 3, { perfect: true }));
  assert.equal(r.ok, true, r.message);
  assert.ok(r.reward.perfect > 0 && r.reward.firstPerfect, '첫 퍼펙트');
  assert.notEqual(r.reward.drops[0].r, 'common', '첫 퍼펙트는 희귀 이상');
  assert.equal(r.profile.perfects[1], true);
  const it0 = r.profile.gear[0];
  const gid = it0.id;
  const slot = R.GEAR[it0.t].slot;
  const wrong = slot === 'w' ? 'a' : 'w';
  assert.equal((await lbPost('/api/langbang/gear/equip', u.token, { hero: 'staff', slot: wrong, id: gid })).ok, false, '맞지 않는 칸');
  assert.equal((await lbPost('/api/langbang/gear/equip', u.token, { hero: 'sunggu', slot, id: gid })).ok, false, '잠긴 멤버');
  r = await lbPost('/api/langbang/gear/equip', u.token, { hero: 'staff', slot, id: gid });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.equip.staff[slot], gid);
  r = await lbPost('/api/langbang/gear/equip', u.token, { hero: 'gunman', slot, id: gid });
  assert.ok(!(r.profile.equip.staff || {})[slot] && r.profile.equip.gunman[slot] === gid, '한 장비는 한 명만');
  (await u.raw()).langbang.coins = 100000;
  r = await lbPost('/api/langbang/gear/enhance', u.token, { id: gid });
  assert.equal(r.ok, true, r.message);
  const itE = r.profile.gear.find((g) => g.id === gid);
  assert.equal(itE.lv, 1);
  assert.equal(r.profile.coins, 100000 - R.gearEnhanceCost(itE.r, 0));
  r = await lbPost('/api/langbang/gear/sell', u.token, { id: gid });
  assert.equal(r.ok, true, r.message);
  assert.ok(!r.profile.gear.some((g) => g.id === gid) && !(r.profile.equip.gunman || {})[slot], '팔면 장착도 풀림');
  assert.equal((await lbPost('/api/langbang/gear/sell', u.token, { id: 99999 })).ok, false);
  (await u.raw()).langbang.coins = 200000;
  assert.match((await lbPost('/api/langbang/buy', u.token, { item: 'slot6' })).message, /앞 칸/);
  assert.equal((await lbPost('/api/langbang/buy', u.token, { item: 'slot5' })).profile.deckSlots, 5);
  assert.equal((await lbPost('/api/langbang/buy', u.token, { item: 'slot6' })).profile.deckSlots, 6);
  (await u.raw()).langbang.gear.push({ id: 5000, t: 'nuke', r: 'legend', lv: 99 });
  const me = await get('/api/langbang/me', u.token);
  assert.ok(!me.profile.gear.some((g) => g.t === 'nuke'), '이상한 장비는 버린다');
});

test('랑방 대전 모집 · 미션 · 시즌 · 성급 · 출석 · 상자 · 주간 도전: 서버가 계산하고 확인', async () => {
  const u = await lbUser('lblive', '라이브');
  const st = await u.raw();
  st.langbang = st.langbang || {};
  Object.assign(st.langbang, { coins: 100000, stages: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3])) });
  let r = await lbPost('/api/langbang/gacha', u.token, { n: 10, pay: 'coin' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.results.length, 10);
  assert.equal(r.profile.coins, 100000 - 2700);
  assert.equal(r.profile.pulls, 10);
  assert.equal((await lbPost('/api/langbang/gacha', u.token, { n: 10, pay: 'ticket' })).ok, false, '모집권 없음');
  const me = (await get('/api/langbang/me', u.token)).profile;
  assert.equal(me.daily.ids.length, 4);
  const pulls = me.daily.ids.includes('gacha1');
  r = await lbPost('/api/langbang/mission/claim', u.token, { kind: 'daily', id: pulls ? 'gacha1' : me.daily.ids[0] });
  assert.equal(r.ok, pulls, r.message);
  assert.equal((await lbPost('/api/langbang/mission/claim', u.token, { kind: 'ach', id: 'ch1' })).ok, true, '1장 클리어 업적');
  assert.equal((await lbPost('/api/langbang/mission/claim', u.token, { kind: 'ach', id: 'ch1' })).ok, false, '두 번은 안 됨');
  assert.equal((await lbPost('/api/langbang/mission/claim', u.token, { kind: 'ach', id: 'ch3' })).ok, false, '아직');
  assert.equal((await lbPost('/api/langbang/season/claim', u.token, { tier: 1 })).ok, false);
  (await u.raw()).langbang.season.sp = 250;
  r = await lbPost('/api/langbang/season/claim', u.token, { tier: 'all' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.got.length, 2);
  assert.equal((await lbPost('/api/langbang/hero/star', u.token, { hero: 'staff' })).ok, false);
  (await u.raw()).langbang.shards = { staff: 20 };
  r = await lbPost('/api/langbang/hero/star', u.token, { hero: 'staff' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.hstars.staff, 2);
  assert.equal((await lbPost('/api/langbang/checkin', u.token, {})).ok, true);
  assert.equal((await lbPost('/api/langbang/checkin', u.token, {})).ok, false);
  assert.equal((await lbPost('/api/langbang/chest/claim', u.token, { ch: 1, n: 30 })).ok, true, '1장 ★30');
  assert.equal((await lbPost('/api/langbang/chest/claim', u.token, { ch: 2, n: 10 })).ok, false);
  await u.noLimit();
  const wres = { mode: 'weekly', wave: 3, kills: 60, bossKills: 1, skills: 5, durationSec: 100, hpPct: 0, victory: false };
  assert.equal((await lbPost('/api/langbang/result', u.token, { ...wres, runId: 'x' })).ok, false, '판 번호 필요');
  const s0 = await lbPost('/api/langbang/weekly/start', u.token, {});
  assert.equal(s0.ok, true, s0.message);
  (await u.raw()).langbang.weeklyRun.at = Date.now() - 200 * 1000; // 200초 전에 시작한 셈
  r = await lbPost('/api/langbang/result', u.token, { ...wres, runId: s0.runId });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.weekly.score, 3 * 1000 + 60 * 10 + 500, '점수는 서버가 계산');
  assert.equal(r.profile.weekly.best, r.weekly.score);
  assert.equal(r.rank, 1);
  await u.noLimit();
  assert.equal((await lbPost('/api/langbang/result', u.token, { ...wres, runId: s0.runId })).ok, false, '같은 판 두 번 저장 안 됨');
  const s1 = await lbPost('/api/langbang/weekly/start', u.token, {});
  await u.noLimit();
  assert.equal((await lbPost('/api/langbang/result', u.token, { ...wres, durationSec: 400, wave: 5, runId: s1.runId })).ok, false, '시간이 안 맞음');
  const board = await get('/api/langbang/weekly', u.token);
  assert.equal(board.ok, true);
  assert.equal(board.board[0].nickname, '라이브');
  assert.equal(board.me.rank, 1);
  const L = await import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  (await u.raw()).langbang.weekly.wi = L.weekIndex() - 1;
  r = await lbPost('/api/langbang/weekly/claim', u.token, {});
  assert.equal(r.ok, true, r.message);
  assert.equal(r.rank, 1);
  assert.ok(r.profile.titles.includes('wchamp'), '1위 칭호');
  assert.equal((await lbPost('/api/langbang/weekly/claim', u.token, {})).ok, false, '두 번은 안 됨');
});

test('랑방 대전 헬 모드: 일반 ★★★ 가 있어야 · 보상 ×3 · 헬 별은 따로 · 새 장비 세트는 그 챕터부터', async () => {
  const R = require('../server/langbang-rules');
  const u = await lbUser('lbhell', '헬러');
  Object.assign((await u.raw()).langbang || ((await u.raw()).langbang = {}), { stages: { 1: 3, 2: 2 } });
  let r = await lbPost('/api/langbang/result', u.token, clear(2, 3, { hell: true }));
  assert.equal(r.ok, false, '2-2 는 ★★ 라 헬 안 열림');
  assert.match(r.message, /헬/);
  r = await lbPost('/api/langbang/result', u.token, clear(1, 2, { hell: true }));
  assert.equal(r.ok, true, r.message);
  assert.equal(r.reward.hell, true);
  assert.equal(r.reward.total, R.hellReward(1, 2, 0, 0).total);
  assert.equal(r.profile.hell[1], 2, '헬 별 따로');
  assert.equal(r.profile.stages[1], 3, '일반 별은 그대로');
  assert.ok(r.reward.drops.every((d) => d.r !== 'common'), '희귀 이상');
  // 새 장비 세트: 1장에선 안 떨어진다
  for (let sd = 0; sd < 200; sd++) for (const d of R.rollDrops(sd, 5, 3, true, false)) assert.ok(!R.GEAR[d.t].ch, '1장에서 4장 장비 없음');
  let seen = false;
  for (let sd = 0; sd < 400 && !seen; sd++) for (const d of R.rollDrops(sd, 45, 3, true, false)) if (R.GEAR[d.t].ch === 5) seen = true;
  assert.ok(seen, '5장에선 5장 장비');
  // 예전 덱 칸 → 새 칸
  (await u.raw()).langbang.items = { slot6: 1, slot7: 1 };
  const me = await get('/api/langbang/me', u.token);
  assert.equal(me.profile.deckSlots, 6, '옛 7칸 → 새 6칸');
});

test('랑방 대전 덱 서버 저장: 이상한 값은 정리', async () => {
  const u = await lbUser('lbdeck', '덱장');
  const r = await lbPost('/api/langbang/decks', u.token, { i: 1, decks: [['staff', 'gunman', 'staff', 'hack'], [], []] });
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(r.profile.decks.decks[0], ['staff', 'gunman', null, null, null, null]);
  assert.equal(r.profile.decks.i, 1);
  assert.equal((await lbPost('/api/langbang/decks', u.token, { decks: 'x' })).ok, false);
});
