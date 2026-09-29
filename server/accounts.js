'use strict';
// 계정·전적·오목 티어.
// 저장소: DATABASE_URL 이 있으면 PostgreSQL(Neon 등), 없으면 JSON 파일(로컬·테스트용).
// 로그인 없이도 게임은 그대로 할 수 있고, 로그인한 사람만 전적이 쌓인다.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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
  };
}

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
  }
  row(r) { return r && { id: r.id, username: r.username, pass: r.pass, nickname: r.nickname, createdAt: Number(r.created_at), stats: r.stats }; }
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
}

class AuthError extends Error {}

function createAccounts({ databaseUrl = process.env.DATABASE_URL, file = null, secret = process.env.AUTH_SECRET } = {}) {
  const store = databaseUrl ? new PgStore(databaseUrl) : new FileStore(file);
  // 토큰 서명 키: AUTH_SECRET → 없으면 DB 주소(비밀)에서 만든다 → 그것도 없으면 이번 실행용(로컬)
  const key = secret
    || (databaseUrl ? crypto.createHash('sha256').update('chandem-auth:' + databaseUrl).digest('hex') : crypto.randomBytes(32).toString('hex'));
  const ready = store.init().catch((e) => { console.error('[accounts] 저장소 준비 실패:', e.message); });

  const sign = (id, exp) => crypto.createHmac('sha256', key).update(`${id}.${exp}`).digest('base64url');
  function makeToken(id) {
    const exp = Date.now() + 90 * 24 * 3600 * 1000; // 90일
    return `${id}.${exp}.${sign(id, exp)}`;
  }
  function verifyToken(token) {
    const [id, exp, sig] = String(token || '').split('.');
    if (!id || !exp || !sig || Number(exp) < Date.now()) return null;
    const want = sign(id, exp);
    if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
    return id;
  }

  const publicUser = (u) => u && {
    id: u.id, username: u.username, nickname: u.nickname, createdAt: u.createdAt, stats: u.stats,
    tier: tierOf(u.stats.omok.rating),
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

  async function profile(username) { await ready; return publicUser(await store.byName(String(username || '').toLowerCase())); }
  async function ranking(n = 50) {
    await ready;
    return (await store.topOmok(n)).map((u, i) => ({ rank: i + 1, nickname: u.nickname, username: u.username, rating: u.stats.omok.rating, games: u.stats.omok.games, wins: u.stats.omok.wins, tier: tierOf(u.stats.omok.rating) }));
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

  return { signup, login, me, verifyToken, recordHand, recordOmok, recordTourney, profile, ranking, router, ready, tierOf, store };
}

module.exports = { createAccounts, tierOf, eloDelta, TIERS, AI_RATING, START_RATING, AuthError };
