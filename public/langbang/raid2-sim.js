// 랑방 대전 — 건물주 레이드 전투 규칙 (DOM 없음 · Node 에서도 돈다)
//  sim.js 는 훅 세 줄만 (g.r2.hitMul · g.r2.onHit · g.r2.tick) — 나머지는 전부 여기
//  - 진상은 (거의) 안 나온다. 옥상 위 거대한 건물주 혼자 → 멤버들이 건물주를 때리고, 건물주는 직접 입구 · 멤버를 때린다
//  - 요일마다 다른 건물주 (raid2.js DAYS): 월 관리비 폭탄(입구 에너지 흡수) · 화 재계약 협박(기절 · 봉인) · 수 월세 인상(황금 갑옷)
//    · 목 누수 공사(독 · 용역 떼) · 금 주차 갑질(폭주 외제차 · 견인) · 토 소음 민원(홀림 · 공포) · 일 보증금 꿀꺽(금고 + 전부 섞어서)
//  - 패턴은 전부 예고가 있다 (act.zone: 바닥 경고 모양 · 표시) · 예고(wind) 중에 스킬을 "여러 번" 맞히거나(난이도마다 2 · 3 · 4번)
//    기절시키거나 총공지를 쓰면 끊기고 빈틈 (피해 ×1.5) — 기절 · 제어 멤버(ctrl)로 끊으면 「역공 찬스」 (빈틈 더 길게 · 피해 +30% · 총공지 더)
//  - 입구 붙잡기: 붙잡고 흔드는 동안 계속 피해 · 대신 빈틈 · 스킬 여러 번이나 기절이면 손을 놓는다
//  - 입구에 금이 간다: 건물주에게 맞은 피해의 일부는 "금"으로 남아 수리로 못 메운다 → 힐러 덱도 결국 입구가 부서진다
//  - 시간이 갈수록 화가 쌓여 세지고 빨라진다 → 입구가 부서지면 판 끝 (그동안 준 피해가 기록) · R2.sec 까지 버티면 "철거"로 끝
//  - 진상을 안 잡으니 경험치 · 총공지 게이지는 시간 + 끊기로 채운다 (멤버 합류 · 카드는 그대로)
//  - 난이도 (보통 · 어려움 · 지옥): 예고가 빨라지고 · 패턴이 일찍 · 연계 공격 · 기절이 길고 · 입구 피해가 세진다 (DFX)
//  - 상태이상 · 쓰러짐 게이지 · 독은 sim.js 것을 그대로 쓴다 (아래 어댑터 afflict · knock — sim 에 없으면 비슷한 것으로)
import { RULES, HERO_TAGS } from './data.js';
import * as SIM from './sim.js';
import { R2, BOSS, PATTERNS, phaseAt, diffOf, dayDef, anyPattern } from './raid2.js';

const { spawnEnemy, damageBase, debuffSec, gainExp } = SIM;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
// 패턴 숫자 (pct = 입구 최대 체력 대비 · stun · sec = 보통 난이도 기준 초) — w: 페이즈별 나올 확률 (보통 난이도 · 대마왕 기본 판)
export const PAT = {
  slam: { wind: 2.0, wind3: 1.6, pct: 0.09, stun: 2.6, zone: 62, gap: 3.2, knock: 40, w: [5, 5, 4] },
  sweep: { wind: 1.8, pct: 0.04, stun: 2.0, gap: 2.5, knock: 25, w: [3, 3, 3] },
  bills: { n: [3, 4, 5], fly: 1.2, step: 0.28, pct: 0.018, w: [4, 3, 3] },
  seal: { n: 2, sec: 5.5, w: [3, 2, 2] },
  cash: { n: [2, 2, 3], fuse: 1.7, r: 46, stun: 2.2, pct: 0.014, knock: 25, w: [0, 3, 3] },
  grab: { wind: 1.0, hold: 5.0, dps: 0.026, w: [0, 3, 3] },
  combo: { n: 3, wind: 1.1, w: [0, 0, 4] },
  evict: { wind: 2.6, pct: 0.06, seal: 3.2, w: [0, 0, 0] }, // 퇴거 명령: 어려움부터 (멤버 모두 봉인)
  // ── 요일 패턴 ──
  meter: { wind: 1.7, sec: 7, dps: 0.014, gap: 1.6 }, // 월: 관리비 계량기 — 입구에 붙어 sec 동안 초당 dps (수리로 메울 수 있게 금은 적게)
  bomb: { wind: 2.3, pct: 0.11, r: 95, knock: 45, gap: 2.4 }, // 월: 고지서 폭탄 — 입구 가운데 큰 원
  stamp: { n: [3, 4, 4], fuse: 1.3, r: 36, stun: 2.8, knock: 30, step: 0.18 }, // 화: 도장 폭격 — 멤버 발밑
  contract: { wind: 2.4, seal: 4.0, stunN: 2, stun: 2.6, pct: 0.03, gap: 2.2 }, // 화: 재계약 강요 — 모두 봉인 + 둘 기절
  raise: { wind: 2.0, add: 0.12, max: 0.6, cutDrop: 0.12, gap: 1.8 }, // 수: 월세 인상 — 황금 갑옷 (방어율) 한 겹
  leak: { n: [2, 3, 3], fuse: 1.4, r: 40, poison: 6, slow: 0.3, step: 0.25, pool: 4 }, // 목: 천장 누수 — 오수 (독 · 느림)
  crew: { wind: 1.6, n: [5, 6, 7], cutN: 0.5, hp: 1.1, atk: 3.5, crash: 0.022, gap: 1.2 }, // 목: 철거 용역 투입
  rush: { n: [5, 6, 7], warn: 1.1, hp: 1.1, speed: 1.5, atk: 2.5, crash: 0.045 }, // crash: 입구에 처음 닿으면 쾅 (입구 최대의 %) — 감속 · 기절 · 밀침으로 늦추면 덜 닿는다, // 금: 외제차 폭주 — 화살표 예고 뒤 빠른 진상
  tow: { wind: 1.9, stun: 3.0, knock: 60, pct: 0.04, gap: 2.0 }, // 금: 견인 갈고리 — 멤버 하나
  ticket: { n: [2, 3, 3], sec: 6, cut: 0.35 }, // 금: 주차 딱지 — 공격 속도 −35%
  noise: { wind: 1.8, charm: 5, fear: 2.0, gap: 2.0 }, // 토: 민원 확성기 — 한쪽 홀림
  broom: { wind: 1.7, fear: 4.0, knock: 30, pct: 0.03, gap: 2.2 }, // 토: 빗자루 쓸기 — 한쪽 공포 (공속 ↓)
  vault: { sec: 9, frac: 7, dps: 0.012, pct: 0.07, gap: 1.6 }, // 일: 보증금 금고 — 보호막 (팀 피해 frac 초어치) · 열린 동안 입구 흡수 · 못 깨면 꿀꺽
};
export const SLAM = PAT.slam; // (예전 이름)
// 예고(wind)가 있어 끊을 수 있는 패턴
const WIND = new Set(['slam', 'sweep', 'combo', 'evict', 'meter', 'bomb', 'contract', 'raise', 'crew', 'tow', 'noise', 'broom']);
// 난이도별 (DFX) — wind: 예고 시간 배율 · gap: 쉬는 시간 배율 · pow: 입구 피해 · cc: 기절 · 봉인 시간 · crack: 금으로 남는 비율
//  cut: 예고를 끊는 데 필요한 스킬 수 · grab: 손을 놓게 하는 스킬 수 · combo: 연타 횟수 · follow: 내려찍은 뒤 바로 고지서를 잇는 확률
//  w: 패턴 확률을 바꾼 것 (없으면 PAT 그대로 · 대마왕 기본 판만) · add: 표시물 · 소환 수 + · hp: 소환 진상 체력
export const DFX = {
  normal: { wind: 1, gap: 1, pow: 1, cc: 1, crack: 0.42, cut: 2, grab: 2, combo: 3, follow: 0, sealN: 2, add: 0, hp: 1, w: {} },
  hard: { wind: 0.85, gap: 0.9, pow: 1.12, cc: 1.3, crack: 0.45, cut: 3, grab: 3, combo: 3, follow: 0.3, sealN: 3, add: 0, hp: 1.35, w: { grab: [2, 3, 3], cash: [2, 3, 3], combo: [0, 2, 4], evict: [0, 2, 3] } },
  hell: { wind: 0.72, gap: 0.8, pow: 1.3, cc: 1.6, crack: 0.5, cut: 4, grab: 4, combo: 4, follow: 0.55, sealN: 3, add: 1, hp: 1.8, w: { grab: [3, 3, 3], cash: [3, 3, 3], combo: [2, 3, 5], evict: [2, 3, 3] } },
};
// 요일별 보정 (scripts/lb-raid2-sim.js --day= 로 맞춤) — pow: 입구 피해 · gap: 쉬는 시간 · crack: 금 비율 배 · cc: 상태이상 시간 배
//  hard: 어려움 · 지옥에서 바꾸는 패턴 확률 (예: 화요일 재계약 더 자주)
export const DAYFX = {
  mon: { pow: 1.12, gap: 1, crack: 0.65, cc: 1, hard: { grab: [2, 3, 3], combo: [0, 2, 4] } },
  tue: { pow: 1, gap: 0.95, crack: 1, cc: 1.5, hard: { contract: [3, 4, 5], combo: [0, 2, 4] } },
  wed: { pow: 0.95, gap: 1, crack: 1, cc: 1, hard: { cash: [2, 3, 3], combo: [0, 2, 4] } },
  thu: { pow: 1.2, gap: 0.95, crack: 1, cc: 1, hard: { grab: [2, 3, 3], combo: [0, 2, 4] } },
  fri: { pow: 0.95, gap: 1.1, crack: 1, cc: 1, hard: { combo: [0, 2, 4] } },
  sat: { pow: 1, gap: 1, crack: 1, cc: 1, hard: { seal: [3, 3, 3], combo: [0, 2, 4] } },
  sun: { pow: 1.1, gap: 1, crack: 1, cc: 1, hard: { evict: [2, 3, 3], combo: [2, 3, 5] } },
};
// 이 판 패턴 확률 (요일 판이면 그날 pats · 아니면 예전 대마왕 판)
export function patW(id, diff, ph, day) {
  const df = diffOf(diff);
  if (day) {
    const d = dayDef(day);
    const w = (df !== 'normal' && DAYFX[d.id].hard[id]) || d.pats[id];
    return (w && w[ph - 1]) || 0;
  }
  return ((DFX[df].w[id] || (PAT[id] && PAT[id].w) || [])[ph - 1] || 0);
}
// 이 난이도에서 그 패턴이 처음 나오는 페이즈 (안 나오면 0) — 화면 안내용
export const patFrom = (id, diff, day) => { for (let p = 1; p <= 3; p++) if (patW(id, diff, p, day) > 0) return p; return 0; };
export const dayPats = (day) => { const d = dayDef(day); return [...new Set([...Object.keys(d.pats), ...Object.keys(DAYFX[d.id].hard)])]; };
export const TEMPO_R2 = {
  gap: [4.9, 4.2, 3.6], // 패턴 사이 쉬는 시간 (페이즈별 · 보통)
  angryEvery: 30, angryPow: 0.4, angryFast: 0.12, // 30초마다 화 +1: 패턴 피해 +40% · 간격 −12%
  first: 4, // 첫 패턴
  exp: 7, expLv: 0.55, // 레벨업 간격 (초) = 7 + 레벨×0.55 → 대략 웨이브 판과 비슷하게 합류 · 카드
  ult: 2.6, // 총공지 게이지 초당
  heal: 0.6, // 입구 수리 효과 (대마왕 한 방이 워낙 세서 수리로 끝없이 버티지 않게)
  dmgK: 1.3, // 대마왕이 받는 피해 배율 (진상 없이 혼자 다 맞으니까 — 한 판 피해를 예전 레이드와 비슷하게)
  crackMin: 0.65, // 막아 낸 공격도 원래 피해의 이만큼은 금으로 친다
  cutGap: 0.12, // 같은 멤버 스킬이 이 시간 안에 여러 번 맞으면 한 번으로 센다
  cc: { weak: 6, amp: 0.3, ult: 14 }, // 역공 찬스 (기절 · 제어로 끊음): 빈틈 6초 · 그동안 피해 +30% · 총공지 +14 (스킬로 끊으면 빈틈 4초 · +8)
  addExp: 0.35, // 소환 진상을 잡으면 받는 경험치 (보통 진상 대비)
};
const VIS = 'boss_gapjil'; // 체력 · 상태만 빌린다 (그림은 raid2-ui 가 따로)
const CTRL = new Set(Object.keys(HERO_TAGS).filter((k) => HERO_TAGS[k].includes('ctrl')));
export const isCtrl = (id) => CTRL.has(id);

// ─── 어댑터: 상태이상 · 쓰러짐 게이지 · 독 (sim.js 쪽 규칙을 그대로 쓴다 — 아직 없으면 가까운 것으로) ───
//  kind: stun · silence · charm · fear · slow · poison  →  저항 · 면역(건전녀 방패 · 강성구 곁) 은 sim 의 debuffSec 이 정한다
function resSec(g, h, sec, kind) {
  const k = kind === 'fear' || kind === 'slow' ? 'slow' : kind;
  return debuffSec(h, sec * g.r2.fx.cc * g.r2.dfx.cc, k);
}
export function afflict(g, h, kind, sec, o = {}) {
  if (!h || h.gone) return 0;
  if (kind === 'poison' && typeof SIM.poisonHero === 'function') { const v = SIM.poisonHero(g, h, sec * g.r2.fx.cc * g.r2.dfx.cc); if (v > 0) g.r2.ccSec += v; return v > 0 ? v : 0; } // 독: 홍정민 곁이면 면역 (KD_SUP)
  if (kind === 'charm' && g.heroes.some((x) => x.id === 'gunnyeo' && x.lv >= 5 && !x.gone)) { g.events.push({ type: 'charmBlock', x: h.x, y: h.y }); return 0; } // 건전녀 5레벨: 모든 멤버 홀림 면역
  const sc = resSec(g, h, sec, kind);
  if (!(sc > 0)) return 0;
  if (kind === 'stun') h.stunT = Math.max(h.stunT || 0, sc);
  else if (kind === 'silence') h.silenceT = Math.max(h.silenceT || 0, sc);
  else if (kind === 'charm') h.charmT = Math.max(h.charmT || 0, sc);
  else if (kind === 'fear') h.fearT = Math.max(h.fearT || 0, sc);
  else { h.aspdDebCut = h.aspdDebT > 0 ? Math.max(h.aspdDebCut || 0, o.cut || 0.3) : o.cut || 0.3; h.aspdDebT = Math.max(h.aspdDebT || 0, sc); } // slow · (sim 에 독이 없을 때) poison
  g.r2.ccSec += sc;
  return sc;
}
// 쓰러짐 게이지: 건물주에게 맞은 멤버 (sim 에 게이지가 있으면 거기로 · 없으면 아무 일도 안 함)
export function knock(g, h, amt) {
  if (!h || h.gone || !(amt > 0)) return;
  if (typeof SIM.kdAdd === 'function') SIM.kdAdd(g, h, amt * g.r2.fx.pow * g.r2.dfx.pow * (1 + 0.15 * g.r2.angry), { src: 'raid2' }); // 쓰러짐 게이지 (sim.js KD · 탱커가 곁에서 대신 맞음)
}

// 판 정의: 진상 없음 (웨이브는 18초마다 숫자만 넘어간다 → 증강 선택은 그대로)
export function waveDef(tier = 1) {
  const waves = [];
  for (let w = 1; w <= 12; w++) waves.push({ g: [], level: 6 + 1.6 * (w - 1), hpScale: 1, kind: 'R' });
  return { wi: 0, r2: true, waves, sec: R2.sec + 10, tier };
}

function bossDef(day) {
  const d = day ? dayDef(day) : null;
  return { id: 'raid2_body', cls: 'raid2', name: d ? d.name : BOSS.name, gender: 'm', color: d ? d.color : '#ff2d45', boss: true, hp: 1, speed: 0, atk: 0, atkInterval: 9, exp: 0, r: 84, size: 300, shouts: ['월세 내!', '계약 갱신 없다!', '보증금 못 돌려줘!'], img: '' };
}
// 판에 붙이기: o = { tier, diff, day, rally: bool, hp, max } (hp · max: 서버 체력 → 시작 페이즈 · day: 요일 건물주 — 없으면 예전 대마왕 판)
export function attach(g, o = {}) {
  const left = o.hp && Number.isFinite(o.hp.body) ? o.hp.body : 1, max = o.max && o.max.body > 0 ? o.max.body : 1;
  const diff = diffOf(o.diff);
  const day = o.day && dayDef(o.day).id === o.day ? o.day : null;
  const r = g.r2 = {
    tier: Math.max(1, o.tier | 0 || 1), diff, day, fx: DFX[diff], dfx: day ? DAYFX[day] : { pow: 1, gap: 1, crack: 1, cc: 1 }, phase: Math.min(3, phaseAt(left, max)), buff: o.rally ? R2.rallyBuff : 0,
    dmg: { body: 0 }, parts: {}, act: null, nextT: TEMPO_R2.first, angry: 0, angryT: TEMPO_R2.angryEvery, last: '', finale: false,
    marks: [], cuts: 0, ccCuts: 0, slams: 0, pats: {}, hits: {}, gate: { slam: 0, bill: 0, other: 0, drain: 0 }, crack: 0, ult0: 0, ccSec: 0,
    meterT: 0, armor: 0, vault: null, punishT: 0, adds: 0, pools: [], rate: 0, rateT: 0, rateAvg: 0,
    hitMul, onHit, tick,
  };
  r.pow0 = 1 + 0.15 * (r.tier - 1);
  if (g.raid) g.raid.sec = R2.sec + 10;
  if (g.mods) g.mods.healMul = (g.mods.healMul || 1) * TEMPO_R2.heal;
  g.kdOn = true; // 쓰러짐 게이지: 레이드에서도 (건물주에게 맞으면 차고 · 꽉 차면 몇 초 쓰러짐 · 건전녀가 회복)
  const e = spawnEnemy(g, VIS, g.W / 2, g.ropeY - 150, { keep: true }); // 몸 가운데 (발은 입구 줄 조금 위)
  if (g.seen) delete g.seen[VIS];
  e.def = bossDef(day); e.type = 'raid2_body'; e.r2 = 'body';
  e.maxHp = e.hp = 1e12; e.shield = 0; e.armor = 0; e.armorPct = 0; e.speed = e.baseSpeed = 0; e.atk = e.baseAtk = 0; e.bai = null;
  e.r = e.def.r; e.stopY = 1e6; e.ax = e.x; e.ay = e.y; e.lift = 0; e.lean = 0; e.cloak = false; e.unveiled = true; e.pShield = 0;
  r.parts.body = e;
  g.events.push({ type: 'r2Start', tier: r.tier, phase: r.phase, diff, day });
  return r;
}
// 서버에서 페이즈가 바뀌었다는 걸 알게 됨 (다른 사람이 깎음) → 이 판도 그 페이즈로
export function setPhase(g, ph) {
  const r = g.r2;
  if (!r || g.over || !(ph > r.phase) || ph > 3) return false;
  r.phase = ph;
  g.events.push({ type: 'r2Phase', phase: ph });
  return true;
}
// (예전 이름 · 화면이 아직 부를 수 있게) 서버가 준 부위 목록 → 아무것도 안 떨어진다
export function syncParts() { return []; }

const boss = (g) => g.r2.parts.body;
const pow = (g) => g.r2.pow0 * g.r2.fx.pow * g.r2.dfx.pow * (1 + TEMPO_R2.angryPow * g.r2.angry + 0.2 * g.r2.angry * g.r2.angry) * (g.r2.phase === 3 ? 1.15 : 1);
const alive = (g) => g.heroes.filter((h) => !h.gone && !h.def.summon);
// 제일 잘 싸우는 멤버부터 (이번 판 피해 순) — 도장 · 견인은 센 세입자부터 노린다
function pickTop(g, n) {
  const hs = alive(g).slice().sort((a, b) => (g.r2.hits[b.id] || 0) - (g.r2.hits[a.id] || 0));
  const out = hs.slice(0, Math.max(1, Math.ceil(n / 2)));
  for (const h of pickHeroes(g, n + 2)) if (out.length < n && !out.includes(h)) out.push(h);
  return out.slice(0, n);
}
function pickHeroes(g, n) {
  const hs = alive(g), out = [];
  let guard = 0;
  while (out.length < n && out.length < hs.length && guard++ < 40) { const h = hs[(g.rng() * hs.length) | 0]; if (!out.includes(h)) out.push(h); }
  return out;
}
// 입구 피해: 맞은 양의 일부가 "금"으로 남는다 (수리로 못 메움) — 방패 · 탱커가 막아도 금은 원래 한 방의 절반 이상은 남는다
//  key 'drain' (계량기 · 금고 흡수): 금은 절반만 (수리로 버티는 날)
function gateHit(g, frac, key) {
  const r = g.r2, b0 = g.base.hp, want = g.base.max * frac * pow(g);
  damageBase(g, want, boss(g));
  const v = Math.max(0, b0 - g.base.hp);
  r.gate[key] = (r.gate[key] || 0) + v;
  if (!g.god) r.crack = Math.min(g.base.max, r.crack + Math.max(v, want * TEMPO_R2.crackMin) * r.fx.crack * r.dfx.crack * (key === 'drain' ? 0.5 : 1));
}
const stunHero = (g, h, sec, kind = 'stun') => afflict(g, h, kind === 'seal' ? 'silence' : kind, sec) > 0;

// 피해 배율 (sim damageEnemy 맨 앞) — 빈틈 ×1.5 는 sim 이 weakT 로 이미 준다 · 역공 찬스 +30% · 금고 보호막
function hitMul(g, e, dmg) {
  const r = g.r2;
  let v = dmg * (1 + r.buff) * TEMPO_R2.dmgK * (r.punishT > 0 ? 1 + TEMPO_R2.cc.amp : 1);
  if (r.vault && r.vault.hp > 0) { // 보증금 금고: 보호막이 먼저 받는다 (그만큼은 기여에 반만 · 깨지면 터지며 빈틈)
    const a = Math.min(r.vault.hp, v);
    r.vault.hp -= a;
    if (r.vault.hp <= 0) vaultBreak(g);
    v -= a * 0.5;
  }
  return v;
}
const breakable = (a) => a && a.st === 'wind' && WIND.has(a.k);
// 피해 기록 · 예고 중 스킬 → 끊기 게이지 (제어 멤버는 2칸) · 붙잡기 중 스킬 → 손 놓기 게이지
function onHit(g, e, dmg, src) {
  const r = g.r2;
  r.dmg.body += dmg;
  r.rate += dmg;
  if (g.raid) g.raid.dmg += dmg;
  if (src && src.id) r.hits[src.id] = (r.hits[src.id] || 0) + dmg;
  const a = r.act;
  if (!a || !g._inSkill) return;
  // 같은 스킬 한 번(같은 멤버 · 같은 순간)은 한 번만 센다
  const key = (src && src.id) || '?';
  a.seen = a.seen || {};
  if (g.t - (a.seen[key] ?? -9) < TEMPO_R2.cutGap) return;
  a.seen[key] = g.t;
  const ctrl = CTRL.has(key);
  if (breakable(a)) {
    a.hits = (a.hits || 0) + (ctrl ? 2 : 1);
    g.events.push({ type: 'r2Stagger', n: Math.min(a.hits, r.fx.cut), need: r.fx.cut, x: a.x || e.x, y: e.y, ctrl });
    if (a.hits >= r.fx.cut) cut(g, ctrl ? '제어로 끊었다!' : '스킬로 끊었다!', ctrl);
  } else if (a.k === 'grab' && a.st === 'hold') {
    a.hits = (a.hits || 0) + (ctrl ? 2 : 1);
    g.events.push({ type: 'r2Stagger', n: Math.min(a.hits, r.fx.grab), need: r.fx.grab, x: e.x, y: g.ropeY, grab: true });
    if (a.hits >= r.fx.grab) release(g, '스킬로 떼어냈다!');
  }
}
// 끊기 — cc: 기절 · 제어로 끊음 (역공 찬스)
function cut(g, why, cc) {
  const r = g.r2, a = r.act, e = boss(g);
  r.act = null; r.cuts++;
  e.lift = 0;
  if (cc) { r.ccCuts++; e.weakT = Math.max(e.weakT || 0, TEMPO_R2.cc.weak); r.punishT = TEMPO_R2.cc.weak; g.ult = Math.min(RULES.ultMax, g.ult + TEMPO_R2.cc.ult); }
  else { e.weakT = Math.max(e.weakT || 0, 4); g.ult = Math.min(RULES.ultMax, g.ult + 8); }
  if (a.k === 'raise' && r.armor > 0) { r.armor = Math.max(0, r.armor - PAT.raise.cutDrop); e.armorPct = r.armor; g.events.push({ type: 'r2Armor', x: e.x, y: e.y, armor: r.armor, broke: true }); }
  if (a.k === 'crew') spawnCrew(g, Math.max(1, Math.round(crewN(g) * PAT.crew.cutN)), true); // 끊어도 절반은 온다
  r.nextT = Math.max(r.nextT, 2.2);
  g.events.push({ type: 'r2Cut', k: a.k, x: a.x || e.x, y: e.y, text: why, cc: !!cc });
}
function release(g, why) {
  const r = g.r2, e = boss(g);
  r.act = null; r.cuts++;
  e.weakT = Math.max(e.weakT || 0, 3);
  r.nextT = Math.max(r.nextT, 2.5);
  g.events.push({ type: 'r2Release', x: e.x, y: e.y, text: why });
}
// 다음 패턴 고르기 (난이도 · 페이즈 · 바로 앞 패턴은 피해서)
function choose(g) {
  const r = g.r2;
  const ids = r.day ? dayPats(r.day) : PATTERNS.map((p) => p.id);
  const w = (id) => ((id === 'meter' && r.meterT > 0) || (id === 'vault' && r.vault) || (id === 'raise' && r.armor >= PAT.raise.max) ? 0 : patW(id, r.diff, r.phase, r.day));
  const list = ids.filter((id) => w(id) > 0 && id !== r.last);
  if (!list.length) return 'slam';
  let sum = list.reduce((a, id) => a + w(id), 0), x = g.rng() * sum;
  for (const id of list) { x -= w(id); if (x <= 0) return id; }
  return list[0];
}
const laneX = (g) => { const hs = alive(g); const h = hs.length ? hs[(g.rng() * hs.length) | 0] : null; return clamp(h ? h.x : 60 + g.rng() * (g.W - 120), PAT.slam.zone, g.W - PAT.slam.zone); };
function throwBills(g, n) {
  const r = g.r2;
  for (let j = 0; j < n; j++) r.marks.push({ k: 'bill', x: 30 + g.rng() * (g.W - 60), y: g.ropeY, t: PAT.bills.fly + j * PAT.bills.step, t0: PAT.bills.fly + j * PAT.bills.step });
}
const nOf = (g, arr) => arr[g.r2.phase - 1] + (g.r2.fx.add || 0);
const crewN = (g) => nOf(g, PAT.crew.n);
// 소환 진상 체력 = 팀이 건물주에게 넣는 초당 피해 × sec초 (센 덱이든 약한 덱이든 "몇 초를 뺏기는지" 가 같게) · 난이도 · 화
//  (hpMul 은 spawnEnemy 가 진상 기본 체력에 곱하는 배율 → 원하는 체력 ÷ 기본 체력)
function addHp(g, sec, type, flat) {
  const r = g.r2, base = (SIM.ENEMIES_HP && SIM.ENEMIES_HP[type]) || ADD_BASE[type] || 100;
  const rate = Math.max(r.rateAvg / TEMPO_R2.dmgK, 120 + 60 * (g.level || 1));
  return (rate * sec * (flat ? 1 : r.fx.hp) * (1 + 0.1 * r.angry)) / base;
}
const ADD_BASE = { thug: 150, mukti: 13, carpoor: 80, sledgirl: 50 }; // data.js ENEMIES 기본 체력 (소환 진상만)
function spawnAdd(g, type, x, hpk, o = {}) {
  const e = spawnEnemy(g, type, clamp(x, 24, g.W - 24), -34 - g.rng() * 20, { keep: true, hpMul: addHp(g, hpk, type, o.plain) });
  if (!e) return null;
  e.r2add = true; e.def = { ...e.def, exp: Math.max(1, Math.round((e.def.exp || 4) * TEMPO_R2.addExp)), coin: 0 };
  if (o.plain) { e.def.dash = null; e.dashT = 0; e.dashing = false; } // 외제차: 중간에 퍼지지 않고 끝까지 달린다
  if (o.speed) { e.speed *= o.speed; e.baseSpeed = e.speed; }
  if (o.atk) { e.atk *= o.atk * g.r2.fx.pow * g.r2.dfx.pow; e.baseAtk = e.atk; }
  g.r2.adds++;
  return e;
}
function spawnCrew(g, n, cutDown) {
  const xs = [];
  for (let j = 0; j < n; j++) { const x = 40 + ((j + 0.5) / n) * (g.W - 80) + (g.rng() - 0.5) * 30; xs.push(x); { const a = spawnAdd(g, j % 3 === 2 ? 'mukti' : 'thug', x, PAT.crew.hp, { atk: PAT.crew.atk }); if (a) a.r2hit = PAT.crew.crash; } }
  g.events.push({ type: 'r2Crew', xs, n, cut: !!cutDown });
}

function begin(g, k) {
  const r = g.r2, e = boss(g), W = r.fx.wind;
  r.last = k; r.pats[k] = (r.pats[k] || 0) + 1;
  const name = (anyPattern(k) || {}).name || '';
  const need = r.fx.cut;
  const wind = (t, extra) => { r.act = { k, st: 'wind', t, t0: t, hits: 0, ...extra }; g.events.push({ type: 'r2Wind', k, x: r.act.x || g.W / 2, y: e.y, sec: t, name, need, zone: r.act.zone, side: r.act.side }); };
  if (k === 'slam' || k === 'combo') {
    const x = laneX(g);
    const t = (k === 'combo' ? PAT.combo.wind : r.phase === 3 ? PAT.slam.wind3 : PAT.slam.wind) * W;
    wind(t, { x, n: k === 'combo' ? r.fx.combo : 1, zone: { shape: 'lane', x, w: PAT.slam.zone } });
  } else if (k === 'sweep' || k === 'broom' || k === 'noise') {
    const side = g.rng() < 0.5 ? -1 : 1;
    wind(PAT[k].wind * W, { side, x: g.W / 2 + side * g.W / 4, zone: { shape: 'half', side, col: k === 'noise' ? '#b04dff' : k === 'broom' ? '#c98a3a' : '#ff2a1a' } });
  } else if (k === 'evict' || k === 'contract') {
    wind(PAT[k].wind * W, { x: g.W / 2, zone: { shape: 'full', col: k === 'contract' ? '#3a6dff' : '#b04dff' } });
  } else if (k === 'meter') {
    wind(PAT.meter.wind * W, { x: g.W / 2, zone: { shape: 'door', col: '#ffcf3f' } });
  } else if (k === 'bomb') {
    const x = clamp(g.W / 2 + (g.rng() - 0.5) * 120, 90, g.W - 90);
    wind(PAT.bomb.wind * W, { x, zone: { shape: 'circle', x, y: g.ropeY + 10, r: PAT.bomb.r, col: '#ff3a6a' } });
  } else if (k === 'raise') {
    wind(PAT.raise.wind * W, { x: e.x, zone: { shape: 'boss', col: '#ffcf3f' } });
  } else if (k === 'crew') {
    wind(PAT.crew.wind * W, { x: g.W / 2, n: crewN(g), zone: { shape: 'top', n: crewN(g), col: '#5ad0ff' } });
  } else if (k === 'tow') {
    const h = pickTop(g, 1)[0];
    if (!h) { r.act = { k, st: 'throw', t: 0.5 }; return; }
    wind(PAT.tow.wind * W, { x: h.x, hero: h, zone: { shape: 'line', x: h.x, y: h.y, col: '#ff9a3a' } });
  } else if (k === 'bills') {
    const n = PAT.bills.n[r.phase - 1] + (r.diff === 'hell' ? 1 : 0);
    throwBills(g, n);
    r.act = { k, st: 'throw', t: 0.9 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, n, name });
  } else if (k === 'seal') {
    const hit = [];
    for (const h of pickHeroes(g, r.fx.sealN)) if (stunHero(g, h, PAT.seal.sec, 'seal')) hit.push({ x: h.x, y: h.y });
    r.act = { k, st: 'throw', t: 0.8 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, hits: hit, name });
  } else if (k === 'cash' || k === 'stamp' || k === 'leak') {
    const P = PAT[k], hs = (k === 'stamp' ? pickTop : pickHeroes)(g, k === 'cash' ? P.n[r.phase - 1] + (r.diff === 'hell' ? 1 : 0) : nOf(g, P.n));
    hs.forEach((h, j) => { const t = P.fuse * (0.5 + 0.5 * W) + j * (P.step || 0); r.marks.push({ k, x: h.x, y: h.y, t, t0: t, r: P.r }); });
    r.act = { k, st: 'throw', t: 0.9 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, n: hs.length, name });
  } else if (k === 'rush') {
    const n = PAT.rush.n[r.phase - 1] - (r.diff === 'normal' ? 0 : 1), t = PAT.rush.warn * (0.6 + 0.4 * W); // 어려움부터는 예고가 짧은 대신 한 대 덜
    for (let j = 0; j < n; j++) { const x = 40 + ((j + 0.5) / n) * (g.W - 80) + (g.rng() - 0.5) * 24; r.marks.push({ k: 'rush', x, y: g.ropeY, t: t + j * 0.22, t0: t + j * 0.22 }); }
    r.act = { k, st: 'throw', t: 0.9 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, n, name });
  } else if (k === 'ticket') {
    const hit = [];
    for (const h of pickHeroes(g, nOf(g, PAT.ticket.n))) if (afflict(g, h, 'slow', PAT.ticket.sec, { cut: PAT.ticket.cut }) > 0) hit.push({ x: h.x, y: h.y });
    r.act = { k, st: 'throw', t: 0.8 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, hits: hit, name });
  } else if (k === 'vault') {
    const hp = Math.max(1, r.rateAvg || 1) * PAT.vault.frac * (r.diff === 'hell' ? 1.3 : r.diff === 'hard' ? 1.15 : 1);
    r.vault = { hp, max: hp, t: PAT.vault.sec };
    r.act = { k, st: 'throw', t: 1.0 };
    g.events.push({ type: 'r2Pat', k, x: e.x, y: e.y, name, sec: PAT.vault.sec });
  } else if (k === 'grab') {
    const t = PAT.grab.wind * W;
    r.act = { k, st: 'wind', t, t0: t, x: g.W / 2, hits: 0, zone: { shape: 'door', col: '#ff9a3a' } };
    g.events.push({ type: 'r2Wind', k, x: g.W / 2, y: e.y, sec: t, name, need: r.fx.grab, zone: r.act.zone });
  }
}
function vaultBreak(g) {
  const r = g.r2, e = boss(g);
  r.vault = null;
  e.weakT = Math.max(e.weakT || 0, 4);
  g.ult = Math.min(RULES.ultMax, g.ult + 10);
  g.events.push({ type: 'r2Vault', x: e.x, y: e.y, broke: true });
}
function land(g, a) {
  const r = g.r2, e = boss(g);
  const gap = (t) => { a.st = 'gap'; a.t = t; e.weakT = Math.max(e.weakT || 0, t * 0.6); };
  if (a.k === 'slam' || a.k === 'combo') {
    r.slams++;
    gateHit(g, PAT.slam.pct * (a.k === 'combo' ? 0.7 : 1), 'slam');
    const hit = [];
    for (const h of g.heroes) if (!h.gone && Math.abs(h.x - a.x) <= PAT.slam.zone + 16) { knock(g, h, PAT.slam.knock); if (stunHero(g, h, PAT.slam.stun)) hit.push({ x: h.x, y: h.y }); }
    g.events.push({ type: 'r2Slam', k: a.k, x: a.x, y: g.ropeY, hits: hit, day: r.day });
    if (a.k === 'combo' && --a.n > 0) { const x = laneX(g); a.st = 'wind'; a.t = a.t0 = PAT.combo.wind * r.fx.wind * 0.85; a.x = x; a.zone = { shape: 'lane', x, w: PAT.slam.zone }; a.chain = true; a.hits = 0; a.seen = {}; g.events.push({ type: 'r2Wind', k: 'combo', x, y: e.y, sec: a.t, zone: a.zone, name: '분노 연타', chain: true, need: r.fx.cut }); return; }
    a.st = 'gap'; a.t = PAT.slam.gap; e.weakT = Math.max(e.weakT || 0, PAT.slam.gap);
    // 연계 (어려움 · 지옥): 내려찍은 손으로 바로 고지서를 뿌린다
    if (r.fx.follow && g.rng() < r.fx.follow) { const n = PAT.bills.n[r.phase - 1]; throwBills(g, n); g.events.push({ type: 'r2Pat', k: 'bills', x: e.x, y: e.y, n, name: '연계! 고지서', follow: true }); }
    g.events.push({ type: 'r2Gap', x: e.x, y: e.y });
  } else if (a.k === 'sweep' || a.k === 'broom' || a.k === 'noise') {
    const P = PAT[a.k];
    if (P.pct) gateHit(g, P.pct, 'other');
    const hit = [];
    for (const h of g.heroes) {
      if (h.gone || (h.x - g.W / 2) * a.side < -6) continue;
      let ok = false;
      if (a.k === 'sweep') { knock(g, h, P.knock); ok = stunHero(g, h, P.stun); }
      else if (a.k === 'broom') { knock(g, h, P.knock); ok = afflict(g, h, 'fear', P.fear) > 0; }
      else { ok = afflict(g, h, 'charm', P.charm) > 0; afflict(g, h, 'fear', P.fear); }
      if (ok) hit.push({ x: h.x, y: h.y });
    }
    g.events.push({ type: a.k === 'sweep' ? 'r2Sweep' : 'r2Side', k: a.k, side: a.side, x: a.x, y: g.rowY, hits: hit });
    gap(P.gap || 2.2);
  } else if (a.k === 'evict' || a.k === 'contract') {
    const P = PAT[a.k];
    gateHit(g, P.pct, 'other');
    const hit = [];
    for (const h of alive(g)) if (stunHero(g, h, P.seal, 'seal')) hit.push({ x: h.x, y: h.y });
    if (a.k === 'contract') for (const h of pickTop(g, P.stunN + (r.fx.add || 0))) if (stunHero(g, h, P.stun)) { knock(g, h, 30); hit.push({ x: h.x, y: h.y, stun: true }); }
    g.events.push({ type: a.k === 'evict' ? 'r2Evict' : 'r2Contract', x: e.x, y: g.ropeY, hits: hit });
    gap(P.gap || 2.2);
  } else if (a.k === 'meter') {
    r.meterT = PAT.meter.sec;
    g.events.push({ type: 'r2Meter', x: g.W / 2, y: g.ropeY, sec: PAT.meter.sec });
    gap(PAT.meter.gap);
  } else if (a.k === 'bomb') {
    gateHit(g, PAT.bomb.pct, 'other');
    const hit = [];
    for (const h of alive(g)) if (Math.abs(h.x - a.x) <= PAT.bomb.r) { knock(g, h, PAT.bomb.knock); hit.push({ x: h.x, y: h.y }); }
    g.events.push({ type: 'r2Bomb', x: a.x, y: g.ropeY, hits: hit });
    gap(PAT.bomb.gap);
  } else if (a.k === 'raise') {
    r.armor = Math.min(PAT.raise.max, r.armor + PAT.raise.add);
    e.armorPct = r.armor;
    g.events.push({ type: 'r2Armor', x: e.x, y: e.y, armor: r.armor });
    gap(PAT.raise.gap);
  } else if (a.k === 'crew') {
    spawnCrew(g, a.n || crewN(g));
    gap(PAT.crew.gap);
  } else if (a.k === 'tow') {
    const h = a.hero;
    gateHit(g, PAT.tow.pct, 'other');
    const hit = [];
    if (h && !h.gone) { knock(g, h, PAT.tow.knock); if (stunHero(g, h, PAT.tow.stun)) hit.push({ x: h.x, y: h.y }); }
    g.events.push({ type: 'r2Tow', x: a.x, y: h ? h.y : g.rowY, bx: e.x, by: e.y, hits: hit });
    a.hero = null;
    gap(PAT.tow.gap);
  } else if (a.k === 'grab') {
    a.st = 'hold'; a.t = PAT.grab.hold; a.hits = 0; a.seen = {}; e.weakT = Math.max(e.weakT || 0, PAT.grab.hold);
    g.events.push({ type: 'r2Grab', x: e.x, y: g.ropeY, sec: PAT.grab.hold, need: r.fx.grab });
  }
}
// 표시물 터짐 (고지서 · 돈다발 · 도장 · 오수 · 외제차)
function markHit(g, m) {
  const r = g.r2;
  if (m.k === 'bill') { gateHit(g, PAT.bills.pct, 'bill'); g.events.push({ type: 'r2Bill', x: m.x, y: m.y }); return; }
  if (m.k === 'rush') { const car = g.rng() < 0.6, c = spawnAdd(g, car ? 'carpoor' : 'cutter', m.x, PAT.rush.hp, { speed: PAT.rush.speed * (car ? 1.6 : 1), atk: PAT.rush.atk, plain: true }); if (c) { c.r2rush = true; c.r2hit = PAT.rush.crash; } g.events.push({ type: 'r2Rush', x: m.x, y: -20 }); return; }
  const P = PAT[m.k], hit = [];
  if (m.k === 'cash') gateHit(g, P.pct, 'other');
  for (const h of g.heroes) {
    if (h.gone || Math.hypot(h.x - m.x, h.y - m.y) > P.r) continue;
    if (m.k === 'cash' || m.k === 'stamp') { knock(g, h, P.knock); if (stunHero(g, h, P.stun)) hit.push({ x: h.x, y: h.y }); }
    else if (m.k === 'leak') { const a = afflict(g, h, 'poison', P.poison); afflict(g, h, 'slow', P.poison * 0.6, { cut: P.slow }); if (a) hit.push({ x: h.x, y: h.y }); }
  }
  if (m.k === 'leak') r.pools.push({ x: m.x, y: m.y, t: P.pool, t0: P.pool });
  g.events.push({ type: m.k === 'cash' ? 'r2Cash' : m.k === 'stamp' ? 'r2Stamp' : 'r2Leak', x: m.x, y: m.y, hits: hit });
}

// 매 프레임 (sim step · updateEnemies 바로 뒤)
function tick(g, dt) {
  const r = g.r2, e = boss(g);
  if (g.over || g.phase === 'victory' || !e) return;
  g.waveT = Math.min(g.waveT, 17.9 + (g.wave < 4 ? 1 : 0)); // 4웨이브(증강 3번)까지만 숫자를 넘긴다
  // 경험치 · 총공지 (진상이 없으니 시간으로)
  const ultUsed = r.ult0 >= RULES.ultMax * 0.95 && g.ult < r.ult0 * 0.5; // 방금 총공지를 썼다
  if (g.phase === 'wave' || g.phase === 'break') {
    gainExp(g, (g.need / (TEMPO_R2.exp + TEMPO_R2.expLv * g.level)) * dt);
    g.ult = Math.min(RULES.ultMax, g.ult + TEMPO_R2.ult * (g.mods.ultCharge || 1) * dt);
  }
  r.ult0 = g.ult;
  // 팀 초당 피해 (금고 크기) — 3초마다 평균
  r.rateT += dt;
  if (r.rateT >= 3) { const now = r.rate / r.rateT; r.rateAvg = r.rateAvg ? r.rateAvg * 0.6 + now * 0.4 : now; r.rate = 0; r.rateT = 0; }
  if (r.punishT > 0) r.punishT -= dt;
  // 금: 수리로 메울 수 없는 만큼 (입구 체력은 최대 − 금 을 못 넘는다) · 금이 입구를 다 덮으면 무너진다
  if (r.crack > 0) {
    const top = g.base.max - r.crack;
    if (top <= 0) { g.sigRevived = true; g.doorShield = 0; damageBase(g, g.base.max * 99, e); if (!g.over) { g.base.hp = 0; g.over = true; g.phase = 'over'; g.events.push({ type: 'gameover' }); } return; }
    if (g.base.hp > top) g.base.hp = top;
  }
  // 화 쌓기
  if ((r.angryT -= dt) <= 0) { r.angryT = TEMPO_R2.angryEvery; r.angry++; g.events.push({ type: 'r2Angry', n: r.angry, x: e.x, y: e.y }); }
  // 철거 (최대 시간)
  if (!r.finale && g.t >= R2.sec) {
    r.finale = true; r.act = null;
    g.events.push({ type: 'r2Final', x: e.x, y: g.ropeY });
    g.sigRevived = true; g.doorShield = 0;
    damageBase(g, g.base.max * 99, e);
    if (!g.over) { g.base.hp = 0; g.over = true; g.phase = 'over'; g.events.push({ type: 'gameover' }); }
    return;
  }
  // 몸: 좌우로 천천히 · 예고 땐 몸을 젖히고 · 내려찍은 뒤엔 앞으로 숙인다 (빈틈)
  const a = r.act;
  const wantLift = !a ? 0 : a.st === 'wind' ? (a.k === 'grab' || a.k === 'meter' ? 30 : -12) : a.st === 'down' ? 70 : a.k === 'grab' && a.st === 'hold' ? 92 : a.st === 'gap' ? 26 : 0;
  const wantLean = a && a.zone && a.zone.shape === 'lane' && a.x ? clamp((a.x - g.W / 2) * 0.5, -60, 60) : a && a.side ? a.side * 40 : a && a.k === 'tow' && a.x ? clamp((a.x - g.W / 2) * 0.3, -40, 40) : 0;
  e.lift += (wantLift - e.lift) * Math.min(1, dt * (a && a.st === 'down' ? 16 : 5));
  e.lean += (wantLean - e.lean) * Math.min(1, dt * 4);
  e.x = e.ax + e.lean + Math.sin(g.t * 0.5) * 18; e.y = e.ay + e.lift; e.kbv = 0; e.atRope = false;
  // 계량기 · 금고: 입구 에너지를 계속 빨아먹는다
  if (r.meterT > 0) { r.meterT -= dt; gateHit(g, PAT.meter.dps * dt, 'drain'); if (g.over) return; }
  if (r.vault) {
    r.vault.t -= dt;
    gateHit(g, PAT.vault.dps * dt, 'drain');
    if (g.over) return;
    if (r.vault && r.vault.t <= 0) { r.vault = null; gateHit(g, PAT.vault.pct, 'other'); g.events.push({ type: 'r2Vault', x: e.x, y: e.y, gulp: true }); if (g.over) return; }
  }
  // 외제차 충돌 · 용역 철거: 소환 진상이 입구에 처음 닿는 순간 쾅 (금이 간다 — 닿기 전에 잡거나 늦춰야)
  for (const x of g.enemies) if (x.r2hit && !x.dead && (x.atRope || x.y >= (x.stopY || g.ropeY) - 4) && !x.r2crash) { x.r2crash = true; r.crashes = (r.crashes || 0) + 1; gateHit(g, x.r2hit / r.fx.pow, 'other'); g.events.push({ type: 'r2Crash', x: x.x, y: g.ropeY, k: x.r2rush ? 'car' : 'crew' }); if (g.over) return; }
  // 오수 웅덩이 (보이기만 · 느림은 이미 걸었음)
  if (r.pools.length) { for (const p of r.pools) p.t -= dt; r.pools = r.pools.filter((p) => p.t > 0); }
  // 표시물 (고지서 · 돈다발 · 도장 · 오수 · 외제차)
  if (r.marks.length) {
    for (const m of r.marks) {
      if ((m.t -= dt) > 0) continue;
      m.done = true;
      markHit(g, m);
      if (g.over) return;
    }
    r.marks = r.marks.filter((m) => !m.done);
  }
  if (g.phase !== 'wave' && g.phase !== 'break') return;
  // 패턴 진행
  if (!a) {
    if ((r.nextT -= dt) <= 0) begin(g, choose(g));
  } else if (a.st === 'wind') {
    if (a.k === 'tow' && a.hero && !a.hero.gone && a.zone) { a.x = a.hero.x; a.zone.x = a.hero.x; a.zone.y = a.hero.y; }
    if (a.k !== 'grab' && e.stunT > 0) cut(g, '기절시켜 끊었다!', true);
    else if (a.k !== 'grab' && ultUsed) cut(g, '총공지로 끊었다!', false);
    else if ((a.t -= dt) <= 0) { if (a.k === 'grab') land(g, a); else { a.st = 'down'; a.t = 0.3; land(g, a); } }
  } else if (a.st === 'hold') {
    if (e.stunT > 0) release(g, '기절시켜 떼어냈다!');
    else if (ultUsed) release(g, '총공지로 떼어냈다!');
    else { gateHit(g, PAT.grab.dps * dt, 'other'); if ((a.t -= dt) <= 0) { r.act = null; e.weakT = 0; } }
  } else if ((a.t -= dt) <= 0) r.act = null;
  if (!r.act && a) r.nextT = Math.max(r.nextT, TEMPO_R2.gap[r.phase - 1] * r.fx.gap * r.dfx.gap / (1 + TEMPO_R2.angryFast * r.angry) * (0.85 + g.rng() * 0.3));
}
// 판 결과에 붙일 숫자 (서버로)
export function report(g) {
  const r = g.r2;
  if (!r) return null;
  const v = Math.floor(r.dmg.body || 0);
  return { parts: v > 0 ? { body: v } : {}, total: v, diff: r.diff, day: r.day, cuts: r.cuts, ccCuts: r.ccCuts, slams: r.slams, angry: r.angry, adds: r.adds, crashes: r.crashes | 0, armor: r.armor, crack: g.base && g.base.max ? r.crack / g.base.max : 0, cc: Math.round(r.ccSec), gate: { slam: Math.round(r.gate.slam), bill: Math.round(r.gate.bill), other: Math.round(r.gate.other || 0), drain: Math.round(r.gate.drain || 0) } };
}
// (화면 찍기 · 테스트) 그 패턴을 지금 바로 시작
export function forcePattern(g, k) { if (!g.r2 || g.over) return false; g.r2.act = null; begin(g, k); return !!g.r2.act || true; }
