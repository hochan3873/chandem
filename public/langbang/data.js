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
export const GROW = { need: 2.3, card: 1.65, lv: 0.25 };
// 주력: 한 판에 Lv5(진화)까지 키울 수 있는 멤버는 2명 — Lv3 을 넘기는 레벨 카드를 먼저 고른 두 명이 주력 · 나머지는 Lv3 까지
//   (스테이지 · 헬 · 주간 도전만 · 탑은 혼자라 · 대전 · 레이드 · 무한은 따로 맞춘 모드라 그대로)
export const MAIN = { n: 2, cap: 3 };
export const JOIN = { free: [4, 10], freeUntil: 13, solo: 1.6, freePick: true, hp: [0.9, 0.87, 1.2, 1.25, 1.7, 2.3], hellStart: 2, exp: [0.12, 0.2, 0.3, 0.42, 0.65], expLate: 1.04, w: 12, guarantee: 3, invest: 0.5, investMax: 3 };
// ─── 전투 템포 (느리고 묵직하게) · 무기 정체성 ─── opt.tempo 로 켠다 (합류 모드와 같이)
// 진상 수 ×0.6 · 한 명 체력 ×1.6 / 멤버 공속 ÷1.54 · 한 방 ×1.6 / 스킬 쿨 ×1.5
// 기세 (팀 공용 스킬 칸): 3칸 · 7초마다 1칸 · 처치 +2% · 콤보 10마다 +10% · 스킬 1칸 · 총공지 2칸 (+원래 게이지)
//   스킬 두 개는 0.6초 안에 연달아 못 나간다 (두 번째는 줄 서서 0.6초 뒤) · 쓴 멤버는 쿨의 40% 동안 기진맥진 (공속 −30%)
export const MOMENTUM = { max: 300, per: 100, refill: 7, kill: 2, combo10: 10, ult: 200, gap: 0.6, tired: 0.4, tiredSpd: 0.7, skillDmg: 1.35,
  strong: ['sunggu', 'hanna', 'myunghoon', 'bangjang', 'gunman', 'dohoon', 'jieun', 'hochan'], strongCd: 2 }; // 강한 범위 스킬 8개는 쿨 ×2 (나머지 ×1.5)
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
  gunman: { wind: 0.08, back: 0.03, sq: 0.02, snap: 0.05 }, // 새총 연사
  jungmin: { wind: 0.28, back: 0.14, sq: 0.06, snap: 0.22, lift: 10 }, // 머리 위로 크게
  ara: { wind: 0.3, back: 0.1, sq: 0.1, snap: 0.25, lift: 12 }, // 두 손 망치
  baul: { wind: 0.2, back: 0.06, sq: 0.06, snap: 0.16, lift: 4 }, // 보드 돌진: 웅크렸다 → 박차고 나간다 (띠가 없을 때만)
  _heavy: { wind: 0.28, back: 0.12, sq: 0.1, snap: 0.18, lift: 6 }, _lob: { wind: 0.22, back: 0.1, sq: 0.05, snap: 0.16, lift: 6 },
  _burst: { wind: 0.12, back: 0.06, sq: 0.03, snap: 0.1 }, _rapid: { wind: 0.08, back: 0.03, sq: 0.02, snap: 0.05 }, _melee: { wind: 0.18, back: 0.1, sq: 0.06, snap: 0.2 },
  _default: { wind: 0.16, back: 0.07, sq: 0.04, snap: 0.12 },
};
// 멤버 공격 프레임 띠 (선택): 8칸 · release 칸에서 투사체가 나간다 — 있으면 코드 모션 대신
// 던지는 칸: 기본 4 · PixVerse 띠는 칸마다 달라서 따로 (2~6칸 중 모습이 제일 크게 바뀌는 칸을 재서 정함)
export const ATTACK_RELEASE = { soyoung: 3, baul: 3, eunok: 3, jieun: 3, gunnyeo: 4, hyungyeong: 4, hanna: 5, donghan_on: 5, ingyu_bike: 3 };
// 변신 모습 공격 띠: h_<id>_<form>_attack.webp — donghan 진심 모드(alt) · ingyu 할리 타는 동안
export const HERO_ANIM_FORM = Object.fromEntries([['donghan', 'on'], ['ingyu', 'bike'], ['hyungyeong', 'slim'], ['ara', 'old'], ['jieun', 'demon'], ['eunok', 'rage'], ['youngjun', 'dash']].map(([id, f]) => [id, { form: f, src: `/img/lb/h_${id}_${f}_attack.webp`, frames: 8, release: ATTACK_RELEASE[id + '_' + f] || 4 }]));
export const HERO_ANIM = Object.fromEntries(['ara', 'bangjang', 'dohoon', 'donghan', 'gunman', 'hochan', 'ingyu', 'jungmin', 'junseo', 'junyoung', 'myunghoon', 'sanghwa', 'staff', 'sunggu', 'wonsik', 'youngjun',
  'gunnyeo', 'soyoung', 'eunok', 'hyungyeong', 'jieun', 'jiwon'].map((id) => [id, { src: `/img/lb/h_${id}_attack.webp`, frames: 8, release: ATTACK_RELEASE[id] || 4 }])); // 모든 멤버 띠 있음 (코드 모션은 띠가 못 올 때 대신)
export const TEMPO = { proj: 0.32, count: 0.6, hp: 1.5, hellHp: 1.0, hellCh: [2.8, 1.0, 0.6, 0.5, 0.36, 0.29], endHp: 1.1, fix: { gunnyeo: 1.25, donghan: 1.4, wonsik: 2.4, staff: 1.1, eunok: 1.2, myunghoon: 1.28, bangjang: 0.92, soyoung: 1.9, junyoung: 1.5, ingyu: 0.95, jiwon: 2.0, jungmin: 1.7, gunman: 0.85, junseo: 2.8, ara: 1.65, jieun: 1.85, baul: 1.65, sanghwa: 1.7, hanna: 1.12 }, rate: 1 / 1.3, dmg: 1.35, cd: 1.5 };
// 이호찬 (템포): 기본 공격 없이 게이지 → 막차 버스가 자기 줄을 달려 올라가며 진상을 밀어낸다 · Lv5 기절 · 진화 = 2층 버스 (두 줄 폭)
export const BUS = { sec: [6.4, 6, 5.6, 5.2, 4.8], w: 110, w2: 200, speed: 560, kb: 90, dmg: 9, stun: 0.9 }; // (템포에선 버스가 '랑방을 위하여' 팀 버프도 건다: LEGEND 가 혼자 캐리보다 팀을 키우게)
// 투사체 그림 (fx/w_<이름>.webp · 오른쪽을 보는 그림 → 날아가는 방향으로 돌림) — 없으면 코드로 그린 모양
export const PROJ_ART = { staff: 'card_y', eunok: 'cup', jungmin: 'bottle', sanghwa: 'coin', wonsik: 'dumbbell', ingyu: 'dumbbell', soyoung: 'bubble', gunman: 'bb', donghan: 'coffee', sunggu: 'cane', jiwon: 'mosaic', gunnyeo: 'heart', junyoung: 'chip', ara: 'hammer', jieun: 'clock', myunghoon: 'swear' };
export const PROJ_ART_NAMES = ['bottle', 'cup', 'coin', 'dumbbell', 'bubble', 'card_y', 'card_r', 'bb', 'coffee', 'cane', 'mosaic', 'heart', 'chip', 'hammer', 'claw', 'clock', 'swear'];
// 무기: 멤버마다 컨셉 물건 하나 (총 없음) · kind = 방식 · mag = 한 번에 몇 발 (연발·속사) · gap = 탄창 안 간격 (공격 간격 비율)
//   장전 시간 = 탄창 × 간격 − (탄창−1) × gap 간격 → 평균 DPS 는 그대로, 리듬만 "몇 발 → 장전"
//   진화: Lv3 탄창 +1 · Lv5 관통 +1 (연발·속사) 또는 범위 +25% · 진화 카드 = 큰 투사체
export const WEAPON = {
  bangjang: { item: '확성기 지시', kind: 'melee', reload: '목 가다듬기' },
  staff: { item: '옐로·레드카드', kind: 'burst', mag: 2, gap: 0.3, reload: '수첩 넘기기' },
  gunman: { item: '장난감 새총 BB알', kind: 'rapid', mag: 6, gap: 0.45, reload: '고무줄 다시 감기' },
  gunnyeo: { item: '하트 폭탄', kind: 'lob', reload: '구급상자 열기' },
  myunghoon: { item: '욕 "#@!%"', kind: 'chain', reload: '숨 고르기' },
  dohoon: { item: '마이크 떼창', kind: 'aura', reload: '물 한 모금' },
  ingyu: { item: '할리', kind: 'pierce', reload: '시동 걸기' },
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
  jieun: { item: '시계 초침', kind: 'chain', reload: '태엽 감기' },
  sanghwa: { item: '동전', kind: 'burst', mag: 3, gap: 0.3, reload: '지갑 꺼내기' },
  jungmin: { item: '소주병', kind: 'lob', reload: '새 병 따기' },
  jiwon: { item: '모자이크 손', kind: 'pierce', reload: '손 풀기' },
  wonsik: { item: '덤벨', kind: 'heavy', reload: '덤벨 다시 들기' },
  jeongseob: { item: '두 팔', kind: 'melee', reload: '앉아서 쉬기' },
  byunghwa: { item: '목소리', kind: 'beam', reload: '숨 고르기' },
  baul: { item: '스노보드', kind: 'board', reload: '보드 정비' },
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
export function metaCost(lv) {
  return Math.round((40 * Math.pow(lv + 1, 1.7)) / 10) * 10;
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
export const STAGE_COUNT = 70;
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
//  (1-4 부터는 ★★★ 에 스테이지 미션도 필요 — 미션을 못 하면 ★★)
export function starsFor(hpFrac, mission = true) { return hpFrac >= 0.7 ? (mission ? 3 : 2) : hpFrac >= 0.35 ? 2 : 1; }

// 난이도 숫자 (밸런스 스크립트 scripts/lb-balance.js 로 맞춘 값)
export const STAGE = {
  levelPerStage: 0.55, levelPow: 0.8, wavePerStage: 0.08,
  chapterAdd: [0, 0.8, -0.3, 0.1, 0.2, 0.8], // (주력 · 큰 카드 개편: 레벨업이 줄어든 만큼 3~6장 −0.3/−0.5/−1/−1) · 2챕터부터 동료가 2명이라 그만큼 더 단단하게 (첫 웨이브 난이도 = 1 + 1.1 × (s-1)^0.8 + 챕터 보정)
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
  stageAdd: {3: 2.5, 4: 3.5, 5: -2, 6: -4, 7: 1.5, 8: 3.6, 9: -0.8, 10: 1.2, 11: -1.6, 12: 1.2, 13: 0.8, 14: 9.5, 15: -6, 16: 1, 17: 1, 18: 4.25, 19: 1.29, 20: 1.89, 21: 6.75, 22: -0.94, 25: 3.5, 26: 1.7, 27: 2, 28: -9.75, 29: -7, 30: 2.25, 31: -7.63, 32: -3, 33: 3.97, 34: -7.5, 35: 8.88, 36: -9.25, 37: 2.25, 38: 4.5, 39: -11.5, 40: -7.1, 41: 2.25, 42: 2.75, 43: 5.75, 44: -8.69, 45: 6.69, 46: 2.5, 47: 8.88, 48: -2, 49: -1.25, 50: 5.25, 51: -5.7, 52: 8.5, 53: 3.5, 54: -4.69, 55: 7.13, 56: -9.69, 58: 4.38, 59: 7.1, 60: -3.55}, // 챕터 끝 보스 바로 앞 스테이지는 살짝 더
  augAdd: 2, // 증강(1·3·4웨이브)이 생겨서 진상도 그만큼 조금 세게
  themeLevel: { violent: -1.2 }, // 폭력형 스테이지는 단단한 적이 많아서 조금 낮게 // 나머지 계열 비중
};
// ── 7장 스키장 MT: 난이도 숫자 (기존 1~6장 값은 그대로 · 이 블록만 7장) — scripts/lb-balance.js ch7 로 맞춘 값 ──
//   목표: 한 명만 키운 덱 < 30% · 역할을 갖춘 T3/T4 강화 덱 50~70% · 키운 LEGEND 포함 덱은 그보다 높게 · 헬은 더 어렵게
export const CH7 = { chapterAdd: 0, boss: [-3.5, -4.5], deckHp: 1.8, hpTune: 0.76, /* (0.84 → 0.76: 문동한 한 방 하향만큼 역할 덱이 비슷하게) */ swarm: 3.0, chHp: 0.8, joinHp: 2.6, hellCh: 0.75,
  stageAdd: { 61: 3.9, 62: 0.5, 63: -3, /* (-4.5 → -3: 펜션 사장님 중간 보스가 7-5 보스로 빠진 만큼) */ 64: -9, 65: 0.5, 66: -0.2, 67: 6.5, 68: -0.8, 69: -8.5, 70: 0 }, waveAdd: [-4, -2, 0, -1.5, 1],
  coldTier: [1, 1.4, 1.2, 1, 0.75, 0.45], thaw: 2 }; // thaw: 눈덩이 빙결이 풀린 뒤 2초는 다시 안 언다 // 겨울 산 적응: 등급이 높은 멤버일수록 빙결 · 침묵 · 추위(공속↓)가 짧다 (T1 ×1.3 … LEGEND ×0.55) // waveAdd: 첫 웨이브(대장 혼자)는 덜 · 뒤 웨이브와 보스는 더
STAGE.chapterAdd[6] = CH7.chapterAdd; STAGE.bossStage[7] = CH7.boss; STAGE.deckHp[6] = CH7.deckHp; STAGE.hpTune[6] = CH7.hpTune; STAGE.swarm[6] = CH7.swarm;
Object.assign(STAGE.stageAdd, CH7.stageAdd);
STAGE.waveAdd = Object.assign(STAGE.waveAdd || {}, { 7: CH7.waveAdd });
BAL.chHp[7] = CH7.chHp; JOIN.hp[6] = CH7.joinHp; TEMPO.hellCh[6] = CH7.hellCh;
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
  const B5 = [null, ['boss_loan'], ['boss_gapjil'], ['boss_union', 'boss_thug'], ['boss_kkondol'], ['boss_sales'], ['boss_jusa'], ['mid_pension']];
  const B10 = [null, ['queen'], ['boss_bbikki', 'boss_gapjil'], ['boss_inpi', 'boss_union'], ['boss_queenmom', 'boss_kkondol'], ['boss_otaku', 'boss_sales'], ['boss_soloparty', 'boss_jusa'], ['boss_resort', 'mid_pension']]; // 7-10: 회장 + 펜션 사장님 다시
  if (n === 5) return B5[ch] || [];
  if (n === 10) return B10[ch] || [];
  return [];
}
// 스테이지 보스 체력 배율 [첫 보스, 둘째 보스] — 보스를 바꾼 스테이지만 예전 난이도에 맞춤 (scripts/lb-balance.js deck · ch7)
export const STAGE_BOSS_HP = { 25: [0.5, 1], 30: [1, 0.4], 70: [1, 0.15] }; // 3-5 · 3-10 진상 연합 회장(기술이 세서 체력은 낮게) · 7-10 다시 나온 펜션 사장님
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
];
export function stageFx(s) { return MAP_FX[STAGE_FX[s - 1] || 'none']; }

// ─── 스테이지 조건: 강화만으로는 못 뚫게 — 덱 구성(역할)이 중요해지는 진상 기믹 (1~6장 중후반 · 헬) ───
//  보호막(연타 · 깨기) ↔ 철갑(큰 한 방 · 방어 무시) · 은신(찾아내기) · 기절 예고(해제 · 면역) · 떼거리(범위) · 문 돌격(수리 · 탱커 · 감속)
//  한 스테이지에 1~3개 → 역할 2~3개가 필요. 7장은 자기 기믹(빙결 · 침묵 · 눈사태)이 따로 있어서 여기엔 없음
export const COND = {
  shield: { id: 'shield', icon: 'tw_shield', name: '보호막 진상', short: '보호막', tip: '보호막 진상: 겹이 남아 있으면 피해 −90% · 한 방에 한 겹씩 벗겨져요 → 연타 · 운영진 경고장 · 여지원이 잘 깨요',
    counter: ['staff', 'jiwon', 'gunman', 'youngjun', 'soyoung', 'myunghoon', 'hanna', 'sanghwa'], breaker: ['staff', 'jiwon'], frac: 0.22, layers: [2, 3], cut: 0.9, regen: 4 },
  stealth: { id: 'stealth', icon: 'tw_dark', name: '숨은 진상', short: '은신', tip: '숨은 진상: 길 ¾ 까지 안 보이고 입구를 두 배로 쳐요 → 운영진 · 건전남 · 배현경이 먼저 찾아내요',
    counter: ['staff', 'gunman', 'hyungyeong'], frac: 0.15 },
  cc: { id: 'cc', icon: 'tw_curse', name: '기절 예고', short: '기절', tip: '기절 예고: 진상이 기를 모았다가(1초) 제일 센 멤버를 기절 · 침묵 · 홀림 → 건전녀(간호 · 응급 방패) · 김도훈이 풀고 강성구 · 강병화 곁은 막아요 · 도발 탱커(정원식)가 대신 맞아요 · 기 모을 때 기절시키면 끊겨요',
    counter: ['gunnyeo', 'dohoon', 'sunggu', 'byunghwa', 'wonsik'], every: [7, 5.5], windup: 1.0, stun: 3, silence: 4, charm: 2.6, react: 0.6, reactCd: 4, singCut: 0.6 }, // react: 건전녀가 있으면 0.6초 만에 풀어 줌 (4초에 한 번) · singCut: 김도훈 떼창 곁 40% 짧게
  armor: { id: 'armor', icon: 'tw_titan', name: '철갑 진상', short: '철갑', tip: '철갑 진상: 한 방마다 피해가 크게 깎여요 → 한 방이 큰 멤버 · 건전남(방어 무시)',
    counter: ['ara', 'sunggu', 'gunman', 'donghan', 'hyungyeong', 'wonsik', 'eunok', 'hochan'], frac: 0.3, armor: [0, 6, 10, 14, 18, 22, 26] },
  swarm: { id: 'swarm', icon: 'tw_swarm', name: '떼거리', short: '떼', tip: '떼거리: 약한 진상이 훨씬 많이 → 범위 공격',
    counter: ['eunok', 'donghan', 'soyoung', 'sunggu', 'hyungyeong', 'dohoon', 'gunnyeo', 'byunghwa', 'baul'], count: 1.5, hp: 0.6 },
  rush: { id: 'rush', icon: 'tw_rush', name: '문 돌격', short: '돌격', tip: '문 돌격: 빠른 돌격 진상이 입구에 쾅 부딪혀요 (감속 · 기절에 걸리면 넘어짐) → 수리(홍정민 · 김도훈) · 탱커(정원식 · 백인규 오토바이 · 윤정섭) · 감속',
    counter: ['jungmin', 'dohoon', 'wonsik', 'ingyu', 'jeongseob', 'staff', 'jieun'], frac: 0.28, spd: 1.4, atk: 1, crash: [0.025, 0.03, 0.035, 0.04, 0.045, 0.05], off: 0.5 }, // 빠른 진상은 원래 입구를 세게 · 빨리 친다 · crash: 처음 부딪힐 때 입구 최대의 % (감속 · 기절에 걸리면 넘어져서 안 부딪힘)
};
export const COND_IDS = Object.keys(COND);
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
export const REC_META = [4, 7, 10, 12, 14, 16, 18];
export const META_SOFT = { over: 0.5, hellAdd: 4 };
export const recMeta = (s, hell) => REC_META[Math.max(0, Math.min(REC_META.length - 1, chapterOf(s || 1) - 1))] + (hell ? META_SOFT.hellAdd : 0);
export function softMeta(m, s, hell) { const r = recMeta(s, hell); return m > r ? r + (m - r) * META_SOFT.over : m; }
// 스테이지 미션 (★★★ = 입구 70% 이상 + 미션) — 조건에 맞는 역할이 있어야 깨기 쉽다. 1-1 ~ 1-3 은 미션 없음 (입구 70% 면 ★★★)
//  stat: 판에서 세는 숫자 · max: 이하 / min: 이상 (장별 값)
export const MISSIONS = {
  rush: { stat: 'endDoor', min: [0.9, 0.95, 0.95, 0.95, 0.95, 0.95], text: (n) => `입구 ${Math.round(n * 100)}% 이상 남기기` },
  shield: { stat: 'breaks', min: [4, 6, 12, 20, 25, 25], text: (n) => `보호막 한 번에 깨기 ${n}번` },
  stealth: { stat: 'found', min: [0.85, 0.85, 0.85, 0.85, 0.85, 0.85], pct: true, text: (n) => `숨은 진상 ${Math.round(n * 100)}% 미리 찾기` },
  cc: { stat: 'ccSec', max: [16, 16, 24, 32, 26, 28], text: (n) => `기절 · 홀림 합계 ${n}초 이하` },
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
const ART_READY = new Set(['h_jungmin', 'h_junyoung', 'h_soyoung', 'h_jieun', 'h_jieun_demon', 'h_sanghwa']);
const ART = (n) => (ART_READY.has(n) ? `/img/lb/${n}.webp` : '');
export const NO_DEX_ART = new Set([]); // dex/<id>.webp 없음
export const NO_HQ_ART = new Set(['junyoung']); // dexhq/<id>.webp 없음
export const NO_DUO_ART = new Set([]); // dexhq/<id>_duo.webp 없음
export const HEROES = {
  bangjang: {
    id: 'bangjang', bossKit: 1, kit: 1, name: '방장', gender: 'm', emoji: '📢', color: '#f6b73c', attr: 'talk',
    img: '/img/lb/h_bangjang.webp', role: '리더 · 확성기 지시(지목) · 대장이면 모두 공속 +',
    dmg: 30, interval: 0.8, range: 340, proj: 'order', projSpeed: 900, // (부채꼴 음파 → 한 명 콕 집는 지시: 부채꼴은 강병화 고함만)
    order: { sec: 3, mul: [0.2, 0.2, 0.25, 0.25, 0.3], every: 4, n: 3, r: 120 }, // 지목: 모든 멤버에게 받는 피해 +% (3초) · Lv5 4번마다 근처 3명 한꺼번에
    aura: [0.08, 0.1, 0.16, 0.19, 0.26], // 모든 아군 공격 속도 +%
    attack: '확성기 지시 — 입구에 제일 가까운 진상을 콕 집어 "저 사람!" · 맞은 진상은 3초 동안 「지목」 (모든 멤버에게 받는 피해 +20%) · 대장(1번 칸)이면 모두 공속 +, 아니면 곁 멤버만 절반',
    desc: '확성기로 "저 사람!" 하고 콕 집어 준다. 방장이 찍은 진상은 모두가 더 세게 때리고, 곁에 있는 것만으로 모두의 손이 빨라진다.',
    perks: { 3: '지목 피해 +5%p · 오라 강화', 5: '4번마다 "전체 지시" — 근처 진상 3명을 한꺼번에 지목 · 지목 +5%p' },
    skill: { id: 'rally', name: '집합!', cd: 22, desc: '깃발을 꽂고 필드 전체 충격파 (보스 빼고 한 칸 밀기) · 8초 동안 모두 공격 속도 +50% (Lv4 +60% · Lv5 10초 +70%)', sec: [8, 8, 9, 9, 10], spd: [0.5, 0.5, 0.5, 0.6, 0.7] },
  },
  staff: {
    id: 'staff', bossKit: 0.9, kit: 1.0, name: '운영진', gender: 'f', emoji: '📋', color: '#5ab0ff', attr: 'talk',
    img: '/img/lb/h_staff.webp', role: '제어 · 보호막 깨기',
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
    img: '/img/lb/h_gunnyeo.webp', role: '멤버 간호 · 상태이상 해제 · 면역',
    dmg: 30, interval: 1.0, range: 300, proj: 'heart', projSpeed: 1, lobSec: 0.85, splash: 36,
    care: { every: [4.5, 4.5, 4, 4, 3.5], tired: [3, 3, 4, 4, 5], guard: [1, 1, 1.5, 1.5, 2], cheer: { sec: 3, spd: 0.25 } }, // 간호 (입구 수리는 홍정민 몫): [주기(초)] 마다 멤버 상태이상 전부 풀기 · 기진맥진 −초 · 풀어 준 멤버는 잠깐 면역(초) · 챙겨 준 멤버는 "힘내요!" 3초 공속 +25%
    attack: '하트 폭탄 — 가까이 온 진상에게 천천히 던지는 작은 폭탄. 진짜 가치는 간호: 틈틈이 멤버 상태이상을 전부 풀고 (풀린 멤버는 잠깐 면역) 스킬 쓰고 지친 멤버(기진맥진)를 일으킨다 · 챙겨 준 멤버는 "힘내요!" 3초 공격 속도 +25% (아픈 멤버가 없으면 제일 잘 싸우는 멤버에게)',
    desc: '다정한 간호사. 한 방은 약하지만 기절 · 홀림 · 침묵에 걸린 멤버를 제일 먼저 챙기고, 스킬 쓰고 지친 멤버에게 물 한 잔 건넨다.',
    perks: { 3: '간호가 더 자주 · 면역 더 길게 · 폭발 범위 +', 5: '모든 멤버 홀림 면역 ("철벽!")' },
    skill: { id: 'firstaid', name: '응급 방패', cd: 24, desc: '멤버 전원에게 하트 방패 — 상태이상 전부 해제 · 기진맥진도 풀림 · 5초 동안 상태이상 면역 (Lv3 6초 · Lv5 7초) · "힘내요!" 4초 공격 속도 +25% · 다른 멤버 스킬 쿨타임 −2초', imm: [5, 5, 6, 6, 7], cdCut: 2 },
  },
  // ── 해금 영웅 (스테이지를 깨면 합류) ──
  myunghoon: {
    id: 'myunghoon', bossKit: 0.8, kit: 1.05, name: '서명훈', gender: 'm', emoji: '🦊', color: '#e8a25a', unlock: true, attr: 'talk',
    img: '/img/lb/h_myunghoon.webp', role: '빠른 진상 사냥꾼 · 못 피하는 저주',
    dmg: 21, interval: 0.75, range: 330, proj: 'swear', projSpeed: 560,
    stun: [[0.22, 0.8], [0.24, 0.9], [0.27, 1.0], [0.3, 1.1], [0.34, 1.2]], // [기절 확률, 기절 시간(초)]
    bounces: [2, 2, 2, 3, 3], // 첫 적 다음에 튕기는 수 (총 3~5명)
    stunnedBonus: [1.5, 1.5, 1.5, 1.5, 2.0], // 기절한 적에게 피해 배율
    revealBonus: 2.0, // 사기꾼이 '들켰다!' 할 때 피해 배율
    attack: '욕 — 짧은 사거리, 진상 3~5명에게 번개처럼 튕기며 가끔 기절',
    desc: '실눈 뜬 티벳여우. "#@!%" 욕 한 방이면 진상이 얼어붙는다.',
    perks: { 3: '욕이 한 명 더 튕긴다', 5: '4발마다 "욕 폭탄" 범위 기절 · 기절한 적 피해 2배' },
    skill: { id: 'curse', name: '쌍욕 저격', cd: 20, desc: '가장 빠른 진상 5명을 조준해 저주 5발 · 2초 묶기 · 큰 피해 (보스는 보통)', r: [125, 125, 140, 140, 160], stun: [1.5, 1.5, 1.8, 1.8, 2.2], dmgMul: 1.5 },
  },
  dohoon: {
    id: 'dohoon', bossKit: 0.7, kit: 0.6, name: '김도훈', gender: 'm', emoji: '🎤', color: '#b58cff', unlock: true, attr: 'booze',
    img: '/img/lb/h_dohoon.webp', role: '떼창 오라 · 입구 지키기 · 제어',
    dmg: 56, interval: 1.35, range: [210, 210, 240, 240, 265], proj: 'wave', waveMax: 10, groove: { sec: 2, cut: 0.45 }, // 입구 수리는 홍정민 몫 → 회복을 빼고 떼창 −35% → −45% // (51 → 56: 회복을 줄인 만큼 술 범위 딜로) · 감속 대신 떼창에 빠져 입구를 덜 세게 친다 (감속은 오지은 · 운영진 몫)
    sing: { r: 170, spd: [0.13, 0.13, 0.18, 0.18, 0.23] }, // (반경 200 → 170: 덱 전체가 아니라 곁 멤버만) // 떼창: 곁(약 3.5칸) 멤버 공격 속도 +% (18~30 → 13~23: T2 가 LEGEND 만큼 판을 쉽게 만들어서)
    attack: '마이크 음파 — 둥글게 퍼지는 음파가 근처 진상 전부를 때린다 · 맞은 진상은 떼창에 빠져 2초 동안 입구를 덜 세게 친다 (−45%)',
    desc: '마이크를 절대 안 놓는 노래방 사나이. 떼창 한 번이면 진상도 같이 따라 부른다.',
    perks: { 3: '음파 범위 · 떼창 강화', 5: '떼창 최대 · 앵콜이 더 길다' },
    skill: { id: 'encore', name: '무한 앵콜', cd: 22, desc: '넓은 범위 진상이 춤추느라 멈춤 + 멤버 상태이상 전부 해제 + 5초 동안 멤버 전원 공격 속도 +25% · 피해 +15%', buffSec: 5, buffSpd: 0.25, buffDmg: 0.15, r: 290, dance: [3.4, 3.4, 3.7, 3.7, 4.2] }, // (입구 회복은 홍정민 몫 → 빼고 범위 250 → 290 · 멈춤 +0.4초)
  },
  ingyu: {
    id: 'ingyu', bossKit: 1.15, kit: 0.95, name: '백인규', gender: 'm', emoji: '🏋️', color: '#3f8cff', unlock: true, attr: 'power',
    img: '/img/lb/h_ingyu.webp', role: '돌진 탱커 · 오토바이로 밀어내기',
    dmg: 32, interval: 1.75, range: 420, proj: 'dumbbell', projSpeed: 1, lobSec: 0.5, splash: 34,
    moto: { every: [5, 5, 4, 4, 3], mul: 1.7, speed: 560, kb: 100, w: 36, daze: 0.4 }, // 덤벨 5번 → 자기 줄로 오토바이 돌진 (줄 위 진상 전부 크게 밀치고 0.4초 휘청) — 입구 피해 감소 · 도발은 정원식 몫
    noDrowsy: true, // 꼰대 라떼 잔소리에 안 졸린다 (운동 루틴)
    attack: '덤벨 — 느리지만 묵직하게 던져 떨어진 곳을 쾅. 5번 던지면 오토바이 돌진! 자기 줄 진상을 전부 치고 크게 밀어낸다',
    desc: '3대 500 헬창. 오토바이 시동이 걸리면 앞에 있는 진상은 전부 줄 밖으로 밀려난다. 꼰대 잔소리도 안 통함.',
    perks: { 3: '오토바이가 더 자주 (덤벨 4번)', 5: '오토바이 덤벨 3번마다 · 덤벨 범위 +' },
    skill: { id: 'harley', name: '부릉부릉 할리', cd: 22, desc: '커다란 할리를 타고 진상이 제일 많은 쪽으로 천천히 가로지른다 — 지나가는 3칸 폭 전부 계속 따끔 + 계속 밀어낸다 (보스는 안 밀림)', w: 174, sec: 3.5, tick: 0.25, mul: [0.27, 0.27, 0.3, 0.3, 0.36], kb: 20, slow: 0 },
  },
  donghan: {
    id: 'donghan', bossKit: 0.9, kit: 1.0, name: '문동한', gender: 'm', emoji: '😪', color: '#8fb3a0', unlock: true, attr: 'charm',
    img: '/img/lb/h_donghan.webp', imgOn: '/img/lb/h_donghan_on.webp', role: '간보기 · 한 방 폭발',
    dmg: 11, interval: 1.1, range: 320, proj: 'snack', projSpeed: 420, snackMeter: 3, // 과자가 맞으면 간보기 게이지 +3 (감속 대신: 간 보는 만큼 빨리 일어난다)
    meter: { base: [12.5, 13.4, 14.4, 15.4, 17.3], perNear: 1.4, nearY: 200, hpLow: 12 }, // 간보기 게이지 (초당)
    burst: { mul: 8.5, w: [48, 48, 56, 56, 66], windup: 0.6, rest: 1.2 }, // 가장 붐비는 줄에 두꺼운 빔
    attack: '과자 던지기 — 누워서 약한 과자를 휙 (맞힐 때마다 간보기 게이지 +3). 간보기 게이지가 차면 일어나서 한 줄 전체에 빔!',
    desc: '늘 귀찮은 간보는 사람. 누워만 있다가 "이제 좀 해볼까?" 한 방이면 한 줄이 싹 비워진다.',
    perks: { 3: '게이지 빨라짐 · 빔 두꺼워짐', 5: '게이지 최대 · 빔 제일 두껍게' },
    skill: { id: 'serious', name: '진심 모드', cd: 20, desc: '간보기 게이지 바로 가득 + 다음 빔 1.5배' },
  },
  youngjun: {
    id: 'youngjun', bossKit: 1.2, kit: 0.95, name: '김영준', gender: 'm', emoji: '🐆', color: '#7a4dff', unlock: true, attr: 'booze',
    img: '/img/lb/h_youngjun.webp', imgOn: '/img/lb/h_youngjun_dash.webp', role: '근접 돌격 · 초고속 연속 베기',
    dmg: 34, interval: 0.18, range: 350, proj: 'dash', outSec: [2.6, 2.6, 2.9, 2.9, 3.2], restSec: [2.4, 2.4, 2.1, 2.1, 1.8], reach: 70, // 0.14 · 3초/1.6초 → 0.18 · 2.6초/2.4초 (혼자 실효 DPS 158 → 98 · 고아라쯤)
    attack: '돌격 — 제일 몰린 곳으로 뛰어들어 초고속 연속 베기(가오 무시) 2.6초, 돌아와서 크로스핏으로 숨 고르기 2.4초',
    desc: '검은 고양이 후드를 쓴 파티 전사. 뛰어든 동안엔 아무것도 안 통한다. 한 명씩 확실하게 끝내는 타입.',
    perks: { 3: '돌격 2.9초 · 크로스핏 2.1초', 5: '돌격 3.2초 · 크로스핏 1.8초' },
    skill: { id: 'rush', name: '블랙 러시', cd: 20, desc: '지목한 적부터 최대 6명을 번개처럼 연속 돌파 · 큰 피해', n: [6, 6, 7, 7, 8], mul: 5 },
  },
  // ── HIDDEN ──
  eunok: {
    id: 'eunok', bossKit: 1.0, kit: 1.1, name: '최은옥', gender: 'f', emoji: '🍶', color: '#ff5a4f', hidden: true, attr: 'booze',
    img: '/img/lb/h_eunok.webp', imgRage: '/img/lb/h_eunok_rage.webp', role: 'HIDDEN · 술 마시면 분노 모드',
    dmg: 21, interval: 0.9, range: 390, proj: 'bottle', projSpeed: 1, lobSec: 0.55, splash: 55,
    soberSec: [14, 14, 13, 13, 11], rageSec: [8, 9, 10, 11, 12],
    rageDmg: 1.4, rageInterval: 0.45, fire: { sec: 2.2, r: 50, dps: 0.6 }, // 분노 중 불바다 (1발 피해 × 0.6 / 초)
    attack: '소주병 — 던지면 깨지며 범위 폭발, 분노 중엔 불바다',
    desc: '홀짝홀짝… 14초쯤 지나면 취해서 "분노 모드"가 된다.',
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
    img: '/img/lb/h_sunggu.webp', role: 'HIDDEN · 관통 · 기절 면역 오라',
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
    dmg: 32, interval: 1.25, range: 385, proj: 'gf', projSpeed: 560, ricochet: [4, 4, 5, 5, 5], ricoR: 150, ricoDecay: 0.88, kb: [22, 22, 26, 26, 30],
    attack: '여사친 소환 — 동글동글 여사친을 진상에게 밀어 넣으면 4~5명 사이를 핀볼처럼 튕기며 밀어내고 돌아온다',
    desc: '여자라면 사족을 못 쓰는 남자. "잠깐, 내 친구 소개해 줄게!" 여사친이 대신 진상들 사이를 굴러다닌다.',
    perks: { 3: '여사친이 한 번 더 튕긴다', 5: '여사친 둘이 같이 출동' },
    skill: { id: 'blinddate', name: '소개팅 주선', cd: 20, desc: '여사친 3명을 부채꼴로 한꺼번에! (더 세게 튕긴다)', n: [3, 3, 3, 4, 4], mul: 1.6 },
    shouts: ['소개해 줄게~', '내 친구 착해!', '연락처 교환 ㄱ?'],
  },
  hyungyeong: {
    id: 'hyungyeong', bossKit: 1.0, kit: 1.0, name: '배현경', gender: 'f', emoji: '🐻', color: '#ff9f5a', gacha: true, attr: 'power',
    img: '/img/lb/h_hyungyeong.webp', imgAlt: '/img/lb/h_hyungyeong_slim.webp', role: '은신 탐지 · 표시한 적 +25% · 통통 한 방 ↔ 날씬 잽',
    dmg: 60, interval: 1.95, range: 245, proj: 'slam', slamR: [80, 80, 92, 92, 104], kb: 36, // 통통: 묵직한 박치기 (피해 +35% · 넉백 ↑)
    taunt: 0.6, guard: { r: 55, cut: 0.12 }, // 몸집으로 막는다: 멤버 노리는 기술 대신 맞기(60% 시간) · 자기 줄 입구 피해 -12%
    diet: { perSlam: [21, 21, 23, 23, 26], perSec: 4, sec: [10, 10, 11, 11, 12], dmg: 0.4, interval: 0.2, range: 330, speed: 820, charmRes: 0.3 }, // 통통할 땐 홀림 70% 짧게 · 박치기 직후엔 면역
    attack: '몸통 박치기 — 느리지만 묵직하게 쿵! 주변 진상을 밀어낸다. 게이지가 차면 다이어트 주사 → 날씬 모드 초고속 연타',
    desc: '"오늘까지만 먹고 내일부터 다이어트!" 통통할 땐 홀림도 잘 안 먹히는 벽, 주사 한 방이면 복서로 변신. 10초 뒤엔… 요요!',
    perks: { 3: '박치기 범위 + · 날씬 모드 +1초', 5: '날씬 모드 제일 길고 박치기 제일 넓게' },
    skill: { id: 'dietshot', name: '다이어트 주사', cd: 22, desc: '바로 날씬 모드! 화면의 숨은 진상을 모두 드러내고 표시 (+25% 피해) · 이미 날씬하면 +4초' },
    shouts: ['내일부터 다이어트!', '요요 왔다…', '한 입만!'],
  },
  ara: {
    id: 'ara', bossKit: 1.45, kit: 0.9, name: '고아라', gender: 'f', emoji: '👸', color: '#ffc4ec', gacha: true, attr: 'booze',
    img: '/img/lb/h_ara.webp', imgAlt: '/img/lb/h_ara_old.webp', role: '보스 킬러 · 할머니일 땐 지팡이, 공주 변신 후 돌진해 한 방씩',
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
    buff: { per: 0.03, max: 0.3, sec: [3, 3, 4, 4, 4] }, // 맞힌 진상 1명마다 다른 멤버 공격력 +3% (최대 +30%)
    attack: '랑방을 위하여! — 느린 박자로 자기 줄 전체를 휩쓰는 황금 파동. 맞힐 때마다 멤버 공격력 ↑ · 줄 안 진상 버프 하나 벗김',
    desc: '랑방의 진짜 방장. 금빛 확성기로 "랑방을 위하여!" 외치면 한 줄이 통째로 정리되고, 멤버들은 힘이 난다. (누가 봐도 사기캐 — 1:1 대전에선 힘 ×0.7)',
    perks: { 3: '파동이 더 넓고 버프가 오래', 5: '파동이 한 번 더 울린다 (메아리)' },
    skill: { id: 'forlangbang', name: '막차 대행진', cd: 24, desc: '황금 버스 행렬이 모든 줄을 쓸어요 · 전부 밀치고 0.8초 기절 + 모든 멤버 공격력 +20% (5초 · Lv3 +25% · Lv5 +30%) · 기세 2칸', sec: [5, 5, 6, 6, 7], atk: [0.2, 0.2, 0.25, 0.25, 0.3], stun: 0.8 }, // (1.5초 기절 · +40~50% → 0.8초 · +20~30%: 스킬 한 번에 판이 끝나서. 대신 막차 버스(기본 공격) 피해 7.6 → 9)
    shouts: ['랑방을 위하여!', '방장 왔다!', '다들 모여!', '여긴 내가 지킨다'],
  },
  // ─── 새 멤버 4명 (모집 · 카드 10장) ───
  soyoung: {
    id: 'soyoung', bossKit: 0.95, kit: 1.05, name: '정소영', gender: 'f', emoji: '🗯️', color: '#ff8fb1', gacha: true, attr: 'talk',
    img: ART('h_soyoung'), role: '소환사 · 잔소리로 성준영 조종 (직접 공격 없음)',
    dmg: 30, interval: 0.95, range: 375, proj: 'nag', projSpeed: 520, noHit: true,
    nag: { heal: [0.075, 0.075, 0.09, 0.09, 0.11], call: [13, 13, 14, 14, 16], start: 60 }, // 잔소리 한 번에 성준영 체력 +% (최대 체력 대비) · 준영이 없으면 부르기 게이지 +% (100 = 등판) · 처음 게이지
    attack: '잔소리 — 진상은 안 때린다. 잔소리 한 번마다 성준영 체력이 차고 (공격 속도가 빠를수록 자주), 준영이 없으면 부르기 게이지가 차서 가득 차면 준영이 나온다',
    desc: '"그러니까 내가 뭐랬어!" 직접 싸우진 않는다. 잔소리로 성준영을 부려 진상을 쓸어 모으게 하고, 준영이 지쳐 쓰러질 것 같으면 또 잔소리로 일으켜 세운다.',
    perks: { 3: '잔소리 한 번에 준영 체력이 더 많이 찬다', 5: '준영이 더 튼튼하고 더 넓게 쓸어 모은다' },
    skill: { id: 'allincall', name: '올인 콜! 준영 등판', cd: 21, desc: '성준영을 바로 불러낸다 (이미 있으면 체력 가득) · 6초 동안 올인 모드 — 끌어모으는 범위 +50% · 한 번에 3명 더 · 쓸어 담기 피해 2배', sec: [6, 6, 6, 6, 7] },
    shouts: ['그러니까 내가 뭐랬어!', '준영아 나와!', '한 번만 더 말한다?', '준영아 똑바로 해!'],
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
    skill: { id: 'goodman', name: '좋은남자 박상화!', cd: 20, desc: '백 송이 장미 꽃다발을 제일 센 진상에게 던진다 — 지금까지 자란 만큼 더 아프다 (성장 +10%마다 피해 +20%) · 터지며 주변도 · 성장 한 번에 +12%', mul: [4, 4, 4.6, 4.6, 5.4], r: 80, growK: 2, grow: 0.12 }, // (모든 멤버 공격력 버프 → 성장형 한 방: 팀 공격력 버프는 이호찬 · 강병화 · 김도훈)
    lines: ['좋은남자 박상화!', '끝내주는남자 박상화!', '매너남 박상화!', '다정한남자 박상화!', '능력남 박상화!', '센스쟁이 박상화!', '완벽한남자 박상화!'],
    shouts: ['좋은남자 박상화!', '끝내주는남자 박상화!'],
  },
  jungmin: {
    id: 'jungmin', bossKit: 0.8, kit: 0.9, name: '홍정민', gender: 'm', emoji: '🩹', color: '#7fd88f', gacha: true, attr: 'booze',
    img: ART('h_jungmin'), role: '입구 수리 전담 · 꽉 차면 방패',
    dmg: 30, interval: 1.2, range: 265, proj: 'tap', projSpeed: 480, // (24 → 30: 술 멤버 기본 화력)
    repair: { every: 3.0, every5: 2.4, pct: [0.046, 0.046, 0.05, 0.05, 0.058] }, // 3초마다 입구 최대 내구도의 % 수리 (Lv5 2.4초) — 입구 수리는 이제 홍정민 몫 (건전녀는 멤버 간호)
    brace: { all: 0.25, crash: 0.5 }, // 보강: 있는 동안 입구 받는 피해 −25% · 돌격 진상 충돌 −50%
    attack: '거꾸로 든 소주병 — 약하게 툭. 대신 틈틈이 붕대를 떼어 입구에 탁탁 붙인다 (꽉 차면 방패로) · 있는 동안 입구 피해 −25% · 돌격 충돌 −50%',
    desc: '짧은 머리, 험한 눈매, 눈가에 소주병 흉터와 붕대. 무섭게 생겼는데 랑방 입구는 이 사람이 다 고친다.',
    perks: { 3: '수리량 +20%', 5: '수리가 더 자주 (2.4초마다)' },
    skill: { id: 'bandage', name: '붕대 대공사', cd: 24, desc: '입구 크게 수리 + 잠깐 입구가 받는 피해 -35%', heal: [0.32, 0.32, 0.38, 0.38, 0.46], sec: [8, 8, 9, 9, 10], armor: 0.35 },
    shouts: ['가만있어 봐, 붙여 줄게.', '이 정도는 금방이지.', '어디 또 깨졌냐?'],
  },
  jiwon: {
    id: 'jiwon', bossKit: 1.1, kit: 1.0, name: '여지원', gender: 'f', emoji: '🖕', color: '#e0304a', gacha: true, attr: 'talk',
    img: '/img/lb/h_jiwon.webp', role: '방깎 · 3줄 모자이크 폭격',
    dmg: 42, interval: 0.83, range: 365, proj: 'mosaic', projSpeed: 560,
    shred: { per: 0.09, max: 5, sec: 5 }, // 맞은 진상 방어 -6% × 최대 5겹 (5초) → 다른 멤버 피해도 같이 오른다 · 회복도 막는다
    attack: '모자이크 뻑큐 — 날아가는 모자이크 손, 맞은 진상 방어가 겹겹이 깎인다',
    desc: '착해 보이는 얼굴, 하지만 속엔 당찬 욕망이 가득. 오늘도 웃으며 모자이크 뻑큐를 날린다. "어머, 실수~"',
    perks: { 3: '방깎 +1겹 (최대 6)', 5: '방깎 한 겹 -8%' },
    skill: { id: 'mosaicbomb', name: '모자이크 폭격', cd: 22, desc: '두 손 번쩍! 검은 검열 띠가 지나가고 "삐—" — 거대 모자이크 손이 자기 줄과 양옆 줄을 차례로 쾅! 쾅! 쾅! 맞은 진상 피해 + 0.5초 기절 + 「모자이크」 5초 (방어 -40% · 모든 멤버에게 받는 피해 +25%)',
      wind: 0.6, gap: 0.18, w: 30, mul: [0.5, 0.5, 0.55, 0.55, 0.65], stun: 0.5, sec: 5, brkArmor: 0.4, brkDmg: 0.25 }, // 쌍뻑큐(1줄 · 1.1~1.45배 · 18초) → 3줄 × 0.5~0.65배 = 합계 약 ×1.35 · 22초
  },
  wonsik: {
    id: 'wonsik', bossKit: 0.8, kit: 0.9, name: '정원식', gender: 'm', emoji: '🏋️', color: '#6fae6f', gacha: true, attr: 'power',
    img: '/img/lb/h_wonsik.webp', role: '도발 탱커 · 피해 감소',
    dmg: 62, interval: 1.23, range: 305, proj: 'jab', projSpeed: 700,
    taunt: 0.4, // 도발: 멤버를 노리는 진상 기술을 대신 받는다 (40% 시간)
    guard: { r: 150, cut: 0.45, all: 0.25 }, // 곁의 진상이 입구를 칠 때 -45% · 나머지 입구 피해도 -25% (110·40% → 150·45% + 전체: 탱커가 입구를 확실히 지키게)
    attack: '헬스 잽 — 가까운 진상을 묵직하게 · 곁의 진상 공격을 대신 받아 준다 (곁 입구 피해 −45% · 나머지 −25%)',
    desc: '결혼을 꿈꾸는 마흔셋. 유일한 취미는 헬스. 따뜻한 마음으로 모두를 지켜 준다. "올해는 꼭…"',
    perks: { 3: '피해 감소 반경 +20%', 5: '결혼정보회사 등록이 1초 더' },
    skill: { id: 'marry', name: '결혼정보회사 등록', cd: 22, consult: { walk: 48, r: 220, pool: 0.18, poolLv: 0.06, sec: 10, cut: 0.2, reflect: 0.2, slow: 0.25 }, desc: '길 가운데로 걸어 나가 앉아서 결정사 상담 — 넓은 반경 진상이 입구 대신 원식을 친다 (원식 체력 = 입구의 18%+ · 받는 피해 -20% · 20% 되돌려 줌 · 곁 진상 25% 느리게) · 다 맞거나 10초 뒤 돌아와 쉰다', r: [260, 260, 280, 280, 300], sec: [4, 4, 4, 4, 5], shield: 0.1 },
  },
  baul: {
    id: 'baul', bossKit: 1.0, kit: 1.0, name: '송바울', gender: 'm', emoji: '🏂', color: '#7ad0ff', gacha: true, attr: 'charm',
    img: '/img/lb/h_baul.webp', role: '보드 조종 · 탭한 곳으로 돌진 (기본 공격 없음)',
    dmg: 44, interval: 1.15, range: 360, proj: 'board',
    board: { cd: [1.45, 1.45, 1.35, 1.35, 1.2], speed: 560, w: 24, mul: 1.5, chain: 0.85, kb: 22, daze: 0.35, reach: 300, uses: [6, 6, 7, 7, 8], fix: [3.4, 3.4, 3.1, 3.1, 2.6], aimT: 5 }, // (응원봉 → 보드) 짧은 쿨마다 돌진 · 길 위 진상 전부 (둘째부터 85%) · 살짝 밀침 · uses 번 타면 자리로 돌아가 fix 초 보드 정비
    attack: '스노보드 돌진 — 필드를 탭하면 그곳으로 보드를 타고 쭉 미끄러지며 길 위 진상을 전부 치고 지나간다 (탭 안 하면 진상이 많이 줄 선 쪽으로 알아서) · 몇 번 타면 자리로 돌아가 무릎 꿇고 보드 정비',
    desc: '앞머리 내린 아이돌상, 덧니 미소가 무기다. 설레발과 아는 척이 특기. "이거 내가 원래 알던 거야~" 하며 보드 하나로 골목을 휘젓는다.',
    perks: { 3: '보드가 더 멀리 · 썰매 피해 +15%', 5: '정비 전에 더 많이 탄다 · 부딪힌 진상 휘청 · 썰매가 두 번 지나간다' },
    skill: { id: 'sled', name: '팬클럽 썰매 활강', cd: 20, desc: '팬클럽이 끄는 썰매로 바울이 있는 줄과 양옆 줄까지 통째로 쓸고 내려간다 — 줄 위 진상 전부 큰 피해 + 크게 밀치기 (보스는 덜) · 팬클럽이 새 보드를 갖다 줘서 정비 끝 · 5초 동안 보드 쿨 +60% 빨리', w: 52, mul: [4.2, 4.2, 4.6, 4.6, 5.2], kb: 90, fan: { sec: 5, spd: 0.6 } }, // (폭 44 → 52: 양옆 줄까지 · 피해 ×1.15 · 밀치기 80 → 90 · 함성 새로)
    shouts: ['이거 내가 원래 알던 거야~', '내가 알지~', '팬클럽 출동!', '설레발 아니고 진짜야'],
  },
  byunghwa: {
    id: 'byunghwa', bossKit: 1.1, kit: 1.2, name: '강병화', gender: 'm', emoji: '🎤', color: '#ff7ab8', legend: true, gacha: true, attr: 'charm',
    img: '/img/lb/h_byunghwa.webp', role: 'LEGEND · 매력 · 원맨쇼 무대 장악',
    dmg: 30, interval: 1.6, range: 310, proj: 'shout', cone: [0.5, 0.5, 0.58, 0.58, 0.66], coneMax: 4, charm: [0.8, 0.8, 0.9, 0.9, 1.0], // (홀림 1.2~1.5 → 0.8~1.0초 · 한 번에 6 → 4명: 기본 공격 홀림만으로 판이 멈춰 있었음)
    aura: { r: 170, spd: 0.25, cc: 0.5 }, // 곁(3칸) 멤버 공속 +25% · 상태이상 시간 절반
    attack: '고함 연기 — 부채꼴로 우렁차게 외치면 맞은 진상(최대 4명)이 0.8초 홀려 멈춘다 (보스는 느려짐) · 곁 멤버 공속 +25% · 상태이상 절반',
    desc: '무대 위에선 누구보다 빛나는 연기파. 한 번 외치면 골목 전체가 관객석이 된다.',
    perks: { 3: '홀림 시간 +0.1초', 5: '원맨쇼 1초 더' },
    skill: { id: 'oneman', name: '원맨쇼', cd: 30, desc: '컷인! 5초 동안 보스·중간 보스 빼고 모두 춤추며 멈춤 · 보스·중간 보스는 50% 느리게 · 모든 멤버 공격력 +35% · 상태이상 해제', sec: [5, 5, 5.5, 5.5, 5.5], atk: 0.35 }, // (8~10초 · 쿨 26 · +30% → 화면 전체를 너무 오래 멈춰서 판이 쉬워짐)
    shouts: ['컷! 다시 가자!', '여기가 내 무대야', '관객 여러분~', '박수!'],
  },
  jeongseob: {
    id: 'jeongseob', bossKit: 0.6, kit: 0.7, name: '윤정섭', gender: 'm', emoji: '🧍', color: '#8fa6d8', gacha: true, attr: 'booze',
    img: '/img/lb/h_jeongseob.webp', role: '탱커 · 밀어내기 · 감속',
    dmg: 4, interval: 9, range: 200, proj: 'wall', scale: 1.25,
    wall: { speed: [34, 34, 36, 36, 39], back: 90, rest: [6, 6, 5, 5, 4], hp: [520, 520, 640, 640, 800], cut: 0.5, touchSlow: 0.3, afterSlow: 0.5, bossTouch: 0.65, bossAfter: 0.75, slowSec: 3, bossPush: 0.3, w: [50, 50, 54, 54, 58] }, // 뚜벅뚜벅 (한 줄 10~12초 · 빨리 돌아와 6초만 쉼) · w = 밀어내는 폭의 절반 (46 → 50~58: 자기 줄 + 양옆 줄 절반쯤)
    attack: '뚜벅뚜벅 — 두 팔 벌리고 자기 줄을 걸어 올라가며 진상을 통째로 밀어낸다 (피해 없음 · 닿으면 느려짐)',
    desc: '키 210의 차분한 거인. 말없이 걸어가 진상들을 밖으로 모셔 간다.',
    perks: { 3: '걷는 속도 · 버티는 힘 · 미는 폭 ↑', 5: '쉬는 시간이 1초 짧아진다 · 미는 폭 ↑' },
    skill: { id: 'wallwalk', name: '벽이 걸어온다', cd: 22, desc: '언제 눌러도 그 자리에서 바로 돌아서 출발! 6초 동안 1.5배로 커지고 조금 빨라져 넓게 밀어낸다 (돌아오는 중 · 쉬는 중 · 지쳤을 때도 체력 가득) · 끝에서 쿵! 뭉친 진상 1칸 밀치고 1초 기절 (피해 없음)', sec: [6, 6, 6, 6, 7], grow: 1.5 }, // (1.3 → 1.5배: 범위가 좁다는 의견)
  },
};
// 소환 멤버 (덱 · 모집 · 도감 목록에는 없다): 정소영이 부르는 성준영
export const SUMMONS = {
  junyoung: {
    id: 'junyoung', summon: true, bossKit: 1, kit: 1, name: '성준영', gender: 'm', emoji: '🃏', color: '#9fd4ff', attr: 'talk',
    img: ART('h_junyoung'), role: '소환 · 돈 쓸어 모으기 · 진상 끌어모으는 미끼',
    dmg: 30, interval: 0.55, range: 380, proj: 'sweep',
    sweep: { hp: [0.55, 0.55, 0.65, 0.65, 0.8], hpMeta: 0.02, r: [110, 110, 120, 120, 135], hold: 40, pull: 110, bossPull: 0.25, max: [6, 6, 7, 7, 8], tick: 0.5, dmgK: 0.18, walk: 58, cut: 0.4, wp: [1.4, 2.6], allinR: 1.5 }, // 체력 = 입구 최대 내구도의 % · 끌어모으는 반경 · 붙잡는 최대 수 · 0.5초마다 붙잡은 진상에게 조금씩 (한 방의 18%) · 받는 피해 −40%
    allin: { r: 90, mul: 5 }, // 지쳐서 퇴근할 때 "올인!" 작은 폭발 (피해 = 한 방 × 5)
    attack: '빗자루질 — 바닥의 돈을 쓸어 담듯 아래에서부터 이리저리 돌아다니며 주변 진상을 자기 쪽으로 끌어모은다 (피해는 아주 조금). 붙잡힌 진상은 입구 대신 준영을 때린다',
    desc: '비실비실해 보이지만 돈 냄새는 귀신같이 맡는다. 소영 잔소리에 떠밀려 나와 바닥의 돈을 쓸어 담고, 지치면 "올인!" 하고 퇴근한다.',
    perks: { 3: '-', 5: '-' },
    shouts: ['올인!', '이거 다 내 돈!', '쓸어 담자~', '아 왜 또 불러…'],
  },
};
// ─── 멤버 등급(티어): 늦게 만나는 멤버일수록 기본이 세다 · 초반 멤버는 강화 한도가 낮다 ───
// (최대 강화 T1 < 중간 강화 T3 — 초반 멤버는 초반과 시너지로 쓰고, 뒤로 갈수록 새 멤버로 바꿔 가게)
export const HERO_TIER = {
  bangjang: 1, staff: 1, gunman: 1, gunnyeo: 1,
  dohoon: 2, myunghoon: 2, eunok: 2, ingyu: 2,
  hanna: 3, donghan: 3, sunggu: 3, youngjun: 3,
  junseo: 4, hyungyeong: 4, ara: 4,
  hochan: 5, byunghwa: 5, baul: 3,
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
export const tierPower = (t, meta) => TIER_MUL[t] * TIER_SPD[t] * (1 + TIER_GROWTH[t] * meta);
export const TIER_NAME = ['', 'T1', 'T2', 'T3', 'T4', 'LEGEND'];
export const heroTier = (id) => HERO_TIER[id] || 1;
export const metaMaxOf = (id) => TIER_MAX[heroTier(id)];
export const BASE_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
export const UNLOCK_HEROES = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun']; // 스테이지를 깨면 합류하는 일반 영웅
export const HIDDEN_HEROES = ['eunok', 'hanna', 'sunggu'];
export const GACHA_HEROES = ['junseo', 'hyungyeong', 'ara', 'soyoung', 'jieun', 'sanghwa', 'jungmin', 'jiwon', 'wonsik', 'jeongseob', 'baul']; // 모집(뽑기) 영웅 등급
export const LEGEND_HEROES = ['hochan', 'byunghwa']; // 모집 전설 (마지막 스테이지를 깨야 모집에 나온다)
export const LOCKED_HEROES = [...UNLOCK_HEROES, ...HIDDEN_HEROES, ...GACHA_HEROES, ...LEGEND_HEROES]; // 해금이 필요한 영웅 전부
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
  eunok: 'aoe', sunggu: 'aoe', donghan: 'aoe', baul: 'aoe', junseo: 'aoe', hochan: 'aoe',
  gunman: 'single', sanghwa: 'single', ara: 'single', hanna: 'single', youngjun: 'single', myunghoon: 'single',
  staff: 'ctrl', jieun: 'ctrl', byunghwa: 'ctrl',
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
};
// 합체 중간 보스 한 장 그림 (둘이 한 몸) — e_<id>.webp (전투) · dex/<id>.webp (도감). 그림이 오면 여기에 추가
// 진상 프레임 애니메이션 (선택): 가로 띠 그림 · 칸은 정사각형 (frames 를 안 적으면 너비 ÷ 높이) — 그림이 없으면 코드 움직임 그대로
//   walk: 걸을 때 반복 · die: 쓰러질 때 한 번 (쓰러짐 연출이 들어가면 사용)
export const ENEMY_ANIM = {
  drunk: { walk: { src: '/img/lb/e_drunk_walk.webp', frames: 12, fps: 10 }, die: { src: '/img/lb/e_drunk_die.webp', frames: 8, fps: 14, hold: 0.15 } },
  boss_gapjil: { walk: { src: '/img/lb/e_boss_gapjil_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_gapjil_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_thug: { walk: { src: '/img/lb/e_boss_thug_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_thug_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_loan: { walk: { src: '/img/lb/e_boss_loan_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_loan_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_inpi: { walk: { src: '/img/lb/e_boss_inpi_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_inpi_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_queenmom: { walk: { src: '/img/lb/e_boss_queenmom_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_queenmom_die.webp', frames: 8, fps: 12, hold: 0.3 } },
  boss_sales: { walk: { src: '/img/lb/e_boss_sales_walk.webp', frames: 12, fps: 9 }, die: { src: '/img/lb/e_boss_sales_die.webp', frames: 8, fps: 12, hold: 0.3 } },
};
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
  { id: 'hp', icon: '🏗️', title: '방어선 보강', desc: '랑방 최대 내구도 +35% · 50% 회복 · 받는 피해 −15%', rarity: 'common', max: 5 },
  { id: 'exp', icon: '🍹', title: '인싸력 상승', desc: '경험치 획득 +35%', rarity: 'common', max: 3 },
  { id: 'slow', icon: '🚧', title: '새치기 금지', desc: '모든 진상 이동 속도 -13%', rarity: 'common', max: 3 },
  { id: 'pierce', icon: '🗡️', title: '관통 공지', desc: '모든 투사체 관통 +1', rarity: 'legend', max: 2 },
  { id: 'boss', icon: '🍻', title: '랑방 단골의 힘', desc: '공격력 +50% · 공격 속도 +25%', rarity: 'legend', max: 2 },
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
  { id: 'tag_splash', icon: '💥', title: '폭발 증폭', desc: '폭발 범위 +45% · 폭발 멤버 공격력 +34% · 일반 진상 +20%', rarity: 'rare', max: 2, tag: 'splash' },
  { id: 'tag_chain', icon: '⚡', title: '연쇄 반응', desc: '연쇄 멤버 튕김 +1 · 공격력 +34%', rarity: 'rare', max: 2, tag: 'chain' },
  { id: 'tag_kb', icon: '💨', title: '밀어내기 달인', desc: '넉백 +60% · 넉백 멤버 공격력 +34%', rarity: 'common', max: 2, tag: 'kb' },
  { id: 'tag_heal', icon: '💚', title: '회복 강화', desc: '모든 회복 +80% · 회복 멤버 공격력 +25%', rarity: 'common', max: 2, tag: 'heal' },
  { id: 'tag_ctrl', icon: '🌀', title: '제어 연장', desc: '감속·기절 +50% · 제어 멤버 공격력 +25% · 진상 이동 −10%', rarity: 'common', max: 2, tag: 'ctrl' },
  { id: 'tag_boss', icon: '🎯', title: '보스 사냥꾼', desc: '보스·중간 보스에게 피해 +65%', rarity: 'rare', max: 2, tag: 'boss' },
  { id: 'swarm', icon: '🌪️', title: '청소부', desc: '일반 진상에게 피해 +38%', rarity: 'common', max: 2 },
  { id: 'risk_allin', icon: '🎲', title: '올인!', desc: '입구 최대 내구도 -20% · 모든 공격력 +55%', rarity: 'rare', max: 1, risk: true },
  { id: 'risk_overtime', icon: '🌙', title: '야근 모드', desc: '진상 체력 +15% · 경험치 +80%', rarity: 'common', max: 1, risk: true },
  { id: 'risk_glass', icon: '🍷', title: '유리 대포', desc: '치명타 피해 +120% · 입구 회복 -50%', rarity: 'rare', max: 1, risk: true },
  { id: 'econ_bonus', icon: '🎁', title: '보너스 카드', desc: '지금 바로 카드 한 번 더 고르기', rarity: 'common', max: 2 },
);
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
};
// 스킬 진화 카드 (Lv3 이상 멤버 · 한 번): 스킬이 한 번 더 터진다 (0.5초 뒤, 옆자리에)
export const SKILL_EVO = {
  bangjang: '집합! 두 번 외치기', staff: '레드카드 2장 발사', gunman: '난사 연장전', gunnyeo: '응급처치 + 하트 폭탄 3연발', myunghoon: '쌍욕 폭격 2회 연속',
  dohoon: '무한 앵콜 앵콜', ingyu: '할리 한 바퀴 더', donghan: '진심 빔 두 줄', youngjun: '블랙 러시 왕복', eunok: '원샷 두 잔',
  hanna: '하트 레이저 풀파워 (화면 끝까지 꿰뚫는 굵은 빔)', sunggu: '지팡이 블랙홀 두 개', junseo: '소개팅 2차', hyungyeong: '다이어트 주사 + 충격파', ara: '공주의 일격 2연타', hochan: '랑방을 위하여!! 앵콜',
  soyoung: '올인 콜 앵콜 (올인 모드 한 번 더)', jieun: '시간 정지 두 번', sanghwa: '끝내주는남자 박상화!!', jungmin: '붕대 대공사 한 번 더', jiwon: '모자이크 폭격 앵콜', wonsik: '결혼정보회사 VIP 등록',
};
// 숨은 카드 (드물게): 임시 증원 · 게스트 합류 — 한 판에 한 번
export const SECRET = { tempSlot: 0.045, guest: 0.035 };
// 멤버 특성 (시너지 카드가 이걸 보고 붙는다)
export const TAGS = {
  pierce: { id: 'pierce', name: '관통', icon: '🗡️' }, splash: { id: 'splash', name: '폭발', icon: '💥' }, chain: { id: 'chain', name: '연쇄', icon: '⚡' },
  kb: { id: 'kb', name: '넉백', icon: '💨' }, heal: { id: 'heal', name: '회복', icon: '💚' }, ctrl: { id: 'ctrl', name: '제어', icon: '🌀' }, boss: { id: 'boss', name: '보스킬', icon: '🎯' },
};
export const HERO_TAGS = { jeongseob: ['ctrl'],
  bangjang: ['boss', 'ctrl'], staff: ['ctrl'], gunman: ['pierce', 'boss'], gunnyeo: ['splash', 'heal'], myunghoon: ['chain', 'ctrl'], dohoon: ['heal', 'ctrl'],
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
  youngjun: { tag: 'boss', name: '한밤의 블랙캣' }, eunok: { tag: 'splash', name: '폭탄주 여왕' }, hanna: { tag: 'kb', name: '윙크 여신' }, sunggu: { tag: 'pierce', name: '지팡이 달인' },
  junseo: { tag: 'chain', name: '인맥왕' }, hyungyeong: { tag: 'kb', name: '다이어트 챔피언' }, ara: { tag: 'boss', name: '여왕 폐하' }, hochan: { tag: 'ctrl', name: '랑방의 전설' },
  soyoung: { tag: 'ctrl', name: '잔소리 대마왕' }, jieun: { tag: 'ctrl', name: '시간의 마녀' }, sanghwa: { tag: 'boss', name: '완벽한남자' }, jungmin: { tag: 'heal', name: '붕대 장인' }, jiwon: { tag: 'boss', name: '모자이크 여왕' }, wonsik: { tag: 'heal', name: '품절남' },
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
  rare: { id: 'rare', name: '희귀', mul: 1.7, color: '#4ea8ff' },
  epic: { id: 'epic', name: '영웅', mul: 2.6, color: '#c77dff' },
  legend: { id: 'legend', name: '전설', mul: 4, color: '#ffb400' },
  myth: { id: 'myth', name: '신화', mul: 6, color: '#ff7ad9' }, // 드롭·합성 등급 목록(GEAR_RARITIES)에는 없음
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
  gunman: { name: '쌍열 새총', stats: { atk: 0.12, crit: 0.06 }, fx: { multi: 1, multiK: 0.8 }, desc: '새총알을 한 번에 두 발 — 두 번째 알은 다른 진상에게 (80% 세기)' },
  gunnyeo: { name: '수호천사 구급상자', stats: { hp: 0.12, res: 0.2 }, fx: { autoGuard: 2 }, desc: '멤버 2명 이상(혼자면 자기)이 기절 · 홀림 · 침묵에 걸리면 응급 방패가 저절로 터진다 (웨이브마다 1번 · 쿨타임 상관없이)' },
  myunghoon: { name: '욕 사전 무삭제판', stats: { atk: 0.1, skill: 0.15 }, fx: { curseN: 10, root: 3 }, desc: '쌍욕 저격이 5명 → 10명을 노리고, 묶는 시간 2초 → 3초' },
  dohoon: { name: '앵콜 전용 골든 마이크', stats: { cd: 0.12, hp: 0.1 }, fx: { echo: 3 }, desc: '무한 앵콜이 3초 뒤 한 번 더 터진다 (회복 · 해제 · 버프 · 멈춤 모두 다시)' },
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
  wonsik: { name: '다이아 결혼반지', stats: { hp: 0.15, guard: 0.08 }, fx: { pool: 2, reflect: 3 }, desc: '결정사 상담 때 버티는 체력 2배 · 되돌려 주는 피해 3배' },
  baul: { name: '팬클럽 응원 썰매 2호', stats: { skill: 0.15, atk: 0.08 }, fx: { sledBack: 1, stun: 1 }, desc: '썰매가 내려갔다가 다시 올라오며 한 번 더 쓸고 · 줄 위 진상 1초 기절' },
  byunghwa: { name: '앵콜 원맨쇼 핀 조명', stats: { cd: 0.12, atk: 0.08 }, fx: { encore: 1 }, desc: '원맨쇼가 끝나는 순간 앵콜 원맨쇼가 한 번 더 (멈춤 · 버프 시간 2배)' },
  jeongseob: { name: '쌍둥이 정섭 가면', stats: { res: 0.3, hp: 0.1 }, fx: { twin: 1, stun: 2 }, desc: '나갈 때마다 윤정섭이 둘! 옆 줄에서 그림자 정섭이 함께 밀고 올라간다 · 끝 기절 2배' },
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
export const SIG_ART_TODO = new Set(); // 25종 모두 그림 있음 (gear/myth_<멤버>.webp)
export const GEAR_IDS = Object.keys(GEAR).filter((t) => !GEAR[t].myth);
// 그림 주소 (화면): 그림이 아직 없는 새 장비는 비슷한 장비 그림으로
for (const t of Object.keys(GEAR)) GEAR[t].img = GEAR[t].hero ? (SIG_ART_TODO.has(GEAR[t].hero) ? `/img/lb/dexhq/thumb/${GEAR[t].hero}.webp` : `/img/lb/gear/myth_${GEAR[t].hero}.webp`) : `/img/lb/gear/${GEAR_ART_TODO[t] || t}.webp`;
// 드롭 표 (모든 콘텐츠) — 숫자는 실제 규칙(rollDrops · rollHeroCard · live.js 보상)과 같다
export const DROPS = [
  ['스테이지 클리어', '장비 1개 (일반 70 · 희귀 24+0.4×스테이지 · 영웅 5+0.35× · 전설 0.6+0.08×) · ★★★면 35%로 1개 더 · 퍼펙트 +1 · 첫 퍼펙트는 희귀 이상', '멤버 카드: 데려간 멤버 중 1명 (7% + 별마다 2%)', '강화석: 1-6부터 (25%+12%×별) · 보스 +2 · 첫 클리어 +1'],
  ['헬', '장비 +1개 · 일반 없음 · 영웅·전설 ×2', '멤버 카드 ×2 확률', '강화석 ×2 · 코인 ×3'],
  ['무한 도전', '달성 우편 10/20/30/40/50웨이브 (주마다): 모집권 1~5 · 50웨이브 신화 장비', '주간 순위: 1위 전설 장비 · TOP3 영웅 장비 · TOP10 모집권 2', ''],
  ['레이드', '참가 코인 · 강화석 2 · 1위 전설 장비 · 2~3위 영웅 장비', 'TOP10 모집권', ''],
  ['주간 도전', '순위 보상: 1위 모집권 5 + 영웅 장비 · TOP3 모집권 3 · TOP10 2 · 참가 1', '', ''],
  ['1:1 대전', '하루 10판 코인 (승 300 · 패 80 · 첫 승 2배)', '등급 올리기 보상: 코인 · 모집권', ''],
  ['시즌 (30단계)', '5단계 희귀 · 15단계 영웅 · 25단계 전설 장비 · 30단계 신화 장비', '4단계마다 범용 카드 · 3단계마다 모집권', ''],
  ['모집', 'LEGEND 0.6% (70번부터 ↑ · 90번 확정) · T4 5.4% (40번 확정 · 픽업 50%) · T3 카드 20%', '전용 신화 0.05% · 신화 0.3% · 전설 1.2% · 영웅 6% · 희귀 16.5%', '10회: T3 이상 1개 · 처음 10회 T4'],
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
  return Math.round(g.base * R.mul * (1 + 0.12 * (lv || 0)) * 1000) / 1000;
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
export function gearStats(items, mythMul = 1) { // mythMul: 1:1 대전은 신화 효과 절반
  const st = {};
  for (const it of items) {
    if (!it || !GEAR[it.t]) continue;
    if (GEAR[it.t].myth) { for (const [k, v] of Object.entries(GEAR[it.t].stats)) st[k] = (st[k] || 0) + v * mythMul; continue; }
    const k = GEAR[it.t].stat; st[k] = (st[k] || 0) + gearValue(it.t, it.r, it.lv);
  }
  return st;
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
    { id: 'frenzy', name: '난사 연장전', desc: '난사 +1.5초 · 난사 피해 +20%' },
    { id: 'head', name: '헤드샷 장인', desc: '치명타 +15% · 3발마다 헤드샷 (Lv 상관없이)' },
  ],
  gunnyeo: [
    { id: 'aegis', name: '철벽 방패', desc: '응급 방패 면역 +3초 · 스킬 쿨타임 −2초 더' },
    { id: 'angel', name: '천사의 손길', desc: '간호 50% 더 자주 · 하트 폭탄 범위 +30%', cm: { mul: { care: 1.5, splash: 1.3 } } },
  ],
  myunghoon: [
    { id: 'bolts', name: '저주 폭격', desc: '쌍욕 저격이 8명까지' },
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
    { id: 'rushx', name: '블랙 러시 연속', desc: '블랙 러시 +3명 · 피해 +30%', cm: { add: { rush: 3 } } },
    { id: 'endless', name: '끝없는 돌격', desc: '돌격 +1.5초 · 크로스핏 −40%', cm: { add: { out: 1.5 } } },
  ],
  eunok: [
    { id: 'inferno', name: '불바다 확장', desc: '분노 불바다 범위 +50% · 1초 더' },
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
    { id: 'jackpot', name: '소개팅 대박', desc: '소개팅 주선 여사친 +2명 · 피해 +30%' },
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
    { id: 'iron', name: '철벽 붕대', desc: '붕대 대공사 입구 피해 감소 +20%p · 3초 더' },
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
    { id: 'ice', name: '미끄러운 길', desc: '썰매가 지나간 줄 4초 동안 미끄러운 길 (진상 −45%)' },
    { id: 'twice', name: '썰매 두 번', desc: '썰매가 한 번 더 지나간다 (60%)' },
    { id: 'glow', name: '튜닝 보드', desc: '보드 돌진 피해 +25% · 보드 폭 +40% (맞히기 쉬움)' },
  ],
  byunghwa: [
    { id: 'curtain', name: '커튼콜', desc: '원맨쇼 중 처치하면 시간 +0.5초 (최대 +3초)' },
    { id: 'stage', name: '무대 확장', desc: '고함 대상 +2명 · 홀림 +0.3초' },
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
  ara: { r: 52, k: 0.4 }, // 고아라 (탑에서만): 망치가 떨어진 곳 반경 52 안 진상에게 40% 피해 · 맞은 진상 보호막 한 겹 더 벗김 (센 진상 하나만 쳐서 떼거리 · 보호막 층에서 2~6층에 막히던 문제)
  laneHold: 10, // 혼자인 탑: 손으로 옮기면 이 시간 동안 자동 자리 잡기를 쉰다 (초)
  solo: { wonsik: 1.7, jungmin: 1.35, dohoon: 1.25, gunnyeo: 1.25, jieun: 1.15, sanghwa: 1.15, baul: 0.75, ingyu: 1.5, youngjun: 0.7 }, // (송바울 1.1 → 0.75: 응원봉 부메랑 · 함성으로 혼자서도 세짐 · 백인규 1.5: 입구 피해 감소가 빠져서) // 혼자라서 동료 덕을 못 보는 멤버(탱커 · 회복 · 지원)는 탑에서만 공격력 보정 · 김영준은 혼자일 때 너무 세서 탑에서만 −30% (출시 첫날 TOP 7 중 5명이 김영준)
};
export const TOWER_AWAKE_FX = { atk: 0.05, skill: 0.15, cd: 0.08 }; // 지옥 각성 (20층 공격력 · 40층 스킬)
export const HELL_SET_FX = { cc: 0.3, boom: 0.6, r: 64 }; // 지옥 세트 2세트 · 4세트
// 7장 스키장: 입구 공격 동작 · 짧은 이름 · 드문 진상 · 회장 보스 패턴
Object.assign(ENEMY_ATK, { snowboard: 'kick', liftcut: 'shove', fakecoach: 'slap', sledgirl: 'headbutt', hotpack: 'shove', snowball: 'bottle', mid_pension: 'bag', boss_resort: 'punch' });
Object.assign(SHORT_NAME, { snowboard: '보드남', liftcut: '리프트 새치기', fakecoach: '사칭 강사', sledgirl: '썰매녀', hotpack: '핫팩 도둑', snowball: '눈싸움러', mid_pension: '펜션 사장', boss_resort: '리조트 회장',
  mid_snowboard: '각성 보드남', mid_sledgirl: '각성 썰매녀', fuse_lift: '리프트 무법자', fuse_coach: '사칭 강사단', fuse_snowfight: '눈싸움 원정대' });
FEW.push('fakecoach', 'snowball', 'hotpack');
BOSS_KITS.boss_resort = { name: '리조트 갑부 회장', skills: [['silence', '회장님 훈화', { sec: 3 }], ['stun', 'VIP 갑질', { n: 2, sec: 1.4 }]], p2: ['summon', '스키 강사단', { types: ['fakecoach', 'snowboard'], n: 3 }] };
// 7-5 보스로 승격한 펜션 사장님: "소음 금지!" 침묵(원래 기술)은 그대로 + 보스 패턴
BOSS_KITS.mid_pension = { name: '펜션 사장님', skills: [['slow', '퇴실 독촉', { cut: 0.25, sec: 4 }], ['summon', '단체 손님 받기', { types: ['liftcut', 'hotpack'], n: 3 }]], p2: ['stun', '바비큐 집게', { n: 2, sec: 1.3 }] };
// 2-10 끝 보스 번화가 삐끼왕 — 새 기술 3개 (sim.js bossSkill)
//  flyer 전단지 폭탄: 예고된 멤버 n명 시야를 가려 사거리 -cut (sec초)
//  lure 호객 행위: 곁(r)의 진상을 한 줄로 바짝 모아 입구로 우르르 (sec초 빨라짐) + 2장 진상 n명 호객
//  vip VIP 줄 세우기: 입구에 제일 가까운 진상 n명에게 최대 체력 frac 보호막
//  rageAt: 체력 40% 에서 분노 · everyP2: 분노하면 기술 간격이 짧아진다
BOSS_KITS.boss_bbikki = {
  name: '번화가 삐끼왕', rageAt: 0.4, everyP2: [4, 6], rageSub: '기술을 훨씬 자주 쓴다',
  skills: [['flyer', '전단지 폭탄', { n: 3, cut: 0.3, sec: 4 }], ['lure', '호객 행위', { r: 240, pull: 0.65, sec: 3, spd: 1.45, types: ['scammer', 'handsy'], n: 3 }], ['vip', 'VIP 줄 세우기', { n: 5, frac: 0.35 }]],
  p2: null,
};
Object.assign(ENEMY_ATK, { boss_bbikki: 'slap' });
Object.assign(SHORT_NAME, { boss_bbikki: '삐끼왕' });
