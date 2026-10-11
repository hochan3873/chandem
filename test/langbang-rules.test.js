'use strict';
// 랑방 규칙 안내 체계: 모든 맵 효과 · 스테이지 조건 · 진상 특성 · 주간 특성에 규칙 설명 · 왜 중요해요 · 추천 멤버가 있다 · 한 번만 · 덱 판정
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const dir = path.join(__dirname, '..', 'public', 'langbang');
let RU, D;
test.before(async () => {
  D = await import(pathToFileURL(path.join(dir, 'data.js')).href);
  RU = await import(pathToFileURL(path.join(dir, 'rules.js')).href);
});

test('규칙 자료: 모든 맵 효과 · 조건 · 진상 특성 · 주간 특성 · 웨이브에 한 줄 규칙 + 왜 중요 + 추천 멤버', () => {
  for (const id of Object.keys(D.MAP_FX)) if (id !== 'none') assert.ok(RU.RULE['fx:' + id], '맵 효과 ' + id);
  for (const id of Object.keys(D.COND)) assert.ok(RU.RULE['cond:' + id], '조건 ' + id);
  for (const id of Object.keys(D.TRAITS)) assert.ok(RU.RULE['mech:' + id], '진상 특성 ' + id);
  for (const t of D.WEEK_TRAITS) assert.ok(RU.RULE['week:' + t.id], '주간 특성 ' + t.id);
  for (const k of ['S', 'E', 'M', 'B']) assert.ok(RU.RULE['wave:' + k], '웨이브 ' + k);
  assert.ok(RU.RULE['mech:armorpct'] && RU.RULE['mech:lock']);
  for (const r of RU.RULES) {
    assert.ok(r.rule && r.rule.length >= 10, r.id + ' 규칙');
    assert.ok(r.why && r.why.length >= 15, r.id + ' 왜 중요');
    assert.ok(r.pickLabel, r.id + ' 추천 이름');
    assert.ok(r.pick.length >= 1 && r.pick.every((h) => D.HEROES[h]), r.id + ' 추천 멤버');
    assert.ok(r.icon && (r.icon.img || r.icon.emoji), r.id + ' 아이콘');
    assert.ok(!/[ㄱ-ㅎ]{2}/.test(r.rule + r.why), r.id + ' 자음 줄임말');
  }
  assert.equal(new Set(RU.RULES.map((r) => r.id)).size, RU.RULES.length);
});

test('맵 효과 설명은 쉬운 말: 공사 중 = 길 양옆이 막혀서 가운데로 몰리고 범위 +30%', () => {
  assert.match(D.MAP_FX.construction.desc, /가운데로 몰려요/);
  assert.match(D.MAP_FX.construction.desc, /30%/);
  const cons = RU.RULE['fx:construction'];
  for (const h of ['eunok', 'baul', 'sunggu']) assert.ok(cons.pick.includes(h), h);
  for (const [id, f] of Object.entries(D.MAP_FX)) { if (id === 'none') continue; assert.ok(f.desc.length >= 12 && f.short, id); assert.ok(!/ -(\d)/.test(f.desc), id + ' 기호 마이너스 대신 말로'); }
});

test('스테이지별 규칙 목록: 3-3 은 공사 중 + 나오는 곳 목록 · 순서는 맵 효과가 먼저', () => {
  assert.ok(RU.stagesOf('fx:construction').includes(23));
  assert.match(RU.stagesText('fx:construction'), /3-3/);
  const ids = RU.ruleIdsForStage(23, false);
  assert.equal(ids[0], 'fx:construction');
  assert.ok(ids.every((id) => RU.RULE[id]));
  for (const s of [1, 14, 33, 60, 75]) for (const id of RU.ruleIdsForStage(s, true)) assert.ok(RU.RULE[id], s + ' ' + id);
  assert.equal(RU.ruleIdForFx('none'), null);
});

test('내 덱에 맞나요: 맞는 멤버 수 · 가진 멤버 먼저 · 못 가진 멤버는 뒤', () => {
  const r = RU.RULE['fx:construction'];
  const none = RU.fitOf(r, ['bangjang', 'eunok', 'baul'], ['bangjang', 'staff']);
  assert.equal(none.ok, false);
  assert.equal(none.have.length, 0);
  assert.equal(none.chips[0].st, 'own');
  const good = RU.fitOf(r, ['bangjang', 'eunok', 'baul'], ['bangjang', 'eunok', 'baul']);
  assert.equal(good.ok, true);
  assert.deepEqual(good.chips.slice(0, 2).map((c) => c.st), ['deck', 'deck']);
  assert.ok(good.chips.some((c) => c.st === 'no'));
});

test('한 번만 보여 주기: 본 규칙은 계정별로 기억 · 다시 안 나온다', () => {
  const mem = {};
  global.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  try {
    const ids = ['fx:rain', 'cond:rush'];
    assert.deepEqual(RU.unseenIds('나', ids), ids);
    RU.markSeen('나', 'fx:rain');
    assert.deepEqual(RU.unseenIds('나', ids), ['cond:rush']);
    assert.deepEqual(RU.unseenIds('너', ids), ids, '다른 계정은 따로');
    assert.ok(JSON.parse(mem['langbang:ruleSeen']).나['fx:rain']);
  } finally { delete global.localStorage; }
});

test('카드 HTML: 큰 아이콘 · 규칙 · 왜 중요해요 · 이런 멤버가 좋아요 · 나오는 곳', () => {
  const html = RU.cardHtml(RU.RULE['fx:construction'], { owned: ['eunok'], deck: ['eunok'], nameOf: (id) => D.HEROES[id].name });
  for (const w of ['공사 중', '왜 중요해요', '범위 공격 멤버', '최은옥', '나오는 곳', '3-3']) assert.ok(html.includes(w), w);
});

test('화면 연결: game.js 첫 만남 카드 · 전투 칩 · 준비 줄 · 도감 탭 · index 등록 · 버전', () => {
  const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8'), html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.match(game, /from '\.\/rules\.js'|import \* as RU from '\.\/rules\.js'/);
  for (const w of ['ruPrepCheck(', 'ruChipSync(', 'ruBattleOpen(', 'ruFxRow(', 'showRuleDex(', "data-tab=\"rule\"", 'ruOpen:', 'ruOk:']) assert.ok(game.includes(w), w);
  assert.match(html, /rules\.css\?v=/);
  assert.match(html, /"\/langbang\/rules\.js": "\/langbang\/rules\.js\?v=/);
  const v = html.match(/game\.js\?v=(\w+)/)[1];
  assert.notEqual(v, '20261021legend');
  assert.ok(!/-webkit-text-stroke|paint-order|background-clip:\s*text/.test(fs.readFileSync(path.join(dir, 'rules.css'), 'utf8')));
});
