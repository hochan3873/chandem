'use strict';
// 랑방 대전 — 서버가 믿는 경제 규칙 (보상 · 강화 비용 · 해금).
// 화면 표시/손님용 같은 공식이 public/langbang/data.js 에 있다. 둘이 어긋나면 test/langbang.test.js 가 잡는다.

const LB_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'myunghoon', 'eunok', 'hanna', 'sunggu'];
const HIDDEN = ['eunok', 'hanna', 'sunggu'];
const LOCKED = ['myunghoon', ...HIDDEN]; // 스테이지를 깨야 합류하는 영웅
const META_MAX = 20;
const STAGE_COUNT = 30;
const STAGE_WAVES = 5;
const STAGES_PER_CHAPTER = 10;
const HERO_UNLOCK = { eunok: 10, myunghoon: 13, hanna: 15, sunggu: 20 }; // 1-10 · 2-3 · 2-5 · 2-10
const ENDLESS_UNLOCK = 10;

const ITEMS = {
  door: { max: 10, per: 0.1, base: 50 },
  coupon: { max: 10, per: 0.06, base: 60 },
  battery: { max: 10, per: 0.08, base: 40 },
  charm: { max: 10, per: 0.015, base: 55 },
  drink: { max: 3, per: 1, costs: [600, 2400, 6000] },
};
const ITEM_IDS = Object.keys(ITEMS);

const metaCost = (lv) => Math.round((40 * Math.pow(lv + 1, 1.7)) / 10) * 10;
function itemCost(id, lv) {
  const it = ITEMS[id];
  if (!it || lv >= it.max) return null;
  if (it.costs) return it.costs[lv];
  return Math.round((it.base * Math.pow(lv + 1, 1.6)) / 10) * 10;
}
const itemValue = (id, lv) => (ITEMS[id] ? ITEMS[id].per : 0) * (lv || 0);

const REWARD = { base: 60, perStage: 18, firstMul: 2, starMul: 0.5 };
const clearCoins = (s) => REWARD.base + REWARD.perStage * (s - 1);
function stageReward(s, stars, prevStars = 0, couponLv = 0) {
  const base = clearCoins(s);
  const clear = Math.round(base * (0.7 + 0.1 * stars));
  const first = prevStars ? 0 : base * REWARD.firstMul;
  const newStars = Math.max(0, stars - prevStars);
  const star = Math.round(base * REWARD.starMul) * newStars;
  const mul = 1 + itemValue('coupon', couponLv);
  const total = Math.round((clear + first + star) * mul);
  return { clear, first, star, newStars, bonus: total - clear - first - star, total };
}
function endlessReward(wave, couponLv = 0) {
  const w = Math.max(0, Math.floor(wave));
  return Math.round((12 * w + w * w) * (1 + itemValue('coupon', couponLv)));
}
const stageLabel = (s) => `${Math.ceil(s / STAGES_PER_CHAPTER)}-${((s - 1) % STAGES_PER_CHAPTER) + 1}`;

// 가장 높이 깬 스테이지 (별 기록에서)
function maxCleared(stages) {
  let m = 0;
  for (const k of Object.keys(stages || {})) if ((stages[k] | 0) > 0 && +k > m) m = +k;
  return m;
}
// 해금: 정해진 스테이지를 깼거나, 예전(스테이지 이전)에 이미 강화해 둔 영웅
const heroUnlocked = (lb, hero) => !LOCKED.includes(hero) || (lb.stages && (lb.stages[HERO_UNLOCK[hero]] | 0) > 0) || ((lb.heroes && lb.heroes[hero]) | 0) > 0;
// 무한 도전: 1-10 클리어, 또는 예전(20웨이브 시절) 기록이 있는 사람
const endlessUnlocked = (lb) => maxCleared(lb.stages) >= ENDLESS_UNLOCK || (lb.bestWave | 0) > 0;

module.exports = {
  LB_HEROES, HIDDEN, LOCKED, META_MAX, STAGE_COUNT, STAGE_WAVES, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS,
  metaCost, itemCost, itemValue, clearCoins, stageReward, endlessReward, stageLabel, maxCleared, heroUnlocked, endlessUnlocked,
};
