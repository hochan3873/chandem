'use strict';
// 랑방 레벨업 카드 쉬운 말 (public/langbang/cardtext.js): 멤버 스킬 한 줄 요약 · 카드 한 줄 · 「스킬」은? · 전 → 후 숫자
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const load = (f) => import(pathToFileURL(path.join(__dirname, '..', 'public', 'langbang', f)).href);
let T, S, D;
test.before(async () => { [T, S, D] = await Promise.all([load('cardtext.js'), load('sim.js'), load('data.js')]); });
function seeded(seed = 1) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const game = (heroes, o = {}) => S.createGame(Object.assign({ rng: seeded(7), noWaves: true, mode: 'stage', stage: 3, tempo: true, heroes }, o));

test('멤버마다 스킬 · 기본 공격 한 줄 요약 (22자 이하 · 좋은 판)', () => {
  for (const id of Object.keys(D.HEROES)) {
    const sp = T.skillPlain(id);
    assert.ok(sp, id);
    assert.ok(T.SKILL_PLAIN[id], `요약 표에 없음: ${id}`);
    for (const k of ['sk', 'atk']) {
      assert.ok(sp[k] && sp[k].length <= 22, `${id}.${k} "${sp[k]}" (${sp[k] && sp[k].length}자)`);
    }
    assert.ok(sp.good, id);
    if (D.HEROES[id].skill) assert.equal(sp.name, D.HEROES[id].skill.name);
  }
  assert.equal(T.skillPlain('없는멤버'), null);
});

test('멤버 전용 스킬 증강은 모두 쉬운 한 줄이 있다', () => {
  for (const [hid, list] of Object.entries(D.SKILL_AUG)) for (const a of list) {
    const line = T.AUG_PLAIN[`${hid}:${a.id}`];
    assert.ok(line, `${hid}:${a.id}`);
    assert.ok(line.length <= 24, `${hid}:${a.id} "${line}"`);
  }
});

test('받침에 따라 은/는 · 「스킬」은? 문장', () => {
  assert.equal(T.josa('퀵드로우', '은', '는'), '는');
  assert.equal(T.josa('레드카드 퇴장', '은', '는'), '은');
  assert.equal(T.josa('집합!', '은', '는'), '은');
  assert.equal(T.josa('ABC', '은', '는'), '은(는)');
  assert.equal(T.qText({ term: '퀵드로우', text: '1.2초 동안 권총을 마구 연사' }), '「퀵드로우」는? 1.2초 동안 권총을 마구 연사');
  assert.equal(T.qText(null), '');
});

test('카드 설명 속 낯선 낱말을 풀어 준다 (없으면 그 멤버 스킬)', () => {
  assert.deepEqual(T.termFor('hyungyeong', '날씬 모드 +5초'), { term: '날씬 모드', text: T.SKILL_PLAIN.hyungyeong.gl[0][1] });
  assert.equal(T.termFor('gunman', '퀵드로우 +0.6초 · 피해 +20%').term, '퀵드로우');
  assert.equal(T.termFor('gunman', '아무 말').term, '퀵드로우');
  assert.equal(T.termFor('없는멤버', 'x'), null);
});

test('공용 카드: 쉬운 한 줄 + 원래 이름은 부제 + 지금 → 고르면', () => {
  const g = game(['gunman', 'staff', 'eunok', 'hyungyeong']);
  const pool = S.cardPool(g);
  const by = (id) => pool.find((c) => c.id === id);
  const dmg = T.cardPlain(by('dmg'), g);
  assert.match(dmg.head, /^모든 멤버 공격력 \+\d+%$/);
  assert.equal(dmg.name, '회식 버프');
  assert.equal(T.baText(dmg.ba[0]), `모든 멤버 공격력 +0% → ${dmg.head.split(' ').pop()}`);
  // 건전남 연발: 지금 레벨의 연발 수 → +1
  const gh = g.heroes.find((h) => h.id === 'gunman');
  const gun = T.cardPlain(by('gunExtra'), g);
  const n0 = D.HEROES.gunman.pistol.n[gh.lv - 1];
  assert.deepEqual(gun.ba[0], { k: '건전남 한 번에', a: `${n0}발`, b: `${n0 + 1}발` });
  // 스킬 연습: 실제 쿨타임 초가 줄어든다
  const cd = T.cardPlain(by('cdCut'), g);
  assert.match(cd.head, /쿨타임 −\d+%/);
  const m = /^(\d+(?:\.\d)?)초$/.exec(cd.ba[0].a), m2 = /^(\d+(?:\.\d)?)초$/.exec(cd.ba[0].b);
  assert.ok(m && m2 && Number(m2[1]) < Number(m[1]), T.baText(cd.ba[0]));
  // 폭발 증폭: 대상 멤버 · 범위 100% → 1xx%
  g.stacks.tag_splash = 0;
  const sp = T.cardPlain(Object.assign({}, by('tag_splash') || { kind: 'global', id: 'tag_splash', desc: '폭발 범위 +45% · 폭발 멤버 공격력 +34% · 일반 진상 +20%', title: '폭발 증폭', tag: 'splash', tags: ['splash'] }), g);
  assert.deepEqual(sp.who.sort(), ['배현경', '최은옥'].sort());
  assert.equal(sp.ba[0].k, '폭발 범위');
  assert.equal(sp.ba[0].a, '100%');
  assert.equal(sp.good, '떼거리 판');
  // 이미 고른 만큼 "지금" 숫자가 올라가 있다
  S.applyCard(g, by('dmg'));
  const dmg2 = T.cardPlain(S.cardPool(g).find((c) => c.id === 'dmg'), g);
  assert.notEqual(dmg2.ba[0].a, '+0%');
});

test('테크 (관통 II · 철갑탄): 쉬운 한 줄 · 뚫는 수 전 → 후', () => {
  const g = game(['gunman', 'staff']);
  const c = { kind: 'global', id: 'tech_pierce_2', title: D.TECH.pierce[0].title, desc: D.TECH.pierce[0].desc, tag: 'pierce', tags: ['pierce'] };
  const p = T.cardPlain(c, g);
  assert.equal(p.head, '1명 더 뚫음 · 뚫는 멤버 공격력 +35%');
  assert.equal(p.name, '관통 II · 철갑탄');
  assert.deepEqual(p.ba[0], { k: '뚫고 지나가는 수', a: '0명', b: '1명' });
  assert.deepEqual(p.who, ['건전남']);
  const p3 = T.cardPlain({ kind: 'global', id: 'tech_boss_3', title: D.TECH.boss[1].title, desc: D.TECH.boss[1].desc, tag: 'boss' }, g);
  assert.equal(p3.head, '보스 피해 +70% · 치명타 피해 +60%');
});

test('멤버 카드: 이름 + 쉬운 말 · 「스킬」은? · 진화/증강 쿨타임 전 → 후', () => {
  const g = game(['gunman', 'eunok', 'staff']);
  for (const h of g.heroes) h.lv = 5;
  g.stacks.tag_pierce = 1; g.stacks.tag_splash = 1; g.stacks.tag_ctrl = 1;
  const pool = S.cardPool(g);
  const aug = pool.find((c) => c.kind === 'skillAug' && c.hero === 'gunman' && c.aug === 'frenzy');
  const pa = T.cardPlain(aug, g);
  assert.equal(pa.head, '건전남 권총 연사 0.6초 더 · 피해 +20%');
  assert.equal(pa.short, '권총 연사 0.6초 더 · 피해 +20%');
  assert.equal(pa.name, '퀵드로우 연장전');
  assert.equal(T.qText(pa.q), '「퀵드로우」는? 1.2초 동안 권총을 마구 연사');
  const bottoms = T.cardPlain(pool.find((c) => c.kind === 'skillAug' && c.aug === 'bottoms'), g);
  const eo = g.heroes.find((h) => h.id === 'eunok');
  const c0 = T.fullCd(g, eo);
  assert.ok(c0 > 0);
  assert.equal(bottoms.ba[0].k, '원샷 쿨타임');
  assert.equal(bottoms.ba[0].b, `${(Math.round(c0 * 0.7 * 10) / 10).toString().replace(/\.0$/, '')}초`);
  const evo = T.cardPlain(pool.find((c) => c.kind === 'evo' && c.hero === 'gunman'), g);
  assert.match(evo.head, /^건전남 공격력 ×1\.45/);
  assert.equal(evo.name, '진화: 황금 리볼버');
  assert.match(T.baText(evo.ba[0]), /^퀵드로우 쿨타임 \d+(\.\d)?초 → \d+(\.\d)?초$/);
  const se = T.cardPlain(pool.find((c) => c.kind === 'skillEvo' && c.hero === 'staff'), g);
  assert.equal(se.head, '운영진 스킬이 한 번 더 터짐 (75%)');
  assert.equal(se.q.term, '레드카드 퇴장');
  const cc = pool.find((c) => c.kind === 'cc');
  const pc = T.cardPlain(cc, g);
  assert.match(pc.head, /공격에 \d+% 확률 /);
  assert.equal(pc.ba[0].a, '0%');
  const lv = T.cardPlain({ kind: 'heroLv', hero: 'gunman', title: '건전남 Lv.1→3', desc: '공격력 +45% · 공격 속도 증가' }, g);
  assert.deepEqual(lv.ba[0], { k: '레벨', a: 'Lv.1', b: 'Lv.3' });
  assert.equal(lv.head, '건전남 공격력 +45%');
});

test('판 상태 없이도 (g 없음) 깨지지 않는다 · 기록 줄 · 멤버 강화 목록', () => {
  for (const c of [{ kind: 'global', id: 'dmg', desc: '모든 멤버 공격력 +27%', title: '회식 버프' }, { kind: 'filler', id: 'fillHeal', desc: '랑방 내구도 50% 회복', title: '방어선 수리' }, { kind: 'secret', id: 'tempSlot', desc: 'x', title: '임시 증원!' }, { kind: 'join', hero: 'gunman', title: '건전남', desc: '' }, null]) {
    const p = T.cardPlain(c, null);
    assert.equal(typeof p.head, 'string');
    if (c) assert.ok(p.head.length > 0, JSON.stringify(c));
  }
  assert.equal(T.cardPlain({ kind: 'filler', id: 'fillHeal', desc: '랑방 내구도 50% 회복' }).head, '입구 체력 50% 회복');
  assert.deepEqual(T.pickedLine({ kind: 'global', id: 'dmg', desc: '모든 멤버 공격력 +27%', title: '회식 버프' }, null), { head: '모든 멤버 공격력 +27%', name: '회식 버프', hero: null });
  const h = { id: 'gunman', sa: { frenzy: 1 }, skEvo: true, evo: true };
  assert.deepEqual(T.heroBuildLines(h).map((x) => x.name), ['퀵드로우 연장전', D.SKILL_EVO.gunman, '진화: 황금 리볼버']);
  assert.deepEqual(T.heroBuildLines(null), []);
});
