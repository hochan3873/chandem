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

// ---------- 강화 AI 시험 ----------

// 판 문자열에 돌 하나를 놓은 새 문자열
const put = (cells, p, c) => cells.slice(0, p) + c + cells.slice(p + 1);
const other = (c) => (c === 'b' ? 'w' : 'b');
const inside = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
// 돌 주변 2칸 안의 빈칸
function nearEmpty(cells) {
  const out = [];
  for (let p = 0; p < SIZE * SIZE; p++) {
    if (cells[p] !== '.') continue;
    const x = p % SIZE; const y = (p - x) / SIZE;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) {
      for (let dx = -2; dx <= 2 && !near; dx++) {
        if (inside(x + dx, y + dy) && cells[(y + dy) * SIZE + x + dx] !== '.') near = true;
      }
    }
    if (near) out.push(p);
  }
  return out;
}
// c가 두면 바로 오목이 되는 빈칸들 (m이 주어지면 m을 지나는 줄만 본다)
function fivePointsOf(cells, c, m) {
  let list;
  if (m === undefined) list = nearEmpty(cells);
  else {
    list = [];
    const mx = m % SIZE; const my = (m - mx) / SIZE;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      for (let k = -4; k <= 4; k++) {
        const x = mx + dx * k; const y = my + dy * k;
        if (k && inside(x, y) && cells[y * SIZE + x] === '.') list.push(y * SIZE + x);
      }
    }
  }
  return list.filter((p) => checkWin(cells, p % SIZE, (p / SIZE) | 0, c));
}
/** AI 엔진과 독립적인 느린 VCF 판정: a 차례에 사만 연달아 두어 depth 수 안에 이길 수 있나 */
function bruteVcf(cells, a, depth) {
  if (fivePointsOf(cells, a).length) return true;
  if (depth <= 0) return false;
  const d = other(a);
  const oppFive = fivePointsOf(cells, d);
  if (oppFive.length > 1) return false;
  const moves = oppFive.length ? oppFive : nearEmpty(cells);
  for (const m of moves) {
    if (a === 'b' && isForbidden(cells, m % SIZE, (m / SIZE) | 0)) continue;
    const c2 = put(cells, m, a);
    const fp = fivePointsOf(c2, a, m);
    if (!fp.length || fivePointsOf(c2, d).length) continue;
    if (fp.length >= 2) return true;
    const q = fp[0];
    if (d === 'b' && isForbidden(c2, q % SIZE, (q / SIZE) | 0)) return true; // 흑은 금수 자리로 못 막는다
    if (bruteVcf(put(c2, q, d), a, depth - 1)) return true;
  }
  return false;
}
const board = (stones) => setup(stones).cells;

// 흑 차례. 사 세 번이면 이기지만 사 두 번으로는 안 되고, 바로 열린 사를 만들 수도 없는 자리
const VCF_POS = {
  b: [[6, 5], [7, 5], [9, 5], [5, 6], [6, 6], [5, 7], [7, 7], [8, 7], [5, 8], [6, 8], [9, 8], [5, 9], [9, 10], [3, 11]],
  w: [[8, 4], [5, 5], [4, 6], [7, 6], [8, 6], [6, 7], [7, 8], [8, 8], [10, 8], [11, 8], [8, 9], [4, 10], [5, 10], [10, 11]],
};

test('AI: VCF(연속 사)로 이기는 수열을 찾아 끝까지 둔다', () => {
  const cells0 = board(VCF_POS);
  assert.equal(bruteVcf(cells0, 'b', 2), false, '사 두 번으로는 안 되는 자리여야 한다');
  assert.equal(bruteVcf(cells0, 'b', 3), true, '사 세 번이면 이기는 자리여야 한다');
  for (const level of ['normal', 'hard']) {
    const g = setup(VCF_POS, 'b');
    let blackMoves = 0;
    while (!g.finished) {
      const color = g.seatOf(g.currentId).color;
      const m = omokAI.bestMove(g.cells, color, color === 'b' ? level : 'hard');
      place(g, g.currentId, m.x, m.y);
      if (color === 'b') {
        blackMoves++;
        // 흑의 수는 모두 사(백이 막아야 할 오목 자리가 생김) 아니면 오목
        assert.ok(g.finished || fivePointsOf(g.cells, 'b').length >= 1, `${level}: ${blackMoves}번째 수가 사가 아님`);
      }
      assert.ok(blackMoves <= 4, `${level}: 너무 오래 걸림`);
    }
    assert.deepEqual(g.result.winners, ['B'], level);
    assert.equal(blackMoves, 4, level); // 사 세 번 + 오목
  }
});

// 백 차례. 흑은 사 세 번으로 이기는 수열이 있고, 백은 스스로 이길 길이 없다
const OPP_VCF_POS = [
  { b: [[1, 5], [6, 5], [3, 6], [4, 6], [5, 7], [6, 7], [7, 7], [8, 7], [6, 8], [7, 9]], w: [[6, 4], [2, 5], [3, 5], [4, 5], [5, 5], [4, 7], [9, 7], [5, 8], [8, 10]] },
  { b: [[4, 5], [8, 5], [7, 7], [9, 7], [6, 8], [8, 8], [9, 8], [8, 9], [9, 9]], w: [[5, 5], [6, 5], [7, 5], [9, 5], [6, 7], [7, 8], [9, 10], [10, 10]] },
];

test('AI: 상대(흑)의 VCF 위협을 미리 끊는다', () => {
  for (const [k, pos] of OPP_VCF_POS.entries()) {
    const cells = board(pos);
    assert.equal(bruteVcf(cells, 'b', 3), true, `${k}: 흑 VCF가 있는 자리여야 한다`);
    for (const level of ['normal', 'hard']) {
      const m = omokAI.bestMove(cells, 'w', level);
      const after = put(cells, m.y * SIZE + m.x, 'w');
      assert.equal(bruteVcf(after, 'b', 4), false, `${k} ${level}: ${JSON.stringify(m)} 뒤에도 흑 VCF가 남음`);
    }
  }
});

test('AI: 흑일 때 금수 자리는 이기는 모양처럼 보여도, 막아야 하는 자리여도 두지 않는다', () => {
  // (8,7)은 흑에게 열린 삼 두 개(삼삼) — 겉보기엔 가장 좋은 공격 자리지만 금수
  const g = setup({ b: [[6, 7], [7, 7], [8, 5], [8, 6], [11, 11]], w: [[0, 0], [14, 14], [0, 14], [14, 0], [12, 12]] });
  assert.equal(isForbidden(g.cells, 8, 7), true);
  for (const level of ['easy', 'normal', 'hard']) {
    const m = omokAI.bestMove(g.cells, 'b', level);
    assert.equal(isForbidden(g.cells, m.x, m.y), false, `${level}: ${JSON.stringify(m)}`);
  }
  // 백의 사를 막을 자리가 흑 금수 → 어차피 지지만 금수에는 두지 않는다
  const h = setup({ b: [[6, 7], [7, 7], [8, 5], [8, 6], [3, 2]], w: [[4, 3], [5, 4], [6, 5], [7, 6], [0, 0]] });
  assert.equal(isForbidden(h.cells, 8, 7), true);
  for (const level of ['easy', 'normal', 'hard']) {
    const m = omokAI.bestMove(h.cells, 'b', level);
    assert.equal(isForbidden(h.cells, m.x, m.y), false, `${level}: ${JSON.stringify(m)}`);
    assert.equal(h.cells[m.y * SIZE + m.x], '.');
  }
});

test('오목: autoAct 는 AI 수가 막혀도 예외 없이 다른 칸에 두거나 기권한다', () => {
  const orig = omokAI.bestMove;
  try {
    // AI가 금수 자리를 내놓으면 → 둘 수 있는 다른 칸
    const shape = { b: [[6, 7], [7, 7], [8, 5], [8, 6]], w: [[0, 0], [14, 14], [0, 14], [14, 0]] };
    const g = setup(shape);
    const before = g.cells;
    omokAI.bestMove = () => ({ x: 8, y: 7 });
    assert.equal(g.autoAct('B'), 'place');
    assert.equal(isForbidden(before, g.lastMove.x, g.lastMove.y), false);
    assert.equal(g.currentId, 'W');
    // AI가 예외를 던져도 둔다
    omokAI.bestMove = () => { throw new Error('boom'); };
    assert.equal(g.autoAct('W'), 'place');
    assert.equal(g.currentId, 'B');
    // 둘 칸이 하나도 없으면 기권
    omokAI.bestMove = orig;
    const h = newGame();
    h.cells = 'w'.repeat(SIZE * SIZE);
    assert.equal(h.autoAct('B'), 'fold');
    assert.equal(h.finished, true);
    assert.deepEqual(h.result.winners, ['W']);
  } finally {
    omokAI.bestMove = orig;
  }
});

// 시험용 무작위 (시드 고정)
function seeded(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

test('AI: 중반 국면에서 한 수 시간이 예산 안이다 (어려움 ≤ 400ms, 보통 ≤ 150ms)', () => {
  // 보통끼리 무작위 시작으로 둔 판에서 10·20·30수째 국면을 뽑는다
  const positions = [];
  for (const seed of [3, 11]) {
    const r = seeded(seed);
    const g = newGame();
    place(g, 'B', 7, 7);
    for (;;) {
      const x = 6 + Math.floor(r() * 3); const y = 6 + Math.floor(r() * 3);
      if (x !== 7 || y !== 7) { place(g, 'W', x, y); break; }
    }
    while (!g.finished && g.moves.length <= 30) {
      const color = g.seatOf(g.currentId).color;
      if ([10, 20, 30].includes(g.moves.length)) positions.push({ cells: g.cells, color });
      const m = omokAI.bestMove(g.cells, color, 'normal');
      place(g, g.currentId, m.x, m.y);
    }
  }
  assert.ok(positions.length >= 3);
  const worst = { hard: 0, normal: 0 };
  for (const { cells, color } of positions) {
    for (const level of ['hard', 'normal']) {
      const t0 = process.hrtime.bigint();
      const m = omokAI.bestMove(cells, color, level);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      worst[level] = Math.max(worst[level], ms);
      assert.equal(cells[m.y * SIZE + m.x], '.');
    }
  }
  assert.ok(worst.hard <= 400, `어려움 ${worst.hard.toFixed(0)}ms`);
  assert.ok(worst.normal <= 150, `보통 ${worst.normal.toFixed(0)}ms`);
});

// ---------- 컴퓨터끼리 대국 (worker_threads 로 병렬) ----------
const { Worker } = require('node:worker_threads');
const os = require('node:os');
const path = require('node:path');

const WORKER_SRC = `
const { parentPort, workerData } = require('node:worker_threads');
const { OmokGame, omokAI, isForbidden } = require(workerData.file);
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
parentPort.on('message', ({ lb, lw, seed, opts }) => {
  const g = new OmokGame({ players: [{ id: 'B', stack: 0 }, { id: 'W', stack: 0 }] });
  const r = seeded(seed * 2654435761 + 7);
  g.act('B', { type: 'place', x: 7, y: 7 });
  while (g.moves.length < 3) { // 무작위 시작 두 수 (중앙 5×5)
    const x = 5 + Math.floor(r() * 5); const y = 5 + Math.floor(r() * 5);
    const color = g.seatOf(g.currentId).color;
    if (g.cells[y * 15 + x] !== '.' || (color === 'b' && isForbidden(g.cells, x, y))) continue;
    g.act(g.currentId, { type: 'place', x, y });
  }
  let forbidden = false;
  while (!g.finished) {
    const color = g.seatOf(g.currentId).color;
    const level = color === 'b' ? lb : lw;
    const m = omokAI.bestMove(g.cells, color, level, opts[level]);
    if (color === 'b' && isForbidden(g.cells, m.x, m.y)) { forbidden = true; break; }
    g.act(g.currentId, { type: 'place', x: m.x, y: m.y });
  }
  const winner = forbidden ? 'forbidden' : g.result.type === 'draw' ? 'draw' : g.result.winners[0] === 'B' ? 'b' : 'w';
  parentPort.postMessage({ winner, moves: g.moves.length });
});
`;

/** games: [{ lb, lw, seed }] 를 워커 몇 개로 나눠 병렬로 둔다 */
async function runGames(games, opts) {
  const file = path.join(__dirname, '..', 'server', 'games', 'omok.js');
  const cpus = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const n = Math.max(2, Math.min(6, cpus - 1));
  const queue = games.map((g, i) => ({ ...g, i }));
  const results = new Array(games.length);
  await Promise.all(Array.from({ length: Math.min(n, games.length) }, () => new Promise((resolve, reject) => {
    const w = new Worker(WORKER_SRC, { eval: true, workerData: { file } });
    let cur = null;
    const next = () => {
      cur = queue.shift();
      if (!cur) { w.terminate().then(() => resolve()); return; }
      w.postMessage({ lb: cur.lb, lw: cur.lw, seed: cur.seed, opts });
    };
    w.on('message', (res) => { results[cur.i] = { ...cur, ...res }; next(); });
    w.on('error', reject);
    next();
  })));
  return results;
}

// 기본은 시험 시간을 줄이려고 어려움 한 수 150ms. OMOK_FULL=1 이면 실제 예산으로 판 수도 두 배
const FULL = !!process.env.OMOK_FULL;
const STRENGTH_OPTS = FULL ? {} : { hard: { time: 150 } };
const GAMES = FULL ? 20 : 10;

function tally(results) {
  const t = { b: 0, w: 0, draw: 0, forbidden: 0 };
  for (const r of results) t[r.winner]++;
  return t;
}

test('AI 대국: 어려움이 보통을 흑·백 모두 70% 이상 이긴다', async () => {
  const seeds = Array.from({ length: GAMES }, (_, i) => 100 + i);
  const res = await runGames([
    ...seeds.map((seed) => ({ lb: 'hard', lw: 'normal', seed })),
    ...seeds.map((seed) => ({ lb: 'normal', lw: 'hard', seed })),
  ], STRENGTH_OPTS);
  const asBlack = tally(res.filter((r) => r.lb === 'hard'));
  const asWhite = tally(res.filter((r) => r.lw === 'hard'));
  console.log(`  어려움(흑) vs 보통: ${asBlack.b}승 ${asBlack.w}패 ${asBlack.draw}무 / 어려움(백) vs 보통: ${asWhite.w}승 ${asWhite.b}패 ${asWhite.draw}무`);
  assert.equal(asBlack.forbidden + asWhite.forbidden, 0);
  assert.ok(asBlack.b >= GAMES * 0.7, `어려움(흑) ${asBlack.b}/${GAMES}`);
  assert.ok(asWhite.w >= GAMES * 0.7, `어려움(백) ${asWhite.w}/${GAMES}`);
});

test('AI 대국: 보통이 쉬움을 80% 이상 이긴다', async () => {
  // 쉬움은 무작위가 섞여 있고 판이 빨리 끝나므로 세 배로 둔다
  const seeds = Array.from({ length: GAMES * 3 }, (_, i) => 200 + i);
  const res = await runGames([
    ...seeds.map((seed) => ({ lb: 'normal', lw: 'easy', seed })),
    ...seeds.map((seed) => ({ lb: 'easy', lw: 'normal', seed })),
  ], STRENGTH_OPTS);
  const asBlack = tally(res.filter((r) => r.lb === 'normal'));
  const asWhite = tally(res.filter((r) => r.lw === 'normal'));
  console.log(`  보통(흑) vs 쉬움: ${asBlack.b}승 ${asBlack.w}패 ${asBlack.draw}무 / 보통(백) vs 쉬움: ${asWhite.w}승 ${asWhite.b}패 ${asWhite.draw}무`);
  assert.equal(asBlack.forbidden + asWhite.forbidden, 0);
  assert.ok(asBlack.b + asWhite.w >= seeds.length * 2 * 0.8, `보통 ${asBlack.b + asWhite.w}/${seeds.length * 2}`);
});

test('AI 대국: 어려움끼리 두면 무승부(판 가득 참)가 30% 미만이다', async () => {
  const res = await runGames(Array.from({ length: GAMES }, (_, i) => ({ lb: 'hard', lw: 'hard', seed: 300 + i })), STRENGTH_OPTS);
  const t = tally(res);
  const avg = Math.round(res.reduce((s, r) => s + r.moves, 0) / GAMES);
  console.log(`  어려움 vs 어려움 ${GAMES}판: 흑 ${t.b}승, 백 ${t.w}승, 무승부 ${t.draw} (${Math.round((t.draw / GAMES) * 100)}%), 평균 ${avg}수`);
  assert.equal(t.forbidden, 0);
  assert.ok(t.draw < GAMES * 0.3, `무승부 ${t.draw}/${GAMES}`);
});
