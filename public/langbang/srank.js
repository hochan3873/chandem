// 랑방 대전 — 시즌 랭킹 보상 (순수 함수 · 서버 server/langbang-season.js 와 화면이 같이 쓴다)
//  시즌 = 무료 시즌과 같은 4주 (live.js seasonOf · seasonEndMs) — 시즌이 끝나면 순위대로 우편함에 보상
//  순위표 3개: 스테이지 (최고 스테이지 → 총 별 → 먼저 도달) · 무한 도전 (최고 웨이브 → 점수) · 1:1 대전 (점수)
//  그 시즌에 한 번이라도 들어온 사람만 (lb.sr · lb.srPrev 시즌 번호) · 시즌이 끝난 뒤 기록은 lb.srPrev 에 얼어 있다
//  보상: 1~3위 = 시즌 한정 의상 (그 시즌에만 · 절대 안 판다) · 10위까지 = 움직이는 칭호 + 프레임 · 상위 30% = 칭호 + 프레임 · 참가 = 모집권 · 코인
import { seasonOf, weekIndex, seasonEndMs, weekStartMs, SEASON_WEEKS, mailAdd, srSnap } from './live.js';

export const SR_FIRST = 1; // 순위 보상이 나가는 첫 시즌
export const SR_MAIL_DAYS = 30;
export const SR_BOARDS = {
  stage: { id: 'stage', name: '스테이지', icon: 'map', sub: '최고 스테이지 → 총 별 → 먼저 도달' },
  endless: { id: 'endless', name: '무한 도전', icon: 'infinity', sub: '최고 웨이브 → 최고 점수' },
  pvp: { id: 'pvp', name: '1:1 대전', icon: 'swords', sub: '대전 점수 (한 판 이상)' },
};
export const SR_BOARD_IDS = Object.keys(SR_BOARDS);
// 시즌 한정 의상 (hw-event.js COSTUMES 에 season 번호로 들어 있다) — 그 시즌 1~3위만 받는다
export const SR_COSTUMES = { 1: ['bangjang_s1', 'eunok_s1', 'gunman_s1'] };
export const srCostumes = (sid) => (SR_COSTUMES[sid] || []).slice();
// 보상 단계: 위에서부터 처음 맞는 단계
export const SR_TIERS = [
  { id: 'r1', name: '1위', max: 1 },
  { id: 'r3', name: '2~3위', max: 3 },
  { id: 'r10', name: '4~10위', max: 10 },
  { id: 'r30', name: '상위 30%', pct: 0.3 },
  { id: 'join', name: '참가' },
];
export function srTier(rank, n) {
  rank = Math.floor(Number(rank) || 0); n = Math.max(rank, Math.floor(Number(n) || 0));
  if (rank < 1) return null;
  if (rank <= 1) return 'r1';
  if (rank <= 3) return 'r3';
  if (rank <= 10) return 'r10';
  if (rank <= Math.ceil(n * 0.3)) return 'r30';
  return 'join';
}
// 단계별 보상 (rw 는 live.js grant 가 그대로 준다 · skins = 의상)
export function srReward(sid, tier) {
  const s = `s${sid}`;
  if (tier === 'r1') return { skins: srCostumes(sid), title: `${s}_r1`, frame: 'srking', tickets: 20, coins: 30000, stones: 30 };
  if (tier === 'r3') return { skins: srCostumes(sid), title: `${s}_r3`, frame: 'srlaurel', tickets: 15, coins: 20000, stones: 20 };
  if (tier === 'r10') return { title: `${s}_r10`, frame: 'srlaurel', tickets: 10, coins: 12000, stones: 10 };
  if (tier === 'r30') return { title: `${s}_r30`, frame: 'srsilver', tickets: 5, coins: 6000, stones: 5 };
  if (tier === 'join') return { tickets: 2, coins: 2000 };
  return null;
}
export const srTierName = (tier) => (SR_TIERS.find((t) => t.id === tier) || {}).name || '';

// 그 시즌(sid) 기록: 아직 그 시즌이면(또는 끝나고 안 들어왔으면) 지금 기록 · 다음 시즌에 들어왔으면 얼려 둔 srPrev
export function srValue(lb, sid) {
  if (!lb) return null;
  if (lb.sr && lb.sr.sid === sid) return srSnap(lb);
  if (lb.srPrev && lb.srPrev.sid === sid) return lb.srPrev;
  return null;
}
const QUAL = { stage: (v) => v.ms > 0, endless: (v) => v.bw > 0, pvp: (v) => v.pg > 0 };
const CMP = {
  stage: (a, b) => b.ms - a.ms || b.ts - a.ts || (a.sa || 0) - (b.sa || 0),
  endless: (a, b) => b.bw - a.bw || b.bs - a.bs,
  pvp: (a, b) => b.pr - a.pr,
};
// rows: [{ id, lb }] (운영자 계정은 서버가 뺀다) → { stage: { n, rank: { id: 순위 } }, … } · 같은 기록은 같은 순위
export function srBoards(rows, sid) {
  const out = {};
  for (const b of SR_BOARD_IDS) {
    const list = [];
    for (const r of rows || []) { const v = r && srValue(r.lb, sid); if (v && QUAL[b](v)) list.push({ id: r.id, v }); }
    list.sort((x, y) => CMP[b](x.v, y.v));
    const rank = {};
    list.forEach((x, i) => { rank[x.id] = i > 0 && CMP[b](list[i - 1].v, x.v) === 0 ? rank[list[i - 1].id] : i + 1; });
    out[b] = { n: list.length, rank, top: list.slice(0, 3).map((x) => x.id) };
  }
  return out;
}
// 내 순위만: { stage: { rank, n } | null, … }
export function srMine(boards, id) {
  const o = {};
  for (const b of SR_BOARD_IDS) { const x = boards && boards[b]; const r = x && x.rank[id]; o[b] = r ? { rank: r, n: x.n } : null; }
  return o;
}
// 시즌이 끝난 뒤 우편함으로 (한 번만 · lb.srPaid = 받은 시즌 번호) → 보낸 우편 수
//  prep: { sid, ranks: srMine(...) } — 서버가 센 순위 (화면이 보낸 값은 안 믿는다)
export function srSettle(lb, prep, now = Date.now()) {
  if (!lb || !prep || !Number.isInteger(prep.sid) || prep.sid < SR_FIRST) return 0;
  if ((lb.srPaid | 0) >= prep.sid) return 0;
  if (prep.sid >= seasonOf(weekIndex(now))) return 0; // 아직 시즌 중
  lb.srPaid = prep.sid;
  let n = 0;
  for (const b of SR_BOARD_IDS) {
    const x = prep.ranks && prep.ranks[b];
    if (!x || !(x.rank >= 1)) continue;
    const tier = srTier(x.rank, x.n), rw = srReward(prep.sid, tier);
    if (!rw) continue;
    mailAdd(lb, { title: `🏆 시즌 ${prep.sid} ${SR_BOARDS[b].name} ${x.rank}위 보상`, text: `시즌 ${prep.sid} 랭킹 ${x.rank}위 / ${x.n}명 · ${srTierName(tier)} 보상`, from: '랑방', rw, days: SR_MAIL_DAYS }, now);
    n++;
  }
  return n;
}
// 화면용: 이번 시즌 번호 · 끝나는 시각 · 남은 시간
export function srNow(now = Date.now()) {
  const sid = seasonOf(weekIndex(now)), end = seasonEndMs(sid);
  return { sid, start: weekStartMs((sid - 1) * SEASON_WEEKS), end, left: Math.max(0, end - now) };
}
// 남은 시간 글자: "13일 4시간" · 하루 안이면 "4:05:09"
export function srLeftText(ms) {
  ms = Math.max(0, Math.floor(Number(ms) || 0)); // (|0 은 24일을 넘으면 깨진다)
  const d = Math.floor(ms / 86400e3), h = Math.floor((ms % 86400e3) / 3600e3), m = Math.floor((ms % 3600e3) / 60e3), s = Math.floor((ms % 60e3) / 1e3);
  if (d > 0) return `${d}일 ${h}시간 ${m}분`;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
