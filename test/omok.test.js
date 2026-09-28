'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { OmokGame, omokAI, SIZE, IllegalMove, checkWin, isForbidden } = require('../server/games/omok');

const newGame = () => new OmokGame({ players: [{ id: 'B', stack: 1000 }, { id: 'W', stack: 1000 }], dealerIndex: 0, sb: 5, bb: 10 });

// stones: { b: [[x,y],...], w: [[x,y],...] } 로 판을 직접 만든다. turn: 'b'|'w'
function setup(stones, turn = 'b') {
  const g = newGame();
  const arr = g.cells.split('');
  for (const c of ['b', 'w']) for (const [x, y] of stones[c] || []) arr[y * SIZE + x] = c;
  g.cells = arr.join('');
  g.toAct = turn === 'b' ? 0 : 1;
  return g;
}
const place = (g, id, x, y) => g.act(id, { type: 'place', x, y });
const row = (y, xs) => xs.map((x) => [x, y]);
const col = (x, ys) => ys.map((y) => [x, y]);

test('오목: 가로·세로·대각선 다섯 줄이면 이긴다', () => {
  const shapes = [
    { b: row(7, [3, 4, 5, 6]), last: [7, 7] },
    { b: col(2, [0, 1, 2, 3]), last: [2, 4] },
    { b: [[1, 1], [2, 2], [3, 3], [4, 4]], last: [5, 5] },
    { b: [[10, 2], [9, 3], [8, 4], [7, 5]], last: [6, 6] },
  ];
  for (const s of shapes) {
    const g = setup({ b: s.b, w: [[14, 14], [13, 14], [12, 14], [11, 13]] });
    place(g, 'B', ...s.last);
    assert.equal(g.finished, true);
    assert.equal(g.result.type, 'omok');
    assert.equal(g.result.reason, 'five');
    assert.deepEqual(g.result.winners, ['B']);
    assert.equal(g.result.winLine.length, 5);
    assert.equal(g.currentId, null);
    assert.deepEqual(g.result.deltas, { B: 0, W: 0 });
    assert.equal(g.log.at(-1).type, 'end');
  }
});

test('오목: 흑 장목(6개)은 승리가 아니지만 백 장목은 승리', () => {
  const g = setup({ b: row(7, [2, 3, 4, 6, 7]), w: [[0, 0], [0, 1]] });
  place(g, 'B', 5, 7);
  assert.equal(g.finished, false);
  assert.equal(g.currentId, 'W');
  assert.equal(checkWin(g.cells, 5, 7), null);

  const h = setup({ w: row(7, [2, 3, 4, 6, 7]), b: [[0, 0], [0, 1], [0, 2]] }, 'w');
  place(h, 'W', 5, 7);
  assert.equal(h.finished, true);
  assert.deepEqual(h.result.winners, ['W']);
  assert.equal(h.result.winLine.length, 6);
});

test('오목: 흑 삼삼은 금지, 같은 모양이라도 백은 둘 수 있다', () => {
  const shape = [[6, 7], [7, 7], [8, 5], [8, 6]];
  const g = setup({ b: shape, w: [[0, 0], [14, 14], [0, 14], [14, 0]] });
  assert.equal(isForbidden(g.cells, 8, 7), true);
  assert.throws(() => place(g, 'B', 8, 7), (e) => e instanceof IllegalMove && e.message === '흑은 삼삼(3-3) 자리에 둘 수 없어요');
  assert.equal(g.currentId, 'B');

  const h = setup({ w: shape, b: [[0, 0], [14, 14], [0, 14], [14, 0], [1, 1]] }, 'w');
  place(h, 'W', 8, 7);
  assert.equal(h.cells[7 * SIZE + 8], 'w');
});

test('오목: 떨어진 삼(.XX.X.)도 열린 삼으로 치고, 막힌 삼은 아니다', () => {
  // 가로 .XX.X. + 세로 열린 삼
  const g = setup({ b: [[5, 7], [6, 7], [8, 5], [8, 6]], w: [] });
  assert.equal(isForbidden(g.cells, 8, 7), true);
  // 가로 한쪽이 백으로 막힌 삼 + 세로 열린 삼 → 금수 아님
  const h = setup({ b: [[6, 7], [7, 7], [8, 5], [8, 6]], w: [[5, 7]] });
  assert.equal(isForbidden(h.cells, 8, 7), false);
  // 삼 하나뿐이면 금수 아님
  const k = setup({ b: [[6, 7], [7, 7]], w: [] });
  assert.equal(isForbidden(k.cells, 8, 7), false);
});

test('오목: 오목이 되는 수는 삼삼이 함께 생겨도 둘 수 있다', () => {
  const stones = { b: [...row(7, [3, 4, 5, 6]), [7, 5], [7, 6], [5, 5], [6, 6]], w: [[0, 0], [14, 14], [0, 14], [14, 0], [1, 1], [2, 1], [3, 1], [13, 13]] };
  // 오목 줄이 없다면 금수인 자리인지 먼저 확인
  const noFive = setup({ b: stones.b.filter(([x, y]) => !(y === 7 && x === 3)), w: [...stones.w, [3, 7]] });
  assert.equal(isForbidden(noFive.cells, 7, 7), true);
  const g = setup(stones);
  assert.equal(isForbidden(g.cells, 7, 7), false);
  place(g, 'B', 7, 7);
  assert.equal(g.finished, true);
  assert.deepEqual(g.result.winners, ['B']);
});

test('오목: 차례·판 밖·빈칸 규칙을 지킨다', () => {
  const g = newGame();
  assert.equal(g.kind, 'omok');
  assert.deepEqual(g.orderFromButton(), ['B', 'W']);
  assert.equal(g.seatOf('B').color, 'b');
  assert.equal(g.currentId, 'B');
  assert.equal(g.legalActions('W'), null);
  assert.equal(g.legalActions('B').omok, true);
  assert.throws(() => place(g, 'W', 7, 7), (e) => e instanceof IllegalMove && e.message === '지금은 내 차례가 아니에요');
  assert.throws(() => place(g, 'B', 15, 0), (e) => e instanceof IllegalMove && e.message === '판 밖이에요');
  place(g, 'B', 7, 7);
  assert.equal(g.currentId, 'W');
  assert.throws(() => place(g, 'W', 7, 7), (e) => e instanceof IllegalMove && e.message === '이미 돌이 있는 자리예요');
  place(g, 'W', 7, 8);
  assert.deepEqual(g.lastMove, { x: 7, y: 8 });
  assert.equal(g.moves.length, 2);
  assert.deepEqual(g.log.map((l) => l.type), ['place', 'place']);
  assert.equal(g.totalPot, 0);
  assert.deepEqual(g.potsView(), []);
  assert.deepEqual(g.board, []);
});

test('오목: 기권·강제 퇴장은 상대 승리', () => {
  const g = newGame();
  g.act('B', { type: 'resign' });
  assert.equal(g.finished, true);
  assert.deepEqual(g.result.winners, ['W']);
  assert.equal(g.result.reason, 'resign');

  const h = newGame();
  place(h, 'B', 7, 7);
  h.forceFold('B'); // 차례가 아니어도 즉시 패배
  assert.deepEqual(h.result.winners, ['W']);
  assert.equal(h.live.length, 1);

  const k = newGame();
  k.act('B', { type: 'fold' });
  assert.deepEqual(k.result.winners, ['W']);
});

test('오목: 판이 가득 차면 무승부', () => {
  const g = newGame();
  // 오목이 없는 무늬로 224칸을 채우고 마지막 한 칸만 남긴다
  const arr = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) arr.push(((x >> 1) + y) % 2 === 0 ? 'b' : 'w');
  const last = arr[224];
  arr[224] = '.';
  g.cells = arr.join('');
  g.moves = new Array(224).fill({});
  g.toAct = last === 'b' ? 0 : 1;
  place(g, last === 'b' ? 'B' : 'W', 14, 14);
  assert.equal(g.finished, true);
  assert.equal(g.result.type, 'draw');
  assert.deepEqual(g.result.winners, ['B', 'W']);
});

test('AI: 바로 이길 수 있으면 이긴다 (모든 난이도)', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    const g = setup({ w: row(3, [4, 5, 6, 7]), b: row(10, [4, 5, 6]).concat([[3, 3]]) }, 'w');
    const m = omokAI.bestMove(g.cells, 'w', level);
    assert.deepEqual(m, { x: 8, y: 3 }, level);
  }
});

test('AI: 상대의 사(4)와 열린 삼을 막는다', () => {
  for (const level of ['easy', 'normal', 'hard']) {
    // 백의 막힌 사 → 남은 한 칸을 막아야 한다
    const g = setup({ w: row(5, [4, 5, 6, 7]), b: [[3, 5], [10, 10], [11, 11]] }, 'b');
    assert.deepEqual(omokAI.bestMove(g.cells, 'b', level), { x: 8, y: 5 }, level);
  }
  for (const level of ['normal', 'hard']) {
    // 백의 열린 삼 → 열린 사가 되기 전에 끝을 막는다
    const g = setup({ w: row(7, [5, 6, 7]), b: [[10, 11], [3, 12]] }, 'b');
    const m = omokAI.bestMove(g.cells, 'b', level);
    assert.ok([4, 8].includes(m.x) && m.y === 7, `${level}: ${JSON.stringify(m)}`);
  }
});

test('AI: 흑일 때 삼삼 자리는 절대 두지 않는다', () => {
  const g = setup({ b: [[6, 7], [7, 7], [8, 5], [8, 6]], w: [[0, 0], [14, 14], [0, 14], [14, 0]] });
  for (const level of ['easy', 'normal', 'hard']) {
    for (let t = 0; t < 5; t++) {
      const m = omokAI.bestMove(g.cells, 'b', level);
      assert.equal(isForbidden(g.cells, m.x, m.y), false, `${level}: ${JSON.stringify(m)}`);
    }
  }
});

test('AI: 보통 vs 어려움 대국이 225수 안에 정상 종료된다', () => {
  for (const [lb, lw] of [['normal', 'hard'], ['hard', 'normal']]) {
    const g = newGame();
    const t0 = Date.now();
    while (!g.finished) {
      const id = g.currentId;
      const color = g.seatOf(id).color;
      const m = omokAI.bestMove(g.cells, color, color === 'b' ? lb : lw);
      if (color === 'b') assert.equal(isForbidden(g.cells, m.x, m.y), false);
      place(g, id, m.x, m.y);
      assert.ok(g.moves.length <= 225);
    }
    const ms = Date.now() - t0;
    assert.ok(['omok', 'draw'].includes(g.result.type));
    assert.ok(g.result.reason === 'five' ? g.result.winLine.length >= 5 : g.result.reason === 'draw');
    assert.ok(ms < 20000, `너무 느림: ${ms}ms`);
  }
});

test('오목: autoAct 는 대신 한 수를 둔다', () => {
  const g = newGame();
  assert.equal(g.autoAct('W'), null);
  assert.equal(g.autoAct('B'), 'place');
  assert.deepEqual(g.lastMove, { x: 7, y: 7 });
  assert.equal(g.currentId, 'W');
});

test('오목: toJSON/fromJSON 후에도 이어서 둘 수 있다', () => {
  const g = newGame();
  place(g, 'B', 7, 7);
  place(g, 'W', 8, 8);
  const json = JSON.parse(JSON.stringify(g));
  assert.equal(json.kind, 'omok');
  const r = OmokGame.fromJSON(json);
  assert.ok(r instanceof OmokGame);
  assert.equal(r.currentId, 'B');
  assert.equal(r.cells, g.cells);
  place(r, 'B', 7, 6);
  assert.equal(r.moves.length, 3);
  assert.equal(r.currentId, 'W');
});
