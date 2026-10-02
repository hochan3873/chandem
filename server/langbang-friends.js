'use strict';
// 랑방 대전 친구: 친구 요청 · 수락 · 삭제 · 체력(피로도) 선물 · 레이드에서 친구 멤버 빌리기
// 규칙(하루 횟수 · 상한 · 빌려줄 멤버 모습)은 public/langbang/live.js 의 친구 블록 (화면과 같은 파일).
// 두 사람 기록을 함께 고치는 일은 전적 기록과 같은 줄(serial)에서 차례로 — 동시에 덮어쓰지 않게.
const crypto = require('crypto');

function createFriends(d) {
  const { store, update, serial, userFromToken, lbLive, lbView, normLb, isMasterName, AuthError } = d;
  const L = () => d.LIVE();

  // ── 횟수 제한 (사람마다 · 메모리) ──
  const hits = new Map();
  function limited(id, kind, n, ms) {
    const k = id + ':' + kind, t = Date.now();
    const list = (hits.get(k) || []).filter((x) => t - x < ms);
    list.push(t); hits.set(k, list);
    if (hits.size > 20000) hits.clear();
    return list.length > n;
  }
  const slow = (id, kind = 'act', n = 40) => { if (limited(id, kind, n, 60e3)) throw new AuthError('너무 빨라요. 잠시 후 다시 해 주세요'); };

  // ── 사람 찾기 ──
  async function usersByIds(ids) {
    const want = [...new Set(ids)].filter((x) => typeof x === 'string').slice(0, 120);
    const out = new Map();
    if (!want.length) return out;
    if (store.pool) {
      const r = await store.pool.query('SELECT * FROM users WHERE id = ANY($1::text[])', [want]);
      for (const row of r.rows) { const u = store.row(row); out.set(u.id, u); }
    } else for (const id of want) { const u = await store.byId(id); if (u) out.set(id, u); }
    return out;
  }
  async function byNickname(nick) {
    const n = String(nick || '').trim();
    if (!n) return null;
    if (store.pool) return store.row((await store.pool.query('SELECT * FROM users WHERE lower(nickname)=lower($1) LIMIT 1', [n])).rows[0]);
    const low = n.toLowerCase();
    return Object.values(store.data.users).find((u) => String(u.nickname).toLowerCase() === low) || null;
  }
  // 친구 코드 → 아이디 (코드는 아이디에서 정해져서 바뀌지 않는다 · 모르는 코드면 30초에 한 번만 목록을 다시 읽는다)
  const codes = { map: new Map(), at: 0 };
  async function byCode(code) {
    const c = L().cleanFriendCode(code);
    if (c.length !== 6) return null;
    if (!codes.map.has(c) && Date.now() - codes.at > 30e3) {
      codes.at = Date.now();
      const ids = store.pool ? (await store.pool.query('SELECT id FROM users')).rows.map((r) => r.id) : Object.keys(store.data.users);
      for (const id of ids) codes.map.set(L().friendCode(id), id);
    }
    const id = codes.map.get(c);
    return id ? store.byId(id) : null;
  }

  const lbOfU = (u) => normLb(JSON.parse(JSON.stringify((u.stats && u.stats.langbang) || {})), isMasterName(u.username));
  const save = (u, lb) => update(u.id, (st) => { delete lb.master; st.langbang = lb; });

  // 나 + 다른 사람들 기록을 한 번에 읽고 fn 으로 고친 뒤 함께 저장 (오류면 아무것도 저장 안 함)
  function multi(token, otherIds, fn) {
    return (async () => {
      const id = await userFromToken(token);
      let out = null;
      await serial(async () => {
        const me = await store.byId(id);
        if (!me) return;
        const others = await usersByIds(otherIds.filter((x) => x !== id));
        const now = Date.now();
        const a = lbOfU(me);
        const lbs = new Map([...others].map(([k, u]) => [k, lbOfU(u)]));
        const r = fn(a, lbs, { id, me, others, now }) || {};
        if (r.error) { out = r; return; }
        for (const k of r.touched || []) { const u = others.get(k); if (u && lbs.get(k)) await save(u, lbs.get(k)); }
        const st = await save(me, a);
        out = { profile: lbView(st.langbang, id, isMasterName(me.username)), ...r };
        delete out.touched;
      });
      if (!out) throw new AuthError('다시 로그인해 주세요');
      if (out.error) throw new AuthError(out.error);
      return out;
    })();
  }
  const clean = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 40 ? v : '');

  // ── 친구 목록 화면 ──
  async function view(token) {
    const id = await userFromToken(token);
    const u = await store.byId(id);
    if (!u) throw new AuthError('다시 로그인해 주세요');
    const LV = L(), now = Date.now();
    const lb = lbOfU(u);
    const fr = lb.fr;
    const users = await usersByIds([...fr.list, ...fr.inReq, ...fr.outReq].map((x) => x.id));
    const card = (x) => {
      const fu = users.get(x.id);
      if (!fu) return null;
      const flb = lbOfU(fu);
      const s = LV.friendSnapshot(flb);
      return { id: x.id, at: x.at, nickname: fu.nickname, level: flb.level, title: flb.title || '', frame: flb.frame || '', leader: { hero: s.hero, lv: s.lv, star: s.star }, last: LV.lastActive(flb), pts: flb.fr.pts | 0 };
    };
    const friends = fr.list.map((x) => { const c = card(x); return c && { ...c, sent: LV.giftSentToday(lb, x.id, now), borrowed: LV.borrowedToday(lb, x.id, now) }; }).filter(Boolean)
      .sort((a, b) => b.last - a.last);
    return {
      code: LV.friendCode(id), friends, inReq: fr.inReq.map(card).filter(Boolean), outReq: fr.outReq.map(card).filter(Boolean),
      gifts: LV.giftInbox(lb, now).map((g) => ({ k: g.k, nick: g.nick, at: g.at })).reverse(),
      recvLeft: Math.max(0, LV.giftRecvLeft(lb, now)), reqLeft: Math.max(0, LV.friendReqLeft(lb, now)), pts: fr.pts | 0, lentAll: fr.lentAll | 0, rule: LV.FRIEND,
    };
  }

  // ── 요청 · 수락 · 거절 · 취소 · 삭제 ──
  async function request(token, q) {
    const id = await userFromToken(token);
    slow(id, 'find', 15);
    const s = String(q || '').replace(/\s+/g, ' ').trim().slice(0, 20);
    if (!s) throw new AuthError('닉네임이나 친구 코드를 입력해 주세요');
    const t = (await byNickname(s)) || (await byCode(s));
    if (!t) throw new AuthError('그런 친구를 찾을 수 없어요 (닉네임 · 친구 코드 확인)');
    if (t.id === id) throw new AuthError('나 자신은 친구로 추가할 수 없어요');
    return multi(token, [t.id], (a, lbs, c) => {
      const LV = L(), b = lbs.get(t.id);
      if (!b) return { error: '그런 친구를 찾을 수 없어요' };
      if (LV.isFriend(a, t.id)) return { error: '이미 친구예요' };
      if (a.fr.list.length >= LV.FRIEND.max) return { error: `친구는 ${LV.FRIEND.max}명까지예요` };
      if (b.fr.list.length >= LV.FRIEND.max) return { error: '상대의 친구 목록이 꽉 찼어요' };
      if (a.fr.inReq.some((x) => x.id === t.id)) { link(a, b, c.id, t.id, c.now); return { accepted: true, nickname: t.nickname, touched: [t.id] }; } // 서로 보냈으면 바로 친구
      if (a.fr.outReq.some((x) => x.id === t.id)) return { error: '이미 요청을 보냈어요' };
      if (LV.friendReqLeft(a, c.now) <= 0) return { error: `친구 요청은 하루 ${LV.FRIEND.reqPerDay}번까지예요` };
      if (b.fr.inReq.length >= LV.FRIEND.reqMax) return { error: '상대가 받은 요청이 너무 많아요' };
      LV.frCountReq(a, c.now);
      LV.frSet(a, 'outReq', t.id, true, c.now);
      LV.frSet(b, 'inReq', c.id, true, c.now);
      return { requested: true, nickname: t.nickname, touched: [t.id] };
    });
  }
  function link(a, b, aid, bid, now) {
    const LV = L();
    LV.frSet(a, 'list', bid, true, now); LV.frSet(b, 'list', aid, true, now);
    for (const [x, o] of [[a, bid], [b, aid]]) { LV.frSet(x, 'inReq', o, false); LV.frSet(x, 'outReq', o, false); }
  }
  async function accept(token, fid) {
    const id = await userFromToken(token);
    slow(id);
    fid = clean(fid);
    return multi(token, [fid], (a, lbs, c) => {
      const LV = L(), b = lbs.get(fid);
      if (!a.fr.inReq.some((x) => x.id === fid)) return { error: '받은 요청이 없어요' };
      if (!b) { LV.frSet(a, 'inReq', fid, false); return { gone: true }; } // 탈퇴한 사람
      if (a.fr.list.length >= LV.FRIEND.max) return { error: `친구는 ${LV.FRIEND.max}명까지예요` };
      if (b.fr.list.length >= LV.FRIEND.max) return { error: '상대의 친구 목록이 꽉 찼어요' };
      link(a, b, c.id, fid, c.now);
      return { accepted: true, nickname: c.others.get(fid).nickname, touched: [fid] };
    });
  }
  // kind: 'decline'(받은 요청 거절) · 'cancel'(보낸 요청 취소) · 'remove'(친구 삭제)
  async function drop(token, fid, kind) {
    const id = await userFromToken(token);
    slow(id);
    fid = clean(fid);
    const mine = { decline: 'inReq', cancel: 'outReq', remove: 'list' }[kind], theirs = { decline: 'outReq', cancel: 'inReq', remove: 'list' }[kind];
    return multi(token, [fid], (a, lbs, c) => {
      const LV = L(), b = lbs.get(fid);
      if (!a.fr[mine].some((x) => x.id === fid)) return { error: kind === 'remove' ? '친구가 아니에요' : '요청이 없어요' };
      LV.frSet(a, mine, fid, false);
      if (b) LV.frSet(b, theirs, c.id, false);
      return { done: kind, touched: b ? [fid] : [] };
    });
  }

  // ── 체력 선물 ──
  async function gift(token, fid) {
    const id = await userFromToken(token);
    slow(id);
    const u = await store.byId(id);
    if (!u) throw new AuthError('다시 로그인해 주세요');
    const a0 = lbOfU(u), now = Date.now();
    const all = fid === 'all';
    const ids = all ? a0.fr.list.map((x) => x.id).filter((x) => !L().giftSentToday(a0, x, now)) : [clean(fid)];
    if (!ids.length || !ids[0]) throw new AuthError(all ? '오늘은 모두에게 보냈어요' : '없는 친구예요');
    return multi(token, ids, (a, lbs, c) => {
      const LV = L(), touched = [];
      let firstErr = null;
      for (const f of ids) {
        const b = lbs.get(f);
        const r = b ? LV.giftSend(a, b, c.id, f, c.me.nickname, c.now) : { error: '없는 친구예요' };
        if (r.error) { firstErr = firstErr || r.error; continue; }
        touched.push(f);
      }
      if (!touched.length) return { error: firstErr || '보낼 친구가 없어요' };
      return { sent: touched.length, touched };
    });
  }
  const claim = (token, k) => lbLive(token, (lb, id, now) => L().giftClaim(lb, k === 'all' ? 'all' : Math.floor(Number(k) || 0), now));

  // ── 레이드: 친구 멤버 빌리기 (빌릴 멤버 모습은 서버가 친구 기록에서 만든다) ──
  async function raidStart(token, fid) {
    const id = await userFromToken(token);
    slow(id, 'raid', 10);
    fid = clean(fid);
    if (!fid || fid === id) throw new AuthError('친구의 멤버만 빌릴 수 있어요');
    let lend = null;
    const out = await lbLive(token, (lb, uid, now, ctx) => {
      const LV = L(), st = LV.raidState(now);
      if (d.retired) return { error: '모임 레이드는 건물주 레이드로 바뀌었어요 (친구 멤버는 건물주 레이드에서 빌려요)' };
      if (!st.open) return { error: '레이드는 매일 12:00~13:30 · 15:00~16:30 · 21:00~23:00 에 열려요' };
      if ((lb.maxStage | 0) < 5) return { error: '레이드는 1-5를 깨면 참가할 수 있어요' };
      if (LV.raidTriesLeft(lb, now) <= 0) return { error: `이번 레이드 도전은 다 했어요 (레이드마다 ${LV.RAID.tries}번)` };
      if (!ctx.f) return { error: '없는 친구예요' };
      if (!ctx.mutual) return { error: '서로 친구일 때만 빌릴 수 있어요' };
      const e = LV.borrowCheck(lb, fid, now);
      if (e) return { error: e };
      const help = { nick: ctx.f.nickname, ...ctx.snap };
      lb.raidRun = { id: ctx.rid, wi: st.wi, at: now };
      LV.borrowMark(lb, fid, help, ctx.rid, now);
      lend = { nick: ctx.myNick, now };
      return { runId: ctx.rid, wi: st.wi, boss: st.boss, help };
    }, async (u) => {
      const f = await store.byId(fid);
      const flb = f ? lbOfU(f) : null;
      return { rid: crypto.randomBytes(9).toString('base64url'), f, mutual: !!flb && L().isFriend(flb, id), snap: flb ? L().friendSnapshot(flb) : null, myNick: u.nickname };
    });
    // 빌려준 친구: 우편 보상 + 도움 포인트 (하루 상한)
    if (lend) await serial(async () => { await update(fid, (st) => { const lb = st.langbang = normLb(st.langbang); L().lendReward(lb, lend.nick, lend.now); delete lb.master; }); });
    return out;
  }

  // 랑방 라우터에 붙이기 (accounts.js langbangRouter 의 wrap · tok 을 그대로 쓴다)
  function mount(r, wrap, tok) {
    const b = (req) => req.body || {};
    r.get('/friends', wrap((req) => view(tok(req))));
    r.post('/friends/request', wrap((req) => request(tok(req), b(req).q)));
    r.post('/friends/accept', wrap((req) => accept(tok(req), b(req).id)));
    r.post('/friends/decline', wrap((req) => drop(tok(req), b(req).id, 'decline')));
    r.post('/friends/cancel', wrap((req) => drop(tok(req), b(req).id, 'cancel')));
    r.post('/friends/remove', wrap((req) => drop(tok(req), b(req).id, 'remove')));
    r.post('/friends/gift', wrap((req) => gift(tok(req), b(req).id === 'all' ? 'all' : b(req).id)));
    r.post('/friends/claim', wrap((req) => claim(tok(req), b(req).k)));
    // 레이드 시작: 친구를 골랐으면 여기서 (아니면 원래 레이드 시작으로)
    const helped = wrap((req) => raidStart(tok(req), b(req).friend));
    r.post('/raid/start', (req, res, next) => (req.body && req.body.friend ? helped(req, res) : next()));
  }
  return { view, request, accept, drop, gift, claim, raidStart, mount };
}

module.exports = { createFriends };
