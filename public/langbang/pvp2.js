// 랑방 대전 — 1:1 맞대결 (v2) 규칙 · 입력 확인 · 장면(스냅샷) 묶기/풀기 (순수 함수 · DOM 없음)
// 서버(server/langbang-pvp2.js)가 판을 돌리고(pvp2-sim.js), 화면(pvp2-ui.js)은 서버가 보낸 장면을 그린다.
// 설계: docs/langbang-pvp-v2.md
import { PVP_END } from './pvp.js';

export const PV2 = {
  len: 240, // 한 판 4분
  clockK: PVP_END.end / 240, // 지금 대전 단계(300초 기준)를 4분에 맞춰 당긴다 → 72초 과열 · 120초 폭주 · 168초 서든데스
  field: 4, deckMax: 6, slots: [1, 2, 3, 4], // 필드 4명 (가운데 네 줄) · 벤치 = 나머지
  swapCd: 8, swapInv: 2, // 교체: 팀 8초 쿨 · 들어온 멤버 2초 무적
  cleanseCd: 10, // 정신 차려! (내 멤버 하나 풀기)
  hexFly: 0.7, hexImm: 4, // 견제: 0.7초 날아감 · 맞은 뒤 4초 면역
  hex: {
    ctrl: { k: 'stun', sec: 1.5, name: '기절' },
    single: { k: 'charm', sec: 2, name: '홀림' },
    special: { k: 'silence', sec: 3, name: '침묵' },
    aoe: { k: 'slow', sec: 3, cut: 0.35, name: '둔화' },
    tank: { k: 'guard', sec: 8, name: '방패' },
    support: { k: 'cleanse', sec: 2, name: '해제' },
  },
  comeback: { gap: 0.2, ult: 1.3, send: 0.8, hexCut: 0.75 }, // 입구가 20%p 이상 뒤지면: 총공지 +30% · 보내기 −20% · 받는 견제 −25%
  send: { small: { cost: 10, gap: 3 }, big: { cost: 30, gap: 3 }, delay: 1 },
  dt: 1 / 30, tickMs: 100, // 서버: 0.1초마다 3스텝
  eCap: 48, eCapOp: 32, // 장면에 담는 진상 최대 (내 판 · 상대 판)
  rate: { perSec: 8, burst: 12 }, // 입력: 1초 8번 (순간 12번)
  grace: 15, // 끊김: 15초 동안 AI 가 대신 · 그 뒤 기권
  botAfter: 20, // 20초 동안 사람이 없으면 AI
  match: { fp: 0.15, widen: 0.1, every: 5, rating: 200, ratingWiden: 50 },
};
export const HEX_KINDS = ['stun', 'charm', 'silence', 'slow'];
export const HEX_NAME = { stun: '기절', charm: '홀림', silence: '침묵', slow: '둔화', guard: '방패', cleanse: '해제' };
// 멤버 상태 비트 (장면)
export const ST = { stun: 1, charm: 2, silence: 4, slow: 8, guard: 16, imm: 32, other: 64, ready: 128 };

export const pvp2Phase = (t) => { const c = t * PV2.clockK; return c >= 210 ? 3 : c >= 150 ? 2 : c >= 90 ? 1 : 0; };
export const pvp2PhaseAt = [0, 90 / PV2.clockK, 150 / PV2.clockK, 210 / PV2.clockK]; // 72 · 120 · 168초
export const pvp2LeftText = (t) => { const s = Math.max(0, Math.ceil(PV2.len - t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// 덱 → 필드 · 벤치 (덱 순서 그대로 앞 4명이 필드)
export function splitDeck(deck) {
  const d = (deck || []).filter(Boolean).slice(0, PV2.deckMax);
  return { field: d.slice(0, PV2.field), bench: d.slice(PV2.field) };
}

// ─── 입력 확인 (서버 · 테스트 공용): 이상한 값은 null ───
//  sk 스킬 { s: 필드 자리, x?, y? } · ult 총공지 · tg 견제 표적 { s: 상대 자리 | -1 자동 } · sw 교체 { b: 벤치 번호, s: 자리 }
//  cl 정신 차려 { s?: 자리 (없으면 제일 심한 멤버) } · send 보내기 { kind } · fo 집중 공격 { x, y }
const int = (v, a, b) => { const n = Number(v); return Number.isInteger(n) && n >= a && n <= b ? n : null; };
const num = (v, a, b) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : null; };
export function cleanInput(o) {
  if (!o || typeof o !== 'object') return null;
  const k = o.k;
  if (k === 'sk') { const s = int(o.s, 0, 6); if (s === null) return null; const out = { k, s }; if (o.x !== undefined && o.y !== undefined) { const x = num(o.x, 0, 360), y = num(o.y, -60, 720); if (x !== null && y !== null) { out.x = x; out.y = y; } } return out; }
  if (k === 'ult') return { k };
  if (k === 'tg') { const s = int(o.s, -1, 6); return s === null ? null : { k, s }; }
  if (k === 'sw') { const b = int(o.b, 0, 1), s = int(o.s, 0, 6); return b === null || s === null ? null : { k, b, s }; }
  if (k === 'cl') { if (o.s === undefined || o.s === null) return { k, s: -1 }; const s = int(o.s, -1, 6); return s === null ? null : { k, s }; }
  if (k === 'send') return o.kind === 'big' || o.kind === 'small' ? { k, kind: o.kind } : null;
  if (k === 'fo') { const x = num(o.x, 0, 360), y = num(o.y, -60, 720); return x === null || y === null ? null : { k, x, y }; }
  return null;
}
// 입력 횟수 제한 (토큰 통): 초당 perSec · 최대 burst
export function rateOk(b, nowSec) {
  if (b.t === undefined) { b.t = nowSec; b.n = PV2.rate.burst; }
  b.n = Math.min(PV2.rate.burst, b.n + (nowSec - b.t) * PV2.rate.perSec); b.t = nowSec;
  if (b.n < 1) return false;
  b.n -= 1; return true;
}

// ─── 매칭: 새 전투력 잣대(pvpFirepower)가 비슷한 사람끼리 · 기다릴수록 넓게 ───
export function matchFits(a, b, waitSec) {
  const M = PV2.match, k = Math.floor(Math.max(0, waitSec) / M.every);
  const fa = Math.max(1, a.fp | 0), fb = Math.max(1, b.fp | 0);
  const okFp = Math.abs(fa - fb) / Math.max(fa, fb) <= M.fp + M.widen * k;
  const okRt = Math.abs((a.rating | 0) - (b.rating | 0)) <= M.rating + M.ratingWiden * k;
  return okFp && okRt;
}

// ─── 판정 (4분): 입구 % → 처치 → 무승부. 1 = 0번 승 · -1 = 1번 승 · 0 = 무승부 ───
export function judge2(a, b) {
  const pct = (p) => Math.round((Math.max(0, Number(p.hp) || 0) / Math.max(1, Number(p.max) || 1)) * 1000);
  const pa = pct(a), pb = pct(b);
  if (pa !== pb) return pa > pb ? 1 : -1;
  const ka = Math.floor(Number(a.kills) || 0), kb = Math.floor(Number(b.kills) || 0);
  if (ka !== kb) return ka > kb ? 1 : -1;
  return 0;
}

// ─── 진상 묶기: 한 명 7바이트 [uid 2 · 종류 1 · x 1 · y 1 · 체력% 1 · 표시 1] ───
//  x: 0~360 → 0~255 · y: −80~583 → 0~255 (2.6px) · 표시: 1 보스 · 2 중간 보스 · 4 보낸 진상 · 8 집중 · 16 묶임
export const EB = 7;
export const encX = (x) => Math.max(0, Math.min(255, Math.round((x / 360) * 255)));
export const decX = (v) => (v / 255) * 360;
export const encY = (y) => Math.max(0, Math.min(255, Math.round((y + 80) / 2.6)));
export const decY = (v) => v * 2.6 - 80;
export function packEnemies(list, types) {
  const out = new Uint8Array(list.length * EB);
  let o = 0;
  for (const e of list) {
    let ti = types.indexOf(e.t); if (ti < 0) { ti = types.length; types.push(e.t); }
    out[o] = e.uid & 255; out[o + 1] = (e.uid >> 8) & 255; out[o + 2] = ti & 255;
    out[o + 3] = encX(e.x); out[o + 4] = encY(e.y); out[o + 5] = Math.max(0, Math.min(100, Math.round(e.hp * 100))); out[o + 6] = e.f & 255;
    o += EB;
  }
  return out;
}
export function unpackEnemies(buf, types) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf && buf.byteLength !== undefined ? buf : []);
  const out = [];
  for (let o = 0; o + EB <= u8.length; o += EB) out.push({ uid: u8[o] | (u8[o + 1] << 8), t: (types || [])[u8[o + 2]] || '', x: decX(u8[o + 3]), y: decY(u8[o + 4]), hp: u8[o + 5] / 100, f: u8[o + 6] });
  return out;
}
// 상태 해시 (같은 시드 + 같은 입력 → 같은 값 · 테스트 · 다시보기)
export function hashOf(nums) {
  let h = 2166136261 >>> 0;
  for (const v of nums) { const n = Math.round(Number(v) * 100) | 0; h ^= n & 0xffff; h = Math.imul(h, 16777619) >>> 0; h ^= n >>> 16; h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
