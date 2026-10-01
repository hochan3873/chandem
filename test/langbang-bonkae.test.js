'use strict';
// 랑방 본캐: 정하기(멤버마다 한 계정 · 30일 제한) · 출연료(모드별 · 하루/짝 상한 · 내 본캐는 없음 · 숨은 보석 +50%) · 정산(우편/바로 받기)
//  · 주간 인기 멤버 순위 · 지난주 1위 "이번 주 인기 스타" · 마스터 지정/해제 · 손님은 안 됨 · 기록 정리
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');
const { normLb } = require('../server/accounts');

let srv, base, B, L, D;
const imp = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
  [B, L, D] = await Promise.all([imp('bonkae.js'), imp('live.js'), imp('data.js')]);
  await srv.accounts.ready;
});
test.after(async () => { await srv.close(); });

const post = (url, token, body) => fetch(base + '/api/langbang' + url, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) }).then(async (x) => ({ status: x.status, ...(await x.json()) }));
const get = (url, token) => fetch(base + '/api/langbang' + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((x) => x.json());
let seq = 0;
// 멤버를 다 가진 계정 (스테이지 1~30 ★3 + 모집 멤버)
async function user(nick, name) {
  const { token, user: u } = await srv.accounts.signup({ username: name || `bk${Date.now() % 1e6}${seq++}`, password: 'secret12', nickname: nick });
  const raw = await srv.accounts.store.byId(u.id);
  const lb = raw.stats.langbang;
  lb.stages = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3]));
  lb.maxStage = 30;
  lb.owned = Object.fromEntries([...D.GACHA_HEROES, ...D.LEGEND_HEROES].map((h) => [h, true]));
  return { token, id: u.id, nick, raw: () => raw.stats.langbang };
}
const bkOf = (u) => normLb(u.raw()).bk;
const run = (u, heroes, mode = 'stage', info = { label: '4-8' }, now) => srv.accounts.bonkaeRun(u.id, heroes, mode, info, now);
const HOUR = 3600e3;

test('규칙: 모드별 출연료 · 숨은 보석 +50% · 조사 · 기본 멤버는 본캐 불가', () => {
  assert.equal(B.feeOf('stage', false, false), 30);
  assert.equal(B.feeOf('stage', true, false), 40);
  assert.equal(B.feeOf('stage', false, true), 45);
  assert.equal(B.feeOf('pvp', false, false), 50);
  assert.ok(B.feeOf('tower') > 0 && B.feeOf('raid') > 0);
  assert.equal(B.actText('stage', { label: '4-8' }), '4-8을 깼어요');
  assert.equal(B.actText('stage', { label: '2-5' }), '2-5를 깼어요');
  assert.equal(B.actText('tower', { f: 12 }), '진상의 탑 12층을 깼어요');
  assert.ok(!B.isBkHero('bangjang') && !B.isBkHero('staff') && B.isBkHero('hochan'));
  assert.equal(L.titleName(B.BK_TITLE), '이번 주 인기 스타');
});

test('규칙: 인기 순위(몇 명 → 총 출전) · 숨은 보석 = 아래 1/3 · 아무도 안 쓴 주는 보석 없음', () => {
  const wi = 5;
  const raws = [
    { bku: { wi, h: { hochan: 5, dohoon: 1 } } },
    { bku: { wi, h: { hochan: 1, ara: 9 } } },
    { bkuPrev: { wi, h: { dohoon: 2 } } },
    { bku: { wi: wi - 1, h: { jiwon: 50 } } }, // 다른 주
  ];
  const r = B.popRank(raws, wi);
  assert.equal(r.length, B.BK_HEROES.length);
  assert.deepEqual(r.slice(0, 3).map((x) => [x.hero, x.players, x.uses]), [['hochan', 2, 6], ['dohoon', 2, 3], ['ara', 1, 9]]);
  const gems = B.gemSet(r);
  assert.ok(gems.size >= Math.floor(B.BK_HEROES.length / 3));
  assert.ok(!gems.has('hochan') && !gems.has('ara') && gems.has('jiwon'), '안 쓰인 멤버가 보석');
  assert.equal(B.gemSet(B.popRank([], wi)).size, 0);
  assert.equal(B.starOf(r).hero, 'hochan');
  assert.equal(B.starOf(B.popRank([], wi)), null);
});

test('본캐 정하기: 멤버마다 한 계정 · 먼저 온 사람 · 30일에 한 번 바꾸기 · 내려놓아도 시계는 그대로 · 손님은 안 됨', async () => {
  const a = await user('본캐가'), b = await user('본캐나');
  assert.equal((await post('/bonkae/claim', null, { hero: 'myunghoon' })).status, 401, '손님은 못 정함');
  assert.equal((await post('/bonkae/claim', a.token, { hero: 'bangjang' })).ok, false, '기본 멤버는 안 됨');
  const r = await post('/bonkae/claim', a.token, { hero: 'myunghoon' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.bk.hero, 'myunghoon');
  const r2 = await post('/bonkae/claim', b.token, { hero: 'myunghoon' });
  assert.equal(r2.ok, false, '이미 다른 친구 것');
  assert.match(r2.message, /다른 친구/);
  const v = await get('/bonkae');
  assert.equal(v.owners.myunghoon.nickname, '본캐가', '손님도 누가 주인인지 볼 수 있다');
  const r3 = await post('/bonkae/claim', a.token, { hero: 'dohoon' });
  assert.equal(r3.ok, false);
  assert.match(r3.message, /30일/);
  assert.equal((await post('/bonkae/claim', a.token, {})).ok, true, '내려놓기');
  assert.equal(bkOf(a).hero, null);
  const r4 = await post('/bonkae/claim', b.token, { hero: 'myunghoon' });
  assert.equal(r4.ok, true, '풀린 멤버는 다른 사람이 잡을 수 있다');
  assert.equal((await post('/bonkae/claim', a.token, { hero: 'dohoon' })).ok, false, '내려놓아도 30일은 그대로');
  a.raw().bk.chg = Date.now() - 31 * 24 * HOUR;
  const r5 = await post('/bonkae/claim', a.token, { hero: 'dohoon' });
  assert.equal(r5.ok, true, r5.message);
  assert.equal((await get('/bonkae')).owners.dohoon.nickname, '본캐가');
});

test('출연료: 다른 사람이 깨면 쌓이고, 내가 내 본캐를 쓰면 없음 · 손님 판/마스터 판 없음 · 스테이지 결과에서도', async () => {
  const o = await user('출연주인'), p = await user('출연손님');
  assert.equal((await post('/bonkae/claim', o.token, { hero: 'ingyu' })).ok, true);
  assert.equal((await post('/bonkae/claim', p.token, { hero: 'sunggu' })).ok, true);
  // 자기 본캐: 출연료도 인기 집계도 없음
  await run(o, ['ingyu']);
  assert.equal(bkOf(o).pend, null);
  assert.ok(!(normLb(o.raw()).bku || { h: {} }).h.ingyu, '내 본캐는 인기 집계도 안 함');
  // 스테이지 결과 (진짜 길)
  const res = await post('/result', p.token, { mode: 'stage', stage: 1, stars: 3, score: 1000, kills: 50, durationSec: 120, heroesUsed: ['ingyu', 'sunggu', 'gunman', 'nope'] });
  assert.equal(res.ok, true, res.message);
  assert.deepEqual(res.bonkae.map((x) => [x.hero, x.nickname]), [['ingyu', '출연주인']], '내 본캐(sunggu)는 빼고');
  let bk = bkOf(o);
  assert.ok(bk.pend && bk.pend.coins >= 30 && bk.pend.n === 1, JSON.stringify(bk.pend));
  assert.equal(bk.news.length, 1);
  assert.equal(bk.news[0].nick, '출연손님');
  assert.equal(bk.news[0].act, '1-1을 깼어요');
  assert.equal(normLb(p.raw()).bku.h.ingyu, 1, '이번 주 데려간 기록');
  assert.equal(bkOf(p).pend, null, '내 본캐를 내가 써도 출연료 없음');
  // 가지지 않은 멤버는 안 셈
  const g = await user('없는멤버');
  g.raw().owned = {}; g.raw().stages = {}; g.raw().maxStage = 0;
  const before = bkOf(o).pend.n;
  await run(g, ['ingyu']);
  assert.equal(bkOf(o).pend.n, before, '합류 안 한 멤버를 보냈다면 무시');
  // 마스터(무한 모드) 판은 안 센다
  const m = await user('마스터', 'gun8401');
  await run(m, ['ingyu']);
  assert.equal(bkOf(o).pend.n, before, '마스터 테스트 판 제외');
  // 손님: 서버 기록이 없어서 길 자체가 없다 (토큰 없이 result → 401)
  assert.equal((await post('/result', null, { mode: 'stage', stage: 1, stars: 3, durationSec: 120, heroesUsed: ['ingyu'] })).status, 401);
});

test('출연료 상한: 같은 사람 하루 300 · 주인 하루 1500 · 다음 날 다시', async () => {
  const o = await user('상한주인');
  assert.equal((await post('/bonkae/claim', o.token, { hero: 'donghan' })).ok, true);
  const t0 = Date.now();
  const p1 = await user('상한1');
  for (let i = 0; i < 12; i++) await run(p1, ['donghan'], 'stage', { label: '2-2' }, t0);
  let bk = bkOf(o);
  assert.equal(bk.day.pairs[p1.id], B.BONKAE.pairCap, '같은 사람은 하루 300까지');
  assert.equal(bk.pend.n, 12, '출연 횟수는 다 센다');
  assert.equal(bk.news.reduce((x, n) => x + n.coins, 0), B.BONKAE.pairCap);
  assert.ok(bk.news.length < 12, '상한에 걸린 판은 알림도 없음');
  const others = [];
  for (let k = 0; k < 6; k++) others.push(await user('상한사람' + k));
  for (const u of others) for (let i = 0; i < 12; i++) await run(u, ['donghan'], 'pvp', {}, t0);
  bk = bkOf(o);
  assert.equal(bk.day.coins, B.BONKAE.dayCap, '주인은 하루 1500까지');
  assert.equal(bk.pend.coins, B.BONKAE.dayCap);
  await run(p1, ['donghan'], 'stage', { label: '2-2' }, t0 + 25 * HOUR);
  assert.ok(bkOf(o).pend.coins > B.BONKAE.dayCap, '다음 날은 다시');
});

test('정산: 반나절 지나면 우편 ("내 캐릭터가 N번 출연했어요") · 바로 받기 · 알림 읽음', async () => {
  const o = await user('정산주인'), p = await user('정산손님');
  assert.equal((await post('/bonkae/claim', o.token, { hero: 'youngjun' })).ok, true);
  await run(p, ['youngjun'], 'stage', { label: '3-3' }, Date.now() - 13 * HOUR);
  await run(p, ['youngjun'], 'raid', {}, Date.now() - 13 * HOUR);
  const coins = bkOf(o).pend.coins;
  assert.ok(coins >= 70);
  const s = await post('/bonkae/sync', o.token);
  assert.equal(s.ok, true, s.message);
  assert.equal(s.fee.mail, true);
  const mail = s.profile.mail.find((m) => /출연료/.test(m.title));
  assert.ok(mail, '우편으로');
  assert.equal(mail.rw.coins, coins);
  assert.match(mail.text, /내 캐릭터가 2번 출연했어요 \(\+\d+\)/);
  assert.equal(s.profile.bk.pend, null);
  assert.equal((await post('/bonkae/sync', o.token)).fee, null, '두 번 안 줌');
  // 바로 받기 (이번 반나절 것)
  await run(p, ['youngjun'], 'tower', { f: 7 });
  const before = (await srv.accounts.lbMe(o.token)).profile.coins;
  const c = await post('/bonkae/collect', o.token);
  assert.equal(c.ok, true, c.message);
  assert.equal(c.profile.coins, before + c.got.coins);
  assert.equal((await post('/bonkae/collect', o.token)).ok, false, '받을 게 없음');
  assert.equal(c.profile.bk.news.at(-1).act, '진상의 탑 7층을 깼어요');
  const sn = await post('/bonkae/seen', o.token, { s: 999 });
  assert.equal(sn.profile.bk.seen, sn.profile.bk.seq, '읽음은 최신 번호까지만');
  assert.equal(B.newsUnseen(sn.profile).length, 0);
});

test('주간 인기 멤버: 지난주 1위 본캐 주인 → "이번 주 인기 스타" 칭호 + 코인 (한 번) · 숨은 보석 +50% · 칭호는 한 주만', async () => {
  const wi = L.weekIndex(Date.now());
  const o = await user('스타주인'), g = await user('보석주인');
  assert.equal((await post('/bonkae/claim', o.token, { hero: 'hochan' })).ok, true);
  assert.equal((await post('/bonkae/claim', g.token, { hero: 'baul' })).ok, true);
  // 지난주 기록: 다섯 명이 hochan, 두 명이 jiwon
  for (let k = 0; k < 5; k++) { const u = await user('지난주' + k); u.raw().bkuPrev = { wi: wi - 1, h: k < 2 ? { hochan: 3, jiwon: 1 } : { hochan: 1 } }; }
  srv.accounts.bonkae.forget();
  const v = await get('/bonkae', o.token);
  assert.equal(v.ok, true, v.message);
  assert.equal(v.star.hero, 'hochan');
  assert.equal(v.star.owner.nickname, '스타주인');
  assert.equal(v.last[0].hero, 'hochan');
  assert.equal(v.last[0].players, 5);
  assert.equal(v.week.length, B.BK_HEROES.length, '이번 주 탭도 멤버 전부');
  assert.ok(v.gems.includes('baul') && !v.gems.includes('hochan'), '지난주 안 쓰인 멤버가 숨은 보석');
  assert.equal(v.me.hero, 'hochan');
  // 보너스 우편 (한 주 한 번)
  const s = await post('/bonkae/sync', o.token);
  assert.equal(s.star, true);
  const m = s.profile.mail.find((x) => x.title === '이번 주 인기 스타!');
  assert.ok(m && m.rw.coins === B.BONKAE.star.coins && m.rw.title === B.BK_TITLE);
  assert.equal((await post('/bonkae/sync', o.token)).star, false, '두 번 안 줌');
  const cl = await post('/mail/claim', o.token, { id: m.id });
  assert.equal(cl.ok, true, cl.message);
  assert.ok(cl.profile.titles.includes(B.BK_TITLE));
  assert.equal((await post('/bonkae/sync', g.token)).star, false, '1위 주인만');
  // 숨은 보석 출연료 +50%
  const p = await user('보석손님');
  const paid = await run(p, ['baul', 'hochan'], 'stage', { label: '1-2' });
  assert.deepEqual(paid.map((x) => [x.hero, x.coins, x.gem]).sort(), [['baul', 45, true], ['hochan', 30, false]]);
  // 칭호는 이번 주가 끝나면 빠진다
  const raw = JSON.parse(JSON.stringify(o.raw()));
  const later = normLb(raw);
  assert.ok(later.titles.includes(B.BK_TITLE));
  const out = B.normBonkae(raw, { titles: [B.BK_TITLE, 'ch1'], title: B.BK_TITLE }, L.weekStartMs(wi + 1) + 1000);
  assert.deepEqual(out.titles, ['ch1']);
  assert.equal(out.title, '');
});

test('마스터: 아무 멤버를 아무 계정에 지정 · 해제 (30일 제한 없음) · 마스터만', async () => {
  const m = (await srv.accounts.login({ username: 'gun8401', password: 'secret12' }));
  const a = await user('분쟁가'), c = await user('분쟁나');
  assert.equal((await post('/bonkae/claim', a.token, { hero: 'hanna' })).ok, true);
  assert.equal((await post('/bonkae/claim', c.token, { hero: 'eunok' })).ok, true);
  assert.equal((await post('/bonkae/master', a.token, { hero: 'hanna', user: '분쟁나' })).ok, false, '마스터만');
  const r = await post('/bonkae/master', m.token, { hero: 'hanna', user: '분쟁나' });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.owner.nickname, '분쟁나');
  assert.equal(bkOf(a).hero, null, '원래 주인은 풀림');
  assert.equal(bkOf(c).hero, 'hanna', '분쟁나의 예전 본캐(eunok)는 hanna 로 바뀜');
  assert.equal(bkOf(c).by, 'master');
  let v = await get('/bonkae');
  assert.equal(v.owners.hanna.nickname, '분쟁나');
  assert.equal(v.owners.eunok, undefined);
  assert.equal((await post('/bonkae/master', m.token, { hero: 'hanna', user: '없는사람zz' })).ok, false);
  const off = await post('/bonkae/master', m.token, { hero: 'hanna' });
  assert.equal(off.ok, true, off.message);
  assert.equal(bkOf(c).hero, null);
  v = await get('/bonkae');
  assert.equal(v.owners.hanna, undefined);
});

test('기록 정리: 이상한 본캐 값은 버린다 · 지난 주 출전 기록은 밀린다', () => {
  const wi = L.weekIndex(Date.now());
  const lb = normLb({ bk: { hero: 'bangjang', chg: 'x', news: [{ s: 1, hero: 'nope' }, { s: 2, hero: 'ara', nick: '가'.repeat(30), coins: 1e9, act: 'x'.repeat(99) }], seen: 99, pend: { slot: 3, coins: -5, who: [1, 'a', 'a'] }, day: { d: 'x' } }, bku: { wi: wi - 1, h: { ara: 2, bangjang: 9, zz: 1 } }, bkuPrev: { wi: wi - 5, h: { ara: 1 } } });
  assert.equal(lb.bk.hero, null);
  assert.equal(lb.bk.chg, 0);
  assert.equal(lb.bk.news.length, 1);
  assert.equal(lb.bk.news[0].nick.length, 12);
  assert.equal(lb.bk.news[0].act.length, 24);
  assert.equal(lb.bk.news[0].coins, 1e5);
  assert.equal(lb.bk.seen, 2);
  assert.deepEqual(lb.bk.pend, { slot: 3, coins: 0, n: 0, gem: 0, who: ['a'] });
  assert.equal(lb.bk.day, null);
  assert.equal(lb.bku, null);
  assert.deepEqual(lb.bkuPrev, { wi: wi - 1, h: { ara: 2 } });
});
