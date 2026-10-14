'use strict';
// 여러 테이블 토너먼트 (10명 넘으면 테이블 나눔)
const test = require('node:test');
const assert = require('node:assert/strict');
const { Room, sanitizeSettings, makeCode } = require('../server/room');
const { createMtt } = require('../server/mtt');

function setup(n, extra = {}) {
  let T = 1_000_000;
  const now = () => T;
  const rooms = new Map();
  const moves = [];
  const mtt = createMtt({
    rooms,
    makeTable(main, no) {
      const t = new Room({ code: makeCode(), settings: { ...main.settings, maxPlayers: main.settings.tableSize }, now, pace: 0.001 });
      t.phase = 'playing';
      t.tourney = { startedAt: main.tourney.startedAt, level: 0, busted: [], result: null, entrants: 0, mainCode: main.code, tableNo: no };
      t.mtt = mtt;
      rooms.set(t.code, t);
      return t;
    },
    onMoved(from, p, to) { moves.push([from.code, p.name, to.code]); },
  });
  const main = new Room({ code: 'MAIN01', settings: sanitizeSettings({ mode: 'tournament', maxPlayers: 30, tableSize: 9, startChips: 1000, ...extra }), now, pace: 0.001 });
  main.mtt = mtt;
  rooms.set(main.code, main);
  const ps = [];
  for (let i = 0; i < n; i++) { const { player } = main.join({ name: 'P' + i }); main.connect(player.id); player.ready = true; ps.push(player); }
  main.hostId = ps[0].id;
  main.start(ps[0].id);
  const tables = () => mtt.groupOf(main).tables.map((c) => rooms.get(c));
  const alive = (t) => t.seated.filter((p) => p.stack > 0);
  const total = () => tables().reduce((a, t) => a + alive(t).length, 0);
  const all = () => [...rooms.values()].flatMap((r) => r.players);
  const nextHands = () => { for (const t of tables()) { if (t.hand) t.hand.finished = true; t.startHand(); } };
  return { main, mtt, rooms, ps, tables, alive, total, all, nextHands, moves, tick: (ms) => { T += ms; } };
}

test('20명 · 테이블당 9 → 테이블 3개로 고르게 (7·7·6), 블라인드 시계 같음', () => {
  const g = setup(20);
  const ts = g.tables();
  assert.equal(ts.length, 3);
  assert.deepEqual(ts.map((t) => t.seated.length).sort(), [6, 7, 7]);
  assert.ok(ts.every((t) => t.tourney.startedAt === g.main.tourney.startedAt));
  assert.ok(ts.every((t) => t.hand && !t.hand.finished), '모든 테이블이 판을 시작');
  assert.equal(g.main.tourneyView().mtt.alive, 20);
  for (const r of g.rooms.values()) r.clearAllTimers();
});

test('탈락이 쌓이면 인원 맞추기 → 남은 사람이 9명 이하면 파이널 테이블 → 순위 20명 전부', () => {
  const g = setup(20);
  let guard = 0;
  // 한 판에 한두 명씩 탈락시키며 끝까지
  while (g.main.phase === 'playing' && guard++ < 200) {
    const ts = g.tables();
    // 인원 차이는 판 사이에 2명 미만으로 유지
    const counts = ts.map((t) => g.alive(t).length);
    if (ts.length > 1) assert.ok(Math.max(...counts) - Math.min(...counts) <= 3, `인원 차이 ${counts}`);
    const victim = ts.map((t) => g.alive(t)).sort((a, b) => b.length - a.length)[0][0];
    if (victim && g.total() > 1) {
      // 칩을 다른 사람에게 넘기고 탈락
      const t = ts.find((x) => x.players.includes(victim));
      const heir = g.alive(t).find((p) => p !== victim);
      if (heir) heir.stack += victim.stack; else g.alive(ts.find((x) => x !== t)).find(Boolean).stack += victim.stack;
      victim.stack = 0;
    }
    g.nextHands();
  }
  assert.equal(g.main.phase, 'lobby', '토너먼트가 끝남');
  const rk = g.main.tourney.result.ranking;
  assert.equal(rk.length, 20, '20명 모두 순위에');
  assert.equal(new Set(rk.map((r) => r.id)).size, 20);
  assert.ok(g.moves.length > 0, '중간에 테이블 이동이 있었음');
  for (const r of g.rooms.values()) r.clearAllTimers();
});

test('일시정지는 모든 테이블에 · 만든 사람만', () => {
  const g = setup(12);
  const ts = g.tables();
  assert.equal(ts.length, 2);
  const nobody = ts[1].seated.find((p) => p.id !== g.ps[0].id && p.id !== ts[1].hostId); // 만든 사람도 그 테이블 방장도 아닌 사람
  assert.throws(() => ts[1].setPause(nobody.id, true));
  g.main.setPause(g.ps[0].id, true);
  assert.ok(ts.every((t) => t.tourney.pausedAt));
  g.main.setPause(g.ps[0].id, false);
  assert.ok(ts.every((t) => !t.tourney.pausedAt));
  for (const r of g.rooms.values()) r.clearAllTimers();
});

test('늦은 참가: 본 방이 꽉 차면 자리가 남는 다른 테이블로', () => {
  const g = setup(18, { reentryLevels: 3 });
  const late = [];
  for (let i = 0; i < 4; i++) { const { player } = g.main.join({ name: 'L' + i }); late.push(player); }
  const placed = late.filter((p) => p.role === 'player');
  assert.equal(placed.length, 4, '모두 어딘가에 앉음');
  assert.equal(g.main.tourneyView().mtt.entrants, 22);
  for (const r of g.rooms.values()) r.clearAllTimers();
});

test('실제로 판을 쳐서 끝까지: 12명·테이블당 6 → 순위 12명 전부 · 칩 총량 그대로', () => {
  for (let run = 0; run < 25; run++) {
    const g = setup(12, { tableSize: 6, startChips: 300 });
    const chips = () => [...g.rooms.values()].reduce((a, r) => a + r.players.reduce((b, p) => b + p.stack, 0) + (r.hand && !r.hand.finished ? r.hand.totalPot : 0), 0);
    assert.equal(chips(), 3600);
    let guard = 0;
    while (g.main.phase === 'playing' && guard++ < 3000) {
      for (const t of [...g.rooms.values()]) {
        if (t.phase !== 'playing') continue;
        const h = t.hand;
        if (h && !h.finished) {
          const id = h.currentId; const la = h.legalActions(id);
          t.act(id, Math.random() < 0.4 && la.canAllIn ? { type: 'allin' } : la.canCheck ? { type: 'check' } : { type: 'call' });
        } else { if (t.reveal) t.finishReveal && t.finishReveal(); t.startHand(); }
      }
    }
    assert.equal(g.main.phase, 'lobby', `run ${run}: 끝나야 함`);
    const rk = g.main.tourney.result.ranking;
    assert.equal(new Set(rk.map((r) => r.id)).size, 12, `run ${run}: 순위 ${rk.length}명 ${rk.map((r) => r.name).join(',')}`);
    for (const r of g.rooms.values()) r.clearAllTimers();
  }
});
