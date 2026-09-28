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

// ---------- 강화 AI (보통·어려움): 줄 모양 표 + 증분 평가 + VCF/VCT + 알파베타 ----------

/*
 * 한 방향 모양 표
 * - 칸 p에 c를 둔다고 할 때, p를 가운데로 한 ±5칸(11칸) 창의 나머지 10칸을
 *   빈칸 0 / 내 돌 1 / 막힘(상대 돌·벽) 2 의 3진수 키로 만든다 (3^10 = 59049 가지)
 * - 키마다 모양 등급을 한 번만 계산해 둔다 (흑은 정확히 5, 백은 5 이상 규칙이 달라 표가 둘)
 * - 등급: 9 오목 / 8 열린 사 / 7 사 / 6 열린 삼 / 5 삼 / 4 열린 이 / 3 이 / 2·1 한 점 / 0 없음
 *   ("열린 사" = 오목 자리가 두 곳 이상, "열린 삼" = 한 수 더 두면 열린 사가 되는 자리가 있음)
 */
const P_FIVE = 9; const P_OPEN4 = 8; const P_FOUR = 7; const P_OPEN3 = 6;
const KEYS = 59049;
const POW3 = [1, 3, 9, 27, 81, 243, 729, 2187, 6561, 19683];
const WPOS = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10]; // 키 자리 → 창 위치 (가운데 5 제외)
// 칸 값(0 빈칸, 1 흑, 2 백, 3 벽) → 키 숫자
const CODE_B = [0, 1, 2, 2];
const CODE_W = [0, 2, 1, 2];
// 창 위치 k(0..10)에 있는 칸 q에서 보면, 가운데 칸 p는 q의 창 위치 10-k → 그 키 자리의 3의 거듭제곱
const BACK_POW = Array.from({ length: 11 }, (_, k) => (k === 5 ? 0 : POW3[10 - k < 5 ? 10 - k : 9 - k]));

function buildShapeTable(c) {
  const tab = new Uint8Array(KEYS);
  const buckets = Array.from({ length: 11 }, () => []);
  for (let k = 0; k < KEYS; k++) {
    let n = 0; let t = k;
    for (let j = 0; j < 10; j++) { if (t % 3 === 1) n++; t = (t / 3) | 0; }
    buckets[n].push(k);
  }
  const line = new Int8Array(11);
  const isFive = () => {
    let l = 5; let r = 5;
    while (l > 0 && line[l - 1] === 1) l--;
    while (r < 10 && line[r + 1] === 1) r++;
    return isFiveLen(r - l + 1, c);
  };
  // 내 돌이 많은 키부터: "한 수 더 둔 모양"은 항상 먼저 계산돼 있다
  for (let n = 10; n >= 0; n--) {
    for (const k of buckets[n]) {
      let t = k;
      for (let j = 0; j < 10; j++) { line[WPOS[j]] = t % 3; t = (t / 3) | 0; }
      line[5] = 1;
      if (isFive()) { tab[k] = P_FIVE; continue; }
      let fp = 0; let best = 0;
      for (let j = 0; j < 10; j++) {
        const e = WPOS[j];
        if (line[e] !== 0) continue;
        line[e] = 1;
        if (isFive()) fp++;
        line[e] = 0;
        const nx = tab[k + POW3[j]];
        if (nx >= 3 && nx - 2 > best) best = nx - 2; // 한 수 더 두면 열린 사 → 지금은 열린 삼, …
      }
      tab[k] = fp >= 2 ? P_OPEN4 : fp === 1 ? P_FOUR : best;
    }
  }
  return tab;
}

// 칸 등급 (네 방향을 합친 것, 클수록 강함)
const LV_FIVE = 7; // 두면 오목
const LV_WIN4 = 6; // 열린 사 또는 사사 — 상대가 당장 오목을 못 만들면 다음 수에 이긴다
const LV_43 = 5; // 사삼
const LV_FOUR = 4; // 사 (4 이상은 모두 상대에게 한 자리를 강요하는 수)
const LV_33 = 3; // 삼삼 (백만. 흑은 금수라 등급 0)
const LV_THREE = 2; // 열린 삼
// 방향별 모양 점수와 등급 보너스 — 평가·수 정렬에 함께 쓴다
const DIR_VAL = [0, 1, 3, 6, 16, 20, 70, 80, 500, 5000];
const LV_BONUS = [0, 0, 0, 1500, 0, 3000, 8000, 100000];

let TAB = null;
/** 모양 표·창 좌표·주변 칸·조브리스트 난수 (처음 AI를 부를 때 한 번만 만든다) */
function tables() {
  if (TAB) return TAB;
  const win = new Int16Array(N * 4 * 11);
  for (let p = 0; p < N; p++) {
    const x = p % SIZE; const y = (p - x) / SIZE;
    for (let d = 0; d < 4; d++) {
      const [dx, dy] = DIRS[d];
      for (let k = 0; k < 11; k++) {
        const nx = x + dx * (k - 5); const ny = y + dy * (k - 5);
        win[(p * 4 + d) * 11 + k] = inBoard(nx, ny) ? ny * SIZE + nx : -1;
      }
    }
  }
  const nbStart = new Int32Array(N + 1); const nb = [];
  for (let p = 0; p < N; p++) {
    nbStart[p] = nb.length;
    const x = p % SIZE; const y = (p - x) / SIZE;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && inBoard(x + dx, y + dy)) nb.push((y + dy) * SIZE + x + dx);
    }
  }
  nbStart[N] = nb.length;
  // 조브리스트 해시용 고정 난수 (xorshift32)
  const zob = new Int32Array(3 * N * 2);
  let s = 0x2545f491;
  for (let i = 0; i < zob.length; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; zob[i] = s; }
  // 네 방향 모양 조합(10^4) → 등급·가치·금수 후보 여부
  const comboLv = new Uint8Array(10000); const comboVal = new Int32Array(10000); const comboFc = new Uint8Array(10000);
  for (let k = 0; k < 10000; k++) {
    let n9 = 0; let n8 = 0; let n7 = 0; let n6 = 0; let v = 0;
    for (let t = k, d = 0; d < 4; d++, t = (t / 10) | 0) {
      const sh = t % 10;
      v += DIR_VAL[sh];
      if (sh === P_FIVE) n9++; else if (sh === P_OPEN4) n8++; else if (sh === P_FOUR) n7++; else if (sh === P_OPEN3) n6++;
    }
    let lv = 0;
    if (n9) lv = LV_FIVE;
    else if (n8 || n7 >= 2) lv = LV_WIN4;
    else if (n7 && n6) lv = LV_43;
    else if (n7) lv = LV_FOUR;
    else if (n6 >= 2) lv = LV_33;
    else if (n6) lv = LV_THREE;
    comboLv[k] = lv; comboVal[k] = v + LV_BONUS[lv];
    // 열린 삼 이상이 두 방향 이상일 때만 삼삼일 수 있다 → 그때만 정식 금수 판정
    comboFc[k] = !n9 && n6 + n7 + n8 >= 2 ? 1 : 0;
  }
  TAB = { shape: [null, buildShapeTable(BLACK), buildShapeTable(WHITE)], win, nbStart, nbList: Int16Array.from(nb), zob, comboLv, comboVal, comboFc };
  return TAB;
}


/**
 * 탐색용 판. 돌을 놓고 뺄 때 그 돌을 지나는 네 줄(±5칸)의 빈칸만 다시 계산한다.
 * 빈칸마다 색별로 방향 모양(cls), 등급(lv), 가치(val)를 들고 있고 등급별 칸 수(cnt)와 가치 합(sum)도 유지한다.
 * 흑 금수 칸은 forb=1 이고 흑 등급·가치는 0 (둘 수 없으니 위협도 아니다).
 */
class Engine {
  constructor(src) {
    this.T = tables();
    this.b = Int8Array.from(src);
    this.cls = [null, new Uint8Array(N * 4), new Uint8Array(N * 4)];
    this.val = [null, new Int32Array(N), new Int32Array(N)];
    this.lv = [null, new Uint8Array(N), new Uint8Array(N)];
    this.cnt = [null, new Int32Array(8), new Int32Array(8)];
    this.sum = [0, 0, 0];
    this.forb = new Uint8Array(N);
    this.fc = new Uint8Array(N); // 금수 후보(정식 판정을 한) 칸
    this.nbr = new Uint8Array(N);
    // 칸·방향별 창 키 (돌이 있는 칸도 유지해 두어야 돌을 뺄 때 바로 쓸 수 있다)
    this.kb = new Int32Array(N * 4); this.kw = new Int32Array(N * 4);
    this.hLo = 0; this.hHi = 0; this.stones = 0;
    for (let p = 0; p < N; p++) {
      const c = this.b[p];
      if (c === EMPTY) continue;
      this.stones++;
      this.hash(p, c);
      this.addNbr(p, 1);
    }
    for (let p = 0; p < N; p++) {
      for (let d = 0; d < 4; d++) this.calcDir(p, d);
      if (this.b[p] === EMPTY) this.calcCell(p);
    }
  }

  hash(p, c) { const o = ((c - 1) * N + p) * 2; this.hLo ^= this.T.zob[o]; this.hHi ^= this.T.zob[o + 1]; }
  addNbr(p, v) { const { nbStart, nbList } = this.T; for (let i = nbStart[p]; i < nbStart[p + 1]; i++) this.nbr[nbList[i]] += v; }
  /** 해시(53비트 정수) — 공격 색은 부르는 쪽이 따로 구분한다 */
  key() { return (this.hHi & 0x1fffff) * 4294967296 + (this.hLo >>> 0); }

  calcDir(p, d) {
    const { win, shape } = this.T; const b = this.b; const base = (p * 4 + d) * 11;
    let kb = 0; let kw = 0;
    for (let j = 0; j < 10; j++) {
      const q = win[base + WPOS[j]];
      const v = q < 0 ? 3 : b[q];
      kb += POW3[j] * CODE_B[v];
      kw += POW3[j] * CODE_W[v];
    }
    const i = p * 4 + d;
    this.kb[i] = kb; this.kw[i] = kw;
    this.cls[BLACK][i] = shape[BLACK][kb];
    this.cls[WHITE][i] = shape[WHITE][kw];
  }

  calcCell(p) { this.calcColor(BLACK, p); this.calcColor(WHITE, p); }

  /** 네 방향 모양 → 등급·가치 (조합표 한 번 찾기). 흑은 금수 후보면 정식 판정 */
  calcColor(c, p) {
    const cl = this.cls[c]; const o = p * 4;
    const combo = cl[o] * 1000 + cl[o + 1] * 100 + cl[o + 2] * 10 + cl[o + 3];
    const { comboLv, comboVal, comboFc } = this.T;
    let lv = comboLv[combo]; let v = comboVal[combo];
    if (c === BLACK) {
      const cand = comboFc[combo];
      this.fc[p] = cand;
      const f = cand && forbiddenArr(this.b, p % SIZE, (p / SIZE) | 0) ? 1 : 0;
      this.forb[p] = f;
      if (f) { lv = 0; v = 0; }
    }
    this.setCell(c, p, lv, v);
  }

  setCell(c, p, lv, v) {
    const ol = this.lv[c][p];
    if (ol) this.cnt[c][ol]--;
    if (lv) this.cnt[c][lv]++;
    this.lv[c][p] = lv;
    this.sum[c] += v - this.val[c][p];
    this.val[c][p] = v;
  }

  /**
   * p에 돌 c가 놓이거나(sign 1) 빠질 때(sign -1): p를 지나는 네 줄 ±5칸의 창 키를 고치고
   * 빈칸이면 모양·등급을 다시 계산한다
   */
  refresh(p, c, sign) {
    const { win, shape } = this.T; const b = this.b; const kb = this.kb; const kw = this.kw;
    const cb = CODE_B[c] * sign; const cw = CODE_W[c] * sign;
    const clsB = this.cls[BLACK]; const clsW = this.cls[WHITE]; const shB = shape[BLACK]; const shW = shape[WHITE];
    for (let d = 0; d < 4; d++) {
      const base = (p * 4 + d) * 11;
      for (let k = 0; k < 11; k++) {
        if (k === 5) continue;
        const q = win[base + k];
        if (q < 0) continue;
        const i = q * 4 + d; const pw = BACK_POW[k];
        kb[i] += pw * cb; kw[i] += pw * cw;
        if (b[q] !== EMPTY) continue;
        const nb = shB[kb[i]]; const nw = shW[kw[i]];
        // 모양이 그대로면 건너뛴다 (단, 금수 후보 칸은 정식 판정이 판 전체 모양에 달려 있어 다시 본다)
        if (nb !== clsB[i] || this.fc[q]) { clsB[i] = nb; this.calcColor(BLACK, q); }
        if (nw !== clsW[i]) { clsW[i] = nw; this.calcColor(WHITE, q); }
      }
    }
  }

  make(p, c) {
    this.b[p] = c; this.hash(p, c); this.stones++; this.addNbr(p, 1);
    this.setCell(BLACK, p, 0, 0); this.setCell(WHITE, p, 0, 0); this.forb[p] = 0; this.fc[p] = 0;
    this.refresh(p, c, 1);
  }

  unmake(p) {
    const c = this.b[p];
    this.b[p] = EMPTY; this.hash(p, c); this.stones--; this.addNbr(p, -1);
    this.refresh(p, c, -1);
    const { shape } = this.T;
    for (let d = 0; d < 4; d++) { const i = p * 4 + d; this.cls[BLACK][i] = shape[BLACK][this.kb[i]]; this.cls[WHITE][i] = shape[WHITE][this.kw[i]]; }
    this.calcCell(p);
  }

  legal(c, p) { return this.b[p] === EMPTY && !(c === BLACK && this.forb[p]); }
  find(c, lv) { const a = this.lv[c]; for (let p = 0; p < N; p++) if (a[p] === lv) return p; return -1; }
  /** c 등급이 minLv 이상인 칸 (등급이 있으면 이미 둘 수 있는 칸) */
  list(c, minLv) { const a = this.lv[c]; const out = []; for (let p = 0; p < N; p++) if (a[p] >= minLv) out.push(p); return out; }
  hasAtLeast(c, minLv) { const k = this.cnt[c]; for (let l = minLv; l <= LV_FIVE; l++) if (k[l]) return true; return false; }
}

const WIN_SC = 1e8;
const MATE = WIN_SC - 1000; // 이 이상이면 필승·필패 점수
const MAX_PLY = 40;
const TT_BITS = 18; const TT_MASK = (1 << TT_BITS) - 1;
let TT = null;
function ttTables() {
  if (!TT) {
    const n = 1 << TT_BITS;
    TT = { lo: new Int32Array(n), hi: new Int32Array(n), score: new Int32Array(n), depth: new Int8Array(n), flag: new Int8Array(n), move: new Int16Array(n) };
  }
  TT.flag.fill(0); // 수마다 새로 (난이도마다 탐색 폭이 달라 섞지 않는다)
  return TT;
}
const SIDE_LO = 0x5bd1e995; // 백 차례일 때 해시에 섞는 값

// 난이도별 설정: time = 한 수 전체 시간(ms), vcf/oppVcf = 공격 수 개수(×2 = 수읽기 깊이)
const LEVELS = {
  normal: { time: 110, depth: 3, rootK: 10, k: 8, vcf: 3, oppVcf: 3, vcfNodes: 4000, vct: 0, oppVct: 0, defW: 0.9, oppW: 1 },
  hard: { time: 340, depth: 10, rootK: 14, k: 11, vcf: 8, oppVcf: 7, vcfNodes: 30000, vct: 3, oppVct: 3, defW: 0.9, oppW: 1 },
};

class Searcher {
  constructor(E, cfg, deadline) {
    this.E = E; this.cfg = cfg; this.deadline = deadline;
    this.nodes = 0; this.stop = false; this.tt = ttTables();
    this.vMemo = [null, new Map(), new Map()];
    this.vctMemo = [null, new Map(), new Map()];
    this.vNodes = 0; this.vLimit = 0; this.vStop = false;
  }

  timeUp() { return Date.now() > this.deadline; }

  /** 남은 시간 중 ms 만큼만 쓰도록 마감을 잠시 당겨서 fn 실행 */
  withDeadline(ms, fn) {
    const saved = this.deadline;
    this.deadline = Math.min(saved, Date.now() + ms);
    try { return fn(); } finally { this.deadline = saved; }
  }

  /**
   * pool 의 수를 하나씩 두어 보고 isSafe() 가 참인 수만 (정렬 순서대로) 남긴다.
   * 안전한 수가 하나도 없으면 원래 후보 fallback 을 그대로 쓴다 (어차피 지는 판)
   */
  filterSafe(s, pool, isSafe, fallback) {
    const E = this.E; const safe = [];
    for (const p of pool) {
      if (this.timeUp()) break;
      E.make(p, s);
      const ok = isSafe();
      E.unmake(p);
      if (ok) safe.push(p);
    }
    if (!safe.length) return fallback;
    const order = new Map(this.genMoves(s, N).map((p, i) => [p, i]));
    safe.sort((p, q) => (order.get(p) ?? N) - (order.get(q) ?? N));
    return safe;
  }

  /** s가 둘 후보: 돌 주변 2칸 안의 둘 수 있는 칸, (공격 + 방어) 가치 높은 순 k개 */
  genMoves(s, k) {
    const E = this.E; const o = 3 - s; const b = E.b; const nbr = E.nbr;
    const vs = E.val[s]; const vo = E.val[o]; const defW = this.cfg.defW;
    // 점수 높은 k개만 삽입 정렬로 유지
    const out = []; const top = [];
    for (let p = 0; p < N; p++) {
      if (b[p] !== EMPTY || !nbr[p] || (s === BLACK && E.forb[p])) continue;
      const v = vs[p] + vo[p] * defW;
      if (out.length === k && v <= top[k - 1]) continue;
      let i = out.length < k ? out.length : k - 1;
      while (i > 0 && top[i - 1] < v) { top[i] = top[i - 1]; out[i] = out[i - 1]; i--; }
      top[i] = v; out[i] = p;
    }
    return out;
  }

  /** 상대의 열린 삼(열린 사 자리)·사사 자리가 있을 때 막는 수 + 내 사 */
  defenseMoves(s) {
    const E = this.E; const o = 3 - s; const ls = E.lv[s]; const lo = E.lv[o];
    const vs = E.val[s]; const vo = E.val[o];
    const out = [];
    for (let p = 0; p < N; p++) {
      if ((lo[p] >= LV_FOUR || ls[p] >= LV_FOUR) && E.legal(s, p)) out.push(p);
    }
    out.sort((p, q) => (vs[q] + vo[q]) - (vs[p] + vo[p]));
    return out;
  }

  evaluate(s) {
    const E = this.E;
    return E.sum[s] - E.sum[3 - s] * this.cfg.oppW;
  }

  /** 수읽기 없이 판단되는 승패 (s 차례). 없으면 0 */
  tactical(s, ply) {
    const E = this.E; const o = 3 - s; const cs = E.cnt[s]; const co = E.cnt[o];
    if (cs[LV_FIVE]) return WIN_SC - ply;
    if (co[LV_FIVE] >= 2) return -(WIN_SC - ply - 1);
    if (co[LV_FIVE]) return 0;
    if (cs[LV_WIN4]) return WIN_SC - ply - 2;
    // 상대가 사를 만들 수 없으면 사삼(흑·백)·삼삼(백)은 막을 수 없다
    if (!co[LV_FOUR] && !co[LV_43] && !co[LV_WIN4] && (cs[LV_43] || (s === WHITE && cs[LV_33]))) return WIN_SC - ply - 4;
    return 0;
  }

  /** 네가맥스 알파베타 (s 차례). 점수는 s 기준 */
  search(s, depth, alpha, beta, ply) {
    if ((++this.nodes & 255) === 0 && this.timeUp()) this.stop = true;
    if (this.stop) return 0;
    const E = this.E; const o = 3 - s;
    const t = this.tactical(s, ply);
    if (t) return t;
    const forced = E.cnt[o][LV_FIVE] === 1;
    if ((!forced && depth <= 0) || ply >= MAX_PLY) return this.evaluate(s);

    const tt = this.tt;
    const lo = E.hLo ^ (s === WHITE ? SIDE_LO : 0); const hi = E.hHi;
    const ti = lo & TT_MASK;
    let ttMove = -1;
    if (tt.flag[ti] && tt.lo[ti] === lo && tt.hi[ti] === hi) {
      ttMove = tt.move[ti];
      if (tt.depth[ti] >= depth) {
        let v = tt.score[ti];
        if (v > MATE) v -= ply; else if (v < -MATE) v += ply;
        const f = tt.flag[ti];
        if (f === 1) return v;
        if (f === 2 && v >= beta) return v;
        if (f === 3 && v <= alpha) return v;
      }
    }

    let moves; let nd = depth - 1;
    if (forced) {
      const p = E.find(o, LV_FIVE);
      if (s === BLACK && E.forb[p]) return -(WIN_SC - ply - 1); // 막을 자리가 금수
      moves = [p]; nd = depth; // 외길은 깊이를 줄이지 않는다
    } else if (E.cnt[o][LV_WIN4]) {
      moves = this.defenseMoves(s);
    } else {
      moves = this.genMoves(s, this.cfg.k);
    }
    if (!moves.length) return 0;
    if (ttMove >= 0) {
      const i = moves.indexOf(ttMove);
      if (i > 0) { moves.splice(i, 1); moves.unshift(ttMove); }
    }

    const a0 = alpha;
    let best = -Infinity; let bestMove = moves[0];
    for (const p of moves) {
      E.make(p, s);
      const sc = -this.search(o, nd, -beta, -alpha, ply + 1);
      E.unmake(p);
      if (this.stop) return 0;
      if (sc > best) {
        best = sc; bestMove = p;
        if (sc > alpha) { alpha = sc; if (alpha >= beta) break; }
      }
    }
    let v = best;
    if (v > MATE) v += ply; else if (v < -MATE) v -= ply;
    tt.lo[ti] = lo; tt.hi[ti] = hi; tt.score[ti] = v; tt.depth[ti] = Math.max(0, depth); tt.move[ti] = bestMove;
    tt.flag[ti] = best <= a0 ? 3 : best >= beta ? 2 : 1;
    return best;
  }

  /** 반복 심화: 시간이 다 되면 마지막으로 끝까지 읽은 깊이의 최선 수 */
  iterate(s, rootMoves) {
    const E = this.E; const o = 3 - s;
    let moves = rootMoves.slice();
    let bestMove = moves[0]; let bestScore = -Infinity;
    for (let depth = 1; depth <= this.cfg.depth; depth++) {
      let alpha = -Infinity; let iterMove = -1; let iterScore = -Infinity;
      for (const p of moves) {
        E.make(p, s);
        const sc = -this.search(o, depth - 1, -Infinity, -alpha, 1);
        E.unmake(p);
        if (this.stop) break;
        if (sc > iterScore) { iterScore = sc; iterMove = p; if (sc > alpha) alpha = sc; }
      }
      // 중단됐더라도 이전 최선 수(맨 앞)를 끝까지 읽었다면, 그보다 나은 수만 바뀌어 있다
      if (iterMove >= 0) { bestMove = iterMove; bestScore = iterScore; }
      if (this.stop) break;
      if (bestScore > MATE || bestScore < -MATE) break; // 승패가 보이면 그만
      moves = [bestMove, ...moves.filter((p) => p !== bestMove)];
    }
    return bestMove;
  }

  vMemoFail(a, depth) {
    const m = this.vMemo[a].get(this.E.key());
    return m !== undefined && m >= depth;
  }

  vBudget() {
    if (++this.vNodes > this.vLimit || ((this.vNodes & 127) === 0 && this.timeUp())) this.vStop = true;
    return this.vStop;
  }

  /**
   * VCF: a 차례에 사(또는 오목)만 연달아 두어 이기는 수열. 찾으면 첫 수, 없으면 -1.
   * 상대의 응수는 오목 자리 막기 하나뿐이다. 흑이 막아야 할 자리가 금수면 그대로 이긴다.
   * path 가 주어지면 수열에 나온 칸(공격·응수)을 담는다.
   */
  vcf(a, depth, path) {
    const E = this.E; const d = 3 - a;
    if (E.cnt[a][LV_FIVE]) { const p = E.find(a, LV_FIVE); if (path) path.push(p); return p; }
    if (depth <= 0 || E.cnt[d][LV_FIVE] >= 2) return -1;
    if (this.vBudget()) return -1;
    if (this.vMemoFail(a, depth)) return -1;
    let moves;
    if (E.cnt[d][LV_FIVE]) {
      const p = E.find(d, LV_FIVE);
      if (E.lv[a][p] < LV_FOUR) return -1; // 막는 수가 사가 아니면 끊긴다
      moves = [p];
    } else {
      moves = E.list(a, LV_FOUR);
      const la = E.lv[a]; const va = E.val[a];
      moves.sort((p, q) => (la[q] - la[p]) || (va[q] - va[p]));
    }
    for (const m of moves) {
      E.make(m, a);
      let win = false; let q = -1;
      if (!E.cnt[d][LV_FIVE]) { // 상대가 바로 오목을 만들 수 있으면 이 사는 소용없다
        const n5 = E.cnt[a][LV_FIVE];
        if (n5 >= 2) win = true;
        else if (n5 === 1) {
          q = E.find(a, LV_FIVE);
          if (d === BLACK && E.forb[q]) win = true; // 흑은 금수 자리로 막을 수 없다
          else {
            E.make(q, d);
            win = this.vcf(a, depth - 1, path) >= 0;
            E.unmake(q);
          }
        }
      }
      E.unmake(m);
      if (win) { if (path) { path.push(m); if (q >= 0) path.push(q); } return m; }
      if (this.vStop) return -1;
    }
    if (!this.vStop) this.vMemo[a].set(E.key(), depth);
    return -1;
  }

  /** VCF 한 번 돌리기 (노드 한도 새로) */
  runVcf(a, depth, limit, path) {
    this.vNodes = 0; this.vLimit = limit; this.vStop = false;
    return this.vcf(a, depth, path);
  }

  /**
   * VCT(간이): 사와 열린 삼으로 몰아붙여 이기는 수열. a 차례. 찾으면 첫 수, 없으면 -1.
   * 상대의 응수는 (a의 사를 만드는 자리 = 삼을 막는 자리) + (상대 자신의 사) 전부를 확인한다.
   */
  vctAttack(a, depth) {
    const E = this.E; const d = 3 - a;
    if (E.cnt[a][LV_FIVE]) return E.find(a, LV_FIVE);
    if (E.cnt[d][LV_FIVE] >= 2) return -1;
    if (E.cnt[d][LV_FIVE]) {
      const p = E.find(d, LV_FIVE);
      if (!E.legal(a, p) || E.lv[a][p] < LV_THREE) return -1; // 막으면서 위협이 되어야 계속
      E.make(p, a);
      const ok = this.vctDefend(a, depth - 1);
      E.unmake(p);
      return ok ? p : -1;
    }
    if (E.cnt[a][LV_WIN4]) return E.find(a, LV_WIN4);
    if (depth <= 0 || this.vBudget()) return -1;
    const key = E.key();
    const memo = this.vctMemo[a].get(key);
    if (memo !== undefined && memo >= depth) return -1;
    const la = E.lv[a]; const va = E.val[a];
    const moves = E.list(a, LV_THREE);
    moves.sort((p, q) => (la[q] - la[p]) || (va[q] - va[p]));
    if (moves.length > 12) moves.length = 12;
    for (const m of moves) {
      E.make(m, a);
      const ok = this.vctDefend(a, depth - 1);
      E.unmake(m);
      if (ok) return m;
      if (this.vStop) return -1;
    }
    if (!this.vStop) this.vctMemo[a].set(key, depth);
    return -1;
  }

  /** a가 방금 위협을 둔 뒤 상대(d) 차례: 어떻게 받아도 a가 이기면 true */
  vctDefend(a, depth) {
    const E = this.E; const d = 3 - a;
    if (E.cnt[d][LV_FIVE]) return false;
    const n5 = E.cnt[a][LV_FIVE];
    if (n5 >= 2) return true;
    let moves;
    if (n5 === 1) {
      const q = E.find(a, LV_FIVE);
      if (d === BLACK && E.forb[q]) return true;
      moves = [q];
    } else {
      if (!E.cnt[a][LV_WIN4]) return false; // 위협이 아니었다
      moves = [];
      const la = E.lv[a]; const ld = E.lv[d];
      for (let p = 0; p < N; p++) if ((la[p] >= LV_FOUR || ld[p] >= LV_FOUR) && E.legal(d, p)) moves.push(p);
    }
    for (const m of moves) {
      E.make(m, d);
      const ok = this.vctAttack(a, depth) >= 0;
      E.unmake(m);
      if (!ok) return false;
    }
    return !this.vStop;
  }

  runVct(a, depth, limit) {
    this.vNodes = 0; this.vLimit = limit; this.vStop = false;
    this.vctMemo = [null, new Map(), new Map()];
    const m = this.vctAttack(a, depth);
    return this.vStop ? -1 : m;
  }
}

/** 보통·어려움: 즉시 승리 → 오목 막기 → VCF → 상대 VCF 막기 → VCT → 알파베타 */
function strongMove(cells, color, level, opts = {}) {
  const cfg = { ...LEVELS[level], ...opts };
  const t0 = Date.now();
  const deadline = t0 + cfg.time;
  const E = new Engine(toArr(cells));
  const s = colorNum(color); const o = 3 - s;
  const S = new Searcher(E, cfg, deadline);
  const xy = (p) => ({ x: p % SIZE, y: (p / SIZE) | 0 });

  if (E.stones === 0) return { x: SIZE >> 1, y: SIZE >> 1 };
  // 1. 바로 이기기 / 상대 오목 막기
  if (E.cnt[s][LV_FIVE]) return xy(E.find(s, LV_FIVE));
  if (E.cnt[o][LV_FIVE]) {
    const p = E.find(o, LV_FIVE);
    if (E.legal(s, p)) return xy(p);
  } else if (E.cnt[s][LV_WIN4]) {
    return xy(E.find(s, LV_WIN4)); // 열린 사 / 사사
  }
  // 2. 내 VCF
  if (!E.cnt[o][LV_FIVE]) {
    const m = S.runVcf(s, cfg.vcf, cfg.vcfNodes);
    if (m >= 0) return xy(m);
  }

  // 3. 뿌리 후보
  let root;
  if (E.cnt[o][LV_FIVE]) root = S.genMoves(s, N); // 막을 자리가 금수 — 어차피 지는 판
  else if (E.cnt[o][LV_WIN4]) root = S.defenseMoves(s);
  else root = S.genMoves(s, cfg.rootK);
  if (!root.length) root = S.genMoves(s, N);
  if (!root.length) { // 주변이 전부 금수: 판 전체에서 둘 수 있는 칸
    for (let p = 0; p < N; p++) if (E.legal(s, p)) { root.push(p); break; }
    if (!root.length) { for (let p = 0; p < N; p++) if (E.b[p] === EMPTY) return xy(p); return { x: SIZE >> 1, y: SIZE >> 1 }; }
    return xy(root[0]);
  }
  if (root.length === 1) return xy(root[0]);

  // 4. 상대에게 VCF가 있으면 그것을 끊는 수만 남긴다
  let threatened = false;
  if (!E.cnt[o][LV_FIVE] && E.hasAtLeast(o, LV_FOUR)) {
    const path = [];
    if (S.runVcf(o, cfg.oppVcf, cfg.vcfNodes, path) >= 0) {
      threatened = true;
      const pool = new Set(root);
      for (const p of path) if (E.legal(s, p)) pool.add(p);
      for (const p of E.list(s, LV_FOUR)) pool.add(p);
      const per = Math.max(500, (cfg.vcfNodes / 4) | 0);
      root = S.filterSafe(s, pool, () => S.runVcf(o, cfg.oppVcf, per) < 0 && !S.vStop, root);
      if (root.length === 1) return xy(root[0]);
    }
  }

  // 5. 내 VCT (어려움)
  if (cfg.vct && !threatened && !E.cnt[o][LV_FIVE]) {
    const m = S.withDeadline(cfg.time * 0.2, () => S.runVct(s, cfg.vct, 20000));
    if (m >= 0 && E.legal(s, m)) return xy(m);
  }

  // 5-2. 상대에게 VCT(삼·사로 몰아붙여 이기는 길)가 보이면 그것을 끊는 수를 우선
  if (cfg.oppVct && !threatened && !E.cnt[o][LV_FIVE] && !E.cnt[o][LV_WIN4] && E.hasAtLeast(o, LV_THREE)) {
    S.withDeadline(cfg.time * 0.3, () => {
      if (S.runVct(o, cfg.oppVct, 8000) < 0) return;
      const pool = new Set(root);
      for (const p of E.list(o, LV_THREE)) if (E.legal(s, p)) pool.add(p);
      for (const p of E.list(s, LV_FOUR)) pool.add(p);
      root = S.filterSafe(s, pool, () => S.runVct(o, cfg.oppVct, 2000) < 0 && !S.vStop, root);
    });
    if (root.length === 1) return xy(root[0]);
  }

  // 6. 알파베타 반복 심화
  const best = S.iterate(s, root);
  return xy(best);
}

const omokAI = {
  /**
   * cells: 문자열(또는 배열), color: 'b'|'w', level: easy|normal|hard → { x, y }
   * opts(선택, 시험·측정용): { time, depth, ... } 로 난이도 설정 일부를 덮어쓴다
   */
  bestMove(cells, color, level = 'normal', opts) {
    if (level !== 'easy') return strongMove(cells, color, LEVELS[level] ? level : 'normal', opts);
    const b = toArr(cells);
    const c = colorNum(color);
    const moves = scoreMoves(b, c);
    const top = moves[0];
    if (!top) return { x: SIZE >> 1, y: SIZE >> 1 };
    // 바로 이기기 / 상대 오목 막기는 쉬움에서도 놓치지 않는다
    if (top.att >= SC_FIVE) return { x: top.x, y: top.y };
    const block = moves.find((m) => m.def >= SC_FIVE);
    if (block) return { x: block.x, y: block.y };
    const pool = moves.slice(0, 5);
    let pick = pool[0]; let bestV = -Infinity;
    for (const m of pool) {
      const v = m.score * (0.5 + Math.random()); // 점수에 잡음을 섞어 가끔 엉뚱한 수
      if (v > bestV) { bestV = v; pick = m; }
    }
    return { x: pick.x, y: pick.y };
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

  /**
   * 시간 초과: 컴퓨터(보통)가 대신 둔다. 절대 예외를 던지지 않는다.
   * AI 수가 막히면(금수 등) 둘 수 있는 다른 칸, 그마저 없으면 기권
   */
  autoAct(id) {
    const la = this.legalActions(id);
    if (!la) return null;
    try {
      const { x, y } = omokAI.bestMove(this.cells, la.color, 'normal');
      this.act(id, { type: 'place', x, y });
      return 'place';
    } catch { /* 아래에서 다른 칸을 찾는다 */ }
    for (let i = 0; i < N; i++) {
      if (this.cells[i] !== '.') continue;
      const x = i % SIZE; const y = (i - x) / SIZE;
      if (la.color === 'b' && isForbidden(this.cells, x, y)) continue;
      try { this.act(id, { type: 'place', x, y }); return 'place'; } catch { /* 다음 칸 */ }
    }
    this.resign(this.seatOf(id), false);
    return 'fold';
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
