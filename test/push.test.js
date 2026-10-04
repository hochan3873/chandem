'use strict';
// 웹 푸시 알림: 구독 저장 · 보낼 때 규칙(조용한 시간 · 하루 2번 · 종류별 간격 · 조건) · tick 열쇠 · 열쇠 없으면 꺼짐
const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('../server/index');
const { createPush, FilePushStore, dueKind, markSent, pushReady, kstDay } = require('../server/push');

const H = 3600e3, D = 24 * H;
const kst = (d, h, m = 0) => Date.UTC(2026, 9, d, h - 9, m); // 2026-10-d h:m (KST) — 10/5 는 월요일 (주 시작)
const ENV = { VAPID_PUBLIC_KEY: 'pub-test', VAPID_PRIVATE_KEY: 'priv-test', PUSH_TICK_KEY: 'tick-secret' };
let L;
test.before(async () => { await pushReady; L = await import('../public/langbang/live.js'); });

const sub = (o = {}) => ({ endpoint: 'https://push.example/' + Math.random().toString(36).slice(2), keys: { p256dh: 'p', auth: 'a' }, userId: 'u1', createdAt: kst(1, 12), last: {}, ...o });
// 체력 가득 · 출석함 · 이번 주 레이드 들어감 · 두 시간 전에 놀았음
const lbAt = (now, o = {}) => ({ maxStage: 8, sta: { v: 50, t: now - 2 * H }, lastSeenAt: now - 2 * H, checkin: { last: L.dayIndex(now), streak: 3 }, raid2: { wi: L.weekIndex(now), used: 1 }, ...o });

test('구독 저장소: 넣기 · 덮어쓰기 · 지우기', async () => {
  const st = new FilePushStore(null);
  const a = sub(), b = sub({ userId: null, deviceId: 'dev123456' });
  await st.put(a); await st.put(b);
  assert.equal((await st.list()).length, 2);
  await st.put({ ...a, kinds: ['checkin'] });
  assert.deepEqual((await st.get(a.endpoint)).kinds, ['checkin']);
  assert.equal(await st.remove(a.endpoint), true);
  assert.equal(await st.remove(a.endpoint), false);
  assert.deepEqual((await st.list()).map((s) => s.endpoint), [b.endpoint]);
});

test('조용한 시간(22~9시 KST)엔 안 보냄', () => {
  for (const t of [kst(6, 22), kst(6, 23, 30), kst(7, 3), kst(7, 8, 59)]) assert.equal(dueKind(sub(), lbAt(t), t), null);
  const t = kst(7, 9);
  assert.equal(dueKind(sub(), lbAt(t), t), 'stamina');
});

test('체력 가득: 놀고 나서 한 번만 · 방금 놀았으면 안 보냄 · 마스터 제외', () => {
  const t = kst(6, 10), s = sub();
  assert.equal(dueKind(s, lbAt(t), t), 'stamina');
  assert.equal(dueKind(s, lbAt(t, { lastSeenAt: t - 10 * 60e3 }), t), null, '10분 전에 놀았음');
  assert.equal(dueKind(s, lbAt(t, { sta: { v: 20, t: t - 10 * 60e3 } }), t), null, '아직 안 참');
  assert.equal(dueKind(s, lbAt(t), t, { master: true }), null);
  markSent(s, 'stamina', t);
  const t2 = t + 21 * H; // 다음 날 7시 → 9시 이후로
  assert.equal(dueKind(s, lbAt(t, { checkin: { last: L.dayIndex(t2), streak: 4 } }), t2 + 2 * H), null, '그 뒤로 안 놀았으면 다시 안 보냄');
});

test('출석: 18시 이후 · 안 했을 때만 · 같은 종류 20시간 간격', () => {
  const base = (t) => lbAt(t, { sta: { v: 10, t: t - 10 * 60e3 }, checkin: { last: L.dayIndex(t) - 1, streak: 2 } });
  assert.equal(dueKind(sub(), base(kst(6, 17, 50)), kst(6, 17, 50)), null);
  assert.equal(dueKind(sub(), base(kst(6, 18, 5)), kst(6, 18, 5)), 'checkin');
  const t = kst(6, 19);
  assert.equal(dueKind(sub(), lbAt(t, { sta: { v: 10, t: t - 10 * 60e3 } }), t), null, '이미 출석함');
  assert.equal(dueKind(sub({ last: { checkin: t - 19 * H } }), base(t), t), null, '20시간 안 됨');
  assert.equal(dueKind(sub({ kinds: ['stamina'] }), base(t), t), null, '출석 알림을 껐음');
});

test('건물주 출몰: 새 주에 안 들어갔으면 주마다 한 번 · 1-5 전엔 없음', () => {
  const t = kst(5, 12), s = sub();
  const lb = lbAt(t, { raid2: { wi: L.weekIndex(t) - 1, used: 3 } });
  assert.equal(dueKind(s, lb, t), 'raid');
  assert.equal(dueKind(s, { ...lb, maxStage: 3 }, t), 'stamina', '레이드 잠김');
  markSent(s, 'raid', t);
  assert.equal(s.raidWi, L.weekIndex(t));
  const t2 = kst(7, 12);
  assert.notEqual(dueKind(s, lbAt(t2, { raid2: { wi: L.weekIndex(t) - 1 } }), t2), 'raid', '같은 주엔 다시 안 보냄');
  const t3 = kst(12, 12); // 다음 주 월요일
  assert.equal(dueKind(s, lbAt(t3, { raid2: { wi: L.weekIndex(t) } }), t3), 'raid');
});

test('오랜만이에요: 사흘 안 들어오면 그것만 · 사흘에 한 번', () => {
  const t = kst(9, 12);
  const lb = { maxStage: 8, sta: { v: 50, t: t - 4 * D }, lastSeenAt: t - 4 * D, checkin: { last: L.dayIndex(t) - 4, streak: 1 } };
  assert.equal(dueKind(sub(), lb, t), 'comeback');
  assert.equal(dueKind(sub({ last: { comeback: t - 2 * D } }), lb, t), null);
  assert.equal(dueKind(sub({ last: { comeback: t - 3 * D } }), lb, t), 'comeback');
});

test('손님 기기: 로그인 안내만 · 하루 지난 뒤부터 · 나흘에 한 번', () => {
  const t = kst(9, 12);
  assert.equal(dueKind(sub({ userId: null, createdAt: t - 2 * H }), null, t), null);
  assert.equal(dueKind(sub({ userId: null, createdAt: t - 2 * D }), null, t), 'guest');
  assert.equal(dueKind(sub({ userId: null, createdAt: t - 9 * D, last: { guest: t - 3 * D } }), null, t), null);
  assert.equal(dueKind(sub({ userId: null, createdAt: t - 9 * D, last: { guest: t - 4 * D } }), null, t), 'guest');
});

test('하루 최대 2번 (KST 날짜) · 날이 바뀌면 다시', () => {
  const t = kst(6, 12), s = sub({ day: kstDay(t), sentToday: 2 });
  assert.equal(dueKind(s, lbAt(t), t), null);
  s.day = kstDay(t) - 1;
  assert.equal(dueKind(s, lbAt(t), t), 'stamina');
  markSent(s, 'stamina', t);
  assert.equal(s.sentToday, 1);
  assert.equal(s.day, kstDay(t));
});

test('tick: 가짜 보내기 · 하루 2번 상한 · 410 이면 구독 지움', async () => {
  let t = kst(5, 10);
  const users = { u1: { id: 'u1', username: 'kim', stats: { langbang: { maxStage: 8, sta: { v: 50, t: t - 3 * H }, lastSeenAt: t - 3 * H, checkin: { last: -1, streak: 0 }, raid2: { wi: -1, used: 0 } } }, meta: {} } };
  const acct = { store: { byId: async (id) => users[id] || null }, verifyToken: () => null };
  const sent = [];
  const st = new FilePushStore(null);
  const P = createPush({ acct, store: st, env: ENV, now: () => t, sender: async (s, payload) => { if (s.endpoint.endsWith('/gone')) { const e = new Error('gone'); e.statusCode = 410; throw e; } sent.push([s.endpoint, payload.tag]); } });
  await P.ready;
  await st.put(sub({ endpoint: 'https://push.example/a', createdAt: t - D }));
  await st.put(sub({ endpoint: 'https://push.example/gone', userId: null, createdAt: t - 5 * D }));
  let r = await P.tick();
  assert.equal(r.checked, 2); assert.equal(r.sent, 1); assert.equal(r.removed, 1);
  assert.deepEqual(sent, [['https://push.example/a', 'lb-raid']]);
  assert.equal(await st.get('https://push.example/gone'), null);
  t += 15 * 60e3; r = await P.tick();
  assert.deepEqual(sent.map((x) => x[1]), ['lb-raid', 'lb-stamina']);
  t = kst(5, 19); r = await P.tick();
  assert.equal(r.sent, 0, '하루 2번 넘음 (출석 알림은 내일)');
  t = kst(6, 19); r = await P.tick();
  assert.deepEqual(sent.map((x) => x[1]), ['lb-raid', 'lb-stamina', 'lb-checkin']);
  t = kst(6, 23); r = await P.tick();
  assert.equal(r.quiet, true);
  const s = await st.get('https://push.example/a');
  assert.equal(s.sentToday, 1); assert.ok(s.lastSentAt > 0);
});

test('서버: 자동 열쇠를 끄고 열쇠가 없으면 꺼짐 · tick 은 tick 열쇠가 있으면 403', async () => {
  const srv = createServer({ port: 0, push: { env: { PUSH_AUTOKEY: '0', PUSH_TICK_KEY: 'tk' } } });
  const base = `http://127.0.0.1:${await srv.listen()}`;
  try {
    const k = await (await fetch(base + '/api/push/key')).json();
    assert.deepEqual([k.ok, k.disabled], [false, true]);
    const s = await (await fetch(base + '/api/push/subscribe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
    assert.equal(s.disabled, true);
    assert.equal((await fetch(base + '/api/push/tick', { method: 'POST' })).status, 403);
    assert.equal(srv.push.enabled, false);
  } finally { await srv.close(); }
});

test('서버: 구독 · tick 열쇠 · 마스터 시험 알림', async () => {
  const prev = process.env.MASTER_USERS;
  process.env.MASTER_USERS = 'pushmaster';
  const got = [];
  const srv = createServer({ port: 0, push: { env: ENV, sender: async (s, p) => { got.push([s.endpoint, p.tag]); } } });
  const base = `http://127.0.0.1:${await srv.listen()}`;
  const post = (url, body, headers = {}) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body || {}) });
  try {
    const k = await (await fetch(base + '/api/push/key')).json();
    assert.deepEqual([k.ok, k.key], [true, 'pub-test']);
    assert.equal((await post('/api/push/subscribe', { subscription: { endpoint: 'http://bad' } })).status, 400);
    const g = await (await post('/api/push/subscribe', { subscription: { endpoint: 'https://push.example/guest', keys: { p256dh: 'p', auth: 'a' } }, deviceId: 'dev-abc123' })).json();
    assert.deepEqual([g.ok, g.user], [true, false]);
    assert.equal((await srv.push.store.get('https://push.example/guest')).deviceId, 'dev-abc123');
    assert.equal((await post('/api/push/tick', {}, { 'x-push-key': 'wrong-key!!' })).status, 403);
    const tk = await (await post('/api/push/tick', {}, { 'x-push-key': 'tick-secret' })).json();
    assert.equal(tk.ok, true); assert.equal(typeof tk.checked, 'number');
    assert.equal((await post('/api/push/test', {})).status, 403, '로그인 안 함');
    const su = await (await post('/api/auth/signup', { username: 'pushmaster', password: 'pass1234', nickname: '푸시마스터' })).json();
    assert.equal(su.ok, true, su.message);
    const auth = { authorization: 'Bearer ' + su.token };
    const m = await (await post('/api/push/subscribe', { subscription: { endpoint: 'https://push.example/master', keys: { p256dh: 'p', auth: 'a' } }, kinds: ['stamina', 'nope'] }, auth)).json();
    assert.deepEqual([m.ok, m.user, m.kinds], [true, true, ['stamina']]);
    const r = await (await post('/api/push/test', {}, auth)).json();
    assert.deepEqual([r.ok, r.subs, r.sent], [true, 1, 1]);
    assert.deepEqual(got.at(-1), ['https://push.example/master', 'lb-test']);
    assert.equal((await (await post('/api/push/unsubscribe', { endpoint: 'https://push.example/master' })).json()).removed, true);
  } finally {
    await srv.close();
    if (prev === undefined) delete process.env.MASTER_USERS; else process.env.MASTER_USERS = prev;
  }
});

test('서버: 열쇠 환경 변수가 없으면 스스로 만들어 저장해 두고 다음에도 같은 열쇠 · tick 열쇠가 없으면 5분에 한 번만', async () => {
  const P = require('../server/push');
  const file = require('path').join(require('os').tmpdir(), 'pushkey-' + Date.now() + '.json');
  const a = P.createPush({ env: {}, store: P.createPushStore({ file }) }); await a.ready;
  assert.equal(a.enabled, true); const k1 = a.publicKey; assert.ok(k1 && k1.length > 40);
  const b = P.createPush({ env: {}, store: P.createPushStore({ file }) }); await b.ready;
  assert.equal(b.publicKey, k1, '다시 켜도 같은 열쇠');
  require('fs').rmSync(file, { force: true });
  const srv = createServer({ port: 0, push: { env: {}, sender: async () => {} } });
  const base = `http://127.0.0.1:${await srv.listen()}`;
  try {
    const t1 = await (await fetch(base + '/api/push/tick', { method: 'POST' })).json();
    const t2 = await (await fetch(base + '/api/push/tick', { method: 'POST' })).json();
    assert.equal(t1.ok, true); assert.equal(t2.skipped, 'recent');
  } finally { await srv.close(); }
});
