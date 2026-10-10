'use strict';
// 무한 도전 측정 — 계정 수준(보통 · 강함 · 최상위)마다 몇 웨이브 · 몇 분 · 점수 · 단계 · 진상 수
//   node scripts/lb-endless-sim.js [--seeds=4] [--lib=다른 버전 폴더] [--acc=mid,strong,top] [--maxmin=40]
//   (×1 기준 시간 = 게임 시간 · 사람처럼: 스킬 1.5초 늦게 · 카드 40% 는 아무거나)
const path = require('path');
const { pathToFileURL } = require('url');
const LIB = (process.argv.find((x) => x.startsWith('--lib=')) || '').slice(6) || path.join(__dirname, '..', 'public', 'langbang');
const load = (f) => import(pathToFileURL(path.join(LIB, f)).href);
const args = process.argv.slice(2);
const opt = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
function seeded(seed = 1) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 계정: 보통(3장쯤 · 강화 10 · ★1) · 강함(5장쯤 · 강화 15 · ★2) · 최상위(8장 · 강화 만렙 · ★4 · 좋은 장비)
const DECK = ['donghan', 'ara', 'gunnyeo', 'sunggu', 'staff', 'hyungyeong'];
const ACC = {
  mid: { meta: 10, star: 1, gear: { atk: 0.09, spd: 0.06, crit: 0.02, hp: 0.03 }, items: { door: 8, charm: 6, battery: 6, drink: 1, coupon: 3 }, coll: [0.02, 0.02, 0.02] },
  strong: { meta: 15, star: 2, gear: { atk: 0.18, spd: 0.12, crit: 0.04, hp: 0.06 }, items: { door: 10, charm: 9, battery: 9, drink: 2, coupon: 6 }, coll: [0.03, 0.03, 0.03] },
  top: { meta: 20, star: 4, gear: { atk: 0.35, spd: 0.22, crit: 0.08, hp: 0.1 }, items: { door: 12, charm: 12, battery: 12, drink: 3, coupon: 10, slot5: 1, slot6: 1 }, coll: [0.05, 0.06, 0.05] },
};

(async () => {
  const D = await load('data.js');
  const S = await load('sim.js');
  // --tune=hp:1.15,atk:1.05,from:15 : data.js ENDLESS_TUNE 숫자를 바꿔 보며 측정
  for (const kv of String(opt('tune', '')).split(',').filter(Boolean)) { const [k, v] = kv.split(':'); if (D.ENDLESS_TUNE && k in D.ENDLESS_TUNE) D.ENDLESS_TUNE[k] = Number(v); }
  const N = Number(opt('seeds', 4));
  const maxT = Number(opt('maxmin', 40)) * 60;
  const accs = opt('acc', 'mid,strong,top').split(',');
  const placeDeck = (ids) => { const out = new Array(6).fill(null), order = [2, 3, 1, 4, 0, 5]; ids.forEach((id, i) => { out[order[i]] = id; }); return out; };
  const pick = (g, cards, rng) => {
    if (rng() < 0.4) return (rng() * cards.length) | 0;
    let best = 0, bv = -1;
    cards.forEach((c, i) => { let v = c.kind === 'join' ? 9 : c.kind === 'evo' ? 9.5 : c.kind === 'heroLv' ? 6 : c.kind === 'global' ? 5 : 1; v += rng() * 1.5; if (v > bv) { bv = v; best = i; } });
    return best;
  };
  const skills = (g) => {
    for (const h of g.heroes) {
      if (!S.skillReady(h)) continue;
      const sk = h.def.skill;
      if (sk.target) { const e = g.enemies.find((o) => !o.dead && o.y > 0 && (o.boss || true)); if (e) S.castSkill(g, h, e.x, e.y); } else S.castSkill(g, h);
    }
  };
  for (const a of accs) {
    const A = ACC[a];
    const rows = [];
    for (let i = 1; i <= N; i++) {
      const rng = seeded(i * 911 + a.length * 17);
      const meta = Object.fromEntries(DECK.map((id) => [id, A.meta]));
      const gst = A.gear;
      const g = S.createGame({ H: 760, rng, mode: 'endless', meta, items: A.items, deck: placeDeck(DECK), leader: DECK[0], slots: 6, gear: Object.fromEntries(DECK.map((id) => [id, gst])), join: true, tempo: true, trialAll: true, stars: Object.fromEntries(DECK.map((id) => [id, A.star])), coll: { atk: A.coll[0], hp: A.coll[1], exp: A.coll[2] } });
      const pr = seeded(i * 31 + 7);
      let steps = 0, peak = 0, peakW = 0;
      const waveT = {};
      while (!g.over && g.t < maxT) {
        S.step(g, 1 / 60); steps++;
        g.events.length = 0;
        if (g.pendingLevels > 0 && g.pickAt === undefined) g.pickAt = g.t + (g.welcomePicks > 0 ? 0 : 2 * (0.75 + pr() * 0.5));
        if (g.pendingLevels > 0 && g.t >= g.pickAt) { const cards = S.rollCards(g); S.applyCard(g, cards[pick(g, cards, pr)]); g.pendingLevels--; if (g.welcomePicks > 0) g.welcomePicks--; g.pickAt = undefined; }
        if (g.ult >= D.RULES.ultMax && (g.bossAlive > 0 || S.enemiesLeft(g) >= 10 || g.base.hp / g.base.max < 0.5)) S.useUlt(g);
        if (steps % 90 === 0) skills(g);
        if (steps % 30 === 0) { let n = 0; for (const e of g.enemies) if (!e.dead) n++; if (n > peak) { peak = n; peakW = g.wave; } }
        if (waveT[g.wave] === undefined) waveT[g.wave] = g.t;
      }
      const sum = S.summary(g, g.t);
      rows.push({ wave: sum.wave, min: g.t / 60, score: sum.score, kills: sum.kills, peak, peakW, t10: waveT[11], t20: waveT[21], t30: waveT[31], timeout: !g.over });
    }
    const avg = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0) / rows.length;
    const at = (k) => { const v = rows.map((r) => r[k]).filter((x) => x !== undefined); return v.length ? (v.reduce((s, x) => s + x, 0) / v.length / 60).toFixed(1) + `분(${v.length}/${rows.length})` : '-'; };
    console.log(`${a.padEnd(7)} 웨이브 ${avg('wave').toFixed(1)} [${rows.map((r) => r.wave).join(',')}] · 길이 ${avg('min').toFixed(1)}분 [${rows.map((r) => r.min.toFixed(1)).join(',')}] · 점수 ${Math.round(avg('score')).toLocaleString()} [${rows.map((r) => Math.round(r.score / 1000) + 'k').join(',')}] · 처치 ${Math.round(avg('kills'))} · 동시 최대 ${Math.round(avg('peak'))}(W${Math.round(avg('peakW'))}) · W10도달 ${at('t10')} W20 ${at('t20')} W30 ${at('t30')}${rows.some((r) => r.timeout) ? ' · 시간초과 ' + rows.filter((r) => r.timeout).length : ''}`);
  }
})();
