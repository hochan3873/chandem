'use strict';
// 두 장 섯다: 화투 20장(1~10월 각 2장), 판돈을 걸고 두 장을 받은 뒤 베팅 한 바퀴, 족보로 승부.
// 베팅·팟 계산은 홀덤 Hand 를 그대로 물려받고, 카드·진행·족보만 바꾼다.
const crypto = require('crypto');
const { Hand, IllegalAction } = require('../engine/hand');
const { buildPots, distribute } = require('../engine/pots');

// 카드: 월(1~10) + A/B. A = 그 달의 특별한 패(1·3·8월은 광, 4·7·9월은 열끗)
function newSeotdaDeck() {
  const d = [];
  for (let m = 1; m <= 10; m++) d.push(`${m}A`, `${m}B`);
  return d;
}
function shuffleDeck(deck) {
  const d = deck.slice();
  for (let i = d.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
const month = (c) => parseInt(c, 10);
const isGwang = (c) => c.endsWith('A') && [1, 3, 8].includes(month(c));
const isYeol = (c) => c.endsWith('A') && [4, 7, 9].includes(month(c));

const MID = { '1-2': ['알리', 806], '1-4': ['독사', 805], '1-9': ['구삥', 804], '1-10': ['장삥', 803], '4-10': ['장사', 802], '4-6': ['세륙', 801] };

/**
 * 두 장의 기본 족보. rank 가 클수록 강하다.
 * special: 'ddaengjabi'(땡잡이) | 'amhaeng'(암행어사) | 'gusa'(구사) | 'mgusa'(멍텅구리구사) | null
 */
function rankSeotda(a, b) {
  const ma = month(a), mb = month(b);
  const lo = Math.min(ma, mb), hi = Math.max(ma, mb);
  const g = [a, b].filter(isGwang).map(month).sort((x, y) => x - y);
  if (g.length === 2) {
    if (g[0] === 3 && g[1] === 8) return { rank: 1000, name: '38광땡', tier: 'gwang' };
    if (g[0] === 1 && g[1] === 8) return { rank: 990, name: '18광땡', tier: 'gwang' };
    if (g[0] === 1 && g[1] === 3) return { rank: 980, name: '13광땡', tier: 'gwang' };
  }
  if (ma === mb) return { rank: 900 + ma, name: ma === 10 ? '장땡' : ma === 1 ? '삥땡' : `${ma}땡`, tier: 'ddaeng' };
  // 특수패 (기본 끗 값은 따로 가짐)
  const both = [a, b];
  if (lo === 3 && hi === 7 && both.some((c) => isGwang(c) && month(c) === 3) && both.some((c) => isYeol(c) && month(c) === 7)) {
    return { rank: 700, name: '땡잡이', tier: 'kkeut', special: 'ddaengjabi' };
  }
  if (lo === 4 && hi === 7 && both.every(isYeol)) return { rank: 701, name: '암행어사', tier: 'kkeut', special: 'amhaeng' };
  if (lo === 4 && hi === 9) {
    if (both.every(isYeol)) return { rank: 703, name: '멍텅구리구사', tier: 'kkeut', special: 'mgusa' };
    return { rank: 703, name: '구사', tier: 'kkeut', special: 'gusa' };
  }
  const mid = MID[`${lo}-${hi}`];
  if (mid) return { rank: mid[1], name: mid[0], tier: 'mid' };
  const k = (ma + mb) % 10;
  return { rank: 700 + k, name: k === 9 ? '갑오' : k === 0 ? '망통' : `${k}끗`, tier: 'kkeut' };
}

/** 세 장 중 가장 좋은 두 장 (기본 족보 기준) */
function bestPair(cards) {
  if (cards.length <= 2) return cards.slice();
  let best = null;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
    const r = rankSeotda(cards[i], cards[j]).rank;
    if (!best || r > best.r) best = { r, pair: [cards[i], cards[j]] };
  }
  return best.pair;
}

/**
 * 세 장 섯다: 각자 가장 좋은 두 장을 고른다. 땡잡이·암행어사처럼 상대 패에 따라
 * 더 좋은 조합이 있으면 그것으로 바꾼다 (한 번 더 살펴봄).
 */
function choosePairs(hands) {
  const chosen = {};
  for (const id of Object.keys(hands)) chosen[id] = bestPair(hands[id]);
  for (const id of Object.keys(hands)) {
    const cards = hands[id];
    if (cards.length <= 2) continue;
    let bestEff = resolveShowdown(chosen).eff[id];
    for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) {
      const trial = { ...chosen, [id]: [cards[i], cards[j]] };
      const x = resolveShowdown(trial);
      if (!x.redeal && x.eff[id] > bestEff) { bestEff = x.eff[id]; chosen[id] = [cards[i], cards[j]]; }
    }
  }
  return chosen;
}

/**
 * 쇼다운에서 실제 힘(땡잡이·암행어사가 잡는지)과 재경기 여부를 계산한다.
 * hands: { id: [c1, c2] } → { eff: {id: rank}, info: {id: rankSeotda}, redeal: null|'구사'|'멍텅구리구사' }
 */
function resolveShowdown(hands) {
  const ids = Object.keys(hands);
  const info = {};
  for (const id of ids) info[id] = rankSeotda(...hands[id]);
  const eff = {};
  for (const id of ids) eff[id] = info[id].rank;
  const bestOther = (id) => Math.max(0, ...ids.filter((x) => x !== id).map((x) => info[x].rank));
  for (const id of ids) {
    const s = info[id].special;
    const other = bestOther(id);
    // 땡잡이: 상대 최고가 1~9땡이면 그 땡을 잡는다(장땡·광땡은 못 잡음)
    if (s === 'ddaengjabi' && other >= 901 && other <= 909) eff[id] = 909.5;
    // 암행어사: 상대 최고가 13·18광땡이면 잡는다(38광땡은 못 잡음)
    if (s === 'amhaeng' && (other === 980 || other === 990)) eff[id] = 995;
  }
  let redeal = null;
  for (const id of ids) {
    const s = info[id].special;
    const other = Math.max(0, ...ids.filter((x) => x !== id).map((x) => eff[x]));
    if (s === 'gusa' && other <= 806) redeal = '구사';          // 상대가 알리 이하면 다시
    if (s === 'mgusa' && other <= 909) redeal = '멍텅구리구사';  // 상대가 9땡 이하면 다시
  }
  return { eff, info, redeal };
}

class SeotdaHand extends Hand {
  /** players, dealerIndex, bb(= 판돈), carry: { amount, ids } 재경기로 넘어온 판돈 */
  static create({ players, dealerIndex, bb, deck, carry, cards = 2 }) {
    const h = Object.create(SeotdaHand.prototype);
    h.init({ players, dealerIndex, bb, deck, carry, cards });
    return h;
  }

  init({ players, dealerIndex, bb, deck, carry, cards = 2 }) {
    if (players.length < 2) throw new Error('최소 2명이 필요합니다');
    this.kind = 'seotda';
    this.cardsPer = cards === 3 ? 3 : 2; // 두 장 섯다 / 세 장 섯다
    this.thirdDealt = false;
    this.sb = bb;
    this.bb = bb;
    this.dealerIndex = dealerIndex;
    this.deck = deck ? deck.slice() : shuffleDeck(newSeotdaDeck());
    this.board = [];
    this.stage = 'betting';
    this.log = [];
    this.result = null;
    this.finished = false;
    this.carry = carry && carry.amount > 0 ? { amount: carry.amount, ids: carry.ids.slice(), reason: carry.reason } : null;
    this.seats = players.map((p) => ({
      id: p.id, startStack: p.stack, stack: p.stack, hole: [], bet: 0, contributed: 0,
      folded: false, allIn: p.stack === 0, acted: false, lastActedLevel: 0, lastAction: null,
    }));
    const n = this.seats.length;
    this.sbIndex = dealerIndex;
    this.bbIndex = dealerIndex;
    // 모두 판돈을 낸다 (재경기는 이월된 판돈이 있으니 새로 내지 않음)
    if (!this.carry) {
      for (let i = 0; i < n; i++) if (this.seats[i].stack > 0) this.post(i, bb, '판돈');
    }
    // 판돈은 바로 팟으로 (베팅 기준은 0부터)
    for (const s of this.seats) { s.bet = 0; }
    for (let r = 0; r < 2; r++) {
      for (let k = 1; k <= n; k++) this.seats[(dealerIndex + k) % n].hole.push(this.draw());
    }
    this.currentBet = 0;
    this.minRaise = bb;
    this.toAct = -1;
    this.moveToNext(dealerIndex);
  }

  // 두 장 섯다는 베팅 한 바퀴 뒤 쇼다운, 세 장 섯다는 한 장 더 받고 한 바퀴 더
  endStreet() {
    if (this.finished) return;
    if (this.live.length === 1) { this.finishByFold(); return; }
    if (this.cardsPer === 3 && !this.thirdDealt) {
      this.thirdDealt = true;
      for (const s of this.seats) {
        s.bet = 0; s.acted = false; s.lastActedLevel = 0;
        if (!s.folded && !s.allIn) s.lastAction = null;
      }
      this.currentBet = 0;
      this.minRaise = this.bb;
      const n = this.seats.length;
      for (let k = 1; k <= n; k++) { const s = this.seats[(this.dealerIndex + k) % n]; if (!s.folded) s.hole.push(this.draw()); }
      this.stage = 'betting2';
      this.pushLog({ type: 'street', third: true, board: [] });
      if (this.canActCount <= 1) { this.showdown(); return; }
      this.moveToNext(this.dealerIndex);
      return;
    }
    this.showdown();
  }

  potsWithCarry() {
    const pots = buildPots(this.seats);
    if (this.carry) {
      const live = this.live.map((s) => s.id);
      if (pots.length) pots[0].amount += this.carry.amount;
      else pots.push({ amount: this.carry.amount, eligible: live });
    }
    return pots;
  }

  finishByFold() {
    const winner = this.live[0];
    const { payouts, potResults } = distribute(this.potsWithCarry(), () => 0, () => 0, this.orderFromButton());
    this.settle(payouts, { type: 'fold', winners: [winner.id], potResults, hands: {} });
  }

  showdown() {
    this.stage = 'showdown';
    const all = {};
    for (const s of this.live) all[s.id] = s.hole;
    const cards = choosePairs(all);
    const { eff, info, redeal } = resolveShowdown(cards);
    const hands = {};
    for (const s of this.live) {
      hands[s.id] = { hole: s.hole.slice(), best: cards[s.id].slice(), name: info[s.id].name, category: info[s.id].tier, rank: eff[s.id] };
    }
    if (redeal) {
      // 재경기: 팟은 그대로 다음 판으로 넘기고, 살아 있는 사람끼리 다시 친다
      const amount = this.totalPot;
      for (const s of this.seats) s.bet = 0;
      const deltas = {};
      for (const s of this.seats) deltas[s.id] = s.stack - s.startStack;
      this.toAct = -1;
      this.finished = true;
      const ids = this.live.map((s) => s.id);
      this.result = { type: 'showdown', redeal, carry: { amount, ids, reason: redeal }, winners: [], potResults: [], hands, board: [], payouts: {}, deltas };
      this.pushLog({ type: 'end', winners: [], result: 'redeal', redeal });
      return;
    }
    const { payouts, potResults } = distribute(this.potsWithCarry(), (id) => eff[id], (a, b) => a - b, this.orderFromButton());
    const winners = [...new Set(potResults.filter((p) => p.eligible.length > 1).flatMap((p) => p.winners))];
    this.settle(payouts, { type: 'showdown', winners: winners.length ? winners : potResults[0].winners, potResults, hands });
  }

  get totalPot() { return this.seats.reduce((a, s) => a + s.contributed, 0) + (this.carry ? this.carry.amount : 0); }
  get collectedPot() { return this.totalPot - this.seats.reduce((a, s) => a + s.bet, 0); }

  toJSON() { return { ...this, kind: 'seotda' }; }
  static fromJSON(obj) {
    const h = Object.create(SeotdaHand.prototype);
    Object.assign(h, obj);
    return h;
  }
}

module.exports = { SeotdaHand, rankSeotda, resolveShowdown, bestPair, choosePairs, newSeotdaDeck, isGwang, isYeol, IllegalAction };
