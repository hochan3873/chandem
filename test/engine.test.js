'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { bestHand, compareScore, newDeck } = require('../server/engine/cards');
const { buildPots, distribute } = require('../server/engine/pots');
const { Hand } = require('../server/engine/hand');

const best = (s) => bestHand(s.split(' '));
const cmp = (a, b) => compareScore(best(a).score, best(b).score);

// 딜 순서에 맞춰 덱을 만든다. holes: 스몰 블라인드부터 시계방향 [[c1,c2],...]
function rigDeck(holes, board) {
  const used = new Set([...holes.flat(), ...board]);
  const rest = newDeck().filter((c) => !used.has(c));
  const burn = () => rest.shift();
  const d = [];
  for (const h of holes) d.push(h[0]);
  for (const h of holes) d.push(h[1]);
  d.push(burn(), board[0], board[1], board[2], burn(), board[3], burn(), board[4]);
  return d.concat(rest);
}

test('족보: 각 카테고리를 올바르게 판정한다', () => {
  assert.equal(best('As Ks Qs Js Ts 2d 3c').name, '로열 플러시');
  assert.equal(best('9h 8h 7h 6h 5h Ad Ac').name, '9 하이 스트레이트 플러시');
  assert.equal(best('7c 7d 7h 7s Kd 2c 3c').name, '7 포카드');
  assert.equal(best('Kc Kd Kh 4s 4d 2c 3h').name, '풀 하우스 (K 트리플 + 4 페어)');
  assert.equal(best('2h 9h Jh Kh 5h As Ad').name, 'K 하이 플러시');
  assert.equal(best('5c 6d 7h 8s 9d Kc Kd').name, '9 하이 스트레이트');
  assert.equal(best('Qc Qd Qh 2s 9d 4c 7d').name, 'Q 트리플');
  assert.equal(best('Jc Jd 4h 4s 9d 2c 7d').name, '투 페어 (J, 4)');
  assert.equal(best('Tc Td 4h 3s 9d 2c 7d').name, '10 원 페어');
  assert.equal(best('Ac Qd 4h 3s 9d 2c 7d').name, 'A 하이 카드');
});

test('족보: A-2-3-4-5 휠 스트레이트는 가장 낮은 스트레이트', () => {
  const wheel = best('Ac 2d 3h 4s 5d Kc Qd');
  assert.equal(wheel.name, '5 하이 스트레이트');
  assert.ok(cmp('Ac 2d 3h 4s 5d Kc Qd', '2c 3d 4h 5s 6d Kc Qd') < 0);
  assert.deepEqual(wheel.cards.map((c) => c[0]), ['5', '4', '3', '2', 'A']);
});

test('족보: 7장 중 최선의 5장을 고른다', () => {
  // 보드 플러시 + 손패 풀하우스 → 풀하우스가 이긴다
  const b = best('Kh Kd Ks 2s 2h 9s 5s');
  assert.equal(b.score.category, 6);
  assert.equal(b.cards.length, 5);
  // 스트레이트 6장 중 가장 높은 5장
  assert.equal(best('4c 5d 6h 7s 8d 9c 2h').name, '9 하이 스트레이트');
});

test('동률·키커: 같은 페어면 키커로 승부, 완전히 같으면 무승부', () => {
  assert.ok(cmp('Ac Ad Kh 7s 5d 3c 2h', 'As Ah Qh 7c 5s 3d 2d') > 0); // K 키커 승
  assert.equal(cmp('Ac Ad Kh 7s 5d 3c 2h', 'As Ah Kd 7c 5s 3d 2d'), 0); // 완전 동률
  assert.ok(cmp('Jc Jd 4h 4s Ad', 'Js Jh 4c 4d Kd') > 0); // 투페어 키커
  assert.ok(cmp('Kc Kd Kh 2s 2d', 'Qc Qd Qh As Ad') > 0); // 풀하우스는 트리플 먼저
  assert.ok(cmp('Ah Jh 9h 6h 3h', 'Ad Jd 9d 6d 2d') > 0); // 플러시 다섯째 카드까지 비교
});

test('사이드 팟: 서로 다른 금액으로 올인한 3명 + 폴드한 1명', () => {
  const pots = buildPots([
    { id: 'A', contributed: 100, folded: false },
    { id: 'B', contributed: 300, folded: false },
    { id: 'C', contributed: 500, folded: false },
    { id: 'D', contributed: 50, folded: true },
  ]);
  assert.deepEqual(pots, [
    { amount: 350, eligible: ['A', 'B', 'C'] }, // 50*4 + 50*3
    { amount: 400, eligible: ['B', 'C'] },
    { amount: 200, eligible: ['C'] }, // 아무도 받지 않은 금액은 C에게 돌아감
  ]);
});

test('팟 분배: 나누어떨어지지 않는 칩은 버튼 왼쪽부터 1개씩', () => {
  const pots = [{ amount: 101, eligible: ['A', 'B'] }];
  const { payouts } = distribute(pots, () => 1, () => 0, ['B', 'A']);
  assert.deepEqual(payouts, { B: 51, A: 50 });
});

test('헤드업: 딜러가 스몰 블라인드이고 프리플랍 먼저, 플랍 이후엔 나중에 행동', () => {
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }], dealerIndex: 0, sb: 5, bb: 10 });
  assert.equal(h.seatOf('A').bet, 5);
  assert.equal(h.seatOf('B').bet, 10);
  assert.equal(h.currentId, 'A');
  h.act('A', { type: 'call' });
  assert.equal(h.currentId, 'B'); // 빅 블라인드 옵션
  assert.equal(h.legalActions('B').canCheck, true);
  h.act('B', { type: 'check' });
  assert.equal(h.stage, 'flop');
  assert.equal(h.board.length, 3);
  assert.equal(h.currentId, 'B'); // 플랍 이후엔 딜러가 아닌 쪽이 먼저
});

test('모두 폴드하면 남은 사람이 즉시 팟을 가져간다', () => {
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }, { id: 'C', stack: 1000 }], dealerIndex: 0, sb: 5, bb: 10 });
  assert.equal(h.currentId, 'A'); // 3인: 빅 블라인드(C) 다음 = 딜러 A
  h.act('A', { type: 'fold' });
  h.act('B', { type: 'fold' });
  assert.equal(h.finished, true);
  assert.equal(h.result.type, 'fold');
  assert.deepEqual(h.result.winners, ['C']);
  assert.deepEqual(h.result.deltas, { A: 0, B: -5, C: 5 });
  assert.equal(h.board.length, 0);
});

test('최소 레이즈: 직전 레이즈 폭 이상이어야 한다', () => {
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }, { id: 'C', stack: 1000 }], dealerIndex: 0, sb: 5, bb: 10 });
  let la = h.legalActions('A');
  assert.equal(la.minTo, 20);
  assert.throws(() => h.act('A', { type: 'raise', amount: 15 }), /최소 20/);
  h.act('A', { type: 'raise', amount: 50 }); // 40 레이즈
  la = h.legalActions('B');
  assert.equal(la.toCall, 45);
  assert.equal(la.minTo, 90); // 50 + 40
  h.act('B', { type: 'raise', amount: 90 });
  assert.equal(h.legalActions('C').minTo, 130);
});

test('불완전한 올인 레이즈는 이미 행동한 사람에게 레이즈를 다시 열어주지 않는다', () => {
  // A(딜러) 1000, B(SB) 1000, C(BB) 130
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }, { id: 'C', stack: 130 }], dealerIndex: 0, sb: 5, bb: 10 });
  h.act('A', { type: 'raise', amount: 100 }); // 90 레이즈
  h.act('B', { type: 'call' });
  h.act('C', { type: 'allin' }); // 130: 30만 더 올림(최소 90 미달)
  const la = h.legalActions('A');
  assert.equal(la.toCall, 30);
  assert.equal(la.canRaise, false);
  assert.equal(la.canCall, true);
  assert.throws(() => h.act('A', { type: 'raise', amount: 300 }), /레이즈할 수 없습니다/);
  h.act('A', { type: 'call' });
  assert.equal(h.legalActions('B').canRaise, false);
  h.act('B', { type: 'call' });
  assert.equal(h.stage, 'flop');
});

test('칩이 부족한 콜은 올인이 되고, 사이드 팟이 정확히 나뉜다', () => {
  // 순서: 딜러 A, SB B, BB C. 홀카드는 SB(B)부터 배분
  const deck = rigDeck(
    [['Kd', 'Kc'], ['Qd', 'Qc'], ['Ah', 'Ad']], // B, C, A
    ['2s', '7h', '9c', '3d', '8s'],
  );
  const h = new Hand({ players: [{ id: 'A', stack: 50 }, { id: 'B', stack: 500 }, { id: 'C', stack: 500 }], dealerIndex: 0, sb: 5, bb: 10, deck });
  h.act('A', { type: 'allin' }); // 50
  h.act('B', { type: 'raise', amount: 200 });
  h.act('C', { type: 'call' });
  // 플랍부터 B, C 체크로 끝까지
  while (!h.finished) h.act(h.currentId, { type: 'check' });
  const r = h.result;
  assert.equal(r.type, 'showdown');
  // 메인 팟 150 → A(AA), 사이드 팟 300 → B(KK)
  assert.deepEqual(r.potResults.map((p) => [p.amount, p.winners]), [[150, ['A']], [300, ['B']]]);
  assert.equal(h.seatOf('A').stack, 150);
  assert.equal(h.seatOf('B').stack, 600);
  assert.equal(h.seatOf('C').stack, 300);
  assert.equal(r.hands.A.name, 'A 원 페어');
  assert.equal(r.deltas.A + r.deltas.B + r.deltas.C, 0);
});

test('여러 명 올인 후에는 남은 카드를 모두 깔고 쇼다운한다', () => {
  const deck = rigDeck([['2c', '7d'], ['9h', '9s'], ['Ah', 'Kh']], ['Qh', 'Jh', '3c', '4d', 'Th']);
  const h = new Hand({ players: [{ id: 'A', stack: 300 }, { id: 'B', stack: 200 }, { id: 'C', stack: 100 }], dealerIndex: 0, sb: 5, bb: 10, deck });
  h.act('A', { type: 'allin' });
  h.act('B', { type: 'allin' });
  h.act('C', { type: 'allin' });
  assert.equal(h.finished, true);
  assert.equal(h.board.length, 5);
  assert.equal(h.result.hands.A.name, '로열 플러시');
  // A가 모두 가져가고 남은 100은 A에게 돌려줌
  assert.equal(h.seatOf('A').stack, 600);
});

test('완전 동률이면 팟을 나눈다', () => {
  const deck = rigDeck([['2c', '3d'], ['2h', '3s']], ['Ah', 'Kh', 'Qc', 'Jd', 'Ts']);
  const h = new Hand({ players: [{ id: 'A', stack: 100 }, { id: 'B', stack: 100 }], dealerIndex: 0, sb: 5, bb: 10, deck });
  h.act('A', { type: 'call' });
  while (!h.finished) h.act(h.currentId, { type: 'check' });
  assert.deepEqual(h.result.winners.sort(), ['A', 'B']);
  assert.equal(h.seatOf('A').stack, 100);
  assert.equal(h.seatOf('B').stack, 100);
});

test('빅 블라인드가 블라인드보다 적은 칩으로 올인해도 진행된다', () => {
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }, { id: 'C', stack: 4 }], dealerIndex: 0, sb: 5, bb: 10 });
  assert.equal(h.seatOf('C').allIn, true);
  assert.equal(h.legalActions('A').toCall, 10);
  h.act('A', { type: 'call' });
  h.act('B', { type: 'call' });
  assert.equal(h.stage, 'flop');
  while (!h.finished) h.act(h.currentId, { type: 'check' });
  const total = h.seats.reduce((a, s) => a + s.stack, 0);
  assert.equal(total, 2004); // 칩 총량 보존
});

test('체크할 수 있을 때는 폴드 버튼이 막히고, 시간 초과 시 체크한다', () => {
  const h = new Hand({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }], dealerIndex: 0, sb: 5, bb: 10 });
  h.act('A', { type: 'call' });
  assert.throws(() => h.act('B', { type: 'fold' }), /체크할 수 있을 때/);
  assert.equal(h.autoAct('B'), 'check');
  assert.equal(h.stage, 'flop');
});

test('무작위 시뮬레이션: 칩 총량은 항상 보존된다', () => {
  for (let t = 0; t < 300; t++) {
    const n = 2 + (t % 8);
    const players = Array.from({ length: n }, (_, i) => ({ id: 'P' + i, stack: 20 + ((t * 37 + i * 91) % 400) }));
    const total = players.reduce((a, p) => a + p.stack, 0);
    const h = new Hand({ players, dealerIndex: t % n, sb: 5, bb: 10 });
    let guard = 0;
    while (!h.finished && guard++ < 500) {
      const id = h.currentId;
      const la = h.legalActions(id);
      const r = (t * 13 + guard * 7) % 10;
      if (r < 2 && la.canFold) h.act(id, { type: 'fold' });
      else if (r < 4 && (la.canRaise || la.canBet)) h.act(id, { type: la.canBet ? 'bet' : 'raise', amount: la.minTo });
      else if (r < 5 && la.canAllIn) h.act(id, { type: 'allin' });
      else if (la.canCheck) h.act(id, { type: 'check' });
      else h.act(id, { type: 'call' });
    }
    assert.equal(h.finished, true, '판이 끝나야 합니다');
    assert.equal(h.seats.reduce((a, s) => a + s.stack, 0), total);
    assert.equal(Object.values(h.result.deltas).reduce((a, b) => a + b, 0), 0);
  }
});
