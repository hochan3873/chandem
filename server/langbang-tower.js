'use strict';
// 랑방 대전 — 진상의 탑 서버 길 (/api/langbang/tower*)
//  층 · 보상 · 하루 도전 · 각성 · 염화석 상점 공식은 화면과 같은 파일(public/langbang/tower.js)을 그대로 쓴다 (손님도 같은 함수)
//  서버가 믿는 것: 판 번호(시작할 때 서버가 줌) · 층(최고 +1 까지) · 걸린 시간 · 처치 수 상한 — 보상은 서버가 계산
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let T = null;
const towerReady = import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'tower.js')).href)
  .then((m) => { T = m; }).catch((e) => console.error('[langbang] tower.js 불러오기 실패:', e.message));

// 주간 탑 점수 (jsonb): 그 주(wi) 최고 층 × 100만 − 걸린 초 (이번 주 wk 또는 지난주로 밀린 wkPrev)
const PG_TW = `(CASE WHEN (stats->'langbang'->'tower'->'wk'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'tower'->'wk'->>'f')::bigint, 0) * 1000000 - COALESCE((stats->'langbang'->'tower'->'wk'->>'sec')::bigint, 0)
  WHEN (stats->'langbang'->'tower'->'wkPrev'->>'wi')::int = $1 THEN COALESCE((stats->'langbang'->'tower'->'wkPrev'->>'f')::bigint, 0) * 1000000 - COALESCE((stats->'langbang'->'tower'->'wkPrev'->>'sec')::bigint, 0) ELSE 0 END)`;
const PG_HALL = `COALESCE((stats->'langbang'->'tower'->'hall'->>'at')::bigint, 0)`;
function weekEntryOf(u, wi) {
  const t = (((u.stats || {}).langbang || {}).tower) || {};
  const e = t.wk && t.wk.wi === wi ? t.wk : t.wkPrev && t.wkPrev.wi === wi ? t.wkPrev : null;
  return e && e.f > 0 ? e : null;
}
const scoreOf = (e) => (e ? (e.f | 0) * 1e6 - Math.min(999999, e.sec | 0) : 0);

module.exports = function towerRoutes(r, ctx) {
  const { store, lbLive, verifyToken, freeMaster, isMasterName, masterList, wrap, tok, normLb } = ctx;
  const b = (req) => req.body || {};
  const ready = () => towerReady;
  const masters = () => [...masterList()];
  // ── 순위 (파일 저장소 · Postgres 둘 다) ──
  async function weekTop(wi, n) {
    if (store.pool) return (await store.pool.query(`SELECT * FROM users WHERE ${PG_TW} > 0 AND NOT (username = ANY($3::text[])) ORDER BY ${PG_TW} DESC LIMIT $2`, [wi, n, masters()])).rows.map((x) => store.row(x));
    return Object.values(store.data.users).filter((u) => !isMasterName(u.username) && weekEntryOf(u, wi)).sort((a, c) => scoreOf(weekEntryOf(c, wi)) - scoreOf(weekEntryOf(a, wi))).slice(0, n);
  }
  async function weekRank(wi, id) {
    const u = await store.byId(id);
    const e = u ? weekEntryOf(u, wi) : null;
    if (!e) return null;
    const sc = scoreOf(e);
    if (store.pool) return (await store.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_TW} > $2 AND NOT (username = ANY($3::text[]))`, [wi, sc, masters()])).rows[0].n + 1;
    return Object.values(store.data.users).filter((x) => !isMasterName(x.username) && scoreOf(weekEntryOf(x, wi)) > sc).length + 1;
  }
  async function hallList(n) {
    if (store.pool) return (await store.pool.query(`SELECT * FROM users WHERE ${PG_HALL} > 0 AND NOT (username = ANY($2::text[])) ORDER BY ${PG_HALL} ASC LIMIT $1`, [n, masters()])).rows.map((x) => store.row(x));
    return Object.values(store.data.users).filter((u) => !isMasterName(u.username) && (((u.stats || {}).langbang || {}).tower || {}).hall).sort((a, c) => a.stats.langbang.tower.hall.at - c.stats.langbang.tower.hall.at).slice(0, n);
  }
  const towerOf = (u) => normLb(u.stats && u.stats.langbang).tower || {};
  const rid = async (u) => ({ rid: crypto.randomBytes(9).toString('base64url'), free: freeMaster(u) });
  const freeCtx = async (u) => ({ free: freeMaster(u) });

  // 시작: 층 · 멤버 확인 · 도전 1번 · 판 번호
  r.post('/tower/start', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb, id, now, c) => T.towerStart(lb, Math.floor(Number(b(req).f) || 0), String(b(req).hero || ''), c.rid, now, c.free), rid); }));
  // 끝: 판 번호 · 시간 · 처치 수 확인 → 처음 깬 층만 보상 (서버 계산)
  r.post('/tower/finish', wrap(async (req) => {
    await ready();
    const body = { runId: String(b(req).runId || '').slice(0, 32), clear: b(req).clear === true, durationSec: Number(b(req).durationSec) || 0, kills: Number(b(req).kills) || 0, bossKills: Number(b(req).bossKills) || 0, skills: Number(b(req).skills) || 0 };
    let who = null;
    const out = await lbLive(tok(req), (lb, id, now, c) => { who = id; return T.towerFinish(lb, body, id, now, c.free); }, freeCtx);
    if (out && out.clear && who && ctx.onRun) out.bonkae = await ctx.onRun(who, [out.hero], 'tower', { f: out.f }); // 본캐 출연료 (데려간 멤버 = 시작할 때 서버가 확인한 한 명)
    return out;
  }));
  // 주간 랭킹 · 지난주 내 순위 · 명예의 전당
  r.get('/tower', wrap(async (req) => {
    await ready();
    const now = Date.now();
    const L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
    const wi = L.weekIndex(now);
    const row = (u, i) => { const lb = normLb(u.stats && u.stats.langbang); const e = weekEntryOf(u, wi) || {}; return { rank: i + 1, nickname: u.nickname, username: u.username, f: e.f | 0, sec: e.sec | 0, hero: e.hero || 'bangjang', title: lb.title || '', frame: lb.frame || '' }; };
    const top = (await weekTop(wi, 30)).map(row);
    const hall = (await hallList(50)).map((u) => { const t = towerOf(u); return { nickname: u.nickname, username: u.username, hero: (t.hall && t.hall.hero) || 'bangjang', at: (t.hall && t.hall.at) || 0 }; });
    let me = null, prev = null;
    const id = tok(req) ? verifyToken(tok(req)) : null;
    if (id) {
      const u = await store.byId(id);
      if (u) {
        const t = towerOf(u);
        me = { rank: await weekRank(wi, id), best: t.best | 0 };
        const pe = weekEntryOf(u, wi - 1);
        if (pe) { const pr = await weekRank(wi - 1, id); prev = { wi: wi - 1, f: pe.f, rank: pr, reward: T.weekReward(pr), claimed: t.wkPaid === wi - 1 }; }
      }
    }
    return { wi, top, hall, me, prev };
  }));
  // 지난주 순위 보상 (순위는 서버가 센다)
  r.post('/tower/claim', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb, id, now, c) => T.weekClaim(lb, c.rank, id, now), async (u, id, now) => { const L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href); return { rank: await weekRank(L.weekIndex(now) - 1, id) }; }); }));
  // 염화석 상점 · 지옥 세트 · 선택권
  r.post('/tower/shop', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb, id, now) => T.shopBuy(lb, String(b(req).id || ''), now)); }));
  r.post('/tower/hell/up', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb) => T.hellUp(lb, String(b(req).id || ''))); }));
  r.post('/tower/hell/equip', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb) => T.hellEquip(lb, String(b(req).id || ''), b(req).hero ? String(b(req).hero) : null)); }));
  r.post('/tower/pick/gear', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb) => T.pickLegendGear(lb, String(b(req).type || ''))); }));
  r.post('/tower/pick/hero', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb) => T.pickLegendHero(lb, String(b(req).hero || ''))); }));
};
module.exports.towerReady = towerReady;
module.exports.getTower = () => T;
