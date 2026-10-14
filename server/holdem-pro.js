'use strict';
// 찬덤 홀덤 '내 지갑 · 연습 테이블 · 실력 티어'
//  · 지갑: 연습 테이블(상주 플레이어와 치는 판)에 들고 들어가는 칩. 무한이 아니고, 기본금 아래로 떨어지면 하루 3번까지 기본금으로 충전
//  · 손님(비회원)도 이 기기 열쇠(guest id + key)로 지갑·기록이 쌓이고, 나중에 로그인하면 계정으로 옮겨 간다
//  · 실력 티어: 연습 테이블 판마다 내 행동을 기록해 점수를 낸다 (포커 HUD 지표 + 결정 품질 + 심리)
//    - 프리플랍 규율(P): 자리별 참고 범위 안의 패로만 들어갔나 · 림프 · VPIP-PFR 간격
//    - 결정 품질(D): 리버·올인처럼 승부가 정해지는 결정에서 팟 오즈대로 했나 (실제 상대 패 기준 승률)
//    - 공격성(A): AF · AFq 가 이기는 사람 범위(2~3.5 · 45~60%)인가
//    - 쇼다운(S): WTSD 24~30% · W$SD 50% 이상
//    - 결과(R): 판당 BB 손익(bb/100), 판이 적으면 0 쪽으로 강하게 당김 (운 보정)
//    - 심리(Ψ): 큰 판을 진 뒤 7판 동안 VPIP 가 평소보다 크게 오르면 '틸트'
//    참고: deucescracked HUD stats · blackrain79 6-max/풀링 목표치 · AIVAT(결과보다 결정 품질) · Poker Arena composure 지표
const crypto = require('crypto');
const { newDeck, bestHand, compareScore } = require('./engine/cards');
const bot = require('./bot');

const BASE = 10000;          // 기본금 (처음 지갑 · 하루 충전 금액)
const REFILLS_PER_DAY = 3;   // 기본금 아래로 떨어졌을 때 하루 충전 횟수
const KV_KEY = 'holdem:pro';
const SAVE_MS = 4000;

// 연습 테이블 (상주 플레이어와 치는 판). buy = [최소, 최대] 바이인
const TABLES = [
  { id: 'starter', name: '입문 테이블', desc: '처음이라면 여기서', sb: 10, bb: 20, buy: [1000, 4000], seats: 6, style: 'easy' },
  { id: 'town', name: '동네 고수', desc: '6명 · 블라인드 50/100', sb: 50, bb: 100, buy: [5000, 20000], seats: 6 },
  { id: 'heads', name: '1:1 맞대결', desc: '상대 한 명과 정면 승부', sb: 25, bb: 50, buy: [2500, 10000], seats: 2 },
  { id: 'lounge', name: '라운지', desc: '9명 큰 테이블 · 200/400', sb: 200, bb: 400, buy: [20000, 80000], seats: 9 },
  { id: 'high', name: '하이롤러', desc: '큰손들만 · 1000/2000', sb: 1000, bb: 2000, buy: [100000, 400000], seats: 6 },
];

// 티어 (점수 0~100, 위 티어는 판 수가 모자라면 한 칸 아래)
const TIERS = [
  { min: 86, name: '그랜드마스터', key: 'gm', color: '#ff5d73', hands: 800 },
  { min: 75, name: '마스터', key: 'master', color: '#c77dff', hands: 400 },
  { min: 64, name: '다이아', key: 'dia', color: '#6fd3ff', hands: 150 },
  { min: 53, name: '플래티넘', key: 'plat', color: '#4fe0c1', hands: 0 },
  { min: 42, name: '골드', key: 'gold', color: '#ffd35a', hands: 0 },
  { min: 30, name: '실버', key: 'silver', color: '#cfd8e3', hands: 0 },
  { min: -Infinity, name: '브론즈', key: 'bronze', color: '#d59a6a', hands: 0 },
];
const PLACEMENT = 30; // 이보다 적으면 '배치 중'

// 출석: 7일 연속이면 큰 보상, 그 뒤로 다시 1일째부터
const CHECKIN = [1000, 1500, 2000, 2500, 3000, 4000, 10000];
// 오늘의 미션: 날마다 3개 (날짜로 고름) · 연습 테이블 판으로 센다
const MISSIONS = {
  play10: { name: '연습 테이블 10판 치기', goal: 10, reward: 2000, f: (x) => 1 },
  play25: { name: '연습 테이블 25판 치기', goal: 25, reward: 4000, f: (x) => 1 },
  win3: { name: '3판 이기기', goal: 3, reward: 2000, f: (x) => x.won },
  win8: { name: '8판 이기기', goal: 8, reward: 4000, f: (x) => x.won },
  sd2: { name: '끝까지 가서 2번 이기기', goal: 2, reward: 3000, f: (x) => x.sdWon },
  twopair: { name: '투페어 이상으로 이기기', goal: 2, reward: 2500, f: (x) => (x.won && x.cat >= 2 ? 1 : 0) },
  straight: { name: '스트레이트 이상으로 이기기', goal: 1, reward: 4000, f: (x) => (x.won && x.cat >= 4 ? 1 : 0) },
  raise5: { name: '프리플랍에 레이즈로 5번 들어가기', goal: 5, reward: 1500, f: (x) => x.pfr },
  bigpot: { name: '빅블라인드 30개 넘는 팟 이기기', goal: 1, reward: 3000, f: (x) => (x.won && x.potBB >= 30 ? 1 : 0) },
  good5: { name: '큰 결정 맞게 하기 5번', goal: 5, reward: 3000, f: (x) => x.decOk },
};
const MISSION_KEYS = Object.keys(MISSIONS);
// 업적 (한 번만 · 칩 보상)
const ACHIEVEMENTS = {
  first_win: { name: '첫 승리', desc: '연습 테이블에서 처음 이기기', reward: 1000, icon: '🏅' },
  hands100: { name: '100판 돌파', desc: '연습 테이블 100판', reward: 3000, icon: '💯' },
  hands500: { name: '500판 돌파', desc: '연습 테이블 500판', reward: 10000, icon: '🎖️' },
  hands1000: { name: '1000판의 사나이', desc: '연습 테이블 1000판', reward: 20000, icon: '🏆' },
  streak5: { name: '5연승', desc: '다섯 판 연속 이기기', reward: 5000, icon: '🔥' },
  flush: { name: '플러시', desc: '플러시로 이기기', reward: 2000, icon: '♦️' },
  fullhouse: { name: '풀하우스', desc: '풀하우스로 이기기', reward: 3000, icon: '🏠' },
  quads: { name: '포카드', desc: '포카드로 이기기', reward: 10000, icon: '🍀' },
  sflush: { name: '스트레이트 플러시', desc: '스트레이트 플러시로 이기기', reward: 30000, icon: '🌈' },
  royal: { name: '로열 플러시', desc: '꿈의 족보로 이기기', reward: 100000, icon: '👑' },
  bigpot100: { name: '대박 팟', desc: '빅블라인드 100개 넘는 팟 이기기', reward: 5000, icon: '💰' },
  gold: { name: '골드 달성', desc: '실력 티어 골드', reward: 5000, icon: '🥇' },
  dia: { name: '다이아 달성', desc: '실력 티어 다이아', reward: 20000, icon: '💎' },
  master: { name: '마스터 달성', desc: '실력 티어 마스터', reward: 50000, icon: '🎓' },
  refer1: { name: '친구 초대', desc: '초대한 친구가 첫 판 치기', reward: 0, icon: '🤝' },
  daily1: { name: '정기전 우승', desc: '정기 토너먼트 1등', reward: 0, icon: '🏆' },
  week7: { name: '7일 개근', desc: '7일 연속 출석', reward: 0, icon: '📅' },
};
// 꾸미기 상점: 카드 뒷면 · 테이블 색 (칩으로 사고 바로 적용)
const SHOP = [
  { id: 'back-red', kind: 'back', name: '클래식 레드', price: 0 },
  { id: 'back-navy', kind: 'back', name: '네이비 블루', price: 15000 },
  { id: 'back-black', kind: 'back', name: '블랙 골드', price: 30000 },
  { id: 'back-mint', kind: 'back', name: '민트 체크', price: 20000 },
  { id: 'back-paw', kind: 'back', name: '동물 발자국', price: 40000 },
  { id: 'felt-red', kind: 'felt', name: '레드 벨벳', price: 0 },
  { id: 'felt-green', kind: 'felt', name: '카지노 그린', price: 25000 },
  { id: 'felt-blue', kind: 'felt', name: '로열 블루', price: 35000 },
  { id: 'felt-purple', kind: 'felt', name: '퍼플 나이트', price: 50000 },
  { id: 'felt-black', kind: 'felt', name: '블랙 다이아', price: 80000 },
];
const REFER_REWARD = 5000; const REFER_MAX = 20;
// 정기 토너먼트: 매일 밤 9시(한국 시간) · 10분 전부터 등록 · 상금은 지갑으로
const DAILY = { hour: 21, openMin: 10, startChips: 5000, prizes: [30000, 15000, 7000] };

const kstDay = (t) => new Date(t + 9 * 3600 * 1000).toISOString().slice(0, 10);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const band = (x, lo, hi, soft) => (x >= lo && x <= hi ? 100 : 100 * Math.max(0, 1 - (x < lo ? lo - x : x - hi) / soft));
const shrink = (k, n, p0, m = 30) => (k + m * p0) / (n + m);
const hashKey = (k) => crypto.createHash('sha256').update(String(k)).digest('hex').slice(0, 32);

function emptyStats() {
  return {
    hands: 0, won: 0, net: 0, netBB: 0, vpip: 0, pfr: 0, limpOpp: 0, limp: 0,
    aggB: 0, aggC: 0, aggF: 0, sawFlop: 0, sd: 0, sdWon: 0, wwsf: 0,
    judged: 0, inRange: 0, dec: 0, decOk: 0, decW: 0, decOkW: 0,
    postN: 0, postV: 0, baseN: 0, baseV: 0, tiltLeft: 0, bigLoss: 0,
    best: null, bestRank: -1, bigPot: 0,
  };
}

// ── 한 판에서 내 행동 뽑기 ─────────────────────────────
// 자리 이름: 버튼에서 몇 번째인가 (n명 테이블)
function positionOf(hand, id) {
  const order = hand.orderFromButton(); // [SB, BB, ..., BTN]
  const n = order.length;
  const i = order.indexOf(id);
  if (n === 2) return i === 1 ? 'BB' : 'BTN'; // 헤즈업: 버튼이 SB
  if (i === 0) return 'SB';
  if (i === 1) return 'BB';
  const fromBtn = n - 1 - i; // 0 = BTN, 1 = CO, 2 = HJ ...
  return ['BTN', 'CO', 'HJ'][fromBtn] || 'EP';
}
// 먼저 들어갈 때(레이즈) 참고 범위: 상위 몇 % (6-max 기준, 풀링은 좁게) · 헤즈업 버튼은 넓게
const RFI = { BTN: 0.45, CO: 0.28, HJ: 0.21, EP: 0.16, SB: 0.35, BB: 0.35 };

/** 실제 상대 패를 알고 있을 때 승률 (보드가 덜 깔렸으면 무작위로 채워 여러 번) */
function equityVsHands(hole, opps, board, iters = 240) {
  if (!opps.length) return 1;
  const used = new Set([...hole, ...board, ...opps.flat()]);
  const rest = newDeck().filter((c) => !used.has(c));
  const need = 5 - board.length;
  const runs = need === 0 ? 1 : iters;
  let win = 0;
  for (let it = 0; it < runs; it++) {
    const d = rest.slice();
    for (let k = 0; k < need; k++) { const j = k + Math.floor(Math.random() * (d.length - k)); [d[k], d[j]] = [d[j], d[k]]; }
    const full = board.concat(d.slice(0, need));
    const mine = bestHand(hole.concat(full)).score;
    let lost = false; let ties = 1;
    for (const o of opps) {
      const c = compareScore(mine, bestHand(o.concat(full)).score);
      if (c < 0) { lost = true; break; }
      if (c === 0) ties++;
    }
    if (!lost) win += 1 / ties;
  }
  return win / runs;
}

/** 엔진 Hand 하나 → 이 사람의 지표 조각 */
function handFeatures(hand, id) {
  const me = hand.seatOf(id);
  if (!me || !hand.result || !Array.isArray(me.hole) || me.hole.length !== 2) return null;
  const bb = hand.bb || 1;
  const pos = positionOf(hand, id);
  const n = hand.seats.length;
  const f = { vpip: 0, pfr: 0, limpOpp: 0, limp: 0, aggB: 0, aggC: 0, aggF: 0, sawFlop: 0, sd: 0, sdWon: 0, wwsf: 0, judged: 0, inRange: 0, dec: 0, decOk: 0, decW: 0, decOkW: 0 };
  // 기록을 다시 따라가며 팟·콜 금액을 계산
  let pot = 0; let streetMax = 0; const streetBet = {}; const folded = new Set();
  let board = []; let stage = 'preflop'; let preRaised = false; let preCalled = false; let firstVoluntary = true;
  for (const e of hand.log) {
    if (e.type === 'street') { board = (e.board || []).slice(); stage = { 3: 'flop', 4: 'turn', 5: 'river' }[board.length] || stage; streetMax = 0; for (const k in streetBet) streetBet[k] = 0; continue; }
    if (e.type === 'blind' || e.type === 'ante') { pot += e.amount || 0; if (e.type === 'blind') { streetBet[e.id] = (streetBet[e.id] || 0) + (e.amount || 0); streetMax = Math.max(streetMax, streetBet[e.id]); } continue; }
    if (e.type === 'return') { pot -= e.amount || 0; continue; }
    if (!['fold', 'check', 'call', 'bet', 'raise', 'allin'].includes(e.type)) continue;
    const toCall = Math.max(0, streetMax - (streetBet[e.id] || 0));
    if (e.id === id) {
      const voluntary = ['call', 'bet', 'raise', 'allin'].includes(e.type);
      const aggressive = ['bet', 'raise'].includes(e.type) || (e.type === 'allin' && (e.to || 0) > streetMax);
      if (stage === 'preflop') {
        if (voluntary && !f.vpip) {
          f.vpip = 1;
          // 프리플랍 규율: 이 자리에서 들어가도 되는 패였나
          const pct = bot.handPct(me.hole);
          let width = preRaised ? (pos === 'BB' ? 0.35 : 0.15) : (RFI[pos] || 0.2);
          if (n === 2) width = preRaised ? 0.45 : 0.75;
          else if (n >= 8) width *= 0.8;
          f.judged = 1; f.inRange = pct <= width + 0.05 ? 1 : 0;
        }
        if (aggressive) f.pfr = 1;
        if (firstVoluntary && !preRaised && !preCalled && pos !== 'BB' && (voluntary || e.type === 'fold')) {
          f.limpOpp = 1;
          if (e.type === 'call' && pos !== 'SB') f.limp = 1;
        }
        if (voluntary || e.type === 'fold') firstVoluntary = false;
      } else {
        if (aggressive) f.aggB++; else if (e.type === 'call' || (e.type === 'allin' && toCall > 0)) f.aggC++; else if (e.type === 'fold') f.aggF++;
      }
      // 결정 품질: 큰 베팅(팟의 1/3 이상)을 받았을 때, 리버거나 올인이 걸린 결정만 (실제 상대 패로 승률)
      const opp = hand.seats.filter((s) => s.id !== id && !folded.has(s.id));
      const bigFace = toCall > 0 && toCall >= pot / 3;
      const allinSpot = toCall > 0 && (toCall >= (me.startStack || 0) * 0.5 || opp.some((s) => s.allIn));
      if (bigFace && (stage === 'river' || allinSpot) && opp.length) {
        const eq = equityVsHands(me.hole, opp.map((s) => s.hole), board, stage === 'river' ? 1 : 200);
        const need = toCall / (pot + toCall);
        const cont = e.type !== 'fold';
        const ok = cont ? eq >= need - 0.03 : eq < need + 0.03;
        const w = Math.max(1, (pot + toCall) / bb);
        f.dec++; f.decW += w; if (ok) { f.decOk++; f.decOkW += w; }
      }
    }
    if (e.type === 'fold') folded.add(e.id);
    if (['call', 'bet', 'raise', 'allin'].includes(e.type)) {
      pot += e.amount || 0;
      streetBet[e.id] = e.to != null ? e.to : (streetBet[e.id] || 0) + (e.amount || 0);
      if (stage === 'preflop' && e.id !== id) { if (streetBet[e.id] > streetMax && streetBet[e.id] > bb) preRaised = true; else preCalled = true; }
      streetMax = Math.max(streetMax, streetBet[e.id]);
    }
  }
  const r = hand.result;
  const finalBoard = r.board || hand.board || [];
  const won = (r.winners || []).includes(id);
  // 플랍을 봤나: 프리플랍에 폴드하지 않았고 바닥이 3장 이상 깔렸다
  const foldedPre = hand.log.some((e) => e.id === id && e.type === 'fold' && e.stage === 'preflop');
  if (!foldedPre && finalBoard.length >= 3) {
    f.sawFlop = 1;
    if (won) f.wwsf = 1;
    if (r.type === 'showdown' && r.hands && r.hands[id]) { f.sd = 1; if (won) f.sdWon = 1; }
  }
  const delta = (r.deltas || {})[id] || 0;
  const hi = r.type === 'showdown' && r.hands && r.hands[id];
  return { ...f, won: won ? 1 : 0, delta, deltaBB: delta / bb, bb, handName: hi ? hi.name : null, handRank: hi ? (typeof hi.rank === 'number' ? hi.rank : hi.category) : null, pot: hand.totalPot };
}

/** 지표 누적 */
function addHand(st, f) {
  st.hands++; if (f.won) st.won++;
  st.net += f.delta; st.netBB += f.deltaBB;
  for (const k of ['vpip', 'pfr', 'limpOpp', 'limp', 'aggB', 'aggC', 'aggF', 'sawFlop', 'sd', 'sdWon', 'wwsf', 'judged', 'inRange', 'dec', 'decOk', 'decW', 'decOkW']) st[k] += f[k] || 0;
  // 틸트: 20BB 이상 크게 진 판 뒤 7판 동안의 VPIP 를 따로 센다
  if (st.tiltLeft > 0) { st.postN++; st.postV += f.vpip; st.tiltLeft--; } else { st.baseN++; st.baseV += f.vpip; }
  if (f.deltaBB <= -20) { st.tiltLeft = 7; st.bigLoss++; }
  if (f.won && f.handName && (f.handRank || 0) > st.bestRank) { st.bestRank = f.handRank || 0; st.best = f.handName; }
  if (f.won) st.bigPot = Math.max(st.bigPot, f.pot || 0);
}

/** 지표 → 점수 · 티어 · 스타일 · 심리 */
function evaluate(st) {
  const n = st.hands | 0;
  const vpip = shrink(st.vpip, n, 0.32) * 100;
  const pfr = shrink(st.pfr, n, 0.14) * 100;
  const af = (st.aggB + 1) / (st.aggC + 1);
  const afq = shrink(st.aggB, st.aggB + st.aggC + st.aggF, 0.38) * 100;
  const wtsd = shrink(st.sd, st.sawFlop, 0.30) * 100;
  const wsd = shrink(st.sdWon, st.sd, 0.48, 15) * 100;
  const inRange = shrink(st.inRange, st.judged, 0.6, 20);
  const limpPct = st.limpOpp ? st.limp / st.limpOpp : 0;
  const P = clamp(0.7 * (100 * inRange - 20 * Math.min(1, limpPct / 0.15) - 15 * Math.max(0, (vpip - pfr - 6) / 15)) + 0.3 * (0.5 * band(vpip, 17, 30, 15) + 0.5 * band(pfr, 12, 25, 12)), 0, 100);
  const D = 100 * shrink(st.decOkW, st.decW, 0.6, 15);
  const A = 0.5 * band(af, 1.8, 3.5, 2) + 0.5 * band(afq, 40, 60, 25);
  const S = clamp(0.5 * band(wtsd, 22, 32, 10) + 0.5 * band(wsd, 48, 60, 10) - (wtsd > 34 && wsd < 46 ? 20 : 0), 0, 100);
  // 결과: bb/100 을 판 수에 맞게 0 쪽으로 당김 (σ=90, τ=10)
  const wr = n ? (st.netBB / n) * 100 : 0;
  const w = n ? 100 / (100 + 8100 / (n / 100)) : 0;
  const R = clamp(50 + 2.5 * w * wr, 0, 100);
  // 심리: 틸트(큰 판 진 뒤 VPIP 상승)
  const baseV = st.baseN ? st.baseV / st.baseN : 0.3;
  const postV = st.postN ? st.postV / st.postN : baseV;
  const tilt = st.postN >= 5 ? clamp(Math.max(0, (postV - baseV) / Math.max(baseV, 0.05)) * 0.8, 0, 1) * (st.bigLoss / (st.bigLoss + 5)) : 0;
  const psi = 6 * tilt;
  const raw = 0.25 * P + 0.25 * D + 0.15 * A + 0.15 * S + 0.20 * R - psi;
  const c = n / (n + 300);
  const score = Math.round((35 + c * (raw - 35)) * 10) / 10;
  // 티어: 판 수가 모자라면 한 칸 아래
  let ti = TIERS.findIndex((t) => score >= t.min);
  while (ti < TIERS.length - 1 && n < TIERS[ti].hands) ti++;
  const tier = n < PLACEMENT ? null : { ...TIERS[ti], hands: undefined };
  // 플레이 스타일 (50판부터)
  let style = null;
  if (n >= 50) {
    const aggressive = pfr / Math.max(vpip, 1) >= 0.7 && (af >= 2 || afq >= 42);
    if (vpip >= 40 && pfr >= 30 && af > 4) style = '폭주형';
    else if (vpip >= 30 && pfr / vpip < 0.45 && af < 1.5) style = '따라가기형';
    else if (vpip > 26 && aggressive) style = '과감한 공격형';
    else if (vpip > 26) style = '느긋한 참여형';
    else if (vpip < 13 && aggressive) style = '철벽형';
    else if (vpip < 17 && !aggressive) style = '바위형';
    else if (aggressive) style = '신중한 공격형';
    else style = '소극형';
  }
  const tips = [];
  if (n >= 30) {
    if (limpPct > 0.15) tips.push('콜로만 들어가는 판이 많아요 · 들어갈 땐 레이즈로');
    if (vpip > 35) tips.push('너무 많은 패로 들어가요 · 자리별 시작 패를 좁혀 보세요');
    if (vpip < 14) tips.push('너무 조심스러워요 · 딜러 자리와 그 오른쪽 자리에선 더 넓게');
    if (af < 1.3 && st.aggB + st.aggC > 20) tips.push('플랍 이후 콜만 해요 · 좋은 패는 베팅으로');
    if (wtsd > 34 && wsd < 46) tips.push('끝까지 너무 자주 따라가요 (무리한 콜 주의)');
    if (st.decW > 0 && st.decOkW / st.decW < 0.55) tips.push('큰 베팅 앞에서 팟 오즈와 다르게 결정했어요');
    if (tilt > 0.3) tips.push('큰 판을 진 뒤 흔들려요 (마음 다잡기)');
  }
  return {
    score, tier, placement: n < PLACEMENT ? PLACEMENT - n : 0, style, tips,
    parts: { P: Math.round(P), D: Math.round(D), A: Math.round(A), S: Math.round(S), R: Math.round(R) },
    stats: { hands: n, winRate: n ? Math.round((st.won / n) * 100) : 0, vpip: Math.round(vpip), pfr: Math.round(pfr), af: Math.round(af * 10) / 10, wtsd: Math.round(wtsd), wsd: Math.round(wsd), bb100: Math.round(wr * 10) / 10, net: st.net, decisions: st.dec, decRate: st.decW ? Math.round((st.decOkW / st.decW) * 100) : null, tilt: Math.round(tilt * 100), best: st.best, bigPot: st.bigPot },
  };
}

function createHoldemPro({ kv = null, now = Date.now } = {}) {
  let data = { profiles: {} };
  let dirty = false; let timer = null;
  const ready = (async () => {
    if (!kv) return;
    try { const v = await kv.get(KV_KEY); if (v && v.profiles) data = v; } catch (e) { console.error('[holdem-pro] 불러오기 실패', e.message); }
  })();
  function save() {
    dirty = true;
    if (!kv || timer) return;
    timer = setTimeout(async () => { timer = null; if (!dirty) return; dirty = false; try { await kv.set(KV_KEY, data); } catch (e) { console.error('[holdem-pro] 저장 실패', e.message); dirty = true; } }, SAVE_MS);
  }
  async function flush() { if (timer) { clearTimeout(timer); timer = null; } if (kv && dirty) { dirty = false; await kv.set(KV_KEY, data); } }

  function fresh(name) { return { name: name || '', wallet: BASE, refill: { day: '', used: 0 }, st: emptyStats(), recent: '', created: now(), updated: now(), checkin: { last: '', streak: 0 }, mis: { day: '', prog: {}, done: [] }, ach: {}, season: { id: '', st: emptyStats() }, titles: [], items: { owned: ['back-red', 'felt-red'], back: 'back-red', felt: 'felt-red' }, replays: [], ref: null, refCount: 0, streak: 0 }; }
  // 예전 프로필에 새 칸 채우기
  function up(p) {
    if (!p.checkin) p.checkin = { last: '', streak: 0 };
    if (!p.mis) p.mis = { day: '', prog: {}, done: [] };
    if (!p.ach) p.ach = {};
    if (!p.season) p.season = { id: '', st: emptyStats() };
    if (!p.titles) p.titles = [];
    if (!p.items) p.items = { owned: ['back-red', 'felt-red'], back: 'back-red', felt: 'felt-red' };
    if (!p.replays) p.replays = [];
    if (p.refCount === undefined) p.refCount = 0;
    if (p.streak === undefined) p.streak = 0;
    return p;
  }
  /** 신원 → 프로필 키. user = 계정, guest = { id, key } (이 기기 열쇠) */
  function keyOf({ user, guest }) {
    if (user) return 'u:' + user.id;
    if (guest && /^[A-Za-z0-9_-]{8,40}$/.test(String(guest.id || '')) && String(guest.key || '').length >= 16) {
      const k = 'g:' + guest.id;
      const p = data.profiles[k];
      if (p && p.keyHash && p.keyHash !== hashKey(guest.key)) return null; // 다른 사람이 같은 id 를 쓰려 함
      return k;
    }
    return null;
  }
  function profile(ident, name) {
    const k = keyOf(ident);
    if (!k) return null;
    let p = data.profiles[k];
    if (p) up(p);
    if (!p) {
      p = data.profiles[k] = fresh(name);
      if (k.startsWith('g:')) p.keyHash = hashKey(ident.guest.key);
      if (ident.user) p.userId = ident.user.id;
      // 초대 링크로 처음 온 사람: 누가 초대했는지 기억 (첫 판을 치면 둘 다 보상)
      const by = ident.ref && data.codes && data.codes[String(ident.ref).toUpperCase()];
      if (by && by !== k && data.profiles[by]) p.ref = { by, paid: false };
      save();
    }
    if (ident.user) p.name = ident.user.nickname;
    else if (name) p.name = String(name).slice(0, 10);
    if (ident.user && ident.user.isMaster) p.master = true;
    return { key: k, p };
  }
  const refillsLeft = (p) => (p.refill.day === kstDay(now()) ? REFILLS_PER_DAY - p.refill.used : REFILLS_PER_DAY);
  function summary(k, p) {
    const ev = evaluate(p.st);
    up(p);
    const day = kstDay(now());
    rollMissions(p);
    const ci = p.checkin; const ciToday = ci.last === day;
    const ciNext = ciToday ? ci.streak : (ci.last === kstDay(now() - 86400000) ? ci.streak : 0) % 7;
    const sev = evaluate(p.season.id === seasonId() ? p.season.st : emptyStats());
    return {
      key: k.startsWith('g:') ? 'guest' : 'member', name: p.name, wallet: p.wallet, base: BASE, refillsLeft: refillsLeft(p), canRefill: p.wallet < BASE && refillsLeft(p) > 0, nextReset: nextResetAt(), recent: p.recent, ...ev, rank: rankOf(k),
      checkin: { done: ciToday, streak: ci.streak, day: ciToday ? ((ci.streak - 1) % 7) + 1 : ciNext + 1, rewards: CHECKIN },
      missions: p.mis.list.map((id) => ({ id, name: MISSIONS[id].name, goal: MISSIONS[id].goal, reward: MISSIONS[id].reward, prog: Math.min(MISSIONS[id].goal, p.mis.prog[id] || 0), claimed: p.mis.done.includes(id) })),
      ach: Object.entries(ACHIEVEMENTS).map(([id, a]) => ({ id, ...a, at: p.ach[id] || null })),
      season: { id: seasonId(), endsAt: seasonEnds(), score: sev.score, tier: sev.tier, hands: p.season.id === seasonId() ? p.season.st.hands : 0, rank: seasonRankOf(k) },
      titles: p.titles.slice(-5),
      items: { ...p.items, shop: SHOP },
      refCode: codeOf(k), refCount: p.refCount, referReward: REFER_REWARD,
      replays: p.replays.slice(-12).reverse().map((id) => replaySummary(id)).filter(Boolean),
    };
  }
  function nextResetAt() { const t = now(); const d = new Date(t + 9 * 3600 * 1000); d.setUTCHours(24, 0, 0, 0); return d.getTime() - 9 * 3600 * 1000; }

  // 순위: 배치 끝난 사람 중 점수순 (60초 캐시)
  let rankCache = null; let rankAt = 0;
  function ranking() {
    if (rankCache && now() - rankAt < 60000) return rankCache;
    const list = Object.entries(data.profiles).filter(([, p]) => !p.master && p.st.hands >= PLACEMENT).map(([k, p]) => ({ k, p, ev: evaluate(p.st) }))
      .sort((a, b) => b.ev.score - a.ev.score || b.p.st.hands - a.p.st.hands);
    const dist = {};
    for (const x of list) dist[x.ev.tier.key] = (dist[x.ev.tier.key] || 0) + 1;
    rankCache = { list, dist, total: list.length };
    rankAt = now();
    return rankCache;
  }
  function rankOf(k) { const r = ranking(); const i = r.list.findIndex((x) => x.k === k); return i < 0 ? null : { rank: i + 1, of: r.total }; }
  function top(n = 20) {
    const r = ranking();
    return {
      total: r.total,
      dist: TIERS.map((t) => ({ key: t.key, name: t.name, color: t.color, count: r.dist[t.key] || 0 })),
      top: r.list.slice(0, n).map((x, i) => ({ rank: i + 1, name: x.p.name, member: x.k.startsWith('u:'), tier: x.ev.tier, score: x.ev.score, hands: x.p.st.hands, winRate: x.ev.stats.winRate, style: x.ev.style, bb100: x.ev.stats.bb100 })),
    };
  }

  function refill(ident) {
    const r = profile(ident);
    if (!r) throw new Error('다시 들어와 주세요');
    const { p } = r;
    const day = kstDay(now());
    if (p.refill.day !== day) p.refill = { day, used: 0 };
    if (p.wallet >= BASE) throw new Error(`지갑이 기본금(${BASE.toLocaleString()}) 이상이라 충전할 필요가 없어요`);
    if (p.refill.used >= REFILLS_PER_DAY) throw new Error('오늘 충전 3번을 다 썼어요 · 내일 0시(한국 시간)에 다시 생겨요');
    p.refill.used++;
    const add = BASE - p.wallet;
    p.wallet = BASE;
    p.updated = now();
    save();
    return { added: add, ...summary(r.key, p) };
  }

  /** 연습 테이블 입장: 지갑에서 바이인을 꺼낸다 */
  function buyIn(ident, name, tableId, amount) {
    const t = TABLES.find((x) => x.id === tableId);
    if (!t) throw new Error('없는 테이블이에요');
    const r = profile(ident, name);
    if (!r) throw new Error('이 기기 정보를 만들지 못했어요. 새로고침해 주세요');
    const amt = clamp(Math.round(Number(amount) || t.buy[0]), t.buy[0], t.buy[1]);
    if (r.p.wallet < t.buy[0]) throw new Error(`칩이 모자라요 · 이 테이블은 최소 ${t.buy[0].toLocaleString()} (지갑 ${r.p.wallet.toLocaleString()})`);
    const take = Math.min(amt, r.p.wallet);
    r.p.wallet -= take;
    r.p.updated = now();
    save();
    return { key: r.key, table: t, amount: take };
  }
  /** 리바이(연습 테이블): 지갑에서 */
  function rebuy(key, amount) {
    const p = data.profiles[key];
    if (!p) throw new Error('지갑을 찾을 수 없어요');
    if (p.wallet < amount) throw new Error(`지갑 칩이 모자라요 (${p.wallet.toLocaleString()})`);
    p.wallet -= amount; save();
    return p.wallet;
  }
  /** 테이블에서 일어나기: 남은 칩을 지갑으로 */
  function cashOut(key, chips) {
    const p = data.profiles[key];
    if (!p || !(chips > 0)) return;
    p.wallet += Math.floor(chips);
    p.updated = now();
    save();
  }
  /** 연습 테이블 한 판 기록 */
  function recordHand(key, hand, id, meta = {}) {
    const p = data.profiles[key];
    if (!p) return null;
    up(p);
    let f = null;
    try { f = handFeatures(hand, id); } catch (e) { console.error('[holdem-pro] 지표 계산 실패', e.message); }
    if (!f) return null;
    addHand(p.st, f);
    // 이번 달 시즌 기록도 따로
    if (p.season.id !== seasonId()) p.season = { id: seasonId(), st: emptyStats() };
    addHand(p.season.st, f);
    p.recent = (String(p.recent || '') + (f.won ? 'W' : 'L')).slice(-10);
    p.streak = f.won ? (p.streak || 0) + 1 : 0;
    const hi = hand.result && hand.result.hands && hand.result.hands[id];
    const cat = f.won && hi ? (typeof hi.category === 'number' ? hi.category : (typeof hi.rank === 'number' ? hi.rank : -1)) : -1;
    const royal = cat === 8 && /로열/.test(hi && hi.name || '');
    const x = { won: f.won, sdWon: f.sdWon, pfr: f.pfr, decOk: f.decOk, cat, potBB: (f.pot || 0) / (f.bb || 1) };
    // 오늘의 미션
    rollMissions(p);
    for (const mid of p.mis.list) p.mis.prog[mid] = (p.mis.prog[mid] || 0) + (MISSIONS[mid].f(x) || 0);
    // 업적
    const got = [];
    const give = (aid) => { if (p.ach[aid]) return; p.ach[aid] = now(); p.wallet += ACHIEVEMENTS[aid].reward; got.push(aid); };
    if (f.won) give('first_win');
    if (p.st.hands >= 100) give('hands100');
    if (p.st.hands >= 500) give('hands500');
    if (p.st.hands >= 1000) give('hands1000');
    if (p.streak >= 5) give('streak5');
    if (cat === 5) give('flush');
    if (cat === 6) give('fullhouse');
    if (cat === 7) give('quads');
    if (cat === 8) give(royal ? 'royal' : 'sflush');
    if (f.won && x.potBB >= 100) give('bigpot100');
    const ev = evaluate(p.st);
    if (ev.tier) { const tk = ev.tier.key; if (['gold', 'plat', 'dia', 'master', 'gm'].includes(tk)) give('gold'); if (['dia', 'master', 'gm'].includes(tk)) give('dia'); if (['master', 'gm'].includes(tk)) give('master'); }
    // 초대: 초대받은 사람이 첫 판을 치면 둘 다 보상
    if (p.ref && !p.ref.paid) {
      p.ref.paid = true;
      const r = data.profiles[p.ref.by];
      if (r && (r.refCount || 0) < REFER_MAX) { up(r); r.refCount = (r.refCount || 0) + 1; r.wallet += REFER_REWARD; p.wallet += REFER_REWARD; if (!r.ach.refer1) r.ach.refer1 = now(); }
    }
    // 명장면: 큰 팟 · 올인 승부 · 스트레이트 이상 · 큰 손실 → 다시보기로 남김
    const big = (f.pot || 0) / (f.bb || 1) >= 40 || cat >= 4 || f.deltaBB <= -40 || hand.seats.some((s) => s.allIn && !s.folded);
    if (big && hand.result) { try { saveReplay(key, p, hand, id, meta, f); } catch (e) { console.error('[replay]', e.message); } }
    p.updated = now();
    save();
    return { ...f, achievements: got };
  }

  // ── 출석 · 미션 ──
  function rollMissions(p) {
    const day = kstDay(now());
    if (p.mis.day === day && p.mis.list) return;
    // 날짜로 섞어서 3개 (매일 다르게, 모두 같은 미션)
    const seed = Number(day.replace(/-/g, ''));
    const pool = MISSION_KEYS.slice();
    const list = [];
    let r = seed;
    while (list.length < 3) { r = (r * 1103515245 + 12345) % 2147483648; const i = r % pool.length; list.push(pool.splice(i, 1)[0]); }
    p.mis = { day, list, prog: {}, done: [] };
  }
  function checkin(ident) {
    const r = profile(ident); if (!r) throw new Error('다시 들어와 주세요');
    const p = up(r.p); const day = kstDay(now());
    if (p.checkin.last === day) throw new Error('오늘은 이미 출석했어요');
    const yesterday = kstDay(now() - 86400000);
    const streak = p.checkin.last === yesterday ? p.checkin.streak + 1 : 1;
    const reward = CHECKIN[(streak - 1) % 7];
    p.checkin = { last: day, streak };
    p.wallet += reward;
    if (streak >= 7) p.ach.week7 = p.ach.week7 || now();
    save();
    return { reward, streak, me: summary(r.key, p) };
  }
  function claimMission(ident, mid) {
    const r = profile(ident); if (!r) throw new Error('다시 들어와 주세요');
    const p = up(r.p); rollMissions(p);
    const m = MISSIONS[mid];
    if (!m || !p.mis.list.includes(mid)) throw new Error('오늘의 미션이 아니에요');
    if (p.mis.done.includes(mid)) throw new Error('이미 받았어요');
    if ((p.mis.prog[mid] || 0) < m.goal) throw new Error('아직 다 못 했어요');
    p.mis.done.push(mid); p.wallet += m.reward; save();
    return { reward: m.reward, me: summary(r.key, p) };
  }
  // ── 상점 ──
  function buy(ident, itemId) {
    const r = profile(ident); if (!r) throw new Error('다시 들어와 주세요');
    const p = up(r.p); const it = SHOP.find((x) => x.id === itemId);
    if (!it) throw new Error('없는 물건이에요');
    if (p.items.owned.includes(it.id)) { p.items[it.kind] = it.id; save(); return { me: summary(r.key, p) }; }
    if (p.wallet < it.price) throw new Error(`칩이 모자라요 (${it.price.toLocaleString()} 필요)`);
    p.wallet -= it.price; p.items.owned.push(it.id); p.items[it.kind] = it.id; save();
    return { bought: it.name, me: summary(r.key, p) };
  }
  // ── 초대 코드 (짧은 6자) ──
  function codeOf(k) {
    data.codes = data.codes || {};
    const p = data.profiles[k]; if (!p) return null;
    if (p.code && data.codes[p.code] === k) return p.code;
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c;
    do { c = Array.from(crypto.randomBytes(6), (b) => abc[b % abc.length]).join(''); } while (data.codes[c]);
    data.codes[c] = k; p.code = c; save();
    return c;
  }
  // ── 시즌: 달마다 새로 · 지난 시즌 1~3등에게 칭호 ──
  const seasonId = () => kstDay(now()).slice(0, 7);
  function seasonEnds() { const d = new Date(now() + 9 * 3600e3); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 9 * 3600e3; }
  let sCache = null; let sAt = 0;
  function seasonRanking() {
    if (sCache && now() - sAt < 60000) return sCache;
    const sid = seasonId();
    data.seasons = data.seasons || {};
    // 지난 시즌 마감 (아직 안 했으면): 그 시즌 기록이 있는 사람으로 순위 → 칭호
    for (const [k, p] of Object.entries(data.profiles)) {
      up(p);
      if (p.season.id && p.season.id !== sid && !(data.seasons[p.season.id] && data.seasons[p.season.id].closed)) {
        const old = p.season.id;
        const list = Object.entries(data.profiles).filter(([, q]) => q.season && q.season.id === old && q.season.st.hands >= PLACEMENT && !q.master)
          .map(([kk, q]) => ({ kk, q, sc: evaluate(q.season.st).score })).sort((a, b) => b.sc - a.sc);
        const [y, m] = old.split('-');
        list.slice(0, 3).forEach((x, i) => { x.q.titles.push(`${y}년 ${Number(m)}월 시즌 ${i + 1}위`); x.q.wallet += [50000, 25000, 10000][i]; });
        data.seasons[old] = { closed: true, top: list.slice(0, 3).map((x) => ({ name: x.q.name, score: x.sc })) };
        save();
      }
      void k;
    }
    const list = Object.entries(data.profiles).filter(([, p]) => !p.master && p.season.id === sid && p.season.st.hands >= PLACEMENT)
      .map(([k, p]) => ({ k, p, ev: evaluate(p.season.st) })).sort((a, b) => b.ev.score - a.ev.score);
    sCache = { sid, list }; sAt = now();
    return sCache;
  }
  function seasonRankOf(k) { const r = seasonRanking(); const i = r.list.findIndex((x) => x.k === k); return i < 0 ? null : { rank: i + 1, of: r.list.length }; }
  function seasonTop(n = 20) {
    const r = seasonRanking();
    const prevId = (() => { const d = new Date(now() + 9 * 3600e3); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); })();
    return { id: r.sid, endsAt: seasonEnds(), prizes: [50000, 25000, 10000], top: r.list.slice(0, n).map((x, i) => ({ rank: i + 1, name: x.p.name, tier: x.ev.tier, score: x.ev.score, hands: x.p.season.st.hands, winRate: x.ev.stats.winRate })), prev: (data.seasons || {})[prevId] || null };
  }
  // ── 명장면 다시보기 ──
  function saveReplay(key, p, hand, id, meta, f) {
    data.replays = data.replays || {};
    const rid = crypto.randomBytes(5).toString('hex');
    const r = hand.result;
    const shown = new Set([id, ...Object.keys(r.hands || {}).filter((x) => (meta.shown ? meta.shown(x) : true))]);
    data.replays[rid] = {
      id: rid, at: now(), owner: p.name, table: meta.table || '연습 테이블', sb: hand.sb, bb: hand.bb,
      seats: hand.seats.map((s) => ({ id: s.id, name: (meta.names && meta.names[s.id]) || '?', avatar: (meta.avatars && meta.avatars[s.id]) || 1, start: s.startStack, hole: shown.has(s.id) ? s.hole : null, me: s.id === id })),
      dealer: hand.orderFromButton().slice(-1)[0],
      log: hand.log.filter((e) => ['blind', 'ante', 'fold', 'check', 'call', 'bet', 'raise', 'allin', 'street', 'return'].includes(e.type)).map((e) => ({ t: e.type, id: e.id, a: e.amount, to: e.to, b: e.board })),
      board: (r.board || hand.board || []).slice(),
      winners: r.winners, deltas: r.deltas, pot: hand.totalPot,
      title: f.won ? (f.handName ? `${f.handName}로 ${Math.round((f.pot || 0) / (f.bb || 1))}BB 팟 승리` : `${Math.round((f.pot || 0) / (f.bb || 1))}BB 팟 승리`) : `${Math.round(-f.deltaBB)}BB 아쉬운 승부`,
    };
    p.replays.push(rid);
    if (p.replays.length > 20) { const old = p.replays.shift(); delete data.replays[old]; }
    // 전체 보관은 500개까지
    const ids = Object.keys(data.replays);
    if (ids.length > 500) { ids.sort((a, b) => data.replays[a].at - data.replays[b].at); for (const x of ids.slice(0, ids.length - 500)) delete data.replays[x]; }
  }
  function replaySummary(rid) { const x = (data.replays || {})[rid]; return x ? { id: x.id, at: x.at, title: x.title, pot: x.pot, bb: x.bb, won: (x.winners || []).includes((x.seats.find((s) => s.me) || {}).id) } : null; }
  function replay(rid) { const x = (data.replays || {})[String(rid)]; if (!x) throw new Error('다시보기를 찾을 수 없어요 (오래돼서 지워졌을 수 있어요)'); return x; }
  // ── 정기 토너먼트 상금 ──
  function payPrize(key, place, title) {
    const p = data.profiles[key]; if (!p) return 0;
    up(p);
    const amt = DAILY.prizes[place - 1] || 0;
    if (!amt) return 0;
    p.wallet += amt;
    if (place === 1) { p.ach.daily1 = p.ach.daily1 || now(); if (title) p.titles.push(title); }
    save();
    return amt;
  }
  /** 손님으로 쌓은 것 → 계정으로 (한 번만) */
  function merge(user, guest) {
    const gk = keyOf({ guest });
    if (!user || !gk || !data.profiles[gk]) return { merged: false };
    const g = data.profiles[gk];
    if (g.mergedInto) return { merged: false, already: true };
    const r = profile({ user });
    const u = r.p;
    // 지갑: 둘 중 많은 쪽 + 손님 쪽에서 번 만큼 (기본금 넘는 부분)
    u.wallet = Math.max(u.wallet, g.wallet) + Math.max(0, Math.min(u.wallet, g.wallet) - BASE);
    const a = u.st; const b = g.st;
    for (const k of Object.keys(emptyStats())) if (typeof a[k] === 'number' && typeof b[k] === 'number' && !['tiltLeft', 'bestRank', 'bigPot'].includes(k)) a[k] += b[k];
    if ((b.bestRank || -1) > (a.bestRank || -1)) { a.bestRank = b.bestRank; a.best = b.best; }
    a.bigPot = Math.max(a.bigPot || 0, b.bigPot || 0);
    u.recent = (String(g.recent || '') + String(u.recent || '')).slice(-10);
    up(u); up(g);
    for (const [aid, at] of Object.entries(g.ach)) if (!u.ach[aid]) u.ach[aid] = at;
    for (const it of g.items.owned) if (!u.items.owned.includes(it)) u.items.owned.push(it);
    u.titles = u.titles.concat(g.titles);
    u.replays = u.replays.concat(g.replays).slice(-20);
    if (g.season.id === seasonId()) { if (u.season.id !== seasonId()) u.season = { id: seasonId(), st: emptyStats() }; for (const kk of Object.keys(emptyStats())) if (typeof u.season.st[kk] === 'number' && typeof g.season.st[kk] === 'number' && !['tiltLeft', 'bestRank', 'bigPot'].includes(kk)) u.season.st[kk] += g.season.st[kk]; }
    u.refCount = (u.refCount || 0) + (g.refCount || 0);
    g.mergedInto = r.key; g.wallet = 0; g.st = emptyStats(); g.season = { id: '', st: emptyStats() };
    save(); rankCache = null;
    return { merged: true, ...summary(r.key, u) };
  }
  function me(ident, name) { const r = profile(ident, name); return r ? summary(r.key, r.p) : null; }

  return { ready, flush, TABLES, BASE, REFILLS_PER_DAY, DAILY, me, refill, buyIn, rebuy, cashOut, recordHand, merge, top, keyOf, profileOf: (k) => data.profiles[k], _data: () => data,
    checkin, claimMission, buy, seasonTop, replay, payPrize, codeOf, profile };
}

module.exports = { createHoldemPro, handFeatures, evaluate, emptyStats, addHand, TABLES, TIERS, BASE, MISSIONS, ACHIEVEMENTS, SHOP, CHECKIN, DAILY };
