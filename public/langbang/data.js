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
// 방어선(영웅 줄) 높이: 화면 아래쪽 ~79% (스킬 바 · 입구 게이지와 안 겹치게 아래 166 은 비워 둔다)
export const rowYFor = (H) => Math.round(Math.min(H * 0.79, H - 166));
export const HERO_SLOTS = 6;
// 슬롯 x 좌표 (가로 360 기준) 와 채우는 순서(가운데부터)
export const SLOT_X = [34, 92, 150, 210, 268, 326];
export const SLOT_X7 = [28, 79, 129, 180, 231, 281, 332]; // 덱 7칸일 때
export const SLOT_ORDER = [2, 3, 1, 4, 0, 5];
// 덱 칸 수 → 열린 자리 (가운데부터). 나머지 자리는 자물쇠 (상점에서 5·6번째 칸을 사면 열림)
export const openSlots = (n) => SLOT_ORDER.slice(0, Math.max(1, Math.min(6, n || 6)));

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
  comboWindow: 2.0, // 이 시간 안에 계속 잡으면 콤보 유지 (2초 동안 못 잡으면 끊김)
  ultMax: 100, // 궁극기 '총공지' 게이지
  ultPerKill: 1.4,
  ultPerBoss: 25,
  ultDamage: 90, // × (1 + 0.22 × 웨이브)
  metaDmgPerLevel: 0.08, // 영구 강화 1레벨당 공격력 +8%
  hiddenChance: 0.07, // 카드 한 칸당 히든 영웅 등장 확률 (해금한 히든만)
  hiddenFromWave: 4, // 무한 도전: 웨이브 4부터 (= 웨이브 3 이후)
  hiddenFromStageWave: 2, // 스테이지: 웨이브 2부터
  cardChoices: 4, // 레벨업 카드 수
  kbMaxReach: 330, // 넉백으로 밀려도 영웅 줄에서 이 거리 위로는 안 올라간다 (모두의 사거리 안)
  kbRepeatSec: 2, // 이 시간 안에 또 밀리면 절반만 밀린다
  stageBossHp: 0.85, // 스테이지 보스 체력 (튀지 않게)
  bossWeakSec: 2.5, // 보스 큰 기술 직후 "빈틈!" 시간
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
// 레벨업은 드물게, 대신 한 번 한 번이 크게: 필요 경험치 ×2.2 (스테이지는 뒤로 갈수록 경험치를 줄여 스테이지당 4~6번)
export const EXP_NEED_MUL = 2.4; // (2.2 → 2.4: 카드가 너무 자주 떠서 조금 천천히)
export const stageExpMul = (s) => 1 / (1 + 0.1 * Math.max(0, (s || 1) - 1));

// 웨이브별 적 체력 배율
export const ENDLESS_TUNE = { hp: 1.15, atk: 0.14, from: 20, xp: 0.84 }; // xp: 뒤 웨이브일수록 카드가 덜 나온다 (진상이 늘어도 힘이 같이 폭주하지 않게) // 무한 압박 (밸런스 스크립트로 맞춤)
export function hpMul(wave, stage) {
  const w = wave - 1;
  let m = 1 + 0.2 * w + 0.03 * w * w;
  if (wave > ENDLESS_TUNE.from && !stage) m *= Math.pow(ENDLESS_TUNE.hp, wave - ENDLESS_TUNE.from); // 무한 모드: 웨이브마다 체력 ×1.12 — 어떤 덱도 결국 무너진다
  return m;
}
// 웨이브별 적 공격력 배율
export function atkMul(wave, stage) {
  return 1 + 0.05 * (wave - 1) + (wave > ENDLESS_TUNE.from && !stage ? ENDLESS_TUNE.atk * (wave - ENDLESS_TUNE.from) : 0);
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
  slot5: { id: 'slot5', icon: '💺', name: '덱 5번째 칸', max: 1, per: 1, costs: [25000], desc: (v) => (v ? '덱 5칸!' : '덱에 멤버 한 명 더') },
  slot6: { id: 'slot6', icon: '🛋️', name: '덱 6번째 칸', max: 1, per: 1, costs: [80000], needs: 'slot5', desc: (v) => (v ? '덱 6칸!' : '덱에 멤버 한 명 더 (5번째 칸 먼저)') },
};
export const DECK_BASE = 4; // 기본 덱 칸
export const deckSlots = (items) => DECK_BASE + ((items && items.slot5) | 0) + ((items && items.slot5 && items.slot6) | 0);
// 예전 덱 칸(기본 5 · slot6 = 6칸 · slot7 = 7칸) → 새 칸(기본 4 · slot5 · slot6). 이미 산 칸은 그대로 한 칸씩 남긴다
export function migrateDeckItems(items) {
  if (!items) return items;
  if (items.slot7) { items.slot5 = 1; items.slot6 = 1; }
  else if (items.slot6 && !items.slot5) { items.slot5 = 1; items.slot6 = 0; }
  delete items.slot7;
  return items;
}
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
export const STAGE_COUNT = 60;
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
  {
    id: 4, name: '랑방 여행 편', desc: '공항에서 제주도까지 — 여행지에도 진상은 따라온다', color: '#4fd1ff',
    names: ['출국 수속', '면세점 대란', '기내 진상', '제주 도착', '꼰대돌싱찌질남', '돌담길', '유채꽃밭', '바닷가 횟집', '게스트하우스', '여왕된장싱글맘'],
  },
  {
    id: 5, name: 'MT · 펜션 편', desc: '1박 2일 MT — 펜션에 진상들이 쳐들어왔다', color: '#ff9a3c',
    names: ['펜션 도착', '장보기 대란', '바비큐 파티', '영업쟁이 출몰', '영업의 왕', '캠프파이어', '노래방 MT', '새벽 술판', '오타쿠의 밤', '오타쿠 왕'],
  },
  {
    id: 6, name: '연말 파티 · 인피 본부', desc: '크리스마스 파티, 그리고 인피 본부 최종전', color: '#c77dff',
    names: ['연말 거리', '송년회', '주사 대행진', '산타 대란', '주사왕', '눈 내리는 밤', '카운트다운', '인피 본부 입구', '최후의 파티', '솔로파티 중독자'],
  },
];
// 이 스테이지를 처음 깨면 히든 영웅이 영구 합류 (출전 동료로 고를 수 있고, 카드로도 나온다)
export const HERO_UNLOCK = { dohoon: 6, eunok: 10, myunghoon: 13, hanna: 15, ingyu: 17, sunggu: 20, donghan: 22, youngjun: 23 }; // 1-6 · 1-10 · 2-3 · 2-5 · 2-7 · 2-10 · 3-2 · 3-3
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
  levelPerStage: 0.55, levelPow: 0.8, wavePerStage: 0.08,
  chapterAdd: [0, 0.8, 0, 0.6, 1.2, 1.8], // 2챕터부터 동료가 2명이라 그만큼 더 단단하게 (첫 웨이브 난이도 = 1 + 1.1 × (s-1)^0.8 + 챕터 보정)
  bossStage: { 1: [0.2, 1.2], 2: [-0.8, -2.6], 3: [-1.8, -2.2], 4: [-1.6, -2.4], 5: [-1.6, -2.4], 6: [-1.6, -2.6] }, // x-5 · x-10 스테이지는 조금 더 어렵게 (1-10 은 강화가 필요, 2·3챕터 끝은 보스 2명)
  levelPerWave: 1.75, // 스테이지 안에서 웨이브마다 +1.6 (+ 스테이지마다 0.08씩 더) (첫 웨이브는 쉽게, 뒤로 갈수록 확)
  baseCount: 12, // 1-1 첫 웨이브 적 수
  countPerStage: 0.02,
  countPerWave: 0.3,
  waveSec: 13, // 적이 나오는 시간(초)
  waveSecPerStage: 0.12,
  themeMul: 7, // 스테이지 주인공 계열 비중 배율
  themeOther: 0.2, // 그때 꼬충(유혹형) 비중
  themeRest: 0.4,
  themeThug: 3,
  deckHp: [2.9, 2.3, 1.9, 1.8, 1.8, 1.8], // 덱(5명) 보정: 적 체력 배율 (챕터별 — 뒤로 갈수록 강화·장비가 쌓이니 조금씩 덜)
  deckCount: 1.45, // 덱 보정: 적 수 배율
  hpTune: [1.0, 1.4, 1.9, 1.15, 0.62, 0.45], // (5·6장: 강화 12~16 덱 기준으로 다시 맞춤 — 전엔 5-1부터 벽) // 챕터별 최종 난이도 조정 (밸런스 스크립트로 맞춘 값)
  swarm: [1.3, 1.6, 1.9, 2.2, 2.6, 3.0], // 챕터별 적 수 배율 (떼로 몰려온다 · 1-1 은 그대로)
  stageAdd: {3: 2.5, 4: 3.5, 5: -2, 6: -4, 7: 1.5, 8: 3.6, 9: -0.8, 10: 3.6, 11: -0.5, 12: 1.2, 13: 2, 14: 9.5, 15: -6, 16: 3.5, 17: 3.25, 18: 3, 19: -0.9, 20: -0.3, 22: 6, 25: 6, 26: 1.7, 27: 2, 28: -6, 29: -9.5, 30: 3.5, 31: -15.5, 32: -5.5, 33: -4, 34: -10, 35: -2, 36: -8, 37: -1.5, 38: 3, 39: -11, 40: -4.6, 41: -1.5, 42: -1, 43: -2.5, 45: 2, 46: 0, 47: 1, 48: -2, 50: 1.5, 51: -3.2, 52: 3, 53: 3.5, 55: 9, 56: -5, 59: 7, 60: -2.3}, // 챕터 끝 보스 바로 앞 스테이지는 살짝 더
  augAdd: 2, // 증강(1·3·5웨이브)이 생겨서 진상도 그만큼 조금 세게
  themeLevel: { violent: -1.2 }, // 폭력형 스테이지는 단단한 적이 많아서 조금 낮게 // 나머지 계열 비중
};
// 덱 5명으로 싸우니 적도 그만큼 단단하게 — 1-1 은 연습이라 그대로, 1-3 부터 본격
export function stageHpScale(s) { return (1 + (STAGE.deckHp[chapterOf(s) - 1] - 1) * Math.min(1, (s - 1) / 2)) * (s <= 2 ? [0.7, 0.8][s - 1] : STAGE.hpTune[chapterOf(s) - 1] || 1); } // 1-1 · 1-2 는 튜토리얼 (어떤 덱이든 쉽게)
export function stageLevel(s, w) {
  const n = stageNo(s);
  const bs = STAGE.bossStage[chapterOf(s)];
  const boss = n === 10 ? bs[1] : n === 5 ? bs[0] : 0;
  // 첫 웨이브는 새로 시작한 멤버도 버티게 천천히, 스테이지 안에서 웨이브마다 가파르게 (뒤 스테이지일수록 더)
  return 1 + STAGE.levelPerStage * Math.pow(s - 1, STAGE.levelPow) + (w - 1) * (STAGE.levelPerWave + STAGE.wavePerStage * Math.min(s - 1, 29)) + boss + STAGE.chapterAdd[chapterOf(s) - 1] + (STAGE.themeLevel[stageTheme(s)] || 0) + (STAGE.stageAdd[s] || 0) + (s >= 3 ? STAGE.augAdd * Math.min(1, (s - 2) / 3) * (s > 20 ? 1.3 : 1) : 0);
}
// 적은 스테이지마다 조금씩 늘어난다:
//  1챕터 꼬충 → 먹튀(1-3) → 술진상(1-4) → 폭력배(1-8)
//  2챕터 사기꾼(2-1) → 뒷담러(2-2) → 패거리(2-4) → 독재자(2-7)  ·  3챕터 인피 아지트: 인피 총출동, 꼬충은 줄어든다
// ─── 스테이지마다 제목에 맞는 진상 캐스트 (2~4종) + 한 줄 이야기 ─────────────
// 난이도는 "어떤 진상이 섞이냐"(상성 · 기술)와 웨이브 성격으로, 수는 보조로만
// 'type:무게' — 무게가 작을수록 드물게 (단단하거나 기술이 센 진상)
const STAGE_CASTS = [
  // 1장 랑방 골목
  ['yeokko:1 namkko:1', '골목 입구에 꼬충들이 기웃거린다. 첫 손님 맞이!'],
  ['namkko:1 yeokko:0.7', '편의점 파라솔 아래 "오빠~ 한 잔 사줘" 남꼬충이 달라붙는다'],
  ['mukti:0.35 yeokko:0.8 namkko:0.6', '계산대 앞에서 사라지는 먹튀들 — 경험치를 지켜라'],
  ['drunk:1 namkko:0.5 mukti:0.15', '골목 호프집에서 쏟아져 나온 술진상들'],
  ['thug:0.25 drunk:0.6 mukti:0.2', '골목 사채업자가 폭력배를 끌고 나타났다'],
  ['yeokko:1 namkko:1 vomit:0.12 clubguy:0.12', '불금 전야, 꼬충들이 떼로 몰려온다 — 클럽남은 클럽녀를 데려왔다'],
  ['drunk:0.8 vomit:0.2 cutter:0.2', '포장마차 줄에 새치기꾼과 토하는 인간까지'],
  ['cutter:0.35 drunk:0.7 mukti:0.2', '막차 놓치기 싫은 새치기꾼들이 한 줄로 달려온다'],
  ['drunk:0.8 thug:0.2 vomit:0.2 namkko:0.5', '새벽 두 시, 골목이 제일 험한 시간'],
  ['yeokko:0.8 namkko:0.8 mukti:0.2', '골목 꼬충들의 여왕벌이 직접 나섰다'],
  // 2장 불금 번화가
  ['couple:0.12 namkko:0.8 yeokko:0.8', '불금 번화가 — 애정행각 커플이 길을 막는다'],
  ['scammer:0.35 yeokko:0.6 selfie:0.12 handsy:0.1', '"프사랑 똑같아요~" 가입인사 사기꾼 러시'],
  ['inpi_gossip:0.4 selfie:0.15 couple:0.12 namkko:0.5', '뒷담러가 수군수군, 셀카 플래시가 번쩍'],
  ['inpi_clique:0.6 inpi_gossip:0.2 handsy:0.18', '라이벌 모임 "인피"가 패거리로 몰려온다'],
  ['inpi_clique:0.5 thug:0.2 gao:0.12', '행동대장이 "무릎 꿇어!" 서열 정리하러 왔다'],
  ['drunk:1 vomit:0.2 gao:0.12 clubguy:0.2', '번화가를 가득 메운 만취 대행진 · 클럽 앞 줄까지'],
  ['inpi_dictator:0.12 inpi_clique:0.5 inpi_gossip:0.2', '인피 독재자가 패거리를 단단하게 만든다 — 먼저 잡자'],
  ['cutter:0.3 drunk:0.7 handsy:0.12 earphone:0.14', '택시 한 대에 열 명 — 새치기꾼 · 손진상 · 아무 말도 안 들리는 노캔 이어폰녀'],
  ['cutter:0.3 mukti:0.25 gao:0.15 drunk:0.5', '첫차를 향한 전쟁, 발 빠른 진상들'],
  ['yeokko:0.7 namkko:0.7 scammer:0.25 couple:0.12', '여왕벌이 번화가 꼬충까지 거느리고 돌아왔다'],
  // 3장 인피 아지트
  ['inpi_clique:0.6 kkondae:0.1 thug:0.15', '인피 아지트 입구 — 꼰대 문지기가 "라떼는~"'],
  ['inpi_gossip:0.35 spam:0.15 selfie:0.12 earphone:0.15', '복도마다 수군수군, 단톡방 알림 — 이어폰 낀 사람은 못 들은 척'],
  ['inpi_clique:0.8 inpi_gossip:0.15 inpi_treasurer:0.14 inpi_dictator:0.08', '끼리끼리 뭉친 패거리 — 범위 공격으로 한 번에'],
  ['scammer:0.5 handsy:0.15 couple:0.12', '사기꾼들의 소굴, 예쁜 프사에 속지 마'],
  ['thug:0.3 gao:0.2 inpi_clique:0.4', '행동대장과 폭력배 두목이 함께 기다린다'],
  ['inpi_dictator:0.15 inpi_clique:0.6 kkondae:0.1 inpi_treasurer:0.06', '독재자의 연설에 패거리가 한껏 단단해졌다'],
  ['inpi_clique:0.5 inpi_gossip:0.2 inpi_dictator:0.08 inpi_treasurer:0.08', '인피 전원 출동!'],
  ['drunk:0.6 vomit:0.12 spam:0.08 mukti:0.2', '오리고기 회식 냄새에 먹튀와 토하는 인간이 몰렸다'],
  ['inpi_treasurer:0.07 inpi_dictator:0.06 inpi_clique:0.5 gao:0.12', '보호막 뿌리는 총무와 독재자 — 누구부터 잡을까'],
  ['inpi_clique:0.5 inpi_gossip:0.25 spam:0.12', '인피 대장과 최종 결전'],
  // 4장 랑방 여행 편
  ['cutter:0.3 fakesingle:0.3 namkko:0.3', '출국 수속 줄에 새치기꾼, 그리고 "저 싱글이에요~"'],
  ['carpoor:0.35 selfie:0.15 fakesingle:0.4 couple:0.1', '면세점 명품 코너에 카푸어와 셀카족'],
  ['drunk:0.6 kkondae:0.12 vomit:0.2 handsy:0.1', '기내 진상: 술 달라, 토하고, "라떼는~"'],
  ['secretmom:0.3 fakesingle:0.4 carpoor:0.25 noshow:0.18', '렌터카 줄 — 그리고 당일 아침 「약속 취소~」'],
  ['kkondae:0.15 fakesingle:0.45 gao:0.12', '꼰대 + 돌싱 + 찌질을 다 가진 보스가 나타났다'],
  ['kkondae2:0.12 secretmom:0.25 carpoor:0.25 cutter:0.2', '돌담길에 울리는 골프 꼰대의 "나이스 샷!"'],
  ['selfie:0.2 couple:0.15 yeokko:0.6 fakesingle:0.3', '유채꽃밭 인생샷 전쟁 — 셀카족과 커플'],
  ['sarcasm:0.15 drunk:0.5 kkondae2:0.1 mukti:0.2', '횟집에서 돌려까기 장인이 "어머 많이 먹는다~"'],
  ['secretmom:0.3 fakesingle:0.4 sarcasm:0.12 noshow:0.15', '게스트하우스 파티 — 거짓말쟁이들과 뒷담러, 약속취소 빌런'],
  ['secretmom:0.3 carpoor:0.25 sarcasm:0.12 fakesingle:0.3', '여왕된장싱글맘이 명품 가방을 휘두른다'],
  // 5장 MT · 펜션 편
  ['sales:0.3 carpoor:0.2 fakesingle:0.3', '펜션 주차장에 영업쟁이가 먼저 와 있다'],
  ['mukti:0.3 cutter:0.25 jjijil:0.35 sales:0.15', '마트 장보기 — 먹튀 · 새치기 · 찌질남'],
  ['drunk:0.6 vomit:0.15 jjijil:0.18 gao:0.1', '고기 굽는 연기 속 술진상과 찌질남'],
  ['sales:0.35 spam:0.15 secretmom:0.2', '"보험 하나 드세요!" 다단계 영업 러시'],
  ['sales:0.3 carpoor:0.25 kkondae2:0.1', '영업의 왕이 계약서를 들고 나타났다'],
  ['couple:0.15 jjijil:0.35 sarcasm:0.15 praise1:0.1', '캠프파이어 앞 커플과 "왜 답장 안 해?" — "언니 너무 이뻐요~"'],
  ['selfie:0.2 inpi_gossip:0.2 couple:0.15 otaku:0.08', '노래방 대첩 — 마이크 뺏기 전쟁'],
  ['drunk_cry:0.35 drunk:0.5 vomit:0.2', '새벽 술판, 세 잔째부터 우는 진상'],
  ['otaku:0.15 jjijil:0.35 drunk_cry:0.25', '오타쿠의 밤 — 피규어 부대 출동'],
  ['otaku:0.12 sales:0.2 jjijil:0.3 drunk_cry:0.2', '오타쿠 왕이 굿즈 방패를 들었다'],
  // 6장 연말 파티 · 인피 본부
  ['drunk_run:0.4 couple:0.15 selfie:0.15 praise1:0.1', '연말 거리, 뛰는 취객과 커플들 — "언니 너무 이뻐요~" 칭찬 빌런'],
  ['kkondae:0.12 kkondae2:0.1 drunk:0.5 sarcasm:0.15', '송년회 — 꼰대들의 라떼 폭격'],
  ['drunk_cry:0.3 drunk_run:0.35 drunk_sleep:0.1 drunk_home:0.25', '주사 4종 대행진'],
  ['cutter:0.3 drunk_run:0.3 drunk_home:0.25 drunk_sleep:0.08', '산타 대란 — 택시 잡기 전쟁'],
  ['drunk_cry:0.3 drunk_run:0.3 drunk_sleep:0.15 drunk_home:0.2', '울고 뛰고 자고 집에 가는 주사왕'],
  ['couple:0.15 fakesingle:0.3 jjijil:0.3 secretmom:0.2', '눈 내리는 밤, 솔로들의 발악 · 칭찬 빌런 · 노캔 이어폰녀'],
  ['selfie:0.2 spam:0.15 otaku:0.1 drunk_run:0.3', '카운트다운 — 관종들의 마지막 인증샷'],
  ['inpi_clique:0.5 inpi_dictator:0.1 inpi_treasurer:0.1 gao:0.12', '인피 본부 — 총무와 독재자가 지키는 문'],
  ['sales:0.2 sarcasm:0.15 inpi_gossip:0.2 kkondae2:0.1', '최후의 파티 — 말로 싸우는 진상들'],
  ['couple:0.15 yeokko:0.4 namkko:0.4 drunk_run:0.25', '솔로파티 중독자의 디스코볼이 돈다'],
];
const CAST = STAGE_CASTS.map(([c]) => c.split(' ').map((x) => { const [t, w] = x.split(':'); return [t, +w]; }));
export const stageStory = (s) => (STAGE_CASTS[s - 1] || [])[1] || '';
// 스테이지 진상 구성 (raw = 예전 기본 구성 — 총 체력을 맞추는 기준으로만 쓴다)
export function stageMix(s, raw) {
  if (raw || !CAST[s - 1]) return legacyMix(s);
  return CAST[s - 1].map(([t, w]) => [t, w]);
}
function legacyMix(s) {
  const raw = true;
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
  if (s >= 18) mix.push(['inpi_treasurer', ch === 2 ? 0.03 : 0.06]);
  // 골목 빌런들
  if (s >= 6) mix.push(['vomit', ch === 1 ? 0.07 : 0.05]);
  if (s >= 7) mix.push(['cutter', ch === 1 ? 0.07 : 0.05]);
  if (s >= 11) mix.push(['couple', 0.06]);
  if (s >= 12) mix.push(['selfie', 0.05]);
  if (s >= 14) mix.push(['handsy', 0.05]);
  if (s >= 16) mix.push(['gao', 0.06]);
  if (s >= 21) mix.push(['kkondae', 0.035]);
  if (s >= 22) mix.push(['spam', 0.06]);
  // 4~6장: 예전 진상은 줄고 새 진상이 하나씩
  if (ch >= 4) {
    for (const m of mix) m[1] *= 0.45;
    const k = stageNo(s);
    const add = (t, w, from = 1) => { if (k >= from || ch > 4) mix.push([t, w]); };
    if (ch >= 4) { add('fakesingle', 0.5); add('carpoor', 0.35, 2); add('secretmom', 0.3, 4); add('kkondae2', 0.04, 6); add('sarcasm', 0.12, 8); }
    if (ch >= 5) { mix.push(['sales', 0.25], ['jjijil', 0.3]); if (k >= 6 || ch > 5) mix.push(['otaku', 0.12]); if (k >= 8 || ch > 5) mix.push(['drunk_cry', 0.3]); }
    if (ch >= 6) { mix.push(['drunk_run', 0.4], ['drunk_sleep', 0.14], ['drunk_home', 0.25]); }
  }
  // 스테이지마다 주인공 계열이 있다 → 팀 속성을 바꿔 가며 도전하는 재미
  const th = raw ? 'mix' : stageTheme(s);
  if (th !== 'mix') {
    if (th === 'violent' && !mix.some((m) => m[0] === 'thug')) mix.push(['thug', 0.1]);
    for (const m of mix) {
      const c = ENEMIES[m[0]].cls;
      if (m[0] === 'gao') continue; // 가오충은 말빨이 약점이라 주인공으로 몰아넣지 않는다
      if (c === th) m[1] *= m[0] === 'thug' ? STAGE.themeThug : STAGE.themeMul; // 폭력배는 단단해서 조금만
      else if (c === 'seduce') m[1] *= STAGE.themeOther;
      else m[1] *= STAGE.themeRest;
    }
  }
  return mix;
}
const FEW = ['thug', 'mukti', 'inpi_dictator', 'inpi_gossip', 'scammer', 'inpi_treasurer', 'vomit', 'cutter', 'couple', 'selfie', 'handsy', 'gao', 'kkondae', 'spam', 'kkondae2', 'otaku', 'drunk_sleep', 'sarcasm'];
// 스테이지 번호별 주인공 계열 (1챕터엔 정치형이 없어서 유혹형)
const THEMES = [null, 'seduce', 'seduce', 'jerk', 'jerk', 'violent', 'violent', 'politic', 'jerk', 'violent', 'mix'];
export function stageTheme(s) {
  // 캐스트에서 한 계열이 55% 넘으면 그 계열이 주인공
  if (CAST[s - 1]) {
    const w = {}; let sum = 0;
    for (const [t, x] of CAST[s - 1]) { const c = ENEMIES[t].cls; w[c] = (w[c] || 0) + x; sum += x; }
    const top = Object.keys(w).sort((a, b) => w[b] - w[a])[0];
    return w[top] / sum >= 0.55 ? top : 'mix';
  }
  const t = THEMES[stageNo(s)];
  if (chapterOf(s) === 3 && stageNo(s) === 9) return 'politic'; // 3-9 최후의 방어선: 인피 총동원
  return t === 'politic' && chapterOf(s) === 1 ? 'seduce' : chapterOf(s) === 3 && t === 'seduce' ? 'politic' : t;
}
// 보스: x-5, x-10 마지막 웨이브
export function stageBosses(s) {
  const n = stageNo(s), ch = chapterOf(s);
  const B5 = [null, ['boss_loan'], ['boss_gapjil'], ['boss_gapjil', 'boss_thug'], ['boss_kkondol'], ['boss_sales'], ['boss_jusa']];
  const B10 = [null, ['queen'], ['queen', 'boss_gapjil'], ['boss_inpi', 'boss_gapjil'], ['boss_queenmom', 'boss_kkondol'], ['boss_otaku', 'boss_sales'], ['boss_soloparty', 'boss_jusa']];
  if (n === 5) return B5[ch] || [];
  if (n === 10) return B10[ch] || [];
  return [];
}
// ─── 웨이브 성격: 떼거리(범위 공격) · 정예(한 방 공격) · 혼합 · 보스+호위 떼 ─────
// count = 진상 수 배율, hp = 한 명 체력 배율 (떼거리·혼합 졸개), eliteHp = 정예 체력 배율
export const WAVE_KINDS = {
  N: { id: 'N', icon: '👥', name: '보통', count: 1, hp: 1, desc: '평범한 진상 행렬' },
  S: { id: 'S', icon: '🐜', name: '떼거리', count: 1.65, hp: 0.49, clump: true, desc: '약한 진상이 떼로 몰려온다 — 범위 공격이 최고' },
  E: { id: 'E', icon: '💀', name: '정예', count: 0.38, hp: 1, eliteHp: 2.4, elite: true, desc: '수는 적지만 단단한 정예 (범위 피해 -35%) — 한 방 공격이 최고' },
  M: { id: 'M', icon: '⚔️', name: '혼합', count: 1.2, hp: 0.5, clump: true, eliteHp: 2.4, escort: [2, 4], desc: '떼거리 졸개가 정예 2~4명을 호위' },
  B: { id: 'B', icon: '👑', name: '보스', count: 1.35, hp: 0.5, clump: true, desc: '보스 + 호위 떼' },
};
const WAVE_PATTERNS = [['S', 'E', 'M', 'S', 'M'], ['M', 'S', 'S', 'E', 'M'], ['S', 'M', 'S', 'E', 'E'], ['E', 'S', 'M', 'S', 'M'], ['S', 'E', 'S', 'M', 'E']]; // 3웨이브(중간 보스)는 떼거리/혼합
export function stageWaveKinds(s) {
  if (s === 1) return ['N', 'N', 'S', 'N', 'N'];
  if (s === 2) return ['N', 'S', 'N', 'E', 'M'];
  const p = WAVE_PATTERNS[(s * 3 + chapterOf(s)) % WAVE_PATTERNS.length].slice(0, STAGE_WAVES);
  if (stageBosses(s).length) p[STAGE_WAVES - 1] = 'B';
  if (stageMid(s) && p[MID_WAVE - 1] === 'E') p[MID_WAVE - 1] = 'S'; // 중간 보스 웨이브는 떼거리와 함께
  return p;
}
export function stageWave(s, w) {
  const bosses = w === STAGE_WAVES ? stageBosses(s) : [];
  let n = STAGE.baseCount * (1 + STAGE.countPerStage * (s - 1)) * (1 + STAGE.countPerWave * (w - 1)) * (s === 1 ? 1 : STAGE.deckCount * (STAGE.swarm[chapterOf(s) - 1] || 1));
  if (bosses.length) n *= 0.55;
  const kind = WAVE_KINDS[stageWaveKinds(s)[w - 1]] || WAVE_KINDS.N;
  n *= kind.count;
  const dur = STAGE.waveSec + STAGE.waveSecPerStage * (s - 1);
  const mix = stageMix(s);
  const sum = mix.reduce((a, m) => a + m[1], 0);
  // 주인공 계열 때문에 단단한 진상이 많아지면 그만큼 수를 줄여서 (총 체력이 튀지 않게)
  const avgHp = (m) => m.reduce((a, [t, w]) => a + w * ENEMIES[t].hp * (ENEMIES[t].pack ? 4 : 1), 0) / m.reduce((a, x) => a + x[1], 0);
  n *= clamp01(avgHp(stageMix(s, true)) / avgHp(mix), 0.45, 1.15);
  const g = [];
  mix.forEach(([type, wt], i) => {
    if (wt <= 0) return;
    const few = FEW.includes(type);
    const pack = ENEMIES[type].pack;
    let c = Math.round((n * wt) / sum);
    if (c < 1) c = few ? ((w + i) % 2 === 0 || bosses.length ? 1 : 0) : 2; // 드문 진상은 웨이브 걸러 한 명씩
    if (pack) c = Math.max(1, Math.round(c / ((pack.min + pack.max) / 2)) || 1); // 무리 수
    if (c <= 0) return;
    g.push([type, c, +(dur / c).toFixed(2), +(i * 0.7).toFixed(1), kind.elite ? 'E' : '']);
  });
  // 혼합: 제일 단단한 진상 2~4명을 정예로 (떼거리 졸개가 호위)
  if (kind.escort) {
    const tough = mix.filter(([t, wt]) => wt > 0 && !ENEMIES[t].pack).sort((a, b) => ENEMIES[b[0]].hp - ENEMIES[a[0]].hp)[0];
    const ne = kind.escort[0] + ((s + w) % (kind.escort[1] - kind.escort[0] + 1));
    if (tough) g.push([tough[0], ne, +(dur / (ne + 1)).toFixed(2), 3, 'E']);
  }
  const def = { g, level: stageLevel(s, w), hpScale: stageHpScale(s), kind: kind.id, fodderHp: kind.hp, eliteHp: kind.eliteHp || 1, clump: !!kind.clump };
  if (w === MID_WAVE && stageMid(s)) def.mid = stageMid(s);
  if (bosses[0]) def.boss = bosses[0];
  if (bosses[1]) def.boss2 = bosses[1];
  return def;
}
function clamp01(v, a, b) { return v < a ? a : v > b ? b : v; }
export function stageEnemies(s) {
  const set = new Set();
  for (const [t] of stageMix(s)) set.add(t);
  for (const b of stageBosses(s)) set.add(b);
  return [...set];
}

// ─── 맵 효과: 스테이지마다 하나 (눈에 보이고 게임에도 영향) ─────────
export const MAP_FX = {
  none: { id: 'none', icon: '🌙', name: '조용한 밤', desc: '특별한 일 없는 평범한 밤' },
  rain: { id: 'rain', icon: '🌧️', name: '비 오는 밤', desc: '진상 이동 속도 -10% · 멤버 사거리 -10%', enemySpd: 0.9, range: 0.9 },
  fog: { id: 'fog', icon: '🌫️', name: '안개', desc: '멀리 쏘는 멤버(사거리 400+) 사거리 -20% · 말빨은 그대로', longRange: 0.8 },
  blackout: { id: 'blackout', icon: '💡', name: '정전', desc: '가끔 불이 꺼지면 가까운 진상과 지목한 진상만 보인다', every: 10, dark: 2.6, seeR: 190 },
  happy: { id: 'happy', icon: '🎉', name: '불금 해피아워', desc: '진상 +25% · 경험치 +40%', spawn: 1.25, exp: 0.4 },
  karaoke: { id: 'karaoke', icon: '🎤', name: '노래방 소음', desc: '말빨 멤버 피해 +25% · 매력 멤버 -15%', attr: { talk: 1.25, charm: 0.85 } },
  icy: { id: 'icy', icon: '❄️', name: '미끄러운 바닥', desc: '넉백 거리 +50%', kb: 1.5 },
  feast: { id: 'feast', icon: '🔥', name: '회식 열기', desc: '술 멤버 피해 +30% · 분노가 더 오래', attr: { booze: 1.3 }, rage: 1.3 },
  construction: { id: 'construction', icon: '🚧', name: '공사 중', desc: '양옆이 막혀 진상이 가운데로 몰린다 · 범위 공격 범위 +30%', lane: [96, 264], splash: 1.3 },
  megaphone: { id: 'megaphone', icon: '📢', name: '인피 확성기', desc: '10초마다 진상들이 3초 동안 30% 빨라진다', every: 10, sec: 3, speed: 1.3 },
  conveyor: { id: 'conveyor', icon: '🛄', name: '수하물 벨트', desc: '가운데 벨트 위 진상 +25% 빨라짐 — 가운데 줄을 막아라', belt: [120, 240], beltMul: 1.25 },
  wind: { id: 'wind', icon: '🌬️', name: '제주 바람', desc: '8초마다 바람 방향이 바뀌며 투사체가 옆으로 밀린다 · 진상 -5% 느림', every: 8, wind: 70, enemySpd: 0.95 },
  campfire: { id: 'campfire', icon: '🔥', name: '캠프파이어', desc: '가운데 모닥불 곁을 지나는 진상이 불탄다 · 술 멤버 +20%', fire: { x: 180, r: 58, dps: 10 }, attr: { booze: 1.2 } },
  snow: { id: 'snow', icon: '❄️', name: '연말 눈', desc: '진상 -12% 느림 · 멤버 공격 속도 -8% (손이 시려요)', enemySpd: 0.88, heroSpd: 0.92 },
  lightshow: { id: 'lightshow', icon: '🪩', name: '조명 쇼', desc: '9초마다 2초 동안 번쩍! 멤버 공격 25% 빗나감', every: 9, strobe: 2, miss: 0.25 },
};
// 스테이지별 맵 효과 (1챕터는 순하게, 뒤로 갈수록 적 구성과 맞물리게)
const STAGE_FX = [ // 속성 버프가 있는 효과(노래방·안개=말빨, 회식=술)는 그 속성이 추천인 스테이지에만
  'none', 'none', 'none', 'rain', 'none', 'icy', 'happy', 'rain', 'icy', 'karaoke',
  'happy', 'karaoke', 'rain', 'construction', 'icy', 'construction', 'karaoke', 'rain', 'blackout', 'feast',
  'megaphone', 'karaoke', 'construction', 'blackout', 'icy', 'happy', 'fog', 'rain', 'blackout', 'feast',
  'none', 'conveyor', 'wind', 'conveyor', 'wind', 'happy', 'wind', 'rain', 'fog', 'conveyor',
  'none', 'campfire', 'campfire', 'karaoke', 'happy', 'campfire', 'karaoke', 'blackout', 'fog', 'campfire',
  'snow', 'lightshow', 'snow', 'happy', 'snow', 'lightshow', 'megaphone', 'snow', 'lightshow', 'snow',
];
export function stageFx(s) { return MAP_FX[STAGE_FX[s - 1] || 'none']; }

// 보상 코인 (서버가 계산 — 여기는 손님 · 화면 표시용 같은 공식)
export const REWARD = { base: 60, perStage: 18, firstMul: 2, starMul: 0.5 };
export function clearCoins(s) { return REWARD.base + REWARD.perStage * (s - 1); }
// prevStars: 이 스테이지에서 전에 받은 최고 별(0 = 처음), couponLv: 단골 쿠폰 레벨
export function stageReward(s, stars, prevStars = 0, couponLv = 0, perfect = false, firstPerfect = false) {
  const base = clearCoins(s);
  const clear = Math.round(base * (0.7 + 0.1 * stars));
  const first = prevStars ? 0 : base * REWARD.firstMul;
  const newStars = Math.max(0, stars - prevStars);
  const star = Math.round(base * REWARD.starMul) * newStars;
  const perf = perfect ? Math.round(base * (firstPerfect ? 1.5 : 0.5)) : 0; // 퍼펙트 (입구 무피해)
  const mid = stageMid(s) ? Math.round(base * 0.2) : 0; // 중간 보스 처치 보너스
  const mul = 1 + itemValue('coupon', couponLv);
  const total = Math.round((clear + first + star + perf + mid) * mul);
  return { clear, first, star, perfect: perf, mid, newStars, bonus: total - clear - first - star - perf - mid, total };
}
// ─── 헬 모드: 일반 ★★★ 로 깬 스테이지의 강화판 (진상 체력·속도·공격·수 ↑, 보스 분노 한 번 더) ───
export const HELL = { hp: 2.2, speed: 1.3, atk: 1.6, count: 1.3, coin: 3, bossEnrage: { at: 0.5, speed: 1.25, atk: 1.3, text: '헬 분노!!' } };
export const hellOpen = (stages, s) => ((stages || {})[s] | 0) >= 3;
export function hellReward(s, stars, prevStars = 0, couponLv = 0) {
  const r = stageReward(s, stars, prevStars, couponLv, false, false);
  const total = Math.round(r.total * HELL.coin);
  return Object.assign({}, r, { hell: true, total, bonus: r.bonus + (total - r.total) });
}
export function endlessReward(wave, couponLv = 0) {
  const w = Math.max(0, Math.floor(wave));
  return Math.round((12 * w + w * w) * (1 + itemValue('coupon', couponLv)));
}

// ─── 속성 상성 (포켓몬처럼) ───────────────────────────────
// "머리 쓰는 진상(유혹형·정치형)엔 말빨·술, 몸 쓰는 진상(폭력형·진상형)엔 힘·매력"
// 약점: 말빨→폭력형(말이 안 통함) · 힘→유혹형(홀려서) · 매력→정치형(계산적이라) · 술→진상형(술진상한테 술은 역효과)
export const ATTRS = {
  talk: { id: 'talk', name: '말빨', icon: '🗣️', color: '#ffd23f' },
  power: { id: 'power', name: '힘', icon: '👊', color: '#ff7a4f' },
  charm: { id: 'charm', name: '매력', icon: '💖', color: '#ff6fd8' },
  booze: { id: 'booze', name: '술', icon: '🍶', color: '#7be38f' },
};
export const CLASSES = {
  seduce: { id: 'seduce', name: '유혹형', icon: '💋', color: '#ff8ad8' },
  violent: { id: 'violent', name: '폭력형', icon: '🥊', color: '#ff6b5a' },
  politic: { id: 'politic', name: '정치형', icon: '📜', color: '#a58bff' },
  jerk: { id: 'jerk', name: '진상형', icon: '🤪', color: '#ffc84a' },
};
export const TYPE_STRONG = 2.0, TYPE_WEAK = 0.45;
export const TYPE_CHART = {
  talk: { seduce: TYPE_STRONG, politic: TYPE_STRONG, violent: TYPE_WEAK },
  power: { violent: TYPE_STRONG, jerk: TYPE_STRONG, seduce: TYPE_WEAK },
  charm: { violent: TYPE_STRONG, jerk: TYPE_STRONG, politic: TYPE_WEAK },
  booze: { seduce: TYPE_STRONG, politic: TYPE_STRONG, jerk: TYPE_WEAK },
};
export function typeMul(attr, cls) { return (TYPE_CHART[attr] && TYPE_CHART[attr][cls]) || 1; }
// 스테이지에 나오는 적 계열 비중 (보스는 무겁게)
export function stageClasses(s) {
  const w = {};
  for (const [id, wt] of stageMix(s)) { const c = ENEMIES[id].cls; w[c] = (w[c] || 0) + wt * (ENEMIES[id].hp > 60 ? 2 : 1); }
  for (const id of stageBosses(s)) { const c = ENEMIES[id].cls; w[c] = (w[c] || 0) + 3; } // 보스는 체력이 커서 무겁게
  const sum = Object.values(w).reduce((x, y) => x + y, 0) || 1;
  for (const k in w) w[k] /= sum;
  return w;
}
// 속성별 평균 상성 배율 → 추천 속성 (1.05배 넘는 것, 좋은 순)
export function attrScores(s) {
  const w = stageClasses(s);
  const out = {};
  for (const a of Object.keys(ATTRS)) { let m = 0; for (const c in w) m += w[c] * typeMul(a, c); out[a] = m; }
  return out;
}
// 추천 팀: 속성 상성 × 멤버 딜 비중(kit — 힐러·탱커는 조금 낮게)으로 제일 좋은 조합
export function recommendTeam(s, avail, slots) {
  const sc = attrScores(s);
  const boss = stageBosses(s).length > 0; // 보스 스테이지는 한 명을 오래 때리는 멤버가 유리
  const val = (c) => c.reduce((x, id) => x + sc[HEROES[id].attr] * (HEROES[id].kit || 1) * (boss ? HEROES[id].bossKit || 1 : 1), 0);
  let best = null, bv = -1;
  const pick = (start, cur) => {
    if (cur.length === slots || cur.length === avail.length) { const v = val(cur); if (v > bv) { bv = v; best = cur.slice(); } return; }
    for (let i = start; i < avail.length; i++) { cur.push(avail[i]); pick(i + 1, cur); cur.pop(); }
  };
  pick(0, []);
  return best || [];
}
export function recommendAttrs(s) {
  const sc = attrScores(s);
  return Object.keys(sc).sort((a, b) => sc[b] - sc[a]).filter((a) => sc[a] > 1.05).slice(0, 2);
}

// ─── 영웅 ──────────────────────────────────────────────
// dmg: 1발 피해, interval: 공격 간격(초), range: 사거리(영웅마다 다름), proj: 공격 방식
// attr: 속성, attack: 기본 공격 한 줄 설명, skill: 액티브 스킬 (스킬 바에서 누른다)
// 그림 준비 상태: 아직 없는 그림은 요청하지 않는다 (404 없게) — 그림이 들어오면 여기 이름만 추가
const ART_READY = new Set(['h_jungmin', 'h_junyoung', 'h_soyoung', 'h_jieun', 'h_jieun_demon', 'h_sanghwa']);
const ART = (n) => (ART_READY.has(n) ? `/img/lb/${n}.webp` : '');
export const NO_DEX_ART = new Set([]); // dex/<id>.webp 없음
export const NO_HQ_ART = new Set(['junyoung']); // dexhq/<id>.webp 없음
export const NO_DUO_ART = new Set([]); // dexhq/<id>_duo.webp 없음
export const HEROES = {
  bangjang: {
    id: 'bangjang', bossKit: 1, kit: 1, name: '방장', gender: 'm', emoji: '📢', color: '#f6b73c', attr: 'talk',
    img: '/img/lb/h_bangjang.webp', role: '리더 · 아군 공속 오라',
    dmg: 17, interval: 0.8, range: 250, proj: 'cone', cone: [0.42, 0.42, 0.55, 0.55, 0.62], coneMax: 7, kb: 10,
    aura: [0.08, 0.1, 0.16, 0.19, 0.26], // 모든 아군 공격 속도 +%
    attack: '확성기 음파 — 로프 앞 짧은 부채꼴을 한꺼번에 (가운데 자리가 좋다)',
    desc: '확성기 "공지"를 외친다. 곁에 있는 것만으로 모두의 손이 빨라진다.',
    perks: { 3: '음파가 더 넓게 퍼진다 · 오라 강화', 5: '5번마다 "전체공지" 큰 음파' },
    skill: { id: 'rally', name: '집합!', cd: 22, desc: '5초 동안 모두 공격 속도 +50%', sec: [5, 5, 6, 6, 7], spd: [0.5, 0.5, 0.5, 0.6, 0.7] },
  },
  staff: {
    id: 'staff', bossKit: 0.9, kit: 1.0, name: '운영진', gender: 'f', emoji: '📋', color: '#5ab0ff', attr: 'talk',
    img: '/img/lb/h_staff.webp', role: '규칙 집행 · 경고 3번이면 강퇴',
    dmg: 34, interval: 1.05, range: 380, proj: 'warn', projSpeed: 430,
    slow: 0.35, slowSec: 1.4,
    warn: { n: 3, stun: [1.2, 1.2, 1.5, 1.5, 1.8], kb: 60, mul: 2.2 }, // 경고 3번 → 강퇴 (기절 + 밀어내기 + 큰 피해)
    attack: '경고장 — 느린 유도탄, 맞으면 느려지고 "경고"가 쌓인다. 경고 3번이면 강퇴! (기절 + 밀어내기)',
    desc: '규칙 위반자는 용서 없다. 한 방은 약하지만 경고가 쌓이면 진상을 강퇴시켜 버리는 제어 전문가.',
    perks: { 3: '강퇴 기절이 더 길다', 5: '경고장이 주변에도 퍼지며 경고를 옮긴다' },
    skill: { id: 'redcard', name: '레드카드', cd: 18, target: true, desc: '찍은 곳 진상들 60% 감속 + 피해', r: [115, 115, 135, 135, 150], slowSec: 4, dmgMul: 2.5 },
  },
  gunman: {
    id: 'gunman', bossKit: 1.45, kit: 1.0, name: '건전남', gender: 'm', emoji: '🙋‍♂️', color: '#4fd18b', attr: 'power',
    img: '/img/lb/h_gunman.webp', role: '저격수 · 최장 사거리',
    dmg: 22, interval: 0.36, range: 1400, far: { r: 610, mul: 0.6 }, proj: 'bullet', projSpeed: 1100, critBonus: 0.25, // 필드 전체가 사거리 (610 밖은 피해 -40%) · 어디든 입구에 가장 가까운 진상부터
    attack: '새총 — 옆길로 안 새고 자기 줄(세로) 위로만 똑바로, 가장 멀리 · 치명타 잘 터짐',
    desc: '건전하게, 그러나 정확하게. 정도(正道)만 걷는 남자라 새총도 자기 줄로만 똑바로 쏜다.',
    perks: { 3: '새총알이 1명 관통 · 치명타 +10%', 5: '4발마다 "헤드샷" (무조건 치명타 ×3)' },
    skill: { id: 'frenzy', name: '난사', cd: 20, desc: '3초 동안 가까운 진상들에게 폭풍 연사', sec: [3, 3, 3.5, 3.5, 4], every: 0.07 },
  },
  gunnyeo: {
    id: 'gunnyeo', bossKit: 0.8, kit: 1.0, name: '건전녀', gender: 'f', emoji: '🙋‍♀️', color: '#ff8fc0', attr: 'charm',
    img: '/img/lb/h_gunnyeo.webp', role: '범위 딜 + 랑방 회복',
    dmg: 30, interval: 1.0, range: 300, proj: 'heart', projSpeed: 1, lobSec: 0.85, splash: 36,
    heal: [[6, 0.03], [6, 0.035], [5, 0.04], [5, 0.045], [4, 0.055]], // [주기(초), 최대 내구도 대비 회복량]
    attack: '하트 폭탄 — 가까이 온 진상에게 천천히 던지는 작은 폭탄. 진짜 가치는 입구 수리 + 멤버 상태이상 풀기',
    desc: '다정한 간호사. 한 방은 약하지만 틈틈이 랑방 입구를 고치고, 고칠 때마다 멤버 한 명의 상태이상을 풀어 준다.',
    perks: { 3: '회복량·주기 강화 · 폭발 범위 +', 5: '모든 아군 홀림 면역 ("철벽!")' },
    skill: { id: 'firstaid', name: '응급처치', cd: 24, desc: '입구 내구도 회복 + 멤버 상태이상 해제', heal: [0.12, 0.12, 0.16, 0.16, 0.2] },
  },
  // ── 해금 영웅 (스테이지를 깨면 합류) ──
  myunghoon: {
    id: 'myunghoon', bossKit: 0.8, kit: 1.05, name: '서명훈', gender: 'm', emoji: '🦊', color: '#e8a25a', unlock: true, attr: 'talk',
    img: '/img/lb/h_myunghoon.webp', role: '연쇄 욕설 · 기절',
    dmg: 21, interval: 0.75, range: 330, proj: 'swear', projSpeed: 560,
    stun: [[0.22, 0.8], [0.24, 0.9], [0.27, 1.0], [0.3, 1.1], [0.34, 1.2]], // [기절 확률, 기절 시간(초)]
    bounces: [2, 2, 2, 3, 3], // 첫 적 다음에 튕기는 수 (총 3~5명)
    stunnedBonus: [1.5, 1.5, 1.5, 1.5, 2.0], // 기절한 적에게 피해 배율
    revealBonus: 2.0, // 사기꾼이 '들켰다!' 할 때 피해 배율
    attack: '욕 — 짧은 사거리, 진상 3~5명에게 번개처럼 튕기며 가끔 기절',
    desc: '실눈 뜬 티벳여우. "#@!%" 욕 한 방이면 진상이 얼어붙는다.',
    perks: { 3: '욕이 한 명 더 튕긴다', 5: '4발마다 "욕 폭탄" 범위 기절 · 기절한 적 피해 2배' },
    skill: { id: 'curse', name: '쌍욕 폭격', cd: 20, target: true, desc: '찍은 곳 진상들 기절 (들킨 사기꾼은 2배)', r: [125, 125, 140, 140, 160], stun: [1.5, 1.5, 1.8, 1.8, 2.2], dmgMul: 1.5 },
  },
  dohoon: {
    id: 'dohoon', bossKit: 0.7, kit: 0.6, name: '김도훈', gender: 'm', emoji: '🎤', color: '#b58cff', unlock: true, attr: 'booze',
    img: '/img/lb/h_dohoon.webp', role: '힐러 · 떼창 오라 · 제어',
    dmg: 51, interval: 1.35, range: [210, 210, 240, 240, 265], proj: 'wave', waveMax: 10, slow: 0.2, slowSec: 1,
    regen: [0.0065, 0.0073, 0.0091, 0.0099, 0.012], // 떼창: 초당 입구 최대 내구도의 %
    sing: { r: 200, spd: [0.18, 0.18, 0.24, 0.24, 0.3] }, // 떼창: 곁(약 3.5칸) 멤버 공격 속도 +%
    attack: '마이크 음파 — 둥글게 퍼지는 음파가 근처 진상 전부를 때리고 살짝 느리게',
    desc: '마이크를 절대 안 놓는 노래방 사나이. 떼창으로 랑방을 꾸준히 고친다.',
    perks: { 3: '음파 범위 · 떼창 강화', 5: '떼창 최대 · 앵콜이 더 길다' },
    skill: { id: 'encore', name: '무한 앵콜', cd: 22, desc: '입구 크게 회복 + 멤버 상태이상 전부 해제 + 5초 동안 멤버 전원 공격 속도 +25% · 피해 +15% + 근처 진상 춤추느라 멈춤', heal: [0.26, 0.26, 0.3, 0.3, 0.36], buffSec: 5, buffSpd: 0.25, buffDmg: 0.15, r: 250, dance: [3, 3, 3.3, 3.3, 3.8] },
  },
  ingyu: {
    id: 'ingyu', bossKit: 1.15, kit: 0.95, name: '백인규', gender: 'm', emoji: '🏋️', color: '#3f8cff', unlock: true, attr: 'power',
    img: '/img/lb/h_ingyu.webp', role: '탱커 · 덤벨 · 오토바이 돌진',
    dmg: 32, interval: 1.75, range: 420, proj: 'dumbbell', projSpeed: 1, lobSec: 0.5, splash: 34,
    moto: { every: [8, 8, 7, 7, 6], mul: 1.7, speed: 560, kb: 60, w: 30 }, // 덤벨 8번 → 자기 줄로 오토바이 돌진
    taunt: 0.35, // 근육 자랑: 멤버 노리는 기술(붙잡기·플래시·뒷담·무릎·오리고기)은 백인규가 대신 맞고 35% 시간만
    guard: { r: 50, cut: 0.15 }, // 자기 줄 진상이 입구를 칠 때 -15%
    attack: '덤벨 — 느리지만 묵직하게 던져 떨어진 곳을 쾅, 게이지가 차면 오토바이 돌진',
    desc: '3대 500 헬창. 멤버를 노리는 진상 기술은 전부 "근육 자랑"으로 받아 낸다. 꼰대 잔소리도 안 통함.',
    perks: { 3: '오토바이가 더 자주', 5: '오토바이 게이지 6번 · 덤벨 범위 +' },
    skill: { id: 'harley', name: '부릉부릉 할리', cd: 22, desc: '커다란 할리를 타고 진상이 제일 많은 쪽으로 천천히 가로지른다 — 지나가는 3칸 폭 전부 계속 따끔 + 밀고 느리게 (보스는 안 밀림)', w: 174, sec: 3.5, tick: 0.25, mul: [0.27, 0.27, 0.3, 0.3, 0.36], kb: 12, slow: 0.45 },
  },
  donghan: {
    id: 'donghan', bossKit: 0.9, kit: 1.0, name: '문동한', gender: 'm', emoji: '😪', color: '#8fb3a0', unlock: true, attr: 'charm',
    img: '/img/lb/h_donghan.webp', imgOn: '/img/lb/h_donghan_on.webp', role: '간보기 · 한 방 폭발',
    dmg: 11, interval: 1.1, range: 320, proj: 'snack', projSpeed: 420, slow: 0.2, slowSec: 1,
    meter: { base: [7.8, 8.4, 9, 9.6, 10.8], perNear: 1.4, nearY: 200, hpLow: 12 }, // 간보기 게이지 (초당)
    burst: { mul: 12, w: [36, 36, 44, 44, 54], windup: 0.8, rest: 1.2 }, // 가장 붐비는 줄에 두꺼운 빔
    attack: '과자 던지기 — 누워서 약한 과자를 휙 (살짝 느려짐). 간보기 게이지가 차면 일어나서 한 줄 전체에 빔!',
    desc: '늘 귀찮은 간보는 사람. 누워만 있다가 "이제 좀 해볼까?" 한 방이면 한 줄이 싹 비워진다.',
    perks: { 3: '게이지 빨라짐 · 빔 두꺼워짐', 5: '게이지 최대 · 빔 제일 두껍게' },
    skill: { id: 'serious', name: '진심 모드', cd: 20, desc: '간보기 게이지 바로 가득 + 다음 빔 1.5배' },
  },
  youngjun: {
    id: 'youngjun', bossKit: 1.2, kit: 0.95, name: '김영준', gender: 'm', emoji: '🐆', color: '#7a4dff', unlock: true, attr: 'booze',
    img: '/img/lb/h_youngjun.webp', imgOn: '/img/lb/h_youngjun_dash.webp', role: '근접 돌격 · 초고속 연속 베기',
    dmg: 34, interval: 0.14, range: 350, proj: 'dash', outSec: [3, 3, 3.3, 3.3, 3.6], restSec: [1.6, 1.6, 1.4, 1.4, 1.1], reach: 70,
    attack: '돌격 — 제일 몰린 곳으로 뛰어들어 초고속 연속 베기(가오 무시), 돌아와서 크로스핏',
    desc: '흑표범 같은 파티 전사. 뛰어든 동안엔 아무것도 안 통한다. 한 명씩 확실하게 끝내는 타입.',
    perks: { 3: '더 오래 싸우고 빨리 회복', 5: '제일 오래 싸우고 크로스핏 최단' },
    skill: { id: 'rush', name: '블랙 러시', cd: 20, desc: '지목한 적부터 최대 6명을 번개처럼 연속 돌파 · 큰 피해', n: [6, 6, 7, 7, 8], mul: 5 },
  },
  // ── HIDDEN ──
  eunok: {
    id: 'eunok', bossKit: 1.0, kit: 1.1, name: '최은옥', gender: 'f', emoji: '🍶', color: '#ff5a4f', hidden: true, attr: 'booze',
    img: '/img/lb/h_eunok.webp', imgRage: '/img/lb/h_eunok_rage.webp', role: 'HIDDEN · 술 마시면 분노 모드',
    dmg: 21, interval: 0.9, range: 390, proj: 'bottle', projSpeed: 1, lobSec: 0.55, splash: 55,
    soberSec: [22, 22, 20, 20, 17], rageSec: [8, 9, 10, 11, 12],
    rageDmg: 1.4, rageInterval: 0.45, fire: { sec: 2.2, r: 50, dps: 0.6 }, // 분노 중 불바다 (1발 피해 × 0.6 / 초)
    attack: '소주병 — 던지면 깨지며 범위 폭발, 분노 중엔 불바다',
    desc: '홀짝홀짝… 20초가 지나면 취해서 "분노 모드"가 된다.',
    perks: { 3: '분노 중 불바다가 더 넓고 오래', 5: '더 빨리 취하고 더 오래 분노' },
    skill: { id: 'oneshot', name: '원샷', cd: 25, desc: '바로 분노 모드! (분노 중이면 +5초)' },
  },
  hanna: {
    id: 'hanna', bossKit: 1.15, kit: 1.05, name: '이한나', gender: 'f', emoji: '😉', color: '#ff6fd8', hidden: true, attr: 'charm',
    img: '/img/lb/h_hanna.webp', role: 'HIDDEN · 하트 레이저 · 윙크 넉백',
    dmg: 33, interval: 0.7, range: 370, proj: 'beam', beamTick: 0.12, ramp: [0.5, 0.5, 0.7, 0.7, 0.9], rampMax: 2.1, kbEvery: 2.0,
    knockback: [52, 60, 68, 76, 90],
    attack: '하트 레이저 — 한 명에게 계속 쏘면 점점 세진다, 남자는 가끔 뒤로 밀림',
    desc: '"윙크 ♥" 레이저에 맞은 남자는 정신 못 차리고 뒤로 날아간다. 여자는 그냥 아프다.',
    perks: { 3: '레이저가 더 빨리 세진다', 5: '레이저 2갈래 · 남자는 잠깐 기절' },
    skill: { id: 'winkbomb', name: '윙크 폭탄', cd: 20, target: true, beam: { mul: 3.2, hw: 34, len: 900 }, desc: '찍은 곳: 남자는 날려 버리고 여자는 홀려서 멈춤', r: [130, 130, 145, 145, 165], kb: 110, stun: 1.2 },
  },
  sunggu: {
    id: 'sunggu', bossKit: 1.1, kit: 1.0, name: '강성구', gender: 'm', emoji: '👴', color: '#c9a36b', hidden: true, attr: 'power',
    img: '/img/lb/h_sunggu.webp', role: 'HIDDEN · 지팡이 무한 관통',
    dmg: 48, interval: 2.1, range: 620, proj: 'cane', projSpeed: 430, lv5Interval: 0.85, lane: 50,
    attack: '지팡이 — 자기 줄 위로 아주 길게, 그 줄 진상 전부 관통',
    desc: '"요즘 것들은…" 지팡이를 던지면 한 줄에 있는 놈들이 전부 맞는다.',
    perks: { 3: '지팡이가 부메랑처럼 돌아온다', 5: '지팡이 2개 · 공격 속도 +15%' },
    skill: { id: 'blackhole', name: '지팡이 블랙홀', cd: 22, desc: '가장 몰린 곳에 거대한 지팡이를 꽂아 소용돌이 — 2초 동안 빨아들이며 따끔따끔, 마지막에 쾅! (모아서 한 방 · 1초 기절)', r: [95, 95, 105, 105, 120], sec: 2, tick: 0.3, boom: [3.2, 3.2, 3.6, 3.6, 4.2] },
  },
  // ── 모집(뽑기)으로만 만나는 멤버 ──
  junseo: {
    id: 'junseo', bossKit: 0.8, kit: 1.05, name: '윤준서', gender: 'm', emoji: '😍', color: '#ff7fb0', gacha: true, attr: 'charm',
    img: '/img/lb/h_junseo.webp', role: '여사친 핀볼 · 밀어내기',
    dmg: 32, interval: 1.25, range: 385, proj: 'gf', projSpeed: 560, ricochet: [3, 3, 4, 4, 4], ricoR: 150, ricoDecay: 0.88, kb: [22, 22, 26, 26, 30],
    attack: '여사친 소환 — 동글동글 여사친을 진상에게 밀어 넣으면 3~4명 사이를 핀볼처럼 튕기며 밀어내고 돌아온다',
    desc: '여자라면 사족을 못 쓰는 남자. "잠깐, 내 친구 소개해 줄게!" 여사친이 대신 진상들 사이를 굴러다닌다.',
    perks: { 3: '여사친이 한 번 더 튕긴다', 5: '여사친 둘이 같이 출동' },
    skill: { id: 'blinddate', name: '소개팅 주선', cd: 20, desc: '여사친 3명을 부채꼴로 한꺼번에! (더 세게 튕긴다)', n: [3, 3, 3, 4, 4], mul: 1.6 },
    shouts: ['소개해 줄게~', '내 친구 착해!', '연락처 교환 ㄱ?'],
  },
  hyungyeong: {
    id: 'hyungyeong', bossKit: 1.0, kit: 1.0, name: '배현경', gender: 'f', emoji: '🐻', color: '#ff9f5a', gacha: true, attr: 'power',
    img: '/img/lb/h_hyungyeong.webp', imgAlt: '/img/lb/h_hyungyeong_slim.webp', role: '탱커 · 몸통 박치기 ↔ 다이어트 복서',
    dmg: 60, interval: 1.95, range: 245, proj: 'slam', slamR: [80, 80, 92, 92, 104], kb: 36, // 통통: 묵직한 박치기 (피해 +35% · 넉백 ↑)
    taunt: 0.6, guard: { r: 55, cut: 0.12 }, // 몸집으로 막는다: 멤버 노리는 기술 대신 맞기(60% 시간) · 자기 줄 입구 피해 -12%
    diet: { perSlam: [21, 21, 23, 23, 26], perSec: 4, sec: [10, 10, 11, 11, 12], dmg: 0.4, interval: 0.2, range: 330, speed: 820, charmRes: 0.3 }, // 통통할 땐 홀림 70% 짧게 · 박치기 직후엔 면역
    attack: '몸통 박치기 — 느리지만 묵직하게 쿵! 주변 진상을 밀어낸다. 게이지가 차면 다이어트 주사 → 날씬 모드 초고속 연타',
    desc: '"오늘까지만 먹고 내일부터 다이어트!" 통통할 땐 홀림도 잘 안 먹히는 벽, 주사 한 방이면 복서로 변신. 10초 뒤엔… 요요!',
    perks: { 3: '박치기 범위 + · 날씬 모드 +1초', 5: '날씬 모드 제일 길고 박치기 제일 넓게' },
    skill: { id: 'dietshot', name: '다이어트 주사', cd: 22, desc: '바로 날씬 모드! (이미 날씬하면 +4초)' },
    shouts: ['내일부터 다이어트!', '요요 왔다…', '한 입만!'],
  },
  ara: {
    id: 'ara', bossKit: 1.45, kit: 0.9, name: '고아라', gender: 'f', emoji: '👸', color: '#ffc4ec', gacha: true, attr: 'booze',
    img: '/img/lb/h_ara.webp', imgAlt: '/img/lb/h_ara_old.webp', role: '보스 킬러 · 공주 ↔ 폭삭 늙음',
    dmg: 175, interval: 1.85, range: 470, proj: 'hammer', projSpeed: 640,
    age: { princess: [13, 13, 14, 14, 16], old: [8, 8, 7, 7, 6], dmg: 0.65, slow: 1.4 },
    attack: '공주 망치 — 아주 무거운 한 방. 보스·체력 많은 진상부터 노린다 (가끔 폭삭 늙으면 힘이 반토막)',
    desc: '맑은 목소리의 공주님. 그런데 가끔 갑자기 폭삭 늙어 버린다… "아이고 허리야…" 조금 쉬면 다시 공주!',
    perks: { 3: '공주로 더 오래 · 빨리 돌아온다', 5: '망치가 떨어진 곳 주변도 쿵' },
    skill: { id: 'princess', name: '공주의 일격', cd: 22, desc: '가장 센 적에게 거대한 망치 (보스에게 특히 아픔) + 바로 공주로 돌아온다', mul: [6, 6, 7, 7, 8] },
    shouts: ['공주님 나가신다~', '아이고 허리야…', '다시 공주!'],
  },
  hochan: {
    id: 'hochan', bossKit: 1.15, kit: 1.25, name: '이호찬', gender: 'm', emoji: '👑', color: '#ffcf3f', legend: true, gacha: true, attr: 'talk',
    img: '/img/lb/h_hochan.webp', role: 'LEGEND · 랑방 방장 · 황금 파동',
    dmg: 50, interval: 2.2, range: 640, proj: 'crown', lane: 46, waveW: [40, 40, 46, 46, 52], projSpeed: 520,
    buff: { per: 0.03, max: 0.24, sec: [3, 3, 4, 4, 4] }, // 맞힌 진상 1명마다 아군 공격력 +3% (최대 +24%)
    attack: '랑방을 위하여! — 느린 박자로 자기 줄 전체를 휩쓰는 황금 파동. 맞힐 때마다 아군 공격력 ↑ · 줄 안 진상 버프 하나 벗김',
    desc: '랑방의 진짜 방장. 금빛 확성기로 "랑방을 위하여!" 외치면 한 줄이 통째로 정리되고, 멤버들은 힘이 난다. (누가 봐도 사기캐 — 1:1 대전에선 힘 ×0.7)',
    perks: { 3: '파동이 더 넓고 버프가 오래', 5: '파동이 한 번 더 울린다 (메아리)' },
    skill: { id: 'forlangbang', name: '랑방을 위하여!!', cd: 24, desc: '세 줄에 황금 파동 + 모든 멤버 공격력 +40% (5초)', sec: [5, 5, 6, 6, 7], atk: [0.4, 0.4, 0.45, 0.45, 0.5] },
    shouts: ['랑방을 위하여!', '방장 왔다!', '다들 모여!', '여긴 내가 지킨다'],
  },
  // ─── 새 멤버 4명 (모집 · 카드 10장) ───
  soyoung: {
    id: 'soyoung', bossKit: 0.95, kit: 1.05, name: '정소영', gender: 'f', emoji: '🗯️', color: '#ff8fb1', gacha: true, attr: 'talk',
    img: ART('h_soyoung'), role: '소환사 · 잔소리 게이지 → 성준영 소환',
    dmg: 30, interval: 0.95, range: 375, proj: 'nag', projSpeed: 520,
    nag: { perHit: [12, 12, 13, 13, 15], perSec: 2.5, firstSec: 10, sec: [10, 10, 12, 12, 14] }, // 잔소리 한 번에 게이지 +% · 성준영이 버티는 시간
    attack: '잔소리 말풍선 — 맞힐 때마다 "잔소리 게이지"가 차고, 가득 차면 성준영을 불러낸다',
    desc: '"그러니까 내가 뭐랬어!" 잔소리가 쌓이면 어디선가 성준영이 끌려 나온다. 둘이 같이 있으면 진상들이 더 괴롭다.',
    perks: { 3: '성준영이 더 오래 머문다', 5: '칩·카드 피해 ↑ · 더 오래' },
    skill: { id: 'allincall', name: '올인 콜! 준영 등판', cd: 21, desc: '성준영이 나와서 정해진 시간 동안 칩·카드를 던진다 — 맞은 진상은 한곳으로 끌려와 뭉친다 (범위 공격 멤버와 찰떡)', sec: [8, 8, 9, 9, 10] },
    shouts: ['그러니까 내가 뭐랬어!', '준영아 나와!', '한 번만 더 말한다?'],
  },
  jieun: {
    id: 'jieun', bossKit: 1.0, kit: 1.05, name: '오지은', gender: 'f', emoji: '🕰️', color: '#b48cff', gacha: true, attr: 'charm',
    img: ART('h_jieun'), imgAlt: ART('h_jieun_demon'), role: '시간 · 감속 전문 · 공격할 땐 악마 모드',
    dmg: 55, interval: 1.02, range: 405, proj: 'tick', projSpeed: 560, slow: 0.35, slowSec: 1.6,
    demon: { sec: 0.55 }, // 공격하는 순간 무서운 모습으로
    attack: '째깍 시계침 — 맞은 진상은 느려진다. 공격하는 순간 순한 얼굴이 악마로…',
    desc: '보브컷의 순한 막내. 그런데 공격만 하면 눈빛이 변한다. "…시간아 멈춰라."',
    perks: { 3: '감속이 더 길게', 5: '시간 정지가 더 넓고 길게' },
    skill: { id: 'timestop', name: '시간 정지', cd: 23, desc: '넓은 범위 진상을 크게 느리게 (보스는 조금만) · 그동안 악마 모드', target: true, r: [200, 200, 220, 220, 250], sec: [4, 4, 4.5, 4.5, 5.5], slow: 0.35 },
    shouts: ['시간아 멈춰라…', '헤헤♡', '…도망 못 가.'],
  },
  sanghwa: {
    id: 'sanghwa', bossKit: 1.05, kit: 1.0, name: '박상화', gender: 'm', emoji: '😊', color: '#ffc36b', gacha: true, attr: 'power',
    img: ART('h_sanghwa'), role: '성장 · 경제 · 판이 길수록 강해진다',
    dmg: 38, interval: 1.08, range: 415, proj: 'rose', projSpeed: 620,
    grow: { perWave: 0.05, perKill: 0.002, max: 0.45, exp: 0.5, coin: 0.12 }, // 웨이브마다 +5% · 처치마다 +0.2% (최대 +45%) · 잡은 진상 경험치 +50% · 클리어 코인 +12%
    attack: '매너 장미 — 똑바로 날아가 콕. 판이 길어질수록 점점 세지고, 잡은 진상은 경험치를 더 준다',
    desc: '앞머리 살짝 가르마 펌, 작은 눈에 예쁜 미소. 오래 있을수록 점점 더 멋있어지는 남자. 클리어 코인 +12%.',
    perks: { 3: '성장 한도 +10%', 5: '경험치 보너스 +25%' },
    skill: { id: 'goodman', name: '좋은남자 박상화!', cd: 20, desc: '모든 멤버 공격력 +25% (5초) + 성장 게이지 한 번에 +10%', sec: [5, 5, 6, 6, 7], atk: [0.25, 0.25, 0.3, 0.3, 0.35] },
    lines: ['좋은남자 박상화!', '끝내주는남자 박상화!', '매너남 박상화!', '다정한남자 박상화!', '능력남 박상화!', '센스쟁이 박상화!', '완벽한남자 박상화!'],
    shouts: ['좋은남자 박상화!', '끝내주는남자 박상화!'],
  },
  jungmin: {
    id: 'jungmin', bossKit: 0.8, kit: 0.9, name: '홍정민', gender: 'm', emoji: '🩹', color: '#7fd88f', gacha: true, attr: 'booze',
    img: ART('h_jungmin'), role: '수리공 · 붕대로 입구 고치기',
    dmg: 24, interval: 1.2, range: 265, proj: 'tap', projSpeed: 480,
    repair: { every: 3.0, pct: [0.028, 0.028, 0.032, 0.032, 0.04] }, // 3.2초마다 입구 최대 내구도의 % 수리
    attack: '거꾸로 든 소주병 — 약하게 툭. 대신 틈틈이 붕대를 떼어 입구에 탁탁 붙인다',
    desc: '짧은 머리, 험한 눈매, 눈가에 소주병 흉터와 붕대. 무섭게 생겼는데 제일 먼저 입구를 고친다.',
    perks: { 3: '수리량 +20%', 5: '수리할 때 멤버 상태이상도 하나 풀기' },
    skill: { id: 'bandage', name: '붕대 대공사', cd: 24, desc: '입구 크게 수리 + 잠깐 입구가 받는 피해 -35%', heal: [0.16, 0.16, 0.19, 0.19, 0.23], sec: [6, 6, 7, 7, 8], armor: 0.35 },
    shouts: ['가만있어 봐, 붙여 줄게.', '이 정도는 금방이지.', '어디 또 깨졌냐?'],
  },
  jiwon: {
    id: 'jiwon', bossKit: 1.1, kit: 1.0, name: '여지원', gender: 'f', emoji: '🖕', color: '#e0304a', gacha: true, attr: 'talk',
    img: '/img/lb/h_jiwon.webp', role: '방깎 · 모자이크 뻑큐',
    dmg: 31, interval: 0.83, range: 365, proj: 'mosaic', projSpeed: 560,
    shred: { per: 0.06, max: 5, sec: 5 }, // 맞은 진상 방어 -6% × 최대 5겹 (5초) → 다른 멤버 피해도 같이 오른다 · 회복도 막는다
    attack: '모자이크 뻑큐 — 날아가는 모자이크 손, 맞은 진상 방어가 겹겹이 깎인다',
    desc: '착해 보이는 얼굴, 하지만 속엔 당찬 욕망이 가득. 오늘도 웃으며 모자이크 뻑큐를 날린다. "어머, 실수~"',
    perks: { 3: '방깎 +1겹 (최대 6)', 5: '방깎 한 겹 -8%' },
    skill: { id: 'fuckall', name: '단체 뻑큐', cd: 20, desc: '앞쪽 부채꼴에 모자이크 손 폭격 — 맞은 진상 전부 방깎 최대 · 회복 막기 6초', r: [230, 230, 250, 250, 280], half: 0.6, mul: [1.4, 1.4, 1.6, 1.6, 1.9], sec: 6 },
  },
  wonsik: {
    id: 'wonsik', bossKit: 0.8, kit: 0.9, name: '정원식', gender: 'm', emoji: '🏋️', color: '#6fae6f', gacha: true, attr: 'power',
    img: '/img/lb/h_wonsik.webp', role: '도발 탱커 · 피해 감소',
    dmg: 44, interval: 1.23, range: 255, proj: 'jab', projSpeed: 700,
    taunt: 0.4, // 도발: 멤버를 노리는 진상 기술을 대신 받는다 (40% 시간)
    guard: { r: 110, cut: 0.3 }, // 곁의 진상이 입구를 칠 때 -30%
    attack: '헬스 잽 — 가까운 진상을 묵직하게 · 곁의 진상 공격을 대신 받아 준다',
    desc: '결혼을 꿈꾸는 마흔셋. 유일한 취미는 헬스. 따뜻한 마음으로 모두를 지켜 준다. "올해는 꼭…"',
    perks: { 3: '피해 감소 반경 +20%', 5: '결혼정보회사 등록이 1초 더' },
    skill: { id: 'marry', name: '결혼정보회사 등록', cd: 22, desc: '넓은 반경 진상 4초 동안 원식만 바라본다 (입구 피해 -80% · 느려짐) + 입구 보호막', r: [260, 260, 280, 280, 300], sec: [4, 4, 4, 4, 5], shield: 0.1 },
  },
};
// 소환 멤버 (덱 · 모집 · 도감 목록에는 없다): 정소영이 부르는 성준영
export const SUMMONS = {
  junyoung: {
    id: 'junyoung', summon: true, bossKit: 1, kit: 1, name: '성준영', gender: 'm', emoji: '🃏', color: '#9fd4ff', attr: 'talk',
    img: ART('h_junyoung'), role: '소환 · 홀덤 칩과 카드 던지기',
    dmg: 20, chipDmg: 28, interval: 0.55, range: 380, proj: 'chip', projSpeed: 600, // 칩 한 번 = 고정 피해 (강화·레벨 조금) · 끌어당기기가 본업
    allin: { r: 90, mul: 5 }, // 쓰러질 때 "올인!" 작은 폭발 (피해 = 한 발 × 5)
    attack: '홀덤 칩 · 카드 — 빠르게 휙휙 던진다. 사라질 때 "올인!"',
    desc: '비실비실해 보이지만 칩 던지는 손목은 프로. 소영이 부르면 어쩔 수 없이 나온다.',
    perks: { 3: '-', 5: '-' },
    shouts: ['올인!', '콜!', '레이즈!', '아 왜 또 불러…'],
  },
};
// ─── 멤버 등급(티어): 늦게 만나는 멤버일수록 기본이 세다 · 초반 멤버는 강화 한도가 낮다 ───
// (최대 강화 T1 < 중간 강화 T3 — 초반 멤버는 초반과 시너지로 쓰고, 뒤로 갈수록 새 멤버로 바꿔 가게)
export const HERO_TIER = {
  bangjang: 1, staff: 1, gunman: 1, gunnyeo: 1,
  dohoon: 2, myunghoon: 2, eunok: 2, ingyu: 2,
  hanna: 3, donghan: 3, sunggu: 3, youngjun: 3,
  junseo: 4, hyungyeong: 4, ara: 4,
  hochan: 5,
  soyoung: 3, jieun: 3, sanghwa: 2, jungmin: 2, junyoung: 3, jiwon: 3, wonsik: 3,
};
// 티어: 늦게 만나는 멤버일수록 기본이 세고(공격력 · 공격 속도) 성장은 완만 — 초반 멤버는 성장형
//  강화 0: T4 ≈ T1 × 1.6 · 강화 최대(20): T1 ≈ T4 × 0.85
export const TIER_MUL = [1, 1, 1.154, 1.308, 1.455, 1.652]; // 기본 공격력 배율
export const TIER_SPD = [1, 1, 1.04, 1.07, 1.1, 1.12]; // 기본 공격 속도 배율
export const TIER_GROWTH = [0.08, 0.086, 0.07, 0.059, 0.05, 0.045]; // 강화 1레벨당 공격력
export const TIER_MAX = [20, 20, 20, 20, 20, 20]; // 영구 강화 한도
export const RES_PER_META = 0.015, RES_MAX = 0.35; // 영구 강화 1레벨 = 상태이상(기절 · 홀림 · 감속 등) 시간 -1.5% (장비와 합쳐 최대 -35%)
export const resOf = (meta, gearRes) => Math.min(RES_MAX, (meta || 0) * RES_PER_META + (gearRes || 0));
export const tierPower = (t, meta) => TIER_MUL[t] * TIER_SPD[t] * (1 + TIER_GROWTH[t] * meta);
export const TIER_NAME = ['', 'T1', 'T2', 'T3', 'T4', 'LEGEND'];
export const heroTier = (id) => HERO_TIER[id] || 1;
export const metaMaxOf = (id) => TIER_MAX[heroTier(id)];
export const BASE_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
export const UNLOCK_HEROES = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun']; // 스테이지를 깨면 합류하는 일반 영웅
export const HIDDEN_HEROES = ['eunok', 'hanna', 'sunggu'];
export const GACHA_HEROES = ['junseo', 'hyungyeong', 'ara', 'soyoung', 'jieun', 'sanghwa', 'jungmin', 'jiwon', 'wonsik']; // 모집(뽑기) 영웅 등급
export const LEGEND_HEROES = ['hochan']; // 모집 전설 (마지막 스테이지를 깨야 모집에 나온다)
export const LOCKED_HEROES = [...UNLOCK_HEROES, ...HIDDEN_HEROES, ...GACHA_HEROES, ...LEGEND_HEROES]; // 해금이 필요한 영웅 전부
// 같이 출전하는 동료 수: 1챕터 1명, 1-10 을 깨면(2챕터부터) 2명
export const partnerSlots = (maxStage) => (maxStage >= 10 ? 2 : 1);
export const STARTER_PARTNERS = ['gunman', 'staff', 'gunnyeo']; // 방장 + 이 중 1명으로 시작

// ─── 적 ───────────────────────────────────────────────
// gender 는 이한나 윙크 판정용, charm 은 홀리는 영웅 성별
export const ENEMIES = {
  yeokko: {
    id: 'yeokko', cls: 'seduce', name: '여꼬충', gender: 'm', emoji: '😏', color: '#7d8cff',
    img: '/img/lb/e_yeokko.webp', hp: 22, speed: 52, atk: 3, atkInterval: 1.2,
    exp: 2, coin: 1, r: 16, size: 68, charm: 'f',
    shouts: ['번호 좀…', 'MBTI 뭐예요?', '오빠 차 있어~', '혹시 혼자 왔어요?'],
  },
  namkko: {
    id: 'namkko', cls: 'seduce', name: '남꼬충', gender: 'f', emoji: '💅', color: '#ff7eb6',
    img: '/img/lb/e_namkko.webp', hp: 22, speed: 52, atk: 3, atkInterval: 1.2,
    exp: 2, coin: 1, r: 16, size: 68, charm: 'm',
    shouts: ['오빠~ 한 잔 사줘', '나 원래 이런 애 아닌데', '인스타 뭐야?', '어머 키 몇이에요?'],
  },
  drunk: {
    id: 'drunk', cls: 'jerk', name: '술진상', gender: 'm', emoji: '😵', color: '#e0a340',
    img: '/img/lb/e_drunk.webp', hp: 52, speed: 34, atk: 7, atkInterval: 1.1,
    exp: 3, coin: 2, r: 18, size: 72, zigzag: 38,
    explode: { r: 62, dmg: 26 }, // 죽으면 술병이 깨지며 주변 적에게 피해 (웨이브마다 +8%)
    shouts: ['한 잔만 더~', '내가 누군지 알아?!', '딸꾹!', '이 집 사장 나와!'],
  },
  thug: {
    id: 'thug', cls: 'violent', name: '폭력배', gender: 'm', emoji: '😠', color: '#9a6c5a',
    img: '/img/lb/e_thug.webp', hp: 150, speed: 23, atk: 16, atkInterval: 1.4,
    armor: 6, exp: 6, coin: 4, r: 21, size: 82,
    shouts: ['뭘 봐?', '너 몇 살이야', '밖으로 나와', '형님 오신다'],
  },
  mukti: {
    id: 'mukti', cls: 'jerk', name: '먹튀인간', gender: 'm', emoji: '🏃', color: '#8fe3ff',
    img: '/img/lb/e_mukti.webp', hp: 13, speed: 120, atk: 1, atkInterval: 1,
    exp: 2, coin: 3, r: 14, size: 64, steal: { base: 3, perLevel: 0.45 }, // 로프에 닿으면 경험치를 훔쳐 도망 (잡으면 되찾는다)
    shouts: ['튀어!', '계산은 다음에~', '카드 한도 초과ㅋ', '화장실 좀…'],
  },
  queen: {
    id: 'queen', cls: 'seduce', name: '여왕벌', gender: 'f', emoji: '👑', color: '#ffcc33', boss: true,
    img: '/img/lb/e_queen.webp', hp: 1250, speed: 12, atk: 26, atkInterval: 1.5,
    exp: 40, coin: 60, r: 40, size: 138,
    summon: { every: 7, count: 3, types: ['yeokko', 'namkko'] },
    shieldAura: { every: 9, r: 160, frac: 0.35 }, // 주변 졸개에게 최대 체력 35% 보호막
    title: '여왕벌 등장!', subtitle: '"내 애들 건드리면 가만 안 둬~"',
    shouts: ['내 애들아, 가!', '여기 물 흐리네~', '다들 내 편이지?'],
  },
  boss_thug: {
    id: 'boss_thug', cls: 'violent', name: '폭력배 두목', gender: 'm', emoji: '👊', color: '#b0413e', boss: true,
    img: '/img/lb/e_boss_thug.webp', hp: 1300, speed: 16, atk: 30, atkInterval: 2.0,
    armor: 5, exp: 40, coin: 60, r: 42, size: 142,
    slam: { every: 7, windup: 0.8, stun: 1.2 }, // 땅 내려치기: 영웅 전원 기절
    title: '폭력배 두목 등장!', subtitle: '"여기 사장 누구야?!"',
    shouts: ['다 나와!', '여기 사장 누구야?!', '형님 화났다'],
  },
  // ── 골목 빌런들 (식물 vs 좀비처럼 하나씩 다른 기술) ──
  vomit: {
    id: 'vomit', cls: 'jerk', name: '토하는 인간', gender: 'm', emoji: '🤮', color: '#9acd32',
    img: '/img/lb/e_vomit.webp', hp: 60, speed: 32, atk: 6, atkInterval: 1.3, exp: 4, r: 17, size: 72,
    puke: { every: 6, reach: 200, r: 52, sec: 4, cut: 0.3 }, // "우웩!" 멤버 발밑에 토 → 그 위 멤버 공격 속도 -30%
    deathPuddle: { r: 58, sec: 5, speed: 1.4 }, // 죽으면 토 웅덩이 → 지나가는 진상 40% 빨라짐 (멀리서 잡자)
    shouts: ['우웩!', '속이 안 좋아…', '한 잔만 더… 우웩', '화장실 어디야'],
  },
  couple: {
    id: 'couple', cls: 'seduce', name: '애정행각 빌런', gender: 'm', emoji: '💑', color: '#ff7fa8',
    img: '/img/lb/e_couple.webp', hp: 110, speed: 28, atk: 7, atkInterval: 1.3, exp: 6, r: 22, size: 96, wide: true,
    cuddle: { idle: 1.6, regen: 0.05 }, // 1.6초 안 맞으면 초당 5% 회복 ("꽁냥꽁냥")
    breakup: { at: 0.5, hp: 0.3, speed: 1.6 }, // 체력 50% 아래면 "헤어져!" → 빠른 솔로 둘로
    charmImmune: true, // 이한나 윙크(넉백·홀림)가 안 통한다
    shouts: ['꽁냥꽁냥~', '자기야♡', '우리만 보여', '헤어져!'],
  },
  // ── 특성 진상 (덱을 골라야 이긴다) ──
  earphone: {
    id: 'earphone', cls: 'jerk', name: '노캔 이어폰녀', gender: 'f', emoji: '🎧', color: '#9fd4ff',
    img: '/img/lb/e_earphone.webp', hp: 60, speed: 40, atk: 4, atkInterval: 1.2, exp: 5, r: 17, size: 74,
    traits: { aoeImmune: 1 }, // 노이즈 캔슬링: 범위 공격이 안 들린다 — 단일 공격만
    shouts: ['(안 들림)', '네? 뭐라고요?', '…🎶', '지금 노래 듣는 중'],
  },
  noshow: {
    id: 'noshow', cls: 'seduce', name: '당일약속취소 빌런', gender: 'f', emoji: '📱', color: '#c9a8ff',
    img: '/img/lb/e_noshow.webp', hp: 48, speed: 46, atk: 3, atkInterval: 1.2, exp: 5, r: 16, size: 72,
    traits: { stealth: 1 }, stealth: { reveal: 120 }, // 은신: 입구 2칸 앞까지 안 보인다 (운영진 · 건전남은 먼저 찾아냄)
    steal: { base: 3, perLevel: 0.6 }, // 입구에 닿으면 "약속 취소~" 하고 경험치를 조금 들고 나간다
    shouts: ['오늘 약속 취소할게요~', '갑자기 일이 생겨서…', '다음에 봐요!', '(읽씹)'],
  },
  clubguy: {
    id: 'clubguy', cls: 'seduce', name: '클럽남', gender: 'm', emoji: '🕺', color: '#7df9ff',
    img: '/img/lb/e_clubguy.webp', hp: 70, speed: 42, atk: 5, atkInterval: 1.2, exp: 5, r: 17, size: 76,
    traits: { split: 1 }, splitInto: { type: 'clubgirl', n: 1 }, // 분열: 쓰러지면 데려온 클럽녀가 튀어나온다
    shouts: ['오늘 물 좋다~', '같이 놀자!', 'DJ 형 한 곡 더!', '여기 테이블 잡았어'],
  },
  clubgirl: {
    id: 'clubgirl', cls: 'seduce', name: '클럽녀', gender: 'f', emoji: '💃', color: '#ff9fe6',
    img: '/img/lb/e_clubgirl.webp', hp: 26, speed: 70, atk: 3, atkInterval: 1.0, exp: 2, r: 14, size: 62,
    shouts: ['나 먼저 간다~', '택시!', '어디 가?'],
  },
  praise1: {
    id: 'praise1', cls: 'politic', name: '언니 너무 이뻐요 빌런', gender: 'f', emoji: '🥰', color: '#ffb3d9',
    img: '/img/lb/e_praise1.webp', hp: 55, speed: 34, atk: 3, atkInterval: 1.3, exp: 6, r: 16, size: 72,
    traits: { heal: 1 }, praise: { every: 3, r: 95, heal: 0.08, haste: 2.5, pair: 'praise2', rageAtk: 1.6, rageSpd: 1.3 },
    shouts: ['언니 너무 이뻐요~', '언제 밥 한번 먹어요~', '피부 뭐 써요?', '(속으로: 별로인데)'],
  },
  praise2: {
    id: 'praise2', cls: 'politic', name: '언니 너무 이뻐요 빌런', gender: 'f', emoji: '😊', color: '#ffc8a8',
    img: '/img/lb/e_praise2.webp', hp: 55, speed: 34, atk: 3, atkInterval: 1.3, exp: 6, r: 16, size: 72,
    traits: { heal: 1 }, praise: { every: 3, r: 95, heal: 0.08, haste: 2.5, pair: 'praise1', rageAtk: 1.6, rageSpd: 1.3 },
    shouts: ['언니 진짜 동안이다~', '어머 어머~', '우리 친해지자~', '(속으로: 흥)'],
  },
  handsy: {
    id: 'handsy', cls: 'jerk', name: '손진상', gender: 'm', emoji: '🙌', color: '#e8b27a',
    img: '/img/lb/e_handsy.webp', hp: 70, speed: 38, atk: 3, atkInterval: 1.2, exp: 5, r: 17, size: 76,
    grab: { sec: 4, cd: 6 }, // 로프에 닿으면 팔을 쭉 뻗어 멤버를 붙잡는다 (못 쏨) — 잡으면 풀린다
    shouts: ['잠깐만~', '어디 가?', '손 좀 잡자', '안 놔줄 거야'],
  },
  gao: {
    id: 'gao', cls: 'violent', name: '가오충', gender: 'm', emoji: '😎', color: '#e8c33a',
    img: '/img/lb/e_gao.webp', hp: 140, speed: 26, atk: 12, atkInterval: 1.4, armor: 4, exp: 7, r: 20, size: 82,
    traits: { kbImmune: 1 }, gao: { cut: 0.6, broken: 1.3, flexR: 110, flexSpd: 1.15 }, // 가오 중엔 피해 -60% · 말빨 공격이나 치명타로 "가오 깨짐!" → 피해 +30%
    shouts: ['내가 누군지 알아?', '가오 떨어지게', '폼 미쳤다', '어깨 봐라'],
  },
  selfie: {
    id: 'selfie', cls: 'seduce', name: '셀카 인플루언서', gender: 'f', emoji: '🤳', color: '#ff9ecb',
    img: '/img/lb/e_selfie.webp', hp: 32, speed: 44, atk: 3, atkInterval: 1.4, exp: 4, r: 15, size: 70, standoff: 190,
    flash: { every: 5, sec: 2.5, miss: 0.5 }, // 찰칵! 멤버 한 명 눈부심 → 2.5초 동안 절반은 빗나감
    shouts: ['찰칵!', '좋아요 눌러줘~', '각도 좋다', '라이브 켰어요'],
  },
  cutter: {
    id: 'cutter', cls: 'jerk', name: '새치기꾼', gender: 'm', emoji: '🐰', color: '#6fd0ff',
    img: '/img/lb/e_cutter.webp', hp: 40, speed: 70, atk: 5, atkInterval: 1.2, exp: 4, r: 15, size: 70,
    vault: { at: 250, dist: 120, sec: 0.5 }, // 앞줄 근처에서 한 번 훌쩍 뛰어넘는다
    shouts: ['잠깐 새치기~', '제가 먼저요!', '번호표 있어요', '급해서요'],
  },
  kkondae: {
    id: 'kkondae', cls: 'politic', name: '꼰대', gender: 'm', emoji: '👴', color: '#8a7a6a',
    img: '/img/lb/e_kkondae.webp', hp: 320, speed: 12, atk: 14, atkInterval: 1.8, armor: 5, exp: 12, r: 22, size: 86,
    latte: { r: 220, slow: 0.4, off: 3 }, // "라떼는 말이야~" 근처 멤버 공격 간격 +40% · 기절시키면 3초 조용
    shouts: ['라떼는 말이야~', '요즘 애들은…', '내가 해 봐서 아는데', '나 때는 안 그랬어'],
  },
  spam: {
    id: 'spam', cls: 'politic', name: '단톡방 빌런', gender: 'f', emoji: '📱', color: '#ff4b5c',
    img: '/img/lb/e_spam.webp', hp: 50, speed: 34, atk: 4, atkInterval: 1.3, exp: 5, r: 16, size: 72,
    spam: { every: 7, burst: 3, type: 'spam_dot' }, // 가끔 "카톡!" 알림 하나 · 죽으면 알림 3개가 튀어나와 돌진
    shouts: ['카톡!', '단톡방 공지 확인!', '읽씹하지 마', '@전체 확인요'],
  },
  spam_dot: {
    id: 'spam_dot', cls: 'politic', name: '알림', gender: 'f', emoji: '🔴', color: '#ff2d45', dot: true,
    img: '', hp: 9, speed: 95, atk: 2, atkInterval: 1, exp: 0.5, r: 10, size: 36,
    shouts: ['카톡!', '딩동!', '1'],
  },
  // ── 인피: 라이벌 모임 멤버들 (2챕터부터) ──
  inpi_gossip: {
    id: 'inpi_gossip', cls: 'politic', name: '인피 뒷담러', gender: 'f', emoji: '🗣️', color: '#a58bff', inpi: true,
    img: '/img/lb/e_inpi_gossip.webp', hp: 38, speed: 40, atk: 4, atkInterval: 1.3,
    exp: 4, r: 16, size: 70, standoff: 165, // 로프에서 이만큼 떨어져 멈추고 뒷담화를 던진다
    rumor: { every: 4.2, sec: 3, cut: 0.3, fly: 0.7 }, // 맞은 영웅 3초 동안 공격 속도 -30%
    shouts: ['수군수군…', '걔 그렇대~', '너만 알고 있어', '단톡방 캡처 떴어'],
  },
  inpi_dictator: {
    id: 'inpi_dictator', cls: 'politic', name: '인피 독재자', gender: 'm', emoji: '😤', color: '#d0453a', inpi: true,
    img: '/img/lb/e_inpi_dictator.webp', hp: 120, speed: 22, atk: 10, atkInterval: 1.5,
    armor: 3, exp: 7, r: 20, size: 80,
    aura: { r: 130, cut: 0.3, kb: 0.3, speed: 1.3 }, // 주변 진상: 받는 피해 -30%, 넉백 30%만, 이동 속도 +30%
    shouts: ['앞으로 가!', '내 말이 곧 법이다', '반대하면 강퇴', '모임장은 나야!'],
  },
  inpi_clique: {
    id: 'inpi_clique', cls: 'politic', name: '인피 패거리', gender: 'm', emoji: '👥', color: '#6fbf73', inpi: true,
    img: '/img/lb/e_inpi_clique.webp', hp: 30, speed: 44, atk: 4, atkInterval: 1.2,
    exp: 2, r: 15, size: 64,
    pack: { min: 3, max: 5, r: 54, cut: 0.12, maxCut: 0.48 }, // 3~5명씩. 붙어 있는 동료 1명마다 받는 피해 -12% (범위·관통 공격은 무시)
    shouts: ['우리끼리 가자', '끼리끼리~', '쟤 뭐야?', '우린 한 팀이야'],
  },
  scammer: {
    id: 'scammer', cls: 'seduce', name: '가입인사 사기꾼', gender: 'f', emoji: '💋', color: '#ff9ecb',
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
    id: 'boss_gapjil', cls: 'violent', name: '인피 행동대장', gender: 'm', emoji: '😤', color: '#7a3cff', boss: true, inpi: true,
    img: '/img/lb/e_boss_gapjil.webp', hp: 1350, speed: 14, atk: 28, atkInterval: 1.8,
    armor: 4, exp: 40, r: 42, size: 140,
    kneel: { every: 6.5, stun: 2 }, // "무릎 꿇어!" 멤버 1명 2초 기절
    summon: { every: 9, count: 4, types: ['inpi_clique'] },
    title: '인피 행동대장 등장!', subtitle: '"다들 무릎 꿇어!"',
    shouts: ['무릎 꿇어!', '여기 서열 정리한다', '인피 무시하냐?'],
  },
  boss_inpi: {
    id: 'boss_inpi', cls: 'politic', name: '인피 대장', gender: 'm', emoji: '🦆', color: '#2f9e6a', boss: true, inpi: true,
    img: '/img/lb/e_boss_inpi.webp', hp: 1650, speed: 11, atk: 32, atkInterval: 1.8,
    armor: 4, exp: 50, r: 44, size: 146,
    duck: { every: 3.4, stun: 1.1, fly: 0.8 }, // 오리고기 투척: 맞은 멤버 기절
    feast: { every: 10, r: 190, heal: 0.25 }, // "오리고기 회식!" 주변 진상 체력 25% 회복
    title: '인피 대장 등장!', subtitle: '"오리고기 먹고 가~"',
    shouts: ['오리고기 회식이다!', '우리 모임이 최고지', '랑방? 그게 뭔데'],
  },
  // ── 1챕터 전용 보스 ──
  boss_loan: {
    id: 'boss_loan', cls: 'violent', name: '골목 사채업자', gender: 'm', emoji: '💸', color: '#c9a227', boss: true,
    img: '/img/lb/e_boss_loan.webp', hp: 1150, speed: 14, atk: 20, atkInterval: 1.8,
    armor: 3, exp: 40, r: 42, size: 140,
    // "이자 붙었다!" 살아 있는 동안 입구 내구도를 % 로 떼어 간다 (점점 비싸짐). 잡으면 떼어 간 것의 60% 를 돌려받는다 (빚 탕감!)
    interest: { every: 6, frac: 0.02, grow: 0.005, max: 0.04, refund: 0.6 },
    paper: { every: 4.5, sec: 2.5, cut: 0.35, fly: 0.7 }, // 차용증 투척: 맞은 멤버 2.5초 동안 공격 속도 -35%
    title: '골목 사채업자 등장!', subtitle: '"이자는 매일매일 붙는다~"',
    shouts: ['이자 붙었다!', '갚을 때까지 안 간다', '여기 도장 찍어', '원금은 언제 갚을래?'],
  },
  // ── 인피 총무 (3챕터 · 2-8 가끔): 뒤에서 회비로 보호막 ──
  inpi_treasurer: {
    id: 'inpi_treasurer', cls: 'politic', name: '인피 총무', gender: 'f', emoji: '💰', color: '#e0b84a', inpi: true,
    img: '/img/lb/e_inpi_treasurer.webp', hp: 30, speed: 34, atk: 3, atkInterval: 1.4,
    exp: 5, r: 15, size: 66, standoff: 230,
    shieldAura: { every: 6, r: 150, frac: 0.25, first: 2 }, // "회비 지원!" 주변 진상에게 최대 체력 30% 보호막
    shouts: ['회비 지원!', '영수증 챙겨~', '이번 달 회비 걷는다', '총무는 나야'],
  },
  // ── 4~6장: 여행 · MT · 연말 파티 ──
  fakesingle: {
    id: 'fakesingle', cls: 'seduce', name: '미혼인 척 돌싱남', gender: 'm', emoji: '🕶️', color: '#8fb3ff',
    img: '/img/lb/e_fakesingle.webp', hp: 60, speed: 46, atk: 6, atkInterval: 1.2, exp: 4, r: 17, size: 76, charm: 'f',
    fake: { at: 0.45, evade: 0.3, speed: 1.6 }, // "저 싱글이에요~" 잘 피하다가, 중간쯤 "사실 돌싱!" 들키면 막 뛴다
    shouts: ['저 싱글이에요~', '연락처 교환?', '반지 자국은… 그냥 점', '사실은…'],
  },
  secretmom: {
    id: 'secretmom', cls: 'politic', name: '속이고 들어온 싱글맘', gender: 'f', emoji: '🕶️', color: '#ff9ecb',
    img: '/img/lb/e_secretmom.webp', hp: 70, speed: 36, atk: 7, atkInterval: 1.3, exp: 5, r: 18, size: 78,
    lie: { frac: 0.6, stun: 1.5, weak: 3, summon: 'namkko', n: 2 }, // 거짓말 방패(접힌 유모차) — 깨지면 "들켰다!" 기절 · 친구 소환
    shouts: ['저 스무 살이에요~', '유모차? 짐이에요', '프로필 사진 제 거예요', '비밀이에요♡'],
  },
  carpoor: {
    id: 'carpoor', cls: 'violent', name: '카푸어', gender: 'm', emoji: '🏎️', color: '#ff6a3a',
    img: '/img/lb/e_carpoor.webp', hp: 80, speed: 40, atk: 9, atkInterval: 1.3, armor: 2, exp: 5, r: 19, size: 84,
    dash: { until: 0.5, mul: 2.8, stall: 2.6, weak: 1.3, after: 0.55 }, // 외제차로 부아앙 → 퍼졌다! (멈춤·약점) → 터덜터덜
    shouts: ['부아아앙~', '할부 60개월!', '기름값이…', '차 퍼졌다!'],
  },
  sales: {
    id: 'sales', cls: 'politic', name: '영업쟁이', gender: 'm', emoji: '💼', color: '#ffd23f',
    img: '/img/lb/e_sales.webp', hp: 65, speed: 34, atk: 5, atkInterval: 1.3, exp: 5, r: 17, size: 76,
    insurance: { every: 7, n: 3, frac: 0.2, r: 160, haste: 3 }, // "보험 드세요!" 주변 3명 보호막 + 다단계 가속
    shouts: ['보험 하나 드세요!', '이거 진짜 좋아요', '친구 소개하면 할인!', '다단계 아니에요~'],
  },
  sarcasm: {
    id: 'sarcasm', cls: 'politic', name: '돌려까기 장인', gender: 'f', emoji: '🪃', color: '#b58cff',
    img: '/img/lb/e_sarcasm.webp', hp: 45, speed: 40, atk: 4, atkInterval: 1.3, exp: 5, r: 16, size: 72, standoff: 175,
    sarcasm: { every: 4.8, sec: 3, cut: 0.25, fly: 0.7, reflect: 0.3 }, // 돌려까기 부메랑: 맞은 멤버 피해 -25% · 말빨 멤버는 되받아친다!
    shouts: ['어머 옷 예쁘다~ 어디서 샀어?', '너 참 부지런하다~', '역시 대단해~ (진심 아님)'],
  },
  jjijil: {
    id: 'jjijil', cls: 'seduce', name: '찌질남', gender: 'm', emoji: '😢', color: '#9aa0b8',
    img: '/img/lb/e_jjijil.webp', hp: 55, speed: 46, atk: 3, atkInterval: 1.2, exp: 5, r: 16, size: 72,
    cling: { cut: 0.4 }, // 로프에 닿으면 멤버에게 착 달라붙는다 → 그 멤버 공격력 -40% (잡으면 떨어진다)
    shouts: ['나랑 얘기 좀 해', '왜 답장 안 해?', '우리 다시 시작해', '진짜 마지막이야'],
  },
  otaku: {
    id: 'otaku', cls: 'jerk', name: '오타쿠', gender: 'm', emoji: '🎮', color: '#6fbf73',
    img: '/img/lb/e_otaku.webp', hp: 90, speed: 30, atk: 6, atkInterval: 1.4, exp: 6, r: 19, size: 82,
    figures: { every: 8, n: 2, type: 'otaku_fig' }, goods: { cut: 0.5 }, // 피규어 소환 · 피규어가 있으면 굿즈 보호막(피해 -50%)
    shouts: ['내 최애 건드리지 마!', '한정판이야!', '굿즈 사러 왔는데요', '오타쿠 아니고 덕후'],
  },
  otaku_fig: {
    id: 'otaku_fig', cls: 'jerk', name: '피규어', gender: 'm', emoji: '🧸', color: '#ffb3d6', dot: true, figure: true,
    img: '', hp: 14, speed: 60, atk: 2, atkInterval: 1, exp: 0.5, r: 11, size: 40,
    shouts: ['삐빅!', '한정판!'],
  },
  drunk_cry: {
    id: 'drunk_cry', cls: 'jerk', name: '주사: 우는 진상', gender: 'f', emoji: '😭', color: '#7fc8ff',
    img: '/img/lb/e_drunk_cry.webp', hp: 55, speed: 30, atk: 6, atkInterval: 1.2, exp: 4, r: 17, size: 74, zigzag: 20, cry: true,
    puke: { every: 5, reach: 230, r: 52, sec: 4, cut: 0.3 }, // 눈물 웅덩이: 그 위 멤버 공격 속도 -30%
    shouts: ['엉엉엉…', '나 안 취했어… 엉엉', '다들 나 싫어하지', '흐어엉'],
  },
  drunk_run: {
    id: 'drunk_run', cls: 'violent', name: '주사: 뛰는 진상', gender: 'f', emoji: '🏃‍♀️', color: '#ff7a4f',
    img: '/img/lb/e_drunk_run.webp', hp: 45, speed: 86, atk: 6, atkInterval: 1.1, exp: 4, r: 16, size: 72, zigzag: 90, erratic: true,
    shouts: ['꺄아아~!', '2차 가자!!', '나 잡아 봐라~', '신난다!'],
  },
  drunk_sleep: {
    id: 'drunk_sleep', cls: 'jerk', name: '주사: 드러눕는 진상', gender: 'm', emoji: '😴', color: '#8a8fb8',
    img: '/img/lb/e_drunk_sleep.webp', hp: 110, speed: 30, atk: 8, atkInterval: 1.4, exp: 6, r: 22, size: 90,
    sleep: { at: 0.42, dmg: 0.35, hits: 4 }, // 길 한가운데 드러누워 총알을 막는다 (피해 -65%) — 4번 맞으면 깬다
    shouts: ['zzz…', '5분만…', '여기가 우리 집이야', '쿨쿨'],
  },
  drunk_home: {
    id: 'drunk_home', cls: 'jerk', name: '주사: 집 가는 진상', gender: 'm', emoji: '🏠', color: '#c9a36b',
    img: '/img/lb/e_drunk_home.webp', hp: 60, speed: 40, atk: 3, atkInterval: 1.2, exp: 4, r: 17, size: 74,
    homeward: { at: 0.55, base: 4, perLevel: 0.5 }, // 중간쯤 오면 "집에 갈래~" 경험치를 들고 뒤돌아 도망
    shouts: ['집에 갈래…', '택시!', '엄마 보고 싶어', '여기 어디야'],
  },
  kkondae2: {
    id: 'kkondae2', cls: 'politic', name: '골프채 꼰대', gender: 'm', emoji: '🏌️', color: '#7a6a5a',
    img: '/img/lb/e_kkondae2.webp', hp: 360, speed: 12, atk: 16, atkInterval: 1.8, armor: 6, exp: 14, r: 23, size: 90,
    latte: { r: 230, slow: 0.4, off: 3 }, golf: { every: 6, stun: 0.8, fly: 0.6 }, // 라떼 + "나이스 샷!" 골프공으로 멤버 기절
    shouts: ['나이스 샷!', '라떼는 필드에서…', '요즘 애들은 골프도 몰라', '내가 싱글이야 (타수)'],
  },
  boss_kkondol: {
    id: 'boss_kkondol', cls: 'politic', name: '꼰대돌싱찌질남', gender: 'm', emoji: '😭', color: '#6a5a8a', boss: true,
    img: '/img/lb/e_boss_kkondol.webp', hp: 1900, speed: 11, atk: 34, atkInterval: 1.8, armor: 5, exp: 60, r: 44, size: 150,
    latte: { r: 250, slow: 0.4, off: 3 }, golf: { every: 4.5, stun: 1, fly: 0.6 },
    enrage: { at: 0.5, speed: 1.45, atk: 1.5, text: '사실 돌싱이었다!!' },
    title: '꼰대돌싱찌질남 등장!', subtitle: '"라떼는 말이야… 나 아직 싱글이야…"',
    shouts: ['나 때는 말이야!', '왜 나만 미워해!', '사실 싱글이야…'],
  },
  boss_queenmom: {
    id: 'boss_queenmom', cls: 'seduce', name: '여왕된장싱글맘', gender: 'f', emoji: '👜', color: '#e0a0ff', boss: true,
    img: '/img/lb/e_boss_queenmom.webp', hp: 2100, speed: 10, atk: 36, atkInterval: 1.8, armor: 4, exp: 60, r: 44, size: 152,
    shieldAura: { every: 8, r: 210, frac: 0.3 }, summon: { every: 9, count: 2, types: ['secretmom'] },
    toss: { every: 5.5, stun: 1.2, fly: 0.8, kind: 'bag', text: '명품 가방 투척!' },
    title: '여왕된장싱글맘 등장!', subtitle: '"아이스 아메리카노 사 와~"',
    shouts: ['이 가방 얼마게?', '유모차 탱크 출동!', '내 스타일 알지?'],
  },
  boss_sales: {
    id: 'boss_sales', cls: 'politic', name: '영업의 왕', gender: 'm', emoji: '💰', color: '#ffcf3f', boss: true,
    img: '/img/lb/e_boss_sales.webp', hp: 2200, speed: 11, atk: 32, atkInterval: 1.8, armor: 4, exp: 60, r: 44, size: 150,
    insurance: { every: 7, n: 8, frac: 0.25, r: 280, haste: 3 }, summon: { every: 10, count: 3, types: ['sales'] },
    toss: { every: 6, stun: 1.4, fly: 0.7, kind: 'stamp', text: '계약 도장 쾅!', n: 2 },
    title: '영업의 왕 등장!', subtitle: '"사인만 하시면 됩니다~"',
    shouts: ['계약서 여기요!', '다단계 아니라니까!', '보험 전부 가입!'],
  },
  boss_otaku: {
    id: 'boss_otaku', cls: 'jerk', name: '오타쿠 왕', gender: 'm', emoji: '🎌', color: '#57d68d', boss: true,
    img: '/img/lb/e_boss_otaku.webp', hp: 2300, speed: 10, atk: 34, atkInterval: 1.8, armor: 3, exp: 60, r: 44, size: 150,
    figures: { every: 6, n: 3, type: 'otaku_fig' }, goods: { cut: 0.55 },
    toss: { every: 4.5, fly: 0.6, kind: 'glow', slow: 3, text: '응원봉 빔!' },
    title: '오타쿠 왕 등장!', subtitle: '"내 컬렉션을 무시하지 마라!"',
    shouts: ['피규어 부대 출격!', '한정판은 내 것!', '최애를 위하여!'],
  },
  boss_jusa: {
    id: 'boss_jusa', cls: 'violent', name: '주사왕', gender: 'm', emoji: '🍾', color: '#ff5a4f', boss: true,
    img: '/img/lb/e_boss_jusa.webp', hp: 2500, speed: 12, atk: 38, atkInterval: 1.8, armor: 4, exp: 70, r: 44, size: 150,
    jusa: { sec: 7, cry: { every: 2.2, r: 50, sec: 3 }, run: 2.2, regen: 0.03, steal: 5 }, // 울고 → 뛰고 → 자고 → 집에 가는 4단계
    title: '주사왕 등장!', subtitle: '"한 잔만… 딱 한 잔만 더…"',
    shouts: ['엉엉엉!', '2차 가자!!', 'zzz…', '집에 갈래~'],
  },
  boss_soloparty: {
    id: 'boss_soloparty', cls: 'seduce', name: '솔로파티 중독자', gender: 'm', emoji: '🪩', color: '#ff6fd8', boss: true,
    img: '/img/lb/e_boss_soloparty.webp', hp: 2800, speed: 10, atk: 40, atkInterval: 1.8, armor: 5, exp: 80, r: 46, size: 156,
    disco: { every: 12, charm: 1.4 }, confetti: { every: 7, n: 2, sec: 2 }, summon: { every: 9, count: 3, types: ['couple', 'fakesingle'] },
    enrage: { at: 0.3, speed: 1.3, atk: 1.3, text: '파티는 이제부터야!!' },
    title: '솔로파티 중독자 등장!', subtitle: '"솔로들이여, 파티다!!"',
    shouts: ['파티 타임!', '솔로 만세!', '디스코볼 받아라!'],
  },
  // ── 무한 도전 전용 보스: 25웨이브부터 10웨이브마다 ──
  boss_union: {
    id: 'boss_union', cls: 'jerk', name: '진상 연합 회장', gender: 'm', emoji: '🎩', color: '#8a2be2', boss: true, inpi: true,
    img: '/img/lb/e_boss_union.webp', hp: 1800, speed: 10, atk: 36, atkInterval: 1.8,
    armor: 5, exp: 80, r: 46, size: 150,
    // 8초마다 다른 악당의 기술로 바꾼다
    phases: ['kneel', 'feast', 'aura', 'interest', 'shieldAura'], phaseSec: 8,
    kneel: { every: 3.2, stun: 1.5 },
    feast: { every: 4, r: 210, heal: 0.2 },
    aura: { r: 170, cut: 0.35, kb: 0.3, speed: 1.3 },
    interest: { every: 2.6, frac: 0.02, grow: 0.005, max: 0.035, refund: 0.5 },
    shieldAura: { every: 3.5, r: 200, frac: 0.3 },
    title: '진상 연합 회장 등장!', subtitle: '"진상들이여, 단결하라!"',
    shouts: ['다 덤벼라!', '연합의 힘을 봐라', '회장님 오셨다'],
  },
};

// ─── 중간 보스 (스테이지 3웨이브): 흔한 진상의 "각성" · 두 진상 "합체" ─────────
// 새 그림 없이 기존 그림으로 (각성 = 크게 + 오라, 합체 = 두 그림 나란히 + 이름표 하나)
const MID_DEFS = {
  mid_mukti: { base: 'mukti', name: '각성 먹튀왕', hpX: 14, emoji: '🏃' },
  mid_drunk: { base: 'drunk', name: '각성 만취자', hpX: 8, boom: 2.4 },
  mid_thug: { base: 'thug', name: '각성 폭력배', hpX: 5 },
  mid_scammer: { base: 'scammer', name: '각성 사기꾼', hpX: 8 },
  mid_selfie: { base: 'selfie', name: '각성 인플루언서', hpX: 10 },
  mid_gao: { base: 'gao', name: '각성 가오충', hpX: 5 },
  mid_kkondae: { base: 'kkondae', name: '각성 꼰대', hpX: 3.6 },
  fuse_kko: { fuse: ['yeokko', 'namkko'], name: '꼬충 커플', hpX: 10, charm: 'both' },
  fuse_puke: { fuse: ['vomit', 'drunk'], name: '주사 콤보', hpX: 5, boom: 1.8 },
  fuse_gossip: { fuse: ['inpi_gossip', 'inpi_clique'], name: '뒷담 패거리 대장', hpX: 9 },
  fuse_spam: { fuse: ['spam', 'selfie'], name: '관종 단톡방장', hpX: 6 },
  fuse_inpi: { fuse: ['inpi_dictator', 'inpi_treasurer'], name: '인피 간부', hpX: 4.5 },
  mid_fakesingle: { base: 'fakesingle', name: '각성 돌싱남', hpX: 9 },
  mid_carpoor: { base: 'carpoor', name: '각성 카푸어', hpX: 7 },
  fuse_lease: { fuse: ['sales', 'carpoor'], name: '리스 영업왕', hpX: 5 },
  fuse_lie: { fuse: ['secretmom', 'fakesingle'], name: '거짓말 커플', hpX: 5, charm: 'both' },
  mid_otaku: { base: 'otaku', name: '각성 오타쿠', hpX: 6 },
  mid_sarcasm: { base: 'sarcasm', name: '돌려까기 명인', hpX: 9 },
  fuse_jusa: { fuse: ['drunk_cry', 'drunk_run'], name: '울다 뛰는 만취자', hpX: 6 },
  fuse_sleep: { fuse: ['drunk_sleep', 'drunk_home'], name: '자다 깬 귀가러', hpX: 4 },
  fuse_karaoke: { fuse: ['selfie', 'couple'], name: '노래방 관종 커플', hpX: 6 },
  fuse_taxi: { fuse: ['cutter', 'drunk_run'], name: '택시 새치기 만취러', hpX: 6 },
  fuse_mt: { fuse: ['jjijil', 'otaku'], name: '찌질 오타쿠', hpX: 5 },
  fuse_latte: { fuse: ['kkondae', 'kkondae2'], name: '라떼 골프 연합', hpX: 3.5 },
  fuse_adspam: { fuse: ['sales', 'spam'], name: '광고 단톡방장', hpX: 5 },
};
// 합체 중간 보스 한 장 그림 (둘이 한 몸) — e_<id>.webp (전투) · dex/<id>.webp (도감). 그림이 오면 여기에 추가
export const FUSE_ART = new Set(['fuse_kko', 'fuse_puke', 'fuse_gossip', 'fuse_spam', 'fuse_inpi', 'fuse_lease', 'fuse_lie', 'fuse_jusa', 'fuse_sleep', 'fuse_karaoke', 'fuse_mt', 'fuse_adspam']);
const MECH_SKIP = new Set(['id', 'name', 'img', 'hp', 'speed', 'size', 'color', 'r', 'emoji', 'gender', 'cls', 'exp', 'coin', 'atk', 'atkInterval', 'shouts', 'armor', 'forms', 'pack', 'standoff', 'zigzag']);
for (const [id, m] of Object.entries(MID_DEFS)) {
  const a = ENEMIES[m.base || m.fuse[0]], b = m.fuse ? ENEMIES[m.fuse[1]] : null;
  const d = Object.assign({}, a);
  if (b) for (const [k, v] of Object.entries(b)) if (!MECH_SKIP.has(k) && d[k] === undefined) d[k] = v; // 두 진상의 기술을 모두
  Object.assign(d, {
    id, name: m.name, mid: true, fuse: m.fuse || null, base: m.base || null, img: a.img, emoji: m.emoji || a.emoji,
    hp: Math.round((a.hp + (b ? b.hp : 0)) * m.hpX), atk: (a.atk + (b ? b.atk : 0)) * 2, speed: Math.min(a.speed, b ? b.speed : 99) * 0.8,
    size: Math.round(Math.max(a.size, b ? b.size : 0) * (b ? 1.35 : 1.5)), r: Math.round(Math.max(a.r, b ? b.r : 0) * 1.45),
    exp: (a.exp + (b ? b.exp : 0)) * 5, coin: 10, armor: Math.max(a.armor || 0, b ? b.armor || 0 : 0),
    shouts: [...(a.shouts || []).slice(0, 2), ...(b ? b.shouts || [] : []).slice(0, 2), '각성했다!'],
  });
  if (m.charm) d.charm = m.charm;
  if (m.boom && d.explode) d.explode = { r: Math.round(d.explode.r * 1.6), dmg: Math.round(d.explode.dmg * m.boom) };
  delete d.pack; delete d.forms; delete d.scam; if (d.id === 'mid_scammer') { d.scam = a.scam; d.forms = a.forms; }
  ENEMIES[id] = d;
}
// 스테이지별 중간 보스 (1-1 · 1-2 는 연습이라 없음)
// 그 스테이지 캐스트에서 나온 각성 · 합체 (1-1 · 1-2 는 연습이라 없음)
const MID_BY_STAGE = [
  null, null, 'mid_mukti', 'mid_drunk', 'mid_thug', 'fuse_kko', 'fuse_puke', 'mid_mukti', 'mid_thug', 'fuse_kko',
  'fuse_kko', 'mid_scammer', 'fuse_karaoke', 'fuse_gossip', 'mid_gao', 'fuse_puke', 'fuse_gossip', 'mid_drunk', 'mid_gao', 'mid_scammer',
  'mid_kkondae', 'fuse_spam', 'fuse_gossip', 'mid_scammer', 'mid_thug', 'fuse_inpi', 'fuse_inpi', 'fuse_puke', 'fuse_inpi', 'fuse_gossip',
  'mid_fakesingle', 'mid_carpoor', 'fuse_puke', 'fuse_lie', 'mid_kkondae', 'mid_carpoor', 'fuse_karaoke', 'mid_sarcasm', 'fuse_lie', 'fuse_lie',
  'fuse_lease', 'mid_mukti', 'mid_drunk', 'fuse_adspam', 'fuse_lease', 'mid_sarcasm', 'fuse_karaoke', 'fuse_puke', 'fuse_mt', 'mid_otaku',
  'fuse_karaoke', 'fuse_latte', 'fuse_jusa', 'fuse_taxi', 'fuse_sleep', 'fuse_lie', 'fuse_spam', 'fuse_inpi', 'mid_sarcasm', 'fuse_kko',
];
export const MID_WAVE = 3;
export function stageMid(s) { return MID_BY_STAGE[s - 1] || null; }
export const MID_IDS = Object.keys(MID_DEFS);

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
const ENDLESS_BOSSES = ['boss_gapjil', 'boss_inpi', 'boss_loan', 'boss_kkondol', 'boss_queenmom', 'boss_sales', 'boss_otaku', 'boss_jusa', 'boss_soloparty', 'queen'];
// 무한 저주 계약: 5웨이브마다 셋 중 하나 (꼭 골라야 · 10초면 아무거나) — 위험 ↔ 점수/보상
export const CURSES = {
  fast: { id: 'fast', icon: '💨', name: '광속 진상', desc: '진상 속도 +20%', up: '코인 +30%', coin: 1.3 },
  slowhand: { id: 'slowhand', icon: '🐢', name: '굳은 손', desc: '우리 공격 속도 -10%', up: '점수 ×1.5', score: 1.5 },
  twin: { id: 'twin', icon: '👑', name: '보스 둘', desc: '보스가 2마리씩', up: '점수 ×1.4 · 전설 장비 확률 ↑', score: 1.4 },
  norepair: { id: 'norepair', icon: '🚫', name: '수리 금지', desc: '입구 회복 불가', up: '점수 ×2', score: 2 },
  lockone: { id: 'lockone', icon: '🔒', name: '멤버 잠김', desc: '무작위 멤버 1명이 쉰다', up: '점수 ×1.3', score: 1.3 },
  thick: { id: 'thick', icon: '🧱', name: '두꺼운 진상', desc: '진상 체력 +25%', up: '점수 ×1.35 · 코인 +15%', score: 1.35, coin: 1.15 },
};
export function endlessWave(wave) {
  const k = wave - 20;
  const n = (base) => Math.round(base * (1 + 0.12 * k));
  const w = {
    g: [
      ['yeokko', n(40), 0.28, 0], ['namkko', n(40), 0.28, 0.1], ['drunk', n(24), 0.5, 1],
      ['thug', n(20), 0.8, 2], ['mukti', n(10), 1.0, 4],
    ],
  };
  // 21웨이브부터 골목 빌런 · 인피도 섞인다
  const extra = [['vomit', 3], ['cutter', 3], ['couple', 2], ['selfie', 2], ['handsy', 2], ['gao', 2], ['kkondae', 1], ['spam', 2], ['scammer', 2], ['inpi_gossip', 2], ['inpi_dictator', 1], ['inpi_treasurer', 1]];
  if (wave >= 30) extra.push(['fakesingle', 3], ['carpoor', 2], ['sales', 2], ['jjijil', 2], ['drunk_run', 3], ['drunk_home', 2]);
  extra.forEach(([t, c], i) => { w.g.push([t, n(c), 3.2, 1 + (i % 4)]); });
  if (k % 5 === 0) w.boss = k % 10 === 0 ? ENDLESS_BOSSES[Math.floor(wave / 10) % ENDLESS_BOSSES.length] : 'boss_thug'; // 10웨이브마다 보스 러시 (챕터 보스 돌아가며 · 패턴 그대로)
  if (wave >= 25 && (wave - 25) % 10 === 0) w.boss = 'boss_union'; // 진상 연합 회장: 25 · 35 · 45 …
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
  { id: 'dmg', icon: '💪', title: '회식 버프', desc: '모든 멤버 공격력 +27%', rarity: 'common', max: 6 },
  { id: 'spd', icon: '⚡', title: '카페인 충전', desc: '모든 멤버 공격 속도 +20%', rarity: 'common', max: 5 },
  { id: 'gunExtra', icon: '🔫', title: '건전남 새총알 추가', desc: '건전남 한 번에 +1발', rarity: 'rare', max: 2, needs: 'gunman' },
  { id: 'crit', icon: '🎯', title: '정곡 찌르기', desc: '치명타 확률 +13% (피해 2배)', rarity: 'rare', max: 4 },
  { id: 'hp', icon: '🏗️', title: '방어선 보강', desc: '랑방 최대 내구도 +35% · 50% 회복', rarity: 'common', max: 5 },
  { id: 'exp', icon: '🍹', title: '인싸력 상승', desc: '경험치 획득 +35%', rarity: 'common', max: 3 },
  { id: 'slow', icon: '🚧', title: '새치기 금지', desc: '모든 진상 이동 속도 -13%', rarity: 'common', max: 3 },
  { id: 'pierce', icon: '🗡️', title: '관통 공지', desc: '모든 투사체 관통 +1', rarity: 'legend', max: 2 },
  { id: 'boss', icon: '🍻', title: '랑방 단골의 힘', desc: '공격력 +50% · 공격 속도 +25%', rarity: 'legend', max: 2 },
  { id: 'regen', icon: '🛠️', title: '건물주 인맥', desc: '랑방이 초당 내구도 2.5 자동 회복', rarity: 'legend', max: 2 },
  { id: 'ult', icon: '📣', title: '총공지 확성기', desc: '궁극기 충전 +80% · 피해 +60%', rarity: 'rare', max: 2 },
  { id: 'charmRes', icon: '🛡️', title: '연애 금지 서약', desc: '홀림 시간 -60%', rarity: 'rare', max: 1 },
  { id: 'debuffRes', icon: '🧘', title: '멘탈 관리', desc: '기절·홀림·눈부심 등 멤버 상태이상 시간 -30%', rarity: 'rare', max: 2 },
  { id: 'cdCut', icon: '⏱️', title: '스킬 연습', desc: '모든 스킬 쿨타임 -15%', rarity: 'rare', max: 2 },
  { id: 'armor', icon: '🛡️', title: '모래주머니 추가', desc: '방어선이 받는 피해 -20%', rarity: 'common', max: 2 },
  { id: 'attrUp', icon: '🔥', title: '상성 공략', desc: '유리한 상성 피해 +25%', rarity: 'rare', max: 2 },
];
// 빌드 카드: 속성 결속 · 특성(태그) · 보스/잡몹 · 위험한 거래 · 보너스
CARDS.push(
  { id: 'syn_talk', icon: '🗣️', title: '말빨 결속', desc: '말빨 멤버 공격력 +42%', rarity: 'rare', max: 3, attr: 'talk' },
  { id: 'syn_power', icon: '👊', title: '힘 결속', desc: '힘 멤버 공격력 +42%', rarity: 'rare', max: 3, attr: 'power' },
  { id: 'syn_charm', icon: '💖', title: '매력 결속', desc: '매력 멤버 공격력 +42%', rarity: 'rare', max: 3, attr: 'charm' },
  { id: 'syn_booze', icon: '🍶', title: '술 결속', desc: '술 멤버 공격력 +42%', rarity: 'rare', max: 3, attr: 'booze' },
  { id: 'tag_pierce', icon: '🗡️', title: '관통 탄두', desc: '관통 멤버 공격력 +40% · 투사체 관통 +1', rarity: 'rare', max: 2, tag: 'pierce' },
  { id: 'tag_splash', icon: '💥', title: '폭발 증폭', desc: '폭발 범위 +45% · 폭발 멤버 공격력 +34%', rarity: 'rare', max: 2, tag: 'splash' },
  { id: 'tag_chain', icon: '⚡', title: '연쇄 반응', desc: '연쇄 멤버 튕김 +1 · 공격력 +34%', rarity: 'rare', max: 2, tag: 'chain' },
  { id: 'tag_kb', icon: '💨', title: '밀어내기 달인', desc: '넉백 +60% · 넉백 멤버 공격력 +34%', rarity: 'common', max: 2, tag: 'kb' },
  { id: 'tag_heal', icon: '💚', title: '회복 강화', desc: '모든 회복 +80% · 회복 멤버 공격력 +25%', rarity: 'common', max: 2, tag: 'heal' },
  { id: 'tag_ctrl', icon: '🌀', title: '제어 연장', desc: '감속·기절 시간 +50% · 제어 멤버 공격력 +25%', rarity: 'common', max: 2, tag: 'ctrl' },
  { id: 'tag_boss', icon: '🎯', title: '보스 사냥꾼', desc: '보스·중간 보스에게 피해 +65%', rarity: 'rare', max: 2, tag: 'boss' },
  { id: 'swarm', icon: '🌪️', title: '청소부', desc: '일반 진상에게 피해 +38%', rarity: 'common', max: 2 },
  { id: 'risk_allin', icon: '🎲', title: '올인!', desc: '입구 최대 내구도 -20% · 모든 공격력 +55%', rarity: 'rare', max: 1, risk: true },
  { id: 'risk_overtime', icon: '🌙', title: '야근 모드', desc: '진상 체력 +15% · 경험치 +80%', rarity: 'common', max: 1, risk: true },
  { id: 'risk_glass', icon: '🍷', title: '유리 대포', desc: '치명타 피해 +120% · 입구 회복 -50%', rarity: 'rare', max: 1, risk: true },
  { id: 'econ_bonus', icon: '🎁', title: '보너스 카드', desc: '지금 바로 카드 한 번 더 고르기', rarity: 'common', max: 2 },
);
// 멤버 전용 카드 (덱에 있는 멤버만): 그 멤버 기술에 맞춘 강화 + 공격력 +20%. 멤버마다 2번까지
export const HERO_CARDS = {
  bangjang: { title: '방장: 공지 오라 +8% · 음파 더 넓게', mul: { cone: 1.3 }, add: { aura: 0.08 } },
  staff: { title: '운영진: 경고 2번이면 강퇴', add: { warnN: 1 } },
  gunman: { title: '건전남: 관통 +1 · 사거리 +15%', add: { pierce: 1 }, mul: { range: 1.15 } },
  gunnyeo: { title: '건전녀: 하트 폭탄 범위 +35% · 수리 +40%', mul: { splash: 1.35, heal: 1.4 } },
  myunghoon: { title: '서명훈: 욕 튕김 +1 · 기절 +20%', add: { bounce: 1 }, mul: { ctrl: 1.2 } },
  dohoon: { title: '김도훈: 음파 반경 +25% · 떼창 회복 +40%', mul: { range: 1.25, heal: 1.4 } },
  ingyu: { title: '백인규: 오토바이 게이지 2칸 빨리', add: { moto: 2 } },
  donghan: { title: '문동한: 빔 두께 +40%', mul: { beam: 1.4 } },
  youngjun: { title: '김영준: 돌격 +1초 · 블랙 러시 +2명', add: { out: 1, rush: 2 } },
  eunok: { title: '최은옥: 분노 +4초', add: { rage: 4 } },
  hanna: { title: '이한나: 레이저 세지는 속도 +50%', mul: { ramp: 1.5 } },
  sunggu: { title: '강성구: 지팡이 +1개', add: { cane: 1 } },
  junseo: { title: '윤준서: 여사친 튕김 +1', add: { bounce: 1 } },
  hyungyeong: { title: '배현경: 날씬 모드 +3초', add: { diet: 3 } },
  ara: { title: '고아라: 공주로 +5초 더', add: { young: 5 } },
  hochan: { title: '이호찬: 랑방 버프 최대 +12%', add: { buff: 0.12 } },
  soyoung: { title: '정소영: 성준영 +3초', add: { nag: 3 } },
  jieun: { title: '오지은: 감속 +15%p · 1초 더', add: { slowX: 0.15, slowSec: 1 } },
  sanghwa: { title: '박상화: 성장 한도 +15%', add: { growMax: 0.15 } },
  jungmin: { title: '홍정민: 수리 +40%', mul: { heal: 1.4 } },
  jiwon: { title: '여지원: 방깎 +1겹 · 5초 → 7초', add: { shredMax: 1, shredSec: 2 } },
  wonsik: { title: '정원식: 피해 감소 +10%p · 반경 +25%', add: { guardCut: 0.1 }, mul: { guardR: 1.25 } },
};
// 스킬 진화 카드 (Lv3 이상 멤버 · 한 번): 스킬이 한 번 더 터진다 (0.5초 뒤, 옆자리에)
export const SKILL_EVO = {
  bangjang: '집합! 두 번 외치기', staff: '레드카드 2장 발사', gunman: '난사 연장전', gunnyeo: '응급처치 + 하트 폭탄 3연발', myunghoon: '쌍욕 폭격 2회 연속',
  dohoon: '무한 앵콜 앵콜', ingyu: '할리 한 바퀴 더', donghan: '진심 빔 두 줄', youngjun: '블랙 러시 왕복', eunok: '원샷 두 잔',
  hanna: '하트 레이저 풀파워 (화면 끝까지 꿰뚫는 굵은 빔)', sunggu: '지팡이 블랙홀 두 개', junseo: '소개팅 2차', hyungyeong: '다이어트 주사 + 충격파', ara: '공주의 일격 2연타', hochan: '랑방을 위하여!! 앵콜',
  soyoung: '올인 콜 앵콜 (준영 더 오래)', jieun: '시간 정지 두 번', sanghwa: '끝내주는남자 박상화!!', jungmin: '붕대 대공사 한 번 더', jiwon: '단체 뻑큐 앵콜', wonsik: '결혼정보회사 VIP 등록',
};
// 숨은 카드 (드물게): 임시 증원 · 게스트 합류 — 한 판에 한 번
export const SECRET = { tempSlot: 0.045, guest: 0.035 };
// 멤버 특성 (시너지 카드가 이걸 보고 붙는다)
export const TAGS = {
  pierce: { id: 'pierce', name: '관통', icon: '🗡️' }, splash: { id: 'splash', name: '폭발', icon: '💥' }, chain: { id: 'chain', name: '연쇄', icon: '⚡' },
  kb: { id: 'kb', name: '넉백', icon: '💨' }, heal: { id: 'heal', name: '회복', icon: '💚' }, ctrl: { id: 'ctrl', name: '제어', icon: '🌀' }, boss: { id: 'boss', name: '보스킬', icon: '🎯' },
};
export const HERO_TAGS = {
  bangjang: ['kb', 'ctrl'], staff: ['ctrl'], gunman: ['pierce', 'boss'], gunnyeo: ['splash', 'heal'], myunghoon: ['chain', 'ctrl'], dohoon: ['heal', 'ctrl'],
  ingyu: ['splash', 'kb'], donghan: ['pierce', 'splash'], youngjun: ['boss'], eunok: ['splash'], hanna: ['kb', 'boss'], sunggu: ['pierce'],
  junseo: ['chain', 'kb'], hyungyeong: ['splash', 'kb'], ara: ['boss', 'splash'], hochan: ['pierce', 'ctrl'],
  soyoung: ['splash', 'ctrl'], jieun: ['ctrl'], sanghwa: ['boss'], jungmin: ['heal'],
};
// 같은 속성 멤버 n명 → 그 멤버들 공격력 + (TFT 처럼)
export const ATTR_SET = [0, 0, 0.12, 0.22, 0.34, 0.44, 0.52];
// 진화: Lv5 + 짝 특성 카드를 가지고 있으면 "진화" 카드가 나온다 (공격력 ×1.45 · 공격 속도 +18% · 스킬 쿨 -30%)
export const EVO = {
  bangjang: { tag: 'kb', name: '황금 확성기' }, staff: { tag: 'ctrl', name: '운영 총괄' }, gunman: { tag: 'pierce', name: '레일 새총' }, gunnyeo: { tag: 'heal', name: '천사 간호사' },
  myunghoon: { tag: 'chain', name: '구미호 욕신' }, dohoon: { tag: 'heal', name: '전국 투어' }, ingyu: { tag: 'kb', name: '3대 700' }, donghan: { tag: 'splash', name: '각성한 간보기' },
  youngjun: { tag: 'boss', name: '검은 표범 왕' }, eunok: { tag: 'splash', name: '폭탄주 여왕' }, hanna: { tag: 'kb', name: '윙크 여신' }, sunggu: { tag: 'pierce', name: '지팡이 달인' },
  junseo: { tag: 'chain', name: '인맥왕' }, hyungyeong: { tag: 'kb', name: '다이어트 챔피언' }, ara: { tag: 'boss', name: '여왕 폐하' }, hochan: { tag: 'ctrl', name: '랑방의 전설' },
  soyoung: { tag: 'ctrl', name: '잔소리 대마왕' }, jieun: { tag: 'ctrl', name: '시간의 마녀' }, sanghwa: { tag: 'boss', name: '완벽한남자' }, jungmin: { tag: 'heal', name: '붕대 장인' }, jiwon: { tag: 'boss', name: '모자이크 여왕' }, wonsik: { tag: 'heal', name: '품절남' },
};
export const EVO_MUL = { dmg: 1.45, spd: 0.18, cd: 0.7 };
// 뽑을 게 모자랄 때 채워 넣는 카드 (제한 없음)
export const FILLER_CARDS = [
  { id: 'fillUlt', icon: '📣', title: '확성기 예열', desc: '총공지 게이지 +40', rarity: 'common' },
  { id: 'fillHeal', icon: '💊', title: '방어선 수리', desc: '랑방 내구도 50% 회복', rarity: 'common' },
];

// ─── 장비 (서버 langbang-rules.js 와 같은 공식 — 테스트가 검사) ─────────
// 무기(w) · 액세서리(a) 한 칸씩. 드롭은 서버가 (스테이지 · 별 · 퍼펙트 · 시드)로 계산한다.
export const GEAR_RARITY = {
  common: { id: 'common', name: '일반', mul: 1, color: '#9fb3c8' },
  rare: { id: 'rare', name: '희귀', mul: 1.7, color: '#4ea8ff' },
  epic: { id: 'epic', name: '영웅', mul: 2.6, color: '#c77dff' },
  legend: { id: 'legend', name: '전설', mul: 4, color: '#ffb400' },
};
export const GEAR_RARITIES = ['common', 'rare', 'epic', 'legend'];
export const GEAR_STATS = {
  atk: { name: '공격력', pct: true }, spd: { name: '기본 공격 속도', pct: true }, crit: { name: '치명타', pct: true },
  skill: { name: '스킬 피해', pct: true }, cd: { name: '스킬 쿨타임 감소', pct: true }, attr: { name: '상성 피해', pct: true },
  strip: { name: '버프 벗기기 확률', pct: true }, hp: { name: '입구 내구도', pct: true },
  range: { name: '사거리 (최대 +35%)', pct: true },
  res: { name: '상태이상 시간 감소', pct: true },
};
export const GEAR = {
  megaphone: { id: 'megaphone', slot: 'w', icon: '📣', name: '명품 확성기', stat: 'atk', base: 0.06 },
  goldmic: { id: 'goldmic', slot: 'w', icon: '🎤', name: '노래방 황금 마이크', stat: 'skill', base: 0.1 },
  scope: { id: 'scope', slot: 'w', icon: '🔭', name: '새총 스코프', stat: 'crit', base: 0.03 },
  sojuset: { id: 'sojuset', slot: 'w', icon: '🍶', name: '소주잔 세트', stat: 'attr', base: 0.08 },
  stamp: { id: 'stamp', slot: 'w', icon: '🔨', name: '강퇴 망치', stat: 'strip', base: 0.06 },
  tumbler: { id: 'tumbler', slot: 'w', icon: '🥤', name: '아아 텀블러', stat: 'spd', base: 0.05 },
  belt: { id: 'belt', slot: 'a', icon: '🏋️', name: '헬스장 리프팅 벨트', stat: 'atk', base: 0.05 },
  carrier: { id: 'carrier', slot: 'a', icon: '💼', name: '여행 캐리어 방패', stat: 'hp', base: 0.04 },
  hourglass: { id: 'hourglass', slot: 'a', icon: '⏳', name: '모래시계 키링', stat: 'cd', base: 0.05 },
  nametag: { id: 'nametag', slot: 'a', icon: '📛', name: '랑방 명찰', stat: 'attr', base: 0.06 },
  sneaker: { id: 'sneaker', slot: 'a', icon: '👟', name: '한정판 운동화', stat: 'spd', base: 0.04 },
  clover: { id: 'clover', slot: 'a', icon: '🍀', name: '네잎클로버 폰케이스', stat: 'crit', base: 0.025 },
  telescope: { id: 'telescope', slot: 'w', icon: '📡', name: '망원 확성기', stat: 'range', base: 0.06 },
  slingcord: { id: 'slingcord', slot: 'a', icon: '🎯', name: '장거리 새총 끈', stat: 'range', base: 0.05 },
  laser: { id: 'laser', slot: 'a', icon: '🔦', name: '레이저 포인터', stat: 'range', base: 0.045, ch: 3 },
  passport: { id: 'passport', slot: 'w', icon: '🛂', name: '여권 지갑', stat: 'strip', base: 0.07, ch: 4 },
  sunglass: { id: 'sunglass', slot: 'a', icon: '😎', name: '제주 선글라스', stat: 'crit', base: 0.03, ch: 4 },
  lantern: { id: 'lantern', slot: 'a', icon: '🏮', name: '캠핑 랜턴', stat: 'hp', base: 0.05, ch: 5 },
  guitar: { id: 'guitar', slot: 'w', icon: '🎸', name: 'MT 통기타', stat: 'skill', base: 0.11, ch: 5 },
  santahat: { id: 'santahat', slot: 'a', icon: '🎅', name: '산타 모자', stat: 'cd', base: 0.055, ch: 6 },
  champagne: { id: 'champagne', slot: 'w', icon: '🥂', name: '샴페인 잔', stat: 'atk', base: 0.065, ch: 6 },
  hangover: { id: 'hangover', slot: 'a', icon: '💊', name: '숙취해소 부적', stat: 'res', base: 0.06 },
};
// 장비 한 줄 소개 · 잘 맞는 멤버 (추천)
export const GEAR_INFO = {
  megaphone: ['방장이 쓰던 바로 그 확성기. 목소리에 무게가 실린다.', ['bangjang', 'myunghoon']],
  goldmic: ['노래방 98점 찍었던 전설의 마이크. 한 곡 뽑으면 다 쓰러진다.', ['dohoon', 'hochan']],
  scope: ['새총에 달면 진상 이마가 크게 보인다. 급소만 노려라.', ['gunman', 'staff']],
  sojuset: ['잔 부딪히는 소리에 진상 약점이 보인다. 짠!', ['eunok', 'donghan']],
  stamp: ['"강퇴" 도장 쾅. 진상이 두른 버프를 한 방에 벗긴다.', ['staff', 'bangjang']],
  tumbler: ['아이스 아메리카노 벤티. 손이 빨라진다.', ['gunman', 'hanna']],
  belt: ['3대 500의 비밀. 허리가 버티면 한 방이 세진다.', ['ingyu', 'youngjun']],
  carrier: ['여행 가서 챙겨 온 캐리어. 입구를 막아 준다.', ['ingyu', 'jungmin']],
  hourglass: ['모래가 빨리 떨어질수록 스킬도 빨리 찬다.', ['hochan', 'sunggu']],
  nametag: ['"랑방 멤버" 명찰. 달기만 해도 기가 산다.', ['hyungyeong', 'ara']],
  sneaker: ['줄 서서 산 한정판. 발이 가벼우면 손도 가볍다.', ['junseo', 'soyoung']],
  clover: ['네잎클로버 폰케이스. 오늘따라 운이 좋다.', ['gunnyeo', 'jieun']],
  telescope: ['멀리 있는 진상도 들리게 쏘는 망원 확성기.', ['bangjang', 'donghan']],
  slingcord: ['새총 끈을 한 뼘 늘렸다. 더 멀리 날아간다.', ['gunman', 'staff']],
  laser: ['회의 때 쓰던 레이저 포인터. 저 끝까지 찍힌다.', ['hanna', 'sunggu']],
  passport: ['여권 지갑으로 뺨을 치면 버프가 날아간다(?)', ['staff', 'myunghoon']],
  sunglass: ['제주 바다에서 산 선글라스. 멋있으면 치명타.', ['junseo', 'youngjun']],
  lantern: ['캠핑 랜턴 불빛 아래라면 입구도 끄떡없다.', ['jungmin', 'dohoon']],
  guitar: ['MT 밤을 불태운 통기타. 스킬 한 방에 떼창이 터진다.', ['dohoon', 'soyoung']],
  santahat: ['산타 모자 쓰면 선물(스킬)이 빨리 온다.', ['hochan', 'sanghwa']],
  champagne: ['축하할 일이 생기면 한 방이 더 세진다. 건배!', ['sanghwa', 'eunok']],
  hangover: ['숙취해소 부적. 기절·매혹도 금방 깬다.', ['ingyu', 'bangjang']],
};
// 능력치 설명 (용어 풀이)
export const STAT_HELP = {
  atk: ['공격력', '기본 공격 · 스킬 피해가 그만큼 세진다'],
  spd: ['공격 속도', '기본 공격을 더 자주 한다 (쿨이 짧아짐)'],
  range: ['사거리', '더 멀리 있는 진상까지 닿는다 (최대 +35%)'],
  crit: ['치명타', '공격이 치명타로 터질 확률 (치명타 = 2배 피해)'],
  cd: ['쿨타임', '스킬이 다시 차는 시간이 줄어든다'],
  attr: ['속성(상성)', '상성이 맞는 진상(효과 굉장!)에게 주는 피해 추가'],
  strip: ['방깎(버프 벗기기)', '맞은 진상의 방어막·버프를 벗길 확률'],
  hp: ['체력(입구)', '랑방 입구 최대 내구도가 늘어난다'],
  skill: ['스킬 피해', '스킬로 주는 피해만 세진다'],
  res: ['상태이상 저항', '기절·매혹·공포 같은 상태이상이 짧게 끝난다'],
};
export const GEAR_IDS = Object.keys(GEAR);
// 이 스테이지에서 떨어지는 장비 (새 세트는 그 챕터부터)
export const gearPoolFor = (stage) => GEAR_IDS.filter((t) => !GEAR[t].ch || GEAR[t].ch <= Math.ceil(stage / 10));
export const GEAR_MAX_LV = 10;
export const GEAR_BAG = 80; // 가방 칸
export function gearValue(t, r, lv) {
  const g = GEAR[t], R = GEAR_RARITY[r];
  if (!g || !R) return 0;
  return Math.round(g.base * R.mul * (1 + 0.12 * (lv || 0)) * 1000) / 1000;
}
export function gearEnhanceCost(r, lv) {
  if (lv >= GEAR_MAX_LV) return null;
  return Math.round((100 * GEAR_RARITY[r].mul * Math.pow(lv + 1, 2.3)) / 10) * 10; // 영웅 +10 까지 합 약 18만 (보통 8~10일치)
}
// 강화석: +6 부터 필요 (+6 1개 · +7 2개 · +8 3개 · +9 4개 · +10 5개)
export function gearStoneNeed(lv) { return lv >= 5 && lv < GEAR_MAX_LV ? lv - 4 : 0; }
// 분해: 장비 → 강화석 (팔기 대신)
export function gearDismantle(r, lv) { return ({ common: 1, rare: 2, epic: 4, legend: 8 })[r] + Math.floor((lv || 0) / 3); }
// 합성: 같은 등급 3개 → 다음 등급 1개 (전설은 합성 불가) · 수수료
export const GEAR_NEXT = { common: 'rare', rare: 'epic', epic: 'legend' };
export const GEAR_FUSE_FEE = { rare: 500, epic: 2000, legend: 6000 }; // 만들어지는 등급 기준
// 스테이지 강화석: 1-6 부터 · 별 많을수록 잘 나옴 · 보스 +2 · 처음 깰 때 +1 · 헬 ×2
export function rollStones(seed, stage, stars, first, hell) {
  if (stage < 6 || !stars) return 0;
  const rng = seedRng(seed ^ 0x5a17);
  let n = rng() < 0.25 + 0.12 * stars ? 1 : 0;
  if (((stage - 1) % 10) === 9) n += 2;
  if (first) n += 1;
  return hell ? n * 2 : n;
}
// 강화 성공 확률 (+1~+3 는 무조건 · 그 뒤로 90% → +10 은 40%). 실패해도 장비는 안 깨지고 레벨도 안 내려간다 — 비용만
export const GEAR_SUCCESS = [1, 1, 1, 0.9, 0.82, 0.74, 0.66, 0.57, 0.48, 0.4];
export function gearEnhanceChance(lv) { return lv >= GEAR_MAX_LV ? 0 : GEAR_SUCCESS[lv]; }
export function gearSellValue(r, lv) { return Math.round(40 * GEAR_RARITY[r].mul * (1 + (lv || 0) * 0.5)); }
// 시드 난수 (mulberry32)
export function seedRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
// 드롭: 클리어 1개 (+★★★ 이면 35% 로 1개 더, 퍼펙트면 1개 더). 첫 퍼펙트는 첫 장비가 희귀 이상 확정
export function rollDrops(seed, stage, stars, perfect, firstPerfect, hell = false) {
  const rng = seedRng(seed);
  let n = 1 + (stars >= 3 && rng() < 0.35 ? 1 : 0) + (perfect ? 1 : 0) + (hell ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = { common: 70, rare: 24 + stage * 0.4, epic: 5 + stage * 0.35, legend: 0.6 + stage * 0.08 };
    if (perfect) { w.rare *= 1.5; w.epic *= 1.5; w.legend *= 1.5; }
    if (firstPerfect && i === 0) w.common = 0;
    if (hell) { w.common = 0; w.epic *= 2; w.legend *= 2; }
    const sum = w.common + w.rare + w.epic + w.legend;
    let x = rng() * sum, r = 'common';
    for (const k of GEAR_RARITIES) { x -= w[k]; if (x <= 0) { r = k; break; } }
    const pool = gearPoolFor(stage);
    const t = pool[(rng() * pool.length) | 0];
    out.push({ t, r });
  }
  return out;
}
// 멤버 한 명의 장비 능력치 합 → sim createGame({ gear: { heroId: {...} } })
export function gearStats(items) {
  const st = {};
  for (const it of items) { if (!it || !GEAR[it.t]) continue; const k = GEAR[it.t].stat; st[k] = (st[k] || 0) + gearValue(it.t, it.r, it.lv); }
  return st;
}

// 멤버 강화에 드는 그 멤버 카드 (+1~5 1장 · +6~10 2장 · +11~15 3장 · +16~20 5장) — ★승급과 같은 카드(조각)를 같이 쓴다
export function heroCardNeed(lv) { const L = lv + 1; return L <= 5 ? 1 : L <= 10 ? 2 : L <= 15 ? 3 : 5; }
// 스테이지 카드 드롭: 이번 판에 데려간(가진) 멤버 중 하나 · 별 많을수록 · 헬 ×2
export function rollHeroCard(seed, stars, hell, used) {
  if (!stars || !used.length) return null;
  const rng = seedRng(seed ^ 0x3c1d);
  const p = (0.12 + 0.03 * stars) * (hell ? 2 : 1);
  if (rng() >= p) return null;
  return used[(rng() * used.length) | 0];
}
export const CARD_PICK = { cost: 2500, n: 3, perWeek: 3 }; // 상점 "멤버 카드 선택권": 고른 멤버 카드 3장 · 주 3번

// ─── 진상 특성: 덱을 골라야 이긴다 (모든 특성에 잘 맞는 멤버 2명 이상) ─────
export const TRAITS = {
  aoeImmune: { icon: '🎧', name: '범위 면역', tip: '범위 공격이 안 들려요! 단일 공격으로', counter: ['gunman', 'staff', 'jiwon', 'ara'] },
  singleResist: { icon: '🧱', name: '단일 저항', tip: '한 명씩 치는 공격은 절반만! 범위 공격으로', counter: ['sunggu', 'bangjang', 'eunok'] },
  projShield: { icon: '🛡️', name: '원거리 방패', tip: '처음 몇 발은 막아요! 연사로 방패를 벗기세요', counter: ['gunman', 'hanna'] },
  kbImmune: { icon: '🪨', name: '넉백 면역', tip: '밀리지 않아요! 딜로 잡으세요', counter: ['youngjun', 'ara', 'jiwon'] },
  ccImmune: { icon: '🌀', name: '제어 면역', tip: '기절이 안 걸려요! 딜로 밀어붙이세요', counter: ['youngjun', 'sanghwa', 'jiwon'] },
  split: { icon: '👯', name: '분열', tip: '쓰러지면 하나 더 나와요! 범위 공격으로 한 번에', counter: ['sunggu', 'bangjang', 'donghan'] },
  regen: { icon: '💚', name: '재생', tip: '가만두면 회복해요! 방깎·불로 회복을 막으세요', counter: ['jiwon', 'eunok'] },
  stealth: { icon: '👻', name: '은신', tip: '입구 앞까지 안 보여요! 운영진·건전남은 먼저 찾아내요', counter: ['staff', 'gunman'] },
  haste: { icon: '💨', name: '가속', tip: '체력이 줄면 빨라져요! 감속·제어로 붙잡으세요', counter: ['jieun', 'dohoon', 'soyoung'] },
  heal: { icon: '💖', name: '회복 · 버프', tip: '곁의 진상을 회복시키고 빠르게 해요! 먼저 한 방에', counter: ['ara', 'youngjun', 'jiwon'] },
};
export const REVEAL_HEROES = ['staff', 'gunman']; // 은신 진상을 먼저 찾아내는 멤버

// ─── 보스 패턴: 걷기 → 기모으기(1초 예고) → 기술 → 틈!(1.5초 약점) → 반복 · 체력 50% 에서 2페이즈(분노 모습 · 빨라짐 · 새 기술) ───
//  기술: stun(멤버 기절) · silence(스킬 게이지 멈춤) · slow(멤버 공격 속도 ↓) · shock(날아가던 공격 지우기) · summon(부하 부르기) · drain(경험치 빼앗기)
//  상태이상 저항(강화 · 장비 res)만큼 짧아지고, 백인규 · 정원식 도발이 대신 맞는다
export const BOSS_KITS = {
  queen: { name: '꼬충 여왕벌', skills: [['summon', '꼬충 호출', { types: ['yeokko', 'namkko'], n: 3 }], ['stun', '윙크 폭격', { n: 1, sec: 1.2 }]], p2: ['slow', '여왕의 한숨', { cut: 0.25, sec: 4 }] },
  boss_thug: { name: '폭력배 두목', skills: [['stun', '땅 내려치기', { n: 2, sec: 1.5 }], ['summon', '애들 불러', { types: ['thug'], n: 2 }]], p2: ['shock', '주먹 충격파', {}] },
  boss_gapjil: { name: '갑질 사장', skills: [['slow', '야근 지시', { cut: 0.3, sec: 4 }], ['stun', '돌진 호통', { n: 1, sec: 1.5 }]], p2: ['silence', '회의 소집', { sec: 3 }] },
  boss_inpi: { name: '인피 대장', skills: [['silence', '뒷담화', { sec: 3 }], ['summon', '패거리 집합', { types: ['inpi_clique'], n: 3 }]], p2: ['stun', '서열 정리', { n: 2, sec: 1.4 }] },
  boss_loan: { name: '사채업자', skills: [['drain', '추심', { v: 0.12 }], ['stun', '빚 독촉', { n: 1, sec: 1.6 }]], p2: ['shock', '압류 딱지', {}] },
  boss_kkondol: { name: '꼰대 돌싱', skills: [['slow', '라떼는 말이야', { cut: 0.25, sec: 4 }], ['silence', '훈계', { sec: 3 }]], p2: ['summon', '동창 호출', { types: ['kkondae', 'fakesingle'], n: 2 }] },
  boss_queenmom: { name: '여왕된장싱글맘', skills: [['stun', '명품백 휘두르기', { n: 2, sec: 1.3 }], ['summon', '맘카페 호출', { types: ['secretmom'], n: 2 }]], p2: ['slow', '갑질 한숨', { cut: 0.3, sec: 4 }] },
  boss_sales: { name: '영업왕', skills: [['silence', '계약서 들이밀기', { sec: 3 }], ['slow', '끝없는 설명', { cut: 0.25, sec: 4 }]], p2: ['summon', '다단계 하부', { types: ['sales'], n: 3 }] },
  boss_otaku: { name: '오타쿠 왕', skills: [['summon', '피규어 부대', { types: ['otaku'], n: 2 }], ['shock', '굿즈 방패 충격파', {}]], p2: ['stun', '덕후 샤우팅', { n: 2, sec: 1.3 }] },
  boss_jusa: { name: '주사왕', skills: [['stun', '술병 던지기', { n: 1, sec: 1.5 }], ['slow', '술주정', { cut: 0.25, sec: 4 }]], p2: ['summon', '술친구 호출', { types: ['drunk_cry', 'drunk_run'], n: 3 }] },
  boss_soloparty: { name: '솔로파티 중독자', skills: [['summon', '솔로 호출', { types: ['yeokko', 'namkko'], n: 3 }], ['silence', '디스코 타임', { sec: 3 }]], p2: ['stun', '미러볼 섬광', { n: 2, sec: 1.4 }] },
  boss_union: { name: '인피 연합 총수', skills: [['silence', '연합 공지', { sec: 3 }], ['stun', '총수 호령', { n: 2, sec: 1.5 }]], p2: ['summon', '연합 총동원', { types: ['inpi_clique', 'inpi_dictator'], n: 3 }] },
};
export const BOSS_AI = { every: [8, 12], everyP2: [6, 9], windup: 1.0, recover: 1.5, roar: 20 };

// ─── 빌드 길 (TFT 증강 · 칼바람 느낌) ─────────────────────────
//  카드마다 길(태그) 1~2개 · 고른 길 카드가 더 잘 나온다 · 한 길을 2번 고르면 3장 중 1장은 그 길 확정 (마지막 칸은 늘 무작위)
//  길마다 3단계: 실버(기본 tag_ 카드) → 골드 → 프리즘 · 3장/5장 모으면 세트 보너스
export const CARD_TAGS = { dmg: ['boss'], crit: ['boss'], slow: ['ctrl'], hp: ['heal'], regen: ['heal'], armor: ['heal'], pierce: ['pierce'], boss: ['boss'], cdCut: ['ctrl'], swarm: ['splash'], risk_glass: ['boss'], ult: ['splash'] };
export const TECH = {
  pierce: [{ title: '관통 II · 철갑탄', desc: '관통 +1 · 관통 멤버 공격력 +35%' }, { title: '관통 III · 레일건', desc: '관통 +2 · 관통 멤버 공격력 +70%' }],
  splash: [{ title: '폭발 II · 연쇄 폭발', desc: '폭발 범위 +25% · 폭발 멤버 공격력 +35%' }, { title: '폭발 III · 대폭발', desc: '폭발 범위 +35% · 폭발 멤버 공격력 +70%' }],
  chain: [{ title: '연쇄 II · 번개 사슬', desc: '튕김 +1 · 연쇄 멤버 공격력 +35%' }, { title: '연쇄 III · 뇌신', desc: '튕김 +2 · 연쇄 멤버 공격력 +70%' }],
  kb: [{ title: '넉백 II · 강풍', desc: '넉백 +40% · 넉백 멤버 공격력 +35%' }, { title: '넉백 III · 태풍', desc: '넉백 +70% · 넉백 멤버 공격력 +70%' }],
  heal: [{ title: '회복 II · 응급실', desc: '회복 +50% · 초당 수리 +2' }, { title: '회복 III · 불사의 문', desc: '회복 +80% · 초당 수리 +4 · 받는 피해 -15%' }],
  ctrl: [{ title: '제어 II · 얼음 감옥', desc: '감속·기절 +35% · 제어 멤버 공격력 +35%' }, { title: '제어 III · 시간 정지', desc: '감속·기절 +60% · 제어 멤버 공격력 +70%' }],
  boss: [{ title: '한방 II · 급소 찌르기', desc: '보스 피해 +35% · 치명타 +8%' }, { title: '한방 III · 처형', desc: '보스 피해 +70% · 치명타 피해 +60%' }],
};
export const SET_BONUS = { 3: 0.2, 5: 0.35 }; // 한 길 카드 3장 / 5장 → 그 길 멤버 공격력 +
export const TIER_NAMES = { silver: '실버', gold: '골드', prism: '프리즘' };
// 증강: 판을 결정하는 큰 카드 (스테이지 1 · 3 · 5웨이브 / 무한 3 · 8 · 13 …) — 멤버 전용 증강은 그 멤버가 덱에 있을 때만
export const AUGMENTS = [
  { id: 'a_power', tier: 'silver', icon: '💪', title: '근성', desc: '모든 멤버 공격력 +20%', fx: { dmg: 0.2 } },
  { id: 'a_haste', tier: 'silver', icon: '⚡', title: '초과 근무', desc: '공격 속도 +15%', fx: { spd: 0.15 } },
  { id: 'a_wall', tier: 'silver', icon: '🧱', title: '철벽', desc: '입구 최대 내구도 +40% · 가득 회복', fx: { hp: 0.4 } },
  { id: 'a_xp', tier: 'silver', icon: '📚', title: '벼락치기', desc: '경험치 +50%', fx: { exp: 0.5 } },
  { id: 'a_crit', tier: 'gold', icon: '🎯', title: '정밀 사격', desc: '치명타 +18% · 치명타 피해 +50%', fx: { crit: 0.18, critMul: 0.5 } },
  { id: 'a_cd', tier: 'gold', icon: '⏱️', title: '쿨타임 도둑', desc: '스킬 쿨타임 -30%', fx: { cd: 0.7 } },
  { id: 'a_swarm', tier: 'gold', icon: '🌪️', title: '대청소', desc: '일반 진상 피해 +60% · 폭발 범위 +20%', fx: { swarm: 0.6, splash: 1.2 } },
  { id: 'a_boss', tier: 'gold', icon: '👑', title: '보스 사냥', desc: '보스·중간 보스 피해 +60%', fx: { boss: 0.6 } },
  { id: 'a_frost', tier: 'gold', icon: '🧊', title: '냉기 오라', desc: '모든 진상 이동 -18% · 제어 +30%', fx: { slow: 0.82, ctrl: 1.3 } },
  { id: 'a_prism_all', tier: 'prism', icon: '🌈', title: '프리즘: 전원 각성', desc: '공격력 +45% · 공격 속도 +20%', fx: { dmg: 0.45, spd: 0.2 } },
  { id: 'a_prism_path', tier: 'prism', icon: '🔷', title: '프리즘: 외길 인생', desc: '가장 많이 고른 길 세트 보너스 한 단계 더 + 그 길 멤버 공격력 +50%', fx: { path: 0.5 } },
  { id: 'a_prism_ult', tier: 'prism', icon: '📣', title: '프리즘: 무한 총공지', desc: '총공지 충전 +120% · 피해 +100%', fx: { ult: 1.2, ultDmg: 1 } },
  { id: 'a_prism_mirror', tier: 'prism', icon: '🪞', title: '프리즘: 쌍둥이 스킬', desc: '모든 스킬이 0.5초 뒤 한 번 더', fx: { echo: 1 } },
];
// 멤버 전용 증강 (그 멤버 전용 카드 효과 두 번 + 공격력 +40%)
export const HERO_AUG = {
  donghan: '진심 폭주', jieun: '시간 가속 역전', sanghwa: '끝내주는 이자', bangjang: '전 직원 집합', staff: '레드카드 폭풍', gunman: '저격 명인',
  gunnyeo: '천사 모드', myunghoon: '욕의 신', dohoon: '콘서트 앵콜', ingyu: '할리 군단', youngjun: '표범 질주', eunok: '폭탄주 파티', hanna: '윙크 여왕',
  sunggu: '지팡이 폭풍', junseo: '인맥 총동원', hyungyeong: '다이어트 성공', ara: '여왕 즉위', hochan: '랑방의 이름으로', soyoung: '올인 앵콜', jungmin: '붕대 장인', jiwon: '모자이크 폭풍', wonsik: '올해는 결혼',
};
// 제어 분기: 멤버마다 하나 (맞히면 가끔 제어) — 눈에 잘 띄는 색 · 아이콘
export const CC_KINDS = { stun: { icon: '⭐', name: '기절', color: '#ffe066' }, slow: { icon: '🐢', name: '감속', color: '#6fb3ff' }, freeze: { icon: '🧊', name: '빙결', color: '#9ff0ff' }, kb: { icon: '💨', name: '밀치기', color: '#ffffff' }, pull: { icon: '🧲', name: '끌어당기기', color: '#c77dff' } };
export const HERO_CC = {
  bangjang: 'kb', staff: 'slow', gunman: 'stun', gunnyeo: 'slow', myunghoon: 'stun', dohoon: 'slow', ingyu: 'kb', donghan: 'freeze', youngjun: 'stun', eunok: 'kb',
  hanna: 'pull', sunggu: 'pull', junseo: 'kb', hyungyeong: 'kb', ara: 'stun', hochan: 'freeze', soyoung: 'slow', jieun: 'freeze', sanghwa: 'pull', jungmin: 'slow', jiwon: 'stun', wonsik: 'pull',
};
export const CC_ON_HIT = { chance: [0.12, 0.18, 0.25], stun: 0.8, slow: 1.8, freeze: 1.0, kb: 60, pull: 50 };

// 중간 보스: 기술 하나 + 체력 50% 에서 빨라짐 (계열마다 · 12~16초마다 · 1초 예고)
export const MID_KIT = {
  violent: ['stun', '박치기', { n: 1, sec: 1.0 }],
  seduce: ['slow', '홀리는 눈빛', { cut: 0.2, sec: 3 }],
  politic: ['silence', '말 끊기', { sec: 2 }],
  jerk: ['summon', '친구 불러', { n: 2 }],
};
export const MID_AI = { every: [12, 16] };
