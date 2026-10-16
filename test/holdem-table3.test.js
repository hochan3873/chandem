'use strict';
// 홀덤 3차: 자리 고르기 · 한 장만 보여주기 · 토끼 사냥(버튼) · 핸드 기록 · 토너먼트 리바이 횟수
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, sanitizeSettings } = require('../server/room');

function cash(n = 3, extra = {}) {
  let T = 1_000_000;
  const room = new Room({ code: 'TBL3XX', settings: sanitizeSettings({ sb: 10, bb: 20, startChips: 1000, maxPlayers: 9, ...extra }), now: () => T, pace: 0.001 });
  const ps = [];
  for (let i = 0; i < n; i++) { const { player } = room.join({ name: 'P' + i }); room.connect(player.id); player.ready = true; ps.push(player); }
  room.hostId = ps[0].id;
  return { room, ps, tick: (ms) => { T += ms; } };
}
/** 지금 판을 모두 폴드로 끝낸다 (마지막 한 명 남을 때까지) */
function foldOut(room) {
  const h = room.hand;
  let g = 0;
  while (!h.finished && g++ < 20) room.act(h.currentId, { type: 'fold' });
}

test('자리: 고르지 않으면 고르게 퍼지고, 고르면 그 자리 · 대기실에서는 옮길 수 있다', () => {
  const { room, ps } = cash(3);
  const seats = ps.map((p) => p.seat);
  assert.equal(new Set(seats).size, 3);
  assert.equal(room.viewFor(ps[0].id).room.tableSeats, 9);
  // 서로 붙지 않게 (9자리에 3명이면 최소 2칸 이상 떨어짐)
  const sorted = seats.slice().sort((a, b) => a - b);
  assert.ok(sorted[1] - sorted[0] >= 2 && sorted[2] - sorted[1] >= 2, JSON.stringify(sorted));
  const free = [...Array(9).keys()].find((s) => !seats.includes(s));
  room.changeSeat(ps[1].id, free);
  assert.equal(ps[1].seat, free);
  assert.throws(() => room.changeSeat(ps[2].id, ps[0].seat), /앉은 자리/);
  // 관전자는 고른 자리에 앉는다
  const { player: S } = room.join({ name: 'Spec', spectator: true });
  const free2 = [...Array(9).keys()].find((s) => !room.seated.some((p) => p.seat === s));
  room.changeSeat(S.id, free2); S.ready = true;
  assert.equal(S.role, 'player');
  assert.equal(S.seat, free2);
  // 게임 중에는 앉은 사람이 자리를 못 옮긴다
  room.start(ps[0].id);
  const free3 = [...Array(9).keys()].find((s) => !room.seated.some((p) => p.seat === s));
  assert.throws(() => room.changeSeat(ps[0].id, free3), /게임 중/);
  room.clearAllTimers();
});

test('토끼 사냥: 누르기 전엔 남은 카드가 안 보이고, 누르면 모두에게 보인다', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  foldOut(room);
  const v1 = room.viewFor(ps[0].id);
  assert.equal(v1.hand.result.type, 'fold');
  assert.deepEqual(v1.hand.result.rabbit, []);
  assert.equal(v1.hand.canRabbit, true);
  room.rabbitHunt(ps[1].id);
  const v2 = room.viewFor(ps[2].id);
  assert.equal(v2.hand.result.rabbit.length, 5);
  assert.equal(v2.hand.canRabbit, false);
  assert.match(v2.feed.slice(-1)[0].text, /남은 카드/);
  // 핸드 기록에도 남는다
  const hv = room.historyView();
  assert.equal(hv.hands[0].rabbit.length, 5);
  room.clearAllTimers();
});

test('내 패 보여주기: 한 장만 → 다른 사람에겐 그 한 장만 보이고, 나머지도 보여 주면 두 장', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  const first = room.hand.currentId;
  foldOut(room);
  const me = ps.find((p) => p.id === first); // 처음 폴드한 사람
  const other = ps.find((p) => p.id !== first);
  room.showCards(me.id, 1);
  let seen = room.viewFor(other.id).players.find((p) => p.id === me.id).cards;
  assert.equal(seen[0], '??');
  assert.notEqual(seen[1], '??');
  assert.deepEqual(room.viewFor(me.id).me.shownOne, [1]);
  assert.equal(room.viewFor(me.id).me.canShow, true);
  room.showCards(me.id, 0);
  seen = room.viewFor(other.id).players.find((p) => p.id === me.id).cards;
  assert.ok(seen.every((c) => c !== '??'));
  assert.equal(room.viewFor(me.id).me.canShow, false);
  const last = room.historyView().hands[0];
  assert.ok(last.hands.some((x) => x.id === me.id && x.cards.every(Boolean)));
  room.clearAllTimers();
});

test('핸드 기록 · 칩 장부 · 이번 방 기록(판 수·VPIP)', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  for (let k = 0; k < 3; k++) { foldOut(room); if (k < 2) room.startHand(); }
  const hv = room.historyView();
  assert.equal(hv.hands.length, 3);
  assert.ok(hv.hands[0].no > hv.hands[2].no, '최근 판이 먼저');
  assert.ok(hv.hands[0].lines.length > 0);
  assert.equal(hv.ledger.length, 3);
  assert.equal(hv.ledger.reduce((a, p) => a + p.stack, 0), 3000);
  const v = room.viewFor(ps[0].id);
  assert.ok(v.players.every((p) => p.rs && p.rs.hands === 3));
  assert.equal(v.players[0].buyIn, 1000);
  room.clearAllTimers();
});

test('토너먼트: 다시 참가(리바이)도 정한 횟수까지만', () => {
  let T = 1_000_000;
  const room = new Room({ code: 'TRB3XX', settings: sanitizeSettings({ mode: 'tournament', reentryLevels: 3, rebuyMax: 1, sb: 10, bb: 20, startChips: 1000 }), now: () => T, pace: 0.001 });
  const ps = ['A', 'B', 'C'].map((name) => { const { player } = room.join({ name }); room.connect(player.id); player.ready = true; return player; });
  room.hostId = ps[0].id;
  room.start(ps[0].id);
  const B = ps[1];
  // B가 탈락해서 관전석으로 갔다고 치고 다시 앉기
  room.hand.finished = true;
  B.stack = 0; room.tourneyOut(B); B.role = 'spectator'; B.seat = null;
  room.setRole(B.id, false);
  assert.equal(B.role, 'player');
  assert.equal(B.rebuys, 1);
  B.stack = 0; room.tourneyOut(B); B.role = 'spectator'; B.seat = null;
  assert.throws(() => room.setRole(B.id, false), /1번까지/);
  room.clearAllTimers();
});

test('손님 닉네임: "손님" 같은 빈 이름은 안 받고, 진짜 이름은 받는다', () => {
  const { guestNameCheck } = require('../server/room');
  for (const bad of ['손님', 'guest', '닉네임', 'ㅇㅇ', '???', '  ']) assert.throws(() => guestNameCheck(bad));
  for (const ok of ['호찬', '손님A', '김무성']) assert.doesNotThrow(() => guestNameCheck(ok));
});

test('정산: 정한 시간이 지나면 그 판 뒤 자동으로 끝나고, 손익·송금표(칩 합 0)와 환산값이 나온다', () => {
  const { room, ps, tick } = cash(3, { sessionMinutes: 30, settleValue: 1000, settlePer: 1000, settleUnit: '점' });
  room.start(ps[0].id);
  assert.ok(room.viewFor(ps[0].id).room.endsAt);
  // 칩을 옮겨 놓고 한 사람은 나감
  foldOut(room); room.startHand();
  foldOut(room);
  ps[0].stack += 300; ps[1].stack -= 300;
  room.leave(ps[2].id);
  tick(31 * 60000);
  room.startHand();
  assert.equal(room.phase, 'lobby');
  const st = room.viewFor(ps[0].id).room.settlement;
  assert.ok(st && st.rows.length === 3, JSON.stringify(st));
  assert.equal(st.rows.reduce((a, r) => a + r.net, 0), 0, '손익 합은 0');
  const owed = {}; for (const t of st.transfers) { owed[t.from] = (owed[t.from] || 0) - t.chips; owed[t.to] = (owed[t.to] || 0) + t.chips; }
  for (const r of st.rows) assert.equal(owed[r.name] || 0, r.net, r.name);
  assert.deepEqual(st.value, { per: 1000, value: 1000, unit: '점' });
  room.clearAllTimers();
});

test('일반 게임: 칩을 다 잃고 리바인도 다 쓰면 관전석으로 옮겨 자리가 빈다 · 리바인할 수 있으면 자리를 지켜 준다', () => {
  const { room, ps } = cash(3, { rebuyMax: 1 });
  room.start(ps[0].id);
  foldOut(room);
  const B = ps[1];
  B.stack = 0; B.rebuys = 0; // 리바인 1번 남음 → 자리 유지
  room.startHand();
  assert.equal(B.role, 'player');
  foldOut(room);
  B.stack = 0; B.rebuys = 1; // 다 씀 → 관전
  room.startHand();
  assert.equal(B.role, 'spectator');
  assert.equal(B.seat, null);
  room.clearAllTimers();
});

test('일반 게임: 나갔다 다시 들어와도 칩·리바인 횟수·바이인이 그대로 (리바인 초기화 막기)', () => {
  const { room, ps } = cash(4, { rebuyMax: 2 });
  room.start(ps[0].id);
  foldOut(room);
  const B = ps[1];
  B.stack = 300; B.rebuys = 2; B.totalBuyIn = 3000;
  room.leave(B.id);
  const { player: B2 } = room.join({ name: 'P1' });
  assert.equal(B2.stack, 300);
  assert.equal(B2.rebuys, 2);
  assert.equal(B2.totalBuyIn, 3000);
  assert.equal(B2.role, 'player');
  assert.equal(room.canRebuy(B2), false); // 다 썼으니 더 못 함
  // 정산에 한 사람으로만
  assert.equal(room.computeSettlement().rows.filter((r) => r.name === 'P1').length, 1);
  // 칩도 리바인도 다 쓰고 나갔다 오면 앉을 수 없다
  const C = ps[2];
  C.stack = 0; C.rebuys = 2;
  room.leave(C.id);
  const { player: C2 } = room.join({ name: 'P2' });
  assert.equal(C2.role, 'spectator');
  assert.throws(() => room.setRole(C2.id, false), /리바인도 다 써서/);
  room.clearAllTimers();
});

test('일반 게임: 자리 비움이 5분 넘게 이어지면 판이 끝날 때 방에서 내보낸다', () => {
  const { room, ps, tick } = cash(3);
  room.start(ps[0].id);
  const B = ps[1];
  foldOut(room);
  room.sitOut(B.id);
  tick(4 * 60 * 1000);
  room.kickAway();
  assert.ok(room.get(B.id), '4분은 아직');
  tick(2 * 60 * 1000);
  room.startHand();
  assert.ok(!room.get(B.id));
  assert.match(room.leftNote[B.id], /5분/);
  // 연결이 끊긴 사람도
  const C = ps[2];
  room.disconnect(C.id);
  foldOut(room);
  tick(6 * 60 * 1000);
  room.startHand();
  assert.ok(!room.get(C.id));
  room.clearAllTimers();
});

test('쇼다운: 이긴 사람·진 사람 패가 모두 공개되고, 그래서 「내 패 보여주기」도 묻지 않는다', () => {
  const { room, ps } = cash(3);
  room.start(ps[0].id);
  const h = room.hand;
  let g = 0;
  while (!h.finished && g++ < 60) { const la = room.viewFor(h.currentId).hand.legal || {}; room.act(h.currentId, { type: la.canCheck === false ? 'call' : 'check' }); }
  assert.equal(h.result.type, 'showdown');
  if (room.reveal) room.reveal.done = true; // 공개 연출이 끝난 뒤
  const winners = h.result.winners;
  for (const p of ps) {
    const v = room.viewFor(p.id).me;
    assert.equal(v.canShow, false, '쇼다운에선 이미 공개됨');
    const seen = room.viewFor(ps.find((x) => x.id !== p.id).id).players.find((x) => x.id === p.id).cards;
    assert.ok(seen.every((c) => c !== '??'), '다른 사람에게도 내 패가 보임');
  }
  // 이긴 사람이 보여주기를 보내도 아무 일 없음
  const before = room.feed.length;
  room.showCards(winners[0], 'both');
  assert.equal(room.feed.length, before);
  room.clearAllTimers();
});

test('일반 게임: 닉네임을 바꿔 다시 들어와도 같은 인터넷(IP)이면 같은 사람 → 리바인 다 썼으면 못 앉음', () => {
  let T = 1_000_000;
  const room = new Room({ code: 'TIPXXX', settings: sanitizeSettings({ sb: 10, bb: 20, startChips: 1000, maxPlayers: 9, rebuyMax: 1 }), now: () => T, pace: 0.001 });
  const ps = ['1.1.1.1', '2.2.2.2', '3.3.3.3'].map((ip, i) => { const { player } = room.join({ name: 'P' + i, ip }); room.connect(player.id); player.ready = true; return player; });
  room.hostId = ps[0].id;
  room.start(ps[0].id);
  foldOut(room);
  const B = ps[1];
  B.stack = 0; B.rebuys = 1;
  room.leave(B.id);
  const { player: B2 } = room.join({ name: '새이름', ip: '2.2.2.2' });
  assert.equal(B2.rebuys, 1);
  assert.equal(B2.role, 'spectator');
  assert.throws(() => room.setRole(B2.id, false), /리바인도 다 써서/);
  // 다른 IP의 새 친구는 그냥 새로 참가
  const { player: D } = room.join({ name: '새친구', ip: '9.9.9.9' });
  assert.equal(D.rebuys, 0);
  assert.equal(D.role, 'player');
  room.clearAllTimers();
});

test('빨리빨리: 지금 차례인 사람에게만 · 8초에 한 번 · 내 차례면 안 됨', () => {
  const { room, ps, tick } = cash(3);
  const got = [];
  room.onEmote = (e) => got.push(e);
  room.start(ps[0].id);
  const cur = room.hand.currentId;
  const other = ps.find((p) => p.id !== cur);
  room.emote(other.id, 'hurry');
  assert.equal(got.length, 1);
  assert.equal(got[0].id, cur);
  assert.equal(got[0].from, other.name);
  assert.throws(() => room.emote(other.id, 'hurry'), /조금 있다가/);
  assert.throws(() => room.emote(cur, 'hurry'), /내 차례/);
  tick(9000);
  room.emote(other.id, 'hurry');
  assert.equal(got.length, 2);
  room.clearAllTimers();
});

test('돈 방식 · 실제 금액: 시작 칩 = 리바인 = 1인 금액, 정산표는 원 (토너먼트는 게임머니로)', () => {
  const s = sanitizeSettings({ money: 'won', buyWon: 20000, sb: 100, bb: 200, startChips: 1000, rebuyAmount: 500, rebuyFlex: true });
  assert.equal(s.money, 'won');
  assert.equal(s.startChips, 20000);
  assert.equal(s.rebuyAmount, 20000);
  assert.equal(s.rebuyFlex, false);
  assert.deepEqual([s.settlePer, s.settleValue, s.settleUnit], [1, 1, '원']);
  const t = sanitizeSettings({ money: 'won', mode: 'tournament', startChips: 1500 });
  assert.equal(t.money, 'chips');
  assert.equal(sanitizeSettings({}).money, 'chips');
  assert.equal(sanitizeSettings({ sessionMinutes: 10 }).sessionMinutes, 10);
});
