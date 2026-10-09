'use strict';
// 랑방 대전 — 멤버 획득 규정 (10/09): 멤버마다 길 하나 · 등급 ↔ 길 · 초반 역할 · 합류 선택권 · 규정 옮기기 (가진 멤버는 절대 안 뺏음)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');
const R = require('../server/langbang-rules');

const imp = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, L, srv, base;
test.before(async () => {
  D = await imp('data.js'); L = await imp('live.js');
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });
const post = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());
const get = (url, token) => fetch(base + url, { headers: { authorization: 'Bearer ' + token } }).then((x) => x.json());

test('멤버마다 길은 하나 · 등급 ↔ 길이 맞는다 (T1 시작 · T2 스토리 · T3 스토리/모집 · T4 모집 · LEGEND · HIDDEN)', () => {
  const all = Object.keys(D.HEROES);
  for (const id of all) {
    const rt = D.heroRoute(id), t = D.heroTier(id);
    assert.ok(D.ACQ_ROUTES[rt], id);
    if (rt === 'start') assert.equal(t, 1, id + ' 시작 = T1');
    if (rt === 'story') assert.ok(t === 2 || t === 3, id + ' 스토리 = T2·T3');
    if (rt === 'gacha') assert.ok(t === 3 || t === 4, id + ' 모집 = T3·T4');
    if (rt === 'legend') assert.equal(t, 5, id);
    if (rt === 'hidden') assert.ok(D.HIDDEN_COND[id], id);
    if (t === 1) assert.equal(rt, 'start', id + ' T1 은 시작 멤버');
    if (t === 2) assert.equal(rt, 'story', id + ' T2 는 스토리로만');
    if (t === 4) assert.equal(rt, 'gacha', id + ' T4 는 모집으로만');
  }
  // 한 멤버가 두 길에 겹치지 않는다
  for (const id of Object.keys(D.HERO_UNLOCK)) assert.ok(!D.GACHA_HEROES.includes(id) && !D.LEGEND_HEROES.includes(id) && !D.HIDDEN_COND[id], id + ' 스토리 + 모집 겹침');
  for (const id of Object.keys(D.HIDDEN_COND)) assert.ok(!D.GACHA_HEROES.includes(id) && !D.HERO_UNLOCK[id], id);
  // 스토리는 1~3장 · 스테이지 순서대로 등급이 안 내려간다 (T2 먼저, T3 나중)
  const st = Object.entries(D.HERO_UNLOCK).sort((a, b) => a[1] - b[1]);
  for (const [, s] of st) assert.ok(D.chapterOf(s) <= 3);
  // 모집 · 픽업에는 T3 이상만
  for (const h of D.GACHA_HEROES) assert.ok(D.heroTier(h) >= 3, h);
  for (let w = 0; w < 6; w++) assert.equal(D.heroTier(L.pickupHero(Date.UTC(2026, 9, 5) + w * 7 * 864e5)), 4, '픽업은 T4');
  // 확률표의 멤버 이름이 실제 뽑기 목록과 같다
  const nm = (k) => /\(([^)]*)\)/.exec(L.GACHA_RATES.find((r) => r.k === k).name)[1].split(' · ');
  assert.deepEqual(nm('t3Card'), D.GACHA_HEROES.filter((h) => D.heroTier(h) === 3).map((h) => D.HEROES[h].name));
  assert.deepEqual(nm('epicHero'), D.GACHA_HEROES.filter((h) => D.heroTier(h) === 4).map((h) => D.HEROES[h].name));
  // 서버와 같은 목록
  assert.deepEqual(R.HERO_UNLOCK, D.HERO_UNLOCK);
  assert.deepEqual(Object.fromEntries(Object.entries(D.HIDDEN_COND).map(([k, v]) => [k, { stage: v.stage, stars: v.stars }])), R.HIDDEN_COND);
  assert.deepEqual([...R.GACHA].sort(), [...D.GACHA_HEROES, ...D.LEGEND_HEROES].sort());
  assert.deepEqual([...R.LOCKED].sort(), [...D.LOCKED_HEROES].sort());
});

test('초반 역할: 1장 안에 탱커 · 범위 · 저격 · 제어 · 지원 · 3-10 합류 선택권으로 약화·특수까지', () => {
  const by10 = Object.keys(D.HEROES).filter((id) => D.heroRoute(id) === 'start' || (D.HERO_UNLOCK[id] && D.HERO_UNLOCK[id] <= 10));
  const roles = new Set(by10.map(D.heroRole));
  for (const r of ['tank', 'aoe', 'single', 'ctrl', 'support']) assert.ok(roles.has(r), r + ' 가 1-10 까지 없음');
  const first = D.JOIN_PICKS[0];
  assert.equal(first.stage, 30);
  assert.ok(L.joinPickPool(first.tier).some((h) => D.heroRole(h) === 'special'), '3-10 선택권 후보에 약화·특수');
  for (const id of Object.keys(D.HERO_UNLOCK)) assert.ok(D.STORY_JOIN[id], id + ' 스토리 합류 장면');
});

test('HIDDEN 박나영: 5-6 캠프파이어 ★★★ (★ 하나 · 둘은 아직) · 서버도 같음', () => {
  for (const H of [L, R]) {
    assert.equal(H.heroUnlocked({ stages: { 46: 1 } }, 'dragon'), false);
    assert.equal(H.heroUnlocked({ stages: { 46: 2 } }, 'dragon'), false);
    assert.equal(H.heroUnlocked({ stages: { 46: 3 } }, 'dragon'), true);
  }
  // 스테이지 클리어 '새로 합류' 계산 (서버 · 손님 같은 방식: 전 → 후 비교) — 별을 올려서 채워도 나온다
  const before = { stages: { 46: 2 } }, after = { stages: { 46: 3 } };
  assert.deepEqual(R.LOCKED.filter((h) => !R.heroUnlocked(before, h) && R.heroUnlocked(after, h)), ['dragon']);
});

test('규정 옮기기: 예전에 가진 멤버는 지키고 · 새 규정으로 지난 스테이지 멤버는 지금 합류 + 우편 · 한 번만', () => {
  // 1-6 · 5-6(★1) · 8-5 를 깼던 예전 계정 (+ 모집 윤준서)
  const stages = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [i + 1, 3])); stages[46] = 1; stages[75] = 1;
  const raw = { owned: { junseo: true }, stages, heroes: {}, mailSeq: 0 };
  const out = L.normLive(raw, { stages, heroes: {} });
  for (const h of ['junseo', 'dohoon', 'dragon', 'subin']) assert.equal(out.owned[h], true, h + ' 예전 길로 가진 멤버 그대로');
  for (const h of ['junseo', 'dohoon', 'dragon', 'subin']) assert.equal(L.heroUnlocked(out, h), true, h);
  assert.deepEqual(out.acqNew.sort(), ['ingyu', 'jungmin'], '홍정민 1-3 · 백인규 1-6');
  assert.equal(L.heroUnlocked(out, 'ingyu'), true);
  assert.equal(out.mail.length, 1); assert.match(out.mail[0].text, /백인규|홍정민/); assert.equal(out.mail[0].rw.tickets, 2);
  assert.equal(out.acqV, D.ACQ_V);
  // 저장된 걸 다시 읽어도 우편이 또 오지 않는다
  const again = L.normLive(JSON.parse(JSON.stringify(out)), { stages, heroes: {} });
  assert.equal(again.mail.length, 1); assert.equal(again.owned.dragon, true);
  // 새 계정: 옮길 것 없음
  const fresh = L.normLive({}, { stages: {}, heroes: {} });
  assert.equal(fresh.mail.length, 0); assert.equal(fresh.acqV, D.ACQ_V);
  // 새 규정 뒤로는 5-6 을 ★1 로 깨도 박나영 아님 · 8-5 를 깨도 임수빈 아님
  const late = L.normLive({ acqV: D.ACQ_V }, { stages: { 46: 1, 75: 1 }, heroes: {} });
  assert.equal(L.heroUnlocked(late, 'dragon'), false); assert.equal(L.heroUnlocked(late, 'subin'), false);
});

test('합류 선택권: 3-10 · 5-10 · 7-10 = T3 · 8-10 = T4 · 한 번씩 · 다 있으면 카드', () => {
  const lb = L.normLive({ acqV: D.ACQ_V }, { stages: { 29: 3 }, heroes: {} });
  assert.equal(L.joinPicksOpen(lb).length, 0);
  assert.match(L.joinPick(lb, 30, 'soyoung').error, /선택권/);
  lb.stages[30] = 1;
  assert.deepEqual(L.joinPicksOpen(lb).map((j) => j.stage), [30]);
  assert.match(L.joinPick(lb, 30, 'junseo').error, /T3/, 'T3 선택권으로 T4 는 안 됨');
  const r = L.joinPick(lb, 30, 'soyoung');
  assert.ok(r.new); assert.equal(L.heroUnlocked(lb, 'soyoung'), true);
  assert.match(L.joinPick(lb, 30, 'jieun').error, /선택권/, '한 번만');
  lb.stages[80] = 1;
  assert.equal(L.joinPick(lb, 80, 'ara').new, true, '8-10 = T4');
  // T3 를 다 가진 뒤: 고른 멤버 카드
  for (const h of L.joinPickPool(3)) lb.owned[h] = true;
  lb.stages[50] = 1;
  const d = L.joinPick(lb, 50, 'jieun');
  assert.ok(d.dup); assert.equal(d.shards, D.JOIN_PICK_DUP);
});

test('모집 T2 카드는 합류한 스토리 T2 의 ★ 승급용 — 모집으로 T2 가 합류하지 않는다', () => {
  const lb = L.normLive({ acqV: D.ACQ_V, tickets: 500 }, { stages: { 1: 3, 2: 3, 3: 3 }, heroes: {}, coins: 0, gear: [], gearSeq: 0 });
  for (let i = 0; i < 30; i++) L.gachaPull(lb, 10, 'ticket', 'u-t2', Date.now(), 1000 + i);
  for (const h of ['sanghwa', 'myunghoon', 'dohoon', 'ingyu', 'eunok']) assert.equal(L.heroUnlocked(lb, h), false, h + ' 모집으로 합류하면 안 됨');
  assert.ok((lb.shards.jungmin | 0) > 0, '합류한 T2(홍정민)에게 카드');
});

test('서버: 들어올 때 규정 옮기기 저장 (우편 · 합류) · 합류 선택권 API', async () => {
  const u = await srv.accounts.signup({ username: 'acqold', password: 'secret12', nickname: 'acqold' });
  const st = await srv.accounts.store.byId(u.user.id);
  st.stats.langbang = Object.assign(st.stats.langbang || {}, { stages: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3])), maxStage: 30 });
  delete st.stats.langbang.acqV;
  await srv.accounts.store.saveStats(u.user.id, st.stats);
  const me = await get('/api/langbang/me', u.token);
  const p = me.profile;
  assert.equal(p.acqV, D.ACQ_V);
  assert.deepEqual([...p.acqNew].sort(), ['jungmin', 'sanghwa'], '1-3 · 2-1 (백인규는 예전 2-7 기록으로 이미)');
  assert.ok(p.unlocked.includes('sanghwa') && p.unlocked.includes('dohoon'));
  assert.equal(p.mail.length, 1);
  const saved = (await srv.accounts.store.byId(u.user.id)).stats.langbang;
  assert.equal(saved.acqV, D.ACQ_V, '저장됨'); assert.equal(saved.mail.length, 1);
  const me2 = await get('/api/langbang/me', u.token);
  assert.equal(me2.profile.mail.length, 1, '두 번째엔 우편 안 늘어남');
  // 3-10 을 깬 계정 → 합류 선택권
  const bad = await post('/api/langbang/join/pick', u.token, { stage: 30, hero: 'ara' });
  assert.equal(bad.ok, false);
  const ok = await post('/api/langbang/join/pick', u.token, { stage: 30, hero: 'jiwon' });
  assert.equal(ok.ok, true, ok.message); assert.equal(ok.new, true);
  assert.ok(ok.profile.unlocked.includes('jiwon'));
  assert.equal((await post('/api/langbang/join/pick', u.token, { stage: 30, hero: 'jieun' })).ok, false, '한 번만');
});
