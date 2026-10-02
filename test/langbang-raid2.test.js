'use strict';
// 건물주 레이드 (주간 서버 레이드): 주 바뀜(잡음/못 잡음) · 서버 체력 셈(동시에 끝나도 한 번씩) · 한 판 1% 상한 · 입장 · 부르기 · 팔 막타 · 보상(한 번만) · 세트 · 옛 레이드 보상
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
  assert.equal(R2.PARTS.reduce((a, p) => a + s.max[p], 0), s.hpMax, '팔 8개 + 본체 = 최대 체력');
  // 못 잡은 주 → 이어서
  R2.applyRun(s, 'u1', '가', { mega: 1e12 }, now);
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

test('한 판 반영: 최대 체력 1% 상한 · 부서진 팔 → 다음 부위로 넘침 · 막타 기록 · 페이즈 · 처치', () => {
  const s = R2.newBoss(10, 1, 0);
  const cap = Math.round(s.hpMax * R2.R2.runCapPct);
  assert.deepEqual(R2.exposed(s), ['mega', 'bill', 'bottle', 'golf']);
  // 1% 상한 (맨 위 계정이 아무리 세도)
  const r = R2.applyRun(s, 'a', '가', { mega: cap * 10, bill: cap * 10 }, 1);
  assert.equal(r.counted, cap); assert.equal(r.clipped, true);
  assert.ok(r.counted <= s.hpMax * 0.01 + 1, '한 판에 1% 를 못 넘는다');
  // 팔 하나를 거의 다 깎아 두고 → 막타
  s.hp.mega = 100;
  const r2 = R2.applyRun(s, 'b', '나', { mega: 500 }, 2);
  assert.deepEqual(r2.broke, ['mega']);
  assert.equal(s.by.mega.uid, 'b', '막타 기록');
  assert.equal(s.feed[0].k, 'break'); assert.equal(s.feed[0].n, '나'); assert.equal(s.feed[0].p, 'mega');
  assert.equal(r2.counted, 500, '넘친 피해는 다른 팔로');
  assert.deepEqual(R2.exposed(s), ['bill', 'bottle', 'golf']);
  // 부서진 팔에 들어온 피해 → 지금 드러난 팔로
  const before = R2.hpLeft(s);
  R2.applyRun(s, 'c', '다', { mega: 900 }, 3);
  assert.equal(before - R2.hpLeft(s), 900);
  assert.equal(s.hp.mega, 0);
  // 1페이즈 다 부수면 2페이즈 → 3페이즈(본체) → 처치
  for (const p of ['bill', 'bottle', 'golf']) s.hp[p] = 1;
  R2.applyRun(s, 'c', '다', { bill: 10 }, 4);
  assert.equal(R2.phaseOf(s), 2);
  assert.deepEqual(R2.exposed(s), ['contract', 'keys', 'bag', 'phone']);
  for (const a of R2.ARMS) s.hp[a.id] = 0;
  assert.equal(R2.phaseOf(s), 3); assert.deepEqual(R2.exposed(s), ['body']);
  s.hp.body = 50;
  const rk = R2.applyRun(s, 'd', '라', { body: 999 }, 5);
  assert.equal(rk.killed, true); assert.equal(s.killer.uid, 'd');
  assert.equal(R2.phaseOf(s), 4); assert.deepEqual(R2.exposed(s), []);
  assert.equal(rk.counted, 50, '죽은 뒤로는 안 깎인다');
  assert.equal(s.feed[0].k, 'kill');
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
    assert.equal(st.hp.golf, s0.max.golf - amt.reduce((a, b) => a + b, 0));
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

test('팔 막타 → 피드에 "누가 부쉈다" · 막타 우편 · 잡으면 참가 · 토벌 보상 우편 (여러 번 열어도 한 번만) · 주가 끝나면 순위 보상 + 세트 조각', async () => {
  const realNow = Date.now;
  let T = mid(L.weekIndex(realNow()) + 3);
  Date.now = () => T;
  try {
    const s = await smallBoss(T, 1, 1e6);
    const a = await user('막타왕후보', strong), b = await user('구경꾼', strong);
    // 확성기 팔만 남기고 거의 다 깎아 둠
    s.hp.mega = 3000;
    const ra = await post('/raid2/start', a.token, {});
    T += 165e3;
    const fa = await post('/raid2/finish', a.token, { runId: ra.runId, parts: { mega: 9000 }, durationSec: 160 });
    assert.equal(fa.ok, true, fa.message);
    assert.ok(fa.raid2.broke.includes('mega'));
    const bd = await get('/raid2', b.token);
    assert.equal(bd.by.mega, '막타왕후보');
    assert.ok(bd.feed.some((f) => f.k === 'break' && f.p === 'mega' && f.n === '막타왕후보'), '피드: 누가 부쉈다');
    assert.ok(fa.profile.mail.some((m) => /확성기 팔 막타/.test(m.title)), '막타 우편');
    assert.equal(fa.mailN, 1);
    // 남은 부위를 1로 → b 가 마지막 일격 (본체 막타)
    const st = srv.accounts.raid2._state();
    for (const p of R2.PARTS) st.hp[p] = p === 'mega' ? 0 : 1;
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

test('전투(sim): 부위가 생기고 · 약점 멤버 ×2.5 · 계약서는 저격 ×3 · 내려찍기 예고 → 스킬로 끊으면 빈틈 · 다른 사람이 부순 팔은 떨어져 나감', () => {
  const g = S.createGame({ H: 760, mode: 'stage', deck: ['gunman', 'bangjang', 'staff', null, null, null], weekly: RS.waveDef(1), raid: { sec: R2.R2.sec }, slots: 3, rng: () => 0.3 });
  RS.attach(g, { tier: 1, exposed: ['mega', 'contract'] });
  assert.equal(Object.keys(g.r2.parts).length, 2);
  const mega = g.r2.parts.mega, con = g.r2.parts.contract;
  const gm = g.heroes.find((h) => h.id === 'gunman'), sf = g.heroes.find((h) => h.id === 'staff') || { id: 'staff', def: {} };
  assert.equal(g.r2.hitMul(g, con, 100, gm), 300, '계약서: 저격수 ×3');
  assert.equal(g.r2.hitMul(g, con, 100, { id: 'dohoon' }), 60, '계약서: 나머지 ×0.6');
  assert.equal(g.r2.hitMul(g, mega, 100, sf), 250, '확성기: 운영진 ×2.5');
  assert.equal(g.r2.hitMul(g, mega, 100, { id: 'dohoon' }), 100);
  S.damageEnemy(g, mega, 1000, false, sf);
  assert.ok(g.r2.dmg.mega > 0 && g.raid.dmg > 0, '부위별 피해 기록');
  // 내려찍기 예고 → 스킬 피해 → 끊김
  g.r2.slamT = 0; S.step(g, 1 / 60);
  assert.ok(g.r2.slam && g.r2.slam.st === 'wind');
  const p = g.r2.parts[g.r2.slam.p];
  g._inSkill = true; S.damageEnemy(g, p, 10, false, gm); g._inSkill = false;
  assert.equal(g.r2.slam, null); assert.equal(g.r2.cuts, 1); assert.ok(p.weakT > 0, '빈틈');
  // 끊지 않으면: 입구 피해
  g.r2.slamT = 0; S.step(g, 1 / 60);
  const hp0 = g.base.hp;
  for (let t = 0; t < 3; t += 1 / 60) S.step(g, 1 / 60);
  assert.ok(g.base.hp < hp0, '내려찍기 → 입구 피해');
  // 다른 사람이 확성기 팔을 부숨
  const gone = RS.syncParts(g, ['contract'], { mega: '누구' });
  assert.deepEqual(gone, ['mega']); assert.ok(!g.r2.parts.mega);
  assert.ok(g.events.some((e) => e.type === 'r2Break' && e.by === '누구'));
  // 다 부서지면 다음 페이즈 부위가 붙는다
  RS.syncParts(g, ['body']);
  assert.ok(g.r2.parts.body && g.r2.rage);
  for (let t = 0; t < 20; t += 1 / 30) S.step(g, 1 / 30);
  const rep = RS.report(g);
  assert.ok(rep.total > 0 && rep.parts.mega > 0);
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

test('숫자 · 약점 표: 1단계 최소 체력 · 팔 8개 · 약점 멤버는 진짜 멤버 · 고르게', async () => {
  const D = await lib('data.js');
  assert.ok(R2.hpMaxFor(1, 0) >= 5e7, '1단계 최소 체력');
  assert.equal(R2.ARMS.length, 8);
  const all = new Set();
  for (const a of R2.ARMS) { assert.ok(a.weak.length >= 4); for (const h of a.weak) { assert.ok(D.HEROES[h], h); all.add(h); } }
  assert.ok(all.size >= 20, '약점 멤버가 고르게');
});
