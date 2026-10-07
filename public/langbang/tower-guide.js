// 랑방 대전 — 진상의 탑 초보 가이드 (10/08): 역할 (탱커 · 힐러 · 딜러 · 해제/면역 · 끊기) · "이 층 공략" (위험마다 쉬운 말 + 할 일 + 내 멤버 중 추천 + 없으면 이렇게) · 탑 튜토리얼 레슨
//  DOM 없음 (test/langbang-tower-guide.test.js) — 화면은 tower-ui.js · 말풍선 · 손가락은 tutorial.js createTutor 를 그대로 쓴다
import { HEROES, KD_HERO, KD_SUP } from './data.js';
import { HZ, floorPlan, resOf, teamRes, ARENA } from './tower-arena.js';

// ─── 역할 ───
//  탱커: 탑 체력(= 쓰러짐 게이지 × 10)이 커서 오래 버틴다 · 힐러: 탑에서 체력 회복 + 쓰러진 멤버를 빨리 일으킨다 (tower-arena.js ARENA.heal)
//  해제/면역: 팀 전체 상태이상 저항 · 면역 (KD_SUP.res) · 방장 지휘 (받는 피해 −15%) · 딜러: 나머지 — 빨리 잡는 몫
//  끊기: 진상을 기절 · 묶는 스킬 (기 모으기를 끊는다 — 51층부터)
export const ROLES = {
  tank: { id: 'tank', name: '탱커', icon: 'shield', color: '#6fb7ff', short: '대신 맞기', desc: '체력이 커서 오래 버텨요. 경고에 한 번 맞아도 잘 안 쓰러져요' },
  healer: { id: 'healer', name: '힐러', icon: 'heal', color: '#5fe08a', short: '회복 · 빨리 일으키기', desc: '멤버 체력을 채워 주고, 쓰러진 멤버를 더 빨리 일으켜요' },
  dealer: { id: 'dealer', name: '딜러', icon: 'swords', color: '#ff8a5a', short: '빨리 잡기', desc: '진상을 빨리 잡아요. 체력이 작으니 경고는 꼭 피해요' },
  support: { id: 'support', name: '해제 · 면역', icon: 'sparkle', color: '#c9a2ff', short: '상태이상 막기', desc: '팀 전체 기절 · 독 · 홀림 같은 상태이상을 줄이거나 막아요' },
};
export const ROLE_IDS = ['tank', 'healer', 'dealer', 'support'];
export const HEALERS = ['gunnyeo', 'jungmin'];
export const CUTTERS = ['staff', 'myunghoon', 'sunggu', 'hochan', 'jiwon', 'jeongseob', 'subin']; // 기절 · 묶기 스킬 (기 모으기 끊기)
const SUPPORT_MAIN = ['bangjang', 'dohoon', 'soyoung']; // 주 역할이 해제 · 면역인 멤버
export const TANK_KD = 1.4;
const supRes = (id) => (KD_SUP[id] && KD_SUP[id].res) || null;
// 주 역할 하나
export function roleOf(id) {
  if (HEALERS.includes(id)) return 'healer';
  if (SUPPORT_MAIN.includes(id)) return 'support';
  if ((KD_HERO[id] || 1) >= TANK_KD) return 'tank';
  return 'dealer';
}
// 딱지 (주 역할 + 덤): [{ k, txt }]
export function roleTags(id) {
  const out = [{ k: roleOf(id), txt: ROLES[roleOf(id)].name }];
  const r = supRes(id);
  if (r && roleOf(id) !== 'support') out.push({ k: 'support', txt: '팀 ' + Object.keys(r).map((k) => (HZ[k] ? HZ[k].name : k)).join(' · ') });
  if (CUTTERS.includes(id)) out.push({ k: 'cut', txt: '끊기' });
  return out;
}
// 한 줄 설명 (역할 가이드 · 추천 이유)
export function roleLine(id) {
  const k = roleOf(id);
  if (id === 'gunnyeo') return '가장 아픈 멤버를 계속 회복 · 스킬 = 모두 회복 + 상태이상 풀기 · 쓰러진 멤버가 빨리 일어나요';
  if (id === 'jungmin') return '모두를 조금씩 회복 · 팀 전체 독 면역';
  if (id === 'bangjang') return '지휘: 팀 전체 받는 피해 −15%';
  if (KD_SUP[id] && KD_SUP[id].tip && k === 'support') return KD_SUP[id].tip.split(' — ')[0] + ' (팀 전체)';
  if (k === 'tank') return `체력이 커요 (보통 멤버의 ${Math.round((KD_HERO[id] || 1) * 10) / 10}배)`;
  return '공격 담당 · 체력이 작아 경고는 꼭 피하기';
}

// ─── 위험마다 쉬운 말 · 할 일 ───
//  act: dodge 피하기 · spread 흩어지기 · group 모이기 · cut 끊기 · inside 안으로
export const ACTS = {
  dodge: { id: 'dodge', name: '피하기', color: '#ffd23f' },
  spread: { id: 'spread', name: '흩어지기', color: '#5ff2ff' },
  group: { id: 'group', name: '모이기', color: '#8cffb0' },
  cut: { id: 'cut', name: '끊기', color: '#ff6a7a' },
};
export const HZ_GUIDE = {
  hit: { what: '바닥 경고가 다 차오르면 쾅! 안에 있던 멤버 체력이 깎여요.', how: '경고 모양이 뜨면 멤버를 끌어서 밖으로 옮겨요.', act: ['dodge'], alt: '' },
  stun: { what: '맞으면 2~3초 넘게 기절해요. 공격도, 이동도 못 해요.', how: '원 · 줄이 뜨면 바로 밖으로 끌어요.', act: ['dodge'], alt: '기절에 강한 멤버가 없으면 → 한 명씩 차분히 피하기만 해도 충분해요' },
  shock: { what: '맞은 멤버 곁(가까이 선 멤버)으로 번개가 번져요.', how: '셋이 서로 떨어져 서요. 붙어 있으면 줄줄이 감전!', act: ['spread', 'dodge'], alt: '감전에 강한 멤버가 없으면 → 셋을 화면 왼쪽 · 가운데 · 오른쪽으로 벌려 세워요' },
  freeze: { what: '얼어서 한참 꼼짝 못 해요. 고리 모양은 안쪽이 안전해요.', how: '원 · 띠는 밖으로, 고리는 가운데로!', act: ['dodge'], alt: '빙결에 강한 멤버가 없으면 → 고리가 뜨면 셋 다 고리 한가운데로 모여요' },
  poison: { what: '맞은 자리에 독 웅덩이가 5초 남고, 체력이 계속 깎여요.', how: '피하고 · 초록 웅덩이는 밟지 않아요.', act: ['dodge'], alt: '독에 강한 멤버가 없으면 → 웅덩이에서 먼 쪽으로 옮기고 힐러를 데려가요' },
  charm: { what: '진상 쪽으로 질질 끌려가요 (그동안 조종 못 함).', how: '부채꼴이 뜨면 옆으로 비켜요.', act: ['dodge'], alt: '홀림에 강한 멤버가 없으면 → 부채꼴 옆으로 크게 비켜 서요' },
  silence: { what: '맞으면 한동안 스킬을 못 써요.', how: '줄 · 띠가 뜨면 밖으로. 스킬 쓸 멤버를 먼저 지켜요.', act: ['dodge'], alt: '침묵에 강한 멤버가 없으면 → 스킬은 경고가 없을 때 미리 써 둬요' },
  knock: { what: '맞으면 멀리 밀려나 휘청해요. 다른 경고 위로 밀릴 수도!', how: '벽 쪽보다 가운데에 서서 피해요.', act: ['dodge'], alt: '넉백에 강한 멤버가 없으면 → 화면 가운데에 서서, 밀려도 경고 밖이 되게' },
  slow: { what: '걸음과 공격이 느려져요. 다음 경고를 못 피할 수 있어요.', how: '맞지 않게 일찍 움직여요.', act: ['dodge'], alt: '감속에 강한 멤버가 없으면 → 경고가 뜨자마자 바로 움직여요' },
};
export const WIND_GUIDE = { name: '기 모으기', what: '진상이 크게 기를 모아요. 다 모으면 초록 원 밖은 전부 폭발 + 기절!', how: '초록 원 안으로 셋 다 모이거나, 그 진상을 탭해 집중 공격 · 기절 스킬로 끊어요.', act: ['group', 'cut'], alt: '끊는 멤버가 없으면 → 초록 원이 뜨자마자 셋 다 원 안으로 끌어 모아요' };
export const TIER_EASY = [
  '연습 층: 바닥 경고 없이 몸풀기',
  '바닥 경고가 떠요 — 맞아도 체력만 조금. 끌어서 피하는 연습!',
  '경고에 맞으면 한참 기절해요 — 꼭 피하기',
  '층마다 위험 하나 — 그 위험에 강한 멤버가 편해요',
  '위험 둘 + 기 모으기 — 모이거나 끊기',
  '위험 셋 · 경고가 짧아요 — 고수 구간',
];

// ─── 이 층 공략 ───
//  owned: 가진 멤버 id 목록 · power(id): 셀수록 큰 수 (없으면 체력 크기 순)
//  돌려줌: { f, tier, easy, hazards:[{ kind, name, color, what, how, act:[…], best:[{id, v, team}] }], wind, picks:[{ id, role, why }], alts:[문장], party:[id…3] }
export function floorGuide(f, owned = [], power = null) {
  const pl = floorPlan(f);
  const own = [...new Set(owned)].filter((id) => HEROES[id] && !HEROES[id].summon);
  const pw = (id) => (power ? power(id) : (KD_HERO[id] || 1) * 100);
  const byPow = own.slice().sort((a, b) => pw(b) - pw(a));
  const kinds = pl.kinds.filter((k) => HZ_GUIDE[k]);
  const hazards = kinds.map((k) => {
    const G = HZ_GUIDE[k], H = HZ[k];
    const best = k === 'hit' ? [] : own.map((id) => { const tm = teamRes(k).find((x) => x.id === id); const v = Math.max(resOf(id, k), tm ? tm.v : 0); return { id, v, team: !!tm }; }).filter((x) => x.v >= 30).sort((a, b) => b.v - a.v || pw(b.id) - pw(a.id)).slice(0, 3);
    return { kind: k, name: H.name, color: H.color, what: G.what, how: G.how, act: G.act.slice(), best, alt: G.alt };
  });
  const wind = pl.wind ? Object.assign({ kind: 'wind', color: '#ff3b4f' }, WIND_GUIDE, { act: WIND_GUIDE.act.slice() }) : null;
  // 추천 파티 3명: ① 위험마다 가장 강한 멤버 ② 기 모으기 층이면 끊는 멤버 ③ 힐러 ④ 탱커 ⑤ 센 멤버로 채우기
  const picks = [], has = (id) => picks.some((p) => p.id === id), add = (id, role, why) => { if (id && !has(id) && picks.length < 3) picks.push({ id, role, why }); };
  for (const hz of hazards) { const b = hz.best[0]; if (b) add(b.id, roleOf(b.id), b.team ? `팀 전체 ${hz.name} ${b.v >= 100 ? '면역' : `−${b.v}%`}` : `${hz.name} 저항 ${b.v}%`); }
  if (wind) { const c = byPow.find((id) => CUTTERS.includes(id) && !has(id)); if (c) add(c, roleOf(c), '기절 · 묶기 스킬로 기 모으기 끊기'); }
  const healer = HEALERS.find((id) => own.includes(id));
  if (healer && !has(healer) && picks.length < 3) add(healer, 'healer', roleLine(healer));
  const tank = byPow.find((id) => roleOf(id) === 'tank' && !has(id));
  if (tank && pl.tier >= 2 && picks.length < 3) add(tank, 'tank', '체력이 커서 경고에 맞아도 잘 버텨요');
  for (const id of byPow) { if (picks.length >= 3) break; if (!has(id)) add(id, roleOf(id), roleOf(id) === 'tank' ? '체력이 커서 잘 버텨요' : '내 멤버 중 센 편 — 빨리 잡기'); }
  // 없으면 이렇게
  const alts = [];
  for (const hz of hazards) if (!hz.best.length && hz.alt) alts.push(hz.alt);
  if (wind && !own.some((id) => CUTTERS.includes(id))) alts.push(WIND_GUIDE.alt);
  if (!healer && pl.tier >= 2) alts.push('힐러(건전녀 · 홍정민)가 없으면 → 체력 막대가 노래진 멤버는 경고가 없는 구석으로 빼서 쉬게 해요 (맞지 않으면 조금씩 차요)');
  if (!own.some((id) => roleOf(id) === 'tank') && pl.tier >= 2) alts.push('탱커가 없으면 → 피하기에 더 집중! 한 번에 한 멤버씩 옮겨요');
  return { f, tier: pl.tier, easy: TIER_EASY[pl.tier], hazards, wind, picks, alts, party: picks.map((p) => p.id) };
}
// 지금 파티에 빠진 역할 (로비 · 가이드에서 한 줄 경고) — 힐러 · 탱커 · 위험 저항
export function partyHint(f, squad = []) {
  const pl = floorPlan(f), sq = squad.filter((id) => HEROES[id]);
  if (pl.tier < 2 || !sq.length) return '';
  if (!sq.some((id) => HEALERS.includes(id))) return '파티에 힐러가 없어요 — 쓰러지면 10초 동안 못 일어나요';
  if (!sq.some((id) => roleOf(id) === 'tank') && sq.length >= 3) return '파티에 탱커가 없어요 — 피하기에 더 집중!';
  return '';
}
// 탑 체력 비교용 (역할 가이드): 보통 멤버(1.0) 대비
export const hpScale = (id) => KD_HERO[id] || 1;
export const DOWN_SEC = ARENA.down.sec;

// ─── 탑 튜토리얼 (tutorial.js createTutor 에 lessons 로 넘긴다) ───
//  c: { where, prac(연습 판), step(연습 단계: tele · hp · down · wind), blocked, modal, hasRes(로비에 저항 칩) }
//  필드 대상: { f:'member' } · { f:'tele' } · { f:'hpbar' } · { f:'down' } · { f:'wind' } (tower-ui.js fieldRect)
const lobby = (c) => c.where === 'tower';
const prac = (c) => c.where === 'play' && !!c.prac;
export const TOWER_LESSONS = [
  { id: 'twlobby', need: 'any', when: lobby, scope: lobby, beats: [
    { id: 'hi', when: (c) => !!c.ready, say: '<b>진상의 탑</b>에 온 걸 환영해요!<br>여기선 멤버 <b>3명</b>이 한 팀이에요. 처음이니까 천천히 같이 봐요', hold: 0, tap: 'bubble' },
    { id: 'party', at: '.tw-party', say: '아래가 우리 <b>파티</b>예요. 칸을 누르면 멤버를 바꿔요.<br><b>탱커</b>(오래 버티기) · <b>힐러</b>(회복) · <b>딜러</b>(빨리 잡기)를 섞으면 편해요', hold: 0, tap: 'bubble' },
    { id: 'res', at: '.tw-mem .tw-res', skip: (c) => !c.hasRes, say: '이 칩은 <b>저항</b>이에요. "감전 −70%" = 감전에 맞아도 훨씬 짧게!<br>층마다 위험이 달라서, 맞는 멤버가 편해요', hold: 0, tap: 'bubble', maxWait: 2 },
    { id: 'guide', at: '.fc-guide', say: '<b>이 층 공략</b>: 뭘 조심할지 · 뭘 할지 · 내 멤버 중 누굴 데려갈지 알려 줘요.<br><b>추천 파티 넣기</b>를 누르면 한 번에!', hold: 0, tap: 'bubble', maxWait: 3 },
    { id: 'roles', at: '[data-act="twRoles"]', say: '역할이 헷갈리면 <b>역할 가이드</b>! 내 멤버가 무슨 역할인지 보여 줘요', hold: 0, tap: 'bubble', maxWait: 3 },
    { id: 'prac', at: '[data-act="twPractice"]', hand: 'tap', say: '먼저 <b>연습 층</b>에서 몸풀기!<br>도전 횟수 · 피로는 안 써요', hold: 0, tap: 'target', maxWait: 3 },
  ] },
  { id: 'twprac', need: 'any', when: prac, scope: prac, beats: [
    { id: 'hi', say: '여기는 <b>연습 층</b>이에요. 진상은 약하고 입구도 안 무너져요.<br>하나씩 해 봐요!', hold: 0, tap: 'bubble' },
    { id: 'drag', at: { f: 'member' }, hand: 'swipe', say: '멤버를 <b>꾹 눌러 옆으로 끌어</b> 보세요.<br>손을 뗀 곳으로 걸어가요', hold: 0.3, dim: false, on: 'twaMove', maxWait: 6, relax: 60 },
    { id: 'tele', when: (c) => c.step === 'tele', at: { f: 'tele' }, hand: 'swipe', say: '바닥에 <b>빨간 원</b>이 떴어요! 다 차오르면 터져요.<br>멤버를 <b>원 밖으로</b> 끌어요!', hold: 0.3, dim: false, on: 'twaDodge', maxWait: 8, relax: 90 },
    { id: 'nice', say: '잘했어요! <b>회피!</b><br>층이 높아지면 맞을 때 <b>기절 · 감전 · 독</b>까지 붙어요. 경고 색을 보고 피해요', hold: 0, tap: 'bubble' },
    { id: 'hp', when: (c) => c.step === 'hp', at: { f: 'hpbar' }, say: '발밑 <b>초록 막대</b>가 탑 전용 <b>체력</b>이에요.<br>맞으면 줄고, 안 맞고 있으면 조금씩 차요', hold: 0, tap: 'bubble', maxWait: 6 },
    { id: 'down', when: (c) => c.step === 'down', at: { f: 'down' }, say: '체력이 0이면 <b>쓰러짐</b> — 10초 뒤 일어나요.<br><b>모두 쓰러지면 실패!</b> 힐러가 있으면 회복 · 더 빨리 일어나요', hold: 0, tap: 'bubble', maxWait: 6 },
    { id: 'wind', when: (c) => c.step === 'wind', at: { f: 'wind' }, hand: 'tap', say: '진상이 <b>기를 모아요!</b> 다 모으면 큰 폭발.<br>그 진상을 <b>탭</b>해 집중 공격하거나 <b>기절 스킬</b>로 끊어요!', hold: 0.3, dim: false, on: 'twaCut', maxWait: 30, relax: 90 },
    { id: 'cut', say: '<b>끊었다!</b> 끊긴 진상은 잠깐 빈틈이 생겨요.<br>못 끊겠으면 <b>초록 원</b> 안으로 셋 다 모여도 안전해요', hold: 0, tap: 'bubble' },
    { id: 'end', say: '연습 끝! 진짜 층에서는 <b>이 층 공략</b>을 꼭 확인해요.<br>다시 보고 싶으면 탑 로비 <b>?</b> 버튼!', hold: 0, tap: 'bubble' },
  ] },
];
export const TOWER_TUT_LS = 'langbang:twtut:';
