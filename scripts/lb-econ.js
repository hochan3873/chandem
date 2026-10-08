'use strict';
// 랑방 대전 성장 경제 모형 — 보통 사람이 스테이지 s 에 처음 도착했을 때 강화 · ★ · 장비가 얼마쯤인가
//   node scripts/lb-econ.js [--runs=12] [--fail=0.3] [--stars=3] [--side=1]
//   runs: 하루 판 수 (스태미나 6씩 · 하루 약 200 → 최대 33판 · 보통 사람 12판쯤)
//   fail: 처음 도전에서 지는 비율 (진 판은 보상 없음 · 한 번 더) · stars: 처음 깰 때 별 (3 = 지금처럼 쉽게 ★★★)
//   side: 곁다리 수입 (무한 · 대전 · 탑 · 주간 도전) 정도 0~1
// 수입: 스테이지 첫 클리어 (stageReward) · ★ 상자 · 업적(장 · 별) · 도감 첫 발견 (멤버 500 + 카드 10 · 진상 150~1200) · 일일/주간 미션 · 출석
// 지출 (욕심껏, 싼 것부터): 덱 멤버 강화 고르게 (코인 metaCost + 카드 heroCardNeed) → 5칸(25k) · 6칸(80k) → 입구 아이템
// 출력: 장 첫 스테이지에 도착했을 때 덱 평균 강화 · 실제 판에 들어가는 강화 (softMeta: 권장 넘는 만큼 절반) · 기준 봇 가정(권장 +2 → 실제 +1)
const path = require('path');
const { pathToFileURL } = require('url');
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
(async () => {
  const LIB = (process.argv.find((x) => x.startsWith('--lib=')) || '').slice(6) || path.join(__dirname, '..', 'public', 'langbang');
  const D = await import(pathToFileURL(path.join(LIB, 'data.js')).href);
  const RUNS = opt('runs', 12), FAIL = opt('fail', 0.3), STARS = opt('stars', 3), SIDE = opt('side', 1);
  const slotsFor = (c) => (c <= 2 ? 4 : c <= 4 ? 5 : 6); // 기준 봇 덱 칸 (밸런스 스크립트 DECKS 와 같게)
  const ENEMY_DEX = 4300; // 장마다 새 진상 첫 발견 보상 (일반 8 × 150 · 정예 1 × 300 · 중간 보스 2 × 600 · 보스 1.3 × 1200 쯤)
  const CH_ACH = [500, 1200, 3000, 4000, 6000, 10000, 16000, 20000], CH_WILD = [2, 3, 4, 5, 6, 0, 0, 0];
  const STAR_ACH = { 30: 800, 60: 1500, 90: 3000, 120: 4000, 150: 6000, 180: 8000, 210: 12000, 240: 15000 };
  const unlockAt = {}; for (const [id, s] of Object.entries(D.HERO_UNLOCK)) if (s <= 80) unlockAt[s] = id;
  let coins = 2000, wild = 0, cards = 40, day = 0, runs = 0, stars = 0, slot5 = 0, slot6 = 0, door = 0;
  const lv = []; // 덱 칸마다 강화 (덱 멤버는 장마다 바뀌지만 '덱 평균 강화' 로 본다)
  const out = [];
  const daily = () => { coins += 550 + 270 + 515 + (day >= 1 ? 0 : 0) + SIDE * (runs > 60 ? 1800 : runs > 25 ? 700 : 0); wild += 1 + 1; }; // 일일 · 출석 · 주간/7 · (무한 · 대전 · 탑 · 주간 도전) · 와일드 (일일 다 + 주간/7)
  function spend(c) {
    const n = slotsFor(c);
    while (lv.length < n) lv.push(lv.length ? Math.max(0, Math.min(...lv) - 2) : 0); // 새 멤버는 조금 덜 키운 채로
    for (;;) {
      // 칸 사기: 5칸 · 6칸 (그 장 덱이 그만큼 필요할 때만 — 밸런스 가정과 같게)
      if (n >= 5 && !slot5 && coins >= 25000) { coins -= 25000; slot5 = 1; continue; }
      if (n >= 6 && !slot6 && coins >= 80000) { coins -= 80000; slot6 = 1; continue; }
      let i = 0; for (let k = 1; k < n; k++) if (lv[k] < lv[i]) i = k;
      const m = lv[i]; if (m >= 20) break;
      const cost = D.metaCost ? D.metaCost(m) : Math.round((40 * Math.pow(m + 1, 1.7)) / 10) * 10, need = D.heroCardNeed ? D.heroCardNeed(m + 1) : m < 5 ? 1 : m < 10 ? 2 : m < 15 ? 3 : 5;
      const perHeroCards = cards / n + wild / n;
      if (coins < cost || perHeroCards < need) break;
      coins -= cost; const fromCards = Math.min(cards, need); cards -= fromCards; wild -= need - fromCards; lv[i]++;
    }
    const cap = (D.ITEM_LV_CAP || {}).door;
    if (coins > 20000 && door < 10) { const c0 = D.itemCost ? D.itemCost('door', door) : 150 * Math.pow(door + 1, 1.6); if (coins - c0 > 15000) { coins -= c0; door++; } }
  }
  for (let s = 1; s <= 80; s++) {
    const c = D.chapterOf(s);
    if (D.stageNo(s) === 1) {
      spend(c);
      const avg = lv.slice(0, slotsFor(c)).reduce((a, b) => a + b, 0) / slotsFor(c);
      const rec = D.REC_META[c - 1];
      out.push({ c, day: day.toFixed(1), avg, eff: D.softMeta(avg, s, false), rec, bot: D.softMeta(rec + 2, s, false), slots: slotsFor(c), slot5, slot6, door, coins: Math.round(coins) });
    }
    // 이 스테이지: 처음 도전에서 FAIL 만큼 지고 다시
    const tries = 1 / (1 - FAIL);
    runs += tries; const nd = Math.floor(runs / RUNS); while (day < nd) { day++; daily(); }
    const r = D.stageReward(s, STARS, 0, 0);
    coins += r.total; stars += STARS;
    cards += (0.07 + 0.02 * STARS) * tries; // 멤버 카드 한 장 (덱 아무나)
    for (const [k, v] of Object.entries(STAR_ACH)) if (stars - STARS < +k && stars >= +k) coins += v;
    if (unlockAt[s]) { coins += 500; cards += 10; }
    if (D.stageNo(s) === 10) { coins += CH_ACH[c - 1] + 2800 * c * (STARS >= 3 ? 1 : 0.45); wild += CH_WILD[c - 1]; coins += ENEMY_DEX; }
  }
  console.log(`■ 성장 경제 모형 — 하루 ${RUNS}판 · 처음 도전 실패 ${Math.round(FAIL * 100)}% · 처음 깰 때 ★${STARS} · 곁다리 수입 ×${SIDE}`);
  console.log('장  도착(일)  덱칸  덱 평균 강화  실제(소프트)  권장  기준봇(실제)  5칸/6칸  입구템  남은 코인');
  for (const o of out) console.log(`${o.c}장  ${String(o.day).padStart(6)}  ${o.slots}칸  ${o.avg.toFixed(1).padStart(10)}  ${o.eff.toFixed(1).padStart(10)}  ${String(o.rec).padStart(5)}  ${o.bot.toFixed(1).padStart(10)}  ${o.slot5}/${o.slot6}  ${String(o.door).padStart(6)}  ${o.coins}`);
})().catch((e) => { console.error(e); process.exit(1); });
