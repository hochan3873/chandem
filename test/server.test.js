'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

let srv;
let base;
test.before(async () => {
  srv = createServer({ port: 0 });
  const port = await srv.listen();
  base = `http://127.0.0.1:${port}`;
});
test.after(async () => { await srv.close(); });

function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (v) => { s.last = v; });
  s.call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 3000) {
  const t = Date.now();
  while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(20); }
  throw new Error('시간 초과');
}

test('방 만들기 → 참가(중복 닉네임) → 준비 → 시작 → 한 판 끝까지', async () => {
  const a = client(); const b = client(); const c = client();
  const ra = await a.call('room:create', { name: '찬', settings: { startChips: 500, sb: 5, bb: 10, turnSeconds: 30 } });
  assert.equal(ra.ok, true);
  const code = ra.code;
  const rb = await b.call('room:join', { code, name: '민수' });
  const rc = await c.call('room:join', { code, name: '민수' });
  assert.equal(rb.ok, true);
  assert.equal(rc.ok, true);
  await until(() => a.last && a.last.players.length === 3);
  const names = a.last.players.map((p) => p.name).sort();
  assert.deepEqual(names, ['민수', '민수 (2)', '찬']);

  const early = await a.call('lobby:start');
  assert.equal(early.ok, false);
  assert.match(early.message, /준비 안 한 사람/);

  await b.call('lobby:ready', { ready: true });
  await c.call('lobby:ready', { ready: true });
  const st = await a.call('lobby:start');
  assert.equal(st.ok, true, st.message);
  await until(() => a.last.hand && b.last.hand && c.last.hand);

  // 비공개 정보: 내 카드만 보이고 남의 카드는 ?? 로 온다. 덱은 절대 오지 않는다
  for (const s of [a, b, c]) {
    const me = s.last.players.find((p) => p.id === s.last.me.id);
    assert.equal(me.cards.length, 2);
    assert.notEqual(me.cards[0], '??');
    for (const p of s.last.players.filter((x) => x.id !== s.last.me.id)) assert.deepEqual(p.cards, ['??', '??']);
    assert.equal(JSON.stringify(s.last).includes('"deck"'), false);
  }
  assert.equal(a.last.hand.board.length, 0);

  // 끝날 때까지 콜/체크
  const byId = { [ra.playerId]: a, [rb.playerId]: b, [rc.playerId]: c };
  for (let guard = 0; guard < 30; guard++) {
    const h = a.last.hand;
    if (h.finished) break;
    const who = byId[h.toActId];
    await until(() => who.last.hand.legal);
    const la = who.last.hand.legal;
    const r = await who.call('game:act', { type: la.canCheck ? 'check' : 'call' });
    assert.equal(r.ok, true, r.message);
    await until(() => a.last.hand.toActId !== h.toActId || a.last.hand.finished || a.last.hand.stage !== h.stage);
  }
  const res = a.last.hand.result;
  assert.ok(res, '결과가 있어야 합니다');
  assert.equal(res.type, 'showdown');
  assert.equal(a.last.hand.board.length, 5);
  // 쇼다운 후에는 남은 사람 카드가 공개된다
  const other = a.last.players.find((p) => p.id === rb.playerId);
  assert.notEqual(other.cards[0], '??');
  assert.equal(Object.values(res.deltas).reduce((x, y) => x + y, 0), 0);
  for (const s of [a, b, c]) s.close();
});

test('차례가 아닐 때 행동하면 거절된다', async () => {
  const a = client(); const b = client();
  const ra = await a.call('room:create', { name: '가', settings: { startChips: 500, sb: 5, bb: 10 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => a.last.hand && b.last.hand);
  const turn = a.last.hand.toActId;
  const wrong = turn === ra.playerId ? b : a;
  const r = await wrong.call('game:act', { type: 'call' });
  assert.equal(r.ok, false);
  assert.match(r.message, /내 차례가 아닙니다/);
  a.close(); b.close();
});

test('새로고침(재접속)하면 같은 플레이어로 돌아오고 카드가 복구된다', async () => {
  const a = client(); const b = client();
  const ra = await a.call('room:create', { name: '가', settings: { startChips: 500, sb: 5, bb: 10 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => b.last && b.last.hand);
  const before = b.last.players.find((p) => p.id === rb.playerId).cards;
  b.close();
  await until(() => a.last.players.find((p) => p.id === rb.playerId).connected === false);

  const b2 = client();
  const r = await b2.call('room:resume', { code: ra.code, token: rb.token });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.playerId, rb.playerId);
  await until(() => b2.last && b2.last.hand);
  const after = b2.last.players.find((p) => p.id === rb.playerId).cards;
  assert.deepEqual(after, before);
  await until(() => a.last.players.find((p) => p.id === rb.playerId).connected === true);

  const x = client();
  const bad = await x.call('room:resume', { code: ra.code, token: 'wrong' });
  assert.equal(bad.ok, false);
  a.close(); b2.close(); x.close();
});

test('비밀번호와 참가 승인', async () => {
  const a = client(); const b = client(); const c = client();
  const ra = await a.call('room:create', { name: '방장', settings: { password: '1234', approval: true } });
  const wrong = await b.call('room:join', { code: ra.code, name: '손님', password: '0000' });
  assert.equal(wrong.ok, false);
  assert.match(wrong.message, /비밀번호/);
  let joined = null;
  b.on('joined', (d) => { joined = d; });
  const rb = await b.call('room:join', { code: ra.code, name: '손님', password: '1234' });
  assert.equal(rb.pending, true);
  await until(() => a.last.pending && a.last.pending.length === 1);
  await a.call('host:approve', { id: a.last.pending[0].id, ok: true });
  await until(() => joined && b.last);
  assert.equal(b.last.me.name, '손님');

  let rejected = null;
  c.on('rejected', (d) => { rejected = d; });
  await c.call('room:join', { code: ra.code, name: '불청객', password: '1234' });
  await until(() => a.last.pending.length === 1);
  await a.call('host:approve', { id: a.last.pending[0].id, ok: false });
  await until(() => rejected);
  a.close(); b.close(); c.close();
});

test('방장이 나가면 가장 먼저 들어온 참가자가 방장이 된다', async () => {
  const a = client(); const b = client(); const c = client();
  const ra = await a.call('room:create', { name: '1번' });
  const rb = await b.call('room:join', { code: ra.code, name: '2번' });
  await c.call('room:join', { code: ra.code, name: '3번' });
  await a.call('room:leave');
  await until(() => b.last && b.last.room.hostId === rb.playerId);
  assert.equal(b.last.me.isHost, true);
  b.close(); c.close(); a.close();
});

test('리바이: 칩이 부족할 때만, 횟수 제한, 다음 판부터 적용', async () => {
  const a = client(); const b = client();
  const ra = await a.call('room:create', { name: '가', settings: { startChips: 100, sb: 5, bb: 10, rebuyEnabled: true, rebuyAmount: 100, rebuyMax: 1 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => a.last.hand && b.last.hand);
  const byId = { [ra.playerId]: a, [rb.playerId]: b };
  // 첫 행동자가 올인, 상대가 콜 → 한 명은 칩 0
  const firstId = a.last.hand.toActId;
  await byId[firstId].call('game:act', { type: 'allin' });
  const second = byId[await until(() => a.last.hand.toActId !== firstId && a.last.hand.toActId)];
  const la = await until(() => second.last.hand.legal);
  await second.call('game:act', { type: la.canCall ? 'call' : 'allin' });
  await until(() => a.last.hand.finished);
  const res = a.last.hand.result;
  const tie = Object.values(res.deltas).every((d) => d === 0);
  if (tie) { a.close(); b.close(); return; } // 드물게 무승부면 이 테스트는 생략
  const loserId = Object.entries(res.deltas).find(([, d]) => d < 0)[0];
  const loser = byId[loserId];
  // 올인한 순간이 아니라 판이 끝난 뒤의 상태로 확인 (판에 건 칩은 아직 잃은 게 아님)
  await until(() => loser.last.hand.finished && loser.last.me.stack === 0);
  assert.equal(loser.last.me.canRebuy, true);
  const potBefore = a.last.hand.totalPot;
  const r1 = await loser.call('game:rebuy');
  assert.equal(r1.ok, true, r1.message);
  // 진행 중이던(끝난) 판의 팟·칩은 그대로, 대기 금액만 표시
  assert.equal(loser.last.me.stack, 0);
  assert.equal(loser.last.me.pendingRebuy, 100);
  assert.equal(a.last.hand.totalPot, potBefore);
  const r2 = await loser.call('game:rebuy');
  assert.equal(r2.ok, false);
  // 다음 판이 시작되면 적용 (결과 표시 후 약 7초)
  await until(() => a.last.room.handNo === 2, 12000);
  const lp = a.last.players.find((p) => p.id === loserId);
  assert.equal(lp.rebuys, 1);
  assert.equal(lp.pendingRebuy, 0);
  const total = a.last.players.reduce((sum, p) => sum + p.stack + p.bet, 0);
  assert.equal(total, 300); // 원래 200 + 리바이 100
  a.close(); b.close();
});

test('서버를 다시 켜도 저장된 방과 진행 중인 판이 복구된다', async () => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const file = path.join(os.tmpdir(), `chandem-test-${Date.now()}.json`);
  const s1 = createServer({ port: 0, dataFile: file });
  const p1 = await s1.listen();
  const mk = (port) => { const s = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true }); s.last = null; s.on('state', (v) => { s.last = v; }); s.call = (e, d) => new Promise((r) => s.emit(e, d, r)); return s; };
  const a = mk(p1); const b = mk(p1);
  const ra = await a.call('room:create', { name: '가', settings: { startChips: 500, sb: 5, bb: 10 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => b.last && b.last.hand);
  const cards = b.last.players.find((p) => p.id === rb.playerId).cards;
  await wait(500); // 저장 대기
  a.close(); b.close();
  await s1.close();

  const s2 = createServer({ port: 0, dataFile: file });
  const p2 = await s2.listen();
  const b2 = mk(p2);
  const r = await b2.call('room:resume', { code: ra.code, token: rb.token });
  assert.equal(r.ok, true, r.message);
  await until(() => b2.last && b2.last.hand);
  assert.deepEqual(b2.last.players.find((p) => p.id === rb.playerId).cards, cards);
  assert.equal(b2.last.room.handNo, 1);
  b2.close();
  await s2.close();
  fs.rmSync(file, { force: true });
});
