'use strict';
// 연습용 봇의 판단.
// 1) 상대마다 성향(몇 판 중 몇 번 레이즈·올인했는지)을 기억해 두고
// 2) 그 성향으로 상대 패의 범위(상위 몇 %)를 추정한 뒤
// 3) 그 범위를 상대로 몬테카를로 승률을 계산해 팟 오즈와 비교한다.
const { newDeck, bestHand, compareScore, rankValue } = require('./engine/cards');

// 타짜 인물 · 캐릭터 그림(남 a1 a3 a5 a7, 여 a2 a4 a6 a8)과 성격을 맞춘다
const BOTS = [
  { name: '평경장', avatar: 5, style: 0 },
  { name: '정마담', avatar: 8, style: 2 },
  { name: '아귀', avatar: 1, style: 1 },
  { name: '화란', avatar: 2, style: 2 },
  { name: '고니', avatar: 7, style: 1 },
  { name: '미나', avatar: 4, style: 0 },
  { name: '짝귀', avatar: 3, style: 0 },
  { name: '마돈나', avatar: 6, style: 1 },
];
const BOT_NAMES = BOTS.map((b) => b.name);
// 성격: open = 먼저 레이즈하는 패 범위(상위 %), loose = 콜 여유, aggro = 베팅 빈도, bluff = 블러핑 빈도
const STYLES = [
  { open: 0.16, loose: 0.00, aggro: 0.55, bluff: 0.06 },   // 신중
  { open: 0.26, loose: 0.02, aggro: 0.75, bluff: 0.14 },   // 공격
  { open: 0.20, loose: 0.05, aggro: 0.45, bluff: 0.08 },   // 콜 많음
];

// ── 시작 패 순위 (Chen 공식 → 1326 조합 중 상위 몇 %) ─────────────
function chen(a, b) {
  const va = rankValue(a), vb = rankValue(b);
  const hi = Math.max(va, vb), lo = Math.min(va, vb);
  const pts = (v) => (v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2);
  if (hi === lo) return Math.max(5, pts(hi) * 2);
  let s = pts(hi);
  if (a[1] === b[1]) s += 2;
  const gap = hi - lo - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && hi < 12) s += 1;
  return Math.ceil(s);
}
const PCT = new Map(); // 두 장 → 0(최고)~1(최하)
(() => {
  const deck = newDeck();
  const all = [];
  for (let i = 0; i < 52; i++) for (let j = i + 1; j < 52; j++) all.push([deck[i], deck[j], chen(deck[i], deck[j])]);
  all.sort((x, y) => y[2] - x[2]);
  const byScore = new Map();
  all.forEach(([, , sc], i) => { if (!byScore.has(sc)) byScore.set(sc, [i, i]); byScore.get(sc)[1] = i; });
  for (const [a, b, sc] of all) {
    const [s, e] = byScore.get(sc);
    const pct = (s + e + 1) / 2 / all.length;
    PCT.set(a + b, pct);
    PCT.set(b + a, pct);
  }
})();
const handPct = (hole) => PCT.get(hole[0] + hole[1]);

// ── 상대 성향 ─────────────────────────────────────────
function newStats() { return { hands: 0, vpip: 0, raises: 0, allins: 0, lastVpipHand: -1 }; }
/** 판이 시작될 때 */
function observeDeal(stats, ids) { for (const id of ids) (stats[id] = stats[id] || newStats()).hands++; }
/** 누가 행동했을 때 (판마다 vpip는 한 번만) */
function observeAct(stats, id, type, handNo) {
  const s = stats[id] = stats[id] || newStats();
  if (['call', 'bet', 'raise', 'allin'].includes(type) && s.lastVpipHand !== handNo) { s.vpip++; s.lastVpipHand = handNo; }
  if (type === 'bet' || type === 'raise') s.raises++;
  if (type === 'allin') s.allins++;
}

/** 상대가 이런 행동을 했을 때 들고 있을 법한 패 범위(상위 %) */
function rangeOf(stats, id, kind) {
  const s = (stats && stats[id]) || newStats();
  const n = Math.max(6, s.hands);                 // 판 수가 적으면 보수적으로 본다
  const allinRate = s.allins / n;
  const aggRate = (s.raises + s.allins) / n;
  const vpip = s.vpip / n;
  let range;
  if (kind === 'allin') range = 0.12 + allinRate * 1.6;        // 매판 올인하는 사람이면 아무 패나
  else if (kind === 'raise') range = 0.2 + aggRate * 0.9;
  else range = Math.max(0.35, vpip);                            // 콜만 한 사람
  return Math.min(1, range);
}

// ── 승률: 상대마다 범위 안에서 패를 뽑아 끝까지 깔아 본다 ─────────
function equityVs(hole, board, ranges, iters = 300) {
  const used = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !used.has(c));
  let win = 0;
  for (let it = 0; it < iters; it++) {
    const d = rest.slice();
    let top = 0;
    const take = () => { const j = top + Math.floor(Math.random() * (d.length - top)); [d[top], d[j]] = [d[j], d[top]]; return d[top++]; };
    const opp = [];
    for (const r of ranges) {
      // 범위 밖의 패면 다시 뽑는다(너무 좁으면 몇 번 뒤 그냥 받아들임)
      const mark = top;
      let a, b, tries = 0;
      do { top = mark; a = take(); b = take(); } while (r < 1 && handPct([a, b]) > r && ++tries < 40);
      opp.push([a, b]);
    }
    const full = board.concat(Array.from({ length: 5 - board.length }, take));
    const mine = bestHand(hole.concat(full)).score;
    let lost = false, ties = 1;
    for (const o of opp) {
      const c = compareScore(mine, bestHand(o.concat(full)).score);
      if (c < 0) { lost = true; break; }
      if (c === 0) ties++;
    }
    if (!lost) win += 1 / ties;
  }
  return win / iters;
}

// 상대가 아무 패나 들고 있다고 볼 때의 승률
function equity(hole, board, opponents, iters = 250) { return equityVs(hole, board, new Array(opponents).fill(1), iters); }

/** hand: 엔진 Hand, id: 봇 id, style: STYLES 중 하나, stats: 방의 상대 성향 → { type, amount? } */
function decide(hand, id, style = STYLES[0], stats = {}) {
  const la = hand.legalActions(id);
  const me = hand.seatOf(id);
  const others = hand.seats.filter((s) => !s.folded && s.id !== id);
  const pot = hand.totalPot;
  const facing = la.toCall > 0;
  const odds = facing ? la.toCall / (pot + la.toCall) : 0;
  const preflop = hand.board.length === 0;
  const bb = hand.bb;
  const myStack = me.stack + me.bet;
  const r = Math.random();

  // 가장 최근에 판을 키운 사람(베팅·레이즈·올인)
  const raisers = others.filter((s) => ['bet', 'raise', 'allin'].includes(s.lastAction));
  const aggressor = facing ? raisers.find((s) => s.bet === hand.currentBet) || raisers[0] || null : null;
  const aggKind = aggressor ? (aggressor.allIn ? 'allin' : 'raise') : null;
  // 상대별 패 범위. 판을 키운 사람은 그 사람 성향으로, 나머지는 콜 성향으로
  const ranges = others.slice(0, 4).map((s) => {
    if (raisers.includes(s)) return rangeOf(stats, s.id, s.allIn ? 'allin' : 'raise');
    return rangeOf(stats, s.id, 'call');
  });
  const eq = equityVs(me.hole, hand.board, ranges);

  const sizeTo = (frac) => {
    const to = Math.round((la.currentBet + Math.max(pot + la.toCall, bb * 2) * frac) / bb) * bb;
    return Math.max(la.minTo, Math.min(la.maxTo, to));
  };
  // 베팅/레이즈. 칩 대부분을 거는 크기면 이길 확률이 충분할 때만 올인
  const aggressive = (frac, minEqForShove = 0.6) => {
    if (!la.canBet && !la.canRaise) return null;
    const to = sizeTo(frac);
    if (to >= la.maxTo * 0.75) return eq >= minEqForShove ? { type: 'allin' } : null;
    return { type: la.canBet ? 'bet' : 'raise', amount: to };
  };
  const callOrCheck = () => (la.canCheck ? { type: 'check' } : { type: 'call' });
  // 팟 오즈 기준 콜: 이길 확률이 내가 넣을 칩의 비율보다 크면 받는다
  const callIfPriced = (margin) => (eq > odds + margin - style.loose ? { type: 'call' } : { type: 'fold' });

  if (preflop) {
    const pct = handPct(me.hole);
    const raised = la.currentBet > bb;
    // 칩이 적으면(12BB 이하) 괜찮은 패로 바로 올인
    if (myStack / bb <= 12 && pct <= 0.3 + style.aggro * 0.1 && la.canAllIn && (!facing || eq > odds)) return { type: 'allin' };
    if (!raised) {
      if (pct <= style.open && r < 0.5 + style.aggro * 0.5) return aggressive(0.75, 0.55) || callOrCheck();
      if (!facing) return { type: 'check' };                                     // 빅 블라인드
      return pct <= 0.45 + style.loose * 2 ? { type: 'call' } : { type: 'fold' };   // 림프
    }
    // 레이즈·올인을 받았을 때: 상대 범위 대비 승률로 판단
    if (pct <= 0.05 && eq > 0.55 && r < 0.4 + style.aggro * 0.5) return aggressive(1, 0.5) || callIfPriced(0);
    return callIfPriced(aggKind === 'allin' ? 0.01 : 0.04);
  }

  // ── 플랍 이후 ──
  const heads = others.length === 1;
  if (!facing) {
    if (eq > (heads ? 0.62 : 0.5) && r < 0.45 + style.aggro * 0.5) return aggressive(eq > 0.8 ? 0.8 : 0.6, 0.62) || { type: 'check' };
    if (heads && eq < 0.35 && r < style.bluff) return aggressive(0.5, 1.01) || { type: 'check' };  // 가끔 블러핑(올인 블러핑은 안 함)
    return { type: 'check' };
  }
  if (eq > 0.75 && r < 0.3 + style.aggro * 0.5) return aggressive(0.9, 0.68) || { type: 'call' };
  return callIfPriced(aggKind === 'allin' ? 0.01 : 0.03);
}

module.exports = { decide, equity, equityVs, rangeOf, handPct, observeDeal, observeAct, BOTS, BOT_NAMES, STYLES };
