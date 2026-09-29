// 랑방 대전 — 순수 시뮬레이션 (DOM 없음, Node 에서도 import 가능)
// 화면/소리는 g.events 로 흘려보내고, 렌더러가 매 프레임 꺼내서 연출한다.
import {
  FIELD, RULES, HEROES, ENEMIES, HERO_SLOTS, SLOT_X, SLOT_X7, SLOT_ORDER, LEVEL_DMG, LEVEL_INTERVAL,
  BASE_HEROES, HIDDEN_HEROES, UNLOCK_HEROES, LOCKED_HEROES, CARDS, FILLER_CARDS, RARITY, SCORE, expNeed, hpMul, atkMul, waveDef,
  STAGE_WAVES, stageWave, starsFor, itemValue, typeMul, MAP_FX, stageFx,
} from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ─── 게임 생성 ─────────────────────────────────────────
// opt.mode: 'stage'(스테이지 opt.stage = 1..30, 5웨이브) | 'endless'(무한 도전, 기본)
// opt.items: { door, battery, charm, drink } 아이템 레벨
// opt.unlocked: 해금한 영웅(서명훈·히든) — 이 영웅들만 카드로 나온다 (없으면 전부)
export function createGame(opt = {}) {
  const H = clamp(Math.round(opt.H || 720), FIELD.minH, FIELD.maxH);
  const rowY = Math.round(H * FIELD.rowFrac);
  const mode = opt.mode || (opt.stage ? 'stage' : 'endless');
  const items = opt.items || {};
  const baseMax = Math.round(RULES.baseHp * (1 + itemValue('door', items.door)));
  const welcome = mode === 'stage' ? Math.max(0, Math.floor(items.drink || 0)) : 0;
  let unlocked = (opt.unlocked || opt.hiddenUnlocked || LOCKED_HEROES).filter((id) => LOCKED_HEROES.includes(id));
  // 무한 도전: 아직 해금 안 한 멤버도 카드로 "체험 합류" (출전 동료·강화는 해금해야)
  const trial = opt.trialAll ? LOCKED_HEROES.filter((id) => !unlocked.includes(id)) : [];
  if (opt.trialAll) unlocked = LOCKED_HEROES.slice();
  const g = {
    W: FIELD.W, H, rowY, ropeY: rowY - FIELD.ropeGap,
    rng: opt.rng || Math.random,
    meta: opt.meta || {}, // { heroId: 영구 강화 레벨 }
    items,
    mode, stage: mode === 'stage' ? opt.stage || 1 : 0,
    totalWaves: mode === 'stage' ? STAGE_WAVES : Infinity,
    unlocked, trial, hiddenUnlocked: unlocked.filter((id) => HIDDEN_HEROES.includes(id)),
    god: !!opt.god,
    t: 0, wave: opt.startWave ? opt.startWave - 1 : 0, diff: 1,
    phase: opt.noWaves ? 'test' : 'break', phaseT: RULES.firstBreakSec,
    waveT: 0, spawnQ: [], spawnI: 0, bossAlive: 0,
    heroes: [], enemies: [], projs: [], gems: [], events: [], eprojs: [], pools: [], puddles: [], flirt: false,
    rallyT: 0, rallySpd: 0, swapCd: 0, effT: -9,
    slotX: (opt.positions || 6) >= 7 ? SLOT_X7.slice() : SLOT_X.slice(), nPos: (opt.positions || 6) >= 7 ? 7 : 6,
    gear: opt.gear || {}, baseHit: false, // 장비 · 퍼펙트(입구 무피해) 판정
    mapFx: opt.mapFx ? MAP_FX[opt.mapFx] || MAP_FX.none : mode === 'stage' ? stageFx(opt.stage || 1) : MAP_FX.none, // 맵 효과
    fxT: 0, darkT: 0, megaT: 0,
    base: { hp: baseMax, max: baseMax },
    level: 1, exp: 0, need: expNeed(1), pendingLevels: welcome, welcomePicks: welcome,
    mods: {
      dmg: 1, spd: 1, crit: RULES.crit + itemValue('charm', items.charm), critMul: RULES.critMul, expMul: 1, enemySpd: 1,
      pierce: 0, gunExtra: 0, regen: 0, ultCharge: 1 + itemValue('battery', items.battery), ultDmg: 1, charmMul: 1,
    },
    stacks: {}, hiddenTaken: {}, heroesUsed: {}, seen: {},
    stats: { kills: 0, bossKills: 0, coins: 0, score: 0, maxCombo: 0, damage: 0, wavesCleared: 0, stolen: 0 },
    combo: 0, comboT: 0, ult: 0, focus: null,
    uid: 1, victory: false, endless: mode === 'endless', over: false, stars: 0, lastSnap: null,
    // 오브젝트 풀
    _enemyPool: [], _projPool: [], _gemPool: [], _boom: [],
    _grid: null,
  };
  if (g.mapFx.exp) g.mods.expMul += g.mapFx.exp;
  // 장비: 입구 내구도 +%
  let hpUp = 0;
  for (const k in g.gear) hpUp += (g.gear[k] && g.gear[k].hp) || 0;
  if (hpUp) { g.base.max = Math.round(g.base.max * (1 + hpUp)); g.base.hp = g.base.max; }
  if (opt.deck) {
    // 덱: 자리마다 영웅 (자리가 곧 공격 줄)
    opt.deck.forEach((id, slot) => { if (id && HEROES[id] && slot < g.nPos) addHero(g, id, slot); });
  } else {
    const start = opt.heroes || ['bangjang', ...(opt.partners || [opt.partner || 'gunman'])];
    for (const id of start) if (id) addHero(g, id);
  }
  return g;
}

function ev(g, type, o) {
  if (!o) o = {};
  o.type = type;
  g.events.push(o);
  return o;
}

// ─── 영웅 ─────────────────────────────────────────────
export function hasHero(g, id) {
  for (const h of g.heroes) if (h.id === id) return h;
  return null;
}

export function addHero(g, id, want) {
  if (hasHero(g, id) || g.heroes.length >= g.nPos) return null;
  const def = HEROES[id];
  const used = new Set(g.heroes.map((h) => h.slot));
  const order = g.nPos >= 7 ? [3, 2, 4, 1, 5, 0, 6] : SLOT_ORDER;
  const slot = want !== undefined && !used.has(want) && want < g.nPos ? want : order.find((s) => !used.has(s));
  const h = {
    id, def, slot, x: g.slotX[slot], y: g.rowY, lv: 1, meta: g.meta[id] || 0, gear: g.gear[id] || {},
    cd: 0.3 + g.rng() * 0.4, charmT: 0, stunT: 0, rumorT: 0, fearT: 0, paperT: 0, vomitT: 0, blindT: 0, drowsyT: 0, grabT: 0, grabBy: 0, recoil: 0, shots: 0, joinT: 0,
    rage: false, rageT: def.soberSec ? def.soberSec[0] : 0, healT: def.heal ? def.heal[0][0] : 0,
    kills: 0, dmgDone: 0,
    skillCd: def.skill ? def.skill.cd * 0.5 * (1 - ((g.gear[id] && g.gear[id].cd) || 0)) : 0, frenzyT: 0, frenzyCd: 0, // 스킬은 판 시작하고 절반쯤 지나야 첫 사용
    beamE: null, beamUid: 0, beamT: 0, beamTick: 0, beam2E: null, kbT: 0, rx: g.slotX[slot],
    motoN: 0, meter: 0, upT: 0, burstT: 0, serious: 1, // 백인규 오토바이 게이지 · 문동한 간보기
    out: false, outT: 0, restT: 0, px: g.slotX[slot], py: g.rowY, dashE: null, // 김영준 돌격
  };
  g.heroes.push(h);
  g.heroesUsed[id] = true;
  if (def.hidden) g.hiddenTaken[id] = true;
  ev(g, 'join', { hero: id, x: h.x, y: h.y, hidden: !!def.hidden });
  return h;
}

// 사거리: 맵 효과(비·안개·정전) 반영. seeAll = 지목 대상처럼 정전이어도 보이는 경우
export function heroRange(g, h, seeAll) {
  const d = h.def, fx = g.mapFx;
  const base = Array.isArray(d.range) ? d.range[h.lv - 1] : d.range;
  let r = base * (fx.range || 1);
  if (fx.longRange && base >= 400 && d.attr !== 'talk') r *= fx.longRange;
  if (g.darkT > 0 && !seeAll) r = Math.min(r, fx.seeR);
  return r;
}
export function heroDamage(g, h) {
  const d = h.def;
  const fxm = (g.mapFx.attr && g.mapFx.attr[d.attr]) || 1;
  const flirt = g.flirt && d.gender === 'm' ? 1 - ENEMIES.scammer.scam.flirt : 1; // 예쁜 프사에 넋 나간 남자 멤버
  return d.dmg * LEVEL_DMG[h.lv - 1] * (1 + RULES.metaDmgPerLevel * h.meta) * g.mods.dmg * (h.rage ? d.rageDmg : 1) * flirt * fxm * (1 + (h.gear.atk || 0));
}
// 이 멤버 치명타 확률 (장비 포함)
function critOf(g, h) { return g.mods.crit + (h && h.gear ? h.gear.crit || 0 : 0); }
// 뒷담화(수군수군)·공포(사기꾼 실물) 로 느려진 공격 속도 배율
export function heroSpeedMul(h) {
  return (h.rumorT > 0 ? 1 - ENEMIES.inpi_gossip.rumor.cut : 1) * (h.fearT > 0 ? 1 - ENEMIES.scammer.scam.fear : 1)
    * (h.paperT > 0 ? 1 - ENEMIES.boss_loan.paper.cut : 1)
    * (h.vomitT > 0 ? 1 - ENEMIES.vomit.puke.cut : 1) * (h.drowsyT > 0 ? 1 / (1 + ENEMIES.kkondae.latte.slow) : 1);
}
export function heroInterval(g, h) {
  const d = h.def;
  let iv = d.interval * LEVEL_INTERVAL[h.lv - 1];
  if (d.lv5Interval && h.lv >= 5) iv *= d.lv5Interval;
  return iv / ((g.mods.spd + auraBonus(g)) * heroSpeedMul(h) * (1 + (g.rallyT > 0 ? g.rallySpd : 0))) * (h.rage ? d.rageInterval : 1);
}
export function auraBonus(g) {
  const b = hasHero(g, 'bangjang');
  return b ? HEROES.bangjang.aura[b.lv - 1] : 0;
}

function updateHeroes(g, dt) {
  const aura = auraBonus(g);
  // 김도훈 떼창: 입구 회복 + 곁 멤버 공속
  const singers = g.heroes.filter((o) => o.def.sing && o.stunT <= 0 && o.grabT <= 0);
  if (g.phase !== 'test') for (const d0 of singers) if (g.base.hp < g.base.max) g.base.hp = Math.min(g.base.max, g.base.hp + g.base.max * d0.def.regen[d0.lv - 1] * dt);
  for (const h of g.heroes) {
    const d = h.def;
    h.joinT += dt;
    if (h.recoil > 0) h.recoil -= dt;
    if (h.charmT > 0) h.charmT -= dt;
    if (h.stunT > 0) h.stunT -= dt;
    if (h.rumorT > 0) h.rumorT -= dt;
    if (h.paperT > 0) h.paperT -= dt;
    if (h.vomitT > 0) h.vomitT -= dt;
    if (h.blindT > 0) h.blindT -= dt;
    if (h.drowsyT > 0) h.drowsyT -= dt;
    if (h.grabT > 0) { h.grabT -= dt; if (h.grabT <= 0) h.grabBy = 0; }
    if (h.fearT > 0) h.fearT -= dt;
    if (h.skillCd > 0) h.skillCd -= dt;
    // 최은옥: 술 → 분노 → 술 깸 반복
    if (d.soberSec) {
      h.rageT -= dt;
      if (h.rageT <= 0) {
        if (h.rage) {
          h.rage = false;
          h.rageT = d.soberSec[h.lv - 1];
          ev(g, 'sober', { hero: h.id, x: h.x, y: h.y });
        } else {
          h.rage = true;
          h.rageT = d.rageSec[h.lv - 1] * (g.mapFx.rage || 1);
          ev(g, 'rage', { hero: h.id, x: h.x, y: h.y });
        }
      }
    }
    // 건전녀: 주기적으로 입구 수리
    if (d.heal && g.phase !== 'test') {
      h.healT -= dt;
      if (h.healT <= 0) {
        const [per, amt] = d.heal[h.lv - 1];
        h.healT = per;
        if (g.base.hp < g.base.max) {
          const v = Math.min(g.base.max - g.base.hp, g.base.max * amt);
          g.base.hp += v;
          ev(g, 'heal', { x: h.x, y: h.y, v: Math.round(v) });
        }
      }
    }
    if (h.charmT > 0 || h.stunT > 0 || h.grabT > 0) { h.beamE = null; h.beam2E = null; continue; }
    let sing = 0;
    for (const d0 of singers) if (d0 !== h && Math.abs(d0.x - h.x) <= d0.def.sing.r) sing = Math.max(sing, d0.def.sing.spd[d0.lv - 1]);
    const rate = (g.mods.spd + aura) * heroSpeedMul(h) * (1 + (g.rallyT > 0 ? g.rallySpd : 0)) * (1 + sing) * (1 + (h.gear.spd || 0)) / (h.rage ? d.rageInterval : 1);
    // 문동한: 간보기 게이지 → 일어나서 한 줄 빔
    if (d.meter) {
      if (h.upT > 0) h.upT -= dt;
      if (h.burstT > 0) { h.burstT -= dt; if (h.burstT <= 0) lazyBurst(g, h); continue; }
      let near = 0;
      for (const e of g.enemies) if (!e.dead && e.y > g.ropeY - d.meter.nearY) near++;
      if (g.phase === 'wave' || g.phase === 'intro') h.meter += dt * (d.meter.base[h.lv - 1] + d.meter.perNear * Math.min(near, 12) + d.meter.hpLow * (1 - g.base.hp / g.base.max));
      if (h.meter >= 100 && g.enemies.some((e) => !e.dead && e.y > 0)) { h.meter = 100; h.burstT = d.burst.windup; h.upT = d.burst.windup + d.burst.rest; ev(g, 'lazyUp', { x: h.x, y: h.y }); continue; }
      h.meter = Math.min(100, h.meter);
    }
    // 건전남 스킬 '난사': 가까운 진상에게 폭풍 연사
    if (h.frenzyT > 0) {
      h.frenzyT -= dt;
      h.frenzyCd -= dt;
      while (h.frenzyCd <= 0) {
        h.frenzyCd += d.skill.every;
        const t = nearestEnemy(g, h.x, h.y, heroRange(g, h));
        if (!t) { h.frenzyCd = 0.05; break; }
        const a = aimAngle(h, t, d.projSpeed) + (g.rng() - 0.5) * 0.12;
        spawnProj(g, 'bullet', h, null, heroDamage(g, h) * 0.75, { angle: a, pierce: g.mods.pierce, critBonus: d.critBonus || 0, r: 6 });
        if (g.rng() < 0.3) ev(g, 'shot', { hero: h.id, x: h.x, y: h.y });
      }
    }
    // 이한나: 하트 레이저 (쏘는 동안 계속)
    if (d.proj === 'beam') { updateBeam(g, h, dt, rate); continue; }
    // 김영준: 뛰어들어 연속 베기 → 돌아와 크로스핏
    if (d.proj === 'dash') { updateDash(g, h, dt, rate); continue; }
    const base = d.interval * LEVEL_INTERVAL[h.lv - 1] * (d.lv5Interval && h.lv >= 5 ? d.lv5Interval : 1);
    h.cd -= dt * rate;
    if (h.cd <= 0) {
      const t = findTarget(g, h);
      if (!t) { h.cd = 0; continue; }
      fire(g, h, t);
      h.cd += base;
      if (h.cd < 0) h.cd = 0;
    }
  }
}

function nearestEnemy(g, x, y, range) {
  let best = null, bd = range * range;
  for (const e of g.enemies) {
    if (e.dead || e.y < -20) continue;
    const dx = e.x - x, dy = e.y - y, d2 = dx * dx + dy * dy;
    if (d2 < bd) { bd = d2; best = e; }
  }
  return best;
}

// 이한나 하트 레이저: 같은 적에게 오래 쏠수록 세진다. 남자는 가끔 뒤로 밀린다 (넉백 제한 지킴)
function updateBeam(g, h, dt, rate) {
  const d = h.def, lv = h.lv;
  const f = g.focus;
  const range = heroRange(g, h);
  let t = h.beamE && !h.beamE.dead && h.beamE.uid === h.beamUid && inRange(h, h.beamE, range) ? h.beamE : null;
  if (f && !f.dead && f.uid === g.focusUid && inRange(h, f, heroRange(g, h, true))) t = f;
  if (!t) t = findTarget(g, h);
  if (t !== h.beamE) { h.beamE = t; h.beamUid = t ? t.uid : 0; h.beamT = 0; }
  if (!t) { h.beam2E = null; return; }
  h.beamT += dt;
  h.kbT -= dt;
  h.beamTick -= dt * rate;
  if (h.beamTick <= 0) {
    h.beamTick += d.beamTick;
    const ramp = 1 + Math.min(d.rampMax, d.ramp[lv - 1] * h.beamT);
    const dmg = heroDamage(g, h) * (d.beamTick / d.interval) * ramp;
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, t, dmg * (crit ? g.mods.critMul : 1), crit, h);
    if (lv >= 5) {
      // 두 번째 갈래: 가까운 다른 진상
      let o = h.beam2E && !h.beam2E.dead && inRange(h, h.beam2E, range) && h.beam2E !== t ? h.beam2E : null;
      if (!o) { o = null; let bd = 1e9; for (const e of g.enemies) { if (e.dead || e === t || !inRange(h, e, range)) continue; const dd = Math.abs(e.x - t.x) + Math.abs(e.y - t.y); if (dd < bd) { bd = dd; o = e; } } }
      h.beam2E = o;
      if (o) damageEnemy(g, o, dmg * 0.6, false, h);
    }
    if ((h.shots++ & 7) === 0) ev(g, 'shot', { hero: h.id, x: h.x, y: h.y });
  }
  if (h.kbT <= 0 && !t.dead) {
    h.kbT = d.kbEvery;
    if (t.gender === 'm' && !t.boss && !t.def.charmImmune) {
      applyKnockback(t, d.knockback[lv - 1], g);
      if (lv >= 5) t.stunT = Math.max(t.stunT, 0.5 * stunMul(t));
      ev(g, 'wink', { x: t.x, y: t.y - 26, male: true });
    }
  }
}

function updateDash(g, h, dt, rate) {
  const d = h.def, lv = h.lv;
  if (h.restT > 0) { h.restT -= dt; h.px += (h.x - h.px) * Math.min(1, dt * 10); h.py += (h.y - h.py) * Math.min(1, dt * 10); return; }
  if (!h.out) {
    h.px += (h.x - h.px) * Math.min(1, dt * 10); h.py += (h.y - h.py) * Math.min(1, dt * 10);
    const t = pickCluster(g, h, heroRange(g, h));
    if (!t) return;
    h.out = true; h.outT = d.outSec[lv - 1]; h.dashE = t; h.upT = h.outT; h.cd = 0;
    ev(g, 'dash', { x: h.x, y: h.y, tx: t.x, ty: t.y });
    return;
  }
  h.outT -= dt; h.upT = Math.max(0, h.outT);
  let t = h.dashE;
  const f = g.focus;
  if (f && !f.dead && f.uid === g.focusUid && Math.hypot(f.x - h.px, f.y - h.py) < 160) t = f;
  if (!t || t.dead) {
    t = null; let bd = 120 * 120;
    for (const e of g.enemies) { if (e.dead) continue; const dx = e.x - h.px, dy = e.y - h.py, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; t = e; } }
    h.dashE = t;
  }
  if (t) { h.px += (t.x - h.px) * Math.min(1, dt * 14); h.py += (t.y + 14 - h.py) * Math.min(1, dt * 14); }
  h.cd -= dt * rate;
  if (t && h.cd <= 0 && Math.hypot(t.x - h.px, t.y - h.py) < d.reach + t.r) {
    h.cd += d.interval * LEVEL_INTERVAL[lv - 1];
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, t, heroDamage(g, h) * (crit ? g.mods.critMul : 1), crit, h, false, true);
    if ((h.shots++ % 5) === 0) ev(g, 'slash', { x: t.x, y: t.y - 20 });
  }
  if (h.outT <= 0 || (!t && h.outT < d.outSec[lv - 1] - 0.3)) {
    h.out = false; h.upT = 0; h.restT = d.restSec[lv - 1]; h.dashE = null;
    ev(g, 'crossfit', { x: h.x, y: h.y });
  }
}
// 제일 몰린 진상 (주변 60 안에 많은 순) — 지목이 있으면 그쪽
function pickCluster(g, h, range) {
  const f = g.focus;
  if (f && !f.dead && f.uid === g.focusUid && inRange(h, f, heroRange(g, h, true))) return f;
  let best = null, bn = -1;
  for (const e of g.enemies) {
    if (e.dead || e.y < 0 || !inRange(h, e, range)) continue;
    let n = 0;
    for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < 60 && Math.abs(o.y - e.y) < 60) n++;
    if (n > bn) { bn = n; best = e; }
  }
  return best;
}

function inRange(h, e, range) {
  const dx = e.x - h.x, dy = e.y - h.y;
  return dx * dx + dy * dy <= range * range && e.y > -20;
}
export function findTarget(g, h, skip) {
  const range = heroRange(g, h);
  const f = g.focus;
  if (f && !f.dead && f.uid === g.focusUid && inRange(h, f, heroRange(g, h, true)) && !(skip && skip.includes(f)) && !(h.def.lane && Math.abs(f.x - h.x) > h.def.lane + f.r)) return f;
  let best = null, by = -1e9;
  const lane = h.def.lane;
  for (const e of g.enemies) {
    if (e.dead || (skip && skip.includes(e))) continue;
    if (lane && Math.abs(e.x - h.x) > lane + e.r) continue; // 자기 줄만
    // 입구에 가까운(아래쪽) 적 우선, 도망가는 먹튀는 약간 가산
    const y = e.y + (e.fleeing ? 60 : 0);
    if (y > by && inRange(h, e, range)) { by = y; best = e; }
  }
  return best;
}

// ─── 발사 ─────────────────────────────────────────────
export function fire(g, h, t) {
  const d = h.def;
  const lv = h.lv;
  h.recoil = 0.14;
  h.shots++;
  const dmg = heroDamage(g, h);
  ev(g, 'shot', { hero: h.id, x: h.x, y: h.y });
  const pierce = g.mods.pierce;
  switch (d.proj) {
    case 'cone': {
      // 방장 확성기 음파: 짧은 부채꼴 안을 한꺼번에
      const big = lv >= 5 && h.shots % 5 === 0;
      const ang = Math.atan2(t.y - h.y, t.x - h.x);
      const half = d.cone[lv - 1] * (big ? 1.5 : 1);
      const R = heroRange(g, h, true) * (big ? 1.35 : 1);
      const hits = [];
      for (const e of g.enemies) {
        if (e.dead || e.y < -20) continue;
        const dx = e.x - h.x, dy = e.y - (h.y - 30);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > R + e.r) continue;
        let da = Math.abs(Math.atan2(dy, dx) - ang);
        if (da > Math.PI) da = Math.PI * 2 - da;
        if (da <= half + Math.atan2(e.r, Math.max(1, dist))) hits.push([dist, e]);
      }
      if (!hits.some((x) => x[1] === t)) hits.push([0, t]);
      hits.sort((x, y) => x[0] - y[0]);
      const max = d.coneMax + (big ? 5 : 0);
      for (let i = 0; i < hits.length && i < max; i++) {
        const e = hits[i][1];
        if (e.dead) continue;
        const crit = g.rng() < critOf(g, h);
        damageEnemy(g, e, dmg * (big ? 1.6 : 1) * (crit ? g.mods.critMul : 1), crit, h, true);
        if (!e.dead && !e.boss) applyKnockback(e, d.kb * (big ? 3 : 1), g);
      }
      ev(g, 'cone', { hero: h.id, x: h.x, y: h.y - 30, a: ang, half, r: R, big });
      break;
    }
    case 'wave': {
      // 김도훈 마이크 음파: 둥글게 퍼져 근처 전부
      const R = heroRange(g, h, true);
      const hits = [];
      for (const e of g.enemies) {
        if (e.dead || e.y < -20) continue;
        const dd = Math.hypot(e.x - h.x, e.y - (h.y - 30));
        if (dd <= R + e.r) hits.push([dd, e]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < hits.length && i < d.waveMax; i++) {
        const e = hits[i][1];
        damageEnemy(g, e, dmg, false, h, true);
        if (!e.dead) { e.slowT = Math.max(e.slowT, d.slowSec); e.slowMul = Math.min(e.slowMul || 1, 1 - d.slow); }
      }
      ev(g, 'wave', { x: h.x, y: h.y - 30, r: R });
      break;
    }
    case 'dumbbell': {
      spawnLob(g, 'dumbbell', h, t, dmg, d.splash * (lv >= 5 ? 1.3 : 1) * (g.mapFx.splash || 1), null);
      h.motoN++;
      if (h.motoN >= d.moto.every[lv - 1]) { h.motoN = 0; launchMoto(g, h, [0], 1); }
      break;
    }
    case 'snack':
      spawnProj(g, 'snack', h, t, dmg, { homing: true, pierce, slow: d.slow, slowSec: d.slowSec, spin: 9, r: 8 });
      break;
    case 'warn':
      spawnProj(g, 'warn', h, t, dmg, {
        homing: true, pierce, slow: d.slow, slowSec: d.slowSec,
        stunChance: lv >= 5 ? 0.3 : lv >= 3 ? 0.18 : 0, stunSec: 1, splash: lv >= 5 ? 70 : 0, splashSlow: lv >= 5,
      });
      break;
    case 'bullet': {
      // 건전남 새총: 먼 곳까지 빠른 단발, 치명타 잘 터짐
      const n = 1 + g.mods.gunExtra;
      const ang = d.lane ? -Math.PI / 2 : aimAngle(h, t, d.projSpeed); // 새총은 자기 줄 위로 똑바로
      const head = lv >= 5 && h.shots % 4 === 0;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.08;
        spawnProj(g, 'bullet', h, null, dmg, { angle: a, pierce: pierce + (lv >= 3 ? 1 : 0), critBonus: (d.critBonus || 0) + (lv >= 3 ? 0.1 : 0), r: 6, headshot: head && i === 0, big: head && i === 0 });
      }
      break;
    }
    case 'heart':
    case 'bottle': {
      // 포물선으로 던지는 폭탄 (건전녀 하트 · 최은옥 소주병)
      const r = d.splash * (d.proj === 'heart' && lv >= 3 ? 1.25 : 1) * (g.mapFx.splash || 1);
      spawnLob(g, d.proj, h, t, dmg, r, d.fire && h.rage ? d.fire : null);
      break;
    }
    case 'swear': {
      const [chance, sec] = d.stun[lv - 1];
      const bomb = lv >= 5 && h.shots % 4 === 0;
      spawnProj(g, 'swear', h, t, dmg * (bomb ? 1.3 : 1), {
        homing: true, pierce, stunChance: chance, stunSec: sec, swear: true, bounces: d.bounces[lv - 1],
        splash: bomb ? 64 : 0, splashStun: bomb, big: bomb, r: bomb ? 14 : 10,
      });
      break;
    }
    case 'cane': {
      const n = lv >= 5 ? 2 : 1;
      const ang = d.lane ? -Math.PI / 2 : aimAngle(h, t, d.projSpeed);
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.16;
        spawnProj(g, 'cane', h, null, dmg, {
          angle: a, pierce: Infinity, spin: 14, boomerang: lv >= 3, maxDist: d.range + 40, r: 16,
        });
      }
      break;
    }
    // (예전 방식 — 테스트·호환용)
    case 'wink':
      spawnProj(g, 'wink', h, t, dmg, { homing: true, pierce, kb: (d.knockback || [80])[lv - 1] || 80 });
      break;
  }
}

// 백인규 오토바이: 자기 줄(각도)로 쭉 — 줄에 있는 진상 전부 치고 밀어낸다
function launchMoto(g, h, angles, mulExtra) {
  const m = h.def.moto;
  for (const a of angles) {
    spawnProj(g, 'moto', h, null, heroDamage(g, h) * m.mul * mulExtra, { angle: -Math.PI / 2 + a, pierce: Infinity, r: m.w, speed: m.speed, motoKb: m.kb, maxDist: 900 });
  }
  ev(g, 'moto', { x: h.x, y: h.y, n: angles.length });
}
// 문동한: 가장 붐비는 세로줄에 두꺼운 빔
function lazyBurst(g, h) {
  const d = h.def, b = d.burst;
  const w = b.w[h.lv - 1];
  let bestX = h.x, bn = -1;
  for (let x = 30; x <= g.W - 30; x += 15) {
    let n = 0;
    for (const e of g.enemies) if (!e.dead && e.y > 0 && Math.abs(e.x - x) < w) n += e.boss ? 3 : 1;
    if (n > bn) { bn = n; bestX = x; }
  }
  const dmg = heroDamage(g, h) * b.mul * h.serious;
  for (const e of g.enemies) {
    if (e.dead || e.y < -30 || Math.abs(e.x - bestX) >= w + e.r * 0.5) continue;
    damageEnemy(g, e, dmg, false, h, true);
  }
  ev(g, 'burst', { x: bestX, w, hx: h.x, hy: h.y, big: h.serious > 1 });
  h.serious = 1;
  h.meter = 0;
}

// 포물선 폭탄: 떨어질 곳을 조금 예측해서 던진다
function spawnLob(g, type, h, t, dmg, r, fire) {
  const p = g._projPool.pop() || { hitIds: [] };
  const T = h.def.lobSec || 0.6;
  const vy = t.atRope || t.stunT > 0 ? 0 : t.speed * (t.slowT > 0 ? t.slowMul : 1);
  p.type = type; p.hero = h; p.dead = false; p.lob = true;
  p.sx = h.x; p.sy = h.y - 30; p.x = p.sx; p.y = p.sy;
  p.tx = t.x; p.ty = Math.min(t.y + vy * T, t.stopY || t.y);
  p.T = T; p.lt = 0; p.dmg = dmg; p.splash = r; p.fire = fire; p.rage = !!fire;
  p.target = null; p.homing = false; p.pierce = 0; p.r = 0; p.spin = 10; p.rot = 0; p.boomerang = false; p.returning = false;
  p.life = T + 1; p.dist = 0; p.big = false; p.headshot = false; p.bounces = 0; p.kb = 0; p.slow = 0; p.stunChance = 0; p.swear = false;
  p.hitIds.length = 0;
  g.projs.push(p);
  return p;
}
function landLob(g, p) {
  const h = p.hero;
  ev(g, 'splash', { x: p.tx, y: p.ty, r: p.splash, proj: p.type });
  forEnemiesNear(g, p.tx, p.ty, p.splash, (e) => {
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, e, p.dmg * (crit ? g.mods.critMul : 1), crit, h, true);
    return true;
  });
  if (p.fire) {
    const f = p.fire;
    const big = h.lv >= 3;
    g.pools.push({ x: p.tx, y: p.ty, r: f.r * (big ? 1.25 : 1), t: f.sec * (big ? 1.3 : 1), max: f.sec * (big ? 1.3 : 1), dps: p.dmg * f.dps, hero: h, tick: 0 });
  }
}
function updatePools(g, dt) {
  const list = g.pools;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    q.t -= dt;
    q.tick -= dt;
    if (q.tick <= 0) {
      q.tick += 0.25;
      forEnemiesNear(g, q.x, q.y, q.r, (e) => { damageEnemy(g, e, q.dps * 0.25, false, q.hero, true); return true; });
    }
    if (q.t > 0) list[j++] = q;
  }
  list.length = j;
}

function aimAngle(h, t, speed) {
  // 적의 이동을 조금 예측해서 조준
  const dx = t.x - h.x, dy = t.y - h.y;
  const tt = Math.sqrt(dx * dx + dy * dy) / speed;
  const vy = t.atRope || t.stunT > 0 ? 0 : t.speed * (t.slowT > 0 ? t.slowMul : 1) * (t.fleeing ? -1.4 : 1);
  return Math.atan2(t.y + vy * tt - h.y, t.x - h.x);
}

function spawnProj(g, type, h, target, dmg, o) {
  const p = g._projPool.pop() || { hitIds: [] };
  const sp = o.speed || h.def.projSpeed;
  let a = o.angle;
  if (a === undefined) a = Math.atan2(target.y - h.y, target.x - h.x) + (o.spread || 0);
  p.type = type; p.hero = h; p.dead = false;
  p.x = h.x; p.y = h.y - 30; p.sx = p.x; p.sy = p.y; // 머리 위에서 발사
  p.speed = sp; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
  p.dmg = dmg; p.target = target; p.tuid = target ? target.uid : 0;
  p.homing = !!o.homing; p.pierce = o.pierce || 0; p.r = o.r || 10;
  p.splash = o.splash || 0; p.splashSlow = !!o.splashSlow; p.big = !!o.big;
  p.slow = o.slow || 0; p.slowSec = o.slowSec || 0;
  p.stunChance = o.stunChance || 0; p.stunSec = o.stunSec || 0;
  p.kb = o.kb || 0; p.kbStun = o.kbStun || 0; p.critBonus = o.critBonus || 0;
  p.swear = !!o.swear; p.chain = !!o.chain; p.splashStun = !!o.splashStun; p.bounces = o.bounces || 0; p.headshot = !!o.headshot;
  p.lob = false; p.fire = null; p.motoKb = o.motoKb || 0;
  p.spin = o.spin || 0; p.rot = a; p.boomerang = !!o.boomerang; p.returning = false;
  p.maxDist = o.maxDist || 9999; p.dist = 0; p.life = 3.2; p.rage = !!o.rage;
  p.hitIds.length = 0;
  g.projs.push(p);
  return p;
}

// ─── 적 ───────────────────────────────────────────────
export function spawnEnemy(g, type, x, y, o = {}) {
  const def = ENEMIES[type];
  if (g.seen) g.seen[type] = 1; // 도감: 이번 판에 만난 진상
  const e = g._enemyPool.pop() || {};
  const m = (o.hpMul || hpMul(Math.max(1, g.diff), g.mode === 'stage') * (g.hpScale || 1)) * (def.boss && g.mode === 'stage' ? RULES.stageBossHp : 1);
  e.uid = g.uid++; e.type = type; e.def = def; e.boss = !!def.boss; e.gender = def.gender;
  const lane = g.mapFx.lane;
  e.x = x !== undefined ? x : lane ? lane[0] + g.rng() * (lane[1] - lane[0]) : 24 + g.rng() * (g.W - 48);
  if (lane && !def.boss) e.x = clamp(e.x, lane[0], lane[1]);
  e.y = y !== undefined ? y : FIELD.spawnY - g.rng() * 10;
  e.baseX = e.x; e.phase = g.rng() * 6.28;
  e.maxHp = e.hp = def.hp * m; e.shield = 0;
  e.speed = def.speed * (0.92 + g.rng() * 0.16) * g.mods.enemySpd * (g.mapFx.enemySpd || 1); e.atk = def.atk * atkMul(Math.max(1, g.diff), g.mode === 'stage');
  e.atkCd = 0.4; e.slowT = 0; e.slowMul = 1; e.stunT = 0; e.kbv = 0; e.flash = 0;
  e.dead = false; e.atRope = false; e.fleeing = false; e.stolen = 0; e.charmCd = 0;
  e.abT = def.slam ? def.slam.every * 0.6 : def.summon ? 3 : 0; e.abT2 = def.shieldAura ? def.shieldAura.first || 5 : 0; e.windup = 0;
  e.interestT = def.interest ? def.interest.every : 0; e.interestN = 0; e.loanTaken = 0; e.paperT = def.paper ? 2.5 : 0;
  e.phaseI = -1; e.phaseT = 0; e.auraOn = false;
  e.pukeT = def.puke ? 2 + g.rng() * 2 : 0; e.hurtT = 9; e.split = false; e.grabbing = null; e.grabCd = 0;
  e.weakT = 0;
  e.gaoOn = !!def.gao; e.flashT = def.flash ? 2 + g.rng() * 2 : 0; e.vaulted = false; e.jumpT = 0; e.latteOffT = 0;
  e.spamT = def.spam ? 3 + g.rng() * 3 : 0; e.flexT = 0; e.puddleT = 0;
  e.kneelT = def.kneel ? def.kneel.every * 0.5 : 0; e.duckT = def.duck ? 2 : 0; e.feastT = def.feast ? def.feast.every * 0.6 : 0;
  e.rumorT = def.rumor ? 1 + g.rng() * 1.5 : 0;
  e.dictT = 0; e.dictCut = 0; e.dictKb = 1; e.dictSpd = 1; e.packN = 0; e.kbAge = 99; e.kbMul = 1; e.kbMinY = -1e9;
  e.form = def.scam ? 'pretty' : null; e.formT = def.scam ? def.scam.prettySec * (0.8 + g.rng() * 0.4) : 0; e.nextForm = null;
  e.baseSpeed = e.speed; e.baseAtk = e.atk;
  e.r = def.r; e.armor = def.armor || 0; e.age = 0; e.hitT = 0;
  e.stopY = def.standoff ? g.ropeY - def.standoff - g.rng() * 24 : g.ropeY - (e.boss ? 16 : 4 + g.rng() * 16);
  g.enemies.push(e);
  if (e.boss) g.bossAlive++;
  return e;
}

// 적에게 피해. (독재자 오라 · 패거리 뭉치기 · 들켰다 배율) → 방어력 → 보호막 → 체력 순
// aoe: 범위/관통 공격 — 패거리 뭉치기를 무시한다
export function damageEnemy(g, e, dmg, crit, src, aoe, flank) {
  if (e.dead) return 0;
  // 속성 상성: 효과 굉장! ×1.5 / 별로… ×0.7
  if (src && src.def && src.def.attr && !g.noTypes) {
    const m = typeMul(src.def.attr, e.def.cls);
    if (m !== 1) {
      dmg *= m * (m > 1 ? 1 + (src.gear && src.gear.attr ? src.gear.attr : 0) : 1);
      if (g.t - g.effT > 0.8) { g.effT = g.t; ev(g, 'eff', { x: e.x, y: e.y - e.def.size * 0.75, strong: m > 1 }); }
    }
  }
  if (e.dictT > 0) dmg *= 1 - e.dictCut;
  if (e.packN > 0 && !aoe) { const pk = e.def.pack; dmg *= 1 - Math.min(pk.maxCut, pk.cut * e.packN); }
  if (e.form === 'reveal') dmg *= e.def.scam.revealDmg;
  if (e.weakT > 0) dmg *= 1.5; // 보스 빈틈!
  // 장비 '버프 벗기기': 보호막 · 독재자 버프 · 가오를 벗긴다
  if (src && src.gear && src.gear.strip && (e.shield > 0 || e.dictT > 0 || e.gaoOn) && g.rng() < src.gear.strip) {
    e.shield = 0; e.dictT = 0; if (e.gaoOn) e.gaoOn = false;
    ev(g, 'strip', { x: e.x, y: e.y - e.def.size * 0.7 });
  }
  // 셀카 플래시에 눈부신 멤버는 절반쯤 빗나간다
  if (src && src.blindT > 0 && g.rng() < ENEMIES.selfie.flash.miss) {
    if (g.t - (g.missT || -9) > 0.5) { g.missT = g.t; ev(g, 'miss', { x: e.x, y: e.y - e.def.size * 0.6 }); }
    return 0;
  }
  // 가오충: 가오 중엔 단단하다. 말빨 공격이나 치명타 한 방이면 "가오 깨짐!"
  if (e.def.gao) {
    if (e.gaoOn && src && ((src.def && src.def.attr === 'talk') || crit)) { e.gaoOn = false; ev(g, 'gaoBreak', { x: e.x, y: e.y - e.def.size * 0.7 }); }
    dmg *= e.gaoOn ? (flank ? 1 : 1 - e.def.gao.cut) : e.def.gao.broken; // 옆에서 베면(김영준) 가오 무시
  }
  e.hurtT = 0;
  if (e.armor) dmg = Math.max(dmg * 0.35, dmg - e.armor);
  const shown = dmg;
  if (e.shield > 0) {
    const a = Math.min(e.shield, dmg);
    e.shield -= a;
    dmg -= a;
  }
  e.hp -= dmg;
  e.flash = 0.09;
  g.stats.damage += dmg;
  if (src) src.dmgDone += dmg;
  ev(g, 'dmg', { x: e.x, y: e.y - e.def.size * 0.55, v: Math.round(shown), crit: !!crit, shield: dmg < shown });
  if (e.hp <= 0) killEnemy(g, e, src);
  else if (e.def.breakup && !e.split && e.hp < e.maxHp * e.def.breakup.at) breakUp(g, e);
  return shown;
}

function killEnemy(g, e, src) {
  e.dead = true;
  const def = e.def;
  const s = g.stats;
  s.kills++;
  if (src) src.kills++;
  g.combo++;
  g.comboT = RULES.comboWindow;
  if (g.combo > s.maxCombo) s.maxCombo = g.combo;
  s.score += SCORE.kill + Math.min(g.combo, SCORE.comboCap);
  // 경험치 보석 (떨어진 뒤 잠깐 튀었다가 저절로 경험치 바로 날아간다)
  const xp = def.exp * g.mods.expMul;
  if (e.boss) {
    for (let i = 0; i < 10; i++) dropGem(g, e.x + (g.rng() - 0.5) * 80, e.y + (g.rng() - 0.5) * 60, xp / 10);
  } else dropGem(g, e.x, e.y, xp);
  // 먹튀가 훔쳐 간 경험치 되찾기
  if (e.stolen) {
    dropGem(g, e.x, e.y, e.stolen);
    s.stolen -= e.stolen;
    ev(g, 'recover', { x: e.x, y: e.y, v: Math.round(e.stolen) });
    e.stolen = 0;
  }
  g.ult = Math.min(RULES.ultMax, g.ult + (e.boss ? RULES.ultPerBoss : RULES.ultPerKill) * g.mods.ultCharge);
  if (e.boss) {
    g.bossAlive--;
    s.bossKills++;
    s.score += SCORE.boss;
    ev(g, 'bossKill', { x: e.x, y: e.y, enemy: e.type, name: def.name });
  }
  if (def.explode) g._boom.push(e.x, e.y);
  if (def.deathPuddle) g.puddles.push({ x: e.x, y: e.y + 10, r: def.deathPuddle.r, t: def.deathPuddle.sec, max: def.deathPuddle.sec, enemy: true });
  if (def.spam) spamDots(g, e, def.spam.burst);
  if (e.grabbing) { const h = e.grabbing; if (h.grabBy === e.uid) { h.grabT = 0; h.grabBy = 0; ev(g, 'release', { x: h.x, y: h.y }); } e.grabbing = null; }
  // 사채업자를 잡으면 떼어 간 이자 일부를 돌려받는다
  if (def.interest && e.loanTaken > 0 && !g.over) {
    const back = Math.min(g.base.max - g.base.hp, e.loanTaken * def.interest.refund);
    g.base.hp += back;
    ev(g, 'debtFree', { x: e.x, y: e.y, v: Math.round(back) });
  }
  ev(g, 'kill', { x: e.x, y: e.y, enemy: e.type, boss: e.boss });
  if (e.boss || g.rng() < 0.12) ev(g, 'shout', { x: e.x, y: e.y - def.size * 0.6, text: def.shouts[(g.rng() * def.shouts.length) | 0] });
  if (g.focus === e) g.focus = null;
}

function explode(g, x, y) {
  const ex = ENEMIES.drunk.explode;
  const dmg = ex.dmg * (1 + 0.08 * (g.diff - 1));
  ev(g, 'explode', { x, y, r: ex.r });
  forEnemiesNear(g, x, y, ex.r, (e) => damageEnemy(g, e, dmg, false, null, true));
}

function damageBase(g, dmg, e) {
  if (g.over || g.god) return;
  const tank = g.heroes.find((h) => h.def.guard);
  if (tank && e && Math.abs(e.x - tank.x) < tank.def.guard.r) dmg *= 1 - tank.def.guard.cut;
  g.base.hp -= dmg;
  if (dmg > 0) g.baseHit = true;
  ev(g, 'baseHit', { x: e.x, y: g.ropeY, v: Math.round(dmg), boss: e.boss });
  if (g.base.hp <= 0) {
    g.base.hp = 0;
    g.over = true;
    g.phase = 'over';
    ev(g, 'gameover', {});
  }
}

function updateEnemies(g, dt) {
  const W = g.W;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const def = e.def;
    e.age += dt;
    e.kbAge += dt;
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.charmCd > 0) e.charmCd -= dt;
    if (e.kbv) {
      e.y += e.kbv * dt;
      e.kbv *= Math.exp(-7 * dt);
      if (e.y < e.kbMinY) { e.y = e.kbMinY; e.kbv = 0; }
      if (Math.abs(e.kbv) < 6) e.kbv = 0;
      if (e.y < e.stopY - 2) e.atRope = false;
    }
    if (e.dictT > 0) e.dictT -= dt;
    e.hurtT += dt;
    if (e.weakT > 0) e.weakT -= dt;
    if (e.flexT > 0) e.flexT -= dt;
    if (e.puddleT > 0) e.puddleT -= dt;
    if (e.latteOffT > 0) e.latteOffT -= dt;
    if (def.latte && e.stunT > 0) e.latteOffT = def.latte.off; // 기절시키면 꼰대가 조용해진다
    // 애정행각: 안 맞고 있으면 꽁냥꽁냥 회복
    if (def.cuddle && e.hurtT > def.cuddle.idle && e.hp < e.maxHp) {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * def.cuddle.regen * dt);
      if ((e.age * 2 | 0) !== ((e.age - dt) * 2 | 0) && g.rng() < 0.25) ev(g, 'cuddle', { x: e.x, y: e.y - def.size * 0.7 });
    }
    // 손진상: 붙잡은 멤버가 풀렸으면 다시 기회를 본다
    if (e.grabbing && (e.grabbing.grabBy !== e.uid || e.grabbing.grabT <= 0)) { e.grabbing = null; e.grabCd = def.grab.cd; }
    if (e.grabCd > 0) e.grabCd -= dt;
    // 새치기꾼: 앞줄 근처에서 한 번 훌쩍
    if (e.jumpT > 0) {
      e.jumpT -= dt;
      e.y += (def.vault.dist / def.vault.sec) * dt;
      if (e.y >= e.stopY) { e.y = e.stopY; e.atRope = true; e.jumpT = 0; }
      continue;
    }
    // 가입인사 사기꾼: 예쁜 프사 → 들켰다! → 실물(못생김/뚱뚱) → 들켰다! → 예쁜 프사 …
    if (def.scam) updateScammer(g, e, dt);
    if (e.stunT > 0) { e.stunT -= dt; continue; }
    if (def.vault && !e.vaulted && !e.atRope && e.y > g.ropeY - def.vault.at && e.stunT <= 0) {
      e.vaulted = true; e.jumpT = def.vault.sec; e.kbv = 0;
      ev(g, 'vault', { x: e.x, y: e.y - def.size * 0.6 });
      continue;
    }
    // 토하는 인간: 멤버 발밑에 토
    if (def.puke && e.y > g.ropeY - def.puke.reach) {
      e.pukeT -= dt;
      if (e.pukeT <= 0 && g.heroes.length) {
        e.pukeT = def.puke.every;
        const h = g.heroes[(g.rng() * g.heroes.length) | 0];
        g.puddles.push({ x: h.x, y: g.rowY + 18, r: def.puke.r, t: def.puke.sec, max: def.puke.sec, enemy: false });
        ev(g, 'puke', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y });
      }
    }
    // 셀카 인플루언서: 찰칵! 눈부심
    if (def.flash && e.atRope) {
      e.flashT -= dt;
      if (e.flashT <= 0 && g.heroes.length) {
        e.flashT = def.flash.every;
        const fresh = g.heroes.filter((h) => h.blindT <= 0);
        const h = victim(g, fresh.length ? fresh : g.heroes);
        h.blindT = debuffSec(h, def.flash.sec);
        ev(g, 'flash', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y });
      }
    }
    // 단톡방 빌런: 가끔 "카톡!" 알림
    if (def.spam && e.y > 30) {
      e.spamT -= dt;
      if (e.spamT <= 0) { e.spamT = def.spam.every; spamDots(g, e, 1); }
    }
    // 진상 연합 회장: 8초마다 다른 악당 기술로
    if (def.phases && e.y > 40) {
      e.phaseT -= dt;
      if (e.phaseT <= 0) {
        e.phaseI = (e.phaseI + 1) % def.phases.length;
        e.phaseT = def.phaseSec;
        e.kneelT = 0.8; e.feastT = 1; e.interestT = 1.2; e.abT2 = 0.6;
        ev(g, 'unionPhase', { x: e.x, y: e.y, phase: def.phases[e.phaseI] });
      }
    }
    // 골목 사채업자: 이자 + 차용증
    if (on(e, 'interest') && e.y > 60) {
      e.interestT -= dt;
      if (e.interestT <= 0) {
        const it = def.interest;
        e.interestT = it.every;
        const frac = Math.min(it.max, it.frac + it.grow * e.interestN++);
        const amt = Math.min(g.base.hp - 1, g.base.max * frac);
        if (amt > 0 && !g.god) { e.loanTaken += amt; damageBase(g, amt, e); }
        ev(g, 'interest', { x: e.x, y: e.y, v: Math.round(amt), pct: Math.round(frac * 100) });
      }
    }
    if (def.paper && e.y > 60) {
      e.paperT -= dt;
      if (e.paperT <= 0 && g.heroes.length) {
        e.paperT = def.paper.every;
        const fresh = g.heroes.filter((h) => h.paperT <= 0);
        const list = fresh.length ? fresh : g.heroes;
        throwAt(g, 'paper', e, victim(g, list), def.paper.fly);
      }
    }
    // 인피 행동대장: "무릎 꿇어!" 멤버 1명 기절
    if (on(e, 'kneel') && e.y > 60) {
      e.kneelT -= dt;
      if (e.kneelT <= 0) {
        e.kneelT = def.kneel.every;
        const hs = g.heroes.filter((h) => h.stunT <= 0);
        if (hs.length) {
          const h = victim(g, hs);
          h.stunT = Math.max(h.stunT, debuffSec(h, def.kneel.stun));
          ev(g, 'kneel', { hero: h.id, x: h.x, y: h.y, ex: e.x, ey: e.y });
          bossWeak(g, e);
        }
      }
    }
    // 인피 대장: 오리고기 투척 · 오리고기 회식
    if (def.duck && e.y > 40) {
      e.duckT -= dt;
      if (e.duckT <= 0 && g.heroes.length) {
        e.duckT = def.duck.every;
        const h = victim(g, g.heroes);
        throwAt(g, 'duck', e, h, def.duck.fly);
        ev(g, 'duckThrow', { x: e.x, y: e.y });
      }
    }
    if (on(e, 'feast') && e.y > 40) {
      e.feastT -= dt;
      if (e.feastT <= 0) {
        e.feastT = def.feast.every;
        let n = 0;
        forEnemiesNear(g, e.x, e.y, def.feast.r, (o) => {
          if (o.dead) return true;
          const heal = o.maxHp * (o === e ? def.feast.heal * 0.2 : def.feast.heal);
          if (o.hp < o.maxHp) { o.hp = Math.min(o.maxHp, o.hp + heal); n++; }
          return true;
        });
        ev(g, 'feast', { x: e.x, y: e.y, r: def.feast.r, n });
        bossWeak(g, e);
      }
    }
    // 보스 기술
    if (def.slam && e.y > 150) {
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          for (const h of g.heroes) h.stunT = Math.max(h.stunT, def.slam.stun);
          ev(g, 'slam', { x: e.x, y: e.y });
          bossWeak(g, e);
          e.abT = def.slam.every;
        }
        continue;
      }
      e.abT -= dt;
      if (e.abT <= 0) { e.windup = def.slam.windup; ev(g, 'windup', { x: e.x, y: e.y }); }
    }
    if (def.summon && e.y > 20) {
      e.abT -= dt;
      if (e.abT <= 0) {
        e.abT = def.summon.every;
        const n = def.summon.count;
        for (let i = 0; i < n; i++) {
          const t = def.summon.types[i % def.summon.types.length];
          spawnEnemy(g, t, clamp(e.x + (i - (n - 1) / 2) * 34, 18, W - 18), e.y + 20 + g.rng() * 10, { hpMul: hpMul(g.diff) * 0.8 });
        }
        ev(g, 'summon', { x: e.x, y: e.y });
        bossWeak(g, e);
      }
    }
    // 보호막: 여왕벌 · 인피 총무("회비 지원!") · 연합 회장
    if (on(e, 'shieldAura') && e.y > 20) {
      e.abT2 -= dt;
      if (e.abT2 <= 0) {
        e.abT2 = def.shieldAura.every;
        const sa = def.shieldAura;
        let n = 0;
        for (const o of g.enemies) {
          if (o.dead || o.boss || o === e) continue;
          const dx = o.x - e.x, dy = o.y - e.y;
          if (dx * dx + dy * dy < sa.r * sa.r) { o.shield = Math.max(o.shield, o.maxHp * sa.frac); n++; }
        }
        ev(g, 'shield', { x: e.x, y: e.y, r: sa.r, n, enemy: e.type });
      }
    }
    // 먹튀: 코인 들고 도망
    if (e.fleeing) {
      e.y -= e.speed * 1.4 * dt;
      if (e.y < -60) {
        e.dead = true;
        ev(g, 'escape', { x: e.x, y: 0, v: Math.round(e.stolen) });
      }
      continue;
    }
    if (e.form === 'reveal') { if (e.hitT > 0) e.hitT -= dt; continue; } // 들켰다! 제자리에서 허둥지둥
    if (!e.atRope) {
      const sp = e.speed * (e.slowT > 0 ? e.slowMul : 1) * (e.dictT > 0 ? e.dictSpd : 1) * (g.megaT > 0 ? g.mapFx.speed : 1)
        * (e.flexT > 0 ? ENEMIES.gao.gao.flexSpd : 1) * (e.puddleT > 0 ? ENEMIES.vomit.deathPuddle.speed : 1);
      e.y += sp * dt;
      if (def.zigzag) e.x = clamp(e.baseX + Math.sin(e.age * 2.3 + e.phase) * def.zigzag, g.mapFx.lane ? g.mapFx.lane[0] : 16, g.mapFx.lane ? g.mapFx.lane[1] : W - 16);
      if (e.y >= e.stopY) { e.y = e.stopY; e.atRope = true; e.atkCd = 0.25; }
    }
    // 홀림: 꼬충이 가까이 오면 반대 성별 영웅을 홀린다
    if (def.charm && e.charmCd <= 0 && e.y > g.ropeY - RULES.charmRange) {
      e.charmCd = RULES.charmCooldown;
      tryCharm(g, e);
    }
    // 인피 뒷담러: 멀찍이 서서 뒷담화 말풍선을 던진다 (입구는 안 두드림)
    if (def.standoff) {
      if (e.atRope && def.rumor) {
        e.rumorT -= dt;
        if (e.rumorT <= 0 && g.heroes.length) {
          e.rumorT = def.rumor.every * (0.85 + g.rng() * 0.3);
          const fresh = g.heroes.filter((h) => h.rumorT <= 0);
          const list = fresh.length ? fresh : g.heroes;
          throwAt(g, 'rumor', e, victim(g, list), def.rumor.fly);
          ev(g, 'rumor', { x: e.x, y: e.y - def.size * 0.6 });
        }
      }
      if (e.hitT > 0) e.hitT -= dt;
      continue;
    }
    if (e.atRope) {
      // 손진상: 로프에 닿으면 멤버를 붙잡는다
      if (def.grab && !e.grabbing && e.grabCd <= 0) {
        const free = g.heroes.filter((h) => h.grabT <= 0);
        if (free.length) {
          let h = free[0];
          for (const o of free) if (Math.abs(o.x - e.x) < Math.abs(h.x - e.x)) h = o;
          h = victim(g, free, h);
          h.grabT = debuffSec(h, def.grab.sec); h.grabBy = e.uid; e.grabbing = h;
          ev(g, 'grab', { x: e.x, y: e.y, hx: h.x, hy: h.y, hero: h.id });
        }
      }
      if (def.steal) {
        // 경험치를 훔쳐 도망 — 잡으면 보석으로 돌려받는다
        const amt = Math.round(def.steal.base + def.steal.perLevel * g.diff);
        const v = Math.max(0, Math.min(Math.floor(g.exp), amt));
        g.exp -= v;
        g.stats.stolen += v;
        e.stolen = v;
        e.fleeing = true;
        e.atRope = false;
        ev(g, 'steal', { x: e.x, y: e.y, v });
        damageBase(g, e.atk, e);
        continue;
      }
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = def.atkInterval;
        e.hitT = 0.25;
        damageBase(g, e.atk, e);
      }
    }
    if (e.hitT > 0) e.hitT -= dt;
  }
}

function updateScammer(g, e, dt) {
  const sc = e.def.scam;
  e.formT -= dt;
  if (e.formT > 0) return;
  if (e.form === 'reveal') {
    setForm(e, e.nextForm, sc);
    e.formT = e.form === 'pretty' ? sc.prettySec : sc.realSec;
    ev(g, 'form', { x: e.x, y: e.y, form: e.form });
  } else {
    e.nextForm = e.form === 'pretty' ? (g.rng() < 0.5 ? 'ugly' : 'fat') : 'pretty';
    if (e.form === 'fat') setForm(e, 'plain', sc); // 뚱뚱 해제 (체력 비율 유지)
    e.form = 'reveal';
    e.formT = sc.revealSec;
    ev(g, 'reveal', { x: e.x, y: e.y - e.def.size * 0.7, next: e.nextForm });
  }
}
function setForm(e, form, sc) {
  if (e.fat) {
    const f = e.hp / e.maxHp;
    e.maxHp /= sc.fatHp; e.hp = e.maxHp * f; e.armor = e.def.armor || 0;
    e.speed = e.baseSpeed; e.atk = e.baseAtk; e.fat = false;
  }
  if (form === 'plain') return;
  e.form = form;
  if (form === 'fat') {
    const f = e.hp / e.maxHp;
    e.maxHp *= sc.fatHp; e.hp = e.maxHp * f; e.armor = sc.fatArmor;
    e.speed = e.baseSpeed * sc.fatSpeed; e.atk = e.baseAtk * sc.fatAtk; e.fat = true;
  } else if (form === 'ugly') e.speed = e.baseSpeed * 0.8;
  else e.speed = e.baseSpeed;
}

// 적이 영웅에게 던지는 것 (뒷담화 말풍선 · 오리고기) — 날아가는 동안은 연출, 도착하면 효과
function throwAt(g, kind, e, h, dur) {
  const top = e.y - e.def.size * 0.5;
  g.eprojs.push({ kind, sx: e.x, sy: top, tx: h.x, ty: h.y - 30, x: e.x, y: top, t: 0, dur, hero: h });
}
function updateEprojs(g, dt) {
  const list = g.eprojs;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    p.t += dt;
    const k = Math.min(1, p.t / p.dur);
    p.x = p.sx + (p.tx - p.sx) * k;
    p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 50;
    if (k < 1) { list[j++] = p; continue; }
    const h = p.hero;
    if (p.kind === 'paper') {
      h.paperT = Math.max(h.paperT, debuffSec(h, ENEMIES.boss_loan.paper.sec));
      ev(g, 'paperHit', { hero: h.id, x: h.x, y: h.y });
    } else if (p.kind === 'rumor') {
      const r = ENEMIES.inpi_gossip.rumor;
      h.rumorT = Math.max(h.rumorT, debuffSec(h, r.sec));
      ev(g, 'rumorHit', { hero: h.id, x: h.x, y: h.y });
    } else if (p.kind === 'duck') {
      h.stunT = Math.max(h.stunT, debuffSec(h, ENEMIES.boss_inpi.duck.stun));
      ev(g, 'duckHit', { hero: h.id, x: h.x, y: h.y });
    }
  }
  list.length = j;
}

// 오라·뭉치기·유혹·공포: 매 스텝 주변을 다시 센다
function updateAuras(g) {
  g.flirt = false;
  // 토 웅덩이: 멤버 쪽은 공속↓, 진상 쪽(죽은 토하는 인간)은 진상 가속
  if (g.puddles.length) {
    let j = 0;
    for (const q of g.puddles) {
      q.t -= 1 / 60;
      if (q.t <= 0) continue;
      g.puddles[j++] = q;
      if (q.enemy) forEnemiesNear(g, q.x, q.y, q.r, (e) => { e.puddleT = 0.2; return true; });
      else for (const h of g.heroes) if (Math.abs(h.x - q.x) < q.r) h.vomitT = Math.max(h.vomitT, 0.2);
    }
    g.puddles.length = j;
  }
  for (const e of g.enemies) {
    if (e.dead) continue;
    const def = e.def;
    e.auraOn = !!def.aura && on(e, 'aura');
    if (e.auraOn) {
      const a = def.aura;
      forEnemiesNear(g, e.x, e.y, a.r, (o) => {
        if (o === e || o.boss || o.dead) return true;
        o.dictT = 0.2; o.dictCut = a.cut; o.dictKb = a.kb; o.dictSpd = a.speed;
        return true;
      });
    } else if (def.gao && e.gaoOn) {
      forEnemiesNear(g, e.x, e.y, def.gao.flexR, (o) => { if (o !== e && !o.boss) o.flexT = 0.2; return true; });
    } else if (def.latte && e.latteOffT <= 0 && e.y > 0) {
      const r2 = def.latte.r * def.latte.r;
      for (const h of g.heroes) { const dx = h.x - e.x, dy = h.y - e.y; if (dx * dx + dy * dy < r2 && !h.def.taunt) h.drowsyT = 0.2; } // 백인규는 "운동 루틴"으로 안 졸림
    } else if (def.pack) {
      let n = 0;
      forEnemiesNear(g, e.x, e.y, def.pack.r, (o) => { if (o !== e && o.def.pack && !o.dead) n++; return true; });
      e.packN = n;
    } else if (e.form === 'pretty' && e.y > g.ropeY - def.scam.flirtRange) g.flirt = true;
    else if (e.form === 'ugly') {
      const r2 = def.scam.fearR * def.scam.fearR;
      for (const h of g.heroes) {
        const dx = h.x - e.x, dy = h.y - e.y;
        if (dx * dx + dy * dy < r2) h.fearT = 0.2;
      }
    }
  }
}

// 이 적이 지금 그 기술을 쓰는지 (연합 회장은 단계마다 하나씩)
function on(e, k) {
  const d = e.def;
  return !!d[k] && (!d.phases || d.phases[e.phaseI] === k);
}

// 애정행각 빌런 "헤어져!" → 빠른 솔로 둘로
function breakUp(g, e) {
  const b = e.def.breakup;
  e.split = true;
  const hp = e.maxHp * b.hp;
  for (const [t, dx] of [['yeokko', -16], ['namkko', 16]]) {
    const o = spawnEnemy(g, t, clamp(e.x + dx, 16, g.W - 16), e.y, { hpMul: hp / ENEMIES[t].hp });
    o.speed *= b.speed;
  }
  ev(g, 'breakup', { x: e.x, y: e.y - e.def.size * 0.7 });
  e.dead = true; // 커플은 사라지고 (처치 수·경험치 없음) 둘이 흩어진다
  if (g.focus === e) g.focus = null;
}
// 단톡방 알림 (작은 빨간 점) 튀어나오기
function spamDots(g, e, n) {
  for (let i = 0; i < n; i++) {
    const o = spawnEnemy(g, 'spam_dot', clamp(e.x + (i - (n - 1) / 2) * 22, 14, g.W - 14), e.y + 6, { hpMul: hpMul(g.diff, g.mode === 'stage') });
    o.stopY = g.ropeY - 4 - g.rng() * 10;
  }
  ev(g, 'spam', { x: e.x, y: e.y - e.def.size * 0.6, n });
}

// 멤버를 노리는 진상 기술: 탱커(백인규)가 있으면 그쪽으로
function victim(g, list, dflt) {
  const t = list.find((h) => h.def.taunt);
  if (t) return t;
  const inRow = list.filter((h) => !h.out);
  const pool = inRow.length ? inRow : list;
  return dflt && !dflt.out ? dflt : pool[(g.rng() * pool.length) | 0];
}
function debuffSec(h, sec) { return h.def.taunt ? sec * h.def.taunt : sec; }

// 보스가 큰 기술을 쓴 직후 2.5초 "빈틈!" — 받는 피해 1.5배
function bossWeak(g, e) {
  if (!e.boss) return;
  e.weakT = RULES.bossWeakSec;
  ev(g, 'weak', { x: e.x, y: e.y - e.def.size * 0.8 });
}

function tryCharm(g, e) {
  const want = e.def.charm;
  const cands = g.heroes.filter((h) => h.def.gender === want && h.charmT <= 0);
  if (!cands.length) return;
  const h = cands[(g.rng() * cands.length) | 0];
  const g5 = g.heroes.find((x) => x.id === 'gunnyeo' && x.lv >= 5);
  if (g5) { ev(g, 'charmBlock', { x: h.x, y: h.y, ex: e.x, ey: e.y }); return; }
  h.charmT = RULES.charmSec * g.mods.charmMul;
  ev(g, 'charm', { hero: h.id, x: h.x, y: h.y, ex: e.x, ey: e.y });
}

// ─── 충돌용 격자 ──────────────────────────────────────
const CELL = 40;
function buildGrid(g) {
  const cols = Math.ceil((g.W + 80) / CELL);
  const rows = Math.ceil((g.H + 200) / CELL);
  if (!g._grid || g._grid.cols !== cols || g._grid.rows !== rows) {
    const cells = [];
    for (let i = 0; i < cols * rows; i++) cells.push([]);
    g._grid = { cols, rows, cells };
  }
  const G = g._grid;
  for (const c of G.cells) c.length = 0;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const cx = clamp(((e.x + 40) / CELL) | 0, 0, cols - 1);
    const cy = clamp(((e.y + 120) / CELL) | 0, 0, rows - 1);
    G.cells[cx + cy * cols].push(e);
  }
}
export function forEnemiesNear(g, x, y, r, fn) {
  const G = g._grid;
  if (!G) buildGrid(g);
  const { cols, rows, cells } = g._grid;
  const R = r + 48; // 적 반지름 여유
  const x0 = clamp(((x - R + 40) / CELL) | 0, 0, cols - 1), x1 = clamp(((x + R + 40) / CELL) | 0, 0, cols - 1);
  const y0 = clamp(((y - R + 120) / CELL) | 0, 0, rows - 1), y1 = clamp(((y + R + 120) / CELL) | 0, 0, rows - 1);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const cell = cells[cx + cy * cols];
      for (let i = 0; i < cell.length; i++) {
        const e = cell[i];
        if (e.dead) continue;
        const dx = e.x - x, dy = e.y - y, rr = r + e.r;
        if (dx * dx + dy * dy <= rr * rr) { if (fn(e) === false) return; }
      }
    }
  }
}

// ─── 투사체 ───────────────────────────────────────────
function updateProjs(g, dt) {
  const W = g.W, H = g.H;
  const list = g.projs;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.dead) continue;
    if (p.lob) {
      p.lt += dt;
      const k = Math.min(1, p.lt / p.T);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * 70;
      p.rot += p.spin * dt;
      if (k >= 1) { landLob(g, p); p.dead = true; }
      continue;
    }
    p.life -= dt;
    if (p.homing && p.target) {
      const t = p.target;
      if (!t.dead && t.uid === p.tuid) {
        const dx = t.x - p.x, dy = t.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        // 부드러운 유도
        const k = Math.min(1, dt * 14);
        p.vx += ((dx / d) * p.speed - p.vx) * k;
        p.vy += ((dy / d) * p.speed - p.vy) * k;
      } else p.target = null;
    }
    if (p.boomerang) {
      if (!p.returning && p.dist > p.maxDist) { p.returning = true; p.hitIds.length = 0; }
      if (p.returning) {
        const h = p.hero;
        const dx = h.x - p.x, dy = h.y - p.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        p.vx = (dx / d) * p.speed * 1.15;
        p.vy = (dy / d) * p.speed * 1.15;
        if (d < 22) { p.dead = true; continue; }
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.dist += p.speed * dt;
    if (p.spin) p.rot += p.spin * dt;
    else p.rot = Math.atan2(p.vy, p.vx);
    if (!p.returning && (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y < -90 || p.y > H + 20)) {
      if (p.boomerang && p.life > 0) { p.returning = true; p.hitIds.length = 0; } else { p.dead = true; continue; }
    }
    if (p.returning && p.life <= -2) { p.dead = true; continue; }
    forEnemiesNear(g, p.x, p.y, p.r, (e) => {
      if (p.hitIds.includes(e.uid)) return true;
      hitEnemy(g, p, e);
      return !p.dead;
    });
  }
  // 죽은 투사체 정리 → 풀로 반납
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.dead) { p.target = null; p.hero = null; g._projPool.push(p); } else list[j++] = p;
  }
  list.length = j;
}

function stunMul(e) { return e.form === 'reveal' ? e.def.scam.revealStun : 1; }
export function hitEnemy(g, p, e) {
  const h = p.hero;
  p.hitIds.push(e.uid);
  // 예쁜 프사 사기꾼은 가끔 쏙 피한다
  if (e.form === 'pretty' && g.rng() < e.def.scam.evade) {
    ev(g, 'miss', { x: e.x, y: e.y - e.def.size * 0.6 });
    if (p.homing) { p.homing = false; p.target = null; }
    return;
  }
  const crit = p.headshot || g.rng() < critOf(g, h) + p.critBonus;
  let dmg = p.dmg * (p.headshot ? 3 : crit ? g.mods.critMul : 1);
  if (p.swear) {
    // 서명훈: 기절한 적 · 들킨 사기꾼에게 더 아프게
    if (e.stunT > 0) dmg *= h.def.stunnedBonus[h.lv - 1];
    if (e.form === 'reveal') dmg *= h.def.revealBonus;
  }
  ev(g, 'hit', { x: p.x, y: p.y, proj: p.type, crit });
  damageEnemy(g, e, dmg, crit, h, p.pierce > 0 || p.type === 'cane');
  if (p.slow && !e.boss) { e.slowT = Math.max(e.slowT, p.slowSec); e.slowMul = 1 - p.slow; }
  else if (p.slow) { e.slowT = Math.max(e.slowT, p.slowSec * 0.5); e.slowMul = 1 - p.slow * 0.5; }
  if (p.stunChance && !e.dead && !e.boss && g.rng() < p.stunChance) {
    e.stunT = Math.max(e.stunT, p.stunSec * stunMul(e));
    ev(g, p.swear ? 'freeze' : 'kick', { x: e.x, y: e.y - 20 });
  }
  if (p.motoKb && !e.dead && !e.boss) applyKnockback(e, p.motoKb, g);
  if (p.bounces || p.chain) {
    // 욕이 번개처럼 옆 진상들에게 튕긴다
    let cur = e, dc = dmg;
    const n = p.bounces || 1;
    for (let k = 0; k < n; k++) {
      let best = null, bd = 115 * 115;
      for (const o of g.enemies) {
        if (o.dead || o === cur || p.hitIds.includes(o.uid)) continue;
        const dx = o.x - cur.x, dy = o.y - cur.y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = o; }
      }
      if (!best) break;
      p.hitIds.push(best.uid);
      dc *= 0.82;
      ev(g, 'chain', { x: cur.x, y: cur.y - 20, x2: best.x, y2: best.y - 20 });
      const bonus = h && h.def.stunnedBonus ? (best.stunT > 0 ? h.def.stunnedBonus[h.lv - 1] : 1) * (best.form === 'reveal' ? h.def.revealBonus : 1) : 1;
      damageEnemy(g, best, dc * bonus, false, h, true);
      if (!best.dead && !best.boss && g.rng() < p.stunChance) {
        best.stunT = Math.max(best.stunT, p.stunSec * stunMul(best));
        ev(g, 'freeze', { x: best.x, y: best.y - 20 });
      }
      cur = best;
    }
  }
  if (p.kb && !e.def.charmImmune) {
    // 이한나 윙크: 남자만 넉백
    if (e.gender === 'm') {
      applyKnockback(e, p.kb, g);
      if (p.kbStun && !e.boss) e.stunT = Math.max(e.stunT, p.kbStun * stunMul(e));
      ev(g, 'wink', { x: e.x, y: e.y - 26, male: true });
    } else ev(g, 'wink', { x: e.x, y: e.y - 26, male: false });
  }
  if (p.splash) {
    const sr = p.splash * (g.mapFx.splash || 1);
    ev(g, 'splash', { x: e.x, y: e.y, r: sr, proj: p.type });
    const sd = dmg * 0.6;
    forEnemiesNear(g, e.x, e.y, sr, (o) => {
      if (o === e) return true;
      damageEnemy(g, o, sd, false, h, true);
      if (p.splashSlow && !o.boss) { o.slowT = Math.max(o.slowT, p.slowSec); o.slowMul = 1 - p.slow; }
      if (p.splashStun && !o.boss && !o.dead) o.stunT = Math.max(o.stunT, p.stunSec * 0.8 * stunMul(o));
      return true;
    });
  }
  if (p.pierce > 0) {
    p.pierce--;
    p.homing = false;
    p.target = null;
  } else p.dead = true;
}

// 넉백: 위쪽(적이 온 방향)으로 밀어낸다. 총 이동 거리 ≈ dist
// 보스는 안 밀린다. 연달아 맞으면 점점 덜 밀리고, 영웅들 사거리 밖(화면 위쪽)으로는 절대 안 밀려난다
export function applyKnockback(e, dist, g) {
  if (e.boss) return;
  if (e.dictT > 0) dist *= e.dictKb; // 독재자 곁에서는 잘 안 밀린다
  if (g && g.mapFx.kb) dist *= g.mapFx.kb; // 미끄러운 바닥
  e.kbMul = e.kbAge < RULES.kbRepeatSec ? e.kbMul * 0.5 : 1;
  e.kbAge = 0;
  dist *= e.kbMul;
  if (g) { e.kbMinY = g.rowY - RULES.kbMaxReach; dist = Math.min(dist, Math.max(0, e.y - e.kbMinY)); }
  if (dist < 1) return;
  e.kbv = Math.min(e.kbv || 0, -dist * 7); // 이미 날아가는 중이면 더 약하게 덮어쓰지 않는다
  e.atRope = false;
}

// ─── 경험치 보석 ──────────────────────────────────────
// 경험치 보석: 탭할 필요 없이 자동으로 모인다 (통통 튀는 연출 → 경험치 바로 비행)
function dropGem(g, x, y, v) {
  const m = g._gemPool.pop() || {};
  m.x = x; m.y = y; m.v = v; m.fly = false; m.sp = 0; m.age = 0; m.dead = false;
  m.vx = (g.rng() - 0.5) * 60; m.vy = -70 - g.rng() * 50;
  m.big = v >= 5;
  g.gems.push(m);
}
function vacuumGems(g) {
  for (const m of g.gems) m.fly = true;
}
function updateGems(g, dt) {
  const list = g.gems;
  const ty = g.rowY + 10;
  for (const m of list) {
    m.age += dt;
    if (!m.fly) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.vy += 320 * dt;
      if (m.age >= RULES.gemDelay) m.fly = true;
      continue;
    }
    m.sp += 1100 * dt;
    const tx = clamp(m.x, 40, g.W - 40);
    const dx = g.W / 2 + (tx - g.W / 2) * 0.6 - m.x, dy = ty - m.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const s = Math.min(d, (m.sp + 120) * dt);
    m.x += (dx / d) * s;
    m.y += (dy / d) * s;
    if (d < 14) {
      m.dead = true;
      gainExp(g, m.v);
      ev(g, 'gem', { x: m.x, y: m.y });
    }
  }
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const m = list[i];
    if (m.dead) g._gemPool.push(m); else list[j++] = m;
  }
  list.length = j;
}
export function gainExp(g, v) {
  g.exp += v;
  while (g.exp >= g.need) {
    g.exp -= g.need;
    g.level++;
    g.need = expNeed(g.level);
    g.pendingLevels++;
    ev(g, 'levelup', { level: g.level });
  }
}

// ─── 웨이브 진행 ──────────────────────────────────────
export function waveDefFor(g, n) {
  return g.mode === 'stage' ? stageWave(g.stage, n) : waveDef(n);
}
export function startWave(g, n) {
  g.wave = n;
  const def = waveDefFor(g, n);
  g.diff = def.level || n;
  g.hpScale = def.hpScale || 1;
  g.lastSnap = snapshot(g); // 뒤로 가기·새로고침 뒤 '이어하기' 용 (이 웨이브 시작 상태)
  const q = [];
  const more = g.mapFx.spawn || 1;
  for (const [type, count0, every0, delay] of def.g) {
    const count = Math.round(count0 * more), every = every0 / more;
    const pack = ENEMIES[type].pack;
    for (let i = 0; i < count; i++) {
      const at = delay + i * every + g.rng() * every * 0.5;
      if (!pack) { q.push({ type, at }); continue; }
      // 인피 패거리: 3~5명이 한 덩어리로
      const n = pack.min + ((g.rng() * (pack.max - pack.min + 1)) | 0);
      const x0 = 50 + g.rng() * (g.W - 100);
      for (let j = 0; j < n; j++) q.push({ type, at: at + j * 0.06, x: clamp(x0 + (j - (n - 1) / 2) * 20 + g.rng() * 6, 20, g.W - 20) });
    }
  }
  if (def.boss) q.push({ type: def.boss, at: 1.2, boss: true });
  if (def.boss2) q.push({ type: def.boss2, at: g.mode === 'stage' ? 14 : 26, boss: true });
  q.sort((a, b) => a.at - b.at);
  g.spawnQ = q;
  g.spawnI = 0;
  g.waveT = 0;
  if (def.boss) {
    g.phase = 'intro';
    g.phaseT = RULES.bossIntroSec;
    ev(g, 'bossIntro', { wave: n, enemy: def.boss, enemy2: def.boss2 || null });
  } else g.phase = 'wave';
  ev(g, 'waveStart', { wave: n, boss: !!def.boss, count: q.length });
}

function waveClear(g) {
  const s = g.stats;
  s.wavesCleared = Math.max(s.wavesCleared, g.wave);
  s.score += Math.round(g.diff * SCORE.wavePer);
  vacuumGems(g);
  ev(g, 'waveClear', { wave: g.wave, last: g.wave >= g.totalWaves });
  const done = g.mode === 'stage' ? g.wave >= g.totalWaves : g.wave === RULES.waves && !g.endless;
  if (done) {
    g.victory = true;
    const hpFrac = g.base.hp / g.base.max;
    g.stars = starsFor(hpFrac);
    s.score += (g.mode === 'stage' ? SCORE.stageClear : SCORE.victory) + Math.round(hpFrac * 100) * SCORE.hpPct;
    g.phase = 'victory';
    ev(g, 'victory', { stars: g.stars });
  } else {
    g.phase = 'break';
    g.phaseT = g.mode === 'stage' ? RULES.stageBreakSec : RULES.breakSec;
  }
}
// 20웨이브 승리 뒤 무한 모드 계속
export function continueEndless(g) {
  g.endless = true;
  g.phase = 'break';
  g.phaseT = RULES.breakSec;
}

function aliveCount(g) {
  let n = 0;
  for (const e of g.enemies) if (!e.dead) n++;
  return n;
}
export function enemiesLeft(g) {
  return aliveCount(g) + (g.spawnQ.length - g.spawnI);
}

// ─── 궁극기 ───────────────────────────────────────────
export function useUlt(g) {
  if (g.ult < RULES.ultMax || g.over) return false;
  g.ult = 0;
  const dmg = RULES.ultDamage * (1 + 0.22 * g.diff) * g.mods.ultDmg;
  buildGrid(g);
  for (const e of g.enemies.slice()) {
    if (e.dead) continue;
    damageEnemy(g, e, e.boss ? dmg * 1.5 : dmg, false, null, true);
    if (!e.dead && !e.boss) { applyKnockback(e, 40, g); e.stunT = Math.max(e.stunT, 0.7); }
  }
  ev(g, 'ult', {});
  return true;
}

// 맵 효과 시계: 정전(가끔 불 꺼짐) · 인피 확성기(가끔 진상 가속)
function updateMapFx(g, dt) {
  const fx = g.mapFx;
  if (!fx.every || g.phase === 'test') return;
  if (g.darkT > 0) { g.darkT -= dt; if (g.darkT <= 0) ev(g, 'lightsOn', {}); }
  if (g.megaT > 0) g.megaT -= dt;
  if (g.phase !== 'wave') return;
  g.fxT += dt;
  if (g.fxT >= fx.every) {
    g.fxT = 0;
    if (fx.id === 'blackout') { g.darkT = fx.dark; ev(g, 'blackout', {}); }
    if (fx.id === 'megaphone') { g.megaT = fx.sec; ev(g, 'megaphone', {}); }
  }
}

// ─── 액티브 스킬 (스킬 바) ─────────────────────────────
export function skillReady(h) { return !!h.def.skill && h.skillCd <= 0; }
// x, y: 찍은 곳 (target 스킬만). 성공하면 true
export function castSkill(g, h, x, y) {
  const sk = h.def.skill;
  if (!sk || h.skillCd > 0 || g.over || g.phase === 'victory') return false;
  const lv = h.lv - 1;
  const base = heroDamage(g, h) * (1 + (h.gear.skill || 0));
  buildGrid(g);
  let r = 0;
  switch (sk.id) {
    case 'rally':
      g.rallyT = sk.sec[lv]; g.rallySpd = sk.spd[lv];
      break;
    case 'redcard':
      r = sk.r[lv];
      forEnemiesNear(g, x, y, r, (e) => {
        damageEnemy(g, e, base * sk.dmgMul, false, h, true);
        if (!e.dead) { e.slowT = Math.max(e.slowT, sk.slowSec * (e.boss ? 0.5 : 1)); e.slowMul = e.boss ? 0.7 : 0.4; }
        if (lv >= 4 && !e.dead && !e.boss) e.stunT = Math.max(e.stunT, 1);
        return true;
      });
      break;
    case 'frenzy':
      h.frenzyT = sk.sec[lv]; h.frenzyCd = 0;
      break;
    case 'firstaid': {
      const v = Math.min(g.base.max - g.base.hp, g.base.max * sk.heal[lv]);
      g.base.hp += v;
      for (const o of g.heroes) { o.stunT = 0; o.charmT = 0; o.rumorT = 0; o.fearT = 0; o.paperT = 0; }
      ev(g, 'heal', { x: h.x, y: h.y, v: Math.round(v) });
      ev(g, 'cleanse', { x: h.x, y: h.y });
      break;
    }
    case 'oneshot':
      if (h.rage) h.rageT += 5;
      else { h.rage = true; h.rageT = h.def.rageSec[lv] * (g.mapFx.rage || 1); ev(g, 'rage', { hero: h.id, x: h.x, y: h.y }); }
      break;
    case 'winkbomb':
      r = sk.r[lv];
      forEnemiesNear(g, x, y, r, (e) => {
        damageEnemy(g, e, base, false, h, true);
        if (e.dead || e.boss || e.def.charmImmune) return true;
        if (e.gender === 'm') { applyKnockback(e, sk.kb, g); ev(g, 'wink', { x: e.x, y: e.y - 26, male: true }); } else { e.stunT = Math.max(e.stunT, sk.stun * stunMul(e)); ev(g, 'wink', { x: e.x, y: e.y - 26, male: false }); }
        return true;
      });
      break;
    case 'whirl': {
      const n = sk.n[lv];
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * (1.9 / (n - 1));
        spawnProj(g, 'cane', h, null, base * 1.2, { angle: a, pierce: Infinity, spin: 16, maxDist: h.def.range + 60, r: 16 });
      }
      break;
    }
    case 'encore': {
      const v = Math.min(g.base.max - g.base.hp, g.base.max * sk.heal[lv]);
      g.base.hp += v;
      for (const o of g.heroes) { o.stunT = 0; o.charmT = 0; o.rumorT = 0; o.fearT = 0; o.paperT = 0; o.vomitT = 0; o.blindT = 0; o.drowsyT = 0; if (o.grabT > 0) { o.grabT = 0; o.grabBy = 0; } }
      r = sk.r;
      forEnemiesNear(g, h.x, h.y - 60, r, (e) => {
        if (e.boss) { e.slowT = Math.max(e.slowT, sk.dance[lv]); e.slowMul = 0.5; } else e.stunT = Math.max(e.stunT, sk.dance[lv] * stunMul(e));
        return true;
      });
      ev(g, 'heal', { x: h.x, y: h.y, v: Math.round(v) });
      ev(g, 'encore', { x: h.x, y: h.y, r });
      break;
    }
    case 'moto3': {
      const n = sk.n[lv];
      const spread = 0.34;
      launchMoto(g, h, Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * spread), 1.3);
      break;
    }
    case 'serious':
      h.meter = 100; h.serious = 1.5;
      break;
    case 'rush': {
      const n = sk.n[lv];
      const list = [];
      const f = g.focus && !g.focus.dead && g.focus.uid === g.focusUid ? g.focus : null;
      if (f) list.push(f);
      const rest = g.enemies.filter((e) => !e.dead && e.y > 0 && e !== f).sort((a, b) => b.y - a.y);
      let cur = f || rest.shift();
      if (cur && !f) list.push(cur);
      while (list.length < n && rest.length) {
        rest.sort((a, b) => Math.hypot(a.x - cur.x, a.y - cur.y) - Math.hypot(b.x - cur.x, b.y - cur.y));
        cur = rest.shift();
        list.push(cur);
      }
      const pts = [];
      for (const e of list) { pts.push([e.x, e.y]); damageEnemy(g, e, base * sk.mul, true, h, false, true); }
      h.out = false; h.restT = 0.6; h.px = h.x; h.py = h.y;
      ev(g, 'rush', { hero: h.id, pts, x: h.x, y: h.y });
      break;
    }
    case 'curse':
      r = sk.r[lv];
      forEnemiesNear(g, x, y, r, (e) => {
        const rv = e.form === 'reveal';
        damageEnemy(g, e, base * sk.dmgMul * (rv ? h.def.revealBonus : 1), false, h, true);
        if (!e.dead) { e.stunT = Math.max(e.stunT, sk.stun[lv] * stunMul(e) * (e.boss ? 0.3 : 1)); ev(g, 'freeze', { x: e.x, y: e.y - 20 }); }
        return true;
      });
      break;
  }
  h.skillCd = sk.cd * (1 - (h.gear.cd || 0));
  ev(g, 'skill', { hero: h.id, skill: sk.id, name: sk.name, x: sk.target ? x : h.x, y: sk.target ? y : h.y, r, target: !!sk.target });
  return true;
}

// 영웅 자리 바꾸기 (끌어다 놓기). 잠깐 쿨타임
export function swapHeroes(g, h, slot) {
  if (!h || slot < 0 || slot >= g.nPos || slot === h.slot || g.swapCd > 0) return false;
  const other = g.heroes.find((o) => o.slot === slot);
  if (other) { other.slot = h.slot; other.x = g.slotX[other.slot]; }
  h.slot = slot; h.x = g.slotX[slot];
  g.swapCd = 1.2;
  ev(g, 'swap', { hero: h.id, x: h.x, y: h.y });
  return true;
}
// 이 자리 근처의 영웅 (탭 판정)
export function heroAt(g, x, y) {
  let best = null, bd = 34 * 34;
  for (const h of g.heroes) {
    const dx = h.x - x, dy = h.y - 12 - y;
    const d2 = dx * dx + dy * dy * 0.45;
    if (d2 < bd) { bd = d2; best = h; }
  }
  return best;
}
export function nearestSlot(x, g) {
  const X = g ? g.slotX : SLOT_X;
  let best = 0;
  for (let i = 1; i < X.length; i++) if (Math.abs(X[i] - x) < Math.abs(X[best] - x)) best = i;
  return best;
}

// 탭한 적을 집중 공격 대상으로
export function setFocus(g, x, y) {
  let best = null, bd = 44 * 44;
  for (const e of g.enemies) {
    if (e.dead) continue;
    const dx = e.x - x, dy = e.y - e.def.size * 0.3 - y;
    const d = dx * dx + dy * dy - e.r * e.r;
    if (d < bd) { bd = d; best = e; }
  }
  g.focus = best;
  g.focusUid = best ? best.uid : 0;
  return best;
}

// ─── 한 스텝 ──────────────────────────────────────────
export function step(g, dt) {
  if (g.over || g.phase === 'victory') return;
  g.t += dt;
  if (g.phase === 'break') {
    g.phaseT -= dt;
    if (g.phaseT <= 0) startWave(g, g.wave + 1);
  } else if (g.phase === 'intro') {
    g.phaseT -= dt;
    if (g.phaseT <= 0) g.phase = 'wave';
  }
  if (g.phase === 'wave') {
    g.waveT += dt;
    const q = g.spawnQ;
    while (g.spawnI < q.length && q[g.spawnI].at <= g.waveT) {
      const s = q[g.spawnI++];
      const e = spawnEnemy(g, s.type, s.boss ? g.W / 2 : s.x, s.boss ? -60 : undefined);
      if (s.boss) ev(g, 'bossSpawn', { enemy: s.type, x: e.x, y: e.y });
    }
  }
  if (g.mods.regen && g.base.hp < g.base.max && g.phase !== 'test') g.base.hp = Math.min(g.base.max, g.base.hp + g.mods.regen * dt);
  buildGrid(g);
  updateAuras(g);
  updateHeroes(g, dt);
  updateEnemies(g, dt);
  updateEprojs(g, dt);
  updateProjs(g, dt);
  if (g.pools.length) updatePools(g, dt);
  if (g.rallyT > 0) g.rallyT -= dt;
  updateMapFx(g, dt);
  if (g.swapCd > 0) g.swapCd -= dt;
  // 술병 폭발은 연쇄 가능 — 한 번에 처리
  let guard = 0;
  while (g._boom.length && guard++ < 40) {
    const y = g._boom.pop(), x = g._boom.pop();
    explode(g, x, y);
  }
  updateGems(g, dt);
  if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }
  // 죽은 적 정리 → 풀로 반납
  const list = g.enemies;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) g._enemyPool.push(e); else list[j++] = e;
  }
  list.length = j;
  if (g.phase === 'wave' && !g.over && g.spawnI >= g.spawnQ.length && list.length === 0) waveClear(g);
}

// ─── 카드 ─────────────────────────────────────────────
function heroCardDesc(def, next) {
  const perk = def.perks[next];
  const up = Math.round((LEVEL_DMG[next - 1] / LEVEL_DMG[next - 2] - 1) * 100);
  return perk ? `★ ${perk}` : `공격력 +${up}% · 공격 속도 증가`;
}
export function cardPool(g) {
  const pool = [];
  const free = g.heroes.length < g.nPos && g.mode !== 'stage';
  for (const id of UNLOCK_HEROES) {
    if (hasHero(g, id) || !free) continue;
    if (!g.unlocked.includes(id)) continue;
    const d = HEROES[id];
    const tr = g.trial && g.trial.includes(id);
    pool.push({ key: 'add:' + id, kind: 'addHero', hero: id, rarity: 'rare', icon: d.emoji, title: `${d.name} ${tr ? '체험 합류!' : '합류!'}`, desc: d.desc, sub: tr ? '체험 · 스테이지를 깨면 정식 합류' : d.role, w: 9 });
  }
  for (const h of g.heroes) {
    if (h.lv >= 5) continue;
    const next = h.lv + 1;
    const d = h.def;
    pool.push({
      key: 'lv:' + h.id, kind: 'heroLv', hero: h.id, rarity: d.perks[next] ? 'rare' : 'common',
      icon: d.emoji, title: `${d.name} Lv.${next}`, desc: heroCardDesc(d, next), sub: d.role, w: d.perks[next] ? 9 : 11,
    });
  }
  for (const c of CARDS) {
    const n = g.stacks[c.id] || 0;
    if (n >= c.max) continue;
    if (c.needs && !hasHero(g, c.needs)) continue;
    pool.push({ key: c.id, kind: 'global', id: c.id, rarity: c.rarity, icon: c.icon, title: c.title, desc: c.desc, stack: n, w: RARITY[c.rarity].weight });
  }
  return pool;
}
export function hiddenCard(id, g) {
  const d = HEROES[id];
  const tr = g && g.trial && g.trial.includes(id);
  return { key: 'add:' + id, kind: 'addHero', hero: id, rarity: 'hidden', icon: d.emoji, title: `${d.name} ${tr ? '체험 합류!' : '합류!'}`, desc: d.desc, sub: tr ? 'HIDDEN 체험 · 스테이지를 깨면 정식 합류' : d.role };
}
// 3장 뽑기 (서로 다른 카드). opt.hiddenChance 로 히든 확률 덮어쓰기 가능(테스트용)
export function rollCards(g, n = 3, opt = {}) {
  const rng = opt.rng || g.rng;
  const pool = cardPool(g);
  const picks = [];
  while (picks.length < n && pool.length) {
    let sum = 0;
    for (const c of pool) sum += c.w;
    let r = rng() * sum;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    picks.push(pool.splice(i, 1)[0]);
  }
  for (let i = 0; picks.length < n; i++) {
    const f = FILLER_CARDS[i % FILLER_CARDS.length];
    picks.push({ key: f.id + i, kind: 'filler', id: f.id, rarity: f.rarity, icon: f.icon, title: f.title, desc: f.desc });
  }
  // 히든 영웅: 칸마다 낮은 확률로 교체 (런당 1번씩만)
  const chance = opt.hiddenChance !== undefined ? opt.hiddenChance : RULES.hiddenChance;
  const from = g.mode === 'stage' ? RULES.hiddenFromStageWave : RULES.hiddenFromWave;
  if (g.wave >= from || opt.hiddenChance !== undefined) {
    for (let i = 0; i < picks.length; i++) {
      if (g.heroes.length >= g.nPos || g.mode === 'stage') break;
      const avail = HIDDEN_HEROES.filter((id) => g.hiddenUnlocked.includes(id) && !g.hiddenTaken[id] && !hasHero(g, id) && !picks.some((p) => p.hero === id));
      if (!avail.length) break;
      if (rng() < chance) picks[i] = hiddenCard(avail[(rng() * avail.length) | 0], g);
    }
  }
  return picks;
}

export function applyCard(g, c) {
  const m = g.mods;
  switch (c.kind) {
    case 'addHero': addHero(g, c.hero); break;
    case 'heroLv': {
      const h = hasHero(g, c.hero);
      if (h && h.lv < 5) {
        h.lv++;
        ev(g, 'heroLv', { hero: h.id, lv: h.lv, x: h.x, y: h.y });
      }
      break;
    }
    case 'global':
      g.stacks[c.id] = (g.stacks[c.id] || 0) + 1;
      switch (c.id) {
        case 'dmg': m.dmg += 0.15; break;
        case 'spd': m.spd += 0.12; break;
        case 'gunExtra': m.gunExtra++; break;
        case 'crit': m.crit += 0.08; break;
        case 'hp': g.base.max = Math.round(g.base.max * 1.2); g.base.hp = Math.min(g.base.max, g.base.hp + g.base.max * 0.3); break;
        case 'exp': m.expMul += 0.2; break;
        case 'slow': m.enemySpd *= 0.92; for (const e of g.enemies) e.speed *= 0.92; break;
        case 'pierce': m.pierce++; break;
        case 'boss': m.dmg += 0.3; m.spd += 0.15; break;
        case 'regen': m.regen += 1.5; break;
        case 'ult': m.ultCharge += 0.5; m.ultDmg += 0.4; break;
        case 'charmRes': m.charmMul *= 0.5; break;
      }
      break;
    case 'filler':
      if (c.id === 'fillUlt') g.ult = Math.min(RULES.ultMax, g.ult + 40);
      else g.base.hp = Math.min(g.base.max, g.base.hp + g.base.max * 0.35);
      break;
  }
  ev(g, 'card', { card: c.key });
}

// 결과 전송용 요약
export function summary(g, durationSec) {
  const stage = g.mode === 'stage';
  return {
    mode: g.mode,
    stage: stage ? g.stage : 0,
    stars: stage && g.victory ? g.stars : 0,
    perfect: !!(stage && g.victory && !g.baseHit), // 입구가 한 번도 안 맞음
    hpPct: Math.round((g.base.hp / g.base.max) * 100),
    wave: stage ? g.stats.wavesCleared : g.victory && !g.endless ? RULES.waves : Math.max(g.stats.wavesCleared, g.wave),
    waves: stage ? g.totalWaves : g.stats.wavesCleared,
    score: g.stats.score,
    kills: g.stats.kills,
    bossKills: g.stats.bossKills,
    durationSec: Math.round(durationSec),
    victory: g.victory,
    heroesUsed: Object.keys(g.heroesUsed),
    seen: Object.keys(g.seen || {}).filter((t) => !ENEMIES[t].dot),
  };
}

// ─── 이어하기: 웨이브 시작 상태 저장/복구 ─────────────────
// JSON 으로 바꿔 localStorage 에 넣을 수 있는 평범한 객체
export function snapshot(g) {
  return {
    v: 1, mode: g.mode, stage: g.stage, wave: g.wave, t: g.t,
    heroes: g.heroes.map((h) => ({ id: h.id, lv: h.lv, slot: h.slot, kills: h.kills, dmgDone: h.dmgDone })),
    mods: Object.assign({}, g.mods), stacks: Object.assign({}, g.stacks),
    hiddenTaken: Object.assign({}, g.hiddenTaken), heroesUsed: Object.assign({}, g.heroesUsed),
    level: g.level, exp: g.exp, need: g.need, pendingLevels: g.pendingLevels, welcomePicks: g.welcomePicks,
    base: { hp: g.base.hp, max: g.base.max }, ult: g.ult, stats: Object.assign({}, g.stats),
    meta: Object.assign({}, g.meta), items: Object.assign({}, g.items), unlocked: g.unlocked.slice(), trial: (g.trial || []).slice(),
    gear: g.gear, nPos: g.nPos, baseHit: g.baseHit,
  };
}
// 저장한 웨이브를 처음부터 다시 시작 (짧은 카운트다운 뒤). 걸린 시간 t 는 이어서 센다
export function restoreGame(snap, opt = {}) {
  const g = createGame({
    H: opt.H, rng: opt.rng, god: opt.god, mode: snap.mode, stage: snap.stage,
    meta: snap.meta, items: snap.items, unlocked: snap.unlocked || snap.hiddenUnlocked || [], heroes: [], gear: snap.gear, positions: snap.nPos,
  });
  for (const s of snap.heroes || []) {
    if (!HEROES[s.id]) continue;
    const h = addHero(g, s.id);
    if (!h) continue;
    h.lv = clamp(s.lv | 0, 1, 5);
    if (s.slot >= 0 && s.slot < g.nPos) { h.slot = s.slot; h.x = g.slotX[s.slot]; }
    h.kills = s.kills || 0; h.dmgDone = s.dmgDone || 0; h.joinT = 1;
  }
  Object.assign(g.mods, snap.mods || {});
  g.stacks = Object.assign({}, snap.stacks); g.hiddenTaken = Object.assign({}, snap.hiddenTaken);
  g.heroesUsed = Object.assign({}, g.heroesUsed, snap.heroesUsed);
  g.level = snap.level || 1; g.exp = snap.exp || 0; g.need = snap.need || expNeed(g.level);
  g.pendingLevels = snap.pendingLevels || 0; g.welcomePicks = snap.welcomePicks || 0;
  g.base.max = snap.base.max; g.base.hp = clamp(snap.base.hp, 1, snap.base.max);
  g.ult = snap.ult || 0;
  Object.assign(g.stats, snap.stats || {});
  g.t = snap.t || 0;
  g.wave = Math.max(0, (snap.wave || 1) - 1);
  g.phase = 'break';
  g.phaseT = RULES.firstBreakSec + 0.5;
  g.resumed = true;
  g.trial = (snap.trial || []).slice();
  g.baseHit = !!snap.baseHit;
  g.events.length = 0;
  return g;
}
