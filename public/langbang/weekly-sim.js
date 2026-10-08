// 랑방 대전 — 주간 도전 전투 규칙 (live.js weeklyDef 의 판 → createGame({ weekly }) 뒤 attach)
//  DOM 없음 (Node 에서도 돈다 — scripts/lb-weekly-sim.js 가 그대로 쓴다)
//  sim.js 는 훅 몇 줄만: g.wk.waveStart · shapeQ (진상 줄 세우기) · onSpawn · onKill · onClear · tick
//  - 웨이브 사건: 러시 · 정예 · 중간 보스 · 기습(옆길) · 방패 부대 · 보물 도둑 · 저주 웨이브 · 최종 보스(단계)
//  - 이번 주 규칙: 연쇄 폭발 · 현상수배 · 밀물 썰물 (나머지는 sim.js 가 숫자로)
//  - 중간 계약: 3 · 5웨이브 뒤 둘 중 하나 (또는 거절) → 남은 판이 어려워지고 점수 배율
import { RULES, COND } from './data.js';
import { WEEKLY_MODS, WEEKLY_EVENTS, WEEKLY_CURSES, WEEKLY_PACTS, WEEKLY_OFFER_AFTER, weeklyPactMul } from './live.js';
import * as S from './sim.js';

const ev = (g, type, o) => { o.type = type; g.events.push(o); return o; };
export const WKX = {
  offerSec: 14, // 계약 고르는 시간 (안 고르면 거절)
  midGoal: 25, // 중간 보스를 이 초 안에 잡으면 목표 달성
  gobHp: 1.8, gobUlt: 0.25, bountyUlt: 0.15, // 보물 도둑 체력 배 · 잡으면 총공지 충전
  phase: [0.66, 0.33], phaseAdd: [6, 9], phaseSpd: 1.15, phaseAtk: 1.3, // 최종 보스 단계: 체력 66% · 33% 에 부하 · 분노
  side: { L: [22, 120], R: [240, 338] }, // 기습 옆길
};

export function attach(g, def) {
  const mod = WEEKLY_MODS[def.mod] || {};
  g.wk = {
    def, mod, last: def.waves.length, pacts: [], goals: 0, bonus: 0, noLeak: 0, leak: false, lastHp: g.base.hp, offer: null, offered: 0,
    goalLog: [], rule: null, boomQ: [], tideT: mod.tide ? mod.tide.every * 0.6 : 0, bountyT: mod.bounty ? 4 : 0, gobN: 0, gobGot: 0, gobEsc0: 0, midAt: -1, midOk: false,
    eliteAdd: 0, waveStart, shapeQ, onSpawn, onKill, onClear, tick, choose, forceOffer, jumpLast,
  };
  if (mod.tide) g.mapFx = Object.assign({}, g.mapFx, { speed: mod.tide.spd }); // (밀물 = 확성기와 같은 속도 장치 · 확성기 판은 안 나온다)
  return g.wk;
}

// 웨이브 시작 (startWave 안 · 진상 줄 세우기 전)
function waveStart(g, n, def) {
  const W = g.wk;
  W.wave = n; W.leak = false; W.lastHp = g.base.hp; W.waveT0 = g.t; W.gobN = 0; W.gobGot = 0; W.gobEsc0 = g.stats.envStolen | 0; W.midAt = -1; W.midOk = false;
  const E = WEEKLY_EVENTS[def.ev] || WEEKLY_EVENTS.open;
  const C = def.curse ? WEEKLY_CURSES[def.curse] : null;
  if (C) { // 저주 웨이브: 이번 웨이브만 (끝나면 되돌린다)
    W.rule = { range: g.rangeMul || 1, spd: g.mods.enemySpd, dmg: g.mods.dmg, cd: g.cdMul, heal: g.mods.healMul, hp: g.mods.enemyHp };
    if (C.range) g.rangeMul = (g.rangeMul || 1) * C.range;
    if (C.spd) g.mods.enemySpd *= C.spd;
    if (C.dmg) g.mods.dmg *= C.dmg;
    if (C.cd) { g.cdMul *= C.cd; for (const h of g.heroes) h.skillCd *= C.cd; }
    if (C.heal !== undefined) g.mods.healMul = C.heal;
    if (C.hp) g.mods.enemyHp *= C.hp;
  }
  ev(g, 'wkWave', { wave: n, last: n >= W.last, ev: E.id, name: C ? `${E.name} · ${C.name}` : E.name, desc: C ? C.desc : E.desc, goal: E.goalText || '', side: def.side || '', boss: def.boss || '' });
}
// 진상 줄 (startWave 가 만든 q 를 사건에 맞게)
function shapeQ(g, def, q) {
  const W = g.wk;
  if (def.side) { const [a, b] = WKX.side[def.side]; for (const o of q) if (!o.boss) o.x = o.x !== undefined ? a + (o.x / g.W) * (b - a) : a + g.rng() * (b - a); } // (무리는 모양 그대로 옆길로)
  if (def.thief) for (let i = 0; i < def.thief; i++) { q.push({ type: 'envthief', at: 2.5 + i * 4.5, x: 60 + g.rng() * (g.W - 120), wkGob: true }); W.gobN++; }
  if (W.eliteAdd && W.wave < W.last + 1) for (let i = 0; i < W.eliteAdd; i++) q.push({ type: g.weekly.eliteType, at: 3 + i * 3.5, hpX: def.eliteHp || 2.4, elite: true });
}
function onSpawn(g, e, s) {
  const W = g.wk, def = g.weekly.waves[W.wave - 1] || {};
  if (s.wkGob) { e.wkGob = true; e.maxHp *= WKX.gobHp; e.hp = e.maxHp; g.envTip = true; }
  if (def.shield && !e.boss && !e.mid && !e.wkGob) { e.cLay = e.cLayMax = def.shield; e.cLayT = COND.shield.regen; }
  if (s.mid) W.midAt = g.t;
  if (e.boss && W.wave >= W.last && def.phases && e.wkPh === undefined) e.wkPh = 0;
}
function onKill(g, e) {
  const W = g.wk, M = W.mod;
  if (e.wkGob) { W.gobGot++; W.bonus++; g.ult = Math.min(RULES.ultMax, g.ult + RULES.ultMax * WKX.gobUlt); ev(g, 'wkGob', { x: e.x, y: e.y, n: W.gobGot, of: W.gobN }); }
  if (e.wkMark) { e.wkMark = false; W.bonus++; g.ult = Math.min(RULES.ultMax, g.ult + RULES.ultMax * WKX.bountyUlt); ev(g, 'wkBounty', { x: e.x, y: e.y, got: true }); }
  if (e.mid && W.midAt >= 0 && g.t - W.midAt <= WKX.midGoal) W.midOk = true;
  if (M.chain && !e.boss && W.boomQ.length < 60) W.boomQ.push(e.x, e.y, e.maxHp * M.chain.frac);
}
// 웨이브를 다 막았다 (waveClear 처음)
function onClear(g) {
  const W = g.wk, def = g.weekly.waves[W.wave - 1] || {};
  if (W.rule) { const R = W.rule; g.rangeMul = R.range; g.mods.enemySpd = R.spd; g.mods.dmg = R.dmg; const k = R.cd / g.cdMul; g.cdMul = R.cd; for (const h of g.heroes) h.skillCd *= k; g.mods.healMul = R.heal; g.mods.enemyHp = R.hp; W.rule = null; }
  if (!W.leak) W.noLeak++;
  const E = WEEKLY_EVENTS[def.ev] || {};
  let ok = null;
  if (E.goal === 'fast') ok = g.t - W.waveT0 <= (def.goalT || 30);
  else if (E.goal === 'noleak') ok = !W.leak;
  else if (E.goal === 'thief') ok = W.gobN > 0 && W.gobGot >= W.gobN;
  else if (E.goal === 'mid') ok = W.midOk;
  else if (E.goal === 'door') ok = g.base.hp / g.base.max > 0.5;
  if (ok !== null) { if (ok) W.goals++; W.goalLog.push(ok ? 1 : 0); ev(g, 'wkGoal', { wave: W.wave, ok, text: E.goalText }); }
  const oi = WEEKLY_OFFER_AFTER.indexOf(W.wave);
  if (oi >= 0 && W.wave < W.last && g.weekly.offers && g.weekly.offers[oi]) { W.offer = { i: oi, opts: g.weekly.offers[oi].slice(), t: WKX.offerSec }; W.pacts[oi] = null; ev(g, 'wkOffer', { i: oi, opts: W.offer.opts }); }
}
// 계약 고르기: k = 0 / 1 (받기) · 그 밖 = 거절
function choose(g, k) {
  const W = g.wk, o = W.offer;
  if (!o) return false;
  W.offer = null;
  const id = o.opts[k];
  if (!id || !WEEKLY_PACTS[id]) { ev(g, 'wkPact', { i: o.i, id: null, mul: weeklyPactMul(W.pacts) }); return true; }
  const P = WEEKLY_PACTS[id];
  W.pacts[o.i] = id;
  if (P.hp) g.mods.enemyHp *= P.hp;
  if (P.spd) g.mods.enemySpd *= P.spd;
  if (P.door) { g.base.max = Math.round(g.base.max * P.door); g.base.hp = Math.min(g.base.hp, g.base.max); W.lastHp = g.base.hp; }
  if (P.heal !== undefined) g.mods.healMul = P.heal;
  if (P.elite) W.eliteAdd += P.elite;
  if (P.range) g.rangeMul = (g.rangeMul || 1) * P.range;
  ev(g, 'wkPact', { i: o.i, id, name: P.name, mul: weeklyPactMul(W.pacts) });
  return true;
}
function tick(g, dt) {
  const W = g.wk, M = W.mod;
  if (g.base.hp < W.lastHp - 0.01 && g.phase === 'wave') W.leak = true;
  W.lastHp = g.base.hp;
  if (W.offer) { // 계약 고르는 동안 다음 웨이브를 기다린다
    if (g.phase === 'break') g.phaseT = Math.max(g.phaseT, 0.2);
    if ((W.offer.t -= dt) <= 0) choose(g, -1);
  }
  // 연쇄 폭발: 한 틱에 몇 개씩 (줄줄이 터지는 맛)
  for (let k = 0; k < 4 && W.boomQ.length; k++) {
    const d = W.boomQ.shift(), y = W.boomQ.shift(), x = W.boomQ.shift();
    const r = M.chain.r;
    ev(g, 'explode', { x, y, r, wk: true });
    S.forEnemiesNear(g, x, y, r, (o) => { if (!o.dead) S.damageEnemy(g, o, o.boss || o.mid ? d * 0.25 : d, false, null, true); });
  }
  if (g.phase !== 'wave') return;
  if (M.tide && W.wave >= (M.tide.from || 1) && (W.tideT -= dt) <= 0) { W.tideT = M.tide.every; g.megaT = M.tide.sec; ev(g, 'wkTide', { sec: M.tide.sec }); }
  if (M.bounty && (W.bountyT -= dt) <= 0) {
    W.bountyT = M.bounty.every;
    let best = null;
    for (const e of g.enemies) if (!e.dead && !e.boss && !e.mid && !e.wkMark && !e.wkGob && e.y > 40 && e.y < g.ropeY - 180 && (!best || e.maxHp > best.maxHp)) best = e;
    if (best) { best.wkMark = true; best.maxHp *= M.bounty.hp; best.hp *= M.bounty.hp; ev(g, 'wkBounty', { x: best.x, y: best.y, got: false }); }
  }
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (e.wkMark && e.atRope) { e.wkMark = false; ev(g, 'wkBountyLost', { x: e.x, y: e.y }); }
    if (e.wkPh !== undefined && e.wkPh < WKX.phase.length && e.hp / e.maxHp < WKX.phase[e.wkPh]) bossPhase(g, e);
  }
}
// 최종 보스 단계: 부하를 부르고 빨라지고 · 마지막 단계는 분노 (입구를 더 세게)
function bossPhase(g, e) {
  const k = e.wkPh++;
  const tpl = g.weekly.waves[0].g;
  for (let i = 0; i < WKX.phaseAdd[k]; i++) { const t = tpl[i % tpl.length][0]; const o = S.spawnEnemy(g, t, Math.max(24, Math.min(g.W - 24, e.x + (i - WKX.phaseAdd[k] / 2) * 26)), Math.max(-20, e.y - 30 - (i % 3) * 20), { hpX: 0.6 }); o.wkAdd = true; }
  e.speed *= WKX.phaseSpd; e.baseSpeed = e.speed;
  if (k === WKX.phase.length - 1) { e.atk *= WKX.phaseAtk; e.baseAtk = e.atk; }
  ev(g, 'wkPhase', { n: k + 1, of: WKX.phase.length, x: e.x, y: e.y, enemy: e.type, rage: k === WKX.phase.length - 1 });
}
// 결과 요약 (서버로 보내는 숫자)
export function summary(g) {
  const W = g.wk;
  if (!W) return {};
  return { combo: g.stats.maxCombo | 0, noLeak: W.noLeak, goals: W.goals, bonus: W.bonus, pacts: W.pacts.map((x) => x || null), tier: g.weekly.tier, goalLog: W.goalLog.slice() };
}
// 화면 확인용 (scripts/lb-weekly-shot.js): 계약 창 바로 띄우기 · 마지막 웨이브로 건너뛰기
function forceOffer(g) { const W = g.wk; W.offer = { i: 0, opts: g.weekly.offers[0].slice(), t: WKX.offerSec }; ev(g, 'wkOffer', { i: 0, opts: W.offer.opts }); }
function jumpLast(g) { for (const e of g.enemies) e.dead = true; g.spawnQ = []; g.spawnI = 0; g.wave = g.wk.last - 1; S.startWave(g, g.wk.last); }
