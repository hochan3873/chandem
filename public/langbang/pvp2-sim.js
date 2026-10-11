// 랑방 대전 — 1:1 맞대결 (v2) 판 돌리기: 두 사람 판(sim.js)을 한곳에서 같이 돌린다 (서버 전용 · 테스트도)
//  createDuel → input(d, side, 입력) → tick(d) 0.1초씩 → snap(d, side) 장면 · drainEv(d) 사건
//  견제: 멤버가 스킬을 쓰면 (sim 'skillCast' 사건) 역할에 맞는 상태이상이 상대 멤버에게 0.7초 뒤 도착
import * as S from './sim.js';
import { HEROES, LOCKED_HEROES, RULES, MOMENTUM, heroRole } from './data.js';
import { pvpSendMul, pvpAutoBig } from './pvp.js';
import { PV2, ST, splitDeck, judge2, hashOf } from './pvp2.js';

const STEPS = Math.round(PV2.tickMs / 1000 / PV2.dt); // 한 틱 = 3스텝
export function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// o: { seed, hp, sides: [{ deck, meta, stars, gear }, { … }] }
export function createDuel(o) {
  const seed = (Number(o.seed) >>> 0) || 1;
  const d = { seed, len: Number(o.len) > 0 ? Number(o.len) : PV2.len, t: 0, n: 0, over: false, win: -1, reason: '', sides: [], hexes: [], sends: [], ev: [], rng: seeded(seed ^ 0x9e3779b9) };
  for (let i = 0; i < 2; i++) {
    const lo = o.sides[i] || {};
    const { field, bench } = splitDeck((lo.deck || []).filter((id) => HEROES[id] && !HEROES[id].summon));
    const slots = [null, null, null, null, null, null];
    field.forEach((id, k) => { slots[PV2.slots[k]] = id; });
    const g = S.createGame({ H: 720, rng: seeded(seed * 31 + i * 7919 + 1), mode: 'stage', stage: 12 + (seed % 17), pvp: { seed, hp: o.hp || 1 }, deck: slots, meta: lo.meta || {}, stars: lo.stars || {}, gear: lo.gear || {}, tempo: true, unlocked: LOCKED_HEROES.slice() });
    g.events.length = 0;
    d.sides.push({ i, g, deck: field.concat(bench), bench: bench.slice(), lv: {}, swapCd: 0, cleanseCd: 0, spent: 0, lastSend: -99, target: -1, guard: 0, guardT: 0, imm: {}, autoK: null, behind: false, ultBase: g.mods.ultCharge, bot: null, inputs: 0 });
  }
  return d;
}
const other = (d, i) => d.sides[1 - i];
const fieldHeroes = (g) => g.heroes.filter((h) => !h.def.summon && !h.gone);
const heroAtSlot = (g, s) => g.heroes.find((h) => h.slot === s && !h.def.summon && !h.gone) || null;
const push = (d, e) => { d.ev.push(e); return e; };
export const sideHp = (sd) => ({ hp: Math.max(0, sd.g.base.hp), max: sd.g.base.max, kills: sd.g.stats.kills });
export const gauge = (sd) => sd.g.stats.kills - sd.spent;
const hardSt = (h) => (h.stunT > 0 ? h.stunT : 0) + (h.charmT > 0 ? h.charmT : 0) + (h.silenceT > 0 ? h.silenceT * 0.6 : 0) + (h.freezeT > 0 ? h.freezeT : 0) + (h.grabT > 0 ? h.grabT : 0) + (h.aspdDebT > 0 ? h.aspdDebT * 0.3 : 0);

// ─── 입력 (cleanInput 을 거친 것) → { ok, msg } ───
export function input(d, i, q) {
  if (d.over || !q) return { ok: false, msg: '끝난 판' };
  const sd = d.sides[i], g = sd.g;
  sd.inputs++;
  if (q.k === 'sk') {
    const h = heroAtSlot(g, q.s);
    if (!h) return { ok: false, msg: '없는 자리' };
    if (h.stunT > 0 || h.charmT > 0 || h.freezeT > 0) return { ok: false, msg: '묶여 있어요' };
    if (h.silenceT > 0) return { ok: false, msg: '침묵 중' };
    if (!S.skillReady(h)) return { ok: false, msg: '아직 쿨' };
    if (g.mom !== null && g.mom !== undefined && g.mom < MOMENTUM.per) return { ok: false, msg: '기세 부족' };
    let { x, y } = q;
    if (x === undefined) { const p = aimFor(g, h); if (p) { x = p.x; y = p.y; } }
    const before = h.skillCd;
    const ok = S.castSkill(g, h, x, y);
    const queued = !ok && g.skillQ && g.skillQ.h === h;
    return ok || queued || h.skillCd > before ? { ok: true } : { ok: false, msg: '지금은 못 써요' };
  }
  if (q.k === 'ult') {
    if (g.ult < RULES.ultMax) return { ok: false, msg: '총공지 덜 참' };
    if (!S.useUlt(g)) return { ok: false, msg: '기세 부족' };
    for (const h of fieldHeroes(g)) S.cleanseHero(h);
    push(d, { k: 'ult', s: i });
    return { ok: true };
  }
  if (q.k === 'tg') {
    if (q.s < 0) { sd.target = -1; return { ok: true }; }
    if (!heroAtSlot(other(d, i).g, q.s)) return { ok: false, msg: '없는 자리' };
    sd.target = q.s; return { ok: true };
  }
  if (q.k === 'sw') return swapIn(d, i, q.b, q.s);
  if (q.k === 'cl') {
    if (sd.cleanseCd > 0) return { ok: false, msg: '아직 쿨' };
    let h = q.s >= 0 ? heroAtSlot(g, q.s) : null;
    if (!h) { let best = 0; for (const o of fieldHeroes(g)) { const v = hardSt(o); if (v > best) { best = v; h = o; } } }
    if (!h || hardSt(h) <= 0) return { ok: false, msg: '풀 게 없어요' };
    S.cleanseHero(h); h.aspdDebT = 0; h.ccImmT = Math.max(h.ccImmT || 0, 1);
    sd.cleanseCd = PV2.cleanseCd;
    push(d, { k: 'cl', s: i, slot: h.slot, id: h.id });
    return { ok: true };
  }
  if (q.k === 'send') {
    const c = PV2.send[q.kind], cost = Math.round(c.cost * (sd.behind ? PV2.comeback.send : 1));
    if (g.pvp.timeUp) return { ok: false, msg: '시간 끝' };
    if (gauge(sd) < cost) return { ok: false, msg: '게이지 부족' };
    if (d.t - sd.lastSend < c.gap) return { ok: false, msg: '잠깐 뒤에' };
    sd.spent += cost; sd.lastSend = d.t;
    deliver(d, i, q.kind, false);
    return { ok: true };
  }
  if (q.k === 'fo') { S.setFocus(g, q.x, q.y); return { ok: true }; }
  return { ok: false, msg: '모르는 입력' };
}
// 자동 조준: 사거리 안 가장 뭉친 곳 → 없으면 입구에 제일 가까운 진상
function aimFor(g, h) {
  const r = (h.def.skill && h.def.skill.r && h.def.skill.r[h.lv - 1]) || 70;
  const p = S.densestPoint(g, h.x, h.y, Math.max(S.heroRange(g, h), 260), r);
  if (p) return p;
  let best = null;
  for (const e of g.enemies) if (!e.dead && e.y > 0 && (!best || e.y > best.y)) best = e;
  return best ? { x: best.x, y: best.y } : null;
}
function deliver(d, from, kind, auto) {
  const n = auto ? 1 : pvpSendMul(d.t * PV2.clockK);
  d.sends.push({ at: d.t + PV2.send.delay, to: 1 - from, kind, n, auto });
  push(d, { k: 'send', s: from, kind, n, auto: !!auto });
}
// 교체: 벤치 b 번 ↔ 필드 자리 s (팀 8초 쿨 · 들어온 멤버 2초 무적 · 나간 멤버 레벨 이어받기)
function swapIn(d, i, b, s) {
  const sd = d.sides[i], g = sd.g;
  if (sd.swapCd > 0) return { ok: false, msg: '교체 쿨' };
  const inId = sd.bench[b];
  const out = heroAtSlot(g, s);
  if (!inId || !out) return { ok: false, msg: '바꿀 멤버 없음' };
  sd.lv[out.id] = out.lv;
  g.heroes = g.heroes.filter((h) => h !== out);
  if (g.attrCount[out.def.attr]) g.attrCount[out.def.attr]--;
  if (g.skillQ && g.skillQ.h === out) g.skillQ = null;
  const h = S.addHero(g, inId, s);
  if (!h) { g.heroes.push(out); g.attrCount[out.def.attr] = (g.attrCount[out.def.attr] || 0) + 1; return { ok: false, msg: '못 바꿈' }; }
  h.lv = Math.max(1, Math.min(5, Math.max(sd.lv[inId] || 1, out.lv)));
  h.ccImmT = PV2.swapInv;
  sd.bench[b] = out.id;
  sd.swapCd = PV2.swapCd;
  push(d, { k: 'sw', s: i, slot: s, id: inId, out: out.id });
  return { ok: true };
}

// ─── 견제 ───
function pickTarget(d, from) {
  const sd = d.sides[from], og = other(d, from).g, imm = other(d, from).imm;
  if (sd.target >= 0) { const h = heroAtSlot(og, sd.target); if (h) return h; }
  let best = null, bv = -1;
  for (const h of fieldHeroes(og)) { const v = h.dmgDone * ((imm[h.id] || 0) > d.t ? 0.01 : 1) * (hardSt(h) > 0 ? 0.2 : 1) + 1; if (v > bv) { bv = v; best = h; } }
  return best;
}
function onSkill(d, i, h) {
  const spec = PV2.hex[heroRole(h.id)] || PV2.hex.special;
  const sd = d.sides[i];
  push(d, { k: 'sk', s: i, slot: h.slot, id: h.id });
  if (spec.k === 'guard') { sd.guard = 1; sd.guardT = spec.sec; push(d, { k: 'guard', s: i, slot: h.slot }); return; }
  if (spec.k === 'cleanse') { for (const o of fieldHeroes(sd.g)) { S.cleanseHero(o); o.aspdDebT = 0; o.ccImmT = Math.max(o.ccImmT || 0, spec.sec); } push(d, { k: 'heal', s: i, slot: h.slot }); return; }
  const t = pickTarget(d, i);
  if (!t) return;
  d.hexes.push({ at: d.t + PV2.hexFly, from: i, to: 1 - i, src: h.slot, slot: t.slot, id: t.id, kind: spec.k, sec: spec.sec, cut: spec.cut || 0 });
  push(d, { k: 'hex', s: i, src: h.slot, to: t.slot, id: t.id, kind: spec.k, fly: PV2.hexFly });
}
function landHex(d, x) {
  const sd = d.sides[x.to], g = sd.g;
  const h = g.heroes.find((o) => o.id === x.id && !o.gone && o.slot === x.slot);
  const res = (r) => push(d, { k: 'hexHit', s: x.to, slot: x.slot, id: x.id, kind: x.kind, r });
  if (!h) return res('miss'); // 교체로 피했다
  if (sd.guard > 0) { sd.guard = 0; sd.guardT = 0; return res('guard'); }
  if ((sd.imm[h.id] || 0) > d.t) return res('imm');
  const sec0 = x.sec * (sd.behind ? PV2.comeback.hexCut : 1);
  const kind = x.kind === 'slow' ? 'slow' : x.kind;
  const sec = S.debuffSec(h, sec0, kind);
  if (!(sec > 0)) return res('res');
  if (x.kind === 'stun') h.stunT = Math.max(h.stunT || 0, sec);
  else if (x.kind === 'charm') h.charmT = Math.max(h.charmT || 0, sec);
  else if (x.kind === 'silence') { h.silenceT = Math.max(h.silenceT || 0, sec); h.muteT = Math.max(h.muteT || 0, sec); }
  else if (x.kind === 'slow') { h.aspdDebT = Math.max(h.aspdDebT || 0, sec); h.aspdDebCut = x.cut || 0.35; }
  sd.imm[h.id] = d.t + sec + PV2.hexImm;
  return res('hit');
}

// ─── 자동 카드 (대전 v2 는 카드 · 증강을 자동으로) ───
function autoPick(g, rng) {
  let guard = 0;
  while (g.pendingLevels > 0 && guard++ < 8) {
    const c = S.rollCards(g);
    if (!c || !c.length) { g.pendingLevels = 0; break; }
    const sc = (x) => (x.kind === 'join' ? 100 : x.kind === 'heroLv' ? 60 : /공격|공속/.test((x.title || '') + (x.desc || '')) ? 50 : 20) + rng() * 10;
    let best = c[0], bv = -1; for (const x of c) { const v = sc(x); if (v > bv) { bv = v; best = x; } }
    S.applyCard(g, best);
    g.pendingLevels--;
  }
  if (g.augOffer && g.augOffer.opts && g.augOffer.opts.length) S.applyAug(g, g.augOffer.opts[0]);
}

// ─── 0.1초 진행 ───
export function tick(d) {
  if (d.over) return;
  for (let k = 0; k < STEPS && !d.over; k++) stepOnce(d);
}
function stepOnce(d) {
  const dt = PV2.dt;
  d.t += dt; d.n++;
  for (const sd of d.sides) {
    if (sd.bot) botThink(d, sd.i);
    const g = sd.g;
    g.pvp.clock = d.t * PV2.clockK;
    S.step(g, dt);
    autoPick(g, d.rng);
    for (const e of g.events) {
      if (e.type === 'skillCast') { const h = g.heroes.find((o) => o.id === e.hero && !o.def.summon); if (h) onSkill(d, sd.i, h); }
      else if (e.type === 'pvpPhase') { if (sd.i === 0) push(d, { k: 'ph', p: e.p }); }
      else if (e.type === 'incoming' && e.sched) push(d, { k: 'inc', s: sd.i, kind: e.kind, n: e.n, sched: true });
      else if (e.type === 'bossSpawn' && e.bunch && sd.i === 0) push(d, { k: 'bunch' });
    }
    g.events.length = 0;
    if (sd.swapCd > 0) sd.swapCd -= dt;
    if (sd.cleanseCd > 0) sd.cleanseCd -= dt;
    if (sd.guardT > 0 && (sd.guardT -= dt) <= 0) sd.guard = 0;
    // 폭주: 처치 25명마다 상대에게 중간 보스 자동 (지금 대전 규칙)
    if (!g.pvp.timeUp) { const r = pvpAutoBig(g.pvp.clock, g.stats.kills, sd.autoK); sd.autoK = r.from; for (let j = 0; j < Math.min(3, r.n); j++) deliver(d, sd.i, 'big', true); }
  }
  // 견제 도착 · 보낸 진상 도착
  if (d.hexes.length) { const due = d.hexes.filter((x) => x.at <= d.t); if (due.length) { d.hexes = d.hexes.filter((x) => x.at > d.t); for (const x of due) landHex(d, x); } }
  if (d.sends.length) { const due = d.sends.filter((x) => x.at <= d.t); if (due.length) { d.sends = d.sends.filter((x) => x.at > d.t); for (const x of due) { const g = d.sides[x.to].g; if (!g.over) { S.pvpIncoming(g, x.kind, x.n, x); g.events.length = 0; push(d, { k: 'inc', s: x.to, kind: x.kind, n: x.n, auto: !!x.auto }); } } } }
  // 추격 (눈덩이 막기): 1초에 한 번
  if (d.n % 30 === 0) {
    const p = d.sides.map((sd) => sd.g.base.hp / Math.max(1, sd.g.base.max));
    for (const sd of d.sides) {
      const b = p[1 - sd.i] - p[sd.i] >= PV2.comeback.gap;
      if (b !== sd.behind) { sd.behind = b; sd.g.mods.ultCharge = sd.ultBase * (b ? PV2.comeback.ult : 1); push(d, { k: 'behind', s: sd.i, on: b }); }
    }
  }
  decide(d);
}
// 결과: 입구가 먼저 무너진 쪽이 진다 (같은 틱이면 판정) · 4분이면 판정
function decide(d) {
  const [a, b] = d.sides;
  const da = a.g.over || a.g.base.hp <= 0, db = b.g.over || b.g.base.hp <= 0;
  if (da || db) {
    if (da && db) { const j = judge2(sideHp(a), sideHp(b)); return end(d, j > 0 ? 0 : j < 0 ? 1 : -1, 'dead'); }
    return end(d, da ? 1 : 0, 'dead');
  }
  if (d.t >= d.len || (a.g.pvp.timeUp && b.g.pvp.timeUp)) { const j = judge2(sideHp(a), sideHp(b)); return end(d, j > 0 ? 0 : j < 0 ? 1 : -1, 'time'); }
}
export function end(d, win, reason) {
  if (d.over) return;
  d.over = true; d.win = win; d.reason = reason;
  push(d, { k: 'end', win, reason });
}
export function drainEv(d) { const e = d.ev; d.ev = []; return e; }

// ─── 장면 (한 쪽) ───
//  h: [자리, id, Lv, 스킬 준비 0~100, 상태 비트, 남은 상태 초×10, x, y, 쏜 수]
export function sideSnap(d, i, full) {
  const sd = d.sides[i], g = sd.g;
  const hs = [];
  for (const h of fieldHeroes(g)) {
    const cd = h.def.skill ? Math.round(100 * (1 - Math.max(0, h.skillCd) / Math.max(0.1, h.def.skill.cd * (g.cdMul || 1)))) : 0;
    let bits = 0;
    if (h.stunT > 0 || h.freezeT > 0) bits |= ST.stun;
    if (h.charmT > 0) bits |= ST.charm;
    if (h.silenceT > 0) bits |= ST.silence;
    if (h.aspdDebT > 0) bits |= ST.slow;
    if (sd.guard > 0) bits |= ST.guard;
    if (h.ccImmT > 0 || (sd.imm[h.id] || 0) > d.t) bits |= ST.imm;
    if (h.rumorT > 0 || h.paperT > 0 || h.fearT > 0 || h.blindT > 0 || h.grabT > 0 || h.poisonT > 0) bits |= ST.other;
    if (S.skillReady(h)) bits |= ST.ready;
    hs.push([h.slot, h.id, h.lv, Math.max(0, Math.min(100, cd)), bits, Math.min(255, Math.round(hardSt(h) * 10)), Math.round(h.px !== undefined && h.out ? h.px : h.x), Math.round(h.py !== undefined && h.out ? h.py : h.y), (h.shots | 0) & 255]);
  }
  const out = {
    hp: Math.round(Math.max(0, g.base.hp)), max: g.base.max, w: g.wave, k: g.stats.kills, ga: gauge(sd), u: Math.round(Math.min(RULES.ultMax, g.ult)), m: g.mom === null || g.mom === undefined ? -1 : Math.round(g.mom),
    sw: Math.max(0, Math.round(sd.swapCd * 10)), cl: Math.max(0, Math.round(sd.cleanseCd * 10)), tg: sd.target, bh: sd.behind ? 1 : 0, gu: sd.guard,
    bench: sd.bench.slice(), blv: sd.bench.map((id) => sd.lv[id] || 1), h: hs,
  };
  if (full !== false) {
    const list = [];
    for (const e of g.enemies) if (!e.dead && e.y > -60) list.push(e);
    list.sort((p, q) => (q.boss | 0) - (p.boss | 0) || (q.mid | 0) - (p.mid | 0) || q.y - p.y);
    const cap = full === 'op' ? PV2.eCapOp : PV2.eCap;
    const fu = g.focus && !g.focus.dead ? g.focus.uid : 0;
    out.es = list.slice(0, cap).map((e) => ({ uid: e.uid, t: e.type || (e.def && e.def.id) || '', x: e.x, y: e.y, hp: Math.max(0, e.hp) / Math.max(1, e.maxHp), f: (e.boss ? 1 : 0) | (e.mid ? 2 : 0) | (e.sent ? 4 : 0) | (e.uid === fu ? 8 : 0) | (e.stunT > 0 || e.frozenT > 0 ? 16 : 0) })); // (pvp2.js packSnap 이 바이너리로 묶는다)
    out.ne = list.length;
  }
  return out;
}
// 서버 → 화면: 나(me) · 상대(op) — 상대 판 진상은 두 틱에 한 번 (전송량)
export function snap(d, i, opEnemies = true) {
  return { t: Math.round(d.t * 100) / 100, me: sideSnap(d, i, true), op: sideSnap(d, 1 - i, opEnemies ? 'op' : false) };
}
// 상태 해시 (결정성 확인)
export function stateHash(d) {
  const nums = [d.n];
  for (const sd of d.sides) {
    const g = sd.g;
    nums.push(g.base.hp, g.stats.kills, g.ult, g.mom || 0, sd.spent, sd.swapCd, g.enemies.length);
    for (const h of g.heroes) nums.push(h.slot, h.lv, h.skillCd, h.stunT || 0, h.charmT || 0, h.silenceT || 0);
    for (const e of g.enemies) nums.push(e.uid, e.x, e.y, e.hp);
  }
  return hashOf(nums);
}

// ─── AI (상대가 없을 때 · 끊긴 사람 대신) — 사람처럼 0.4~1.2초 늦게 · 가끔 놓침 ───
export function setBot(d, i, o = {}) { d.sides[i].bot = { rng: o.rng || seeded(d.seed * 13 + i + 5), plan: [], at: 0, skill: o.skill === undefined ? 1 : o.skill }; }
export function clearBot(d, i) { d.sides[i].bot = null; }
function botThink(d, i) {
  const sd = d.sides[i], bot = sd.bot, g = sd.g;
  if (d.t < bot.at) return;
  bot.at = d.t + 0.5;
  const rng = bot.rng, miss = Math.max(0.03, 0.14 - 0.08 * bot.skill);
  const later = () => d.t + 0.4 + rng() * 0.8;
  const alive = g.enemies.filter((e) => !e.dead && e.y > 0);
  const boss = alive.find((e) => e.boss || e.mid);
  const doorLow = g.base.hp / g.base.max < 0.5;
  const has = (k) => bot.plan.some((p) => p.k === k);
  for (const h of fieldHeroes(g)) {
    if (!S.skillReady(h) || bot.plan.some((p) => p.k === 'sk' && p.s === h.slot)) continue;
    if (alive.length >= 3 || doorLow || boss) bot.plan.push({ at: later(), k: 'sk', s: h.slot });
  }
  if (g.ult >= RULES.ultMax && (boss || alive.length >= 8 || doorLow) && !has('ult')) bot.plan.push({ at: later(), k: 'ult' });
  if (sd.cleanseCd <= 0 && !has('cl') && fieldHeroes(g).some((h) => hardSt(h) > 1)) bot.plan.push({ at: later() + 0.3, k: 'cl', s: -1 });
  if (sd.swapCd <= 0 && sd.bench.length && !has('sw') && rng() < 0.15) { const h = fieldHeroes(g).find((o) => hardSt(o) > 1.5); if (h) bot.plan.push({ at: later(), k: 'sw', b: (rng() * sd.bench.length) | 0, s: h.slot }); }
  const ga = gauge(sd);
  if (!has('send') && d.t - sd.lastSend >= PV2.send.big.gap) { if (ga >= PV2.send.big.cost && rng() < 0.3) bot.plan.push({ at: later(), k: 'send', kind: 'big' }); else if (ga >= PV2.send.small.cost && rng() < 0.4) bot.plan.push({ at: later(), k: 'send', kind: 'small' }); }
  const due = bot.plan.filter((p) => p.at <= d.t); bot.plan = bot.plan.filter((p) => p.at > d.t);
  for (const p of due) { if (rng() < miss) continue; const q = Object.assign({}, p); delete q.at; input(d, i, q); sd.inputs--; }
}
