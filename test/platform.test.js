'use strict';
// 사이트 공용 기능: 마스터 권한 · 정지 · 출석 · 닉네임/비밀번호 · 탈퇴 · 공지 · 건의함 · 점검 모드
const test = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');

process.env.MASTER_USERS = 'boss, boss2';
const { createServer } = require('../server/index');
const { isMasterName } = require('../server/masters');
const { kstDay, nicknameProblem, CHECKIN_REWARDS } = require('../server/site');

let srv, base;
let clock = Date.UTC(2026, 8, 1, 3, 0, 0); // 2026-09-01 12:00 KST
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 }, now: () => clock });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });

let ipN = 0;
const req = (method, url, body, token) => fetch(base + url, {
  method,
  headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.${ipN >> 8}.${ipN++ & 255}`, ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const post = (url, body, token) => req('POST', url, body || {}, token);
const get = (url, token) => req('GET', url, null, token);
const signup = async (username, nickname = username) => {
  const r = await post('/api/auth/signup', { username, password: 'secret12', nickname });
  assert.equal(r.ok, true, r.message);
  return r;
};
function client() {
  const s = connect(base, { transports: ['websocket'], forceNew: true });
  s.last = null;
  s.on('state', (v) => { s.last = v; });
  s.call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}

test('마스터 여부는 서버가 아이디로 판단: 마스터가 아니면 관리 API 거절', async () => {
  assert.equal(isMasterName('BOSS'), true);
  assert.equal(isMasterName('nobody'), false);
  const boss = await signup('boss', '대장');
  const pleb = await signup('pleb1', '평민');
  assert.equal(boss.user.isMaster, true);
  assert.equal(pleb.user.isMaster, false);
  assert.equal((await get('/api/admin/overview')).status, 401, '로그인 안 하면 401');
  const no = await get('/api/admin/overview', pleb.token);
  assert.equal(no.status, 403);
  assert.equal(no.ok, false);
  assert.equal((await post('/api/admin/notices', { title: '해킹', body: 'x' }, pleb.token)).status, 403);
  assert.equal((await post('/api/admin/users/pleb1/coins', { delta: 99999 }, pleb.token)).status, 403);
  // 화면이 isMaster 를 보내도 소용없음
  assert.equal((await post('/api/admin/maintenance', { on: true, isMaster: true }, pleb.token)).status, 403);
  const ok = await get('/api/admin/overview', boss.token);
  assert.equal(ok.ok, true, ok.message);
  assert.ok(ok.users >= 2);
  // 공개 프로필에도 마스터 표시
  assert.equal((await get('/api/auth/profile/boss')).user.isMaster, true);
});

test('정지하면 로그인·기존 토큰이 막히고 사유가 보인다, 풀면 다시 된다', async () => {
  const boss = (await post('/api/auth/login', { username: 'boss', password: 'secret12' }));
  const u = await signup('badguy', '나쁜애');
  assert.equal((await get('/api/auth/me', u.token)).ok, true);
  const b = await post('/api/admin/users/badguy/ban', { reason: '욕설' }, boss.token);
  assert.equal(b.ok, true, b.message);
  assert.equal(b.user.banned.reason, '욕설');
  assert.equal((await get('/api/auth/me', u.token)).ok, false, '기존 토큰도 끊김');
  const l = await post('/api/auth/login', { username: 'badguy', password: 'secret12' });
  assert.equal(l.ok, false);
  assert.match(l.message, /정지.*욕설/);
  // 정지된 사람은 로그인한 채로 게임 불가 → 소켓에서도 손님 취급
  const c = client();
  const r = await c.call('room:create', { name: '손님', settings: { game: 'holdem' }, auth: u.token });
  assert.equal(r.ok, true);
  await new Promise((res) => setTimeout(res, 80));
  assert.equal(c.last.players[0].member, false);
  c.close();
  assert.equal((await post('/api/admin/users/boss2/ban', {}, boss.token)).ok, false, '없는 사용자');
  await signup('boss2', '부대장');
  assert.equal((await post('/api/admin/users/boss2/ban', {}, boss.token)).ok, false, '마스터는 정지 불가');
  assert.equal((await post('/api/admin/users/badguy/unban', {}, boss.token)).ok, true);
  assert.equal((await post('/api/auth/login', { username: 'badguy', password: 'secret12' })).ok, true);
  const log = await get('/api/admin/log', boss.token);
  assert.ok(log.log.some((e) => e.action === 'user.ban' && e.target === 'badguy' && e.actor === 'boss'));
});

test('출석 체크: KST 하루 한 번(두 번 눌러도 한 번), 이어서 오면 연속, 빠지면 처음부터', async () => {
  const u = await signup('daily', '출석왕');
  assert.equal((await post('/api/site/checkin')).status, 401, '손님은 로그인 필요');
  const coins = async () => (await get('/api/langbang/me', u.token)).profile.coins;
  clock = Date.UTC(2026, 8, 1, 14, 59, 0); // 9/1 23:59 KST
  let s = await get('/api/site/checkin', u.token);
  assert.equal(s.checkin.claimed, false);
  assert.equal(s.checkin.day, 1);
  let r = await post('/api/site/checkin', {}, u.token);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.gained, CHECKIN_REWARDS[0]);
  assert.equal(r.checkin.streak, 1);
  const again = await post('/api/site/checkin', {}, u.token);
  assert.equal(again.already, true);
  assert.equal(await coins(), CHECKIN_REWARDS[0], '두 번 받지 않음');
  // 동시에 여러 번 눌러도 한 번
  clock = Date.UTC(2026, 8, 1, 15, 1, 0); // 9/2 00:01 KST (UTC 로는 같은 날)
  const many = await Promise.all([1, 2, 3].map(() => post('/api/site/checkin', {}, u.token)));
  assert.equal(many.filter((x) => x.gained).length, 1);
  assert.equal(await coins(), CHECKIN_REWARDS[0] + CHECKIN_REWARDS[1]);
  s = await get('/api/site/checkin', u.token);
  assert.equal(s.checkin.streak, 2);
  assert.deepEqual(s.checkin.days.map((d) => d.state), ['done', 'done', 'next', 'next', 'next', 'next', 'next']);
  // 7일 채우고 8일째는 다시 1일차 보상 (연속 기록은 계속)
  for (let d = 3; d <= 8; d++) {
    clock = Date.UTC(2026, 8, d, 3, 0, 0);
    r = await post('/api/site/checkin', {}, u.token);
    assert.equal(r.gained, CHECKIN_REWARDS[(d - 1) % 7], `${d}일째`);
  }
  assert.equal(r.checkin.streak, 8);
  // 하루 빠지면 처음부터
  clock = Date.UTC(2026, 8, 10, 3, 0, 0);
  s = await get('/api/site/checkin', u.token);
  assert.equal(s.checkin.streak, 0);
  r = await post('/api/site/checkin', {}, u.token);
  assert.equal(r.checkin.streak, 1);
  assert.equal(r.gained, CHECKIN_REWARDS[0]);
  assert.equal(r.checkin.total, 9);
  assert.equal(kstDay(Date.UTC(2026, 8, 1, 15, 0, 0)), '2026-09-02');
  clock = Date.now();
});

test('닉네임 변경: 욕설·운영자 사칭·중복 거절, 하루 한 번', async () => {
  assert.ok(nicknameProblem('시 발놈'));
  assert.ok(nicknameProblem('운영자'));
  assert.equal(nicknameProblem('운영자', { master: true }), null);
  assert.equal(nicknameProblem('찬이'), null);
  const a = await signup('nicka', '가나다');
  await signup('nickb', '라마바');
  assert.equal((await post('/api/site/account/nickname', { nickname: '라마바' }, a.token)).message, '이미 누가 쓰고 있는 닉네임이에요');
  assert.equal((await post('/api/site/account/nickname', { nickname: 'fuck' }, a.token)).ok, false);
  assert.equal((await post('/api/site/account/nickname', { nickname: 'ADMIN' }, a.token)).ok, false);
  assert.equal((await post('/api/site/account/nickname', { nickname: '열한글자넘는닉네임이야' }, a.token)).ok, false);
  const ok = await post('/api/site/account/nickname', { nickname: '새이름' }, a.token);
  assert.equal(ok.ok, true, ok.message);
  assert.equal(ok.user.nickname, '새이름');
  assert.equal((await get('/api/auth/me', a.token)).user.nickname, '새이름');
  const cool = await post('/api/site/account/nickname', { nickname: '또바꿈' }, a.token);
  assert.match(cool.message, /하루에 한 번/);
  // 마스터는 쿨타임 없이 바꿔 줄 수 있다
  const boss = await post('/api/auth/login', { username: 'boss', password: 'secret12' });
  const m = await post('/api/admin/users/nicka/nickname', { nickname: '바꿔줌' }, boss.token);
  assert.equal(m.ok, true, m.message);
  assert.equal(m.user.nickname, '바꿔줌');
});

test('비밀번호 변경: 지금 비밀번호 확인, 다른 기기는 로그아웃 · 이 기기는 새 토큰', async () => {
  const u = await signup('pwuser');
  const other = (await post('/api/auth/login', { username: 'pwuser', password: 'secret12' })).token;
  assert.equal((await post('/api/site/account/password', { current: 'wrong00', next: 'newpass1' }, u.token)).ok, false);
  assert.equal((await post('/api/site/account/password', { current: 'secret12', next: '123' }, u.token)).ok, false);
  const r = await post('/api/site/account/password', { current: 'secret12', next: 'newpass1' }, u.token);
  assert.equal(r.ok, true, r.message);
  assert.equal((await get('/api/auth/me', other)).ok, false, '다른 기기 로그아웃');
  assert.equal((await get('/api/auth/me', u.token)).ok, false, '옛 토큰도');
  assert.equal((await get('/api/auth/me', r.token)).ok, true, '새 토큰은 됨');
  assert.equal((await post('/api/auth/login', { username: 'pwuser', password: 'secret12' })).ok, false);
  const l = await post('/api/auth/login', { username: 'pwuser', password: 'newpass1' });
  assert.equal(l.ok, true);
  // 모든 기기 로그아웃
  assert.equal((await post('/api/site/account/logout-all', {}, l.token)).ok, true);
  assert.equal((await get('/api/auth/me', l.token)).ok, false);
  assert.equal((await get('/api/auth/me', r.token)).ok, false);
  // 마스터 비밀번호 초기화: 임시 비밀번호로 로그인
  const boss = await post('/api/auth/login', { username: 'boss', password: 'secret12' });
  const t = await post('/api/admin/users/pwuser/password', {}, boss.token);
  assert.equal(t.ok, true);
  assert.match(t.tempPassword, /^[a-z0-9]{10}$/);
  assert.equal((await post('/api/auth/login', { username: 'pwuser', password: t.tempPassword })).ok, true);
  const log = await get('/api/admin/log', boss.token);
  assert.ok(!JSON.stringify(log).includes(t.tempPassword), '임시 비밀번호는 기록에 안 남음');
});

test('회원 탈퇴: 비밀번호 확인 후 계정과 전적 삭제', async () => {
  const u = await signup('byebye', '잘가');
  assert.equal((await post('/api/site/account/delete', { password: 'nope' }, u.token)).ok, false);
  assert.equal((await get('/api/auth/profile/byebye')).ok, true);
  const r = await post('/api/site/account/delete', { password: 'secret12' }, u.token);
  assert.equal(r.ok, true, r.message);
  assert.equal((await get('/api/auth/profile/byebye')).ok, false);
  assert.equal((await get('/api/auth/me', u.token)).ok, false);
  assert.equal((await post('/api/auth/login', { username: 'byebye', password: 'secret12' })).ok, false);
  assert.equal(await srv.accounts.store.byName('byebye'), null);
  // 같은 아이디로 새로 가입 가능
  assert.equal((await post('/api/auth/signup', { username: 'byebye', password: 'secret12', nickname: '다시' })).ok, true);
});

test('공지: 마스터가 쓰고·고치고·지우면 모두에게 보인다', async () => {
  const boss = await post('/api/auth/login', { username: 'boss', password: 'secret12' });
  assert.equal((await post('/api/admin/notices', { title: '', body: '내용' }, boss.token)).ok, false);
  const c = await post('/api/admin/notices', { title: '점검 안내', body: '오늘 밤 10시', important: true }, boss.token);
  assert.equal(c.ok, true, c.message);
  let list = (await get('/api/site/notices')).notices;
  assert.equal(list[0].title, '점검 안내');
  assert.equal(list[0].important, true);
  const u = await req('PUT', `/api/admin/notices/${c.notice.id}`, { title: '점검 안내 (변경)', body: '11시로 변경', important: false }, boss.token);
  assert.equal(u.ok, true, u.message);
  list = (await get('/api/site/notices')).notices;
  assert.equal(list[0].title, '점검 안내 (변경)');
  assert.ok(list[0].updatedAt >= list[0].createdAt);
  assert.equal((await req('DELETE', `/api/admin/notices/${c.notice.id}`, null, boss.token)).ok, true);
  assert.equal((await get('/api/site/notices')).notices.some((n) => n.id === c.notice.id), false);
  assert.equal((await req('DELETE', `/api/admin/notices/${c.notice.id}`, null, boss.token)).ok, false);
});

test('건의함: 500자 제한, 연속 제출 막기, 마스터 받은 편지함에 보임', async () => {
  const u = await signup('idea1', '아이디어');
  assert.equal((await post('/api/site/feedback', { category: 'bug', text: 'x'.repeat(501) }, u.token)).ok, false);
  const a = await post('/api/site/feedback', { category: 'bug', game: 'omok', text: '오목에서 버튼이 안 눌려요' }, u.token);
  assert.equal(a.ok, true, a.message);
  const b = await post('/api/site/feedback', { category: 'idea', text: '하나 더' }, u.token);
  assert.equal(b.ok, false, '30초 안에 또 보내면 거절');
  assert.match(b.message, /조금 있다가/);
  clock = Date.now() + 31000;
  assert.equal((await post('/api/site/feedback', { category: 'idea', text: '하나 더' }, u.token)).ok, true);
  clock = Date.now();
  const boss = await post('/api/auth/login', { username: 'boss', password: 'secret12' });
  const inbox = await get('/api/admin/feedback', boss.token);
  const f = inbox.feedback.find((x) => x.text === '오목에서 버튼이 안 눌려요');
  assert.ok(f);
  assert.equal(f.username, 'idea1');
  assert.equal(f.game, 'omok');
  assert.equal((await post(`/api/admin/feedback/${f.id}/done`, {}, boss.token)).feedback.done, true);
  assert.equal((await get('/api/admin/feedback', u.token)).status, 403);
});

test('점검 모드: 새 방 막기(마스터 제외) · 마스터는 비밀번호 방도 관전 · 방 닫기/내보내기 · 코인 지급', async () => {
  const boss = await post('/api/auth/login', { username: 'boss', password: 'secret12' });
  const u = await signup('player9', '플레이어');
  assert.equal((await post('/api/admin/maintenance', { on: true, message: '업데이트 중' }, boss.token)).ok, true);
  assert.equal((await get('/api/info')).maintenance.on, true);
  const a = client();
  const no = await a.call('room:create', { name: '가', settings: { game: 'holdem' }, auth: u.token });
  assert.equal(no.ok, false);
  assert.match(no.message, /점검/);
  const m = client();
  const yes = await m.call('room:create', { name: '가', settings: { game: 'holdem' }, auth: boss.token });
  assert.equal(yes.ok, true, '마스터는 점검 중에도 방을 만들 수 있다');
  await post('/api/admin/maintenance', { on: false }, boss.token);
  // 비밀번호 + 승인 방
  const r = await a.call('room:create', { name: '방장', settings: { game: 'holdem', password: 'pw', approval: true }, auth: u.token });
  assert.equal(r.ok, true, r.message);
  const guest = client();
  assert.equal((await guest.call('room:join', { code: r.code, name: '구경꾼', spectator: true })).ok, false, '손님은 비밀번호 필요');
  const mj = await m.call('room:join', { code: r.code, name: 'x', spectator: true, auth: boss.token });
  assert.equal(mj.ok, true, mj.message);
  assert.notEqual(mj.pending, true, '승인 없이 바로 관전');
  await new Promise((res) => setTimeout(res, 80));
  const mp = m.last.players.find((p) => p.id === mj.playerId);
  assert.equal(mp.role, 'spectator');
  assert.equal(mp.master, true, '방 안에서도 마스터 표시');
  assert.equal((await m.call('lobby:role', { spectator: false })).ok, false, '관전만 가능');
  // 방 보기 · 내보내기 · 닫기
  const view = await get(`/api/admin/rooms/${r.code}`, boss.token);
  assert.equal(view.room.players.length, 2);
  const hostId = view.room.players.find((p) => p.name === '플레이어' || p.isHost).id;
  const kicked = new Promise((res) => a.once('kicked', res));
  assert.equal((await post(`/api/admin/rooms/${r.code}/kick`, { id: hostId }, boss.token)).ok, true);
  await kicked;
  const closed = new Promise((res) => m.once('kicked', res));
  assert.equal((await post(`/api/admin/rooms/${r.code}/close`, {}, boss.token)).ok, true);
  assert.match((await closed).message, /닫았/);
  assert.equal(srv.rooms.has(r.code), false);
  assert.equal((await get(`/api/admin/rooms/${r.code}`, boss.token)).ok, false);
  // 랑방 코인 지급/회수 (0 아래로는 안 내려감)
  let c = await post('/api/admin/users/player9/coins', { delta: 500 }, boss.token);
  assert.equal(c.coins, 500);
  c = await post('/api/admin/users/player9/coins', { delta: -9999 }, boss.token);
  assert.equal(c.coins, 0);
  assert.equal((await post('/api/admin/users/player9/coins', { delta: 5e6 }, boss.token)).ok, false);
  // 전적 초기화 (랑방 기록은 그대로)
  await post('/api/admin/users/player9/coins', { delta: 70 }, boss.token);
  await srv.accounts.updateStats((await srv.accounts.store.byName('player9')).id, (s) => { s.omok.rating = 1500; s.holdem.hands = 9; });
  const rs = await post('/api/admin/users/player9/reset-stats', {}, boss.token);
  assert.equal(rs.user.stats.omok.rating, 1000);
  assert.equal(rs.user.stats.holdem.hands, 0);
  assert.equal(rs.user.coins, 70);
  // 검색
  const found = await get('/api/admin/users?q=player', boss.token);
  assert.ok(found.users.some((x) => x.username === 'player9'));
  [a, m, guest].forEach((s) => s.close());
});

test('PgStore 쿼리 모양 (가짜 DB): meta 칸 추가 · 공지/건의/기록 표 · 토큰 버전', async () => {
  const { createAccounts } = require('../server/accounts');
  const { createSite } = require('../server/site');
  const acc = createAccounts({ databaseUrl: 'postgres://u:p@127.0.0.1:1/none', secret: 'x' });
  await acc.ready;
  await acc.store.pool.end().catch(() => {});
  const seen = [];
  const row = { id: 'me', username: 'me', pass: 'x', nickname: '나', created_at: '1', stats: { omok: { rating: 1000 } }, meta: { tv: 2 } };
  acc.store.pool = {
    query: async (sql, params) => {
      seen.push({ sql: sql.replace(/\s+/g, ' '), params });
      if (/COUNT/.test(sql)) return { rows: [{ n: 3 }] };
      if (/FROM site_kv/.test(sql)) return { rows: [] };
      if (/FROM users/.test(sql)) return { rows: [row], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
  };
  await acc.store.init();
  assert.ok(seen.some((q) => /ALTER TABLE users ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '\{\}'::jsonb/.test(q.sql)));
  assert.equal((await acc.store.byId('me')).meta.tv, 2);
  const site = createSite({ acct: acc });
  await site.ready;
  for (const t of ['notices', 'feedback', 'admin_log', 'site_kv']) assert.ok(seen.some((q) => q.sql.includes(`CREATE TABLE IF NOT EXISTS ${t}`)), t);
  seen.length = 0;
  await site.store.searchUsers('a_%b', 5);
  assert.match(seen[0].sql, /username ILIKE \$1 OR nickname ILIKE \$1 ORDER BY created_at DESC LIMIT \$2/);
  assert.deepEqual(seen[0].params, ['%a\\_\\%b%', 5], 'LIKE 특수문자는 이스케이프');
  await site.store.saveMeta('me', { tv: 3 });
  assert.match(seen[1].sql, /UPDATE users SET meta=\$2 WHERE id=\$1/);
  await site.store.nicknameTaken('찬', 'me');
  assert.match(seen[2].sql, /lower\(nickname\)=lower\(\$1\) AND id<>\$2/);
  await site.store.addNotice({ id: 'n1', title: 't', body: 'b', important: true, createdAt: 1, updatedAt: 1 });
  assert.match(seen[3].sql, /INSERT INTO notices \(id, title, body, important, author, created_at, updated_at\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7\)/);
  await site.store.setKv('maintenance', { on: true });
  assert.match(seen[4].sql, /ON CONFLICT \(k\) DO UPDATE SET v=EXCLUDED.v/);
  assert.equal(seen[4].params[1], '{"on":true}');
  await site.store.addLog({ at: 1, actor: 'boss', action: 'x' });
  assert.match(seen[5].sql, /INSERT INTO admin_log \(at, actor, action, target, detail\)/);
  // 토큰 버전이 캐시와 다르면 거절
  acc.noteMeta('me', { tv: 3 });
  const tk = acc.makeToken('me');
  assert.equal(acc.verifyToken(tk), 'me');
  acc.noteMeta('me', { tv: 4 });
  assert.equal(acc.verifyToken(tk), null);
});
