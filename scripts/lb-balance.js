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
const JOIN_MODE = args.includes('--join'); // --join: 대장 1명 시작 · 레벨업 카드로 합류
const TEMPO_MODE = args.includes('--tempo'); // --tempo: 느리고 묵직한 전투 (진상 수 ×0.6 · 공속 ÷1.54 · 한 방 ×1.6 · 스킬 쿨 ×1.5)
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
      if (c.kind === 'join') v = 9; // 합류 카드: 사람들은 거의 고른다
      else if (c.rarity === 'hidden') v = 10;
      else if (c.kind === 'addHero') v = g.heroes.length < 4 ? 8 : 5;
      else if (c.kind === 'heroLv') {
        const h = S.hasHero(g, c.hero);
        v = 6 + (h.lv + 1 === 3 || h.lv + 1 === 5 ? 2.5 : 0) + (h.def.hidden ? 1 : 0) + (h.id === g.partner ? 1 : 0);
      } else if (c.kind === 'evo') v = 9.5;
      else if (c.kind === 'secret') v = 9;
      else if (c.kind === 'skillEvo') v = SKILLS ? 8 : 3;
      else if (c.kind === 'heroMod') v = 6.5;
      else if (c.kind === 'global') {
        const tagN = (t) => g.heroes.filter((h) => (D.HERO_TAGS[h.id] || []).includes(t)).length;
        if (c.attr) v = 4.2 + 1.6 * (g.attrCount[c.attr] || 0);
        else if (c.tag && c.tag !== 'boss') v = 2.6 + 1.7 * tagN(c.tag);
        else v = { dmg: 6.5, spd: 6, boss: 8, pierce: 7.5, crit: 5, gunExtra: 7, hp: g.base.hp / g.base.max < 0.6 ? 6 : 3.5, regen: 4.5, ult: 3.5, exp: 3.5, slow: 4, charmRes: 2.5,
          tag_boss: g.stage % 5 === 0 ? 6.5 : 3.5, swarm: 5, risk_allin: g.base.hp / g.base.max > 0.75 ? 6.5 : 2, risk_overtime: g.wave <= 2 ? 4.5 : 2, risk_glass: 4.5, econ_bonus: 6 }[c.id] || 2;
      } else if (c.kind === 'filler') v = c.id === 'fillHeal' && g.base.hp / g.base.max < 0.6 ? 5 : 1;
      v += rng() * 1.5;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  // 스킬 자동 사용 (--skills=1): 준비되면 바로. 찍는 스킬은 진상이 가장 몰린 곳에
  const SKILLS = opt('skills', 0) > 0;
  const SKILL_EVERY = opt('skillevery', 6);
  const PICK_DELAY = opt('pickdelay', 2); // 스킬 확인 간격(스텝): 90 이면 보통 사람처럼 1.5초쯤 늦게
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
  function aiSkills(g, control) {
    // 컨트롤(7장): 눈사태 예고가 뜨면 0.6초쯤 뒤 아무 스킬로 끊고 · 예고가 곧 올 땐 스킬 하나를 아껴 둔다
    if (control) {
      const ava = g.avalanche && !g.avalanche.dead && g.avalanche.avaW > 0 ? g.avalanche : null;
      if (ava) { if (ava.def.avalanche.windup - ava.avaW > 0.6) for (const h of g.heroes) if (S.skillReady(h) && S.castSkill(g, h, ava.x, ava.y)) break; return; }
      const boss = g.enemies.find((e) => !e.dead && e.def.avalanche && e.y > 0);
      if (boss && boss.avaT < 4 && g.base.hp / g.base.max > 0.35) return;
    }
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
      deck: o.deck, gear: o.gear, join: o.join !== undefined ? o.join : JOIN_MODE, tempo: o.tempo !== undefined ? o.tempo : TEMPO_MODE, hell: !!o.hell, leader: o.leader,
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
      // 레벨업 카드는 게임이 안 멈춘다 → 사람처럼 1.5~3초 뒤에 고른다
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + (g.welcomePicks > 0 ? 0 : PICK_DELAY * (0.75 + pr() * 0.5));
      if (g.pendingLevels > 0 && g.t >= g.pickAt) {
        const cards = S.rollCards(g);
        S.applyCard(g, cards[pickCard(g, cards, pr)]);
        g.pendingLevels--;
        if (g.welcomePicks > 0) g.welcomePicks--;
        g.pickAt = undefined;
      }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 10 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
      if ((o.skills !== undefined ? o.skills : SKILLS) && (steps % SKILL_EVERY) === 0) aiSkills(g, o.control);
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

  // ── 초반 곡선 (node scripts/lb-balance.js early): 그 스테이지에 보통 사람이 가진 덱으로 1-1 ~ 2-3 클리어율
  //  강화는 스테이지 따라 조금씩 (s/3) · 동료는 그때 열린 멤버 중 하나씩 번갈아 (김도훈은 1-6 깬 뒤부터)
  function early() {
    // --add=5:-2,6:-3 : 스테이지 난이도(stageAdd)를 바꿔 보고 싶을 때 (파일은 안 바뀜)
    const ov = (process.argv.find((x) => x.startsWith('--add=')) || '').slice(6);
    for (const kv of ov.split(',').filter(Boolean)) { const [k, v] = kv.split(':').map(Number); D.STAGE.stageAdd[k] = v; }
    const only = (process.argv.find((x) => x.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    const seeds = opt('seeds', 24);
    console.log(`■ 초반 곡선 — 스테이지별 클리어율 (${seeds}판 · 카드 ${POLICY})`);
    const rows = [];
    for (let s = 1; s <= 13; s++) {
      if (only.length && !only.includes(s)) continue;
      const lv = Math.min(D.META_MAX, Math.floor(s / 3));
      const pool = ['staff', 'gunman', 'gunnyeo', ...Object.entries(D.HERO_UNLOCK).filter(([, n]) => n < s).map(([id]) => id)];
      let win = 0, hp = 0;
      for (let k = 0; k < seeds; k++) {
        const p = pool[k % pool.length];
        // 덱 4칸: 방장 + 가진 멤버 셋 (새로 연 멤버가 있으면 사람들은 바로 넣어 본다)
        const fresh = pool.slice(3);
        const mates = [...fresh.slice(-1), ...['staff', 'gunman', 'gunnyeo'].filter((x, i) => i !== k % 3)].slice(0, 3);
        const meta = Object.fromEntries(['bangjang', ...pool].map((h) => [h, lv]));
        const r = play({ stage: s, partner: p, deck: [null, mates[0], 'bangjang', mates[1], mates[2], null], meta, seed: s * 1000 + k, unlocked: [] });
        if (r.win) win++;
        hp += r.win ? r.hp : 0;
      }
      rows.push(`${D.stageLabel(s)}	${Math.round((win / seeds) * 100)}%	남은 입구 ${win ? Math.round((hp / win) * 100) : 0}%	(강화 ${lv} · 동료 ${pool.length}명)`);
    }
    console.log(rows.join(String.fromCharCode(10)));
  }
  if (what === 'early') { early(); return; }

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
    const pool = (process.argv.find((x) => x.startsWith('--pool=')) || '').slice(7).split(',').filter(Boolean);
    if (!pool.length) pool.push('staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu');
    // 덱 칸: 1~4장 4칸 · 5장 5칸(5번째 칸 삼) · 6장 6칸
    const slotsAt = (s) => Math.min(6, Math.max(4, D.chapterOf(s) - 1));
    const teamFor = (s, best) => {
      const sc = D.attrScores(s);
      const n = slotsAt(s);
      const avail = ['bangjang', ...pool].filter((id) => !D.HERO_UNLOCK[id] || D.HERO_UNLOCK[id] < s);
      if (best) return D.recommendTeam(s, avail, n);
      let worst = null, wv = 1e9;
      const val = (c) => c.reduce((x, id) => x + sc[D.HEROES[id].attr], 0);
      const pick = (st, cur) => { if (cur.length === Math.min(n, avail.length)) { const v = val(cur); if (v < wv) { wv = v; worst = cur.slice(); } return; } for (let i = st; i < avail.length; i++) { cur.push(avail[i]); pick(i + 1, cur); cur.pop(); } };
      pick(0, []);
      return worst;
    };
    const kinds = [['좋은 팀+스킬', true, true], ['좋은 팀', true, false], ['나쁜 팀', false, false]].slice(0, process.argv.includes('--onlygood') ? 1 : 3);
    const ht = (process.argv.find((x) => x.startsWith('--hptune=')) || '').slice(9);
    if (ht) D.STAGE.hpTune = ht.split(',').map(Number);
    const per = {}; const curve = []; const picks = {}; let teams = 0;
    const only = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    for (let s = 1; s <= D.STAGE_COUNT; s++) {
      if (only.length && !only.includes(s)) continue;
      const m = metaAt(s);
      const meta = Object.fromEntries(Object.keys(D.HEROES).map((id) => [id, m]));
      const row = [];
      for (const [k, best, sk] of kinds) {
        const team = teamFor(s, best);
        if (best && sk) { teams++; for (const id of team) picks[id] = (picks[id] || 0) + 1; }
        if (process.argv.includes('--teams')) console.log(D.stageLabel(s), k, team.join('+'));
        let w = 0, st = 0, t = 0, hpSum = 0;
        let pf = 0;
        for (let i = 1; i <= N; i++) { const r = play({ stage: s, deck: placeDeck(team), partner: team[0], meta, gear: gearAt(s, team), items: itemsAt(s), seed: i * 97 + s, unlocked: [], skills: sk }); if (r.win) { w++; st += r.stars; t += r.t; hpSum += r.hp; if (!r.g.baseHit) pf++; } }
        const c = D.chapterOf(s);
        const P = (per[k + c] = per[k + c] || { w: 0, n: 0, st: 0, t: 0, tw: 0, hp: 0 });
        P.w += w; P.n += N; P.st += st; P.t += t; P.tw += w; P.hp += hpSum;
        row.push(Math.round((w / N) * 100));
      }
      curve.push(`${D.stageLabel(s)}:${row.join('/')}`);
    }
    console.log(`
■ 최종 — 강화 = 스테이지×${MF} (+아이템 조금), 스테이지마다 ${N}판, 카드는 ${POLICY}`);
    const CH = Array.from({ length: D.CHAPTERS.length }, (_, i) => i + 1);
    console.log(pad('팀', 16) + CH.map((c) => pad(`${c}장(별)`, 14)).join('') + '평균 시간');
    for (const [k] of kinds) {
      let tt = 0, tw = 0;
      const cells = CH.map((c) => { const P = per[k + c]; if (!P) return pad('-', 14); tt += P.t; tw += P.tw; return pad(`${Math.round((P.w / P.n) * 100)}% (${(P.st / Math.max(1, P.w)).toFixed(1)}★)`, 14); });
      console.log(pad(k, 16) + cells.join('') + `${Math.floor(tt / tw / 60)}분 ${Math.round((tt / tw) % 60)}초`);
    }
    const jp = (process.argv.find((x) => x.startsWith('--json=')) || '').slice(7);
    if (jp) {
      const TG = [80, 65, 55, 45, 30, 20, 15];
      const out = { chapters: CH.map((c) => ({ chapter: c, target: TG[c - 1], hpTune: D.STAGE.hpTune[c - 1],
        ...Object.fromEntries(kinds.map(([k]) => { const P = per[k + c] || { w: 0, n: 1, st: 0, hp: 0 }; return [k, { clear: Math.round((P.w / P.n) * 100), stars: +(P.st / Math.max(1, P.w)).toFixed(2), hpLeft: Math.round((P.hp / Math.max(1, P.w)) * 100) }]; })) })),
        pickRate: Object.fromEntries(Object.entries(picks).map(([id, n]) => [id, Math.round((n / Math.max(1, teams)) * 100)])), curve };
      require('fs').writeFileSync(jp, JSON.stringify(out, null, 1));
    }
    console.log('스테이지별 클리어율 % (좋은+스킬/좋은/나쁜):');
    for (let i = 0; i < curve.length; i += 10) console.log('  ' + curve.slice(i, i + 10).join('  '));
  }

  // ── 8) 스테이지별 맞춤 (--calib): 스테이지마다 난이도 가산(stageAdd)을 이분 탐색해서 목표 클리어율에 맞춘다
  //  목표: 챕터 목표 + 챕터 앞쪽은 조금 쉽게 · 보스 스테이지는 조금 어렵게 → 들쭉날쭉하지 않은 곡선
  function calib() {
    const N = opt('seeds', 8), IT = opt('iters', 4);
    const TG = [80, 65, 55, 45, 30, 20, 15];
    const ht = (process.argv.find((x) => x.startsWith('--hptune=')) || '').slice(9);
    if (ht) D.STAGE.hpTune = ht.split(',').map(Number);
    const pool = ['staff', 'gunman', 'gunnyeo', 'dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu'];
    const slotsAt = (s) => Math.min(6, Math.max(4, D.chapterOf(s) - 1));
    const out = {};
    const only = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    for (let s = 3; s <= D.STAGE_COUNT; s++) {
      if (only.length && !only.includes(s)) continue;
      const n = D.stageNo(s), c = D.chapterOf(s);
      const target = TG[c - 1] + (5 - n) * 1.5 - ([5, 10].includes(n) ? 5 : 0);
      const m = metaAt(s);
      const meta = Object.fromEntries(Object.keys(D.HEROES).map((id) => [id, m]));
      const avail = ['bangjang', ...pool].filter((id) => !D.HERO_UNLOCK[id] || D.HERO_UNLOCK[id] < s);
      const team = D.recommendTeam(s, avail, slotsAt(s));
      const base = D.STAGE.stageAdd[s] || 0;
      const rate = (add) => {
        D.STAGE.stageAdd[s] = base + add;
        let w = 0;
        for (let i = 1; i <= N; i++) if (play({ stage: s, deck: placeDeck(team), partner: team[0], meta, gear: gearAt(s, team), items: itemsAt(s), seed: i * 131 + s * 7, unlocked: [], skills: true }).win) w++;
        return (w / N) * 100;
      };
      const RG = opt('range', 4);
      let lo = -RG, hi = RG, best = 0, bestErr = 1e9, r0 = rate(0);
      if (Math.abs(r0 - target) < 100 / N) { best = 0; bestErr = Math.abs(r0 - target); }
      else {
        for (let k = 0; k < IT; k++) {
          const mid = (lo + hi) / 2;
          const r = rate(mid);
          if (Math.abs(r - target) < bestErr) { bestErr = Math.abs(r - target); best = mid; }
          if (r > target) lo = mid; else hi = mid;
        }
      }
      D.STAGE.stageAdd[s] = base + best;
      out[s] = +(base + best).toFixed(2);
      console.log(`${D.stageLabel(s)} 목표 ${target.toFixed(0)}% · 처음 ${r0.toFixed(0)}% → 가산 ${out[s]} (오차 ${bestErr.toFixed(0)})`);
    }
    console.log('stageAdd: ' + JSON.stringify(Object.fromEntries(Object.entries(out).filter(([, v]) => v !== 0))));
  }
  // ── 9) 7장 스키장 (node scripts/lb-balance.js ch7 [--seeds=N] [--list=61,65] [--hell]) — 실제 게임처럼 합류 · 템포 · 스킬 · 6칸 덱
  //  덱 성향별 클리어율: 한 명만 키운 덱 · 역할을 갖춘 T3/T4 덱(컨트롤 있음/없음) · 키운 LEGEND 포함 덱
  function ch7() {
    const N = opt('seeds', 8);
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    if (!list.length) for (let s = 61; s <= 70; s++) list.push(s);
    const hell = args.includes('--hell');
    const only = (process.argv.find((x) => x.startsWith('--prof=')) || '').slice(7).split(',').filter(Boolean);
    const lo = (ids, m, extra = {}) => Object.assign(Object.fromEntries(ids.map((id) => [id, m])), extra);
    const PROF = [
      ['한 명 몰빵(T4 아라 20)', ['ara', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], lo(['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], 8, { ara: 20 }), true],
      ['한 명 몰빵(LEGEND 20)', ['hochan', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], lo(['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon'], 8, { hochan: 20 }), true],
      ['T3·T4 역할 덱 (컨트롤 X)', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'hyungyeong'], 15), false],
      ['T3·T4 역할 덱', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'hyungyeong'], 15), true],
      ['역할 덱 + LEGEND 이호찬', ['donghan', 'hochan', 'ara', 'gunnyeo', 'sunggu', 'staff'], lo(['ara', 'gunnyeo', 'sunggu', 'donghan', 'staff'], 15, { hochan: 20 }), true],
      ['역할 덱 + LEGEND 강병화', ['donghan', 'byunghwa', 'ara', 'gunnyeo', 'sunggu', 'staff'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan'], 15, { byunghwa: 20 }), true],
      ['역할 덱 + LEGEND 둘', ['donghan', 'hochan', 'byunghwa', 'gunnyeo', 'sunggu', 'staff'], lo(['gunnyeo', 'sunggu', 'donghan', 'staff'], 15, { hochan: 20, byunghwa: 20 }), true],
      ['역할 덱 강화 20 (헬용)', ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'hyungyeong'], 20), true],
      ['역할+LEGEND 강화 20 (헬용)', ['donghan', 'byunghwa', 'ara', 'gunnyeo', 'sunggu', 'staff'], lo(['ara', 'gunnyeo', 'sunggu', 'staff', 'donghan', 'byunghwa'], 20), true],
      ['T1·T2만 (강화 15)', ['dohoon', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'eunok'], lo(['dohoon', 'bangjang', 'staff', 'gunman', 'gunnyeo', 'eunok'], 15), true],
    ].filter((p, i) => !only.length || only.includes(String(i)));
    const items = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    console.log(`
■ 7장 스키장${hell ? ' (헬)' : ''} — 합류 · 템포 · 스킬 자동 · ${N}판씩`);
    console.log(pad('덱', 26) + list.map((s) => pad(D.stageLabel(s), 7)).join('') + '평균');
    const out = {};
    for (const [name, ids, meta, control] of PROF) {
      const cells = []; let tw = 0, tn = 0; const lossW = {}, ava = [0, 0], share = {};
      for (const s of list) {
        let w = 0;
        for (let i = 1; i <= N; i++) {
          const r = play({ stage: s, deck: placeDeck(ids), partner: ids[0], leader: ids[0], meta, gear: gearAt(s, ids), items, seed: i * 173 + s * 11 + opt('seedoff', 0), unlocked: [], skills: true, control, join: true, tempo: true, hell });
          if (r.win) w++; else lossW[r.wave] = (lossW[r.wave] || 0) + 1;
          ava[0] += r.g.stats.avaHit || 0; ava[1] += r.g.stats.avaStop || 0;
          for (const [id, v] of Object.entries(r.heroes)) share[id] = (share[id] || 0) + v.dmg / Math.max(1, r.dmg) / (N * list.length);
        }
        cells.push(Math.round((w / N) * 100)); tw += w; tn += N;
      }
      out[name] = cells;
      console.log(pad(name, 26) + cells.map((c) => pad(c + '%', 7)).join('') + Math.round((tw / tn) * 100) + '%' + (args.includes('--why') ? `  진 웨이브 ${JSON.stringify(lossW)} · 눈사태 맞음/끊음 ${ava[0]}/${ava[1]} · 피해 몫 ${Object.entries(share).map(([k, v]) => k + ' ' + Math.round(v * 100)).join(' ')}` : ''));
    }
    return out;
  }
  // 7장 스테이지별 맞춤: 역할 덱(컨트롤 있음)으로 stageAdd 를 이분 탐색 (node scripts/lb-balance.js ch7calib --list=64 --target=60)
  function ch7calib() {
    const N = opt('seeds', 8), IT = opt('iters', 4), RG = opt('range', 4);
    const TG = { 61: 72, 62: 68, 63: 64, 64: 62, 65: 55, 66: 60, 67: 58, 68: 56, 69: 54, 70: 46 };
    const list = (process.argv.find((x) => x.startsWith('--list=')) || '').slice(7).split(',').filter(Boolean).map(Number);
    const ids = ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'];
    const meta = Object.fromEntries(ids.map((id) => [id, 15]));
    const items = { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 };
    for (const s of list) {
      const target = opt('target', TG[s] || 60);
      const base = D.STAGE.stageAdd[s] || 0;
      const rate = (add) => { D.STAGE.stageAdd[s] = base + add; let w = 0; for (let i = 1; i <= N; i++) if (play({ stage: s, deck: placeDeck(ids), leader: ids[0], meta, gear: gearAt(s, ids), items, seed: i * 173 + s * 11, unlocked: [], skills: true, control: true, join: true, tempo: true }).win) w++; return (w / N) * 100; };
      let lo = -RG, hi = RG, best = 0, bestErr = 1e9;
      const r0 = rate(0); bestErr = Math.abs(r0 - target);
      if (bestErr >= 100 / N) for (let k = 0; k < IT; k++) { const mid = (lo + hi) / 2; const r = rate(mid); if (Math.abs(r - target) < bestErr) { bestErr = Math.abs(r - target); best = mid; } if (r > target) lo = mid; else hi = mid; }
      console.log(`${s} 목표 ${target}% · 처음 ${r0.toFixed(0)}% → 가산 ${+(base + best).toFixed(2)} (오차 ${bestErr.toFixed(0)})`);
    }
  }
  const t0 = Date.now();
  if (what === 'ch7calib') ch7calib();
  if (what === 'ch7') ch7();
  if (what === 'calib') calib();
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
