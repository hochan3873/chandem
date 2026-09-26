'use strict';
// 연습용 봇의 판단. 몬테카를로로 승률을 어림하고 팟 오즈와 비교해 행동을 고른다.
const { newDeck, bestHand, compareScore } = require('./engine/cards');

const BOT_NAMES = ['철수봇', '영희봇', '민수봇', '지현봇', '태오봇', '하나봇', '도윤봇', '서아봇'];
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
  const pot = hand.totalPot;
  const odds = la.toCall > 0 ? la.toCall / (pot + la.toCall) : 0;
  const r = Math.random();
  const strong = eq > 0.7 || (opponents === 1 && eq > 0.62);
  const good = eq > 0.5 / Math.sqrt(opponents) + 0.12;

  const sizeTo = (frac) => {
    const base = la.currentBet === 0 ? 0 : la.currentBet;
    let to = Math.round((base + Math.max(pot, hand.bb * 2) * frac) / hand.bb) * hand.bb;
    to = Math.max(la.minTo, Math.min(la.maxTo, to));
    return to;
  };
  const aggressive = (frac) => {
    if (la.canBet) return la.maxTo <= sizeTo(frac) ? { type: 'allin' } : { type: 'bet', amount: sizeTo(frac) };
    if (la.canRaise) return la.maxTo <= sizeTo(frac) ? { type: 'allin' } : { type: 'raise', amount: sizeTo(frac) };
    return null;
  };
  const passive = () => (la.canCheck ? { type: 'check' } : la.canCall ? { type: 'call' } : { type: 'allin' });

  if (strong && r < 0.35 + style.aggro * 0.6) return aggressive(eq > 0.85 ? 1 : 0.75) || passive();
  if (good && r < style.aggro * 0.5) return aggressive(0.5) || passive();
  if (la.canCheck) {
    if (r < style.bluff) return aggressive(0.5) || { type: 'check' };
    return { type: 'check' };
  }
  // 콜할지: 승률이 팟 오즈보다 높으면(성격만큼 여유)
  if (eq + style.loose > odds) return { type: la.canCall ? 'call' : 'allin' };
  if (r < style.bluff * 0.5 && la.canRaise) return aggressive(0.75);
  return { type: 'fold' };
}

module.exports = { decide, equity, BOT_NAMES, STYLES };
