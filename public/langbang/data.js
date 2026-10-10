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
// 합류 모드 (대장 1명 시작 → 레벨업 카드로 합류): 앞 레벨업은 빠르게 · 합류 카드 가중치 · 보장 · 몰아 키우기
// 한 판 성장 (일반 스테이지 · 헬): 레벨업은 덜 자주 (필요 경험치 × need → 한 판 카드 9장쯤 → 7장쯤) · 대신 한 장 한 장이 크게
//   card: 일반 카드 % 효과 × · 멤버 전용 카드 공격력도 · lv: 멤버 레벨 카드마다 그 멤버 공격력 + (키운 멤버가 세진다)
//   주간 도전 · 1:1 대전 · 레이드 · 탑 · 무한은 그대로 (따로 맞춘 모드라)
//   (card 1.65 → 1.35 · rep: 같은 카드를 또 고르면 2장째 ×0.7 · 3장째부터 ×0.5 — 공격력 +45% 카드가 계속 떠서 한쪽으로 눈덩이처럼 커지던 것 · 설명 숫자도 실제 값)
export const GROW = { need: 2.3, card: 1.35, lv: 0.25, rep: [1, 0.7, 0.5], cdMax: 0.5 }; // cdMax: 카드(스킬 연습)로 줄이는 스킬 쿨 최대 50%
// 주력: 한 판에 Lv5(진화)까지 키울 수 있는 멤버는 2명 — Lv3 을 넘기는 레벨 카드를 먼저 고른 두 명이 주력 · 나머지는 Lv3 까지
//   (스테이지 · 헬 · 주간 도전만 · 탑은 혼자라 · 대전 · 레이드 · 무한은 따로 맞춘 모드라 그대로)
export const MAIN = { n: 2, cap: 3 };
export const JOIN = { free: [4, 10], freeUntil: 13, solo: 1.6, freePick: true, hp: [0.9, 0.87, 1.2, 1.25, 1.7, 2.3], hellStart: 2, exp: [0.12, 0.2, 0.3, 0.42, 0.65], expLate: 1.04, w: 12, guarantee: 3, invest: 0.5, investMax: 3 };
// ─── 전투 템포 (느리고 묵직하게) · 무기 정체성 ─── opt.tempo 로 켠다 (합류 모드와 같이)
// 진상 수 ×0.6 · 한 명 체력 ×1.6 / 멤버 공속 ÷1.54 · 한 방 ×1.6 / 스킬 쿨 ×1.5
// 기세 (팀 공용 스킬 칸): 2칸 (10/08 3칸 → 2칸) · 7초마다 1칸 · 처치 +2% · 콤보 10마다 +10% · 스킬 1칸 · 총공지 2칸 (+원래 게이지)
//   스킬 두 개는 0.6초 안에 연달아 못 나간다 (두 번째는 줄 서서 0.6초 뒤) · 쓴 멤버는 쿨의 40% 동안 기진맥진 (공속 −30%)
export const MOMENTUM = { max: 200, per: 100, refill: 7, kill: 2, combo10: 10, ult: 200, gap: 0.6, tired: 0.3, tiredSpd: 0.7, /* (10/10 tired 0.4 → 0.3: 스킬 쓴 대가를 조금 덜 — 스킬 비중을 키우면서) */ skillDmg: 1.35,
  strong: ['sunggu', 'hanna', 'myunghoon', 'bangjang', 'gunman', 'dohoon', 'jieun', 'hochan'], strongCd: 1 }; // (쿨 다양화 10/07: HEROES 스킬 cd 가 곧 실제 초 — 예전 템포 ×1.5 · 강한 스킬 ×2 는 스킬마다 cd 에 녹였다 · strong 은 화면 흔들림만)
// 멤버 공격 리듬 (코드 모션): wind = 준비 시간(초) · back = 뒤로 젖힘 · sq = 찌그러짐 · snap = 던질 때 앞으로 · lift = 들어 올리기
export const CADENCE = {
  wonsik: { wind: 0.32, back: 0.16, sq: 0.12, snap: 0.2, lift: 8 }, // 덤벨 번쩍
  // 여성 멤버는 프레임 띠 대신 코드 모션 (move): 준비 q(0→1) · 던진 뒤 s(1→0)
  soyoung: { wind: 0.34, back: 0.02, sq: 0.03, snap: 0.08, move: 'wag' }, // 손가락 까딱까딱 → 앞으로 쑥 "그러니까!"
  gunnyeo: { wind: 0.3, back: 0.04, sq: 0.08, snap: 0.06, move: 'toss' }, // 무릎 굽혀 → 폴짝 던지기
  eunok: { wind: 0.4, back: 0.2, sq: 0.04, snap: 0.3, move: 'swig' }, // 고개 젖혀 한 모금 → 확 던지기
  hanna: { wind: 0.3, back: 0.03, sq: 0.03, snap: 0.05, move: 'wink' }, // 골반 톡 · 옆으로 기울여 → 반짝 튕김
  hyungyeong: { wind: 0.22, back: 0.05, sq: 0.1, snap: 0.1, move: 'jab' }, // 몸 낮춰 → 앞으로 원투
  jieun: { wind: 0.45, back: 0.02, sq: 0.02, snap: 0.04, move: 'cast' }, // 스르르 떠올라 → 쿵 파동
  jiwon: { wind: 0.26, back: 0.03, sq: 0.14, snap: 0.08, move: 'pop' }, // 쪼그렸다 → 뿅 튀어 오름
  sanghwa: { wind: 0.12, back: 0.06, sq: 0.03, snap: 0.1 }, // 동전 휙휙휙
  gunman: { wind: 0.22, back: 0.05, sq: 0.02, snap: 0.14 }, // 권총: 숨 고르고 또박또박 탕
  jungmin: { wind: 0.28, back: 0.14, sq: 0.06, snap: 0.22, lift: 10 }, // 머리 위로 크게
  ara: { wind: 0.3, back: 0.1, sq: 0.1, snap: 0.25, lift: 12 }, // 두 손 망치
  baul: { wind: 0.2, back: 0.06, sq: 0.06, snap: 0.16, lift: 4 }, // 보드 돌진: 웅크렸다 → 박차고 나간다 (띠가 없을 때만)
  _heavy: { wind: 0.28, back: 0.12, sq: 0.1, snap: 0.18, lift: 6 }, _lob: { wind: 0.22, back: 0.1, sq: 0.05, snap: 0.16, lift: 6 },
  _burst: { wind: 0.12, back: 0.06, sq: 0.03, snap: 0.1 }, _rapid: { wind: 0.08, back: 0.03, sq: 0.02, snap: 0.05 }, _melee: { wind: 0.18, back: 0.1, sq: 0.06, snap: 0.2 },
  _default: { wind: 0.16, back: 0.07, sq: 0.04, snap: 0.12 },
};
// 멤버 공격 프레임 띠 (선택): 8칸 · release 칸에서 투사체가 나간다 — 있으면 코드 모션 대신
// 던지는 칸: 기본 4 · PixVerse 띠는 칸마다 달라서 따로 (2~6칸 중 모습이 제일 크게 바뀌는 칸을 재서 정함)
export const ATTACK_RELEASE = { subin: 3, soyoung: 3, baul: 3, eunok: 3, jieun: 3, gunnyeo: 4, hyungyeong: 4, hanna: 5, donghan_on: 5, ingyu_bike: 3 };
// 변신 모습 공격 띠: h_<id>_<form>_attack.webp — donghan 진심 모드(alt) · ingyu 할리 타는 동안
export const HERO_ANIM_FORM = Object.fromEntries([['donghan', 'on'], ['ingyu', 'bike'], ['hyungyeong', 'slim'], ['ara', 'old'], ['jieun', 'demon'], ['eunok', 'rage'], ['youngjun', 'dash']].map(([id, f]) => [id, { form: f, src: `/img/lb/h_${id}_${f}_attack.webp`, frames: 8, release: ATTACK_RELEASE[id + '_' + f] || 4 }]));
export const HERO_ANIM = Object.fromEntries(['ara', 'bangjang', 'dohoon', 'donghan', 'gunman', 'hochan', 'ingyu', 'jungmin', 'junseo', 'junyoung', 'myunghoon', 'sanghwa', 'staff', 'sunggu', 'wonsik', 'youngjun',
  'gunnyeo', 'soyoung', 'eunok', 'hyungyeong', 'jieun', 'jiwon', 'subin', 'dragon'].map((id) => [id, { src: `/img/lb/h_${id}_attack.webp`, frames: 8, release: ATTACK_RELEASE[id] || 4 }])); // 모든 멤버 띠 있음 (코드 모션은 띠가 못 올 때 대신)
// 느린 판 (2026-10 대개편 · 스테이지 · 주간 · 헬만): 진상 나오는 간격 ×gap · 수 ×count · 한 명 체력 ×hp · 이동 ×espd · 입구 치는 힘 ×door — 한 판 3~4분 · 멤버 하나하나 조종하는 맛
// 큰 한 방 스킬 (쿨 cd 초 이상: 방장 · 강성구 · 김도훈 · 오지은 · 강병화 · 이호찬 · 정소영) 은 첫 웨이브가 끝나야 쓸 수 있다 — 시작하자마자 몰아 쓰기 방지 (10/08 · 기세도 3칸 → 2칸)
export const ULT_LOCK = { cd: 35 };
// 긴장감 (10/08 · 일반 스테이지 · 헬만 — 주간 · 이벤트 · 대전 · 레이드 · 탑은 그대로): 입구가 '안 맞거나 → 몇 초 만에 털리거나' 둘 중 하나 · 스킬을 안 써도 깨지던 것을
//  crowd: 입구에 붙어 치는 진상이 k 명을 넘으면 넘는 몫은 over 배만 · 합쳐서 cap 명 몫까지 (입구 앞 자리가 좁다 — 쌓이면 무너지는 속도가 끝없이 커지던 것 → 서서히 기운다)
//  door: 진상 한 대 세기 × (대신 오래 버티면 계속 깎인다) · repair: 웨이브를 깨면 잃은 입구의 frac 만큼 (최대 cap × 최대 내구도) 고친다 (버티면 숨 돌릴 틈)
//  hp: 2웨이브부터 (팀이 모인 뒤) 진상 체력 × (떼거리 조건은 1 + (hp−1) × swarmK) — 평타만으로는 밀리고
//  skill: 스킬 피해 × · refill: 기세 한 칸 차는 초 (원래 7) — 스킬로 뒤집는다 (스킬 안 쓰는 판은 확실히 어렵게)
// 역할 리듬 (10/08 · 일반 스테이지 · 헬): 화면이 덜 바쁘게 — 공격 간격 ×iv · 한 방 ×dmg (초당 피해는 거의 그대로 · 스킬 피해는 그대로) · 역할마다 리듬이 다르다
//  도감 역할(HERO_ROLE)을 그대로 쓴다: tank 묵직한 한 방 · single 느리고 큰 한 발 · aoe 중간 박자 범위 · support 주기적인 펄스 · ctrl · special 중간
//  CADENCE_HERO: 역할과 다른 리듬만 — rapid 빠른 연타는 계속 빠르게 (대신 한 방은 작게) · own 게이지 · 소환 · 수동 · 아주 느린 멤버는 제 리듬
//  새 멤버는 HERO_ROLE 만 정하면 그 역할 리듬을 따른다
export const ROLE_CADENCE = { tank: { iv: 1.6, dmg: 1.6 }, single: { iv: 1.55, dmg: 1.55 }, aoe: { iv: 1.4, dmg: 1.4 }, support: { iv: 1.45, dmg: 1.45 }, ctrl: { iv: 1.35, dmg: 1.35 }, special: { iv: 1.35, dmg: 1.35 }, rapid: { iv: 1.2, dmg: 1.2 }, own: { iv: 1, dmg: 1 } };
export const CADENCE_HERO = { youngjun: 'rapid', hanna: 'rapid', myunghoon: 'rapid', eunok: 'rapid', staff: 'rapid', hochan: 'own', soyoung: 'own', baul: 'own', jeongseob: 'own' };
export const roleCadence = (id) => ROLE_CADENCE[CADENCE_HERO[id] || HERO_ROLE[id] || 'special'] || ROLE_CADENCE.own;
export const TENSION = { crowd: { k: 2, over: 0.2, cap: 3.5 }, door: 0.9, espd: 1.25, repair: { frac: 0.2, cap: 0.08 }, hp: 1.7, hpFrom: 2, swarmK: 0.3, skill: 5.4, basic: 0.78, /* (10/10 스킬 비중: 기본 공격 ×0.78 · 스킬 피해 3.5 → 5.4 — 잘 쓰는 사람 총 피해는 그대로 · 스킬 안 쓰면 손해가 확실히) */ refill: 9,
  // pick: 레벨업 필요 경험치 ×need (카드 덜 자주) · freeTo 명까지는 합류해도 카드 한 장 더 (예전처럼) · 5 · 6번째 합류는 카드 한 장을 쓴다 · 공짜 합류 카드는 freeWaves 웨이브에만 (예전엔 매 웨이브) · 처음 guarantee 장은 합류 보장
  //   → 좁은 덱 (4명): 카드가 남고 narrow: 빈 칸 하나마다 팀 공격 + (1~2명이 확실한 캐리) / 넓은 덱 (6명): 합류에 카드를 쓰는 대신 wide: 5번째부터 한 명마다 팀 공격 +dmg · 웨이브 사이 입구 수리 +repair (서포트 · 시너지)
  // slam: 입구에서 reach 안으로 들어온 정예 · 중간 보스 · 보스가 first 초 뒤부터 every 초마다 '입구 강타' 예고 (wind 초) → 맞으면 입구 최대의 elite/mid/boss (헬 ×hell) · 기절 · 넉백 · 빙결 스킬로 끊으면 0 (스킬 타이밍)
  slam: { reach: 230, first: 2, every: 5, bossEvery: 10, wind: 1.3, elite: 0.055, mid: 0.09, boss: 0.06, hell: 0.85 }, /* (보스는 길게 싸우니 10초마다 6%) */ // (10/08 (b) 더 자주 · 더 아프게 · 헬은 단단함이 주인공이라 강타는 예전 수준)
  // ccdr: 제어 저항 — 기절 · 빙결이 window 초 안에 또 걸리면 steps 배 (3번째 뒤 immune 초 면역) · 정예 이상은 elite 배 · 밀어내기는 push.win 초에 push.cap 까지 (정예 이상 pushElite 배) · 강퇴는 정예 · 중간 보스엔 기절 · 넉백 없이
  ccdr: { window: 4, steps: [1, 0.5, 0.25], immune: 3, elite: 0.5, pushElite: 0.4, push: { win: 6, cap: 180 } },
  bossHp: { mid: 2.5, last: 3.2 },
  // bossWave (10/08 '길고 굵게'): x-5 · x-10 보스 웨이브는 졸개를 filler 배로 줄이고 (보스가 주인공) · 보스 체력이 phases 아래로 내려갈 때마다
  //   2 · 3 페이즈: 잠깐 단단해지며(guard 초 동안 받는 피해 ×guardCut) 이번 웨이브 졸개를 adds + 페이즈 수 만큼 불러낸다 — 판 전체 4 ~ 5분
  bossWave: { filler: 0.5, phases: [0.75, 0.5, 0.25], adds: 3, guard: 1.2, guardCut: 0.2, phaseMin: { mid: 16, last: 20 }, phaseMinCh: [1.6], /* (10/09 1장 보스: 판이 짧아 페이즈를 조금 더 길게) */ standoff: 240, kitDoor: 0.4, hellPhase: 0.6 }, // kitDoor: 보스 기술이 입구를 치는 몫 (보스전이 길어진 만큼) // phaseMin: 한 페이즈 최소 초 (그 전엔 다음 문턱 아래로 안 내려감 — 보스전이 순식간에 끝나지 않게) // (10/08 '길고 굵게': x-5 보스 ×mid · x-10 장 보스 ×last 체력 — 보스 싸움이 판의 중심 · 졸개를 늘리지 않고)
  card: 1.8, aug: 0.75, /* (10/09 3차 1.2 → 1.8: 합류 뒤 덤 카드 · 앞 빠른 레벨업이 없어져 키우기 카드가 반쯤으로 준 만큼) */ /* (10/09 0.8 → 1.2: 고르는 횟수를 반으로 줄인 만큼 한 장 한 장을 크게) */ // 한 판 성장 납작하게: 레벨업 카드 % ×card · 증강 % ×aug (끝날 때 팀 공격 ×2~4 → 덜 · 뒤 웨이브가 '그냥 밀리는' 느낌 줄이기)
  // (10/09 '카드를 너무 많이 고른다' → 한 판 고르기 5~7번): auto = 1웨이브 합류 시각(초) — 합류는 카드 없이 덱 순서대로 저절로 (2웨이브부터 웨이브마다 perWave 명) · augW: 증강이 뜨는 웨이브 · need 는 레벨업 필요 경험치 배율
  // (10/09 3차 · HOTD 식 합류 · 키우기 카드는 그대로, 덜 잦게): freeTo 0 = 합류해도 카드 한 장 더 안 줌 · noFast = 앞 레벨업 빠르게(JOIN.exp) 끔 — 대신 1웨이브 공짜 합류 카드 두 장은 모든 스테이지 (파티가 빨리 모이게)
  pick: { need: 1.4, noFast: true, freeWaves: [2, 3], guarantee: 3, freeTo: 0, auto: null, perWave: 1, augW: { 2: 'gold', 4: 'prism' }, lv: 3, chNeed: [1.1, 0.38, 0.55, 0.95, 1.1, 1.0, 0.85, 0.7], wk: { need: 3.2, ch: [1, 1, 1.25, 1.25, 1.35, 1.35, 1.7, 1.7], augW: { 3: 'gold', 6: 'prism' }, card: 2.2, lvAll: true } }, /* wk: 주간 도전 (8웨이브) — 레벨업 필요 경험치 × · 증강 웨이브 · 카드 % × */ /* lv: 멤버 레벨 카드 공격력 + 배율 (GROW.lv ×) · chNeed: 장마다 레벨업 필요 경험치 (장마다 한 판 카드 4~5장이 되게) */ wide: { from: 5, dmg: 0.02, repair: 0.02, narrow: 0.3 },
  chHp: [0.518, 0.842, 0.744, 0.523, 0.42, 0.56, 0.414, 0.466] }; // (10/09 3차 chcalib: 덤 카드 · 빠른 앞 레벨업을 뺀 만큼) // chHp: 장마다 체력 (stagemeas · 새 목표 1장 90 · 2장 78 · 3장 75 · 4장 72 · 5장 68 · 6장 64 · 7 · 8장 표)
export const SLOW_RUN = { gap: 1.75, count: 0.72, hp: 2.1, espd: 0.85, door: 1.15, chHp: [0.89, 0.89, 0.69, 0.82, 0.91, 0.985, 0.63, 0.525] }; // (10/08 진상 리메이크 · 쓰러짐 게이지 · 1웨이브 뒤 큰 한 방 · 기세 2칸 뒤 다시: 1 · 2장 +3% · 3장 −7% · 6장 −3.5% · 7장 +7% · 8장 +5%) chHp: 장마다 체력 다시 맞춤 (stagemeas · 대개편 뒤 1차 · 10/07 쿨 다양화 · 쓰러짐 게이지 뒤 6장 +7% · 7장 −2% · 8장 −2%)
// 방어율 (장이 깊을수록 진상이 단단 — 한 방마다 %로 깎임): 정예 · 중간 보스 · 보스는 ch 그대로 · 졸개는 fodder 배
//  방관(pen): 그 멤버 공격은 방어율을 그만큼 뚫는다 (건전남 전부) · 여지원 모자이크 한 겹마다 방어율 shredPer 씩 벗김 (5겹 = 0) · 모자이크 폭격은 전부
export const ARMOR = { ch: [0, 0.05, 0.1, 0.16, 0.22, 0.28, 0.34, 0.4], fodder: 0.35, mid: 1.15, boss: 1.3, eliteHp: 100, shredPer: 0.2,
  pen: { gunman: 1, ara: 0.5, sunggu: 0.45, ingyu: 0.35, wonsik: 0.3, hyungyeong: 0.3, youngjun: 0.25, jiwon: 0.4 } };
// 스테이지 s 에서 이 진상의 방어율 (화면 · 전투 같은 식) — 보스 · 중간 보스 · 정예(방어 · 체력 100+) 는 표 그대로 · 졸개는 fodder 배
export function armorPctStage(s, d, elite) {
  const c = ARMOR.ch[Math.min(ARMOR.ch.length, Math.max(1, Math.ceil((s || 1) / 10))) - 1] || 0;
  if (!c || !d) return 0;
  const k = d.boss ? ARMOR.boss : d.mid ? ARMOR.mid : elite || (d.armor || 0) > 0 || d.hp >= ARMOR.eliteHp ? 1 : ARMOR.fodder;
  return Math.min(0.6, c * k);
}
export const ARMOR_BREAKERS = ['jiwon', 'gunman', 'ara', 'sunggu']; // 방깎(여지원) · 방관(건전남 전부 · 고아라 · 강성구 절반쯤) — 상성 경고 추천
// 멤버별 상태이상 저항 (0~100 · 아직 안 씀 — 무한의 탑 한 명 조종 · 멤버별 저항은 다음 단계에서): 성격대로 잘 버티는 상태이상
export const HERO_RES = {
  jeongseob: { slow: 60, stun: 40 }, wonsik: { stun: 40, charm: 30 }, hyungyeong: { charm: 60 }, ingyu: { silence: 50, slow: 30 }, sunggu: { stun: 50, silence: 30 },
  youngjun: { slow: 40 }, eunok: { charm: 40 }, hanna: { charm: 70 }, byunghwa: { silence: 60 }, dragon: { freeze: 80, slow: 30 }, baul: { slow: 50, freeze: 40 }, subin: { charm: 40, slow: 30 },
};
// 쓰러짐 게이지 (10/07 · 일반 스테이지 · 헬 · 주간 — 레이드 등은 createGame({ kd: true }) 로 켠다 · 1:1 대전은 끔): 멤버는 죽지 않는다
//  진상이 멤버에게 건 상태이상(걸린 시간만큼) · 입구 앞 진상의 주먹(가장 가까운 멤버) · 독이 게이지를 채우고, 가득 차면 쓰러짐 (sec 초 · 공격 · 스킬 못 함) → 일어나며 0 (grace 초 무적)
//  게이지 크기 = base × KD_HERO(멤버) × (1 + lv×(Lv−1)) × (1 + meta×강화) × (1 + star×(★−1)) × (1 + 장비 저항) — 키울수록 잘 버틴다
//  status: 상태이상 1초당 +10 (감속은 slow) · decay: 마지막으로 맞고 wait 초 뒤부터 초당 per 씩 빠짐 · line: 입구 치는 진상 한 대 (r 안 가장 가까운 멤버 · 정예 · 보스 배) · taunt: 도발 멤버(정원식 · 배현경 · 윤정섭)가 r 안 멤버 대신 맞음
//  poison: 독 — 초당 게이지 +dps · 공격 속도 ×spd · 기절 예고 조건(3장부터)에 독이 섞이고 오리고기 · 토 웅덩이도 독
export const KD = { base: 100, lv: 0.06, meta: 0.025, star: 0.08, sec: 4, grace: 1.5, status: 8, slow: 3, kind: { silence: 0.4, charm: 0.3 } /* 침묵은 스킬만 막아서 덜 · 홀림은 꼬충 떼가 자주 걸어서 덜 */, decay: { wait: 5, per: 0.8 }, ch: [0.9, 1.3, 2.2, 2.9, 3.9, 4.3, 4.8, 5.6], hell: 1.2, /* (10/08 헬 1.4 → 1.2: 헬은 단단함이 주인공) */ // ch: 장마다 채우는 양 배율 (멤버가 커지는 만큼) · hell: 헬 배율
  after: 0.5, // 쓰러질 때마다 그 판 게이지 +50%
  line: { r: 46, hit: 5, elite: 1.6, boss: 3 }, taunt: { r: 95 }, poison: { dps: 5, spd: 0.8, cc: 5, duck: 4, puddle: 2 } };
// 멤버별 게이지 배율: 탱커 크게 · 딜러 작게
export const KD_HERO = { wonsik: 2.4, jeongseob: 2.4, hyungyeong: 2.0, ingyu: 1.7, sunggu: 1.4, bangjang: 1.4, jungmin: 1.4, gunnyeo: 1.3, dohoon: 1.3, ara: 1.2, byunghwa: 1.2, donghan: 1.1, soyoung: 1.1,
  eunok: 1, hochan: 1, baul: 1, dragon: 1, junseo: 0.9, jieun: 0.9, subin: 0.9, youngjun: 0.9, staff: 0.85, hanna: 0.85, jiwon: 0.85, myunghoon: 0.8, sanghwa: 0.8, gunman: 0.75 };
// 서포터 전문 (덱에 있으면 팀 전체 · 상황마다 맞는 서포터를 고르게): res = 상태이상 저항 % (HERO_RES 와 더함 · 100 = 면역) · kdCut = 쓰러짐 게이지 덜 참 · heal = 초당 가장 찬 멤버 게이지 회복 · getUp = 쓰러진 멤버 일어나는 속도 ×
export const KD_SUP = {
  gunnyeo: { heal: 6, getUp: 1.8, tip: '쓰러짐 회복 — 가장 찬 멤버 게이지를 계속 내려 주고 쓰러진 멤버를 빨리 일으킨다 (응급 방패 = 바로 일으킴)' },
  jungmin: { res: { poison: 100 }, tip: '독 면역 — 붕대 해독 (팀 전체) · 입구 수리' },
  dohoon: { res: { stun: 50 }, tip: '기절 저항 — 떼창으로 정신 번쩍 (팀 전체 기절 시간 절반)' },
  soyoung: { res: { charm: 100, silence: 50 }, tip: '홀림 면역 — 잔소리로 정신 차리게 (팀 전체 · 침묵 절반)' },
  bangjang: { kdCut: 0.2, tip: '지휘 — 팀 전체 쓰러짐 게이지 20% 덜 참 ("버텨!")' },
  dragon: { res: { freeze: 50 }, tip: '빙결 저항 — 박나뇽 불 곁은 따뜻해서 팀 전체 빙결 시간 절반 (7장 스키장)' },
};
// 진상 투척 예고 (10/08 진상 리메이크): 멤버를 노리는 기술은 바로 날아오지 않는다 — wind 초 동안 진상이 멈춰 팔을 젖히고 노리는 멤버 발밑에 표적
//  그 사이 기절 · 빙결 · 밀치기 · 묶기 · 시간 정지면 "끊김!" (안 던지고 breakWeak 초 빈틈) — 느린 템포라 스킬로 끊는 게 의미 있게
//  hit: 맞은 멤버 쓰러짐 게이지에 바로 더하는 양 (상태이상 시간과 별개) × elite · mid · boss · throwHit: 진상 고유 투척(뒷담화 · 골프공 · 보스 가방 …) 한 방 · kind: 던지는 물건마다 예고 시간
export const ECAST = { wind: 0.75, windBoss: 0.95, reach: 340, hit: 9, throwHit: 6, elite: 1.3, mid: 1.8, boss: 2, breakWeak: 1.2,
  bump: { mukti: 6, cutter: 8, drunk_run: 6, clubgirl: 5, carpoor: 10, liftcut: 6, sledgirl: 9, drunkfriend: 6, snowboard: 6, mid_mukti: 10, fuse_taxi: 12, mid_carpoor: 14, mid_sledgirl: 14, mid_drunkfriend: 10, fuse_lift: 10, rush: 8 }, // 돌진 · 새치기 진상이 입구에 처음 닿을 때 앞 멤버 들이받기 (게이지)
  kind: { rumor: 0.7, paper: 0.75, sarcasm: 0.7, golf: 0.8, duck: 0.9, bag: 0.85, stamp: 0.85, glow: 0.8, snowball: 0.8, bottle: 0.6, latte: 0.8, puke: 0.8 } };
// 진상 기술 상태이상 이름 · 색 · 막는 멤버 (정보 카드 · 상성 경고 · 표적 표시 공용)
export const EST = {
  stun: { name: '기절', color: '#ffd23f', icon: '⭐', counter: ['gunnyeo', 'dohoon', 'sunggu', 'wonsik'] },
  charm: { name: '홀림', color: '#ff6fb5', icon: '♥', counter: ['soyoung', 'gunnyeo', 'hanna'] },
  poison: { name: '독', color: '#8fe85a', icon: '☠', counter: ['jungmin', 'gunnyeo'] },
  freeze: { name: '빙결', color: '#9ff0ff', icon: '❄', counter: ['dragon', 'gunnyeo', 'sunggu'] },
  silence: { name: '침묵', color: '#b48cff', icon: '✕', counter: ['soyoung', 'byunghwa', 'sunggu'] },
  slow: { name: '공속↓', color: '#6fb3ff', icon: '↓', counter: ['gunnyeo', 'bangjang'] },
  blind: { name: '눈부심', color: '#fff4b0', icon: '✷', counter: ['gunnyeo', 'bangjang'] },
  door: { name: '입구 강타', color: '#ff5a4f', icon: '!', counter: ['jungmin', 'wonsik', 'jeongseob', 'dohoon'] },
  heal: { name: '회복', color: '#7dff9a', icon: '+', counter: ['jiwon', 'dragon', 'ara'] },
};
// 화상 (박나영): tick 초마다 · 겹마다 +stack · 최대 max 겹 — 방어율 무시
export const BURN = { tick: 0.5, stack: 0.5, max: 3 };
export const TEMPO = { proj: 0.32, count: 0.6, hp: 1.5, hellHp: 1.5, hellCh: [1.749, 1.453, 1.668, 1.467, 1.9, 1.234], /* (10/09 카드 개편 뒤 헬 1장 68% · 3장 57% → 목표 45 · 38 쪽으로) */ endHp: 1.1, fix: { gunnyeo: 1.25, donghan: 3.4, wonsik: 2.4, staff: 1.35, eunok: 0.6, myunghoon: 1.65, bangjang: 0.92, soyoung: 1.9, junyoung: 2.4, ingyu: 2.4, jiwon: 2.0, jungmin: 1.7, gunman: 2.0, junseo: 3.5, ara: 2.0, youngjun: 0.95, jieun: 2.4, baul: 1.1, sanghwa: 3.9, hanna: 1.5, hochan: 1.75, hyungyeong: 1.15, sunggu: 1.55, subin: 2.1, dragon: 1.7 }, rate: 1 / 1.3, dmg: 1.35, cd: 1 }; // cd 1: 쿨 다양화 (스킬마다 실제 초)
// 이호찬 (템포): 기본 공격 없이 게이지 → 막차 버스가 자기 줄을 달려 올라가며 진상을 밀어낸다 · Lv5 기절 · 진화 = 2층 버스 (두 줄 폭)
export const BUS = { sec: [6.4, 6, 5.6, 5.2, 4.8], w: 110, w2: 200, speed: 560, kb: 90, dmg: 7, stun: 0.9 }; // (dmg 9 → 7: 헬 7-10 에서 혼자 피해 89% — 버스 한 대로 판을 끝내지 않게) // (템포에선 버스가 '랑방을 위하여' 팀 버프도 건다: LEGEND 가 혼자 캐리보다 팀을 키우게)
// 투사체 그림 (fx/w_<이름>.webp · 오른쪽을 보는 그림 → 날아가는 방향으로 돌림) — 없으면 코드로 그린 모양
export const PROJ_ART = { staff: 'card_y', eunok: 'cup', ingyu: 'dumbbell', soyoung: 'bubble', donghan: 'coffee', sunggu: 'cane', gunnyeo: 'heart', junyoung: 'chip', ara: 'hammer' }; // (대개편: 건전남 권총 · 박상화 장미 · 정원식 주먹 · 여지원 점멸 손 · 오지은 · 서명훈 · 홍정민은 kitfx.js 코드 그림)
export const PROJ_ART_NAMES = ['bottle', 'cup', 'coin', 'dumbbell', 'bubble', 'card_y', 'card_r', 'bb', 'coffee', 'cane', 'mosaic', 'heart', 'chip', 'hammer', 'claw', 'clock', 'swear'];
// 무기: 멤버마다 컨셉 물건 하나 (총 없음) · kind = 방식 · mag = 한 번에 몇 발 (연발·속사) · gap = 탄창 안 간격 (공격 간격 비율)
//   장전 시간 = 탄창 × 간격 − (탄창−1) × gap 간격 → 평균 DPS 는 그대로, 리듬만 "몇 발 → 장전"
//   진화: Lv3 탄창 +1 · Lv5 관통 +1 (연발·속사) 또는 범위 +25% · 진화 카드 = 큰 투사체
export const WEAPON = {
  bangjang: { item: '확성기 지시', kind: 'melee', reload: '목 가다듬기' },
  staff: { item: '경고 딱지', kind: 'burst', mag: 2, gap: 0.3, reload: '수첩 넘기기' },
  gunman: { item: '권총', kind: 'pistol', reload: '탄창 갈기' }, // (대개편: 새총 연사 → 권총 한 발씩 · 레벨마다 연발)
  gunnyeo: { item: '하트 폭탄', kind: 'lob', reload: '구급상자 열기' },
  myunghoon: { item: '욕 "#@!%" 번개', kind: 'chain', reload: '숨 고르기' },
  dohoon: { item: '마이크 떼창', kind: 'aura', reload: '물 한 모금' },
  ingyu: { item: '굴리는 덤벨', kind: 'pierce', reload: '덤벨 다시 들기' },
  donghan: { item: '뜨거운 커피', kind: 'lob', reload: '커피 리필' },
  youngjun: { item: '블랙캣 후드 러시', kind: 'melee', reload: '숨 고르기' },
  eunok: { item: '소주잔', kind: 'burst', mag: 2, gap: 0.3, reload: '소주 한 잔 원샷' },
  hanna: { item: '윙크 하트', kind: 'beam', reload: '거울 보기' },
  sunggu: { item: '지팡이', kind: 'pierce', reload: '허리 펴기' },
  junseo: { item: '여사친 소개', kind: 'homing', reload: '연락처 뒤지기' },
  hyungyeong: { item: '몸통 박치기', kind: 'melee', reload: '간식 한 입' },
  ara: { item: '공주 망치', kind: 'heavy', reload: '"아이고 허리야"' },
  hochan: { item: '금빛 확성기', kind: 'gauge', reload: '막차 버스 호출' },
  soyoung: { item: '잔소리', kind: 'nag', reload: '숨 고르기' },
  jieun: { item: '바닥 시계', kind: 'zone', reload: '태엽 감기' },
  sanghwa: { item: '매너 장미', kind: 'curve', reload: '장미 다듬기' },
  jungmin: { item: '거꾸로 든 소주병', kind: 'melee', reload: '새 병 따기' },
  jiwon: { item: '점멸 모자이크 손', kind: 'blink', reload: '손 풀기' },
  wonsik: { item: '덤벨', kind: 'heavy', reload: '덤벨 다시 들기' },
  jeongseob: { item: '두 팔', kind: 'melee', reload: '앉아서 쉬기' },
  byunghwa: { item: '핀 조명', kind: 'pull', reload: '조명 맞추기' },
  baul: { item: '스노보드', kind: 'board', reload: '보드 정비' },
  subin: { item: '리본', kind: 'helix', reload: '리본 다시 감기' },
  dragon: { item: '박나뇽의 불', kind: 'cone', reload: '박나뇽 숨 고르기' },
};
// 밸런스 개편 (역할 · 상성 · 난이도) — 숫자는 모의 전투로 맞춘 값
export const BAL = {
  chHp: { 1: 1, 2: 0.72, 3: 0.8, 4: 0.8, 5: 0.8, 6: 0.8 }, endHp: 0.9, // 장마다 적 체력 (개편으로 줄어든 팀 화력 · 느려진 레벨업만큼)
  expCh2: 1.6, // 2장부터 레벨업에 경험치 1.6배 (카드가 너무 자주 떠서 · 1장은 그대로 빠르게)
  aoeMain: ['eunok', 'hyungyeong', 'donghan', 'soyoung', 'gunnyeo', 'dohoon'], // 범위가 주 역할 (범위 그대로)
  incSplashDmg: 0.4, incSplashR: 0.75, splashCap: 1.5, // 나머지 멤버의 곁다리 범위: 피해 40% · 반경 75% · 카드 범위 배율 최대 1.5
  fast: { types: ['mukti', 'cutter', 'drunk_run', 'clubgirl', 'mid_mukti', 'fuse_taxi'], dodge: 0.3, dodgeAoe: 0.15, dodgeBig: 0.2, atkMul: 1.5, atkInt: 0.55, from: 4 },
  noMiss: ['gf', 'swear', 'tick'], // 따라가는 · 튕기는 · 시간 멈춤 공격은 못 피한다
  aura: { id: 'sunggu', r: 130 }, // 강성구: 가까운 멤버 기절·침묵·붙잡힘 면역
  hochan: { metaSoft: 10, metaAbove: 1, busBoss: 0.85 }, // (metaAbove 0.8 → 1: 장별 강화 권장 상한(softMeta)이 생겨서 따로 깎지 않음)
  ara: { oldMul: 0.32, oldInt: 1.6, hitMul: 1.6, bossMul: 1.1, dashSpd: 11 },
};
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
export function metaCost(lv) { // (10/08) +5 · +10 · +15 · +20 (각성 이정표 META_MILESTONE) 는 두 배 — 장마다 넘는 벽
  return Math.round((40 * Math.pow(lv + 1, 1.7) * ((lv + 1) % 5 === 0 ? 2 : 1)) / 10) * 10;
}
// 아이템: 코인으로 사는 영구 강화 (레벨제)
export const ITEMS = {
  door: { id: 'door', icon: '🚪', name: '튼튼한 문', max: 15, per: 0.1, base: 150, desc: (v) => `입구 내구도 +${pct(v)}` },
  coupon: { id: 'coupon', icon: '🎟️', name: '단골 쿠폰', max: 15, per: 0.04, base: 250, desc: (v) => `스테이지 코인 보상 +${pct(v)}` },
  battery: { id: 'battery', icon: '🔋', name: '확성기 배터리', max: 15, per: 0.08, base: 120, desc: (v) => `총공지 충전 +${pct(v)}` },
  charm: { id: 'charm', icon: '🍀', name: '행운 부적', max: 15, per: 0.015, base: 165, desc: (v) => `치명타 확률 +${pct(v, 1)}` },
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
// Lv.11~15 (5·6장에서 열리는 윗단계): 값이 가파르게 (×1.6 씩) · 효과는 한 단계에 절반
export const ITEM_TOP = { from: 10, costMul: 1.6, perMul: 0.5 };
export function itemCost(id, lv) {
  const it = ITEMS[id];
  if (!it || lv >= it.max) return null;
  if (it.costs) return it.costs[lv];
  return Math.round((it.base * Math.pow(lv + 1, 1.6) * (lv >= ITEM_TOP.from ? Math.pow(ITEM_TOP.costMul, lv - ITEM_TOP.from + 1) : 1)) / 10) * 10;
}
export function itemValue(id, lv) { const per = ITEMS[id] ? ITEMS[id].per : 0; lv = lv || 0; return per * Math.min(lv, ITEM_TOP.from) + per * ITEM_TOP.perMul * Math.max(0, lv - ITEM_TOP.from); }
// 진행도에 따라 살 수 있는 레벨 상한 (깬 장 수 0~6) — 이미 산 레벨은 그대로 둔다 (깎지 않음)
export const ITEM_LV_CAP = { stat: [3, 5, 7, 9, 10, 12, 15], drink: [1, 2, 2, 3, 3, 3, 3] };
export function itemLvCap(id, maxStage) {
  const it = ITEMS[id]; if (!it) return 0;
  const c = Math.max(0, Math.min(6, Math.floor((maxStage | 0) / STAGES_PER_CHAPTER)));
  const t = id === 'drink' ? ITEM_LV_CAP.drink : it.costs ? null : ITEM_LV_CAP.stat;
  return t ? Math.min(it.max, t[c]) : it.max;
}
// 다음 레벨을 사려면 몇 장을 깨야 하나 (0 = 지금 살 수 있음 · null = 최대)
export function itemGateCh(id, lv, maxStage) {
  const it = ITEMS[id]; if (!it || lv >= it.max) return null;
  if (lv < itemLvCap(id, maxStage)) return 0;
  for (let c = 1; c <= 6; c++) if (itemLvCap(id, c * STAGES_PER_CHAPTER) > lv) return c;
  return null;
}

// ─── 스테이지 ─────────────────────────────────────────
// 3챕터 × 10스테이지. 스테이지 번호 s = 1..30 ('1-1' … '3-10')
export const STAGE_WAVES = 5;
export const STAGES_PER_CHAPTER = 10;
export const STAGE_COUNT = 80; // 8장 결혼식 뒤풀이 까지
export const CHAPTERS = [
  {
    id: 1, name: '랑방 골목', desc: '꼬충들이 기웃거리는 우리 동네 골목', color: '#ffd23f',
    names: ['골목 입구', '편의점 앞', '먹튀 출몰', '비틀비틀 술진상', '두목의 등장', '꼬충 러시', '골목 포장마차', '막차 시간', '새벽 두 시', '여왕벌 강림'],
  },
  {
    id: 2, name: '불금 번화가', desc: '사기꾼과 라이벌 모임 "인피"가 나타난 금요일 밤', color: '#ff6fd8',
    names: ['불금 시작', '가입인사 사기꾼', '뒷담화 골목', '인피 패거리', '인피 행동대장', '만취 대행진', '독재자 등장', '택시 대란', '첫차 전쟁', '번화가 삐끼왕'],
  },
  {
    id: 3, name: '인피 아지트', desc: '라이벌 모임 인피의 본거지로 쳐들어간다', color: '#57d68d',
    names: ['아지트 입구', '뒷담화 복도', '끼리끼리 방', '사기꾼 소굴', '연합 회장실', '독재자의 연설', '인피 총동원', '오리고기 냄새', '최후의 방어선', '인피 대장'],
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
  {
    id: 7, name: '스키장 MT', desc: '겨울 스키장 MT — 얼리고 · 막고 · 들이받는 진상들. 조합과 컨트롤이 없으면 못 깬다', color: '#7fd6ff', hard: true,
    names: ['리조트 도착', '리프트 대기줄', '초보 슬로프', '눈썰매장', '펜션 사장님', '야간 스키', '눈싸움 대첩', '핫팩 실종 사건', '정상 휴게소', '리조트 갑부 회장'],
  },
  {
    id: 8, name: '결혼식 뒤풀이', desc: '친구 결혼식 뒤풀이 — 축의금 도둑을 놓치지 마! 끝없는 축사까지 끊어야 한다', color: '#ffb3d1', hard: true,
    names: ['뒤풀이 입구', '축의금 접수대', '뷔페 홀', '축가 무대', '예식장 실장님', '포토존', '부케 던지기', '신랑 친구들 테이블', '뒷문 탈출', '끝없는 축사'],
  },
];
// ─── 멤버 획득 규정 (10/09 · '자동 합류 · 뽑기 · 등급이 중구난방' 정리) ───
//  등급 ↔ 길이 하나로 맞는다:
//   T1 = 시작 멤버 (처음부터 4명)
//   T2 = 스토리 합류 (1~2장 정해진 스테이지를 처음 깨면 확정) — 모집에는 안 나온다
//   T3 = 스토리 합류 (2~3장) 또는 모집 카드 10장 — 두 길이 만나는 등급 (모집 T3 는 장 끝 '합류 선택권'으로 골라서도)
//   T4 = 모집만 (나오면 바로 합류 · 50번 천장 · 주간 픽업 50%) — 8-10 클리어 'T4 합류 선택권' 하나
//   LEGEND = 4-10 클리어 뒤 모집 (90번 확정) · 진상의 탑 60층 선택
//   HIDDEN = 숨은 조건 (조건은 도감에 힌트만) — 박나영
//  이벤트 의상은 멤버가 아니다 (이미 있는 멤버의 옷) · 겹치면 카드(★ 승급 조각)로
// 스토리 합류: 이 스테이지를 처음 깨면 영구 합류 (출전 동료로 고를 수 있다) — 1장 안에 탱커 · 범위 공격까지 손에 들어오게
export const HERO_UNLOCK = { jungmin: 3, ingyu: 6, eunok: 10, sanghwa: 11, myunghoon: 13, hanna: 15, dohoon: 17, sunggu: 20, donghan: 22, youngjun: 23 }; // 1-3 · 1-6 · 1-10 · 2-1 · 2-3 · 2-5 · 2-7 · 2-10 · 3-2 · 3-3
// 스토리 합류 장면 한 줄 (스테이지 클리어 '합류!' 연출 · 도감 획득 방법)
export const STORY_JOIN = {
  jungmin: '먹튀가 걷어찬 입구 문짝 — 지나가던 홍정민이 공구함을 열었다',
  ingyu: '꼬충 떼가 몰려오자 오토바이 소리와 함께 백인규가 앞을 막아섰다',
  eunok: '여왕벌을 쫓아낸 밤, 술잔을 든 최은옥이 "나도 끼워 줘" 하고 앉았다',
  sanghwa: '불금 첫 손님 — 좋은남자 박상화가 지갑을 열며 합류했다',
  myunghoon: '뒷담화 골목에서 실눈 뜬 서명훈이 "다 들었어" 하고 나타났다',
  hanna: '인피 행동대장을 윙크 한 번으로 돌려보낸 이한나',
  dohoon: '독재자의 연설을 앵콜 떼창으로 덮어 버린 김도훈',
  sunggu: '삐끼왕을 지팡이로 혼낸 동네 어르신 강성구가 모임에 들어왔다',
  donghan: '아지트 복도에서 졸다 깬 문동한 — "어, 여기 인피야?"',
  youngjun: '끼리끼리 방을 번개처럼 뚫고 들어온 김영준',
};
// 숨은 조건 (HIDDEN): 이 스테이지를 별 stars 개로 깨면 합류 — 조건은 합류 전엔 힌트만 보인다
export const HIDDEN_COND = { dragon: { stage: 46, stars: 3, hint: '5장 캠프파이어 불씨 속에서 무언가가 꿈틀거린다… (입구를 완벽하게 지켜 내면?)', text: '5-6 캠프파이어를 ★★★로 깨면 합류' } };
// 합류 선택권: 장 끝 보스를 처음 깨면 모집 멤버 중 한 명을 골라 바로 합류 (이미 다 있으면 고른 멤버 카드 30장)
export const JOIN_PICKS = [{ stage: 30, tier: 3 }, { stage: 50, tier: 3 }, { stage: 70, tier: 3 }, { stage: 80, tier: 4 }]; // 3-10 · 5-10 · 7-10 = T3 · 8-10 = T4
export const JOIN_PICK_DUP = 30;
// 예전 규정 (10/09 전): 이 스테이지 기록이 있으면 이미 가진 멤버 — 옮길 때 지키는 용도 (live.js acqMigrate)
export const ACQ_OLD_UNLOCK = { dohoon: 6, eunok: 10, myunghoon: 13, hanna: 15, ingyu: 17, sunggu: 20, donghan: 22, youngjun: 23, dragon: 46, subin: 75 };
export const ACQ_V = 1; // 획득 규정 버전 (올리면 acqMigrate 가 다시 돈다)
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
// 별: 클리어 때 입구 내구도 60% 이상 ★★★, 30% 이상 ★★, 그 밖 ★
//  (1-4 부터는 ★★★ 에 스테이지 미션도 필요 — 미션을 못 하면 ★★)
export const STAR_DOOR = [0.6, 0.3]; // (10/08 긴장감: 입구가 꾸준히 깎이는 판이라 70% · 35% → 60% · 30%)
export function starsFor(hpFrac, mission = true) { return hpFrac >= STAR_DOOR[0] ? (mission ? 3 : 2) : hpFrac >= STAR_DOOR[1] ? 2 : 1; }

// 난이도 숫자 (밸런스 스크립트 scripts/lb-balance.js 로 맞춘 값)
export const STAGE = {
  levelPerStage: 0.55, levelPow: 0.8, wavePerStage: 0.08,
  chapterAdd: [2, 2.8, 0.2, 1.6, 1.7, 1.4], // (10/03 재보정: 기준 플레이어를 사람처럼 바꾸고 다시 맞춤 — 도감 · ★ · 카드 개편으로 쉬워진 만큼 장마다 +0.5~+2.5) · (주력 · 큰 카드 개편: 레벨업이 줄어든 만큼 3~6장 −0.3/−0.5/−1/−1) · 2챕터부터 동료가 2명이라 그만큼 더 단단하게 (첫 웨이브 난이도 = 1 + 1.1 × (s-1)^0.8 + 챕터 보정)
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
  // (11~60: 2026-10 덱 구성 개편 뒤 'node scripts/lb-balance.js stagecalib' 로 균형 덱(조건 맞춤) 기준 다시 맞춤)
  stageAdd: {3: 2.5, 4: 6.5, 5: -6.75, 6: 3.06, 7: 0.38, 8: 4.34, 9: -0.11, 10: -8, 11: 6.07, 12: 7.15, 13: 0, 14: 8.37, 15: -6.63, 16: 5.61, 17: -1.83, 18: -1.38, 19: 5.75, 20: -1.38, 21: 3.38, 22: 1.5, 23: 7.05, 24: 4.41, 25: -8.81, 26: -0.5, 27: -0.64, 28: 2.97, 29: -7.28, 30: -6.18, 31: -4.57, 32: -2.44, 33: 1.78, 34: -5.44, 35: -4, 36: -3.39, 37: 7.63, 38: 2.94, 39: -2.63, 40: -20.75, 41: -1.19, 42: 6.2, 43: 1.06, 44: -15, 45: 1.13, 46: 8.57, 47: 7.06, 48: -3.69, 49: -4.82, 50: -4.25, 51: -6, 52: 3.54, 53: 0.15, 54: -11.81, 55: -0.5, 56: -15.75, 57: 3.13, 58: -5, 59: -0.75, 60: -6.73}, // (10/08 진상 감사 재보정: 1-9 · 1-10 · 2-10 · 3-2 · 3-8 · 4-1 · 5-2 · 5-7 · 6-3 · 6-6 · 6-7) 챕터 끝 보스 바로 앞 스테이지는 살짝 더
  augAdd: 2, // 증강(1·3·4웨이브)이 생겨서 진상도 그만큼 조금 세게
  themeLevel: { violent: -1.2 }, // 폭력형 스테이지는 단단한 적이 많아서 조금 낮게 // 나머지 계열 비중
};
// ── 7장 스키장 MT: 난이도 숫자 (기존 1~6장 값은 그대로 · 이 블록만 7장) — scripts/lb-balance.js ch7 로 맞춘 값 ──
//   목표: 한 명만 키운 덱 < 30% · 역할을 갖춘 T3/T4 강화 덱 50~70% · 키운 LEGEND 포함 덱은 그보다 높게 · 헬은 더 어렵게
export const CH7 = { chapterAdd: 1, boss: [-3.5, -4.5], deckHp: 1.8, hpTune: 0.76, /* (0.84 → 0.76: 문동한 한 방 하향만큼 역할 덱이 비슷하게) */ swarm: 3.0, chHp: 0.8, joinHp: 2.6, hellCh: 1.234,
  stageAdd: { 61: -1.97, 62: -3.49, 63: -3.63, 64: -6.06, 65: -3.08, 66: -9, 67: 6.28, 68: -6.17, 69: -8.88, 70: -13}, waveAdd: [-4, -2, 0, -1.5, 1],
  coldTier: [1, 1.4, 1.2, 1, 0.75, 0.45], thaw: 2 }; // thaw: 눈덩이 빙결이 풀린 뒤 2초는 다시 안 언다 // 겨울 산 적응: 등급이 높은 멤버일수록 빙결 · 침묵 · 추위(공속↓)가 짧다 (T1 ×1.3 … LEGEND ×0.55) // waveAdd: 첫 웨이브(대장 혼자)는 덜 · 뒤 웨이브와 보스는 더
STAGE.chapterAdd[6] = CH7.chapterAdd; STAGE.bossStage[7] = CH7.boss; STAGE.deckHp[6] = CH7.deckHp; STAGE.hpTune[6] = CH7.hpTune; STAGE.swarm[6] = CH7.swarm;
Object.assign(STAGE.stageAdd, CH7.stageAdd);
STAGE.waveAdd = Object.assign(STAGE.waveAdd || {}, { 7: CH7.waveAdd });
BAL.chHp[7] = CH7.chHp; JOIN.hp[6] = CH7.joinHp; TEMPO.hellCh[6] = CH7.hellCh;
// ── 8장 결혼식 뒤풀이: 난이도 숫자 (이 블록만 8장 · 7장과 같은 틀) — scripts/lb-balance.js ch8 로 대충 맞춘 값 (전체 재계산은 stagecalib 로) ──
//   thief: 축의금 도둑이 위로 달아나면 이번 판 스테이지 코인 −per (최대 −cap) — 서버 server/langbang-rules.js THIEF 와 같아야 한다 (테스트가 검사)
export const CH8 = { chapterAdd: 4, boss: [-3.5, -4.5], deckHp: 1.8, hpTune: 0.76, swarm: 3.0, chHp: 1.0, /* (0.8 → 1.0: 8장 앞쪽은 레벨 가드레일에 닿아서 체력으로) */ joinHp: 2.6, hellCh: 1.131, /* (0.49 → 0.43: 10/07 대개편 뒤 헬 8장 28% → 50%대) */
  stageAdd: { 71: -2.33, 72: -7, 73: -12.68, 74: -3.83, 75: -9.95, 76: -2.44, 77: -8.69, 78: -4.45, 79: -11, 80: -2}, waveAdd: [-4, -2, 0, -1.5, 1],
  thief: { per: 0.08, cap: 0.4 }, rushSpd: 1.3, rushAtk: 1.4 };
STAGE.chapterAdd[7] = CH8.chapterAdd; STAGE.bossStage[8] = CH8.boss; STAGE.deckHp[7] = CH8.deckHp; STAGE.hpTune[7] = CH8.hpTune; STAGE.swarm[7] = CH8.swarm;
Object.assign(STAGE.stageAdd, CH8.stageAdd);
STAGE.waveAdd[8] = CH8.waveAdd;
// 스테이지별 진상 체력 배율 — 레벨 가드레일에 걸려 레벨로 더 못 올리는 판만 (8-9: 약 90% 로 너무 쉬웠음)
export const STAGE_HPX = { 6: 1.35, 13: 2.4, 14: 2.8, 15: 6.5, 23: 1.5, 27: 1.97, 47: 1.6, 56: 0.72, 59: 1.34, 71: 1.27, 74: 1.15, 76: 1.15, 79: 2.2 }; // (10/08 긴장감 재보정: 2-3 · 2-4 · 3-3 · 3-7 · 5-7 · 6-9 는 레벨 가드레일에 닿아 체력으로) // (10/08 8-6 1.15: 가드레일에 닿아 체력으로) 진상 체력 배수 (스테이지별): 1-6 · 2-5 는 너무 쉬워서 (2-5 는 보스까지 순식간이라 크게) · 8-9 상향 · (10/07 대개편 맞춤: 2-4 · 5-7 · 8-1 · 8-9 는 가드레일에 닿아 체력으로)
BAL.chHp[8] = CH8.chHp; JOIN.hp[7] = CH8.joinHp; TEMPO.hellCh[7] = CH8.hellCh;
// 축의금 도둑: 도망간 수 → 코인 깎이는 비율 (8% 씩 · 최대 40%)
export const thiefCut = (n) => Math.min(CH8.thief.cap, CH8.thief.per * Math.max(0, Math.floor(Number(n) || 0)));
// 덱 5명으로 싸우니 적도 그만큼 단단하게 — 1-1 은 연습이라 그대로, 1-3 부터 본격
export function stageHpScale(s) { return (1 + (STAGE.deckHp[chapterOf(s) - 1] - 1) * Math.min(1, (s - 1) / 2)) * (s <= 2 ? [0.7, 0.8][s - 1] : STAGE.hpTune[chapterOf(s) - 1] || 1); } // 1-1 · 1-2 는 튜토리얼 (어떤 덱이든 쉽게)
export function stageLevel(s, w) {
  const n = stageNo(s);
  const bs = STAGE.bossStage[chapterOf(s)];
  const boss = n === 10 ? bs[1] : n === 5 ? bs[0] : 0;
  // 첫 웨이브는 새로 시작한 멤버도 버티게 천천히, 스테이지 안에서 웨이브마다 가파르게 (뒤 스테이지일수록 더)
  return 1 + STAGE.levelPerStage * Math.pow(s - 1, STAGE.levelPow) + (w - 1) * (STAGE.levelPerWave + STAGE.wavePerStage * Math.min(s - 1, 29)) + boss + STAGE.chapterAdd[chapterOf(s) - 1] + (STAGE.themeLevel[stageTheme(s)] || 0) + (STAGE.stageAdd[s] || 0) + (s >= 3 ? STAGE.augAdd * Math.min(1, (s - 2) / 3) * (s > 20 ? 1.3 : 1) : 0) + (((STAGE.waveAdd || {})[chapterOf(s)] || [])[w - 1] || 0); // waveAdd: 장별 웨이브 보정 (7장)
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
  ['yeokko:0.7 namkko:0.7 scammer:0.25 couple:0.12', '"VIP 무료입장~!" 번화가 삐끼왕이 손님을 싹 끌고 왔다 — 행동대장까지'],
  // 3장 인피 아지트
  ['inpi_clique:0.6 kkondae:0.1 thug:0.15', '인피 아지트 입구 — 꼰대 문지기가 "라떼는~"'],
  ['inpi_gossip:0.35 spam:0.15 selfie:0.12 earphone:0.15', '복도마다 수군수군, 단톡방 알림 — 이어폰 낀 사람은 못 들은 척'],
  ['inpi_clique:0.8 inpi_gossip:0.15 inpi_treasurer:0.14 inpi_dictator:0.08', '끼리끼리 뭉친 패거리 — 범위 공격으로 한 번에'],
  ['scammer:0.5 handsy:0.15 couple:0.12', '사기꾼들의 소굴, 예쁜 프사에 속지 마'],
  ['thug:0.3 gao:0.2 inpi_clique:0.4', '진상 연합 회장이 폭력배 두목을 경호원으로 데리고 아지트에 왔다'],
  ['inpi_dictator:0.15 inpi_clique:0.6 kkondae:0.1 inpi_treasurer:0.06', '독재자의 연설에 패거리가 한껏 단단해졌다'],
  ['inpi_clique:0.5 inpi_gossip:0.2 inpi_dictator:0.08 inpi_treasurer:0.08', '인피 전원 출동!'],
  ['drunk:0.6 vomit:0.12 spam:0.08 mukti:0.2', '오리고기 회식 냄새에 먹튀와 토하는 인간이 몰렸다'],
  ['inpi_treasurer:0.07 inpi_dictator:0.06 inpi_clique:0.5 gao:0.12', '보호막 뿌리는 총무와 독재자 — 누구부터 잡을까'],
  ['inpi_clique:0.5 inpi_gossip:0.25 spam:0.12', '인피 대장과 진상 연합 회장 — 아지트 최종 결전'],
  // 4장 랑방 여행 편
  ['cutter:0.3 fakesingle:0.3 namkko:0.3 carpoor:0.2', '출국 수속 줄에 새치기꾼, 그리고 "저 싱글이에요~"'],
  ['carpoor:0.35 selfie:0.15 fakesingle:0.4 couple:0.1', '면세점 명품 코너에 카푸어와 셀카족'],
  ['drunk:0.6 kkondae:0.12 vomit:0.2 thug:0.12', '기내 진상: 술 달라, 토하고, "라떼는~"'],
  ['secretmom:0.3 fakesingle:0.4 carpoor:0.25 noshow:0.18', '렌터카 줄 — 그리고 당일 아침 「약속 취소~」'],
  ['kkondae:0.15 fakesingle:0.45 gao:0.12', '꼰대 + 돌싱 + 찌질을 다 가진 보스가 나타났다'],
  ['kkondae2:0.12 secretmom:0.25 carpoor:0.25 cutter:0.2', '돌담길에 울리는 골프 꼰대의 "나이스 샷!"'],
  ['selfie:0.2 couple:0.15 fakesingle:0.4 carpoor:0.3', '유채꽃밭 인생샷 전쟁 — 셀카족과 커플'],
  ['sarcasm:0.15 drunk:0.5 kkondae2:0.1 gao:0.15', '횟집에서 돌려까기 장인이 "어머 많이 먹는다~"'],
  ['secretmom:0.3 fakesingle:0.4 sarcasm:0.12 noshow:0.15', '게스트하우스 파티 — 거짓말쟁이들과 뒷담러, 약속취소 빌런'],
  ['secretmom:0.3 carpoor:0.25 sarcasm:0.12 fakesingle:0.3', '여왕된장싱글맘이 명품 가방을 휘두른다'],
  // 5장 MT · 펜션 편
  ['sales:0.3 carpoor:0.2 fakesingle:0.3', '펜션 주차장에 영업쟁이가 먼저 와 있다'],
  ['mukti:0.3 cutter:0.25 jjijil:0.35 drunk_run:0.25', '마트 장보기 — 먹튀 · 새치기 · 찌질남'],
  ['drunk:0.6 vomit:0.15 jjijil:0.18 gao:0.1', '고기 굽는 연기 속 술진상과 찌질남'],
  ['sales:0.35 spam:0.15 secretmom:0.2', '"보험 하나 드세요!" 다단계 영업 러시'],
  ['sales:0.3 carpoor:0.25 kkondae2:0.1', '영업의 왕이 계약서를 들고 나타났다'],
  ['couple:0.15 jjijil:0.35 sarcasm:0.15 carpoor:0.2', '캠프파이어 앞 커플과 "왜 답장 안 해?" — 돌려까기에 카푸어 자랑까지'],
  ['selfie:0.2 inpi_gossip:0.2 couple:0.15 otaku:0.08', '노래방 대첩 — 마이크 뺏기 전쟁'],
  ['drunk_cry:0.35 drunk:0.5 vomit:0.2 drunk_run:0.3', '새벽 술판, 세 잔째부터 우는 진상'],
  ['otaku:0.15 jjijil:0.35 drunk_cry:0.25 thug:0.12', '오타쿠의 밤 — 피규어 부대 출동'],
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
  // 7장 스키장 MT (고난도): 얼리기 · 침묵 · 공속↓ · 보호 · 돌진 — 한 명만 키운 덱으론 못 깬다
  ['snowboard:0.45 liftcut:0.5 hotpack:0.2', '"오늘 파우더 미쳤다!" 리조트 입구부터 보드 과시남과 새치기 떼'],
  ['liftcut:0.7 snowboard:0.3 fakecoach:0.12', '리프트 줄에 두세 명씩 우르르 새치기 — 강습 사칭남이 "제가 알려 드릴게요~"'],
  ['fakecoach:0.18 sledgirl:0.35 snowball:0.2 liftcut:0.3', '초보 슬로프 — 눈싸움 원정대가 리프트 줄을 뚫고 내려온다'],
  ['sledgirl:0.45 snowball:0.25 hotpack:0.25', '눈썰매장 — 브레이크 없는 썰매가 입구로 돌진, 눈덩이에 멤버가 꽁꽁'],
  ['snowboard:0.4 fakecoach:0.15 snowball:0.2', '"여기 밤 10시 이후 소음 금지예요!" 펜션 사장님 등판 — 예고 중에 기절시켜 끊어라'],
  ['snowboard:0.4 hotpack:0.3 fakecoach:0.15 sledgirl:0.25', '야간 스키 — 어둠 속에서 줄을 휙휙 바꾸는 보드남과 핫팩 도둑'],
  ['snowball:0.45 liftcut:0.5 fakecoach:0.12', '과 대항 눈싸움 대첩 — 멀리서 날아오는 눈덩이부터 잡자'],
  ['hotpack:0.45 snowball:0.25 sledgirl:0.3 snowboard:0.2', '핫팩이 사라졌다! 손이 곱아 공격이 느려진다'],
  ['fakecoach:0.2 hotpack:0.3 snowboard:0.35 snowball:0.2', '정상 휴게소 — 사칭 강사단이 보호막을 두르고 버틴다'],
  ['snowboard:0.4 fakecoach:0.15 sledgirl:0.3 snowball:0.2', '드디어 리조트 갑부 회장 — 펜션 사장님까지 다시, 눈사태와 소음 금지가 동시에'],
  // 8장 결혼식 뒤풀이 (고난도): 축의금 도둑(봉투 들고 도망 → 코인 깎임) · 뷔페 회복 · 축가 공속↓ · 홀림 · 취한 무리
  ['drunkfriend:0.5 envthief:0.25 showoff:0.25', '친구 결혼식 뒤풀이 입구 — 벌써 취한 신랑 친구들 사이로 수상한 검은 정장이…'],
  ['envthief:0.5 drunkfriend:0.35 buffet:0.12', '축의금 접수대에 도둑이 줄을 섰다! 봉투를 들고 위로 달아나면 코인이 깎인다 — 놓치지 마'],
  ['buffet:0.35 drunkfriend:0.4 envthief:0.15', '뷔페 홀 — 산더미 접시를 든 아줌마가 먹으면서 곁의 진상까지 회복시킨다'],
  ['badsinger:0.2 drunkfriend:0.45 showoff:0.25', '축가 무대 — 음 이탈 축가에 귀를 막느라 공격이 느려진다. 노래 부를 때 기절시켜 끊자'],
  ['envthief:0.3 buffet:0.15 badsinger:0.12 drunkfriend:0.35', '"시간 없어요! 빨리빨리!" 예식장 실장님이 진상들을 재촉한다'],
  ['showoff:0.45 envthief:0.25 drunkfriend:0.3', '포토존 — 하객룩 과시녀가 셀카를 찍으며 남자 멤버를 홀린다'],
  ['showoff:0.3 buffet:0.2 badsinger:0.12 envthief:0.3', '부케 던지기 — 신부 친구가 부케를 들었다! 부케에 묶인 도둑은 못 도망간다'],
  ['drunkfriend:0.7 badsinger:0.15 buffet:0.15', '신랑 친구들 테이블 — 어깨동무한 취객들이 갈지자로 우르르'],
  ['envthief:0.6 drunkfriend:0.3 showoff:0.2', '뒷문 탈출 — 축의금 도둑단이 총출동! 봉투를 든 도둑부터 잡아라'],
  ['drunkfriend:0.45 envthief:0.25 badsinger:0.12 showoff:0.2', '신랑 친구 대표의 끝없는 축사 — "축사를 끊어라!" 실장님까지 다시 왔다'],
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
  // 규칙: x-5 = 그 장의 첫 보스 · x-10 = 그 장의 끝 보스(새 얼굴) + x-5 보스가 다시 (다른 장 보스를 끌어오지 않는다)
  const B5 = [null, ['boss_loan'], ['boss_gapjil'], ['boss_union', 'boss_thug'], ['boss_kkondol'], ['boss_sales'], ['boss_jusa'], ['mid_pension'], ['mid_hallmgr']];
  const B10 = [null, ['queen'], ['boss_bbikki', 'boss_gapjil'], ['boss_inpi', 'boss_union'], ['boss_queenmom', 'boss_kkondol'], ['boss_otaku', 'boss_sales'], ['boss_soloparty', 'boss_jusa'], ['boss_resort', 'mid_pension'], ['boss_bestman', 'mid_hallmgr']]; // 7-10: 회장 + 펜션 사장님 다시 · 8-10: 신랑 친구 대표 + 실장님 다시
  if (n === 5) return B5[ch] || [];
  if (n === 10) return B10[ch] || [];
  return [];
}
// 스테이지 보스 체력 배율 [첫 보스, 둘째 보스] — 보스를 바꾼 스테이지만 예전 난이도에 맞춤 (scripts/lb-balance.js deck · ch7)
export const STAGE_BOSS_HP = { 5: [2.2, 1], 10: [4, 1], 25: [0.5, 1], 30: [1, 0.7], 40: [1.35, 1.5], 50: [0.85, 0.8], 60: [0.7, 0.7], 65: [1.5, 1], 70: [0.7, 0.15], 75: [2.2, 1], 80: [0.7, 0.15] }; // (10/09 1-5 · 1-10 · 4-10 · 8-10: 너무 쉽고 짧아서 보스 체력 +) // (10/08 1-10 · 7-5 · 8-5: 레벨 가드레일에 닿아 보스 체력으로) // 3-5 · 3-10 진상 연합 회장(기술이 세서 체력은 낮게) · 7-10 다시 나온 펜션 사장님
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
    const pack = ENEMIES[type].pack || ENEMIES[type].group; // (group: 7장 리프트 새치기꾼 — 두세 명씩)
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
  const bh = STAGE_BOSS_HP[s];
  if (bh && bosses[0] && bh[0] !== 1) def.bossHp = bh[0];
  if (bh && bosses[1] && bh[1] !== 1) def.boss2Hp = bh[1];
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
  rain: { id: 'rain', icon: '🌧️', name: '비 오는 밤', short: '진상 −10% 느림 · 사거리 −10%', desc: '진상 이동 속도 -10% · 멤버 사거리 -10%', enemySpd: 0.9, range: 0.9 },
  fog: { id: 'fog', icon: '🌫️', name: '안개', short: '먼 사거리 −20% (말빨 그대로)', desc: '멀리 쏘는 멤버(사거리 400+) 사거리 -20% · 말빨은 그대로', longRange: 0.8 },
  blackout: { id: 'blackout', icon: '💡', name: '정전', short: '가끔 정전 · 가까운 진상만 보임', desc: '가끔 불이 꺼지면 가까운 진상과 지목한 진상만 보인다', every: 10, dark: 2.6, seeR: 190 },
  happy: { id: 'happy', icon: '🎉', name: '불금 해피아워', short: '진상 +25% · 경험치 +40%', desc: '진상 +25% · 경험치 +40%', spawn: 1.25, exp: 0.4 },
  karaoke: { id: 'karaoke', icon: '🎤', name: '노래방 소음', short: '말빨 +25% · 매력 −15%', desc: '말빨 멤버 피해 +25% · 매력 멤버 -15%', attr: { talk: 1.25, charm: 0.85 } },
  icy: { id: 'icy', icon: '❄️', name: '미끄러운 바닥', short: '넉백 +50%', desc: '넉백 거리 +50%', kb: 1.5 },
  feast: { id: 'feast', icon: '🔥', name: '회식 열기', short: '술 +30%', desc: '술 멤버 피해 +30% · 분노가 더 오래', attr: { booze: 1.3 }, rage: 1.3 },
  construction: { id: 'construction', icon: '🚧', name: '공사 중', short: '가운데로 몰림 · 범위 +30%', desc: '양옆이 막혀 진상이 가운데로 몰린다 · 범위 공격 범위 +30%', lane: [96, 264], splash: 1.3 },
  megaphone: { id: 'megaphone', icon: '📢', name: '인피 확성기', short: '10초마다 진상 +30% 빨라짐', desc: '10초마다 진상들이 3초 동안 30% 빨라진다', every: 10, sec: 3, speed: 1.3 },
  conveyor: { id: 'conveyor', icon: '🛄', name: '수하물 벨트', short: '가운데 줄 진상 +25% 빠름', desc: '가운데 벨트 위 진상 +25% 빨라짐 — 가운데 줄을 막아라', belt: [120, 240], beltMul: 1.25 },
  wind: { id: 'wind', icon: '🌬️', name: '제주 바람', short: '투사체가 옆으로 밀림', desc: '8초마다 바람 방향이 바뀌며 투사체가 옆으로 밀린다 · 진상 -5% 느림', every: 8, wind: 70, enemySpd: 0.95 },
  campfire: { id: 'campfire', icon: '🔥', name: '캠프파이어', short: '모닥불 · 술 +20%', desc: '가운데 모닥불 곁을 지나는 진상이 불탄다 · 술 멤버 +20%', fire: { x: 180, r: 58, dps: 10 }, attr: { booze: 1.2 } },
  snow: { id: 'snow', icon: '❄️', name: '연말 눈', short: '진상 −12% · 공속 −8%', desc: '진상 -12% 느림 · 멤버 공격 속도 -8% (손이 시려요)', enemySpd: 0.88, heroSpd: 0.92 },
  lightshow: { id: 'lightshow', icon: '🪩', name: '조명 쇼', short: '번쩍일 때 25% 빗나감', desc: '9초마다 2초 동안 번쩍! 멤버 공격 25% 빗나감', every: 9, strobe: 2, miss: 0.25 },
  blizzard: { id: 'blizzard', icon: '', name: '눈보라', short: '사거리 −15% · 공속 −10%', desc: '멤버 사거리 -15% · 공격 속도 -10% · 진상 -5% 느림 (7장)', range: 0.85, heroSpd: 0.9, enemySpd: 0.95 },
  // 8장 결혼식 뒤풀이 (정전 · 조명 쇼 · 미끄러운 바닥 · 안개와 같은 틀)
  champagne: { id: 'champagne', icon: '', name: '샴페인 바닥', short: '넉백 +40% · 진상 +5% 빠름', desc: '쏟아진 샴페인에 바닥이 미끌미끌 — 넉백 거리 +40% · 진상 이동 +5%', kb: 1.4, enemySpd: 1.05 },
  songnoise: { id: 'songnoise', icon: '', name: '축가 소음', short: '말빨 −15% · 공속 −7%', desc: '음 이탈 축가가 끝없이 — 말빨 멤버 피해 -15% · 멤버 공격 속도 -7%', attr: { talk: 0.85 }, heroSpd: 0.93 },
  dimlight: { id: 'dimlight', icon: '', name: '조명 암전', short: '가끔 암전 · 가까운 진상만 보임', desc: '신랑신부 입장처럼 가끔 조명이 꺼지면 가까운 진상과 지목한 진상만 보인다', every: 11, dark: 2.4, seeR: 200 },
  petals: { id: 'petals', icon: '', name: '꽃가루', short: '먼 사거리 −18%', desc: '꽃가루가 흩날려 앞이 안 보인다 — 멀리 쏘는 멤버(사거리 400+) 사거리 -18%', longRange: 0.82 },
};
// 스테이지별 맵 효과 (1챕터는 순하게, 뒤로 갈수록 적 구성과 맞물리게)
const STAGE_FX = [ // 속성 버프가 있는 효과(노래방·안개=말빨, 회식=술)는 그 속성이 추천인 스테이지에만
  'none', 'none', 'none', 'rain', 'none', 'icy', 'happy', 'rain', 'icy', 'karaoke',
  'happy', 'karaoke', 'rain', 'construction', 'icy', 'construction', 'karaoke', 'rain', 'blackout', 'feast',
  'megaphone', 'karaoke', 'construction', 'blackout', 'icy', 'happy', 'fog', 'rain', 'blackout', 'megaphone', // (3-10: 연합 회장(jerk)이 함께 나와 술 추천이 빠져서 회식 → 인피 확성기)
  'none', 'conveyor', 'wind', 'conveyor', 'wind', 'happy', 'wind', 'rain', 'fog', 'conveyor',
  'none', 'campfire', 'campfire', 'karaoke', 'happy', 'campfire', 'karaoke', 'blackout', 'fog', 'campfire',
  'snow', 'lightshow', 'snow', 'happy', 'snow', 'lightshow', 'megaphone', 'snow', 'lightshow', 'snow',
  'snow', 'icy', 'blizzard', 'icy', 'snow', 'blackout', 'blizzard', 'snow', 'icy', 'blizzard', // 7장 스키장
  'petals', 'champagne', 'champagne', 'songnoise', 'dimlight', 'lightshow', 'petals', 'champagne', 'dimlight', 'songnoise', // 8장 결혼식 뒤풀이
];
export function stageFx(s) { return MAP_FX[STAGE_FX[s - 1] || 'none']; }

// ─── 스테이지 조건: 강화만으로는 못 뚫게 — 덱 구성(역할)이 중요해지는 진상 기믹 (1~6장 중후반 · 헬) ───
//  보호막(연타 · 깨기) ↔ 철갑(큰 한 방 · 방어 무시) · 은신(찾아내기) · 기절 예고(해제 · 면역) · 떼거리(범위) · 문 돌격(수리 · 탱커 · 감속)
//  한 스테이지에 1~3개 → 역할 2~3개가 필요. 7장은 자기 기믹(빙결 · 침묵 · 눈사태)이 따로 있어서 여기엔 없음
export const COND = {
  shield: { id: 'shield', icon: 'tw_shield', name: '보호막 진상', short: '보호막', tip: '보호막 진상: 겹이 남아 있으면 피해 −90% · 한 방에 한 겹씩 벗겨져요 → 연타 · 운영진 경고장 · 여지원이 잘 깨요',
    counter: ['staff', 'jiwon', 'gunman', 'youngjun', 'soyoung', 'myunghoon', 'hanna', 'sanghwa', 'junseo'], breaker: ['staff', 'jiwon'], frac: 0.32, layers: [3, 4], cut: 0.9, regen: 3.2 }, // (10/08 체감 ↑: 0.22 · [2,3] · 4초 → 0.32 · [3,4] · 3.2초)
  stealth: { id: 'stealth', icon: 'tw_dark', name: '숨은 진상', short: '은신', tip: '숨은 진상: 길 ¾ 까지 안 보이고 입구를 두 배로 쳐요 → 운영진 · 건전남 · 배현경이 먼저 찾아내요',
    counter: ['staff', 'gunman', 'hyungyeong'], frac: 0.15 },
  cc: { id: 'cc', icon: 'tw_curse', name: '기절 예고', short: '기절', tip: '기절 예고: 진상이 기를 모았다가(1초) 제일 센 멤버를 기절 · 침묵 · 홀림 → 건전녀(간호 · 응급 방패) · 김도훈이 풀고 강성구 · 강병화 곁은 막아요 · 도발 탱커(정원식)가 대신 맞아요 · 기 모을 때 기절시키면 끊겨요',
    counter: ['gunnyeo', 'dohoon', 'sunggu', 'byunghwa', 'wonsik', 'soyoung', 'jungmin'], every: [5.6, 4.4], windup: 1.0, stun: 3.5, silence: 5, charm: 3, /* (10/08 체감 ↑: [7,5.5] · 3 · 4 · 2.6) */ react: 0.6, reactCd: 4, singCut: 0.6 }, // react: 건전녀가 있으면 0.6초 만에 풀어 줌 (4초에 한 번) · singCut: 김도훈 떼창 곁 40% 짧게
  armor: { id: 'armor', icon: 'tw_titan', name: '철갑 진상', short: '철갑', tip: '철갑 진상: 한 방마다 피해가 크게 깎여요 → 한 방이 큰 멤버 · 건전남(방어 무시)',
    counter: ['ara', 'sunggu', 'gunman', 'donghan', 'hyungyeong', 'wonsik', 'eunok', 'hochan', 'dragon'], frac: 0.3, armor: [0, 6, 10, 14, 18, 22, 26] },
  swarm: { id: 'swarm', icon: 'tw_swarm', name: '떼거리', short: '떼', tip: '떼거리: 약한 진상이 훨씬 많이 → 범위 공격',
    counter: ['eunok', 'donghan', 'soyoung', 'sunggu', 'hyungyeong', 'dohoon', 'gunnyeo', 'byunghwa', 'baul', 'dragon'], count: 1.5, hp: 0.6 },
  rush: { id: 'rush', icon: 'tw_rush', name: '문 돌격', short: '돌격', tip: '문 돌격: 빠른 돌격 진상이 입구에 쾅 부딪혀요 (감속 · 기절에 걸리면 넘어짐) → 수리(홍정민 · 김도훈) · 탱커(정원식 · 백인규 오토바이 · 윤정섭) · 감속',
    counter: ['jungmin', 'dohoon', 'wonsik', 'ingyu', 'jeongseob', 'staff', 'jieun', 'subin'], frac: 0.28, spd: 1.4, atk: 1, crash: [0.025, 0.03, 0.035, 0.04, 0.045, 0.05], off: 0.5 }, // 빠른 진상은 원래 입구를 세게 · 빨리 친다 · crash: 처음 부딪힐 때 입구 최대의 % (감속 · 기절에 걸리면 넘어져서 안 부딪힘)
};
export const COND_IDS = Object.keys(COND);
// 주간 진상 특성: 매주 (월요일 · 한국 시간) 진상에게 규칙 하나 — 일반 스테이지 · 헬에서만 (주간 도전 · 1:1 대전 · 레이드 · 탑 · 무한은 그대로)
//   주는 live.js weekTrait(weekIndex) — 서버와 화면이 같은 공식 · 이번 주 추천 멤버(rec)가 빛나게, 대신 다른 쪽을 조금 깎아 난이도는 비슷하게
//   hp: 진상 체력 × · bossHp: 보스 · 중간 보스 · 정예 체력 × · spd: 이동 × · count: 수 × · armor: 철갑 조건 방어의 몇 배를 모두에게 · shield: 보호막 진상 비율
//   near/far: 근접(NEAR_HEROES) · 원거리 멤버 피해 × · crit: 치명타 확률 +p · ctrl: 기절 · 감속 시간 ×
export const WEEK_TRAIT_FROM = 4; // 1-4 부터 (처음 세 판은 그대로)
export const NEAR_HEROES = ['bangjang', 'youngjun', 'ara', 'hyungyeong', 'jeongseob', 'dohoon', 'wonsik', 'jungmin', 'gunnyeo', 'byunghwa']; // 사거리가 짧거나 붙어서 싸우는 멤버
export const WEEK_TRAITS = [
  { id: 'near', icon: 'swords', name: '원거리 방패 주간', desc: '진상이 쟁반 방패를 들었어요 — 원거리 멤버 피해 −20% · 근접 멤버 피해 +30%', rec: ['youngjun', 'ara', 'hyungyeong', 'bangjang', 'jeongseob'], far: 0.8, near: 1.3 },
  { id: 'shield', icon: 'tw_shield', name: '보호막 주간', desc: '보호막 진상이 2배 · 대신 진상 체력 −20%', rec: ['staff', 'jiwon', 'gunman', 'youngjun', 'soyoung'], shield: 0.44, hp: 0.8 }, // (10/07 대개편 뒤 특성 없음보다 −13%p → 체력 −15% → −20%)
  { id: 'fast', icon: 'tw_rush', name: '빠른 진상 주간', desc: '진상 이동 속도 +25% · 대신 체력 −15%', rec: ['jieun', 'staff', 'jungmin', 'dohoon', 'wonsik'], spd: 1.25, hp: 0.85 },
  { id: 'armor', icon: 'tw_titan', name: '단단한 주간', desc: '진상 모두 방어 + (한 방이 약하면 깎여요)', rec: ['ara', 'gunman', 'sunggu', 'donghan', 'hochan'], armor: 0.6, hp: 1 },
  { id: 'swarm', icon: 'tw_swarm', name: '떼거리 주간', desc: '진상 수 +40% · 대신 한 명 체력 −30%', rec: ['eunok', 'donghan', 'soyoung', 'sunggu', 'dohoon'], count: 1.4, hp: 0.7 },
  { id: 'boss', icon: 'tw_boss', name: '보스 주간', desc: '보스 · 중간 보스 · 정예 체력 +10% · 일반 진상 체력 −15%', rec: ['gunman', 'sanghwa', 'ara', 'hanna', 'youngjun'], bossHp: 1.1, hp: 0.85 },
  { id: 'ctrl', icon: 'cc_stun', name: '고집쟁이 주간', desc: '진상이 기절 · 감속에 잘 안 걸려요 (시간 −40%) · 대신 체력 −5%', rec: ['sanghwa', 'gunman', 'sunggu', 'eunok', 'ara'], ctrl: 0.6, hp: 0.95 },
  { id: 'crit', icon: 'path_crit', name: '치명타 주간', desc: '진상 약점이 훤히 보여요 — 치명타 확률 +15% · 대신 진상 체력 +10%', rec: ['gunman', 'sanghwa', 'staff', 'eunok'], crit: 0.15, hp: 1.1 },
];
export const WEEK_TRAIT = Object.fromEntries(WEEK_TRAITS.map((t) => [t.id, t]));
// 스테이지별 조건 (1~60). 장 앞쪽은 순하게 — 1장은 1-7 부터 하나, 2장은 2-4 부터, 3장부터 2개, 보스 스테이지는 3개
const STAGE_CONDS = [
  '', '', '', '', '', '', 'rush', 'rush', 'armor', 'swarm',
  '', '', '', 'swarm', 'armor', 'rush', 'shield cc', 'rush stealth', 'rush armor', 'shield swarm',
  'shield', 'stealth', 'swarm shield', 'stealth cc', 'armor cc', 'shield armor', 'swarm cc', 'rush swarm', 'shield stealth', 'cc swarm armor',
  'rush', 'shield', 'cc rush', 'stealth cc', 'armor cc', 'armor rush', 'swarm stealth', 'shield cc', 'stealth rush', 'shield armor cc',
  'shield', 'rush swarm', 'cc armor', 'shield cc', 'shield cc', 'stealth rush', 'swarm cc', 'rush armor cc', 'swarm shield', 'armor cc rush',
  'rush stealth', 'armor cc', 'rush swarm cc', 'rush stealth', 'cc armor swarm', 'shield stealth cc', 'swarm cc', 'shield armor', 'cc shield rush', 'swarm cc shield',
];
const HELL_EXTRA = ['cc', 'shield', 'rush', 'armor', 'stealth', 'swarm'];
export function stageConds(s, hell) {
  if (!s || chapterOf(s) >= 7 || s > STAGE_CONDS.length) return [];
  const list = (STAGE_CONDS[s - 1] || '').split(' ').filter(Boolean);
  if (hell) { const add = HELL_EXTRA.find((c, i) => !list.includes(c) && (s + i) % 2 === 0) || HELL_EXTRA.find((c) => !list.includes(c)); if (add) list.push(add); } // 헬: 하나 더
  return list;
}
// 조건이 있는 스테이지: 입구에 닿은 진상이 더 세게 친다 (문 압박 → 수리 · 탱커가 퍼펙트와 ★★★ 를 지킨다)
export const COND_HP = [1, 0.95, 0.82, 0.78, 0.6, 0.52]; // 조건 스테이지 진상 체력 (기믹이 생긴 만큼 장별로 덜어 준다 · lb-balance.js deck 으로 맞춤)
export const DOOR_PRESSURE = { atk: [1.1, 1.2, 1.3, 1.35, 1.4, 1.45], hell: 1.1, from: 2 }; // from: 첫 웨이브(대장 혼자 · 합류 중)는 기믹 없이
// 장별 권장 강화: 넘는 만큼은 절반만 (업그레이드만으로 뚫지 않게) · 헬은 +4 까지 그대로
export const REC_META = [4, 7, 10, 12, 14, 16, 18, 20];
export const META_SOFT = { over: 0.5, hellAdd: 4 };
export const recMeta = (s, hell) => REC_META[Math.max(0, Math.min(REC_META.length - 1, chapterOf(s || 1) - 1))] + (hell ? META_SOFT.hellAdd : 0);
export function softMeta(m, s, hell) { const r = recMeta(s, hell); return m > r ? r + (m - r) * META_SOFT.over : m; }
// 스테이지 미션 (★★★ = 입구 60% 이상 + 미션) — 조건에 맞는 역할이 있어야 깨기 쉽다. 1-1 ~ 1-3 은 미션 없음 (입구 70% 면 ★★★)
//  stat: 판에서 세는 숫자 · max: 이하 / min: 이상 (장별 값)
export const MISSIONS = {
  rush: { stat: 'endDoor', min: [0.75, 0.8, 0.8, 0.8, 0.8, 0.8], /* (10/08 긴장감: 입구가 꾸준히 깎이는 판이라 0.9~0.95 → 0.75~0.8) */ text: (n) => `입구 ${Math.round(n * 100)}% 이상 남기기` },
  shield: { stat: 'breaks', min: [5, 8, 15, 26, 32, 32], /* (10/08 보호막 진상이 늘어난 만큼) */ text: (n) => `보호막 한 번에 깨기 ${n}번` },
  stealth: { stat: 'found', min: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85], pct: true, text: (n) => `숨은 진상 ${Math.round(n * 100)}% 미리 찾기` },
  cc: { stat: 'ccSec', max: [22, 22, 34, 45, 36, 40], /* (10/08 기절 예고가 잦고 길어진 만큼) */ text: (n) => `기절 · 홀림 합계 ${n}초 이하` },
  armor: { stat: 'armorLeak', max: [2, 2, 3, 3, 3, 3], text: (n) => `철갑 진상 입구 도달 ${n}명 이하` },
  swarm: { stat: 'multi', min: [8, 10, 16, 28, 30, 28], text: (n) => `4명 이상 한 번에 처치 ${n}번` },
  combo: { stat: 'combo', min: [15, 25, 35, 40, 45, 50], text: (n) => `콤보 ${n} 달성` },
};
const MISSION_ORDER = ['cc', 'rush', 'shield', 'stealth', 'armor', 'swarm'];
export function stageMission(s, hell, conds) {
  if (!s || s <= 3 || chapterOf(s) >= 7) return null;
  const list = conds || stageConds(s, hell);
  const c = MISSION_ORDER.find((k) => list.includes(k)) || 'combo'; // 역할이 필요한 기믹부터 (해제 · 수리 · 깨기)
  const M = MISSIONS[c], ch = Math.min(6, chapterOf(s)) - 1;
  const n = M.max ? M.max[ch] : M.min[ch];
  return { id: c, stat: M.stat, n, max: !!M.max, pct: !!M.pct, text: M.text(n) };
}
// 미션 판정 (stats = 판에서 센 숫자)
export function missionOk(m, st) {
  if (!m) return true;
  const v = m.stat === 'found' ? (st.hidden ? (st.found || 0) / st.hidden : 1) : st[m.stat] || 0;
  return m.max ? v <= m.n : v >= m.n;
}
// 이 멤버가 스테이지 조건에 맞나 (준비 화면 초록 표시)
export function condFits(id, conds) { return (conds || []).filter((c) => COND[c] && COND[c].counter.includes(id)); }

// 보상 코인 (서버가 계산 — 여기는 손님 · 화면 표시용 같은 공식)
export const REWARD = { base: 60, perStage: 18, firstMul: 1.5, starMul: 0.5 }; // (10/08 첫 클리어 ×2 → ×1.5)
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
// (10/08 헬 개편 — 다른 게임 조사: 디아블로4 어려움 체력 ×2 · 피해 ×1.3 / 전문가 ×3.2 · ×1.9 · 킹덤 러시 6 불가능 체력 ×1.6 · 이동 +10% · 기술 더 자주 · 명일방주 챌린지 체력 +50% · 공격 +5% + 특수 규칙)
//  예전 헬은 장마다 체력을 깎아서 (TEMPO.hellCh 0.95 → 0.35) 뒤 장 헬이 보통보다 무른 판이었다 → 이제 '단단함'이 주인공: 보통 대비 체력 ×hp × 스테이지 보정 (어느 스테이지도 ×minHp 아래로는 안 내려감) · 다른 배율은 낮게
//  · 입구 치는 힘 ×atk · 이동 ×speed · 수 ×count · 조건 하나 더 · 보스 분노 한 번 더 · 쓰러짐 게이지 ×KD.hell · 웨이브 사이 수리 ×repair · 권장 강화 +META_SOFT.hellAdd
export const HELL = { hp: 2, speed: 1.1, atk: 1.3, count: 0.8, repair: 0.5, exp: 1.8, dmg: 1.15, chDmg: [1.12, 1.08, 1.08, 1.5, 1.15, 1.05, 1.3, 1.1], coin: 3, /* exp · dmg: 진상이 단단한 대신 경험치(카드) ×1.8 · 멤버 공격 ×1.15 — 길게 키우며 버티는 싸움 */ minHp: 1.6, stageDmg: { 70: 1.16, 80: 1.45 }, /* stageDmg: 헬 체력 바닥(minHp)에 닿은 스테이지는 멤버 공격 × (10/09 7-10 · 8-10) */ stageHp: { 30: 0.85, 3: 2.0, 4: 1.94, 5: 1.93, 6: 0.93, 7: 1.26, 8: 1.44, 9: 2.0, 10: 1.6, 11: 0.82, 12: 1.49, 13: 0.8, 14: 1.96, 16: 1.36, 17: 1.2, 18: 1.85, 19: 1.17, 20: 1.45, 21: 1.45, 22: 1.48, 23: 1.3, 24: 0.95, 25: 1.44, 26: 1.31, 27: 0.81, 28: 1.54, 29: 1.47, 31: 0.84, 32: 1.4, 33: 1.6, 34: 0.81, 35: 1.17, 36: 1.41, 38: 1.5, 39: 0.82, 40: 1.45, 41: 1.41, 42: 1.69, 43: 0.8, 44: 0.82, 45: 1.15, 46: 1.09, 47: 0.82, 48: 1.27, 49: 0.95, 50: 1.1, 51: 1.28, 53: 1.79, 54: 0.99, 55: 0.91, 56: 1.15, 57: 0.89, 58: 0.9, 59: 1.03, 60: 1, 61: 1.14, 62: 1.24, 63: 1.68, 64: 1.3, 65: 0.81, 66: 1.08, 67: 1.25, 68: 0.87, 69: 1.05, 70: 0.8, 71: 1.28, 72: 0.89, 73: 1.3, 74: 1.15, 75: 0.81, 76: 1.65, 77: 1.15, 78: 1.3, 79: 1.1, 80: 0.8 }, /* stageHp: 스테이지별 헬 체력 배수 (10/08 lb-balance.js hellcalib · 헬 권장 강화 · 목표 1장 45 · 2장 42 · 3~6장 38 · 7 · 8장 33 · 보통 대비 ×minHp 아래로는 안 내려감) */ bossEnrage: { at: 0.5, speed: 1.25, atk: 1.3, text: '헬 분노!!' } };
// 이 스테이지 헬 진상 체력이 보통의 몇 배인지 (화면 표시: 기본 배율 × 장 보정 × 스테이지 보정)
export const hellHpMul = (s) => HELL.hp * (TEMPO.hellCh[chapterOf(s || 1) - 1] || 1) * (TEMPO.hellHp / TEMPO.hp) * (HELL.stageHp[s] || 1);
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
export const TYPE_STRONG = 1.6, TYPE_WEAK = 0.7;
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
const ART_READY = new Set(['h_jungmin', 'h_junyoung', 'h_soyoung', 'h_jieun', 'h_jieun_demon', 'h_sanghwa', 'h_dragon']);
// 그림을 새로 바꾼 파일: 주소 끝에 ?v= 를 붙여 폰에 저장(캐시)된 옛 그림 대신 새로 받게 한다
//  바뀐 파일만 적는다 (전부 붙이면 배포마다 모두 다시 받아서 전송량이 폭증) · 다시 바꾸면 숫자를 올린다
export const ART_VER = {
  h_subin: 2, h_subin_attack: 2, 'dex/subin': 2, 'dexhq/subin': 2, 'dexhq/thumb/subin': 2,
  h_donghan_attack: 2, h_eunok_attack: 2, h_dragon_attack: 2, e_boss_bestman_attack: 2, e_boss_bestman_skill: 2, e_boss_bestman_rage: 2,
  h_donghan_cafe: 2, h_donghan_cafe_tf: 2, h_donghan_cafe_attack: 2, 'dex/donghan_cafe': 2, 'dexhq/donghan_cafe': 2, 'dexhq/thumb/donghan_cafe': 2, // 문동한 카페인 풀충전 새로 그림 (Gemini)
  'fx/w_card_r': 2, 'fx/w_card_y': 2, // 운영진 레드·옐로카드 광택 카드로 새로 그림 (Gemini)
  'season/halloween_key': 2, // (season.js 의 keyart 주소에도 ?v=2 를 직접 붙였다 — 허브 카드 · 로비 배경)
};
export const artV = (u) => { const m = typeof u === 'string' && /^\/img\/lb\/([^?]+)\.webp$/.exec(u); return m && ART_VER[m[1]] ? `${u}?v=${ART_VER[m[1]]}` : u; };
const ART = (n) => (ART_READY.has(n) ? artV(`/img/lb/${n}.webp`) : '');
for (const a of [HERO_ANIM, HERO_ANIM_FORM]) for (const k of Object.keys(a)) if (a[k] && a[k].src) a[k].src = artV(a[k].src); // 공격 띠도 바뀐 것만 ?v=
// 새 히든 멤버 이름 (바꾸려면 여기 한 곳만)
export const DRAGON_NAME = '박나영';
export const NO_DEX_ART = new Set([]); // dex/<id>.webp 없음
export const NO_HQ_ART = new Set(['junyoung']); // dexhq/<id>.webp 없음
export const NO_DUO_ART = new Set([]); // dexhq/<id>_duo.webp 없음
export const HEROES = {
  bangjang: {
    id: 'bangjang', bossKit: 1, kit: 1, name: '방장', gender: 'm', emoji: '📢', color: '#f6b73c', attr: 'talk',
    img: '/img/lb/h_bangjang.webp', role: '리더 · 확성기 지시(지목) · 대장이면 모두 공속 +',
    dmg: 30, interval: 0.8, range: 340, proj: 'order', projSpeed: 900, // (부채꼴 음파 → 한 명 콕 집는 지시: 부채꼴은 강병화 고함만)
    order: { sec: 3, mul: [0.2, 0.2, 0.25, 0.25, 0.3], every: 4, n: 3, r: 120 }, // 지목: 모든 멤버에게 받는 피해 +% (3초) · Lv5 4번마다 근처 3명 한꺼번에
    aura: [0.08, 0.1, 0.15, 0.19, 0.25], // 모든 아군 공격 속도 +% (10/10 등급 맞춤 6~20% → 8~25% · 집합! 쿨 40 → 30초) (8~26% → 6~20%: T1 인데 대장일 때 너무 셌다)
    attack: '확성기 지시 — 입구에 제일 가까운 진상을 콕 집어 "저 사람!" · 맞은 진상은 3초 동안 「지목」 (모든 멤버에게 받는 피해 +20%) · 대장(1번 칸)이면 모두 공속 +, 아니면 곁 멤버만 절반',
    desc: '확성기로 "저 사람!" 하고 콕 집어 준다. 방장이 찍은 진상은 모두가 더 세게 때리고, 곁에 있는 것만으로 모두의 손이 빨라진다.',
    perks: { 3: '지목 피해 +5%p · 오라 강화', 5: '4번마다 "전체 지시" — 근처 진상 3명을 한꺼번에 지목 · 지목 +5%p' },
    skill: { id: 'rally', name: '집합!', cd: 30, desc: '깃발을 꽂고 필드 전체 충격파 (보스 빼고 한 칸 밀기) · 8초 동안 모두 공격 속도 +50% (Lv4 +60% · Lv5 10초 +70%)', sec: [8, 8, 9, 9, 10], spd: [0.5, 0.5, 0.5, 0.6, 0.7] },
  },
  staff: {
    id: 'staff', bossKit: 0.9, kit: 1.0, name: '운영진', gender: 'f', emoji: '📋', color: '#5ab0ff', attr: 'talk',
    img: '/img/lb/h_staff.webp', role: '제어 · 보호막 깨기',
    dmg: 34, interval: 1.05, range: 380, proj: 'warn', projSpeed: 430,
    slow: 0.35, slowSec: 1.4, stamp: { r: [30, 30, 36, 36, 44], star: 3, fall: 0.42, side: 0.5 }, // 경고 딱지 도장: 하늘에서 0.42초 낙하 → 작은 원 (Lv3 · Lv5 · ★마다 +3 넓게) · 곁 진상은 절반 피해 + 감속 + 경고 (강퇴 직전까지)
    warn: { n: 3, stun: [1.2, 1.2, 1.5, 1.5, 1.8], kb: 60, mul: 2.2 }, // 경고 3번 → 강퇴 (기절 + 밀어내기 + 큰 피해)
    attack: '경고 딱지 — 사거리 안 진상 머리 위로 노란 딱지가 쾅! 떨어진다 (작은 원 · 곁 진상도 절반). 맞으면 느려지고 "경고"가 쌓여 3번이면 강퇴! (기절 + 밀어내기)',
    desc: '규칙 위반자는 용서 없다. 수첩에서 뜯은 경고 딱지를 하늘에서 쾅 찍어 붙인다. 경고가 쌓이면 강퇴시켜 버리는 제어 전문가.',
    perks: { 3: '딱지가 커진다 (원 30 → 36) · 강퇴 기절이 더 길다', 5: '딱지가 가장 크게 (원 44) · ★ 한 단계마다 원 +3' },
    skill: { id: 'redcard', name: '레드카드 퇴장', cd: 8, target: true, desc: '찍은 곳에서 입구에 제일 가까운 진상 하나에게 "퇴장!" — 뒤로 쫓아내고 1.2초 기절 (보스 · 중간 보스 빼고) · 범위 안 진상은 보호막 · 버프가 깨지고 피해 + 느려진다 (쿨 짧은 잔기술)', r: [90, 90, 105, 105, 120], slowSec: 2, dmgMul: 1.4, eject: 110, ejectStun: 1.2 }, // (쿨 다양화: 18 → 8초 · 효과 작게)
  },
  gunman: {
    id: 'gunman', bossKit: 1.45, kit: 1.0, name: '건전남', gender: 'm', emoji: '🙋‍♂️', color: '#4fd18b', attr: 'power',
    img: '/img/lb/h_gunman.webp', role: '저격수 · 최장 사거리',
    dmg: 56, interval: 0.97, range: 1400, far: { r: 610, mul: 0.6 }, proj: 'pistol', projSpeed: 1300, critBonus: 0.25, // 필드 전체가 사거리 (610 밖은 피해 -40%) · 어디든 입구에 가장 가까운 진상부터
    pistol: { n: [1, 2, 2, 3, 3], each: [1, 0.62, 0.62, 0.5, 0.5], gap: 0.11, speed: 1300, ric: 170 }, // 한 번에 n발 (같은 표적) · 한 발 피해 배율 (합 1 → 1.24 → 1.5) · Lv3 관통 · Lv5 도탄
    attack: '권총 — 한 명을 골라 또박또박 한 발. 레벨이 오르면 탕탕(Lv2) · 탕탕탕(Lv4) 연발 · Lv3 관통 · Lv5 도탄 · 치명타 잘 터짐',
    desc: '건전하게, 그러나 정확하게. 난사는 건전하지 않다 — 한 명씩 확실하게 맞히는 남자.',
    perks: { 3: '권총 2연발 → 총알이 1명 관통 (Lv2 에 2연발)', 5: '3연발 (Lv4) → 맞고 튕겨 옆 진상까지 (도탄) · ★3 치명 +10% · 진화 = 3발째마다 헤드샷' },
    skill: { id: 'frenzy', name: '퀵드로우', cd: 10, target: true, r: [70, 70, 80, 80, 90], desc: '찍은 쪽으로 1.2초 동안 권총을 빠르게 연사 (자기 앞 · 찍은 방향 부채꼴 · 쿨 짧은 잔기술)', sec: [1.2, 1.2, 1.4, 1.4, 1.6], every: 0.09 },
  },
  gunnyeo: {
    id: 'gunnyeo', bossKit: 0.8, kit: 1.0, name: '건전녀', gender: 'f', emoji: '🙋‍♀️', color: '#ff8fc0', attr: 'charm',
    img: '/img/lb/h_gunnyeo.webp', role: '멤버 간호 · 상태이상 해제 · 면역 · 입구 조금씩 회복',
    dmg: 30, interval: 1.0, range: 300, proj: 'heart', projSpeed: 1, lobSec: 0.85, splash: 36, arcH: 125, // 하트 폭탄: 높이 휙 (포물선 높이 125)
    care: { every: [4, 4, 3.6, 3.6, 3.2], tired: [3, 3, 4, 4, 5], guard: [1, 1, 1.5, 1.5, 2], cheer: { sec: 3, spd: 0.3 }, door: [0.003, 0.0033, 0.0036, 0.004, 0.005] }, // 간호 (10/08: 입구도 간호마다 0.5~0.8% — 초보 입구 지킴이 · 큰 수리 · 바리케이드는 홍정민 몫): [주기(초)] 마다 멤버 상태이상 전부 풀기 · 기진맥진 −초 · 풀어 준 멤버는 잠깐 면역(초) · 챙겨 준 멤버는 "힘내요!" 3초 공속 +30%
    attack: '하트 폭탄 — 가까이 온 진상에게 천천히 던지는 작은 폭탄. 진짜 가치는 간호: 틈틈이 입구를 조금씩 고치고 멤버 상태이상을 전부 풀고 (풀린 멤버는 잠깐 면역) 스킬 쓰고 지친 멤버(기진맥진)를 일으킨다 · 챙겨 준 멤버는 "힘내요!" 3초 공격 속도 +30% (아픈 멤버가 없으면 제일 잘 싸우는 멤버에게)',
    desc: '다정한 간호사. 한 방은 약하지만 기절 · 홀림 · 침묵에 걸린 멤버를 제일 먼저 챙기고, 스킬 쓰고 지친 멤버에게 물 한 잔 건넨다.',
    perks: { 3: '간호가 더 자주 · 면역 더 길게 · 폭발 범위 +', 5: '모든 멤버 홀림 면역 ("철벽!")' },
    skill: { id: 'firstaid', name: '응급 방패', cd: 14, desc: '멤버 전원에게 하트 방패 — 상태이상 전부 해제 · 입구 4~7% 회복 · 기진맥진도 풀림 · 3초 동안 상태이상 면역 (Lv3 3.5초 · Lv5 4초) · "힘내요!" 4초 공격 속도 +30% · 다른 멤버 스킬 쿨타임 −1초', imm: [3, 3, 3.5, 3.5, 4], cdCut: 1, door: [0.04, 0.045, 0.05, 0.055, 0.07] } /* (10/10 등급 맞춤: 입구 6~10% → 4~7% · 간호 입구 0.5~0.8% → 0.3~0.5%) */, // (10/08 입구도 6~10% 고침) // (쿨 다양화: 24 → 14초 · 자주 푸는 해제 담당)
  },
  // ── 해금 영웅 (스테이지를 깨면 합류) ──
  myunghoon: {
    id: 'myunghoon', bossKit: 0.8, kit: 1.05, name: '서명훈', gender: 'm', emoji: '🦊', color: '#e8a25a', unlock: true, attr: 'talk',
    img: '/img/lb/h_myunghoon.webp', role: '빠른 진상 사냥꾼 · 못 피하는 저주',
    dmg: 27, interval: 0.75, range: 330, proj: 'swear', projSpeed: 560,
    ice: { reach: 125, decay: 0.9, fastMul: 1.6, need: 3, keep: 3, sec: [1.0, 1.0, 1.1, 1.1, 1.3] }, // 욕 번개: 비행 없이 바로 튄다 (튀는 거리 125 · 한 번 튈 때마다 ×0.9) · 빠른 진상 ×1.6 · 얼음 3겹이면 얼어붙음 (빠른 진상은 한 번에 2겹)
    stun: [[0.22, 0.8], [0.24, 0.9], [0.27, 1.0], [0.3, 1.1], [0.34, 1.2]], // [기절 확률, 기절 시간(초)]
    bounces: [2, 2, 2, 3, 3], // 첫 적 다음에 튕기는 수 (총 3~5명)
    stunnedBonus: [1.5, 1.5, 1.5, 1.5, 2.0], // 기절한 적에게 피해 배율
    revealBonus: 2.0, // 사기꾼이 '들켰다!' 할 때 피해 배율
    attack: '욕 번개 — 날아가지 않고 입에서 바로 "#@!%" 번개가 지그재그로 3~5명을 튄다 (가장 빠른 진상부터). 맞을 때마다 얼음 한 겹 (빠른 진상은 두 겹) · 3겹이면 꽁꽁 얼어붙는다',
    desc: '원래는 사람이었다. 그런데 욕의 신의 저주에 걸려 실눈 뜬 티벳여우가 되어 버렸다. 이제 "#@!%" 한 방이면 진상이 그 자리에서 얼어붙는다 (도망치는 놈일수록 더 세게). 누군가 그의 차가운 마음을 따뜻하게 녹여 준다면… 다시 사람으로 돌아올지도?',
    perks: { 3: '욕이 한 명 더 튕긴다 · 얼어붙는 시간 +0.1초', 5: '4발마다 "욕 폭탄" (얼음 한 겹 더) · 기절한 적 피해 2배' },
    skill: { id: 'curse', name: '실눈 저격', cd: 16, target: true, desc: '실눈을 번쩍! 찍은 곳 안의 가장 빠른 진상 5명에게 하늘에서 "#@!%" 벼락 — 큰 피해 + 꽁꽁 얼림 1초 · 얼어 있는 진상은 벼락에 깨지며 주변까지 얼음 파편 (보스는 느려짐)', r: [125, 125, 140, 140, 160], stun: [1, 1, 1.2, 1.2, 1.5], dmgMul: 1.4, shatter: { r: 60, mul: 0.6 } },
  },
  dohoon: {
    id: 'dohoon', bossKit: 0.7, kit: 0.6, name: '김도훈', gender: 'm', emoji: '🎤', color: '#b58cff', unlock: true, attr: 'booze',
    img: '/img/lb/h_dohoon.webp', role: '퍼지는 음파 고리 · 떼창 게이지 · 무대 조준',
    dmg: 48, interval: 1.35, range: [210, 210, 240, 240, 265], proj: 'wave', waveMax: 10, groove: { sec: 2, cut: 0.3 }, // 입구 수리는 홍정민 몫 → 회복을 빼고 떼창 −35% → −45% // (51 → 56: 회복을 줄인 만큼 술 범위 딜로) · 감속 대신 떼창에 빠져 입구를 덜 세게 친다 (감속은 오지은 · 운영진 몫)
    crowd: { per: 7, sec: 4, spd: [0.25, 0.25, 0.3, 0.3, 0.35] }, // 떼창 게이지: 음파에 맞은 진상 한 명 +7 (Lv3 ×1.25) → 100 이면 "떼창!" 모든 멤버 4초 공격 속도 +25~35% · 상태이상 걸린 멤버 한 명 풀기 (곁 공속 오라는 방장 몫이라 뺐다)
    attack: '마이크 음파 고리 — 고리가 둥글게 퍼지며 지나가는 진상을 친다 (안쪽은 이미 지나감) · 맞은 진상은 떼창에 빠져 2초 동안 입구를 덜 세게 (−30%) · 맞힐수록 떼창 게이지 → 가득 차면 "떼창!" 모두 공격 속도 ↑ · 한 명 상태이상 풀기',
    desc: '마이크를 절대 안 놓는 노래방 사나이. 떼창 한 번이면 진상도 멤버도 같이 따라 부른다.',
    perks: { 3: '음파 범위 · 떼창 게이지 25% 빨리', 5: '떼창 최대 · 떼창 1초 더 · 앵콜 무대가 더 오래' },
    skill: { id: 'encore', name: '무한 앵콜', cd: 45, target: true, r: [120, 120, 130, 130, 145], desc: '찍은 곳에 미러볼 무대가 쿵! 무대 안 진상은 춤추느라 멈춤 (보스는 느려짐) + 피해 · 멤버 상태이상 전부 해제 + 6초 동안 멤버 전원 공격 속도 +25% · 피해 +15% · 떼창 게이지 가득', buffSec: 6, buffSpd: 0.25, buffDmg: 0.15, mul: 1.6, dance: [3.4, 3.4, 3.7, 3.7, 4.2] },
  },
  ingyu: {
    id: 'ingyu', bossKit: 1.15, kit: 0.95, name: '백인규', gender: 'm', emoji: '🏋️', color: '#3f8cff', unlock: true, attr: 'power',
    img: '/img/lb/h_ingyu.webp', role: '돌진 탱커 · 오토바이로 밀어내기',
    dmg: 34, interval: 1.75, range: 420, proj: 'dumbbell', projSpeed: 1, lobSec: 0.5, splash: 34,
    roll: { speed: 230, r: 16, push: 16, decay: 0.85 }, // 덤벨을 바닥에 굴린다: 느리게 데굴데굴 · 길 위 진상 전부 (한 명마다 ×0.85) · 살짝 밀침 · 진상이 가장 많이 줄 선 쪽으로
    pump: { per: 0.02, max: 0.3 }, // 근육 펌프: 밀친 진상 한 명마다 공격력 +2% (최대 +30% · 웨이브 동안)
    moto: { every: [5, 5, 4, 4, 3], mul: 1.7, speed: 560, kb: 100, w: 36, daze: 0.4 }, // 덤벨 5번 → 자기 줄로 오토바이 돌진 (줄 위 진상 전부 크게 밀치고 0.4초 휘청) — 입구 피해 감소 · 도발은 정원식 몫
    noDrowsy: true, // 꼰대 라떼 잔소리에 안 졸린다 (운동 루틴)
    attack: '덤벨 볼링 — 진상이 가장 많이 줄 선 쪽으로 덤벨을 바닥에 데굴데굴 굴려 길 위를 전부 치고 밀친다. 밀칠 때마다 근육 펌프 (공격력 +2% · 최대 +30%) · 5번 굴리면 오토바이 돌진!',
    desc: '3대 500 헬창. 덤벨은 던지는 게 아니라 굴리는 것. 펌프가 오를수록 점점 세지고, 오토바이 시동이 걸리면 앞에 있는 진상은 전부 줄 밖으로. 꼰대 잔소리도 안 통함.',
    perks: { 3: '오토바이가 더 자주 (덤벨 4번)', 5: '오토바이 덤벨 3번마다 · 덤벨이 커진다 (×1.3)' },
    skill: { id: 'harley', name: '할리 드리프트', cd: 18, target: true, r: [95, 95, 105, 105, 120], desc: '찍은 곳까지 할리로 쏜살같이 달려가 그 자리에서 원을 그리며 드리프트 1.6초 — 원 안 진상 계속 따끔 + 바깥으로 튕겨 냄 · 바닥에 타이어 자국 (3초 · 지나가는 진상 40% 느리게) · 근육 펌프 가득', sec: 1.6, tick: 0.2, mul: [0.36, 0.36, 0.4, 0.4, 0.47], kb: 34, skid: { sec: 3, slow: 0.4 } },
  },
  donghan: {
    id: 'donghan', bossKit: 0.9, kit: 1.0, name: '문동한', gender: 'm', emoji: '😪', color: '#8fb3a0', unlock: true, attr: 'charm',
    img: '/img/lb/h_donghan.webp', imgOn: '/img/lb/h_donghan_on.webp', role: '간보기 · 한 방 폭발',
    dmg: 11, interval: 1.1, range: 320, proj: 'snack', projSpeed: 420, snackMeter: 3, // 과자가 맞으면 간보기 게이지 +3 (감속 대신: 간 보는 만큼 빨리 일어난다)
    meter: { base: [12.5, 13.4, 14.4, 15.4, 17.3], perNear: 1.4, nearY: 200, hpLow: 12 }, // 간보기 게이지 (초당)
    burst: { mul: 8.5, w: [48, 48, 56, 56, 66], windup: 0.6, rest: 1.2 }, // 가장 붐비는 줄에 두꺼운 빔
    attack: '과자 던지기 — 누워서 약한 과자를 휙 (맞힐 때마다 간보기 게이지 +3). 간보기 게이지가 차면 일어나서 한 줄 전체에 빔!',
    desc: '늘 귀찮은 간보는 사람. 누워만 있다가 "이제 좀 해볼까?" 한 방이면 한 줄이 싹 비워진다. 커피 한 잔을 원샷하는 순간 카페인 풀충전 — 눈이 번쩍, 머리에서 김이 모락!',
    perks: { 3: '게이지 빨라짐 · 빔 두꺼워짐 · 캔커피 +1발', 5: '게이지 최대 · 빔 제일 두껍게 · 캔커피 11발 · 범위 +' },
    skill: { id: 'cafe', name: '카페인 풀충전', cd: 20, desc: '"이제 좀 해볼까?" 커피 한 잔 원샷 → 눈 번쩍 · 카페인 풀충전! → 진상이 몰린 곳마다 하늘에서 캔커피가 연달아 쾅 (떨어질 자리에 먼저 커피 얼룩) · 커피 뒤집어쓴 진상은 잠깐 휘청', wind: 0.9, gap: 0.42, delay: 0.55, n: [5, 5, 6, 6, 6], r: [56, 56, 60, 60, 66], mul: [2.5, 2.5, 2.6, 2.6, 2.7], daze: 0.3 }, // 제라스 궁처럼: 아아 원샷 0.9초 → 0.42초마다 한 발 (0.55초 뒤 떨어짐) · 보스 0.8배
  },
  youngjun: {
    id: 'youngjun', bossKit: 1.2, kit: 0.95, name: '김영준', gender: 'm', emoji: '🐆', color: '#7a4dff', unlock: true, attr: 'booze',
    img: '/img/lb/h_youngjun.webp', imgOn: '/img/lb/h_youngjun_dash.webp', role: '진상 사이를 번개처럼 건너뛰며 베기',
    dmg: 34, interval: 0.18, range: 350, proj: 'dash', outSec: [2.6, 2.6, 2.9, 2.9, 3.2], restSec: [2.4, 2.4, 2.1, 2.1, 1.8], reach: 70, hop: { n: 3, r: 120 }, // 0.14 · 3초/1.6초 → 0.18 · 2.6초/2.4초 (혼자 실효 DPS 158 → 98 · 고아라쯤) · 세 번 베면 곁의 다른 진상으로 휙 건너뛴다
    attack: '고양이 건너뛰기 — 제일 몰린 곳으로 뛰어들어 세 번 베고 곁의 다른 진상으로 휙, 또 휙 (가오 무시) 2.6초 · 돌아와서 크로스핏으로 숨 고르기 2.4초',
    desc: '크로스핏으로 다져진 강철 몸의 파티 전사. 검은 고양이 후드를 눌러쓰고 어둠 속에 스며들면 아무도 그를 못 본다 — 오늘도 진상 사이를 고양이처럼 건너뛰며 소리 없이 처리하고 다닌다.',
    perks: { 3: '돌격 2.9초 · 크로스핏 2.1초', 5: '돌격 3.2초 · 크로스핏 1.8초' },
    skill: { id: 'rush', name: '블랙 러시', cd: 10, desc: '지목한 적부터 최대 3명을 번개처럼 연속 돌파 · 큰 피해 (쿨 짧은 잔기술 · Lv5 4명)', n: [3, 3, 3, 3, 4], mul: 4 }, // (쿨 다양화: 20 → 10초 · 6~8명 ×5 → 3~4명 ×4)
  },
  // ── 스토리 합류 (1-10 · 2-5 · 2-10) — 한 판 안에선 깜짝 등장 카드로도 ──
  eunok: {
    id: 'eunok', bossKit: 1.0, kit: 1.1, name: '최은옥', gender: 'f', emoji: '🍶', color: '#ff5a4f', hidden: true, attr: 'booze',
    img: '/img/lb/h_eunok.webp', imgRage: '/img/lb/h_eunok_rage.webp', role: '술 마시면 분노 모드',
    dmg: 21, interval: 0.9, range: 390, proj: 'bottle', projSpeed: 1, lobSec: 0.55, splash: 55,
    rageSec: [6, 6, 7, 7, 8], // (10/10 주인 요청) 분노는 스킬(원샷)로만 — 저절로 취하지 않는다 · 대신 더 세고 짧게 (예전: 14초마다 저절로 8~12초 · 피해 ×1.4 · 공속 ×2.2)
    rageDmg: 1.6, rageInterval: 0.4, rageBurst: { mul: 3.2, r: 95, kb: 45 }, // 분노 중 피해 ×1.6 · 공속 ×2.5 · 원샷 순간 정예 · 보스(없으면 가장 몰린 곳)에 소주병 한 방 (범위 피해 ×3.2 · 밀침) fire: { sec: 2.2, r: 50, dps: 0.6, kind: 'booze', slow: 0.3 }, arcH: 40, fuse: 0.5, // 분노 중 술 웅덩이 (1발 피해 × 0.6 / 초 · 비틀비틀 30% 느리게 — 불은 박나영 몫) · 낮고 빠른 포물선 · 떨어진 병은 0.5초 뒤 펑 (시한폭탄)
    attack: '소주병 시한폭탄 — 낮고 빠르게 휙휙 두 병, 바닥에 꽂혀 지글지글 0.5초 뒤 펑! (범위) · 분노 중엔 깨진 자리에 술 웅덩이 (밟은 진상 비틀비틀 느려짐)',
    desc: '홀짝홀짝… 14초쯤 지나면 취해서 "분노 모드"가 된다.',
    perks: { 3: '분노 중 술 웅덩이가 더 넓고 오래 · 분노 +1초', 5: '분노 +2초 (8초)' },
    skill: { id: 'oneshot', name: '원샷', cd: 18, desc: '소주 한 병 원샷 → 분노 모드 6초 (Lv3 7초 · Lv5 8초): 피해 ×1.6 · 공격 속도 ×2.5 · 술 웅덩이 · 분노가 터지는 순간 소주병을 정예 · 보스(없으면 진상이 가장 몰린 곳)에 던져 큰 한 방 (범위 + 밀침) · 분노 중이면 +5초 · 저절로는 분노하지 않는다' },
  },
  hanna: {
    id: 'hanna', bossKit: 1.15, kit: 1.05, name: '이한나', gender: 'f', emoji: '😉', color: '#ff6fd8', hidden: true, attr: 'charm',
    img: '/img/lb/h_hanna.webp', role: '하트 레이저 · 윙크 넉백',
    dmg: 33, interval: 0.7, range: 370, proj: 'beam', beamTick: 0.12, ramp: [0.5, 0.5, 0.7, 0.7, 0.9], rampMax: 2.1, kbEvery: 2.0,
    knockback: [52, 60, 68, 76, 90],
    attack: '하트 레이저 — 한 명에게 계속 쏘면 점점 세진다, 남자는 가끔 뒤로 밀림',
    desc: '"윙크 ♥" 레이저에 맞은 남자는 정신 못 차리고 뒤로 날아간다. 여자는 그냥 아프다.',
    perks: { 3: '레이저가 더 빨리 세진다', 5: '레이저 2갈래 · 남자는 잠깐 기절' },
    skill: { id: 'winkbomb', name: '윙크 폭탄', cd: 14, target: true, beam: { mul: 3.2, hw: 34, len: 900 }, desc: '찍은 곳: 남자는 날려 버리고 여자는 홀려서 멈춤', r: [130, 130, 145, 145, 165], kb: 80, stun: 0.8 }, // (쿨 다양화: 실제 40 → 14초 · 밀침 · 홀림 작게)
  },
  sunggu: {
    id: 'sunggu', bossKit: 1.1, kit: 1.0, name: '강성구', gender: 'm', emoji: '👴', color: '#c9a36b', hidden: true, attr: 'power',
    img: '/img/lb/h_sunggu.webp', role: '크게 돌아오는 지팡이 · 기절 면역 오라',
    dmg: 48, interval: 2.1, range: 620, proj: 'cane', projSpeed: 430, lv5Interval: 0.85, loop: { amp: 70, speed: 300, r: 15 }, // 지팡이 고리: 진상이 가장 몰린 곳까지 크게 원을 그리며 나갔다가 반대쪽으로 돌아온다 (갈 때 · 올 때 한 번씩)
    attack: '지팡이 부메랑 — 진상이 가장 몰린 곳으로 지팡이를 휙 던지면 커다란 고리를 그리며 나갔다가 반대쪽으로 돌아온다 (가는 길 · 오는 길 전부 관통)',
    desc: '"요즘 것들은…" 지팡이 하나를 던지면 큰 원을 그리며 한 무리를 두 번 훑고 손에 쏙 돌아온다.',
    perks: { 3: '고리가 더 크다', 5: '지팡이 2개 (양쪽으로 엇갈려) · 공격 속도 +15%' },
    skill: { id: 'blackhole', name: '지팡이 블랙홀', cd: 40, desc: '가장 몰린 곳에 거대한 지팡이를 꽂아 소용돌이 — 2초 동안 빨아들이며 따끔따끔, 마지막에 쾅! (모아서 한 방 · 1초 기절)', r: [95, 95, 105, 105, 120], sec: 2, tick: 0.3, boom: [3.5, 3.5, 4, 4, 4.6] }, // (쿨 다양화: 큰 한 방 · 40초)
  },
  // ── 모집(뽑기)으로만 만나는 멤버 ──
  junseo: {
    id: 'junseo', bossKit: 0.8, kit: 1.05, name: '윤준서', gender: 'm', emoji: '😍', color: '#ff7fb0', gacha: true, attr: 'charm',
    img: '/img/lb/h_junseo.webp', role: '여사친 핀볼 · 밀어내기',
    dmg: 32, interval: 1.25, range: 385, proj: 'gf', projSpeed: 560, ricochet: [4, 4, 5, 5, 5], ricoR: 150, ricoDecay: 0.88, kb: [22, 22, 26, 26, 30],
    attack: '여사친 소환 — 동글동글 여사친을 진상에게 밀어 넣으면 4~5명 사이를 핀볼처럼 튕기며 밀어내고 돌아온다',
    desc: '여자라면 사족을 못 쓰는 남자. "잠깐, 내 친구 소개해 줄게!" 여사친이 대신 진상들 사이를 굴러다닌다.',
    perks: { 3: '여사친이 한 번 더 튕긴다', 5: '여사친 둘이 같이 출동' },
    skill: { id: 'blinddate', name: '소개팅 주선', cd: 9, desc: '여사친을 바로 하나 더! 가장 앞 진상에게 (Lv4 두 명 · 더 세게 튕긴다 · 쿨 짧은 잔기술)', n: [1, 1, 1, 2, 2], mul: 1.3 }, // (쿨 다양화: 20 → 9초 · 3~4명 ×1.6 → 1~2명 ×1.3)
    shouts: ['소개해 줄게~', '내 친구 착해!', '연락처 교환 ㄱ?'],
  },
  hyungyeong: {
    id: 'hyungyeong', bossKit: 1.0, kit: 1.0, name: '배현경', gender: 'f', emoji: '🐻', color: '#ff9f5a', gacha: true, attr: 'power',
    img: '/img/lb/h_hyungyeong.webp', imgAlt: '/img/lb/h_hyungyeong_slim.webp', role: '은신 탐지 · 표시한 적 +25% · 통통 한 방 ↔ 날씬 잽',
    dmg: 60, interval: 1.95, range: 245, proj: 'slam', slamR: [80, 80, 92, 92, 104], kb: 36, // 통통: 묵직한 박치기 (피해 +35% · 넉백 ↑)
    taunt: 0.6, guard: { r: 55, cut: 0.12 }, // 몸집으로 막는다: 멤버 노리는 기술 대신 맞기(60% 시간) · 자기 줄 입구 피해 -12%
    diet: { perSlam: [21, 21, 23, 23, 26], perSec: 4, sec: [10, 10, 11, 11, 12], dmg: 0.4, interval: 0.2, range: 330, speed: 820, charmRes: 0.3 }, // 통통할 땐 홀림 70% 짧게 · 박치기 직후엔 면역
    quake: { w: 22, kb: 40, mul: 1.5 }, // 통통 박치기: 땅을 쿵 → 진상 쪽으로 땅이 갈라지는 직선 충격파 (폭 22 · 줄 위 전부 · 밀침)
    attack: '지진 박치기 — 통통할 땐 땅을 쿵! 진상 쪽으로 땅이 쩍 갈라지는 직선 충격파 (줄 위 전부 · 밀어냄) · 게이지가 차면 다이어트 주사 → 날씬 모드 초고속 직선 잽',
    desc: '"오늘까지만 먹고 내일부터 다이어트!" 통통할 땐 홀림도 잘 안 먹히는 벽, 주사 한 방이면 복서로 변신. 10초 뒤엔… 요요!',
    perks: { 3: '충격파가 길고 굵게 · 날씬 모드 +1초', 5: '날씬 모드 제일 길고 충격파 제일 굵게' },
    skill: { id: 'dietshot', name: '다이어트 주사', cd: 12, desc: '바로 날씬 모드! 화면의 숨은 진상을 모두 드러내고 표시 (+25% 피해) · 이미 날씬하면 +4초' },
    shouts: ['내일부터 다이어트!', '요요 왔다…', '한 입만!'],
  },
  ara: {
    id: 'ara', bossKit: 1.45, kit: 0.9, name: '고아라', gender: 'f', emoji: '👸', color: '#ffc4ec', gacha: true, attr: 'booze',
    img: '/img/lb/h_ara.webp', imgAlt: '/img/lb/h_ara_old.webp', role: '보스 킬러 · 할머니일 땐 지팡이, 공주 변신 후 돌진해 한 방씩',
    dmg: 175, interval: 1.85, range: 470, proj: 'hammer', projSpeed: 640,
    age: { princess: [13, 13, 14, 14, 16], old: [8, 8, 7, 7, 6], dmg: 0.65, slow: 1.4 },
    attack: '공주 망치 — 아주 무거운 한 방. 보스·체력 많은 진상부터 노린다 (가끔 폭삭 늙으면 힘이 반토막)',
    desc: '맑은 목소리의 공주님… 이지만 실상 나이는 꽤 많다. 그래도 모임원들이 "아라야~" 부르는 한마디면 오늘도 망치를 들고 진상들을 해치우러 나가 아침까지 싸운다. 가끔 폭삭 늙어 "아이고 허리야…" 하지만, 조금 쉬면 다시 공주!',
    perks: { 3: '공주로 더 오래 · 빨리 돌아온다', 5: '망치가 떨어진 곳 주변도 쿵' },
    skill: { id: 'princess', name: '공주의 일격', cd: 18, desc: '가장 센 적에게 거대한 망치 (보스에게 특히 아픔) + 바로 공주로 돌아온다', mul: [3.6, 3.6, 4.2, 4.2, 4.8] },
    shouts: ['공주님 나가신다~', '아이고 허리야…', '다시 공주!'],
  },
  hochan: {
    id: 'hochan', bossKit: 1.15, kit: 1.25, name: '이호찬', gender: 'm', emoji: '👑', color: '#ffcf3f', legend: true, gacha: true, attr: 'talk',
    img: '/img/lb/h_hochan.webp', role: 'LEGEND · 랑방 방장 · 황금 파동',
    dmg: 50, interval: 2.2, range: 640, proj: 'crown', lane: 46, waveW: [40, 40, 46, 46, 52], projSpeed: 520,
    buff: { per: 0.03, max: 0.3, sec: [3, 3, 4, 4, 4] }, // 맞힌 진상 1명마다 다른 멤버 공격력 +3% (최대 +30%)
    attack: '랑방을 위하여! — 느린 박자로 자기 줄 전체를 휩쓰는 황금 파동. 맞힐 때마다 멤버 공격력 ↑ · 줄 안 진상 버프 하나 벗김',
    desc: '랑방을 처음 만든 초대 전설의 방장. MT 날이면 대절 버스를 빌려 200명을 태우고 전국을 누볐다. 모두가 그를 따르고, 그는 모임원 한 명 한 명을 진심으로 아낀다. 금빛 확성기로 "랑방을 위하여!" 외치면 막차 버스 행렬이 골목을 쓸고 멤버들은 힘이 솟는다. (누가 봐도 사기캐 — 1:1 대전에선 힘 ×0.7)',
    perks: { 3: '파동이 더 넓고 버프가 오래', 5: '파동이 한 번 더 울린다 (메아리)' },
    skill: { id: 'forlangbang', name: '막차 대행진', cd: 55, desc: '황금 버스 행렬이 모든 줄을 쓸어요 · 전부 밀치고 0.8초 기절 + 모든 멤버 공격력 +25% (5초 · Lv3 +30% · Lv5 +35%) · 기세 2칸 (판을 뒤집는 큰 스킬 · 쿨 김)', sec: [5, 5, 6, 6, 7], atk: [0.25, 0.25, 0.3, 0.3, 0.35], stun: 0.8 }, // (1.5초 기절 · +40~50% → 0.8초 · +20~30%: 스킬 한 번에 판이 끝나서. 대신 막차 버스(기본 공격) 피해 7.6 → 9)
    shouts: ['랑방을 위하여!', '방장 왔다!', '다들 모여!', '여긴 내가 지킨다', '버스 출발한다~ 다 탔지?', '우리 모임원 건드리지 마라'],
  },
  // ─── 새 멤버 4명 (모집 · 카드 10장) ───
  soyoung: {
    id: 'soyoung', bossKit: 0.95, kit: 1.05, name: '정소영', gender: 'f', emoji: '🗯️', color: '#ff8fb1', gacha: true, attr: 'talk',
    img: ART('h_soyoung'), role: '소환사 · 잔소리로 성준영 조종 (직접 공격 없음)',
    dmg: 30, interval: 0.95, range: 375, proj: 'nag', projSpeed: 520, noHit: true,
    nag: { heal: [0.03, 0.03, 0.035, 0.035, 0.045], call: [13, 13, 14, 14, 16], start: 60 }, // 잔소리 한 번에 성준영 체력 +% (최대 체력 대비) · 준영이 없으면 부르기 게이지 +% (100 = 등판) · 처음 게이지
    attack: '잔소리 — 진상은 안 때린다. 잔소리 한 번마다 성준영 체력이 차고 (공격 속도가 빠를수록 자주), 준영이 없으면 부르기 게이지가 차서 가득 차면 준영이 나온다',
    desc: '"그러니까 내가 뭐랬어!" 직접 싸우진 않는다. 잔소리로 성준영을 부려 진상을 쓸어 모으게 하고, 준영이 지쳐 쓰러질 것 같으면 또 잔소리로 일으켜 세운다.',
    perks: { 3: '잔소리 한 번에 준영 체력이 더 많이 찬다', 5: '준영이 더 튼튼하고 더 넓게 쓸어 모은다' },
    skill: { id: 'allincall', name: '올인 콜! 준영 등판', cd: 35, desc: '성준영을 바로 불러낸다 (이미 있으면 체력 가득) · 7초 동안 올인 모드 — 끌어모으는 범위 +50% · 한 번에 3명 더 · 쓸어 담기 피해 2배', sec: [7, 7, 7, 7, 8] },
    shouts: ['그러니까 내가 뭐랬어!', '준영아 나와!', '한 번만 더 말한다?', '준영아 똑바로 해!'],
  },
  jieun: {
    id: 'jieun', bossKit: 1.0, kit: 1.05, name: '오지은', gender: 'f', emoji: '🕰️', color: '#b48cff', gacha: true, attr: 'charm',
    img: ART('h_jieun'), imgAlt: ART('h_jieun_demon'), role: '시간 · 감속 전문 · 공격할 땐 악마 모드',
    dmg: 55, interval: 1.02, range: 405, proj: 'tick', projSpeed: 560, slow: 0.35, slowSec: 1.6,
    clock: { r: [40, 40, 46, 46, 54], sec: [1.6, 1.6, 2.1, 2.1, 2.6], delay: 0.28 }, // 시계 장판: 0.28초 뒤 째깍(가운데 제 피해 · 곁 40%) → 남은 동안 그 자리 진상 35% 느리게
    demon: { sec: 0.55 }, // 공격하는 순간 무서운 모습으로
    attack: '째깍 시계 — 날아가지 않고 진상 발밑에 시계가 스르륵 떠올라 째깍! 시계가 남아 있는 동안 그 자리를 지나는 진상은 느려진다 (덫). 공격하는 순간 순한 얼굴이 악마로…',
    desc: '보브컷의 순한 막내. 그런데 공격만 하면 눈빛이 변한다. "…시간아 멈춰라."',
    perks: { 3: '시계가 더 크고 오래 (1.6 → 2.1초)', 5: '시계 제일 크게 · 시간 정지가 더 넓고 길게' },
    skill: { id: 'timestop', name: '시간 정지', cd: 45, desc: '찍은 곳에 커다란 시계 구역 — 그 안 진상은 크게 느려진다 (들어오는 진상도 · 보스는 조금만) · 그동안 악마 모드', target: true, r: [235, 235, 255, 255, 285], sec: [4, 4, 4.5, 4.5, 5.5], slow: 0.35 }, // (10/08 범위 200~250 → 235~285 · 그 자리에 남아 들어오는 진상도 느려짐)
    shouts: ['시간아 멈춰라…', '헤헤♡', '…도망 못 가.'],
  },
  sanghwa: {
    id: 'sanghwa', bossKit: 1.05, kit: 1.0, name: '박상화', gender: 'm', emoji: '😊', color: '#ffc36b', unlock: true, attr: 'power',
    img: ART('h_sanghwa'), role: '성장 · 경제 · 판이 길수록 강해진다',
    dmg: 38, interval: 1.08, range: 415, proj: 'rose', projSpeed: 620,
    grow: { perWave: 0.05, perKill: 0.002, max: 0.45, exp: 0.5, coin: 0.12 }, // 웨이브마다 +5% · 처치마다 +0.2% (최대 +45%) · 잡은 진상 경험치 +50% · 클리어 코인 +12%
    rose: { need: 3, keep: 6, bloom: 1.6, r: 62, grow: 0.01 }, // 장미 표식: 6초 안에 3송이면 "꽃다발!" 주변 터짐 (한 방 ×1.6) · 성장 +1%
    attack: '매너 장미 — 좌우로 크게 휘어 날아가 콕 (장애물 너머로). 맞은 진상에 장미 한 송이 · 3송이 모이면 꽃다발이 펑! 주변까지 · 판이 길수록 세진다',
    desc: '앞머리 살짝 가르마 펌, 작은 눈에 예쁜 미소. 오래 있을수록 점점 더 멋있어지는 남자. 장미는 휘어서 줘야 멋있다. 클리어 코인 +12%.',
    perks: { 3: '성장 한도 +10% · 꽃다발 범위 +', 5: '경험치 보너스 +25% · 꽃다발 2송이에 터짐' },
    skill: { id: 'goodman', name: '좋은남자 박상화!', cd: 16, target: true, r: [80, 80, 90, 90, 100], desc: '찍은 곳에 백 송이 장미 꽃다발이 쏟아진다 — 범위 피해 (자란 만큼 더 · 성장 +10%마다 +20%) + 필드의 장미 표식이 전부 한꺼번에 꽃다발로 터진다 · 성장 +7%', mul: [1.8, 1.8, 2.1, 2.1, 2.4], growK: 2, grow: 0.07 },
    lines: ['좋은남자 박상화!', '끝내주는남자 박상화!', '매너남 박상화!', '다정한남자 박상화!', '능력남 박상화!', '센스쟁이 박상화!', '완벽한남자 박상화!'],
    shouts: ['좋은남자 박상화!', '끝내주는남자 박상화!'],
  },
  jungmin: {
    id: 'jungmin', bossKit: 0.8, kit: 0.9, name: '홍정민', gender: 'm', emoji: '🩹', color: '#7fd88f', unlock: true, attr: 'booze',
    img: ART('h_jungmin'), role: '입구 수리 전담 · 꽉 차면 방패',
    dmg: 34, interval: 1.2, range: 165, proj: 'tap', projSpeed: 480, // (24 → 30: 술 멤버 기본 화력)
    swing: { arc: 1.15, max: 4, side: 0.6, kb: 22, glare: 3, glareCut: 0.2 }, // 휘두르기: 앞 반원(±66°) 최대 4명 (둘째부터 60%) · 살짝 밀침 · 흉터 눈빛 3초 (그동안 입구 치는 힘 −20%)
    repair: { every: 3.0, every5: 2.4, pct: [0.026, 0.026, 0.028, 0.028, 0.032] }, // 3초마다 입구 최대 내구도의 % 수리 (Lv5 2.4초) — 입구 수리는 이제 홍정민 몫 (건전녀는 멤버 간호)
    brace: { all: 0.1, crash: 0.5 }, // 보강: 있는 동안 입구 받는 피해 −10% · 돌격 진상 충돌 −50% (10/10 등급 맞춤: 수리 4.6~5.8% → 2.6~3.2% · 보강 −25% → −10% · 바리케이드 수리 14~20% → 10~15% — 혼자서 입구를 거의 안 깎이게 만들었다)
    attack: '소주병 휘두르기 — 입구 앞까지 온 진상들을 거꾸로 든 소주병으로 크게 휙! (앞 반원 · 최대 4명 · 밀침) 맞은 진상은 흉터 눈빛에 쫄아 3초 동안 입구를 덜 세게 친다 · 틈틈이 붕대로 입구 수리 · 있는 동안 입구 피해 −10%',
    desc: '짧은 머리, 험한 눈매, 눈가에 소주병 흉터와 붕대. 입구 앞은 이 사람 구역 — 다가오면 휘두르고, 깨지면 붙인다.',
    perks: { 3: '수리량 +20%', 5: '수리가 더 자주 (2.4초마다) · 붕대 벽이 더 길고 튼튼' },
    skill: { id: 'bandage', name: '붕대 바리케이드', cd: 20, target: true, r: [70, 70, 80, 80, 90], desc: '찍은 높이에 붕대 벽을 가로로 쫙 친다 (4초 · 진상이 벽 앞에서 멈추고 벽에 닿아 있는 동안 따끔) + 입구 수리 · 4초 동안 입구 피해 −35%', heal: [0.1, 0.1, 0.12, 0.12, 0.15], sec: [4, 4, 5, 5, 6], armor: 0.35, wall: { w: [150, 150, 170, 170, 200], sec: [4, 4, 4.5, 4.5, 5.5], hp: 0.5, dps: 0.6 } },
    shouts: ['가만있어 봐, 붙여 줄게.', '이 정도는 금방이지.', '어디 또 깨졌냐?'],
  },
  jiwon: {
    id: 'jiwon', bossKit: 1.1, kit: 1.0, name: '여지원', gender: 'f', emoji: '🖕', color: '#e0304a', gacha: true, attr: 'talk',
    img: '/img/lb/h_jiwon.webp', role: '방깎 · 3줄 모자이크 폭격',
    dmg: 46, interval: 0.83, range: 365, proj: 'mosaic', projSpeed: 560,
    shred: { per: 0.1, max: 5, sec: 5 }, // 맞은 진상 받는 피해 +10% × 최대 5겹 (5초) + 방어율 한 겹마다 1/5 벗김 (ARMOR.shredPer) → 다른 멤버 피해도 같이 오른다 · 회복도 막는다
    censor: { sec: 4, amp: 0.25, r: 58, mul: 0.8 }, // 5겹 = "검열 완료": 4초 동안 모두에게 +25% 더 · 그동안 쓰러지면 픽셀 폭발 (주변 피해 · 모자이크 2겹 번짐)
    attack: '점멸 모자이크 손 — 손이 세 번 끊어 순간이동하며 날아가 콕 (가는 길엔 안 맞음). 맞은 진상 방어가 겹겹이 벗겨지고 곁 진상에게도 한 겹 번진다 · 5겹이면 「검열 완료」 (모두에게 +25% · 쓰러지면 픽셀 폭발)',
    desc: '착해 보이는 얼굴, 하지만 속엔 당찬 욕망이 가득. 철갑 진상일수록 웃으며 모자이크로 벗겨 버린다. "어머, 실수~"',
    perks: { 3: '방깎 +1겹 (최대 6)', 5: '방깎 한 겹 -12% · 검열 완료 폭발 더 크게' },
    skill: { id: 'mosaicbomb', name: '모자이크 폭격', cd: 16, target: true, r: [60, 60, 60, 60, 60], desc: '두 손 번쩍! 검은 검열 띠가 지나가고 "삐—" — 찍은 줄과 양옆 줄에 거대 모자이크 손이 차례로 쾅! 쾅! 쾅! 맞은 진상 피해 + 0.5초 기절 + 「모자이크」 5초 (방어 -40% · 모든 멤버에게 받는 피해 +25%)',
      wind: 0.6, gap: 0.18, w: 30, mul: [0.36, 0.36, 0.4, 0.4, 0.47], /* (쿨 다양화 22 → 16초) */ stun: 0.5, sec: 5, brkArmor: 0.4, brkDmg: 0.25 }, // 쌍뻑큐(1줄 · 1.1~1.45배 · 18초) → 3줄 × 0.5~0.65배 = 합계 약 ×1.35 · 22초
  },
  wonsik: {
    id: 'wonsik', bossKit: 0.8, kit: 0.9, name: '정원식', gender: 'm', emoji: '🏋️', color: '#6fae6f', gacha: true, attr: 'power',
    img: '/img/lb/h_wonsik.webp', role: '반격 탱커 · 피해 감소',
    dmg: 62, interval: 1.58, range: 305, proj: 'jab', projSpeed: 700,
    counter: { mul: 1.1, cd: 0.35, kb: 45 }, // 반격: 곁(guard.r)의 진상이 입구를 치면 바로 받아치는 카운터 펀치 (한 방 ×1.1 · 밀침 · 0.35초마다)
    taunt: 0.4, // 도발: 멤버를 노리는 진상 기술을 대신 받는다 (40% 시간)
    guard: { r: 150, cut: 0.3, all: 0.12 }, // 곁의 진상이 입구를 칠 때 -30% · 나머지 입구 피해도 -12% (10/10 등급 맞춤: 45% · 25% → 30% · 12% · 상담 체력 28%+7% → 18%+5%) (110·40% → 150·45% + 전체: 탱커가 입구를 확실히 지키게)
    attack: '카운터 — 곁의 진상이 입구를 치는 순간 "어딜!" 받아치는 반격 펀치 (밀침) · 평소엔 짧게 뻗는 잽 충격파 · 곁 입구 피해 −30% · 나머지 −12%',
    desc: '결혼을 꿈꾸는 마흔셋. 유일한 취미는 헬스. 따뜻한 마음으로 모두를 지켜 준다. "올해는 꼭…"',
    perks: { 3: '피해 감소 반경 +20%', 5: '상담 체력이 더 늘어난다' },
    skill: { id: 'marry', name: '결혼정보회사 등록', cd: 25, consult: { walk: 140, r: 220, pool: 0.18, poolLv: 0.05, cut: 0.2, reflect: 0.2, slow: 0.25 }, desc: '입구 바로 앞으로 뛰어가 막아선다 — 입구 대신 원식이 전부 맞는다 (상담 체력 = 입구의 18%+ · 받는 피해 -20% · 20% 되돌려 줌 · 곁 진상 25% 느리게 · 넓은 반경 진상이 원식만 노린다) · 에너지 바가 다 닳을 때까지 안 물러난다' }, // (길 가운데 10초 → 입구 앞 · 시간 제한 없이 에너지 바가 닳을 때까지 · 체력 18%+6% → 28%+7%)
  },
  baul: {
    id: 'baul', bossKit: 1.0, kit: 1.0, name: '송바울', gender: 'm', emoji: '🏂', color: '#7ad0ff', gacha: true, attr: 'charm',
    img: '/img/lb/h_baul.webp', role: '완전 수동 · 탭한 곳으로 보드 돌진 (기본 공격 없음)',
    dmg: 44, interval: 1.15, range: 360, proj: 'board',
    board: { charges: [3, 3, 3, 4, 4], refill: [2.6, 2.6, 2.3, 2.3, 2.0], speed: 620, w: 24, mul: 1.7, chain: 0.85, kb: 8, daze: 0.35, reach: 330, idle: 3, combo: { win: 2.2, per: 0.15, max: 5 }, perfect: { win: 0.3, mul: 1.4, stun: 0.6 } }, // 보드 충전 칸 (refill 초마다 한 칸) · 탭한 곳으로만 돌진 · 이어 타기 콤보 (2.2초 안에 또 맞히면 +15% 씩 · 최대 5) · 퍼펙트 (착지 직전 0.3초 안에 다음 탭 → ×1.4 · 휘청) · 3초 탭 없으면 자리로
    attack: '수동 보드 — 기본 공격이 없다. 필드를 탭한 곳으로만 보드를 타고 쭉 미끄러지며 길 위 진상을 전부 친다 (보드 충전 3칸 · 2.6초마다 한 칸) · 2.2초 안에 또 맞히면 콤보 +15% · 착지 직전에 다음 곳을 탭하면 「퍼펙트!」 ×1.4',
    desc: '얼굴은 멀쩡한데 어딘가 허술하다. 설레발과 아는 척의 달인 — "이거 내가 원래 알던 거야~" 하며 보드를 타고 골목 여기저기 여자들한테 말 걸고 다니다가, 진상들까지 덤으로 쓸어 버린다.',
    perks: { 3: '충전이 빨라진다 (2.3초) · 총출동 착지 피해 +15%', 5: '충전 4칸 · 2초마다 · 부딪힌 진상 휘청' },
    skill: { id: 'sled', name: '팬클럽 총출동', cd: 10, target: true, r: [80, 80, 90, 90, 100], desc: '팬클럽이 점프대를 대령! 찍은 곳으로 날아올라 공중 트릭 → 착지 (범위 피해 + 밀침) · 그 뒤 2.5초 동안 「총출동」 — 충전 안 쓰고 마음껏 탈 수 있고 돌진 +30% · 지나간 길은 3초 동안 빙판 (진상 40% 느리게) · 쿨 짧아 자주 탄다', mul: [1.3, 1.3, 1.45, 1.45, 1.65], kb: 50, air: 0.6, fan: { sec: 2.5, spd: 0.6 }, fever: { sec: 2.5, dmg: 0.3, trail: 3, w: 16, slow: 0.4 } }, // (점프 착지는 짧게 · 진짜는 그 뒤 5초 동안 직접 타는 것 — 박나영 급강하(불꽃 고리)와 다르게)
    shouts: ['이거 내가 원래 알던 거야~', '내가 알지~', '팬클럽 출동!', '설레발 아니고 진짜야'],
  },
  byunghwa: {
    id: 'byunghwa', bossKit: 1.1, kit: 1.2, name: '강병화', gender: 'm', emoji: '🎤', color: '#ff7ab8', legend: true, gacha: true, attr: 'charm',
    img: '/img/lb/h_byunghwa.webp', role: 'LEGEND · 핀 조명으로 관객 끌어모으기 · 원맨쇼',
    dmg: 30, interval: 1.6, range: 310, proj: 'shout', cone: [0.5, 0.5, 0.58, 0.58, 0.66], coneMax: 4, charm: [0.8, 0.8, 0.9, 0.9, 1.0], // (홀림 1.2~1.5 → 0.8~1.0초 · 한 번에 6 → 4명: 기본 공격 홀림만으로 판이 멈춰 있었음)
    spot: { r: [70, 70, 78, 78, 86], pull: 0.5 }, // 핀 조명: 진상이 가장 몰린 곳에 조명 → 조명 근처 진상이 가운데로 끌려와 (50%) 홀린다 (최대 coneMax 명)
    aura: { r: 170, crit: 0.15, cc: 0.5 }, // 곁(3칸) 멤버 치명타 +15% (무대 조명 · 공속 오라는 방장 몫) · 상태이상 시간 절반
    attack: '핀 조명 — 진상이 가장 몰린 곳에 조명을 쏘면 근처 진상(최대 4명)이 조명 가운데로 끌려와 0.8초 홀려 멈춘다 (보스는 느려짐) · 곁 멤버 치명타 +15% · 상태이상 절반',
    desc: '지금은 모임에 없는 전설의 인물. 그가 연기를 시작하는 순간 모임의 분위기는 순식간에 파티로 바뀌고, 진상들마저 관객석에 모여 넋을 놓는다.',
    perks: { 3: '홀림 +0.1초 · 조명 더 넓게', 5: '원맨쇼 1초 더' },
    skill: { id: 'oneman', name: '원맨쇼', cd: 40, desc: '컷인! 6초 동안 보스·중간 보스 빼고 모두 춤추며 멈춤 · 보스·중간 보스는 50% 느리게 · 무대 위 진상은 모든 멤버에게 받는 피해 +30% (관객 야유) · 멤버 상태이상 해제', sec: [6, 6, 6.5, 6.5, 6.5], atk: 0, amp: 0.3 }, // (쿨 다양화: 실제 45 → 55초 · 6초로) // (팀 공격력 버프 → 진상 받는 피해 +: 팀 버프는 방장 · 이호찬 몫)
    shouts: ['컷! 다시 가자!', '여기가 내 무대야', '관객 여러분~', '박수!'],
  },
  jeongseob: {
    id: 'jeongseob', bossKit: 0.6, kit: 0.7, name: '윤정섭', gender: 'm', emoji: '🧍', color: '#8fa6d8', gacha: true, attr: 'booze',
    img: '/img/lb/h_jeongseob.webp', role: '탱커 · 밀어내기 · 감속',
    dmg: 4, interval: 9, range: 200, proj: 'wall', scale: 1.25,
    wall: { speed: [39, 39, 41, 41, 45], back: 90, rest: [3.5, 3.5, 3, 3, 2], hp: [800, 800, 1000, 1000, 1250], cut: 0.5, touchSlow: 0.3, afterSlow: 0.5, bossTouch: 0.65, bossAfter: 0.75, slowSec: 3, bossPush: 0.3, w: [66, 66, 72, 72, 78] }, // 뚜벅뚜벅 (한 줄 10~12초 · 빨리 돌아와 6초만 쉼) · w = 밀어내는 폭의 절반 (46 → 50~58: 자기 줄 + 양옆 줄 절반쯤)
    attack: '뚜벅뚜벅 — 두 팔 벌리고 자기 줄을 걸어 올라가며 진상을 통째로 밀어낸다 (피해 없음 · 닿으면 느려짐)',
    desc: '키 210의 차분한 거인. 말없이 걸어가 진상들을 밖으로 모셔 간다.',
    perks: { 3: '걷는 속도 · 버티는 힘 · 미는 폭 ↑', 5: '쉬는 시간이 1초 짧아진다 · 미는 폭 ↑' },
    skill: { id: 'wallwalk', name: '벽이 걸어온다', cd: 14, desc: '언제 눌러도 그 자리에서 바로 돌아서 출발! 4초 동안 1.5배로 커지고 조금 빨라져 넓게 밀어낸다 (돌아오는 중 · 쉬는 중 · 지쳤을 때도 체력 가득) · 끝에서 쿵! 뭉친 진상 1칸 밀치고 1초 기절 (피해 없음)', sec: [4, 4, 4, 4, 5], grow: 1.5 }, // (1.3 → 1.5배: 범위가 좁다는 의견)
  },
  subin: { // 8장 새 멤버 신부 친구 (이름은 임시 — 그림 파일은 *_subin)
    id: 'subin', bossKit: 0.9, kit: 1.0, name: '임수빈', gender: 'f', emoji: '', color: '#c9a8ff', gacha: true, attr: 'power',
    img: '/img/lb/h_subin.webp', role: '춤추는 리본 · 묶기 · 댄스 플로어',
    dmg: 40, interval: 1.12, range: 355, proj: 'bouquet', projSpeed: 600,
    tie: { sec: [1.0, 1.0, 1.2, 1.2, 1.5], again: 2.5, bossSlow: 0.5, thief: 1.6 }, // 맞은 진상을 리본으로 묶어 제자리 (같은 진상은 2.5초 뒤부터 다시) · 보스 · 중간 보스는 묶이지 않고 50% 느려짐 · 봉투 든 축의금 도둑은 1.6배 오래
    attack: '리본 턴 — 한 바퀴 턴하며 던진 리본이 나선을 그리며 빙글빙글 날아가 (앞뒤로 돌며 커졌다 작아졌다) 맞은 진상을 칭칭 감아 제자리에서 춤추게 한다 (봉투 든 축의금 도둑은 더 오래 · 보스는 느려짐)',
    desc: '어디서든 흥에 빠져 있는 신부의 20년 지기 베프. 음악이 들리면 몸이 먼저 움직이고, 그녀가 춤추기 시작하면 진상들까지 저도 모르게 따라 춘다. "음악 틀어 줘!"',
    perks: { 3: '감는 시간 +0.2초', 5: '감는 시간 +0.3초 · 댄스 플로어가 더 넓고 한 박자 더' },
    skill: { id: 'bouqtoss', name: '스핀 스포트라이트', cd: 16, target: true, r: [90, 90, 100, 100, 115], mul: [0.55, 0.55, 0.6, 0.6, 0.7], tie: [1.0, 1.0, 1.1, 1.1, 1.2], amp: 0.25, ampSec: 4, beats: [3, 3, 3, 3, 4], beat: 0.55, last: 2.2,
      desc: '찍은 곳에 조명이 쏟아지며 빙글빙글 도는 댄스 플로어가 깔린다 — 박자마다 (3박) 플로어 위 진상을 리본으로 휘감아 피해 + 1초 묶기 · 마지막 박자에 피루엣 쾅! · 묶인 진상은 4초 동안 모든 멤버에게 받는 피해 +25%' },
    shouts: ['음악 틀어 줘!', '다음 차례는 너야~', '같이 춰요~', '스텝 밟아!'],
  },
  // ── HIDDEN (숨은 조건: 5-6 캠프파이어 ★★★) ── 통통한 주황 아기 용을 타고 다니는 여자 (그림: h_dragon.webp · h_dragon_attack.webp 8칸 · 던지는 칸 4)
  //  (그림 왔음: ART_READY 'h_dragon' · HERO_ANIM 'dragon' · 스킬 아이콘 ui2/sk_dragon.webp)
  dragon: {
    id: 'dragon', bossKit: 0.95, kit: 1.05, name: DRAGON_NAME, gender: 'f', emoji: '🐉', color: '#ff8a2a', hidden: true, attr: 'booze', // (술: 캠프파이어 · 회식 열기와 어울리게 · 속성 인원 7·7·7·7)
    img: ART('h_dragon'), role: 'HIDDEN · 용 불 뿜기 · 화상 · 불 바닥 · 급강하',
    dmg: 30, interval: 1.3, range: 250, proj: 'breath',
    breath: { cone: [0.42, 0.42, 0.48, 0.48, 0.56], max: 6, side: 0.7, burn: 0.35, burnSec: 3, ground: { r: 36, sec: 2, dps: 0.5 } }, // 짧은 부채꼴 (반각 0.42 → 0.56 rad) · 최대 6명 (둘째부터 70%) · 화상 3초 (초당 한 방 ×0.35 · 겹칠수록 세게) · Lv3 부채꼴 끝에 불 바닥 2초
    attack: '박나뇽의 불 뿜기 — 나영이 또 헛소리를 시작하면 듣기 싫은 박나뇽이 "화르륵" 짧은 부채꼴 불을 뿜는다 (불길은 앞의 진상들 쪽으로) (최대 6명) · 맞은 진상은 3초 동안 화상 (겹칠수록 세게 · 방어 무시) · Lv3 부터 불길 끝에 불 붙은 바닥',
    desc: '어느 날, 자기를 쏙 빼닮은 미지의 용 "박나뇽"이 찾아왔다. 둘도 없는 파트너라 믿었지만… 나영이 헛소리를 늘어놓을 때마다 박나뇽은 듣기 싫다는 듯 불을 내뿜는다. 덕분에 골목의 진상들만 매번 불바다.',
    perks: { 3: '불길 끝에 불 바닥 (2초) · 불길 더 넓게', 5: '불 바닥 더 크게 · 불길 제일 넓게' },
    skill: { id: 'dive', name: '용의 급강하', cd: 15, target: true, r: [85, 85, 95, 95, 110], mul: [1.6, 1.6, 1.8, 1.8, 2.1], kb: 55, air: 0.75, ring: { sec: 2.5, dps: 0.55 },
      desc: '나영이 "내 말 좀 들어 봐!" 하는 순간 박나뇽이 참다못해 하늘로 날아올라 찍은 곳에 쾅! 내리꽂힌다 (0.75초 · 그림자 예고) — 범위 큰 피해 + 바깥으로 밀침 + 화상 · 떨어진 자리에 2.5초 동안 불꽃 고리' },
    shouts: ['박나뇽, 내 말 좀 들어 봐~', '(화르륵)', '아니 진짜라니까?', '왜 또 불을 뿜어!?', '우리 둘도 없는 파트너잖아~'],
  },
};
// 소환 멤버 (덱 · 모집 · 도감 목록에는 없다): 정소영이 부르는 성준영
for (const h of Object.values(HEROES)) for (const k of ['img', 'imgAlt', 'imgOn', 'imgRage']) if (h[k]) h[k] = artV(h[k]); // 새로 그린 그림은 ?v= (ART_VER)
for (const [id, s] of Object.entries(KD_SUP)) if (HEROES[id]) HEROES[id].supTip = s.tip; // 서포터 전문 (멤버 정보에 보여 준다)
export const SUMMONS = {
  junyoung: {
    id: 'junyoung', summon: true, bossKit: 1, kit: 1, name: '성준영', gender: 'm', emoji: '🃏', color: '#9fd4ff', attr: 'talk',
    img: ART('h_junyoung'), role: '소환 · 돈 쓸어 모으기 · 진상 끌어모으는 미끼',
    dmg: 30, interval: 0.55, range: 380, proj: 'sweep',
    sweep: { hp: [0.2, 0.2, 0.24, 0.24, 0.28], hpMeta: 0.02, r: [110, 110, 120, 120, 135], hold: 40, pull: 110, bossPull: 0.25, max: [5, 5, 6, 6, 7], tick: 0.5, dmgK: 0.24, walk: 58, cut: 0.2, tire: 0.02, wp: [1.4, 2.6], allinR: 1.5 }, // 체력 = 입구 최대 내구도의 % · 끌어모으는 반경 · 붙잡는 최대 수 · 0.5초마다 붙잡은 진상에게 조금씩 (한 방의 24%) · 받는 피해 −40%
    allin: { r: 90, mul: 5, kb: 80 }, // 지쳐서 퇴근할 때 "올인!" 작은 폭발 · 붙잡던 진상은 위로 밀어 보낸다 (kb) (피해 = 한 방 × 5)
    attack: '칩 긁어모으기 — 바닥의 배팅 칩을 갈퀴로 긁어 담듯 아래에서부터 이리저리 돌아다니며 주변 진상을 자기 쪽으로 끌어모은다 (피해는 아주 조금). 붙잡힌 진상은 입구 대신 준영을 때린다',
    desc: '비실비실해 보이지만 돈 냄새는 귀신같이 맡는다. 소영 잔소리에 떠밀려 나와 바닥의 돈을 쓸어 담고, 지치면 "올인!" 하고 퇴근한다.',
    perks: { 3: '-', 5: '-' },
    shouts: ['올인!', '이거 다 내 칩!', '칩 긁어 담자~', '아 왜 또 불러…'],
  },
};
// ─── 멤버 등급(티어): 늦게 만나는 멤버일수록 기본이 세다 · 초반 멤버는 강화 한도가 낮다 ───
// (최대 강화 T1 < 중간 강화 T3 — 초반 멤버는 초반과 시너지로 쓰고, 뒤로 갈수록 새 멤버로 바꿔 가게)
export const HERO_TIER = {
  bangjang: 1, staff: 1, gunman: 1, gunnyeo: 1,
  dohoon: 2, myunghoon: 2, eunok: 2, ingyu: 2,
  hanna: 3, donghan: 3, sunggu: 3, youngjun: 3,
  junseo: 4, hyungyeong: 4, ara: 4,
  hochan: 5, byunghwa: 5, baul: 3, subin: 3, dragon: 3,
  soyoung: 3, jieun: 3, sanghwa: 2, jungmin: 2, junyoung: 3, jiwon: 3, wonsik: 3, jeongseob: 3,
};
// 티어: 늦게 만나는 멤버일수록 기본이 세고(공격력 · 공격 속도) 성장은 완만 — 초반 멤버는 성장형
//  강화 0: T4 ≈ T1 × 1.6 · 강화 최대(20): T1 ≈ T4 × 0.85
export const TIER_MUL = [1, 1, 1.154, 1.308, 1.455, 1.652]; // 기본 공격력 배율
export const TIER_SPD = [1, 1, 1.04, 1.07, 1.1, 1.12]; // 기본 공격 속도 배율
export const TIER_GROWTH = [0.08, 0.086, 0.07, 0.059, 0.05, 0.045]; // 강화 1레벨당 공격력
export const TIER_MAX = [20, 20, 20, 20, 20, 20]; // 영구 강화 한도
// 기본 멤버(T1)는 역할이 뚜렷하고, 강화할수록 그 역할이 커진다 (강화 1레벨마다) — +20 이면 그 역할에서 T3 급
export const NICHE = {
  bangjang: { aura: 0.005, ult: 0.015, text: '팀 공속 오라 +0.5% · 총공지 충전 +1.5%' }, // +20: 오라 +10% · 충전 +30%
  gunman: { hard: 1.3, hardLv: 0.02, text: '단단한 진상(방어·범위 면역·방패·단일 저항)에게 ×1.3 + 레벨당 +2% · 방어 무시' }, // +20: ×1.7
  gunnyeo: { res: 0.012, care: 0.012, text: '멤버 전원 상태이상 시간 −1.2% · 간호 주기 −1.2%' }, // +20: 상태이상 −24% · 간호 24% 빨리 (입구 보호 · 수리는 홍정민 몫)
  staff: { kick: 0.03, stun: 0.02, text: '강퇴 피해 +3% · 강퇴 기절 +2%' }, // +20: 강퇴 피해 +60% · 기절 +40%
};
export const RES_PER_META = 0.015, RES_MAX = 0.35; // 영구 강화 1레벨 = 상태이상(기절 · 홀림 · 감속 등) 시간 -1.5% (장비와 합쳐 최대 -35%)
export const resOf = (meta, gearRes) => Math.min(RES_MAX, (meta || 0) * RES_PER_META + (gearRes || 0));
// 강화 이정표 (10/08 · 강화 체감): +5 · +10 · +15 · +20 마다 공격 +dmg · 공격 속도 +spd 를 한 번 더 (한 칸 한 칸은 그대로 + 다섯 칸마다 '확' 세짐) — 일반 스테이지 · 헬 · 화면 전투력
export const META_MILESTONE = { every: 5, dmg: 0.1, spd: 0.04, name: ['', '각성 I', '각성 II', '각성 III', '각성 IV'] };
export const metaMile = (meta) => Math.floor(Math.max(0, meta || 0) / META_MILESTONE.every);
export const mileDmg = (meta) => 1 + META_MILESTONE.dmg * metaMile(meta);
export const mileSpd = (meta) => 1 + META_MILESTONE.spd * metaMile(meta);
export const tierPower = (t, meta) => TIER_MUL[t] * TIER_SPD[t] * (1 + TIER_GROWTH[t] * meta);
export const tierPowerM = (t, meta) => tierPower(t, meta) * mileDmg(meta) * mileSpd(meta); // 이정표 포함 (스테이지 · 헬 전투력 · 강화 화면) — 대전 · 레이드는 tierPower 그대로
export const TIER_NAME = ['', 'T1', 'T2', 'T3', 'T4', 'LEGEND'];
export const heroTier = (id) => HERO_TIER[id] || 1;
export const metaMaxOf = (id) => TIER_MAX[heroTier(id)];
export const BASE_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
// (아래 두 목록은 한 판 안 카드용 — 무한 도전 '체험 합류' · 깜짝 등장 카드. 영구 합류 길은 heroRoute 가 정한다)
export const UNLOCK_HEROES = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun']; // 무한 도전에서 체험 합류 카드로 나오는 스토리 멤버
export const HIDDEN_HEROES = ['eunok', 'hanna', 'sunggu', 'dragon']; // 한 판 안 깜짝 등장 카드 (합류한 멤버만)
export const GACHA_HEROES = ['junseo', 'hyungyeong', 'ara', 'soyoung', 'jieun', 'jiwon', 'wonsik', 'jeongseob', 'baul', 'subin']; // 모집 멤버 (T3 · T4) — 획득 규정: 모집에는 T3 이상만 (박상화 · 홍정민은 스토리로)
export const LEGEND_HEROES = ['hochan', 'byunghwa']; // 모집 전설 (4-10 을 깨야 모집에 나온다)
// 해금이 필요한 멤버 전부 (순서 고정 — 동료 목록 · 선수 카드 순서)
export const LOCKED_HEROES = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun', 'eunok', 'hanna', 'sunggu', 'dragon', 'junseo', 'hyungyeong', 'ara', 'soyoung', 'jieun', 'sanghwa', 'jungmin', 'jiwon', 'wonsik', 'jeongseob', 'baul', 'subin', 'hochan', 'byunghwa'];
// 획득 경로 (멤버마다 정확히 하나): start · story · gacha · legend · hidden
export const ACQ_ROUTES = {
  start: { name: '시작 멤버', color: '#9fb3c8', tiers: 'T1', rule: '처음부터 함께 (4명)' },
  story: { name: '스토리 합류', color: '#5de07a', tiers: 'T2 · T3', rule: '정해진 스테이지를 처음 깨면 확정 합류 (1~3장)' },
  gacha: { name: '모집', color: '#4ea8ff', tiers: 'T3 · T4', rule: 'T3 = 카드 10장 · T4 = 나오면 바로 (50번 천장 · 주간 픽업) · 장 끝 합류 선택권' },
  legend: { name: 'LEGEND', color: '#ffd23f', tiers: 'LEGEND', rule: '4-10 클리어 뒤 모집 (90번 확정) · 진상의 탑 60층 선택' },
  hidden: { name: 'HIDDEN', color: '#ff4fd8', tiers: '—', rule: '숨은 조건을 채우면 (도감에 힌트)' },
};
export const heroRoute = (id) => (!LOCKED_HEROES.includes(id) ? 'start' : HIDDEN_COND[id] ? 'hidden' : LEGEND_HEROES.includes(id) ? 'legend' : HERO_UNLOCK[id] ? 'story' : 'gacha');
// 도감 · 멤버 카드 역할 분류 (실제 기술 기준 · 멤버마다 정확히 하나)
export const HERO_ROLES = {
  tank: { name: '탱커', desc: '앞에 나가서 막거나 밀어내고, 진상 공격을 대신 맞는다' },
  support: { name: '지원·회복', desc: '입구를 고치거나, 멤버 상태이상을 풀고 빠르게 · 세게 해 준다' },
  aoe: { name: '범위 공격', desc: '한 줄 · 한 무더기를 한꺼번에 쓸어 버린다' },
  single: { name: '단일 저격', desc: '보스 · 빠른 진상 · 센 진상 하나를 골라 잡는다' },
  ctrl: { name: '군중 제어', desc: '멈추고 · 느리게 · 홀려서 진상 발을 묶는다' },
  special: { name: '약화·특수', desc: '방어 깎기 · 표시 · 소환처럼 판을 바꾸는 기술' },
};
export const HERO_ROLE = {
  ingyu: 'tank', wonsik: 'tank', jeongseob: 'tank',
  bangjang: 'support', gunnyeo: 'support', dohoon: 'support', jungmin: 'support',
  eunok: 'aoe', sunggu: 'aoe', donghan: 'aoe', baul: 'aoe', junseo: 'aoe', hochan: 'aoe', dragon: 'aoe',
  gunman: 'single', sanghwa: 'single', ara: 'single', hanna: 'single', youngjun: 'single', myunghoon: 'single',
  staff: 'ctrl', jieun: 'ctrl', byunghwa: 'ctrl', subin: 'ctrl',
  jiwon: 'special', hyungyeong: 'special', soyoung: 'special',
};
export const heroRole = (id) => HERO_ROLE[id] || 'special';
// 진상 분류 (도감): 일반 · 중간 보스 · 보스
export const enemyKind = (d) => (d.boss ? 'boss' : d.mid ? 'mid' : 'normal');
export const ENEMY_KINDS = { normal: '일반 진상', mid: '중간 보스', boss: '보스' };
// 진상 등급 (도감): 보스 · 중간 보스 · 정예 · 일반 — 정예 = 일반 진상 중 단단한 쪽 (방어가 있거나 체력 100 이상)
//  (정예 웨이브 · 혼합 웨이브가 '제일 단단한 진상'을 정예로 세우는 것과 같은 기준: 한 방 공격이 잘 듣는 상대)
export const ELITE_HP = 100;
export const enemyGrade = (d) => (d.boss ? 'boss' : d.mid ? 'mid' : (d.armor || 0) > 0 || d.hp >= ELITE_HP ? 'elite' : 'normal');
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
    bottle: { every: 4.5, sec: 2, cut: 0.25, from: 6, deathStun: 0.8, deathR: 80 },
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
    kick: { name: '문짝 걷어차기', every: 8, first: 2.5, wind: 1.0, mul: 3.5, hit: 10, from: 4 }, // 입구 앞에서 1초 다리를 뒤로 젖혔다가 쾅 (입구 ×3.5 · 곁 멤버 게이지) — 젖힐 때 기절 · 밀치기면 끊긴다 (1-4 부터)
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
  // 2-10 끝 보스: 번화가 삐끼왕 (호객꾼 대장 — 형광 조끼 · 네온 선글라스 · 전단지 뭉치 · "VIP 무료입장" 팻말)
  //  기술은 BOSS_KITS.boss_bbikki (전단지 폭탄 · 호객 행위 · VIP 줄 세우기) · 체력 40% 에서 분노 (기술이 더 빨리)
  //  그림이 오기 전엔 영업왕 그림에 색만 입혀서 (fb)
  boss_bbikki: {
    id: 'boss_bbikki', cls: 'seduce', name: '번화가 삐끼왕', gender: 'm', emoji: '', color: '#c6ff3a', boss: true, fb: '/img/lb/e_boss_sales.webp',
    img: '/img/lb/e_boss_bbikki.webp', hp: 1250, speed: 12, atk: 28, atkInterval: 1.6,
    armor: 4, exp: 50, coin: 60, r: 42, size: 144,
    title: '번화가 삐끼왕 등장!', subtitle: '"VIP 무료입장~! 오늘 물 좋아요!"',
    shouts: ['VIP 무료입장~!', '오늘 물 좋아요!', '형님 한 번만 들어가 봐요', '전단지 받아 가세요~', '줄 서세요 줄!'],
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
    puke: { every: 6, reach: 200, r: 52, sec: 4, cut: 0.3, poison: 2.5 }, // "우웩!" 꿀렁(예고 · 멤버 발밑 표적) → 토가 날아가 철퍽: 맞은 멤버 독 2.5초 + 토 웅덩이(그 위 멤버 공격 속도 -30%) — 꿀렁할 때 기절시키면 끊긴다
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
    grab: { sec: 1.2, cd: 5 }, // 로프에 닿으면 팔을 쭉 뻗어 멤버를 붙잡는다 (못 쏨) — 잡으면 풀린다
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
    spit: { name: '강퇴 통보', every: [9, 11], first: 4, reach: 300, kind: 'stamp', st: 'silence', sec: 2.5, fly: 0.6 }, // 예고 뒤 "강퇴!" 도장 → 맞은 멤버 스킬 2.5초 침묵 (정소영 · 강병화 곁)
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
    duck: { every: 3.4, stun: 1.1, fly: 0.8 }, // 오리고기 투척: 맞은 멤버 기절 + 독 (KD.poison.duck 초 · 식중독)
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
    fake: { at: 0.45, evade: 0.3, speed: 1.4 }, // (10/08 진상 감사: 4장 진 판 입구 피해 40% — 들킨 뒤 속도 1.6→1.4) // "저 싱글이에요~" 잘 피하다가, 중간쯤 "사실 돌싱!" 들키면 막 뛴다
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
    img: '/img/lb/e_drunk_run.webp', hp: 45, speed: 82, atk: 5, atkInterval: 1.1, exp: 4, r: 16, size: 72, zigzag: 70, erratic: true, // (10/08 진상 감사: 6장 진 판 입구 피해의 62% · 쓰러짐 36% 를 혼자 — 공격 6→5 · 속도 86→82 · 갈지자 폭 90→70 으로 덜 빠지게)
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
    latte: { r: 230, slow: 0.4, off: 3 }, golf: { every: 8, stun: 0.8, fly: 0.6 }, // 라떼 + "나이스 샷!" 골프공으로 멤버 기절
    shouts: ['나이스 샷!', '라떼는 필드에서…', '요즘 애들은 골프도 몰라', '내가 싱글이야 (타수)'],
  },
  boss_kkondol: {
    id: 'boss_kkondol', cls: 'politic', name: '꼰대돌싱찌질남', gender: 'm', emoji: '😭', color: '#6a5a8a', boss: true,
    img: '/img/lb/e_boss_kkondol.webp', hp: 1900, speed: 11, atk: 34, atkInterval: 1.8, armor: 5, exp: 60, r: 44, size: 150,
    latte: { r: 250, slow: 0.4, off: 3 }, golf: { every: 6.5, stun: 1, fly: 0.6 },
    enrage: { at: 0.5, speed: 1.45, atk: 1.5, text: '사실 돌싱이었다!!' },
    title: '꼰대돌싱찌질남 등장!', subtitle: '"라떼는 말이야… 나 아직 싱글이야…"',
    shouts: ['나 때는 말이야!', '왜 나만 미워해!', '사실 싱글이야…'],
  },
  boss_queenmom: {
    id: 'boss_queenmom', cls: 'seduce', name: '여왕된장싱글맘', gender: 'f', emoji: '👜', color: '#e0a0ff', boss: true,
    img: '/img/lb/e_boss_queenmom.webp', hp: 2100, speed: 10, atk: 36, atkInterval: 1.8, armor: 4, exp: 60, r: 44, size: 152,
    shieldAura: { every: 8, r: 210, frac: 0.3 }, summon: { every: 9, count: 2, types: ['secretmom'] },
    toss: { every: 7, stun: 1.2, fly: 0.8, kind: 'bag', text: '명품 가방 투척!' },
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
  // ── 7장 스키장 MT (고난도): 진상마다 상태이상 · 보호 · 돌진 — 그림이 아직 없으면 fb(비슷한 진상 그림)에 색만 입혀 쓴다 ──
  snowboard: {
    id: 'snowboard', cls: 'jerk', name: '스노보드 과시남', gender: 'm', emoji: '', color: '#5ec8ff', ch7: true, fb: '/img/lb/e_cutter.webp',
    img: '/img/lb/e_snowboard.webp', hp: 110, speed: 64, atk: 8, atkInterval: 1.1, exp: 8, r: 18, size: 80,
    board: { every: [1.8, 3.0], dist: [70, 120], sec: 0.4, evade: 0.4 }, // 뒤로 타며 과시하다 갑자기 줄 바꾸기 (바꾸는 동안 40% 회피)
    shouts: ['오늘 파우더 미쳤다!', '뒤로 타는 거 봤어?', '나 시즌권 있어', '비켜~ 지나간다!'],
  },
  liftcut: {
    id: 'liftcut', cls: 'violent', name: '리프트 새치기꾼', gender: 'm', emoji: '', color: '#ffb347', ch7: true, fb: '/img/lb/e_cutter.webp',
    img: '/img/lb/e_liftcut.webp', hp: 60, speed: 56, atk: 6, atkInterval: 1.2, exp: 4, r: 15, size: 70,
    group: { min: 2, max: 3, gap: 0.22 }, // 두세 명이 한 줄로 바짝 붙어 우르르 (관통 · 줄 공격이 빛난다)
    vault: { at: 230, dist: 110, sec: 0.5 }, // 입구 앞에서 한 번 훌쩍 새치기
    shouts: ['저희 일행이에요~', '먼저 좀 탈게요', '줄 어디예요?', '한 명만 끼워 줘요'],
  },
  fakecoach: {
    id: 'fakecoach', cls: 'politic', name: '스키 강습 사칭남', gender: 'm', emoji: '', color: '#ff6b6b', ch7: true, fb: '/img/lb/e_sales.webp',
    img: '/img/lb/e_fakecoach.webp', hp: 140, speed: 32, atk: 7, atkInterval: 1.3, armor: 2, exp: 10, r: 18, size: 80,
    coach: { every: 6, first: 2.5, r: 170, n: 4, frac: 0.4 }, // "제가 알려 드릴게요~" 곁의 진상 4명 보호막(최대 체력 40%) · 보호막이 있는 동안 안 밀린다
    shouts: ['제가 알려 드릴게요~', '자세가 틀렸어요', '강습비는 나중에~', '무릎을 이렇게!'],
  },
  sledgirl: {
    id: 'sledgirl', cls: 'seduce', name: '눈썰매 폭주녀', gender: 'f', emoji: '', color: '#ff8fd0', ch7: true, fb: '/img/lb/e_clubgirl.webp',
    img: '/img/lb/e_sledgirl.webp', hp: 50, speed: 120, atk: 9, atkInterval: 1.0, exp: 4, r: 15, size: 70,
    sled: { crash: 1.6, off: 0.4, daze: 1.5 }, // 브레이크 없는 썰매 돌진 — 입구에 처음 부딪히면 1.6배 피해 (그 뒤 1.5초 어질어질) · 감속·기절에 걸리면 썰매에서 굴러떨어져 느려진다
    shouts: ['비켜요오오~!', '브레이크 없어요!', '꺄아아 썰매다!', '한 번 더 탈래!'],
  },
  hotpack: {
    id: 'hotpack', cls: 'jerk', name: '핫팩 도둑', gender: 'm', emoji: '', color: '#ff9a3c', ch7: true, fb: '/img/lb/e_mukti.webp',
    img: '/img/lb/e_hotpack.webp', hp: 120, speed: 40, atk: 7, atkInterval: 1.2, exp: 8, r: 17, size: 76,
    hotpack: { r: 80, cut: 0.35, sec: 2.5, from: 0.45, tick: 0.5 }, // 길 절반부터: 옆을 지나간 멤버의 온기를 훔친다 → 공격 속도 -35% (2.5초)
    shouts: ['어 따뜻하다~', '이거 제 핫팩인데요?', '손 좀 녹이고 갈게', '하나만 빌려 줘'],
  },
  snowball: {
    id: 'snowball', cls: 'violent', name: '눈싸움 대학생', gender: 'm', emoji: '', color: '#bfe9ff', ch7: true, fb: '/img/lb/e_yeokko.webp',
    img: '/img/lb/e_snowball.webp', hp: 80, speed: 42, atk: 5, atkInterval: 1.3, exp: 7, r: 16, size: 72, standoff: 195,
    snowball: { every: 4.0, sec: 1.5, fly: 0.75, aim: 0.8 }, // 멀찍이 서서 눈덩이 → 맞은 멤버 1.5초 꽁꽁 · 제일 잘 치는 멤버를 노린다(60%) (빙결 = 기절 · 응급처치 · 강성구 곁 · 저항으로 막는다)
    shouts: ['눈싸움 하실 분!', '받아라 눈덩이!', '과 대항전이다!', '헤드샷~!'],
  },
  mid_pension: {
    id: 'mid_pension', cls: 'politic', name: '펜션 사장님', gender: 'm', emoji: '', color: '#c9a36b', ch7: true, fb: '/img/lb/e_kkondae.webp',
    boss: true, coin: 60, // 7-5 보스 (예전엔 중간 보스 — 그림 파일 이름은 그대로 e_mid_pension*) · 7-10 에 회장과 다시
    img: '/img/lb/e_mid_pension.webp', hp: 6800, speed: 13, atk: 36, atkInterval: 1.7, armor: 5, exp: 80, r: 42, size: 146,
    quiet: { every: 10, first: 5, windup: 1.4, sec: 3, r: 230 }, // "여기 밤 10시 이후 소음 금지예요!" 넓은 범위 멤버 스킬 침묵 3초 (예고 중에 기절시키면 끊긴다)
    title: '펜션 사장님 등장!', subtitle: '"여기 밤 10시 이후 소음 금지예요!"',
    shouts: ['여기 밤 10시 이후 소음 금지예요!', '퇴실은 11시까지!', '고기는 밖에서 구워요!', '추가 인원은 만 원씩!'],
  },
  boss_resort: {
    id: 'boss_resort', cls: 'politic', name: '리조트 갑부 회장', gender: 'm', emoji: '', color: '#3a8ad8', boss: true, ch7: true, fb: '/img/lb/e_boss_sales.webp',
    img: '/img/lb/e_boss_resort.webp', hp: 7600, speed: 15, atk: 42, atkInterval: 1.8, armor: 5, exp: 90, r: 46, size: 158,
    summon: { every: 11, count: 3, types: ['snowboard'] },
    avalanche: { every: 12, first: 5, windup: 3.2, freeze: 3, door: 0.15, riders: 3, stun: 2.5, weak: 4 }, // 눈사태: 크게 예고 → 멤버 전원 3초 빙결 + 입구 최대 내구도 15% 피해 + 보드남 3명이 눈사태를 타고 내려온다. 예고 중에 스킬 · 총공지 · 알디콤을 쓰면 끊기고 회장이 비틀 (빈틈)
    title: '리조트 갑부 회장 등장!', subtitle: '"이 산 전부 내 거야!"',
    shouts: ['이 산 전부 내 거야!', 'VIP 전용 슬로프다!', '눈사태 한 번 보여 줘?', '리프트 멈춰!'],
  },
  // ── 8장 결혼식 뒤풀이 (고난도): 축의금 도둑(쫓아가 잡기) · 뷔페 회복 · 축가 공속↓ · 홀림 · 취한 무리 · 실장님 재촉 · 끝없는 축사 ──
  envthief: {
    id: 'envthief', cls: 'jerk', name: '축의금 도둑', gender: 'm', emoji: '', color: '#3a3a4a', ch8: true,
    img: '/img/lb/e_envthief.webp', hp: 66, speed: 58, atk: 0, atkInterval: 1.2, exp: 6, r: 16, size: 74,
    envelope: { run: 1.45 }, // 입구(축의금 접수대)를 안 때리고 봉투를 집어 위로 달아난다 → 화면 위로 빠지면 이번 판 코인 -8% (최대 -40%) · 잡으면 봉투 되찾음 · 묶이면(임수빈 부케) 제자리
    shouts: ['축의금 대신 받아 드릴게요~', '신랑 측이에요, 신부 측이에요?', '봉투 하나만…', '튀어!'],
  },
  buffet: {
    id: 'buffet', cls: 'violent', name: '뷔페 싹쓸이 아줌마', gender: 'f', emoji: '', color: '#8a5ac8', ch8: true,
    img: '/img/lb/e_buffet.webp', hp: 190, speed: 30, atk: 9, atkInterval: 1.4, armor: 3, exp: 11, r: 19, size: 84,
    eat: { every: 5, first: 2.5, r: 110, heal: 0.08, self: 0.05 }, // 냠냠: 5초마다 곁(110) 진상 체력 8% 회복 (자기는 6%) · 기절 중엔 못 먹는다
    spit: { name: '상한 잡채 투척', every: [10, 13], first: 4, reach: 280, kind: 'puke', st: 'poison', sec: 2.5, fly: 0.6 }, // 예고 뒤 멤버에게 상한 잡채 → 독 3초 (홍정민 해독)
    shouts: ['이거 포장되죠?', '갈비찜 아직 남았어?', '우리 애 몫까지~', '접시 하나 더!'],
  },
  badsinger: {
    id: 'badsinger', cls: 'politic', name: '축가 망치는 삼촌', gender: 'm', emoji: '', color: '#a0703a', ch8: true,
    img: '/img/lb/e_badsinger.webp', hp: 96, speed: 38, atk: 6, atkInterval: 1.3, exp: 9, r: 17, size: 78, standoff: 175,
    sing: { every: 7, first: 3, windup: 0.9, r: 130, cut: 0.35, sec: 3 }, // 마이크 들고 0.9초 숨 들이쉬고 → 음 이탈! 곁(가로 130) 멤버 공격 속도 -35% 3초 · 숨 들이쉴 때 기절시키면 끊긴다
    shouts: ['사랑~해~도~ (삑)', '한 곡 더 할게!', '앵콜 안 받아요? 받아요!', '아아 마이크 테스트'],
  },
  showoff: {
    id: 'showoff', cls: 'seduce', name: '하객룩 과시녀', gender: 'f', emoji: '', color: '#e8c050', ch8: true,
    img: '/img/lb/e_showoff.webp', hp: 80, speed: 46, atk: 6, atkInterval: 1.1, exp: 7, r: 16, size: 74, charm: 'm',
    shouts: ['신부보다 예쁘다는 말 들었어~', '셀카 한 장만!', '이 원피스 얼마게?', '오늘 주인공은 나야'],
  },
  drunkfriend: {
    id: 'drunkfriend', cls: 'jerk', name: '술 취한 신랑 친구', gender: 'm', emoji: '', color: '#3d8a4a', ch8: true,
    img: '/img/lb/e_drunkfriend.webp', hp: 58, speed: 44, atk: 7, atkInterval: 1.1, exp: 5, r: 16, size: 74, zigzag: 30, erratic: true,
    group: { min: 2, max: 3, gap: 0.3 }, // 어깨동무한 두세 명이 갈지자로 우르르
    shouts: ['신랑 나와라!', '건배~!', '내가 신랑 베프야', '2차 가자 2차!'],
  },
  mid_hallmgr: {
    id: 'mid_hallmgr', cls: 'politic', name: '예식장 실장님', gender: 'm', emoji: '', color: '#2a2a3a', ch8: true,
    boss: true, coin: 60, // 8-5 보스 (이름은 중간 보스처럼 mid_ — 7장 펜션 사장님과 같은 틀) · 8-10 에 신랑 친구 대표와 다시
    img: '/img/lb/e_mid_hallmgr.webp', hp: 6600, speed: 14, atk: 34, atkInterval: 1.6, armor: 4, exp: 80, r: 42, size: 146,
    hurry: { every: 10, first: 4, windup: 1.2, r: 260, sec: 5 }, // "시간 없어요!" 1.2초 예고 → 곁(260) 진상 5초 재촉 (이동 ×1.3 · 입구 공격 ×1.4) · 예고 중 기절시키면 끊긴다
    clip: { every: 6, stun: 1.0 }, // 입구 앞에서 클립보드 휘두르기 — 제일 가까운 멤버 1초 기절
    title: '예식장 실장님 등장!', subtitle: '"시간 없어요! 다음 예식 들어와요!"',
    shouts: ['시간 없어요!', '다음 예식 들어와요!', '빨리빨리 빼 주세요~', '여기 사진 찍으시면 안 돼요!'],
  },
  boss_bestman: {
    id: 'boss_bestman', cls: 'jerk', name: '신랑 친구 대표', gender: 'm', emoji: '', color: '#d8b040', boss: true, ch8: true,
    img: '/img/lb/e_boss_bestman.webp', hp: 7400, speed: 15, atk: 40, atkInterval: 1.8, armor: 5, exp: 90, r: 46, size: 158,
    summon: { every: 12, count: 3, types: ['drunkfriend'] },
    speech: { every: 13, first: 5, sec: 9, need: 24, skillHit: 5, r: 280, buff: 0.03, stun: 2.5, weak: 4, door: 0.12, drowse: 4, drowseCut: 0.35 }, // 끝없는 축사: 하는 동안 무적(금빛 테두리) · 곁(280) 진상 재촉 + 초당 체력 3% 회복 · 축사 게이지 24 (한 대 1 · 스킬 5) 를 채우거나 기절 · 총공지로 끊으면 2.5초 기절 + 빈틈 · 9초를 다 하면 입구 12% 피해 + 멤버 4초 졸음(공속 -35%)
    title: '신랑 친구 대표 등장!', subtitle: '"에… 신랑과 저는 초등학교 때부터…"',
    shouts: ['에… 마지막으로 한 말씀만…', '신랑과 저는 초등학교 때부터…', '두루마리 2장 째입니다', '울지 마 신랑아!'],
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
  // 7장 스키장
  mid_snowboard: { base: 'snowboard', name: '각성 보드남', hpX: 9 },
  mid_sledgirl: { base: 'sledgirl', name: '각성 썰매 폭주녀', hpX: 15 },
  fuse_lift: { fuse: ['liftcut', 'snowboard'], name: '리프트 무법자', hpX: 6 },
  fuse_coach: { fuse: ['fakecoach', 'hotpack'], name: '사칭 강사단', hpX: 5 },
  fuse_snowfight: { fuse: ['snowball', 'liftcut'], name: '눈싸움 원정대', hpX: 7 },
  // 8장 결혼식 뒤풀이
  mid_envthief: { base: 'envthief', name: '각성 축의금 도둑', hpX: 11 },
  mid_buffet: { base: 'buffet', name: '각성 뷔페 아줌마', hpX: 5 },
  mid_drunkfriend: { base: 'drunkfriend', name: '각성 취한 친구', hpX: 10 },
  fuse_toast: { fuse: ['drunkfriend', 'badsinger'], name: '건배사 삼촌들', hpX: 6 },
  fuse_selfie8: { fuse: ['showoff', 'envthief'], name: '인증샷 도둑단', hpX: 6 },
};
// 합체 중간 보스 한 장 그림 (둘이 한 몸) — e_<id>.webp (전투) · dex/<id>.webp (도감). 그림이 오면 여기에 추가
// 진상 프레임 애니메이션 (선택): 가로 띠 그림 · 칸은 정사각형 (frames 를 안 적으면 너비 ÷ 높이) — 그림이 없으면 코드 움직임 그대로
//   walk: 걸을 때 반복 · die: 쓰러질 때 한 번 (쓰러짐 연출이 들어가면 사용)
export const BOSS_RAGE_ATK = ['boss_thug', 'boss_gapjil', 'boss_inpi', 'boss_loan', 'boss_kkondol', 'boss_queenmom', 'boss_sales', 'boss_otaku', 'boss_jusa', 'boss_soloparty', 'boss_union']; // 분노 공격 띠가 있는 보스 (그림이 준비된 것만)
export const ENEMY_ANIM = {
  drunk: { walk: { src: '/img/lb/e_drunk_walk.webp', frames: 12, fps: 10 }, die: { src: '/img/lb/e_drunk_die.webp', frames: 8, fps: 14, hold: 0.15 } },
  boss_gapjil: { walk: { src: '/img/lb/e_boss_gapjil_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_gapjil_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_thug: { walk: { src: '/img/lb/e_boss_thug_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_thug_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_loan: { walk: { src: '/img/lb/e_boss_loan_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_loan_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_inpi: { walk: { src: '/img/lb/e_boss_inpi_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_inpi_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_queenmom: { walk: { src: '/img/lb/e_boss_queenmom_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_queenmom_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_sales: { walk: { src: '/img/lb/e_boss_sales_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_sales_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  envthief: { run: { src: '/img/lb/e_envthief_run.webp', frames: 12, fps: 14 } }, // 8장 축의금 도둑: 봉투 들고 위로 달아나는 뒷모습 (걷기 · 쓰러짐은 서버 목록으로)
  vomit: { puke: { src: '/img/lb/e_vomit_puke.webp', frames: 8, release: 3, lead: 0.45, fps: 9 } }, // 토하는 인간 "우웩!": 0~2 숙이고 꿀렁(토 직전) · 3~5 쏟기 · 6~7 입 닦기
};
// (10/08) 보스 입구 공격 띠 (8칸 · 3번 칸에 때림) — 그림이 없던 보스 11명 · rattack = 분노(2페이즈) 때 공격 띠 (분노 그림 대신)
for (const id of ['boss_thug', 'boss_gapjil', 'boss_inpi', 'boss_loan', 'boss_kkondol', 'boss_queenmom', 'boss_sales', 'boss_otaku', 'boss_jusa', 'boss_soloparty', 'boss_union']) {
  const cur = ENEMY_ANIM[id] || (ENEMY_ANIM[id] = {});
  cur.attack = { src: `/img/lb/e_${id}_attack.webp`, frames: 8, release: 3 };
  if (BOSS_RAGE_ATK.includes(id)) cur.rattack = { src: `/img/lb/e_${id}_rage_attack.webp`, frames: 8, release: 3 };
}
// 입구 공격 동작 (진상마다 컨셉대로): 준비(뒤로 젖힘) → 때림(입구 쪽으로 · 불꽃) → 반동
//   punch 주먹 · kick 발차기 · headbutt 박치기 · shove 밀치기 · phone 폰 내리치기 · bottle 병 내리치기 · bag 가방 휘두르기 · slap 따귀
export const ENEMY_ATK = {
  yeokko: 'slap', namkko: 'shove', drunk: 'bottle', thug: 'punch', mukti: 'shove', queen: 'bag', boss_thug: 'punch', vomit: 'headbutt', couple: 'shove',
  earphone: 'phone', noshow: 'phone', clubguy: 'kick', clubgirl: 'bag', praise1: 'slap', praise2: 'slap', handsy: 'slap', gao: 'kick', selfie: 'phone',
  cutter: 'shove', kkondae: 'punch', spam: 'phone', inpi_gossip: 'slap', inpi_dictator: 'punch', inpi_clique: 'kick', scammer: 'phone', boss_gapjil: 'kick',
  boss_inpi: 'punch', boss_loan: 'punch', inpi_treasurer: 'bag', fakesingle: 'shove', secretmom: 'bag', carpoor: 'kick', sales: 'bag', sarcasm: 'slap',
  jjijil: 'headbutt', otaku: 'bag', drunk_cry: 'headbutt', drunk_run: 'kick', drunk_sleep: 'shove', drunk_home: 'bottle', kkondae2: 'bag',
  boss_kkondol: 'punch', boss_queenmom: 'bag', boss_sales: 'bag', boss_otaku: 'headbutt', boss_jusa: 'bottle', boss_soloparty: 'kick', boss_union: 'punch',
};
// 동작 모양: back = 준비 때 뒤로 (px) · rot = 준비 기울기 → hit 때 반대로 · lunge = 입구 쪽으로 (px) · sq = 찌그러짐
export const ATK_MOVES = {
  punch: { back: 6, rot: -0.08, hitRot: 0.1, lunge: 11, sq: 0.08 },
  kick: { back: 4, rot: -0.22, hitRot: 0.3, lunge: 8, sq: 0.04 },
  headbutt: { back: 9, rot: -0.28, hitRot: 0.38, lunge: 15, sq: 0.1 },
  shove: { back: 5, rot: -0.04, hitRot: 0.04, lunge: 10, sq: -0.1 },
  phone: { back: 10, rot: -0.1, hitRot: 0.14, lunge: 6, sq: 0.12 },
  bottle: { back: 10, rot: -0.14, hitRot: 0.2, lunge: 7, sq: 0.12 },
  bag: { back: 4, rot: -0.34, hitRot: 0.34, lunge: 6, sq: 0.03 },
  slap: { back: 3, rot: -0.18, hitRot: 0.24, lunge: 7, sq: 0.03 },
};
export const FUSE_ART = new Set(['fuse_kko', 'fuse_puke', 'fuse_gossip', 'fuse_spam', 'fuse_inpi', 'fuse_lease', 'fuse_lie', 'fuse_jusa', 'fuse_sleep', 'fuse_karaoke', 'fuse_mt', 'fuse_adspam', 'fuse_taxi', 'fuse_latte']);
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
  'mid_snowboard', 'fuse_lift', 'fuse_snowfight', 'mid_sledgirl', 'mid_snowboard', 'fuse_coach', 'fuse_snowfight', 'mid_sledgirl', 'fuse_coach', 'mid_sledgirl', // 7장 (펜션 사장님은 7-5 보스로 승격 — 중간 보스로는 안 나온다)
  'mid_drunkfriend', 'mid_envthief', 'mid_buffet', 'fuse_toast', 'mid_envthief', 'fuse_selfie8', 'mid_buffet', 'fuse_toast', 'mid_envthief', 'fuse_selfie8', // 8장
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
  jackpot: { name: '대박', weight: 0.45, color: '#ffe066' }, // (10/08) 드물게 뜨는 대박 카드 — 반짝인다
};
// 전역 강화 카드 (영웅 합류/레벨업 카드는 sim.js 가 자동으로 만든다)
export const CARDS = [
  { id: 'dmg', icon: '💪', title: '회식 버프', desc: '모든 멤버 공격력 +27%', rarity: 'common', max: 6 },
  { id: 'spd', icon: '⚡', title: '카페인 충전', desc: '모든 멤버 공격 속도 +20%', rarity: 'common', max: 5 },
  { id: 'gunExtra', icon: '🔫', title: '건전남 연발 +1', desc: '건전남 한 번에 +1발', rarity: 'rare', max: 2, needs: 'gunman' },
  { id: 'crit', icon: '🎯', title: '정곡 찌르기', desc: '치명타 확률 +13% (피해 2배)', rarity: 'rare', max: 4 },
  { id: 'hp', icon: '🏗️', title: '방어선 보강', desc: '랑방 최대 내구도 +35% · 50% 회복 · 받는 피해 −15%', rarity: 'common', max: 5 },
  { id: 'exp', icon: '🍹', title: '인싸력 상승', desc: '경험치 획득 +35%', rarity: 'common', max: 3 },
  { id: 'slow', icon: '🚧', title: '새치기 금지', desc: '모든 진상 이동 속도 -13%', rarity: 'common', max: 3 },
  { id: 'pierce', icon: '🗡️', title: '관통 공지', desc: '모든 투사체 관통 +1', rarity: 'legend', max: 2 },
  { id: 'boss', icon: '🍻', title: '랑방 단골의 힘', desc: '공격력 +40% · 공격 속도 +20%', rarity: 'legend', max: 2 }, // (10/09 50/25 → 40/20: 카드가 커진 뒤 무작위로 골라도 이 카드만 있으면 클리어 +29%p)
  { id: 'regen', icon: '🛠️', title: '건물주 인맥', desc: '랑방이 초당 내구도 2.5 자동 회복', rarity: 'legend', max: 2 },
  { id: 'ult', icon: '📣', title: '총공지 확성기', desc: '궁극기 충전 +80% · 피해 +60%', rarity: 'rare', max: 2 },
  { id: 'charmRes', icon: '🛡️', title: '연애 금지 서약', desc: '홀림 시간 -60%', rarity: 'rare', max: 1 },
  { id: 'debuffRes', icon: '🧘', title: '멘탈 관리', desc: '멤버 상태이상 시간 −40% · 홀림 −50%', rarity: 'rare', max: 2 },
  { id: 'cdCut', icon: '⏱️', title: '스킬 연습', desc: '모든 스킬 쿨타임 −25%', rarity: 'rare', max: 2 },
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
  { id: 'tag_splash', icon: '💥', title: '폭발 증폭', desc: '폭발 범위 +35% · 폭발 멤버 공격력 +34% · 일반 진상 +20%', rarity: 'rare', max: 2, tag: 'splash' }, // (10/09 범위 45 → 35: 무작위로 골라도 이 카드면 클리어 +28%p)
  { id: 'tag_chain', icon: '⚡', title: '연쇄 반응', desc: '연쇄 멤버 튕김 +1 · 공격력 +34%', rarity: 'rare', max: 2, tag: 'chain' },
  { id: 'tag_kb', icon: '💨', title: '밀어내기 달인', desc: '넉백 +60% · 넉백 멤버 공격력 +34%', rarity: 'common', max: 2, tag: 'kb' },
  { id: 'tag_heal', icon: '💚', title: '회복 강화', desc: '모든 회복 +80% · 회복 멤버 공격력 +25%', rarity: 'common', max: 2, tag: 'heal' },
  { id: 'tag_ctrl', icon: '🌀', title: '제어 연장', desc: '감속·기절 +50% · 제어 멤버 공격력 +25% · 진상 이동 −10%', rarity: 'common', max: 2, tag: 'ctrl' },
  { id: 'tag_boss', icon: '🎯', title: '보스 사냥꾼', desc: '보스·중간 보스에게 피해 +65%', rarity: 'rare', max: 2, tag: 'boss' },
  { id: 'swarm', icon: '🌪️', title: '청소부', desc: '일반 진상에게 피해 +38%', rarity: 'common', max: 2 },
  { id: 'risk_allin', icon: '🎲', title: '올인!', desc: '입구 최대 내구도 -20% · 모든 공격력 +45%', rarity: 'rare', max: 1, risk: true }, // (10/09 55 → 45)
  { id: 'risk_overtime', icon: '🌙', title: '야근 모드', desc: '진상 체력 +15% · 경험치 +35%', rarity: 'common', max: 1, risk: true }, // (10/09 80 → 35: 큰 카드 배율까지 붙으면 경험치 +130% — 카드를 두 배로 고르게 돼서)
  { id: 'risk_glass', icon: '🍷', title: '유리 대포', desc: '치명타 피해 +120% · 입구 회복 -50%', rarity: 'rare', max: 1, risk: true },
  { id: 'econ_bonus', icon: '🎁', title: '보너스 카드', desc: '지금 바로 카드 한 번 더 고르기', rarity: 'common', max: 2 },
);
// (10/08 고르는 맛) 맞바꾸는 카드 · 판을 바꾸는 카드 · 대박 카드 — 일반 스테이지 · 헬 (긴장감 판) 에만
//  얻는 만큼 잃는 게 있어서 덱 · 상황에 따라 답이 다르다 (밋밋한 +% 카드는 이 판에선 덜 뜬다)
CARDS.push(
  { id: 'tr_heavy', icon: '🔨', title: '묵직한 한 방', desc: '공격력 +45% · 공격 속도 −20%', rarity: 'rare', max: 1, tension: true },
  { id: 'tr_rapid', icon: '🌀', title: '속사', desc: '공격 속도 +40% · 공격력 −15%', rarity: 'rare', max: 1, tension: true },
  { id: 'tr_skill', icon: '✨', title: '스킬 몰빵', desc: '스킬 피해 +50% · 스킬 쿨 −20% · 평타 −12%', rarity: 'rare', max: 1, tension: true }, // (10/09 평타 −20 → −12%: 고르면 클리어가 크게 떨어지는 함정 카드였다)
  { id: 'tr_wall', icon: '🧱', title: '농성전', desc: '입구 받는 피해 −35% · 웨이브 사이 수리 2배 · 공격력 −12%', rarity: 'rare', max: 1, tension: true },
  { id: 'tr_hunt', icon: '🪤', title: '사냥 본능', desc: '묶인 진상(기절·빙결·느려짐)에게 피해 +50%', rarity: 'rare', max: 1, tension: true },
  { id: 'tr_boom', icon: '💣', title: '연쇄 퇴장', desc: '진상을 잡으면 그 자리에서 펑 (그 진상 체력의 30%)', rarity: 'rare', max: 1, tension: true },
  { id: 'jp_party', icon: '🎉', title: '대박! 전원 회식', desc: '모든 멤버 레벨 +1 · 입구 20% 회복', rarity: 'jackpot', max: 1, tension: true },
  { id: 'jp_power', icon: '💎', title: '대박! 각성', desc: '공격력 +60% · 공격 속도 +20%', rarity: 'jackpot', max: 1, tension: true },
  { id: 'jp_mom', icon: '🔥', title: '대박! 기세 폭발', desc: '기세 가득 · 모든 스킬 쿨 초기화 · 스킬 피해 +30%', rarity: 'jackpot', max: 1, tension: true },
);
// 건너뛰기 (긴장감 판): 카드를 안 고르면 대신 입구 skipHeal 회복 · 기세 skipMom
export const PICK_SKIP = { heal: 0.05, mom: 50 };
// 멤버 전용 카드 (덱에 있는 멤버만): 그 멤버 기술에 맞춘 강화 + 공격력 +20%. 멤버마다 2번까지
export const HERO_CARDS = {
  bangjang: { title: '방장: 공지 오라 +8% · 지목 피해 +5%p', add: { aura: 0.08, order: 0.05 } },
  staff: { title: '운영진: 경고 2번이면 강퇴', add: { warnN: 1 } },
  gunman: { title: '건전남: 관통 +1 · 사거리 +15%', add: { pierce: 1 }, mul: { range: 1.15 } },
  gunnyeo: { title: '건전녀: 하트 폭탄 범위 +35% · 간호 40% 더 자주', mul: { splash: 1.35, care: 1.4 } },
  myunghoon: { title: '서명훈: 욕 튕김 +1 · 기절 +20%', add: { bounce: 1 }, mul: { ctrl: 1.2 } },
  dohoon: { title: '김도훈: 음파 반경 +30%', mul: { range: 1.3 } },
  ingyu: { title: '백인규: 오토바이 덤벨 1번 빨리 · 밀치기 +30%', add: { moto: 1 }, mul: { motoKb: 1.3 } },
  donghan: { title: '문동한: 빔 두께 +40%', mul: { beam: 1.4 } },
  youngjun: { title: '김영준: 돌격 +1초 · 블랙 러시 +2명', add: { out: 1, rush: 2 } },
  eunok: { title: '최은옥: 분노 +4초', add: { rage: 4 } },
  hanna: { title: '이한나: 레이저 세지는 속도 +50%', mul: { ramp: 1.5 } },
  sunggu: { title: '강성구: 지팡이 +1개', add: { cane: 1 } },
  junseo: { title: '윤준서: 여사친 튕김 +1', add: { bounce: 1 } },
  hyungyeong: { title: '배현경: 날씬 모드 +3초', add: { diet: 3 } },
  ara: { title: '고아라: 공주로 +5초 더', add: { young: 5 } },
  hochan: { title: '이호찬: 랑방 버프 최대 +12%', add: { buff: 0.12 } },
  soyoung: { title: '정소영: 성준영 체력 +30%', add: { nag: 0.3 } },
  jieun: { title: '오지은: 감속 +15%p · 1초 더', add: { slowX: 0.15, slowSec: 1 } },
  sanghwa: { title: '박상화: 성장 한도 +15%', add: { growMax: 0.15 } },
  jungmin: { title: '홍정민: 수리 +40%', mul: { heal: 1.4 } },
  jiwon: { title: '여지원: 방깎 +1겹 · 5초 → 7초', add: { shredMax: 1, shredSec: 2 } },
  wonsik: { title: '정원식: 피해 감소 +10%p · 반경 +25%', add: { guardCut: 0.1 }, mul: { guardR: 1.25 } },
  subin: { title: '임수빈: 감는 시간 +0.5초', add: { tieSec: 0.5 } },
  dragon: { title: `${DRAGON_NAME}: 불길 +2명 · 범위 +25%`, add: { bounce: 2 }, mul: { range: 1.25 } },
};
// 스킬 진화 카드 (Lv3 이상 멤버 · 한 번): 스킬이 한 번 더 터진다 (0.5초 뒤, 옆자리에)
export const SKILL_EVO = {
  bangjang: '집합! 두 번 외치기', staff: '레드카드 2장 발사', gunman: '퀵드로우 연장전', gunnyeo: '응급처치 + 하트 폭탄 3연발', myunghoon: '쌍욕 폭격 2회 연속',
  dohoon: '무한 앵콜 앵콜', ingyu: '할리 한 바퀴 더', donghan: '캔커피 4발 더 (리필)', youngjun: '블랙 러시 왕복', eunok: '원샷 두 잔',
  hanna: '하트 레이저 풀파워 (화면 끝까지 꿰뚫는 굵은 빔)', sunggu: '지팡이 블랙홀 두 개', junseo: '소개팅 2차', hyungyeong: '다이어트 주사 + 충격파', ara: '공주의 일격 2연타', hochan: '랑방을 위하여!! 앵콜',
  soyoung: '올인 콜 앵콜 (올인 모드 한 번 더)', jieun: '시간 정지 두 번', sanghwa: '끝내주는남자 박상화!!', jungmin: '붕대 대공사 한 번 더', jiwon: '모자이크 폭격 앵콜', wonsik: '결혼정보회사 VIP 등록', subin: '부케 토스 2차 (한 번 더)',
};
// 숨은 카드 (드물게): 임시 증원 · 게스트 합류 — 한 판에 한 번
export const SECRET = { tempSlot: 0.045, guest: 0.035 };
// 멤버 특성 (시너지 카드가 이걸 보고 붙는다)
export const TAGS = {
  pierce: { id: 'pierce', name: '관통', icon: '🗡️' }, splash: { id: 'splash', name: '폭발', icon: '💥' }, chain: { id: 'chain', name: '연쇄', icon: '⚡' },
  kb: { id: 'kb', name: '넉백', icon: '💨' }, heal: { id: 'heal', name: '회복', icon: '💚' }, ctrl: { id: 'ctrl', name: '제어', icon: '🌀' }, boss: { id: 'boss', name: '보스킬', icon: '🎯' },
};
export const HERO_TAGS = { jeongseob: ['ctrl'], subin: ['ctrl'], dragon: ['splash'],
  bangjang: ['boss', 'ctrl'], staff: ['ctrl'], gunman: ['pierce', 'boss'], gunnyeo: ['splash', 'heal'], myunghoon: ['chain', 'ctrl'], dohoon: ['heal', 'ctrl'],
  ingyu: ['splash', 'kb'], donghan: ['pierce', 'splash'], youngjun: ['boss'], eunok: ['splash'], hanna: ['kb', 'boss'], sunggu: ['pierce'],
  junseo: ['chain', 'kb'], hyungyeong: ['splash', 'kb'], ara: ['boss', 'splash'], hochan: ['pierce', 'ctrl'],
  soyoung: ['splash', 'ctrl'], jieun: ['ctrl'], sanghwa: ['boss'], jungmin: ['heal'],
};
// 같은 속성 멤버 n명 → 그 멤버들 공격력 + (TFT 처럼)
export const ATTR_SET = [0, 0, 0.12, 0.22, 0.34, 0.44, 0.52];
// 진화: Lv5 + 짝 특성 카드를 가지고 있으면 "진화" 카드가 나온다 (공격력 ×1.45 · 공격 속도 +18% · 스킬 쿨 -30%)
export const EVO = {
  bangjang: { tag: 'kb', name: '황금 확성기' }, staff: { tag: 'ctrl', name: '운영 총괄' }, gunman: { tag: 'pierce', name: '황금 리볼버' }, gunnyeo: { tag: 'heal', name: '천사 간호사' },
  myunghoon: { tag: 'chain', name: '구미호 욕신' }, dohoon: { tag: 'heal', name: '전국 투어' }, ingyu: { tag: 'kb', name: '3대 700' }, donghan: { tag: 'splash', name: '각성한 간보기' },
  youngjun: { tag: 'boss', name: '한밤의 블랙캣' }, eunok: { tag: 'splash', name: '폭탄주 여왕' }, hanna: { tag: 'kb', name: '윙크 여신' }, sunggu: { tag: 'pierce', name: '지팡이 달인' },
  junseo: { tag: 'chain', name: '인맥왕' }, hyungyeong: { tag: 'kb', name: '다이어트 챔피언' }, ara: { tag: 'boss', name: '여왕 폐하' }, hochan: { tag: 'ctrl', name: '랑방의 전설' },
  soyoung: { tag: 'ctrl', name: '잔소리 대마왕' }, jieun: { tag: 'ctrl', name: '시간의 마녀' }, sanghwa: { tag: 'boss', name: '완벽한남자' }, jungmin: { tag: 'heal', name: '붕대 장인' }, jiwon: { tag: 'boss', name: '모자이크 여왕' }, wonsik: { tag: 'heal', name: '품절남' }, subin: { tag: 'ctrl', name: '부케의 여신' },
};
export const EVO_MUL = { dmg: 1.45, spd: 0.18, cd: 0.7 };
// 뽑을 게 모자랄 때 채워 넣는 카드 (제한 없음)
// 카드 정리 (−34%): 약하거나 거의 안 고르는 카드는 빼고, 비슷한 건 합쳤다 (예전 저장은 그대로 읽힘)
//   연애 금지 서약 → 멘탈 관리 · 모래주머니 → 방어선 보강 · 새치기 금지 → 제어 연장 · 청소부 → 폭발 증폭 · 상성 공략 · 인싸력 상승 · 유리 대포 · 건물주 인맥 뺌 · 속성 결속 4장 → 가장 많은 속성 한 장
export const CARD_CUT = ['charmRes', 'armor', 'slow', 'swarm', 'attrUp', 'exp', 'risk_glass', 'regen'];
export const AUG_CUT = ['a_xp', 'a_prism_path']; // 증강 정리
export const FILLER_CARDS = [
  { id: 'fillUlt', icon: '📣', title: '확성기 예열', desc: '총공지 게이지 +40', rarity: 'common' },
  { id: 'fillHeal', icon: '💊', title: '방어선 수리', desc: '랑방 내구도 50% 회복', rarity: 'common' },
];

// ─── 장비 (서버 langbang-rules.js 와 같은 공식 — 테스트가 검사) ─────────
// 무기(w) · 액세서리(a) 한 칸씩. 드롭은 서버가 (스테이지 · 별 · 퍼펙트 · 시드)로 계산한다.
export const GEAR_RARITY = {
  common: { id: 'common', name: '일반', mul: 1, color: '#9fb3c8' },
  rare: { id: 'rare', name: '희귀', mul: 1.7, stat: 2, color: '#4ea8ff' },
  epic: { id: 'epic', name: '영웅', mul: 2.6, stat: 3.4, color: '#c77dff' },
  legend: { id: 'legend', name: '전설', mul: 4, stat: 5.5, color: '#ffb400' },
  myth: { id: 'myth', name: '신화', mul: 6, stat: 8, color: '#ff7ad9' }, // 드롭·합성 등급 목록(GEAR_RARITIES)에는 없음
};
export const GEAR_RARITIES = ['common', 'rare', 'epic', 'legend'];
export const GEAR_STATS = {
  atk: { name: '공격력', pct: true }, spd: { name: '기본 공격 속도', pct: true }, crit: { name: '치명타', pct: true },
  skill: { name: '스킬 피해', pct: true }, cd: { name: '스킬 쿨타임 감소', pct: true }, attr: { name: '상성 피해', pct: true },
  strip: { name: '버프 벗기기 확률', pct: true }, hp: { name: '입구 내구도', pct: true },
  range: { name: '사거리 (최대 +35%)', pct: true },
  res: { name: '상태이상 시간 감소', pct: true },
  regen: { name: '입구 초당 회복', pct: true }, coin: { name: '코인 획득', pct: true }, ult: { name: '총공지 충전 (팀 합 최대 +100%)', pct: true },
  boss: { name: '보스·중간 보스 피해', pct: true }, swarm: { name: '졸개 피해', pct: true }, critDmg: { name: '치명타 피해', pct: true },
  exp: { name: '경험치 (팀 합 최대 +40%)', pct: true }, exec: { name: '체력 30% 이하 진상 피해', pct: true }, guard: { name: '입구 받는 피해 감소 (팀 합 최대 30%)', pct: true },
};
// 팀 전체에 걸리는 장비 능력치는 멤버들 것을 더하되 상한이 있다 (sim createGame)
export const GEAR_TEAM_CAP = { exp: 0.4, guard: 0.3, ult: 1 };
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
  // ─── 새 장비 7종 (모임 · 밤문화 소품) — 새 능력치: 보스 · 졸개 · 치명타 피해 · 경험치 · 마무리 · 입구 보호 ───
  gymcard: { id: 'gymcard', slot: 'a', icon: '', name: '헬스장 1년 회원권', stat: 'boss', base: 0.07 },
  speaker: { id: 'speaker', slot: 'w', icon: '', name: '클럽 우퍼 스피커', stat: 'swarm', base: 0.07 },
  goldchain: { id: 'goldchain', slot: 'a', icon: '', name: '18K 금목걸이', stat: 'critDmg', base: 0.1, ch: 2 },
  rolex: { id: 'rolex', slot: 'a', icon: '', name: '명품 시계', stat: 'ult', base: 0.015, ch: 3 },
  corpcard: { id: 'corpcard', slot: 'w', icon: '', name: '법인카드', stat: 'exp', base: 0.012, ch: 3 },
  lastorder: { id: 'lastorder', slot: 'w', icon: '', name: '라스트오더 종', stat: 'exec', base: 0.12, ch: 4 },
  radio: { id: 'radio', slot: 'a', icon: '', name: '경호원 무전기', stat: 'guard', base: 0.012, ch: 5 },
};
// 그림이 아직 없는 장비: 비슷한 그림으로 대신 보여 준다 (public/img/lb/gear/<id>.webp 가 생기면 여기서 지우기)
export const GEAR_ART_TODO = {};
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
  gymcard: ['1년 치 끊어 놓고 세 번 갔다. 그래도 큰 놈 앞에선 힘이 난다.', ['ara', 'gunman']],
  speaker: ['쿵쿵 울리는 우퍼. 떼로 몰려온 졸개들이 귀를 막는다.', ['bangjang', 'eunok']],
  goldchain: ['목에 건 18K. 한 번 번쩍이면 치명타가 더 아프다.', ['gunman', 'junseo']],
  rolex: ['"이거 얼마짜리게?" 시간 맞춰 총공지가 빨리 찬다. 팀 전체 (합 최대 +100%).', ['bangjang', 'hochan']],
  corpcard: ['"오늘은 회사가 쏜다!" 다 같이 경험치를 더 받는다. 팀 전체 (합 최대 +40%).', ['dohoon', 'sanghwa']],
  lastorder: ['"라스트오더 받습니다~" 다 쓰러져 가는 진상을 마무리.', ['youngjun', 'hanna']],
  radio: ['"입구 지원 바랍니다." 입구가 덜 아프다. 팀 전체 (합 최대 30%).', ['wonsik', 'jungmin']],
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
  boss: ['보스 피해', '보스 · 중간 보스에게 주는 피해만 세진다'],
  swarm: ['졸개 피해', '보스 · 중간 보스 · 정예가 아닌 보통 진상에게 주는 피해가 세진다'],
  critDmg: ['치명타 피해', '치명타가 터졌을 때 더 아프다 (기본 2배에 더해짐)'],
  ult: ['총공지 충전', '총공지 게이지가 더 빨리 찬다 (팀 전체 · 합 최대 +100%)'],
  exp: ['경험치', '레벨업 카드가 더 자주 뜬다 (팀 전체 · 합 최대 +40%)'],
  exec: ['마무리', '체력이 30% 이하로 남은 진상에게 피해가 세진다'],
  guard: ['입구 보호', '입구가 받는 피해가 줄어든다 (팀 전체 · 합 최대 30%)'],
};
// 신화 (전설 위): 어느 멤버에게나 좋은 만능 장비 6종 · 멤버마다 신화 칸(m) 하나 · 강화·합성 없음 (처음부터 완성)
//   드롭: 무한 50웨이브(주마다) · 시즌 마지막 단계 · 모집 0.3% · 장비 뽑기 1% (레이드 1위는 하루 3번이라 전설로)
export const MYTH = {
  myth_card: { name: '황금 멤버십 카드', stats: { atk: 0.1, spd: 0.1, skill: 0.1, hp: 0.1 }, desc: '모든 능력치 +10%' },
  myth_seal: { name: '방장의 인장', stats: { cd: 0.15 }, desc: '스킬 쿨타임 −15%' },
  myth_soup: { name: '전설의 해장국', stats: { res: 0.4, regen: 0.02 }, desc: '상태이상 시간 −40% · 입구 초당 2% 회복' },
  myth_stick: { name: '무지개 응원봉', stats: { spd: 0.15 }, desc: '공격 속도 +15%' },
  myth_lotto: { name: '1등 복권', stats: { crit: 0.12, coin: 0.2 }, desc: '치명타 +12% · 코인 +20%' },
  myth_crown: { name: '랑방 VIP 왕관', stats: { ult: 0.25 }, desc: '총공지(궁극기) 충전 +25%' },
};
export const MYTH_IDS = Object.keys(MYTH);
for (const [id, m] of Object.entries(MYTH)) { const k = Object.keys(m.stats)[0]; GEAR[id] = { id, slot: 'm', icon: '🌈', name: m.name, stat: k, base: m.stats[k], stats: m.stats, myth: true, desc: m.desc }; }
// ─── 전용 신화 (신화 위 · 멤버마다 1개): 그 멤버만 낄 수 있다 · 신화 칸(m) · 강화·합성 없음 ───
//   능력치는 만능 신화 정도 + "플레이가 바뀌는" 새 효과 (fx · sim.js 가 멤버별로 읽는다)
//   1:1 대전에서는 새 효과가 꺼지고 능력치만 (영웅 비율로) 남는다
//   드롭 (서버 live.js 가 굴림): 장비 뽑기 1회 0.1% · 모집 1회 0.05% · 신화 조각 600개 = 원하는 멤버 것 1개 (조각: 뽑기 1회마다 1개)
export const SIG = {
  bangjang: { name: '초대 방장의 황금 확성기', stats: { spd: 0.1, cd: 0.1 }, fx: { rallyCd: 0.5 }, desc: '"집합!"을 외치면 다른 멤버들 남은 스킬 쿨타임이 절반으로 줄어든다' },
  staff: { name: '영구 정지 도장', stats: { cd: 0.12, strip: 0.1 }, fx: { warnN: 2, kickStun: 2 }, desc: '경고 2번이면 바로 강퇴 · 강퇴 기절 2배' },
  gunman: { name: '쌍열 새총', stats: { atk: 0.12, crit: 0.06 }, fx: { multi: 1, multiK: 0.8 }, desc: '쏠 때마다 다른 진상에게 한 발 더 (쌍권총 · 80% 세기)' },
  gunnyeo: { name: '수호천사 구급상자', stats: { hp: 0.12, res: 0.2 }, fx: { careMul: 1.5, cheerN: 3 }, desc: '간호가 1.5배 자주 · 아픈 멤버가 없을 땐 「힘내요!」를 제일 잘 싸우는 멤버 3명에게 한꺼번에 (공격 속도 +30%)' },
  myunghoon: { name: '욕 사전 무삭제판', stats: { atk: 0.1, skill: 0.15 }, fx: { curseN: 10, root: 3 }, desc: '실눈 저격 벼락이 5발 → 10발, 얼리는 시간 3초' },
  dohoon: { name: '앵콜 전용 골든 마이크', stats: { cd: 0.12, hp: 0.1 }, fx: { echo: 3 }, desc: '무한 앵콜이 3초 뒤 한 번 더 터진다 (춤추느라 멈춤 · 상태이상 해제 · 공격 버프 모두 다시)' },
  ingyu: { name: '할리 사이드카 세트', stats: { atk: 0.1, hp: 0.1 }, fx: { twinHarley: 1, moto: 2 }, desc: '할리가 두 대 (반대 대각선으로 한 대 더) · 오토바이 돌진 게이지가 2배로 찬다' },
  donghan: { name: '꿀잠 바디필로우', stats: { skill: 0.15, atk: 0.08 }, fx: { refill: 50 }, desc: '빔을 쏘고 나면 간보기 게이지 절반이 바로 다시 찬다 (빔이 거의 두 배로 자주)' },
  youngjun: { name: '블랙 러시 운동화', stats: { atk: 0.12, spd: 0.08 }, fx: { rushN: 3, rushTwice: 0.7 }, desc: '블랙 러시가 3명 더 돌파하고, 돌아오면서 한 번 더 벤다 (두 번째 70%)' },
  eunok: { name: '무한 리필 소주 박스', stats: { atk: 0.12, attr: 0.1 }, fx: { rageMul: 2, multi: 1, multiK: 0.8, rageOnly: 1 }, desc: '분노 모드가 2배 오래 · 분노 중엔 소주병을 두 병씩 던진다' },
  hanna: { name: '쌍 하트 렌즈', stats: { atk: 0.12, range: 0.08 }, fx: { beam2: 1 }, desc: '하트 레이저가 처음부터 두 갈래 — 두 번째 갈래도 100% 세기로 같이 세진다' },
  sunggu: { name: '쌍지팡이', stats: { skill: 0.15, cd: 0.08 }, fx: { echo: 1.2 }, desc: '블랙홀을 꽂고 1.2초 뒤, 그때 가장 몰린 곳에 블랙홀 하나 더' },
  junseo: { name: '여사친 단톡방 초대권', stats: { atk: 0.1, spd: 0.08 }, fx: { gfN: 1 }, desc: '여사친이 늘 한 명 더 나간다 (다른 진상에게)' },
  hyungyeong: { name: '요요 없는 다이어트 주사', stats: { atk: 0.1, spd: 0.1 }, fx: { dietMul: 2, mark: 0.25 }, desc: '날씬 모드가 2배 오래 · 표시한 진상이 받는 피해 +25% → +50%' },
  ara: { name: '영원한 공주 티아라', stats: { boss: 0.15, atk: 0.08 }, fx: { ageless: 1, echo: 0.8 }, desc: '다시는 늙지 않는다 (늘 공주) · 공주의 일격이 0.8초 뒤 한 번 더' },
  hochan: { name: '랑방 초대 방장의 왕관', stats: { atk: 0.1, ult: 0.15 }, fx: { echo: 2 }, desc: '막차 대행진이 2초 뒤 한 번 더 지나간다 (기세는 한 번만)' },
  soyoung: { name: '성준영 평생 출석부', stats: { skill: 0.12, cd: 0.1 }, fx: { summonMul: 2, multi: 1, multiK: 1 }, desc: '성준영 체력 2배 · 잔소리 한 번에 두 배로 채운다' },
  jieun: { name: '멈춰 버린 금시계', stats: { cd: 0.12, skill: 0.1 }, fx: { freeze: 2.5 }, desc: '시간 정지가 진짜 멈춤 — 범위 안 진상 2.5초 꼼짝 못 함 (보스는 더 크게 느려짐)' },
  sanghwa: { name: '백 송이 장미 꽃다발', stats: { atk: 0.1, exp: 0.1 }, fx: { growMul: 2 }, desc: '성장 한도 2배 · 성장 속도 2배 (판이 길수록 훨씬 세진다)' },
  jungmin: { name: '무한 붕대 롤', stats: { hp: 0.15, guard: 0.1 }, fx: { revive: 0.5 }, desc: '입구가 무너지는 순간 한 판에 한 번 붕대로 다시 붙인다 (내구도 50%)' },
  jiwon: { name: '네 손 모자이크 장갑', stats: { skill: 0.12, atk: 0.08 }, fx: { echo: 1 }, desc: '모자이크 폭격이 1초 뒤 한 번 더 쏟아진다 (세 줄 다시 쾅쾅쾅)' },
  wonsik: { name: '다이아 결혼반지', stats: { hp: 0.15, guard: 0.08 }, fx: { pool: 2, reflect: 3 }, desc: '결혼정보회사 등록으로 입구 앞을 막아설 때 버티는 체력 2배 · 되돌려 주는 피해 3배' },
  baul: { name: '팬클럽 응원 썰매 2호', stats: { skill: 0.15, atk: 0.08 }, fx: { sledBack: 1, stun: 1, boardUses: 3 }, desc: '보드 정비 전에 3번 더 탄다 · 썰매가 내려갔다가 다시 올라오며 한 번 더 쓸고 줄 위 진상 1초 기절' },
  byunghwa: { name: '앵콜 원맨쇼 핀 조명', stats: { cd: 0.12, atk: 0.08 }, fx: { encore: 1 }, desc: '원맨쇼가 끝나는 순간 앵콜 원맨쇼가 한 번 더 (멈춤 · 버프 시간 2배)' },
  jeongseob: { name: '쌍둥이 정섭 가면', stats: { res: 0.3, hp: 0.1 }, fx: { twin: 1, stun: 2 }, desc: '나갈 때마다 윤정섭이 둘! 옆 줄에서 그림자 정섭이 함께 밀고 올라간다 · 끝 기절 2배' },
  dragon: { name: '박나뇽의 황금 안장', stats: { atk: 0.12, skill: 0.1 }, fx: { burnUp: 0.5 }, desc: '화상이 50% 더 아프고 불 바닥이 1초 더 탄다' },
  subin: { name: '20년 우정 부케', stats: { skill: 0.12, cd: 0.1 }, fx: { tieN: 1, ampUp: 0.15 }, desc: '기본 부케가 맞은 진상 곁의 1명을 더 묶는다 · 부케 토스로 묶인 진상 받는 피해 +25% → +40%' },
};
export const SIG_IDS = Object.keys(SIG).map((h) => 'sig_' + h); // 장비 id: sig_<멤버>
export const SIG_PITY = 600; // 신화 조각 600개 = 원하는 멤버 전용 신화 1개
export const SIG_DUP_SHARDS = 300; // 이미 가진 멤버 것이 또 나오면 신화 조각 300개로
export const SIG_RATE = { gear: 0.1, hero: 0.05 }; // % (장비 뽑기 1회 · 모집 1회)
for (const [h, m] of Object.entries(SIG)) { const id = 'sig_' + h, k = Object.keys(m.stats)[0]; GEAR[id] = { id, slot: 'm', icon: '', name: m.name, stat: k, base: m.stats[k], stats: m.stats, myth: true, hero: h, fx: m.fx, desc: m.desc }; }
// 장비가 이 멤버에게 맞나 (전용 신화는 그 멤버만)
export const gearFits = (t, hero) => !!GEAR[t] && (!GEAR[t].hero || GEAR[t].hero === hero);
export const sigOf = (hero) => (SIG[hero] ? 'sig_' + hero : null);
export const sigStatText = (t) => Object.entries(GEAR[t].stats).map(([k, v]) => `${(GEAR_STATS[k] || { name: k }).name.replace(/ \(.*\)$/, '')} +${Math.round(v * 1000) / 10}%`).join(' · ');
// 그림이 아직 없는 전용 신화: 멤버 얼굴(도감 썸네일)로 대신 (public/img/lb/gear/myth_<멤버>.webp 가 생기면 여기서 지우기)
export const SIG_ART_TODO = new Set(['subin', 'dragon']); // 임수빈(8장) · 박나영(새 히든)은 아직 — 멤버 얼굴로 대신
export const GEAR_IDS = Object.keys(GEAR).filter((t) => !GEAR[t].myth);
// 그림 주소 (화면): 그림이 아직 없는 새 장비는 비슷한 장비 그림으로
for (const t of Object.keys(GEAR)) GEAR[t].img = GEAR[t].hero ? (SIG_ART_TODO.has(GEAR[t].hero) ? `/img/lb/dexhq/thumb/${GEAR[t].hero}.webp` : `/img/lb/gear/myth_${GEAR[t].hero}.webp`) : `/img/lb/gear/${GEAR_ART_TODO[t] || t}.webp`;
// 드롭 표 (모든 콘텐츠) — 숫자는 실제 규칙(rollDrops · rollHeroCard · live.js 보상)과 같다
export const DROPS = [
  ['스테이지 클리어', '장비 1개 (일반 70 · 희귀 10+0.5×스테이지 · 영웅 (스테이지−8)×0.28 · 전설 (스테이지−25)×0.06) · ★★★면 35%로 1개 더 · 퍼펙트 +1 · 첫 퍼펙트는 희귀 이상', '멤버 카드: 데려간 멤버 중 1명 (7% + 별마다 2%)', '강화석: 1-6부터 (25%+12%×별) · 보스 +2 · 첫 클리어 +1'],
  ['헬', '장비 +1개 · 일반 없음 · 영웅·전설 ×2', '멤버 카드 ×2 확률', '강화석 ×2 · 코인 ×3'],
  ['무한 도전', '달성 우편 10/20/30/40/50웨이브 (주마다): 모집권 1~5 · 50웨이브 신화 장비', '주간 순위: 1위 전설 장비 · TOP3 영웅 장비 · TOP10 모집권 2', ''],
  ['레이드', '참가 코인 · 강화석 2 · 1위 전설 장비 · 2~3위 영웅 장비', 'TOP10 모집권', ''],
  ['주간 도전', '순위 보상: 1위 모집권 5 + 영웅 장비 · TOP3 모집권 3 · TOP10 2 · 참가 1', '', ''],
  ['1:1 대전', '하루 10판 코인 (승 300 · 패 80 · 첫 승 2배)', '등급 올리기 보상: 코인 · 모집권', ''],
  ['시즌 (30단계)', '5단계 희귀 · 15단계 영웅 · 25단계 전설 장비 · 30단계 신화 장비', '4단계마다 범용 카드 · 3단계마다 모집권', ''],
  ['모집', 'LEGEND 0.6% (70번부터 ↑ · 90번 확정) · T4 4% (50번 확정 · 픽업 50%) · T3 카드 20%', '전용 신화 0.05% · 신화 0.3% · 전설 1.2% · 영웅 6% · 희귀 16.5%', '10회: T3 이상 1개 · 처음 10회 T4'],
  ['장비 뽑기', '신화 1% (80번 확정) · 전설 5% · 영웅 24% · 희귀 69.9%', '전용 신화 0.1%', '10회: 영웅 이상 1개'],
  ['전용 신화 (멤버마다 1개)', '모집 1회 0.05% · 장비 뽑기 1회 0.1% (가진 멤버 중 · 아직 없는 멤버 것 먼저)', '신화 조각: 모집·장비 뽑기 1회마다 1개 · 600개 = 원하는 멤버 것 1개 · 겹치면 조각 300개', ''],
]; // 일반 드롭 · 모집 장비 (신화 제외)
// 이 스테이지에서 떨어지는 장비 (새 세트는 그 챕터부터)
export const gearPoolFor = (stage) => GEAR_IDS.filter((t) => !GEAR[t].ch || GEAR[t].ch <= Math.ceil(stage / 10));
export const GEAR_MAX_LV = 10;
export const GEAR_BAG = 80; // 가방 칸
export function gearValue(t, r, lv) {
  const g = GEAR[t], R = GEAR_RARITY[r];
  if (!g || !R) return 0;
  if (g.myth) return g.base; // 신화: 고정
  return Math.round(g.base * (R.stat || R.mul) * (1 + 0.12 * (lv || 0)) * 1000) / 1000; // (10/08 stat: 등급마다 확 세지게 — 희귀 1.7→2 · 영웅 2.6→3.4 · 전설 4→5.5 · 비용 · 판매가는 mul 그대로)
}
export function gearEnhanceCost(r, lv) {
  if (lv >= GEAR_MAX_LV || r === 'myth') return null; // 신화는 강화 없음
  return Math.round((100 * GEAR_RARITY[r].mul * Math.pow(lv + 1, 2.3)) / 10) * 10; // 영웅 +10: 성공만 치면 약 18만 · 실패(+4부터 90%→40%) 포함 기대 비용 약 35만 + 강화석 15개
}
// 강화석: +6 부터 필요 (+6 1개 · +7 2개 · +8 3개 · +9 4개 · +10 5개)
export function gearStoneNeed(lv) { return lv >= 5 && lv < GEAR_MAX_LV ? lv - 4 : 0; }
// 분해: 장비 → 강화석 (팔기 대신)
export function gearDismantle(r, lv) { return ({ common: 1, rare: 2, epic: 4, legend: 8, myth: 30 })[r] + Math.floor((lv || 0) / 3); }
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
    const w = { common: 70, rare: 10 + stage * 0.5, epic: Math.max(0.5, (stage - 8) * 0.28), legend: Math.max(0.1, (stage - 25) * 0.06) }; // (10/08 장에 맞게: 예전 rare 24+0.4s · epic 5+0.35s · legend 0.6+0.08s — 2장에 희귀가 너무 자주)
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
export function gearStats(items, mythMul = 1) { // mythMul: 1:1 대전은 신화 효과 절반
  const st = {};
  for (const it of items) {
    if (!it || !GEAR[it.t]) continue;
    if (GEAR[it.t].myth) { for (const [k, v] of Object.entries(GEAR[it.t].stats)) st[k] = (st[k] || 0) + v * mythMul; continue; }
    const k = GEAR[it.t].stat; st[k] = (st[k] || 0) + gearValue(it.t, it.r, it.lv);
  }
  return st;
}

// ─── 전투력 (화면 숫자 · 대전 매칭 · 순위) — 한 잣대: "이 멤버가 판을 이기는 데 얼마나 도움이 되나" ───
//  전투력 = 기본(POWER_BASE · 강화 0 · ★1 · 장비 없음) × 강화 성장 × ★ × 장비
//  기본 = 등급 체급 × 멤버 몫 × 역할 (10/14 측정: node scripts/lb-balance.js powercalib)
//   · 등급 체급 = 전투 엔진의 등급 배율 그대로 (TIER_MUL × TIER_SPD: T1 1 · T2 1.2 · T3 1.4 · T4 1.6 · 전설 1.85) × 500
//                 → T1 500 · T2 600 · T3 700 · T4 800 · 전설 925 (같은 기술이면 실제로 이만큼 세게 친다)
//   · 멤버 몫 = 시뮬 측정: 같은 동료 3명 + 이 멤버로 20 스테이지 × 2 팀 × 3판 → "건전남의 몇 배 공격력과 같은 도움인가"
//               (딜러는 피해, 탱커는 막아 준 피해, 힐러 · 서포터는 입구 수리 · 상태이상 풀기가 모두 '이긴 판 · 남은 입구'로 같이 잡힌다)
//               등급 평균 대비 비율의 제곱근 (판마다 ±20% 흔들려서 절반만) · 0.82 ~ 1.22 사이로 (등급 체급이 보이게)
//   · 역할 = 공격 멤버(범위 · 단일) ×1.08 · 탱커 · 서포터 ×0.92 (주인 요청: 같은 등급이면 공격 멤버가 조금 위 — 측정만으로는 수리 · 해제 멤버가 오히려 위라서)
//  강화 성장 = 실제 전투와 같은 식 (tierPowerM: 레벨당 공격력 + 5강마다 각성) · ★ = 공격력 +7% / ★
export const POWER_BASE = {
  gunman: 560, gunnyeo: 560, bangjang: 465, staff: 410, // T1 (체급 500)
  jungmin: 675, eunok: 640, sanghwa: 585, myunghoon: 565, dohoon: 535, ingyu: 495, // T2 (체급 600)
  baul: 920, hanna: 875, soyoung: 855, jieun: 855, jiwon: 790, wonsik: 785, youngjun: 780, sunggu: 655, donghan: 620, dragon: 620, subin: 575, jeongseob: 530, // T3 (체급 700)
  hyungyeong: 890, ara: 830, junseo: 810, // T4 (체급 800)
  byunghwa: 1000, hochan: 925, // 전설 (체급 925)
};
export const POWER_STAR = 0.07; // (live.js STAR_ATK 와 같아야 한다 — 테스트가 확인)
// 장비 가치 (10/14 측정: powercalib --vars=atk:0.5,cd:0.35 — 멤버마다 맨몸 · 공격력 +50% · 쿨타임 −35% 를 같은 판들로 비교)
//  a = 공격 쪽 능력치(공격력 · 공속 · 치명 · 스킬 피해 · 보스/졸개 피해 …) 1.0 이 이 멤버 도움을 키우는 몫 (건전남 공격력 = 1 기준)
//  c = 스킬 횟수가 늘어나는 만큼(쿨타임 −x → 스킬 ×1/(1−x))의 몫 — 스킬로 일하는 제어 · 서포터가 크다
//  멤버 하나하나는 판마다 흔들림이 커서(40판) 역할 평균을 쓴다 · 탱커 · 특수는 자기 피해가 작아 공격 장비 몫이 작다 (최소 0.25)
//  방장만 따로: 자기 피해는 작고(30) 오라 · "집합!"(팀 공속 +50%)로 일해서 측정도 공격 0.15 · 쿨 0.19 → 역할 평균과 반반
export const POWER_GEAR_ROLE = { aoe: { a: 0.9, c: 0.14 }, single: { a: 0.84, c: 0.36 }, special: { a: 0.25, c: 0.26 }, ctrl: { a: 0.97, c: 0.76 }, tank: { a: 0.25, c: 0.05 }, support: { a: 0.69, c: 0.28 } };
export const POWER_GEAR_HERO = { bangjang: { a: 0.42, c: 0.24 } };
export const gearWeightOf = (id) => POWER_GEAR_HERO[id] || POWER_GEAR_ROLE[heroRole(id)] || { a: 1, c: 0.4 };
// 장비 능력치 1.0 당 전투력 비율 — 공격 쪽은 a 를 곱하고 · 팀 쪽은 그대로 (모든 장비 능력치가 들어간다 · 빼면 그만큼 내려간다)
export const POWER_GEAR_W = {
  dmg: { crit: 1, critDmg: 0.15, skill: 0.3, attr: 0.3, boss: 0.35, swarm: 0.5, exec: 0.25 }, // 공격력 · 공속은 곱으로 따로 · 치명 = 기본 치명 피해 2배라 확률 1당 피해 +100%
  team: { strip: 0.25, hp: 0.5, range: 0.4, res: 0.25, ult: 0.4, exp: 0.6, guard: 1, regen: 5 }, // 쿨타임은 c 로 따로
};
// 장비 배율 (1 = 장비 없음). id 가 없으면 딜러 기준 (장비끼리 비교용)
export function gearPowerMul(st, id) {
  st = Object.assign({}, st || {});
  if (st.range) st.range = Math.min(0.35, st.range); // 전투도 사거리 장비는 +35% 까지만
  const w = id ? gearWeightOf(id) : { a: 1, c: 0.4 };
  let dmg = (1 + (st.atk || 0)) * (1 + (st.spd || 0)) - 1, team = w.c * (1 / (1 - Math.min(0.6, st.cd || 0)) - 1);
  for (const [k, v] of Object.entries(POWER_GEAR_W.dmg)) dmg += (st[k] || 0) * v;
  for (const [k, v] of Object.entries(POWER_GEAR_W.team)) team += (st[k] || 0) * v;
  return 1 + w.a * dmg + team;
}
// 멤버 한 명 전투력. o: { mile: 각성 포함(스테이지 · 화면) / 빼기(대전), sig: 전용 신화 새 효과 켜짐 }
export function heroPowerOf(id, meta, star, gearSt, o = {}) {
  const b = POWER_BASE[id];
  if (!b || !HEROES[id] || HEROES[id].summon) return 0;
  const t = heroTier(id), m = Math.max(0, Math.min(TIER_MAX[t], meta | 0));
  const grow = (o.mile === false ? tierPower(t, m) : tierPowerM(t, m)) / tierPower(t, 0);
  const s = Math.max(1, Math.min(5, star | 0 || 1));
  return Math.round(b * grow * (1 + POWER_STAR * (s - 1)) * gearPowerMul(gearSt, id) * (o.sig ? 1.25 : 1));
}

// 멤버 강화에 드는 그 멤버 카드 (+1~5 1장 · +6~10 2장 · +11~15 3장 · +16~20 5장) — ★승급과 같은 카드(조각)를 같이 쓴다
export function heroCardNeed(lv) { const L = lv + 1; return L <= 5 ? 1 : L <= 10 ? 2 : L <= 15 ? 3 : 5; }
// 스테이지 카드 드롭: 이번 판에 데려간(가진) 멤버 중 하나 · 별 많을수록 · 헬 ×2
export function rollHeroCard(seed, stars, hell, used) {
  if (!stars || !used.length) return null;
  const rng = seedRng(seed ^ 0x3c1d);
  const p = (0.07 + 0.02 * stars) * (hell ? 2 : 1); // (0.12+0.03별 → 조임: 진행 3~4주)
  if (rng() >= p) return null;
  return used[(rng() * used.length) | 0];
}
export const CARD_PICK = { cost: 1500, n: 5, perWeek: 5 }; // 상점 "멤버 카드 선택권": 고른 멤버 카드 5장 · 주 5번 (2500·3장·주 3번 → 장당 833 → 300 코인: 카드가 강화의 병목이라)

// ─── 진상 특성: 덱을 골라야 이긴다 (모든 특성에 잘 맞는 멤버 2명 이상) ─────
export const TRAITS = {
  aoeImmune: { icon: '🎧', name: '범위 면역', tip: '범위 공격이 안 들려요! 단일 공격으로', counter: ['gunman', 'staff', 'jiwon', 'ara'] },
  singleResist: { icon: '🧱', name: '단일 저항', tip: '한 명씩 치는 공격은 절반만! 범위 공격으로', counter: ['sunggu', 'dohoon', 'eunok'] },
  projShield: { icon: '🛡️', name: '원거리 방패', tip: '처음 몇 발은 막아요! 연사로 방패를 벗기세요', counter: ['gunman', 'hanna'] },
  kbImmune: { icon: '🪨', name: '넉백 면역', tip: '밀리지 않아요! 딜로 잡으세요', counter: ['youngjun', 'ara', 'jiwon'] },
  ccImmune: { icon: '🌀', name: '제어 면역', tip: '기절이 안 걸려요! 딜로 밀어붙이세요', counter: ['youngjun', 'sanghwa', 'jiwon'] },
  split: { icon: '👯', name: '분열', tip: '쓰러지면 하나 더 나와요! 범위 공격으로 한 번에', counter: ['sunggu', 'eunok', 'donghan'] },
  regen: { icon: '💚', name: '재생', tip: '가만두면 회복해요! 방깎·불로 회복을 막으세요', counter: ['jiwon', 'eunok'] },
  stealth: { icon: '👻', name: '은신', tip: '입구 앞까지 안 보여요! 운영진·건전남은 먼저 찾아내요', counter: ['staff', 'gunman'] },
  haste: { icon: '💨', name: '가속', tip: '체력이 줄면 빨라져요! 감속·제어로 붙잡으세요', counter: ['jieun', 'dohoon', 'soyoung'] },
  heal: { icon: '💖', name: '회복 · 버프', tip: '곁의 진상을 회복시키고 빠르게 해요! 먼저 한 방에', counter: ['ara', 'youngjun', 'jiwon'] },
};
export const REVEAL_HEROES = ['staff', 'gunman']; // 은신 진상을 먼저 찾아내는 멤버

// ─── 보스 패턴: 걷기 → 기모으기(1초 예고) → 기술 → 틈!(1.5초 약점) → 반복 · 체력 50% 에서 2페이즈(분노 모습 · 빨라짐 · 새 기술) ───
//  기술: stun(멤버 기절) · silence(스킬 게이지 멈춤) · slow(멤버 공격 속도 ↓) · shock(날아가던 공격 지우기) · summon(부하 부르기) · drain(경험치 빼앗기)
//  상태이상 저항(강화 · 장비 res)만큼 짧아지고, 백인규 · 정원식 도발이 대신 맞는다
export const BOSS_KITS = { // (10/08 진상 리메이크) 보스마다: 멤버를 노리는 기술(쓰러짐 게이지) · 입구를 노리는 기술 · 분노하면 새 기술 + rage 숫자 (더 많이 · 더 세게) — 기술 이름은 그 보스 성격대로
  queen: { name: '꼬충 여왕벌', rageSub: '윙크가 3명 · 하이힐이 더 세게 · 꿀로 부하 회복', skills: [['charm', '윙크 폭격', { n: 2, sec: 2.2, rage: { n: 3 } }], ['summon', '꼬충 호출', { types: ['yeokko', 'namkko'], n: 3 }], ['door', '하이힐 찍기', { frac: 0.035, rage: { frac: 0.05 } }]], p2: ['heal', '여왕의 꿀', { r: 220, frac: 0.15 }] },
  boss_thug: { name: '폭력배 두목', rageSub: '주먹 충격파로 멤버 기절 · 문짝을 더 세게', skills: [['door', '문짝 부수기', { frac: 0.045, rage: { frac: 0.065 } }], ['summon', '애들 불러', { types: ['thug'], n: 2 }]], p2: ['volley', '주먹 충격파', { n: 2, st: 'stun', sec: 1.3, art: 'star' }] },
  boss_gapjil: { name: '인피 행동대장', rageSub: '서류가 3명에게 · 회의 소집(침묵)', skills: [['volley', '결재 서류 투척', { n: 2, st: 'slow', sec: 4, cut: 0.3, art: 'paper', rage: { n: 3 } }], ['door', '"문 열어!" 발길질', { frac: 0.045 }]], p2: ['silence', '회의 소집', { sec: 3 }] },
  boss_inpi: { name: '인피 대장', rageSub: '패거리 총집합 · 오리 떼가 더 세게', skills: [['silence', '뒷담화', { sec: 3 }], ['door', '오리 떼 돌격', { frac: 0.045, rage: { frac: 0.06 } }]], p2: ['summon', '패거리 집합', { types: ['inpi_clique'], n: 4 }] },
  boss_loan: { name: '사채업자', rageSub: '빚 독촉이 두 명에게 · 추심으로 경험치를 빼앗는다', skills: [['stun', '빚 독촉', { n: 1, sec: 1.6, rage: { n: 2 } }], ['door', '압류 딱지', { frac: 0.035 }]], p2: ['drain', '추심', { v: 0.12 }] },
  boss_kkondol: { name: '꼰대 돌싱', rageSub: '골프공이 3명에게 · 훈계(침묵)', skills: [['volley', '골프공 난타', { n: 2, st: 'stun', sec: 1, art: 'golf', rage: { n: 3 } }], ['door', '골프채 풀스윙', { frac: 0.045 }]], p2: ['silence', '훈계', { sec: 3 }] },
  boss_queenmom: { name: '여왕된장싱글맘', rageSub: '"아이스 아메리카노 사 와~" 세 명 홀림', skills: [['stun', '명품백 휘두르기', { n: 2, sec: 1.3 }], ['door', '유모차 탱크 돌격', { frac: 0.05 }], ['summon', '맘카페 호출', { types: ['secretmom'], n: 2 }]], p2: ['charm', '"아이스 아메리카노 사 와~"', { n: 3, sec: 2 }] },
  boss_sales: { name: '영업왕', rageSub: '다단계 하부 소환 · 위약금이 더 세게', skills: [['silence', '계약서 들이밀기', { sec: 3 }], ['door', '위약금 청구', { frac: 0.045, rage: { frac: 0.06 } }]], p2: ['summon', '다단계 하부', { types: ['sales'], n: 3 }] },
  boss_otaku: { name: '오타쿠 왕', rageSub: '덕후 샤우팅(기절) · 빔이 4명에게', skills: [['volley', '응원봉 빔 난사', { n: 3, st: 'slow', sec: 3, cut: 0.3, art: 'glow', rage: { n: 4 } }], ['door', '피규어 탑 무너뜨리기', { frac: 0.045 }], ['summon', '피규어 부대', { types: ['otaku'], n: 2 }]], p2: ['stun', '덕후 샤우팅', { n: 2, sec: 1.3 }] },
  boss_jusa: { name: '주사왕', rageSub: '토사물 폭격(독) · 술병이 3명에게', skills: [['volley', '술병 던지기', { n: 2, st: 'stun', sec: 1.2, art: 'bottle', rage: { n: 3 } }], ['door', '술상 엎기', { frac: 0.05 }]], p2: ['volley', '토사물 폭격', { n: 3, st: 'poison', sec: 3, art: 'puke' }] },
  boss_soloparty: { name: '솔로파티 중독자', rageSub: '미러볼 섬광(3명 기절) · 파티 트레인이 더 세게', skills: [['charm', '디스코 윙크', { n: 2, sec: 2 }], ['door', '파티 트레인 돌진', { frac: 0.05, rage: { frac: 0.065 } }], ['summon', '솔로 호출', { types: ['yeokko', 'namkko'], n: 3 }]], p2: ['stun', '미러볼 섬광', { n: 3, sec: 1.4 }] },
  boss_union: { name: '인피 연합 총수', rageSub: '연합 총동원 · 총공격이 더 세게', skills: [['silence', '연합 공지', { sec: 3 }], ['door', '연합 총공격', { frac: 0.045, rage: { frac: 0.06 } }], ['stun', '총수 호령', { n: 2, sec: 1.5 }]], p2: ['summon', '연합 총동원', { types: ['inpi_clique', 'inpi_dictator'], n: 3 }] },
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
// 증강: 판을 결정하는 큰 카드 (스테이지 1 · 3 · 4웨이브 / 무한 3 · 8 · 13 …) — 멤버 전용 증강은 그 멤버가 덱에 있을 때만
export const AUGMENTS = [
  { id: 'a_power', tier: 'silver', icon: '💪', title: '근성', desc: '모든 멤버 공격력 +35%', fx: { dmg: 0.35 } },
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
  gunnyeo: '천사 모드', myunghoon: '욕의 신', dohoon: '콘서트 앵콜', ingyu: '할리 군단', youngjun: '블랙캣 질주', eunok: '폭탄주 파티', hanna: '윙크 여왕',
  sunggu: '지팡이 폭풍', junseo: '인맥 총동원', hyungyeong: '다이어트 성공', ara: '여왕 즉위', hochan: '랑방의 이름으로', soyoung: '올인 앵콜', jungmin: '붕대 장인', jiwon: '모자이크 폭풍', wonsik: '올해는 결혼',
};
// 제어 분기: 멤버마다 하나 (맞히면 가끔 제어) — 눈에 잘 띄는 색 · 아이콘
export const CC_KINDS = { stun: { icon: '⭐', name: '기절', color: '#ffe066' }, slow: { icon: '🐢', name: '감속', color: '#6fb3ff' }, freeze: { icon: '🧊', name: '빙결', color: '#9ff0ff' }, kb: { icon: '💨', name: '밀치기', color: '#ffffff' }, pull: { icon: '🧲', name: '끌어당기기', color: '#c77dff' } };
export const HERO_CC = {
  bangjang: 'kb', staff: 'slow', gunman: 'stun', gunnyeo: 'slow', myunghoon: 'stun', dohoon: 'slow', ingyu: 'kb', donghan: 'freeze', youngjun: 'stun', eunok: 'kb',
  hanna: 'pull', sunggu: 'pull', junseo: 'kb', hyungyeong: 'kb', ara: 'stun', hochan: 'freeze', soyoung: 'slow', jieun: 'freeze', sanghwa: 'pull', jungmin: 'slow', jiwon: 'stun', wonsik: 'pull', subin: 'slow', dragon: 'kb',
};
export const CC_ON_HIT = { chance: [0.12, 0.18, 0.25], stun: 0.8, slow: 1.8, freeze: 1.0, kb: 60, pull: 50 };

// 중간 보스: 기술 하나 + 체력 50% 에서 빨라짐 (계열마다 · 12~16초마다 · 1초 예고)
export const MID_KIT = {
  violent: ['stun', '박치기', { n: 1, sec: 1.0 }],
  seduce: ['slow', '홀리는 눈빛', { cut: 0.2, sec: 3 }],
  politic: ['silence', '말 끊기', { sec: 2 }],
  jerk: ['summon', '친구 불러', { n: 2 }],
};
export const MID_AI = { every: [11, 14] };
// 중간 보스마다 제 기술 (10/08 진상 리메이크 — 계열 공용 MID_KIT 대신): 1초 예고(노리는 멤버 발밑 표적 · 입구 경고) → 기술 · 예고 중 기절시키면 끊긴다
//  volley: 노린 멤버 n명에게 던지기 (st 상태이상 sec 초 + 쓰러짐 게이지) · charm: n명 홀림 · door: 입구 최대 내구도 frac 강타 · heal: 곁(r) 진상 frac 회복
//  art: 날아가는 물건 그림 (enemyfx.js) · rage: 체력 절반 아래(흥분)에서 바뀌는 숫자
export const MID_KITS = {
  mid_mukti: [['volley', '영수증 폭탄', { n: 2, st: 'slow', sec: 3, cut: 0.3, art: 'paper', rage: { n: 3 } }], ['door', '계산대 들이받기', { frac: 0.03 }]],
  mid_drunk: [['volley', '소주병 세례', { n: 2, st: 'stun', sec: 1, art: 'bottle', rage: { n: 3 } }]],
  mid_thug: [['door', '문짝 걷어차기', { frac: 0.045 }], ['volley', '주먹 날리기', { n: 1, st: 'stun', sec: 1.2, art: 'star' }]],
  mid_scammer: [['charm', '프사 윙크', { n: 2, sec: 2.2, rage: { n: 3 } }]],
  mid_selfie: [['volley', '플래시 연사', { n: 3, st: 'blind', sec: 2.5, art: 'flash' }]],
  mid_gao: [['door', '어깨빵 돌진', { frac: 0.04 }], ['volley', '가오 잡기', { n: 1, st: 'stun', sec: 1.2, art: 'star' }]],
  mid_kkondae: [['volley', '라떼 설교', { n: 2, st: 'silence', sec: 3, art: 'latte' }]],
  fuse_kko: [['charm', '커플 윙크', { n: 2, sec: 2.4, rage: { n: 3 } }]],
  fuse_puke: [['volley', '우웩 콤보', { n: 2, st: 'poison', sec: 3, art: 'puke' }], ['door', '술병 깨기', { frac: 0.03 }]],
  fuse_gossip: [['volley', '단톡 캡처 살포', { n: 3, st: 'slow', sec: 3, cut: 0.3, art: 'rumor' }]],
  fuse_spam: [['volley', '알림 폭탄', { n: 3, st: 'blind', sec: 2, art: 'flash' }]],
  fuse_inpi: [['heal', '회비 집행', { r: 220, frac: 0.15 }], ['volley', '강퇴 통보', { n: 2, st: 'silence', sec: 2.5, art: 'stamp' }]],
  mid_fakesingle: [['charm', '반지 숨기기 윙크', { n: 2, sec: 2.2 }]],
  mid_carpoor: [['door', '외제차 들이받기', { frac: 0.05 }]],
  fuse_lease: [['door', '리스 차량 돌진', { frac: 0.04 }], ['volley', '계약서 투척', { n: 2, st: 'silence', sec: 2.5, art: 'paper' }]],
  fuse_lie: [['charm', '거짓말 커플 윙크', { n: 2, sec: 2.4, rage: { n: 3 } }]],
  mid_otaku: [['volley', '응원봉 휘두르기', { n: 2, st: 'stun', sec: 1, art: 'glow' }]],
  mid_sarcasm: [['volley', '돌려까기 연타', { n: 3, st: 'slow', sec: 3, cut: 0.25, art: 'sarcasm' }]],
  fuse_jusa: [['volley', '눈물 콧물 폭격', { n: 2, st: 'poison', sec: 3, art: 'puke' }]],
  fuse_sleep: [['heal', '쿨쿨 회복', { r: 170, frac: 0.12 }], ['door', '드러누워 문 막기', { frac: 0.035 }]],
  fuse_karaoke: [['charm', '듀엣 세레나데', { n: 3, sec: 2 }]],
  fuse_taxi: [['door', '택시 문 쾅', { frac: 0.045 }]],
  fuse_mt: [['volley', '피규어 던지기', { n: 2, st: 'stun', sec: 1, art: 'star' }]],
  fuse_latte: [['volley', '나이스 샷 연타', { n: 3, st: 'stun', sec: 0.9, art: 'golf' }]],
  fuse_adspam: [['volley', '광고 전단 살포', { n: 3, st: 'blind', sec: 2.5, art: 'paper' }]],
  mid_snowboard: [['volley', '눈보라 뿌리기', { n: 2, st: 'freeze', sec: 1.2, art: 'snowball' }]],
  mid_sledgirl: [['door', '썰매 돌진', { frac: 0.05 }]],
  fuse_lift: [['door', '리프트 바 내리기', { frac: 0.045 }], ['volley', '스키 폴 던지기', { n: 1, st: 'stun', sec: 1.2, art: 'star' }]],
  fuse_coach: [['volley', '자세 지적', { n: 2, st: 'silence', sec: 2.5, art: 'latte' }]],
  fuse_snowfight: [['volley', '눈덩이 일제 사격', { n: 3, st: 'freeze', sec: 1.2, art: 'snowball' }]],
  mid_envthief: [['volley', '빈 봉투 던지기', { n: 2, st: 'slow', sec: 3, cut: 0.3, art: 'paper' }]],
  mid_buffet: [['heal', '접시 돌리기', { r: 200, frac: 0.12 }], ['volley', '상한 잡채', { n: 2, st: 'poison', sec: 3, art: 'puke' }]],
  mid_drunkfriend: [['volley', '폭탄주 건배', { n: 2, st: 'poison', sec: 2.5, art: 'bottle', rage: { n: 3 } }]],
  fuse_toast: [['volley', '건배사 마이크', { n: 3, st: 'silence', sec: 2.5, art: 'rumor' }]],
  fuse_selfie8: [['charm', '인증샷 윙크', { n: 2, sec: 2.2 }], ['volley', '플래시', { n: 2, st: 'blind', sec: 2, art: 'flash' }]],
};

// 좁은 자리(얼굴 칩 · 보스 체력 줄 · 스테이지 목록)용 짧은 이름 — 상세 화면 · 길게 누르기엔 전체 이름
export const SHORT_NAME = { noshow: '약속취소러', praise1: '칭찬빌런', praise2: '칭찬빌런', selfie: '인플루언서', scammer: '사기꾼', fakesingle: '돌싱남', secretmom: '싱글맘',
  drunk_cry: '우는 주사', drunk_run: '뛰는 주사', drunk_sleep: '눕는 주사', drunk_home: '귀가 주사', boss_kkondol: '꼰대돌싱', boss_queenmom: '된장싱글맘', boss_soloparty: '솔로파티왕', boss_union: '연합회장',
  mid_selfie: '각성 인플루', fuse_gossip: '뒷담 대장', fuse_jusa: '울뛰 만취자', fuse_karaoke: '노래방 커플', fuse_taxi: '택시만취러', fuse_lease: '리스왕', fuse_adspam: '광고방장', fuse_latte: '라떼 연합' };
export const shortName = (id) => SHORT_NAME[id] || (ENEMIES[id] ? ENEMIES[id].name : id);

// ─── 멤버 전용 스킬 증강 (레벨업 카드) ─────────────────────────
//  그 멤버가 판에 있을 때만 · 증강마다 한 번 · 고르면 그 멤버 공격력 +10% + 아래 효과
//  스테이지에선 그 멤버 Lv3 부터 가끔 · 진상의 탑(혼자)에선 자주
//  cm: 멤버 전용 카드와 같은 배율(mul)/더하기(add) · skCd: 스킬 쿨 배율 · skDmg: 스킬 피해 + · 나머지는 sim.js 가 id 로 처리
export const SKILL_AUG = {
  bangjang: [
    { id: 'tri', name: '3명 지목', desc: '지시할 때마다 근처 진상 2명도 같이 지목' },
    { id: 'rally', name: '전원 집합', desc: '집합! +3초 · 공격 속도 버프 +20%p' },
    { id: 'loud', name: '확성기 과부하', desc: '사거리 +20% · 지목 피해 +10%p', cm: { mul: { range: 1.2 }, add: { order: 0.1 } } },
  ],
  staff: [
    { id: 'redchain', name: '레드카드 연쇄', desc: '레드카드가 다른 무리에 한 장 더 날아간다 (80%)' },
    { id: 'warn2', name: '즉결 강퇴', desc: '경고 2번이면 강퇴', cm: { add: { warnN: 1 } } },
    { id: 'kickboom', name: '강퇴 폭발', desc: '강퇴당한 진상 주변이 터지며 0.8초 기절' },
  ],
  gunman: [
    { id: 'frenzy', name: '퀵드로우 연장전', desc: '퀵드로우 +0.6초 · 피해 +20%' },
    { id: 'head', name: '헤드샷 장인', desc: '치명타 +15% · 3발마다 헤드샷 (Lv 상관없이)' },
  ],
  gunnyeo: [
    { id: 'aegis', name: '철벽 방패', desc: '응급 방패 면역 +1.5초 · 스킬 쿨타임 −1초 더' },
    { id: 'angel', name: '천사의 손길', desc: '간호 50% 더 자주 · 하트 폭탄 범위 +30%', cm: { mul: { care: 1.5, splash: 1.3 } } },
  ],
  myunghoon: [
    { id: 'bolts', name: '벼락 폭격', desc: '실눈 저격 벼락 8발' },
    { id: 'chain', name: '욕 연쇄', desc: '욕 튕김 +2 · 기절 +30%', cm: { add: { bounce: 2 }, mul: { ctrl: 1.3 } } },
  ],
  dohoon: [
    { id: 'medley', name: '앙코르 메들리', desc: '무한 앵콜 버프 2배 길게 · 범위 +30%' },
    { id: 'hi', name: '고음 폭발', desc: '음파 반경 +25% · 한 번에 4명 더', cm: { mul: { range: 1.25 } } },
  ],
  ingyu: [
    { id: 'twin', name: '할리 2대', desc: '할리가 반대쪽으로 한 대 더 달린다' },
    { id: 'booster', name: '부스터', desc: '오토바이 덤벨 1번 빨리 · 오토바이 피해 +50%', cm: { add: { moto: 1 } } },
  ],
  donghan: [
    { id: 'double', name: '두 줄 빔', desc: '빔이 두 번째로 붐비는 줄에도 (70%)' },
    { id: 'fastmeter', name: '빠른 간보기', desc: '간보기 게이지 +40% 빨리' },
  ],
  youngjun: [
    { id: 'rushx', name: '블랙 러시 연속', desc: '블랙 러시 +1명 · 피해 +30%', cm: { add: { rush: 1 } } },
    { id: 'endless', name: '끝없는 돌격', desc: '돌격 +1.5초 · 크로스핏 −40%', cm: { add: { out: 1.5 } } },
  ],
  eunok: [
    { id: 'inferno', name: '술 웅덩이 확장', desc: '분노 술 웅덩이 범위 +50% · 1초 더' },
    { id: 'bottoms', name: '끝장 원샷', desc: '분노 +4초 · 원샷 쿨타임 −30%', cm: { add: { rage: 4 } }, skCd: 0.7 },
  ],
  hanna: [
    { id: 'focus', name: '집중 레이저', desc: '레이저 세지는 속도 +60% · 최대치 +80%p', cm: { mul: { ramp: 1.6 } } },
    { id: 'wbomb', name: '윙크 폭탄 연쇄', desc: '윙크 폭탄 범위 +35% · 홀림 +0.8초' },
  ],
  sunggu: [
    { id: 'tricane', name: '지팡이 하나 더', desc: '지팡이 +1개', cm: { add: { cane: 1 } } },
    { id: 'bighole', name: '블랙홀 확장', desc: '블랙홀 반경 +35% · 마지막 쾅 +40%' },
  ],
  junseo: [
    { id: 'pinball', name: '인맥 핀볼', desc: '여사친 튕김 +2', cm: { add: { bounce: 2 } } },
    { id: 'jackpot', name: '소개팅 대박', desc: '소개팅 주선 여사친 +1명 · 피해 +30%' },
  ],
  hyungyeong: [
    { id: 'noyoyo', name: '요요 없음', desc: '날씬 모드 +5초', cm: { add: { diet: 5 } } },
    { id: 'target', name: '표적 표시', desc: '표시한 진상이 받는 피해 +25% → +45%' },
  ],
  ara: [
    { id: 'forever', name: '영원한 공주', desc: '공주로 +6초 · 늙는 시간 −40%', cm: { add: { young: 6 } } },
    { id: 'combo', name: '공주의 연타', desc: '공주의 일격이 다음 센 적 둘에게도 (60%)' },
  ],
  hochan: [
    { id: 'bond', name: '랑방 결속', desc: '랑방 버프 최대 +12%p', cm: { add: { buff: 0.12 } } },
    { id: 'extra', name: '막차 증차', desc: '막차 대행진 버스 +2대 · 기절 +0.5초' },
  ],
  soyoung: [
    { id: 'nagbomb', name: '잔소리 폭격', desc: '성준영 체력 +40%', cm: { add: { nag: 0.4 } } },
    { id: 'allin', name: '올인 끌어당기기', desc: '성준영 쓸어 담기 피해 +50% · 끌어모으는 범위 +20%' },
  ],
  jieun: [
    { id: 'frozen', name: '완전 정지', desc: '시간 정지가 훨씬 느리게 (−88%) · 반경 +20%' },
    { id: 'tick', name: '째깍 감속', desc: '시계침 감속 +15%p · 1초 더', cm: { add: { slowX: 0.15, slowSec: 1 } } },
  ],
  sanghwa: [
    { id: 'growth', name: '끝없는 성장', desc: '성장 한도 +20%', cm: { add: { growMax: 0.2 } } },
    { id: 'perfect', name: '완벽한 박상화', desc: '꽃다발 피해 +40% · 터지는 범위 +30%' },
  ],
  jungmin: [
    { id: 'craft', name: '붕대 장인', desc: '수리 +50%', cm: { mul: { heal: 1.5 } } },
    { id: 'iron', name: '철벽 붕대', desc: '바리케이드 붕대 벽 1.5배 튼튼 · 입구 피해 감소 +20%p · 2초 더' },
  ],
  jiwon: [
    { id: 'deep', name: '깊은 방깎', desc: '방깎 +1겹 · 2초 더', cm: { add: { shredMax: 1, shredSec: 2 } } },
    { id: 'wide', name: '더 큰 모자이크', desc: '모자이크 손 폭 +50% · 피해 +40%' },
  ],
  wonsik: [
    { id: 'consult', name: '상담 반경 +40%', desc: '결혼정보회사 상담 반경 +40%' },
    { id: 'back', name: '든든한 등', desc: '피해 감소 +10%p · 반경 +25%', cm: { add: { guardCut: 0.1 }, mul: { guardR: 1.25 } } },
  ],
  baul: [
    { id: 'ice', name: '미끄러운 눈길', desc: '점프대 착지한 자리 4초 동안 미끄러운 눈길 (진상 −45%)' },
    { id: 'twice', name: '두 번 점프', desc: '착지하자마자 가장 몰린 곳으로 한 번 더 점프 (60%)' },
    { id: 'glow', name: '튜닝 보드', desc: '보드 돌진 피해 +25% · 보드 폭 +40% (맞히기 쉬움)' },
  ],
  byunghwa: [
    { id: 'curtain', name: '커튼콜', desc: '원맨쇼 중 처치하면 시간 +0.5초 (최대 +3초)' },
    { id: 'stage', name: '무대 확장', desc: '고함 대상 +2명 · 홀림 +0.3초' },
  ],
  subin: [
    { id: 'ribbon', name: '리본 이중 매듭', desc: '기본 공격 감기 +0.5초', cm: { add: { tieSec: 0.5 } } },
    { id: 'catch', name: '앙코르 스텝', desc: '댄스 플로어 반경 +25% · 한 박자 더 · 감긴 진상 받는 피해 +15%p' },
  ],
  dragon: [
    { id: 'blaze', name: '화르륵 대폭발', desc: '화상 최대 3겹 → 5겹 · 불 바닥 +1초' },
    { id: 'twin', name: '두 번 급강하', desc: '급강하 뒤 1초 뒤 진상이 가장 몰린 곳에 한 번 더 (60%)' },
  ],
  jeongseob: [
    { id: 'giant', name: '거인의 팔', desc: '미는 폭 +30% · 버티는 힘 +50%' },
    { id: 'stomp', name: '벽 쿵쿵', desc: '끝에서 쿵 기절 +1초 · 범위 +40' },
    { id: 'stride', name: '성큼성큼', desc: '걷는 속도 +30% · 쉬는 시간 −3초' },
  ],
};
export const SKILL_AUG_W = { stage: 1.1, tower: 7, stageLv: 3, atk: 0.1 }; // 카드 가중치 (스테이지 · 탑) · 스테이지는 그 멤버 Lv3 부터 · 고르면 공격력 +10%
// 진상의 탑 규칙 숫자 (sim.js 가 읽는다 · 층 구성은 tower.js)
export const TOWER_SIM = { // [아래층, 25층 이상] — 규칙은 아래층에선 순하게, 25층쯤부터 제 세기
  ramp: 24, // 1층 → 25층에 걸쳐 규칙 세기가 오른다
  titan: { hp: [3, 10], spd: 0.5, atk: [1.6, 3.2], pair: 0.5 }, // 거물: 체력 · 속도 · 문 공격 배율 · 규칙이 둘인 층(46~)에선 체력 ×0.5 (다른 규칙과 겹치면 최대 성장 거물 전문가도 못 깨던 벽)
  swarm: { hp: [0.4, 0.34], atk: 0.7, count: [0.4, 1.1] }, // 떼거리: 한 명은 약하게 · 수는 위로 갈수록
  rush: { spd: [1.25, 1.6], maxSpd: 150 }, // 돌진: 빠르고 잘 피한다 (BAL.fast 회피)
  shield: { layers: [1, 2, 2], boss: [3, 4, 4], regen: 4, hp: 0.2 }, // 보호막 겹 (10층 · 20층마다 +1 · 한 방에 한 겹 · 3초마다 한 겹) + 체력 보호막 25%
  curse: { every: [8, 3.2], stun: [0.8, 1.6], silence: 3, charm: [1, 2], slow: [0.35, 4] }, // 저주 간격(1층 → 60층) · 시간
  dark: { range: [0.85, 0.7], reveal: 0.62, maxHide: 12, door: 1.2 }, // 어둠: 사거리 · 길 62% 지나야 보인다 (드러누운 진상은 바로 · 아무리 늦어도 12초면 보인다) · 입구 피해 ×1.2 (예전 ×2 는 돌진+어둠 57층을 최대 성장도 못 깨는 벽으로 만들었다)
  seal: { weak: [0.7, 0.4], strong: [1.15, 1.3] }, // 속성 봉인
  wallDps: 7, // 윤정섭 (혼자 탑): 밀고 가는 진상에게 초당 한 방 ×7
  wall: { w: 3, spd: 1.6, rest: 0.35 }, // 윤정섭 (혼자 탑): 미는 폭 · 걷는 속도 · 쉬는 시간
  limit: [30, 80], // 제한 시간: 30초 + 웨이브마다 80초
  dash: { swarmOut: 0.6, swarmRest: 1.6, rushDodge: 0.5, curseRest: 1.5 }, // 김영준 돌격 (혼자 탑): 떼거리엔 금방 지치고 · 돌진 진상은 더 잘 피하고 · 저주에 걸리면 돌격이 끊긴다
  ara: { r: 52, k: 0.4, lay: 2, layNear: 1 }, // 고아라 (탑에서만): 망치가 떨어진 곳 반경 52 안 진상에게 40% 피해 · 망치는 보호막을 먼저 2겹 깨고 그대로 때림 (주변은 1겹) (센 진상 하나만 쳐서 떼거리 · 보호막 층에서 2~6층에 막히던 문제)
  laneHold: 10, // 혼자인 탑: 손으로 옮기면 이 시간 동안 자동 자리 잡기를 쉰다 (초)
  solo: { junyoung: 1.6, eunok: 1.5, wonsik: 1.7, jungmin: 1.35, dohoon: 1.25, gunnyeo: 1.25, jieun: 1.15, sanghwa: 1.15, baul: 0.75, ingyu: 1.5, youngjun: 0.7 }, // (송바울 1.1 → 0.75: 응원봉 부메랑 · 함성으로 혼자서도 세짐 · 백인규 1.5: 입구 피해 감소가 빠져서) // (성준영 1.6: 정소영 혼자면 딜이 준영뿐 · 최은옥 1.5: 스테이지 템포 보정을 0.65 로 내린 만큼 탑에서만 돌려 줌) // 혼자라서 동료 덕을 못 보는 멤버(탱커 · 회복 · 지원)는 탑에서만 공격력 보정 · 김영준은 혼자일 때 너무 세서 탑에서만 −30% (출시 첫날 TOP 7 중 5명이 김영준)
};
export const TOWER_AWAKE_FX = { atk: 0.05, skill: 0.15, cd: 0.08 }; // 지옥 각성 (20층 공격력 · 40층 스킬)
export const HELL_SET_FX = { cc: 0.3, boom: 0.6, r: 64 }; // 지옥 세트 2세트 · 4세트
// 7장 스키장: 입구 공격 동작 · 짧은 이름 · 드문 진상 · 회장 보스 패턴
Object.assign(ENEMY_ATK, { snowboard: 'kick', liftcut: 'shove', fakecoach: 'slap', sledgirl: 'headbutt', hotpack: 'shove', snowball: 'bottle', mid_pension: 'bag', boss_resort: 'punch' });
Object.assign(SHORT_NAME, { snowboard: '보드남', liftcut: '리프트 새치기', fakecoach: '사칭 강사', sledgirl: '썰매녀', hotpack: '핫팩 도둑', snowball: '눈싸움러', mid_pension: '펜션 사장', boss_resort: '리조트 회장',
  mid_snowboard: '각성 보드남', mid_sledgirl: '각성 썰매녀', fuse_lift: '리프트 무법자', fuse_coach: '사칭 강사단', fuse_snowfight: '눈싸움 원정대' });
FEW.push('fakecoach', 'snowball', 'hotpack');
BOSS_KITS.boss_resort = { name: '리조트 갑부 회장', rageSub: '스키 강사단 소환 · 눈덩이가 4명에게', skills: [['volley', 'VIP 눈덩이 포격', { n: 3, st: 'freeze', sec: 1.3, art: 'snowball', rage: { n: 4 } }], ['silence', '회장님 훈화', { sec: 3 }]], p2: ['summon', '스키 강사단', { types: ['fakecoach', 'snowboard'], n: 3 }] }; // (입구는 눈사태가 친다)
// 7-5 보스로 승격한 펜션 사장님: "소음 금지!" 침묵(원래 기술)은 그대로 + 보스 패턴
BOSS_KITS.mid_pension = { name: '펜션 사장님', rageSub: '바비큐 집게(2명 기절) · 얼음물이 3명에게', skills: [['volley', '얼음물 바가지', { n: 2, st: 'freeze', sec: 1.2, art: 'snowball', rage: { n: 3 } }], ['door', '"퇴실 시간이에요!" 문 쾅쾅', { frac: 0.045 }], ['summon', '단체 손님 받기', { types: ['liftcut', 'hotpack'], n: 3 }]], p2: ['stun', '바비큐 집게', { n: 2, sec: 1.3 }] };
// 2-10 끝 보스 번화가 삐끼왕 — 새 기술 3개 (sim.js bossSkill)
//  flyer 전단지 폭탄: 예고된 멤버 n명 시야를 가려 사거리 -cut (sec초)
//  lure 호객 행위: 곁(r)의 진상을 한 줄로 바짝 모아 입구로 우르르 (sec초 빨라짐) + 2장 진상 n명 호객
//  vip VIP 줄 세우기: 입구에 제일 가까운 진상 n명에게 최대 체력 frac 보호막
//  rageAt: 체력 40% 에서 분노 · everyP2: 분노하면 기술 간격이 짧아진다
BOSS_KITS.boss_bbikki = {
  name: '번화가 삐끼왕', rageAt: 0.4, everyP2: [4, 6], rageSub: '기술을 훨씬 자주 쓴다',
  skills: [['flyer', '전단지 폭탄', { n: 3, cut: 0.3, sec: 4 }], ['lure', '호객 행위', { r: 240, pull: 0.65, sec: 3, spd: 1.45, types: ['scammer', 'handsy'], n: 3 }], ['vip', 'VIP 줄 세우기', { n: 5, frac: 0.35 }]],
  p2: ['volley', '전단지 뭉치 난사', { n: 3, st: 'blind', sec: 2.5, art: 'paper' }], // (분노: 전단지 뭉치로 멤버 눈을 가린다 · 입구는 호객 행위로 몰아 친다)
};
Object.assign(ENEMY_ATK, { boss_bbikki: 'slap' });
Object.assign(SHORT_NAME, { boss_bbikki: '삐끼왕' });
// 8장 결혼식 뒤풀이: 입구 공격 동작 · 짧은 이름 · 드문 진상 · 실장님 · 신랑 친구 대표 보스 패턴
Object.assign(ENEMY_ATK, { envthief: 'shove', buffet: 'bag', badsinger: 'slap', showoff: 'slap', drunkfriend: 'bottle', mid_hallmgr: 'bag', boss_bestman: 'punch' });
Object.assign(SHORT_NAME, { envthief: '축의금 도둑', buffet: '뷔페 아줌마', badsinger: '축가 삼촌', showoff: '과시녀', drunkfriend: '취한 친구', mid_hallmgr: '예식장 실장', boss_bestman: '친구 대표',
  mid_envthief: '각성 도둑', mid_buffet: '각성 뷔페', mid_drunkfriend: '각성 취객', fuse_toast: '건배사 삼촌', fuse_selfie8: '인증샷 도둑단' });
FEW.push('buffet', 'badsinger');
BOSS_KITS.mid_hallmgr = { name: '예식장 실장님', rageSub: '클립보드 내려치기(2명 기절) · 문 쾅이 더 세게', skills: [['door', '"다음 예식 들어와요!" 문 쾅', { frac: 0.045, rage: { frac: 0.06 } }], ['volley', '"사진 찍으시면 안 돼요!"', { n: 2, st: 'blind', sec: 2.5, art: 'flash' }], ['summon', '하객 몰아넣기', { types: ['drunkfriend', 'envthief'], n: 3 }]], p2: ['stun', '클립보드 내려치기', { n: 2, sec: 1.3 }] };
BOSS_KITS.boss_bestman = { name: '신랑 친구 대표', rageSub: '친구들 무대로! · 건배가 2명에게', skills: [['stun', '건배 제의', { n: 1, sec: 1.3, rage: { n: 2 } }], ['volley', '폭탄주 원샷 강요', { n: 2, st: 'poison', sec: 3, art: 'bottle' }], ['slow', '"한 말씀만 더…"', { cut: 0.25, sec: 4 }]], p2: ['summon', '친구들 무대로!', { carpet: true, len: 260, types: ['drunkfriend', 'showoff'], n: 3 }] };
// ─── 할로윈 이벤트 「할로윈 저주의 밤」 진상 (hw-event.js · hw-sim.js) ───
//  eventOnly: 도감 · 수집 보너스 · 테스트 목록에서 빠진다 (이벤트 판에서만) · lazy: 처음엔 그림을 안 받는다 (이벤트에 들어갈 때 R.loadLazy)
//  hw: 이벤트 전용 기술 (hw-sim.js) — revive(쓰러졌다 다시 일어남) · split(쪼개짐) · drain(입구 흡혈) · phase(유령화) · brew(회복 물약) · hop(콩콩) · rewrap(붕대 재감기) · list(야근 명부) · batform(박쥐 변신) · moon(보름달)
const HW_IMG = (id) => `/img/lb/hw/e_${id}.webp`;
Object.assign(ENEMIES, {
  hw_zombie: { id: 'hw_zombie', cls: 'jerk', name: '좀비 회식러', gender: 'm', emoji: '🧟', color: '#8fbf7a', eventOnly: true, lazy: true,
    img: HW_IMG('hw_zombie'), anims: ['walk', 'die'], hp: 70, speed: 26, atk: 8, atkInterval: 1.3, exp: 5, coin: 2, r: 17, size: 78, zigzag: 14,
    spit: { name: '트림 독가스', every: [12, 15], first: 6, reach: 260, kind: 'puke', st: 'poison', sec: 2, fly: 0.6 },
    hw: { revive: { sec: 2, hp: 0.6 } }, // 쓰러지면 2.2초 뒤 체력 45% 로 다시 일어난다 (한 번) — 화상 · 검열 · 장미 표식이 붙은 채로 쓰러지거나 · 일어나는 동안 때리면 끝
    shouts: ['한 자안… 더어…', '3차… 가자아…', '부장님… 건배애…', '고기… 타요오…'] },
  hw_pumpkin: { id: 'hw_pumpkin', cls: 'violent', name: '호박머리 진상', gender: 'm', emoji: '🎃', color: '#ff8a1f', eventOnly: true, lazy: true,
    img: HW_IMG('hw_pumpkin'), anims: ['walk', 'die'], hp: 90, speed: 36, atk: 9, atkInterval: 1.2, exp: 5, coin: 2, r: 17, size: 78,
    kick: { name: '호박 폭탄', every: 9, first: 1.2, wind: 1.4, mul: 2.2, hit: 10, from: 0 }, selfBoom: true, // 입구 앞에서 1.4초 도화선 → 펑! (입구 ×2.2 · 곁 멤버 게이지 · 터지면 자기도 쓰러짐 → 호박씨) — 도화선 동안 기절 · 밀치기로 끊긴다
    hw: { split: { type: 'hw_seed', n: 2 } }, splitInto: { type: 'hw_seed', n: 2 }, // 쓰러지면 호박씨 둘 (sim killEnemy splitInto)
    shouts: ['트릭 오어 트릿!', '펑 하고 싶다~', '호박 아님, 패션임', '불 좀 빌려 줘'] },
  hw_seed: { id: 'hw_seed', cls: 'violent', name: '호박씨', gender: 'm', emoji: '🌰', color: '#ffb35a', eventOnly: true, lazy: true,
    img: HW_IMG('hw_seed'), hp: 10, speed: 100, atk: 2, atkInterval: 1, exp: 1, coin: 0, r: 10, size: 44,
    shouts: ['씨!', '퉤!'] },
  hw_bat: { id: 'hw_bat', cls: 'jerk', name: '박쥐 알바', gender: 'm', emoji: '🦇', color: '#7a4fb0', eventOnly: true, lazy: true,
    img: HW_IMG('hw_bat'), anims: ['walk', 'die'], hp: 16, speed: 76, atk: 2, atkInterval: 0.9, exp: 1, coin: 1, r: 12, size: 60, zigzag: 26,
    pack: { min: 3, max: 5 }, hw: { drain: { per: 0.0025, heal: 0.6 } }, // 입구에 붙으면 피를 빤다 (입구 초당 0.25% · 그만큼 자기 회복)
    shouts: ['찍찍!', '시급 올려 주세요', '사장님 지켜!'] },
  hw_ghost: { id: 'hw_ghost', cls: 'politic', name: '처녀귀신 단톡방장', gender: 'f', emoji: '👻', color: '#cfe8ff', eventOnly: true, lazy: true,
    img: HW_IMG('hw_ghost'), anims: ['walk', 'die'], hp: 60, speed: 40, atk: 5, atkInterval: 1.1, exp: 4, coin: 2, r: 15, size: 80,
    spit: { name: '단톡 초대', every: [11, 14], first: 5, reach: 300, kind: 'rumor', st: 'silence', sec: 2.2, fly: 0.6, hit: 6 }, // 예고 뒤 단톡 초대 → 스킬 침묵 (정소영 · 강병화 · 강성구 곁)
    hw: { phase: { every: 7, sec: 2.6, spd: 1.45 } }, // 7초마다 2.2초 유령화: 안 보이고 · 안 맞고 · 빨리 미끄러진다 (운영진 · 건전남 · 배현경이 찾아낸다)
    shouts: ['왜 읽고 답이 없어…', '단톡방 나가지 마…', '1 안 없어져…', '초대했어…'] },
  hw_witch: { id: 'hw_witch', cls: 'seduce', name: '마녀 다단계', gender: 'f', emoji: '🧙', color: '#a05cff', eventOnly: true, lazy: true,
    img: HW_IMG('hw_witch'), anims: ['walk', 'die'], hp: 62, speed: 32, atk: 6, atkInterval: 1.2, exp: 5, coin: 3, r: 16, size: 82, standoff: 150,
    spit: { name: '다단계 영입 윙크', every: [9, 12], first: 4, reach: 330, kind: 'glow', st: 'charm', sec: 2.2, fly: 0.6 }, // 예고 뒤 홀림 (정소영이 있으면 면역)
    hw: { brew: { every: 8, r: 190, frac: 0.2 } }, // 9초마다 건강 물약: 곁 진상 체력 12% 회복 (방깎 · 화상 · 고아라가 회복을 막는다)
    shouts: ['한 병이면 인생 역전!', '하부만 세 명 데려와~', '언니만 믿어', '부업 관심 있어요?'] },
  hw_jiangshi: { id: 'hw_jiangshi', cls: 'violent', name: '강시 꼰대', gender: 'm', emoji: '🧧', color: '#3a4a8a', eventOnly: true, lazy: true,
    img: HW_IMG('hw_jiangshi'), hp: 120, speed: 28, atk: 7, atkInterval: 1.3, armor: 4, exp: 6, coin: 3, r: 18, size: 84,
    spit: { name: '라떼 부적', every: [10, 13], first: 5, reach: 280, kind: 'paper', st: 'freeze', sec: 1.4, fly: 0.6 }, // 예고 뒤 부적 → 빙결 (박나영 · 건전녀 · 강성구)
    hw: { hop: { gap: 0.95, air: 0.38 } }, // 콩콩 뛰어온다 — 공중에선 밀치기 · 끌어당기기가 안 먹힌다
    shouts: ['라떼는 말이야~', '요즘 애들은 쯧쯧', '부적 붙이기 전에 와라', '회식은 업무의 연장이야'] },
  hw_mummy: { id: 'hw_mummy', cls: 'politic', name: '미라 부장님', gender: 'm', emoji: '🩹', color: '#d8c89a', eventOnly: true, lazy: true,
    img: HW_IMG('hw_mummy'), hp: 150, speed: 22, atk: 10, atkInterval: 1.4, armor: 8, exp: 8, coin: 4, r: 20, size: 88,
    spit: { name: '붕대 결재', every: [11, 14], first: 5, reach: 260, kind: 'paper', st: 'stun', sec: 1.3, fly: 0.6 }, // 예고 뒤 붕대 → 기절
    hw: { rewrap: { at: 0.5, frac: 0.35 } }, // 체력 절반에서 붕대를 다시 감는다 (보호막 25% · 한 번)
    shouts: ['결재 반려야', '이거 다시 해 와', '나 때는 붕대도 직접 감았어', '퇴근? 누가?'] },
  hw_reaper: { id: 'hw_reaper', cls: 'politic', name: '저승사자 팀장', gender: 'm', emoji: '📜', color: '#2a2438', eventOnly: true, lazy: true, mid: true,
    img: HW_IMG('hw_reaper'), hp: 1100, speed: 16, atk: 24, atkInterval: 1.6, armor: 4, exp: 45, coin: 10, r: 40, size: 142,
    hw: { list: { every: 11, first: 6, sec: 3, gnSec: 4, kd: 70, stun: 2 } }, // 야근 명부: 멤버 한 명 이름을 적고 3초 (건전녀가 있으면 4초) 뒤 강제 퇴근 — 그 사이 팀장을 기절 · 빙결 · 밀치기 하거나 건전녀 응급 방패로 지운다
    title: '저승사자 팀장 등장!', subtitle: '"야근 명부에 이름 적히고 싶은 사람?"',
    shouts: ['명부에 이름 적었다', '오늘 야근 확정', '퇴근은 저승에서', '다음 사람~'] },
  hw_dracula: { id: 'hw_dracula', cls: 'seduce', name: '드라큘라 사장', gender: 'm', emoji: '🧛', color: '#b0142a', eventOnly: true, lazy: true, boss: true,
    img: HW_IMG('hw_dracula'), anims: ['attack'], hp: 5200, speed: 13, atk: 40, atkInterval: 1.8, armor: 5, exp: 90, coin: 60, r: 46, size: 162,
    hw: { batform: { every: 13, first: 9, sec: 1.6 }, moon: { at: 0.25, spd: 1.15, heal: 0.004 } }, // 분노(50%)부터 박쥐로 흩어져 1.6초 무적 → 다른 자리에 나타남 · 25% 보름달: 진상 전부 빨라지고 박쥐가 살아 있으면 사장이 피를 받는다
    title: '드라큘라 사장 등장!', subtitle: '"오늘 회식 빠지는 사람, 내일부터 안 나와도 돼."',
    shouts: ['회식은 의무다', '피 같은 내 법카!', '다 같이 원샷!', '해 뜨기 전엔 못 가'] },
});
MID_KITS.hw_reaper = [['volley', '명부 낭독', { n: 2, st: 'slow', sec: 3, cut: 0.3, art: 'paper', rage: { n: 3 } }], ['summon', '원귀 호출', { types: ['hw_ghost'], n: 2 }]];
BOSS_KITS.hw_dracula = { name: '드라큘라 사장', rageSub: '박쥐 변신 · 흡혈 회식 · 피의 와인이 세 명에게', skills: [['charm', '"회식 빠지면 해고야!"', { n: 2, sec: 2.2, rage: { n: 3 } }], ['volley', '피의 와인 건배', { n: 2, st: 'poison', sec: 3.5, art: 'bottle', rage: { n: 3 } }], ['summon', '박쥐 비서단', { types: ['hw_bat'], n: 4 }], ['door', '관 뚜껑 내려찍기', { frac: 0.035, rage: { frac: 0.05 } }]], p2: ['heal', '흡혈 회식', { r: 260, frac: 0.1 }] };
ECAST.bump.hw_seed = 4;
Object.assign(ENEMY_ATK, { hw_zombie: 'bottle', hw_pumpkin: 'headbutt', hw_seed: 'headbutt', hw_bat: 'slap', hw_ghost: 'slap', hw_witch: 'bag', hw_jiangshi: 'punch', hw_mummy: 'bag', hw_reaper: 'phone', hw_dracula: 'punch' });
Object.assign(SHORT_NAME, { hw_zombie: '좀비 회식러', hw_pumpkin: '호박머리', hw_ghost: '단톡 귀신', hw_witch: '마녀 다단계', hw_jiangshi: '강시 꼰대', hw_mummy: '미라 부장', hw_reaper: '저승 팀장', hw_dracula: '드라큘라' });
// ─── 진상 기술 설명 (10/08 진상 리메이크): 정보 카드 · 도감 · 등장 진상 · 상성 경고가 같은 데이터로 ───
//  [{ name, st(EST 키), text, counter: [멤버] }] — 예고(표적)가 있는 기술은 "예고" 를 붙인다 (그때 기절 · 밀치기로 끊긴다)
const KIND_ST = { stun: 'stun', silence: 'silence', slow: 'slow', shock: 'stun', drain: 'slow', flyer: 'blind', lure: 'door', vip: 'heal', summon: '', charm: 'charm', door: 'door', heal: 'heal' };
const KIND_TEXT = { stun: (o) => `예고 뒤 멤버 ${o.n || 1}명 기절 ${o.sec}초`, silence: (o) => `멤버 전원 스킬 침묵 ${o.sec}초`, slow: (o) => `멤버 공격 속도 −${Math.round((o.cut || 0.25) * 100)}% ${o.sec}초`, shock: () => '날아가던 공격을 지우고 부하 보호막', summon: (o) => `부하 ${o.n || 2}명 소환`, drain: () => '경험치를 빼앗는다',
  volley: (o) => `예고 뒤 멤버 ${o.n}명에게 던짐 → ${EST[o.st] ? EST[o.st].name : ''} ${o.sec}초 + 쓰러짐 게이지`, charm: (o) => `예고 뒤 멤버 ${o.n}명 홀림 ${o.sec}초`, door: (o) => `예고 뒤 입구 강타 (최대 내구도 ${Math.round(o.frac * 100)}%)`, heal: (o) => `곁의 진상 체력 ${Math.round(o.frac * 100)}% 회복`,
  flyer: (o) => `예고 뒤 멤버 ${o.n}명 사거리 −${Math.round(o.cut * 100)}%`, lure: () => '진상을 한 줄로 모아 입구로 우르르', vip: (o) => `앞줄 진상 ${o.n}명 보호막` };
export function enemySkills(id) {
  const d = ENEMIES[id];
  if (!d) return [];
  const out = [], add = (name, st, text) => { if (!out.some((x) => x.name === name)) out.push({ name, st, text, counter: (EST[st] && EST[st].counter) || [] }); };
  if (d.kick) add(d.kick.name, 'door', d.selfBoom ? `입구 앞에서 ${d.kick.wind}초 도화선 → 펑! (입구 ×${d.kick.mul} · 자기도 터진다) — 도화선 동안 기절 · 밀치기로 끊긴다` : `입구 앞에서 ${d.kick.wind}초 다리를 젖혔다가 쾅 (입구 ×${d.kick.mul}) — 젖힐 때 기절 · 밀치기로 끊긴다`);
  if (d.spit) add(d.spit.name, d.spit.st, `예고 뒤 멤버에게 던짐 → ${EST[d.spit.st].name} ${d.spit.sec}초 + 쓰러짐 게이지`);
  if (d.puke) add(d.cry ? '눈물 웅덩이' : '우웩!', d.cry ? 'slow' : 'poison', d.cry ? '예고 뒤 멤버 발밑에 눈물 웅덩이 (공속↓)' : `예고(꿀렁) 뒤 멤버에게 토 → 독 ${d.puke.poison || 0}초 + 웅덩이 (공속↓)`);
  if (d.bottle) add('소주병 투척', 'slow', '예고 뒤 멤버 공속 −25%');
  if (d.latte) add('라떼 훈계', 'silence', '가까이 오면 예고 뒤 라떼 잔 → 멤버 스킬 침묵 3초 · 곁 멤버 공속↓ — 기절시키면 조용');
  if (d.flash) add('찰칵!', 'stun', '예고(찰칵 준비) 뒤 가까운 멤버 1초 기절');
  if (d.golf) add('나이스 샷!', 'stun', `예고 뒤 골프공 → 멤버 기절 ${d.golf.stun}초`);
  if (d.rumor) add('뒷담화', 'slow', '멀리 서서 예고 뒤 말풍선 → 멤버 공속↓');
  if (d.sarcasm) add('돌려까기', 'slow', '예고 뒤 부메랑 → 멤버 피해↓ (말빨 멤버는 되받아침)');
  if (d.paper) add('차용증 투척', 'slow', '예고 뒤 멤버 공속↓');
  if (d.duck) add('오리고기 투척', 'poison', `예고 뒤 멤버 기절 ${d.duck.stun}초 + 독 (식중독)`);
  if (d.toss) add(d.toss.text.replace(/!$/, ''), d.toss.slow ? 'slow' : 'stun', '예고 뒤 멤버에게 던짐');
  if (d.snowball) add('눈덩이', 'freeze', `예고 뒤 멤버 빙결 ${d.snowball.sec}초`);
  if (d.charm) add('홀림', 'charm', `가까이 오면 ${d.charm === 'f' ? '여자' : d.charm === 'm' ? '남자' : ''} 멤버를 홀린다 (정소영이 덱에 있으면 면역)`);
  if (d.grab) add('붙잡기', 'stun', '입구에 닿으면 멤버를 붙잡아 못 쏘게 한다');
  if (d.sing) add('음 이탈', 'slow', '숨 들이쉬고(예고) 곁 멤버 공속↓');
  if (d.hotpack) add('온기 훔치기', 'slow', '옆을 지나간 멤버 공속↓');
  if (d.interest) add('이자 붙었다!', 'door', '살아 있는 동안 입구를 % 로 떼어 간다 (잡으면 돌려받음)');
  if (d.slam) add('땅 내려치기', 'stun', '예고 뒤 멤버 전원 기절');
  if (d.kneel) add('무릎 꿇어!', 'stun', `멤버 1명 기절 ${d.kneel.stun}초`);
  if (d.avalanche) add('눈사태', 'freeze', '크게 예고 뒤 멤버 전원 빙결 + 입구 피해 — 예고 중 스킬로 끊긴다');
  if (d.speech) add('끝없는 축사', 'door', '무적 축사 — 게이지를 채워 끊지 못하면 입구 피해 + 졸음');
  if (d.quiet) add('소음 금지!', 'silence', '예고 뒤 넓은 범위 멤버 스킬 침묵 — 예고 중 기절로 끊긴다');
  if (d.eat || d.feast || d.praise || d.cuddle) add(d.eat ? '냠냠' : d.feast ? '오리고기 회식' : d.praise ? '칭찬' : '꽁냥꽁냥', 'heal', '진상 체력 회복 — 방깎 · 화상으로 회복을 막자');
  if (d.hw) { const h = d.hw; // 할로윈 이벤트 진상 기술 (hw-sim.js)
    if (h.revive) add('한 잔 더! (부활)', 'heal', `쓰러지면 ${h.revive.sec}초 뒤 체력 ${Math.round(h.revive.hp * 100)}% 로 일어난다 — 화상 · 검열 · 장미 표식이 붙어 있거나 일어나는 동안 때리면 못 일어남`);
    if (h.split) add('호박씨 분열', '', '쓰러지면 빠른 호박씨 둘로 쪼개진다 — 범위 공격으로 한 번에');
    if (h.drain) add('입구 흡혈', 'door', '입구에 붙으면 입구를 빨아먹고 그만큼 회복 — 범위 공격 · 홍정민 수리');
    if (h.phase) add('유령화', '', `${h.phase.every}초마다 ${h.phase.sec}초 동안 안 보이고 안 맞는다 — 운영진 · 건전남 · 배현경이 찾아낸다`);
    if (h.brew) add('건강 물약', 'heal', `곁 진상 체력 ${Math.round(h.brew.frac * 100)}% 회복 — 여지원 방깎 · 박나영 화상 · 고아라가 막는다`);
    if (h.hop) add('콩콩 뛰기', '', '뛰는 동안엔 밀치기 · 끌어당기기가 안 먹힌다');
    if (h.rewrap) add('붕대 재감기', '', `체력 절반에서 보호막 ${Math.round(h.rewrap.frac * 100)}% (한 번) — 운영진 레드카드 · 여지원이 깬다`);
    if (h.list) add('야근 명부', 'stun', `멤버 한 명 이름을 적고 ${h.list.sec}초 뒤 강제 퇴근 (쓰러짐) — 팀장을 기절 · 빙결 · 밀치거나 건전녀 응급 방패로 지운다`);
    if (h.batform) add('박쥐 변신', '', '분노하면 박쥐 떼로 흩어져 잠깐 무적 → 다른 자리에 나타난다');
    if (h.moon) add('보름달', '', `체력 ${Math.round(h.moon.at * 100)}% 아래: 진상 전부 빨라지고 박쥐가 살아 있으면 사장이 회복`);
  }
  if (ECAST.bump[id]) add('들이받기', 'door', '입구에 처음 닿을 때 앞 멤버를 들이받는다 (쓰러짐 게이지) — 감속 · 기절로 늦추면 안 받힘');
  const kit = BOSS_KITS[id] || (MID_KITS[id] ? { skills: MID_KITS[id] } : null);
  if (kit) for (const [kind, name, o] of [...kit.skills, ...(kit.p2 ? [kit.p2] : [])]) { const st = kind === 'volley' ? o.st : KIND_ST[kind]; add(name, st, (kit.p2 && kit.p2[1] === name ? '[분노] ' : '') + (KIND_TEXT[kind] ? KIND_TEXT[kind](o) : '')); }
  return out;
}
