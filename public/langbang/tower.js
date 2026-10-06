// 랑방 대전 — 진상의 탑 (60층 · 4구역 · 멤버 한 명만 · 층마다 규칙)
// 순수 함수만 (DOM 없음). 서버(server/langbang-tower.js)가 이 파일을 그대로 불러 쓰고, 손님은 같은 함수로 이 기기에 저장한다.
//  - 층 구성(floorDef) · 규칙 · 보상 · 하루 도전 횟수 · 멤버별 지옥 각성 · 염화석 상점(지옥 세트) · 주간 탑 랭킹 · 명예의 전당
import { ENEMIES, BOSS_KITS, ENEMY_ANIM, ENEMY_ATK, HEROES, GEAR_IDS, ATTRS, LEGEND_HEROES, hashSeed, seedRng, hpMul, TOWER_AWAKE_FX, HELL_SET_FX, TOWER_SIM } from './data.js';
import * as L from './live.js';

const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

// ─── 기본 숫자 (밸런스: scripts/lb-tower-sim.js 로 맞춘 값) ───
export const TOWER = {
  floors: 100, perZone: 15, unlock: 10, tries: 5, hall: 60, // 1-10 클리어로 열림 · 하루 5번 (실패할 때만 깎인다) · (10/07 리메이크: 100층 · 61층부터는 4구역 왕좌가 이어진다 · 명예의 전당은 그대로 60층)
  // 층마다 진상 체력 · 공격력 배율 (복리): [이 층부터, 체력 ×, 공격력 ×] — scripts/lb-tower-sim.js grid 로 맞춘 값
  //  예전 한 줄(체력 ×1.065)은 멤버를 층마다 바꿔 가며 오르면 +10 ★3 계정도 42층, +15 ★4 는 53층까지 갔다 (출시 첫날 47층)
  //  → 16~35층을 가파르게: 계정 전체 +10 ★3 은 29층 · +15 ★4 는 33층에서 막힌다 · 46층부터는 규칙 둘이 벽이라 체력은 거의 그대로
  grow: [[2, 1.09, 1.04], [16, 1.17, 1.05], [26, 1.09, 1.04], [36, 1.015, 1.02], [46, 1.005, 1.01]],
  hp0: 0.9, atk0: 0.55, waveHp: 0.14, // 1층 체력 · 공격 배율 · 같은 층 웨이브마다 체력 +14%
  exp: 2.1, // 혼자라서 경험치를 넉넉히 (레벨업 카드가 판마다 5~7번)
  minSec: 8, // 웨이브 하나에 최소 8초 (조작 방지)
};
// 탑 리메이크 (10/07): 멤버 최대 3명 (끌어서 자리 옮기기 · 바닥 예고 피하기 — tower-arena.js) · 데려간 멤버 모두에게 피로 (한 명당 배율)
export const SQUAD = { max: 3, fat: [1, 0.6, 0.45] };
export const squadFat = (n, v) => Math.max(1, Math.round(v * (SQUAD.fat[Math.max(1, Math.min(SQUAD.max, n)) - 1] || 1)));
// 구역: 15층마다 맵 · 진상 구성 · 보스가 바뀐다 (맵 그림은 720×1290 · 입구는 다른 맵처럼 73.5% 높이)
export const ZONES = [
  { id: 1, name: '용암 회랑', sub: '불길이 치솟는 탑의 입구', img: '/img/lb/bg_tower1.webp', color: '#ff6a2a', glow: 'rgba(255,90,30,', from: 1,
    mix: [['drunk', 4], ['thug', 2], ['vomit', 2], ['gao', 1], ['cutter', 2], ['mukti', 2], ['yeokko', 3]], swarm: ['yeokko', 'namkko', 'mukti', 'cutter'], titan: ['thug', 'gao'], rush: ['mukti', 'cutter', 'drunk'],
    bosses: ['tb_lava1', 'tb_lava2', 'tb_lava3'], kit: ['shock', '용암 분출', {}] },
  { id: 2, name: '사슬 감옥', sub: '쇠사슬이 철컹이는 지하 감옥', img: '/img/lb/bg_tower2.webp', color: '#9ab0d8', glow: 'rgba(140,170,255,', from: 16,
    mix: [['inpi_gossip', 3], ['inpi_dictator', 1], ['scammer', 2], ['handsy', 2], ['kkondae', 1], ['spam', 2], ['inpi_clique', 2]], swarm: ['inpi_clique', 'inpi_gossip', 'selfie', 'mukti'], titan: ['kkondae', 'inpi_dictator'], rush: ['scammer', 'mukti', 'cutter'],
    bosses: ['tb_chain1', 'tb_chain2', 'tb_chain3'], kit: ['stun', '사슬 구속', { n: 1, sec: 2.2 }] },
  { id: 3, name: '지옥 클럽 연회장', sub: '붉은 조명 아래 끝나지 않는 파티', img: '/img/lb/bg_tower3.webp', color: '#ff3fa8', glow: 'rgba(255,60,170,', from: 31,
    mix: [['clubguy', 2], ['clubgirl', 3], ['couple', 1], ['sales', 2], ['secretmom', 2], ['fakesingle', 2], ['sarcasm', 2], ['otaku', 1]], swarm: ['clubgirl', 'jjijil', 'sarcasm', 'selfie'], titan: ['otaku', 'couple'], rush: ['clubgirl', 'fakesingle', 'drunk_run'],
    bosses: ['tb_club1', 'tb_club2', 'tb_club3'], kit: ['silence', '지옥 디스코', { sec: 3.5 }] },
  { id: 4, name: '진상 대왕의 왕좌', sub: '탑의 꼭대기 — 모든 진상의 왕이 기다린다', img: '/img/lb/bg_tower4.webp', color: '#ffcf3f', glow: 'rgba(255,200,60,', from: 46,
    mix: [['drunk_cry', 2], ['drunk_run', 2], ['drunk_sleep', 1], ['kkondae2', 1], ['carpoor', 2], ['inpi_treasurer', 1], ['sales', 2], ['earphone', 1]], swarm: ['drunk_run', 'drunk_home', 'clubgirl', 'inpi_clique', 'mukti'], titan: ['kkondae2', 'drunk_sleep', 'carpoor'], rush: ['drunk_run', 'cutter', 'carpoor'],
    bosses: ['tb_king1', 'tb_king2', 'tb_king3'], kit: ['drain', '왕의 착취', { v: 0.15 }] },
];
// ─── 피로도 (멤버마다 0~100) ───
//  탑을 오를 때마다 쌓이고 · 시간이 지나면 저절로 풀린다 (한 시간에 6 · 0까지 약 17시간)
//  피로한 멤버는 탑에서만 약해진다 (공격력 · 입구 내구도 × (1 − 피로 × 0.004) → 100이면 −40%) · 100이면 쉬어야 들어갈 수 있다
//  하루 몇 층 제한 대신: 센 멤버 하나로 끝없이 오르지 못하게 (마스터 · 무료 모드는 안 쌓인다)
export const FATIGUE = {
  max: 100, perHour: 6, // 한 시간에 6씩 회복
  clear: 25, clearHigh: 40, highFrom: 31, // 깬 층 +25 (31층부터 +40)
  fail: 15, replay: 25, // 실패 +15 · 이미 깬 층을 다시 깨도 +25
  pow: 0.004, // 피로 1 = 공격력 · 내구도 −0.4%
  potion: 50, // 피로 회복제 하나 −50
  unlock: 70, // 100이 되면 지친 상태 → 70 아래로 풀릴 때까지 못 들어감 (약 5시간)
};
const HOUR = 3600e3;
// 지금 피로 (저장된 값에서 지난 시간만큼 뺀다)
export function fatigueOf(lb, hero, now = Date.now()) {
  const x = ((lb && lb.tower && lb.tower.fat) || {})[hero];
  if (!x) return 0;
  const v = x.v - (Math.max(0, now - (x.at || 0)) / HOUR) * FATIGUE.perHour;
  return Math.max(0, Math.min(FATIGUE.max, Math.ceil(v - 1e-9)));
}
// 피로 더하기 (빼기는 음수) — 지금 값으로 다시 적는다
export function fatigueAdd(lb, hero, d, now = Date.now()) {
  const t = lb.tower; t.fat = t.fat || {};
  const v = Math.max(0, Math.min(FATIGUE.max, fatigueOf(lb, hero, now) + d));
  const was = t.fat[hero] && t.fat[hero].lock && v >= FATIGUE.unlock;
  if (v > 0) t.fat[hero] = { v, at: now, ...(v >= FATIGUE.max || was ? { lock: 1 } : {}) }; else delete t.fat[hero];
  return v;
}
// 탑 전투 배율 (공격력 · 입구 내구도): 피로 100 → 0.6
export const fatigueMul = (v) => 1 - Math.max(0, Math.min(FATIGUE.max, v || 0)) * FATIGUE.pow;
// 다 풀릴 때까지 남은 시간 (ms) · 다시 들어갈 수 있을 때까지 (100 미만)
export const fatigueRestMs = (v) => Math.ceil((Math.max(0, v) / FATIGUE.perHour) * HOUR);
// 지쳐서 못 들어가는 중? (100을 찍으면 70 아래로 풀릴 때까지)
export function fatigueLocked(lb, hero, now = Date.now()) {
  const x = ((lb && lb.tower && lb.tower.fat) || {})[hero];
  if (!x) return false;
  const v = fatigueOf(lb, hero, now);
  return v >= FATIGUE.max || (!!x.lock && v >= FATIGUE.unlock);
}
export function fatigueOkMs(lb, hero, now = Date.now()) {
  const x = ((lb && lb.tower && lb.tower.fat) || {})[hero];
  if (!x || !fatigueLocked(lb, hero, now)) return 0;
  const raw = x.v - (Math.max(0, now - (x.at || 0)) / HOUR) * FATIGUE.perHour;
  return Math.max(60e3, Math.ceil(((raw - (FATIGUE.unlock - 1)) / FATIGUE.perHour) * HOUR));
}
// 이 층을 깨면 / 실패하면 쌓이는 피로
export const fatigueGain = (f, clear, replay) => (!clear ? FATIGUE.fail : replay ? FATIGUE.replay : f >= FATIGUE.highFrom ? FATIGUE.clearHigh : FATIGUE.clear);
const hoursText = (ms) => { const m = Math.ceil(ms / 60e3); return m >= 60 ? `${Math.ceil(m / 60)}시간` : `${Math.max(1, m)}분`; };
export const fatigueTimeText = hoursText;

export const zoneOf = (f) => ZONES[Math.max(0, Math.min(3, Math.floor((int(f, 1, 999) - 1) / 15)))]; // 61층부터는 4구역(왕좌)이 이어진다
export const isBossFloor = (f) => f % 5 === 0;

// ─── 층 규칙: 층마다 하나 (46~60층은 둘) — 모든 멤버가 빛나는 층이 있게 돌아가며 ───
export const RULES = {
  titan: { id: 'titan', name: '거물', short: '거물', color: '#ff8a4f', desc: '한 번에 한 명씩 · 아주 느리지만 체력이 엄청나고 문을 세게 친다', hint: '추천: 한 방 · 단일 공격 · 보스 킬러' },
  swarm: { id: 'swarm', name: '떼거리', short: '떼거리', color: '#ffd23f', desc: '약한 진상이 서너 배로 쏟아진다 — 지치지 마라', hint: '추천: 범위 · 관통 · 연쇄 (돌격형은 둘러싸여 금방 지친다)' },
  curse: { id: 'curse', name: '저주', short: '저주', color: '#c77dff', desc: '진상이 계속 기절 · 침묵 · 홀림 · 감속을 건다 (돌격 중에 걸리면 돌격이 끊긴다)', hint: '추천: 상태이상 해제 · 면역 · 저항 장비' },
  rush: { id: 'rush', name: '돌진', short: '돌진', color: '#6ff0ff', desc: '빠른 진상이 몰려오고 잘 피한다 (느려지거나 기절한 진상은 못 피함)', hint: '추천: 감속 · 기절 · 밀어내기 (근접 돌격은 절반이 빗나간다)' },
  seal: { id: 'seal', name: '속성 봉인', short: '봉인', color: '#7be38f', desc: '한 속성은 피해 −60% · 다른 한 속성은 +30%', hint: '추천: 강해지는 속성' },
  shield: { id: 'shield', name: '보호막', short: '보호막', color: '#9feaff', desc: '모든 진상이 보호막 3겹 (한 방에 한 겹 · 3초마다 다시 참) + 체력 보호막', hint: '추천: 연사 · 범위 · 보호막 깨기' },
  dark: { id: 'dark', name: '어둠', short: '어둠', color: '#8a8fb8', desc: '사거리 −35% · 진상이 가까이 오기 전엔 안 보이고 불도 자주 꺼진다', hint: '추천: 근접 · 오라 · 은신 탐지' },
  boss: { id: 'boss', name: '보스', short: '보스', color: '#ff4f5a', desc: '탑 전용 보스 + 구역 기술', hint: '추천: 보스 킬러 · 한 방' },
};
// 층 규칙 그림 (public/img/lb/ui2/tw_<규칙>.webp) — 아직 없는 그림은 비슷한 아이콘으로 (그림이 오면 여기서 지우기)
export const RULE_ART_TODO = {};
export const ruleIcon = (r) => `/img/lb/ui2/${RULE_ART_TODO[r] || 'tw_' + r}.webp`;
// 그 밖의 탑 그림 — 아직 없는 그림은 비슷한 그림으로 (그림이 오면 주소만 바꾸기)
//  hellstone → /img/lb/ui2/hellstone.webp · aura → /img/lb/fx/awake_aura.webp · tile → /img/lb/ui2/tower_tile.webp
export const TOWER_ART = { hellstone: '/img/lb/ui2/hellstone.webp', aura: '/img/lb/fx/vfx_aura_red.webp', tile: '/img/lb/ui2/tower_tile.webp', lobby: '/img/lb/tower_lobby.webp' };
const PATTERN = [
  ['swarm', 'titan', 'curse', 'rush', 'seal', 'shield', 'dark', 'swarm', 'titan', 'rush', 'curse', 'seal'],
  ['titan', 'curse', 'swarm', 'dark', 'shield', 'rush', 'seal', 'titan', 'curse', 'swarm', 'dark', 'shield'],
  ['curse', 'shield', 'titan', 'swarm', 'rush', 'dark', 'seal', 'curse', 'titan', 'shield', 'swarm', 'rush'],
  [['titan', 'curse'], ['swarm', 'dark'], ['rush', 'shield'], ['seal', 'titan'], ['curse', 'rush'], ['shield', 'swarm'], ['dark', 'titan'], ['swarm', 'curse'], ['titan', 'seal'], ['rush', 'dark'], ['curse', 'shield'], ['seal', 'swarm']],
];
const Z4_BOSS = ['curse', 'shield', 'seal'];
export function floorRules(f) {
  f = int(f, 1, TOWER.floors);
  const z = zoneOf(f), i = (f - 1) % 15;
  if (isBossFloor(f)) return z.id === 4 ? ['boss', Z4_BOSS[(i / 5) | 0]] : ['boss'];
  const p = PATTERN[z.id - 1][i - Math.floor(i / 5)];
  return Array.isArray(p) ? p.slice() : [p];
}
const ATTR_IDS = ['talk', 'power', 'charm', 'booze'];
export function floorSeal(f) { return { weak: ATTR_IDS[(f * 3) % 4], strong: ATTR_IDS[(f * 3 + 2) % 4] }; }
export function ruleDesc(r, f) {
  if (r === 'seal') { const s = floorSeal(f); return `${ATTRS[s.weak].name} 피해 −60% · ${ATTRS[s.strong].name} 피해 +30%`; }
  if (r === 'boss') { const b = ENEMIES[floorBoss(f)]; const z = zoneOf(f); return `${b ? b.name : '탑 보스'} — 구역 기술 "${z.kit[1]}"`; }
  return RULES[r].desc;
}
export function ruleHint(r, f) {
  if (r === 'seal') { const s = floorSeal(f); return `추천: ${ATTRS[s.strong].name} 속성 · ${ATTRS[s.weak].name} 속성은 피하기`; }
  return RULES[r].hint;
}
export const floorBoss = (f) => (isBossFloor(f) ? zoneOf(f).bosses[((f - 1) % 15) / 5 | 0] : null);
// 층 배율: 체력 · 공격력 (1층 = hp0 · atk0)
//  TOWER.grow 구간마다 한 층 오를 때 곱하는 값이 다르다
export const growAt = (f, i) => { let r = 1; for (const s of TOWER.grow) if (f >= s[0]) r = s[i]; return r; };
const growMul = (f, i) => { let m = 1; for (let x = 2; x <= int(f, 1, 999); x++) m *= growAt(x, i); return m; };
export const floorHp = (f) => TOWER.hp0 * growMul(f, 1);
export const floorAtk = (f) => TOWER.atk0 * growMul(f, 2);

// ─── 탑 전용 보스: 원래 보스 그림에 지옥 색 + 새 이름 · 구역 기술 하나 더 ───
const TB = [
  ['tb_lava1', 'boss_thug', '용암 폭력배 두목', '"불구덩이로 꺼져!"', 1300],
  ['tb_lava2', 'boss_loan', '불붙은 사채업자', '"이자가 활활 타오른다~"', 1300],
  ['tb_lava3', 'boss_gapjil', '지옥문지기 갑질 대왕', '"이 문은 아무도 못 지나간다!"', 1500],
  ['tb_chain1', 'boss_kkondol', '사슬 꼰대 간수', '"라떼는 말이야, 여기서 30년 살았어"', 1450],
  ['tb_chain2', 'boss_sales', '족쇄 영업왕', '"이 족쇄, 평생 무료입니다~"', 1450],
  ['tb_chain3', 'boss_inpi', '감옥장 인피 대장', '"사슬 풀고 싶으면 나를 넘어라"', 1650],
  ['tb_club1', 'queen', '지옥 클럽 여왕벌', '"오늘 밤은 안 끝나~"', 1600],
  ['tb_club2', 'boss_queenmom', '연회장 주인 싱글맘', '"VIP 테이블은 내 거야"', 1650],
  ['tb_club3', 'boss_soloparty', '악마 DJ 솔로파티왕', '"지옥의 디스코 타임!!"', 1850],
  ['tb_king1', 'boss_otaku', '불지옥 오타쿠 왕', '"내 컬렉션에 너를 넣어 주마"', 1800],
  ['tb_king2', 'boss_jusa', '대왕의 오른팔 주사왕', '"대왕님 앞에서 무릎 꿇어라…"', 1850],
  ['tb_king3', 'boss_union', '진상 대왕', '"내가 바로 모든 진상의 왕이다!!"', 2200],
];
export const TOWER_BOSSES = TB.map((b) => b[0]);
for (const [id, base, name, sub, hp] of TB) {
  if (ENEMIES[id] || !ENEMIES[base]) continue;
  const z = ZONES[Math.floor(TB.findIndex((b) => b[0] === id) / 3)];
  ENEMIES[id] = Object.assign({}, ENEMIES[base], { id, name, hp, towerOnly: true, base, hellTint: true, title: `${name} 등장!`, subtitle: sub, size: Math.round(ENEMIES[base].size * (id === 'tb_king3' ? 1.18 : 1.06)) });
  const kit = BOSS_KITS[base];
  if (kit) BOSS_KITS[id] = { name, skills: [...kit.skills, z.kit], p2: kit.p2 };
  if (ENEMY_ANIM[base]) ENEMY_ANIM[id] = ENEMY_ANIM[base];
  if (ENEMY_ATK[base]) ENEMY_ATK[id] = ENEMY_ATK[base];
}

// ─── 층 구성: 웨이브 정의 (sim 이 스테이지 웨이브처럼 읽는다) ───
//  g: [진상, 수, 간격(초), 시작(초), 'E'=정예] · level = 총공지 · 폭발 세기용 (체력은 hpScale 로 맞춘다)
function pickW(rng, list) {
  const sum = list.reduce((a, x) => a + x[1], 0);
  let r = rng() * sum;
  for (const x of list) { r -= x[1]; if (r <= 0) return x[0]; }
  return list[0][0];
}
export function floorDef(f0) {
  const f = int(f0, 1, TOWER.floors);
  const z = zoneOf(f), rules = floorRules(f), has = (r) => rules.includes(r);
  const rng = seedRng(hashSeed('lbtower:' + f));
  const boss = floorBoss(f);
  const nW = has('boss') || has('titan') ? 2 : 3;
  const level = 2 + f * 0.5;
  const waves = [];
  for (let w = 1; w <= nW; w++) {
    const g = [];
    const dur = 15 + 2 * w;
    const last = w === nW;
    let kind = 'N';
    if (has('titan') && !(boss && last)) {
      // 거물: 한 명씩 (느리고 · 체력이 엄청 · 문을 세게) — 다른 규칙이 같이 있으면 졸개 조금
      kind = 'E';
      const n = 2 + (w >= 2 ? 1 : 0);
      for (let k = 0; k < n; k++) g.push([z.titan[(k + w + f) % z.titan.length], 1, 1, 0.5 + k * 11, 'E']);
      if (rules.length > 1) g.push([z.swarm[(w + f) % z.swarm.length], 6, 2.2, 3, '']);
    } else if (has('swarm')) {
      kind = 'S';
      const types = z.swarm.slice(0, 3);
      const cm = TOWER_SIM.swarm.count[0] + (TOWER_SIM.swarm.count[1] - TOWER_SIM.swarm.count[0]) * Math.min(1, (f - 1) / TOWER_SIM.ramp);
      types.forEach((t, i) => { const c = Math.round((18 + 6 * w) * (i === 0 ? 1.3 : 1) * cm); g.push([t, c, +(dur / c).toFixed(2), i * 1.2, '']); });
    } else {
      const want = 16 + 5 * w;
      const pick = {};
      for (let k = 0; k < want; k++) { const t = has('rush') && rng() < 0.65 ? z.rush[(rng() * z.rush.length) | 0] : pickW(rng, z.mix); pick[t] = (pick[t] | 0) + 1; }
      Object.entries(pick).forEach(([t, c], i) => g.push([t, c, +(dur / c).toFixed(2), +(i * 0.6).toFixed(1), '']));
    }
    if (boss && last) { kind = 'B'; for (const x of g) { x[1] = Math.max(1, Math.round(x[1] * 0.45)); } }
    const H = floorHp(f) * (1 + TOWER.waveHp * (w - 1));
    const def = { g, level, hpScale: H / hpMul(level, true), kind, fodderHp: 1, eliteHp: 1, clump: kind === 'S', tower: true };
    if (boss && last) def.boss = boss;
    waves.push(def);
  }
  return { f, zone: z.id, rules, seal: has('seal') ? floorSeal(f) : null, boss, waves, stage: 35, atk: floorAtk(f) };
}
// 층 카드 (화면): 규칙 · 추천 · 보상
export function floorInfo(f) {
  const rules = floorRules(f);
  return { f, zone: zoneOf(f), rules, boss: floorBoss(f), seal: rules.includes('seal') ? floorSeal(f) : null, reward: floorReward(f), mile: MILES[f] || null };
}

// ─── 보상 ───
// 층을 처음 깨면 (계정에서 한 번): 코인 · 강화석 · 염화석 · 보스 층 모집권 · 구역 끝(15·30·45·60) 큰 보상
export function floorReward(f) {
  const boss = isBossFloor(f), zoneEnd = f % 15 === 0;
  return {
    coins: Math.round((300 + 60 * f) * (boss ? 2 : 1)),
    stones: boss ? 2 + Math.floor(f / 15) : f % 2 === 0 ? 1 : 0,
    hell: (5 + Math.floor(f / 4)) * (boss ? 3 : 1),
    tickets: zoneEnd ? 3 : boss ? 1 : 0,
  };
}
// 마일스톤 (계정 처음 한 번 · 어느 멤버로든)
export const MILES = {
  15: { title: 'tower15', label: '칭호 "탑 등반가"' },
  30: { frame: 'towerflame', label: '움직이는 불꽃 프로필 프레임' },
  45: { legendPick: 1, label: '전설 장비 선택권' },
  60: { title: 'tower60', frame: 'towergold', heroPick: 1, label: '칭호 "진상 대왕 정복자" + 황금 지옥 프레임 + LEGEND 멤버 카드 묶음' },
};
// 멤버별 지옥 각성: 그 멤버로 오른 최고 층
export const AWAKE = [
  { f: 20, name: '각성 I', desc: '이 멤버 공격력 +5% (모든 모드)' },
  { f: 40, name: '각성 II', desc: '스킬 피해 +15% · 스킬 쿨타임 −8%' },
  { f: 60, name: '지옥 각성', desc: '붉은 오라 · 빛나는 눈 · 카드 각성 표시' },
];
export const AWAKE_FX = TOWER_AWAKE_FX;
export const awakeLv = (lb, hero) => { const b = ((lb && lb.tower && lb.tower.hb) || {})[hero] | 0; return b >= 60 ? 3 : b >= 40 ? 2 : b >= 20 ? 1 : 0; };
export function awakeMap(lb) { const out = {}; for (const h of Object.keys(HEROES)) { const v = awakeLv(lb, h); if (v) out[h] = v; } return out; }

// ─── 지옥 세트 (염화석 상점 · 멤버 한 명에게 끼운다 · 모든 모드에서 적용) ───
//  2세트: 상태이상 시간 −30% · 4세트: 처치하면 화염 폭발
export const HELL_SET = {
  hs_horn: { id: 'hs_horn', name: '지옥 뿔 투구', stat: 'atk', base: 0.08, per: 0.02, cost: 100, art: 'santahat', desc: '공격력' },
  hs_armor: { id: 'hs_armor', name: '용암 갑옷', stat: 'hp', base: 0.1, per: 0.025, cost: 100, art: 'carrier', desc: '입구 내구도' },
  hs_chain: { id: 'hs_chain', name: '사슬 건틀릿', stat: 'spd', base: 0.06, per: 0.015, cost: 100, art: 'belt', desc: '공격 속도' },
  hs_boots: { id: 'hs_boots', name: '불꽃 부츠', stat: 'skill', base: 0.1, per: 0.025, cost: 100, art: 'sneaker', desc: '스킬 피해' },
};
export const HELL_IDS = Object.keys(HELL_SET);
export const HELL_MAX = 5;
export const HELL_BONUS = { 2: { cc: HELL_SET_FX.cc, label: `2세트: 상태이상 시간 −${Math.round(HELL_SET_FX.cc * 100)}%` }, 4: { boom: HELL_SET_FX.boom, r: HELL_SET_FX.r, label: `4세트: 처치하면 화염 폭발 (한 방 피해의 ${Math.round(HELL_SET_FX.boom * 100)}%)` } };
// 지옥 세트 그림 (public/img/lb/gear/<id>.webp) — 아직 없어서 비슷한 장비 그림 + 붉은 빛 (그림이 오면 여기서 지우기)
export const HELL_ART_TODO = {};
export const hellImg = (id) => `/img/lb/gear/${HELL_ART_TODO[id] || id}.webp`;
export const hellUpCost = (lv) => 20 * (lv + 1);
export const hellValue = (id, lv) => { const s = HELL_SET[id]; return s ? Math.round((s.base + s.per * (lv || 0)) * 1000) / 1000 : 0; };
// 멤버 한 명의 지옥 세트 능력치 (장비 능력치에 더한다) — { atk, hp, …, hellSet: 낀 개수 }
export function hellStats(lb, hero) {
  const hs = (lb && lb.tower && lb.tower.hs) || {};
  const st = {}; let n = 0;
  for (const id of HELL_IDS) { const it = hs[id]; if (!it || it.on !== hero) continue; n++; const k = HELL_SET[id].stat; st[k] = (st[k] || 0) + hellValue(id, it.lv); }
  if (n) st.hellSet = n;
  return st;
}
// 염화석 상점: 지옥 세트 + 소모품 몇 개 (주마다 · 하루마다 개수 제한)
export const TOWER_SHOP = [
  { id: 'battery', kind: 'cons', cost: 40, per: 'week', n: 1 },
  { id: 'aldicom', kind: 'cons', cost: 12, per: 'day', n: 2 },
  { id: 'bombshot', kind: 'cons', cost: 25, per: 'week', n: 2 },
  { id: 'energydrink', kind: 'cons', cost: 20, per: 'week', n: 2 },
  { id: 'tickets', kind: 'tickets', amount: 1, cost: 40, per: 'week', n: 3, name: '모집권' },
  { id: 'stones', kind: 'stones', amount: 5, cost: 15, per: 'week', n: 3, name: '강화석 5개' },
  { id: 'potion', kind: 'fat', amount: FATIGUE.potion, cost: 30, per: 'day', n: 2, name: '피로 회복제', desc: `고른 멤버 피로 −${FATIGUE.potion}` },
];
// 피로 회복제 그림 (/img/lb/tower/tw_potion.webp) — 아직 없어서 에너지 드링크 그림으로 (그림이 오면 주소만 바꾸기)
export const POTION_ART = '/img/lb/tower/tw_potion.webp';

// ─── 진행 상태 (lb.tower) — 이상한 값은 버린다 ───
export function emptyTower() { return { best: 0, hb: {}, fat: {}, day: -1, used: 0, run: null, wk: null, wkPrev: null, wkPaid: -1e6, stone: 0, hs: {}, buy: {}, picks: { legend: 0, hero: 0 }, miles: [], hall: null, kingUntil: 0 }; }
const wkClean = (x) => (x && Number.isInteger(x.wi) ? { wi: x.wi, f: int(x.f, 0, TOWER.floors), sec: int(x.sec, 0, 1e6), hero: typeof x.hero === 'string' && HEROES[x.hero] ? x.hero : '', at: int(x.at, 0, 9e15) } : null);
export function normTower(raw, out, now = Date.now()) {
  const t = (raw && raw.tower) || {};
  const o = emptyTower();
  o.best = int(t.best, 0, TOWER.floors);
  for (const [h, v] of Object.entries(t.hb || {})) if (HEROES[h]) { const n = int(v, 0, TOWER.floors); if (n) o.hb[h] = n; }
  // 피로: { 멤버: { v 0~100, at 시각 } } — 다 풀린 기록 · 이상한 값은 버린다
  for (const [h, x] of Object.entries(t.fat && typeof t.fat === 'object' ? t.fat : {})) {
    if (!HEROES[h] || !x || typeof x !== 'object') continue;
    const v = int(x.v, 0, FATIGUE.max), at = int(x.at, 0, 9e15);
    if (v > 0 && v - (Math.max(0, now - at) / HOUR) * FATIGUE.perHour > 0) o.fat[h] = { v, at: Math.min(at, now), ...(x.lock ? { lock: 1 } : {}) };
  }
  o.day = Number.isInteger(t.day) ? t.day : -1;
  o.used = int(t.used, 0, 99);
  o.run = t.run && typeof t.run.id === 'string' && t.run.id.length <= 32 ? { id: t.run.id, f: int(t.run.f, 1, TOWER.floors), hero: HEROES[t.run.hero] ? t.run.hero : 'bangjang', at: int(t.run.at, 0, 9e15), fat: int(t.run.fat, 0, FATIGUE.max) } : null;
  if (o.run && Array.isArray(t.run.sq)) { const sq = [...new Set(t.run.sq.filter((h) => typeof h === 'string' && HEROES[h] && h !== o.run.hero))].slice(0, SQUAD.max - 1); if (sq.length) o.run.sq = sq; } // 같이 간 멤버 (리메이크)
  o.wk = wkClean(t.wk); o.wkPrev = wkClean(t.wkPrev);
  o.wkPaid = Number.isInteger(t.wkPaid) ? t.wkPaid : -1e6;
  o.stone = int(t.stone, 0, 1e7);
  for (const id of HELL_IDS) { const it = (t.hs || {})[id]; if (it) o.hs[id] = { lv: int(it.lv, 0, HELL_MAX), on: typeof it.on === 'string' && HEROES[it.on] ? it.on : null }; }
  for (const [k, v] of Object.entries(t.buy || {})) if (TOWER_SHOP.some((s) => s.id === k) && v && typeof v.k === 'string') o.buy[k] = { k: v.k.slice(0, 12), n: int(v.n, 0, 99) };
  o.picks = { legend: int((t.picks || {}).legend, 0, 99), hero: int((t.picks || {}).hero, 0, 99) };
  o.miles = [...new Set((Array.isArray(t.miles) ? t.miles : []).map((x) => int(x, 0, 99)).filter((x) => MILES[x]))];
  o.hall = t.hall && Number.isFinite(t.hall.at) ? { at: int(t.hall.at, 0, 9e15), hero: HEROES[t.hall.hero] ? t.hall.hero : 'bangjang' } : null;
  o.kingUntil = int(t.kingUntil, 0, 9e15);
  // 계정 최고는 멤버 기록보다 낮을 수 없다
  for (const v of Object.values(o.hb)) if (v > o.best) o.best = v;
  out.tower = o;
  // "이번 주 탑의 주인" 칭호: 다음 한 주 동안만
  if (Array.isArray(out.titles) && out.titles.includes('towerking') && !(o.kingUntil > now)) { out.titles = out.titles.filter((x) => x !== 'towerking'); if (out.title === 'towerking') out.title = ''; }
  return out;
}
export const towerOpen = (lb) => !!(lb && (lb.master || (lb.maxStage | 0) >= TOWER.unlock));
export function triesLeft(lb, now = Date.now()) { const t = lb.tower || {}; return Math.max(0, TOWER.tries - (t.day === L.dayIndex(now) ? t.used | 0 : 0)); }
// 지금 도전할 수 있는 층: 1 ~ (최고 + 1)
export const maxFloor = (lb) => Math.min(TOWER.floors, ((lb.tower && lb.tower.best) | 0) + 1);

// 탑 시작: 도전 1번을 먼저 쓴다 (깨면 돌려준다 — 실패만 깎인다)
//  squad: 같이 갈 멤버 (대장 hero 말고 최대 2명 · 리메이크) — 없으면 예전처럼 혼자
export function towerStart(lb, f, hero, runId, now = Date.now(), free = false, squad = []) {
  lb.tower = lb.tower || emptyTower();
  const t = lb.tower;
  f = int(f, 0, 999);
  if (!towerOpen(lb)) return { error: `진상의 탑은 1-${TOWER.unlock}을 깨면 열려요` };
  if (f < 1 || f > TOWER.floors) return { error: '없는 층이에요' };
  if (f > maxFloor(lb) && !free) return { error: '아직 오를 수 없는 층이에요' };
  if (!HEROES[hero] || !L.heroUnlocked(lb, hero)) return { error: '데려갈 수 없는 멤버예요' };
  const sq = [...new Set((Array.isArray(squad) ? squad : []).map(String).filter((h) => h !== hero))].slice(0, SQUAD.max - 1);
  for (const h of sq) if (!HEROES[h] || !L.heroUnlocked(lb, h)) return { error: '데려갈 수 없는 멤버예요' };
  const day = L.dayIndex(now);
  if (t.day !== day) { t.day = day; t.used = 0; }
  if (!free && t.used >= TOWER.tries) return { error: `오늘 탑 도전은 다 했어요 (하루 ${TOWER.tries}번 · 깬 층은 안 깎여요 · 자정에 초기화)` };
  const fat = free ? 0 : fatigueOf(lb, hero, now);
  if (!free) for (const h of [hero, ...sq]) if (fatigueLocked(lb, h, now)) return { error: `${HEROES[h].name}: 지쳐서 쉬어야 해요 · ${hoursText(fatigueOkMs(lb, h, now))} 뒤 회복` };
  if (!free) t.used++;
  t.run = { id: String(runId).slice(0, 32), f, hero, at: now, fat };
  const fats = { [hero]: fat };
  if (sq.length) { t.run.sq = sq; for (const h of sq) fats[h] = free ? 0 : fatigueOf(lb, h, now); }
  return { runId: t.run.id, f, hero, squad: [hero, ...sq], fat, fats, left: triesLeft(lb, now) };
}
// 탑 끝: 서버가 판 번호 · 시간을 확인하고 보상 (처음 깬 층만)
export function towerFinish(lb, body, uid, now = Date.now(), free = false) {
  lb.tower = lb.tower || emptyTower();
  const t = lb.tower, run = t.run;
  if (!run || run.id !== String(body.runId || '')) return { error: '탑 도전을 다시 시작해 주세요' };
  const def = floorDef(run.f);
  const dur = int(body.durationSec, 0, 1e6), kills = int(body.kills, 0, 1e6);
  const clear = body.clear === true;
  t.run = null;
  if (clear) {
    const minSec = def.waves.length * TOWER.minSec;
    if (dur < minSec || dur > (now - run.at) / 1000 * 1.15 + 20) return { error: '기록을 확인할 수 없어요' };
    let cap = 0; for (const w of def.waves) for (const x of w.g) cap += x[1] * (ENEMIES[x[0]] && ENEMIES[x[0]].pack ? ENEMIES[x[0]].pack.max : 1) * 2.4; cap += 80 * def.waves.length;
    if (kills > cap) return { error: '기록을 확인할 수 없어요' };
  }
  const team = [run.hero, ...(run.sq || [])];
  const out = { clear, f: run.f, hero: run.hero, squad: team, first: false, reward: null, miles: [], awake: null, weekBest: false, hall: false, left: 0, fat: 0, fatAdd: 0, fats: {} };
  // 피로: 깨면 +25 (31층부터 +40) · 이미 깬 층을 다시 깨도 +25 · 실패 +15 (무료 모드는 안 쌓인다) · 여럿이 가면 한 명당 덜 (SQUAD.fat)
  if (!free) { out.fatAdd = squadFat(team.length, fatigueGain(run.f, clear, run.f <= t.best)); for (const h of team) out.fats[h] = fatigueAdd(lb, h, out.fatAdd, now); out.fat = out.fats[run.hero]; }
  L.trackRun(lb, { mode: 'tower', kills: Math.min(kills, 2000), bosses: clear && isBossFloor(run.f) ? 1 : 0, skills: L.skillCap(body.skills, dur) }, uid, now); // 미션 진행 (처치 · 보스 · 스킬)
  if (clear) {
    const day = L.dayIndex(now);
    if (t.day === day && !free) t.used = Math.max(0, t.used - 1); // 깬 판은 도전 횟수를 돌려준다
    if (run.f === t.best + 1) {
      out.first = true;
      t.best = run.f;
      const rw = floorReward(run.f);
      const got = L.grant(lb, { coins: rw.coins, stones: rw.stones, tickets: rw.tickets }, uid, now);
      t.stone += rw.hell; got.hell = rw.hell;
      out.reward = got;
      const m = MILES[run.f];
      if (m && !t.miles.includes(run.f)) {
        t.miles.push(run.f);
        const g2 = L.grant(lb, { title: m.title, frame: m.frame }, uid, now);
        if (m.legendPick) { t.picks.legend += m.legendPick; g2.legendPick = m.legendPick; }
        if (m.heroPick) { t.picks.hero += m.heroPick; g2.heroPick = m.heroPick; }
        out.miles.push({ f: run.f, label: m.label, got: g2 });
      }
      if (run.f === TOWER.hall && !t.hall) { t.hall = { at: now, hero: run.hero }; out.hall = true; }
    }
    for (const h of team) { // 같이 오른 멤버 모두 기록 (각성)
      const before = awakeLv(lb, h);
      t.hb[h] = Math.max(t.hb[h] | 0, run.f);
      const after = awakeLv(lb, h);
      if (after > before && !out.awake) out.awake = { hero: h, from: before, to: after };
    }
    // 주간 탑 랭킹: 이번 주에 깬 가장 높은 층 (같으면 더 빨리 깬 기록)
    const wi = L.weekIndex(now);
    if (!t.wk || t.wk.wi !== wi) { if (t.wk && t.wk.wi === wi - 1) t.wkPrev = t.wk; t.wk = { wi, f: 0, sec: 0, hero: '', at: 0 }; }
    if (run.f > t.wk.f || (run.f === t.wk.f && dur < t.wk.sec)) { t.wk = { wi, f: run.f, sec: dur, hero: run.hero, at: now }; out.weekBest = true; }
  }
  out.left = triesLeft(lb, now);
  out.best = t.best;
  return out;
}
// 이번 주 / 지난주 기록
export function weekEntry(lb, wi) { const t = lb.tower || {}; return t.wk && t.wk.wi === wi ? t.wk : t.wkPrev && t.wkPrev.wi === wi ? t.wkPrev : null; }
// 랭킹 점수 (층이 높을수록 · 같은 층이면 빠를수록) — 정렬 · DB 에서 같은 식
export const weekScore = (e) => (e && e.f ? e.f * 1e6 - Math.min(999999, e.sec | 0) : 0);
// 지난주 순위 보상: 1위 "이번 주 탑의 주인" (한 주 동안) · TOP 10 작은 보상
export function weekReward(rank) {
  if (!rank) return null;
  if (rank === 1) return { coins: 5000, tickets: 3, hell: 40, title: 'towerking', label: '주간 탑 1위 — 이번 주 탑의 주인' };
  if (rank <= 3) return { coins: 3000, tickets: 2, hell: 25, label: `주간 탑 ${rank}위` };
  if (rank <= 10) return { coins: 1500, tickets: 1, hell: 15, label: `주간 탑 ${rank}위 (TOP 10)` };
  return { coins: 500, hell: 5, label: `주간 탑 ${rank}위 (참가)` };
}
export function weekClaim(lb, rank, uid, now = Date.now()) {
  lb.tower = lb.tower || emptyTower();
  const t = lb.tower, prev = L.weekIndex(now) - 1;
  const e = weekEntry(lb, prev);
  if (!e || !e.f) return { error: '지난주 탑 기록이 없어요' };
  if (t.wkPaid === prev) return { error: '이미 받았어요' };
  const rw = weekReward(rank);
  if (!rw) return { error: '순위를 확인할 수 없어요' };
  t.wkPaid = prev;
  const got = L.grant(lb, { coins: rw.coins, tickets: rw.tickets, title: rw.title }, uid, now);
  if (rw.hell) { t.stone += rw.hell; got.hell = rw.hell; }
  if (rw.title === 'towerking') t.kingUntil = L.weekStartMs(prev + 2); // 이번 주 끝까지
  return { got, rank, label: rw.label };
}

// ─── 염화석 상점 · 지옥 세트 ───
const buyKey = (s, now) => (s.per === 'week' ? 'w' + L.weekIndex(now) : 'd' + L.dayIndex(now));
export function shopLeft(lb, id, now = Date.now()) {
  const s = TOWER_SHOP.find((x) => x.id === id); if (!s) return 0;
  const b = ((lb.tower || {}).buy || {})[id];
  return Math.max(0, s.n - (b && b.k === buyKey(s, now) ? b.n | 0 : 0));
}
export function shopBuy(lb, id, now = Date.now(), hero = null) {
  lb.tower = lb.tower || emptyTower();
  const t = lb.tower;
  if (HELL_SET[id]) {
    const p = HELL_SET[id];
    if (t.hs[id]) return { error: '이미 가진 장비예요 (강화는 장비에서)' };
    if (t.stone < p.cost) return { error: `염화석이 부족해요 (${p.cost} 필요)` };
    t.stone -= p.cost; t.hs[id] = { lv: 0, on: null };
    return { got: { hellGear: id } };
  }
  const s = TOWER_SHOP.find((x) => x.id === id);
  if (!s) return { error: '살 수 없는 물건이에요' };
  if (shopLeft(lb, id, now) <= 0) return { error: s.per === 'week' ? '이번 주에 다 샀어요' : '오늘은 다 샀어요' };
  if (t.stone < s.cost) return { error: `염화석이 부족해요 (${s.cost} 필요)` };
  if (s.kind === 'fat') { // 피로 회복제: 산 자리에서 고른 멤버에게 바로
    if (!hero || !HEROES[hero] || !L.heroUnlocked(lb, hero)) return { error: '피로를 풀 멤버를 골라 주세요' };
    if (fatigueOf(lb, hero, now) <= 0) return { error: '피로하지 않은 멤버예요' };
  }
  if (s.kind === 'cons' && ((lb.cons || {})[s.id] | 0) >= L.CONS_CAP) return { error: '더 가질 수 없어요 (99개)' };
  t.stone -= s.cost;
  const key = buyKey(s, now), b = t.buy[id] && t.buy[id].k === key ? t.buy[id] : { k: key, n: 0 };
  b.n++; t.buy[id] = b;
  if (s.kind === 'cons') { L.consAdd(lb, { [s.id]: 1 }); return { got: { cons: { [s.id]: 1 } } }; }
  if (s.kind === 'tickets') { lb.tickets = (lb.tickets | 0) + s.amount; return { got: { tickets: s.amount } }; }
  if (s.kind === 'stones') { lb.stones = (lb.stones | 0) + s.amount; return { got: { stones: s.amount } }; }
  if (s.kind === 'fat') { const v = fatigueAdd(lb, hero, -s.amount, now); return { got: { fat: { hero, v, cut: s.amount } } }; }
  return { error: '살 수 없는 물건이에요' };
}
export function hellUp(lb, id) {
  const t = lb.tower || {}, it = (t.hs || {})[id];
  if (!HELL_SET[id] || !it) return { error: '먼저 상점에서 사 주세요' };
  if (it.lv >= HELL_MAX) return { error: '이미 최대 강화예요' };
  const c = hellUpCost(it.lv);
  if (t.stone < c) return { error: `염화석이 부족해요 (${c} 필요)` };
  t.stone -= c; it.lv++;
  return { lv: it.lv, cost: c };
}
// 끼우기 (hero = null 이면 빼기) · 장비 하나는 한 멤버에게만
export function hellEquip(lb, id, hero) {
  const t = lb.tower || {}, it = (t.hs || {})[id];
  if (!HELL_SET[id] || !it) return { error: '가진 장비가 아니에요' };
  if (hero && (!HEROES[hero] || !L.heroUnlocked(lb, hero))) return { error: '합류한 멤버만 낄 수 있어요' };
  it.on = hero || null;
  return { on: it.on };
}
// 45층 전설 장비 선택권: 원하는 장비 종류 (전설 등급)
export function pickLegendGear(lb, type) {
  const t = lb.tower || {};
  if (!((t.picks || {}).legend > 0)) return { error: '전설 장비 선택권이 없어요' };
  if (!GEAR_IDS.includes(type)) return { error: '고를 수 없는 장비예요' };
  t.picks.legend--;
  const it = L.addGear(lb, type, 'legend');
  return { got: { gear: it } };
}
// 60층 LEGEND 멤버 카드 묶음: 고른 LEGEND 멤버 합류 (이미 있으면 조각)
export function pickLegendHero(lb, hero) {
  const t = lb.tower || {};
  if (!((t.picks || {}).hero > 0)) return { error: 'LEGEND 카드 묶음이 없어요' };
  if (!LEGEND_HEROES.includes(hero)) return { error: 'LEGEND 멤버만 고를 수 있어요' };
  t.picks.hero--;
  lb.shards = lb.shards || {}; lb.owned = lb.owned || {};
  if (lb.owned[hero]) { lb.shards[hero] = (lb.shards[hero] | 0) + L.DUP_SHARDS.legendHero; return { got: { hero, shards: L.DUP_SHARDS.legendHero, dup: true } }; }
  lb.owned[hero] = true;
  return { got: { hero, new: true } };
}
