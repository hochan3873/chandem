'use strict';
// 랑방 대전 — 할로윈 이벤트 밸런스 (전투력 맞춤 · 출전 제한 덱 · 저주)
//   node scripts/lb-hw-balance.js meas [--list=1,2,...] [--seeds=16] [--curses=hp30,stun2] [--decks=fit,naive,auto]
//        스테이지마다 '맞는 덱'(조건 + 그 판 진상 기술을 막는 멤버) vs '대충 덱'(조건만 겨우 + 센 멤버) 첫 도전 클리어율 · 입구 · 쓰러짐
//   node scripts/lb-hw-balance.js calib [--list=...] [--seeds=16] [--target=0.7]   맞는 덱 클리어율이 목표가 되게 STAGES[n].add 이분 탐색 (결과만 출력 → hw-event.js 에 손으로)
//   node scripts/lb-hw-balance.js curses --list=1,5,10 [--seeds=10]   저주마다 맞는 덱 클리어율 (저주가 난이도를 알맞게 올리는지)
//  기준 플레이어 = 사람처럼 (스킬 1.5초 늦게 · 카드 40% 아무거나) · 전투력 맞춤 +12 ★3 · 장비 없음 · 이벤트 기간 5장쯤 온 사람 (LEGEND · 박나영 없음)
const path = require('path');
const { pathToFileURL } = require('url');
const LIB = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const what = args.find((x) => !x.startsWith('--')) || 'meas';
function seeded(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pct = (v) => (v * 100).toFixed(0).padStart(3) + '%';

(async () => {
  const D = await load('data.js');
  const S = await load('sim.js');
  const HW = await load('hw-event.js');
  const NOT_OWNED = new Set(['hochan', 'byunghwa', 'dragon']); // 기준 플레이어가 아직 없는 멤버 (LEGEND · 히든 박나영)
  const own = (h) => !!D.HEROES[h] && !D.HEROES[h].summon && !NOT_OWNED.has(h);
  const dps = (h) => { const d = D.HEROES[h]; return (d.dmg / d.interval) * (d.kit || 1) * (D.TEMPO.fix[h] || 1); };
  const SEEDS = Number(opt('seeds', 16));
  const banned = (n, h) => HW.stageOf(n).rules.some((r) => HW.RULES[r].ban && HW.RULES[r].ban(h));
  const maxOf = (n) => Math.min(HW.HW.slots, ...HW.stageOf(n).rules.map((r) => HW.RULES[r].max || 99));
  // 필요한 조건 멤버 (가진 것 → 없으면 빌리기)
  function needs(n, pick) {
    const out = [], rent = [];
    for (const r of HW.stageOf(n).rules) { const R = HW.RULES[r]; if (!R.need) continue; let have = out.filter((h) => R.need.includes(h)).length; for (const h of pick(R.need.filter((x) => !banned(n, x)))) { if (have >= (R.n || 1)) break; if (out.includes(h)) continue; if (own(h)) out.push(h); else if (!rent.length) { rent.push(h); out.push(h); } else continue; have++; } }
    return { out, rent: rent[0] || null };
  }
  // 대충 덱: 조건을 겨우 맞추고 나머지는 센 딜러
  function naiveDeck(n) {
    const { out, rent } = needs(n, (l) => l.slice().sort((a, b) => dps(b) - dps(a)));
    for (const h of Object.keys(D.HEROES).filter((x) => own(x) && !banned(n, x) && !out.includes(x)).sort((a, b) => dps(b) - dps(a))) { if (out.length >= maxOf(n)) break; out.push(h); }
    return { deck: out, rent };
  }
  // 설계한 풀이 덱 (스테이지마다 이 판 진상 기술 · 출전 제한에 맞춘 조합 — 5장쯤 온 사람이 가진 멤버로)
  const PLAN = {
    1: ['jiwon', 'sanghwa', 'eunok', 'ara', 'jieun'], 2: ['staff', 'gunman', 'jieun', 'sunggu', 'eunok'], 3: ['soyoung', 'gunnyeo', 'staff', 'gunman', 'sanghwa'],
    4: ['soyoung', 'jiwon', 'ara', 'staff', 'jieun'], 5: ['gunnyeo', 'soyoung', 'staff', 'jiwon', 'ara'], 6: ['eunok', 'ara', 'youngjun', 'dohoon', 'jungmin'],
    7: ['jiwon', 'gunman', 'ara', 'sunggu', 'gunnyeo'], 8: ['gunnyeo', 'soyoung', 'gunman', 'ara'], 9: ['staff', 'jiwon', 'ara', 'soyoung', 'jieun'], 10: ['jungmin', 'gunnyeo', 'soyoung', 'ara', 'jiwon'],
  };
  const planDeck = (n) => ({ deck: PLAN[n].slice(), rent: null });
  // 상성 없는 덱: 조건은 맞추되 이 판 핵심 멤버(STAGES.keys)는 빼고 센 멤버로 (같은 전투력에서 '맞는 멤버'의 몫)
  function badDeck(n) {
    const keys = new Set(HW.stageOf(n).keys || []);
    const { out, rent } = needs(n, (l) => l.slice().sort((a, b) => dps(b) - dps(a)));
    for (const h of Object.keys(D.HEROES).filter((x) => own(x) && !banned(n, x) && !out.includes(x) && !keys.has(x)).sort((a, b) => dps(b) - dps(a))) { if (out.length >= maxOf(n)) break; out.push(h); }
    return { deck: out, rent };
  }
  // 맞는 덱: 조건 + 이 판 진상 기술을 막는 멤버 · 방깎(철갑) · 탱커/서포터 하나 · 나머지 딜러
  function fitDeck(n) {
    const foes = HW.stageEnemies(n);
    const want = {};
    for (const t of foes) for (const sk of D.enemySkills(t)) for (const h of sk.counter || []) want[h] = (want[h] || 0) + (D.ENEMIES[t].boss ? 2 : 1);
    const armor = foes.some((t) => (D.ENEMIES[t].armor || 0) >= 5);
    const score = (h) => (want[h] || 0) * 1.2 + dps(h) / 40 + (armor && D.ARMOR_BREAKERS.includes(h) ? 2 : 0) + (D.KD_SUP[h] ? 0.8 : 0);
    const { out, rent } = needs(n, (l) => l.slice().sort((a, b) => score(b) - score(a)));
    for (const h of Object.keys(D.HEROES).filter((x) => own(x) && !banned(n, x) && !out.includes(x)).sort((a, b) => score(b) - score(a))) { if (out.length >= maxOf(n)) break; out.push(h); }
    return { deck: out, rent };
  }
  // 아무 덱: 조건만 맞춘 무작위 멤버 (판마다 다른 덱 — '조건만 맞추면 아무나 깬다' 를 잰다)
  function randDeck(n, seed) {
    const r = seeded(seed * 131 + n);
    const shuf = (l) => l.map((h) => [r(), h]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
    const { out, rent } = needs(n, shuf);
    for (const h of shuf(Object.keys(D.HEROES).filter((x) => own(x) && !banned(n, x) && !out.includes(x)))) { if (out.length >= maxOf(n)) break; out.push(h); }
    return { deck: out, rent };
  }
  const placeDeck = (ids) => { const order = D.openSlots(6), o = new Array(6).fill(null); ids.forEach((h, i) => { o[order[i]] = h; }); return o; };
  function pickCard(g, cards, rng) {
    if (rng() < 0.4) return (rng() * cards.length) | 0;
    let best = 0, bv = -1;
    cards.forEach((c, i) => { let v = c.kind === 'evo' ? 9.5 : c.kind === 'heroLv' ? 6 + (S.hasHero(g, c.hero) && [2, 4].includes(S.hasHero(g, c.hero).lv) ? 2.5 : 0) : c.kind === 'heroMod' ? 6.5 : c.kind === 'skillEvo' ? 8 : c.kind === 'global' ? 5 : 2; v += rng() * 1.5; if (v > bv) { bv = v; best = i; } });
    return best;
  }
  function densest(g, r) { let best = null, bn = 0; for (const e of g.enemies) { if (e.dead || e.y < 0) continue; let k = 0; for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < r && Math.abs(o.y - e.y) < r) k += o.boss ? 3 : 1; if (k > bn) { bn = k; best = e; } } return best ? { x: best.x, y: best.y, n: bn } : null; }
  function aiSkills(g) {
    for (const h of g.heroes) {
      if (!S.skillReady(h)) continue;
      const sk = h.def.skill;
      let alive = 0; for (const e of g.enemies) if (!e.dead && e.y > 0) alive++;
      if (sk.target) { const c = densest(g, (sk.r ? sk.r[h.lv - 1] : 120) * 0.8); if (c && (c.n >= 4 || g.bossAlive)) S.castSkill(g, h, c.x, c.y); }
      else if (sk.id === 'firstaid') { if (g.base.hp / g.base.max < 0.8 || g.heroes.some((o) => o.stunT > 0.6 || o.kd / (o.kdMax || 100) > 0.6) || (g.hw && g.hw.marks.length)) S.castSkill(g, h); }
      else if (alive >= 6 || g.bossAlive) S.castSkill(g, h);
    }
  }
  function play(n, d, seed, curses = [], diag = null) {
    const rng = seeded(seed);
    const def = HW.eventDef(n, curses, d.deck);
    const p = { heroes: Object.fromEntries(d.deck.map((h) => [h, HW.HW.sync.meta])), hstars: Object.fromEntries(d.deck.map((h) => [h, 3])), equip: {}, gear: [] };
    const lo = HW.syncLoadout(p, d.deck, d.rent);
    const g = S.createGame({ H: 760, rng, mode: 'stage', tempo: true, stage: def.stage, event: def, deck: placeDeck(d.deck), meta: lo.meta, stars: lo.stars, gear: lo.gear, items: {}, slots: 6 });
    const pr = seeded(seed * 7 + 3);
    let steps = 0;
    while (!g.over && g.phase !== 'victory' && g.t < 900) {
      S.step(g, 1 / 60); steps++;
      if (diag) for (const e of g.events) { if (e.type === 'baseHit') diag.door[e.by || '?'] = (diag.door[e.by || '?'] || 0) + e.v; if (e.type === 'knockdown') diag.kd[e.hero] = (diag.kd[e.hero] || 0) + 1; }
      g.events.length = 0;
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + (g.welcomePicks > 0 ? 0 : 2 * (0.75 + pr() * 0.5));
      if (g.pendingLevels > 0 && g.t >= g.pickAt) { const cards = S.rollCards(g); S.applyCard(g, cards[pickCard(g, cards, pr)]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
      if (g.augOffer && g.t - (g.augAt || (g.augAt = g.t)) > 2) { S.applyAug(g, g.augOffer.opts[(pr() * g.augOffer.opts.length) | 0]); g.augAt = 0; }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 10 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
      if (steps % 90 === 0) aiSkills(g);
    }
    if (diag) { diag.lost[g.wave] = (diag.lost[g.wave] || 0) + (g.victory ? 0 : 1); for (const [k, v] of Object.entries(g.stats.kdBy || {})) diag.kdBy[k] = (diag.kdBy[k] || 0) + v; diag.lvl += g.level; }
    return { win: g.victory, hp: g.base.hp / g.base.max, t: g.t, wave: g.wave, kd: g.stats.kd | 0, breaks: g.stats.castBreak | 0 };
  }
  function meas(n, kind, curses = [], seeds = SEEDS, off = 0) {
    let d = kind === 'naive' ? naiveDeck(n) : kind === 'auto' ? fitDeck(n) : kind === 'bad' ? badDeck(n) : kind === 'rand' ? randDeck(n, 1) : planDeck(n); // fit = 설계한 풀이 덱 · auto = 기술 상성 자동 · naive = 조건만 + 센 멤버 · bad = 핵심 멤버 빼고 · rand = 판마다 아무 덱
    let w = 0, hp = 0, kd = 0, wv = 0, t = 0;
    for (let s = 1; s <= seeds; s++) { if (kind === 'rand') d = randDeck(n, s + off); const r = play(n, d, 1000 * n + s * 17 + off, curses); if (kind === 'rand' && opt('v', '')) console.log(`    ${r.win ? 'O' : 'x'} w${r.wave} 입구 ${pct(r.hp)} ${d.deck.map((h) => ((HW.stageOf(n).sig && HW.SIGS[HW.stageOf(n).sig].heroes.includes(h)) ? '*' : '') + NM(h)).join(' ')}`); w += r.win ? 1 : 0; hp += r.win ? r.hp : 0; kd += r.kd; wv += r.wave; t += r.t; }
    return { n, kind, deck: d.deck, rent: d.rent, rate: w / seeds, hp: w ? hp / w : 0, kd: kd / seeds, wave: wv / seeds, t: t / seeds };
  }
  const list = String(opt('list', HW.STAGES.map((s) => s.n).join(','))).split(',').map(Number);
  const NM = (h) => (D.HEROES[h] || D.ENEMIES[h] || {}).name || h;
  if (what === 'meas') {
    const curses = (opt('curses', '') || '').split(',').filter(Boolean);
    const kinds = String(opt('decks', 'fit,naive')).split(',');
    for (const n of list) {
      const rows = kinds.map((k) => meas(n, k, curses));
      console.log(`H${n} ${HW.stageOf(n).name} [${HW.stageOf(n).rules.join('+')}]` + rows.map((r) => `\n   ${r.kind.padEnd(5)} ${pct(r.rate)} 입구 ${pct(r.hp)} 웨이브 ${r.wave.toFixed(1)} 쓰러짐 ${r.kd.toFixed(1)} ${Math.round(r.t)}초 · ${r.deck.map(NM).join(' ')}${r.rent ? ` (대여 ${NM(r.rent)})` : ''}`).join(''));
    }
  } else if (what === 'calib') {
    const target = Number(opt('target', 0.7)), range = Number(opt('range', 6));
    const out = {};
    for (const n of list) {
      const st = HW.stageOf(n), a0 = opt('center', '') !== '' ? Number(opt('center')) : st.add || 0;
      let lo = a0 - range, hi = a0 + range, best = a0, bd = 9;
      for (let it = 0; it < 6; it++) {
        const mid = (lo + hi) / 2; st.add = mid;
        const r = meas(n, 'fit', [], SEEDS);
        const dlt = Math.abs(r.rate - target);
        if (dlt < bd) { bd = dlt; best = mid; }
        console.log(`  H${n} add ${mid.toFixed(2)} → ${pct(r.rate)}`);
        if (r.rate > target) lo = mid; else hi = mid;
      }
      st.add = best; out[n] = +best.toFixed(2);
      console.log(`H${n} add = ${best.toFixed(2)}`);
    }
    console.log('add:', JSON.stringify(out));
  } else if (what === 'diag') {
    for (const n of list) {
      const kind = opt('deck', 'fit'); const d = kind === 'naive' ? naiveDeck(n) : kind === 'auto' ? fitDeck(n) : kind === 'bad' ? badDeck(n) : planDeck(n);
      if (opt('add', '') !== '') HW.stageOf(n).add = Number(opt('add'));
      const dg = { door: {}, kd: {}, kdBy: {}, lost: {}, lvl: 0 }; let w = 0;
      for (let s = 1; s <= SEEDS; s++) w += play(n, d, 1000 * n + s * 17, [], dg).win ? 1 : 0;
      const top = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${NM(k)}:${Math.round(v / SEEDS)}`).join(' ');
      console.log(`H${n} add ${HW.stageOf(n).add} ${pct(w / SEEDS)} · 진 웨이브 ${JSON.stringify(dg.lost)} · 레벨 ${(dg.lvl / SEEDS).toFixed(1)}
  입구 피해: ${top(dg.door)}
  쓰러짐: ${top(dg.kd)}
  게이지 채운 진상: ${top(dg.kdBy)}`);
    }
  } else if (what === 'curses') {
    for (const n of list) {
      const base = meas(n, 'fit', [], SEEDS);
      console.log(`H${n} 저주 없음 ${pct(base.rate)} 입구 ${pct(base.hp)}`);
      for (const k of HW.CURSE_IDS) { const cs = HW.cleanCurses(HW.CURSES[k].need ? [HW.CURSES[k].need, k] : [k]); const r = meas(n, 'fit', cs, SEEDS); console.log(`   ${k.padEnd(9)} +${HW.curseScore(cs)}점 ${pct(r.rate)} 입구 ${pct(r.hp)}`); }
    }
  }
  process.exit(0);
})();
