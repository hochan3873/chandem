'use strict';
// 랑방 대전 1:1 맞대결 v2 — AI 두 명을 서버와 같은 판(pvp2-sim.js)으로 끝까지 돌려 판 길이 · 승패 · 전송량을 잰다 (DOM · 소켓 없음)
//   node scripts/lb-pvp-sim.js [--n=8] [--meta=10]
const path = require('path');
const { pathToFileURL } = require('url');
const LIB = path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
(async () => {
  const D2 = await load('pvp2-sim.js'), P2 = await load('pvp2.js'), PV = await load('pvp.js');
  const N = Number(arg('n', 8)), meta = Number(arg('meta', 10));
  const A = ['gunman', 'staff', 'sunggu', 'gunnyeo', 'jieun', 'ingyu'], B = ['bangjang', 'subin', 'hanna', 'donghan', 'soyoung', 'wonsik'];
  const lo = (deck) => ({ deck, meta: Object.fromEntries(deck.map((id) => [id, meta])), stars: {}, gear: {} });
  const hp = PV.pvpHpScale(PV.pvpFirepower(lo(A)), PV.pvpFirepower(lo(B)));
  let wins = [0, 0, 0];
  for (let s = 1; s <= N; s++) {
    const d = D2.createDuel({ seed: s * 7919, hp, sides: [lo(A), lo(B)] });
    D2.setBot(d, 0); D2.setBot(d, 1);
    const roster = [...new Set([...d.sides[0].deck, ...d.sides[1].deck])], tt = P2.newTypeTable();
    let n = 0, bytes = 0, evq = [];
    const t0 = Date.now();
    while (!d.over) {
      D2.tick(d); n++; for (const e of D2.drainEv(d)) evq.push(e);
      if (n % P2.PV2.snapEvery) continue;
      const pk = P2.packSnap(D2.snap(d, 0, (n / P2.PV2.snapEvery) % P2.PV2.opSkip !== P2.PV2.opSkip - 1), roster, tt);
      bytes += pk.b.length + 60 + (evq.length ? JSON.stringify(evq).length : 0) + (pk.ty.length ? JSON.stringify(pk.ty).length : 0);
      evq = [];
    }
    wins[d.win < 0 ? 2 : d.win]++;
    console.log(`판 ${s}: ${d.reason} ${Math.round(d.t)}초 · 승 ${d.win} · 입구 ${d.sides.map((x) => Math.round(x.g.base.hp)).join(' / ')} · 처치 ${d.sides.map((x) => x.g.stats.kills).join(' / ')} · 전송 ${Math.round(bytes / d.t)}B/s (${Math.round(bytes / 1024)}KB) · 계산 ${Date.now() - t0}ms`);
  }
  console.log(`진상 체력 배율 ${hp} · 승: A ${wins[0]} · B ${wins[1]} · 무 ${wins[2]}`);
})();
