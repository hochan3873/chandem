// 랑방 대전 — 서버 API 클라이언트 + 손님(로그인 안 함) 진행 저장
// 로그인: 코인 보상·강화·아이템은 전부 서버가 계산하고 확인한다 (/api/langbang/*)
// 손님: 같은 공식(data.js)으로 이 기기 localStorage 에만 저장 (랭킹에는 안 올라감)
import {
  HEROES, LOCKED_HEROES, HERO_UNLOCK, ENDLESS_UNLOCK, ITEM_IDS, STAGE_COUNT, META_MAX,
  metaCost, itemCost, itemGateCh, stageReward, endlessReward, deckSlots, migrateDeckItems, hellReward, hellOpen, metaMaxOf,
  GEAR, GEAR_RARITY, GEAR_MAX_LV, GEAR_BAG, gearEnhanceCost, gearEnhanceChance, gearSellValue, rollDrops, gearStats, stageBosses,
  GEAR_IDS, gearStoneNeed, gearDismantle, GEAR_NEXT, GEAR_FUSE_FEE, rollStones, heroCardNeed, rollHeroCard, CARD_PICK,
} from './data.js';
import * as L from './live.js';
import * as TW from './tower.js';

const GUEST_KEY = 'langbang:guest';
const OLD_GUEST_KEY = 'langbang:guestBest'; // 예전(20웨이브 시절) 손님 최고 기록

function token() {
  try { return JSON.parse(localStorage.getItem('chandem:auth')); } catch { return null; }
}
// 이어하기 저장본이 누구 것인지 구분 (토큰 앞부분 = 사용자 id)
export function accountKey() {
  const t = token();
  return t ? 'u:' + String(t).split('.')[0] : 'guest';
}

async function call(path, body) {
  const t = token();
  const headers = {};
  if (t) headers.authorization = 'Bearer ' + t;
  const opt = { headers };
  if (body !== undefined) {
    opt.method = 'POST';
    headers['content-type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), 8000) : 0;
  if (ctl) opt.signal = ctl.signal;
  try {
    const r = await fetch(path, opt);
    let j = null;
    try { j = await r.json(); } catch { j = null; }
    if (!j) return { ok: false, status: r.status, message: '서버 응답이 이상해요' };
    if (!r.ok && j.ok === undefined) j.ok = false;
    j.status = r.status;
    return j;
  } catch (e) {
    return { ok: false, status: 0, message: '서버에 연결할 수 없어요' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ─── 규칙 (서버 langbang-rules.js 와 같음) ─────────────
export function maxCleared(stages) {
  let m = 0;
  for (const k of Object.keys(stages || {})) if ((stages[k] | 0) > 0 && +k > m) m = +k;
  return m;
}
export function heroUnlocked(p, hero) { return L.heroUnlocked(p, hero); }
export function endlessUnlocked(p) { return maxCleared(p.stages) >= ENDLESS_UNLOCK || (p.bestWave | 0) > 0; }

// 서버/손님 프로필을 같은 모양으로
function normalize(p, guest) {
  const out = Object.assign({ level: 1, exp: 0, expToNext: 0, coins: 0, bestWave: 0, bestScore: 0 }, p || {});
  out.heroes = {};
  for (const id of Object.keys(HEROES)) out.heroes[id] = ((p && p.heroes) || {})[id] | 0;
  const rawItems = migrateDeckItems(Object.assign({}, (p && p.items) || {}));
  out.items = {};
  for (const id of ITEM_IDS) out.items[id] = rawItems[id] | 0;
  out.stages = {};
  for (const [k, v] of Object.entries((p && p.stages) || {})) if ((v | 0) > 0 && +k >= 1 && +k <= STAGE_COUNT) out.stages[+k] = Math.min(3, v | 0);
  out.maxStage = maxCleared(out.stages);
  out.totalStars = Object.values(out.stages).reduce((a, b) => a + b, 0);
  out.maxMeta = out.maxMeta || META_MAX;
  out.unlocked = LOCKED_HEROES.filter((h) => heroUnlocked(out, h));
  out.endlessUnlocked = endlessUnlocked(out);
  out.seen = [...new Set(((p && p.seen) || []).filter((t) => typeof t === 'string'))];
  out.gear = ((p && p.gear) || []).filter((it) => it && GEAR[it.t] && GEAR_RARITY[it.r]);
  out.gearSeq = (p && p.gearSeq) | 0;
  out.equip = (p && p.equip) || {};
  out.perfects = (p && p.perfects) || {};
  out.hell = {};
  for (const [k, v] of Object.entries((p && p.hell) || {})) if ((v | 0) > 0 && (out.stages[+k] | 0) >= 3) out.hell[+k] = Math.min(3, v | 0);
  out.deckSlots = deckSlots(out.items);
  out.guest = !!guest;
  L.normLive(p || {}, out); // 모집권 · 조각 · 성급 · 미션 · 시즌 · 주간 기록
  TW.normTower(p || {}, out); // 진상의 탑 (층 · 각성 · 염화석 · 지옥 세트)
  out.master = !guest && !!(p && p.master); // 서버가 정한 값 (손님은 절대 아님)
  out.autoSell = !!(p && p.autoSell);
  out.stones = Math.max(0, (p && p.stones) | 0);
  out.wild = Math.max(0, (p && p.wild) | 0);
  out.cardPick = (p && p.cardPick) || { wi: 0, n: 0 };
  out.testNormal = !!(p && p.testNormal);
  out.owned = out.owned || {};
  out.unlocked = LOCKED_HEROES.filter((h) => heroUnlocked(out, h));
  if (guest) L.ensureLive(out, 'guest', Date.now()); // 로그인은 서버가 이미 맞춰서 준다
  return out;
}

// ─── 손님: 이 기기에 저장 ─────────────────────────────
function readGuest() {
  let raw = {};
  try { raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '{}') || {}; } catch { raw = {}; }
  // 예전 손님 최고 기록 → 무한 도전 기록으로
  try {
    const old = JSON.parse(localStorage.getItem(OLD_GUEST_KEY) || 'null');
    if (old) {
      raw.bestWave = Math.max(raw.bestWave | 0, old.bestWave | 0);
      raw.bestScore = Math.max(raw.bestScore | 0, old.bestScore | 0);
      localStorage.setItem(GUEST_KEY, JSON.stringify(raw));
      localStorage.removeItem(OLD_GUEST_KEY);
    }
  } catch { /* 저장소 막힘 */ }
  return raw;
}
function writeGuest(p) {
  const keep = { coins: p.coins, heroes: p.heroes, items: p.items, stages: p.stages, bestWave: p.bestWave, bestScore: p.bestScore, runs: p.runs | 0, seen: p.seen || [], gear: p.gear || [], gearSeq: p.gearSeq | 0, equip: p.equip || {}, perfects: p.perfects || {}, hell: p.hell || {} };
  for (const k of LIVE_KEYS) if (p[k] !== undefined) keep[k] = p[k];
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(keep)); return true; } catch { return false; }
}
const LIVE_KEYS = ['gachaDay', 'cons', 'consRun', 'consBuy', 'consDex', 'gifts', 'lastSeenAt', 'gearDex', 'sta', 'staBuy', 'staRun', 'endDay', 'endRun', 'endCoins', 'ew', 'ewPrev', 'ewPaid', 'mail', 'mailSeq', 'pvpDay', 'pvpTiers', 'stones', 'wild', 'cardPick', 'autoSell', 'decks', 'chests', 'checkin', 'tickets', 'shards', 'hstars', 'owned', 'pity', 'pulls', 'gpulls', 'cnt', 'daily', 'wm', 'ach', 'season', 'titles', 'frames', 'title', 'frame', 'weekly', 'weeklyPrev', 'weeklyClaimed', 'tower'];
export function guestProfile() { return normalize(readGuest(), true); }
const GUEST_UID = 'guest';
// 손님 기록에 미션 진행 올리기 (서버와 같은 함수)
function guestTrack(q, r) { L.trackRun(q, r, GUEST_UID, Date.now()); }

export async function loadProfile() {
  if (!token()) return { profile: guestProfile(), guest: true };
  const r = await call('/api/langbang/me');
  if (r.ok && r.profile) return { profile: normalize(r.profile, false), guest: false, nickname: r.nickname || '' };
  return { profile: guestProfile(), guest: true, error: r.status === 401 ? null : r.message };
}

// 스테이지 클리어 저장 → { ok, profile, reward, unlockedHeroes, endlessUnlocked, rank, levelUp }
export async function postStage(sum, guest) {
  if (guest) {
    const p = guestProfile();
    if (sum.stage > p.maxStage + 1) return { ok: false, message: '아직 열리지 않은 스테이지예요' };
    const hell = !!sum.hell;
    if (hell && !hellOpen(p.stages, sum.stage)) return { ok: false, message: '헬 모드는 일반 ★★★ 로 깬 스테이지만 열려요' };
    const prev = (hell ? p.hell[sum.stage] : p.stages[sum.stage]) || 0;
    const perfect = !hell && sum.stars === 3 && !!sum.perfect;
    const firstPerfect = perfect && !p.perfects[sum.stage];
    const reward = hell ? hellReward(sum.stage, sum.stars, prev, p.items.coupon) : stageReward(sum.stage, sum.stars, prev, p.items.coupon, perfect, firstPerfect);
    if ((sum.heroesUsed || []).includes('sanghwa') && heroUnlocked(p, 'sanghwa')) { const x = Math.round(reward.total * 0.12); reward.total += x; reward.sanghwa = x; } // 박상화: 코인 +12%
    const q = Object.assign({}, p, { coins: p.coins + reward.total, runs: (p.runs | 0) + 1, seen: [...new Set([...(p.seen || []), ...(sum.seen || [])])] });
    if (hell) q.hell = Object.assign({}, p.hell, { [sum.stage]: Math.max(prev, sum.stars) });
    else q.stages = Object.assign({}, p.stages, { [sum.stage]: Math.max(prev, sum.stars) });
    if (perfect) q.perfects = Object.assign({}, p.perfects, { [sum.stage]: true });
    if (p.staRun && p.staRun.stage === sum.stage) q.staRun = null; else L.staminaAdd(q, -L.stageStaminaCost(p, sum.stage, hell), Date.now()); // 체력 (시작 때 안 냈으면 지금)
    // 손님 장비 드롭 (같은 공식, 시드는 이 기기에서)
    const got = [];
    q.gear = (p.gear || []).slice();
    const cardDrop = rollHeroCard((Math.random() * 4294967296) >>> 0, sum.stars, hell, [...new Set(sum.heroesUsed || [])].filter((h) => HEROES[h] && heroUnlocked(p, h)));
    if (cardDrop) q.shards = Object.assign({}, p.shards, { [cardDrop]: ((p.shards || {})[cardDrop] | 0) + 1 });
    const stonesGot = rollStones((Math.random() * 4294967296) >>> 0, sum.stage, sum.stars, !prev, hell);
    const consGot = L.rollCons((Math.random() * 4294967296) >>> 0, sum.stage, sum.stars, hell, sum.heroesUsed || []);
    if (Object.keys(consGot).length) { q.cons = Object.assign({}, p.cons); q.consDex = (p.consDex || []).slice(); L.consAdd(q, consGot); reward.cons = consGot; }
    q.stones = (p.stones | 0) + stonesGot;
    for (const d of rollDrops((Math.random() * 4294967296) >>> 0, sum.stage, sum.stars, perfect, firstPerfect, hell)) {
      if (q.gear.length >= GEAR_BAG || (q.autoSell && d.r === 'common')) { const v = gearSellValue(d.r, 0); q.coins += v; got.push(Object.assign({ sold: v, auto: !!q.autoSell && d.r === 'common' }, d)); continue; }
      q.gearSeq = (q.gearSeq | 0) + 1;
      const it = { id: q.gearSeq, t: d.t, r: d.r, lv: 0 };
      q.gear.push(it); got.push(it);
    }
    q.cnt = Object.assign({}, p.cnt);
    for (const d of got) if (d.r === 'legend') q.cnt.legends = (q.cnt.legends | 0) + 1;
    guestTrack(q, { mode: 'stage', clear: true, stars: sum.stars, perfect, kills: sum.kills, bosses: Math.min(sum.bossKills | 0, stageBosses(sum.stage).length), skills: L.skillCap(sum.skills, sum.durationSec) });
    writeGuest(q);
    const after = guestProfile();
    return {
      ok: true, profile: after, reward: Object.assign({}, reward, { firstClear: !prev && !hell, stage: sum.stage, stars: sum.stars, isPerfect: perfect, firstPerfect, drops: got, hell, stones: stonesGot, cardDrop }),
      unlockedHeroes: !prev && !hell ? LOCKED_HEROES.filter((h) => HERO_UNLOCK[h] === sum.stage && !heroUnlocked(p, h)) : [],
      endlessUnlocked: !endlessUnlocked(p) && endlessUnlocked(after),
    };
  }
  const r = await call('/api/langbang/result', Object.assign({ mode: 'stage' }, sum));
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function postEndless(sum, guest) {
  if (guest) {
    const p = guestProfile();
    const ef = L.endlessFinish(p, sum.wave, sum.score, endlessReward(sum.wave, p.items.coupon), GUEST_UID, Date.now());
    const coins = ef.coins;
    const q = Object.assign({}, p, { coins: p.coins + coins, bestWave: Math.max(p.bestWave, sum.wave), bestScore: Math.max(p.bestScore, sum.score), runs: (p.runs | 0) + 1, seen: [...new Set([...(p.seen || []), ...(sum.seen || [])])] });
    guestTrack(q, { mode: 'endless', kills: sum.kills, bosses: Math.min(sum.bossKills | 0, Math.floor(sum.wave / 5) + 1), skills: L.skillCap(sum.skills, sum.durationSec) });
    writeGuest(q);
    return { ok: true, profile: guestProfile(), reward: { total: coins }, newBestWave: sum.wave > p.bestWave, newBestScore: sum.score > p.bestScore, endless: ef };
  }
  const r = await call('/api/langbang/result', Object.assign({ mode: 'endless' }, sum));
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}

// 손님 코인 쓰기 (서버와 같은 확인)
function guestSpend(check) {
  const p = guestProfile();
  const r = check(p);
  if (r.error) return { ok: false, message: r.error };
  if (p.coins < r.cost) return { ok: false, message: `코인이 부족해요 (${r.cost.toLocaleString()} 필요)` };
  p.coins -= r.cost;
  r.apply(p);
  writeGuest(p);
  return { ok: true, profile: guestProfile() };
}
export async function upgradeHero(hero, guest) {
  if (guest) {
    return guestSpend((p) => {
      const lv = p.heroes[hero] | 0;
      if (!HEROES[hero]) return { error: '없는 캐릭터예요' };
      if (!heroUnlocked(p, hero)) return { error: '아직 합류하지 않은 멤버예요' };
      if (lv >= metaMaxOf(hero)) return { error: '이미 최대로 강화했어요' };
      const need = heroCardNeed(lv), have = (p.shards || {})[hero] | 0, wild = p.wild | 0;
      if (have + wild < need) return { error: `멤버 카드가 부족해요 (${have}/${need}장 · 모집·스테이지·상점 선택권에서 모아요)` };
      const own = Math.min(have, need);
      return { cost: metaCost(lv), apply: (x) => { x.heroes[hero] = lv + 1; x.shards = Object.assign({}, x.shards, { [hero]: have - own }); x.wild = wild - (need - own); } };
    });
  }
  const r = await call('/api/langbang/upgrade', { hero });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function buyItem(item, guest) {
  if (guest) {
    return guestSpend((p) => {
      const lv = p.items[item] | 0;
      const cost = itemCost(item, lv);
      if (cost === null) return { error: '이미 최대 레벨이에요' };
      const gate = itemGateCh(item, lv, p.maxStage);
      if (gate) return { error: `${gate}장을 깨야 다음 레벨을 살 수 있어요` };
      return { cost, apply: (x) => { x.items[item] = lv + 1; } };
    });
  }
  const r = await call('/api/langbang/buy', { item });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}

// 랭킹: mode 'stage' | 'endless' → { ranking, me } (실패하면 null)
export async function loadRanking(mode = 'stage') {
  const r = await call('/api/langbang/ranking?mode=' + encodeURIComponent(mode));
  return r.ranking ? { ranking: r.ranking, me: r.me || null } : null;
}

// 강화 비용: 서버가 알려 준 값 우선, 없으면 같은 공식
export function costOf(profile, hero) {
  const lv = (profile.heroes && profile.heroes[hero]) || 0;
  const max = metaMaxOf(hero);
  if (lv >= max) return null;
  if (profile.costs && hero in profile.costs) return profile.costs[hero];
  return metaCost(lv);
}
export function itemCostOf(profile, item) {
  const lv = (profile.items && profile.items[item]) || 0;
  if (profile.itemCosts && item in profile.itemCosts) return profile.itemCosts[item];
  return itemCost(item, lv);
}
// 다음 레벨을 사려면 깨야 하는 장 (0 = 지금 살 수 있음) — 마스터는 없음
export function itemGateOf(profile, item) { return profile.master ? 0 : itemGateCh(item, (profile.items && profile.items[item]) || 0, profile.maxStage) || 0; }
export function hasToken() { return !!token(); }

// ─── 장비: 장착 · 강화 · 팔기 ─────────────────────────
function guestGear(fn) {
  const p = guestProfile();
  const r = fn(p);
  if (r.error) return { ok: false, message: r.error };
  if (r.cost && p.coins < r.cost) return { ok: false, message: `코인이 부족해요 (${r.cost.toLocaleString()} 필요)` };
  if (r.cost) p.coins -= r.cost;
  r.apply(p);
  writeGuest(p);
  return Object.assign({ ok: true, profile: guestProfile() }, r.extra || {});
}
export async function equipGear(hero, slot, id, guest) {
  if (guest) {
    return guestGear((p) => {
      if (id === null) return { apply: (x) => { if (x.equip[hero]) delete x.equip[hero][slot]; } };
      const it = p.gear.find((g) => g.id === id);
      if (!it || GEAR[it.t].slot !== slot) return { error: '그 칸에는 못 껴요' };
      return { apply: (x) => { for (const h of Object.keys(x.equip)) for (const k of ['w', 'a', 'm']) if (x.equip[h][k] === id) delete x.equip[h][k]; (x.equip[hero] = x.equip[hero] || {})[slot] = id; } };
    });
  }
  const r = await call('/api/langbang/gear/equip', { hero, slot, id });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function enhanceGear(id, guest) {
  if (guest) {
    return guestGear((p) => {
      const it = p.gear.find((g) => g.id === id);
      if (!it) return { error: '없는 장비예요' };
      const cost = gearEnhanceCost(it.r, it.lv);
      if (cost === null) return { error: '이미 최대 강화예요' };
      const st = gearStoneNeed(it.lv);
      if ((p.stones | 0) < st) return { error: `강화석이 부족해요 (${st}개 필요 · 스테이지·레이드·분해로 모아요)` };
      const chance = gearEnhanceChance(it.lv), ok = Math.random() < chance;
      return { cost, extra: { success: ok, chance, stones: st }, apply: (x) => { x.stones = (x.stones | 0) - st; if (ok) { x.gear.find((g) => g.id === id).lv++; L.bump(x, 'enhances', 1, GUEST_UID, Date.now()); } } };
    });
  }
  const r = await call('/api/langbang/gear/enhance', { id });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function sellGear(id, guest) {
  if (guest) {
    return guestGear((p) => {
      const it = p.gear.find((g) => g.id === id);
      if (!it) return { error: '없는 장비예요' };
      const v = gearSellValue(it.r, it.lv);
      return { apply: (x) => { x.gear = x.gear.filter((g) => g.id !== id); for (const h of Object.keys(x.equip)) for (const k of ['w', 'a', 'm']) if (x.equip[h][k] === id) delete x.equip[h][k]; x.coins += v; }, extra: { sold: v } };
    });
  }
  const r = await call('/api/langbang/gear/sell', { id });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function cardConvert(guest) {
  if (guest) {
    return guestSpend((p) => {
      const list = Object.keys(HEROES).filter((h) => (p.heroes[h] | 0) >= metaMaxOf(h) && ((p.hstars || {})[h] | 0) >= 5 && ((p.shards || {})[h] | 0) > 0);
      if (!list.length) return { error: '바꿀 남는 카드가 없어요 (강화 최대 + ★5 멤버의 카드만)' };
      const n = list.reduce((s0, h) => s0 + (p.shards[h] | 0), 0);
      return { cost: 0, apply: (x) => { x.shards = Object.assign({}, x.shards); for (const h of list) x.shards[h] = 0; x.wild = (x.wild | 0) + n; } };
    });
  }
  const r = await call('/api/langbang/cards/convert', {});
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function cardPick(hero, guest) {
  if (guest) {
    return guestSpend((p) => {
      if (!heroUnlocked(p, hero)) return { error: '합류한 멤버만 고를 수 있어요' };
      const wi = L.weekIndex(Date.now()), n = p.cardPick && p.cardPick.wi === wi ? p.cardPick.n : 0;
      if (n >= CARD_PICK.perWeek) return { error: `이번 주 선택권은 다 샀어요 (주 ${CARD_PICK.perWeek}번)` };
      return { cost: CARD_PICK.cost, apply: (x) => { x.shards = Object.assign({}, x.shards, { [hero]: ((x.shards || {})[hero] | 0) + CARD_PICK.n }); x.cardPick = { wi, n: n + 1 }; } };
    });
  }
  const r = await call('/api/langbang/cards/pick', { hero });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function dismantleGear(ids, guest) {
  if (guest) {
    return guestGear((p) => {
      const eq = new Set(Object.values(p.equip || {}).flatMap((s) => [s.w, s.a]).filter(Boolean));
      const list = p.gear.filter((g) => ids.includes(g.id) && !eq.has(g.id));
      if (!list.length) return { error: '분해할 수 있는 장비가 없어요' };
      const n = list.reduce((a, it) => a + gearDismantle(it.r, it.lv), 0), set = new Set(list.map((g) => g.id));
      return { apply: (x) => { x.gear = x.gear.filter((g) => !set.has(g.id)); x.stones = (x.stones | 0) + n; }, extra: { stones: n, n: list.length } };
    });
  }
  const r = await call('/api/langbang/gear/dismantle', { ids });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function fuseGear(ids, guest) {
  if (guest) {
    return guestGear((p) => {
      if (ids.length !== 3) return { error: '같은 등급 장비 3개를 골라요' };
      const eq = new Set(Object.values(p.equip || {}).flatMap((s) => [s.w, s.a]).filter(Boolean));
      const list = ids.map((id) => p.gear.find((g) => g.id === id));
      if (list.some((it) => !it) || list.some((it) => eq.has(it.id))) return { error: '장착 중이거나 없는 장비가 있어요' };
      if (list.some((it) => it.r !== list[0].r)) return { error: '같은 등급끼리만 합성돼요' };
      const r1 = GEAR_NEXT[list[0].r];
      if (!r1) return { error: '전설은 더 합성할 수 없어요' };
      const same = list.every((it) => it.t === list[0].t);
      const t = same ? list[0].t : GEAR_IDS[(Math.random() * GEAR_IDS.length) | 0];
      const lv = Math.max(0, Math.max(...list.map((it) => it.lv)) - 2);
      const made = { id: (p.gearSeq | 0) + 1, t, r: r1, lv };
      return { cost: GEAR_FUSE_FEE[r1], apply: (x) => { const set = new Set(ids); x.gear = x.gear.filter((g) => !set.has(g.id)); x.gearSeq = made.id; x.gear.push(made); }, extra: { made, fee: GEAR_FUSE_FEE[r1], same } };
    });
  }
  const r = await call('/api/langbang/gear/fuse', { ids });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function sellGearMany(ids, guest) {
  if (guest) {
    return guestGear((p) => {
      const eq = new Set(Object.values(p.equip || {}).flatMap((s) => [s.w, s.a]).filter(Boolean));
      const set = new Set(ids.filter((id) => p.gear.some((g) => g.id === id) && !eq.has(id)));
      if (!set.size) return { error: '팔 수 있는 장비가 없어요' };
      const v = p.gear.filter((g) => set.has(g.id)).reduce((a, it) => a + gearSellValue(it.r, it.lv), 0);
      return { apply: (x) => { x.gear = x.gear.filter((g) => !set.has(g.id)); x.coins += v; }, extra: { sold: v, n: set.size } };
    });
  }
  const r = await call('/api/langbang/gear/sellMany', { ids });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export async function setAutoSell(on, guest) {
  if (guest) return guestGear(() => ({ apply: (x) => { x.autoSell = !!on; }, extra: { autoSell: !!on } }));
  const r = await call('/api/langbang/gear/autoSell', { on: !!on });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
// 덱 멤버들의 장비 능력치 → sim
export function gearFor(profile, ids, mythMul = 1) {
  const out = {};
  for (const id of ids) {
    const sl = (profile.equip || {})[id] || {};
    out[id] = gearStats(['w', 'a', 'm'].map((k) => (profile.gear || []).find((g) => g.id === sl[k])).filter(Boolean), mythMul);
    for (const [k, v] of Object.entries(TW.hellStats(profile, id))) out[id][k] = (out[id][k] || 0) + v; // 진상의 탑 지옥 세트 (모든 모드)
  }
  return out;
}

// ─── 주간 도전 · 미션 · 모집 · 시즌 · 성급 · 치장 ─────────────
// 손님은 같은 공식(live.js)으로 이 기기에만. 로그인은 서버가 계산하고 확인한다
function guestLive(fn) {
  const p = guestProfile();
  const r = fn(p) || {};
  if (r.error) return { ok: false, message: r.error };
  writeGuest(p);
  return Object.assign({ ok: true }, r, { profile: guestProfile() });
}
async function liveCall(path, body) {
  const r = await call('/api/langbang/' + path, body);
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
export function gacha(n, pay, guest) {
  if (guest) return guestLive((p) => L.gachaPull(p, n, pay, GUEST_UID, Date.now(), (Math.random() * 4294967296) >>> 0));
  return liveCall('gacha', { n, pay });
}
export function gearGacha(n, guest) {
  if (guest) return guestLive((p) => L.gearGachaPull(p, n, GUEST_UID, Date.now(), (Math.random() * 4294967296) >>> 0));
  return liveCall('gear-gacha', { n });
}
export function claimMission(kind, id, guest) {
  if (guest) return guestLive((p) => L.claimMission(p, kind, id, GUEST_UID, Date.now()));
  return liveCall('mission/claim', { kind, id });
}
export function claimSeason(tier, guest) {
  if (guest) return guestLive((p) => L.claimSeason(p, tier, GUEST_UID, Date.now()));
  return liveCall('season/claim', { tier });
}
export function starUp(hero, guest) {
  if (guest) return guestLive((p) => L.starUp(p, hero));
  return liveCall('hero/star', { hero });
}
export function setCosmetic(title, frame, guest) {
  if (guest) return guestLive((p) => L.setCosmetic(p, title, frame));
  return liveCall('cosmetic', { title, frame });
}
// 주간 도전 시작: 로그인은 서버가 판 번호를 준다 (손님은 이 기기에서)
export async function weeklyStart(guest) {
  if (guest) {
    const p = guestProfile();
    if ((p.maxStage | 0) < L.WEEKLY_UNLOCK) return { ok: false, message: '주간 도전은 1-5를 깨면 열려요' };
    return { ok: true, runId: 'guest', wi: L.weekIndex() };
  }
  return liveCall('weekly/start', {});
}
export async function postWeekly(sum, runId, guest) {
  if (guest) {
    const p = guestProfile();
    const wi = L.weekIndex();
    const def = L.weeklyDef(wi);
    const chk = L.weeklyCheck(def, { waves: sum.wave, kills: sum.kills, bossKills: sum.bossKills, durationSec: sum.durationSec, victory: sum.victory });
    if (chk) return { ok: false, message: chk };
    const score = L.weeklyScore({ waves: sum.wave, kills: sum.kills, bossKills: sum.bossKills, victory: sum.victory, hpPct: sum.hpPct });
    const coins = L.weeklyCoins(sum.wave);
    const q = Object.assign({}, p, { coins: p.coins + coins, runs: (p.runs | 0) + 1, seen: [...new Set([...(p.seen || []), ...(sum.seen || [])])] });
    const newBest = L.weeklyRecord(q, wi, score, sum.wave, Date.now());
    guestTrack(q, { mode: 'weekly', kills: sum.kills, bosses: Math.min(sum.bossKills | 0, 20), skills: L.skillCap(sum.skills, sum.durationSec) });
    writeGuest(q);
    return { ok: true, profile: guestProfile(), reward: { total: coins }, weekly: { score, best: q.weekly.best, newBest } };
  }
  return liveCall('result', { mode: 'weekly', runId, wave: sum.wave, kills: sum.kills, bossKills: sum.bossKills, skills: sum.skills, durationSec: sum.durationSec, hpPct: sum.hpPct, victory: !!sum.victory, score: sum.score, seen: sum.seen });
}
export async function weeklyBoard() {
  const r = await call('/api/langbang/weekly');
  return r.ok ? r : null;
}
export function weeklyClaim() { return liveCall('weekly/claim', {}); }
export function claimChest(ch, n, guest) {
  if (guest) return guestLive((p) => L.claimChest(p, ch, n, GUEST_UID, Date.now()));
  return liveCall('chest/claim', { ch, n });
}
export function checkin(guest) {
  if (guest) return guestLive((p) => L.claimCheckin(p, GUEST_UID, Date.now()));
  return liveCall('checkin', {});
}
// 덱 저장 (로그인하면 서버에도 — 다른 기기에서도 같은 덱)
export function saveDecksRemote(decks, i, leaders) { return liveCall('decks', { decks, i, leaders }); }
// 마스터(운영자) 테스트 도구 — 서버가 아이디로 확인한다
export function masterAct(action, extra = {}) { return liveCall('master', Object.assign({ action }, extra)); }
// 레이드 · 1:1 대전
export async function raidBoard() { const r = await call('/api/langbang/raid'); return r.ok ? r : null; }
export function raidStart() { return liveCall('raid/start', {}); }
export function raidClaim() { return liveCall('raid/claim', {}); }
export function postRaid(sum, runId, dmg) { return liveCall('result', { mode: 'raid', runId, raidDmg: Math.floor(dmg), wave: sum.wave, kills: sum.kills, bossKills: 0, skills: sum.skills, durationSec: sum.durationSec, seen: sum.seen }); }
export async function playerCard(u) { const r = await call('/api/langbang/player?u=' + encodeURIComponent(u)); return r.ok ? r.player : null; }
export function claimAllMissions(tab, guest) {
  if (guest) return guestLive((p) => { const r = L.claimAllMissions(p, tab, GUEST_UID, Date.now()); return r.n ? r : { error: '받을 보상이 없어요' }; });
  return liveCall('mission/claimAll', { tab });
}
// 체력 · 무한 입장 · 우편함 (손님은 같은 함수로 이 기기에)
export function stageStart(stage, hell, guest) { return guest ? guestLive((p) => L.stageStart(p, stage, hell, false, Date.now())) : liveCall('stage/start', { stage, hell }); }
export function stageFail(stage, guest) { return guest ? guestLive((p) => L.stageFail(p, stage, Date.now())) : liveCall('stage/fail', { stage }); }
export function staminaBuy(guest) { return guest ? guestLive((p) => L.staminaBuy(p, Date.now())) : liveCall('stamina/buy', {}); }
export function endlessStart(guest) { return guest ? guestLive((p) => L.endlessStart(p, false, Date.now())) : liveCall('endless/start', {}); }
export function mailSync(guest) { return guest ? guestLive((p) => { L.giftTake(p, L.WELCOME_GIFT, Date.now()); return { mail: L.mailCount(p, Date.now()) }; }) : liveCall('mail/sync', {}); }
// 전투 소모품: 시작할 때 가져가는 것 빼기 · 끝나면 안 쓴 것 돌려받기 (서버가 개수를 믿음)
export function consStart(ids, guest) { return guest ? guestLive((p) => L.consStart(p, ids, Date.now())) : liveCall('cons/start', { ids }); }
export function consBuy(id, guest) { return guest ? guestLive((p) => L.consBuy(p, id, Date.now())) : liveCall('cons/buy', { id }); }
export function consEnd(used, guest) { return guest ? guestLive((p) => L.consEnd(p, used)) : liveCall('cons/end', { used }); }
export function mailClaim(id, guest) { return guest ? guestLive((p) => L.mailClaim(p, id, GUEST_UID, Date.now())) : liveCall('mail/claim', { id }); }
export async function pvpRanking() { const r = await call('/api/langbang/pvp/ranking'); return r.ok ? r : null; }
export function authToken() { return token(); }
// 미션 시드용 사용자 번호 (서버와 같은 값 — 토큰 앞부분)
export function liveUid() { const t = token(); return t ? String(t).split('.')[0] : GUEST_UID; }
// ─── 진상의 탑 (손님은 같은 함수로 이 기기에 · 로그인은 서버가 계산하고 확인) ───
export function towerStart(f, hero, guest) { return guest ? guestLive((p) => TW.towerStart(p, f, hero, 'g' + Date.now().toString(36), Date.now())) : liveCall('tower/start', { f, hero }); }
export function towerFinish(body, guest) { return guest ? guestLive((p) => TW.towerFinish(p, body, GUEST_UID, Date.now())) : liveCall('tower/finish', body); }
export async function towerBoard() { const r = await call('/api/langbang/tower'); return r.ok ? r : null; }
export function towerClaim() { return liveCall('tower/claim', {}); }
export function towerShop(id, guest) { return guest ? guestLive((p) => TW.shopBuy(p, id, Date.now())) : liveCall('tower/shop', { id }); }
export function towerHellUp(id, guest) { return guest ? guestLive((p) => TW.hellUp(p, id)) : liveCall('tower/hell/up', { id }); }
export function towerHellEquip(id, hero, guest) { return guest ? guestLive((p) => TW.hellEquip(p, id, hero)) : liveCall('tower/hell/equip', { id, hero }); }
export function towerPickGear(type, guest) { return guest ? guestLive((p) => TW.pickLegendGear(p, type)) : liveCall('tower/pick/gear', { type }); }
export function towerPickHero(hero, guest) { return guest ? guestLive((p) => TW.pickLegendHero(p, hero)) : liveCall('tower/pick/hero', { hero }); }
