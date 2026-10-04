'use strict';
// 랑방 길 안내(코치): 할 일 종류마다 누를 곳 단계 · 이미 그 화면이면 앞 단계 건너뛰기 · 모르는 종류는 null
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let G;
test.before(async () => { G = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'guide.js')).href); });
const st = (screen, sels = []) => ({ screen, hasSel: (q) => sels.some((s) => q.split(',').map((x) => x.trim()).includes(s)) });

test('멤버 강화: 강화 탭 → 그 멤버 카드 → 강화 탭 → 강화 버튼 (마지막)', () => {
  const p = G.planFor({ go: 'hero', id: 'staff', name: '운영진' }, st('menu'));
  assert.equal(p.steps.length, 4);
  assert.match(p.steps[0].sel, /data-tab="deck"/);
  assert.match(p.steps[1].sel, /data-id="staff"/);
  assert.ok(p.steps[3].last && /hs-up/.test(p.steps[3].sel));
  assert.match(p.title, /운영진/);
  assert.equal(p.steps[0].skip(), false);
  // 이미 강화 탭이면 첫 단계 건너뜀 · 강화 화면이 떠 있으면 강화 탭 단계도 건너뜀
  assert.equal(G.planFor({ go: 'hero', id: 'staff' }, st('deck')).steps[0].skip(), true);
  assert.equal(G.planFor({ go: 'hero', id: 'staff' }, st('deck', ['.hero-full .hs-up'])).steps[2].skip(), true);
});

test('★승급은 승급 버튼으로 끝난다', () => {
  const p = G.planFor({ go: 'star', id: 'staff', name: '운영진' }, st('menu'));
  assert.ok(/hs-star/.test(p.steps[p.steps.length - 1].sel));
});

test('장비 강화: 장비 탭 → 멤버 → 칸 → 낀 장비 → 강화 · 장비 바꾸기는 장착으로 끝', () => {
  const e = G.planFor({ go: 'enh', id: 'staff', slot: 'w', gid: 3, name: '운영진' }, st('menu'));
  assert.deepEqual(e.steps.map((s) => !!s.last), [false, false, false, false, true]);
  assert.match(e.steps[2].sel, /data-slot="w"/);
  assert.match(e.steps[4].sel, /eqEnh/);
  const g = G.planFor({ go: 'gear', id: 'staff', slot: 'a', gid: 7, name: '운영진' }, st('menu'));
  assert.match(g.steps[3].sel, /data-id="7"/);
  assert.ok(g.steps[3].optional);
  assert.match(g.steps[4].sel, /eqDo/);
});

test('우편 · 미션 · 출석 · 상자 · 모집도 단계가 있다 (우편은 "모두 받기" 먼저)', () => {
  const m = G.planFor({ go: 'mail' }, st('menu'));
  assert.equal(m.steps[0].skip(), true); // 이미 로비
  assert.ok(Array.isArray(m.steps[2].sel) && /all/.test(m.steps[2].sel[0]));
  assert.equal(G.planFor({ go: 'mail' }, st('bag')).steps[0].skip(), false);
  for (const go of ['missions', 'checkin', 'chest', 'recruit']) { const p = G.planFor({ go }, st('menu')); assert.ok(p && p.steps.length >= 2 && p.steps[p.steps.length - 1].last, go); assert.equal(p.done.length, 2); }
});

test('모르는 할 일은 null (예전처럼 바로 그 화면으로)', () => {
  assert.equal(G.planFor({ go: 'friends' }, st('menu')), null);
  assert.equal(G.planFor(null), null);
});
