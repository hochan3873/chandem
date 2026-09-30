'use strict';
// 랑방 대전 실시간 1:1 대전 (Random Dice 처럼): Socket.IO 네임스페이스 /lbpvp
//  - 매칭 대기열 (20초 안에 상대가 없으면 "연습 상대" 봇) · 방 코드로 친구 대전
//  - 두 사람은 같은 시드로 각자 자기 줄을 막는다. 처치로 "보내기" 게이지를 모아 상대에게 진상을 보낸다 (1초 늦게 도착)
//  - 서버가 판정: 게이지(처치 수) · 보내기 간격 · 입구 보고 확인, 먼저 입구가 뚫리면 패배, 끊기면 15초 뒤 기권
//  - 로그인한 사람끼리만 점수(레이팅)가 바뀐다. 봇 판은 연습 (코인만 조금)
const crypto = require('crypto');

const SEND = { small: { cost: 10, gap: 3000 }, big: { cost: 30, gap: 3000 } }; // 필요한 처치 수 · 최소 간격
const REWARD = { win: 200, lose: 60, bot: 40 };
const START_RATING = 1000;

function createLbPvp(opts) {
  const { accounts, normLb } = opts;
  const now = opts.now || Date.now;
  const T = {
    botAfter: opts.botAfterMs !== undefined ? opts.botAfterMs : 20000,
    grace: opts.graceMs !== undefined ? opts.graceMs : 15000,
    delay: opts.sendDelayMs !== undefined ? opts.sendDelayMs : 1000,
    countdown: opts.countdownMs !== undefined ? opts.countdownMs : 3000,
    botTick: opts.botTickMs !== undefined ? opts.botTickMs : 1000,
    roomTtl: opts.roomTtlMs !== undefined ? opts.roomTtlMs : 10 * 60e3, // 빈 방은 10분 뒤 없어진다
  };
  const eloDelta = opts.eloDelta;
  const queue = []; // 대기 중인 선수
  const codes = new Map(); // 방 코드 → 선수 (방장)
  let nspRef = null;
  const matches = new Map();
  const byUser = new Map(); // 끊겼다 다시 들어오기용: userId|guestId → 선수
  const timers = new Set();
  const later = (ms, fn) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
  const cancelT = (t) => { if (t) { clearTimeout(t); timers.delete(t); } };

  // 선수: 소켓 하나 = 선수 하나
  async function playerOf(socket) {
    const tok = String((socket.handshake.auth && socket.handshake.auth.token) || '');
    const uid = tok ? accounts.verifyToken(tok) : null;
    let wins = 0, nickname = '손님', username = '', rating = START_RATING, games = 0, master = false, title = '', frame = '';
    if (uid) {
      const u = await accounts.store.byId(uid);
      if (u) { nickname = u.nickname; username = u.username; const pv = (u.stats.langbang || {}).pvp || {}; rating = pv.rating | 0 || START_RATING; games = pv.games | 0; wins = pv.wins | 0; title = typeof u.stats.langbang.title === 'string' ? u.stats.langbang.title.slice(0, 24) : ''; frame = typeof u.stats.langbang.frame === 'string' ? u.stats.langbang.frame.slice(0, 24) : ''; master = !!(opts.isMaster && opts.isMaster(u.username)); }
    }
    return { socket, uid, master, key: uid || 'g:' + socket.id, nickname, username, rating, games, wins, title, frame, deck: [], power: 0, match: null, kills: 0, spent: 0, lastSend: 0, hp: 1, max: 1, wave: 0, dead: false, left: null };
  }
  const pub = (p) => ({ nickname: p.nickname, username: p.username || '', rating: p.rating, deck: p.deck, bot: !!p.bot, power: p.power | 0, games: p.games | 0, wins: p.wins | 0, title: p.title || '', frame: p.frame || '' });
  // 상대 미니 화면용 (영웅 · 스킬 준비 · 최근 카드 · 진상 수 · 총공지) — 짧은 문자열만
  const cleanView = (b) => ({
    enemies: Math.max(0, Math.min(999, Math.floor(Number(b.enemies) || 0))),
    heroes: (Array.isArray(b.heroes) ? b.heroes : []).slice(0, 8).map((h) => ({ id: String((h && h.id) || '').slice(0, 16), r: !!(h && h.r), lv: Math.max(1, Math.min(5, Math.floor(Number(h && h.lv) || 1))) })),
    cards: (Array.isArray(b.cards) ? b.cards : []).slice(-3).map((c) => String(c || '').slice(0, 24)),
    ults: Math.max(0, Math.min(999, Math.floor(Number(b.ults) || 0))),
  });

  function makeMatch(a, b) {
    const id = crypto.randomBytes(6).toString('base64url');
    const m = { id, seed: crypto.randomBytes(4).readUInt32LE(0), a, b, startAt: now() + T.countdown, over: false, bot: !!b.bot };
    a.match = m; b.match = m;
    for (const p of [a, b]) { p.kills = 0; p.spent = 0; p.lastSend = 0; p.dead = false; p.hp = 1; p.max = 1; p.wave = 0; }
    matches.set(id, m);
    for (const [me, op] of [[a, b], [b, a]]) if (me.socket) me.socket.emit('match', { id, seed: m.seed, startIn: T.countdown, opp: pub(op), you: pub(me) });
    if (m.bot) startBot(m, b);
    return m;
  }
  const other = (m, p) => (m.a === p ? m.b : m.a);
  const tierName = (r) => (r >= 1800 ? '👑 그랜드마스터' : r >= 1650 ? '🔮 마스터' : r >= 1500 ? '💎 다이아' : r >= 1350 ? '🛡️ 플래티넘' : r >= 1200 ? '🥇 골드' : r >= 1050 ? '🥈 실버' : r >= 900 ? '🥉 브론즈' : '⚙️ 아이언');
  function roomList() {
    const t = now();
    return [...codes.entries()].filter(([, h]) => !h.match && h.room).sort((a, b) => a[1].room.at - b[1].room.at).map(([code, h]) => ({
      code, title: h.room.title, host: h.nickname, hostTitle: h.title || '', hostFrame: h.frame || '', rating: h.rating, tier: tierName(h.rating), games: h.games | 0, wins: h.wins | 0,
      power: h.room.power, waitSec: Math.floor((t - h.room.at) / 1000), guest: !h.uid,
    }));
  }
  function broadcastRooms() { if (nspRef) nspRef.emit('rooms', roomList()); }
  function openRoom(pl, b) {
    let code;
    do code = String(Math.floor(1000 + Math.random() * 9000)); while (codes.has(code));
    codes.set(code, pl);
    pl.room = { at: now(), title: String((b && b.title) || '').replace(/[<>]/g, '').slice(0, 20) || `${pl.nickname}의 방`, power: Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0))) };
    cancelT(pl.roomT);
    pl.roomT = later(T.roomTtl, () => { if (!pl.match && codes.get(code) === pl) { codes.delete(code); pl.room = null; if (pl.socket) pl.socket.emit('roomClosed', { reason: 'ttl' }); broadcastRooms(); } });
    broadcastRooms();
    return code;
  }
  function unqueue(p) { const i = queue.indexOf(p); if (i >= 0) queue.splice(i, 1); cancelT(p.botT); p.botT = null; cancelT(p.roomT); p.roomT = null; let gone = false; for (const [c, q] of codes) if (q === p) { codes.delete(c); gone = true; } p.room = null; if (gone) broadcastRooms(); }

  // ─── 봇 (연습 상대): 서버에서 간단히 흉내 — 시간이 갈수록 입구가 닳고, 가끔 보내기 ───
  function makeBot(pl) {
    return { bot: true, nickname: '연습 상대 🤖', rating: pl.rating, deck: ['bangjang', 'staff', 'gunman', 'gunnyeo'], power: pl.power | 0, games: 0, wins: 0, hp: 300, max: 300, kills: 0, spent: 0, wave: 0, dead: false, socket: null, hurt: 0 };
  }
  function startBot(m, bot) {
    const t0 = m.startAt;
    const tick = () => {
      if (m.over) return;
      const el = Math.max(0, (now() - t0) / 1000);
      bot.wave = 1 + Math.floor(el / 20);
      bot.kills += 2 + Math.floor(el / 40);
      bot.hp = Math.max(0, bot.hp - (el > 60 ? 0.6 + (el - 60) * 0.03 : 0.2) - bot.hurt);
      bot.hurt *= 0.6;
      const human = other(m, bot);
      if (human.socket) human.socket.emit('opp', { hp: Math.round(bot.hp), max: bot.max, kills: bot.kills, wave: bot.wave, enemies: 8 + Math.floor(el / 10), heroes: bot.deck.map((id, i) => ({ id, r: (Math.floor(el) + i * 5) % 20 < 3, lv: Math.min(5, 1 + Math.floor(el / 40)) })), cards: [], ults: Math.floor(el / 60) });
      if (el > 20 && bot.kills - bot.spent >= SEND.small.cost && Math.random() < 0.25) { bot.spent += SEND.small.cost; deliver(m, bot, 'small'); }
      if (el > 110 && bot.kills - bot.spent >= SEND.big.cost && Math.random() < 0.15) { bot.spent += SEND.big.cost; deliver(m, bot, 'big'); }
      if (bot.hp <= 0) { finish(m, bot, 'dead'); return; }
      bot.tickT = later(T.botTick, tick);
    };
    bot.tickT = later(T.countdown + T.botTick, tick);
  }
  function deliver(m, from, kind) {
    const to = other(m, from);
    later(T.delay, () => {
      if (m.over) return;
      if (to.bot) { to.hurt += kind === 'big' ? 18 : 6; return; }
      if (to.socket) to.socket.emit('incoming', { kind });
    });
    if (from.socket) from.socket.emit('sent', { kind });
  }
  // 판 끝: loser 가 졌다 (reason: dead | forfeit | quit)
  async function finish(m, loser, reason) {
    if (m.over) return;
    m.over = true;
    matches.delete(m.id);
    const winner = other(m, loser);
    for (const p of [m.a, m.b]) { cancelT(p.tickT); cancelT(p.leftT); p.match = null; if (!p.bot) byUser.delete(p.key); }
    const ranked = !m.bot && winner.uid && loser.uid && winner.uid !== loser.uid && !winner.master && !loser.master; // 마스터 테스트 판은 점수 안 바뀜
    const d = ranked ? Math.max(8, eloDelta(winner.rating, loser.rating, 1, winner.games)) : 0;
    const res = new Map();
    for (const p of [winner, loser]) {
      if (p.bot) continue;
      const win = p === winner;
      const delta = ranked ? (win ? d : -d) : 0;
      const coins = m.bot ? (win ? REWARD.bot : 0) : win ? REWARD.win : REWARD.lose;
      let rating = p.rating;
      if (p.uid) {
        try {
          await accounts.exclusive(async () => accounts.updateStats(p.uid, (st) => {
            const lb = st.langbang = normLb(st.langbang);
            const pv = lb.pvp = lb.pvp || { rating: START_RATING, games: 0, wins: 0 };
            if (ranked) { pv.rating = Math.max(0, (pv.rating | 0 || START_RATING) + delta); pv.games++; if (win) pv.wins++; }
            pv.last = now();
            lb.coins += coins;
            rating = pv.rating;
          }));
        } catch (e) { console.error('[lbpvp] 결과 저장 실패', e.message); }
      }
      p.rating = rating;
      res.set(p, { win, delta, coins, rating, reason, ranked, bot: m.bot });
    }
    for (const [p, r] of res) if (p.socket) p.socket.emit('end', r);
    return res;
  }

  function attach(nsp) {
    nspRef = nsp;
    nsp.on('connection', async (socket) => {
      const p = await playerOf(socket);
      // 끊겼다가 다시 들어온 사람: 판 이어서
      const old = byUser.get(p.key);
      if (old && old.match && !old.match.over && p.uid) {
        old.socket = socket; cancelT(old.leftT); old.leftT = null;
        socket.data.pl = old;
        const m = old.match;
        socket.emit('rejoin', { id: m.id, seed: m.seed, startAt: m.startAt, now: now(), opp: pub(other(m, old)) });
      } else socket.data.pl = p;
      const me = () => socket.data.pl;
      const ack = (fn, v) => { if (typeof fn === 'function') fn(v); };
      socket.on('queue', (b, fn) => {
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0)));
        unqueue(pl);
        const opp = queue.find((q) => q !== pl && q.key !== pl.key);
        if (opp) { unqueue(opp); makeMatch(opp, pl); return ack(fn, { ok: true, matched: true }); }
        queue.push(pl);
        pl.botT = later(T.botAfter, () => { if (!pl.match && queue.includes(pl)) { unqueue(pl); makeMatch(pl, makeBot(pl)); } });
        ack(fn, { ok: true, waiting: true, botIn: T.botAfter });
      });
      socket.on('cancel', (b, fn) => { unqueue(me()); ack(fn, { ok: true }); });
      socket.on('room:create', (b, fn) => {
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        unqueue(pl);
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0)));
        const code = openRoom(pl, b);
        ack(fn, { ok: true, code });
      });
      // 방 목록 (들어오면 한 번, 바뀔 때마다 'rooms' 로 다시 온다)
      socket.on('rooms:list', (b, fn) => ack(fn, { ok: true, rooms: roomList() }));
      // 빠른 매칭: 제일 오래 기다린 방에 들어가고, 없으면 방을 연다 (20초 안에 아무도 없으면 연습 상대)
      socket.on('quick', (b, fn) => {
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0)));
        unqueue(pl);
        const oldest = [...codes.values()].filter((h) => h !== pl && !h.match && h.key !== pl.key && h.room).sort((x, y) => x.room.at - y.room.at)[0];
        if (oldest) { unqueue(oldest); makeMatch(oldest, pl); return ack(fn, { ok: true, matched: true }); }
        const code = openRoom(pl, Object.assign({}, b, { title: '빠른 매칭' }));
        pl.botT = later(T.botAfter, () => { if (!pl.match && codes.get(code) === pl) { unqueue(pl); makeMatch(pl, makeBot(pl)); } });
        ack(fn, { ok: true, waiting: true, code, botIn: T.botAfter });
      });
      socket.on('room:leave', (b, fn) => { unqueue(me()); ack(fn, { ok: true }); });
      socket.on('room:join', (b, fn) => {
        const pl = me();
        const host = codes.get(String((b && b.code) || ''));
        if (!host || host === pl || host.match) return ack(fn, { ok: false, message: '없어진 방이에요' });
        if (host.key === pl.key) return ack(fn, { ok: false, message: '내가 만든 방이에요' });
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0)));
        unqueue(host); unqueue(pl);
        makeMatch(host, pl);
        ack(fn, { ok: true });
      });
      // 1초마다 입구 · 처치 보고 → 상대 화면에 보여 준다 (서버가 말이 되는지 확인)
      socket.on('hp', (b) => {
        const pl = me(), m = pl.match;
        if (!m || m.over || !b) return;
        const el = (now() - m.startAt) / 1000;
        const kills = Math.max(0, Math.floor(Number(b.kills) || 0));
        if (kills < pl.kills || kills > Math.max(0, el) * 6 + 30) return; // 처치 수는 줄지 않고, 너무 빠를 수 없다
        pl.kills = kills;
        pl.max = Math.max(1, Math.min(1e6, Number(b.max) || 1));
        pl.hp = Math.max(0, Math.min(pl.max, Number(b.hp) || 0));
        pl.wave = Math.max(0, Math.floor(Number(b.wave) || 0));
        const op = other(m, pl);
        if (op.socket) op.socket.emit('opp', Object.assign({ hp: Math.round(pl.hp), max: Math.round(pl.max), kills: pl.kills, wave: pl.wave }, cleanView(b)));
        if (pl.hp <= 0) finish(m, pl, 'dead');
      });
      socket.on('send', (b, fn) => {
        const pl = me(), m = pl.match;
        const kind = b && b.kind === 'big' ? 'big' : 'small';
        if (!m || m.over) return ack(fn, { ok: false });
        const s = SEND[kind];
        if (now() < m.startAt) return ack(fn, { ok: false, message: '아직 시작 전이에요' });
        if (pl.kills - pl.spent < s.cost) return ack(fn, { ok: false, message: '게이지가 모자라요' });
        if (now() - pl.lastSend < s.gap) return ack(fn, { ok: false, message: '잠깐 뒤에 다시!' });
        pl.spent += s.cost; pl.lastSend = now();
        deliver(m, pl, kind);
        ack(fn, { ok: true, left: pl.kills - pl.spent });
      });
      socket.on('dead', () => { const pl = me(); if (pl.match) finish(pl.match, pl, 'dead'); });
      socket.on('quit', () => { const pl = me(); if (pl.match) finish(pl.match, pl, 'quit'); else unqueue(pl); });
      socket.on('disconnect', () => {
        const pl = me();
        unqueue(pl);
        if (pl.socket !== socket) return;
        const m = pl.match;
        if (m && !m.over) {
          pl.socket = null;
          byUser.set(pl.key, pl);
          pl.leftT = later(T.grace, () => { if (!pl.socket && pl.match === m) finish(m, pl, 'forfeit'); });
        }
      });
    });
  }
  function close() { for (const t of timers) clearTimeout(t); timers.clear(); }
  return { attach, close, queue, matches, finish, roomList, SEND, REWARD };
}

module.exports = { createLbPvp, SEND, REWARD };
