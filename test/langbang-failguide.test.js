'use strict';
// 랑방 실패 공략 카드: 필요 목록 · 내 멤버 먼저 · 못 가진 멤버는 얻는 법 · 추천 덱이 못 막는 걸 채움 · 기록 저장/지우기
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let F, D;
test.before(async () => {
  const dir = path.join(__dirname, '..', 'public', 'langbang');
  F = await import(pathToFileURL(path.join(dir, 'failguide.js')).href);
  D = await import(pathToFileURL(path.join(dir, 'data.js')).href);
});
const base = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
const run28 = { doorBy: { mukti: 300, boss_inpi: 100 }, hitBy: { stun: 5, charm: 3 }, t: 154, wave: 3, totalWaves: 5, ccSec: 24 };

test('필요 목록: 실제로 많이 걸린 상태이상이 맨 앞 · 최대 3개 · 각각 맞는 멤버 목록이 있다', () => {
  const n = F.guideNeeds(28, false, run28);
  assert.ok(n.length >= 1 && n.length <= 3);
  assert.equal(n[0].key, 'st:stun');
  assert.deepEqual(n[0].counter, D.EST.stun.counter.filter((h) => D.HEROES[h]));
  assert.ok(n.some((x) => x.key === 'st:charm'));
  // 걸린 기록이 없으면 스테이지 기믹으로
  const g = F.guideNeeds(28, false, null);
  assert.ok(g.length >= 1 && g.every((x) => x.counter.length));
});

test('내 멤버가 먼저 · 못 가진 멤버는 얻는 법(획득 규정)이 붙는다', () => {
  const need = F.guideNeeds(28, false, run28)[0];
  const own = [...base, 'dohoon', 'sunggu'];
  const c = F.counterChips(need, own, { heroes: { sunggu: 8, dohoon: 2 } }, ['gunnyeo']);
  assert.ok(c.mine.length >= 1 && c.mine.every((x) => x.own));
  assert.equal(c.mine.find((x) => x.id === 'gunnyeo').inDeck, true);
  assert.equal(c.mine[0].id, 'sunggu'); // 센 순서 (등급 · 강화)
  assert.ok(c.miss.every((x) => !x.own && x.how.length > 0));
  assert.match(F.howToGet('hanna'), /2-5/);
  assert.match(F.howToGet('wonsik'), /모집/);
  assert.match(F.howToGet('hochan'), /4-10/);
  assert.match(F.howToGet('gunman'), /처음부터/);
});

test('추천 덱: 덱에 없는 필요를 가진 멤버로 채우고 · 안 가진 멤버는 넣지 않고 · 칸 수를 안 넘는다', () => {
  const own = [...base, 'dohoon', 'sunggu', 'jungmin'];
  const needs = F.guideNeeds(28, false, run28);
  const deck = F.recommendFixDeck(28, false, own, 5, ['bangjang', 'staff', 'gunman'], {}, run28);
  assert.ok(deck.length <= 5 && deck.length >= 1);
  assert.equal(new Set(deck).size, deck.length);
  assert.ok(deck.every((id) => own.includes(id)));
  for (const n of needs) if (n.counter.some((h) => own.includes(h))) assert.ok(deck.some((id) => n.counter.includes(id)), `${n.key} 를 막는 멤버가 덱에 있어야 해요`);
  assert.ok(deck.includes('bangjang') || deck.length === 5); // 대장은 그대로
});

test('공략 전체: 못 막는 필요를 먼저 · 강화 부족 · 안 낀 장비 · 팁 · 추천 덱', () => {
  const own = [...base, 'dohoon'];
  const gd = F.buildFailGuide({ stage: 28, hell: false, run: run28, ownedIds: own, deckIds: ['bangjang', 'staff', 'gunman'], slots: 5, p: { heroes: { bangjang: 2, staff: 2, gunman: 3 }, equip: {}, gear: [{ id: 1 }, { id: 2 }] } });
  assert.match(gd.cause, /먹튀|입구/);
  assert.match(gd.cause, /기절 5번/);
  assert.match(gd.cause, /2:34/);
  assert.ok(gd.needs.length >= 1 && gd.needs.length <= 2);
  assert.equal(gd.up.rec, D.recMeta(28, false));
  assert.equal(gd.up.low, true);
  assert.equal(gd.gear.hint, true);
  assert.ok(gd.tips.length >= 1 && gd.tips.length <= 2);
  assert.equal(gd.recDiffers, true);
  assert.ok(gd.recDeck.includes('gunnyeo') || gd.recDeck.includes('dohoon')); // 기절 푸는 멤버
  // 이미 충분히 강하고 장비도 다 낀 덱이면 강화 · 장비 줄은 없다
  const strong = F.buildFailGuide({ stage: 28, hell: false, run: null, ownedIds: own, deckIds: ['bangjang', 'staff'], slots: 5, p: { heroes: { bangjang: 20, staff: 20 }, equip: { bangjang: { w: 1, a: 2 }, staff: { w: 3, a: 4 } }, gear: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }] } });
  assert.equal(strong.up.low, false);
  assert.equal(strong.gear.hint, false);
});

test('판 요약 저장: slimRun 은 입구 친 진상 4종 · 걸린 상태이상 · 시각만 · 기록은 새로 지고 이기면 지운다', () => {
  const g = { t: 99.4, wave: 2, totalWaves: 5, stats: { doorBy: { a1: 5, mukti: 80, cutter: 30, x: 2, y: 1, z: 0.2 }, hitBy: { stun: 3, charm: 0 } }, cstat: { ccSec: 12.34 } };
  const r = F.slimRun(g, 12);
  assert.ok(Object.keys(r.doorBy).length <= 4 && r.doorBy.mukti === 80 && !('z' in r.doorBy));
  assert.deepEqual(r.hitBy, { stun: 3 });
  assert.equal(r.t, 99); assert.equal(r.ccSec, 12.3);
  let s = F.failStore({}, 12, false, r);
  s = F.failStore(s, 12, false, r);
  assert.equal(s[F.failKey(12, false)].n, 2);
  assert.ok(F.failKey(12, true) !== F.failKey(12, false));
  s = F.failClear(s, 12, false);
  assert.equal(s[F.failKey(12, false)], undefined);
  // 오래된 기록은 40개까지만
  let big = {}; for (let i = 1; i <= 50; i++) { big = F.failStore(big, i, false, r); big[F.failKey(i, false)].at = i; }
  assert.ok(Object.keys(F.failStore(big, 60, false, r)).length <= 40);
});

test('화면 연결: game.js 가 카드를 그리고 · 추천 덱 버튼 · 이기면 기록 지움 · index 의 importmap · sim 이 숫자를 센다', () => {
  const fs = require('node:fs');
  const dir = path.join(__dirname, '..', 'public', 'langbang');
  const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8'), sim = fs.readFileSync(path.join(dir, 'sim.js'), 'utf8');
  assert.match(game, /fgCardHtml\(app\.fg, false\)/);
  assert.match(game, /data-act="fgDeck"/);
  assert.match(game, /fgPrepHtml\(s, hellOn\)/);
  assert.match(game, /FG\.failClear/);
  assert.match(html, /failguide\.css/);
  assert.match(html, /"\/langbang\/failguide\.js": "\/langbang\/failguide\.js\?v=/);
  assert.match(sim, /g\.stats\.doorBy/);
  assert.match(sim, /g\.stats\.hitBy/);
});
