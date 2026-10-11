// 랑방 대전 — 바닥 이펙트 그림 (10/12): Gemini 로 만든 진짜 불꽃 · 룬 · 충격파 · 치유 · 얼음 · 독 · 하트 · 보호막 고리
// 한 번만 받아 두고(게으른 로드), 그림이 없으면 false 를 돌려줘서 예전 그림이 그대로 나온다.
// 바닥 고리는 3:1 납작 타원 + 더하기 섞기('lighter'). 연출 줄이기(body.rm)면 정지 + 불꽃 1장.
const TAU = Math.PI * 2;
const RINGS = { fire: 'fx2_ring_fire', rune: 'fx2_ring_rune', shock: 'fx2_ring_shock', heal: 'fx2_ring_heal', frost: 'fx2_ring_frost', poison: 'fx2_ring_poison', heart: 'fx2_ring_heart', shield: 'fx2_ring_shield' };
const IMG = {};
const ok = (im) => !!(im && im.complete && im.naturalWidth > 0);
export function art(name) { // 그림 한 장 (처음 부르면 받기 시작)
  let im = IMG[name];
  if (!im) { im = IMG[name] = new Image(); im.decoding = 'async'; im.onerror = () => { im._bad = true; }; im.src = `/img/lb/fx/${name}.webp`; }
  return ok(im) ? im : null;
}
const rmOn = () => typeof document !== 'undefined' && !!document.body && document.body.classList.contains('rm');
let frameStamp = 0, frameN = 0;
const room = () => { const t = performance.now(); if (t - frameStamp > 8) { frameStamp = t; frameN = 0; } return ++frameN <= 10; }; // 한 프레임에 열 개까지만

// 바닥 고리 한 장: (x, y) 가운데 · 가로 w · 3:1 납작
export function floorRing(R, kind, x, y, w, o = {}) {
  const im = art(RINGS[kind]); if (!im || !room()) return false;
  const cx = R.cx, rm = rmOn(), now = performance.now() / 1000;
  const aspect = o.aspect || 0.34, rot = rm ? 0 : (o.rot !== undefined ? o.rot : now * (o.spin || 0.5)), a = o.a === undefined ? 1 : o.a;
  const fl = rm ? 1 : 0.9 + 0.1 * Math.sin(now * (o.fl || 9) + (o.ph || 0));
  R.world(); cx.save(); cx.translate(x, y); cx.scale(1, aspect); cx.rotate(rot);
  cx.globalCompositeOperation = o.blend || 'lighter'; cx.globalAlpha = Math.max(0, Math.min(1, a * fl));
  cx.drawImage(im, -w / 2, -w / 2, w, w);
  if (o.two && !rm) { cx.rotate(-rot * 2.3); cx.globalAlpha *= 0.5; cx.drawImage(im, -w * 0.47, -w * 0.47, w * 0.94, w * 0.94); } // 반대로 도는 겹 하나 더
  cx.restore(); cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  return true;
}

// 진짜 불꽃이 둘러선 불 고리: 바닥 고리 + 타원을 따라 선 불꽃 혀 (뒤에서 앞으로) + 불티
export function fireRing(R, x, y, rx, o = {}) {
  const ring = art(RINGS.fire), fl = art('fx2_flames'); if (!ring || !fl) return false;
  const cx = R.cx, rm = rmOn(), now = performance.now() / 1000, a = o.a === undefined ? 1 : o.a, asp = 0.34, ph = o.ph || 0;
  floorRing(R, 'fire', x, y, rx * 2.5, { a: 0.9 * a, spin: 0.35, ph, two: true, aspect: asp });
  const n = Math.max(6, Math.min(rm ? 8 : 14, Math.round(rx / 7))), fw = fl.naturalWidth / 8, fh = fl.naturalHeight, H = Math.min(60, rx * 0.5) * (o.up === undefined ? 1 : o.up);
  const pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * TAU + (rm ? 0 : now * 0.25) + ph; pts.push({ dx: Math.cos(t) * rx * 0.92, dy: Math.sin(t) * rx * 0.92 * asp, i }); }
  pts.sort((p, q) => p.dy - q.dy);
  R.world(); cx.globalCompositeOperation = 'lighter';
  for (const p of pts) {
    const f = rm ? 0 : Math.floor(now * (11 + (p.i % 3) * 2) + p.i * 3) % 8, hg = H * (0.78 + 0.22 * (p.dy / (rx * asp) * 0.5 + 0.5)) * (rm ? 1 : 0.88 + 0.12 * Math.sin(now * 7 + p.i * 1.7)); // 앞쪽(아래)일수록 살짝 크게
    cx.globalAlpha = Math.min(1, a * 0.95);
    cx.drawImage(fl, f * fw, 0, fw, fh, x + p.dx - hg * 0.35, y + p.dy - hg * 0.96, hg * 0.7, hg);
  }
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  if (!rm && o.fx && Math.random() < 0.4 * a) { const p = pts[(Math.random() * pts.length) | 0]; o.fx.part('ember', x + p.dx, y + p.dy - 8, (Math.random() - 0.5) * 24, -70 - Math.random() * 60, 0.6 + Math.random() * 0.4, 1.6, null, { drag: 1.5 }); }
  return true;
}

// 아군 발밑 응원(버프) 고리: 금빛 룬 원 + 위로 떠오르는 빛 알갱이
export function buffRing(R, fxs, x, y, w, o = {}) {
  if (!floorRing(R, 'rune', x, y, w, { a: o.a, spin: 0.45, ph: o.ph, two: false, fl: 5 })) return false;
  if (!rmOn() && fxs && Math.random() < 0.16 * (o.a === undefined ? 1 : o.a)) { const ang = Math.random() * TAU; fxs.part('spark', x + Math.cos(ang) * w * 0.38, y + Math.sin(ang) * w * 0.38 * 0.34 - 4, (Math.random() - 0.5) * 8, -34 - Math.random() * 30, 0.9 + Math.random() * 0.5, 2.2, '#ffe9a0', { drag: 0.5 }); }
  return true;
}

// drawVfx 가 부른다: aura_red / aura_blue → 새 그림. 처리했으면 true
export function drawAura(R, q, x, y, s, a, fxs) {
  const red = q.name === 'aura_red', foot = q.follow ? 20 : 0, w = q.sz * (q.follow ? 1.5 : 1.25) * s;
  const ph = (q.t % 7) || 0;
  if (q.follow) return red ? buffRing(R, fxs, x, y + foot, w, { a, ph }) : floorRing(R, 'shield', x, y + foot, w, { a, ph, spin: 0.3 });
  if (red) return fireRing(R, x, y, w * 0.5, { a, ph, fx: fxs });
  const kind = q.kind || (q.anim === 'pop' ? 'shield' : 'frost');
  return floorRing(R, kind, x, y, w * 1.1, { a, ph, spin: 0.35, two: true });
}

// 퍼지는 큰 고리(fx.ring): 색에 맞는 그림(충격파 · 치유 · 하트 · 얼음/보호막)을 동그랗게 얹는다. 그렸으면 true
const HUE = (c) => { const m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; const v = parseInt(m[1], 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b); if (mx - mn < 40) return 'shield'; let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4; h = (h * 60 + 360) % 360; return h < 70 || h > 340 ? (h > 300 && b > 120 ? 'heart' : 'shock') : h < 170 ? 'heal' : h < 260 ? 'shield' : 'heart'; };
export function ringBurst(R, x, y, rad, p, col, width) {
  if (width < 4 || rad < 50) return false;
  const kind = HUE(col); if (!kind || !art(RINGS[kind]) || !room()) return false;
  const im = art(RINGS[kind]), cx = R.cx, w = rad * 2.5, a = (1 - p) * 0.85;
  cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = a; cx.save(); cx.translate(x, y); if (!rmOn()) cx.rotate(p * 1.6); cx.drawImage(im, -w / 2, -w / 2, w, w); cx.restore();
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  return true;
}

// 쿵! 충격파 고리(vfx shock · shock2): 먼지와 파편이 도는 고리 / 푸른 보호막 고리
export function drawShock(R, q, x, y, s, a) {
  const kind = q.name === 'shock' ? 'shock' : 'shield', im = art(RINGS[kind]); if (!im || !room()) return false;
  const cx = R.cx, w = q.sz * 1.45 * s, k = (performance.now() - q.t) / q.dur;
  R.world(); cx.save(); cx.translate(x, y); if (q.flat) cx.scale(1, 0.45); if (!rmOn()) cx.rotate(k * 2.2);
  cx.globalCompositeOperation = 'lighter'; cx.globalAlpha = Math.max(0, Math.min(1, a)); cx.drawImage(im, -w / 2, -w / 2, w, w); cx.restore();
  cx.globalCompositeOperation = 'source-over'; cx.globalAlpha = 1;
  return true;
}

// 집합 깃발 (방장): 천이 바람에 일렁이는 깃발 + 바닥 그림자 · 아래로 갈수록 크게 흔들린다
export function drawBanner(R, img, x, y, sz, a, s) {
  if (!img || !room()) return false;
  const cx = R.cx, rm = rmOn(), now = performance.now() / 1000, w = sz * s, h = w * (img.naturalHeight / img.naturalWidth), N = 28, sh = img.naturalHeight / N;
  R.world(); cx.globalAlpha = Math.max(0, Math.min(1, a));
  cx.save(); cx.translate(x, y + h * 0.5 - 4); cx.scale(1, 0.3); cx.fillStyle = 'rgba(0,0,0,0.35)'; cx.beginPath(); cx.arc(0, 0, w * 0.22, 0, TAU); cx.fill(); cx.restore(); // 바닥 그림자
  for (let i = 0; i < N; i++) {
    const v = i / (N - 1), cloth = Math.sin(Math.max(0, Math.min(1, (v - 0.16) / 0.58)) * Math.PI), dx = rm ? 0 : Math.sin(now * 4.2 - v * 5.5) * w * 0.032 * cloth * (0.4 + v);
    cx.drawImage(img, 0, i * sh, img.naturalWidth, sh + 0.6, x - w / 2 + dx, y - h / 2 + (i / N) * h, w, h / N + 0.6);
  }
  cx.globalAlpha = 1;
  return true;
}
