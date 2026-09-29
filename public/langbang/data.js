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
  breakSec: 4, // 웨이브 사이 쉬는 시간
  firstBreakSec: 2.5,
  bossIntroSec: 2.6,
  crit: 0.05, // 기본 치명타 확률
  critMul: 2.0,
  magnet: 150, // 경험치 보석 자석 범위 (로프에서 위로)
  gemDrift: 26, // 보석이 입구 쪽으로 저절로 흘러오는 속도
  comboWindow: 1.6, // 이 시간 안에 계속 잡으면 콤보 유지
  ultMax: 100, // 궁극기 '총공지' 게이지
  ultPerKill: 1.4,
  ultPerBoss: 25,
  ultDamage: 90, // × (1 + 0.22 × 웨이브)
  metaDmgPerLevel: 0.08, // 영구 강화 1레벨당 공격력 +8%
  hiddenChance: 0.07, // 카드 한 칸당 히든 영웅 등장 확률
  hiddenFromWave: 4, // 웨이브 4부터 (= 웨이브 3 이후)
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
  hpPct: 50,
};

// 영구 강화 비용 (서버가 최종 결정 — 화면 표시용 예상치)
export const META_MAX = 10;
export function metaCost(lv) {
  return 80 * (lv + 1) * (lv + 1);
}

// ─── 영웅 ──────────────────────────────────────────────
// dmg: 1발 피해, interval: 공격 간격(초), range: 사거리, proj: 투사체 종류
export const HEROES = {
  bangjang: {
    id: 'bangjang', name: '방장', gender: 'm', emoji: '📢', color: '#f6b73c',
    img: '/img/lb/h_bangjang.webp', role: '리더 · 아군 공속 오라',
    dmg: 22, interval: 0.85, range: 420, proj: 'notice', projSpeed: 520,
    aura: [0.08, 0.1, 0.16, 0.19, 0.26], // 모든 아군 공격 속도 +%
    desc: '확성기 "공지"를 쏜다. 곁에 있는 것만으로 모두의 손이 빨라진다.',
    perks: { 3: '공지가 적 1명을 관통 · 오라 강화', 5: '5발마다 "전체공지" 폭발 (범위 피해)' },
  },
  staff: {
    id: 'staff', name: '운영진', gender: 'f', emoji: '📋', color: '#5ab0ff',
    img: '/img/lb/h_staff.webp', role: '경고장 · 감속/강퇴',
    dmg: 17, interval: 0.95, range: 420, proj: 'warn', projSpeed: 480,
    slow: 0.38, slowSec: 1.6,
    desc: '"경고장"을 날려 적을 느리게 만든다. 규칙 위반자는 강퇴!',
    perks: { 3: '맞은 적 15% 확률로 "강퇴" (1초 기절)', 5: '경고장이 주변에도 퍼지고 강퇴 25%' },
  },
  gunman: {
    id: 'gunman', name: '건전남', gender: 'm', emoji: '🙋‍♂️', color: '#4fd18b',
    img: '/img/lb/h_gunman.webp', role: '단일 딜러 · 연사',
    dmg: 14, interval: 0.34, range: 440, proj: 'bullet', projSpeed: 820,
    desc: '건전하게, 그러나 빠르게. 믿고 쓰는 연사 딜러.',
    perks: { 3: '한 번에 2발 발사', 5: '한 번에 3발 · 치명타 +15%' },
  },
  gunnyeo: {
    id: 'gunnyeo', name: '건전녀', gender: 'f', emoji: '🙋‍♀️', color: '#ff8fc0',
    img: '/img/lb/h_gunnyeo.webp', role: '딜 + 랑방 회복',
    dmg: 19, interval: 0.75, range: 420, proj: 'flower', projSpeed: 520,
    heal: [[6, 0.02], [6, 0.025], [5, 0.03], [5, 0.035], [4, 0.045]], // [주기(초), 최대 내구도 대비 회복량]
    desc: '꽃을 던지며 틈틈이 랑방 입구를 수리한다.',
    perks: { 3: '회복량·주기 강화', 5: '모든 아군 홀림 면역 ("철벽!")' },
  },
  // ── HIDDEN ──
  eunok: {
    id: 'eunok', name: '최은옥', gender: 'f', emoji: '🍶', color: '#ff5a4f', hidden: true,
    img: '/img/lb/h_eunok.webp', imgRage: '/img/lb/h_eunok_rage.webp', role: 'HIDDEN · 술 마시면 분노 모드',
    dmg: 26, interval: 0.7, range: 420, proj: 'bottle', projSpeed: 540,
    soberSec: [20, 20, 18, 18, 15], rageSec: [10, 12, 13, 15, 16],
    rageDmg: 2.2, rageInterval: 0.35,
    desc: '홀짝홀짝… 20초가 지나면 취해서 "분노 모드"가 된다.',
    perks: { 3: '분노 중 병이 터져 범위 피해', 5: '더 빨리 취하고 더 오래 분노' },
  },
  hanna: {
    id: 'hanna', name: '이한나', gender: 'f', emoji: '😉', color: '#ff6fd8', hidden: true,
    img: '/img/lb/h_hanna.webp', role: 'HIDDEN · 윙크 넉백 (남자만)',
    dmg: 19, interval: 0.68, range: 420, proj: 'wink', projSpeed: 460,
    knockback: [70, 85, 100, 115, 135],
    desc: '"윙크 ♥"에 맞은 남자는 정신 못 차리고 뒤로 날아간다. 여자는 그냥 아프다.',
    perks: { 3: '윙크 2개 동시 발사', 5: '윙크 3개 · 남자는 잠깐 기절' },
  },
  sunggu: {
    id: 'sunggu', name: '강성구', gender: 'm', emoji: '🦯', color: '#c9a36b', hidden: true,
    img: '/img/lb/h_sunggu.webp', role: 'HIDDEN · 지팡이 무한 관통',
    dmg: 75, interval: 2.0, range: 540, proj: 'cane', projSpeed: 430,
    desc: '"요즘 것들은…" 지팡이를 던지면 한 줄에 있는 놈들이 전부 맞는다.',
    perks: { 3: '지팡이가 부메랑처럼 돌아온다', 5: '지팡이 2개 · 공격 속도 +25%' },
  },
};
export const BASE_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
export const HIDDEN_HEROES = ['eunok', 'hanna', 'sunggu'];
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
    exp: 2, coin: 3, r: 14, size: 64, steal: { base: 6, perWave: 1.5 },
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
  { id: 'magnet', icon: '🧲', title: '인맥 자석', desc: '경험치 자석 범위 +45%', rarity: 'common', max: 3 },
  { id: 'coin', icon: '🏷️', title: '단골 할인', desc: '코인 획득 +20%', rarity: 'common', max: 4 },
  { id: 'pierce', icon: '🗡️', title: '관통 공지', desc: '모든 투사체 관통 +1', rarity: 'legend', max: 2 },
  { id: 'boss', icon: '🍻', title: '랑방 단골의 힘', desc: '공격력 +30% · 공격 속도 +15%', rarity: 'legend', max: 2 },
  { id: 'regen', icon: '🛠️', title: '건물주 인맥', desc: '랑방이 초당 내구도 1.5 자동 회복', rarity: 'legend', max: 2 },
  { id: 'ult', icon: '📣', title: '총공지 확성기', desc: '궁극기 충전 +50% · 피해 +40%', rarity: 'rare', max: 2 },
  { id: 'charmRes', icon: '🛡️', title: '연애 금지 서약', desc: '홀림 시간 -50%', rarity: 'rare', max: 1 },
];
// 뽑을 게 모자랄 때 채워 넣는 카드 (제한 없음)
export const FILLER_CARDS = [
  { id: 'fillCoin', icon: '💰', title: '팁 받음', desc: '코인 +25', rarity: 'common' },
  { id: 'fillHeal', icon: '🩹', title: '응급 수리', desc: '랑방 내구도 35% 회복', rarity: 'common' },
];
