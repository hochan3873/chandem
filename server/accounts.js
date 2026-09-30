'use strict';
// 계정·전적·오목 티어.
// 저장소: DATABASE_URL 이 있으면 PostgreSQL(Neon 등), 없으면 JSON 파일(로컬·테스트용).
// 로그인 없이도 게임은 그대로 할 수 있고, 로그인한 사람만 전적이 쌓인다.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isMasterName, masterList } = require('./masters');

// ── 오목 티어 (Elo 점수) ───────────────────────────────
const TIERS = [
  { min: 1800, name: '그랜드마스터', icon: 'crown', color: '#ff5d73' },
  { min: 1650, name: '마스터', icon: 'crown', color: '#c77dff' },
  { min: 1500, name: '다이아몬드', icon: 'trophy', color: '#6fd3ff' },
  { min: 1350, name: '플래티넘', icon: 'trophy', color: '#4fe0c1' },
  { min: 1200, name: '골드', icon: 'trophy', color: '#ffd35a' },
  { min: 1050, name: '실버', icon: 'coin', color: '#cfd8e3' },
  { min: 900, name: '브론즈', icon: 'coin', color: '#d59a6a' },
  { min: -Infinity, name: '아이언', icon: 'omok', color: '#9aa1a8' },
];
const START_RATING = 1000;
const AI_RATING = { easy: 800, normal: 1100, hard: 1400 };
function tierOf(rating) { return TIERS.find((t) => rating >= t.min); }
function eloDelta(my, opp, score, games) {
  const k = games < 10 ? 48 : 32;            // 처음 10판은 빨리 자리 잡게
  const expected = 1 / (1 + 10 ** ((opp - my) / 400));
  return Math.round(k * (score - expected));
}

function emptyStats() {
  return {
    holdem: { hands: 0, wins: 0, net: 0, bestPot: 0, bestHand: null },
    seotda: { hands: 0, wins: 0, net: 0, bestPot: 0, bestHand: null },
    omok: { games: 0, wins: 0, losses: 0, draws: 0, rating: START_RATING, peak: START_RATING, streak: 0 },
    tourney: { played: 0, wins: 0 },
    langbang: emptyLangbang(),
  };
}

// ── 랑방 대전 (스테이지 디펜스) ────────────────────────
// 보상·강화 비용·해금 규칙은 langbang-rules.js (화면 쪽 data.js 와 같은 공식, 테스트로 검사)
const LBR = require('./langbang-rules');
// 주간 도전 · 미션 · 모집 · 시즌 공식은 화면과 같은 파일(public/langbang/live.js, ES 모듈)을 그대로 불러 쓴다
let LIVE = null;
const liveReady = import(require('url').pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href)
  .then((m) => { LIVE = m; }).catch((e) => console.error('[langbang] live.js 불러오기 실패:', e.message));
const LB_HEROES = LBR.LB_HEROES;
const LB_MAX_META = LBR.META_MAX;
function emptyLangbang() {
  return {
    level: 1, exp: 0, coins: 0, runs: 0, victories: 0, kills: 0,
    bestWave: 0, bestScore: 0, endlessRuns: 0, // 무한 도전 기록 (예전 20웨이브 시절 기록도 여기로)
    heroes: Object.fromEntries(LB_HEROES.map((h) => [h, 0])),
    items: Object.fromEntries(LBR.ITEM_IDS.map((i) => [i, 0])),
    stages: {}, maxStage: 0, totalStars: 0, stageAt: 0, clears: 0, // 스테이지: { 번호: 최고 별 }
    seen: [], // 도감: 만나 본 진상
    gear: [], gearSeq: 0, equip: {}, perfects: {}, autoSell: false, // 장비 가방 · 장착 { 영웅: { w, a } } · 퍼펙트한 스테이지
    hell: {}, // 헬 모드 별 { 스테이지: 별 }
    lastResultAt: 0,
  };
}
// 옛 프로필(코인·영웅 강화·최고 웨이브만 있던 시절)도 그대로 읽어서 새 구조로 맞춘다
function normLb(raw, master = false) {
  const e = emptyLangbang();
  const lb = { ...e, ...(raw || {}) };
  lb.master = !!master;
  lb.heroes = { ...e.heroes, ...((raw && raw.heroes) || {}) };
  lb.items = LBR.migrateDeckItems({ ...e.items, ...((raw && raw.items) || {}) });
  for (const k of Object.keys(lb.items)) if (!LBR.ITEM_IDS.includes(k)) delete lb.items[k];
  lb.stages = {};
  for (const [k, v] of Object.entries((raw && raw.stages) || {})) {
    const n = Math.floor(Number(k)), st = Math.max(0, Math.min(3, v | 0));
    if (n >= 1 && n <= LBR.STAGE_COUNT && st > 0) lb.stages[n] = st;
  }
  lb.maxStage = LBR.maxCleared(lb.stages);
  lb.seen = [...new Set(((raw && raw.seen) || []).filter((t) => LBR.ENEMY_IDS.includes(t)))];
  // 장비: 이상한 값은 버린다 (종류 · 등급 · 레벨 · 번호)
  const ids = new Set();
  lb.gear = ((raw && raw.gear) || []).filter((it) => it && LBR.GEAR[it.t] && LBR.GEAR_RARITY[it.r] && !LBR.GEAR[it.t].myth === (it.r !== 'myth') && Number.isInteger(it.id) && !ids.has(it.id) && ids.add(it.id))
    .map((it) => ({ id: it.id, t: it.t, r: it.r, lv: Math.max(0, Math.min(LBR.GEAR_MAX_LV, it.lv | 0)) })).slice(0, LBR.GEAR_BAG);
  lb.gearSeq = Math.max(lb.gearSeq | 0, ...lb.gear.map((x) => x.id), 0);
  lb.autoSell = !!(raw && raw.autoSell); // 자동 판매: 일반 등급 드롭은 바로 코인으로
  lb.stones = Math.max(0, Math.min(99999, (raw && raw.stones) | 0)); // 강화석
  lb.wild = Math.max(0, Math.min(99999, (raw && raw.wild) | 0)); // 범용 멤버 카드 (다 키운 멤버의 남는 카드)
  lb.cardPick = raw && raw.cardPick && typeof raw.cardPick === 'object' ? { wi: raw.cardPick.wi | 0, n: raw.cardPick.n | 0 } : { wi: 0, n: 0 };
  lb.testNormal = !!(raw && raw.testNormal); // 마스터: 일반 유저처럼 테스트
  const eq = {};
  const used = new Set();
  for (const [h, sl] of Object.entries((raw && raw.equip) || {})) {
    if (!LBR.LB_HEROES.includes(h) || !sl) continue;
    for (const k of ['w', 'a', 'm']) {
      const it = lb.gear.find((x) => x.id === sl[k]);
      if (it && LBR.GEAR[it.t].slot === k && !used.has(it.id)) { used.add(it.id); (eq[h] = eq[h] || {})[k] = it.id; }
    }
  }
  lb.equip = eq;
  lb.hell = {};
  for (const [k, v] of Object.entries((raw && raw.hell) || {})) { const n = Math.floor(Number(k)), st = Math.max(0, Math.min(3, v | 0)); if (n >= 1 && n <= LBR.STAGE_COUNT && st > 0 && (lb.stages[n] | 0) >= 3) lb.hell[n] = st; }
  lb.perfects = {};
  for (const k of Object.keys((raw && raw.perfects) || {})) if (+k >= 1 && +k <= LBR.STAGE_COUNT) lb.perfects[+k] = true;
  lb.totalStars = Object.values(lb.stages).reduce((a, b) => a + b, 0);
  if (LIVE) LIVE.normLive(raw, lb); // 모집권 · 조각 · 성급 · 미션 · 시즌 · 주간 기록 (이상한 값은 버린다)
  return lb;
}
const lbExpToNext = (level) => 100 + (level - 1) * 60; // 다음 계정 레벨까지 필요한 경험치
const lbUpgradeCost = LBR.metaCost; // 캐릭터 영구 강화 비용(코인)
// 랭킹 정렬: 스테이지 = 최고 스테이지 → 총 별 → 먼저 도달한 사람 / 무한 도전 = 최고 웨이브 → 최고 점수
const lbOf = (u) => normLb(u.stats && u.stats.langbang);
// 마스터가 공짜/무한으로 노는지 (설정 "🧪 일반 유저처럼 테스트"를 켜면 보통 유저처럼 비용을 낸다)
const freeMaster = (u) => isMasterName(u.username) && !((u.stats && u.stats.langbang) || {}).testNormal;
function lbCompare(mode) {
  if (mode === 'endless') return (a, b) => b.bestWave - a.bestWave || b.bestScore - a.bestScore;
  return (a, b) => b.maxStage - a.maxStage || b.totalStars - a.totalStars || (a.stageAt || 0) - (b.stageAt || 0);
}
const lbQualifies = (lb, mode) => (mode === 'endless' ? lb.bestWave > 0 : lb.maxStage > 0);

// ── 비밀번호 · 토큰 ─────────────────────────────────────
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [, s, h] = String(stored).split('$');
  if (!s || !h) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(h, 'base64');
  return want.length === hash.length && crypto.timingSafeEqual(want, hash);
}

// ── 저장소 ──────────────────────────────────────────────
class FileStore {
  constructor(file) {
    this.file = file;
    this.data = { users: {} };
    if (file && fs.existsSync(file)) { try { this.data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {} }
  }
  async init() {}
  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
    fs.renameSync(this.file + '.tmp', this.file);
  }
  async byName(username) { return Object.values(this.data.users).find((u) => u.username === username) || null; }
  async byId(id) { return this.data.users[id] || null; }
  async create(u) {
    if (await this.byName(u.username)) return null;
    this.data.users[u.id] = u; this.save(); return u;
  }
  async saveStats(id, stats) { const u = this.data.users[id]; if (u) { u.stats = stats; this.save(); } }
  async topOmok(n) {
    return Object.values(this.data.users).filter((u) => u.stats.omok.games > 0)
      .sort((a, b) => b.stats.omok.rating - a.stats.omok.rating).slice(0, n);
  }
  // mode: 'stage' | 'endless'
  sortedLangbang(mode) {
    const cmp = lbCompare(mode);
    return Object.values(this.data.users).filter((u) => !isMasterName(u.username)).map((u) => ({ u, lb: lbOf(u) })).filter((x) => lbQualifies(x.lb, mode))
      .sort((a, b) => cmp(a.lb, b.lb)).map((x) => x.u);
  }
  async topLangbang(n, mode = 'stage') { return this.sortedLangbang(mode).slice(0, n); }
  // 주간 도전: 그 주(wi) 최고 점수 (이번 주 기록 또는 지난주로 밀린 기록)
  weeklyList(wi) { return Object.values(this.data.users).filter((u) => !isMasterName(u.username)).map((u) => ({ u, b: weeklyBestOf(u, wi) })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b); }
  async topWeekly(wi, n) { return this.weeklyList(wi).slice(0, n).map((x) => x.u); }
  async rankWeekly(wi, id) {
    const u = this.data.users[id];
    const b = u ? weeklyBestOf(u, wi) : 0;
    if (!b) return null;
    return this.weeklyList(wi).filter((x) => x.b > b).length + 1;
  }
  async countWeekly(wi) { return this.weeklyList(wi).length; }
  endlessWeekList(wi) { return Object.values(this.data.users).filter((u) => !isMasterName(u.username)).map((u) => ({ u, b: ewBestOf(u, wi) })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b); }
  async topEndlessWeek(wi, n) { return this.endlessWeekList(wi).slice(0, n).map((x) => x.u); }
  async rankEndlessWeek(wi, id) { const u = this.data.users[id]; const b = u ? ewBestOf(u, wi) : 0; return b ? this.endlessWeekList(wi).filter((x) => x.b > b).length + 1 : null; }
  // 레이드: 그 주 모두의 피해 합 · 기여도 순위
  raidList(wi) { return Object.values(this.data.users).filter((u) => !isMasterName(u.username)).map((u) => ({ u, d: raidDmgOf(u, wi) })).filter((x) => x.d > 0).sort((a, b) => b.d - a.d); }
  async raidTotal(wi) { return this.raidList(wi).reduce((a, x) => a + x.d, 0); }
  async raidTop(wi, n) { return this.raidList(wi).slice(0, n).map((x) => x.u); }
  async raidRank(wi, id) { const u = this.data.users[id]; const d = u ? raidDmgOf(u, wi) : 0; return d ? this.raidList(wi).filter((x) => x.d > d).length + 1 : null; }
  async raidCount(wi) { return this.raidList(wi).length; }
  // 1:1 대전 순위
  async pvpTop(n) { return Object.values(this.data.users).filter((u) => pvpOf(u).games > 0 && !isMasterName(u.username)).sort((a, b) => pvpOf(b).rating - pvpOf(a).rating).slice(0, n); }
  async rankLangbang(mode, id) {
    const i = this.sortedLangbang(mode).findIndex((u) => u.id === id);
    return i < 0 ? null : i + 1;
  }
}

class PgStore {
  constructor(url) {
    const { Pool } = require('pg');
    this.pool = new Pool({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false }, max: 4 });
  }
  async init() {
    await this.pool.query(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, pass TEXT NOT NULL, nickname TEXT NOT NULL,
      created_at BIGINT NOT NULL, stats JSONB NOT NULL)`);
    // 계정 관리용(정지·토큰 버전·출석·닉네임 변경 시각) — 예전 표에도 칸만 더한다
    await this.pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb`);
  }
  row(r) { return r && { id: r.id, username: r.username, pass: r.pass, nickname: r.nickname, createdAt: Number(r.created_at), stats: r.stats, meta: r.meta || {} }; }
  async byName(username) { return this.row((await this.pool.query('SELECT * FROM users WHERE username=$1', [username])).rows[0]); }
  async byId(id) { return this.row((await this.pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0]); }
  async create(u) {
    const r = await this.pool.query(
      'INSERT INTO users (id, username, pass, nickname, created_at, stats) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (username) DO NOTHING RETURNING *',
      [u.id, u.username, u.pass, u.nickname, u.createdAt, u.stats]);
    return this.row(r.rows[0]);
  }
  async saveStats(id, stats) { await this.pool.query('UPDATE users SET stats=$2 WHERE id=$1', [id, stats]); }
  async topOmok(n) {
    const r = await this.pool.query(`SELECT * FROM users WHERE (stats->'omok'->>'games')::int > 0
      ORDER BY (stats->'omok'->>'rating')::int DESC LIMIT $1`, [n]);
    return r.rows.map((x) => this.row(x));
  }
  // 랑방 기록은 stats(jsonb) 안에 있다: stats->'langbang'->>'maxStage' 등. 예전 프로필은 값이 없어서 COALESCE 로 0 처리
  async topLangbang(n, mode = 'stage') {
    const sql = mode === 'endless'
      ? `SELECT * FROM users WHERE ${PG_LB.bw} > 0 AND NOT (username = ANY($2::text[])) ORDER BY ${PG_LB.bw} DESC, ${PG_LB.bs} DESC LIMIT $1`
      : `SELECT * FROM users WHERE ${PG_LB.ms} > 0 AND NOT (username = ANY($2::text[])) ORDER BY ${PG_LB.ms} DESC, ${PG_LB.ts} DESC, ${PG_LB.sa} ASC LIMIT $1`;
    const r = await this.pool.query(sql, [n, [...masterList()]]);
    return r.rows.map((x) => this.row(x));
  }
  // 내 순위 = 나보다 앞선 사람 수 + 1 (전체를 읽지 않고 COUNT 한 번)
  async rankLangbang(mode, id) {
    const u = await this.byId(id);
    if (!u) return null;
    const lb = lbOf(u);
    if (!lbQualifies(lb, mode)) return null;
    const r = mode === 'endless'
      ? await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE NOT (username = ANY($3::text[])) AND (${PG_LB.bw} > $1 OR (${PG_LB.bw} = $1 AND ${PG_LB.bs} > $2))`, [lb.bestWave, lb.bestScore, [...masterList()]])
      : await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE NOT (username = ANY($4::text[])) AND (${PG_LB.ms} > $1 OR (${PG_LB.ms} = $1 AND ${PG_LB.ts} > $2)
          OR (${PG_LB.ms} = $1 AND ${PG_LB.ts} = $2 AND ${PG_LB.sa} < $3))`, [lb.maxStage, lb.totalStars, lb.stageAt || 0, [...masterList()]]);
    return r.rows[0].n + 1;
  }
  async topWeekly(wi, n) {
    const r = await this.pool.query(`SELECT * FROM users WHERE ${PG_WB} > 0 AND NOT (username = ANY($3::text[])) ORDER BY ${PG_WB} DESC LIMIT $2`, [wi, n, [...masterList()]]);
    return r.rows.map((x) => this.row(x));
  }
  async rankWeekly(wi, id) {
    const u = await this.byId(id);
    const b = u ? weeklyBestOf(u, wi) : 0;
    if (!b) return null;
    const r = await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_WB} > $2 AND NOT (username = ANY($3::text[]))`, [wi, b, [...masterList()]]);
    return r.rows[0].n + 1;
  }
  async countWeekly(wi) { return (await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_WB} > 0 AND NOT (username = ANY($2::text[]))`, [wi, [...masterList()]])).rows[0].n; }
  async raidTotal(wi) { return Number((await this.pool.query(`SELECT COALESCE(SUM(${PG_RD}), 0)::bigint AS n FROM users WHERE ${PG_RD} > 0 AND NOT (username = ANY($2::text[]))`, [wi, [...masterList()]])).rows[0].n); }
  async raidTop(wi, n) { return (await this.pool.query(`SELECT * FROM users WHERE ${PG_RD} > 0 AND NOT (username = ANY($3::text[])) ORDER BY ${PG_RD} DESC LIMIT $2`, [wi, n, [...masterList()]])).rows.map((x) => this.row(x)); }
  async raidRank(wi, id) {
    const u = await this.byId(id); const d = u ? raidDmgOf(u, wi) : 0;
    if (!d) return null;
    return (await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_RD} > $2 AND NOT (username = ANY($3::text[]))`, [wi, d, [...masterList()]])).rows[0].n + 1;
  }
  async topEndlessWeek(wi, n) { return (await this.pool.query(`SELECT * FROM users WHERE ${PG_EW} > 0 AND NOT (username = ANY($3::text[])) ORDER BY ${PG_EW} DESC LIMIT $2`, [wi, n, [...masterList()]])).rows.map((x) => this.row(x)); }
  async rankEndlessWeek(wi, id) {
    const u = await this.byId(id); const b = u ? ewBestOf(u, wi) : 0;
    if (!b) return null;
    return (await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_EW} > $2 AND NOT (username = ANY($3::text[]))`, [wi, b, [...masterList()]])).rows[0].n + 1;
  }
  async raidCount(wi) { return (await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_RD} > 0 AND NOT (username = ANY($2::text[]))`, [wi, [...masterList()]])).rows[0].n; }
  async pvpTop(n) {
    const r = await this.pool.query(`SELECT * FROM users WHERE COALESCE((stats->'langbang'->'pvp'->>'games')::int, 0) > 0 AND NOT (username = ANY($2::text[])) ORDER BY COALESCE((stats->'langbang'->'pvp'->>'rating')::int, 1000) DESC LIMIT $1`, [n, [...masterList()]]);
    return r.rows.map((x) => this.row(x));
  }
}
// 주간 도전 점수 (jsonb): 이번 주(weekly) 또는 지난주로 밀린 기록(weeklyPrev) 중 그 주 것
const PG_WB = `(CASE WHEN (stats->'langbang'->'weekly'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'weekly'->>'best')::bigint, 0)
  WHEN (stats->'langbang'->'weeklyPrev'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'weeklyPrev'->>'best')::bigint, 0) ELSE 0 END)`;
const PG_RD = `(CASE WHEN (stats->'langbang'->'raid'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'raid'->>'dmg')::bigint, 0) ELSE 0 END)`;
const PG_EW = `(CASE WHEN (stats->'langbang'->'ew'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'ew'->>'best')::bigint, 0)
  WHEN (stats->'langbang'->'ewPrev'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'ewPrev'->>'best')::bigint, 0) ELSE 0 END)`;
function ewBestOf(u, wi) { const lb = (u.stats && u.stats.langbang) || {}; const e = lb.ew && lb.ew.wi === wi ? lb.ew : lb.ewPrev && lb.ewPrev.wi === wi ? lb.ewPrev : null; return e ? Math.max(0, Math.floor(Number(e.best) || 0)) : 0; }
function raidDmgOf(u, wi) { const r = ((u.stats && u.stats.langbang) || {}).raid; return r && r.wi === wi ? Math.max(0, Math.floor(Number(r.dmg) || 0)) : 0; }
function pvpOf(u) { const p = ((u.stats && u.stats.langbang) || {}).pvp || {}; return { rating: p.rating | 0 || 1000, games: p.games | 0, wins: p.wins | 0 }; }
function weeklyBestOf(u, wi) {
  const lb = (u.stats && u.stats.langbang) || {};
  const e = lb.weekly && lb.weekly.wi === wi ? lb.weekly : lb.weeklyPrev && lb.weeklyPrev.wi === wi ? lb.weeklyPrev : null;
  return e ? Math.max(0, Math.floor(Number(e.best) || 0)) : 0;
}
const PG_LB = {
  ms: "COALESCE((stats->'langbang'->>'maxStage')::int, 0)",
  ts: "COALESCE((stats->'langbang'->>'totalStars')::int, 0)",
  sa: "COALESCE((stats->'langbang'->>'stageAt')::bigint, 0)",
  bw: "COALESCE((stats->'langbang'->>'bestWave')::int, 0)",
  bs: "COALESCE((stats->'langbang'->>'bestScore')::bigint, 0)",
};

class AuthError extends Error {}

function createAccounts({ databaseUrl = process.env.DATABASE_URL, file = null, secret = process.env.AUTH_SECRET } = {}) {
  const store = databaseUrl ? new PgStore(databaseUrl) : new FileStore(file);
  // 토큰 서명 키: AUTH_SECRET → 없으면 DB 주소(비밀)에서 만든다 → 그것도 없으면 이번 실행용(로컬)
  const key = secret
    || (databaseUrl ? crypto.createHash('sha256').update('chandem-auth:' + databaseUrl).digest('hex') : crypto.randomBytes(32).toString('hex'));
  // 계정 상태 캐시 (정지 · 토큰 버전 · 탈퇴): 토큰 확인을 DB 없이 바로 하려고 시작할 때 한 번 읽어 둔다
  const metaCache = new Map();
  const noteMeta = (id, meta) => { metaCache.set(id, { tv: (meta && meta.tv) | 0, banned: !!(meta && meta.banned), deleted: !!(meta && meta.deleted) }); };
  async function warmMeta() {
    if (store.pool) {
      const r = await store.pool.query(`SELECT id, meta FROM users WHERE meta <> '{}'::jsonb`);
      for (const x of r.rows) noteMeta(x.id, x.meta);
    } else for (const u of Object.values(store.data.users)) if (u.meta) noteMeta(u.id, u.meta);
  }
  const ready = Promise.all([store.init().then(warmMeta), liveReady]).catch((e) => { console.error('[accounts] 저장소 준비 실패:', e.message); });

  // 토큰: 아이디.만료.토큰버전.서명 (옛 토큰 아이디.만료.서명 은 버전 0 으로 본다)
  const sign = (id, exp, tv) => crypto.createHmac('sha256', key).update(tv === undefined ? `${id}.${exp}` : `${id}.${exp}.${tv}`).digest('base64url');
  function makeToken(id) {
    const exp = Date.now() + 90 * 24 * 3600 * 1000; // 90일
    const tv = (metaCache.get(id) || {}).tv | 0;
    return `${id}.${exp}.${tv}.${sign(id, exp, tv)}`;
  }
  function verifyToken(token) {
    const parts = String(token || '').split('.');
    const [id, exp] = parts;
    const tv = parts.length === 4 ? parts[2] : undefined;
    const sig = parts.length === 4 ? parts[3] : parts[2];
    if (parts.length < 3 || parts.length > 4 || !id || !exp || !sig || Number(exp) < Date.now()) return null;
    if (tv !== undefined && !/^\d{1,9}$/.test(tv)) return null;
    const want = sign(id, exp, tv);
    if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
    const c = metaCache.get(id);
    if (c && (c.deleted || c.banned || c.tv !== (Number(tv) | 0))) return null; // 정지 · 탈퇴 · '모든 기기 로그아웃'
    return id;
  }

  const publicUser = (u) => u && {
    id: u.id, username: u.username, nickname: u.nickname, createdAt: u.createdAt, stats: u.stats,
    tier: tierOf(u.stats.omok.rating),
    isMaster: isMasterName(u.username), // 서버가 아이디로 판단 (화면이 보낸 값은 안 믿음)
  };

  async function signup({ username, password, nickname }) {
    await ready;
    const name = String(username || '').trim().toLowerCase();
    if (!/^[a-z0-9_]{3,16}$/.test(name)) throw new AuthError('아이디는 영어 소문자·숫자·_ 로 3~16자예요');
    if (String(password || '').length < 6 || String(password).length > 64) throw new AuthError('비밀번호는 6~64자로 정해 주세요');
    const nick = String(nickname || '').replace(/\s+/g, ' ').trim().slice(0, 10);
    if (!nick) throw new AuthError('닉네임을 입력해 주세요');
    const u = await store.create({ id: crypto.randomBytes(9).toString('base64url'), username: name, pass: hashPassword(String(password)), nickname: nick, createdAt: Date.now(), stats: emptyStats() });
    if (!u) throw new AuthError('이미 있는 아이디예요');
    return { token: makeToken(u.id), user: publicUser(u) };
  }
  async function login({ username, password }) {
    await ready;
    const u = await store.byName(String(username || '').trim().toLowerCase());
    if (!u || !checkPassword(String(password || ''), u.pass)) throw new AuthError('아이디 또는 비밀번호가 맞지 않아요');
    const ban = u.meta && u.meta.banned;
    if (ban) throw new AuthError(`이용이 정지된 계정이에요${ban.reason ? ` (사유: ${ban.reason})` : ''}`);
    return { token: makeToken(u.id), user: publicUser(u) };
  }
  async function me(token) {
    const id = verifyToken(token);
    if (!id) return null;
    await ready;
    return publicUser(await store.byId(id));
  }

  // ── 전적 기록 (한 사람씩 순서대로 처리해 동시에 덮어쓰지 않게) ──
  let queue = Promise.resolve();
  const serial = (fn) => { queue = queue.then(fn).catch((e) => console.error('[accounts] 기록 실패:', e.message)); return queue; };
  async function update(id, fn) {
    const u = await store.byId(id);
    if (!u) return null;
    const stats = { ...emptyStats(), ...u.stats };
    for (const k of Object.keys(emptyStats())) stats[k] = { ...emptyStats()[k], ...(u.stats[k] || {}) };
    fn(stats);
    await store.saveStats(id, stats);
    return stats;
  }

  /** 홀덤·섯다 한 판: players [{userId, delta, won, handName, handRank}] */
  function recordHand(game, players, pot, { practice = false } = {}) {
    return serial(async () => {
      for (const p of players) {
        if (!p.userId) continue;
        await update(p.userId, (s) => {
          const g = s[game];
          g.hands++; if (p.won) g.wins++;
          g.net += p.delta;
          // AI 연습 판: 내 전적에는 그대로 쌓되, 순위(rankings.js)에서는 빼려고 따로 센다
          if (practice) { const pr = g.practice = { hands: 0, wins: 0, net: 0, ...(g.practice || {}) }; pr.hands++; if (p.won) pr.wins++; pr.net += p.delta; }
          if (p.won && pot > g.bestPot) g.bestPot = pot;
          if (p.won && p.handName && (g.bestHandRank || -1) < (p.handRank || 0)) { g.bestHand = p.handName; g.bestHandRank = p.handRank || 0; }
          g.recent = (String(g.recent || '') + (p.won ? 'W' : 'L')).slice(-10); // 최근 10판 (선수 카드용)
        });
      }
    });
  }

  /**
   * 오목 한 판: a·b = { userId|null, ai: 'easy'|'normal'|'hard'|null }, result: 'a'|'b'|'draw'
   * 로그인한 사람만 점수가 바뀐다. AI 상대는 난이도별 고정 점수로 계산.
   * 반환: { [userId]: { before, after, delta, tier } }
   */
  function recordOmok(a, b, result) {
    return serial(async () => {
      const ua = a.userId ? await store.byId(a.userId) : null;
      const ub = b.userId ? await store.byId(b.userId) : null;
      const ra = ua ? ua.stats.omok.rating : AI_RATING[a.ai] || START_RATING;
      const rb = ub ? ub.stats.omok.rating : AI_RATING[b.ai] || START_RATING;
      const out = {};
      const apply = async (u, my, opp, score) => {
        if (!u) return;
        const s = await update(u.id, (st) => {
          const o = st.omok;
          const d = eloDelta(o.rating, opp, score, o.games);
          o.games++;
          if (score === 1) { o.wins++; o.streak = Math.max(1, o.streak + 1); } else if (score === 0) { o.losses++; o.streak = Math.min(-1, o.streak - 1); } else { o.draws++; o.streak = 0; }
          o.rating = Math.max(100, o.rating + d);
          o.peak = Math.max(o.peak, o.rating);
          o.bestStreak = Math.max(o.bestStreak | 0, o.streak); // 최다 연승 · 최근 10판 (선수 카드용)
          o.recent = (String(o.recent || '') + (score === 1 ? 'W' : score === 0 ? 'L' : 'D')).slice(-10);
        });
        out[u.id] = { before: my, after: s.omok.rating, delta: s.omok.rating - my, tier: tierOf(s.omok.rating) };
      };
      const sa = result === 'a' ? 1 : result === 'b' ? 0 : 0.5;
      await apply(ua, ra, rb, sa);
      await apply(ub, rb, ra, 1 - sa);
      return out;
    });
  }

  function recordTourney(userIds, winnerId) {
    return serial(async () => {
      for (const id of userIds) await update(id, (s) => { s.tourney.played++; if (id === winnerId) s.tourney.wins++; });
    });
  }

  // ── 랑방 대전 ───────────────────────────────────────
  const lbView = (raw, id, master = false) => {
    const lb = normLb(raw, master);
    if (LIVE && id) LIVE.ensureLive(lb, id, Date.now()); // 오늘 미션 · 이번 주 · 시즌 (날이 바뀌었으면 새로)
    const view = { ...lb, expToNext: lbExpToNext(lb.level), maxMeta: LB_MAX_META };
    view.costs = Object.fromEntries(LB_HEROES.map((h) => [h, lb.heroes[h] >= LBR.metaMaxOf(h) ? null : lbUpgradeCost(lb.heroes[h] || 0)]));
    view.metaMax = Object.fromEntries(LB_HEROES.map((h) => [h, LBR.metaMaxOf(h)]));
    view.itemCosts = Object.fromEntries(LBR.ITEM_IDS.map((i) => [i, LBR.itemCost(i, lb.items[i] || 0)]));
    view.unlocked = LBR.LOCKED.filter((h) => LBR.heroUnlocked(lb, h));
    view.endlessUnlocked = LBR.endlessUnlocked(lb);
    view.deckSlots = LBR.deckSlots(lb.items);
    if (master) {
      view.master = true;
      view.testNormal = !!lb.testNormal; // 🧪 일반 유저처럼 테스트: 코인·아이템·강화 비용은 보통 유저처럼
      if (!lb.testNormal) {
        view.unlimited = true; view.coins = 1e9; view.tickets = 1e6; // 마스터: 코인 · 모집권 무한 (화면엔 ∞)
        view.items = Object.fromEntries(LBR.ITEM_IDS.map((i) => [i, LBR.ITEMS[i].max])); // 아이템 전부 최대
      }
      view.unlocked = LBR.LOCKED.slice();
      // 마스터는 덱 칸도 전부 열림 (자물쇠 없음) — 막 초기화한 상태(기록 0)만 새 계정처럼 4칸
      if (!lb.testNormal && ((lb.maxStage | 0) > 0 || (lb.runs | 0) > 0)) view.deckSlots = 6;
      view.seen = LBR.ENEMY_IDS.slice();
      view.owned = Object.fromEntries(LBR.LB_HEROES.map((h) => [h, true])); // 마스터: 20명 전부
      view.endlessUnlocked = true;
    }
    delete view.lastResultAt;
    delete view.weeklyRun;
    delete view.raidRun;
    return view;
  };
  async function userFromToken(token) {
    const id = verifyToken(token);
    if (!id) throw new AuthError('로그인해야 기록이 저장돼요');
    await ready;
    return id;
  }
  async function lbMe(token) {
    const id = await userFromToken(token);
    const u = await store.byId(id);
    if (!u) throw new AuthError('다시 로그인해 주세요');
    return { profile: lbView(u.stats.langbang, id, isMasterName(u.username)), nickname: u.nickname };
  }
  // 코인은 클라이언트가 보낸 값을 믿지 않는다: 스테이지·별·첫 클리어 여부(서버 기록)로 서버가 계산
  const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const bad = () => new AuthError('기록을 확인할 수 없어요');
  /** 한 판 결과 저장. mode 'stage' = 스테이지 클리어, 'endless' = 무한 도전. 말이 안 되는 기록은 거절(조작 방지) */
  function lbResult(token, body) {
    return (async () => {
      const id = await userFromToken(token);
      const mode = body.mode === 'stage' ? 'stage' : body.mode === 'weekly' ? 'weekly' : body.mode === 'raid' ? 'raid' : 'endless';
      const score = int(body.score, 1e9);
      const kills = int(body.kills, 1e6);
      const dur = int(body.durationSec, 1e6); // 이어하기 한 판은 앞부분 시간까지 더한 값
      let stage = 0, stars = 0, wave = 0;
      if (mode === 'stage') {
        stage = int(body.stage, 999);
        stars = int(body.stars, 99);
        if (stage < 1 || stage > LBR.STAGE_COUNT) throw new AuthError('없는 스테이지예요');
        if (stars < 1 || stars > 3) throw bad();
        if (dur < LBR.STAGE_WAVES * 8) throw bad();
        if (score > (LBR.STAGE_WAVES + 1) * 120000 || kills > (LBR.STAGE_WAVES + 1) * 1200) throw bad(); // (헬 모드 긴 판은 처치 2,600+ 가 나온다)
      } else if (mode === 'weekly' || mode === 'raid') {
        wave = int(body.wave, 99);
      } else {
        wave = int(body.wave, 999);
        // 무한: 웨이브마다 진상이 늘어서 처치·점수가 웨이브²으로 는다 (40웨이브 ≈ 처치 2.3만 · 점수 160만) — 예전 상한(웨이브×400)은 30웨이브 넘으면 기록을 버렸다
        if (score > 10 * (1000 * Math.pow(wave + 1, 2.3) + 50000 * (wave + 1)) || kills > 40 * (wave + 1) * (wave + 1) + 400 * (wave + 1)) throw bad(); // (계약 ×5 · 스킬 연속 ×2 배율까지)
        if (wave >= 3 && dur < wave * 8) throw bad();
      }
      let out = null;
      await serial(async () => {
        const u = await store.byId(id);
        if (!u) return;
        const master = isMasterName(u.username);
        const before = normLb(u.stats.langbang, master);
        if (Date.now() - (before.lastResultAt || 0) < 10000 && !master) { out = { error: '너무 자주 저장하고 있어요' }; return; }
        if (mode === 'stage' && stage > before.maxStage + 1 && !master) { out = { error: '아직 열리지 않은 스테이지예요' }; return; }
        if (mode === 'endless' && !LBR.endlessUnlocked(before)) { out = { error: '무한 도전은 1-10을 깨면 열려요' }; return; }
        const now = Date.now();
        // 주간 도전: 서버가 준 판 번호 · 시간이 맞아야 한다. 점수는 서버가 계산
        let wk = null;
        if (mode === 'weekly') {
          const run = before.weeklyRun;
          const wi = LIVE.weekIndex(now);
          if (!run || run.id !== String(body.runId || '') || run.wi !== wi) { out = { error: '주간 도전을 다시 시작해 주세요' }; return; }
          if (dur > (now - run.at) / 1000 * 1.15 + 20) { out = { error: '기록을 확인할 수 없어요' }; return; } // 주간 도전은 배속 없음
          const def = LIVE.weeklyDef(wi);
          const victory = body.victory === true;
          const chk = LIVE.weeklyCheck(def, { waves: wave, kills, bossKills: body.bossKills, durationSec: dur, victory });
          if (chk) { out = { error: chk }; return; }
          wk = { wi, victory, score: LIVE.weeklyScore({ waves: wave, kills, bossKills: body.bossKills, victory, hpPct: body.hpPct }) };
        }
        // 레이드: 서버가 준 판 번호 · 시간 · 피해 상한 확인
        let rd = null;
        if (mode === 'raid') {
          const run = before.raidRun;
          const st = LIVE.raidState(now);
          if (!run || run.id !== String(body.runId || '') || (run.wi !== st.wi && now - run.at > 10 * 60e3)) { out = { error: '레이드를 다시 시작해 주세요' }; return; } // 시간이 끝나도 진행 중이던 판은 인정
          if (dur > (now - run.at) / 1000 * 1.15 + 20) { out = { error: '기록을 확인할 수 없어요' }; return; }
          const dmg = Math.floor(Number(body.raidDmg) || 0);
          if (dmg < 0 || dmg > LIVE.raidCap(before, dur)) { out = { error: '기록을 확인할 수 없어요' }; return; }
          rd = { wi: run.wi, dmg };
        }
        // 미션용 숫자도 서버가 상한을 건다
        const bosses = Math.min(int(body.bossKills, 99), mode === 'stage' ? LIVE.stageBossN(stage) : mode === 'weekly' ? 20 : mode === 'raid' ? 0 : Math.floor(wave / 5) + 1);
        const skills = LIVE.skillCap(body.skills, dur);
        const hell = mode === 'stage' && body.hell === true;
        if (hell && !LBR.hellOpen(before.stages, stage, master)) { out = { error: '헬 모드는 일반 ★★★ 로 깬 스테이지만 열려요' }; return; }
        const prevStars = mode === 'stage' ? (hell ? before.hell[stage] : before.stages[stage]) || 0 : 0;
        // 퍼펙트(입구 무피해)는 ★★★ 일 때만 인정 (헬 모드는 따로 없음)
        const perfect = mode === 'stage' && !hell && stars === 3 && body.perfect === true;
        const firstPerfect = perfect && !before.perfects[stage];
        const reward = mode === 'stage' ? (hell ? LBR.hellReward(stage, stars, prevStars, before.items.coupon) : LBR.stageReward(stage, stars, prevStars, before.items.coupon, perfect, firstPerfect))
          : mode === 'weekly' ? { total: LIVE.weeklyCoins(wave) } : mode === 'raid' ? { total: 100 } : { total: LBR.endlessReward(wave, before.items.coupon) };
        // 박상화(경제 멤버)를 데려가 깨면 코인 +12% — 가진 멤버일 때만
        if (mode === 'stage' && Array.isArray(body.heroesUsed) && body.heroesUsed.includes('sanghwa') && LBR.heroUnlocked(before, 'sanghwa')) { const x = Math.round(reward.total * 0.12); reward.total += x; reward.sanghwa = x; }
        // 신화 1등 복권: 데려간 멤버가 끼고 있으면 코인 +20%
        if (Array.isArray(body.heroesUsed) && body.heroesUsed.some((h) => { const gid = ((before.equip || {})[h] || {}).m; const it = gid && (before.gear || []).find((g) => g.id === gid); return it && it.t === 'myth_lotto'; })) { const x = Math.round(reward.total * LBR.MYTH.myth_lotto.stats.coin); reward.total += x; reward.lotto = x; }
        let weeklyBest = false;
        // 장비 드롭: 서버 시드로 계산 (클라이언트가 만들 수 없음)
        const drops = mode === 'stage' ? LBR.rollDrops(LBR.hashSeed(`${id}:${before.clears}:${stage}:${before.gearSeq}${hell ? ':h' : ''}`), stage, stars, perfect, firstPerfect, hell) : [];
        const got = [];
        let endInfo = null;
        const afkF = mode === 'endless' ? Math.max(0, Math.min(1, (Number(body.afkSec) || 0) / Math.max(1, dur))) : 0;
        if (mode === 'endless') reward.total = Math.round(reward.total * (1 - afkF) * Math.min(2, Math.max(1, Number(body.coinMul) || 1)));
        const usedOk = Array.isArray(body.heroesUsed) ? [...new Set(body.heroesUsed.map(String))].filter((h) => LB_HEROES.includes(h) && LBR.heroUnlocked(before, h)).slice(0, 7) : [];
        const cardDrop = mode === 'stage' ? LBR.rollHeroCard(LBR.hashSeed(`hc:${id}:${before.clears}:${stage}`), stars, hell, usedOk) : null;
        const stones = mode === 'stage' ? LBR.rollStones(LBR.hashSeed(`st:${id}:${before.clears}:${stage}`), stage, stars, !prevStars, hell) : mode === 'raid' ? 2 : 0; // 레이드 한 판마다 강화석 2개
        const stats = await update(id, (s) => {
          const lb = s.langbang = normLb(s.langbang);
          if (mode === 'stage') { if (lb.staRun && lb.staRun.stage === stage) lb.staRun = null; else if (!freeMaster(u)) LIVE.staminaAdd(lb, -LIVE.stageStaminaCost(lb, stage, hell), now); }
          if (mode === 'endless') { const ef = LIVE.endlessFinish(lb, wave, master ? 0 : Math.round(score * (1 - afkF)), (lb.endRun || master || LIVE.endlessLeft(lb, now) > 0) ? reward.total : 0, id, now); if (!lb.endRun && !master && LIVE.endlessLeft(lb, now) > 0) LIVE.endlessStart(lb, false, now); lb.endRun = null; endInfo = ef; reward.total = ef.coins; }
          lb.runs++; lb.kills += kills; lb.coins += reward.total; lb.stones = (lb.stones | 0) + stones; if (cardDrop) { lb.shards = lb.shards || {}; lb.shards[cardDrop] = (lb.shards[cardDrop] | 0) + 1; }
          // 도감: 이번 판에 만난 진상 (있는 이름만)
          if (Array.isArray(body.seen)) lb.seen = [...new Set([...lb.seen, ...body.seen.slice(0, 40).map(String).filter((t) => LBR.ENEMY_IDS.includes(t))])];
          if (mode === 'stage') {
            lb.clears++;
            if (hell) lb.hell[stage] = Math.max(prevStars, stars);
            else lb.stages[stage] = Math.max(prevStars, stars);
            if (perfect) lb.perfects[stage] = true;
            for (const d of drops) {
              if (lb.gear.length >= LBR.GEAR_BAG || (lb.autoSell && d.r === 'common')) { const v = LBR.gearSellValue(d.r, 0); lb.coins += v; got.push({ ...d, sold: v, auto: lb.autoSell && d.r === 'common' }); continue; }
              const it = { id: ++lb.gearSeq, t: d.t, r: d.r, lv: 0 };
              lb.gear.push(it); got.push(it);
            }
            const max = LBR.maxCleared(lb.stages);
            if (max > before.maxStage) lb.stageAt = Date.now();
            lb.maxStage = max;
            lb.totalStars = Object.values(lb.stages).reduce((a, b) => a + b, 0);
            lb.exp += Math.floor(score / 60) + 40;
          } else if (mode === 'raid') {
            if (!master) LIVE.raidRecord(lb, rd.dmg, now, rd.wi);
            lb.raidRun = null;
            lb.exp += 40;
          } else if (mode === 'weekly') {
            if (!master) weeklyBest = LIVE.weeklyRecord(lb, wk.wi, wk.score, wave, now); // 마스터 테스트 판은 순위에 안 올린다
            lb.weeklyRun = null;
            lb.exp += 30 + wave * 6;
          } else {
            lb.endlessRuns++;
            lb.bestWave = Math.max(lb.bestWave, wave);
            lb.bestScore = Math.max(lb.bestScore, score);
            lb.exp += Math.floor(score / 60) + wave * 8;
          }
          while (lb.exp >= lbExpToNext(lb.level)) { lb.exp -= lbExpToNext(lb.level); lb.level++; LIVE.staminaAdd(lb, LIVE.STAMINA.lvUp, now); }
          lb.lastResultAt = Date.now();
          LIVE.trackRun(lb, { mode, clear: mode === 'stage', stars, perfect, kills, bosses, skills }, id, now);
          for (const d of got) if (d.r === 'legend') lb.cnt.legends = (lb.cnt.legends | 0) + 1;
        });
        const lb = stats.langbang;
        const first = mode === 'stage' && !prevStars && !hell;
        out = {
          profile: lbView(lb, id, master), reward: { ...reward, firstClear: first, stage, stars, isPerfect: perfect, firstPerfect, drops: got, hell, stones, cardDrop },
          levelUp: lb.level > before.level, rank: mode === 'weekly' ? await store.rankWeekly(wk.wi, id) : mode === 'raid' ? await store.raidRank(rd.wi, id) : await store.rankLangbang(mode, id),
          raid: rd ? { dmg: rd.dmg, mine: lb.raid ? lb.raid.dmg : 0, total: await store.raidTotal(rd.wi), hp: LIVE.RAID.hp, master } : null,
          weekly: wk ? { score: wk.score, best: lb.weekly ? lb.weekly.best : 0, newBest: weeklyBest, master } : null,
          unlockedHeroes: first ? Object.keys(LBR.HERO_UNLOCK).filter((h) => LBR.HERO_UNLOCK[h] === stage && !LBR.heroUnlocked(before, h)) : [],
          endlessUnlocked: first && !LBR.endlessUnlocked(before) && LBR.endlessUnlocked(lb),
          newBestWave: mode === 'endless' && wave > before.bestWave, newBestScore: mode === 'endless' && score > before.bestScore, endless: endInfo,
        };
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }
  // 코인 쓰기 (영웅 강화 / 아이템) — 비용·최대 레벨·해금은 서버가 확인
  function lbSpend(token, check) {
    return (async () => {
      const id = await userFromToken(token);
      let out = null;
      await serial(async () => {
        const u = await store.byId(id);
        if (!u) return;
        const ms = isMasterName(u.username);
        const lb0 = normLb(u.stats.langbang, ms);
        lb0.freeMaster = freeMaster(u);
        const r = check(lb0);
        if (r.error) { out = r; return; }
        if (freeMaster(u)) r.cost = 0; // 마스터: 코인 무한 ("일반 유저처럼 테스트" 켜면 보통)
        if (lb0.coins < r.cost) { out = { error: `코인이 부족해요 (${r.cost.toLocaleString()} 필요)` }; return; }
        const stats = await update(id, (s) => {
          const lb = s.langbang = normLb(s.langbang);
          lb.coins -= r.cost;
          r.apply(lb);
        });
        out = { profile: lbView(stats.langbang, id, isMasterName(u.username)) };
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }
  /** 코인으로 캐릭터 영구 강화 (최대 20) */
  function lbUpgrade(token, hero) {
    if (!LB_HEROES.includes(hero)) return Promise.reject(new AuthError('없는 캐릭터예요'));
    return lbSpend(token, (lb) => {
      const lvl = lb.heroes[hero] || 0;
      if (!LBR.heroUnlocked(lb, hero)) return { error: '아직 합류하지 않은 멤버예요' };
      if (lvl >= LBR.metaMaxOf(hero)) return { error: `이미 최대로 강화했어요 (${['', 'T1', 'T2', 'T3', 'T4', 'LEGEND'][LBR.HERO_TIER[hero] || 1]} 한도 +${LBR.metaMaxOf(hero)})` };
      const need = lb.freeMaster ? 0 : LBR.heroCardNeed(lvl);
      const have = ((lb.shards || {})[hero] | 0), wild = lb.wild | 0;
      if (have + wild < need) return { error: `${hero === 'bangjang' ? '방장' : '이 멤버'} 카드가 부족해요 (${have}/${need}장 · 모집·스테이지·상점 선택권에서 모아요)` };
      const fromOwn = Math.min(have, need), fromWild = need - fromOwn;
      return { cost: lbUpgradeCost(lvl), cards: need, apply: (x) => { x.heroes[hero] = lvl + 1; if (need) { x.shards = x.shards || {}; x.shards[hero] = (x.shards[hero] | 0) - fromOwn; x.wild = (x.wild | 0) - fromWild; } } };
    });
  }
  // 상점 "멤버 카드 선택권": 고른 멤버 카드 N장 (주 N번)
  function lbCardPick(token, hero) {
    if (!LB_HEROES.includes(hero)) return Promise.reject(new AuthError('없는 캐릭터예요'));
    return lbSpend(token, (lb) => {
      if (!LBR.heroUnlocked(lb, hero)) return { error: '합류한 멤버만 고를 수 있어요' };
      const wi = LIVE.weekIndex(Date.now());
      const n = lb.cardPick && lb.cardPick.wi === wi ? lb.cardPick.n : 0;
      if (n >= LBR.CARD_PICK.perWeek) return { error: `이번 주 선택권은 다 샀어요 (주 ${LBR.CARD_PICK.perWeek}번)` };
      return { cost: LBR.CARD_PICK.cost, apply: (x) => { x.shards = x.shards || {}; x.shards[hero] = (x.shards[hero] | 0) + LBR.CARD_PICK.n; x.cardPick = { wi, n: n + 1 }; } };
    });
  }
  // 다 키운(강화 최대 + ★5) 멤버의 남는 카드 → 범용 카드
  function lbCardConvert(token) {
    return lbSpend(token, (lb) => {
      const list = LB_HEROES.filter((h) => (lb.heroes[h] | 0) >= LBR.metaMaxOf(h) && ((lb.hstars || {})[h] | 0) >= 5 && ((lb.shards || {})[h] | 0) > 0);
      if (!list.length) return { error: '바꿀 남는 카드가 없어요 (강화 최대 + ★5 멤버의 카드만)' };
      const n = list.reduce((a, h) => a + (lb.shards[h] | 0), 0);
      return { cost: 0, apply: (x) => { for (const h of list) x.shards[h] = 0; x.wild = (x.wild | 0) + n; } };
    });
  }
  /** 코인으로 아이템 사기 (레벨제) */
  function lbBuy(token, item) {
    if (!LBR.ITEM_IDS.includes(item)) return Promise.reject(new AuthError('없는 아이템이에요'));
    return lbSpend(token, (lb) => {
      const lvl = lb.items[item] || 0;
      const cost = LBR.itemCost(item, lvl);
      if (cost === null) return { error: '이미 최대 레벨이에요' };
      const need = LBR.ITEMS[item].needs;
      if (need && !(lb.items[need] | 0)) return { error: '앞 칸부터 사 주세요' };
      return { cost, apply: (x) => { x.items[item] = lvl + 1; } };
    });
  }
  // ── 장비: 장착 · 강화 · 팔기 (전부 서버가 확인) ──
  function lbGear(token, fn) {
    return (async () => {
      const id = await userFromToken(token);
      let out = null;
      await serial(async () => {
        const u = await store.byId(id);
        if (!u) return;
        const lb0 = normLb(u.stats.langbang, isMasterName(u.username));
        const r = fn(lb0);
        if (r.error) { out = r; return; }
        if (freeMaster(u)) r.cost = 0; // 마스터: 공짜 ("일반 유저처럼 테스트" 켜면 보통)
        if (r.cost && lb0.coins < r.cost) { out = { error: `코인이 부족해요 (${r.cost.toLocaleString()} 필요)` }; return; }
        const stats = await update(id, (st) => { const lb = st.langbang = normLb(st.langbang); if (r.cost) lb.coins -= r.cost; r.apply(lb); });
        out = { profile: lbView(stats.langbang, id, isMasterName(u.username)), ...(r.extra || {}) };
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }
  const findGear = (lb, gid) => lb.gear.find((x) => x.id === gid);
  function lbEquip(token, hero, slot, gid) {
    if (!LB_HEROES.includes(hero) || !['w', 'a', 'm'].includes(slot)) return Promise.reject(new AuthError('잘못된 요청이에요'));
    return lbGear(token, (lb) => {
      if (!LBR.heroUnlocked(lb, hero)) return { error: '아직 합류하지 않은 멤버예요' };
      if (gid === null) return { apply: (x) => { if (x.equip[hero]) delete x.equip[hero][slot]; } };
      const it = findGear(lb, gid);
      if (!it) return { error: '없는 장비예요' };
      if (LBR.GEAR[it.t].slot !== slot) return { error: '그 칸에는 못 껴요' };
      return { apply: (x) => {
        for (const h of Object.keys(x.equip)) for (const k of ['w', 'a', 'm']) if (x.equip[h][k] === gid) delete x.equip[h][k]; // 다른 멤버가 끼고 있던 건 빼고
        (x.equip[hero] = x.equip[hero] || {})[slot] = gid;
      } };
    });
  }
  function lbEnhance(token, gid) {
    return lbLive(token, (lb, id, now, ctx) => {
      const it = findGear(lb, gid);
      if (!it) return { error: '없는 장비예요' };
      const cost0 = LBR.gearEnhanceCost(it.r, it.lv);
      if (cost0 === null) return { error: '이미 최대 강화예요' };
      const cost = ctx.master ? 0 : cost0; // 마스터는 공짜
      const st = ctx.master ? 0 : LBR.gearStoneNeed(it.lv);
      if (lb.coins < cost) return { error: `코인이 부족해요 (${cost.toLocaleString()} 필요)` };
      if ((lb.stones | 0) < st) return { error: `강화석이 부족해요 (${st}개 필요 · 스테이지·레이드·분해로 모아요)` };
      lb.coins -= cost; lb.stones = (lb.stones | 0) - st;
      // 성공 판정은 서버 시드로 (계정 · 장비 · 몇 번째 시도) — 같은 요청을 두 번 계산해도 같은 결과
      const n = (lb.cnt.enhTry | 0) + 1;
      lb.cnt.enhTry = n;
      const chance = ctx.master ? 1 : LBR.gearEnhanceChance(it.lv); // 마스터: 항상 성공
      const ok = LBR.seedRng(LBR.hashSeed(`enh:${id}:${it.id}:${n}`))() < chance;
      if (ok) { it.lv++; LIVE.bump(lb, 'enhances', 1, id, now); }
      return { success: ok, lv: it.lv, chance, cost, stones: st };
    }, async (u) => ({ master: freeMaster(u) }));
  }
  // ── 모집 · 미션 · 시즌 · 성급 · 주간 도전 (공식은 live.js) ──
  // fn(lb, id, now, ctx) 는 lb 를 바꾸고 {error} 나 {추가 응답} 을 돌려준다.
  // 먼저 복사본으로 확인하고(오류면 저장 안 함), 같은 입력으로 진짜 저장본에 한 번 더 (결과가 같다 — 시드 고정)
  function lbLive(token, fn, pre) {
    return (async () => {
      const id = await userFromToken(token);
      let out = null;
      await serial(async () => {
        const u = await store.byId(id);
        if (!u) return;
        const now = Date.now();
        const ctx = pre ? await pre(u, id, now) : {};
        const ms = isMasterName(u.username);
        const test = normLb(JSON.parse(JSON.stringify(u.stats.langbang || {})), ms);
        LIVE.ensureLive(test, id, now);
        const inf = (x) => { if (ms && freeMaster(u)) { x.coins = 1e9; x.tickets = 1e6; } }; // 마스터: 코인 · 모집권이 줄지 않는다 (테스트 모드면 보통)
        inf(test);
        const r0 = fn(test, id, now, ctx) || {};
        if (r0.error) { out = r0; return; }
        let r1 = {};
        const stats = await update(id, (st) => { const lb = st.langbang = normLb(st.langbang, ms); LIVE.ensureLive(lb, id, now); inf(lb); r1 = fn(lb, id, now, ctx) || {}; inf(lb); delete lb.master; });
        out = { profile: lbView(stats.langbang, id, ms), ...r1 };
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }
  const lbGacha = (token, n, pay) => lbLive(token, (lb, id, now) => LIVE.gachaPull(lb, n, pay, id, now));
  const lbGearGacha = (token, n) => lbLive(token, (lb, id, now) => LIVE.gearGachaPull(lb, n, id, now));
  const lbMission = (token, kind, mid) => lbLive(token, (lb, id, now) => LIVE.claimMission(lb, kind, mid, id, now));
  const lbSeason = (token, tier) => lbLive(token, (lb, id, now) => LIVE.claimSeason(lb, tier, id, now));
  const lbStar = (token, hero) => lbLive(token, (lb) => LIVE.starUp(lb, hero));
  const lbCosmetic = (token, title, frame) => lbLive(token, (lb) => LIVE.setCosmetic(lb, title, frame));
  function lbWeeklyStart(token) {
    return lbLive(token, (lb, id, now, ctx) => {
      if ((lb.maxStage | 0) < LIVE.WEEKLY_UNLOCK) return { error: `주간 도전은 ${LBR.stageLabel(LIVE.WEEKLY_UNLOCK)}를 깨면 열려요` };
      const wi = LIVE.weekIndex(now);
      lb.weeklyRun = { id: ctx.rid, wi, at: now };
      return { runId: ctx.rid, wi };
    }, async () => ({ rid: crypto.randomBytes(9).toString('base64url') }));
  }
  // 지난주 순위 보상 받기 (순위는 서버가 센다)
  const freeCtx = async (u) => ({ free: freeMaster(u) });
  // 우편함 채우기: 지난주 무한 주간 순위 보상 (한 번)
  function lbMailSync(token) {
    return lbLive(token, (lb, id, now, ctx) => {
      const prev = LIVE.weekIndex(now) - 1;
      const e = lb.ew && lb.ew.wi === prev ? lb.ew : lb.ewPrev && lb.ewPrev.wi === prev ? lb.ewPrev : null;
      if (e && e.best > 0 && lb.ewPaid !== prev && ctx.rank) {
        const rw = LIVE.endlessWeekReward(ctx.rank);
        if (rw) LIVE.mailAdd(lb, { title: `♾️ 무한 주간 순위 보상 — ${rw.label}`, text: '지난주 무한 도전 점수 순위', rw }, now);
        lb.ewPaid = prev;
      }
      return { mail: LIVE.mailCount(lb, now) };
    }, async (u, id, now) => ({ rank: await store.rankEndlessWeek(LIVE.weekIndex(now) - 1, id) }));
  }
  function lbWeeklyClaim(token) {
    return lbLive(token, (lb, id, now, ctx) => {
      const prev = LIVE.weekIndex(now) - 1;
      const e = LIVE.weeklyEntry(lb, prev);
      if (!e || !e.best) return { error: '지난주 기록이 없어요' };
      if (lb.weeklyClaimed === prev) return { error: '이미 받았어요' };
      const rw = LIVE.weeklyRankReward(ctx.rank);
      if (!rw) return { error: '순위를 확인할 수 없어요' };
      lb.weeklyClaimed = prev;
      return { got: LIVE.grant(lb, rw, id, now), rank: ctx.rank, label: rw.label };
    }, async (u, id, now) => ({ rank: await store.rankWeekly(LIVE.weekIndex(now) - 1, id) }));
  }
  function lbRaidStart(token) {
    return lbLive(token, (lb, id, now, ctx) => {
      const st = LIVE.raidState(now);
      if (!st.open) return { error: '레이드는 매일 12:00~13:30 · 15:00~16:30 · 21:00~23:00 에 열려요' };
      if ((lb.maxStage | 0) < 5) return { error: '레이드는 1-5를 깨면 참가할 수 있어요' };
      if (LIVE.raidTriesLeft(lb, now) <= 0) return { error: `이번 레이드 도전은 다 했어요 (레이드마다 ${LIVE.RAID.tries}번)` };
      lb.raidRun = { id: ctx.rid, wi: st.wi, at: now };
      return { runId: ctx.rid, wi: st.wi, boss: st.boss };
    }, async () => ({ rid: crypto.randomBytes(9).toString('base64url') }));
  }
  async function lbRaidBoard(token) {
    await ready;
    const now = Date.now();
    const st = LIVE.raidState(now);
    // 지금 열려 있지 않으면 방금 끝난 레이드 결과
    const wi = st.open || now >= st.endsAt ? st.wi : st.wi - 1;
    const total = await store.raidTotal(wi);
    const top = (await store.raidTop(wi, 20)).map((u, i) => { const lb = lbOf(u); return { rank: i + 1, nickname: u.nickname, username: u.username, dmg: raidDmgOf(u, wi), title: lb.title || '', frame: lb.frame || '' }; });
    let me = null;
    const id = token ? verifyToken(token) : null;
    if (id) {
      const u = await store.byId(id);
      if (u) {
        const lb = normLb(u.stats.langbang);
        const mine = raidDmgOf(u, wi);
        const rank = await store.raidRank(wi, id);
        const killed = total >= LIVE.RAID.hp;
        const ended = now >= LIVE.raidEndMs(wi);
        me = { dmg: mine, rank, tries: LIVE.raidTriesLeft(lb, now), claimed: !!(lb.raid && lb.raid.wi === wi && lb.raid.claimed), reward: mine ? LIVE.raidReward(mine, total, rank, killed) : null, canClaim: !!mine && (killed || ended) };
      }
    }
    return { ...st, shownWi: wi, total, killed: total >= LIVE.RAID.hp, players: await store.raidCount(wi), top, me };
  }
  function lbRaidClaim(token) {
    return lbLive(token, (lb, id, now, ctx) => {
      const r = lb.raid;
      if (!r || r.wi !== ctx.wi || !r.dmg) return { error: '이번 레이드 기록이 없어요' };
      if (r.claimed) return { error: '이미 받았어요' };
      if (!ctx.killed && now < LIVE.raidEndMs(ctx.wi)) return { error: '보스를 잡거나 레이드가 끝나면 받을 수 있어요' };
      const rw = LIVE.raidReward(r.dmg, ctx.total, ctx.rank, ctx.killed);
      r.claimed = true;
      return { got: LIVE.grant(lb, rw, id, now), label: rw.label };
    }, async (u, id, now) => {
      const st = LIVE.raidState(now);
      const wi = st.open || now >= st.endsAt ? st.wi : st.wi - 1;
      const total = await store.raidTotal(wi);
      return { wi, total, killed: total >= LIVE.RAID.hp, rank: await store.raidRank(wi, id) };
    });
  }
  async function lbPvpRanking(token) {
    await ready;
    const list = (await store.pvpTop(50)).map((u, i) => { const p = pvpOf(u); const lb0 = lbOf(u); return { rank: i + 1, title: lb0.title || '', frame: lb0.frame || '', nickname: u.nickname, username: u.username, rating: p.rating, games: p.games, wins: p.wins, tier: tierOf(p.rating) }; });
    let me = null;
    const id = token ? verifyToken(token) : null;
    if (id) { const u = await store.byId(id); if (u) { const p = pvpOf(u); me = { ...p, tier: tierOf(p.rating) }; } }
    return { ranking: list, me };
  }
  // 다른 사람 선수 카드 (랭킹 · 1:1 대전에서 이름을 누르면)
  async function lbPlayer(username) {
    await ready;
    const u = username ? await store.byName(String(username).slice(0, 40)) : null;
    if (!u) throw new AuthError('없는 선수예요');
    const lb = normLb(u.stats && u.stats.langbang, isMasterName(u.username)), p = pvpOf(u), raw = (u.stats && u.stats.langbang) || {}; // 마스터는 전부 (선수 카드 덱에서 강성구 등이 빠지지 않게)
    const dk = raw.decks && Array.isArray(raw.decks.decks) ? (raw.decks.decks[raw.decks.i | 0] || []).filter((x) => typeof x === 'string' && LBR.LB_HEROES.includes(x) && LBR.heroUnlocked(lb, x)) : [];
    const heroes = Object.entries(lb.heroes || {}).filter(([h]) => LBR.LB_HEROES.includes(h));
    const deck = dk.length ? dk : heroes.sort((x, y) => y[1] - x[1]).slice(0, 4).map(([h]) => h);
    return { player: {
      nickname: u.nickname, username: u.username, level: lb.level, maxStage: lb.maxStage, stageLabel: lb.maxStage ? LBR.stageLabel(lb.maxStage) : '-', totalStars: lb.totalStars, bestWave: lb.bestWave,
      pvp: { rating: p.rating, games: p.games, wins: p.wins, winRate: p.games ? Math.round((p.wins / p.games) * 100) : 0, tier: tierOf(p.rating) },
      deck: deck.slice(0, 6).map((h) => ({ id: h, lv: (lb.heroes || {})[h] | 0, star: Math.max(1, ((raw.hstars || {})[h]) | 0) })),
      title: typeof raw.title === 'string' ? raw.title : '', frame: typeof raw.frame === 'string' ? raw.frame : '', master: isMasterName(u.username),
    } };
  }
  // ── 마스터(운영자) 전용 테스트 도구: 서버가 아이디로 확인 ──
  function lbMaster(token, body) {
    return (async () => {
      const id = await userFromToken(token);
      const u = await store.byId(id);
      if (!u || !isMasterName(u.username)) throw new AuthError('마스터만 쓸 수 있어요');
      const act = String(body.action || '');
      const v = Math.max(0, Math.min(1e7, Math.floor(Number(body.value) || 0)));
      let out = null;
      await serial(async () => {
        const stats = await update(id, (st) => {
          if (act === 'reset') { st.langbang = emptyLangbang(); return; }
          const lb = st.langbang = normLb(st.langbang);
          if (act === 'coins') lb.coins = Math.min(1e9, lb.coins + (v || 100000));
          else if (act === 'testNormal') lb.testNormal = !!body.on; // 🧪 일반 유저처럼 테스트 켜기/끄기
          else if (act === 'stones') lb.stones = Math.min(99999, (lb.stones | 0) + (v || 50));
          else if (act === 'tickets') lb.tickets = Math.min(1e6, (lb.tickets | 0) + (v || 100));
          else if (act === 'stage') { const n = Math.min(LBR.STAGE_COUNT, v); lb.stages = {}; for (let s = 1; s <= n; s++) lb.stages[s] = 3; }
          else if (act === 'allclear') {
            for (let s = 1; s <= LBR.STAGE_COUNT; s++) lb.stages[s] = 3;
            const lv = Math.max(0, Math.min(LBR.META_MAX, body.level === undefined ? LBR.META_MAX : Math.floor(Number(body.level) || 0)));
            for (const h of LBR.LB_HEROES) lb.heroes[h] = Math.min(lv, LBR.metaMaxOf(h));
            lb.owned = Object.fromEntries(LBR.GACHA.map((h) => [h, true])); // (스테이지 해금 멤버는 기록으로 열림 · 마스터는 전부)
            lb.hstars = body.star5 ? Object.fromEntries(LBR.LB_HEROES.map((h) => [h, 5])) : {};
            for (const it of Object.keys(LBR.ITEMS)) lb.items[it] = LBR.ITEMS[it].max;
            // 견본 장비: 무기·액세서리 × 등급마다 하나
            for (const slot of ['w', 'a']) for (const r of LBR.GEAR_RARITIES) {
              const t = LBR.GEAR_IDS.find((g) => LBR.GEAR[g].slot === slot && !lb.gear.some((x) => x.t === g && x.r === r)) || LBR.GEAR_IDS.find((g) => LBR.GEAR[g].slot === slot);
              if (lb.gear.length < LBR.GEAR_BAG) lb.gear.push({ id: ++lb.gearSeq, t, r, lv: r === 'legend' ? 5 : 0 });
            }
            lb.coins = Math.max(lb.coins, 1000000);
            lb.tickets = Math.max(lb.tickets | 0, 500);
            lb.seen = LBR.ENEMY_IDS.slice();
            lb.bestWave = Math.max(lb.bestWave, 30);
            if (LIVE) { LIVE.ensureLive(lb, id, Date.now()); lb.season.sp = Math.max(lb.season.sp, 3000); }
          } else throw new AuthError('없는 동작이에요');
          lb.maxStage = LBR.maxCleared(lb.stages);
          lb.totalStars = Object.values(lb.stages).reduce((a, b) => a + b, 0);
        });
        out = { profile: lbView(stats.langbang, id, true) };
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      return out;
    })();
  }
  const wkRow = (u, wi, i) => {
    const lb = u.stats.langbang || {};
    const e = lb.weekly && lb.weekly.wi === wi ? lb.weekly : lb.weeklyPrev || {};
    return { rank: i + 1, nickname: u.nickname, username: u.username, best: weeklyBestOf(u, wi), waves: e.waves | 0, title: lb.title || '', frame: lb.frame || '' };
  };
  async function lbWeeklyBoard(token) {
    await ready;
    const now = Date.now();
    const wi = LIVE.weekIndex(now);
    const board = (await store.topWeekly(wi, 30)).map((u, i) => wkRow(u, wi, i));
    const total = await store.countWeekly(wi);
    let me = null, prev = null;
    const id = token ? verifyToken(token) : null;
    if (id) {
      const u = await store.byId(id);
      if (u) {
        const lb = normLb(u.stats.langbang);
        const rank = await store.rankWeekly(wi, id);
        me = { rank, best: (lb.weekly && lb.weekly.wi === wi ? lb.weekly.best : 0) | 0, runs: (lb.weekly && lb.weekly.wi === wi ? lb.weekly.runs : 0) | 0 };
        const pe = LIVE.weeklyEntry(lb, wi - 1);
        if (pe && pe.best) {
          const pr = await store.rankWeekly(wi - 1, id);
          prev = { wi: wi - 1, best: pe.best, rank: pr, reward: LIVE.weeklyRankReward(pr), claimed: lb.weeklyClaimed === wi - 1 };
        }
      }
    }
    return { wi, left: LIVE.msToWeekEnd(now), board, total, me, prev };
  }
  function lbSell(token, gid) {
    return lbGear(token, (lb) => {
      const it = findGear(lb, gid);
      if (!it) return { error: '없는 장비예요' };
      const v = LBR.gearSellValue(it.r, it.lv);
      return { apply: (x) => {
        x.gear = x.gear.filter((g) => g.id !== gid);
        for (const h of Object.keys(x.equip)) for (const k of ['w', 'a', 'm']) if (x.equip[h][k] === gid) delete x.equip[h][k];
        x.coins += v;
      }, extra: { sold: v } };
    });
  }
  // 일괄 판매: 한 번에 · 하나씩 팔 때와 같은 확인 · 장착 중인 건 안 판다 · 없는 번호는 건너뜀(두 번 눌러도 두 번 안 팔림)
  function lbSellMany(token, ids) {
    const want = [...new Set((Array.isArray(ids) ? ids : []).map((x) => Math.floor(Number(x)) || 0).filter((x) => x > 0))].slice(0, LBR.GEAR_BAG);
    return lbGear(token, (lb) => {
      const eq = new Set(Object.values(lb.equip || {}).flatMap((s) => [s.w, s.a]).filter(Boolean));
      const list = want.map((g) => findGear(lb, g)).filter((it) => it && !eq.has(it.id));
      if (!list.length) return { error: '팔 수 있는 장비가 없어요' };
      const v = list.reduce((a, it) => a + LBR.gearSellValue(it.r, it.lv), 0);
      const set = new Set(list.map((it) => it.id));
      return { apply: (x) => { x.gear = x.gear.filter((g) => !set.has(g.id)); x.coins += v; }, extra: { sold: v, n: list.length } };
    });
  }
  // 분해: 장비 → 강화석 (장착 중은 안 됨 · 없는 번호는 건너뜀)
  function lbDismantle(token, ids) {
    const want = [...new Set((Array.isArray(ids) ? ids : []).map((x) => Math.floor(Number(x)) || 0).filter((x) => x > 0))].slice(0, LBR.GEAR_BAG);
    return lbGear(token, (lb) => {
      const eq = new Set(Object.values(lb.equip || {}).flatMap((s) => [s.w, s.a]).filter(Boolean));
      const list = want.map((g) => findGear(lb, g)).filter((it) => it && !eq.has(it.id));
      if (!list.length) return { error: '분해할 수 있는 장비가 없어요' };
      const n = list.reduce((a, it) => a + LBR.gearDismantle(it.r, it.lv), 0);
      const set = new Set(list.map((it) => it.id));
      return { apply: (x) => { x.gear = x.gear.filter((g) => !set.has(g.id)); x.stones = (x.stones | 0) + n; }, extra: { stones: n, n: list.length } };
    });
  }
  // 합성: 같은 등급 3개 → 다음 등급 1개 (셋 다 같은 종류면 그 종류) · 가장 높은 강화 -2 를 이어 받음 · 수수료
  function lbFuse(token, ids) {
    const want = [...new Set((Array.isArray(ids) ? ids : []).map((x) => Math.floor(Number(x)) || 0).filter((x) => x > 0))];
    return (async () => {
      const uid = await userFromToken(token);
      let out = null;
      await serial(async () => {
        const u = await store.byId(uid);
        if (!u) return;
        const lb0 = normLb(u.stats.langbang, isMasterName(u.username));
        if (want.length !== 3) { out = { error: '같은 등급 장비 3개를 골라요' }; return; }
        const eq = new Set(Object.values(lb0.equip || {}).flatMap((s) => [s.w, s.a]).filter(Boolean));
        const list = want.map((g) => findGear(lb0, g));
        if (list.some((it) => !it)) { out = { error: '없는 장비가 있어요' }; return; }
        if (list.some((it) => eq.has(it.id))) { out = { error: '장착 중인 장비는 합성할 수 없어요' }; return; }
        const r0 = list[0].r;
        if (list.some((it) => it.r !== r0)) { out = { error: '같은 등급끼리만 합성돼요' }; return; }
        const r1 = LBR.GEAR_NEXT[r0];
        if (!r1) { out = { error: '전설은 더 합성할 수 없어요' }; return; }
        const fee = freeMaster(u) ? 0 : LBR.GEAR_FUSE_FEE[r1];
        if (lb0.coins < fee) { out = { error: `코인이 부족해요 (${fee.toLocaleString()} 필요)` }; return; }
        const same = list.every((it) => it.t === list[0].t);
        const rng = LBR.seedRng(LBR.hashSeed(`fuse:${uid}:${lb0.gearSeq}:${want.join(',')}`));
        const t = same ? list[0].t : LBR.GEAR_IDS[(rng() * LBR.GEAR_IDS.length) | 0];
        const lv = Math.max(0, Math.max(...list.map((it) => it.lv)) - 2);
        let made = null;
        const stats = await update(uid, (st) => {
          const lb = st.langbang = normLb(st.langbang);
          const set = new Set(want);
          lb.gear = lb.gear.filter((g) => !set.has(g.id));
          lb.coins -= fee;
          made = { id: ++lb.gearSeq, t, r: r1, lv };
          lb.gear.push(made);
          if (r1 === 'legend') lb.cnt.legends = (lb.cnt.legends | 0) + 1;
        });
        out = { profile: lbView(stats.langbang, uid, isMasterName(u.username)), made, fee, same };
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }
  function lbAutoSell(token, on) { return lbGear(token, () => ({ apply: (x) => { x.autoSell = !!on; }, extra: { autoSell: !!on } })); }
  const lbRow = (u, i) => {
    const lb = lbOf(u);
    return { rank: i + 1, nickname: u.nickname, username: u.username, level: lb.level, maxStage: lb.maxStage, stageLabel: lb.maxStage ? LBR.stageLabel(lb.maxStage) : '-', totalStars: lb.totalStars, bestWave: lb.bestWave, bestScore: lb.bestScore, runs: lb.runs, title: lb.title || '', frame: lb.frame || '' };
  };
  /** mode: 'stage' | 'endless'. token 이 있으면 내 순위도 */
  async function lbRanking(n = 50, mode = 'stage', token = null) {
    await ready;
    if (mode === 'endlessWeek') {
      const wi = LIVE ? LIVE.weekIndex(Date.now()) : 0;
      const ranking = (await store.topEndlessWeek(wi, n)).map((u, i) => ({ ...lbRow(u, i), weekBest: ewBestOf(u, wi) }));
      const id0 = token ? verifyToken(token) : null;
      let me0 = null;
      if (id0) { const u = await store.byId(id0); const rank = u ? await store.rankEndlessWeek(wi, id0) : null; if (u && rank) me0 = { ...lbRow(u, rank - 1), weekBest: ewBestOf(u, wi), rank }; }
      return { ranking, me: me0, mode };
    }
    mode = mode === 'endless' ? 'endless' : 'stage';
    const ranking = (await store.topLangbang(n, mode)).map(lbRow);
    let me = null;
    const id = token ? verifyToken(token) : null;
    if (id) {
      const u = await store.byId(id);
      const rank = u ? await store.rankLangbang(mode, id) : null;
      if (u) me = { ...lbRow(u, (rank || 0) - 1), rank };
    }
    return { ranking, me, mode };
  }
  function langbangRouter(express) {
    const r = express.Router();
    r.use(express.json({ limit: '4kb' }));
    const tok = (req) => String(req.headers.authorization || '').replace(/^Bearer /, '');
    const wrap = (fn) => async (req, res) => {
      try { res.json({ ok: true, ...(await fn(req)) }); }
      catch (e) {
        if (e instanceof AuthError) res.status(e.message.includes('로그인') ? 401 : 400).json({ ok: false, message: e.message });
        else { console.error('[langbang]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
      }
    };
    r.get('/me', wrap((req) => lbMe(tok(req))));
    r.post('/result', wrap((req) => lbResult(tok(req), req.body || {})));
    r.post('/upgrade', wrap((req) => lbUpgrade(tok(req), String((req.body || {}).hero || ''))));
    r.post('/buy', wrap((req) => lbBuy(tok(req), String((req.body || {}).item || ''))));
    const gidOf = (v) => (v === null ? null : Math.floor(Number(v)) || -1);
    r.post('/gear/equip', wrap((req) => { const b = req.body || {}; return lbEquip(tok(req), String(b.hero || ''), String(b.slot || ''), gidOf(b.id === undefined ? null : b.id)); }));
    r.post('/gear/enhance', wrap((req) => lbEnhance(tok(req), gidOf((req.body || {}).id))));
    r.post('/gear/sell', wrap((req) => lbSell(tok(req), gidOf((req.body || {}).id))));
    r.post('/gear/sellMany', wrap((req) => lbSellMany(tok(req), (req.body || {}).ids)));
    r.post('/gear/autoSell', wrap((req) => lbAutoSell(tok(req), !!(req.body || {}).on)));
    r.post('/cards/pick', wrap((req) => lbCardPick(tok(req), String((req.body || {}).hero || ''))));
    r.post('/cards/convert', wrap((req) => lbCardConvert(tok(req))));
    r.post('/gear/dismantle', wrap((req) => lbDismantle(tok(req), (req.body || {}).ids)));
    r.post('/gear/fuse', wrap((req) => lbFuse(tok(req), (req.body || {}).ids)));
    r.get('/ranking', wrap(async (req) => lbRanking(50, String(req.query.mode || 'stage'), tok(req) || null)));
    const b = (req) => req.body || {};
    r.post('/gacha', wrap((req) => lbGacha(tok(req), Number(b(req).n) === 10 ? 10 : 1, String(b(req).pay || ''))));
    r.post('/gear-gacha', wrap((req) => lbGearGacha(tok(req), Number(b(req).n) === 10 ? 10 : 1)));
    r.post('/mission/claim', wrap((req) => lbMission(tok(req), String(b(req).kind || ''), String(b(req).id || ''))));
    r.post('/mission/claimAll', wrap((req) => lbLive(tok(req), (lb, id, now) => { const t = ['daily', 'weekly', 'ach'].includes(b(req).tab) ? b(req).tab : 'all'; const r = LIVE.claimAllMissions(lb, t, id, now); return r.n ? r : { error: '받을 보상이 없어요' }; })));
    r.post('/season/claim', wrap((req) => lbSeason(tok(req), b(req).tier === 'all' ? 'all' : Math.floor(Number(b(req).tier) || 0))));
    r.post('/hero/star', wrap((req) => lbStar(tok(req), String(b(req).hero || ''))));
    r.post('/cosmetic', wrap((req) => lbCosmetic(tok(req), b(req).title === undefined ? undefined : String(b(req).title || ''), b(req).frame === undefined ? undefined : String(b(req).frame || ''))));
    r.post('/decks', wrap((req) => lbLive(tok(req), (lb) => { const d = LIVE.cleanDecks(b(req)); if (!d) return { error: '잘못된 덱이에요' }; lb.decks = d; return {}; })));
    r.post('/chest/claim', wrap((req) => lbLive(tok(req), (lb, id, now) => LIVE.claimChest(lb, b(req).ch, b(req).n, id, now))));
    r.post('/checkin', wrap((req) => lbLive(tok(req), (lb, id, now) => LIVE.claimCheckin(lb, id, now))));
    // 체력 · 무한 입장 · 우편함
    r.post('/stage/start', wrap((req) => lbLive(tok(req), (lb, id, now, ctx) => { const st = Math.floor(Number(b(req).stage) || 0); if (st < 1 || st > LBR.STAGE_COUNT) return { error: '없는 스테이지예요' }; return LIVE.stageStart(lb, st, !!b(req).hell, ctx.free, now); }, freeCtx)));
    r.post('/stage/fail', wrap((req) => lbLive(tok(req), (lb, id, now) => LIVE.stageFail(lb, Math.floor(Number(b(req).stage) || 0), now))));
    r.post('/stamina/buy', wrap((req) => lbLive(tok(req), (lb, id, now) => LIVE.staminaBuy(lb, now))));
    r.post('/endless/start', wrap((req) => lbLive(tok(req), (lb, id, now, ctx) => (LBR.endlessUnlocked(lb) || ctx.free ? LIVE.endlessStart(lb, ctx.free, now) : { error: '무한 도전은 1-10을 깨면 열려요' }), freeCtx)));
    r.post('/mail/sync', wrap((req) => lbMailSync(tok(req))));
    r.post('/mail/claim', wrap((req) => lbLive(tok(req), (lb, id, now) => LIVE.mailClaim(lb, b(req).id === 'all' ? 'all' : Math.floor(Number(b(req).id) || 0), id, now))));
    r.post('/weekly/start', wrap((req) => lbWeeklyStart(tok(req))));
    r.post('/weekly/claim', wrap((req) => lbWeeklyClaim(tok(req))));
    r.get('/weekly', wrap((req) => lbWeeklyBoard(tok(req) || null)));
    r.post('/raid/start', wrap((req) => lbRaidStart(tok(req))));
    r.post('/master', wrap((req) => lbMaster(tok(req), req.body || {})));
    r.post('/raid/claim', wrap((req) => lbRaidClaim(tok(req))));
    r.get('/raid', wrap((req) => lbRaidBoard(tok(req) || null)));
    r.get('/pvp/ranking', wrap((req) => lbPvpRanking(tok(req) || null)));
    r.get('/player', wrap((req) => lbPlayer(String(req.query.u || ''))));
    return r;
  }

  async function profile(username) { await ready; return publicUser(await store.byName(String(username || '').toLowerCase())); }
  async function ranking(n = 50) {
    await ready;
    // 마스터(운영자) 계정은 순위에서 뺀다
    return (await store.topOmok(n + 20)).filter((u) => !isMasterName(u.username)).slice(0, n).map((u, i) => ({ rank: i + 1, nickname: u.nickname, username: u.username, rating: u.stats.omok.rating, games: u.stats.omok.games, wins: u.stats.omok.wins, tier: tierOf(u.stats.omok.rating), isMaster: isMasterName(u.username) }));
  }

  // ── 플랫폼(출석·마스터 관리)용 작은 도우미 — 실제 기능은 server/site.js · server/admin.js ──
  // 전적 기록과 같은 줄에 세워서 차례로 처리하고, 결과/오류를 그대로 돌려준다
  function exclusive(fn) {
    let out, err;
    return serial(async () => { try { out = await fn(); } catch (e) { err = e; } }).then(() => { if (err) throw err; return out; });
  }
  // (exclusive 안에서만 부르기) 랑방 코인 더하기/빼기. 0 ~ 10억 사이로 자른다
  async function addLangbangCoins(id, delta) {
    const d = Math.max(-1e6, Math.min(1e6, Math.trunc(Number(delta) || 0)));
    const s = await update(id, (st) => { const lb = st.langbang = normLb(st.langbang); lb.coins = Math.max(0, Math.min(1e9, (lb.coins | 0) + d)); });
    return s ? s.langbang.coins : null;
  }
  /** 마스터가 랑방 코인 지급/회수: 없는 아이디면 null, 아니면 { coins } */
  function adminAdjustLangbangCoins(username, delta) {
    return exclusive(async () => {
      await ready;
      const u = await store.byName(String(username || '').toLowerCase());
      if (!u) return null;
      return { coins: await addLangbangCoins(u.id, delta) };
    });
  }

  // ── HTTP ───────────────────────────────────────────
  const tries = new Map(); // 로그인 시도 제한 (IP당 1분에 8번)
  function limited(ip) {
    const t = Date.now();
    const list = (tries.get(ip) || []).filter((x) => t - x < 60000);
    list.push(t); tries.set(ip, list);
    if (tries.size > 5000) tries.clear();
    return list.length > 8;
  }
  function router(express) {
    const r = express.Router();
    r.use(express.json({ limit: '4kb' }));
    const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    const wrap = (fn) => async (req, res) => {
      try { res.json({ ok: true, ...(await fn(req)) }); }
      catch (e) {
        if (e instanceof AuthError) res.status(400).json({ ok: false, message: e.message });
        else { console.error('[accounts]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
      }
    };
    r.post('/signup', wrap(async (req) => { if (limited(ipOf(req))) throw new AuthError('잠시 후 다시 해 주세요'); return signup(req.body || {}); }));
    r.post('/login', wrap(async (req) => { if (limited(ipOf(req))) throw new AuthError('시도가 너무 많아요. 1분 뒤에 다시 해 주세요'); return login(req.body || {}); }));
    r.get('/me', wrap(async (req) => {
      const u = await me(String(req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!u) throw new AuthError('다시 로그인해 주세요');
      return { user: u };
    }));
    r.get('/profile/:username', wrap(async (req) => { const u = await profile(req.params.username); if (!u) throw new AuthError('없는 사용자예요'); return { user: u }; }));
    r.get('/ranking/omok', wrap(async () => ({ ranking: await ranking(50) })));
    return r;
  }

  return { signup, login, me, verifyToken, recordHand, recordOmok, recordTourney, profile, ranking, router, langbangRouter, lbResult, lbUpgrade, lbBuy, lbMe, lbRanking, ready, tierOf, store,
    // 플랫폼(site.js · admin.js)용
    makeToken, publicUser, noteMeta, exclusive, updateStats: update, addLangbangCoins, adminAdjustLangbangCoins };
}

module.exports = { createAccounts, tierOf, eloDelta, TIERS, AI_RATING, START_RATING, AuthError, normLb, lbCompare, hashPassword, checkPassword, emptyStats };
