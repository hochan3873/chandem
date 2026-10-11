// 랑방 추천 덱 (deckrec.js): 모든 「추천 덱」 버튼이 쓰는 한 가지 기준 — 막을 것 → 대장 딜러 → 상성 → 센 멤버 → 자리
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const dir = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(dir, f)).href);

const START = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
const MID = ['bangjang', 'staff', 'gunman', 'gunnyeo', 'jungmin', 'ingyu', 'eunok', 'sanghwa', 'myunghoon', 'hanna', 'dohoon', 'sunggu'];

async function setup() {
  const D = await load('data.js'), K = await load('deckrec.js');
  const ALL = Object.keys(D.HERO_ROLE).filter((h) => D.HEROES[h]);
  return { D, K, ALL };
}
const flat = () => 100;

test('필수 대응이 순수 힘보다 먼저: 약한 건전녀도 기절 예고 판엔 들어간다', async () => {
  const { K } = await setup();
  // 24 = 은신 + 기절 예고. 건전녀(기절 해제)만 일부러 가장 약하게
  const power = (id) => (id === 'gunnyeo' ? 1 : id === 'bangjang' ? 900 : 500);
  const r = K.recommendDeck({ mode: 'stage', stage: 24, owned: START, slots: 4, power });
  assert.ok(r.deck.includes('gunnyeo'), '기절 대비');
  assert.ok(r.deck.includes('staff'), '은신 탐지');
  assert.ok(r.reasons.gunnyeo.some((t) => /기절/.test(t)), '이유 꼬리표');
});

test('같은 상성이면 강화된(센) 멤버가 먼저', async () => {
  const { K, D } = await setup();
  const s = 1, sameAttr = Object.keys(D.HEROES).filter((h) => D.HEROES[h].attr === 'power' && D.HERO_ROLE[h] === 'aoe' || D.HEROES[h].attr === 'power' && D.HERO_ROLE[h] === 'single').slice(0, 3);
  assert.ok(sameAttr.length >= 2);
  const [a, b] = sameAttr;
  const base = { mode: 'stage', stage: s, owned: [a, b], slots: 1 };
  const kit = (id) => (D.HEROES[id].kit || 1) * (D.HEROES[id].bossKit || 1);
  // 힘이 훨씬 센 쪽이 뽑힌다 (kit 차이가 있어도 힘 차이가 더 크게)
  const strongB = K.recommendDeck({ ...base, power: (id) => (id === b ? 1000 : 10) });
  const strongA = K.recommendDeck({ ...base, power: (id) => (id === a ? 1000 : 10) });
  assert.equal(strongB.deck[0], b);
  assert.equal(strongA.deck[0], a);
  assert.ok(kit(a) > 0);
});

test('대장(1번)은 딜러 — 서포터만 있는 덱이 되지 않는다', async () => {
  const { K, D, ALL } = await setup();
  for (const own of [START, MID, ALL]) for (const s of [1, 9, 17, 24, 35, 45, 60]) for (const hell of [false, true]) {
    const r = K.recommendDeck({ mode: 'stage', stage: s, hell, owned: own, slots: Math.min(6, own.length), power: flat });
    const lead = r.deck[0];
    assert.ok(K.isDealer(lead) || !own.some(K.isDealer) || D.HERO_ROLE[lead] !== 'support', `${s}${hell ? 'h' : ''} 대장 ${lead}`);
    assert.ok(!(D.HERO_ROLE[lead] === 'support' && r.deck.some(K.isDealer)), `${s} 대장이 지원: ${lead}`);
    assert.ok(r.reasons[lead].length >= 1);
  }
});

test('자리 · 소유: 칸 수를 안 넘고 · 안 가진 멤버는 없고 · 중복 없음 · 꼬리표가 모두 있다', async () => {
  const { K, ALL } = await setup();
  for (const [own, n] of [[START, 4], [MID, 5], [ALL, 6], [ALL, 4], [MID, 6]]) for (const s of [1, 20, 45, 60]) {
    const r = K.recommendDeck({ mode: 'stage', stage: s, owned: own, slots: n, power: flat });
    assert.ok(r.deck.length <= n && r.deck.length === Math.min(n, own.length));
    assert.equal(new Set(r.deck).size, r.deck.length);
    assert.ok(r.deck.every((id) => own.includes(id)));
    for (const id of r.deck) assert.ok(r.reasons[id] && r.reasons[id].length >= 1, `${id} 이유`);
  }
});

test('모드: 주간(진상 2배 → 범위) · 무한(버팀 한 명) · 이벤트(규칙 멤버 · 금지) · 대전(센 순)', async () => {
  const { K, D, ALL } = await setup();
  const w = K.recommendDeck({ mode: 'weekly', stage: 12, mod: 'double', owned: MID, slots: 4, power: flat });
  assert.ok(w.deck.some((id) => D.COND.swarm.counter.includes(id)), '범위 멤버');
  const e = K.recommendDeck({ mode: 'endless', owned: MID, slots: 5, power: flat });
  assert.ok(e.deck.some((id) => ['tank', 'support'].includes(D.HERO_ROLE[id])), '버팀');
  const ev = K.recommendDeck({ mode: 'event', owned: ALL, slots: 4, power: flat, ban: (h) => h === 'hochan', extraNeeds: [{ key: 'r', tag: '서포터', counter: ['bangjang', 'gunnyeo', 'dohoon'], n: 2, w: 100 }, { key: 'g', tag: '열쇠', counter: ['gunman'], w: 90 }], prefer: ['gunman'] });
  assert.ok(!ev.deck.includes('hochan'));
  assert.ok(ev.deck.filter((h) => ['bangjang', 'gunnyeo', 'dohoon'].includes(h)).length >= 2, '필수 2명');
  assert.equal(ev.deck[0], 'gunman', '추천 대장');
  const pv = K.recommendDeck({ mode: 'pvp', owned: MID, slots: 5, power: (id) => (id === 'sanghwa' ? 5000 : 100) });
  assert.ok(pv.deck.includes('sanghwa'));
});

test('불변: 경고가 뜨는 모든 스테이지(보통 · 헬)에서 가진 막는 멤버가 있으면 추천 덱에 들어 있다', async () => {
  const { K, D, ALL } = await setup();
  const bad = [];
  for (const [lab, own, n] of [['mid', MID, 5], ['full', ALL, 6], ['full5', ALL, 5]]) for (let s = 1; s <= 60; s++) for (const hell of [false, true]) {
    const ctx = { mode: 'stage', stage: s, hell, owned: own, slots: n, power: flat };
    const r = K.recommendDeck(ctx);
    const gaps = K.deckGaps(ctx, r.deck, r.needs);
    for (const g of gaps) if (g.counter.some((h) => own.includes(h))) bad.push(`${lab} ${s}${hell ? 'h' : ''} ${g.key}`);
  }
  // 필요가 자리 수보다 많은 극단은 제외하고도 거의 전부 막혀야 한다
  assert.equal(bad.length, 0, `못 막은 경우 ${bad.length}: ${bad.slice(0, 12).join(' | ')}`);
  void D;
});

test('불변: 시작 4명 계정도 가진 멤버로 막을 수 있는 것은 막는다 (1-1 … 8-10)', async () => {
  const { K } = await setup();
  let miss = 0;
  for (let s = 1; s <= 80; s++) {
    const ctx = { mode: 'stage', stage: s, owned: START, slots: 4, power: flat };
    const r = K.recommendDeck(ctx);
    for (const g of K.deckGaps(ctx, r.deck, r.needs)) if (g.counter.some((h) => START.includes(h))) miss++;
  }
  assert.ok(miss <= 6, `못 막은 ${miss}`);
});

test('못 가진 막는 멤버는 gaps 로 알려 준다 (획득 안내용)', async () => {
  const { K } = await setup();
  const r = K.recommendDeck({ mode: 'stage', stage: 24, owned: ['bangjang', 'staff', 'gunman'], slots: 4, power: flat });
  const g = r.gaps.find((x) => x.key === 'cond:cc');
  assert.ok(g && g.warn && g.missing.includes('gunnyeo') && g.ownedLeft.length === 0);
});

test('속도: 12명 · 27명 계정 전 스테이지 한 번에 50ms 미만', async () => {
  const { K, ALL } = await setup();
  let worst = 0;
  for (const own of [START, MID, ALL]) for (let s = 1; s <= 80; s++) for (const hell of [false, true]) {
    const t = performance.now();
    K.recommendDeck({ mode: 'stage', stage: s, hell, owned: own, slots: 6, power: flat });
    worst = Math.max(worst, performance.now() - t);
  }
  assert.ok(worst < 50, `최대 ${worst.toFixed(1)}ms`);
});

test('연결: 모든 추천 버튼이 recommendDeck 하나를 쓰고 · 화면에 설명 시트와 이유 칩이 있다', () => {
  const g = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
  const fgs = fs.readFileSync(path.join(dir, 'failguide.js'), 'utf8');
  const hw = fs.readFileSync(path.join(dir, 'hw-ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  assert.ok(!/recommendTeam\(/.test(g), 'game.js 에 옛 recommendTeam 호출 없음');
  assert.ok(!/recommendTeam\(/.test(fgs));
  assert.match(g, /DR\.recommendDeck/);
  assert.match(fgs, /recommendDeck/);
  assert.match(hw, /DR\.recommendDeck/);
  assert.match(g, /data-act="recInfo"/);
  assert.match(g, /class="rec-why"/);
  assert.match(g, /RECOMMEND_STEPS/);
  assert.match(html, /"\/langbang\/deckrec\.js":/);
  const pn = fs.readFileSync(path.join(dir, 'patchnotes.js'), 'utf8');
  assert.match(pn, /id: '2026-10-24deckrec'/); // 패치 노트에 있다 (맨 앞일 필요는 없다 — 다른 노트가 앞에 붙는다)
});
