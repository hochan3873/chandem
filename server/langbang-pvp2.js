'use strict';
// 랑방 대전 1:1 맞대결 (v2): Socket.IO 네임스페이스 /lbpvp2 — 서버가 두 사람 판을 같이 돌린다 (server-authoritative)
//  - 화면은 입력만 보낸다 ('in': 스킬 · 총공지 · 견제 표적 · 교체 · 정신 차려 · 보내기 · 집중) → 서버가 확인하고 판에 넣는다
//  - 서버는 0.1초마다 판을 3스텝 돌리고 장면('snap')을 두 사람에게 보낸다 (상대 판 진상은 0.2초마다 · 전송량)
//  - 결과 · 점수 · 보상은 서버가 정한다 (지금 대전과 같은 규칙: live.js 보상 · eloDelta · AI 판 60%)
//  - 매칭: 대전 전투력(pvpFirepower)이 비슷한 사람끼리, 기다릴수록 넓게 · 20초 없으면 AI · 방 코드 · AI와 바로 대전
//  - 끊김: 15초 동안 AI 가 대신 조종 · 다시 붙으면 이어서 · 넘으면 기권패
//  설계: docs/langbang-pvp-v2.md
const crypto = require('crypto');
const path = require('path');
const { pathToFileURL } = require('url');

const REWARD = { win: 200, lose: 60 };
const START_RATING = 1000;
const lbMod = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);

function createLbPvp2(opts) {
  const { accounts, normLb, eloDelta } = opts;
  const M = {};
  const ready = Promise.all([lbMod('pvp2-sim.js'), lbMod('pvp2.js'), lbMod('pvp.js'), lbMod('live.js'), lbMod('data.js')]).then(([D2, P2, PV, live, D]) => { M.D2 = D2; M.P2 = P2; M.PV = PV; M.D = D; if (!opts.live) opts.live = live; }).catch((e) => console.error('[lbpvp2] 불러오기 실패', e.message));
  const now = opts.now || Date.now;
  const T = {
    tick: opts.tickMs !== undefined ? opts.tickMs : 100, // 판 0.1초 = 실제 몇 ms (테스트는 짧게)
    countdown: opts.countdownMs !== undefined ? opts.countdownMs : 3000,
    aiNotice: opts.aiNoticeMs !== undefined ? opts.aiNoticeMs : 1500,
    botAfter: opts.botAfterMs !== undefined ? opts.botAfterMs : 20000,
    grace: opts.graceMs !== undefined ? opts.graceMs : 15000,
    roomTtl: opts.roomTtlMs !== undefined ? opts.roomTtlMs : 10 * 60e3,
    len: opts.len, // 판 길이(초) — 테스트용 (없으면 4분)
  };
  const queue = [];
  const codes = new Map();
  const matches = new Map();
  const byUser = new Map();
  const ended = new Map();
  const timers = new Set();
  const guestAdj = new Map();
  let nspRef = null;
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const cancelT = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };

  async function playerOf(socket) {
    const auth = socket.handshake.auth || {};
    const tok = String(auth.token || '');
    const gid = String(auth.gid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
    const uid = tok ? accounts.verifyToken(tok) : null;
    const p = { socket, uid, key: '', nickname: '손님', username: '', rating: START_RATING, games: 0, wins: 0, title: '', frame: '', master: false, lb: null, aiAdj: 0, deck: [], fp: 0, power: 0, match: null, side: -1, bucket: {}, queuedAt: 0 };
    if (uid) {
      const u = await accounts.store.byId(uid);
      if (u) {
        const lb = u.stats.langbang || {}, pv = lb.pvp || {};
        Object.assign(p, { nickname: u.nickname, username: u.username, rating: pv.rating | 0 || START_RATING, games: pv.games | 0, wins: pv.wins | 0, aiAdj: pv.ai ? Number(pv.ai.adj) || 0 : 0, title: typeof lb.title === 'string' ? lb.title.slice(0, 24) : '', frame: typeof lb.frame === 'string' ? lb.frame.slice(0, 24) : '', master: !!(opts.isMaster && opts.isMaster(u.username)), lb });
      }
    }
    p.key = uid || (gid.length >= 8 ? 'g:' + gid : 'g:' + socket.id);
    if (!uid) p.aiAdj = guestAdj.get(p.key) || 0;
    return p;
  }
  const pub = (p) => ({ nickname: p.nickname, username: p.username || '', rating: p.rating, deck: p.deck, bot: !!p.bot, ai: !!p.ai, power: p.fp | 0, games: p.games | 0, wins: p.wins | 0, title: p.title || '', frame: p.frame || '' });

  // 덱 · 대전 한도(강화 +10 · ★3 · 영웅 장비) → 판에 넣을 것 · 전투력
  async function freshLb(pl) { if (!pl.uid) return; try { const u = await accounts.store.byId(pl.uid); if (u && u.stats) pl.lb = u.stats.langbang || pl.lb; } catch (e) { /* 그대로 */ } } // 기다리는 동안 강화 · 새 멤버
  function setDeck(pl, b) {
    pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map((x) => String(x).slice(0, 16)) : [];
    const lo = b && b.lo;
    if (!pl.uid && lo && typeof lo === 'object') {
      const pick = (o, f) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 12).map(([k, v]) => [String(k).slice(0, 16), f(v)]));
      pl.guestLo = {
        heroes: pick(lo.heroes, (v) => Math.floor(Number(v) || 0)), hstars: pick(lo.hstars, (v) => Math.floor(Number(v) || 0)),
        equip: pick(lo.equip, (v) => ({ w: v && v.w, a: v && v.a, m: v && v.m })),
        gear: (Array.isArray(lo.gear) ? lo.gear : []).slice(0, 40).map((g) => ({ id: g && g.id, t: String((g && g.t) || ''), r: String((g && g.r) || ''), lv: Math.max(0, Math.min(10, Math.floor(Number(g && g.lv) || 0))) })),
      };
    }
    refreshLo(pl);
  }
  function refreshLo(pl) {
    if (!M.PV) return;
    const src = pl.uid ? pl.lb : pl.guestLo;
    if (pl.uid && pl.lb && opts.live && opts.live.heroUnlocked) pl.deck = pl.deck.filter((id) => opts.live.heroUnlocked(pl.lb, id)); // 로그인: 가진 멤버만 (대전 덱은 누구나 6칸)
    pl.lo = M.PV.pvpLoadout(src || {}, pl.deck);
    pl.deck = pl.lo.deck.slice(0, 6);
    pl.fp = M.PV.pvpFirepower(pl.lo);
  }
  const deckOk = (pl) => pl.deck.length >= 1;

  // ─── 매칭 ───
  function unqueue(p) {
    const i = queue.indexOf(p); if (i >= 0) queue.splice(i, 1);
    cancelT(p.roomT); p.roomT = null;
    let gone = false; for (const [c, q] of codes) if (q === p) { codes.delete(c); gone = true; }
    p.room = null; p.queuedAt = 0;
    if (gone) broadcastRooms();
  }
  function tryPair() {
    if (!M.P2) return;
    const t = now();
    for (let i = 0; i < queue.length; i++) {
      const a = queue[i];
      for (let j = i + 1; j < queue.length; j++) {
        const b = queue[j];
        if (a.key === b.key) continue;
        const w = Math.min(t - a.queuedAt, t - b.queuedAt) / 1000;
        if (M.P2.matchFits(a, b, w)) { unqueue(a); unqueue(b); makeMatch(a, b); return tryPair(); }
      }
    }
    for (const p of queue.slice()) if (t - p.queuedAt >= T.botAfter) { unqueue(p); makeMatch(p, makeBot(p)); }
  }
  const pairT = setInterval(() => { try { tryPair(); } catch (e) { console.error('[lbpvp2] 매칭 오류', e.message); } }, opts.pairMs || 1000);
  timers.add(pairT);

  const tierName = (r) => (r >= 1800 ? '랑방킹' : r >= 1500 ? '다이아' : r >= 1350 ? '플래티넘' : r >= 1200 ? '골드' : r >= 1050 ? '실버' : '브론즈');
  function roomList() {
    const t = now();
    return [...codes.entries()].filter(([, h]) => !h.match && h.room).sort((a, b) => a[1].room.at - b[1].room.at).map(([code, h]) => ({ code, title: h.room.title, host: h.nickname, hostTitle: h.title || '', rating: h.rating, tier: tierName(h.rating), games: h.games | 0, wins: h.wins | 0, power: h.fp | 0, waitSec: Math.floor((t - h.room.at) / 1000), guest: !h.uid, v: 2 }));
  }
  function broadcastRooms() { if (nspRef) nspRef.emit('rooms', roomList()); }
  function openRoom(pl, b) {
    let code;
    do code = String(Math.floor(1000 + Math.random() * 9000)); while (codes.has(code) || (opts.codeTaken && opts.codeTaken(code)));
    codes.set(code, pl);
    pl.room = { at: now(), title: String((b && b.title) || '').replace(/[<>]/g, '').slice(0, 20) || `${pl.nickname}의 방` };
    cancelT(pl.roomT);
    pl.roomT = later(T.roomTtl, () => { if (!pl.match && codes.get(code) === pl) { codes.delete(code); pl.room = null; if (pl.socket) pl.socket.emit('roomClosed', { reason: 'ttl' }); broadcastRooms(); } });
    broadcastRooms();
    return code;
  }

  // ─── AI 상대: 비슷한 전투력 ±5% 덱 (절반은 내 속성을 노린 구성) ───
  function aiPower(D, id, m) { return D.heroPowerOf(id, m, 1, null, { mile: false }); } // 화면 · 대전과 같은 전투력 (data.js heroPowerOf)
  // 덱: 비슷한 전투력 (±5%) · 절반은 상대 속성을 노린 구성
  function aiDeck(D, pl, rng) {
    const mmax = (id) => Math.min(M.PV ? M.PV.PVP_NORM.meta : 10, D.metaMaxOf(id)); // 대전: 강화 +10 까지만
    const pool = Object.keys(D.HEROES).filter((id) => !D.HEROES[id].summon && id !== 'hochan' && id !== 'jeongseob');
    const pick = [];
    const pAttrs = (pl.deck || []).map((id) => D.HEROES[id] && D.HEROES[id].attr).filter(Boolean);
    if (rng() < 0.5 && pAttrs.length) { const want = pAttrs[Math.floor(rng() * pAttrs.length)]; const same = pool.filter((id) => D.HEROES[id].attr === want); while (pick.length < 2 && same.length) pick.push(same.splice(Math.floor(rng() * same.length), 1)[0]); }
    const rest = pool.filter((id) => !pick.includes(id));
    const n = Math.max(2, Math.min(5, (pl.deck || []).length || 5));
    while (pick.length < n && rest.length) pick.push(rest.splice(Math.floor(rng() * rest.length), 1)[0]);
    const target = Math.max(1, pl.power | 0);
    // 강화 0 으로도 너무 세면: 높은 등급부터 낮은 등급 멤버로 바꾸고 · 그래도 세면 한 명씩 뺀다
    const p0 = () => pick.reduce((a, id) => a + aiPower(D, id, 0), 0);
    const low = pool.filter((id) => !pick.includes(id)).sort((x, y) => aiPower(D, x, 0) - aiPower(D, y, 0));
    for (let k = 0; k < 10 && p0() > target * 1.05 && low.length; k++) { let hi = 0; pick.forEach((id, i) => { if (aiPower(D, id, 0) > aiPower(D, pick[hi], 0)) hi = i; }); const c = low.shift(); if (aiPower(D, c, 0) < aiPower(D, pick[hi], 0)) pick[hi] = c; }
    while (pick.length > 2 && p0() > target * 1.05) { let hi = 0; pick.forEach((id, i) => { if (aiPower(D, id, 0) > aiPower(D, pick[hi], 0)) hi = i; }); pick.splice(hi, 1); }
    // 강화를 끝까지 해도 모자라면: 약한 멤버를 높은 등급 멤버로 바꾼다
    const pMax = () => pick.reduce((a, id) => a + aiPower(D, id, mmax(id)), 0);
    const high = pool.filter((id) => !pick.includes(id)).sort((x, y) => aiPower(D, y, mmax(y)) - aiPower(D, x, mmax(x)));
    for (let k = 0; k < 10 && pMax() < target * 0.95 && high.length; k++) { let lo = 0; pick.forEach((id, i) => { if (aiPower(D, id, mmax(id)) < aiPower(D, pick[lo], mmax(pick[lo]))) lo = i; }); const pw = (id) => aiPower(D, id, mmax(id)), rest = pMax() - pw(pick[lo]), rest0 = p0() - aiPower(D, pick[lo], 0); let ci = -1, cd = Infinity; high.forEach((c, i) => { if (pw(c) <= pw(pick[lo]) || rest0 + aiPower(D, c, 0) > target * 1.05) return; const dd = Math.abs(rest + pw(c) - target); if (dd < cd) { cd = dd; ci = i; } }); if (ci < 0) break; pick[lo] = high.splice(ci, 1)[0]; } // 강화 한도(+10) 안에서 목표에 가장 가까운 멤버로 (넘치지 않게)
    let best = 0, bd = Infinity;
    for (let m = 0; m <= 20; m++) { const p = pick.reduce((a, id) => a + aiPower(D, id, Math.min(m, mmax(id))), 0); if (Math.abs(p - target) < bd) { bd = Math.abs(p - target); best = m; } }
    const meta = Object.fromEntries(pick.map((id) => [id, Math.min(best, mmax(id))]));
    // 남은 차이는 한 명씩 ±1 로 맞춘다 (±5% 안으로)
    for (let k = 0; k < 60; k++) {
      const p = pick.reduce((a, id) => a + aiPower(D, id, meta[id]), 0);
      if (Math.abs(p - target) <= target * 0.05) break;
      const id = pick[k % pick.length]; meta[id] = Math.max(0, Math.min(mmax(id), meta[id] + (p < target ? 1 : -1)));
    }
    const power = Math.round(pick.reduce((a, id) => a + aiPower(D, id, meta[id]), 0));
    return { deck: pick, meta, power };
  }
  const AI_NICK = ['야식왕', '골목대장', '랑방단골', '막차탑승', '노래방VIP', '새벽두시', '편의점요정', '치킨은반반', '라떼는말야', '오늘도출근', '월요병환자', '소주한잔'];
  function makeBot(pl) {
    const seed = crypto.randomBytes(4).readUInt32LE(0);
    const rng = M.D2.seeded(seed);
    let dk = null;
    try { dk = aiDeck(M.D, { deck: pl.deck, power: pl.fp }, rng); } catch (e) { dk = null; }
    if (!dk || !dk.deck || !dk.deck.length) dk = { deck: ['bangjang', 'staff', 'gunman', 'gunnyeo'], meta: {}, power: pl.fp };
    // v2 는 벤치가 있으니 6명까지 (모자라면 같은 강화로 채운다)
    const pool = ['gunman', 'staff', 'gunnyeo', 'bangjang', 'sunggu', 'jieun', 'ingyu', 'subin', 'dohoon', 'soyoung'];
    const deck = dk.deck.slice(0, 6);
    const m0 = Math.round(Object.values(dk.meta || {}).reduce((a, v) => a + v, 0) / Math.max(1, Object.keys(dk.meta || {}).length));
    for (const id of pool) if (deck.length < Math.min(6, Math.max(4, pl.deck.length)) && !deck.includes(id)) { deck.push(id); dk.meta[id] = m0; }
    const lo = { deck, meta: dk.meta || {}, stars: {}, gear: {} };
    const fp = M.PV.pvpFirepower(lo);
    return { bot: true, ai: true, key: 'ai:' + seed, nickname: AI_NICK[Math.floor(rng() * AI_NICK.length)] + Math.floor(10 + rng() * 89), rating: Math.max(800, Math.round(pl.rating + (rng() - 0.5) * 80)), games: 20 + Math.floor(rng() * 200), wins: 0, deck, lo, fp, adj: Math.max(-0.15, Math.min(0.15, pl.aiAdj || 0)), socket: null };
  }

  // ─── 판 ───
  function makeMatch(a, b) {
    for (const p of [a, b]) if (!p.bot) refreshLo(p);
    const id = crypto.randomBytes(6).toString('base64url');
    const seed = crypto.randomBytes(4).readUInt32LE(0) >>> 1;
    const hp = M.PV.pvpHpScale(a.fp, b.fp);
    const d = M.D2.createDuel({ seed, hp, len: T.len, sides: [a.lo, b.lo] });
    const aiNote = b.ai ? T.aiNotice : 0;
    const m = { id, seed, hp, d, a, b, p: [a, b], startAt: now() + T.countdown + aiNote, over: false, ai: !!b.ai, n: 0, evq: [], roster: [...new Set([...d.sides[0].deck, ...d.sides[1].deck])] };
    for (const p of [a, b]) { p.tt = M.P2.newTypeTable(); p.net = 0; }
    for (const [i, p] of [[0, a], [1, b]]) { p.match = m; p.side = i; if (p.bot) { M.D2.setBot(d, i, { skill: 1 + p.adj * 3 }); d.sides[i].g.mods.dmg *= 1 + p.adj; } else byUser.set(p.key, p); }
    matches.set(id, m);
    for (const i of [0, 1]) { const me = m.p[i], op = m.p[1 - i]; if (me.socket) me.socket.emit('match', info(m, i, { startIn: m.startAt - now(), aiNotice: aiNote })); void op; }
    m.loopT = later(Math.max(0, m.startAt - now()), () => loop(m));
    return m;
  }
  function info(m, i, x) {
    const me = m.p[i], op = m.p[1 - i];
    return Object.assign({ id: m.id, seed: m.seed, side: i, len: m.d.len || 240, you: pub(me), opp: pub(op), deck: m.d.sides[i].deck, oppDeck: m.d.sides[1 - i].deck, roster: m.roster, snapMs: T.tick * M.P2.PV2.snapEvery }, x || {});
  }
  // 0.1초(판 시간)마다: 3스텝 → 사건 · 장면 보내기
  function loop(m) {
    if (m.over) return;
    try {
      M.D2.tick(m.d);
      m.n++;
      for (const e of M.D2.drainEv(m.d)) m.evq.push(e);
      const P2 = M.P2.PV2;
      if (m.n % P2.snapEvery === 0 || m.d.over) { // 장면: 0.2초마다 바이너리 한 통 (상대 판 진상은 3번에 2번)
        const k = Math.floor(m.n / P2.snapEvery), opFull = k % P2.opSkip !== P2.opSkip - 1;
        for (const i of [0, 1]) {
          const p = m.p[i]; if (!p.socket) continue;
          const pk = M.P2.packSnap(M.D2.snap(m.d, i, opFull), m.roster, p.tt);
          const msg = { b: Buffer.from(pk.b) };
          if (m.evq.length) msg.ev = m.evq;
          if (pk.ty.length) msg.ty = pk.ty;
          p.net += pk.b.length + 30 + (msg.ev ? JSON.stringify(msg.ev).length : 0) + (msg.ty ? JSON.stringify(msg.ty).length : 0); // (대략 · 소켓 머리 포함)
          p.socket.emit('snap', msg);
        }
        m.evq = [];
      }
      if (m.d.over) { finish(m, m.d.win < 0 ? null : m.p[1 - m.d.win], m.d.reason); return; }
    } catch (e) { console.error('[lbpvp2] 판 오류', e && e.stack); finish(m, null, 'error'); return; }
    m.loopT = later(T.tick, () => loop(m));
  }

  async function finish(m, loser, reason) {
    if (m.over) return;
    m.over = true;
    matches.delete(m.id);
    cancelT(m.loopT);
    const draw = !loser;
    if (draw) loser = m.b;
    const winner = loser === m.a ? m.b : m.a;
    for (const p of m.p) { cancelT(p.leftT); p.match = null; if (!p.bot) byUser.delete(p.key); }
    const human0 = m.a.bot ? m.b : m.a;
    const ranked0 = m.ai ? !!human0.uid && !human0.master : !!(winner.uid && loser.uid && winner.uid !== loser.uid && !winner.master && !loser.master);
    const ranked = ranked0 && !draw && reason !== 'error';
    const dlt = ranked ? Math.max(m.ai ? 5 : 8, Math.round(eloDelta(winner.rating, loser.rating, 1, winner.games) * (m.ai ? 0.6 : 1))) : 0;
    const st = m.d.sides.map((sd) => ({ hp: Math.round((Math.max(0, sd.g.base.hp) / Math.max(1, sd.g.base.max)) * 100), kills: sd.g.stats.kills }));
    for (const p of [winner, loser]) {
      if (p.bot) continue;
      const win = !draw && p === winner, i = p.side;
      const delta = ranked ? (win ? dlt : -dlt) : 0;
      let coins = reason === 'error' ? 0 : win ? REWARD.win : REWARD.lose, note = draw ? '무승부 · 점수 변동 없음' : '', left = null;
      let rating = p.rating, streak = 0;
      const before = p.rating;
      if (p.uid && reason !== 'error') {
        try {
          await accounts.exclusive(async () => accounts.updateStats(p.uid, (s) => {
            const lb = s.langbang = normLb(s.langbang);
            const pv = lb.pvp = lb.pvp || { rating: START_RATING, games: 0, wins: 0 };
            if (ranked) { pv.rating = Math.max(0, (pv.rating | 0 || START_RATING) + delta); pv.games++; if (win) pv.wins++; pv.streak = win ? (pv.streak | 0) + 1 : 0; pv.best = Math.max(pv.best | 0, pv.streak); }
            pv.last = now();
            if (m.ai && !draw) { const a0 = pv.ai = pv.ai || { adj: 0, w: 0, l: 0 }; if (win) { a0.w = (a0.w | 0) + 1; a0.l = 0; if (a0.w >= 2) { a0.adj = Math.min(0.15, (Number(a0.adj) || 0) + 0.05); a0.w = 0; } } else { a0.l = (a0.l | 0) + 1; a0.w = 0; if (a0.l >= 2) { a0.adj = Math.max(-0.15, (Number(a0.adj) || 0) - 0.05); a0.l = 0; } } p.aiAdj = a0.adj; }
            if (opts.live) { const o = m.p[1 - i]; const rr = opts.live.pvpRewardCoins(lb, win, o.bot ? 'ai:' + o.nickname : String(o.uid || o.key || ''), (now() - m.startAt) / 1000, now()); coins = p.master ? coins : rr.coins; note = rr.note || note; left = rr.left; if (ranked) opts.live.pvpTierUp(lb, pv.rating, now()); }
            lb.coins += coins;
            rating = pv.rating; streak = pv.streak | 0;
          }));
        } catch (e) { console.error('[lbpvp2] 결과 저장 실패', e.message); }
        if (win && ranked && typeof accounts.bonkaeRun === 'function') { try { await accounts.bonkaeRun(p.uid, p.deck, 'pvp', {}); } catch (e) { /* 본캐 출연료 실패는 결과에 영향 없음 */ } }
      }
      p.rating = rating;
      if (m.ai && !p.uid && !draw) { const k = p.key, s = guestAdj.get(k + ':s') || { w: 0, l: 0 }; let adj = guestAdj.get(k) || 0; if (win) { s.w++; s.l = 0; if (s.w >= 2) { adj = Math.min(0.15, adj + 0.05); s.w = 0; } } else { s.l++; s.w = 0; if (s.l >= 2) { adj = Math.max(-0.15, adj - 0.05); s.l = 0; } } guestAdj.set(k, adj); guestAdj.set(k + ':s', s); p.aiAdj = adj; }
      const r = { id: m.id, v: 2, win, draw, delta, coins, rating, before, streak, reason, ranked, ai: m.ai, note, left, hp: st[i].hp, oppHp: st[1 - i].hp, kills: st[i].kills, oppKills: st[1 - i].kills, sec: Math.round(m.d.t), kb: Math.round((p.net || 0) / 102.4) / 10 };
      if (p.socket) p.socket.emit('end', r);
      ended.set(p.key, { r, at: now() });
    }
    for (const [k, v] of ended) if (now() - v.at > 10 * 60e3) ended.delete(k);
  }

  function attach(nsp) {
    nspRef = nsp;
    nsp.on('connection', async (socket) => {
      await ready;
      const p = await playerOf(socket);
      const old = byUser.get(p.key);
      for (const w of [...queue, ...codes.values()]) if (w.key === p.key && w !== old) unqueue(w);
      if (old && old.match && !old.match.over) {
        const prev = old.socket;
        old.socket = socket; cancelT(old.leftT); old.leftT = null;
        socket.data.pl = old;
        if (prev && prev !== socket) prev.disconnect(true);
        const m = old.match;
        M.D2.clearBot(m.d, old.side);
        old.tt = M.P2.newTypeTable(); // 새 연결: 진상 종류 표를 처음부터 다시
        socket.emit('rejoin', info(m, old.side, { startIn: m.startAt - now(), t: m.d.t }));
      } else {
        socket.data.pl = p;
        const e = ended.get(p.key), mid = String((socket.handshake.auth && socket.handshake.auth.mid) || '');
        if (e && mid && e.r.id === mid) { ended.delete(p.key); socket.emit('end', e.r); }
      }
      const me = () => socket.data.pl;
      const ack = (fn, v) => { if (typeof fn === 'function') fn(v); };
      const busy = (fn) => { if (me().match) { ack(fn, { ok: false, message: '이미 대전 중이에요' }); return true; } return false; };
      socket.on('queue', async (b, fn) => {
        await freshLb(me());
        if (busy(fn)) return;
        const pl = me(); unqueue(pl); setDeck(pl, b);
        if (!deckOk(pl)) return ack(fn, { ok: false, message: '덱에 멤버를 넣어 주세요' });
        pl.queuedAt = now(); queue.push(pl);
        tryPair();
        ack(fn, pl.match ? { ok: true, matched: true } : { ok: true, waiting: true, botIn: T.botAfter });
      });
      socket.on('cancel', (b, fn) => { unqueue(me()); ack(fn, { ok: true }); });
      socket.on('botnow', async (b, fn) => {
        await freshLb(me());
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        if (b && b.deck) setDeck(pl, b);
        if (!deckOk(pl)) return ack(fn, { ok: false, message: '덱에 멤버를 넣어 주세요' });
        unqueue(pl); makeMatch(pl, makeBot(pl)); ack(fn, { ok: true, matched: true });
      });
      socket.on('room:create', async (b, fn) => {
        await freshLb(me());
        if (busy(fn)) return;
        const pl = me(); unqueue(pl); setDeck(pl, b);
        ack(fn, { ok: true, code: openRoom(pl, b) });
      });
      socket.on('rooms:list', (b, fn) => ack(fn, { ok: true, rooms: roomList() }));
      socket.on('room:leave', (b, fn) => { unqueue(me()); ack(fn, { ok: true }); });
      socket.on('room:join', async (b, fn) => {
        await freshLb(me());
        const pl = me();
        const host = codes.get(String((b && b.code) || ''));
        if (!host || host === pl || host.match) return ack(fn, { ok: false, message: '없어진 방이에요' });
        if (host.key === pl.key) return ack(fn, { ok: false, message: '내가 만든 방이에요' });
        if (busy(fn)) return;
        setDeck(pl, b);
        unqueue(host); unqueue(pl);
        makeMatch(host, pl);
        ack(fn, { ok: true });
      });
      // 판 입력 (서버가 확인: 모양 · 횟수 · 판 규칙)
      socket.on('in', (q, fn) => {
        const pl = me(), m = pl.match;
        if (!m || m.over || pl.side < 0) return ack(fn, { ok: false, msg: '대전 중이 아니에요' });
        if (now() < m.startAt) return ack(fn, { ok: false, msg: '아직 시작 전' });
        if (!M.P2.rateOk(pl.bucket, now() / 1000)) return ack(fn, { ok: false, msg: '너무 빨라요' });
        const c = M.P2.cleanInput(q);
        if (!c) return ack(fn, { ok: false, msg: '이상한 입력' });
        ack(fn, M.D2.input(m.d, pl.side, c));
      });
      socket.on('quit', () => { const pl = me(); if (pl.match) finish(pl.match, pl, 'quit'); else unqueue(pl); });
      socket.on('disconnect', () => {
        const pl = me();
        unqueue(pl);
        if (pl.socket !== socket) return;
        const m = pl.match;
        if (m && !m.over) {
          pl.socket = null;
          byUser.set(pl.key, pl);
          M.D2.setBot(m.d, pl.side, { skill: 0.6 }); // 끊긴 동안 AI 가 대신 (조금 서툴게)
          pl.leftT = later(T.grace, () => { if (!pl.socket && pl.match === m) finish(m, pl, 'forfeit'); });
        }
      });
    });
  }
  function close() { for (const t of timers) { clearTimeout(t); clearInterval(t); } timers.clear(); }
  return { attach, close, queue, matches, codes, finish, makeBot, roomList, ready, T, aiDeck: (pl, rng) => aiDeck(M.D, pl, rng || Math.random), aiPower: (id, m) => aiPower(M.D, id, m), fpOf: (pl) => { pl.deck = pl.deck || []; refreshLo(pl); return pl.fp; } };
}

module.exports = { createLbPvp2, REWARD };
