'use strict';
// 랑방 대전 1:1 대전 (Socket.IO /lbpvp) · 마스터 테스트 도구 · 레이드 공식
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server/index');

let srv, base, clock = Date.now();
const now = () => clock;
test.before(async () => {
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 }, lbpvp: { now, botAfterMs: 250, graceMs: 250, sendDelayMs: 30, countdownMs: 30, botTickMs: 40 } });
  const port = await srv.listen();
  base = `http://127.0.0.1:${port}`;
});
test.after(async () => { await srv.close(); });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await wait(15); } throw new Error('시간 초과'); }
function player(token) {
  const s = connect(base + '/lbpvp', { transports: ['websocket'], forceNew: true, auth: { token: token || '' } });
  s.got = {};
  for (const ev of ['match', 'opp', 'incoming', 'sent', 'end']) s.on(ev, (v) => { (s.got[ev] = s.got[ev] || []).push(v); });
  s.call = (ev, data) => new Promise((res) => s.emit(ev, data, res));
  return s;
}
async function user(name) { const r = await srv.accounts.signup({ username: name, password: 'secret12', nickname: name }); return r; }
const post = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());
const get = (url, token) => fetch(base + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((x) => x.json());

test('1:1 대전: 매칭 · 보내기 확인(게이지 · 간격) · 1초 늦게 도착 · 입구가 뚫리면 끝 · 점수(레이팅) 변동', async () => {
  const ua = await user('pvpa'), ub = await user('pvpb');
  const a = player(ua.token), b = player(ub.token);
  await until(() => a.connected && b.connected);
  assert.equal((await a.call('queue', { deck: ['staff'] })).waiting, true);
  assert.equal((await b.call('queue', { deck: ['gunman'] })).matched, true);
  await until(() => a.got.match && b.got.match);
  assert.equal(a.got.match[0].id, b.got.match[0].id, '같은 판');
  assert.equal(a.got.match[0].seed, b.got.match[0].seed, '같은 시드');
  assert.equal(a.got.match[0].opp.nickname, 'pvpb');
  await wait(60);
  clock += 5000; // 시작 5초 뒤
  assert.equal((await a.call('send', { kind: 'small' })).ok, false, '게이지 없음');
  a.emit('hp', { hp: 300, max: 300, kills: 12, wave: 1 });
  await until(() => b.got.opp && b.got.opp.some((o) => o.kills === 12));
  a.emit('hp', { hp: 300, max: 300, kills: 9999, wave: 1 }); // 말이 안 되는 처치 수는 무시
  await wait(40);
  assert.ok(!b.got.opp.some((o) => o.kills === 9999), '처치 수가 너무 빠르면 무시');
  assert.equal((await a.call('send', { kind: 'small' })).ok, true);
  assert.equal((await a.call('send', { kind: 'small' })).ok, false, '게이지 다 씀');
  await until(() => b.got.incoming);
  assert.equal(b.got.incoming[0].kind, 'small');
  a.emit('hp', { hp: 300, max: 300, kills: 30, wave: 2 });
  await wait(30);
  assert.equal((await a.call('send', { kind: 'small' })).ok, false, '3초 간격');
  clock += 3500;
  assert.equal((await a.call('send', { kind: 'small' })).ok, true);
  // b 의 입구가 뚫림 → a 승리, 점수 변동
  b.emit('hp', { hp: 0, max: 300, kills: 5, wave: 2 });
  await until(() => a.got.end && b.got.end);
  assert.equal(a.got.end[0].win, true);
  assert.equal(b.got.end[0].win, false);
  assert.ok(a.got.end[0].ranked && a.got.end[0].delta > 0 && b.got.end[0].delta < 0);
  const sa = await srv.accounts.store.byId(ua.user.id);
  assert.ok(sa.stats.langbang.pvp.rating > 1000 && sa.stats.langbang.pvp.wins === 1);
  const rk = await get('/api/langbang/pvp/ranking');
  assert.equal(rk.ranking[0].nickname, 'pvpa');
  assert.equal(rk.ranking[0].username, 'pvpa');
  assert.equal(a.got.match[0].opp.username, 'pvpb', '상대 띠를 누르면 선수 카드');
  // 선수 카드: 스테이지 진행 · 대전 등급 · 승률 · 덱
  await post('/api/langbang/decks', ua.token, { i: 0, decks: [['staff', 'gunman', 'nope'], [], []] });
  const pc = await get('/api/langbang/player?u=pvpa');
  assert.equal(pc.ok, true, pc.message);
  assert.equal(pc.player.pvp.wins, 1);
  assert.equal(pc.player.pvp.winRate, 100);
  assert.ok(pc.player.pvp.tier && pc.player.pvp.tier.name);
  assert.deepEqual(pc.player.deck.map((h) => h.id), ['staff', 'gunman'], '없는 멤버는 빼고 현재 덱');
  assert.equal(pc.player.stageLabel, '-');
  assert.equal((await get('/api/langbang/player?u=nobody_here')).ok, false);
  a.close(); b.close();
});

test('1:1 대전: 상대가 없으면 연습 상대(봇) · 끊기면 기권 · 방 코드', async () => {
  const s = player('');
  await until(() => s.connected);
  await s.call('queue', {});
  await until(() => s.got.match, 3000);
  assert.equal(s.got.match[0].opp.bot, true, '연습 상대');
  s.emit('dead');
  await until(() => s.got.end);
  assert.equal(s.got.end[0].ranked, false, '봇 판은 점수 안 바뀜');
  s.close();
  // 방 코드 + 끊김 → 기권
  const uc = await user('pvpc'), ud = await user('pvpd');
  const c = player(uc.token), d = player(ud.token);
  await until(() => c.connected && d.connected);
  const room = await c.call('room:create', {});
  assert.match(room.code, /^\d{4}$/);
  assert.equal((await d.call('room:join', { code: '0000' })).ok, room.code === '0000');
  if (room.code !== '0000') assert.equal((await d.call('room:join', { code: room.code })).ok, true);
  await until(() => c.got.match && d.got.match);
  d.close();
  await until(() => c.got.end, 3000);
  assert.equal(c.got.end[0].win, true);
  assert.equal(c.got.end[0].reason, 'forfeit');
  c.close();
});

test('마스터 테스트 도구: 서버가 아이디로 확인 · 올클리어 · 초기화 · 랭킹 제외', async () => {
  const m = await user('gun8401');
  const n = await user('notmaster');
  assert.equal((await post('/api/langbang/master', n.token, { action: 'allclear' })).ok, false, '마스터만');
  let r = await post('/api/langbang/master', m.token, { action: 'allclear', level: 20, star5: true });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.profile.maxStage, 60);
  assert.equal(r.profile.master, true);
  assert.equal(r.profile.deckSlots, 6, '마스터는 덱 6칸');
  assert.equal(r.profile.hstars.hochan, 5);
  assert.equal(r.profile.heroes.staff, 12, '티어 한도까지');
  assert.ok(r.profile.gear.length >= 8 && r.profile.coins >= 1e6);
  assert.ok(r.profile.seen.includes('boss_soloparty'), '도감 전부');
  const me = await get('/api/langbang/me', m.token);
  assert.equal(me.profile.master, true);
  const rk = await get('/api/langbang/ranking?mode=stage');
  assert.ok(!rk.ranking.some((x) => x.username === 'gun8401'), '마스터는 스테이지 랭킹에 안 나옴');
  r = await post('/api/langbang/master', m.token, { action: 'reset' });
  assert.equal(r.profile.maxStage, 0);
  assert.equal(r.profile.coins, 0);
  assert.equal(r.profile.deckSlots, 4, '초기화하면 4칸');
});

test('레이드 공식: 금 18:00 ~ 일 24:00 · 하루 3번 · 피해 상한 · 보상', async () => {
  const L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  const wi = 3;
  const fri17 = L.weekStartMs(wi) + 4 * L.DAY + 17 * 3600e3, fri18 = fri17 + 3600e3;
  assert.equal(L.raidState(fri17).open, false);
  assert.equal(L.raidState(fri18).open, true);
  assert.equal(L.raidState(L.weekStartMs(wi + 1) - 1000).open, true, '일요일 밤까지');
  const lb = {};
  for (let i = 0; i < 3; i++) L.raidRecord(lb, 1000, fri18 + i);
  assert.equal(L.raidTriesLeft(lb, fri18 + 10), 0, '하루 3번');
  assert.equal(L.raidTriesLeft(lb, fri18 + L.DAY), 3, '다음 날 다시');
  assert.equal(lb.raid.dmg, 3000);
  const weak = L.raidCap({ maxStage: 5, heroes: {} }, 150), strong = L.raidCap({ maxStage: 60, heroes: { staff: 20, gunman: 20 } }, 150);
  assert.ok(strong > weak * 5, '성장할수록 상한이 크다');
  assert.ok(L.raidCap({ maxStage: 60, heroes: {} }, 9999) === L.raidCap({ maxStage: 60, heroes: {} }, 165), '시간은 165초까지만');
  const k = L.raidReward(500000, 2500000, 1, true), p = L.raidReward(100000, 1000000, 3, false);
  assert.ok(k.tickets >= 5 && k.title === 'raid1');
  assert.ok(p.coins > 0 && p.coins < k.coins);
  const bd = await get('/api/langbang/raid');
  assert.equal(bd.ok, true);
  assert.equal(bd.hp, L.RAID.hp);
});
