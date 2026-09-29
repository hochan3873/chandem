// 랑방 대전 — 밸런스 데이터 모음
// 숫자만 바꿔도 게임 전체 밸런스가 바뀌도록 모든 수치를 여기에 모아 둔다.
// (DOM 없이 Node 에서도 import 되는 순수 데이터 모듈)

// ─── 필드 ───────────────────────────────────────────────
// 논리 좌표계: 가로 360 고정, 세로는 화면 비율에 따라 600~800
export const FIELD = {
  W: 360,
  minH: 600,
  maxH: 800,
  rowFrac: 0.715, // 영웅 줄 위치 (화면 높이 대비) — 배경의 랑방 건물 바로 앞
  ropeGap: 44, // 영웅 줄 바로 위의 벨벳 로프(입구 줄) — 적은 여기서 멈춰 문을 두드린다
  spawnY: -34,
};
export const HERO_SLOTS = 6;
// 슬롯 x 좌표 (가로 360 기준) 와 채우는 순서(가운데부터)
export const SLOT_X = [34, 92, 150, 210, 268, 326];
export const SLOT_ORDER = [2, 3, 1, 4, 0, 5];

// ─── 기본 규칙 ─────────────────────────────────────────
export const RULES = {
  baseHp: 300, // 랑방 입구 내구도
  waves: 20, // 20 웨이브 클리어 = 승리
  bossWaves: [5, 10, 15, 20],
  breakSec: 4, // 웨이브 사이 쉬는 시간 (무한 도전)
  stageBreakSec: 2.5, // 스테이지 웨이브 사이 (짧고 빠르게)
  firstBreakSec: 2.5,
  bossIntroSec: 2.6,
  crit: 0.05, // 기본 치명타 확률
  critMul: 2.0,
  gemDelay: 0.32, // 보석이 떨어진 뒤 이만큼 통통 튀다가 경험치 바로 날아간다 (자동 수집)
  comboWindow: 1.6, // 이 시간 안에 계속 잡으면 콤보 유지
  ultMax: 100, // 궁극기 '총공지' 게이지
  ultPerKill: 1.4,
  ultPerBoss: 25,
  ultDamage: 90, // × (1 + 0.22 × 웨이브)
  metaDmgPerLevel: 0.08, // 영구 강화 1레벨당 공격력 +8%
  hiddenChance: 0.07, // 카드 한 칸당 히든 영웅 등장 확률 (해금한 히든만)
  hiddenFromWave: 4, // 무한 도전: 웨이브 4부터 (= 웨이브 3 이후)
  hiddenFromStageWave: 2, // 스테이지: 웨이브 2부터
  kbMaxReach: 330, // 넉백으로 밀려도 영웅 줄에서 이 거리 위로는 안 올라간다 (모두의 사거리 안)
  kbRepeatSec: 2, // 이 시간 안에 또 밀리면 절반만 밀린다
  charmRange: 130, // 꼬충이 로프에서 이만큼 가까워지면 홀림 시전
  charmSec: 2.0,
  charmCooldown: 7,
};

// 영웅 레벨(1~5) 배율
export const LEVEL_DMG = [1, 1.3, 1.62, 2.0, 2.5];
export const LEVEL_INTERVAL = [1, 0.95, 0.9, 0.85, 0.78];

// 레벨업에 필요한 경험치 (lv → lv+1)
export function expNeed(lv) {
  return Math.round(4 + lv * 3 + lv * lv * 0.32);
}

// 웨이브별 적 체력 배율
export function hpMul(wave) {
  const w = wave - 1;
  let m = 1 + 0.2 * w + 0.03 * w * w;
  if (wave > 20) m *= Math.pow(1.09, wave - 20); // 무한 모드
  return m;
}
// 웨이브별 적 공격력 배율
export function atkMul(wave) {
  return 1 + 0.05 * (wave - 1) + (wave > 20 ? 0.08 * (wave - 20) : 0);
}

// ─── 점수 공식 ─────────────────────────────────────────
// 처치 1마리      : 10점 + 현재 콤보(최대 50) 만큼 보너스
// 웨이브 클리어   : 웨이브 번호 × 300점
// 보스 처치       : 2000점
// 승리(20웨이브)  : 10000점 + 남은 입구 내구도 % × 50점
export const SCORE = {
  kill: 10,
  comboCap: 50,
  wavePer: 300,
  boss: 2000,
  victory: 10000,
  stageClear: 3000, // 스테이지 클리어 (+ 남은 입구 내구도 % × hpPct)
  hpPct: 50,
};

// ─── 경제 (서버 server/langbang-rules.js 와 숫자가 같아야 한다 — 테스트가 검사) ───
// 영구 강화 비용: 서버가 최종 결정. 손님은 이 값으로 기기 안에서 강화
export const META_MAX = 20;
export function metaCost(lv) {
  return Math.round((40 * Math.pow(lv + 1, 1.7)) / 10) * 10;
}
// 아이템: 코인으로 사는 영구 강화 (레벨제)
export const ITEMS = {
  door: { id: 'door', icon: '🚪', name: '튼튼한 문', max: 10, per: 0.1, base: 50, desc: (v) => `입구 내구도 +${pct(v)}` },
  coupon: { id: 'coupon', icon: '🎟️', name: '단골 쿠폰', max: 10, per: 0.06, base: 60, desc: (v) => `스테이지 코인 보상 +${pct(v)}` },
  battery: { id: 'battery', icon: '🔋', name: '확성기 배터리', max: 10, per: 0.08, base: 40, desc: (v) => `총공지 충전 +${pct(v)}` },
  charm: { id: 'charm', icon: '🍀', name: '행운 부적', max: 10, per: 0.015, base: 55, desc: (v) => `치명타 확률 +${pct(v, 1)}` },
  drink: { id: 'drink', icon: '🍹', name: '웰컴 드링크', max: 3, per: 1, costs: [600, 2400, 6000], desc: (v) => (v ? `시작 전 카드 ${v}장 고르기` : '아직 없음') },
};
export const ITEM_IDS = Object.keys(ITEMS);
function pct(v, d = 0) { return `${(v * 100).toFixed(d)}%`; }
export function itemCost(id, lv) {
  const it = ITEMS[id];
  if (!it || lv >= it.max) return null;
  if (it.costs) return it.costs[lv];
  return Math.round((it.base * Math.pow(lv + 1, 1.6)) / 10) * 10;
}
export function itemValue(id, lv) { return (ITEMS[id] ? ITEMS[id].per : 0) * (lv || 0); }

// ─── 스테이지 ─────────────────────────────────────────
// 3챕터 × 10스테이지. 스테이지 번호 s = 1..30 ('1-1' … '3-10')
export const STAGE_WAVES = 5;
export const STAGES_PER_CHAPTER = 10;
export const STAGE_COUNT = 30;
export const CHAPTERS = [
  {
    id: 1, name: '랑방 골목', desc: '꼬충들이 기웃거리는 우리 동네 골목', color: '#ffd23f',
    names: ['골목 입구', '편의점 앞', '먹튀 출몰', '비틀비틀 술진상', '두목의 등장', '꼬충 러시', '골목 포장마차', '막차 시간', '새벽 두 시', '여왕벌 강림'],
  },
  {
    id: 2, name: '불금 번화가', desc: '사기꾼과 라이벌 모임 "인피"가 나타난 금요일 밤', color: '#ff6fd8',
    names: ['불금 시작', '가입인사 사기꾼', '뒷담화 골목', '인피 패거리', '인피 행동대장', '만취 대행진', '독재자 등장', '택시 대란', '첫차 전쟁', '여왕벌의 귀환'],
  },
  {
    id: 3, name: '인피 아지트', desc: '라이벌 모임 인피의 본거지로 쳐들어간다', color: '#57d68d',
    names: ['아지트 입구', '뒷담화 복도', '끼리끼리 방', '사기꾼 소굴', '행동대장의 방', '독재자의 연설', '인피 총동원', '오리고기 냄새', '최후의 방어선', '인피 대장'],
  },
];
// 이 스테이지를 처음 깨면 히든 영웅이 영구 합류 (출전 동료로 고를 수 있고, 카드로도 나온다)
export const HERO_UNLOCK = { eunok: 10, myunghoon: 13, hanna: 15, sunggu: 20 }; // 1-10 · 2-3 · 2-5 · 2-10
export const HIDDEN_UNLOCK = HERO_UNLOCK; // (옛 이름)
export const ENDLESS_UNLOCK = 10; // 1-10 클리어 → 무한 도전
export const chapterOf = (s) => Math.ceil(s / STAGES_PER_CHAPTER);
export const stageNo = (s) => ((s - 1) % STAGES_PER_CHAPTER) + 1;
export const stageLabel = (s) => `${chapterOf(s)}-${stageNo(s)}`;
export const stageName = (s) => CHAPTERS[chapterOf(s) - 1].names[stageNo(s) - 1];
export function parseStage(v) {
  const m = /^(\d)-(\d{1,2})$/.exec(String(v || '').trim());
  if (!m) return 0;
  const c = +m[1], n = +m[2];
  if (c < 1 || c > CHAPTERS.length || n < 1 || n > STAGES_PER_CHAPTER) return 0;
  return (c - 1) * STAGES_PER_CHAPTER + n;
}
// 별: 클리어 때 입구 내구도 70% 이상 ★★★, 35% 이상 ★★, 그 밖 ★
export function starsFor(hpFrac) { return hpFrac >= 0.7 ? 3 : hpFrac >= 0.35 ? 2 : 1; }

// 난이도 숫자 (밸런스 스크립트 scripts/lb-balance.js 로 맞춘 값)
export const STAGE = {
  levelPerStage: 0.36, levelPow: 1, // 첫 웨이브 난이도(=옛 웨이브 번호) = 1 + 0.36 × (s-1) — 스테이지마다 새로 시작하니 조금씩만
  bossStage: { 1: [0.4, 1.6], 2: [0.6, 1.0], 3: [0.6, 1.0] }, // x-5 · x-10 스테이지는 조금 더 어렵게 (1-10 은 강화가 필요, 2·3챕터 끝은 보스 2명)
  levelPerWave: 1.3, // 스테이지 안에서 웨이브마다 +1.3 (첫 웨이브는 쉽게, 뒤로 갈수록 확)
  baseCount: 12, // 1-1 첫 웨이브 적 수
  countPerStage: 0.02,
  countPerWave: 0.3,
  waveSec: 13, // 적이 나오는 시간(초)
  waveSecPerStage: 0.12,
};
export function stageLevel(s, w) {
  const n = stageNo(s);
  const bs = STAGE.bossStage[chapterOf(s)];
  const boss = n === 10 ? bs[1] : n === 5 ? bs[0] : 0;
  return 1 + STAGE.levelPerStage * Math.pow(s - 1, STAGE.levelPow) + (w - 1) * STAGE.levelPerWave + boss;
}
// 적은 스테이지마다 조금씩 늘어난다:
//  1챕터 꼬충 → 먹튀(1-3) → 술진상(1-4) → 폭력배(1-8)
//  2챕터 사기꾼(2-1) → 뒷담러(2-2) → 패거리(2-4) → 독재자(2-7)  ·  3챕터 인피 아지트: 인피 총출동, 꼬충은 줄어든다
export function stageMix(s) {
  const ch = chapterOf(s);
  const kko = ch === 3 ? 0.45 : 1;
  const mix = [['yeokko', kko], ['namkko', s >= 2 ? kko : 0.5]];
  if (s >= 3) mix.push(['mukti', 0.1 + 0.004 * s]);
  if (s >= 4) mix.push(['drunk', 0.2 + 0.014 * s]);
  if (s >= 8) mix.push(['thug', ch === 1 ? 0.05 : ch === 2 ? 0.08 + 0.004 * (s - 10) : 0.12 + 0.004 * (s - 20)]);
  if (s >= 11) mix.push(['scammer', ch === 2 ? 0.1 + 0.01 * (s - 11) : 0.3]);
  if (s >= 12) mix.push(['inpi_gossip', ch === 2 ? 0.06 + 0.005 * (s - 12) : 0.2]);
  if (s >= 14) mix.push(['inpi_clique', ch === 2 ? 0.2 + 0.02 * (s - 14) : 0.7]); // 3~5명씩 무리로 나온다
  if (s >= 17) mix.push(['inpi_dictator', ch === 2 ? 0.035 : 0.07 + 0.003 * (s - 20)]);
  return mix;
}
// 보스: x-5, x-10 마지막 웨이브
export function stageBosses(s) {
  const n = stageNo(s), ch = chapterOf(s);
  if (n === 5) return ch === 1 ? ['boss_thug'] : ch === 2 ? ['boss_gapjil'] : ['boss_gapjil', 'boss_thug'];
  if (n === 10) return ch === 1 ? ['queen'] : ch === 2 ? ['queen', 'boss_gapjil'] : ['boss_inpi', 'boss_gapjil'];
  return [];
}
export function stageWave(s, w) {
  const bosses = w === STAGE_WAVES ? stageBosses(s) : [];
  let n = STAGE.baseCount * (1 + STAGE.countPerStage * (s - 1)) * (1 + STAGE.countPerWave * (w - 1));
  if (bosses.length) n *= 0.55;
  const dur = STAGE.waveSec + STAGE.waveSecPerStage * (s - 1);
  const mix = stageMix(s);
  const sum = mix.reduce((a, m) => a + m[1], 0);
  const g = [];
  mix.forEach(([type, wt], i) => {
    if (wt <= 0) return;
    const few = type === 'thug' || type === 'mukti' || type === 'inpi_dictator' || type === 'inpi_gossip' || type === 'scammer';
    const pack = ENEMIES[type].pack;
    let c = Math.max(few ? 1 : 2, Math.round((n * wt) / sum));
    if (pack) c = Math.max(1, Math.round(c / ((pack.min + pack.max) / 2)) || 1); // 무리 수
    g.push([type, c, +(dur / c).toFixed(2), +(i * 0.7).toFixed(1)]);
  });
  const def = { g, level: stageLevel(s, w) };
  if (bosses[0]) def.boss = bosses[0];
  if (bosses[1]) def.boss2 = bosses[1];
  return def;
}
export function stageEnemies(s) {
  const set = new Set();
  for (const [t] of stageMix(s)) set.add(t);
  for (const b of stageBosses(s)) set.add(b);
  return [...set];
}

// 보상 코인 (서버가 계산 — 여기는 손님 · 화면 표시용 같은 공식)
export const REWARD = { base: 60, perStage: 18, firstMul: 2, starMul: 0.5 };
export function clearCoins(s) { return REWARD.base + REWARD.perStage * (s - 1); }
// prevStars: 이 스테이지에서 전에 받은 최고 별(0 = 처음), couponLv: 단골 쿠폰 레벨
export function stageReward(s, stars, prevStars = 0, couponLv = 0) {
  const base = clearCoins(s);
  const clear = Math.round(base * (0.7 + 0.1 * stars));
  const first = prevStars ? 0 : base * REWARD.firstMul;
  const newStars = Math.max(0, stars - prevStars);
  const star = Math.round(base * REWARD.starMul) * newStars;
  const mul = 1 + itemValue('coupon', couponLv);
  const total = Math.round((clear + first + star) * mul);
  return { clear, first, star, newStars, bonus: total - clear - first - star, total };
}
export function endlessReward(wave, couponLv = 0) {
  const w = Math.max(0, Math.floor(wave));
  return Math.round((12 * w + w * w) * (1 + itemValue('coupon', couponLv)));
}

// ─── 영웅 ──────────────────────────────────────────────
// dmg: 1발 피해, interval: 공격 간격(초), range: 사거리, proj: 투사체 종류
export const HEROES = {
  bangjang: {
    id: 'bangjang', name: '방장', gender: 'm', emoji: '📢', color: '#f6b73c',
    img: '/img/lb/h_bangjang.webp', role: '리더 · 아군 공속 오라',
    dmg: 22, interval: 0.85, range: 470, proj: 'notice', projSpeed: 520,
    aura: [0.08, 0.1, 0.16, 0.19, 0.26], // 모든 아군 공격 속도 +%
    desc: '확성기 "공지"를 쏜다. 곁에 있는 것만으로 모두의 손이 빨라진다.',
    perks: { 3: '공지가 적 1명을 관통 · 오라 강화', 5: '5발마다 "전체공지" 폭발 (범위 피해)' },
  },
  staff: {
    id: 'staff', name: '운영진', gender: 'f', emoji: '📋', color: '#5ab0ff',
    img: '/img/lb/h_staff.webp', role: '경고장 · 감속/강퇴',
    dmg: 32, interval: 0.7, range: 470, proj: 'warn', projSpeed: 480,
    slow: 0.42, slowSec: 1.6,
    desc: '"경고장"을 날려 적을 느리게 만든다. 규칙 위반자는 강퇴!',
    perks: { 3: '맞은 적 18% 확률로 "강퇴" (1초 기절)', 5: '경고장이 주변에도 퍼지고 강퇴 30%' },
  },
  gunman: {
    id: 'gunman', name: '건전남', gender: 'm', emoji: '🙋‍♂️', color: '#4fd18b',
    img: '/img/lb/h_gunman.webp', role: '단일 딜러 · 연사',
    dmg: 13, interval: 0.37, range: 480, proj: 'bullet', projSpeed: 820,
    desc: '건전하게, 그러나 빠르게. 믿고 쓰는 연사 딜러.',
    perks: { 3: '한 번에 2발 발사', 5: '한 번에 3발 · 치명타 +15%' },
  },
  gunnyeo: {
    id: 'gunnyeo', name: '건전녀', gender: 'f', emoji: '🙋‍♀️', color: '#ff8fc0',
    img: '/img/lb/h_gunnyeo.webp', role: '딜 + 랑방 회복',
    dmg: 31, interval: 0.65, range: 470, proj: 'flower', projSpeed: 520,
    heal: [[6, 0.03], [6, 0.035], [5, 0.04], [5, 0.045], [4, 0.055]], // [주기(초), 최대 내구도 대비 회복량]
    desc: '꽃을 던지며 틈틈이 랑방 입구를 수리한다.',
    perks: { 3: '회복량·주기 강화', 5: '모든 아군 홀림 면역 ("철벽!")' },
  },
  // ── 해금 영웅 (스테이지를 깨면 합류) ──
  myunghoon: {
    id: 'myunghoon', name: '서명훈', gender: 'm', emoji: '🦊', color: '#e8a25a', unlock: true,
    img: '/img/lb/h_myunghoon.webp', role: '욕설 기절 · 약점 공략',
    dmg: 26, interval: 0.72, range: 470, proj: 'swear', projSpeed: 500,
    stun: [[0.35, 0.8], [0.38, 0.9], [0.42, 1.0], [0.46, 1.1], [0.5, 1.3]], // [기절 확률, 기절 시간(초)]
    stunnedBonus: [1.5, 1.5, 1.5, 1.5, 2.0], // 기절한 적에게 피해 배율
    revealBonus: 2.0, // 사기꾼이 '들켰다!' 할 때 피해 배율
    desc: '실눈 뜬 티벳여우. "#@!%" 욕 한 방이면 진상이 얼어붙는다.',
    perks: { 3: '욕이 옆 진상에게 튕겨 한 명 더 기절', 5: '4발마다 "욕 폭탄" 범위 기절 · 기절한 적 피해 2배' },
  },
  // ── HIDDEN ──
  eunok: {
    id: 'eunok', name: '최은옥', gender: 'f', emoji: '🍶', color: '#ff5a4f', hidden: true,
    img: '/img/lb/h_eunok.webp', imgRage: '/img/lb/h_eunok_rage.webp', role: 'HIDDEN · 술 마시면 분노 모드',
    dmg: 21, interval: 0.7, range: 470, proj: 'bottle', projSpeed: 540,
    soberSec: [20, 20, 18, 18, 15], rageSec: [9, 10, 11, 12, 13],
    rageDmg: 1.65, rageInterval: 0.4,
    desc: '홀짝홀짝… 20초가 지나면 취해서 "분노 모드"가 된다.',
    perks: { 3: '분노 중 병이 터져 범위 피해', 5: '더 빨리 취하고 더 오래 분노' },
  },
  hanna: {
    id: 'hanna', name: '이한나', gender: 'f', emoji: '😉', color: '#ff6fd8', hidden: true,
    img: '/img/lb/h_hanna.webp', role: 'HIDDEN · 윙크 넉백 (남자만)',
    dmg: 26, interval: 0.68, range: 470, proj: 'wink', projSpeed: 460,
    knockback: [70, 85, 100, 115, 135],
    desc: '"윙크 ♥"에 맞은 남자는 정신 못 차리고 뒤로 날아간다. 여자는 그냥 아프다.',
    perks: { 3: '윙크 2개 동시 발사', 5: '윙크 3개 · 남자는 잠깐 기절' },
  },
  sunggu: {
    id: 'sunggu', name: '강성구', gender: 'm', emoji: '🦯', color: '#c9a36b', hidden: true,
    img: '/img/lb/h_sunggu.webp', role: 'HIDDEN · 지팡이 무한 관통',
    dmg: 40, interval: 2.1, range: 560, proj: 'cane', projSpeed: 430, lv5Interval: 0.85,
    desc: '"요즘 것들은…" 지팡이를 던지면 한 줄에 있는 놈들이 전부 맞는다.',
    perks: { 3: '지팡이가 부메랑처럼 돌아온다', 5: '지팡이 2개 · 공격 속도 +15%' },
  },
};
export const BASE_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
export const UNLOCK_HEROES = ['myunghoon']; // 스테이지를 깨면 합류하는 일반 영웅
export const HIDDEN_HEROES = ['eunok', 'hanna', 'sunggu'];
export const LOCKED_HEROES = [...UNLOCK_HEROES, ...HIDDEN_HEROES]; // 해금이 필요한 영웅 전부
export const STARTER_PARTNERS = ['gunman', 'staff', 'gunnyeo']; // 방장 + 이 중 1명으로 시작

// ─── 적 ───────────────────────────────────────────────
// gender 는 이한나 윙크 판정용, charm 은 홀리는 영웅 성별
export const ENEMIES = {
  yeokko: {
    id: 'yeokko', name: '여꼬충', gender: 'm', emoji: '😏', color: '#7d8cff',
    img: '/img/lb/e_yeokko.webp', hp: 22, speed: 52, atk: 3, atkInterval: 1.2,
    exp: 2, coin: 1, r: 16, size: 68, charm: 'f',
    shouts: ['번호 좀…', 'MBTI 뭐예요?', '오빠 차 있어~', '혹시 혼자 왔어요?'],
  },
  namkko: {
    id: 'namkko', name: '남꼬충', gender: 'f', emoji: '💅', color: '#ff7eb6',
    img: '/img/lb/e_namkko.webp', hp: 22, speed: 52, atk: 3, atkInterval: 1.2,
    exp: 2, coin: 1, r: 16, size: 68, charm: 'm',
    shouts: ['오빠~ 한 잔 사줘', '나 원래 이런 애 아닌데', '인스타 뭐야?', '어머 키 몇이에요?'],
  },
  drunk: {
    id: 'drunk', name: '술진상', gender: 'm', emoji: '🥴', color: '#e0a340',
    img: '/img/lb/e_drunk.webp', hp: 52, speed: 34, atk: 7, atkInterval: 1.1,
    exp: 3, coin: 2, r: 18, size: 72, zigzag: 38,
    explode: { r: 62, dmg: 26 }, // 죽으면 술병이 깨지며 주변 적에게 피해 (웨이브마다 +8%)
    shouts: ['한 잔만 더~', '내가 누군지 알아?!', '딸꾹!', '이 집 사장 나와!'],
  },
  thug: {
    id: 'thug', name: '폭력배', gender: 'm', emoji: '😠', color: '#9a6c5a',
    img: '/img/lb/e_thug.webp', hp: 150, speed: 23, atk: 16, atkInterval: 1.4,
    armor: 6, exp: 6, coin: 4, r: 21, size: 82,
    shouts: ['뭘 봐?', '너 몇 살이야', '밖으로 나와', '형님 오신다'],
  },
  mukti: {
    id: 'mukti', name: '먹튀인간', gender: 'm', emoji: '🏃', color: '#8fe3ff',
    img: '/img/lb/e_mukti.webp', hp: 13, speed: 120, atk: 1, atkInterval: 1,
    exp: 2, coin: 3, r: 14, size: 64, steal: { base: 3, perLevel: 0.45 }, // 로프에 닿으면 경험치를 훔쳐 도망 (잡으면 되찾는다)
    shouts: ['튀어!', '계산은 다음에~', '카드 한도 초과ㅋ', '화장실 좀…'],
  },
  queen: {
    id: 'queen', name: '여왕벌', gender: 'f', emoji: '👑', color: '#ffcc33', boss: true,
    img: '/img/lb/e_queen.webp', hp: 1250, speed: 12, atk: 26, atkInterval: 1.5,
    exp: 40, coin: 60, r: 40, size: 138,
    summon: { every: 7, count: 3, types: ['yeokko', 'namkko'] },
    shieldAura: { every: 9, r: 160, frac: 0.35 }, // 주변 졸개에게 최대 체력 35% 보호막
    title: '여왕벌 등장!', subtitle: '"내 애들 건드리면 가만 안 둬~"',
    shouts: ['내 애들아, 가!', '여기 물 흐리네~', '다들 내 편이지?'],
  },
  boss_thug: {
    id: 'boss_thug', name: '폭력배 두목', gender: 'm', emoji: '👊', color: '#b0413e', boss: true,
    img: '/img/lb/e_boss_thug.webp', hp: 1300, speed: 16, atk: 30, atkInterval: 2.0,
    armor: 5, exp: 40, coin: 60, r: 42, size: 142,
    slam: { every: 7, windup: 0.8, stun: 1.2 }, // 땅 내려치기: 영웅 전원 기절
    title: '폭력배 두목 등장!', subtitle: '"여기 사장 누구야?!"',
    shouts: ['다 나와!', '여기 사장 누구야?!', '형님 화났다'],
  },
  // ── 인피: 라이벌 모임 멤버들 (2챕터부터) ──
  inpi_gossip: {
    id: 'inpi_gossip', name: '인피 뒷담러', gender: 'f', emoji: '🗣️', color: '#a58bff', inpi: true,
    img: '/img/lb/e_inpi_gossip.webp', hp: 38, speed: 40, atk: 4, atkInterval: 1.3,
    exp: 4, r: 16, size: 70, standoff: 165, // 로프에서 이만큼 떨어져 멈추고 뒷담화를 던진다
    rumor: { every: 4.2, sec: 3, cut: 0.3, fly: 0.7 }, // 맞은 영웅 3초 동안 공격 속도 -30%
    shouts: ['수군수군…', '걔 그렇대~', '너만 알고 있어', '단톡방 캡처 떴어'],
  },
  inpi_dictator: {
    id: 'inpi_dictator', name: '인피 독재자', gender: 'm', emoji: '🫡', color: '#d0453a', inpi: true,
    img: '/img/lb/e_inpi_dictator.webp', hp: 120, speed: 22, atk: 10, atkInterval: 1.5,
    armor: 3, exp: 7, r: 20, size: 80,
    aura: { r: 130, cut: 0.3, kb: 0.3, speed: 1.3 }, // 주변 진상: 받는 피해 -30%, 넉백 30%만, 이동 속도 +30%
    shouts: ['앞으로 가!', '내 말이 곧 법이다', '반대하면 강퇴', '모임장은 나야!'],
  },
  inpi_clique: {
    id: 'inpi_clique', name: '인피 패거리', gender: 'm', emoji: '👥', color: '#6fbf73', inpi: true,
    img: '/img/lb/e_inpi_clique.webp', hp: 30, speed: 44, atk: 4, atkInterval: 1.2,
    exp: 2, r: 15, size: 64,
    pack: { min: 3, max: 5, r: 54, cut: 0.12, maxCut: 0.48 }, // 3~5명씩. 붙어 있는 동료 1명마다 받는 피해 -12% (범위·관통 공격은 무시)
    shouts: ['우리끼리 가자', '끼리끼리~', '쟤 뭐야?', '우린 한 팀이야'],
  },
  scammer: {
    id: 'scammer', name: '가입인사 사기꾼', gender: 'f', emoji: '💋', color: '#ff9ecb',
    img: '/img/lb/e_scammer.webp', hp: 44, speed: 62, atk: 5, atkInterval: 1.2,
    exp: 5, r: 16, size: 70,
    // 예쁜 프사(빠름·회피·남자 멤버 공격력↓) → 들켰다!(멈춤·약점) → 실물(못생김: 공포로 공속↓ / 뚱뚱: 느리지만 단단·아픔) → 들켰다! → …
    forms: {
      ugly: { img: '/img/lb/e_scammer_ugly.webp', emoji: '👹', name: '사기꾼 (실물)' },
      fat: { img: '/img/lb/e_scammer_fat.webp', emoji: '🐷', name: '사기꾼 (실물)', size: 88 },
    },
    scam: {
      prettySec: 3.5, revealSec: 1.5, realSec: 6,
      evade: 0.35, flirt: 0.2, flirtRange: 280, // 프사 모드: 35% 회피, 남자 멤버 공격력 -20%
      fear: 0.25, fearR: 200, // 못생김: 주변 멤버 공격 속도 -25%
      fatHp: 2.5, fatArmor: 6, fatSpeed: 0.35, fatAtk: 3, // 뚱뚱: 체력 2.5배, 방어, 느림, 입구 피해 3배
      revealDmg: 1.5, revealStun: 2, // 들켰다!: 받는 피해 1.5배, 기절 2배 오래
    },
    shouts: ['프사랑 똑같아요~', '가입인사 드려요♡', '사진은 3년 전…', '필터 안 썼어요'],
  },
  boss_gapjil: {
    id: 'boss_gapjil', name: '인피 행동대장', gender: 'm', emoji: '😤', color: '#7a3cff', boss: true, inpi: true,
    img: '/img/lb/e_boss_gapjil.webp', hp: 1350, speed: 14, atk: 28, atkInterval: 1.8,
    armor: 4, exp: 40, r: 42, size: 140,
    kneel: { every: 6.5, stun: 2 }, // "무릎 꿇어!" 멤버 1명 2초 기절
    summon: { every: 9, count: 4, types: ['inpi_clique'] },
    title: '인피 행동대장 등장!', subtitle: '"다들 무릎 꿇어!"',
    shouts: ['무릎 꿇어!', '여기 서열 정리한다', '인피 무시하냐?'],
  },
  boss_inpi: {
    id: 'boss_inpi', name: '인피 대장', gender: 'm', emoji: '🦆', color: '#2f9e6a', boss: true, inpi: true,
    img: '/img/lb/e_boss_inpi.webp', hp: 1650, speed: 11, atk: 32, atkInterval: 1.8,
    armor: 4, exp: 50, r: 44, size: 146,
    duck: { every: 3.4, stun: 1.1, fly: 0.8 }, // 오리고기 투척: 맞은 멤버 기절
    feast: { every: 10, r: 190, heal: 0.25 }, // "오리고기 회식!" 주변 진상 체력 25% 회복
    title: '인피 대장 등장!', subtitle: '"오리고기 먹고 가~"',
    shouts: ['오리고기 회식이다!', '우리 모임이 최고지', '랑방? 그게 뭔데'],
  },
};

// ─── 웨이브 ───────────────────────────────────────────
// g: [적 종류, 마리 수, 간격(초), 시작 지연(초)]
export const WAVES = [
  /* 1 */ { g: [['yeokko', 8, 1.3, 0], ['namkko', 6, 1.5, 3]] },
  /* 2 */ { g: [['yeokko', 9, 1.2, 0], ['namkko', 8, 1.3, 1], ['mukti', 2, 3, 8]] },
  /* 3 */ { g: [['drunk', 6, 2.0, 0], ['yeokko', 12, 0.9, 2], ['namkko', 10, 1.0, 3]] },
  /* 4 */ { g: [['yeokko', 14, 0.8, 0], ['namkko', 14, 0.8, 0.4], ['drunk', 6, 1.8, 4], ['mukti', 4, 2.5, 6]] },
  /* 5 */ { boss: 'boss_thug', g: [['thug', 3, 4, 2], ['yeokko', 12, 1.2, 1], ['namkko', 10, 1.4, 2]] },
  /* 6 */ { g: [['thug', 4, 3, 0], ['drunk', 10, 1.2, 1], ['yeokko', 16, 0.7, 2], ['mukti', 4, 2, 8]] },
  /* 7 */ { g: [['namkko', 22, 0.5, 0], ['yeokko', 22, 0.5, 0.25], ['thug', 3, 4, 5]] },
  /* 8 */ { g: [['drunk', 16, 0.8, 0], ['thug', 6, 2.5, 2], ['mukti', 6, 1.6, 6]] },
  /* 9 */ { g: [['yeokko', 24, 0.5, 0], ['namkko', 24, 0.5, 0.2], ['drunk', 10, 1.0, 3], ['thug', 5, 2.4, 5], ['mukti', 5, 2, 9]] },
  /* 10 */ { boss: 'queen', g: [['thug', 4, 3.5, 3], ['drunk', 10, 1.4, 1], ['mukti', 4, 3, 6]] },
  /* 11 */ { g: [['thug', 10, 1.6, 0], ['yeokko', 26, 0.45, 1], ['namkko', 20, 0.55, 2]] },
  /* 12 */ { g: [['drunk', 26, 0.5, 0], ['mukti', 10, 1.2, 3], ['thug', 6, 2, 4]] },
  /* 13 */ { g: [['yeokko', 34, 0.35, 0], ['namkko', 34, 0.35, 0.15], ['thug', 8, 1.8, 3], ['mukti', 6, 1.5, 6]] },
  /* 14 */ { g: [['thug', 16, 1.0, 0], ['drunk', 20, 0.6, 2], ['yeokko', 16, 0.6, 4], ['mukti', 6, 1.4, 8]] },
  /* 15 */ { boss: 'boss_thug', g: [['thug', 12, 1.6, 2], ['drunk', 16, 0.8, 1], ['namkko', 16, 0.8, 3], ['mukti', 6, 2, 6]] },
  /* 16 */ { g: [['yeokko', 40, 0.3, 0], ['namkko', 40, 0.3, 0.1], ['drunk', 16, 0.7, 2], ['thug', 10, 1.4, 4]] },
  /* 17 */ { g: [['thug', 22, 0.8, 0], ['mukti', 14, 0.9, 2], ['drunk', 20, 0.6, 3]] },
  /* 18 */ { g: [['yeokko', 44, 0.28, 0], ['namkko', 44, 0.28, 0.1], ['thug', 14, 1.0, 2], ['drunk', 20, 0.6, 4], ['mukti', 8, 1.2, 6]] },
  /* 19 */ { g: [['thug', 26, 0.7, 0], ['drunk', 30, 0.45, 1], ['yeokko', 30, 0.4, 3], ['namkko', 30, 0.4, 3.2], ['mukti', 10, 1, 5]] },
  /* 20 */ { boss: 'queen', boss2: 'boss_thug', g: [['thug', 16, 1.2, 3], ['drunk', 20, 0.8, 2], ['mukti', 8, 1.5, 6]] },
];

// 무한 모드(21웨이브~) 구성 자동 생성
export function endlessWave(wave) {
  const k = wave - 20;
  const n = (base) => Math.round(base * (1 + 0.12 * k));
  const w = {
    g: [
      ['yeokko', n(40), 0.28, 0], ['namkko', n(40), 0.28, 0.1], ['drunk', n(24), 0.5, 1],
      ['thug', n(20), 0.8, 2], ['mukti', n(10), 1.0, 4],
    ],
  };
  if (k % 5 === 0) w.boss = k % 10 === 0 ? 'queen' : 'boss_thug';
  return w;
}
export function waveDef(wave) {
  return wave <= WAVES.length ? WAVES[wave - 1] : endlessWave(wave);
}

// ─── 업그레이드 카드 ─────────────────────────────────────
// 희귀도: common(일반) · rare(희귀) · legend(전설) · hidden(HIDDEN)
export const RARITY = {
  common: { name: '일반', weight: 10, color: '#9fb3c8' },
  rare: { name: '희귀', weight: 5, color: '#4ea8ff' },
  legend: { name: '전설', weight: 1.6, color: '#ffb400' },
  hidden: { name: 'HIDDEN', weight: 0, color: '#ff4fd8' },
};
// 전역 강화 카드 (영웅 합류/레벨업 카드는 sim.js 가 자동으로 만든다)
export const CARDS = [
  { id: 'dmg', icon: '💪', title: '회식 버프', desc: '모든 영웅 공격력 +15%', rarity: 'common', max: 6 },
  { id: 'spd', icon: '⚡', title: '카페인 충전', desc: '모든 영웅 공격 속도 +12%', rarity: 'common', max: 5 },
  { id: 'gunExtra', icon: '🔫', title: '건전남 탄창 추가', desc: '건전남 투사체 +1', rarity: 'rare', max: 2, needs: 'gunman' },
  { id: 'crit', icon: '🎯', title: '정곡 찌르기', desc: '치명타 확률 +8% (피해 2배)', rarity: 'rare', max: 4 },
  { id: 'hp', icon: '🧱', title: '입구 리모델링', desc: '랑방 최대 내구도 +20% · 30% 회복', rarity: 'common', max: 5 },
  { id: 'exp', icon: '🧃', title: '인싸력 상승', desc: '경험치 획득 +20%', rarity: 'common', max: 3 },
  { id: 'slow', icon: '🚧', title: '새치기 금지', desc: '모든 진상 이동 속도 -8%', rarity: 'common', max: 3 },
  { id: 'pierce', icon: '🗡️', title: '관통 공지', desc: '모든 투사체 관통 +1', rarity: 'legend', max: 2 },
  { id: 'boss', icon: '🍻', title: '랑방 단골의 힘', desc: '공격력 +30% · 공격 속도 +15%', rarity: 'legend', max: 2 },
  { id: 'regen', icon: '🛠️', title: '건물주 인맥', desc: '랑방이 초당 내구도 1.5 자동 회복', rarity: 'legend', max: 2 },
  { id: 'ult', icon: '📣', title: '총공지 확성기', desc: '궁극기 충전 +50% · 피해 +40%', rarity: 'rare', max: 2 },
  { id: 'charmRes', icon: '🛡️', title: '연애 금지 서약', desc: '홀림 시간 -50%', rarity: 'rare', max: 1 },
];
// 뽑을 게 모자랄 때 채워 넣는 카드 (제한 없음)
export const FILLER_CARDS = [
  { id: 'fillUlt', icon: '📣', title: '확성기 예열', desc: '총공지 게이지 +40', rarity: 'common' },
  { id: 'fillHeal', icon: '🩹', title: '응급 수리', desc: '랑방 내구도 35% 회복', rarity: 'common' },
];
