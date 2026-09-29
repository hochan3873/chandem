'use strict';
// 아이디 찾기 · 비밀번호 찾기 (복구 코드 · 운영자 요청)
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.MASTER_USERS = 'boss';
const { createServer } = require('../server/index');
const { maskUsername, newRecoveryCode, normRecovery, RECOVERY_FAILS } = require('../server/site');
const { hashPassword, checkPassword } = require('../server/accounts');

let srv, base;
let clock = Date.UTC(2026, 8, 1, 3, 0, 0);
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 }, now: () => clock });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });

let ipN = 0;
const req = (method, url, body, token, ip) => fetch(base + url, {
  method,
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip || `10.9.${ipN >> 8}.${ipN++ & 255}`, ...(token ? { authorization: 'Bearer ' + token } : {}) },
  body: body ? JSON.stringify(body) : undefined,
}).then(async (r) => ({ status: r.status, ...(await r.json()) }));
const post = (url, body, token, ip) => req('POST', url, body || {}, token, ip);
const get = (url, token) => req('GET', url, null, token);
const signup = async (username, nickname = username) => {
  const r = await post('/api/auth/signup', { username, password: 'secret12', nickname });
  assert.equal(r.ok, true, r.message);
  return r;
};

test('아이디 가리기 · 복구 코드 모양 · 해시 확인', () => {
  assert.equal(maskUsername('gunwoong01'), 'gu***01');
  assert.equal(maskUsername('abcdef'), 'ab***ef');
  assert.equal(maskUsername('abcd'), 'a***d');
  assert.equal(maskUsername('abc'), 'a**');
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = newRecoveryCode();
    assert.match(c, /^[A-HJ-NP-Z2-9]{10}$/, '헷갈리는 글자(0 O 1 I) 없음');
    seen.add(c);
  }
  assert.equal(seen.size, 200, '매번 다름');
  assert.equal(normRecovery('abcde-fghjk '), 'ABCDEFGHJK', '소문자·하이픈·공백 허용');
  const code = newRecoveryCode();
  const h = hashPassword(code);
  assert.ok(!h.includes(code), '원래 코드는 저장 안 함');
  assert.equal(checkPassword(code, h), true);
  assert.equal(checkPassword(code.slice(0, 9) + (code[9] === 'A' ? 'B' : 'A'), h), false);
});

test('아이디 찾기: 닉네임 → 가린 아이디, IP당 횟수 제한', async () => {
  await signup('gunwoong01', '건웅이');
  const r = await post('/api/site/find-id', { nickname: '건웅이' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.masked, 'gu***01');
  assert.ok(!JSON.stringify(r).includes('gunwoong01'), '전체 아이디는 안 보냄');
  assert.equal((await post('/api/site/find-id', { nickname: '없는사람' })).ok, false);
  const ip = '10.200.0.1';
  for (let i = 0; i < 5; i++) assert.equal((await post('/api/site/find-id', { nickname: '건웅이' }, null, ip)).ok, true);
  const lim = await post('/api/site/find-id', { nickname: '건웅이' }, null, ip);
  assert.equal(lim.ok, false);
  assert.match(lim.message, /10분/);
});

test('복구 코드: 비밀번호 확인 후 발급 · 재설정하면 옛 토큰 무효 · 코드는 한 번만', async () => {
  const u = await signup('recov1', '복구1');
  const other = (await post('/api/auth/login', { username: 'recov1', password: 'secret12' })).token;
  assert.equal((await get('/api/site/account/recovery', u.token)).hasCode, false);
  assert.equal((await post('/api/site/account/recovery', { password: 'wrong00' }, u.token)).ok, false, '비밀번호 틀리면 발급 안 함');
  assert.equal((await post('/api/site/account/recovery', { password: 'secret12' })).status, 401, '로그인 필요');
  const iss = await post('/api/site/account/recovery', { password: 'secret12' }, u.token);
  assert.equal(iss.ok, true, iss.message);
  assert.match(iss.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  assert.equal((await get('/api/site/account/recovery', u.token)).hasCode, true);
  // 저장소에는 해시만
  const stored = await srv.accounts.store.byName('recov1');
  assert.ok(!JSON.stringify(stored.meta).includes(iss.code.replace('-', '')), '코드 원문은 저장 안 함');
  // 다시 발급하면 이전 코드는 못 씀
  const iss2 = await post('/api/site/account/recovery', { password: 'secret12' }, u.token);
  const bad = await post('/api/site/reset-password', { username: 'recov1', code: iss.code, next: 'brandnew1' });
  assert.equal(bad.ok, false, '옛 코드 거절');
  // 소문자 · 하이픈 없이 써도 됨
  const r = await post('/api/site/reset-password', { username: 'RECOV1', code: iss2.code.replace('-', '').toLowerCase(), next: 'brandnew1' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.user.username, 'recov1');
  assert.match(r.code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/, '새 복구 코드를 같이 줌');
  assert.equal((await get('/api/auth/me', u.token)).ok, false, '옛 토큰 무효');
  assert.equal((await get('/api/auth/me', other)).ok, false, '다른 기기 토큰도 무효');
  assert.equal((await get('/api/auth/me', r.token)).ok, true, '새 토큰은 됨');
  assert.equal((await post('/api/auth/login', { username: 'recov1', password: 'secret12' })).ok, false);
  assert.equal((await post('/api/auth/login', { username: 'recov1', password: 'brandnew1' })).ok, true);
  // 한 번 쓴 코드는 끝
  assert.equal((await post('/api/site/reset-password', { username: 'recov1', code: iss2.code, next: 'another11' })).ok, false);
  // 새로 받은 코드는 됨
  assert.equal((await post('/api/site/reset-password', { username: 'recov1', code: r.code, next: 'another11' })).ok, true);
});

test(`복구 코드 ${RECOVERY_FAILS}번 틀리면 1시간 잠금 (맞는 코드도 거절), 지나면 풀림`, async () => {
  const u = await signup('recov2', '복구2');
  const { code } = await post('/api/site/account/recovery', { password: 'secret12' }, u.token);
  assert.equal((await post('/api/site/reset-password', { username: 'recov2', code, next: '12' })).ok, false, '짧은 비밀번호 거절');
  for (let i = 0; i < RECOVERY_FAILS; i++) {
    const w = await post('/api/site/reset-password', { username: 'recov2', code: 'AAAAA-AAAAA', next: 'newpass11' });
    assert.equal(w.ok, false);
  }
  const locked = await post('/api/site/reset-password', { username: 'recov2', code, next: 'newpass11' });
  assert.equal(locked.ok, false);
  assert.match(locked.message, /잠겼어요/);
  assert.equal((await get('/api/auth/me', u.token)).ok, true, '잠겨도 계정은 그대로');
  clock += 61 * 60 * 1000;
  const ok = await post('/api/site/reset-password', { username: 'recov2', code, next: 'newpass11' });
  assert.equal(ok.ok, true, ok.message);
  // 없는 아이디도 같은 문구
  const none = await post('/api/site/reset-password', { username: 'nobody77', code, next: 'newpass11' });
  assert.equal(none.ok, false);
  assert.match(none.message, /아이디 또는 복구 코드/);
});

test('복구 코드 없으면 운영자에게 요청 → 건의함에 “비밀번호 초기화 요청” · 임시 비밀번호 발급', async () => {
  await signup('forgot1', '까먹음');
  const boss = await signup('boss', '대장');
  assert.equal((await post('/api/site/reset-request', { username: 'forgot1', note: '' })).ok, false, '메모 필요');
  const r = await post('/api/site/reset-request', { username: 'forgot1', note: '카톡 찬찬 으로 연락 주세요' });
  assert.equal(r.ok, true, r.message);
  // 없는 아이디도 똑같이 '보냈어요' (있는지 알려 주지 않음) · 건의함엔 안 쌓임
  assert.equal((await post('/api/site/reset-request', { username: 'ghost99', note: '저요' })).ok, true);
  // 같은 아이디 반복 요청은 한 번만 쌓임
  await post('/api/site/reset-request', { username: 'forgot1', note: '또 보냄' });
  const inbox = (await get('/api/admin/feedback', boss.token)).feedback;
  const reqs = inbox.filter((f) => f.category === 'pwreset');
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].username, 'forgot1');
  assert.match(reqs[0].text, /카톡/);
  assert.ok(!inbox.some((f) => f.username === 'ghost99'));
  // 일반 건의로는 이 분류를 못 고름
  await post('/api/site/feedback', { category: 'pwreset', text: '가짜 요청' });
  const again = (await get('/api/admin/feedback', boss.token)).feedback;
  assert.equal(again.find((f) => f.text === '가짜 요청').category, 'etc');
  // 관리실에서 임시 비밀번호 발급 → 로그인
  const t = await post('/api/admin/users/forgot1/password', {}, boss.token);
  assert.equal(t.ok, true, t.message);
  assert.equal((await post('/api/auth/login', { username: 'forgot1', password: t.tempPassword })).ok, true);
  // IP당 한 시간 3번
  const ip = '10.201.0.1';
  for (let i = 0; i < 3; i++) assert.equal((await post('/api/site/reset-request', { username: 'forgot1', note: '메모요' }, null, ip)).ok, true);
  assert.equal((await post('/api/site/reset-request', { username: 'forgot1', note: '메모요' }, null, ip)).ok, false);
});

test('PgSiteStore: 닉네임으로 찾기 쿼리 모양', async () => {
  const { PgSiteStore } = require('../server/site-store');
  const seen = [];
  const users = { pool: { query: async (sql, params) => { seen.push({ sql, params }); return { rows: [{ id: 'a', username: 'abc', pass: 'x', nickname: 'N', created_at: '1', stats: {}, meta: {} }] }; } }, row: (r) => r && { id: r.id, username: r.username } };
  const st = new PgSiteStore(users);
  const u = await st.byNickname('Nick');
  assert.equal(u.username, 'abc');
  assert.match(seen[0].sql, /lower\(nickname\)=lower\(\$1\) LIMIT 1/);
  assert.deepEqual(seen[0].params, ['Nick']);
});
