'use strict';
// 랑방 대전 — 서버가 믿는 경제 규칙 (보상 · 강화 비용 · 해금).
// 화면 표시/손님용 같은 공식이 public/langbang/data.js 에 있다. 둘이 어긋나면 test/langbang.test.js 가 잡는다.

const LB_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu', 'junseo', 'hyungyeong', 'ara', 'hochan', 'soyoung', 'jieun', 'sanghwa', 'jungmin', 'jiwon', 'wonsik', 'jeongseob', 'byunghwa', 'baul'];
const HIDDEN = ['eunok', 'hanna', 'sunggu'];
const GACHA = ['junseo', 'hyungyeong', 'ara', 'hochan', 'soyoung', 'jieun', 'sanghwa', 'jungmin', 'jiwon', 'wonsik', 'jeongseob', 'byunghwa', 'baul']; // 모집(뽑기)으로만 합류
const LOCKED = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', ...HIDDEN, ...GACHA]; // 해금이 필요한 영웅
const META_MAX = 20;
// 멤버 등급별 강화 한도 (화면 data.js HERO_TIER · TIER_MAX 와 같음)
const HERO_TIER = { bangjang: 1, staff: 1, gunman: 1, gunnyeo: 1, dohoon: 2, myunghoon: 2, eunok: 2, ingyu: 2, hanna: 3, donghan: 3, sunggu: 3, youngjun: 3, junseo: 4, hyungyeong: 4, ara: 4, hochan: 5, soyoung: 3, jieun: 3, sanghwa: 2, jungmin: 2, jiwon: 3, wonsik: 3, jeongseob: 3, byunghwa: 5, baul: 3 };
const TIER_MAX = [20, 20, 20, 20, 20, 20];
const metaMaxOf = (id) => TIER_MAX[HERO_TIER[id] || 1];
const STAGE_COUNT = 60;
const STAGE_WAVES = 5;
const STAGES_PER_CHAPTER = 10;
const HERO_UNLOCK = { dohoon: 6, eunok: 10, myunghoon: 13, hanna: 15, ingyu: 17, sunggu: 20, donghan: 22, youngjun: 23 }; // 1-6 · 1-10 · 2-3 · 2-5 · 2-7 · 2-10 · 3-2 · 3-3
const ENDLESS_UNLOCK = 10;
// 도감에 올라가는 진상 (화면 data.js ENEMIES 와 같아야 한다 — 테스트가 검사)
const ENEMY_IDS = ['earphone', 'noshow', 'clubguy', 'clubgirl', 'praise1', 'praise2', 'yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'queen', 'boss_thug', 'vomit', 'couple', 'handsy', 'gao', 'selfie', 'cutter', 'kkondae', 'spam',
  'inpi_gossip', 'inpi_dictator', 'inpi_clique', 'scammer', 'boss_gapjil', 'boss_inpi', 'boss_loan', 'inpi_treasurer', 'boss_union',
  'mid_mukti', 'mid_drunk', 'mid_thug', 'mid_scammer', 'mid_selfie', 'mid_gao', 'mid_kkondae', 'fuse_kko', 'fuse_puke', 'fuse_gossip', 'fuse_spam', 'fuse_inpi',
  'fakesingle', 'secretmom', 'carpoor', 'sales', 'sarcasm', 'jjijil', 'otaku', 'drunk_cry', 'drunk_run', 'drunk_sleep', 'drunk_home', 'kkondae2',
  'boss_kkondol', 'boss_queenmom', 'boss_sales', 'boss_otaku', 'boss_jusa', 'boss_soloparty',
  'mid_fakesingle', 'mid_carpoor', 'fuse_lease', 'fuse_lie', 'mid_otaku', 'mid_sarcasm', 'fuse_jusa', 'fuse_sleep',
  'fuse_karaoke', 'fuse_taxi', 'fuse_mt', 'fuse_latte', 'fuse_adspam'];
// 중간 보스가 나오는 스테이지 (1-1 · 1-2 제외) — 클리어 보상에 중간 보스 보너스
const hasMid = (s) => s >= 3;

const ITEMS = {
  door: { max: 15, per: 0.1, base: 150 },
  coupon: { max: 15, per: 0.04, base: 250 },
  battery: { max: 15, per: 0.08, base: 120 },
  charm: { max: 15, per: 0.015, base: 165 },
  drink: { max: 3, per: 1, costs: [600, 2400, 6000] },
  slot5: { max: 1, per: 1, costs: [25000] },
  slot6: { max: 1, per: 1, costs: [80000], needs: 'slot5' },
};
const ITEM_IDS = Object.keys(ITEMS);

const metaCost = (lv) => Math.round((40 * Math.pow(lv + 1, 1.7)) / 10) * 10;
// Lv.11~15 (5·6장에서 열리는 윗단계): 값이 가파르게 (×1.6 씩) · 효과는 한 단계에 절반 (화면 data.js 와 같음)
const ITEM_TOP = { from: 10, costMul: 1.6, perMul: 0.5 };
function itemCost(id, lv) {
  const it = ITEMS[id];
  if (!it || lv >= it.max) return null;
  if (it.costs) return it.costs[lv];
  return Math.round((it.base * Math.pow(lv + 1, 1.6) * (lv >= ITEM_TOP.from ? Math.pow(ITEM_TOP.costMul, lv - ITEM_TOP.from + 1) : 1)) / 10) * 10;
}
const itemValue = (id, lv) => { const per = ITEMS[id] ? ITEMS[id].per : 0; lv = lv || 0; return per * Math.min(lv, ITEM_TOP.from) + per * ITEM_TOP.perMul * Math.max(0, lv - ITEM_TOP.from); };
// 진행도에 따라 살 수 있는 레벨 상한 (깬 장 수 0~6) — 이미 산 레벨은 그대로 둔다
const ITEM_LV_CAP = { stat: [3, 5, 7, 9, 10, 12, 15], drink: [1, 2, 2, 3, 3, 3, 3] };
function itemLvCap(id, maxStage) {
  const it = ITEMS[id]; if (!it) return 0;
  const c = Math.max(0, Math.min(6, Math.floor((maxStage | 0) / STAGES_PER_CHAPTER)));
  const t = id === 'drink' ? ITEM_LV_CAP.drink : it.costs ? null : ITEM_LV_CAP.stat;
  return t ? Math.min(it.max, t[c]) : it.max;
}
function itemGateCh(id, lv, maxStage) {
  const it = ITEMS[id]; if (!it || lv >= it.max) return null;
  if (lv < itemLvCap(id, maxStage)) return 0;
  for (let c = 1; c <= 6; c++) if (itemLvCap(id, c * STAGES_PER_CHAPTER) > lv) return c;
  return null;
}

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
  myth: { id: 'myth', name: '신화', mul: 6, color: '#ff7ad9' }, // 드롭·합성 등급 목록(GEAR_RARITIES)에는 없음
};
const GEAR_RARITIES = ['common', 'rare', 'epic', 'legend'];
const GEAR_STATS = {
  atk: { name: '공격력', pct: true }, spd: { name: '기본 공격 속도', pct: true }, crit: { name: '치명타', pct: true },
  skill: { name: '스킬 피해', pct: true }, cd: { name: '스킬 쿨타임 감소', pct: true }, attr: { name: '상성 피해', pct: true },
  strip: { name: '버프 벗기기 확률', pct: true }, hp: { name: '입구 내구도', pct: true }, range: { name: '사거리 (최대 +35%)', pct: true },
  res: { name: '상태이상 시간 감소', pct: true },
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
  hangover: { id: 'hangover', slot: 'a', icon: '💊', name: '숙취해소 부적', stat: 'res', base: 0.06 },
  gymcard: { id: 'gymcard', slot: 'a', icon: '', name: '헬스장 1년 회원권', stat: 'boss', base: 0.07 },
  speaker: { id: 'speaker', slot: 'w', icon: '', name: '클럽 우퍼 스피커', stat: 'swarm', base: 0.07 },
  goldchain: { id: 'goldchain', slot: 'a', icon: '', name: '18K 금목걸이', stat: 'critDmg', base: 0.1, ch: 2 },
  rolex: { id: 'rolex', slot: 'a', icon: '', name: '명품 시계', stat: 'ult', base: 0.015, ch: 3 },
  corpcard: { id: 'corpcard', slot: 'w', icon: '', name: '법인카드', stat: 'exp', base: 0.012, ch: 3 },
  lastorder: { id: 'lastorder', slot: 'w', icon: '', name: '라스트오더 종', stat: 'exec', base: 0.12, ch: 4 },
  radio: { id: 'radio', slot: 'a', icon: '', name: '경호원 무전기', stat: 'guard', base: 0.012, ch: 5 },
};
// 신화 (전설 위): 어느 멤버에게나 좋은 만능 장비 6종 · 멤버마다 신화 칸(m) 하나 · 강화·합성 없음 (처음부터 완성)
//   드롭: 무한 50웨이브(주마다) · 시즌 마지막 단계 · 모집 0.3% · 장비 뽑기 1%
const MYTH = {
  myth_card: { name: '황금 멤버십 카드', stats: { atk: 0.1, spd: 0.1, skill: 0.1, hp: 0.1 }, desc: '모든 능력치 +10%' },
  myth_seal: { name: '방장의 인장', stats: { cd: 0.15 }, desc: '스킬 쿨타임 −15%' },
  myth_soup: { name: '전설의 해장국', stats: { res: 0.4, regen: 0.02 }, desc: '상태이상 시간 −40% · 입구 초당 2% 회복' },
  myth_stick: { name: '무지개 응원봉', stats: { spd: 0.15 }, desc: '공격 속도 +15%' },
  myth_lotto: { name: '1등 복권', stats: { crit: 0.12, coin: 0.2 }, desc: '치명타 +12% · 코인 +20%' },
  myth_crown: { name: '랑방 VIP 왕관', stats: { ult: 0.25 }, desc: '총공지(궁극기) 충전 +25%' },
};
const MYTH_IDS = Object.keys(MYTH);
for (const [id, m] of Object.entries(MYTH)) { const k = Object.keys(m.stats)[0]; GEAR[id] = { id, slot: 'm', icon: '🌈', name: m.name, stat: k, base: m.stats[k], stats: m.stats, myth: true }; }
const GEAR_IDS = Object.keys(GEAR).filter((t) => !GEAR[t].myth); // 일반 드롭 · 모집 장비 (신화 제외)
const gearPoolFor = (stage) => GEAR_IDS.filter((t) => !GEAR[t].ch || GEAR[t].ch <= Math.ceil(stage / 10));
const GEAR_MAX_LV = 10;
const GEAR_BAG = 80; // 가방 칸
function gearValue(t, r, lv) {
  const g = GEAR[t], R = GEAR_RARITY[r];
  if (!g || !R) return 0;
  if (g.myth) return g.base; // 신화: 고정
  return Math.round(g.base * R.mul * (1 + 0.12 * (lv || 0)) * 1000) / 1000;
}
function gearEnhanceCost(r, lv) {
  if (lv >= GEAR_MAX_LV || r === 'myth') return null; // 신화는 강화 없음
  return Math.round((100 * GEAR_RARITY[r].mul * Math.pow(lv + 1, 2.3)) / 10) * 10; // 영웅 +10: 성공만 치면 약 18만 · 실패(+4부터 90%→40%) 포함 기대 비용 약 35만 + 강화석 15개
}
// 강화석: +6 부터 필요 (+6 1개 · +7 2개 · +8 3개 · +9 4개 · +10 5개)
function gearStoneNeed(lv) { return lv >= 5 && lv < GEAR_MAX_LV ? lv - 4 : 0; }
// 분해: 장비 → 강화석 (팔기 대신)
function gearDismantle(r, lv) { return ({ common: 1, rare: 2, epic: 4, legend: 8, myth: 30 })[r] + Math.floor((lv || 0) / 3); }
// 합성: 같은 등급 3개 → 다음 등급 1개 (전설은 합성 불가) · 수수료
const GEAR_NEXT = { common: 'rare', rare: 'epic', epic: 'legend' };
const GEAR_FUSE_FEE = { rare: 500, epic: 2000, legend: 6000 }; // 만들어지는 등급 기준
// 스테이지 강화석: 1-6 부터 · 별 많을수록 잘 나옴 · 보스 +2 · 처음 깰 때 +1 · 헬 ×2
function rollStones(seed, stage, stars, first, hell) {
  if (stage < 6 || !stars) return 0;
  const rng = seedRng(seed ^ 0x5a17);
  let n = rng() < 0.25 + 0.12 * stars ? 1 : 0;
  if (((stage - 1) % 10) === 9) n += 2;
  if (first) n += 1;
  return hell ? n * 2 : n;
}
// 강화 성공 확률 (+1~+3 는 무조건 · 그 뒤로 90% → +10 은 40%). 실패해도 장비는 안 깨지고 레벨도 안 내려간다 — 비용만
const GEAR_SUCCESS = [1, 1, 1, 0.9, 0.82, 0.74, 0.66, 0.57, 0.48, 0.4];
function gearEnhanceChance(lv) { return lv >= GEAR_MAX_LV ? 0 : GEAR_SUCCESS[lv]; }
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


// 멤버 강화에 드는 그 멤버 카드 (+1~5 1장 · +6~10 2장 · +11~15 3장 · +16~20 5장) — ★승급과 같은 카드(조각)를 같이 쓴다
function heroCardNeed(lv) { const L = lv + 1; return L <= 5 ? 1 : L <= 10 ? 2 : L <= 15 ? 3 : 5; }
// 스테이지 카드 드롭: 이번 판에 데려간(가진) 멤버 중 하나 · 별 많을수록 · 헬 ×2
function rollHeroCard(seed, stars, hell, used) {
  if (!stars || !used.length) return null;
  const rng = seedRng(seed ^ 0x3c1d);
  const p = (0.07 + 0.02 * stars) * (hell ? 2 : 1); // (0.12+0.03별 → 조임: 진행 3~4주)
  if (rng() >= p) return null;
  return used[(rng() * used.length) | 0];
}
const CARD_PICK = { cost: 1500, n: 5, perWeek: 5 }; // 상점 "멤버 카드 선택권": 고른 멤버 카드 5장 · 주 5번 (2500·3장·주 3번 → 장당 833 → 300 코인: 카드가 강화의 병목이라)

module.exports = {
  MYTH, MYTH_IDS,
  hellOpen, hellReward, HELL_COIN,
  heroCardNeed, rollHeroCard, CARD_PICK,
  GEAR, GEAR_IDS, GEAR_RARITY, GEAR_RARITIES, GEAR_MAX_LV, GEAR_BAG, gearValue, gearEnhanceCost, gearStoneNeed, gearDismantle, GEAR_NEXT, GEAR_FUSE_FEE, rollStones, gearEnhanceChance, GEAR_SUCCESS, gearSellValue, seedRng, hashSeed, rollDrops, gearStats, deckSlots, DECK_BASE, migrateDeckItems,
  LB_HEROES, HIDDEN, GACHA, LOCKED, HERO_TIER, TIER_MAX, metaMaxOf, ENEMY_IDS, META_MAX, STAGE_COUNT, STAGE_WAVES, HERO_UNLOCK, ENDLESS_UNLOCK, ITEMS, ITEM_IDS,
  metaCost, itemCost, itemValue, itemLvCap, itemGateCh, ITEM_LV_CAP, ITEM_TOP, clearCoins, stageReward, endlessReward, stageLabel, maxCleared, heroUnlocked, endlessUnlocked,
};
