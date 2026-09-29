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
export const SLOT_X7 = [28, 79, 129, 180, 231, 281, 332]; // 덱 7칸일 때
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

// 웨이브별 적 체력 배율
export function hpMul(wave, stage) {
  const w = wave - 1;
  let m = 1 + 0.2 * w + 0.03 * w * w;
  if (wave > 20 && !stage) m *= Math.pow(1.09, wave - 20); // 무한 모드
  return m;
}
// 웨이브별 적 공격력 배율
export function atkMul(wave, stage) {
  return 1 + 0.05 * (wave - 1) + (wave > 20 && !stage ? 0.08 * (wave - 20) : 0);
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
  slot6: { id: 'slot6', icon: '🪑', name: '덱 6번째 칸', max: 1, per: 1, costs: [20000], desc: (v) => (v ? '덱 6칸!' : '덱에 멤버 한 명 더') },
  slot7: { id: 'slot7', icon: '🛋️', name: '덱 7번째 칸', max: 1, per: 1, costs: [60000], needs: 'slot6', desc: (v) => (v ? '덱 7칸!' : '덱에 멤버 한 명 더 (6번째 칸 먼저)') },
};
export const deckSlots = (items) => 5 + ((items && items.slot6) | 0) + ((items && items.slot6 && items.slot7) | 0);
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
  chapterAdd: [0, 0.8, 0], // 2챕터부터 동료가 2명이라 그만큼 더 단단하게 (첫 웨이브 난이도 = 1 + 1.1 × (s-1)^0.8 + 챕터 보정)
  bossStage: { 1: [0.2, 1.2], 2: [-0.8, -2.6], 3: [-1.8, -2.2] }, // x-5 · x-10 스테이지는 조금 더 어렵게 (1-10 은 강화가 필요, 2·3챕터 끝은 보스 2명)
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
  deckHp: [2.9, 2.3, 1.9], // 덱(5명) 보정: 적 체력 배율 (챕터별 — 뒤로 갈수록 강화·장비가 쌓이니 조금씩 덜)
  deckCount: 1.45, // 덱 보정: 적 수 배율
  stageAdd: { 3: 2.2, 4: 4.0, 5: 0.4, 6: -0.5, 19: -0.4, 20: -0.3, 25: -0.4, 26: -0.3, 29: 0.2 }, // 챕터 끝 보스 바로 앞 스테이지는 살짝 더
  themeLevel: { violent: -1.2 }, // 폭력형 스테이지는 단단한 적이 많아서 조금 낮게 // 나머지 계열 비중
};
// 덱 5명으로 싸우니 적도 그만큼 단단하게 — 1-1 은 연습이라 그대로, 1-3 부터 본격
export function stageHpScale(s) { return 1 + (STAGE.deckHp[chapterOf(s) - 1] - 1) * Math.min(1, (s - 1) / 2); }
export function stageLevel(s, w) {
  const n = stageNo(s);
  const bs = STAGE.bossStage[chapterOf(s)];
  const boss = n === 10 ? bs[1] : n === 5 ? bs[0] : 0;
  // 첫 웨이브는 새로 시작한 멤버도 버티게 천천히, 스테이지 안에서 웨이브마다 가파르게 (뒤 스테이지일수록 더)
  return 1 + STAGE.levelPerStage * Math.pow(s - 1, STAGE.levelPow) + (w - 1) * (STAGE.levelPerWave + STAGE.wavePerStage * (s - 1)) + boss + STAGE.chapterAdd[chapterOf(s) - 1] + (STAGE.themeLevel[stageTheme(s)] || 0) + (STAGE.stageAdd[s] || 0);
}
// 적은 스테이지마다 조금씩 늘어난다:
//  1챕터 꼬충 → 먹튀(1-3) → 술진상(1-4) → 폭력배(1-8)
//  2챕터 사기꾼(2-1) → 뒷담러(2-2) → 패거리(2-4) → 독재자(2-7)  ·  3챕터 인피 아지트: 인피 총출동, 꼬충은 줄어든다
export function stageMix(s, raw) {
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
const FEW = ['thug', 'mukti', 'inpi_dictator', 'inpi_gossip', 'scammer', 'inpi_treasurer', 'vomit', 'cutter', 'couple', 'selfie', 'handsy', 'gao', 'kkondae', 'spam'];
// 스테이지 번호별 주인공 계열 (1챕터엔 정치형이 없어서 유혹형)
const THEMES = [null, 'seduce', 'seduce', 'jerk', 'jerk', 'violent', 'violent', 'politic', 'jerk', 'violent', 'mix'];
export function stageTheme(s) {
  const t = THEMES[stageNo(s)];
  if (chapterOf(s) === 3 && stageNo(s) === 9) return 'politic'; // 3-9 최후의 방어선: 인피 총동원
  return t === 'politic' && chapterOf(s) === 1 ? 'seduce' : chapterOf(s) === 3 && t === 'seduce' ? 'politic' : t;
}
// 보스: x-5, x-10 마지막 웨이브
export function stageBosses(s) {
  const n = stageNo(s), ch = chapterOf(s);
  if (n === 5) return ch === 1 ? ['boss_loan'] : ch === 2 ? ['boss_gapjil'] : ['boss_gapjil', 'boss_thug'];
  if (n === 10) return ch === 1 ? ['queen'] : ch === 2 ? ['queen', 'boss_gapjil'] : ['boss_inpi', 'boss_gapjil'];
  return [];
}
export function stageWave(s, w) {
  const bosses = w === STAGE_WAVES ? stageBosses(s) : [];
  let n = STAGE.baseCount * (1 + STAGE.countPerStage * (s - 1)) * (1 + STAGE.countPerWave * (w - 1)) * (s === 1 ? 1 : STAGE.deckCount);
  if (bosses.length) n *= 0.55;
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
    g.push([type, c, +(dur / c).toFixed(2), +(i * 0.7).toFixed(1)]);
  });
  const def = { g, level: stageLevel(s, w), hpScale: stageHpScale(s) };
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
  icy: { id: 'icy', icon: '🧊', name: '미끄러운 바닥', desc: '넉백 거리 +50%', kb: 1.5 },
  feast: { id: 'feast', icon: '🔥', name: '회식 열기', desc: '술 멤버 피해 +30% · 분노가 더 오래', attr: { booze: 1.3 }, rage: 1.3 },
  construction: { id: 'construction', icon: '🚧', name: '공사 중', desc: '양옆이 막혀 진상이 가운데로 몰린다 · 범위 공격 범위 +30%', lane: [96, 264], splash: 1.3 },
  megaphone: { id: 'megaphone', icon: '📢', name: '인피 확성기', desc: '10초마다 진상들이 3초 동안 30% 빨라진다', every: 10, sec: 3, speed: 1.3 },
};
// 스테이지별 맵 효과 (1챕터는 순하게, 뒤로 갈수록 적 구성과 맞물리게)
const STAGE_FX = [ // 속성 버프가 있는 효과(노래방·안개=말빨, 회식=술)는 그 속성이 추천인 스테이지에만
  'none', 'none', 'none', 'rain', 'none', 'icy', 'happy', 'rain', 'icy', 'karaoke',
  'happy', 'karaoke', 'rain', 'construction', 'icy', 'construction', 'karaoke', 'rain', 'blackout', 'feast',
  'megaphone', 'karaoke', 'construction', 'blackout', 'icy', 'happy', 'fog', 'rain', 'blackout', 'feast',
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
  const mul = 1 + itemValue('coupon', couponLv);
  const total = Math.round((clear + first + star + perf) * mul);
  return { clear, first, star, perfect: perf, newStars, bonus: total - clear - first - star - perf, total };
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
export const TYPE_STRONG = 1.7, TYPE_WEAK = 0.55;
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
    img: '/img/lb/h_staff.webp', role: '경고장 · 감속/강퇴',
    dmg: 49, interval: 0.6, range: 400, proj: 'warn', projSpeed: 480,
    slow: 0.42, slowSec: 1.6,
    attack: '경고장 — 중거리 유도탄, 맞으면 느려진다',
    desc: '"경고장"을 날려 적을 느리게 만든다. 규칙 위반자는 강퇴!',
    perks: { 3: '맞은 적 18% 확률로 "강퇴" (1초 기절)', 5: '경고장이 주변에도 퍼지고 강퇴 30%' },
    skill: { id: 'redcard', name: '레드카드', cd: 18, target: true, desc: '찍은 곳 진상들 60% 감속 + 피해', r: [90, 90, 110, 110, 125], slowSec: 4, dmgMul: 2.5 },
  },
  gunman: {
    id: 'gunman', bossKit: 1.3, kit: 0.95, name: '건전남', gender: 'm', emoji: '🙋‍♂️', color: '#4fd18b', attr: 'power',
    img: '/img/lb/h_gunman.webp', role: '저격수 · 최장 사거리',
    dmg: 23, interval: 0.44, range: 600, proj: 'bullet', projSpeed: 900, critBonus: 0.22, lane: 38,
    attack: '새총 — 자기 줄(세로) 위로만 쭉, 가장 멀리 · 치명타 잘 터짐',
    desc: '건전하게, 그러나 정확하게. 멀리 있는 놈부터 저격하는 새총 명사수.',
    perks: { 3: '새총알이 1명 관통 · 치명타 +10%', 5: '4발마다 "헤드샷" (무조건 치명타 ×3)' },
    skill: { id: 'frenzy', name: '난사', cd: 20, desc: '3초 동안 가까운 진상들에게 폭풍 연사', sec: [3, 3, 3.5, 3.5, 4], every: 0.07 },
  },
  gunnyeo: {
    id: 'gunnyeo', bossKit: 0.8, kit: 1.0, name: '건전녀', gender: 'f', emoji: '🙋‍♀️', color: '#ff8fc0', attr: 'charm',
    img: '/img/lb/h_gunnyeo.webp', role: '범위 딜 + 랑방 회복',
    dmg: 35, interval: 0.85, range: 430, proj: 'heart', projSpeed: 1, lobSec: 0.6, splash: 46,
    heal: [[6, 0.03], [6, 0.035], [5, 0.04], [5, 0.045], [4, 0.055]], // [주기(초), 최대 내구도 대비 회복량]
    attack: '하트 폭탄 — 포물선으로 던져 떨어진 곳 주변을 터뜨린다',
    desc: '하트 폭탄을 던지며 틈틈이 랑방 입구를 수리한다.',
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
    skill: { id: 'curse', name: '쌍욕 폭격', cd: 20, target: true, desc: '찍은 곳 진상들 기절 (들킨 사기꾼은 2배)', r: [95, 95, 110, 110, 125], stun: [1.5, 1.5, 1.8, 1.8, 2.2], dmgMul: 1.5 },
  },
  dohoon: {
    id: 'dohoon', bossKit: 0.7, kit: 0.6, name: '김도훈', gender: 'm', emoji: '🎤', color: '#b58cff', unlock: true, attr: 'booze',
    img: '/img/lb/h_dohoon.webp', role: '힐러 · 떼창 오라 · 제어',
    dmg: 27, interval: 1.35, range: [210, 210, 240, 240, 265], proj: 'wave', waveMax: 10, slow: 0.2, slowSec: 1,
    regen: [0.005, 0.0056, 0.007, 0.0076, 0.0092], // 떼창: 초당 입구 최대 내구도의 %
    sing: { r: 150, spd: [0.12, 0.12, 0.18, 0.18, 0.24] }, // 떼창: 곁 멤버 공격 속도 +%
    attack: '마이크 음파 — 둥글게 퍼지는 음파가 근처 진상 전부를 때리고 살짝 느리게',
    desc: '마이크를 절대 안 놓는 노래방 사나이. 떼창으로 랑방을 꾸준히 고친다.',
    perks: { 3: '음파 범위 · 떼창 강화', 5: '떼창 최대 · 앵콜이 더 길다' },
    skill: { id: 'encore', name: '무한 앵콜', cd: 26, desc: '입구 크게 회복 + 멤버 상태이상 전부 해제 + 근처 진상 춤추느라 멈춤', heal: [0.18, 0.18, 0.22, 0.22, 0.26], r: 250, dance: [3, 3, 3.3, 3.3, 3.8] },
  },
  ingyu: {
    id: 'ingyu', bossKit: 1.15, kit: 0.95, name: '백인규', gender: 'm', emoji: '🏋️', color: '#3f8cff', unlock: true, attr: 'power',
    img: '/img/lb/h_ingyu.webp', role: '탱커 · 덤벨 · 오토바이 돌진',
    dmg: 48, interval: 1.75, range: 420, proj: 'dumbbell', projSpeed: 1, lobSec: 0.5, splash: 34,
    moto: { every: [8, 8, 7, 7, 6], mul: 2.0, speed: 560, kb: 60, w: 30 }, // 덤벨 8번 → 자기 줄로 오토바이 돌진
    taunt: 0.35, // 근육 자랑: 멤버 노리는 기술(붙잡기·플래시·뒷담·무릎·오리고기)은 백인규가 대신 맞고 35% 시간만
    guard: { r: 50, cut: 0.15 }, // 자기 줄 진상이 입구를 칠 때 -15%
    attack: '덤벨 — 느리지만 묵직하게 던져 떨어진 곳을 쾅, 게이지가 차면 오토바이 돌진',
    desc: '3대 500 헬창. 멤버를 노리는 진상 기술은 전부 "근육 자랑"으로 받아 낸다. 꼰대 잔소리도 안 통함.',
    perks: { 3: '오토바이가 더 자주', 5: '오토바이 게이지 6번 · 덤벨 범위 +' },
    skill: { id: 'moto3', name: '3대 500', cd: 22, desc: '오토바이 3대를 부채꼴로 동시에 출발!', n: [3, 3, 3, 3, 4] },
  },
  donghan: {
    id: 'donghan', bossKit: 0.9, kit: 1.0, name: '문동한', gender: 'm', emoji: '😪', color: '#8fb3a0', unlock: true, attr: 'charm',
    img: '/img/lb/h_donghan.webp', imgOn: '/img/lb/h_donghan_on.webp', role: '간보기 · 한 방 폭발',
    dmg: 7, interval: 1.1, range: 320, proj: 'snack', projSpeed: 420, slow: 0.2, slowSec: 1,
    meter: { base: [6.5, 7, 7.5, 8, 9], perNear: 1.1, nearY: 200, hpLow: 12 }, // 간보기 게이지 (초당)
    burst: { mul: 28, w: [36, 36, 44, 44, 54], windup: 0.8, rest: 1.2 }, // 가장 붐비는 줄에 두꺼운 빔
    attack: '과자 던지기 — 누워서 약한 과자를 휙 (살짝 느려짐). 간보기 게이지가 차면 일어나서 한 줄 전체에 빔!',
    desc: '늘 귀찮은 간보는 사람. 누워만 있다가 "이제 좀 해볼까?" 한 방이면 한 줄이 싹 비워진다.',
    perks: { 3: '게이지 빨라짐 · 빔 두꺼워짐', 5: '게이지 최대 · 빔 제일 두껍게' },
    skill: { id: 'serious', name: '진심 모드', cd: 24, desc: '간보기 게이지 바로 가득 + 다음 빔 1.5배' },
  },
  youngjun: {
    id: 'youngjun', bossKit: 1.2, kit: 0.95, name: '김영준', gender: 'm', emoji: '🐆', color: '#7a4dff', unlock: true, attr: 'booze',
    img: '/img/lb/h_youngjun.webp', imgOn: '/img/lb/h_youngjun_dash.webp', role: '근접 돌격 · 초고속 연속 베기',
    dmg: 17, interval: 0.14, range: 350, proj: 'dash', outSec: [3, 3, 3.3, 3.3, 3.6], restSec: [1.6, 1.6, 1.4, 1.4, 1.1], reach: 70,
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
    soberSec: [20, 20, 18, 18, 15], rageSec: [9, 10, 11, 12, 13],
    rageDmg: 1.55, rageInterval: 0.45, fire: { sec: 2.2, r: 50, dps: 0.6 }, // 분노 중 불바다 (1발 피해 × 0.6 / 초)
    attack: '소주병 — 던지면 깨지며 범위 폭발, 분노 중엔 불바다',
    desc: '홀짝홀짝… 20초가 지나면 취해서 "분노 모드"가 된다.',
    perks: { 3: '분노 중 불바다가 더 넓고 오래', 5: '더 빨리 취하고 더 오래 분노' },
    skill: { id: 'oneshot', name: '원샷', cd: 25, desc: '바로 분노 모드! (분노 중이면 +5초)' },
  },
  hanna: {
    id: 'hanna', bossKit: 1.15, kit: 1.05, name: '이한나', gender: 'f', emoji: '😉', color: '#ff6fd8', hidden: true, attr: 'charm',
    img: '/img/lb/h_hanna.webp', role: 'HIDDEN · 하트 레이저 · 윙크 넉백',
    dmg: 33, interval: 0.7, range: 370, proj: 'beam', beamTick: 0.12, ramp: [0.5, 0.5, 0.7, 0.7, 0.9], rampMax: 2.5, kbEvery: 1.3,
    knockback: [60, 70, 80, 90, 105],
    attack: '하트 레이저 — 한 명에게 계속 쏘면 점점 세진다, 남자는 가끔 뒤로 밀림',
    desc: '"윙크 ♥" 레이저에 맞은 남자는 정신 못 차리고 뒤로 날아간다. 여자는 그냥 아프다.',
    perks: { 3: '레이저가 더 빨리 세진다', 5: '레이저 2갈래 · 남자는 잠깐 기절' },
    skill: { id: 'winkbomb', name: '윙크 폭탄', cd: 20, target: true, desc: '찍은 곳: 남자는 날려 버리고 여자는 홀려서 멈춤', r: [105, 105, 120, 120, 135], kb: 110, stun: 1.2 },
  },
  sunggu: {
    id: 'sunggu', bossKit: 1.1, kit: 1.0, name: '강성구', gender: 'm', emoji: '🦯', color: '#c9a36b', hidden: true, attr: 'power',
    img: '/img/lb/h_sunggu.webp', role: 'HIDDEN · 지팡이 무한 관통',
    dmg: 48, interval: 2.1, range: 620, proj: 'cane', projSpeed: 430, lv5Interval: 0.85, lane: 50,
    attack: '지팡이 — 자기 줄 위로 아주 길게, 그 줄 진상 전부 관통',
    desc: '"요즘 것들은…" 지팡이를 던지면 한 줄에 있는 놈들이 전부 맞는다.',
    perks: { 3: '지팡이가 부메랑처럼 돌아온다', 5: '지팡이 2개 · 공격 속도 +15%' },
    skill: { id: 'whirl', name: '지팡이 회오리', cd: 22, desc: '지팡이 7개를 부채꼴로 던진다', n: [7, 7, 9, 9, 11] },
  },
};
export const BASE_HEROES = ['bangjang', 'staff', 'gunman', 'gunnyeo'];
export const UNLOCK_HEROES = ['dohoon', 'myunghoon', 'ingyu', 'donghan', 'youngjun']; // 스테이지를 깨면 합류하는 일반 영웅
export const HIDDEN_HEROES = ['eunok', 'hanna', 'sunggu'];
export const LOCKED_HEROES = [...UNLOCK_HEROES, ...HIDDEN_HEROES]; // 해금이 필요한 영웅 전부
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
    id: 'drunk', cls: 'jerk', name: '술진상', gender: 'm', emoji: '🥴', color: '#e0a340',
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
  handsy: {
    id: 'handsy', cls: 'jerk', name: '손진상', gender: 'm', emoji: '🙌', color: '#e8b27a',
    img: '/img/lb/e_handsy.webp', hp: 70, speed: 38, atk: 3, atkInterval: 1.2, exp: 5, r: 17, size: 76,
    grab: { sec: 4, cd: 6 }, // 로프에 닿으면 팔을 쭉 뻗어 멤버를 붙잡는다 (못 쏨) — 잡으면 풀린다
    shouts: ['잠깐만~', '어디 가?', '손 좀 잡자', '안 놔줄 거야'],
  },
  gao: {
    id: 'gao', cls: 'violent', name: '가오충', gender: 'm', emoji: '😎', color: '#e8c33a',
    img: '/img/lb/e_gao.webp', hp: 140, speed: 26, atk: 12, atkInterval: 1.4, armor: 4, exp: 7, r: 20, size: 82,
    gao: { cut: 0.6, broken: 1.3, flexR: 110, flexSpd: 1.15 }, // 가오 중엔 피해 -60% · 말빨 공격이나 치명타로 "가오 깨짐!" → 피해 +30%
    shouts: ['내가 누군지 알아?', '가오 떨어지게', '폼 미쳤다', '어깨 봐라'],
  },
  selfie: {
    id: 'selfie', cls: 'seduce', name: '셀카 인플루언서', gender: 'f', emoji: '🤳', color: '#ff9ecb',
    img: '/img/lb/e_selfie.webp', hp: 32, speed: 44, atk: 3, atkInterval: 1.4, exp: 4, r: 15, size: 70, standoff: 190,
    flash: { every: 5, sec: 2.5, miss: 0.5 }, // 찰칵! 멤버 한 명 눈부심 → 2.5초 동안 절반은 빗나감
    shouts: ['찰칵!', '좋아요 눌러줘~', '각도 좋다', '라이브 켰어요'],
  },
  cutter: {
    id: 'cutter', cls: 'jerk', name: '새치기꾼', gender: 'm', emoji: '🦘', color: '#6fd0ff',
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
    id: 'inpi_dictator', cls: 'politic', name: '인피 독재자', gender: 'm', emoji: '🫡', color: '#d0453a', inpi: true,
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
  // 21웨이브부터 골목 빌런 · 인피도 섞인다
  const extra = [['vomit', 3], ['cutter', 3], ['couple', 2], ['selfie', 2], ['handsy', 2], ['gao', 2], ['kkondae', 1], ['spam', 2], ['scammer', 2], ['inpi_gossip', 2], ['inpi_dictator', 1], ['inpi_treasurer', 1]];
  extra.forEach(([t, c], i) => { w.g.push([t, n(c), 3.2, 1 + (i % 4)]); });
  if (k % 5 === 0) w.boss = k % 10 === 0 ? 'queen' : 'boss_thug';
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
  { id: 'dmg', icon: '💪', title: '회식 버프', desc: '모든 영웅 공격력 +15%', rarity: 'common', max: 6 },
  { id: 'spd', icon: '⚡', title: '카페인 충전', desc: '모든 영웅 공격 속도 +12%', rarity: 'common', max: 5 },
  { id: 'gunExtra', icon: '🔫', title: '건전남 새총알 추가', desc: '건전남 한 번에 +1발', rarity: 'rare', max: 2, needs: 'gunman' },
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
};
export const GEAR = {
  megaphone: { id: 'megaphone', slot: 'w', icon: '📣', name: '명품 확성기', stat: 'atk', base: 0.06 },
  goldmic: { id: 'goldmic', slot: 'w', icon: '🎤', name: '노래방 황금 마이크', stat: 'skill', base: 0.1 },
  scope: { id: 'scope', slot: 'w', icon: '🔭', name: '새총 스코프', stat: 'crit', base: 0.03 },
  sojuset: { id: 'sojuset', slot: 'w', icon: '🍶', name: '소주잔 세트', stat: 'attr', base: 0.08 },
  stamp: { id: 'stamp', slot: 'w', icon: '🔨', name: '강퇴 망치', stat: 'strip', base: 0.06 },
  tumbler: { id: 'tumbler', slot: 'w', icon: '🥤', name: '아아 텀블러', stat: 'spd', base: 0.05 },
  belt: { id: 'belt', slot: 'a', icon: '🏋️', name: '헬스장 리프팅 벨트', stat: 'atk', base: 0.05 },
  carrier: { id: 'carrier', slot: 'a', icon: '🧳', name: '여행 캐리어 방패', stat: 'hp', base: 0.04 },
  hourglass: { id: 'hourglass', slot: 'a', icon: '⏳', name: '모래시계 키링', stat: 'cd', base: 0.05 },
  nametag: { id: 'nametag', slot: 'a', icon: '📛', name: '랑방 명찰', stat: 'attr', base: 0.06 },
  sneaker: { id: 'sneaker', slot: 'a', icon: '👟', name: '한정판 운동화', stat: 'spd', base: 0.04 },
  clover: { id: 'clover', slot: 'a', icon: '🍀', name: '네잎클로버 폰케이스', stat: 'crit', base: 0.025 },
};
export const GEAR_IDS = Object.keys(GEAR);
export const GEAR_MAX_LV = 10;
export const GEAR_BAG = 80; // 가방 칸
export function gearValue(t, r, lv) {
  const g = GEAR[t], R = GEAR_RARITY[r];
  if (!g || !R) return 0;
  return Math.round(g.base * R.mul * (1 + 0.12 * (lv || 0)) * 1000) / 1000;
}
export function gearEnhanceCost(r, lv) {
  if (lv >= GEAR_MAX_LV) return null;
  return Math.round((80 * GEAR_RARITY[r].mul * Math.pow(lv + 1, 1.3)) / 10) * 10;
}
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
export function rollDrops(seed, stage, stars, perfect, firstPerfect) {
  const rng = seedRng(seed);
  let n = 1 + (stars >= 3 && rng() < 0.35 ? 1 : 0) + (perfect ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const w = { common: 70, rare: 24 + stage * 0.4, epic: 5 + stage * 0.35, legend: 0.6 + stage * 0.08 };
    if (perfect) { w.rare *= 1.5; w.epic *= 1.5; w.legend *= 1.5; }
    if (firstPerfect && i === 0) w.common = 0;
    const sum = w.common + w.rare + w.epic + w.legend;
    let x = rng() * sum, r = 'common';
    for (const k of GEAR_RARITIES) { x -= w[k]; if (x <= 0) { r = k; break; } }
    const t = GEAR_IDS[(rng() * GEAR_IDS.length) | 0];
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
