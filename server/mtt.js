'use strict';
// 여러 테이블 토너먼트: 등록 인원이 테이블 크기(settings.tableSize)를 넘으면 시작할 때 테이블을 나눈다.
//  · 그룹 정보는 '본 방'(처음 만든 방)의 tourney.group 에 둔다: { main, tables: [code…], size, director, out: [{ id, name }] }
//  · 다른 테이블 방은 tourney.mainCode 로 본 방을 가리킨다. 블라인드 시계(startedAt)는 모두 같다
//  · 판과 판 사이(그 테이블의 startHand)에만 사람을 옮긴다: 인원 차이 2명 이상이면 한 명씩, 남은 사람이 한 테이블에 들어가면 본 방으로 합침
//  · 탈락자는 그 테이블의 관전자가 되고, 순위는 그룹 전체 탈락 순서로 매긴다
const crypto = require('crypto');

function createMtt({ rooms, makeTable, onMoved }) {
  const mainOf = (room) => {
    const t = room && room.tourney;
    if (!t) return null;
    if (t.group) return room;
    return t.mainCode ? rooms.get(t.mainCode) || null : null;
  };
  const groupOf = (room) => { const m = mainOf(room); return m && m.tourney && m.tourney.group ? m.tourney.group : null; };
  const tablesOf = (g) => g.tables.map((c) => rooms.get(c)).filter(Boolean);
  const aliveIn = (t) => t.seated.filter((p) => p.stack + (p.pendingRebuy || 0) > 0 && !p.leaving);

  /** 한 사람을 다른 테이블로 (같은 id·토큰 그대로) */
  function move(from, p, to, why) {
    from.players = from.players.filter((x) => x !== p);
    const seat = to.freeSeat();
    if (seat === null) { from.players.push(p); return false; }
    p.seat = seat;
    p.role = 'player';
    p.timeouts = 0;
    to.players.push(p);
    if (from.hostId === p.id) { const n = from.seated.find((x) => !x.isBot) || from.seated[0]; from.hostId = n ? n.id : null; }
    if (!to.hostId || !to.get(to.hostId)) to.hostId = p.id;
    from.pushFeed(`${p.name}님이 테이블 ${to.tourney.tableNo}(으)로 옮겼어요${why ? ` · ${why}` : ''}`);
    to.pushFeed(`${p.name}님이 테이블 ${from.tourney.tableNo}에서 왔어요`);
    onMoved(from, p, to);
    to.maybeStartWaitingHand();
    return true;
  }

  /** 시작할 때: 무작위로 섞어 테이블마다 고르게 나눈다 */
  function split(main) {
    const size = main.settings.tableSize;
    const all = main.seated.slice();
    for (let i = all.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [all[i], all[j]] = [all[j], all[i]]; }
    // 늦은 참가·리바이를 받는 토너먼트면 테이블마다 한 자리씩 남겨 둔다
    const k = Math.ceil(all.length / (main.settings.reentryLevels > 0 ? size - 1 : size));
    const groups = Array.from({ length: k }, () => []);
    all.forEach((p, i) => groups[i % k].push(p));
    main.settings = { ...main.settings, maxPlayers: size };
    main.tourney.tableNo = 1;
    main.tourney.group = { main: main.code, tables: [main.code], size, director: main.hostId, out: [], entrants: all.length };
    // 본 방에 남을 사람: 첫 묶음 (자리 번호 다시 매김)
    const stay = new Set(groups[0].map((p) => p.id));
    for (let i = 1; i < k; i++) {
      const t = makeTable(main, i + 1);
      main.tourney.group.tables.push(t.code);
      for (const p of groups[i]) move(main, p, t);
      t.startHand();
    }
    main.seated.filter((p) => stay.has(p.id)).forEach((p, i) => { p.seat = i; });
    main.pushFeed(`👥 ${all.length}명 · 테이블 ${k}개로 나눠서 시작해요 (블라인드는 모든 테이블이 같이 올라요)`);
  }

  /** 판 시작 전(이 테이블): 합치기 · 인원 맞추기 */
  function beforeHand(room) {
    const g = groupOf(room);
    if (!g || g.tables.length < 2) return;
    const tables = tablesOf(g);
    const total = tables.reduce((a, t) => a + aliveIn(t).length, 0);
    const main = rooms.get(g.main);
    if (total <= g.size && main) {
      // 파이널 테이블: 본 방으로 모은다.
      //  · 본 방 차례면 판과 판 사이인 다른 테이블 사람을 불러오고, 다른 테이블 차례면 자기 사람을 보낸다
      //  · 본 방 자리가 (아직 정리 안 된 탈락자로) 모자라면 못 옮긴 사람은 그대로 두고 테이블도 닫지 않는다
      const sendAll = (t) => {
        for (const p of aliveIn(t)) move(t, p, main, '파이널 테이블');
        if (!aliveIn(t).length) {
          closeTable(t, g, '🏆 파이널 테이블로 합쳤어요! 링크로 본 테이블에서 계속 구경할 수 있어요');
          if (g.tables.length === 1) main.pushFeed('🏆 파이널 테이블! 남은 사람이 모두 모였어요');
        }
      };
      if (room === main) { for (const t of tables) if (t !== main && (!t.hand || (t.hand.finished && !t.revealing))) sendAll(t); }
      else sendAll(room);
      return;
    }
    // 인원 맞추기: 이 테이블이 가장 적은 테이블보다 2명 이상 많으면 한 명 보낸다
    const mine = aliveIn(room);
    const others = tables.filter((t) => t !== room).sort((a, b) => aliveIn(a).length - aliveIn(b).length);
    const low = others[0];
    if (!low || mine.length - aliveIn(low).length < 2) return;
    // 딜러 버튼 바로 뒤(곧 블라인드를 낼 사람)는 피해서 고른다
    const cand = mine.filter((p) => p.seat !== room.dealerSeat);
    const p = cand[crypto.randomInt(cand.length)] || mine[0];
    move(room, p, low, '인원 맞추기');
  }

  function closeTable(room, g, msg) {
    // 닫기 전에, 마지막 판에서 탈락했는데 아직 기록 안 된 사람을 순위에 (그 판 시작 칩이 적은 사람이 먼저)
    const prev = room.hand && room.hand.seats ? room.hand.seats : [];
    const startOf = (id) => { const x = prev.find((q) => q.id === id); return x ? x.startStack : 0; };
    room.seated.filter((p) => p.stack + (p.pendingRebuy || 0) <= 0).sort((a, b) => startOf(a.id) - startOf(b.id)).forEach((p) => room.tourneyOut(p));
    g.tables = g.tables.filter((c) => c !== room.code);
    for (const k of ['next', 'reveal', 'turn', 'bot', 'auto']) room.clearTimer(k); // 닫힌 테이블은 연출·차례 타이머도 끝
    room.pushFeed(msg);
    room.phase = 'lobby';
    room.reveal = null;
    room.hand = null;
    room.handPlayers = [];
    room.waiting = false;
    room.tourney.closed = true;
    room.touch();
  }

  /** 탈락(또는 기권): 그룹 순위에 기록하고 관전자로 */
  function out(room, p) {
    const g = groupOf(room);
    if (!g) return false;
    if (!g.out.some((x) => x.id === p.id)) g.out.push({ id: p.id, name: p.name });
    return true;
  }

  /** 다른 테이블에 아직 남은 사람이 있는지 (이 테이블이 1명 이하가 돼도 토너먼트가 안 끝남) */
  function aliveElsewhere(room) {
    const g = groupOf(room);
    if (!g) return 0;
    return tablesOf(g).filter((t) => t !== room).reduce((a, t) => a + aliveIn(t).length, 0);
  }

  function info(room) {
    const g = groupOf(room);
    if (!g) return null;
    const tables = tablesOf(g);
    return { tableNo: room.tourney.tableNo || 1, tables: tables.length, alive: tables.reduce((a, t) => a + aliveIn(t).length, 0), entrants: g.entrants, director: g.director, closed: !!room.tourney.closed, mainCode: g.main };
  }

  /** 일시정지: 모든 테이블에 */
  function pause(room, pid, on) {
    const g = groupOf(room);
    if (!g) return false;
    if (pid !== g.director && pid !== room.hostId) throw new Error('토너먼트를 만든 사람만 멈출 수 있어요');
    for (const t of tablesOf(g)) t.applyPause(on);
    return true;
  }

  /** 늦은 참가: 본 방이 꽉 찼으면 자리가 가장 많이 빈 테이블로 */
  function placeLate(main, p) {
    const g = groupOf(main);
    if (!g) return null;
    const t = tablesOf(g).filter((x) => x !== main && x.freeSeat() !== null).sort((a, b) => a.seated.length - b.seated.length)[0];
    if (!t) return null;
    main.players = main.players.filter((x) => x !== p);
    t.players.push(p);
    if (!t.takeSeat(p)) { t.players = t.players.filter((x) => x !== p); main.players.push(p); return null; }
    p.movedTo = t.code;
    t.maybeStartWaitingHand();
    return t;
  }

  return { split, beforeHand, out, aliveElsewhere, info, pause, placeLate, groupOf, mainOf };
}

module.exports = { createMtt };
