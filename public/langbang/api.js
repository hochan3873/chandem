// 랑방 대전 — 서버 API 클라이언트 (메타 진행: 계정 레벨·코인·영구 강화·랭킹)
import { HEROES, metaCost, META_MAX } from './data.js';

function token() {
  try { return JSON.parse(localStorage.getItem('chandem:auth')); } catch { return null; }
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

// 손님/오류 때 쓰는 기본 프로필 (영구 강화 전부 0)
export function guestProfile() {
  const heroes = {};
  for (const id of Object.keys(HEROES)) heroes[id] = 0;
  let best = { bestWave: 0, bestScore: 0 };
  try { best = Object.assign(best, JSON.parse(localStorage.getItem('langbang:guestBest') || '{}')); } catch { /* 무시 */ }
  return { level: 1, exp: 0, expToNext: 0, coins: 0, bestWave: best.bestWave, bestScore: best.bestScore, heroes, guest: true };
}
export function saveGuestBest(wave, score) {
  try {
    const p = guestProfile();
    localStorage.setItem('langbang:guestBest', JSON.stringify({ bestWave: Math.max(p.bestWave, wave), bestScore: Math.max(p.bestScore, score) }));
  } catch { /* 무시 */ }
}

function normalize(p) {
  const out = Object.assign({ level: 1, exp: 0, coins: 0, bestWave: 0, bestScore: 0 }, p || {});
  out.heroes = Object.assign({}, guestProfile().heroes, (p && p.heroes) || {});
  out.guest = false;
  return out;
}

export async function loadProfile() {
  if (!token()) return { profile: guestProfile(), guest: true };
  const r = await call('/api/langbang/me');
  if (r.ok && r.profile) return { profile: normalize(r.profile), guest: false, nickname: r.nickname || '' };
  return { profile: guestProfile(), guest: true, error: r.status === 401 ? null : r.message };
}

export async function upgradeHero(hero) {
  const r = await call('/api/langbang/upgrade', { hero });
  if (r.ok && r.profile) r.profile = normalize(r.profile);
  return r;
}

export async function loadRanking() {
  const r = await call('/api/langbang/ranking');
  return r.ranking ? r.ranking : null;
}

export async function postResult(summary) {
  const r = await call('/api/langbang/result', summary);
  if (r.ok && r.profile) r.profile = normalize(r.profile);
  return r;
}

// 강화 비용: 서버가 알려 준 값 우선, 없으면 예상치
export function costOf(profile, hero) {
  const lv = (profile.heroes && profile.heroes[hero]) || 0;
  const max = profile.maxMeta || META_MAX;
  if (lv >= max) return null;
  if (profile.costs && hero in profile.costs) return profile.costs[hero];
  return metaCost(lv);
}
export function hasToken() { return !!token(); }
