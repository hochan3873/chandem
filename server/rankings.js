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
  [82, '레전드', 'crown', '#ff5d73'], [74, '하이롤러', 'coin', '#ffb347'], [66, '다이아', 'trophy', '#6fd3ff'],
  [58, '플래티넘', 'trophy', '#4fe0c1'], [50, '골드', 'trophy', '#ffd35a'], [40, '실버', 'spade', '#cfd8e3'], [-Infinity, '브론즈 칩', 'coin', '#d59a6a'],
];
const SEOTDA_TIERS = [
  [82, '신의 손', 'crown', '#ff5d73'], [72, '명인', 'trophy', '#c77dff'], [62, '고수', 'trophy', '#ffb347'],
  [52, '꾼', 'hwatu', '#ffd35a'], [42, '선수', 'cards', '#9fd8ff'], [-Infinity, '초짜', 'coin', '#b5e8a3'],
];
/** 오목 급·단: 600점 아래 18급, 40점마다 한 급씩 → 1280점 1급, 1320점 초단, 60점마다 한 단 → 1800점 9단 */
function omokGrade(rating) {
  const r = Number(rating) || 0;
  if (r >= 1320) {
    const dan = Math.min(9, 1 + Math.floor((r - 1320) / 60));
    return { name: dan === 1 ? '초단' : `${dan}단`, icon: 'omok', color: dan >= 7 ? '#ff5d73' : dan >= 4 ? '#c77dff' : '#ffd35a', level: 18 + dan };
  }
  const kyu = Math.max(1, Math.min(18, 18 - Math.floor((r - 600) / 40)));
  return { name: `${kyu}급`, icon: 'omok', color: kyu <= 5 ? '#6fd3ff' : kyu <= 10 ? '#4fe0c1' : '#cfd8e3', level: 19 - kyu };
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
// 순위에 쓰는 기록: 홀덤·섯다는 AI 연습 판(practice)을 뺀 값 (오목은 AI 대국도 점수가 정해져 있어 그대로)
function gameStats(stats, game) {
  const g = (stats && stats[game]) || {};
  if (game === 'omok' || !g.practice) return g;
  const pr = g.practice;
  return { ...g, hands: Math.max(0, (g.hands | 0) - (pr.hands | 0)), wins: Math.max(0, (g.wins | 0) - (pr.wins | 0)), net: (Number(g.net) || 0) - (Number(pr.net) || 0) };
}
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
    played: n, wins: g.wins | 0, winRate: n ? Math.min(100, Math.round(((g.wins | 0) / n) * 1000) / 10) : null,
    enough: n >= MIN_GAMES, need: Math.max(0, MIN_GAMES - n),
    tier: tierFor(game, u.stats), rank: master || n < MIN_GAMES ? null : pos || null, // 배치 중(10판 미만)은 순위 '-'
    practice: game === 'omok' ? 0 : ((u.stats && u.stats[game] && u.stats[game].practice) || {}).hands | 0,
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
    return Object.values(store.data.users).filter((u) => played((u.stats && u.stats[game]) || {}, game) > 0) // 연습 판 포함 (순위는 board 에서 거름)
      .map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, createdAt: u.createdAt, stats: u.stats }));
  }
  async function board(game) {
    const c = cache.get(game);
    if (c && now() - c.at < CACHE_MS) return c;
    const list = (await allPlayers(game)).filter((u) => !isMasterName(u.username) && played(gameStats(u.stats, game), game) > 0)
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
    let me = null, meMaster = false;
    if (meId && b.pos.has(meId)) { const i = b.pos.get(meId) - 1; me = row(b.list[i], i); }
    else if (meId) { const u = await store.byId(meId); meMaster = !!(u && isMasterName(u.username)); }
    // 혹시 목록에 마스터가 섞여 있어도(예전 기록·설정 변경) 내보내기 직전에 한 번 더 거른다
    return { top: topList.filter((x) => !x.master), me: me && !me.master ? me : null, meMaster, total: b.list.length, ranked: b.list.filter((u) => u.key[0] === 1).length };
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
      const tr = tierFor(g, u.stats);
      out[p.id] = { master, tier: tr, rank: master || !tr ? null : b.pos.get(u.id) || null, played: played(gameStats(u.stats, g), g), need: Math.max(0, MIN_GAMES - played(gameStats(u.stats, g), g)) };
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

  /** 기록 현황 (이름 없이 숫자만): 게임별로 기록 있는 사람 · 10판 넘은 사람 · 연습만 한 사람 · 마스터 */
  async function counts() {
    const out = {};
    for (const g of GAMES) {
      const all = await allPlayers(g);
      const c = { players: 0, ranked: 0, practiceOnly: 0, masters: 0 };
      for (const u of all) {
        if (isMasterName(u.username)) { c.masters++; continue; }
        const n = played(gameStats(u.stats, g), g);
        if (n <= 0) { c.practiceOnly++; continue; }
        c.players++; if (n >= MIN_GAMES) c.ranked++;
      }
      out[g] = c;
    }
    return out;
  }

  function router(express) {
    const r = express.Router();
    const wrap = (fn) => async (req, res) => {
      try { res.set('Cache-Control', 'no-store').json({ ok: true, ...(await fn(req)) }); }
      catch (e) { console.error('[rank]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
    };
    const gameOf = (req) => (GAMES.includes(req.params.game) ? req.params.game : null);
    const meOf = (req) => acct.verifyToken(String(req.headers.authorization || '').replace(/^Bearer /, ''));
    r.get('/counts', wrap(async () => ({ counts: await counts() })));
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
  return { router, top, roomRanks, playerCard, board, clear, counts };
}

module.exports = { createRankings, omokGrade, skillScore, tierFor, cardOf, MIN_GAMES, HOLDEM_TIERS, SEOTDA_TIERS };
