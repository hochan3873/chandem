'use strict';
// 랑방 대전 — 할로윈 이벤트 「할로윈 저주의 밤」 서버 길 (/api/langbang/hw*)
//  스테이지 · 출전 제한 · 저주 점수 · 사탕 · 상점 공식은 화면과 같은 파일(public/langbang/hw-event.js)을 그대로 쓴다 (손님도 같은 함수)
//  서버가 믿는 것: 판 번호(시작할 때 서버가 줌) · 스테이지 · 덱 (규칙 확인) · 저주 (시작할 때 고정) · 걸린 시간 · 처치 수 상한 — 점수 · 보상은 서버가 계산
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

let H = null;
const hwReady = import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'hw-event.js')).href)
  .then((m) => { H = m; }).catch((e) => console.error('[langbang] hw-event.js 불러오기 실패:', e.message));

// 이벤트 점수 (jsonb): 올해 이벤트(id)일 때만
const PG_HW = `(CASE WHEN stats->'langbang'->'hw'->>'id' = $1 THEN COALESCE((stats->'langbang'->'hw'->>'score')::bigint, 0) ELSE 0 END)`;
const hwOf = (u) => { const h = (((u.stats || {}).langbang || {}).hw) || {}; return h.id === (H && H.HW.id) ? h : null; };
const scoreOf = (u) => { const h = hwOf(u); return h ? h.score | 0 : 0; };

module.exports = function hwRoutes(r, ctx) {
  const { store, lbLive, verifyToken, isMasterName, masterList, wrap, tok, normLb } = ctx;
  const b = (req) => req.body || {};
  const ready = () => hwReady;
  const masters = () => [...masterList()];
  async function top(n) {
    if (store.pool) return (await store.pool.query(`SELECT * FROM users WHERE ${PG_HW} > 0 AND NOT (username = ANY($3::text[])) ORDER BY ${PG_HW} DESC, (stats->'langbang'->'hw'->>'at')::bigint ASC LIMIT $2`, [H.HW.id, n, masters()])).rows.map((x) => store.row(x));
    return Object.values(store.data.users).filter((u) => !isMasterName(u.username) && scoreOf(u) > 0).sort((a, c) => scoreOf(c) - scoreOf(a) || ((hwOf(a) || {}).at || 0) - ((hwOf(c) || {}).at || 0)).slice(0, n);
  }
  async function rankOf(id) {
    const u = await store.byId(id);
    const sc = u ? scoreOf(u) : 0;
    if (!sc) return null;
    if (store.pool) return (await store.pool.query(`SELECT COUNT(*)::int AS n FROM users WHERE ${PG_HW} > $2 AND NOT (username = ANY($3::text[]))`, [H.HW.id, sc, masters()])).rows[0].n + 1;
    return Object.values(store.data.users).filter((x) => !isMasterName(x.username) && scoreOf(x) > sc).length + 1;
  }
  const rid = async () => ({ rid: crypto.randomBytes(9).toString('base64url') });

  // 시작: 시즌 · 스테이지 · 덱(출전 제한) · 저주 확인 → 판 번호
  r.post('/hw/start', wrap(async (req) => {
    await ready();
    const body = { n: Math.floor(Number(b(req).n) || 0), deck: Array.isArray(b(req).deck) ? b(req).deck.slice(0, 8).map(String) : [], rent: b(req).rent ? String(b(req).rent) : null, curses: Array.isArray(b(req).curses) ? b(req).curses.slice(0, 20).map(String) : [] };
    return lbLive(tok(req), (lb, id, now, c) => H.hwStart(lb, body, c.rid, now), rid);
  }));
  // 끝: 판 번호 · 시간 · 처치 수 확인 → 점수 · 사탕 (서버 계산)
  r.post('/hw/finish', wrap(async (req) => {
    await ready();
    const body = { runId: String(b(req).runId || '').slice(0, 32), clear: b(req).clear === true, durationSec: Number(b(req).durationSec) || 0, kills: Number(b(req).kills) || 0, door: Number(b(req).door) || 0, skills: Number(b(req).skills) || 0 };
    return lbLive(tok(req), (lb, id, now) => H.hwFinish(lb, body, id, now));
  }));
  // 사탕 상점 · 의상 입기
  r.post('/hw/shop', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb, id, now) => H.shopBuy(lb, String(b(req).id || ''), id, now)); }));
  r.post('/hw/wear', wrap(async (req) => { await ready(); return lbLive(tok(req), (lb) => H.wearSkin(lb, String(b(req).hero || ''), b(req).id ? String(b(req).id) : null)); }));
  // 이벤트 랭킹 (TOP 30 · 내 순위) — 기간이 끝난 뒤 순위 보상
  r.get('/hw', wrap(async (req) => {
    await ready();
    const row = (u, i) => { const lb = normLb(u.stats && u.stats.langbang); const h = lb.hw || {}; const best = h.best || {}; return { rank: i + 1, nickname: u.nickname, username: u.username, score: h.score | 0, heat: Object.values(best).reduce((a, x) => a + (x.heat | 0), 0), cleared: Object.keys(best).length, title: lb.title || '', frame: lb.frame || '' }; };
    const list = (await top(30)).map(row);
    let me = null;
    const id = tok(req) ? verifyToken(tok(req)) : null;
    if (id) { const u = await store.byId(id); if (u) { const h = hwOf(u) || {}; me = { rank: await rankOf(id), score: h.score | 0, paid: !!h.paid }; } }
    return { id: H.HW.id, season: H.hwSeason(), top: list, me };
  }));
  // 순위 보상: 시즌이 끝난 뒤 한 번 (순위는 서버가 센다)
  r.post('/hw/claim', wrap(async (req) => {
    await ready();
    return lbLive(tok(req), (lb, id, now, c) => {
      if (H.hwSeason(now)) return { error: '이벤트가 끝나면 받을 수 있어요' };
      const h = lb.hw;
      if (!h || h.id !== H.HW.id || !(h.score > 0)) return { error: '이벤트 기록이 없어요' };
      if (h.paid) return { error: '이미 받았어요' };
      const rw = H.rankReward(c.rank);
      if (!rw) return { error: '순위를 확인할 수 없어요' };
      h.paid = true;
      const L = ctx.live();
      const got = L ? L.grant(lb, { tickets: rw.tickets, stones: rw.stones, title: rw.title }, id, now) : {};
      return { got, rank: c.rank, label: rw.label };
    }, async (u, id) => ({ rank: await rankOf(id) }));
  }));
};
module.exports.hwReady = hwReady;
module.exports.getHw = () => H;
