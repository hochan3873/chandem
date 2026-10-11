'use strict';
// 랑방 대전 — 시즌 랭킹 보상 서버 길 (/api/langbang/srank) · 공식은 public/langbang/srank.js (화면과 같은 파일)
//  순위는 서버가 센다: 그 시즌에 들어온 사람(lb.sr · lb.srPrev)의 그 시즌 기록으로 · 지난 시즌 순위는 얼어 있어서 한 번 세면 계속 같다
//  보상은 우편함 동기화(/mail/sync) 때 한 번만 (lb.srPaid = 받은 시즌) — 두 번 불러도 두 번 안 준다
const path = require('path');
const { pathToFileURL } = require('url');

let S = null;
const srReady = import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'srank.js')).href)
  .then((m) => { S = m; }).catch((e) => console.error('[langbang] srank.js 불러오기 실패:', e.message));

function createSeasonRank({ store, isMasterName, normLb, verifyToken, LIVE }) {
  const cache = new Map(); // 시즌 → { at, boards } (지난 시즌은 계속 · 이번 시즌은 1분)
  async function boards(sid, now) {
    const cur = sid >= LIVE().seasonOf(LIVE().weekIndex(now));
    const c = cache.get(sid);
    if (c && (!cur || now - c.at < 60e3)) return c.boards;
    const rows = (await store.seasonRows(sid)).filter((u) => !isMasterName(u.username)).map((u) => ({ id: u.id, lb: normLb(u.stats && u.stats.langbang) }));
    const b = S.srBoards(rows, sid);
    cache.set(sid, { at: now, boards: b });
    if (cache.size > 6) cache.delete(cache.keys().next().value);
    return b;
  }
  // 우편함 동기화 전에: 지난 시즌 보상을 아직 안 받았으면 내 순위 (서버가 센 값)
  async function mailPrep(u, id, now) {
    await srReady;
    if (!S || !LIVE()) return {};
    const sid = LIVE().seasonOf(LIVE().weekIndex(now)) - 1;
    const lb0 = (u.stats && u.stats.langbang) || {};
    if (sid < S.SR_FIRST || (lb0.srPaid | 0) >= sid || isMasterName(u.username)) return {};
    return { sr: { sid, ranks: S.srMine(await boards(sid, now), id) } };
  }
  function mailSettle(lb, id, now, ctx) {
    if (!S || !ctx || !ctx.sr) return 0;
    return S.srSettle(lb, ctx.sr, now);
  }
  // 랭킹 화면: 이번 시즌 남은 시간 · 내 지금 순위 (표마다) · 지난 시즌 내 순위
  async function view(token, now = Date.now()) {
    await srReady;
    const t = S.srNow(now);
    const cur = await boards(t.sid, now);
    const out = { sid: t.sid, end: t.end, left: t.left, n: Object.fromEntries(S.SR_BOARD_IDS.map((b) => [b, cur[b].n])), me: null, last: null };
    const id = token ? verifyToken(token) : null;
    if (id) {
      out.me = S.srMine(cur, id);
      if (t.sid - 1 >= S.SR_FIRST) { const u = await store.byId(id); out.last = { sid: t.sid - 1, ranks: S.srMine(await boards(t.sid - 1, now), id), paid: !!u && ((((u.stats || {}).langbang || {}).srPaid | 0) >= t.sid - 1) }; }
    }
    return out;
  }
  function mount(r, wrap, tok) { r.get('/srank', wrap((req) => view(tok(req) || null))); }
  return { mailPrep, mailSettle, view, mount, boards, _cache: cache };
}
module.exports = { createSeasonRank, srReady, getSr: () => S };
