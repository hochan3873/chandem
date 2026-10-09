// 랑방 대전 — 순수 시뮬레이션 (DOM 없음, Node 에서도 import 가능)
// 화면/소리는 g.events 로 흘려보내고, 렌더러가 매 프레임 꺼내서 연출한다.
import {
  FIELD, RULES, STAGE_HPX, HEROES, SUMMONS, ENEMIES, HERO_SLOTS, SLOT_X, SLOT_X7, SLOT_ORDER, LEVEL_DMG, LEVEL_INTERVAL,
  BASE_HEROES, HIDDEN_HEROES, UNLOCK_HEROES, LOCKED_HEROES, CARDS, FILLER_CARDS, RARITY, SCORE, expNeed, hpMul, atkMul, waveDef,
  STAGE_WAVES, stageWave, starsFor, itemValue, typeMul, MAP_FX, stageFx, rowYFor, EXP_NEED_MUL, stageExpMul, HERO_CARDS, SKILL_EVO, HERO_TAGS, ATTR_SET, EVO, EVO_MUL, HELL, TIER_MUL, TIER_SPD, TIER_GROWTH, TIER_MAX, HERO_TIER, resOf, openSlots, SECRET,
  TRAITS, REVEAL_HEROES, CH7, CH8, thiefCut, COND, COND_HP, stageConds, DOOR_PRESSURE, softMeta, stageMission, missionOk,
  BOSS_KITS, BOSS_AI, MID_KIT, MID_AI, MID_KITS, ECAST, ELITE_HP, ULT_LOCK,
  CURSES, ENDLESS_TUNE,
  CARD_TAGS, TECH, SET_BONUS, AUGMENTS, HERO_AUG, HERO_CC, CC_KINDS, CC_ON_HIT, TAGS, JOIN, chapterOf, TEMPO, WEAPON, BUS, NICHE, MOMENTUM, CARD_CUT, AUG_CUT, BAL, GEAR_TEAM_CAP,
  SKILL_AUG, SKILL_AUG_W, SLOW_RUN, PICK_SKIP, TENSION, roleCadence, mileDmg, mileSpd, ARMOR, BURN, KD, KD_HERO, KD_SUP, HERO_RES, armorPctStage, TOWER_SIM, TOWER_AWAKE_FX, HELL_SET_FX, SIG, GROW, MAIN, WEEK_TRAIT, NEAR_HEROES, WEEK_TRAIT_FROM,
} from './data.js';
import { starBonus, WEEKLY_MODS, pvpWave, PVP, collectMods } from './live.js';
import * as HWS from './hw-sim.js'; // 할로윈 이벤트 전투 규칙 (진상 기술 · 저주)
import * as WKS from './weekly-sim.js'; // 주간 도전 전투 규칙 (웨이브 사건 · 이번 주 규칙 · 중간 계약)
import { PVP_END, pvpStepN, pvpWaveHp, pvpMatchHp, pvpMeta, pvpStar, pvpCapMap, PVP_ESC, pvpPhase, pvpSdCount, pvpBunchCount, PVP_DOTS, pvpDot } from './pvp.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const ENEMY_CAP = 140; // 폰 성능: 화면에 동시에 있는 진상 최대 (넘치면 조금 기다렸다 나온다)

// ─── 게임 생성 ─────────────────────────────────────────
// opt.mode: 'stage'(스테이지 opt.stage = 1..30, 5웨이브) | 'endless'(무한 도전, 기본)
// opt.items: { door, battery, charm, drink } 아이템 레벨
// opt.unlocked: 해금한 영웅(서명훈·히든) — 이 영웅들만 카드로 나온다 (없으면 전부)
export function createGame(opt = {}) {
  const H = clamp(Math.round(opt.H || 720), FIELD.minH, FIELD.maxH);
  const rowY = rowYFor(H);
  const mode = opt.mode || (opt.stage ? 'stage' : 'endless');
  const items = opt.items || {};
  const baseMax = Math.round(RULES.baseHp * (1 + itemValue('door', items.door)));
  const welcome = mode === 'stage' ? Math.max(0, Math.floor(items.drink || 0)) : 0;
  let unlocked = (opt.unlocked || opt.hiddenUnlocked || LOCKED_HEROES).filter((id) => LOCKED_HEROES.includes(id));
  // 무한 도전: 아직 해금 안 한 멤버도 카드로 "체험 합류" (출전 동료·강화는 해금해야)
  const trial = opt.trialAll ? LOCKED_HEROES.filter((id) => !unlocked.includes(id)) : [];
  if (opt.trialAll) unlocked = LOCKED_HEROES.slice();
  const wk = opt.weekly || null; // 주간 도전: 정해진 판 (스테이지처럼 진행)
  const evd = opt.event || null; // 할로윈 이벤트 판 (hw-event.js eventDef): 정해진 웨이브 · 이벤트 진상 · 저주
  const wmod = wk ? WEEKLY_MODS[wk.mod] || {} : {};
  const g = {
    W: FIELD.W, H, rowY, ropeY: rowY - FIELD.ropeGap,
    kdOn: opt.kd !== undefined ? !!opt.kd : !!opt.tempo && mode === 'stage' && !opt.pvp && !opt.raid && !opt.tower, // 쓰러짐 게이지 (KD · 일반 스테이지 · 헬 · 주간)
    weekly: wk, wmod, cdMul: (wmod.cd || 1) * (opt.tempo ? TEMPO.cd : 1), hstars: opt.stars || {}, hell: !!opt.hell && mode === 'stage' && !wk,
    hcT: 0, hcBuff: 0, hcSkT: 0, hcSkAtk: 0, // 이호찬 "랑방을 위하여" 버프
    raid: opt.raid ? { sec: opt.raid.sec || 150, dmg: 0, boss: null } : null, // 주말 레이드: 거대 보스에게 준 피해
    pvp: opt.pvp ? { seed: Number(opt.pvp.seed) >>> 0, sudden: false, hp: Math.max(0.1, Math.min(20, Number(opt.pvp.hp) || 1)), n: 0, doorMul: 1, hurt: 0, timeUp: false, clock: null } : null, // 1:1 대전 (hp: 두 덱 전투력으로 정한 진상 체력 · n: 서든데스 단계)
    rng: opt.rng || Math.random,
    meta: opt.meta || {}, // { heroId: 영구 강화 레벨 }
    items,
    mode, stage: mode === 'stage' ? (wk ? wk.stage : evd ? evd.stage : opt.stage || 1) : 0, ev: evd,
    totalWaves: mode === 'stage' && !opt.pvp && !opt.raid ? (wk ? wk.waves.length : evd ? evd.waves.length : STAGE_WAVES) : Infinity,
    unlocked, trial, hiddenUnlocked: unlocked.filter((id) => HIDDEN_HEROES.includes(id)),
    god: !!opt.god,
    t: 0, wave: opt.startWave ? opt.startWave - 1 : 0, diff: 1,
    noWaves: !!opt.noWaves, phase: opt.noWaves ? 'test' : 'break', phaseT: RULES.firstBreakSec,
    waveT: 0, spawnQ: [], spawnI: 0, bossAlive: 0,
    heroes: [], enemies: [], projs: [], gems: [], events: [], eprojs: [], pools: [], puddles: [], flirt: false,
    rallyT: 0, rallySpd: 0, swapCd: 0, effT: -9,
    slotX: (opt.positions || 6) >= 7 ? SLOT_X7.slice() : SLOT_X.slice(), nPos: (opt.positions || 6) >= 7 ? 7 : 6,
    gear: opt.gear || {}, baseHit: false, // 장비 · 퍼펙트(입구 무피해) 판정
    mapFx: opt.mapFx ? MAP_FX[opt.mapFx] || MAP_FX.none : evd ? MAP_FX.none : wk ? MAP_FX[wk.fx] || MAP_FX.none : mode === 'stage' ? stageFx(opt.stage || 1) : MAP_FX.none, // 맵 효과
    fxT: 0, darkT: 0, megaT: 0, windX: 0, strobeT: 0, fireT: 0,
    base: { hp: baseMax, max: baseMax },
    level: 1, exp: 0, need: 0, pendingLevels: welcome, welcomePicks: welcome,
    grow: mode === 'stage' && !wk && !opt.pvp && !opt.raid && !opt.tower, mainOn: mode === 'stage' && !opt.pvp && !opt.raid && !opt.tower, // 큰 카드 · 덜 잦은 레벨업 (일반 스테이지 · 헬) · 주력 2명 (+ 주간 도전)
    slow: !!opt.tempo && mode === 'stage' && !opt.pvp && !opt.raid && !opt.tower, // 느린 판 (SLOW_RUN): 스테이지 · 주간 · 헬
    fewPick: !!opt.tempo && mode === 'stage' && !opt.pvp && !opt.raid && !opt.tower && !evd && (!wk || wk.v === 2), wkPick: !!(wk && wk.v === 2 && opt.tempo && !opt.raid && !opt.pvp), // (10/09) 고르기 줄이기: 일반 스테이지 · 헬 · 주간 도전 — 합류 자동 · 증강 두 번 · 카드 크게
    tension: !!opt.tempo && mode === 'stage' && !opt.pvp && !opt.raid && !opt.tower && !wk && !evd, // 긴장감 (TENSION): 일반 스테이지 · 헬만 (주간 · 이벤트 · 대전 · 레이드 · 탑은 따로 맞춘 모드라 그대로)
    joinPool: [], joinTotal: 0, joinMode: false, leader: null, pickN: 0, rollN: 0, tempo: !!opt.tempo,
    mom: opt.tempo && !opt.raid ? MOMENTUM.max : null, lastSkillT: -9, skillQ: null, // 기세 (템포에서만)
    mods: {
      dmg: 1, spd: 1, crit: RULES.crit + itemValue('charm', items.charm), critMul: RULES.critMul, expMul: 1, enemySpd: 1,
      pierce: 0, gunExtra: 0, regen: 0, ultCharge: 1 + itemValue('battery', items.battery), ultDmg: 1, charmMul: 1,
      attrDmg: {}, tagDmg: {}, splashMul: 1, chainExtra: 0, kbMul: 1, healMul: 1, ctrlMul: 1, bossDmg: 0, swarmDmg: 0, enemyHp: 1, debuffMul: 1, baseArmor: 1, attrUp: 0,
    },
    attrCount: {},
    // 덱 칸: 산 칸 수만큼만 열린 자리 (나머지는 자물쇠). 임시 증원 카드로 한 자리 잠깐 열 수 있다
    locked: [], maxHeroes: opt.slots ? Math.max(1, Math.min(6, opt.slots)) : 99, tempSlot: -1, guestUsed: false, // 자리는 6칸 모두 쓸 수 있고, 데려갈 수 있는 멤버 수만 제한
    guestPool: (opt.guestPool || []).slice(),
    stacks: {}, hiddenTaken: {}, heroesUsed: {}, seen: {}, seenTrait: {}, tauntZone: null, bags: [], curses: [], scoreMul: 1, coinMul: 1, streak: 1,
    stats: { kills: 0, bossKills: 0, coins: 0, score: 0, maxCombo: 0, damage: 0, wavesCleared: 0, stolen: 0, skills: 0 },
    combo: 0, comboT: 0, ult: 0, focus: null,
    uid: 1, victory: false, endless: mode === 'endless', over: false, stars: 0, lastSnap: null,
    awakeMap: opt.pvp ? {} : opt.awake || {}, // 진상의 탑 멤버별 지옥 각성 (0~3) · 1:1 대전은 전투력 보정이라 빼요
    // 스테이지 조건 (보호막 · 은신 · 기절 예고 · 철갑 · 떼거리 · 문 돌격) · 스테이지 미션 · 장별 강화 권장(넘는 만큼 절반)
    conds: [], cond: {}, mission: null, metaSoft: mode === 'stage' && !opt.pvp && !wk && !evd && !opt.raid && !opt.tower && !opt.noSoft,
    cstat: { leak: 0, shieldLeak: 0, armorLeak: 0, hidden: 0, found: 0, ccSec: 0, multi: 0, combo: 0, breaks: 0, minDoor: 1, endDoor: 0 }, ccT: 0, ccE: null,
    // 오브젝트 풀
    _enemyPool: [], _projPool: [], _gemPool: [], _boom: [],
    _grid: null,
  };
  g.need = expNeedFor(g, 1, !!(opt.join && opt.deck && !opt.raid));
  if (g.pvp) { g.meta = pvpCapMap(g.meta, pvpMeta); g.hstars = pvpCapMap(g.hstars, pvpStar); } // 1:1 대전: 강화 +10 · ★3 까지만
  if (g.metaSoft) {
    g.conds = opt.conds ? opt.conds.slice() : stageConds(g.stage, g.hell); // (opt.conds: 밸런스 측정용)
    for (const c of g.conds) g.cond[c] = 1;
    g.mission = stageMission(g.stage, g.hell, opt.conds);
    g.ccT = COND.cc.every[0] * 0.8;
  }
  // 주간 진상 특성 (opt.wtrait: live.js weekTrait 의 id) — 일반 스테이지 · 헬에서만
  g.wtr = mode === 'stage' && !wk && !evd && !opt.pvp && !opt.raid && !opt.tower && opt.wtrait && g.stage >= WEEK_TRAIT_FROM ? WEEK_TRAIT[opt.wtrait] || null : null;
  if (g.wtr) { if (g.wtr.crit) g.mods.crit += g.wtr.crit; if (g.wtr.ctrl) g.mods.ctrlMul *= g.wtr.ctrl; }
  g.stats.team = { repair: 0, prevent: 0, buff: 0 }; g.stats.teamBy = {}; // 팀 기여: 입구 수리 · 막은 피해 · 버프로 늘어난 피해 (멤버별)
  if (g.mapFx.exp) g.mods.expMul += g.mapFx.exp;
  if (mode === 'stage') g.mods.expMul *= wk ? 0.34 : stageExpMul(opt.stage || 1); // 뒤 스테이지는 진상이 많은 만큼 경험치를 줄여 레벨업 횟수를 비슷하게
  if (wmod.exp) g.mods.expMul += wmod.exp;
  if (opt.tempo && !opt.raid) { g.mods.expMul /= TEMPO.count; g.mods.ultCharge /= TEMPO.count; }
  if (g.slow) { g.mods.expMul /= SLOW_RUN.count; g.mods.ultCharge /= SLOW_RUN.count; g.mods.enemySpd *= SLOW_RUN.espd; }
  if (g.tension) g.mods.enemySpd *= TENSION.espd;
  if (g.hell) { g.mods.expMul *= HELL.exp || 1; g.mods.dmg *= (HELL.dmg || 1) * (HELL.chDmg[chapterOf(g.stage || 1) - 1] || 1) * ((HELL.stageDmg || {})[g.stage] || 1); } // 헬: 진상이 단단한 대신 한 판 성장 · 멤버 힘을 조금 더 (긴 싸움) // 긴장감: 진상이 입구까지 더 잘 온다 (꾸준히 조금씩 깎이게) // 느린 판: 진상이 적은 만큼 한 명당 경험치 · 총공지 더 · 천천히 걸어온다 // 진상이 적은 만큼 한 명당 경험치·총공지 충전을 더
  if (wmod.enemySpd) g.mods.enemySpd *= wmod.enemySpd;
  if (wmod.baseHp) { g.base.max = Math.round(g.base.max * wmod.baseHp); g.base.hp = g.base.max; }
  // 장비: 입구 내구도 +%
  let hpUp = 0;
  for (const k in g.gear) hpUp += (g.gear[k] && g.gear[k].hp) || 0;
  // 신화: 입구 초당 회복 (최대 내구도 비율) · 총공지 충전
  // 팀 장비: 총공지 충전 · 경험치(법인카드) · 입구 보호(경호원 무전기) — 멤버 것을 더하되 상한
  const team = { ult: 0, exp: 0, guard: 0 };
  for (const k in g.gear) { const q = g.gear[k] || {}; if (q.regen) g.mods.regen += q.regen * RULES.baseHp; for (const t in team) team[t] += q[t] || 0; }
  g.mods.ultCharge += Math.min(GEAR_TEAM_CAP.ult, team.ult);
  if (team.exp) g.mods.expMul *= 1 + Math.min(GEAR_TEAM_CAP.exp, team.exp);
  if (team.guard) g.mods.baseArmor *= 1 - Math.min(GEAR_TEAM_CAP.guard, team.guard);
  if (hpUp) { g.base.max = Math.round(g.base.max * (1 + hpUp)); g.base.hp = g.base.max; }
  // 도감 수집 보너스 (서버가 계산한 프로필 coll): 공격력 · 입구 내구도 · 경험치 — 1:1 대전은 빼요 (두 덱 전투력을 맞추는 판)
  g.coll = g.pvp ? null : collectMods(opt.coll); g.collAtk = g.coll ? g.coll.atk : 0;
  if (g.coll && g.coll.hp) { g.base.max = Math.round(g.base.max * (1 + g.coll.hp)); g.base.hp = g.base.max; }
  if (g.coll && g.coll.exp) g.mods.expMul *= 1 + g.coll.exp;
  if (opt.tower) towerSetup(g, opt); // 진상의 탑: 한 명 · 층 규칙
  if (evd) HWS.attach(g, evd); // 할로윈 이벤트: 저주 · 진상 기술 (hw-sim.js)
  if (wk && wk.v === 2 && !opt.raid) WKS.attach(g, wk); // 주간 도전 (weekly-sim.js) — 레이드도 weekly 칸을 쓰니 v2 판만
  if (opt.deck && opt.join && !opt.raid) {
    // 합류 모드: 대장(덱 1번) 한 명으로 시작 → 나머지는 레벨업 "합류" 카드로 (자리는 덱에서 정한 자리)
    const list = [];
    opt.deck.forEach((id, slot) => { if (id && HEROES[id] && slot < g.nPos) list.push({ id, slot }); });
    const lead = list.find((x) => x.id === opt.leader) || list[0];
    if (lead) addHero(g, lead.id, lead.slot);
    g.leader = lead ? lead.id : null;
    g.joinPool = list.filter((x) => x !== lead);
    if (opt.hell && JOIN.hellStart > 1) for (const x of g.joinPool.splice(0, JOIN.hellStart - 1)) addHero(g, x.id, x.slot); // 헬: 대장 + 한 명으로 시작
    g.joinTotal = g.joinPool.length;
    g.deckN = list.length; // (좁은 덱 보너스: 덱에 넣은 멤버 수)
    g.joinMode = true;
  } else if (opt.deck) {
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
  if (hasHero(g, id) || (!g._summoning && g.heroes.length >= Math.min(g.nPos, g.maxHeroes || 99))) return null; // 소환(성준영)은 자리가 꽉 차도 옆에 겹쳐서
  const def = HEROES[id] || SUMMONS[id];
  const used = new Set(g.heroes.map((h) => h.slot));
  const order = g.nPos >= 7 ? [3, 2, 4, 1, 5, 0, 6] : SLOT_ORDER;
  const slot = want !== undefined && !used.has(want) && want < g.nPos ? want : order.find((s) => !used.has(s));
  const h = {
    id, def, slot, x: g.slotX[slot], y: g.rowY, lv: 1, meta: g.metaSoft ? softMeta(Math.min(g.meta[id] || 0, TIER_MAX[HERO_TIER[id] || 1]), g.stage, g.hell) : Math.min(g.meta[id] || 0, TIER_MAX[HERO_TIER[id] || 1]), gear: g.pvp && g.gear[id] && g.gear[id].hellSet ? Object.assign({}, g.gear[id], { hellSet: 0 }) : g.gear[id] || {},
    cd: 0.3 + g.rng() * 0.4, charmT: 0, stunT: 0, rumorT: 0, fearT: 0, paperT: 0, vomitT: 0, blindT: 0, drowsyT: 0, grabT: 0, grabBy: 0, recoil: 0, shots: 0, joinT: 0,
    rage: false, rageT: def.soberSec ? def.soberSec[0] : 0, healT: def.care ? def.care.every[0] : 0,
    kills: 0, dmgDone: 0,
    skillCd: def.skill ? def.skill.cd * 0.5 * (1 - ((g.gear[id] && g.gear[id].cd) || 0)) * g.cdMul : 0, frenzyT: 0, frenzyCd: 0, // 스킬은 판 시작하고 절반쯤 지나야 첫 사용
    star: Math.max(1, Math.min(5, (g.hstars[id] | 0) || 1)), // 성급 (★1 = 기본)
    alt: false, altT: 0, ageT: def.age ? def.age.princess[0] : 0, echoT: 0, // 배현경 날씬 · 고아라 늙음 · 이호찬 메아리
    sarcT: 0, clingBy: 0, cm: {}, // cm: 멤버 전용 카드 효과
    beamE: null, beamUid: 0, beamT: 0, beamTick: 0, beam2E: null, kbT: 0, rx: g.slotX[slot],
    motoN: 0, meter: 0, upT: 0, burstT: 0, serious: 1, cafe: null, cafeT: 0, // 백인규 오토바이 게이지 · 문동한 간보기 · 카페인 풀충전
    out: false, outT: 0, restT: 0, px: g.slotX[slot], py: g.rowY, dashE: null, // 김영준 돌격
    awake: (g.awakeMap && g.awakeMap[id]) | 0, // 지옥 각성
    sig: !g.pvp && SIG[id] && g.gear[id] && g.gear[id].sig === id ? SIG[id].fx : null, // 전용 신화 새 효과 (1:1 대전은 끔)
  };
  Object.defineProperty(h, '_g', { value: g, enumerable: false, writable: true }); // 상태이상 면역 확인용 (저장에는 안 들어감)
  g.heroes.push(h);
  if (h.sig && h.sig.mark) g.sigMark = h.sig.mark; // 배현경 전용 신화: 표시 피해 +25%p
  if (id === 'bangjang') g.mods.ultCharge += NICHE.bangjang.ult * h.meta; // 방장: 강화할수록 총공지가 빨리 찬다
  if (id === 'gunnyeo') g.gnRes = Math.min(0.3, NICHE.gunnyeo.res * h.meta); // 건전녀: 강화할수록 멤버 전원 상태이상이 짧아진다 (입구 보호는 홍정민 몫)
  g.attrCount[def.attr] = (g.attrCount[def.attr] || 0) + 1;
  g.heroesUsed[id] = true;
  if (def.hidden) g.hiddenTaken[id] = true;
  ev(g, 'join', { hero: id, x: h.x, y: h.y, hidden: !!def.hidden });
  return h;
}

// 사거리: 맵 효과(비·안개·정전) 반영. seeAll = 지목 대상처럼 정전이어도 보이는 경우
export function heroRange(g, h, seeAll) {
  const d = h.def, fx = g.mapFx;
  const base = h.alt && d.diet ? d.diet.range : Array.isArray(d.range) ? d.range[h.lv - 1] : d.range;
  let r = base * (fx.range || 1) * (h.cm.range || 1) * (1 + Math.min(0.35, (h.gear && h.gear.range) || 0)); // 장비 사거리 (화면이 읽히게 +35% 까지)
  if (fx.longRange && base >= 400 && d.attr !== 'talk') r *= fx.longRange;
  if (g.darkT > 0 && !seeAll) r = Math.min(r, fx.seeR);
  if (g.rangeMul) r *= g.rangeMul; // 탑 어둠
  if (h.flyerT > 0) r *= 1 - (h.flyerCut || 0); // 삐끼왕 전단지 폭탄: 시야가 가려 사거리 ↓
  return r;
}
// 넓은 덱 (긴장감): 5번째 멤버부터 한 명마다 팀 공격 + (합류에 카드를 쓴 만큼 시너지로)
export function wideMul(g) { const W = TENSION.wide; let n = 0; for (const o of g.heroes) if (!o.def.summon && !o.gone) n++; const full = g.deckN || 6; return (1 + W.dmg * Math.max(0, n - W.from + 1)) * (1 + W.narrow * Math.max(0, 6 - full)); } // (좁은 덱: 덱에 넣은 멤버가 6명보다 적으면 한 칸마다 +narrow — 1~2명 캐리)
export function heroDamage(g, h) {
  const d = h.def;
  const fxm = (g.mapFx.attr && g.mapFx.attr[d.attr]) || 1;
  const flirt = g.flirt && d.gender === 'm' ? 1 - ENEMIES.scammer.scam.flirt : 1; // 예쁜 프사에 넋 나간 남자 멤버
  const old = (h.alt && d.age ? d.age.dmg : 1) * (h.sarcT > 0 ? 1 - ENEMIES.sarcasm.sarcasm.cut : 1) * (h.clingBy ? 1 - ENEMIES.jjijil.cling.cut : 1); // 늙음 · 돌려까기 · 찌질남
  const hc = (1 + (g.hcT > 0 && h.id !== 'hochan' ? g.hcBuff : 0) + (g.hcSkT > 0 ? g.hcSkAtk : 0)) * (g.rallyT > 0 && g.rallyDmg ? 1 + g.rallyDmg : 1) * (g.uirijuT > 0 ? 1.6 : 1) * (g.onemanT > 0 ? 1 + (g.onemanAtk || 0.3) : 1); // "랑방을 위하여!" · 집합! · 의리주 · 원맨쇼
  return (1 + (h.pump || 0)) * buildMul(g, h) * (g.tempo ? TEMPO.dmg * (TEMPO.fix[h.id] || 1) : 1) * (g.tension ? roleCadence(h.id).dmg * wideMul(g) * mileDmg(h.meta) * (g.mods.basicX || 1) : 1) * (g.joinMode && g.heroes.length === 1 ? JOIN.solo : 1) * (g.pvp && h.def.legend ? 0.9 : 1) * (1 + (h.grow || 0)) * TIER_MUL[HERO_TIER[h.id] || 1] * (1 + cmAtk(h)) * d.dmg * LEVEL_DMG[h.lv - 1] * (1 + TIER_GROWTH[HERO_TIER[h.id] || 1] * (h.id === 'hochan' && h.meta > BAL.hochan.metaSoft ? BAL.hochan.metaSoft + (h.meta - BAL.hochan.metaSoft) * BAL.hochan.metaAbove : h.meta)) * g.mods.dmg * (h.rage ? d.rageDmg : 1) * flirt * fxm * (1 + (h.gear.atk || 0)) * (1 + starBonus(h.star || 1)) * (1 + (g.collAtk || 0)) * old * hc * heroExtraMul(g, h) * (g.wtr && g.wtr.near ? (NEAR_HEROES.includes(h.id) ? g.wtr.near : g.wtr.far) : 1); // (끝: 주간 진상 특성 — 근접 · 원거리)
}
// 빌드 배율: 같은 속성 인원(자동) · 속성 결속 카드 · 특성 카드 · 진화
export function buildMul(g, h) {
  const m = g.mods, a = h.def.attr;
  let v = (1 + (ATTR_SET[Math.min(ATTR_SET.length - 1, g.attrCount[a] || 0)] || 0)) * (1 + (m.attrDmg[a] || 0));
  const tags = HERO_TAGS[h.id];
  if (tags) for (const t of tags) if (m.tagDmg[t]) v *= 1 + m.tagDmg[t];
  if (h.evo) v *= EVO_MUL.dmg;
  return v;
}
export const heroTags = (id) => HERO_TAGS[id] || [];
// 이 멤버 치명타 확률 (장비 포함)
function critOf(g, h) { return g.mods.crit + (h && h.gear ? h.gear.crit || 0 : 0) + ((h && h.saCrit) || 0) + (h && h._g && HEROES.byunghwa.aura.crit && byungNear(h._g, h) ? HEROES.byunghwa.aura.crit : 0); } // (+ 강병화 곁: 무대 조명 치명타)
// 뒷담화(수군수군)·공포(사기꾼 실물) 로 느려진 공격 속도 배율
const byungNear = (g, h) => { const b = g.heroes.find((o) => o.id === 'byunghwa' && !o.gone); return !!b && b !== h && Math.abs(b.x - h.x) <= HEROES.byunghwa.aura.r; };
export function heroSpeedMul(h) {
  return (h.rumorT > 0 ? 1 - ENEMIES.inpi_gossip.rumor.cut : 1) * (h.fearT > 0 ? 1 - ENEMIES.scammer.scam.fear : 1)
    * (h.paperT > 0 ? 1 - ENEMIES.boss_loan.paper.cut : 1)
    * (h.vomitT > 0 ? 1 - ENEMIES.vomit.puke.cut : 1) * (h.drowsyT > 0 ? 1 / (1 + ENEMIES.kkondae.latte.slow) : 1) * (h.aspdDebT > 0 ? 1 - (h.aspdDebCut || 0.25) : 1) * (h._g && h._g.tambT > 0 ? 1.4 : 1) * (h._g && h._g.uirijuT > 0 ? 1.2 : 1) * (h._g && HEROES.byunghwa.aura.spd && byungNear(h._g, h) ? 1 + HEROES.byunghwa.aura.spd : 1) * (h.chantT > 0 && h._g ? 1 + (h._g.chantSpd || 0) : 1); // 노래방 탬버린 +40% · 의리주 +20% · (예전) 강병화 곁 · 김도훈 떼창
}
// 공격 속도 배율: 전투 계산과 화면 표시가 같은 식을 쓴다 (강화·장비·카드·증강·오라·기진맥진·템포 모두)
export function heroRate(g, h, aura = auraBonus(g, h), sing = 0) {
  const d = h.def;
  return (h.poisonT > 0 ? KD.poison.spd : 1) * (h.tiredT > 0 ? MOMENTUM.tiredSpd : 1) * (g.tempo ? TEMPO.rate : 1) * (g.tension ? mileSpd(h.meta) / roleCadence(h.id).iv : 1) * (g.bossSlowT > 0 ? 1 - (g.bossSlowCut || 0.25) : 1) * g.mods.spd * (1 + aura) * heroSpeedMul(h) * TIER_SPD[HERO_TIER[h.id] || 1] * (g.mapFx.heroSpd || 1) * (1 + (g.rallyT > 0 ? g.rallySpd : 0)) * (1 + sing) * (1 + (h.gear.spd || 0)) * (h.evo ? 1 + EVO_MUL.spd : 1) * (h.fanT > 0 ? 1 + (h.fanSpd || 0) : 1) * (h.cheerT > 0 ? 1 + HEROES.gunnyeo.care.cheer.spd : 1) / (h.rage ? d.rageInterval : 1) / (h.alt && d.age ? d.age.slow : 1);
}
// 실제 공격 간격 (초): 기본 간격 ÷ 공격 속도 배율 (탄창 무기는 평균)
export function heroInterval(g, h) {
  const d = h.def;
  let iv = (h.alt && d.diet ? d.diet.interval : d.interval) * LEVEL_INTERVAL[h.lv - 1];
  if (d.lv5Interval && h.lv >= 5) iv *= d.lv5Interval;
  return iv / heroRate(g, h);
}
// 방장의 존재감: 대장(1번)이면 모두에게 · 아니면 곁(2칸) 멤버에게만 절반
export function auraBonus(g, h) {
  const b = hasHero(g, 'bangjang');
  if (!b) return 0;
  const v = HEROES.bangjang.aura[b.lv - 1] + (b.cm.aura || 0) + NICHE.bangjang.aura * (b.meta || 0); // 강화할수록 오라가 커진다
  if (!g.leader || g.leader === 'bangjang') return v;
  if (!h) return 0;
  return h === b || Math.abs(h.x - b.x) <= 130 ? v * 0.5 : 0;
}

function updateHeroes(g, dt) {
  if (g.heroes.some((h) => h.gone)) g.heroes = g.heroes.filter((h) => !h.gone);
  teamBuffs(g);
  const aura = auraBonus(g);
  // 김도훈 떼창: 곁 멤버 공속 (입구 회복은 홍정민 몫이라 뺐다)
  const singers = g.heroes.filter((o) => o.def.sing && o.stunT <= 0 && o.grabT <= 0);
  if (g.phase !== 'test') for (const d0 of singers) if (d0.def.regen) healDoor(g, d0.id, g.base.max * d0.def.regen[d0.lv - 1] * dt * g.mods.healMul * (d0.cm.heal || 1));
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
    if (h.aspdDebT > 0) h.aspdDebT -= dt;
    if (h.ccImmT > 0) h.ccImmT -= dt;
    if (h.heartT > 0) h.heartT -= dt; if (h.fanT > 0) h.fanT -= dt; if (h.cheerT > 0) h.cheerT -= dt; // 건전녀 하트 방패 표시 · 송바울 팬클럽 함성 · 건전녀 "힘내요!"
    if (h.grabT > 0) { h.grabT -= dt; if (h.grabT <= 0) h.grabBy = 0; }
    if (h.fearT > 0) h.fearT -= dt;
    if (h.sarcT > 0) h.sarcT -= dt;
    if (h.silenceT > 0) h.silenceT -= dt;
    if (h.flyerT > 0) h.flyerT -= dt;
    if (h.muteT > 0) h.muteT -= dt; if (h.freezeT > 0) h.freezeT -= dt; if (h.thawT > 0) h.thawT -= dt; // 7장: 침묵(스킬 막힘) · 빙결 표시 · 녹은 뒤 잠깐 면역
    if (h.skillCd > 0 && !(h.silenceT > 0)) h.skillCd -= dt;
    if (g.kdOn) { kdTick(g, h, dt); if (h.kdT > 0) { h.beamE = null; h.beam2E = null; continue; } } // 쓰러짐: 아무것도 못 함
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
          h.rageT = (d.rageSec[h.lv - 1] + (h.cm.rage || 0)) * (g.mapFx.rage || 1) * ((h.sig && h.sig.rageMul) || 1);
          ev(g, 'rage', { hero: h.id, x: h.x, y: h.y });
        }
      }
    }
    // 배현경: 다이어트 게이지 → 날씬 모드 (10초 뒤 요요)
    if (d.diet) {
      if (h.alt) { h.altT -= dt; if (h.altT <= 0) { h.alt = false; h.meter = 0; ev(g, 'yoyo', { hero: h.id, x: h.x, y: h.y }); } }
      else if (g.phase === 'wave' || g.phase === 'intro') { h.meter += d.diet.perSec * dt; if (h.meter >= 100) dietOn(g, h, 0); }
    }
    // 고아라: 공주 ↔ 폭삭 늙음
    if (d.age) {
      h.ageT -= dt;
      if (h.ageT <= 0 && h.sig && h.sig.ageless && !h.alt) h.ageT = d.age.princess[h.lv - 1]; // 고아라 전용 신화: 늙지 않는다
      if (h.ageT <= 0) {
        h.alt = !h.alt;
        h.ageT = h.alt ? d.age.old[h.lv - 1] * (h.sa && h.sa.forever ? 0.6 : 1) : d.age.princess[h.lv - 1] + (h.cm.young || 0);
        ev(g, h.alt ? 'aged' : 'young', { hero: h.id, x: h.x, y: h.y });
      }
    }
    // 오지은: 공격 · 스킬 때만 악마 모습
    if (d.demon && h.alt) { h.altT -= dt; if (h.altT <= 0) h.alt = false; }
    // 정소영: 잔소리 게이지 → 성준영 소환
    // 정소영: 성준영은 스킬(올인 콜)로만 부른다
    // 성준영: 돌아다니며 진상을 쓸어 모은다 (체력이 다 떨어지면 "올인!" 하고 퇴근) — 평소 공격 없음
    if (d.summon) { updateJunyoung(g, h, dt); continue; }
    // 홍정민: 틈틈이 붕대로 입구 수리 (탁탁)
    if (d.repair && g.phase !== 'test') {
      h.repT = (h.repT || 0) + dt;
      if (h.repT >= (h.lv >= 5 && d.repair.every5 ? d.repair.every5 : d.repair.every) && h.stunT <= 0 && h.charmT <= 0) {
        h.repT = 0;
        const v = healDoor(g, h.id, g.base.max * d.repair.pct[h.lv - 1] * g.mods.healMul * (h.lv >= 3 ? 1.2 : 1) * (h.cm.heal || 1));
        if (v > 0) ev(g, 'bandage', { x: h.x, y: g.ropeY + 8, v: Math.round(v), hero: h.id });
      }
    }
    // 스킬 진화: 한 번 더
    if (h.echoSk) { h.echoSk.t -= dt; if (h.echoSk.t <= 0) { const e0 = h.echoSk; h.echoSk = null; castSkill(g, h, e0.x, e0.y, true); } }
    // 전용 신화: 스킬 한 번 더 (같은 세기)
    if (h.sigEcho) { h.sigEcho.t -= dt; if (h.sigEcho.t <= 0) { const e0 = h.sigEcho; h.sigEcho = null; if (castSkill(g, h, e0.x, e0.y, 'sig')) ev(g, 'sigFx', { hero: h.id, x: h.x, y: h.y }); } }
    if (h.cafe) cafeTick(g, h, dt); // 문동한 카페인 풀충전
    if (h.cafeT > 0) h.cafeT -= dt;
    if (h.mzQ && h.mzQ.length) mosaicTick(g, h, dt); // 여지원 모자이크 폭격: 손이 차례로 내려친다
    // 이호찬 5레벨: 파동 메아리
    if (h.echoT > 0) { h.echoT -= dt; if (h.echoT <= 0) crownWave(g, h, heroDamage(g, h) * 0.7, 0); }
    // 건전녀 간호: 주기마다 멤버 상태이상 전부 풀기 (풀린 멤버는 잠깐 면역) · 지친 멤버(기진맥진) 빨리 일으키기 — 입구 수리는 홍정민 몫
    if (d.care && g.phase !== 'test') {
      h.healT -= dt * (h.cm.care || 1) * (1 + NICHE.gunnyeo.care * (h.meta || 0)) * ((h.sig && h.sig.careMul) || 1); // 건전녀 전용 신화: 간호가 더 자주
      if (h.healT <= 0 && h.stunT <= 0 && h.charmT <= 0) {
        const C = d.care, k = h.lv - 1;
        h.healT = C.every[k];
        let n = 0;
        if (C.door && !g.pvp && g.phase === 'wave' && g.base.hp < g.base.max) { const v = healDoor(g, h.id, g.base.max * C.door[k] * (g.mods.healMul || 1)); if (v > 0) ev(g, 'heal', { x: g.W / 2 + (g.rng() - 0.5) * 80, y: g.ropeY, v: Math.round(v), hero: h.id, care: true }); } // (10/08) 입구도 조금씩 — 초보도 고를 수 있는 입구 지킴이
        for (const o of g.heroes) {
          if (cleanseHero(o, 0.3)) { o.ccImmT = Math.max(o.ccImmT || 0, C.guard[k]); o.cheerT = C.cheer.sec; n++; ev(g, 'cleanse', { x: o.x, y: o.y }); }
          if (o.tiredT > 0.3) { o.tiredT = Math.max(0, o.tiredT - C.tired[k]); o.cheerT = C.cheer.sec; n++; ev(g, 'care', { x: o.x, y: o.y, hero: o.id }); }
        }
        if (!n && g.phase === 'wave') { const tops = g.heroes.filter((o) => o !== h && !o.def.summon && !o.gone).sort((a, b) => b.dmgDone - a.dmgDone).slice(0, (h.sig && h.sig.cheerN) || 1); for (const top of tops) { top.cheerT = C.cheer.sec; ev(g, 'care', { x: top.x, y: top.y, hero: top.id, cheer: true }); } } // 아픈 멤버가 없으면 제일 잘 싸우는 멤버에게 "힘내요!" (전용 신화: 3명)
      }
    }
    if (h.charmT > 0 || h.stunT > 0 || h.grabT > 0) {
      h.beamE = null; h.beam2E = null;
      if (d.proj === 'dash') { // 김영준: 돌격 중에 묶이면 (탑) 돌격이 끊기고 · 숨 고르기 중이면 자리로 마저 돌아온다 (진상 사이에 달리는 모습으로 굳지 않게)
        if (h.out && g.twa) dashBreak(g, h);
        if (!h.out && h.px !== undefined) { h.px += (h.x - h.px) * Math.min(1, dt * 10); h.py += (h.y - h.py) * Math.min(1, dt * 10); }
      }
      continue;
    }
    let sing = 0;
    for (const d0 of singers) if (d0 !== h && Math.abs(d0.x - h.x) <= d0.def.sing.r) sing = Math.max(sing, d0.def.sing.spd[d0.lv - 1]);
    const rate = heroRate(g, h, auraBonus(g, h), sing);
    // 정소영: 진상은 안 때리고 잔소리로 성준영을 부린다 (잔소리 = 준영 체력 · 부르기 게이지)
    if (d.proj === 'nag') { updateNag(g, h, dt, rate); continue; }
    // 송바울: 기본 공격 없이 보드 돌진 (탭한 곳 · 아니면 알아서) · 몇 번 타면 보드 정비
    if (d.proj === 'board') { updateBoard(g, h, dt, rate); continue; }
    // 문동한: 간보기 게이지 → 일어나서 한 줄 빔
    if (d.meter) {
      if (h.upT > 0) h.upT -= dt;
      if (h.burstT > 0) { h.burstT -= dt; if (h.burstT <= 0) lazyBurst(g, h); continue; }
      let near = 0;
      for (const e of g.enemies) if (!e.dead && e.y > g.ropeY - d.meter.nearY) near++;
      if (g.phase === 'wave' || g.phase === 'intro') h.meter += dt * (d.meter.base[h.lv - 1] + d.meter.perNear * Math.min(near, 12) + d.meter.hpLow * (1 - g.base.hp / g.base.max)) * (h.sa && h.sa.fastmeter ? 1.4 : 1);
      if (h.cafe) { h.meter = Math.min(100, h.meter); continue; } // 카페인 풀충전 중엔 과자 · 빔 대신 캔커피만 (게이지는 계속 차서 끝나면 바로 빔)
      if (h.meter >= 100 && g.enemies.some((e) => !e.dead && e.y > 0)) { h.meter = 100; h.burstT = d.burst.windup; h.upT = d.burst.windup + d.burst.rest; ev(g, 'lazyUp', { x: h.x, y: h.y }); continue; }
      h.meter = Math.min(100, h.meter);
    }
    // 건전남 스킬 '난사': 가까운 진상에게 폭풍 연사
    if (h.frenzyT > 0) {
      h.frenzyT -= dt;
      h.frenzyCd -= dt;
      while (h.frenzyCd <= 0) {
        h.frenzyCd += d.skill.every;
        if (!h.aimFix && (!h.aimT || g.t - h.aimT > 0.3)) { const b = bestLineAngle(g, h.x, h.y, heroRange(g, h), 12); h.aimA = b ? b.a : null; h.aimT = g.t; } // (찍은 퀵드로우는 그 방향 그대로)
        if (h.aimA === null || h.aimA === undefined) { h.frenzyCd = 0.05; break; }
        const a = h.aimA + (g.rng() - 0.5) * 0.3; // 부채꼴로 퍼진다
        spawnProj(g, d.pistol ? 'pistol' : 'bullet', h, null, heroDamage(g, h) * 0.55 * (d.pistol ? 0.4 : 1) * (h.sa && h.sa.frenzy ? 1.2 : 1), { angle: a, pierce: Infinity, critBonus: d.critBonus || 0, r: 8.5, speed: d.pistol ? d.pistol.speed : undefined });
        h.lastShotT = g.t;
        if (g.rng() < 0.3) ev(g, 'shot', { hero: h.id, x: h.x, y: h.y });
      }
    }
    // 이호찬 (템포): 게이지가 차면 막차 버스
    if (g.tempo && WEAPON[h.id] && WEAPON[h.id].kind === 'gauge') {
      if (g.phase === 'wave' || g.phase === 'intro') h.meter = Math.min(100, (h.meter || 0) + dt * rate * (100 / BUS.sec[h.lv - 1]) / TEMPO.rate * (g.heroes.length === 1 ? 2 : 1)); // 혼자인 대장이면 두 배로 빨리
      if (h.meter >= 100 && g.enemies.some((e) => !e.dead && e.y > 0 && Math.abs(e.x - h.x) < 160)) launchBus(g, h);
      continue;
    }
    // 이한나: 하트 레이저 (쏘는 동안 계속)
    if (d.proj === 'beam') { updateBeam(g, h, dt, rate); continue; }
    // 김영준: 뛰어들어 연속 베기 → 돌아와 크로스핏
    if (d.proj === 'dash') { updateDash(g, h, dt, rate); continue; }
    // 운영진 · 건전남: 곁(사거리 60%)의 숨은 진상을 찾아내 모두가 칠 수 있게 (스테이지 조건 '숨은 진상')
    if (g.cond.stealth && REVEAL_HEROES.includes(h.id) && (h.revT = (h.revT || 0) - dt) <= 0) { h.revT = 0.25; const rr = heroRange(g, h) * 0.6; for (const e of g.enemies) if (!e.dead && !e.unveiled && Math.hypot(e.x - h.x, e.y - h.y) < rr) { e.unveiled = true; ev(g, 'unveil', { x: e.x, y: e.y - 30, eye: true }); } }
    // 배현경: 사거리 안 숨은 적을 드러낸다 (날씬 모드면 화면 전체 · 표시 1.5초)
    if (h.id === 'hyungyeong') { const rr = h.alt ? 1e9 : heroRange(g, h); for (const e of g.enemies) if (!e.dead && !e.unveiled && (h.alt || Math.hypot(e.x - h.x, e.y - h.y) < rr)) { e.unveiled = true; e.markT = Math.max(e.markT || 0, 1.5); ev(g, 'unveil', { x: e.x, y: e.y - 30, eye: true }); } }
    // 윤정섭: 뚜벅뚜벅 걸어 올라가며 밀어낸다 → 끝에서 돌아와 앉아서 쉰다
    if (d.proj === 'wall') { updateWall(g, h, dt); if (h.sig && h.sig.twin && h.wallSt === 'out' && h._lastWS !== 'out') spawnTwin(g, h); h._lastWS = h.wallSt; continue; }
    // 정원식 결정사 상담 중: 걸어 나가기 → 앉아서 도발 → 돌아오기 (그동안 평소 공격 없음)
    if (h.wsSt) { updateConsult(g, h, dt); continue; }
    // 고아라: 할머니 = 뒤에서 지팡이 톡톡 · 공주 = 제일 센 적에게 돌진해 망치 한 방씩
    if (h.id === 'ara' && g.tempo) { updateAra(g, h, dt, rate); continue; }
    if (h.chantT > 0) h.chantT -= dt; // 김도훈 떼창
    if (h.burstQ > 0 && (h.burstT -= dt * rate) <= 0) { const e0 = h.burstE && !h.burstE.dead ? h.burstE : findTarget(g, h); if (e0) { pistolShot(g, h, e0, h.burstI++); h.burstQ--; h.burstT = d.pistol.gap; } else h.burstQ = 0; } // 건전남 연발: 탕 · 탕 · 탕
    const base = (h.alt && d.diet ? d.diet.interval : d.interval) * LEVEL_INTERVAL[h.lv - 1] * (d.lv5Interval && h.lv >= 5 ? d.lv5Interval : 1);
    h.cd -= dt * rate;
    if (h.reloadT > 0) h.reloadT -= dt * rate;
    if (h.cd <= 0) {
      const t = d.proj === 'hammer' ? bossTarget(g, h, heroRange(g, h)) : findTarget(g, h);
      if (!t) {
        h.cd = 0;
        // 감시: 사거리 안에 진상이 있는데 공격 간격 2배 넘게 못 쏘면 → 다시 찾기 (자기 줄 제한 · 지목 무시)
        h.idleT = (h.idleT || 0) + dt;
        if (!d.lane && h.idleT > base * 2) {
          const r0 = heroRange(g, h);
          const t2 = g.enemies.filter((e) => !e.dead && inRange(h, e, r0)).sort((a, b) => b.y - a.y)[0];
          if (t2) { g.idleFix = (g.idleFix || 0) + 1; h.idleT = 0; fire(g, h, t2); h.cd += weaponGap(g, h, base); }
        }
        continue;
      }
      h.idleT = 0;
      fire(g, h, t);
      if (h.sig && h.sig.multi && d.proj !== 'bullet' && d.proj !== 'pistol' && (!h.sig.rageOnly || h.rage)) { const t2 = otherTarget(g, h, t); if (t2) { const sh = h.shots; h._sigK = h.sig.multiK || 1; fire(g, h, t2); h._sigK = 0; h.shots = sh; } } // 전용 신화: 한 번에 두 발
      h.cd += weaponGap(g, h, base);
      if (h.cd < 0) h.cd = 0;
    }
  }
  if (g.twins && g.twins.length) updateTwins(g, dt);
}
// 멤버 상태이상 전부 풀기 (건전녀 간호 · 응급 방패 · 앵콜 · 원맨쇼) — 하나라도 min 초 넘게 걸려 있었으면 true
const SICK = ['stunT', 'charmT', 'rumorT', 'paperT', 'fearT', 'vomitT', 'blindT', 'drowsyT', 'silenceT', 'muteT', 'grabT', 'aspdDebT', 'sarcT', 'flyerT', 'freezeT', 'poisonT'];
export function cleanseHero(o, min = 0) {
  let sick = false;
  for (const k of SICK) if (o[k] > min) { sick = true; break; }
  if (!sick) return false;
  for (const k of SICK) if (o[k] > 0) o[k] = 0;
  o.grabBy = 0;
  return true;
}
// 박상화 성장 (전용 신화: 한도 · 속도 2배)
function growBy(h, v) { const gm = h.def.grow, k = (h.sig && h.sig.growMul) || 1; h.grow = Math.min((gm.max + (h.lv >= 3 ? 0.1 : 0) + (h.cm.growMax || 0)) * k, (h.grow || 0) + v * k); }
// 전용 신화 두 번째 표적: 이 멤버가 노릴 다른 진상 (없으면 사거리 안 가장 가까운 다른 진상)
function otherTarget(g, h, t) {
  const t2 = findTarget(g, h, [t]);
  if (t2) return t2;
  const r = heroRange(g, h); let best = null, bd = 1e18;
  for (const e of g.enemies) { if (e.dead || e === t || e.y < -20 || isHidden(e)) continue; const d2 = (e.x - h.x) ** 2 + (e.y - h.y) ** 2; if (d2 < bd && d2 <= r * r) { bd = d2; best = e; } }
  return best;
}
// 윤정섭 전용 신화: 옆 줄 그림자 정섭 (같이 밀고 올라갔다 돌아오면 사라진다)
function spawnTwin(g, h) {
  const W0 = h.def.wall, lv = h.lv - 1, gap = (g.slotX[1] - g.slotX[0]) || 58;
  const side = (dx) => { const x = h.x + dx; if (x < 24 || x > g.W - 24) return -1; let n = 0; for (const e of g.enemies) if (!e.dead && e.y > 0 && Math.abs(e.x - x) < gap * 0.7) n++; return n; };
  const l = side(-gap), r = side(gap);
  const x = r > l ? h.x + gap : l >= 0 ? h.x - gap : h.x + gap;
  const tw = { id: h.id, def: h.def, lv: h.lv, meta: h.meta, sa: h.sa || {}, sig: h.sig, gear: h.gear, cm: h.cm, star: h.star, awake: h.awake, src: h, twin: true,
    growT: h.growT || 0, x, y: h.y, px: x, py: h.y, wallSt: 'out', out: true, restT: 0, wallHp: W0.hp[lv] * (1 + h.meta * 0.05) * (h.growT > 0 ? 1.5 : 1) };
  (g.twins || (g.twins = [])).push(tw);
  ev(g, 'wallGo', { x: tw.x, y: tw.y, twin: true });
  ev(g, 'sigFx', { hero: h.id, x: tw.x, y: tw.y, twin: true });
}
function updateTwins(g, dt) {
  for (const tw of g.twins) { updateWall(g, tw, dt); if (tw.wallSt === 'rest' || !g.heroes.includes(tw.src)) tw.done = true; }
  g.twins = g.twins.filter((tw) => !tw.done);
}

// 줄(직선) 스킬 자동 조준: 사거리 안에서 가장 많은 진상이 걸리는 방향 (위쪽 반원 24방향)
//  halfW: 직선 반쪽 폭. 아무도 없으면 null
export function bestLineAngle(g, x, y, range, halfW) {
  let best = null, bn = 0;
  for (let k = 0; k <= 24; k++) {
    const a = -Math.PI + (k / 24) * Math.PI; // -π(왼쪽) … -π/2(위) … 0(오른쪽)
    const cx = Math.cos(a), cy = Math.sin(a);
    let n = 0;
    for (const e of g.enemies) {
      if (e.dead || e.y < -30) continue;
      const dx = e.x - x, dy = e.y - y, along = dx * cx + dy * cy;
      if (along < 0 || along > range) continue;
      if (Math.abs(dx * cy - dy * cx) <= halfW + (e.r || 16)) n++;
    }
    if (n > bn || (n === bn && n > 0 && Math.abs(a + Math.PI / 2) < Math.abs(best + Math.PI / 2))) { bn = n; best = a; }
  }
  return bn > 0 ? { a: best, n: bn } : null;
}
// 범위 스킬 자동 조준: 사거리 안에서 반지름 r 에 가장 많이 들어오는 곳 (진상 위치를 후보로)
export function densestPoint(g, x, y, range, r) {
  let best = null, bn = 0;
  const r2 = r * r, rg2 = range * range;
  for (const e of g.enemies) {
    if (e.dead || e.y < -20) continue;
    const dx0 = e.x - x, dy0 = e.y - y;
    if (dx0 * dx0 + dy0 * dy0 > rg2) continue;
    let n = 0;
    for (const o of g.enemies) { if (o.dead) continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy <= r2) n++; }
    if (n > bn) { bn = n; best = e; }
  }
  return best ? { x: best.x, y: best.y, n: bn } : null;
}
// 이한나 스킬 진화: 하트 레이저 풀파워 — 진상이 가장 많이 늘어선 방향으로 화면 끝까지 꿰뚫는 굵은 빔 (한 번에 전부)
export function heartBeam(g, h, dmg, b) {
  const bw = bestLineAngle(g, h.x, h.y, b.len, b.hw);
  const a = bw ? bw.a : -Math.PI / 2;
  const q = { x0: h.x, y0: h.y - 30, a, d: b.len, hw: b.hw };
  let n = 0;
  for (const e of g.enemies) if (!e.dead && e.y > -20 && harleyBand(q, e)) { damageEnemy(g, e, dmg, false, h, true); n++; }
  (g.hbeams = g.hbeams || []).push({ x: q.x0, y: q.y0, a, len: b.len, hw: b.hw, t: 0.6 });
  ev(g, 'heartBeam', { x: h.x, y: h.y, n });
  return n;
}
// 백인규 할리: 지나온 3칸 폭 띠 안 진상은 전부 계속 따끔 · 달리는 쪽으로 밀고 느리게 (보스는 안 밀림)
export function harleyBand(q, e) {
  const cx = Math.cos(q.a), cy = Math.sin(q.a);
  const dx = e.x - q.x0, dy = e.y - q.y0, along = dx * cx + dy * cy;
  return along >= -20 && along <= q.d + 50 && Math.abs(dx * cy - dy * cx) <= q.hw + (e.r || 16);
}
export function launchBus(g, h) {
  h.meter = 0;
  const big = !!h.evo;
  (g.buses || (g.buses = [])).push({ hero: h, x: h.x, y: g.rowY + 30, w: big ? BUS.w2 : BUS.w, big, dmg: heroDamage(g, h) * BUS.dmg, stun: (h.lv >= 5 ? BUS.stun : g.pvp ? BUS.stun * 0.5 : 0) * (g.pvp ? 1.5 : 1), hit: new Set() }); // 대전: 기절 ×1.5 (Lv5 전에도 조금)
  ev(g, 'bus', { hero: h.id, x: h.x, y: g.rowY, big });
}
function updateBuses(g, dt) {
  for (const b of g.buses) {
    b.y -= BUS.speed * dt;
    for (const e of g.enemies) {
      if (e.dead || b.hit.has(e.uid) || Math.abs(e.x - b.x) > b.w / 2 + e.r || e.y > b.y + 50 || e.y < b.y - 60) continue;
      b.hit.add(e.uid);
      damageEnemy(g, e, b.dmg * (b.gold && (e.boss || e.mid) ? BAL.hochan.busBoss : 1), false, b.hero, true);
      { const hb = b.hero, bf = hb.def.buff; if (bf && !b.gold) { g.hcBuff = g.hcT > 0 ? Math.min(bf.max + (hb.cm.buff || 0), g.hcBuff + bf.per) : bf.per; g.hcT = bf.sec[hb.lv - 1] + 1; } } // "랑방을 위하여!" 템포에선 버스가 친 진상마다 모두 공격력 + (예전엔 템포에서 안 붙었음)
      if (e.dead) continue;
      pushUp(g, e, BUS.kb); if (!e.boss && !e.mid) e.x += (e.x < b.x ? -1 : 1) * 14;
      if (b.stun) e.stunT = Math.max(e.stunT, b.stun * (e.boss ? 0.4 : 1));
    }
  }
  g.buses = g.buses.filter((b) => b.y > -120);
}
function updateHarleys(g, dt) {
  for (const q of g.harleys) {
    q.t -= dt; q.d = Math.min(q.len, q.d + q.v * dt); q.tick -= dt;
    q.x = q.x0 + Math.cos(q.a) * q.d; q.y = q.y0 + Math.sin(q.a) * q.d;
    if (q.tick <= 0) {
      q.tick = 0.25;
      for (const e of g.enemies) {
        if (e.dead || !harleyBand(q, e)) continue;
        damageEnemy(g, e, q.dmg, false, q.hero, true);
        if (e.dead) continue;
        if (!e.boss && !e.mid) { e.x += Math.cos(q.a) * q.kb; e.y += Math.sin(q.a) * q.kb; }
        if (q.slow > 0) { e.slowT = Math.max(e.slowT, 0.6); e.slowMul = Math.min(e.slowMul || 1, 1 - q.slow * (e.boss ? 0.5 : 1)); }
      }
    }
  }
  g.harleys = g.harleys.filter((q) => q.t > 0);
}
// 블랙홀: 빨아들이기 (보스는 약하게) · 따끔 · 끝나면 쾅 (모인 만큼 더 세게, 최대 ×3)
function updateHoles(g, dt) {
  for (const q of g.holes) {
    q.t -= dt; q.tick -= dt;
    const pull = 130 * dt;
    forEnemiesNear(g, q.x, q.y, q.r, (e) => {
      const dx = q.x - e.x, dy = q.y - e.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const k = Math.min(d, pull * (e.boss || e.mid ? 0.25 : 1));
      e.x += (dx / d) * k; e.y += (dy / d) * k * 0.6;
      if (q.tick <= 0) damageEnemy(g, e, q.dmg, false, q.hero, true);
      return true;
    });
    if (q.tick <= 0) q.tick = 0.3;
    if (q.t <= 0) {
      let n = 0;
      forEnemiesNear(g, q.x, q.y, q.core * 1.2, () => { n++; return true; });
      const mul = Math.min(3, 1 + n / 6); // 모아서 한 방
      forEnemiesNear(g, q.x, q.y, q.core * 1.2, (e) => { damageEnemy(g, e, q.boom * mul / 3, false, q.hero, true); if (!e.dead) e.stunT = Math.max(e.stunT, (e.boss ? 0.4 : 1) * stunMul(e)); return true; });
      ev(g, 'bhBoom', { x: q.x, y: q.y, r: q.core * 1.2, n, mul: +mul.toFixed(2) });
    }
  }
  g.holes = g.holes.filter((q) => q.t > 0);
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
    const ramp = 1 + Math.min(d.rampMax + (h.sa && h.sa.focus ? 0.8 : 0), d.ramp[lv - 1] * (h.cm.ramp || 1) * h.beamT);
    const dmg = heroDamage(g, h) * (d.beamTick / d.interval) * ramp;
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, t, dmg * (crit ? g.mods.critMul : 1), crit, h);
    if (lv >= 5 || (h.sig && h.sig.beam2)) {
      // 두 번째 갈래: 가까운 다른 진상 (전용 신화: 처음부터 · 100%)
      let o = h.beam2E && !h.beam2E.dead && inRange(h, h.beam2E, range) && h.beam2E !== t ? h.beam2E : null;
      if (!o) { o = null; let bd = 1e9; for (const e of g.enemies) { if (e.dead || e === t || !inRange(h, e, range)) continue; const dd = Math.abs(e.x - t.x) + Math.abs(e.y - t.y); if (dd < bd) { bd = dd; o = e; } } }
      h.beam2E = o;
      if (o) damageEnemy(g, o, dmg * (h.sig && h.sig.beam2 ? 1 : 0.6), false, h);
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
    h.out = true; h.outT = (d.outSec[lv - 1] + (h.cm.out || 0)) * (g.tower && g.tower.swarm ? TOWER_SIM.dash.swarmOut : 1); h.dashE = t; h.upT = h.outT; h.cd = 0; // 탑 떼거리: 둘러싸여 금방 지친다
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
    if (d.hop && (h.hopN = (h.hopN | 0) + 1) >= d.hop.n) { // 김영준: 세 번 베면 곁의 다른 진상으로 휙 (고양이 건너뛰기)
      h.hopN = 0;
      let o2 = null, bd = d.hop.r * d.hop.r;
      for (const o of g.enemies) { if (o === t || o.dead || o.y < 0 || o === h.lastHopE) continue; const d2 = (o.x - t.x) ** 2 + (o.y - t.y) ** 2; if (d2 < bd) { bd = d2; o2 = o; } }
      if (o2) { h.lastHopE = t; h.dashE = o2; ev(g, 'catHop', { x: t.x, y: t.y - 10, x2: o2.x, y2: o2.y - 10 }); }
    }
  }
  if (h.outT <= 0 || (!t && h.outT < d.outSec[lv - 1] - 0.3)) {
    h.out = false; h.upT = 0; h.restT = d.restSec[lv - 1] * (h.sa && h.sa.endless ? 0.6 : 1) * (g.tower && g.tower.swarm ? TOWER_SIM.dash.swarmRest : 1); h.restMax = h.restT; h.dashE = null; // restMax: 머리 위 회복 게이지
    ev(g, 'crossfit', { x: h.x, y: h.y });
  }
}
// 윤정섭: 걷기(밀기) → 돌아오기 → 쉬기 · 맞으면 체력이 줄고 0 이면 일찍 돌아와 오래 쉰다
function updateWall(g, h, dt) {
  const W0 = h.def.wall, lv = h.lv - 1;
  const sa = h.sa || {}, hpK = sa.giant ? 1.5 : 1, TW = g.tower ? TOWER_SIM.wall : null; // 탑(혼자): 더 넓게 · 빨리 · 덜 쉰다
  if (h.wallHp === undefined) { h.wallHp = W0.hp[lv] * (1 + h.meta * 0.05) * hpK; h.wallSt = 'rest'; h.restT = 1.5; h.px = h.x; h.py = h.y; }
  const big = (h.growT > 0 ? h.def.skill.grow : 1) * (sa.giant ? 1.3 : 1);
  if (h.growT > 0) h.growT -= dt;
  if (h.wallSt === 'rest') { h.out = false; h.restT -= dt; h.px = h.x; h.py = h.y; if (h.restT <= 0 && (g.phase === 'wave' || g.phase === 'test') && g.enemies.some((e) => !e.dead && e.y > 0)) { h.wallSt = 'out'; h.wallHp = W0.hp[lv] * (1 + h.meta * 0.05) * hpK; ev(g, 'wallGo', { x: h.x, y: h.y }); } return; }
  h.out = true;
  if (h.wallSt === 'out') {
    const v = W0.speed[lv] * (h.growT > 0 ? 1.25 : 1) * (sa.stride ? 1.3 : 1) * (TW ? TW.spd : 1); // 뚜벅뚜벅 — 절대 뛰지 않는다
    h.py -= v * dt;
    const hw = (Array.isArray(W0.w) ? W0.w[lv] : W0.w) * big * (TW ? TW.w : 1); // 밀어내는 폭의 절반 (레벨마다 넓어짐)
    let touch = 0;
    const wTick = g.tower && (h.wTick = (h.wTick || 0) - dt) <= 0; // 탑(혼자): 밀고 가는 진상에게 피해 (윤정섭 혼자서도 깰 수 있게)
    if (wTick) h.wTick = 0.3;
    for (const e of g.enemies) {
      if (e.dead || Math.abs(e.x - h.px) > hw + (e.r || 14) || e.y > h.py + 10 || e.y < h.py - 70) continue;
      touch++;
      if (wTick) { damageEnemy(g, e, heroDamage(g, h.src || h) * TOWER_SIM.wallDps * 0.3 * (e.titan || e.boss ? 2 : 1), false, h.src || h, false); if (e.dead) continue; }
      const front = h.py - 30 - (e.boss ? 0 : (touch % 3) * 6); // 팔 앞에 뭉쳐서 같이 밀려 올라간다
      if (!e.wallBy) { e.wallBy = h; if (!e.boss && !e.mid) e.y = Math.min(e.y, front) - 10; ev(g, 'wallHit', { x: e.x, y: e.y }); } // 처음 닿으면 살짝 튕김
      if (e.boss || e.mid) { if (e.y > front) e.y -= (e.y - front) * W0.bossPush * (e.boss ? 1 : 2); e.strainT = 0.3; } else e.y = Math.min(e.y, front); // 보스 · 중간 보스는 버틴다 (조금씩만 밀림)
      e.atRope = false;
      e.wallT = 0.1; // 붙어 있는 동안 -70% (보스 -35%)
      e.slowT = Math.max(e.slowT, W0.slowSec); e.slowMul = Math.min(e.slowMul || 1, e.boss ? W0.bossTouch : W0.touchSlow);
      h.wallHp -= (e.atk || 3) * (e.boss ? 1.5 : 1) * (1 - W0.cut) * dt * 0.7;
    }
    if (touch && g.t - (h.pushT || -9) > 1.2) { h.pushT = g.t; ev(g, 'wallPush', { x: h.px, y: h.py - 30, n: touch, w: hw }); }
    if (h.py < 110 || h.wallHp <= 0) {
      // 끝에서 쿵: 뭉친 진상 1칸 더 밀치고 0.5초 기절 (스킬 중이면 1초)
      forEnemiesNear(g, h.px, h.py - 30, hw + 60 + (sa.stomp ? 40 : 0), (e) => { if (!e.boss) { pushUp(g, e, 40); e.stunT = Math.max(e.stunT, ((h.growT > 0 ? 1 : 0.5) + (sa.stomp ? 1 : 0)) * ((h.sig && h.sig.stun) || 1)); } return true; });
      h.wallSt = 'back'; h.tired = h.wallHp <= 0; ev(g, h.tired ? 'wallTired' : 'wallTurn', { x: h.px, y: h.py });
      for (const e of g.enemies) if (e.wallBy === h) e.wallBy = null;
    }
  } else if (h.wallSt === 'back') {
    h.py += W0.back * dt;
    h.px += (h.x - h.px) * Math.min(1, dt * 3);
    if (h.py >= h.y) { h.py = h.y; h.px = h.x; h.wallSt = 'rest'; h.out = false; h.restT = Math.max(1, (W0.rest[lv] + (h.tired ? 4 : 0) - (sa.stride ? 3 : 0)) * (TW ? TW.rest : 1)); h.tired = false; }
  }
}
// 정원식: 결혼정보회사 등록 — 길 가운데로 걸어가 앉아서 상담 · 넓은 반경 진상이 입구 대신 원식을 친다
function updateConsult(g, h, dt) {
  const C = h.def.skill.consult, CR = C.r * (h.sa && h.sa.consult ? 1.4 : 1); // 상담 반경 +40% 증강
  h.out = true;
  if (h.px === undefined) { h.px = h.x; h.py = h.y; }
  if (h.wsSt === 'walk') { // 입구 바로 앞(가운데)으로 뛰어가 막아선다
    const ty = g.ropeY - 40;
    h.py += Math.sign(ty - h.py) * Math.min(Math.abs(ty - h.py), C.walk * dt); h.px += (g.W / 2 - h.px) * Math.min(1, dt * 4);
    if (Math.abs(h.py - ty) < 1) h.py = ty;
    if (h.py === ty) { h.wsSt = 'sit'; h.wsPool = h.wsPoolMax = g.base.max * (C.pool + C.poolLv * (h.lv - 1)) * ((h.sig && h.sig.pool) || 1); ev(g, 'consultSit', { x: h.px, y: h.py }); }
    return;
  }
  if (h.wsSt === 'sit') {
    h.wsT -= dt;
    for (const e of g.enemies) {
      if (e.dead || e.y < -10) continue;
      const dx = e.x - h.px, dy = e.y - h.py;
      if (dx * dx + dy * dy > CR * CR && !e.atRope) continue;
      if (dx * dx + dy * dy > CR * CR * 1.8) continue;
      if (!(e.tauntT > 0)) ev(g, 'tauntMark', { x: e.x, y: e.y - e.def.size * 0.9 });
      e.tauntT = Math.max(e.tauntT || 0, 0.3); e.tauntBy = h;
      e.slowT = Math.max(e.slowT, 0.3); e.slowMul = Math.min(e.slowMul || 1, 1 - C.slow);
      // 원식 앞에서 멈춰 서서 원식을 친다 (보스는 밀리지 않고 그 자리에서)
      if (!e.boss && Math.abs(dx) < 60 && e.y < h.py + 10 && e.y > h.py - 70) { e.y = Math.min(e.y, h.py - 34); e.atRope = false; const hit = (e.atk || 3) * (e.fast ? 1.6 : 1) / Math.max(0.3, e.def.atkInterval || 1) * dt * (1 - C.cut); h.wsPool -= hit; if (g.rng() < dt * 1.2) damageEnemy(g, e, hit / dt * C.reflect * ((h.sig && h.sig.reflect) || 1), false, h, false); }
    }
    // 시간 제한 없이 상담 체력(에너지 바)이 다 닳을 때까지 버틴다
    if (h.wsPool <= 0) { h.wsSt = 'back'; ev(g, 'consultEnd', { x: h.px, y: h.py, broke: h.wsPool <= 0 }); for (const e of g.enemies) if (e.tauntBy === h) { e.tauntBy = null; e.tauntT = 0; } }
    return;
  }
  if (h.wsSt === 'back') {
    h.py += C.walk * dt; h.px += (h.x - h.px) * Math.min(1, dt * 4);
    if (h.py >= h.y) { h.py = h.y; h.px = h.x; h.wsSt = null; h.out = false; h.tiredT = Math.max(h.tiredT || 0, Math.max(1, h.skillCd)); h.tiredMax = h.tiredT; }
  }
}
// 고아라 (개편): 제일 센 적 = 보스 > 중간 보스 > 정예 > 체력 많은 순
// 혼자인 탑: 입구를 때리고 있는 진상이 정예보다 먼저 (혼자라 멀리 있는 정예만 쫓는 사이 입구가 무너지던 문제)
function strongest(g) {
  let best = null, bv = -1;
  const gate = g.tower ? 1.5e7 : 0;
  for (const e of g.enemies) { if (e.dead || e.y < 10 || (e.def.traits && e.def.traits.stealth && !e.unveiled)) continue; const v = (e.boss ? 3e7 : e.mid ? 2e7 : e.elite ? 1e7 : 0) + (e.atRope ? gate : 0) + e.hp; if (v > bv) { bv = v; best = e; } }
  return best;
}
function updateAra(g, h, dt, rate) {
  const d = h.def, lv = h.lv, B = BAL.ara;
  if (h.alt) { // 할머니: 자리에서 지팡이 (약하고 느리게)
    if (h.out) { h.out = false; h.restT = 0.6; h.dashE = null; }
    if (h.restT > 0) { h.restT -= dt; h.px += (h.x - h.px) * Math.min(1, dt * 8); h.py += (h.y - h.py) * Math.min(1, dt * 8); }
    h.cd -= dt * rate;
    if (h.cd <= 0) {
      const t = findTarget(g, h);
      if (!t) { h.cd = 0; return; }
      h.cd += d.interval * LEVEL_INTERVAL[lv - 1] * B.oldInt;
      spawnProj(g, 'cane', h, t, heroDamage(g, h) * B.oldMul, { homing: true, r: 8 });
      h.lastShotT = g.t;
    }
    return;
  }
  // 공주: 돌진 → 붙어서 한 방씩 → 목표가 쓰러지면 다음 센 적 · 없으면 제자리로
  let t = h.dashE;
  if (!t || t.dead) { t = strongest(g); if (t && (!h.dashE || h.dashE.dead)) { if (!h.out) ev(g, 'dash', { x: h.px || h.x, y: h.py || h.y, tx: t.x, ty: t.y, hero: 'ara' }); } h.dashE = t; }
  if (!t) { h.out = false; h.px += (h.x - h.px) * Math.min(1, dt * 8); h.py += (h.y - h.py) * Math.min(1, dt * 8); return; }
  h.out = true;
  h.px += (t.x - h.px) * Math.min(1, dt * B.dashSpd); h.py += (t.y + 18 - h.py) * Math.min(1, dt * B.dashSpd);
  h.cd -= dt * rate;
  if (h.cd <= 0 && Math.hypot(t.x - h.px, t.y + 18 - h.py) < 40 + (t.r || 16)) {
    h.cd += d.interval * LEVEL_INTERVAL[lv - 1];
    const crit = g.rng() < critOf(g, h);
    const hit = heroDamage(g, h) * B.hitMul * (t.boss || t.mid ? B.bossMul : 1) * (crit ? g.mods.critMul : 1);
    const A = g.tower && TOWER_SIM.ara;
    if (A) araCrack(g, t, A.lay); // 탑에서만: 망치가 보호막을 먼저 깨고 그대로 때린다 (보호막 층에서 한 방이 헛치지 않게)
    damageEnemy(g, t, hit, crit, h, false);
    if (A) { // 탑에서만: 떨어진 곳 주변도 쿵 — 주변 진상 보호막도 깨고 40% 피해 (센 진상 하나만 쳐서 떼거리 · 보호막 층에 막히지 않게) — TOWER_SIM.ara
      ev(g, 'splash', { x: t.x, y: t.y, r: A.r, proj: 'hammer' });
      forEnemiesNear(g, t.x, t.y, A.r, (o) => { if (o !== t) { araCrack(g, o, A.layNear); damageEnemy(g, o, hit * A.k, false, h, true); } return true; });
    }
    h.lastShotT = g.t; h.shots++;
    ev(g, 'hammer', { x: t.x, y: t.y - 10, big: true });
  }
}
// 고아라 망치 (탑): 보호막 겹을 n겹 먼저 깬다
function araCrack(g, e, n) {
  if (!(e.tLay > 0) || e.dead || !n) return;
  e.tLay = Math.max(0, e.tLay - n); e.tLayT = TOWER_SIM.shield.regen;
  if (e.tLay <= 0) ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 });
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
  if (h.def.pistol) { // 건전남: 마무리 사수 — 사거리 안에서 체력이 가장 적게 남은 진상 (입구에 가까울수록 조금 먼저)
    let bt = null, bv = 1e9;
    for (const e of g.enemies) { if (e.dead || e.y < -20 || (skip && skip.includes(e)) || (e.hwLie || (isHidden(e) && !REVEAL_HEROES.includes(h.id))) || !inRange(h, e, range)) continue; const v = e.hp / Math.max(1, e.maxHp) - (e.y / g.rowY) * 0.35 - (e.atRope ? 0.3 : 0); if (v < bv) { bv = v; bt = e; } }
    return bt;
  }
  let best = null, by = -1e9;
  const lane = h.def.lane;
  for (const e of g.enemies) {
    if (e.dead || (skip && skip.includes(e))) continue;
    if (e.hwLie || (isHidden(e) && !REVEAL_HEROES.includes(h.id))) continue; // 은신: 운영진 · 건전남만 먼저 본다
    if (lane && Math.abs(e.x - h.x) > lane + e.r) continue; // 자기 줄만
    // 입구에 가까운(아래쪽) 적 우선, 도망가는 먹튀는 약간 가산
    const y = e.y + (e.fleeing ? 60 : 0);
    if (y > by && inRange(h, e, range)) { by = y; best = e; }
  }
  return best;
}

// ─── 발사 ─────────────────────────────────────────────
// 무기 탄창: 몇 발은 짧은 간격으로 → 마지막 발 뒤에 장전 (평균 DPS 그대로 · 리듬만 바뀜)
export function weaponMag(h) { const W = WEAPON[h.id]; return W && W.mag ? W.mag + (h.lv >= 3 ? 1 : 0) + (h.evo ? 1 : 0) : 0; }
function weaponGap(g, h, base) {
  const mag = g.tempo ? weaponMag(h) : 0;
  if (!mag) return base;
  const W = WEAPON[h.id], short = base * W.gap;
  if (h.ammo === undefined || h.ammo > mag) h.ammo = mag;
  h.ammo--;
  if (h.ammo > 0) return short;
  h.ammo = mag;
  const rl = Math.max(short, mag * base - (mag - 1) * short);
  h.reloadT = rl; h.reloadMax = rl;
  ev(g, 'reload', { hero: h.id, x: h.x, y: h.y, sec: rl });
  return rl;
}
// 무기 진화 단계 (Lv3 · Lv5 · 진화 카드) → 관통 +1 (연발·속사·관통) · 범위 +25% (포물선·대포)
// 카드로 붙은 멤버 공격력 합: 멤버 전용 카드 (장마다 +20% · 큰 카드면 ×GROW.card) + 큰 레벨 카드 (장마다 +GROW.lv)
const cmAtk = (h) => (h.cmAtk !== undefined ? h.cmAtk : 0.2 * (h.cmN || 0)) + (h.lvAtk || 0);
export function weaponStep(h) { return (h.lv >= 3 ? 1 : 0) + (h.lv >= 5 ? 1 : 0) + (h.evo ? 1 : 0); }
export function fire(g, h, t) {
  const d = h.def;
  const lv = h.lv;
  h.recoil = 0.14;
  h.lastShotT = g.t; // 프레임 띠: 던진 순간
  h.shots++;
  const dmg = heroDamage(g, h);
  ev(g, 'shot', { hero: h.id, x: h.x, y: h.y });
  const wk = g.tempo && WEAPON[h.id] ? WEAPON[h.id].kind : '';
  const pierce = g.mods.pierce + (h.lv >= 5 && (wk === 'burst' || wk === 'rapid' || wk === 'pierce') ? 1 : 0);
  switch (d.proj) {
    case 'shout': { // 강병화 핀 조명 (대개편): 진상이 가장 몰린 곳에 조명 → 근처 진상이 가운데로 끌려와 홀린다
      if (d.spot) { spotPull(g, h, t, dmg); break; }
      // (예전) 고함 연기: 부채꼴 · 맞은 진상 홀려 멈춤 (보스는 느려짐)
      const ang = Math.atan2(t.y - h.y, t.x - h.x), half = d.cone[lv - 1], R = heroRange(g, h, true);
      let n = 0;
      for (const e of g.enemies) {
        if (e.dead || e.y < -20 || n >= d.coneMax + (h.sa && h.sa.stage ? 2 : 0)) continue;
        const dx = e.x - h.x, dy = e.y - (h.y - 30), dist = Math.hypot(dx, dy);
        if (dist > R + e.r) continue;
        let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = Math.PI * 2 - da;
        if (da > half + Math.atan2(e.r, Math.max(1, dist))) continue;
        n++;
        const crit = g.rng() < critOf(g, h);
        damageEnemy(g, e, dmg * (crit ? g.mods.critMul : 1), crit, h, true);
        if (e.dead) continue;
        if (e.boss || e.def.charmImmune) { e.slowT = Math.max(e.slowT, 1); e.slowMul = Math.min(e.slowMul || 1, 0.7); }
        else e.stunT = Math.max(e.stunT, (d.charm[lv - 1] + (h.sa && h.sa.stage ? 0.3 : 0)) * stunMul(e));
      }
      ev(g, 'bhShout', { x: h.x, y: h.y - 30, a: ang, half, r: R });
      break;
    }
    case 'order': {
      // 방장 확성기 지시: 한 명을 콕 집어 「지목」 — 모든 멤버에게 받는 피해 ↑ (Lv5: 4번마다 근처 3명 한꺼번에 · 3명 지목 증강은 매번)
      const o = d.order, big = (lv >= 5 && h.shots % o.every === 0) || !!(h.sa && h.sa.tri);
      const mul = o.mul[lv - 1] + (h.cm.order || 0);
      const list = [t];
      if (big) { const near = g.enemies.filter((e) => e !== t && !e.dead && e.y > -20 && !isHidden(e) && Math.hypot(e.x - t.x, e.y - t.y) < o.r).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y)); list.push(...near.slice(0, o.n - 1)); }
      for (const e of list) { e.orderMul = Math.max(e.orderT > 0 ? e.orderMul || 0 : 0, mul); e.orderT = Math.max(e.orderT || 0, o.sec); }
      ev(g, 'order', { hero: h.id, x: h.x, y: h.y - 30, pts: list.map((e) => [e.x, e.y - e.def.size * 0.6]), big });
      for (const e of list) { if (e.dead) continue; const crit = g.rng() < critOf(g, h); damageEnemy(g, e, dmg * (e === t ? 1 : 0.6) * (crit ? g.mods.critMul : 1), crit, h, e !== t); }
      break;
    }
    case 'wave': {
      // 김도훈 마이크 음파: 고리가 0.45초 동안 퍼지며 지나가는 진상을 친다 (대개편 · 도넛)
      if (g.tempo) { spawnRing(g, h, dmg, heroRange(g, h, true), { max: d.waveMax + (h.sa && h.sa.hi ? 4 : 0), groove: true }); break; }
      const R = heroRange(g, h, true);
      const hits = [];
      for (const e of g.enemies) {
        if (e.dead || e.y < -20) continue;
        const dd = Math.hypot(e.x - h.x, e.y - (h.y - 30));
        if (dd <= R + e.r) hits.push([dd, e]);
      }
      hits.sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < hits.length && i < d.waveMax + (h.sa && h.sa.hi ? 4 : 0); i++) {
        const e = hits[i][1];
        damageEnemy(g, e, dmg, false, h, true);
        if (!e.dead && d.groove) { e.grooveT = Math.max(e.grooveT || 0, d.groove.sec); e.grooveBy = h.id; } // 떼창에 빠짐: 잠깐 입구를 덜 세게 친다
      }
      ev(g, 'wave', { x: h.x, y: h.y - 30, r: R });
      break;
    }
    case 'dumbbell': {
      if (d.roll) { const R0 = d.roll, bl = bestLineAngle(g, h.x, h.y - 30, heroRange(g, h), R0.r); spawnProj(g, 'dumbbell', h, null, dmg, { angle: bl ? bl.a : aimAngle(h, t, R0.speed), speed: R0.speed, pierce: Infinity, r: R0.r * (lv >= 5 ? 1.3 : 1), push: R0.push * (h.cm.motoKb || 1), decay: R0.decay, maxDist: heroRange(g, h) + 30, spin: 9 }); } // 대개편: 바닥을 데굴데굴 구르며 길 위 진상을 전부 치고 밀친다
      else spawnLob(g, 'dumbbell', h, t, dmg, d.splash * (lv >= 5 ? 1.3 : 1) * (g.mapFx.splash || 1) * g.mods.splashMul, null);
      h.motoN += (h.sig && h.sig.moto) || 1;
      if (h.motoN >= Math.max(2, d.moto.every[lv - 1] - (h.cm.moto || 0))) { h.motoN = 0; launchMoto(g, h, [0], 1); }
      break;
    }
    case 'snack': // 문동한 과자: 귀찮은 듯 흐느적 날아간다 (안 따라감) · 맞히면 간보기 게이지 + (hitEnemy)
      spawnPath(g, 'snack', h, t, dmg, { path: 'wobble', amp: 16, pierce, spin: 9, r: 9 });
      break;
    case 'glow': { // 송바울 응원봉 부메랑: 던진 쪽으로 쭉 관통 → 돌아오며 한 번 더 (Lv5 2개)
      const G = d.glow || { r: 13, back: 0.7, n5: 2 }, n = lv >= 5 ? G.n5 : 1, ang = aimAngle(h, t, d.projSpeed), reach = heroRange(g, h) * (lv >= 3 ? 1.15 : 1);
      for (let i = 0; i < n; i++) spawnProj(g, 'glow', h, null, dmg * (h.sa && h.sa.glow ? 1.25 : 1), { angle: ang + (i - (n - 1) / 2) * 0.22, pierce: Infinity, spin: 15, boomerang: true, maxDist: reach, speed: d.projSpeed * (g.tempo ? 0.62 : 1), r: G.r * (h.sa && h.sa.glow ? 1.3 : 1) });
      break;
    }
    case 'warn': // 운영진: 하늘에서 경고 딱지가 쾅 (낙하 · 작은 원 · 레벨 · ★ 마다 넓게)
      if (d.stamp) spawnStamp(g, h, t, dmg);
      else spawnProj(g, 'warn', h, t, dmg, { homing: true, pierce, slow: d.slow, slowSec: d.slowSec, splash: lv >= 5 ? 70 : 0, splashSlow: lv >= 5 });
      break;
    case 'pistol': { // 건전남 권총: 한 발씩 · 레벨마다 연발이 늘어난다 (같은 표적에 탕 · 탕 · 탕)
      const n = d.pistol.n[lv - 1] + g.mods.gunExtra;
      pistolShot(g, h, t, 0);
      h.burstQ = n - 1; h.burstE = t; h.burstT = d.pistol.gap; h.burstI = 1;
      if (h.sig && h.sig.multi) { const t2 = otherTarget(g, h, t); if (t2) pistolShot(g, h, t2, 1); } // 전용 신화: 옆 진상에게 한 발 더
      break;
    }
    case 'breath': // 박나영: 용이 불을 뿜는다 (짧은 부채꼴 · 화상)
      breathFire(g, h, t, dmg);
      break;
    case 'bullet': {
      // 건전남 새총: 먼 곳까지 빠른 단발, 치명타 잘 터짐
      const n = 1 + g.mods.gunExtra;
      const ang = d.lane ? -Math.PI / 2 : aimAngle(h, t, d.projSpeed); // 새총은 자기 줄 위로 똑바로
      const farCut = d.far && Math.hypot(t.x - h.x, t.y - h.y) > d.far.r ? d.far.mul : 1; // 건전남: 먼 곳은 살짝 약하게
      const head = h.sa && h.sa.head ? h.shots % 3 === 0 : lv >= 5 && h.shots % 4 === 0;
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.14; // 새총알 추가 카드: 부채꼴로 넓게
        spawnProj(g, 'bullet', h, null, dmg * farCut, { angle: a, pierce: pierce + (lv >= 3 ? 1 : 0) + (h.cm.pierce || 0), critBonus: (d.critBonus || 0) + (lv >= 3 ? 0.1 : 0), r: 6, headshot: head && i === 0, big: head && i === 0 });
      }
      if (h.sig && h.sig.multi) { // 건전남 전용 신화: 두 번째 알은 옆 줄 진상을 비스듬히
        let t2 = null, bd = 1e18; const R2 = heroRange(g, h);
        for (const e of g.enemies) { if (e.dead || e === t || e.y < 0 || isHidden(e) || Math.abs(e.x - h.x) < 20) continue; const d2 = (e.x - h.x) ** 2 + (e.y - h.y) ** 2; if (d2 < bd && d2 <= R2 * R2) { bd = d2; t2 = e; } }
        spawnProj(g, 'bullet', h, null, dmg * farCut * (h.sig.multiK || 1), { angle: t2 ? aimAngle(h, t2, d.projSpeed) : ang + 0.12, pierce: pierce + (lv >= 3 ? 1 : 0) + (h.cm.pierce || 0), critBonus: (d.critBonus || 0) + (lv >= 3 ? 0.1 : 0), r: 6 });
      }
      break;
    }
    case 'heart':
    case 'bottle': {
      // 포물선으로 던지는 폭탄 (건전녀 하트 · 최은옥 소주병)
      const r = d.splash * (d.proj === 'heart' && lv >= 3 ? 1.25 : 1) * (g.mapFx.splash || 1) * g.mods.splashMul * (h.cm.splash || 1);
      spawnLob(g, d.proj, h, t, dmg, r, d.fire && h.rage ? d.fire : null);
      break;
    }
    case 'jab': // 정원식: 헬스 잽 — 짧게 쭉 뻗는 주먹 충격파 (안 따라감 · 첫 진상 밀치기)
      spawnProj(g, 'jab', h, t, dmg * (h.sa && h.sa.jab ? 1.25 : 1), { angle: aimAngle(h, t, 700 * TEMPO.proj), pierce, r: 13, push: h.sa && h.sa.jab ? 55 : 30, maxDist: heroRange(g, h) + 20 });
      break;
    case 'mosaic': // 여지원: 모자이크 손이 세 번 끊어 순간이동 (점멸) · 맞은 진상 곁으로 모자이크가 한 겹 번진다
      spawnPath(g, 'mosaic', h, t, dmg, { path: 'blink', pierce, r: 16, spread2: true });
      break;
    case 'swear': {
      if (!h._fastPick) { let fb = null; for (const e of g.enemies) if (!e.dead && !isHidden(e) && inRange(h, e, heroRange(g, h)) && e.speed >= 60 && (!fb || e.speed > fb.speed)) fb = e; if (fb) t = fb; }
      const [chance, sec] = d.stun[lv - 1];
      const bomb = lv >= 5 && h.shots % 4 === 0;
      if (d.ice) { swearZap(g, h, t, dmg * (bomb ? 1.3 : 1), d.bounces[lv - 1] + g.mods.chainExtra + (h.cm.bounce || 0), bomb); break; } // 대개편: 비행 없이 바로 지그재그 번개 · 얼음 겹
      spawnProj(g, 'swear', h, t, dmg * (bomb ? 1.3 : 1) * (t.speed >= 60 ? 2 : 1), {
        homing: true, pierce, stunChance: chance, stunSec: sec * (h.cm.ctrl || 1), swear: true, bounces: d.bounces[lv - 1] + g.mods.chainExtra + (h.cm.bounce || 0),
        splash: bomb ? 64 : 0, splashStun: bomb, big: bomb, r: bomb ? 14 : 10,
      });
      break;
    }
    case 'cane': {
      const n = (lv >= 5 ? 2 : 1) + (h.cm.cane || 0);
      if (d.loop) { // 강성구: 진상이 가장 몰린 곳까지 커다란 고리를 그리며 나갔다가 반대쪽으로 돌아오는 지팡이 (갈 때 · 올 때 전부 관통)
        const c = densestPoint(g, h.x, h.y, heroRange(g, h), 70) || t, L = d.loop;
        for (let i = 0; i < n; i++) { const p = spawnPath(g, 'cane', h, c, dmg, { path: 'loop', amp: L.amp * (lv >= 3 ? 1.3 : 1), side: i % 2 ? -1 : 1, pierce: Infinity, spin: 14, r: L.r, speed: L.speed }); p.T *= 2.1; p.life = p.T + 0.2; p.turned = false; }
        break;
      }
      const ang = d.lane ? -Math.PI / 2 : aimAngle(h, t, d.projSpeed);
      for (let i = 0; i < n; i++) {
        const a = ang + (i - (n - 1) / 2) * 0.16;
        spawnProj(g, 'cane', h, null, dmg, {
          angle: a, pierce: Infinity, spin: 14, boomerang: lv >= 3, maxDist: d.range + 40, r: 16,
        });
      }
      break;
    }
    case 'gf': {
      // 윤준서: 여사친을 밀어 넣는다 → 핀볼처럼 튕기며 밀어내고 돌아온다
      const n = (lv >= 5 ? 2 : 1) + ((h.sig && h.sig.gfN) || 0); // 윤준서 전용 신화: 한 명 더
      for (let i = 0; i < n; i++) spawnGf(g, h, i === 0 ? t : findTarget(g, h, [t]) || t, dmg, d.ricochet[lv - 1] + g.mods.chainExtra + (h.cm.bounce || 0), (i - (n - 1) / 2) * 0.5);
      break;
    }
    case 'slam': {
      if (!h.alt && d.quake) { quakeLine(g, h, t, dmg); break; } // 배현경 통통: 땅이 갈라지는 직선 충격파
      if (h.alt) {
        // 날씬 모드: 초고속 잽
        const dd = d.diet;
        spawnProj(g, 'jab', h, t, dmg * dd.dmg, { angle: aimAngle(h, t, dd.speed), pierce, r: 9, speed: dd.speed, maxDist: dd.range + 20 }); // 직선 잽 (안 따라감)
        break;
      }
      // 통통 모드: 한 명에게 묵직한 한 방 + 밀치기 (범위 없음)
      const cx0 = t.x, cy0 = t.y, R = 0;
      { const crit = g.rng() < critOf(g, h); damageEnemy(g, t, dmg * 1.7 * (crit ? g.mods.critMul : 1), crit, h, false); if (!t.dead && !t.boss) applyKnockback(t, d.kb * 1.2, g); }
      h.meter = Math.min(100, h.meter + d.diet.perSlam[lv - 1]);
      h.slamAt = g.t;
      ev(g, 'slam', { x: cx0, y: cy0, r: R, hx: h.x, hy: h.y });
      break;
    }
    case 'hammer':
      // 고아라: 무거운 한 방 (5레벨: 주변도 쿵)
      spawnProj(g, 'hammer', h, t, dmg, { homing: true, pierce, r: 12, spin: 11, splash: lv >= 5 ? 50 : 0, big: !h.alt });
      break;
    case 'crown':
      crownWave(g, h, dmg, 0);
      if (lv >= 5) h.echoT = 0.4;
      break;
    // (예전 방식 — 테스트·호환용)
    case 'nag': // 정소영 잔소리 말풍선
      spawnProj(g, 'nag', h, t, dmg, { homing: true, pierce, r: 10 });
      break;
    case 'chip': { // 성준영: 칩 · 카드 부채꼴 (가까운 3명) — 맞으면 기준점으로 끌려와 뭉친다
      const near = g.enemies.filter((e) => !e.dead && !isHidden(e) && Math.hypot(e.x - h.x, e.y - h.y) < heroRange(g, h)).sort((a, b) => Math.hypot(a.x - h.ax, a.y - h.ay) - Math.hypot(b.x - h.ax, b.y - h.ay)).reverse().slice(0, 3);
      for (const e of near.length ? near : [t]) spawnProj(g, g.rng() < 0.4 ? 'card' : 'chip', h, e, d.chipDmg * (1 + 0.15 * (h.lv - 1)) * (1 + cmAtk(h)) * (g.saJy || 1), { homing: true, pierce, spin: 14, r: 7, pull: true });
      break;
    }
    case 'tick': { // 오지은: 표적 위에 시계가 스르륵 떠올라 째깍 → 작은 감속 장판 (대개편) · 쏘는 순간 악마 모습
      if (d.clock) { spawnClock(g, h, t, dmg); h.alt = true; h.altT = Math.max(h.altT || 0, d.demon.sec); break; }
      spawnProj(g, 'tick', h, t, dmg, { homing: true, pierce, slow: Math.min(0.7, d.slow + (h.cm.slowX || 0)), slowSec: d.slowSec + (h.cm.slowSec || 0) + (lv >= 3 ? 0.5 : 0), r: 8 });
      h.alt = true; h.altT = Math.max(h.altT || 0, d.demon.sec);
      break;
    }
    case 'rose': // 박상화 매너 장미: 옆으로 크게 휘어 꽂힌다 (좌우 번갈아) · 맞으면 장미 표식 + 자기 자랑
      spawnPath(g, 'rose', h, t, dmg, { path: 'curve', amp: 58, side: h.shots % 2 ? 1 : -1, pierce, r: 10, rose: true });
      if (g.t - (h.lineT || -9) > 1.6) { h.lineT = g.t; ev(g, 'goodman', { x: h.x, y: h.y - 60, text: d.lines[(h.shots + (g.rng() * 3 | 0)) % d.lines.length] }); }
      break;
    case 'tap': // 홍정민: 거꾸로 든 소주병을 자기 앞으로 크게 휘두른다 (입구 앞 반원 · 밀치기 · 흉터 눈빛)
      if (d.swing) swingHit(g, h, dmg);
      else spawnProj(g, 'tap', h, t, dmg, { homing: true, pierce, r: 8, spin: 10 });
      break;
    case 'bouquet': // 임수빈: 부케 던지기 — 맞은 진상을 리본으로 묶는다
      spawnPath(g, 'bouquet', h, t, dmg, { path: 'helix', amp: 15, pierce, r: 12, tie: (d.tie.sec[lv - 1] + (h.cm.tieSec || 0)) * g.mods.ctrlMul, dance: true }); // 임수빈: 리본이 나선으로 빙글빙글 (3D) → 맞은 진상을 리본으로 감아 제자리에서 춤
      break;
    case 'wink':
      spawnProj(g, 'wink', h, t, dmg, { homing: true, pierce, kb: (d.knockback || [80])[lv - 1] || 80 });
      break;
  }
}

// 정소영 → 성준영 소환 (빈자리에, 없으면 정소영 옆에 겹쳐서) · 멤버 수 제한과 상관없이
//  준영은 아래(입구 앞)에서 나와 바닥의 돈을 쓸어 모으듯 돌아다닌다 · 체력이 다 떨어지면 "올인!" 하고 퇴근
export function jyHpMax(g, j, so) {
  const S0 = j.def.sweep, lv = j.lv - 1;
  return g.base.max * S0.hp[lv] * (1 + (j.meta || 0) * S0.hpMeta) * (1 + ((so && so.cm && so.cm.nag) || 0)) * ((so && so.sig && so.sig.summonMul) || 1);
}
function summonJunyoung(g, h) {
  const j0 = hasHero(g, 'junyoung');
  if (j0) { j0.hp = j0.hpMax = jyHpMax(g, j0, h); return j0; }
  const used = new Set(g.heroes.map((o) => o.slot));
  const slot = SLOT_ORDER.filter((x) => x < g.nPos && !used.has(x))[0];
  g._summoning = true;
  const j = addHero(g, 'junyoung', slot);
  g._summoning = false;
  if (!j) return null;
  if (slot === undefined) { j.slot = h.slot; j.x = h.x + 26; j.overlap = true; }
  j.lv = Math.min(5, h.lv); j.meta = h.meta; j.summon = true; j.by = h.id;
  j.homeX = j.x; j.homeY = j.y; j.out = true;
  j.px = clamp(h.x, 40, g.W - 40); j.py = g.ropeY - 34; j.x = j.px; j.y = j.py; // 아래(입구 바로 앞)에서 시작
  j.hp = j.hpMax = jyHpMax(g, j, h); j.wpT = 0; j.tickT = 0.3; j.held = 0; j.allinT = 0; j.face = 1;
  ev(g, 'summon', { hero: 'junyoung', x: j.px, y: j.py, by: h.id });
  return j;
}
// 다음 쓸 곳: 바닥 아래쪽 절반에서 아무 데나 — 반쯤은 진상이 몰린 쪽으로 (난수는 g.rng 라 재현된다)
function jyWaypoint(g, j) {
  const y0 = g.ropeY * 0.5, y1 = g.ropeY - 40;
  let x = 40 + g.rng() * (g.W - 80), y = y0 + g.rng() * (y1 - y0);
  if (g.rng() < 0.5) {
    let best = null, bs = -1;
    for (const e of g.enemies) {
      if (e.dead || e.y < 60 || e.boss) continue;
      let n = 0;
      for (const o of g.enemies) if (!o.dead && Math.abs(o.x - e.x) < 90 && Math.abs(o.y - e.y) < 90) n++;
      const sc = n * 10 + e.y * 0.03;
      if (sc > bs) { bs = sc; best = e; }
    }
    if (best) { x = (x + best.x * 2) / 3; y = clamp((y + (best.y + 40) * 2) / 3, y0, y1); }
  }
  // 한 번에 너무 멀리도 · 너무 조금도 안 간다 (빗자루질: 이쪽저쪽 쓸고 다닌다)
  let dx = x - j.px, dy = y - j.py, d = Math.hypot(dx, dy);
  const max = 170, min = 70;
  if (d < min) { const a = g.rng() * Math.PI * 2; dx = Math.cos(a); dy = Math.sin(a) * 0.6; d = Math.hypot(dx, dy); x = j.px + (dx / d) * min; y = j.py + (dy / d) * min; }
  else if (d > max) { x = j.px + (dx / d) * max; y = j.py + (dy / d) * max; }
  j.wx = clamp(x, 30, g.W - 30); j.wy = clamp(y, y0, y1);
  j.wpT = j.def.sweep.wp[0] + g.rng() * (j.def.sweep.wp[1] - j.def.sweep.wp[0]);
}
// 성준영: 돌아다니며 쓸어 모은다 — 주변 진상을 끌어와 곁에 붙잡아 두고(조금씩 피해) · 붙잡힌 진상은 입구 대신 준영을 친다
function updateJunyoung(g, j, dt) {
  const S0 = j.def.sweep, so = g.heroes.find((o) => o.id === 'soyoung' && !o.gone);
  if (so) j.lv = Math.min(5, so.lv);
  const lv = j.lv - 1;
  if (j.allinT > 0) j.allinT -= dt;
  if (j.hp === undefined) { j.hp = j.hpMax = jyHpMax(g, j, so); j.wpT = 0; j.tickT = 0.3; }
  // 빗자루질: 정한 곳까지 천천히 (붙잡은 진상이 많으면 더 느리게)
  j.wpT -= dt;
  if (j.wpT <= 0 || j.wx === undefined || Math.hypot(j.wx - j.px, j.wy - j.py) < 6) jyWaypoint(g, j);
  { const dx = j.wx - j.px, dy = j.wy - j.py, d = Math.hypot(dx, dy); if (d > 1) { const sp = Math.min(d, S0.walk * (1 - Math.min(0.3, j.held * 0.04)) * dt); j.px += (dx / d) * sp; j.py += (dy / d) * sp; if (Math.abs(dx) > 2) j.face = dx < 0 ? -1 : 1; } }
  j.x = j.px; j.y = j.py;
  // 끌어모으기
  const R = S0.r[lv] * (j.allinT > 0 ? S0.allinR : 1) * (g.saJy ? 1.2 : 1), max = S0.max[lv] + (j.allinT > 0 ? 3 : 0);
  const near = [];
  for (const e of g.enemies) { if (e.dead || e.y < 0 || e.fleeing) continue; const d = Math.hypot(e.x - j.px, e.y - j.py); if (d < R + (e.r || 14)) near.push([d, e]); }
  near.sort((a, b) => a[0] - b[0]);
  let held = 0, hurt = 0;
  for (const [, e] of near) {
    if (e.boss || e.mid) { // 보스 · 중간 보스: 붙잡지는 못하고 조금 끌어당기기만
      const dx = j.px - e.x, dy = j.py - e.y, d = Math.hypot(dx, dy) || 1;
      e.x += (dx / d) * S0.pull * S0.bossPull * dt; e.baseX = e.x;
      continue;
    }
    if (held >= max) continue;
    const a = Math.PI * (1.08 + 0.84 * ((((e.uid || 0) * 0.618 + g.t * 0.05) % 1 + 1) % 1)), rr = S0.hold + (held % 3) * 9; // 준영 뒤(위쪽) 반원에 줄줄이 붙는다 (준영이 가려지지 않게)
    const tx = clamp(j.px + Math.cos(a) * rr, 16, g.W - 16), ty = j.py - 14 + Math.sin(a) * rr * 0.6;
    const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy);
    const k = e.def.traits && e.def.traits.kbImmune ? 0.5 : 1;
    if (d > 0.5) { const sp = Math.min(d, S0.pull * k * dt); e.x += (dx / d) * sp; e.y += (dy / d) * sp; }
    e.baseX = e.x; e.jyT = 0.15; e.atRope = false; held++;
    if (!e.jyHeld) { e.jyHeld = true; ev(g, 'jyGrab', { x: e.x, y: e.y - (e.def.size || 30) * 0.6, jx: j.px, jy: j.py }); }
    if (d < 45 && held <= 3 && !(e.stunT > 0) && !e.sleeping) hurt += (e.atk || 3) * (e.fast ? 1.6 : 1) / Math.max(0.3, e.def.atkInterval || 1) * dt; // 곁에 붙은 진상은 입구 대신 준영을 친다
  }
  j.held = held;
  if (hurt > 0) { j.hp -= hurt * (1 - S0.cut); prevented(g, j.by || 'soyoung', hurt); j.hurtT = g.t; }
  if (held > 0) j.hp -= j.hpMax * S0.tire * dt; // 쓸어 담느라 지친다 (붙잡고 있는 동안 초당 최대 체력의 2%) — 입구가 튼튼해 체력이 커도 결국 퇴근
  // 쓸어 담기: 붙잡은 진상에게 조금씩 피해 (본업은 모으기)
  if ((j.tickT -= dt) <= 0) {
    j.tickT += S0.tick;
    const dmg = heroDamage(g, j) * S0.dmgK * (j.allinT > 0 ? 2 : 1) * (g.saJy || 1);
    let n = 0;
    for (const [, e] of near) { if (e.dead) continue; const bm = e.boss || e.mid; if (!bm && !(e.jyT > 0)) continue; damageEnemy(g, e, dmg * (bm ? 0.6 : 1), false, j, true); n++; } // 보스 · 중간 보스는 못 붙잡아도 곁에서 쓸면 조금씩 맞는다 (60%)
    if (n) ev(g, 'jySweep', { x: j.px, y: j.py, n, face: j.face });
  }
  if (j.hp <= 0) { // 지쳐서 퇴근: "올인!" 작은 폭발 → 사라진다 · 정소영은 부르기 게이지를 처음부터
    j.hp = 0;
    allinBurst(g, j);
    j.gone = true;
    for (const e of g.enemies) if (e.jyT > 0) { e.jyT = 0; e.jyHeld = false; }
    if (so) so.callM = 0;
    ev(g, 'jyLeave', { x: j.px, y: j.py });
  }
}
function allinBurst(g, h) {
  const a = h.def.allin, boss = g.heroes.find((o) => o.id === 'soyoung');
  const x = h.px !== undefined ? h.px : h.x, y = (h.py !== undefined ? h.py : h.y) - 10;
  const r = a.r * (boss && boss.lv >= 5 ? 1.35 : 1);
  forEnemiesNear(g, x, y, r, (e) => { damageEnemy(g, e, heroDamage(g, h) * a.mul, false, h, true); return true; });
  // 퇴근하며 붙잡고 있던 진상을 위로 밀어 보낸다 (입구 앞에 모아 둔 채 놓아 버리면 오히려 입구가 맞아서)
  if (a.kb) for (const e of g.enemies) if (!e.dead && !e.boss && (e.jyT > 0 || Math.hypot(e.x - x, e.y - y) < r)) applyKnockback(e, e.mid ? a.kb * 0.5 : a.kb, g);
  ev(g, 'allin', { x, y, r, hx: x, hy: y });
}
// 정소영: 진상은 안 때린다 — 잔소리 한 번마다 성준영 체력이 차고(공격 속도가 빠를수록 더 자주) · 준영이 없으면 부르기 게이지가 차서 가득 차면 등판
function updateNag(g, h, dt, rate) {
  const N = h.def.nag, lv = h.lv - 1;
  if (h.callM === undefined) h.callM = N.start;
  const j = g.heroes.find((o) => o.id === 'junyoung' && !o.gone);
  const foes = g.enemies.some((e) => !e.dead && e.y > 0);
  h.cd -= dt * rate;
  if (h.cd > 0) return;
  if (!foes && (!j || j.hp >= j.hpMax)) { h.cd = 0; return; } // 진상도 없고 준영도 멀쩡하면 쉰다
  h.cd += h.def.interval * LEVEL_INTERVAL[lv];
  h.lastShotT = g.t; h.recoil = 0.14; h.shots++;
  const k = (h.sig && h.sig.multi ? 2 : 1) * (h.cm.nagX || 1);
  if (j) {
    const add = j.hpMax * N.heal[lv] * k * (j.hurtT !== undefined && g.t - j.hurtT < 1.5 ? 0.25 : 1); // 맞고 있는 동안엔 잔소리가 잘 안 먹힌다 (25%)
    const v = Math.min(add, j.hpMax - j.hp);
    j.hp += v; h.nagHeal = (h.nagHeal || 0) + v;
    ev(g, 'nag', { hero: h.id, x: h.x, y: h.y, tx: j.px, ty: j.py, heal: v > 0 });
  } else {
    h.callM = Math.min(100, h.callM + N.call[lv] * k);
    ev(g, 'nag', { hero: h.id, x: h.x, y: h.y, call: h.callM });
    if (h.callM >= 100 && foes) { h.callM = 0; summonJunyoung(g, h); }
  }
}
// 송바울 보드: 탭한 곳(g.boardAim)으로 미끄러져 가며 길 위 진상을 쓸고 지나간다 · 탭이 없으면 진상이 많이 줄 선 쪽으로 알아서
//  st: ride(보드 위 · 다음 돌진 대기) → dash(돌진 중) → … uses 번 타면 home(자리로 복귀) → fix(무릎 꿇고 보드 정비) → ride
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / L, 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
// 윤준서 여사친: 유도탄처럼 날아가 맞으면 다음 진상으로 튕긴다 (hitEnemy 참고)
function spawnGf(g, h, t, dmg, rico, spread) {
  const p = spawnProj(g, 'gf', h, t, dmg, { homing: true, r: 14, spin: 9, spread: spread || 0 });
  p.rico = rico; p.boomerang = true; p.maxDist = 99999; p.life = 6; p.gfKb = h.def.kb[h.lv - 1];
  return p;
}
// 배현경 다이어트 주사 → 날씬 모드
function dietOn(g, h, extra) {
  const d = h.def;
  h.alt = true; h.altT = (d.diet.sec[h.lv - 1] + (extra || 0) + (h.cm.diet || 0)) * ((h.sig && h.sig.dietMul) || 1); h.meter = 100; h.cd = 0;
  ev(g, 'diet', { hero: h.id, x: h.x, y: h.y });
}
// 이호찬: 자기 줄을 휩쓰는 황금 파동
function crownWave(g, h, dmg, dx) {
  const d = h.def;
  const p = spawnProj(g, 'crown', h, null, dmg, { angle: -Math.PI / 2, pierce: Infinity, r: d.waveW[h.lv - 1], maxDist: 780 });
  p.x += dx || 0; p.sx = p.x; p.stripN = 1; p.life = 3;
  ev(g, 'crown', { x: p.x, y: p.y, w: p.r });
  return p;
}
// 고아라: 보스 → 체력 많은 진상 순으로 노린다 (지목하면 그쪽)
function bossTarget(g, h, range) {
  const f = g.focus;
  if (f && !f.dead && f.uid === g.focusUid && inRange(h, f, heroRange(g, h, true))) return f;
  let best = null, bv = -1;
  for (const e of g.enemies) {
    if (e.dead || !inRange(h, e, range)) continue;
    const v = (e.boss ? 1e7 : 0) + e.hp + e.shield + e.y * 0.05;
    if (v > bv) { bv = v; best = e; }
  }
  return best;
}
// 백인규 오토바이: 자기 줄(각도)로 쭉 — 줄에 있는 진상 전부 치고 밀어낸다
function launchMoto(g, h, angles, mulExtra) {
  const m = h.def.moto;
  for (const a of angles) {
    spawnProj(g, 'moto', h, null, heroDamage(g, h) * m.mul * mulExtra * (h.sa && h.sa.booster ? 1.5 : 1), { angle: -Math.PI / 2 + a, pierce: Infinity, r: m.w, speed: m.speed, motoKb: m.kb * (h.cm.motoKb || 1), maxDist: 900 });
  }
  ev(g, 'moto', { x: h.x, y: h.y, n: angles.length });
}
// 문동한: 가장 붐비는 세로줄에 두꺼운 빔
function lazyBurst(g, h) {
  const d = h.def, b = d.burst;
  const w = b.w[h.lv - 1] * (h.cm.beam || 1);
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
  if (h.sa && h.sa.double) { // 두 줄 빔: 두 번째로 붐비는 줄 (첫 줄과 안 겹치게)
    let x2 = -1, n2 = 0;
    for (let x = 30; x <= g.W - 30; x += 15) { if (Math.abs(x - bestX) < w * 2) continue; let n = 0; for (const e of g.enemies) if (!e.dead && e.y > 0 && Math.abs(e.x - x) < w) n += e.boss ? 3 : 1; if (n > n2) { n2 = n; x2 = x; } }
    if (x2 >= 0) { for (const e of g.enemies) { if (e.dead || e.y < -30 || Math.abs(e.x - x2) >= w + e.r * 0.5) continue; damageEnemy(g, e, dmg * 0.7, false, h, true); } ev(g, 'burst', { x: x2, w, hx: h.x, hy: h.y, big: false }); }
  }
  h.serious = 1;
  h.meter = (h.sig && h.sig.refill) || 0; // 문동한 전용 신화: 게이지 절반이 바로 다시
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
  p.path = null; p.ric = 0; p.push = 0; p.decay = 0; p.drop = false; p.arcH = h.def.arcH || 70; p.rose = false; p.spread2 = false; p.dance = false; p.vx = 0; p.vy = 0;
  p.hitIds.length = 0;
  g.projs.push(p);
  return p;
}
function landLob(g, p) {
  const h = p.hero;
  if (h && h.def.fuse && !p.fused) { // 최은옥 시한폭탄: 꽂힌 병이 지글지글 → fuse 초 뒤 펑
    (g.zones || (g.zones = [])).push({ kind: 'fuse', x: p.tx, y: p.ty, t: h.def.fuse, max: h.def.fuse, p: { type: p.type, hero: h, tx: p.tx, ty: p.ty, dmg: p.dmg, splash: p.splash, fire: p.fire, fused: true }, hero: h });
    ev(g, 'fuseSet', { x: p.tx, y: p.ty, sec: h.def.fuse, rage: !!p.fire });
    return;
  }
  const inc = !BAL.aoeMain.includes(h.id);
  const R0 = p.splash * (inc ? BAL.incSplashR : 1);
  ev(g, 'splash', { x: p.tx, y: p.ty, r: R0, proj: p.type });
  let main = null, md = 1e9; // 맞은 한 명은 제 피해 · 곁다리는 (범위 멤버가 아니면) 40%
  forEnemiesNear(g, p.tx, p.ty, R0, (e) => { const dd = Math.hypot(e.x - p.tx, e.y - p.ty); if (dd < md) { md = dd; main = e; } return true; });
  forEnemiesNear(g, p.tx, p.ty, R0, (e) => {
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, e, p.dmg * (crit ? g.mods.critMul : 1) * (inc && e !== main ? BAL.incSplashDmg : 1), crit, h, true);
    return true;
  });
  if (p.fire) {
    const f = p.fire;
    const big = h.lv >= 3, inf = h.sa && h.sa.inferno;
    g.pools.push({ x: p.tx, y: p.ty, r: f.r * (big ? 1.25 : 1) * (inf ? 1.5 : 1), t: f.sec * (big ? 1.3 : 1) + (inf ? 1 : 0), max: f.sec * (big ? 1.3 : 1) + (inf ? 1 : 0), dps: p.dmg * f.dps, hero: h, tick: 0, kind: f.kind || 'fire', slow: f.slow || 0 }); // 최은옥: 술 웅덩이 (비틀비틀 느려짐)
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
      forEnemiesNear(g, q.x, q.y, q.r, (e) => { damageEnemy(g, e, q.dps * 0.25, false, q.hero, true); if (q.slow && !e.dead) { e.slowT = Math.max(e.slowT, 0.4); e.slowMul = Math.min(e.slowMul || 1, 1 - q.slow * (e.boss ? 0.5 : 1)); } return true; });
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
  const sp = (o.speed || h.def.projSpeed) * (g.tempo && !o.speed && type !== 'cane' ? TEMPO.proj : 1); // 템포: 투사체가 천천히 날아가 눈에 보인다
  let a = o.angle;
  if (a === undefined) a = Math.atan2(target.y - h.y, target.x - h.x) + (o.spread || 0);
  p.type = type; p.hero = h; p.dead = false;
  p.x = h.x; p.y = h.y - 30; p.sx = p.x; p.sy = p.y; // 머리 위에서 발사
  p.speed = sp; p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
  p.dmg = dmg; p.target = target; p.tuid = target ? target.uid : 0;
  p.homing = !!o.homing; p.pierce = o.pierce || 0; p.r = o.r || 10;
  p.splash = o.splash || 0; p.splashSlow = !!o.splashSlow; p.big = !!o.big;
  p.slow = o.slow || 0; p.slowSec = (o.slowSec || 0) * g.mods.ctrlMul;
  p.stunChance = o.stunChance || 0; p.stunSec = (o.stunSec || 0) * g.mods.ctrlMul;
  p.kb = o.kb || 0; p.kbStun = o.kbStun || 0; p.critBonus = o.critBonus || 0;
  p.swear = !!o.swear; p.chain = !!o.chain; p.splashStun = !!o.splashStun; p.bounces = o.bounces || 0; p.headshot = !!o.headshot; p.pull = !!o.pull;
  p.lob = false; p.fire = null; p.motoKb = o.motoKb || 0; p.tie = o.tie || 0; // (8장 임수빈 부케: 묶는 시간)
  p.spin = o.spin || 0; p.rot = a; p.boomerang = !!o.boomerang; p.returning = false;
  p.maxDist = o.maxDist || 9999; p.dist = 0; p.life = 3.2; p.rage = !!o.rage;
  p.path = null; p.ric = 0; p.push = o.push || 0; p.decay = o.decay || 0; p.drop = false; p.arcH = 0; p.rose = !!o.rose; p.spread2 = !!o.spread2; p.dance = !!o.dance; // (대개편: 경로 · 도탄 · 밀치기 · 감쇠 · 장미 표식 · 모자이크 번짐 · 리본)
  p.hitIds.length = 0;
  g.projs.push(p);
  return p;
}

// ─── 적 ───────────────────────────────────────────────
export function spawnEnemy(g, type, x, y, o = {}) {
  if (g.mode === 'stage' && (g.stage | 0) < BAL.fast.from && BAL.fast.types.includes(type) && !o.keep) type = 'yeokko'; // 1-1~1-3: 빠른 진상 대신
  const def = ENEMIES[type];
  if (g.seen) g.seen[type] = 1; // 도감: 이번 판에 만난 진상
  const e = g._enemyPool.pop() || {};
  const m = (o.hpMul || hpMul(Math.max(1, g.diff), g.mode === 'stage') * (g.hpScale || 1)) * (def.boss && g.mode === 'stage' ? RULES.stageBossHp * (g.tension ? (((g.stage - 1) % 10) + 1 === 10 ? TENSION.bossHp.last : TENSION.bossHp.mid) : 1) : 1) * (def.boss ? 1 : o.hpX || 1);
  const chk = g.mode === 'stage' && !g.pvp ? (BAL.chHp[chapterOf(g.stage || 1)] || 1) * (STAGE_HPX[g.stage] || 1) : g.mode === 'endless' ? BAL.endHp || 1 : 1; // 밸런스 개편 뒤 장마다 체력 다시 맞춤
  e.uid = g.uid++; e.type = type; e.def = def; e.boss = !!def.boss; e.mid = !!def.mid; e.gender = def.gender; e.elite = !!o.elite;
  const lane = g.mapFx.lane;
  e.x = x !== undefined ? x : lane ? lane[0] + g.rng() * (lane[1] - lane[0]) : 24 + g.rng() * (g.W - 48);
  if (lane && !def.boss) e.x = clamp(e.x, lane[0], lane[1]);
  e.y = y !== undefined ? y : FIELD.spawnY - g.rng() * 10;
  e.baseX = e.x; e.phase = g.rng() * 6.28;
  const hm = g.hell ? HELL.hp * (HELL.stageHp[g.stage] || 1) : 1; // (스테이지별 헬 체력 맞춤)
  e.maxHp = e.hp = def.hp * m * g.mods.enemyHp * hm * chk; e.shield = def.lie ? def.hp * m * g.mods.enemyHp * hm * chk * def.lie.frac : 0; // 싱글맘: 거짓말 방패
  e.speed = def.speed * (0.92 + g.rng() * 0.16) * g.mods.enemySpd * (g.mapFx.enemySpd || 1) * (g.hell ? HELL.speed : 1); e.atk = def.atk * atkMul(Math.max(1, g.diff), g.mode === 'stage') * (g.hell ? HELL.atk : 1) * (g.slow ? SLOW_RUN.door : 1) * (g.tension ? TENSION.door : 1); // 느린 판: 입구를 더 세게 (수리 · 탱커 몫)
  e.atkCd = 0.4; e.slowT = 0; e.slowMul = 1; e.stunT = 0; e.kbv = 0; e.flash = 0;
  e.dead = false; e.atRope = false; e.fleeing = false; e.stolen = 0; e.charmCd = 0;
  e.fast = BAL.fast.types.includes(type); if (e.fast && !g.fastTip && g.mode === 'stage') { g.fastTip = true; ev(g, 'tip', { text: '빠른 진상은 잘 피해요 · 감속·기절·범위 공격으로 잡아요' }); } e.bottleT = def.bottle ? 2 + g.rng() * 2 : 0; e.flashW = 0; e.latteT = def.latte ? 3 + g.rng() * 2 : 0;
  e.abT = def.slam ? def.slam.every * 0.6 : def.summon ? 3 : 0; e.abT2 = def.shieldAura ? def.shieldAura.first || 5 : 0; e.windup = 0;
  e.interestT = def.interest ? def.interest.every : 0; e.interestN = 0; e.loanTaken = 0; e.paperT = def.paper ? 1.6 : 0;
  e.phaseI = -1; e.phaseT = 0; e.auraOn = false;
  e.pukeT = def.puke ? 2 + g.rng() * 2 : 0; e.hurtT = 9; e.split = false; e.grabbing = null; e.grabCd = 0;
  e.slamT = undefined; e.phN = 0; e.guardT = 0; e.phT0 = undefined; e.holdT = -9; e.stopY0 = undefined; e.drN = 0; e.drT = 0; e.ccImmT = 0; e._lStun = 0; e._lFrz = 0; e._lY = undefined; e.pushSum = 0; e.resT = -9; e.weakT = 0; e.warnN = 0; e.lureT = 0; e.bumped = false; e.cast = null; e.castW = 0; e.pukeAim = false; e.flashH = null; // (10/08) 투척 예고
  e.spitT = def.spit ? def.spit.first + g.rng() * 2 : 0; e.kickT = def.kick ? def.kick.first + g.rng() * 2 : 0;
  // 진상 특성
  const tr = def.traits || {};
  e.bai = def.boss && BOSS_KITS[type] ? { st: 'walk', t: 0, next: BOSS_AI.every[0] + g.rng() * (BOSS_AI.every[1] - BOSS_AI.every[0]), roar: BOSS_AI.roar, i: 0, p2: false, targets: [] } : null;
  if (!e.bai && def.mid && !def.noKit && MID_KIT[def.cls] && g.mode !== 'pvp') e.bai = { st: 'walk', t: 0, next: MID_AI.every[0] + g.rng() * 4, roar: 1e9, i: 0, p2: false, targets: [], mid: true };
  e.cloak = !tr.stealth && !!o.elite && g.mode === 'stage' && chapterOf(g.stage || 1) >= 3 && g.rng() < 0.35; e.markT = 0;
  e.pShield = tr.projShield ? (def.projShield || 3) : 0; e.unveiled = !(tr.stealth || e.cloak); if (!e.unveiled && !g.stealthTip && g.mode === 'stage') { g.stealthTip = true; ev(g, 'tip', { text: '숨은 진상! 배현경이 찾아내고 · 범위 공격이나 오지은 시간 정지에 들켜요' }); } e.shredN = 0; e.shredT = 0; e.healBlockT = 0; e.hasted = false; e.praiseT = def.praise ? 1.5 : 0; e.praiseRage = false; e.tauntT = 0;
  if (def.traits && g.seenTrait && !g.seenTrait[type]) { g.seenTrait[type] = 1; ev(g, 'traitSeen', { type, x: e.x, y: 120 }); }
  // 4~6장 진상 상태
  e.spdMul = 1; e.hasteT = 0; e.revealed = false; e.dashDone = false; e.stallT = 0; e.standT = 0; e.walkIn = false; e.lieOn = !!def.lie; e.lieWeakT = 0;
  e.insT = 2.5; e.sarcT = 1.5; e.figT = 3; e.golfT = 3; e.tossT = 3; e.discoT = 6; e.confT = 4; e.jT = 0; e.jI = -1; e.cryT = 0;
  e.goodsOn = false; e.goodsT = 0; e.owner = 0; e.sleeping = false; e.slept = false; e.sleepHits = 0; e.homed = false; e.enraged = false; e.clingTo = null;
  e.gaoOn = !!def.gao; e.flashT = def.flash ? 2 + g.rng() * 2 : 0; e.vaulted = false; e.jumpT = 0; e.latteOffT = 0;
  e.spamT = def.spam ? 3 + g.rng() * 3 : 0; e.flexT = 0; e.puddleT = 0;
  e.kneelT = def.kneel ? def.kneel.every * 0.5 : 0; e.kneelW = 0; e.kneelH = null; e.duckT = def.duck ? 2 : 0; e.feastT = def.feast ? def.feast.every * 0.6 : 0;
  e.rumorT = def.rumor ? 1 + g.rng() * 1.5 : 0;
  e.dictT = 0; e.dictCut = 0; e.dictKb = 1; e.dictSpd = 1; e.packN = 0; e.kbAge = 99; e.kbMul = 1; e.kbMinY = -1e9;
  e.form = def.scam ? 'pretty' : null; e.formT = def.scam ? def.scam.prettySec * (0.8 + g.rng() * 0.4) : 0; e.nextForm = null;
  e.baseSpeed = e.speed; e.baseAtk = e.atk;
  e.r = def.r; e.armor = def.armor || 0; e.age = 0; e.hitT = 0;
  e.stopY = def.standoff ? g.ropeY - def.standoff - g.rng() * 24 : g.ropeY - (e.boss ? 16 : 4 + g.rng() * 16);
  e.tLay = 0; e.tLayMax = 0; e.titan = false;
  if (g.tower) towerEnemy(g, e, o); // 진상의 탑: 층 공격력 · 규칙 (거물 · 떼거리 · 돌진 · 보호막 · 어둠)
  if (def.ch7 || e.ch7On) ch7Init(g, e); // 7장 스키장 진상 상태 (풀에서 꺼낸 진상은 지난 값을 지운다)
  e.censorT = 0; e.censorBy = null; e.burnT = 0; e.burnN = 0; e.burnDps = 0; e.burnTick = 0; e.burnBy = null; e.iceN = 0; e.iceT = 0; e.frozenT = 0; e.glareT = 0; e.roseN = 0; e.roseT = 0; e.danceT = 0; e.tapeT = 0; // 대개편: 화상 · 얼음 · 위압 · 장미 · 춤 · 붕대 벽
  e.tieT = 0; e.tieAgain = 0; e.tieAmpT = 0; e.tieAmp = 0; e.env = false; e.rushT = 0; e.speechT = 0; e.speechG = 0; e.hurryW = 0; e.singW = 0; // 8장: 부케 묶기 · 봉투 · 재촉 · 축사 (풀에서 꺼낸 진상도 지운다)
  if (def.ch8) ch8Init(g, e); // 8장 결혼식 뒤풀이 진상 상태
  if (g.hw) HWS.resetEnemy(e); // 할로윈 이벤트 진상 상태 (풀에서 꺼낸 진상도 지운다)
  e.cLay = 0; e.cLayMax = 0; e.cArmor = false; e.cHid = false; e.cDone = false; e.cLeak = false; e.cRush = false; e.cOff = false; e.cCrashed = false;
  if (g.conds.length && g.wave >= DOOR_PRESSURE.from) condEnemy(g, e); // 스테이지 조건 (보호막 · 철갑 · 은신 · 돌격 · 문 압박)
  if (g.wtr) wtrEnemy(g, e); // 주간 진상 특성
  e.armorPct = armorPctOf(g, e); // 방어율 (장이 깊을수록)
  g.enemies.push(e);
  if (e.boss) g.bossAlive++;
  return e;
}

// 적에게 피해. (독재자 오라 · 패거리 뭉치기 · 들켰다 배율) → 방어력 → 보호막 → 체력 순
// aoe: 범위/관통 공격 — 패거리 뭉치기를 무시한다
export const BOSS_GUARD = { hit: 0.05, perSec: 0.07, over: 0.2, from: 30 }; // 4장부터 (3-10 은 원래대로)
export function damageEnemy(g, e, dmg, crit, src, aoe, flank) {
  if (e.dead) return 0;
  if (e.speechT > 0) return ch8SpeechHit(g, e, src); // 8장 신랑 친구 대표: 축사 중엔 무적 — 대신 축사 게이지가 찬다
  if (g.hw && g.hw.onHit) { dmg = g.hw.onHit(g, e, dmg, src, aoe); if (!(dmg > 0)) return 0; } // 할로윈 H1 엎어진 좀비(무적) · H2 불 붙은 호박등 껍질
  if (e.r2 && g.r2) { dmg = g.r2.hitMul(g, e, dmg, src, aoe); if (!(dmg > 0)) return 0; } // 건물주 레이드 거대 보스: 응원 버프 · 피해 배율 (raid2-sim.js)
  if (e.tLay > 0 && src && layerHit(g, e, src)) return 0; // 탑 보호막: 한 방에 한 겹
  if (e.guardT > 0) dmg *= TENSION.bossWave.guardCut; // 보스 페이즈 전환 중: 잠깐 단단

  if (e.cLay > 0 && src && condLayer(g, e, src)) dmg *= 1 - COND.shield.cut; // 스테이지 보호막 진상: 겹이 남아 있으면 −90% (한 방에 한 겹)
  if (g.mods.ccAmp && src && (e.stunT > 0 || e.frozenT > 0 || e.slowT > 0)) dmg *= 1 + g.mods.ccAmp; // 사냥 본능 카드: 묶인 진상에게 더
  if (src && src.id === 'gunman' && (e.armor > 0 || (e.def.traits && (e.def.traits.aoeImmune || e.def.traits.projShield || e.def.traits.singleResist || e.def.traits.kbImmune)))) dmg *= NICHE.gunman.hard + NICHE.gunman.hardLv * (src.meta || 0); // 건전남: 단단한 진상 전문
  const tr = e.def.traits;
  if (tr && src) {
    if (tr.aoeImmune && aoe) { if (g.t - (e.immT || -9) > 0.6) { e.immT = g.t; ev(g, 'immune', { x: e.x, y: e.y - e.def.size * 0.7 }); } return 0; } // 노캔: 범위 공격 안 들림
    if (tr.singleResist && !aoe) dmg *= src.id === 'gunman' ? 0.85 : 0.5; // 건전남은 단일 저항도 거의 뚫는다
    if (tr.projShield && !aoe && e.pShield > 0) { e.pShield--; ev(g, 'blocked', { x: e.x, y: e.y - e.def.size * 0.7, n: e.pShield }); return 0; }
    if (tr.stealth && !e.unveiled) e.unveiled = true; // 맞으면 들킨다
  }
  { const sh = (e.shredN > 0 && e.shredT > 0 ? e.shredN * (e.shredPer || 0.06) : 0) + (e.brkT > 0 ? e.brkDmg || 0 : 0); if (sh > 0) dmg *= 1 + Math.min(0.7, sh); } // 여지원 방깎 (기본 겹 + 모자이크 폭격 · 합쳐 최대 +70%)
  if (g.encoreT > 0 && src && src.def) dmg *= 1 + (g.encoreDmg || 0); // 김도훈 앵콜 버프
  if (e.tieAmpT > 0) dmg *= 1 + (e.tieAmp || 0); // 8장 임수빈 부케 토스: 묶인 진상은 모두에게 더 아프게
  // 속성 상성: 효과 굉장! ×TYPE_STRONG(1.6) / 별로… ×TYPE_WEAK(0.7) — data.js TYPE_CHART
  let tm = 1;
  if (src && src.def && src.def.attr && !g.noTypes) {
    const m = typeMul(src.def.attr, e.def.cls);
    tm = m;
    if (m !== 1) {
      dmg *= m * (m > 1 ? 1 + (src.gear && src.gear.attr ? src.gear.attr : 0) + g.mods.attrUp : 1);
      if (g.t - g.effT > 0.8) { g.effT = g.t; ev(g, 'eff', { x: e.x, y: e.y - e.def.size * 0.75, strong: m > 1 }); }
    }
  }
  if (e.fast && src && src.def && !(e.slowT > 0) && !(e.stunT > 0) && !BAL.noMiss.includes(src.def.proj) && !(g.timeStopT > 0)) {
    let ch = e.boss || e.mid ? BAL.fast.dodgeBig : aoe ? BAL.fast.dodgeAoe : BAL.fast.dodge;
    if (g.tower && g.tower.rush && src.def.proj === 'dash') ch = Math.max(ch, TOWER_SIM.dash.rushDodge); // 탑 돌진: 근접 돌격은 더 잘 빗나간다
    if (g.rng() < ch) { if (g.t - (e.missT || -9) > 0.35) { e.missT = g.t; ev(g, 'dodge', { x: e.x, y: e.y - e.def.size * 0.6 }); } return 0; }
  }
  if (e.boardT > 0 && ch7Dodge(g, e, src)) return 0; // 7장 보드남: 줄 바꾸는 순간엔 잘 피한다
  if (!e.unveiled && src) { e.unveiled = true; ev(g, 'unveil', { x: e.x, y: e.y - 30 }); } // (숨은 적은 맞으면 드러난다 · 범위 공격으로도)
  if (e.censorT > 0) dmg *= 1 + ((HEROES.jiwon.censor && HEROES.jiwon.censor.amp) || 0); // 여지원 검열 완료
  if (g.onemanT > 0 && g.onemanAmp && e.danceT > 0) dmg *= 1 + g.onemanAmp; // 강병화 원맨쇼: 무대 위 진상 야유
  if (e.markT > 0) dmg *= 1.25 + (g.markBonus || 0) + (g.sigMark || 0); // 배현경 표시: 모두에게 +25% (표적 표시 증강 +20%p)
  if (e.orderT > 0) { const ob = dmg * (e.orderMul || 0); dmg += ob; if (src && src.id !== 'bangjang' && g.stats.team && !g.over) { g.stats.team.buff += ob; teamOf(g, 'bangjang').buff += ob; } } // 방장 지목: 모든 멤버에게 받는 피해 + (늘어난 만큼 방장 버프 기여)
  if (src && src.id === 'hyungyeong') e.markT = Math.max(e.markT, 1.5);
  if (e.dictT > 0) dmg *= 1 - e.dictCut;
  if (e.elite && aoe) dmg *= 0.65; // 정예: 범위 공격이 덜 먹힌다 (한 방 멤버가 빛나게)
  if (e.packN > 0 && !aoe) { const pk = e.def.pack; dmg *= 1 - Math.min(pk.maxCut, pk.cut * e.packN); }
  if (e.form === 'reveal') dmg *= e.def.scam.revealDmg;
  if (e.weakT > 0) dmg *= 1.5; // 보스 빈틈!
  if (e.stallT > 0) dmg *= e.def.dash.weak; // 카푸어 퍼짐
  if (e.lieWeakT > 0) dmg *= 1.5; // 싱글맘 거짓말 들킴
  if (e.goodsOn) dmg *= 1 - e.def.goods.cut; // 오타쿠 굿즈 보호막
  if (e.sleeping) { dmg *= e.def.sleep ? e.def.sleep.dmg : 0.5; if (e.def.sleep && ++e.sleepHits >= e.def.sleep.hits) { e.sleeping = false; ev(g, 'wake', { x: e.x, y: e.y - e.def.size * 0.6 }); } }
  if (src && src.def) dmg *= e.boss || e.mid ? 1 + g.mods.bossDmg : 1 + g.mods.swarmDmg;
  // 장비: 보스 피해(헬스장 회원권) · 졸개 피해(우퍼 스피커) · 치명타 피해(금목걸이) · 마무리(라스트오더 종)
  if (src && src.gear) {
    const q = src.gear;
    if (q.boss && (e.boss || e.mid)) dmg *= 1 + q.boss;
    if (q.swarm && !e.boss && !e.mid && !e.elite) dmg *= 1 + q.swarm;
    if (q.critDmg && crit) dmg *= 1 + q.critDmg / g.mods.critMul;
    if (q.exec && e.maxHp > 0 && e.hp <= e.maxHp * 0.3) dmg *= 1 + q.exec;
  }
  // 장비 '버프 벗기기': 보호막 · 독재자 버프 · 가오를 벗긴다
  if (src && src.gear && src.gear.strip && (e.shield > 0 || e.dictT > 0 || e.gaoOn) && g.rng() < src.gear.strip) {
    e.shield = 0; e.dictT = 0; if (e.gaoOn) e.gaoOn = false;
    ev(g, 'strip', { x: e.x, y: e.y - e.def.size * 0.7 });
  }
  // 셀카 플래시에 눈부신 멤버는 절반쯤 빗나간다
  if (src && ((src.blindT > 0 && g.rng() < ENEMIES.selfie.flash.miss) || (g.strobeT > 0 && g.rng() < g.mapFx.miss))) {
    if (g.t - (g.missT || -9) > 0.5) { g.missT = g.t; ev(g, 'miss', { x: e.x, y: e.y - e.def.size * 0.6 }); }
    return 0;
  }
  // 가오충: 가오 중엔 단단하다. 말빨 공격이나 치명타 한 방이면 "가오 깨짐!"
  if (e.def.gao) {
    if (e.gaoOn && src && ((src.def && src.def.attr === 'talk') || crit)) { e.gaoOn = false; ev(g, 'gaoBreak', { x: e.x, y: e.y - e.def.size * 0.7 }); }
    dmg *= e.gaoOn ? (flank ? 1 : 1 - e.def.gao.cut) : e.def.gao.broken; // 옆에서 베면(김영준) 가오 무시
  }
  e.hurtT = 0;
  if (e.armor && !(src && src.id === 'gunman')) { const ar = e.armor * (e.brkT > 0 ? 1 - (e.brkArmor || 0) : 1); dmg = Math.max(dmg * 0.35, dmg - ar); } // 건전남은 방어 무시 · 모자이크 방어 -40%
  if (e.armorPct > 0 && !g._dot) dmg *= 1 - armorCut(e, src); // 방어율 (장이 깊을수록) — 방관 멤버 · 여지원 모자이크가 뚫는다 · 화상은 무시
  // 보스 · 중간 보스: 한 방에 최대 체력 5% 넘게는 잘 안 들어간다 (넘는 만큼은 ⅕) + 1초에 7% 넘게 몰아치면 넘친 만큼 ⅕
  //  → 아주 센 덱도 보스는 몇 초 만에 녹지 않는다 (공주의 일격 · 황금 파동 같은 큰 한 방도 여전히 크게 깎이긴 함)
  if ((e.boss || e.mid) && src && e.maxHp > 0 && (g.mode !== 'stage' || g.stage > BOSS_GUARD.from)) { // 1~3장은 보스가 원래대로
    const cap = e.maxHp * BOSS_GUARD.hit;
    if (dmg > cap) dmg = cap + (dmg - cap) * BOSS_GUARD.over;
    const room = Math.max(0, e.maxHp * BOSS_GUARD.perSec - (e.burst || 0));
    if (dmg > room) dmg = room + (dmg - room) * BOSS_GUARD.over;
    e.burst = (e.burst || 0) + dmg;
  }
  const shown = dmg;
  if (src && src.id) { const st0 = g.stats; st0.dmgAll = (st0.dmgAll || 0) + dmg; if (aoe) st0.aoeDmg = (st0.aoeDmg || 0) + dmg; const bh = st0.byHero || (st0.byHero = {}); bh[src.id] = (bh[src.id] || 0) + dmg; if (e.boss || e.mid) { const bb = st0.byHeroBoss || (st0.byHeroBoss = {}); bb[src.id] = (bb[src.id] || 0) + dmg; } }
  if (e.shield > 0) {
    const a = Math.min(e.shield, dmg);
    e.shield -= a;
    dmg -= a;
    // 싱글맘 거짓말 방패가 깨지면 "들켰다!" 기절 · 친구 소환
    if (e.lieOn && e.shield <= 0) {
      const l = e.def.lie;
      e.lieOn = false; e.stunT = Math.max(e.stunT, l.stun); e.lieWeakT = l.weak;
      for (let i = 0; i < l.n; i++) spawnEnemy(g, l.summon, clamp(e.x + (i ? 26 : -26), 18, g.W - 18), e.y + 8, { hpMul: hpMul(g.diff, g.mode === 'stage') * (g.hpScale || 1) * 0.6 });
      ev(g, 'lieBreak', { x: e.x, y: e.y - e.def.size * 0.6 });
    }
  }
  if (g.tension && e.boss && !e.mid && !e.second && e.phT0 !== undefined && dmg > 0) { // 보스 페이즈 잠금 (10/08 '길고 굵게'): 한 페이즈는 최소 phaseMin 초 — 그 전엔 다음 문턱 아래로 안 내려간다 ('버틴다!')
    const BW = TENSION.bossWave, n = e.phN | 0, floor = n < BW.phases.length ? e.maxHp * (BW.phases[n] + 0.003) : 1, min = (((g.stage - 1) % 10) + 1 === 10 ? BW.phaseMin.last : BW.phaseMin.mid) * (g.hell ? BW.hellPhase : 1) * ((BW.phaseMinCh || [])[chapterOf(g.stage || 1) - 1] || 1);
    if (g.t - e.phT0 < min && e.hp - dmg < floor) { dmg = Math.max(0, e.hp - floor); if (g.t - (e.holdT || -9) > 1.5) { e.holdT = g.t; ev(g, 'bossHold', { x: e.x, y: e.y - e.def.size * 0.7 }); } }
  }  e.hp -= dmg;
  if (e.raidBoss) g.raid.dmg += dmg;
  if (e.r2 && g.r2) g.r2.onHit(g, e, dmg, src); // 건물주 레이드: 부위별 피해 · 내려찍기 끊기
  e.flash = 0.09;
  g.stats.damage += dmg;
  if (src) { src.dmgDone += dmg; if (src._bfM > 1.001) creditBuff(g, src, dmg); }
  ev(g, 'dmg', { uid: e.uid, x: e.x, y: e.y - e.def.size * 0.55, v: Math.round(shown), crit: !!crit || !!g._inSkill, sk: !!g._inSkill, shield: dmg < shown, eff: tm > 1 ? 1 : tm < 1 ? -1 : 0 });
  if (e.hp <= 0) killEnemy(g, e, src);
  else if (e.def.breakup && !e.split && e.hp < e.maxHp * e.def.breakup.at) breakUp(g, e);
  return shown;
}

const MK_WIN = 0.35;
function flushMultiKill(g) {
  const mk = g.mk;
  if (mk.n >= 3) ev(g, 'multikill', { n: mk.n, x: mk.x / mk.n, y: mk.y / mk.n, combo: g.combo });
  if (mk.n >= 4 && g.cstat) g.cstat.multi++;
  mk.n = 0; mk.x = 0; mk.y = 0;
}
function traitTick(g, e, dt, tr) {
  const def = e.def;
  if (tr.regen && e.healBlockT <= 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (def.regenPct || 0.04) * dt);
  if (tr.haste && !e.hasted && e.hp < e.maxHp * 0.4) { e.hasted = true; e.spdMul *= 1.5; ev(g, 'haste', { x: e.x, y: e.y - 30 }); }
  if (!e.unveiled && (tr.stealth || e.cloak) && e.y > FIELD.spawnY + (g.ropeY - FIELD.spawnY) * 0.75) { e.unveiled = true; ev(g, 'unveil', { x: e.x, y: e.y - 30 }); } // 길 75% 지나면 드러난다
  if (e.markT > 0) e.markT -= dt;
  if (e.wallT > 0) { e.wallT -= dt; if (e.wallT <= 0) { const W0 = HEROES.jeongseob.wall; e.slowMul = Math.max(e.slowMul, e.boss ? W0.bossAfter : W0.afterSlow); e.slowT = Math.max(e.slowT, W0.slowSec); e.wallBy = null; } }
  if (def.praise && (e.praiseT -= dt) <= 0) {
    e.praiseT = def.praise.every;
    let n = 0;
    forEnemiesNear(g, e.x, e.y, def.praise.r, (o) => { if (o !== e && !o.dead) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * def.praise.heal); o.hasteT = Math.max(o.hasteT, def.praise.haste); n++; } return true; });
    if (n) ev(g, 'praise', { x: e.x, y: e.y - 40, text: def.shouts[(g.rng() * 2) | 0] });
  }
}
function midKit(e) {
  if (MID_KITS[e.type]) return { name: e.def.name, skills: MID_KITS[e.type], p2: null }; // (10/08) 중간 보스마다 제 기술
  const [kind, name, o] = MID_KIT[e.def.cls];
  const types = kind === 'summon' ? [e.def.base || (e.def.fuse && e.def.fuse[0]) || 'drunk'] : undefined;
  return { name: e.def.name, skills: [[kind, name, types ? Object.assign({}, o, { types }) : o]], p2: null };
}
// 보스 패턴 (예고 → 기술 → 틈) · 2페이즈 · 포효
function bossBrain(g, e, dt) {
  const b = e.bai, kit = b.mid ? midKit(e) : BOSS_KITS[e.type];
  if (b.st === 'windup' && (e.stunT > 0 || e.frozenT > 0 || e.tieT > 0) && (b.mid || BREAK_KINDS.has(b.cur[0]))) { // (10/08) 예고 중에 기절 · 빙결 · 묶기 → 끊김 (중간 보스 전부 · 보스는 던지기 · 홀림 · 입구 강타)
    b.st = 'recover'; b.t = BOSS_AI.recover; e.bwind = 0; e.weakT = Math.max(e.weakT, BOSS_AI.recover);
    g.stats.castBreak = (g.stats.castBreak | 0) + 1;
    ev(g, 'castBreak', { x: e.x, y: e.y - e.def.size * 0.6, uid: e.uid, boss: true, name: b.cur[1] });
    return;
  }
  if (e.y < 60 || e.stunT > 0 || e.avaW > 0 || e.quietW > 0 || e.speechT > 0 || e.hurryW > 0) return; // (7장 회장 눈사태 · 펜션 사장님 소음 금지 예고 중엔 다른 기술 안 씀)
  if (!b.p2 && e.hp < e.maxHp * (kit.rageAt || 0.5)) {
    b.p2 = true; e.spdMul *= 1.25; e.atk *= 1.2; if (b.st === 'walk' && kit.everyP2) b.next = Math.min(b.next, kit.everyP2[1]);
    // (10/08 진상 감사) 옛 분노(enrage · 헬 보스 분노)가 같은 체력에서 겹치면 한 번에 — 예전엔 배너 두 장이 같은 순간에 겹쳐 떴다
    const en = e.def.enrage || (g.hell && e.boss ? HELL.bossEnrage : null), both = !!(en && !e.enraged && e.hp < e.maxHp * en.at);
    if (both) { e.enraged = true; e.spdMul *= en.speed; e.atk *= en.atk; }
    ev(g, b.mid ? 'midRage' : 'bossRage', { x: e.x, y: e.y - e.def.size * 0.7, name: kit.name, sub: kit.rageSub, type: e.type, title: both ? en.text : '' });
  }
  if ((b.roar -= dt) <= 0) { // 포효: 날아가던 공격을 지우고 곁의 부하에게 보호막
    b.roar = BOSS_AI.roar;
    g.projs = g.projs.filter((p) => Math.hypot(p.x - e.x, p.y - e.y) > 220);
    forEnemiesNear(g, e.x, e.y, 160, (o) => { if (o !== e && !o.dead) o.shield = Math.max(o.shield, o.maxHp * 0.15); return true; });
    ev(g, 'bossRoar', { x: e.x, y: e.y });
  }
  if (b.st === 'walk') {
    if ((b.next -= dt) > 0) return;
    const list = b.p2 && kit.p2 ? [...kit.skills, kit.p2] : kit.skills;
    b.cur = list[b.i++ % list.length];
    if (b.p2 && b.cur[2] && b.cur[2].rage) b.cur = [b.cur[0], b.cur[1], Object.assign({}, b.cur[2], b.cur[2].rage)]; // 분노: 더 많이 · 더 세게
    if (b.cur[0] === 'stun' && e.def.slam) b.cur = ['shock', b.cur[1], {}]; // 원래 땅 내려치기가 있는 보스는 기절을 겹치지 않게
    b.st = 'windup'; b.t = BOSS_AI.windup * (g.windMul || 1); e.bwind = b.t; // (할로윈 저주: 예고 짧게)
    // 예고: 기절이면 노릴 멤버를 먼저 정한다 (빨간 원)
    const [kind, , o] = b.cur;
    b.targets = kind === 'stun' || kind === 'flyer' || kind === 'volley' || kind === 'charm' ? pickTargets(g, o.n) : [];
    ev(g, 'bossWind', { x: e.x, y: e.y - e.def.size * 0.6, kind, name: b.cur[1], targets: b.targets.map((h) => ({ x: h.x, y: h.y, id: h.id })), st: kind === 'volley' ? o.st : kind, art: o.art, mid: !!b.mid, uid: e.uid, ropeY: g.ropeY, ex: e.x, sec: b.t, r: o.r });
  } else if (b.st === 'windup') {
    e.bwind = b.t;
    if ((b.t -= dt) > 0) return;
    e.bwind = 0;
    bossSkill(g, e, b.cur);
    b.st = 'recover'; b.t = BOSS_AI.recover; e.weakT = Math.max(e.weakT, BOSS_AI.recover); // 틈! (+50% 피해)
    ev(g, 'bossGap', { x: e.x, y: e.y - e.def.size * 0.8 });
  } else if ((b.t -= dt) <= 0) {
    b.st = 'walk';
    const r = b.mid ? MID_AI.every : b.p2 ? kit.everyP2 || BOSS_AI.everyP2 : BOSS_AI.every;
    b.next = r[0] + g.rng() * (r[1] - r[0]);
  }
}
function pickTargets(g, n) {
  const hs = g.heroes.filter((h) => !h.gone && !h.def.summon);
  const tank = hs.find((h) => h.def.taunt);
  const out = [];
  if (tank) out.push(tank); // 도발 탱커가 먼저 맞아 준다
  while (out.length < n && out.length < hs.length) { const h = hs[(g.rng() * hs.length) | 0]; if (!out.includes(h)) out.push(h); }
  return out;
}
const BREAK_KINDS = new Set(['volley', 'charm', 'door']);
function bossSkill(g, e, [kind, name, o]) {
  if (kind === 'stun') for (const h of e.bai.targets) { if (h.gone) continue; hitHero(g, h, { st: 'stun', sec: o.sec }, e); ev(g, 'heroStun', { x: h.x, y: h.y }); }
  else if (kind === 'volley') { // (10/08) 노린 멤버에게 던지기 (예고 표적 그대로 · 날아가는 동안 보인다)
    const top = e.y - e.def.size * 0.55, hit = [];
    for (const h of e.bai.targets) { if (h.gone) continue; g.eprojs.push({ kind: o.art || 'star', sx: e.x, sy: top, tx: h.x, ty: h.y - 30, x: e.x, y: top, t: 0, dur: 0.55, hero: h, src: e, srcUid: e.uid, stun: 0, fx: { st: o.st, sec: o.sec, cut: o.cut, hit: o.hit } }); hit.push({ x: h.x, y: h.y, id: h.id }); }
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, boss: e.type, hits: hit, st: o.st, art: o.art, mid: !!e.mid });
    return;
  } else if (kind === 'charm') {
    const hit = [];
    for (const h of e.bai.targets) { if (h.gone) continue; if (hitHero(g, h, { st: 'charm', sec: o.sec, hit: o.hit }, e) > 0) hit.push({ x: h.x, y: h.y, id: h.id }); }
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, boss: e.type, hits: hit, mid: !!e.mid });
    return;
  } else if (kind === 'door') { // (10/08) 입구 강타: 입구 최대 내구도 frac (수리 · 탱커 · 방패가 줄인다) + 입구 앞 멤버 둘 게이지
    if (!g.god && g.base) { const hp0 = g.base.hp; damageBase(g, g.base.max * o.frac * (g.hell ? 1.07 : 1) * (g.tension && e.boss && !e.mid ? TENSION.bossWave.kitDoor : 1), e); if (e.def.interest) e.loanTaken += Math.max(0, hp0 - g.base.hp); } // (사채업자 압류 딱지도 빚 — 잡으면 탕감)
    if (g.kdOn) { const hs = g.heroes.filter((h) => !h.def.summon && !h.gone && !h.out).sort((a, c) => Math.abs(a.x - e.x) - Math.abs(c.x - e.x)).slice(0, 2); for (const h of hs) kdAdd(g, h, hitKd(o, e) * 0.8, { src: 'hit' }); }
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, boss: e.type, door: { x: clamp(e.x, 40, g.W - 40), y: g.ropeY }, mid: !!e.mid });
    return;
  } else if (kind === 'heal') {
    let n = 0;
    forEnemiesNear(g, e.x, e.y, o.r, (x) => { if (!x.dead && x.hp < x.maxHp && !(x.healBlockT > 0)) { x.hp = Math.min(x.maxHp, x.hp + x.maxHp * (x === e ? o.frac * 0.4 : o.frac)); n++; } return true; });
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, boss: e.type, r: o.r, n, mid: !!e.mid });
    return;
  }
  else if (kind === 'silence') { for (const h of g.heroes) h.silenceT = Math.max(h.silenceT || 0, debuffSec(h, o.sec, 'silence')); }
  else if (kind === 'slow') { g.bossSlowT = Math.max(g.bossSlowT || 0, o.sec); g.bossSlowCut = o.cut; }
  else if (kind === 'shock') { g.projs = g.projs.filter((p) => p.y > e.y + 220 || Math.abs(p.x - e.x) > 200); forEnemiesNear(g, e.x, e.y, 200, (x) => { if (x !== e && !x.dead) x.shield = Math.max(x.shield, x.maxHp * 0.1); return true; }); }
  else if (kind === 'summon' && o.carpet) { // 8-10 신랑 친구 대표 「친구들 무대로!」: 두루마리가 레드카펫처럼 입구 쪽으로 쫙 펼쳐지고 그 위에 친구들이 줄줄이
    const y0 = e.y + 40, y1 = Math.min(g.ropeY - 90, y0 + o.len), lx = clamp(e.x, 40, g.W - 40);
    for (let k = 0; k < o.n; k++) { const t = o.types[k % o.types.length]; if (ENEMIES[t]) spawnEnemy(g, t, clamp(lx + (k % 2 ? 14 : -14), 20, g.W - 20), y0 + ((y1 - y0) * (k + 1)) / (o.n + 1)); }
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, boss: e.type, carpet: { x: lx, y0, y1 } });
    return;
  }
  else if (kind === 'summon') { for (let k = 0; k < o.n; k++) { const t = o.types[k % o.types.length]; if (ENEMIES[t]) spawnEnemy(g, t, clamp(e.x + (k - (o.n - 1) / 2) * 36, 20, g.W - 20), Math.max(20, e.y - 30)); } }
  else if (kind === 'drain') { const v = Math.floor(g.exp * o.v); g.exp -= v; g.stats.stolen += v; e.stolen = (e.stolen || 0) + v; }
  else if (kind === 'flyer') { // 삐끼왕 전단지 폭탄: 예고된 멤버 시야를 가린다 (사거리 ↓ · 저항 · 강성구 곁이면 짧게)
    const hit = [];
    for (const h of e.bai.targets) { if (h.gone) continue; const sc = debuffSec(h, o.sec, 'slow'); if (sc <= 0) continue; h.flyerT = Math.max(h.flyerT || 0, sc); h.flyerCut = o.cut; hit.push({ x: h.x, y: h.y, id: h.id, sec: sc }); }
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, hits: hit, cut: o.cut, sec: o.sec, type: e.type });
    return;
  } else if (kind === 'lure') { // 삐끼왕 호객 행위: 곁의 진상을 한 줄로 바짝 모아 입구로 우르르 + 손님(2장 진상) 호객
    let n = 0;
    forEnemiesNear(g, e.x, e.y, o.r, (x) => { if (x !== e && !x.dead && !x.boss && !x.mid) { x.x = clamp(x.x + (e.x - x.x) * o.pull, 20, g.W - 20); x.baseX = x.x; x.lureT = Math.max(x.lureT || 0, o.sec); x.lureSpd = o.spd; n++; } return true; });
    for (let k = 0; k < o.n; k++) { const t = o.types[k % o.types.length]; if (!ENEMIES[t]) continue; const c = spawnEnemy(g, t, clamp(e.x + (k - (o.n - 1) / 2) * 30, 20, g.W - 20), Math.max(20, e.y - 20)); c.lureT = o.sec; c.lureSpd = o.spd; }
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, n: n + o.n, type: e.type });
    return;
  } else if (kind === 'vip') { // 삐끼왕 VIP 줄 세우기: 입구 앞 줄 진상에게 보호막
    const front = g.enemies.filter((x) => !x.dead && x !== e && !x.boss && x.y > 40).sort((a, c) => c.y - a.y).slice(0, o.n);
    for (const x of front) x.shield = Math.max(x.shield, x.maxHp * o.frac);
    ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, pts: front.map((x) => ({ x: x.x, y: x.y })), type: e.type });
    return;
  }
  ev(g, 'bossSkill', { x: e.x, y: e.y, kind, name, boss: e.type, hits: kind === 'stun' ? e.bai.targets.filter((h) => !h.gone).map((h) => ({ x: h.x, y: h.y, id: h.id })) : undefined, sec: o.sec }); // (boss · hits: 보스마다 다른 기술 연출 — kitfx.js)
}
export const isHidden = (e) => !!e.hwLie || !e.unveiled && !!((e.def.traits && e.def.traits.stealth) || e.cloak);
export const killEnemyX = (g, e, src) => killEnemy(g, e, src || null); // 할로윈 H2 호박등 펑 (hw-sim.js)
function killEnemy(g, e, src) {
  if (g.hw && g.hw.preKill(g, e, src)) return; // 할로윈 좀비 "한 잔 더!": 이번엔 안 쓰러진다
  e.dead = true;
  if (g.mods.killBoom && src && !g._inBoom) { g._inBoom = true; const v = e.maxHp * g.mods.killBoom; forEnemiesNear(g, e.x, e.y, 60, (o) => { if (o !== e && !o.dead) damageEnemy(g, o, v, false, src, true); return true; }); ev(g, 'splash', { x: e.x, y: e.y, r: 60, proj: 'boom' }); g._inBoom = false; } // 연쇄 퇴장 카드
  if (e.censorT > 0 && e.censorBy && g.heroes.includes(e.censorBy)) censorPop(g, e); // 여지원: 검열 완료된 진상이 쓰러지면 픽셀 폭발
  const def = e.def;
  const s = g.stats;
  s.kills++;
  if (src) src.kills++;
  g.combo++;
  g.comboT = RULES.comboWindow;
  if (g.mom !== null && g.mom !== undefined) g.mom = Math.min(MOMENTUM.max, g.mom + MOMENTUM.kill + (g.combo % 10 === 0 ? MOMENTUM.combo10 : 0));
  if (g.combo > s.maxCombo) s.maxCombo = g.combo;
  s.score += SCORE.kill + Math.min(g.combo, SCORE.comboCap);
  // 경험치 보석 (떨어진 뒤 잠깐 튀었다가 저절로 경험치 바로 날아간다)
  const gm = src && src.def && src.def.grow;
  if (gm) growBy(src, gm.perKill);
  const xp = (g.mode === 'endless' && g.wave > ENDLESS_TUNE.from ? Math.pow(ENDLESS_TUNE.xp, g.wave - ENDLESS_TUNE.from) : 1) * def.exp * g.mods.expMul * (1 + Math.min(0.15, g.combo * 0.003)) * (gm ? 1 + gm.exp + (src.lv >= 5 ? 0.25 : 0) : 1); // 연속 처치 보너스 (최대 +15%) · 박상화가 잡으면 경험치 더
  // 멀티킬: 0.35초 안에 쓰러진 진상을 한 묶음으로
  const mk = g.mk || (g.mk = { n: 0, t0: 0, x: 0, y: 0 });
  if (mk.n && g.t - mk.t0 > MK_WIN) flushMultiKill(g);
  if (!mk.n) mk.t0 = g.t;
  mk.n++; mk.x += e.x; mk.y += e.y;
  if (e.boss) {
    for (let i = 0; i < 10; i++) dropGem(g, e.x + (g.rng() - 0.5) * 80, e.y + (g.rng() - 0.5) * 60, xp / 10);
  } else dropGem(g, e.x, e.y, xp);
  if (e.env && e.fleeing) { s.envSaved = (s.envSaved | 0) + 1; ev(g, 'c8recover', { x: e.x, y: e.y - def.size * 0.5 }); } // 8장: 도둑을 잡아 봉투를 되찾았다
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
  if (def.explode) g._boom.push(e.x, e.y, def.explode.r, def.explode.dmg);
  if (def.bottle && e.y > g.ropeY - 70 && (g.mode !== 'stage' || (g.stage | 0) >= def.bottle.from)) { let n = 0; for (const h of g.heroes) if (Math.abs(h.x - e.x) < def.bottle.deathR) { const sc = debuffSec(h, def.bottle.deathStun, 'stun'); if (sc > 0) { h.stunT = Math.max(h.stunT, sc); n++; } } if (n) { ev(g, 'drunkBoom', { x: e.x, y: e.y }); firstStunTip(g); } }
  if (def.deathPuddle) g.puddles.push({ x: e.x, y: e.y + 10, r: def.deathPuddle.r, t: def.deathPuddle.sec, max: def.deathPuddle.sec, enemy: true });
  if (def.spam) spamDots(g, e, def.spam.burst);
  if (e.grabbing) { const h = e.grabbing; if (h.grabBy === e.uid) { h.grabT = 0; h.grabBy = 0; ev(g, 'release', { x: h.x, y: h.y }); } e.grabbing = null; }
  if (e.clingTo) { const h = e.clingTo; if (h.clingBy === e.uid) { h.clingBy = 0; ev(g, 'release', { x: h.x, y: h.y }); } e.clingTo = null; }
  // 사채업자를 잡으면 떼어 간 이자 일부를 돌려받는다
  if (def.interest && e.loanTaken > 0 && !g.over) {
    const back = Math.min(g.base.max - g.base.hp, e.loanTaken * def.interest.refund);
    g.base.hp += back;
    ev(g, 'debtFree', { x: e.x, y: e.y, v: Math.round(back) });
  }
  if (def.splitInto) for (let k = 0; k < def.splitInto.n; k++) { const c = spawnEnemy(g, def.splitInto.type, clamp(e.x + (k - (def.splitInto.n - 1) / 2) * 24, 16, g.W - 16), e.y - 6); c.stopY = e.stopY; ev(g, 'split', { x: e.x, y: e.y, into: def.splitInto.type }); }
  if (def.praise) { const mate = g.enemies.find((o) => !o.dead && o.type === def.praise.pair && Math.abs(o.x - e.x) < 200 && !o.praiseRage); if (mate) { mate.praiseRage = true; mate.atk *= def.praise.rageAtk; mate.spdMul *= def.praise.rageSpd; ev(g, 'praiseRage', { x: mate.x, y: mate.y - 40 }); } }
  extraKill(g, e, src);
  if (g.wk) g.wk.onKill(g, e, src); // 주간: 도둑 · 현상금 · 연쇄 폭발
  ev(g, 'kill', { x: e.x, y: e.y, enemy: e.type, boss: e.boss });
  if (e.boss || g.rng() < 0.12) ev(g, 'shout', { x: e.x, y: e.y - def.size * 0.6, text: def.shouts[(g.rng() * def.shouts.length) | 0] });
  if (g.focus === e) g.focus = null;
}

function explode(g, x, y, r0, d0) {
  const ex = ENEMIES.drunk.explode;
  const r = r0 || ex.r;
  const dmg = (d0 || ex.dmg) * (1 + 0.08 * (g.diff - 1));
  ev(g, 'explode', { x, y, r });
  forEnemiesNear(g, x, y, r, (e) => damageEnemy(g, e, dmg, false, null, true));
}

export function damageBase(g, dmg, e) {
  if (g.over || g.god) return;
  if (g.kdOn && e && !e.dead && e.atRope) kdLine(g, e); // 쓰러짐 게이지: 입구 앞 멤버도 맞는다
  // 정원식 도발: 입구 피해의 20% 를 되돌려 준다
  if (e && e.tauntT > 0 && !e.dead) { const ws = g.heroes.find((o) => o.id === 'wonsik'); if (ws) damageEnemy(g, e, dmg * 0.2 * (1 + ws.meta * 0.02), false, ws, false); }
  for (const tank of g.heroes) if (tank.def.guard && e) { const near = Math.abs(e.x - tank.x) < tank.def.guard.r * (tank.cm.guardR || 1); const cut = near ? Math.min(0.6, tank.def.guard.cut + (tank.cm.guardCut || 0)) : tank.def.guard.all || 0; if (cut > 0) { prevented(g, tank.id, dmg * cut); dmg *= 1 - cut; } } // 탱커: 곁은 크게 · 나머지 입구도 조금
  { const ws = g.heroes.find((o) => o.wsSt === 'sit' && o.wsPool > 0); if (ws) { const C = ws.def.skill.consult; ws.wsPool -= dmg * (1 - C.cut); prevented(g, ws.id, dmg); ws.hurtT = g.t; if (e && g.t - (ws.wsHitT || -9) > 0.35) { ws.wsHitT = g.t; ev(g, 'wsHit', { x: ws.px, y: ws.py - 40, ex: e.x, ey: e.y, v: Math.round(dmg * (1 - C.cut)) }); } return; } } // 상담 중: 입구 앞에 막아선 원식이 입구 대신 전부 맞는다
  if (e && e.tauntT > 0) { prevented(g, 'wonsik', dmg * 0.8); dmg *= 0.2; } // 정원식 결혼정보회사: 원식만 바라본다
  if (e && e.glareT > 0 && HEROES.jungmin.swing) { const c0 = HEROES.jungmin.swing.glareCut; prevented(g, 'jungmin', dmg * c0); dmg *= 1 - c0; } // 홍정민 흉터 눈빛: 쫄아서 덜 세게
  if (e && !e.dead && !e.boss) counterPunch(g, e); // 정원식 반격
  if (e && e.grooveT > 0 && HEROES.dohoon.groove) { const c0 = HEROES.dohoon.groove.cut; prevented(g, e.grooveBy || 'dohoon', dmg * c0); dmg *= 1 - c0; } // 김도훈 떼창에 빠진 진상: 입구를 덜 세게
  { const jm = HEROES.jungmin.brace; if (jm && g.heroes.some((o) => o.id === 'jungmin' && !o.gone)) { const c0 = e && e.cRush && !e.cCrashed ? jm.crash : jm.all; prevented(g, 'jungmin', dmg * c0); dmg *= 1 - c0; } } // 홍정민 보강: 입구 피해 −10% · 돌격 충돌 −50%
  if (g.bandT > 0) prevented(g, 'jungmin', dmg * g.mods.baseArmor * g.bandArmor);
  dmg *= g.mods.baseArmor * (g.bandT > 0 ? 1 - g.bandArmor : 1) * (g.bouncerT > 0 ? 1 - CONS_FX.bouncer.cut : 1); // 경호원 호출: 입구 피해 −80%
  if (g.doorShield > 0 && g.doorShieldT > 0) { const a = Math.min(g.doorShield, dmg); g.doorShield -= a; dmg -= a; prevented(g, g.doorShieldBy || 'gunnyeo', a); if (g.doorShield <= 0) { g.doorShield = 0; ev(g, 'doorShieldBreak', { x: g.W / 2, y: g.ropeY }); } } // 건전녀 방패가 먼저 막는다
  if (g.pvp) { dmg *= g.pvp.doorMul; g.pvp.hurt += dmg; } // 1:1 서든데스: 입구 받는 피해 단계마다 +20%
  g.base.hp -= dmg;
  if (dmg > 0) g.baseHit = true;
  ev(g, 'baseHit', { x: e ? e.x : g.W / 2, y: g.ropeY, v: Math.round(dmg), boss: !!(e && e.boss), by: e ? e.type : '' }); // (by: 밸런스 측정 — 누가 입구를 쳤나) // (던진 진상이 이미 죽었으면 e 가 없다)
  if (g.base.hp <= 0 && !g.sigRevived) { // 홍정민 전용 신화: 한 판에 한 번 붕대로 다시 붙인다
    const jm = g.heroes.find((o) => o.sig && o.sig.revive && !o.gone);
    if (jm) { g.sigRevived = true; g.base.hp = Math.round(g.base.max * jm.sig.revive); ev(g, 'bandage', { x: g.W / 2, y: g.ropeY + 8, v: Math.round(g.base.hp), big: true, hero: jm.id }); ev(g, 'sigFx', { hero: jm.id, x: jm.x, y: jm.y, revive: true }); return; }
  }
  if (g.base.hp <= 0) {
    g.base.hp = 0;
    g.over = true;
    g.phase = 'over';
    ev(g, 'gameover', {});
  }
}

// 긴장감 · 제어 저항 (10/08): 같은 진상에게 기절 · 빙결이 window 초 안에 또 걸리면 steps 배씩 짧게 → 끝까지 가면 immune 초 면역 ('저항')
//  밀어내기(넉백 · 밀치기)는 진상마다 push.win 초 동안 push.cap 만큼까지만 (그 위로는 안 밀림) · 정예 · 중간 보스 · 보스는 elite 배 (밀기는 pushElite 배)
//  — 기절 · 넉백 · 강퇴 연쇄로 진상이 입구에 영영 못 오던 것 (제어 덱은 여전히 강하지만 길을 영원히 막지는 못한다)
// 보스 페이즈 (10/08 '길고 굵게'): 체력이 BW.phases 아래로 내려가면 잠깐 단단해지며 졸개를 부른다 · '2페이즈!'
function bossPhase(g, e, dt) {
  const BW = TENSION.bossWave;
  if (e.guardT > 0) e.guardT -= dt;
  if (e.stopY0 === undefined) e.stopY0 = e.stopY;
  e.stopY = (e.phN | 0) < BW.phases.length ? Math.min(e.stopY0, g.ropeY - BW.standoff) : e.stopY0; // 마지막 페이즈 전까지는 입구에서 조금 떨어져 기술로 싸운다 (입구 앞에 오래 붙어 있지 않게)
  const n = e.phN | 0;
  if (n >= BW.phases.length || e.hp > e.maxHp * BW.phases[n]) return;
  e.phN = n + 1; e.guardT = BW.guard; e.phT0 = g.t;
  const types = g.waveFodder && g.waveFodder.length ? g.waveFodder : null;
  if (types) for (let i = 0; i < BW.adds + n; i++) { const t = types[i % types.length]; const o = spawnEnemy(g, t, clamp(e.x + (i - (BW.adds + n) / 2) * 34, 24, g.W - 24), Math.max(20, e.y - 40 - (i % 2) * 30)); if (o) o.phAdd = true; }
  ev(g, 'bossPhase', { x: e.x, y: e.y - e.def.size * 0.6, n: n + 2, enemy: e.type });
}
function ccResist(g, e, dt) {
  const T = TENSION.ccdr, big = e.elite || e.mid || e.boss;
  if (e.drT > 0) { e.drT -= dt; if (e.drT <= 0) e.drN = 0; }
  if (e.ccImmT > 0) e.ccImmT -= dt;
  let resisted = false;
  for (const k of ['stunT', 'frozenT']) {
    const lk = k === 'stunT' ? '_lStun' : '_lFrz', prev = Math.max(0, (e[lk] || 0) - dt), cur = e[k] || 0;
    if (cur > prev + 0.05 && !e.sleeping) {
      let f = e.ccImmT > 0 ? 0 : T.steps[Math.min(e.drN | 0, T.steps.length - 1)];
      if (big) f *= T.elite;
      e[k] = prev + (cur - prev) * f;
      if (f < 1) resisted = true;
      e.drN = (e.drN | 0) + 1; e.drT = T.window;
      if (e.drN >= T.steps.length && !(e.ccImmT > 0)) { e.ccImmT = T.immune; e.drN = 0; }
    }
    e[lk] = e[k];
  }
  const ly = e._lY;
  if (ly !== undefined && e.y < ly - 1 && !e.fleeing && !e.walkIn && !(e.jumpT > 0) && !e.env && e.y > 0) {
    const C = T.push;
    e.pushSum = Math.max(0, (e.pushSum || 0) - (C.cap / C.win) * dt);
    const up = ly - e.y, room = Math.max(0, C.cap - e.pushSum), eff = Math.min(up * (big ? T.pushElite : 1), room);
    if (eff < up - 0.5) { e.y = ly - eff; if ((e.kbv || 0) < 0) e.kbv = 0; resisted = true; }
    e.pushSum += eff;
  } else if (e.pushSum > 0) e.pushSum = Math.max(0, e.pushSum - (T.push.cap / T.push.win) * dt);
  e._lY = e.y;
  if (resisted && g.t - (e.resT || -9) > 1.2) { e.resT = g.t; ev(g, 'resist', { x: e.x, y: e.y - e.def.size * 0.7 }); }
}
function updateEnemies(g, dt) {
  const W = g.W;
  if (g.tZones && g.tZones.length) { for (const z of g.tZones) { z.t -= dt; if (z.t <= 0) continue; for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - z.x, e.y - z.y) <= z.r) { const m = e.boss ? z.bossSlow : z.slow; if (!(e.slowT > 0) || e.slowMul >= m) { e.slowMul = m; } e.slowT = Math.max(e.slowT, 0.25); } } g.tZones = g.tZones.filter((z) => z.t > 0); } // 오지은 시간 정지 구역
  if (g.tension) { let n = 0; for (const e of g.enemies) if (!e.dead && e.atRope) n++; const C = TENSION.crowd; g.ropeCrowd = n > C.k ? Math.min(C.cap || 99, C.k + (n - C.k) * C.over) / n : 1; } else g.ropeCrowd = 1; // 긴장감: 입구 앞 자리가 좁다
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (g.tension) ccResist(g, e, dt);
    if (g.tension && e.boss && !e.mid && !e.second) { if (e.phT0 === undefined && e.y > 0) e.phT0 = g.t; bossPhase(g, e, dt); }
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
    if (e.atRope && e.y < e.stopY - 2) e.atRope = false; // 스킬 · 버스에 밀려 자리보다 위로 올라가면 다시 걸어 내려온다 (멀리 서는 진상이 위에 붙어 안 내려오던 버그)
    if (e.dictT > 0) e.dictT -= dt;
    // (모든 진상) 보스 몰아치기 한도 회복 · 방깎 · 회복 막기 · 도발 · 특성 — 전엔 4~6장 진상 함수 안에만 있어서 대부분 보스의 한도가 안 돌아왔다
    if (e.burst > 0) e.burst = Math.max(0, e.burst - e.maxHp * BOSS_GUARD.perSec * dt);
    if (e.shredT > 0) { e.shredT -= dt; if (e.shredT <= 0) e.shredN = 0; }
    if (e.brkT > 0) e.brkT -= dt;
    if (e.healBlockT > 0) e.healBlockT -= dt;
    if (e.tauntT > 0) e.tauntT -= dt;
    if (e.orderT > 0) e.orderT -= dt; if (e.grooveT > 0) e.grooveT -= dt; // 방장 지목 · 김도훈 떼창
    if (e.tieT > 0) e.tieT -= dt; if (e.tieAgain > 0) e.tieAgain -= dt; if (e.tieAmpT > 0) e.tieAmpT -= dt; if (e.rushT > 0) e.rushT -= dt; // 8장: 부케 묶기 · 재촉
    if (def.traits) traitTick(g, e, dt, def.traits);
    if (e.bai && !g.pvp) bossBrain(g, e, dt);
    if (e.cast) castTick(g, e, dt); // (10/08) 진상 투척 예고 · 끊기
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
      if (e.y >= e.stopY) { e.y = e.stopY; e.atRope = true; e.jumpT = 0; bumpHero(g, e); } // 새치기 착지: 앞 멤버를 밀친다
      continue;
    }
    // 가입인사 사기꾼: 예쁜 프사 → 들켰다! → 실물(못생김/뚱뚱) → 들켰다! → 예쁜 프사 …
    if (def.scam) updateScammer(g, e, dt);
    if (def.fake || def.dash || def.insurance || def.sarcasm || def.figures || def.goods || def.sleep || def.homeward || def.golf || def.toss || def.enrage || def.disco || def.confetti || def.jusa || e.hasteT > 0 || e.lieWeakT > 0 || (g.hell && e.boss)) updateNewEnemy(g, e, dt);
    if (def.ch7) ch7Tick(g, e, dt); // 7장 스키장 진상 기술
    if (def.ch8) ch8Tick(g, e, dt); // 8장 결혼식 뒤풀이 진상 기술
    if (e.stunT > 0) { e.stunT -= dt; continue; }
    if (def.vault && !e.vaulted && !e.atRope && e.y > g.ropeY - def.vault.at && e.stunT <= 0) {
      e.vaulted = true; e.jumpT = def.vault.sec; e.kbv = 0;
      ev(g, 'vault', { x: e.x, y: e.y - def.size * 0.6 });
      continue;
    }
    // 토하는 인간: 멤버 발밑에 토
    if (def.puke && e.y > g.ropeY - def.puke.reach) {
      e.pukeT -= dt;
      const pw = ECAST.kind.puke;
      if (e.pukeT <= pw && !e.cast && !e.pukeAim && g.heroes.length && !g.pvp) { // (10/08) 꿀렁 = 예고 (멤버 발밑 표적) · 그 사이 기절시키면 끊긴다
        e.pukeAim = true;
        const h = victim(g, g.heroes.filter((o) => !o.def.summon && !o.gone));
        if (h) startCast(g, e, h, { kind: 'puke', fly: 0.42, wind: Math.max(0.2, e.pukeT), fx: def.puke.poison ? { st: 'poison', sec: def.puke.poison } : undefined });
      }
      if (e.pukeT <= 0) {
        e.pukeT = def.puke.every; e.pukeAim = false;
        if (g.pvp && g.heroes.length) { const h = g.heroes[(g.rng() * g.heroes.length) | 0]; g.puddles.push({ x: h.x, y: g.rowY + 18, r: def.puke.r, t: def.puke.sec, max: def.puke.sec, enemy: false }); ev(g, 'puke', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y, cry: !!def.cry }); }
      }
    }
    // 셀카 인플루언서: 0.6초 "찰칵" 준비 → 가장 가까운 멤버 1초 기절
    if (def.flash && (e.atRope || e.y > g.ropeY - 220)) {
      if (e.flashW > 0) {
        e.flashW -= dt;
        if (e.flashW <= 0 && g.heroes.length) {
          let h = e.flashH && !e.flashH.gone ? e.flashH : null;
          if (!h) { h = g.heroes[0]; for (const o of g.heroes) if (Math.abs(o.x - e.x) < Math.abs(h.x - e.x)) h = o; h = victim(g, g.heroes, h); }
          e.flashH = null; e.castW = 0;
          const sec = hitHero(g, h, { st: 'stun', sec: 1 }, e);
          ev(g, 'flash', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y, stun: sec > 0, sec });
        }
        if (e.flashW > 0 && (e.stunT > 0 || (e.kbv || 0) < -40)) { e.flashW = 0; e.flashH = null; e.castW = 0; e.weakT = Math.max(e.weakT || 0, ECAST.breakWeak); ev(g, 'castBreak', { x: e.x, y: e.y - def.size * 0.6, uid: e.uid }); } else if (e.flashW > 0) e.castW = e.flashW;
      } else {
        e.flashT -= dt;
        if (e.flashT <= 0 && g.heroes.length) {
          e.flashT = def.flash.every; e.flashW = 0.7; e.castW = 0.7;
          let h = g.heroes[0]; for (const o of g.heroes) if (Math.abs(o.x - e.x) < Math.abs(h.x - e.x)) h = o; h = victim(g, g.heroes, h); e.flashH = h;
          ev(g, 'flashWind', { x: e.x, y: e.y - def.size * 0.6 });
          ev(g, 'castWind', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y, hero: h.id, sec: 0.7, kind: 'flash', st: 'stun', uid: e.uid, big: !!(e.mid || e.elite) });
        }
      }
    }
    // (10/08) 진상 투척 (spit 데이터): 예고 → 멤버에게 던짐 (독재자 강퇴 통보 · 뷔페 상한 잡채 …)
    if (def.spit && !e.cast && !g.pvp && e.y > 60 && e.y > g.ropeY - def.spit.reach && g.heroes.length && (e.spitT -= dt) <= 0) {
      const sp = def.spit; e.spitT = sp.every[0] + g.rng() * (sp.every[1] - sp.every[0]);
      const pool = g.heroes.filter((o) => !o.def.summon && !o.gone);
      if (pool.length) startCast(g, e, victim(g, pool), { kind: sp.kind, fly: sp.fly || 0.6, wind: sp.wind || ECAST.wind, name: sp.name, fx: { st: sp.st, sec: sp.sec, cut: sp.cut, hit: sp.hit } });
    }
    // 술진상: 가운데에서 소주병 던지기 — 맞은 멤버 공격 속도 -25% (2초)
    if (def.bottle && e.y > 140 && !e.atRope && (g.mode !== 'stage' || (g.stage | 0) >= def.bottle.from)) {
      e.bottleT -= dt;
      if (e.bottleT <= 0 && g.heroes.length) {
        e.bottleT = def.bottle.every;
        const h = victim(g, g.heroes);
        if (g.pvp) { h.aspdDebT = Math.max(h.aspdDebT || 0, debuffSec(h, def.bottle.sec, 'slow')); h.aspdDebCut = def.bottle.cut; ev(g, 'bottleThrow', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y - 30 }); }
        else startCast(g, e, h, { kind: 'bottle', fly: 0.42, wind: ECAST.kind.bottle, fx: { st: 'slow', sec: def.bottle.sec, cut: def.bottle.cut, hit: 0 } }); // (10/08) 예고 → 던짐
      }
    }
    // 단톡방 빌런: 가끔 "카톡!" 알림 + 알림 폭탄 — 가까운 멤버 공격 속도 -30% (3초)
    if (def.spam && e.y > 30) {
      e.spamT -= dt;
      if (e.spamT <= 0) {
        e.spamT = def.spam.every; spamDots(g, e, 1);
        let n = 0; for (const h of g.heroes) if (Math.hypot(h.x - e.x, h.y - e.y) < 320) { const sc = debuffSec(h, 3, 'slow'); if (sc > 0) { h.aspdDebT = Math.max(h.aspdDebT || 0, sc); h.aspdDebCut = 0.3; n++; } }
        if (n) ev(g, 'spamBomb', { x: e.x, y: e.y - def.size * 0.6 });
      }
    }
    // 꼰대: 라떼 훈계 — 가장 가까운 멤버 스킬 3초 막힘
    if (def.latte && e.y > 60 && e.latteOffT <= 0 && (g.pvp || e.y > g.ropeY - ECAST.reach)) { // (10/08) 던지는 건 가까이 와서 (멀리서 계속 던지지 않게)
      e.latteT -= dt;
      if (e.latteT <= 0 && g.heroes.length) {
        e.latteT = 6;
        let h = g.heroes[0]; for (const o of g.heroes) if (Math.hypot(o.x - e.x, o.y - e.y) < Math.hypot(h.x - e.x, h.y - e.y)) h = o;
        h = victim(g, g.heroes, h);
        if (g.pvp) { const sc = debuffSec(h, 3, 'silence'); if (sc > 0) { h.silenceT = Math.max(h.silenceT || 0, sc); ev(g, 'latteSilence', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y - 40 }); } }
        else startCast(g, e, h, { kind: 'latte', fly: 0.6, wind: ECAST.kind.latte, fx: { st: 'silence', sec: 3, hit: 3 } }); // (10/08) "라떼는 말이야~" 예고 → 라떼 잔 → 침묵
      }
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
    //  (10/08 진상 감사) 예고 없이 바로 기절 → 0.8초 예고(노린 멤버 발밑 표적 · 몸 젖히기) 뒤 기절 · 예고 중 기절 · 밀치기로 끊긴다
    if (on(e, 'kneel') && e.y > 60) {
      if (e.kneelW > 0) {
        e.kneelW -= dt; e.castW = Math.max(0, e.kneelW);
        if (e.stunT > 0 || e.frozenT > 0 || (e.kbv || 0) < -40) { e.kneelW = 0; e.kneelH = null; e.castW = 0; e.weakT = Math.max(e.weakT || 0, ECAST.breakWeak); ev(g, 'castBreak', { x: e.x, y: e.y - def.size * 0.6, uid: e.uid, boss: true, name: '무릎 꿇어!' }); }
        else if (e.kneelW <= 0) {
          const h = e.kneelH && !e.kneelH.gone ? e.kneelH : null; e.kneelH = null; e.castW = 0;
          if (h) { h.stunT = Math.max(h.stunT, debuffSec(h, def.kneel.stun, 'stun')); ev(g, 'kneel', { hero: h.id, x: h.x, y: h.y, ex: e.x, ey: e.y }); bossWeak(g, e); }
        }
      } else {
        e.kneelT -= dt;
        if (e.kneelT <= 0) {
          e.kneelT = def.kneel.every;
          const hs = g.heroes.filter((h) => h.stunT <= 0 && !h.gone);
          if (hs.length) {
            const h = victim(g, hs); e.kneelH = h; e.kneelW = 0.8; e.castW = 0.8;
            ev(g, 'castWind', { x: e.x, y: e.y - def.size * 0.6, hx: h.x, hy: h.y, hero: h.id, sec: 0.8, kind: 'kneel', st: 'stun', uid: e.uid, big: true, name: '"무릎 꿇어!"' });
          }
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
          for (const h of g.heroes) h.stunT = Math.max(h.stunT, debuffSec(h, def.slam.stun, 'stun'));
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
    if (e.noShieldT > 0) e.noShieldT -= dt;
    if (e.auraOffT > 0) e.auraOffT -= dt;
    if (on(e, 'shieldAura') && e.y > 20 && !(e.auraOffT > 0)) {
      e.abT2 -= dt;
      if (e.abT2 <= 0) {
        e.abT2 = def.shieldAura.every;
        const sa = def.shieldAura;
        let n = 0;
        for (const o of g.enemies) {
          if (o.dead || o.boss || o === e) continue;
          const dx = o.x - e.x, dy = o.y - e.y;
          if (dx * dx + dy * dy < sa.r * sa.r && !(o.noShieldT > 0)) { o.shield = Math.max(o.shield, o.maxHp * sa.frac); n++; }
        }
        ev(g, 'shield', { x: e.x, y: e.y, r: sa.r, n, enemy: e.type });
      }
    }
    // 먹튀: 코인 들고 도망
    if (e.fleeing) {
      if (e.env) { if (!(e.tieT > 0)) e.y -= e.speed * def.envelope.run * (e.slowT > 0 ? e.slowMul : 1) * dt; } // 8장 축의금 도둑: 봉투 들고 위로 (묶이면 제자리 · 감속에 느려짐)
      else e.y -= e.speed * 1.4 * dt;
      if (e.y < -60) {
        e.dead = true;
        if (e.env) ch8Escape(g, e);
        else ev(g, 'escape', { x: e.x, y: 0, v: Math.round(e.stolen) });
      }
      continue;
    }
    if (e.form === 'reveal') { if (e.hitT > 0) e.hitT -= dt; continue; } // 들켰다! 제자리에서 허둥지둥
    if (e.lureT > 0) e.lureT -= dt;
    if (e.jyT > 0) { e.jyT -= dt; if (e.jyT <= 0) e.jyHeld = false; } // 성준영에게 붙잡힘: 제자리 (준영이 끌고 다닌다)
    else if (!e.atRope) {
      const sp = e.speed * (e.slowT > 0 ? e.slowMul : 1) * (e.dictT > 0 ? e.dictSpd : 1) * (g.megaT > 0 ? g.mapFx.speed : 1)
        * (e.flexT > 0 ? ENEMIES.gao.gao.flexSpd : 1) * (e.puddleT > 0 ? ENEMIES.vomit.deathPuddle.speed : 1)
        * e.spdMul * (e.hasteT > 0 ? 1.15 : 1) * (e.sleeping ? 0 : 1) * (e.lureT > 0 ? e.lureSpd : 1) // (삐끼왕 호객: 우르르)
        * (g.mapFx.belt && e.x > g.mapFx.belt[0] && e.x < g.mapFx.belt[1] ? g.mapFx.beltMul : 1)
        * (e.tieT > 0 || e.speechT > 0 || e.castW > 0 ? 0 : 1) * (e.rushT > 0 ? CH8.rushSpd : 1); // 8장: 묶이면 · 축사 중엔 제자리 · 실장님 재촉엔 빨리 · (10/08) 던지기 예고 중엔 멈춤
      e.y += sp * dt;
      if (def.zigzag) e.x = clamp(e.baseX + Math.sin(e.age * (def.erratic ? 3.1 + Math.sin(e.age * 0.7 + e.phase) * 1.5 : 2.3) + e.phase) * def.zigzag, g.mapFx.lane ? g.mapFx.lane[0] : 16, g.mapFx.lane ? g.mapFx.lane[1] : W - 16);
      if (e.y >= e.stopY) { e.y = e.stopY; e.atRope = true; e.atkCd = 0.25; bumpHero(g, e); } // (10/08) 돌진 진상: 처음 닿을 때 앞 멤버를 들이받는다
    }
    // 홀림: 꼬충이 가까이 오면 반대 성별 영웅을 홀린다
    if (def.charm && e.charmCd <= 0 && e.y > g.ropeY - RULES.charmRange) {
      e.charmCd = RULES.charmCooldown;
      tryCharm(g, e);
    }
    // 인피 뒷담러: 멀찍이 서서 뒷담화 말풍선을 던진다 (입구는 안 두드림)
    if (def.standoff && !e.walkIn) {
      // 버티기 방지: 진상이 다 나온 뒤 아무 멤버도 안 닿는 자리에 6초 넘게 서 있으면(영영 안 끝난다) 입구로 걸어 들어온다
      if (e.atRope && g.spawnI >= g.spawnQ.length && g.heroes.length && !g.heroes.some((h) => inRange(h, e, heroRange(g, h)))) { if ((e.standT += dt) > 6) { e.walkIn = true; e.atRope = false; e.stopY = g.ropeY - 4 - g.rng() * 16; } } else e.standT = 0;
      if (e.atRope && def.rumor) {
        e.rumorT -= dt;
        if (e.rumorT <= 0 && g.heroes.length) {
          e.rumorT = def.rumor.every * (0.85 + g.rng() * 0.3);
          const fresh = g.heroes.filter((h) => h.rumorT <= 0);
          const list = fresh.length ? fresh : g.heroes;
          throwOrGate(g, 'rumor', e, victim(g, list), def.rumor.fly);
          ev(g, 'rumor', { x: e.x, y: e.y - def.size * 0.6 });
        }
      }
      if (e.hitT > 0) e.hitT -= dt;
      continue;
    }
    if (g.tension && (e.elite || e.mid || e.boss) && !def.kick && !e.cast && !e.fleeing && e.stunT <= 0 && e.y > g.ropeY - TENSION.slam.reach) { const SL = TENSION.slam; if (e.slamT === undefined) e.slamT = SL.first; if ((e.slamT -= dt) <= 0) { e.slamT = (e.boss ? SL.bossEvery : SL.every) * (0.85 + g.rng() * 0.3); startCast(g, e, null, { door: true, wind: SL.wind, frac: (e.boss ? SL.boss : e.mid ? SL.mid : SL.elite) * (g.hell ? SL.hell : 1), name: e.atRope ? '입구 강타' : '입구로 던지기' }); } } // 긴장감: 입구 가까이 온 정예 · 중간 보스 · 보스의 '입구 강타' 예고 → 스킬(기절 · 넉백 · 빙결)로 끊으면 안 맞는다
    if (e.atRope) {
      // 찌질남: 멤버에게 착 달라붙는다 (잡을 때까지 그 멤버 공격력 ↓)
      if (def.cling && !e.clingTo) {
        const free = g.heroes.filter((h) => !h.clingBy);
        if (free.length) {
          let h = free[0];
          for (const o of free) if (Math.abs(o.x - e.x) < Math.abs(h.x - e.x)) h = o;
          h = victim(g, free, h);
          h.clingBy = e.uid; e.clingTo = h;
          ev(g, 'cling', { x: e.x, y: e.y, hx: h.x, hy: h.y, hero: h.id });
        }
      }
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
      if (def.envelope && !e.env) { // 8장 축의금 도둑: 입구 대신 접수대 봉투를 집어 위로 달아난다
        e.env = true; e.fleeing = true; e.atRope = false; e.kbv = 0;
        if (!g.envTip && g.mode === 'stage') { g.envTip = true; ev(g, 'tip', { text: '축의금 도둑이 봉투를 들고 도망가요! 화면 위로 빠지면 코인 −8% — 묶고(임수빈) · 기절 · 감속으로 잡아요' }); }
        ev(g, 'c8grab', { x: e.x, y: e.y - def.size * 0.6 });
        continue;
      }
      if (def.steal && !e.fast) {
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
      if (e.speechT > 0) { if (e.hitT > 0) e.hitT -= dt; continue; } // 축사 중엔 입구를 안 친다
      if (e.castW > 0) { if (e.hitT > 0) e.hitT -= dt; continue; } // (10/08) 큰 한 방 예고 중
      if (def.kick && !g.pvp && (g.mode !== 'stage' || (g.stage | 0) >= def.kick.from) && (e.kickT -= dt) <= 0) { // 폭력배: 문짝 걷어차기 (예고 → 쾅)
        e.kickT = def.kick.every * (0.9 + g.rng() * 0.2);
        startCast(g, e, null, { door: true, wind: def.kick.wind, mul: def.kick.mul, hit: def.kick.hit, name: def.kick.name });
        continue;
      }
      if (g.tension && e.boss && !e.mid && !e.second && (e.phN | 0) < TENSION.bossWave.phases.length) { if (e.hitT > 0) e.hitT -= dt; continue; } // 보스 페이즈 중엔 떨어져서 기술로만 (마지막 페이즈에 입구로)
      e.atkCd -= dt * (e.rushT > 0 ? CH8.rushAtk : 1); // (8장 실장님 재촉: 입구를 더 빨리)
      if (e.atkCd <= 0) {
        e.atkCd = e.fast ? BAL.fast.atkInt : def.atkInterval; // 빠른 진상: 입구에 붙으면 빠르게 세게
        e.hitT = 0.25;
        damageBase(g, e.atk * (e.fast ? BAL.fast.atkMul : 1) * (e.def.traits && e.def.traits.stealth ? 2 : e.cloak ? TOWER_SIM.dark.door : 1) * (g.ropeCrowd || 1), e);
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
// 멀리서 던지는 진상: 노린 멤버가 이미 상태이상이거나(30%면 언제나) 가끔은 입구로 던진다 → 입구 피해
export const RANGED_GATE = { chance: 0.3, mul: 2 };
const afflicted = (h) => h.stunT > 0 || h.rumorT > 0 || h.paperT > 0 || h.sarcT > 0 || h.charmT > 0;
function throwOrGate(g, kind, e, h, dur, stun) { if (!h || afflicted(h) || g.rng() < RANGED_GATE.chance) throwAt(g, kind, e, null, dur, stun); else throwAt(g, kind, e, h, dur, stun); }
function throwAt(g, kind, e, h, dur, stun, fx, wind) {
  const top = e.y - e.def.size * 0.5;
  if (!h) { g.eprojs.push({ kind, sx: e.x, sy: top, tx: g.W / 2 + (g.rng() - 0.5) * 120, ty: g.ropeY + 8, x: e.x, y: top, t: 0, dur, hero: null, gate: true, src: e, srcUid: e.uid, stun: 0 }); return; }
  // (10/08) 멤버를 노리면 바로 안 던진다: 예고 (멈춤 · 멤버 발밑 표적) → 그 사이 끊을 수 있다 — 1:1 대전은 그대로
  const w = wind !== undefined ? wind : e.boss ? ECAST.windBoss : ECAST.kind[kind] !== undefined ? ECAST.kind[kind] : ECAST.wind;
  if (w > 0 && !g.pvp && !e.dead) { if (!e.cast) startCast(g, e, h, { kind, fly: dur, stun, fx, wind: w }); return; }
  g.eprojs.push({ kind, sx: e.x, sy: top, tx: h.x, ty: h.y - 30, x: e.x, y: top, t: 0, dur, hero: h, src: e, srcUid: e.uid, stun: stun || 0, fx });
}
// ─── 진상 투척 예고 (10/08 진상 리메이크) ───
//  startCast: 진상이 멈춰 팔을 젖히고(castW) 노린 멤버 발밑에 표적 (castWind) → wind 초 뒤 던짐 · door: 입구를 노리는 큰 한 방 (doorWind → doorKick)
//  castTick: 예고 중 기절 · 빙결 · 묶기 · 밀치기 · 시간 정지 · 도망이면 끊김 (castBreak · 잠깐 빈틈)
function startCast(g, e, h, spec) {
  if (e.cast || e.dead) return false;
  if (g.windMul && spec.wind) spec = Object.assign({}, spec, { wind: spec.wind * g.windMul }); // 할로윈 저주: 예고 짧게
  e.cast = { h, spec, t: spec.wind, max: spec.wind };
  e.castW = spec.wind;
  if (spec.door) ev(g, 'doorWind', { x: e.x, y: g.ropeY, ex: e.x, ey: e.y - e.def.size * 0.6, sec: spec.wind, uid: e.uid, name: spec.name || '' });
  else ev(g, 'castWind', { x: e.x, y: e.y - e.def.size * 0.6, hx: h.x, hy: h.y, hero: h.id, sec: spec.wind, kind: spec.kind, st: (spec.fx && spec.fx.st) || STK[spec.kind] || '', uid: e.uid, big: !!(e.boss || e.mid || e.elite), name: spec.name || '' });
  return true;
}
const STK = { rumor: 'slow', paper: 'slow', sarcasm: 'slow', golf: 'stun', duck: 'stun', bag: 'stun', stamp: 'stun', glow: 'slow', snowball: 'freeze', bottle: 'slow', latte: 'silence', puke: 'poison' }; // 던지는 물건 → 표적 색 (상태이상)
function castTick(g, e, dt) {
  const c = e.cast;
  if (e.dead || !c) { if (e.dead) { e.cast = null; e.castW = 0; } return; }
  if (e.stunT > 0 || e.frozenT > 0 || e.tieT > 0 || e.jyT > 0 || (e.kbv || 0) < -40 || g.timeStopT > 0 || e.fleeing || e.sleeping) { // 끊김!
    e.cast = null; e.castW = 0; e.weakT = Math.max(e.weakT || 0, ECAST.breakWeak);
    g.stats.castBreak = (g.stats.castBreak | 0) + 1;
    ev(g, 'castBreak', { x: e.x, y: e.y - e.def.size * 0.6, uid: e.uid, door: !!c.spec.door });
    return;
  }
  c.t -= dt; e.castW = Math.max(0.001, c.t);
  if (c.t > 0) return;
  e.cast = null; e.castW = 0;
  const sp = c.spec;
  if (sp.door) { // 입구 큰 한 방 + 곁 멤버 게이지
    damageBase(g, sp.frac ? g.base.max * sp.frac : e.atk * (sp.mul || 3), e);
    if (g.kdOn) { const h = nearHero(g, e.x); if (h) kdAdd(g, h, hitKd(sp, e), { src: 'hit' }); }
    ev(g, 'doorKick', { x: e.x, y: g.ropeY, ex: e.x, ey: e.y - e.def.size * 0.5, name: sp.name || '' });
    if (e.def.selfBoom && !e.dead) { e.hp = 0; killEnemy(g, e, null); } // 할로윈 호박 폭탄: 터지면 자기도 (→ 호박씨)
    return;
  }
  const h = c.h;
  if (!h || h.gone) return;
  const top = e.y - e.def.size * 0.5;
  g.eprojs.push({ kind: sp.kind, sx: e.x, sy: top, tx: h.x, ty: h.y - 30, x: e.x, y: top, t: 0, dur: sp.fly || 0.6, hero: h, src: e, srcUid: e.uid, stun: sp.stun || 0, fx: sp.fx });
  if (sp.kind === 'bottle' && !sp.fx) ev(g, 'bottleThrow', { x: e.x, y: e.y - e.def.size * 0.6, hx: h.x, hy: h.y - 30 });
  if (sp.kind === 'puke') ev(g, 'puke', { x: e.x, y: e.y - e.def.size * 0.6, hx: h.x, hy: h.y, cry: !!e.def.cry });
}
// (10/08) 돌진 · 새치기 진상이 입구에 처음 닿으면 가장 가까운 멤버를 들이받는다 (쓰러짐 게이지) — 감속 · 기절로 늦추거나 탱커가 대신 맞으면 된다
function bumpHero(g, e) {
  if (e.bumped || !g.kdOn) return;
  e.bumped = true;
  const v = ECAST.bump[e.type] || (e.cRush ? ECAST.bump.rush : 0);
  if (!v || e.stunT > 0 || (e.slowT > 0 && e.slowMul < 0.7)) return; // 느려진 채로 닿으면 그냥 멈춘다
  const h = nearHero(g, e.x);
  if (!h) return;
  kdAdd(g, h, v, { src: 'bump', by: e.type });
  ev(g, 'bump', { x: h.x, y: h.y, ex: e.x, ey: e.y, hero: h.id });
}
const nearHero = (g, x) => { let best = null, bd = 1e9; for (const h of g.heroes) { if (h.def.summon || h.gone || h.out) continue; const d = Math.abs(h.x - x); if (d < bd) { bd = d; best = h; } } return best; };
const hitKd = (o, e) => (o && o.hit !== undefined ? o.hit : ECAST.hit) * (e ? (e.boss ? ECAST.boss : e.mid ? ECAST.mid : e.elite || (e.def && e.def.hp >= ELITE_HP) ? ECAST.elite : 1) : 1);
// 진상 기술이 멤버에게 닿았을 때 (투척 · 중간 보스 · 보스 공용): 상태이상 + 쓰러짐 게이지 한 방 (면역 · 저항이면 그만큼)
export function hitHero(g, h, fx, src) {
  if (!h || h.gone || (h.def && h.def.summon)) return 0;
  const st = fx.st;
  let sec = 0;
  if (st === 'stun') { sec = debuffSec(h, fx.sec, 'stun'); if (sec > 0) { h.stunT = Math.max(h.stunT, sec); firstStunTip(g); } }
  else if (st === 'charm') {
    if (g.heroes.some((o) => o.id === 'gunnyeo' && o.lv >= 5 && !o.gone)) ev(g, 'charmBlock', { x: h.x, y: h.y });
    else { sec = debuffSec(h, fx.sec, 'charm'); if (sec > 0) h.charmT = Math.max(h.charmT, sec); }
  } else if (st === 'poison') {
    if (g.kdOn) sec = poisonHero(g, h, fx.sec);
    else { sec = debuffSec(h, fx.sec, 'slow'); if (sec > 0) { h.aspdDebT = Math.max(h.aspdDebT || 0, sec); h.aspdDebCut = 0.2; } } // (게이지가 없는 모드: 독 = 공속↓)
  } else if (st === 'freeze') sec = ch7Freeze(g, h, fx.sec, 'volley');
  else if (st === 'silence') { sec = debuffSec(h, fx.sec, 'silence'); if (sec > 0) { h.silenceT = Math.max(h.silenceT || 0, sec); h.muteT = Math.max(h.muteT || 0, sec); } }
  else if (st === 'blind') { sec = debuffSec(h, fx.sec); if (sec > 0) h.blindT = Math.max(h.blindT, sec); }
  else if (st === 'slow') { sec = debuffSec(h, fx.sec, 'slow'); if (sec > 0) { h.aspdDebCut = h.aspdDebT > 0 ? Math.max(h.aspdDebCut || 0, fx.cut || 0.3) : fx.cut || 0.3; h.aspdDebT = Math.max(h.aspdDebT || 0, sec); } }
  else sec = 1; // (상태이상 없이 맞기만)
  if (sec > 0 && g.kdOn) kdAdd(g, h, hitKd(fx, src), { src: 'hit', by: src && src.type });
  if (st !== 'freeze') ev(g, 'heroHit', { hero: h.id, x: h.x, y: h.y, st: st || '', sec, block: sec <= 0 });
  return sec;
}
// ─── 4~6장 진상 기술 ───────────────────────────────────
function updateNewEnemy(g, e, dt) {
  const d = e.def;
  const prog = e.y / g.ropeY;
  if (e.hasteT > 0) e.hasteT -= dt;
  if (e.lieWeakT > 0) e.lieWeakT -= dt;
  // 미혼인 척 돌싱남: 중간쯤 "사실 돌싱!" → 막 뛴다
  if (d.fake && !e.revealed && prog > d.fake.at) { e.revealed = true; e.spdMul *= d.fake.speed; ev(g, 'reveal', { x: e.x, y: e.y - d.size * 0.6, text: '사실 돌싱!' }); }
  // 카푸어: 부아앙 → 퍼졌다! → 터덜터덜
  if (d.dash) {
    if (!e.dashDone) {
      if (prog < d.dash.until) e.spdMul = d.dash.mul;
      else { e.dashDone = true; e.spdMul = d.dash.after; e.stunT = Math.max(e.stunT, d.dash.stall); e.stallT = d.dash.stall; ev(g, 'stall', { x: e.x, y: e.y - d.size * 0.6 }); }
    }
    if (e.stallT > 0) e.stallT -= dt;
  }
  if (e.stunT > 0 && !d.jusa) return;
  // 영업쟁이: "보험 드세요!" 주변 보호막 + 다단계 가속
  if (d.insurance && e.y > 20) {
    e.insT -= dt;
    if (e.insT <= 0) {
      const ins = d.insurance;
      e.insT = ins.every;
      const near = [];
      for (const o of g.enemies) { if (o.dead || o === e || o.boss) continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy < ins.r * ins.r) near.push([dx * dx + dy * dy, o]); }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, o] of near.slice(0, ins.n)) { o.shield = Math.max(o.shield, o.maxHp * ins.frac); o.hasteT = ins.haste; }
      ev(g, 'insurance', { x: e.x, y: e.y - d.size * 0.6, n: Math.min(ins.n, near.length), r: ins.r, boss: e.boss });
      if (e.boss) bossWeak(g, e);
    }
  }
  // 돌려까기 장인: 부메랑 비꼬기
  if (d.sarcasm && e.atRope && g.heroes.length) {
    e.sarcT -= dt;
    if (e.sarcT <= 0) {
      e.sarcT = d.sarcasm.every * (0.85 + g.rng() * 0.3);
      const fresh = g.heroes.filter((h) => h.sarcT <= 0);
      throwOrGate(g, 'sarcasm', e, victim(g, fresh.length ? fresh : g.heroes), d.sarcasm.fly);
      ev(g, 'sarcasm', { x: e.x, y: e.y - d.size * 0.6 });
    }
  }
  // 오타쿠: 피규어 소환 · 피규어가 있으면 굿즈 보호막
  if (d.figures && e.y > 20) {
    e.figT -= dt;
    if (e.figT <= 0) {
      const f = d.figures;
      e.figT = f.every;
      for (let i = 0; i < f.n; i++) { const o = spawnEnemy(g, f.type, clamp(e.x + (i - (f.n - 1) / 2) * 28, 16, g.W - 16), e.y + 18, { hpMul: hpMul(g.diff, g.mode === 'stage') * (g.hpScale || 1) * 0.7 }); o.owner = e.uid; }
      ev(g, 'figures', { x: e.x, y: e.y - d.size * 0.6 });
      if (e.boss) bossWeak(g, e);
    }
  }
  if (d.goods) {
    e.goodsT -= dt;
    if (e.goodsT <= 0) { e.goodsT = 0.3; e.goodsOn = g.enemies.some((o) => !o.dead && o.owner === e.uid); }
  }
  // 드러눕는 진상: 길 한가운데 드러눕는다 (투사체를 막는다)
  if (d.sleep && !e.slept && prog > d.sleep.at) { e.slept = true; e.sleeping = true; e.sleepHits = 0; ev(g, 'zzz', { x: e.x, y: e.y - d.size * 0.5 }); }
  // 집 가는 진상: 경험치를 들고 뒤돌아 도망
  if (d.homeward && !e.homed && !e.fleeing && prog > d.homeward.at) {
    e.homed = true;
    const v = Math.max(0, Math.min(Math.floor(g.exp), Math.round(d.homeward.base + d.homeward.perLevel * g.diff)));
    g.exp -= v; g.stats.stolen += v; e.stolen = v; e.fleeing = true;
    ev(g, 'goHome', { x: e.x, y: e.y - d.size * 0.6, v });
  }
  // 골프채 꼰대: "나이스 샷!"
  if (d.golf && e.y > 60 && g.heroes.length && (g.pvp || e.boss || e.y > g.ropeY - ECAST.reach)) {
    e.golfT -= dt;
    if (e.golfT <= 0) {
      e.golfT = d.golf.every;
      const fresh = g.heroes.filter((h) => h.stunT <= 0);
      throwAt(g, 'golf', e, victim(g, fresh.length ? fresh : g.heroes), d.golf.fly, d.golf.stun);
      ev(g, 'golf', { x: e.x, y: e.y - d.size * 0.6 });
    }
  }
  // 보스 던지기: 명품 가방 · 계약 도장 · 응원봉 빔
  if (d.toss && e.y > 40 && g.heroes.length) {
    e.tossT -= dt;
    if (e.tossT <= 0) {
      const ts = d.toss;
      e.tossT = ts.every;
      const pool = g.heroes.filter((h) => h.stunT <= 0);
      for (let i = 0; i < (ts.n || 1); i++) { const list = pool.length ? pool : g.heroes; const h = victim(g, list); pool.splice(pool.indexOf(h), 1); throwAt(g, ts.kind, e, h, ts.fly, ts.stun || ts.slow); }
      ev(g, 'toss', { x: e.x, y: e.y - d.size * 0.7, text: ts.text });
      bossWeak(g, e);
    }
  }
  // 분노 (체력이 줄면) — 헬 모드 보스는 분노가 없어도 한 번 분노
  const en = d.enrage || (g.hell && e.boss ? HELL.bossEnrage : null);
  if (en && !e.enraged && e.hp < e.maxHp * en.at) {
    e.enraged = true; e.spdMul *= en.speed; e.atk *= en.atk;
    ev(g, 'enrage', { x: e.x, y: e.y - d.size * 0.7, text: en.text });
  }
  // 솔로파티: 디스코볼(모두 홀림) · 꽃가루(눈부심)
  if (d.disco && e.y > 40) {
    e.discoT -= dt;
    if (e.discoT <= 1 && !e.discoWarn && e.discoT > 0) { e.discoWarn = true; ev(g, 'discoWind', { x: e.x, y: e.y - d.size * 0.7, sec: e.discoT }); } // (10/08 진상 감사) 예고 없이 전원 홀림 → 1초 전 미러볼 예고
    if (e.discoT <= 0) {
      e.discoWarn = false;
      e.discoT = d.disco.every * (e.enraged ? 0.75 : 1);
      const g5 = g.heroes.find((x) => x.id === 'gunnyeo' && x.lv >= 5);
      if (!g5) for (const h of g.heroes) { const sc = debuffSec(h, d.disco.charm * g.mods.charmMul, 'charm'); if (sc > 0) h.charmT = Math.max(h.charmT, sc); }
      ev(g, 'disco', { x: e.x, y: e.y, block: !!g5 });
      bossWeak(g, e);
    }
  }
  if (d.confetti && e.y > 40 && g.heroes.length) {
    e.confT -= dt;
    if (e.confT <= 0) {
      e.confT = d.confetti.every;
      for (let i = 0; i < d.confetti.n; i++) { const h = victim(g, g.heroes); h.blindT = Math.max(h.blindT, debuffSec(h, d.confetti.sec)); }
      ev(g, 'confetti', { x: e.x, y: e.y });
    }
  }
  // 주사왕: 울고 → 뛰고 → 자고 → 집에 간다
  if (d.jusa && e.y > 40) {
    const j = d.jusa;
    e.jT -= dt;
    if (e.jT <= 0) { e.jI = (e.jI + 1) % 4; e.jT = j.sec; e.sleeping = e.jI === 2; e.spdMul = e.jI === 1 ? j.run : e.jI === 2 || e.jI === 3 ? 0 : 1; ev(g, 'jusaPhase', { x: e.x, y: e.y - d.size * 0.7, phase: e.jI }); if (e.jI !== 1) bossWeak(g, e); }
    if (e.jI === 0) {
      e.cryT -= dt;
      if (e.cryT <= 0 && g.heroes.length) { e.cryT = j.cry.every; const h = g.heroes[(g.rng() * g.heroes.length) | 0]; g.puddles.push({ x: h.x, y: g.rowY + 18, r: j.cry.r, t: j.cry.sec, max: j.cry.sec, enemy: false }); ev(g, 'puke', { x: e.x, y: e.y - d.size * 0.6, hx: h.x, hy: h.y, cry: true }); }
    } else if (e.jI === 2) { if (e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * j.regen * dt); }
    else if (e.jI === 3) {
      e.y = Math.max(60, e.y - e.speed * 0.8 * dt); e.atRope = false;
      const v = Math.min(g.exp, j.steal * dt); g.exp -= v; g.stats.stolen += v; e.stolen = (e.stolen || 0) + v;
    }
  }
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
    if (p.gate) { const src = p.src && !p.src.dead && p.src.uid === p.srcUid ? p.src : null; damageBase(g, ((src && src.atk) || 3) * RANGED_GATE.mul * (g.tension && src && src.boss && !src.mid ? TENSION.bossWave.kitDoor : 1), src); ev(g, 'gateThrow', { x: p.tx, y: p.ty, kind: p.kind }); continue; } // 입구로 던진 것: 쾅
    const h = p.hero;
    if (!h || h.gone) continue;
    if (p.kind === 'puke') { const pk = (p.src && p.src.def.puke) || ENEMIES.vomit.puke; g.puddles.push({ x: h.x, y: g.rowY + 18, r: pk.r, t: pk.sec, max: pk.sec, enemy: false }); } // 토 · 눈물 웅덩이 (그 위 멤버 공속↓)
    if (p.fx) { hitHero(g, h, p.fx, p.src); continue; } // (10/08) 진상 기술 공용: 상태이상 + 쓰러짐 게이지
    if (g.kdOn && !(h.ccImmT > 0) && !(p.kind === 'sarcasm' && h.def.attr === 'talk')) kdAdd(g, h, ECAST.throwHit * (p.src && (p.src.boss || p.src.mid || p.src.elite || p.src.def.hp >= ELITE_HP) ? ECAST.elite : 1), { src: 'hit', by: p.src && p.src.type }); // 맞으면 게이지 한 방 (자주 던지는 보스 투척은 정예만큼) (말빨 멤버는 돌려까기를 되받아쳐서 안 맞음)
    if (p.kind === 'paper') {
      h.paperT = Math.max(h.paperT, debuffSec(h, ENEMIES.boss_loan.paper.sec));
      ev(g, 'paperHit', { hero: h.id, x: h.x, y: h.y });
    } else if (p.kind === 'rumor') {
      const r = ENEMIES.inpi_gossip.rumor;
      h.rumorT = Math.max(h.rumorT, debuffSec(h, r.sec));
      ev(g, 'rumorHit', { hero: h.id, x: h.x, y: h.y });
    } else if (p.kind === 'duck') {
      h.stunT = Math.max(h.stunT, debuffSec(h, ENEMIES.boss_inpi.duck.stun, 'stun'));
      if (g.kdOn) poisonHero(g, h, KD.poison.duck); // 식중독
      ev(g, 'duckHit', { hero: h.id, x: h.x, y: h.y });
    } else if (p.kind === 'sarcasm') {
      const sc = ENEMIES.sarcasm.sarcasm;
      const src = p.src;
      if (h.def.attr === 'talk' && src && !src.dead && src.uid === p.srcUid) {
        // 말빨 멤버는 돌려까기를 되받아친다
        damageEnemy(g, src, src.maxHp * sc.reflect, true, h);
        ev(g, 'reflect', { x: h.x, y: h.y, ex: src.x, ey: src.y });
      } else { h.sarcT = Math.max(h.sarcT, debuffSec(h, sc.sec)); ev(g, 'sarcHit', { hero: h.id, x: h.x, y: h.y }); }
    } else if (p.kind === 'glow') {
      h.paperT = Math.max(h.paperT, debuffSec(h, p.stun || 3));
      ev(g, 'tossHit', { hero: h.id, x: h.x, y: h.y, kind: p.kind });
    } else if (p.kind === 'snowball') { // 7장 눈싸움 대학생: 꽁꽁 (빙결 = 기절 계열)
      ch7Freeze(g, h, p.stun || 1.5, 'snowHit');
    } else if (p.kind === 'golf' || p.kind === 'bag' || p.kind === 'stamp') {
      h.stunT = Math.max(h.stunT, debuffSec(h, p.stun || 1, 'stun'));
      ev(g, 'tossHit', { hero: h.id, x: h.x, y: h.y, kind: p.kind });
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
      else for (const h of g.heroes) if (Math.abs(h.x - q.x) < q.r) { h.vomitT = Math.max(h.vomitT, 0.2); if (g.kdOn && !(h.poisonT > 0.3)) poisonHero(g, h, KD.poison.puddle); } // 토 웅덩이: 독
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
      for (const h of g.heroes) { const dx = h.x - e.x, dy = h.y - e.y; if (dx * dx + dy * dy < r2 && !h.def.taunt && !h.def.noDrowsy) h.drowsyT = 0.2; } // 백인규는 "운동 루틴"으로 안 졸림
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

// ─── 7장 스키장 MT 진상 기술 (줄 바꾸기 · 떼 · 보호막 · 썰매 돌진 · 온기 도둑 · 눈덩이 빙결 · 소음 금지 침묵 · 눈사태) ───
function ch7Init(g, e) {
  const d = e.def;
  e.ch7On = !!d.ch7;
  e.boardT = 0; e.boardCd = d.board ? d.board.every[0] + g.rng() * (d.board.every[1] - d.board.every[0]) : 0; e.boardFrom = e.x; e.boardTo = e.x;
  e.coachT = 0; e.coachCd = d.coach ? d.coach.first : 0;
  e.sledOff = false; e.crashed = false;
  e.coldCd = 0; e.snowT = d.snowball ? 1 + g.rng() * 1.5 : 0;
  e.quietCd = d.quiet ? d.quiet.first : 0; e.quietW = 0;
  e.avaT = d.avalanche ? d.avalanche.first : 0; e.avaW = 0;
}
// 빙결: 기절과 같은 계열 (응급 방패 면역 · 강성구 곁 면역 · 강병화 곁 절반 · 강화/장비 저항으로 짧게)
const coldMul = (h) => CH7.coldTier[HERO_TIER[h.id] || 1] || 1; // 겨울 산 적응 (등급이 높을수록 덜 언다)
function ch7Freeze(g, h, sec, kind) {
  if (!h || h.gone) return 0;
  if (kind === 'snowHit' && h.thawT > 0) { ev(g, 'c7freeze', { hero: h.id, x: h.x, y: h.y, sec: 0, kind, block: true }); return 0; } // 막 녹은 멤버는 잠깐 눈덩이에 안 언다 (계속 얼리기 방지)
  const sc = debuffSec(h, sec * coldMul(h), 'freeze');
  if (sc > 0) { h.stunT = Math.max(h.stunT, sc); h.freezeT = Math.max(h.freezeT || 0, sc); h.thawT = Math.max(h.thawT || 0, sc + CH7.thaw); firstStunTip(g); }
  ev(g, 'c7freeze', { hero: h.id, x: h.x, y: h.y, sec: sc, kind, block: sc <= 0 });
  return sc;
}
// 보드남: 줄 바꾸는 0.4초 동안 회피 (감속 · 기절 중이거나 시간 정지 · 따라가는 공격은 못 피함)
function ch7Dodge(g, e, src) {
  if (!src || !src.def || e.slowT > 0 || e.stunT > 0 || g.timeStopT > 0 || BAL.noMiss.includes(src.def.proj)) return false;
  if (g.rng() >= e.def.board.evade) return false;
  if (g.t - (e.missT || -9) > 0.35) { e.missT = g.t; ev(g, 'dodge', { x: e.x, y: e.y - e.def.size * 0.6 }); }
  return true;
}
// 눈사태 끊기: 예고 중에 스킬 · 총공지 · 알디콤 → 회장이 비틀 (기절 + 빈틈)
function ch7Interrupt(g, by) {
  const e = g.avalanche;
  g.avalanche = null;
  if (!e || e.dead || !(e.avaW > 0)) return false;
  const a = e.def.avalanche;
  e.avaW = 0; e.windup = 0; e.avaT = a.every * (g.hell ? 0.9 : 1);
  e.stunT = Math.max(e.stunT, a.stun); e.weakT = Math.max(e.weakT, a.weak);
  g.stats.avaStop = (g.stats.avaStop || 0) + 1;
  ev(g, 'c7avaStop', { x: e.x, y: e.y, by });
  return true;
}
function ch7Tick(g, e, dt) {
  const d = e.def;
  const stunned = e.stunT > 0;
  const prog = e.y / g.ropeY;
  // 스노보드 과시남: 뒤로 타다가 갑자기 줄 바꾸기
  if (d.board) {
    if (e.boardT > 0) {
      e.boardT -= dt;
      const k = 1 - Math.max(0, e.boardT) / d.board.sec;
      e.x = e.boardFrom + (e.boardTo - e.boardFrom) * k;
      e.baseX = e.x;
    } else if (!stunned && !(e.slowT > 0) && !e.atRope && e.y > 40 && prog < 0.9 && (e.boardCd -= dt) <= 0) {
      const b = d.board;
      e.boardCd = b.every[0] + g.rng() * (b.every[1] - b.every[0]);
      const lo = g.mapFx.lane ? g.mapFx.lane[0] : 20, hi = g.mapFx.lane ? g.mapFx.lane[1] : g.W - 20;
      const dist = b.dist[0] + g.rng() * (b.dist[1] - b.dist[0]);
      let to = e.x + (g.rng() < 0.5 ? -dist : dist);
      if (to < lo || to > hi) to = 2 * e.x - to; // 벽 쪽이면 반대로
      e.boardFrom = e.x; e.boardTo = clamp(to, lo, hi); e.boardT = b.sec;
      if (g.rng() < 0.35) ev(g, 'c7board', { x: e.x, y: e.y - d.size * 0.6, to: e.boardTo });
    }
  }
  // 눈썰매 폭주녀: 감속 · 기절에 걸리면 썰매에서 굴러떨어진다 · 입구에 처음 부딪히면 크게
  if (d.sled) {
    if (!e.sledOff && (e.slowT > 0 || stunned)) { e.sledOff = true; e.spdMul *= d.sled.off; ev(g, 'c7sledOff', { x: e.x, y: e.y - d.size * 0.5 }); }
    if (e.atRope && !e.crashed && !stunned) {
      e.crashed = true;
      if (!e.sledOff) { damageBase(g, e.atk * d.sled.crash, e); e.atkCd = d.atkInterval; e.stunT = Math.max(e.stunT, d.sled.daze); ev(g, 'c7crash', { x: e.x, y: g.ropeY }); } // 꽈당! 부딪힌 뒤 잠깐 어질어질
    }
  }
  if (stunned) {
    if (e.quietW > 0) { e.quietW = 0; e.windup = 0; e.quietCd = d.quiet.every; ev(g, 'c7quietStop', { x: e.x, y: e.y - d.size * 0.6 }); } // 펜션 사장님: 기절시키면 조용
    if (!d.avalanche) return;
  }
  // 강습 사칭남: "제가 알려 드릴게요~" 곁의 진상 보호막 + 안 밀림
  if (d.coach && e.y > 20 && !(e.auraOffT > 0)) {
    if ((e.coachCd -= dt) <= 0) {
      const c = d.coach;
      e.coachCd = c.every;
      const near = [];
      for (const o of g.enemies) { if (o.dead || o === e || o.boss || o.noShieldT > 0) continue; const dx = o.x - e.x, dy = o.y - e.y; if (dx * dx + dy * dy < c.r * c.r) near.push([dx * dx + dy * dy, o]); }
      near.sort((a, b) => a[0] - b[0]);
      for (const [, o] of near.slice(0, c.n)) { o.shield = Math.max(o.shield, o.maxHp * c.frac); o.coachT = c.every; o.ch7On = true; }
      ev(g, 'c7coach', { x: e.x, y: e.y - d.size * 0.6, r: c.r, n: Math.min(c.n, near.length) });
    }
  }
  if (e.coachT > 0) e.coachT -= dt;
  // 핫팩 도둑: 길 절반부터 옆을 지나간 멤버의 온기를 훔친다 → 공격 속도 ↓
  if (d.hotpack && prog > d.hotpack.from && (e.coldCd -= dt) <= 0) {
    const hp = d.hotpack;
    e.coldCd = hp.tick;
    let n = 0;
    for (const h of g.heroes) {
      if (Math.abs(h.x - e.x) > hp.r) continue;
      const sc = debuffSec(h, hp.sec * coldMul(h), 'slow');
      if (sc <= 0) continue;
      h.aspdDebCut = h.aspdDebT > 0 ? Math.max(h.aspdDebCut || 0, hp.cut) : hp.cut;
      h.aspdDebT = Math.max(h.aspdDebT || 0, sc);
      n++;
    }
    if (n && g.t - (g.coldEvT || -9) > 1.2) { g.coldEvT = g.t; ev(g, 'c7cold', { x: e.x, y: e.y - d.size * 0.6 }); }
  }
  // 눈싸움 대학생: 멀찍이 서서 눈덩이 → 빙결
  if (d.snowball && e.atRope && g.heroes.length && (e.snowT -= dt) <= 0) {
    const sb = d.snowball;
    e.snowT = sb.every * (0.85 + g.rng() * 0.3);
    const fresh = g.heroes.filter((h) => h.stunT <= 0 && !h.gone), list = fresh.length ? fresh : g.heroes;
    const top = list.reduce((a, h) => (h.dmgDone > a.dmgDone ? h : a), list[0]); // "헤드샷~!" 제일 잘 치는 멤버부터 노린다 (도발 탱커가 있으면 그쪽)
    throwOrGate(g, 'snowball', e, list.find((h) => h.def.taunt) || (g.rng() < sb.aim ? top : victim(g, list)), sb.fly, sb.sec);
    ev(g, 'c7snow', { x: e.x, y: e.y - d.size * 0.6 });
  }
  // 펜션 사장님: "여기 밤 10시 이후 소음 금지예요!" — 예고 1.3초 → 넓은 범위 멤버 침묵 (스킬 못 씀)
  if (d.quiet && e.y > 60) {
    const q = d.quiet;
    if (e.quietW > 0) {
      e.quietW -= dt; e.windup = Math.max(0, e.quietW);
      if (e.quietW <= 0) {
        e.windup = 0; e.quietCd = q.every;
        let n = 0;
        for (const h of g.heroes) {
          if (Math.abs(h.x - e.x) > q.r) continue;
          const sc = debuffSec(h, q.sec * coldMul(h), 'silence');
          if (sc > 0) { h.silenceT = Math.max(h.silenceT || 0, sc); h.muteT = Math.max(h.muteT || 0, sc); n++; }
        }
        ev(g, 'c7quiet', { x: e.x, y: e.y - d.size * 0.6, r: q.r, n });
      }
    } else if ((e.quietCd -= dt) <= 0) { e.quietW = q.windup; e.windup = q.windup; ev(g, 'c7quietWind', { x: e.x, y: e.y - d.size * 0.6, text: d.shouts[0] }); }
  }
  // 리조트 갑부 회장: 눈사태 (크게 예고 → 멤버 전원 빙결) — 예고 중에 스킬을 쓰면 끊긴다
  if (d.avalanche && e.y > 0 && !g.over) {
    const a = d.avalanche;
    if (e.avaW > 0) {
      e.avaW -= dt; e.windup = Math.max(0.01, e.avaW);
      if (e.avaW <= 0) {
        e.avaW = 0; e.windup = 0; g.avalanche = null;
        e.avaT = a.every * (g.hell ? 0.9 : 1) * (e.bai && e.bai.p2 ? 0.85 : 1);
        let n = 0;
        for (const h of g.heroes) if (ch7Freeze(g, h, a.freeze, 'avalanche') > 0) n++;
        if (a.door && !g.god) damageBase(g, g.base.max * a.door, e); // 눈더미가 입구를 덮친다
        for (let k = 0; k < (a.riders || 0); k++) spawnEnemy(g, 'snowboard', clamp(e.x + (k - (a.riders - 1) / 2) * 60, 20, g.W - 20), Math.max(20, e.y + 30), { hpMul: hpMul(g.diff, g.mode === 'stage') * (g.hpScale || 1) * 0.8 }); // 눈사태를 타고 보드남이 내려온다
        g.stats.avaHit = (g.stats.avaHit || 0) + 1;
        ev(g, 'c7ava', { x: e.x, y: e.y, n });
        bossWeak(g, e);
      }
    } else if (!stunned && !(e.bai && e.bai.st === 'windup') && (e.avaT -= dt) <= 0) {
      e.avaW = a.windup; e.windup = a.windup; g.avalanche = e;
      ev(g, 'c7avaWarn', { x: e.x, y: e.y, sec: a.windup });
    }
  }
}
// 주간 진상 특성: 체력 · 이동 · 방어 · 보호막 (수는 웨이브 만들 때 · 피해 · 치명타 · 기절 시간은 heroDamage · mods)
function wtrEnemy(g, e) {
  const W = g.wtr;
  if (e.def.dot || e.def.figure) return;
  const m = W.bossHp && (e.boss || e.mid || e.elite) ? W.bossHp : W.hp || 1;
  if (m !== 1) { e.maxHp *= m; e.hp *= m; e.shield *= m; }
  if (W.spd) { e.speed *= W.spd; e.baseSpeed = e.speed; }
  if (W.armor && !e.boss) e.armor += Math.round((COND.armor.armor[chapterOf(g.stage || 1)] || 6) * W.armor);
  if (W.shield && !e.boss && !e.mid && !e.cLay && g.rng() < W.shield) { e.cLay = e.cLayMax = COND.shield.layers[0]; e.cLayT = COND.shield.regen; }
}
// ─── 스테이지 조건 (1~6장 중후반 · 헬): 보호막 · 은신 · 기절 예고 · 철갑 · 떼거리 · 문 돌격 — 강화만으로는 못 뚫게, 역할이 필요하게 ───
function condEnemy(g, e) {
  const C = g.cond, ch = chapterOf(g.stage || 1), k = g.hell ? 1.1 : 1;
  e.atk *= (DOOR_PRESSURE.atk[ch - 1] || 1) * (g.hell ? DOOR_PRESSURE.hell : 1); e.baseAtk = e.atk; // 문 압박: 입구에 닿은 진상이 더 세게
  if (e.boss || e.mid || e.def.dot || e.def.figure) return;
  if (C.shield && (e.elite || g.rng() < COND.shield.frac * k)) { e.cLay = e.cLayMax = COND.shield.layers[e.elite ? 1 : 0]; /* (10/08 헬도 졸개는 기본 겹 — 헬은 체력이 단단한 대신) */ e.cLayT = COND.shield.regen; }
  if (C.armor && (e.elite || g.rng() < COND.armor.frac * k)) { e.armor += COND.armor.armor[ch] || 0; e.cArmor = true; }
  if (C.stealth && e.unveiled && g.rng() < COND.stealth.frac * k) { e.cloak = true; e.unveiled = false; }
  if (C.rush && !e.fast && !e.elite && g.rng() < COND.rush.frac * k) { e.fast = true; e.cRush = true; e.speed *= COND.rush.spd; e.baseSpeed = e.speed; e.atk *= COND.rush.atk; e.baseAtk = e.atk; }
  if (!e.unveiled) { e.cHid = true; g.cstat.hidden++; }
}
// 보호막 한 겹: 운영진 · 여지원(깨기 전문)이나 버프 벗기기 장비는 한 번에 다 깬다. 겹이 남아 있으면 true (피해 −90%)
function condLayer(g, e, src) {
  if ((src.id && COND.shield.breaker.includes(src.id)) || (src.gear && src.gear.strip && g.rng() < src.gear.strip)) {
    e.cLay = 0; e.cLayT = COND.shield.regen; g.cstat.breaks++;
    ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6, by: src.id });
    return false;
  }
  e.cLay--; e.cLayT = COND.shield.regen;
  if (e.cLay <= 0) ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 });
  else if (g.t - (e.layT || -9) > 0.3) { e.layT = g.t; ev(g, 'blocked', { x: e.x, y: e.y - e.def.size * 0.7, n: e.cLay }); }
  return true;
}
function condTick(g, dt) {
  const st = g.cstat, rv = FIELD.spawnY + (g.ropeY - FIELD.spawnY) * 0.75;
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (e.cLayMax && e.cLay < e.cLayMax) { if (e.noShieldT > 0) e.cLay = 0; else if ((e.cLayT -= dt) <= 0) { e.cLay++; e.cLayT = COND.shield.regen; } } // 4초 안 맞으면 한 겹 다시
    if (e.cHid && !e.cDone && e.unveiled) { e.cDone = true; if (e.y < rv - 4) st.found++; } // 길 ¾ 전에 찾아냄
    if (e.cRush && !e.cOff && (e.slowT > 0 || e.stunT > 0)) { e.cOff = true; e.speed *= COND.rush.off; ev(g, 'c7sledOff', { x: e.x, y: e.y - e.def.size * 0.5 }); } // 돌격 진상: 감속 · 기절에 걸리면 넘어져 느려진다
    if (e.atRope && !e.cLeak && !e.def.standoff) {
      e.cLeak = true; st.leak++; if (e.cLay > 0) st.shieldLeak++; if (e.cArmor) st.armorLeak++;
      if (e.cRush && !e.cOff && e.stunT <= 0) { damageBase(g, g.base.max * (COND.rush.crash[Math.min(6, chapterOf(g.stage || 1)) - 1] || 0.04) * (g.hell ? 1.1 : 1), e); e.cCrashed = true; ev(g, 'c7crash', { x: e.x, y: g.ropeY }); } // 쾅! 입구에 부딪힘
    }
  }
  if (g.phase === 'wave') { for (const h of g.heroes) if (!h.def.summon && (h.stunT > 0 || h.charmT > 0)) st.ccSec += dt; const f = g.base.hp / g.base.max; if (f < st.minDoor) st.minDoor = f; }
  if (g.cond.cc && g.phase === 'wave') condCc(g, dt);
}
// 기절 예고: 진상 하나가 1초 기를 모았다가 제일 센 멤버(도발 탱커가 있으면 탱커)에게 기절 → 홀림 → 침묵 차례로
//  기 모으는 중에 기절시키면 끊긴다 · 건전녀 응급 방패/강성구 곁은 면역 · 건전녀 · 김도훈 · 홍정민(Lv5)이 풀어 준다
const CC_ORDER = ['stun', 'charm', 'poison', 'silence']; // 독: 3장부터 (아니면 기절)
function condCc(g, dt) {
  const C = COND.cc, e = g.ccE;
  if (e) {
    if (!e.dead && e.stunT > 0) { g.ccE = null; e.windup = 0; e.ccW = 0; g.ccT = 2.5; ev(g, 'condCcStop', { x: e.x, y: e.y - e.def.size * 0.6 }); return; } // 기 모으는 중 기절시키면 끊긴다 (쓰러뜨려도 이미 날아간 저주는 온다)
    e.ccW -= dt; if (!e.dead) e.windup = Math.max(0.01, e.ccW);
    if (e.ccW > 0) return;
    e.windup = 0; e.ccW = 0; g.ccE = null;
    const ch = Math.min(6, chapterOf(g.stage || 1));
    g.ccT = (C.every[0] + (C.every[1] - C.every[0]) * Math.max(0, ch - 2) / 4) * (g.hell ? 0.9 : 1);
    const hs = g.heroes.filter((h) => !h.def.summon && !h.gone);
    if (!hs.length) return;
    const fresh = hs.filter((h) => h.stunT <= 0 && h.charmT <= 0), list = fresh.length ? fresh : hs;
    const top = list.reduce((a, h) => (h.dmgDone > a.dmgDone ? h : a), list[0]);
    const h = victim(g, list, top);
    let kind = CC_ORDER[(g.ccI = (g.ccI | 0) + 1) % CC_ORDER.length];
    const hk = g.hell ? 1.1 : 1;
    // 해제 담당: 건전녀가 있으면 바로 응급처치 (4초에 한 번 · 0.6초 만에 풀림) · 김도훈 떼창 곁이면 40% 짧게
    const gn = g.heroes.find((o) => o.id === 'gunnyeo' && o.stunT <= 0 && o.charmT <= 0 && !o.gone);
    const react = !!gn && !(g.gnReactT > g.t);
    const sing = g.heroes.find((o) => o.def.sing && o !== h && o.stunT <= 0 && Math.abs(o.x - h.x) <= o.def.sing.r);
    const cut = (v) => (react ? Math.min(v, C.react) : v) * (sing ? C.singCut : 1);
    let sec = 0;
    if (kind === 'poison') { if (g.kdOn && chapterOf(g.stage || 1) >= 3) sec = poisonHero(g, h, KD.poison.cc * hk); else kind = 'stun'; } // 독 (3장부터 · 쓰러짐 게이지가 있을 때)
    if (kind === 'stun') { sec = cut(debuffSec(h, C.stun * hk, 'stun')); if (sec > 0) { h.stunT = Math.max(h.stunT, sec); firstStunTip(g); } }
    else if (kind === 'charm') {
      if (g.heroes.some((o) => o.id === 'gunnyeo' && o.lv >= 5)) ev(g, 'charmBlock', { x: h.x, y: h.y });
      else { sec = cut(debuffSec(h, C.charm * hk, 'charm')); if (sec > 0) h.charmT = Math.max(h.charmT, sec); }
    } else if (kind === 'silence') { sec = cut(debuffSec(h, C.silence * hk, 'silence')); if (sec > 0) { h.silenceT = Math.max(h.silenceT || 0, sec); h.muteT = Math.max(h.muteT || 0, sec); } }
    if (react && sec > 0) { g.gnReactT = g.t + C.reactCd; ev(g, 'cleanse', { x: h.x, y: h.y }); ev(g, 'gunnyeoReact', { x: gn.x, y: gn.y, hero: h.id }); }
    ev(g, 'condCc', { kind, hero: h.id, x: h.x, y: h.y, ex: e.x, ey: e.y - e.def.size * 0.5, sec, block: sec <= 0 });
    return;
  }
  if ((g.ccT -= dt) > 0) return;
  let pick = null;
  for (const o of g.enemies) {
    if (o.dead || o.boss || o.mid || o.def.dot || o.stunT > 0 || isHidden(o) || o.y < 60 || o.y > g.ropeY - 10) continue;
    if (!pick || (o.elite && !pick.elite) || (o.elite === pick.elite && o.y > pick.y)) pick = o;
  }
  if (!pick) { g.ccT = 1; return; }
  g.ccE = pick; pick.ccW = C.windup; pick.windup = C.windup;
  ev(g, 'condCcWarn', { x: pick.x, y: pick.y - pick.def.size * 0.6, sec: C.windup });
}
// 팀 기여: 입구 수리 · 막은 피해 · 버프로 늘어난 피해 (결과 화면 MVP 옆에 보여 준다)
function teamOf(g, id) { const m = g.stats.teamBy || (g.stats.teamBy = {}); return m[id] || (m[id] = { repair: 0, prevent: 0, buff: 0 }); }
// 입구 회복 (raw = 회복량): 꽉 찬 입구에 넘친 회복은 절반이 입구 방패로 (최대 내구도 15% · 5초) — 서포터가 '꽉 찬 입구'에서도 일을 한다
export const OVERHEAL = { eff: 0.5, cap: 0.15, sec: 5 };
function healDoor(g, id, raw) {
  if (!(raw > 0) || g.over) return 0;
  const v = Math.min(g.base.max - g.base.hp, raw);
  if (v > 0) repairDoor(g, id, v);
  const over = (raw - v) * OVERHEAL.eff;
  if (over > 0 && g.mode === 'stage' && g.metaSoft) {
    const cap = g.base.max * OVERHEAL.cap;
    if ((g.doorShield || 0) < cap) { g.doorShield = Math.min(cap, (g.doorShieldT > 0 ? g.doorShield || 0 : 0) + over); g.doorShieldT = Math.max(g.doorShieldT || 0, OVERHEAL.sec); g.doorShieldMax = Math.max(g.doorShieldMax || 0, g.doorShield); g.doorShieldBy = id; }
  }
  return v;
}
function repairDoor(g, id, v) {
  if (!(v > 0)) return 0;
  g.base.hp += v;
  if (g.stats.team) { g.stats.team.repair += v; teamOf(g, id).repair += v; }
  return v;
}
function prevented(g, id, v) { if (v > 0 && g.stats.team && !g.over) { g.stats.team.prevent += v; teamOf(g, id).prevent += v; } }
// 멤버마다 지금 받는 버프 (누가 · 몇 배) — 방장 오라 · 집합 · 김도훈 떼창/앵콜 · 강병화 오라/원맨쇼 · 이호찬 "랑방을 위하여"
function teamBuffs(g) {
  const b = hasHero(g, 'bangjang');
  for (const h of g.heroes) {
    const L = h._bf || (h._bf = []);
    L.length = 0;
    let M = 1;
    const add = (id, f) => { if (f > 1.0001 && id && id !== h.id) { L.push(id, f); M *= f; } };
    if (b) add('bangjang', 1 + auraBonus(g, h));
    let sing = 0, sid = null;
    for (const d0 of g.heroes) if (d0.def.sing && d0 !== h && d0.stunT <= 0 && Math.abs(d0.x - h.x) <= d0.def.sing.r && d0.def.sing.spd[d0.lv - 1] > sing) { sing = d0.def.sing.spd[d0.lv - 1]; sid = d0.id; }
    if (sid) add(sid, 1 + sing);
    if (byungNear(g, h)) add('byunghwa', 1 + HEROES.byunghwa.aura.spd);
    if (g.rallyT > 0 && g.rallySpd) add(g.rallyBy || 'bangjang', (1 + g.rallySpd) * (g.rallyDmg && g.rallyBy !== 'dohoon' ? 1 + g.rallyDmg : 1));
    if (g.encoreT > 0) add('dohoon', 1 + (g.encoreDmg || 0));
    if (g.hcT > 0 || g.hcSkT > 0) add('hochan', 1 + (g.hcT > 0 ? g.hcBuff : 0) + (g.hcSkT > 0 ? g.hcSkAtk : 0));
    if (g.onemanT > 0) add('byunghwa', 1 + (g.onemanAtk || 0.3));
    if (h.cheerT > 0) add('gunnyeo', 1 + HEROES.gunnyeo.care.cheer.spd); // 건전녀 간호 "힘내요!"
    h._bfM = M;
  }
}
function creditBuff(g, h, dmg) {
  const L = h._bf, M = h._bfM, add = dmg * (1 - 1 / M), lnM = Math.log(M);
  if (!g.stats.team || !L || !L.length) return;
  g.stats.team.buff += add;
  for (let i = 0; i < L.length; i += 2) teamOf(g, L[i]).buff += (add * Math.log(L[i + 1])) / lnM;
}
// ─── 8장 결혼식 뒤풀이 진상 기술 (축의금 도둑 · 뷔페 회복 · 축가 공속↓ · 실장님 재촉 · 클립보드 · 끝없는 축사) ───
function ch8Init(g, e) {
  const d = e.def;
  e.eatCd = d.eat ? d.eat.first + g.rng() : 0;
  e.singCd = d.sing ? d.sing.first + g.rng() * 2 : 0;
  e.hurryCd = d.hurry ? d.hurry.first : 0;
  e.clipCd = d.clip ? d.clip.every * 0.5 : 0;
  e.speechCd = d.speech ? d.speech.first : 0; e.speechNeed = 0; e.speechTick = 0;
}
// 부케 묶기: 제자리 (보스 · 중간 보스는 느려짐) · 같은 진상은 잠깐 뒤에 다시 · force = 부케 토스
function ch8Tie(g, e, sec, h, force) {
  if (!e || e.dead || !(sec > 0)) return false;
  const T = HEROES.subin.tie;
  if (e.boss || e.mid) {
    if (e.speechT > 0) ch8SpeechAdd(g, e, 4, h); // 축사 중: 리본으로 마이크 줄을 감아 게이지 +4
    e.slowT = Math.max(e.slowT, sec); e.slowMul = Math.min(e.slowMul || 1, 1 - T.bossSlow);
    return false;
  }
  if (!force && e.tieAgain > 0 && !(e.env && e.fleeing && !(e.tieT > 0))) return false; // (봉투 들고 도망가는 도둑은 풀리자마자 다시 묶을 수 있다)
  const k = stunMul(e); if (!(k > 0)) return false;
  const s2 = sec * k * (e.env && e.fleeing ? T.thief : 1);
  e.tieT = Math.max(e.tieT || 0, s2); e.tieAgain = s2 + T.again; e.kbv = 0;
  g.stats.ties = (g.stats.ties | 0) + 1;
  if (g.t - (e.tieEvT || -9) > 0.6) { e.tieEvT = g.t; ev(g, 'c8tie', { x: e.x, y: e.y - e.def.size * 0.6, env: !!(e.env && e.fleeing), sec: s2 }); }
  return true;
}
function ch8Escape(g, e) {
  const n = (g.stats.envStolen = (g.stats.envStolen | 0) + 1);
  ev(g, 'c8escape', { x: clamp(e.x, 40, g.W - 40), y: 20, n, pct: Math.round(thiefCut(n) * 100) });
}
// 축사 게이지: 한 대 1 · 스킬 피해 5 · 부케 묶기 4 → 다 차면 끊긴다
function ch8SpeechAdd(g, e, v, src) {
  if (!(e.speechT > 0)) return;
  e.speechG += v;
  if (g.t - (e.spEvT || -9) > 0.25) { e.spEvT = g.t; ev(g, 'c8speechHit', { x: e.x, y: e.y - e.def.size * 0.8, f: Math.min(1, e.speechG / Math.max(1, e.speechNeed)) }); }
  if (e.speechG >= e.speechNeed) ch8SpeechStop(g, e, src && src.id ? src.id : 'hit');
}
function ch8SpeechHit(g, e, src) {
  ch8SpeechAdd(g, e, src && src.def ? (g._inSkill ? e.def.speech.skillHit : 1) : 0.5, src);
  if (g.t - (e.immT || -9) > 0.7) { e.immT = g.t; ev(g, 'c8speechImm', { x: e.x, y: e.y - e.def.size * 0.7 }); }
  return 0;
}
function ch8SpeechStop(g, e, by) {
  if (g.speech === e) g.speech = null;
  if (!e || e.dead || !(e.speechT > 0)) return false;
  const sp = e.def.speech;
  e.speechT = 0; e.speechG = 0; e.windup = 0; e.speechCd = sp.every * (g.hell ? 0.92 : 1);
  e.stunT = Math.max(e.stunT, sp.stun); e.weakT = Math.max(e.weakT, sp.weak);
  g.stats.speechCut = (g.stats.speechCut | 0) + 1;
  ev(g, 'c8speechCut', { x: e.x, y: e.y, by });
  return true;
}
function ch8Tick(g, e, dt) {
  const d = e.def;
  const stunned = e.stunT > 0;
  // 신랑 친구 대표: 끝없는 축사 (무적 · 곁 진상 재촉 + 회복) — 기절 · 게이지 · 총공지로 끊는다
  if (d.speech) {
    const sp = d.speech;
    if (e.speechT > 0) {
      if (stunned) ch8SpeechStop(g, e, 'stun');
      else {
        e.speechT -= dt; e.windup = 0; e.kbv = 0;
        if ((e.speechTick -= dt) <= 0) {
          e.speechTick = 1;
          forEnemiesNear(g, e.x, e.y, sp.r, (o) => { if (o === e || o.dead) return true; o.rushT = Math.max(o.rushT || 0, 1.5); if (!o.boss && !(o.healBlockT > 0)) o.hp = Math.min(o.maxHp, o.hp + o.maxHp * sp.buff); return true; });
        }
        if (e.speechT <= 0) { // 다 들었다… 하객 전원 졸음 + 입구 피해
          e.speechT = 0; e.speechCd = sp.every * (g.hell ? 0.92 : 1); if (g.speech === e) g.speech = null;
          let n = 0;
          for (const h of g.heroes) { const sc = debuffSec(h, sp.drowse, 'slow'); if (sc > 0) { h.aspdDebCut = h.aspdDebT > 0 ? Math.max(h.aspdDebCut || 0, sp.drowseCut) : sp.drowseCut; h.aspdDebT = Math.max(h.aspdDebT || 0, sc); n++; } }
          if (sp.door && !g.god) damageBase(g, g.base.max * sp.door, e);
          g.stats.speechFull = (g.stats.speechFull | 0) + 1;
          ev(g, 'c8speechEnd', { x: e.x, y: e.y, n });
          bossWeak(g, e);
        }
      }
    } else if (!stunned && e.y > 60 && !g.over && !(e.bai && e.bai.st === 'windup') && (e.speechCd -= dt) <= 0) {
      e.speechT = sp.sec * (g.hell ? 1.07 : 1); e.speechG = 0; e.speechNeed = Math.round(sp.need * (g.hell ? 1.1 : 1)); e.speechTick = 0;
      g.speech = e;
      ev(g, 'c8speech', { x: e.x, y: e.y, sec: e.speechT, need: e.speechNeed });
    }
  }
  // 뷔페 아줌마: 냠냠 — 곁의 진상 회복 (기절 중엔 못 먹음 · 방깎/회복 막기에 막힘)
  if (d.eat && !stunned && e.y > 20 && (e.eatCd -= dt) <= 0) {
    const ea = d.eat;
    e.eatCd = ea.every;
    let n = 0;
    forEnemiesNear(g, e.x, e.y, ea.r, (o) => { if (o.dead || o.boss || o.healBlockT > 0 || o.hp >= o.maxHp) return true; o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (o === e ? ea.self : ea.heal)); n++; return true; });
    ev(g, 'c8eat', { x: e.x, y: e.y - d.size * 0.6, r: ea.r, n });
  }
  // 축가 삼촌: 숨 들이쉬고 → 음 이탈! 곁 멤버 공격 속도 ↓ (숨 들이쉴 때 기절시키면 끊김)
  if (d.sing && e.y > 80) {
    const si = d.sing;
    if (e.singW > 0) {
      if (stunned) { e.singW = 0; e.windup = 0; e.singCd = si.every; ev(g, 'c8singStop', { x: e.x, y: e.y - d.size * 0.6 }); }
      else if ((e.singW -= dt) <= 0) {
        e.singW = 0; e.windup = 0; e.singCd = si.every;
        let n = 0;
        for (const h of g.heroes) { if (Math.abs(h.x - e.x) > si.r) continue; const sc = debuffSec(h, si.sec, 'slow'); if (sc > 0) { h.aspdDebCut = h.aspdDebT > 0 ? Math.max(h.aspdDebCut || 0, si.cut) : si.cut; h.aspdDebT = Math.max(h.aspdDebT || 0, sc); n++; } }
        ev(g, 'c8sing', { x: e.x, y: e.y - d.size * 0.6, r: si.r, n });
      } else e.windup = e.singW;
    } else if (!stunned && (e.singCd -= dt) <= 0) { e.singW = si.windup; e.windup = si.windup; ev(g, 'c8singWind', { x: e.x, y: e.y - d.size * 0.6 }); }
  }
  // 예식장 실장님: "시간 없어요!" 곁 진상 재촉 (예고 중 기절시키면 끊김) · 입구 앞 클립보드
  if (d.hurry && e.y > 40) {
    const hu = d.hurry;
    if (e.hurryW > 0) {
      if (stunned) { e.hurryW = 0; e.windup = 0; e.hurryCd = hu.every; ev(g, 'c8hurryStop', { x: e.x, y: e.y - d.size * 0.6 }); }
      else if ((e.hurryW -= dt) <= 0) {
        e.hurryW = 0; e.windup = 0; e.hurryCd = hu.every * (g.hell ? 0.92 : 1);
        let n = 0;
        forEnemiesNear(g, e.x, e.y, hu.r, (o) => { if (o.dead || o === e) return true; o.rushT = Math.max(o.rushT || 0, hu.sec); n++; return true; });
        ev(g, 'c8hurry', { x: e.x, y: e.y - d.size * 0.6, r: hu.r, n });
      } else e.windup = e.hurryW;
    } else if (!stunned && (e.hurryCd -= dt) <= 0) { e.hurryW = hu.windup; e.windup = hu.windup; ev(g, 'c8hurryWind', { x: e.x, y: e.y - d.size * 0.6, text: d.shouts[0] }); }
  }
  if (d.clip && e.atRope && !stunned && g.heroes.length && (e.clipCd -= dt) <= 0) {
    e.clipCd = d.clip.every;
    let h = g.heroes[0]; for (const o of g.heroes) if (Math.abs(o.x - e.x) < Math.abs(h.x - e.x)) h = o;
    h = victim(g, g.heroes, h);
    const sc = debuffSec(h, d.clip.stun, 'stun');
    if (sc > 0) { h.stunT = Math.max(h.stunT, sc); firstStunTip(g); }
    ev(g, 'c8clip', { x: e.x, y: e.y - d.size * 0.5, hx: h.x, hy: h.y, sec: sc });
  }
}
// 멤버를 노리는 진상 기술: 탱커(백인규)가 있으면 그쪽으로
function victim(g, list, dflt) {
  const t = list.find((h) => h.def.taunt);
  if (t) return t;
  const inRow = list.filter((h) => !h.out);
  const pool = inRow.length ? inRow : list;
  return dflt && !dflt.out ? dflt : pool[(g.rng() * pool.length) | 0];
}
export function debuffSec(h, sec, kind = 'hard') {
  const g = h._g;
  if (h.ccImmT > 0 && kind !== 'slow') return 0; // 건전녀 응급 방패: 잠깐 상태이상 면역
  if (g && kind !== 'none' && kind !== 'poison') { const au = g.heroes.find((o) => o.id === BAL.aura.id && !o.gone && o !== h && Math.hypot(o.x - h.x, o.y - h.y) < BAL.aura.r); const self = h.id === BAL.aura.id; if (au || self) { if (kind === 'slow') sec *= 0.5; else { if (g.t - (h.blockT || -9) > 0.8) { h.blockT = g.t; ev(g, 'ccBlock', { x: h.x, y: h.y - 60 }); } return 0; } } }
  if (g && byungNear(g, h)) sec *= HEROES.byunghwa.aura.cc; // 강병화 곁: 상태이상 절반
  let out = (h.def.taunt ? sec * h.def.taunt : sec) * (h.debuffMul || 1) * (1 - resOf(h.meta, h.gear && h.gear.res)) * (g && g.gnRes ? 1 - g.gnRes : 1) * (h.gear && h.gear.hellSet >= 2 ? 1 - HELL_SET_FX.cc : 1);
  if (kind !== 'hard' && kind !== 'none') { const r = resPct(h, kind); if (r >= 100) { if (g && g.t - (h.immT || -9) > 0.8) { h.immT = g.t; ev(g, 'immune', { kind, hero: h.id, x: h.x, y: h.y - 60 }); } return 0; } out *= 1 - r / 100; } // 멤버 저항 (HERO_RES) + 서포터 면역 (KD_SUP)
  if (g && g.ccMul) out *= g.ccMul; // 할로윈 저주: 상태이상 2배
  if (g && g.kdOn && out > 0 && kind !== 'poison' && kind !== 'none') { const ex = h.kdExp || (h.kdExp = {}), p0 = Math.max(g.t, ex[kind] || 0), add = Math.max(0, g.t + out - p0); ex[kind] = Math.max(p0, g.t + out); if (add > 0) kdAdd(g, h, add * (kind === 'slow' ? KD.slow : KD.status * (KD.kind[kind] || 1)), { src: kind }); } // 늘어난 시간만큼만 (매 프레임 다시 거는 것도 한 번으로)
  return out;
}
// ─── 쓰러짐 게이지 (KD) — 레이드 등 다른 모드도 그대로 쓰게 export ───
//  kdMax(h) 게이지 크기 · kdAdd(g, h, v, { direct }) 채우기 (direct 가 아니면 도발 멤버가 곁에서 대신 맞음) · kdRevive(g, h) 바로 일으킴 · poisonHero(g, h, sec) 독 · resPct(h, kind) 저항 %
export function kdMax(h) { return KD.base * (KD_HERO[h.id] || 1) * (1 + KD.lv * ((h.lv || 1) - 1)) * (1 + KD.meta * (h.meta || 0)) * (1 + KD.star * ((h.star || 1) - 1)) * (1 + ((h.gear && h.gear.res) || 0)) * (1 + KD.after * (h.kdN || 0)); } // (10/08) 쓰러질 때마다 그 판에서 게이지 +KD.after (같은 멤버가 계속 눕지 않게 · KD.after)
function supOf(g, key) { let v = 0; for (const o of g.heroes) { const s = KD_SUP[o.id]; if (s && s[key] && !o.gone) v = Math.max(v, s[key]); } return v; }
export function resPct(h, kind) { const g = h._g; let r = (HERO_RES[h.id] || {})[kind] || 0; if (g) for (const o of g.heroes) { const s = KD_SUP[o.id]; if (s && s.res && s.res[kind] && !o.gone) r += s.res[kind]; } return Math.min(100, r); }
export function kdAdd(g, h, v, o = {}) {
  if (!g.kdOn || !h || h.def.summon || h.gone || !(v > 0)) return 0;
  if (!o.direct && !h.def.taunt) { const t = g.heroes.find((x) => x.def.taunt && x !== h && !x.gone && !(x.kdT > 0) && Math.abs(x.x - h.x) < KD.taunt.r); if (t) h = t; } // 탱커가 곁 멤버 대신 맞는다
  if (h.kdT > 0 || h.kdGrace > 0) return 0;
  v *= (1 - supOf(g, 'kdCut')) * (g.mode === 'stage' ? KD.ch[Math.min(8, chapterOf(g.stage || 1)) - 1] || 1 : 1) * (g.hell ? KD.hell : 1);
  h.kdMax = kdMax(h); h.kd = (h.kd || 0) + v; h.kdHitT = g.t; g.stats.kdFill = (g.stats.kdFill || 0) + v; { const k = o.src || 'etc', m = g.stats.kdSrc || (g.stats.kdSrc = {}); m[k] = (m[k] || 0) + v; if (o.by) { const mb = g.stats.kdBy || (g.stats.kdBy = {}); mb[o.by] = (mb[o.by] || 0) + v; } } g.stats.kdPeak = Math.max(g.stats.kdPeak || 0, h.kd / h.kdMax);
  if (h.kd >= h.kdMax) { h.kd = h.kdMax; h.kdT = h.kdSec = KD.sec; h.beamE = null; h.beam2E = null; g.stats.kd = (g.stats.kd || 0) + 1; h.kdN = (h.kdN || 0) + 1; ev(g, 'knockdown', { hero: h.id, x: h.x, y: h.y, sec: KD.sec }); }
  return v;
}
export function kdRevive(g, h) { if (!(h.kdT > 0)) return false; h.kdT = 0; h.kd = 0; h.kdGrace = KD.grace; ev(g, 'getUp', { hero: h.id, x: h.x, y: h.y }); return true; }
export function poisonHero(g, h, sec) { if (!h || h.def.summon || h.gone) return 0; const s = debuffSec(h, sec, 'poison'); if (s > 0) { if (!(h.poisonT > 0)) ev(g, 'poisonHit', { hero: h.id, x: h.x, y: h.y }); h.poisonT = Math.max(h.poisonT || 0, s); } return s; }
function kdTick(g, h, dt) {
  if (h.def.summon) return;
  h.kdMax = kdMax(h);
  if (h.kdGrace > 0) h.kdGrace -= dt;
  if (h.poisonT > 0) { h.poisonT -= dt; kdAdd(g, h, KD.poison.dps * dt, { direct: true, src: 'poison' }); } // 독: 게이지가 계속 찬다
  if (h.kdT > 0) { h.kdT -= dt * (supOf(g, 'getUp') || 1); if (h.kdT <= 0) { h.kdT = 0; h.kd = 0; h.kdGrace = KD.grace; ev(g, 'getUp', { hero: h.id, x: h.x, y: h.y }); } return; }
  if (h.kd > 0 && g.t - (h.kdHitT || 0) > KD.decay.wait) h.kd = Math.max(0, h.kd - KD.decay.per * dt);
  const s = KD_SUP[h.id]; // 건전녀 간호: 가장 찬 멤버 게이지를 내린다
  if (s && s.heal && h.stunT <= 0 && h.charmT <= 0) {
    let best = null, bf = 0.05; for (const o of g.heroes) { if (o.def.summon || o.gone || o.kdT > 0 || !(o.kd > 0)) continue; const f = o.kd / (o.kdMax || 100); if (f > bf) { bf = f; best = o; } }
    if (best) { const v = Math.min(best.kd, s.heal * dt); best.kd -= v; h.kdHealN = (h.kdHealN || 0) + v; if (h.kdHealN >= 12) { h.kdHealN = 0; ev(g, 'kdHeal', { hero: best.id, by: h.id, x: best.x, y: best.y }); } }
  }
}
// 입구를 치는 진상: 가장 가까운 멤버(줄 r 안)도 맞는다 (쓰러짐 게이지)
function kdLine(g, e) { let best = null, bd = KD.line.r; for (const h of g.heroes) { if (h.def.summon || h.gone || h.out) continue; const d = Math.abs(h.x - e.x); if (d < bd) { bd = d; best = h; } } if (best) kdAdd(g, best, KD.line.hit * (e.boss ? KD.line.boss : e.elite || e.mid ? KD.line.elite : 1), { src: 'line', by: e.type }); } // 강화 · 장비 저항 · 면역
// 첫 기절: 한 번만 팁
function firstStunTip(g) { if (g.stunTip) return; g.stunTip = true; ev(g, 'tip', { text: '기절한 멤버는 건전녀 응급처치로 풀 수 있어요 · 강성구 곁은 기절 면역' }); }

// 보스가 큰 기술을 쓴 직후 2.5초 "빈틈!" — 받는 피해 1.5배
function bossWeak(g, e) {
  if (!e.boss) return;
  e.weakT = RULES.bossWeakSec;
  ev(g, 'weak', { x: e.x, y: e.y - e.def.size * 0.8 });
}

export function tryCharm(g, e) {
  const want = e.def.charm;
  if (g.mode === 'stage' && g.stage <= 2) return; // 튜토리얼: 홀림 없음
  const cands = g.heroes.filter((h) => (want === 'both' || h.def.gender === want) && h.charmT <= 0 && !(h.ccImmT > 0) && !(h.def.diet && !h.alt && g.t - (h.slamAt || -9) < 0.7));
  if (!cands.length) return;
  const h = cands[(g.rng() * cands.length) | 0];
  const g5 = g.heroes.find((x) => x.id === 'gunnyeo' && x.lv >= 5);
  if (g5) { ev(g, 'charmBlock', { x: h.x, y: h.y, ex: e.x, ey: e.y }); return; }
  const sec = debuffSec(h, RULES.charmSec * g.mods.charmMul * (h.def.diet && !h.alt ? h.def.diet.charmRes : 1), 'charm'); // (10/08) 저항 · 정소영 면역 · 쓰러짐 게이지까지 공용으로
  if (sec <= 0) return;
  h.charmT = Math.max(h.charmT, sec);
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
      if (p.drop) { p.x = p.tx; p.y = p.sy + (p.ty - p.sy) * k * k; } // 운영진 딱지: 하늘에서 수직 낙하 (점점 빨리)
      else { p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k - Math.sin(k * Math.PI) * (p.arcH || 70); } // 포물선 높이: 건전녀 높게 · 최은옥 낮게
      p.rot += p.spin * dt;
      if (k >= 1) { if (p.type === 'stamp') landStamp(g, p); else landLob(g, p); p.dead = true; }
      continue;
    }
    p.life -= dt;
    if (p.path) { pathStep(g, p, dt); if (p.dead) continue; p.dist += p.speed * dt; if (p.spin) p.rot += p.spin * dt; else p.rot = Math.atan2(p.vy, p.vx); }
    else {
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
    if (g.windX && !p.homing && !p.returning && p.type !== 'moto' && p.type !== 'crown') p.vx += g.windX * dt; // 제주 바람
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.dist += p.speed * dt;
    if (p.spin) p.rot += p.spin * dt;
    else p.rot = Math.atan2(p.vy, p.vx);
    if (!p.returning && p.dist > p.maxDist && !p.boomerang) { p.dead = true; continue; } // 사거리 끝 (구르는 덤벨 · 주먹 충격파)
    }
    if (p.path === 'blink' && !p.hopNow) continue; // 점멸 손: 나타난 순간에만 맞는다
    if (!p.returning && (p.life <= 0 || p.x < -50 || p.x > W + 50 || p.y < -90 || p.y > H + 20)) {
      if (p.boomerang && p.life > 0) { p.returning = true; p.hitIds.length = 0; } else { p.dead = true; continue; }
    }
    if (p.returning && p.life <= -2) { p.dead = true; continue; }
    if (p.returning && p.type === 'gf') continue; // 여사친 복귀 중
    forEnemiesNear(g, p.x, p.y, p.r, (e) => {
      if (p.hitIds.includes(e.uid)) return true;
      hitEnemy(g, p, e);
      return !p.dead && !(p.type === 'gf' && p.returning);
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

function stunMul(e) { return e.def.traits && e.def.traits.ccImmune ? 0 : e.form === 'reveal' ? e.def.scam.revealStun : 1; }
export function hitEnemy(g, p, e) {
  const h = p.hero;
  p.hitIds.push(e.uid);
  // 예쁜 프사 사기꾼은 가끔 쏙 피한다
  if ((e.form === 'pretty' && g.rng() < e.def.scam.evade) || (e.def.fake && !e.revealed && g.rng() < e.def.fake.evade)) {
    ev(g, 'miss', { x: e.x, y: e.y - e.def.size * 0.6 });
    if (p.homing) { p.homing = false; p.target = null; }
    return;
  }
  const crit = p.headshot || g.rng() < critOf(g, h) + p.critBonus;
  let dmg = p.dmg * (p.headshot ? 3 : crit ? g.mods.critMul : 1) * (p.type === 'glow' && p.returning ? (h.def.glow ? h.def.glow.back : 0.7) : 1); // 송바울 응원봉: 돌아올 땐 70%
  if (p.swear) {
    // 서명훈: 기절한 적 · 들킨 사기꾼에게 더 아프게
    if (e.stunT > 0) dmg *= h.def.stunnedBonus[h.lv - 1];
    if (e.form === 'reveal') dmg *= h.def.revealBonus;
  }
  // 운영진 경고장: 경고가 쌓이고 3번이면 강퇴
  let kick = false;
  if (p.type === 'swear' && e && !e.dead && e.speed >= 60) { e.slowT = Math.max(e.slowT, 1); e.slowMul = Math.min(e.slowMul || 1, 0.1); }
  if (p.type === 'warn' && h && h.id === 'staff' && (e.shield > 0 || e.dictT > 0 || e.gaoOn) && g.rng() < 0.15) { e.shield = 0; e.dictT = 0; e.gaoOn = false; e.noShieldT = Math.max(e.noShieldT || 0, 2); ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 }); } // 옐로카드: 15% 로 버프 한 겹 벗기기
  if (p.type === 'warn' && h && h.def.warn) {
    e.warnN = (e.warnN | 0) + 1;
    if (e.warnN >= Math.min(Math.max(2, h.def.warn.n - (h.cm.warnN || 0)), (h.sig && h.sig.warnN) || 9)) { e.warnN = 0; kick = true; dmg *= h.def.warn.mul * (1 + NICHE.staff.kick * (h.meta || 0)); }
  }
  ev(g, 'hit', { x: p.x, y: p.y, proj: p.type, crit });
  damageEnemy(g, e, dmg, crit, h, p.pierce > 0 || p.type === 'cane' || p.type === 'gf');
  if (kick && !e.dead) {
    const w = h.def.warn;
    if (!e.boss && !(g.tension && (e.elite || e.mid))) { e.stunT = Math.max(e.stunT, w.stun[h.lv - 1] * stunMul(e) * g.mods.ctrlMul * (1 + NICHE.staff.stun * (h.meta || 0)) * ((h.sig && h.sig.kickStun) || 1)); applyKnockback(e, w.kb, g); }
    else { e.slowT = Math.max(e.slowT, 2); e.slowMul = Math.min(e.slowMul || 1, 0.6); }
    ev(g, 'kick', { x: e.x, y: e.y - 20, big: true });
  }
  if (kick && h && h.sa && h.sa.kickboom) { // 강퇴 폭발
    ev(g, 'splash', { x: e.x, y: e.y, r: 70, proj: 'warn' });
    forEnemiesNear(g, e.x, e.y, 70, (o) => { if (o === e) return true; damageEnemy(g, o, dmg * 0.5, false, h, true); if (!o.dead && !o.boss) o.stunT = Math.max(o.stunT, 0.8 * stunMul(o)); return true; });
  }
  if (h && h.cc && !e.dead && g.rng() < CC_ON_HIT.chance[Math.min(2, (h.ccN || 1) - 1)]) {
    const k = h.cc;
    if (k === 'stun' || k === 'freeze') { if (!e.boss) e.stunT = Math.max(e.stunT, CC_ON_HIT[k] * stunMul(e) * g.mods.ctrlMul); else { e.slowT = Math.max(e.slowT, 1); e.slowMul = Math.min(e.slowMul || 1, 0.7); } }
    else if (k === 'slow') { e.slowT = Math.max(e.slowT, CC_ON_HIT.slow * g.mods.ctrlMul); e.slowMul = Math.min(e.slowMul || 1, 0.55); }
    else if (k === 'kb') applyKnockback(e, CC_ON_HIT.kb * g.mods.kbMul, g);
    else if (k === 'pull' && !e.boss) { const others = g.enemies.filter((o) => !o.dead && o !== e && Math.hypot(o.x - e.x, o.y - e.y) < 120); for (const o of others.slice(0, 4)) { o.x += (e.x - o.x) * 0.35; o.y += (e.y - o.y) * 0.2; } }
    if (g.t - (e.ccT || -9) > 0.5) { e.ccT = g.t; ev(g, 'cc', { kind: k, x: e.x, y: e.y - e.def.size * 0.7 }); }
  }
  if (p.tie && !e.dead) { ch8Tie(g, e, p.tie, h); if (h && h.sig && h.sig.tieN) { let o2 = null, bd = 80 * 80; for (const o of g.enemies) { if (o === e || o.dead || o.y < 0) continue; const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2; if (d2 < bd) { bd = d2; o2 = o; } } if (o2) ch8Tie(g, o2, p.tie * 0.8, h); } } // 8장 임수빈 부케 (전용 신화: 곁의 한 명 더)
  if (p.type === 'mosaic' && h && h.def.shred) { const sd = h.def.shred, mx = sd.max + (h.lv >= 3 ? 1 : 0) + (h.cm.shredMax || 0); e.shredPer = sd.per + (h.lv >= 5 ? 0.02 : 0); e.shredN = Math.min(mx, e.shredN + 1); e.shredT = sd.sec + (h.cm.shredSec || 0); e.healBlockT = Math.max(e.healBlockT, 2); if (e.shredN >= sd.max && sd && h.def.censor && !(e.censorT > 0)) { e.censorT = h.def.censor.sec; e.censorBy = h; ev(g, 'censor', { x: e.x, y: e.y - e.def.size * 0.6 }); } }
  if (p.pull && h && h.ax !== undefined && !e.dead) { const k = e.boss || e.mid ? 0.08 : (e.def.traits && e.def.traits.kbImmune ? 0.12 : 0.4); e.x += (h.ax - e.x) * k; e.y += (h.ay - e.y) * k * 0.6; e.baseX = e.x; if (g.t - (e.ccT || -9) > 0.6) { e.ccT = g.t; ev(g, 'cc', { kind: 'pull', x: e.x, y: e.y - e.def.size * 0.7 }); } }
  if (p.type === 'gf') {
    // 여사친 핀볼: 밀어내고 → 다음 진상에게 튕긴다 → 다 튕기면 돌아온다
    if (!e.dead && !e.boss) applyKnockback(e, p.gfKb, g);
    let best = null, bd = h.def.ricoR * h.def.ricoR;
    if (p.rico > 0) for (const o of g.enemies) {
      if (o.dead || o === e || p.hitIds.includes(o.uid) || o.y < -20) continue;
      const dx = o.x - e.x, dy = o.y - e.y, d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; best = o; }
    }
    if (best) { p.rico--; p.target = best; p.tuid = best.uid; p.homing = true; p.dmg *= h.def.ricoDecay; ev(g, 'ricochet', { x: e.x, y: e.y - 20, x2: best.x, y2: best.y - 20 }); }
    else { p.returning = true; p.homing = false; p.target = null; }
    return;
  }
  if (p.type === 'crown') {
    // 랑방을 위하여! 맞힐 때마다 아군 공격력 ↑ · 줄 안 진상 버프 하나 벗김
    const b = h.def.buff;
    g.hcBuff = g.hcT > 0 ? Math.min(b.max + (h.cm.buff || 0), g.hcBuff + b.per) : b.per;
    g.hcT = b.sec[h.lv - 1];
    if (p.stripN > 0 && !e.dead && (e.shield > 0 || e.dictT > 0 || e.gaoOn)) { e.shield = 0; e.dictT = 0; e.gaoOn = false; p.stripN--; ev(g, 'strip', { x: e.x, y: e.y - e.def.size * 0.7 }); }
    if (!e.dead && !e.boss) applyKnockback(e, 12, g);
    return;
  }
  if (p.slow && !e.boss) { e.slowT = Math.max(e.slowT, p.slowSec); e.slowMul = 1 - p.slow; }
  else if (p.slow) { e.slowT = Math.max(e.slowT, p.slowSec * 0.5); e.slowMul = 1 - p.slow * 0.5; }
  if (p.stunChance && !e.dead && !e.boss && g.rng() < p.stunChance) {
    e.stunT = Math.max(e.stunT, p.stunSec * stunMul(e));
    ev(g, p.swear ? 'freeze' : 'kick', { x: e.x, y: e.y - 20 });
  }
  if (p.motoKb && !e.dead && !e.boss) { applyKnockback(e, p.motoKb, g); if (h && h.def.moto && h.def.moto.daze) e.stunT = Math.max(e.stunT, h.def.moto.daze * stunMul(e)); } // 백인규 오토바이: 크게 밀치고 잠깐 휘청
  if (p.type === 'snack' && h && h.def.snackMeter && h.burstT <= 0 && h.meter < 100) h.meter = Math.min(99.9, h.meter + h.def.snackMeter); // 문동한: 과자로 간 보기 → 게이지 +
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
    const inc = !BAL.aoeMain.includes(h.id);
    const sr = p.splash * (g.mapFx.splash || 1) * Math.min(BAL.splashCap, g.mods.splashMul) * (inc ? BAL.incSplashR : 1);
    ev(g, 'splash', { x: e.x, y: e.y, r: sr, proj: p.type });
    const sd = dmg * 0.6 * (inc ? BAL.incSplashDmg : 1);
    forEnemiesNear(g, e.x, e.y, sr, (o) => {
      if (o === e) return true;
      damageEnemy(g, o, sd, false, h, true);
      if (p.splashSlow && !o.boss) { o.slowT = Math.max(o.slowT, p.slowSec); o.slowMul = 1 - p.slow; }
      if (p.type === 'warn' && !o.dead) o.warnN = Math.min(2, (o.warnN | 0) + 1);
      if (p.splashStun && !o.boss && !o.dead) o.stunT = Math.max(o.stunT, p.stunSec * 0.8 * stunMul(o));
      return true;
    });
  }
  if (p.push && !e.dead && !e.boss) { applyKnockback(e, p.push, g); if (h && h.def.pump) h.pump = Math.min(h.def.pump.max, (h.pump || 0) + h.def.pump.per); } // 밀치기 (구르는 덤벨 · 주먹 충격파) · 백인규 근육 펌프
  if (p.rose && !e.dead && h) roseMark(g, h, e); // 박상화 장미 표식
  if (p.spread2 && h && h.def.shred) { let o2 = null, bd = 64 * 64; for (const o of g.enemies) { if (o === e || o.dead || o.y < 0) continue; const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2; if (d2 < bd) { bd = d2; o2 = o; } } if (o2) { o2.shredPer = e.shredPer; o2.shredN = Math.min(e.shredN, (o2.shredT > 0 ? o2.shredN : 0) + 1); o2.shredT = e.shredT; ev(g, 'shredSpread', { x: e.x, y: e.y - 20, x2: o2.x, y2: o2.y - 20 }); } } // 여지원: 모자이크가 곁 진상에게 한 겹 번진다
  if (p.decay) p.dmg *= p.decay;
  if (p.ric > 0) { // 건전남 Lv5 도탄: 맞고 튕겨 가까운 진상에게 한 번 더
    let o2 = null, bd = p.ric * p.ric;
    for (const o of g.enemies) { if (o === e || o.dead || o.y < -20 || p.hitIds.includes(o.uid) || isHidden(o)) continue; const d2 = (o.x - e.x) ** 2 + (o.y - e.y) ** 2; if (d2 < bd) { bd = d2; o2 = o; } }
    p.ric = 0;
    if (o2) { const a = Math.atan2(o2.y - e.y, o2.x - e.x); p.vx = Math.cos(a) * p.speed; p.vy = Math.sin(a) * p.speed; p.x = e.x; p.y = e.y; p.dmg *= 0.7; p.maxDist = p.dist + Math.sqrt(bd) + 30; ev(g, 'ricochet', { x: e.x, y: e.y - 20, x2: o2.x, y2: o2.y - 20, bullet: true }); return; }
  }
  if (p.pierce > 0) {
    p.pierce--;
    p.homing = false;
    p.target = null;
  } else p.dead = true;
}
// 박상화 장미 표식: 맞을 때마다 한 송이 (6초) · ROSE.need 송이면 "꽃다발!" 주변 터짐 + 성장
function roseMark(g, h, e) {
  const R = h.def.rose;
  if (!R) return;
  e.roseN = (e.roseT > 0 ? e.roseN | 0 : 0) + 1; e.roseT = R.keep;
  if (e.roseN < R.need - (h.lv >= 5 ? 1 : 0)) return;
  e.roseN = 0; e.roseT = 0;
  bloomAt(g, h, e.x, e.y, heroDamage(g, h) * R.bloom, R.r * (h.lv >= 3 ? 1.2 : 1));
  growBy(h, R.grow);
}
function bloomAt(g, h, x, y, dmg, r) {
  forEnemiesNear(g, x, y, r, (o) => { const crit = g.rng() < critOf(g, h); damageEnemy(g, o, dmg * (crit ? g.mods.critMul : 1), crit, h, true); return true; });
  ev(g, 'bloom', { x, y: y - 10, r, hero: h.id });
}

// 스킬 · 버스로 바로 밀기: 영웅 줄에서 kbMaxReach 위로는 안 밀어낸다 (화면 위로 날아가 아무도 못 때리던 버그) · 이미 그 위면 그대로
function pushUp(g, e, d) { d *= e.boss ? 0.2 : e.mid ? 0.45 : 1; const top = g.rowY - RULES.kbMaxReach; if (e.y > top) e.y = Math.max(top, e.y - d); e.atRope = false; } // 보스 · 중간 보스는 덜 밀린다
// 넉백: 위쪽(적이 온 방향)으로 밀어낸다. 총 이동 거리 ≈ dist
// 보스는 안 밀린다. 연달아 맞으면 점점 덜 밀리고, 영웅들 사거리 밖(화면 위쪽)으로는 절대 안 밀려난다
export function applyKnockback(e, dist, g) {
  if (e.boss || e.mid) return;
  if (e.def.traits && e.def.traits.kbImmune) return; // 넉백 면역
  if (e.coachT > 0 && e.shield > 0) return; // 7장 강습 사칭남 보호막: 자세 교정 중엔 안 밀린다
  if (e.env && e.fleeing) return; // 8장: 도망가는 도둑을 위로 밀면 도와주는 꼴 — 안 밀린다
  if (e.dictT > 0) dist *= e.dictKb; // 독재자 곁에서는 잘 안 밀린다
  if (g && g.mapFx.kb) dist *= g.mapFx.kb; // 미끄러운 바닥
  if (g) dist *= g.mods.kbMul; // 밀어내기 달인 카드
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
// 자동 합류 (10/09 긴장감 · 일반 스테이지 · 헬): 합류는 카드가 아니라 정해진 때 덱 순서대로 저절로 — 고르는 횟수를 줄이고 레벨업 카드는 전부 '세지는' 카드로
//  1웨이브 TENSION.pick.auto 초마다 한 명 · 2웨이브부터 웨이브가 시작될 때 한 명씩 (넓은 덱의 5 · 6번째 멤버는 늦게 온다 = 넓은 덱의 값)
export const autoJoinOn = (g) => !!(g && g.joinMode && (g.tension || g.fewPick) && TENSION.pick.auto);
export function autoJoinNext(g) {
  if (!g.joinPool || !g.joinPool.length) return null;
  let at = 0; for (let i = 1; i < g.joinPool.length; i++) if (SLOT_ORDER.indexOf(g.joinPool[i].slot) < SLOT_ORDER.indexOf(g.joinPool[at].slot)) at = i; // 가운데 자리부터 (가운데 = 덱의 핵심 자리)
  const j = g.joinPool.splice(at, 1)[0];
  const h = addHero(g, j.id, j.slot);
  if (h) { h.joinT = 0; ev(g, 'join', { hero: h.id, x: h.x, y: h.y, left: g.joinPool.length, auto: true }); }
  return h;
}
// 다음 레벨업까지 필요한 경험치 (합류 모드는 앞 레벨업이 빠르게 · 2장부터 ×1.6 · 일반 스테이지는 레벨업이 덜 잦은 대신 카드가 크게)
export function expNeedFor(g, lv, join) {
  return Math.round(expNeed(lv) * EXP_NEED_MUL * (join && !((g.tension || g.fewPick) && (TENSION.pick.auto || TENSION.pick.noFast)) ? JOIN.exp[lv - 1] || JOIN.expLate : 1) * (g.mode === 'stage' && chapterOf(g.stage || 1) >= 2 ? BAL.expCh2 : 1) * (g.grow ? GROW.need : 1) * (g.tension ? TENSION.pick.need * ((TENSION.pick.chNeed || [])[chapterOf(g.stage || 1) - 1] || 1) : 1) * (g.wkPick ? TENSION.pick.wk.need * ((TENSION.pick.wk.ch || [])[chapterOf(g.stage || 1) - 1] || 1) : 1));
}
export function gainExp(g, v) {
  g.exp += v;
  while (g.exp >= g.need) {
    g.exp -= g.need;
    g.level++;
    g.need = expNeedFor(g, g.level, g.joinMode);
    g.pendingLevels++;
    if (g.wkPick && TENSION.pick.wk.lvAll) for (const h of g.heroes) if (!h.def.summon && h.lv < 5 && canGrow(g, h)) { h.lv++; ev(g, 'heroLv', { hero: h.id, lv: h.lv, x: h.x, y: h.y }); } // (10/09 주간: 고르기를 줄인 대신 레벨업마다 멤버 전원 Lv+1 — 작은 레벨업 여러 번을 하나로)
    ev(g, 'levelup', { level: g.level });
  }
}

// ─── 웨이브 진행 ──────────────────────────────────────
export function waveDefFor(g, n) {
  if (g.tower) return g.tower.def.waves[Math.min(n, g.tower.def.waves.length) - 1];
  if (g.ev) return g.ev.waves[Math.min(n, g.ev.waves.length) - 1]; // 할로윈 이벤트
  if (g.pvp) return pvpWave(g.pvp.seed, n);
  if (g.weekly) { const d = g.weekly.waves[n - 1] || g.weekly.waves[g.weekly.waves.length - 1]; return g.raid && n > 1 && d.boss ? Object.assign({}, d, { boss: undefined }) : d; }
  return g.mode === 'stage' ? stageWave(g.stage, n) : waveDef(n);
}
// ─── 증강: 셋 중 하나 (15초면 추천 · 1:1 대전은 두 사람이 같은 셋) ───
export function augOptions(g, tier) {
  const have = new Set(g.augs || []);
  const pool = AUGMENTS.filter((a) => a.tier === tier && !have.has(a.id) && !AUG_CUT.includes(a.id));
  const heroes = g.heroes.filter((h) => HERO_AUG[h.id] && !have.has('ha_' + h.id) && !h.def.summon);
  const opts = [];
  const rng = g.pvp ? seedRngLocal((g.pvp.seed | 0) * 31 + g.wave) : g.rng; // 대전: 같은 시드 → 같은 셋
  if (heroes.length && tier !== 'silver') { const h = heroes[(rng() * heroes.length) | 0]; opts.push('ha_' + h.id); }
  while (opts.length < 3 && pool.length) opts.push(pool.splice((rng() * pool.length) | 0, 1)[0].id);
  return opts;
}
function seedRngLocal(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function offerAug(g, tier) {
  const opts = augOptions(g, tier);
  if (!opts.length) return;
  g.augOffer = { opts, tier, t: 15 };
  ev(g, 'augOffer', { opts, tier });
}
export const AUG_STAGE = 0.35; // 스테이지 · 대전 · 주간: 증강 효과를 줄여서 (판이 짧아서 너무 쉬워지지 않게)
export function augDef(id) {
  if (id.startsWith('ha_')) { const h = id.slice(3); return { id, tier: 'gold', icon: '✨', title: HERO_AUG[h], desc: `${(HEROES[h] || SUMMONS[h] || {}).name || h} 전용 — 전용 카드 효과 두 번 + 공격력 +40%`, hero: h }; }
  return AUGMENTS.find((a) => a.id === id);
}
// 증강이 실제로 얼마나 먹히나 (강화 평균 · 무한/스테이지) — 화면도 이 값으로 보여 준다
export function augScale(g) { const hs = g.heroes.filter((h) => !h.def.summon); return (0.7 + (hs.reduce((x, h) => x + (h.meta || 0), 0) / Math.max(1, hs.length)) / 20) * (g.mode === 'endless' ? 1 : AUG_STAGE) * (g.tension ? TENSION.aug : 1); } // (긴장감: 증강 % ×TENSION.aug)
export function applyAug(g, id) {
  if (!g.augOffer || !g.augOffer.opts.includes(id)) return false;
  const a = augDef(id);
  g.augOffer = null;
  (g.augs = g.augs || []).push(id);
  const m = g.mods;
  if (a.hero) {
    const h = hasHero(g, a.hero), hc = HERO_CARDS[a.hero];
    if (h) { for (let k = 0; k < (g.mode === 'endless' ? 2 : 1); k++) { if (hc) { for (const [kk, v] of Object.entries(hc.mul || {})) h.cm[kk] = (h.cm[kk] || 1) * v; for (const [kk, v] of Object.entries(hc.add || {})) h.cm[kk] = (h.cm[kk] || 0) + v; } } h.cmN = (h.cmN || 0) + 2; }
  } else {
    // 강화가 높은 덱일수록 증강이 더 세다 (평균 강화 0 → ×0.7 · 20 → ×1.7) — 무한에서 강한 덱이 더 멀리 가게
    const k = augScale(g);
    const f = {}; for (const [kk, v] of Object.entries(a.fx)) f[kk] = ['dmg', 'spd', 'boss', 'swarm', 'path', 'crit', 'critMul', 'exp'].includes(kk) ? v * k : v;
    if (f.dmg) m.dmg += f.dmg; if (f.spd) m.spd += f.spd; if (f.exp) m.expMul += f.exp;
    const soft = g.mode === 'endless' ? 1 : 0.5;
    if (f.hp) { g.base.max = Math.round(g.base.max * (1 + f.hp * soft)); g.base.hp = g.base.max; }
    if (f.crit) m.crit += f.crit; if (f.critMul) m.critMul += f.critMul;
    if (f.cd) { const c = 1 - (1 - f.cd) * soft; g.cdMul *= c; for (const h of g.heroes) h.skillCd *= c; }
    if (f.swarm) m.swarmDmg += f.swarm; if (f.splash) m.splashMul *= f.splash;
    if (f.boss) m.bossDmg += f.boss; if (f.slow) { m.enemySpd *= f.slow; for (const e of g.enemies) e.speed *= f.slow; } if (f.ctrl) m.ctrlMul *= f.ctrl;
    if (f.ult) m.ultCharge += f.ult; if (f.ultDmg) m.ultDmg += f.ultDmg;
    if (f.echo) for (const h of g.heroes) h.skEvo = true;
    if (f.path) { const top = Object.entries(g.tagW || {}).sort((x, y) => y[1] - x[1])[0]; if (top) { m.tagDmg[top[0]] = (m.tagDmg[top[0]] || 0) + f.path + 0.35; } }
  }
  ev(g, 'aug', { id, title: a.title, tier: a.tier });
  return true;
}
// ─── 무한 도전: 저주 계약 · 자리 비움 방지 이벤트 ───
function offerCurse(g) {
  const have = new Set((g.curses || []).map((c) => c.id));
  const pool = Object.keys(CURSES).filter((k) => !have.has(k));
  if (pool.length === 0) return; // 계약은 종류마다 한 번 (6개 다 받으면 끝)
  const opts = [];
  while (opts.length < 3 && pool.length) opts.push(pool.splice((g.rng() * pool.length) | 0, 1)[0]);
  g.curseOffer = { opts, t: 10 };
  ev(g, 'curseOffer', { opts });
}
export function applyCurse(g, id) {
  const c = CURSES[id];
  if (!c || !g.curseOffer || !g.curseOffer.opts.includes(id)) return false;
  g.curseOffer = null;
  (g.curses = g.curses || []).push({ id });
  g.scoreMul = Math.min(5, (g.scoreMul || 1) * (c.score || 1)); // 계약 배율은 최대 ×5
  g.coinMul = (g.coinMul || 1) * (c.coin || 1);
  if (id === 'fast') g.mods.enemySpd *= 1.2;
  else if (id === 'slowhand') g.mods.spd *= 0.9;
  else if (id === 'twin') g.twinBoss = true;
  else if (id === 'norepair') g.mods.healMul = 0;
  else if (id === 'thick') g.mods.enemyHp *= 1.25;
  else if (id === 'lockone') { const hs = g.heroes.filter((h) => !h.def.summon && !h.locked); const h = hs[(g.rng() * hs.length) | 0]; if (h) { h.locked = true; h.stunT = 1e9; } }
  ev(g, 'curse', { id, name: c.name });
  return true;
}
// 40초마다: "진상 러시! 10초 안에 스킬 2번" 또는 "떨어지는 코인 주머니 3개 누르기" — 못 하면 벌칙 진상 · 배율 초기화
function updateIdleEv(g, dt) {
  if (g.mode !== 'endless' || g.pvp || g.phase !== 'wave') return;
  if (g.curseOffer && (g.curseOffer.t -= dt) <= 0) applyCurse(g, g.curseOffer.opts[(g.rng() * g.curseOffer.opts.length) | 0]);
  const e = g.idleEv;
  if (!e) { g.idleT = (g.idleT == null ? 40 : g.idleT) - dt; if (g.idleT <= 0 && g.wave >= 3) startIdleEv(g); return; }
  e.t -= dt;
  if (e.kind === 'bags') for (const b of g.bags) b.y += 70 * dt;
  const ok = e.kind === 'rush' ? e.got >= e.need : g.bags.length === 0;
  if (ok || e.t <= 0) endIdleEv(g, ok);
}
function startIdleEv(g) {
  const kind = g.rng() < 0.5 ? 'rush' : 'bags';
  g.idleEv = { kind, t: kind === 'rush' ? 10 : 8, need: 2, got: 0 };
  if (kind === 'bags') g.bags = Array.from({ length: 3 }, () => ({ x: 40 + g.rng() * (g.W - 80), y: 60 + g.rng() * 80, id: g.uid++ }));
  ev(g, 'idleEv', { kind });
}
function endIdleEv(g, ok) {
  const e = g.idleEv; g.idleEv = null; g.bags = []; g.idleT = 36 + g.rng() * 8;
  if (ok) { g.streak = Math.min(2, (g.streak || 1) + 0.2); g.stats.score += 500 * g.wave; }
  else { g.streak = 1; pvpIncoming(g, 'small'); }
  ev(g, 'idleEnd', { ok, kind: e.kind, streak: g.streak });
}
// 코인 주머니 누르기 (화면 좌표 = 게임 좌표)
export function tapBag(g, x, y) {
  if (!g.bags || !g.bags.length) return false;
  const i = g.bags.findIndex((b) => Math.hypot(b.x - x, b.y - y) < 34);
  if (i < 0) return false;
  const b = g.bags.splice(i, 1)[0];
  ev(g, 'bagTap', { x: b.x, y: b.y, left: g.bags.length });
  return true;
}
export function startWave(g, n) {
  g.wave = n;
  // 합류 보장: 2웨이브부터 웨이브마다 공짜 합류 카드 1장 (레벨업이 줄어 6명 덱인데 4~5명만 들어오던 문제)
  if (autoJoinOn(g) && n >= 2) for (let k = 0; k < (TENSION.pick.perWave || 1); k++) autoJoinNext(g);
  else if (g.joinMode && g.mode === 'stage' && n >= 2 && g.joinPool.length && (!g.tension || TENSION.pick.freeWaves.includes(n))) { g.pendingLevels++; g.joinDue = (g.joinDue | 0) + 1; ev(g, 'freeJoin', {}); }
  if (g.mode === 'endless' && n > 1 && (n - 1) % 5 === 0 && !g.pvp) offerCurse(g);
  if ((g.tension || g.wkPick) && TENSION.pick.augW) { const AW = g.wkPick ? TENSION.pick.wk.augW : TENSION.pick.augW; if (AW[n]) offerAug(g, AW[n]); } // (긴장감: 증강은 TENSION.pick.augW 웨이브에만 — 고르는 횟수 줄이기)
  else if (g.mode === 'endless' ? n % 5 === 3 : [1, 3, 4].includes(n)) offerAug(g, g.mode === 'endless' ? (n >= 13 ? 'prism' : n >= 8 ? 'gold' : 'silver') : n === 1 ? 'silver' : n === 3 ? 'gold' : 'prism'); // 프리즘은 4웨이브 (5 → 4: 늦게 떠서 체감이 적었음)
  const def = waveDefFor(g, n);
  if (g.wk) g.wk.waveStart(g, n, def); // 주간: 웨이브 사건 알림 · 저주 웨이브 규칙
  g.diff = def.level || n;
  g.hpScale = (def.hpScale || 1) * (g.tempo && !g.raid ? (g.hell ? TEMPO.hellHp * (TEMPO.hellCh[chapterOf(g.stage) - 1] || 1) : g.mode === 'endless' ? TEMPO.endHp : TEMPO.hp) : 1) * (g.joinMode && g.mode === 'stage' && !g.weekly ? JOIN.hp[chapterOf(g.stage) - 1] || 1 : 1); // 합류 모드 챕터 보정
  if (g.slow) g.hpScale *= SLOW_RUN.hp * (g.mode === 'stage' && !g.weekly ? SLOW_RUN.chHp[chapterOf(g.stage || 1) - 1] || 1 : 1); // 느린 판: 적게 · 단단하게 (장마다 맞춤)
  if (g.conds.length && n >= DOOR_PRESSURE.from) g.hpScale *= COND_HP[chapterOf(g.stage) - 1] || 1; // 조건 스테이지: 기믹만큼 체력은 덜어 준다
  if (g.tension) g.hpScale *= TENSION.chHp[chapterOf(g.stage || 1) - 1] || 1; // 긴장감: 장마다 다시 맞춘 체력 (2장부터 더 어렵게)
  if (g.tension && n >= TENSION.hpFrom) g.hpScale *= 1 + (TENSION.hp - 1) * (g.cond.swarm ? TENSION.swarmK : 1); // 긴장감: 팀이 모인 뒤 (2웨이브부터) 진상이 단단 — 평타만으로는 밀리고 스킬로 뒤집는다 · 떼거리는 수로 누르니 덜
  if (g.pvp) g.hpScale *= pvpMatchHp(g.pvp.hp, n) * pvpWaveHp(n) * hpMul(PVP_END.baseLevel, g.mode === 'stage') / hpMul(Math.max(1, g.diff), g.mode === 'stage'); // 1:1 대전: 두 덱 전투력 × 웨이브마다 ×1.22 (체력 오름은 이것 하나로 · 공격력은 웨이브대로)
  g.lastSnap = snapshot(g); // 뒤로 가기·새로고침 뒤 '이어하기' 용 (이 웨이브 시작 상태)
  const q = [];
  const more = g.mapFx.spawn || 1;
  // 무한 도전: 웨이브가 갈수록 떼로 (×1.3 → 30웨이브 ×3.0) · 주간 도전 ×2
  const swarm = (g.mode === 'endless' ? 1.3 + 1.7 * Math.min(1, (n - 1) / 29) : g.weekly ? 2 : 1) * (g.hell ? HELL.count : 1) * (g.tempo && !g.raid ? TEMPO.count : 1) * (g.slow ? SLOW_RUN.count : 1) * (g.cond.swarm ? COND.swarm.count : 1); // 떼거리 조건: 약한 진상이 훨씬 많이
  for (const [type, count0, every0, delay, tag] of def.g) {
    const wc = g.wtr && g.wtr.count && !ENEMIES[type].boss && !ENEMIES[type].mid ? g.wtr.count : 1; // 주간 떼거리: 보스는 그대로
    const count = Math.round(count0 * more * swarm * wc), every = every0 / (more * swarm * wc);
    const pack = ENEMIES[type].pack;
    const elite = tag === 'E';
    const hpX = elite ? def.eliteHp || 1 : (def.fodderHp || 1) * (g.cond.swarm ? COND.swarm.hp : 1);
    let laneX = 0;
    // 7장 리프트 새치기꾼: 두세 명이 한 줄로 바짝 (정예 웨이브에서도 무리로)
    const grp = ENEMIES[type].group;
    if (grp) {
      for (let i = 0; i < count; i++) {
        const at = delay + i * every + g.rng() * every * 0.5;
        const n = grp.min + ((g.rng() * (grp.max - grp.min + 1)) | 0);
        const x0 = 40 + g.rng() * (g.W - 80);
        for (let j = 0; j < n; j++) q.push({ type, at: at + j * grp.gap, hpX, elite: elite || undefined, x: clamp(x0 + (g.rng() - 0.5) * 10, 20, g.W - 20) });
      }
      continue;
    }
    // 떼거리: 5명씩 한 줄로 바짝 붙어서 (범위 공격 한 방에 여럿)
    if (def.clump && !elite && !pack) {
      let cx = 0, at0 = 0;
      for (let i = 0; i < count; i++) {
        if (i % 5 === 0) { cx = 36 + g.rng() * (g.W - 72); at0 = delay + (i / 5) * every * 5 + g.rng() * every; }
        q.push({ type, at: at0 + (i % 5) * 0.16, x: clamp(cx + (g.rng() - 0.5) * 20, 20, g.W - 20), hpX });
      }
      continue;
    }
    for (let i = 0; i < count; i++) {
      const at = delay + i * every + g.rng() * every * 0.5;
      if (elite) { q.push({ type, at, hpX, elite: true }); continue; }
      // 셋 중 하나는 같은 줄로 줄줄이 (관통 · 줄 공격 · 범위가 빛나게)
      if (!pack) { if (i % 3 === 0) laneX = g.rng() < 0.5 ? g.slotX[(g.rng() * g.slotX.length) | 0] + (g.rng() - 0.5) * 16 : 0; q.push({ type, at, hpX, x: laneX && i % 3 !== 0 ? clamp(laneX + (g.rng() - 0.5) * 18, 20, g.W - 20) : undefined }); continue; }
      // 인피 패거리: 3~5명이 한 덩어리로
      const n = pack.min + ((g.rng() * (pack.max - pack.min + 1)) | 0);
      const x0 = 50 + g.rng() * (g.W - 100);
      for (let j = 0; j < n; j++) q.push({ type, at: at + j * 0.06, hpX, x: clamp(x0 + (j - (n - 1) / 2) * 20 + g.rng() * 6, 20, g.W - 20) });
    }
  }
  if (g.slow) for (const o of q) o.at *= SLOW_RUN.gap; // 느린 판: 진상이 띄엄띄엄
  if (def.boss) q.push({ type: def.boss, at: 1.2, boss: true, bossHp: def.bossHp });
  if (def.boss && g.twinBoss) q.push({ type: def.boss, at: 3.5, boss: true }); // 저주 계약 '보스 둘'
  if (def.mid) q.push({ type: def.mid, at: 4, boss: true, mid: true, bossHp: def.midHp }); // (midHp: 할로윈 이벤트 — 머릿수를 줄인 체력 보정을 중간 보스는 빼고)
  if (def.boss2) q.push({ type: def.boss2, at: g.mode === 'stage' ? (g.slow ? 22 : 14) : 26, boss: true, bossHp: def.boss2Hp, second: true });
  if (g.wk) g.wk.shapeQ(g, def, q); // 주간: 기습(옆길) · 보물 도둑 · 계약 정예
  g.waveFodder = [...new Set(q.filter((o) => !o.boss && !o.elite && ENEMIES[o.type] && !ENEMIES[o.type].boss && !ENEMIES[o.type].mid).map((o) => o.type))];
  if (g.tension && def.boss && [5, 10].includes(((g.stage - 1) % 10) + 1)) { let k = 0; for (let i = q.length - 1; i >= 0; i--) if (!q[i].boss && !q[i].elite && (k++ % Math.round(1 / TENSION.bossWave.filler)) !== 0) q.splice(i, 1); } // 보스 웨이브: 졸개는 덜 (보스가 주인공)
  q.sort((a, b) => a.at - b.at);
  g.spawnQ = q;
  g.spawnI = 0;
  g.waveT = 0;
  if (def.boss) {
    g.phase = 'intro';
    g.phaseT = RULES.bossIntroSec;
    ev(g, 'bossIntro', { wave: n, enemy: def.boss, enemy2: def.boss2 || null });
  } else g.phase = 'wave';
  g.waveKind = def.kind || 'N';
  ev(g, 'waveStart', { wave: n, boss: !!def.boss, count: q.length, kind: g.waveKind });
}

function waveClear(g) {
  if (g.wk) g.wk.onClear(g); // 주간: 웨이브 목표 · 무피해 · 계약 제안
  const s = g.stats;
  for (const h of g.heroes) if (h.pump) h.pump = 0; // 백인규 근육 펌프는 웨이브마다 처음부터
  for (const h of g.heroes) if (h.def.grow) { growBy(h, h.def.grow.perWave); ev(g, 'grow', { hero: h.id, x: h.x, y: h.y, v: Math.round(h.grow * 100) }); }
  s.wavesCleared = Math.max(s.wavesCleared, g.wave);
  if (!g.ultOpen) { g.ultOpen = true; if (g.heroes.some((h) => h.def.skill && h.def.skill.cd >= ULT_LOCK.cd)) ev(g, 'ultOpen', {}); } // 큰 한 방 스킬 풀림
  s.score += Math.round(g.diff * SCORE.wavePer);
  vacuumGems(g);
  ev(g, 'waveClear', { wave: g.wave, last: g.wave >= g.totalWaves });
  const done = g.mode === 'stage' ? g.wave >= g.totalWaves : g.wave === RULES.waves && !g.endless;
  if (done) {
    g.victory = true;
    const hpFrac = g.base.hp / g.base.max;
    if (g.mission) { g.cstat.combo = g.stats.maxCombo; g.cstat.endDoor = hpFrac; g.mission.ok = missionOk(g.mission, g.cstat); }
    g.stars = starsFor(hpFrac, g.mission ? g.mission.ok : true);
    s.score += (g.mode === 'stage' ? SCORE.stageClear : SCORE.victory) + Math.round(hpFrac * 100) * SCORE.hpPct;
    g.phase = 'victory';
    ev(g, 'victory', { stars: g.stars });
  } else {
    g.phase = 'break';
    g.phaseT = g.mode === 'stage' ? RULES.stageBreakSec : RULES.breakSec;
    if (g.tension && TENSION.repair.frac > 0 && g.base.hp < g.base.max) { const v = Math.min((g.base.max - g.base.hp) * TENSION.repair.frac, g.base.max * TENSION.repair.cap) * (g.hell ? HELL.repair : 1) * (g.repairX || 1) + Math.min(g.base.max - g.base.hp, g.base.max * TENSION.wide.repair * Math.max(0, g.heroes.filter((o) => !o.def.summon && !o.gone).length - TENSION.wide.from + 1)); g.base.hp = Math.min(g.base.max, g.base.hp + v); ev(g, 'heal', { x: g.W / 2, y: g.ropeY, v: Math.round(v), repair: true }); } // 긴장감: 웨이브 사이 입구 수리
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
  if (g.mom !== null && g.mom !== undefined) { if (g.mom < MOMENTUM.ult) { ev(g, 'noMomentum', { ult: true }); return false; } g.mom -= MOMENTUM.ult; }
  g.ult = 0;
  const dmg = RULES.ultDamage * (1 + 0.22 * g.diff) * g.mods.ultDmg;
  buildGrid(g);
  for (const e of g.enemies.slice()) {
    if (e.dead) continue;
    damageEnemy(g, e, e.boss ? dmg * 1.5 : dmg, false, null, true);
    if (!e.dead && !e.boss) { applyKnockback(e, 40, g); e.stunT = Math.max(e.stunT, 0.7); }
  }
  ev(g, 'ult', {});
  if (g.speech) ch8SpeechStop(g, g.speech, 'ult'); // 8장: 총공지로 축사 끊기
  if (g.avalanche) ch7Interrupt(g, 'ult');
  return true;
}

// 맵 효과 시계: 정전(가끔 불 꺼짐) · 인피 확성기(가끔 진상 가속)
function updateMapFx(g, dt) {
  const fx = g.mapFx;
  if (g.strobeT > 0) g.strobeT -= dt;
  // 캠프파이어: 가운데 모닥불 곁을 지나는 진상이 불탄다
  if (fx.fire && g.phase === 'wave') {
    g.fireT = (g.fireT || 0) - dt;
    if (g.fireT <= 0) {
      g.fireT = 0.25;
      forEnemiesNear(g, fx.fire.x, g.ropeY - 90, fx.fire.r, (e) => { damageEnemy(g, e, fx.fire.dps * 0.25 * (1 + 0.15 * g.diff), false, null, true); return true; });
    }
  }
  if (!fx.every || g.phase === 'test') return;
  if (g.darkT > 0) { g.darkT -= dt; if (g.darkT <= 0) ev(g, 'lightsOn', {}); }
  if (g.megaT > 0) g.megaT -= dt;
  if (g.phase !== 'wave') return;
  g.fxT += dt;
  if (g.fxT >= fx.every) {
    g.fxT = 0;
    if (fx.id === 'blackout') { g.darkT = fx.dark; ev(g, 'blackout', {}); }
    if (fx.id === 'megaphone') { g.megaT = fx.sec; ev(g, 'megaphone', {}); }
    if (fx.id === 'wind') { g.windX = g.windX > 0 ? -fx.wind : fx.wind; ev(g, 'wind', { dir: g.windX > 0 ? 1 : -1 }); }
    if (fx.id === 'lightshow') { g.strobeT = fx.strobe; ev(g, 'strobe', {}); }
  }
}

// ─── 액티브 스킬 (스킬 바) ─────────────────────────────
export function skillReady(h) { return !!h.def.skill && h.skillCd <= 0 && !ultLocked(h._g, h); }
// 큰 한 방 스킬은 첫 웨이브가 끝나야 (스테이지 · 무한 · 주간 — 1:1 대전 · 레이드 · 탑 · 테스트 판은 그대로)
export function ultLocked(g, h) { return !!(g && h && h.def.skill && h.def.skill.cd >= ULT_LOCK.cd && !g.ultOpen && !g.pvp && !g.raid && !g.tower && !g.noWaves && g.phase !== 'test' && (g.mode === 'stage' || g.mode === 'endless') && (g.wave | 0) <= 1); }
// x, y: 찍은 곳 (target 스킬만). 성공하면 true
export const momCharges = (g) => (g.mom === null || g.mom === undefined ? 9 : Math.floor(g.mom / MOMENTUM.per));
// 스킬로 준 피해는 화면에 금빛 큰 숫자 (g._inSkill 동안)
// 여지원 모자이크 폭격: 자기 줄 + 양옆 줄 (끝 칸이면 안쪽으로 한 칸 밀어 늘 세 줄) · 칸 가운데 x
export function mosaicLanes(g, h) {
  const X = g.slotX; let c = 0;
  for (let i = 1; i < X.length; i++) if (Math.abs(X[i] - h.x) < Math.abs(X[c] - h.x)) c = i;
  const m = Math.max(1, Math.min(X.length - 2, c));
  return [c, ...[m - 1, m, m + 1].filter((i) => i !== c)].slice(0, 3).map((i) => X[i]); // 자기 줄 먼저 → 왼쪽 → 오른쪽
}
// 모자이크 상태: 5초 · 방어 −40% · 모든 멤버에게 받는 피해 +25% (다시 맞으면 시간만 새로 · 겹치지 않음)
export function applyMosaic(g, e, sk) {
  e.brkT = Math.max(e.brkT || 0, sk.sec); e.brkArmor = sk.brkArmor; e.brkDmg = sk.brkDmg;
  e.healBlockT = Math.max(e.healBlockT || 0, sk.sec);
}
// 문동한 카페인 풀충전: 다음 자리 고르기 — 진상이 제일 몰린 곳 (방금 친 곳 근처는 피해서) · 가끔은 아무 진상 (제라스 궁처럼 여기저기)
function cafeSpot(g, h, r) {
  const hot = h.cafe.hot, live = g.enemies.filter((e) => !e.dead && e.y > 10 && e.y < g.ropeY + 20);
  if (!live.length) return null;
  const far = (e) => hot.every((p) => Math.hypot(e.x - p[0], e.y - p[1]) > r * 1.2);
  let best = null, bn = 0;
  for (const e of live) {
    if (!far(e)) continue;
    let n = 0;
    for (const o of live) if (Math.hypot(o.x - e.x, o.y - e.y) <= r) n += o.boss ? 3 : 1;
    if (n > bn) { bn = n; best = e; }
  }
  if (!best || (bn <= 1 && g.rng() < 0.5)) best = live[(g.rng() * live.length) | 0];
  // 움직이는 진상: 떨어질 때쯤 있을 자리로 조금 앞을 본다
  const lead = (best.stunT > 0 || best.y >= (best.stopY || 1e9) - 2 ? 0 : 0.6) * (best.speed || 0) * h.def.skill.delay;
  return { x: clamp(best.x + (g.rng() - 0.5) * r * 0.3, 16, g.W - 16), y: Math.min(g.ropeY, best.y + lead) };
}
function cafeTick(g, h, dt) {
  const sk = h.def.skill, q = h.cafe;
  q.t += dt;
  const r = sk.r[q.lv];
  while (q.left > 0 && q.t >= q.next) {
    q.next += sk.gap;
    const p = cafeSpot(g, h, r);
    if (!p) { q.idle = (q.idle || 0) + sk.gap; if (!g.enemies.some((e) => !e.dead) || q.idle > 2.5) q.left = 0; break; } // 칠 진상이 아직 없으면 잠깐 아껴 둔다 (2.5초 넘게 없으면 끝)
    q.left--;
    q.q.push({ x: p.x, y: p.y, t: sk.delay });
    q.hot.push([p.x, p.y]); if (q.hot.length > 2) q.hot.shift();
    h.lastShotT = g.t; h.cafeShot = (h.cafeShot || 0) + 1;
    ev(g, 'cafeMark', { hero: h.id, x: p.x, y: p.y, r, t: sk.delay, hx: h.x, hy: h.y });
  }
  for (const b of q.q) {
    b.t -= dt;
    if (b.t > 0) continue;
    let n = 0;
    buildGrid(g);
    forEnemiesNear(g, b.x, b.y, r, (e) => {
      damageEnemy(g, e, q.base * sk.mul[q.lv] * (e.boss ? 0.8 : 1), false, h, true);
      if (!e.dead) { n++; if (!e.boss) e.stunT = Math.max(e.stunT, sk.daze * stunMul(e)); }
      return true;
    });
    ev(g, 'cafeDrop', { hero: h.id, x: b.x, y: b.y, r, n });
  }
  q.q = q.q.filter((b) => b.t > 0);
  if (q.left <= 0 && !q.q.length) { h.cafe = null; h.cafeT = Math.min(h.cafeT, 0.35); ev(g, 'cafeEnd', { hero: h.id, x: h.x, y: h.y }); }
}
function mosaicTick(g, h, dt) {
  const sk = h.def.skill;
  for (const q of h.mzQ) {
    q.t += dt;
    while (q.i < q.lanes.length && q.t >= sk.wind + q.i * sk.gap) {
      const lx = q.lanes[q.i++]; let n = 0, sy = 0;
      const hit = q.hit || (q.hit = new Set());
      for (const e of g.enemies.slice()) {
        if (e.dead || hit.has(e) || e.y < -20 || e.y > h.y || Math.abs(e.x - lx) > q.w + (e.r || 14) * 0.5) continue;
        hit.add(e); n++; sy += e.y;
        applyMosaic(g, e, sk);
        damageEnemy(g, e, q.base * sk.mul[q.lv], false, h, false); // 한 명씩 내려치는 손 (범위 면역도 맞는다)
        if (!e.dead) { if (!e.boss) e.stunT = Math.max(e.stunT, sk.stun * stunMul(e) * g.mods.ctrlMul); else { e.slowT = Math.max(e.slowT, 1); e.slowMul = Math.min(e.slowMul || 1, 0.7); } } // 보스는 기절 대신 잠깐 느려짐
      }
      ev(g, 'mosaicSlam', { hero: h.id, x: lx, y: n ? sy / n : g.ropeY - 220, w: q.w, n, k: q.i - 1, echo: q.echo });
    }
  }
  h.mzQ = h.mzQ.filter((q) => q.i < q.lanes.length);
}
export function castSkill(g, h, x, y, echo, fromQ) { g._inSkill = true; try { const ok = castSkill0(g, h, x, y, echo, fromQ); if (ok && !echo && g.avalanche) ch7Interrupt(g, h.id); return ok; } finally { g._inSkill = false; } } // 7장: 눈사태 예고 중 스킬 → 끊기
function castSkill0(g, h, x, y, echo, fromQ) {
  const sk = h.def.skill;
  if (!sk || (!echo && h.skillCd > 0) || g.over || g.phase === 'victory') return false;
  if (!echo && ultLocked(g, h)) { ev(g, 'ultLocked', { hero: h.id, x: h.x, y: h.y }); return false; } // 첫 웨이브가 끝나야
  if (!echo && h.kdT > 0) { ev(g, 'kdNoSkill', { hero: h.id, x: h.x, y: h.y }); return false; } // 쓰러진 멤버는 스킬도 못 쓴다
  if (!echo && h.muteT > 0 && h.silenceT > 0) { ev(g, 'c7muted', { hero: h.id, x: h.x, y: h.y }); return false; } // 7장 펜션 사장님 "소음 금지!": 침묵 중엔 스킬을 못 쓴다 (응급처치 · 알디콤으로 풀기)
  if (!echo && g.mom !== null && g.mom !== undefined) {
    if (g.mom < MOMENTUM.per * (sk.id === 'forlangbang' ? 2 : 1)) { ev(g, 'noMomentum', { hero: h.id, two: sk.id === 'forlangbang', x: h.x, y: h.y }); return false; }
    if (g.t - g.lastSkillT < MOMENTUM.gap && !fromQ) { g.skillQ = { h, x, y, at: g.lastSkillT + MOMENTUM.gap }; ev(g, 'skillQueued', { hero: h.id }); return false; } // 0.6초 뒤에 나간다
  }
  const lv = h.lv - 1;
  const base = heroDamage(g, h) * (1 + (h.gear.skill || 0)) * (echo && echo !== 'sig' ? 0.75 : 1) * (g.mom !== null && g.mom !== undefined ? MOMENTUM.skillDmg : 1) * (g.tension ? TENSION.skill / roleCadence(h.id).dmg * (g.mods.skillX || 1) / (g.mods.basicX || 1) : 1) * (1 + (h.skDmg || 0) + (h.awake >= 2 ? TOWER_AWAKE_FX.skill : 0));
  const sa = h.sa || {}; // 멤버 전용 스킬 증강
  if (h.skEvo && !echo && h.id !== 'hanna') h.echoSk = { t: 0.5, x: x !== undefined ? clamp(x + (x < g.W / 2 ? 95 : -95), 20, g.W - 20) : x, y };
  buildGrid(g);
  // 줄 스킬은 사거리 안에 진상이 없으면 아껴 둔다 (쿨타임 안 씀)
  if ((sk.id === 'frenzy' && x === undefined && !bestLineAngle(g, h.x, h.y, heroRange(g, h), 12)) || (sk.id === 'blackhole' && x === undefined && !densestPoint(g, h.x, h.y, h.def.range + 80, sk.r[h.lv - 1]))) { ev(g, 'skillHold', { hero: h.id, x: h.x, y: h.y }); return false; }
  let r = 0;
  switch (sk.id) {
    case 'rally':
      g.rallyT = sk.sec[lv] + (sa.rally ? 3 : 0); g.rallySpd = sk.spd[lv] + (sa.rally ? 0.2 : 0); g.rallyDmg = 0; g.rallyBy = h.id; g.rallyHeal = 0; // (공격력 +20% · Lv5 입구 회복은 뺐다: 공격력 버프는 이호찬 · 강병화 · 김도훈, 입구 수리는 홍정민 — 방장은 공속 · 지목)
      for (const e of g.enemies) if (!e.dead && !e.boss && e.y > 0) pushUp(g, e, 40);
      if (h.sig && h.sig.rallyCd) { for (const o of g.heroes) if (o !== h && o.skillCd > 0) o.skillCd *= 1 - h.sig.rallyCd; ev(g, 'sigFx', { hero: h.id, x: h.x, y: h.y }); } // 방장 전용 신화: 모두 스킬 쿨 절반
      ev(g, 'buffAura', { kind: 'rally', sec: sk.sec[lv] });
      break;
    case 'redcard': { // 운영진 레드카드 퇴장: 찍은 곳에서 제일 입구에 가까운 진상 하나를 "퇴장!" (멀리 쫓아내고 2초 기절 · 경고 가득) · 범위 안 진상은 보호막 · 버프 깨지고 느려진다
      const P = aimAt(g, h, x, y, sk.r[lv]); x = P.x; y = P.y;
      r = sk.r[lv];
      let main = null;
      forEnemiesNear(g, x, y, r, (e) => {
        if (e.shield > 0 || e.dictT > 0 || e.gaoOn || e.goodsOn) ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 });
        if (e.cLay > 0) { ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 }); if (g.cstat) g.cstat.breaks++; } e.cLay = 0; e.shield = 0; e.dictT = 0; e.gaoOn = false; e.goodsOn = false; e.noShieldT = 4; e.auraOffT = 4; // 레드카드: 보호막·버프 깨기
        if (!e.boss && !e.mid && (!main || e.y > main.y)) main = e;
        return true;
      });
      forEnemiesNear(g, x, y, r, (e) => {
        damageEnemy(g, e, base * sk.dmgMul * (e === main ? 1 : 0.45), false, h, e !== main);
        if (!e.dead) { e.slowT = Math.max(e.slowT, sk.slowSec * (e.boss ? 0.5 : 1)); e.slowMul = e.boss ? 0.7 : 0.45; }
        return true;
      });
      if (main && !main.dead) { const y0 = main.y; pushUp(g, main, sk.eject); main.stunT = Math.max(main.stunT, sk.ejectStun * stunMul(main)); main.warnN = 0; ev(g, 'sendOff', { x: main.x, y0, y1: main.y, hero: h.id }); }
      if (sa.redchain && !echo) redChain(g, h, x, y, r, base * sk.dmgMul * 0.8, sk); // 레드카드 연쇄
      ev(g, 'redcard', { x, y, r, hx: h.x, hy: h.y - 40 });
      break;
    }
    case 'frenzy': { // 건전남 퀵드로우: 찍은 쪽으로 권총 연사 (자동이면 가장 몰린 쪽)
      const b = x !== undefined ? { a: Math.atan2(y - (h.y - 30), x - h.x) } : bestLineAngle(g, h.x, h.y, heroRange(g, h), 12);
      if (!b) { ev(g, 'skillHold', { hero: h.id, x: h.x, y: h.y }); return false; }
      h.frenzyT = sk.sec[lv] + (sa.frenzy ? 0.6 : 0); h.frenzyCd = 0.15; h.aimA = b.a; h.aimT = g.t; h.aimFix = x !== undefined; // 0.15초 조준선 뒤 발사
      ev(g, 'aimLine', { x: h.x, y: h.y, a: b.a, len: heroRange(g, h) });
      break;
    }
    case 'dive': { // 박나영 용의 급강하: 날아올라 찍은 곳에 내리꽂힘 (그림자 예고 → 쾅) · 불꽃 고리
      const P = aimAt(g, h, x, y, sk.r[lv]); r = sk.r[lv];
      (g.zones || (g.zones = [])).push({ kind: 'dive', x: P.x, y: P.y, r, t: sk.air, max: sk.air, dmg: base * sk.mul[lv], hero: h, kb: sk.kb, ring: sk.ring, twin: !!sa.twin && !echo });
      ev(g, 'diveUp', { x: h.x, y: h.y, tx: P.x, ty: P.y, r, air: sk.air });
      x = P.x; y = P.y;
      break;
    }
    case 'firstaid': { // 건전녀 응급 방패: 멤버 전원에게 하트 방패 — 상태이상 해제 · 기진맥진 풀기 · 잠깐 면역 · 다른 멤버 스킬 쿨 −2초 (입구 방패는 이제 없음: 입구는 홍정민)
      const imm = sk.imm[lv] + (sa.aegis ? 1.5 : 0), cdCut = sk.cdCut + (sa.aegis ? 1 : 0);
      if (sk.door && !g.pvp) { const v = healDoor(g, h.id, g.base.max * sk.door[lv] * (g.mods.healMul || 1)); if (v > 0) ev(g, 'heal', { x: g.W / 2, y: g.ropeY, v: Math.round(v), hero: h.id, big: true }); } // (10/08) 응급 방패: 입구도 한 뭉텅이
      for (const o of g.heroes) {
        cleanseHero(o); o.ccImmT = Math.max(o.ccImmT || 0, imm); o.heartT = imm; o.cheerT = Math.max(o.cheerT || 0, 4); // heartT: 하트 방패 표시 · "힘내요!" 4초
        if (o.tiredT > 0) o.tiredT = 0;
        if (o !== h && o.skillCd > 0) o.skillCd = Math.max(0, o.skillCd - cdCut);
        if (g.kdOn) { kdRevive(g, o); if (o.kd > 0) o.kd *= 0.5; } // 쓰러짐: 바로 일으키고 게이지 절반
      }
      ev(g, 'heartShield', { x: h.x, y: h.y, sec: imm, heroes: g.heroes.map((o) => [o.x, o.y]) });
      ev(g, 'cleanse', { x: h.x, y: h.y });
      break;
    }
    case 'oneshot':
      if (h.rage) h.rageT += 5;
      else { h.rage = true; h.rageT = h.def.rageSec[lv] * (g.mapFx.rage || 1) * ((h.sig && h.sig.rageMul) || 1); ev(g, 'rage', { hero: h.id, x: h.x, y: h.y }); }
      break;
    case 'mosaicbomb': { // 여지원 모자이크 폭격: 0.6초 두 손 번쩍(검은 검열 띠 · 삐—) → 찍은 줄 · 양옆 줄에 거대 모자이크 손이 차례로 쾅 (updateHeroes 의 mzQ)
      r = 0;
      const lanes = mosaicLanes(g, x !== undefined ? { x } : h);
      (h.mzQ || (h.mzQ = [])).push({ t: 0, i: 0, lanes, base: base * (sa.wide ? 1.4 : 1), lv, w: sk.w * (sa.wide ? 1.5 : 1), echo: !!echo });
      ev(g, 'mosaicCast', { hero: h.id, x: h.x, y: h.y, lanes, wind: sk.wind, gap: sk.gap, echo: !!echo });
      break;
    }
    case 'marry': { // 정원식: 결정사 상담 — 걸어 나가서 앉는다 (앉으면 도발)
      if (!h.wsSt) { h.wsSt = 'walk'; h.px = h.x; h.py = h.y; }
      r = sk.consult.r * (sa.consult ? 1.4 : 1);
      ev(g, 'marry', { x: h.x, y: h.y, r, v: 0 });
      break;
    }
    case 'winkbomb':
      if (h.skEvo && sk.beam) heartBeam(g, h, base * sk.beam.mul, sk.beam);
      r = sk.r[lv] * (sa.wbomb ? 1.35 : 1);
      forEnemiesNear(g, x, y, r, (e) => {
        damageEnemy(g, e, base, false, h, true);
        if (e.dead || e.boss || e.def.charmImmune) return true;
        if (e.gender === 'm') { applyKnockback(e, sk.kb * (sa.wbomb ? 1.3 : 1), g); ev(g, 'wink', { x: e.x, y: e.y - 26, male: true }); } else { e.stunT = Math.max(e.stunT, (sk.stun + (sa.wbomb ? 0.8 : 0)) * stunMul(e)); ev(g, 'wink', { x: e.x, y: e.y - 26, male: false }); }
        return true;
      });
      break;
    case 'blackhole': { // 강성구: 지팡이 블랙홀 — 찍은 곳(안 찍으면 가장 몰린 곳)에 소용돌이 → 빨아들이며 따끔 → 쾅
      const r0 = sk.r[lv] * (sa.bighole ? 1.35 : 1);
      const c = x !== undefined ? { x, y } : densestPoint(g, h.x, h.y, h.def.range + 80, r0) || { x: h.x, y: g.ropeY - 160 };
      const px = c.x, py = c.y;
      g.holes = g.holes || [];
      g.holes.push({ x: px, y: py, r: r0 * 1.6, core: r0, t: sk.sec, tick: 0, dmg: base * 0.22, boom: base * sk.boom[lv] * (sa.bighole ? 1.4 : 1), hero: h, hit: 0 });
      ev(g, 'bhStart', { x: px, y: py, r: r0 * 1.6 });
      break;
    }
    case 'whirl': {
      const n = sk.n[lv];
      const bw = bestLineAngle(g, h.x, h.y, h.def.range + 60, 16);
      const mid = bw ? Math.max(-Math.PI + 1.3, Math.min(-1.3, bw.a)) : -Math.PI / 2;
      ev(g, 'aimLine', { x: h.x, y: h.y, a: mid, len: h.def.range + 60 });
      for (let i = 0; i < n; i++) {
        const a = mid + (i - (n - 1) / 2) * (2.6 / (n - 1)); // 지팡이 회오리: 가장 몰린 쪽을 가운데로 한 넓은 부채꼴
        spawnProj(g, 'cane', h, null, base * 1.2, { angle: a, pierce: Infinity, spin: 16, maxDist: h.def.range + 60, r: 16 });
      }
      break;
    }
    case 'encore': { // 김도훈 무한 앵콜: 찍은 곳에 미러볼 무대 → 무대 위 진상 춤추며 멈춤 + 피해 · 멤버 상태이상 해제 · 팀 공속 · 떼창 게이지 가득
      for (const o of g.heroes) { o.stunT = 0; o.charmT = 0; o.rumorT = 0; o.fearT = 0; o.paperT = 0; o.vomitT = 0; o.blindT = 0; o.drowsyT = 0; if (o.grabT > 0) { o.grabT = 0; o.grabBy = 0; } }
      r = (Array.isArray(sk.r) ? sk.r[lv] : sk.r) * (sa.medley ? 1.3 : 1);
      const P = aimAt(g, h, x, y, r); x = P.x; y = P.y;
      forEnemiesNear(g, x, y, r, (e) => {
        if (sk.mul) damageEnemy(g, e, base * sk.mul, false, h, true);
        if (e.dead) return true;
        if (e.boss) { e.slowT = Math.max(e.slowT, sk.dance[lv]); e.slowMul = 0.5; } else { e.stunT = Math.max(e.stunT, sk.dance[lv] * stunMul(e)); e.danceT = Math.max(e.danceT || 0, sk.dance[lv]); }
        return true;
      });
      if (h.def.crowd) h.crowd = 99.9;
      // 앵콜 떼창: 잠깐 멤버 전원 공속 · 피해 업 (방장 '집합!'과 겹치면 센 쪽)
      const bsec = sk.buffSec * (sa.medley ? 2 : 1);
      if (g.rallyT <= bsec) g.rallyBy = h.id; g.rallyT = Math.max(g.rallyT, bsec); g.rallySpd = Math.max(g.rallyT > bsec ? g.rallySpd : 0, sk.buffSpd);
      g.encoreT = bsec; g.encoreDmg = sk.buffDmg;
      ev(g, 'encore', { x, y, r, hx: h.x, hy: h.y });
      break;
    }
    case 'harley': { // 백인규 할리 드리프트: 찍은 곳까지 쏜살같이 → 원을 그리며 드리프트 (원 안 따끔 + 바깥으로 튕김) → 타이어 자국
      if (sk.skid) {
        const P = aimAt(g, h, x, y, sk.r[lv]); r = sk.r[lv];
        const mk = (px, py, t0) => (g.zones || (g.zones = [])).push({ kind: 'drift', x: px, y: py, r, t: sk.sec + 0.35 + t0, max: sk.sec + 0.35 + t0, go: 0.35 + t0, tick: 0, dmg: base * sk.mul[lv], kb: sk.kb, hero: h, skid: sk.skid, sx: h.x, sy: h.y - 20 });
        mk(P.x, P.y, 0);
        if (sa.twin || (h.sig && h.sig.twinHarley)) mk(clamp(g.W - P.x, 30, g.W - 30), P.y, 0.15); // 할리 2대: 반대쪽에 한 대 더
        if (h.def.pump) h.pump = h.def.pump.max; // 근육 펌프 가득
        ev(g, 'harley', { x: h.x, y: h.y, tx: P.x, ty: P.y, r, drift: true });
        x = P.x; y = P.y;
        break;
      }
      const len = Math.max(560, g.rowY + 40);
      const bw = bestLineAngle(g, h.x, h.y, len, sk.w / 2);
      const a = bw ? bw.a : -Math.PI / 2;
      g.harleys = g.harleys || [];
      g.harleys.push({ x0: h.x, y0: h.y, a, len, v: len / sk.sec, d: 0, t: sk.sec, tick: 0, hw: sk.w / 2, dmg: base * sk.mul[lv], kb: sk.kb, slow: sk.slow, hero: h, trail: [] });
      if (sa.twin || (h.sig && h.sig.twinHarley)) g.harleys.push({ x0: h.x, y0: h.y, a: -Math.PI - a, len, v: len / sk.sec, d: 0, t: sk.sec, tick: 0.12, hw: sk.w / 2, dmg: base * sk.mul[lv], kb: sk.kb, slow: sk.slow, hero: h, trail: [] }); // 할리 2대
      ev(g, 'harley', { x: h.x, y: h.y, a });
      break;
    }
    case 'cafe': { // 문동한 카페인 풀충전: 변신(wind) → gap 마다 진상이 몰린 곳에 캔커피 예고 → delay 뒤 쾅 (updateHeroes 의 cafeTick)
      const add = echo ? 4 : 0; // 스킬 진화 · 신화 메아리: 변신은 그대로 · 캔커피만 4발 더
      if (h.cafe) { h.cafe.left += add || sk.n[lv]; h.cafeT = Math.max(h.cafeT, (h.cafe.left + 1) * sk.gap + sk.delay + 0.5); break; }
      if (echo) break;
      h.cafe = { t: 0, left: sk.n[lv], next: sk.wind, base, lv, q: [], hot: [] };
      h.cafeT = sk.wind + sk.n[lv] * sk.gap + sk.delay + 0.5; // 변신 모습 유지 시간
      ev(g, 'cafeUp', { hero: h.id, x: h.x, y: h.y, wind: sk.wind, sec: h.cafeT });
      break;
    }
    case 'rush': {
      const n = sk.n[lv] + (h.cm.rush || 0) + ((h.sig && h.sig.rushN) || 0);
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
      for (const e of list) { pts.push([e.x, e.y]); damageEnemy(g, e, base * sk.mul * (sa.rushx ? 1.3 : 1), true, h, false, true); }
      if (h.sig && h.sig.rushTwice) for (const e of list.slice().reverse()) { if (e.dead) continue; pts.push([e.x, e.y]); damageEnemy(g, e, base * sk.mul * (sa.rushx ? 1.3 : 1) * h.sig.rushTwice, true, h, false, true); } // 김영준 전용 신화: 돌아오며 한 번 더
      h.out = false; h.restT = 0.6; h.px = h.x; h.py = h.y;
      ev(g, 'rush', { hero: h.id, pts, x: h.x, y: h.y });
      break;
    }
    case 'blinddate': {
      // 소개팅 주선: 여사친 여러 명을 서로 다른 진상에게 (찍으면 그 근처 진상부터)
      const n = sk.n[lv] + (sa.jackpot ? 1 : 0);
      const list = g.enemies.filter((e) => !e.dead && e.y > 0).sort(x !== undefined ? (a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y) : (a, b) => b.y - a.y);
      for (let i = 0; i < n; i++) {
        const t = list[i % Math.max(1, list.length)];
        if (!t) break;
        spawnGf(g, h, t, base * sk.mul * (sa.jackpot ? 1.3 : 1), h.def.ricochet[lv] + 1, (i - (n - 1) / 2) * (sa.jackpot ? 0.45 : 0.65));
      }
      break;
    }
    case 'dietshot':
      if (h.alt) h.altT += 4; else dietOn(g, h, 0);
      break;
    case 'wallwalk': { // 윤정섭: 벽이 걸어온다 — 크게 · 빠르게 · 끝에서 기절
      h.growT = sk.sec[lv];
      // 언제 눌러도 의미 있게: 쉬는 중이면 바로 출발 · 돌아오는 중이면 그 자리에서 돌아서 다시 밀고 올라간다 · 지쳤어도 체력 가득
      const turn = h.wallSt === 'back';
      if (h.wallSt !== 'out') { if (h.wallSt !== 'back') { h.px = h.x; h.py = h.y; } h.wallSt = 'out'; h.tired = false; h.out = true; }
      h.wallHp = Math.max(h.wallHp || 0, h.def.wall.hp[lv] * (1 + h.meta * 0.05) * 1.5);
      ev(g, 'wallWalk', { x: h.px, y: h.py, turn });
      break;
    }
    case 'sled': { // 송바울 팬클럽 점프대: 찍은 곳으로 날아올라 공중 트릭 → 쾅 착지 (범위 · 바깥으로 밀침) · 보드 충전 가득
      if (sk.air) {
        const P = aimAt(g, h, x, y, sk.r[lv]); r = sk.r[lv];
        if (!h.bd) boardInit(h);
        const b = h.bd;
        b.st = 'air'; b.airT = 0; b.airMax = sk.air; b.ax = h.px; b.ay = h.py; b.tx = P.x; b.ty = P.y; b.jr = r; b.jdmg = base * sk.mul[lv] * (h.lv >= 3 ? 1.15 : 1); b.jkb = sk.kb; b.twice = !!sa.twice && !echo; b.ice = !!sa.ice;
        b.ch = h.def.board.charges[lv]; h.out = true;
        if (sk.fan) { h.fanT = sk.fan.sec; h.fanSpd = sk.fan.spd; }
        if (sk.fever) b.fever = sk.fever.sec; // 팬클럽 총출동: 착지하고 나서 5초 동안 충전 안 쓰고 마음껏 · 지나간 길은 빙판
        ev(g, 'jumpUp', { x: h.px, y: h.py, tx: P.x, ty: P.y, r, air: sk.air });
        x = P.x; y = P.y;
        break;
      }
      r = 0;
      const lx = h.out && h.px !== undefined ? h.px : h.x; // 보드 타고 나가 있으면 그 줄에서
      const mul = sk.mul[lv] * (h.lv >= 3 ? 1.15 : 1);
      const pass = (k = 1) => { for (const e of g.enemies) { if (e.dead || e.y < -20 || Math.abs(e.x - lx) > sk.w + (e.r || 14)) continue; damageEnemy(g, e, base * mul * (h.lv >= 5 ? 0.6 : 1) * k, false, h, false); if (!e.dead) applyKnockback(e, e.boss ? sk.kb * 0.3 : sk.kb, g); if (!e.dead && !e.boss && h.sig && h.sig.stun) e.stunT = Math.max(e.stunT, h.sig.stun * stunMul(e)); } };
      pass(); if (h.lv >= 5) pass(); if (sa.twice) pass(0.6); // 썰매 두 번 증강
      if (h.sig && h.sig.sledBack) { pass(); ev(g, 'sigFx', { hero: h.id, x: h.x, y: h.y }); } // 송바울 전용 신화: 다시 올라오며 한 번 더
      if (sa.ice) (g.saLanes = g.saLanes || []).push({ x: lx, w: sk.w, t: 4, slow: 0.45 }); // 미끄러운 길
      if (sk.fan) { h.fanT = sk.fan.sec; h.fanSpd = sk.fan.spd; } // 팬클럽 함성: 잠깐 바울 공격 속도 ↑
      if (h.bd && (h.bd.st === 'fix' || h.bd.st === 'home' || h.bd.uses > 0)) { const fixed = h.bd.st === 'fix' || h.bd.st === 'home'; h.bd.uses = 0; if (fixed) { h.bd.st = 'ride'; h.bd.cdT = 0; h.bd.fixT = 0; h.px = h.x; h.py = h.y; } } // 팬클럽이 새 보드를 갖다 준다 (정비 끝 · 다시 처음부터)
      ev(g, 'sled', { x: lx, y: h.y, w: sk.w });
      break;
    }
    case 'oneman': { // 강병화 원맨쇼: 5초(Lv5 6.5초) 보스·중간 보스 빼고 모두 춤추며 멈춤 · 보스 50% 느리게 · 모두 공격력 +25% · 상태이상 해제
      const sec = sk.sec[lv] + (h.lv >= 5 ? 1 : 0);
      for (const e of g.enemies) { if (e.dead) continue; if (e.boss || e.mid) { e.slowT = Math.max(e.slowT, sec); e.slowMul = Math.min(e.slowMul || 1, 0.5); } else { e.stunT = Math.max(e.stunT, sec * stunMul(e)); e.danceT = sec; } } // 중간 보스도 보스처럼 느려지기만
      for (const o of g.heroes) { o.stunT = 0; o.charmT = 0; o.rumorT = 0; o.fearT = 0; o.paperT = 0; o.grabT = 0; o.silenceT = 0; o.aspdDebT = 0; }
      g.onemanT = sec; g.onemanAtk = sk.atk; g.onemanAmp = sk.amp || 0; g.onemanExt = 0;
      if (h.sig && h.sig.encore && echo !== 'sig') h.sigEcho = { t: sec }; // 강병화 전용 신화: 끝나는 순간 앵콜 원맨쇼
      ev(g, 'oneman', { x: h.x, y: h.y, sec });
      break;
    }
    case 'princess': {
      // 공주의 일격: 가장 센 적에게 거대한 망치 + 바로 공주로
      const t = bossTarget(g, h, 2000);
      if (t) {
        damageEnemy(g, t, base * sk.mul[lv] * (t.boss ? 1.5 : 1) / (h.alt ? h.def.age.dmg : 1), true, h);
        if (!t.dead && !t.boss) t.stunT = Math.max(t.stunT, 1.5);
        ev(g, 'bigHammer', { x: t.x, y: t.y });
        if (sa.combo) { // 공주의 연타: 다음 센 적 둘
          const more = g.enemies.filter((e) => !e.dead && e !== t && e.y > 10).sort((a, b) => (b.boss ? 3e7 : b.mid ? 2e7 : b.elite ? 1e7 : 0) + b.hp - ((a.boss ? 3e7 : a.mid ? 2e7 : a.elite ? 1e7 : 0) + a.hp)).slice(0, 2);
          for (const o of more) { damageEnemy(g, o, base * sk.mul[lv] * 0.6 / (h.alt ? h.def.age.dmg : 1), true, h); ev(g, 'bigHammer', { x: o.x, y: o.y }); }
        }
      }
      if (h.alt) ev(g, 'young', { hero: h.id, x: h.x, y: h.y });
      h.alt = false; h.ageT = h.def.age.princess[lv];
      if (g.tempo && t && !t.dead) { h.dashE = t; h.out = true; h.px = t.x; h.py = t.y + 18; ev(g, 'crack', { x: t.x, y: t.y + 20 }); } // 돌진해서 쾅 · 바닥 금
      break;
    }
    case 'forlangbang': {
      // 랑방을 위하여!! 세 줄 황금 파동 + 모두 공격력 ↑
      // 막차 대행진: 황금 버스 행렬이 모든 줄을 쓸고 간다 — 전부 밀어내고 1.5초 기절 + 모두 공격력 ↑ (기세 2칸)
      if (g.mom !== null && g.mom !== undefined && !echo) g.mom = Math.max(0, g.mom - MOMENTUM.per); // (1칸은 아래에서 · 1칸 더)
      const n = (h.evo ? 5 : 4) + (sa.extra ? 2 : 0), W = g.W || 360;
      for (let i = 0; i < n; i++) {
        const bx = (W / n) * (i + 0.5);
        (g.buses || (g.buses = [])).push({ hero: h, x: bx, y: g.rowY + 30 + i * 26 * (i % 2 ? 1 : -0.3), w: W / n + 8, big: i === ((n / 2) | 0), gold: true, dmg: base * BUS.dmg * 0.2, stun: (sk.stun || 0.8) + (sa.extra ? 0.5 : 0), hit: new Set() });
      }
      g.hcSkT = sk.sec[lv]; g.hcSkAtk = sk.atk[lv];
      ev(g, 'grandBus', { x: h.x, y: h.y, n });
      ev(g, 'langbang', { x: h.x, y: h.y, grand: true });
      break;
    }
    case 'allincall': { // 정소영: 올인 콜! 준영 등판 — 정해진 시간 동안 진상을 한곳으로 모은다
      const sec = sk.sec[lv];
      const j = summonJunyoung(g, h); // 없으면 불러내고 · 있으면 체력 가득
      if (j) { j.allinT = sec; h.callM = 0; ev(g, 'allinCall', { x: j.px, y: j.py, sec }); }
      break;
    }
    case 'timestop': { // 오지은: 넓게 시간 정지 (크게 느려짐) · 숨은 적도 드러남
      r = sk.r[lv] * (sa.frozen ? 1.2 : 1);
      forEnemiesNear(g, x, y, r, (e) => { e.unveiled = true; e.slowT = Math.max(e.slowT, sk.sec[lv] * (e.boss ? 0.6 : 1) * g.mods.ctrlMul); e.slowMul = e.boss ? (sa.frozen ? 0.5 : 0.7) : sa.frozen ? 0.12 : sk.slow;
        if (h.sig && h.sig.freeze) { if (e.boss) e.slowMul = Math.min(e.slowMul, 0.4); else e.stunT = Math.max(e.stunT, h.sig.freeze * stunMul(e)); } // 오지은 전용 신화: 진짜 멈춤
        return true; });
      h.alt = true; h.altT = sk.sec[lv];
      (g.tZones || (g.tZones = [])).push({ x, y, r, t: sk.sec[lv], slow: sa.frozen ? 0.12 : sk.slow, bossSlow: sa.frozen ? 0.5 : 0.7 }); // (10/08) 시간 정지는 그 자리에 남는다: 들어오는 진상도 느려짐
      ev(g, 'timestop', { x, y, r });
      break;
    }
    case 'goodman': { // 박상화: 백 송이 장미 꽃다발 — 찍은 곳에 쏟아져 범위 큰 피해 (자란 만큼) + 필드의 장미 표식 전부 개화 + 성장 (팀 공격력 버프 없음)
      const hit = base * sk.mul[lv] * (1 + sk.growK * (h.grow || 0)) * (sa.perfect ? 1.4 : 1);
      if (Array.isArray(sk.r)) {
        r = sk.r[lv] * (sa.perfect ? 1.3 : 1);
        const P = aimAt(g, h, x, y, r); x = P.x; y = P.y;
        forEnemiesNear(g, x, y, r, (o) => { damageEnemy(g, o, hit, true, h, true); return true; });
        ev(g, 'bouquet', { x: h.x, y: h.y - 40, tx: x, ty: y, r, grow: Math.round((h.grow || 0) * 100) });
        let nb = 0;
        for (const o of g.enemies) if (!o.dead && o.roseN > 0 && o.roseT > 0 && nb < 12) { nb++; const n0 = o.roseN; o.roseN = 0; o.roseT = 0; bloomAt(g, h, o.x, o.y, heroDamage(g, h) * h.def.rose.bloom * (0.6 + 0.4 * n0), h.def.rose.r); } // 장미 표식 전부 개화
        if (nb) ev(g, 'bloomAll', { n: nb, x: h.x, y: h.y });
      }
      const t = Array.isArray(sk.r) ? null : bossTarget(g, h, 2000);
      if (t) {
        const rr = sk.r * (sa.perfect ? 1.3 : 1), tx = t.x, ty = t.y;
        damageEnemy(g, t, hit, true, h, false);
        forEnemiesNear(g, tx, ty, rr, (o) => { if (o !== t) damageEnemy(g, o, hit * 0.35, false, h, true); return true; });
        ev(g, 'bouquet', { x: h.x, y: h.y - 40, tx, ty, r: rr, grow: Math.round((h.grow || 0) * 100) });
        r = rr;
      }
      growBy(h, sk.grow);
      ev(g, 'goodman', { x: h.x, y: h.y - 70, text: echo ? '끝내주는남자 박상화!!' : '좋은남자 박상화!', big: true });
      break;
    }
    case 'bandage': { // 홍정민: 붕대 바리케이드 — 찍은 높이에 붕대 벽 (진상이 멈춘다) + 크게 수리 + 입구 피해 ↓
      if (sk.wall) {
        const W0 = sk.wall, P = aimAt(g, h, x, y, 60); x = clamp(P.x, W0.w[lv] / 2, g.W - W0.w[lv] / 2); y = clamp(P.y, 90, g.ropeY - 30); r = W0.w[lv] / 2;
        (g.zones || (g.zones = [])).push({ kind: 'tape', x, y, w: W0.w[lv] * (h.lv >= 5 ? 1.1 : 1), hp: g.base.max * W0.hp * (h.lv >= 5 ? 1.4 : 1) * (sa.iron ? 1.5 : 1), t: W0.sec[lv], max: W0.sec[lv], dps: base * W0.dps, hero: h, tick: 0 });
        ev(g, 'tapeUp', { x, y, w: W0.w[lv], hx: h.x, hy: h.y });
      }
      const v = healDoor(g, h.id, g.base.max * sk.heal[lv] * g.mods.healMul * (h.cm.heal || 1)); g.bandT = sk.sec[lv] + (sa.iron ? 2 : 0); g.bandArmor = sk.armor + (sa.iron ? 0.2 : 0);
      ev(g, 'heal', { x: h.x, y: h.y, v: Math.round(v) });
      ev(g, 'bandage', { x: g.W / 2, y: g.ropeY + 8, v: Math.round(v), big: true, hero: h.id });
      break;
    }
    case 'bouqtoss': { // 임수빈 스핀 스포트라이트: 찍은 곳에 댄스 플로어 → 박자마다 리본으로 휘감기 (피해 + 묶기) · 마지막 박자 피루엣
      r = sk.r[lv] * (sa.catch ? 1.25 : 1);
      const amp = sk.amp + (sa.catch ? 0.15 : 0) + ((h.sig && h.sig.ampUp) || 0);
      if (sk.beats) {
        const P = aimAt(g, h, x, y, r); x = P.x; y = P.y;
        const nb = sk.beats[lv] + (sa.catch ? 1 : 0);
        (g.zones || (g.zones = [])).push({ kind: 'floor', x, y, r, t: nb * sk.beat + 0.4, max: nb * sk.beat + 0.4, beat: sk.beat, beatT: 0.2, beats: nb, dmg: base * sk.mul[lv], lastMul: sk.last, tie: sk.tie[lv] * g.mods.ctrlMul, amp, ampSec: sk.ampSec, hero: h });
        ev(g, 'danceFloor', { x, y, r, sec: nb * sk.beat + 0.4, hx: h.x, hy: h.y });
        break;
      }
      forEnemiesNear(g, x, y, r, (e) => {
        damageEnemy(g, e, base * sk.mul[lv], false, h, true);
        if (!e.dead) { ch8Tie(g, e, sk.tie[lv] * g.mods.ctrlMul, h, true); e.tieAmp = Math.max(e.tieAmpT > 0 ? e.tieAmp || 0 : 0, amp); e.tieAmpT = Math.max(e.tieAmpT || 0, sk.ampSec); }
        return true;
      });
      ev(g, 'c8toss', { x, y, r, hx: h.x, hy: h.y - 40 });
      break;
    }
    case 'curse': { // 서명훈 실눈 저격: 찍은 곳 안의 가장 빠른 진상 5명에게 하늘에서 욕 벼락 — 큰 피해 + 얼림 · 이미 얼어 있으면 깨지며 주변까지
      if (sk.shatter) {
        r = sk.r[lv];
        const P = aimAt(g, h, x, y, r); x = P.x; y = P.y;
        const n = h.sig && h.sig.curseN ? h.sig.curseN : sa.bolts ? 8 : 5;
        let list = g.enemies.filter((e) => !e.dead && e.y > 0 && !isHidden(e) && Math.hypot(e.x - x, e.y - y) <= r + e.r).sort((a, b) => b.speed - a.speed).slice(0, n);
        if (!list.length) list = g.enemies.filter((e) => !e.dead && e.y > 0 && !isHidden(e)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y)).slice(0, 1);
        ev(g, 'squint', { hero: h.id, x: h.x, y: h.y, list: list.map((e) => ({ x: e.x, y: e.y })) });
        for (const e of list) {
          const frozen = e.frozenT > 0 && e.stunT > 0;
          damageEnemy(g, e, base * sk.dmgMul * (e.form === 'reveal' ? h.def.revealBonus : 1) * (e.boss ? 0.6 : 1) * (frozen ? 1.5 : 1), true, h, false);
          ev(g, 'skyBolt', { x: e.x, y: e.y - 10, frozen });
          if (frozen) { forEnemiesNear(g, e.x, e.y, sk.shatter.r, (o) => { if (o !== e) { damageEnemy(g, o, base * sk.shatter.mul, false, h, true); if (!o.dead) { o.iceN = (o.iceN | 0) + 2; o.iceT = 3; } } return true; }); ev(g, 'shatter', { x: e.x, y: e.y - 10, r: sk.shatter.r }); }
          if (!e.dead) { const rt = ((h.sig && h.sig.root) || sk.stun[lv]); if (!e.boss) { e.stunT = Math.max(e.stunT, rt * stunMul(e)); e.frozenT = rt; } else { e.slowT = Math.max(e.slowT, rt * 0.6); e.slowMul = Math.min(e.slowMul || 1, 0.5); } }
        }
        break;
      }
      const list = g.enemies.filter((e) => !e.dead && e.y > 0 && !isHidden(e)).sort((a, b) => b.speed - a.speed).slice(0, h.sig && h.sig.curseN ? h.sig.curseN : sa.bolts ? 8 : 5);
      ev(g, 'lockOn', { list: list.map((e) => ({ x: e.x, y: e.y })) });
      for (const e of list) { const rv = e.form === 'reveal'; damageEnemy(g, e, base * sk.dmgMul * 1.6 * (rv ? h.def.revealBonus : 1) * (e.boss ? 0.6 : 1), false, h, false); if (!e.dead) { const rt = (h.sig && h.sig.root) || 2; e.slowT = Math.max(e.slowT, rt * (e.boss ? 0.4 : 1)); e.slowMul = 0.05; e.rootT = rt; } ev(g, 'curseBolt', { x: h.x, y: h.y - 30, tx: e.x, ty: e.y - 20 }); }
      r = 0;
      break;
    }
  }
  if (!echo && h.sig && h.sig.echo) h.sigEcho = { t: h.sig.echo, x: sk.target ? x : undefined, y: sk.target ? y : undefined }; // 전용 신화: 잠시 뒤 한 번 더
  if (echo) { ev(g, 'skill', { hero: h.id, skill: sk.id, name: sk.name + ' 한 번 더!', x: sk.target ? x : h.x, y: sk.target ? y : h.y, r, target: !!sk.target, echo: true }); return true; }
  h.skillCd = sk.cd * (1 - (h.gear.cd || 0)) * g.cdMul * (h.evo ? EVO_MUL.cd : 1) * (g.tempo && MOMENTUM.strong.includes(h.id) ? MOMENTUM.strongCd / TEMPO.cd : 1) * (h.skCdMul || 1) * (h.awake >= 2 ? 1 - TOWER_AWAKE_FX.cd : 1);
  if (g.mom !== null && g.mom !== undefined) { g.mom -= MOMENTUM.per; g.lastSkillT = g.t; h.tiredT = h.skillCd * MOMENTUM.tired; h.tiredMax = h.tiredT; }
  g.stats.skills++;
  if (g.mode === 'endless') { g.streak = Math.min(2, (g.streak || 1) + 0.03); if (g.idleEv && g.idleEv.kind === 'rush') g.idleEv.got++; }
  ev(g, 'skill', { hero: h.id, skill: sk.id, name: sk.name, x: sk.target ? x : h.x, y: sk.target ? y : h.y, r, target: !!sk.target });
  ev(g, 'skillCast', { hero: h.id });
  return true;
}

// 1:1 대전: 상대가 보낸 진상 (small = 빠른 진상 5명 · big = 중간 보스)
//  mul: 과열 · 폭주 · 서든데스 단계의 보내기 배수 (서버가 정해서 보낸다 → 두 사람 똑같이)
//  화면에 진상이 너무 많으면 (PVP_ESC.cap) 수 대신 체력으로 (느린 폰)
export function pvpIncoming(g, kind, mul = 1, o = {}) {
  const k = Math.max(1, Math.min(4, Math.floor(Number(mul) || 1)));
  const sd = !!(g.pvp && g.pvp.sudden);
  let alive = 0;
  for (const e of g.enemies) if (!e.dead) alive++;
  let n = k;
  if (kind === 'big') {
    const ids = ['mid_drunk', 'mid_thug', 'fuse_kko', 'mid_gao'];
    for (let j = 0; j < k; j++) {
      const e = spawnEnemy(g, ids[(g.rng() * ids.length) | 0], k > 1 ? 90 + (j * 180) / (k - 1) : g.W / 2, -50 - j * 36);
      e.sent = true;
      if (sd) { e.hp *= PVP_END.bigHpSudden; e.maxHp *= PVP_END.bigHpSudden; if (e.shield) e.shield *= PVP_END.bigHpSudden; } // 서든데스 뒤: 중간 보스 체력 ×1.5
    }
  } else {
    n = (sd ? PVP_END.sendSmallSudden : PVP_END.sendSmall) * k; // 서든데스 뒤: 5 → 8명 (× 단계 배수)
    const room = Math.min(n, Math.max(4, PVP_ESC.cap - alive));
    const hpX = n / room;
    for (let i = 0; i < room; i++) {
      const e = spawnEnemy(g, i % 2 ? 'drunk_run' : 'mukti', 40 + (i % 5) * 70 + ((i / 5) & 1 ? 35 : 0), -30 - i * 12);
      e.sent = true;
      if (hpX > 1) { e.hp *= hpX; e.maxHp *= hpX; }
    }
  }
  ev(g, 'incoming', { kind, n, auto: !!o.auto, sched: !!o.sched });
}
// 폭주 보스 묶음: 웨이브 보스 2~3명을 한꺼번에 (체력은 PVP_ESC.bunchHp) — 보스 고르기는 판 시드로 (두 사람 같은 보스)
const PVP_BOSSES = ['boss_loan', 'boss_thug', 'boss_gapjil', 'queen'];
function pvpBunch(g, cnt, i) {
  for (let j = 0; j < cnt; j++) {
    const id = PVP_BOSSES[((g.pvp.seed >>> 0) + i * 3 + j) % PVP_BOSSES.length];
    const e = spawnEnemy(g, id, cnt > 1 ? 70 + (j * 220) / (cnt - 1) : g.W / 2, -60 - j * 40);
    e.hp *= PVP_ESC.bunchHp; e.maxHp *= PVP_ESC.bunchHp; if (e.shield) e.shield *= PVP_ESC.bunchHp;
    e.sent = true; e.bunch = true;
    ev(g, 'bossSpawn', { enemy: id, x: e.x, y: e.y, bunch: true });
  }
  ev(g, 'pvpBunch', { n: cnt });
}
// 상대 미니 화면용 점 (보스 → 중간 보스 → 입구에 가까운 순 · 최대 PVP_DOTS 개) — 화면 표시용만
export function pvpView(g) {
  const top = Math.max(1, g.ropeY || g.H || 1), W = g.W || 360;
  const list = [];
  for (const e of g.enemies) if (!e.dead && e.y > -24) list.push(e);
  list.sort((a, b) => (b.boss | 0) - (a.boss | 0) || (b.mid | 0) - (a.mid | 0) || b.y - a.y);
  const out = [];
  for (let i = 0; i < list.length && i < PVP_DOTS; i++) { const e = list[i]; out.push(pvpDot(Math.round((e.x / W) * 63), Math.round((Math.max(0, e.y) / top) * 63), e.boss ? 2 : e.mid ? 1 : e.sent ? 3 : 0)); }
  return out;
}
// 1:1 대전 끝내기 타임라인 — 150초부터 15초마다 서든데스 단계 (진상 체력 · 속도 +15% · 입구 피해 +20% · 회복 절반)
//  240초부터 입구가 초당 1% 씩 · 300초면 멈추고 판정 (판정은 서버가 — 화면은 기다린다)
//  시간은 g.pvp.clock (화면: 서버 시작 시각부터 실제로 지난 초 → 두 사람이 똑같이) · 없으면 g.t (서버 AI)
export const pvpSendCount = (g) => (g && g.pvp && g.pvp.sudden ? PVP_END.sendSmallSudden : PVP_END.sendSmall);
export function pvpTime(g) { return g.pvp && g.pvp.clock !== null && g.pvp.clock !== undefined ? g.pvp.clock : g.t; }
function pvpStep(g, dt) {
  const P = g.pvp;
  if (P.timeUp || g.over) return;
  if (P.n > 0 && P.hpEnd !== undefined && g.base.hp > P.hpEnd) g.base.hp = P.hpEnd + (g.base.hp - P.hpEnd) * PVP_END.healMul; // 스킬 · 카드로 회복한 것도 절반
  const hp0 = g.base.hp;
  P.hurt = 0;
  g._pvpIn = true;
  try { step(g, dt); } finally { g._pvpIn = false; }
  if (P.n > 0 && !g.over) { const gain = g.base.hp - hp0 + P.hurt; if (gain > 0) g.base.hp -= gain * (1 - PVP_END.healMul); } // 이번 틱 회복 절반
  const t = pvpTime(g);
  const n = pvpStepN(t);
  if (n !== P.n) {
    const k = (1 + PVP_END.hpStep * n) / (1 + PVP_END.hpStep * P.n), ks = (1 + PVP_END.spdStep * n) / (1 + PVP_END.spdStep * P.n);
    g.mods.enemyHp *= k; g.mods.enemySpd *= ks;
    for (const e of g.enemies) if (!e.dead) { e.hp *= k; e.maxHp *= k; if (e.shield) e.shield *= k; e.speed *= ks; }
    const first = !P.sudden;
    P.n = n; P.sudden = n > 0;
    ev(g, first ? 'sudden' : 'suddenUp', { n });
  }
  // 늘어지는 판 막기 단계 (과열 → 폭주 → 서든데스) · 다시 들어온 판은 지난 묶음 · 웨이브를 한꺼번에 쏟지 않는다
  const ph = pvpPhase(t);
  if (P.bunchI === undefined) { P.bunchI = pvpBunchCount(t); P.sdI = pvpSdCount(t); P.phase = 0; }
  if (ph !== P.phase) { const from = P.phase; P.phase = ph; ev(g, 'pvpPhase', { p: ph, from }); }
  P.doorMul = (1 + PVP_END.doorStep * P.n) * (ph >= 3 ? PVP_ESC.sdDoor : 1);
  if (!g.over) {
    while (P.bunchI < pvpBunchCount(t)) { const i = P.bunchI++; pvpBunch(g, PVP_ESC.bunch[i][1], i); }
    while (P.sdI < pvpSdCount(t)) { P.sdI++; for (let k = 0; k < PVP_ESC.sdPacks; k++) pvpIncoming(g, 'small', 1, { sched: true }); for (let k = 0; k < PVP_ESC.sdMid; k++) pvpIncoming(g, 'big', 1, { sched: true }); ev(g, 'pvpWave', { i: P.sdI }); }
  }
  if (t >= PVP_END.drainAt && !g.over) {
    const from = Math.max(PVP_END.drainAt, P.drainT === undefined ? PVP_END.drainAt : P.drainT);
    const sec = Math.min(t, PVP_END.end) - from;
    P.drainT = Math.max(from, Math.min(t, PVP_END.end));
    if (sec > 0) {
      if (!P.drainOn) { P.drainOn = true; ev(g, 'pvpDrain', {}); }
      g.base.hp -= g.base.max * PVP_END.drain * sec;
      if (g.base.hp <= 0 && !g.god) { g.base.hp = 0; g.over = true; g.phase = 'over'; ev(g, 'gameover', {}); }
    }
  }
  if (t >= PVP_END.end && !g.over) { P.timeUp = true; ev(g, 'pvpTimeUp', { hp: g.base.hp, max: g.base.max, kills: g.stats.kills }); }
  P.hpEnd = g.base.hp;
}
// 영웅 자리 바꾸기 (끌어다 놓기). 잠깐 쿨타임
export function swapHeroes(g, h, slot) {
  if (!h || slot < 0 || slot >= g.nPos || (slot === h.slot && (!g.tower || Math.abs(h.x - g.slotX[slot]) < 1))) return false; // 자리 바꾸기는 바로 · 공짜 (탑: 걸어가서 칸을 벗어났으면 같은 칸으로도 돌아온다)
  const other = g.heroes.find((o) => o !== h && o.slot === slot);
  if (other) { other.slot = h.slot; other.x = g.slotX[other.slot]; }
  h.slot = slot; h.x = g.slotX[slot];
  if (!g._autoSwap) { g.swapAt = g.t; if (g.tower) { h.laneX = h.x; g.laneT = 0; } } // 손으로 옮김: 탑 자동 자리 잡기가 쉬고 · 가던 길도 멈춘다 (옆으로 밀리지 않게)
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
  if (g.pvp && !g._pvpIn) { pvpStep(g, dt); return; } // 1:1 대전: 끝내기 타임라인을 감싸서
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
    if (autoJoinOn(g) && g.wave === 1 && g.joinPool.length) { const A = TENSION.pick.auto; for (let k = 0; k < A.length; k++) if (!(g.freeJoin & (1 << k)) && g.waveT >= A[k]) { g.freeJoin = (g.freeJoin | 0) | (1 << k); autoJoinNext(g); } }
    else if (g.joinMode && g.wave === 1 && g.joinPool.length && g.mode === 'stage' && (g.tension || g.wkPick || (g.stage | 0) <= (JOIN.freeUntil || 99))) for (let k = 0; k < JOIN.free.length; k++) if (!(g.freeJoin & (1 << k)) && g.waveT >= JOIN.free[k]) { g.freeJoin = (g.freeJoin | 0) | (1 << k); g.pendingLevels++; g.joinDue = (g.joinDue | 0) + 1; ev(g, 'freeJoin', {}); } // 첫 웨이브: 공짜 합류 카드 두 장
    const q = g.spawnQ;
    // 동시에 화면에 있는 진상은 최대 ENEMY_CAP (폰 성능) — 넘치면 조금 기다렸다 나온다
    let alive = 0;
    if (g.spawnI < q.length && q[g.spawnI].at <= g.waveT) for (const e of g.enemies) if (!e.dead) alive++;
    const cap = g.hell ? 90 : ENEMY_CAP; // 헬 모드는 진상이 단단한 대신 동시에 조금 적게 (폰 성능)
    while (g.spawnI < q.length && q[g.spawnI].at <= g.waveT && alive < cap) {
      const s = q[g.spawnI++];
      const e = spawnEnemy(g, s.type, s.boss ? g.W / 2 : s.x, s.boss ? -60 : undefined, s.hpX || s.elite ? { hpX: s.hpX, elite: s.elite } : undefined);
      alive++;
      if (s.second) e.second = true; // (10/09) 두 번째 보스: 페이즈 · 떨어져 싸우기 없이 (보스 둘이 각각 페이즈를 돌며 150초+ 늘어지던 것)
      if (s.bossHp) { e.maxHp *= s.bossHp; e.hp = e.maxHp; } // 보스를 바꾼 스테이지: 예전 난이도에 맞춘 체력 (data.js STAGE_BOSS_HP)
      if (g.wk) g.wk.onSpawn(g, e, s); // 주간: 방패 부대 · 보물 도둑 · 최종 보스 단계
      if (g.raid && s.boss && !s.mid && !g.raid.boss) { g.raid.boss = e; e.raidBoss = true; e.maxHp = e.hp = 1e12; }
      if (s.mid) ev(g, 'midSpawn', { enemy: s.type, x: e.x, y: e.y });
      else if (s.boss) ev(g, 'bossSpawn', { enemy: s.type, x: e.x, y: e.y });
    }
  }
  if (g.mom !== null && g.mom !== undefined) {
    if ((g.phase === 'wave' || g.phase === 'intro' || g.phase === 'test') && g.mom < MOMENTUM.max) g.mom = Math.min(MOMENTUM.max, g.mom + (MOMENTUM.per / (g.tension ? TENSION.refill : MOMENTUM.refill)) * (g.momRate || 1) * dt);
    if (g.skillQ && g.t >= g.skillQ.at) { const q = g.skillQ; g.skillQ = null; if (g.heroes.includes(q.h)) castSkill(g, q.h, q.x, q.y, false, true); }
  }
  for (const h of g.heroes) if (h.tiredT > 0) h.tiredT -= dt;
  if (g.mods.regen && g.base.hp < g.base.max && g.phase !== 'test') g.base.hp = Math.min(g.base.max, g.base.hp + g.mods.regen * dt);
  buildGrid(g);
  updateAuras(g);
  updateHeroes(g, dt);
  updateEnemies(g, dt);
  if (g.r2) g.r2.tick(g, dt); // 건물주 레이드: 거대 보스 패턴 · 화 쌓기 (raid2-sim.js)
  if (g.twa) g.twa.tick(g, dt); // 진상의 탑: 바닥 예고 · 멤버 체력 · 끌어서 옮기기 (tower-arena.js)
  if (g.hw) g.hw.tick(g, dt); // 할로윈 이벤트: 진상 기술 · 저주 (hw-sim.js)
  if (g.wk) g.wk.tick(g, dt); // 주간 도전: 규칙 · 현상금 · 보스 단계 (weekly-sim.js)
  if (g.conds.length || (g.wtr && g.wtr.shield)) condTick(g, dt);
  updateEprojs(g, dt);
  updateProjs(g, dt);
  if (g.zones && g.zones.length) updateZones(g, dt); // 대개편: 장판 · 고리 · 화상
  if (g.rings && g.rings.length) updateRings(g, dt);
  statusTick(g, dt);
  if (g.pools.length) updatePools(g, dt);
  if (g.rallyT > 0) { g.rallyT -= dt; if (g.rallyHeal && g.base.hp < g.base.max) repairDoor(g, 'bangjang', Math.min(g.base.max - g.base.hp, g.base.max * g.rallyHeal * dt)); }
  if (g.tambT > 0) g.tambT -= dt;
  if (g.uirijuT > 0) g.uirijuT -= dt;
  if (g.bouncerT > 0) g.bouncerT -= dt;
  if (g.onemanT > 0) g.onemanT -= dt;
  if (g.consCdT > 0) g.consCdT -= dt;
  if (g.doorShieldT > 0) { g.doorShieldT -= dt; if (g.doorShieldT <= 0) g.doorShield = 0; }
  if (g.encoreT > 0) g.encoreT -= dt;
  if (g.hcT > 0) g.hcT -= dt;
  if (g.hcSkT > 0) g.hcSkT -= dt;
  if (g.bandT > 0) g.bandT -= dt;
  if (g.holes && g.holes.length) updateHoles(g, dt); // 강성구 블랙홀
  if (g.harleys && g.harleys.length) updateHarleys(g, dt); // 백인규 할리
  if (g.buses && g.buses.length) updateBuses(g, dt); // 이호찬 막차 버스
  if (g.tauntZone && (g.tauntZone.t -= dt) <= 0) g.tauntZone = null;
  updateIdleEv(g, dt);
  if (g.augOffer && g.phase !== 'intro' && (g.augOffer.t -= dt) <= 0) applyAug(g, g.augOffer.opts[0]);
  if (g.bossSlowT > 0) g.bossSlowT -= dt;
  if (g.hbeams && g.hbeams.length) { for (const q of g.hbeams) q.t -= dt; g.hbeams = g.hbeams.filter((q) => q.t > 0); }
  updateMapFx(g, dt);
  extraTick(g, dt); // 탑 규칙 · 스킬 증강 · 지옥 세트
  if (g.swapCd > 0) g.swapCd -= dt;
  // 술병 폭발은 연쇄 가능 — 한 번에 처리
  let guard = 0;
  while (g._boom.length && guard++ < 40) {
    const d = g._boom.pop(), r = g._boom.pop(), y = g._boom.pop(), x = g._boom.pop();
    explode(g, x, y, r, d);
  }
  updateGems(g, dt);
  if (g.comboT > 0) { g.comboT -= dt; if (g.comboT <= 0) g.combo = 0; }
  if (g.mk && g.mk.n && g.t - g.mk.t0 > MK_WIN) flushMultiKill(g);
  // 죽은 적 정리 → 풀로 반납
  const list = g.enemies;
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (e.dead) g._enemyPool.push(e); else list[j++] = e;
  }
  list.length = j;
  if (g.phase === 'wave' && !g.over && g.spawnI >= g.spawnQ.length && list.length === 0) waveClear(g);
  if (g.raid && !g.over && g.phase !== 'victory' && g.t >= g.raid.sec) { g.victory = true; g.phase = 'victory'; g.stars = 0; ev(g, 'raidEnd', { dmg: g.raid.dmg }); }
  if ((g.pvp || g.raid) && g.phase === 'wave' && g.spawnI >= g.spawnQ.length && g.waveT > 18) startWave(g, g.wave + 1); // 대전 · 레이드는 18초마다 다음 웨이브 (다 안 잡아도)
}

// ─── 카드 ─────────────────────────────────────────────
function heroCardDesc(def, next, add = 0) { // add: 큰 카드 (일반 스테이지) 멤버 공격력 +
  const perk = def.perks[next];
  const up = Math.round((LEVEL_DMG[next - 1] / LEVEL_DMG[Math.max(0, next - 3)] * (1 + add) - 1) * 100);
  return perk ? `★ ${perk}` + (add ? ` · 공격력 +${Math.round(add * 100)}%` : '') : `공격력 +${up}% · 공격 속도 증가`;
}
// ─── 큰 카드 · 주력 ───
// 큰 카드: 일반 카드의 % 효과 × GROW.card (설명 숫자도 같이)
// n: 이미 고른 같은 카드 수 → 큰 카드 모드(일반 스테이지 · 헬)에선 겹칠수록 덜 (GROW.rep)
export const cardK = (g, n = 0) => (g && g.grow ? GROW.card * GROW.rep[Math.min(n, GROW.rep.length - 1)] * (g.tension ? TENSION.card : 1) : g && g.wkPick ? TENSION.pick.wk.card * GROW.rep[Math.min(n, GROW.rep.length - 1)] : 1); // (주간: 고르기를 줄인 만큼 카드 ×wk.card) // (긴장감: 한 판 눈덩이를 덜 — 카드 % ×TENSION.card)
export const bigDesc = (desc, k) => (k === 1 ? desc : desc.replace(/(\d+(?:\.\d+)?)%/g, (_, n) => `${Math.round(Number(n) * k)}%`));
// 주력: 한 판에 Lv3 을 넘길 수 있는 멤버는 MAIN.n 명 (먼저 Lv3 을 넘긴 순서)
export const mainCount = (g) => g.heroes.filter((h) => h.main).length;
export function canGrow(g, h) { return !g.mainOn || h.main || Math.min(5, h.lv + 2) <= MAIN.cap || mainCount(g) < MAIN.n; }
const mainKind = (g, h, next) => (!g.mainOn ? '' : h.main ? 'is' : next > MAIN.cap ? 'new' : '');
export function cardPool(g) {
  const pool = [];
  const free = g.heroes.length < Math.min(g.nPos, g.maxHeroes || 99) && g.mode !== 'stage' && !(g.joinMode && g.joinPool.length);
  if (g.joinMode && !autoJoinOn(g)) for (const j of g.joinPool) {
    const d = HEROES[j.id];
    pool.push({ key: 'join:' + j.id, kind: 'join', hero: j.id, slot: j.slot, rarity: d.legend ? 'legend' : d.hidden ? 'hidden' : 'rare', icon: d.emoji, title: d.name, desc: d.desc, sub: d.role, w: JOIN.w });
  }
  for (const id of UNLOCK_HEROES) {
    if (hasHero(g, id) || !free) continue;
    if (!g.unlocked.includes(id)) continue;
    const d = HEROES[id];
    const tr = g.trial && g.trial.includes(id);
    pool.push({ key: 'add:' + id, kind: 'addHero', hero: id, rarity: 'rare', icon: d.emoji, title: `${d.name} ${tr ? '체험 합류!' : '합류!'}`, desc: d.desc, sub: tr ? '체험 · 스테이지를 깨면 정식 합류' : d.role, w: 9 });
  }
  for (const h of g.heroes) {
    const d = h.def;
    if (h.lv < 5 && canGrow(g, h)) {
      const next = Math.min(5, h.lv + 2); // 레벨업 카드 한 장 = 2레벨
      const mk = mainKind(g, h, next); // 주력: 'is' 이미 주력 · 'new' 고르면 주력이 된다
      pool.push({
        key: 'lv:' + h.id, kind: 'heroLv', hero: h.id, rarity: d.perks[next] || d.perks[h.lv + 1] ? 'rare' : 'common',
        icon: d.emoji, title: `${d.name} Lv.${h.lv}→${next}`, desc: heroCardDesc(d, next, g.grow ? GROW.lv * (g.tension ? TENSION.pick.lv || 1 : 1) : 0) + (d.perks[h.lv + 1] && h.lv + 1 !== next ? ` · ★ ${d.perks[h.lv + 1]}` : ''), lvAtk: g.grow ? GROW.lv * (g.tension ? TENSION.pick.lv || 1 : 1) : 0, sub: mk === 'new' ? `주력 지정 (${mainCount(g) + 1}/${MAIN.n}) · Lv5까지` : d.role, w: d.perks[next] ? 9 : 11, main: mk,
      });
    }
    if (SKILL_EVO[h.id] && !h.skEvo && h.lv >= 3) pool.push({ key: 'se:' + h.id, kind: 'skillEvo', hero: h.id, rarity: 'legend', icon: '✨', title: SKILL_EVO[h.id], desc: `${d.skill.name}이(가) 0.5초 뒤 한 번 더 터진다 (75% 위력)`, sub: '스킬 진화 · 한 번', w: 6 });
    const hc = HERO_CARDS[h.id];
    if (hc && (h.cmN || 0) < 2) pool.push({ key: 'hm:' + h.id, kind: 'heroMod', hero: h.id, rarity: 'rare', icon: d.emoji, title: hc.title.split(':')[0] + ' 전용', desc: hc.title.split(':').slice(1).join(':').trim() + ` · 공격력 +${Math.round(20 * cardK(g, h.cmN || 0))}%`, sub: '멤버 전용 카드', w: 7, stack: h.cmN || 0 });
  }
  // 멤버 전용 스킬 증강: 그 멤버가 판에 있을 때 (스테이지는 Lv3 부터 가끔 · 탑은 자주)
  for (const h of g.heroes) {
    const list = SKILL_AUG[h.id];
    if (!list || h.def.summon || h.guest || h.temp) continue;
    if (!g.tower && h.lv < SKILL_AUG_W.stageLv) continue;
    for (const a of list) if (!(h.sa && h.sa[a.id])) pool.push({ key: `sa:${h.id}:${a.id}`, kind: 'skillAug', hero: h.id, aug: a.id, rarity: 'legend', icon: '', title: a.name, desc: `${a.desc} · 공격력 +${Math.round(SKILL_AUG_W.atk * 100)}%`, sub: `${h.def.name} 전용 스킬 증강`, w: g.tower ? SKILL_AUG_W.tower : SKILL_AUG_W.stage });
  }
  const tagN = {};
  for (const h of g.heroes) for (const t of HERO_TAGS[h.id] || []) tagN[t] = (tagN[t] || 0) + 1;
  const topAttr = Object.entries(g.attrCount).sort((a, b) => b[1] - a[1])[0];
  for (const c of CARDS) {
    const n = g.stacks[c.id] || 0;
    if (n >= c.max) continue;
    if (CARD_CUT.includes(c.id)) continue; // 정리한 카드 (다른 카드에 합침)
    if (c.tension && !g.tension) continue; // 맞바꾸는 · 대박 카드: 긴장감 판에만
    if (c.attr && (!topAttr || c.attr !== topAttr[0])) continue; // 속성 결속: 가장 많은 속성 한 장만
    if (c.needs && !hasHero(g, c.needs)) continue;
    let w = RARITY[c.rarity].weight;
    if (c.attr) { const k = g.attrCount[c.attr] || 0; if (!k) continue; w = 2.5 + 2.5 * k; } // 그 속성 멤버가 많을수록 잘 나온다
    if (c.tag && c.tag !== 'boss') { const k = tagN[c.tag] || 0; if (!k) continue; w = 2 + 2 * k; }
    if (c.risk) w = 2.2;
    if (g.tension && (c.id === 'dmg' || c.id === 'spd')) w *= 0.5; // 밋밋한 +% 는 덜 (고르는 맛)
    if (c.tension && c.rarity === 'rare') w = 3.2;
    const tags = c.tag ? [c.tag] : CARD_TAGS[c.id] || [];
    pool.push({ key: c.id, kind: 'global', id: c.id, rarity: c.rarity, icon: c.icon, title: c.title, desc: bigDesc(c.desc, cardK(g, n)), stack: n, w: w * pathW(g, tags), attr: c.attr || null, tag: c.tag || null, tags, risk: !!c.risk });
  }
  // 무한: 카드가 다 차도 계속 자라게 — 조금씩 · 갈수록 덜 (모두 같은 규칙이라 순위는 공정)
  if (g.mode === 'endless') {
    const few = pool.filter((c) => c.kind === 'global').length < 6;
    for (const [id, title, desc] of INF_CARDS) { const n = g.stacks[id] || 0; pool.push({ key: id, kind: 'global', id, rarity: 'rare', icon: '♾️', title: `${title} (무한 ${n + 1})`, desc: desc(Math.pow(0.93, n)), stack: n, w: few ? 10 : 2.5, tags: [] }); }
  }
  // 테크: 실버(tag_ 카드)를 가지면 골드 · 골드를 가지면 프리즘
  for (const [t, tiers] of Object.entries(TECH)) {
    const have1 = (g.stacks['tag_' + t] || 0) > 0 || (t === 'boss' && (g.stacks.boss || 0) + (g.stacks.crit || 0) > 0) || (t === 'heal' && (g.stacks.hp || 0) + (g.stacks.regen || 0) > 0);
    for (let k = 0; k < 2; k++) {
      const id = `tech_${t}_${k + 2}`;
      if (g.stacks[id]) continue;
      if (k === 0 ? !have1 : !g.stacks[`tech_${t}_2`]) continue;
      pool.push({ key: id, kind: 'global', id, rarity: k === 0 ? 'rare' : 'legend', tier: k === 0 ? 'gold' : 'prism', icon: TAGS[t].icon, title: tiers[k].title, desc: tiers[k].desc, stack: 0, w: (k === 0 ? 5 : 3.5) * pathW(g, [t]), tag: t, tags: [t] });
    }
  }
  // 제어 분기: Lv2 이상 멤버마다 한 번 (맞히면 가끔 기절·감속·빙결·밀치기·끌어당기기)
  for (const h of g.heroes) {
    const kind = HERO_CC[h.id];
    if (!kind || h.lv < 2 || (h.ccN || 0) >= 3) continue;
    const K = CC_KINDS[kind];
    pool.push({ key: 'cc:' + h.id, kind: 'cc', hero: h.id, cc: kind, rarity: 'rare', icon: K.icon, title: `${h.def.name}: ${K.name} ${['I', 'II', 'III'][h.ccN || 0]}`, desc: `맞히면 ${Math.round(CC_ON_HIT.chance[h.ccN || 0] * 100)}% 확률로 ${K.name}`, w: 3.2 * pathW(g, ['ctrl']), tags: ['ctrl'] });
  }
  // 진화: Lv5 + 짝 특성 카드
  for (const h of g.heroes) {
    const ev = EVO[h.id];
    if (!ev || h.evo || h.lv < 5 || !(g.stacks['tag_' + ev.tag] > 0)) continue;
    pool.push({ key: 'evo:' + h.id, kind: 'evo', hero: h.id, rarity: 'legend', icon: h.def.emoji, title: `${h.def.name} 진화: ${ev.name}`, desc: '공격력 ×1.45 · 공격 속도 +18% · 스킬 쿨타임 -30%', sub: '진화 — 한 판에 한 번', w: 16, tag: ev.tag });
  }
  return pool;
}
const INF_CARDS = [
  ['inf_dmg', '끝없는 근성', (k) => `모든 멤버 공격력 +${(8 * k).toFixed(1)}%`],
  ['inf_spd', '끝없는 카페인', (k) => `공격 속도 +${(5 * k).toFixed(1)}%`],
  ['inf_crit', '끝없는 급소', (k) => `치명타 피해 +${(10 * k).toFixed(1)}%`],
  ['inf_mom', '끝없는 기세', (k) => `기세 충전 +${(10 * k).toFixed(1)}%`],
];
export function hiddenCard(id, g) {
  const d = HEROES[id];
  const tr = g && g.trial && g.trial.includes(id);
  return { key: 'add:' + id, kind: 'addHero', hero: id, rarity: 'hidden', icon: d.emoji, title: `${d.name} ${tr ? '체험 합류!' : '합류!'}`, desc: d.desc, sub: tr ? 'HIDDEN 체험 · 스테이지를 깨면 정식 합류' : d.role };
}
// 3장 뽑기 (서로 다른 카드). opt.hiddenChance 로 히든 확률 덮어쓰기 가능(테스트용)
export function rollCards(g, n = RULES.cardChoices, opt = {}) {
  // 1:1 대전: (매치 시드, 몇 번째 뽑기) 전용 난수 → 같은 상태면 두 사람이 같은 카드
  const rng = opt.rng || (g.pvp ? seedRngLocal(((g.pvp.seed | 0) * 7919 + (g.rollN | 0) * 104729 + 17) >>> 0) : g.rng);
  g.rollN = (g.rollN | 0) + 1;
  const pool = cardPool(g);
  // 많이 키운 멤버의 카드가 더 잘 나온다 (한 명 몰아 키우기)
  for (const c of pool) if (c.hero && c.kind !== 'join' && c.kind !== 'addHero') { const h = hasHero(g, c.hero); if (h && h.picks) c.w *= Math.min(JOIN.investMax, 1 + JOIN.invest * h.picks); }
  const picks = [];
  while (picks.length < n && pool.length) {
    let sum = 0;
    for (const c of pool) sum += c.w;
    let r = rng() * sum;
    let i = 0;
    for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r <= 0) break; }
    picks.push(pool.splice(i, 1)[0]);
  }
  const top = Object.entries(g.tagW || {}).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2 && picks.length >= 2 && !picks.some((c) => (c.tags || []).includes(top[0]))) {
    const on = pool.filter((c) => (c.tags || []).includes(top[0])).sort((a, b) => b.w - a.w)[0];
    if (on) { on.onPath = true; picks[0] = on; }
  }
  if (g.joinMode && g.joinPool.length && !autoJoinOn(g)) {
    const isJ = (c) => c.kind === 'join';
    const cap = g.joinPool.length <= g.joinTotal / 2 ? 1 : 2; // 후보를 절반 넘게 쓰면 한 번에 1장까지
    let nj = picks.filter(isJ).length;
    // 처음 3번의 레벨업은 합류 카드를 꼭 1장 이상
    if (!nj && (g.pickN < (g.tension ? TENSION.pick.guarantee : JOIN.guarantee) || g.joinDue > 0) && picks.length) { const j = pool.filter(isJ)[(rng() * pool.filter(isJ).length) | 0]; if (j) { pool.splice(pool.indexOf(j), 1); picks[picks.length - 1] = j; nj = 1; } }
    if (nj && g.joinDue > 0) g.joinDue--; // 공짜 합류 몫을 썼다
    while (nj > cap) { const k = picks.map(isJ).lastIndexOf(true); const alt = pool.filter((c) => !isJ(c)).sort((a, b) => b.w - a.w)[0]; if (!alt) break; pool.splice(pool.indexOf(alt), 1); picks[k] = alt; nj--; }
  }
  // 아직 합류 안 한 멤버의 전용 카드(무기 · 멤버 Lv · 전용 효과)는 빼고 빈자리는 일반 카드로
  for (let i = picks.length - 1; i >= 0; i--) if (heroCardAbsent(g, picks[i])) picks.splice(i, 1);
  for (let i = 0; picks.length < n; i++) {
    const f = FILLER_CARDS[i % FILLER_CARDS.length];
    picks.push({ key: f.id + i, kind: 'filler', id: f.id, rarity: f.rarity, icon: f.icon, title: f.title, desc: f.desc });
  }
  // 숨은 카드: 임시 증원(잠긴 자리 하나 열기) · 게스트 합류(아직 없는 멤버를 이번 판만)
  if (!g.tower && g.maxHeroes < g.nPos && g.heroes.length >= g.maxHeroes && g.tempSlot < 0 && picks.length && rng() < (opt.secretChance !== undefined ? opt.secretChance : SECRET.tempSlot)) {
    const guest = !g.guestUsed && g.guestPool.filter((id) => !hasHero(g, id)).length && rng() < 0.45;
    picks[picks.length - 1] = guest
      ? { key: 'guestCombo', kind: 'secret', id: 'guestCombo', rarity: 'hidden', icon: '🎫', title: '게스트 합류!', desc: '이번 판만 한 명 더! 아직 없는 멤버가 게스트로 들어와요', sub: '숨은 카드 · 한 판에 한 번' }
      : { key: 'tempSlot', kind: 'secret', id: 'tempSlot', rarity: 'hidden', icon: '🔓', title: '임시 증원!', desc: '이번 판만 멤버 한 명 더! 가진 멤버 중 한 명이 빈자리로 달려와요', sub: '숨은 카드 · 한 판에 한 번' };
  }
  // 히든 영웅: 칸마다 낮은 확률로 교체 (런당 1번씩만)
  const chance = opt.hiddenChance !== undefined ? opt.hiddenChance : RULES.hiddenChance;
  const from = g.mode === 'stage' ? RULES.hiddenFromStageWave : RULES.hiddenFromWave;
  if (g.wave >= from || opt.hiddenChance !== undefined) {
    for (let i = 0; i < picks.length; i++) {
      if (g.heroes.length >= Math.min(g.nPos, g.maxHeroes || 99) || g.mode === 'stage') break;
      const avail = HIDDEN_HEROES.filter((id) => g.hiddenUnlocked.includes(id) && !g.hiddenTaken[id] && !hasHero(g, id) && !picks.some((p) => p.hero === id));
      if (!avail.length) break;
      if (rng() < chance) picks[i] = hiddenCard(avail[(rng() * avail.length) | 0], g);
    }
  }
  return picks;
}

function pathW(g, tags) { let w = 1; for (const t of tags || []) w *= 1 + 0.6 * ((g.tagW || {})[t] || 0); return w; }
function notePath(g, tags) {
  for (const t of tags || []) {
    g.tagW = g.tagW || {}; g.tagCnt = g.tagCnt || {};
    g.tagW[t] = (g.tagW[t] || 0) + 1;
    const n = (g.tagCnt[t] = (g.tagCnt[t] || 0) + 1);
    if (SET_BONUS[n]) { g.mods.tagDmg[t] = (g.mods.tagDmg[t] || 0) + SET_BONUS[n]; ev(g, 'setBonus', { tag: t, n }); }
  }
}
const heroCardAbsent = (g, c) => !!(c && c.hero && !['join', 'addHero', 'secret'].includes(c.kind) && c.rarity !== 'hidden' && !hasHero(g, c.hero));
export function applyCard(g, c) {
  if (heroCardAbsent(g, c)) { const f = FILLER_CARDS[0]; c = { key: f.id, kind: 'filler', id: f.id, rarity: f.rarity, icon: f.icon, title: f.title, desc: f.desc }; } // (이미 뜬 카드라도 그 멤버가 없으면 일반 카드로)
  const m = g.mods;
  g.pickN = (g.pickN | 0) + 1;
  if (c.hero && c.kind !== 'join') { const h0 = hasHero(g, c.hero); if (h0) h0.picks = (h0.picks || 0) + 1; }
  if (c.kind === 'join') {
    const at = g.joinPool.findIndex((x) => x.id === c.hero);
    if (at < 0 || hasHero(g, c.hero)) return;
    const j = g.joinPool.splice(at, 1)[0];
    const h = addHero(g, j.id, j.slot);
    if (h) { h.joinT = 0; ev(g, 'join', { hero: h.id, x: h.x, y: h.y, left: g.joinPool.length }); if (JOIN.freePick && (!(g.tension || g.wkPick) || g.heroes.filter((o) => !o.def.summon).length <= TENSION.pick.freeTo)) g.pendingLevels++; } // (긴장감: 4명까지는 합류가 공짜 · 5 · 6번째 합류는 카드 한 장을 쓴다 — 넓은 덱의 값) // 합류는 공짜: 곧바로 카드 한 장 더 (강화 몫을 안 뺏는다)
    return;
  }
  notePath(g, c.tags || (c.hero ? HERO_TAGS[c.hero] : null));
  if (c.kind === 'cc') { const h = hasHero(g, c.hero); if (h) { h.cc = c.cc; h.ccN = (h.ccN || 0) + 1; ev(g, 'ccGet', { hero: h.id, kind: c.cc, x: h.x, y: h.y }); } return; }
  if (c.kind === 'global' && c.id && c.id.startsWith('inf_')) {
    const n = g.stacks[c.id] || 0, k = Math.pow(0.93, n);
    g.stacks[c.id] = n + 1;
    if (c.id === 'inf_dmg') m.dmg += 0.08 * k; else if (c.id === 'inf_spd') m.spd += 0.05 * k; else if (c.id === 'inf_crit') m.critMul += 0.1 * k; else if (c.id === 'inf_mom') g.momRate = (g.momRate || 1) * (1 + 0.1 * k);
    return;
  }
  if (c.kind === 'global' && c.id && c.id.startsWith('tech_')) {
    g.stacks[c.id] = 1;
    const [, t, lv] = c.id.split('_'); const big = lv === '3';
    m.tagDmg[t] = (m.tagDmg[t] || 0) + (big ? 0.7 : 0.35);
    if (t === 'pierce') m.pierce += big ? 2 : 1;
    else if (t === 'splash') m.splashMul *= big ? 1.35 : 1.25;
    else if (t === 'chain') m.chainExtra += big ? 2 : 1;
    else if (t === 'kb') m.kbMul *= big ? 1.7 : 1.4;
    else if (t === 'heal') { m.healMul *= big ? 1.8 : 1.5; m.regen += big ? 4 : 2; if (big) m.baseArmor *= 0.85; }
    else if (t === 'ctrl') m.ctrlMul *= big ? 1.6 : 1.35;
    else if (t === 'boss') { m.bossDmg += big ? 0.7 : 0.35; if (big) m.critMul += 0.6; else m.crit += 0.08; }
    ev(g, 'tech', { tag: t, tier: big ? 'prism' : 'gold', title: c.title });
    return;
  }
  switch (c.kind) {
    case 'skillAug': applySkillAug(g, c.hero, c.aug); break;
    case 'addHero': addHero(g, c.hero); break;
    case 'skillEvo': {
      const h = hasHero(g, c.hero);
      if (h) { h.skEvo = true; ev(g, 'evolve', { hero: h.id, x: h.x, y: h.y, name: SKILL_EVO[h.id] }); }
      break;
    }
    case 'heroMod': {
      const h = hasHero(g, c.hero);
      const hc = HERO_CARDS[c.hero];
      if (h && hc) {
        h.cmAtk = cmAtk(h) - (h.lvAtk || 0) + 0.2 * cardK(g, h.cmN || 0); h.cmN = (h.cmN || 0) + 1;
        for (const [k, v] of Object.entries(hc.mul || {})) h.cm[k] = (h.cm[k] || 1) * v;
        for (const [k, v] of Object.entries(hc.add || {})) h.cm[k] = (h.cm[k] || 0) + v;
        ev(g, 'heroLv', { hero: h.id, lv: h.lv, x: h.x, y: h.y });
      }
      break;
    }
    case 'heroLv': {
      const h = hasHero(g, c.hero);
      if (h && h.lv < 5 && canGrow(g, h)) {
        const st0 = weaponStep(h);
        h.lv = Math.min(5, h.lv + 2);
        if (g.grow) h.lvAtk = (h.lvAtk || 0) + GROW.lv * (g.tension ? TENSION.pick.lv || 1 : 1); // 큰 카드: 키운 멤버는 레벨 카드마다 공격력 +
        if (g.mainOn && !h.main && h.lv > MAIN.cap) { h.main = true; ev(g, 'mainPick', { hero: h.id, n: mainCount(g), max: MAIN.n, x: h.x, y: h.y }); } // Lv3 을 넘기면 주력
        ev(g, 'heroLv', { hero: h.id, lv: h.lv, x: h.x, y: h.y });
        if (g.tempo && WEAPON[h.id] && weaponStep(h) > st0) ev(g, 'weaponEvo', { hero: h.id, x: h.x, y: h.y, item: WEAPON[h.id].item, step: weaponStep(h), mag: weaponMag(h) });
      }
      break;
    }
    case 'global': {
      const k = cardK(g, g.stacks[c.id] || 0); // 큰 카드 (일반 스테이지): % 효과 × k (겹칠수록 덜) — 설명 숫자(bigDesc)와 같게 · 관통 +1 같은 개수는 그대로
      g.stacks[c.id] = (g.stacks[c.id] || 0) + 1;
      const up = (x) => 1 + x * k, dn = (x) => Math.max(0.05, 1 - x * k);
      switch (c.id) {
        case 'dmg': m.dmg += 0.27 * k; break;
        case 'spd': m.spd += 0.2 * k; break;
        case 'gunExtra': m.gunExtra++; break;
        case 'crit': m.crit += 0.13 * k; break;
        case 'hp': g.base.max = Math.round(g.base.max * up(0.35)); g.base.hp = Math.min(g.base.max, g.base.hp + g.base.max * 0.5 * k); m.baseArmor *= dn(0.15); break; // (모래주머니 합침)
        case 'exp': m.expMul += 0.35 * k; break;
        case 'slow': m.enemySpd *= dn(0.13); for (const e of g.enemies) e.speed *= dn(0.13); break;
        case 'pierce': m.pierce++; break;
        case 'boss': m.dmg += 0.4 * k; m.spd += 0.2 * k; break;
        case 'regen': m.regen += 2.5; break;
        case 'ult': m.ultCharge += 0.8 * k; m.ultDmg += 0.6 * k; break;
        case 'charmRes': m.charmMul *= dn(0.6); break;
        case 'debuffRes': m.debuffMul *= dn(0.4); m.charmMul *= dn(0.5); // (연애 금지 서약 합침)
 for (const h of g.heroes) h.debuffMul = m.debuffMul; break;
        case 'cdCut': { const c0 = g.cdCard || 1, c1 = Math.max(1 - GROW.cdMax, c0 * dn(0.25)), r = c1 / c0; g.cdCard = c1; g.cdMul *= r; for (const h of g.heroes) h.skillCd *= r; break; } // 두 장이면 쿨 −44% (큰 카드 −34% · −24% → 합 −49%) · 카드로 줄이는 쿨은 최대 GROW.cdMax
        case 'armor': m.baseArmor *= dn(0.2); break;
        case 'attrUp': m.attrUp += 0.25 * k; break;
        case 'syn_talk': case 'syn_power': case 'syn_charm': case 'syn_booze': { const a = c.id.slice(4); m.attrDmg[a] = (m.attrDmg[a] || 0) + 0.42 * k; break; }
        case 'tag_pierce': m.tagDmg.pierce = (m.tagDmg.pierce || 0) + 0.4 * k; m.pierce++; break;
        case 'tag_splash': m.tagDmg.splash = (m.tagDmg.splash || 0) + 0.34 * k; m.splashMul *= up(0.35); m.swarmDmg += 0.2 * k; break; // (청소부 합침)
        case 'tag_chain': m.tagDmg.chain = (m.tagDmg.chain || 0) + 0.34 * k; m.chainExtra++; break;
        case 'tag_kb': m.tagDmg.kb = (m.tagDmg.kb || 0) + 0.34 * k; m.kbMul *= up(0.6); break;
        case 'tag_heal': m.tagDmg.heal = (m.tagDmg.heal || 0) + 0.25 * k; m.healMul *= up(0.8); break;
        case 'tag_ctrl': m.tagDmg.ctrl = (m.tagDmg.ctrl || 0) + 0.25 * k; m.ctrlMul *= up(0.5); m.enemySpd *= dn(0.1); for (const e of g.enemies) e.speed *= dn(0.1); break; // (새치기 금지 합침)
        case 'tag_boss': m.bossDmg += 0.65 * k; break;
        case 'swarm': m.swarmDmg += 0.38 * k; break;
        case 'risk_allin': g.base.max = Math.round(g.base.max * dn(0.2)); g.base.hp = Math.min(g.base.hp, g.base.max); m.dmg += 0.45 * k; break;
        case 'risk_overtime': m.enemyHp *= up(0.15); m.expMul += 0.35 * k; break;
        case 'risk_glass': m.critMul += 1.2 * k; m.healMul *= dn(0.5); break;
        case 'econ_bonus': g.pendingLevels++; break;
        case 'tr_heavy': m.dmg += 0.45 * k; m.spd = Math.max(0.3, m.spd - 0.2 * k); break; // (맞바꿈 · 대박 카드도 설명 숫자처럼 ×k)
        case 'tr_rapid': m.spd += 0.4 * k; m.dmg = Math.max(0.3, m.dmg - 0.15 * k); break;
        case 'tr_skill': m.skillX = (m.skillX || 1) * up(0.5); m.basicX = (m.basicX || 1) * dn(0.12); { const r = dn(0.2); g.cdMul *= r; for (const h of g.heroes) h.skillCd *= r; } break;
        case 'tr_wall': m.baseArmor *= dn(0.35); g.repairX = (g.repairX || 1) * 2; m.dmg = Math.max(0.3, m.dmg - 0.12 * k); break;
        case 'tr_hunt': m.ccAmp = (m.ccAmp || 0) + 0.5 * k; break;
        case 'tr_boom': m.killBoom = (m.killBoom || 0) + 0.3 * k; break;
        case 'jp_party': for (const h of g.heroes) if (!h.def.summon && h.lv < 5 && canGrow(g, h)) { h.lv++; ev(g, 'heroLv', { hero: h.id, lv: h.lv, x: h.x, y: h.y }); } healDoor(g, 'card', g.base.max * 0.2 * k); ev(g, 'jackpot', { id: c.id }); break;
        case 'jp_power': m.dmg += 0.6 * k; m.spd += 0.2 * k; ev(g, 'jackpot', { id: c.id }); break;
        case 'jp_mom': if (g.mom !== null && g.mom !== undefined) g.mom = MOMENTUM.max; for (const h of g.heroes) h.skillCd = 0; m.skillX = (m.skillX || 1) * up(0.3); ev(g, 'jackpot', { id: c.id }); break;
      }
      break;
    }
    case 'secret': {
      // 이번 판만 데려갈 수 있는 멤버 +1 (빈자리 중 가운데에 가까운 곳을 표시)
      const used = new Set(g.heroes.map((h) => h.slot));
      const slot = SLOT_ORDER.filter((x) => x < g.nPos && !used.has(x))[0];
      if (slot === undefined) break;
      g.maxHeroes++;
      g.tempSlot = slot;
      ev(g, 'slotOpen', { x: g.slotX[slot], y: g.rowY, slot });
      if (c.id === 'tempSlot') {
        // 가진 멤버 중 덱에 없는 (제일 높은 티어) 한 명이 증원
        const mine = [...BASE_HEROES, ...g.unlocked].filter((id, i, a) => HEROES[id] && a.indexOf(id) === i && !hasHero(g, id));
        mine.sort((a, b) => (HERO_TIER[b] || 1) - (HERO_TIER[a] || 1) || (g.meta[b] || 0) - (g.meta[a] || 0));
        const h = mine[0] ? addHero(g, mine[0], slot) : null;
        if (h) { h.lv = 2; h.temp = true; ev(g, 'guestJoin', { hero: h.id, x: h.x, y: h.y }); }
      }
      if (c.id === 'guestCombo') {
        const pool = g.guestPool.filter((id) => !hasHero(g, id));
        const id = pool[(g.rng() * pool.length) | 0];
        if (id) { const h = addHero(g, id, slot); if (h) { h.guest = true; h.lv = 2; g.guestUsed = true; ev(g, 'guestJoin', { hero: id, x: h.x, y: h.y }); } }
      }
      break;
    }
    case 'evo': {
      const h = hasHero(g, c.hero);
      if (h) { h.evo = true; ev(g, 'evolve', { hero: h.id, x: h.x, y: h.y, name: EVO[h.id].name }); }
      break;
    }
    case 'filler':
      if (c.id === 'fillUlt') g.ult = Math.min(RULES.ultMax, g.ult + 40);
      else g.base.hp = Math.min(g.base.max, g.base.hp + g.base.max * 0.5);
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
    perfect: !!(stage && g.victory && !g.baseHit && !g.hell), // 입구가 한 번도 안 맞음
    hell: !!g.hell,
    hpPct: Math.round((g.base.hp / g.base.max) * 100),
    wave: stage ? g.stats.wavesCleared : g.victory && !g.endless ? RULES.waves : Math.max(g.stats.wavesCleared, g.wave),
    waves: stage ? g.totalWaves : g.stats.wavesCleared,
    score: g.mode === 'endless' ? Math.round(g.stats.score * (g.scoreMul || 1) * (g.streak || 1)) : g.stats.score,
    afkSec: Math.round(g.afkSec || 0),
    mult: g.mode === 'endless' ? Math.round((g.scoreMul || 1) * (g.streak || 1) * 100) / 100 : 1,
    coinMul: g.coinMul || 1,
    curses: (g.curses || []).map((c) => c.id),
    kills: g.stats.kills,
    bossKills: g.stats.bossKills,
    skills: g.stats.skills | 0,
    raidDmg: g.raid ? Math.floor(g.raid.dmg) : 0,
    weekly: g.weekly ? g.weekly.wi : null,
    durationSec: Math.round(durationSec),
    victory: g.victory,
    heroesUsed: Object.keys(g.heroesUsed),
    stolen: g.stats.envStolen | 0, // 8장 축의금 도둑을 놓친 수 (코인 −8% 씩)
    seen: Object.keys(g.seen || {}).filter((t) => !ENEMIES[t].dot && !ENEMIES[t].eventOnly), // (할로윈 이벤트 진상은 도감 밖)
  };
}

// ─── 이어하기: 웨이브 시작 상태 저장/복구 ─────────────────
// JSON 으로 바꿔 localStorage 에 넣을 수 있는 평범한 객체
export function snapshot(g) {
  return {
    v: 1, mode: g.mode, stage: g.stage, wave: g.wave, t: g.t, tempo: !!g.tempo,
    heroes: g.heroes.map((h) => ({ id: h.id, lv: h.lv, slot: h.slot, kills: h.kills, dmgDone: h.dmgDone, evo: !!h.evo, cm: h.cm, cmN: h.cmN || 0, guest: !!h.guest, skEvo: !!h.skEvo, sa: h.sa || null, saAtk: h.saAtk || 0, saCrit: h.saCrit || 0, skCdMul: h.skCdMul || 1, skDmg: h.skDmg || 0, main: !!h.main, cmAtk: h.cmAtk, lvAtk: h.lvAtk || 0 })),
    mods: Object.assign({}, g.mods, { attrDmg: Object.assign({}, g.mods.attrDmg), tagDmg: Object.assign({}, g.mods.tagDmg) }), stacks: Object.assign({}, g.stacks),
    hiddenTaken: Object.assign({}, g.hiddenTaken), heroesUsed: Object.assign({}, g.heroesUsed),
    level: g.level, exp: g.exp, need: g.need, pendingLevels: g.pendingLevels, welcomePicks: g.welcomePicks, cons: (g.cons || []).slice(), consUsed: Object.assign({}, g.consUsed || {}),
    base: { hp: g.base.hp, max: g.base.max }, ult: g.ult, stats: JSON.parse(JSON.stringify(g.stats)), cstat: Object.assign({}, g.cstat),
    meta: Object.assign({}, g.meta), items: Object.assign({}, g.items), unlocked: g.unlocked.slice(), trial: (g.trial || []).slice(),
    curses: g.curses || [], scoreMul: g.scoreMul || 1, coinMul: g.coinMul || 1, streak: g.streak || 1, twinBoss: !!g.twinBoss,
    gear: g.gear, nPos: g.nPos, baseHit: g.baseHit, hstars: g.hstars, weekly: g.weekly, event: g.ev || null, hell: g.hell, wtrait: g.wtr ? g.wtr.id : null, maxHeroes: g.maxHeroes, awake: g.awakeMap || {}, coll: g.coll || null, markBonus: g.markBonus || 0, saJy: g.saJy || 0, sigRevived: !!g.sigRevived,
    joinMode: !!g.joinMode, joinPool: (g.joinPool || []).map((x) => ({ id: x.id, slot: x.slot })), joinTotal: g.joinTotal | 0, deckN: g.deckN | 0, leader: g.leader, pickN: g.pickN | 0, rollN: g.rollN | 0, picks: Object.fromEntries(g.heroes.map((h) => [h.id, h.picks || 0])),
  };
}
// 저장한 웨이브를 처음부터 다시 시작 (짧은 카운트다운 뒤). 걸린 시간 t 는 이어서 센다
export function restoreGame(snap, opt = {}) {
  const g = createGame({
    H: opt.H, rng: opt.rng, god: opt.god, mode: snap.mode, stage: snap.stage,
    meta: snap.meta, items: snap.items, unlocked: snap.unlocked || snap.hiddenUnlocked || [], heroes: [], gear: snap.gear, positions: snap.nPos, stars: snap.hstars, weekly: snap.weekly || undefined, event: snap.event || undefined, hell: !!snap.hell, wtrait: snap.wtrait || undefined, awake: snap.awake || {}, coll: snap.coll || null,
    tempo: snap.tempo !== false, // (예전 저장엔 없음 — 화면은 늘 템포라 켠다)
  });
  g.markBonus = snap.markBonus || 0; g.saJy = snap.saJy || 0; g.sigRevived = !!snap.sigRevived;
  if (snap.maxHeroes) g.maxHeroes = snap.maxHeroes;
  for (const s of snap.heroes || []) {
    if (!HEROES[s.id]) continue;
    const h = addHero(g, s.id);
    if (!h) continue;
    h.lv = clamp(s.lv | 0, 1, 5);
    if (s.slot >= 0 && s.slot < g.nPos) { h.slot = s.slot; h.x = g.slotX[s.slot]; }
    h.kills = s.kills || 0; h.dmgDone = s.dmgDone || 0; h.joinT = 1; h.evo = !!s.evo; h.cm = Object.assign({}, s.cm); h.cmN = s.cmN || 0; if (s.cmAtk !== undefined && s.cmAtk !== null) h.cmAtk = s.cmAtk; h.main = !!s.main; h.lvAtk = s.lvAtk || 0; h.guest = !!s.guest; h.skEvo = !!s.skEvo; if (s.sa) { h.sa = Object.assign({}, s.sa); h.saAtk = s.saAtk || 0; h.saCrit = s.saCrit || 0; h.skCdMul = s.skCdMul || 1; h.skDmg = s.skDmg || 0; }
  }
  Object.assign(g.mods, snap.mods || {});
  g.mods.attrDmg = Object.assign({}, (snap.mods || {}).attrDmg); g.mods.tagDmg = Object.assign({}, (snap.mods || {}).tagDmg);
  g.stacks = Object.assign({}, snap.stacks); g.hiddenTaken = Object.assign({}, snap.hiddenTaken);
  g.heroesUsed = Object.assign({}, g.heroesUsed, snap.heroesUsed);
  g.level = snap.level || 1; g.exp = snap.exp || 0; g.need = snap.need || expNeedFor(g, g.level, !!snap.joinMode);
  g.pendingLevels = snap.pendingLevels || 0; g.welcomePicks = snap.welcomePicks || 0;
  g.base.max = snap.base.max; g.base.hp = clamp(snap.base.hp, 1, snap.base.max);
  g.ult = snap.ult || 0;
  Object.assign(g.stats, snap.stats || {});
  if (snap.cstat) Object.assign(g.cstat, snap.cstat);
  if (!g.stats.team) { g.stats.team = { repair: 0, prevent: 0, buff: 0 }; g.stats.teamBy = {}; }
  g.cons = (snap.cons || []).slice(); g.consUsed = Object.assign({}, snap.consUsed || {});
  g.t = snap.t || 0;
  g.wave = Math.max(0, (snap.wave || 1) - 1);
  g.phase = 'break';
  g.phaseT = RULES.firstBreakSec + 0.5;
  g.resumed = true;
  g.trial = (snap.trial || []).slice();
  g.baseHit = !!snap.baseHit;
  g.curses = snap.curses || []; g.scoreMul = snap.scoreMul || 1; g.coinMul = snap.coinMul || 1; g.streak = snap.streak || 1; g.twinBoss = !!snap.twinBoss;
  if (snap.joinMode) { g.joinMode = true; g.joinPool = (snap.joinPool || []).filter((x) => HEROES[x.id] && !hasHero(g, x.id)); g.joinTotal = snap.joinTotal | 0; g.deckN = snap.deckN | 0; g.leader = snap.leader || null; }
  g.pickN = snap.pickN | 0; g.rollN = snap.rollN | 0;
  for (const h of g.heroes) h.picks = (snap.picks || {})[h.id] || 0;
  g.events.length = 0;
  return g;
}

// ─── 전투 소모품 (live.js CONS) — 칸마다 판에 한 번 · 소모품끼리 3초 간격 ───
export const CONS_CD = 3;
// 새 소모품 숫자 (live.js CONS 설명과 같게)
export const CONS_FX = { bombshot: { pct: 0.4, boss: 0.06 }, bouncer: { sec: 8, cut: 0.8 } };
export function consReady(g, id) { return !!(g.cons && g.cons.includes(id) && !(g.consUsed || {})[id] && !(g.consCdT > 0) && !g.over && !(g.pvp && g.pvp.ranked)); }
export function useCons(g, id) {
  if (!consReady(g, id)) return false;
  (g.consUsed = g.consUsed || {})[id] = true;
  g.consCdT = CONS_CD;
  if (id === 'battery') { // 보조배터리: 입구 100%
    const v = Math.max(0, g.base.max - g.base.hp);
    g.base.hp = g.base.max;
    ev(g, 'consUse', { id, v: Math.round(v), x: g.W / 2, y: g.ropeY });
  } else if (id === 'aldicom') { // 알디콤: 상태이상 전부 풀기 + 5초 면역 · 입구 근처 진상 버프 깨기
    for (const h of g.heroes) { h.stunT = 0; h.charmT = 0; h.rumorT = 0; h.fearT = 0; h.paperT = 0; h.grabT = 0; h.silenceT = 0; h.aspdDebT = 0; h.vomitT = 0; h.blindT = 0; h.drowsyT = 0; h.ccImmT = Math.max(h.ccImmT || 0, 5); }
    let n = 0;
    for (const e of g.enemies) if (!e.dead && e.y > g.ropeY - 220) { if (e.shield > 0 || e.dictT > 0 || e.gaoOn) n++; e.shield = 0; e.dictT = 0; e.gaoOn = false; e.noShieldT = Math.max(e.noShieldT || 0, 3); e.auraOffT = Math.max(e.auraOffT || 0, 3); }
    ev(g, 'consUse', { id, n, x: g.W / 2, y: g.ropeY });
    if (g.avalanche) ch7Interrupt(g, 'aldicom');
    if (g.speech) ch8SpeechStop(g, g.speech, 'aldicom');
  } else if (id === 'tambourine') { // 노래방 탬버린: 8초 공속 +40%
    g.tambT = 8;
    ev(g, 'consUse', { id, sec: 8, x: g.W / 2, y: g.rowY });
  } else if (id === 'taxi') { // 막차 택시: 두 칸 밀기 · 3초 40% 느리게 (보스는 한 칸만)
    for (const e of g.enemies) { if (e.dead || e.y < 0) continue; pushUp(g, e, e.boss ? 40 : 80); if (!e.boss) { e.slowT = Math.max(e.slowT, 3); e.slowMul = Math.min(e.slowMul || 1, 0.6); } }
    ev(g, 'consUse', { id, x: g.W / 2, y: g.ropeY - 60 });
  } else if (id === 'icewater') { // 얼음물: 보스 빼고 3초 꽁꽁 · 보스는 3초 50%
    for (const e of g.enemies) { if (e.dead || e.y < 0) continue; if (e.boss) { e.slowT = Math.max(e.slowT, 3); e.slowMul = Math.min(e.slowMul || 1, 0.5); } else e.stunT = Math.max(e.stunT, 3); }
    ev(g, 'consUse', { id, x: g.W / 2, y: g.H * 0.4 });
  } else if (id === 'uiriju') { // 의리주: 12초 공격력 +60% · 공속 +20% · 기세 +1칸
    g.uirijuT = 12;
    if (g.mom !== null && g.mom !== undefined) g.mom = Math.min(MOMENTUM.max, g.mom + MOMENTUM.per);
    ev(g, 'consUse', { id, x: g.W / 2, y: g.rowY });
  } else if (id === 'bombshot') { // 폭탄주: 화면의 진상 모두에게 최대 체력 비례 피해 (보스·중간 보스는 조금)
    let n = 0;
    for (const e of g.enemies) { if (e.dead || e.y < 0 || e.raidBoss) continue; n++; damageEnemy(g, e, (e.maxHp || e.hp) * (e.boss || e.mid ? CONS_FX.bombshot.boss : CONS_FX.bombshot.pct), false, null, true); }
    ev(g, 'consUse', { id, n, x: g.W / 2, y: g.H * 0.4 });
  } else if (id === 'energydrink') { // 에너지 드링크: 모든 멤버 스킬 바로 준비 · 기진맥진 풀기 · 기세 +1칸
    for (const h of g.heroes) { if (h.def.skill) h.skillCd = 0; h.tiredT = 0; }
    if (g.mom !== null && g.mom !== undefined) g.mom = Math.min(MOMENTUM.max, g.mom + MOMENTUM.per);
    ev(g, 'consUse', { id, x: g.W / 2, y: g.rowY });
  } else if (id === 'bouncer') { // 경호원 호출: 8초 동안 입구 받는 피해 −80%
    g.bouncerT = CONS_FX.bouncer.sec;
    ev(g, 'consUse', { id, sec: CONS_FX.bouncer.sec, x: g.W / 2, y: g.ropeY });
  } else if (id === 'reroll') { // 쿠폰: 카드 화면에서 (여기선 쓴 표시만)
    ev(g, 'consUse', { id, x: g.W / 2, y: g.rowY });
  } else return false;
  return true;
}

// ─── 친구 도우미: 레이드에 친구 대표 멤버 한 명이 더 (친구의 강화 · 성급 · 장비 그대로) ───
// s = { hero, lv, star, gear(장비 능력치 · gearStats 결과), nick } — 서버가 만든 모습. 내 덱에 같은 멤버가 있으면 못 온다
export function addSupport(g, s) {
  if (!s || !HEROES[s.hero] || hasHero(g, s.hero)) return null;
  g.meta = Object.assign({}, g.meta, { [s.hero]: Math.max(0, s.lv | 0) });
  g.hstars = Object.assign({}, g.hstars, { [s.hero]: Math.max(1, Math.min(5, s.star | 0 || 1)) });
  g.gear = Object.assign({}, g.gear, { [s.hero]: s.gear || {} });
  const used = new Set(g.heroes.map((o) => o.slot));
  const order = g.nPos >= 7 ? [3, 2, 4, 1, 5, 0, 6] : SLOT_ORDER;
  const slot = order.filter((x) => x < g.nPos && !used.has(x))[0];
  g._summoning = true; // 덱 인원 제한과 상관없이 (소환처럼)
  const h = addHero(g, s.hero, slot);
  g._summoning = false;
  if (!h) return null;
  if (slot === undefined) { const mid = g.heroes.find((o) => o !== h && o.slot === order[0]) || g.heroes[0]; h.slot = mid.slot; h.x = h.rx = h.px = mid.x + 26; h.overlap = true; }
  h.support = String(s.nick || '친구').slice(0, 12);
  g.maxHeroes = (g.maxHeroes || 99) + 1; // 도우미 자리는 따로 (카드 합류 칸을 빼앗지 않게)
  g.support = { hero: s.hero, nick: h.support };
  return h;
}

// ─── 진상의 탑 · 멤버 전용 스킬 증강 · 지옥 각성 / 지옥 세트 ─────────────
//  층 구성은 tower.js(floorDef) · 숫자는 data.js(TOWER_SIM) — 여기는 전투 규칙만
function towerSetup(g, opt) {
  const def = opt.tower, has = (r) => def.rules.includes(r);
  g.tower = {
    f: def.f, def, rules: def.rules.slice(), zone: def.zone, seal: def.seal || null, atk: def.atk || 1, boss: def.boss || null,
    titan: has('titan'), swarm: has('swarm'), rush: has('rush'), layers: has('shield'), curse: has('curse'), dark: has('dark'),
    cT: 4, curseI: 0, k: Math.min(1, (def.f - 1) / TOWER_SIM.ramp), // 규칙 세기 (0 → 1)
    limit: TOWER_SIM.limit[0] + TOWER_SIM.limit[1] * def.waves.length, // 제한 시간 (끝없이 버티기만 하는 판 막기)
    fat: Math.max(0, Math.min(100, Number(opt.towerFat) || 0)), // 멤버 피로 (0~100 · tower.js FATIGUE)
  };
  // 피로한 멤버: 공격력 · 입구 내구도 × (1 − 피로 × 0.004) — 탑에서만 (100 → −40%)
  g.tower.fatK = 1 - g.tower.fat * (opt.towerFatPow || 0.004);
  if (g.tower.fatK < 1) { g.base.max = Math.max(1, Math.round(g.base.max * g.tower.fatK)); g.base.hp = g.base.max; }
  g.stage = def.stage || 35;
  g.totalWaves = def.waves.length;
  g.maxHeroes = 1; // 혼자 (다른 칸은 잠김)
  g.mapFx = has('dark') ? { id: 'blackout', icon: '', name: '어둠의 층', desc: '사거리 −35% · 진상이 가까이 올 때까지 안 보인다', every: 7, dark: 3.4, seeR: 150 } : MAP_FX.none;
  if (has('dark')) g.rangeMul = lerpK(TOWER_SIM.dark.range, g.tower.k);
  g.mods.expMul = opt.towerExp || 2; // 혼자라서 경험치 넉넉히 (스테이지 보정 대신)
}
// 진상 하나: 층 공격력 · 규칙 배율 (체력은 웨이브 hpScale 이 이미 층 배율)
function towerEnemy(g, e, o) {
  const T = g.tower, S0 = TOWER_SIM;
  let atk = e.def.atk * T.atk, hpm = 1, spd = 1;
  if (e.boss) atk *= 1.2;
  else if (T.titan && e.elite) { hpm *= lerpK(S0.titan.hp, T.k) * (T.rules.length > 1 ? S0.titan.pair : 1); spd *= S0.titan.spd; atk *= lerpK(S0.titan.atk, T.k); e.titan = true; }
  else if (T.swarm && !e.elite) { hpm *= lerpK(S0.swarm.hp, T.k); atk *= S0.swarm.atk; }
  if (T.rush && !e.boss && !e.titan) { e.fast = true; spd *= lerpK(S0.rush.spd, T.k); }
  if (hpm !== 1) { e.maxHp *= hpm; e.hp = e.maxHp; }
  e.speed = Math.min(e.boss ? 60 : S0.rush.maxSpd, e.speed * spd); e.baseSpeed = e.speed;
  e.atk = atk; e.baseAtk = atk;
  if (T.layers) { const li = T.f >= 20 ? 2 : T.f >= 10 ? 1 : 0; e.tLay = e.tLayMax = (e.boss ? S0.shield.boss : S0.shield.layers)[li]; e.tLayT = S0.shield.regen; e.shield = Math.max(e.shield, e.maxHp * S0.shield.hp); }
  e.cloak = !!T.dark && !e.boss && !e.titan; e.unveiled = !e.cloak && !(e.def.traits && e.def.traits.stealth);
  if (T.dark && e.def.sleep) e.slept = true; // 어둠의 층: 드러눕지 않는다 (줄어든 사거리 밖 길 한가운데 누우면 혼자서는 못 잡아 시간 초과) · 거물은 커서 어둠 속에서도 보인다
}
// 보호막 겹: 한 방에 한 겹 (버프 벗기기 장비는 한 번에 다 깬다)
function layerHit(g, e, src) {
  if (src.gear && src.gear.strip && g.rng() < src.gear.strip) { e.tLay = 0; e.tLayT = TOWER_SIM.shield.regen; ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 }); return false; }
  e.tLay--; e.tLayT = TOWER_SIM.shield.regen;
  if (e.tLay <= 0) ev(g, 'shieldBreak', { x: e.x, y: e.y - e.def.size * 0.6 });
  else if (g.t - (e.layT || -9) > 0.3) { e.layT = g.t; ev(g, 'blocked', { x: e.x, y: e.y - e.def.size * 0.7, n: e.tLay }); }
  return true;
}
// 저주의 층: 진상이 돌아가며 기절 · 침묵 · 홀림 · 감속을 건다 (위로 갈수록 자주 · 길게)
const CURSE_KINDS = ['stun', 'silence', 'charm', 'slow'];
function towerCurse(g, dt) {
  const T = g.tower, C = TOWER_SIM.curse;
  if ((T.cT -= dt) > 0) return;
  const k = Math.min(1, (T.f - 1) / 59);
  T.cT = C.every[0] + (C.every[1] - C.every[0]) * k;
  const src = g.enemies.filter((e) => !e.dead && e.y > 40 && !isHidden(e));
  const hs = g.heroes.filter((h) => !h.def.summon && !h.gone);
  if (!src.length || !hs.length) { T.cT = 1; return; }
  const e = src[(g.rng() * src.length) | 0], h = victim(g, hs);
  const kind = CURSE_KINDS[T.curseI++ % CURSE_KINDS.length];
  ev(g, 'twCurse', { kind, x: h.x, y: h.y, ex: e.x, ey: e.y - e.def.size * 0.5, hero: h.id });
  if (kind === 'stun') { const s0 = debuffSec(h, C.stun[0] + (C.stun[1] - C.stun[0]) * k, 'stun'); if (s0 > 0) { h.stunT = Math.max(h.stunT, s0); dashBreak(g, h); ev(g, 'heroStun', { x: h.x, y: h.y, hero: h.id }); } }
  else if (kind === 'silence') { const s0 = debuffSec(h, C.silence, 'silence'); if (s0 > 0) h.silenceT = Math.max(h.silenceT || 0, s0); }
  else if (kind === 'charm') {
    if (g.heroes.some((o) => o.id === 'gunnyeo' && o.lv >= 5)) ev(g, 'charmBlock', { x: h.x, y: h.y });
    else { const s0 = debuffSec(h, C.charm[0] + (C.charm[1] - C.charm[0]) * k, 'charm'); if (s0 > 0) { h.charmT = Math.max(h.charmT, s0); dashBreak(g, h); ev(g, 'charm', { hero: h.id, x: h.x, y: h.y, ex: e.x, ey: e.y }); } }
  } else { const s0 = debuffSec(h, C.slow[1], 'slow'); if (s0 > 0) { h.aspdDebT = Math.max(h.aspdDebT || 0, s0); h.aspdDebCut = C.slow[0]; } }
}
// 저주의 층: 돌격 중(김영준)에 기절 · 홀림이 걸리면 돌격이 끊기고 숨 고르기부터 (뛰어든 동안 아무것도 안 통하던 것을 탑에선 막는다)
function dashBreak(g, h) {
  if (!h.out || h.def.proj !== 'dash') return;
  h.out = false; h.upT = 0; h.dashE = null; h.restT = h.def.restSec[h.lv - 1] * TOWER_SIM.dash.curseRest; h.restMax = h.restT;
  ev(g, 'crossfit', { x: h.x, y: h.y });
}
// 매 스텝: 탑 규칙 · 미끄러운 길(송바울) · 지옥 세트 화염 폭발
function extraTick(g, dt) {
  const T = g.tower;
  if (T && !g.over && g.phase !== 'victory' && g.t >= T.limit) { // 시간 초과 = 실패
    g.base.hp = 0; g.over = true; g.phase = 'over';
    ev(g, 'twTimeout', {}); ev(g, 'gameover', { timeout: true });
    return;
  }
  if (T && (g.phase === 'wave' || g.phase === 'intro')) {
    if (T.curse && g.phase === 'wave') towerCurse(g, dt);
    if (!g.twa) towerAutoLane(g, dt); // (탑 리메이크: 멤버는 손으로 옮긴다)
    if (T.layers || T.dark) {
      const rv = FIELD.spawnY + (g.ropeY - FIELD.spawnY) * TOWER_SIM.dark.reveal;
      for (const e of g.enemies) {
        if (e.dead) continue;
        if (e.tLayMax && e.tLay < e.tLayMax) { if (e.noShieldT > 0) e.tLay = 0; else if ((e.tLayT -= dt) <= 0) { e.tLay++; e.tLayT = TOWER_SIM.shield.regen; } }
        if (e.cloak && !e.unveiled && (e.y > rv || e.sleeping || (e.hideT = (e.hideT || 0) + dt) > TOWER_SIM.dark.maxHide)) { e.unveiled = true; ev(g, 'unveil', { x: e.x, y: e.y - 30 }); } // 길 중간에 드러누운 진상 · 멈춘 진상도 결국 보인다 (못 잡아서 시간 초과 나지 않게)
      }
    }
  }
  if (g.saLanes && g.saLanes.length) {
    for (const q of g.saLanes) {
      q.t -= dt;
      for (const e of g.enemies) if (!e.dead && e.y > -20 && Math.abs(e.x - q.x) < q.w + (e.r || 14)) { e.slowT = Math.max(e.slowT, 0.3); e.slowMul = Math.min(e.slowMul || 1, e.boss ? 1 - q.slow * 0.5 : 1 - q.slow); }
    }
    g.saLanes = g.saLanes.filter((q) => q.t > 0);
  }
  if (g._hellBoom && g._hellBoom.length) {
    const list = g._hellBoom; g._hellBoom = [];
    g._inHellBoom = true;
    try {
      for (const b of list.slice(0, 12)) {
        ev(g, 'splash', { x: b.x, y: b.y, r: HELL_SET_FX.r, proj: 'bottle' });
        forEnemiesNear(g, b.x, b.y, HELL_SET_FX.r, (o) => { damageEnemy(g, o, b.dmg, false, b.h, true); return true; });
      }
    } finally { g._inHellBoom = false; }
  }
}
// 처치: 지옥 세트 4세트 화염 폭발 · 강병화 커튼콜 (원맨쇼 중 처치 → +0.5초)
function extraKill(g, e, src) {
  if (src && src.gear && src.gear.hellSet >= 4 && !g._inHellBoom && src.def && !src.def.summon) (g._hellBoom || (g._hellBoom = [])).push({ x: e.x, y: e.y, dmg: heroDamage(g, src) * HELL_SET_FX.boom, h: src });
  if (g.onemanT > 0 && !e.boss && (g.onemanExt || 0) < 3 && g.heroes.some((h) => h.sa && h.sa.curtain)) {
    g.onemanT += 0.5; g.onemanExt = (g.onemanExt || 0) + 0.5;
    for (const o of g.enemies) if (!o.dead && o !== e && !o.boss && !o.mid && o.danceT > 0) { o.stunT += 0.5; o.danceT += 0.5; }
  }
}
// 멤버 공격력 추가 배율: 스킬 증강 · 지옥 각성 · 속성 봉인
function heroExtraMul(g, h) {
  let m = (1 + (h.saAtk || 0)) * (h.awake >= 1 ? 1 + TOWER_AWAKE_FX.atk : 1) * (h._sigK || 1); // _sigK: 전용 신화 두 번째 발 세기
  const T = g.tower;
  if (T) m *= (TOWER_SIM.solo[h.id] || 1) * (T.fatK || 1); // 혼자인 탑: 지원형 멤버 보정 · 피로
  if (T && T.seal && h.def) { const a = h.def.attr; if (a === T.seal.weak) m *= lerpK(TOWER_SIM.seal.weak, T.k); else if (a === T.seal.strong) m *= lerpK(TOWER_SIM.seal.strong, T.k); }
  return m;
}
// 멤버 전용 스킬 증강 고르기
export function applySkillAug(g, heroId, augId) {
  const h = hasHero(g, heroId);
  const a = (SKILL_AUG[heroId] || []).find((x) => x.id === augId);
  if (!h || !a || (h.sa && h.sa[augId])) return false;
  h.sa = Object.assign({}, h.sa, { [augId]: true });
  h.saAtk = (h.saAtk || 0) + SKILL_AUG_W.atk;
  if (a.cm) { for (const [k, v] of Object.entries(a.cm.mul || {})) h.cm[k] = (h.cm[k] || 1) * v; for (const [k, v] of Object.entries(a.cm.add || {})) h.cm[k] = (h.cm[k] || 0) + v; }
  if (a.skCd) { h.skCdMul = (h.skCdMul || 1) * a.skCd; h.skillCd *= a.skCd; }
  if (a.skDmg) h.skDmg = (h.skDmg || 0) + a.skDmg;
  if (heroId === 'gunman' && augId === 'head') h.saCrit = (h.saCrit || 0) + 0.15;
  if (heroId === 'hyungyeong' && augId === 'target') g.markBonus = 0.2;
  if (heroId === 'soyoung' && augId === 'allin') g.saJy = 1.5;
  ev(g, 'skillAug', { hero: h.id, aug: augId, name: a.name, x: h.x, y: h.y });
  return true;
}
// 운영진 레드카드 연쇄: 첫 카드와 안 겹치는 가장 붐비는 곳에 한 장 더
function redChain(g, h, x, y, r, dmg, sk) {
  let best = null, bn = 0;
  for (const e of g.enemies) {
    if (e.dead || e.y < 0 || Math.hypot(e.x - x, e.y - y) < r * 1.4) continue;
    let n = 0; for (const o of g.enemies) if (!o.dead && Math.hypot(o.x - e.x, o.y - e.y) < r) n++;
    if (n > bn) { bn = n; best = e; }
  }
  if (!best) return;
  forEnemiesNear(g, best.x, best.y, r, (e) => {
    e.shield = 0; e.dictT = 0; e.gaoOn = false; e.goodsOn = false; e.noShieldT = 4; e.auraOffT = 4;
    damageEnemy(g, e, dmg, false, h, true);
    if (!e.dead) { e.slowT = Math.max(e.slowT, sk.slowSec * (e.boss ? 0.5 : 1)); e.slowMul = e.boss ? 0.7 : 0.4; }
    return true;
  });
  ev(g, 'skill', { hero: h.id, skill: sk.id, name: '레드카드 연쇄!', x: best.x, y: best.y, r, target: true, echo: true });
}
// 혼자인 탑: 멤버가 진상이 몰린 줄로 알아서 걸어간다 (자기 줄만 치는 멤버도 싸울 수 있게 · 손으로 옮기면 TOWER_SIM.laneHold 초 동안 그 자리)
function towerAutoLane(g, dt) {
  const h = g.heroes.find((o) => !o.def.summon && !o.gone);
  if (!h) return;
  if (h.laneX !== undefined && !h.out && !h.wsSt && !(h.wallSt && h.wallSt !== 'rest')) { // 한 걸음씩 (초당 170)
    const d = h.laneX - h.x, st = 170 * dt;
    h.x = Math.abs(d) <= st ? h.laneX : h.x + Math.sign(d) * st;
  }
  if ((g.laneT = (g.laneT || 0) - dt) > 0) return;
  g.laneT = 0.6;
  if (h.out || h.wsSt || (h.wallSt && h.wallSt !== 'rest') || h.frenzyT > 0 || h.burstT > 0) return;
  if (g.t - (g.swapAt === undefined ? -99 : g.swapAt) < TOWER_SIM.laneHold) { h.laneX = h.x; return; } // 손으로 옮긴 뒤엔 그 자리 그대로
  const d0 = h.def;
  const lw = h.id === 'hochan' ? d0.waveW[h.lv - 1] : h.id === 'sunggu' ? 14 : d0.proj === 'wall' ? d0.wall.w[h.lv - 1] * 0.8 : 0; // 자기 줄만 치는 폭
  const score = (x) => {
    let v = 0;
    for (const e of g.enemies) {
      if (e.dead || e.y < 0 || isHidden(e)) continue;
      const dx = Math.abs(e.x - x), w = lw ? lw + (e.r || 14) : 95;
      if (dx < w) v += (1 + (e.y / g.ropeY) * 2 + (e.atRope ? 3 : 0) + (e.boss || e.titan ? 3 : 0)) * (lw ? 1 : 1 - dx / (w * 1.6));
    }
    return v;
  };
  let best = h.x, bv = score(h.x) * 1.25 + 0.4;
  for (const e of g.enemies) { if (e.dead || e.y < 0) continue; const x = Math.max(24, Math.min(g.W - 24, e.x)); const v = score(x); if (v > bv) { bv = v; best = x; } }
  h.laneX = best;
}
const lerpK = (ab, k) => ab[0] + (ab[1] - ab[0]) * k;

// ─── 2026-10 대개편: 기본 공격마다 다른 비행 · 맞는 모양 ───────────────────
//  경로 투사체(안 따라감): curve 옆으로 휘는 장미 · wobble 흐느적 과자 · helix 나선 리본 · blink 세 번 끊어 점멸하는 손
//  낙하(stamp 운영진 경고 딱지) · 구르기(roll 백인규 덤벨) · 권총 연발(pistol 건전남) · 즉발 욕 번개(서명훈)
//  장판(g.zones: clock 오지은 시계 · fire 박나영 불 바닥 · tape 홍정민 붕대 벽 · floor 임수빈 댄스 플로어 · stage 김도훈 무대 · skid 백인규 타이어 자국)
//  퍼지는 고리(g.rings 김도훈 음파) · 화염 원뿔(박나영) · 화상(진상 burnT)
export function armorPctOf(g, e) { // 장이 깊을수록 단단 (스테이지 · 주간 · 헬만) — data.js armorPctStage
  if (g.mode !== 'stage' || g.pvp || g.raid || g.tower) return 0;
  return armorPctStage(g.stage || 1, e.def, e.elite);
}
// 방어율이 깎는 비율 (방관 멤버 · 모자이크 겹 · 모자이크 폭격 반영) — 화면(진상 정보)도 같은 식
export function armorCut(e, src) {
  if (!(e.armorPct > 0)) return 0;
  const pen = src && src.id ? ARMOR.pen[src.id] || 0 : 0;
  const sh = e.brkT > 0 ? 1 : Math.min(1, (e.shredT > 0 ? e.shredN : 0) * ARMOR.shredPer);
  return e.armorPct * (1 - pen) * (1 - sh);
}
// 경로 투사체: 출발 → (움직임을 조금 예측한) 표적 자리까지 정해진 길로 · 끝나면 그 방향으로 조금 더 날아가다 사라진다
function spawnPath(g, type, h, t, dmg, o) {
  const p = spawnProj(g, type, h, t, dmg, o);
  const sp = p.speed || 400, d0 = Math.hypot(t.x - p.sx, t.y - p.sy), tt = d0 / sp;
  const vy = t.atRope || t.stunT > 0 || t.tieT > 0 || !t.speed ? 0 : t.speed * (t.slowT > 0 ? t.slowMul : 1); // (자리만 준 경우 — 지팡이 고리 — 는 그대로)
  p.ex = t.x; p.ey = Math.min(t.y + vy * tt * 0.9, t.stopY || t.y);
  p.path = o.path; p.lt = 0; p.T = Math.max(0.18, Math.hypot(p.ex - p.sx, p.ey - p.sy) / sp); p.amp = o.amp || 0; p.side = o.side || 1; p.hop = -1; p.hopNow = false; p.depth = 1;
  p.homing = false; p.life = p.T + 0.5;
  return p;
}
function pathStep(g, p, dt) {
  p.lt += dt;
  const k = Math.min(1, p.lt / p.T), dx = p.ex - p.sx, dy = p.ey - p.sy, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  let off = 0, kk = k;
  if (p.path === 'curve') off = p.side * p.amp * 4 * k * (1 - k); // 장미: 한쪽으로 크게 휘었다가 표적에 꽂힌다
  else if (p.path === 'wobble') off = p.amp * Math.sin(k * Math.PI * 3) * (1 - k * 0.5); // 과자: 귀찮은 듯 흐느적
  else if (p.path === 'helix') { const ph = p.lt * 15; off = p.amp * Math.sin(ph); p.depth = Math.cos(ph); } // 리본: 나선 (앞뒤로 도는 깊이 → 그림 크기)
  else if (p.path === 'loop') { kk = Math.sin(k * Math.PI); off = p.side * p.amp * Math.sin(k * Math.PI * 2); if (k >= 0.5 && !p.turned) { p.turned = true; p.hitIds.length = 0; } } // 지팡이: 나갔다(0→1) 돌아온다(1→0) · 옆으로 고리 · 돌아올 땐 다시 맞는다
  else if (p.path === 'blink') { const n = Math.min(3, Math.floor(k * 3 + 0.001)); kk = n / 3; p.hopNow = n !== p.hop; p.hop = n; if (p.hopNow && n > 0) ev(g, 'blink', { x: p.sx + dx * kk, y: p.sy + dy * kk, hero: p.hero && p.hero.id }); } // 모자이크 손: 세 번 끊어 순간이동
  const ox = p.x, oy = p.y;
  p.x = p.sx + dx * kk + nx * off; p.y = p.sy + dy * kk + ny * off;
  if (dt > 0 && p.path !== 'blink') { p.vx = (p.x - ox) / dt; p.vy = (p.y - oy) / dt; }
  if (k >= 1 && p.path === 'loop') { p.dead = true; return; } // 손에 쏙
  if (k >= 1) { // 끝: 그 방향으로 조금 더 (빗나가면 사라짐)
    const sp = p.speed || 400; p.vx = (dx / L) * sp; p.vy = (dy / L) * sp; p.path = null; p.life = Math.min(p.life, 0.35); p.hopNow = false;
  }
}
// 운영진 경고 딱지: 하늘에서 표적 자리로 수직 낙하 → 쾅 (작은 원 · 레벨 · ★ 마다 넓어짐)
export function stampR(h) { const S = h.def.stamp; return (S.r[h.lv - 1] + S.star * Math.max(0, (h.star || 1) - 1)) * (h.cm.splash || 1); }
function spawnStamp(g, h, t, dmg) {
  const p = spawnLob(g, 'stamp', h, t, dmg, stampR(h) * (g.mapFx.splash || 1) * Math.min(BAL.splashCap, g.mods.splashMul), null);
  p.drop = true; p.T = h.def.stamp.fall; p.life = p.T + 1; p.sx = p.tx; p.sy = p.ty - 260; p.x = p.sx; p.y = p.sy; p.big = h.lv >= 5;
  return p;
}
function landStamp(g, p) {
  const h = p.hero, d = h.def, R0 = p.splash;
  ev(g, 'stampLand', { x: p.tx, y: p.ty, r: R0, big: p.big });
  let main = null, md = 1e9;
  forEnemiesNear(g, p.tx, p.ty, R0, (e) => { const dd = Math.hypot(e.x - p.tx, e.y - p.ty); if (dd < md) { md = dd; main = e; } return true; });
  forEnemiesNear(g, p.tx, p.ty, R0, (e) => {
    const fake = { hero: h, hitIds: [], dmg: p.dmg * (e === main ? 1 : d.stamp.side), headshot: false, critBonus: 0, homing: false, type: 'warn', pierce: e === main ? 0 : 9, slow: d.slow, slowSec: d.slowSec * g.mods.ctrlMul, stunChance: 0, kb: 0, splash: 0, x: e.x, y: e.y };
    if (e !== main) e.warnN = Math.min(Math.max(0, (d.warn.n | 0) - 2), e.warnN | 0); // 곁 진상: 경고는 강퇴 직전까지만 쌓인다 (강퇴는 정통으로 맞은 진상만)
    hitEnemy(g, fake, e);
    return true;
  });
}
// 홍정민 소주병 휘두르기: 자기 앞 반원 (입구 앞 진상들) · 살짝 밀치고 · 맞은 진상은 흉터 눈빛에 잠깐 입구를 덜 세게 친다
function swingHit(g, h, dmg) {
  const S = h.def.swing, R = heroRange(g, h, true), cx0 = h.x, cy0 = h.y - 20;
  let n = 0;
  forEnemiesNear(g, cx0, cy0 - R * 0.5, R, (e) => {
    if (e.y > cy0 + 20 || n >= S.max) return true;
    const dx = e.x - cx0, dy = e.y - cy0; if (dx * dx + dy * dy > (R + e.r) * (R + e.r)) return true;
    if (Math.abs(Math.atan2(dx, -dy)) > S.arc) return true;
    n++;
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, e, dmg * (n === 1 ? 1 : S.side) * (crit ? g.mods.critMul : 1), crit, h, n > 1);
    if (!e.dead) { if (!e.boss) applyKnockback(e, S.kb, g); e.glareT = S.glare; }
    return true;
  });
  ev(g, 'jmSwing', { x: h.x, y: h.y - 30, r: R, arc: S.arc, n });
}
// 서명훈 욕 번개: 비행 없이 입에서 바로 지그재그로 튄다 (가장 빠른 진상부터) · 맞을 때마다 얼음 한 겹 (빠른 진상 두 겹) → 다 쌓이면 얼어붙음
function swearZap(g, h, t, dmg, bounces, bomb) {
  const I = h.def.ice, lv = h.lv - 1, list = [t];
  let cur = t;
  for (let k = 0; k < bounces; k++) {
    let best = null, bd = I.reach * I.reach;
    for (const o of g.enemies) { if (o.dead || o.y < -20 || list.includes(o) || isHidden(o)) continue; const d2 = (o.x - cur.x) ** 2 + (o.y - cur.y) ** 2; if (d2 < bd) { bd = d2; best = o; } }
    if (!best) break;
    list.push(best); cur = best;
  }
  let px = h.x, py = h.y - 44, dc = dmg;
  list.forEach((e, i) => {
    ev(g, 'chain', { x: px, y: py, x2: e.x, y2: e.y - 20, first: i === 0, hero: h.id });
    px = e.x; py = e.y - 20;
    const crit = g.rng() < critOf(g, h);
    const bonus = (e.stunT > 0 ? h.def.stunnedBonus[lv] : 1) * (e.form === 'reveal' ? h.def.revealBonus : 1) * (e.fast || e.speed >= 60 ? I.fastMul : 1);
    damageEnemy(g, e, dc * bonus * (crit ? g.mods.critMul : 1), crit, h, i > 0);
    dc *= I.decay;
    if (e.dead) return;
    if (e.fast || e.speed >= 60) { e.slowT = Math.max(e.slowT, 1); e.slowMul = Math.min(e.slowMul || 1, 0.25); } // 빠른 진상: 욕 한 방에 발이 얼어붙는다
    e.iceN = (e.iceT > 0 ? e.iceN | 0 : 0) + (e.fast || e.speed >= 60 ? 2 : 1) + (bomb ? 1 : 0); e.iceT = I.keep;
    if (e.iceN >= I.need) { e.iceN = 0; e.iceT = 0; if (!e.boss) { e.stunT = Math.max(e.stunT, I.sec[lv] * stunMul(e) * g.mods.ctrlMul * (h.cm.ctrl || 1)); e.frozenT = I.sec[lv]; ev(g, 'iceFreeze', { x: e.x, y: e.y - e.def.size * 0.5, r: e.r }); } else { e.slowT = Math.max(e.slowT, 1.5); e.slowMul = Math.min(e.slowMul || 1, 0.6); } }
  });
}
// 오지은 시계: 표적 위에 시계가 스르륵 떠올라 째깍 (작은 피해) → 시계가 남아 있는 동안 그 자리 진상 느리게
function spawnClock(g, h, t, dmg) {
  const C = h.def.clock, lv = h.lv - 1;
  const vy = t.atRope || t.stunT > 0 ? 0 : t.speed * (t.slowT > 0 ? t.slowMul : 1);
  const z = { kind: 'clock', x: t.x, y: Math.min(t.y + vy * C.delay, t.stopY || t.y), r: C.r[lv] * (h.cm.splash || 1), t: C.delay + C.sec[lv] + (h.cm.slowSec || 0), max: C.delay + C.sec[lv] + (h.cm.slowSec || 0), delay: C.delay, dmg, hero: h, tick: 0, slow: Math.min(0.7, h.def.slow + (h.cm.slowX || 0)), hit: false };
  (g.zones || (g.zones = [])).push(z);
  ev(g, 'clockUp', { x: z.x, y: z.y, r: z.r, sec: z.t });
}
// 김도훈 음파 고리: 0.45초 동안 반경이 커지며 고리가 지나가는 진상만 맞는다 (도넛)
function spawnRing(g, h, dmg, R, o = {}) {
  (g.rings || (g.rings = [])).push({ x: h.x, y: h.y - 30, r: 0, R, T: o.T || 0.45, t: 0, dmg, hero: h, hit: [], max: o.max || 99, groove: !!o.groove, n: 0, kind: o.kind || 'sound' });
  ev(g, 'ringOut', { x: h.x, y: h.y - 30, R, T: o.T || 0.45, kind: o.kind || 'sound' });
}
function updateRings(g, dt) {
  for (const q of g.rings) {
    q.t += dt;
    const r0 = q.r; q.r = q.R * Math.min(1, q.t / q.T);
    forEnemiesNear(g, q.x, q.y, q.r, (e) => {
      if (q.n >= q.max || q.hit.includes(e.uid)) return true;
      const d = Math.hypot(e.x - q.x, e.y - q.y);
      if (d + e.r < r0) return true; // 이미 지나간 안쪽
      q.hit.push(e.uid); q.n++;
      const h = q.hero;
      damageEnemy(g, e, q.dmg, false, h, true);
      if (!e.dead && q.groove && h.def.groove) { e.grooveT = Math.max(e.grooveT || 0, h.def.groove.sec); e.grooveBy = h.id; }
      if (h.def.crowd && g.phase !== 'test') crowdAdd(g, h, 1); // 떼창 게이지
      return true;
    });
  }
  g.rings = g.rings.filter((q) => q.t < q.T);
}
// 김도훈 떼창 게이지: 음파에 맞은 진상 수만큼 차고 → 다 차면 "떼창!" 곁 멤버 공속 ↑ · 상태이상 걸린 멤버 하나 풀기
function crowdAdd(g, h, n) {
  const C = h.def.crowd;
  h.crowd = Math.min(100, (h.crowd || 0) + n * C.per * (h.lv >= 3 ? 1.25 : 1));
  if (h.crowd < 100) return;
  h.crowd = 0;
  const sec = C.sec + (h.lv >= 5 ? 1 : 0);
  let fixed = null;
  for (const o of g.heroes) { if (o.def.summon) continue; o.chantT = sec; if (!fixed && cleanseHero(o, 0.2)) { fixed = o; o.ccImmT = Math.max(o.ccImmT || 0, 1); } }
  g.chantSpd = C.spd[h.lv - 1];
  ev(g, 'chant', { x: h.x, y: h.y, hero: h.id, fixed: fixed ? fixed.id : null, fx: fixed ? fixed.x : 0, fy: fixed ? fixed.y : 0 });
}
// 박나영 불 뿜기: 짧은 부채꼴 화염 (최대 n명) · 맞은 진상 화상 (겹칠수록 세게) · Lv3 부채꼴 끝에 불 붙은 바닥
function breathFire(g, h, t, dmg) {
  const B = h.def.breath, lv = h.lv - 1, R = heroRange(g, h, true), ox = h.x, oy = h.y - 46;
  const ang = Math.atan2(t.y - oy, t.x - ox), half = B.cone[lv];
  const hits = [];
  for (const e of g.enemies) {
    if (e.dead || e.y < -20 || isHidden(e)) continue;
    const dx = e.x - ox, dy = e.y - oy, d = Math.hypot(dx, dy);
    if (d > R + e.r) continue;
    let da = Math.abs(Math.atan2(dy, dx) - ang); if (da > Math.PI) da = Math.PI * 2 - da;
    if (da > half + Math.atan2(e.r, Math.max(1, d))) continue;
    hits.push([d, e]);
  }
  hits.sort((a, b) => a[0] - b[0]);
  const n = Math.min(hits.length, B.max + (h.cm.bounce || 0));
  for (let i = 0; i < n; i++) {
    const e = hits[i][1], crit = g.rng() < critOf(g, h);
    damageEnemy(g, e, dmg * (i === 0 ? 1 : B.side) * (crit ? g.mods.critMul : 1), crit, h, i > 0);
    if (!e.dead) burnOn(g, e, h, dmg * B.burn, B.burnSec);
  }
  const tx = ox + Math.cos(ang) * R * 0.85, ty = oy + Math.sin(ang) * R * 0.85;
  if (lv >= 2) (g.zones || (g.zones = [])).push({ kind: 'fire', x: tx, y: ty, r: B.ground.r * (lv >= 4 ? 1.25 : 1) * (g.mapFx.splash || 1), t: B.ground.sec, max: B.ground.sec, dps: dmg * B.ground.dps, hero: h, tick: 0 });
  ev(g, 'breath', { hero: h.id, x: ox, y: oy, a: ang, half, r: R, n, ground: lv >= 2, tx, ty });
}
// 화상: 3초 동안 0.5초마다 (겹칠 때마다 세게 · 최대 3겹) — 방어율 무시
export function burnOn(g, e, h, dps, sec) {
  const B = BURN;
  e.burnN = Math.min(B.max + (h && h.sa && h.sa.blaze ? 2 : 0), (e.burnT > 0 ? e.burnN | 0 : 0) + 1);
  e.burnDps = Math.max(e.burnT > 0 ? e.burnDps || 0 : 0, dps); e.burnT = sec; e.burnBy = h;
}
function statusTick(g, dt) {
  for (const e of g.enemies) {
    if (e.dead) continue;
    if (e.iceT > 0) e.iceT -= dt;
    if (e.frozenT > 0) e.frozenT -= dt;
    if (e.glareT > 0) e.glareT -= dt;
    if (e.roseT > 0 && (e.roseT -= dt) <= 0) e.roseN = 0;
    if (e.censorT > 0) e.censorT -= dt;
    if (e.danceT > 0) e.danceT -= dt;
    if (e.burnT > 0) {
      e.burnT -= dt; e.burnTick = (e.burnTick || 0) - dt;
      if (e.burnTick <= 0) { e.burnTick = BURN.tick; g._dot = true; damageEnemy(g, e, e.burnDps * BURN.tick * (1 + BURN.stack * ((e.burnN || 1) - 1)), false, e.burnBy && g.heroes.includes(e.burnBy) ? e.burnBy : null, true); g._dot = false; }
    }
  }
}
// 장판: 시계(감속) · 불 바닥(화상) · 붕대 벽(막기) · 댄스 플로어(박자마다) · 노래방 무대(춤) · 타이어 자국(감속)
function updateZones(g, dt) {
  for (const z of g.zones) {
    z.t -= dt;
    const h = z.hero;
    if (z.kind === 'clock') {
      if (!z.hit && z.max - z.t >= z.delay) { // 째깍: 가운데 진상 제 피해 · 곁은 40%
        z.hit = true; let main = null, md = 1e9;
        forEnemiesNear(g, z.x, z.y, z.r, (e) => { const d = Math.hypot(e.x - z.x, e.y - z.y); if (d < md) { md = d; main = e; } return true; });
        forEnemiesNear(g, z.x, z.y, z.r, (e) => { const crit = g.rng() < critOf(g, h); damageEnemy(g, e, z.dmg * (e === main ? 1 : 0.4) * (crit ? g.mods.critMul : 1), crit, h, e !== main); return true; });
        ev(g, 'clockTick', { x: z.x, y: z.y, r: z.r });
        if (h) { h.alt = true; h.altT = Math.max(h.altT || 0, h.def.demon.sec); }
      }
      if (z.hit) forEnemiesNear(g, z.x, z.y, z.r, (e) => { const s = e.boss ? z.slow * 0.5 : z.slow; e.slowT = Math.max(e.slowT, 0.25); e.slowMul = Math.min(e.slowT > 0.25 ? e.slowMul : 1, 1 - s); return true; });
    } else if (z.kind === 'fire' || z.kind === 'skid') {
      if ((z.tick -= dt) <= 0) {
        z.tick += 0.25;
        forEnemiesNear(g, z.x, z.y, z.r, (e) => {
          if (z.kind === 'fire') { if (h) burnOn(g, e, h, z.dps * (h.sig && h.sig.burnUp ? 1 + h.sig.burnUp : 1), 1.2); }
          else { e.slowT = Math.max(e.slowT, 0.4); e.slowMul = Math.min(e.slowMul || 1, 1 - z.slow); }
          return true;
        });
      }
    } else if (z.kind === 'iceline') { // 송바울 총출동 빙판 길: 지나가는 진상 미끄러져 느려진다
      if ((z.tick -= dt) <= 0) { z.tick += 0.2; for (const e of g.enemies) if (!e.dead && segDist(e.x, e.y, z.x, z.y, z.x2, z.y2) < z.w + e.r) { e.slowT = Math.max(e.slowT, 0.4); e.slowMul = Math.min(e.slowMul || 1, 1 - z.slow * (e.boss ? 0.5 : 1)); } }
    } else if (z.kind === 'fuse') { // 최은옥 시한폭탄: 다 타면 펑
      if (z.t <= 0) landLob(g, z.p);
    } else if (z.kind === 'dive') { // 박나영 급강하: 그림자 예고가 끝나면 쾅 → 불꽃 고리
      if (z.t <= 0) {
        forEnemiesNear(g, z.x, z.y, z.r, (e) => {
          const crit = g.rng() < critOf(g, h);
          damageEnemy(g, e, z.dmg * (crit ? g.mods.critMul : 1), crit, h, true);
          if (e.dead) return true;
          burnOn(g, e, h, z.dmg * 0.12, 3);
          if (!e.boss) { const a = Math.atan2(e.y - z.y, e.x - z.x); e.x = clamp(e.x + Math.cos(a) * z.kb * 0.5, 16, g.W - 16); applyKnockback(e, Math.max(8, -Math.sin(a) * z.kb), g); }
          return true;
        });
        const ext = (h && h.sig && h.sig.burnUp) ? 1 : 0;
        g.zones.push({ kind: 'fire', x: z.x, y: z.y, r: z.r * 0.95, t: z.ring.sec + ext, max: z.ring.sec + ext, dps: z.dmg * z.ring.dps / 3, hero: h, tick: 0, ring: true });
        ev(g, 'diveLand', { x: z.x, y: z.y, r: z.r });
        if (z.twin) { const c = densestPoint(g, z.x, z.y, 400, z.r); if (c) { g.zones.push({ kind: 'dive', x: c.x, y: c.y, r: z.r, t: 1, max: 1, dmg: z.dmg * 0.6, hero: h, kb: z.kb, ring: z.ring, twin: false }); ev(g, 'diveUp', { x: z.x, y: z.y, tx: c.x, ty: c.y, r: z.r, air: 1 }); } }
      }
    } else if (z.kind === 'drift') { // 백인규 할리 드리프트: 달려가서(go) → 원을 그리며 (원 안 따끔 + 바깥으로 튕김) → 타이어 자국
      const el = z.max - z.t;
      if (el >= z.go && (z.tick -= dt) <= 0) {
        z.tick += 0.2;
        forEnemiesNear(g, z.x, z.y, z.r, (e) => {
          damageEnemy(g, e, z.dmg * 0.2 / 0.25, false, h, true);
          if (!e.dead && !e.boss && !e.mid) { const a = Math.atan2(e.y - z.y, e.x - z.x), d0 = Math.hypot(e.x - z.x, e.y - z.y); if (d0 < z.r * 0.9) { e.x = clamp(e.x + Math.cos(a) * z.kb * 0.35, 16, g.W - 16); e.y += Math.sin(a) * z.kb * 0.35; e.baseX = e.x; } }
          return true;
        });
      }
      if (z.t <= 0 && z.skid) { g.zones.push({ kind: 'skid', x: z.x, y: z.y, r: z.r, t: z.skid.sec, max: z.skid.sec, slow: z.skid.slow, tick: 0, hero: h }); ev(g, 'driftEnd', { x: z.x, y: z.y, r: z.r }); }
    } else if (z.kind === 'tape') { // 붕대 벽: 줄(가로) 위에서 진상이 멈춘다 · 맞으면 벽 체력이 깎인다
      for (const e of g.enemies) {
        if (e.dead || e.boss || Math.abs(e.x - z.x) > z.w / 2 + e.r) continue;
        if (e.y < z.y && e.y > z.y - 26 - e.r && !e.fleeing) { e.y = Math.min(e.y, z.y - 6); e.tapeT = 0.2; z.hp -= (e.atk || 5) * dt * 0.8; }
      }
      if ((z.tick -= dt) <= 0) { z.tick += 0.5; for (const e of g.enemies) if (!e.dead && e.tapeT > 0 && Math.abs(e.x - z.x) < z.w / 2 + e.r) damageEnemy(g, e, z.dps * 0.5, false, h, true); }
      if (z.hp <= 0) { z.t = 0; ev(g, 'tapeBreak', { x: z.x, y: z.y, w: z.w }); }
    } else if (z.kind === 'floor' || z.kind === 'stage') { // 박자마다: 범위 진상 춤 (멈춤) + 피해 · 마지막 박자는 크게
      z.beatT -= dt;
      if (z.beatT <= 0 && z.beats > 0) {
        z.beatT += z.beat; z.beats--;
        const last = z.beats === 0;
        forEnemiesNear(g, z.x, z.y, z.r, (e) => {
          const crit = g.rng() < critOf(g, h);
          damageEnemy(g, e, z.dmg * (last ? z.lastMul : 1) * (crit ? g.mods.critMul : 1), crit, h, true);
          if (e.dead) return true;
          if (z.kind === 'floor') { ch8Tie(g, e, z.tie, h, true); e.tieAmp = Math.max(e.tieAmpT > 0 ? e.tieAmp || 0 : 0, z.amp); e.tieAmpT = Math.max(e.tieAmpT || 0, z.ampSec); }
          else if (!e.boss) { e.stunT = Math.max(e.stunT, z.dance * stunMul(e)); e.danceT = Math.max(e.danceT || 0, z.dance); } else { e.slowT = Math.max(e.slowT, z.dance); e.slowMul = Math.min(e.slowMul || 1, 0.5); }
          return true;
        });
        if (z.kind === 'stage') for (const e of g.enemies) if (!e.dead && Math.hypot(e.x - z.x, e.y - z.y) < z.r * 1.6 && Math.hypot(e.x - z.x, e.y - z.y) > z.r * 0.6) { e.x += (z.x - e.x) * 0.12; e.y += (z.y - e.y) * 0.06; e.baseX = e.x; } // 무대로 끌려온다
        ev(g, 'beat', { kind: z.kind, x: z.x, y: z.y, r: z.r, last, hero: h ? h.id : '' });
      }
    }
  }
  g.zones = g.zones.filter((z) => z.t > 0);
}
// 건전남 권총: 한 발씩 정확하게 · Lv2 두 발 · Lv4 세 발 (같은 표적에 탕탕) · Lv3 관통 · Lv5 도탄 · ★3 치명 +10% · 진화 = 3발째마다 헤드샷
function pistolShot(g, h, t, i) {
  const d = h.def, P = d.pistol, lv = h.lv - 1;
  const farCut = d.far && Math.hypot(t.x - h.x, t.y - h.y) > d.far.r ? d.far.mul : 1;
  const head = (h.evo || (h.sa && h.sa.head)) && h.shots % 3 === 0 && i === 0;
  const p = spawnProj(g, 'pistol', h, null, heroDamage(g, h) * P.each[lv] * farCut, { angle: aimAngle(h, t, P.speed), speed: P.speed, r: 6, pierce: g.mods.pierce + (lv >= 2 ? 1 : 0) + (h.cm.pierce || 0), critBonus: (d.critBonus || 0) + ((h.star || 1) >= 3 ? 0.1 : 0), headshot: head, big: head });
  p.ric = lv >= 4 ? P.ric : 0; p.maxDist = 1500;
  h.lastShotT = g.t; h.recoil = 0.1;
  ev(g, 'pistol', { hero: h.id, x: h.x, y: h.y - 40, i, head });
}
// 송바울 수동 보드 (탭한 곳으로만 돌진 — 기본 공격 없음): 보드 충전 칸 · 이어 타기 콤보 · 퍼펙트 연결
export function boardCharges(h) { return h.bd ? Math.floor(h.bd.ch + 1e-6) : h.def.board.charges[h.lv - 1]; }
// 조준 스킬: 찍은 곳 (안 찍었으면 — 메아리 · 자동 — 진상이 가장 몰린 곳 · 아무도 없으면 입구 앞)
function aimAt(g, h, x, y, r) {
  if (x !== undefined && y !== undefined) return { x: clamp(x, 16, g.W - 16), y: clamp(y, 40, g.ropeY - 8) };
  const c = densestPoint(g, h.x, h.y, 2000, Math.max(40, r || 60));
  return c ? { x: c.x, y: c.y } : { x: h.x, y: g.ropeY - 160 };
}
// 배현경 통통: 땅을 쿵 → 진상 쪽으로 땅이 갈라지는 직선 충격파 (줄 위 전부 · 밀침 · 다이어트 게이지)
function quakeLine(g, h, t, dmg) {
  const Q = h.def.quake, lv = h.lv - 1, R = heroRange(g, h, true) * (lv >= 2 ? 1.15 : 1), w = Q.w * (lv >= 4 ? 1.4 : lv >= 2 ? 1.2 : 1);
  const ox = h.x, oy = h.y - 10, a = Math.atan2(t.y - oy, t.x - ox), ex = ox + Math.cos(a) * R, ey = oy + Math.sin(a) * R;
  let n = 0;
  for (const e of g.enemies) {
    if (e.dead || e.y < -20 || segDist(e.x, e.y, ox, oy, ex, ey) > w + e.r) continue;
    n++;
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, e, dmg * Q.mul * (crit ? g.mods.critMul : 1), crit, h, n > 1);
    if (!e.dead && !e.boss) applyKnockback(e, Q.kb, g);
  }
  h.meter = Math.min(100, h.meter + h.def.diet.perSlam[lv]);
  h.slamAt = g.t;
  ev(g, 'quake', { x: ox, y: oy, x2: ex, y2: ey, w, n, hero: h.id });
}
// 강병화 핀 조명: 진상이 가장 몰린 곳에 조명 → 근처 진상(최대 coneMax)이 가운데로 끌려와 홀린다 (보스는 느려짐)
function spotPull(g, h, t, dmg) {
  const d = h.def, lv = h.lv - 1, S = d.spot, R = S.r[lv];
  const c = densestPoint(g, h.x, h.y, heroRange(g, h, true), R) || t;
  const max = d.coneMax + (h.sa && h.sa.stage ? 2 : 0);
  const near = g.enemies.filter((e) => !e.dead && e.y > -20 && Math.hypot(e.x - c.x, e.y - c.y) < R * 1.6 + e.r).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y)).slice(0, max);
  for (const e of near) {
    const crit = g.rng() < critOf(g, h);
    damageEnemy(g, e, dmg * (crit ? g.mods.critMul : 1), crit, h, true);
    if (e.dead) continue;
    if (!e.boss && !e.mid && !(e.def.traits && e.def.traits.kbImmune)) { e.x += (c.x - e.x) * S.pull; e.y += (c.y - e.y) * S.pull * 0.7; e.baseX = e.x; }
    if (e.boss || e.def.charmImmune) { e.slowT = Math.max(e.slowT, 1); e.slowMul = Math.min(e.slowMul || 1, 0.7); }
    else e.stunT = Math.max(e.stunT, (d.charm[lv] + (h.sa && h.sa.stage ? 0.3 : 0) + (lv >= 2 ? 0.1 : 0)) * stunMul(e));
  }
  ev(g, 'spotlight', { x: c.x, y: c.y, r: R, hx: h.x, hy: h.y - 60, n: near.length });
}
// 정원식 반격: 곁의 진상이 입구를 치면 바로 받아치는 카운터 펀치
function counterPunch(g, e) {
  const ws = g.heroes.find((o) => o.def.counter && !o.gone && o.stunT <= 0 && o.charmT <= 0);
  if (!ws) return;
  const C = ws.def.counter;
  if (Math.abs(e.x - ws.x) > ws.def.guard.r * (ws.cm.guardR || 1) || g.t - (ws.ctrT || -9) < C.cd) return;
  ws.ctrT = g.t; ws.lastShotT = g.t; ws.recoil = 0.14;
  const crit = g.rng() < critOf(g, ws);
  damageEnemy(g, e, heroDamage(g, ws) * C.mul * (crit ? g.mods.critMul : 1), crit, ws, false);
  if (!e.dead) applyKnockback(e, C.kb, g);
  ev(g, 'counter', { x: e.x, y: e.y - 20, hx: ws.x, hy: ws.y - 40 });
}
// 여지원 검열 완료 진상이 쓰러짐: 픽셀 폭발 → 주변 피해 + 모자이크 2겹 번짐
function censorPop(g, e) {
  const h = e.censorBy, C = h.def.censor, R = C.r * (h.lv >= 5 ? 1.3 : 1), dmg = heroDamage(g, h) * C.mul;
  e.censorT = 0;
  forEnemiesNear(g, e.x, e.y, R, (o) => {
    if (o === e || o.dead) return true;
    o.shredPer = h.def.shred.per; o.shredN = Math.min(h.def.shred.max, (o.shredT > 0 ? o.shredN : 0) + 2); o.shredT = h.def.shred.sec;
    damageEnemy(g, o, dmg, false, h, true);
    return true;
  });
  ev(g, 'pixelPop', { x: e.x, y: e.y - 14, r: R });
}
// ── 송바울 수동 보드 (탭한 곳으로만) ──
function boardInit(h) {
  const B = h.def.board;
  h.bd = { st: 'ride', ch: B.charges[h.lv - 1], refT: 0, idleT: 0, combo: 0, lastLand: -9, q: null, hit: new Set(), tx: 0, ty: 0 };
  h.px = h.x; h.py = h.y;
}
export function setBoardAim(g, x, y) {
  const h = g.heroes.find((o) => o.def.proj === 'board' && !o.gone);
  if (!h || y > g.ropeY + 6 || y < 24) return null;
  if (!h.bd) boardInit(h);
  const b = h.bd, P = { x: clamp(x, 20, g.W - 20), y: clamp(y, 70, g.ropeY - 16), t: g.t };
  if (h.stunT > 0 || h.charmT > 0 || h.grabT > 0 || h.kdT > 0) return null;
  if (b.st === 'dash' || b.st === 'air') { b.q = P; return h; } // 타는 중에 탭: 다음 곳 예약 (착지 직전이면 퍼펙트)
  if (b.ch < 1) { ev(g, 'boardEmpty', { x: h.px, y: h.py - 40 }); return h; }
  boardGo(g, h, P, false);
  return h;
}
function boardGo(g, h, P, perfect) {
  const B = h.def.board, b = h.bd, lv = h.lv - 1;
  const fever = b.fever > 0 && h.def.skill.fever;
  if (!fever) b.ch -= 1;
  b.idleT = 0; b.sx = h.px; b.sy = h.py;
  const comboOk = g.t - b.lastLand < B.combo.win && b.lastHit;
  b.combo = comboOk ? Math.min(B.combo.max, b.combo + 1) : 0;
  b.perfect = !!perfect;
  b.st = 'dash'; b.hit = new Set(); b.tx = P.x; b.ty = P.y;
  b.dmg = heroDamage(g, h) * B.mul * (1 + B.combo.per * b.combo) * (perfect ? B.perfect.mul : 1) * (h.sa && h.sa.glow ? 1.25 : 1) * (fever ? 1 + fever.dmg : 1);
  b.feverDash = !!fever;
  h.out = true; h.lastShotT = g.t; h.recoil = 0.14; h.shots++;
  b.face = b.tx < h.px ? -1 : 1;
  ev(g, 'boardDash', { hero: h.id, x: h.px, y: h.py, tx: b.tx, ty: b.ty, aimed: true, left: Math.floor(b.ch), combo: b.combo, perfect: !!perfect });
}
function updateBoard(g, h, dt, rate) {
  const B = h.def.board, lv = h.lv - 1;
  if (!h.bd) boardInit(h);
  const b = h.bd, maxCh = B.charges[lv] + ((h.sig && h.sig.boardUses) ? 1 : 0);
  if (b.fever > 0 && b.st !== 'air') b.fever -= dt;
  if (b.ch < maxCh) { b.refT += dt * rate * (h.fanT > 0 ? 1 + (h.fanSpd || 0) : 1); const rf = B.refill[lv]; if (b.refT >= rf) { b.refT -= rf; b.ch = Math.min(maxCh, b.ch + 1); ev(g, 'boardCharge', { x: h.px, y: h.py - 50, n: Math.floor(b.ch) }); } } else b.refT = 0;
  if (b.st === 'air') { // 팬클럽 점프대: 날아올라 → 착지 쾅
    b.airT += dt; const k = Math.min(1, b.airT / b.airMax);
    h.px = b.ax + (b.tx - b.ax) * k; h.py = b.ay + (b.ty - b.ay) * k; h.airH = Math.sin(k * Math.PI) * 120;
    if (k >= 1) {
      h.airH = 0;
      forEnemiesNear(g, b.tx, b.ty, b.jr, (e) => {
        const crit = g.rng() < critOf(g, h);
        damageEnemy(g, e, b.jdmg * (crit ? g.mods.critMul : 1), crit, h, true);
        if (!e.dead && !e.boss) { const a = Math.atan2(e.y - b.ty, e.x - b.tx), kb = b.jkb * (1 - Math.min(0.6, Math.hypot(e.x - b.tx, e.y - b.ty) / (b.jr * 2))); e.x = clamp(e.x + Math.cos(a) * kb * 0.6, 16, g.W - 16); applyKnockback(e, Math.max(10, -Math.sin(a) * kb), g); if (h.sig && h.sig.stun) e.stunT = Math.max(e.stunT, h.sig.stun * stunMul(e)); }
        return true;
      });
      if (b.ice) (g.zones || (g.zones = [])).push({ kind: 'skid', x: b.tx, y: b.ty, r: b.jr, t: 4, max: 4, slow: 0.45, tick: 0, hero: h, snow: true }); // 미끄러운 눈길
      ev(g, 'jumpLand', { x: b.tx, y: b.ty, r: b.jr, hero: h.id });
      if (b.twice) { b.twice = false; const c = densestPoint(g, b.tx, b.ty, 220, b.jr); if (c) { b.ax = b.tx; b.ay = b.ty; b.tx = c.x; b.ty = c.y; b.airT = 0; b.airMax *= 0.7; b.jdmg *= 0.6; ev(g, 'jumpUp', { x: b.ax, y: b.ay, tx: c.x, ty: c.y, r: b.jr, air: b.airMax }); return; } }
      b.st = 'ride'; b.lastLand = g.t; b.lastHit = true; b.idleT = 0;
    }
    return;
  }
  if (b.st === 'home') { // 탭이 없으면 자리로 천천히 미끄러져 돌아간다 (때리지 않음)
    const dx = h.x - h.px, dy = h.y - h.py, d = Math.hypot(dx, dy), sp = B.speed * 0.5 * dt;
    if (d <= sp + 1) { h.px = h.x; h.py = h.y; h.out = false; b.st = 'ride'; }
    else { h.px += (dx / d) * sp; h.py += (dy / d) * sp; }
    return;
  }
  if (b.st === 'dash') {
    const dx = b.tx - h.px, dy = b.ty - h.py, d = Math.hypot(dx, dy), sp = B.speed * dt;
    const ox = h.px, oy = h.py;
    if (d <= sp) { h.px = b.tx; h.py = b.ty; } else { h.px += (dx / d) * sp; h.py += (dy / d) * sp; }
    for (const e of g.enemies) {
      if (e.dead || e.y < -10 || b.hit.has(e)) continue;
      if (segDist(e.x, e.y - 6, ox, oy, h.px, h.py) > B.w * (h.sa && h.sa.glow ? 1.4 : 1) + (e.r || 14)) continue;
      b.hit.add(e);
      const crit = g.rng() < critOf(g, h);
      damageEnemy(g, e, b.dmg * (b.hit.size === 1 ? 1 : B.chain) * (crit ? g.mods.critMul : 1), crit, h, false);
      if (!e.dead && !e.boss) { applyKnockback(e, B.kb, g); if (lv >= 4) e.stunT = Math.max(e.stunT, B.daze * stunMul(e)); if (b.perfect) e.stunT = Math.max(e.stunT, B.perfect.stun * stunMul(e)); }
    }
    if (d <= sp) {
      if (b.feverDash) { const F = h.def.skill.fever; (g.zones || (g.zones = [])).push({ kind: 'iceline', x: b.sx, y: b.sy, x2: h.px, y2: h.py, w: F.w, slow: F.slow, t: F.trail, max: F.trail, tick: 0, hero: h }); } // 총출동: 지나간 길이 빙판
      b.st = 'ride'; b.lastLand = g.t; b.lastHit = b.hit.size > 0; b.idleT = 0;
      if (b.hit.size >= 3) ev(g, 'boardCombo', { x: h.px, y: h.py, n: b.hit.size });
      if (b.combo >= 1 && b.lastHit) ev(g, 'boardChain', { x: h.px, y: h.py - 50, n: b.combo + 1 });
      if (b.q) { const q = b.q; b.q = null; const perfect = g.t - q.t <= B.perfect.win + Math.max(0, sp / B.speed) + 0.02 && b.lastHit; if (b.ch >= 1) boardGo(g, h, q, perfect); else ev(g, 'boardEmpty', { x: h.px, y: h.py - 40 }); } // 착지 직전(0.3초 안)에 찍었으면 퍼펙트
    }
    return;
  }
  // ride: 보드 위에서 살랑살랑 — 탭을 기다린다 (자동 돌진 없음) · 한참 안 찍으면 자리로
  if (h.out) { b.idleT += dt; if (b.idleT > B.idle) b.st = 'home'; }
}
// 밸런스 봇용: 송바울을 사람처럼 탭 (진상이 가장 많이 줄 선 곳)
export function boardAutoTarget(g) {
  const h = g.heroes.find((o) => o.def.proj === 'board' && !o.gone);
  if (!h) return null;
  const B = h.def.board, sx = h.px !== undefined ? h.px : h.x, sy = h.py !== undefined ? h.py : h.y;
  let best = null, bn = 0;
  for (const e of g.enemies) {
    if (e.dead || e.y < 20 || isHidden(e)) continue;
    const dx = e.x - sx, dy = e.y - sy, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, B.reach / d) * 1.1, ex = sx + dx * k, ey = sy + dy * k;
    let n = 0;
    for (const o of g.enemies) { if (o.dead || o.y < 0) continue; if (segDist(o.x, o.y, sx, sy, ex, ey) < B.w + (o.r || 14)) n += o.boss || o.mid ? 2 : 1; }
    n += (e.y / g.ropeY) * 0.8;
    if (n > bn) { bn = n; best = { x: ex, y: ey }; }
  }
  return best;
}

// (10/08 고르는 맛) 카드 건너뛰기 — 긴장감 판: 대신 입구 PICK_SKIP.heal 회복 · 기세 +PICK_SKIP.mom
export function skipPick(g) {
  if (!(g.pendingLevels > 0)) return false;
  g.pendingLevels--; g.pickN = (g.pickN | 0) + 1;
  if (g.welcomePicks > 0) g.welcomePicks--;
  if (g.base && !g.over) healDoor(g, 'card', g.base.max * PICK_SKIP.heal);
  if (g.mom !== null && g.mom !== undefined) g.mom = Math.min(MOMENTUM.max, g.mom + PICK_SKIP.mom);
  ev(g, 'pickSkip', {});
  return true;
}
