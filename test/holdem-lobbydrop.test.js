'use strict';
// 대기실: 연결이 끊긴 채 남은 사람 정리 · 방장 내보내기
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, sanitizeSettings } = require('../server/room');

function mk(n) {
  let T = 1000;
  const room = new Room({ code: 'DROP01', settings: sanitizeSettings({ sb: 10, bb: 20, startChips: 1000, maxPlayers: 9 }), now: () => T });
  const ps = [];
  for (let i = 0; i < n; i++) { const { player } = room.join({ name: 'P' + i }); room.connect(player.id); ps.push(player); }
  return { room, ps, tick: (ms) => { T += ms; } };
}

test('대기실: 끊긴 사람은 정리 예약 → 다시 접속하면 예약 취소', () => {
  const { room, ps } = mk(3);
  room.disconnect(ps[2].id);
  assert.ok(room.timers['drop:' + ps[2].id], '정리 예약이 걸려야 함');
  room.connect(ps[2].id);
  assert.ok(!room.timers['drop:' + ps[2].id], '다시 들어오면 예약 취소');
  room.clearAllTimers();
});

test('대기실: 끊긴 사람은 빠지고, 시작을 막지 않게 된다', () => {
  const { room, ps } = mk(3);
  ps[1].ready = true;
  room.disconnect(ps[2].id);
  assert.match(room.startCheck() || '', /P2/);
  assert.equal(room.dropIfGone(ps[2].id), true);
  assert.ok(!room.get(ps[2].id));
  assert.match(room.leftNote[ps[2].id], /대기실에서 빠졌어요/);
  assert.equal(room.startCheck(), null);
  room.clearAllTimers();
});

test('모두 끊긴 상태(서버 재시작 등)에서는 아무도 빼지 않는다', () => {
  const { room, ps } = mk(2);
  room.disconnect(ps[0].id); room.disconnect(ps[1].id);
  assert.equal(room.dropIfGone(ps[1].id), false);
  assert.ok(room.get(ps[1].id));
  room.clearAllTimers();
});

test('게임 중에는 대기실 정리를 하지 않는다', () => {
  const { room, ps } = mk(2);
  ps[1].ready = true;
  room.start(ps[0].id);
  room.disconnect(ps[1].id);
  assert.equal(room.dropIfGone(ps[1].id), false);
  room.clearAllTimers();
});

test('방장 내보내기: 끊긴 사람도 바로 내보낼 수 있다', () => {
  const { room, ps } = mk(3);
  room.disconnect(ps[2].id);
  room.kick(ps[0].id, ps[2].id);
  assert.ok(!room.get(ps[2].id));
  assert.throws(() => room.kick(ps[1].id, ps[0].id));
  room.clearAllTimers();
});
