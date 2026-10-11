'use strict';
// 장비 드롭 사다리 · 천장 · ★ 보너스 (data.js = 화면, langbang-rules.js = 서버가 같은 식)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const R = require('../server/langbang-rules');
const lb = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);

function share(D, stage, n = 4000) {
  const c = { common: 0, rare: 0, epic: 0, legend: 0 };
  for (let i = 0; i < n; i++) for (const d of D.rollDrops(i * 7919 + 3, stage, 1, false, false, false, null)) c[d.r]++;
  const t = Object.values(c).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v / t]));
}

test('장비 드롭: 장이 오를수록 일반이 줄고 영웅 이상이 는다 · 5장부터 일반은 거의 없다', async () => {
  const D = await lb('data.js');
  const pc = [5, 25, 35, 45, 55, 65, 75].map((s) => share(D, s));
  for (let i = 1; i < pc.length; i++) {
    assert.ok(pc[i].common <= pc[i - 1].common + 0.02, `일반 ${i}`);
    assert.ok(pc[i].epic + pc[i].legend >= pc[i - 1].epic + pc[i - 1].legend - 0.02, `영웅+ ${i}`);
  }
  assert.ok(pc[3].common < 0.12 && pc[3].epic > 0.2, `5장 ${JSON.stringify(pc[3])}`);
  assert.ok(pc[6].legend > 0.03 && pc[6].epic > 0.3, `7장 ${JSON.stringify(pc[6])}`);
});

test('장비 드롭: 보스 스테이지는 첫 장비 등급 하한 · 5장부터 x-5 도 영웅 이상', async () => {
  const D = await lb('data.js');
  const rank = (r) => ['common', 'rare', 'epic', 'legend'].indexOf(r);
  const min = (stage) => { let m = 9; for (let i = 0; i < 600; i++) m = Math.min(m, rank(D.rollDrops(i * 31 + 7, stage, 1, false, false)[0].r)); return m; };
  assert.equal(min(10), 1); assert.equal(min(35), 1); assert.equal(min(40), 2); assert.equal(min(45), 2); assert.equal(min(80), 2);
});

test('장비 드롭: 천장 — 영웅 이상 10개째 · 전설 40개째 확정 (3장 · 5장부터) · 센 값을 갱신', async () => {
  const D = await lb('data.js');
  for (const M of [D, R]) {
    const p = { ep: 0, lg: 0 };
    let sinceE = 0, maxE = 0, sinceL = 0, maxL = 0;
    for (let i = 0; i < 3000; i++) {
      for (const d of M.rollDrops(i * 131 + 5, 42, 1, false, false, false, p)) {
        sinceE = d.r === 'epic' || d.r === 'legend' ? 0 : sinceE + 1;
        sinceL = d.r === 'legend' ? 0 : sinceL + 1;
        maxE = Math.max(maxE, sinceE); maxL = Math.max(maxL, sinceL);
      }
    }
    assert.ok(maxE < 10, `영웅 최장 ${maxE}`);
    assert.ok(maxL < 40, `전설 최장 ${maxL}`);
    const q = { ep: 0, lg: 0 };
    M.rollDrops(1, 12, 1, false, false, false, q);
    assert.deepEqual(q, { ep: 0, lg: 0 }, '1~2장은 천장 안 셈');
  }
});

test('장비 드롭: 화면(data.js) 과 서버(langbang-rules.js) 가 같은 결과', async () => {
  const D = await lb('data.js');
  for (const stage of [3, 10, 22, 35, 40, 45, 60, 70, 80]) {
    for (let i = 0; i < 40; i++) {
      const a = { ep: i % 10, lg: i % 40 }, b = { ep: i % 10, lg: i % 40 };
      assert.deepEqual(D.rollDrops(i * 977 + stage, stage, 3, i % 3 === 0, i % 7 === 0, i % 5 === 0, a), R.rollDrops(i * 977 + stage, stage, 3, i % 3 === 0, i % 7 === 0, i % 5 === 0, b));
      assert.deepEqual(a, b);
    }
  }
});

test('★: 하나마다 +10% · ★3 · ★5 에서 +4% 씩 더 · 전투력 식도 같다', async () => {
  const D = await lb('data.js'), L = await lb('live.js');
  assert.equal(L.STAR_ATK, 0.1);
  const exp = { 1: 0, 2: 0.1, 3: 0.24, 4: 0.34, 5: 0.48 };
  for (const [s, v] of Object.entries(exp)) {
    assert.ok(Math.abs(L.starBonus(+s) - v) < 1e-9, `★${s}`);
    assert.ok(Math.abs(D.starPowerMul(+s) - (1 + v)) < 1e-9, `전투력 ★${s}`);
  }
});
