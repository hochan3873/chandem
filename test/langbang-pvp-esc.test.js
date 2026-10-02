'use strict';
// 랑방 대전 1:1: 늘어지는 판 막기 (과열 · 폭주 · 서든데스) 일정 · 두 사람 똑같이 · 상대 미니 화면 (점 넘기기 · 간격)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

const lb = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(15); } throw new Error('시간 초과'); }
const WEAK = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'];
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

test('단계 일정: 90초 과열 · 150초 폭주 · 210초 서든데스 — 보내기 배수 · 자동 중간 보스 · 정해진 웨이브 수', async () => {
  const PV = await lb('pvp.js');
  assert.deepEqual([0, 89.9, 90, 149.9, 150, 209.9, 210, 299].map(PV.pvpPhase), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([0, 90, 150, 210].map(PV.pvpSendMul), [1, 2, 2, 3]);
  // 자동 중간 보스: 폭주 전엔 없음 · 폭주 시작 때 처치 수부터 세서 25명마다
  assert.deepEqual(PV.pvpAutoBig(149, 400, null), { from: null, n: 0 });
  let r = PV.pvpAutoBig(150, 400, null); assert.deepEqual(r, { from: 400, n: 0 }, '폭주 전에 잡은 건 안 센다');
  r = PV.pvpAutoBig(160, 424, r.from); assert.equal(r.n, 0);
  r = PV.pvpAutoBig(161, 451, r.from); assert.deepEqual(r, { from: 450, n: 2 }, '51명 → 2번 · 남은 1명은 다음에');
  // 서든데스 웨이브: 210초부터 8초마다 · 300초 판정까지
  assert.equal(PV.pvpSdCount(209.9), 0); assert.equal(PV.pvpSdCount(210), 1); assert.equal(PV.pvpSdCount(218), 2);
  assert.equal(PV.pvpSdCount(400), PV.pvpSdCount(299.9));
  assert.equal(PV.pvpBunchCount(149), 0); assert.equal(PV.pvpBunchCount(150), 1); assert.equal(PV.pvpBunchCount(180), 2);
  // 미니 화면 점: 정수 하나로 (보여 주기만)
  for (const [x, y, k] of [[0, 0, 0], [63, 63, 3], [31, 7, 2], [99, -5, 1]]) { const d = PV.pvpUndot(PV.pvpDot(x, y, k)); assert.deepEqual(d, { x: Math.max(0, Math.min(63, x)), y: Math.max(0, Math.min(63, y)), k }); }
});

test('단계는 두 사람 똑같이: 같은 시계면 같은 보스 묶음 · 같은 수의 정해진 웨이브 · 입구 피해 ×1.5 · 다시 들어온 판은 지난 것을 쏟지 않음', async () => {
  const PV = await lb('pvp.js'), S = await lb('sim.js');
  const mk = (r) => { const g = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 77, hp: 1 }, deck: WEAK, rng: seeded(r) }); g.god = true; return g; };
  const a = mk(1), b = mk(999); // 화면마다 rng 는 달라도
  const log = (g) => { const out = { phase: [], bunch: [], waves: 0 }; return out; };
  const la = log(a), lbb = log(b);
  for (let t = 0; t <= 240; t += 0.5) {
    for (const [g, l] of [[a, la], [b, lbb]]) {
      g.pvp.clock = t; S.step(g, 1 / 30);
      for (const e of g.events) { if (e.type === 'pvpPhase') l.phase.push(e.p); if (e.type === 'bossSpawn' && e.bunch) l.bunch.push(e.enemy); if (e.type === 'pvpWave') l.waves++; }
      g.events.length = 0;
    }
  }
  assert.deepEqual(la.phase, [1, 2, 3], '과열 → 폭주 → 서든데스 한 번씩');
  assert.deepEqual(la.phase, lbb.phase);
  assert.equal(la.bunch.length, 2 + 3, '보스 묶음 2명 + 3명');
  assert.deepEqual(la.bunch, lbb.bunch, '같은 보스 (판 시드로 고름)');
  assert.equal(la.waves, PV.pvpSdCount(240)); assert.equal(la.waves, lbb.waves);
  assert.ok(Math.abs(a.pvp.doorMul - (1 + PV.PVP_END.doorStep * a.pvp.n) * PV.PVP_ESC.sdDoor) < 1e-9, '서든데스: 입구 피해 ×1.5 더');
  // 다시 들어온 판 (230초에 새로 시작): 지난 보스 묶음 · 웨이브를 한꺼번에 쏟지 않는다
  const c = mk(5); c.pvp.clock = 230; S.step(c, 1 / 30);
  assert.equal(c.events.filter((e) => e.type === 'bossSpawn' && e.bunch).length, 0);
  assert.equal(c.events.filter((e) => e.type === 'pvpWave').length, 0);
  assert.equal(c.pvp.phase, 3);
});

test('보내기 배수 · 화면 진상 한도: 넘치면 수 대신 체력으로', async () => {
  const PV = await lb('pvp.js'), S = await lb('sim.js');
  const g = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  S.pvpIncoming(g, 'small', 2); assert.equal(g.enemies.filter((x) => x.sent).length, PV.PVP_END.sendSmall * 2, '과열: 진상 두 묶음');
  S.pvpIncoming(g, 'big', 3); assert.equal(g.enemies.filter((x) => x.sent && x.mid).length, 3, '중간 보스 3명');
  // 화면이 꽉 차면: 수는 한도까지 · 모자란 만큼 체력
  const h = S.createGame({ H: 760, mode: 'stage', stage: 12, pvp: { seed: 5, hp: 1 }, deck: WEAK, rng: () => 0.5 });
  for (let i = 0; i < PV.PVP_ESC.cap - 2; i++) S.spawnEnemy(h, 'mukti', 100, 100);
  const one = S.spawnEnemy(h, 'mukti', 100, 100), base = one.maxHp; one.dead = true;
  const before = h.enemies.length;
  S.pvpIncoming(h, 'small', 3);
  const got = h.enemies.slice(before).filter((x) => x.sent && x.type === 'mukti');
  assert.equal(h.enemies.length - before, 4, '최소 4명만');
  assert.ok(got.every((x) => x.maxHp > base * 3), '대신 체력이 몇 배');
  // 미니 화면 점: 40개까지 · 보스가 먼저
  const v = S.pvpView(h);
  assert.equal(v.length, PV.PVP_DOTS);
  const boss = S.spawnEnemy(h, 'boss_loan', 180, 50); void boss;
  assert.equal(PV.pvpUndot(S.pvpView(h)[0]).k, 2, '보스가 맨 앞');
});

// ─── 서버: 미니 화면 넘기기 (간격 · 정리) · 단계 배수 · 자동 중간 보스 ───
test('서버: 상대 미니 화면 — 점을 정리해서 넘기고 · 너무 자주 오면 건너뛰고 · 판정 값은 그대로 받는다', async () => {
  const srv = createServer({ port: 0, lbpvp: { botAfterMs: 5000, graceMs: 2000, sendDelayMs: 20, countdownMs: 20, oppGapMs: 300 } });
  const port = await srv.listen();
  const opened = [];
  const sock = (gid) => { const s = connect(`http://127.0.0.1:${port}/lbpvp`, { transports: ['websocket'], forceNew: true, auth: { gid } }); opened.push(s); s.got = {}; for (const ev of ['match', 'opp']) s.on(ev, (v) => { (s.got[ev] = s.got[ev] || []).push(v); }); s.call = (ev, d) => new Promise((r) => s.emit(ev, d, r)); return s; };
  try {
    const a = sock('snapguest1'), b = sock('snapguest2');
    await until(() => a.connected && b.connected);
    await a.call('queue', { deck: ['staff'] }); await b.call('queue', { deck: ['gunman'] });
    await until(() => a.got.match && b.got.match);
    await wait(60);
    const ep = Array.from({ length: 70 }, (_, i) => i * 300);
    ep[0] = -5; ep[1] = 99999; ep[2] = 'x';
    a.emit('hp', { hp: 290, max: 300, kills: 3, wave: 1, enemies: 70, ep });
    await until(() => b.got.opp);
    const o = b.got.opp[0];
    assert.equal(o.ep.length, 40, '40개까지');
    assert.deepEqual(o.ep.slice(0, 3), [0, 16383, 0], '범위 밖 · 이상한 값은 정리');
    assert.equal(o.hp, 290);
    // 0.3초 안에 여러 번 → 한 번만 넘김 · 서버는 마지막 값을 판정에 쓴다
    for (let k = 1; k <= 5; k++) a.emit('hp', { hp: 290 - k, max: 300, kills: 3 + k, wave: 1, ep: [k] });
    await wait(150);
    assert.equal(b.got.opp.length, 1, '간격 안이면 건너뜀');
    const pl = [...srv.lbPvp.matches.values()][0];
    const pa = pl.a.socket && pl.a.socket.id === a.id ? pl.a : pl.b;
    assert.equal(pa.kills, 8); assert.equal(pa.hp, 285);
    await wait(250);
    a.emit('hp', { hp: 280, max: 300, kills: 9, wave: 1, ep: [7] });
    await until(() => b.got.opp.length === 2);
    assert.deepEqual(b.got.opp[1].ep, [7]);
    a.close(); b.close();
  } finally { for (const so of opened) so.close(); await srv.close(); }
});

test('서버: 단계 배수 (서버 시계) · 폭주 자동 중간 보스 — 두 사람 같은 규칙', async () => {
  let shift = 0;
  const srv = createServer({ port: 0, lbpvp: { botAfterMs: 5000, graceMs: 2000, sendDelayMs: 20, countdownMs: 20, oppGapMs: 0, now: () => Date.now() + shift } });
  const port = await srv.listen();
  const opened = [];
  const sock = (gid) => { const s = connect(`http://127.0.0.1:${port}/lbpvp`, { transports: ['websocket'], forceNew: true, auth: { gid } }); opened.push(s); s.got = {}; for (const ev of ['match', 'incoming', 'sent', 'landed']) s.on(ev, (v) => { (s.got[ev] = s.got[ev] || []).push(v); }); s.call = (ev, d) => new Promise((r) => s.emit(ev, d, r)); return s; };
  try {
    await srv.lbPvp.simReady;
    const a = sock('escguest1'), b = sock('escguest2');
    await until(() => a.connected && b.connected);
    await a.call('queue', { deck: ['staff'] }); await b.call('queue', { deck: ['gunman'] });
    await until(() => a.got.match && b.got.match);
    await wait(60);
    // 처음: 한 묶음
    a.emit('hp', { hp: 300, max: 300, kills: 20, wave: 1 }); await wait(40);
    assert.equal((await a.call('send', { kind: 'small' })).ok, true);
    await until(() => b.got.incoming && a.got.landed);
    assert.deepEqual(b.got.incoming[0], { kind: 'small', n: 1, auto: false });
    assert.equal(a.got.landed[0].kind, 'small', '보낸 사람에게 도착 알림');
    // 100초 (과열): 두 묶음
    shift = 100e3;
    a.emit('hp', { hp: 300, max: 300, kills: 60, wave: 3 }); await wait(40);
    assert.equal((await a.call('send', { kind: 'big' })).ok, true);
    await until(() => b.got.incoming.length === 2);
    assert.deepEqual(b.got.incoming[1], { kind: 'big', n: 2, auto: false });
    // 155초 (폭주): 처치 25명마다 자동 중간 보스 (게이지 안 씀) — 반대쪽도 같은 규칙
    shift = 155e3;
    a.emit('hp', { hp: 300, max: 300, kills: 100, wave: 6 }); await wait(40); // 여기서부터 센다
    a.emit('hp', { hp: 300, max: 300, kills: 151, wave: 6 });
    await until(() => b.got.incoming.length === 4);
    assert.deepEqual(b.got.incoming.slice(2), [{ kind: 'big', n: 1, auto: true }, { kind: 'big', n: 1, auto: true }]);
    b.emit('hp', { hp: 300, max: 300, kills: 10, wave: 6 }); await wait(40);
    b.emit('hp', { hp: 300, max: 300, kills: 35, wave: 6 });
    await until(() => a.got.incoming && a.got.incoming.length === 1);
    assert.deepEqual(a.got.incoming[0], { kind: 'big', n: 1, auto: true });
    // 서든데스 (215초): 세 묶음
    shift = 215e3;
    b.emit('hp', { hp: 300, max: 300, kills: 60, wave: 8 }); await wait(40);
    assert.equal((await b.call('send', { kind: 'small' })).ok, true);
    await until(() => a.got.incoming.some((x) => x.kind === 'small'));
    assert.ok(a.got.incoming.some((x) => x.kind === 'small' && x.n === 3), '서든데스: 세 묶음');
    a.close(); b.close();
  } finally { for (const so of opened) so.close(); await srv.close(); }
});

test('서버: AI 상대도 같은 미니 화면 점을 0.5초마다 (반 틱) 보낸다', async () => {
  const srv = createServer({ port: 0, lbpvp: { botAfterMs: 50, aiNoticeMs: 0, graceMs: 2000, sendDelayMs: 20, countdownMs: 20, botTickMs: 600 } });
  const port = await srv.listen();
  const s = connect(`http://127.0.0.1:${port}/lbpvp`, { transports: ['websocket'], forceNew: true, auth: { gid: 'aisnapguest1' } });
  s.got = {}; for (const ev of ['match', 'opp']) s.on(ev, (v) => { (s.got[ev] = s.got[ev] || []).push(v); });
  try {
    await srv.lbPvp.simReady;
    await until(() => s.connected);
    await new Promise((r) => s.emit('queue', { deck: ['staff'], power: 1500 }, r));
    await until(() => s.got.match, 3000);
    assert.ok(s.got.match[0].opp.ai, 'AI 상대');
    await until(() => s.got.opp && s.got.opp.length >= 2, 4000);
    assert.ok(s.got.opp.every((o) => Array.isArray(o.ep) && o.ep.length <= 40), '점 배열');
    const t = s.got.opp.length; await wait(2400);
    assert.ok(s.got.opp.length - t >= 6, `틱(0.6초)마다 두 번 — 2.4초에 8번꼴 (${s.got.opp.length - t}번 · 한 번씩이면 4번)`);
  } finally { s.close(); await srv.close(); }
});
