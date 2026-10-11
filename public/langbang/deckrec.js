// 추천 덱 — 모든 「추천 덱」 버튼(출전 준비 · 덱 편집 · 로비 · 실패 공략 · 이벤트)이 같이 쓰는 한 가지 기준.
//  화면 코드(game.js)와 분리한 순수 계산: 입력은 ctx 하나, 출력은 덱 + 멤버마다 "왜 뽑았나" 꼬리표.
//
//  기준 (앞이 우선):
//   1) 필수 대응   이 판 진상이 거는 것(기절 · 홀림 · 독 · 빙결 · 문 강타 · 풀 때까지 · 철갑 · 은신 · 보호막 · 맵 효과 …)을
//                  막을 수 있는 멤버가 있으면 먼저 넣는다 (한 명이 여러 개 막으면 그 멤버부터)
//   2) 역할 균형   대장(1번 자리)은 딜러 · 어려운 판은 탱커/지원이 한 명 이상
//   3) 속성 상성   이 스테이지 진상에게 유리한 속성
//   4) 실제 힘     강화 · ★ · 장비가 들어간 전투력 — 비슷하면 센 멤버
//   5) 자리        열린 칸 수 · 가진 멤버만
//  게임 화면 코드를 모르는 순수 모듈: 전투력은 ctx.power(id) 로 받는다.
import {
  HEROES, ENEMIES, HERO_ROLE, COND, EST, TRAITS, ARMOR_BREAKERS, WEEK_TRAIT,
  attrScores, stageBosses, stageMid, stageMix, stageConds, stageEnemies, armorPctStage, enemySkills, ccLockStage, chapterOf,
  heroPowerOf,
} from './data.js';
import { RULE } from './rules.js';

export const LOCK_CNT = ['gunnyeo', 'dohoon', 'soyoung', 'jungmin', 'dragon', 'bangjang'].filter((id) => HEROES[id]);
const THR_ST = ['poison', 'charm', 'freeze', 'stun', 'door'];
const COND_TAG = { cc: '기절 대비', armor: '철갑 대응', stealth: '숨은 진상 탐지', shield: '보호막 깨기', swarm: '떼거리 범위', rush: '문 돌격 대비' };
const ST_TAG = { stun: '기절 대비', charm: '홀림 대비', poison: '독 대비', freeze: '빙결 대비', door: '입구 강타 대비', silence: '침묵 대비', slow: '공속↓ 대비' };
const DEALER = ['aoe', 'single', 'ctrl']; // 대장 후보 (딜러)
const roleOf = (id) => HERO_ROLE[id] || 'special';
export const isDealer = (id) => DEALER.includes(roleOf(id));
const weakLead = (id) => roleOf(id) === 'support' || id === 'jeongseob';

// 이 스테이지 주요 진상 (출전 준비 '등장 진상' 과 같은 기준)
export function stageFoes(s) {
  const mix = stageMix(s).filter(([t]) => ENEMIES[t] && !ENEMIES[t].dot).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  return [...new Set([...mix, ...stageBosses(s), ...(stageMid(s) ? [stageMid(s)] : [])])].filter((t) => ENEMIES[t]);
}
// 이 스테이지 진상 기술이 거는 상태이상 → { stun: ['기술 이름', ...] }
export function stageThreats(s) {
  const thr = {};
  for (const t of stageFoes(s)) for (const k of enemySkills(t)) if (THR_ST.includes(k.st)) (thr[k.st] = thr[k.st] || []).push(k.name);
  return thr;
}

// ─── 필요(needs) 만들기 ───
//  { key, kind: cond|armor|thr|lock|trait|fx|mode|extra, tag(꼬리표), name, counter:[멤버], w(우선순위), warn(출전 준비 경고와 같은 종류) }
export function needsOf(ctx) {
  const mode = ctx.mode || 'stage', s = ctx.stage | 0, hell = !!ctx.hell, out = [];
  const hw = hell ? 1.15 : 1;
  const add = (n) => { if (n.counter && n.counter.length && !out.some((x) => x.key === n.key)) out.push(Object.assign({ w: 50, warn: false }, n, { counter: n.counter.filter((h) => HEROES[h]) })); };
  const stageMode = (mode === 'stage' || mode === 'hell') && s > 0;
  if (stageMode) {
    // 스테이지 기믹 (보호막 · 은신 · 기절 예고 · 철갑 · 떼 · 문 돌격)
    const W = { cc: 85, armor: 75, shield: 70, stealth: 70, rush: 55, swarm: 50 };
    for (const c of stageConds(s, hell)) if (COND[c]) add({ key: 'cond:' + c, kind: 'cond', tag: COND_TAG[c], name: COND[c].name, counter: COND[c].counter, w: (W[c] || 50) * hw, warn: true });
    // 방어율 (정예 · 보스가 단단)
    if (armorPctStage(s, { hp: 999 }, true) >= 0.15) add({ key: 'armor', kind: 'armor', tag: '철갑 대응', name: '방어율', counter: ARMOR_BREAKERS, w: 75 * hw, warn: true });
    // 진상 기술
    const thr = stageThreats(s), TW = { stun: 80, charm: 80, poison: 78, freeze: 76, door: 58 };
    for (const st of Object.keys(thr)) add({ key: 'thr:' + st, kind: 'thr', st, tag: ST_TAG[st], name: EST[st].name + ' 기술', counter: EST[st].counter, w: (TW[st] || 60) * hw, warn: true, skills: [...new Set(thr[st])].slice(0, 2) });
    // 진상 능력 (범위 면역 · 재생 · 은신 …)
    const seen = new Set();
    for (const t of stageEnemies(s)) for (const k of Object.keys((ENEMIES[t] && ENEMIES[t].traits) || {})) if (TRAITS[k] && !seen.has(k)) { seen.add(k); add({ key: 'trait:' + k, kind: 'trait', tag: TRAITS[k].name + ' 대응', name: TRAITS[k].name, counter: TRAITS[k].counter, w: 40 }); }
    // 맵 효과 (rules.js 추천 멤버)
    const fid = ctx.fx;
    const fr = fid && RULE['fx:' + fid];
    if (fr && fr.pick && fr.pick.length) add({ key: 'fx:' + fid, kind: 'fx', tag: '맵 효과 대응', name: fr.name, counter: fr.pick, w: 25 });
  }
  // 풀 때까지 (헬 7·8장 · 무한 4단계부터)
  if ((stageMode && ccLockStage(s, hell)) || (mode === 'endless' && ctx.lock !== false)) add({ key: 'lock', kind: 'lock', tag: '상태이상 해제', name: '풀 때까지', counter: LOCK_CNT, w: 90 * hw, warn: stageMode });
  // 모드별
  if (mode === 'weekly') {
    const M = ctx.mod;
    const roleSet = (...rs) => Object.keys(HERO_ROLE).filter((h) => rs.includes(HERO_ROLE[h]));
    if (M === 'double') add({ key: 'wk:double', kind: 'mode', tag: '진상 2배 — 범위', name: '진상 2배', counter: COND.swarm.counter, w: 60 });
    if (M === 'speed') add({ key: 'wk:speed', kind: 'mode', tag: '광속 진상 — 감속', name: '광속 진상', counter: ['jieun', 'dohoon', 'soyoung', 'staff', 'wonsik', 'byunghwa'], w: 60 });
    if (M === 'giant' || M === 'bossrush') add({ key: 'wk:' + M, kind: 'mode', tag: '한 방 센 멤버', name: M === 'giant' ? '거인의 밤' : '보스 러시', counter: roleSet('single', 'tank'), w: 55 });
    if (M === 'glass') add({ key: 'wk:glass', kind: 'mode', tag: '입구 지키기', name: '유리 입구', counter: EST.door.counter, w: 60 });
    if (M === 'chain') add({ key: 'wk:chain', kind: 'mode', tag: '몰아서 터뜨리기', name: '연쇄 폭발', counter: roleSet('aoe'), w: 45 });
    const wt = WEEK_TRAIT[ctx.trait];
    if (wt) add({ key: 'wt:' + wt.id, kind: 'mode', tag: '이번 주 특성', name: wt.name, counter: wt.rec, w: 30 });
  }
  if (mode === 'endless') add({ key: 'end:swarm', kind: 'mode', tag: '떼거리 범위', name: '떼거리', counter: COND.swarm.counter, w: 45 });
  // 호출한 쪽이 넘기는 필요 (이벤트 규칙 · 탑 위험 · 실패 공략 …)
  for (const n of ctx.extraNeeds || []) add(Object.assign({ kind: 'extra', w: 100 }, n));
  return out.sort((a, b) => b.w - a.w);
}

// 지금 덱이 못 막는 필요 (출전 준비 경고와 같은 기준 — warn 인 것만)
export function deckGaps(ctx, deck, needs) {
  const d = deck.filter(Boolean);
  return (needs || needsOf(ctx)).filter((n) => n.warn && !d.some((id) => n.counter.includes(id)));
}

// ─── 추천 덱 ───
//  ctx: {
//    mode: 'stage' | 'hell' | 'weekly' | 'endless' | 'tower' | 'event' | 'pvp' | 'raid',
//    stage, hell, fx(맵 효과 id), mod(주간 도전 변형), trait(이번 주 진상 특성),
//    owned: [가진 멤버], slots: 열린 칸 수, power(id): 전투력,
//    ban(id): 못 데려가는 멤버 (이벤트), lead: 대장으로 고정할 멤버 · prefer: 대장 후보 우선,
//    extraNeeds: [{ key, tag, name, counter, n, w }] }
//  반환: { deck: [대장, ...], reasons: { id: [꼬리표...] }, gaps: [못 막는 필요 + 못 가진 멤버], needs }
export function recommendDeck(ctx) {
  const mode = ctx.mode || 'stage';
  const k0 = Math.max(1, ctx.slots | 0 || 5);
  const ban = ctx.ban || (() => false);
  const pool = [...new Set(ctx.owned || [])].filter((id) => HEROES[id] && !HEROES[id].summon && !ban(id));
  const k = Math.min(k0, pool.length);
  if (!k) return { deck: [], reasons: {}, gaps: [], needs: [] };
  const powerOf = ctx.power || ((id) => heroPowerOf(id, 0, 1, {}));
  const pw = {}; let pmax = 1;
  for (const id of pool) { pw[id] = Math.max(1, powerOf(id) || 1); if (pw[id] > pmax) pmax = pw[id]; }
  const rank = pool.slice().sort((a, b) => pw[b] - pw[a]);
  const needs = needsOf(ctx);
  // 속성 상성 (스테이지가 있을 때만)
  const hasStage = (mode === 'stage' || mode === 'hell' || mode === 'weekly') && ctx.stage > 0;
  const sc = hasStage ? attrScores(ctx.stage) : null;
  const boss = hasStage && stageBosses(ctx.stage).length > 0;
  const elem = (id) => (sc ? sc[HEROES[id].attr] : 1);
  const fit = (id) => elem(id) * (HEROES[id].kit || 1) * (boss ? HEROES[id].bossKit || 1 : 1);
  const fill = (id) => fit(id) * (0.75 + 0.25 * (pw[id] / pmax)); // 상성이 비슷하면 센 멤버
  const score = (id) => (mode === 'pvp' ? fill(id) * (0.4 + 0.6 * (pw[id] / pmax)) : fill(id));

  const deck = [], tags = {};
  const tag = (id, t) => { if (!t) return; const l = (tags[id] = tags[id] || []); if (!l.includes(t)) l.push(t); };
  const put = (id) => { if (!deck.includes(id) && deck.length < k) deck.push(id); };
  // 대장을 고정해야 하면 먼저 (실패 공략: 지금 대장 유지)
  if (ctx.lead && pool.includes(ctx.lead)) put(ctx.lead);

  // 1) 필수 대응: 아직 못 막은 필요를 가장 많이(우선순위 합) 막는 멤버부터 — 자리 하나는 딜러 몫으로 남긴다
  const cap = k <= 1 || mode === 'event' ? k : k - 1; // 자리 하나는 딜러 몫 (이벤트는 규칙이 먼저)
  const need = (n) => n.n || 1;
  const covers = (n, d) => d.filter((id) => n.counter.includes(id)).length;
  for (let guard = 0; guard < 12 && deck.length < cap; guard++) {
    const open = needs.filter((n) => covers(n, deck) < need(n));
    if (!open.length) break;
    let best = null, bg = 0;
    for (const id of pool) {
      if (deck.includes(id)) continue;
      let g = 0;
      for (const n of open) if (n.counter.includes(id)) g += n.w;
      if (g <= 0) continue;
      g += score(id) * 0.5 + (pw[id] / pmax) * 0.3; // 같은 값이면 상성 · 힘이 좋은 쪽
      if (g > bg) { bg = g; best = id; }
    }
    if (!best) break;
    put(best);
  }
  for (const n of needs) for (const id of deck) if (n.counter.includes(id)) tag(id, n.tag);

  // 2) 역할: 딜러 한 명은 꼭 (대장 자리) · 어려운 판이면 탱커/지원 한 명
  // 자리가 꽉 찼을 때 바꿔 넣을 자리: 필수 대응이 아닌 멤버 중 가장 약한 쪽 (fit 은 딜러 여부로 한 번 더 거른다)
  const swapOut = (okFn) => deck.filter((id) => !(tags[id] || []).length && okFn(id)).sort((a, b) => score(a) - score(b))[0];
  if (!deck.some(isDealer)) {
    const cand = pool.filter((id) => !deck.includes(id) && isDealer(id)).sort((a, b) => score(b) - score(a))[0];
    if (cand) {
      if (deck.length < k) put(cand);
      else { const out = swapOut(() => true); if (out) deck[deck.indexOf(out)] = cand; }
      if (deck.includes(cand)) tag(cand, '대장 딜러');
    }
  }
  const hard = hell0(ctx) || mode === 'endless';
  if (hard && k >= 4 && !deck.some((id) => ['tank', 'support'].includes(roleOf(id)))) {
    const cand = pool.filter((id) => !deck.includes(id) && ['tank', 'support'].includes(roleOf(id))).sort((a, b) => score(b) - score(a))[0];
    if (cand) {
      if (deck.length < k) put(cand);
      else { const out = swapOut((id) => !isDealer(id) || deck.filter(isDealer).length > 1); if (out) deck[deck.indexOf(out)] = cand; }
      if (deck.includes(cand)) tag(cand, roleOf(cand) === 'tank' ? '탱커 — 버팀' : '지원 — 버팀');
    }
  }

  // 3~4) 남은 자리: 상성 × 힘
  const rest = pool.filter((id) => !deck.includes(id)).sort((a, b) => score(b) - score(a));
  for (const id of rest) { if (deck.length >= k) break; put(id); }

  // 대장: 딜러 중 가장 좋은 멤버를 1번으로 (고정 대장 > 추천 대장 > 딜러)
  let leader = ctx.lead && deck.includes(ctx.lead) ? ctx.lead : null;
  if (!leader) {
    const pref = (ctx.prefer || []).filter((id) => deck.includes(id) && !weakLead(id)).sort((a, b) => pw[b] - pw[a])[0];
    leader = pref || deck.filter((id) => isDealer(id)).sort((a, b) => score(b) * (0.5 + 0.5 * pw[b] / pmax) - score(a) * (0.5 + 0.5 * pw[a] / pmax))[0]
      || deck.filter((id) => !weakLead(id)).sort((a, b) => pw[b] - pw[a])[0] || deck[0];
  }
  const ordered = [leader, ...deck.filter((id) => id !== leader)];
  if (isDealer(leader) || !weakLead(leader)) tag(leader, '대장 딜러');

  // 꼬리표 마무리: 상성 · 힘 · 균형
  const topElem = sc ? Object.keys(sc).filter((a) => sc[a] > 1.05).sort((a, b) => sc[b] - sc[a]).slice(0, 2) : [];
  for (const id of ordered) {
    if (topElem.includes(HEROES[id].attr)) tag(id, '상성 유리');
    if (rank.indexOf(id) < Math.max(2, Math.ceil(pool.length / 5))) tag(id, '가장 강함');
    if (!(tags[id] || []).length) tag(id, hasStage ? '든든한 자리 메우기' : '균형');
  }
  const reasons = {};
  for (const id of ordered) { const l = (tags[id] || []).filter((t) => t !== '대장 딜러'); reasons[id] = (id === leader && (tags[id] || []).includes('대장 딜러') ? ['대장 딜러', ...l] : l).slice(0, 2); }

  // 못 막은 필요: 가진 멤버가 없어서 (또는 자리가 모자라서)
  const gaps = needs.filter((n) => covers(n, ordered) < need(n)).map((n) => ({
    key: n.key, tag: n.tag, name: n.name, warn: n.warn, counter: n.counter,
    ownedLeft: n.counter.filter((h) => pool.includes(h) && !ordered.includes(h)),
    missing: n.counter.filter((h) => !(ctx.owned || []).includes(h)),
  }));
  return { deck: ordered, reasons, gaps, needs };
}
function hell0(ctx) { return !!ctx.hell || ctx.mode === 'hell' || (ctx.stage > 0 && chapterOf(ctx.stage) >= 5 && ctx.mode !== 'pvp'); }

// 기본 속성/상성 안내용: "이렇게 짜요" (UI 설명 시트 · 도움말이 같은 문장을 쓴다)
export const RECOMMEND_STEPS = [
  ['막아야 할 것부터', '이 판 진상이 거는 기절 · 홀림 · 독 · 빙결 · 철갑 · 은신 · 보호막을 막을 수 있는 멤버를 먼저 넣어요 (내가 가진 멤버만)'],
  ['대장은 딜러', '1번 자리는 잘 때리는 멤버예요. 어려운 판은 버텨 주는 탱커나 지원도 한 명 넣어요'],
  ['속성 상성', '이 스테이지 진상에게 유리한 속성(말빨 · 힘 · 매력 · 술)을 우선해요'],
  ['더 센 멤버', '비슷하면 강화 · ★ · 장비로 전투력이 높은 멤버를 골라요'],
  ['내 자리만큼', '열려 있는 덱 칸 수와 합류한 멤버만 써요 — 없는 멤버는 얻는 방법을 알려 드려요'],
];
