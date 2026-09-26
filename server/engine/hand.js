'use strict';
const { newDeck, shuffle, bestHand, compareScore } = require('./cards');
const { buildPots, distribute } = require('./pots');

const STAGE_NAMES = { preflop: '프리플랍', flop: '플랍', turn: '턴', river: '리버', showdown: '쇼다운' };

class IllegalAction extends Error {}

/**
 * 한 판(핸드)의 진행을 담당하는 순수 로직. 타이머·네트워크는 모른다.
 * players: [{ id, stack }] — 자리 순서(시계방향)
 * dealerIndex: players 배열 안에서 딜러 버튼 위치
 */
class Hand {
  constructor({ players, dealerIndex, sb, bb, deck }) {
    if (players.length < 2) throw new Error('최소 2명이 필요합니다');
    this.sb = sb;
    this.bb = bb;
    this.dealerIndex = dealerIndex;
    this.deck = deck ? deck.slice() : shuffle(newDeck());
    this.board = [];
    this.stage = 'preflop';
    this.log = [];
    this.result = null;
    this.finished = false;
    this.seats = players.map((p) => ({
      id: p.id,
      startStack: p.stack,
      stack: p.stack,
      hole: [],
      bet: 0,
      contributed: 0,
      folded: false,
      allIn: false,
      acted: false,
      lastActedLevel: 0,
      lastAction: null,
    }));

    const n = this.seats.length;
    if (n === 2) {
      this.sbIndex = dealerIndex;
      this.bbIndex = (dealerIndex + 1) % n;
    } else {
      this.sbIndex = (dealerIndex + 1) % n;
      this.bbIndex = (dealerIndex + 2) % n;
    }

    // 홀카드 2장씩: 스몰 블라인드부터 시계방향
    for (let r = 0; r < 2; r++) {
      for (let k = 0; k < n; k++) this.seats[(this.sbIndex + k) % n].hole.push(this.draw());
    }

    this.currentBet = 0;
    this.minRaise = bb;
    this.post(this.sbIndex, sb, '스몰 블라인드');
    this.post(this.bbIndex, bb, '빅 블라인드');
    this.currentBet = bb; // 빅 블라인드가 짧게 올인했어도 콜 기준은 빅 블라인드 전액
    this.toAct = -1;
    this.moveToNext(this.bbIndex);
  }

  draw() { return this.deck.shift(); }

  seatOf(id) { return this.seats.find((s) => s.id === id); }
  indexOf(id) { return this.seats.findIndex((s) => s.id === id); }

  post(i, amount, label) {
    const s = this.seats[i];
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    s.bet += pay;
    s.contributed += pay;
    if (s.stack === 0) s.allIn = true;
    this.pushLog({ type: 'blind', id: s.id, amount: pay, label });
  }

  pushLog(entry) {
    this.log.push({ ...entry, stage: this.stage });
  }

  get currentId() { return this.toAct >= 0 ? this.seats[this.toAct].id : null; }
  get live() { return this.seats.filter((s) => !s.folded); }
  get canActCount() { return this.seats.filter((s) => !s.folded && !s.allIn).length; }

  needsAction(s) {
    if (s.folded || s.allIn) return false;
    if (s.acted && s.bet >= this.currentBet) return false;
    // 혼자만 칩이 남았고 이미 맞춰 놓았다면 더 할 일이 없다 (나머지 전원 올인)
    if (this.canActCount === 1 && s.bet >= this.currentBet) return false;
    return true;
  }

  moveToNext(fromIndex) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (fromIndex + k) % n;
      if (this.needsAction(this.seats[i])) { this.toAct = i; return; }
    }
    this.toAct = -1;
    this.endStreet();
  }

  /** 현재 차례인 플레이어가 할 수 있는 행동 */
  legalActions(id) {
    const s = this.seatOf(id);
    if (this.finished || !s || this.currentId !== id) return null;
    const toCall = Math.max(0, this.currentBet - s.bet);
    const maxTo = s.bet + s.stack;
    const reopened = !s.acted || this.currentBet - s.lastActedLevel >= this.minRaise;
    const la = {
      toCall,
      callAmount: Math.min(toCall, s.stack),
      stack: s.stack,
      currentBet: this.currentBet,
      myBet: s.bet,
      canFold: toCall > 0,
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canBet: false,
      canRaise: false,
      minTo: 0,
      maxTo,
      canAllIn: false,
    };
    if (this.currentBet === 0) {
      la.canBet = s.stack > 0;
      la.minTo = Math.min(this.bb, maxTo);
      la.canAllIn = s.stack > 0;
    } else if (s.stack > toCall && reopened) {
      la.canRaise = true;
      la.minTo = Math.min(this.currentBet + this.minRaise, maxTo);
      la.canAllIn = true;
    }
    if (s.stack > 0 && s.stack <= toCall) la.canAllIn = true; // 칩이 모자란 콜 = 올인 콜
    return la;
  }

  /** action: { type: fold|check|call|bet|raise|allin, amount?(베팅/레이즈 후 총액) } */
  act(id, action) {
    const la = this.legalActions(id);
    if (!la) throw new IllegalAction('지금은 내 차례가 아닙니다');
    const s = this.seatOf(id);
    const type = action && action.type;

    if (type === 'fold') {
      if (!la.canFold) throw new IllegalAction('체크할 수 있을 때는 폴드할 수 없습니다');
      s.folded = true;
      this.record(s, 'fold', 0);
    } else if (type === 'check') {
      if (!la.canCheck) throw new IllegalAction('콜할 금액이 있어 체크할 수 없습니다');
      this.record(s, 'check', 0);
    } else if (type === 'call') {
      if (!la.canCall) throw new IllegalAction('콜할 금액이 없습니다');
      this.putTo(s, s.bet + la.callAmount);
      this.record(s, s.allIn ? 'allin' : 'call', la.callAmount);
    } else if (type === 'bet' || type === 'raise') {
      const to = Math.floor(Number(action.amount));
      if (!Number.isFinite(to)) throw new IllegalAction('금액을 입력해 주세요');
      if (type === 'bet' && !la.canBet) throw new IllegalAction('지금은 베팅할 수 없습니다');
      if (type === 'raise' && !la.canRaise) throw new IllegalAction('지금은 레이즈할 수 없습니다');
      if (to > la.maxTo) throw new IllegalAction('보유 칩보다 많이 걸 수 없습니다');
      if (to < la.minTo) throw new IllegalAction(`최소 ${la.minTo}까지 걸어야 합니다`);
      const add = to - s.bet;
      this.putTo(s, to);
      this.record(s, s.allIn ? 'allin' : type, add);
    } else if (type === 'allin') {
      if (!la.canAllIn) throw new IllegalAction('지금은 올인할 수 없습니다');
      const add = s.stack;
      this.putTo(s, s.bet + s.stack);
      this.record(s, 'allin', add);
    } else {
      throw new IllegalAction('알 수 없는 행동입니다');
    }
    this.afterAction();
  }

  putTo(s, to) {
    const add = to - s.bet;
    s.stack -= add;
    s.bet = to;
    s.contributed += add;
    if (s.stack === 0) s.allIn = true;
    if (to > this.currentBet) {
      const inc = to - this.currentBet;
      if (inc >= this.minRaise) this.minRaise = inc; // 완전한 레이즈만 최소 레이즈 폭을 바꾼다
      this.currentBet = to;
    }
  }

  record(s, type, amount) {
    s.acted = true;
    s.lastActedLevel = this.currentBet;
    s.lastAction = type;
    this.pushLog({ type, id: s.id, amount, to: s.bet });
  }

  /** 시간 초과: 체크가 되면 체크, 아니면 폴드 */
  autoAct(id) {
    const la = this.legalActions(id);
    if (!la) return null;
    const type = la.canCheck ? 'check' : 'fold';
    this.act(id, { type });
    return type;
  }

  /** 나가거나 강퇴된 사람: 차례와 상관없이 폴드 처리 */
  forceFold(id) {
    const s = this.seatOf(id);
    if (!s || s.folded || this.finished) return;
    if (this.currentId === id) {
      s.folded = true;
      this.record(s, 'fold', 0);
      this.afterAction();
      return;
    }
    s.folded = true;
    s.lastAction = 'fold';
    this.pushLog({ type: 'fold', id: s.id, amount: 0, forced: true });
    if (this.live.length === 1) this.finishByFold();
    else if (this.toAct === -1) this.moveToNext(this.dealerIndex);
  }

  afterAction() {
    if (this.live.length === 1) { this.finishByFold(); return; }
    this.moveToNext(this.toAct);
  }

  endStreet() {
    if (this.finished) return;
    if (this.live.length === 1) { this.finishByFold(); return; }
    if (this.stage === 'river') { this.showdown(); return; }
    if (this.canActCount <= 1) {
      // 더 이상 베팅할 사람이 없으면 남은 카드를 모두 깔고 쇼다운
      while (this.stage !== 'river') this.nextStage();
      this.showdown();
      return;
    }
    this.nextStage();
    this.moveToNext(this.dealerIndex);
  }

  nextStage() {
    for (const s of this.seats) {
      s.bet = 0;
      s.acted = false;
      s.lastActedLevel = 0;
      if (!s.folded && !s.allIn) s.lastAction = null;
    }
    this.currentBet = 0;
    this.minRaise = this.bb;
    this.draw(); // 번 카드
    if (this.stage === 'preflop') { this.stage = 'flop'; this.board.push(this.draw(), this.draw(), this.draw()); }
    else if (this.stage === 'flop') { this.stage = 'turn'; this.board.push(this.draw()); }
    else if (this.stage === 'turn') { this.stage = 'river'; this.board.push(this.draw()); }
    this.pushLog({ type: 'street', board: this.board.slice() });
  }

  orderFromButton() {
    const n = this.seats.length;
    const out = [];
    for (let k = 1; k <= n; k++) out.push(this.seats[(this.dealerIndex + k) % n].id);
    return out;
  }

  finishByFold() {
    const pots = buildPots(this.seats);
    const winner = this.live[0];
    const { payouts, potResults } = distribute(pots, () => 0, () => 0, this.orderFromButton());
    this.settle(payouts, { type: 'fold', winners: [winner.id], potResults, hands: {} });
  }

  showdown() {
    this.stage = 'showdown';
    const hands = {};
    for (const s of this.live) {
      const b = bestHand(s.hole.concat(this.board));
      hands[s.id] = { hole: s.hole.slice(), best: b.cards, name: b.name, category: b.score.category, score: b.score };
    }
    const pots = buildPots(this.seats);
    const { payouts, potResults } = distribute(
      pots, (id) => hands[id].score, compareScore, this.orderFromButton(),
    );
    const winners = [...new Set(potResults.filter((p) => p.eligible.length > 1).flatMap((p) => p.winners))];
    this.settle(payouts, { type: 'showdown', winners: winners.length ? winners : potResults[0].winners, potResults, hands });
  }

  settle(payouts, info) {
    for (const s of this.seats) {
      s.stack += payouts[s.id] || 0;
      s.bet = 0;
    }
    const deltas = {};
    for (const s of this.seats) deltas[s.id] = s.stack - s.startStack;
    this.toAct = -1;
    this.finished = true;
    this.result = { ...info, board: this.board.slice(), payouts, deltas };
    this.pushLog({ type: 'end', winners: info.winners, result: info.type });
  }

  get totalPot() { return this.seats.reduce((a, s) => a + s.contributed, 0); }
  get collectedPot() { return this.seats.reduce((a, s) => a + s.contributed - s.bet, 0); }
  potsView() { return buildPots(this.seats).map((p) => ({ amount: p.amount, eligible: p.eligible })); }

  toJSON() {
    return { ...this };
  }

  static fromJSON(obj) {
    const h = Object.create(Hand.prototype);
    Object.assign(h, obj);
    return h;
  }
}

module.exports = { Hand, IllegalAction, STAGE_NAMES };
