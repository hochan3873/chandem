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
