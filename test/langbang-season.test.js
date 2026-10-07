'use strict';
// 랑방 시즌 테마: 한국 시간 기간 판정 (양 끝 포함 · 해 넘김) · 끝나는 시각
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let SS;
test.before(async () => { SS = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'season.js')).href); });
const kst = (y, m, d, h = 12) => Date.UTC(y, m - 1, d, h) - 9 * 3600e3; // 한국 시간 y-m-d h시

test('할로윈: 10/7 0시 ~ 11/2 24시 (한국 시간)', () => {
  assert.equal(SS.seasonAt(kst(2026, 10, 6, 23)), null);
  assert.equal(SS.seasonAt(kst(2026, 10, 7, 0)).id, 'halloween');
  assert.equal(SS.seasonAt(kst(2026, 10, 31)).id, 'halloween');
  assert.equal(SS.seasonAt(kst(2026, 11, 2, 23)).id, 'halloween');
  assert.equal(SS.seasonAt(kst(2026, 11, 3, 0)), null);
  assert.equal(SS.seasonEnd(SS.SEASONS[0], kst(2026, 10, 20)), kst(2026, 11, 3, 0));
});

test('해를 넘기는 시즌 (예: 크리스마스 12/20 ~ 1/2)', () => {
  const xmas = [{ id: 'xmas', from: [12, 20], to: [1, 2] }];
  assert.equal(SS.seasonAt(kst(2026, 12, 19), xmas), null);
  assert.equal(SS.seasonAt(kst(2026, 12, 25), xmas).id, 'xmas');
  assert.equal(SS.seasonAt(kst(2027, 1, 2), xmas).id, 'xmas');
  assert.equal(SS.seasonAt(kst(2027, 1, 3), xmas), null);
  assert.equal(SS.seasonEnd(xmas[0], kst(2026, 12, 25)), kst(2027, 1, 3, 0));
  assert.equal(SS.seasonEnd(xmas[0], kst(2027, 1, 1)), kst(2027, 1, 3, 0));
});
