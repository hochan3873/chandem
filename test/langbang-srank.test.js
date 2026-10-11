'use strict';
// 시즌 랭킹 보상 (srank.js · server/langbang-season.js): 보상 단계 범위 · 한정 의상 · 얼린 지난 시즌 기록 · 순위 · 우편 한 번만 · 서버 길
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let SR, L, H;
let srv, base;
const DAY = 86400e3;
test.before(async () => {
  SR = await load('srank.js'); L = await load('live.js'); H = await load('hw-event.js');
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });
// 시즌 sid 의 가운데 시각 (진짜 시각)
const inSeason = (sid) => L.weekStartMs((sid - 1) * L.SEASON_WEEKS) + 9 * DAY;

test('보상 단계: 1위 · 2~3위 · 4~10위 · 상위 30% · 참가 (경계값)', () => {
  assert.equal(SR.srTier(0, 10), null, '순위 없음');
  assert.equal(SR.srTier(1, 1), 'r1');
  assert.equal(SR.srTier(2, 50), 'r3'); assert.equal(SR.srTier(3, 50), 'r3');
  assert.equal(SR.srTier(4, 50), 'r10'); assert.equal(SR.srTier(10, 50), 'r10');
  assert.equal(SR.srTier(11, 100), 'r30'); assert.equal(SR.srTier(30, 100), 'r30'); assert.equal(SR.srTier(31, 100), 'join');
  assert.equal(SR.srTier(15, 50), 'r30', '50명 중 15위 = 30%'); assert.equal(SR.srTier(16, 50), 'join');
  assert.equal(SR.srTier(11, 20), 'join', '20명이면 30% = 6위 → 11위는 참가');
  assert.equal(SR.srTier(3, 3), 'r3', '사람이 적어도 3위는 3위');
});

test('보상 내용: 의상은 1~3위만 · 칭호에 시즌 번호 · 프레임은 있는 것 · 의상은 상점에 없다', () => {
  const r1 = SR.srReward(1, 'r1'), r3 = SR.srReward(1, 'r3'), r10 = SR.srReward(1, 'r10'), r30 = SR.srReward(1, 'r30'), j = SR.srReward(1, 'join');
  assert.deepEqual(r1.skins, ['bangjang_s1', 'eunok_s1', 'gunman_s1']); assert.deepEqual(r3.skins, r1.skins);
  assert.ok(!r10.skins && !r30.skins && !j.skins, '4위부터는 의상 없음');
  assert.equal(r1.title, 's1_r1'); assert.equal(r10.title, 's1_r10'); assert.equal(SR.srReward(2, 'r1').title, 's2_r1');
  assert.equal(L.titleName('s1_r1'), '시즌1 랑방의 왕'); assert.equal(L.titleName('s1_r10'), '시즌1 진상 사냥꾼'); assert.equal(L.titleName('s1_r30'), '시즌1 랑방 정예');
  assert.equal(L.titleAnim('s1_r1'), 'rainbow'); assert.equal(L.titleAnim('s1_r10'), 'gold'); assert.equal(L.titleAnim('s1_r30'), '', '상위 30% 는 가만히');
  for (const t of ['r1', 'r3', 'r10', 'r30']) { const rw = SR.srReward(1, t); assert.ok(L.FRAMES[rw.frame], rw.frame); assert.ok(rw.tickets > 0 && rw.coins > 0); }
  assert.equal(L.FRAMES.srking.anim, 'rainbow'); assert.equal(L.FRAMES.srlaurel.anim, 'laurel'); assert.ok(!L.FRAMES.srsilver.anim);
  assert.ok(j.tickets >= 1 && j.coins > 0 && !j.title && !j.frame, '참가: 모집권 · 코인만');
  assert.ok(r1.tickets > r3.tickets && r3.tickets > r10.tickets && r10.tickets > r30.tickets && r30.tickets > j.tickets, '위로 갈수록 많이');
  for (const k of r1.skins) { assert.equal(H.COSTUMES[k].season, 1); assert.ok(!H.COSTUME_IDS.includes(k), '할로윈 의상실 목록 밖'); assert.ok(!H.SHOP.some((s) => s.id === k), '상점에 없음 (안 판다)'); }
  assert.match(H.costumeArt('bangjang_s1').attack, /^\/img\/lb\/season\/h_bangjang_s1_attack\.webp$/); assert.match(H.costumeArt('eunok_s1').idle, /h_eunok_s1_idle\.webp$/);
});

test('지난 시즌 기록은 시즌이 바뀌는 순간 얼린다 · 같은 기록은 같은 순위 · 기록 없는 표엔 안 들어간다', () => {
  const T1 = inSeason(1), T2 = inSeason(2);
  const mk = (ms, ts, at, bw, extra = {}) => ({ maxStage: ms, totalStars: ts, stageAt: at, bestWave: bw, bestScore: bw * 100, pvp: { rating: 1000, games: 0 }, ...extra });
  const a = mk(30, 90, 5, 20), b = mk(30, 90, 9, 0), c = mk(28, 80, 1, 20), d = mk(10, 30, 1, 0);
  for (const x of [a, b, c, d]) L.srSync(x, T1);
  assert.deepEqual(a.sr, { sid: 1 });
  // a 는 시즌 2 에 들어와서 더 깼다 → 시즌 1 기록은 얼린 값
  L.srSync(a, T2); a.maxStage = 50; a.totalStars = 150;
  assert.equal(a.srPrev.sid, 1); assert.equal(a.srPrev.ms, 30); assert.equal(a.sr.sid, 2);
  L.srSync(a, T2 + DAY); assert.equal(a.srPrev.ms, 30, '같은 시즌에 다시 불러도 그대로');
  const rows = [['a', a], ['b', b], ['c', c], ['d', d]].map(([id, lb]) => ({ id, lb }));
  const bd = SR.srBoards(rows, 1);
  assert.deepEqual(bd.stage.rank, { a: 1, b: 2, c: 3, d: 4 }, '스테이지 → 별 → 먼저 도달');
  assert.equal(bd.stage.n, 4);
  assert.equal(bd.endless.n, 2, '무한 기록 있는 사람만'); assert.equal(bd.endless.rank.a, 1); assert.equal(bd.endless.rank.c, 1, '같은 기록 = 같은 순위');
  assert.equal(bd.pvp.n, 0, '대전 안 한 사람은 대전 표에 없음');
  const bd2 = SR.srBoards(rows, 2);
  assert.deepEqual(Object.keys(bd2.stage.rank), ['a'], '시즌 2 에 들어온 사람만');
  assert.deepEqual(SR.srMine(bd, 'c'), { stage: { rank: 3, n: 4 }, endless: { rank: 1, n: 2 }, pvp: null });
});

test('시즌 보상 우편: 한 번만 · 시즌 중엔 안 줌 · 받으면 의상 · 칭호 · 프레임 (정리해도 남는다)', () => {
  const T2 = inSeason(2);
  const lb = { titles: [], frames: [], coins: 0, tickets: 0, stones: 0, mail: [], skins: { own: [], on: {} } };
  const prep = { sid: 1, ranks: { stage: { rank: 2, n: 40 }, endless: { rank: 12, n: 40 }, pvp: null } };
  assert.equal(SR.srSettle(lb, prep, inSeason(1)), 0, '시즌 1 이 아직 안 끝남');
  assert.equal(SR.srSettle(lb, prep, T2), 2, '표 두 개 → 우편 2통');
  assert.equal(lb.srPaid, 1);
  assert.equal(SR.srSettle(lb, prep, T2 + 1000), 0, '두 번 불러도 한 번만');
  assert.equal(lb.mail.length, 2);
  assert.match(lb.mail[0].title, /시즌 1 스테이지 2위/);
  // 정리(normLive) 해도 우편 보상이 남는다 (의상 포함)
  const out = {}; L.normLive(JSON.parse(JSON.stringify(lb)), out);
  assert.deepEqual(out.mail[0].rw.skins, ['bangjang_s1', 'eunok_s1', 'gunman_s1']);
  assert.equal(out.srPaid, 1);
  const r = L.mailClaim(lb, 'all', 'u1', T2);
  assert.equal(r.n, 2);
  assert.deepEqual(r.got.skins, ['bangjang_s1', 'eunok_s1', 'gunman_s1']);
  assert.ok(lb.titles.includes('s1_r3') && lb.titles.includes('s1_r30'));
  assert.ok(lb.frames.includes('srlaurel') && lb.frames.includes('srsilver'));
  // 의상 정리 · 입기
  const o2 = {}; H.normSkins(lb, o2); assert.deepEqual(o2.skins.own, ['bangjang_s1', 'eunok_s1', 'gunman_s1']);
  assert.ok(!H.wearSkin(lb, 'bangjang', 'bangjang_s1').error); assert.equal(H.wornMap(lb).bangjang, 'bangjang_s1');
  assert.ok(H.wearSkin(lb, 'gunman', 'bangjang_s1').error, '다른 멤버 의상은 못 입음');
  assert.match(H.wearSkin({ skins: { own: [], on: {} } }, 'eunok', 'eunok_s1').error, /랭킹 Top 3/);
  assert.equal(H.wearBonus(lb, ['bangjang']), 0, '할로윈 사탕 보너스는 할로윈 의상만');
  const n3 = {}; L.normLive({ titles: ['s1_r1', 's1_r99'], frames: ['srking', 'nope'] }, n3);
  assert.deepEqual(n3.titles, ['s1_r1']); assert.deepEqual(n3.frames, ['srking']);
});

test('서버: 지난 시즌 순위대로 우편 한 번 · 운영자 빼고 · 이번 시즌 남은 시간 · 내 순위', async () => {
  const realNow = Date.now;
  const T1 = inSeason(1), T2 = inSeason(2);
  try {
    Date.now = () => T1;
    const post = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body || {}) }).then((x) => x.json());
    const get = (url, token) => fetch(base + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((r) => r.json());
    const stars = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 3]));
    const users = [];
    for (const [name, n] of [['srtop', 40], ['srsec', 30], ['srmid', 20], ['srlow', 10]]) {
      const { token, user } = await srv.accounts.signup({ username: name, password: 'secret12', nickname: name });
      const u = await srv.accounts.store.byId(user.id);
      u.stats.langbang = Object.assign(u.stats.langbang || {}, { stages: stars(n), stageAt: 1000 + n });
      assert.equal((await post('/api/langbang/mail/sync', token)).ok, true); // 시즌 1 에 들어옴 (sr.sid = 1)
      users.push({ token, id: user.id, name });
    }
    let v = await get('/api/langbang/srank', users[1].token);
    assert.equal(v.sid, 1); assert.ok(v.left > 0 && v.end === L.seasonEndMs(1));
    assert.deepEqual(v.me.stage, { rank: 2, n: 4 }, '지금 내 순위');
    // 시즌 2 로 넘어감: 4등이 먼저 들어와서 많이 깨도 시즌 1 순위는 그대로
    Date.now = () => T2;
    const low = users[3];
    (await srv.accounts.store.byId(low.id)).stats.langbang.srPaid = 0;
    let r = await post('/api/langbang/mail/sync', low.token);
    assert.equal(r.ok, true, r.message);
    const lowMail = r.profile.mail.filter((m) => /시즌 1/.test(m.title));
    assert.equal(lowMail.length, 1); assert.match(lowMail[0].title, /4위/); assert.ok(!lowMail[0].rw.skins, '4위는 의상 없음'); assert.equal(lowMail[0].rw.title, 's1_r10');
    const lowRaw = (await srv.accounts.store.byId(low.id)).stats.langbang;
    lowRaw.stages = stars(60); // 시즌 2 에 크게 앞서도
    r = await post('/api/langbang/mail/sync', users[0].token);
    const topMail = r.profile.mail.filter((m) => /시즌 1/.test(m.title));
    assert.equal(topMail.length, 1); assert.match(topMail[0].title, /스테이지 1위/);
    assert.deepEqual(topMail[0].rw.skins, ['bangjang_s1', 'eunok_s1', 'gunman_s1']); assert.equal(topMail[0].rw.frame, 'srking');
    // 한 번만
    r = await post('/api/langbang/mail/sync', users[0].token);
    assert.equal(r.profile.mail.filter((m) => /시즌 1/.test(m.title)).length, 1, '두 번 동기화해도 한 통');
    assert.equal(r.profile.srPaid, 1);
    // 받기 → 의상 · 칭호 · 프레임 → 입기
    r = await post('/api/langbang/mail/claim', users[0].token, { id: 'all' });
    assert.equal(r.ok, true, r.message);
    assert.ok(r.profile.skins.own.includes('bangjang_s1') && r.profile.titles.includes('s1_r1') && r.profile.frames.includes('srking'));
    r = await post('/api/langbang/hw/wear', users[0].token, { hero: 'bangjang', id: 'bangjang_s1' });
    assert.equal(r.ok, true, r.message); assert.equal(r.profile.skins.on.bangjang, 'bangjang_s1');
    r = await post('/api/langbang/cosmetic', users[0].token, { title: 's1_r1', frame: 'srking' });
    assert.equal(r.ok, true, r.message); assert.equal(r.profile.title, 's1_r1');
    // 2등도 의상 · 지난 시즌 내 순위 보기
    r = await post('/api/langbang/mail/sync', users[1].token);
    assert.deepEqual(r.profile.mail.filter((m) => /시즌 1/.test(m.title))[0].rw.skins.length, 3);
    v = await get('/api/langbang/srank', users[1].token);
    assert.equal(v.sid, 2); assert.equal(v.last.sid, 1); assert.deepEqual(v.last.ranks.stage, { rank: 2, n: 4 }); assert.equal(v.last.paid, true);
    // 손님 · 시즌 3 에 처음 들어온 사람은 시즌 2 보상 없음 (시즌 2 기록 없음)
    assert.equal((await get('/api/langbang/srank')).me, null);
  } finally { Date.now = realNow; }
});
