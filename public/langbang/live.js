// 랑방 대전 — 오래 즐기는 장치: 주간 도전 · 미션/업적 · 모집(뽑기) · 무료 시즌 · 멤버 성급
// 순수 함수만 (DOM 없음). 서버(server/accounts.js)가 이 파일을 그대로 불러 쓰고, 손님은 같은 함수로 이 기기에 저장한다.
// → 공식이 한 곳에만 있어서 서버와 화면이 어긋날 일이 없다.
// 모든 코인은 게임 안 점수일 뿐 (현금 결제 없음).
import {
  HEROES, ENEMIES, MAP_FX, GACHA_HEROES, LEGEND_HEROES, LOCKED_HEROES, HERO_UNLOCK,
  GEAR_IDS, GEAR_RARITIES, GEAR_BAG, gearSellValue, seedRng, hashSeed, stageWave, stageBosses, STAGE_COUNT,
} from './data.js';
export const stageBossN = (s) => stageBosses(s).length;

const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

// ─── 시간 (한국 시간 기준) ─────────────────────────────
// 주: 월요일 00:00 (KST) 시작. 0주 = 2026-09-28(월) 주
export const KST = 9 * 3600e3;
export const DAY = 86400e3;
export const WEEK = 7 * DAY;
export const EPOCH = Date.UTC(2026, 8, 28); // KST 로 옮긴 시각 기준 2026-09-28 00:00
export const weekIndex = (now = Date.now()) => Math.floor((now + KST - EPOCH) / WEEK);
export const dayIndex = (now = Date.now()) => Math.floor((now + KST - EPOCH) / DAY);
export const weekStartMs = (wi) => EPOCH + wi * WEEK - KST; // 진짜(UTC) 시각
export const msToWeekEnd = (now = Date.now()) => weekStartMs(weekIndex(now) + 1) - now;
export const msToDayEnd = (now = Date.now()) => EPOCH + (dayIndex(now) + 1) * DAY - KST - now;
export function weekLabel(wi) {
  const a = new Date(EPOCH + wi * WEEK), b = new Date(EPOCH + wi * WEEK + 6 * DAY);
  return `${a.getUTCMonth() + 1}/${a.getUTCDate()} ~ ${b.getUTCMonth() + 1}/${b.getUTCDate()}`;
}
export function leftText(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mm}분` : `${mm}분`;
}

// ─── 멤버 소유 · 성급 ─────────────────────────────────
export function heroUnlocked(lb, id) {
  if (!HEROES[id]) return false;
  if (lb.master) return true; // 마스터(운영자) 테스트 계정: 전부 (서버가 정한다)
  if (!LOCKED_HEROES.includes(id)) return true;
  if (lb.owned && lb.owned[id]) return true;
  if (!HERO_UNLOCK[id]) return false; // 모집 멤버는 모집으로만
  return ((lb.stages || {})[HERO_UNLOCK[id]] | 0) > 0 || ((lb.heroes || {})[id] | 0) > 0;
}
export const STAR_MAX = 5;
export const STAR_SHARDS = [0, 20, 40, 70, 110]; // ★n → ★n+1 에 드는 조각
export const STAR_COINS = [0, 500, 1500, 3000, 6000];
export const STAR_ATK = 0.07; // ★ 하나마다 공격력 +7% (★1 = 기본)
export const heroStar = (lb, id) => Math.max(1, Math.min(STAR_MAX, ((lb.hstars || {})[id]) | 0 || 1));
export const starBonus = (star) => STAR_ATK * (Math.max(1, star) - 1);
export function starUp(lb, id) {
  if (!heroUnlocked(lb, id)) return { error: '아직 합류하지 않은 멤버예요' };
  const s = heroStar(lb, id);
  if (s >= STAR_MAX) return { error: '이미 ★5 예요' };
  const need = STAR_SHARDS[s], coins = STAR_COINS[s];
  if (((lb.shards || {})[id] | 0) < need) return { error: `조각이 부족해요 (${need}개 필요)` };
  if ((lb.coins | 0) < coins) return { error: `코인이 부족해요 (${coins.toLocaleString()} 필요)` };
  lb.shards[id] -= need;
  lb.coins -= coins;
  lb.hstars[id] = s + 1;
  return { star: s + 1 };
}

// ─── 치장: 칭호 · 프레임 ───────────────────────────────
export const FRAMES = { neon: { id: 'neon', name: '네온 프레임', color: '#6ff0ff' }, gold: { id: 'gold', name: '황금 프레임', color: '#ffcf3f' }, crown: { id: 'crown', name: '챔피언 왕관', color: '#ff6fd8' } };
export function titleName(id) {
  let m = /^s(\d{1,3})_t10$/.exec(id);
  if (m) return `시즌${m[1]} 단골`;
  m = /^s(\d{1,3})_t30$/.exec(id);
  if (m) return `시즌${m[1]} 랑방 레전드`;
  return { wchamp: '주간 챔피언', wtop3: '주간 TOP 3', gacha100: '모집왕', perfect30: '무결점 문지기', raid1: '레이드 MVP' }[id] || '';
}
const titleOk = (id) => typeof id === 'string' && id.length < 16 && !!titleName(id);

// ─── 주간 도전전 ──────────────────────────────────────
export const WEEKLY_UNLOCK = 5; // 1-5 를 깨면 열림
export const WEEKLY_WAVES = 10;
export const WEEKLY_MODS = {
  bossrush: { id: 'bossrush', icon: '👑', name: '보스 러시', desc: '웨이브마다 보스가 나온다! 졸개는 조금', count: 0.6 },
  double: { id: 'double', icon: '👥', name: '진상 2배', desc: '진상이 두 배로 몰려온다 (한 명 한 명은 조금 약함)', count: 2, hp: 0.6 },
  speed: { id: 'speed', icon: '💨', name: '광속 진상', desc: '진상 이동 속도 +35%', enemySpd: 1.35 },
  glass: { id: 'glass', icon: '🥚', name: '유리 입구', desc: '입구 내구도 절반 · 대신 경험치 +50%', baseHp: 0.5, exp: 0.5 },
  giant: { id: 'giant', icon: '🦍', name: '거인의 밤', desc: '진상 수 절반 · 체력 2.2배', count: 0.5, hp: 2.2 },
  skill: { id: 'skill', icon: '✨', name: '스킬 축제', desc: '스킬 쿨타임 절반 · 진상 체력 +30%', cd: 0.5, hp: 1.3 },
};
const WEEKLY_FX = ['none', 'rain', 'fog', 'blackout', 'happy', 'karaoke', 'icy', 'feast', 'construction', 'megaphone'];
const WEEKLY_BOSSES = ['boss_loan', 'boss_thug', 'queen', 'boss_gapjil', 'boss_inpi'];
// 이번 주 도전: 주 번호만으로 정해진다 (모두 같은 판)
export function weeklyDef(wi) {
  const rng = seedRng(hashSeed('lbweekly:' + wi));
  const ids = Object.keys(WEEKLY_MODS);
  const mod = WEEKLY_MODS[ids[((wi % ids.length) + ids.length) % ids.length]];
  const stage = 11 + Math.floor(rng() * 17); // 적 구성 바탕: 2-1 ~ 3-7
  const fx = WEEKLY_FX[(rng() * WEEKLY_FX.length) | 0];
  const bossA = WEEKLY_BOSSES[(rng() * WEEKLY_BOSSES.length) | 0];
  const bossB = WEEKLY_BOSSES[(rng() * WEEKLY_BOSSES.length) | 0];
  const waves = [];
  for (let w = 1; w <= WEEKLY_WAVES; w++) {
    const b = stageWave(stage, 1 + ((w - 1) % 4));
    const cm = mod.count || 1;
    const g = b.g.map(([t, c, every, delay]) => [t, Math.max(1, Math.round(c * cm * (1 + 0.06 * (w - 1)))), +(every / Math.max(0.5, cm)).toFixed(2), delay]);
    const def = { g, level: 5 + 2.5 * (w - 1), hpScale: 2.1 * (mod.hp || 1) };
    if (mod.id === 'bossrush') def.boss = WEEKLY_BOSSES[(w + (rng() * 5 | 0)) % WEEKLY_BOSSES.length];
    else if (w === 5) def.boss = bossA;
    else if (w === 10) { def.boss = bossA; def.boss2 = bossB; }
    waves.push(def);
  }
  return { wi, stage, mod: mod.id, fx, waves, bosses: [...new Set(waves.flatMap((d) => [d.boss, d.boss2].filter(Boolean)))] };
}
// 서버가 계산하는 점수 (웨이브 · 처치 · 보스 · 클리어 + 남은 입구)
export function weeklyScore(r) {
  return int(r.waves, 0, WEEKLY_WAVES) * 1000 + int(r.kills, 0, 1e5) * 10 + int(r.bossKills, 0, 99) * 500 + (r.victory ? 5000 + int(r.hpPct, 0, 100) * 50 : 0);
}
// 말이 되는 기록인지 (주간 판 구성으로 상한 계산)
export function weeklyCheck(def, r) {
  const waves = int(r.waves, 0, 99), kills = int(r.kills, 0, 1e6), boss = int(r.bossKills, 0, 999), dur = int(r.durationSec, 0, 1e6);
  if (waves > WEEKLY_WAVES) return '웨이브 수가 이상해요';
  if (r.victory && waves !== WEEKLY_WAVES) return '기록을 확인할 수 없어요';
  const upto = Math.min(WEEKLY_WAVES, waves + 1);
  let maxKill = 0, maxBoss = 0;
  for (let i = 0; i < upto; i++) {
    const d = def.waves[i];
    for (const [t, c] of d.g) maxKill += c * (ENEMIES[t] && ENEMIES[t].pack ? ENEMIES[t].pack.max : 1) * 1.6;
    maxKill += 60; // 소환 · 분열 · 알림 여유
    maxBoss += (d.boss ? 1 : 0) + (d.boss2 ? 1 : 0);
  }
  if (kills > maxKill || boss > maxBoss) return '기록을 확인할 수 없어요';
  if (dur < waves * 8) return '기록을 확인할 수 없어요';
  return null;
}
// 지난주 순위 보상
export function weeklyRankReward(rank) {
  if (!rank) return null;
  if (rank === 1) return { coins: 5000, tickets: 5, gear: 'epic', title: 'wchamp', frame: 'crown', label: '🥇 1위' };
  if (rank <= 3) return { coins: 3000, tickets: 3, title: 'wtop3', label: `🏅 ${rank}위` };
  if (rank <= 10) return { coins: 1500, tickets: 2, label: `${rank}위 (TOP 10)` };
  return { coins: 600, tickets: 1, label: `${rank}위 (참가 보상)` };
}
export const weeklyCoins = (waves) => 30 * int(waves, 0, WEEKLY_WAVES);
// 주간 기록 넣기 (새 주면 지난 기록을 weeklyPrev 로)
export function weeklyRecord(lb, wi, score, waves, now) {
  if (!lb.weekly || lb.weekly.wi !== wi) {
    if (lb.weekly && lb.weekly.wi === wi - 1) lb.weeklyPrev = lb.weekly;
    lb.weekly = { wi, best: 0, runs: 0, waves: 0, at: 0 };
  }
  const w = lb.weekly;
  w.runs++;
  const better = score > w.best;
  if (better) { w.best = score; w.waves = waves; w.at = now; }
  return better;
}
// 지난주(wi) 내 기록
export function weeklyEntry(lb, wi) {
  if (lb.weekly && lb.weekly.wi === wi) return lb.weekly;
  if (lb.weeklyPrev && lb.weeklyPrev.wi === wi) return lb.weeklyPrev;
  return null;
}

// ─── 미션 · 업적 ──────────────────────────────────────
// 진행 키: clears(스테이지 클리어) skills bosses kills perfects star3 weeklies endless pulls enhances dailyDone
export const CNT_KEYS = ['clears', 'skills', 'bosses', 'kills', 'perfects', 'star3', 'weeklies', 'endless', 'pulls', 'enhances', 'dailyDone', 'legends'];
export const DAILY_POOL = [
  { id: 'clear3', icon: '🗺️', name: '스테이지 3판 클리어', key: 'clears', n: 3, coins: 150, sp: 25 },
  { id: 'skill15', icon: '✨', name: '스킬 15번 쓰기', key: 'skills', n: 15, coins: 120, sp: 20 },
  { id: 'boss1', icon: '👑', name: '보스 1명 잡기', key: 'bosses', n: 1, coins: 150, sp: 25 },
  { id: 'weekly1', icon: '📅', name: '주간 도전 1판', key: 'weeklies', n: 1, coins: 150, sp: 25, need: WEEKLY_UNLOCK },
  { id: 'perfect1', icon: '💎', name: 'PERFECT 클리어 1번', key: 'perfects', n: 1, coins: 200, sp: 30 },
  { id: 'kills300', icon: '🥊', name: '진상 300명 처치', key: 'kills', n: 300, coins: 120, sp: 20 },
  { id: 'star3x2', icon: '⭐', name: '★★★ 클리어 2번', key: 'star3', n: 2, coins: 150, sp: 25 },
  { id: 'endless1', icon: '♾️', name: '무한 도전 1판', key: 'endless', n: 1, coins: 120, sp: 20, need: 10 },
  { id: 'gacha1', icon: '🎰', name: '모집 1번', key: 'pulls', n: 1, coins: 100, sp: 20 },
  { id: 'enhance1', icon: '🔧', name: '장비 강화 1번', key: 'enhances', n: 1, coins: 100, sp: 20 },
];
export const DAILY_N = 4;
export const DAILY_ALL = { id: 'all', icon: '🎁', name: '오늘 미션 전부 완료', tickets: 1, sp: 30 };
export const WEEKLY_MISSIONS = [
  { id: 'w_clear20', icon: '🗺️', name: '스테이지 20판 클리어', key: 'clears', n: 20, coins: 800, tickets: 2, sp: 80 },
  { id: 'w_weekly3', icon: '📅', name: '주간 도전 3판', key: 'weeklies', n: 3, coins: 600, tickets: 1, sp: 60 },
  { id: 'w_boss10', icon: '👑', name: '보스 10명 잡기', key: 'bosses', n: 10, coins: 700, tickets: 1, sp: 60 },
  { id: 'w_daily12', icon: '✅', name: '일일 미션 12개 완료', key: 'dailyDone', n: 12, coins: 800, tickets: 2, sp: 80 },
  { id: 'w_perfect5', icon: '💎', name: 'PERFECT 5번', key: 'perfects', n: 5, coins: 700, tickets: 1, sp: 60 },
];
const ownedCount = (lb) => Object.keys(HEROES).filter((h) => heroUnlocked(lb, h)).length;
export const ACHIEVEMENTS = [
  { id: 'dex10', icon: '📚', name: '도감 진상 10종', n: 10, v: (lb) => (lb.seen || []).length, coins: 500, tickets: 1 },
  { id: 'dex20', icon: '📚', name: '도감 진상 20종', n: 20, v: (lb) => (lb.seen || []).length, coins: 1200, tickets: 2 },
  { id: 'hero8', icon: '👥', name: '멤버 8명 모으기', n: 8, v: ownedCount, coins: 800, tickets: 1 },
  { id: 'hero12', icon: '👥', name: '멤버 12명 모으기', n: 12, v: ownedCount, coins: 1500, tickets: 3 },
  { id: 'hero16', icon: '👑', name: '멤버 16명 전부', n: 16, v: ownedCount, coins: 5000, tickets: 5 },
  { id: 'ch1', icon: '🏁', name: '1장 클리어', n: 10, v: (lb) => lb.maxStage | 0, coins: 500, tickets: 1 },
  { id: 'ch2', icon: '🏁', name: '2장 클리어', n: 20, v: (lb) => lb.maxStage | 0, coins: 1200, tickets: 2 },
  { id: 'ch3', icon: '🏆', name: '3장 클리어', n: 30, v: (lb) => lb.maxStage | 0, coins: 3000, tickets: 3 },
  { id: 'ch4', icon: '✈️', name: '4장 클리어', n: 40, v: (lb) => lb.maxStage | 0, coins: 4000, tickets: 3 },
  { id: 'ch5', icon: '🏕️', name: '5장 클리어', n: 50, v: (lb) => lb.maxStage | 0, coins: 6000, tickets: 4 },
  { id: 'ch6', icon: '👑', name: '6장 클리어 (마지막!)', n: 60, v: (lb) => lb.maxStage | 0, coins: 10000, tickets: 6 },
  { id: 'stars180', icon: '🌟', name: '별 180개 전부', n: 180, v: (lb) => lb.totalStars | 0, coins: 8000, tickets: 5 },
  { id: 'perfect10', icon: '💎', name: 'PERFECT 스테이지 10개', n: 10, v: (lb) => Object.keys(lb.perfects || {}).length, coins: 1500, tickets: 2 },
  { id: 'perfect30', icon: '💎', name: 'PERFECT 스테이지 30개', n: 30, v: (lb) => Object.keys(lb.perfects || {}).length, coins: 4000, tickets: 4, title: 'perfect30' },
  { id: 'legend1', icon: '🌟', name: '전설 장비 얻기', n: 1, v: (lb) => (lb.cnt || {}).legends | 0, coins: 1000, tickets: 1 },
  { id: 'endless30', icon: '♾️', name: '무한 도전 W30', n: 30, v: (lb) => lb.bestWave | 0, coins: 2000, tickets: 2 },
  { id: 'stars90', icon: '⭐', name: '별 90개', n: 90, v: (lb) => lb.totalStars | 0, coins: 3000, tickets: 3 },
  { id: 'pull100', icon: '🎰', name: '모집 100번', n: 100, v: (lb) => lb.pulls | 0, coins: 2000, tickets: 3, title: 'gacha100' },
  { id: 'star5', icon: '🌠', name: '★5 멤버 만들기', n: 5, v: (lb) => Math.max(1, ...Object.values(lb.hstars || {})), coins: 3000, tickets: 3 },
];
// 하루 미션 고르기: (사용자 · 날짜) 로 정해진다
export function pickDaily(uid, day, maxStage) {
  const rng = seedRng(hashSeed(`lbdaily:${uid}:${day}`));
  const pool = DAILY_POOL.filter((m) => !m.need || (maxStage | 0) >= m.need);
  const out = [];
  while (out.length < DAILY_N && pool.length) out.push(pool.splice((rng() * pool.length) | 0, 1)[0].id);
  return out;
}
// 날짜 · 주가 바뀌었으면 미션 새로
export function ensureLive(lb, uid, now = Date.now()) {
  const day = dayIndex(now), wi = weekIndex(now);
  if (!lb.daily || lb.daily.day !== day) lb.daily = { day, ids: pickDaily(uid, day, lb.maxStage), p: {}, done: [] };
  if (!lb.wm || lb.wm.wi !== wi) lb.wm = { wi, p: {}, done: [] };
  const sid = seasonOf(wi);
  if (!lb.season || lb.season.id !== sid) lb.season = { id: sid, sp: 0, claimed: [] };
  return lb;
}
// 진행 올리기 (하루 · 주 · 평생)
export function bump(lb, key, v, uid, now) {
  v = int(v, 0, 1e6);
  if (!v) return;
  ensureLive(lb, uid, now);
  lb.daily.p[key] = (lb.daily.p[key] | 0) + v;
  lb.wm.p[key] = (lb.wm.p[key] | 0) + v;
  lb.cnt[key] = (lb.cnt[key] | 0) + v;
}
// 한 판 결과 → 미션 진행 (서버는 이미 확인·상한을 건 값을 넣는다)
export function trackRun(lb, r, uid, now) {
  if (r.mode === 'stage' && r.clear) {
    bump(lb, 'clears', 1, uid, now);
    if (r.stars >= 3) bump(lb, 'star3', 1, uid, now);
    if (r.perfect) bump(lb, 'perfects', 1, uid, now);
  }
  if (r.mode === 'weekly') bump(lb, 'weeklies', 1, uid, now);
  if (r.mode === 'endless') bump(lb, 'endless', 1, uid, now);
  bump(lb, 'skills', r.skills, uid, now);
  bump(lb, 'bosses', r.bosses, uid, now);
  bump(lb, 'kills', r.kills, uid, now);
}
// 서버가 믿는 스킬 수 상한 (3초에 한 번 + 조금)
export const skillCap = (skills, dur) => Math.min(int(skills, 0, 999), Math.floor(int(dur, 0, 1e6) / 3) + 5, 200);

// 보상 주기: coins · tickets · sp(시즌 포인트) · gear(등급) · title · frame
export function grant(lb, rw, uid, now) {
  const got = {};
  if (rw.coins) { lb.coins = (lb.coins | 0) + rw.coins; got.coins = rw.coins; }
  if (rw.tickets) { lb.tickets = (lb.tickets | 0) + rw.tickets; got.tickets = rw.tickets; }
  if (rw.sp) { ensureLive(lb, uid, now); lb.season.sp += rw.sp; got.sp = rw.sp; }
  if (rw.gear) got.gear = addGear(lb, GEAR_IDS[hashSeed(`rw:${lb.gearSeq}:${rw.gear}:${uid}`) % GEAR_IDS.length], rw.gear);
  if (rw.title && !lb.titles.includes(rw.title)) { lb.titles.push(rw.title); got.title = rw.title; }
  if (rw.frame && !lb.frames.includes(rw.frame)) { lb.frames.push(rw.frame); got.frame = rw.frame; }
  return got;
}
function addGear(lb, t, r) {
  if (r === 'legend') lb.cnt.legends = (lb.cnt.legends | 0) + 1;
  if (lb.gear.length >= GEAR_BAG) { const v = gearSellValue(r, 0); lb.coins += v; return { t, r, sold: v }; }
  const it = { id: ++lb.gearSeq, t, r, lv: 0 };
  lb.gear.push(it);
  return it;
}
// 미션 목록 (화면용)
export function missionView(lb, uid, now = Date.now()) {
  const x = ensureLive(lb, uid, now);
  const daily = x.daily.ids.map((id) => DAILY_POOL.find((m) => m.id === id)).filter(Boolean).map((m) => ({ ...m, kind: 'daily', have: Math.min(m.n, x.daily.p[m.key] | 0), done: x.daily.done.includes(m.id) }));
  const allOk = daily.length > 0 && daily.every((m) => m.done);
  const all = { ...DAILY_ALL, kind: 'daily', n: daily.length, have: daily.filter((m) => m.done).length, done: x.daily.done.includes('all'), ready: allOk };
  const weekly = WEEKLY_MISSIONS.map((m) => ({ ...m, kind: 'weekly', have: Math.min(m.n, x.wm.p[m.key] | 0), done: x.wm.done.includes(m.id) }));
  const ach = ACHIEVEMENTS.map((m) => ({ ...m, kind: 'ach', have: Math.min(m.n, m.v(x) | 0), done: (x.ach || []).includes(m.id) }));
  return { daily, all, weekly, ach, dayLeft: msToDayEnd(now), weekLeft: msToWeekEnd(now) };
}
export function claimable(lb, uid, now) {
  const v = missionView(lb, uid, now);
  return [...v.daily, ...v.weekly, ...v.ach].filter((m) => !m.done && m.have >= m.n).length + (v.all.ready && !v.all.done ? 1 : 0);
}
export function claimMission(lb, kind, id, uid, now = Date.now()) {
  ensureLive(lb, uid, now);
  if (kind === 'daily') {
    if (id === 'all') {
      const ok = lb.daily.ids.length && lb.daily.ids.every((m) => lb.daily.done.includes(m));
      if (!ok) return { error: '오늘 미션을 먼저 다 끝내 주세요' };
      if (lb.daily.done.includes('all')) return { error: '이미 받았어요' };
      lb.daily.done.push('all');
      return { got: grant(lb, DAILY_ALL, uid, now) };
    }
    const m = DAILY_POOL.find((x) => x.id === id);
    if (!m || !lb.daily.ids.includes(id)) return { error: '없는 미션이에요' };
    if (lb.daily.done.includes(id)) return { error: '이미 받았어요' };
    if ((lb.daily.p[m.key] | 0) < m.n) return { error: '아직 다 못 했어요' };
    lb.daily.done.push(id);
    lb.wm.p.dailyDone = (lb.wm.p.dailyDone | 0) + 1;
    lb.cnt.dailyDone = (lb.cnt.dailyDone | 0) + 1;
    return { got: grant(lb, m, uid, now) };
  }
  if (kind === 'weekly') {
    const m = WEEKLY_MISSIONS.find((x) => x.id === id);
    if (!m) return { error: '없는 미션이에요' };
    if (lb.wm.done.includes(id)) return { error: '이미 받았어요' };
    if ((lb.wm.p[m.key] | 0) < m.n) return { error: '아직 다 못 했어요' };
    lb.wm.done.push(id);
    return { got: grant(lb, m, uid, now) };
  }
  if (kind === 'ach') {
    const m = ACHIEVEMENTS.find((x) => x.id === id);
    if (!m) return { error: '없는 업적이에요' };
    if (lb.ach.includes(id)) return { error: '이미 받았어요' };
    if ((m.v(lb) | 0) < m.n) return { error: '아직 다 못 했어요' };
    lb.ach.push(id);
    return { got: grant(lb, m, uid, now) };
  }
  return { error: '잘못된 요청이에요' };
}

// ─── 무료 시즌 (4주 · 30단계) ─────────────────────────
export const SEASON_WEEKS = 4;
export const SEASON_TIERS = 30;
export const SP_PER_TIER = 100;
export const seasonOf = (wi) => Math.floor(wi / SEASON_WEEKS) + 1;
export const seasonEndMs = (sid) => weekStartMs(sid * SEASON_WEEKS);
export function seasonReward(sid, t) {
  if (t === 30) return { title: `s${sid}_t30`, frame: 'gold', tickets: 5, label: '🏆 칭호 "레전드" + 황금 프레임 + 모집권 5' };
  if (t === 20) return { frame: 'neon', tickets: 3, label: '🖼️ 네온 프레임 + 모집권 3' };
  if (t === 10) return { title: `s${sid}_t10`, tickets: 2, label: '🏷️ 칭호 "단골" + 모집권 2' };
  if (t === 25) return { gear: 'legend', label: '🌟 전설 장비' };
  if (t === 15) return { gear: 'epic', label: '💜 영웅 장비' };
  if (t === 5) return { gear: 'rare', label: '💙 희귀 장비' };
  if (t % 3 === 0) return { tickets: t >= 21 ? 2 : 1, label: `🎟️ 모집권 ${t >= 21 ? 2 : 1}` };
  const c = 300 + 30 * t;
  return { coins: c, label: `${c.toLocaleString()} 코인` };
}
export const seasonTier = (lb) => Math.min(SEASON_TIERS, Math.floor(((lb.season && lb.season.sp) | 0) / SP_PER_TIER));
export function claimSeason(lb, tier, uid, now = Date.now()) {
  ensureLive(lb, uid, now);
  const list = tier === 'all' ? Array.from({ length: seasonTier(lb) }, (_, i) => i + 1).filter((t) => !lb.season.claimed.includes(t)) : [int(tier, 0, 99)];
  if (!list.length) return { error: '받을 보상이 없어요' };
  const got = [];
  for (const t of list) {
    if (t < 1 || t > SEASON_TIERS) return { error: '없는 단계예요' };
    if (t > seasonTier(lb)) return { error: '아직 그 단계가 아니에요' };
    if (lb.season.claimed.includes(t)) return { error: '이미 받았어요' };
    lb.season.claimed.push(t);
    got.push({ tier: t, ...grant(lb, seasonReward(lb.season.id, t), uid, now) });
  }
  return { got };
}
export function setCosmetic(lb, title, frame) {
  if (title !== undefined) { if (title && !lb.titles.includes(title)) return { error: '없는 칭호예요' }; lb.title = title || ''; }
  if (frame !== undefined) { if (frame && !lb.frames.includes(frame)) return { error: '없는 프레임이에요' }; lb.frame = frame || ''; }
  return {};
}

// ─── 모집 (뽑기) — 코인/모집권만, 현금 결제 없음 ───────────
export const GACHA_COST = { one: 300, ten: 2700 };
export const HOCHAN_GATE = STAGE_COUNT; // TODO(6장 추가 시): 6-10 (60) 으로 옮기기
export const PITY_HERO = 50, PITY_LEGEND = 200;
// 모집 멤버는 "카드"를 모아서 합류: 영웅 10장 · LEGEND(이호찬) 30장. 합류한 뒤 카드는 ★승급 조각으로
export const UNLOCK_CARDS = { epic: 10, legend: 30 };
export const CARD_BUNDLE = { epicHero: 4, legendHero: 15, epicCard: 1, legendCard: 1 };
export const cardsNeed = (h) => (LEGEND_HEROES.includes(h) ? UNLOCK_CARDS.legend : UNLOCK_CARDS.epic);
export const GACHA_RATES = [ // 확률 공개 (%)
  { k: 'legendHero', w: 0.3, name: '전설 카드 묶음 ×15 (이호찬)', color: '#ffcf3f' },
  { k: 'legendCard', w: 1, name: '전설 카드 ×1 (이호찬)', color: '#ffdf80' },
  { k: 'epicHero', w: 3, name: '영웅 카드 묶음 ×4 (윤준서 · 배현경 · 고아라)', color: '#c77dff' },
  { k: 'epicCard', w: 8, name: '영웅 카드 ×1', color: '#d9a8ff' },
  { k: 'legendGear', w: 1.5, name: '전설 장비', color: '#ffb400' },
  { k: 'epicGear', w: 7.2, name: '영웅 장비', color: '#c77dff' },
  { k: 'rareGear', w: 22, name: '희귀 장비', color: '#4ea8ff' },
  { k: 'shard10', w: 12, name: '멤버 조각 ×10', color: '#ff9f5a' },
  { k: 'shard4', w: 45, name: '멤버 조각 ×4', color: '#9fb3c8' },
];
const EPIC_PLUS = ['legendHero', 'epicHero', 'legendGear', 'epicGear'];
// 합류 전 카드 진행: { 윤준서: [7, 10] … }
export function cardProgress(lb, h) { return lb.owned && lb.owned[h] ? null : [Math.min(cardsNeed(h), (lb.shards || {})[h] | 0), cardsNeed(h)]; }
export const DUP_SHARDS = { epicHero: 30, legendHero: 80 };
export const legendOpen = (lb) => (lb.maxStage | 0) >= HOCHAN_GATE;
function rollKind(rng, lb, only) {
  const open = legendOpen(lb);
  const list = GACHA_RATES.filter((r) => (!only || only.includes(r.k)) && (open || (r.k !== 'legendHero' && r.k !== 'legendCard')));
  const sum = list.reduce((a, r) => a + r.w, 0);
  let x = rng() * sum;
  for (const r of list) { x -= r.w; if (x <= 0) return r.k; }
  return list[list.length - 1].k;
}
// n = 1 | 10. pay = 'ticket' | 'coin'. 서버 시드: (사용자 · 누적 모집 수)
export function gachaPull(lb, n, pay, uid, now = Date.now(), seed) {
  if (n !== 1 && n !== 10) return { error: '잘못된 요청이에요' };
  if (pay === 'ticket') { if ((lb.tickets | 0) < n) return { error: `모집권이 부족해요 (${n}장 필요)` }; }
  else if (pay === 'coin') { const c = n === 10 ? GACHA_COST.ten : GACHA_COST.one; if ((lb.coins | 0) < c) return { error: `코인이 부족해요 (${c.toLocaleString()} 필요)` }; }
  else return { error: '잘못된 요청이에요' };
  if (pay === 'ticket') lb.tickets -= n; else lb.coins -= n === 10 ? GACHA_COST.ten : GACHA_COST.one;
  const rng = seedRng(seed !== undefined ? seed : hashSeed(`lbgacha:${uid}:${lb.pulls}`));
  const out = [];
  let epicPlus = false;
  for (let i = 0; i < n; i++) {
    lb.pity.hero++;
    if (legendOpen(lb)) lb.pity.legend++;
    let k;
    if (legendOpen(lb) && lb.pity.legend >= PITY_LEGEND) k = 'legendHero';
    else if (lb.pity.hero >= PITY_HERO) k = 'epicHero';
    else k = rollKind(rng, lb);
    if (n === 10 && i === 9 && !epicPlus && !EPIC_PLUS.includes(k)) k = rollKind(rng, lb, EPIC_PLUS); // 10연속: 영웅 등급 이상 1개 확정
    if (EPIC_PLUS.includes(k)) epicPlus = true;
    out.push(resolvePull(lb, k, rng));
    lb.pulls++;
  }
  bump(lb, 'pulls', n, uid, now);
  return { results: out };
}
function resolvePull(lb, k, rng) {
  if (k === 'legendHero' || k === 'epicHero' || k === 'legendCard' || k === 'epicCard') {
    if (k === 'legendHero' || k === 'epicHero') lb.pity.hero = 0; // 천장: 영웅 묶음 50번 · 전설 묶음 200번
    if (k === 'legendHero') lb.pity.legend = 0;
    const pool = k === 'legendHero' || k === 'legendCard' ? LEGEND_HEROES : GACHA_HEROES;
    const fresh = pool.filter((h) => !lb.owned[h]);
    const src = fresh.length && rng() < 0.6 ? fresh : pool; // 아직 없는 멤버가 조금 더 잘 나온다
    const h = src[(rng() * src.length) | 0];
    const v = CARD_BUNDLE[k];
    if (lb.owned[h]) { lb.shards[h] = (lb.shards[h] | 0) + v; return { k, hero: h, dup: true, shards: v, card: true }; }
    // 아직 합류 전: 카드를 모아서 다 모이면 합류 (남는 카드는 ★조각으로)
    lb.shards[h] = (lb.shards[h] | 0) + v;
    const need = cardsNeed(h);
    if (lb.shards[h] >= need) { lb.shards[h] -= need; lb.owned[h] = true; return { k, hero: h, card: true, shards: v, new: true, have: need, need }; }
    return { k, hero: h, card: true, shards: v, have: lb.shards[h], need };
  }
  if (k === 'legendGear' || k === 'epicGear' || k === 'rareGear') {
    const r = k === 'legendGear' ? 'legend' : k === 'epicGear' ? 'epic' : 'rare';
    return { k, gear: addGear(lb, GEAR_IDS[(rng() * GEAR_IDS.length) | 0], r) };
  }
  // 조각: 가진 멤버 중 아직 ★5 가 아닌 멤버에게
  const mine = Object.keys(HEROES).filter((h) => heroUnlocked(lb, h));
  const want = mine.filter((h) => heroStar(lb, h) < STAR_MAX);
  const list = want.length ? want : mine;
  const h = list[(rng() * list.length) | 0];
  const v = k === 'shard10' ? 10 : 4;
  lb.shards[h] = (lb.shards[h] | 0) + v;
  return { k, hero: h, shards: v };
}

// ─── 챕터 별 상자 (★10 · ★20 · ★30) ─────────────────
export const CHEST_STARS = [10, 20, 30];
export function chestReward(ch, need) {
  const i = CHEST_STARS.indexOf(need);
  return [{ coins: 400 * ch, tickets: 1 }, { coins: 900 * ch, tickets: 2 }, { coins: 1500 * ch, tickets: 3, gear: ch >= 2 ? 'epic' : 'rare' }][i] || null;
}
export function chapterStars(lb, ch) {
  let n = 0;
  for (let i = 1; i <= 10; i++) n += (lb.stages || {})[(ch - 1) * 10 + i] | 0;
  return n;
}
export function claimChest(lb, ch, need, uid, now = Date.now()) {
  ch = int(ch, 0, 99); need = int(need, 0, 99);
  const rw = chestReward(ch, need);
  if (!rw || ch < 1) return { error: '없는 상자예요' };
  if (chapterStars(lb, ch) < need) return { error: `${ch}장 별 ${need}개가 필요해요` };
  const got = lb.chests[ch] || (lb.chests[ch] = []);
  if (got.includes(need)) return { error: '이미 열었어요' };
  got.push(need);
  return { got: grant(lb, rw, uid, now) };
}
// ─── 출석 (7일 주기) ─────────────────────────────────
export const CHECKIN = [{ coins: 100 }, { coins: 150 }, { coins: 200, tickets: 1 }, { coins: 250 }, { coins: 300 }, { coins: 400 }, { coins: 500, tickets: 2 }];
export function checkinState(lb, now = Date.now()) {
  const day = dayIndex(now), c = lb.checkin || { last: -1e6, streak: 0 };
  const done = c.last === day;
  const streak = done ? c.streak : c.last === day - 1 ? c.streak : 0; // 하루 빠지면 처음부터
  return { done, streak, next: done ? streak % 7 : streak % 7 };
}
export function claimCheckin(lb, uid, now = Date.now()) {
  const st = checkinState(lb, now);
  if (st.done) return { error: '오늘은 이미 출석했어요' };
  const rw = CHECKIN[st.streak % 7];
  lb.checkin = { last: dayIndex(now), streak: st.streak + 1 };
  return { got: grant(lb, rw, uid, now), day: (st.streak % 7) + 1 };
}

// ─── 주말 모임 레이드: 금 18:00 ~ 일 24:00 (KST) · 모두의 피해를 합쳐 거대 보스 하나 ───
export const RAID = { hp: 2500000, tries: 3, sec: 150, bosses: ['boss_soloparty', 'boss_union', 'boss_jusa', 'boss_otaku', 'boss_queenmom', 'boss_kkondol'] };
export const raidOpenMs = (wi) => weekStartMs(wi) + 4 * DAY + 18 * 3600e3;
export const raidEndMs = (wi) => weekStartMs(wi + 1);
export function raidState(now = Date.now()) {
  const wi = weekIndex(now);
  const open = now >= raidOpenMs(wi) && now < raidEndMs(wi);
  return { wi, open, opensAt: raidOpenMs(wi), endsAt: raidEndMs(wi), boss: RAID.bosses[((wi % RAID.bosses.length) + RAID.bosses.length) % RAID.bosses.length], hp: RAID.hp };
}
// 레이드 판: 거대 보스 (체력은 사실상 무한) + 20초마다 졸개. 150초 버티며 보스에게 준 피해가 기록
export function raidDef(wi) {
  const st = raidState(weekStartMs(wi) + 5 * DAY);
  const waves = [];
  for (let w = 1; w <= 8; w++) {
    const b = stageWave(35, 1 + ((w - 1) % 4));
    waves.push({ g: b.g.map(([t, c, e, d]) => [t, Math.max(1, Math.round(c * 0.5)), e, d]), level: 8 + 2 * (w - 1), hpScale: 1.6 });
  }
  waves[0].boss = st.boss;
  return { wi, boss: st.boss, waves, sec: RAID.sec };
}
// 한 판 피해 상한 (시간 × 성장 정도) — 친구끼리 적당히 믿을 만큼
export function raidCap(lb, dur) {
  const meta = Object.values(lb.heroes || {}).reduce((a, b) => a + (b | 0), 0);
  const perSec = (600 + 260 * (lb.maxStage | 0)) * (1 + meta / 80) * (1 + Object.values(lb.hstars || {}).reduce((a, b) => a + Math.max(0, b - 1), 0) * 0.05);
  return Math.round(Math.min(RAID.sec + 15, int(dur, 0, 1e6)) * perSec);
}
export function raidTriesLeft(lb, now = Date.now()) {
  const r = lb.raid;
  const wi = weekIndex(now), day = dayIndex(now);
  if (!r || r.wi !== wi || r.day !== day) return RAID.tries;
  return Math.max(0, RAID.tries - (r.today | 0));
}
export function raidRecord(lb, dmg, now = Date.now()) {
  const wi = weekIndex(now), day = dayIndex(now);
  if (!lb.raid || lb.raid.wi !== wi) lb.raid = { wi, dmg: 0, runs: 0, day, today: 0, best: 0, claimed: false };
  const r = lb.raid;
  if (r.day !== day) { r.day = day; r.today = 0; }
  r.today++; r.runs++; r.dmg += dmg; r.best = Math.max(r.best, dmg);
  return r;
}
// 보상: 잡으면 모두 (기여도 순위 보너스) · 못 잡으면 준 피해 비율만큼
export function raidReward(myDmg, total, rank, killed) {
  if (!myDmg) return null;
  const share = total ? myDmg / total : 0;
  if (killed) {
    const top = rank === 1 ? { tickets: 5, gear: 'legend', title: 'raid1' } : rank <= 3 ? { tickets: 3, gear: 'epic' } : rank <= 10 ? { tickets: 2 } : { tickets: 1 };
    return Object.assign({ coins: 2000 + Math.round(4000 * share), label: `처치 성공! ${rank}위 (기여 ${(share * 100).toFixed(1)}%)` }, top);
  }
  const pct = Math.min(1, total / RAID.hp);
  return { coins: Math.round(600 + 2400 * pct * Math.min(1, share * 5)), tickets: pct >= 0.5 ? 1 : 0, label: `보스 체력 ${(pct * 100).toFixed(0)}% 깎음 (기여 ${(share * 100).toFixed(1)}%)` };
}

// ─── 1:1 대전 웨이브: 두 사람이 같은 시드로 같은 진상을 받는다 (끝없이 · 150초부터 서든데스) ───
export const PVP = { sudden: 150, sendSmall: 10, sendBig: 30 };
export function pvpWave(seed, n) {
  const rng = seedRng(hashSeed('lbpvp:' + seed + ':' + n));
  const stage = 12 + (seed % 17);
  const b = stageWave(stage, 1 + ((n - 1) % 4));
  const k = 1 + 0.12 * (n - 1);
  const def = { g: b.g.map(([t, c, e, d]) => [t, Math.max(1, Math.round(c * k)), e, d + rng() * 0.3]), level: 4 + 1.9 * (n - 1), hpScale: 1.6 };
  if (n % 5 === 0) def.boss = ['boss_loan', 'boss_thug', 'boss_gapjil', 'queen'][((n / 5) | 0) % 4];
  return def;
}

// ─── 덱 넣기/빼기 (순수 함수 — 화면 · 테스트가 같이 쓴다) ───
// deck: 자리 배열(null = 빈 자리), max: 넣을 수 있는 인원, order: 채우는 자리 순서, replace: 이 자리의 멤버와 바꾸기
export function deckToggle(deck, id, max, order, replace) {
  const d = deck.slice();
  const at = d.indexOf(id);
  if (at >= 0) { d[at] = null; return { deck: d, action: 'removed', slot: at }; }
  if (replace !== undefined && replace !== null && replace >= 0 && replace < d.length) { d[replace] = id; return { deck: d, action: 'added', slot: replace }; }
  if (d.filter(Boolean).length >= max) return { deck: d, action: 'full' };
  const slot = order.find((k) => k < d.length && !d[k]);
  if (slot === undefined) return { deck: d, action: 'full' };
  d[slot] = id;
  return { deck: d, action: 'added', slot };
}
// 서버에 저장하는 덱 (프리셋 3개 × 자리 6개)
export function cleanDecks(raw) {
  if (!raw || !Array.isArray(raw.decks)) return null;
  const decks = [0, 1, 2].map((k) => {
    const d = Array.isArray(raw.decks[k]) ? raw.decks[k].slice(0, 6) : [];
    const seen = new Set();
    return Array.from({ length: 6 }, (_, i) => { const id = d[i]; return typeof id === 'string' && HEROES[id] && !seen.has(id) && seen.add(id) ? id : null; });
  });
  return { i: Math.max(0, Math.min(2, raw.i | 0)), decks };
}

// ─── 프로필 정리 (서버 normLb · 손님 normalize 가 같이 쓴다) ─────
export function normLive(raw, out) {
  raw = raw || {};
  const heroIds = Object.keys(HEROES);
  out.tickets = int(raw.tickets, 0, 1e6);
  out.shards = {}; out.hstars = {}; out.owned = {};
  for (const h of heroIds) {
    const v = int((raw.shards || {})[h], 0, 1e6); if (v) out.shards[h] = v;
    const st = int((raw.hstars || {})[h], 1, STAR_MAX); if (st > 1) out.hstars[h] = st;
  }
  for (const h of [...GACHA_HEROES, ...LEGEND_HEROES]) if ((raw.owned || {})[h]) out.owned[h] = true;
  out.pity = { hero: int((raw.pity || {}).hero, 0, PITY_HERO), legend: int((raw.pity || {}).legend, 0, PITY_LEGEND) };
  out.pulls = int(raw.pulls, 0, 1e7);
  out.cnt = {};
  for (const k of CNT_KEYS) { const v = int((raw.cnt || {})[k], 0, 1e9); if (v) out.cnt[k] = v; }
  const cleanP = (p) => { const o = {}; for (const k of CNT_KEYS) { const v = int((p || {})[k], 0, 1e7); if (v) o[k] = v; } return o; };
  const d = raw.daily;
  out.daily = d && Number.isInteger(d.day) ? {
    day: d.day, ids: [...new Set((d.ids || []).filter((id) => DAILY_POOL.some((m) => m.id === id)))].slice(0, DAILY_N), p: cleanP(d.p),
    done: [...new Set((d.done || []).filter((id) => id === 'all' || DAILY_POOL.some((m) => m.id === id)))],
  } : null;
  const w = raw.wm;
  out.wm = w && Number.isInteger(w.wi) ? { wi: w.wi, p: cleanP(w.p), done: [...new Set((w.done || []).filter((id) => WEEKLY_MISSIONS.some((m) => m.id === id)))] } : null;
  out.ach = [...new Set((raw.ach || []).filter((id) => ACHIEVEMENTS.some((m) => m.id === id)))];
  const s = raw.season;
  out.season = s && Number.isInteger(s.id) ? { id: s.id, sp: int(s.sp, 0, 1e7), claimed: [...new Set((s.claimed || []).map((t) => int(t, 0, 99)).filter((t) => t >= 1 && t <= SEASON_TIERS))] } : null;
  out.titles = [...new Set((raw.titles || []).filter(titleOk))].slice(0, 60);
  out.frames = [...new Set((raw.frames || []).filter((f) => FRAMES[f]))];
  out.title = out.titles.includes(raw.title) ? raw.title : '';
  out.frame = out.frames.includes(raw.frame) ? raw.frame : '';
  const wk = (x) => (x && Number.isInteger(x.wi) ? { wi: x.wi, best: int(x.best, 0, 1e9), runs: int(x.runs, 0, 1e6), waves: int(x.waves, 0, WEEKLY_WAVES), at: int(x.at, 0, 9e15) } : null);
  out.weekly = wk(raw.weekly);
  out.weeklyPrev = wk(raw.weeklyPrev);
  out.weeklyRun = raw.weeklyRun && typeof raw.weeklyRun.id === 'string' && raw.weeklyRun.id.length <= 32 && Number.isInteger(raw.weeklyRun.wi) ? { id: raw.weeklyRun.id, wi: raw.weeklyRun.wi, at: int(raw.weeklyRun.at, 0, 9e15) } : null;
  out.weeklyClaimed = Number.isInteger(raw.weeklyClaimed) ? raw.weeklyClaimed : -1e6;
  out.chests = {};
  for (const [k, v] of Object.entries(raw.chests || {})) { const ch = int(k, 0, 99); if (ch >= 1 && Array.isArray(v)) { const l = [...new Set(v.map((x) => int(x, 0, 99)).filter((x) => CHEST_STARS.includes(x)))]; if (l.length) out.chests[ch] = l; } }
  out.decks = cleanDecks(raw.decks);
  const rd = raw.raid;
  out.raid = rd && Number.isInteger(rd.wi) ? { wi: rd.wi, dmg: int(rd.dmg, 0, 1e12), runs: int(rd.runs, 0, 1e4), day: int(rd.day, -1e6, 1e6), today: int(rd.today, 0, 99), best: int(rd.best, 0, 1e12), claimed: !!rd.claimed } : null;
  out.raidRun = raw.raidRun && typeof raw.raidRun.id === 'string' && raw.raidRun.id.length <= 32 ? { id: raw.raidRun.id, wi: int(raw.raidRun.wi, -1e6, 1e6), at: int(raw.raidRun.at, 0, 9e15) } : null;
  const pv = raw.pvp;
  out.pvp = pv ? { rating: int(pv.rating, 0, 5000) || 1000, games: int(pv.games, 0, 1e6), wins: int(pv.wins, 0, 1e6), last: int(pv.last, 0, 9e15) } : { rating: 1000, games: 0, wins: 0, last: 0 };
  const ci = raw.checkin;
  out.checkin = ci && Number.isInteger(ci.last) ? { last: ci.last, streak: int(ci.streak, 0, 1e5) } : null;
  return out;
}
export const MAPFX = MAP_FX; // (화면 표시용)
