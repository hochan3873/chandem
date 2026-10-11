'use strict';
// 권장 전투력 (10/23 정직하게): 스테이지마다 '대충 하는 사람이 약 2/3 이기는' 값 · 비율 판정 · 예상 클리어
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const dir = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);

test('권장 전투력: 1~80 모든 스테이지 · 보통 / 헬 보정 표가 있고 값이 말이 된다', async () => {
  const D = await load('data.js');
  for (let s = 1; s <= 80; s++) {
    for (const hell of [false, true]) {
      const adj = (hell ? D.REC_ADJ.hell : D.REC_ADJ.n)[s];
      assert.ok(adj >= 0.3 && adj <= 2.5, `${D.stageLabel(s)} ${hell ? '헬' : '보통'} 보정 ${adj}`);
      const r = D.recPower(s, hell);
      assert.ok(Number.isInteger(r) && r > 300 && r < 100000, `${D.stageLabel(s)} 권장 ${r}`);
    }
    assert.ok(D.recPower(s, true) > D.recPower(s, false), `${D.stageLabel(s)} 헬 권장이 보통보다 높다`);
  }
});

test('권장 전투력: 기준 덱은 장이 깊을수록 세지고 (칸 수 · 강화 · ★ · 장비), 헬 기준은 +4 강화', async () => {
  const D = await load('data.js');
  let prev = 0;
  for (let c = 1; c <= 8; c++) {
    const p = D.refDeckPower(c, false);
    assert.ok(p > prev * 0.98, `${c}장 기준 덱 ${p} ≥ 앞 장 ${prev}`);
    prev = p;
    assert.ok(D.refDeckPower(c, true) >= p, `${c}장 헬 기준 덱이 보통 이상`);
    assert.equal(D.REF_DECK[c - 1].length, c === 1 || c === 2 ? 4 : c <= 4 ? 5 : 6, `${c}장 기준 덱 칸 수`);
  }
  // 기준 강화 = 장 권장 + 2 (최대 20)
  for (let c = 1; c <= 8; c++) assert.equal(D.REF_META[c - 1], Math.min(20, D.REC_META[c - 1] + 2));
});

test('비율 판정: 여유 · 적당 · 도전 · 위험 · 무리 (경계)', async () => {
  const D = await load('data.js');
  const name = (r) => D.powerVerdict(r).name;
  assert.equal(name(1.15), '여유'); assert.equal(name(1.14), '적당');
  assert.equal(name(0.95), '적당'); assert.equal(name(0.94), '도전');
  assert.equal(name(0.8), '도전'); assert.equal(name(0.79), '위험');
  assert.equal(name(0.6), '위험'); assert.equal(name(0.59), '무리');
  assert.equal(name(0), '무리'); assert.equal(name(3), '여유');
  const colors = new Set(D.POWER_VERDICT.map((v) => v.color));
  assert.equal(colors.size, 5, '판정마다 색이 다르다');
});

test('예상 클리어: 10 단위 · 비율이 오를수록 안 내려가고 · 헬이 보통보다 낮다 · 표는 목표 모양', async () => {
  const D = await load('data.js');
  for (const hell of [false, true]) {
    let prev = -1;
    for (let r = 0; r <= 2.5; r += 0.05) {
      const h = D.clearHint(r, hell);
      assert.ok(h % 10 === 0 && h >= 0 && h <= 99, `예상 ${h}`);
      assert.ok(h >= prev, `비율 ${r.toFixed(2)} 에서 ${h} < ${prev}`);
      prev = h;
    }
  }
  for (const r of [0.65, 0.8, 1, 1.2, 1.5]) assert.ok(D.clearHint(r, true) < D.clearHint(r, false), `헬 < 보통 @${r}`);
  // 권장대로면 대충 하는 사람 3판에 2판쯤 (60~70%) · 0.8 이면 40% 안팎 · 0.5 이하는 한참 낮다
  assert.ok(D.clearHint(1, false) >= 60 && D.clearHint(1, false) <= 70);
  assert.ok(D.clearHint(0.8, false) >= 30 && D.clearHint(0.8, false) <= 50);
  assert.ok(D.clearHint(0.5, false) <= 20);
  assert.ok(D.clearHint(1.2, false) >= 80);
  assert.ok(D.clearHint(1, true) >= 30 && D.clearHint(1, true) <= 40, '헬 권장대로면 30~40%');
});

test('출전 준비: 내 전투력은 이 스테이지 기준(강화 상한 절반)으로 · 판정 · 예상 클리어 · 경고는 그대로', () => {
  const g = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  assert.ok(/const stagePower = \(p, s, hell\) => recPower\(s, hell\)/.test(g), '권장은 data.js recPower');
  assert.ok(/function deckPowerAt\(p, ids, s, hell\)/.test(g) && /softMeta\(/.test(g.slice(g.indexOf('function deckPowerAt'), g.indexOf('function deckPowerAt') + 400)), '권장 넘는 강화는 절반만');
  assert.ok(/powerVerdict\(ratio\)/.test(g) && /clearHint\(ratio, hellOn\)/.test(g), '판정 · 예상 클리어');
  assert.ok(g.includes('class="pp-hint"') && g.includes('class="pp-vd"'), '판정 칩 · 예상 줄');
  assert.ok(g.includes('<div class="pp-lack">') && g.includes('에 대처할 멤버가 덱에 없어요'), '기존 경고 유지');
  const css = fs.readFileSync(path.join(dir, 'style.css'), 'utf8');
  assert.ok(css.includes('.pp-vd') && css.includes('.pp-hint'), '스타일');
});

test('패치 노트: 권장 전투력 정직 · 예상 클리어', async () => {
  const P = await load('patchnotes.js');
  const n = P.PATCH_NOTES[0];
  assert.ok(/power/.test(n.id), '맨 앞 항목');
  assert.ok(n.items.some((x) => /권장 전투력/.test(x[1])) && n.items.some((x) => /예상 클리어/.test(x[1])));
  assert.equal(new Set(P.PATCH_NOTES.map((x) => x.id)).size, P.PATCH_NOTES.length, 'id 겹치지 않음');
});
