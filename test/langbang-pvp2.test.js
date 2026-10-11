'use strict';
// 랑방 대전 1:1 맞대결 v2: 입력 확인 · 결정성(해시) · 견제 · 교체 · 결과 · 소켓 (/lbpvp2)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

const lb = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
const lo = (deck, m = 8) => ({ deck, meta: Object.fromEntries(deck.map((id) => [id, m])), stars: {}, gear: {} });
const DA = ['gunman', 'staff', 'sunggu', 'gunnyeo', 'jieun', 'ingyu'];
const DB = ['bangjang', 'subin', 'hanna', 'donghan', 'soyoung', 'wonsik'];

test('v2 입력 확인: 모양이 이상하면 버린다 · 횟수 제한', async () => {
  const P2 = await lb('pvp2.js');
  assert.deepEqual(P2.cleanInput({ k: 'sk', s: 2 }), { k: 'sk', s: 2 });
  assert.deepEqual(P2.cleanInput({ k: 'sk', s: 2, x: 999, y: 100 }), { k: 'sk', s: 2, x: 360, y: 100 }, '좌표는 판 안으로');
  assert.equal(P2.cleanInput({ k: 'sk', s: 9 }), null);
  assert.equal(P2.cleanInput({ k: 'sk', s: '1; drop' }), null);
  assert.equal(P2.cleanInput({ k: 'sw', b: 5, s: 1 }), null, '벤치는 0~1');
  assert.deepEqual(P2.cleanInput({ k: 'cl' }), { k: 'cl', s: -1 });
  assert.equal(P2.cleanInput({ k: 'send', kind: 'huge' }), null);
  assert.equal(P2.cleanInput({ k: 'hack' }), null);
  assert.equal(P2.cleanInput(null), null);
  const b = {};
  let ok = 0; for (let i = 0; i < 30; i++) if (P2.rateOk(b, 100)) ok++;
  assert.equal(ok, P2.PV2.rate.burst, '한꺼번에는 burst 번까지');
  assert.equal(P2.rateOk(b, 100.5), true, '0.5초 뒤 다시 찬다');
  // 매칭: 전투력 차이가 크면 바로는 안 붙고 기다리면 붙는다
  assert.equal(P2.matchFits({ fp: 1000, rating: 1000 }, { fp: 1100, rating: 1000 }, 0), true);
  assert.equal(P2.matchFits({ fp: 1000, rating: 1000 }, { fp: 1500, rating: 1000 }, 0), false);
  assert.equal(P2.matchFits({ fp: 1000, rating: 1000 }, { fp: 1500, rating: 1000 }, 15), true);
  assert.equal(P2.matchFits({ fp: 1000, rating: 1000 }, { fp: 1000, rating: 1500 }, 0), false, '점수 차도 본다');
  // 판정 · 진상 묶기
  assert.equal(P2.judge2({ hp: 100, max: 300, kills: 5 }, { hp: 90, max: 300, kills: 50 }), 1);
  assert.equal(P2.judge2({ hp: 90, max: 300, kills: 5 }, { hp: 90, max: 300, kills: 50 }), -1);
  assert.equal(P2.judge2({ hp: 90, max: 300, kills: 5 }, { hp: 90, max: 300, kills: 5 }), 0);
  const types = [];
  const buf = P2.packEnemies([{ uid: 70000, t: 'mukti', x: 180, y: 300, hp: 0.5, f: 5 }, { uid: 3, t: 'boss_loan', x: 0, y: -80, hp: 1, f: 1 }], types);
  const back = P2.unpackEnemies(buf, types);
  assert.equal(buf.length, 14, '한 명 7바이트');
  assert.equal(back[0].t, 'mukti'); assert.equal(back[0].uid, 70000 & 0xffff); assert.ok(Math.abs(back[0].x - 180) < 2); assert.ok(Math.abs(back[0].y - 300) < 3); assert.equal(back[0].hp, 0.5); assert.equal(back[0].f, 5);
  assert.equal(back[1].t, 'boss_loan');
});

test('v2 결정성: 같은 시드 + 같은 입력 → 같은 해시 · 입력이 다르면 달라진다', async () => {
  const D2 = await lb('pvp2-sim.js');
  const run = (extra) => {
    const d = D2.createDuel({ seed: 777, hp: 1, sides: [lo(DA), lo(DB)] });
    D2.setBot(d, 1);
    const hs = [];
    for (let k = 0; k < 400; k++) {
      if (k === 50) D2.input(d, 0, { k: 'sk', s: 2 });
      if (k === 120) D2.input(d, 0, { k: 'cl', s: -1 });
      if (extra && k === 60) D2.input(d, 0, { k: 'sw', b: 0, s: 1 });
      D2.tick(d); D2.drainEv(d);
      if (k % 20 === 0) hs.push(D2.stateHash(d));
    }
    return hs;
  };
  const a = run(false), b = run(false), c = run(true);
  assert.deepEqual(a, b, '같은 판이면 해시가 끝까지 같다');
  assert.notDeepEqual(a, c, '교체 하나로 판이 달라진다');
});

test('v2 견제: 스킬 → 0.7초 뒤 상대 멤버 상태이상 · 방패가 막는다 · 교체로 피한다 · 맞으면 4초 면역', async () => {
  const D2 = await lb('pvp2-sim.js');
  const P2 = await lb('pvp2.js');
  const d = D2.createDuel({ seed: 5, hp: 1, sides: [lo(['staff', 'gunman', 'jieun', 'subin', 'gunnyeo']), lo(['gunman', 'sanghwa', 'ara', 'hanna', 'ingyu'])] });
  for (let k = 0; k < 60; k++) D2.tick(d); // 6초: 스킬 쿨 반쯤
  const A = d.sides[0], B = d.sides[1];
  const staff = A.g.heroes.find((h) => h.id === 'staff');
  staff.skillCd = 0; A.g.mom = 200;
  assert.equal(D2.input(d, 0, { k: 'tg', s: 2 }).ok, true, '상대 2번 자리 조준');
  assert.equal(D2.input(d, 0, { k: 'tg', s: 0 }).ok, false, '빈 자리는 조준 못 함');
  D2.drainEv(d);
  assert.equal(D2.input(d, 0, { k: 'sk', s: staff.slot }).ok, true);
  D2.tick(d);
  let ev = D2.drainEv(d);
  const hx = ev.find((e) => e.k === 'hex');
  assert.ok(hx, '견제가 날아간다'); assert.equal(hx.kind, 'stun', '군중 제어 → 기절'); assert.equal(hx.to, 2);
  for (let k = 0; k < 8; k++) D2.tick(d);
  ev = D2.drainEv(d);
  const hit = ev.find((e) => e.k === 'hexHit');
  assert.ok(hit); assert.equal(hit.r, 'hit');
  const tgt = B.g.heroes.find((h) => h.slot === 2);
  assert.ok(tgt.stunT > 0, '기절');
  const snap = D2.snap(d, 1);
  assert.ok(snap.me.h.find((h) => h[0] === 2)[4] & P2.ST.stun, '장면에 기절 표시');
  // 정신 차려: 풀린다 · 10초 쿨
  assert.equal(D2.input(d, 1, { k: 'cl', s: 2 }).ok, true);
  assert.ok(!(tgt.stunT > 0));
  assert.equal(D2.input(d, 1, { k: 'cl', s: 2 }).ok, false, '쿨');
  // 4초 면역: 바로 또 쏘면 면역
  staff.skillCd = 0; A.g.mom = 200; A.g.lastSkillT = -9;
  D2.input(d, 0, { k: 'sk', s: staff.slot });
  for (let k = 0; k < 9; k++) D2.tick(d);
  ev = D2.drainEv(d);
  assert.equal(ev.find((e) => e.k === 'hexHit').r, 'imm');
  // 탱커 스킬 → 방패: 다음 견제를 막는다
  for (let k = 0; k < 80; k++) D2.tick(d);
  const ingyu = B.g.heroes.find((h) => h.id === 'ingyu');
  assert.ok(!ingyu, '인규는 벤치');
  const g2 = B.g.heroes.find((h) => h.slot === 1);
  B.guard = 1; B.guardT = 8;
  A.target = g2.slot; staff.skillCd = 0; A.g.mom = 200; A.g.lastSkillT = -9; B.imm = {};
  D2.input(d, 0, { k: 'sk', s: staff.slot });
  for (let k = 0; k < 9; k++) D2.tick(d);
  assert.equal(D2.drainEv(d).find((e) => e.k === 'hexHit').r, 'guard', '방패가 막음');
  assert.equal(B.guard, 0);
  // 날아오는 동안 교체 → 빗나감 · 들어온 멤버는 2초 무적 · 레벨 이어받기 · 8초 쿨
  for (let k = 0; k < 10; k++) D2.tick(d);
  B.imm = {}; staff.skillCd = 0; A.g.mom = 200; A.g.lastSkillT = -9;
  const out = B.g.heroes.find((h) => h.slot === 1); out.lv = 4;
  D2.input(d, 0, { k: 'sk', s: staff.slot });
  D2.tick(d);
  const sw = D2.input(d, 1, { k: 'sw', b: 0, s: 1 });
  assert.equal(sw.ok, true);
  const nw = B.g.heroes.find((h) => h.slot === 1);
  assert.equal(nw.id, 'ingyu'); assert.equal(nw.lv, 4, '레벨 이어받기'); assert.ok(nw.ccImmT > 0, '2초 무적');
  assert.equal(B.bench[0], out.id, '나간 멤버는 벤치로');
  assert.equal(D2.input(d, 1, { k: 'sw', b: 0, s: 2 }).ok, false, '교체 쿨');
  for (let k = 0; k < 9; k++) D2.tick(d);
  assert.equal(D2.drainEv(d).find((e) => e.k === 'hexHit').r, 'miss', '교체로 피함');
  // 잘못된 입력
  assert.equal(D2.input(d, 0, { k: 'sk', s: 0 }).ok, false, '빈 자리 스킬');
  assert.equal(D2.input(d, 0, { k: 'send', kind: 'big' }).ok, D2.gauge(A) >= 30, '게이지만큼만');
});

test('v2 결과: 입구가 먼저 무너진 쪽이 진다 · 4분이면 판정', async () => {
  const D2 = await lb('pvp2-sim.js');
  const d = D2.createDuel({ seed: 9, hp: 1, sides: [lo(DA), lo(DB)] });
  D2.tick(d);
  d.sides[1].g.base.hp = 0;
  D2.tick(d);
  assert.equal(d.over, true); assert.equal(d.win, 0); assert.equal(d.reason, 'dead');
  const e = D2.createDuel({ seed: 9, hp: 1, len: 2, sides: [lo(DA), lo(DB)] });
  for (let k = 0; k < 10 && !e.over; k++) D2.tick(e);
  e.sides[0].g.base.hp = e.sides[0].g.base.max * 0.5; e.sides[0].g.pvp.hpEnd = undefined;
  for (let k = 0; k < 30 && !e.over; k++) D2.tick(e);
  assert.equal(e.over, true); assert.equal(e.reason, 'time');
  assert.equal(e.win, 1, "입구가 더 남은 쪽 승");
});

// ─── 소켓 ───
let srv, base;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 }, lbpvp: { botAfterMs: 1e6 }, lbpvp2: { tickMs: 4, countdownMs: 30, aiNoticeMs: 0, botAfterMs: 400, graceMs: 300, pairMs: 50 } });
  const port = await srv.listen();
  base = `http://127.0.0.1:${port}`;
});
test.after(async () => { await srv.close(); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(10); } throw new Error('시간 초과'); }
function player(token, gid) {
  const s = connect(base + '/lbpvp2', { transports: ['websocket'], forceNew: true, auth: { token: token || '', gid: gid || '' } });
  s.got = { snap: 0 };
  for (const ev of ['match', 'end', 'rejoin']) s.on(ev, (v) => { (s.got[ev] = s.got[ev] || []).push(v); });
  s.on('snap', (v) => { s.got.snap++; s.last = v; });
  s.call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}
async function user(name) { return srv.accounts.signup({ username: name, password: 'secret12', nickname: name }); }

test('v2 소켓: 매칭 → 장면 → 입력 확인 → 입구 무너짐 → 점수 변동', async () => {
  await srv.lbPvp2.ready;
  const ua = await user('pv2a'), ub = await user('pv2b');
  const uidA = srv.accounts.verifyToken(ua.token);
  const own = (st) => { const lb = st.langbang = st.langbang || {}; lb.owned = Object.assign(lb.owned || {}, { sunggu: 1, jieun: 1, ingyu: 1 }); };
  await srv.accounts.updateStats(uidA, own); await srv.accounts.updateStats(srv.accounts.verifyToken(ub.token), own);
  const a = player(ua.token), b = player(ub.token);
  await until(() => a.connected && b.connected);
  assert.equal((await a.call('queue', { deck: DA })).waiting, true);
  await b.call('queue', { deck: DA });
  await until(() => a.got.match && b.got.match);
  assert.equal(a.got.match[0].id, b.got.match[0].id);
  assert.equal(a.got.match[0].side + b.got.match[0].side, 1, '0번 · 1번');
  assert.equal(a.got.match[0].opp.nickname, 'pv2b');
  await until(() => a.got.snap > 3 && b.got.snap > 3);
  const P2 = await lb('pvp2.js');
  assert.ok(a.last.b && a.last.b.byteLength > 20, '장면은 바이너리 한 통');
  const types = []; for (const [i, t] of a.last.ty || []) types[i] = t;
  const s = P2.unpackSnap(a.last.b, a.got.match[0].roster, types);
  assert.ok(Array.isArray(s.me.h) && s.me.h.length === 4, '필드 4명');
  assert.equal(s.me.bench.length, 2, '벤치 2명');
  assert.deepEqual(s.me.h.map((h) => h[1]).sort(), DA.slice(0, 4).sort());

  assert.equal((await a.call('in', { k: 'hack' })).ok, false, '이상한 입력');
  assert.equal((await a.call('in', { k: 'sk', s: 0 })).ok, false, '빈 자리');
  assert.equal((await a.call('in', { k: 'send', kind: 'big' })).ok, false, '게이지 없음');
  let limited = false;
  for (let i = 0; i < 20; i++) { const r = await a.call('in', { k: 'tg', s: 1 }); if (!r.ok && /빨라/.test(r.msg)) limited = true; }
  assert.ok(limited, '1초에 너무 많이 누르면 막힌다');
  const m = [...srv.lbPvp2.matches.values()][0];
  m.d.sides[b.got.match[0].side].g.base.hp = 0; // b 입구 무너짐
  await until(() => a.got.end && b.got.end);
  const ra = a.got.end[0], rb = b.got.end[0];
  assert.equal(ra.win, true); assert.equal(rb.win, false);
  assert.ok(ra.delta > 0 && rb.delta < 0, '점수 변동'); assert.equal(ra.ranked, true);
  const pa = (await srv.accounts.store.byId(ua.user ? ua.user.id : srv.accounts.verifyToken(ua.token))).stats.langbang.pvp;
  assert.equal(pa.wins, 1); assert.equal(pa.rating, 1000 + ra.delta);
  a.close(); b.close();
  // 안 가진 멤버는 서버가 뺀다 (대전 덱 6칸이어도)
  const uc = await user('pv2c');
  const c = player(uc.token);
  await until(() => c.connected);
  assert.equal((await c.call('botnow', { deck: ['soyoung', 'gunman', 'staff', 'sunggu', 'gunnyeo', 'jieun'] })).matched, true);
  await until(() => c.got.match);
  assert.deepEqual(c.got.match[0].deck, ['gunman', 'staff', 'gunnyeo'], '소영 · 성구 · 지은은 안 가짐');
  c.emit('quit'); await until(() => c.got.end); c.close();
});

test('v2 소켓: AI 와 바로 대전 · 끊기면 AI 가 대신 · 시간 지나면 기권', async () => {
  const g = player('', 'guestv2aaaa1');
  await until(() => g.connected);
  assert.equal((await g.call('botnow', { deck: DA })).matched, true);
  await until(() => g.got.match);
  assert.equal(g.got.match[0].opp.ai, true);
  assert.equal(g.got.match[0].oppDeck.length >= 4, true);
  await until(() => g.got.snap > 2);
  g.close();
  await wait(100);
  const m = [...srv.lbPvp2.matches.values()].find((x) => x.ai);
  assert.ok(m && m.d.sides[0].bot, '끊긴 동안 AI 가 조종');
  // 다시 붙으면 이어서
  const g2 = player('', 'guestv2aaaa1');
  await until(() => g2.got.rejoin);
  assert.ok(!m.d.sides[0].bot, '돌아오면 내가 조종');
  g2.close();
  await until(() => !srv.lbPvp2.matches.has(m.id), 3000);
  assert.equal(m.over, true);
});

test('v2 소켓: 방 코드로 친구 대전', async () => {
  const h = player('', 'guestv2host1'), j = player('', 'guestv2join1');
  await until(() => h.connected && j.connected);
  const r = await h.call('room:create', { deck: DA, title: '한 판!' });
  assert.match(r.code, /^\d{4}$/);
  const list = (await j.call('rooms:list', {})).rooms;
  assert.ok(list.some((x) => x.code === r.code && x.v === 2));
  assert.equal((await j.call('room:join', { code: r.code, deck: DB })).ok, true);
  await until(() => h.got.match && j.got.match);
  h.emit('quit');
  await until(() => h.got.end && j.got.end);
  assert.equal(j.got.end[0].win, true); assert.equal(j.got.end[0].reason, 'quit');
  assert.equal(j.got.end[0].ranked, false, '손님끼리는 점수 없음');
  h.close(); j.close();
});

test('v2 화면 파일: 문법 (game.js · pvp2-ui.js — 줄 끝 주석이 코드를 먹지 않았나)', () => {
  const { execFileSync } = require('node:child_process');
  for (const f of ['game.js', 'pvp2-ui.js', 'pvp2.js', 'pvp2-sim.js', 'patchnotes.js']) execFileSync(process.execPath, ['--check', path.join(__dirname, '..', 'public', 'langbang', f)]);
});

test('v2 전송량: 한 사람당 1초 3KB 아래 (바이너리 · 0.2초마다 · 상대 판 진상 3번에 2번) · 풀면 그대로', async () => {
  const D2 = await lb('pvp2-sim.js');
  const P2 = await lb('pvp2.js');
  const d = D2.createDuel({ seed: 11, hp: 1.6, sides: [lo(DA, 10), lo(DB, 10)] });
  D2.setBot(d, 0); D2.setBot(d, 1);
  const roster = [...new Set([...d.sides[0].deck, ...d.sides[1].deck])];
  const tt = P2.newTypeTable(), types = [];
  let n = 0, bytes = 0, evq = [], checked = false;
  while (!d.over) {
    D2.tick(d); n++; for (const e of D2.drainEv(d)) evq.push(e);
    if (n % P2.PV2.snapEvery) continue;
    const opFull = (n / P2.PV2.snapEvery) % P2.PV2.opSkip !== P2.PV2.opSkip - 1;
    const raw = D2.snap(d, 0, opFull), pk = P2.packSnap(raw, roster, tt);
    for (const [i, t] of pk.ty) types[i] = t;
    bytes += pk.b.length + 60 + (evq.length ? JSON.stringify(evq).length : 0) + (pk.ty.length ? JSON.stringify(pk.ty).length : 0); // (소켓 머리 60바이트로 넉넉히)
    evq = [];
    if (!checked && raw.me.es.length > 3 && raw.op.es) {
      checked = true;
      const back = P2.unpackSnap(pk.b, roster, types);
      assert.equal(back.me.hp, raw.me.hp); assert.equal(back.op.k, raw.op.k);
      assert.deepEqual(back.me.h.map((h) => [h[0], h[1], h[2], h[4]]), raw.me.h.map((h) => [h[0], h[1], h[2], h[4]]));
      assert.deepEqual(back.me.bench, raw.me.bench);
      assert.equal(back.me.es.length, raw.me.es.length); assert.equal(back.me.es[0].t, raw.me.es[0].t); assert.ok(Math.abs(back.me.es[0].y - raw.me.es[0].y) < 3);
      assert.equal(back.op.es.length, raw.op.es.length);
    }
  }
  assert.ok(checked);
  const perSec = bytes / d.t;
  assert.ok(perSec < 3000, `1초 ${Math.round(perSec)}바이트`);
});
