'use strict';
// 게임별 등급 · 순위 · 선수 카드: /api/rank/*
//  · 오목: 바둑처럼 18급 … 1급, 초단 … 9단 (Elo 점수로 정함)
//  · 홀덤: 브론즈 칩 → 실버 → 골드 → 플래티넘 → 다이아 → 하이롤러 → 레전드 (실력 점수)
//  · 섯다: 초짜 → 선수 → 꾼 → 고수 → 명인 → 신의 손 (실력 점수)
// 실력 점수 = 판당 칩 득실 + 승률 + 판 수(많이 칠수록 조금 더). 10판 미만은 '배치 중'(데이터 부족).
// 순위는 60초마다 새로 계산해 둔다. 마스터(운영자)는 순위에서 뺀다. 저장소는 accounts.js 의 것을 그대로 읽기만 한다.
const { isMasterName } = require('./masters');

const GAMES = ['holdem', 'seotda', 'omok'];
const MIN_GAMES = 10;
const CACHE_MS = 60 * 1000;

// ── 등급 ─────────────────────────────────────────────
const HOLDEM_TIERS = [
  [82, '레전드', '👑', '#ff5d73'], [74, '하이롤러', '💰', '#ffb347'], [66, '다이아', '💎', '#6fd3ff'],
  [58, '플래티넘', '🛡️', '#4fe0c1'], [50, '골드', '🥇', '#ffd35a'], [40, '실버', '🥈', '#cfd8e3'], [-Infinity, '브론즈 칩', '🥉', '#d59a6a'],
];
const SEOTDA_TIERS = [
  [82, '신의 손', '🖐️', '#ff5d73'], [72, '명인', '🎖️', '#c77dff'], [62, '고수', '🐉', '#ffb347'],
  [52, '꾼', '🎴', '#ffd35a'], [42, '선수', '🃏', '#9fd8ff'], [-Infinity, '초짜', '🌱', '#b5e8a3'],
];
/** 오목 급·단: 600점 아래 18급, 40점마다 한 급씩 → 1280점 1급, 1320점 초단, 60점마다 한 단 → 1800점 9단 */
function omokGrade(rating) {
  const r = Number(rating) || 0;
  if (r >= 1320) {
    const dan = Math.min(9, 1 + Math.floor((r - 1320) / 60));
    return { name: dan === 1 ? '초단' : `${dan}단`, icon: '⚫', color: dan >= 7 ? '#ff5d73' : dan >= 4 ? '#c77dff' : '#ffd35a', level: 18 + dan };
  }
  const kyu = Math.max(1, Math.min(18, 18 - Math.floor((r - 600) / 40)));
  return { name: `${kyu}급`, icon: '⚪', color: kyu <= 5 ? '#6fd3ff' : kyu <= 10 ? '#4fe0c1' : '#cfd8e3', level: 19 - kyu };
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** 홀덤·섯다 실력 점수 (대략 20~95) */
function skillScore(g) {
  const hands = g.hands | 0;
  if (!hands) return 0;
  const perHand = (Number(g.net) || 0) / hands;      // 판당 칩 득실
  const winRate = (g.wins | 0) / hands;
  const volume = clamp(Math.log2(Math.max(1, hands / MIN_GAMES)) * 3, 0, 12);
  return Math.round((50 + clamp(perHand / 5, -30, 30) + (winRate - 0.2) * 50 + volume) * 10) / 10;
}
function gameStats(stats, game) { return (stats && stats[game]) || {}; }
const played = (g, game) => (game === 'omok' ? g.games | 0 : g.hands | 0);
/** 그 게임 등급 (10판 미만이면 null = 배치 중) */
function tierFor(game, stats) {
  const g = gameStats(stats, game);
  if (played(g, game) < MIN_GAMES) return null;
  if (game === 'omok') return omokGrade(g.rating);
  const sc = skillScore(g);
  const t = (game === 'seotda' ? SEOTDA_TIERS : HOLDEM_TIERS).find((x) => sc >= x[0]);
  return { name: t[1], icon: t[2], color: t[3], score: sc };
}
/** 정렬 기준 (큰 값이 위): 배치 끝난 사람 먼저 → 점수 → 판 수 */
function sortKey(game, g) {
  const n = played(g, game);
  const score = game === 'omok' ? Number(g.rating) || 0 : skillScore(g);
  return [n >= MIN_GAMES ? 1 : 0, score, n];
}
function cmp(a, b) { for (let i = 0; i < a.key.length; i++) if (a.key[i] !== b.key[i]) return b.key[i] - a.key[i]; return a.createdAt - b.createdAt; }

/** 선수 카드에 보여 줄 것 (있는 기록만) */
function cardOf(game, u, pos) {
  const g = gameStats(u.stats, game);
  const n = played(g, game);
  const master = isMasterName(u.username);
  const card = {
    nickname: u.nickname, username: u.username, master, game,
    played: n, wins: g.wins | 0, winRate: n ? Math.round(((g.wins | 0) / n) * 1000) / 10 : null,
    enough: n >= MIN_GAMES, need: Math.max(0, MIN_GAMES - n),
    tier: tierFor(game, u.stats), rank: master ? null : pos || null,
    recent: String(g.recent || '').slice(-10),
  };
  if (game === 'omok') Object.assign(card, { rating: g.rating, peak: g.peak, losses: g.losses | 0, draws: g.draws | 0, bestStreak: Math.max(g.bestStreak | 0, g.streak | 0), streak: g.streak | 0 });
  else Object.assign(card, { net: Number(g.net) || 0, bestPot: g.bestPot | 0, bestHand: g.bestHand || null, score: skillScore(g) });
  return card;
}

function createRankings({ acct, rooms, now = Date.now }) {
  const store = acct.store;
  const cache = new Map(); // game → { at, list: [{id, username, nickname, stats, key}], pos: Map(id → 순위) }

  async function allPlayers(game) {
    await acct.ready;
    if (store.pool) {
      const col = game === 'omok' ? 'games' : 'hands';
      const r = await store.pool.query(`SELECT id, username, nickname, created_at, stats FROM users WHERE COALESCE((stats->$1->>$2)::int, 0) > 0 LIMIT 5000`, [game, col]);
      return r.rows.map((x) => ({ id: x.id, username: x.username, nickname: x.nickname, createdAt: Number(x.created_at), stats: x.stats || {} }));
    }
    return Object.values(store.data.users).filter((u) => played(gameStats(u.stats, game), game) > 0)
      .map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, createdAt: u.createdAt, stats: u.stats }));
  }
  async function board(game) {
    const c = cache.get(game);
    if (c && now() - c.at < CACHE_MS) return c;
    const list = (await allPlayers(game)).filter((u) => !isMasterName(u.username))
      .map((u) => ({ ...u, key: sortKey(game, gameStats(u.stats, game)) })).sort(cmp);
    const pos = new Map(list.map((u, i) => [u.id, i + 1]));
    const out = { at: now(), list, pos };
    cache.set(game, out);
    return out;
  }
  const clear = () => cache.clear();

  async function top(game, n = 10, meId = null) {
    const b = await board(game);
    const row = (u, i) => ({ ...cardOf(game, u, i + 1), me: u.id === meId });
    const topList = b.list.slice(0, n).map(row);
    let me = null;
    if (meId && b.pos.has(meId)) { const i = b.pos.get(meId) - 1; me = row(b.list[i], i); }
    return { top: topList, me, total: b.list.length };
  }
  /** 방 안 사람들의 등급·순위 (로그인 안 한 사람은 guest) */
  async function roomRanks(code, game) {
    const room = rooms.get(String(code || '').toUpperCase());
    if (!room) return null;
    const g = GAMES.includes(game) ? game : room.settings.game || 'holdem';
    const b = await board(g);
    const out = {};
    for (const p of room.players) {
      if (p.leaving) continue;
      if (p.isBot || !p.userId) { out[p.id] = { guest: true, bot: !!p.isBot }; continue; }
      const u = await store.byId(p.userId);
      if (!u) { out[p.id] = { guest: true }; continue; }
      const master = isMasterName(u.username);
      out[p.id] = { master, tier: tierFor(g, u.stats), rank: master ? null : b.pos.get(u.id) || null, played: played(gameStats(u.stats, g), g), need: Math.max(0, MIN_GAMES - played(gameStats(u.stats, g), g)) };
    }
    return { game: g, total: b.list.length, ranks: out };
  }
  async function playerCard(game, { code, pid, username }) {
    let u = null;
    if (username) u = await store.byName(String(username).toLowerCase());
    else if (code && pid) {
      const room = rooms.get(String(code).toUpperCase());
      const p = room && room.players.find((x) => x.id === pid);
      if (p && p.userId) u = await store.byId(p.userId);
      if (!u && p) return { guest: true, nickname: p.name, bot: !!p.isBot, game };
    }
    if (!u) return null;
    const b = await board(game);
    return cardOf(game, u, b.pos.get(u.id));
  }

  function router(express) {
    const r = express.Router();
    const wrap = (fn) => async (req, res) => {
      try { res.set('Cache-Control', 'no-store').json({ ok: true, ...(await fn(req)) }); }
      catch (e) { console.error('[rank]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
    };
    const gameOf = (req) => (GAMES.includes(req.params.game) ? req.params.game : null);
    const meOf = (req) => acct.verifyToken(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    r.get('/room/:code', wrap(async (req) => {
      const out = await roomRanks(req.params.code, req.query.game);
      if (!out) return { ranks: {} };
      return out;
    }));
    r.get('/card/:game', wrap(async (req) => {
      const g = gameOf(req);
      if (!g) return { card: null };
      return { card: await playerCard(g, { code: req.query.code, pid: req.query.pid, username: req.query.user }) };
    }));
    r.get('/:game', wrap(async (req) => {
      const g = gameOf(req);
      if (!g) return { top: [], me: null, total: 0 };
      return top(g, Math.min(50, Number(req.query.n) || 10), meOf(req));
    }));
    return r;
  }
  return { router, top, roomRanks, playerCard, board, clear };
}

module.exports = { createRankings, omokGrade, skillScore, tierFor, cardOf, MIN_GAMES, HOLDEM_TIERS, SEOTDA_TIERS };
