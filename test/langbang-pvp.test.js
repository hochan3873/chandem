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
  assert.equal(r.profile.heroes.staff, 20, '강화 한도까지 (모든 티어 20)');
  assert.ok(r.profile.gear.length >= 8 && r.profile.coins >= 1e6);
  assert.ok(r.profile.seen.includes('boss_soloparty'), '도감 전부');
  const me = await get('/api/langbang/me', m.token);
  assert.equal(me.profile.master, true);
  const rk = await get('/api/langbang/ranking?mode=stage');
  assert.ok(!rk.ranking.some((x) => x.username === 'gun8401'), '마스터는 스테이지 랭킹에 안 나옴');
  // 주간 · 레이드 · 대전 순위에도 마스터는 없다 (저장된 기록이 있어도 숨김)
  const mu = await srv.accounts.store.byName('gun8401');
  const L2 = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  const wi = L2.weekIndex(), ri = L2.raidState().wi;
  mu.stats.langbang.weekly = { wi, best: 99999, runs: 1 };
  mu.stats.langbang.raid = { wi: ri, dmg: 123456, runs: 1, today: 1, best: 123456 };
  mu.stats.langbang.pvp = { rating: 3000, games: 5, wins: 5 };
  await srv.accounts.store.saveStats(mu.id, mu.stats);
  assert.equal(await srv.accounts.store.countWeekly(wi), 0, '주간 순위에 마스터 없음');
  assert.equal(await srv.accounts.store.raidTotal(ri), 0, '레이드 합계에 마스터 없음');
  const pr = await get('/api/langbang/pvp/ranking');
  assert.ok(!pr.ranking.some((x) => x.username === 'gun8401'), '대전 순위에 마스터 없음');
  r = await post('/api/langbang/master', m.token, { action: 'reset' });
  assert.equal(r.profile.maxStage, 0);
  assert.equal(r.profile.unlimited, true, '마스터는 코인 ∞');
  assert.equal(r.profile.coins, 1e9);
  r = await post('/api/langbang/master', m.token, { action: 'allclear' });
  const g0 = r.profile.gear[0];
  const e1 = await post('/api/langbang/gear/enhance', m.token, { id: g0.id });
  assert.equal(e1.ok, true, e1.message);
  assert.equal(e1.success, true, '마스터 강화는 항상 성공');
  assert.equal(e1.profile.coins, 1e9, '코인 안 줄어듦');
  const pull = await post('/api/langbang/gacha', m.token, { n: 10, pay: 'coin' });
  assert.equal(pull.ok, true, pull.message);
  assert.equal(pull.profile.coins, 1e9);
  r = await post('/api/langbang/master', m.token, { action: 'reset' });
  assert.equal(r.profile.deckSlots, 4, '초기화하면 4칸');
});

test('레이드 공식: 매일 3번 (12:00~13:30 · 15:00~16:30 · 21:00~23:00 KST) · 레이드마다 도전 · 피해 상한 · 보상', async () => {
  const L = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'live.js')).href);
  const day = L.EPOCH - L.KST + 10 * L.DAY; // 어느 날 00:00 (KST)
  const at = (h, m = 0) => day + (h * 60 + m) * 60e3;
  assert.equal(L.raidState(at(11, 59)).open, false);
  const a = L.raidState(at(12, 0)), b = L.raidState(at(15, 30)), c = L.raidState(at(22, 59));
  assert.ok(a.open && b.open && c.open, '세 시간 모두 열림');
  assert.ok(a.wi !== b.wi && b.wi !== c.wi, '시간마다 다른 레이드');
  assert.equal(L.raidState(at(13, 31)).open, false, '점심 끝');
  assert.equal(L.raidState(at(13, 31)).wi, b.wi, '닫혀 있으면 다음 레이드');
  assert.equal(L.raidState(at(23, 30)).wi, a.wi + 3, '밤 끝나면 다음 날 점심');
  assert.equal(L.raidLabel(at(12, 10)).open, true);
  assert.match(L.raidLabel(at(14, 0)).text, /오후 1시간 0분 뒤|오후 60분 뒤/);
  const lb = {};
  for (let i = 0; i < L.RAID.tries; i++) L.raidRecord(lb, 1000, at(12, 5) + i);
  assert.equal(L.raidTriesLeft(lb, at(12, 30)), 0, '레이드마다 도전 횟수');
  assert.equal(L.raidTriesLeft(lb, at(15, 5)), L.RAID.tries, '다음 레이드는 다시');
  L.raidRecord(lb, 500, at(13, 35), a.wi);
  assert.equal(lb.raid.dmg, 1000 * L.RAID.tries + 500, '끝난 뒤 들어온 기록도 그 레이드로');
  const weak = L.raidCap({ maxStage: 5, heroes: {} }, 150), strong = L.raidCap({ maxStage: 60, heroes: { staff: 20, gunman: 20 } }, 150);
  assert.ok(strong > weak * 5, '성장할수록 상한이 크다');
  assert.ok(L.raidCap({ maxStage: 60, heroes: {} }, 9999) === L.raidCap({ maxStage: 60, heroes: {} }, 165), '시간은 165초까지만');
  const k = L.raidReward(500000, 900000, 1, true), p = L.raidReward(100000, 400000, 3, false);
  assert.ok(k.tickets >= 5 && k.title === 'raid1');
  assert.ok(p.coins > 0 && p.coins < k.coins);
  const bd = await get('/api/langbang/raid');
  assert.equal(bd.ok, true);
  assert.equal(bd.hp, L.RAID.hp);
});

test('장비 강화 +1~+10: +3까지는 무조건 · 그 뒤로 확률 (실패해도 장비·레벨 그대로, 비용만) · 서버 판정 · 마스터는 공짜 · 무한 코인', async () => {
  const R = require('../server/langbang-rules');
  assert.deepEqual([0, 1, 2].map(R.gearEnhanceChance), [1, 1, 1]);
  assert.ok(R.gearEnhanceChance(3) >= 0.85 && Math.abs(R.gearEnhanceChance(9) - 0.4) < 1e-9 && R.gearEnhanceChance(10) === 0);
  const u = await user('enhuser');
  const st = await srv.accounts.store.byId(u.user.id);
  st.stats.langbang = Object.assign(st.stats.langbang || {}, { coins: 1e6, gear: [{ id: 1, t: 'megaphone', r: 'epic', lv: 6 }], gearSeq: 1, maxStage: 5, stages: { 1: 3 } });
  await srv.accounts.store.saveStats(u.user.id, st.stats);
  let ok = 0, fail = 0, coins = 1e6;
  for (let i = 0; i < 40 && !(ok && fail); i++) {
    const r = await post('/api/langbang/gear/enhance', u.token, { id: 1 });
    assert.equal(r.ok, true, r.message);
    const it = r.profile.gear.find((g) => g.id === 1);
    if (r.success) ok++; else { fail++; assert.equal(it.lv, r.lv, '실패해도 레벨 그대로'); }
    assert.ok(r.profile.coins < coins, '비용은 든다'); coins = r.profile.coins;
    if (it.lv >= 10) { const s2 = await srv.accounts.store.byId(u.user.id); s2.stats.langbang.gear[0].lv = 6; await srv.accounts.store.saveStats(u.user.id, s2.stats); } // +10 이면 다시 +6 으로 (실패도 보려고)
  }
  assert.ok(ok > 0 && fail > 0, `성공 ${ok} · 실패 ${fail}`);
});

test('1:1 대전 방 목록: 방 만들기 → 목록에 보임(제목 · 방장 · 등급 · 전투력 · 기다린 시간) · 누르면 들어감 · 빠른 매칭은 제일 오래된 방으로 · 나가면 사라짐', async () => {
  const ua = await user('roomA'), ub = await user('roomB'), uc = await user('roomC');
  const a = player(ua.token), b = player(ub.token), c = player(uc.token);
  const lists = [];
  c.on('rooms', (r) => lists.push(r));
  await until(() => a.connected && b.connected && c.connected);
  const r1 = await a.call('room:create', { title: '한판 하실 분', power: 1234, deck: ['staff'] });
  assert.match(r1.code, /^\d{4}$/);
  await until(() => lists.some((l) => l.some((x) => x.code === r1.code)));
  const row = lists[lists.length - 1].find((x) => x.code === r1.code);
  assert.equal(row.title, '한판 하실 분');
  assert.equal(row.host, 'roomA');
  assert.equal(row.power, 1234);
  assert.ok(row.tier && row.waitSec >= 0);
  const ls = await b.call('rooms:list', {});
  assert.ok(ls.rooms.some((x) => x.code === r1.code));
  // 빠른 매칭: 제일 오래된 방(a)으로
  const q = await b.call('quick', { deck: ['gunman'] });
  assert.equal(q.matched, true);
  await until(() => a.got.match && b.got.match);
  await until(() => lists.length && !lists[lists.length - 1].some((x) => x.code === r1.code));
  // 방 나가기 → 목록에서 사라짐
  const r2 = await c.call('room:create', { title: '나갈 방' });
  await until(() => lists[lists.length - 1].some((x) => x.code === r2.code));
  await c.call('room:leave', {});
  await until(() => !lists[lists.length - 1].some((x) => x.code === r2.code));
  a.close(); b.close(); c.close();
});
