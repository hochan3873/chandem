'use strict';
// 마스터(운영자) 관리 API: /api/admin/*
// 모든 요청은 로그인 토큰 → 서버의 계정 아이디로 마스터인지 확인한다. 바꾸는 동작은 전부 운영 기록에 남긴다.
const crypto = require('crypto');
const { AuthError, hashPassword, emptyStats, normLb } = require('./accounts');
const { isMasterName } = require('./masters');

const ACT_PER_MIN = 40;   // 바꾸는 동작 (1분)
const READ_PER_MIN = 240; // 조회

function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'; // 헷갈리는 글자(0 o 1 l i) 뺌
  return Array.from(crypto.randomBytes(10), (b) => abc[b % abc.length]).join('');
}

/**
 * rooms: Map(code → Room), api: { closeRoom(code, reason), kickPlayer(code, id, reason) } — index.js 가 넘겨준다
 */
function createAdmin({ acct, site, rooms, api }) {
  const hits = new Map();
  function limited(key, max) {
    const t = Date.now();
    const list = (hits.get(key) || []).filter((x) => t - x < 60000);
    list.push(t); hits.set(key, list);
    if (hits.size > 2000) hits.clear();
    return list.length > max;
  }
  async function requireMaster(req) {
    const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
    let u;
    try { u = await site.userOf(token); } catch { u = null; }
    if (!u) throw Object.assign(new AuthError('로그인이 필요해요'), { status: 401 });
    if (!isMasterName(u.username)) throw Object.assign(new AuthError('마스터만 쓸 수 있어요'), { status: 403 });
    return u;
  }
  const findUser = async (username) => {
    const u = await acct.store.byName(String(username || '').trim().toLowerCase());
    if (!u) throw new AuthError('없는 사용자예요');
    return u;
  };
  const userSummary = (u) => {
    const m = u.meta || {};
    const lb = normLb(u.stats && u.stats.langbang);
    return {
      id: u.id, username: u.username, nickname: u.nickname, createdAt: u.createdAt, isMaster: isMasterName(u.username),
      banned: m.banned || null, coins: lb.coins, lbLevel: lb.level, maxStage: lb.maxStage,
      omok: u.stats.omok ? { rating: u.stats.omok.rating, games: u.stats.omok.games } : null,
    };
  };
  const userDetail = (u) => ({
    ...userSummary(u), stats: u.stats, checkin: site.checkinView(u.meta || {}), nickAt: (u.meta || {}).nickAt || null,
  });
  const roomDetail = (r) => ({
    ...r.listing(),
    settings: { game: r.settings.game, maxPlayers: r.settings.maxPlayers, hasPassword: !!r.settings.password, approval: !!r.settings.approval, sb: r.settings.sb, bb: r.settings.bb, startChips: r.settings.startChips },
    players: r.players.filter((p) => !p.leaving).map((p) => ({
      id: p.id, name: p.name, role: p.role, isBot: !!p.isBot, isHost: p.id === r.hostId, connected: !!p.connected,
      member: !!p.userId, master: !!p.isMaster, stack: p.stack,
    })),
    pending: r.pending.map((p) => ({ id: p.id, name: p.name })),
    feed: (r.feed || []).slice(-15).map((e) => ({ seq: e.seq, text: e.text || e.type })),
  });

  function router(express) {
    const r = express.Router();
    r.use(express.json({ limit: '8kb' }));
    // write=true 면 운영 기록 대상 + 더 빡빡한 횟수 제한
    const route = (method, url, fn, write = true) => r[method](url, async (req, res) => {
      try {
        const me = await requireMaster(req);
        if (limited(`${me.id}:${write ? 'w' : 'r'}`, write ? ACT_PER_MIN : READ_PER_MIN)) throw Object.assign(new AuthError('너무 빨라요. 잠깐 쉬었다 해 주세요'), { status: 429 });
        const out = await fn(req, me);
        res.set('Cache-Control', 'no-store').json({ ok: true, ...(out || {}) });
      } catch (e) {
        if (e instanceof AuthError) res.status(e.status || 400).json({ ok: false, message: e.message });
        else { console.error('[admin]', e); res.status(500).json({ ok: false, message: '잠시 후 다시 해 주세요' }); }
      }
    });
    const log = (me, action, target, detail) => site.log(me.username, action, target, detail);
    const body = (req) => req.body || {};

    route('get', '/overview', async () => ({
      users: await site.store.userCount(),
      rooms: rooms.size,
      online: [...rooms.values()].filter((x) => x.listing().online).length,
      openFeedback: await site.store.openFeedbackCount(),
      maintenance: site.maintenance(),
    }), false);

    // ── 공지 · 점검 ──
    route('get', '/notices', async () => ({ notices: await site.listNotices() }), false);
    route('post', '/notices', async (req, me) => {
      const n = await site.createNotice(body(req), me.nickname);
      await log(me, 'notice.create', n.id, { title: n.title, important: n.important });
      return { notice: n };
    });
    route('put', '/notices/:id', async (req, me) => {
      const n = await site.updateNotice(req.params.id, body(req));
      await log(me, 'notice.update', n.id, { title: n.title });
      return { notice: n };
    });
    route('delete', '/notices/:id', async (req, me) => {
      await site.deleteNotice(req.params.id);
      await log(me, 'notice.delete', req.params.id);
      return {};
    });
    route('post', '/maintenance', async (req, me) => {
      const m = await site.setMaintenance(!!body(req).on, body(req).message);
      await log(me, m.on ? 'maintenance.on' : 'maintenance.off', null, { message: m.message });
      return { maintenance: m };
    });

    // ── 유저 관리 ──
    route('get', '/users', async (req) => ({ users: (await site.store.searchUsers(String(req.query.q || '').slice(0, 30), 30)).map(userSummary) }), false);
    route('get', '/users/:username', async (req) => ({ user: userDetail(await findUser(req.params.username)) }), false);
    route('post', '/users/:username/password', async (req, me) => {
      const u = await findUser(req.params.username);
      const temp = tempPassword();
      await acct.exclusive(async () => {
        const cur = await acct.store.byId(u.id);
        await site.store.setPass(u.id, hashPassword(temp));
        const meta = site.metaOf(cur);
        await site.saveMeta(cur, { ...meta, tv: (meta.tv | 0) + 1 }); // 그 사람의 모든 기기 로그아웃
      });
      await log(me, 'user.password_reset', u.username);
      return { tempPassword: temp }; // 이 응답에서 한 번만 보여 준다 (저장·기록 안 함)
    });
    route('post', '/users/:username/ban', async (req, me) => {
      const u = await findUser(req.params.username);
      if (isMasterName(u.username)) throw new AuthError('마스터 계정은 정지할 수 없어요');
      const reason = String(body(req).reason || '').trim().slice(0, 100) || '운영 정책 위반';
      await acct.exclusive(async () => {
        const cur = await acct.store.byId(u.id);
        await site.saveMeta(cur, { ...site.metaOf(cur), banned: { reason, at: Date.now(), by: me.username } });
      });
      await log(me, 'user.ban', u.username, { reason });
      return { user: userDetail(await findUser(u.username)) };
    });
    route('post', '/users/:username/unban', async (req, me) => {
      const u = await findUser(req.params.username);
      await acct.exclusive(async () => {
        const cur = await acct.store.byId(u.id);
        const meta = site.metaOf(cur);
        delete meta.banned;
        await site.saveMeta(cur, meta);
      });
      await log(me, 'user.unban', u.username);
      return { user: userDetail(await findUser(u.username)) };
    });
    route('post', '/users/:username/nickname', async (req, me) => {
      const u = await findUser(req.params.username);
      const out = await site.changeNickname(null, body(req).nickname, { byMaster: true, target: u.username });
      await log(me, 'user.nickname', u.username, { from: u.nickname, to: out.user.nickname });
      return { user: userDetail(await findUser(u.username)) };
    });
    route('post', '/users/:username/coins', async (req, me) => {
      const delta = Math.trunc(Number(body(req).delta) || 0);
      if (!delta || Math.abs(delta) > 1000000) throw new AuthError('코인은 -1,000,000 ~ 1,000,000 사이로 적어 주세요');
      const out = await acct.adminAdjustLangbangCoins(req.params.username, delta);
      if (!out) throw new AuthError('없는 사용자예요');
      await log(me, 'user.coins', req.params.username, { delta, coins: out.coins });
      return { coins: out.coins, user: userDetail(await findUser(req.params.username)) };
    });
    route('post', '/users/:username/reset-stats', async (req, me) => {
      const u = await findUser(req.params.username);
      const e = emptyStats();
      await acct.exclusive(() => acct.updateStats(u.id, (s) => { s.holdem = e.holdem; s.seotda = e.seotda; s.omok = e.omok; s.tourney = e.tourney; }));
      await log(me, 'user.reset_stats', u.username, { games: ['holdem', 'seotda', 'omok', 'tourney'] });
      return { user: userDetail(await findUser(u.username)) };
    });

    // ── 방 관리 ──
    route('get', '/rooms', async () => ({
      rooms: [...rooms.values()].map((x) => { const l = x.listing(); return { ...l, names: x.players.filter((p) => !p.leaving && !p.isBot).map((p) => p.name).slice(0, 9) }; })
        .sort((a, b) => b.touchedAt - a.touchedAt).slice(0, 100),
    }), false);
    route('get', '/rooms/:code', async (req) => {
      const room = rooms.get(String(req.params.code).toUpperCase());
      if (!room) throw new AuthError('방이 없어요');
      return { room: roomDetail(room) };
    }, false);
    route('post', '/rooms/:code/close', async (req, me) => {
      const code = String(req.params.code).toUpperCase();
      if (!rooms.has(code)) throw new AuthError('방이 없어요');
      api.closeRoom(code, '운영자가 방을 닫았어요');
      await log(me, 'room.close', code);
      return {};
    });
    route('post', '/rooms/:code/kick', async (req, me) => {
      const code = String(req.params.code).toUpperCase();
      const room = rooms.get(code);
      if (!room) throw new AuthError('방이 없어요');
      const p = room.get(String(body(req).id || ''));
      if (!p) throw new AuthError('그 사람이 방에 없어요');
      if (p.isMaster) throw new AuthError('마스터는 내보낼 수 없어요');
      api.kickPlayer(code, p.id, '운영자에 의해 내보내졌어요');
      await log(me, 'room.kick', code, { name: p.name });
      return { room: rooms.has(code) ? roomDetail(rooms.get(code)) : null };
    });

    // ── 건의함 · 기록 ──
    route('get', '/feedback', async () => ({ feedback: await site.store.listFeedback(100) }), false);
    route('post', '/feedback/:id/done', async (req, me) => {
      const f = await site.store.setFeedbackDone(req.params.id, body(req).done !== false);
      if (!f) throw new AuthError('없는 건의예요');
      await log(me, 'feedback.done', req.params.id, { done: f.done });
      return { feedback: f };
    });
    route('delete', '/feedback/:id', async (req, me) => {
      await site.store.removeFeedback(req.params.id);
      await log(me, 'feedback.delete', req.params.id);
      return {};
    });
    route('get', '/log', async () => ({ log: await site.store.listLog(150) }), false);
    return r;
  }

  return { router, tempPassword };
}

module.exports = { createAdmin, tempPassword };
