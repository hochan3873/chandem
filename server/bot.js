'use strict';
// 연습용 봇의 판단. 몬테카를로로 승률을 어림하고 팟 오즈와 비교해 행동을 고른다.
const { newDeck, bestHand, compareScore } = require('./engine/cards');

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
// 성격: 느슨함(콜 폭) · 공격성(베팅 빈도) · 블러핑
const STYLES = [
  { loose: 0.05, aggro: 0.5, bluff: 0.06 },   // 신중
  { loose: 0.12, aggro: 0.7, bluff: 0.12 },   // 공격
  { loose: 0.18, aggro: 0.4, bluff: 0.08 },   // 콜 많음
];

function equity(hole, board, opponents, iters = 250) {
  const used = new Set([...hole, ...board]);
  const rest = newDeck().filter((c) => !used.has(c));
  let win = 0;
  for (let i = 0; i < iters; i++) {
    // 필요한 장수만 섞어서 뽑기
    const need = 5 - board.length + opponents * 2;
    const d = rest.slice();
    for (let k = 0; k < need; k++) {
      const j = k + Math.floor(Math.random() * (d.length - k));
      [d[k], d[j]] = [d[j], d[k]];
    }
    const full = board.concat(d.slice(0, 5 - board.length));
    const mine = bestHand(hole.concat(full)).score;
    let best = 1, ties = 1;
    for (let o = 0; o < opponents; o++) {
      const at = 5 - board.length + o * 2;
      const c = compareScore(mine, bestHand([d[at], d[at + 1]].concat(full)).score);
      if (c < 0) { best = 0; break; }
      if (c === 0) ties++;
    }
    if (best) win += 1 / ties;
  }
  return win / iters;
}

/** hand: 엔진 Hand, id: 봇 id, style: STYLES 중 하나 → { type, amount? } */
function decide(hand, id, style = STYLES[0]) {
  const la = hand.legalActions(id);
  const seat = hand.seatOf(id);
  const opponents = Math.max(1, hand.seats.filter((s) => !s.folded && s.id !== id).length);
  const eq = equity(seat.hole, hand.board, Math.min(opponents, 4));
  const rel = eq * (Math.min(opponents, 4) + 1);          // 1 = 평균적인 패
  const pot = hand.totalPot;
  const facing = la.toCall > 0;
  const odds = facing ? la.toCall / (pot + la.toCall) : 0;
  // 상대 베팅이 팟에 비해 얼마나 큰지, 내 칩의 몇 %를 걸어야 하는지
  const pressure = facing ? Math.min(1.5, la.toCall / Math.max(hand.bb, pot - la.toCall)) : 0;
  const commit = la.toCall / Math.max(1, seat.stack + seat.bet);
  const preflop = hand.board.length === 0;
  const r = Math.random();

  const sizeTo = (frac) => {
    const base = la.currentBet === 0 ? 0 : la.currentBet;
    let to = Math.round((base + Math.max(pot, hand.bb * 2) * frac) / hand.bb) * hand.bb;
    return Math.max(la.minTo, Math.min(la.maxTo, to));
  };
  const aggressive = (frac) => {
    if (!la.canBet && !la.canRaise) return null;
    const to = sizeTo(frac);
    // 칩 대부분을 거는 크기면 정말 좋은 패일 때만 올인, 아니면 그냥 콜/체크
    if (to >= la.maxTo * 0.8) return eq > 0.8 || rel > 3 ? { type: 'allin' } : null;
    return { type: la.canBet ? 'bet' : 'raise', amount: to };
  };
  const passive = () => (la.canCheck ? { type: 'check' } : { type: 'call' });
  const fold = () => (la.canCheck ? { type: 'check' } : { type: 'fold' });

  if (preflop) {
    const raised = la.currentBet > hand.bb;
    if (!raised && rel > 1.6 - style.aggro * 0.2 && r < 0.4 + style.aggro * 0.5) return aggressive(0.75) || passive();
    if (raised && rel > 2.1 && pressure < 0.9 && r < style.aggro) return aggressive(0.9) || passive();
    if (!facing) return { type: 'check' };
    const need = raised ? 1.2 + 0.5 * pressure + commit * 1.5 - style.loose * 2 : 1.05 - style.loose * 2;
    return rel > need ? { type: 'call' } : fold();
  }

  // 플랍 이후: 상대가 베팅했으면 상대 패가 더 좋을 가능성을 반영해 승률을 깎는다
  const adj = eq - (facing ? 0.05 + 0.1 * Math.min(1, pressure) : 0);
  const strong = eq > 0.25 + 0.47 / Math.sqrt(opponents);
  const good = eq > 0.15 + 0.4 / Math.sqrt(opponents);
  if (strong && (!facing || pressure < 0.7) && r < 0.3 + style.aggro * 0.6) return aggressive(eq > 0.85 ? 0.9 : 0.65) || passive();
  if (!facing) {
    if (good && r < style.aggro * 0.8) return aggressive(0.55) || passive();
    if (opponents <= 2 && r < style.bluff * 1.5) return aggressive(0.45) || passive();
    return { type: 'check' };
  }
  const need = odds + 0.03 - style.loose * 0.5 + commit * 0.4;
  if (adj > need) return { type: 'call' };
  return { type: 'fold' };
}

module.exports = { decide, equity, BOTS, BOT_NAMES, STYLES };
