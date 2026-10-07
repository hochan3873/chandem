'use strict';
// 건물주 레이드 한 판 피해 재기 (밸런스용) — 서버 체력 공식 · 피해 상한을 정할 때 쓴다
//   node scripts/lb-raid2-sim.js [--seeds=4] [--phase=1|2|3] [--diff=normal|hard|hell] [--day=mon..sun|all] [--quiet]
//   --day: 요일 건물주 판 · 덱 = counter(그날 추천 멤버 3명 + 센 멤버) / nocounter(추천 멤버 없이) / basic
//   계정 수준 3가지(맨 위 · 중간 · 가볍게) × 덱 × 시작 페이즈 → 한 판 피해 · 버틴 시간(입구가 부서질 때까지) · 끊은 수 / 내려찍기 수
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
  const DAY = opt('day', '');
  if (DAY) {
    // 요일 판: 카운터 덱 vs 카운터 없는 덱 (요일마다 다름)
    // no: 센 딜러만 (그날 추천 멤버 빼고) · ct: 추천 멤버 3명 + no 의 앞 3명 → 같은 딜러 3명에 지원 3명 vs 딜러 3명
    const POOL = ['hochan', 'ara', 'gunman', 'eunok', 'youngjun', 'junseo', 'donghan', 'sanghwa', 'hanna', 'soyoung'];
    const days = DAY === 'all' ? R.DAY_IDS : [DAY];
    for (const k of Object.keys(DECKS)) delete DECKS[k];
    for (const d of days) {
      const rec = R.DAYS[d].rec.filter((h) => D.HEROES[h]);
      const no = POOL.filter((h) => !rec.includes(h)).slice(0, 6);
      DECKS[d + ':ct'] = [...no.slice(0, 3), ...rec.slice(0, 3)];
      DECKS[d + ':no'] = no;
    }
    if (DAY === 'all') { DECKS['old:no'] = POOL.slice(0, 6); DECKS['old:ct'] = ['hochan', 'ara', 'gunman', 'gunnyeo', 'jungmin', 'dohoon']; } // 예전 대마왕 판 (기준)
  }
  const phases = { 1: 1, 2: 0.5, 3: 0.2 }; // 서버 체력 남은 비율 → 시작 페이즈
  const N = Number(opt('seeds', 3));
  const onlyPh = opt('phase', '');
  const DIFF = opt('diff', 'normal');
  const quiet = args.includes('--quiet');
  const runs = []; // 판마다 { prof, t, broke(입구가 부서짐) · finale(철거) · dmg }
  function play(prof, deck, ex, seed, dk = '') {
    const P = PROFILES[prof];
    const meta = Object.fromEntries(ALL.map((h) => [h, P.meta]));
    const stars = Object.fromEntries(ALL.map((h) => [h, P.star]));
    const gear = Object.fromEntries(deck.map((h) => [h, { ...P.gear }]));
    const rng = seeded(seed);
    const g = S.createGame({ H: 760, rng, mode: 'stage', deck, join: true, tempo: true, leader: deck[0], meta, stars, gear, weekly: RS.waveDef(1), raid: { sec: R.R2.sec }, items: { door: 8, charm: 6, battery: 6 }, slots: 6 });
    RS.attach(g, { tier: 1, diff: DIFF, day: dk.includes(':') ? dk.split(':')[0] : null, hp: { body: ex }, max: { body: 1 } });
    const pr = seeded(seed * 7 + 3);
    let steps = 0;
    while (!g.over && g.phase !== 'victory' && g.t < 240) {
      S.step(g, 1 / 60); steps++;
      g.events.length = 0;
      if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + 1.5 + pr();
      if (g.pendingLevels > 0 && g.t >= g.pickAt) { const c = S.rollCards(g); const j = c.findIndex((x) => x.kind === 'join'); S.applyCard(g, c[j >= 0 ? j : (pr() * c.length) | 0]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
      if (g.ult >= D.RULES.ultMax) S.useUlt(g);
      if (steps % 30 === 0) {
        // 스킬: 내려찍기 예고가 뜨면 그 손에 · 아니면 준비되는 대로 (가장 큰 부위 쪽)
        const a = g.r2.act, sl = a && (a.st === 'wind' || a.st === 'hold') ? g.r2.parts.body : null;
        for (const h of g.heroes) {
          if (!S.skillReady(h)) continue;
          const tgt = sl || g.r2.parts.body;
          if (tgt) S.castSkill(g, h, tgt.x, tgt.y);
        }
      }
    }
    const rep = RS.report(g);
    return { finale: !!g.r2.finale, dmg: rep.total, door: g.base.hp / g.base.max, over: g.over, t: g.t, cuts: rep.cuts, slams: rep.slams, gs: rep.gate.slam / g.base.max, gb: (rep.gate.bill + rep.gate.other) / g.base.max, lv: g.level, heroes: g.heroes.filter((h) => !h.gone).length };
  }
  const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(0, n - w)); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  console.log(pad('수준', 8) + pad('덱', 10) + pad('페이즈', 8) + pad('한 판 피해', 14) + pad('입구', 8) + pad('끊기/찍기', 10) + '상한(r2Cap)');
  const best = {};
  for (const prof of Object.keys(PROFILES)) {
    const P = PROFILES[prof];
    const lb = { maxStage: P.maxStage, heroes: Object.fromEntries(ALL.map((h) => [h, P.meta])), hstars: Object.fromEntries(ALL.map((h) => [h, P.star])) };
    for (const [dk, deck] of Object.entries(DECKS)) {
      for (const ph of ['1', '2', '3']) {
        if (onlyPh && onlyPh !== ph) continue;
        let d = 0, door = 0, cuts = 0, slams = 0, overN = 0, gs = 0, gb = 0, tt = 0, lv = 0, hn = 0;
        for (let s = 1; s <= N; s++) { const r = play(prof, deck, phases[ph], s * 97 + Number(ph), dk); runs.push({ prof, dk, ph, t: r.t, finale: r.finale, dmg: r.dmg }); d += r.dmg; door += r.door; cuts += r.cuts; slams += r.slams; if (r.over) overN++; gs += r.gs; gb += r.gb; tt += r.t; lv += r.lv; hn += r.heroes; }
        d /= N; door /= N;
        best[prof] = Math.max(best[prof] || 0, d);
        if (!quiet) console.log(pad(prof, 8) + pad(dk, 10) + pad(ph, 8) + pad(fmt(d), 14) + pad((door * 100).toFixed(0) + '%' + (overN ? `(${overN}뚫림)` : ''), 8) + pad(`${(cuts / N).toFixed(1)}/${(slams / N).toFixed(1)}`, 10) + pad(fmt(R.r2Cap(lb, R.R2.sec)), 14) + `찍기 ${(gs / N * 100).toFixed(0)}% 기타 ${(gb / N * 100).toFixed(0)}% · ${(tt / N).toFixed(0)}초 · Lv${(lv / N).toFixed(0)} 멤버${(hn / N).toFixed(1)}`);
      }
    }
  }
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? (b.length % 2 ? b[(b.length - 1) / 2] : (b[b.length / 2 - 1] + b[b.length / 2]) / 2) : 0; };
  const avg = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
  const sum = (list, label) => console.log(pad(label, 10) + `판 ${list.length} · 시간 중앙 ${med(list.map((x) => x.t)).toFixed(0)}초 (평균 ${avg(list.map((x) => x.t)).toFixed(0)}) · 입구 붕괴로 끝 ${Math.round(100 * list.filter((x) => !x.finale).length / Math.max(1, list.length))}% · 피해 평균 ${fmt(avg(list.map((x) => x.dmg)))} (중앙 ${fmt(med(list.map((x) => x.dmg)))})`);
  console.log(`\n── 요약 (난이도 ${DIFF}) ──`);
  sum(runs, '전체');
  for (const prof of Object.keys(PROFILES)) sum(runs.filter((x) => x.prof === prof), prof);
  for (const dk of Object.keys(DECKS)) sum(runs.filter((x) => x.dk === dk), dk);
  for (const ph of ['1', '2', '3']) sum(runs.filter((x) => x.ph === ph), ph + '페이즈');
  console.log('\n최고 한 판 피해:', Object.entries(best).map(([k, v]) => `${k} ${fmt(v)}`).join(' · '));
  console.log('1단계 체력 (활동 인원 floor):', fmt(R.hpMaxFor(1, 0)), '→ 맨 위 계정 한 판 비율', ((best.top / R.hpMaxFor(1, 0)) * 100).toFixed(2) + '%');
})();
