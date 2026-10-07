'use strict';
// 랑방 대전 8장 「결혼식 뒤풀이」 — 축의금 도둑 · 끝없는 축사 · 새 멤버 임수빈
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
const R = require('../server/langbang-rules');
let D, S, L, F;
test.before(async () => {
  D = await load('data.js');
  S = await load('sim.js');
  L = await load('live.js');
  F = await load('flavor.js');
});
function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
const run = (g, sec) => { for (let t = 0; t < sec; t += 1 / 60) S.step(g, 1 / 60); };
const bare = (heroes = [], extra = {}) => S.createGame(Object.assign({ rng: seeded(800 + heroes.length), noWaves: true, heroes, unlocked: D.LOCKED_HEROES }, extra));
const IMG = (p) => fs.existsSync(path.join(__dirname, '..', 'public', p.replace(/^\//, '')));

test('8장: 챕터 · 스테이지 이름 · 진상 7종 그림 · 보스 · 중간 보스 · 맵 효과', () => {
  const c8 = D.CHAPTERS[7];
  assert.equal(c8.id, 8); assert.equal(c8.name, '결혼식 뒤풀이'); assert.equal(c8.names.length, 10);
  assert.equal(D.chapterOf(71), 8); assert.equal(D.stageName(75), '예식장 실장님'); assert.equal(D.stageName(80), '끝없는 축사');
  for (const id of ['envthief', 'buffet', 'badsinger', 'showoff', 'drunkfriend', 'mid_hallmgr', 'boss_bestman']) {
    const e = D.ENEMIES[id];
    assert.ok(e && e.ch8 && e.img === `/img/lb/e_${id}.webp` && IMG(e.img), id);
    assert.ok(IMG(`/img/lb/e_${id}_walk.webp`) && IMG(`/img/lb/e_${id}_die.webp`) && IMG(`/img/lb/dex/${id}.webp`), id + ' 걷기 · 쓰러짐 · 도감 그림');
    assert.equal(e.emoji, '', id);
    assert.ok(D.ENEMY_ATK[id] && D.SHORT_NAME[id] && F.FLAVOR[id] && e.shouts.length >= 3, id);
    assert.ok(R.ENEMY_IDS.includes(id), id + ' 서버 도감 목록');
  }
  assert.ok(IMG(D.ENEMY_ANIM.envthief.run.src), '도둑 도망 뒷모습 띠');
  assert.ok(D.ENEMIES.mid_hallmgr.boss && D.ENEMIES.boss_bestman.boss && D.BOSS_KITS.mid_hallmgr && D.BOSS_KITS.boss_bestman);
  for (let s = 71; s <= 80; s++) {
    assert.ok(D.stageMid(s), D.stageLabel(s));
    assert.ok(D.stageMix(s).every(([t]) => D.ENEMIES[t].ch8), `${D.stageLabel(s)} 8장 진상만`);
    assert.ok(IMG(`/img/lb/dio/s${s}.webp`), `${D.stageLabel(s)} 디오라마`);
    assert.ok(D.stageFx(s).id !== 'none', `${D.stageLabel(s)} 맵 효과`);
  }
  assert.ok(D.stageEnemies(72).includes('envthief') && D.stageEnemies(79).includes('envthief'));
  assert.ok(['keyart8', 'bg8', 'dio8'].every((n) => IMG(`/img/lb/${n}.webp`)));
  for (const id of Object.keys(D.ENEMIES)) if (D.ENEMIES[id].ch8 && !D.ENEMIES[id].towerOnly) assert.ok(R.ENEMY_IDS.includes(id), id);
});

test('축의금 도둑: 입구 대신 봉투를 들고 위로 → 빠져나가면 코인 −8% (최대 −40%) · 잡으면 되찾음', () => {
  assert.equal(D.thiefCut(0), 0); assert.equal(D.thiefCut(1), 0.08); assert.equal(D.thiefCut(3), 0.24); assert.equal(D.thiefCut(9), 0.4);
  for (let n = 0; n <= 12; n++) assert.equal(R.thiefCut(n), D.thiefCut(n), '서버와 같은 공식 ' + n);
  const g = bare([], { god: true });
  const e = S.spawnEnemy(g, 'envthief', 180, g.ropeY - 30, { hpMul: 50 });
  const hp0 = g.base.hp;
  let grab = 0, esc = null;
  for (let t = 0; t < 12 && !e.dead; t += 1 / 60) { S.step(g, 1 / 60); for (const v of g.events) { if (v.type === 'c8grab') grab++; if (v.type === 'c8escape') esc = v; } g.events.length = 0; }
  assert.equal(grab, 1, '봉투를 집었다');
  assert.ok(e.env && e.dead && esc, '위로 달아남');
  assert.equal(esc.n, 1); assert.equal(esc.pct, 8);
  assert.equal(g.base.hp, hp0, '입구는 안 때린다');
  assert.equal(g.stats.envStolen, 1);
  assert.equal(S.summary(g, 10).stolen, 1, '결과에 도난 수');
  // 보상: 놓친 만큼 깎인다
  const rw = R.stageReward(72, 3, 0, 0);
  const cut = Math.round(rw.total * R.thiefCut(2));
  assert.ok(cut > 0 && cut < rw.total);
  // 도망가다 잡히면 되찾음
  const g2 = bare([], { god: true });
  const t2 = S.spawnEnemy(g2, 'envthief', 180, g2.ropeY - 30, { hpMul: 1 });
  run(g2, 1.2);
  assert.ok(t2.env && t2.fleeing && !t2.dead);
  S.damageEnemy(g2, t2, 1e6, false, null);
  assert.ok(t2.dead && g2.events.some((v) => v.type === 'c8recover'));
  assert.equal(g2.stats.envStolen | 0, 0);
  assert.equal(g2.stats.envSaved, 1);
});

test('부케에 묶인 도둑은 못 도망간다 · 임수빈 부케가 묶는다', () => {
  const g = bare([], { god: true });
  const e = S.spawnEnemy(g, 'envthief', 180, g.ropeY - 30, { hpMul: 50 });
  run(g, 1.2);
  assert.ok(e.env && e.fleeing, '봉투 들고 도망 중');
  e.tieT = 3; const y0 = e.y;
  run(g, 2.5);
  assert.ok(Math.abs(e.y - y0) < 0.5, '묶인 동안 제자리');
  run(g, 1);
  assert.ok(e.y < y0 - 20, '풀리면 다시 도망');
  // 임수빈: 기본 공격(부케)이 진상을 묶는다 · 봉투 든 도둑은 더 오래
  const g2 = bare(['subin'], { god: true });
  const h = g2.heroes[0];
  const t = S.spawnEnemy(g2, 'envthief', h.x, g2.ropeY - 30, { hpMul: 200 });
  let tie = null;
  for (let k = 0; k < 60 * 8 && !tie; k++) { S.step(g2, 1 / 60); tie = g2.events.find((v) => v.type === 'c8tie' && v.env) || null; g2.events.length = 0; }
  assert.ok(tie, '도망가는 도둑을 묶었다');
  assert.ok(tie.sec >= D.HEROES.subin.tie.sec[0] * D.HEROES.subin.tie.thief * 0.99, '도둑은 1.6배 오래');
  assert.ok(!t.dead || g2.stats.envStolen === undefined || g2.stats.envStolen === 0);
  // 부케 토스: 범위 묶기 + 받는 피해 ↑ · 보스는 묶이지 않고 느려짐
  const g3 = bare(['subin'], { god: true });
  const s3 = g3.heroes[0];
  const a = S.spawnEnemy(g3, 'drunkfriend', 180, 300, { hpMul: 100 }); a.speed = 0;
  const b = S.spawnEnemy(g3, 'boss_bestman', 200, 300, { hpMul: 1 });
  s3.skillCd = 0;
  assert.ok(S.castSkill(g3, s3, 185, 300));
  for (let k = 0; k < 20; k++) S.step(g3, 1 / 60); // (대개편: 댄스 플로어 — 첫 박자에 휘감는다)
  assert.ok(a.tieT > 0.5 && a.tieAmpT > 0, '묶임 + 약점');
  assert.ok(!(b.tieT > 0) && b.slowT > 0, '보스는 느려짐');
  const hp = a.hp; S.damageEnemy(g3, a, 100, false, null); assert.ok(hp - a.hp > 100 * 1.2, '묶인 진상은 더 아프다');
});

test('신랑 친구 대표: 끝없는 축사 — 무적 · 게이지를 채우거나 총공지로 끊으면 기절 + 빈틈 · 다 들으면 입구 피해 + 졸음', () => {
  const sp = D.ENEMIES.boss_bestman.speech;
  const g = bare(['gunman']);
  const e = S.spawnEnemy(g, 'boss_bestman', 180, 260, {}); e.speed = 0; e.speechCd = 0.05;
  run(g, 0.2);
  assert.ok(e.speechT > 0, '축사 시작');
  assert.ok(g.events.some((v) => v.type === 'c8speech'));
  const hp = e.hp;
  assert.equal(S.damageEnemy(g, e, 5000, false, g.heroes[0]), 0, '축사 중 무적');
  assert.equal(e.hp, hp);
  for (let i = 0; i < sp.need; i++) S.damageEnemy(g, e, 10, false, g.heroes[0]);
  assert.equal(e.speechT, 0, '게이지가 다 차서 끊김');
  assert.ok(e.stunT > 0 && e.weakT > 0, '기절 + 빈틈');
  assert.ok(g.events.some((v) => v.type === 'c8speechCut'));
  S.damageEnemy(g, e, 100, false, g.heroes[0]); assert.ok(e.hp < hp, '끊긴 뒤엔 맞는다');
  // 총공지로 바로 끊기
  const g2 = bare([]);
  const e2 = S.spawnEnemy(g2, 'boss_bestman', 180, 260, {}); e2.speed = 0; e2.speechCd = 0.05;
  run(g2, 0.2); assert.ok(e2.speechT > 0);
  g2.ult = D.RULES.ultMax; g2.mom = null;
  assert.ok(S.useUlt(g2)); assert.equal(e2.speechT, 0, '총공지로 끊김');
  // 끝까지 들으면: 입구 피해 + 멤버 졸음
  const g3 = bare(['gunman']);
  g3.heroes[0].dmg = 0;
  const e3 = S.spawnEnemy(g3, 'boss_bestman', 180, 200, {}); e3.speed = 0; e3.speechCd = 0.05;
  g3.heroes[0].stunT = 99; // 아무도 안 때린다
  const door = g3.base.hp;
  run(g3, sp.sec + 0.5);
  assert.ok(g3.events.some((v) => v.type === 'c8speechEnd') || g3.stats.speechFull === 1, '축사 끝까지');
  assert.ok(g3.base.hp < door, '입구 피해');
});

test('8장 진상 기술: 뷔페 회복 · 축가 공속↓(기절로 끊김) · 실장님 재촉', () => {
  const g = bare(['gunman'], { god: true });
  const bf = S.spawnEnemy(g, 'buffet', 180, 300, {}); bf.speed = 0;
  const o = S.spawnEnemy(g, 'drunkfriend', 200, 300, {}); o.speed = 0; o.hp = o.maxHp * 0.5;
  g.heroes[0].stunT = 99;
  run(g, D.ENEMIES.buffet.eat.first + 1.2);
  assert.ok(o.hp > o.maxHp * 0.55, '곁의 진상 회복');
  const g2 = bare(['gunman'], { god: true });
  const h = g2.heroes[0]; h.stunT = 0;
  const bs = S.spawnEnemy(g2, 'badsinger', h.x, 300, { hpMul: 100 }); bs.speed = 0; bs.singCd = 0.05;
  run(g2, 0.1); assert.ok(bs.singW > 0, '숨 들이쉬기');
  bs.stunT = 1; run(g2, 0.1); assert.equal(bs.singW, 0, '기절시키면 끊김');
  bs.stunT = 0; bs.singCd = 0.05; run(g2, D.ENEMIES.badsinger.sing.windup + 0.3);
  assert.ok(h.aspdDebT > 0, '음 이탈 → 공속↓');
  const g3 = bare([], { god: true });
  const m = S.spawnEnemy(g3, 'mid_hallmgr', 180, 200, {}); m.speed = 0; m.hurryCd = 0.05;
  const x = S.spawnEnemy(g3, 'drunkfriend', 200, 220, {}); x.speed = 0;
  run(g3, D.ENEMIES.mid_hallmgr.hurry.windup + 0.4);
  assert.ok(x.rushT > 0, '"시간 없어요!" 재촉');
});

test('임수빈: 모집 멤버 + 8-5 클리어 확정 합류 · 도감 · 전용 신화 · 서버와 같은 목록', () => {
  const h = D.HEROES.subin;
  assert.ok(h && h.gacha && h.skill.id === 'bouqtoss' && h.proj === 'bouquet');
  assert.equal(D.heroTier('subin'), 3); assert.equal(R.HERO_TIER.subin, 3);
  assert.ok(D.GACHA_HEROES.includes('subin') && R.GACHA.includes('subin') && R.LB_HEROES.includes('subin'));
  assert.equal(D.HERO_UNLOCK.subin, 75); assert.equal(R.HERO_UNLOCK.subin, 75);
  assert.equal(L.heroUnlocked({ stages: { 74: 3 } }, 'subin'), false, '8-4 까지는 아직');
  assert.equal(L.heroUnlocked({ stages: { 75: 1 } }, 'subin'), true, '8-5 클리어 → 합류');
  assert.equal(L.heroUnlocked({ owned: { subin: true } }, 'subin'), true, '모집 카드로도');
  assert.equal(R.heroUnlocked({ stages: { 75: 1 } }, 'subin'), true);
  assert.equal(R.heroUnlocked({ stages: {} }, 'subin'), false);
  assert.ok(D.SIG.subin && R.SIG.subin && D.SIG.subin.name === R.SIG.subin.name);
  assert.equal(D.HERO_ANIM.subin.release, 3);
  assert.ok(F.FLAVOR.subin && D.HERO_ROLE.subin === 'ctrl');
  for (const p of ['/img/lb/h_subin.webp', '/img/lb/h_subin_attack.webp', '/img/lb/fx/p_bouquet.webp', '/img/lb/dex/subin.webp', '/img/lb/dexhq/subin.webp', '/img/lb/dexhq/thumb/subin.webp', '/img/lb/ui2/sk_subin.webp']) assert.ok(IMG(p), p);
});
