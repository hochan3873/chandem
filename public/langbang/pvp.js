// 랑방 대전 — 1:1 대전 규칙 (순수 함수 · DOM 없음)
// 화면(game.js) · 전투(sim.js) · 서버(server/langbang-pvp.js)가 이 파일 하나를 같이 쓴다 → 서버와 화면 판정이 어긋나지 않게
//  1) 전투력 맞추기: 대전에서는 강화 +10 · ★3 · 영웅 장비까지만 (그보다 센 것은 그 값으로 낮춰서)
//  2) 진상 체력: 두 사람 덱 전투력으로 정한다 (판 시작 때 서버가 계산해서 시드와 같이 보낸다 → 두 사람 똑같이)
//  3) 웨이브마다 진상 체력 ×1.22 (복리)
//  4) 끝내기: 150초부터 15초마다 서든데스 단계 ↑ · 240초부터 입구가 초당 1% 씩 줄고 · 300초면 판정
import { HEROES, GEAR, GEAR_RARITY, gearStats, tierPower, heroTier } from './data.js';
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
    const items = ['w', 'a', 'm'].map((k) => ((p && p.gear) || []).find((g) => g && sl[k] !== undefined && g.id === sl[k])).map(pvpGearItem).filter(Boolean);
    gear[id] = gearStats(items, PVP_MYTH_MUL);
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
  drainAt: 240, drain: 0.01, // 240초부터 입구 최대 내구도의 1% 씩 매초
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
export const pvpLeftText = (t) => { const s = Math.max(0, Math.ceil(PVP_END.end - t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
