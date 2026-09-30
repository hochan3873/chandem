'use strict';
// 배포(재시작)해도 게임이 안 끊기게: 스냅숏 저장 · 복구 · 앞뒤 안 맞는 판은 무효+환불 · 방장 이전 · 재접속 · 다음 판부터 참여
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await wait(30); } throw new Error('시간 초과'); };
const mk = (port) => {
  const s = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
  s.last = null; s.notices = [];
  s.on('state', (v) => { s.last = v; });
  s.on('server:restarting', (m) => s.notices.push(m));
  s.call = (e, d) => new Promise((r) => s.emit(e, d || {}, r));
  return s;
};
const tmp = () => path.join(os.tmpdir(), `chandem-rs-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);

test('꺼질 때(SIGTERM) 알리고 저장 → 다시 켜면 자리·칩·카드 그대로', async () => {
  const file = tmp();
  const s1 = createServer({ port: 0, dataFile: file, pace: 0.05 });
  const p1 = await s1.listen();
  const a = mk(p1); const b = mk(p1);
  const ra = await a.call('room:create', { name: '가', settings: { game: 'seotda', startChips: 500, sb: 10, bb: 10, turnSeconds: 60 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => b.last && b.last.hand && !b.last.hand.finished);
  const before = { cards: b.last.players.find((p) => p.id === rb.playerId).cards, stacks: b.last.players.map((p) => [p.id, p.stack]) };
  await s1.shutdown();
  await until(() => a.notices.length && b.notices.length);
  assert.match(a.notices[0].message, /서버 업데이트 중/);
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(snap.savedAt && snap.rooms.length === 1, '스냅숏(저장 시각 + 방)');
  a.close(); b.close(); await s1.close();

  const s2 = createServer({ port: 0, dataFile: file, pace: 0.05 });
  const p2 = await s2.listen();
  const b2 = mk(p2);
  const r = await b2.call('room:resume', { code: ra.code, token: rb.token });
  assert.equal(r.ok, true, r.message);
  await until(() => b2.last && b2.last.hand);
  assert.deepEqual(b2.last.players.find((p) => p.id === rb.playerId).cards, before.cards, '카드 그대로');
  assert.deepEqual(b2.last.players.map((p) => [p.id, p.stack]), before.stacks, '칩 그대로');
  b2.close(); await s2.close();
  fs.rmSync(file, { force: true });
});

test('복구한 판이 앞뒤가 안 맞으면 무효: 판 시작 전 칩으로 돌려주고 다음 판', async () => {
  const file = tmp();
  const s1 = createServer({ port: 0, dataFile: file, pace: 0.05 });
  const p1 = await s1.listen();
  const a = mk(p1); const b = mk(p1);
  const ra = await a.call('room:create', { name: '가', settings: { startChips: 1000, sb: 10, bb: 20, turnSeconds: 60 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => a.last && a.last.hand && !a.last.hand.finished);
  await s1.saveNow();
  a.close(); b.close(); await s1.close();
  // 저장본을 망가뜨림: 칩이 사라진 판
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  const room = snap.rooms[0];
  const starts = Object.fromEntries(room.hand.seats.map((x) => [x.id, x.startStack]));
  room.hand.seats[0].stack -= 300;
  fs.writeFileSync(file, JSON.stringify(snap));

  const s2 = createServer({ port: 0, dataFile: file, pace: 0.05 });
  const p2 = await s2.listen();
  const r2 = s2.rooms.get(ra.code);
  assert.ok(r2, '방은 살아 있음');
  assert.equal(r2.hand, null, '망가진 판은 무효');
  for (const [id, st] of Object.entries(starts)) assert.equal(r2.get(id).stack, st, '판 시작 전 칩으로 환불');
  assert.ok(r2.feed.some((e) => /무효/.test(e.text)));
  const b2 = mk(p2);
  assert.equal((await b2.call('room:resume', { code: ra.code, token: rb.token })).ok, true);
  await until(() => b2.last && b2.last.hand && b2.last.room.handNo >= 2, 10000); // 다음 판이 시작됨
  b2.close(); await s2.close();
  fs.rmSync(file, { force: true });
});

test('10분보다 오래된 스냅숏은 복구하지 않음', async () => {
  const file = tmp();
  fs.writeFileSync(file, JSON.stringify({ savedAt: Date.now() - 11 * 60 * 1000, rooms: [{ code: 'OLD123', touchedAt: Date.now(), settings: {}, players: [] }] }));
  const s = createServer({ port: 0, dataFile: file });
  await s.listen();
  assert.equal(s.rooms.has('OLD123'), false);
  await s.close();
  fs.rmSync(file, { force: true });
});

test('방장이 판 도중 나가도 방은 계속 · 사람 방장으로 이전 · 모두 나가면 잠시 뒤 정리', async () => {
  const s = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, emptyRoomMs: 300 } });
  const port = await s.listen();
  const a = mk(port); const b = mk(port); const c = mk(port);
  const ra = await a.call('room:create', { name: '방장', settings: { turnSeconds: 60 } });
  await a.call('host:bot');
  await b.call('room:join', { code: ra.code, name: '둘째' });
  await c.call('room:join', { code: ra.code, name: '셋째' });
  await b.call('lobby:ready', { ready: true }); await c.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => b.last && b.last.hand && !b.last.hand.finished);
  await a.call('room:leave');
  await until(() => b.last && b.last.room.hostId && b.last.room.hostId !== ra.playerId);
  const host = b.last.players.find((p) => p.id === b.last.room.hostId);
  assert.equal(host.name, '둘째', '가장 먼저 들어온 사람 (봇 아님)');
  assert.ok(s.rooms.has(ra.code), '방은 그대로');
  const list = await (await fetch(`http://127.0.0.1:${port}/api/rooms`)).json();
  assert.equal(list.rooms.find((x) => x.code === ra.code).hostName, '둘째', '방 목록에 새 방장');
  // 사람이 모두 나가면 바로 지우지 않고 잠시 뒤 정리
  await b.call('room:leave'); await c.call('room:leave');
  assert.ok(s.rooms.has(ra.code), '바로 지우지 않음');
  await until(() => !s.rooms.has(ra.code), 3000);
  a.close(); b.close(); c.close(); await s.close();
});

test('연결이 끊겼다 다시 오면(같은 토큰 · 같은 계정) 같은 자리·칩·카드로', async () => {
  const s = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0 } });
  const port = await s.listen();
  const base = `http://127.0.0.1:${port}`;
  const acc = await (await fetch(base + '/api/site/device-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: '재접속' }) })).json();
  const a = mk(port); const b = mk(port);
  const ra = await a.call('room:create', { name: '방장', settings: { turnSeconds: 60 } });
  const rb = await b.call('room:join', { code: ra.code, name: 'x', auth: acc.token });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => b.last && b.last.hand && !b.last.hand.finished);
  const mine = b.last.players.find((p) => p.id === rb.playerId);
  b.close();
  await until(() => a.last.players.find((p) => p.id === rb.playerId).connected === false);
  // 같은 토큰
  const b2 = mk(port);
  assert.equal((await b2.call('room:resume', { code: ra.code, token: rb.token })).ok, true);
  await until(() => b2.last && b2.last.me && b2.last.me.id === rb.playerId);
  assert.deepEqual(b2.last.players.find((p) => p.id === rb.playerId).cards, mine.cards);
  b2.close();
  // 같은 계정으로 다른 기기에서 참가 → 새 자리 대신 원래 자리
  const b3 = mk(port);
  const j = await b3.call('room:join', { code: ra.code, name: '딴이름', auth: acc.token });
  assert.equal(j.ok, true, j.message);
  assert.equal(j.playerId, rb.playerId, '원래 자리');
  assert.equal(a.last.players.filter((p) => p.name === '딴이름').length, 0);
  a.close(); b3.close(); await s.close();
});

test('DATABASE_URL 이 있으면 스냅숏을 PostgreSQL 표(rooms_snapshot)에 저장하고, 켜질 때 읽어 온다 (가짜 DB)', async () => {
  const { createAccounts } = require('../server/accounts');
  const db = { snap: null, sql: [] };
  const fakePool = {
    query: async (sql, params) => {
      db.sql.push(sql.replace(/\s+/g, ' '));
      if (/INSERT INTO rooms_snapshot/.test(sql)) { db.snap = JSON.parse(params[0]); return { rows: [], rowCount: 1 }; }
      if (/SELECT data FROM rooms_snapshot/.test(sql)) return { rows: db.snap ? [{ data: db.snap }] : [] };
      if (/COUNT/.test(sql)) return { rows: [{ n: 0 }] };
      return { rows: [], rowCount: 0 };
    },
    end: async () => {},
  };
  const mkAcct = async () => { const acc = createAccounts({ databaseUrl: 'postgres://u:p@127.0.0.1:1/none', secret: 'x' }); await acc.ready.catch(() => {}); try { await acc.store.pool.end(); } catch {} acc.store.pool = fakePool; return acc; };
  const s1 = createServer({ port: 0, pace: 0.05, accounts: await mkAcct(), limits: { createGapMs: 0 } });
  const p1 = await s1.listen();
  await s1.roomsReady();
  const a = mk(p1);
  const ra = await a.call('room:create', { name: '디비', settings: {} });
  assert.equal(ra.ok, true, ra.message);
  await s1.saveNow();
  assert.ok(db.sql.some((q) => /CREATE TABLE IF NOT EXISTS rooms_snapshot/.test(q)));
  assert.ok(db.snap && db.snap.rooms.some((r) => r.code === ra.code), 'DB 에 저장');
  a.close(); await s1.close();
  const s2 = createServer({ port: 0, pace: 0.05, accounts: await mkAcct() });
  await s2.listen();
  await s2.roomsReady();
  assert.ok(s2.rooms.has(ra.code), 'DB 에서 복구');
  await s2.close();
});
