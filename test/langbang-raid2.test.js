'use strict';
// 건물주 레이드 (주간 서버 레이드 · 거대 보스 혼자): 주 바뀜(잡음/못 잡음) · 서버 체력 셈(동시에 끝나도 한 번씩) · 한 판 1% 상한 · 페이즈 · 입장 · 부르기 · 페이즈 막타 · 보상(한 번만) · 세트 · 옛(팔 8개) 기록 옮기기 · 옛 레이드 보상
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

const lib = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let srv, base, R2, L, S, RS;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
  [R2, L, S, RS] = await Promise.all([lib('raid2.js'), lib('live.js'), lib('sim.js'), lib('raid2-sim.js')]);
  await srv.accounts.ready;
});
test.after(async () => { await srv.close(); });

const post = (url, token, body) => fetch(base + '/api/langbang' + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }).then((x) => x.json());
const get = (url, token) => fetch(base + '/api/langbang' + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((x) => x.json());
let seq = 0;
async function user(nick, o = {}) {
  const { token, user: u } = await srv.accounts.signup({ username: `rd${Date.now() % 1e6}${seq++}`, password: 'secret12', nickname: nick });
  const st = (await srv.accounts.store.byId(u.id)).stats;
  st.langbang.stages = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, ...(o.stages || {}) };
  if (o.heroes) st.langbang.heroes = { ...st.langbang.heroes, ...o.heroes };
  await srv.accounts.store.saveStats(u.id, st);
  return { token, id: u.id, nick, raw: async () => (await srv.accounts.store.byId(u.id)).stats };
}
async function friends(a, b) {
  assert.equal((await post('/friends/request', a.token, { q: b.nick })).ok, true);
  assert.equal((await post('/friends/accept', b.token, { id: a.id })).ok, true);
}
const strong = { stages: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [i + 1, 3])), heroes: { bangjang: 15, staff: 15, gunman: 15, gunnyeo: 15 } };
// 서버 보스를 작은 체력으로 (테스트가 잡을 수 있게)
async function smallBoss(now, tier = 1, hpMax = 1e6) {
  const s = R2.newBoss(L.weekIndex(now), tier, 0, now);
  s.hpMax = hpMax;
  for (const p of R2.PARTS) s.hp[p] = s.max[p] = R2.partMax(hpMax, p);
  await srv.accounts.raid2._setState(s);
  return s;
}
const mid = (wi) => L.weekStartMs(wi) + 3 * L.DAY + 12 * 3600e3; // 그 주 목요일 낮

test('주 바뀜: 잡았으면 다음 단계 새 보스 · 못 잡았으면 남은 체력 그대로 (같은 단계) · 지난주 기록 보관', () => {
  const wi = 30, now = mid(wi);
  const s = R2.newBoss(wi, 1, 10, now);
  assert.equal(s.hpMax, R2.hpMaxFor(1, 10));
  assert.equal(R2.hpMaxFor(1, 3), R2.hpMaxFor(1, R2.R2.floor), '활동 인원이 적어도 floor 만큼');
  assert.ok(R2.hpMaxFor(1, 100) > R2.hpMaxFor(1, 50), '활동 인원이 많으면 체력도 많이');
  assert.ok(Math.abs(R2.hpMaxFor(2, 50) / R2.hpMaxFor(1, 50) - R2.R2.tierMul) < 0.01, '단계마다 ×1.5');
  assert.equal(s.max.body, s.hpMax, '체력은 하나 (거대 보스 혼자)');
  // 못 잡은 주 → 이어서 (옛 팔 이름으로 와도 몸통 피해로 들어간다)
  R2.applyRun(s, 'u1', '가', { mega: 1e12 }, now);
  assert.ok(R2.hpLeft(s) < s.hpMax);
  const left = R2.hpLeft(s);
  const r1 = R2.rollWeek(s, mid(wi + 1), 99);
  assert.equal(r1.rolled, true);
  assert.equal(r1.s.wi, wi + 1); assert.equal(r1.s.tier, 1, '같은 단계');
  assert.equal(R2.hpLeft(r1.s), left, '남은 체력 그대로');
  assert.equal(r1.s.hpMax, s.hpMax, '체력 공식은 그대로 (활동 인원이 바뀌어도)');
  assert.deepEqual(r1.s.board, {}, '기여 순위는 주마다 새로');
  assert.equal(r1.s.hist[0].wi, wi); assert.equal(r1.s.hist[0].killed, false); assert.equal(r1.s.hist[0].rank[0][0], 'u1');
  assert.equal(R2.rollWeek(r1.s, mid(wi + 1), 99).rolled, false, '같은 주엔 그대로');
  // 잡은 주 → 다음 단계 · 새 체력
  const k = r1.s;
  for (const p of R2.PARTS) k.hp[p] = 0;
  k.killedAt = mid(wi + 1);
  const r2 = R2.rollWeek(k, mid(wi + 2), 40);
  assert.equal(r2.s.tier, 2);
  assert.equal(r2.s.hpMax, R2.hpMaxFor(2, 40));
  assert.equal(R2.hpLeft(r2.s), r2.s.hpMax, '꽉 찬 새 보스');
  assert.equal(r2.s.hist.length, 2); assert.equal(r2.s.hist[0].killed, true);
  // 몇 주를 건너뛰어도 한 번에
  const r3 = R2.rollWeek(r2.s, mid(wi + 9), 40);
  assert.equal(r3.s.wi, wi + 9); assert.equal(r3.s.tier, 2);
});

test('한 판 반영: 최대 체력 1% 상한 · 페이즈 넘긴 판 기록(2 · 3페이즈) · 소식 · 처치', () => {
  const s = R2.newBoss(10, 1, 0);
  const cap = Math.round(s.hpMax * R2.R2.runCapPct);
  assert.deepEqual(R2.exposed(s), ['body']);
  assert.equal(R2.phaseOf(s), 1);
  // 1% 상한 (맨 위 계정이 아무리 세도)
  const r = R2.applyRun(s, 'a', '가', { body: cap * 10 }, 1);
  assert.equal(r.counted, cap); assert.equal(r.clipped, true);
  assert.ok(r.counted <= s.hpMax * 0.01 + 1, '한 판에 1% 를 못 넘는다');
  // 2페이즈 경계 바로 위 → 넘긴 사람 기록 · 소식
  s.hp.body = Math.floor(s.hpMax * R2.R2.phaseAt[0]) + 100;
  const r2 = R2.applyRun(s, 'b', '나', { body: 500 }, 2);
  assert.deepEqual(r2.broke, ['p2']);
  assert.equal(R2.phaseOf(s), 2);
  assert.equal(s.by.p2.uid, 'b', '2페이즈 막타 기록');
  assert.equal(s.feed[0].k, 'phase'); assert.equal(s.feed[0].n, '나'); assert.equal(s.feed[0].p, 'p2');
  assert.equal(r2.counted, 500);
  // 같은 페이즈를 또 넘겨도(이미 기록) 두 번 안 준다 · 옛 팔 이름 피해도 몸통으로
  const before = R2.hpLeft(s);
  assert.deepEqual(R2.applyRun(s, 'c', '다', { mega: 300, golf: 600 }, 3).broke, []);
  assert.equal(before - R2.hpLeft(s), 900, '옛 팔 이름 피해 → 몸통');
  // 3페이즈 → 처치
  s.hp.body = Math.floor(s.hpMax * R2.R2.phaseAt[1]) + 100;
  assert.deepEqual(R2.applyRun(s, 'c', '다', { body: 500 }, 4).broke, ['p3']);
  assert.equal(s.by.p3.uid, 'c');
  s.hp.body = 50;
  const rk = R2.applyRun(s, 'd', '라', { body: 999 }, 5);
  assert.deepEqual(rk.broke, ['body']);
  assert.equal(rk.killed, true); assert.equal(s.killer.uid, 'd');
  assert.equal(R2.phaseOf(s), 4); assert.deepEqual(R2.exposed(s), []);
  assert.equal(rk.counted, 50, '죽은 뒤로는 안 깎인다');
  assert.equal(s.feed[0].k, 'kill');
  assert.equal(R2.applyRun(s, 'e', '마', { body: 999 }, 6).counted, 0);
});

test('예전(팔 8개) 서버 상태 · 판 기록 → 체력 하나로 옮김 (남은 체력 · 막타 · 페이즈 그대로) · 서버가 불러와도 안 깨짐', async () => {
  const OLD = ['mega', 'bill', 'bottle', 'golf', 'contract', 'keys', 'bag', 'phone'];
  const hpMax = 1e6;
  const old = { v: 1, wi: 10, tier: 2, active: 5, hpMax, hp: {}, max: {}, by: { mega: { uid: 'x', n: '옛막타', at: 1 } }, killedAt: 0, killer: null, startedAt: 0, board: { u: { n: '가', d: 5, r: 1, c: 0, lh: 1 } }, feed: [{ t: 1, n: '옛막타', k: 'break', p: 'mega' }], live: {}, hist: [] };
  for (const p of OLD) { old.max[p] = hpMax * 0.08; old.hp[p] = p === 'mega' ? 0 : hpMax * 0.03; }
  old.max.body = old.hp.body = hpMax * 0.36;
  const m = R2.migrateState(old);
  assert.equal(m.v, 2);
  assert.deepEqual(Object.keys(m.hp), ['body']);
  assert.equal(m.hp.body, Math.round(hpMax * 0.03 * 7 + hpMax * 0.36), '남은 체력 = 팔 + 본체');
  assert.equal(m.max.body, hpMax);
  assert.equal(R2.phaseOf(m), 2, '남은 57% → 2페이즈');
  assert.equal(m.board.u.d, 5, '기여 순위 그대로');
  assert.equal(R2.migrateState(m), m, '두 번 옮기지 않는다');
  // 다 잡힌 옛 상태 → 잡힌 그대로
  const dead = JSON.parse(JSON.stringify(old)); for (const p of [...OLD, 'body']) dead.hp[p] = 0; dead.killedAt = 5;
  assert.equal(R2.killed(R2.migrateState(dead)), true);
  // 서버: 옛 상태를 넣어도 화면 · 끝내기가 돈다 (옛 팔 이름으로 온 판도 몸통 피해로)
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 7);
  Date.now = () => T;
  try {
    const cur = JSON.parse(JSON.stringify(old)); cur.wi = L.weekIndex(T);
    await srv.accounts.raid2._setState(cur);
    const u = await user('옛팔', strong);
    const bd = await get('/raid2', u.token);
    assert.equal(bd.ok, true, bd.message);
    assert.deepEqual(Object.keys(bd.hp), ['body']); assert.equal(bd.phase, 2);
    const s0 = await post('/raid2/start', u.token, {});
    assert.equal(s0.ok, true, s0.message);
    T += 120e3;
    const left0 = R2.hpLeft(srv.accounts.raid2._state());
    const f = await post('/raid2/finish', u.token, { runId: s0.runId, parts: { bill: 700, phone: 300 }, durationSec: 110 });
    assert.equal(f.ok, true, f.message);
    assert.equal(left0 - R2.hpLeft(srv.accounts.raid2._state()), 1000);
  } finally { Date.now = realNow; }
  // 판 기록(lb.raid2.run.ex)에 옛 이름이 있어도 버린다
  const out = {};
  R2.normRaid2({ raid2: { run: { id: 'r1', wi: 1, at: 1, ex: ['mega', 'body'] } } }, out);
  assert.deepEqual(out.raid2.run.ex, ['body']);
});

test('입장 3번 · 친구 부르기(+1 입장 · 응답 버프 · 둘 다 협동 기여 · 하루 한 번) · 친구가 아니면 못 부름', async () => {
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 1);
  Date.now = () => T;
  try {
    await smallBoss(T, 1, 1e9);
    const a = await user('부르미', strong), b = await user('응답이', strong), c = await user('남이', strong);
    await friends(a, b);
    assert.equal((await post('/raid2/rally', a.token, { id: c.id })).ok, false, '친구가 아니면 못 부름');
    const ra = await post('/raid2/rally', a.token, { id: b.id });
    assert.equal(ra.ok, true, ra.message);
    assert.equal((await post('/raid2/rally', a.token, { id: b.id })).ok, false, '같은 친구는 하루 한 번');
    const bd = await get('/raid2', b.token);
    assert.equal(bd.me.rin.length, 1); assert.equal(bd.me.rin[0].n, '부르미');
    assert.equal(bd.me.left, R2.R2.entries);
    // b: 기본 3번 다 쓰기
    for (let i = 0; i < R2.R2.entries; i++) {
      const s0 = await post('/raid2/start', b.token, {});
      assert.equal(s0.ok, true, s0.message);
      T += 170e3;
      const f = await post('/raid2/finish', b.token, { runId: s0.runId, parts: { mega: 1000 }, durationSec: 160, kills: 10 });
      assert.equal(f.ok, true, f.message);
    }
    const no = await post('/raid2/start', b.token, {});
    assert.equal(no.ok, false); assert.match(no.message, /입장/);
    // 부르기에 응답 → +1 입장 · 버프
    const sr = await post('/raid2/start', b.token, { rally: a.id });
    assert.equal(sr.ok, true, sr.message);
    assert.equal(sr.rally.n, '부르미');
    T += 170e3;
    const fr = await post('/raid2/finish', b.token, { runId: sr.runId, parts: { bill: 50000 }, durationSec: 160 });
    assert.equal(fr.ok, true, fr.message);
    assert.equal(fr.raid2.coop, 5000, '협동 +10%');
    const st = srv.accounts.raid2._state();
    assert.equal(st.board[b.id].c, 5000, '응답한 사람 협동 기여');
    assert.equal(st.board[a.id].c, 5000, '부른 사람도 협동 기여');
    const ma = (await get('/me', a.token)).profile.mail.find((m) => /응답/.test(m.title));
    assert.ok(ma, '부른 사람에게 우편');
    assert.equal((await post('/raid2/start', b.token, { rally: a.id })).ok, false, '부르기는 한 번 쓰면 끝');
    // 순수 함수: 추가 입장은 주마다 최대 bonusMax
    const lb = { maxStage: 5, fr: { list: [] }, raid2: R2.emptyR2() };
    R2.r2Week(lb, T);
    lb.raid2.rin = [{ id: 'x', n: 'x', at: T }, { id: 'y', n: 'y', at: T }, { id: 'z', n: 'z', at: T }];
    const bs = R2.newBoss(L.weekIndex(T), 1, 0, T);
    for (const f of ['x', 'y', 'z']) R2.r2Start(lb, bs, 'r' + f, T, { rally: f });
    assert.equal(lb.raid2.bonus, R2.R2.bonusMax);
    assert.equal(R2.entriesLeft(lb, T), R2.R2.entries + R2.R2.bonusMax - 3);
    // 다음 주엔 입장이 다시 3번
    assert.equal(R2.entriesLeft(lb, T + 7 * L.DAY), R2.R2.entries);
  } finally { Date.now = realNow; }
});

test('서버 체력: 동시에 끝난 판도 한 번씩만 · 같은 판 두 번 보내면 거절 · 상한 넘는 기록 거절 · 판 번호 없으면 거절', async () => {
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 2);
  Date.now = () => T;
  try {
    const s0 = await smallBoss(T, 1, 5e8);
    const us = await Promise.all(['동시1', '동시2', '동시3', '동시4'].map((n) => user(n, strong)));
    const runs = [];
    for (const u of us) { const r = await post('/raid2/start', u.token, {}); assert.equal(r.ok, true, r.message); runs.push(r.runId); }
    T += 165e3;
    const left0 = R2.hpLeft(srv.accounts.raid2._state());
    const amt = [11111, 22222, 33333, 44444];
    const res = await Promise.all(us.map((u, i) => post('/raid2/finish', u.token, { runId: runs[i], parts: { golf: amt[i] }, durationSec: 160 })));
    for (const r of res) assert.equal(r.ok, true, r.message);
    const dup = await Promise.all(us.slice(0, 2).map((u, i) => post('/raid2/finish', u.token, { runId: runs[i], parts: { golf: amt[i] }, durationSec: 160 })));
    for (const r of dup) assert.equal(r.ok, false, '같은 판 두 번');
    const st = srv.accounts.raid2._state();
    assert.equal(left0 - R2.hpLeft(st), amt.reduce((a, b) => a + b, 0), '정확히 한 번씩');
    assert.equal(st.hp.body, s0.max.body - amt.reduce((a, b) => a + b, 0), '옛 팔 이름(golf)으로 와도 몸통 체력에서');
    assert.equal(R2.participants(st), 4);
    // 상한 넘는 기록 · 판 번호 없음 · 시간이 안 맞음
    const u = await user('조작', {});
    const r1 = await post('/raid2/start', u.token, {});
    T += 20e3;
    const lbU = (await get('/me', u.token)).profile;
    assert.equal((await post('/raid2/finish', u.token, { runId: r1.runId, parts: { golf: 10 }, durationSec: 160 })).ok, false, '20초 지났는데 160초 판');
    T += 150e3;
    assert.equal((await post('/raid2/finish', u.token, { runId: r1.runId, parts: { golf: R2.r2Cap(lbU, 160) + 1000 }, durationSec: 160 })).ok, false, '상한 넘음');
    assert.equal((await post('/raid2/finish', u.token, { runId: 'nope', parts: { golf: 10 }, durationSec: 160 })).ok, false, '판 번호 없음');
    // 한 판 1% 상한 (서버에서): 아주 센 계정이 상한 안 기록을 보내도 1%만
    const big = await user('센사람', { stages: Object.fromEntries(Array.from({ length: 70 }, (_, i) => [i + 1, 3])), heroes: Object.fromEntries(['bangjang', 'staff', 'gunman', 'gunnyeo', 'hochan', 'ara'].map((h) => [h, 20])) });
    const rb = await post('/raid2/start', big.token, {});
    T += 165e3;
    const fb = await post('/raid2/finish', big.token, { runId: rb.runId, parts: { bill: 9e6 }, durationSec: 160 });
    assert.equal(fb.ok, true, fb.message);
    assert.equal(fb.raid2.counted, Math.round(st.hpMax * 0.01)); assert.equal(fb.raid2.clipped, true);
  } finally { Date.now = realNow; }
});

test('페이즈 넘긴 판 → 피드에 "누가 몰아넣었다" · 막타 우편 · 잡으면 참가 · 토벌 보상 우편 (여러 번 열어도 한 번만) · 주가 끝나면 순위 보상 + 세트 조각', async () => {
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 3);
  Date.now = () => T;
  try {
    const s = await smallBoss(T, 1, 1e6);
    const a = await user('막타왕후보', strong), b = await user('구경꾼', strong);
    // 2페이즈 경계 바로 위까지 깎아 둠
    s.hp.body = Math.floor(s.hpMax * R2.R2.phaseAt[0]) + 3000;
    const ra = await post('/raid2/start', a.token, {});
    T += 165e3;
    const fa = await post('/raid2/finish', a.token, { runId: ra.runId, parts: { body: 9000 }, durationSec: 160 });
    assert.equal(fa.ok, true, fa.message);
    assert.deepEqual(fa.raid2.broke, ['p2']);
    const bd = await get('/raid2', b.token);
    assert.equal(bd.phase, 2);
    assert.equal(bd.by.p2, '막타왕후보');
    assert.ok(bd.feed.some((f) => f.k === 'phase' && f.p === 'p2' && f.n === '막타왕후보'), '피드: 누가 2페이즈로 몰아넣었다');
    assert.ok(fa.profile.mail.some((m) => /2페이즈 돌입 막타/.test(m.title) && m.rw.tickets === R2.PART_RW.tickets), '페이즈 막타 우편');
    assert.equal(fa.mailN, 1);
    // 남은 체력을 1로 → b 가 마지막 일격 (3페이즈 넘김 + 대마왕 막타)
    const st = srv.accounts.raid2._state();
    st.hp.body = 1;
    const rb = await post('/raid2/start', b.token, {});
    T += 165e3;
    const fb = await post('/raid2/finish', b.token, { runId: rb.runId, parts: { bill: 5000 }, durationSec: 160 });
    assert.equal(fb.ok, true, fb.message);
    assert.equal(fb.raid2.killed, true);
    assert.ok(fb.profile.mail.some((m) => /대마왕 막타/.test(m.title) && m.rw.title === 'r2king'), '본체 막타: 막타왕');
    assert.equal((await post('/raid2/start', a.token, {})).ok, false, '잡힌 뒤엔 입장 불가');
    // 우편함 맞추기만 해도 (레이드 화면을 안 열어도) 참가 · 토벌 우편
    const ms = await post('/mail/sync', b.token, {});
    assert.equal(ms.ok, true, ms.message);
    assert.equal(ms.profile.mail.filter((m) => m.title === '건물주 토벌 성공!').length, 1);
    assert.equal((await post('/mail/sync', b.token, {})).profile.mail.filter((m) => m.title === '건물주 토벌 성공!').length, 1, '두 번 맞춰도 한 통');
    // 보드를 열면 참가 · 토벌 보상 우편 (한 번만)
    const v1 = await get('/raid2', a.token);
    assert.equal(v1.killed, true);
    assert.deepEqual(v1.mailed.sort(), ['건물주 레이드 참가 상자', '건물주 토벌 성공!'].sort());
    const v2 = await get('/raid2', a.token);
    assert.deepEqual(v2.mailed, [], '두 번째엔 없음');
    let mailA = (await get('/me', a.token)).profile.mail;
    assert.equal(mailA.filter((m) => m.title === '건물주 토벌 성공!').length, 1);
    const slay = mailA.find((m) => m.title === '건물주 토벌 성공!');
    assert.equal(slay.rw.title, 'r2slayer'); assert.equal(slay.rw.frame, 'r2frame');
    const setA = (await get('/me', a.token)).profile.raid2.set;
    assert.equal(Object.keys(setA).length, 1, '토벌 보상: 건물주 세트 조각');
    // 우편을 받으면 칭호 · 프레임이 들어온다
    const cl = await post('/mail/claim', a.token, { id: 'all' });
    assert.equal(cl.ok, true, cl.message);
    assert.ok(cl.profile.titles.includes('r2slayer') && cl.profile.frames.includes('r2frame'));
    // 다음 주: 2단계 · 지난주 순위 보상 (한 번)
    T += 7 * L.DAY;
    const n1 = await get('/raid2', a.token);
    assert.equal(n1.tier, 2); assert.equal(n1.killed, false);
    assert.equal(n1.prev.killed, true);
    assert.equal(n1.mailed.length, 1, '순위 보상만 (참가 · 토벌은 이미)');
    assert.match(n1.mailed[0], /기여/);
    assert.deepEqual((await get('/raid2', a.token)).mailed, []);
    const nb = await get('/raid2', b.token);
    assert.equal(nb.mailed.length, 1, 'b: 순위만 (참가 · 토벌은 우편함 맞출 때 이미)');
    mailA = (await get('/me', a.token)).profile.mail;
    const rk = mailA.find((m) => /기여/.test(m.title));
    assert.ok(rk.rw.tickets >= 1);
  } finally { Date.now = realNow; }
});

test('세트: 조각 받기(없는 것 먼저 → Lv) · 2세트 · 4세트 효과 · 끼우기 · 이상한 값은 버림', () => {
  const lb = { coins: 0, raid2: R2.emptyR2() };
  const got = [];
  for (let i = 0; i < 4; i++) got.push(R2.setGive(lb, 's' + i));
  assert.equal(new Set(got.map((x) => x.id)).size, 4, '없는 조각 먼저');
  const up = R2.setGive(lb, 'more');
  assert.equal(up.lv, 1);
  for (const id of R2.SET_IDS) lb.raid2.set[id].lv = R2.SET_MAX;
  assert.equal(R2.setGive(lb, 'x').coins, 3000); assert.equal(lb.coins, 3000);
  assert.equal(R2.setEquip(lb, 'raid2_bag', 'gunman').on, 'gunman');
  let st = R2.setStats(lb, 'gunman');
  assert.equal(st.r2Set, 1); assert.ok(st.atk > 0); assert.ok(!st.boss);
  R2.setEquip(lb, 'raid2_contract', 'gunman');
  st = R2.setStats(lb, 'gunman');
  assert.ok(Math.abs(st.boss - (R2.setValue('raid2_contract', R2.SET_MAX) + R2.SET_BONUS2.boss)) < 1e-9, '2세트');
  R2.setEquip(lb, 'raid2_keys', 'gunman'); R2.setEquip(lb, 'raid2_golf', 'gunman');
  st = R2.setStats(lb, 'gunman');
  assert.equal(st.r2Set, 4); assert.ok(st.ult >= R2.SET_BONUS4.ult);
  assert.ok(Math.abs(st.atk - (R2.setValue('raid2_bag', R2.SET_MAX) + R2.SET_BONUS4.atk)) < 1e-9, '4세트');
  assert.equal(R2.setEquip(lb, 'nope', 'gunman').error.length > 0, true);
  const out = {};
  R2.normRaid2({ raid2: { used: 99, bonus: 9, set: { raid2_bag: { lv: 99, on: 'nobody' }, hack: { lv: 1 } }, rin: [{ id: 5 }], paid: [{ wi: 3, f: 99 }] } }, out);
  assert.equal(out.raid2.bonus, R2.R2.bonusMax); assert.equal(out.raid2.set.raid2_bag.lv, R2.SET_MAX); assert.equal(out.raid2.set.raid2_bag.on, null);
  assert.ok(!out.raid2.set.hack); assert.equal(out.raid2.rin.length, 0); assert.equal(out.raid2.paid[0].f, 7);
});

test('전투(sim): 거대 보스 하나 · 진상 없음 · 예고 → 스킬로 끊으면 빈틈 · 안 끊으면 입구 피해 · 입구 붙잡기 떼기 · 화가 쌓임 · 시간 끝 = 철거', () => {
  const mk = () => S.createGame({ H: 760, mode: 'stage', deck: ['gunman', 'bangjang', 'staff', null, null, null], weekly: RS.waveDef(1), raid: { sec: R2.R2.sec }, slots: 3, rng: () => 0.3 });
  const g = mk();
  RS.attach(g, { tier: 1, hp: { body: 100 }, max: { body: 100 } });
  const e = g.r2.parts.body;
  assert.ok(e && e.r2 === 'body');
  assert.equal(g.r2.phase, 1);
  const gm = g.heroes.find((h) => h.id === 'gunman');
  assert.equal(g.r2.hitMul(g, e, 100, gm), 100 * RS.TEMPO_R2.dmgK, '약점 없음 · 피해 배율만');
  S.damageEnemy(g, e, 1000, false, gm);
  assert.ok(g.r2.dmg.body > 0 && g.raid.dmg > 0, '피해 기록');
  // 몇 웨이브가 지나도 진상은 안 나온다 · 경험치는 시간으로 쌓인다
  const lv0 = g.level;
  g.god = true; // (입구는 안 깎이게 — 진상 · 경험치만 본다)
  for (let t = 0; t < 40; t += 1 / 30) { S.step(g, 1 / 30); g.pendingLevels = 0; if (g.over) break; }
  assert.equal(g.enemies.filter((x) => !x.dead && !x.r2).length, 0, '진상 없음');
  assert.ok(g.level > lv0 || g.exp > 0, '경험치는 시간으로');
  assert.ok(g.wave >= 2, '웨이브 숫자는 넘어간다 (증강 선택)');
  g.god = false; g.r2.cuts = 0;
  // 내려찍기 예고 → 스킬 한 번으론 안 끊김 · 같은 순간 같은 멤버는 한 번 · 두 번째 스킬 → 끊김 → 빈틈
  g.r2.act = null; g.r2.nextT = 0; g.r2.last = 'x';
  const rng0 = g.rng; g.rng = () => 0.01; S.step(g, 1 / 60); g.rng = rng0;
  assert.ok(g.r2.act && g.r2.act.st === 'wind' && g.r2.act.k === 'slam', g.r2.act && g.r2.act.k);
  assert.equal(g.r2.fx.cut, 2, '보통: 스킬 2번');
  g._inSkill = true; S.damageEnemy(g, e, 10, false, gm); S.damageEnemy(g, e, 10, false, gm); g._inSkill = false;
  assert.ok(g.r2.act, '스킬 한 번(여러 대 맞아도)으론 안 끊긴다');
  assert.equal(g.r2.act.hits, 1);
  assert.ok(g.events.some((x) => x.type === 'r2Stagger' && x.n === 1 && x.need === 2));
  g.t += 0.3;
  g._inSkill = true; S.damageEnemy(g, e, 10, false, gm); g._inSkill = false;
  assert.equal(g.r2.act, null); assert.equal(g.r2.cuts, 1); assert.ok(e.weakT > 0, '빈틈');
  // 끊지 않으면: 입구 피해
  g.r2.nextT = 0; g.r2.last = 'x'; g.rng = () => 0.01; S.step(g, 1 / 60); g.rng = rng0;
  const hp0 = g.base.hp;
  for (let t = 0; t < 2.6; t += 1 / 60) S.step(g, 1 / 60);
  assert.ok(g.base.hp < hp0, '내려찍기 → 입구 피해');
  assert.ok(g.r2.slams >= 1);
  // 입구 붙잡기: 스킬 두 번이면 손을 놓는다
  g.r2.act = { k: 'grab', st: 'hold', t: 4, hits: 0 };
  g._inSkill = true; S.damageEnemy(g, e, 10, false, gm); g.t += 0.5; S.damageEnemy(g, e, 10, false, gm); g._inSkill = false;
  assert.equal(g.r2.act, null, '두 번 맞으면 떼어냄');
  assert.ok(g.events.some((x) => x.type === 'r2Release'));
  // 서버에서 페이즈가 바뀜 → 이 판도
  assert.equal(RS.setPhase(g, 3), true); assert.equal(g.r2.phase, 3);
  assert.ok(g.events.some((x) => x.type === 'r2Phase' && x.phase === 3));
  const rep = RS.report(g);
  assert.ok(rep.total > 0 && rep.parts.body === rep.total && rep.cuts >= 2);
  // 시간 끝 = 철거 (입구가 무너지고 판 끝) · 그 전에 화가 쌓인다
  const g2 = mk();
  g2.god = false;
  RS.attach(g2, { tier: 1, hp: { body: 10 }, max: { body: 100 } });
  assert.equal(g2.r2.phase, 3, '서버 체력 10% → 3페이즈부터');
  g2.r2.angryT = 0; S.step(g2, 1 / 60);
  assert.equal(g2.r2.angry, 1);
  g2.t = R2.R2.sec; S.step(g2, 1 / 60);
  assert.equal(g2.over, true); assert.equal(g2.base.hp, 0);
  assert.ok(g2.r2.finale && g2.events.some((x) => x.type === 'r2Final'));
});

test('옛 모임 레이드에서 못 받은 보상은 우편으로 한 번 · 옛 기록이 있어도 계정이 안 깨짐', async () => {
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 5);
  Date.now = () => T;
  try {
    await smallBoss(T, 1, 1e9);
    const u = await user('옛레이더', strong);
    const st = await u.raw();
    st.langbang.raid = { wi: 123, dmg: 50000, runs: 2, day: 1, today: 2, best: 30000, claimed: false };
    st.langbang.raidRun = { id: 'oldrun', wi: 123, at: 1 };
    await srv.accounts.store.saveStats(u.id, st);
    const me = await get('/me', u.token);
    assert.equal(me.ok, true, me.message);
    const v1 = await get('/raid2', u.token);
    assert.ok(v1.mailed.includes('지난 모임 레이드 보상'));
    assert.equal((await get('/raid2', u.token)).mailed.length, 0, '한 번만');
    const m = (await get('/me', u.token)).profile.mail.filter((x) => x.title === '지난 모임 레이드 보상');
    assert.equal(m.length, 1); assert.ok(m[0].rw.coins > 0);
  } finally { Date.now = realNow; }
});

test('숫자 · 패턴 표: 1단계 최소 체력 · 페이즈 경계 · 패턴마다 숫자와 안내 · 그림 주소', () => {
  assert.ok(R2.hpMaxFor(1, 0) >= 5e7, '1단계 최소 체력');
  assert.ok(R2.R2.phaseAt[0] > R2.R2.phaseAt[1] && R2.R2.phaseAt[1] > 0);
  assert.equal(R2.phaseAt(100, 100), 1); assert.equal(R2.phaseAt(50, 100), 2); assert.equal(R2.phaseAt(10, 100), 3); assert.equal(R2.phaseAt(0, 100), 4);
  assert.equal(R2.PHASES.length, 3);
  for (const p of R2.PATTERNS) { assert.ok(RS.PAT[p.id], p.id); assert.ok(p.name && p.text && p.tip && p.img, p.id); assert.equal(RS.patFrom(p.id, 'normal'), p.from, p.id + ' 안내 페이즈 = 보통 확률표'); assert.ok(RS.patFrom(p.id, 'hell') >= 1, p.id + ' 지옥엔 다 나온다'); }
  for (const d of R2.DIFF_IDS) for (const ph of [1, 2, 3]) assert.ok(R2.PATTERNS.filter((p) => RS.patW(p.id, d, ph) > 0).length >= 3, `${d} ${ph}페이즈 패턴 3개 이상`);
  for (const d of R2.DIFF_IDS) for (const p of R2.PATTERNS) for (const ph of [1, 2, 3]) if (RS.patW(p.id, 'normal', ph) > 0) assert.ok(RS.patW(p.id, d, ph) > 0, `${d}: 보통에 나오는 패턴은 다 나온다 (${p.id})`);
  for (const k of ['throne', 'idle', 'wind', 'slam', 'throw', 'rage']) assert.match(R2.R2_ART[k], /^\/img\/lb\/raid2\/boss_.*\.webp$/);
  assert.ok(R2.R2.sec >= 150, '한 판 최대 시간');
});

test('난이도: 열림 조건 · 배율(서버 체력 · 상한 · 순위) · 판 기록 · 이상한 값', () => {
  assert.deepEqual(R2.DIFF_IDS, ['normal', 'hard', 'hell']);
  assert.ok(R2.DIFF.normal.mul === 1 && R2.DIFF.hard.mul > 1 && R2.DIFF.hell.mul > R2.DIFF.hard.mul, '어려울수록 배율 ↑');
  assert.ok(R2.DIFF.hard.rw.coins > R2.DIFF.normal.rw.coins && R2.DIFF.hell.rw.coins > R2.DIFF.hard.rw.coins, '판 보상 ↑');
  assert.equal(R2.diffOf('zzz'), 'normal'); assert.equal(R2.diffOf(undefined), 'normal'); assert.equal(R2.diffOf('hell'), 'hell');
  // 열림
  const lb = { maxStage: 5, raid2: R2.emptyR2() };
  assert.equal(R2.diffOpen(lb, 'normal').ok, true);
  assert.equal(R2.diffOpen(lb, 'hard').ok, false); assert.match(R2.diffOpen(lb, 'hard').why, /1장/);
  assert.equal(R2.diffOpen(lb, 'hell').ok, false);
  assert.equal(R2.diffOpen(lb, 'hell', true).ok, true, '마스터는 다 열림');
  assert.equal(R2.diffOpen(lb, 'nope').ok, false);
  lb.maxStage = 10;
  assert.equal(R2.diffOpen(lb, 'hard').ok, true); assert.equal(R2.diffOpen(lb, 'hell').ok, false);
  lb.raid2.hardSec = R2.R2.hellSec;
  assert.equal(R2.diffOpen(lb, 'hell').ok, true, '어려움에서 버티면 지옥');
  assert.equal(R2.diffOpen({ maxStage: 40, raid2: R2.emptyR2() }, 'hell').ok, true, '4장 클리어도 지옥');
  // 시작: 잠긴 난이도 · 없는 난이도 → 입장을 안 쓰고 거절 · 열린 난이도 → 판 기록에 적힘
  const now = Date.now();
  const bs = R2.newBoss(L.weekIndex(now), 1, 0, now);
  const lb2 = { maxStage: 12, raid2: R2.emptyR2() };
  const e1 = R2.r2Start(lb2, bs, 'r1', now, { diff: 'hell' });
  assert.ok(e1.error && /지옥/.test(e1.error)); assert.equal(R2.entriesLeft(lb2, now), R2.R2.entries, '거절되면 입장 안 씀');
  assert.ok(R2.r2Start(lb2, bs, 'r1', now, { diff: 'boss' }).error);
  const ok = R2.r2Start(lb2, bs, 'r2', now, { diff: 'hard' });
  assert.equal(ok.diff, 'hard'); assert.equal(ok.mul, R2.DIFF.hard.mul); assert.equal(lb2.raid2.run.df, 'hard');
  assert.equal(R2.r2Start(lb2, bs, 'r3', now, {}).diff, 'normal', '안 보내면 보통');
  // 판 기록 정리 (저장된 값이 이상해도)
  const out = {};
  R2.normRaid2({ raid2: { hardSec: 9999, run: { id: 'x', wi: 1, at: 1, df: 'god' } } }, out);
  assert.equal(out.raid2.run.df, 'normal'); assert.ok(out.raid2.hardSec <= R2.R2.sec + 30);
  // 배율: 서버 체력 · 기여 = 피해 × 배율 · 상한도 × 배율 · 순위표에 가장 어려운 난이도
  const s = R2.newBoss(10, 1, 0);
  const cap = Math.round(s.hpMax * R2.R2.runCapPct);
  const r1 = R2.applyRun(s, 'a', '가', { body: 1000 }, 1, { diff: 'hell' });
  assert.equal(r1.counted, Math.round(1000 * R2.DIFF.hell.mul)); assert.equal(r1.raw, 1000); assert.equal(r1.diff, 'hell');
  const r2 = R2.applyRun(s, 'b', '나', { body: cap * 10 }, 2, { diff: 'hard' });
  assert.equal(r2.counted, Math.round(cap * R2.DIFF.hard.mul), '상한도 × 배율'); assert.equal(r2.clipped, true);
  const r3 = R2.applyRun(s, 'c', '다', { body: 1000 }, 3, {});
  assert.equal(r3.counted, 1000, '보통 ×1');
  const top = R2.topList(s);
  assert.equal(top[0].uid, 'b'); assert.equal(top[0].df, 'hard');
  assert.equal(top.find((x) => x.uid === 'a').df, 'hell'); assert.equal(top.find((x) => x.uid === 'c').df, 'normal');
});

test('난이도 (서버): 잠긴 난이도 거절 · 끝낼 때 보낸 난이도는 무시 (시작 기록만) · 배율 · 판 보상 · 어려움 버티기 → 지옥 열림', async () => {
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 6);
  Date.now = () => T;
  try {
    await smallBoss(T, 1, 1e9);
    const u = await user('난이도', { stages: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [i + 1, 3])), heroes: strong.heroes });
    const bd = await get('/raid2', u.token);
    assert.deepEqual(bd.me.diffs, { normal: true, hard: true, hell: false });
    const no = await post('/raid2/start', u.token, { diff: 'hell' });
    assert.equal(no.ok, false); assert.match(no.message, /지옥/);
    assert.equal((await post('/raid2/start', u.token, { diff: 'nightmare' })).ok, false, '없는 난이도');
    assert.equal((await get('/raid2', u.token)).me.left, R2.R2.entries, '거절된 시작은 입장 안 씀');
    // 보통으로 시작해 놓고 끝낼 때 "지옥"이라고 우겨도 보통
    const s1 = await post('/raid2/start', u.token, {});
    assert.equal(s1.ok, true, s1.message); assert.equal(s1.diff, 'normal');
    T += 100e3;
    const coins0 = (await get('/me', u.token)).profile.coins;
    const f1 = await post('/raid2/finish', u.token, { runId: s1.runId, parts: { body: 10000 }, durationSec: 95, diff: 'hell' });
    assert.equal(f1.ok, true, f1.message);
    assert.equal(f1.raid2.diff, 'normal'); assert.equal(f1.raid2.counted, 10000, '보낸 난이도는 안 믿는다');
    assert.equal(f1.profile.coins - coins0, R2.DIFF.normal.rw.coins);
    // 어려움: × 배율 · 보상 · 90초 못 버팀 → 지옥 그대로 잠김
    const s2 = await post('/raid2/start', u.token, { diff: 'hard' });
    assert.equal(s2.ok, true, s2.message); assert.equal(s2.diff, 'hard'); assert.equal(s2.mul, R2.DIFF.hard.mul);
    T += 80e3;
    const f2 = await post('/raid2/finish', u.token, { runId: s2.runId, parts: { body: 10000 }, durationSec: 70 });
    assert.equal(f2.ok, true, f2.message);
    assert.equal(f2.raid2.counted, Math.round(10000 * R2.DIFF.hard.mul)); assert.equal(f2.raid2.hellNew, false);
    assert.equal(f2.profile.coins - f1.profile.coins, R2.DIFF.hard.rw.coins);
    assert.equal(srv.accounts.raid2._state().board[u.id].d, 10000 + Math.round(10000 * R2.DIFF.hard.mul), '기여 = 피해 × 배율 합');
    // 어려움에서 90초 이상 → 지옥 열림 (한 번만 "새로 열림")
    const s3 = await post('/raid2/start', u.token, { diff: 'hard' });
    T += 120e3;
    const f3 = await post('/raid2/finish', u.token, { runId: s3.runId, parts: { body: 100 }, durationSec: R2.R2.hellSec + 5 });
    assert.equal(f3.ok, true, f3.message); assert.equal(f3.raid2.hellNew, true);
    const b2 = await get('/raid2', u.token);
    assert.equal(b2.me.diffs.hell, true); assert.equal(b2.me.hardSec, R2.R2.hellSec + 5);
    assert.equal(b2.top.find((x) => x.me).df, 'hard', '순위표: 가장 어려운 난이도');
  } finally { Date.now = realNow; }
});

test('전투(sim) 난이도: 어려울수록 예고가 짧고 · 끊기에 스킬이 더 들고 · 기절이 길고 · 입구 피해가 세다 · 총공지는 바로 끊는다', () => {
  const mk = (diff) => {
    const g = S.createGame({ H: 760, mode: 'stage', deck: ['gunman', 'bangjang', 'staff', null, null, null], weekly: RS.waveDef(1), raid: { sec: R2.R2.sec }, slots: 3, rng: () => 0.3 });
    RS.attach(g, { tier: 1, diff, hp: { body: 100 }, max: { body: 100 } });
    g.phase = 'wave';
    return g;
  };
  const res = {};
  for (const d of R2.DIFF_IDS) {
    const g = mk(d);
    assert.equal(g.r2.diff, d);
    // 내려찍기 예고
    g.r2.act = null; g.r2.nextT = 0; g.r2.last = 'x';
    const rng0 = g.rng; g.rng = () => 0.01; S.step(g, 1 / 60); g.rng = rng0;
    assert.equal(g.r2.act.k, 'slam');
    const wind = g.r2.act.t0, need = g.r2.fx.cut;
    // 기절 시간: 맞은 멤버
    const h = g.heroes[0]; h.stunT = 0; h.x = g.r2.act.x;
    for (let t = 0; t < wind + 0.5 && g.r2.act && g.r2.act.st === 'wind'; t += 1 / 60) S.step(g, 1 / 60);
    res[d] = { wind, need, stun: h.stunT, hit: g.r2.gate.slam };
    // 총공지 → 예고 바로 끊김
    const g2 = mk(d);
    g2.r2.act = null; g2.r2.nextT = 0; g2.r2.last = 'x'; g2.rng = () => 0.01; S.step(g2, 1 / 60); g2.rng = () => 0.3;
    assert.ok(g2.r2.act && g2.r2.act.st === 'wind');
    g2.ult = 1e9; S.step(g2, 1 / 60); g2.ult = 0; S.step(g2, 1 / 60);
    assert.equal(g2.r2.act, null, d + ': 총공지로 끊김'); assert.ok(g2.events.some((x) => x.type === 'r2Cut' && /총공지/.test(x.text)));
  }
  assert.ok(res.normal.wind > res.hard.wind && res.hard.wind > res.hell.wind, '예고 시간');
  assert.ok(res.normal.need < res.hard.need && res.hard.need < res.hell.need, '끊기에 필요한 스킬 수');
  assert.ok(res.normal.stun >= 1.5 && res.hell.stun > res.normal.stun * 1.4, `기절 시간 ${res.normal.stun} → ${res.hell.stun}`);
  assert.ok(res.hell.hit > res.normal.hit, '입구 피해');
});

test('전투(sim) 입구 금: 맞은 만큼 금이 남아 수리로 못 메움 · 방패로 막아도 금은 남음 · 금이 입구를 다 덮으면 무너짐', () => {
  const g = S.createGame({ H: 760, mode: 'stage', deck: ['gunman', 'bangjang', 'staff', null, null, null], weekly: RS.waveDef(1), raid: { sec: R2.R2.sec }, slots: 3, rng: () => 0.3 });
  RS.attach(g, { tier: 1, diff: 'normal', hp: { body: 100 }, max: { body: 100 } });
  g.phase = 'wave';
  const slamOnce = () => {
    g.r2.act = null; g.r2.nextT = 0; g.r2.last = 'x';
    g.rng = () => 0.01; S.step(g, 1 / 60); g.rng = () => 0.3; g.r2.nextT = 99;
    assert.equal(g.r2.act.k, 'slam');
    for (let t = 0; t < 3 && g.r2.act && g.r2.act.st === 'wind'; t += 1 / 60) S.step(g, 1 / 60);
  };
  slamOnce();
  assert.ok(g.r2.crack > 0, '내려찍기 → 금');
  // 수리해도 최대 − 금 까지만
  g.base.hp = g.base.max; S.step(g, 1 / 60);
  assert.ok(g.base.hp <= g.base.max - g.r2.crack + 1e-6, '금 간 만큼은 못 채움');
  // 방패로 다 막아도 금은 남는다
  const c0 = g.r2.crack;
  g.doorShield = g.base.max * 10; g.doorShieldT = 30;
  slamOnce();
  assert.ok(g.r2.crack > c0, '방패로 막아도 금');
  // 금이 다 덮으면 판 끝
  g.r2.crack = g.base.max; S.step(g, 1 / 60);
  assert.equal(g.over, true); assert.equal(g.base.hp, 0);
  assert.ok(RS.report(g).crack >= 1);
});
