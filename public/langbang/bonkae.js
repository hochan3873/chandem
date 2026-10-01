// 랑방 대전 — 본캐 시스템 (공식만 · DOM 없음)
//  본캐: 계정 하나가 멤버 한 명을 "이 멤버가 나야" 하고 차지한다 (멤버마다 한 계정 · 먼저 온 사람 · 30일에 한 번 바꾸기 · 마스터는 아무나 지정/해제)
//  출연료: 다른 사람이 내 본캐를 데리고 판을 깨면 서버가 계산해서 쌓아 둔다 → 반나절마다 우편으로 정산 (또는 출연료 창에서 바로 받기)
//  주간 인기 멤버: 그 주에 몇 명이 데려갔나 (+ 총 출전 수) · 지난주 1위 본캐 주인 = "이번 주 인기 스타" 칭호 + 코인
//  숨은 보석: 덜 쓰이는 아래 1/3 멤버는 출연료 +50%
// 서버(server/langbang-bonkae.js)와 화면(bonkae-ui.js)이 같은 파일을 쓴다. 손님은 본캐도 출연료도 없다.
import { HEROES } from './data.js';
import { dayIndex, weekIndex, weekStartMs, mailAdd, DAY, KST, EPOCH } from './live.js';

const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
const str = (v, n) => String(v == null ? '' : v).slice(0, n);

// 실제 친구가 아닌 기본 멤버(방장 · 운영진 · 건전남 · 건전녀)는 본캐로 못 고른다
export const BK_GENERIC = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
export const BK_HEROES = Object.keys(HEROES).filter((h) => !BK_GENERIC.includes(h));
export const BONKAE = {
  cooldownDays: 30, // 내 본캐 바꾸기: 30일에 한 번
  fee: { stage: 30, hell: 40, tower: 30, raid: 40, pvp: 50, weekly: 30, endless: 20 }, // 한 번 데려갈 때 출연료 (모드별)
  gemMul: 1.5, // 숨은 보석 +50%
  dayCap: 1500, // 본캐 주인 한 명이 하루 받는 출연료 상한
  pairCap: 300, // 같은 사람이 같은 주인에게 하루 줄 수 있는 상한 (둘이 짜고 돌리기 방지)
  newsMax: 20, // 알림 (최근 20개)
  slotH: 12, // 반나절(KST 0시 · 12시)마다 우편 정산
  star: { coins: 3000 }, // 지난주 인기 1위 본캐 주인 보너스
};
export const BK_TITLE = 'popstar'; // "이번 주 인기 스타" (live.js 칭호 목록에 있음)
export const isBkHero = (h) => BK_HEROES.includes(h);
export const slotIndex = (now = Date.now()) => Math.floor((now + KST - EPOCH) / (BONKAE.slotH * 3600e3));
export const cooldownMs = () => BONKAE.cooldownDays * DAY;
// 다음에 내 본캐를 정할 수 있는 시각 (0 = 지금 바로)
export const nextChangeAt = (bk) => (bk && bk.chg ? bk.chg + cooldownMs() : 0);

export function emptyBk() {
  return { hero: null, at: 0, chg: 0, by: '', pend: null, day: null, news: [], seq: 0, seen: 0, starPaid: -1e6, starUntil: 0, tot: 0, totN: 0 };
}
const cleanUse = (x) => {
  if (!x || !Number.isInteger(x.wi)) return null;
  const h = {};
  for (const [k, v] of Object.entries(x.h || {})) if (isBkHero(k)) { const n = int(v, 0, 1e6); if (n) h[k] = n; }
  return { wi: x.wi, h };
};
// 기록 정리 (이상한 값은 버린다) — 서버 normLb 에서 부른다
export function normBonkae(raw, out, now = Date.now()) {
  const b = (raw && raw.bk) || {};
  const o = emptyBk();
  o.hero = isBkHero(b.hero) ? b.hero : null;
  o.at = int(b.at, 0, 9e15); o.chg = int(b.chg, 0, 9e15);
  o.by = b.by === 'master' ? 'master' : '';
  const p = b.pend;
  if (p && Number.isInteger(p.slot)) o.pend = { slot: p.slot, coins: int(p.coins, 0, 1e7), n: int(p.n, 0, 1e6), gem: int(p.gem, 0, 1e6), who: [...new Set((Array.isArray(p.who) ? p.who : []).filter((x) => typeof x === 'string' && x.length <= 40))].slice(0, 60) };
  const d = b.day;
  if (d && Number.isInteger(d.d)) {
    const pairs = {};
    for (const [k, v] of Object.entries(d.pairs || {}).slice(0, 200)) if (k.length <= 40) { const n = int(v, 0, 1e6); if (n) pairs[k] = n; }
    o.day = { d: d.d, coins: int(d.coins, 0, 1e7), n: int(d.n, 0, 1e6), pairs };
  }
  o.news = (Array.isArray(b.news) ? b.news : []).filter((x) => x && Number.isInteger(x.s) && isBkHero(x.hero)).slice(-BONKAE.newsMax)
    .map((x) => ({ s: x.s, nick: str(x.nick, 12), hero: x.hero, act: str(x.act, 24), coins: int(x.coins, 0, 1e5), gem: !!x.gem, at: int(x.at, 0, 9e15) }));
  o.seq = Math.max(int(b.seq, 0, 1e9), ...o.news.map((x) => x.s), 0);
  o.seen = Math.min(o.seq, int(b.seen, 0, 1e9));
  o.starPaid = Number.isInteger(b.starPaid) ? b.starPaid : -1e6;
  o.starUntil = int(b.starUntil, 0, 9e15);
  o.tot = int(b.tot, 0, 1e10); o.totN = int(b.totN, 0, 1e9);
  out.bk = o;
  // 이번 주 / 지난주 내가 데려간 멤버 수 (주간 인기 멤버 집계용)
  let cur = cleanUse(raw && raw.bku), prev = cleanUse(raw && raw.bkuPrev);
  const wi = weekIndex(now);
  if (cur && cur.wi !== wi) { if (cur.wi === wi - 1) prev = cur; cur = null; }
  if (prev && prev.wi !== wi - 1) prev = null;
  out.bku = cur; out.bkuPrev = prev;
  // "이번 주 인기 스타" 칭호: 받은 주 동안만
  if (Array.isArray(out.titles) && out.titles.includes(BK_TITLE) && !(o.starUntil > now)) { out.titles = out.titles.filter((x) => x !== BK_TITLE); if (out.title === BK_TITLE) out.title = ''; }
  return out;
}

// ─── 본캐 정하기 · 바꾸기 · 내려놓기 ───
// ownerOf(hero) → 지금 그 멤버를 가진 계정 아이디 (없으면 null)
export function claimCheck(lb, uid, hero, ownerOf, now = Date.now()) {
  if (!isBkHero(hero)) return '본캐로 고를 수 없는 멤버예요';
  const bk = lb.bk || emptyBk();
  if (bk.hero === hero) return '이미 내 본캐예요';
  const o = ownerOf(hero);
  if (o && o !== uid) return '이미 다른 친구의 본캐예요';
  const next = nextChangeAt(bk);
  if (next > now) return `본캐는 ${BONKAE.cooldownDays}일에 한 번 바꿀 수 있어요 (${Math.max(1, Math.ceil((next - now) / DAY))}일 뒤)`;
  return null;
}
export function claimApply(lb, hero, now = Date.now()) {
  lb.bk = lb.bk || emptyBk();
  lb.bk.hero = hero; lb.bk.at = now; lb.bk.chg = now; lb.bk.by = '';
}
export function release(lb) {
  if (!lb.bk || !lb.bk.hero) return { error: '정해 둔 본캐가 없어요' };
  lb.bk.hero = null; lb.bk.by = ''; // 내려놓아도 30일 시계는 그대로 (내려놓고 바로 다른 멤버를 잡는 것 방지)
  return {};
}
// 마스터 지정: 30일 시계는 건드리지 않는다
export function masterSet(lb, hero, now = Date.now()) {
  lb.bk = lb.bk || emptyBk();
  lb.bk.hero = hero; lb.bk.at = hero ? now : 0; lb.bk.by = hero ? 'master' : '';
}

// ─── 출연료 ───
// 모드 이름 + 판 정보 → 알림 문장 ("○○님이 나를 데리고 4-8을 깼어요!")
export function actText(mode, info = {}) {
  if (mode === 'stage') return `${info.label || '스테이지'}${info.hell ? ' 헬' : ''}${josa(info.label, info.hell)} 깼어요`;
  if (mode === 'tower') return `진상의 탑 ${int(info.f, 0, 999)}층을 깼어요`;
  if (mode === 'raid') return '레이드에서 싸웠어요';
  if (mode === 'pvp') return '1:1 대전에서 이겼어요';
  if (mode === 'weekly') return '주간 도전을 깼어요';
  if (mode === 'endless') return `무한 도전 ${int(info.wave, 0, 999)}웨이브를 버텼어요`;
  return '판을 깼어요';
}
// "4-8을" / "4-10을" / "1-3을" — 숫자 끝 받침 (0136780 → 을, 나머지 → 를) · 헬은 "을"
function josa(label, hell) {
  if (hell) return '을';
  const c = String(label || '').slice(-1);
  return '0136780'.includes(c) && c ? '을' : '를';
}
export const feeBase = (mode, hell) => BONKAE.fee[mode === 'stage' && hell ? 'hell' : mode] || 0;
export const feeOf = (mode, hell, gem) => Math.round(feeBase(mode, hell) * (gem ? BONKAE.gemMul : 1));
const today = (bk, now) => { const d = dayIndex(now); if (!bk.day || bk.day.d !== d) bk.day = { d, coins: 0, n: 0, pairs: {} }; return bk.day; };
export const dayLeft = (bk, now = Date.now()) => BONKAE.dayCap - (bk && bk.day && bk.day.d === dayIndex(now) ? bk.day.coins : 0);
// 본캐 주인(olb)에게 출연료 쌓기 → 실제로 쌓인 코인 (상한에 걸리면 0)
export function feeCredit(olb, fromId, fromNick, hero, mode, act, gem, hell, now = Date.now()) {
  const bk = olb.bk = olb.bk || emptyBk();
  const d = today(bk, now);
  const want = feeOf(mode, hell, gem);
  const coins = Math.max(0, Math.min(want, BONKAE.dayCap - d.coins, BONKAE.pairCap - (d.pairs[fromId] | 0)));
  d.n++;
  if (!bk.pend) bk.pend = { slot: slotIndex(now), coins: 0, n: 0, gem: 0, who: [] };
  bk.pend.n++;
  bk.totN++;
  if (!bk.pend.who.includes(fromId)) bk.pend.who = [...bk.pend.who, fromId].slice(-60);
  if (coins > 0) {
    d.coins += coins; d.pairs[fromId] = (d.pairs[fromId] | 0) + coins;
    bk.pend.coins += coins;
    if (gem) bk.pend.gem += Math.max(0, coins - feeOf(mode, hell, false)); // 그중 숨은 보석으로 더 받은 몫
    bk.seq = (bk.seq | 0) + 1;
    bk.news = [...(bk.news || []), { s: bk.seq, nick: str(fromNick || '친구', 12), hero, act: str(act, 24), coins, gem: !!gem, at: now }].slice(-BONKAE.newsMax);
  }
  return coins;
}
// 쌓인 출연료 정산: 반나절이 지났으면 우편으로 (force = 출연료 창에서 바로 받기 → 코인으로 곧장)
export function feeDeliver(lb, now = Date.now(), force = false) {
  const bk = lb.bk;
  const p = bk && bk.pend;
  if (!p) return null;
  if (!force && slotIndex(now) <= p.slot) return null;
  bk.pend = null;
  if (!p.coins) return { coins: 0, n: p.n, mail: false };
  bk.tot = (bk.tot | 0) + p.coins;
  const name = (HEROES[bk.hero] || {}).name || '내 캐릭터';
  const sameDay = dayIndex(EPOCH + p.slot * BONKAE.slotH * 3600e3 - KST) === dayIndex(now);
  const text = `${sameDay ? '오늘 ' : ''}내 캐릭터가 ${p.n}번 출연했어요 (+${p.coins})${p.gem ? ` · 숨은 보석 +${p.gem}` : ''}`;
  if (force) { lb.coins = (lb.coins | 0) + p.coins; return { coins: p.coins, n: p.n, gem: p.gem, people: p.who.length, mail: false, text }; }
  mailAdd(lb, { title: `출연료 정산 · ${name}`, text, from: '랑방', rw: { coins: p.coins } }, now);
  return { coins: p.coins, n: p.n, gem: p.gem, people: p.who.length, mail: true, text };
}
export const newsUnseen = (lb) => ((lb && lb.bk && lb.bk.news) || []).filter((x) => x.s > (lb.bk.seen | 0));
export const pendCoins = (lb) => ((lb && lb.bk && lb.bk.pend && lb.bk.pend.coins) | 0);

// ─── 주간 인기 멤버 ───
// 이번 주(또는 그 주) 데려간 멤버 표시: 한 판에 한 번씩 · 본캐 주인 자신은 안 센다 (서버가 걸러서 부른다)
export function useMark(lb, heroes, now = Date.now()) {
  const wi = weekIndex(now);
  if (!lb.bku || lb.bku.wi !== wi) { if (lb.bku && lb.bku.wi === wi - 1) lb.bkuPrev = lb.bku; lb.bku = { wi, h: {} }; }
  for (const h of heroes) if (isBkHero(h)) lb.bku.h[h] = (lb.bku.h[h] | 0) + 1;
}
// 그 주 기록 (raw 저장본 그대로 · 순위 집계용)
export function useOf(raw, wi) {
  const c = raw && raw.bku, p = raw && raw.bkuPrev;
  const e = c && c.wi === wi ? c : p && p.wi === wi ? p : null;
  return e && e.h && typeof e.h === 'object' ? e.h : null;
}
// 사람들 기록 → 멤버 순위 [{ hero, players, uses }] (몇 명이 데려갔나 → 총 출전 수 → 멤버 순서)
export function popRank(raws, wi) {
  const m = new Map(BK_HEROES.map((h) => [h, { hero: h, players: 0, uses: 0 }]));
  for (const raw of raws) {
    const h = useOf(raw, wi);
    if (!h) continue;
    for (const [k, v] of Object.entries(h)) { const r = m.get(k); const n = int(v, 0, 1e6); if (r && n) { r.players++; r.uses += n; } }
  }
  const order = (h) => BK_HEROES.indexOf(h);
  return [...m.values()].sort((a, b) => b.players - a.players || b.uses - a.uses || order(a.hero) - order(b.hero)).map((r, i) => ({ ...r, rank: i + 1 }));
}
// 숨은 보석: 순위 아래 1/3 (경계와 같은 기록인 멤버도 같이) · 아무도 안 쓴 주는 없음
export function gemSet(rank) {
  if (!rank.length || !rank.some((r) => r.players > 0)) return new Set();
  const cut = rank[rank.length - Math.floor(rank.length / 3)];
  if (!cut) return new Set();
  return new Set(rank.filter((r) => r.players < cut.players || (r.players === cut.players && r.uses <= cut.uses)).map((r) => r.hero));
}
// 지난주 1위 (아무도 안 썼으면 없음)
export const starOf = (prevRank) => (prevRank[0] && prevRank[0].players > 0 ? prevRank[0] : null);
// 인기 스타 보너스 (지난주 1위 멤버의 지금 본캐 주인 · 한 주에 한 번) → 우편
export function starPay(lb, prevWi, hero, now = Date.now()) {
  lb.bk = lb.bk || emptyBk();
  if (lb.bk.starPaid === prevWi) return false;
  lb.bk.starPaid = prevWi;
  lb.bk.starUntil = weekStartMs(prevWi + 2); // 이번 주 끝까지
  const name = (HEROES[hero] || {}).name || '내 본캐';
  mailAdd(lb, { title: '이번 주 인기 스타!', text: `지난주 가장 많은 친구가 ${name}을(를) 데려갔어요 · 칭호는 이번 주 동안`, from: '랑방', rw: { coins: BONKAE.star.coins, title: BK_TITLE } }, now);
  return true;
}
