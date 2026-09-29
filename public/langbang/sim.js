// 랑방 대전 — 순수 시뮬레이션 (DOM 없음, Node 에서도 import 가능)
// 화면/소리는 g.events 로 흘려보내고, 렌더러가 매 프레임 꺼내서 연출한다.
import {
  FIELD, RULES, HEROES, ENEMIES, HERO_SLOTS, SLOT_X, SLOT_ORDER, LEVEL_DMG, LEVEL_INTERVAL,
  BASE_HEROES, HIDDEN_HEROES, CARDS, FILLER_CARDS, RARITY, SCORE, expNeed, hpMul, atkMul, waveDef,
} from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ─── 게임 생성 ─────────────────────────────────────────
export function createGame(opt = {}) {
  const H = clamp(Math.round(opt.H || 720), FIELD.minH, FIELD.maxH);
  const rowY = Math.round(H * FIELD.rowFrac);
  const g = {
    W: FIELD.W, H, rowY, ropeY: rowY - FIELD.ropeGap,
    rng: opt.rng || Math.random,
    meta: opt.meta || {}, // { heroId: 영구 강화 레벨 }
    god: !!opt.god,
    t: 0, wave: opt.startWave ? opt.startWave - 1 : 0,
    phase: opt.noWaves ? 'test' : 'break', phaseT: RULES.firstBreakSec,
    waveT: 0, spawnQ: [], spawnI: 0, bossAlive: 0,
    heroes: [], enemies: [], projs: [], gems: [], events: [],
    base: { hp: RULES.baseHp, max: RULES.baseHp },
    level: 1, exp: 0, need: expNeed(1), pendingLevels: 0,
    mods: {
      dmg: 1, spd: 1, crit: RULES.crit, critMul: RULES.critMul, magnet: RULES.magnet, coinMul: 1,
      pierce: 0, gunExtra: 0, regen: 0, ultCharge: 1, ultDmg: 1, charmMul: 1,
    },
    stacks: {}, hiddenTaken: {}, heroesUsed: {},
    stats: { kills: 0, bossKills: 0, coins: 0, score: 0, maxCombo: 0, damage: 0, wavesCleared: 0, stolen: 0 },
    coinFrac: 0, combo: 0, comboT: 0, ult: 0, focus: null,
    uid: 1, victory: false, endless: false, over: false,
    // 오브젝트 풀
    _enemyPool: [], _projPool: [], _gemPool: [], _boom: [],
    _grid: null,
  };
  const start = opt.heroes || ['bangjang', opt.partner || 'gunman'];
  for (const id of start) if (id) addHero(g, id);
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

export function addHero(g, id) {
  if (hasHero(g, id) || g.heroes.length >= HERO_SLOTS) return null;
  const def = HEROES[id];
  const used = new Set(g.heroes.map((h) => h.slot));
  const slot = SLOT_ORDER.find((s) => !used.has(s));
  const h = {
    id, def, slot, x: SLOT_X[slot], y: g.rowY, lv: 1, meta: g.meta[id] || 0,
    cd: 0.3 + g.rng() * 0.4, charmT: 0, stunT: 0, recoil: 0, shots: 0, joinT: 0,
    rage: false, rageT: def.soberSec ? def.soberSec[0] : 0, healT: def.heal ? def.heal[0][0] : 0,
    kills: 0, dmgDone: 0,
  };
  g.heroes.push(h);
  g.heroesUsed[id] = true;
  if (def.hidden) g.hiddenTaken[id] = true;
  ev(g, 'join', { hero: id, x: h.x, y: h.y, hidden: !!def.hidden });
  return h;
}

export function heroDamage(g, h) {
  const d = h.def;
  return d.dmg * LEVEL_DMG[h.lv - 1] * (1 + RULES.metaDmgPerLevel * h.meta) * g.mods.dmg * (h.rage ? d.rageDmg : 1);
}
export function heroInterval(g, h) {
  const d = h.def;
  let iv = d.interval * LEVEL_INTERVAL[h.lv - 1];
  if (h.id === 'sunggu' && h.lv >= 5) iv *= 0.75;
  return iv / (g.mods.spd + auraBonus(g)) * (h.rage ? d.rageInterval : 1);
}
export function auraBonus(g) {
  const b = hasHero(g, 'bangjang');
  return b ? HEROES.bangjang.aura[b.lv - 1] : 0;
}

function updateHeroes(g, dt) {
  const aura = auraBonus(g);
  for (const h of g.heroes) {
    const d = h.def;
    h.joinT += dt;
    if (h.recoil > 0) h.recoil -= dt;
    if (h.charmT > 0) h.charmT -= dt;
    if (h.stunT > 0) h.stunT -= dt;
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
          h.rageT = d.rageSec[h.lv - 1];
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
    if (h.charmT > 0 || h.stunT > 0) continue;
    const base = d.interval * LEVEL_INTERVAL[h.lv - 1] * (h.id === 'sunggu' && h.lv >= 5 ? 0.75 : 1);
    h.cd -= dt * (g.mods.spd + aura) / (h.rage ? d.rageInterval : 1);
    if (h.cd <= 0) {
      const t = findTarget(g, h);
      if (!t) { h.cd = 0; continue; }
      fire(g, h, t);
      h.cd += base;
      if (h.cd < 0) h.cd = 0;
    }
  }
}

function inRange(h, e, range) {
  const dx = e.x - h.x, dy = e.y - h.y;
  return dx * dx + dy * dy <= range * range && e.y > -20;
}
export function findTarget(g, h, skip) {
  const range = h.def.range;
  const f = g.focus;
  if (f && !f.dead && f.uid === g.focusUid && inRange(h, f, range) && !(skip && skip.includes(f))) return f;
  let best = null, by = -1e9;
  for (const e of g.enemies) {
    if (e.dead || (skip && skip.includes(e))) continue;
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
    case 'notice': {
      const big = lv >= 5 && h.shots % 5 === 0;
      spawnProj(g, 'notice', h, t, dmg * (big ? 1.6 : 1), {
        homing: true, pierce: (lv >= 3 ? 1 : 0) + pierce, splash: big ? 75 : 0, big, r: big ? 14 : 9,
      });
      break;
    }
    case 'warn':
      spawnProj(g, 'warn', h, t, dmg, {
        homing: true, pierce, slow: d.slow, slowSec: d.slowSec,
        stunChance: lv >= 5 ? 0.25 : lv >= 3 ? 0.15 : 0, stunSec: 1, splash: lv >= 5 ? 50 : 0, splashSlow: lv >= 5,
      });
      break;
    case 'bullet': {
      const n = 1 + (lv >= 3 ? 1 : 0) + (lv >= 5 ? 1 : 0) + g.mods.gunExtra;
      const ang = aimAngle(h, t, d.projSpeed);
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.09;
        spawnProj(g, 'bullet', h, null, dmg, { angle: a, pierce, critBonus: lv >= 5 ? 0.15 : 0, r: 6 });
      }
      break;
    }
    case 'flower':
      spawnProj(g, 'flower', h, t, dmg, { homing: true, pierce });
      break;
    case 'bottle':
      spawnProj(g, 'bottle', h, t, dmg, { homing: true, pierce, splash: h.rage && lv >= 3 ? 48 : 0, spin: 12, rage: h.rage });
      break;
    case 'wink': {
      const n = lv >= 5 ? 3 : lv >= 3 ? 2 : 1;
      const skip = [];
      let tt = t;
      for (let i = 0; i < n; i++) {
        spawnProj(g, 'wink', h, tt, dmg, {
          homing: true, pierce, kb: d.knockback[lv - 1], kbStun: lv >= 5 ? 0.5 : 0, spread: (i - (n - 1) / 2) * 0.35,
        });
        skip.push(tt);
        tt = findTarget(g, h, skip) || t;
      }
      break;
    }
    case 'cane': {
      const n = lv >= 5 ? 2 : 1;
      const ang = aimAngle(h, t, d.projSpeed);
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.16;
        spawnProj(g, 'cane', h, null, dmg, {
          angle: a, pierce: Infinity, spin: 14, boomerang: lv >= 3, maxDist: d.range + 40, r: 16,
        });
      }
      break;
    }
  }
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
  const sp = h.def.projSpeed;
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
  p.spin = o.spin || 0; p.rot = a; p.boomerang = !!o.boomerang; p.returning = false;
  p.maxDist = o.maxDist || 9999; p.dist = 0; p.life = 3.2; p.rage = !!o.rage;
  p.hitIds.length = 0;
  g.projs.push(p);
  return p;
}

// ─── 적 ───────────────────────────────────────────────
export function spawnEnemy(g, type, x, y, o = {}) {
  const def = ENEMIES[type];
  const e = g._enemyPool.pop() || {};
  const m = (o.hpMul || hpMul(Math.max(1, g.wave))) * (def.boss ? 1 : 1);
  e.uid = g.uid++; e.type = type; e.def = def; e.boss = !!def.boss; e.gender = def.gender;
  e.x = x !== undefined ? x : 24 + g.rng() * (g.W - 48);
  e.y = y !== undefined ? y : FIELD.spawnY - g.rng() * 10;
  e.baseX = e.x; e.phase = g.rng() * 6.28;
  e.maxHp = e.hp = def.hp * m; e.shield = 0;
  e.speed = def.speed * (0.92 + g.rng() * 0.16); e.atk = def.atk * atkMul(Math.max(1, g.wave));
  e.atkCd = 0.4; e.slowT = 0; e.slowMul = 1; e.stunT = 0; e.kbv = 0; e.flash = 0;
  e.dead = false; e.atRope = false; e.fleeing = false; e.stolen = 0; e.charmCd = 0;
  e.abT = def.slam ? def.slam.every * 0.6 : def.summon ? 3 : 0; e.abT2 = def.shieldAura ? 5 : 0; e.windup = 0;
  e.r = def.r; e.armor = def.armor || 0; e.age = 0; e.hitT = 0;
  e.stopY = g.ropeY - (e.boss ? 16 : 4 + g.rng() * 16);
  g.enemies.push(e);
  if (e.boss) g.bossAlive++;
  return e;
}

// 적에게 피해. 방어력 → 보호막 → 체력 순
export function damageEnemy(g, e, dmg, crit, src) {
  if (e.dead) return 0;
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
  // 경험치 보석
  if (e.boss) {
    for (let i = 0; i < 10; i++) dropGem(g, e.x + (g.rng() - 0.5) * 80, e.y + (g.rng() - 0.5) * 60, def.exp / 10);
  } else dropGem(g, e.x, e.y, def.exp);
  // 코인
  g.coinFrac += def.coin * g.mods.coinMul;
  const c = Math.floor(g.coinFrac);
  g.coinFrac -= c;
  s.coins += c;
  if (e.stolen) {
    s.coins += e.stolen;
    s.stolen -= e.stolen;
    ev(g, 'recover', { x: e.x, y: e.y, v: e.stolen });
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
  ev(g, 'kill', { x: e.x, y: e.y, enemy: e.type, boss: e.boss });
  if (e.boss || g.rng() < 0.12) ev(g, 'shout', { x: e.x, y: e.y - def.size * 0.6, text: def.shouts[(g.rng() * def.shouts.length) | 0] });
  if (g.focus === e) g.focus = null;
}

function explode(g, x, y) {
  const ex = ENEMIES.drunk.explode;
  const dmg = ex.dmg * (1 + 0.08 * (g.wave - 1));
  ev(g, 'explode', { x, y, r: ex.r });
  forEnemiesNear(g, x, y, ex.r, (e) => damageEnemy(g, e, dmg, false, null));
}

function damageBase(g, dmg, e) {
  if (g.over || g.god) return;
  g.base.hp -= dmg;
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
    if (e.flash > 0) e.flash -= dt;
    if (e.slowT > 0) e.slowT -= dt;
    if (e.charmCd > 0) e.charmCd -= dt;
    if (e.kbv) {
      e.y += e.kbv * dt;
      e.kbv *= Math.exp(-7 * dt);
      if (Math.abs(e.kbv) < 6) e.kbv = 0;
      if (e.y < e.stopY - 2) e.atRope = false;
    }
    if (e.stunT > 0) { e.stunT -= dt; continue; }
    // 보스 기술
    if (def.slam && e.y > 150) {
      if (e.windup > 0) {
        e.windup -= dt;
        if (e.windup <= 0) {
          for (const h of g.heroes) h.stunT = Math.max(h.stunT, def.slam.stun);
          ev(g, 'slam', { x: e.x, y: e.y });
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
          spawnEnemy(g, t, clamp(e.x + (i - (n - 1) / 2) * 34, 18, W - 18), e.y + 20 + g.rng() * 10, { hpMul: hpMul(g.wave) * 0.8 });
        }
        ev(g, 'summon', { x: e.x, y: e.y });
      }
      e.abT2 -= dt;
      if (e.abT2 <= 0) {
        e.abT2 = def.shieldAura.every;
        const sa = def.shieldAura;
        let n = 0;
        for (const o of g.enemies) {
          if (o.dead || o.boss) continue;
          const dx = o.x - e.x, dy = o.y - e.y;
          if (dx * dx + dy * dy < sa.r * sa.r) { o.shield = Math.max(o.shield, o.maxHp * sa.frac); n++; }
        }
        ev(g, 'shield', { x: e.x, y: e.y, r: sa.r, n });
      }
    }
    // 먹튀: 코인 들고 도망
    if (e.fleeing) {
      e.y -= e.speed * 1.4 * dt;
      if (e.y < -60) {
        e.dead = true;
        ev(g, 'escape', { x: e.x, y: 0, v: e.stolen });
      }
      continue;
    }
    if (!e.atRope) {
      const sp = e.speed * (e.slowT > 0 ? e.slowMul : 1);
      e.y += sp * dt;
      if (def.zigzag) e.x = clamp(e.baseX + Math.sin(e.age * 2.3 + e.phase) * def.zigzag, 16, W - 16);
      if (e.y >= e.stopY) { e.y = e.stopY; e.atRope = true; e.atkCd = 0.25; }
    }
    // 홀림: 꼬충이 가까이 오면 반대 성별 영웅을 홀린다
    if (def.charm && e.charmCd <= 0 && e.y > g.ropeY - RULES.charmRange) {
      e.charmCd = RULES.charmCooldown;
      tryCharm(g, e);
    }
    if (e.atRope) {
      if (def.steal) {
        const amt = Math.round(def.steal.base + def.steal.perWave * g.wave);
        const v = Math.min(g.stats.coins, amt);
        g.stats.coins -= v;
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

export function hitEnemy(g, p, e) {
  const h = p.hero;
  const crit = g.rng() < g.mods.crit + p.critBonus;
  const dmg = p.dmg * (crit ? g.mods.critMul : 1);
  p.hitIds.push(e.uid);
  ev(g, 'hit', { x: p.x, y: p.y, proj: p.type, crit });
  damageEnemy(g, e, dmg, crit, h);
  if (p.slow && !e.boss) { e.slowT = Math.max(e.slowT, p.slowSec); e.slowMul = 1 - p.slow; }
  else if (p.slow) { e.slowT = Math.max(e.slowT, p.slowSec * 0.5); e.slowMul = 1 - p.slow * 0.5; }
  if (p.stunChance && !e.dead && !e.boss && g.rng() < p.stunChance) {
    e.stunT = Math.max(e.stunT, p.stunSec);
    ev(g, 'kick', { x: e.x, y: e.y - 20 });
  }
  if (p.kb) {
    // 이한나 윙크: 남자만 넉백
    if (e.gender === 'm') {
      applyKnockback(e, e.boss ? p.kb * 0.22 : p.kb);
      if (p.kbStun && !e.boss) e.stunT = Math.max(e.stunT, p.kbStun);
      ev(g, 'wink', { x: e.x, y: e.y - 26, male: true });
    } else ev(g, 'wink', { x: e.x, y: e.y - 26, male: false });
  }
  if (p.splash) {
    ev(g, 'splash', { x: e.x, y: e.y, r: p.splash, proj: p.type });
    const sd = dmg * 0.6;
    forEnemiesNear(g, e.x, e.y, p.splash, (o) => {
      if (o === e) return true;
      damageEnemy(g, o, sd, false, h);
      if (p.splashSlow && !o.boss) { o.slowT = Math.max(o.slowT, p.slowSec); o.slowMul = 1 - p.slow; }
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
export function applyKnockback(e, dist) {
  e.kbv = -dist * 7;
  e.atRope = false;
}

// ─── 경험치 보석 ──────────────────────────────────────
function dropGem(g, x, y, v) {
  const m = g._gemPool.pop() || {};
  m.x = x; m.y = y; m.v = v; m.fly = false; m.sp = 0; m.age = 0; m.dead = false;
  m.big = v >= 5;
  g.gems.push(m);
}
export function collectAt(g, x, y, r) {
  let n = 0;
  for (const m of g.gems) {
    const dx = m.x - x, dy = m.y - y;
    if (!m.fly && dx * dx + dy * dy < r * r) { m.fly = true; n++; }
  }
  return n;
}
function vacuumGems(g) {
  for (const m of g.gems) m.fly = true;
}
function updateGems(g, dt) {
  const list = g.gems;
  const ty = g.rowY + 10;
  const magnetY = g.ropeY - g.mods.magnet;
  for (const m of list) {
    m.age += dt;
    if (!m.fly) {
      m.y += RULES.gemDrift * dt;
      if (m.y > magnetY) m.fly = true;
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
export function startWave(g, n) {
  g.wave = n;
  const def = waveDef(n);
  const q = [];
  for (const [type, count, every, delay] of def.g) {
    for (let i = 0; i < count; i++) q.push({ type, at: delay + i * every + g.rng() * every * 0.5 });
  }
  if (def.boss) q.push({ type: def.boss, at: 1.2, boss: true });
  if (def.boss2) q.push({ type: def.boss2, at: 26, boss: true });
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
  s.score += g.wave * SCORE.wavePer;
  const bonus = 5 + g.wave;
  s.coins += bonus;
  vacuumGems(g);
  ev(g, 'waveClear', { wave: g.wave, coins: bonus });
  if (g.wave === RULES.waves && !g.endless) {
    g.victory = true;
    s.score += SCORE.victory + Math.round((g.base.hp / g.base.max) * 100) * SCORE.hpPct;
    g.phase = 'victory';
    ev(g, 'victory', {});
  } else {
    g.phase = 'break';
    g.phaseT = RULES.breakSec;
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
  const dmg = RULES.ultDamage * (1 + 0.22 * g.wave) * g.mods.ultDmg;
  buildGrid(g);
  for (const e of g.enemies.slice()) {
    if (e.dead) continue;
    damageEnemy(g, e, e.boss ? dmg * 1.5 : dmg, false, null);
    if (!e.dead && !e.boss) { applyKnockback(e, 40); e.stunT = Math.max(e.stunT, 0.7); }
  }
  ev(g, 'ult', {});
  return true;
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
      const e = spawnEnemy(g, s.type, s.boss ? g.W / 2 : undefined, s.boss ? -60 : undefined);
      if (s.boss) ev(g, 'bossSpawn', { enemy: s.type, x: e.x, y: e.y });
    }
  }
  if (g.mods.regen && g.base.hp < g.base.max && g.phase !== 'test') g.base.hp = Math.min(g.base.max, g.base.hp + g.mods.regen * dt);
  buildGrid(g);
  updateHeroes(g, dt);
  updateEnemies(g, dt);
  updateProjs(g, dt);
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
  const free = g.heroes.length < HERO_SLOTS;
  for (const id of BASE_HEROES) {
    if (hasHero(g, id) || !free) continue;
    const d = HEROES[id];
    pool.push({ key: 'add:' + id, kind: 'addHero', hero: id, rarity: 'rare', icon: d.emoji, title: `${d.name} 합류!`, desc: d.desc, sub: d.role, w: 9 });
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
export function hiddenCard(id) {
  const d = HEROES[id];
  return { key: 'add:' + id, kind: 'addHero', hero: id, rarity: 'hidden', icon: d.emoji, title: `${d.name} 합류!`, desc: d.desc, sub: d.role };
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
  if (g.wave >= RULES.hiddenFromWave || opt.hiddenChance !== undefined) {
    for (let i = 0; i < picks.length; i++) {
      if (g.heroes.length >= HERO_SLOTS) break;
      const avail = HIDDEN_HEROES.filter((id) => !g.hiddenTaken[id] && !hasHero(g, id) && !picks.some((p) => p.hero === id));
      if (!avail.length) break;
      if (rng() < chance) picks[i] = hiddenCard(avail[(rng() * avail.length) | 0]);
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
        case 'magnet': m.magnet *= 1.45; break;
        case 'coin': m.coinMul += 0.2; break;
        case 'pierce': m.pierce++; break;
        case 'boss': m.dmg += 0.3; m.spd += 0.15; break;
        case 'regen': m.regen += 1.5; break;
        case 'ult': m.ultCharge += 0.5; m.ultDmg += 0.4; break;
        case 'charmRes': m.charmMul *= 0.5; break;
      }
      break;
    case 'filler':
      if (c.id === 'fillCoin') g.stats.coins += 25;
      else g.base.hp = Math.min(g.base.max, g.base.hp + g.base.max * 0.35);
      break;
  }
  ev(g, 'card', { card: c.key });
}

// 결과 전송용 요약
export function summary(g, durationSec) {
  return {
    wave: g.victory && !g.endless ? RULES.waves : Math.max(g.stats.wavesCleared, g.wave),
    score: g.stats.score,
    kills: g.stats.kills,
    bossKills: g.stats.bossKills,
    coins: g.stats.coins,
    durationSec: Math.round(durationSec),
    victory: g.victory,
    heroesUsed: Object.keys(g.heroesUsed),
  };
}
