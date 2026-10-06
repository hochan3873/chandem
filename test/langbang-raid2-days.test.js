'use strict';
// 건물주 레이드 요일 건물주: KST 요일 → 건물주 · 판 시작 기록에 요일 · 마스터만 요일 고르기 · 요일마다 전투가 돌고 패턴이 전부 정의돼 있다
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const imp = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let R2, RS, S;
test.before(async () => { [R2, RS, S] = await Promise.all([imp('raid2.js'), imp('raid2-sim.js'), imp('sim.js')]); });

test('요일 건물주: KST 요일마다 다른 건물주 (월 관리비 · 일 보증금)', () => {
  assert.equal(R2.DAY_IDS.length, 7);
  const mon = Date.UTC(2026, 9, 5, 3); // 2026-10-05 12시 KST = 월요일
  for (let i = 0; i < 7; i++) assert.equal(R2.dayOf(mon + i * 86400e3), R2.DAY_IDS[i]);
  assert.equal(R2.dayOf(Date.UTC(2026, 9, 4, 15, 30)), 'mon'); // 일요일 15:30 UTC = 월요일 00:30 KST
  for (const id of R2.DAY_IDS) {
    const d = R2.DAYS[id];
    assert.ok(d.name && d.gimmick && d.counter && d.rec.length >= 3, id);
    for (const k of RS.dayPats(id)) { assert.ok(R2.anyPattern(k), `${id} 패턴 ${k} 안내`); assert.ok(RS.PAT[k], `${id} 패턴 ${k} 숫자`); }
  }
});

test('판 시작: 서버 시계로 요일을 적고 · 마스터만 요일을 고를 수 있다', () => {
  const lb = { maxStage: 12, raid2: R2.emptyR2() };
  const now = Date.UTC(2026, 9, 7, 3); // 수요일
  const s = R2.newBoss(0, 1, 20, now);
  const r = R2.r2Start(lb, s, 'run1', now, { free: true });
  assert.equal(r.day, 'wed'); assert.equal(lb.raid2.run.dy, 'wed');
  const r2 = R2.r2Start(lb, s, 'run2', now, { free: true, day: 'sat' });
  assert.equal(r2.day, 'sat');
  const back = {}; R2.normRaid2({ raid2: lb.raid2 }, back);
  assert.equal(back.raid2.run.dy, 'sat');
});

test('요일마다 전투가 끝까지 돈다 (기술 · 소환 · 쓰러짐 게이지 · 독)', () => {
  const deck = ['hochan', 'ara', 'gunman', 'gunnyeo', 'jungmin', 'dohoon'];
  for (const day of R2.DAY_IDS) {
    let seed = 7;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const g = S.createGame({ H: 760, rng, mode: 'stage', deck, join: true, tempo: true, weekly: RS.waveDef(1), raid: { sec: R2.R2.sec }, slots: 6 });
    RS.attach(g, { tier: 1, diff: 'hell', day, hp: { body: 0.2 }, max: { body: 1 } });
    const seen = new Set();
    while (!g.over && g.t < 200) {
      S.step(g, 1 / 30);
      for (const e of g.events) if (e.type && e.type.startsWith('r2')) seen.add(e.type);
      g.events.length = 0;
      if (g.pendingLevels > 0) { const c = S.rollCards(g); S.applyCard(g, c[0]); g.pendingLevels--; }
      for (const h of g.heroes) if (S.skillReady(h)) S.castSkill(g, h, g.r2.parts.body.x, g.r2.parts.body.y);
    }
    assert.ok(g.over, `${day}: 입구가 결국 무너진다`);
    const rep = RS.report(g);
    assert.equal(rep.day, day);
    assert.ok(rep.total > 0, `${day}: 피해가 들어간다`);
    assert.ok(Object.keys(g.r2.pats).some((k) => !['slam', 'combo', 'sweep', 'bills', 'grab', 'seal', 'cash', 'evict'].includes(k)), `${day}: 그날 기술을 쓴다 ${JSON.stringify(g.r2.pats)}`);
    assert.ok(seen.has('r2Wind'), `${day}: 예고가 있다`);
  }
});

test('예고 끊기: 제어 멤버 스킬은 두 칸 · 기절로 끊으면 역공 찬스', () => {
  const g = S.createGame({ H: 760, rng: () => 0.5, mode: 'stage', deck: ['staff', 'ara'], tempo: true, weekly: RS.waveDef(1), raid: { sec: R2.R2.sec }, slots: 6 });
  RS.attach(g, { tier: 1, diff: 'normal', day: 'tue' });
  for (let i = 0; i < 300; i++) { S.step(g, 1 / 30); g.events.length = 0; }
  RS.forcePattern(g, 'contract');
  assert.equal(g.r2.act.st, 'wind');
  const e = g.r2.parts.body, staff = g.heroes.find((h) => h.id === 'staff');
  g._inSkill = true; g.r2.onHit(g, e, 10, staff); g._inSkill = false;
  assert.equal(g.r2.act, null, '운영진(제어) 스킬 한 번 = 두 칸 → 보통 난이도는 바로 끊긴다');
  assert.equal(g.r2.ccCuts, 1);
  assert.ok(g.r2.punishT > 0 && e.weakT > 0);
});
