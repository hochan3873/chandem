// 서버 server/engine/cards.js 의 족보 판정을 그대로 옮긴 것 (내 현재 족보 표시용)
const RANKS = '23456789TJQKA';
function rankValue(card) { return RANKS.indexOf(card[0]) + 2; }

// ── 족보 판정 ──────────────────────────────────────────
// category: 0 하이카드 … 8 스트레이트 플러시 (로열은 8 + 탑 A)
const CATEGORY_NAMES = [
  '하이 카드', '원 페어', '투 페어', '트리플', '스트레이트',
  '플러시', '풀 하우스', '포카드', '스트레이트 플러시',
];

// 5장 평가 → { category, tiebreak: number[] }
function evaluate5(cards) {
  const vals = cards.map(rankValue).sort((a, b) => b - a);
  const suits = cards.map((c) => c[1]);
  const flush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // A-2-3-4-5 휠
  }

  // 같은 숫자 묶음: (개수 내림차순, 숫자 내림차순)
  const counts = new Map();
  for (const v of vals) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const byGroup = groups.map((g) => g[0]);

  if (straightHigh && flush) return { category: 8, tiebreak: [straightHigh] };
  if (groups[0][1] === 4) return { category: 7, tiebreak: byGroup };
  if (groups[0][1] === 3 && groups[1][1] === 2) return { category: 6, tiebreak: byGroup };
  if (flush) return { category: 5, tiebreak: vals };
  if (straightHigh) return { category: 4, tiebreak: [straightHigh] };
  if (groups[0][1] === 3) return { category: 3, tiebreak: byGroup };
  if (groups[0][1] === 2 && groups[1][1] === 2) return { category: 2, tiebreak: byGroup };
  if (groups[0][1] === 2) return { category: 1, tiebreak: byGroup };
  return { category: 0, tiebreak: vals };
}

function compareScore(a, b) {
  if (a.category !== b.category) return a.category - b.category;
  for (let i = 0; i < Math.max(a.tiebreak.length, b.tiebreak.length); i++) {
    const d = (a.tiebreak[i] || 0) - (b.tiebreak[i] || 0);
    if (d !== 0) return d;
  }
  return 0;
}

function combinations(arr, k) {
  const out = [];
  const pick = (start, acc) => {
    if (acc.length === k) { out.push(acc.slice()); return; }
    for (let i = start; i < arr.length; i++) { acc.push(arr[i]); pick(i + 1, acc); acc.pop(); }
  };
  pick(0, []);
  return out;
}

// 5~7장 중 최선의 5장
export function bestHand(cards) {
  let best = null;
  for (const five of combinations(cards, 5)) {
    const score = evaluate5(five);
    if (!best || compareScore(score, best.score) > 0) best = { score, cards: five };
  }
  const { category, tiebreak } = best.score;
  // 보여줄 때 보기 좋게: 족보를 이루는 카드 먼저
  const order = (c) => {
    const v = rankValue(c);
    const idx = tiebreak.indexOf(v);
    return idx === -1 ? 99 : idx;
  };
  let display = best.cards.slice().sort((a, b) => order(a) - order(b) || rankValue(b) - rankValue(a));
  if (category === 4 || category === 8) {
    display = best.cards.slice().sort((a, b) => {
      const va = tiebreak[0] === 5 && rankValue(a) === 14 ? 1 : rankValue(a);
      const vb = tiebreak[0] === 5 && rankValue(b) === 14 ? 1 : rankValue(b);
      return vb - va;
    });
  }
  return { score: best.score, cards: display, name: handName(best.score) };
}

const RANK_NAMES = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: '10' };
function rn(v) { return RANK_NAMES[v] || String(v); }

function handName(score) {
  const t = score.tiebreak;
  switch (score.category) {
    case 8: return t[0] === 14 ? '로열 플러시' : `${rn(t[0])} 하이 스트레이트 플러시`;
    case 7: return `${rn(t[0])} 포카드`;
    case 6: return `풀 하우스 (${rn(t[0])} 트리플 + ${rn(t[1])} 페어)`;
    case 5: return `${rn(t[0])} 하이 플러시`;
    case 4: return `${rn(t[0])} 하이 스트레이트`;
    case 3: return `${rn(t[0])} 트리플`;
    case 2: return `투 페어 (${rn(t[0])}, ${rn(t[1])})`;
    case 1: return `${rn(t[0])} 원 페어`;
    default: return `${rn(t[0])} 하이 카드`;
  }
}

