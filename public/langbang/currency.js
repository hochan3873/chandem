// 랑방 대전 — 재화 한 곳 정리 (화면 없는 순수 함수 · 테스트가 돌린다)
//  · 재화 목록(CUR): 이름 · 그림 · 색 · 한 줄 쓰임새 — 모든 화면이 이걸 쓴다
//  · 얻는 곳(SOURCES) · 쓰는 곳(SINKS): 숫자는 데이터(live · data · tower …)에서 바로 만든다
//  · derivedSources(): 코드의 보상 표를 훑어 "이 재화가 나오는 곳" 을 다시 뽑는다 → 목록에서 빠지면 테스트가 잡는다
//  · growth(): 성장 길잡이 — 지금 가진 재화로 할 수 있는 가장 이득인 한 가지 · 순위 목록 · 모아 둘 것 · 낭비 경고
import {
  HEROES, heroCardNeed, CARD_PICK, SIG_PITY, SIG_DUP_SHARDS, ENDLESS_UNLOCK, metaCost, META_MILESTONE, GEAR_FUSE_FEE, gearEnhanceCost, gearStoneNeed,
  gearDismantle, gearSellValue, rollStones, rollHeroCard, ITEMS, stageLabel, endlessReward,
} from './data.js';
import * as L from './live.js';
import * as TW from './tower.js';
import * as HWE from './hw-event.js';
import * as R2 from './raid2.js';
import * as BK from './bonkae.js';

export const fmtN = (n) => Math.round(Number(n) || 0).toLocaleString('ko-KR');
const int = (v) => Number(v) | 0;
// 으로 / 로 (숫자 뒤): 0 · 3 · 6 은 받침이 있어서 "으로"
export const eu = (n) => (/[036]$/.test(String(Math.abs(Math.round(Number(n) || 0)))) ? '으로' : '로');

// ─── 재화 목록 (그림은 전부 우리 그림: public/img/lb/ui2 · hw) ───
//  ico: ui2 그림 이름 · img: 직접 주소 · 코인은 CSS 동전(.ci) 이라 둘 다 없다
export const CUR = {
  coins: { id: 'coins', name: '코인', color: '#ffcc33', short: '멤버·장비 강화와 모집에 쓰는 기본 돈' },
  tickets: { id: 'tickets', name: '모집권', ico: 'ticket', art: 'rv_ticket', color: '#ff8fc0', short: '모집(뽑기) 1회에 1장 — 코인 모집보다 우선' },
  sta: { id: 'sta', name: '체력', alias: '기력', ico: 'energy', color: '#5fd17a', short: `스테이지에 나갈 때 쓰는 힘 (${Math.round(L.STAMINA.regenMs / 60000)}분에 1씩 · 최대 ${L.STAMINA.max})` },
  stones: { id: 'stones', name: '강화석', ico: 'gem', art: 'rv_gem', color: '#4fc3ff', short: '+6 이상 장비 강화 · 장비 뽑기에 쓰는 보석' },
  cards: { id: 'cards', name: '멤버 카드', ico: 'aug_card', art: 'rv_cardback', color: '#9ab4ff', short: '멤버 강화 · ★승급에 드는 멤버별 카드' },
  wild: { id: 'wild', name: '범용 멤버 카드', alias: '만능 카드', ico: 'prism', art: 'rv_prism', color: '#6ff0d8', short: '누구 강화에나 카드 대신 쓰는 만능 카드' },
  sig: { id: 'sig', name: '신화 조각', ico: 'orb', art: 'rv_orb', color: '#ff4fd8', short: `${SIG_PITY}개 모으면 원하는 멤버 전용 신화 장비로 교환` },
  sp: { id: 'sp', name: '시즌 포인트', ico: 'crest', art: 'rv_crest', color: '#e8a860', short: `${L.SP_PER_TIER}점마다 시즌 단계가 1씩 올라가요` },
  tstone: { id: 'tstone', name: '염화석', ico: 'hellstone', art: 'rv_hell', color: '#ff5a4f', short: '진상의 탑 상점 · 지옥 세트에 쓰는 돌' },
  candy: { id: 'candy', name: '할로윈 사탕', img: '/img/lb/hw/candy.webp', color: '#ff8a1f', short: '할로윈 상점에서 의상 · 장비 · 모집권으로 바꿔요' },
};
export const CUR_IDS = Object.keys(CUR);
// 새 반짝 그림(art · 그림 시트 하나를 잘라 쓴다)이 있으면 그걸, 없으면 예전 그림
export const ART = { mail: '/img/lb/ui2/rv_mail.webp', cardFront: '/img/lb/ui2/rv_cardfront.webp', coin: ['/img/lb/ui2/rv_coin1.webp', '/img/lb/ui2/rv_coin2.webp', '/img/lb/ui2/rv_coin3.webp'] };
export const coinArt = (n) => ART.coin[n >= 5000 ? 2 : n >= 1000 ? 1 : 0]; // 코인 더미: 작게 · 중간 · 수북이
const oldSrc = (id) => (CUR[id].img || (CUR[id].ico ? `/img/lb/ui2/${CUR[id].ico}.webp` : ''));
export const curImgSrc = (id) => (CUR[id].art ? `/img/lb/ui2/${CUR[id].art}.webp` : oldSrc(id));
// 보상 · 우편 · 결과 창에서 쓰는 큰 그림 (코인은 양에 따라 더미가 커진다)
export const curArt = (id, size = 'rv', n = 0) => { const src = id === 'coins' ? coinArt(n) : curImgSrc(id), fb = id === 'coins' ? '' : oldSrc(id); return `<img class="ic cur-ic ${size}" src="${src}" alt="${CUR[id].name}" draggable="false"${fb && fb !== src ? ` onerror="this.onerror=null;this.src='${fb}'"` : ''}>`; };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const curVars = (id) => { const [r, g, b] = hexRgb(CUR[id].color); return `--cc:${CUR[id].color};--cca:rgba(${r},${g},${b},.38);--ccb:rgba(${r},${g},${b},.14)`; };
// 그림 한 칸 (코인은 CSS 동전 · 나머지는 그림 파일)
export const curIcon = (id, size = 'sm') => (id === 'coins' ? `<i class="ci cur-ci ${size}"></i>` : `<img class="ic cur-ic ${size}" src="${curImgSrc(id)}" alt="${CUR[id].name}" draggable="false">`);
// 재화 + 숫자 한 덩어리 (보상 · 가격 · 결과에 쓰는 같은 모양)
export const curTag = (id, text, cls = '') => `<span class="cur-tag ${cls}" style="${curVars(id)}">${curIcon(id)}<b>${text}</b></span>`;
// 보상 {coins, tickets, stones, wild, sta, sp, shards} → 아이콘 덩어리들 (그 밖의 것은 호출한 쪽이 글자로)
export const RW_KEYS = { coins: 'coins', tickets: 'tickets', stones: 'stones', wild: 'wild', sta: 'sta', sp: 'sp', hell: 'tstone', candy: 'candy' };
export function rwTags(rw, sign = '+') {
  if (!rw) return '';
  const out = [];
  for (const [k, id] of Object.entries(RW_KEYS)) if (int(rw[k]) > 0) out.push(curTag(id, `${sign}${fmtN(rw[k])}`));
  if (rw.shards && typeof rw.shards === 'object') { const n = Object.values(rw.shards).reduce((a, v) => a + int(v), 0); if (n > 0) out.push(curTag('cards', `${sign}${fmtN(n)}`)); }
  return out.join('');
}
export const rwRest = (rw) => { const o = Object.assign({}, rw); for (const k of Object.keys(RW_KEYS)) delete o[k]; delete o.shards; return o; };

// 지금 가진 양 (화면에 보이는 숫자)
export function amount(p, id) {
  if (!p) return 0;
  switch (id) {
    case 'coins': return int(p.coins);
    case 'tickets': return int(p.tickets);
    case 'sta': return L.staminaNow(p, Date.now()).v;
    case 'stones': return int(p.stones);
    case 'cards': return Object.values(p.shards || {}).reduce((a, v) => a + int(v), 0);
    case 'wild': return int(p.wild);
    case 'sig': return int((p.pity || {}).sig);
    case 'sp': return int((p.season || {}).sp);
    case 'tstone': return int((p.tower || {}).stone);
    case 'candy': return int((p.hw || {}).candy);
    default: return 0;
  }
}
export const snap = (p) => { const o = {}; for (const id of CUR_IDS) o[id] = amount(p, id); return o; };
// 이전 → 지금: 늘어난 것만 { id: 늘어난 수 }
export function gainsOf(before, after) { const o = {}; for (const id of CUR_IDS) { const d = (after[id] | 0) - (before[id] | 0); if (d > 0) o[id] = d; } return o; }

// ─── 바로 가기 이름 (game.js 가 같은 키로 실제 화면을 연다) ───
export const GO = {
  stages: '스테이지', weekly: '주간 도전', endless: '무한 도전', missions: '미션', checkin: '출석', season: '시즌', mail: '우편', tower: '진상의 탑', towershop: '탑 상점',
  raid: '건물주 레이드', pvp: '1:1 대전', hw: '할로윈', hwshop: '사탕 상점', bag: '장비 · 강화', deck: '멤버 강화', recruit: '모집', gachagear: '장비 뽑기', itemshop: '상점',
  cardpick: '카드 선택권', friends: '친구', bonkae: '본캐 출연료', dex: '도감', sta: '체력 채우기', sigEx: '신화 교환', convert: '범용 카드 바꾸기', none: '',
};
const lockTxt = (n) => `${stageLabel(n)} 클리어하면 열려요`;
const wk1 = () => L.weeklyRankReward(1), wkJoin = () => L.weeklyRankReward(99);
const cr = (a) => `${fmtN(Math.min(...a))}~${fmtN(Math.max(...a))}`;
const ck = (f) => L.CHECKIN.map((d) => d[f] | 0).filter((x) => x > 0);
const twRw = (f) => TW.floorReward(f);
const dayCap = () => (HWE.HW && HWE.HW.dayCap) | 0;

// 얻는 곳: { k: 코드 속 보상 표 이름 · go: 바로 가기 · t: 쉬운 말 한 줄 · lock: 열리는 스테이지 }
export const SOURCES = {
  coins: [
    { k: 'stage', go: 'stages', t: () => '스테이지 클리어 — 첫 클리어 · 새 별 · PERFECT 보너스 (헬은 ×2)' },
    { k: 'missions', go: 'missions', t: () => '일일 · 주간 미션 · 업적 보상' },
    { k: 'checkin', go: 'checkin', t: () => `출석 — 하루 ${cr(ck('coins'))} 코인 (7일 주기)` },
    { k: 'chest', go: 'stages', t: () => '별 상자 — 챕터 ★10 · ★20 · ★30 마다' },
    { k: 'season', go: 'season', t: () => '시즌 단계 보상 (일반 단계마다 코인)' },
    { k: 'weekly', go: 'weekly', lock: L.WEEKLY_UNLOCK, t: () => `주간 도전 — 끝까지 가면 ${fmtN(L.weeklyCoins(L.WEEKLY_WAVES))} · 지난주 순위 보상 최대 ${fmtN(wk1().coins)}` },
    { k: 'endless', go: 'endless', lock: ENDLESS_UNLOCK, t: () => `무한 도전 — 웨이브마다 코인 (하루 최대 ${fmtN(L.ENDLESS.coinCap)}) · 단계 돌파 보너스` },
    { k: 'tower', go: 'tower', lock: TW.TOWER.unlock, t: () => `진상의 탑 — 층을 처음 깰 때마다 (1층 ${fmtN(twRw(1).coins)} → 갈수록 늘어요)` },
    { k: 'raid', go: 'raid', t: () => `건물주 레이드 — 판 보상 ${fmtN(R2.DIFF.normal.rw.coins)}~${fmtN(R2.DIFF.hell.rw.coins)} · 참가 상자 ${fmtN(R2.JOIN_RW.coins)}` },
    { k: 'pvp', go: 'pvp', t: () => `1:1 대전 — 승 ${L.PVP_REWARD.win} · 패 ${L.PVP_REWARD.lose} (하루 ${L.PVP_REWARD.perDay}판) · 등급 오를 때 보상` },
    { k: 'bonkae', go: 'bonkae', t: () => '본캐 출연료 — 내 멤버가 친구 덱에서 뛴 만큼' },
    { k: 'gear', go: 'bag', t: () => `장비 팔기 · 가방이 꽉 차면 자동 판매 (희귀 ${fmtN(gearSellValue('rare', 0))} 코인~)` },
    { k: 'dex', go: 'dex', t: () => `도감 첫 발견 보상 — 새 멤버 ${fmtN(L.DEX_RW.hero.coins)} · 진상 ${fmtN(L.DEX_RW.enemy.normal.coins)}~${fmtN(L.DEX_RW.enemy.boss.coins)}` },
    { k: 'mail', go: 'mail', t: () => '우편으로 오는 선물 · 이벤트 보상' },
  ],
  tickets: [
    { k: 'checkin', go: 'checkin', t: () => `출석 — 3일차 ${L.CHECKIN[2].tickets}장 · 7일차 ${L.CHECKIN[6].tickets}장` },
    { k: 'missions', go: 'missions', t: () => `오늘 미션 전부 완료 +${L.DAILY_ALL.tickets} · 주간 미션 · 업적` },
    { k: 'chest', go: 'stages', t: () => '별 상자 — 챕터 ★10 · ★20 · ★30 마다 1 · 2 · 3장' },
    { k: 'season', go: 'season', t: () => '시즌 단계 보상 (3 · 4 · 6단계… 마다)' },
    { k: 'weekly', go: 'weekly', lock: L.WEEKLY_UNLOCK, t: () => `주간 도전 지난주 순위 보상 (참가 ${wkJoin().tickets}장 · 1위 ${wk1().tickets}장)` },
    { k: 'endless', go: 'endless', lock: ENDLESS_UNLOCK, t: () => '무한 도전 단계 돌파 보상 (주마다 처음 한 번)' },
    { k: 'tower', go: 'tower', lock: TW.TOWER.unlock, t: () => '진상의 탑 — 보스 층 1장 · 구역 마지막 층 3장 · 주간 랭킹' },
    { k: 'towershop', go: 'towershop', lock: TW.TOWER.unlock, t: () => `탑 상점 — 염화석 ${TW.TOWER_SHOP.find((s) => s.kind === 'tickets').cost}개에 1장 (주 ${TW.TOWER_SHOP.find((s) => s.kind === 'tickets').n}번)` },
    { k: 'raid', go: 'raid', t: () => `건물주 레이드 — 참가 상자 ${R2.JOIN_RW.tickets}장 · 페이즈 돌파 ${R2.PART_RW.tickets}장` },
    { k: 'pvp', go: 'pvp', t: () => '1:1 대전 등급을 처음 올릴 때' },
    { k: 'dex', go: 'dex', t: () => `도감 — 모은 수 ${L.DEX_RW.every}개마다 ${L.DEX_RW.everyRw.tickets}장` },
    { k: 'hw', go: 'hw', t: () => '할로윈 랭킹 보상' },
    { k: 'hwshop', go: 'hwshop', t: () => `사탕 상점 — 사탕 ${HWE.SHOP.find((s) => s.kind === 'tickets').cost}개에 1장` },
    { k: 'mail', go: 'mail', t: () => '우편으로 오는 선물 · 이벤트 보상' },
  ],
  sta: [
    { k: 'regen', go: 'none', t: () => `저절로 — ${Math.round(L.STAMINA.regenMs / 60000)}분마다 1 (${L.STAMINA.max}까지만 · 넘으면 쉬어요)` },
    { k: 'checkin', go: 'checkin', t: () => `출석 +${L.STAMINA.checkin}` },
    { k: 'lvup', go: 'none', t: () => `계정 레벨이 오를 때마다 +${L.STAMINA.lvUp}` },
    { k: 'friends', go: 'friends', t: () => `친구 선물 +${L.FRIEND.gift} (하루 ${L.FRIEND.recvPerDay}개까지 받기)` },
    { k: 'stage', go: 'stages', t: () => '스테이지에서 지면 쓴 체력의 절반을 돌려줘요' },
    { k: 'buy', go: 'sta', t: () => `코인으로 사기 — +${L.STAMINA.buy.n} (하루 ${L.STAMINA.buy.perDay}번 · ${fmtN(L.STAMINA.buy.cost[0])} · ${fmtN(L.STAMINA.buy.cost[1])} 코인)` },
  ],
  stones: [
    { k: 'stage', go: 'stages', lock: 6, t: () => '스테이지 보상 (1-6부터 · 별 많을수록 · 10번째 보스 스테이지 +2 · 헬은 ×2)' },
    { k: 'gear', go: 'bag', t: () => `장비 분해 — 희귀 ${gearDismantle('rare', 0)} · 영웅 ${gearDismantle('epic', 0)} · 전설 ${gearDismantle('legend', 0)} · 신화 ${gearDismantle('myth', 0)}` },
    { k: 'raid', go: 'raid', t: () => `건물주 레이드 — 판 보상 ${R2.DIFF.normal.rw.stones}~${R2.DIFF.hell.rw.stones} · 참가 상자 ${R2.JOIN_RW.stones}` },
    { k: 'tower', go: 'tower', lock: TW.TOWER.unlock, t: () => '진상의 탑 — 짝수 층 1 · 보스 층 2+' },
    { k: 'towershop', go: 'towershop', lock: TW.TOWER.unlock, t: () => { const s = TW.TOWER_SHOP.find((x) => x.kind === 'stones'); return `탑 상점 — 염화석 ${s.cost}개에 ${s.amount}개`; } },
    { k: 'dex', go: 'dex', t: () => `도감 — 새 장비 ${L.DEX_RW.item.stones}개 · 중간 보스 ${L.DEX_RW.enemy.mid.stones} · 보스 ${L.DEX_RW.enemy.boss.stones}` },
    { k: 'hw', go: 'hw', t: () => '할로윈 랭킹 보상' },
    { k: 'hwshop', go: 'hwshop', t: () => { const s = HWE.SHOP.find((x) => x.kind === 'stones'); return `사탕 상점 — 사탕 ${s.cost}개에 ${s.amount}개`; } },
    { k: 'mail', go: 'mail', t: () => '우편으로 오는 선물 · 이벤트 보상' },
  ],
  cards: [
    { k: 'stage', go: 'stages', t: () => '스테이지 — 데려간 멤버 카드가 가끔 (별 많을수록 · 헬은 2배)' },
    { k: 'gacha', go: 'recruit', t: () => `모집 — 이미 있는 멤버가 나오면 카드 (T3 ${L.DUP_SHARDS.epicHero} · LEGEND ${L.DUP_SHARDS.legendHero}장 등)` },
    { k: 'cardpick', go: 'cardpick', t: () => `상점 카드 선택권 — 고른 멤버 ${CARD_PICK.n}장 (${fmtN(CARD_PICK.cost)} 코인 · 주 ${CARD_PICK.perWeek}번)` },
    { k: 'dex', go: 'dex', t: () => `도감 — 새 멤버를 만나면 그 멤버 카드 ${L.DEX_RW.hero.shards}장` },
    { k: 'hwshop', go: 'hwshop', t: () => { const s = HWE.SHOP.find((x) => x.kind === 'shards'); return `사탕 상점 — 사탕 ${s.cost}개에 ${HEROES[s.hero].name} 카드 ${s.amount}장`; } },
  ],
  wild: [
    { k: 'convert', go: 'convert', t: () => '다 키운 멤버의 남는 카드를 바꾸면 범용 카드로' },
    { k: 'missions', go: 'missions', t: () => `오늘 미션 전부 완료 +${L.DAILY_ALL.wild} · 주간 미션 · 업적` },
    { k: 'season', go: 'season', t: () => '시즌 단계 보상 (4 · 8 · 12단계… 마다)' },
  ],
  sig: [
    { k: 'gachagear', go: 'gachagear', t: () => '장비 뽑기 1회마다 +1 (신화 장비가 겹치면 한꺼번에 +' + SIG_DUP_SHARDS + ')' },
    { k: 'gacha', go: 'recruit', t: () => '멤버 모집 1회마다 +1' },
  ],
  sp: [
    { k: 'mail', go: 'mail', t: () => '우편으로 오는 이벤트 보상' },
    { k: 'missions', go: 'missions', t: () => `일일 미션 +${L.DAILY_POOL[0].sp}~${L.DAILY_POOL[4].sp} · 올 클리어 +${L.DAILY_ALL.sp} · 주간 미션 +${L.WEEKLY_MISSIONS[0].sp}~` },
  ],
  tstone: [
    { k: 'tower', go: 'tower', lock: TW.TOWER.unlock, t: () => `층을 처음 깰 때 ${twRw(1).hell}개~ (보스 층은 3배) · 주간 랭킹 보상` },
  ],
  candy: [
    { k: 'hw', go: 'hw', t: () => `할로윈 스테이지 — 처음 깨면 ${HWE.firstCandy(1)}~ · 다시 깨면 ${HWE.clearCandy(1, 0)}~ (하루 ${dayCap()}개까지) · 저주 기록 보너스` },
  ],
};

// 쓰는 곳
export const SINKS = {
  coins: [
    { k: 'deck', go: 'deck', t: () => `멤버 강화 — +1마다 ${fmtN(metaCost(0))}~ (+${META_MILESTONE.every} · +${META_MILESTONE.every * 2} · +${META_MILESTONE.every * 3} · +${META_MILESTONE.every * 4} 칸은 두 배)` },
    { k: 'star', go: 'deck', t: () => `★승급 — ${fmtN(L.STAR_COINS[1])}~${fmtN(L.STAR_COINS[4])} 코인 (카드도 필요)` },
    { k: 'bag', go: 'bag', t: () => `장비 강화 (+1 ${fmtN(gearEnhanceCost('rare', 0))}~) · 합성 수수료 ${fmtN(GEAR_FUSE_FEE.rare)}~` },
    { k: 'recruit', go: 'recruit', t: () => `코인 모집 — 1회 ${fmtN(L.GACHA_COST.one)} · 10회 ${fmtN(L.GACHA_COST.ten)} (하루 ${L.GACHA_COIN_DAILY}번까지)` },
    { k: 'itemshop', go: 'itemshop', t: () => `상점 — 덱 칸 · ${ITEMS.coupon.name} 같은 영구 강화 · 소모품` },
    { k: 'cardpick', go: 'cardpick', t: () => `카드 선택권 — ${fmtN(CARD_PICK.cost)} 코인에 카드 ${CARD_PICK.n}장` },
    { k: 'sta', go: 'sta', t: () => `체력 사기 — +${L.STAMINA.buy.n} (${fmtN(L.STAMINA.buy.cost[0])} · ${fmtN(L.STAMINA.buy.cost[1])} 코인)` },
  ],
  tickets: [
    { k: 'recruit', go: 'recruit', t: () => '모집 — 1회 1장 · 10회 10장 (코인 모집은 하루 제한이 있지만 모집권은 제한 없음)' },
  ],
  sta: [
    { k: 'stages', go: 'stages', t: () => `스테이지 출격 — 처음 ${L.STAMINA.stage} · ★★★ 깬 곳 ${L.STAMINA.repeat} · 헬 ${L.STAMINA.hell} (무한 · 레이드 · 대전은 안 써요)` },
  ],
  stones: [
    { k: 'bag', go: 'bag', t: () => `장비 강화 +6 이상 — 한 번에 1~${gearStoneNeed(9)}개 (+6 ${gearStoneNeed(5)}개 · +10 ${gearStoneNeed(9)}개)` },
    { k: 'gachagear', go: 'gachagear', t: () => `장비 뽑기 — 1회 ${L.GEAR_GACHA_COST.one} · 10회 ${L.GEAR_GACHA_COST.ten} (영웅 이상 1개 보장)` },
    { k: 'itemshop', go: 'itemshop', t: () => `소모품 — ${Object.entries(L.CONS_SHOP).filter(([, s]) => s.stones).map(([id, s]) => `${L.CONS[id].name} ${s.stones}`).join(' · ')}` },
  ],
  cards: [
    { k: 'deck', go: 'deck', t: () => `멤버 강화 — +1마다 ${heroCardNeed(0)}~${heroCardNeed(15)}장 (레벨이 높을수록 많이)` },
    { k: 'star', go: 'deck', t: () => `★승급 — ${L.STAR_SHARDS[1]} · ${L.STAR_SHARDS[2]} · ${L.STAR_SHARDS[3]} · ${L.STAR_SHARDS[4]}장` },
    { k: 'recruit', go: 'recruit', t: () => `T3 멤버 합류 — 모은 카드 ${L.UNLOCK_CARDS.epic}장으로 (LEGEND는 ${L.UNLOCK_CARDS.legend}장)` },
    { k: 'convert', go: 'convert', t: () => '다 키운 멤버의 남는 카드 → 범용 카드로 바꾸기' },
  ],
  wild: [
    { k: 'deck', go: 'deck', t: () => '멤버 강화 — 카드가 모자란 만큼 대신 채워요 (★승급은 안 돼요)' },
  ],
  sig: [
    { k: 'sigEx', go: 'sigEx', t: () => `신화 교환 — ${SIG_PITY}개로 원하는 멤버 전용 신화 장비 1개` },
  ],
  sp: [
    { k: 'season', go: 'season', t: () => `쓰는 게 아니라 쌓여요 — ${L.SP_PER_TIER}점마다 시즌 단계 +1 (${L.SEASON_TIERS}단계까지 · 단계마다 보상)` },
  ],
  tstone: [
    { k: 'towershop', go: 'towershop', lock: TW.TOWER.unlock, t: () => `탑 상점 — 지옥 세트 · 소모품 (${TW.TOWER_SHOP.filter((s) => s.kind === 'cons').map((s) => L.CONS[s.id].name).join(' · ')}) · 모집권 · 강화석 · 피로 회복제` },
    { k: 'tower', go: 'tower', lock: TW.TOWER.unlock, t: () => '지옥 세트 강화 (멤버마다)' },
  ],
  candy: [
    { k: 'hwshop', go: 'hwshop', t: () => `사탕 상점 — 의상 ${HWE.SHOP.find((s) => s.kind === 'costume').cost} · 모집권 ${HWE.SHOP.find((s) => s.kind === 'tickets').cost} · 강화석 · 장비 상자 · 칭호 · 프레임` },
  ],
};

// 하루 · 주 한도 (오늘 얼마나 남았나)
export function caps(id, p, now = Date.now()) {
  const out = [];
  const day = L.dayIndex(now);
  if (id === 'coins') {
    const ec = p.endCoins && p.endCoins.day === L.endlessDay(now) ? p.endCoins.v | 0 : 0;
    out.push({ t: `오늘 무한 도전 코인 ${fmtN(ec)} / ${fmtN(L.ENDLESS.coinCap)}`, full: ec >= L.ENDLESS.coinCap });
    out.push({ t: `오늘 코인 모집 ${L.GACHA_COIN_DAILY - L.gachaCoinLeft(p, now)} / ${L.GACHA_COIN_DAILY}번`, full: L.gachaCoinLeft(p, now) <= 0 });
    const pd = p.pvpDay && p.pvpDay.day === day ? p.pvpDay.n | 0 : 0;
    out.push({ t: `오늘 1:1 대전 보상 ${pd} / ${L.PVP_REWARD.perDay}판`, full: pd >= L.PVP_REWARD.perDay });
  } else if (id === 'tickets') out.push({ t: '하루 · 주 한도 없이 모아도 돼요 (쓰는 데도 제한 없음)' });
  else if (id === 'sta') {
    const v = L.staminaNow(p, now).v, b = p.staBuy && p.staBuy.day === day ? p.staBuy.n | 0 : 0;
    out.push({ t: v >= L.STAMINA.max ? `가득 찼어요 (${v}/${L.STAMINA.max}) — 더 쌓이지 않고 쉬어요` : `${v} / ${L.STAMINA.max} · 가득까지 ${Math.ceil(((L.STAMINA.max - v) * L.STAMINA.regenMs) / 60000)}분`, full: v >= L.STAMINA.max });
    out.push({ t: `오늘 체력 사기 ${b} / ${L.STAMINA.buy.perDay}번 · 선물로는 최대 ${L.STAMINA.cap}까지` });
  } else if (id === 'stones') out.push({ t: '한도 없이 모여요 (최대 99,999)' });
  else if (id === 'cards') { const wi = L.weekIndex(now), n = p.cardPick && p.cardPick.wi === wi ? p.cardPick.n | 0 : 0; out.push({ t: `이번 주 카드 선택권 ${n} / ${CARD_PICK.perWeek}번`, full: n >= CARD_PICK.perWeek }); }
  else if (id === 'sig') out.push({ t: `${amount(p, 'sig')} / ${SIG_PITY} — 한 번 교환하면 ${SIG_PITY}개가 빠져요` });
  else if (id === 'sp') out.push({ t: `지금 ${L.seasonTier(p)} / ${L.SEASON_TIERS}단계 · 다음 단계까지 ${L.SP_PER_TIER - (amount(p, 'sp') % L.SP_PER_TIER)}점` });
  else if (id === 'candy') { const h = p.hw || {}, g = h.day === day ? h.dayGot | 0 : 0; out.push({ t: `다시 깨서 받는 사탕은 하루 ${g} / ${dayCap()}개 (첫 클리어 · 새 기록 보너스는 따로)`, full: g >= dayCap() }); }
  else if (id === 'tstone') out.push({ t: '한도 없음 — 층을 처음 깰 때와 주간 랭킹으로만 늘어요' });
  return out;
}

// ─── 코드의 보상 표를 훑어서 "이 재화는 여기서 나온다" 를 다시 뽑는다 (테스트 · 목록 빠짐 검사) ───
export function derivedSources() {
  const d = {}; const add = (cur, k) => { (d[cur] = d[cur] || new Set()).add(k); };
  const scan = (rw, k) => {
    if (!rw) return;
    for (const [f, id] of Object.entries({ coins: 'coins', tickets: 'tickets', stones: 'stones', wild: 'wild', sp: 'sp', sta: 'sta', hell: 'tstone', candy: 'candy', shards: 'cards' })) {
      const v = rw[f]; if (v && (typeof v === 'object' ? Object.keys(v).length : v > 0)) add(id, k);
    }
  };
  const miss = [...L.DAILY_POOL, L.DAILY_ALL, ...L.WEEKLY_MISSIONS, ...L.ACHIEVEMENTS]; miss.forEach((m) => scan(m, 'missions'));
  L.CHECKIN.forEach((c) => scan(c, 'checkin')); scan({ sta: L.STAMINA.checkin }, 'checkin');
  scan({ sta: L.STAMINA.lvUp }, 'lvup'); scan({ sta: L.FRIEND.gift }, 'friends'); scan({ sta: L.STAMINA.max }, 'regen'); scan({ sta: L.STAMINA.buy.n }, 'buy'); scan({ sta: 1 }, 'stage');
  for (let t = 1; t <= L.SEASON_TIERS; t++) scan(L.seasonReward(1, t), 'season');
  for (let ch = 1; ch <= 8; ch++) for (const n of L.CHEST_STARS) scan(L.chestReward(ch, n), 'chest');
  for (const r of [1, 2, 5, 99]) scan(L.weeklyRankReward(r), 'weekly'); scan({ coins: L.weeklyCoins(L.WEEKLY_WAVES) }, 'weekly');
  for (const m of L.ENDLESS.miles) scan(L.milestoneReward(m), 'endless'); scan({ coins: endlessReward(10) }, 'endless');
  for (let f = 1; f <= TW.TOWER.floors; f++) scan(TW.floorReward(f), 'tower'); for (const r of [1, 2, 5, 99]) scan(TW.weekReward(r), 'tower');
  for (const k of Object.keys(R2.DIFF)) scan(R2.DIFF[k].rw, 'raid'); scan(R2.PART_RW, 'raid'); scan(R2.JOIN_RW, 'raid');
  scan({ coins: L.PVP_REWARD.win }, 'pvp'); for (const t of L.PVP_TIER_LADDER) scan(t[2], 'pvp');
  for (const r of [1, 2, 5, 99]) scan(HWE.rankReward(r), 'hw'); scan({ candy: 1 }, 'hw');
  for (const s of TW.TOWER_SHOP) if (s.kind === 'tickets') add('tickets', 'towershop'); else if (s.kind === 'stones') add('stones', 'towershop');
  for (const s of HWE.SHOP) { if (s.kind === 'tickets') add('tickets', 'hwshop'); else if (s.kind === 'stones') add('stones', 'hwshop'); else if (s.kind === 'shards') add('cards', 'hwshop'); }
  if (gearDismantle('rare', 0) > 0) add('stones', 'gear'); if (gearSellValue('rare', 0) > 0) add('coins', 'gear');
  if ([1, 2, 3, 4, 5].some((i) => rollStones(i, 6, 3, true, false) > 0)) add('stones', 'stage');
  add('coins', 'stage'); if ([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((i) => rollHeroCard(i, 3, false, ['bangjang']))) add('cards', 'stage');
  scan(L.DEX_RW.hero, 'dex'); for (const e of Object.values(L.DEX_RW.enemy)) scan(e, 'dex'); scan(L.DEX_RW.item, 'dex'); scan(L.DEX_RW.everyRw, 'dex');
  if (BK.BONKAE && Object.values(BK.BONKAE.fee).some((v) => v > 0)) add('coins', 'bonkae');
  add('cards', 'gacha'); add('cards', 'cardpick'); add('wild', 'convert'); add('sig', 'gachagear'); add('sig', 'gacha');
  for (const id of ['coins', 'tickets', 'stones', 'sp']) add(id, 'mail'); // 우편 보상 칸 (live.js cleanRw: coins · tickets · sp · stones · 장비 · 칭호 · 프레임 · 소모품)
  return d;
}
// 얻는 곳 목록에 빠진 것 [재화, 키] — 비어 있어야 한다
export function missingSources() { const d = derivedSources(), out = []; for (const [id, ks] of Object.entries(d)) for (const k of ks) if (!(SOURCES[id] || []).some((s) => s.k === k)) out.push([id, k]); return out; }
// 나열한 것 중 코드에 근거가 없는 것 [재화, 키] — 목록이 거짓말을 하면 안 된다
export function extraSources() { const d = derivedSources(), out = []; for (const [id, list] of Object.entries(SOURCES)) for (const s of list) if (!(d[id] && d[id].has(s.k))) out.push([id, s.k]); return out; }

export const lockedNow = (p, row) => !!row.lock && (int(p.maxStage) < row.lock && !p.master);
export const rowText = (row) => row.t();
export const lockText = (row) => lockTxt(row.lock);

// ─── 성장 길잡이 ───
//  env: { owned: [id], deck: [id], power(p, id) → 전투력, metaMax(id), costOf(p, id), uid, gearUp: [{ go, id, slot, gid, name, txt }] }
const cl = (p, over) => Object.assign({}, p, over);
export function heroCandidates(p, env) {
  const out = [], inDeck = new Set(env.deck || []);
  for (const h of env.owned) {
    const lv = int((p.heroes || {})[h]), nm = HEROES[h].name, L1 = lv + 1;
    const c = env.costOf(p, h), need = heroCardNeed(lv), sh = int((p.shards || {})[h]), have = sh + int(p.wild);
    const st = L.heroStar(p, h);
    if (st < L.STAR_MAX) {
      const sn = L.STAR_SHARDS[st], sc = L.STAR_COINS[st];
      if (sh >= sn) {
        const gain = env.power(cl(p, { hstars: Object.assign({}, p.hstars, { [h]: st + 1 }) }), h) - env.power(p, h);
        out.push({ kind: 'star', id: h, name: nm, deck: inDeck.has(h), cost: sc, afford: int(p.coins) >= sc, gain, need: { coins: sc, shards: sn }, todo: { go: 'star', id: h, name: nm } });
      }
    }
    if (c === null || c === undefined) continue;
    const gain = env.power(cl(p, { heroes: Object.assign({}, p.heroes, { [h]: L1 }) }), h) - env.power(p, h);
    out.push({ kind: 'hero', id: h, name: nm, deck: inDeck.has(h), lv: L1, mile: L1 % META_MILESTONE.every === 0, cost: c, afford: int(p.coins) >= c && have >= need, coinsOk: int(p.coins) >= c, cardsOk: have >= need, haveCards: have, needCards: need, gain, todo: { go: 'hero', id: h, name: nm } });
  }
  return out;
}
export function gearCandidates(p, env) {
  const out = [];
  for (const u of env.gearUp || []) {
    if (u.go === 'gear') {
      const eq = Object.assign({}, p.equip, { [u.id]: Object.assign({}, (p.equip || {})[u.id], { [u.slot]: u.gid }) });
      const gain = env.power(cl(p, { equip: eq }), u.id) - env.power(p, u.id);
      out.push({ kind: 'gear', id: u.id, name: u.name, deck: true, cost: 0, afford: true, gain, label: u.txt, todo: u });
    } else if (u.go === 'enh') {
      const it = (p.gear || []).find((g) => g.id === u.gid); if (!it) continue;
      const gear = p.gear.map((g) => (g.id === u.gid ? Object.assign({}, g, { lv: g.lv + 1 }) : g));
      const gain = env.power(cl(p, { gear }), u.id) - env.power(p, u.id);
      const cost = gearEnhanceCost(it.r, it.lv), st = gearStoneNeed(it.lv);
      out.push({ kind: 'enh', id: u.id, name: u.name, deck: true, cost: cost || 0, stones: st, afford: true, gain, label: u.txt, todo: u });
    }
  }
  return out;
}
const effOf = (c) => (c.cost > 0 ? (c.gain || 0) / (c.cost + (c.stones || 0) * 40) : 1e6 + (c.gain || 0)) * (c.deck ? 1 : 0.5);
const bucketOf = (c) => (c.kind === 'gear' ? 3 : 2);

export function growth(p, env, now = Date.now()) {
  const res = { main: null, list: [], saves: [], warns: [], cands: [] };
  if (!p) return res;
  const coins = int(p.coins), free = !!(p.master && !p.testNormal);
  const cands = [...heroCandidates(p, env), ...gearCandidates(p, env)].filter((c) => c.afford && c.gain > 0.0001).sort((a, b) => bucketOf(b) - bucketOf(a) || effOf(b) - effOf(a));
  res.cands = cands;
  const lineFor = (c) => {
    const g = c.gain >= 1 ? `전투력 +${fmtN(c.gain)}` : '전투력 조금';
    if (c.kind === 'hero') return { cur: 'coins', pre: `지금 코인 ${fmtN(coins)}${eu(coins)}는`, txt: `${c.name} 강화 +${c.lv}${c.deck ? '' : ' (덱 밖)'}가 가장 이득`, post: `(${g})`, sub: `코인 ${fmtN(c.cost)}${c.needCards ? ` · 카드 ${c.needCards}장` : ''}${c.mile ? ' · 각성 칸! 능력치 보너스' : ''}`, btn: `${c.name} 강화하기` };
    if (c.kind === 'star') return { cur: 'cards', pre: `지금 ${c.name} 카드가 넉넉해서`, txt: `${c.name} ★승급이 가장 이득`, post: `(${g})`, sub: `코인 ${fmtN(c.need.coins)} · 카드 ${c.need.shards}장`, btn: `${c.name} ★승급하기` };
    if (c.kind === 'gear') return { cur: 'coins', pre: '돈이 안 들어요', txt: c.label.replace(/\s+$/, '') + ' — 끼우기만 하면 돼요', post: `(${g})`, sub: '공짜로 전투력이 올라요', btn: `${c.name} 장비 바꾸기` };
    return { cur: 'stones', pre: `지금 코인 ${fmtN(coins)}${eu(coins)}는`, txt: `${c.label}이 가장 이득`, post: `(${g})`, sub: `코인 ${fmtN(c.cost)}${c.stones ? ` · 강화석 ${c.stones}개` : ''}`, btn: `${c.name} 장비 강화하기` };
  };
  const tk = int(p.tickets), sta = L.staminaNow(p, now).v;
  let main = null;
  if (cands[0]) { const l = lineFor(cands[0]); main = Object.assign(l, { line: `${l.pre} → ${l.txt} ${l.post}`, todo: cands[0].todo, kind: cands[0].kind }); }
  else if (tk >= 1) main = { cur: 'tickets', line: `지금 모집권 ${fmtN(tk)}장 → ${tk >= 10 ? '10회 모집이 가장 이득 (영웅 이상 1개 확정)' : '모집으로 새 멤버를 노려요'}`, sub: '모집권은 쓰는 만큼 이득이에요', btn: '모집하러 가기', go: 'recruit', kind: 'recruit' };
  else if (sta >= L.stageStaminaCost(p, p.maxStage || 1, false)) main = { cur: 'sta', line: `지금 강화할 게 없어요 → 스테이지에 나가 코인 · 카드를 모아요 (체력 ${sta})`, sub: '코인 · 카드 · 강화석은 스테이지에서 제일 잘 모여요', btn: '출격하러 가기', go: 'stages', kind: 'stage' };
  else main = { cur: 'sta', line: `체력이 부족해요 (${sta}) → 미션 · 출석 · 우편을 먼저 받아요`, sub: `${Math.round(L.STAMINA.regenMs / 60000)}분마다 체력 1씩 차요`, btn: '미션 보러 가기', go: 'missions', kind: 'mission' };
  res.main = main;

  // 순위 목록: 재화마다 제일 좋은 쓸 곳 한 줄 (많아야 5)
  const rows = [];
  const hero = cands.find((c) => c.kind === 'hero'), star = cands.find((c) => c.kind === 'star'), gearSw = cands.find((c) => c.kind === 'gear'), enh = cands.find((c) => c.kind === 'enh');
  if (gearSw) rows.push({ cur: 'coins', pri: 90, txt: `${gearSw.name}: ${gearSw.label}`, sub: '돈 없이 전투력 상승', todo: gearSw.todo, btn: '바꾸기' });
  if (star) rows.push({ cur: 'cards', pri: 85, txt: `${star.name} ★승급 (전투력 +${fmtN(star.gain)})`, sub: `코인 ${fmtN(star.need.coins)} · 카드 ${star.need.shards}장`, todo: star.todo, btn: '승급' });
  if (hero) rows.push({ cur: 'coins', pri: 80, txt: `${hero.name} 강화 +${hero.lv} (전투력 +${fmtN(hero.gain)})`, sub: `코인 ${fmtN(hero.cost)} · 카드 ${hero.needCards}장`, todo: hero.todo, btn: '강화' });
  if (enh) rows.push({ cur: 'stones', pri: 70, txt: `${enh.label} (전투력 +${fmtN(enh.gain)})`, sub: `코인 ${fmtN(enh.cost)}${enh.stones ? ` · 강화석 ${enh.stones}개` : ''}`, todo: enh.todo, btn: '강화' });
  if (tk >= 1) rows.push({ cur: 'tickets', pri: tk >= 10 ? 88 : 60, txt: tk >= 10 ? `모집권 ${fmtN(tk)}장 → 10회 모집 (영웅 이상 1개 확정)` : `모집권 ${fmtN(tk)}장 → 모집`, sub: '쓰는 만큼 이득', go: 'recruit', btn: '모집' });
  // 카드가 모자라 못 키우는 덱 멤버 → 카드 모으기
  const cardWant = heroCandidates(p, env).filter((c) => c.kind === 'hero' && c.deck && c.coinsOk && !c.cardsOk).sort((a, b) => b.gain - a.gain)[0];
  if (cardWant) rows.push({ cur: 'cards', pri: 65, txt: `${cardWant.name} 카드 ${cardWant.haveCards}/${cardWant.needCards}장 — 코인은 충분해요`, sub: `카드 선택권(${fmtN(CARD_PICK.cost)} 코인)이나 스테이지 · 모집으로 모아요`, go: 'cardpick', btn: '카드 얻기' });
  const sw = int(p.stones), gg = L.GEAR_GACHA_COST;
  if (sw >= gg.ten) rows.push({ cur: 'stones', pri: 55, txt: `강화석 ${fmtN(sw)}개 → 장비 10회 뽑기 (${gg.ten}개 · 영웅 이상 1개 보장)`, sub: '강화에 쓸 몫을 남겨 두고 뽑아요', go: 'gachagear', btn: '뽑기' });
  else if (sw >= gg.one) rows.push({ cur: 'stones', pri: 40, txt: `강화석 ${fmtN(sw)}개 — 장비 +6 이상 강화에 써요`, sub: `10회 뽑기는 ${gg.ten}개부터`, go: 'bag', btn: '장비' });
  const wd = int(p.wild);
  if (wd >= 1) rows.push({ cur: 'wild', pri: 45, txt: `범용 카드 ${fmtN(wd)}장 — 카드가 모자란 멤버 강화에 자동으로 써요`, sub: '★승급에는 못 써요', go: 'deck', btn: '멤버 강화' });
  const sg = amount(p, 'sig');
  if (sg >= SIG_PITY) rows.push({ cur: 'sig', pri: 75, txt: `신화 조각 ${fmtN(sg)}개 → 전용 신화 장비 교환`, sub: `${SIG_PITY}개가 들어요`, go: 'sigEx', btn: '교환' });
  const ts = amount(p, 'tstone'); const ls = TW.TOWER_SHOP.filter((s) => s.cost <= ts).length;
  if (ts > 0 && ls) rows.push({ cur: 'tstone', pri: 35, txt: `염화석 ${fmtN(ts)}개 — 탑 상점에서 살 수 있어요`, sub: '지옥 세트 · 모집권 · 강화석', go: 'towershop', btn: '탑 상점' });
  const cd = amount(p, 'candy'); const cs = HWE.SHOP.filter((s) => s.cost <= cd).length;
  if (cd > 0 && cs) rows.push({ cur: 'candy', pri: 52, txt: `할로윈 사탕 ${fmtN(cd)}개 — 사탕 상점에서 바꿀 수 있어요`, sub: '이벤트가 끝나기 전에 써요', go: 'hwshop', btn: '사탕 상점' });
  const sp = amount(p, 'sp'); if (sp > 0) rows.push({ cur: 'sp', pri: 20, txt: `시즌 ${L.seasonTier(p)}단계 — 다음 단계까지 ${L.SP_PER_TIER - (sp % L.SP_PER_TIER)}점`, sub: '일일 · 주간 미션으로 올라요', go: 'missions', btn: '미션' });
  res.list = rows.sort((a, b) => b.pri - a.pri).filter((r) => !(main && main.todo && r.todo && r.todo === main.todo)).slice(0, 5);

  // 모아 두세요
  const saves = [];
  for (const c of heroCandidates(p, env).filter((x) => x.kind === 'hero' && x.mile && !x.coinsOk && x.cardsOk && x.deck && int(p.coins) >= x.cost * 0.35).sort((a, b) => a.cost - b.cost).slice(0, 1)) {
    saves.push({ cur: 'coins', txt: `${c.name} +${c.lv}는 각성 칸이라 코인이 두 배(${fmtN(c.cost)}) — 지금 ${fmtN(coins)}이니 다른 데 쓰지 말고 모아 두세요`, go: 'deck' });
  }
  if (!saves.length && cands[0] && cands[0].kind === 'hero') {
    const nxt = heroCandidates(p, env).find((x) => x.kind === 'hero' && x.id === cands[0].id);
    if (nxt) { const mileLv = Math.ceil((nxt.lv) / META_MILESTONE.every) * META_MILESTONE.every; if (mileLv > nxt.lv && mileLv - nxt.lv <= 2 && nxt.deck) saves.push({ cur: 'coins', txt: `${nxt.name} +${mileLv}는 각성 칸 (코인 두 배 · 능력치 보너스) — 그때까지 코인을 아껴 두면 좋아요`, go: 'deck' }); }
  }
  if (sg >= SIG_PITY * 0.6 && sg < SIG_PITY) saves.push({ cur: 'sig', txt: `신화 조각 ${sg}/${SIG_PITY} — 조금만 더 모으면 전용 신화를 골라서 받아요`, go: 'gachagear' });
  const ep = L.GEAR_PITY - int((p.pity || {}).gear); if (sw >= gg.ten * 0.6 && sw < gg.ten) saves.push({ cur: 'stones', txt: `강화석 ${sw}/${gg.ten} — 모으면 장비 10회 뽑기 (영웅 이상 확정)`, go: 'gachagear' });
  void ep;
  res.saves = saves.slice(0, 2);

  // 낭비 경고
  const warns = [];
  if (!free && sta >= L.STAMINA.max) warns.push({ cur: 'sta', txt: `체력이 가득 찼어요 (${sta}/${L.STAMINA.max}) — 더 안 쌓여요! 지금 출격해요`, go: 'stages', btn: '출격' });
  if (tk >= 10) warns.push({ cur: 'tickets', txt: `모집권 ${fmtN(tk)}장을 안 쓰고 있어요 — 10회 모집이 가능해요`, go: 'recruit', btn: '모집' });
  else if (tk >= 3) warns.push({ cur: 'tickets', txt: `모집권 ${fmtN(tk)}장이 남아 있어요`, go: 'recruit', btn: '모집' });
  const cm = env.uid ? L.claimable(p, env.uid, now) : 0; if (cm > 0) warns.push({ cur: 'sp', txt: `미션 보상 ${cm}개를 안 받았어요 — 받아야 코인 · 모집권 · 시즌 점수`, go: 'missions', btn: '받기' });
  const ml = L.mailCount(p, now); if (ml > 0) warns.push({ cur: 'coins', txt: `우편 ${ml}통이 기다려요 — 지나면 사라져요 (${L.MAIL_DAYS}일)`, go: 'mail', btn: '받기' });
  if (!L.checkinState(p, now).done) warns.push({ cur: 'coins', txt: '오늘 출석을 안 했어요 — 코인 · 체력을 받아요', go: 'checkin', btn: '출석' });
  if (p.endlessUnlocked && !free && L.endlessLeft(p, now) > 0 && L.endlessLeft(p, now) === L.ENDLESS.perDay) warns.push({ cur: 'coins', txt: `오늘 무한 도전을 아직 안 했어요 (${L.endlessLeft(p, now)}번 남음) — 아침 5시에 초기화돼요`, go: 'endless', btn: '도전' });
  const ec = p.endCoins && p.endCoins.day === L.endlessDay(now) ? p.endCoins.v | 0 : 0; if (ec >= L.ENDLESS.coinCap) warns.push({ cur: 'coins', txt: '오늘 무한 도전 코인 상한에 닿았어요 — 더 해도 코인은 안 늘어요', go: 'stages', btn: '스테이지' });
  res.warns = warns.slice(0, 4);
  return res;
}
