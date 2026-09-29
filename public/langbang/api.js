// 랑방 대전 — 서버 API 클라이언트 + 손님(로그인 안 함) 진행 저장
// 로그인: 코인 보상·강화·아이템은 전부 서버가 계산하고 확인한다 (/api/langbang/*)
// 손님: 같은 공식(data.js)으로 이 기기 localStorage 에만 저장 (랭킹에는 안 올라감)
import {
  HEROES, LOCKED_HEROES, HERO_UNLOCK, ENDLESS_UNLOCK, ITEM_IDS, STAGE_COUNT, META_MAX,
  metaCost, itemCost, stageReward, endlessReward, deckSlots, migrateDeckItems, hellReward, hellOpen, metaMaxOf,
  GEAR, GEAR_RARITY, GEAR_MAX_LV, GEAR_BAG, gearEnhanceCost, gearSellValue, rollDrops, gearStats, stageBosses,
} from './data.js';
import * as L from './live.js';

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
  out.master = !guest && !!(p && p.master); // 서버가 정한 값 (손님은 절대 아님)
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
const LIVE_KEYS = ['decks', 'chests', 'checkin', 'tickets', 'shards', 'hstars', 'owned', 'pity', 'pulls', 'cnt', 'daily', 'wm', 'ach', 'season', 'titles', 'frames', 'title', 'frame', 'weekly', 'weeklyPrev', 'weeklyClaimed'];
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
    const q = Object.assign({}, p, { coins: p.coins + reward.total, runs: (p.runs | 0) + 1, seen: [...new Set([...(p.seen || []), ...(sum.seen || [])])] });
    if (hell) q.hell = Object.assign({}, p.hell, { [sum.stage]: Math.max(prev, sum.stars) });
    else q.stages = Object.assign({}, p.stages, { [sum.stage]: Math.max(prev, sum.stars) });
    if (perfect) q.perfects = Object.assign({}, p.perfects, { [sum.stage]: true });
    // 손님 장비 드롭 (같은 공식, 시드는 이 기기에서)
    const got = [];
    q.gear = (p.gear || []).slice();
    for (const d of rollDrops((Math.random() * 4294967296) >>> 0, sum.stage, sum.stars, perfect, firstPerfect, hell)) {
      if (q.gear.length >= GEAR_BAG) { const v = gearSellValue(d.r, 0); q.coins += v; got.push(Object.assign({ sold: v }, d)); continue; }
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
      ok: true, profile: after, reward: Object.assign({}, reward, { firstClear: !prev && !hell, stage: sum.stage, stars: sum.stars, isPerfect: perfect, firstPerfect, drops: got, hell }),
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
    const coins = endlessReward(sum.wave, p.items.coupon);
    const q = Object.assign({}, p, { coins: p.coins + coins, bestWave: Math.max(p.bestWave, sum.wave), bestScore: Math.max(p.bestScore, sum.score), runs: (p.runs | 0) + 1, seen: [...new Set([...(p.seen || []), ...(sum.seen || [])])] });
    guestTrack(q, { mode: 'endless', kills: sum.kills, bosses: Math.min(sum.bossKills | 0, Math.floor(sum.wave / 5) + 1), skills: L.skillCap(sum.skills, sum.durationSec) });
    writeGuest(q);
    return { ok: true, profile: guestProfile(), reward: { total: coins }, newBestWave: sum.wave > p.bestWave, newBestScore: sum.score > p.bestScore };
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
      return { cost: metaCost(lv), apply: (x) => { x.heroes[hero] = lv + 1; } };
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
      return { apply: (x) => { for (const h of Object.keys(x.equip)) for (const k of ['w', 'a']) if (x.equip[h][k] === id) delete x.equip[h][k]; (x.equip[hero] = x.equip[hero] || {})[slot] = id; } };
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
      return { cost, apply: (x) => { x.gear.find((g) => g.id === id).lv++; L.bump(x, 'enhances', 1, GUEST_UID, Date.now()); } };
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
      return { apply: (x) => { x.gear = x.gear.filter((g) => g.id !== id); for (const h of Object.keys(x.equip)) for (const k of ['w', 'a']) if (x.equip[h][k] === id) delete x.equip[h][k]; x.coins += v; }, extra: { sold: v } };
    });
  }
  const r = await call('/api/langbang/gear/sell', { id });
  if (r.ok && r.profile) r.profile = normalize(r.profile, false);
  return r;
}
// 덱 멤버들의 장비 능력치 → sim
export function gearFor(profile, ids) {
  const out = {};
  for (const id of ids) {
    const sl = (profile.equip || {})[id] || {};
    out[id] = gearStats(['w', 'a'].map((k) => (profile.gear || []).find((g) => g.id === sl[k])).filter(Boolean));
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
export function saveDecksRemote(decks, i) { return liveCall('decks', { decks, i }); }
// 마스터(운영자) 테스트 도구 — 서버가 아이디로 확인한다
export function masterAct(action, extra = {}) { return liveCall('master', Object.assign({ action }, extra)); }
// 레이드 · 1:1 대전
export async function raidBoard() { const r = await call('/api/langbang/raid'); return r.ok ? r : null; }
export function raidStart() { return liveCall('raid/start', {}); }
export function raidClaim() { return liveCall('raid/claim', {}); }
export function postRaid(sum, runId, dmg) { return liveCall('result', { mode: 'raid', runId, raidDmg: Math.floor(dmg), wave: sum.wave, kills: sum.kills, bossKills: 0, skills: sum.skills, durationSec: sum.durationSec, seen: sum.seen }); }
export async function pvpRanking() { const r = await call('/api/langbang/pvp/ranking'); return r.ok ? r : null; }
export function authToken() { return token(); }
// 미션 시드용 사용자 번호 (서버와 같은 값 — 토큰 앞부분)
export function liveUid() { const t = token(); return t ? String(t).split('.')[0] : GUEST_UID; }
