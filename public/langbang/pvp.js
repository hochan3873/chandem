// 랑방 대전 — 1:1 대전 규칙 (순수 함수 · DOM 없음)
// 화면(game.js) · 전투(sim.js) · 서버(server/langbang-pvp.js)가 이 파일 하나를 같이 쓴다 → 서버와 화면 판정이 어긋나지 않게
//  1) 전투력 맞추기: 대전에서는 강화 +10 · ★3 · 영웅 장비까지만 (그보다 센 것은 그 값으로 낮춰서)
//  2) 진상 체력: 두 사람 덱 전투력으로 정한다 (판 시작 때 서버가 계산해서 시드와 같이 보낸다 → 두 사람 똑같이)
//  3) 웨이브마다 진상 체력 ×1.22 (복리)
//  4) 끝내기: 90초 과열(보내기 ×2) · 150초 폭주(15초마다 진상 ↑ · 자동 중간 보스 · 보스 묶음) · 210초 서든데스(정해진 큰 웨이브 · 입구 무너짐) · 300초면 판정
import { HEROES, GEAR, GEAR_RARITY, gearStats, tierPower, heroTier, gearFits } from './data.js';
import { STAR_ATK } from './live.js';

export const PVP_NORM = { meta: 10, star: 3, rarity: 'epic' };
export const PVP_NOTE = '대전에서는 강화 +10 · 영웅 장비까지만 적용돼요';
const RANK = { common: 0, rare: 1, epic: 2, legend: 3, myth: 4 };
// 신화 장비는 영웅 등급만큼만 (신화 ×6 → 영웅 ×2.6)
export const PVP_MYTH_MUL = GEAR_RARITY.epic.mul / GEAR_RARITY.myth.mul;

export const pvpMeta = (lv) => Math.max(0, Math.min(PVP_NORM.meta, Math.floor(Number(lv) || 0)));
export const pvpStar = (s) => Math.max(1, Math.min(PVP_NORM.star, Math.floor(Number(s) || 0) || 1));
// 전설 · 신화 장비 → 영웅 등급 값으로
export function pvpGearItem(it) {
  if (!it || !GEAR[it.t]) return null;
  return (RANK[it.r] | 0) > RANK.epic && !GEAR[it.t].myth ? Object.assign({}, it, { r: PVP_NORM.rarity }) : it;
}
// 멤버 강화 · 성급 맵을 대전 한도로 (약한 사람은 그대로)
export function pvpCapMap(map, fn) { const out = {}; for (const k in map || {}) out[k] = fn(map[k]); return out; }
// 프로필(화면 P() 또는 서버 lb) + 덱 → 대전용 { deck, meta, stars, gear }
export function pvpLoadout(p, ids) {
  const deck = (ids || []).filter((id) => HEROES[id] && !HEROES[id].summon).slice(0, 7);
  const meta = {}, stars = {}, gear = {};
  for (const id of deck) {
    meta[id] = pvpMeta(((p && p.heroes) || {})[id]);
    stars[id] = pvpStar(((p && p.hstars) || {})[id]);
    const sl = ((p && p.equip) || {})[id] || {};
    const items = ['w', 'a', 'm'].map((k) => ((p && p.gear) || []).find((g) => g && sl[k] !== undefined && g.id === sl[k])).map(pvpGearItem).filter((it) => it && gearFits(it.t, id));
    gear[id] = gearStats(items, PVP_MYTH_MUL); // 전용 신화: 능력치만 (영웅 비율) · 새 효과(sig)는 대전에서 끔
  }
  return { deck, meta, stars, gear };
}
// 멤버 한 명 전투력 (화면 heroPower 와 같은 식 · 대전 한도 적용)
export function pvpHeroPower(id, meta, star, st) {
  const d = HEROES[id];
  if (!d || d.summon) return 0;
  const g = st || {};
  return (d.dmg / d.interval) * tierPower(heroTier(id), pvpMeta(meta)) * (1 + STAR_ATK * (pvpStar(star) - 1)) * (1 + (g.atk || 0)) * (1 + (g.spd || 0)) * (1 + (g.skill || 0) * 0.3) * 10;
}
export function pvpFirepower(lo) {
  if (!lo || !Array.isArray(lo.deck)) return 0;
  let s = 0;
  for (const id of lo.deck) s += pvpHeroPower(id, (lo.meta || {})[id], (lo.stars || {})[id], (lo.gear || {})[id]);
  return Math.round(s);
}
// 진상 체력 배율: 두 사람 전투력 평균으로 (같은 두 덱 → 같은 값 · 순서 상관없음)
export const PVP_HP = { ref: 2400, exp: 0.9, min: 0.6, max: 6 };
export function pvpHpScale(fpA, fpB) {
  const a = Math.max(0, Number(fpA) || 0), b = Math.max(0, Number(fpB) || 0);
  const avg = (a + b) / 2;
  if (!avg) return 1;
  const k = Math.pow(avg / PVP_HP.ref, PVP_HP.exp);
  return Math.round(Math.max(PVP_HP.min, Math.min(PVP_HP.max, k)) * 1000) / 1000;
}

// ─── 끝내기 타임라인 (서버와 화면이 같이) ───
export const PVP_END = {
  waveHp: 1.22, baseLevel: 4, // 웨이브마다 진상 체력 ×1.22 (복리) — 체력은 1웨이브(레벨 4) 기준에서 이것만으로 오른다
  sudden: 150, every: 15, // 150초부터 15초마다 한 단계
  hpStep: 0.15, spdStep: 0.15, // 단계마다 진상 체력 · 속도 +15% (쌓임)
  doorStep: 0.2, // 단계마다 입구가 받는 피해 +20%
  healMul: 0.5, // 서든데스 동안 입구 회복 절반
  drainAt: 210, drain: 0.01, // 210초(서든데스)부터 입구 최대 내구도의 1% 씩 매초
  end: 300, // 300초: 둘 다 살아 있으면 판정
  sendSmall: 5, sendSmallSudden: 8, bigHpSudden: 1.5, // 서든데스 뒤 보내는 진상이 세진다
};
export const pvpStepN = (t) => (t < PVP_END.sudden ? 0 : Math.min(Math.ceil((PVP_END.end - PVP_END.sudden) / PVP_END.every), Math.floor((t - PVP_END.sudden) / PVP_END.every) + 1));
export const pvpWaveHp = (n) => Math.pow(PVP_END.waveHp, Math.max(0, (n | 0) - 1));
// 덱 전투력 배율은 처음엔 대장 혼자라 웨이브 1 → 5 에 걸쳐 천천히 다 들어간다
export const PVP_HP_RAMP = 4;
export const pvpMatchHp = (hp, n) => 1 + ((Number(hp) || 1) - 1) * Math.min(1, Math.max(0, (n | 0) - 1) / PVP_HP_RAMP);
// 300초 판정: 입구 남은 % 높은 쪽 → 처치 많은 쪽 → 무승부. 1 = a 승 · -1 = b 승 · 0 = 무승부
export function pvpJudge(a, b) {
  const pct = (p) => Math.round((Math.max(0, Number(p.hp) || 0) / Math.max(1, Number(p.max) || 1)) * 1000); // 0.1% 단위
  const pa = pct(a), pb = pct(b);
  if (pa !== pb) return pa > pb ? 1 : -1;
  const ka = Math.floor(Number(a.kills) || 0), kb = Math.floor(Number(b.kills) || 0);
  if (ka !== kb) return ka > kb ? 1 : -1;
  return 0;
}
// ─── 늘어지는 판 막기: 단계 (서버 시계 · 두 사람 똑같이) ───
//  0 기본 → 1 과열(90초): 보내기 ×2 → 2 폭주(150초): 처치 N명마다 중간 보스 자동 · 보스 묶음
//  → 3 서든데스(210초): 처치와 상관없이 정해진 큰 웨이브 · 입구 피해 더 · 입구 무너짐 시작
export const PVP_ESC = {
  at: [0, 90, 150, 210], // 단계 시작 초
  name: ['', '과열', '폭주', '서든데스'],
  mul: [1, 2, 2, 3], // 보내기 한 번에 가는 묶음 수 (단계별)
  autoEvery: 25, // 폭주부터: 처치 25명마다 상대에게 중간 보스 하나 (게이지 안 씀)
  bunch: [[150, 2], [180, 3]], // 보스 묶음: [초, 보스 수] — 두 사람에게 똑같이
  bunchHp: 0.5, // 보스 묶음 한 명 체력 (웨이브 보스 대비)
  sdEvery: 8, sdPacks: 1, sdMid: 2, // 서든데스: 10초마다 빠른 진상 한 묶음(8명) + 중간 보스 1
  sdDoor: 1.5, // 서든데스: 입구가 받는 피해 ×1.5 (폭주 단계 피해에 곱해서)
  cap: 110, // 보내기로 한꺼번에 화면에 있는 진상 최대 (느린 폰) — 넘치면 수 대신 체력으로
};
export const pvpPhase = (t) => { let p = 0; for (let i = 1; i < PVP_ESC.at.length; i++) if ((Number(t) || 0) >= PVP_ESC.at[i]) p = i; return p; };
export const pvpSendMul = (t) => PVP_ESC.mul[pvpPhase(t)];
// 폭주 자동 중간 보스: from = 세기 시작한 처치 수 (null 이면 지금부터) → 이번에 보낼 수 n
export function pvpAutoBig(t, kills, from) {
  if (pvpPhase(t) < 2) return { from: null, n: 0 };
  const k = Math.max(0, Math.floor(Number(kills) || 0));
  if (from === null || from === undefined || from > k) return { from: k, n: 0 };
  const n = Math.floor((k - from) / PVP_ESC.autoEvery);
  return { from: from + n * PVP_ESC.autoEvery, n };
}
// 서든데스 정해진 웨이브: t 초까지 몇 번 나왔어야 하나 · 보스 묶음: 몇 번
export const pvpSdCount = (t) => (t < PVP_ESC.at[3] ? 0 : Math.min(Math.floor((Math.min(t, PVP_END.end) - PVP_ESC.at[3]) / PVP_ESC.sdEvery) + 1, Math.ceil((PVP_END.end - PVP_ESC.at[3]) / PVP_ESC.sdEvery)));
export const pvpBunchCount = (t) => PVP_ESC.bunch.filter(([s]) => t >= s).length;
// 상대 미니 화면 점: x(0~63) · y(0~63) · 종류(0 진상 · 1 중간 보스 · 2 보스 · 3 보낸 진상) → 정수 하나
export const PVP_DOTS = 40;
export const pvpDot = (x, y, k) => Math.max(0, Math.min(63, x | 0)) | (Math.max(0, Math.min(63, y | 0)) << 6) | ((k & 3) << 12);
export const pvpUndot = (v) => ({ x: v & 63, y: (v >> 6) & 63, k: (v >> 12) & 3 });
export const pvpLeftText =(t) => { const s = Math.max(0, Math.ceil(PVP_END.end - t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
