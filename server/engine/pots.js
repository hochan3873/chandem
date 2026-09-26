'use strict';

/**
 * 판 전체에 낸 금액(contributed)으로 메인 팟·사이드 팟을 나눈다.
 * players: [{ id, contributed, folded }]
 * 반환: [{ amount, eligible: [id...] }]  (앞쪽이 메인 팟)
 * - 폴드한 사람의 칩도 팟에 들어가지만 받을 자격은 없다.
 * - 한 명만 자격이 있는 맨 윗단(아무도 안 받은 베팅)은 그 사람에게 돌아간다.
 */
function buildPots(players) {
  const levels = [...new Set(players.map((p) => p.contributed).filter((c) => c > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) {
      amount += Math.min(p.contributed, level) - Math.min(p.contributed, prev);
    }
    const eligible = players.filter((p) => !p.folded && p.contributed >= level).map((p) => p.id);
    if (amount > 0) {
      if (eligible.length === 0 && pots.length > 0) {
        // 자격자가 없는 단(이론상 거의 없음)은 바로 아래 팟에 합친다
        pots[pots.length - 1].amount += amount;
      } else {
        const last = pots[pots.length - 1];
        if (last && sameSet(last.eligible, eligible)) last.amount += amount;
        else pots.push({ amount, eligible });
      }
    }
    prev = level;
  }
  return pots;
}

function sameSet(a, b) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/**
 * 팟 분배. ranking(id) → 비교 가능한 점수, compare(a,b)
 * orderFromButton: 딜러 왼쪽부터 시계방향 id 순서 (남는 칩은 이 순서로 1개씩)
 * 반환: { payouts: {id: amount}, potResults: [{amount, eligible, winners}] }
 */
function distribute(pots, scoreOf, compare, orderFromButton) {
  const payouts = {};
  const potResults = [];
  for (const pot of pots) {
    let winners = [];
    if (pot.eligible.length === 1) {
      winners = [pot.eligible[0]];
    } else {
      let best = null;
      for (const id of pot.eligible) {
        const s = scoreOf(id);
        const c = best === null ? 1 : compare(s, best);
        if (c > 0) { best = s; winners = [id]; } else if (c === 0) winners.push(id);
      }
    }
    winners.sort((a, b) => orderFromButton.indexOf(a) - orderFromButton.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const w of winners) {
      payouts[w] = (payouts[w] || 0) + share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }
    potResults.push({ amount: pot.amount, eligible: pot.eligible.slice(), winners });
  }
  return { payouts, potResults };
}

module.exports = { buildPots, distribute };
