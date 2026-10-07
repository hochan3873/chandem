'use strict';
// 랑방 튜토리얼: 기록(목록 ↔ 상태 · 합치기 · 처음 온 사람만 시작 · 다시 보기) · 레슨 고르기(순서 · 처음 배우는 사람만 · 먼저 끝낼 레슨 · 막힘)
//  · 비트 넘기기(이벤트 · 상태 · 탭 · 시간 · 건너뛰기) — DOM 없이
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let T;
test.before(async () => { T = await import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', 'tutorial.js')).href); });
const learner = (done = []) => { const st = T.tutFromList(['@on', ...done]); return st; };
const play = (o = {}) => Object.assign({ where: 'play', mode: 'stage', stage: 1, hell: false, pvp: false, t: 0, enemies: 0, cards: false, aug: false, aim: false, maxStage: 0 }, o);

test('기록: 목록 ↔ 상태 · 이상한 값은 버린다 · 합치기', () => {
  const st = T.tutFromList(['@on', 'b1', 'cards', 'b1', '<script>', 42, '@weird', 'x'.repeat(30)]);
  assert.equal(st.on, true);
  assert.equal(st.off, false);
  assert.deepEqual(Object.keys(st.done).sort(), ['b1', 'cards']);
  assert.deepEqual(T.tutList(st).sort(), ['@on', 'b1', 'cards'].sort());
  assert.deepEqual(T.tutParse('not json'), T.tutNew());
  assert.deepEqual(T.tutParse(JSON.stringify(['@off'])).off, true);
  const m = T.tutMerge(T.tutFromList(['@on', 'b1']), T.tutFromList(['skill', '@off']));
  assert.equal(m.on && m.off, true);
  assert.deepEqual(Object.keys(m.done).sort(), ['b1', 'skill']);
  assert.ok(T.tutList(T.tutFromList(Array.from({ length: 100 }, (_, i) => 'k' + i))).length <= 48);
});

test('시작: 클리어 0 인 새 사람만 · 이미 시작했거나 껐으면 그대로 · 다시 보기는 처음부터', () => {
  const a = T.tutNew();
  assert.equal(T.tutEnroll(a, { maxStage: 0 }), true);
  assert.equal(a.on, true);
  const vet = T.tutNew();
  assert.equal(T.tutEnroll(vet, { maxStage: 12 }), false);
  assert.equal(vet.on, false);
  const off = T.tutFromList(['@off']);
  assert.equal(T.tutEnroll(off, { maxStage: 0 }), false);
  const seenSome = T.tutFromList(['baul']); // 다른 기기에서 처음 보는 안내만 본 고참
  assert.equal(T.tutEnroll(seenSome, { maxStage: 0 }), false);
  const r = T.tutReplay();
  assert.equal(r.on, true);
  assert.deepEqual(r.done, {});
});

test('레슨 고르기: 로비 1-1 → 출전 준비 → 1-1 전투 · 고참에겐 처음 배우기 레슨 없음', () => {
  const st = learner();
  assert.equal(T.pickLesson(st, { where: 'menu', lobby: 1, maxStage: 0 }).id, 'start');
  assert.equal(T.pickLesson(st, { where: 'prep', prepStage: 1, maxStage: 0 }).id, 'start2');
  assert.equal(T.pickLesson(st, play()).id, 'b1');
  const vet = T.tutNew();
  assert.equal(T.pickLesson(vet, { where: 'menu', lobby: 1, maxStage: 9 }), null);
  assert.equal(T.pickLesson(vet, play()), null);
  // 고참도 처음 보는 것(송바울 · 1:1 · 탑)은 한 번
  assert.equal(T.pickLesson(vet, play({ baul: true, t: 3 })).id, 'baul');
  assert.equal(T.pickLesson(vet, play({ pvp: true, t: 3 })).id, 'pvp');
  assert.equal(T.pickLesson(vet, { where: 'tower' }), null, '탑은 탑 화면이 따로 (tower-guide.js TOWER_LESSONS)');
  assert.equal(T.pickLesson(vet, { where: 'raid' }).id, 'raid');
  // 끄면 아무것도
  assert.equal(T.pickLesson(T.tutFromList(['@on', '@off']), play()), null);
  assert.equal(T.pickLesson(T.tutFromList(['@off']), { where: 'raid' }), null);
});

test('레슨 고르기: 막혀 있으면(로딩 · 창) 안 띄움 · 헬 · 주간 · 1:1 은 스테이지 레슨 아님', () => {
  const st = learner();
  assert.equal(T.pickLesson(st, play({ blocked: true })), null);
  assert.equal(T.pickLesson(st, play({ modal: true })), null);
  assert.equal(T.pickLesson(st, play({ hell: true })), null);
  assert.equal(T.pickLesson(st, play({ mode: 'other' })), null);
});

test('레슨 순서: 1-2 스킬 · 총공지는 1-1 레슨 뒤 · 1-3 은 별/쓰러짐 · 첫 클리어 뒤 로비', () => {
  const st = learner();
  // 1-1 을 아직 안 끝냄 → 1-2 스킬 레슨은 안 뜬다
  assert.equal(T.pickLesson(st, play({ stage: 2, skillReady: true })), null);
  const st2 = learner(['b1']);
  assert.equal(T.pickLesson(st2, play({ stage: 2, skillReady: true })).id, 'skill');
  assert.equal(T.pickLesson(st2, play({ stage: 2, ultReady: true })).id, 'ult');
  assert.equal(T.pickLesson(st2, play({ stage: 1, skillReady: true })), null); // 1-1 에선 스킬 레슨 없음
  assert.equal(T.pickLesson(st2, play({ stage: 2, skillReady: true, cards: true })).id, 'cards'); // 카드가 떠 있으면 카드 먼저
  assert.equal(T.pickLesson(st2, play({ stage: 3, t: 2 })).id, 'b3');
  assert.equal(T.pickLesson(st2, play({ stage: 1, t: 30, speedOk: true })).id, 'speed');
  assert.equal(T.pickLesson(st2, { where: 'menu', lobby: 2, maxStage: 1 }).id, 'lobby');
  assert.equal(T.pickLesson(st2, { where: 'prep', prepStage: 2, maxStage: 1 }).id, 'prep');
  // 로비 레슨을 본 뒤: 강화할 게 있으면 강화 · 우편 · 출석은 2판부터
  const st3 = learner(['b1', 'lobby']);
  assert.equal(T.pickLesson(st3, { where: 'menu', lobby: 2, maxStage: 1, upg: true }).id, 'upg');
  assert.equal(T.pickLesson(st3, { where: 'menu', lobby: 2, maxStage: 1, mail: 2 }), null);
  assert.equal(T.pickLesson(st3, { where: 'menu', lobby: 2, maxStage: 2, mail: 2 }).id, 'mail');
  assert.equal(T.pickLesson(st3, { where: 'menu', lobby: 2, maxStage: 2, checkin: true }).id, 'checkin');
  // b3 를 끝내면 쓰러짐 안내도 본 걸로
  const st4 = T.markLesson(learner(['b1']), T.lessonById('b3'));
  assert.ok(T.isDone(st4, 'kd'));
});

test('끼어들기: 카드 · 증강만 (reactOnly)', () => {
  const st = learner();
  assert.equal(T.pickLesson(st, play({ aug: true }), true).id, 'aug');
  assert.equal(T.pickLesson(st, play({ cards: true }), true).id, 'cards');
  assert.equal(T.pickLesson(st, play({ t: 3 }), true), null);
});

test('비트: 이벤트 · 상태 · 탭 · 시간으로 넘어간다', () => {
  const b1 = T.lessonById('b1');
  const foe = b1.beats.find((b) => b.id === 'foe');
  assert.equal(T.beatDone(foe, play(), new Set(), {}, false, 0), false);
  assert.equal(T.beatDone(foe, play(), new Set(['focus']), {}, false, 0), true);
  assert.equal(T.beatDone(foe, play(), new Set(), {}, true, 0), false); // 진상을 탭해야 (말풍선 탭으로는 안 넘어감)
  const door = b1.beats.find((b) => b.id === 'door');
  assert.equal(T.beatDone(door, play(), new Set(), {}, true, 0), true);
  const auto = b1.beats.find((b) => b.id === 'auto');
  assert.equal(T.beatDone(auto, play(), new Set(), {}, false, 7), true); // 보기만 하는 비트는 시간이 지나면
  const aug = T.lessonById('aug').beats[0];
  assert.equal(T.beatDone(aug, play({ aug: true }), new Set(), {}, false, 0), false);
  assert.equal(T.beatDone(aug, play({ aug: false }), new Set(), {}, false, 0), true); // 고르면 (자동 선택이어도)
  const swipe = T.lessonById('lobby').beats.find((b) => b.id === 'swipe');
  assert.equal(T.beatDone(swipe, { lobby: 1 }, new Set(), { lobby: 1 }, false, 0), false);
  assert.equal(T.beatDone(swipe, { lobby: 2 }, new Set(), { lobby: 1 }, false, 0), true);
});

test('비트 건너뛰기: 바로 쓰는 스킬이면 "찍기"는 건너뛴다 · 상성 경고가 없으면 그 칸도', () => {
  const sk = T.lessonById('skill');
  assert.equal(sk.beats[T.nextBeat(sk, 1, play(), new Set())].id, 'aim');
  assert.equal(sk.beats[T.nextBeat(sk, 1, play(), new Set(['skillBtn', 'cast']))].id, 'cd');
  const pr = T.lessonById('prep');
  const i = pr.beats.findIndex((b) => b.id === 'lack');
  assert.equal(pr.beats[T.nextBeat(pr, i, { lack: false }, new Set())].id, 'deck');
  assert.equal(pr.beats[T.nextBeat(pr, i, { lack: true }, new Set())].id, 'lack');
  assert.equal(T.nextBeat(pr, pr.beats.length, {}, new Set()), -1);
});

test('모든 레슨: id 가 저장 모양에 맞고 · 비트마다 말이 있고 · 넘어갈 방법이 있다 · 판 안에서 멈추는 비트는 손가락이나 읽기', () => {
  const ids = new Set();
  for (const l of T.LESSONS) {
    assert.match(l.id, /^[a-z0-9_-]{1,16}$/);
    assert.ok(!ids.has(l.id), l.id); ids.add(l.id);
    assert.ok(l.beats.length >= 1 && l.beats.length <= 4, l.id);
    for (const b of l.beats) {
      assert.ok(T.beatText(b, { sup: 'gunnyeo' }).length > 4, `${l.id}.${b.id}`);
      assert.ok(b.on || b.ok || b.tap || b.wait, `${l.id}.${b.id} 넘어갈 방법`);
      assert.ok([0, 0.3, 1].includes(b.hold), `${l.id}.${b.id} hold`);
    }
  }
  assert.match(T.beatText(T.lessonById('sup').beats[0], { sup: 'jungmin' }), /홍정민/);
});

test('서버: 로그인 계정은 튜토리얼 진행을 프로필(tut)에 저장 · 이상한 값은 버림 · 손님은 거절', async () => {
  const { createServer } = require('../server/index');
  const srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  const port = await srv.listen();
  try {
    const base = `http://127.0.0.1:${port}`;
    const post = (url, token, body) => fetch(base + url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, token ? { authorization: 'Bearer ' + token } : {}), body: JSON.stringify(body) }).then((x) => x.json());
    const { token } = await srv.accounts.signup({ username: 'tutor1', password: 'secret12', nickname: '배우는중' });
    const me0 = await fetch(base + '/api/langbang/me', { headers: { authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.deepEqual(me0.profile.tut, []);
    const r = await post('/api/langbang/tut', token, { list: ['@on', 'start', 'b1', 'b1', '<x>', 7, 'y'.repeat(40)] });
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(r.tut, ['@on', 'start', 'b1']);
    const me = await fetch(base + '/api/langbang/me', { headers: { authorization: 'Bearer ' + token } }).then((x) => x.json());
    assert.deepEqual(me.profile.tut, ['@on', 'start', 'b1']);
    assert.deepEqual(T.tutList(T.tutFromList(me.profile.tut)).sort(), ['@on', 'b1', 'start']);
    // 다시 보기 = 목록을 통째로 바꾼다
    assert.deepEqual((await post('/api/langbang/tut', token, { list: ['@on'] })).tut, ['@on']);
    assert.equal((await post('/api/langbang/tut', null, { list: ['@on'] })).ok, false);
  } finally { await srv.close(); }
});
