'use strict';
// 랑방 대전 — 주간 도전 측정 (한 판이 얼마나 걸리나 · 입구가 언제 깎이나 · 언제 승부가 나나 · 선택이 몇 번이나)
//   node scripts/lb-weekly-sim.js [--acc=new,mid,strong] [--wi=0,1,2,3,4,5] [--seeds=3] [--v]
//   계정: new = 막 1-5 깬 사람 · mid = 3장쯤 · strong = 8장까지 다 깬 사람 (강화 · ★ · 아이템 넉넉)
//   봇 = 사람처럼 (스킬 1.5초 늦게 · 카드 40% 아무거나 · 판 안 선택은 반반)
const path = require('path');
const { pathToFileURL } = require('url');
const LIB = process.env.LB_LIB || path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
function seeded(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  const D = await load('data.js');
  const S = await load('sim.js');
  const L = await load('live.js');
  const WK = await load('weekly-sim.js');
  const PACT = opt('pact', 'rand');
  const ACC = {
    new: { max: 5, deck: ['gunman', 'bangjang', 'eunok', 'staff'], meta: 5, star: 1, items: { door: 1, charm: 1, battery: 1 }, ch: 1 },
    mid: { max: 27, deck: ['donghan', 'hanna', 'youngjun', 'gunnyeo', 'wonsik'], meta: 12, star: 1, items: { door: 8, charm: 6, battery: 6, drink: 1 }, ch: 3 },
    strong: { max: 80, deck: ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], meta: 22, star: 3, items: { door: 12, charm: 12, battery: 12, drink: 3 }, ch: 8 },
    // 리그 기준 계정 (그 리그에 막 들어온 보통 사람 · 리그 끝쯤 사람)
    t1: { max: 6, deck: ['gunman', 'bangjang', 'eunok', 'staff'], meta: 5, star: 1, items: { door: 1, charm: 1, battery: 1 }, ch: 1 },
    t1h: { max: 10, deck: ['gunman', 'dohoon', 'gunnyeo', 'staff'], meta: 7, star: 1, items: { door: 3, charm: 2, battery: 2 }, ch: 1 },
    t2: { max: 14, deck: ['gunman', 'hanna', 'dohoon', 'staff'], meta: 8, star: 1, items: { door: 4, charm: 3, battery: 3 }, ch: 2 },
    t2h: { max: 24, deck: ['donghan', 'hanna', 'youngjun', 'gunnyeo', 'wonsik'], meta: 11, star: 1, items: { door: 7, charm: 5, battery: 5, drink: 1 }, ch: 3 },
    t3: { max: 28, deck: ['donghan', 'hanna', 'youngjun', 'gunnyeo', 'wonsik'], meta: 12, star: 1, items: { door: 8, charm: 6, battery: 6, drink: 1 }, ch: 3 },
    t3h: { max: 44, deck: ['ara', 'donghan', 'youngjun', 'jungmin', 'staff'], meta: 15, star: 2, items: { door: 10, charm: 9, battery: 9, drink: 2 }, ch: 4 },
    t4: { max: 48, deck: ['ara', 'donghan', 'youngjun', 'hanna', 'gunnyeo', 'wonsik'], meta: 16, star: 2, items: { door: 11, charm: 10, battery: 10, drink: 2 }, ch: 5 },
    t4h: { max: 64, deck: ['ara', 'donghan', 'youngjun', 'hanna', 'dohoon', 'wonsik'], meta: 19, star: 2, items: { door: 12, charm: 11, battery: 11, drink: 3 }, ch: 6 },
    t5: { max: 70, deck: ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'], meta: 20, star: 3, items: { door: 12, charm: 12, battery: 12, drink: 3 }, ch: 7 },
  };
  const placeDeck = (ids) => { const order = D.openSlots(6), o = new Array(6).fill(null); ids.forEach((h, i) => { o[order[i]] = h; }); return o; };
  const gearAt = (c, ids) => { const st = { atk: 0.03 * c, spd: 0.02 * c, crit: c >= 2 ? 0.02 : 0, hp: 0.01 * c }; return Object.fromEntries(ids.map((id) => [id, st])); };
  function pickCard(g, cards, rng) {
    if (rng() < 0.4) return (rng() * cards.length) | 0;
    let best = 0, bv = -1;
    cards.forEach((c, i) => { const v = (c.kind === 'join' ? 9 : c.kind === 'evo' ? 9.5 : c.kind === 'heroLv' ? 6 : c.kind === 'skillEvo' ? 8 : 4) + rng() * 1.5; if (v > bv) { bv = v; best = i; } });
    return best;
  }
  function densest(g, r) { let best = null, bn = 0; for (const e of g.enemies) { if (e.dead || e.y < 0) continue; let k = 0; for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < r && Math.abs(o.y - e.y) < r) k += o.boss ? 3 : 1; if (k > bn) { bn = k; best = e; } } return best ? { x: best.x, y: best.y, n: bn } : null; }
  function aiSkills(g) {
    const slam = g.enemies.find((e) => !e.dead && e.cast && e.cast.spec.door && e.cast.t < e.cast.max - 0.3);
    if (slam) for (const h of g.heroes) if (S.skillReady(h) && h.def.skill.target && S.castSkill(g, h, slam.x, slam.y)) return 1;
    let n = 0;
    for (const h of g.heroes) {
      if (!S.skillReady(h)) continue;
      const sk = h.def.skill;
      let alive = 0; for (const e of g.enemies) if (!e.dead && e.y > 0) alive++;
      if (sk.target) { const c = densest(g, (sk.r ? sk.r[h.lv - 1] : 120) * 0.8); if (c && (c.n >= 4 || g.bossAlive) && S.castSkill(g, h, c.x, c.y)) n++; }
      else if (sk.id === 'firstaid') { if ((g.base.hp / g.base.max < 0.8 || g.heroes.some((o) => o.stunT > 0.6)) && S.castSkill(g, h)) n++; }
      else if ((alive >= 6 || g.bossAlive) && S.castSkill(g, h)) n++;
    }
    return n;
  }
  function play(accId, wi, seed) {
    const a = ACC[accId];
    const rng = seeded(seed);
    const def = L.weeklyDef(wi, L.weeklyTier ? L.weeklyTier(a.max) : undefined);
    const ids = a.deck;
    const g = S.createGame({ H: 760, rng, mode: 'stage', tempo: true, join: true, weekly: def, stage: def.stage, deck: placeDeck(ids), leader: ids[0], meta: Object.fromEntries(ids.map((h) => [h, a.meta])), stars: Object.fromEntries(ids.map((h) => [h, a.star])), gear: gearAt(a.ch, ids), items: a.items, slots: 6, unlocked: [] });
    const pr = seeded(seed * 7 + 3);
    const out = { door: [], waveT: [], picks: 0, augs: 0, skills: 0, ults: 0, choices: 0, events: [], leak: 0 };
    let steps = 0, lastW = 0;
    while (!g.over && g.phase !== 'victory' && g.t < 1200) {
      S.step(g, 1 / 60); steps++;
      for (const e of g.events) { if (e.type === 'baseHit') out.leak++; if (e.type === 'wkWave') out.events.push(`${e.wave}:${e.ev}`); }
      g.events.length = 0;
      if (g.wave !== lastW) { out.door.push(Math.round(g.base.hp / g.base.max * 100)); out.waveT.push(Math.round(g.t)); lastW = g.wave; }
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + (g.welcomePicks > 0 ? 0 : 2 * (0.75 + pr() * 0.5));
      if (g.pendingLevels > 0 && g.t >= g.pickAt) { const cards = S.rollCards(g); S.applyCard(g, cards[pickCard(g, cards, pr)]); g.pendingLevels--; out.picks++; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
      if (g.augOffer && g.t - (g.augAt || (g.augAt = g.t)) > 2) { S.applyAug(g, g.augOffer.opts[(pr() * g.augOffer.opts.length) | 0]); g.augAt = 0; out.augs++; }
      if (g.wk && g.wk.offer && g.t - (g.wkAt || (g.wkAt = g.t)) > 2) { const k = PACT === 'yes' ? 0 : PACT === 'no' ? 2 : pr() < 0.5 ? (pr() < 0.5 ? 0 : 1) : 2; g.wk.choose(g, k); g.wkAt = 0; out.choices++; }
      if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 10 || g.base.hp / g.base.max < 0.5)) { if (S.useUlt(g) !== false) out.ults++; }
      if (steps % 90 === 0) out.skills += aiSkills(g);
    }
    out.door.push(Math.round(g.base.hp / g.base.max * 100));
    const sum = { wave: g.victory ? g.totalWaves : Math.max(0, g.stats.wavesCleared | 0), kills: g.stats.kills, bossKills: g.stats.bossKills, victory: g.victory, hpPct: Math.round(g.base.hp / g.base.max * 100), durationSec: Math.round(g.t), skills: g.stats.skills | 0 };
    const wsum = g.wk ? WK.summary(g) : {};
    const score = L.weeklyScore(Object.assign({ waves: sum.wave }, sum, wsum));
    out.goals = wsum.goals; out.pacts = (wsum.pacts || []).filter(Boolean).join('+');
    return { acc: accId, wi, mod: def.mod, tier: def.tier, win: g.victory, wave: g.wave, total: g.totalWaves, t: Math.round(g.t), score, ...out, kills: g.stats.kills };
  }
  // --calib=t1,t2,... : 리그 기준 계정(tN) 완주율이 --target 이 되게 WEEKLY_TIERS[N].hp 이분 탐색 (결과만 출력 → live.js 에 손으로)
  if (opt('calib', '')) {
    const target = Number(opt('target', 0.5));
    const wis = opt('wi', '0,1,2,3,4,5,6,7,8').split(',').map(Number);
    for (const acc of opt('calib').split(',')) {
      const T = L.WEEKLY_TIERS[L.weeklyTier(ACC[acc].max) - 1];
      let lo = Math.log(0.4), hi = Math.log(6), best = T.hp, bd = 9;
      const rate = (hp) => { T.hp = hp; let w = 0; for (const wi of wis) if (play(acc, wi, wi * 97 + 13).win) w++; return w / wis.length; };
      for (let it = 0; it < Number(opt('iters', 5)); it++) {
        const mid = (lo + hi) / 2, hp = +Math.exp(mid).toFixed(3), r = rate(hp);
        if (Math.abs(r - target) < bd) { bd = Math.abs(r - target); best = hp; }
        console.log(`  ${acc} T${T.id} hp ${hp} → 완주 ${Math.round(r * 100)}%`);
        if (r > target) lo = mid; else hi = mid;
      }
      T.hp = best;
      console.log(`${acc} T${T.id} hp = ${best}`);
    }
    return;
  }
  const accs = opt('acc', 'new,mid,strong').split(',');
  const wis = opt('wi', '0,1,2,3,4,5').split(',').map(Number);
  const seeds = Number(opt('seeds', 2));
  const rows = [];
  for (const acc of accs) for (const wi of wis) for (let s = 1; s <= seeds; s++) {
    const r = play(acc, wi, wi * 97 + s * 13);
    rows.push(r);
    console.log(`${acc.padEnd(6)} wi${wi} ${String(r.mod).padEnd(9)} ${r.tier || ''} ${r.win ? '완주' : '실패'} W${r.wave}/${r.total} ${r.t}초 점수 ${r.score} 입구 ${r.door.join('>')} 카드 ${r.picks} 증강 ${r.augs} 선택 ${r.choices} 스킬 ${r.skills} 총공 ${r.ults} 샘 ${r.leak} 처치 ${r.kills} 목표 ${r.goals} 계약 ${r.pacts || '-'}${args.includes('--v') ? ' 사건 ' + r.events.join(',') : ''} 웨이브시각 ${r.waveT.join(',')}`);
  }
  for (const acc of accs) {
    const l = rows.filter((r) => r.acc === acc);
    const avg = (f) => (l.reduce((x, r) => x + f(r), 0) / l.length);
    const sc = l.map((r) => r.score).sort((a, b) => a - b);
    console.log(`== ${acc}: 완주 ${Math.round(avg((r) => (r.win ? 100 : 0)))}% · 평균 ${Math.round(avg((r) => r.t))}초 · 웨이브 ${avg((r) => r.wave).toFixed(1)} · 끝 입구 ${Math.round(avg((r) => r.door[r.door.length - 1]))}% · 선택(카드+증강+판선택) ${avg((r) => r.picks + r.augs + r.choices).toFixed(1)} · 점수 ${sc[0]}~${sc[sc.length - 1]} (중앙 ${sc[sc.length >> 1]})`);
  }
})();
