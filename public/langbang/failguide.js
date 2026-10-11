// 실패 공략 카드 — 진 뒤 결과 화면 · 진 적 있는 스테이지의 출전 준비 화면에서 "왜 졌고 · 누구를 데려가면 좋나" 를 짧게 알려 준다
//  화면 코드 (game.js) 와 분리한 순수 계산 — 테스트로 추천 로직을 지킨다
//  재료: 준비 화면 경고와 같은 데이터 (stageConds · COND.counter · EST.counter · ARMOR_BREAKERS · enemySkills · recMeta) + 그 판에서 센 숫자 (입구를 친 진상 · 걸린 상태이상 · 무너진 시각 · 웨이브)
import {
  HEROES, ENEMIES, COND, EST, ARMOR_BREAKERS, armorPctStage, stageConds, enemySkills, recMeta, stageBosses, stageMid, stageMix, stageLabel,
  recommendTeam, heroRoute, heroTier, HERO_UNLOCK, HIDDEN_COND, JOIN_PICKS, SHORT_NAME, ccLockStage,
} from './data.js';

const foeName = (t) => (SHORT_NAME && SHORT_NAME[t]) || (ENEMIES[t] ? ENEMIES[t].name : t);
const PREP_ST = ['poison', 'charm', 'freeze', 'stun', 'door']; // 준비 화면 '진상 기술 경고' 와 같은 종류
const RUN_ST = ['stun', 'charm', 'poison', 'freeze', 'silence', 'slow', 'blind']; // 판에서 센 상태이상 중 공략에 쓰는 것

// 이 스테이지 주요 진상 (준비 화면 '등장 진상' 과 같은 기준)
export function stageFoes(s) {
  const mix = stageMix(s).filter(([t]) => ENEMIES[t] && !ENEMIES[t].dot).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t]) => t);
  return [...new Set([...mix, ...stageBosses(s), ...(stageMid(s) ? [stageMid(s)] : [])])].filter((t) => ENEMIES[t]);
}
// 이 스테이지 진상 기술이 거는 상태이상 → { stun: ['기술 이름', ...] }
export function stageThreats(s) {
  const thr = {};
  for (const t of stageFoes(s)) for (const k of enemySkills(t)) if (PREP_ST.includes(k.st)) (thr[k.st] = thr[k.st] || []).push(k.name);
  return thr;
}
// 멤버를 어떻게 얻나 — 획득 규정 (data.js heroRoute · HERO_UNLOCK · JOIN_PICKS) 에서 한 줄
export function howToGet(id) {
  const r = heroRoute(id), t = heroTier(id);
  if (r === 'start') return '처음부터 있어요';
  if (r === 'story') return `${stageLabel(HERO_UNLOCK[id])} 처음 깨면 합류`;
  if (r === 'hidden') return HIDDEN_COND[id] ? HIDDEN_COND[id].text : '숨은 조건을 채우면 합류';
  if (r === 'legend') return '6-10 클리어 뒤 모집 (110번 확정)';
  const picks = JOIN_PICKS.filter((j) => j.tier === t).map((j) => stageLabel(j.stage));
  return t >= 4 ? `모집 (T4 · 50번 확정)${picks.length ? ` · ${picks.join(' · ')} 선택권` : ''}` : `모집 카드 10장${picks.length ? ` · ${picks.join(' · ')} 선택권` : ''}`;
}

// 공략에서 짚을 '필요' 목록 — 그 판에서 실제로 맞은 것 먼저, 그다음 스테이지 기믹
//  반환: [{ key, label, why, counter: [멤버] }]  (최대 3개)
export function guideNeeds(s, hell, run) {
  run = run || {};
  const out = [], seen = new Set();
  const push = (key, label, why, counter) => { if (!seen.has(key) && counter && counter.length) { seen.add(key); out.push({ key, label, why, counter: counter.filter((h) => HEROES[h]) }); } };
  // 1) 이번 판에서 실제로 많이 걸린 상태이상
  const hit = Object.entries(run.hitBy || {}).filter(([st]) => RUN_ST.includes(st) && EST[st]).sort((a, b) => b[1] - a[1]);
  for (const [st, n] of hit.slice(0, 2)) if (n >= 2) push('st:' + st, `${EST[st].name} 걸림 ${n}번`, '', EST[st].counter);
  // 2) 입구를 제일 많이 친 진상이 철갑이면 방깎 · 방관
  const door = Object.entries(run.doorBy || {}).filter(([t]) => ENEMIES[t]).sort((a, b) => b[1] - a[1]);
  if (door.length) {
    const ap = armorPctStage(s, ENEMIES[door[0][0]], true);
    if (ap >= 0.15) push('armor', `방어율 ${Math.round(ap * 100)}%`, '', ARMOR_BREAKERS);
  }
  // 3) 스테이지 기믹 (보호막 · 숨은 진상 · 기절 예고 · 철갑 · 떼 · 문 돌격)
  for (const c of stageConds(s, hell)) if (COND[c]) push('cond:' + c, COND[c].name, '', COND[c].counter);
  // 4) 진상 기술 (독 · 홀림 · 빙결 · 기절 · 입구 강타)
  const thr = stageThreats(s);
  for (const st of Object.keys(thr)) if (EST[st]) push('thr:' + st, `${EST[st].name} 기술`, [...new Set(thr[st])].slice(0, 2).join(' · '), EST[st].counter);
  return out.slice(0, 3);
}

// 멤버 가치 (대충 센 정도): 등급 + 강화 — 같은 역할이면 센 멤버를 먼저 권한다
const worth = (p, id) => heroTier(id) * 10 + ((p.heroes || {})[id] | 0);

// 필요 하나에 대해: 내가 가진 맞는 멤버(센 순) · 못 가진 맞는 멤버(얻기 쉬운 순)
export function counterChips(need, ownedIds, p, deckIds) {
  const own = new Set(ownedIds), inDeck = new Set(deckIds || []);
  const mine = need.counter.filter((h) => own.has(h)).sort((a, b) => worth(p, b) - worth(p, a)).slice(0, 3).map((id) => ({ id, own: true, inDeck: inDeck.has(id) }));
  const route = (h) => ({ start: 0, story: 1, hidden: 3, gacha: 2, legend: 4 }[heroRoute(h)] || 2);
  const miss = need.counter.filter((h) => !own.has(h)).sort((a, b) => route(a) - route(b) || heroTier(a) - heroTier(b)).slice(0, 2).map((id) => ({ id, own: false, how: howToGet(id) }));
  return { mine, miss };
}

// 추천 덱: 속성 상성 추천(recommendTeam) 위에, 덱이 못 막는 '필요' 마다 가진 멤버 한 명씩 끼워 넣는다 (대장 자리는 그대로)
export function recommendFixDeck(s, hell, ownedIds, slots, curDeck, p, run) {
  p = p || {};
  const needs = guideNeeds(s, hell, run);
  const deck = recommendTeam(s, ownedIds, slots).slice();
  const lead = (curDeck || []).filter(Boolean)[0];
  if (lead && ownedIds.includes(lead) && !deck.includes(lead) && deck.length) deck[deck.length - 1] = lead;
  const covers = (id) => needs.filter((n) => n.counter.includes(id)).length;
  for (const n of needs) {
    if (deck.some((id) => n.counter.includes(id))) continue;
    const cand = n.counter.filter((h) => ownedIds.includes(h) && !deck.includes(h)).sort((a, b) => covers(b) - covers(a) || worth(p, b) - worth(p, a))[0];
    if (!cand) continue;
    // 바꿔 빼는 자리: 대장 아님 · 다른 필요를 혼자 막는 멤버 아님 · 약한 순
    const lone = (id) => needs.some((m) => m !== n && m.counter.includes(id) && deck.filter((d) => m.counter.includes(d)).length === 1);
    const slot = deck.map((id, i) => ({ id, i })).filter((x) => x.id !== lead && !lone(x.id)).sort((a, b) => worth(p, a.id) - worth(p, b.id))[0];
    if (!slot) continue;
    deck[slot.i] = cand;
  }
  return [...new Set(deck)];
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
// 지난 판 요약 한 줄 (결과 화면 · 저장된 기록 공용)
export function causeLine(run, short) {
  if (!run) return '';
  const parts = [];
  const door = Object.entries(run.doorBy || {}).filter(([t]) => ENEMIES[t]).sort((a, b) => b[1] - a[1]);
  const tot = door.reduce((a, [, v]) => a + v, 0);
  if (door.length && tot > 0) parts.push(`입구는 ${door.slice(0, 2).map(([t, v]) => `${foeName(t)} ${Math.round((v / tot) * 100)}%`).join(' · ')} 에게 맞았어요`);
  const hit = Object.entries(run.hitBy || {}).filter(([st, n]) => EST[st] && n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (hit.length && !short) parts.push(`${hit.map(([st, n]) => `${EST[st].name} ${n}번`).join(' · ')} 걸림`);
  if (run.t) parts.push(`${mmss(run.t)} · ${run.wave || 1}/${run.totalWaves || 5} 웨이브에서 무너짐`);
  return parts.join(' · ');
}

// 판에서 센 숫자만 추려 저장용으로 (localStorage — 다음에 준비 화면에서 다시 쓴다)
export function slimRun(g, s) {
  const st = (g && g.stats) || {};
  const top = Object.entries(st.doorBy || {}).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).slice(0, 4), doorBy = {};
  for (const [t, v] of top) doorBy[t] = Math.round(v);
  const hitBy = {}; for (const [k, v] of Object.entries(st.hitBy || {})) if (v > 0) hitBy[k] = v | 0;
  return { stage: s, doorBy, hitBy, t: Math.round((g && g.t) || 0), wave: Math.max(1, (g && g.wave) | 0), totalWaves: (g && g.totalWaves) | 0, ccSec: Math.round(((g && g.cstat && g.cstat.ccSec) || 0) * 10) / 10 };
}

// 전체 공략: 결과 화면 · 준비 화면 공용
//  inp: { stage, hell, run, ownedIds, deckIds, slots, p: { heroes, equip, gear } }
export function buildFailGuide(inp) {
  const s = inp.stage, hell = !!inp.hell, p = inp.p || {}, ownedIds = inp.ownedIds || [], deck = (inp.deckIds || []).filter(Boolean), run = inp.run || null;
  const needs = guideNeeds(s, hell, run).map((n) => Object.assign({}, n, counterChips(n, ownedIds, p, deck)));
  // 덱이 이미 막고 있는 필요는 뒤로 (아직 못 막는 것부터 보여 준다)
  const missing = needs.filter((n) => !deck.some((id) => n.counter.includes(id)));
  const covered = needs.filter((n) => deck.some((id) => n.counter.includes(id)));
  const shown = [...missing, ...covered].slice(0, 2);
  // 강화: 덱 평균 vs 이 장 권장
  const rec = recMeta(s, hell);
  const lv = deck.map((id) => (p.heroes || {})[id] | 0), avg = lv.length ? lv.reduce((a, b) => a + b, 0) / lv.length : 0;
  const up = { rec, avg: Math.round(avg * 10) / 10, low: avg < rec - 1 };
  // 장비: 덱 멤버 무기 · 방어구 빈칸 vs 가방에 안 낀 장비
  const eq = p.equip || {}, bag = p.gear || [];
  const worn = new Set(Object.values(eq).flatMap((sl) => [sl.w, sl.a, sl.m]).filter(Boolean));
  const free = bag.filter((it) => !worn.has(it.id)).length;
  const empty = deck.reduce((a, id) => a + ['w', 'a'].filter((k) => !(eq[id] || {})[k]).length, 0);
  const gear = { empty, free, hint: empty > 0 && free > 0 };
  // 팁 (최대 2)
  const tips = [];
  if (run) {
    const door = Object.entries(run.doorBy || {}).filter(([t]) => ENEMIES[t]).sort((a, b) => b[1] - a[1])[0];
    const dEnemy = door && ENEMIES[door[0]];
    const boss = run.totalWaves && run.wave >= run.totalWaves;
    const ccTot = Object.entries(run.hitBy || {}).filter(([st]) => ['stun', 'charm', 'freeze', 'silence'].includes(st)).reduce((a, [, n]) => a + n, 0);
    if (ccTot >= 4 || (run.ccSec || 0) >= 20) tips.push('상태이상이 잦아요 — 건전녀 간호 · 총력전으로 풀어 주고, 스킬은 걸리기 전에 먼저 써 두세요');
    if (boss || (dEnemy && (dEnemy.boss || dEnemy.mid))) tips.push('보스 웨이브는 스킬 · 총력전을 아껴 뒀다가 보스가 나올 때 한꺼번에 쓰세요');
    else if ((run.wave || 1) <= 2) tips.push('첫 웨이브부터 입구가 뚫렸어요 — 앞에서 막아 주는 탱커를 대장 곁에 두세요');
    else if (dEnemy && dEnemy.hp >= 100) tips.push('단단한 진상이 입구를 쳤어요 — 한 방 센 멤버가 이 진상부터 노리게 하세요');
  }
  if (ccLockStage(s, hell)) tips.push('이 판은 "풀 때까지" 상태이상 — 풀어 주는 멤버가 꼭 필요해요');
  if (!tips.length) tips.push('스킬은 쿨타임이 돌 때마다 바로 쓰세요 — 아껴 두기만 하면 입구가 먼저 무너져요');
  const recDeck = recommendFixDeck(s, hell, ownedIds, inp.slots || 6, deck, p, run);
  const same = recDeck.length === deck.length && recDeck.every((id) => deck.includes(id));
  return { stage: s, hell, cause: causeLine(run), causeShort: causeLine(run, true), needs: shown, up, gear, tips: tips.slice(0, 2), recDeck, recDiffers: !same };
}

// 저장된 실패 기록 (localStorage) — 키: 스테이지(+헬)
export const failKey = (s, hell) => `${s}${hell ? 'h' : ''}`;
export function failStore(store, s, hell, run) {
  const o = Object.assign({}, store || {});
  const k = failKey(s, hell), prev = o[k] || { n: 0 };
  o[k] = { n: (prev.n | 0) + 1, run: run || prev.run || null, at: Date.now() };
  const keys = Object.keys(o);
  if (keys.length > 40) for (const x of keys.sort((a, b) => (o[a].at || 0) - (o[b].at || 0)).slice(0, keys.length - 40)) delete o[x];
  return o;
}
export function failClear(store, s, hell) { const o = Object.assign({}, store || {}); delete o[failKey(s, hell)]; return o; }
