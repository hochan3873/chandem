'use strict';
// 일반 게임 중 블라인드 올리기: 방장 제안 → 자리에 앉은 사람 모두 동의하면 다음 판부터
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, sanitizeSettings } = require('../server/room');

function cash(n = 3, extra = {}) {
  let T = 1_000_000;
  const room = new Room({ code: 'BLVOTE', settings: sanitizeSettings({ sb: 10, bb: 20, startChips: 1000, maxPlayers: 9, ...extra }), now: () => T, pace: 0.001 });
  const ps = [];
  for (let i = 0; i < n; i++) { const { player } = room.join({ name: 'P' + i }); room.connect(player.id); player.ready = true; ps.push(player); }
  room.hostId = ps[0].id;
  return { room, ps, tick: (ms) => { T += ms; } };
}
function foldOut(room) {
  const h = room.hand;
  let g = 0;
  while (!h.finished && g++ < 20) room.act(h.currentId, { type: 'fold' });
}

test('모두 동의하면 다음 판부터 블라인드가 바뀐다', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  assert.throws(() => room.proposeBlinds(ps[1].id, 20, 40), /방장/);
  room.proposeBlinds(ps[0].id, 20, 40);
  const v = room.viewFor(ps[1].id).room.blindVote;
  assert.equal(v.bb, 40);
  assert.deepEqual(v.yes, [ps[0].id]);
  room.voteBlinds(ps[1].id, true);
  assert.equal(room.settings.bb, 20, '아직 한 명 남음');
  room.voteBlinds(ps[2].id, true);
  assert.equal(room.settings.sb, 20);
  assert.equal(room.settings.bb, 40);
  assert.equal(room.viewFor(ps[1].id).room.blindVote, null);
  assert.equal(room.hand.bb, 20, '지금 판은 그대로');
  foldOut(room);
  room.nextHandAt = 0; room.startHand();
  assert.equal(room.hand.bb, 40);
  room.clearAllTimers();
});

test('한 명이라도 반대하면 그대로 · 시간이 지나면 투표가 사라진다', () => {
  const { room, ps, tick } = cash(3);
  room.start(ps[0].id);
  room.proposeBlinds(ps[0].id, 20, 40);
  room.voteBlinds(ps[1].id, false);
  assert.equal(room.settings.bb, 20);
  assert.equal(room.blindVote, null);
  assert.throws(() => room.voteBlinds(ps[2].id, true), /투표가 없어요/);
  room.proposeBlinds(ps[0].id, 25, 50);
  tick(61_000);
  assert.equal(room.viewFor(ps[1].id).room.blindVote, null);
  room.clearAllTimers();
});

test('토너먼트·대기실에선 못 하고, 이상한 금액은 막는다', () => {
  const { room, ps } = cash(3);
  assert.throws(() => room.proposeBlinds(ps[0].id, 20, 40), /게임 중/);
  room.start(ps[0].id);
  assert.throws(() => room.proposeBlinds(ps[0].id, 50, 40), /금액/);
  assert.throws(() => room.proposeBlinds(ps[0].id, 10, 20), /같아요/);
  room.clearAllTimers();
  const t = cash(3, { mode: 'tournament' });
  t.room.start(t.ps[0].id);
  assert.throws(() => t.room.proposeBlinds(t.ps[0].id, 20, 40), /토너먼트/);
  t.room.clearAllTimers();
});

test('게임 중 자리 옮기기: 판에 참여 중이면 다음 판부터, 예약된 자리는 다른 사람이 못 고른다', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  const taken = room.seated.map((p) => p.seat);
  const free = [...Array(9).keys()].filter((s) => !taken.includes(s));
  const r = room.changeSeat(ps[1].id, free[0]);
  assert.deepEqual(r, { next: true });
  assert.notEqual(ps[1].seat, free[0], '지금 판은 그대로');
  assert.throws(() => room.changeSeat(ps[2].id, free[0]), /옮기기로 한 자리/);
  foldOut(room);
  room.nextHandAt = 0; room.startHand();
  assert.equal(ps[1].seat, free[0]);
  assert.equal(ps[1].nextSeat, null);
  room.clearAllTimers();
  const t = cash(3, { mode: 'tournament' });
  t.room.start(t.ps[0].id);
  const f2 = [...Array(9).keys()].find((s) => !t.room.seated.some((p) => p.seat === s));
  assert.throws(() => t.room.changeSeat(t.ps[1].id, f2), /토너먼트/);
  t.room.clearAllTimers();
});
