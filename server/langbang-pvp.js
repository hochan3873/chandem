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
  // 보상 규칙은 화면과 같은 live.js 에서 (하루 판 수 · 첫 승 · 등급 달성 우편)
  if (!opts.live) import(require('url').pathToFileURL(require('path').join(__dirname, '..', 'public', 'langbang', 'live.js')).href).then((m) => { opts.live = m; }).catch(() => {});
  // AI 상대: 화면과 같은 시뮬레이션(sim.js)을 서버에서 돌린다
  const AI = opts.ai || {};
  const lbMod = (f) => import(require('url').pathToFileURL(require('path').join(__dirname, '..', 'public', 'langbang', f)).href);
  const simReady = Promise.all([lbMod('sim.js'), lbMod('data.js'), lbMod('pvp.js')]).then(([S, D, PV]) => { AI.S = S; AI.D = D; AI.PV = PV; }).catch((e) => console.error('[lbpvp] AI 시뮬 불러오기 실패', e.message));
  void simReady;
  const now = opts.now || Date.now;
  const T = {
    botAfter: opts.botAfterMs !== undefined ? opts.botAfterMs : 30000, // 30초 동안 사람을 먼저 찾는다
    grace: opts.graceMs !== undefined ? opts.graceMs : 15000,
    delay: opts.sendDelayMs !== undefined ? opts.sendDelayMs : 1000,
    countdown: opts.countdownMs !== undefined ? opts.countdownMs : 3000,
    botTick: opts.botTickMs !== undefined ? opts.botTickMs : 1000,
    roomTtl: opts.roomTtlMs !== undefined ? opts.roomTtlMs : 10 * 60e3, // 빈 방은 10분 뒤 없어진다
    aiNotice: opts.aiNoticeMs,
    len: opts.matchMs !== undefined ? opts.matchMs : 300e3, // 300초: 둘 다 살아 있으면 판정 (pvp.js PVP_END.end)
    judgeGrace: opts.judgeGraceMs !== undefined ? opts.judgeGraceMs : 1500, // 마지막 입구 보고를 기다렸다가
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
    let lbSnap = null, wins = 0, nickname = '손님', username = '', rating = START_RATING, games = 0, master = false, title = '', frame = '', aiAdj = 0;
    if (uid) {
      const u = await accounts.store.byId(uid);
      if (u) { nickname = u.nickname; username = u.username; const pv = (u.stats.langbang || {}).pvp || {}; rating = pv.rating | 0 || START_RATING; games = pv.games | 0; wins = pv.wins | 0; aiAdj = pv.ai ? Number(pv.ai.adj) || 0 : 0; title = typeof u.stats.langbang.title === 'string' ? u.stats.langbang.title.slice(0, 24) : ''; frame = typeof u.stats.langbang.frame === 'string' ? u.stats.langbang.frame.slice(0, 24) : ''; master = !!(opts.isMaster && opts.isMaster(u.username)); lbSnap = u.stats.langbang || null; }
    }
    if (!uid) aiAdj = guestAdj.get('g:' + socket.id) || 0;
    return { socket, uid, master, aiAdj, key: uid || 'g:' + socket.id, nickname, username, rating, games, wins, title, frame, lb: lbSnap, fp: 0, deck: [], power: 0, match: null, kills: 0, spent: 0, lastSend: 0, hp: 1, max: 1, wave: 0, dead: false, left: null };
  }
  const guestAdj = new Map();
  const pub = (p) => ({ nickname: p.nickname, username: p.username || '', rating: p.rating, deck: p.deck, bot: !!p.bot, ai: !!p.ai, power: p.power | 0, games: p.games | 0, wins: p.wins | 0, title: p.title || '', frame: p.frame || '' });
  // 상대 미니 화면용 (영웅 · 스킬 준비 · 최근 카드 · 진상 수 · 총공지) — 짧은 문자열만
  const cleanView = (b) => ({
    enemies: Math.max(0, Math.min(999, Math.floor(Number(b.enemies) || 0))),
    heroes: (Array.isArray(b.heroes) ? b.heroes : []).slice(0, 8).map((h) => ({ id: String((h && h.id) || '').slice(0, 16), r: !!(h && h.r), lv: Math.max(1, Math.min(5, Math.floor(Number(h && h.lv) || 1))) })),
    cards: (Array.isArray(b.cards) ? b.cards : []).slice(-3).map((c) => String(c || '').slice(0, 24)),
    ults: Math.max(0, Math.min(999, Math.floor(Number(b.ults) || 0))),
  });

  function makeMatch(a, b) {
    const id = crypto.randomBytes(6).toString('base64url');
    const aiNote = b.ai ? (T.aiNotice !== undefined ? T.aiNotice : 1500) : 0; // AI 판: "사람 상대가 없어 AI와 대전해요" 1.5초 뒤 VS
    const m = { id, seed: crypto.randomBytes(4).readUInt32LE(0), a, b, startAt: now() + T.countdown + aiNote, over: false, bot: !!b.bot };
    m.hp = matchHp(a, b); // 두 덱 전투력 → 진상 체력 (두 사람 똑같이)
    a.match = m; b.match = m;
    m.endT = later(T.countdown + aiNote + T.len + T.judgeGrace, () => judgeTime(m));
    for (const p of [a, b]) { p.kills = 0; p.spent = 0; p.lastSend = 0; p.dead = false; p.hp = 1; p.max = 1; p.wave = 0; }
    matches.set(id, m);
    for (const [me, op] of [[a, b], [b, a]]) if (me.socket) me.socket.emit('match', { id, seed: m.seed, hp: m.hp, len: T.len, startIn: T.countdown + aiNote, aiNotice: aiNote, opp: pub(op), you: pub(me) });
    if (m.bot) startBot(m, b);
    return m;
  }
  const other = (m, p) => (m.a === p ? m.b : m.a);
  const tierName = (r) => (r >= 1800 ? '랑방킹' : r >= 1500 ? '다이아' : r >= 1350 ? '플래티넘' : r >= 1200 ? '골드' : r >= 1050 ? '실버' : '브론즈'); // 엠블럼 6종과 같게
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
  // 사람 먼저: 아직 시작 안 한 AI 판에 있는 사람이 있으면 그 판을 없던 일로 하고 둘을 붙인다
  function stealFromAi(pl) {
    for (const m of matches.values()) {
      if (!m.bot || m.over || now() >= m.startAt) continue;
      const h = m.a.bot ? m.b : m.a;
      if (h === pl || h.key === pl.key) continue;
      m.over = true; matches.delete(m.id);
      const bot = other(m, h); cancelT(bot.tickT); h.match = null;
      return h;
    }
    return null;
  }
  function unqueue(p) { const i = queue.indexOf(p); if (i >= 0) queue.splice(i, 1); cancelT(p.botT); p.botT = null; cancelT(p.roomT); p.roomT = null; let gone = false; for (const [c, q] of codes) if (q === p) { codes.delete(c); gone = true; } p.room = null; if (gone) broadcastRooms(); }

  // ─── AI 상대 (30초 동안 사람이 없으면) : 같은 실력 · 같은 규칙 · 진짜로 판을 돌린다 ───
  const AI_NICK = ['야식왕', '골목대장', '랑방단골', '막차탑승', '노래방VIP', '새벽두시', '편의점요정', '치킨은반반', '라떼는말야', '오늘도출근', '월요병환자', '소주한잔'];
  function aiPower(D, id, m) { const h = D.HEROES[id]; return (h.dmg / h.interval) * D.tierPower(D.heroTier(id), m) * 10; }
  // 덱: 비슷한 전투력 (±5%) · 절반은 상대 속성을 노린 구성
  function aiDeck(D, pl, rng) {
    const mmax = (id) => Math.min(AI.PV ? AI.PV.PVP_NORM.meta : 10, D.metaMaxOf(id)); // 대전: 강화 +10 까지만
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
  function makeBot(pl) {
    const base = { bot: true, nickname: '연습 상대', rating: pl.rating, deck: ['bangjang', 'staff', 'gunman', 'gunnyeo'], power: pl.power | 0, games: 0, wins: 0, hp: 300, max: 300, kills: 0, spent: 0, wave: 0, dead: false, socket: null, hurt: 0 };
    if (!AI.S) return base;
    const seed = crypto.randomBytes(4).readUInt32LE(0);
    let a = seed; const rng = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const dk = aiDeck(AI.D, Object.assign({}, pl, { power: pl.fp || pl.power }), rng); // 대전 기준 전투력 (강화 +10 · 영웅 장비까지)
    const r = Math.max(800, Math.round(pl.rating + (rng() - 0.5) * 80));
    return Object.assign(base, { ai: true, nickname: AI_NICK[Math.floor(rng() * AI_NICK.length)] + Math.floor(10 + rng() * 89), rating: r, deck: dk.deck, meta: dk.meta, power: dk.power, games: 20 + Math.floor(rng() * 200), rng, adj: Math.max(-0.15, Math.min(0.15, pl.aiAdj || 0)) });
  }
  // AI 판단: 사람처럼 0.4~1.2초 늦게 · 가끔 실수 · 뭉친 곳에 스킬 · 입구가 위험하면 먼저 · 보스·떼거리에 총공지
  function aiThink(g, bot, S, D) {
    const rng = bot.rng, eff = 1 + bot.adj, miss = Math.max(0.02, 0.1 - bot.adj * 0.5);
    while (g.pendingLevels > 0) { const c = S.rollCards(g); const sc = (x) => (x.kind === 'join' ? 100 : x.kind === 'heroLv' ? 60 : /공격|공속/.test((x.title || '') + (x.desc || '')) ? 50 : 20) + rng() * 10 * (1 - eff + 1); c.sort((p, q) => sc(q) - sc(p)); S.applyCard(g, rng() < miss ? c[c.length - 1] : c[0]); g.pendingLevels--; }
    if (g.augOffer) S.applyAug(g, g.augOffer.opts[rng() < miss ? g.augOffer.opts.length - 1 : 0]);
    bot.plan = bot.plan || [];
    const alive = g.enemies.filter((e) => !e.dead && e.y > 0);
    const boss = alive.find((e) => e.boss || e.mid);
    const doorLow = g.base.hp / g.base.max < 0.5;
    let cl = null, cn = 0;
    for (const e of alive) { let n = 0; for (const o of alive) if (Math.abs(o.x - e.x) < 80 && Math.abs(o.y - e.y) < 80) n++; if (n > cn) { cn = n; cl = e; } }
    for (const h of g.heroes) {
      if (!S.skillReady(h) || bot.plan.some((p) => p.h === h)) continue;
      const good = cn >= 3 || doorLow || (boss && rng() < 0.6);
      if (!good) continue;
      const t = boss && rng() < 0.5 ? boss : cl;
      if (!t) continue;
      bot.plan.push({ at: g.t + 0.4 + rng() * 0.8, h, x: t.x, y: t.y });
    }
    if (g.ult >= D.RULES.ultMax && (boss || alive.length >= 8 || doorLow) && !bot.plan.some((p) => p.ult)) bot.plan.push({ at: g.t + 0.4 + rng() * 0.8, ult: true });
    const due = bot.plan.filter((p) => p.at <= g.t); bot.plan = bot.plan.filter((p) => p.at > g.t);
    for (const p of due) { if (rng() < miss) continue; if (p.ult) S.useUlt(g); else if (S.skillReady(p.h)) S.castSkill(g, p.h, p.x, p.y); }
  }
  function startBot(m, bot) {
    if (!bot.ai || !AI.S) return startScriptBot(m, bot);
    const S = AI.S, D = AI.D;
    const g = S.createGame({ H: 760, rng: bot.rng, mode: 'stage', stage: 12 + (m.seed % 17), pvp: { seed: m.seed, hp: m.hp }, deck: [...bot.deck, null], leader: bot.deck[0], meta: bot.meta, tempo: true, join: true, unlocked: D.LOCKED_HEROES.slice() });
    g.mods.dmg *= 1 + bot.adj; // 조정: 사람이 두 번 연속 지면 -5% · 이기면 +5% (±15%)
    bot.g = g;
    const human = other(m, bot);
    const dt = 1 / 30, per = Math.max(1, Math.round((T.botTick / 1000) / dt));
    const tick = () => {
      if (m.over) return;
      for (let k = 0; k < per && !g.over; k++) { S.step(g, dt); g.events.length = 0; }
      aiThink(g, bot, S, D);
      bot.hp = g.base.hp; bot.max = g.base.max; bot.kills = g.stats.kills; bot.wave = g.wave;
      if (human && human.socket) human.socket.emit('opp', { hp: Math.round(g.base.hp), max: g.base.max, kills: bot.kills, wave: g.wave, enemies: g.enemies.filter((e) => !e.dead).length, heroes: g.heroes.filter((h) => !h.def.summon).map((h) => ({ id: h.id, r: S.skillReady(h), lv: h.lv })), cards: [], ults: g.stats.ults | 0 });
      const left = g.pvp.timeUp ? 0 : bot.kills - bot.spent, gapOk = now() - (bot.lastSend || 0) >= SEND.big.gap;
      if (gapOk && left >= SEND.big.cost && bot.rng() < 0.3) { bot.spent += SEND.big.cost; bot.lastSend = now(); deliver(m, bot, 'big'); }
      else if (gapOk && left >= SEND.small.cost && bot.rng() < 0.45) { bot.spent += SEND.small.cost; bot.lastSend = now(); deliver(m, bot, 'small'); }
      if (g.over || g.base.hp <= 0) { finish(m, bot, 'dead'); return; }
      bot.tickT = later(T.botTick, tick);
    };
    bot.tickT = later(T.countdown + T.botTick, tick);
  }
  // (시뮬을 못 불러왔을 때만) 예전 흉내 봇
  function startScriptBot(m, bot) {
    const t0 = m.startAt;
    const tick = () => {
      if (m.over) return;
      const el = Math.max(0, (now() - t0) / 1000);
      bot.wave = 1 + Math.floor(el / 20);
      bot.kills += 2 + Math.floor(el / 40);
      bot.hp = Math.max(0, bot.hp - (el > 60 ? 0.6 + (el - 60) * 0.03 : 0.2) - bot.hurt);
      bot.hurt *= 0.6;
      const human = other(m, bot);
      if (human.socket) human.socket.emit('opp', { hp: Math.round(bot.hp), max: bot.max, kills: bot.kills, wave: bot.wave, enemies: 8 + Math.floor(el / 10), heroes: bot.deck.map((id, i) => ({ id, r: (Math.floor(el) + i * 5) % 20 < 3, lv: Math.min(5, 1 + Math.floor(el / 30)) })) });
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
      if (to.bot) { if (to.g && AI.S) { AI.S.pvpIncoming(to.g, kind); to.g.events.length = 0; } else to.hurt += kind === 'big' ? 18 : 6; return; }
      if (to.socket) to.socket.emit('incoming', { kind });
    });
    if (from.socket) from.socket.emit('sent', { kind });
  }
  // 판 끝: loser 가 졌다 (reason: dead | forfeit | quit | time) · loser 가 없으면 무승부 (300초 판정 · 점수 변동 없음)
  async function finish(m, loser, reason) {
    if (m.over) return;
    m.over = true;
    matches.delete(m.id);
    cancelT(m.endT);
    const draw = !loser;
    if (draw) loser = m.b;
    const winner = other(m, loser);
    for (const p of [m.a, m.b]) { cancelT(p.tickT); cancelT(p.leftT); p.match = null; if (!p.bot) byUser.delete(p.key); }
    const aiM = m.bot && (m.a.ai || m.b.ai);
    const human0 = m.a.bot ? m.b : m.a;
    const ranked0 = aiM ? !!human0.uid && !human0.master : !m.bot && winner.uid && loser.uid && winner.uid !== loser.uid && !winner.master && !loser.master; // 마스터 테스트 판은 점수 안 바뀜 · AI 판은 60%
    const ranked = ranked0 && !draw; // 무승부: 점수 · 전적 그대로
    const d = ranked ? Math.max(aiM ? 5 : 8, Math.round(eloDelta(winner.rating, loser.rating, 1, winner.games) * (aiM ? 0.6 : 1))) : 0;
    const res = new Map();
    for (const p of [winner, loser]) {
      if (p.bot) continue;
      const win = !draw && p === winner;
      const delta = ranked ? (win ? d : -d) : 0;
      let coins = m.bot && !aiM ? (win ? REWARD.bot : 0) : win ? REWARD.win : REWARD.lose, note = '', left = null;
      let rating = p.rating, streak = 0;
      const before = p.rating;
      if (p.uid) {
        try {
          await accounts.exclusive(async () => accounts.updateStats(p.uid, (st) => {
            const lb = st.langbang = normLb(st.langbang);
            const pv = lb.pvp = lb.pvp || { rating: START_RATING, games: 0, wins: 0 };
            if (ranked) { pv.rating = Math.max(0, (pv.rating | 0 || START_RATING) + delta); pv.games++; if (win) pv.wins++; pv.streak = win ? (pv.streak | 0) + 1 : 0; pv.best = Math.max(pv.best | 0, pv.streak); }
            pv.last = now();
            if (aiM && !draw) { const a0 = pv.ai = pv.ai || { adj: 0, w: 0, l: 0 }; if (win) { a0.w = (a0.w | 0) + 1; a0.l = 0; if (a0.w >= 2) { a0.adj = Math.min(0.15, (Number(a0.adj) || 0) + 0.05); a0.w = 0; } } else { a0.l = (a0.l | 0) + 1; a0.w = 0; if (a0.l >= 2) { a0.adj = Math.max(-0.15, (Number(a0.adj) || 0) - 0.05); a0.l = 0; } } p.aiAdj = a0.adj; }
            if (opts.live) { const o = other(m, p); const rr = opts.live.pvpRewardCoins(lb, win, o.bot ? (o.ai ? 'ai:' + o.nickname : 'bot') : String(o.uid || o.key || ''), (now() - m.startAt) / 1000, now()); coins = p.master ? coins : rr.coins; note = rr.note || (draw ? '무승부 · 점수 변동 없음' : ''); left = rr.left; if (ranked) opts.live.pvpTierUp(lb, pv.rating, now()); }
            lb.coins += coins;
            rating = pv.rating; streak = pv.streak | 0;
          }));
        } catch (e) { console.error('[lbpvp] 결과 저장 실패', e.message); }
        // 본캐 출연료: 점수가 걸린 판(사람 · AI)에서 이기면 덱 멤버의 본캐 주인에게 (가진 멤버만 · 서버가 다시 확인)
        if (win && ranked && typeof accounts.bonkaeRun === 'function') await accounts.bonkaeRun(p.uid, p.deck, 'pvp', {});
      }
      p.rating = rating;
      if (aiM && !p.uid && !draw) { const k = p.key, st = guestAdj.get(k + ':s') || { w: 0, l: 0 }; let adj = guestAdj.get(k) || 0; if (win) { st.w++; st.l = 0; if (st.w >= 2) { adj = Math.min(0.15, adj + 0.05); st.w = 0; } } else { st.l++; st.w = 0; if (st.l >= 2) { adj = Math.max(-0.15, adj - 0.05); st.l = 0; } } guestAdj.set(k, adj); guestAdj.set(k + ':s', st); p.aiAdj = adj; }
      res.set(p, { win, draw, delta, coins, rating, before, streak, reason, ranked, bot: m.bot, ai: !!aiM, note, left, hp: pctOf(p), oppHp: pctOf(other(m, p)) });
    }
    for (const [p, r] of res) if (p.socket) p.socket.emit('end', r);
    return res;
  }

  // ─── 1:1 대전 전투력 · 진상 체력 · 300초 판정 (pvp.js 규칙 그대로) ───
  // 로그인: 서버에 저장된 강화 · 성급 · 장비로 · 손님: 화면이 보낸 것(lo)을 한도로 잘라서
  function fpOf(pl) {
    const PV = AI.PV;
    if (!PV || pl.bot) return pl.power | 0;
    const src = pl.uid ? pl.lb : pl.guestLo;
    if (src) return PV.pvpFirepower(PV.pvpLoadout(src, pl.deck));
    const top = PV.pvpFirepower(PV.pvpLoadout({ heroes: Object.fromEntries(pl.deck.map((id) => [id, PV.PVP_NORM.meta])) }, pl.deck)); // 보낸 게 없으면: 강화 +10 이 한도
    return pl.power > 0 ? Math.min(pl.power, top) : top;
  }
  function setLoadout(pl, b) {
    const lo = b && b.lo;
    if (!pl.uid && lo && typeof lo === 'object') {
      const pick = (o, f) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).slice(0, 12).map(([k, v]) => [String(k).slice(0, 16), f(v)]));
      pl.guestLo = {
        heroes: pick(lo.heroes, (v) => Math.floor(Number(v) || 0)), hstars: pick(lo.hstars, (v) => Math.floor(Number(v) || 0)),
        equip: pick(lo.equip, (v) => ({ w: v && v.w, a: v && v.a, m: v && v.m })),
        gear: (Array.isArray(lo.gear) ? lo.gear : []).slice(0, 40).map((g) => ({ id: g && g.id, t: String((g && g.t) || ''), r: String((g && g.r) || ''), lv: Math.max(0, Math.min(10, Math.floor(Number(g && g.lv) || 0))) })),
      };
    }
    pl.fp = fpOf(pl);
    if (pl.uid && accounts.store && accounts.store.byId) Promise.resolve(accounts.store.byId(pl.uid)).then((u) => { if (u && u.stats && !pl.match) { pl.lb = u.stats.langbang || pl.lb; pl.fp = fpOf(pl); } }).catch(() => {}); // 기다리는 동안 강화한 것도
  }
  function matchHp(a, b) {
    for (const p of [a, b]) if (!p.bot) { p.fp = fpOf(p); if (AI.PV) p.power = p.fp; }
    return AI.PV ? AI.PV.pvpHpScale(a.bot ? a.power : a.fp, b.bot ? b.power : b.fp) : 1;
  }
  const pctOf = (p) => Math.round((Math.max(0, p.hp) / Math.max(1, p.max)) * 100);
  // 300초: 입구 남은 % → 처치 수 → 무승부 (화면은 멈추고 이 결과를 기다린다)
  function judgeTime(m) {
    if (m.over) return;
    const PV = AI.PV;
    const j = PV ? PV.pvpJudge(m.a, m.b) : Math.sign(m.a.hp / Math.max(1, m.a.max) - m.b.hp / Math.max(1, m.b.max)) || Math.sign(m.a.kills - m.b.kills);
    return finish(m, j > 0 ? m.b : j < 0 ? m.a : null, 'time');
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
        socket.emit('rejoin', { id: m.id, seed: m.seed, hp: m.hp, len: T.len, startAt: m.startAt, now: now(), opp: pub(other(m, old)) });
      } else socket.data.pl = p;
      const me = () => socket.data.pl;
      const ack = (fn, v) => { if (typeof fn === 'function') fn(v); };
      socket.on('queue', (b, fn) => {
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0))); setLoadout(pl, b);
        unqueue(pl);
        const opp = queue.find((q) => q !== pl && q.key !== pl.key) || stealFromAi(pl);
        if (opp) { unqueue(opp); makeMatch(opp, pl); return ack(fn, { ok: true, matched: true }); }
        queue.push(pl);
        pl.botT = later(T.botAfter, () => { if (!pl.match && queue.includes(pl)) { unqueue(pl); makeMatch(pl, makeBot(pl)); } });
        ack(fn, { ok: true, waiting: true, botIn: T.botAfter });
      });
      socket.on('cancel', (b, fn) => { unqueue(me()); ack(fn, { ok: true }); });
      // 손님: 덱 멤버의 강화 · 성급 · 장비 (서버가 대전 한도로 잘라서 진상 체력에 쓴다)
      socket.on('loadout', (b) => { const pl = me(); if (!pl.uid && !pl.match && b && typeof b === 'object') setLoadout(pl, { lo: b }); });
      socket.on('requeue', (b, fn) => {
        const pl = me(), m = pl.match;
        if (!m || !m.bot || m.over || now() >= m.startAt) return ack(fn, { ok: false, message: '이미 시작했어요' });
        m.over = true; matches.delete(m.id);
        const bot = other(m, pl); cancelT(bot.tickT); pl.match = null;
        queue.push(pl);
        pl.botT = later(T.botAfter, () => { if (!pl.match && queue.includes(pl)) { unqueue(pl); makeMatch(pl, makeBot(pl)); } });
        ack(fn, { ok: true, waiting: true, botIn: T.botAfter });
      });
      socket.on('room:create', (b, fn) => {
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        unqueue(pl);
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0))); setLoadout(pl, b);
        const code = openRoom(pl, b);
        ack(fn, { ok: true, code });
      });
      // 방 목록 (들어오면 한 번, 바뀔 때마다 'rooms' 로 다시 온다)
      socket.on('rooms:list', (b, fn) => ack(fn, { ok: true, rooms: roomList() }));
      // 빠른 매칭: 제일 오래 기다린 방에 들어가고, 없으면 방을 연다 (20초 안에 아무도 없으면 연습 상대)
      socket.on('quick', (b, fn) => {
        const pl = me();
        if (pl.match) return ack(fn, { ok: false, message: '이미 대전 중이에요' });
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0))); setLoadout(pl, b);
        unqueue(pl);
        const oldest = [...codes.values()].filter((h) => h !== pl && !h.match && h.key !== pl.key && h.room).sort((x, y) => x.room.at - y.room.at)[0];
        const firstH = oldest || stealFromAi(pl);
        if (firstH) { unqueue(firstH); makeMatch(firstH, pl); return ack(fn, { ok: true, matched: true }); }
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
        pl.deck = Array.isArray(b && b.deck) ? b.deck.slice(0, 6).map(String) : []; pl.power = Math.max(0, Math.min(1e7, Math.floor(Number(b && b.power) || 0))); setLoadout(pl, b);
        unqueue(host); unqueue(pl);
        makeMatch(host, pl);
        ack(fn, { ok: true });
      });
      // 1초마다 입구 · 처치 보고 → 상대 화면에 보여 준다 (서버가 말이 되는지 확인)
      socket.on('hp', (b) => {
        const pl = me(), m = pl.match;
        if (!m || m.over || !b) return;
        const el = (now() - m.startAt) / 1000;
        if (el > T.len / 1000 + 1) return; // 300초 뒤 보고는 안 받는다 (판정은 그때 값으로)
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
        if (now() - m.startAt >= T.len) return ack(fn, { ok: false, message: '시간이 끝났어요' });
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
  return { attach, close, queue, matches, finish, judgeTime, matchHp, fpOf, roomList, SEND, REWARD, aiDeck: (pl, rng) => aiDeck(AI.D, pl, rng || Math.random), aiPower: (id, m) => aiPower(AI.D, id, m), makeBot, aiThink: (g, bot) => aiThink(g, bot, AI.S, AI.D), simReady, AI };
}

module.exports = { createLbPvp, SEND, REWARD };
