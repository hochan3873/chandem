// 랑방 대전 — 건물주 레이드 (주간 서버 레이드) 규칙: 화면 · 서버가 같은 파일을 쓴다 (DOM 없음)
//  「건물주 대마왕」: 랑방 옥상에 나타난 거대 악당 혼자. 진상은 안 나오고, 대마왕이 직접 모임 입구와 멤버들을 때린다
//  - 한 판 = 입구가 부서질 때까지 (시간이 갈수록 대마왕이 점점 화가 나서 결국 입구는 부서진다) → 그동안 준 피해가 기록
//  - 월요일 00:00 (KST) 등장 → 일요일 23:59 까지. 서버 전체가 체력 하나를 같이 깎는다
//  - 서버 체력에 따라 1페이즈(여유) → 2페이즈(짜증 · 66%) → 3페이즈(분노 · 33%) — 페이즈마다 패턴이 늘고 빨라진다
//  - 이번 주에 잡으면 → 참가자 모두 토벌 보상 · 다음 주에 한 단계 더 세져서 돌아온다
//  - 못 잡으면 → 다음 주에 남은 체력 그대로 이어서 (같은 단계)
//  - 한 사람이 한 판에 깎을 수 있는 양은 최대 체력의 1% (혼자서는 절대 못 잡는다)
//  - 난이도 (보통 · 어려움 · 지옥): 판마다 고른다 · 서버가 열렸는지 확인하고 판 기록에 적는다 (화면이 보낸 값은 안 믿음)
//    어려운 난이도일수록 입구가 빨리 부서져 판이 짧다 → 준 피해에 난이도 배율(×1 · ×1.4 · ×2.4)을 곱해 서버 체력 · 기여 순위에 넣는다
//    (한 판 상한 1% 에도 같은 배율 · 순위는 하나 — 입장 수는 같으니 잘하는 사람이 어려운 걸 골라 더 크게 기여)
import { HEROES, hashSeed } from './data.js';
import { weekIndex, weekStartMs, dayIndex, mailAdd, isFriend, KST, DAY } from './live.js';

const int = (v, lo = 0, hi = 1e9) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; };

// ─── 숫자 (scripts/lb-raid2-sim.js 로 잰 값에 맞춤 · 보고서 참고) ───
export const R2 = {
  sec: 180, // 한 판 최대 시간 — 이때까지 버티면 대마왕이 "철거"로 입구를 무너뜨린다 (보통은 그 전에 부서진다)
  entries: 3, // 주마다 기본 입장
  bonusMax: 2, // 친구 "같이 때려줘" 응답으로 받는 추가 입장 (주마다 최대)
  unlock: 5, // 1-5 를 깨면 참가
  phaseAt: [2 / 3, 1 / 3], // 남은 체력이 이 비율 아래로 → 2페이즈 · 3페이즈
  runCapPct: 0.01, // 한 판에 깎을 수 있는 최대 (최대 체력의 1%)
  perPlayer: 3.5e6, // 활동 인원 한 명당 체력 (1단계) — 한 판 보통 0.3~1백만 · 센 계정 2~4백만 (scripts/lb-raid2-sim.js)
  floor: 20, // 활동 인원이 적어도 이만큼은 있다고 본다 (1단계 최소 7천만 → 한 판 최대 70만)
  tierMul: 1.5, // 단계마다 체력 ×1.5
  tierMax: 30,
  activeDays: 14, // 최근 14일 안에 판을 한 사람 = 활동 인원
  rallyPerDay: 5, rallyDays: 3, rallyBuff: 0.15, coopPct: 0.1, // 부르기: 하루 5번 · 3일 보관 · 응답한 사람 피해 +15% · 둘 다 협동 기여 +10%
  liveSec: 220, // "지금 때리는 중" (시작한 지 220초 안에 안 끝난 판)
  feedMax: 30, histMax: 6,
  hellSec: 90, // 어려움에서 이만큼 버티면 지옥이 열린다 (또는 4장 클리어)
};
// ─── 난이도 (판마다 고름) ───
//  mul: 서버 체력 · 기여에 들어가는 배율 (한 판 상한도 같이) · rw: 판마다 받는 보상 · open: 열리는 조건 (화면 글)
export const DIFF_IDS = ['normal', 'hard', 'hell'];
export const DIFF = {
  normal: { id: 'normal', name: '보통', mul: 1, color: '#5fd17a', rw: { coins: 100, stones: 2 }, text: '패턴을 익히기 좋아요 · 스킬 2번이면 예고를 끊어요', open: '' },
  hard: { id: 'hard', name: '어려움', mul: 1.4, color: '#ff9a3a', rw: { coins: 200, stones: 4 }, text: '예고가 빨라요 · 처음부터 붙잡기 · 돈다발 · 퇴거 명령 · 끊으려면 스킬 3번', open: '1장을 깨면 열려요', stage: 10 },
  hell: { id: 'hell', name: '지옥', mul: 2.4, color: '#ff2d45', rw: { coins: 350, stones: 7 }, text: '모든 패턴이 처음부터 · 연계 공격 · 기절이 아주 길어요 · 끊으려면 스킬 4번', open: `어려움에서 ${R2.hellSec}초 버티면 열려요 (4장을 깨도)`, stage: 40 },
};
export const diffOf = (id) => (typeof id === 'string' && DIFF[id] ? id : 'normal');
export const diffMul = (id) => DIFF[diffOf(id)].mul;
// 열렸나: { ok, why } — master 는 다 열림 · lb.raid2.hardSec: 어려움에서 가장 오래 버틴 초
export function diffOpen(lb, id, master = false) {
  if (!DIFF[id]) return { ok: false, why: '없는 난이도예요' };
  if (id === 'normal' || master || (lb && lb.master)) return { ok: true };
  const ms = (lb && lb.maxStage) | 0, hs = (lb && lb.raid2 && lb.raid2.hardSec) | 0;
  if (id === 'hard') return ms >= DIFF.hard.stage ? { ok: true } : { ok: false, why: `어려움은 ${DIFF.hard.open}` };
  return ms >= DIFF.hell.stage || hs >= R2.hellSec ? { ok: true } : { ok: false, why: `지옥은 ${DIFF.hell.open}` };
}
// 체력은 하나 (body). 페이즈 경계를 넘긴 판 = 그 페이즈 "막타" (p2 · p3) · 마지막 일격 = body
export const PARTS = ['body'];
export const BODY = { id: 'body', name: '건물주 대마왕', color: '#ff2d45' };
export const PHASES = [
  { n: 1, name: '여유만만', color: '#ffcf3f', text: '느긋하게 내려찍고 고지서를 뿌려요' },
  { n: 2, name: '짜증', color: '#ff8a3a', text: '돈다발 폭탄 · 입구 붙잡기가 늘어요' },
  { n: 3, name: '분노', color: '#ff2d45', text: '분노 연타! 모든 패턴이 빨라져요' },
];
// 패턴 (화면 안내 · 전투 이벤트 이름) — from: 이 페이즈부터 · 버티는 법
export const PATTERNS = [
  { id: 'slam', name: '내려찍기', from: 1, img: '/img/lb/ui2/hammer.webp', text: '빨간 줄에 주먹을 내려찍어 입구에 큰 피해 · 그 줄 멤버 오래 기절', tip: '예고 중에 스킬을 여러 번 맞히거나 기절 · 총공지로 끊으면 빈틈!' },
  { id: 'bills', name: '고지서 뿌리기', from: 1, img: '/img/lb/raid2/pi_bills.webp', text: '고지서 여러 장이 입구로 날아와요', tip: '탱커 · 건전녀 방패가 막아 줘요' },
  { id: 'seal', name: '도장 쾅', from: 1, img: '/img/lb/gear/stamp.webp', text: '멤버 둘(어려움부터 셋)의 스킬을 한참 봉인', tip: '건전녀 응급 방패 · 강성구 곁은 안 먹혀요' },
  { id: 'sweep', name: '휩쓸기', from: 1, img: '/img/lb/ui2/cc_push.webp', text: '한쪽 절반을 팔로 쓸어 멤버 기절', tip: '예고 중에 스킬을 여러 번 맞히면 끊겨요' },
  { id: 'cash', name: '돈다발 폭탄', from: 2, img: '/img/lb/raid2/pi_cash.webp', text: '멤버 발밑에 돈다발이 떨어져 터져요', tip: '홍정민 붕대로 입구를 메워요' },
  { id: 'grab', name: '입구 붙잡기', from: 2, img: '/img/lb/ui2/door.webp', text: '입구를 붙잡고 흔들어 계속 피해 · 대신 맞기 쉬워요 (피해 ×1.5)', tip: '스킬 여러 번 · 기절 · 총공지면 손을 놓아요' },
  { id: 'combo', name: '분노 연타', from: 3, img: '/img/lb/raid2/pi_rage.webp', text: '내려찍기를 여러 번 연달아 (지옥은 4번)', tip: '예고 하나를 끊으면 연타가 멈춰요' },
  { id: 'evict', name: '퇴거 명령', from: 0, img: '/img/lb/ui2/lock.webp', text: '퇴거 명령서를 들이밀어 멤버 모두 스킬 봉인 · 입구 피해', tip: '예고 중에 꼭 끊어요! 못 끊으면 다 같이 봉인' },
];
export const patternOf = (id) => PATTERNS.find((p) => p.id === id) || null;
export const partName = (id) => (id === 'body' ? BODY.name : id === 'p2' ? '2페이즈 돌입' : id === 'p3' ? '3페이즈 (분노)' : '큰 한 방');
export const BOSS = { name: '건물주 대마왕', sub: '"이 건물 이번 달부터 월세 두 배야!"' };
// 그림: 서 있는 몸 하나를 자세별로 바꿔 끼운다 (팔을 따로 붙이지 않음) · 로비는 의자에 앉은 그림
export const R2_ART = {
  throne: '/img/lb/raid2/boss_throne.webp', idle: '/img/lb/raid2/boss_idle.webp', wind: '/img/lb/raid2/boss_wind.webp', slam: '/img/lb/raid2/boss_slam.webp', throw: '/img/lb/raid2/boss_throw.webp', rage: '/img/lb/raid2/boss_rage.webp',
  map: '/img/lb/raid2/map_raid2.webp', lobby: '/img/lb/raid2/lobby.webp',
  bodyFb: '/img/lb/raid2/boss_body.webp', rageFb: '/img/lb/raid2/boss_body_rage.webp', mapFb: '/img/lb/map_raid.webp', lobbyFb: '/img/lb/map_raid.webp',
};

// ─── 예전 기록 (팔 8개 + 본체로 저장된 서버 상태) → 체력 하나로 ───
export const OLD_PARTS = ['mega', 'bill', 'bottle', 'golf', 'contract', 'keys', 'bag', 'phone'];
// { 부위: 피해 } — 옛 팔 이름이 섞여 와도 (배포 도중 끝난 판) 전부 몸통 피해로 합친다
export function normParts(parts) {
  let v = 0;
  for (const [k, x] of Object.entries(parts && typeof parts === 'object' ? parts : {})) if (k === 'body' || OLD_PARTS.includes(k)) v += int(x, 0, 1e12);
  return v > 0 ? { body: Math.min(v, 1e13) } : {};
}
// 서버 보스 상태: 남은 체력 = 팔 + 본체 남은 합 · 최대 = hpMax · 막타 기록은 본체만 · 옛 "팔 부숨" 소식은 그대로 둔다 (글로만 보임)
export function migrateState(s) {
  if (!s || typeof s !== 'object' || !s.hp || s.v >= 2) return s;
  const hpMax = int(s.hpMax, 0, 1e15);
  let left = 0;
  for (const [k, v] of Object.entries(s.hp)) if (k === 'body' || OLD_PARTS.includes(k)) left += Math.max(0, Number(v) || 0);
  const by = s.by && s.by.body ? { body: s.by.body } : {};
  const n = { ...s, v: 2, hpMax, hp: { body: Math.min(hpMax, Math.round(left)) }, max: { body: hpMax }, by };
  return n;
}

// ─── 주 · 단계 · 체력 ───
export const tierHpMul = (tier) => Math.pow(R2.tierMul, Math.max(1, Math.min(R2.tierMax, tier | 0 || 1)) - 1);
// 최대 체력 = 한 명당 체력 × 활동 인원(최소 floor) × 단계 배율
export function hpMaxFor(tier, active) {
  return Math.round(R2.perPlayer * Math.max(R2.floor, active | 0) * tierHpMul(tier) / 1000) * 1000;
}
export const partMax = (hpMax) => Math.round(hpMax);
export function newBoss(wi, tier, active, now = Date.now()) {
  const hpMax = hpMaxFor(tier, active);
  return { v: 2, wi, tier: Math.max(1, tier | 0), active: active | 0, hpMax, hp: { body: hpMax }, max: { body: hpMax }, by: {}, killedAt: 0, killer: null, startedAt: now, board: {}, feed: [], live: {}, hist: [] };
}
export const weekEndMs = (wi) => weekStartMs(wi + 1);
export const hpLeft = (s) => Math.max(0, s.hp.body | 0);
export const isDead = (s, p = 'body') => (s.hp[p] | 0) <= 0;
export const killed = (s) => isDead(s, 'body');
// 지금 페이즈 (1 · 2 · 3 · 쓰러짐 4) — 남은 체력 비율로
export const phaseAt = (left, max) => (left <= 0 ? 4 : left > max * R2.phaseAt[0] ? 1 : left > max * R2.phaseAt[1] ? 2 : 3);
export function phaseOf(s) { return phaseAt(hpLeft(s), s.max.body || s.hpMax || 1); }
// 예전 화면 · 서버와 맞추려고 남겨 둔 것: 때릴 수 있는 부위 (몸통 하나)
export function exposed(s) { return killed(s) ? [] : ['body']; }
// 주가 바뀌었으면: 지난 주 기록을 보관(순위 · 막타) → 잡았으면 다음 단계 새 보스 · 못 잡았으면 남은 체력 그대로 (같은 단계)
export function rollWeek(s0, now, active) {
  const wi = weekIndex(now);
  const s = migrateState(s0);
  if (!s || !Number.isInteger(s.wi)) return { s: newBoss(wi, 1, active, now), rolled: true };
  if (s.wi >= wi) return { s, rolled: s !== s0 };
  const arc = archiveOf(s);
  const hist = [arc, ...(s.hist || [])].slice(0, R2.histMax);
  let n;
  if (killed(s)) n = newBoss(wi, Math.min(R2.tierMax, s.tier + 1), active, now);
  else { n = { ...s, wi, board: {}, feed: [], live: {}, by: { ...s.by } }; } // 이어서 (깎인 체력 · 페이즈 그대로)
  n.hist = hist;
  return { s: n, rolled: true, arc };
}
export function archiveOf(s) {
  const rank = Object.entries(s.board || {}).map(([uid, b]) => [uid, scoreOf(b), b.d | 0, b.n || '']).filter((x) => x[2] > 0).sort((a, b) => b[1] - a[1] || b[2] - a[2]);
  return { wi: s.wi, tier: s.tier, killed: killed(s), killedAt: s.killedAt || 0, killer: s.killer || null, hpMax: s.hpMax, left: hpLeft(s), rank, by: { ...(s.by || {}) } };
}
export const scoreOf = (b) => (b ? (b.d | 0) + (b.c | 0) : 0);
export function rankOf(s, uid) {
  const me = (s.board || {})[uid];
  if (!me || !(me.d > 0)) return null;
  const sc = scoreOf(me);
  return Object.values(s.board).filter((b) => b.d > 0 && scoreOf(b) > sc).length + 1;
}
export function topList(s, n = 20) {
  return Object.entries(s.board || {}).filter(([, b]) => b.d > 0).sort((a, b) => scoreOf(b[1]) - scoreOf(a[1])).slice(0, n).map(([uid, b], i) => ({ rank: i + 1, uid, nickname: b.n || '', dmg: b.d | 0, coop: b.c | 0, runs: b.r | 0, score: scoreOf(b), df: DIFF_IDS[b.x | 0] || 'normal' }));
}
export const participants = (s) => Object.values(s.board || {}).filter((b) => b.d > 0).length;
export const nowHitting = (s, now = Date.now()) => Object.values(s.live || {}).filter((t) => now - t < R2.liveSec * 1000).length;
function feedPush(s, f) { s.feed = [f, ...(s.feed || [])].slice(0, R2.feedMax); }

// ─── 한 판 피해 반영 (서버만 부른다 · 한 줄씩 차례로) ───
// parts: { body: 피해 } (옛 팔 이름도 받아서 합친다 · 위에서 상한을 이미 확인) → 실제로 깎인 양 · 넘긴 페이즈(p2 · p3) · 처치
//  - 한 판 최대 = 최대 체력의 1% (넘으면 줄인다)
//  - o.diff: 난이도 (서버가 판 기록에서 꺼낸 값) → 피해 × 배율 · 상한도 × 배율
export const runCapOf = (s, diff) => Math.round(s.hpMax * R2.runCapPct * diffMul(diff));
export function applyRun(s, uid, nick, parts, now = Date.now(), o = {}) {
  const diff = diffOf(o.diff), mul = diffMul(diff);
  const raw = normParts(parts).body || 0;
  const want = Math.round(raw * mul);
  const cap = runCapOf(s, diff);
  const v = Math.min(want, cap);
  const nk = String(nick || '').slice(0, 12);
  const broke = [];
  const ph0 = phaseOf(s);
  const counted = killed(s) ? 0 : Math.min(v, hpLeft(s));
  s.hp.body = hpLeft(s) - counted;
  const ph1 = phaseOf(s);
  for (let p = Math.min(ph0, 3) + 1; p <= Math.min(ph1, 3); p++) {
    const id = 'p' + p;
    if (s.by[id]) continue;
    s.by[id] = { uid, n: nk, at: now };
    broke.push(id);
    feedPush(s, { t: now, n: nk, k: 'phase', p: id });
  }
  if (counted > 0 && s.hp.body <= 0) {
    s.hp.body = 0;
    s.by.body = { uid, n: nk, at: now };
    broke.push('body');
    s.killedAt = now; s.killer = { uid, n: nk };
    feedPush(s, { t: now, n: nk, k: 'kill', p: 'body' });
  }
  const b = s.board[uid] || (s.board[uid] = { n: '', d: 0, r: 0, c: 0, lh: 0 });
  b.n = nk; b.d += counted; b.r++; b.lh += broke.length;
  b.x = Math.max(b.x | 0, DIFF_IDS.indexOf(diff)); // 이번 주 가장 어려운 난이도 (순위표 표시)
  if (o.coop) b.c += Math.round(counted * R2.coopPct);
  delete (s.live || {})[uid];
  if (counted >= cap * 0.5 && !broke.length) feedPush(s, { t: now, n: b.n, k: 'hit', d: counted, df: diff });
  return { counted, raw, mul, diff, cap, clipped: want > cap, broke, killed: broke.includes('body') };
}
// 부르기에 응답한 판: 부른 사람도 협동 기여
export function coopCredit(s, uid, nick, v) {
  const b = s.board[uid] || (s.board[uid] = { n: String(nick || '').slice(0, 12), d: 0, r: 0, c: 0, lh: 0 });
  b.c += Math.max(0, Math.round(v));
}

// ─── 개인 기록 (lb.raid2) ───
//  wi: 이번 주 · used: 쓴 입장 · bonus: 부르기로 받은 추가 입장 · run: 진행 중인 판
//  rin: 받은 부르기 [{ id, n, at }] · rout: 오늘 보낸 부르기 { day, ids } · paid: [{ wi, f }] (보상 받은 주 · 비트 1 참가 2 토벌 4 순위)
//  set: 건물주 세트 { 조각: { lv, on } }
//  hardSec: 어려움에서 가장 오래 버틴 초 (지옥 열기)
export function emptyR2() { return { wi: -1, used: 0, bonus: 0, run: null, rin: [], rout: null, paid: [], set: {}, best: 0, total: 0, hardSec: 0 }; }
export function normRaid2(raw, out) {
  const r = (raw && raw.raid2) || {};
  const o = emptyR2();
  o.wi = Number.isInteger(r.wi) ? r.wi : -1;
  o.used = int(r.used, 0, 99); o.bonus = int(r.bonus, 0, R2.bonusMax);
  o.best = int(r.best, 0, 1e13); o.total = int(r.total, 0, 1e15); o.hardSec = int(r.hardSec, 0, R2.sec + 30);
  o.run = r.run && typeof r.run.id === 'string' && r.run.id.length <= 32 ? { id: r.run.id, wi: int(r.run.wi, -1e6, 1e6), at: int(r.run.at, 0, 9e15), rally: typeof r.run.rally === 'string' ? r.run.rally.slice(0, 40) : null, rn: String(r.run.rn || '').slice(0, 12), help: !!r.run.help, df: diffOf(r.run.df), ex: (Array.isArray(r.run.ex) ? r.run.ex : []).filter((p) => PARTS.includes(p)) } : null;
  o.rin = (Array.isArray(r.rin) ? r.rin : []).filter((x) => x && typeof x.id === 'string' && x.id.length <= 40 && Number.isFinite(x.at)).slice(-20).map((x) => ({ id: x.id, n: String(x.n || '').slice(0, 12), at: int(x.at, 0, 9e15) }));
  o.rout = r.rout && Number.isInteger(r.rout.day) ? { day: r.rout.day, ids: [...new Set((Array.isArray(r.rout.ids) ? r.rout.ids : []).filter((x) => typeof x === 'string' && x.length <= 40))].slice(0, 30) } : null;
  o.paid = (Array.isArray(r.paid) ? r.paid : []).filter((x) => x && Number.isInteger(x.wi)).slice(-12).map((x) => ({ wi: x.wi, f: int(x.f, 0, 7) }));
  for (const [id, v] of Object.entries(r.set && typeof r.set === 'object' ? r.set : {})) if (SET[id] && v && typeof v === 'object') o.set[id] = { lv: int(v.lv, 0, SET_MAX), on: typeof v.on === 'string' && HEROES[v.on] ? v.on : null };
  out.raid2 = o;
  return o;
}
// 이번 주로 맞추기 (주가 바뀌었으면 입장 다시)
export function r2Week(lb, now = Date.now()) {
  const r = lb.raid2 || (lb.raid2 = emptyR2());
  const wi = weekIndex(now);
  if (r.wi !== wi) { r.wi = wi; r.used = 0; r.bonus = 0; }
  r.rin = (r.rin || []).filter((x) => now - x.at < R2.rallyDays * DAY);
  return r;
}
export const entriesLeft = (lb, now = Date.now()) => { const r = r2Week(lb, now); return Math.max(0, R2.entries + r.bonus - r.used); };
export const rallyInbox = (lb, now = Date.now()) => r2Week(lb, now).rin.slice().reverse();
export function r2Unlocked(lb) { return (lb.maxStage | 0) >= R2.unlock || !!lb.master; }

// 판 시작: 입장 하나 쓰기 · 부르기에 응답하면 추가 입장 (+1, 주마다 최대 R2.bonusMax) · 응답 버프
export function r2Start(lb, state, rid, now = Date.now(), o = {}) {
  if (!r2Unlocked(lb)) return { error: `건물주 레이드는 1-5를 깨면 참가할 수 있어요` };
  if (killed(state)) return { error: '이번 주 건물주는 이미 쓰러졌어요! 다음 주 월요일에 더 세져서 돌아와요' };
  const diff = o.diff === undefined || o.diff === null || o.diff === '' ? 'normal' : String(o.diff);
  const op = diffOpen(lb, diff, !!o.master);
  if (!op.ok) return { error: op.why };
  const r = r2Week(lb, now);
  let rally = null;
  if (o.rally) {
    const i = r.rin.findIndex((x) => x.id === o.rally);
    if (i < 0) return { error: '그 친구의 부르기가 없어요 (3일이 지나면 사라져요)' };
    rally = r.rin[i];
    r.rin.splice(i, 1);
    if (r.bonus < R2.bonusMax) r.bonus++;
  }
  if (!o.free && R2.entries + r.bonus - r.used <= 0) return { error: `이번 주 입장을 다 썼어요 (주마다 ${R2.entries}번 · 친구가 부르면 +1)` };
  if (!o.free) r.used++;
  r.run = { id: rid, wi: state.wi, at: now, rally: rally ? rally.id : null, rn: rally ? rally.n : '', help: !!o.help, df: diff, ex: exposed(state) };
  return { runId: rid, wi: state.wi, tier: state.tier, diff, mul: diffMul(diff), exposed: exposed(state), hp: { ...state.hp }, max: { ...state.max }, rally: rally ? { id: rally.id, n: rally.n } : null, left: entriesLeft(lb, now) };
}
// 부르기 보내기 (보내는 사람 · 받는 사람 기록을 같이 고친다 — 서버가 둘을 함께 저장)
export function rallySend(me, them, meId, themId, meNick, now = Date.now()) {
  if (!isFriend(me, themId) || !isFriend(them, meId)) return { error: '서로 친구일 때만 부를 수 있어요' };
  const r = r2Week(me, now), t = r2Week(them, now);
  const day = dayIndex(now);
  if (!r.rout || r.rout.day !== day) r.rout = { day, ids: [] };
  if (r.rout.ids.includes(themId)) return { error: '오늘은 이미 불렀어요' };
  if (r.rout.ids.length >= R2.rallyPerDay) return { error: `부르기는 하루 ${R2.rallyPerDay}번까지예요` };
  r.rout.ids.push(themId);
  t.rin = t.rin.filter((x) => x.id !== meId);
  t.rin.push({ id: meId, n: String(meNick || '').slice(0, 12), at: now });
  t.rin = t.rin.slice(-20);
  return { sent: true };
}
export const rallySentToday = (lb, id, now = Date.now()) => { const r = (lb.raid2 || {}).rout; return !!r && r.day === dayIndex(now) && r.ids.includes(id); };

// 한 판 피해 상한 (서버가 믿는 최대) — 성장 정도 × 시간 (멤버 약점 · 응원 버프까지 넉넉히)
export function r2Cap(lb, dur, o = {}) {
  const meta = Object.values(lb.heroes || {}).reduce((a, b) => a + (b | 0), 0);
  const stars = Object.values(lb.hstars || {}).reduce((a, b) => a + Math.max(0, b - 1), 0);
  const perSec = (900 + 380 * (lb.maxStage | 0)) * (1 + meta / 70) * (1 + stars * 0.05);
  return Math.round(Math.min(R2.sec + 15, int(dur, 0, 1e6)) * perSec * (o.help ? 1.35 : 1) * (o.rally ? 1 + R2.rallyBuff : 1));
}

// ─── 보상 ───
export const PART_RW = { coins: 3000, stones: 15, tickets: 2 }; // 페이즈 넘긴 판 (2페이즈 · 3페이즈 돌입 막타)
export const KILL_RW = { tickets: 5, gear: 'legend', title: 'r2king' }; // 본체 막타 (막타왕)
export const JOIN_RW = { coins: 1500, stones: 5, tickets: 1 }; // 참가 상자 (한 번이라도 때리면)
export const SLAY_RW = { coins: 3000, tickets: 3, title: 'r2slayer', frame: 'r2frame' }; // 토벌 성공 (참가자 모두)
// 주간 기여 순위 (지난주가 끝난 뒤 우편) · set: 건물주 세트 조각 수
export function rankReward(rank, n) {
  if (!rank) return null;
  if (rank === 1) return { tickets: 10, gear: 'myth', title: 'r2mvp', set: 2, label: '기여 1위' };
  if (rank <= 3) return { tickets: 6, gear: 'legend', set: 2, label: `기여 ${rank}위` };
  if (rank <= 10) return { tickets: 4, gear: 'epic', set: 1, label: `기여 ${rank}위` };
  if (rank <= Math.max(10, Math.ceil(n * 0.5))) return { tickets: 2, coins: 2000, set: 1, label: `기여 상위 50% (${rank}위)` };
  return { tickets: 1, coins: 1000, label: `기여 ${rank}위` };
}
// 받을 보상 계산 (archive 또는 이번 주 상태) — f: 이미 받은 비트
export function pendingRewards(src, uid, f, ended) {
  const out = [];
  const row = (src.rank || []).findIndex((x) => x[0] === uid);
  const did = row >= 0;
  if (!did) return out;
  if (!(f & 1)) out.push({ bit: 1, title: '건물주 레이드 참가 상자', text: `${src.tier}단계 건물주를 때렸어요`, rw: { ...JOIN_RW }, set: 0 });
  if (src.killed && !(f & 2)) out.push({ bit: 2, title: '건물주 토벌 성공!', text: `${src.tier}단계 건물주를 서버 모두가 쓰러뜨렸어요`, rw: { ...SLAY_RW }, set: 1 });
  if (ended && !(f & 4)) { const rw = rankReward(row + 1, src.rank.length); if (rw) { const { set, label, ...rest } = rw; out.push({ bit: 4, title: `건물주 레이드 ${label}`, text: `주간 기여 ${row + 1}위 / ${src.rank.length}명`, rw: rest, set: set || 0 }); } }
  return out;
}

// ─── 건물주 세트 (레이드 전용 · 멤버 한 명에게 끼운다 · 모든 모드 · 1:1 대전 제외) ───
//  조각마다 Lv 0~5 (같은 조각을 또 받으면 +1 · 다 키우면 코인)
export const SET_MAX = 5;
export const SET = {
  raid2_contract: { id: 'raid2_contract', name: '갑의 계약서', stat: 'boss', base: 0.1, per: 0.02, desc: '보스 피해', fb: '/img/lb/gear/stamp.webp' },
  raid2_keys: { id: 'raid2_keys', name: '마스터키 꾸러미', stat: 'cd', base: 0.06, per: 0.012, desc: '스킬 쿨타임 감소', fb: '/img/lb/gear/hourglass.webp' },
  raid2_bag: { id: 'raid2_bag', name: '월세 명품백', stat: 'atk', base: 0.08, per: 0.02, desc: '공격력', fb: '/img/lb/gear/carrier.webp' },
  raid2_golf: { id: 'raid2_golf', name: 'VIP 골프채', stat: 'critDmg', base: 0.15, per: 0.03, desc: '치명타 피해', fb: '/img/lb/gear/belt.webp' },
};
export const SET_IDS = Object.keys(SET);
export const SET_BONUS2 = { boss: 0.12, label: '2세트: 보스 · 중간 보스 피해 +12%' };
export const SET_BONUS4 = { atk: 0.1, ult: 0.1, label: '4세트: 공격력 +10% · 총공지 충전 +10%' };
export const setImg = (id) => `/img/lb/gear/${id}.webp`;
export const setValue = (id, lv) => { const s = SET[id]; return s ? Math.round((s.base + s.per * (lv || 0)) * 1000) / 1000 : 0; };
export function setStats(lb, hero) {
  const set = (lb && lb.raid2 && lb.raid2.set) || {};
  const st = {}; let n = 0;
  for (const id of SET_IDS) { const it = set[id]; if (!it || it.on !== hero) continue; n++; const k = SET[id].stat; st[k] = (st[k] || 0) + setValue(id, it.lv); }
  if (n >= 2) st.boss = (st.boss || 0) + SET_BONUS2.boss;
  if (n >= 4) { st.atk = (st.atk || 0) + SET_BONUS4.atk; st.ult = (st.ult || 0) + SET_BONUS4.ult; }
  if (n) st.r2Set = n;
  return st;
}
// 조각 받기 (서버 시드): 없는 조각 먼저 · 다 있으면 Lv +1 · 다 키웠으면 코인 3000
export function setGive(lb, seedStr) {
  const r = lb.raid2 || (lb.raid2 = emptyR2());
  const miss = SET_IDS.filter((id) => !r.set[id]);
  const up = SET_IDS.filter((id) => r.set[id] && r.set[id].lv < SET_MAX);
  const h = hashSeed(seedStr);
  if (miss.length) { const id = miss[h % miss.length]; r.set[id] = { lv: 0, on: null }; return { id, lv: 0, new: true }; }
  if (up.length) { const id = up[h % up.length]; r.set[id].lv++; return { id, lv: r.set[id].lv }; }
  lb.coins = (lb.coins | 0) + 3000;
  return { id: null, coins: 3000 };
}
export function setEquip(lb, id, hero) {
  const r = lb.raid2 || {};
  const it = (r.set || {})[id];
  if (!SET[id] || !it) return { error: '아직 없는 조각이에요' };
  if (hero && !HEROES[hero]) return { error: '없는 멤버예요' };
  it.on = hero || null;
  return { id, on: it.on };
}

// ─── 화면용 ───
export function weekLeftText(now = Date.now()) {
  const ms = weekStartMs(weekIndex(now) + 1) - now;
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 3600e3), m = Math.floor((ms % 3600e3) / 60e3);
  return d > 0 ? `${d}일 ${h}시간 남음` : h > 0 ? `${h}시간 ${m}분 남음` : `${m}분 남음`;
}
export const kstNow = (now = Date.now()) => new Date(now + KST);
