'use strict';
// 랑방 대전 밸런스 점검 — sim.js 는 DOM 없는 순수 모듈이라 Node 에서 그대로 돌린다.
//   node scripts/lb-balance.js            전부 (영웅 레벨 곡선 · 스테이지 표 · 캠페인)
//   node scripts/lb-balance.js curve       영웅 혼자 Lv1~5 DPS
//   node scripts/lb-balance.js stages      방장 + 동료별, 정해진 강화 수준으로 주요 스테이지 여러 판
//   node scripts/lb-balance.js campaign    0코인에서 시작해 보상으로 강화하며 1-1 → 3-10 진행
//   옵션: --seeds=N (판 수), --plays=N (캠페인 최대 판 수)
const path = require('path');
const { pathToFileURL } = require('url');
// --lib=폴더 : 다른 버전(예: 바꾸기 전 복사본)의 data.js · sim.js 로 같은 검사를 돌린다
const LIB = (process.argv.find((x) => x.startsWith('--lib=')) || '').slice(6) || path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);

const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
const what = args.find((x) => !x.startsWith('--')) || 'all';
const PARTNERS = ((process.argv.find((x) => x.startsWith('--partners=')) || '').slice(11) || 'staff,gunman,gunnyeo,dohoon,myunghoon,ingyu,donghan,youngjun,eunok,hanna,sunggu').split(',');
const NAME = { bangjang: '방장', staff: '운영진', gunman: '건전남', gunnyeo: '건전녀', eunok: '최은옥', hanna: '이한나', sunggu: '강성구', myunghoon: '서명훈', dohoon: '김도훈', ingyu: '백인규', donghan: '문동한', youngjun: '김영준' };
const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };

function seeded(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

(async () => {
  const D = await load('data.js');
  const S = await load('sim.js');

  // 카드 자동 선택: 사람이 고를 법한 단순한 우선순위 + 약간의 무작위
  //  --policy=smart (기본, 잘 고르는 사람) | mid (10번 중 4번은 아무거나 — 보통 사람) | random
  const POLICY = (process.argv.find((x) => x.startsWith('--policy=')) || '').slice(9) || 'smart';
  function pickCard(g, cards, rng) {
    if (POLICY === 'random' || (POLICY === 'mid' && rng() < 0.4)) return (rng() * cards.length) | 0;
    let best = 0, bv = -1;
    cards.forEach((c, i) => {
      let v = 1;
      if (c.rarity === 'hidden') v = 10;
      else if (c.kind === 'addHero') v = g.heroes.length < 4 ? 8 : 5;
      else if (c.kind === 'heroLv') {
        const h = S.hasHero(g, c.hero);
        v = 6 + (h.lv + 1 === 3 || h.lv + 1 === 5 ? 2.5 : 0) + (h.def.hidden ? 1 : 0) + (h.id === g.partner ? 1 : 0);
      } else if (c.kind === 'global') {
        v = { dmg: 6.5, spd: 6, boss: 8, pierce: 7.5, crit: 5, gunExtra: 7, hp: g.base.hp / g.base.max < 0.6 ? 6 : 3.5, regen: 4.5, ult: 3.5, exp: 3.5, slow: 4, charmRes: 2.5 }[c.id] || 2;
      } else if (c.kind === 'filler') v = c.id === 'fillHeal' && g.base.hp / g.base.max < 0.6 ? 5 : 1;
      v += rng() * 1.5;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  // 스킬 자동 사용 (--skills=1): 준비되면 바로. 찍는 스킬은 진상이 가장 몰린 곳에
  const SKILLS = opt('skills', 0) > 0;
  function densest(g, r) {
    let best = null, bn = 0;
    for (const e of g.enemies) {
      if (e.dead || e.y < 0) continue;
      let n = 0;
      for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < r && Math.abs(o.y - e.y) < r) n += o.boss ? 3 : 1;
      if (n > bn) { bn = n; best = e; }
    }
    return best ? { x: best.x, y: best.y, n: bn } : null;
  }
  function aiSkills(g) {
    for (const h of g.heroes) {
      if (!S.skillReady(h)) continue;
      const sk = h.def.skill;
      let alive = 0;
      for (const e of g.enemies) if (!e.dead && e.y > 0) alive++;
      if (sk.target) {
        const c = densest(g, sk.r[h.lv - 1] * 0.8);
        if (c && (c.n >= 4 || g.bossAlive)) S.castSkill(g, h, c.x, c.y);
      } else if (sk.id === 'firstaid') {
        if (g.base.hp / g.base.max < 0.8 || g.heroes.some((o) => o.stunT > 0.6 || o.rumorT > 0.5 || o.paperT > 0.5)) S.castSkill(g, h);
      } else if (alive >= 6 || g.bossAlive) S.castSkill(g, h);
    }
  }
  // 한 판 (사람처럼: 카드는 바로 고르고, 총공지는 적이 많거나 보스가 있을 때 쓴다)
  function play(o) {
    const rng = seeded(o.seed);
    const g = o.snap ? S.restoreGame(o.snap, { rng, H: 760 }) : S.createGame({
      H: 760, rng, mode: o.mode || 'stage', stage: o.stage, meta: o.meta || {}, items: o.items || {},
      partner: o.partner, hiddenUnlocked: o.unlocked || [], heroes: o.heroes || (o.team ? ['bangjang', ...o.team] : undefined),
      deck: o.deck, gear: o.gear,
    });
    g.partner = o.partner;
    if (o.noTypes) g.noTypes = true;
    const pr = seeded(o.seed * 7 + 3);
    const maxT = o.maxT || 900;
    let steps = 0;
    while (!g.over && g.phase !== 'victory' && g.t < maxT) {
      S.step(g, 1 / 60);
      steps++;
      g.events.length = 0;
      while (g.pendingLevels > 0) {
        const cards = S.rollCards(g);
        S.applyCard(g, cards[pickCard(g, cards, pr)]);
        g.pendingLevels--;
        if (g.welcomePicks > 0) g.welcomePicks--;
      }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 10 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
      if ((o.skills !== undefined ? o.skills : SKILLS) && (steps % 6) === 0) aiSkills(g);
      if (o.stopWave && g.wave >= o.stopWave && g.phase === 'break') break;
    }
    const heroes = {};
    for (const h of g.heroes) heroes[h.id] = { dmg: h.dmgDone, lv: h.lv, kills: h.kills };
    return { g, win: g.victory, stars: g.victory ? g.stars : 0, hp: g.base.hp / g.base.max, t: g.t, wave: g.wave, level: g.level, heroes, steps, dmg: g.stats.damage };
  }

  // ── 1) 영웅 혼자 Lv1~5: 같은 적 무리를 60초 동안 때린 피해 (보조 효과는 빼고 순수 피해)
  function curve() {
    console.log('\n■ 영웅 레벨 곡선 — 혼자 60초, 난이도 8 적 무리 상대 DPS (강화 0, 카드 없음)');
    console.log(pad('영웅', 10) + [1, 2, 3, 4, 5].map((l) => pad('Lv' + l, 8)).join('') + ' Lv5/Lv1');
    const ids = ['bangjang', ...PARTNERS];
    for (const id of ids) {
      const row = [];
      for (let lv = 1; lv <= 5; lv++) {
        let tot = 0;
        const N = 4;
        for (let s = 1; s <= N; s++) {
          const g = S.createGame({ H: 760, rng: seeded(s * 31 + lv), heroes: [id], god: true, noWaves: true });
          g.phase = 'test';
          g.diff = 8; g.wave = 8; g.noTypes = true; // (옛 버전은 g.wave 로 난이도) · 상성은 빼고 순수 비교
          g.heroes[0].lv = lv;
          const types = ['yeokko', 'namkko', 'drunk', 'thug', 'mukti', 'yeokko', 'namkko', 'drunk'];
          let k = 0;
          for (let t = 0; t < 60; t += 1 / 60) {
            let alive = 0;
            for (const e of g.enemies) if (!e.dead) alive++;
            while (alive < 22) { const e = S.spawnEnemy(g, types[k++ % types.length]); e.stopY -= g.rng() * 120; alive++; }
            S.step(g, 1 / 60);
            g.events.length = 0;
            g.exp = 0; g.pendingLevels = 0;
          }
          tot += g.heroes[0].dmgDone / 60;
        }
        row.push(tot / N);
      }
      console.log(pad(NAME[id], 10) + row.map((v) => pad(v.toFixed(0), 8)).join('') + ' ×' + (row[4] / row[0]).toFixed(2));
    }
  }

  // 스테이지 s 쯤 도착한 사람의 평균 강화 수준 (캠페인 결과를 보고 잡은 값)
  const MF = opt('mf', 0.45);
  const metaAt = (s) => Math.min(20, Math.round(s * MF));
  const itemsAt = (s) => ({ door: Math.min(10, Math.round(s / 4)), charm: Math.min(10, Math.round(s / 5)), battery: Math.min(10, Math.round(s / 5)), drink: s >= 18 ? 1 : 0 });

  // ── 2) 스테이지 표
  function stages() {
    const N = opt('seeds', 12);
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) list.push(3, 5, 8, 10, 13, 15, 18, 20, 23, 25, 28, 30);
    console.log(`\n■ 스테이지별 — 방장 + 동료, 강화 = 스테이지×${MF} (최대 20), 아이템 조금, 시드 ${N}판`);
    console.log(pad('동료', 10) + list.map((s) => pad(D.stageLabel(s), 12)).join(''));
    const all = {};
    for (const p of PARTNERS) {
      const cells = [];
      let dps = 0, dpsN = 0, share = 0;
      for (const s of list) {
        const m = metaAt(s);
        let win = 0, stars = 0, t = 0;
        for (let i = 1; i <= N; i++) {
          const team = s > 10 ? [p, p === 'staff' ? 'gunman' : 'staff'] : [p]; // 2챕터부터 동료 2명 (둘째는 운영진/건전남)
          const r = play({ stage: s, partner: p, team, meta: { bangjang: m, [p]: m, staff: m, gunman: m, gunnyeo: m }, items: itemsAt(s), seed: i * 101 + s, unlocked: [] });
          if (r.win) { win++; stars += r.stars; }
          t += r.t;
          const ph = r.heroes[p];
          if (ph) { dps += ph.dmg / r.t; dpsN++; share += ph.dmg / Math.max(1, r.dmg); }
        }
        cells.push({ s, win: win / N, stars: win ? stars / win : 0, t: t / N });
      }
      all[p] = { cells, dps: dps / dpsN, share: share / dpsN };
      console.log(pad(NAME[p], 10) + cells.map((c) => pad(`${Math.round(c.win * 100)}% ${c.stars.toFixed(1)}★`, 12)).join(''));
    }
    console.log('\n' + pad('동료', 10) + pad('동료 DPS', 10) + pad('피해 몫', 9) + pad('평균 클리어율', 14) + pad('평균 별', 8) + '평균 시간');
    for (const p of PARTNERS) {
      const a = all[p];
      const wr = a.cells.reduce((x, c) => x + c.win, 0) / a.cells.length;
      const st = a.cells.reduce((x, c) => x + c.stars * c.win, 0) / Math.max(0.001, a.cells.reduce((x, c) => x + c.win, 0));
      const tm = a.cells.reduce((x, c) => x + c.t, 0) / a.cells.length;
      console.log(pad(NAME[p], 10) + pad(a.dps.toFixed(0), 10) + pad(Math.round(a.share * 100) + '%', 9) + pad(Math.round(wr * 100) + '%', 14) + pad(st.toFixed(2), 8) + `${Math.floor(tm / 60)}분 ${Math.round(tm % 60)}초`);
    }
    return all;
  }

  // ── 3) 캠페인: 0 코인, 보상으로 강화하면서 앞으로. 동료는 처음부터 고정(히든도 비교용으로 허용)
  function campaign() {
    const maxPlays = opt('plays', 160);
    const seeds = opt('cseeds', 2);
    console.log(`\n■ 캠페인 — 0코인 시작, 보상으로 (방장·동료·문·부적·배터리·드링크) 싼 것부터 강화, 최대 ${maxPlays}판 × ${seeds}회`);
    console.log(pad('동료', 10) + pad('3-10까지 판수', 15) + pad('시간', 7) + pad('도달', 8) + pad('총 별', 7) + pad('첫 별', 7) + pad('1-10', 6) + pad('2-10', 6) + pad('강화(방장/동료)', 16));
    for (const p of PARTNERS) {
      const res = [];
      for (let k = 1; k <= seeds; k++) {
        const prof = { coins: 0, heroes: { bangjang: 0, [p]: 0, staff: 0, gunman: 0 }, items: { door: 0, coupon: 0, battery: 0, charm: 0, drink: 0 }, stages: {} };
        let cur = 1, plays = 0, at10 = 0, at20 = 0, done = 0, fails = 0, time = 0, firstStars = 0, firsts = 0;
        while (plays < maxPlays && cur <= 30) {
          plays++;
          // 막히면 사람처럼 전 스테이지를 한 번 돌아서 코인을 모은다
          const farm = fails > 0 && fails % 2 === 0 && cur > 1;
          const st = farm ? cur - 1 : cur;
          const team = D.partnerSlots(Math.max(0, cur - 1)) > 1 ? [p, p === 'staff' ? 'gunman' : 'staff'] : [p];
          const r = play({ stage: st, partner: p, team, meta: prof.heroes, items: prof.items, seed: plays * 13 + k * 1000, unlocked: [] });
          time += r.t;
          if (farm) {
            if (r.win) prof.coins += D.stageReward(st, r.stars, prof.stages[st] || 0, prof.items.coupon).total;
            fails++;
          } else if (!r.win) fails++;
          else {
            fails = 0;
            if (!prof.stages[cur]) { firstStars += r.stars; firsts++; }
            const prev = prof.stages[cur] || 0;
            prof.coins += D.stageReward(cur, r.stars, prev, prof.items.coupon).total;
            prof.stages[cur] = Math.max(prev, r.stars);
            if (cur === 10 && !at10) at10 = plays;
            if (cur === 20 && !at20) at20 = plays;
            if (cur === 30) { done = plays; cur++; break; }
            // 별 3개 못 받았으면 한 번 더 (보통 사람처럼) — 아니면 다음
            if (r.stars === 3 || prev) cur++;
          }
          // 강화: 가장 싼 것부터
          for (;;) {
            const opts = [];
            for (const h of ['bangjang', p, ...(cur > 10 ? [p === 'staff' ? 'gunman' : 'staff'] : [])]) { const c = prof.heroes[h] < D.META_MAX ? D.metaCost(prof.heroes[h]) : null; if (c !== null) opts.push([c, () => { prof.heroes[h]++; }]); }
            for (const it of ['door', 'charm', 'battery', 'drink', 'coupon']) {
              const c = D.itemCost(it, prof.items[it]);
              if (c !== null) opts.push([it === 'drink' ? c * 0.8 : it === 'coupon' ? c * 1.6 : c * 1.15, () => { prof.items[it]++; }, c]);
            }
            opts.sort((a, b) => a[0] - b[0]);
            const o = opts[0];
            const cost = o && (o[2] || o[0]);
            if (!o || prof.coins < cost) break;
            prof.coins -= cost;
            o[1]();
          }
        }
        const stars = Object.values(prof.stages).reduce((a, b) => a + b, 0);
        res.push({ done, reach: Math.min(30, cur - (done ? 1 : 0)), stars, at10, at20, meta: `${prof.heroes.bangjang}/${prof.heroes[p]}`, hours: time / 3600, fs: firstStars / Math.max(1, firsts) });
      }
      const avg = (f) => res.reduce((a, r) => a + f(r), 0) / res.length;
      const doneTxt = res.every((r) => r.done) ? avg((r) => r.done).toFixed(0) + '판' : res.map((r) => (r.done ? r.done : '✕')).join('/');
      console.log(pad(NAME[p], 10) + pad(doneTxt, 15) + pad(avg((r) => r.hours).toFixed(1) + 'h', 7) + pad(res.map((r) => D.stageLabel(Math.max(1, r.reach))).join(','), 8) + pad(avg((r) => r.stars).toFixed(0), 7)
        + pad(avg((r) => r.fs).toFixed(2), 7) + pad(avg((r) => r.at10).toFixed(0), 6) + pad(avg((r) => r.at20).toFixed(0), 6) + res.map((r) => r.meta).join(' '));
    }
  }

  // ── 4) 옛 방식 비교용: 20웨이브 한 판 (모두 강화 5), 동료별 도달 웨이브
  function run20() {
    const N = opt('seeds', 12);
    console.log(`
■ 20웨이브 런 — 방장 + 동료, 강화 전부 5, ${N}판`);
    console.log(pad('동료', 10) + pad('평균 웨이브', 12) + pad('20 클리어', 10) + pad('동료 DPS', 10) + '피해 몫');
    for (const p of PARTNERS) {
      let wv = 0, win = 0, dps = 0, share = 0;
      for (let i = 1; i <= N; i++) {
        const meta = { bangjang: 5, staff: 5, gunman: 5, gunnyeo: 5, eunok: 5, hanna: 5, sunggu: 5, myunghoon: 5 };
        const r = play({ mode: 'endless', partner: p, meta, seed: i * 77, unlocked: [], heroes: ['bangjang', p], stopWave: 21, maxT: 2400 });
        const w = Math.min(20, r.g.stats.wavesCleared);
        wv += w; if (w >= 20) win++;
        const ph = r.heroes[p]; dps += ph.dmg / r.t; share += ph.dmg / Math.max(1, r.dmg);
      }
      console.log(pad(NAME[p], 10) + pad((wv / N).toFixed(1), 12) + pad(Math.round((win / N) * 100) + '%', 10) + pad((dps / N).toFixed(0), 10) + Math.round((share / N) * 100) + '%');
    }
  }

  console.log(`(카드 고르기: ${POLICY})`);
  // ── 5) 상성: 좋은 팀 vs 나쁜 팀, 스킬 씀 vs 안 씀 (어려운 스테이지)
  function matchups() {
    const N = opt('seeds', 10);
    const pool = ['staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun'];
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) list.push(5, 6, 9, 10, 15, 16, 19, 20, 25, 26, 29, 30);
    console.log(`\n■ 상성 — 일반 동료(운영진·건전남·건전녀·서명훈)로 상성 좋은 팀 vs 나쁜 팀, 강화 = 스테이지×${MF}, ${N}판`);
    console.log(pad('스테이지', 9) + pad('추천', 11) + pad('좋은 팀', 24) + pad('나쁜 팀', 24) + pad('나쁜', 7) + pad('좋은', 7) + pad('좋은+스킬', 10));
    const tot = { good: 0, bad: 0, goodS: 0, n: 0, gs: 0, bs: 0, gss: 0 };
    for (const s of list) {
      const sc = D.attrScores(s);
      const slots = D.partnerSlots(s - 1);
      const combos = [];
      if (slots === 1) for (const a of pool) combos.push([a]);
      else for (let i = 0; i < pool.length; i++) for (let j = i + 1; j < pool.length; j++) combos.push([pool[i], pool[j]]);
      const val = (c) => c.reduce((x, id) => x + sc[D.HEROES[id].attr], 0);
      combos.sort((a, b) => val(b) - val(a));
      const good = combos[0], bad = combos[combos.length - 1];
      const m = metaAt(s);
      const meta = { bangjang: m, staff: m, gunman: m, gunnyeo: m, myunghoon: m };
      const res = {};
      for (const [k, team, sk] of [['good', good, false], ['bad', bad, false], ['goodS', good, true]]) {
        let w = 0, st = 0;
        for (let i = 1; i <= N; i++) { const r = play({ stage: s, team, partner: team[0], meta, items: itemsAt(s), seed: i * 53 + s, unlocked: [], skills: sk }); if (r.win) { w++; st += r.stars; } }
        res[k] = [w / N, st / N];
      }
      tot.good += res.good[0]; tot.bad += res.bad[0]; tot.goodS += res.goodS[0]; tot.gs += res.good[1]; tot.bs += res.bad[1]; tot.gss += res.goodS[1]; tot.n++;
      const nm = (t) => t.map((id) => NAME[id] + D.ATTRS[D.HEROES[id].attr].name).join('+');
      const pc = (r) => `${Math.round(r[0] * 100)}%`;
      console.log(pad(D.stageLabel(s), 9) + pad(D.recommendAttrs(s).map((a) => D.ATTRS[a].name).join('·'), 11) + pad(nm(good), 24) + pad(nm(bad), 24)
        + pad(pc(res.bad), 7) + pad(pc(res.good), 7) + pad(pc(res.goodS), 10));
    }
    const f = (v) => Math.round((v / tot.n) * 100) + '%';
    const st = (v) => (v / tot.n).toFixed(2) + '★';
    console.log(`평균 클리어율(판당 별): 나쁜 팀 ${f(tot.bad)} (${st(tot.bs)}) · 좋은 팀 ${f(tot.good)} (${st(tot.gs)}) · 좋은 팀+스킬 ${f(tot.goodS)} (${st(tot.gss)})`);
  }

  // ── 6) 타고난 힘: 상성 없이, 동료 1명 + 운영진 대신 아무도 없이 — 영웅끼리 공정한지
  function innate() {
    const N = opt('seeds', 8);
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) list.push(8, 12, 16, 19, 23, 27);
    console.log(`
■ 타고난 힘 — 상성 끄고, 방장 + 동료 1명, 강화 = 스테이지×${MF}, 스킬 ${SKILLS ? '씀' : '안 씀'}, ${N}판`);
    console.log(pad('동료', 10) + list.map((s) => pad(D.stageLabel(s), 8)).join('') + pad('평균', 8) + pad('남은 입구', 10) + '피해 몫');
    for (const p of PARTNERS) {
      let tw = 0, thp = 0, tn = 0, sh = 0;
      const cells = [];
      for (const s of list) {
        const m = metaAt(s);
        let w = 0;
        for (let i = 1; i <= N; i++) {
          const r = play({ stage: s, team: [p], partner: p, meta: { bangjang: m, [p]: m, staff: m, gunman: m, gunnyeo: m }, items: itemsAt(s), seed: i * 41 + s, unlocked: [], noTypes: true });
          if (r.win) w++; thp += r.win ? r.hp : 0; tn++;
          sh += (r.heroes[p] ? r.heroes[p].dmg : 0) / Math.max(1, r.dmg);
        }
        tw += w; cells.push(Math.round((w / N) * 100) + '%');
      }
      console.log(pad(NAME[p], 10) + cells.map((c) => pad(c, 8)).join('') + pad(Math.round((tw / tn) * 100) + '%', 8) + pad(Math.round((thp / Math.max(1, tw)) * 100) + '%', 10) + Math.round((sh / tn) * 100) + '%');
    }
  }

  function placeDeck(ids) {
    const out = new Array(6).fill(null), order = [2, 3, 1, 4, 0, 5];
    const center = (id) => (['cone', 'wave', 'dash', 'bullet', 'cane'].includes(D.HEROES[id].proj) ? 0 : 1);
    ids.slice().sort((a, b) => center(a) - center(b)).forEach((id, i) => { out[order[i]] = id; });
    return out;
  }
  // 그 스테이지쯤 사람이 끼고 있을 장비 (멤버마다)
  const gearAt = (s, ids) => { const c = D.chapterOf(s); const st = { atk: 0.03 * c, spd: 0.02 * c, crit: c >= 2 ? 0.02 : 0, hp: 0.01 * c }; return Object.fromEntries(ids.map((id) => [id, st])); };
  // ── 7) 최종 표: 챕터별 클리어율 (팀 구성 · 스킬), 평균 시간, 스테이지 곡선
  function final() {
    const N = opt('seeds', 3);
    const pool = ['staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun'];
    // 덱 5칸: 가진 멤버(방장 포함) 중 추천 덱 / 상성 제일 나쁜 덱
    const teamFor = (s, best) => {
      const sc = D.attrScores(s);
      const avail = ['bangjang', ...pool].filter((id) => !D.HERO_UNLOCK[id] || D.HERO_UNLOCK[id] < s);
      if (best) return D.recommendTeam(s, avail, 5);
      let worst = null, wv = 1e9;
      const val = (c) => c.reduce((x, id) => x + sc[D.HEROES[id].attr], 0);
      const pick = (st, cur) => { if (cur.length === Math.min(5, avail.length)) { const v = val(cur); if (v < wv) { wv = v; worst = cur.slice(); } return; } for (let i = st; i < avail.length; i++) { cur.push(avail[i]); pick(i + 1, cur); cur.pop(); } };
      pick(0, []);
      return worst;
    };
    const kinds = [['좋은 팀+스킬', true, true], ['좋은 팀', true, false], ['나쁜 팀', false, false]];
    const per = {}; const curve = [];
    const only = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    for (let s = 1; s <= 30; s++) {
      if (only.length && !only.includes(s)) continue;
      const m = metaAt(s);
      const meta = Object.fromEntries(Object.keys(D.HEROES).map((id) => [id, m]));
      const row = [];
      for (const [k, best, sk] of kinds) {
        const team = teamFor(s, best);
        if (process.argv.includes('--teams')) console.log(D.stageLabel(s), k, team.join('+'));
        let w = 0, st = 0, t = 0;
        let pf = 0;
        for (let i = 1; i <= N; i++) { const r = play({ stage: s, deck: placeDeck(team), partner: team[0], meta, gear: gearAt(s, team), items: itemsAt(s), seed: i * 97 + s, unlocked: [], skills: sk }); if (r.win) { w++; st += r.stars; t += r.t; if (!r.g.baseHit) pf++; } }
        const c = D.chapterOf(s);
        const P = (per[k + c] = per[k + c] || { w: 0, n: 0, st: 0, t: 0, tw: 0 });
        P.w += w; P.n += N; P.st += st; P.t += t; P.tw += w;
        row.push(Math.round((w / N) * 100));
      }
      curve.push(`${D.stageLabel(s)}:${row.join('/')}`);
    }
    console.log(`
■ 최종 — 강화 = 스테이지×${MF} (+아이템 조금), 스테이지마다 ${N}판, 카드는 ${POLICY}`);
    console.log(pad('팀', 16) + [1, 2, 3].map((c) => pad(`${c}장 클리어(별)`, 18)).join('') + '클리어 판 평균 시간');
    for (const [k] of kinds) {
      let tt = 0, tw = 0;
      const cells = [1, 2, 3].map((c) => { const P = per[k + c]; if (!P) return pad('-', 18); tt += P.t; tw += P.tw; return pad(`${Math.round((P.w / P.n) * 100)}% (${(P.st / Math.max(1, P.w)).toFixed(1)}★)`, 18); });
      console.log(pad(k, 16) + cells.join('') + `${Math.floor(tt / tw / 60)}분 ${Math.round((tt / tw) % 60)}초`);
    }
    console.log('스테이지별 클리어율 % (좋은+스킬/좋은/나쁜):');
    for (let i = 0; i < curve.length; i += 10) console.log('  ' + curve.slice(i, i + 10).join('  '));
  }

  const t0 = Date.now();
  if (what === 'final') final();
  if (what === 'innate') innate();
  if (what === 'matchups') matchups();
  if (what === 'run20') run20();
  if (what === 'speed') {
    const r = play({ stage: 15, partner: 'gunman', meta: { bangjang: 6, gunman: 6 }, seed: 1 });
    console.log('1판', r.win, r.stars, r.t.toFixed(0) + 's', r.steps, 'steps', (Date.now() - t0) + 'ms');
  }
  if (what === 'all' || what === 'curve') curve();
  if (what === 'all' || what === 'stages') stages();
  if (what === 'all' || what === 'campaign') campaign();
  console.log(`\n(${((Date.now() - t0) / 1000).toFixed(1)}초)`);
})().catch((e) => { console.error(e); process.exit(1); });
