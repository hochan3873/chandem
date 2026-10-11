'use strict';
// 재화 정리: 모든 재화에 얻는 곳 · 쓰는 곳이 있고 (코드의 보상 표와 어긋나지 않고) · 그림 · 색이 겹치지 않고 · 성장 길잡이가 말이 되는지
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const dir = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);
let C, D, L;
test.before(async () => { C = await load('currency.js'); D = await load('data.js'); L = await load('live.js'); await load('currency-ui.js'); });

test('모든 재화에 얻는 곳 · 쓰는 곳이 하나 이상 있다 (빠지면 실패)', () => {
  for (const id of C.CUR_IDS) {
    assert.ok((C.SOURCES[id] || []).length >= 1, `${id} 얻는 곳 없음`);
    assert.ok((C.SINKS[id] || []).length >= 1, `${id} 쓰는 곳 없음`);
    for (const row of [...C.SOURCES[id], ...C.SINKS[id]]) {
      const t = row.t();
      assert.ok(t.length > 4 && !/undefined|NaN|\[object/.test(t), `${id}/${row.k}: ${t}`);
      assert.ok(row.go in C.GO, `${id}/${row.k} 바로 가기 ${row.go}`);
    }
  }
  assert.deepEqual(Object.keys(C.SOURCES).sort(), [...C.CUR_IDS].sort());
  assert.deepEqual(Object.keys(C.SINKS).sort(), [...C.CUR_IDS].sort());
});

test('얻는 곳 목록 = 코드의 보상 표 (빠진 것도 · 없는 걸 적은 것도 없다)', () => {
  assert.deepEqual(C.missingSources(), [], '코드에선 나오는데 목록에 없는 곳');
  assert.deepEqual(C.extraSources(), [], '목록엔 있는데 코드에 근거가 없는 곳');
});

test('live.js grant 가 다루는 보상 칸은 전부 재화 목록에 있다', () => {
  const lb = { coins: 0, tickets: 0, stones: 0, wild: 0, sta: 0, season: { sp: 0, claimed: [] }, shards: {}, cons: {}, titles: [], frames: [], gear: [], gearSeq: 0, cnt: {}, pity: {}, hstars: {}, owned: {}, heroes: {} };
  const got = L.grant(lb, { coins: 1, tickets: 1, stones: 1, wild: 1, sp: 1, shards: { bangjang: 1 } }, 'u', Date.now());
  for (const k of ['coins', 'tickets', 'stones', 'wild', 'sp', 'shards']) {
    const id = C.RW_KEYS[k] || (k === 'shards' ? 'cards' : '');
    assert.ok(C.CUR[id], `${k} 는 재화 목록에 없다`);
    assert.ok(got[k], `${k} 지급`);
  }
});

test('그림 파일이 있고 · 색 · 그림이 서로 다르다', () => {
  const colors = new Set(), icons = new Set();
  for (const id of C.CUR_IDS) {
    const c = C.CUR[id];
    assert.match(c.color, /^#[0-9a-f]{6}$/i);
    assert.ok(!colors.has(c.color), `${id} 색 겹침`); colors.add(c.color);
    assert.ok(c.short.length > 8, `${id} 한 줄 설명`);
    if (id === 'coins') continue; // CSS 동전
    const src = C.curImgSrc(id);
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'public', src)), `${id} 그림 ${src}`);
    assert.ok(!icons.has(src), `${id} 그림 겹침`); icons.add(src);
  }
});

test('보상 · 칩 모양 · 날리기 도구', () => {
  const html = C.rwTags({ coins: 1200, tickets: 2, shards: { a: 3 }, title: 'x' });
  assert.match(html, /1,200/); assert.match(html, /모집권/); assert.match(html, /멤버 카드/);
  assert.deepEqual(Object.keys(C.rwRest({ coins: 1, title: 'x', gear: 'rare' })).sort(), ['gear', 'title']);
  assert.deepEqual(C.gainsOf({ coins: 5, tickets: 3 }, { coins: 9, tickets: 3, stones: 2 }), { coins: 4, stones: 2 });
  assert.equal(C.eu(1240), '으로'); assert.equal(C.eu(1241), '로');
});

test('성장 길잡이: 가장 이득인 한 가지 · 모아 두세요 · 낭비 경고', () => {
  const now = Date.now();
  const owned = ['bangjang', 'staff', 'gunman'];
  const power = (p, id) => 100 + (p.heroes[id] | 0) * 10 + ((p.hstars || {})[id] | 0) * 50; // 간단한 전투력
  const base = () => ({ coins: 1240, tickets: 0, stones: 0, wild: 0, shards: { bangjang: 5, staff: 5, gunman: 5 }, heroes: { bangjang: 3, staff: 3, gunman: 3 }, hstars: {}, pity: {}, owned: {}, gear: [], equip: {}, stages: {}, maxStage: 20, sta: { v: 20, t: now }, season: { sp: 0, claimed: [] } });
  const env = { owned, deck: ['bangjang', 'staff'], power, metaMax: () => 20, costOf: (p, id) => D.metaCost(p.heroes[id] | 0), uid: 'u', gearUp: [] };
  const g = L.heroStar ? C.growth(base(), env, now) : null;
  assert.ok(g.main && g.main.line.includes('코인 1,240으로는'), g.main && g.main.line);
  assert.ok(g.main.todo && g.main.todo.go === 'hero', '강화 길안내 연결');
  assert.ok(g.main.btn.length > 2);
  // 코인 없으면 → 강화 추천 없음
  const p0 = Object.assign(base(), { coins: 10 });
  assert.ok(!C.growth(p0, env, now).main.todo, '살 수 없는 건 추천 안 함');
  // 각성 칸(+5) 이 코인 두 배 → 모아 두세요
  const p5 = Object.assign(base(), { coins: 1000, heroes: { bangjang: 4, staff: 4, gunman: 4 } });
  const cost5 = D.metaCost(4);
  assert.ok(cost5 > 1000, '+5 칸은 코인이 모자라야 이 시험이 의미 있다');
  const g5 = C.growth(p5, env, now);
  assert.ok(g5.saves.some((s) => /모아 두세요/.test(s.txt)), '모아 두세요');
  // 낭비 경고: 체력 가득 · 모집권 안 씀
  const pw = Object.assign(base(), { sta: { v: L.STAMINA.max, t: now }, tickets: 12 });
  const gw = C.growth(pw, env, now);
  assert.ok(gw.warns.some((w) => w.cur === 'sta'), '체력 가득 경고');
  assert.ok(gw.warns.some((w) => w.cur === 'tickets'), '모집권 경고');
  assert.ok(gw.list.length <= 5);
  // 안내 창 · 길잡이 문구에 깨진 값이 없다
  const all = [g, gw, g5].flatMap((x) => [x.main.line, x.main.sub, ...x.list.map((r) => r.txt), ...x.saves.map((s) => s.txt), ...x.warns.map((w) => w.txt)]);
  for (const t of all) assert.ok(!/undefined|NaN/.test(t), t);
});

test('안내 창 한도 줄: 모든 재화가 깨지지 않는다', () => {
  const p = { coins: 5, sta: { v: 10, t: Date.now() }, season: { sp: 250 }, pity: { sig: 100 }, tower: { stone: 3 }, hw: { candy: 9, day: 0, dayGot: 0 }, shards: { a: 2 }, wild: 1, stones: 4, tickets: 1 };
  for (const id of C.CUR_IDS) for (const c of C.caps(id, p)) assert.ok(!/undefined|NaN/.test(c.t), `${id}: ${c.t}`);
});

test('importmap · css 링크 · 버전', () => {
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(html.includes('"/langbang/currency.js"') && html.includes('"/langbang/currency-ui.js"'));
  assert.ok(/currency\.css\?v=/.test(html));
});

test('currency.css: 글자 CSS 금지 규칙', () => {
  const css = fs.readFileSync(path.join(dir, 'currency.css'), 'utf8');
  assert.ok(!/-webkit-text-stroke|paint-order|background-clip\s*:\s*text/.test(css));
});
