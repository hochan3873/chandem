'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');
const { Room, RoomError, sanitizeSettings, makeCode } = require('./room');
const { createAccounts, hashPassword } = require('./accounts');
const { createSite } = require('./site');
const { createAdmin } = require('./admin');
const { createRankings } = require('./rankings');
const { createLbPvp } = require('./langbang-pvp');
const { createPush, createPushStore } = require('./push');

const ROOM_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 아무 일 없으면 방 정리
// 과부하 방지: 전체 방 수, 연습 방 수, 한 사람(IP)이 동시에 가진 방 수, 방 만들기 간격
const LIMITS = { rooms: 300, practiceRooms: 60, roomsPerIp: 6, createGapMs: 3000, emptyRoomMs: 5 * 60 * 1000 }; // emptyRoomMs: 사람이 다 나간 친구 방을 지우기까지
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

function createServer({ port = 3000, dataFile = null, publicUrl = process.env.PUBLIC_URL || '', pace = 1, limits = {}, accounts = null, now = Date.now, lbpvp = {}, push: pushOpt = {} } = {}) {
  const LIM = { ...LIMITS, ...limits };
  const acct = accounts || createAccounts({ file: dataFile ? path.join(path.dirname(dataFile), 'accounts.json') : null });
  // 공지 · 출석 · 계정 관리 · 건의함 · 점검 모드 (server/site.js)
  const site = createSite({ acct, file: dataFile ? path.join(path.dirname(dataFile), 'site.json') : null, now });
  // 비상 비밀번호 재설정: 서버 환경 변수 RESET_USER(아이디) · RESET_PASSWORD(새 비밀번호, 6자 이상)를 넣고 배포하면
  // 켜질 때 한 번 바꾸고 그 계정의 모든 기기를 로그아웃한다. 로그인되면 두 변수를 지우고 다시 배포할 것.
  // RESET_PASSWORD 없이 RESET_USER 만 넣으면 서버가 임시 비밀번호를 만들어 로그에 한 번만 찍는다.
  // 같은 설정으로는 한 번만 실행된다(재시작해도 다시 안 바꿈). 다시 하려면 RESET_ID 값을 바꾼다.
  site.bootstrapMasterRecovery([...require('./masters').masterList()]).catch((e) => console.error('[master] 복구 코드 준비 실패:', e.message));
  const resetUser = String(process.env.RESET_USER || '').trim().toLowerCase();
  const resetPass = String(process.env.RESET_PASSWORD || '');
  if (resetUser && (!resetPass || (resetPass.length >= 6 && resetPass.length <= 64))) {
    const key = `${resetUser}:${process.env.RESET_ID || '1'}:${resetPass ? 'set' : 'auto'}`;
    site.ready.then(async () => {
      const u = await acct.store.byName(resetUser);
      if (!u) { console.warn('[reset] 없는 아이디:', resetUser); return; }
      let temp = null;
      await acct.exclusive(async () => {
        const cur = await acct.store.byId(u.id);
        const meta = site.metaOf(cur);
        if (meta.envReset === key) return;
        const pw = resetPass || (temp = require('crypto').randomBytes(6).toString('base64url'));
        await site.store.setPass(u.id, hashPassword(pw));
        await site.saveMeta(cur, { ...meta, tv: (meta.tv | 0) + 1, envReset: key });
      });
      if (temp) console.log(`[reset] ${resetUser} 임시 비밀번호: ${temp}  — 로그인 후 비밀번호를 바꾸고 RESET_USER 를 지우세요`);
      else console.log('[reset] 처리 완료(또는 이미 처리됨):', resetUser);
    }).catch((e) => console.error('[reset] 실패:', e.message));
  }
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000, maxHttpBufferSize: 96 * 1024 });
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
  // 방은 메모리에 있다. 배포(재시작)해도 게임이 끊기지 않게 스냅숏을 남긴다:
  //  · DATABASE_URL 이 있으면 PostgreSQL 표 rooms_snapshot (배포 서버는 디스크가 매번 새로 만들어짐)
  //  · 없으면 data/rooms.json (로컬·테스트)
  //  바뀔 때마다(0.3초 모아서) + 10초마다 + 꺼질 때(SIGTERM) 저장. 켜질 때 10분 안의 스냅숏만 복구.
  const pool = acct.store && acct.store.pool;
  const SNAP_MAX_AGE_MS = 10 * 60 * 1000;
  let saveTimer = null;
  let dirty = false;
  let saving = Promise.resolve();
  const snapshot = () => ({ savedAt: Date.now(), rooms: [...rooms.values()].map((r) => r.serialize()) });
  async function writeSnapshot() {
    const data = snapshot();
    if (pool) {
      await pool.query(`INSERT INTO rooms_snapshot (id, data, saved_at) VALUES ('rooms', $1, $2)
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, saved_at = EXCLUDED.saved_at`, [JSON.stringify(data), data.savedAt]);
    } else if (dataFile) {
      fs.mkdirSync(path.dirname(dataFile), { recursive: true });
      fs.writeFileSync(dataFile + '.tmp', JSON.stringify(data));
      fs.renameSync(dataFile + '.tmp', dataFile);
    }
  }
  function saveNow() {
    dirty = false;
    saving = saving.then(writeSnapshot).catch((e) => console.error('[rooms] 저장 실패:', e.message));
    return saving;
  }
  function scheduleSave() {
    if (!dataFile && !pool) return;
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 300);
  }
  const periodic = (dataFile || pool) ? setInterval(() => { if (dirty || [...rooms.values()].some((r) => r.hand && !r.hand.finished)) saveNow(); }, 10 * 1000) : null;
  if (periodic && periodic.unref) periodic.unref();
  function restoreFrom(data) {
    const list = Array.isArray(data) ? data : (data && data.rooms) || [];
    const savedAt = Array.isArray(data) ? Date.now() : Number(data && data.savedAt) || 0;
    if (!Array.isArray(data) && Date.now() - savedAt > SNAP_MAX_AGE_MS) { console.log('[rooms] 스냅숏이 10분보다 오래돼서 건너뜀'); return; }
    for (const obj of list) {
      try {
        if (Date.now() - obj.touchedAt > ROOM_TTL_MS) continue;
        if (rooms.has(obj.code)) continue;
        const r = Room.restore(obj);
        wire(r);
        rooms.set(r.code, r);
      } catch (e) { console.error('[rooms] 방 복구 실패:', obj && obj.code, e.message); }
    }
    console.log(`저장된 방 ${rooms.size}개를 복구했어요`);
  }
  let roomsReady = Promise.resolve();
  if (pool) {
    roomsReady = acct.ready.then(async () => {
      await pool.query('CREATE TABLE IF NOT EXISTS rooms_snapshot (id TEXT PRIMARY KEY, data JSONB NOT NULL, saved_at BIGINT NOT NULL)');
      const r = await pool.query("SELECT data FROM rooms_snapshot WHERE id = 'rooms'");
      if (r.rows[0]) restoreFrom(r.rows[0].data);
    }).catch((e) => console.error('[rooms] 스냅숏 읽기 실패:', e.message));
  } else if (dataFile && fs.existsSync(dataFile)) {
    try { restoreFrom(JSON.parse(fs.readFileSync(dataFile, 'utf8'))); }
    catch (e) { console.error('저장 파일을 읽지 못했어요:', e.message); }
  }
  /** 꺼지기 직전(배포): 알리고 · 마지막으로 저장 */
  async function shutdown() {
    try { io.emit('server:restarting', { message: '🔧 서버 업데이트 중 — 잠시 후 자동으로 돌아와요' }); } catch {}
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    await saveNow();
  }

  function wire(room) {
    room.onChange = () => broadcast(room);
    room.onRecord = (rec) => {
      if (rec.game === 'omok') {
        acct.recordOmok(rec.a, rec.b, rec.result).then((out) => {
          if (!out) return;
          for (const [userId, v] of Object.entries(out)) {
            const p = room.players.find((x) => x.userId === userId);
            if (p) p.omokRating = v.after;
          }
          if (Object.keys(out).length) { io.to('room:' + room.code).emit('rating', Object.entries(out).map(([userId, v]) => ({ id: (room.players.find((x) => x.userId === userId) || {}).id, ...v }))); broadcast(room); }
        });
      } else if (rec.game === 'tourney') acct.recordTourney(rec.userIds, rec.winnerUserId);
      else if (!rec.redeal) acct.recordHand(rec.game, rec.players, rec.pot, { practice: !!rec.practice }); // AI 연습 판은 순위에서 빠짐
      else acct.recordHand(rec.game, rec.players.map((p) => ({ ...p, won: false, handName: null })), 0, { practice: !!rec.practice });
    };
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

  // 운영자: 방 닫기 / 한 사람 내보내기
  function closeRoom(code, message) {
    const room = rooms.get(code);
    if (!room) return false;
    const sockets = io.sockets.adapter.rooms.get('room:' + code);
    for (const sid of sockets ? [...sockets] : []) {
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      s.emit('kicked', { message });
      s.leave('room:' + code);
      s.data.playerId = null; s.data.pendingId = null;
    }
    room.clearAllTimers();
    rooms.delete(code);
    scheduleSave();
    return true;
  }
  // 사람이 모두 나간 방: 연습 방은 바로, 친구 방은 잠깐(5분) 기다렸다가 그래도 비어 있으면 지운다
  function closeIfEmpty(room) {
    if (!room.isEmpty) return false;
    if (room.practice) { room.clearAllTimers(); rooms.delete(room.code); return true; }
    room.setTimer('empty', LIM.emptyRoomMs, () => {
      if (room.isEmpty && rooms.get(room.code) === room) { room.clearAllTimers(); rooms.delete(room.code); }
    });
    return false;
  }
  function kickPlayer(code, id, reason) {
    const room = rooms.get(code);
    const p = room && room.get(id);
    if (!p) return false;
    p.kicked = true;
    room.leave(id, reason);
    p.token = null;
    if (room.isEmpty) closeRoom(code, '방이 닫혔어요');
    else broadcast(room);
    return true;
  }

  // ── HTTP ──────────────────────────────────────────
  const pub = path.join(__dirname, '..', 'public');
  // 그림 · 소리 · 영상: 파일 '내용'으로 이름표(ETag)를 붙인다 — 배포마다 수정 시각이 바뀌어 전부 다시 받던 문제 (Render 무료 전송량 5GB를 4일 만에 다 씀)
  //  하루는 폰에 저장해 두고, 그 뒤엔 바뀐 파일만 다시 받는다 (안 바뀌었으면 304 — 거의 0바이트)
  const MEDIA = /\.(webp|png|jpe?g|gif|svg|mp3|ogg|wav|mp4|webm|woff2?)$/i, etags = new Map();
  app.use((req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !MEDIA.test(req.path)) return next();
    let rel; try { rel = decodeURIComponent(req.path); } catch { return next(); }
    const file = path.join(pub, rel);
    if (!file.startsWith(pub + path.sep)) return next();
    let tag = etags.get(file);
    if (tag === undefined) { try { tag = '"' + require('crypto').createHash('sha1').update(fs.readFileSync(file)).digest('base64url').slice(0, 20) + '"'; } catch { tag = null; } etags.set(file, tag); }
    if (!tag) return next();
    res.set('Cache-Control', 'public, max-age=21600, stale-while-revalidate=86400');
    res.set('ETag', tag);
    if (req.headers['if-none-match'] === tag) return res.status(304).end();
    res.sendFile(file, { etag: false, lastModified: false, headers: { 'Cache-Control': 'public, max-age=21600, stale-while-revalidate=86400', ETag: tag } });
  });
  app.use(express.static(pub, { extensions: ['html'] }));
  // 웹 푸시 알림 (server/push.js) — VAPID 열쇠가 환경 변수에 있을 때만 켜진다
  const push = createPush({ acct, store: createPushStore({ pool: acct.store.pool || null, file: dataFile ? path.join(path.dirname(dataFile), 'push.json') : null }), now, ...pushOpt });
  app.use('/api/push', push.router(express));
  const pushTimer = push.enabled ? setInterval(() => { push.tick().catch((e) => console.error('[push] tick 실패:', e.message)); }, 15 * 60 * 1000) : null; // 서버가 깨어 있는 동안 15분마다
  if (pushTimer && pushTimer.unref) pushTimer.unref();
  let rankings = null;
  const accountsOn = !!process.env.DATABASE_URL || !process.env.RENDER;
  if (accountsOn) {
    app.use('/api/auth', acct.router(express));
    app.use('/api/langbang/ranking', site.decorateRanking); // 랭킹에 마스터 표시만 덧붙임
    app.use('/api/langbang', acct.langbangRouter(express)); // 랑방 대전: 기록·강화·랭킹
    app.use('/api/site', site.router(express));
    app.use('/api/admin', createAdmin({ acct, site, rooms, api: { closeRoom, kickPlayer } }).router(express));
    rankings = createRankings({ acct, rooms, now });
    app.use('/api/rank', rankings.router(express)); // 게임별 등급·순위·선수 카드
  } else {
    app.use(['/api/auth', '/api/langbang', '/api/site', '/api/admin'], (req, res) => res.status(503).json({ ok: false, message: '로그인 준비 중이에요' }));
  }
  app.get('/api/info', (req, res) => {
    // 배포 서버(Render)에서는 DB가 연결됐을 때만 로그인을 켠다 (파일 저장은 배포마다 지워지므로)
    res.json({ lan: lanUrls(server.address().port), publicUrl, accounts: accountsOn, maintenance: site.maintenance(), langbang: fs.existsSync(path.join(pub, 'langbang', 'index.html')) });
  });
  // 지금 열려 있는 방 목록: 접속한 사람이 있는 방만, 게임 중인 방 먼저 → 최근 활동 순
  app.get('/api/rooms', (req, res) => {
    const game = String(req.query.game || '');
    const list = [...rooms.values()].map((r) => r.listing())
      .filter((x) => x.online && (!game || x.game === game))
      .sort((a, b) => (a.phase === b.phase ? b.touchedAt - a.touchedAt : a.phase === 'playing' ? -1 : 1))
      .slice(0, 30)
      .map(({ touchedAt, online, ...x }) => x);
    res.set('Cache-Control', 'no-store').json({ ok: true, rooms: list });
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
  // 프로필 사진 (주소에 버전이 붙어 있어 오래 캐시해도 된다)
  app.get('/api/photo/:code/:id', (req, res) => {
    const r = rooms.get(String(req.params.code).toUpperCase());
    const p = r && (r.get(req.params.id) || r.pending.find((x) => x.id === req.params.id));
    if (!p || !p.photo) return res.status(404).end();
    const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(p.photo);
    res.set('Cache-Control', 'public, max-age=86400').type(m[1]).send(Buffer.from(m[2], 'base64'));
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
      const title = `${r.host.name}님이 ${{ holdem: '홀덤', seotda: '섯다', omok: '오목' }[s.game] || '게임'} 방에 초대했어요 · 찬이의 게임월드`;
      const desc = s.game === 'omok'
        ? `방 코드 ${r.code} · 1:1 오목 대국 · 지금 ${r.seated.length}/2명`
        : `방 코드 ${r.code} · ${s.game === 'seotda' ? `${s.cards === 3 ? '세 장' : '두 장'} 섯다 · 판돈 ${s.bb}` : `블라인드 ${s.sb}/${s.bb}`} · 시작 칩 ${s.startChips.toLocaleString('ko-KR')} · 지금 ${r.seated.length}/${s.maxPlayers}명`;
      const base = (publicUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      html = html
        .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escHtml(title)}`)
        .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escHtml(desc)}`)
        // 카카오톡은 og:url 을 기준으로 미리보기를 저장하므로 방마다 자기 주소를, 사진은 그 게임 그림을
        .replace(/(<meta property="og:url" content=")[^"]*/, `$1${escHtml(`${base}/r/${r.code}`)}`)
        .replace(/(<meta property="og:image" content=")[^"]*/, `$1${escHtml(`${base}/img/og-${s.game || 'holdem'}.jpg`)}`);
    }
    res.type('html').send(html);
  });

  // ── 소켓 ──────────────────────────────────────────
  const clientIp = (socket) => String(socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || '').split(',')[0].trim();
  const lastCreate = new Map();
  function checkCreate(socket, practice, user) {
    if (site.maintenance().on && !(user && user.isMaster)) throw new RoomError('지금은 점검 중이라 새 방을 만들 수 없어요. 조금만 기다려 주세요!');
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

  // 소켓 요청에 붙어 온 로그인 토큰 → 계정 (없거나 틀리면 손님)
  async function userOf(payload) {
    if (!payload || !payload.auth) return null;
    try { return await acct.me(payload.auth); } catch { return null; }
  }

  // 랑방 대전 1:1 대전 (/lbpvp 네임스페이스 — 방 게임 소켓과 따로)
  const lbPvp = createLbPvp({ accounts: acct, normLb: require('./accounts').normLb, eloDelta: require('./accounts').eloDelta, isMaster: require('./masters').isMasterName, ...lbpvp });
  lbPvp.attach(io.of('/lbpvp'));

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

    socket.on('room:create', async (payload, ack) => {
      payload = payload || {};
      const user = await userOf(payload);
      if (user) payload.name = user.nickname;
      try {
        const settings = sanitizeSettings(payload.settings || {});
        const ip = checkCreate(socket, false, user);
        let code;
        do { code = makeCode(); } while (rooms.has(code));
        const room = new Room({ code, settings, pace });
        room.creatorIp = ip;
        wire(room);
        rooms.set(code, room);
        const { player } = room.join({ name: payload.name, password: settings.password, avatar: payload.avatar, photo: payload.photo, user });
        bind(room, player.id);
        broadcast(room);
        reply(ack, { ok: true, code, playerId: player.id, token: player.token });
      } catch (e) { fail(ack, e); }
    });

    socket.on('room:join', async (payload, ack) => {
      payload = payload || {};
      await roomsReady;
      const user = await userOf(payload);
      if (user) payload.name = user.nickname;
      try {
        const room = rooms.get(String(payload.code || '').toUpperCase());
        if (!room) throw new RoomError('방을 찾을 수 없어요. 코드를 확인해 주세요');
        const { player, pending } = room.join({ name: payload.name, password: payload.password, spectator: payload.spectator, avatar: payload.avatar, photo: payload.photo, user });
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
    socket.on('room:resume', async (payload, ack) => {
      payload = payload || {};
      await roomsReady;
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
    socket.on('lobby:role', handler((d) => { const { room, pid } = ctx(); return room.setRole(pid, !!d.spectator); }));
    // 방 안에서 로그인 → 이 자리를 계정에 묶기 (다음 판부터 전적·순위)
    socket.on('room:bindAccount', async (payload, ack) => {
      try {
        const user = await userOf(payload || {});
        if (!user) throw new RoomError('다시 로그인해 주세요');
        const { room, pid } = ctx();
        const out = room.bindAccount(pid, user);
        broadcast(room);
        reply(ack, { ok: true, ...out });
      } catch (e) { fail(ack, e); }
    });
    socket.on('lobby:settings', handler((d) => { const { room, pid } = ctx(); room.updateSettings(pid, d.settings); }));
    socket.on('lobby:start', handler(() => { const { room, pid } = ctx(); room.start(pid); }));
    socket.on('host:approve', handler((d) => { const { room, pid } = ctx(); room.approve(pid, d.id, !!d.ok); }));
    socket.on('game:emote', handler((d) => { const { room, pid } = ctx(); room.emote(pid, String(d.kind || '')); }));
    socket.on('host:bot', handler(() => { const { room, pid } = ctx(); room.addBot(pid); }));
    // 혼자 연습: 방 + 봇 N명 + 바로 시작
    socket.on('room:practice', async (payload, ack) => {
      payload = payload || {};
      const user = await userOf(payload);
      if (user) payload.name = user.nickname;
      try {
        const settings = sanitizeSettings({ ...(payload.settings || {}), approval: false, password: '' });
        const ip = checkCreate(socket, true, user);
        let code;
        do { code = makeCode(); } while (rooms.has(code));
        const room = new Room({ code, settings, pace });
        room.practice = true;
        room.creatorIp = ip;
        wire(room);
        rooms.set(code, room);
        const { player } = room.join({ name: payload.name, avatar: payload.avatar, photo: payload.photo, user });
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
    socket.on('game:act', handler((d) => { const { room, pid } = ctx(); room.act(pid, { type: d.type, amount: d.amount, x: d.x, y: d.y, index: d.index, cards: Array.isArray(d.cards) ? d.cards.slice(0, 3).map(String) : undefined }); }));
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
          if (!closeIfEmpty(room)) broadcast(room);
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
    app, server, io, rooms, accounts: acct, site, lbPvp, push, get rankings() { return rankings; },
    saveNow, shutdown, roomsReady: () => roomsReady,
    listen: () => new Promise((resolve) => server.listen(port, '0.0.0.0', () => resolve(server.address().port))),
    close: () => new Promise((resolve) => {
      if (periodic) clearInterval(periodic);
      if (pushTimer) clearInterval(pushTimer);
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      for (const r of rooms.values()) r.clearAllTimers();
      lbPvp.close();
      io.close(() => resolve());
    }),
  };
}

module.exports = { createServer, lanUrls };

if (require.main === module) {
  // 예상 못 한 오류가 나도 서버 전체가 꺼지지 않게 기록만 남긴다
  process.on('uncaughtException', (e) => console.error('[uncaught]', e));
  process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
  const port = Number(process.env.PORT) || 3000;
  const srv = createServer({ port, dataFile: path.join(__dirname, '..', 'data', 'rooms.json') });
  // 배포(Render)는 SIGTERM 을 보내고 잠시 뒤 끈다 → 방 상태를 저장하고 알린 뒤 끈다
  let stopping = false;
  for (const sig of ['SIGTERM', 'SIGINT']) {
    process.on(sig, () => {
      if (stopping) return;
      stopping = true;
      console.log(`[${sig}] 방 상태를 저장하고 끕니다`);
      const force = setTimeout(() => process.exit(0), 8000);
      srv.shutdown().catch(() => {}).finally(() => { clearTimeout(force); setTimeout(() => process.exit(0), 300); });
    });
  }
  srv.listen().then((p) => {
    console.log('');
    console.log('  ♠ 찬이의 게임월드 서버가 켜졌어요');
    console.log(`  이 컴퓨터에서:   http://localhost:${p}`);
    for (const u of lanUrls(p)) console.log(`  같은 와이파이 휴대폰에서: ${u}`);
    console.log('  (끄려면 Ctrl + C)');
    console.log('');
  });
}
