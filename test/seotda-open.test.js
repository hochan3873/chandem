'use strict';
// 세 장 섯다 '한 장 공개': 두 장 → 한 장 골라 공개 → 1차 베팅 → 한 장 더 → 2차 베팅 → 두 장 고르기 → 승부
const test = require('node:test');
const assert = require('node:assert/strict');
const { SeotdaHand, newSeotdaDeck } = require('../server/games/seotda');
const { Room, sanitizeSettings } = require('../server/room');

// 딜러 0, 두 사람: 1번 자리부터 한 장씩 → 자리0 = [d1, d3, d5], 자리1 = [d0, d2, d4]
function deckFor(seat0, seat1) {
  const top = [seat1[0], seat0[0], seat1[1], seat0[1], seat1[2], seat0[2]];
  return [...top, ...newSeotdaDeck().filter((c) => !top.includes(c))];
}
const players = () => [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }];
const checkAround = (h) => { const st = h.stage; let n = 0; while (h.currentId && h.stage === st && n++ < 10) h.act(h.currentId, { type: 'check' }); };

test('한 장 공개: 공개 단계 → 베팅 → 세 번째 → 베팅 → 두 장 고르기, 고른 두 장으로 승부', () => {
  const mk = () => SeotdaHand.create({ players: players(), dealerIndex: 0, bb: 10, cards: 3, open: true, deck: deckFor(['1A', '3A', '2B'], ['4B', '5B', '6B']) });
  // 1) 가장 좋은 두 장(13광땡)을 고르면 A 승
  let h = mk();
  assert.equal(h.stage, 'open');
  assert.equal(h.currentId, null, '공개 단계엔 베팅 차례 없음');
  assert.throws(() => h.act('B', { type: 'check' }));
  h.phaseAct('A', { type: 'open', index: 1 });
  assert.throws(() => h.phaseAct('A', { type: 'open', index: 0 }), /이미/);
  h.phaseAct('B', { type: 'open', index: 0 });
  assert.equal(h.stage, 'betting');
  checkAround(h);
  assert.equal(h.stage, 'betting2');
  assert.equal(h.seatOf('A').hole.length, 3);
  checkAround(h);
  assert.equal(h.stage, 'pick', '2차 베팅 뒤 두 장 고르기');
  assert.throws(() => h.phaseAct('A', { type: 'pick', cards: ['1A', '9A'] }), /두 장/);
  h.phaseAct('A', { type: 'pick', cards: ['1A', '3A'] });
  h.phaseAct('B', { type: 'pick', cards: ['4B', '5B'] });
  assert.equal(h.finished, true);
  assert.deepEqual(h.result.winners, ['A']);
  assert.match(h.result.hands.A.name, /광땡/);
  // 2) 약한 두 장(2·3 = 5끗)을 고르면 갑오(4·5)에 짐 → 고른 두 장이 결과를 바꾼다
  h = mk();
  h.phaseAct('A', { type: 'open', index: 0 }); h.phaseAct('B', { type: 'open', index: 0 });
  checkAround(h); checkAround(h);
  h.phaseAct('A', { type: 'pick', cards: ['3A', '2B'] });
  h.phaseAct('B', { type: 'pick', cards: ['4B', '5B'] });
  assert.deepEqual(h.result.winners, ['B'], '고른 두 장으로 비교');
  assert.deepEqual(h.result.hands.A.best.slice().sort(), ['2B', '3A']);
});

test('시간 초과: 공개는 낮은 카드 자동, 두 장은 가장 좋은 조합 자동', () => {
  const h = SeotdaHand.create({ players: players(), dealerIndex: 0, bb: 10, cards: 3, open: true, deck: deckFor(['8A', '3A', '2B'], ['4B', '5B', '6B']) });
  h.autoPhase();
  assert.equal(h.seatOf('A').hole[h.seatOf('A').open], '3A', '8·3 중 낮은 3을 공개');
  assert.equal(h.seatOf('B').hole[h.seatOf('B').open], '4B');
  checkAround(h); checkAround(h);
  assert.equal(h.stage, 'pick');
  h.autoPhase();
  assert.equal(h.finished, true);
  assert.deepEqual(h.seatOf('A').pick.slice().sort(), ['3A', '8A'], '가장 좋은 두 장 (38광땡)');
  assert.deepEqual(h.result.winners, ['A']);
});

test('공개 없음 모드는 예전 그대로 (공개·고르기 단계 없음)', () => {
  const h = SeotdaHand.create({ players: players(), dealerIndex: 0, bb: 10, cards: 3, open: false, deck: deckFor(['1A', '3A', '2B'], ['4B', '5B', '6B']) });
  assert.equal(h.stage, 'betting');
  assert.ok(h.currentId);
  checkAround(h); checkAround(h);
  assert.equal(h.finished, true, '2차 베팅 뒤 바로 승부');
  assert.deepEqual(h.result.winners, ['A']);
});

test('방: 새 방은 한 장 공개가 기본 · 상대에게는 공개한 한 장만 · 봇은 알아서 · 공개 없음 방은 그대로', () => {
  let T = 1_000_000;
  const room = new Room({ code: 'SDOPEN', settings: sanitizeSettings({ game: 'seotda', cards: 3, startChips: 1000, sb: 10, bb: 10 }), now: () => T, pace: 0.001 });
  assert.equal(room.settings.sdOpen, 'one', '새 방 기본: 한 장 공개');
  const { player: A } = room.join({ name: 'A' }); room.connect(A.id); room.hostId = A.id;
  const { player: B } = room.join({ name: 'B' }); room.connect(B.id); B.ready = true;
  room.start(A.id);
  const h = room.hand;
  assert.equal(h.phase, 'open');
  const vB = () => room.viewFor(B.id);
  const aCards = () => vB().players.find((p) => p.id === A.id).cards;
  assert.deepEqual(aCards(), ['??', '??'], '공개 전: 상대 카드 모두 뒷면');
  assert.equal(vB().hand.phase.kind, 'open');
  assert.equal(vB().hand.phase.done, false);
  room.act(A.id, { type: 'open', index: 1 });
  const real = h.seatOf(A.id).hole;
  assert.deepEqual(aCards(), ['??', real[1]], '공개한 한 장만 보임');
  assert.ok(!JSON.stringify(vB()).includes(real[0]), '숨긴 카드는 상대에게 절대 안 감');
  // 시간 초과 → B 자동 공개 → 베팅 시작
  room.onPhaseTimeout();
  assert.equal(h.stage, 'betting');
  assert.ok(room.feed.some((e) => /한 장 공개/.test(e.text)));
  room.clearAllTimers();
  // 예전 방(설정에 값이 없음): 공개 없음
  const old = new Room({ code: 'SDOLD1', settings: { ...sanitizeSettings({ game: 'seotda', cards: 3 }), sdOpen: undefined }, now: () => T, pace: 0.001 });
  const { player: X } = old.join({ name: 'X' }); old.connect(X.id); old.hostId = X.id;
  const { player: Y } = old.join({ name: 'Y' }); old.connect(Y.id); Y.ready = true;
  old.start(X.id);
  assert.equal(old.hand.phase, null, '예전 방은 공개 단계 없음');
  old.clearAllTimers();
  // 봇: 공개·고르기 스스로
  const bots = new Room({ code: 'SDBOTS', settings: sanitizeSettings({ game: 'seotda', cards: 3 }), now: () => T, pace: 0.001 });
  const { player: H } = bots.join({ name: 'H' }); bots.connect(H.id); bots.hostId = H.id;
  bots.addBot(H.id);
  bots.start(H.id);
  const botId = bots.players.find((p) => p.isBot).id;
  bots.botPhase();
  assert.notEqual(bots.hand.seatOf(botId).open, null, '봇은 스스로 공개');
  bots.clearAllTimers();
});

test('스냅숏: 공개 단계 중에 저장·복구해도 이어서 진행', () => {
  const T = 1_000_000;
  const room = new Room({ code: 'SDSNAP', settings: sanitizeSettings({ game: 'seotda', cards: 3 }), now: () => T, pace: 0.001 });
  const { player: A } = room.join({ name: 'A' }); room.connect(A.id); room.hostId = A.id;
  const { player: B } = room.join({ name: 'B' }); room.connect(B.id); B.ready = true;
  room.start(A.id);
  room.act(A.id, { type: 'open', index: 0 });
  const obj = JSON.parse(JSON.stringify(room.serialize()));
  room.clearAllTimers();
  const r2 = Room.restore(obj, () => T);
  assert.equal(r2.hand.phase, 'open');
  assert.equal(r2.hand.seatOf(A.id).open, 0);
  r2.act(B.id, { type: 'open', index: 1 });
  assert.equal(r2.hand.stage, 'betting');
  r2.clearAllTimers();
});

test('소켓으로 보낸 공개(index)·두 장(cards)이 그대로 서버에 전달된다', async () => {
  const { createServer } = require('../server/index');
  const { io: connect } = require('socket.io-client');
  const srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  const port = await srv.listen();
  const s = connect(`http://127.0.0.1:${port}`, { transports: ['websocket'], forceNew: true });
  s.last = null; s.on('state', (v) => { s.last = v; });
  const call = (e, d) => new Promise((r) => s.emit(e, d || {}, r));
  const r = await call('room:practice', { name: '나', bots: 2, settings: { game: 'seotda', cards: 3, sdOpen: 'one' } });
  assert.equal(r.ok, true, r.message);
  const until = async (fn) => { for (let i = 0; i < 300; i++) { if (fn()) return; await new Promise((x) => setTimeout(x, 20)); } throw new Error('시간 초과'); };
  await until(() => s.last && s.last.hand && s.last.hand.phase && s.last.hand.phase.kind === 'open');
  const o = await call('game:act', { type: 'open', index: 1 });
  assert.equal(o.ok, true, o.message);
  const room = srv.rooms.get(r.code);
  assert.equal(room.hand.seatOf(r.playerId).open, 1);
  s.close(); await srv.close();
});
