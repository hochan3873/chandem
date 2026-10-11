// 규칙 안내 체계 — 맵 효과 · 스테이지 조건 · 웨이브 · 진상 특성 · 주간 특성을 "처음 만났을 때 한 번" 쉬운 말로 알려 주고,
//  전투 중 칩 · 출전 준비 · 규칙 도감에서 다시 볼 수 있게 한다. 화면 코드(game.js)와 분리한 순수 데이터 + 계산 + HTML 조각.
//  각 규칙: rule(한 줄 규칙) · why(왜 중요해요) · pick(이런 멤버가 좋아요) — 새 맵 효과 · 조건을 만들면 여기도 한 줄 추가 (테스트가 빠진 것을 잡는다)
import {
  HEROES, ENEMIES, MAP_FX, COND, WAVE_KINDS, WEEK_TRAITS, TRAITS, HERO_ROLE, HERO_TAGS, NEAR_HEROES, ARMOR_BREAKERS, REVEAL_HEROES,
  ATTRS, stageFx, stageConds, stageWaveKinds, stageEnemies, stageLabel, armorPctStage, ccLockStage, WEEK_TRAIT_FROM,
} from './data.js';

const ROSTER = Object.keys(HERO_ROLE).filter((id) => HEROES[id]);
const rangeOf = (id) => { const r = HEROES[id].range; return Array.isArray(r) ? r[r.length - 1] : r; };
const byAttr = (a) => ROSTER.filter((id) => HEROES[id].attr === a);
const byTag = (t) => ROSTER.filter((id) => (HERO_TAGS[id] || []).includes(t));
const byRole = (...rs) => ROSTER.filter((id) => rs.includes(HERO_ROLE[id]));
const SPLASH = ROSTER.filter((id) => HERO_ROLE[id] === 'aoe' || (HERO_TAGS[id] || []).includes('splash'));
const SHORT_RANGE = ROSTER.filter((id) => rangeOf(id) < 400);
const NEAR = NEAR_HEROES.filter((id) => HEROES[id]);
const DETECT = [...new Set([...REVEAL_HEROES, 'hyungyeong'])].filter((id) => HEROES[id]);
const SLOWERS = ['jieun', 'dohoon', 'soyoung', 'staff', 'byunghwa', 'wonsik'].filter((id) => HEROES[id]);
const ONE_SHOT = byRole('single', 'tank');
const LOCK_CNT = ['gunnyeo', 'dohoon', 'soyoung', 'jungmin', 'dragon', 'bangjang'].filter((id) => HEROES[id]);

// 맵 효과 아이콘 (데이터에 아이콘이 비어 있는 것은 여기서 채움)
// (게임 화면은 이모지를 그림으로 바꿔 쓰니 규칙 아이콘은 전부 그림 파일: fx_* 는 규칙 안내용으로 새로 만든 그림 · 나머지는 기존 그림)
const FX_IMG = { rain: 'fx_rain', fog: 'fx_fog', blackout: 'fx_blackout', happy: 'party', karaoke: 'fx_karaoke', icy: 'fx_icy', feast: 'fire', construction: 'fx_construction', megaphone: 'megaphone', conveyor: 'fx_conveyor', wind: 'fx_wind', campfire: 'fx_campfire', snow: 'fx_snow', lightshow: 'fx_lightshow', blizzard: 'fx_blizzard', champagne: 'fx_champagne', songnoise: 'fx_songnoise', dimlight: 'fx_dimlight', petals: 'fx_petals' };
const WAVE_IMG = { S: 'tw_swarm', E: 'tw_titan', M: 'swords', B: 'tw_boss' };
const MECH_IMG = { aoeImmune: 'role_aoe', singleResist: 'shield', projShield: 'ic_shield', kbImmune: 'stone', ccImmune: 'cc_stun', split: 'duo', regen: 'heal', stealth: 'tw_dark', haste: 'speed', heal: 'heal' };

// [id, 종류, 아이콘, 이름, 한 줄 규칙, 왜 중요해요, 추천 이름, 추천 멤버, 몇 명이면 충분]
const R = [];
const add = (id, kind, icon, name, rule, why, pickLabel, pick, need = 1) => R.push({ id, kind, icon, name, rule, why, pickLabel, pick, need });

// ── 맵 효과 ──
const FXW = {
  rain: ['멀리 닿던 공격이 모자랄 수 있어요. 대신 진상이 느려서 여유는 있어요. 가까이서 싸우는 멤버가 안정적이에요.', '가까이서 싸우는 멤버', NEAR],
  fog: ['평소 닿던 자리에서 공격이 안 닿을 수 있어요. 사거리가 400보다 짧은 멤버는 영향이 없어요.', '사거리 짧은 멤버', SHORT_RANGE, 3],
  blackout: ['불이 꺼진 동안은 멀리서 오는 진상이 안 보여요. 진상을 먼저 찾아내는 멤버가 있으면 덜 당황해요.', '진상을 찾아내는 멤버', DETECT],
  happy: ['진상이 많아지니까 한꺼번에 쓸어 담는 범위 공격이 편해요. 경험치를 많이 주니 레벨업은 빨라져요.', '범위 공격 멤버', SPLASH],
  karaoke: ['말빨 멤버는 신나게 세지고 매력 멤버는 약해져요. 이 스테이지는 말빨 멤버를 앞세우세요.', '말빨 멤버', byAttr('talk')],
  icy: ['맞은 진상이 멀리 밀려나서 입구에서 멀어져요. 넉백이 있는 멤버가 입구를 든든하게 지켜요.', '넉백 있는 멤버', byTag('kb')],
  feast: ['술 멤버가 주인공이에요. 분노도 오래가서 연속으로 세게 칠 수 있어요.', '술 멤버', byAttr('booze')],
  construction: ['진상이 한 줄로 뭉쳐서 범위 공격 한 방에 여러 명이 맞아요. 범위 공격 멤버가 많을수록 훨씬 쉬워요.', '범위 공격 멤버', SPLASH, 2],
  megaphone: ['3초 동안 진상이 확 달려와요. 입구에 닿기 전에 느리게 하거나 막아 줄 멤버가 필요해요.', '느리게 하거나 막는 멤버', SLOWERS],
  conveyor: ['가운데 줄로 오면 훨씬 빨리 도착해요. 가운데에서 막아 주거나 느리게 하는 멤버가 좋아요.', '막거나 느리게 하는 멤버', SLOWERS],
  wind: ['바람에 날아가는 공격이 빗나갈 수 있어요. 터져서 퍼지는 범위 공격은 덜 흔들려요.', '범위 공격 멤버', SPLASH],
  campfire: ['진상을 가운데 모닥불 쪽으로 모으면 공짜로 피해를 줘요. 술 멤버도 더 세져요.', '술 멤버', byAttr('booze')],
  snow: ['진상은 느려지지만 내 공격도 느려져요. 한 방이 큰 멤버가 손해를 덜 봐요.', '한 방이 큰 멤버', ONE_SHOT],
  lightshow: ['번쩍이는 2초 동안은 한 명을 노리는 공격이 자주 빗나가요. 범위 공격은 덜 아쉬워요.', '범위 공격 멤버', SPLASH],
  blizzard: ['사거리와 공격 속도가 같이 줄어요. 가까이서 싸우는 멤버가 덜 흔들려요.', '가까이서 싸우는 멤버', NEAR],
  champagne: ['진상이 멀리 밀려나서 입구에서 멀어지지만, 조금 더 빨리 와요. 넉백 있는 멤버가 좋아요.', '넉백 있는 멤버', byTag('kb')],
  songnoise: ['말빨 멤버가 약해져요. 다른 속성 멤버를 데려가면 손해가 없어요.', '말빨이 아닌 멤버', ROSTER.filter((id) => HEROES[id].attr !== 'talk'), 3],
  dimlight: ['조명이 꺼진 동안은 멀리서 오는 진상이 안 보여요. 진상을 먼저 찾아내는 멤버가 있으면 덜 당황해요.', '진상을 찾아내는 멤버', DETECT],
  petals: ['평소 닿던 자리에서 공격이 안 닿을 수 있어요. 사거리가 400보다 짧은 멤버는 영향이 없어요.', '사거리 짧은 멤버', SHORT_RANGE, 3],
};
for (const id of Object.keys(MAP_FX)) {
  if (id === 'none') continue;
  const f = MAP_FX[id], w = FXW[id] || ['', '', [], 1];
  add('fx:' + id, 'fx', { img: FX_IMG[id] || 'sparkle' }, f.name, f.desc, w[0], w[1], w[2], w[3] || 1);
}

// ── 스테이지 조건 (진상 기믹) ──
const CW = {
  shield: ['보호막이 있는 진상은 겹이 남아 있으면 피해를 90% 덜 받아요. 한 번 맞을 때마다 겹이 한 장씩 벗겨져요.', '한 방이 아무리 세도 한 겹만 벗겨져요. 자주 때리는 멤버와 보호막을 벗기는 멤버(운영진 · 여지원)가 필요해요.', '보호막을 잘 깨는 멤버'],
  stealth: ['숨은 진상은 길의 끝 가까이까지 안 보이다가 입구 앞에서 나타나요. 그때는 입구를 두 배로 세게 쳐요.', '안 보이면 공격이 안 나가요. 운영진 · 건전남 · 배현경이 먼저 찾아내 줘요.', '진상을 찾아내는 멤버'],
  cc: ['진상이 1초 동안 기를 모았다가 가장 센 멤버를 기절 · 침묵 · 홀림에 빠뜨려요.', '핵심 멤버가 묶이면 공격이 멈춰요. 풀어 주는 멤버(건전녀 · 김도훈)나 대신 맞아 주는 탱커가 필요해요. 기 모을 때 기절시키면 끊을 수 있어요.', '풀어 주거나 막아 주는 멤버'],
  armor: ['철갑 진상은 한 방마다 피해가 일정량 깎여요. 약한 공격은 거의 안 들어가요.', '여러 번 약하게 때리는 멤버는 불리해요. 한 방이 큰 멤버나 방어를 무시하는 멤버(건전남)가 필요해요.', '한 방이 크거나 방어를 무시하는 멤버'],
  swarm: ['약한 진상이 평소보다 1.5배 많이 몰려와요 (한 명 체력은 60%).', '한 명씩 때리면 입구가 뚫려요. 여러 명을 한꺼번에 맞히는 범위 공격이 필요해요.', '범위 공격 멤버'],
  rush: ['빠른 진상이 입구에 쾅 부딪혀요. 느리게 하거나 기절시키면 넘어져서 덜 아파요.', '입구가 부서지면 져요. 입구를 고치는 멤버 · 몸으로 막는 탱커 · 느리게 하는 멤버가 필요해요.', '입구를 지키는 멤버'],
};
for (const id of Object.keys(COND)) {
  const w = CW[id] || ['', '', ''];
  add('cond:' + id, 'cond', { img: COND[id].icon }, COND[id].name, w[0], w[1], w[2], COND[id].counter.filter((h) => HEROES[h]), 1);
}

// ── 웨이브 성격 ──
const WW = {
  S: ['약한 진상이 떼로 몰려오는 웨이브예요. 수는 많고 한 명은 약해요.', '한 명씩 때리면 느려서 입구가 뚫려요. 범위 공격으로 쓸어 담으세요.', '범위 공격 멤버', SPLASH],
  E: ['수는 적지만 아주 단단한 정예가 나와요. 범위 피해는 35% 덜 들어가요.', '범위 공격은 효과가 약해요. 한 방이 큰 멤버로 한 명씩 확실하게 잡으세요.', '한 방이 큰 멤버', ONE_SHOT],
  M: ['떼거리 졸개들이 단단한 정예 2~4명을 호위해요.', '졸개는 범위로 쓸고 정예는 한 방으로 잡아야 해요. 둘 다 있으면 편해요.', '범위 + 한 방 멤버', [...new Set([...SPLASH, ...ONE_SHOT])]],
  B: ['마지막 웨이브에 보스가 호위 떼와 함께 나와요.', '보스는 체력이 커서 오래 싸워요. 기술을 쓰고 난 뒤의 틈(약점)에 한 방이 센 멤버로 몰아치세요.', '보스에 강한 멤버', byTag('boss')],
};
for (const k of ['S', 'E', 'M', 'B']) {
  const w = WW[k];
  add('wave:' + k, 'wave', { img: WAVE_IMG[k] }, WAVE_KINDS[k].name + ' 웨이브', w[0], w[1], w[2], w[3], 1);
}

// ── 진상 특성 (진상 자신의 능력) ──
const MW = {
  aoeImmune: ['이 진상은 범위 공격이 안 들려요.', '범위 공격만 쓰면 하나도 못 잡아요. 한 명씩 때리는 공격이 필요해요.'],
  singleResist: ['한 명씩 치는 공격은 절반만 들어가요.', '한 방 공격으로는 오래 걸려요. 범위 공격으로 쓸어야 해요.'],
  projShield: ['처음 몇 발은 방패가 막아 줘요.', '느린 공격은 방패에 다 막혀요. 빠르게 여러 번 쏘는 멤버로 방패부터 벗기세요.'],
  kbImmune: ['맞아도 뒤로 밀려나지 않아요.', '넉백으로 버티는 작전이 안 통해요. 공격력으로 잡아야 해요.'],
  ccImmune: ['기절이 안 걸려요.', '기절시켜 시간을 벌 수 없어요. 공격력으로 밀어붙이세요.'],
  split: ['쓰러지면 하나 더 나와요.', '한 명씩 잡으면 끝이 없어요. 범위 공격으로 한꺼번에 처리하세요.'],
  regen: ['가만두면 체력이 차올라요.', '약하게 찔끔찔끔 때리면 다시 차요. 방어를 깎거나 불로 회복을 막으세요.'],
  stealth: ['입구 앞까지 거의 안 보여요.', '안 보이면 공격이 안 나가요. 운영진 · 건전남이 먼저 찾아내 줘요.'],
  haste: ['체력이 줄면 갑자기 빨라져요.', '마무리에 허둥대면 입구에 닿아요. 느리게 하거나 묶어서 붙잡으세요.'],
  heal: ['곁에 있는 진상을 회복시키고 빠르게 해요.', '이 진상을 놔두면 다른 진상이 안 죽어요. 먼저 한 방에 잡으세요.'],
};
for (const k of Object.keys(TRAITS)) {
  const w = MW[k] || ['', ''];
  add('mech:' + k, 'mech', { img: MECH_IMG[k] || 'bolt' }, TRAITS[k].name + ' 진상', w[0], w[1], '이 진상에 강한 멤버', TRAITS[k].counter.filter((h) => HEROES[h]), 1);
}
add('mech:armorpct', 'mech', { img: 'shield' }, '방어율', '뒤로 갈수록 정예와 보스는 방어율이 생겨요. 방어율만큼 내 공격 피해가 깎여요.', '방어율이 높으면 약한 공격은 거의 안 들어가요. 방어를 깎거나 무시하는 멤버(여지원 · 건전남 · 고아라 · 강성구)가 필요해요.', '방어를 깎거나 무시하는 멤버', ARMOR_BREAKERS.filter((h) => HEROES[h]), 1);
add('mech:lock', 'mech', { img: 'lock' }, '풀 때까지 상태이상', '기절 · 홀림 · 침묵 · 빙결 · 독이 저절로 안 풀려요. 자물쇠 표시가 있으면 풀어 줘야 해요.', '묶인 멤버는 풀릴 때까지 아무것도 못 해요. 풀어 주는 멤버(건전녀 · 방장 등)가 덱에 꼭 필요해요.', '풀어 주는 멤버', LOCK_CNT, 1);

// ── 주간 진상 특성 (매주 바뀜) ──
for (const t of WEEK_TRAITS) {
  add('week:' + t.id, 'week', { img: t.icon }, t.name, t.desc.replace(/ — /g, ' · '), '이번 주에만 일반 스테이지와 헬에 붙는 규칙이에요. 아래 추천 멤버가 이번 주에 특히 빛나요.', '이번 주 추천 멤버', t.rec.filter((h) => HEROES[h]), 1);
}

export const RULES = R;
export const RULE = Object.fromEntries(R.map((r) => [r.id, r]));
export const KIND_NAME = { fx: '맵 효과', cond: '진상 기믹', wave: '웨이브', mech: '진상 능력', week: '주간 특성' };
export const KIND_ORDER = ['fx', 'cond', 'mech', 'wave', 'week'];

// 이 규칙이 나오는 스테이지 (1~80) — 주간 특성은 매주 달라서 빈 목록
const MAX_STAGE = 80;
const cache = {};
export function stagesOf(id) {
  if (cache[id]) return cache[id];
  const [kind, key] = id.split(':');
  const out = [];
  for (let s = 1; s <= MAX_STAGE; s++) {
    let on = false;
    if (kind === 'fx') on = stageFx(s).id === key;
    else if (kind === 'cond') on = stageConds(s, false).includes(key);
    else if (kind === 'wave') on = stageWaveKinds(s).includes(key);
    else if (kind === 'mech') {
      if (key === 'armorpct') on = armorPctStage(s, { hp: 999 }, true) >= 0.15;
      else if (key === 'lock') on = false;
      else on = stageEnemies(s).some((t) => ENEMIES[t] && ENEMIES[t].traits && ENEMIES[t].traits[key]);
    }
    if (on) out.push(s);
  }
  return (cache[id] = out);
}
// "3-3 · 3-6 · 4-2 외 5곳"
export function stagesText(id, max = 6) {
  const [kind, key] = id.split(':');
  if (kind === 'week') return `이번 주 ${stageLabel(WEEK_TRAIT_FROM)} 부터 모든 스테이지 · 헬 (월요일마다 바뀜)`;
  if (id === 'mech:lock') return '헬 7 · 8장 · 무한 도전 4단계부터';
  const l = stagesOf(id);
  if (!l.length) return key === 'none' ? '' : '탑 · 레이드 · 이벤트 등 특별 모드';
  return l.slice(0, max).map(stageLabel).join(' · ') + (l.length > max ? ` 외 ${l.length - max}곳` : '');
}

// 이 판(스테이지)에서 마주칠 규칙들 — 먼저 알려 줄 순서대로 (맵 효과 > 진상 기믹 > 진상 능력 > 웨이브 > 방어율 · 풀 때까지)
export function ruleIdsForStage(s, hell) {
  const ids = [];
  const fx = stageFx(s);
  if (fx && fx.id !== 'none') ids.push('fx:' + fx.id);
  for (const c of stageConds(s, hell)) ids.push('cond:' + c);
  const traits = new Set();
  for (const t of stageEnemies(s)) { const tr = (ENEMIES[t] && ENEMIES[t].traits) || {}; for (const k of Object.keys(tr)) if (TRAITS[k]) traits.add(k); }
  for (const k of traits) ids.push('mech:' + k);
  for (const k of new Set(stageWaveKinds(s))) if (k !== 'N' && WAVE_KINDS[k]) ids.push('wave:' + k);
  if (armorPctStage(s, { hp: 999 }, true) >= 0.15) ids.push('mech:armorpct');
  if (hell && ccLockStage(s, true)) ids.push('mech:lock');
  return ids.filter((id) => RULE[id]);
}
export const ruleIdForFx = (fxId) => (fxId && fxId !== 'none' && RULE['fx:' + fxId] ? 'fx:' + fxId : null);

// ── 내 덱에 맞나요? ──
//  반환: { have: 덱에 있는 맞는 멤버, ok, need, chips: [{id, st: 'deck'|'own'|'no'}] }
export function fitOf(rule, ownedIds, deckIds, cap = 7) {
  const pick = rule.pick || [];
  const deck = new Set(deckIds || []), own = new Set(ownedIds || []);
  const have = pick.filter((h) => deck.has(h));
  const order = [...pick.filter((h) => deck.has(h)), ...pick.filter((h) => !deck.has(h) && own.has(h)), ...pick.filter((h) => !own.has(h))];
  const chips = order.slice(0, cap).map((id) => ({ id, st: deck.has(id) ? 'deck' : own.has(id) ? 'own' : 'no' }));
  return { have, ok: have.length >= rule.need, need: rule.need, chips };
}

// ── 한 번만 보여 주기 (계정별 localStorage: langbang:ruleSeen = { 계정: { 규칙id: 1 } }) ──
const KEY = 'langbang:ruleSeen';
const readAll = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } };
export function seenSet(acct) { return readAll()[acct || 'g'] || {}; }
export function markSeen(acct, ids) {
  try { const all = readAll(), m = all[acct || 'g'] || {}; for (const id of [].concat(ids)) m[id] = 1; all[acct || 'g'] = m; localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* 저장 못 해도 괜찮음 */ }
}
export const unseenIds = (acct, ids) => { const m = seenSet(acct); return ids.filter((id) => !m[id]); };

// ── HTML 조각 ──
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export function iconHtml(rule, size = '') {
  const i = rule.icon || {};
  if (i.img) return `<img class="ic ru-img${size ? ' ' + size : ''}" src="/img/lb/ui2/${esc(i.img)}.webp" alt="" draggable="false" onerror="this.remove()">`;
  return `<span class="ru-emo ${size}">${esc(i.emoji || '📌')}</span>`;
}
export function fitHtml(rule, fit, nameOf) {
  const chips = fit.chips.map((c) => `<span class="ru-who ${c.st}">${c.st === 'deck' ? '✓ ' : ''}${esc(nameOf(c.id))}</span>`).join('') || '<span class="ru-who no">해당 멤버 없음</span>';
  return `<div class="ru-pick"><b>${esc(rule.pickLabel)}</b><div class="ru-whos">${chips}</div></div>`;
}
// 한 줄 요약 (출전 준비 칩 옆): "추천: 범위 공격 멤버 · 내 덱 ✓ 2명"
export function fitLine(rule, fit) {
  return `<span class="ru-rec">추천: ${esc(rule.pickLabel)}</span><span class="ru-fit ${fit.ok ? 'ok' : 'no'}">${fit.ok ? `✓ 내 덱 ${fit.have.length}명` : `✗ 내 덱에 ${fit.have.length ? `${fit.have.length}명뿐` : '없어요'}`}</span>`;
}
// 설명 카드 본문 (첫 만남 카드 · 전투 중 시트 · 도감 상세가 같이 씀)
export function cardHtml(rule, ctx) {
  const fit = fitOf(rule, ctx.owned, ctx.deck);
  const mark = ctx.noDeck ? '' : `<p class="ru-state ${fit.ok ? 'ok' : 'no'}">${fit.ok ? `✓ 내 덱에 맞는 멤버가 ${fit.have.length}명 있어요` : '✗ 내 덱에는 아직 맞는 멤버가 부족해요'}</p>`;
  return `<div class="ru-card k-${rule.kind}">
    <div class="ru-top">${iconHtml(rule, 'big')}<div><small>${esc(KIND_NAME[rule.kind])}</small><b>${esc(rule.name)}</b></div></div>
    <p class="ru-rule">${esc(rule.rule)}</p>
    <div class="ru-sec"><small>왜 중요해요?</small><p>${esc(rule.why)}</p></div>
    ${fitHtml(rule, fit, ctx.nameOf)}${mark}
    ${ctx.stages === false ? '' : `<p class="ru-stg"><small>나오는 곳</small> ${esc(stagesText(rule.id))}</p>`}
  </div>`;
}
