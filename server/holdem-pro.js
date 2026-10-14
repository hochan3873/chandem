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
  { id: 'heads', name: '1:1 헤즈업', desc: '상대 한 명과 정면 승부', sb: 25, bb: 50, buy: [2500, 10000], seats: 2 },
  { id: 'lounge', name: '라운지', desc: '9명 풀링 · 200/400', sb: 200, bb: 400, buy: [20000, 80000], seats: 9 },
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
    if (vpip >= 40 && pfr >= 30 && af > 4) style = '매니악';
    else if (vpip >= 30 && pfr / vpip < 0.45 && af < 1.5) style = '콜링 스테이션';
    else if (vpip > 26 && aggressive) style = 'LAG (느슨·공격)';
    else if (vpip > 26) style = '느슨·소극';
    else if (vpip < 13 && aggressive) style = '닛 (아주 타이트)';
    else if (vpip < 17 && !aggressive) style = '바위 (타이트·소극)';
    else if (aggressive) style = 'TAG (타이트·공격)';
    else style = '소극형';
  }
  const tips = [];
  if (n >= 30) {
    if (limpPct > 0.15) tips.push('림프(콜로만 들어가기)가 많아요 · 들어갈 땐 레이즈로');
    if (vpip > 35) tips.push('너무 많은 패로 들어가요 · 자리별 시작 패를 좁혀 보세요');
    if (vpip < 14) tips.push('너무 타이트해요 · 버튼·컷오프에선 더 넓게');
    if (af < 1.3 && st.aggB + st.aggC > 20) tips.push('플랍 이후 콜만 해요 · 좋은 패는 베팅으로');
    if (wtsd > 34 && wsd < 46) tips.push('쇼다운까지 너무 자주 따라가요 (히어로 콜 주의)');
    if (st.decW > 0 && st.decOkW / st.decW < 0.55) tips.push('큰 베팅 앞에서 팟 오즈와 다르게 결정했어요');
    if (tilt > 0.3) tips.push('큰 판을 진 뒤 흔들려요 (틸트 주의)');
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

  function fresh(name) { return { name: name || '', wallet: BASE, refill: { day: '', used: 0 }, st: emptyStats(), recent: '', created: now(), updated: now() }; }
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
    if (!p) {
      p = data.profiles[k] = fresh(name);
      if (k.startsWith('g:')) p.keyHash = hashKey(ident.guest.key);
      if (ident.user) p.userId = ident.user.id;
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
    return { key: k.startsWith('g:') ? 'guest' : 'member', name: p.name, wallet: p.wallet, base: BASE, refillsLeft: refillsLeft(p), canRefill: p.wallet < BASE && refillsLeft(p) > 0, nextReset: nextResetAt(), recent: p.recent, ...ev, rank: rankOf(k) };
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
  function recordHand(key, hand, id) {
    const p = data.profiles[key];
    if (!p) return null;
    let f = null;
    try { f = handFeatures(hand, id); } catch (e) { console.error('[holdem-pro] 지표 계산 실패', e.message); }
    if (!f) return null;
    addHand(p.st, f);
    p.recent = (String(p.recent || '') + (f.won ? 'W' : 'L')).slice(-10);
    p.updated = now();
    save();
    return f;
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
    g.mergedInto = r.key; g.wallet = 0; g.st = emptyStats();
    save(); rankCache = null;
    return { merged: true, ...summary(r.key, u) };
  }
  function me(ident, name) { const r = profile(ident, name); return r ? summary(r.key, r.p) : null; }

  return { ready, flush, TABLES, BASE, REFILLS_PER_DAY, me, refill, buyIn, rebuy, cashOut, recordHand, merge, top, keyOf, profileOf: (k) => data.profiles[k], _data: () => data };
}

module.exports = { createHoldemPro, handFeatures, evaluate, emptyStats, addHand, TABLES, TIERS, BASE };
