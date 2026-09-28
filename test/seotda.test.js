'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SeotdaHand, rankSeotda, resolveShowdown } = require('../server/games/seotda');

const r = (a, b) => rankSeotda(a, b);

test('섯다 족보 순서: 38광땡 > 광땡 > 장땡 > 땡 > 알리 … 세륙 > 갑오 > 망통', () => {
  const order = [
    ['3A', '8A', '38광땡'], ['1A', '8A', '18광땡'], ['1A', '3A', '13광땡'], ['10A', '10B', '장땡'], ['9A', '9B', '9땡'],
    ['1A', '1B', '삥땡'], ['1B', '2A', '알리'], ['1B', '4B', '독사'], ['1B', '9B', '구삥'], ['1B', '10A', '장삥'],
    ['10B', '4B', '장사'], ['4B', '6A', '세륙'], ['2A', '7B', '갑오'], ['2B', '6B', '8끗'], ['2A', '8B', '망통'],
  ];
  for (const [a, b, name] of order) assert.equal(r(a, b).name, name, `${a}+${b}`);
  for (let i = 1; i < order.length; i++) {
    assert.ok(r(order[i - 1][0], order[i - 1][1]).rank > r(order[i][0], order[i][1]).rank, `${order[i - 1][2]} > ${order[i][2]}`);
  }
  // 광이 하나뿐이면 광땡이 아니다
  assert.equal(r('3A', '8B').name, '1끗');
});

test('땡잡이는 1~9땡을 잡고, 장땡은 못 잡는다', () => {
  let x = resolveShowdown({ a: ['3A', '7A'], b: ['9A', '9B'] });
  assert.ok(x.eff.a > x.eff.b);
  x = resolveShowdown({ a: ['3A', '7A'], b: ['10A', '10B'] });
  assert.ok(x.eff.a < x.eff.b);
  x = resolveShowdown({ a: ['3A', '7A'], b: ['2A', '5B'] }); // 땡이 없으면 망통
  assert.equal(x.eff.a, 700);
});

test('암행어사는 13·18광땡을 잡고, 38광땡은 못 잡는다', () => {
  assert.ok(resolveShowdown({ a: ['4A', '7A'], b: ['1A', '8A'] }).eff.a > 990);
  assert.ok(resolveShowdown({ a: ['4A', '7A'], b: ['3A', '8A'] }).eff.a < 1000);
});

test('구사: 상대가 알리 이하면 재경기, 멍텅구리구사: 9땡 이하면 재경기', () => {
  assert.equal(resolveShowdown({ a: ['4B', '9B'], b: ['1B', '2A'] }).redeal, '구사');
  assert.equal(resolveShowdown({ a: ['4B', '9B'], b: ['5A', '5B'] }).redeal, null);
  assert.equal(resolveShowdown({ a: ['4A', '9A'], b: ['5A', '5B'] }).redeal, '멍텅구리구사');
  assert.equal(resolveShowdown({ a: ['4A', '9A'], b: ['10A', '10B'] }).redeal, null);
});

test('한 판 진행: 판돈 → 두 장 → 베팅 한 바퀴 → 쇼다운, 칩 보존', () => {
  // 딜러 A, 카드는 B부터 한 장씩: B,C,A,B,C,A
  const deck = ['3A', '1B', '2B', '8A', '9A', '2A'];
  const h = SeotdaHand.create({ players: [{ id: 'A', stack: 1000 }, { id: 'B', stack: 1000 }, { id: 'C', stack: 1000 }], dealerIndex: 0, bb: 10, deck });
  assert.deepEqual(h.seatOf('B').hole, ['3A', '8A']);
  assert.equal(h.totalPot, 30);
  assert.equal(h.currentId, 'B');
  h.act('B', { type: 'bet', amount: 30 });
  h.act('C', { type: 'call' });
  h.act('A', { type: 'fold' });
  assert.equal(h.finished, true);
  assert.deepEqual(h.result.winners, ['B']);
  assert.equal(h.result.hands.B.name, '38광땡');
  const total = h.seats.reduce((a, s) => a + s.stack, 0);
  assert.equal(total, 3000);
});

test('재경기(구사): 팟이 다음 판으로 넘어가고 살아 있는 사람끼리 친다', () => {
  const deck = ['4B', '1B', '9B', '2A'];
  const h = SeotdaHand.create({ players: [{ id: 'A', stack: 500 }, { id: 'B', stack: 500 }], dealerIndex: 1, bb: 10, deck });
  // 딜러 B → A부터: A 4B, B 1B, A 9B, B 2A → A 구사, B 알리
  h.act('A', { type: 'check' });
  h.act('B', { type: 'check' });
  assert.equal(h.result.redeal, '구사');
  assert.equal(h.result.carry.amount, 20);
  const h2 = SeotdaHand.create({ players: h.seats.map((s) => ({ id: s.id, stack: s.stack })), dealerIndex: 0, bb: 10, carry: h.result.carry });
  assert.equal(h2.totalPot, 20); // 새 판돈 없이 이월분만
  while (!h2.finished) h2.autoAct(h2.currentId);
  const total = h2.seats.reduce((a, s) => a + s.stack, 0) + (h2.result.carry ? h2.result.carry.amount : 0);
  assert.equal(total, 1000);
});

test('무작위 1000판: 칩 총량 보존', () => {
  for (let i = 0; i < 1000; i++) {
    const n = 2 + (i % 5);
    const h = SeotdaHand.create({ players: Array.from({ length: n }, (_, k) => ({ id: 'p' + k, stack: 50 + ((i * 37 + k * 11) % 300) })), dealerIndex: i % n, bb: 10 });
    let guard = 0;
    while (!h.finished && guard++ < 100) {
      const la = h.legalActions(h.currentId);
      const x = Math.random();
      if (x < 0.2 && la.canFold) h.act(h.currentId, { type: 'fold' });
      else if (x < 0.4 && (la.canBet || la.canRaise)) h.act(h.currentId, { type: la.canBet ? 'bet' : 'raise', amount: la.minTo });
      else if (x < 0.45 && la.canAllIn) h.act(h.currentId, { type: 'allin' });
      else h.act(h.currentId, { type: la.canCheck ? 'check' : 'call' });
    }
    const start = h.seats.reduce((a, s) => a + s.startStack, 0);
    const end = h.seats.reduce((a, s) => a + s.stack, 0) + (h.result.carry ? h.result.carry.amount : 0);
    assert.equal(end, start, `판 ${i}`);
  }
});
