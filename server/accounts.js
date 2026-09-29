'use strict';
// 계정·전적·오목 티어.
// 저장소: DATABASE_URL 이 있으면 PostgreSQL(Neon 등), 없으면 JSON 파일(로컬·테스트용).
// 로그인 없이도 게임은 그대로 할 수 있고, 로그인한 사람만 전적이 쌓인다.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { isMasterName } = require('./masters');

// ── 오목 티어 (Elo 점수) ───────────────────────────────
const TIERS = [
  { min: 1800, name: '그랜드마스터', icon: '👑', color: '#ff5d73' },
  { min: 1650, name: '마스터', icon: '🔮', color: '#c77dff' },
  { min: 1500, name: '다이아몬드', icon: '💎', color: '#6fd3ff' },
  { min: 1350, name: '플래티넘', icon: '🛡️', color: '#4fe0c1' },
  { min: 1200, name: '골드', icon: '🥇', color: '#ffd35a' },
  { min: 1050, name: '실버', icon: '🥈', color: '#cfd8e3' },
  { min: 900, name: '브론즈', icon: '🥉', color: '#d59a6a' },
  { min: -Infinity, name: '아이언', icon: '⚙️', color: '#9aa1a8' },
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
    lastResultAt: 0,
  };
}
// 옛 프로필(코인·영웅 강화·최고 웨이브만 있던 시절)도 그대로 읽어서 새 구조로 맞춘다
function normLb(raw) {
  const e = emptyLangbang();
  const lb = { ...e, ...(raw || {}) };
  lb.heroes = { ...e.heroes, ...((raw && raw.heroes) || {}) };
  lb.items = { ...e.items, ...((raw && raw.items) || {}) };
  lb.stages = {};
  for (const [k, v] of Object.entries((raw && raw.stages) || {})) {
    const n = Math.floor(Number(k)), st = Math.max(0, Math.min(3, v | 0));
    if (n >= 1 && n <= LBR.STAGE_COUNT && st > 0) lb.stages[n] = st;
  }
  lb.maxStage = LBR.maxCleared(lb.stages);
  lb.seen = [...new Set(((raw && raw.seen) || []).filter((t) => LBR.ENEMY_IDS.includes(t)))];
  lb.totalStars = Object.values(lb.stages).reduce((a, b) => a + b, 0);
  return lb;
}
const lbExpToNext = (level) => 100 + (level - 1) * 60; // 다음 계정 레벨까지 필요한 경험치
const lbUpgradeCost = LBR.metaCost; // 캐릭터 영구 강화 비용(코인)
// 랭킹 정렬: 스테이지 = 최고 스테이지 → 총 별 → 먼저 도달한 사람 / 무한 도전 = 최고 웨이브 → 최고 점수
const lbOf = (u) => normLb(u.stats && u.stats.langbang);
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
    return Object.values(this.data.users).map((u) => ({ u, lb: lbOf(u) })).filter((x) => lbQualifies(x.lb, mode))
      .sort((a, b) => cmp(a.lb, b.lb)).map((x) => x.u);
  }
  async topLangbang(n, mode = 'stage') { return this.sortedLangbang(mode).slice(0, n); }
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
      ? `SELECT * FROM users WHERE ${PG_LB.bw} > 0 ORDER BY ${PG_LB.bw} DESC, ${PG_LB.bs} DESC LIMIT $1`
      : `SELECT * FROM users WHERE ${PG_LB.ms} > 0 ORDER BY ${PG_LB.ms} DESC, ${PG_LB.ts} DESC, ${PG_LB.sa} ASC LIMIT $1`;
    const r = await this.pool.query(sql, [n]);
    return r.rows.map((x) => this.row(x));
  }
  // 내 순위 = 나보다 앞선 사람 수 + 1 (전체를 읽지 않고 COUNT 한 번)
  async rankLangbang(mode, id) {
    const u = await this.byId(id);
    if (!u) return null;
    const lb = lbOf(u);
    if (!lbQualifies(lb, mode)) return null;
    const r = mode === 'endless'
      ? await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_LB.bw} > $1 OR (${PG_LB.bw} = $1 AND ${PG_LB.bs} > $2)`, [lb.bestWave, lb.bestScore])
      : await this.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_LB.ms} > $1 OR (${PG_LB.ms} = $1 AND ${PG_LB.ts} > $2)
          OR (${PG_LB.ms} = $1 AND ${PG_LB.ts} = $2 AND ${PG_LB.sa} < $3)`, [lb.maxStage, lb.totalStars, lb.stageAt || 0]);
    return r.rows[0].n + 1;
  }
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
  const ready = store.init().then(warmMeta).catch((e) => { console.error('[accounts] 저장소 준비 실패:', e.message); });

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
  function recordHand(game, players, pot) {
    return serial(async () => {
      for (const p of players) {
        if (!p.userId) continue;
        await update(p.userId, (s) => {
          const g = s[game];
          g.hands++; if (p.won) g.wins++;
          g.net += p.delta;
          if (p.won && pot > g.bestPot) g.bestPot = pot;
          if (p.won && p.handName && (g.bestHandRank || -1) < (p.handRank || 0)) { g.bestHand = p.handName; g.bestHandRank = p.handRank || 0; }
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
  const lbView = (raw) => {
    const lb = normLb(raw);
    const view = { ...lb, expToNext: lbExpToNext(lb.level), maxMeta: LB_MAX_META };
    view.costs = Object.fromEntries(LB_HEROES.map((h) => [h, lb.heroes[h] >= LB_MAX_META ? null : lbUpgradeCost(lb.heroes[h] || 0)]));
    view.itemCosts = Object.fromEntries(LBR.ITEM_IDS.map((i) => [i, LBR.itemCost(i, lb.items[i] || 0)]));
    view.unlocked = LBR.LOCKED.filter((h) => LBR.heroUnlocked(lb, h));
    view.endlessUnlocked = LBR.endlessUnlocked(lb);
    delete view.lastResultAt;
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
    return { profile: lbView(u.stats.langbang), nickname: u.nickname };
  }
  // 코인은 클라이언트가 보낸 값을 믿지 않는다: 스테이지·별·첫 클리어 여부(서버 기록)로 서버가 계산
  const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
  const bad = () => new AuthError('기록을 확인할 수 없어요');
  /** 한 판 결과 저장. mode 'stage' = 스테이지 클리어, 'endless' = 무한 도전. 말이 안 되는 기록은 거절(조작 방지) */
  function lbResult(token, body) {
    return (async () => {
      const id = await userFromToken(token);
      const mode = body.mode === 'stage' ? 'stage' : 'endless';
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
        if (score > (LBR.STAGE_WAVES + 1) * 50000 || kills > (LBR.STAGE_WAVES + 1) * 400) throw bad();
      } else {
        wave = int(body.wave, 999);
        if (score > (wave + 1) * 50000 || kills > (wave + 1) * 400) throw bad();
        if (wave >= 3 && dur < wave * 8) throw bad();
      }
      let out = null;
      await serial(async () => {
        const u = await store.byId(id);
        if (!u) return;
        const before = normLb(u.stats.langbang);
        if (Date.now() - (before.lastResultAt || 0) < 10000) { out = { error: '너무 자주 저장하고 있어요' }; return; }
        if (mode === 'stage' && stage > before.maxStage + 1) { out = { error: '아직 열리지 않은 스테이지예요' }; return; }
        if (mode === 'endless' && !LBR.endlessUnlocked(before)) { out = { error: '무한 도전은 1-10을 깨면 열려요' }; return; }
        const prevStars = mode === 'stage' ? before.stages[stage] || 0 : 0;
        const reward = mode === 'stage' ? LBR.stageReward(stage, stars, prevStars, before.items.coupon) : { total: LBR.endlessReward(wave, before.items.coupon) };
        const stats = await update(id, (s) => {
          const lb = s.langbang = normLb(s.langbang);
          lb.runs++; lb.kills += kills; lb.coins += reward.total;
          // 도감: 이번 판에 만난 진상 (있는 이름만)
          if (Array.isArray(body.seen)) lb.seen = [...new Set([...lb.seen, ...body.seen.slice(0, 40).map(String).filter((t) => LBR.ENEMY_IDS.includes(t))])];
          if (mode === 'stage') {
            lb.clears++;
            lb.stages[stage] = Math.max(prevStars, stars);
            const max = LBR.maxCleared(lb.stages);
            if (max > before.maxStage) lb.stageAt = Date.now();
            lb.maxStage = max;
            lb.totalStars = Object.values(lb.stages).reduce((a, b) => a + b, 0);
            lb.exp += Math.floor(score / 60) + 40;
          } else {
            lb.endlessRuns++;
            lb.bestWave = Math.max(lb.bestWave, wave);
            lb.bestScore = Math.max(lb.bestScore, score);
            lb.exp += Math.floor(score / 60) + wave * 8;
          }
          while (lb.exp >= lbExpToNext(lb.level)) { lb.exp -= lbExpToNext(lb.level); lb.level++; }
          lb.lastResultAt = Date.now();
        });
        const lb = stats.langbang;
        const first = mode === 'stage' && !prevStars;
        out = {
          profile: lbView(lb), reward: { ...reward, firstClear: first, stage, stars },
          levelUp: lb.level > before.level, rank: await store.rankLangbang(mode, id),
          unlockedHeroes: first ? Object.keys(LBR.HERO_UNLOCK).filter((h) => LBR.HERO_UNLOCK[h] === stage && !LBR.heroUnlocked(before, h)) : [],
          endlessUnlocked: first && !LBR.endlessUnlocked(before) && LBR.endlessUnlocked(lb),
          newBestWave: mode === 'endless' && wave > before.bestWave, newBestScore: mode === 'endless' && score > before.bestScore,
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
        const lb0 = normLb(u.stats.langbang);
        const r = check(lb0);
        if (r.error) { out = r; return; }
        if (lb0.coins < r.cost) { out = { error: `코인이 부족해요 (${r.cost.toLocaleString()} 필요)` }; return; }
        const stats = await update(id, (s) => {
          const lb = s.langbang = normLb(s.langbang);
          lb.coins -= r.cost;
          r.apply(lb);
        });
        out = { profile: lbView(stats.langbang) };
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
      if (lvl >= LB_MAX_META) return { error: '이미 최대로 강화했어요' };
      return { cost: lbUpgradeCost(lvl), apply: (x) => { x.heroes[hero] = lvl + 1; } };
    });
  }
  /** 코인으로 아이템 사기 (레벨제) */
  function lbBuy(token, item) {
    if (!LBR.ITEM_IDS.includes(item)) return Promise.reject(new AuthError('없는 아이템이에요'));
    return lbSpend(token, (lb) => {
      const lvl = lb.items[item] || 0;
      const cost = LBR.itemCost(item, lvl);
      if (cost === null) return { error: '이미 최대 레벨이에요' };
      return { cost, apply: (x) => { x.items[item] = lvl + 1; } };
    });
  }
  const lbRow = (u, i) => {
    const lb = lbOf(u);
    return { rank: i + 1, nickname: u.nickname, username: u.username, level: lb.level, maxStage: lb.maxStage, stageLabel: lb.maxStage ? LBR.stageLabel(lb.maxStage) : '-', totalStars: lb.totalStars, bestWave: lb.bestWave, bestScore: lb.bestScore, runs: lb.runs };
  };
  /** mode: 'stage' | 'endless'. token 이 있으면 내 순위도 */
  async function lbRanking(n = 50, mode = 'stage', token = null) {
    await ready;
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
    r.get('/ranking', wrap(async (req) => lbRanking(50, String(req.query.mode || 'stage'), tok(req) || null)));
    return r;
  }

  async function profile(username) { await ready; return publicUser(await store.byName(String(username || '').toLowerCase())); }
  async function ranking(n = 50) {
    await ready;
    return (await store.topOmok(n)).map((u, i) => ({ rank: i + 1, nickname: u.nickname, username: u.username, rating: u.stats.omok.rating, games: u.stats.omok.games, wins: u.stats.omok.wins, tier: tierOf(u.stats.omok.rating), isMaster: isMasterName(u.username) }));
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
