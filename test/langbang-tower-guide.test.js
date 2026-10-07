'use strict';
// 진상의 탑 초보 가이드: 역할 · 이 층 공략 (위험마다 쉬운 말 · 할 일 · 내 멤버 중 추천 · 없으면 이렇게) · 탑 튜토리얼 레슨
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, G, A, T;
test.before(async () => { D = await load('data.js'); G = await load('tower-guide.js'); A = await load('tower-arena.js'); T = await load('tutorial.js'); });

test('역할: 힐러 · 탱커 · 해제/면역 · 딜러 — 모든 멤버가 하나씩 · 끊기 멤버는 딱지', () => {
  assert.equal(G.roleOf('gunnyeo'), 'healer');
  assert.equal(G.roleOf('jungmin'), 'healer');
  assert.equal(G.roleOf('wonsik'), 'tank');
  assert.equal(G.roleOf('jeongseob'), 'tank');
  assert.equal(G.roleOf('soyoung'), 'support');
  assert.equal(G.roleOf('myunghoon'), 'dealer');
  for (const id of Object.keys(D.HEROES)) { const r = G.roleOf(id); assert.ok(G.ROLES[r], `${id} 역할`); assert.ok(G.roleLine(id).length > 4); }
  assert.ok(G.roleTags('staff').some((t) => t.k === 'cut'));
  assert.ok(G.roleTags('dragon').some((t) => t.k === 'support'), '박나영: 팀 빙결 저항 딱지');
  for (const id of G.CUTTERS) assert.ok(D.HEROES[id], id);
});

test('위험 설명: 8가지 + 피해만 · 모두 쉬운 말 한 줄 · 할 일 · 없으면 이렇게', () => {
  for (const k of [...A.HZ_IDS, 'hit']) {
    const h = G.HZ_GUIDE[k];
    assert.ok(h && h.what && h.how && h.act.length, k);
    for (const a of h.act) assert.ok(G.ACTS[a], `${k} 할 일 ${a}`);
    if (k !== 'hit') assert.ok(h.alt.startsWith(`${A.HZ[k].name}에 강한 멤버가 없으면`), `${k} 없으면`);
  }
  assert.ok(G.HZ_GUIDE.shock.act.includes('spread'), '감전 = 흩어지기');
  assert.deepEqual(G.WIND_GUIDE.act, ['group', 'cut'], '기 모으기 = 모이기 · 끊기');
  assert.equal(G.TIER_EASY.length, A.TIERS.length);
});

test('이 층 공략: 감전 층 → 서명훈 (감전 저항 70%) 추천 · 흩어지기 · 힐러 같이', () => {
  const f = 32; // 31~50 층마다 위험 하나 (HZ_IDS 돌아가며: 32층 = 감전)
  assert.deepEqual(A.floorPlan(f).kinds, ['shock']);
  const g = G.floorGuide(f, ['myunghoon', 'gunnyeo', 'jiwon', 'hanna', 'wonsik']);
  assert.equal(g.hazards[0].kind, 'shock');
  assert.ok(g.hazards[0].act.includes('spread'));
  assert.equal(g.hazards[0].best[0].id, 'myunghoon');
  assert.equal(g.picks[0].id, 'myunghoon');
  assert.match(g.picks[0].why, /감전 저항 70%/);
  assert.ok(g.party.includes('gunnyeo'), '힐러');
  assert.equal(g.party.length, 3);
  assert.equal(new Set(g.party).size, 3);
  assert.equal(g.alts.length, 0, '다 있으면 "없으면 이렇게" 없음');
});

test('이 층 공략: 팀 면역 서포터 (홍정민 독 면역) · 기 모으기 층은 끊는 멤버 · 가진 멤버만', () => {
  const fp = 31 + A.HZ_IDS.indexOf('poison');
  const g = G.floorGuide(fp, ['jungmin', 'staff', 'hanna']);
  assert.equal(g.picks[0].id, 'jungmin');
  assert.match(g.picks[0].why, /팀 전체 독 면역/);
  const fw = 51; // 위험 둘 + 기 모으기
  const g2 = G.floorGuide(fw, ['staff', 'hanna', 'gunman']);
  assert.ok(g2.wind, '기 모으기 안내');
  assert.ok(g2.picks.some((p) => p.id === 'staff' && /끊기/.test(p.why)), '운영진: 기 모으기 끊기');
  for (const p of g2.picks) assert.ok(['staff', 'hanna', 'gunman'].includes(p.id), '안 가진 멤버는 추천 안 함');
});

test('없으면 이렇게: 저항 · 힐러 · 탱커 · 끊는 멤버가 없을 때 대신 할 일', () => {
  const g = G.floorGuide(32, ['hanna', 'jiwon']); // 감전에 강한 멤버 · 힐러 · 탱커 없음
  assert.ok(g.alts.some((a) => a.startsWith('감전에 강한 멤버가 없으면')));
  assert.ok(g.alts.some((a) => a.includes('힐러')));
  assert.ok(g.alts.some((a) => a.includes('탱커')));
  const g2 = G.floorGuide(55, ['hanna', 'gunman', 'gunnyeo']);
  assert.ok(g2.alts.some((a) => a.startsWith('끊는 멤버가 없으면')));
  const g3 = G.floorGuide(2, ['hanna']); // 연습 층: 대신 할 일 없음
  assert.deepEqual(g3.alts, []);
  assert.equal(g3.hazards.length, 0);
  assert.equal(G.floorGuide(5, []).party.length, 0, '멤버가 없으면 추천도 없음');
});

test('파티 경고: 11층부터 힐러 없으면 · 탱커 없으면 한 줄', () => {
  assert.equal(G.partyHint(5, ['hanna']), '');
  assert.match(G.partyHint(15, ['hanna', 'gunman', 'staff']), /힐러/);
  assert.match(G.partyHint(15, ['hanna', 'gunman', 'gunnyeo']), /탱커/);
  assert.equal(G.partyHint(15, ['wonsik', 'gunman', 'gunnyeo']), '');
});

test('탑 튜토리얼 레슨: 로비 → 연습 층 순서 · 실제 동작(끌기 · 회피 · 끊기)으로 넘어간다 · 다른 화면에선 안 뜬다', () => {
  const st = T.tutNew();
  const L = G.TOWER_LESSONS;
  assert.equal(T.pickLesson(st, { where: 'tower' }, false, L).id, 'twlobby');
  assert.equal(T.pickLesson(st, { where: 'play', prac: true }, false, L).id, 'twprac');
  assert.equal(T.pickLesson(st, { where: 'play' }, false, L), null, '진짜 탑 판에선 안 뜬다');
  assert.equal(T.pickLesson(st, { where: 'menu' }, false, L), null);
  assert.equal(T.pickLesson(st, { where: 'tower' }), null, '기본 레슨 목록엔 탑이 없다');
  const pr = L.find((l) => l.id === 'twprac');
  const on = Object.fromEntries(pr.beats.filter((b) => b.on).map((b) => [b.id, b.on]));
  assert.deepEqual(on, { drag: 'twaMove', tele: 'twaDodge', wind: 'twaCut' });
  assert.ok(pr.beats.find((b) => b.id === 'tele').say.includes('빨간 원'));
  const lob = L.find((l) => l.id === 'twlobby');
  assert.ok(lob.beats.some((b) => b.at === '[data-act="twPractice"]' && b.tap === 'target'));
  // 끄면 아무것도 · 다시 보기는 탑 레슨만
  assert.equal(T.pickLesson(T.tutFromList(['@off']), { where: 'tower' }, false, L), null);
  const done = T.markLesson(T.markLesson(T.tutNew(), L[0]), L[1]);
  assert.equal(T.pickLesson(done, { where: 'tower' }, false, L), null);
});
