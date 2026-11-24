'use strict';
// 홀덤 친구 방: 게임 중 설정 바꾸기 · 칩 추가(애드온) · 나간 사람 정산 · 결과 보는 시간
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, sanitizeSettings } = require('../server/room');

function cash(n = 3, extra = {}) {
  let T = 1_000_000;
  const room = new Room({ code: 'LIVEXX', settings: sanitizeSettings({ sb: 10, bb: 20, startChips: 1000, maxPlayers: 9, ...extra }), now: () => T, pace: 0.001 });
  const ps = [];
  for (let i = 0; i < n; i++) { const { player } = room.join({ name: 'P' + i, ip: '1.1.1.1' }); room.connect(player.id); player.ready = true; ps.push(player); }
  room.hostId = ps[0].id;
  return { room, ps, tick: (ms) => { T += ms; } };
}
function foldOut(room) {
  const h = room.hand;
  let g = 0;
  while (!h.finished && g++ < 20) room.act(h.currentId, { type: 'fold' });
}

test('게임 중 설정 바꾸기: 방장만 · 리바인·턴 시간은 바뀌고 블라인드·게임 방식은 그대로 · 로그에 남음', () => {
  const { room, ps } = cash(3, { rebuyEnabled: false });
  room.start(ps[0].id);
  assert.throws(() => room.updateSettings(ps[1].id, { rebuyEnabled: true }), /방장/);
  const r = room.updateSettings(ps[0].id, { ...room.settings, rebuyEnabled: true, rebuyMax: 5, turnSeconds: 40, sb: 500, bb: 1000, mode: 'tournament' });
  assert.ok(r.changed > 0);
  assert.equal(room.settings.rebuyEnabled, true);
  assert.equal(room.settings.rebuyMax, 5);
  assert.equal(room.settings.turnSeconds, 40);
  assert.equal(room.settings.sb, 10, '블라인드는 투표로만');
  assert.equal(room.settings.mode, 'cash');
  assert.equal(room.phase, 'playing');
  assert.ok(room.feed.some((e) => /설정을 바꿨어요/.test(e.text)));
  // 최대 인원은 앉은 사람보다 적게 못 함
  assert.throws(() => room.updateSettings(ps[0].id, { ...room.settings, maxPlayers: 2 }), /최대 인원/);
  room.clearAllTimers();
});

test('게임 시간을 게임 중에 정하면 시작 시각 기준으로 정산 시각이 잡힌다', () => {
  const { room, ps, tick } = cash(3);
  room.start(ps[0].id);
  tick(10 * 60000);
  room.updateSettings(ps[0].id, { ...room.settings, sessionMinutes: 30 });
  assert.equal(room.endsAt, room.startedAt + 30 * 60000);
  room.clearAllTimers();
});

test('칩 추가: 칩이 남아 있으면 언제든 신청 → 다음 판에 칩·바이인에 더해지고 정산에 들어감', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  const B = ps[1];
  assert.equal(room.viewFor(B.id).me.canAddon, true);
  room.addon(B.id, 500);
  assert.equal(B.pendingAdd, 500);
  assert.throws(() => room.addon(B.id, 600), /까지/); // 한 번에 시작 칩(1000)까지
  // 적용 전에 게임이 끝나면 공짜 칩이 되지 않는다
  let st = room.computeSettlement();
  assert.equal(st.rows.find((x) => x.name === 'P1').out, B.stack);
  foldOut(room);
  const before = B.stack;
  room.startHand();
  assert.equal(B.pendingAdd, 0);
  assert.equal(B.totalBuyIn, 1500);
  assert.ok(B.stack >= before + 500 - 20);
  foldOut(room);
  st = room.computeSettlement();
  assert.equal(st.rows.find((x) => x.name === 'P1').addon, 500);
  assert.equal(st.sumNet, 0, '사람끼리 손익 합계 0');
  room.clearAllTimers();
});

test('칩 추가: 꺼 두면 안 되고 · 다 잃었으면 리바인으로 · 토너먼트는 없음', () => {
  const { room, ps } = cash(3, { addonOn: false });
  room.start(ps[0].id);
  assert.throws(() => room.addon(ps[1].id, 100), /꺼져/);
  room.updateSettings(ps[0].id, { ...room.settings, addonOn: true });
  foldOut(room);
  ps[2].stack = 0;
  assert.throws(() => room.addon(ps[2].id, 100), /리바인/);
  room.clearAllTimers();
});

test('정산: 게임 중에 나간 사람도 (같은 인터넷의 다른 사람이 들어와도) 그대로 들어가고 장부에도 보인다', () => {
  const { room, ps } = cash(4);
  room.start(ps[0].id);
  foldOut(room);
  const B = ps[1];
  const b0 = B.stack; B.stack -= 600; ps[0].stack += 600; // B 가 600 잃음
  room.leave(B.id);
  room.join({ name: '새친구', ip: '1.1.1.1' }); // 같은 와이파이의 다른 친구
  const st = room.computeSettlement('끝');
  const row = st.rows.find((x) => x.name === 'P1');
  assert.ok(row && row.left);
  assert.equal(row.net, b0 - 600 - 1000);
  assert.equal(st.sumNet, 0);
  assert.ok(st.transfers.some((t) => t.from === 'P1'));
  const led = room.historyView().ledger.find((x) => x.name === 'P1');
  assert.ok(led && led.left);
  room.clearAllTimers();
});

test('정산표에 마지막 판(바닥 카드·패)이 남는다 · 결과 보는 시간 설정', () => {
  const { room, ps } = cash(3, { resultSeconds: 15 });
  room.start(ps[0].id);
  const h = room.hand;
  let g = 0;
  while (!h.finished && g++ < 60) { const la = room.viewFor(h.currentId).hand.legal || {}; room.act(h.currentId, { type: la.canCheck === false ? 'call' : 'check' }); }
  room.finishReveal();
  assert.ok(room.nextHandAt - room.now() >= 15000 * 0.001 - 1);
  room.endGame(ps[0].id);
  const lh = room.settlement.lastHand;
  assert.ok(lh && lh.board.length === 5);
  assert.ok(lh.hands.length >= 2);
  room.clearAllTimers();
});
