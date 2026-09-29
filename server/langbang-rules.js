'use strict';
// 랑방 대전 — 서버가 믿는 경제 규칙 (보상 · 강화 비용 · 해금).
// 화면 표시/손님용 같은 공식이 public/langbang/data.js 에 있다. 둘이 어긋나면 test/langbang.test.js 가 잡는다.

const LB_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu', 'junseo', 'hyungyeong', 'ara', 'hochan'];
const HIDDEN = ['eunok', 'hanna', 'sunggu'];
const GACHA = ['junseo', 'hyungyeong', 'ara', 'hochan']; // 모집(뽑기)으로만 합류
const LOCKED = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', ...HIDDEN, ...GACHA]; // 해금이 필요한 영웅
const META_MAX = 20;
// 멤버 등급별 강화 한도 (화면 data.js HERO_TIER · TIER_MAX 와 같음)
const HERO_TIER = { bangjang: 1, staff: 1, gunman: 1, gunnyeo: 1, dohoon: 2, myunghoon: 2, eunok: 2, ingyu: 2, hanna: 3, donghan: 3, sunggu: 3, youngjun: 3, junseo: 4, hyungyeong: 4, ara: 4, hochan: 5 };
const TIER_MAX = [20, 12, 16, 20, 20, 20];
const metaMaxOf = (id) => TIER_MAX[HERO_TIER[id] || 1];
const STAGE_COUNT = 60;
const STAGE_WAVES = 5;
const STAGES_PER_CHAPTER = 10;
const HERO_UNLOCK = { dohoon: 6, eunok: 10, myunghoon: 13, hanna: 15, ingyu: 17, sunggu: 20, donghan: 22, youngjun: 23 }; // 1-6 · 1-10 · 2-3 · 2-5 · 2-7 · 2-10 · 3-2 · 3-3
const ENDLESS_UNLOCK = 10;
// 도감에 올라가는 진상 (화면 data.js ENEMIES 와 같아야 한다 — 테스트가 검사)
const ENEMY_IDS = ['yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'queen', 'boss_thug', 'vomit', 'couple', 'handsy', 'gao', 'selfie', 'cutter', 'kkondae', 'spam',
  'inpi_gossip', 'inpi_dictator', 'inpi_clique', 'scammer', 'boss_gapjil', 'boss_inpi', 'boss_loan', 'inpi_treasurer', 'boss_union',
  'mid_mukti', 'mid_drunk', 'mid_thug', 'mid_scammer', 'mid_selfie', 'mid_gao', 'mid_kkondae', 'fuse_kko', 'fuse_puke', 'fuse_gossip', 'fuse_spam', 'fuse_inpi',
  'fakesingle', 'secretmom', 'carpoor', 'sales', 'sarcasm', 'jjijil', 'otaku', 'drunk_cry', 'drunk_run', 'drunk_sleep', 'drunk_home', 'kkondae2',
  'boss_kkondol', 'boss_queenmom', 'boss_sales', 'boss_otaku', 'boss_jusa', 'boss_soloparty',
  'mid_fakesingle', 'mid_carpoor', 'fuse_lease', 'fuse_lie', 'mid_otaku', 'mid_sarcasm', 'fuse_jusa', 'fuse_sleep'];
// 중간 보스가 나오는 스테이지 (1-1 · 1-2 제외) — 클리어 보상에 중간 보스 보너스
const hasMid = (s) => s >= 3;

const ITEMS = {
  door: { max: 10, per: 0.1, base: 50 },
  coupon: { max: 10, per: 0.06, base: 60 },
  battery: { max: 10, per: 0.08, base: 40 },
  charm: { max: 10, per: 0.015, base: 55 },
  drink: { max: 3, per: 1, costs: [600, 2400, 6000] },
  slot5: { max: 1, per: 1, costs: [25000] },
  slot6: { max: 1, per: 1, costs: [80000], needs: 'slot5' },
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
function stageReward(s, stars, prevStars = 0, couponLv = 0, perfect = false, firstPerfect = false) {
  const base = clearCoins(s);
  const clear = Math.round(base * (0.7 + 0.1 * stars));
  const first = prevStars ? 0 : base * REWARD.firstMul;
  const newStars = Math.max(0, stars - prevStars);
  const star = Math.round(base * REWARD.starMul) * newStars;
  const perf = perfect ? Math.round(base * (firstPerfect ? 1.5 : 0.5)) : 0; // 퍼펙트 (입구 무피해)
  const mid = hasMid(s) ? Math.round(base * 0.2) : 0; // 중간 보스 처치 보너스
  const mul = 1 + itemValue('coupon', couponLv);
  const total = Math.round((clear + first + star + perf + mid) * mul);
  return { clear, first, star, perfect: perf, mid, newStars, bonus: total - clear - first - star - perf - mid, total };
}
const DECK_BASE = 4;
// 헬 모드 (화면 data.js 와 같은 규칙)
const HELL_COIN = 3;
const hellOpen = (stages, s, master) => !!master || ((stages || {})[s] | 0) >= 3;
function hellReward(s, stars, prevStars = 0, couponLv = 0) {
  const r = stageReward(s, stars, prevStars, couponLv, false, false);
  const total = Math.round(r.total * HELL_COIN);
  return Object.assign({}, r, { hell: true, total, bonus: r.bonus + (total - r.total) });
}
const deckSlots = (items) => DECK_BASE + ((items && items.slot5) | 0) + ((items && items.slot5 && items.slot6) | 0);
// 예전 덱 칸(기본 5 · slot6 = 6칸 · slot7 = 7칸) → 새 칸(기본 4 · slot5 · slot6). 산 칸은 한 칸씩 남긴다
function migrateDeckItems(items) {
  if (!items) return items;
  if (items.slot7) { items.slot5 = 1; items.slot6 = 1; }
  else if (items.slot6 && !items.slot5) { items.slot5 = 1; items.slot6 = 0; }
  delete items.slot7;
  return items;
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
const heroUnlocked = (lb, hero) => !!lb.master || !LOCKED.includes(hero) || !!(lb.owned && lb.owned[hero])
  || (!!HERO_UNLOCK[hero] && ((lb.stages && (lb.stages[HERO_UNLOCK[hero]] | 0) > 0) || ((lb.heroes && lb.heroes[hero]) | 0) > 0));
// 무한 도전: 1-10 클리어, 또는 예전(20웨이브 시절) 기록이 있는 사람
const endlessUnlocked = (lb) => maxCleared(lb.stages) >= ENDLESS_UNLOCK || (lb.bestWave | 0) > 0;

// ─── 장비 (화면 data.js 와 같음) ───

// ─── 장비 (서버 langbang-rules.js 와 같은 공식 — 테스트가 검사) ─────────
// 무기(w) · 액세서리(a) 한 칸씩. 드롭은 서버가 (스테이지 · 별 · 퍼펙트 · 시드)로 계산한다.
const GEAR_RARITY = {
  common: { id: 'common', name: '일반', mul: 1, color: '#9fb3c8' },
  rare: { id: 'rare', name: '희귀', mul: 1.7, color: '#4ea8ff' },
  epic: { id: 'epic', name: '영웅', mul: 2.6, color: '#c77dff' },
  legend: { id: 'legend', name: '전설', mul: 4, color: '#ffb400' },
};
const GEAR_RARITIES = ['common', 'rare', 'epic', 'legend'];
const GEAR_STATS = {
  atk: { name: '공격력', pct: true }, spd: { name: '기본 공격 속도', pct: true }, crit: { name: '치명타', pct: true },
  skill: { name: '스킬 피해', pct: true }, cd: { name: '스킬 쿨타임 감소', pct: true }, attr: { name: '상성 피해', pct: true },
  strip: { name: '버프 벗기기 확률', pct: true }, hp: { name: '입구 내구도', pct: true }, range: { name: '사거리 (최대 +35%)', pct: true },
};
const GEAR = {
  megaphone: { id: 'megaphone', slot: 'w', icon: '📣', name: '명품 확성기', stat: 'atk', base: 0.06 },
  goldmic: { id: 'goldmic', slot: 'w', icon: '🎤', name: '노래방 황금 마이크', stat: 'skill', base: 0.1 },
  scope: { id: 'scope', slot: 'w', icon: '🔭', name: '새총 스코프', stat: 'crit', base: 0.03 },
  sojuset: { id: 'sojuset', slot: 'w', icon: '🍶', name: '소주잔 세트', stat: 'attr', base: 0.08 },
  stamp: { id: 'stamp', slot: 'w', icon: '🔨', name: '강퇴 망치', stat: 'strip', base: 0.06 },
  tumbler: { id: 'tumbler', slot: 'w', icon: '🥤', name: '아아 텀블러', stat: 'spd', base: 0.05 },
  belt: { id: 'belt', slot: 'a', icon: '🏋️', name: '헬스장 리프팅 벨트', stat: 'atk', base: 0.05 },
  carrier: { id: 'carrier', slot: 'a', icon: '🧳', name: '여행 캐리어 방패', stat: 'hp', base: 0.04 },
  hourglass: { id: 'hourglass', slot: 'a', icon: '⏳', name: '모래시계 키링', stat: 'cd', base: 0.05 },
  nametag: { id: 'nametag', slot: 'a', icon: '📛', name: '랑방 명찰', stat: 'attr', base: 0.06 },
  sneaker: { id: 'sneaker', slot: 'a', icon: '👟', name: '한정판 운동화', stat: 'spd', base: 0.04 },
  clover: { id: 'clover', slot: 'a', icon: '🍀', name: '네잎클로버 폰케이스', stat: 'crit', base: 0.025 },
  telescope: { id: 'telescope', slot: 'w', icon: '📡', name: '망원 확성기', stat: 'range', base: 0.06 },
  slingcord: { id: 'slingcord', slot: 'a', icon: '🎯', name: '장거리 새총 끈', stat: 'range', base: 0.05 },
  laser: { id: 'laser', slot: 'a', icon: '🔦', name: '레이저 포인터', stat: 'range', base: 0.045, ch: 3 },
  passport: { id: 'passport', slot: 'w', icon: '🛂', name: '여권 지갑', stat: 'strip', base: 0.07, ch: 4 },
  sunglass: { id: 'sunglass', slot: 'a', icon: '😎', name: '제주 선글라스', stat: 'crit', base: 0.03, ch: 4 },
  lantern: { id: 'lantern', slot: 'a', icon: '🏮', name: '캠핑 랜턴', stat: 'hp', base: 0.05, ch: 5 },
  guitar: { id: 'guitar', slot: 'w', icon: '🎸', name: 'MT 통기타', stat: 'skill', base: 0.11, ch: 5 },
  santahat: { id: 'santahat', slot: 'a', icon: '🎅', name: '산타 모자', stat: 'cd', base: 0.055, ch: 6 },
  champagne: { id: 'champagne', slot: 'w', icon: '🥂', name: '샴페인 잔', stat: 'atk', base: 0.065, ch: 6 },
};
const GEAR_IDS = Object.keys(GEAR);
const gearPoolFor = (stage) => GEAR_IDS.filter((t) => !GEAR[t].ch || GEAR[t].ch <= Math.ceil(stage / 10));
const GEAR_MAX_LV = 10;
const GEAR_BAG = 80; // 가방 칸
function gearValue(t, r, lv) {
  const g = GEAR[t], R = GEAR_RARITY[r];
  if (!g || !R) return 0;
  return Math.round(g.base * R.mul * (1 + 0.12 * (lv || 0)) * 1000) / 1000;
}
function gearEnhanceCost(r, lv) {
  if (lv >= GEAR_MAX_LV) return null;
  return Math.round((80 * GEAR_RARITY[r].mul * Math.pow(lv + 1, 1.3)) / 10) * 10;
}
function gearSellValue(r, lv) { return Math.round(40 * GEAR_RARITY[r].mul * (1 + (lv || 0) * 0.5)); }
// 시드 난수 (mulberry32)
function seedRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// 드롭: 클리어 1개 (+★★★ 이면 35% 로 1개 더, 퍼펙트면 1개 더). 첫 퍼펙트는 첫 장비가 희귀 이상 확정
function rollDrops(seed, stage, stars, perfect, firstPerfect, hell = false) {
  const rng = seedRng(seed);
  let n = 1 + (stars >= 3 && rng() < 0.35 ? 1 : 0) + (perfect ? 1 : 0) + (hell ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = { common: 70, rare: 24 + stage * 0.4, epic: 5 + stage * 0.35, legend: 0.6 + stage * 0.08 };
    if (perfect) { w.rare *= 1.5; w.epic *= 1.5; w.legend *= 1.5; }
    if (firstPerfect && i === 0) w.common = 0;
    if (hell) { w.common = 0; w.epic *= 2; w.legend *= 2; }
    const sum = w.common + w.rare + w.epic + w.legend;
    let x = rng() * sum, r = 'common';
    for (const k of GEAR_RARITIES) { x -= w[k]; if (x <= 0) { r = k; break; } }
    const pool = gearPoolFor(stage);
    const t = pool[(rng() * pool.length) | 0];
    out.push({ t, r });
  }
  return out;
}
// 멤버 한 명의 장비 능력치 합 → sim createGame({ gear: { heroId: {...} } })
function gearStats(items) {
  const st = {};
  for (const it of items) { if (!it || !GEAR[it.t]) continue; const k = GEAR[it.t].stat; st[k] = (st[k] || 0) + gearValue(it.t, it.r, it.lv); }
  return st;
}

module.exports = {
  hellOpen, hellReward, HELL_COIN,
  GEAR, GEAR_IDS, GEAR_RARITY, GEAR_RARITIES, GEAR_MAX_LV, GEAR_BAG, gearValue, gearEnhanceCost, gearSellValue, seedRng, hashSeed, rollDrops, gearStats, deckSlots, DECK_BASE, migrateDeckItems,
  LB_HEROES, HIDDEN, GACHA, LOCKED, HERO_TIER, TIER_MAX, metaMaxOf, ENEMY_IDS, META_MAX, STAGE_COUNT, STAGE_WAVES, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS,
  metaCost, itemCost, itemValue, clearCoins, stageReward, endlessReward, stageLabel, maxCleared, heroUnlocked, endlessUnlocked,
};
