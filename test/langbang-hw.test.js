'use strict';
// 할로윈 이벤트 「할로윈 저주의 밤」: 시즌 잠금 · 출전 제한 확인 · 전투력 맞춤 · 저주 점수 · 사탕 · 상점 · 의상 · 전투 규칙 · 서버 길 (조작 방지)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createServer } = require('../server/index');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let D, S, H, L;
let srv, base;
const KST = 9 * 3600e3;
const IN = Date.UTC(2026, 9, 20, 3) ; // 10/20 12시 (한국)
const OUT = Date.UTC(2026, 10, 10, 3); // 11/10 (기간 밖)
test.before(async () => {
  D = await load('data.js'); S = await load('sim.js'); H = await load('hw-event.js'); L = await load('live.js');
  srv = createServer({ port: 0, pace: 0.05, limits: { createGapMs: 0, roomsPerIp: 1000 } });
  base = `http://127.0.0.1:${await srv.listen()}`;
});
test.after(async () => { await srv.close(); });
function seeded(seed = 1) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
function lbOf(extra = {}) {
  const raw = Object.assign({ stages: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3])), heroes: {}, coins: 0, tickets: 0, gear: [], gearSeq: 0, titles: [], frames: [] }, extra);
  const out = Object.assign({}, raw);
  L.normLive(raw, out);
  H.normHw(raw, out); H.normSkins(raw, out);
  out.maxStage = Object.keys(raw.stages).length; out.stages = raw.stages; out.gear = raw.gear; out.titles = out.titles || []; out.frames = out.frames || [];
  return out;
}

test('시즌 잠금: 10/7 ~ 11/2 한국 시간만 · 3-10 을 깨야 열림', () => {
  assert.equal(H.hwSeason(Date.UTC(2026, 9, 6, 14, 59)), false, '10/6 23:59 KST');
  assert.equal(H.hwSeason(Date.UTC(2026, 9, 6, 15, 0)), true, '10/7 00:00 KST');
  assert.equal(H.hwSeason(Date.UTC(2026, 10, 2, 14, 59)), true, '11/2 23:59 KST');
  assert.equal(H.hwSeason(Date.UTC(2026, 10, 2, 15, 0)), false, '11/3 00:00 KST');
  assert.equal(H.hwOpen(lbOf(), IN), true);
  assert.equal(H.hwOpen(lbOf({ stages: { 1: 3 } }), IN), false, '3-10 전엔 잠김');
  assert.equal(H.hwOpen(lbOf(), OUT), false, '기간 밖');
  const lb = lbOf();
  assert.match(H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'] }, 'r1', OUT).error, /기간/);
});

test('출전 제한: 금지 · 필요 · 인원 · 대여 확인 + 추천', () => {
  const all = () => true;
  // 2: 원거리만 (김도훈 사거리 210 금지)
  let c = H.checkDeck(2, ['gunman', 'dohoon'], all);
  assert.equal(c.ok, false); assert.ok(c.errs.some((e) => e.rule === 'ranged' && e.hero === 'dohoon'));
  assert.equal(H.checkDeck(2, ['gunman', 'staff', 'sunggu'], all).ok, true);
  // 3: 서포터 2명
  assert.equal(H.checkDeck(3, ['gunman', 'gunnyeo'], all).ok, false);
  assert.equal(H.checkDeck(3, ['gunman', 'gunnyeo', 'dohoon'], all).ok, true);
  // 8: 4명만 + 서포터 2명
  c = H.checkDeck(8, ['gunnyeo', 'dohoon', 'gunman', 'staff', 'eunok'], all);
  assert.equal(c.ok, false); assert.equal(c.max, 4);
  // 6: 술 속성만
  assert.equal(H.checkDeck(6, ['eunok', 'gunman'], all).ok, false);
  assert.equal(H.checkDeck(6, ['eunok', 'dohoon', 'ara'], all).ok, true);
  // 9: 여자 멤버만
  assert.equal(H.checkDeck(9, ['staff', 'gunman'], all).ok, false);
  // 10: 독 면역 필수 — 홍정민이 없으면 한 명은 빌릴 수 있다 (조건 멤버만)
  const own = (h) => h !== 'jungmin' && h !== 'soyoung';
  assert.equal(H.checkDeck(10, ['gunnyeo', 'gunman'], own).ok, false);
  c = H.checkDeck(10, ['gunnyeo', 'gunman', 'jungmin'], own, 'jungmin');
  assert.equal(c.ok, true, JSON.stringify(c.errs)); assert.equal(c.rent, 'jungmin');
  assert.equal(H.checkDeck(10, ['gunnyeo', 'jungmin', 'soyoung'], own, 'soyoung').ok, false, '조건 멤버가 아니면 못 빌림');
  assert.equal(H.checkDeck(1, ['hochan', 'gunman'], all).ok, false, 'LEGEND 금지');
  // 추천: 가진 조건 멤버 → 없으면 빌릴 멤버
  const sg = H.suggest(10, ['gunman'], own, () => 1);
  assert.deepEqual(sg.needs[0].rent, ['jungmin']);
  const sg2 = H.suggest(3, ['gunman'], () => true, (h) => (h === 'dohoon' ? 9 : 1));
  assert.equal(sg2.needs[0].need, 2); assert.equal(sg2.needs[0].mine[0], 'dohoon');
});

test('전투력 맞춤: 강화 +12 · ★3 · 영웅 장비 — 더 키운 멤버는 조금만 (+4 마다 +1 · 최대 +2) · 빌린 멤버는 그대로', () => {
  assert.equal(H.syncMeta(5), 5); assert.equal(H.syncMeta(12), 12); assert.equal(H.syncMeta(15), 12); assert.equal(H.syncMeta(16), 13); assert.equal(H.syncMeta(20), 14); assert.equal(H.syncMeta(20, true), 12);
  assert.equal(H.syncStar(5), 3); assert.equal(H.syncStar(1), 1); assert.equal(H.syncStar(1, true), 3);
  const p = { heroes: { gunman: 20, staff: 4 }, hstars: { gunman: 5 }, equip: { gunman: { w: 1 } }, gear: [{ id: 1, t: Object.keys(D.GEAR).find((t) => D.GEAR[t].slot === 'w' && !D.GEAR[t].hero && !D.GEAR[t].myth), r: 'legend', lv: 10 }] };
  const lo = H.syncLoadout(p, ['gunman', 'staff', 'jungmin'], 'jungmin');
  assert.deepEqual(lo.meta, { gunman: 14, staff: 4, jungmin: 12 });
  assert.deepEqual(lo.stars, { gunman: 3, staff: 1, jungmin: 3 });
  const legend = D.gearStats([{ t: p.gear[0].t, r: 'legend', lv: 10 }]), epic = D.gearStats([{ t: p.gear[0].t, r: 'epic', lv: 10 }]);
  const k = Object.keys(legend).find((x) => typeof legend[x] === 'number' && legend[x] > 0);
  assert.ok(lo.gear.gunman[k] <= epic[k] + 1e-9 && lo.gear.gunman[k] < legend[k], '전설 장비 → 영웅 값');
});

test('저주: 점수 · 순서 (+40% 는 +20% 다음) · 배율 · 랭킹 점수', () => {
  assert.deepEqual(H.cleanCurses(['hp60']), [], '+40% 혼자는 안 됨');
  assert.deepEqual(H.cleanCurses(['hp30', 'hp60', 'bogus', 'hp30']), ['hp30', 'hp60']);
  assert.equal(H.curseScore(['hp30', 'hp60', 'stun2']), 3 + 5 + 2);
  const m = H.curseMul(['hp30', 'hp60', 'norepair', 'stun2', 'short', 'puddle', 'twin', 'dark', 'door']);
  assert.ok(Math.abs(m.hp - 1.4) < 1e-9); assert.equal(m.repair, 0); assert.equal(m.cc, 2); assert.equal(m.wind, 0.6); assert.equal(m.puddle, 1); assert.equal(m.twin, 1); assert.equal(m.door, 0.7);
  assert.equal(H.stageScore(0, 100), 1300); assert.equal(H.stageScore(10, 50), 1000 + 2500 + 150);
  assert.ok(H.CURSE_MAX >= 25);
  // 보스 둘: 마지막 웨이브에 저승사자
  assert.equal(H.waveDef(10, 5, ['twin']).boss2, 'hw_reaper');
  assert.equal(H.waveDef(4, 5, ['twin']).mid, 'hw_reaper');
  // 저주가 전투에 들어간다
  const def = H.eventDef(1, ['hp30', 'norepair', 'stun2', 'short', 'door'], ['gunman']);
  const g = S.createGame({ H: 760, rng: seeded(3), mode: 'stage', tempo: true, stage: def.stage, event: def, deck: [null, null, 'gunman', null, null, null] });
  assert.ok(Math.abs(g.mods.enemyHp - 1.2) < 1e-9); assert.equal(g.mods.healMul, 0); assert.equal(g.ccMul, 2); assert.equal(g.windMul, 0.6);
  assert.equal(g.base.max, Math.round(D.RULES.baseHp * 0.7));
  assert.equal(g.totalWaves, 5); assert.ok(g.hw && g.ev);
});

test('이벤트 전투: 할로윈 진상만 · 좀비 부활 · 화상이면 못 일어남 · 호박씨 · 명부', () => {
  const def = H.eventDef(1, [], ['gunman']);
  const g = S.createGame({ H: 760, rng: seeded(5), mode: 'stage', tempo: true, stage: def.stage, event: def, deck: [null, null, 'gunman', null, null, null] });
  for (let t = 0; t < 40; t += 1 / 60) { S.step(g, 1 / 60); g.events.length = 0; }
  assert.ok(g.enemies.length > 0 && g.enemies.every((e) => e.type.startsWith('hw_')), '할로윈 진상만');
  // 좀비: 쓰러지면 한 번 일어난다 (멤버 없는 판에서 · 특수 규칙이 없는 H3)
  const def3 = H.eventDef(3, [], []);
  const gz = S.createGame({ H: 760, rng: seeded(7), mode: 'stage', tempo: true, stage: def3.stage, event: def3, deck: [null, null, null, null, null, null], noWaves: true });
  gz.phase = 'wave'; gz.spawnQ = []; gz.spawnI = 0;
  const z = S.spawnEnemy(gz, 'hw_zombie', 180, 300); z.speed = 0;
  S.spawnEnemy(gz, 'hw_bat', 10, 10).speed = 0; // (웨이브가 끝나지 않게)
  S.damageEnemy(gz, z, 1e7, false, null);
  assert.equal(z.dead, false); assert.ok(z.hwRiseT > 0);
  for (let t = 0; t < 2.5; t += 1 / 60) { S.step(gz, 1 / 60); gz.events.length = 0; }
  assert.ok(!z.dead && z.hp > z.maxHp * 0.4, '다시 일어남');
  S.damageEnemy(gz, z, 1e7, false, null);
  assert.equal(z.dead, true, '두 번째는 끝');
  const z2 = S.spawnEnemy(g, 'hw_zombie', 180, 300); z2.burnT = 2;
  S.damageEnemy(g, z2, 1e7, false, null);
  assert.equal(z2.dead, true, '화상이면 못 일어남');
  // 호박: 쓰러지면 호박씨 둘
  const n0 = g.enemies.filter((e) => !e.dead && e.type === 'hw_seed').length;
  const pk = S.spawnEnemy(g, 'hw_pumpkin', 180, 300);
  S.damageEnemy(g, pk, 1e7, false, null);
  assert.equal(g.enemies.filter((e) => !e.dead && e.type === 'hw_seed').length - n0, 2);
  // 저승사자 팀장: 명부 → 시간 안에 못 끊으면 쓰러짐 게이지 · 기절 / 기절시키면 지워짐
  const g2 = S.createGame({ H: 760, rng: seeded(9), mode: 'stage', tempo: true, stage: def.stage, event: def, deck: [null, null, 'gunman', 'staff', null, null], noWaves: true });
  g2.hw.tick = g2.hw.tick; g2.phase = 'wave'; g2.spawnQ = []; g2.spawnI = 0;
  const rp = S.spawnEnemy(g2, 'hw_reaper', 180, 200); rp.speed = 0; rp.hwListT = 0.01;
  for (let t = 0; t < 0.2; t += 1 / 60) { S.step(g2, 1 / 60); g2.events.length = 0; }
  assert.equal(g2.hw.marks.length, 1, '명부에 이름');
  rp.stunT = 1;
  for (let t = 0; t < 0.2; t += 1 / 60) { S.step(g2, 1 / 60); g2.events.length = 0; }
  assert.equal(g2.hw.marks.length, 0, '기절시키면 끊김');
});

test('사탕 · 기록: 첫 클리어 · 저주 기록 · 하루 한도 · 의상 보너스 · 조작 방지', () => {
  const lb = lbOf({ heroes: { gunman: 12 } });
  let r = H.hwStart(lb, { n: 2, deck: ['gunman'] }, 'a', IN);
  assert.match(r.error, /앞 스테이지/);
  r = H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'], curses: ['hp30'] }, 'a', IN);
  assert.match(r.error, /한 번 깬/);
  r = H.hwStart(lb, { n: 1, deck: ['gunman', 'hochan'] }, 'a', IN);
  assert.ok(r.error, 'LEGEND 금지 / 없는 멤버');
  r = H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'] }, 'run1', IN);
  assert.ok(r.runId);
  assert.ok(H.hwFinish(lb, { runId: 'run1', clear: true, durationSec: 10, kills: 50, door: 80 }, 'u', IN + 300e3).error, '너무 빠름');
  r = H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'] }, 'run2', IN);
  assert.ok(H.hwFinish(lb, { runId: 'run2', clear: true, durationSec: 200, kills: 99999, door: 80 }, 'u', IN + 300e3).error, '처치 수 상한');
  r = H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'] }, 'run3', IN);
  const f = H.hwFinish(lb, { runId: 'run3', clear: true, durationSec: 200, kills: 200, door: 80 }, 'u', IN + 300e3);
  assert.equal(f.first, true); assert.equal(f.parts.first, H.firstCandy(1)); assert.equal(f.score, H.stageScore(0, 80));
  assert.equal(lb.hw.candy, f.candy); assert.equal(lb.hw.score, f.score);
  assert.equal(H.hwFinish(lb, { runId: 'run3', clear: true, durationSec: 200, kills: 200, door: 80 }, 'u', IN + 300e3).error !== undefined, true, '같은 판 두 번 안 됨');
  // 저주 걸고 다시 → 새 기록 보너스 · 점수 오름
  r = H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'], curses: ['hp30', 'stun2'] }, 'run4', IN);
  assert.equal(r.heat, 5);
  const f2 = H.hwFinish(lb, { runId: 'run4', clear: true, durationSec: 220, kills: 200, door: 50 }, 'u', IN + 600e3);
  assert.equal(f2.parts.heat, H.heatCandy(5)); assert.ok(f2.best); assert.equal(lb.hw.best[1].heat, 5);
  // 하루 한도
  let got = 0;
  for (let i = 0; i < 40; i++) { H.hwStart(lb, { n: 1, deck: ['gunman', 'staff'] }, 'x' + i, IN); const q = H.hwFinish(lb, { runId: 'x' + i, clear: true, durationSec: 200, kills: 100, door: 10 }, 'u', IN + 900e3); got += q.parts.clear; }
  assert.ok(lb.hw.dayGot <= H.HW.dayCap && got <= H.HW.dayCap);
  // 의상 보너스
  lb.skins = { own: ['gunnyeo_hw'], on: { gunnyeo: 'gunnyeo_hw' } };
  assert.equal(H.wearBonus(lb, ['gunnyeo', 'gunman']), H.HW.wear);
  lb.hw.day = -1; lb.hw.dayGot = 0;
  H.hwStart(lb, { n: 1, deck: ['gunnyeo', 'gunman'] }, 'w1', IN);
  const fw = H.hwFinish(lb, { runId: 'w1', clear: true, durationSec: 200, kills: 100, door: 10 }, 'u', IN + 900e3);
  assert.equal(fw.parts.wear, Math.round(fw.parts.clear * H.HW.wear));
});

test('사탕 상점 · 의상 입기 (기간이 지나도 의상은 그대로)', () => {
  const lb = lbOf({ hw: { id: 'hw2026', candy: 5000, best: {}, buy: {} } });
  assert.equal(lb.hw.candy, 5000);
  let r = H.shopBuy(lb, 'gunnyeo_hw', 'u', IN);
  assert.deepEqual(r.got, { costume: 'gunnyeo_hw' }); assert.equal(lb.hw.candy, 5000 - 900);
  assert.match(H.shopBuy(lb, 'gunnyeo_hw', 'u', IN).error, /이미|다 샀/);
  assert.ok(H.wearSkin(lb, 'gunnyeo', 'hochan_hw').error, '다른 멤버 의상');
  assert.ok(H.wearSkin(lb, 'hochan', 'hochan_hw').error, '없는 의상');
  assert.deepEqual(H.wearSkin(lb, 'gunnyeo', 'gunnyeo_hw').on, { gunnyeo: 'gunnyeo_hw' });
  r = H.shopBuy(lb, 'hwticket', 'u', IN); assert.equal(r.got.tickets, 1);
  r = H.shopBuy(lb, 'hwdragon', 'u', IN); assert.equal(lb.shards.dragon, 10);
  r = H.shopBuy(lb, 'hwtitle', 'u', IN); assert.ok(lb.titles.includes('hwsurvivor'));
  assert.ok(L.titleName('hwsurvivor') && L.titleName('hwking') && L.FRAMES.hwframe);
  assert.match(H.shopBuy(lb, 'hwstones', 'u', OUT).error, /끝났/);
  // 다음 해: 이벤트 기록은 지우고 의상은 남는다
  const raw = JSON.parse(JSON.stringify(lb)); raw.hw.id = 'hw2025';
  const nx = {}; H.normHw(raw, nx); H.normSkins(raw, nx);
  assert.equal(nx.hw.candy, 0); assert.deepEqual(nx.skins.on, { gunnyeo: 'gunnyeo_hw' });
  // 가짜 의상 · 남의 의상은 버린다
  const bad = {}; H.normSkins({ skins: { own: ['gunnyeo_hw', 'fake'], on: { gunnyeo: 'gunnyeo_hw', hochan: 'gunnyeo_hw', ara: 'ara_hw' } } }, bad);
  assert.deepEqual(bad.skins, { own: ['gunnyeo_hw'], on: { gunnyeo: 'gunnyeo_hw' } });
});

test('이벤트 진상은 도감 · 수집 보너스 밖 · 그림은 처음에 안 받는다 (lazy)', () => {
  for (const id of H.HW_ENEMY_IDS) { assert.ok(D.ENEMIES[id], id); assert.equal(D.ENEMIES[id].eventOnly, true); assert.equal(D.ENEMIES[id].lazy, true); assert.ok(D.enemySkills(id).length || id === 'hw_seed', id + ' 기술 설명'); }
  assert.ok(D.BOSS_KITS.hw_dracula && D.MID_KITS.hw_reaper);
  for (const s of H.STAGES) { for (const r of s.rules) assert.ok(H.RULES[r], r); for (let w = 1; w <= H.WAVES; w++) { const d = H.waveDef(s.n, w); assert.ok(d.g.length > 0); for (const x of d.g) assert.ok(D.ENEMIES[x[0]] && D.ENEMIES[x[0]].eventOnly, x[0]); } }
  assert.ok(H.STAGES.some((s) => s.boss === 'hw_dracula'));
});

test('이벤트 서버: 시즌 · 출전 제한 확인 · 판 번호 · 점수 서버 계산 · 랭킹 · 상점 · 의상', async () => {
  const realNow = Date.now;
  Date.now = () => IN;
  try {
    const post = (url, token, body) => fetch(base + url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(body) }).then((x) => x.json());
    const get = (url, token) => fetch(base + url, { headers: token ? { authorization: 'Bearer ' + token } : {} }).then((r) => r.json());
    const { token, user } = await srv.accounts.signup({ username: 'pumpkin', password: 'secret12', nickname: '호박' });
    let r = await post('/api/langbang/hw/start', token, { n: 1, deck: ['gunman', 'staff'] });
    assert.equal(r.ok, false, '3-10 전엔 잠김');
    const st = (await srv.accounts.store.byId(user.id)).stats;
    st.langbang = Object.assign(st.langbang || {}, { stages: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [i + 1, 3])) });
    r = await post('/api/langbang/hw/start', token, { n: 2, deck: ['dohoon', 'gunman'] });
    assert.equal(r.ok, false, '앞 스테이지');
    r = await post('/api/langbang/hw/start', token, { n: 1, deck: ['gunman', 'staff', 'hochan'] });
    assert.equal(r.ok, false, '없는 멤버 / LEGEND');
    r = await post('/api/langbang/hw/start', token, { n: 1, deck: ['gunman', 'staff'] });
    assert.equal(r.ok, true, r.message); assert.ok(r.runId);
    Date.now = () => IN + 400e3;
    const fin = await post('/api/langbang/hw/finish', token, { runId: r.runId, clear: true, durationSec: 240, kills: 150, door: 90, candy: 999999, score: 999999 });
    assert.equal(fin.ok, true, fin.message);
    assert.equal(fin.score, 1000 + 270); assert.equal(fin.candy, H.firstCandy(1) + H.clearCandy(1, 0));
    assert.equal(fin.profile.hw.candy, fin.candy);
    assert.equal((await post('/api/langbang/hw/finish', token, { runId: r.runId, clear: true, durationSec: 240 })).ok, false, '같은 판 다시 안 됨');
    const bd = await get('/api/langbang/hw', token);
    assert.equal(bd.top[0].username, 'pumpkin'); assert.equal(bd.me.rank, 1); assert.equal(bd.me.score, 1270);
    // 상점 · 의상
    (await srv.accounts.store.byId(user.id)).stats.langbang.hw.candy = 2000;
    r = await post('/api/langbang/hw/shop', token, { id: 'ara_hw' });
    assert.equal(r.ok, true, r.message); assert.ok(r.profile.skins.own.includes('ara_hw'));
    r = await post('/api/langbang/hw/wear', token, { hero: 'ara', id: 'ara_hw' });
    assert.equal(r.ok, true, r.message); assert.deepEqual(r.profile.skins.on, { ara: 'ara_hw' });
    // 기간이 끝나면 새 판은 못 열지만 의상은 남는다 · 순위 보상
    Date.now = () => OUT;
    r = await post('/api/langbang/hw/start', token, { n: 1, deck: ['gunman', 'staff'] });
    assert.equal(r.ok, false);
    r = await post('/api/langbang/hw/claim', token, {});
    assert.equal(r.ok, true, r.message); assert.equal(r.rank, 1); assert.ok(r.profile.titles.includes('hwking'));
    assert.equal((await post('/api/langbang/hw/claim', token, {})).ok, false, '한 번만');
    const me = await get('/api/langbang/me', token);
    assert.deepEqual(me.profile.skins.on, { ara: 'ara_hw' });
  } finally { Date.now = realNow; }
});
void KST;

test('H1 해장 · H2 호박등: 특수 규칙 멤버가 있어야 풀린다', () => {
  // H1: 해장 멤버가 없으면 4번까지 엎어졌다 일어난다 (엎어진 동안은 안 맞음) · 해장 멤버가 마무리하면 바로 끝
  const def = H.eventDef(1, [], ['gunman']);
  assert.equal(def.sig.id, 'hangover');
  const mk = (deck) => { const g = S.createGame({ H: 760, rng: seeded(9), mode: 'stage', tempo: true, stage: def.stage, event: def, deck, noWaves: true }); g.phase = 'wave'; g.spawnQ = []; g.spawnI = 0; S.spawnEnemy(g, 'hw_bat', 10, 10).speed = 0; return g; };
  const g = mk([null, null, null, null, null, null]);
  const z = S.spawnEnemy(g, 'hw_zombie', 180, 300); z.speed = 0;
  const gm = { id: 'gunman' }; // (해장 멤버가 아닌 멤버의 한 방 — 멤버 없는 판이라 저절로 맞지 않게)
  for (let i = 0; i < 4; i++) {
    S.damageEnemy(g, z, 1e7, false, gm);
    assert.equal(z.dead, false, `${i + 1}번째도 일어남`); assert.ok(z.hwLie);
    assert.equal(S.damageEnemy(g, z, 1e7, false, gm), 0, '엎어진 동안은 안 맞음');
    for (let t = 0; t < 2.5; t += 1 / 60) { S.step(g, 1 / 60); g.events.length = 0; }
    assert.ok(!z.hwLie && !z.dead);
  }
  S.damageEnemy(g, z, 1e7, false, gm);
  assert.equal(z.dead, true, '다섯 번째는 뻗음');
  const g2 = mk([null, null, 'eunok', 'jiwon', null, null]);
  const z2 = S.spawnEnemy(g2, 'hw_zombie', 180, 300); z2.speed = 0;
  S.damageEnemy(g2, z2, 1e7, false, g2.heroes.find((h) => h.id === 'eunok'));
  assert.equal(z2.dead, true, '해장 멤버가 마무리하면 끝');
  // H2: 불 붙은 호박등은 껍질 (피해 −85%) · 끊는 멤버가 맞히면 꺼지고 깨진다 · 입구에 닿으면 펑
  const d2 = H.eventDef(2, [], ['staff']);
  assert.equal(d2.sig.id, 'lantern');
  const g3 = S.createGame({ H: 760, rng: seeded(11), mode: 'stage', tempo: true, stage: d2.stage, event: d2, deck: [null, null, 'staff', 'ara', null, null], noWaves: true });
  g3.phase = 'wave'; g3.spawnQ = []; g3.spawnI = 0; S.spawnEnemy(g3, 'hw_bat', 10, 10).speed = 0;
  const p = S.spawnEnemy(g3, 'hw_pumpkin', 180, 200); p.speed = 0;
  S.step(g3, 1 / 60); g3.events.length = 0;
  assert.ok(p.hwLit, '불 붙음');
  const ara = g3.heroes.find((h) => h.id === 'ara'), st = g3.heroes.find((h) => h.id === 'staff');
  const hp0 = p.hp; S.damageEnemy(g3, p, 10, false, ara);
  assert.ok(hp0 - p.hp < 3, '껍질');
  S.damageEnemy(g3, p, 1, false, st);
  assert.ok(!p.hwLit && p.hwCracked, '끊는 멤버가 끔');
  const g4 = S.createGame({ H: 760, rng: seeded(13), mode: 'stage', tempo: true, stage: d2.stage, event: d2, deck: [null, null, null, null, null, null], noWaves: true });
  g4.phase = 'wave'; g4.spawnQ = []; g4.spawnI = 0; S.spawnEnemy(g4, 'hw_bat', 10, 10).speed = 0;
  const q = S.spawnEnemy(g4, 'hw_pumpkin', 220, 200);
  const door = g4.base.hp;
  for (let t = 0; t < 30 && !q.dead; t += 1 / 60) { S.step(g4, 1 / 60); g4.events.length = 0; }
  assert.ok(q.dead && g4.base.hp < door - g4.base.max * 0.05, '입구에 닿으면 펑');
});
