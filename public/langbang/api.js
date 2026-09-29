// 랑방 대전 — 서버 API 클라이언트 + 손님(로그인 안 함) 진행 저장
// 로그인: 코인 보상·강화·아이템은 전부 서버가 계산하고 확인한다 (/api/langbang/*)
// 손님: 같은 공식(data.js)으로 이 기기 localStorage 에만 저장 (랭킹에는 안 올라감)
import {
  HEROES, LOCKED_HEROES, HERO_UNLOCK, ENDLESS_UNLOCK, ITEM_IDS, STAGE_COUNT, META_MAX,
  metaCost, itemCost, stageReward, endlessReward,
} from './data.js';

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
export function heroUnlocked(p, hero) {
  if (!LOCKED_HEROES.includes(hero)) return true;
  return ((p.stages || {})[HERO_UNLOCK[hero]] | 0) > 0 || ((p.heroes || {})[hero] | 0) > 0;
}
export function endlessUnlocked(p) { return maxCleared(p.stages) >= ENDLESS_UNLOCK || (p.bestWave | 0) > 0; }

// 서버/손님 프로필을 같은 모양으로
function normalize(p, guest) {
  const out = Object.assign({ level: 1, exp: 0, expToNext: 0, coins: 0, bestWave: 0, bestScore: 0 }, p || {});
  out.heroes = {};
  for (const id of Object.keys(HEROES)) out.heroes[id] = ((p && p.heroes) || {})[id] | 0;
  out.items = {};
  for (const id of ITEM_IDS) out.items[id] = ((p && p.items) || {})[id] | 0;
  out.stages = {};
  for (const [k, v] of Object.entries((p && p.stages) || {})) if ((v | 0) > 0 && +k >= 1 && +k <= STAGE_COUNT) out.stages[+k] = Math.min(3, v | 0);
  out.maxStage = maxCleared(out.stages);
  out.totalStars = Object.values(out.stages).reduce((a, b) => a + b, 0);
  out.maxMeta = out.maxMeta || META_MAX;
  out.unlocked = LOCKED_HEROES.filter((h) => heroUnlocked(out, h));
  out.endlessUnlocked = endlessUnlocked(out);
  out.guest = !!guest;
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
  const keep = { coins: p.coins, heroes: p.heroes, items: p.items, stages: p.stages, bestWave: p.bestWave, bestScore: p.bestScore, runs: p.runs | 0 };
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(keep)); return true; } catch { return false; }
}
export function guestProfile() { return normalize(readGuest(), true); }

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
    const prev = p.stages[sum.stage] || 0;
    const reward = stageReward(sum.stage, sum.stars, prev, p.items.coupon);
    const q = Object.assign({}, p, { coins: p.coins + reward.total, stages: Object.assign({}, p.stages, { [sum.stage]: Math.max(prev, sum.stars) }), runs: (p.runs | 0) + 1 });
    writeGuest(q);
    const after = guestProfile();
    return {
      ok: true, profile: after, reward: Object.assign({}, reward, { firstClear: !prev, stage: sum.stage, stars: sum.stars }),
      unlockedHeroes: !prev ? LOCKED_HEROES.filter((h) => HERO_UNLOCK[h] === sum.stage && !heroUnlocked(p, h)) : [],
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
    const q = Object.assign({}, p, { coins: p.coins + coins, bestWave: Math.max(p.bestWave, sum.wave), bestScore: Math.max(p.bestScore, sum.score), runs: (p.runs | 0) + 1 });
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
      if (lv >= META_MAX) return { error: '이미 최대로 강화했어요' };
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
  const max = profile.maxMeta || META_MAX;
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
