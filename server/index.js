'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Room, RoomError, sanitizeSettings, makeCode } = require('./room');

const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 아무 일 없으면 방 정리
// 과부하 방지: 전체 방 수, 연습 방 수, 한 사람(IP)이 동시에 가진 방 수, 방 만들기 간격
const LIMITS = { rooms: 300, practiceRooms: 60, roomsPerIp: 6, createGapMs: 3000 };
const PRACTICE_IDLE_MS = 15 * 60 * 1000;

function lanUrls(port) {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) out.push(`http://${a.address}:${port}`);
    }
  }
  // 사설망(192.168.*, 10.*, 172.16~31.*) 우선
  const score = (u) => (/\/\/192\.168\./.test(u) ? 0 : /\/\/10\./.test(u) ? 1 : /\/\/172\./.test(u) ? 2 : 3);
  return out.sort((a, b) => score(a) - score(b));
}

function createServer({ port = 3000, dataFile = null, publicUrl = process.env.PUBLIC_URL || '', pace = 1, limits = {} } = {}) {
  const LIM = { ...LIMITS, ...limits };
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 16 * 1024 });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
    });
    next();
  });
  const rooms = new Map();

  // ── 저장/복구 ─────────────────────────────────────
  let saveTimer = null;
  function scheduleSave() {
    if (!dataFile || saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      const data = [...rooms.values()].map((r) => r.serialize());
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(dataFile + '.tmp', JSON.stringify(data));
      fs.renameSync(dataFile + '.tmp', dataFile);
    }, 300);
  }
  if (dataFile && fs.existsSync(dataFile)) {
    try {
      for (const obj of JSON.parse(fs.readFileSync(dataFile, 'utf8'))) {
        if (Date.now() - obj.touchedAt > ROOM_TTL_MS) continue;
        const r = Room.restore(obj);
        wire(r);
        rooms.set(r.code, r);
      }
      console.log(`저장된 방 ${rooms.size}개를 복구했어요`);
    } catch (e) {
      console.error('저장 파일을 읽지 못했어요:', e.message);
    }
  }

  function wire(room) {
    room.onChange = () => broadcast(room);
    room.onEmote = (e) => io.to('room:' + room.code).emit('emote', e);
  }

  function broadcast(room) {
    const sockets = io.sockets.adapter.rooms.get('room:' + room.code);
    if (sockets) {
      for (const sid of sockets) {
        const s = io.sockets.sockets.get(sid);
        if (!s) continue;
        if (s.data.pendingId) {
          const still = room.pending.find((p) => p.id === s.data.pendingId);
          const admitted = room.get(s.data.pendingId);
          if (admitted) {
            s.data.playerId = admitted.id;
            s.data.pendingId = null;
            room.connect(admitted.id);
            s.emit('joined', { code: room.code, playerId: admitted.id, token: admitted.token });
          } else if (!still) {
            s.emit('rejected', { message: '방장이 참가를 거절했어요' });
            s.leave('room:' + room.code);
            s.data.pendingId = null;
            continue;
          } else continue;
        }
        const pid = s.data.playerId;
        if (!pid) continue;
        const p = room.get(pid);
        if (!p) {
          s.emit('kicked', { message: '방에서 나왔어요' });
          s.leave('room:' + room.code);
          s.data.playerId = null;
          continue;
        }
        s.emit('state', room.viewFor(pid));
      }
    }
    scheduleSave();
  }

  // 오래된 방 정리
  const sweeper = setInterval(() => {
    const t = Date.now();
    for (const [code, r] of rooms) {
      // 연습 방은 사람이 떠나고 15분 지나면 정리
      const idle = r.practice && !r.players.some((p) => !p.isBot && p.connected);
      if (t - r.touchedAt > ROOM_TTL_MS || (idle && t - r.touchedAt > PRACTICE_IDLE_MS)) { r.clearAllTimers(); rooms.delete(code); }
    }
  }, 2 * 60 * 1000);
  sweeper.unref();

  // ── HTTP ──────────────────────────────────────────
  const pub = path.join(__dirname, '..', 'public');
  app.use(express.static(pub, { extensions: ['html'] }));
  app.get('/api/info', (req, res) => {
    res.json({ lan: lanUrls(server.address().port), publicUrl });
  });
  app.get('/api/room/:code', (req, res) => {
    const r = rooms.get(String(req.params.code).toUpperCase());
    if (!r) return res.status(404).json({ ok: false, message: '방을 찾을 수 없어요. 코드를 확인해 주세요' });
    res.json({
      ok: true,
      code: r.code,
      hostName: r.host ? r.host.name : null,
      phase: r.phase,
      players: r.seated.length,
      maxPlayers: r.settings.maxPlayers,
      hasPassword: !!r.settings.password,
      approval: r.settings.approval,
      settings: { startChips: r.settings.startChips, sb: r.settings.sb, bb: r.settings.bb },
    });
  });
  app.get('/api/qr.svg', async (req, res) => {
    const text = String(req.query.text || '').slice(0, 300);
    if (!/^https?:\/\//.test(text)) return res.status(400).send('bad');
    const svg = await QRCode.toString(text, { type: 'svg', margin: 1, color: { dark: '#111111', light: '#ffffff' } });
    res.type('image/svg+xml').send(svg);
  });
  // 초대 링크: 링크 미리보기(오픈그래프) 제목에 방장 이름·방 정보를 넣는다
  const indexHtml = fs.readFileSync(path.join(pub, 'index.html'), 'utf8');
  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  app.get('/r/:code', (req, res) => {
    const r = rooms.get(String(req.params.code).toUpperCase());
    let html = indexHtml;
    if (r && r.host) {
      const s = r.settings;
      const title = `${r.host.name}님이 찬덤 홀덤에 초대했어요 ♠`;
      const desc = `방 코드 ${r.code} · 블라인드 ${s.sb}/${s.bb} · 시작 칩 ${s.startChips.toLocaleString('ko-KR')} · 지금 ${r.seated.length}/${s.maxPlayers}명`;
      html = html
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escHtml(title)}`)
        .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escHtml(desc)}`);
    }
    res.type('html').send(html);
  });

  // ── 소켓 ──────────────────────────────────────────
  const clientIp = (socket) => String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '').split(',')[0].trim();
  const lastCreate = new Map();
  function checkCreate(socket, practice) {
    const ip = clientIp(socket);
    const t = Date.now();
    if (t - (lastCreate.get(ip) || 0) < LIM.createGapMs) throw new RoomError('조금 있다가 다시 만들어 주세요');
    if (rooms.size >= LIM.rooms) throw new RoomError('지금 방이 너무 많아요. 잠시 후 다시 해 주세요');
    if (practice && [...rooms.values()].filter((r) => r.practice).length >= LIM.practiceRooms) throw new RoomError('지금 연습 방이 너무 많아요. 잠시 후 다시 해 주세요');
    if ([...rooms.values()].filter((r) => r.creatorIp === ip && t - r.touchedAt < 30 * 60 * 1000).length >= LIM.roomsPerIp) throw new RoomError('이미 만든 방이 많아요. 안 쓰는 방에서 나간 뒤 다시 해 주세요');
    lastCreate.set(ip, t);
    if (lastCreate.size > 5000) lastCreate.clear();
    return ip;
  }

  io.on('connection', (socket) => {
    const reply = (ack, data) => { if (typeof ack === 'function') ack(data); };
    const fail = (ack, e) => {
      if (!(e instanceof RoomError)) console.error(e);
      reply(ack, { ok: false, message: e instanceof RoomError ? e.message : '서버에서 문제가 생겼어요. 잠시 후 다시 해 주세요' });
    };
    const ctx = () => {
      const room = rooms.get(socket.data.code);
      if (!room) throw new RoomError('방이 사라졌어요. 새로 만들어 주세요');
      const pid = socket.data.playerId;
      if (!pid || !room.get(pid)) throw new RoomError('이 방의 참가자가 아니에요');
      return { room, pid };
    };
    const bind = (room, pid) => {
      socket.data.code = room.code;
      socket.data.playerId = pid;
      socket.join('room:' + room.code);
      room.connect(pid);
    };
    const handler = (fn) => (payload, ack) => {
      payload = payload || {};
      try {
        const out = fn(payload || {});
        const { room } = ctx();
        broadcast(room);
        reply(ack, { ok: true, ...(out || {}) });
      } catch (e) { fail(ack, e); }
    };

    socket.on('room:create', (payload, ack) => {
      payload = payload || {};
      try {
        const settings = sanitizeSettings(payload.settings || {});
        const ip = checkCreate(socket, false);
        let code;
        do { code = makeCode(); } while (rooms.has(code));
        const room = new Room({ code, settings, pace });
        room.creatorIp = ip;
        wire(room);
        rooms.set(code, room);
        const { player } = room.join({ name: payload.name, password: settings.password, avatar: payload.avatar });
        bind(room, player.id);
        broadcast(room);
        reply(ack, { ok: true, code, playerId: player.id, token: player.token });
      } catch (e) { fail(ack, e); }
    });

    socket.on('room:join', (payload, ack) => {
      payload = payload || {};
      try {
        const room = rooms.get(String(payload.code || '').toUpperCase());
        if (!room) throw new RoomError('방을 찾을 수 없어요. 코드를 확인해 주세요');
        const { player, pending } = room.join({ name: payload.name, password: payload.password, spectator: payload.spectator, avatar: payload.avatar });
        socket.data.code = room.code;
        socket.join('room:' + room.code);
        if (pending) {
          socket.data.pendingId = player.id;
          broadcast(room);
          reply(ack, { ok: true, pending: true, code: room.code, token: player.token, playerId: player.id });
          return;
        }
        bind(room, player.id);
        broadcast(room);
        reply(ack, { ok: true, code: room.code, playerId: player.id, token: player.token });
      } catch (e) { fail(ack, e); }
    });

    // 새로고침·재접속: 저장해 둔 토큰으로 같은 플레이어로 복귀
    socket.on('room:resume', (payload, ack) => {
      payload = payload || {};
      try {
        const room = rooms.get(String(payload.code || '').toUpperCase());
        if (!room) throw new RoomError('방이 없어졌어요');
        const p = payload.token && room.byToken(payload.token);
        if (!p) throw new RoomError('이전 참가 정보가 만료됐어요. 다시 참가해 주세요');
        socket.data.code = room.code;
        socket.join('room:' + room.code);
        if (room.pending.includes(p)) {
          socket.data.pendingId = p.id;
          reply(ack, { ok: true, pending: true, playerId: p.id });
          return;
        }
        bind(room, p.id);
        broadcast(room);
        reply(ack, { ok: true, playerId: p.id });
      } catch (e) { fail(ack, e); }
    });

    socket.on('lobby:ready', handler((d) => { const { room, pid } = ctx(); room.setReady(pid, d.ready); }));
    socket.on('lobby:role', handler((d) => { const { room, pid } = ctx(); room.setRole(pid, !!d.spectator); }));
    socket.on('lobby:settings', handler((d) => { const { room, pid } = ctx(); room.updateSettings(pid, d.settings); }));
    socket.on('lobby:start', handler(() => { const { room, pid } = ctx(); room.start(pid); }));
    socket.on('host:approve', handler((d) => { const { room, pid } = ctx(); room.approve(pid, d.id, !!d.ok); }));
    socket.on('game:emote', handler((d) => { const { room, pid } = ctx(); room.emote(pid, String(d.kind || '')); }));
    socket.on('host:bot', handler(() => { const { room, pid } = ctx(); room.addBot(pid); }));
    // 혼자 연습: 방 + 봇 N명 + 바로 시작
    socket.on('room:practice', (payload, ack) => {
      payload = payload || {};
      try {
        const settings = sanitizeSettings({ ...(payload.settings || {}), approval: false, password: '' });
        const ip = checkCreate(socket, true);
        let code;
        do { code = makeCode(); } while (rooms.has(code));
        const room = new Room({ code, settings, pace });
        room.practice = true;
        room.creatorIp = ip;
        wire(room);
        rooms.set(code, room);
        const { player } = room.join({ name: payload.name, avatar: payload.avatar });
        bind(room, player.id);
        const n = Math.max(1, Math.min(settings.maxPlayers - 1, Number(payload.bots) || 3));
        for (let i = 0; i < n; i++) room.addBot(player.id);
        room.start(player.id);
        broadcast(room);
        reply(ack, { ok: true, code, playerId: player.id, token: player.token });
      } catch (e) { fail(ack, e); }
    });
    socket.on('host:kick', handler((d) => { const { room, pid } = ctx(); room.kick(pid, d.id); }));
    socket.on('host:transfer', handler((d) => { const { room, pid } = ctx(); room.transferHost(pid, d.id); }));
    socket.on('host:end', handler(() => { const { room, pid } = ctx(); room.endGame(pid); }));
    socket.on('game:act', handler((d) => { const { room, pid } = ctx(); room.act(pid, { type: d.type, amount: d.amount }); }));
    socket.on('game:rebuy', handler(() => { const { room, pid } = ctx(); room.rebuy(pid); }));
    socket.on('game:sitin', handler(() => { const { room, pid } = ctx(); room.sitIn(pid); }));
    socket.on('game:sitout', handler(() => { const { room, pid } = ctx(); room.sitOut(pid); }));

    socket.on('room:leave', (payload, ack) => {
      payload = payload || {};
      try {
        const room = rooms.get(socket.data.code);
        const id = socket.data.playerId || socket.data.pendingId;
        if (room && id) {
          room.leave(id);
          socket.leave('room:' + room.code);
          socket.data.playerId = null;
          socket.data.pendingId = null;
          if (room.isEmpty) { room.clearAllTimers(); rooms.delete(room.code); }
          else broadcast(room);
        }
        reply(ack, { ok: true });
      } catch (e) { fail(ack, e); }
    });

    socket.on('disconnect', () => {
      const room = rooms.get(socket.data.code);
      const pid = socket.data.playerId;
      if (!room || !pid) return;
      // 같은 플레이어의 다른 탭이 아직 연결돼 있으면 그대로 둔다
      const others = io.sockets.adapter.rooms.get('room:' + room.code);
      const stillHere = others && [...others].some((sid) => io.sockets.sockets.get(sid)?.data.playerId === pid);
      if (!stillHere) {
        room.disconnect(pid);
        broadcast(room);
      }
    });
  });

  return {
    app, server, io, rooms,
    listen: () => new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve(server.address().port))),
    close: () => new Promise((resolve) => {
      for (const r of rooms.values()) r.clearAllTimers();
      io.close(() => resolve());
    }),
  };
}

module.exports = { createServer, lanUrls };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const srv = createServer({ port, dataFile: path.join(__dirname, '..', 'data', 'rooms.json') });
  srv.listen().then((p) => {
    console.log('');
    console.log('  ♠ 찬덤 서버가 켜졌어요');
    console.log(`  이 컴퓨터에서:   http://localhost:${p}`);
    for (const u of lanUrls(p)) console.log(`  같은 와이파이 휴대폰에서: ${u}`);
    console.log('  (끄려면 Ctrl + C)');
    console.log('');
  });
}
