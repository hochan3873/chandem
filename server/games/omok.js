'use strict';
const { IllegalAction: IllegalMove } = require('../engine/hand');

/**
 * 오목 한 판의 진행 로직 + 컴퓨터(AI). 타이머·네트워크는 모른다.
 * 방(room) 코드가 포커 Hand 처럼 다룰 수 있도록 같은 모양의 인터페이스를 흉내 낸다.
 *
 * 규칙(한국식 캐주얼 오목)
 * - 15×15 판, 흑('b')이 먼저 둔다. 칸은 '.', 'b', 'w' 문자 225개 (인덱스 = y*15+x)
 * - 흑은 정확히 다섯 개만 승리, 여섯 개 이상(장목)은 둘 수는 있지만 승리가 아니다
 * - 백은 다섯 개 이상이면 승리 (장목 허용)
 * - 흑은 삼삼(열린 삼 두 개 이상을 동시에 만드는 수) 금지. 단, 그 수로 오목이 완성되면 허용
 * - 판이 가득 차면 무승부
 *
 * 삼삼 판정의 한계 (간단하지만 흔한 모양은 정확하게)
 * - "열린 삼" = 한 수를 더 두면 방금 둔 돌을 포함한 열린 사(·XXXX·, 양쪽 끝 어디에 둬도 정확히 오목)가
 *   되는 빈 점이 있는 줄. 떨어진 삼(.XX.X.)도 이 방식으로 잡힌다.
 * - 열린 사를 만드는 그 빈 점이 다시 금수(삼삼)인지까지는 재귀로 따지지 않는다 (정식 렌주보다 조금 엄격)
 * - 사사(4-4)·흑 장목은 금수로 치지 않는다 (캐주얼 규칙)
 */

const SIZE = 15;
const N = SIZE * SIZE;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
const CH = ['.', 'b', 'w'];

// ---------- 판 도우미 (내부는 0/1/2 숫자 배열로 계산) ----------

function toArr(cells) {
  if (typeof cells !== 'string') return Int8Array.from(cells, (c) => (typeof c === 'number' ? c : c === 'b' ? BLACK : c === 'w' ? WHITE : EMPTY));
  const a = new Int8Array(N);
  for (let i = 0; i < N; i++) { const c = cells[i]; a[i] = c === 'b' ? BLACK : c === 'w' ? WHITE : EMPTY; }
  return a;
}
const colorNum = (c) => (c === 'b' || c === BLACK ? BLACK : WHITE);
const inBoard = (x, y) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
// 판 밖은 -1 (벽)
const at = (b, x, y) => (inBoard(x, y) ? b[y * SIZE + x] : -1);

/** (x,y)를 지나는 dx,dy 방향 연속 돌 개수. (x,y)에는 c가 놓여 있다고 가정 */
function runLen(b, x, y, dx, dy, c) {
  let n = 1;
  for (let k = 1; at(b, x + dx * k, y + dy * k) === c; k++) n++;
  for (let k = 1; at(b, x - dx * k, y - dy * k) === c; k++) n++;
  return n;
}
// 흑은 정확히 5, 백은 5 이상
const isFiveLen = (n, c) => (c === BLACK ? n === 5 : n >= 5);

/** 이 방향에서 한 수를 더 두면 (x,y)를 포함한 오목이 되는 빈 점 수 (1 = 사, 2 이상 = 열린 사) */
function fivePoints(b, x, y, dx, dy, c) {
  let cnt = 0;
  for (let k = -4; k <= 4; k++) {
    if (k === 0) continue;
    const ex = x + dx * k; const ey = y + dy * k;
    if (at(b, ex, ey) !== EMPTY) continue;
    const i = ey * SIZE + ex;
    b[i] = c;
    if (isFiveLen(runLen(b, x, y, dx, dy, c), c)) cnt++;
    b[i] = EMPTY;
  }
  return cnt;
}

/** 금수 판정용 엄격한 열린 사: (x,y)를 포함해 정확히 4개가 이어지고 양 끝 빈칸에 두면 둘 다 정확히 오목 */
function isStraightFour(b, x, y, dx, dy, c) {
  let f = 0; let r = 0;
  while (at(b, x + dx * (f + 1), y + dy * (f + 1)) === c) f++;
  while (at(b, x - dx * (r + 1), y - dy * (r + 1)) === c) r++;
  if (f + r + 1 !== 4) return false;
  const ends = [[x + dx * (f + 1), y + dy * (f + 1), dx, dy], [x - dx * (r + 1), y - dy * (r + 1), -dx, -dy]];
  for (const [ex, ey, sx, sy] of ends) {
    if (at(b, ex, ey) !== EMPTY) return false;
    if (c === BLACK && at(b, ex + sx, ey + sy) === BLACK) return false; // 채우면 장목이 되는 끝
  }
  return true;
}

/** 이 방향이 (x,y)를 포함한 열린 삼인가 (금수 판정용) */
function isOpenThree(b, x, y, dx, dy, c) {
  for (let k = -3; k <= 3; k++) {
    if (k === 0) continue;
    const ex = x + dx * k; const ey = y + dy * k;
    if (at(b, ex, ey) !== EMPTY) continue;
    const i = ey * SIZE + ex;
    b[i] = c;
    const ok = isStraightFour(b, x, y, dx, dy, c);
    b[i] = EMPTY;
    if (ok) return true;
  }
  return false;
}

/** 흑이 (x,y)에 두면 삼삼 금수인가. cells: 문자열/배열, 칸은 비어 있어야 한다 */
function forbiddenArr(b, x, y) {
  const i = y * SIZE + x;
  if (b[i] !== EMPTY) return false;
  b[i] = BLACK;
  let threes = 0; let five = false;
  for (const [dx, dy] of DIRS) {
    if (runLen(b, x, y, dx, dy, BLACK) === 5) { five = true; break; }
  }
  if (!five) {
    for (const [dx, dy] of DIRS) {
      if (isOpenThree(b, x, y, dx, dy, BLACK)) threes++;
    }
  }
  b[i] = EMPTY;
  return !five && threes >= 2;
}
function isForbidden(cells, x, y) {
  if (!inBoard(x, y)) return false;
  return forbiddenArr(toArr(cells), x, y);
}

/** (x,y)에 놓인 돌(또는 color)로 승리했으면 이긴 줄 좌표 [[x,y],...], 아니면 null */
function checkWin(cells, x, y, color) {
  const b = toArr(cells);
  const c = color ? colorNum(color) : b[y * SIZE + x];
  if (c !== BLACK && c !== WHITE) return null;
  const prev = b[y * SIZE + x];
  b[y * SIZE + x] = c;
  let line = null;
  for (const [dx, dy] of DIRS) {
    if (!isFiveLen(runLen(b, x, y, dx, dy, c), c)) continue;
    let sx = x; let sy = y;
    while (at(b, sx - dx, sy - dy) === c) { sx -= dx; sy -= dy; }
    line = [];
    for (let px = sx, py = sy; at(b, px, py) === c; px += dx, py += dy) line.push([px, py]);
    break;
  }
  b[y * SIZE + x] = prev;
  return line;
}

// ---------- AI ----------

// 한 줄 모양 등급
const S_NONE = 0; const S_THREE = 1; const S_OPEN3 = 2; const S_FOUR = 3; const S_OPEN4 = 4; const S_FIVE = 5;
const WIN_W = [0, 1, 8, 40, 200, 0]; // 5칸 창 안의 내 돌 개수별 잔점수 (이음 가능성)

/** (x,y)에 c를 둔 상태에서 한 방향의 모양 등급 + 5칸 창 잔점수 */
function lineShape(b, x, y, dx, dy, c) {
  const run = runLen(b, x, y, dx, dy, c);
  if (isFiveLen(run, c)) return { s: S_FIVE, w: 0 };
  if (run > 5) return { s: S_NONE, w: 0 }; // 흑 장목: 가치 없음
  // 가지치기용: -4..4 안의 내 돌 수, 5칸 창 잔점수
  let mine = 0; let w = 0;
  const line = new Int8Array(9);
  for (let k = -4; k <= 4; k++) {
    const v = at(b, x + dx * k, y + dy * k);
    line[k + 4] = v;
    if (v === c) mine++;
  }
  for (let s = 0; s <= 4; s++) {
    let n = 0; let blocked = false;
    for (let k = s; k < s + 5; k++) {
      const v = line[k];
      if (v === c) n++; else if (v !== EMPTY) { blocked = true; break; }
    }
    if (!blocked) w += WIN_W[n];
  }
  if (mine < 3) return { s: S_NONE, w };
  const fp = mine >= 4 ? fivePoints(b, x, y, dx, dy, c) : 0;
  if (fp >= 2) return { s: S_OPEN4, w };
  if (fp === 1) return { s: S_FOUR, w };
  // 삼: 한 수 더 두면 사가 되는가
  let best = S_NONE;
  for (let k = -4; k <= 4; k++) {
    if (k === 0 || line[k + 4] !== EMPTY) continue;
    const ex = x + dx * k; const ey = y + dy * k; const i = ey * SIZE + ex;
    b[i] = c;
    const f = fivePoints(b, x, y, dx, dy, c);
    b[i] = EMPTY;
    if (f >= 2) { best = S_OPEN3; break; }
    if (f === 1) best = S_THREE;
  }
  return { s: best, w };
}

const SC_FIVE = 1e7;
const SC_WIN = 1e6; // 열린 사 / 사사 / 사삼 — 사실상 승리 수
/** c가 (x,y)에 두었을 때의 공격 가치 (칸은 비어 있어야 함) */
function attackScore(b, x, y, c) {
  const i = y * SIZE + x;
  b[i] = c;
  let fours = 0; let open4 = 0; let open3 = 0; let three = 0; let w = 0; let five = false;
  for (const [dx, dy] of DIRS) {
    const r = lineShape(b, x, y, dx, dy, c);
    w += r.w;
    if (r.s === S_FIVE) five = true;
    else if (r.s === S_OPEN4) open4++;
    else if (r.s === S_FOUR) fours++;
    else if (r.s === S_OPEN3) open3++;
    else if (r.s === S_THREE) three++;
  }
  b[i] = EMPTY;
  if (five) return SC_FIVE;
  if (open4 || fours >= 2) return SC_WIN;
  if (fours && open3) return SC_WIN * 0.6;
  if (open3 >= 2) return SC_WIN * 0.2; // 흑은 금수라 후보에서 이미 빠진다
  return fours * 6000 + open3 * 5000 + three * 700 + w;
}

/** 돌 주변 2칸 이내 빈칸 (돌이 없으면 중앙) */
function candidates(b) {
  const mark = new Uint8Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    if (b[i] === EMPTY) continue;
    any = true;
    const x = i % SIZE; const y = (i - x) / SIZE;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = x + dx; const ny = y + dy;
        if (inBoard(nx, ny) && b[ny * SIZE + nx] === EMPTY) mark[ny * SIZE + nx] = 1;
      }
    }
  }
  if (!any) return [(SIZE >> 1) * SIZE + (SIZE >> 1)];
  const out = [];
  for (let i = 0; i < N; i++) if (mark[i]) out.push(i);
  return out;
}

/** 후보마다 (공격 + 방어) 점수를 매겨 높은 순으로 정렬 */
function scoreMoves(b, c) {
  const opp = c === BLACK ? WHITE : BLACK;
  let list = candidates(b);
  if (c === BLACK) list = list.filter((i) => !forbiddenArr(b, i % SIZE, (i / SIZE) | 0));
  if (!list.length) { // 주변이 전부 금수면 아무 빈칸이나
    for (let i = 0; i < N; i++) if (b[i] === EMPTY && !(c === BLACK && forbiddenArr(b, i % SIZE, (i / SIZE) | 0))) list.push(i);
    if (!list.length) for (let i = 0; i < N; i++) if (b[i] === EMPTY) list.push(i);
  }
  const center = (SIZE - 1) / 2;
  const scored = list.map((i) => {
    const x = i % SIZE; const y = (i - x) / SIZE;
    const att = attackScore(b, x, y, c);
    // 상대 흑은 금수 자리를 둘 수 없으니 막을 필요도 없다
    const def = opp === BLACK && forbiddenArr(b, x, y) ? 0 : attackScore(b, x, y, opp);
    const near = -(Math.abs(x - center) + Math.abs(y - center)) * 0.01; // 동점이면 중앙 쪽
    return { i, x, y, att, def, score: att + def * 0.8 + near };
  });
  scored.sort((p, q) => q.score - p.score);
  return scored;
}

/** 상대가 다음 수로 낼 수 있는 가장 큰 공격 가치 */
function bestAttack(b, c) {
  let best = 0;
  for (const i of candidates(b)) {
    const x = i % SIZE; const y = (i - x) / SIZE;
    if (c === BLACK && forbiddenArr(b, x, y)) continue;
    const a = attackScore(b, x, y, c);
    if (a > best) { best = a; if (best >= SC_FIVE) break; }
  }
  return best;
}

const omokAI = {
  /** cells: 문자열(또는 배열), color: 'b'|'w', level: easy|normal|hard → { x, y } */
  bestMove(cells, color, level = 'normal') {
    const b = toArr(cells);
    const c = colorNum(color);
    const opp = c === BLACK ? WHITE : BLACK;
    const moves = scoreMoves(b, c);
    const top = moves[0];
    if (!top) return { x: SIZE >> 1, y: SIZE >> 1 };
    // 바로 이기기 / 상대 오목 막기는 난이도와 상관없이
    if (top.att >= SC_FIVE || top.def >= SC_FIVE) return { x: top.x, y: top.y };

    if (level === 'easy') {
      const pool = moves.slice(0, 5);
      let pick = pool[0]; let bestV = -Infinity;
      for (const m of pool) {
        const v = m.score * (0.5 + Math.random()); // 점수에 잡음을 섞어 가끔 엉뚱한 수
        if (v > bestV) { bestV = v; pick = m; }
      }
      return { x: pick.x, y: pick.y };
    }

    if (level === 'hard' && top.att < SC_WIN) {
      // 2수 읽기: 상위 10개 후보를 두어 보고, 상대가 받아칠 수 있는 최선의 공격을 뺀다
      const pool = moves.slice(0, 10);
      let pick = top; let bestV = -Infinity;
      for (const m of pool) {
        b[m.i] = c;
        const reply = bestAttack(b, opp);
        b[m.i] = EMPTY;
        const v = m.att + m.def * 0.8 - reply * 0.9;
        if (v > bestV) { bestV = v; pick = m; }
      }
      return { x: pick.x, y: pick.y };
    }
    return { x: top.x, y: top.y };
  },
};

// ---------- 게임 ----------

/**
 * 오목 한 판. players: [{ id, stack }] 정확히 2명, 0번 = 흑.
 * dealerIndex·sb·bb 는 포커 호환용으로만 받는다.
 */
class OmokGame {
  constructor({ players, dealerIndex = 0 }) {
    if (!players || players.length !== 2) throw new Error('오목은 정확히 2명이 필요합니다');
    this.kind = 'omok';
    this.dealerIndex = dealerIndex;
    this.board = []; // 포커 호환용 빈 배열 — 돌은 cells 에 둔다
    this.cells = '.'.repeat(N);
    this.moves = [];
    this.lastMove = null;
    this.winLine = null;
    this.stage = 'play';
    this.log = [];
    this.result = null;
    this.finished = false;
    this.seats = players.map((p, k) => ({
      id: p.id,
      stack: p.stack,
      startStack: p.stack,
      color: k === 0 ? 'b' : 'w',
      folded: false,
      allIn: false,
      bet: 0,
      contributed: 0,
      lastAction: null,
      hole: [],
    }));
    this.toAct = 0;
  }

  seatOf(id) { return this.seats.find((s) => s.id === id); }
  indexOf(id) { return this.seats.findIndex((s) => s.id === id); }

  pushLog(entry) {
    this.log.push({ ...entry, stage: this.stage });
  }

  get currentId() { return this.finished || this.toAct < 0 ? null : this.seats[this.toAct].id; }
  get live() { return this.seats.filter((s) => !s.folded); }

  /** 현재 차례인 플레이어가 할 수 있는 행동 (포커 모양 유지) */
  legalActions(id) {
    const s = this.seatOf(id);
    if (this.finished || !s || this.currentId !== id) return null;
    return {
      omok: true,
      color: s.color,
      canFold: true,
      canCheck: false,
      canCall: false,
      canBet: false,
      canRaise: false,
      canAllIn: false,
      toCall: 0,
      callAmount: 0,
      minTo: 0,
      maxTo: 0,
      stack: s.stack,
      currentBet: 0,
      myBet: 0,
    };
  }

  /** action: { type: 'place', x, y } | { type: 'resign' } ('fold' 도 기권으로 받는다) */
  act(id, action) {
    const la = this.legalActions(id);
    if (!la) throw new IllegalMove('지금은 내 차례가 아니에요');
    const s = this.seatOf(id);
    const type = action && action.type;
    if (type === 'resign' || type === 'fold') {
      this.resign(s, false);
      return;
    }
    if (type !== 'place') throw new IllegalMove('알 수 없는 행동이에요');
    const x = Number(action.x); const y = Number(action.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inBoard(x, y)) throw new IllegalMove('판 밖이에요');
    const i = y * SIZE + x;
    if (this.cells[i] !== '.') throw new IllegalMove('이미 돌이 있는 자리예요');
    if (s.color === 'b' && isForbidden(this.cells, x, y)) throw new IllegalMove('흑은 삼삼(3-3) 자리에 둘 수 없어요');

    this.cells = this.cells.slice(0, i) + s.color + this.cells.slice(i + 1);
    this.moves.push({ x, y, color: s.color, id });
    this.lastMove = { x, y };
    s.lastAction = 'place';
    this.pushLog({ type: 'place', id, x, y, color: s.color });

    const line = checkWin(this.cells, x, y);
    if (line) {
      this.winLine = line;
      this.finish({ type: 'omok', winners: [id], reason: 'five', winLine: line });
    } else if (this.moves.length >= N) {
      this.finish({ type: 'draw', winners: this.seats.map((p) => p.id), reason: 'draw', winLine: null });
    } else {
      this.toAct = 1 - this.toAct;
    }
  }

  resign(s, forced) {
    s.folded = true;
    s.lastAction = 'fold';
    this.pushLog(forced ? { type: 'resign', id: s.id, forced: true } : { type: 'resign', id: s.id });
    const winner = this.seats.find((p) => p !== s);
    this.finish({ type: 'omok', winners: [winner.id], reason: 'resign', winLine: null });
  }

  /** 시간 초과: 컴퓨터(보통)가 대신 둔다 */
  autoAct(id) {
    const la = this.legalActions(id);
    if (!la) return null;
    const { x, y } = omokAI.bestMove(this.cells, la.color, 'normal');
    this.act(id, { type: 'place', x, y });
    return 'place';
  }

  /** 나가거나 강퇴된 사람: 차례와 상관없이 즉시 패배 */
  forceFold(id) {
    const s = this.seatOf(id);
    if (!s || s.folded || this.finished) return;
    this.resign(s, true);
  }

  finish(info) {
    const deltas = {};
    for (const s of this.seats) deltas[s.id] = 0;
    this.toAct = -1;
    this.finished = true;
    this.result = { ...info, hands: {}, potResults: [], payouts: {}, deltas, board: [] };
    this.pushLog({ type: 'end', winners: info.winners, result: info.type });
  }

  /** [흑 id, 백 id] */
  orderFromButton() { return this.seats.map((s) => s.id); }

  get totalPot() { return 0; }
  get collectedPot() { return 0; }
  potsView() { return []; }

  toJSON() {
    return { ...this, kind: 'omok' };
  }

  static fromJSON(obj) {
    const g = Object.create(OmokGame.prototype);
    Object.assign(g, obj);
    return g;
  }
}

module.exports = { OmokGame, omokAI, SIZE, IllegalMove, checkWin, isForbidden };
