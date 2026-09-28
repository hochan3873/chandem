'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

let srv;
let base;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } }); // 쇼다운 연출 시간을 20배 빠르게
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
  await until(() => a.last.hand.result); // 쇼다운 연출이 끝나야 결과가 공개된다
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

test('리바인: 칩이 부족할 때만, 횟수 제한, 다음 판부터 적용', async () => {
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
  await until(() => a.last.hand.result);
  const res = a.last.hand.result;
  const tie = Object.values(res.deltas).every((d) => d === 0);
  if (tie) { a.close(); b.close(); return; } // 드물게 무승부면 이 테스트는 생략
  const loserId = Object.entries(res.deltas).find(([, d]) => d < 0)[0];
  const loser = byId[loserId];
  // 올인한 순간이 아니라 판이 끝난 뒤의 상태로 확인 (판에 건 칩은 아직 잃은 게 아님)
  await until(() => loser.last.hand.result && loser.last.me.stack === 0);
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
  assert.equal(total, 300); // 원래 200 + 리바인 100
  a.close(); b.close();
});

test('서버를 다시 켜도 저장된 방과 진행 중인 판이 복구된다', async () => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const file = path.join(os.tmpdir(), `chandem-test-${Date.now()}.json`);
  const s1 = createServer({ port: 0, dataFile: file, pace: 0.05 });
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

test('쇼다운 연출: 결과·칩 이동은 연출이 끝난 뒤 공개, 올인이면 카드가 한 장씩 깔린다', async () => {
  const a = client(); const b = client();
  const ra = await a.call('room:create', { name: '가', settings: { startChips: 500, sb: 5, bb: 10 } });
  const rb = await b.call('room:join', { code: ra.code, name: '나' });
  await b.call('lobby:ready', { ready: true });
  await a.call('lobby:start');
  await until(() => a.last.hand && b.last.hand);
  const byId = { [ra.playerId]: a, [rb.playerId]: b };
  const firstId = a.last.hand.toActId;
  const stacksBefore = a.last.players.map((p) => p.stack + p.bet).sort().join();
  await byId[firstId].call('game:act', { type: 'allin' });
  const second = byId[await until(() => a.last.hand.toActId !== firstId && a.last.hand.toActId)];
  const la = await until(() => second.last.hand.legal);
  // 연출 동안 받은 화면 상태를 모두 기록
  const seen = [];
  a.on('state', (v) => { if (v.hand && v.hand.finished) seen.push(v); });
  await second.call('game:act', { type: la.canCall ? 'call' : 'allin' });
  await until(() => a.last.hand.result, 5000);
  const during = seen.filter((v) => !v.hand.result);
  assert.ok(during.length >= 3, '결과 전에 연출 단계가 여러 번 보여야 합니다');
  // 연출 중: 결과 없음, 올인 표시, 보드는 5장 미만에서 시작, 칩은 이동 전
  assert.equal(during[0].hand.reveal.allin, true);
  assert.ok(during[0].hand.board.length < 5);
  assert.ok(during.some((v) => v.hand.reveal.squeeze), '리버 전에 뜸 들이는 단계가 있어야 합니다');
  const boardLens = during.map((v) => v.hand.board.length);
  assert.deepEqual(boardLens, [...boardLens].sort((x, y) => x - y), '보드는 한 장씩 늘어나야 합니다');
  for (const v of during) {
    assert.equal(v.feed.some((e) => e.type === 'end' && e.hand === v.room.handNo), false, '승리 기록이 미리 나오면 안 됩니다');
  }
  // 두 사람 모두 올인이라 연출 중에는 둘 다 칩이 0으로 보인다(아직 정산 전)
  assert.equal(during[0].players.reduce((s, p) => s + p.stack, 0), 0);
  // 연출이 끝나면 결과 + 칩 이동
  assert.equal(a.last.hand.board.length, 5);
  assert.ok(a.last.players.reduce((s, p) => s + p.stack, 0) > 0);
  assert.equal(a.last.players.map((p) => p.stack + p.bet).reduce((x, y) => x + y, 0), stacksBefore.split(',').map(Number).reduce((x, y) => x + y, 0));
  a.close(); b.close();
});

test('혼자 연습: 봇들이 알아서 치고 판이 계속 이어진다', async () => {
  const a = client();
  const r = await a.call('room:practice', { name: '찬', bots: 3, settings: { startChips: 1000, sb: 10, bb: 20, rebuyMax: 99 } });
  assert.equal(r.ok, true, r.message);
  await until(() => a.last && a.last.room.phase === 'playing');
  assert.equal(a.last.players.filter((p) => p.isBot).length, 3);
  assert.equal(a.last.room.practice, true);
  assert.ok(a.last.players.find((p) => p.id === r.playerId).isHost, '사람이 방장');
  // 내 차례에는 체크/콜만 하고, 칩이 떨어지면 리바인한다
  const play = (v) => {
    const la = v.hand && v.hand.legal;
    if (la) a.emit('game:act', { type: la.canCheck ? 'check' : 'call' }, () => {});
    if (v.me && v.me.canRebuy && v.me.stack === 0) a.emit('game:rebuy', {}, () => {});
  };
  a.on('state', play);
  play(a.last);
  await until(() => a.last.room.handNo >= 4, 20000);
  const total = a.last.players.reduce((s, p) => s + p.stack, 0) + (a.last.hand && !a.last.hand.finished ? a.last.hand.totalPot : 0);
  assert.ok(total % 1000 === 0 && total >= 4000, `칩 합계가 충전 단위와 맞음 (${total})`);
  // 사람이 나가면 방이 사라진다
  await a.call('room:leave');
  assert.equal(srv.rooms.has(r.code), false);
  a.close();
});

test('대기실에서 방장만 봇을 추가할 수 있고, 봇은 준비된 상태다', async () => {
  const a = client(); const b = client();
  const ra = await a.call('room:create', { name: '방장', settings: {} });
  await b.call('room:join', { code: ra.code, name: '친구' });
  const no = await b.call('host:bot');
  assert.equal(no.ok, false);
  const yes = await a.call('host:bot');
  assert.equal(yes.ok, true, yes.message);
  await until(() => a.last && a.last.players.some((p) => p.isBot));
  const botP = a.last.players.find((p) => p.isBot);
  assert.equal(botP.ready, true);
  assert.match(a.last.room.startBlocker || '', /친구/); // 사람 친구만 준비 전
  // 방장이 나가도 봇에게 방장이 가지 않는다
  await a.call('room:leave');
  await until(() => b.last && b.last.players.find((p) => p.isHost));
  assert.equal(b.last.players.find((p) => p.isHost).name, '친구');
  a.close(); b.close();
});

test('감정 표현: 방 전체에 전달되고, 너무 자주 보내면 막힌다', async () => {
  const a = client(); const b = client();
  const ra = await a.call('room:create', { name: '방장', settings: {} });
  await b.call('room:join', { code: ra.code, name: '친구' });
  const got = new Promise((res) => b.once('emote', res));
  const r1 = await a.call('game:emote', { kind: 'mock' });
  assert.equal(r1.ok, true, r1.message);
  const e = await got;
  assert.equal(e.kind, 'mock');
  assert.equal(e.id, ra.playerId);
  const r2 = await a.call('game:emote', { kind: 'angry' });
  assert.equal(r2.ok, false);
  const r3 = await b.call('game:emote', { kind: 'hack' });
  assert.equal(r3.ok, false);
  a.close(); b.close();
});

test('연습 봇은 타짜 인물 이름이고 캐릭터 성별이 맞다', async () => {
  const a = client();
  const r = await a.call('room:practice', { name: '찬', bots: 5 });
  assert.equal(r.ok, true, r.message);
  await until(() => a.last && a.last.players.length === 6);
  const bots = Object.fromEntries(a.last.players.filter((p) => p.isBot).map((p) => [p.name, p.avatar]));
  assert.deepEqual(bots, { 평경장: 5, 정마담: 8, 아귀: 1, 화란: 2, 고니: 7 });
  await a.call('room:leave');
  a.close();
});

test('과부하 방지: 같은 사람이 방을 너무 빨리·너무 많이 만들 수 없다', async () => {
  const strict = createServer({ port: 0, limits: { createGapMs: 3000, roomsPerIp: 2 } });
  const port = await strict.listen();
  const mk = () => { const s = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true }); s.call = (ev, d) => new Promise((r) => s.emit(ev, d, r)); return s; };
  const a = mk();
  assert.equal((await a.call('room:create', { name: 'A', settings: {} })).ok, true);
  const fast = await a.call('room:create', { name: 'A', settings: {} });
  assert.equal(fast.ok, false);
  assert.match(fast.message, /조금 있다가/);
  a.close();
  await strict.close();
});

test('이상한 요청이 와도 서버가 죽지 않는다', async () => {
  const a = client();
  for (const ev of ['room:create', 'room:join', 'room:practice', 'game:act', 'game:emote', 'host:bot']) {
    const r = await a.call(ev, null);
    assert.equal(r.ok, false, ev);
  }
  const big = await a.call('room:create', { name: 'x'.repeat(5000), settings: { startChips: -5, sb: 'abc', maxPlayers: 999 } });
  assert.equal(big.ok, true);
  await until(() => a.last);
  assert.ok(a.last.players[0].name.length <= 10);
  a.close();
});

test('봇: 매판 올인하는 사람에게는 적당한 패로 받아치고, 신중한 사람의 올인엔 약한 패를 접는다', () => {
  const { Hand } = require('../server/engine/hand');
  const bot = require('../server/bot');
  // 헤드업, 사람(H)이 딜러(SB)로 먼저 올인 → 봇(B, BB) 차례
  const deal = (hole) => {
    const deck = ['7s', hole[0], '7c', hole[1], 'Kh', 'Qd', '2c', '5d', '9h', '3s', 'Jc', '4h', '8d', '6c']; // 한 장씩 번갈아 나눔
    const h = new Hand({ players: [{ id: 'H', stack: 1000 }, { id: 'B', stack: 1000 }], dealerIndex: 0, sb: 10, bb: 20, deck });
    h.act('H', { type: 'allin' });
    return h;
  };
  const maniac = { H: { hands: 20, vpip: 20, raises: 0, allins: 20 } };
  const careful = { H: { hands: 20, vpip: 3, raises: 1, allins: 1 } };
  let callVsManiac = 0, callVsCareful = 0, foldTrash = 0;
  for (let i = 0; i < 10; i++) {
    const h1 = deal(['Ah', '9d']);
    if (h1.currentId === 'B' && bot.decide(h1, 'B', bot.STYLES[0], maniac).type === 'call') callVsManiac++;
    const h2 = deal(['Ah', '9d']);
    if (h2.currentId === 'B' && bot.decide(h2, 'B', bot.STYLES[0], careful).type === 'call') callVsCareful++;
    const h3 = deal(['8h', '3d']);
    if (h3.currentId === 'B' && bot.decide(h3, 'B', bot.STYLES[0], careful).type === 'fold') foldTrash++;
  }
  assert.ok(callVsManiac >= 9, `A9 로 매판 올인러에게 콜 (${callVsManiac}/10)`);
  assert.ok(callVsCareful <= 2, `A9 로 신중한 사람 올인엔 대부분 폴드 (${callVsCareful}/10)`);
  assert.ok(foldTrash === 10, `83o 는 폴드 (${foldTrash}/10)`);
});
