'use strict';
// 랑방 대전 진상 리메이크 (10/08): 투척 예고 · 끊기 · 입구 큰 한 방 · 들이받기 · 중간 보스 / 보스 기술 · 큰 한 방 스킬 1웨이브 뒤 · 기세 2칸
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S;
test.before(async () => { D = await load('data.js'); S = await load('sim.js'); });
function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const step = (g, sec, seen) => { for (let t = 0; t < sec; t += 1 / 60) { S.step(g, 1 / 60); if (seen) for (const e of g.events) seen.push(e); g.events.length = 0; } };
const mk = (heroes, o = {}) => { const g = S.createGame(Object.assign({ H: 760, rng: seeded(41), mode: 'stage', stage: 45, noWaves: true, heroes, tempo: true, meta: {} }, o)); g.phase = 'wave'; return g; };

test('진상 투척 예고: 표적(castWind) → 날아감 → 상태이상 + 쓰러짐 게이지 · 예고 중 기절이면 끊김', () => {
  const g = mk(['gunman', 'staff']);
  const e = S.spawnEnemy(g, 'inpi_dictator', 180, g.ropeY - 200, { hpMul: 50 }); e.speed = 0; e.spitT = 0.05;
  const seen = [];
  step(g, 0.2, seen);
  const w = seen.find((x) => x.type === 'castWind');
  assert.ok(w && w.st === 'silence' && e.castW > 0, '예고 (멤버 발밑 표적)');
  step(g, 2, seen);
  const hit = seen.find((x) => x.type === 'heroHit');
  assert.ok(hit && hit.st === 'silence', '맞음');
  const h = g.heroes.find((q) => q.id === hit.hero);
  assert.ok(h.silenceT > 0 && h.kd > 0, '침묵 + 게이지');
  // 끊기
  e.spitT = 0.05; seen.length = 0;
  step(g, 0.2, seen);
  assert.ok(e.cast, '다시 예고');
  e.stunT = 1; step(g, 0.1, seen);
  assert.ok(!e.cast && seen.some((x) => x.type === 'castBreak'), '기절 → 끊김');
  step(g, 1.5, seen);
  assert.ok(!seen.some((x) => x.type === 'heroHit'), '끊으면 안 날아옴');
});

test('폭력배 문짝 걷어차기 (입구 큰 한 방 · 끊을 수 있다) · 돌진 진상 들이받기 · 토하는 인간 독', () => {
  const g = mk(['gunman', 'staff']);
  const t = S.spawnEnemy(g, 'thug', 180, g.ropeY - 30, { hpMul: 50 }); t.kickT = 0.05;
  const seen = [];
  step(g, 3, seen);
  assert.ok(seen.some((x) => x.type === 'doorWind') && seen.some((x) => x.type === 'doorKick'), '문짝 걷어차기');
  const c = S.spawnEnemy(mk(['gunman']), 'cutter', 180, 100);
  assert.ok(D.ECAST.bump.cutter > 0 && c);
  const g2 = mk(['gunman', 'staff']);
  const m = S.spawnEnemy(g2, 'mukti', g2.heroes[0].x, g2.ropeY - 60, { hpMul: 50 });
  const s2 = []; step(g2, 2, s2);
  assert.ok(m && s2.some((x) => x.type === 'bump'), '들이받기');
  const g3 = mk(['gunman', 'staff']);
  const v = S.spawnEnemy(g3, 'vomit', 180, g3.ropeY - 150, { hpMul: 50 }); v.speed = 0; v.pukeT = 0.9;
  const s3 = []; step(g3, 2.5, s3);
  assert.ok(s3.some((x) => x.type === 'castWind' && x.st === 'poison') && g3.heroes.some((h) => h.poisonT > 0 || h.kd > 0), '우웩 → 독');
  const g4 = mk(['gunman', 'jungmin']);
  const v4 = S.spawnEnemy(g4, 'vomit', 180, g4.ropeY - 150, { hpMul: 50 }); v4.speed = 0; v4.pukeT = 0.9;
  step(g4, 2.5);
  assert.ok(g4.heroes.every((h) => !(h.poisonT > 0)), '홍정민: 독 면역');
});

test('중간 보스마다 제 기술 · 보스마다 멤버 기술 + 입구 기술 + 분노 기술', () => {
  for (const id of D.MID_IDS) assert.ok(D.MID_KITS[id] && D.MID_KITS[id].length, `${id} 기술`);
  const memberKinds = new Set(['stun', 'volley', 'charm', 'flyer']);
  for (const s of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80]) for (const id of D.stageBosses(s)) {
    const k = D.BOSS_KITS[id], all = [...k.skills, ...(k.p2 ? [k.p2] : [])];
    const d = D.ENEMIES[id];
    assert.ok(all.some((x) => memberKinds.has(x[0])) || d.toss || d.duck || d.golf || d.kneel || d.slam, `${id} 멤버 기술`);
    assert.ok(all.some((x) => x[0] === 'door' || x[0] === 'lure') || d.avalanche || d.speech || d.interest, `${id} 입구 기술`);
    assert.ok(k.p2, `${id} 분노 기술`);
    assert.ok(D.enemySkills(id).length >= 2, `${id} 기술 설명`);
  }
  // 보스 던지기: 예고 표적 → 날아가 맞음 · 입구 강타
  const g = mk(['gunman', 'staff', 'hanna']);
  const b = S.spawnEnemy(g, 'boss_jusa', 180, 220, { hpMul: 50 }); b.speed = 0; b.bai.i = 0; b.bai.next = 0.05;
  const seen = []; step(g, 2.5, seen);
  const w = seen.find((x) => x.type === 'bossWind' && x.kind === 'volley');
  assert.ok(w && w.targets.length === 2 && seen.some((x) => x.type === 'heroHit' && x.st === 'stun'), '술병 던지기');
  const hp0 = g.base.hp; b.bai.st = 'walk'; b.bai.i = 1; b.bai.next = 0.05; step(g, 1.6, seen);
  assert.ok(g.base.hp < hp0 && seen.some((x) => x.type === 'bossSkill' && x.kind === 'door'), '술상 엎기 (입구)');
  // 중간 보스: 예고 중 기절 → 끊김
  const g2 = mk(['gunman', 'staff']);
  const m = S.spawnEnemy(g2, 'mid_drunk', 180, 220, { hpMul: 50 }); m.speed = 0; m.bai.next = 0.05;
  step(g2, 0.2);
  assert.equal(m.bai.st, 'windup');
  m.stunT = 1; const s2 = []; step(g2, 0.1, s2);
  assert.ok(s2.some((x) => x.type === 'castBreak') && m.bai.st === 'recover', '중간 보스 기술 끊김');
});

test('큰 한 방 스킬(쿨 35초 이상)은 첫 웨이브가 끝나야 · 기세 2칸', () => {
  assert.equal(D.MOMENTUM.max, 200);
  const g = S.createGame({ H: 760, rng: seeded(5), mode: 'stage', stage: 12, deck: ['bangjang', 'gunman', null, null, null, null], leader: 'bangjang', tempo: true, meta: {} });
  const bj = g.heroes.find((h) => h.id === 'bangjang'), gm = g.heroes.find((h) => h.id === 'gunman');
  step(g, 4);
  bj.skillCd = 0; gm.skillCd = 0;
  assert.ok(S.ultLocked(g, bj) && !S.skillReady(bj) && !S.ultLocked(g, gm), '방장 집합! 잠김 · 건전남은 그대로');
  assert.equal(S.castSkill(g, bj), false);
  g.ultOpen = true;
  assert.ok(!S.ultLocked(g, bj) && S.skillReady(bj), '1웨이브 뒤 풀림');
  const t = S.createGame({ H: 760, rng: seeded(6), noWaves: true, heroes: ['bangjang'], tempo: true, meta: {} });
  assert.ok(!S.ultLocked(t, t.heroes[0]), '테스트 판은 그대로');
});
