'use strict';
// 찬덤 홀덤 지갑 · 실력 티어
const test = require('node:test');
const assert = require('node:assert/strict');
const { Hand } = require('../server/engine/hand');
const bot = require('../server/bot');
const { createHoldemPro, handFeatures, evaluate, emptyStats, addHand, BASE } = require('../server/holdem-pro');

// 성향이 뚜렷한 가짜 선수들로 판을 많이 돌려, 티어 점수가 실력 순서대로 나오는지 본다
function simulate(hands = 600) {
  const kinds = { tag1: 'tag', tag2: 'tag', st1: 'station', st2: 'station', man1: 'maniac', man2: 'maniac' };
  const stacks = Object.fromEntries(Object.keys(kinds).map((k) => [k, 2000]));
  const stats = Object.fromEntries(Object.keys(kinds).map((k) => [k, emptyStats()]));
  const rstats = {};
  for (let i = 0; i < hands; i++) {
    const ids = Object.keys(kinds);
    for (const id of ids) if (stacks[id] < 400) stacks[id] = 2000; // 다시 채움
    const h = new Hand({ players: ids.map((id) => ({ id, stack: stacks[id] })), dealerIndex: i % ids.length, sb: 10, bb: 20 });
    let g = 0;
    while (!h.finished && g++ < 200) {
      const id = h.currentId; const la = h.legalActions(id); const k = kinds[id];
      let a;
      if (k === 'tag') a = bot.decide(h, id, bot.STYLES[0], rstats);
      else if (k === 'station') a = { type: la.canCheck ? 'check' : 'call' };
      else a = la.canRaise || la.canBet ? { type: la.canBet ? 'bet' : 'raise', amount: Math.min(la.maxTo, la.minTo * 2) } : { type: la.canCheck ? 'check' : 'call' };
      try { h.act(id, a); } catch { h.act(id, { type: la.canCheck ? 'check' : 'fold' }); }
    }
    for (const id of ids) { const f = handFeatures(h, id); if (f) addHand(stats[id], f); stacks[id] = h.seatOf(id).stack; }
  }
  return Object.fromEntries(Object.entries(stats).map(([id, st]) => [id, evaluate(st)]));
}

test('티어 점수: 신중한(TAG) 선수 > 콜만 하는 선수 · 스타일 이름도 맞게', () => {
  const ev = simulate(250);
  const avg = (a, b) => (ev[a].score + ev[b].score) / 2;
  const tag = avg('tag1', 'tag2'); const st = avg('st1', 'st2'); const man = avg('man1', 'man2');
  console.log('  점수 TAG', tag, '· 콜만', st, '· 매번 레이즈', man);
  console.log('  ', ev.tag1.tier && ev.tag1.tier.name, ev.tag1.style, JSON.stringify(ev.tag1.parts), '|', ev.st1.tier && ev.st1.tier.name, ev.st1.style, JSON.stringify(ev.st1.parts), '|', ev.man1.tier && ev.man1.tier.name, ev.man1.style);
  assert.ok(tag > st, 'TAG 가 콜만 하는 선수보다 높아야');
  assert.equal(ev.st1.style, '따라가기형');
  assert.ok(ev.tag1.stats.vpip < ev.st1.stats.vpip);
});

test('지갑: 기본금으로 시작 · 바이인/캐시아웃 · 기본금 아래면 하루 3번 충전', () => {
  let T = Date.UTC(2026, 9, 15, 3);
  const pro = createHoldemPro({ now: () => T });
  const guest = { id: 'guestABCDEFGH', key: 'k'.repeat(20) };
  assert.equal(pro.me({ guest }, '호찬').wallet, BASE);
  const b = pro.buyIn({ guest }, '호찬', 'town', 8000);
  assert.equal(b.amount, 8000);
  assert.equal(pro.me({ guest }).wallet, BASE - 8000);
  pro.cashOut(b.key, 3000);
  assert.equal(pro.me({ guest }).wallet, BASE - 5000);
  assert.throws(() => pro.buyIn({ guest }, '호찬', 'high', 100000), /모자라요/);
  for (let i = 0; i < 3; i++) { pro.buyIn({ guest }, '호찬', 'starter', 4000); pro.refill({ guest }); }
  assert.equal(pro.me({ guest }).refillsLeft, 0);
  pro.buyIn({ guest }, '호찬', 'starter', 4000);
  assert.throws(() => pro.refill({ guest }), /3번/);
  T += 24 * 3600 * 1000; // 다음 날
  assert.equal(pro.refill({ guest }).wallet, BASE);
  // 다른 열쇠로 같은 손님 id 는 못 씀
  assert.equal(pro.me({ guest: { id: guest.id, key: 'x'.repeat(20) } }), null);
});

test('손님으로 쌓은 기록·칩은 로그인하면 계정으로 옮겨 간다 (한 번만)', () => {
  const pro = createHoldemPro();
  const guest = { id: 'guestZZZZ1234', key: 'q'.repeat(24) };
  const user = { id: 'U1', nickname: '호찬' };
  const b = pro.buyIn({ guest }, '호찬', 'starter', 1000);
  // 판 하나를 쳐서 기록
  const h = new Hand({ players: [{ id: 'me', stack: 1000 }, { id: 'b1', stack: 1000 }], dealerIndex: 0, sb: 10, bb: 20 });
  h.act(h.currentId, { type: 'fold' });
  pro.recordHand(b.key, h, 'me');
  pro.cashOut(b.key, 3000);
  const r = pro.merge(user, guest);
  assert.equal(r.merged, true);
  assert.equal(r.stats.hands, 1);
  assert.equal(pro.me({ user }).wallet, BASE + 2000);
  assert.equal(pro.merge(user, guest).merged, false, '두 번 옮기지 않음');
});

test('연습 테이블: 지갑에서 바이인 → 상주 플레이어 칩은 제각각 → 나가면 남은 칩이 지갑으로', async () => {
  const { io: connect } = require('socket.io-client');
  const { createServer } = require('../server/index');
  const srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  const port = await srv.listen();
  const base = `http://127.0.0.1:${port}`;
  const post = async (path, body) => (await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  const guest = { id: 'guestTEST0001', key: 'z'.repeat(24) };
  try {
    const m0 = await post('/api/holdem/me', { guest, name: '호찬' });
    assert.equal(m0.me.wallet, BASE);
    assert.ok(m0.tables.length >= 4);
    const s = connect(base, { transports: ['websocket'], forceNew: true });
    s.last = null; s.on('state', (v) => { s.last = v; });
    const call = (ev, d) => new Promise((r) => s.emit(ev, d, r));
    const r = await call('room:practice', { name: '호찬', table: 'town', buyIn: 6000, guest });
    assert.equal(r.ok, true, r.message);
    const t0 = Date.now(); while (!s.last && Date.now() - t0 < 3000) await new Promise((x) => setTimeout(x, 20));
    assert.equal(s.last.players.length, 5); // 6인 테이블: 실제처럼 빈자리 하나
    const bots = s.last.players.filter((p) => p.isBot);
    assert.ok(new Set(bots.map((p) => p.stack + p.bet)).size > 1, '상주 플레이어 칩이 제각각');
    assert.equal((await post('/api/holdem/me', { guest })).me.wallet, BASE - 6000);
    const mine = s.last.players.find((p) => p.id === s.last.me.id);
    await call('room:leave');
    const after = (await post('/api/holdem/me', { guest })).me.wallet;
    assert.ok(after > BASE - 6000 - 1 && after <= BASE - 6000 + mine.stack + 200, `나간 뒤 지갑 ${after}`);
    // 칩이 모자라면 못 들어감
    const r2 = await call('room:practice', { name: '호찬', table: 'high', guest });
    assert.equal(r2.ok, false);
    s.close();
  } finally { await srv.close(); }
});

test('고급 꾸미기: 그림 파일과 CSS 가 모두 있고 값은 기본보다 비싸다', () => {
  const fs = require('fs'); const path = require('path');
  const { SHOP } = require('../server/holdem-pro');
  const css = fs.readFileSync(path.join(__dirname, '../public/css/style.css'), 'utf8');
  const lux = SHOP.filter((x) => x.lux);
  assert.ok(lux.length >= 15);
  const plain = Math.max(...SHOP.filter((x) => !x.lux).map((x) => x.price));
  for (const it of lux) {
    assert.ok(it.price > plain, it.id);
    const key = it.kind === 'back' ? `body[data-back="${it.id}"] .card-back` : `body[data-felt="${it.id}"] .felt::before`;
    const rule = css.split('\n').find((l) => l.startsWith(key) && l.includes('url('));
    assert.ok(rule, `${it.id} CSS`);
    const img = rule.match(/url\('\/(img\/holdem\/cos\/[^']+)'\)/)[1];
    assert.ok(fs.existsSync(path.join(__dirname, '../public', img)), img);
  }
});
