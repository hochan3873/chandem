// 랑방 대전 — 할로윈 이벤트 「할로윈 저주의 밤」 (2026 할로윈 시즌 · 10/7 ~ 11/2 한국 시간)
// 순수 함수만 (DOM 없음). 서버(server/langbang-hw.js)가 이 파일을 그대로 불러 쓰고, 손님은 같은 함수로 이 기기에 저장한다.
//  - 이벤트 스테이지 10개 (맵 4종 · 할로윈 진상 · 중간 보스 저승사자 팀장 · 최종 보스 드라큘라 사장)
//  - 전투력 맞추기: 강화 · ★ · 장비를 정해진 값으로 (더 키운 만큼은 아주 조금만) → 센 계정이 힘으로 밀 수 없다
//  - 출전 제한: 스테이지마다 규칙 (서포터 2명 · 원거리만 · 술 속성만 …) — 서버가 시작할 때 다시 확인
//  - 저주 고르기: 깬 스테이지는 저주를 걸고 다시 — 저주 점수 = 랭킹 점수 · 사탕 더
//  - 사탕 상점 · 할로윈 의상 (능력치 같음 · 겉모습 · 투사체 색 · 기간이 지나도 계속 입을 수 있다)
import { HEROES, ENEMIES, KD_SUP, HERO_ROLE, ARMOR_BREAKERS, GEAR, GEAR_RARITY, gearStats, gearFits, stageWave, hashSeed } from './data.js';
import { seasonAt } from './season.js';
import * as L from './live.js';

const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };
const uniq = (a) => [...new Set(a)];

// ─── 기본 숫자 ───
export const HW = {
  id: 'hw2026', season: 'halloween', name: '할로윈 저주의 밤', sub: '진상들이 할로윈 분장을 하고 몰려온다!',
  unlock: 30, // 3-10 을 깨면 열림 (전투력은 어차피 맞춰지니 넉넉하게)
  slots: 5, // 이벤트 덱: 누구나 5명 (덱 칸 아이템과 상관없이)
  // 전투력 맞추기: 강화 +12 · ★3 · 영웅 장비까지 — 그보다 키운 멤버는 강화 4마다 +1 (최대 +2) 만 더 (키운 보람은 조금)
  sync: { meta: 12, star: 3, rarity: 'epic', per: 4, edge: 2 },
  minSec: 9, // 웨이브 하나 최소 9초 (기록 조작 방지)
  crowd: 0.5, // 원래 웨이브 머릿수 × 0.5 (대신 한 명 체력 ×2) — 좀비 부활 · 유령화 · 호박 폭탄이 너무 많이 겹치지 않게
  rentals: 1, // 조건 멤버가 없으면 한 명은 빌려 갈 수 있다 (강화는 맞춘 값 그대로 · 더 키운 보너스 없음)
  dayCap: 360, // 다시 깨서 받는 사탕 하루 한도 (첫 클리어 · 새 저주 기록 보너스는 따로)
  wear: 0.1, wearMax: 0.3, // 할로윈 의상을 입은 멤버 한 명당 사탕 +10% (최대 +30%)
};
// 시즌 안인지 (한국 시간 10/7 ~ 11/2) — 화면 · 서버 같은 함수
export const hwSeason = (now = Date.now()) => { const s = seasonAt(now); return !!(s && s.id === HW.season); };
export const hwOpen = (lb, now = Date.now()) => hwSeason(now) && !!lb && (lb.master || (lb.maxStage | 0) >= HW.unlock);

// ─── 맵 (전투 배경 720×1290 · 입구 73.5% 높이 — 다른 맵과 같은 틀) ───
export const HW_MAPS = {
  alley: { id: 'alley', name: '귀신 들린 랑방 골목', img: '/img/lb/hw/bg_hw_alley.webp', fx: 'leaves', tint: '#ff8a2a' },
  bar: { id: 'bar', name: '귀신 들린 술집', img: '/img/lb/hw/bg_hw_bar.webp', fx: 'flicker', tint: '#b06cff' },
  grave: { id: 'grave', name: '공동묘지 회식', img: '/img/lb/hw/bg_hw_grave.webp', fx: 'fog', tint: '#6fe0a0' },
  fest: { id: 'fest', name: '호박 축제 · 드라큘라 성', img: '/img/lb/hw/bg_hw_fest.webp', fx: 'wisps', tint: '#ff4a5a' },
};

// ─── 출전 제한 (스테이지마다 1~2개) ───
//  ban: 이 멤버는 못 데려감 · need: 이 중 n 명은 꼭 · max: 데려갈 수 있는 수
const range0 = (id) => { const r = HEROES[id] && HEROES[id].range; return Array.isArray(r) ? r[0] : r || 0; };
export const SUPPORTERS = ['bangjang', 'gunnyeo', 'dohoon', 'jungmin', 'soyoung'];
export const RULES = {
  noLegend: { name: 'LEGEND 금지', icon: '👑', desc: 'LEGEND 멤버(이호찬 · 강병화)는 이번 판 쉬어요', ban: (id) => ['hochan', 'byunghwa'].includes(id) },
  ranged: { name: '원거리만', icon: '🏹', desc: '사거리 300 이상 멤버만 — 호박 폭탄 곁에 붙으면 안 돼요', ban: (id) => range0(id) < 300 },
  sup2: { name: '서포터 2명 필수', icon: '✚', desc: '방장 · 건전녀 · 김도훈 · 홍정민 · 정소영 중 2명 이상 — 단톡 저주(침묵)와 쓰러짐을 버텨요', need: SUPPORTERS, n: 2 },
  charmImm: { name: '홀림 면역 필수', icon: '♥', desc: '정소영(팀 홀림 면역)을 꼭 — 마녀 다단계의 영입 윙크를 막아요', need: Object.keys(KD_SUP).filter((h) => KD_SUP[h].res && KD_SUP[h].res.charm >= 100), n: 1 },
  cleanse: { name: '쓰러짐 회복 필수', icon: '✚', desc: '건전녀(쓰러짐 회복 · 응급 방패)를 꼭 — 저승사자의 야근 명부를 지워요', need: ['gunnyeo'], n: 1 },
  booze: { name: '술 속성만', icon: '🍶', desc: '공동묘지 회식엔 술 속성 멤버만 들어갈 수 있어요', ban: (id) => HEROES[id].attr !== 'booze' },
  breaker: { name: '방깎 · 방관 필수', icon: '🛡', desc: '여지원 · 건전남 · 고아라 · 강성구 중 1명 이상 — 미라 부장님은 붕대 철갑이에요', need: ARMOR_BREAKERS, n: 1 },
  notank: { name: '탱커 없이', icon: '🚫', desc: '탱커(백인규 · 정원식 · 윤정섭)는 못 들어가요 — 쓰러짐은 서포터로 버텨요', ban: (id) => HERO_ROLE[id] === 'tank' },
  max4: { name: '4명만 출전', icon: '4', desc: '이번 판은 4명만 데려갈 수 있어요', max: 4 },
  female: { name: '여자 멤버만', icon: '♀', desc: '마녀들의 호박 축제 — 여자 멤버만 입장!', ban: (id) => HEROES[id].gender !== 'f' },
  poison: { name: '독 면역 필수', icon: '☠', desc: '홍정민(팀 독 면역)을 꼭 — 드라큘라 사장의 피의 와인은 독이에요', need: Object.keys(KD_SUP).filter((h) => KD_SUP[h].res && KD_SUP[h].res.poison >= 100), n: 1 },
};
export const RULE_IDS = Object.keys(RULES);

// ─── 할로윈 진상 (ENEMIES 에 있는 id) ───
export const HW_ENEMY_IDS = ['hw_zombie', 'hw_pumpkin', 'hw_seed', 'hw_bat', 'hw_ghost', 'hw_witch', 'hw_jiangshi', 'hw_mummy', 'hw_reaper', 'hw_dracula'];

// ─── 스테이지 10개 ───
//  base: 레벨 · 체력 · 웨이브 성격을 빌려 올 일반 스테이지 (4장 = 강화 +12 권장 장 · 쓰러짐 · 방어율도 4장 기준) · add: 레벨 보정 (scripts/lb-hw-balance.js calib 로 맞춘 값)
//  mix: [진상, 비중] · mid: 3웨이브 중간 보스 · boss: 마지막 웨이브 보스
export const STAGES = [
  { n: 1, name: '골목 입구의 좀비 회식러', map: 'alley', rules: ['noLegend'], base: 31, add: -3.5, keys: ['jiwon', 'sanghwa', 'dragon', 'eunok'], keyWhy: '부활 막기(검열 · 장미 · 화상) · 범위', mix: [['hw_zombie', 5], ['hw_pumpkin', 2], ['hw_bat', 2]], story: '회식 3차에서 좀비가 된 직장인들이 골목을 메웠다. "한 잔만 더어…"' },
  { n: 2, name: '호박등 골목', map: 'alley', rules: ['ranged'], base: 32, add: -9.25, keys: ['staff', 'jieun', 'gunman', 'eunok', 'sunggu'], keyWhy: '폭탄 끊기(레드카드 · 시간 정지) · 멀리서 빨리', mix: [['hw_pumpkin', 5], ['hw_bat', 3], ['hw_zombie', 2]], story: '호박머리 진상이 입구 앞에서 펑! — 붙어 싸우면 같이 터진다.' },
  { n: 3, name: '단톡방의 원한', map: 'bar', rules: ['sup2'], base: 33, add: 2, keys: ['staff', 'gunman', 'hyungyeong', 'soyoung'], keyWhy: '유령 찾기(운영진 · 건전남 · 배현경) · 침묵 막기', mix: [['hw_ghost', 5], ['hw_zombie', 3], ['hw_bat', 2]], story: '읽씹당한 처녀귀신 단톡방장이 술집을 점령했다. 단톡 초대 = 침묵의 저주.' },
  { n: 4, name: '마녀 다단계 설명회', map: 'bar', rules: ['charmImm'], base: 34, add: 0, keys: ['soyoung', 'jiwon', 'ara', 'dragon'], keyWhy: '홀림 면역 · 물약 회복 막기(방깎 · 화상 · 고아라)', mix: [['hw_witch', 4], ['hw_ghost', 3], ['hw_pumpkin', 2]], story: '"건강 물약 한 병이면 인생 역전!" 마녀의 영입 윙크에 홀리면 끝장.' },
  { n: 5, name: '저승사자 팀장의 야근 명부', map: 'bar', rules: ['cleanse'], base: 35, add: -9.25, keys: ['gunnyeo', 'staff', 'jieun', 'dohoon'], keyWhy: '명부 지우기(응급 방패) · 팀장 끊기(기절 · 시간 정지)', mix: [['hw_ghost', 3], ['hw_zombie', 3], ['hw_witch', 2]], mid: 'hw_reaper', story: '명부에 이름이 적히면 3초 뒤 강제 퇴근(쓰러짐). 건전녀의 방패만이 명부를 지운다.' },
  { n: 6, name: '공동묘지 회식', map: 'grave', rules: ['booze'], base: 36, add: -4.75, keys: ['dragon', 'dohoon', 'ara', 'eunok'], keyWhy: '빙결 막기(박나영) · 기절 저항(김도훈) · 강시 철갑', mix: [['hw_jiangshi', 4], ['hw_ghost', 3], ['hw_zombie', 2]], story: '묘지 한가운데서 고기 굽는 강시 꼰대. 술 못 마시는 사람은 입장 불가!' },
  { n: 7, name: '강시 꼰대의 라떼 부적', map: 'grave', rules: ['breaker', 'notank'], base: 37, add: -13.75, keys: ['jiwon', 'gunman', 'ara', 'sunggu', 'gunnyeo'], keyWhy: '붕대 철갑 깨기(방깎 · 방관) · 기절 · 빙결 풀기', mix: [['hw_jiangshi', 4], ['hw_mummy', 3], ['hw_witch', 2]], story: '"라떼는 말이야~" 부적이 붙으면 꽁꽁. 붕대 철갑 미라 부장님까지 합류했다.' },
  { n: 8, name: '미라 부장님 결재 라인', map: 'grave', rules: ['max4', 'sup2'], base: 38, add: -7.5, keys: ['gunnyeo', 'soyoung', 'jiwon', 'gunman', 'staff'], keyWhy: '명부 지우기 · 철갑 깨기 · 유령 찾기', mix: [['hw_mummy', 4], ['hw_ghost', 3], ['hw_bat', 3]], mid: 'hw_reaper', story: '결재가 안 끝나는 밤. 4명이서 버텨야 한다 — 그중 둘은 서포터로.' },
  { n: 9, name: '호박 축제의 마녀들', map: 'fest', rules: ['female'], base: 39, add: -9, keys: ['staff', 'jiwon', 'ara', 'soyoung', 'eunok', 'jieun'], keyWhy: '폭탄 끊기 · 물약 막기 · 유령 찾기', mix: [['hw_witch', 4], ['hw_pumpkin', 4], ['hw_bat', 2], ['hw_ghost', 2]], story: '마녀들이 연 호박 축제. 여자 멤버만 입장 가능 — 호박은 여전히 터진다!' },
  { n: 10, name: '드라큘라 사장의 강제 회식', map: 'fest', rules: ['poison', 'noLegend'], base: 40, add: -0.25, keys: ['jungmin', 'gunnyeo', 'soyoung', 'jiwon', 'ara'], keyWhy: '피의 와인(독) · 홀림 · 명부 · 흡혈 회복 막기', mix: [['hw_bat', 4], ['hw_zombie', 2], ['hw_ghost', 2], ['hw_mummy', 2], ['hw_witch', 2]], mid: 'hw_reaper', boss: 'hw_dracula', story: '"오늘 회식은 우리 성에서 한다. 빠지면 해고야!" 피의 와인은 독 — 홍정민이 꼭 필요하다.' },
];
export const STAGE_COUNT = STAGES.length;
export const stageOf = (n) => STAGES[int(n, 1, STAGE_COUNT) - 1];
export const stageRules = (n) => stageOf(n).rules.map((r) => Object.assign({ id: r }, RULES[r]));
export const stageEnemies = (n) => { const s = stageOf(n); return uniq([...s.mix.map((m) => m[0]), ...(s.mix.some((m) => m[0] === 'hw_pumpkin') ? ['hw_seed'] : []), ...(s.mid ? [s.mid] : []), ...(s.boss ? [s.boss] : [])]); };

// 전투 웨이브 (5개): 일반 스테이지 base 의 레벨 · 체력 · 웨이브 성격(떼 · 정예 · 혼합)을 그대로 빌리고 진상만 할로윈으로
export const WAVES = 5;
export function waveDef(n, w, curses = []) {
  const st = stageOf(n);
  const b = stageWave(st.base, w);
  // 원래 웨이브의 총 체력만큼 할로윈 진상으로 (머릿수 비중 = mix) — 단단한 진상이 많으면 그만큼 적게
  const packN = (d) => (d && (d.pack || d.group) ? ((d.pack || d.group).min + (d.pack || d.group).max) / 2 : 1);
  const hpOf = (t) => (ENEMIES[t] ? ENEMIES[t].hp : 30);
  const baseHp = b.g.reduce((a, x) => a + x[1] * packN(ENEMIES[x[0]]) * hpOf(x[0]), 0);
  const sum = st.mix.reduce((a, m) => a + m[1], 0);
  const per = st.mix.reduce((a, [t, wt]) => a + (wt / sum) * hpOf(t), 0);
  const heads = (baseHp / Math.max(1, per)) * HW.crowd; // 할로윈 진상 머릿수 (기술이 있는 진상이라 수는 줄이고 체력으로 — crowd)
  const elite = b.kind === 'E';
  const dur = 13 + 0.12 * (st.base - 1);
  const g = [];
  st.mix.forEach(([t, wt], i) => {
    const d = ENEMIES[t];
    let c = Math.round((heads * wt) / sum / packN(d));
    if (c <= 0) c = (w + i) % 2 ? 1 : 0;
    if (c > 0) g.push([t, c, +(dur / c).toFixed(2), +(i * 0.7).toFixed(1), elite ? 'E' : '']);
  });
  if (b.kind === 'M') { const tough = st.mix.slice().sort((x, y) => ENEMIES[y[0]].hp - ENEMIES[x[0]].hp)[0]; if (tough) g.push([tough[0], 2 + ((n + w) % 3), +(dur / 4).toFixed(2), 3, 'E']); }
  const def = { g, level: b.level + (st.add || 0) + (w === WAVES && st.boss ? -1.5 : 0), hpScale: b.hpScale / HW.crowd, kind: b.kind, fodderHp: b.fodderHp, eliteHp: Math.min(b.eliteHp || 1, 1.7), clump: b.clump }; // (정예는 기술 진상이라 체력 배율을 덜)
  if (w === 3 && st.mid) def.mid = st.mid;
  if (w === WAVES && st.boss) { def.boss = st.boss; if (curses.includes('twin')) def.boss2 = 'hw_reaper'; } // 저주 '보스 둘': 드라큘라 사장 + 저승사자 팀장
  else if (w === WAVES && curses.includes('twin')) def.mid = 'hw_reaper'; // 보스가 없는 판: 마지막 웨이브에 저승사자 팀장
  if (def.mid) def.midHp = HW.crowd; if (def.boss) def.bossHp = HW.crowd; if (def.boss2) def.boss2Hp = HW.crowd; // 보스 · 중간 보스는 머릿수 보정(crowd) 체력을 빼고 원래대로
  return def;
}
// sim.js createGame({ event }) 이 받는 판 정보
export function eventDef(n, curses = [], deck = []) {
  const st = stageOf(n);
  const cs = cleanCurses(curses);
  return { id: HW.id, crowd: HW.crowd, n: st.n, name: st.name, map: st.map, mapImg: HW_MAPS[st.map].img, fx: HW_MAPS[st.map].fx, stage: st.base, curses: cs, waves: Array.from({ length: WAVES }, (_, i) => waveDef(st.n, i + 1, cs)), mul: curseMul(cs), deck };
}

// ─── 저주 (스테이지를 한 번 깬 뒤부터) — 점수(pt)가 곧 랭킹 점수 · 사탕 ───
//  sim 이 쓰는 숫자: hp(진상 체력 ×) · spd(진상 이동 ×) · repair(수리 ×) · cc(멤버 상태이상 시간 ×) · wind(예고 시간 ×) · door(입구 내구도 ×) · mom(기세 충전 ×) · puddle · twin · dark
export const CURSES = {
  hp30: { name: '진상 체력 +20%', icon: '💪', pt: 3, fx: { hp: 1.2 } },
  hp60: { name: '진상 체력 +40%', icon: '💀', pt: 5, fx: { hp: 1.4 }, need: 'hp30', group: 'hp' },
  norepair: { name: '수리 금지', icon: '🔧', pt: 1, fx: { repair: 0 }, desc: '입구 수리 · 회복이 안 돼요' },
  stun2: { name: '상태이상 2배', icon: '⭐', pt: 2, fx: { cc: 2 }, desc: '멤버가 걸리는 기절 · 홀림 · 빙결 · 독이 두 배로 길게' },
  puddle: { name: '독 웅덩이', icon: '☠', pt: 3, fx: { puddle: 1 }, desc: '8초마다 멤버 발밑에 독 웅덩이 (홍정민이 있으면 막아요)' },
  short: { name: '예고 짧게', icon: '⏱', pt: 3, fx: { wind: 0.6 }, desc: '진상 기술 예고가 40% 짧아요 — 끊기 어려워요' },
  fast: { name: '진상 이동 +20%', icon: '💨', pt: 3, fx: { spd: 1.2 } },
  door: { name: '입구 내구도 −30%', icon: '🚪', pt: 2, fx: { door: 0.7 } },
  dark: { name: '보름달 어둠', icon: '🌕', pt: 2, fx: { dark: 1 }, desc: '안개가 짙어 멤버 사거리 −15%' },
  slowmom: { name: '기세 충전 −40%', icon: '📣', pt: 2, fx: { mom: 0.6 } },
  twin: { name: '보스 둘', icon: '👥', pt: 3, fx: { twin: 1 }, desc: '마지막 웨이브에 저승사자 팀장이 한 명 더' },
};
export const CURSE_IDS = Object.keys(CURSES);
export const CURSE_MAX = CURSE_IDS.reduce((a, k) => a + CURSES[k].pt, 0);
export function cleanCurses(list) {
  const out = uniq((Array.isArray(list) ? list : []).map(String).filter((k) => CURSES[k])).slice(0, CURSE_IDS.length);
  return out.filter((k) => !CURSES[k].need || out.includes(CURSES[k].need)); // 체력 +60% 는 +30% 를 건 다음에
}
export const curseScore = (list) => cleanCurses(list).reduce((a, k) => a + CURSES[k].pt, 0);
export function curseMul(list) {
  const m = { hp: 1, spd: 1, repair: 1, cc: 1, wind: 1, door: 1, mom: 1, puddle: 0, twin: 0, dark: 0 };
  for (const k of cleanCurses(list)) for (const [a, v] of Object.entries(CURSES[k].fx)) m[a] = ['puddle', 'twin', 'dark'].includes(a) ? 1 : a === 'repair' ? Math.min(m[a], v) : a === 'hp' ? Math.max(m[a], v) : m[a] * v; // 체력 +20% → +40% 는 바꿔 끼우기 (곱하지 않음)
  return m;
}
// 랭킹 점수 (스테이지 하나): 클리어 1000 + 저주 1점마다 250 + 남은 입구 % × 3
export const stageScore = (heat, door) => 1000 + int(heat, 0, CURSE_MAX) * 250 + int(door, 0, 100) * 3;

// ─── 덱 확인 (출전 제한) ───
//  ids: 데려갈 멤버 · own(id): 가진 멤버인지 · 빌린 멤버(rent)는 조건 멤버만 · 한 명만
export function checkDeck(n, ids, own, rent = null) {
  const st = stageOf(n);
  const errs = [];
  const list = uniq((ids || []).filter((h) => HEROES[h] && !HEROES[h].summon));
  const max = Math.min(HW.slots, ...st.rules.map((r) => RULES[r].max || 99));
  if (!list.length) errs.push({ rule: null, text: '멤버를 한 명 이상 데려가요' });
  if (list.length > max) errs.push({ rule: st.rules.find((r) => RULES[r].max) || null, text: `${max}명까지만 데려갈 수 있어요` });
  if (rent && !list.includes(rent)) rent = null;
  for (const h of list) if (!own(h) && h !== rent) errs.push({ rule: null, hero: h, text: `${HEROES[h].name}: 아직 합류하지 않은 멤버예요` });
  if (rent && own(rent)) rent = null;
  if (rent && !st.rules.some((r) => RULES[r].need && RULES[r].need.includes(rent))) errs.push({ rule: null, hero: rent, text: `${HEROES[rent].name}: 빌릴 수 있는 건 조건 멤버뿐이에요` });
  for (const r of st.rules) {
    const R = RULES[r];
    if (R.ban) for (const h of list) if (R.ban(h)) errs.push({ rule: r, hero: h, text: `${HEROES[h].name}: ${R.name}` });
    if (R.need) { const have = list.filter((h) => R.need.includes(h)).length; if (have < (R.n || 1)) errs.push({ rule: r, text: `${R.name} (${have}/${R.n || 1})` }); }
  }
  return { ok: !errs.length, errs, max, list, rent };
}
// 조건을 맞추는 멤버 추천: 가진 멤버 중 (센 순서) · 없으면 빌릴 수 있는 멤버
export function suggest(n, ids, own, power = () => 0) {
  const st = stageOf(n);
  const banned = (h) => st.rules.some((r) => RULES[r].ban && RULES[r].ban(h));
  const out = [];
  for (const r of st.rules) {
    const R = RULES[r];
    if (!R.need) continue;
    const have = (ids || []).filter((h) => R.need.includes(h)).length;
    if (have >= (R.n || 1)) continue;
    const mine = R.need.filter((h) => HEROES[h] && own(h) && !(ids || []).includes(h) && !banned(h)).sort((a, b) => power(b) - power(a));
    const rent = R.need.filter((h) => HEROES[h] && !own(h) && !banned(h));
    out.push({ rule: r, need: (R.n || 1) - have, mine, rent });
  }
  // 금지 멤버 대신 넣을 수 있는 멤버
  const ok = Object.keys(HEROES).filter((h) => !HEROES[h].summon && own(h) && !banned(h) && !(ids || []).includes(h)).sort((a, b) => power(b) - power(a));
  return { needs: out, fill: ok.slice(0, 8) };
}

// ─── 전투력 맞추기 ───
//  강화: 정해진 값(+12)까지 · 그보다 높으면 4마다 +1 (최대 +2) · ★: 3 까지 · 장비: 전설 · 신화는 영웅 등급 값으로 (전용 신화 효과는 끔)
const RANK = { common: 0, rare: 1, epic: 2, legend: 3, myth: 4 };
export const syncMeta = (lv, rental = false) => { const m = int(lv, 0, 99); if (rental) return HW.sync.meta; return m <= HW.sync.meta ? m : HW.sync.meta + Math.min(HW.sync.edge, Math.floor((m - HW.sync.meta) / HW.sync.per)); };
export const syncStar = (s, rental = false) => (rental ? HW.sync.star : Math.max(1, Math.min(HW.sync.star, int(s, 1, 9))));
export function syncLoadout(p, ids, rent = null) {
  const meta = {}, stars = {}, gear = {};
  for (const id of ids || []) {
    if (!HEROES[id]) continue;
    const r = id === rent;
    meta[id] = syncMeta(((p && p.heroes) || {})[id], r);
    stars[id] = syncStar(((p && p.hstars) || {})[id], r);
    if (r) { gear[id] = gearStats([]); continue; }
    const sl = ((p && p.equip) || {})[id] || {};
    const items = ['w', 'a', 'm'].map((k) => ((p && p.gear) || []).find((g) => g && sl[k] !== undefined && g.id === sl[k])).filter((it) => it && GEAR[it.t] && gearFits(it.t, id))
      .map((it) => ((RANK[it.r] | 0) > RANK.epic && !GEAR[it.t].myth ? Object.assign({}, it, { r: HW.sync.rarity }) : it));
    gear[id] = gearStats(items, GEAR_RARITY.epic.mul / GEAR_RARITY.myth.mul);
  }
  return { meta, stars, gear };
}

// ─── 할로윈 의상 (능력치 같음 · 겉모습만) ───
//  그림: /img/lb/hw/h_<hero>_hw.webp (256) · _attack (2048×256 8칸 · 원래 멤버와 같은 release 칸) · dex/<hero>_hw.webp (640) · dexhq/<hero>_hw.webp (800×1200) · dexhq/thumb/<hero>_hw.webp (400×600)
//  tint: 투사체 색 · fx: 할로윈 꼬리 (박쥐 · 호박 · 유령 불빛)
export const COSTUMES = {
  gunnyeo_hw: { hero: 'gunnyeo', name: '좀비 간호사 건전녀', sub: '붕대 감고도 응급처치는 확실하게', tint: '#7be38f', fx: 'ghost' },
  hochan_hw: { hero: 'hochan', name: '드라큘라 방장 이호찬', sub: '막차 대신 박쥐 망토 — "랑방의 밤은 내가 지배한다"', tint: '#ff3355', fx: 'bat' },
  jieun_hw: { hero: 'jieun', name: '시간의 마녀 오지은', sub: '모래시계 지팡이로 할로윈 밤을 멈춘다', tint: '#b46cff', fx: 'witch' },
  sunggu_hw: { hero: 'sunggu', name: '미라 할아버지 강성구', sub: '붕대 사이로 지팡이는 여전히 번쩍', tint: '#e8d9a8', fx: 'bandage' },
  ara_hw: { hero: 'ara', name: '호박 공주 고아라', sub: '호박 망치 한 방이면 보스도 잭오랜턴', tint: '#ff8a1f', fx: 'pumpkin' },
};
export const COSTUME_IDS = Object.keys(COSTUMES);
export const costumeOf = (hero) => COSTUME_IDS.find((k) => COSTUMES[k].hero === hero) || null;
const ART = '/img/lb/hw/';
export const costumeArt = (id) => { const c = COSTUMES[id]; if (!c) return null; const h = c.hero; return { img: `${ART}h_${h}_hw.webp`, attack: `${ART}h_${h}_hw_attack.webp`, dex: `${ART}dex_${h}_hw.webp`, hq: `${ART}hq_${h}_hw.webp`, thumb: `${ART}thumb_${h}_hw.webp` }; };
// 지금 입은 의상: { 멤버: 의상 id } (가진 의상만)
export function wornMap(lb) {
  const s = (lb && lb.skins) || {};
  const out = {};
  for (const [h, id] of Object.entries(s.on || {})) if (COSTUMES[id] && COSTUMES[id].hero === h && (s.own || []).includes(id)) out[h] = id;
  return out;
}
export function wearSkin(lb, hero, id) {
  lb.skins = lb.skins || { own: [], on: {} };
  if (!HEROES[hero]) return { error: '없는 멤버예요' };
  if (id) {
    if (!COSTUMES[id] || COSTUMES[id].hero !== hero) return { error: '이 멤버 의상이 아니에요' };
    if (!lb.skins.own.includes(id)) return { error: '아직 없는 의상이에요 (할로윈 사탕 상점)' };
    lb.skins.on[hero] = id;
  } else delete lb.skins.on[hero];
  return { on: wornMap(lb) };
}
export function normSkins(raw, out) {
  const s = (raw && raw.skins) || {};
  const own = uniq((Array.isArray(s.own) ? s.own : []).filter((k) => COSTUMES[k]));
  const on = {};
  for (const [h, id] of Object.entries(s.on && typeof s.on === 'object' ? s.on : {})) if (COSTUMES[id] && COSTUMES[id].hero === h && own.includes(id)) on[h] = id;
  out.skins = { own, on };
  return out;
}
// 덱에서 할로윈 의상을 입은 멤버 수 → 사탕 보너스
export const wearBonus = (lb, ids) => Math.min(HW.wearMax, HW.wear * (ids || []).filter((h) => wornMap(lb)[h]).length);

// ─── 사탕 · 상점 ───
export const CANDY_ART = '/img/lb/hw/candy.webp';
export const firstCandy = (n) => 60 + 15 * (int(n, 1, STAGE_COUNT) - 1) + (stageOf(n).boss ? 80 : stageOf(n).mid ? 30 : 0); // 처음 깰 때
export const clearCandy = (n, heat) => 12 + Math.floor(int(n, 1, STAGE_COUNT) * 1.5) + int(heat, 0, CURSE_MAX) * 4; // 깰 때마다 (하루 한도 dayCap)
export const heatCandy = (gain) => int(gain, 0, CURSE_MAX) * 15; // 그 스테이지 저주 기록을 새로 세우면 (늘어난 점수 × 15)
//  kind: costume(의상) · title · frame · tickets(모집권) · shards(박나영 조각) · stones(강화석) · gear(장비 상자)
export const SHOP = [
  ...COSTUME_IDS.map((id) => ({ id, kind: 'costume', cost: 900, n: 1, name: COSTUMES[id].name })),
  { id: 'hwtitle', kind: 'title', title: 'hwsurvivor', cost: 300, n: 1, name: '칭호 「저주의 밤 생존자」' },
  { id: 'hwframe', kind: 'frame', frame: 'hwframe', cost: 450, n: 1, name: '호박등 프레임' },
  { id: 'hwticket', kind: 'tickets', amount: 1, cost: 120, n: 10, name: '모집권 1장' },
  { id: 'hwdragon', kind: 'shards', hero: 'dragon', amount: 10, cost: 200, n: 5, name: '박나영 조각 10개' },
  { id: 'hwstones', kind: 'stones', amount: 20, cost: 100, n: 10, name: '강화석 20개' },
  { id: 'hwgear', kind: 'gear', rarity: 'epic', cost: 260, n: 3, name: '영웅 장비 상자' },
  { id: 'hwlegend', kind: 'gear', rarity: 'legend', cost: 900, n: 1, name: '전설 장비 상자' },
];
export const shopItem = (id) => SHOP.find((s) => s.id === id) || null;

// ─── 기록 (lb.hw) ───
//  best: { n: { heat, score, door } } · candy · day/dayGot (하루 한도) · run (진행 중인 판) · buy: { id: 산 수 } · runs · lastAt
export function emptyHw() { return { id: HW.id, best: {}, candy: 0, day: -1, dayGot: 0, run: null, buy: {}, runs: 0, score: 0, at: 0 }; }
export const totalScore = (hw) => Object.values((hw && hw.best) || {}).reduce((a, b) => a + (b.score | 0), 0);
export function normHw(raw, out) {
  const h = (raw && raw.hw) || {};
  const o = emptyHw();
  if (h.id === HW.id) { // 다른 해 이벤트 기록은 버린다 (의상 · 칭호는 skins · titles 에 남는다)
    for (const [k, v] of Object.entries(h.best || {})) { const n = int(k, 0, 99); if (n >= 1 && n <= STAGE_COUNT && v) o.best[n] = { heat: int(v.heat, 0, CURSE_MAX), score: int(v.score, 0, 1e7), door: int(v.door, 0, 100), sec: int(v.sec, 0, 1e6) }; }
    o.candy = int(h.candy, 0, 1e7);
    o.day = Number.isInteger(h.day) ? h.day : -1;
    o.dayGot = int(h.dayGot, 0, 1e6);
    o.run = h.run && typeof h.run.id === 'string' && h.run.id.length <= 32 ? { id: h.run.id, n: int(h.run.n, 1, STAGE_COUNT), at: int(h.run.at, 0, 9e15), curses: cleanCurses(h.run.curses), deck: uniq((h.run.deck || []).filter((x) => HEROES[x])).slice(0, HW.slots), rent: HEROES[h.run.rent] ? h.run.rent : null } : null;
    for (const [k, v] of Object.entries(h.buy || {})) if (shopItem(k)) o.buy[k] = int(v, 0, 99);
    o.runs = int(h.runs, 0, 1e6);
    o.at = int(h.at, 0, 9e15);
    if (h.paid) o.paid = true; // 순위 보상 받음
  }
  o.score = totalScore(o);
  out.hw = o;
  return out;
}
export const cleared = (lb, n) => !!(((lb && lb.hw) || {}).best || {})[n];
// 열린 스테이지: 1 ~ (깬 마지막 + 1)
export const maxOpen = (lb) => { const b = ((lb && lb.hw) || {}).best || {}; let n = 1; while (n < STAGE_COUNT && b[n]) n++; return n; };

// ─── 시작 · 끝 (서버가 판 번호 · 시간 · 처치 수 · 덱 · 저주를 확인하고 보상은 서버가 계산) ───
export function hwStart(lb, body, runId, now = Date.now()) {
  if (!hwSeason(now)) return { error: '할로윈 이벤트 기간이 아니에요 (10/7 ~ 11/2)' };
  if (!hwOpen(lb, now)) return { error: `할로윈 이벤트는 ${Math.ceil(HW.unlock / 10)}-10 을 깨면 열려요` };
  lb.hw = lb.hw && lb.hw.id === HW.id ? lb.hw : emptyHw();
  const n = int(body.n, 0, 99);
  if (n < 1 || n > STAGE_COUNT) return { error: '없는 스테이지예요' };
  if (n > maxOpen(lb) && !lb.master) return { error: '앞 스테이지를 먼저 깨요' };
  const curses = cleanCurses(body.curses);
  if (curses.length && !cleared(lb, n) && !lb.master) return { error: '저주는 한 번 깬 스테이지에만 걸 수 있어요' };
  const deck = uniq((Array.isArray(body.deck) ? body.deck : []).map(String)).slice(0, 8);
  const rent = body.rent ? String(body.rent) : null;
  const chk = checkDeck(n, deck, (h) => L.heroUnlocked(lb, h), rent);
  if (!chk.ok) return { error: chk.errs[0].text, errs: chk.errs };
  lb.hw.run = { id: String(runId).slice(0, 32), n, at: now, curses, deck: chk.list, rent: chk.rent };
  return { runId: lb.hw.run.id, n, curses, deck: chk.list, rent: chk.rent, heat: curseScore(curses) };
}
export function hwFinish(lb, body, uid, now = Date.now()) {
  lb.hw = lb.hw && lb.hw.id === HW.id ? lb.hw : emptyHw();
  const h = lb.hw, run = h.run;
  if (!run || run.id !== String(body.runId || '')) return { error: '이벤트 판을 다시 시작해 주세요' };
  h.run = null;
  const clear = body.clear === true;
  const dur = int(body.durationSec, 0, 1e6), kills = int(body.kills, 0, 1e6), door = int(body.door, 0, 100);
  if (clear) {
    if (dur < WAVES * HW.minSec || dur > ((now - run.at) / 1000) * 1.15 + 20) return { error: '기록을 확인할 수 없어요' };
    let cap = 0; for (let w = 1; w <= WAVES; w++) for (const x of waveDef(run.n, w, run.curses).g) cap += x[1] * 2.6; cap += 90 * WAVES;
    if (kills > cap) return { error: '기록을 확인할 수 없어요' };
  }
  const heat = curseScore(run.curses);
  const out = { clear, n: run.n, heat, first: false, best: false, candy: 0, parts: {}, score: 0, total: 0 };
  h.runs++;
  L.trackRun(lb, { mode: 'event', kills: Math.min(kills, 2000), bosses: clear && stageOf(run.n).boss ? 1 : 0, skills: L.skillCap(body.skills, dur) }, uid, now);
  if (clear) {
    const day = L.dayIndex(now);
    if (h.day !== day) { h.day = day; h.dayGot = 0; }
    const prev = h.best[run.n];
    const sc = stageScore(heat, door);
    out.score = sc;
    if (!prev) { out.first = true; out.parts.first = firstCandy(run.n); }
    if (prev && heat > prev.heat) out.parts.heat = heatCandy(heat - prev.heat);
    const rep = clearCandy(run.n, heat);
    const room = Math.max(0, HW.dayCap - h.dayGot);
    out.parts.clear = Math.min(rep, room);
    h.dayGot += out.parts.clear;
    if (room < rep) out.capped = true;
    const base = (out.parts.first || 0) + (out.parts.heat || 0) + out.parts.clear;
    const wb = wearBonus(lb, run.deck);
    if (wb > 0) out.parts.wear = Math.round(base * wb);
    out.candy = base + (out.parts.wear || 0);
    h.candy += out.candy;
    if (!prev || sc > prev.score) { h.best[run.n] = { heat: Math.max(heat, prev ? prev.heat : 0), score: Math.max(sc, prev ? prev.score : 0), door, sec: dur }; out.best = true; h.at = now; }
    else if (heat > prev.heat) prev.heat = heat;
  }
  h.score = totalScore(h);
  out.total = h.score;
  out.left = HW.dayCap - h.dayGot;
  return out;
}
// 상점: 산 수 · 사탕 확인 → 보상 (서버 계산)
export function shopLeft(lb, id) { const s = shopItem(id); if (!s) return 0; return Math.max(0, s.n - ((((lb.hw || {}).buy) || {})[id] | 0)); }
export function shopBuy(lb, id, uid, now = Date.now()) {
  lb.hw = lb.hw && lb.hw.id === HW.id ? lb.hw : emptyHw();
  const s = shopItem(id);
  if (!s) return { error: '살 수 없는 물건이에요' };
  if (!hwSeason(now) && !lb.master) return { error: '할로윈 이벤트 기간이 끝났어요' };
  if (shopLeft(lb, id) <= 0) return { error: '이미 다 샀어요' };
  if (s.kind === 'costume' && ((lb.skins || {}).own || []).includes(id)) return { error: '이미 가진 의상이에요' };
  if (s.kind === 'title' && (lb.titles || []).includes(s.title)) return { error: '이미 가진 칭호예요' };
  if (s.kind === 'frame' && (lb.frames || []).includes(s.frame)) return { error: '이미 가진 프레임이에요' };
  if ((lb.hw.candy | 0) < s.cost) return { error: `사탕이 부족해요 (${s.cost}개 필요)` };
  lb.hw.candy -= s.cost;
  lb.hw.buy[id] = (lb.hw.buy[id] | 0) + 1;
  let got = {};
  if (s.kind === 'costume') { lb.skins = lb.skins || { own: [], on: {} }; lb.skins.own = uniq([...(lb.skins.own || []), id]); got = { costume: id }; }
  else if (s.kind === 'title') got = L.grant(lb, { title: s.title }, uid, now);
  else if (s.kind === 'frame') got = L.grant(lb, { frame: s.frame }, uid, now);
  else if (s.kind === 'tickets') got = L.grant(lb, { tickets: s.amount }, uid, now);
  else if (s.kind === 'stones') got = L.grant(lb, { stones: s.amount }, uid, now);
  else if (s.kind === 'shards') { lb.shards = lb.shards || {}; lb.shards[s.hero] = (lb.shards[s.hero] | 0) + s.amount; got = { shards: { [s.hero]: s.amount } }; }
  else if (s.kind === 'gear') got = L.grant(lb, { gear: s.rarity }, uid, now + (lb.hw.buy[id] | 0));
  return { got, candy: lb.hw.candy, left: shopLeft(lb, id) };
}
// 랭킹 한 줄 (서버 정렬 · 화면 표시 같은 값)
export const rankScore = (lb) => (lb && lb.hw && lb.hw.id === HW.id ? totalScore(lb.hw) : 0);
// 이벤트 랭킹 보상 (기간이 끝난 뒤 · 순위는 서버가 센다)
export function rankReward(rank) {
  if (!rank) return null;
  if (rank === 1) return { tickets: 5, stones: 200, title: 'hwking', label: '할로윈 랭킹 1위 — 할로윈 저주왕' };
  if (rank <= 3) return { tickets: 3, stones: 120, title: 'hwking', label: `할로윈 랭킹 ${rank}위 — 할로윈 저주왕` };
  if (rank <= 10) return { tickets: 2, stones: 60, label: `할로윈 랭킹 ${rank}위 (TOP 10)` };
  return { tickets: 1, stones: 20, label: `할로윈 랭킹 ${rank}위 (참가)` };
}
// 이 판에서 볼 수 있는 진상 (출전 준비 · 로딩 그림)
export const stageArt = (n) => stageEnemies(n).map((t) => ENEMIES[t] && ENEMIES[t].img).filter(Boolean);
export const seedFor = (runId) => hashSeed('hw:' + runId);
