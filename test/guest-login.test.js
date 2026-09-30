'use strict';
// 손님 → 로그인 권하기: '이 기기로 계속하기' 자동 계정 · 방 안에서 로그인하면 다음 판부터 기록
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

let srv, base;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });
let ipN = 0;
const req = (method, url, body, token, ip) => fetch(base + url, {
  method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.8.${ipN >> 8}.${ipN++ & 255}`, ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then((r) => r.json());
const until = async (fn, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 30)); } throw new Error('시간 초과'); };

test('이 기기로 계속하기: 닉네임만으로 계정 · 겹치면 숫자 · 복구 코드 · 로그인 가능 · IP당 제한', async () => {
  const a = await req('POST', '/api/site/device-account', { nickname: '민수' });
  assert.equal(a.ok, true, a.message);
  assert.match(a.username, /^dv[a-z0-9]{8}$/);
  assert.ok(a.password.length >= 20);
  assert.match(a.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal(a.user.nickname, '민수');
  assert.equal((await req('GET', '/api/auth/me', null, a.token)).ok, true);
  const b = await req('POST', '/api/site/device-account', { nickname: '민수' });
  assert.equal(b.user.nickname, '민수2', '닉네임이 겹치면 숫자를 붙임');
  assert.notEqual(a.username, b.username);
  // 저장된 아이디·비밀번호로 다시 로그인 (토큰이 만료돼도)
  assert.equal((await req('POST', '/api/auth/login', { username: a.username, password: a.password })).ok, true);
  // 복구 코드로 비밀번호 정하기
  const r = await req('POST', '/api/site/reset-password', { username: a.username, code: a.code, next: 'mypass12' });
  assert.equal(r.ok, true, r.message);
  const u = await srv.accounts.store.byName(a.username);
  assert.equal(u.meta.device, true);
  assert.ok(!JSON.stringify(u).includes(a.password), '비밀번호 원문 저장 안 함');
  // 욕설 닉네임 거절 · IP당 한 시간 3개
  assert.equal((await req('POST', '/api/site/device-account', { nickname: '시발' })).ok, false);
  const ip = '10.99.0.1';
  for (let i = 0; i < 3; i++) assert.equal((await req('POST', '/api/site/device-account', { nickname: '손' + i }, null, ip)).ok, true);
  assert.equal((await req('POST', '/api/site/device-account', { nickname: '손9' }, null, ip)).ok, false);
});

test('방 안에서 로그인: 판 도중이면 다음 판부터, 손님으로 한 판은 소급하지 않음', async () => {
  const acc = await req('POST', '/api/site/device-account', { nickname: '늦은로그인' });
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  s.last = null;
  let auto = true;
  s.on('state', (v) => { s.last = v; const la = v.hand && v.hand.legal; if (la && auto) s.emit('game:act', { type: la.canCheck ? 'check' : 'fold' }, () => {}); });
  const call = (ev, d) => new Promise((r) => s.emit(ev, d || {}, r));
  const r = await call('room:create', { name: '손님', settings: { game: 'holdem', turnSeconds: 10 } }); // 손님으로 만듦
  assert.equal(r.ok, true, r.message);
  await call('host:bot'); await call('host:bot');
  auto = false; // 첫 판 도중에 로그인하려고 잠깐 멈춤
  assert.equal((await call('lobby:start')).ok, true);
  await until(() => s.last && s.last.hand && !s.last.hand.finished);
  const b = await call('room:bindAccount', { auth: acc.token });
  assert.equal(b.ok, true, b.message);
  assert.equal(b.from, 'next', '판 도중: 다음 판부터');
  const me = s.last.players.find((p) => p.id === r.playerId);
  assert.equal(me.memberNext, true);
  auto = true;
  const la = s.last.hand && s.last.hand.legal; if (la) s.emit('game:act', { type: la.canCheck ? 'check' : 'fold' }, () => {});
  const handAtBind = s.last.room.handNo;
  await until(() => s.last.room.handNo >= handAtBind + 2);
  await new Promise((res) => setTimeout(res, 300));
  const u = await srv.accounts.store.byName(acc.username);
  assert.ok(u.stats.holdem.hands >= 1, '다음 판부터 기록');
  assert.ok(u.stats.holdem.hands <= s.last.room.handNo - handAtBind, `로그인한 판(${handAtBind})은 소급 안 함 · 기록 ${u.stats.holdem.hands}`);
  assert.equal(s.last.players.find((p) => p.id === r.playerId).member, true);
  // 같은 계정으로 다른 자리 묶기는 안 됨
  const s2 = connect(base, { transports: ['websocket'], forceNew: true });
  const call2 = (ev, d) => new Promise((res) => s2.emit(ev, d || {}, res));
  const j = await call2('room:join', { code: r.code, name: '둘째', spectator: true });
  assert.equal(j.ok, true, j.message);
  const b2 = await call2('room:bindAccount', { auth: acc.token });
  assert.equal(b2.ok, false);
  s.close(); s2.close();
});
