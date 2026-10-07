// 랑방 대전 — 할로윈 이벤트 전투 규칙 (hw-event.js 의 판 정보 → createGame({ event }) 뒤 attach)
//  DOM 없음 (Node 에서도 돈다 — scripts/lb-hw-balance.js 가 그대로 쓴다)
//  sim.js 는 훅 몇 줄만: g.hw.tick (매 틱) · g.hw.preKill (쓰러지기 직전 — 좀비 부활) · g.ccMul (상태이상 시간) · g.windMul (예고 시간)
//  - 저주: 진상 체력 · 이동 · 수리 금지 · 상태이상 2배 · 독 웅덩이 · 예고 짧게 · 입구 · 어둠 · 기세 · 보스 둘(웨이브 정의)
//  - 진상 기술: 좀비 부활 · 박쥐 흡혈 · 귀신 유령화 · 마녀 물약 · 강시 콩콩 · 미라 붕대 재감기 · 저승사자 야근 명부 · 드라큘라 박쥐 변신 · 보름달
import { HEROES, ENEMIES, REVEAL_HEROES, KD, ECAST } from './data.js';
import * as S from './sim.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ev = (g, type, o) => { o.type = type; g.events.push(o); return o; };
export const HWX = {
  puddle: { every: 8, wind: 1.1, sec: 3, r: 34 }, // 저주 '독 웅덩이': 8초마다 멤버 발밑 예고 1.1초 → 독 3초
  phaseReveal: 1, // 유령화한 귀신을 찾는 거리 (사거리 비율 · 운영진 · 건전남 · 배현경)
  phaseUntil: 0.85, // 길의 70% 까지만 유령화 (입구 앞에선 안 사라진다)
};
const heroesUp = (g) => g.heroes.filter((h) => !h.def.summon && !h.gone);

export function attach(g, def) {
  const m = def.mul || {};
  g.hw = { def, n: def.n, puddleT: HWX.puddle.every, moon: false, marks: [], wisps: 0, tick, preKill };
  if (def.crowd && def.crowd < 1) { g.mods.expMul /= def.crowd; g.mods.ultCharge /= def.crowd; } // 진상 수를 줄인 만큼 한 명당 경험치 · 총공지 충전을 더
  if (m.hp && m.hp !== 1) g.mods.enemyHp *= m.hp;
  if (m.spd && m.spd !== 1) g.mods.enemySpd *= m.spd;
  if (m.repair !== undefined && m.repair < 1) g.mods.healMul *= m.repair;
  if (m.cc && m.cc !== 1) g.ccMul = m.cc;
  if (m.wind && m.wind !== 1) g.windMul = m.wind;
  if (m.mom && m.mom !== 1) g.momRate = (g.momRate || 1) * m.mom;
  if (m.door && m.door < 1) { g.base.max = Math.round(g.base.max * m.door); g.base.hp = g.base.max; }
  if (m.dark) g.rangeMul = (g.rangeMul || 1) * 0.85;
  return g.hw;
}

// 쓰러지기 직전 (sim killEnemy 맨 앞): true 면 이번엔 안 쓰러진다 (좀비 회식러 "한 잔 더!")
function preKill(g, e, src) {
  const R = e.def.hw && e.def.hw.revive;
  if (!R || e.hwRevived) return false;
  if (e.burnT > 0 || e.censorT > 0 || e.roseN > 0) { ev(g, 'hwNoRise', { x: e.x, y: e.y - 30, by: e.burnT > 0 ? 'burn' : e.censorT > 0 ? 'censor' : 'rose' }); return false; } // 화상 · 검열 · 장미 표식이 붙은 채로 쓰러지면 끝
  if (e.hwRiseT > 0) return false; // 일어나는 중에 또 쓰러짐 = 끝
  e.hwRevived = true; e.hwRiseT = R.sec; e.hwRiseHit = 0;
  e.hp = Math.max(1, e.maxHp * 0.02); e.stunT = Math.max(e.stunT, R.sec); e.kbv = 0;
  ev(g, 'hwDown', { x: e.x, y: e.y, uid: e.uid, sec: R.sec });
  return true;
}

function tick(g, dt) {
  const H = g.hw;
  if (g.phase !== 'wave' && g.phase !== 'intro') return;
  const m = H.def.mul || {};
  // 저주: 독 웅덩이 (멤버 발밑 예고 → 독)
  if (m.puddle && g.phase === 'wave') {
    H.puddleT -= dt;
    if (H.puddleT <= HWX.puddle.wind && !H.pud) {
      const hs = heroesUp(g); const h = hs[(g.rng() * hs.length) | 0];
      if (h) { H.pud = { h, t: HWX.puddle.wind * (g.windMul || 1) }; ev(g, 'hwPuddleWarn', { x: h.x, y: h.y + 14, r: HWX.puddle.r, sec: H.pud.t, hero: h.id }); }
    }
    if (H.pud && (H.pud.t -= dt) <= 0) {
      const h = H.pud.h; H.pud = null; H.puddleT = HWX.puddle.every;
      g.puddles.push({ x: h.x, y: g.rowY + 18, r: HWX.puddle.r, t: HWX.puddle.sec, max: HWX.puddle.sec, enemy: false, hw: true });
      if (!h.gone) S.hitHero(g, h, { st: 'poison', sec: HWX.puddle.sec, hit: 4 }, null);
      ev(g, 'hwPuddle', { x: h.x, y: g.rowY + 18, r: HWX.puddle.r });
    }
  }
  // 저승사자 명부 (멤버 위 카운트다운)
  for (const k of H.marks) {
    k.t -= dt;
    const h = k.h, e = k.e;
    if (h.ccImmT > 0 || h.gone) { k.done = true; ev(g, 'hwListClear', { x: h.x, y: h.y - 70, hero: h.id, by: 'shield' }); continue; } // 건전녀 응급 방패: 명부에서 지운다
    if (!e || e.dead || e.stunT > 0 || e.frozenT > 0 || e.tieT > 0 || (e.kbv || 0) < -40 || g.timeStopT > 0) { k.done = true; if (e && !e.dead) { e.weakT = Math.max(e.weakT || 0, ECAST.breakWeak); g.stats.castBreak = (g.stats.castBreak | 0) + 1; } ev(g, 'hwListClear', { x: h.x, y: h.y - 70, hero: h.id, by: 'break', ex: e ? e.x : 0, ey: e ? e.y - 60 : 0 }); continue; }
    if (k.t <= 0) {
      k.done = true;
      const L0 = e.def.hw.list;
      S.kdAdd(g, h, L0.kd * (g.ccMul || 1), { direct: true, src: 'hit', by: e.type });
      const sec = S.hitHero(g, h, { st: 'stun', sec: L0.stun, hit: 0 }, e);
      ev(g, 'hwListHit', { x: h.x, y: h.y, hero: h.id, sec, ex: e.x, ey: e.y - 60 });
    }
  }
  if (H.marks.length) H.marks = H.marks.filter((k) => !k.done);
  let bats = 0;
  for (const e of g.enemies) if (!e.dead && e.type === 'hw_bat') bats++;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const X = e.def.hw;
    if (!X) continue;
    // 좀비: 일어나는 중 (맞으면 그대로 쓰러짐)
    if (e.hwRiseT > 0) {
      e.hwRiseT -= dt;
      if (e.hwRiseT <= 0) { e.hp = e.maxHp * X.revive.hp; e.stunT = 0; ev(g, 'hwRise', { x: e.x, y: e.y - e.def.size * 0.5, uid: e.uid }); }
      continue;
    }
    // 박쥐: 입구 흡혈
    if (X.drain && e.atRope && e.stunT <= 0 && !g.over) {
      const v = g.base.max * X.drain.per * dt;
      if (!g.god) { g.base.hp -= v; g.baseHit = true; }
      if (g.base.hp <= 0 && !g.over) { g.base.hp = 0; g.over = true; g.phase = 'over'; ev(g, 'gameover', {}); }
      if (!(e.healBlockT > 0)) e.hp = Math.min(e.maxHp, e.hp + v * X.drain.heal * 3);
      if ((e.hwDrT = (e.hwDrT || 0) - dt) <= 0) { e.hwDrT = 0.9; ev(g, 'hwDrain', { x: e.x, y: e.y - 10, dx: e.x, dy: g.ropeY }); }
    }
    // 귀신: 유령화 (안 보이고 빨리 미끄러진다 — 운영진 · 건전남 · 배현경 곁이면 들킨다 · 범위 공격에 맞아도 들킨다)
    if (X.phase) {
      if (e.hwPhT === undefined) e.hwPhT = X.phase.every * (0.6 + g.rng() * 0.5);
      if (e.hwGhost) {
        e.hwPhT -= dt;
        let seen = false;
        for (const h of g.heroes) if ((REVEAL_HEROES.includes(h.id) || h.id === 'hyungyeong') && !h.gone && Math.hypot(e.x - h.x, e.y - h.y) < S.heroRange(g, h, true) * HWX.phaseReveal) { seen = true; break; }
        if (e.hwPhT <= 0 || seen || e.unveiled) { e.hwGhost = false; e.cloak = false; e.unveiled = true; e.spdMul /= X.phase.spd; e.hwPhT = X.phase.every; ev(g, 'hwPhaseOut', { x: e.x, y: e.y - 30, uid: e.uid, seen }); }
      } else if (e.y > 40 && e.y < g.ropeY * HWX.phaseUntil && !e.atRope && e.stunT <= 0 && (e.hwPhT -= dt) <= 0) {
        e.hwGhost = true; e.cloak = true; e.unveiled = false; e.spdMul *= X.phase.spd; e.hwPhT = X.phase.sec;
        ev(g, 'hwPhaseIn', { x: e.x, y: e.y - 30, uid: e.uid });
      }
    }
    // 마녀: 건강 물약 (곁 진상 회복)
    if (X.brew && e.y > 30 && e.stunT <= 0) {
      if (e.hwBrT === undefined) e.hwBrT = X.brew.every * (0.5 + g.rng() * 0.5);
      if ((e.hwBrT -= dt) <= 0) {
        e.hwBrT = X.brew.every;
        let n = 0;
        S.forEnemiesNear(g, e.x, e.y, X.brew.r, (o) => { if (!o.dead && o.hp < o.maxHp && !(o.healBlockT > 0)) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * X.brew.frac * (o.boss ? 0.15 : o.mid ? 0.4 : 1)); n++; } return true; });
        ev(g, 'hwBrew', { x: e.x, y: e.y - e.def.size * 0.5, r: X.brew.r, n });
      }
    }
    // 강시: 콩콩 (공중에선 밀치기 · 끌어당기기가 안 먹힌다)
    if (X.hop) {
      e.hwHopT = (e.hwHopT || 0) + dt;
      const cyc = X.hop.gap, ph = e.hwHopT % cyc;
      const air = ph < X.hop.air;
      e.hwAir = air;
      e.spdMul = (e.hwSpdBase || (e.hwSpdBase = e.spdMul)) * (air ? cyc / X.hop.air : 0.0001);
      if (air && e.kbv) e.kbv = 0;
      e.hwHopY = air ? Math.sin((ph / X.hop.air) * Math.PI) * 14 : 0;
    }
    // 미라: 붕대 재감기 (한 번)
    if (X.rewrap && !e.hwWrapped && e.hp < e.maxHp * X.rewrap.at) {
      e.hwWrapped = true; e.shield = Math.max(e.shield || 0, e.maxHp * X.rewrap.frac);
      ev(g, 'hwRewrap', { x: e.x, y: e.y - e.def.size * 0.5, uid: e.uid });
    }
    // 저승사자 팀장: 야근 명부 (멤버 이름 → 카운트다운)
    if (X.list && e.y > 50) {
      if (e.hwListT === undefined) e.hwListT = X.list.first;
      if (e.stunT <= 0 && !e.cast && (e.hwListT -= dt) <= 0) {
        e.hwListT = X.list.every;
        const hs = heroesUp(g).filter((h) => !(h.kdT > 0) && !H.marks.some((k) => k.h === h));
        if (hs.length) {
          const h = hs.sort((a, b) => (b.dmgDone || 0) - (a.dmgDone || 0))[0]; // 제일 열심히 일한 멤버 이름부터
          const gn = g.heroes.some((o) => o.id === 'gunnyeo' && !o.gone);
          const sec = (gn ? X.list.gnSec : X.list.sec) * (g.windMul || 1);
          H.marks.push({ h, e, t: sec, max: sec });
          ev(g, 'hwList', { x: h.x, y: h.y - 70, hero: h.id, sec, ex: e.x, ey: e.y - e.def.size * 0.6, uid: e.uid });
        }
      }
    }
    // 드라큘라: 박쥐 변신 (분노부터) · 보름달
    if (X.batform && e.bai && e.bai.p2) {
      if (e.hwBatT === undefined) e.hwBatT = X.batform.first;
      if (e.hwBat > 0) {
        e.hwBat -= dt;
        if (e.hwBat <= 0) { // 다른 자리에 나타난다
          const nx = clamp(e.x + (g.rng() < 0.5 ? -1 : 1) * (90 + g.rng() * 80), 50, g.W - 50);
          e.x = nx; e.baseX = nx; e.y = Math.max(80, Math.min(e.y + 30, g.ropeY - 160)); e.cloak = false; e.unveiled = true; e.hwInv = false;
          ev(g, 'hwBatOut', { x: e.x, y: e.y - e.def.size * 0.5, uid: e.uid });
        }
      } else if (!e.cast && e.stunT <= 0 && e.bai.st === 'walk' && (e.hwBatT -= dt) <= 0) {
        e.hwBatT = X.batform.every; e.hwBat = X.batform.sec; e.cloak = true; e.unveiled = false; e.hwInv = true;
        g.projs = g.projs.filter((p) => Math.hypot(p.x - e.x, p.y - e.y) > 160);
        ev(g, 'hwBatIn', { x: e.x, y: e.y - e.def.size * 0.5, uid: e.uid, sec: X.batform.sec });
      }
    }
    if (X.moon && !H.moon && e.hp < e.maxHp * X.moon.at) {
      H.moon = true; g.mods.enemySpd *= X.moon.spd; for (const o of g.enemies) if (!o.dead) o.speed *= X.moon.spd;
      ev(g, 'hwMoon', { x: e.x, y: e.y - e.def.size * 0.6 });
    }
    if (X.moon && H.moon && bats > 0 && !(e.healBlockT > 0)) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * X.moon.heal * Math.min(4, bats) * dt);
  }
}
// 풀에서 꺼낸 진상: 지난 판 할로윈 상태를 지운다 (sim spawnEnemy)
export function resetEnemy(e) { e.hwRiseT = 0; e.hwRevived = false; e.hwPhT = undefined; e.hwGhost = false; e.hwBrT = undefined; e.hwHopT = 0; e.hwAir = false; e.hwSpdBase = 0; e.hwHopY = 0; e.hwWrapped = false; e.hwListT = undefined; e.hwBatT = undefined; e.hwBat = 0; e.hwInv = false; e.hwDrT = 0; }
// 전투 화면용: 지금 명부에 이름이 적힌 멤버 (render · HUD)
export const marksOf = (g) => (g.hw ? g.hw.marks : []);
export const isGhost = (e) => !!e.hwGhost || e.hwBat > 0;
