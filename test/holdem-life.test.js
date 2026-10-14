'use strict';
// 찬덤 홀덤: 출석 · 오늘의 미션 · 업적 · 상점 · 초대 · 명장면 · 시즌 · 정기 토너먼트
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hand } = require('../server/engine/hand');
const { createHoldemPro, BASE, CHECKIN } = require('../server/holdem-pro');

const DAY = 86400000;
function setup(t0 = Date.UTC(2026, 9, 15, 3)) {
  const clock = { t: t0 };
  const pro = createHoldemPro({ now: () => clock.t });
  return { pro, clock };
}
const g = (n) => ({ id: 'guestLife' + String(n).padStart(4, '0'), key: 'k'.repeat(20) + n });
/** 한 판 쳐서 기록 (me 가 이기도록: 상대가 폴드) */
function playWin(pro, key) {
  const h = new Hand({ players: [{ id: 'me', stack: 2000 }, { id: 'b', stack: 2000 }], dealerIndex: 1, sb: 10, bb: 20 });
  // 헤즈업: 딜러(b)=SB 먼저 → b 레이즈, me 리레이즈, b 폴드
  h.act('b', { type: 'raise', amount: 60 });
  h.act('me', { type: 'raise', amount: 200 });
  h.act('b', { type: 'fold' });
  return pro.recordHand(key, h, 'me', { names: { me: '나', b: '봇' } });
}

test('출석: 하루 한 번, 이어서 오면 연속 보상 · 빠지면 1일째부터', () => {
  const { pro, clock } = setup();
  const id = { guest: g(1) };
  const a = pro.checkin(id);
  assert.equal(a.reward, CHECKIN[0]);
  assert.throws(() => pro.checkin(id), /이미/);
  clock.t += DAY; assert.equal(pro.checkin(id).reward, CHECKIN[1]);
  clock.t += DAY; assert.equal(pro.checkin(id).streak, 3);
  clock.t += 3 * DAY; assert.equal(pro.checkin(id).reward, CHECKIN[0], '빠지면 처음부터');
  assert.equal(pro.me(id).wallet, BASE + CHECKIN[0] * 2 + CHECKIN[1] + CHECKIN[2]);
});

test('오늘의 미션: 날마다 3개, 다 하면 보상 받기 (한 번만) · 업적은 바로 칩', () => {
  const { pro } = setup();
  const id = { guest: g(2) };
  const b = pro.buyIn(id, '호찬', 'starter', 1000);
  const m0 = pro.me(id);
  assert.equal(m0.missions.length, 3);
  for (let i = 0; i < 30; i++) playWin(pro, b.key);
  const me = pro.me(id);
  assert.ok(me.ach.find((a) => a.id === 'first_win').at, '첫 승리 업적');
  assert.ok(me.ach.find((a) => a.id === 'streak5').at, '5연승 업적');
  const doable = me.missions.find((m) => m.prog >= m.goal);
  if (doable) {
    const before = pro.me(id).wallet;
    const r = pro.claimMission(id, doable.id);
    assert.equal(pro.me(id).wallet, before + r.reward);
    assert.throws(() => pro.claimMission(id, doable.id), /이미/);
  }
  const notDone = me.missions.find((m) => m.prog < m.goal);
  if (notDone) assert.throws(() => pro.claimMission(id, notDone.id), /아직/);
});

test('상점: 칩으로 사서 바로 끼우기 · 모자라면 못 삼', () => {
  const { pro } = setup();
  const id = { guest: g(3) };
  assert.throws(() => pro.buy(id, 'back-navy'), /모자라요/);
  pro.me(id); pro.cashOut(pro.keyOf(id), 20000); // 칩을 벌었다고 치고
  const r = pro.buy(id, 'back-navy');
  assert.equal(r.me.items.back, 'back-navy');
  assert.equal(r.me.wallet, BASE + 20000 - 15000);
  assert.equal(pro.buy(id, 'back-red').me.items.back, 'back-red', '가진 건 공짜로 다시 끼움');
});

test('초대: 초대 링크로 온 친구가 첫 판을 치면 둘 다 5,000칩', () => {
  const { pro } = setup();
  const host = { guest: g(4) };
  const code = pro.me(host).refCode;
  assert.match(code, /^[A-Z0-9]{6}$/);
  const friend = { guest: g(5), ref: code };
  const b = pro.buyIn(friend, '친구', 'starter', 1000);
  playWin(pro, b.key);
  assert.equal(pro.me(host).wallet, BASE + 5000);
  assert.equal(pro.me(host).refCount, 1);
});

test('명장면: 큰 팟은 다시보기로 남고 누구나 열어 볼 수 있다', () => {
  const { pro } = setup();
  const id = { guest: g(6) };
  const b = pro.buyIn(id, '호찬', 'starter', 1000);
  // 올인 승부
  const h = new Hand({ players: [{ id: 'me', stack: 2000 }, { id: 'b', stack: 2000 }], dealerIndex: 1, sb: 10, bb: 20 });
  h.act('b', { type: 'allin' }); h.act('me', { type: 'call' });
  pro.recordHand(b.key, h, 'me', { names: { me: '나', b: '봇' }, table: '입문 테이블' });
  const me = pro.me(id);
  assert.equal(me.replays.length, 1);
  const rp = pro.replay(me.replays[0].id);
  assert.equal(rp.seats.length, 2);
  assert.ok(rp.log.length > 2);
  assert.equal(rp.board.length, 5);
});

test('시즌: 달이 바뀌면 지난 시즌 1~3등에게 칭호와 칩', () => {
  const { pro, clock } = setup(Date.UTC(2026, 8, 20, 3)); // 9월
  const ids = [1, 2, 3, 4].map((n) => ({ guest: g(10 + n) }));
  for (const [i, id] of ids.entries()) { const b = pro.buyIn(id, '선수' + i, 'starter', 1000); for (let k = 0; k < 30 + i * 5; k++) playWin(pro, b.key); }
  assert.ok(pro.seasonTop().top.length >= 3);
  clock.t = Date.UTC(2026, 9, 2, 3); // 10월
  const s = pro.seasonTop();
  assert.equal(s.id, '2026-10');
  assert.ok(s.prev && s.prev.top.length === 3);
  const titled = ids.map((id) => pro.me(id).titles).filter((t) => t.length);
  assert.equal(titled.length, 3);
  assert.match(titled[0][0], /2026년 9월 시즌 \d위/);
});

test('정기 토너먼트: 9시 10분 전에 방이 열리고, 9시에 자동 시작', async () => {
  const { createServer } = require('../server/index');
  // 8시 49분(한국 시간)부터 시계를 돌린다
  let T = Date.UTC(2026, 9, 15, 11, 49);
  const srv = createServer({ port: 0, pace: 0.05, now: () => T, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  const port = await srv.listen();
  const base = `http://127.0.0.1:${port}`;
  try {
    const d0 = await (await fetch(base + '/api/holdem/daily')).json();
    assert.equal(d0.code, null);
    T = Date.UTC(2026, 9, 15, 11, 51); // 8시 51분 → 열림
    await new Promise((r) => setTimeout(r, 21000));
    const d1 = await (await fetch(base + '/api/holdem/daily')).json();
    assert.ok(d1.code, '방이 열려야 함');
    const { io: connect } = require('socket.io-client');
    const mk = () => { const s = connect(base, { transports: ['websocket'], forceNew: true }); s.call = (e, d) => new Promise((r) => s.emit(e, d, r)); return s; };
    const a = mk(); const b = mk();
    assert.equal((await a.call('room:join', { code: d1.code, name: '호찬', guest: g(21) })).ok, true);
    assert.equal((await b.call('room:join', { code: d1.code, name: '무성', guest: g(22) })).ok, true);
    T = Date.UTC(2026, 9, 15, 12, 0, 5); // 9시
    await new Promise((r) => setTimeout(r, 21000));
    const d2 = await (await fetch(base + '/api/holdem/daily')).json();
    assert.equal(d2.phase, 'playing');
    a.close(); b.close();
  } finally { await srv.close(); }
});
