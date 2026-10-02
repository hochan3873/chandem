'use strict';
// 랑방 친구: 요청 · 수락 · 삭제 · 체력 선물(하루 한 번 · 받기 10개) · 레이드 친구 멤버 빌리기(하루 한 번) · 빌려준 보상
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

let srv, base, L;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
  L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  await srv.accounts.ready;
});
test.after(async () => { await srv.close(); });

const post = (url, token, body) => fetch(base + '/api/langbang' + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }).then((x) => x.json());
const get = (url, token) => fetch(base + '/api/langbang' + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((x) => x.json());
let seq = 0;
async function user(nick) {
  const { token, user: u } = await srv.accounts.signup({ username: `fr${Date.now() % 1e6}${seq++}`, password: 'secret12', nickname: nick });
  const raw = async () => (await srv.accounts.store.byId(u.id)).stats;
  return { token, id: u.id, nick, raw };
}
async function friends(a, b) {
  const r = await post('/friends/request', a.token, { q: b.nick });
  assert.equal(r.ok, true, r.message);
  const k = await post('/friends/accept', b.token, { id: a.id });
  assert.equal(k.ok, true, k.message);
}

test('친구 코드: 아이디마다 정해진 6글자 · 헷갈리는 글자 없음', () => {
  const c = L.friendCode('abcDEF123');
  assert.match(c, /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(L.friendCode('abcDEF123'), c);
  assert.notEqual(L.friendCode('abcDEF124'), c);
  assert.equal(L.cleanFriendCode(' ab-c d1 2 '), 'ABCD12');
});

test('친구: 닉네임으로 요청 → 수락 → 서로 목록에 · 삭제하면 둘 다 빠짐 · 코드로 추가 · 거절/취소 · 손님은 안 됨', async () => {
  const a = await user('친구가'), b = await user('친구나'), c = await user('친구다');
  assert.equal((await post('/friends/request', a.token, { q: '친구가' })).ok, false, '나 자신은 안 됨');
  assert.equal((await post('/friends/request', a.token, { q: '없는사람123' })).ok, false, '없는 사람');
  const r = await post('/friends/request', a.token, { q: '친구나' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.requested, true);
  assert.equal((await post('/friends/request', a.token, { q: '친구나' })).ok, false, '이미 요청함');
  let vb = await get('/friends', b.token);
  assert.equal(vb.ok, true, vb.message);
  assert.equal(vb.inReq.length, 1);
  assert.equal(vb.inReq[0].nickname, '친구가');
  assert.ok(vb.code && vb.code.length === 6);
  assert.equal(vb.inReq[0].leader.hero && typeof vb.inReq[0].leader.hero, 'string');
  const k = await post('/friends/accept', b.token, { id: a.id });
  assert.equal(k.ok, true, k.message);
  assert.equal(k.profile.fr.list.length, 1);
  const va = await get('/friends', a.token);
  assert.equal(va.friends.length, 1);
  assert.equal(va.friends[0].nickname, '친구나');
  assert.equal(va.outReq.length, 0, '보낸 요청은 정리됨');
  assert.ok('level' in va.friends[0] && 'frame' in va.friends[0] && 'title' in va.friends[0] && 'last' in va.friends[0]);
  // 코드로: c → a (a 의 코드) · a 가 거절
  const codeA = va.code;
  const rc = await post('/friends/request', c.token, { q: codeA.toLowerCase() });
  assert.equal(rc.ok, true, rc.message);
  const d = await post('/friends/decline', a.token, { id: c.id });
  assert.equal(d.ok, true, d.message);
  assert.equal((await get('/friends', c.token)).outReq.length, 0, '거절하면 보낸 쪽도 정리');
  // 서로 요청하면 바로 친구
  await post('/friends/request', c.token, { q: '친구나' });
  const both = await post('/friends/request', b.token, { q: '친구다' });
  assert.equal(both.accepted, true, '상대가 먼저 보냈으면 바로 친구');
  // 취소
  await post('/friends/request', c.token, { q: '친구가' });
  assert.equal((await post('/friends/cancel', c.token, { id: a.id })).ok, true);
  assert.equal((await get('/friends', a.token)).inReq.length, 0, '취소하면 받은 쪽도 정리');
  // 삭제
  const rm = await post('/friends/remove', a.token, { id: b.id });
  assert.equal(rm.ok, true, rm.message);
  assert.equal((await get('/friends', a.token)).friends.length, 0);
  assert.equal((await get('/friends', b.token)).friends.length, 1, 'b 에겐 c 만 남음');
  assert.equal((await post('/friends/remove', a.token, { id: b.id })).ok, false, '이미 친구 아님');
  // 손님(토큰 없음)
  const g = await get('/friends', null);
  assert.equal(g.ok, false);
  assert.match(g.message, /로그인/);
});

test('친구는 30명까지 (내 쪽 · 상대 쪽)', async () => {
  const a = await user('꽉찬사람'), b = await user('평범한사람');
  const st = await a.raw();
  st.langbang.fr = { list: Array.from({ length: L.FRIEND.max }, (_, i) => ({ id: 'fake' + i, at: 1 })) };
  await srv.accounts.store.saveStats(a.id, st);
  const r = await post('/friends/request', a.token, { q: '평범한사람' });
  assert.equal(r.ok, false);
  assert.match(r.message, /30명/);
  const r2 = await post('/friends/request', b.token, { q: '꽉찬사람' });
  assert.equal(r2.ok, false);
  assert.match(r2.message, /꽉/);
});

test('체력 선물: 친구마다 하루 한 번 · 모두 보내기 · 받기는 하루 10개 · 체력 상한', async () => {
  const me = await user('선물받이');
  const pals = [];
  for (let i = 0; i < 11; i++) { const p = await user('선물꾼' + i); await friends(p, me); pals.push(p); }
  const s1 = await post('/friends/gift', pals[0].token, { id: me.id });
  assert.equal(s1.ok, true, s1.message);
  const s2 = await post('/friends/gift', pals[0].token, { id: me.id });
  assert.equal(s2.ok, false, '오늘 같은 친구에게 두 번은 안 됨');
  assert.match(s2.message, /이미/);
  const stranger = await user('모르는사람');
  assert.equal((await post('/friends/gift', stranger.token, { id: me.id })).ok, false, '친구가 아니면 안 됨');
  for (const p of pals.slice(1)) assert.equal((await post('/friends/gift', p.token, { id: 'all' })).ok, true);
  let v = await get('/friends', me.token);
  assert.equal(v.gifts.length, 11);
  assert.equal(v.recvLeft, L.FRIEND.recvPerDay);
  // 체력을 낮춰 두고 받기
  let st = await me.raw();
  st.langbang.sta = { v: 10, t: Date.now() };
  await srv.accounts.store.saveStats(me.id, st);
  const one = await post('/friends/claim', me.token, { k: v.gifts[0].k });
  assert.equal(one.ok, true, one.message);
  assert.equal(one.n, 1);
  assert.equal(L.staminaNow(one.profile).v, 15, '+5');
  const all = await post('/friends/claim', me.token, { k: 'all' });
  assert.equal(all.ok, true, all.message);
  assert.equal(all.n, L.FRIEND.recvPerDay - 1, '하루 10개까지');
  assert.equal(all.rest, 1, '남은 선물은 그대로');
  assert.equal(L.staminaNow(all.profile).v, 60);
  const more = await post('/friends/claim', me.token, { k: 'all' });
  assert.equal(more.ok, false);
  assert.match(more.message, /하루 10개/);
  // 내일: 체력 상한 근처면 못 받음
  st = await me.raw();
  st.langbang.fr.got = { day: L.dayIndex() - 1, n: 10 };
  st.langbang.sta = { v: L.STAMINA.cap - 2, t: Date.now() };
  await srv.accounts.store.saveStats(me.id, st);
  const full = await post('/friends/claim', me.token, { k: 'all' });
  assert.equal(full.ok, false);
  assert.match(full.message, /체력/);
  // 순수 함수: 상한 바로 아래까지만
  const lb = { fr: { gin: [{ k: 1, id: 'x', at: Date.now() }, { k: 2, id: 'y', at: Date.now() }], got: null }, sta: { v: L.STAMINA.cap - 7, t: Date.now() } };
  const r = L.giftClaim(lb, 'all', Date.now());
  assert.equal(r.n, 1, '두 번째는 상한을 넘어서 남김');
  assert.equal(lb.fr.gin.length, 1);
});

test('레이드 도와주기 (건물주 레이드): 친구 대표 멤버(서버 스냅샷) · 친구마다 하루 한 번 · 빌려준 사람 우편 보상 · 결과에 이름 · 옛 모임 레이드는 닫힘', async () => {
  const realNow = Date.now;
  const day = L.EPOCH - L.KST + (L.dayIndex(realNow()) + 1) * L.DAY; // 내일 00:00 KST
  let T = day + (12 * 60 + 5) * 60e3; // 점심 레이드
  Date.now = () => T;
  try {
    const a = await user('레이더'), b = await user('도우미'), c = await user('남남');
    await friends(a, b);
    // a: 1-5 깸 · b: 덱 대장 + 강화 + 장비
    let st = await a.raw();
    st.langbang.stages = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 };
    await srv.accounts.store.saveStats(a.id, st);
    st = await b.raw();
    st.langbang.stages = { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3, 6: 3 };
    st.langbang.heroes = { ...(st.langbang.heroes || {}), gunman: 12 };
    st.langbang.decks = { i: 0, decks: [['staff', 'gunman', null, null, null, null], [], []], leaders: ['gunman', null, null] };
    st.langbang.gear = [{ id: 1, t: Object.keys((await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'data.js')).href)).GEAR).find((g) => !g.startsWith('myth')), r: 'epic', lv: 3 }];
    st.langbang.gearSeq = 1;
    await srv.accounts.store.saveStats(b.id, st);
    st = await b.raw();
    const D = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'data.js')).href);
    st.langbang.equip = { gunman: { [D.GEAR[st.langbang.gear[0].t].slot]: 1 } };
    await srv.accounts.store.saveStats(b.id, st);
    // 옛 모임 레이드는 닫힘 (혼자 · 친구 둘 다)
    const old1 = await post('/raid/start', a.token, {}), old2 = await post('/raid/start', a.token, { friend: b.id });
    assert.equal(old1.ok, false); assert.match(old1.message, /건물주 레이드/);
    assert.equal(old2.ok, false); assert.match(old2.message, /건물주 레이드/);
    const R2 = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'raid2.js')).href);
    // 친구가 아니면 못 빌림
    const bad = await post('/raid2/start', a.token, { friend: c.id });
    assert.equal(bad.ok, false);
    const r = await post('/raid2/start', a.token, { friend: b.id });
    assert.equal(r.ok, true, r.message);
    assert.ok(r.runId);
    assert.equal(r.help.hero, 'gunman', '친구 덱의 대장');
    assert.equal(r.help.lv, 12, '친구 강화 레벨 (서버 기록)');
    assert.equal(r.help.nick, '도우미');
    assert.equal(r.help.gear.length, 1, '친구가 낀 장비');
    // 빌려준 사람: 우편 + 도움 포인트
    const vb = await get('/me', b.token);
    const m = vb.profile.mail.find((x) => /도왔어요/.test(x.title));
    assert.ok(m, '빌려준 보상 우편');
    assert.equal(m.rw.coins, L.FRIEND.lendRw.coins);
    assert.equal(vb.profile.fr.pts, L.FRIEND.lendPts);
    // 같은 날 같은 친구는 다시 못 빌림 (도움 없는 레이드는 됨)
    T += 60e3;
    const again = await post('/raid2/start', a.token, { friend: b.id });
    assert.equal(again.ok, false);
    assert.match(again.message, /오늘 이미/);
    // 결과: 친구 멤버가 있으면 피해 상한 ×1.35 · 결과에 누가 도왔는지
    const plain = await post('/raid2/start', a.token, {});
    assert.equal(plain.ok, true, plain.message);
    T += 150e3;
    const lbA = (await get('/me', a.token)).profile;
    const cap = R2.r2Cap(lbA, 150);
    const over = await post('/raid2/finish', a.token, { runId: plain.runId, parts: { mega: Math.floor(cap * 1.2) }, kills: 50, durationSec: 150 });
    assert.equal(over.ok, false, '도움 없는 판은 원래 상한');
    // 도움 판 다시 (같은 날 다른 친구가 없으니 내일)
    T += L.DAY;
    const r2 = await post('/raid2/start', a.token, { friend: b.id });
    assert.equal(r2.ok, true, r2.message);
    T += 150e3;
    const res = await post('/raid2/finish', a.token, { runId: r2.runId, parts: { mega: Math.floor(cap * 1.2) }, kills: 50, durationSec: 150 });
    assert.equal(res.ok, true, res.message);
    assert.equal(res.raid2.help.nick, '도우미');
    assert.equal(res.raid2.help.hero, 'gunman');
    // 빌려준 보상은 하루 상한까지만 (순수 함수)
    const flb = { fr: { lent: null, pts: 0 }, mail: [] };
    for (let i = 0; i < L.FRIEND.lendPerDay + 3; i++) L.lendReward(flb, '누구', T);
    assert.equal(flb.mail.length, L.FRIEND.lendPerDay);
    assert.equal(flb.fr.pts, L.FRIEND.lendPts * L.FRIEND.lendPerDay);
  } finally { Date.now = realNow; }
});

test('레이드 도우미(sim): 친구 멤버가 한 명 더 · 친구 강화/성급/장비 · 내 덱에 같은 멤버면 안 옴 · 자리가 꽉 차도 겹쳐서', async () => {
  const S = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'sim.js')).href);
  const g = S.createGame({ H: 760, mode: 'stage', stage: 3, deck: ['staff', 'bangjang', 'gunnyeo', null, null, null], raid: { sec: 60 }, meta: { staff: 3 }, slots: 3 });
  const n0 = g.heroes.length;
  assert.equal(S.addSupport(g, { hero: 'staff', lv: 20, star: 5, nick: '누구' }), null, '내 덱에 같은 멤버');
  const h = S.addSupport(g, { hero: 'gunman', lv: 12, star: 3, gear: { atk: 0.2 }, nick: '도우미' });
  assert.ok(h);
  assert.equal(g.heroes.length, n0 + 1, '덱 인원 제한과 상관없이 한 명 더');
  assert.equal(h.meta, 12); assert.equal(h.star, 3); assert.equal(h.gear.atk, 0.2); assert.equal(h.support, '도우미');
  assert.equal(g.support.nick, '도우미');
  assert.ok(Number.isFinite(h.x));
  const full = S.createGame({ H: 760, mode: 'stage', stage: 3, deck: ['staff', 'bangjang', 'gunnyeo', 'jieun', 'hanna', 'baul'], raid: { sec: 60 }, meta: {}, slots: 6 });
  const h2 = S.addSupport(full, { hero: 'gunman', lv: 1, star: 1, nick: 'x' });
  if (h2) assert.ok(Number.isFinite(h2.x), '꽉 차면 옆에 겹쳐서');
  for (let t = 0; t < 5; t += 1 / 30) S.step(g, 1 / 30);
  assert.ok(!g.over);
});
