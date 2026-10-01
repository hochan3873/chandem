'use strict';
// 랑방 대전 본캐 (/api/langbang/bonkae*)
//  - 본캐 정하기(먼저 온 사람 · 멤버마다 한 계정) · 내려놓기 · 30일에 한 번 바꾸기 · 마스터가 지정/해제
//  - 출연료: 다른 사람이 내 본캐를 데리고 깨면 서버가 계산 (스테이지 · 탑 · 레이드 · 1:1 승리 · 주간 · 무한) → 반나절마다 우편 정산
//  - 주간 인기 멤버 순위 · 숨은 보석(아래 1/3 +50%) · 지난주 1위 = "이번 주 인기 스타"
// 공식은 화면과 같은 파일(public/langbang/bonkae.js). 두 사람 기록을 고치는 일은 전적 기록과 같은 줄(serial)에서 차례로.
const path = require('path');
const { pathToFileURL } = require('url');

let BK = null;
const bkReady = import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'bonkae.js')).href)
  .then((m) => { BK = m; }).catch((e) => console.error('[langbang] bonkae.js 불러오기 실패:', e.message));

function createBonkae(d) {
  const { store, update, exclusive, lbLive, verifyToken, userFromToken, lbView, normLb, isMasterName, freeMaster, AuthError } = d;
  const L = () => d.LIVE();

  // ── 모두의 본캐 · 주간 출전 기록 (친구끼리라 사람 수가 적다 → 한 번에 읽고 30초 캐시) ──
  let cache = { at: 0, rows: null };
  async function rows(fresh = false) {
    if (!fresh && cache.rows && Date.now() - cache.at < 30e3) return cache.rows;
    let list;
    if (store.pool) {
      const r = await store.pool.query(`SELECT id, username, nickname, meta, stats->'langbang'->'bk' AS bk, stats->'langbang'->'bku' AS bku, stats->'langbang'->'bkuPrev' AS bkup
        FROM users WHERE (stats->'langbang') ?| array['bk','bku','bkuPrev']`);
      list = r.rows.map((x) => ({ id: x.id, username: x.username, nickname: x.nickname, gone: !!(x.meta && x.meta.deleted), bk: x.bk || null, raw: { bku: x.bku, bkuPrev: x.bkup } }));
    } else {
      list = Object.values(store.data.users).map((u) => { const lb = (u.stats && u.stats.langbang) || {}; return { id: u.id, username: u.username, nickname: u.nickname, gone: !!(u.meta && u.meta.deleted), bk: lb.bk || null, raw: { bku: lb.bku, bkuPrev: lb.bkuPrev } }; });
    }
    cache = { at: Date.now(), rows: list };
    return list;
  }
  const forget = () => { cache.at = 0; };
  // 멤버 → 본캐 주인 (혹시 둘이 겹치면 먼저 정한 사람)
  async function owners(fresh = false) {
    const m = new Map();
    for (const r of await rows(fresh)) {
      const h = r.bk && r.bk.hero;
      if (r.gone || !BK.isBkHero(h)) continue;
      const at = Number(r.bk.at) || 0, cur = m.get(h);
      if (!cur || at < cur.at) m.set(h, { id: r.id, nickname: r.nickname, username: r.username, at, by: r.bk.by === 'master' ? 'master' : '' });
    }
    return m;
  }
  // 이번 주 · 지난주 순위 · 숨은 보석 (지난주 기록이 있으면 지난주 기준, 없으면 이번 주)
  async function pop(now = Date.now(), fresh = false) {
    const list = await rows(fresh);
    const raws = list.filter((r) => !r.gone).map((r) => r.raw);
    const wi = L().weekIndex(now);
    const cur = BK.popRank(raws, wi), prev = BK.popRank(raws, wi - 1);
    const basis = prev.some((r) => r.players > 0) ? prev : cur;
    return { wi, cur, prev, gems: BK.gemSet(basis), gemBasis: basis === prev ? 'prev' : 'cur', star: BK.starOf(prev) };
  }

  // ── 출연료: 판이 끝난 뒤 (반드시 serial 안에서) ──
  // heroes: 서버가 확인한 멤버 (그 판에 데려간 · 가진 멤버만) · info: { hell, label, f, wave }
  async function credit(uid, heroes, mode, info = {}, now = Date.now()) {
    if (!BK || !uid) return [];
    const u = await store.byId(uid);
    if (!u || freeMaster(u)) return []; // 마스터 테스트 판은 안 센다
    const lbP = normLb(u.stats && u.stats.langbang, isMasterName(u.username));
    const list = [...new Set((Array.isArray(heroes) ? heroes : []).map(String))].filter((h) => BK.isBkHero(h) && L().heroUnlocked(lbP, h)).slice(0, 7);
    if (!list.length) return [];
    const own = await owners();
    const counted = list.filter((h) => !(own.get(h) && own.get(h).id === uid)); // 내 본캐를 내가 쓰면 출연료도 인기 집계도 없음
    if (!counted.length) return [];
    const { gems } = await pop(now);
    await update(uid, (st) => { const lb = st.langbang = normLb(st.langbang); delete lb.master; BK.useMark(lb, counted, now); });
    const act = BK.actText(mode, info);
    const paid = [];
    for (const h of counted) {
      const o = own.get(h);
      if (!o) continue;
      let c = 0;
      const ok = await update(o.id, (st) => { const lb = st.langbang = normLb(st.langbang); delete lb.master; c = BK.feeCredit(lb, uid, u.nickname, h, mode, act, gems.has(h), !!info.hell, now); });
      if (ok) paid.push({ hero: h, nickname: o.nickname, coins: c, gem: gems.has(h) });
    }
    return paid;
  }
  // 다른 모듈(1:1 대전 · 탑)에서: 차례 줄에 세워서
  const afterRun = (uid, heroes, mode, info, now) => exclusive(() => credit(uid, heroes, mode, info, now)).catch((e) => { console.error('[bonkae] 출연료 실패', e.message); return []; });

  // ── 화면용 ──
  async function view(token, now = Date.now()) {
    if (!BK) throw new AuthError('잠시 후 다시 해 주세요');
    const own = await owners();
    const p = await pop(now);
    const ownerOf = (h) => { const o = own.get(h); return o ? { nickname: o.nickname, username: o.username, by: o.by } : null; };
    const row = (r) => ({ ...r, owner: ownerOf(r.hero), gem: p.gems.has(r.hero) });
    let me = null;
    const id = token ? verifyToken(token) : null;
    if (id) {
      const u = await store.byId(id);
      if (u) {
        const lb = normLb(u.stats && u.stats.langbang, isMasterName(u.username));
        const bk = lb.bk;
        me = { hero: bk.hero, by: bk.by, nextAt: BK.nextChangeAt(bk), pend: bk.pend, news: bk.news, seen: bk.seen, seq: bk.seq, tot: bk.tot, totN: bk.totN, dayLeft: Math.max(0, BK.dayLeft(bk, now)), master: isMasterName(u.username) };
      }
    }
    return {
      owners: Object.fromEntries(BK.BK_HEROES.map((h) => [h, ownerOf(h)]).filter((x) => x[1])),
      wi: p.wi, week: p.cur.map(row), last: p.prev.map(row), gemBasis: p.gemBasis, gems: [...p.gems],
      star: p.star ? { hero: p.star.hero, players: p.star.players, uses: p.star.uses, owner: ownerOf(p.star.hero) } : null,
      left: L().msToWeekEnd(now), me, rule: BK.BONKAE, heroes: BK.BK_HEROES,
    };
  }
  // 본캐 정하기 (hero 없으면 내려놓기)
  function claim(token, hero) {
    return lbLive(token, (lb, id, now, ctx) => {
      if (!hero) return BK.release(lb);
      const err = BK.claimCheck(lb, id, hero, (h) => { const o = ctx.own.get(h); return o ? o.id : null; }, now);
      if (err) return { error: err };
      BK.claimApply(lb, hero, now);
      forget();
      return { claimed: hero };
    }, async () => { await bkReady; return { own: await owners(true) }; }).then((r) => { forget(); return r; });
  }
  // 정산: 반나절이 지난 출연료 → 우편 · 지난주 인기 1위 본캐 주인 → 보너스 우편 (한 주 한 번)
  function sync(token) {
    return lbLive(token, (lb, id, now, ctx) => {
      const got = BK.feeDeliver(lb, now, false);
      let star = false;
      if (ctx.star && ctx.star.ownerId === id) star = BK.starPay(lb, ctx.prevWi, ctx.star.hero, now);
      return { fee: got, star };
    }, async (u, id, now) => {
      await bkReady;
      const p = await pop(now, true);
      const own = await owners();
      const o = p.star ? own.get(p.star.hero) : null;
      return { prevWi: p.wi - 1, star: p.star && o ? { hero: p.star.hero, ownerId: o.id } : null };
    });
  }
  // 출연료 창에서 바로 받기
  const collect = (token) => lbLive(token, (lb, id, now) => {
    const r = BK.feeDeliver(lb, now, true);
    if (!r || !r.coins) return { error: '받을 출연료가 없어요' };
    return { got: r };
  });
  const seen = (token, s) => lbLive(token, (lb) => { lb.bk.seen = Math.max(lb.bk.seen | 0, Math.min(lb.bk.seq | 0, Math.floor(Number(s) || 0))); return {}; });

  // ── 마스터: 아무 멤버를 아무 계정에 지정 · 해제 (분쟁 정리) ──
  async function findUser(q) {
    const s = String(q || '').trim().slice(0, 40);
    if (!s) return null;
    const byName = await store.byName(s.toLowerCase());
    if (byName) return byName;
    if (store.pool) return store.row((await store.pool.query('SELECT * FROM users WHERE lower(nickname)=lower($1) LIMIT 1', [s])).rows[0]);
    return Object.values(store.data.users).find((u) => String(u.nickname).toLowerCase() === s.toLowerCase()) || null;
  }
  function masterSet(token, hero, target) {
    return (async () => {
      const id = await userFromToken(token);
      await bkReady;
      if (!BK.isBkHero(hero)) throw new AuthError('본캐로 고를 수 없는 멤버예요');
      let out = null;
      await exclusive(async () => {
        const me = await store.byId(id);
        if (!me || !isMasterName(me.username)) { out = { error: '마스터만 쓸 수 있어요' }; return; }
        const t = target ? await findUser(target) : null;
        if (target && !t) { out = { error: '그런 계정을 찾을 수 없어요 (아이디 또는 닉네임)' }; return; }
        const now = Date.now();
        // 그 멤버를 가진 다른 사람은 내려놓게 (여럿이면 전부)
        for (const r of await rows(true)) {
          if (r.bk && r.bk.hero === hero && (!t || r.id !== t.id)) await update(r.id, (st) => { const lb = st.langbang = normLb(st.langbang); delete lb.master; BK.masterSet(lb, null, now); });
        }
        if (t) await update(t.id, (st) => { const lb = st.langbang = normLb(st.langbang); delete lb.master; BK.masterSet(lb, hero, now); });
        forget();
        out = { hero, owner: t ? { nickname: t.nickname, username: t.username } : null };
      });
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }

  function mount(r, wrap, tok) {
    const b = (req) => req.body || {};
    r.get('/bonkae', wrap(async (req) => { await bkReady; return view(tok(req) || null); }));
    r.post('/bonkae/claim', wrap(async (req) => { await bkReady; const h = b(req).hero; return claim(tok(req), h ? String(h).slice(0, 20) : null); }));
    r.post('/bonkae/sync', wrap(async (req) => { await bkReady; return sync(tok(req)); }));
    r.post('/bonkae/collect', wrap(async (req) => { await bkReady; return collect(tok(req)); }));
    r.post('/bonkae/seen', wrap(async (req) => { await bkReady; return seen(tok(req), b(req).s); }));
    r.post('/bonkae/master', wrap(async (req) => masterSet(tok(req), String(b(req).hero || '').slice(0, 20), b(req).user ? String(b(req).user) : '')));
  }
  return { mount, credit, afterRun, view, claim, sync, collect, seen, masterSet, owners, pop, forget };
}

module.exports = { createBonkae, bkReady, getBk: () => BK };
