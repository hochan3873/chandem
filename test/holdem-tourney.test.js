'use strict';
// 친구들 토너먼트 점검에서 나온 문제들 (2026-10)
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hand } = require('../server/engine/hand');
const { Room, sanitizeSettings } = require('../server/room');

test('BB가 블라인드보다 적게 올인하고 SB가 폴드하면: BB는 자기가 낸 만큼만 더 받는다', () => {
  // 헤즈업: A(버튼=SB 10) · B(BB, 칩 5)
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 5 }], dealerIndex: 0, sb: 10, bb: 20 });
  const la = h.legalActions('A');
  assert.equal(la.canRaise, false, '받을 사람이 없으니 레이즈 버튼은 없다');
  h.act('A', { type: 'fold' });
  assert.equal(h.result.deltas.B, 5);
  assert.equal(h.result.deltas.A, -5);
  assert.equal(h.seats[0].stack + h.seats[1].stack, 1005);
});

test('짧은 올인을 콜하고 쇼다운: 칩 총량 보존 · 남는 베팅은 돌려받음', () => {
  for (let k = 0; k < 300; k++) {
    const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 7 }, { id: 'C', stack: 300 }], dealerIndex: k % 3, sb: 10, bb: 20 });
    let guard = 0;
    while (!h.finished && guard++ < 50) {
      const id = h.currentId; const la = h.legalActions(id);
      if (la.canRaise && k % 2) h.act(id, { type: 'allin' }); else if (la.canCall) h.act(id, { type: 'call' }); else h.act(id, { type: 'check' });
    }
    const total = h.seats.reduce((a, s) => a + s.stack, 0);
    assert.equal(total, 1307);
    const sum = Object.values(h.result.deltas).reduce((a, b) => a + b, 0);
    assert.equal(sum, 0);
  }
});

function tourney() {
  let T = 1_000_000;
  const room = new Room({ code: 'TOURNY', settings: sanitizeSettings({ mode: 'tournament', levelMinutes: 1, sb: 10, bb: 20, startChips: 1000 }), now: () => T, pace: 0.001 });
  const ps = ['A', 'B', 'C', 'D'].map((name) => { const { player } = room.join({ name }); room.connect(player.id); player.ready = true; return player; });
  room.hostId = ps[0].id;
  room.start(ps[0].id);
  return { room, ps, tick: (ms) => { T += ms; } };
}

test('토너먼트: 관전 누르면 자리 비움(칩 유지) · 나가면 기권으로 순위에 남는다', () => {
  const { room, ps: [A, B, C, D] } = tourney();
  const r = room.setRole(B.id, true);
  assert.equal(r.sittingOut, true);
  assert.equal(B.role, 'player');
  assert.ok(B.stack > 0);
  room.leave(D.id);
  room.hand.finished = true; room.startHand();
  C.stack = 0; room.hand.finished = true; room.startHand();
  B.stack = 0; room.hand.finished = true; room.startHand();
  assert.equal(room.phase, 'lobby');
  assert.deepEqual(room.tourney.result.ranking.map((x) => x.name), ['A', 'B', 'C', 'D']);
  room.clearAllTimers();
});

test('토너먼트: 같은 판에 둘이 떨어지면 그 판 시작 칩이 많던 사람이 더 높은 순위', () => {
  const { room, ps: [A, B, C, D] } = tourney();
  room.hand.finished = true;
  room.hand.seats.find((s) => s.id === B.id).startStack = 200;
  room.hand.seats.find((s) => s.id === C.id).startStack = 900;
  B.stack = 0; C.stack = 0;
  room.startHand();
  assert.deepEqual(room.tourney.busted.map((id) => room.tourney.names[id]), ['B', 'C']);
  void A; void D;
  room.clearAllTimers();
});

test('토너먼트 멈춤: 판을 안 돌리고 블라인드 시계도 멈춘다', () => {
  const { room, ps: [A], tick } = tourney();
  room.setPause(A.id, true);
  room.hand.finished = true; room.startHand();
  assert.equal(room.hand, null);
  tick(5 * 60_000); // 5분 쉬는 동안
  room.setPause(A.id, false);
  room.startHand();
  assert.equal(room.tourney.level, 0, '쉬는 시간은 레벨 시계에 안 들어간다');
  assert.equal(room.hand.bb, 20);
  assert.throws(() => room.setPause(room.players[1].id, true));
  room.clearAllTimers();
});

test('BB 앤티: 팟에 들어가고 칩 총량은 그대로', () => {
  for (let k = 0; k < 200; k++) {
    const h = new Hand({ players: [{ id: 'A', stack: 500 }, { id: 'B', stack: 25 }, { id: 'C', stack: 300 }], dealerIndex: k % 3, sb: 10, bb: 20, ante: 20 });
    let g = 0;
    while (!h.finished && g++ < 50) { const id = h.currentId; const la = h.legalActions(id); h.act(id, la.canCheck ? { type: 'check' } : k % 3 === 0 && la.canFold ? { type: 'fold' } : { type: 'call' }); }
    assert.equal(h.seats.reduce((a, s) => a + s.stack, 0), 825);
  }
});

test('자동 블라인드 표: SB:BB 비율 유지 · 계속 오름 · 5/10 다음이 5/15 같은 어색한 값 없음', () => {
  const room = new Room({ code: 'BLINDS', settings: sanitizeSettings({ mode: 'tournament', sb: 5, bb: 10, startChips: 1000 }) });
  const { levelBlinds } = require('../server/room');
  let prev = 0;
  for (let i = 0; i < 20; i++) {
    const b = (levelBlinds || ((s, l) => { room.tourney = { level: l }; return room.blinds(); }))(room.settings, i);
    assert.equal(b.bb, b.sb * 2, `레벨 ${i + 1}: ${b.sb}/${b.bb}`);
    assert.ok(b.bb > prev);
    prev = b.bb;
  }
});

test('블라인드 표 직접 입력', () => {
  const s = sanitizeSettings({ mode: 'tournament', startChips: 1000, blindLevels: '10/20, 15/30, 25/50' });
  assert.deepEqual(s.blindLevels, [[10, 20], [15, 30], [25, 50]]);
  assert.equal(s.bb, 20);
  assert.throws(() => sanitizeSettings({ blindLevels: '10/20, 5/10' }));
});

test('토너먼트 리바이·늦은 참가: 정한 레벨까지만', () => {
  let T = 1_000_000;
  const room = new Room({ code: 'REENTR', settings: sanitizeSettings({ mode: 'tournament', levelMinutes: 1, startChips: 1000, reentryLevels: 2 }), now: () => T, pace: 0.001 });
  const ps = ['A', 'B'].map((name) => { const { player } = room.join({ name }); room.connect(player.id); player.ready = true; return player; });
  room.hostId = ps[0].id;
  room.start(ps[0].id);
  const { player: L } = room.join({ name: 'Late' }); room.connect(L.id);
  assert.equal(L.role, 'player', '레벨 1이면 늦은 참가 가능');
  assert.equal(L.totalBuyIn, 1000);
  assert.equal(room.tourney.entrants, 3);
  // 다 잃으면 리바이
  room.hand.finished = true; ps[1].stack = 0;
  assert.equal(room.canRebuy(ps[1]), true);
  room.rebuy(ps[1].id);
  room.startHand();
  assert.equal(room.effectiveStack(ps[1]), 1000, '리바이 칩 1000 (블라인드로 낸 것 포함)');
  // 레벨 3부터는 마감
  T += 2 * 61_000; room.hand.finished = true; room.startHand();
  const { player: L2 } = room.join({ name: 'Late2' });
  assert.equal(L2.role, 'spectator');
  room.clearAllTimers();
});

test('채팅 · 타임뱅크 · 진 패 덮기', () => {
  let T = 1_000_000;
  const room = new Room({ code: 'CHATTB', settings: sanitizeSettings({ startChips: 1000, timeBank: 30, turnSeconds: 20 }), now: () => T, pace: 0.001 });
  const ps = ['A', 'B'].map((name) => { const { player } = room.join({ name }); room.connect(player.id); player.ready = true; return player; });
  room.hostId = ps[0].id;
  room.say(ps[0].id, '  안녕   하세요 ');
  assert.equal(room.chat[0].text, '안녕 하세요');
  assert.throws(() => room.say(ps[0].id, '또'), /천천히/);
  room.start(ps[0].id);
  const cur = room.get(room.hand.currentId);
  room.onTurnTimeout(); // 턴 시간 끝 → 타임뱅크
  assert.equal(room.hand.finished, false);
  assert.equal(room.bankUse.id, cur.id);
  T += 10_000;
  room.act(cur.id, { type: 'call' });
  assert.ok(cur.bank <= 20 && cur.bank >= 19, `남은 타임뱅크 ${cur.bank}`);
  room.clearAllTimers();
});
