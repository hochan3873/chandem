// 랑방 대전 — 진상의 탑 리메이크 화면: 바닥 예고 모양 · 독 웅덩이 · 기 모으기 · 멤버 체력 막대 · 상태 표시 · 끌어 옮기기 화살표 · 이벤트 연출
//  render.js 가 twaDraw(g, t, 'back' | 'top') 로 부른다 (tower-ui.js 가 연결) · 전투 규칙은 tower-arena.js
import { HEROES } from './data.js';
import * as TWA from './tower-arena.js';

let C = null;
const fxl = []; // 잠깐 남는 연출 (감전 번개 줄기 · 터진 자리)
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const FONT = '"Pretendard", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const FOOT = 22; // 몸 가운데(y) → 발밑: 바닥 모양은 발 높이에 그린다 (맞는 판정은 몸 가운데 그대로)
// 예고 이름표 자리 (멤버 몸에 안 가리게 모양 가장자리)
function labelAt(g, s) {
  const z = TWA.zoneOf(g), F = TWA.SHAPE.flat;
  if (s.shape === 'circle') return { x: s.x, y: s.y + FOOT + s.r * F + 10 };
  if (s.shape === 'line' || s.shape === 'cross') return { x: s.x, y: z.y0 - 6 };
  if (s.shape === 'band') return { x: 34, y: s.y + FOOT };
  if (s.shape === 'ring') return { x: s.x, y: s.y + FOOT - s.r2 * F - 4 };
  if (s.shape === 'cone') return { x: s.x + Math.cos(s.ang) * 70, y: s.y + Math.sin(s.ang) * 70 };
  return { x: s.x, y: s.y };
}

export function initArenaUi(ctx) {
  C = ctx;
  C.R.twaDraw = (g, t, layer) => { try { draw(g, t, layer); } catch (e) { if (!draw.err) { draw.err = 1; console.warn('[tower-arena] 그리기 오류', e); } } };
  return { onEvent, isEvent: (t) => typeof t === 'string' && t.startsWith('twa') };
}
function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
// 모양 경로 (채우기 · 테두리 같이 씀) — 원은 원근 때문에 위아래 납작 (TWA.SHAPE.flat)
function path(cx, g, s, scale = 1) {
  const F = TWA.SHAPE.flat, z = TWA.zoneOf(g);
  const top = z.y0 - 36, bot = z.y1 + 34;
  cx.beginPath();
  switch (s.shape) {
    case 'circle': cx.ellipse(s.x, s.y, s.r * scale, s.r * F * scale, 0, 0, TAU); break;
    case 'ring': cx.ellipse(s.x, s.y, s.r2, s.r2 * F, 0, 0, TAU); cx.moveTo(s.x + s.r1, s.y); cx.ellipse(s.x, s.y, s.r1, s.r1 * F, 0, 0, TAU, true); break;
    case 'line': cx.rect(s.x - s.w * scale, top, s.w * 2 * scale, bot - top); break;
    case 'band': cx.rect(4, s.y - s.h * scale, g.W - 8, s.h * 2 * scale); break;
    case 'cross': cx.rect(s.x - s.w * scale, top, s.w * 2 * scale, bot - top); cx.rect(4, s.y - s.w * scale, g.W - 8, s.w * 2 * scale); break;
    case 'cone': { const L = s.len * (scale < 1 ? 0.35 + 0.65 * scale : 1); cx.moveTo(s.x, s.y); cx.arc(s.x, s.y, L, s.ang - s.sp, s.ang + s.sp); cx.closePath(); break; }
    default: break;
  }
}
function label(cx, x, y, txt, col, sz = 10) {
  cx.save(); cx.font = `900 ${sz}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  const w = cx.measureText(txt).width + 10;
  cx.fillStyle = 'rgba(10,8,22,0.82)'; cx.beginPath(); if (cx.roundRect) cx.roundRect(x - w / 2, y - sz * 0.75, w, sz * 1.5, sz * 0.75); else cx.rect(x - w / 2, y - sz * 0.75, w, sz * 1.5); cx.fill();
  cx.strokeStyle = col; cx.lineWidth = 1.2; cx.stroke();
  cx.fillStyle = col; cx.fillText(txt, x, y + 0.5);
  cx.restore();
}
function centerOf(g, s) {
  const z = TWA.zoneOf(g);
  if (s.shape === 'line') return { x: s.x, y: (z.y0 + z.y1) / 2 };
  if (s.shape === 'band') return { x: g.W / 2, y: s.y };
  if (s.shape === 'cone') { const d = Math.max(20, s.len - 120); return { x: s.x + Math.cos(s.ang) * d, y: s.y + Math.sin(s.ang) * d }; } // 부채꼴: 노린 멤버 자리
  return { x: s.x, y: s.y };
}
function draw(g, t, layer) {
  const A = g.twa;
  if (!A) return;
  const R = C.R, cx = R.cx;
  R.world();
  if (layer === 'back') {
    const z = TWA.zoneOf(g);
    // 움직일 수 있는 띠 (아주 옅게) — 끄는 중엔 또렷하게
    cx.save(); cx.setLineDash([6, 8]); cx.lineWidth = 1.5; cx.strokeStyle = A.drag ? 'rgba(140,255,190,0.55)' : 'rgba(255,255,255,0.09)';
    cx.beginPath(); if (cx.roundRect) cx.roundRect(z.x0 - 14, z.y0 - 20, z.x1 - z.x0 + 28, z.y1 - z.y0 + 44, 18); else cx.rect(z.x0 - 14, z.y0 - 20, z.x1 - z.x0 + 28, z.y1 - z.y0 + 44); cx.stroke(); cx.restore();
    // 독 웅덩이 (발 높이)
    cx.save(); cx.translate(0, FOOT);
    for (const q of A.pools) {
      const a = Math.min(1, q.t / 0.6);
      cx.save(); cx.globalAlpha = 0.35 * a; cx.fillStyle = '#4fbf3a'; cx.beginPath(); cx.ellipse(q.x, q.y, q.r, q.r * TWA.SHAPE.flat, 0, 0, TAU); cx.fill();
      cx.globalAlpha = 0.7 * a; cx.strokeStyle = '#9dff6a'; cx.lineWidth = 2; cx.stroke();
      for (let i = 0; i < 4; i++) { const k = (t * 0.8 + i * 0.27) % 1, bx = q.x + Math.cos(i * 2.1) * q.r * 0.5, by = q.y + Math.sin(i * 1.7) * q.r * 0.25 - k * 14; cx.globalAlpha = 0.8 * (1 - k) * a; cx.fillStyle = '#c8ff9a'; cx.beginPath(); cx.arc(bx, by, 2 + k * 2, 0, TAU); cx.fill(); }
      cx.restore();
    }
    cx.restore();
    // 예고 모양: 어둡게 깔고 · 바탕 + 안쪽이 차오름 (다 차면 터진다) + 테두리 깜빡 — 바닥(발 높이)에 그린다
    cx.save(); cx.translate(0, FOOT);
    for (const s of A.tele) {
      const H = TWA.HZ[s.kind] || TWA.HZ.hit, k = clamp(s.t / s.warn, 0, 1), blink = 0.5 + 0.5 * Math.sin(t * (10 + k * 14));
      cx.save();
      if (s.ex !== undefined) { cx.setLineDash([4, 6]); cx.lineDashOffset = -t * 50; cx.strokeStyle = rgba(H.color, 0.5); cx.lineWidth = 1.5; const c0 = centerOf(g, s); cx.beginPath(); cx.moveTo(s.ex, s.ey - FOOT); cx.lineTo(c0.x, c0.y); cx.stroke(); cx.setLineDash([]); }
      path(cx, g, s); cx.fillStyle = 'rgba(10,0,8,0.28)'; cx.fill('evenodd');
      cx.fillStyle = rgba(H.color, 0.2 + 0.1 * blink); cx.fill('evenodd');
      if (s.shape === 'ring') { cx.fillStyle = rgba(H.color, 0.2 + 0.35 * k); cx.fill('evenodd'); }
      else { path(cx, g, s, Math.max(0.05, k)); cx.fillStyle = rgba(H.color, 0.42); cx.fill('evenodd'); }
      path(cx, g, s); cx.lineWidth = 2.6 + k * 1.6; cx.strokeStyle = rgba(H.color, 0.65 + 0.35 * blink); cx.setLineDash(k > 0.7 ? [] : [8, 5]); cx.stroke();
      cx.restore();
    }
    // 기 모으기: 안전한 원 밖은 전부 위험 · 원은 초록
    if (A.wind) {
      const W = A.wind, k = clamp(W.t / W.dur, 0, 1), blink = 0.5 + 0.5 * Math.sin(t * (8 + k * 16));
      const F = TWA.SHAPE.flat;
      cx.save();
      cx.beginPath(); cx.rect(z.x0 - 24, z.y0 - 30, z.x1 - z.x0 + 48, z.y1 - z.y0 + 64); cx.moveTo(W.x + W.r, W.y); cx.ellipse(W.x, W.y, W.r, W.r * F, 0, 0, TAU, true);
      cx.fillStyle = `rgba(255,40,60,${0.1 + 0.22 * k + 0.08 * blink})`; cx.fill('evenodd');
      cx.beginPath(); cx.ellipse(W.x, W.y, W.r, W.r * F, 0, 0, TAU); cx.lineWidth = 3; cx.strokeStyle = `rgba(120,255,160,${0.7 + 0.3 * blink})`; cx.stroke();
      cx.fillStyle = 'rgba(120,255,160,0.18)'; cx.fill();
      cx.restore();
    }
    cx.restore();
    if (A.wind) {
      const W = A.wind, k = clamp(W.t / W.dur, 0, 1), blink = 0.5 + 0.5 * Math.sin(t * (8 + k * 16));
      const e = W.e;
      if (!e.dead) { // 기 모으는 진상: 붉은 고리 + 게이지 + 끊기 표시
        const ey = e.y - e.def.size * 0.9, bw = 64;
        cx.save(); cx.globalAlpha = 0.6 + 0.4 * blink; cx.strokeStyle = '#ff3b4f'; cx.lineWidth = 3; cx.beginPath(); cx.arc(e.x, e.y - e.def.size * 0.4, e.def.size * (0.55 + 0.1 * Math.sin(t * 12)), 0, TAU); cx.stroke(); cx.restore();
        cx.fillStyle = 'rgba(10,8,22,0.85)'; cx.fillRect(e.x - bw / 2 - 1, ey - 1, bw + 2, 7);
        cx.fillStyle = '#ff3b4f'; cx.fillRect(e.x - bw / 2, ey, bw * k, 5);
        const cut = clamp((W.hp0 - e.hp) / W.need, 0, 1);
        cx.fillStyle = '#ffd23f'; cx.fillRect(e.x - bw / 2, ey + 6, bw * cut, 2.5);
        label(cx, e.x, ey - 11, '기 모으는 중 · 끊어라!', '#ff8a9a', 9);
      }
    }
    return;
  }
  // ── top: 예고 이름표 · 끌기 화살표 · 가는 곳 · 체력 · 상태 ──
  for (const s of A.tele) { const H = TWA.HZ[s.kind] || TWA.HZ.hit, p = labelAt(g, s); label(cx, clamp(p.x, 26, g.W - 26), p.y, `${H.name} ${Math.max(0, s.warn - s.t).toFixed(1)}`, H.color, 10); }
  if (A.wind) label(cx, A.wind.x, A.wind.y + FOOT, '안전', '#8cffb0', 11);
  const ms = TWA.members(g);
  for (const h of ms) {
    if (h.twTo && !(h.twDown > 0)) {
      cx.save(); cx.setLineDash([3, 5]); cx.strokeStyle = 'rgba(160,255,200,0.6)'; cx.lineWidth = 1.5; cx.beginPath(); cx.moveTo(h.x, h.y + 24); cx.lineTo(h.twTo.x, h.twTo.y + 24); cx.stroke();
      cx.setLineDash([]); cx.beginPath(); cx.ellipse(h.twTo.x, h.twTo.y + 24, 12, 6, 0, 0, TAU); cx.stroke(); cx.restore();
    }
  }
  if (A.drag && A.drag.h) {
    const d = A.drag, h = d.h, p = { x: clamp(d.x, TWA.zoneOf(g).x0, TWA.zoneOf(g).x1), y: clamp(d.y, TWA.zoneOf(g).y0, TWA.zoneOf(g).y1) };
    const bad = A.tele.some((s) => TWA.inShape(s, p.x, p.y, g)) || (A.wind && TWA.inShape({ shape: 'quake', x: A.wind.x, y: A.wind.y, r: A.wind.r }, p.x, p.y, g));
    const col = bad ? '#ff5a6a' : '#8cffb0';
    cx.save(); cx.lineWidth = 4; cx.strokeStyle = col; cx.globalAlpha = 0.9; cx.setLineDash([8, 6]); cx.lineDashOffset = -t * 40;
    cx.beginPath(); cx.moveTo(h.x, h.y + 20); cx.lineTo(p.x, p.y + 20); cx.stroke(); cx.setLineDash([]);
    cx.beginPath(); cx.ellipse(p.x, p.y + 20, 22, 11, 0, 0, TAU); cx.stroke(); cx.globalAlpha = 0.25; cx.fillStyle = col; cx.fill();
    cx.restore();
    label(cx, p.x, p.y - 8, `${(HEROES[h.id] || {}).name || ''} 여기로${bad ? ' (위험!)' : ''}`, col, 10);
  }
  for (const h of ms) {
    const p0 = TWA.posOf(h), hx = h.out || h.restT > 0 || h.rx === undefined ? p0.x : h.rx, hy = p0.y; // 보이는 자리 (render 와 같은 식)
    const feet = hy + 24.6, bw = 36, bx = hx - bw / 2, by = feet + 18;
    const f = h.twMax ? clamp(h.twHp / h.twMax, 0, 1) : 1;
    // 감전: 몸에 번개 · 홀림: 끌려가는 하트 줄
    if (h.twShockT > 0) {
      cx.save(); cx.strokeStyle = '#7ff6ff'; cx.lineWidth = 2; cx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 40);
      for (let i = 0; i < 3; i++) { const a0 = t * 9 + i * 2.1; cx.beginPath(); let x = hx + Math.cos(a0) * 18, y = hy - 30 + Math.sin(a0) * 26; cx.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (Math.random() - 0.5) * 14; y += 8; cx.lineTo(x, y); } cx.stroke(); }
      cx.restore();
    }
    if (h.charmT > 0 && h.twCharm) { cx.save(); cx.strokeStyle = 'rgba(255,111,208,0.7)'; cx.setLineDash([2, 5]); cx.lineWidth = 2; cx.beginPath(); cx.moveTo(hx, hy - 30); cx.lineTo(h.twCharm.x, h.twCharm.y); cx.stroke(); cx.restore(); }
    if (h.twDown > 0) { // 쓰러짐: 회색 그림자 + 일어날 때까지 원
      cx.save(); cx.fillStyle = 'rgba(20,20,30,0.55)'; cx.beginPath(); cx.ellipse(hx, feet - 4, 30, 12, 0, 0, TAU); cx.fill();
      const k = 1 - h.twDown / (TWA.ARENA.down.sec || 10);
      cx.strokeStyle = '#ffd23f'; cx.lineWidth = 3; cx.beginPath(); cx.arc(hx, hy - 40, 13, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); cx.stroke(); cx.restore();
      label(cx, hx, hy - 40, `${Math.ceil(h.twDown)}`, '#ffd23f', 10);
      label(cx, hx, hy - 62, '쓰러짐', '#ff8a7a', 9);
    }
    if (h.twGrace > 0) { cx.save(); cx.globalAlpha = 0.35 + 0.25 * Math.sin(t * 20); cx.strokeStyle = '#fff6b0'; cx.lineWidth = 2; cx.beginPath(); cx.ellipse(hx, hy - 20, 30, 44, 0, 0, TAU); cx.stroke(); cx.restore(); }
    // 체력 막대 (발밑 Lv 칩 아래)
    cx.fillStyle = 'rgba(8,6,18,0.88)'; cx.fillRect(bx - 1, by - 1, bw + 2, 6);
    cx.fillStyle = h.twDown > 0 ? '#6b6b7a' : h.poisonT > 0 ? '#8fe85a' : f > 0.5 ? '#4fe08a' : f > 0.25 ? '#ffd23f' : '#ff4f5a';
    cx.fillRect(bx, by, Math.max(h.twHp > 0 ? 1.5 : 0, bw * f), 4);
    if (f < 1 && h.twHurtF !== undefined && h.twHurtF > f) { cx.fillStyle = 'rgba(255,255,255,0.55)'; cx.fillRect(bx + bw * f, by, bw * (h.twHurtF - f), 4); } // 방금 깎인 만큼 하얗게
    h.twHurtF = h.twHurtF === undefined ? f : Math.max(f, h.twHurtF - 0.6 / 60);
    // 상태 딱지 (render 가 안 그리는 것만): 감전 · 홀림 · 침묵 · 느림
    const tag = h.twShockT > 0 ? ['감전', '#7ff6ff', h.twShockT] : h.charmT > 0 && h.twCharm ? ['홀림', '#ff9ae0', h.charmT] : h.silenceT > 0 && !(h.twDown > 0) ? ['침묵', '#c9b8ff', h.silenceT] : h.twSlowT > 0 ? ['느림', '#9cc0ff', h.twSlowT] : h.stunT > 0 && !(h.twDown > 0) ? [h.freezeT > 0 ? '빙결' : '기절', h.freezeT > 0 ? '#bff4ff' : '#ffe27a', h.stunT] : null;
    if (tag) label(cx, hx, by + 13, `${tag[0]} ${tag[2].toFixed(1)}`, tag[1], 9);
  }
  // 잠깐 남는 연출: 감전 번개 줄기
  const now = performance.now();
  for (let i = fxl.length - 1; i >= 0; i--) {
    const q = fxl[i], k = (now - q.t0) / q.dur;
    if (k >= 1) { fxl.splice(i, 1); continue; }
    if (q.k === 'chain') {
      cx.save(); cx.globalAlpha = 1 - k; cx.strokeStyle = '#bffcff'; cx.lineWidth = 3; cx.shadowColor = '#5ff2ff'; cx.shadowBlur = 10;
      cx.beginPath(); cx.moveTo(q.x0, q.y0 - 30); const n = 6; for (let j = 1; j < n; j++) { const u = j / n; cx.lineTo(q.x0 + (q.x1 - q.x0) * u + (Math.random() - 0.5) * 16, q.y0 - 30 + (q.y1 - q.y0) * u + (Math.random() - 0.5) * 16); } cx.lineTo(q.x1, q.y1 - 30); cx.stroke(); cx.restore();
    } else if (q.k === 'boom') {
      cx.save(); cx.translate(0, FOOT); cx.globalAlpha = 0.55 * (1 - k); path(cx, g, q.s, 1 + k * 0.08); cx.fillStyle = q.col; cx.fill('evenodd'); cx.restore();
    }
  }
}

// ─── 이벤트 (game.js handleEvents → tower-ui → 여기) ───
const HIT_TXT = { hit: '쾅!', wind: '기 폭발!' };
function onEvent(g, e, loud) {
  const fx = C.fx, A = C.A;
  const H = TWA.HZ[e.kind] || TWA.HZ.hit;
  switch (e.type) {
    case 'twaWarn': if (loud) try { A.sfx.tick ? A.sfx.tick() : A.sfx.tap(); } catch { /* 무시 */ } break;
    case 'twaBoom': {
      fxl.push({ k: 'boom', s: e, col: H.color, t0: performance.now(), dur: 380 });
      const c = centerOf(g, e);
      fx.ring(c.x, c.y, 8, e.r || 60, 0.35, H.color, 4);
      for (let k = 0; k < 8; k++) fx.part('spark', c.x + (Math.random() - 0.5) * 40, c.y, (Math.random() - 0.5) * 120, -60 - Math.random() * 80, 0.45, 4, H.color);
      if (e.n) { fx.addShake(e.n >= 2 ? 6 : 4); if (loud) try { A.sfx.slam(); } catch { /* 무시 */ } }
      break;
    }
    case 'twaHit': {
      const txt = e.res ? '저항!' : e.kind === 'hit' || e.kind === 'wind' ? HIT_TXT[e.kind] : e.kind === 'knock' ? '넉백!' : e.kind === 'poison' ? '독!' : `${H.name} ${e.sec}초`;
      fx.text(e.x, e.y - 76, txt, e.res ? '#9fffc0' : H.color || '#ffd23f', e.res ? 12 : 13, 0.9, -26);
      if (e.kind === 'freeze') fx.ring(e.x, e.y - 20, 6, 46, 0.5, '#bff4ff', 3);
      if (loud && (e.kind === 'stun' || e.kind === 'wind')) try { A.sfx.thud(); } catch { /* 무시 */ }
      break;
    }
    case 'twaChain': fxl.push({ k: 'chain', x0: e.x0, y0: e.y0, x1: e.x1, y1: e.y1, t0: performance.now(), dur: 420 }); fx.text(e.x1, e.y1 - 90, '감전 번짐!', '#7ff6ff', 12, 0.8, -20); if (loud) try { A.sfx.censor ? A.sfx.censor() : A.sfx.hit(); } catch { /* 무시 */ } break;
    case 'twaDodge': fx.text(e.x, e.y - 70, '회피!', '#8cffb0', 12, 0.7, -24); break;
    case 'twaDown': fx.text(e.x, e.y - 86, `${(HEROES[e.hero] || {}).name || ''} 쓰러짐!`, '#ff6a5a', 14, 1.3, -18); fx.addShake(6); if (loud) try { A.sfx.lose ? A.sfx.thud() : 0; } catch { /* 무시 */ } break;
    case 'twaUp': fx.text(e.x, e.y - 80, '다시 일어났다!', '#ffe27a', 12, 1.0, -24); fx.ring(e.x, e.y - 20, 10, 60, 0.5, '#ffe27a', 3); break;
    case 'twaHeal': fx.text(e.x, e.y - 74, e.all ? '모두 회복!' : '+회복', '#8cffb0', e.all ? 14 : 11, 0.9, -26); fx.ring(e.x, e.y - 20, 8, e.all ? 120 : 40, 0.5, '#8cffb0', 3); if (loud && e.all) try { A.sfx.heal(); } catch { /* 무시 */ } break;
    case 'twaWind': fx.text(e.x, e.y - 20, `${e.name || '진상'} 기 모으기!`, '#ff6a7a', 14, 1.2, -16); if (loud) try { A.sfx.rumble ? A.sfx.rumble() : A.sfx.boss(); } catch { /* 무시 */ } break;
    case 'twaCut': fx.text(e.x, e.y - 10, '끊었다! 빈틈', '#ffd23f', 16, 1.3, -20); fx.ring(e.x, e.y, 10, 90, 0.5, '#ffd23f', 5); fx.flash('#ffe27a', 0.25); if (loud) try { A.sfx.crit(); } catch { /* 무시 */ } break;
    case 'twaQuake': fx.flash('#ff3040', 0.4); fx.addShake(12); if (loud) try { A.sfx.explode(); } catch { /* 무시 */ } break;
    case 'twaWipe': fx.banner('모두 쓰러졌다…', '멤버 체력이 모두 바닥났다', '#3a0612', 2.2, 'big'); break;
    default: break;
  }
}
