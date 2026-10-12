'use strict';
// 랑방 대전 1:1 대전 판 길이 측정 — 서버 AI 두 명을 같은 시드로 맞붙여 끝까지 돌린다 (DOM · 소켓 없음)
//   node scripts/lb-pvp-sim.js [--n=12] [--fp=strong|mid|weak|숫자] [--adj=0.15] [--lib=폴더]
//   서버(server/langbang-pvp.js)와 같은 규칙: 보내기 게이지 · 3초 간격 · 1초 늦게 도착 · 단계별 보내기 배수 · 폭주 자동 중간 보스
const path = require('path');
const { pathToFileURL } = require('url');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const LIB = opt('lib', '') || path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const { createLbPvp, SEND } = require('../server/langbang-pvp');

function seeded(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  const S = await load('sim.js'), D = await load('data.js'), PV = await load('pvp.js');
  const srv = createLbPvp({ accounts: {}, normLb: (x) => x, live: {} });
  await srv.simReady;
  srv.AI.S = S; srv.AI.D = D; srv.AI.PV = PV; // --lib 로 다른 버전을 잴 때도 그 버전 규칙으로
  const N = Number(opt('n', 12)), adj = Number(opt('adj', 0.15));
  const FP = { weak: 1200, mid: 3000, strong: 6500 };
  const fpArg = opt('fp', 'strong');
  const target = FP[fpArg] || Number(fpArg) || FP.strong;
  const ESC = PV.PVP_ESC || null;
  const out = [];
  for (let i = 0; i < N; i++) {
    const seed = 1000 + i * 7919;
    const rngM = seeded(seed);
    const mk = (k) => {
      const rng = seeded(seed * 31 + k);
      const dk = srv.aiDeck({ deck: [], power: target, fp: target }, rng);
      return { rng, adj: adj * (k ? 1 : 1), deck: dk.deck, meta: dk.meta, power: dk.power, kills: 0, spent: 0, lastSend: -9, autoK: null, plan: [] };
    };
    const A = mk(0), B = mk(1);
    const hp = PV.pvpHpScale(A.power, B.power);
    const mseed = (rngM() * 2 ** 31) >>> 0;
    for (const p of [A, B]) {
      p.g = S.createGame({ H: 760, rng: p.rng, mode: 'stage', stage: 12 + (mseed % 17), pvp: { seed: mseed, hp }, deck: [...p.deck, null], leader: p.deck[0], meta: p.meta, tempo: true, join: true, unlocked: D.LOCKED_HEROES.slice() });
      p.g.mods.dmg *= 1 + p.adj;
    }
    const q = []; // 도착 대기: { at, to, kind, n }
    const dt = 1 / 30;
    let t = 0, end = null, loser = null;
    const NOSEND = args.includes("--nosend");
    const deliver = (from, kind, fixed) => {
      if (NOSEND) return;
      const to = from === A ? B : A;
      const n = fixed || (ESC && PV.pvpSendMul ? PV.pvpSendMul(t) : 1);
      q.push({ at: t + 1, to, kind, n });
    };
    while (t < 302 && !end) {
      for (let k = 0; k < 30; k++) {
        t += dt;
        for (const p of [A, B]) { S.step(p.g, dt); p.g.events.length = 0; }
        for (let j = q.length - 1; j >= 0; j--) if (q[j].at <= t) { const d = q.splice(j, 1)[0]; S.pvpIncoming(d.to.g, d.kind, d.n); d.to.g.events.length = 0; }
        const dead = [A, B].filter((p) => p.g.over || p.g.base.hp <= 0);
        if (dead.length) { end = t; loser = dead.length === 2 ? 'both' : dead[0] === A ? 'A' : 'B'; break; }
      }
      if (end) break;
      for (const p of [A, B]) {
        srv.aiThink(p.g, p);
        p.kills = p.g.stats.kills;
        const left = p.g.pvp.timeUp ? 0 : p.kills - p.spent, gapOk = t - p.lastSend >= SEND.big.gap / 1000;
        if (gapOk && left >= SEND.big.cost && p.rng() < 0.3) { p.spent += SEND.big.cost; p.lastSend = t; deliver(p, 'big'); }
        else if (gapOk && left >= SEND.small.cost && p.rng() < 0.45) { p.spent += SEND.small.cost; p.lastSend = t; deliver(p, 'small'); }
        if (ESC && PV.pvpAutoBig) { const r = PV.pvpAutoBig(t, p.kills, p.autoK); p.autoK = r.from; for (let z = 0; z < r.n; z++) deliver(p, "big", 1); }
      }
      if (A.g.pvp.timeUp && B.g.pvp.timeUp) { end = 300; loser = 'time'; }
    }
    const pct = (p) => Math.round((Math.max(0, p.g.base.hp) / p.g.base.max) * 100);
    const maxE = Math.max(A.g.enemies.filter((e) => !e.dead).length, B.g.enemies.filter((e) => !e.dead).length);
    out.push({ end: Math.round(end || 300), loser, a: pct(A), b: pct(B), ka: A.kills, kb: B.kills, wave: A.g.wave, maxE });
    process.stdout.write(`#${i + 1} ${Math.round(end || 300)}s ${loser} 입구 ${pct(A)}%/${pct(B)}% 처치 ${A.kills}/${B.kills} W${A.g.wave} 남은진상 ${maxE}\n`);
  }
  const ends = out.map((o) => o.end).sort((a, b) => a - b);
  const med = ends[Math.floor(ends.length / 2)], avg = Math.round(ends.reduce((a, b) => a + b, 0) / ends.length);
  const timeouts = out.filter((o) => o.loser === 'time').length;
  const long = ends.filter((x) => x > 60), lmed = long[Math.floor(long.length / 2)] || 0, late = ends.filter((x) => x >= 240).length;
  console.log(`\n전투력 ${target} · 조정 ${adj} · ${N}판 → 평균 ${avg}초 · 중앙 ${med}초 · 300초 판정까지 간 판 ${timeouts}/${N} · 1분 넘긴 판 중앙 ${lmed}초 · 240초 넘긴 판 ${late}/${N} · 남은 진상 최대 ${Math.max(...out.map((o) => o.maxE))}`);
  srv.close();
  process.exit(0);
})();
