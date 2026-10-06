'use strict';
// 진상의 탑 밸런스 점검 — sim.js 를 Node 에서 그대로 돌린다 (사람처럼 카드 고르고 스킬 쓰기)
//   node scripts/lb-tower-sim.js                    멤버별로 "보통(+10 ★3 괜찮은 장비)" · "최대(+20 ★5 최고 장비 + 지옥 세트)" 가 몇 층까지 가나
//   node scripts/lb-tower-sim.js floor 25 ara       한 층을 여러 판 (승률 · 걸린 시간)
//   옵션: --heroes=ara,bangjang  --seeds=N (층마다 판 수, 기본 3 · 그중 하나라도 이기면 통과)  --tries=N (하루 도전처럼 실패 허용)
//   node scripts/lb-tower-sim.js grid --p=strong --from=20 --to=60 --seeds=3   계정 전체(모든 멤버가 그 성장)로 층마다 누가 깨나 — 실제 계정은 층마다 멤버를 바꿔 오르니 막히는 층은 이걸로 본다
//   리메이크 (멤버 3명 · 바닥 예고 · 체력): node scripts/lb-tower-sim.js arena --p=typical --from=1 --to=100 --step=3 --bot=none,human,pro --squad=ara,gunnyeo,wonsik (없으면 층마다 저항 추천 2명 + 딜러)
//     봇: none = 가만히 (안 피함) · human = 0.45초 뒤 반응 · 12% 놓침 (괜찮은 사람) · pro = 0.3초 · 3% 놓침 — 층마다 --seeds 판 중 한 판이라도 이기면 통과 · --climb 이면 처음 막힌 층에서 멈춤
//   피로: --fat=50 (0~100 · 공격력 · 입구 내구도 × (1 − 피로 × 0.004))
//   숫자 바꿔 보기: --grow=[[2,1.09,1.04],[16,1.17,1.05]]  --ts.solo.youngjun=0.7 (data.js TOWER_SIM)
const path = require('path');
const { pathToFileURL } = require('url');
const LIB = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };
function seeded(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

(async () => {
  const D = await load('data.js');
  for (const a of args.filter((x) => x.startsWith('--ts.'))) { const [k, v] = a.slice(5).split('='); const ks = k.split('.'); let o = D.TOWER_SIM; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = Number(v); } // 규칙 숫자 바꿔 보기: --ts.solo.youngjun=0.8
  const S = await load('sim.js');
  const T = await load('tower.js');
  const TWA = await load('tower-arena.js');
  for (const k of ['hp0', 'atk0', 'exp']) if (opt(k)) T.TOWER[k] = Number(opt(k)); // 숫자 바꿔 보기: --hp0=1.2
  if (opt('grow')) T.TOWER.grow = JSON.parse(opt('grow')); // 구간: --grow=[[2,1.1,1.04],[25,1.07,1.03]]
  // 성장 단계: 장비는 무기 · 액세서리 · 신화 칸 능력치 합 · 지옥 세트 · 각성
  const PROFILES = {
    typical: { name: '보통 (+10 ★3)', meta: 10, star: 3, items: { door: 8, battery: 6, charm: 6 }, gear: { atk: 0.3, spd: 0.08, crit: 0.04, skill: 0.18 }, hell: 0 },
    strong: { name: '강함 (+15 ★4)', meta: 15, star: 4, items: { door: 12, battery: 10, charm: 10 }, gear: { atk: 0.55, spd: 0.14, crit: 0.06, skill: 0.3, cd: 0.08 }, hell: 2 },
    maxed: { name: '최대 (+20 ★5)', meta: 20, star: 5, items: { door: 15, battery: 15, charm: 15 }, gear: { atk: 1.0, spd: 0.25, crit: 0.12, skill: 0.4, cd: 0.15, res: 0.2, hp: 0.1 }, hell: 4 },
  };
  function gearFor(P) {
    const g = Object.assign({}, P.gear);
    if (P.hell >= 2) { g.atk = (g.atk || 0) + 0.18; g.spd = (g.spd || 0) + 0.135; }
    if (P.hell >= 4) { g.hp = (g.hp || 0) + 0.225; g.skill = (g.skill || 0) + 0.225; }
    if (P.hell) g.hellSet = P.hell;
    return g;
  }
  function pickCard(g, cards, rng) {
    let best = 0, bv = -1;
    cards.forEach((c, i) => {
      let v = 1;
      if (c.kind === 'skillAug') v = 7.8;
      else if (c.kind === 'heroLv') { const h = S.hasHero(g, c.hero); v = 7 + (h && (h.lv + 1 === 3 || h.lv + 1 === 5) ? 2 : 0); }
      else if (c.kind === 'evo') v = 9.5;
      else if (c.kind === 'skillEvo') v = 8;
      else if (c.kind === 'heroMod') v = 6.5;
      else if (c.kind === 'cc') v = 4;
      else if (c.kind === 'global') v = { dmg: 6.5, spd: 6, boss: 8, pierce: 6, crit: 5, hp: g.base.hp / g.base.max < 0.6 ? 6 : 3.5, debuffRes: g.tower && g.tower.curse ? 7 : 2, cdCut: 5, tag_boss: g.tower && (g.tower.titan || g.tower.boss) ? 6.5 : 3, risk_allin: g.base.hp / g.base.max > 0.75 ? 6 : 2, econ_bonus: 6 }[c.id] || (c.attr ? 6 : c.tag ? 4 : 3);
      else if (c.kind === 'filler') v = c.id === 'fillHeal' && g.base.hp / g.base.max < 0.6 ? 5 : 1;
      v += rng() * 1.5;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }
  function densest(g, r) {
    let best = null, bn = 0;
    for (const e of g.enemies) { if (e.dead || e.y < 0) continue; let n = 0; for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < r && Math.abs(o.y - e.y) < r) n += o.boss ? 3 : 1; if (n > bn) { bn = n; best = e; } }
    return best ? { x: best.x, y: best.y, n: bn } : null;
  }
  function aiSkills(g) {
    for (const h of g.heroes) {
      if (!S.skillReady(h)) continue;
      const sk = h.def.skill;
      let alive = 0; for (const e of g.enemies) if (!e.dead && e.y > 0) alive++;
      if (sk.target) { const c = densest(g, (sk.r ? sk.r[h.lv - 1] : 120) * 0.8); if (c && (c.n >= 2 || g.bossAlive)) S.castSkill(g, h, c.x, c.y); }
      else if (sk.id === 'firstaid') { if (g.base.hp / g.base.max < 0.8 || h.stunT > 0.3 || h.charmT > 0.3 || h.silenceT > 0.5) S.castSkill(g, h); }
      else if (alive >= 3 || g.bossAlive || g.enemies.some((e) => !e.dead && e.titan)) S.castSkill(g, h);
    }
  }
  function play(hero, f, P, seed, awake) {
    const rng = seeded(seed);
    const def = T.floorDef(f);
    const deck = [null, null, hero, null, null, null];
    const g = S.createGame({ H: 760, rng, mode: 'stage', stage: def.stage, meta: { [hero]: P.meta }, items: P.items, deck, gear: { [hero]: gearFor(P) }, stars: { [hero]: P.star }, tempo: true, join: false, tower: def, towerExp: T.TOWER.exp, towerFat: Number(opt('fat', 0)), awake: { [hero]: awake }, unlocked: D.LOCKED_HEROES }); // --fat=50: 피로한 멤버로
    const pr = seeded(seed * 7 + 3);
    let steps = 0;
    while (!g.over && g.phase !== 'victory' && g.t < 400) {
      S.step(g, 1 / 60); steps++;
      g.events.length = 0;
      if (g.augOffer && g.augOffer.opts) S.applyAug(g, g.augOffer.opts[0]);
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + 1.5 + pr();
      if (g.pendingLevels > 0 && g.t >= g.pickAt) { const cards = S.rollCards(g); S.applyCard(g, cards[pickCard(g, cards, pr)]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 8 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
      if (steps % 6 === 0) aiSkills(g);
    }
    return { win: g.phase === 'victory', t: g.t, hp: g.base.hp / g.base.max, wave: g.wave, lv: g.level };
  }
  // ── 리메이크: 파티 3명 + 바닥 예고 봇 ──
  const BOTS = { none: null, human: { react: 0.45, miss: 0.12 }, pro: { react: 0.3, miss: 0.03 } };
  function playSquad(squad, f, P, seed, awake, bot) {
    const rng = seeded(seed);
    const def = T.floorDef(f);
    const all = (o) => Object.fromEntries(squad.map((h) => [h, o]));
    const g = S.createGame({ H: 760, rng, mode: 'stage', stage: def.stage, meta: all(P.meta), items: P.items, deck: [null, null, squad[0], null, null, null], gear: all(gearFor(P)), stars: all(P.star), tempo: true, join: false, tower: def, towerExp: T.TOWER.exp, towerFat: Number(opt('fat', 0)), awake: all(awake), unlocked: D.LOCKED_HEROES });
    TWA.attach(g, { squad });
    const pr = seeded(seed * 7 + 3);
    const bo = bot ? Object.assign({ rng: pr }, bot) : null;
    let steps = 0;
    while (!g.over && g.phase !== 'victory' && g.t < 600) {
      S.step(g, 1 / 60); steps++;
      g.events.length = 0;
      if (g.augOffer && g.augOffer.opts) S.applyAug(g, g.augOffer.opts[0]);
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + 1.5 + pr();
      if (g.pendingLevels > 0 && g.t >= g.pickAt) { const cards = S.rollCards(g); S.applyCard(g, cards[pickCard(g, cards, pr)]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 8 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
      if (bo) TWA.botTick(g, bo);
      if (steps % 6 === 0) {
        const W = g.twa.wind;
        if (bo && W && !W.e.dead && W.t > bo.react) for (const h of g.heroes) if (S.skillReady(h) && h.def.skill.target) S.castSkill(g, h, W.e.x, W.e.y); // 기 모으는 진상에게 스킬 (끊기)
        aiSkills(g);
      }
    }
    const rp = TWA.report(g);
    return { win: g.phase === 'victory', t: g.t, hp: g.base.hp / g.base.max, wave: g.wave, wipe: g.heroes.every((h) => h.def.summon || h.twDown > 0), rp };
  }
  const awakeAt = (f) => (f > 40 ? 2 : f > 20 ? 1 : 0); // 오르면서 각성이 열린다
  function climb(hero, P, seeds) {
    let f = 1;
    for (; f <= T.TOWER.floors; f++) {
      let ok = false;
      for (let s = 1; s <= seeds && !ok; s++) ok = play(hero, f, P, f * 101 + s * 7, awakeAt(f)).win;
      if (!ok) return f - 1;
    }
    return T.TOWER.floors;
  }
  const what = args.find((x) => !x.startsWith('--')) || 'climb';
  if (what === 'floor') {
    const f = Number(args[1]) || 1, hero = args[2] || 'bangjang', P = PROFILES[opt('p', 'typical')];
    const n = Number(opt('seeds', 8));
    let w = 0, tt = 0;
    for (let s = 1; s <= n; s++) { const r = play(hero, f, P, s * 13, awakeAt(f)); if (r.win) w++; tt += r.t; console.log(`  seed ${s}: ${r.win ? '승' : '패'} ${r.t.toFixed(0)}초 입구 ${(r.hp * 100) | 0}% 웨이브 ${r.wave} Lv${r.lv}`); }
    console.log(`${f}층 ${hero} ${P.name}: 승률 ${w}/${n} · 평균 ${(tt / n).toFixed(0)}초 · 규칙 ${T.floorRules(f).join('+')}`);
    return;
  }
  if (what === 'arena') {
    const P = PROFILES[opt('p', 'typical')];
    const from = Number(opt('from', 1)), to = Number(opt('to', 100)), stp = Number(opt('step', 1)), n = Number(opt('seeds', 2));
    const bots = opt('bot', 'none,human,pro').split(',');
    const fixed = opt('squad', '') ? opt('squad').split(',') : null;
    const pool = (opt('pool', '') || Object.keys(D.HEROES).filter((h) => !D.HEROES[h].summon).join(',')).split(',');
    const carry = opt('carry', 'ara');
    const climb = args.includes('--climb');
    const stuck = {};
    console.log(`탑 리메이크 시뮬 · ${P.name} · 층마다 ${n}판 · 봇 ${bots.join('/')}${fixed ? ` · 파티 ${fixed.join(',')}` : ' · 추천 파티'}`);
    for (let f = from; f <= to; f += stp) {
      // 파티 후보 (사람처럼 두 가지로 도전): ① 딜러 + 저항 추천 2명 ② 딜러 + 저항 추천 1명 + 다른 딜러
      const rec = TWA.recommend(f, pool.filter((h) => h !== carry), 4);
      const fill = (sq) => { while (sq.length < 3) sq.push(pool.find((h) => !sq.includes(h))); return sq; };
      const squads = fixed ? [fixed] : [fill([carry, ...rec.slice(0, 2)]), fill([carry, rec[0], ['eunok', 'gunman', 'hochan', 'sunggu'].find((h) => h !== carry && h !== rec[0])].filter(Boolean))];
      const squad = squads[0];
      const row = [];
      for (const b of bots) {
        if (stuck[b]) { row.push(pad('-', 30)); continue; }
        let w = null, last = null;
        for (const sq of squads) for (let s = 1; s <= n && !w; s++) { const r = playSquad(sq, f, P, f * 101 + s * 7, awakeAt(f), BOTS[b]); last = r; if (r.win) w = r; }
        const r = w || last;
        const why = r.win ? '승' : r.wipe ? '전멸' : r.t >= 590 ? '시간' : '입구';
        row.push(pad(`${b} ${why} ${r.t.toFixed(0)}s 회피${r.rp.dodge}/${r.rp.tele} 맞음${r.rp.hit} 쓰${r.rp.down}${r.rp.wind ? ` 끊${r.rp.cut}/${r.rp.wind}` : ''}`, 30));
        if (!w && climb) stuck[b] = f;
      }
      console.log(`${String(f).padStart(3)}층 ${pad(TWA.floorPlan(f).kinds.join('+') || '-', 22)} ${pad(squad.map((h) => D.HEROES[h].name).join(','), 22)} ${row.join(' ')}`);
      if (climb && bots.every((b) => stuck[b])) break;
    }
    if (climb) console.log('막힌 층:', JSON.stringify(stuck));
    return;
  }
  if (what === 'grid') { // 층마다 몇 명이 깨나 (계정 진행: 그 층을 깰 멤버가 한 명이라도 있으면 오른다)
    const hs = (opt('heroes', '') || Object.keys(D.HEROES).join(',')).split(',');
    const P = PROFILES[opt('p', 'maxed')];
    const from = Number(opt('from', 1)), to = Number(opt('to', 60)), step = Number(opt('step', 1));
    const out = [];
    for (let f = from; f <= to; f += step) {
      const ok = [];
      const n = Number(opt('seeds', 2)); // 멤버마다 판 수 (하루 도전처럼)
      for (const h of hs) { let w = false; for (let s = 1; s <= n && !w; s++) w = play(h, f, P, f * 101 + s * 7, awakeAt(f)).win; if (w) ok.push(D.HEROES[h].name); }
      console.log(`${String(f).padStart(2)}층 ${pad(T.floorRules(f).join('+'), 14)} ${String(ok.length).padStart(2)}명  ${ok.join(' ')}`);
      out.push(ok.length);
    }
    return;
  }
  const heroes = (opt('heroes', '') || Object.keys(D.HEROES).join(',')).split(',');
  const seeds = Number(opt('seeds', 3));
  const profs = (opt('profiles', 'typical,maxed')).split(',');
  console.log(`진상의 탑 등반 시뮬 (층마다 ${seeds}판 중 한 판이라도 이기면 통과)`);
  console.log(pad('멤버', 12) + profs.map((k) => pad(PROFILES[k].name, 18)).join(''));
  const sums = {};
  for (const h of heroes) {
    const row = [];
    for (const k of profs) { const v = climb(h, PROFILES[k], seeds); row.push(v); (sums[k] = sums[k] || []).push(v); }
    console.log(pad(D.HEROES[h].name, 12) + row.map((v) => pad(v + '층', 18)).join(''));
  }
  for (const k of profs) { const a = sums[k].slice().sort((x, y) => x - y); console.log(`${PROFILES[k].name}: 중앙 ${a[(a.length / 2) | 0]}층 · 최고 ${a[a.length - 1]}층 · 최저 ${a[0]}층`); }
})();
