'use strict';
// 랑방 멤버 획득 속도 모형 — 보통(무과금) 사람이 하루 하루 모집권을 얼마나 받고, 며칠에 멤버 N명을 모으나
//   node scripts/lb-econ.js acq [--runs=200] [--days=150] [--pace=1] [--coin=2] [--attend=0.85] [--star3=0.5] [--json]
//   pace   : 진행 속도 (1 = 꾸준한 보통 · 0.5 = 가끔 · 2 = 열심) — 하루에 새로 깨는 스테이지 수 배율
//   coin   : 하루 코인 모집 횟수 (코인 모집 하루 30번 상한 · 500코인 · 나머지 코인은 강화로 간다고 봄)
//   attend : 하루 접속해서 일일 미션을 다 하는 날 비율
//   star3  : 장 끝 ★30 상자(별 전부 ★3)와 5-6 ★★★ 박나뇽을 채우는 비율
// 수입은 실제 규칙 표(live.js · data.js · tower.js)에서 읽는다: 출석 · 일일 전부 · 주간 미션 · 시즌 · 무한 주간 · 장 별 상자 · 업적 · 도감 · 탑 · 합류 선택권
const path = require('path');
const { pathToFileURL } = require('url');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
module.exports = async function acq() {
  const LIB = path.join(__dirname, '..', 'public', 'langbang');
  const D = await import(pathToFileURL(path.join(LIB, 'data.js')).href);
  const L = await import(pathToFileURL(path.join(LIB, 'live.js')).href);
  const T = await import(pathToFileURL(path.join(LIB, 'tower.js')).href);
  const RUNS = opt('runs', 200), DAYS = opt('days', 150), PACE = opt('pace', 1), COIN = opt('coin', 2), ATT = opt('attend', 0.85), STAR3 = opt('star3', 0.5);
  const quiet = args.includes('--json');
  const HIDS = Object.keys(D.HEROES);
  const ENEMY_N = Object.keys(D.ENEMIES).filter((id) => !D.ENEMIES[id].dot && !D.ENEMIES[id].towerOnly && !D.ENEMIES[id].eventOnly).length;
  const ITEM_N = D.GEAR_IDS.length + D.MYTH_IDS.length;
  // 하루에 새로 깨는 스테이지 수 (장별) — 보통 사람: 1장은 하루에, 막히는 뒷장은 하루 1~2판 새로
  const SPD = [6, 4, 3, 2, 1.5, 1.2, 0.8, 0.6];
  const ENDLESS_WK = [0, 2, 2, 5, 5, 9, 9, 9, 14]; // 장별 주간 무한 단계 보상 모집권 (W10=2 · W20=5 · W30=9 · W40=14 누적) × 참여율
  const rand = Math.random;
  const ownedN = (lb) => HIDS.filter((h) => L.heroUnlocked(lb, h)).length;
  function oneRun() {
    const lb = { owned: {}, shards: {}, hstars: {}, stages: {}, heroes: {}, pity: { hero: 0, legend: 0, sig: 0, gear: 0 }, pulls: 0, tickets: 0, coins: 0, wild: 0, stones: 0, gear: [], cnt: {}, maxStage: 0, seen: [], gearDex: [], perfects: {}, totalStars: 0, bestWave: 0, chests: {}, ach: [] };
    const log = { day: {}, t4: [], legend: [], ticketsIn: 0, byDay: [], src: {}, pulls: 0, heroRes: 0, dupRes: 0 };
    const add = (src, n) => { if (!n) return; lb.tickets += n; log.ticketsIn += n; log.src[src] = (log.src[src] || 0) + n; };
    let prog = 0, cleared = 0, streak = 0, lastAtt = -9, dexTk = 0, pvp = false, dragonDay = -1;
    const claimed = new Set();
    const star = () => (rand() < 0.6 ? 3 : 2); // 평균 ★2.6
    for (let day = 0; day < DAYS; day++) {
      const att = rand() < ATT || day === 0;
      const ch = Math.min(8, Math.ceil(Math.max(1, cleared + 1) / 10));
      if (att || rand() < 0.4) prog += SPD[ch - 1] * PACE * (att ? 1 : 0.5);
      while (cleared < 80 && cleared + 1 <= Math.floor(prog)) {
        cleared++; lb.stages[cleared] = star(); lb.maxStage = cleared; lb.totalStars += lb.stages[cleared];
        if (rand() < 0.35) lb.perfects[cleared] = 1;
        if (cleared === 46) { lb.stages[46] = rand() < STAR3 ? 3 : 2; if (lb.stages[46] < 3) dragonDay = day + 8 + ((rand() * 20) | 0); }
        if (cleared % 10 === 0) { // 장 끝: 별 상자
          const c = cleared / 10;
          const full = rand() < STAR3 ** (c > 4 ? 1.3 : 0.6);
          for (const need of L.CHEST_STARS) { if (need === 30 && !full) continue; const rw = L.chestReward(c, need); add('장 별 상자', rw && rw.tickets); }
        }
        for (const j of L.joinPicksOpen(lb)) { // 합류 선택권: 아직 없는 멤버 중 카드를 제일 모아 둔 사람
          const pool = L.joinPickPool(j.tier).filter((h) => !L.heroUnlocked(lb, h));
          if (!pool.length) { L.joinPick(lb, j.stage, L.joinPickPool(j.tier)[0]); continue; }
          pool.sort((a, b) => (lb.shards[b] | 0) - (lb.shards[a] | 0) || rand() - 0.5);
          L.joinPick(lb, j.stage, pool[0]);
        }
      }
      if (dragonDay >= 0 && day >= dragonDay) { lb.stages[46] = 3; dragonDay = -1; }
      // 도감 (진상 · 멤버 · 장비 모은 수 10개마다 모집권 1)
      lb.seen.length = Math.floor(ENEMY_N * cleared / 80);
      const dexN = ownedN(lb) + lb.seen.length + Math.min(ITEM_N, Math.floor(4 + cleared * 0.7));
      const dexT = Math.floor(dexN / 10); if (dexT > dexTk) { add('도감 10종마다', dexT - dexTk); dexTk = dexT; }
      // 일일 · 출석
      if (att) {
        if (rand() < 0.92) add('일일 미션 전부', L.DAILY_ALL.tickets);
        streak = lastAtt === day - 1 ? streak + 1 : 1; lastAtt = day;
        add('출석', L.CHECKIN[(streak - 1) % 7].tickets);
      } else if (lastAtt < day - 1) streak = 0;
      // 주간 (7일마다)
      if (day % 7 === 6) {
        for (const m of L.WEEKLY_MISSIONS) if (cleared >= 5 && rand() < 0.75 * (0.5 + 0.5 * ATT)) add('주간 미션', Math.round(m.tickets * opt('weekly', 1) * 10) / 10);
        if (cleared >= 5) add('주간 도전 참가', rand() < 0.7 ? 1 : 0);
        if (cleared >= 10) add('무한 주간 단계', Math.round(ENDLESS_WK[ch] * (0.55 + 0.35 * ATT) * opt('endless', 1)));
        if (cleared >= 30) add('레이드', rand() < 0.5 ? 1 : 0);
      }
      // 탑: 15층마다 모집권 3 · 보스층 1 — 4장부터 하루 0.4층
      if (cleared >= 40 && att) { lb._tf = (lb._tf || 0) + 0.4 * PACE; while (lb._tf >= (lb._tfd | 0) + 1 && (lb._tfd | 0) < 60) { lb._tfd = (lb._tfd | 0) + 1; add('진상의 탑', T.floorReward(lb._tfd).tickets); } }
      // 시즌 (28일 · 100점당 한 칸): 하루 점수 = 일일 4개 + 전부 + 주간
      if (day % 28 === 0) { lb._sp = 0; lb._st = 0; }
      if (att) lb._sp += 4 * 24 + 30 + (day % 7 === 6 ? 340 * 0.75 : 0);
      while (Math.floor(lb._sp / 100) > lb._st && lb._st < 30) { lb._st++; const rw = L.seasonReward(1, lb._st); add('시즌 트랙', rw.tickets); }
      // 1:1 대전 등급 (실버 2 · 골드 3)
      if (!pvp && day >= 14 && cleared >= 10 && rand() < 0.1) { pvp = true; add('대전 등급', 5); }
      // 업적
      lb.cnt.legends = cleared >= 25 ? 1 : 0; lb.gearDex = new Array(Math.min(ITEM_N, Math.floor(4 + cleared * 0.7)));
      lb.bestWave = ch >= 8 ? 40 : ch >= 5 ? 30 : ch >= 3 ? 20 : cleared >= 10 ? 10 : 0;
      for (const m of L.ACHIEVEMENTS) {
        if (claimed.has(m.id) || !m.tickets) continue;
        if (m.id === 'gdexAll' || m.id === 'star5') continue;
        let ok = false; try { ok = (m.v(lb) | 0) >= m.n; } catch (e) { ok = false; }
        if (ok) { claimed.add(m.id); add('업적', m.tickets); }
      }
      if (att) add('코인 모집', COIN);
      // 모집: 10장 모이면 10연 (처음 10연은 T4 확정)
      while (lb.tickets >= 10) {
        const res = L.gachaPull(lb, 10, 'ticket', 'u', Date.UTC(2026, 9, 12) + day * 864e5, (Math.random() * 2 ** 31) | 0);
        for (const r of res.results) {
          log.pulls++;
          if (r.k === 'epicHero' || r.k === 'legendHero' || r.k === 't3Card') { log.heroRes++; if (r.dup) log.dupRes++; }
          if (r.k === 'epicHero') log.t4.push({ d: day, new: !r.dup });
          if (r.k === 'legendHero') log.legend.push({ d: day, new: !r.dup });
        }
      }
      const n = ownedN(lb);
      for (let k = 5; k <= 27; k++) if (n >= k && log.day[k] === undefined) log.day[k] = day;
      log.cum = log.cum || []; log.cum.push(log.ticketsIn);
      log.byDay.push({ n, pulls: lb.pulls, hr: log.heroRes, dr: log.dupRes, st: cleared });
    }
    return log;
  }
  const med = (a) => { const b = a.filter((x) => x !== undefined && x !== null).sort((x, y) => x - y); return b.length ? b[b.length >> 1] : null; };
  const pct = (a, p) => { const b = a.filter((x) => x !== undefined).sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(b.length * p))] : null; };
  const rs = []; for (let i = 0; i < RUNS; i++) rs.push(oneRun());
  const srcSum = {}; for (const r of rs) for (const [k, v] of Object.entries(r.src)) srcSum[k] = (srcSum[k] || 0) + v / RUNS;
  const total = Object.values(srcSum).reduce((a, b) => a + b, 0);
  const dup = rs.reduce((a, r) => a + r.dupRes, 0) / Math.max(1, rs.reduce((a, r) => a + r.heroRes, 0));
  const t4n = (i) => med(rs.map((r) => (r.t4.filter((x) => x.new)[i] || {}).d));
  const lgn = (i) => med(rs.map((r) => (r.legend.filter((x) => x.new)[i] || {}).d));
  const out = { pace: PACE, coin: COIN, med: {}, t4: [t4n(0), t4n(1), t4n(2)], legend: [lgn(0), lgn(1)], ticketsPerDay: total / DAYS, dup, src: srcSum };
  for (let k = 5; k <= 27; k++) out.med[k] = med(rs.map((r) => r.day[k]));
  if (quiet) { console.log(JSON.stringify(out)); return out; }
  console.log(`■ 멤버 획득 속도 모형 — 진행 ×${PACE} · 코인 모집 하루 ${COIN}번 · 출석 ${Math.round(ATT * 100)}% · ★30 상자 ${Math.round(STAR3 * 100)}% · ${RUNS}번 모의 · ${DAYS}일`);
  console.log(`모집권 수입 (하루 평균 ${(total / DAYS).toFixed(1)}장 · 코인 모집 포함, ${DAYS}일 총 ${total.toFixed(0)}장)`);
  for (const [k, v] of Object.entries(srcSum).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(12)} ${v.toFixed(0).padStart(5)}장  (${(100 * v / total).toFixed(0)}%)`);
  console.log('멤버 N명 달성 일수 (중앙값 [하위25% ~ 상위75%])');
  for (const k of [5, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 26, 27]) console.log(`  ${String(k).padStart(2)}명  ${String(out.med[k] ?? '-').padStart(4)}일  [${pct(rs.map((r) => r.day[k]), 0.25) ?? '-'} ~ ${pct(rs.map((r) => r.day[k]), 0.75) ?? '-'}]  도달 ${rs.filter((r) => r.day[k] !== undefined).length}/${RUNS}`);
  console.log(`T4 첫째 ${out.t4[0]}일 · 둘째 ${out.t4[1]}일 · 셋째 ${out.t4[2]}일 / LEGEND 첫째 ${out.legend[0]}일 · 둘째 ${out.legend[1]}일`);
  console.log(`모집 횟수 30일 ${med(rs.map((r) => (r.byDay[29] || {}).pulls))} · 60일 ${med(rs.map((r) => (r.byDay[59] || {}).pulls))} · 90일 ${med(rs.map((r) => (r.byDay[89] || {}).pulls))}`);
  console.log(`멤버 겹침(중복) 비율 ${(100 * dup).toFixed(0)}% (T3 카드 · T4 · LEGEND 결과 중 이미 가진 멤버)`);
  const dupAt = (d) => { const h = rs.reduce((a, r) => a + r.byDay[d].hr, 0), x = rs.reduce((a, r) => a + r.byDay[d].dr, 0); return h ? Math.round(100 * x / h) : 0; };
  console.log(`중복 비율 30일 ${dupAt(29)}% · 60일 ${dupAt(59)}% · 90일 ${dupAt(89)}% · 스테이지 클리어 30일 ${med(rs.map((r) => r.byDay[29].st))} · 60일 ${med(rs.map((r) => r.byDay[59].st))} · 90일 ${med(rs.map((r) => r.byDay[89].st))}`);
  const tkw = (a, b) => (rs.reduce((x, r) => x + (r.cum[b] - (a ? r.cum[a - 1] : 0)), 0) / rs.length / (b - a + 1)).toFixed(1);
  console.log(`하루 모집권 (코인 모집 포함): 1~7일 ${tkw(0, 6)} · 8~30일 ${tkw(7, 29)} · 31~60일 ${tkw(30, 59)} · 61~150일 ${tkw(60, 149)}`);
  const wk = (a, b) => med(rs.map((r) => (r.byDay[b] ? r.byDay[b].n : 0) - (r.byDay[a] ? r.byDay[a].n : 0)));
  console.log(`새 멤버 주당 (스토리 포함): 1~4주 ${(wk(0, 27) / 4).toFixed(1)} · 5~8주 ${(wk(27, 55) / 4).toFixed(1)} · 9~12주 ${(wk(55, 83) / 4).toFixed(1)} · 13~21주 ${(wk(83, 149) / 9.4).toFixed(1)}`);
  return out;
};
