'use strict';
// 건물주 레이드 한 판 피해 재기 (밸런스용) — 서버 체력 공식 · 피해 상한을 정할 때 쓴다
//   node scripts/lb-raid2-sim.js [--seeds=4] [--phase=1|2|3]
//   계정 수준 3가지(맨 위 · 중간 · 가볍게) × 덱 × 페이즈 → 한 판 피해 · 입구가 버틴 비율 · 내려찍기 끊은 수
const path = require('path');
const { pathToFileURL } = require('url');
const LIB = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
function seeded(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

(async () => {
  const D = await load('data.js');
  const S = await load('sim.js');
  const RS = await load('raid2-sim.js');
  const R = await load('raid2.js');
  const ALL = Object.keys(D.HEROES);
  const PROFILES = {
    top: { meta: 20, star: 5, gear: { atk: 0.45, crit: 0.12, skill: 0.25, boss: 0.25, cd: 0.15, critDmg: 0.2 }, maxStage: 70 },
    mid: { meta: 10, star: 2, gear: { atk: 0.15, crit: 0.04, skill: 0.1 }, maxStage: 35 },
    casual: { meta: 3, star: 1, gear: { atk: 0.05 }, maxStage: 12 },
  };
  const DECKS = {
    strong: ['hochan', 'ara', 'gunman', 'sunggu', 'byunghwa', 'eunok'],
    p1weak: ['gunnyeo', 'jungmin', 'dohoon', 'jeongseob', 'hochan', 'sunggu'],
    p2weak: ['gunman', 'myunghoon', 'youngjun', 'junseo', 'soyoung', 'jieun'],
    basic: ['bangjang', 'staff', 'gunman', 'gunnyeo', 'dohoon', 'ingyu'],
  };
  const phases = { 1: ['mega', 'bill', 'bottle', 'golf'], 2: ['contract', 'keys', 'bag', 'phone'], 3: ['body'] };
  const N = Number(opt('seeds', 3));
  const onlyPh = opt('phase', '');
  function play(prof, deck, ex, seed) {
    const P = PROFILES[prof];
    const meta = Object.fromEntries(ALL.map((h) => [h, P.meta]));
    const stars = Object.fromEntries(ALL.map((h) => [h, P.star]));
    const gear = Object.fromEntries(deck.map((h) => [h, { ...P.gear }]));
    const rng = seeded(seed);
    const g = S.createGame({ H: 760, rng, mode: 'stage', deck, join: true, tempo: true, leader: deck[0], meta, stars, gear, weekly: RS.waveDef(1), raid: { sec: R.R2.sec }, items: { door: 8, charm: 6, battery: 6 }, slots: 6 });
    RS.attach(g, { tier: 1, exposed: ex });
    const pr = seeded(seed * 7 + 3);
    let steps = 0;
    while (!g.over && g.phase !== 'victory' && g.t < 200) {
      S.step(g, 1 / 60); steps++;
      g.events.length = 0;
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + 1.5 + pr();
      if (g.pendingLevels > 0 && g.t >= g.pickAt) { const c = S.rollCards(g); const j = c.findIndex((x) => x.kind === 'join'); S.applyCard(g, c[j >= 0 ? j : (pr() * c.length) | 0]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
      if (g.ult >= D.RULES.ultMax) S.useUlt(g);
      if (steps % 30 === 0) {
        // 스킬: 내려찍기 예고가 뜨면 그 손에 · 아니면 준비되는 대로 (가장 큰 부위 쪽)
        const sl = g.r2.slam && g.r2.slam.st === 'wind' ? g.r2.parts[g.r2.slam.p] : null;
        for (const h of g.heroes) {
          if (!S.skillReady(h)) continue;
          const tgt = sl || Object.values(g.r2.parts)[(pr() * Object.keys(g.r2.parts).length) | 0];
          if (tgt) S.castSkill(g, h, tgt.x, tgt.y);
        }
      }
    }
    const rep = RS.report(g);
    return { dmg: rep.total, door: g.base.hp / g.base.max, over: g.over, t: g.t, cuts: rep.cuts, slams: rep.slams, gs: rep.gate.slam / g.base.max, gb: rep.gate.bill / g.base.max };
  }
  const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  console.log(pad('수준', 8) + pad('덱', 8) + pad('페이즈', 8) + pad('한 판 피해', 14) + pad('입구', 8) + pad('끊기/찍기', 10) + '상한(r2Cap)');
  const best = {};
  for (const prof of Object.keys(PROFILES)) {
    const P = PROFILES[prof];
    const lb = { maxStage: P.maxStage, heroes: Object.fromEntries(ALL.map((h) => [h, P.meta])), hstars: Object.fromEntries(ALL.map((h) => [h, P.star])) };
    for (const [dk, deck] of Object.entries(DECKS)) {
      for (const ph of ['1', '2', '3']) {
        if (onlyPh && onlyPh !== ph) continue;
        let d = 0, door = 0, cuts = 0, slams = 0, overN = 0, gs = 0, gb = 0, tt = 0;
        for (let s = 1; s <= N; s++) { const r = play(prof, deck, phases[ph], s * 97 + Number(ph)); d += r.dmg; door += r.door; cuts += r.cuts; slams += r.slams; if (r.over) overN++; gs += r.gs; gb += r.gb; tt += r.t; }
        d /= N; door /= N;
        best[prof] = Math.max(best[prof] || 0, d);
        console.log(pad(prof, 8) + pad(dk, 8) + pad(ph, 8) + pad(fmt(d), 14) + pad((door * 100).toFixed(0) + '%' + (overN ? `(${overN}뚫림)` : ''), 8) + pad(`${(cuts / N).toFixed(1)}/${(slams / N).toFixed(1)}`, 10) + pad(fmt(R.r2Cap(lb, R.R2.sec)), 14) + `찍기 ${(gs / N * 100).toFixed(0)}% 고지서 ${(gb / N * 100).toFixed(0)}% · ${(tt / N).toFixed(0)}초`);
      }
    }
  }
  console.log('\n최고 한 판 피해:', Object.entries(best).map(([k, v]) => `${k} ${fmt(v)}`).join(' · '));
  console.log('1단계 체력 (활동 인원 floor):', fmt(R.hpMaxFor(1, 0)), '→ 맨 위 계정 한 판 비율', ((best.top / R.hpMaxFor(1, 0)) * 100).toFixed(2) + '%');
})();
