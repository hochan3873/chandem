// 랑방 대전 — 오래 즐기는 장치: 주간 도전 · 미션/업적 · 모집(뽑기) · 무료 시즌 · 멤버 성급
// 순수 함수만 (DOM 없음). 서버(server/accounts.js)가 이 파일을 그대로 불러 쓰고, 손님은 같은 함수로 이 기기에 저장한다.
// → 공식이 한 곳에만 있어서 서버와 화면이 어긋날 일이 없다.
// 모든 코인은 게임 안 점수일 뿐 (현금 결제 없음).
import {
  HEROES, ENEMIES, MAP_FX, GACHA_HEROES, LEGEND_HEROES, LOCKED_HEROES, HERO_UNLOCK,
  GEAR_IDS, MYTH_IDS, GEAR_RARITIES, GEAR_BAG, gearSellValue, seedRng, hashSeed, stageWave, stageBosses, STAGE_COUNT, heroTier, GEAR, CURSES,
  SIG, SIG_IDS, SIG_PITY, SIG_DUP_SHARDS, SIG_RATE, WEEK_TRAITS,
} from './data.js';
export const stageBossN = (s) => stageBosses(s).length;

const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

// ─── 시간 (한국 시간 기준) ─────────────────────────────
// 주: 월요일 00:00 (KST) 시작. 0주 = 2026-09-28(월) 주
export const KST = 9 * 3600e3;
export const DAY = 86400e3;
// ─── 전투 소모품 (한 번 쓰면 끝) ───
// 출전 칸에 넣어 가면 전투 중 버튼으로 쓴다 · 판마다 칸당 1번 · 소모품끼리 3초 간격 · 1:1 랭크 대전은 못 씀
export const CONS = {
  battery: { id: 'battery', name: '보조배터리', rarity: 'epic', icon: 'it_battery', desc: '방어진(입구) 내구도를 100% 로 가득 채워요', tip: '위급할 때 한 번! 판마다 1개만' },
  aldicom: { id: 'aldicom', name: '알디콤', rarity: 'rare', icon: 'it_aldicom', desc: '숙취 해소! 모든 멤버 상태이상 해제 + 5초 상태이상 면역 · 입구 근처 진상 버프 깨기', tip: '기절·침묵·홀림이 한꺼번에 걸렸을 때' },
  tambourine: { id: 'tambourine', name: '노래방 탬버린', rarity: 'rare', icon: 'it_tambourine', desc: '8초 동안 모든 멤버 공격 속도 +40%', tip: '보스가 나왔을 때 · 떼거리가 몰려올 때' },
  taxi: { id: 'taxi', name: '막차 택시 호출권', rarity: 'epic', icon: 'it_taxi', desc: '택시가 길을 쓸고 지나가 화면의 진상을 두 칸 밀치고 3초 40% 느리게 (보스는 한 칸 · 안 느려짐)', tip: '입구에 진상이 잔뜩 붙었을 때' },
  icewater: { id: 'icewater', name: '얼음물 한 잔', rarity: 'epic', icon: 'it_icewater', desc: '보스 빼고 모두 3초 꽁꽁 · 보스는 3초 50% 느리게', tip: '스킬을 몰아 쓰기 직전에' },
  reroll: { id: 'reroll', name: '증강 새로고침 쿠폰', rarity: 'rare', icon: 'it_reroll', desc: '레벨업 카드 화면에서 카드를 한 번 새로 뽑아요', tip: '원하는 멤버 카드가 안 뜰 때' },
  bombshot: { id: 'bombshot', name: '폭탄주', rarity: 'epic', icon: 'it_bombshot', banner: '화면 진상에게 한 방!', desc: '화면 위 진상 모두에게 최대 체력 40% 피해 (보스·중간 보스는 6%)', tip: '떼거리가 화면을 꽉 채웠을 때' },
  energydrink: { id: 'energydrink', name: '에너지 드링크', rarity: 'rare', icon: 'it_energydrink', banner: '스킬 전부 준비 완료!', desc: '모든 멤버 스킬 쿨타임 바로 충전 · 기진맥진 풀기 · 기세 +1칸', tip: '스킬을 다 쓴 직후 보스가 나왔을 때' },
  bouncer: { id: 'bouncer', name: '경호원 호출', rarity: 'epic', icon: 'it_bouncer', banner: '8초 동안 입구 철벽', desc: '8초 동안 입구가 받는 피해 −80%', tip: '입구에 진상이 붙어 마구 때릴 때' },
  uiriju: { id: 'uiriju', name: '의리주', rarity: 'legend', icon: 'it_uiriju', hidden: true, desc: '12초 동안 모든 멤버 공격력 +60% · 공격 속도 +20% · 기세 +1칸', tip: '진짜 친구들끼리만 아는 술', hint: '방장 · 건전남 · 건전녀가 함께 보스를 잡으면? · 출석 20일 · 헬 모드에서 아주 가끔' },
};
// 그림이 아직 없는 소모품: 비슷한 그림을 대신 쓴다 (public/img/lb/ui2/<art>.webp 가 생기면 여기서 지우기)
export const CONS_ART_TODO = {};
for (const [id, fb] of Object.entries(CONS_ART_TODO)) if (CONS[id]) { CONS[id].art = CONS[id].icon; CONS[id].icon = fb; }
// 얻는 곳 (서버 시드로): 2장부터 알디콤 8% · 3장부터 보스 판 보조배터리 3% · 탬버린 6% · 택시 3% · 얼음물 3% · 쿠폰 5% · 헬 의리주 0.5%
//  · 에너지 드링크 4%(2장~) · 폭탄주 3%(3장~) · 경호원 호출 4%(4장~ 보스 판)
export function rollCons(seed, stage, stars, hell, deck) {
  if (!stars) return {};
  let a = (seed ^ 0x2c0f) >>> 0;
  const rng = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ch = Math.ceil(stage / 10), boss = stage % 10 === 0 || stage % 5 === 0;
  const out = {};
  const add = (id) => { out[id] = (out[id] | 0) + 1; };
  if (ch >= 2 && rng() < 0.08) add('aldicom');
  if (ch >= 2 && rng() < 0.06) add('tambourine');
  if (ch >= 2 && rng() < 0.05) add('reroll');
  if (ch >= 3 && boss && rng() < 0.03) add('battery');
  if (ch >= 3 && rng() < 0.03) add('taxi');
  if (ch >= 3 && rng() < 0.03) add('icewater');
  if (hell && rng() < 0.005) add('uiriju');
  // 히든: 창립 멤버 셋(방장 · 건전남 · 건전녀)이 함께 보스 판을 깨면 의리주 (처음 한 번은 꼭 · 그 뒤 10%)
  if (boss && Array.isArray(deck) && ['bangjang', 'gunman', 'gunnyeo'].every((h) => deck.includes(h)) && rng() < 0.1) add('uiriju');
  // 새 소모품 (뒤에 굴려서 기존 드롭은 그대로): 2장부터 에너지 드링크 4% · 3장부터 폭탄주 3% · 4장부터 보스 판 경호원 4%
  if (ch >= 2 && rng() < 0.04) add('energydrink');
  if (ch >= 3 && rng() < 0.03) add('bombshot');
  if (ch >= 4 && boss && rng() < 0.04) add('bouncer');
  return out;
}
export function consAdd(lb, got) { lb.cons = lb.cons || {}; lb.consDex = Array.isArray(lb.consDex) ? lb.consDex : []; for (const [k, v] of Object.entries(got || {})) if (CONS[k] && v > 0) { lb.cons[k] = Math.min(CONS_CAP, (lb.cons[k] | 0) + v); if (!lb.consDex.includes(k)) lb.consDex.push(k); } }
// 상점: 보조배터리 주 1개 (강화석 100) · 에너지 드링크 하루 1개 (코인 1,800) · 경호원 호출 주 2개 (강화석 60) · 폭탄주는 드롭만 · 알디콤 하루 3개 (코인) · 탬버린 · 쿠폰 하루 2개 (코인)
export const CONS_SHOP = { battery: { stones: 100, per: 'week', n: 1 }, aldicom: { coins: 800, per: 'day', n: 3 }, tambourine: { coins: 1200, per: 'day', n: 2 }, reroll: { coins: 1500, per: 'day', n: 2 }, energydrink: { coins: 1800, per: 'day', n: 1 }, bouncer: { stones: 60, per: 'week', n: 2 } };
export function consShopLeft(lb, id, now = Date.now()) {
  const s = CONS_SHOP[id]; if (!s) return 0;
  const key = s.per === 'week' ? 'w' + weekIndex(now) : 'd' + dayIndex(now);
  const b = (lb.consBuy || {})[id];
  return Math.max(0, s.n - (b && b.k === key ? b.n | 0 : 0));
}
export function consBuy(lb, id, now = Date.now()) {
  const s = CONS_SHOP[id];
  if (!s || !CONS[id]) return { error: '살 수 없는 소모품이에요' };
  if (consShopLeft(lb, id, now) <= 0) return { error: s.per === 'week' ? '이번 주에 다 샀어요' : '오늘은 다 샀어요' };
  if (s.stones && (lb.stones | 0) < s.stones) return { error: `강화석이 부족해요 (${s.stones} 필요)` };
  if (s.coins && (lb.coins | 0) < s.coins) return { error: `코인이 부족해요 (${s.coins.toLocaleString()} 필요)` };
  if ((lb.cons || {})[id] >= CONS_CAP) return { error: '더 가질 수 없어요 (99개)' };
  if (s.stones) lb.stones -= s.stones; if (s.coins) lb.coins -= s.coins;
  const key = s.per === 'week' ? 'w' + weekIndex(now) : 'd' + dayIndex(now);
  lb.consBuy = lb.consBuy || {};
  const b = lb.consBuy[id] && lb.consBuy[id].k === key ? lb.consBuy[id] : { k: key, n: 0 };
  b.n++; lb.consBuy[id] = b;
  consAdd(lb, { [id]: 1 });
  return { got: { cons: { [id]: 1 } } };
}
export const CONS_IDS = Object.keys(CONS);
export const CONS_CAP = 99;
export const consSlots = (lv) => ((lv | 0) >= 20 ? 3 : 2); // 계정 Lv 20 부터 칸 3개
// 전투 시작: 가져가는 소모품을 1개씩 먼저 뺀다 (서버가 개수를 믿음) · 전에 끝내지 않은 판에 가져간 건 그 판에서 쓴 걸로 친다
export function consStart(lb, ids, now = Date.now()) {
  lb.cons = lb.cons || {};
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter((id) => CONS[id]).slice(0, consSlots(lb.level));
  const take = want.filter((id) => (lb.cons[id] | 0) > 0);
  for (const id of take) { lb.cons[id] = (lb.cons[id] | 0) - 1; if (!lb.cons[id]) delete lb.cons[id]; }
  lb.consRun = take.length ? { ids: take, at: now } : null;
  return { cons: take };
}
// 전투 끝: 안 쓴 것만 돌려준다 · 가져가지 않은 걸 썼다고 하면 무시 (한 판 1번)
export function consEnd(lb, used) {
  const run = lb.consRun; lb.consRun = null;
  if (!run) return { refund: [] };
  const u = new Set((Array.isArray(used) ? used : Object.keys(used || {}).filter((k) => (used[k] | 0) > 0)).map(String));
  const refund = run.ids.filter((id) => !u.has(id));
  lb.cons = lb.cons || {};
  for (const id of refund) lb.cons[id] = Math.min(CONS_CAP, (lb.cons[id] | 0) + 1);
  return { refund, used: run.ids.filter((id) => u.has(id)) };
}
// 선물(우편) 캠페인: 마스터가 보낸 선물 · 계정마다 한 번만 (id 로 막음)
export const WELCOME_GIFT = { id: 'welcome_cons_v1', from: '랑방', title: '새 소모품 도착!', text: '전투에서 쓰는 소모품이에요. 출전 화면 소모품 칸에 넣어 가요', rw: { cons: { aldicom: 2, tambourine: 1, battery: 1 } } };
export function giftTake(lb, gift, now = Date.now()) {
  lb.gifts = Array.isArray(lb.gifts) ? lb.gifts : [];
  if (!gift || !gift.id || lb.gifts.includes(gift.id)) return false;
  lb.gifts.push(gift.id); if (lb.gifts.length > 100) lb.gifts = lb.gifts.slice(-100);
  mailAdd(lb, { title: gift.title, text: gift.text, from: gift.from, rw: gift.rw, days: gift.days }, now);
  return true;
}
// 이 계정이 받을 수 있나: 캠페인을 만들기 전 24시간 안에 놀았거나, 캠페인이 열려 있는 동안 들어왔다
export const lastActive = (lb) => Math.max(Number(lb.lastSeenAt) || 0, Number(lb.lastResultAt) || 0, Number(lb.sta && lb.sta.t) || 0); // (밀리초라서 |0 쓰면 안 됨)
export const giftEligible = (lb, c, now = Date.now()) => !!c && now < (c.at + (c.days || MAIL_DAYS) * DAY) && (now <= c.openUntil || lastActive(lb) >= c.activeSince);
export const WEEK = 7 * DAY;
export const EPOCH = Date.UTC(2026, 8, 28); // KST 로 옮긴 시각 기준 2026-09-28 00:00
export const weekIndex = (now = Date.now()) => Math.floor((now + KST - EPOCH) / WEEK);
export const dayIndex = (now = Date.now()) => Math.floor((now + KST - EPOCH) / DAY);
export const weekStartMs = (wi) => EPOCH + wi * WEEK - KST; // 진짜(UTC) 시각
export const msToWeekEnd = (now = Date.now()) => weekStartMs(weekIndex(now) + 1) - now;
export const msToDayEnd = (now = Date.now()) => EPOCH + (dayIndex(now) + 1) * DAY - KST - now;
// 주간 진상 특성 (일반 스테이지 · 헬): 주마다 차례로 돈다 — 서버 · 화면 같은 공식
export const weekTrait = (wi = weekIndex()) => WEEK_TRAITS[((Math.floor(Number(wi)) || 0) % WEEK_TRAITS.length + WEEK_TRAITS.length) % WEEK_TRAITS.length];
export function weekLabel(wi) {
  const a = new Date(EPOCH + wi * WEEK), b = new Date(EPOCH + wi * WEEK + 6 * DAY);
  return `${a.getUTCMonth() + 1}/${a.getUTCDate()} ~ ${b.getUTCMonth() + 1}/${b.getUTCDate()}`;
}
export function leftText(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mm}분` : `${mm}분`;
}

// ─── 멤버 소유 · 성급 ─────────────────────────────────
export function heroUnlocked(lb, id) {
  if (!HEROES[id]) return false;
  if (lb.master) return true; // 마스터(운영자) 테스트 계정: 전부 (서버가 정한다)
  if (!LOCKED_HEROES.includes(id)) return true;
  if (lb.owned && lb.owned[id]) return true;
  if (!HERO_UNLOCK[id]) return false; // 모집 멤버는 모집으로만
  return ((lb.stages || {})[HERO_UNLOCK[id]] | 0) > 0 || ((lb.heroes || {})[id] | 0) > 0;
}
export const STAR_MAX = 5;
export const STAR_SHARDS = [0, 20, 40, 70, 110]; // ★n → ★n+1 에 드는 조각
export const STAR_COINS = [0, 500, 1500, 3000, 6000];
export const STAR_ATK = 0.07; // ★ 하나마다 공격력 +7% (★1 = 기본)
export const heroStar = (lb, id) => Math.max(1, Math.min(STAR_MAX, ((lb.hstars || {})[id]) | 0 || 1));
export const starBonus = (star) => STAR_ATK * (Math.max(1, star) - 1);
export function starUp(lb, id) {
  if (!heroUnlocked(lb, id)) return { error: '아직 합류하지 않은 멤버예요' };
  const s = heroStar(lb, id);
  if (s >= STAR_MAX) return { error: '이미 ★5 예요' };
  const need = STAR_SHARDS[s], coins = STAR_COINS[s];
  if (((lb.shards || {})[id] | 0) < need) return { error: `조각이 부족해요 (${need}개 필요)` };
  if ((lb.coins | 0) < coins) return { error: `코인이 부족해요 (${coins.toLocaleString()} 필요)` };
  lb.shards[id] -= need;
  lb.coins -= coins;
  lb.hstars[id] = s + 1;
  return { star: s + 1 };
}

// ─── 도감 수집 보너스: 많이 모을수록 계정 전체가 조금씩 세진다 ───
// 안 쓰는 멤버 · 장비도 모으기만 하면 보탬. 전부 모아도 공격력 +5% · 입구 +6% · 경험치 +6% · 스테이지 코인 +12% (스테이지 밸런스 안 깨지게 작게)
// 서버가 저장된 기록으로 계산해 프로필(coll)에 넣어 준다 (화면이 보낸 값은 안 믿음) · 1:1 대전은 빼요
//  n: 모은 수 ('all' = 전부) · fx: 단계마다 더하는 효과
export const COLLECT = [
  { k: 'hero', name: '모임 멤버', unit: '명', steps: [5, 10, 15, 20, 'all'], fx: { atk: 0.01 } },
  { k: 'enemy', name: '진상', unit: '종', steps: [15, 30, 45, 60, 75, 'all'], fx: { hp: 0.01 } },
  { k: 'item', name: '아이템', unit: '종', steps: [5, 10, 15, 20, 25, 'all'], fx: { exp: 0.01, coin: 0.02 } },
];
export const COLL_FX = { atk: '멤버 전원 공격력', hp: '입구 내구도', exp: '전투 경험치', coin: '스테이지 코인' };
const DEX_ENEMY_IDS = () => Object.keys(ENEMIES).filter((id) => !ENEMIES[id].dot && !ENEMIES[id].towerOnly && !ENEMIES[id].eventOnly); // 도감과 같은 목록 (탑 전용 보스 · 장판 빼고)
// 탭마다 [모은 수, 전체]
export function collectCounts(lb) {
  const seen = new Set(Array.isArray(lb.seen) ? lb.seen : []);
  const gd = new Set([...(Array.isArray(lb.gearDex) ? lb.gearDex : []), ...(Array.isArray(lb.gear) ? lb.gear.map((g) => g && g.t) : [])]);
  const items = [...GEAR_IDS, ...MYTH_IDS], foes = DEX_ENEMY_IDS();
  return { hero: [Object.keys(HEROES).filter((h) => heroUnlocked(lb, h)).length, Object.keys(HEROES).length], enemy: [foes.filter((e) => seen.has(e)).length, foes.length], item: [items.filter((t) => gd.has(t)).length, items.length] };
}
// → { atk, hp, exp, coin, tabs: { hero: { n, total, lv, max, next } … } }
export function collectBonus(lb) {
  const cnt = collectCounts(lb || {}), out = { atk: 0, hp: 0, exp: 0, coin: 0, tabs: {} };
  for (const c of COLLECT) {
    const [n, total] = cnt[c.k], need = c.steps.map((s) => (s === 'all' ? total : Math.min(s, total)));
    const lv = need.filter((s) => n >= s).length;
    for (const f in c.fx) out[f] = Math.round((out[f] + c.fx[f] * lv) * 1000) / 1000;
    out.tabs[c.k] = { n, total, lv, max: need.length, next: lv < need.length ? need[lv] : 0 };
  }
  return out;
}
// 전투에 넘기는 값만 (상한을 다시 걸어서 이상한 값이 와도 안전하게)
export function collectMods(c) {
  if (!c) return null;
  const cap = (v, hi) => Math.max(0, Math.min(hi, Number(v) || 0));
  return { atk: cap(c.atk, 0.05), hp: cap(c.hp, 0.06), exp: cap(c.exp, 0.06) };
}

// ─── 치장: 칭호 · 프레임 ───────────────────────────────
// 치장은 능력치가 없다 (대전 공정하게) — 다른 사람에게 보이는 멋 · 모으는 재미
//  rarity: common(그냥) · rare(빛나는 테두리) · epic(반짝이는 흐름) · legend(금빛 + 반짝이)
export const FRAMES = {
  neon: { id: 'neon', name: '네온 프레임', color: '#6ff0ff', rarity: 'rare', how: '시즌 20단계' },
  gold: { id: 'gold', name: '황금 프레임', color: '#ffcf3f', rarity: 'epic', how: '시즌 30단계' },
  crown: { id: 'crown', name: '챔피언 왕관', color: '#ff6fd8', rarity: 'legend', how: '주간 도전 1위' },
  rookie: { id: 'rookie', name: '새내기 프레임', color: '#9fb3c8', rarity: 'common', how: '1장 클리어' },
  star3: { id: 'star3', name: '별빛 프레임', color: '#ffe066', rarity: 'rare', how: '한 장 ★30 (전부 ★★★)' },
  pvpgold: { id: 'pvpgold', name: '골드 투기장', color: '#ffd35a', rarity: 'epic', how: '1:1 대전 골드 (1200점)' },
  pvpdia: { id: 'pvpdia', name: '다이아 투기장', color: '#6fd3ff', rarity: 'legend', how: '1:1 대전 다이아 (1500점)' },
  collector: { id: 'collector', name: '수집가 프레임', color: '#c77dff', rarity: 'epic', how: '멤버 16명 모으기' },
  towerflame: { id: 'towerflame', name: '지옥 불꽃 프레임', color: '#ff5a1f', rarity: 'epic', how: '진상의 탑 30층', anim: 'flame' }, // 진상의 탑 (움직이는 불꽃)
  towergold: { id: 'towergold', name: '황금 지옥 프레임', color: '#ffcf3f', rarity: 'legend', how: '진상의 탑 60층', anim: 'hellgold' },
  r2frame: { id: 'r2frame', name: '건물주 퇴치 프레임', color: '#ff7a3d', rarity: 'epic', how: '건물주 레이드 토벌 성공 (참가)' }, // 건물주 레이드
  hwframe: { id: 'hwframe', name: '호박등 프레임', color: '#ff8a1f', rarity: 'epic', how: '할로윈 이벤트 사탕 상점 (2026 할로윈)', anim: 'flame' }, // 할로윈 이벤트
};
// 칭호 카탈로그 (얻는 법 · 등급) — 시즌 칭호는 titleName 으로 따로
export const TITLE_INFO = {
  ewchamp: { rarity: 'legend', how: '무한 도전 주간 1위' }, collector: { rarity: 'legend', how: '장비 도감 전부 모으기' }, wchamp: { rarity: 'legend', how: '주간 도전 1위' }, wtop3: { rarity: 'epic', how: '주간 도전 TOP 3' }, gacha100: { rarity: 'rare', how: '업적: 모집 100번' },
  perfect30: { rarity: 'epic', how: '업적: PERFECT 30개' }, raid1: { rarity: 'legend', how: '레이드 데미지 1위' },
  ch1: { rarity: 'common', how: '1장 클리어' }, ch3: { rarity: 'rare', how: '3장 클리어' }, ch6: { rarity: 'legend', how: '6장 클리어' }, ch7: { rarity: 'legend', how: '7장 스키장 클리어 (고난도)' }, ch8: { rarity: 'legend', how: '8장 결혼식 뒤풀이 클리어 (고난도)' },
  allstar1: { rarity: 'rare', how: '1장 ★30' }, pvpsilver: { rarity: 'common', how: '1:1 대전 실버 (1050점)' }, pvpgold: { rarity: 'rare', how: '1:1 대전 골드 (1200점)' },
  heroes12: { rarity: 'rare', how: '멤버 12명 모으기' }, heroes20: { rarity: 'legend', how: '멤버 20명 모으기' },
  tower15: { rarity: 'rare', how: '진상의 탑 15층' }, tower60: { rarity: 'legend', how: '진상의 탑 60층' }, towerking: { rarity: 'legend', how: '주간 탑 랭킹 1위 (다음 한 주 동안)' }, popstar: { rarity: 'legend', how: '주간 인기 멤버 1위의 본캐 주인 (다음 한 주 동안)' },
  r2slayer: { rarity: 'epic', how: '건물주 레이드 토벌 성공 (참가)' }, r2king: { rarity: 'legend', how: '건물주 대마왕 본체 막타' }, r2mvp: { rarity: 'legend', how: '건물주 레이드 주간 기여 1위' }, // 건물주 레이드
  hwsurvivor: { rarity: 'epic', how: '할로윈 이벤트 사탕 상점 (2026 할로윈)' }, hwking: { rarity: 'legend', how: '할로윈 이벤트 랭킹 TOP 3 (2026 할로윈)' }, // 할로윈 이벤트
};
const TITLE_NAMES = { ch1: '골목 신입', ch3: '인피 격파자', ch6: '랑방의 전설', ch7: '설산의 정복자', ch8: '축의금 수호자', allstar1: '별 수집가', pvpsilver: '투기장 도전자', pvpgold: '투기장 강자', heroes12: '인맥왕', heroes20: '랑방 대가족', tower15: '탑 등반가', tower60: '진상 대왕 정복자', towerking: '이번 주 탑의 주인', popstar: '이번 주 인기 스타', r2slayer: '건물주 퇴치단', r2king: '막타왕', r2mvp: '건물주 저승사자', hwsurvivor: '저주의 밤 생존자', hwking: '할로윈 저주왕' };
// 조건을 채우면 저절로 들어오는 칭호 · 프레임 (서버 normLb · 손님 둘 다 같은 함수)
// 우편 보상은 정해진 칸만 (숫자 · 등급 · 칭호/프레임 이름)
function cleanRw(rw) {
  rw = rw || {};
  const o = {};
  for (const k of ['coins', 'tickets', 'sp', 'stones']) { const v = int(rw[k], 0, 1e7); if (v) o[k] = v; }
  if (GEAR_RARITIES.includes(rw.gear) || rw.gear === 'myth') o.gear = rw.gear;
  if (typeof rw.title === 'string' && rw.title.length < 16) o.title = rw.title;
  if (typeof rw.frame === 'string' && FRAMES[rw.frame]) o.frame = rw.frame;
  if (rw.cons && typeof rw.cons === 'object') { const c = {}; for (const [k, v] of Object.entries(rw.cons)) { const n = int(v, 0, CONS_CAP); if (CONS[k] && n) c[k] = n; } if (Object.keys(c).length) o.cons = c; }
  return o;
}
function autoCosmetics(raw) {
  const st = raw.stages || {};
  let max = raw.maxStage | 0; for (const k of Object.keys(st)) if ((st[k] | 0) > 0 && +k > max) max = +k;
  const chStars = (c) => { let n = 0; for (let i = 1; i <= 10; i++) n += st[(c - 1) * 10 + i] | 0; return n; };
  const full = [1, 2, 3, 4, 5, 6, 7, 8].some((c) => chStars(c) >= 30);
  const rating = ((raw.pvp || {}).rating) | 0;
  const heroes = Object.keys(HEROES).filter((h) => heroUnlocked(raw, h)).length;
  const t = [], f = [];
  if (max >= 10) { t.push('ch1'); f.push('rookie'); }
  if (max >= 30) t.push('ch3');
  if (max >= 60) t.push('ch6');
  if (max >= 70) t.push('ch7'); // 7장 스키장 정복
  if (max >= 80) t.push('ch8'); // 8장 결혼식 뒤풀이
  if (chStars(1) >= 30) t.push('allstar1');
  if (full) f.push('star3');
  if (rating >= 1050) t.push('pvpsilver');
  if (rating >= 1200) { t.push('pvpgold'); f.push('pvpgold'); }
  if (rating >= 1500) f.push('pvpdia');
  if (heroes >= 12) t.push('heroes12');
  if (heroes >= 16) f.push('collector');
  if (heroes >= 20) t.push('heroes20');
  return { t, f };
}
export const cosmeticRarity = (kind, id) => (kind === 'frame' ? (FRAMES[id] || {}).rarity : (TITLE_INFO[id] || (/^s\d+_t30$/.test(id) ? { rarity: 'legend' } : /^s\d+_t10$/.test(id) ? { rarity: 'rare' } : {})).rarity) || 'common';
export function titleName(id) {
  let m = /^s(\d{1,3})_t10$/.exec(id);
  if (m) return `시즌${m[1]} 단골`;
  m = /^s(\d{1,3})_t30$/.exec(id);
  if (m) return `시즌${m[1]} 랑방 레전드`;
  return { ewchamp: '무한의 지배자', wchamp: '주간 챔피언', wtop3: '주간 TOP 3', gacha100: '모집왕', collector: '장비 수집가', perfect30: '무결점 문지기', raid1: '레이드 MVP', ...TITLE_NAMES }[id] || '';
}
const titleOk = (id) => typeof id === 'string' && id.length < 16 && !!titleName(id);

// ─── 주간 도전전 ──────────────────────────────────────
export const WEEKLY_UNLOCK = 5; // 1-5 를 깨면 열림
export const WEEKLY_WAVES = 10;
export const WEEKLY_MODS = {
  bossrush: { id: 'bossrush', icon: '', name: '보스 러시', desc: '웨이브마다 보스가 나온다! 졸개는 조금', count: 0.6 },
  double: { id: 'double', icon: '', name: '진상 2배', desc: '진상이 두 배로 몰려온다 (한 명 한 명은 조금 약함)', count: 2, hp: 0.6 },
  speed: { id: 'speed', icon: '', name: '광속 진상', desc: '진상 이동 속도 +35%', enemySpd: 1.35 },
  glass: { id: 'glass', icon: '', name: '유리 입구', desc: '입구 내구도 절반 · 대신 경험치 +50%', baseHp: 0.5, exp: 0.5 },
  giant: { id: 'giant', icon: '', name: '거인의 밤', desc: '진상 수 절반 · 체력 2.2배', count: 0.5, hp: 2.2 },
  skill: { id: 'skill', icon: '', name: '스킬 축제', desc: '스킬 쿨타임 절반 · 진상 체력 +30%', cd: 0.5, hp: 1.3 },
};
const WEEKLY_FX = ['none', 'rain', 'fog', 'blackout', 'happy', 'karaoke', 'icy', 'feast', 'construction', 'megaphone'];
const WEEKLY_BOSSES = ['boss_loan', 'boss_thug', 'queen', 'boss_gapjil', 'boss_inpi'];
// 이번 주 도전: 주 번호만으로 정해진다 (모두 같은 판)
export function weeklyDef(wi) {
  const rng = seedRng(hashSeed('lbweekly:' + wi));
  const ids = Object.keys(WEEKLY_MODS);
  const mod = WEEKLY_MODS[ids[((wi % ids.length) + ids.length) % ids.length]];
  const stage = 11 + Math.floor(rng() * 17); // 적 구성 바탕: 2-1 ~ 3-7
  const fx = WEEKLY_FX[(rng() * WEEKLY_FX.length) | 0];
  const bossA = WEEKLY_BOSSES[(rng() * WEEKLY_BOSSES.length) | 0];
  const bossB = WEEKLY_BOSSES[(rng() * WEEKLY_BOSSES.length) | 0];
  const waves = [];
  for (let w = 1; w <= WEEKLY_WAVES; w++) {
    const b = stageWave(stage, 1 + ((w - 1) % 4));
    const cm = mod.count || 1;
    const g = b.g.map(([t, c, every, delay]) => [t, Math.max(1, Math.round(c * cm * (1 + 0.06 * (w - 1)))), +(every / Math.max(0.5, cm)).toFixed(2), delay]);
    const def = { g, level: 5 + 2.5 * (w - 1), hpScale: 2.1 * (mod.hp || 1) };
    if (mod.id === 'bossrush') def.boss = WEEKLY_BOSSES[(w + (rng() * 5 | 0)) % WEEKLY_BOSSES.length];
    else if (w === 5) def.boss = bossA;
    else if (w === 10) { def.boss = bossA; def.boss2 = bossB; }
    waves.push(def);
  }
  return { wi, stage, mod: mod.id, fx, waves, bosses: [...new Set(waves.flatMap((d) => [d.boss, d.boss2].filter(Boolean)))] };
}
// 서버가 계산하는 점수 (웨이브 · 처치 · 보스 · 클리어 + 남은 입구)
export function weeklyScore(r) {
  return int(r.waves, 0, WEEKLY_WAVES) * 1000 + int(r.kills, 0, 1e5) * 10 + int(r.bossKills, 0, 99) * 500 + (r.victory ? 5000 + int(r.hpPct, 0, 100) * 50 : 0);
}
// 말이 되는 기록인지 (주간 판 구성으로 상한 계산)
export function weeklyCheck(def, r) {
  const waves = int(r.waves, 0, 99), kills = int(r.kills, 0, 1e6), boss = int(r.bossKills, 0, 999), dur = int(r.durationSec, 0, 1e6);
  if (waves > WEEKLY_WAVES) return '웨이브 수가 이상해요';
  if (r.victory && waves !== WEEKLY_WAVES) return '기록을 확인할 수 없어요';
  const upto = Math.min(WEEKLY_WAVES, waves + 1);
  let maxKill = 0, maxBoss = 0;
  for (let i = 0; i < upto; i++) {
    const d = def.waves[i];
    for (const [t, c] of d.g) maxKill += c * (ENEMIES[t] && ENEMIES[t].pack ? ENEMIES[t].pack.max : 1) * 1.6;
    maxKill += 60; // 소환 · 분열 · 알림 여유
    maxBoss += (d.boss ? 1 : 0) + (d.boss2 ? 1 : 0);
  }
  if (kills > maxKill || boss > maxBoss) return '기록을 확인할 수 없어요';
  if (dur < waves * 8) return '기록을 확인할 수 없어요';
  return null;
}
// 지난주 순위 보상
export function weeklyRankReward(rank) {
  if (!rank) return null;
  if (rank === 1) return { coins: 5000, tickets: 5, gear: 'epic', title: 'wchamp', frame: 'crown', label: '1위' };
  if (rank <= 3) return { coins: 3000, tickets: 3, title: 'wtop3', label: `${rank}위` };
  if (rank <= 10) return { coins: 1500, tickets: 2, label: `${rank}위 (TOP 10)` };
  return { coins: 600, tickets: 1, label: `${rank}위 (참가 보상)` };
}
export const weeklyCoins = (waves) => 30 * int(waves, 0, WEEKLY_WAVES);
// 주간 기록 넣기 (새 주면 지난 기록을 weeklyPrev 로)
export function weeklyRecord(lb, wi, score, waves, now) {
  if (!lb.weekly || lb.weekly.wi !== wi) {
    if (lb.weekly && lb.weekly.wi === wi - 1) lb.weeklyPrev = lb.weekly;
    lb.weekly = { wi, best: 0, runs: 0, waves: 0, at: 0 };
  }
  const w = lb.weekly;
  w.runs++;
  const better = score > w.best;
  if (better) { w.best = score; w.waves = waves; w.at = now; }
  return better;
}
// 지난주(wi) 내 기록
export function weeklyEntry(lb, wi) {
  if (lb.weekly && lb.weekly.wi === wi) return lb.weekly;
  if (lb.weeklyPrev && lb.weeklyPrev.wi === wi) return lb.weeklyPrev;
  return null;
}

// ─── 미션 · 업적 ──────────────────────────────────────
// 진행 키: clears(스테이지 클리어) skills bosses kills perfects star3 weeklies endless pulls enhances dailyDone
export const CNT_KEYS = ['clears', 'skills', 'bosses', 'kills', 'perfects', 'star3', 'weeklies', 'endless', 'pulls', 'enhances', 'dailyDone', 'legends', 'enhTry'];
export const DAILY_POOL = [
  { id: 'clear3', icon: '', name: '스테이지 3판 클리어', key: 'clears', n: 3, coins: 150, sp: 25 },
  { id: 'skill15', icon: '', name: '스킬 15번 쓰기', key: 'skills', n: 15, coins: 120, sp: 20 },
  { id: 'boss1', icon: '', name: '보스 1명 잡기', key: 'bosses', n: 1, coins: 150, sp: 25 },
  { id: 'weekly1', icon: '', name: '주간 도전 1판', key: 'weeklies', n: 1, coins: 150, sp: 25, need: WEEKLY_UNLOCK },
  { id: 'perfect1', icon: '', name: 'PERFECT 클리어 1번', key: 'perfects', n: 1, coins: 200, sp: 30 },
  { id: 'kills300', icon: '', name: '진상 300명 처치', key: 'kills', n: 300, coins: 120, sp: 20 },
  { id: 'star3x2', icon: '', name: '★★★ 클리어 2번', key: 'star3', n: 2, coins: 150, sp: 25 },
  { id: 'endless1', icon: '', name: '무한 도전 1판', key: 'endless', n: 1, coins: 120, sp: 20, need: 10 },
  { id: 'gacha1', icon: '', name: '모집 1번', key: 'pulls', n: 1, coins: 100, sp: 20 },
  { id: 'enhance1', icon: '', name: '장비 강화 1번', key: 'enhances', n: 1, coins: 100, sp: 20 },
];
export const DAILY_N = 4;
export const DAILY_ALL = { id: 'all', icon: '', name: '오늘 미션 전부 완료', tickets: 1, sp: 30, wild: 1 };
export const WEEKLY_MISSIONS = [
  { id: 'w_clear20', icon: '', name: '스테이지 20판 클리어', key: 'clears', n: 20, coins: 800, tickets: 2, sp: 80, wild: 2 },
  { id: 'w_weekly3', icon: '', name: '주간 도전 3판', key: 'weeklies', n: 3, coins: 600, tickets: 1, sp: 60 },
  { id: 'w_boss10', icon: '', name: '보스 10명 잡기', key: 'bosses', n: 10, coins: 700, tickets: 1, sp: 60, wild: 2 },
  { id: 'w_daily12', icon: '', name: '일일 미션 12개 완료', key: 'dailyDone', n: 12, coins: 800, tickets: 2, sp: 80, wild: 3 },
  { id: 'w_perfect5', icon: '', name: 'PERFECT 5번', key: 'perfects', n: 5, coins: 700, tickets: 1, sp: 60 },
];
const ownedCount = (lb) => Object.keys(HEROES).filter((h) => heroUnlocked(lb, h)).length;
export const ACHIEVEMENTS = [
  { id: 'dex10', icon: '', name: '도감 진상 10종', n: 10, v: (lb) => (lb.seen || []).length, coins: 500, tickets: 1 },
  { id: 'dex20', icon: '', name: '도감 진상 20종', n: 20, v: (lb) => (lb.seen || []).length, coins: 1200, tickets: 2 },
  { id: 'hero8', icon: '', name: '멤버 8명 모으기', n: 8, v: ownedCount, coins: 800, tickets: 1, wild: 2 },
  { id: 'hero12', icon: '', name: '멤버 12명 모으기', n: 12, v: ownedCount, coins: 1500, tickets: 3, wild: 3 },
  { id: 'hero16', icon: '', name: '멤버 16명 전부', n: 16, v: ownedCount, coins: 5000, tickets: 5, wild: 5 },
  { id: 'ch1', icon: '', name: '1장 클리어', n: 10, v: (lb) => lb.maxStage | 0, coins: 500, tickets: 1, wild: 2 },
  { id: 'ch2', icon: '', name: '2장 클리어', n: 20, v: (lb) => lb.maxStage | 0, coins: 1200, tickets: 2, wild: 3 },
  { id: 'ch3', icon: '', name: '3장 클리어', n: 30, v: (lb) => lb.maxStage | 0, coins: 3000, tickets: 3, wild: 4 },
  { id: 'ch4', icon: '', name: '4장 클리어', n: 40, v: (lb) => lb.maxStage | 0, coins: 4000, tickets: 3, wild: 5 },
  { id: 'ch5', icon: '', name: '5장 클리어', n: 50, v: (lb) => lb.maxStage | 0, coins: 6000, tickets: 4, wild: 6 },
  { id: 'ch6', icon: '', name: '6장 클리어', n: 60, v: (lb) => lb.maxStage | 0, coins: 10000, tickets: 6 },
  { id: 'ch7', icon: '', name: '7장 스키장 클리어 (고난도!)', n: 70, v: (lb) => lb.maxStage | 0, coins: 16000, tickets: 8 },
  { id: 'stars180', icon: '', name: '별 180개', n: 180, v: (lb) => lb.totalStars | 0, coins: 8000, tickets: 5 },
  { id: 'ch8', icon: '', name: '8장 결혼식 뒤풀이 클리어 (고난도!)', n: 80, v: (lb) => lb.maxStage | 0, coins: 20000, tickets: 9 },
  { id: 'stars210', icon: '', name: '별 210개 (7장까지)', n: 210, v: (lb) => lb.totalStars | 0, coins: 12000, tickets: 6 },
  { id: 'stars240', icon: '', name: '별 240개 전부 (8장까지)', n: 240, v: (lb) => lb.totalStars | 0, coins: 15000, tickets: 7 },
  { id: 'perfect10', icon: '', name: 'PERFECT 스테이지 10개', n: 10, v: (lb) => Object.keys(lb.perfects || {}).length, coins: 1500, tickets: 2 },
  { id: 'perfect30', icon: '', name: 'PERFECT 스테이지 30개', n: 30, v: (lb) => Object.keys(lb.perfects || {}).length, coins: 4000, tickets: 4, title: 'perfect30' },
  { id: 'legend1', icon: '', name: '전설 장비 얻기', n: 1, v: (lb) => (lb.cnt || {}).legends | 0, coins: 1000, tickets: 1 },
  { id: 'endless30', icon: '', name: '무한 도전 W30', n: 30, v: (lb) => lb.bestWave | 0, coins: 2000, tickets: 2 },
  { id: 'stars90', icon: '', name: '별 90개', n: 90, v: (lb) => lb.totalStars | 0, coins: 3000, tickets: 3 },
  { id: 'stars30', icon: '', name: '별 30개', n: 30, v: (lb) => lb.totalStars | 0, coins: 800, tickets: 1 },
  { id: 'stars60', icon: '', name: '별 60개', n: 60, v: (lb) => lb.totalStars | 0, coins: 1500, tickets: 2 },
  { id: 'stars120', icon: '', name: '별 120개', n: 120, v: (lb) => lb.totalStars | 0, coins: 4000, tickets: 3, wild: 4 },
  { id: 'stars150', icon: '', name: '별 150개', n: 150, v: (lb) => lb.totalStars | 0, coins: 6000, tickets: 4, wild: 5 },
  { id: 'gdex10', icon: '', name: '장비 도감 10종', n: 10, v: (lb) => (lb.gearDex || []).length, coins: 1000, tickets: 2 },
  { id: 'gdex20', icon: '', name: '장비 도감 20종', n: 20, v: (lb) => (lb.gearDex || []).length, coins: 3000, tickets: 4 },
  { id: 'gdexAll', icon: '', name: '장비 도감 전부 (신화 포함)', n: GEAR_IDS.length + MYTH_IDS.length, v: (lb) => (lb.gearDex || []).length, coins: 10000, tickets: 8, title: 'collector' },
  { id: 'pull100', icon: '', name: '모집 100번', n: 100, v: (lb) => lb.pulls | 0, coins: 2000, tickets: 3, title: 'gacha100' },
  { id: 'star5', icon: '', name: '★5 멤버 만들기', n: 5, v: (lb) => Math.max(1, ...Object.values(lb.hstars || {})), coins: 3000, tickets: 3 },
];
// 하루 미션 고르기: (사용자 · 날짜) 로 정해진다
export function pickDaily(uid, day, maxStage) {
  const rng = seedRng(hashSeed(`lbdaily:${uid}:${day}`));
  const pool = DAILY_POOL.filter((m) => !m.need || (maxStage | 0) >= m.need);
  const out = [];
  while (out.length < DAILY_N && pool.length) out.push(pool.splice((rng() * pool.length) | 0, 1)[0].id);
  return out;
}
// 날짜 · 주가 바뀌었으면 미션 새로
export function ensureLive(lb, uid, now = Date.now()) {
  const day = dayIndex(now), wi = weekIndex(now);
  if (!lb.daily || lb.daily.day !== day) lb.daily = { day, ids: pickDaily(uid, day, lb.maxStage), p: {}, done: [] };
  if (!lb.wm || lb.wm.wi !== wi) lb.wm = { wi, p: {}, done: [] };
  const sid = seasonOf(wi);
  if (!lb.season || lb.season.id !== sid) lb.season = { id: sid, sp: 0, claimed: [] };
  return lb;
}
// 진행 올리기 (하루 · 주 · 평생)
export function bump(lb, key, v, uid, now) {
  v = int(v, 0, 1e6);
  if (!v) return;
  ensureLive(lb, uid, now);
  lb.daily.p[key] = (lb.daily.p[key] | 0) + v;
  lb.wm.p[key] = (lb.wm.p[key] | 0) + v;
  lb.cnt[key] = (lb.cnt[key] | 0) + v;
}
// 한 판 결과 → 미션 진행 (서버는 이미 확인·상한을 건 값을 넣는다)
export function trackRun(lb, r, uid, now) {
  if (r.mode === 'stage' && r.clear) {
    bump(lb, 'clears', 1, uid, now);
    if (r.stars >= 3) bump(lb, 'star3', 1, uid, now);
    if (r.perfect) bump(lb, 'perfects', 1, uid, now);
  }
  if (r.mode === 'weekly') bump(lb, 'weeklies', 1, uid, now);
  if (r.mode === 'endless') bump(lb, 'endless', 1, uid, now);
  bump(lb, 'skills', r.skills, uid, now);
  bump(lb, 'bosses', r.bosses, uid, now);
  bump(lb, 'kills', r.kills, uid, now);
}
// 서버가 믿는 스킬 수 상한 (3초에 한 번 + 조금)
export const skillCap = (skills, dur) => Math.min(int(skills, 0, 999), Math.floor(int(dur, 0, 1e6) / 3) + 5, 200);

// 보상 주기: coins · tickets · sp(시즌 포인트) · gear(등급) · title · frame
export function grant(lb, rw, uid, now) {
  const got = {};
  if (rw.coins) { lb.coins = (lb.coins | 0) + rw.coins; got.coins = rw.coins; }
  if (rw.tickets) { lb.tickets = (lb.tickets | 0) + rw.tickets; got.tickets = rw.tickets; }
  if (rw.stones) { lb.stones = (lb.stones | 0) + rw.stones; got.stones = rw.stones; }
  if (rw.wild) { lb.wild = (lb.wild | 0) + rw.wild; got.wild = rw.wild; }
  if (rw.cons) { consAdd(lb, rw.cons); for (const [k, v] of Object.entries(rw.cons)) if (CONS[k] && v > 0) (got.cons = got.cons || {})[k] = v; }
  if (rw.sta) { staminaAdd(lb, rw.sta, now); got.sta = rw.sta; }
  if (rw.sp) { ensureLive(lb, uid, now); lb.season.sp += rw.sp; got.sp = rw.sp; }
  if (rw.gear) { const ids = rw.gear === 'myth' ? MYTH_IDS : GEAR_IDS; got.gear = addGear(lb, ids[hashSeed(`rw:${lb.gearSeq}:${rw.gear}:${uid}`) % ids.length], rw.gear); }
  if (rw.title && !lb.titles.includes(rw.title)) { lb.titles.push(rw.title); got.title = rw.title; }
  if (rw.frame && !lb.frames.includes(rw.frame)) { lb.frames.push(rw.frame); got.frame = rw.frame; }
  return got;
}
export function addGear(lb, t, r) {
  if (r === 'legend') lb.cnt.legends = (lb.cnt.legends | 0) + 1;
  if (lb.gear.length >= GEAR_BAG && !(GEAR[t] && GEAR[t].hero)) { const v = gearSellValue(r, 0); lb.coins += v; return { t, r, sold: v }; } // 전용 신화는 가방이 꽉 차도 들어간다
  const it = { id: ++lb.gearSeq, t, r, lv: 0 };
  lb.gear.push(it);
  if (!(lb.gearDex || (lb.gearDex = [])).includes(t)) lb.gearDex.push(t); // 장비 도감
  return it;
}
// 미션 목록 (화면용)
export function missionView(lb, uid, now = Date.now()) {
  const x = ensureLive(lb, uid, now);
  const daily = x.daily.ids.map((id) => DAILY_POOL.find((m) => m.id === id)).filter(Boolean).map((m) => ({ ...m, kind: 'daily', have: Math.min(m.n, x.daily.p[m.key] | 0), done: x.daily.done.includes(m.id) }));
  const allOk = daily.length > 0 && daily.every((m) => m.done);
  const all = { ...DAILY_ALL, kind: 'daily', n: daily.length, have: daily.filter((m) => m.done).length, done: x.daily.done.includes('all'), ready: allOk };
  const weekly = WEEKLY_MISSIONS.map((m) => ({ ...m, kind: 'weekly', have: Math.min(m.n, x.wm.p[m.key] | 0), done: x.wm.done.includes(m.id) }));
  const ach = ACHIEVEMENTS.map((m) => ({ ...m, kind: 'ach', have: Math.min(m.n, m.v(x) | 0), done: (x.ach || []).includes(m.id) }));
  return { daily, all, weekly, ach, dayLeft: msToDayEnd(now), weekLeft: msToWeekEnd(now) };
}
export function claimable(lb, uid, now) {
  const v = missionView(lb, uid, now);
  return [...v.daily, ...v.weekly, ...v.ach].filter((m) => !m.done && m.have >= m.n).length + (v.all.ready && !v.all.done ? 1 : 0);
}
// 모두 받기: 받을 수 있는 미션을 한 번에 (tab: 'daily' | 'weekly' | 'ach' | 'all'). 하나씩 받는 것과 똑같이 확인 · 두 번 눌러도 두 번 안 받는다
export function claimAllMissions(lb, tab, uid, now = Date.now()) {
  const v = missionView(lb, uid, now);
  const list = [];
  if (tab === 'daily' || tab === 'all') { for (const m of v.daily) if (!m.done && m.have >= m.n) list.push(['daily', m.id]); }
  if (tab === 'weekly' || tab === 'all') { for (const m of v.weekly) if (!m.done && m.have >= m.n) list.push(['weekly', m.id]); }
  if (tab === 'ach' || tab === 'all') { for (const m of v.ach) if (!m.done && m.have >= m.n) list.push(['ach', m.id]); }
  const got = {};
  let n = 0;
  const add = (g) => { for (const [k, x] of Object.entries(g || {})) { if (typeof x === 'number') got[k] = (got[k] || 0) + x; else (got[k + 's'] = got[k + 's'] || []).push(x); } };
  for (const [k, id] of list) { const r = claimMission(lb, k, id, uid, now); if (!r.error) { n++; add(r.got); } }
  // 오늘 미션을 다 받았으면 "모두 완료" 보너스도
  if (tab === 'daily' || tab === 'all') { const r = claimMission(lb, 'daily', 'all', uid, now); if (!r.error) { n++; add(r.got); } }
  return { n, got };
}
export function claimMission(lb, kind, id, uid, now = Date.now()) {
  ensureLive(lb, uid, now);
  if (kind === 'daily') {
    if (id === 'all') {
      const ok = lb.daily.ids.length && lb.daily.ids.every((m) => lb.daily.done.includes(m));
      if (!ok) return { error: '오늘 미션을 먼저 다 끝내 주세요' };
      if (lb.daily.done.includes('all')) return { error: '이미 받았어요' };
      lb.daily.done.push('all');
      return { got: grant(lb, DAILY_ALL, uid, now) };
    }
    const m = DAILY_POOL.find((x) => x.id === id);
    if (!m || !lb.daily.ids.includes(id)) return { error: '없는 미션이에요' };
    if (lb.daily.done.includes(id)) return { error: '이미 받았어요' };
    if ((lb.daily.p[m.key] | 0) < m.n) return { error: '아직 다 못 했어요' };
    lb.daily.done.push(id);
    lb.wm.p.dailyDone = (lb.wm.p.dailyDone | 0) + 1;
    lb.cnt.dailyDone = (lb.cnt.dailyDone | 0) + 1;
    return { got: grant(lb, m, uid, now) };
  }
  if (kind === 'weekly') {
    const m = WEEKLY_MISSIONS.find((x) => x.id === id);
    if (!m) return { error: '없는 미션이에요' };
    if (lb.wm.done.includes(id)) return { error: '이미 받았어요' };
    if ((lb.wm.p[m.key] | 0) < m.n) return { error: '아직 다 못 했어요' };
    lb.wm.done.push(id);
    return { got: grant(lb, m, uid, now) };
  }
  if (kind === 'ach') {
    const m = ACHIEVEMENTS.find((x) => x.id === id);
    if (!m) return { error: '없는 업적이에요' };
    if (lb.ach.includes(id)) return { error: '이미 받았어요' };
    if ((m.v(lb) | 0) < m.n) return { error: '아직 다 못 했어요' };
    lb.ach.push(id);
    return { got: grant(lb, m, uid, now) };
  }
  return { error: '잘못된 요청이에요' };
}

// ─── 무료 시즌 (4주 · 30단계) ─────────────────────────
export const SEASON_WEEKS = 4;
export const SEASON_TIERS = 30;
export const SP_PER_TIER = 100;
export const seasonOf = (wi) => Math.floor(wi / SEASON_WEEKS) + 1;
export const seasonEndMs = (sid) => weekStartMs(sid * SEASON_WEEKS);
export function seasonReward(sid, t) {
  if (t === 30) return { title: `s${sid}_t30`, frame: 'gold', tickets: 5, gear: 'myth', label: '칭호 "레전드"+ 황금 프레임 + 신화 장비 + 모집권 5' };
  if (t === 20) return { frame: 'neon', tickets: 3, label: '네온 프레임 + 모집권 3' };
  if (t === 10) return { title: `s${sid}_t10`, tickets: 2, label: '칭호 "단골"+ 모집권 2' };
  if (t === 25) return { gear: 'legend', label: '전설 장비' };
  if (t === 15) return { gear: 'epic', label: '영웅 장비' };
  if (t === 5) return { gear: 'rare', label: '희귀 장비' };
  if (t % 4 === 0) return { wild: t >= 20 ? 4 : 2, coins: 200 + 20 * t, label: `범용 멤버 카드 ${t >= 20 ? 4 : 2} + ${(200 + 20 * t).toLocaleString()} 코인` };
  if (t % 3 === 0) return { tickets: t >= 21 ? 2 : 1, label: `모집권 ${t >= 21 ? 2 : 1}` };
  const c = 300 + 30 * t;
  return { coins: c, label: `${c.toLocaleString()} 코인` };
}
export const seasonTier = (lb) => Math.min(SEASON_TIERS, Math.floor(((lb.season && lb.season.sp) | 0) / SP_PER_TIER));
export function claimSeason(lb, tier, uid, now = Date.now()) {
  ensureLive(lb, uid, now);
  const list = tier === 'all' ? Array.from({ length: seasonTier(lb) }, (_, i) => i + 1).filter((t) => !lb.season.claimed.includes(t)) : [int(tier, 0, 99)];
  if (!list.length) return { error: '받을 보상이 없어요' };
  const got = [];
  for (const t of list) {
    if (t < 1 || t > SEASON_TIERS) return { error: '없는 단계예요' };
    if (t > seasonTier(lb)) return { error: '아직 그 단계가 아니에요' };
    if (lb.season.claimed.includes(t)) return { error: '이미 받았어요' };
    lb.season.claimed.push(t);
    got.push({ tier: t, ...grant(lb, seasonReward(lb.season.id, t), uid, now) });
  }
  return { got };
}
export function setCosmetic(lb, title, frame) {
  if (title !== undefined) { if (title && !lb.titles.includes(title)) return { error: '없는 칭호예요' }; lb.title = title || ''; }
  if (frame !== undefined) { if (frame && !lb.frames.includes(frame)) return { error: '없는 프레임이에요' }; lb.frame = frame || ''; }
  return {};
}

// ─── 모집 (뽑기) — 코인/모집권만, 현금 결제 없음 ───────────
export const GACHA_COST = { one: 500, ten: 4500 }; // (300/2700 → 500/4500: 후반 코인으로 하루 100번 넘게 뽑던 것 조임)
// 코인 모집은 하루 30번까지 (한국 시간 자정 초기화) — 모집권은 제한 없음
export const GACHA_COIN_DAILY = 30;
export function gachaCoinLeft(lb, now = Date.now()) { const d = lb.gachaDay; return Math.max(0, GACHA_COIN_DAILY - (d && d.day === dayIndex(now) ? d.n | 0 : 0)); }
export const HOCHAN_GATE = 40; // 4-10 클리어 후 LEGEND 이호찬이 모집에 나온다 (6-10 → 4-10 로 당김)
// 천장: T4 멤버 40번 안에 확정 · LEGEND 는 70번부터 확률이 가파르게 올라 90번째에 확정 (소프트 천장)
export const PITY_HERO = 40, PITY_LEGEND = 90, PITY_SOFT = 70;
// 모집 멤버는 "카드"를 모아서 합류: 영웅 10장 · LEGEND(이호찬) 30장. 합류한 뒤 카드는 ★승급 조각으로
export const UNLOCK_CARDS = { epic: 10, legend: 30 };
export const CARD_BUNDLE = { epicHero: 10, legendHero: 30, t3Card: 3, t2Card: 3 }; // LEGEND · T4 는 한 번에 합류 (겹치면 그만큼 멤버 카드) · T3·T2 는 카드 3장
export const cardsNeed = (h) => (LEGEND_HEROES.includes(h) ? UNLOCK_CARDS.legend : UNLOCK_CARDS.epic);
export const GACHA_RATES = [ // 확률 공개 (%) — 등급별 (다른 모집 게임처럼): LEGEND 0.6 · T4 5.4 · T3 20 · 나머지
  { k: 'sigGear', w: SIG_RATE.hero, name: '전용 신화 장비 (멤버마다 1개 · 가진 멤버 중)', color: '#ff4fd8' },
  { k: 'mythGear', w: 0.3, name: '신화 장비 (만능 6종)', color: '#ff7ad9' },
  { k: 'legendHero', w: 0.6, name: 'LEGEND 멤버 합류 (이호찬 · 강병화 · 70번부터 확률 ↑ · 90번 확정)', color: '#ffcf3f' },
  { k: 'epicHero', w: 5.4, name: 'T4 멤버 합류 (윤준서 · 배현경 · 고아라) · 픽업 50%', color: '#c77dff' },
  { k: 't3Card', w: 20, name: 'T3 멤버 카드 ×3 (정소영 · 오지은 · 여지원 · 정원식)', color: '#4ea8ff' },
  { k: 'legendGear', w: 1.2, name: '전설 장비', color: '#ffb400' },
  { k: 'epicGear', w: 6, name: '영웅 장비', color: '#d9a8ff' },
  { k: 'rareGear', w: 16.5, name: '희귀 장비', color: '#7ec4ff' },
  { k: 't2Card', w: 15, name: 'T2 멤버 카드 ×3 (박상화 · 홍정민)', color: '#5de07a' },
  { k: 'shard10', w: 10, name: '멤버 조각 ×10', color: '#ff9f5a' },
  { k: 'shard4', w: 25 - SIG_RATE.hero, name: '멤버 조각 ×4', color: '#9fb3c8' },
];
const T3_PLUS = ['legendHero', 'epicHero', 't3Card', 'mythGear'];
const tierPool = (t) => GACHA_HEROES.filter((h) => heroTier(h) === t);
// 이번 주 픽업 T4 (주마다 돌아가며) — T4 가 나오면 50% 로 이 멤버
export const pickupHero = (now = Date.now()) => { const l = tierPool(4); return l[weekIndex(now) % l.length]; };
// LEGEND 확률 (%): 70번째까지 0.6 → 그 뒤 번마다 +6.2 → 90번째 100
export function legendRate(pity) { return pity < PITY_SOFT - 1 ? 0.6 : Math.min(100, 0.6 + 6.2 * (pity - (PITY_SOFT - 2))); }

// 합류 전 카드 진행: { 윤준서: [7, 10] … }
export function cardProgress(lb, h) { return lb.owned && lb.owned[h] ? null : [Math.min(cardsNeed(h), (lb.shards || {})[h] | 0), cardsNeed(h)]; }
export const DUP_SHARDS = { epicHero: 30, legendHero: 80 };
export const legendOpen = (lb) => (lb.maxStage | 0) >= HOCHAN_GATE;
function rollKind(rng, lb, only) {
  const open = legendOpen(lb);
  const list = GACHA_RATES.filter((r) => (!only || only.includes(r.k)) && (open || r.k !== 'legendHero')).map((r) => (r.k === 'legendHero' ? { k: r.k, w: legendRate((lb.pity && lb.pity.legend) | 0) } : r));
  const sum = list.reduce((a, r) => a + r.w, 0);
  let x = rng() * sum;
  for (const r of list) { x -= r.w; if (x <= 0) return r.k; }
  return list[list.length - 1].k;
}
// n = 1 | 10. pay = 'ticket' | 'coin'. 서버 시드: (사용자 · 누적 모집 수)
export function gachaPull(lb, n, pay, uid, now = Date.now(), seed) {
  if (n !== 1 && n !== 10) return { error: '잘못된 요청이에요' };
  if (pay === 'ticket') { if ((lb.tickets | 0) < n) return { error: `모집권이 부족해요 (${n}장 필요)` }; }
  else if (pay === 'coin') {
    const left = gachaCoinLeft(lb, now);
    if (left < n) return { error: left ? `오늘 코인 모집은 ${left}번 남았어요 (하루 ${GACHA_COIN_DAILY}번 · 모집권은 제한 없음)` : `오늘 코인 모집은 다 했어요 (하루 ${GACHA_COIN_DAILY}번 · 자정에 초기화 · 모집권은 제한 없음)` };
    const c = n === 10 ? GACHA_COST.ten : GACHA_COST.one; if ((lb.coins | 0) < c) return { error: `코인이 부족해요 (${c.toLocaleString()} 필요)` };
  }
  else return { error: '잘못된 요청이에요' };
  if (pay === 'ticket') lb.tickets -= n;
  else { lb.coins -= n === 10 ? GACHA_COST.ten : GACHA_COST.one; const day = dayIndex(now); lb.gachaDay = { day, n: (lb.gachaDay && lb.gachaDay.day === day ? lb.gachaDay.n | 0 : 0) + n }; }
  const rng = seedRng(seed !== undefined ? seed : hashSeed(`lbgacha:${uid}:${lb.pulls}`));
  const out = [];
  let epicPlus = false;
  let t3 = false;
  const first10 = n === 10 && (lb.pulls | 0) === 0; // 처음 10회 모집: T4 멤버 확정
  for (let i = 0; i < n; i++) {
    lb.pity.hero++;
    if (legendOpen(lb)) lb.pity.legend++;
    let k;
    if (legendOpen(lb) && lb.pity.legend >= PITY_LEGEND) k = 'legendHero'; // 90번째: 확정
    else if (lb.pity.hero >= PITY_HERO) k = 'epicHero'; // T4 40번 안에 확정
    else k = rollKind(rng, lb);
    if (first10 && i === 9 && !out.some((x) => x.k === 'epicHero' || x.k === 'legendHero') && k !== 'legendHero') k = 'epicHero';
    else if (n === 10 && i === 9 && !t3 && !T3_PLUS.includes(k)) k = rollKind(rng, lb, T3_PLUS); // 10회: T3 이상 1개 확정
    if (T3_PLUS.includes(k) || k === 'sigGear') t3 = true;
    lb.pity.sig = (lb.pity.sig | 0) + 1; // 신화 조각 +1
    out.push(resolvePull(lb, k, rng, now));
    lb.pulls++;
  }
  bump(lb, 'pulls', n, uid, now);
  return { results: out };
}
function resolvePull(lb, k, rng, now) {
  if (k === 'legendHero' || k === 'epicHero' || k === 't3Card' || k === 't2Card') {
    if (k === 'legendHero' || k === 'epicHero') lb.pity.hero = 0;
    if (k === 'legendHero') lb.pity.legend = 0;
    const pool = k === 'legendHero' ? LEGEND_HEROES : tierPool(k === 'epicHero' ? 4 : k === 't3Card' ? 3 : 2);
    let h;
    if (k === 'epicHero' && rng() < 0.5) h = pickupHero(now); // 픽업 50%
    else { const fresh = pool.filter((x) => !lb.owned[x] && !heroUnlocked(lb, x)); const src = fresh.length && rng() < 0.6 ? fresh : pool; h = src[(rng() * src.length) | 0]; }
    const v = CARD_BUNDLE[k];
    if (lb.owned[h] || heroUnlocked(lb, h)) { lb.shards[h] = (lb.shards[h] | 0) + (k === 'legendHero' ? DUP_SHARDS.legendHero : k === 'epicHero' ? DUP_SHARDS.epicHero : v); return { k, hero: h, dup: true, shards: k === 'legendHero' ? DUP_SHARDS.legendHero : k === 'epicHero' ? DUP_SHARDS.epicHero : v, card: true }; }
    lb.shards[h] = (lb.shards[h] | 0) + v;
    const need = cardsNeed(h);
    if (lb.shards[h] >= need) { lb.shards[h] -= need; lb.owned[h] = true; return { k, hero: h, card: true, shards: v, new: true, have: need, need }; }
    return { k, hero: h, card: true, shards: v, have: lb.shards[h], need };
  }
  if (k === 'sigGear') return grantSig(lb, rng);
  if (k === 'mythGear') return { k, gear: addGear(lb, MYTH_IDS[(rng() * MYTH_IDS.length) | 0], 'myth') };
  if (k === 'legendGear' || k === 'epicGear' || k === 'rareGear') {
    const r = k === 'legendGear' ? 'legend' : k === 'epicGear' ? 'epic' : 'rare';
    return { k, gear: addGear(lb, GEAR_IDS[(rng() * GEAR_IDS.length) | 0], r) };
  }
  // 조각: 가진 멤버 중 아직 ★5 가 아닌 멤버에게
  const mine = Object.keys(HEROES).filter((h) => heroUnlocked(lb, h));
  const want = mine.filter((h) => heroStar(lb, h) < STAR_MAX);
  const list = want.length ? want : mine;
  const h = list[(rng() * list.length) | 0];
  const v = k === 'shard10' ? 10 : 4;
  lb.shards[h] = (lb.shards[h] | 0) + v;
  return { k, hero: h, shards: v };
}

// ─── 장비 뽑기 (강화석) — 전용 신화 0.1% · 신화 1% · 전설 5% · 영웅 24% · 희귀 69.9% · 80번째 신화 확정 · 10회는 영웅 이상 1개 ───
export const GEAR_GACHA_COST = { one: 40, ten: 360 };
export const GEAR_PITY = 80;
export const GEAR_GACHA_RATES = [
  { k: 'sig', w: SIG_RATE.gear, name: '전용 신화 장비', color: '#ff4fd8' },
  { k: 'myth', w: 1, name: '신화 장비', color: '#ff7ad9' },
  { k: 'legend', w: 5, name: '전설 장비', color: '#ffb400' },
  { k: 'epic', w: 24, name: '영웅 장비', color: '#c77dff' },
  { k: 'rare', w: 70 - SIG_RATE.gear, name: '희귀 장비', color: '#4ea8ff' },
];
function rollGearTier(rng, only) {
  const list = GEAR_GACHA_RATES.filter((r) => !only || only.includes(r.k));
  const sum = list.reduce((a, r) => a + r.w, 0); let x = rng() * sum;
  for (const r of list) { x -= r.w; if (x <= 0) return r.k; }
  return list[list.length - 1].k;
}
export function gearGachaPull(lb, n, uid, now = Date.now(), seed) {
  if (n !== 1 && n !== 10) return { error: '잘못된 요청이에요' };
  const cost = n === 10 ? GEAR_GACHA_COST.ten : GEAR_GACHA_COST.one;
  if ((lb.stones | 0) < cost) return { error: `강화석이 부족해요 (${cost} 필요)` };
  lb.stones -= cost;
  lb.pity = lb.pity || {};
  lb.gpulls = lb.gpulls | 0;
  const rng = seedRng(seed !== undefined ? seed : hashSeed(`lbggacha:${uid}:${lb.gpulls}`));
  const out = []; let epicPlus = false;
  for (let i = 0; i < n; i++) {
    lb.pity.gear = (lb.pity.gear | 0) + 1;
    let t = lb.pity.gear >= GEAR_PITY ? 'myth' : rollGearTier(rng);
    if (n === 10 && i === 9 && !epicPlus && (t === 'rare')) t = rollGearTier(rng, ['myth', 'legend', 'epic']);
    if (t !== 'rare') epicPlus = true;
    if (t === 'myth') lb.pity.gear = 0;
    lb.pity.sig = (lb.pity.sig | 0) + 1; // 신화 조각 +1
    if (t === 'sig') { out.push(grantSig(lb, rng)); lb.gpulls++; continue; }
    const id = t === 'myth' ? MYTH_IDS[(rng() * MYTH_IDS.length) | 0] : GEAR_IDS[(rng() * GEAR_IDS.length) | 0];
    out.push({ k: t + 'Gear', gear: addGear(lb, id, t) });
    lb.gpulls++;
  }
  return { results: out };
}

// ─── 전용 신화 (멤버마다 1개) ─────────────────
// 뽑기에서 나오면: 가진 멤버 중 아직 그 멤버 전용 신화가 없는 멤버 → (다 있으면) 신화 조각 300개
export const sigOwned = (lb, h) => (lb.gear || []).some((it) => it && it.t === 'sig_' + h);
export function grantSig(lb, rng) {
  const mine = Object.keys(SIG).filter((h) => heroUnlocked(lb, h));
  const fresh = mine.filter((h) => !sigOwned(lb, h));
  if (!fresh.length) { lb.pity.sig = (lb.pity.sig | 0) + SIG_DUP_SHARDS; return { k: 'sigGear', dup: true, sigShards: SIG_DUP_SHARDS }; }
  const h = fresh[(rng() * fresh.length) | 0];
  return { k: 'sigGear', hero: h, gear: addGear(lb, 'sig_' + h, 'myth') };
}
// 신화 조각 600개 → 고른 멤버 전용 신화 (합류한 멤버만 · 이미 있으면 안 됨)
export function sigExchange(lb, hero, uid) {
  if (typeof hero !== 'string' || !SIG[hero]) return { error: '없는 멤버예요' };
  if (!heroUnlocked(lb, hero)) return { error: '아직 합류하지 않은 멤버예요' };
  if (sigOwned(lb, hero)) return { error: '이미 가진 전용 신화예요' };
  lb.pity = lb.pity || {};
  if ((lb.pity.sig | 0) < SIG_PITY) return { error: `신화 조각이 부족해요 (${lb.pity.sig | 0}/${SIG_PITY})` };
  lb.pity.sig -= SIG_PITY;
  void uid;
  return { results: [{ k: 'sigGear', hero, gear: addGear(lb, 'sig_' + hero, 'myth'), pick: true }] };
}

// ─── 챕터 별 상자 (★10 · ★20 · ★30) ─────────────────
export const CHEST_STARS = [10, 20, 30];
export function chestReward(ch, need) {
  const i = CHEST_STARS.indexOf(need);
  return [{ coins: 400 * ch, tickets: 1 }, { coins: 900 * ch, tickets: 2 }, { coins: 1500 * ch, tickets: 3, gear: ch >= 2 ? 'epic' : 'rare' }][i] || null;
}
export function chapterStars(lb, ch) {
  let n = 0;
  for (let i = 1; i <= 10; i++) n += (lb.stages || {})[(ch - 1) * 10 + i] | 0;
  return n;
}
export function claimChest(lb, ch, need, uid, now = Date.now()) {
  ch = int(ch, 0, 99); need = int(need, 0, 99);
  const rw = chestReward(ch, need);
  if (!rw || ch < 1) return { error: '없는 상자예요' };
  if (chapterStars(lb, ch) < need) return { error: `${ch}장 별 ${need}개가 필요해요` };
  const got = lb.chests[ch] || (lb.chests[ch] = []);
  if (got.includes(need)) return { error: '이미 열었어요' };
  got.push(need);
  return { got: grant(lb, rw, uid, now) };
}
// ─── 출석 (7일 주기) ─────────────────────────────────
export const CHECKIN = [{ coins: 100 }, { coins: 150 }, { coins: 200, tickets: 1 }, { coins: 250 }, { coins: 300 }, { coins: 400 }, { coins: 500, tickets: 2 }];
export function checkinState(lb, now = Date.now()) {
  const day = dayIndex(now), c = lb.checkin || { last: -1e6, streak: 0 };
  const done = c.last === day;
  const streak = done ? c.streak : c.last === day - 1 ? c.streak : 0; // 하루 빠지면 처음부터
  return { done, streak, next: done ? streak % 7 : streak % 7 };
}
export function claimCheckin(lb, uid, now = Date.now()) {
  const st = checkinState(lb, now);
  if (st.done) return { error: '오늘은 이미 출석했어요' };
  const rw = CHECKIN[st.streak % 7];
  lb.checkin = { last: dayIndex(now), streak: st.streak + 1 };
  const got = grant(lb, Object.assign({ sta: STAMINA.checkin }, rw), uid, now);
  lb.gifts = Array.isArray(lb.gifts) ? lb.gifts : [];
  if (lb.checkin.streak >= 20 && !lb.gifts.includes('uiriju_att20')) { lb.gifts.push('uiriju_att20'); consAdd(lb, { uiriju: 1 }); got.cons = { uiriju: 1 }; } // 히든: 출석 20일 → 의리주
  return { got, day: (st.streak % 7) + 1 };
}

// ─── 모임 레이드: 하루 3번 (KST) · 모두의 피해를 합쳐 거대 보스 하나 ───
// 하루 3번 (KST): 점심 12:00~13:30 · 오후 15:00~16:30 · 저녁 21:00~23:00 — 친구들이 실제로 노는 시간
//  레이드 번호(wi) = 날짜 × 3 + 몇 번째 시간. 시간마다 보스 체력 · 보상 · 도전 횟수가 따로
export const RAID_WINDOWS = [[12 * 60, 13 * 60 + 30, '점심'], [15 * 60, 16 * 60 + 30, '오후'], [21 * 60, 23 * 60, '저녁']];
export const RAID = { hp: 900000, tries: 2, sec: 150, bosses: ['boss_soloparty', 'boss_union', 'boss_jusa', 'boss_otaku', 'boss_queenmom', 'boss_kkondol'] };
const dayStartMs = (d) => EPOCH + d * DAY - KST;
export const raidOpenMs = (ri) => dayStartMs(Math.floor(ri / 3)) + RAID_WINDOWS[((ri % 3) + 3) % 3][0] * 60e3;
export const raidEndMs = (ri) => dayStartMs(Math.floor(ri / 3)) + RAID_WINDOWS[((ri % 3) + 3) % 3][1] * 60e3;
// 열려 있으면 그 레이드, 아니면 다음 레이드 (wi - 1 = 방금 끝난 레이드)
export function raidState(now = Date.now()) {
  const d0 = dayIndex(now);
  let ri = d0 * 3;
  for (let k = 0; k < 6; k++) { const r = d0 * 3 + k; if (now < raidEndMs(r)) { ri = r; break; } }
  const open = now >= raidOpenMs(ri) && now < raidEndMs(ri);
  const n = RAID.bosses.length;
  return { wi: ri, open, opensAt: raidOpenMs(ri), endsAt: raidEndMs(ri), slot: RAID_WINDOWS[((ri % 3) + 3) % 3][2], boss: RAID.bosses[((ri % n) + n) % n], hp: RAID.hp };
}
// 레이드 판: 거대 보스 (체력은 사실상 무한) + 20초마다 졸개. 150초 버티며 보스에게 준 피해가 기록
export function raidDef(wi) {
  const st = raidState(raidOpenMs(wi) + 1000);
  const waves = [];
  for (let w = 1; w <= 8; w++) {
    const b = stageWave(35, 1 + ((w - 1) % 4));
    waves.push({ g: b.g.map(([t, c, e, d]) => [t, Math.max(1, Math.round(c * 0.5)), e, d]), level: 8 + 2 * (w - 1), hpScale: 1.6 });
  }
  waves[0].boss = st.boss;
  return { wi, boss: st.boss, waves, sec: RAID.sec };
}
// 한 판 피해 상한 (시간 × 성장 정도) — 친구끼리 적당히 믿을 만큼
export function raidCap(lb, dur) {
  const meta = Object.values(lb.heroes || {}).reduce((a, b) => a + (b | 0), 0);
  const perSec = (600 + 260 * (lb.maxStage | 0)) * (1 + meta / 80) * (1 + Object.values(lb.hstars || {}).reduce((a, b) => a + Math.max(0, b - 1), 0) * 0.05);
  return Math.round(Math.min(RAID.sec + 15, int(dur, 0, 1e6)) * perSec * (1 + collectBonus(lb).atk)); // 도감 수집 공격력만큼 더
}
export function raidTriesLeft(lb, now = Date.now()) {
  const r = lb.raid;
  const wi = raidState(now).wi;
  if (!r || r.wi !== wi) return RAID.tries;
  return Math.max(0, RAID.tries - (r.today | 0));
}
// wi: 판을 시작한 레이드 (시간이 끝난 뒤 들어온 기록도 그 레이드로)
export function raidRecord(lb, dmg, now = Date.now(), wi = raidState(now).wi) {
  if (!lb.raid || lb.raid.wi !== wi) lb.raid = { wi, dmg: 0, runs: 0, day: dayIndex(now), today: 0, best: 0, claimed: false };
  const r = lb.raid;
  r.today++; r.runs++; r.dmg += dmg; r.best = Math.max(r.best, dmg);
  return r;
}
// 로비 표시: "지금 열림!" 또는 다음 레이드까지 남은 시간
export function raidLabel(now = Date.now()) {
  const st = raidState(now);
  if (st.open) return { open: true, text: `지금 열림! ${Math.ceil((st.endsAt - now) / 60000)}분 남음` };
  const m = Math.ceil((st.opensAt - now) / 60000);
  return { open: false, text: m >= 60 ? `${st.slot} ${Math.floor(m / 60)}시간 ${m % 60}분 뒤` : `${st.slot} ${m}분 뒤` };
}
// 보상: 잡으면 모두 (기여도 순위 보너스) · 못 잡으면 준 피해 비율만큼
export function raidReward(myDmg, total, rank, killed) {
  if (!myDmg) return null;
  const share = total ? myDmg / total : 0;
  if (killed) {
    const top = rank === 1 ? { tickets: 5, gear: 'legend', title: 'raid1' } : rank <= 3 ? { tickets: 3, gear: 'epic' } : rank <= 10 ? { tickets: 2 } : { tickets: 1 };
    return Object.assign({ coins: 2000 + Math.round(4000 * share), label: `처치 성공! ${rank}위 (기여 ${(share * 100).toFixed(1)}%)` }, top);
  }
  const pct = Math.min(1, total / RAID.hp);
  return { coins: Math.round(600 + 2400 * pct * Math.min(1, share * 5)), tickets: pct >= 0.5 ? 1 : 0, label: `보스 체력 ${(pct * 100).toFixed(0)}% 깎음 (기여 ${(share * 100).toFixed(1)}%)` };
}

// ─── 1:1 대전 웨이브: 두 사람이 같은 시드로 같은 진상을 받는다 (끝없이 · 150초부터 서든데스) ───
export const PVP = { sudden: 150, sendSmall: 10, sendBig: 30 };
export function pvpWave(seed, n) {
  seed = Number(seed) >>> 0; // 시드는 0 이상 정수로 (음수면 stage 가 0 아래 → 웨이브 표가 없어 멈췄다)
  const rng = seedRng(hashSeed('lbpvp:' + seed + ':' + n));
  const stage = 12 + (seed % 17);
  const b = stageWave(stage, 1 + ((n - 1) % 4));
  const k = 1 + 0.12 * (n - 1);
  const def = { g: b.g.map(([t, c, e, d]) => [t, Math.max(1, Math.round(c * k)), e, d + rng() * 0.3]), level: 4 + 1.9 * (n - 1), hpScale: 1.6 };
  if (n % 5 === 0) def.boss = ['boss_loan', 'boss_thug', 'boss_gapjil', 'queen'][((n / 5) | 0) % 4];
  return def;
}

// ─── 덱 넣기/빼기 (순수 함수 — 화면 · 테스트가 같이 쓴다) ───
// deck: 자리 배열(null = 빈 자리), max: 넣을 수 있는 인원, order: 채우는 자리 순서, replace: 이 자리의 멤버와 바꾸기
export function deckToggle(deck, id, max, order, replace) {
  const d = deck.slice();
  const at = d.indexOf(id);
  if (at >= 0) { d[at] = null; return { deck: d, action: 'removed', slot: at }; }
  if (replace !== undefined && replace !== null && replace >= 0 && replace < d.length) { d[replace] = id; return { deck: d, action: 'added', slot: replace }; }
  if (d.filter(Boolean).length >= max) return { deck: d, action: 'full' };
  const slot = order.find((k) => k < d.length && !d[k]);
  if (slot === undefined) return { deck: d, action: 'full' };
  d[slot] = id;
  return { deck: d, action: 'added', slot };
}
// 덱 정리: 없는 멤버·중복·칸 넘침만 정리. 비어 있어도 그대로 둔다 (한 번도 만든 적 없는 새 덱만 기본 멤버로)
//  raw: 저장된 덱 (자리 배열, 처음이면 []) · mine: 가진 멤버 · fill(ids) → 자리 배열
export function cleanDeck(raw, mine, n, max, fill) {
  const fresh = !Array.isArray(raw) || raw.length === 0;
  let d = (Array.isArray(raw) ? raw : []).slice(0, n).map((id) => (id && mine.has(id) ? id : null));
  while (d.length < n) d.push(null);
  const seen = new Set();
  d = d.map((id) => (id && !seen.has(id) && seen.add(id) ? id : null));
  let cnt = d.filter(Boolean).length;
  for (let i = n - 1; i >= 0 && cnt > max; i--) if (d[i]) { d[i] = null; cnt--; }
  if (fresh && !cnt && fill) d = fill();
  return d;
}
// 서버에 저장하는 덱 (프리셋 3개 × 자리 6개)
export function cleanDecks(raw) {
  if (!raw || !Array.isArray(raw.decks)) return null;
  const decks = [0, 1, 2].map((k) => {
    const d = Array.isArray(raw.decks[k]) ? raw.decks[k].slice(0, 6) : [];
    const seen = new Set();
    return Array.from({ length: 6 }, (_, i) => { const id = d[i]; return typeof id === 'string' && HEROES[id] && !seen.has(id) && seen.add(id) ? id : null; });
  });
  // 덱마다 대장 (그 덱에 있는 멤버만 · 없으면 null → 화면이 덱 첫 멤버로)
  const leaders = [0, 1, 2].map((k) => { const l = Array.isArray(raw.leaders) ? raw.leaders[k] : null; return typeof l === 'string' && decks[k].includes(l) ? l : null; });
  return { i: Math.max(0, Math.min(2, raw.i | 0)), decks, leaders };
}

// ─── 프로필 정리 (서버 normLb · 손님 normalize 가 같이 쓴다) ─────

// ─── 체력 (스태미나): 스테이지는 체력을 쓴다 · 무한 · 레이드 · 1:1 대전은 따로 입장 횟수 ───
//  최대 60 · 6분에 1 · 보상으로 180 까지 넘칠 수 있다 · 마스터는 안 씀 (서버가 정한다)
export const STAMINA = { max: 50, regenMs: 8 * 60e3, cap: 150, stage: 6, hell: 9, repeat: 4, lvUp: 5, checkin: 10, buy: { n: 30, perDay: 2, cost: [600, 1500] } }; // (60·6분·5·10·3·출석20·하루3번 → 조임) · 헬 12 → 9 · 사기 300/700 → 600/1500
export function staminaNow(lb, now = Date.now()) {
  const s = lb.sta || { v: STAMINA.max, t: now };
  let v = s.v | 0, t = s.t || now;
  if (v >= STAMINA.max) return { v, t: now, next: 0 };
  const k = Math.floor(Math.max(0, now - t) / STAMINA.regenMs);
  if (k > 0) { v = Math.min(STAMINA.max, v + k); t += k * STAMINA.regenMs; }
  return { v, t: v >= STAMINA.max ? now : t, next: v >= STAMINA.max ? 0 : STAMINA.regenMs - (now - t) };
}
export function staminaAdd(lb, d, now = Date.now()) {
  const cur = staminaNow(lb, now);
  const v = Math.max(0, Math.min(STAMINA.cap, cur.v + d));
  lb.sta = { v, t: cur.v >= STAMINA.max ? now : cur.t };
  return v;
}
export const stageStaminaCost = (lb, stage, hell) => (hell ? STAMINA.hell : ((lb.stages || {})[stage] | 0) >= 3 ? STAMINA.repeat : STAMINA.stage);
// 스테이지 시작: 체력을 쓰고 표를 남긴다 (실패하면 절반 돌려준다 · 깨면 표를 지운다)
export function stageStart(lb, stage, hell, free, now = Date.now()) {
  const cost = free ? 0 : stageStaminaCost(lb, stage, hell);
  if (cost && staminaNow(lb, now).v < cost) return { error: `체력이 부족해요 (${cost} 필요)`, stamina: true };
  if (cost) staminaAdd(lb, -cost, now);
  lb.staRun = { stage, hell: !!hell, cost, at: now };
  return { cost, sta: staminaNow(lb, now).v };
}
export function stageFail(lb, stage, now = Date.now()) {
  const r = lb.staRun;
  if (!r || r.stage !== stage) return { refund: 0 };
  lb.staRun = null;
  const back = Math.floor(r.cost / 2);
  if (back) staminaAdd(lb, back, now);
  return { refund: back };
}
export function staminaBuy(lb, now = Date.now()) {
  const day = dayIndex(now), b = lb.staBuy && lb.staBuy.day === day ? lb.staBuy : { day, n: 0 };
  if (b.n >= STAMINA.buy.perDay) return { error: `오늘은 다 샀어요 (하루 ${STAMINA.buy.perDay}번)` };
  const cost = STAMINA.buy.cost[b.n];
  if ((lb.coins | 0) < cost) return { error: `코인이 부족해요 (${cost.toLocaleString()} 필요)` };
  lb.coins -= cost; lb.staBuy = { day, n: b.n + 1 };
  staminaAdd(lb, STAMINA.buy.n, now);
  return { cost, sta: staminaNow(lb, now).v, left: STAMINA.buy.perDay - b.n - 1 };
}
// ─── 무한 도전: 하루 3번 (05:00 KST 초기화) · 웨이브 달성 보상(주마다 처음 한 번) · 웨이브 코인 하루 상한 ───
export const ENDLESS = { perDay: 3, coinCap: 6000, miles: [10, 20, 30, 40, 50], resetH: 5 };
export const endlessDay = (now = Date.now()) => Math.floor((now + KST - ENDLESS.resetH * 3600e3 - EPOCH) / DAY);
export const endlessLeft = (lb, now = Date.now()) => ENDLESS.perDay - (lb.endDay && lb.endDay.day === endlessDay(now) ? lb.endDay.n : 0);
export function endlessStart(lb, free, now = Date.now()) {
  if (!free && endlessLeft(lb, now) <= 0) return { error: `오늘 무한 도전은 다 했어요 (하루 ${ENDLESS.perDay}번 · 아침 5시 초기화)` };
  const day = endlessDay(now);
  lb.endDay = { day, n: (lb.endDay && lb.endDay.day === day ? lb.endDay.n : 0) + (free ? 0 : 1) };
  lb.endRun = { at: now };
  return { left: endlessLeft(lb, now) };
}
export function milestoneReward(w) {
  const i = ENDLESS.miles.indexOf(w);
  return [{ coins: 800, tickets: 1 }, { coins: 1600, tickets: 2, gear: 'rare' }, { coins: 3000, tickets: 3, gear: 'epic' }, { coins: 5000, tickets: 4, gear: 'epic' }, { coins: 8000, tickets: 5, gear: 'myth' }][i] || null;
}
// 끝난 무한 판 정리: 주간 최고 · 달성 보상(우편함) · 코인 상한
export function endlessFinish(lb, wave, score, coins, uid, now = Date.now()) {
  const wi = weekIndex(now), day = endlessDay(now);
  if (!lb.ew || lb.ew.wi !== wi) { if (lb.ew && lb.ew.wi === wi - 1) lb.ewPrev = lb.ew; lb.ew = { wi, best: 0, miles: [] }; }
  const newBest = score > lb.ew.best;
  if (newBest) lb.ew.best = score;
  for (const m of ENDLESS.miles) if (wave >= m && !lb.ew.miles.includes(m)) { lb.ew.miles.push(m); mailAdd(lb, { title: `무한 ${m}웨이브 달성`, text: '이번 주 처음 달성 보상', rw: milestoneReward(m) }, now); }
  const ec = lb.endCoins && lb.endCoins.day === day ? lb.endCoins : { day, v: 0 };
  const give = Math.max(0, Math.min(coins, ENDLESS.coinCap - ec.v));
  lb.endCoins = { day, v: ec.v + give };
  lb.endRun = null;
  return { coins: give, capped: give < coins, weekBest: newBest };
}
// 무한 계약(저주) 코인 배율: 화면이 보낸 배율은 믿지 않고, 받은 계약 이름으로 서버가 다시 계산한다
//  계약은 6 · 11 · 16 … 웨이브 시작에 하나씩 → 도달 웨이브로 개수 상한 · 종류마다 한 번
export function endlessCoinMul(curses, wave) {
  const ids = [...new Set((Array.isArray(curses) ? curses : []).map(String))].filter((k) => CURSES[k]).slice(0, Math.max(0, Math.floor((int(wave, 0, 9999) + 1) / 5)));
  return ids.reduce((m, k) => m * (CURSES[k].coin || 1), 1);
}
export function endlessWeekReward(rank) {
  if (!rank) return null;
  if (rank === 1) return { coins: 6000, tickets: 5, gear: 'legend', title: 'ewchamp', label: '무한 주간 1위' };
  if (rank <= 3) return { coins: 3500, tickets: 3, gear: 'epic', label: `무한 주간 ${rank}위` };
  if (rank <= 10) return { coins: 1500, tickets: 2, label: `무한 주간 ${rank}위 (TOP 10)` }; // (모집권 10 → 2: 1~3위보다 많던 실수)
  return { coins: 500, tickets: 1, label: `무한 주간 ${rank}위 (참가)` };
}
// ─── 1:1 대전 보상: 하루 10판까지 코인 · 첫 승 2배 · 30초 안 끝난 판 · 같은 상대 하루 3판 넘게는 코인 없음 ───
export const PVP_REWARD = { perDay: 10, win: 300, lose: 80, firstWinMul: 2, minSec: 30, sameOpp: 3 };
export function pvpRewardCoins(lb, win, oppKey, sec, now = Date.now()) {
  const day = dayIndex(now);
  const d = lb.pvpDay && lb.pvpDay.day === day ? lb.pvpDay : { day, n: 0, won: false, opp: {} };
  let coins = 0, note = '';
  const same = (d.opp[oppKey] | 0);
  if (sec < PVP_REWARD.minSec) note = '30초 안에 끝난 판은 보상이 없어요';
  else if (same >= PVP_REWARD.sameOpp) note = '같은 상대와는 하루 3판까지만 보상';
  else if (d.n >= PVP_REWARD.perDay) note = `오늘 보상 판(${PVP_REWARD.perDay}판)을 다 했어요 · 점수만 올라요`;
  else { coins = win ? PVP_REWARD.win * (d.won ? 1 : PVP_REWARD.firstWinMul) : PVP_REWARD.lose; d.n++; if (win && !d.won) { d.won = true; note = '오늘 첫 승 보상 2배!'; } }
  if (oppKey) d.opp[oppKey] = same + 1;
  lb.pvpDay = d;
  return { coins, note, left: Math.max(0, PVP_REWARD.perDay - d.n) };
}
export const PVP_TIER_LADDER = [[1050, '실버', { coins: 1000, tickets: 2 }], [1200, '골드', { coins: 2000, tickets: 3 }], [1350, '플래티넘', { coins: 3000, tickets: 4 }], [1500, '다이아', { coins: 5000, tickets: 5, gear: 'epic' }], [1800, '랑방킹', { coins: 10000, tickets: 10, gear: 'legend' }]];
// 처음 오른 등급 보상 → 우편함 (한 번씩)
export function pvpTierUp(lb, rating, now = Date.now()) {
  const got = lb.pvpTiers || [];
  for (const [min, name, rw] of PVP_TIER_LADDER) if (rating >= min && !got.includes(min)) { got.push(min); mailAdd(lb, { title: `1:1 대전 ${name} 달성!`, text: '처음 오른 등급 보상', rw }, now); }
  lb.pvpTiers = got;
}
// ─── 우편함: 보상이 여기로 온다 (14일 뒤 사라짐) · 하나씩 · 모두 받기 ───
export const MAIL_DAYS = 14;
export function mailAdd(lb, m, now = Date.now()) {
  lb.mail = lb.mail || [];
  lb.mailSeq = (lb.mailSeq | 0) + 1;
  lb.mail.push({ id: lb.mailSeq, title: String(m.title || '').slice(0, 40), text: String(m.text || '').slice(0, 80), from: m.from ? String(m.from).slice(0, 12) : undefined, rw: m.rw || {}, at: now, exp: now + (m.days || MAIL_DAYS) * DAY });
  if (lb.mail.length > 50) lb.mail = lb.mail.slice(-50);
}
export function mailClaim(lb, id, uid, now = Date.now()) {
  lb.mail = (lb.mail || []).filter((m) => m.exp > now);
  const list = id === 'all' ? lb.mail.slice() : lb.mail.filter((m) => m.id === id);
  if (!list.length) return { error: id === 'all' ? '받을 우편이 없어요' : '없는 우편이에요' };
  const got = {};
  for (const m of list) { const g = grant(lb, m.rw || {}, uid, now); for (const [k, v] of Object.entries(g)) { if (typeof v === 'number') got[k] = (got[k] || 0) + v; else if (k === 'cons') { got.cons = got.cons || {}; for (const [c, n] of Object.entries(v)) got.cons[c] = (got.cons[c] || 0) + n; } else (got[k + 's'] = got[k + 's'] || []).push(v); } }
  const ids = new Set(list.map((m) => m.id));
  lb.mail = lb.mail.filter((m) => !ids.has(m.id));
  return { n: list.length, got };
}
export const mailCount = (lb, now = Date.now()) => (lb.mail || []).filter((m) => m.exp > now).length;

export function normLive(raw, out) {
  raw = raw || {};
  const heroIds = Object.keys(HEROES);
  out.tickets = int(raw.tickets, 0, 1e6);
  out.shards = {}; out.hstars = {}; out.owned = {};
  for (const h of heroIds) {
    const v = int((raw.shards || {})[h], 0, 1e6); if (v) out.shards[h] = v;
    const st = int((raw.hstars || {})[h], 1, STAR_MAX); if (st > 1) out.hstars[h] = st;
  }
  for (const h of [...GACHA_HEROES, ...LEGEND_HEROES]) if ((raw.owned || {})[h]) out.owned[h] = true;
  { const rp0 = raw.pity || {}; const v2 = rp0.v === 2; // 예전 천장(50/200)에서 넘어오면 진행 비율대로 옮긴다
    out.gearDex = [...new Set([...(Array.isArray(raw.gearDex) ? raw.gearDex : []), ...(Array.isArray(raw.gear) ? raw.gear.map((g) => g && g.t) : [])])].filter((t) => typeof t === 'string' && GEAR[t]); // 장비 도감: 한 번이라도 얻은 종류
  out.pity = { v: 2, hero: int(v2 ? rp0.hero : Math.floor((rp0.hero | 0) * 40 / 50), 0, PITY_HERO - 1), legend: int(v2 ? rp0.legend : Math.floor((rp0.legend | 0) * 90 / 200), 0, PITY_LEGEND - 1), gear: int(rp0.gear, 0, GEAR_PITY - 1), sig: int(rp0.sig, 0, 1e6) }; } // sig: 신화 조각 (전용 신화 교환)
  out.pulls = int(raw.pulls, 0, 1e7);
  out.gpulls = int(raw.gpulls, 0, 1e7);
  out.cnt = {};
  for (const k of CNT_KEYS) { const v = int((raw.cnt || {})[k], 0, 1e9); if (v) out.cnt[k] = v; }
  const cleanP = (p) => { const o = {}; for (const k of CNT_KEYS) { const v = int((p || {})[k], 0, 1e7); if (v) o[k] = v; } return o; };
  const d = raw.daily;
  out.daily = d && Number.isInteger(d.day) ? {
    day: d.day, ids: [...new Set((d.ids || []).filter((id) => DAILY_POOL.some((m) => m.id === id)))].slice(0, DAILY_N), p: cleanP(d.p),
    done: [...new Set((d.done || []).filter((id) => id === 'all' || DAILY_POOL.some((m) => m.id === id)))],
  } : null;
  const w = raw.wm;
  out.wm = w && Number.isInteger(w.wi) ? { wi: w.wi, p: cleanP(w.p), done: [...new Set((w.done || []).filter((id) => WEEKLY_MISSIONS.some((m) => m.id === id)))] } : null;
  out.ach = [...new Set((raw.ach || []).filter((id) => ACHIEVEMENTS.some((m) => m.id === id)))];
  const s = raw.season;
  out.season = s && Number.isInteger(s.id) ? { id: s.id, sp: int(s.sp, 0, 1e7), claimed: [...new Set((s.claimed || []).map((t) => int(t, 0, 99)).filter((t) => t >= 1 && t <= SEASON_TIERS))] } : null;
  const auto = autoCosmetics(raw);
  out.titles = [...new Set([...(raw.titles || []), ...auto.t].filter(titleOk))].slice(0, 60);
  out.frames = [...new Set([...(raw.frames || []), ...auto.f].filter((f) => FRAMES[f]))];
  out.title = out.titles.includes(raw.title) ? raw.title : '';
  out.frame = out.frames.includes(raw.frame) ? raw.frame : '';
  const wk = (x) => (x && Number.isInteger(x.wi) ? { wi: x.wi, best: int(x.best, 0, 1e9), runs: int(x.runs, 0, 1e6), waves: int(x.waves, 0, WEEKLY_WAVES), at: int(x.at, 0, 9e15) } : null);
  out.weekly = wk(raw.weekly);
  out.weeklyPrev = wk(raw.weeklyPrev);
  out.weeklyRun = raw.weeklyRun && typeof raw.weeklyRun.id === 'string' && raw.weeklyRun.id.length <= 32 && Number.isInteger(raw.weeklyRun.wi) ? { id: raw.weeklyRun.id, wi: raw.weeklyRun.wi, at: int(raw.weeklyRun.at, 0, 9e15) } : null;
  out.weeklyClaimed = Number.isInteger(raw.weeklyClaimed) ? raw.weeklyClaimed : -1e6;
  out.chests = {};
  for (const [k, v] of Object.entries(raw.chests || {})) { const ch = int(k, 0, 99); if (ch >= 1 && Array.isArray(v)) { const l = [...new Set(v.map((x) => int(x, 0, 99)).filter((x) => CHEST_STARS.includes(x)))]; if (l.length) out.chests[ch] = l; } }
  out.decks = cleanDecks(raw.decks);
  const rd = raw.raid;
  out.raid = rd && Number.isInteger(rd.wi) ? { wi: rd.wi, dmg: int(rd.dmg, 0, 1e12), runs: int(rd.runs, 0, 1e4), day: int(rd.day, -1e6, 1e6), today: int(rd.today, 0, 99), best: int(rd.best, 0, 1e12), claimed: !!rd.claimed } : null;
  out.raidRun = raw.raidRun && typeof raw.raidRun.id === 'string' && raw.raidRun.id.length <= 32 ? { id: raw.raidRun.id, wi: int(raw.raidRun.wi, -1e6, 1e6), at: int(raw.raidRun.at, 0, 9e15) } : null;
  const pv = raw.pvp;
  out.pvp = pv ? { rating: int(pv.rating, 0, 5000) || 1000, games: int(pv.games, 0, 1e6), wins: int(pv.wins, 0, 1e6), last: int(pv.last, 0, 9e15), streak: int(pv.streak, 0, 1e6), best: int(pv.best, 0, 1e6) } : { rating: 1000, games: 0, wins: 0, last: 0, streak: 0, best: 0 };
  const ci = raw.checkin;
  out.checkin = ci && Number.isInteger(ci.last) ? { last: ci.last, streak: int(ci.streak, 0, 1e5) } : null;
  // 체력 · 무한 · 우편함 · 1:1 보상 기록
  out.sta = raw.sta && Number.isFinite(raw.sta.t) ? { v: int(raw.sta.v, 0, STAMINA.cap), t: int(raw.sta.t, 0, 9e15) } : { v: STAMINA.max, t: 0 };
  out.gachaDay = raw.gachaDay && Number.isInteger(raw.gachaDay.day) ? { day: raw.gachaDay.day, n: int(raw.gachaDay.n, 0, 999) } : null;
  out.staBuy = raw.staBuy && Number.isInteger(raw.staBuy.day) ? { day: raw.staBuy.day, n: int(raw.staBuy.n, 0, 9) } : null;
  out.staRun = raw.staRun && Number.isFinite(raw.staRun.at) ? { stage: int(raw.staRun.stage, 0, 999), hell: !!raw.staRun.hell, cost: int(raw.staRun.cost, 0, 99), at: int(raw.staRun.at, 0, 9e15) } : null;
  out.endDay = raw.endDay && Number.isInteger(raw.endDay.day) ? { day: raw.endDay.day, n: int(raw.endDay.n, 0, 99) } : null;
  out.endRun = raw.endRun && Number.isFinite(raw.endRun.at) ? { at: int(raw.endRun.at, 0, 9e15) } : null;
  out.endCoins = raw.endCoins && Number.isInteger(raw.endCoins.day) ? { day: raw.endCoins.day, v: int(raw.endCoins.v, 0, 1e7) } : null;
  const ew = (x) => (x && Number.isInteger(x.wi) ? { wi: x.wi, best: int(x.best, 0, 1e10), miles: (x.miles || []).map((m) => int(m, 0, 999)).filter((m) => ENDLESS.miles.includes(m)) } : null);
  out.ew = ew(raw.ew); out.ewPrev = ew(raw.ewPrev); out.ewPaid = Number.isInteger(raw.ewPaid) ? raw.ewPaid : -1e6;
  out.mailSeq = int(raw.mailSeq, 0, 1e9);
  out.mail = (Array.isArray(raw.mail) ? raw.mail : []).filter((m) => m && Number.isInteger(m.id) && Number.isFinite(m.exp)).slice(-50).map((m) => ({ id: m.id, title: String(m.title || '').slice(0, 40), text: String(m.text || '').slice(0, 80), rw: cleanRw(m.rw), from: m.from ? String(m.from).slice(0, 12) : undefined, at: int(m.at, 0, 9e15), exp: int(m.exp, 0, 9e15) }));
  out.consBuy = {}; for (const [k, v] of Object.entries(raw.consBuy || {})) if (CONS_SHOP[k] && v && typeof v.k === 'string') out.consBuy[k] = { k: v.k.slice(0, 12), n: int(v.n, 0, 99) };
  out.consDex = [...new Set([...(Array.isArray(raw.consDex) ? raw.consDex : []), ...Object.keys(raw.cons || {})])].filter((k) => CONS[k]);
  out.cons = {}; for (const k of CONS_IDS) { const v = int((raw.cons || {})[k], 0, CONS_CAP); if (v) out.cons[k] = v; }
  out.consRun = raw.consRun && Array.isArray(raw.consRun.ids) ? { ids: [...new Set(raw.consRun.ids.map(String))].filter((k) => CONS[k]).slice(0, 3), at: int(raw.consRun.at, 0, 9e15) } : null;
  out.gifts = (Array.isArray(raw.gifts) ? raw.gifts : []).filter((x) => typeof x === 'string' && x.length <= 40).slice(-100);
  out.lastSeenAt = int(raw.lastSeenAt, 0, 9e15);
  out.giftsSent = (Array.isArray(raw.giftsSent) ? raw.giftsSent : []).filter((c) => c && typeof c.id === 'string').slice(-20).map((c) => ({ id: String(c.id).slice(0, 40), from: String(c.from || '').slice(0, 12), title: String(c.title || '').slice(0, 40), text: String(c.text || '').slice(0, 80), rw: cleanRw(c.rw), at: int(c.at, 0, 9e15), activeSince: int(c.activeSince, 0, 9e15), openUntil: int(c.openUntil, 0, 9e15), days: int(c.days, 1, 60) || MAIL_DAYS, n: int(c.n, 0, 1e7) }));
  out.pvpDay = raw.pvpDay && Number.isInteger(raw.pvpDay.day) ? { day: raw.pvpDay.day, n: int(raw.pvpDay.n, 0, 999), won: !!raw.pvpDay.won, opp: Object.fromEntries(Object.entries(raw.pvpDay.opp || {}).slice(0, 50).map(([k, v]) => [String(k).slice(0, 40), int(v, 0, 999)])) } : null;
  out.pvpTiers = (Array.isArray(raw.pvpTiers) ? raw.pvpTiers : []).map((x) => int(x, 0, 5000)).filter((x) => PVP_TIER_LADDER.some((t) => t[0] === x));
  normFriends(raw, out); // 친구 · 체력 선물 · 레이드 도움 (아래 친구 블록)
  return out;
}
export const MAPFX = MAP_FX; // (화면 표시용)

// ─── 친구: 체력(피로도) 선물 · 레이드 도와주기 ─────────────
// 친구 관계는 두 사람 기록에 같이 적힌다 (서버 server/langbang-friends.js 가 둘을 함께 고친다).
// 하루 = KST 자정 기준 dayIndex. 손님은 친구 기능을 못 쓴다 (서버 기록이 없어서).
export const FRIEND = {
  max: 30, reqMax: 30, reqPerDay: 20, // 친구 최대 · 받은/보낸 요청 보관 · 하루 요청 수
  gift: 5, recvPerDay: 10, giftDays: 7, inboxMax: 40, // 체력 선물 +5 · 하루 받기 10개 · 7일 보관
  lendPerDay: 10, lendRw: { coins: 200 }, lendPts: 10, // 내 멤버를 빌려준 보상 (하루 10번까지) · 도움 포인트
  capMul: 1.35, // 도와주는 멤버가 있으면 레이드 피해 상한 +35%
};
const FC_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 친구 코드: 아이디에서 정해지는 6글자 (바뀌지 않음 · 헷갈리는 0/O/1/I 없음)
export function friendCode(uid) {
  let h = hashSeed('lbfc:' + uid) >>> 0, s = '';
  for (let i = 0; i < 6; i++) { s += FC_ABC[h & 31]; h = i === 2 ? hashSeed('lbfc2:' + uid) >>> 0 : h >>> 5; }
  return s;
}
export const cleanFriendCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const frDay = (x) => (x && Number.isInteger(x.day) ? x : null);
const cleanSnapGear = (a) => (Array.isArray(a) ? a : []).filter((it) => it && GEAR[it.t] && (GEAR_RARITIES.includes(it.r) || it.r === 'myth')).slice(0, 3).map((it) => ({ t: it.t, r: it.r, lv: int(it.lv, 0, 30) }));
function normFriends(raw, out) {
  const f = (raw && raw.fr) || {};
  const ids = (a, n) => { const seen = new Set(); return (Array.isArray(a) ? a : []).filter((x) => x && typeof x.id === 'string' && x.id.length > 0 && x.id.length <= 40 && !seen.has(x.id) && seen.add(x.id)).slice(-n).map((x) => ({ id: x.id, at: int(x.at, 0, 9e15) })); };
  const dayIds = (x) => (frDay(x) ? { day: x.day, ids: [...new Set((Array.isArray(x.ids) ? x.ids : []).filter((i) => typeof i === 'string' && i.length <= 40))].slice(0, 60) } : null);
  const dayN = (x) => (frDay(x) ? { day: x.day, n: int(x.n, 0, 999) } : null);
  const h = f.help;
  out.fr = {
    list: ids(f.list, FRIEND.max), inReq: ids(f.inReq, FRIEND.reqMax), outReq: ids(f.outReq, FRIEND.reqMax),
    sent: dayIds(f.sent), bor: dayIds(f.bor), got: dayN(f.got), rq: dayN(f.rq), lent: dayN(f.lent),
    gin: (Array.isArray(f.gin) ? f.gin : []).filter((g) => g && typeof g.id === 'string' && g.id.length <= 40 && Number.isInteger(g.k)).slice(-FRIEND.inboxMax)
      .map((g) => ({ k: g.k, id: g.id, nick: String(g.nick || '').slice(0, 12), at: int(g.at, 0, 9e15) })),
    ginSeq: int(f.ginSeq, 0, 1e9), pts: int(f.pts, 0, 1e9), lentAll: int(f.lentAll, 0, 1e9),
    help: h && typeof h.run === 'string' && h.run.length <= 32 && typeof h.id === 'string' && HEROES[h.hero]
      ? { run: h.run, id: h.id.slice(0, 40), nick: String(h.nick || '').slice(0, 12), hero: h.hero, lv: int(h.lv, 0, 99), star: int(h.star, 1, STAR_MAX), gear: cleanSnapGear(h.gear) } : null,
  };
}
const frToday = (x, now) => (x && x.day === dayIndex(now) ? x : null);
export const isFriend = (lb, id) => !!(lb.fr && lb.fr.list.some((x) => x.id === id));
export const giftSentToday = (lb, id, now = Date.now()) => { const s = frToday(lb.fr && lb.fr.sent, now); return !!s && s.ids.includes(id); };
export const borrowedToday = (lb, id, now = Date.now()) => { const s = frToday(lb.fr && lb.fr.bor, now); return !!s && s.ids.includes(id); };
export const giftRecvLeft = (lb, now = Date.now()) => FRIEND.recvPerDay - ((frToday(lb.fr && lb.fr.got, now) || { n: 0 }).n);
export const giftInbox = (lb, now = Date.now()) => ((lb.fr && lb.fr.gin) || []).filter((g) => now - g.at < FRIEND.giftDays * DAY);
export const friendReqLeft = (lb, now = Date.now()) => FRIEND.reqPerDay - ((frToday(lb.fr && lb.fr.rq, now) || { n: 0 }).n);
// 로비 빨간 점: 받은 요청 + (오늘 더 받을 수 있으면) 받을 선물
export const friendBadge = (lb, now = Date.now()) => ((lb.fr && lb.fr.inReq.length) || 0) + (giftRecvLeft(lb, now) > 0 ? giftInbox(lb, now).length : 0);
const frDayPush = (fr, key, id, now) => { const d = dayIndex(now); if (!fr[key] || fr[key].day !== d) fr[key] = { day: d, ids: [] }; fr[key].ids.push(id); };
const frDayInc = (fr, key, now) => { const d = dayIndex(now); if (!fr[key] || fr[key].day !== d) fr[key] = { day: d, n: 0 }; fr[key].n++; return fr[key].n; };
// 목록(list · inReq · outReq)에 넣기/빼기
export function frSet(lb, key, id, on, now = Date.now()) {
  lb.fr[key] = lb.fr[key].filter((x) => x.id !== id);
  if (on) lb.fr[key].push({ id, at: now });
}
export const frCountReq = (lb, now = Date.now()) => frDayInc(lb.fr, 'rq', now);
// 체력 선물 보내기: 보내는 사람(me)과 받는 사람(them) 기록을 같이 고친다 — 서로 친구 · 오늘 그 친구에게 처음
export function giftSend(me, them, meId, themId, meNick, now = Date.now()) {
  if (!isFriend(me, themId) || !isFriend(them, meId)) return { error: '친구에게만 보낼 수 있어요' };
  if (giftSentToday(me, themId, now)) return { error: '오늘은 이미 보냈어요' };
  frDayPush(me.fr, 'sent', themId, now);
  them.fr.ginSeq = (them.fr.ginSeq | 0) + 1;
  them.fr.gin = giftInbox(them, now);
  them.fr.gin.push({ k: them.fr.ginSeq, id: meId, nick: String(meNick || '').slice(0, 12), at: now });
  them.fr.gin = them.fr.gin.slice(-FRIEND.inboxMax);
  return { sent: 1 };
}
// 선물 받기: 하루 10개까지 · 체력 상한(STAMINA.cap)을 넘기면 멈춘다 (못 받은 선물은 그대로 남는다)
export function giftClaim(lb, k, now = Date.now()) {
  lb.fr.gin = giftInbox(lb, now);
  const want = k === 'all' ? lb.fr.gin.slice() : lb.fr.gin.filter((g) => g.k === k);
  if (!want.length) return { error: k === 'all' ? '받을 선물이 없어요' : '없는 선물이에요' };
  let left = giftRecvLeft(lb, now);
  if (left <= 0) return { error: `선물은 하루 ${FRIEND.recvPerDay}개까지 받을 수 있어요` };
  if (staminaNow(lb, now).v + FRIEND.gift > STAMINA.cap) return { error: `체력이 가득이에요 (최대 ${STAMINA.cap})` };
  let n = 0;
  const took = new Set();
  for (const g of want) {
    if (left <= 0 || staminaNow(lb, now).v + FRIEND.gift > STAMINA.cap) break;
    staminaAdd(lb, FRIEND.gift, now);
    frDayInc(lb.fr, 'got', now);
    took.add(g.k); left--; n++;
  }
  lb.fr.gin = lb.fr.gin.filter((g) => !took.has(g.k));
  return { n, sta: staminaNow(lb, now).v, gotSta: n * FRIEND.gift, left: giftRecvLeft(lb, now), rest: lb.fr.gin.length };
}
// 대표 멤버: 지금 덱의 대장 → 덱 첫 멤버 → 가장 많이 강화한 멤버 (가진 멤버만)
export function leaderOf(lb) {
  const ok = (h) => typeof h === 'string' && heroUnlocked(lb, h);
  const d = lb.decks && Array.isArray(lb.decks.decks) ? lb.decks.decks[lb.decks.i | 0] || [] : [];
  const l = lb.decks && Array.isArray(lb.decks.leaders) ? lb.decks.leaders[lb.decks.i | 0] : null;
  if (ok(l) && d.includes(l)) return l;
  const first = d.find(ok);
  if (first) return first;
  const best = Object.keys(HEROES).filter(ok).sort((a, b) => (((lb.heroes || {})[b]) | 0) - (((lb.heroes || {})[a]) | 0))[0];
  return best || 'staff';
}
// 빌려줄 멤버 모습 (서버가 친구 기록에서 만든다 — 화면이 보낸 능력치는 안 믿음)
export function friendSnapshot(flb) {
  const hero = leaderOf(flb);
  const sl = (flb.equip || {})[hero] || {};
  const gear = cleanSnapGear(['w', 'a', 'm'].map((k) => (flb.gear || []).find((g) => g.id === sl[k])).filter(Boolean));
  return { hero, lv: int((flb.heroes || {})[hero], 0, 99), star: heroStar(flb, hero), gear };
}
// 레이드 시작 때 친구 멤버 빌리기 확인 (한 판에 한 명 · 같은 친구는 하루 한 번)
export function borrowCheck(lb, fid, now = Date.now()) {
  if (!isFriend(lb, fid)) return '친구의 멤버만 빌릴 수 있어요';
  if (borrowedToday(lb, fid, now)) return '이 친구의 멤버는 오늘 이미 빌렸어요 (내일 다시)';
  return null;
}
export function borrowMark(lb, fid, help, runId, now = Date.now()) {
  frDayPush(lb.fr, 'bor', fid, now);
  lb.fr.help = Object.assign({ run: runId, id: fid }, help);
}
export const helpFor = (lb, runId) => (lb.fr && lb.fr.help && lb.fr.help.run === runId ? lb.fr.help : null);
// 빌려준 사람: 우편 보상 (하루 FRIEND.lendPerDay 번까지) · 도움 포인트도 같이 쌓인다
export function lendReward(flb, borrowerNick, now = Date.now()) {
  const n = frDayInc(flb.fr, 'lent', now);
  flb.fr.lentAll = (flb.fr.lentAll | 0) + 1;
  if (n > FRIEND.lendPerDay) return false;
  flb.fr.pts = (flb.fr.pts | 0) + FRIEND.lendPts;
  const who = String(borrowerNick || '친구').slice(0, 12);
  mailAdd(flb, { title: '내 멤버가 레이드를 도왔어요', text: `${who}님이 내 멤버를 빌려 갔어요 · 도움 포인트 +${FRIEND.lendPts}`, from: who, rw: FRIEND.lendRw, days: 7 }, now);
  return true;
}
