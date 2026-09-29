'use strict';
// 게임별 등급(오목 급·단 · 홀덤 칩 등급 · 섯다 등급) · 순위 · 선수 카드
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');

process.env.MASTER_USERS = 'boss';
const { createServer } = require('../server/index');
const { omokGrade, skillScore, tierFor, MIN_GAMES, createRankings } = require('../server/rankings');

let srv, base;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });
let ipN = 0;
const req = (method, url, body, token) => fetch(base + url, {
  method, headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.7.${ipN >> 8}.${ipN++ & 255}`, ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());
const signup = async (username, nickname = username) => {
  const r = await req('POST', '/api/auth/signup', { username, password: 'secret12', nickname });
  assert.equal(r.ok, true, r.message);
  return r;
};
async function setStats(username, fn) {
  const u = await srv.accounts.store.byName(username);
  fn(u.stats);
  srv.accounts.store.save();
}

test('오목 급·단: Elo 점수 → 18급 … 1급, 초단 … 9단', () => {
  assert.equal(omokGrade(400).name, '18급');
  assert.equal(omokGrade(1000).name, '8급');
  assert.equal(omokGrade(1279).name, '2급');
  assert.equal(omokGrade(1280).name, '1급');
  assert.equal(omokGrade(1320).name, '초단');
  assert.equal(omokGrade(1440).name, '3단');
  assert.equal(omokGrade(3000).name, '9단');
  assert.ok(omokGrade(1320).level > omokGrade(1280).level);
});

test('홀덤·섯다 실력 점수: 판당 득실·승률·판 수 → 등급, 10판 미만은 배치 중', () => {
  const good = { hands: 200, wins: 70, net: 20000 };
  const bad = { hands: 200, wins: 10, net: -30000 };
  assert.ok(skillScore(good) > skillScore(bad));
  assert.equal(tierFor('holdem', { holdem: { hands: MIN_GAMES - 1, wins: 9, net: 99999 } }), null, '10판 미만');
  const tg = tierFor('holdem', { holdem: good });
  const tb = tierFor('holdem', { holdem: bad });
  assert.ok(['레전드', '하이롤러', '다이아'].includes(tg.name), tg.name);
  assert.equal(tb.name, '브론즈 칩');
  assert.equal(tierFor('seotda', { seotda: bad }).name, '초짜');
  assert.ok(['신의 손', '명인', '고수'].includes(tierFor('seotda', { seotda: good }).name));
  // 칩만 많은 사람이 이기는 게 아님: 판 수 적고 큰 한 판보다 꾸준히 이긴 사람
  const lucky = { hands: 12, wins: 1, net: 3000 };
  const steady = { hands: 300, wins: 90, net: 9000 };
  assert.ok(skillScore(steady) > skillScore(lucky) - 30);
});

test('순위 API: 게임별 top 10 · 내 순위 · 마스터 제외 · 방 안 등급 · 선수 카드', async () => {
  const a = await signup('rank_a', '에이스');
  const bb = await signup('rank_b', '비기너');
  await signup('rank_c', '신입');
  const boss = await signup('boss', '대장');
  await setStats('rank_a', (s) => { Object.assign(s.holdem, { hands: 120, wins: 45, net: 9000, bestPot: 2400, bestHand: '풀하우스', recent: 'WWLWLWWWLW' }); Object.assign(s.omok, { games: 30, wins: 22, rating: 1450, peak: 1460, bestStreak: 6 }); });
  await setStats('rank_b', (s) => { Object.assign(s.holdem, { hands: 80, wins: 8, net: -6000 }); Object.assign(s.omok, { games: 12, wins: 3, rating: 900 }); });
  await setStats('rank_c', (s) => { Object.assign(s.holdem, { hands: 3, wins: 2, net: 500 }); });
  await setStats('boss', (s) => { Object.assign(s.holdem, { hands: 999, wins: 900, net: 999999 }); });
  srv.rankings && srv.rankings.clear && srv.rankings.clear();
  const h = await req('GET', '/api/rank/holdem', null, bb.token);
  assert.equal(h.ok, true);
  assert.deepEqual(h.top.map((x) => x.username), ['rank_a', 'rank_b', 'rank_c'], '마스터 제외 · 배치 중은 뒤로');
  assert.equal(h.top[0].rank, 1);
  assert.equal(h.top[0].bestHand, '풀하우스');
  assert.equal(h.top[0].recent, 'WWLWLWWWLW');
  assert.equal(h.top[2].tier, null, '10판 미만: 등급 없음');
  assert.equal(h.top[2].enough, false);
  assert.equal(h.me.username, 'rank_b');
  assert.equal(h.me.rank, 2);
  const o = await req('GET', '/api/rank/omok');
  assert.equal(o.top[0].tier.name, '3단');
  assert.equal(o.top[0].bestStreak, 6);
  assert.equal(o.top.length, 2);
  // 방 안: 로그인한 사람은 등급·순위, 손님·봇은 guest
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  const call = (ev, d) => new Promise((r) => s.emit(ev, d, r));
  const cr = await call('room:create', { name: 'x', settings: { game: 'holdem' }, auth: a.token });
  assert.equal(cr.ok, true, cr.message);
  await call('host:bot', {});
  const rr = await req('GET', `/api/rank/room/${cr.code}`);
  assert.equal(rr.game, 'holdem');
  const mine = rr.ranks[cr.playerId];
  assert.equal(mine.rank, 1);
  assert.ok(mine.tier && mine.tier.name);
  assert.ok(Object.values(rr.ranks).some((x) => x.bot && x.guest));
  const card = await req('GET', `/api/rank/card/holdem?code=${cr.code}&pid=${cr.playerId}`);
  assert.equal(card.card.nickname, '에이스');
  assert.equal(card.card.winRate, 37.5);
  const bc = await req('GET', '/api/rank/card/holdem?user=boss');
  assert.equal(bc.card.master, true);
  assert.equal(bc.card.rank, null, '마스터는 순위 없음');
  s.disconnect();
  assert.ok(boss.token);
});

test('기록하면 최근 10판 · 오목 최다 연승이 쌓인다', async () => {
  const u = await signup('recent1', '최근');
  for (let i = 0; i < 12; i++) await srv.accounts.recordHand('seotda', [{ userId: u.user.id, delta: i % 3 ? 10 : -10, won: !!(i % 3) }], 20);
  for (let i = 0; i < 4; i++) await srv.accounts.recordOmok({ userId: u.user.id }, { ai: 'easy' }, 'a');
  await srv.accounts.recordOmok({ userId: u.user.id }, { ai: 'easy' }, 'b');
  const x = await srv.accounts.store.byName('recent1');
  assert.equal(x.stats.seotda.recent.length, 10);
  assert.equal(x.stats.seotda.recent, 'WLWWLWWLWW');
  assert.equal(x.stats.omok.bestStreak, 4);
  assert.equal(x.stats.omok.recent, 'WWWWL');
});

test('PgStore: 게임별 순위 쿼리 모양 (가짜 DB)', async () => {
  const seen = [];
  const acct = {
    ready: Promise.resolve(), verifyToken: () => null,
    store: { pool: { query: async (sql, params) => { seen.push({ sql, params }); return { rows: [{ id: 'u1', username: 'kim', nickname: '김', created_at: '1', stats: { holdem: { hands: 20, wins: 5, net: 100 } } }] }; } }, byId: async () => null },
  };
  const rk = createRankings({ acct, rooms: new Map() });
  const t = await rk.top('holdem');
  assert.equal(t.top[0].nickname, '김');
  assert.match(seen[0].sql, /COALESCE\(\(stats->\$1->>\$2\)::int, 0\) > 0 LIMIT 5000/);
  assert.deepEqual(seen[0].params, ['holdem', 'hands']);
  await rk.top('holdem');
  assert.equal(seen.length, 1, '60초 동안은 다시 안 읽음');
  rk.clear();
  await rk.top('omok');
  assert.deepEqual(seen[1].params, ['omok', 'games']);
});
